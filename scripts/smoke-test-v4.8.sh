#!/usr/bin/env bash
set -uo pipefail
BASE="https://aisalon.massapro.com"
PASS=0
FAIL=0

check() {
  local path="$1"
  local expect="${2:-200}"
  local url="${BASE}${path}"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 -L "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "$expect" ]] || [[ "$expect" == "*" && "$code" != "000" ]]; then
    echo "  [OK]   ${code}  ${path}"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] ${code} (expected ${expect})  ${path}"
    FAIL=$((FAIL+1))
  fi
}

echo "=== V4.8 Smoke Test — ${BASE} ==="
echo ""
echo "Public pages:"
check "/" 200
check "/events" 200
check "/login" 200

echo ""
echo "API (public):"
check "/api/events" 200

echo ""
echo "Admin pages (expect 307 → /login):"
check "/admin/mockups" 307
check "/admin/mockups/speaker-intro" 307
check "/admin/mockups/meet-the-speaker" 307
check "/admin/mockups/event-profile" 307

echo ""
echo "Admin APIs (expect 401):"
check "/api/admin/brand-images" 401
check "/api/admin/events/extract" 401

echo ""
echo "=== Summary: ${PASS} passed, ${FAIL} failed ==="
exit $FAIL
