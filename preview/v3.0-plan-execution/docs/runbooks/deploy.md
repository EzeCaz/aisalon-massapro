# Deploy Runbook

> Plan ref: AISalon-Team-Plan-V3.0 §4.2, §11 (DevOps & Release Engineer role)
> Copy this file to `docs/runbooks/deploy.md` at the repo root.

## When to use this runbook

Use this runbook for every production deploy to `aisalon.massapro.com`. This includes:
- Routine feature deploys after merging a PR to `main`
- Hotfix deploys for P0/P1 bugs
- Manual deploys via Vercel CLI (only when GitHub auto-deploy is unavailable)

## Prerequisites

- Vercel project linked (`.vercel/project.json` exists in the repo) OR GitHub integration configured for auto-deploy
- Vercel token (if using CLI): stored in `VERCEL_TOKEN` env var
- `bun` installed locally (for the pre-deploy build check)
- `gh` CLI authenticated (for backup-to-github.sh, if creating a release tag)
- All env vars present in Vercel: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL`

## Deploy Procedure

### Path A: Auto-deploy via GitHub (default, preferred)

1. Ensure your branch is up to date: `git fetch origin && git checkout main && git pull origin main`
2. Merge your feature branch: `git merge --no-ff feature/your-branch` (or use GitHub PR merge)
3. Push to main: `git push origin main`
4. Vercel auto-deploys within ~30 seconds. Watch the build at https://vercel.com/ezecaz/aff-massapro/deployments
5. Wait for "Ready" status (typically 1-2 minutes)
6. Run the post-deploy smoke test: `node scripts/prod-smoke-test-extended.mjs`
7. If smoke test passes, deploy is complete.
8. If smoke test fails, follow the Rollback runbook (`docs/runbooks/rollback.md`).

### Path B: Manual deploy via Vercel CLI (fallback)

1. Run the pre-deploy checklist: `./scripts/pre-deploy-check.sh`
   - All checks must pass (warnings are OK, failures block deploy)
2. Stash any uncommitted WIP: `git stash push -u -m "WIP before deploy"`
3. Deploy: `vercel deploy --prod --yes --token "$VERCEL_TOKEN"`
4. Restore WIP: `git stash pop`
5. Run smoke test: `node scripts/prod-smoke-test-extended.mjs`
6. If smoke test fails, follow the Rollback runbook.

### Path C: Hotfix deploy (emergency)

1. Skip the pre-deploy checklist (note this in the worklog with the reason)
2. Deploy directly: `vercel deploy --prod --yes --token "$VERCEL_TOKEN"`
3. Run smoke test (only the critical-path endpoints)
4. File an incident report within 24 hours: `docs/postmortems/YYYY-MM-DD-incident.md`
5. Conduct a postmortem within 48 hours (per plan §4.3)

## Verification

After every deploy, verify these within 5 minutes:

1. **Homepage**: `curl -sI https://aisalon.massapro.com` returns 307 (redirect to /events or /login)
2. **Public events API**: `curl -s https://aisalon.massapro.com/api/events | head -c 200` returns JSON
3. **Auth boundary**: `curl -s -o /dev/null -w "%{http_code}" https://aisalon.massapro.com/api/admin/members` returns 401
4. **Full smoke test**: `node scripts/prod-smoke-test-extended.mjs` exits 0

If any check fails, roll back immediately (see Rollback runbook).

## Rollback

See `docs/runbooks/rollback.md`. Summary:
1. Vercel dashboard → Deployments → previous deployment → "Promote to Production"
2. Verify rollback with smoke test
3. File postmortem within 48 hours

## Post-deploy actions

- Append a worklog entry to `worklog.md` with: deploy time, deployer, what shipped, smoke test result
- If this deploy includes a version tag (v3.x.0), run `./scripts/backup-to-github.sh v3.x.0` to create the GitHub Release

## Escalation

- Build fails in Vercel → check Vercel build logs, fix locally, redeploy
- Smoke test fails after deploy → roll back, investigate locally, fix, redeploy
- Production is down (P0) → roll back first, then investigate. Notify the PM and platform owner (Eze).
- Rollback itself fails (extremely rare) → Vercel support, page the DevOps engineer
