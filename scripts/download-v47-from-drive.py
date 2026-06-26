#!/usr/bin/env python3
"""Download the V4.7 backup tarball from Google Drive to restore the mockup files."""
from __future__ import annotations
import json
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

PROJECT = Path("/home/z/my-project")
SCRIPTS = PROJECT / "scripts"
DOWNLOAD = PROJECT / "download"
TOKEN_PATH = SCRIPTS / ".gdrive-token.json"
OUT_TAR = DOWNLOAD / "aisalon-massapro-V4.7.tar.gz"

# V4.7 tarball file ID (from previous turn's deploy log)
FILE_ID = "1W5ihSw7PimshQdaIxX6mCxvtFdY7TAc-"

CLIENT_ID = "GOOGLE_CLIENT_ID_REDACTED"
CLIENT_SECRET = "GOOGLE_OAUTH_SECRET_REDACTED"


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


def main():
    DOWNLOAD.mkdir(parents=True, exist_ok=True)
    token = json.loads(TOKEN_PATH.read_text())
    refresh_token = token.get("refresh_token")
    if not refresh_token:
        print("[ERR] no refresh_token in saved token", file=sys.stderr)
        sys.exit(1)
    print("[INFO] refreshing access token...")
    new_access = refresh_access_token(refresh_token)
    access_token = new_access["access_token"]

    # Get file metadata first to confirm it exists
    meta_url = f"https://www.googleapis.com/drive/v3/files/{FILE_ID}?fields=id,name,size,mimeType"
    req = urllib.request.Request(meta_url, headers={"Authorization": f"Bearer {access_token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            meta = json.loads(resp.read())
        print(f"[OK] file found: {meta.get('name')} ({int(meta.get('size', 0)):,} bytes)")
    except urllib.error.HTTPError as e:
        print(f"[ERR] could not find file {FILE_ID}: {e.code} {e.read().decode(errors='replace')}", file=sys.stderr)
        sys.exit(1)

    # Download the file
    dl_url = f"https://www.googleapis.com/drive/v3/files/{FILE_ID}?alt=media"
    req = urllib.request.Request(dl_url, headers={"Authorization": f"Bearer {access_token}"})
    print(f"[INFO] downloading to {OUT_TAR}...")
    with urllib.request.urlopen(req, timeout=120) as resp, OUT_TAR.open("wb") as f:
        total = 0
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
            print(f"   [{total / 1024 / 1024:.1f} MB]")
    print(f"[OK] downloaded: {OUT_TAR} ({OUT_TAR.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
