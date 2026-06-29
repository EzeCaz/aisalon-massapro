#!/usr/bin/env python3
"""
Upload the AISalon backup tarballs to a specific Google Drive folder.

Usage:
  python3 scripts/upload-backup-to-drive.py                          # upload all V5.* tarballs in download/
  python3 scripts/upload-backup-to-drive.py download/aisalon-massapro-V5.3.1-20260628-133828.tar.gz   # upload a specific file

Prereq: scripts/.gdrive-token.json must exist (run google-drive-upload.py --auth-url first).

Target Drive folder:
  https://drive.google.com/drive/u/1/folders/19fJYP9rwNTwWTJNi-tXCUoyg8oeylHMj
"""
from __future__ import annotations
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
import mimetypes
from pathlib import Path

PROJECT = Path("/home/z/my-project")
SCRIPTS = PROJECT / "scripts"
DOWNLOAD = PROJECT / "download"
TOKEN_PATH = SCRIPTS / ".gdrive-token.json"

# Target Drive folder ID — read from env (GDRIVE_FOLDER_ID) with a default
# pointing at the AI Salon backup folder. Override via env if you need to
# upload to a different folder.
DRIVE_FOLDER_ID = os.environ.get(
    "GDRIVE_FOLDER_ID", "19fJYP9rwNTwWTJNi-tXCUoyg8oeylHMj"
)

# OAuth credentials — read from env (GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET).
# Do NOT hardcode secrets in this file (GitHub secret scanner will block the
# push). Either:
#   1. Export them in your shell (e.g. in ~/.bashrc):
#        export GDRIVE_CLIENT_ID="..."
#        export GDRIVE_CLIENT_SECRET="..."
#   2. Or put them in /home/z/my-project/.env (gitignored) and source it
#      before running:
#        set -a && . .env && set +a
#        python3 scripts/upload-backup-to-drive.py ...
CLIENT_ID = os.environ.get("GDRIVE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GDRIVE_CLIENT_SECRET", "")
if not CLIENT_ID or not CLIENT_SECRET:
    print("[ERR] GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET env vars are required.",
          file=sys.stderr)
    print("[ERR] Put them in /home/z/my-project/.env (gitignored) and run:",
          file=sys.stderr)
    print("[ERR]   set -a && . .env && set +a", file=sys.stderr)
    sys.exit(1)


def refresh_access_token(refresh_token: str) -> dict:
    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def get_access_token() -> str:
    if not TOKEN_PATH.exists():
        print(f"[ERR] token not found at {TOKEN_PATH}", file=sys.stderr)
        print("[ERR] run: python3 scripts/google-drive-upload.py --auth-url", file=sys.stderr)
        sys.exit(1)
    token = json.loads(TOKEN_PATH.read_text())
    refresh_token = token.get("refresh_token")
    if not refresh_token:
        print("[ERR] no refresh_token in saved token", file=sys.stderr)
        sys.exit(1)
    print("[INFO] refreshing access token...")
    new_access = refresh_access_token(refresh_token)
    return new_access["access_token"]


def list_existing_files(access_token: str) -> dict:
    """List files in the target Drive folder so we can skip re-uploading ones that already exist.
    Returns {file_name: file_id}."""
    url = (
        "https://www.googleapis.com/drive/v3/files"
        "?q=" + urllib.parse.quote(f"'{DRIVE_FOLDER_ID}' in parents and trashed=false")
        + "&fields=files(id,name,size)&pageSize=200"
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {access_token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        return {f["name"]: f["id"] for f in data.get("files", [])}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        print(f"[WARN] could not list folder contents: {e.code} {body}", file=sys.stderr)
        return {}


def upload_file(access_token: str, local_path: Path, existing_file_id: str | None = None) -> str:
    """Upload a file to the target Drive folder. If existing_file_id is provided, update the
    existing file instead of creating a new one (resumable upload via Drive v3 multipart)."""
    file_size = local_path.stat().st_size
    print(f"[INFO] uploading {local_path.name} ({file_size:,} bytes)...")

    # Use the Drive v3 multipart upload (metadata + media in a single multipart/related request).
    # This works for files up to ~100MB without needing the resumable protocol.
    boundary = "----AISalonBackupBoundary" + str(int(time.time() * 1000))
    metadata: dict = {
        "name": local_path.name,
        "parents": [DRIVE_FOLDER_ID],
    }
    if existing_file_id:
        # Adding new revision to existing file — use PATCH-style upload via the upload endpoint
        # with the file ID. We do NOT pass parents (file already in folder).
        metadata = {"name": local_path.name}
        upload_url = f"https://www.googleapis.com/upload/drive/v3/files/{existing_file_id}?uploadType=multipart&fields=id,name,size"
    else:
        upload_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size"

    mime = "application/gzip"
    meta_part = (
        f"--{boundary}\r\n"
        "Content-Type: application/json; charset=UTF-8\r\n\r\n"
        + json.dumps(metadata)
        + "\r\n"
    ).encode("utf-8")
    media_header = (
        f"--{boundary}\r\n"
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8")
    media_footer = f"\r\n--{boundary}--\r\n".encode("utf-8")

    body_len = len(meta_part) + len(media_header) + file_size + len(media_footer)

    req = urllib.request.Request(
        upload_url,
        method="PATCH" if existing_file_id else "POST",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": f"multipart/related; boundary={boundary}",
            "Content-Length": str(body_len),
        },
        data=None,  # we'll stream the body
    )

    # Stream the file into the request body
    def body_iter():
        yield meta_part
        yield media_header
        with local_path.open("rb") as f:
            while True:
                chunk = f.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                yield chunk
        yield media_footer

    # urllib.request.Request wants bytes for data, but we can pass a generator
    # if we use a custom approach: build the request with a file-like object.
    class _StreamBody:
        def __init__(self, it):
            self._it = iter(it)
            self._buf = b""
        def read(self, n):
            while len(self._buf) < n:
                try:
                    self._buf += next(self._it)
                except StopIteration:
                    break
            out, self._buf = self._buf[:n], self._buf[n:]
            return out
        def __len__(self):
            return body_len

    req.data = _StreamBody(body_iter())

    with urllib.request.urlopen(req, timeout=600) as resp:
        result = json.loads(resp.read())
    print(f"[OK] uploaded: {result.get('name')} (Drive file id: {result.get('id')})")
    return result["id"]


def main():
    # Decide which files to upload
    if len(sys.argv) > 1:
        files_to_upload = [Path(p) for p in sys.argv[1:]]
    else:
        # Default: upload all V5.* tarballs in download/
        files_to_upload = sorted(DOWNLOAD.glob("aisalon-massapro-V5.*.tar.gz"))
    if not files_to_upload:
        print("[ERR] no backup files to upload", file=sys.stderr)
        sys.exit(1)

    access_token = get_access_token()
    print(f"[INFO] target Drive folder: https://drive.google.com/drive/folders/{DRIVE_FOLDER_ID}")

    existing = list_existing_files(access_token)
    if existing:
        print(f"[INFO] found {len(existing)} existing file(s) in the folder:")
        for name in sorted(existing):
            print(f"       - {name}")
    else:
        print("[INFO] folder is empty (or we couldn't list contents)")

    print()
    for path in files_to_upload:
        if not path.exists():
            print(f"[ERR] file not found: {path}", file=sys.stderr)
            continue
        existing_id = existing.get(path.name)
        if existing_id:
            print(f"[INFO] {path.name} already exists in Drive (id={existing_id}) — updating in place...")
        try:
            upload_file(access_token, path, existing_id)
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            print(f"[ERR] upload failed for {path.name}: {e.code} {body}", file=sys.stderr)
        except Exception as e:
            print(f"[ERR] upload failed for {path.name}: {e}", file=sys.stderr)
    print()
    print("[DONE] all uploads attempted. Check the Drive folder:")


if __name__ == "__main__":
    main()
