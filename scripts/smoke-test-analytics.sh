#!/usr/bin/env bash
# Smoke-test the analytics page end-to-end as the admin user.
set -euo pipefail

BASE="http://localhost:3000"
EMAIL="eze@massapro.com"
PASS="Massapro2026!"

# 1. Get the CSRF token + cookie jar
COOKIE=/tmp/aisalon-cookies.txt
rm -f "$COOKIE"
CSRF=$(curl -s -c "$COOKIE" "$BASE/api/auth/csrf" | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
echo "CSRF: ${CSRF:0:12}..."

# 2. Sign in via the credentials provider. Provider id is "email" per
# src/lib/auth.ts, so the callback URL is /api/auth/callback/email.
curl -s -b "$COOKIE" -c "$COOKIE" -o /dev/null -w "signin HTTP %{http_code}\n" \
  -X POST "$BASE/api/auth/callback/email" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASS" \
  --data-urlencode "callbackUrl=$BASE/admin/analytics" \
  --data-urlencode "json=true" \
  --max-redirs 0

# 3. Hit /admin/analytics — should return 200 now
HTTP=$(curl -s -b "$COOKIE" -o /tmp/analytics.html -w "%{http_code}" "$BASE/admin/analytics")
echo "/admin/analytics → HTTP $HTTP  (HTML size: $(wc -c < /tmp/analytics.html) bytes)"

# 4. Hit the analytics API directly to confirm the new fields are present
curl -s -b "$COOKIE" "$BASE/api/admin/analytics" -o /tmp/analytics.json
echo "/api/admin/analytics → JSON size: $(wc -c < /tmp/analytics.json) bytes"
python3 -c "
import json
with open('/tmp/analytics.json') as f:
    d = json.load(f)
print('Top-level keys:', sorted(d.keys()))
print('  summary:', d.get('summary'))
print('  topReferrers count:', len(d.get('topReferrers', [])))
print('  recentVisits count:', len(d.get('recentVisits', [])))
print('  recentVisits[0] keys:', sorted(d['recentVisits'][0].keys()) if d.get('recentVisits') else 'EMPTY')
print('  eventRegistrations count:', len(d.get('eventRegistrations', [])))
if d.get('eventRegistrations'):
    print('  eventRegistrations[0] keys:', sorted(d['eventRegistrations'][0].keys()))
print('  interestedInRows count:', len(d.get('interestedInRows', [])))
print('  interestedInRows top 5:', d.get('interestedInRows', [])[:5])
"

# 5. Hit /admin/check-in (Task 4 — should now have AppHeader + AdminTabs)
HTTP2=$(curl -s -b "$COOKIE" -o /tmp/checkin.html -w "%{http_code}" "$BASE/admin/check-in")
echo "/admin/check-in → HTTP $HTTP2  (HTML size: $(wc -c < /tmp/checkin.html) bytes)"
grep -o 'AdminTabs\|Door Check-in\|Members\|Referral Analytics' /tmp/checkin.html | sort -u | head -10

# 6. Hit /admin/registrants (Task 4 — should have Door approval column now)
HTTP3=$(curl -s -b "$COOKIE" -o /tmp/registrants.html -w "%{http_code}" "$BASE/admin/registrants")
echo "/admin/registrants → HTTP $HTTP3  (HTML size: $(wc -c < /tmp/registrants.html) bytes)"
grep -o 'Door approval\|Approve' /tmp/registrants.html | sort -u | head -5
