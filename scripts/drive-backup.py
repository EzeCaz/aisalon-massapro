#!/usr/bin/env /usr/bin/python3
"""
scripts/drive-backup.py
───────────────────────
Upload the latest DB backup (and every file under download/backups/)
to Google Drive using a Service Account.

WHY A SERVICE ACCOUNT (vs. rclone OAuth)
─────────────────────────────────────────
The rclone OAuth flow requires a browser, which doesn't work in a
headless dev environment. A Google Service Account authenticates
with a JSON key file — no browser, no token refresh, perfect for
cron jobs.

ONE-TIME SETUP (5 minutes)
──────────────────────────
1. Open https://console.cloud.google.com/ → pick or create a project.
2. APIs & Services → Library → enable "Google Drive API".
3. APIs & Services → Credentials → Create Credentials →
   Service Account → name it "aisalon-backup" → Done.
4. Click the new service account → KEYS tab → Add Key →
   Create new key → JSON. A JSON file downloads — save it as:
       /home/z/my-project/.gcp-service-account.json
   (chmod 600 it.)
5. Create a folder on your PERSONAL Google Drive (e.g. "AI Salon Backups").
   Copy its ID from the URL — the long string after `/folders/` in:
       https://drive.google.com/drive/folders/<THIS_PART>
6. SHARE that folder with the service account's email address
   (looks like aisalon-backup@<project>.iam.gserviceaccount.com)
   as an Editor. (Service accounts can only see folders explicitly
   shared with them.)
7. Add to .env:
       GDRIVE_FOLDER_ID=<the folder ID from step 5>
       GCP_SERVICE_ACCOUNT_PATH=/home/z/my-project/.gcp-service-account.json

USAGE
─────
    python3 scripts/drive-backup.py            # upload everything in download/backups/
    python3 scripts/drive-backup.py --latest   # upload only db-latest.json.gz

RUN NIGHTLY (cron)
──────────────────
    0 3 * * *  cd /home/z/my-project && ./scripts/db-backup.sh && python3 scripts/drive-backup.py >> .dev-server.log 2>&1
"""

from __future__ import annotations

import os
import sys
import json
import mimetypes
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"
BACKUP_DIR = PROJECT_ROOT / "download" / "backups"


def load_env(path: Path) -> None:
    """Load KEY=value lines from .env into os.environ (without clobbering
    existing env vars — so the shell can override)."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
            v = v[1:-1]
        k = k.strip()
        if k not in os.environ:  # don't clobber shell env
            os.environ[k] = v


def get_credentials():
    """Build a google-auth Credentials object from the service account JSON."""
    sa_path = os.environ.get(
        "GCP_SERVICE_ACCOUNT_PATH",
        str(PROJECT_ROOT / ".gcp-service-account.json"),
    )
    sa_file = Path(sa_path)
    if not sa_file.exists():
        print(f"[drive-backup] ERROR: service account file not found at {sa_file}", file=sys.stderr)
        print("[drive-backup] See the docstring at the top of this file for setup instructions.", file=sys.stderr)
        sys.exit(2)

    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
    except ImportError:
        print("[drive-backup] ERROR: google-auth + google-api-python-client not installed.", file=sys.stderr)
        print("[drive-backup] Run:  pip install google-auth google-auth-oauthlib google-api-python-client", file=sys.stderr)
        sys.exit(2)

    scopes = ["https://www.googleapis.com/auth/drive.file"]
    creds = service_account.Credentials.from_service_account_file(
        str(sa_file), scopes=scopes
    )
    creds.refresh(Request())
    return creds


def get_drive_service():
    creds = get_credentials()
    from googleapiclient.discovery import build
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def find_or_create_folder(service, name: str, parent_id: str | None = None) -> str:
    """Find a folder by name under parent_id (or root if None). Create if missing."""
    q = "mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    else:
        q += " and 'root' in parents"
    resp = (
        service.files()
        .list(q=q, fields="files(id,name)", pageSize=10)
        .execute()
    )
    for f in resp.get("files", []):
        if f["name"] == name:
            return f["id"]
    # Create it
    body = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        body["parents"] = [parent_id]
    created = service.files().create(body=body, fields="id").execute()
    return created["id"]


def upload_file(service, local_path: Path, remote_name: str, parent_folder_id: str) -> str:
    """Upload (or replace) a file in the given Drive folder. Returns the file ID."""
    # Check if a file with the same name already exists in the folder.
    q = (
        f"name='{remote_name}' and trashed=false and '{parent_folder_id}' in parents"
    )
    existing = (
        service.files()
        .list(q=q, fields="files(id,name)", pageSize=1)
        .execute()
        .get("files", [])
    )

    media = googleapiclient_http_media(local_path)
    body = {"name": remote_name}
    if existing:
        # Replace existing file (preserves the file ID, version history).
        file_id = existing[0]["id"]
        service.files().update(
            fileId=file_id, body=body, media_body=media, fields="id"
        ).execute()
        print(f"[drive-backup] updated  {remote_name}  (file id {file_id})")
        return file_id
    else:
        body["parents"] = [parent_folder_id]
        created = (
            service.files()
            .create(body=body, media_body=media, fields="id")
            .execute()
        )
        print(f"[drive-backup] uploaded {remote_name}  (file id {created['id']})")
        return created["id"]


def googleapiclient_http_media(local_path: Path):
    """Build a MediaFileUpload, imported lazily so the script can run
    even if google-api-python-client isn't installed (we'll error out
    earlier in get_drive_service)."""
    from googleapiclient.http import MediaFileUpload
    mime, _ = mimetypes.guess_type(str(local_path))
    return MediaFileUpload(str(local_path), mimetype=mime or "application/octet-stream", resumable=True)


def main() -> int:
    load_env(ENV_FILE)

    folder_id = os.environ.get("GDRIVE_FOLDER_ID")
    if not folder_id:
        print("[drive-backup] ERROR: GDRIVE_FOLDER_ID not set in .env", file=sys.stderr)
        print("[drive-backup] See the docstring at the top of this file for setup instructions.", file=sys.stderr)
        return 2

    if not BACKUP_DIR.exists() or not any(BACKUP_DIR.iterdir()):
        print(f"[drive-backup] No backups in {BACKUP_DIR} — run scripts/db-backup.sh first.")
        return 1

    only_latest = "--latest" in sys.argv

    service = get_drive_service()

    # Upload into a subfolder named "db" inside the user-provided folder,
    # so we can later add other backup types (e.g. code, images) without
    # polluting the root.
    db_folder_id = find_or_create_folder(service, "db", parent_id=folder_id)
    print(f"[drive-backup] using Drive folder: {folder_id}/db/  (id {db_folder_id})")

    # Pick files to upload.
    if only_latest:
        files_to_upload = [BACKUP_DIR / "db-latest.json.gz"] if (BACKUP_DIR / "db-latest.json.gz").exists() else []
        # Also re-upload the timestamped file the symlink points to.
        symlink_target = BACKUP_DIR / "db-latest.json.gz"
        if symlink_target.is_symlink():
            real = symlink_target.resolve()
            if real.exists():
                files_to_upload = [real]
    else:
        files_to_upload = sorted(
            p for p in BACKUP_DIR.iterdir()
            if p.is_file() and p.name.startswith("db-") and p.name.endswith(".json.gz")
        )

    if not files_to_upload:
        print("[drive-backup] No .json.gz files to upload.")
        return 0

    print(f"[drive-backup] uploading {len(files_to_upload)} file(s) to Google Drive ...")
    for f in files_to_upload:
        upload_file(service, f, remote_name=f.name, parent_folder_id=db_folder_id)

    print(f"[drive-backup] OK — {len(files_to_upload)} file(s) synced to Drive folder {folder_id}/db/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
