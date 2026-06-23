# Secrets Rotation Runbook

> Plan ref: AISalon-Team-Plan-V3.0 §15 (Security Engineer role), §4.1
> Copy this file to `docs/runbooks/secrets-rotation.md` at the repo root.

## When to use this runbook

Use this runbook on the secrets rotation schedule defined in the V3.0 plan §15:
- `NEXTAUTH_SECRET` — every 90 days
- `GOOGLE_CLIENT_SECRET` — every 180 days
- `VERCEL_TOKEN` — every 90 days (or immediately if suspected compromised)
- Vercel Blob read/write tokens — every 180 days
- Database URL password (Neon) — every 365 days

Also use this runbook immediately if:
- A secret is suspected to be compromised (e.g., committed to git, leaked in a log)
- A team member with secrets access leaves the team
- A security incident involves authentication or session handling

## Prerequisites

- Vercel dashboard access: https://vercel.com/ezecaz/aff-massapro/settings/environment-variables
- Google Cloud Console access: https://console.cloud.google.com/ (for OAuth client)
- Neon dashboard access: https://console.neon.tech/ (for DB password)
- Vercel CLI authenticated: `vercel login`

## Rotation Procedure (per secret)

### NEXTAUTH_SECRET (every 90 days)

> ⚠️ Rotating this secret invalidates ALL active user sessions. Every user will be logged out and must re-authenticate. Schedule this during a low-traffic window.

1. Generate a new secret:
   ```bash
   openssl rand -base64 32
   ```
2. Update in Vercel:
   - Go to https://vercel.com/ezecaz/aff-massapro/settings/environment-variables
   - Find `NEXTAUTH_SECRET`, click "Edit", paste new value
   - Apply to Production, Preview, and Development environments
3. Trigger a redeploy (Vercel auto-redeploys when env vars change for the Production environment)
4. Verify: log in to https://aisalon.massapro.com — should work
5. Notify the team: "NEXTAUTH_SECRET rotated — all users will need to log in again"
6. Update the worklog with: rotation date, who performed it, next rotation due date

### GOOGLE_CLIENT_SECRET (every 180 days)

> ⚠️ Rotating this secret breaks Google OAuth login until the new secret is set in Vercel. Have both the new client ID and secret ready before starting.

1. Go to https://console.cloud.google.com/apis/credentials
2. Find the OAuth 2.0 Client ID used by the platform (named something like "AI Salon Tel Aviv")
3. Click the client, then "Reset Secret" — copy the new secret immediately (it's only shown once)
4. Update in Vercel:
   - `GOOGLE_CLIENT_SECRET` → new value
   - Confirm `GOOGLE_CLIENT_ID` is unchanged (the ID stays the same, only the secret rotates)
5. Trigger a redeploy
6. Verify: log in with Google OAuth at https://aisalon.massapro.com/login

### VERCEL_TOKEN (every 90 days)

1. Go to https://vercel.com/account/tokens
2. Click "Create Token", name it `deploy-token-YYYY-MM-DD`, set expiration 90 days
3. Copy the new token immediately (only shown once)
4. Update wherever the old token is used:
   - Local env: `export VERCEL_TOKEN="vcp_new..."`
   - GitHub Actions secret: `VERCEL_TOKEN` (if used in CI for deploy)
   - CI/CD systems: any other place that uses the token
5. Revoke the old token: find it in the token list, click "Delete"
6. Verify: `vercel deploy --prod --yes --token "$VERCEL_TOKEN"` works (or wait for next GitHub auto-deploy)

### Database URL password (Neon, every 365 days)

1. Go to https://console.neon.tech/ → your project → "Settings" → "Connection Details"
2. Click "Reset Password" — copy the new password
3. Construct the new `DATABASE_URL`:
   ```
   postgresql://<user>:<new-password>@<host>/<db>?sslmode=require
   ```
4. Update in Vercel: `DATABASE_URL` → new value
5. Trigger a redeploy
6. Verify: `node scripts/prod-smoke-test-extended.mjs` passes (it hits DB-backed endpoints)
7. Update any other places that use the DB URL (local `.env.local`, scripts, etc.)

## Emergency Rotation (suspected compromise)

If a secret is suspected to be compromised (e.g., committed to git, leaked in a log):

1. **Rotate immediately** — do not wait for the scheduled rotation
2. **Revoke all active sessions** (for NEXTAUTH_SECRET rotation, this is automatic)
3. **Audit access logs** — Vercel logs, Google Cloud audit logs, Neon query logs
4. **File an incident report** within 24 hours: `docs/postmortems/YYYY-MM-DD-security.md`
5. **Notify the platform owner** (Eze) and the PM
6. **Review git history** — if a secret was committed, use `git filter-repo` or BFG Repo-Cleaner to purge it, then force-push (coordinate with the team first)

## Rotation Calendar

Maintain a calendar (Google Calendar, Slack reminder, or a simple markdown file in `docs/`) with:
- Next NEXTAUTH_SECRET rotation: [date + 90 days from last rotation]
- Next GOOGLE_CLIENT_SECRET rotation: [date + 180 days]
- Next VERCEL_TOKEN rotation: [date + 90 days]
- Next DB password rotation: [date + 365 days]

The Security Engineer owns this calendar (per plan §15 KPI: "Secrets rotation compliance — 100%").
