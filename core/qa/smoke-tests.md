# Smoke Tests — Regression Suite

> *Every release must pass every test in this file. Owned by Sentinel. Append-only — new tests are added as features ship; old tests are never removed (only marked deprecated with a reason).*

---

## How to Run

```bash
# All public routes (should return 200)
for path in / /events /login /onboarding; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -L "https://aisalon.massapro.com${path}")
  echo "${path} → HTTP ${status}"
done

# All admin routes (should redirect to /login when unauthenticated → 200 after redirect)
for path in /admin /admin/speakers /admin/registrants /admin/events/new /admin/dashboard /admin/email; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -L "https://aisalon.massapro.com${path}")
  echo "${path} → HTTP ${status}"
done
```

---

## Test Catalog

### Public pages
- [ ] `/` returns HTTP 200
- [ ] `/events` returns HTTP 200
- [ ] `/login` returns HTTP 200
- [ ] `/onboarding` returns HTTP 200

### Admin pages (unauthenticated → redirect to /login → 200)
- [ ] `/admin` redirects to /login, then 200 after auth
- [ ] `/admin/speakers` redirects to /login, then 200 after auth
- [ ] `/admin/registrants` redirects to /login, then 200 after auth
- [ ] `/admin/events/new` redirects to /login, then 200 after auth
- [ ] `/admin/dashboard` redirects to /login, then 200 after auth
- [ ] `/admin/email` redirects to /login, then 200 after auth

### Admin tab bar (must appear on every /admin/* page)
- [ ] `/admin` shows the tab bar with "Members" active + member count badge
- [ ] `/admin/speakers` shows the tab bar with "Speakers" active
- [ ] `/admin/registrants` shows the tab bar with "Registrants" active
- [ ] `/admin/events/new` shows the tab bar with "Create event" active (highlighted)
- [ ] `/admin/dashboard` shows the tab bar with "Dashboard" active
- [ ] `/admin/email` shows the tab bar with "Email campaigns" active

### Event detail pages
- [ ] `/events/<slug>` returns HTTP 200 for a known slug
- [ ] `/events/<slug>` returns HTTP 404 for an unknown slug

### API health
- [ ] `/api/auth/providers` returns 200 (NextAuth endpoint)
- [ ] No new 500 errors in the Vercel logs after deploy

### Auth flow
- [ ] Login with Google OAuth succeeds
- [ ] After login, `/admin` is accessible to ADMIN users
- [ ] After login, `/admin` redirects non-ADMIN users to `/events`

---

## Deprecated Tests

(none yet)

---

## Changelog

- **v1.0** (2026-06-22) — Initial regression suite, focused on the admin tab bar feature + basic public/admin route health.
