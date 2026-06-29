#!/usr/bin/env python3
"""
Google Drive OAuth helper for the AI Salon backup project.

Re-authenticate the Drive connection (the persisted token at
scripts/.gdrive-token.json was lost in the V4.x rollback).

Two-step flow:
  1. `python3 scripts/google-drive-upload.py --auth-url`
       prints a URL to open in a browser.
  2. After authorizing, Google redirects to localhost:8000/?code=...
       Copy the FULL redirected URL (or just the ?code=... part) and run:
     `python3 scripts/google-drive-upload.py --exchange '<redirected-url-or-code>'`
       This exchanges the auth code for a refresh_token and saves it
       to scripts/.gdrive-token.json (long-lived, no re-consent needed).

Once the token is saved, download-v47-from-drive.py can use it.
"""
from __future__ import annotations
import json
import os
import sys
import urllib.parse
import urllib.request
import urllib.error
import http.server
import threading
from pathlib import Path

PROJECT = Path("/home/z/my-project")
SCRIPTS = PROJECT / "scripts"
TOKEN_PATH = SCRIPTS / ".gdrive-token.json"

CLIENT_ID = os.environ.get("GDRIVE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GDRIVE_CLIENT_SECRET", "")
if not CLIENT_ID or not CLIENT_SECRET:
    print("[ERR] GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET env vars are required.",
          file=sys.stderr)
    print("[ERR] Put them in /home/z/my-project/.env (gitignored) and run:",
          file=sys.stderr)
    print("[ERR]   set -a && . .env && set +a", file=sys.stderr)
    sys.exit(1)

# localhost:8000 is registered as an authorized redirect URI in Google Cloud Console
REDIRECT_URI = "http://localhost:8000"

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
]


def build_auth_url() -> str:
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",  # force consent so we get a new refresh_token
    }
    return "https://accounts.google.com/o/oauth2/auth?" + urllib.parse.urlencode(params)


def exchange_code(auth_code: str) -> dict:
    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": auth_code,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Token exchange failed: {e.code} {body}") from None


def parse_code_from_input(arg: str) -> str:
    """User might paste either the raw code, or the full redirected URL."""
    arg = arg.strip()
    if arg.startswith("http"):
        parsed = urllib.parse.urlparse(arg)
        qs = urllib.parse.parse_qs(parsed.query)
        codes = qs.get("code", [])
        if not codes:
            raise ValueError(f"No ?code= param found in URL: {arg}")
        return codes[0]
    # Raw code — strip any leading 'code=' prefix if present
    if arg.startswith("code="):
        arg = arg[len("code="):]
    return arg


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    flag = sys.argv[1]
    if flag == "--auth-url":
        url = build_auth_url()
        print()
        print("Open this URL in your browser to authorize Google Drive access:")
        print()
        print(url)
        print()
        print("After authorizing, you will be redirected to http://localhost:8000/?code=...")
        print("(that page will fail to load — that's OK, just copy the URL from the address bar)")
        print()
        print("Then run:")
        print(f"  python3 scripts/google-drive-upload.py --exchange '<redirected-url-or-code>'")
        print()
        # Also start a tiny local server to capture the redirect automatically,
        # in case the user's browser actually hits localhost:8000
        print("[INFO] also starting a local listener on :8000 to capture the code automatically...")
        print("[INFO] if it captures the code, the token will be saved and you can stop this script.")
        start_local_listener(timeout=300)
        return

    if flag == "--exchange":
        if len(sys.argv) < 3:
            print("[ERR] usage: --exchange '<redirected-url-or-code>'", file=sys.stderr)
            sys.exit(1)
        raw = sys.argv[2]
        code = parse_code_from_input(raw)
        print(f"[INFO] exchanging code (len={len(code)}) for refresh token...")
        token = exchange_code(code)
        if not token.get("refresh_token"):
            print("[ERR] token response has no refresh_token. Try --auth-url again with prompt=consent.", file=sys.stderr)
            print(f"[DEBUG] response: {token}", file=sys.stderr)
            sys.exit(1)
        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_PATH.write_text(json.dumps(token, indent=2))
        TOKEN_PATH.chmod(0o600)
        print(f"[OK] token saved to {TOKEN_PATH}")
        print(f"[OK] refresh_token: {token['refresh_token'][:20]}... (truncated)")
        print(f"[OK] expires_in: {token.get('expires_in')}s")
        return

    print(f"[ERR] unknown flag: {flag}", file=sys.stderr)
    print(__doc__)
    sys.exit(1)


# ---- Local listener to auto-capture the redirect ----

CAPTURED_CODE = {"code": None}

class CodeHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        codes = qs.get("code", [])
        if codes:
            CAPTURED_CODE["code"] = codes[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<html><body><h2>Authorization code captured.</h2><p>You can close this tab and return to the terminal.</p></body></html>")
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"no code")
    def log_message(self, format, *args):
        pass  # silence


def start_local_listener(timeout: int = 300):
    server = http.server.HTTPServer(("127.0.0.1", 8000), CodeHandler)
    server.timeout = 2
    deadline = __import__("time").time() + timeout
    print(f"[INFO] listening on http://localhost:8000 (will auto-exchange if browser hits it)")
    while __import__("time").time() < deadline:
        server.handle_request()
        if CAPTURED_CODE["code"]:
            print(f"[OK] captured auth code from browser redirect")
            code = CAPTURED_CODE["code"]
            try:
                token = exchange_code(code)
                if token.get("refresh_token"):
                    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
                    TOKEN_PATH.write_text(json.dumps(token, indent=2))
                    TOKEN_PATH.chmod(0o600)
                    print(f"[OK] token saved to {TOKEN_PATH}")
                    print(f"[OK] refresh_token: {token['refresh_token'][:20]}... (truncated)")
                    return
                else:
                    print(f"[ERR] no refresh_token in response: {token}", file=sys.stderr)
            except Exception as e:
                print(f"[ERR] exchange failed: {e}", file=sys.stderr)
            return
    print("[INFO] local listener timed out — paste the URL manually with --exchange")


if __name__ == "__main__":
    main()
