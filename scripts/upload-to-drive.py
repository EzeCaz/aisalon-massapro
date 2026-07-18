#!/usr/bin/env python3
"""
scripts/upload-to-drive.py
──────────────────────────
Upload files (e.g. project backup zips) to a Google Drive folder
using OAuth (the user's own Google account, via a Client ID + Secret).

DESIGNED FOR HEADLESS USE
─────────────────────────
This script does NOT use a local HTTP server for the OAuth callback
(that doesn't work when the script runs on a remote server and the
user is in a browser on a different machine). Instead, it uses a
two-phase manual flow:

  Phase 1 — get the auth URL:
      python3 scripts/upload-to-drive.py --auth-url
      → prints a URL. The user opens it in their browser, authorizes,
        and Google redirects them to http://localhost/?code=XXXXX.
        The browser shows "connection refused" but the URL bar
        contains the code. The user copies the code (or the full
        redirect URL) and pastes it back.

  Phase 2 — exchange code + upload:
      python3 scripts/upload-to-drive.py --code "4/0Aan..." download/file1.zip download/file2.zip
      → exchanges the code for tokens (saved to .gdrive-token.json
        for future runs), then uploads each file to the Drive folder.

  Subsequent runs (token already saved):
      python3 scripts/upload-to-drive.py download/new-backup.zip
      → uses the saved refresh token, no browser needed.

ONE-TIME SETUP
──────────────
1. GCP Console → APIs & Services → Library → enable "Google Drive API".
2. GCP Console → APIs & Services → OAuth consent screen → configure
   with your Google account as a Test User.
3. GCP Console → APIs & Services → Credentials → Create Credentials →
   OAuth client ID → Application type: "Desktop app".
4. Copy the Client ID (xxxxx.apps.googleusercontent.com) AND the
   Client Secret (GOCSPX-...) into .env:
       GDRIVE_FOLDER_ID=<folder ID from the Drive URL>
       GDRIVE_CLIENT_ID=xxxxx.apps.googleusercontent.com
       GDRIVE_CLIENT_SECRET=GOCSPX-...
5. In the OAuth client settings, add `http://localhost` as an
   Authorized Redirect URI (it's usually pre-added for Desktop apps).

Files with the same name already in the Drive folder are REPLACED
(preserves file ID + version history).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"
TOKEN_FILE = PROJECT_ROOT / ".gdrive-token.json"

SCOPES = ["https://www.googleapis.com/auth/drive"]


def load_env(path: Path) -> None:
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
        if k not in os.environ:
            os.environ[k] = v


def get_oauth_flow(client_id: str, client_secret: str):
    from google_auth_oauthlib.flow import InstalledAppFlow

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost", "http://localhost:8080", "urn:ietf:wg:oauth:2.0:oob"],
        }
    }
    return InstalledAppFlow.from_client_config(client_config, SCOPES)


def get_credentials():
    """Load saved refresh token if present; otherwise return None."""
    client_id = os.environ.get("GDRIVE_CLIENT_ID")
    client_secret = os.environ.get("GDRIVE_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("[upload-to-drive] ERROR: GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET not set in .env", file=sys.stderr)
        print("[upload-to-drive] Edit .env and add:", file=sys.stderr)
        print("[upload-to-drive]   GDRIVE_CLIENT_ID=xxxxx.apps.googleusercontent.com", file=sys.stderr)
        print("[upload-to-drive]   GDRIVE_CLIENT_SECRET=GOCSPX-...", file=sys.stderr)
        sys.exit(2)

    if TOKEN_FILE.exists():
        try:
            from google.oauth2.credentials import Credentials
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
            if creds and creds.refresh_token:
                from google.auth.transport.requests import Request
                creds.refresh(Request())
                TOKEN_FILE.write_text(creds.to_json())
                print(f"[upload-to-drive] using saved token from {TOKEN_FILE}")
                return creds
        except Exception as e:
            print(f"[upload-to-drive] saved token invalid ({e}); will need new OAuth flow.", file=sys.stderr)
    return None


def save_credentials(creds):
    TOKEN_FILE.write_text(creds.to_json())
    os.chmod(TOKEN_FILE, 0o600)
    print(f"[upload-to-drive] token saved to {TOKEN_FILE}")


def cmd_auth_url():
    """Phase 1: print the OAuth authorization URL."""
    client_id = os.environ.get("GDRIVE_CLIENT_ID")
    client_secret = os.environ.get("GDRIVE_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("[upload-to-drive] ERROR: GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET not set in .env", file=sys.stderr)
        return 2

    flow = get_oauth_flow(client_id, client_secret)
    # Use http://localhost as the redirect — Google will redirect the
    # user's browser there with ?code=XXX. The browser will show
    # "connection refused" but the URL bar contains the code.
    flow.redirect_uri = "http://localhost"
    auth_url, _ = flow.authorization_url(
        prompt="consent",
        access_type="offline",
    )
    print("=" * 80)
    print("OPEN THIS URL IN YOUR BROWSER AND AUTHORIZE:")
    print()
    print(auth_url)
    print()
    print("After authorizing, your browser will be redirected to a URL like:")
    print("  http://localhost/?code=4/0Aan...&scope=...")
    print("The browser will show 'connection refused' — that's expected.")
    print("Copy the FULL redirect URL from your browser's address bar and")
    print("paste it back, then run:")
    print()
    print(f"  python3 scripts/upload-to-drive.py --code '<full-redirect-url>' <files...>")
    print("=" * 80)
    return 0


def cmd_exchange_and_upload(code_or_url: str, files: list[Path]) -> int:
    """Phase 2: exchange the auth code for tokens, then upload files."""
    client_id = os.environ.get("GDRIVE_CLIENT_ID")
    client_secret = os.environ.get("GDRIVE_CLIENT_SECRET")
    folder_id = os.environ.get("GDRIVE_FOLDER_ID")
    if not (client_id and client_secret and folder_id):
        print("[upload-to-drive] ERROR: GDRIVE_FOLDER_ID / CLIENT_ID / CLIENT_SECRET not all set in .env", file=sys.stderr)
        return 2

    # The user might paste either the bare code OR the full redirect URL.
    # Extract the code from the URL if needed.
    code = code_or_url
    if code_or_url.startswith("http"):
        parsed = urlparse(code_or_url)
        qs = parse_qs(parsed.query)
        if "code" in qs:
            code = qs["code"][0]
        elif "code" in parse_qs(parsed.fragment):
            code = parse_qs(parsed.fragment)["code"][0]
        else:
            print(f"[upload-to-drive] ERROR: could not find 'code' in URL: {code_or_url}", file=sys.stderr)
            return 2

    flow = get_oauth_flow(client_id, client_secret)
    flow.redirect_uri = "http://localhost"
    try:
        # exchange_code_for_token is sync; it hits Google's token endpoint.
        flow.fetch_token(code=code)
        creds = flow.credentials
    except Exception as e:
        print(f"[upload-to-drive] ERROR exchanging code for token: {e}", file=sys.stderr)
        return 2

    if not creds.refresh_token:
        print("[upload-to-drive] WARNING: no refresh_token in response. You may need to", file=sys.stderr)
        print("[upload-to-drive]          revoke access at https://myaccount.google.com/permissions", file=sys.stderr)
        print("[upload-to-drive]          and re-run --auth-url with prompt=consent.", file=sys.stderr)
    save_credentials(creds)

    return do_upload(creds, files, folder_id)


def do_upload(creds, files: list[Path], folder_id: str) -> int:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    print(f"[upload-to-drive] uploading {len(files)} file(s) to Drive folder {folder_id}/ ...")
    for local_path in files:
        remote_name = local_path.name
        size_mb = local_path.stat().st_size / (1024 * 1024)
        print(f"[upload-to-drive] → {remote_name}  ({size_mb:.1f} MB)")

        # Check if file with same name already exists in the folder.
        q = f"name='{remote_name}' and trashed=false and '{folder_id}' in parents"
        existing = (
            service.files()
            .list(q=q, fields="files(id,name)", pageSize=1)
            .execute()
            .get("files", [])
        )

        media = MediaFileUpload(
            str(local_path),
            mimetype="application/zip",
            resumable=True,
        )

        if existing:
            file_id = existing[0]["id"]
            service.files().update(
                fileId=file_id,
                body={"name": remote_name},
                media_body=media,
                fields="id",
            ).execute()
            print(f"[upload-to-drive]   ✓ updated  (file id {file_id})")
        else:
            body = {"name": remote_name, "parents": [folder_id]}
            created = (
                service.files()
                .create(body=body, media_body=media, fields="id")
                .execute()
            )
            print(f"[upload-to-drive]   ✓ uploaded (file id {created['id']})")

    print(f"[upload-to-drive] OK — {len(files)} file(s) synced to Drive folder {folder_id}")
    return 0


def do_list(creds, folder_id: str) -> int:
    """List all files in the Drive folder."""
    from googleapiclient.discovery import build
    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    q = f"trashed=false and '{folder_id}' in parents"
    results = (
        service.files()
        .list(
            q=q,
            fields="files(id, name, size, modifiedTime)",
            orderBy="modifiedTime desc",
            pageSize=200,
        )
        .execute()
    )
    files = results.get("files", [])
    print(f"[upload-to-drive] {len(files)} file(s) in folder {folder_id}:")
    for f in files:
        size_mb = int(f.get("size", 0)) / (1024 * 1024)
        print(f"  {f['name']}")
        print(f"    id={f['id']}  size={size_mb:.1f}MB  modified={f.get('modifiedTime', '?')}")
    return 0


def do_delete(creds, file_ids: list[str]) -> int:
    """Delete one or more files from Drive by their IDs."""
    from googleapiclient.discovery import build
    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    for fid in file_ids:
        try:
            service.files().delete(fileId=fid).execute()
            print(f"[upload-to-drive] ✓ deleted  (file id {fid})")
        except Exception as e:
            print(f"[upload-to-drive] ✗ failed  (file id {fid}): {e}", file=sys.stderr)
    return 0


def main() -> int:
    load_env(ENV_FILE)

    # Parse args.
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    # Phase 1: --auth-url
    if sys.argv[1] == "--auth-url":
        return cmd_auth_url()

    # --list: list files in the Drive folder
    if sys.argv[1] == "--list":
        creds = get_credentials()
        if not creds:
            print("[upload-to-drive] no saved token. Run with --auth-url first.", file=sys.stderr)
            return 2
        folder_id = os.environ.get("GDRIVE_FOLDER_ID")
        if not folder_id:
            print("[upload-to-drive] ERROR: GDRIVE_FOLDER_ID not set in .env", file=sys.stderr)
            return 2
        return do_list(creds, folder_id)

    # --delete <file_id> [<file_id> ...]: delete files from Drive
    if sys.argv[1] == "--delete":
        if len(sys.argv) < 3:
            print("[upload-to-drive] usage: upload-to-drive.py --delete <file_id> [<file_id> ...]", file=sys.stderr)
            return 2
        creds = get_credentials()
        if not creds:
            print("[upload-to-drive] no saved token. Run with --auth-url first.", file=sys.stderr)
            return 2
        return do_delete(creds, sys.argv[2:])

    # Phase 2: --code <code-or-url> <files...>
    if sys.argv[1] == "--code":
        if len(sys.argv) < 4:
            print("[upload-to-drive] usage: upload-to-drive.py --code '<code-or-url>' <file1> [file2] ...", file=sys.stderr)
            return 2
        code_or_url = sys.argv[2]
        files: list[Path] = []
        for arg in sys.argv[3:]:
            p = Path(arg)
            if not p.is_absolute():
                p = PROJECT_ROOT / p
            if not p.exists():
                print(f"[upload-to-drive] skip (not found): {p}", file=sys.stderr)
                continue
            files.append(p)
        if not files:
            print("[upload-to-drive] no files to upload.", file=sys.stderr)
            return 1
        return cmd_exchange_and_upload(code_or_url, files)

    # Phase 3 (subsequent runs): just files, use saved token.
    creds = get_credentials()
    if not creds:
        print("[upload-to-drive] no saved token. Run with --auth-url first.", file=sys.stderr)
        return 2

    folder_id = os.environ.get("GDRIVE_FOLDER_ID")
    if not folder_id:
        print("[upload-to-drive] ERROR: GDRIVE_FOLDER_ID not set in .env", file=sys.stderr)
        return 2

    files = []
    for arg in sys.argv[1:]:
        p = Path(arg)
        if not p.is_absolute():
            p = PROJECT_ROOT / p
        if not p.exists():
            print(f"[upload-to-drive] skip (not found): {p}", file=sys.stderr)
            continue
        files.append(p)
    if not files:
        print("[upload-to-drive] no files to upload.", file=sys.stderr)
        return 1
    return do_upload(creds, files, folder_id)


if __name__ == "__main__":
    sys.exit(main())
