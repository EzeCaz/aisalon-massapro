#!/usr/bin/env python3
"""Log into a Vercel deployment as eze@massapro.com and fetch /admin/mockups.

Usage: python3 scripts/fetch-deployment-mockups.py <deployment_url>
"""
import sys
import json
import re
import urllib.request
import urllib.parse
import http.cookiejar

DEPLOYMENT_URL = sys.argv[1] if len(sys.argv) > 1 else "https://aisalon-massapro-qcgppwjk3-ezecazs-projects.vercel.app"
EMAIL = "eze@massapro.com"
PASSWORD = "Massapro2026!"

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", "Mozilla/5.0 fetch-deployment-mockups")]

# 1. Get CSRF token
print(f"[1] GET {DEPLOYMENT_URL}/api/auth/csrf", flush=True)
resp = opener.open(f"{DEPLOYMENT_URL}/api/auth/csrf", timeout=30)
csrf_data = json.loads(resp.read().decode())
csrf_token = csrf_data["csrfToken"]
print(f"    csrfToken: {csrf_token[:20]}...", flush=True)

# 2. POST credentials
print(f"[2] POST credentials", flush=True)
data = urllib.parse.urlencode({
    "email": EMAIL,
    "password": PASSWORD,
    "csrfToken": csrf_token,
    "callbackUrl": "/admin/mockups",
    "json": "true",
}).encode()
req = urllib.request.Request(
    f"{DEPLOYMENT_URL}/api/auth/callback/credentials",
    data=data,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
)
try:
    resp = opener.open(req, timeout=30)
    body = resp.read().decode()
    print(f"    status: {resp.status}", flush=True)
    print(f"    body: {body[:300]}", flush=True)
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"    HTTP {e.code}: {body[:300]}", flush=True)

# 3. Try fetching /admin/mockups
print(f"[3] GET {DEPLOYMENT_URL}/admin/mockups", flush=True)
try:
    resp = opener.open(f"{DEPLOYMENT_URL}/admin/mockups", timeout=60)
    html = resp.read().decode()
    print(f"    status: {resp.status}, size: {len(html)}", flush=True)
    with open("/tmp/deployment-mockups.html", "w") as f:
        f.write(html)
    print(f"    saved to /tmp/deployment-mockups.html", flush=True)
    for term in ["Edit image", "Edit Section", "Edit sections", "editMode", "Edit Images", "Edit sections", "speaker-intro", "meet-the-speaker", "event-profile"]:
        count = html.count(term)
        if count > 0:
            print(f"    '{term}' found {count} times", flush=True)
    m = re.search(r"<title>([^<]*)</title>", html)
    if m:
        print(f"    title: {m.group(1)}", flush=True)
except urllib.error.HTTPError as e:
    body = e.read().decode()[:500]
    print(f"    HTTP {e.code}: {body}", flush=True)
