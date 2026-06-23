# Rollback Runbook

> Plan ref: AISalon-Team-Plan-V3.0 §4.3, §11 (DevOps & Release Engineer role)
> Copy this file to `docs/runbooks/rollback.md` at the repo root.

## When to use this runbook

Use this runbook when a production deploy is misbehaving and you need to revert to the previous known-good state. Signs you should roll back:

- Smoke test fails after deploy
- Users report a P0 bug (production-down, data loss, auth broken)
- Vercel logs show a spike in 5xx errors immediately after deploy
- A new feature is causing unexpected side effects

**Rule of thumb:** When in doubt, roll back. It takes 10 seconds. Investigating in production takes longer and risks more users.

## Prerequisites

- Vercel dashboard access: https://vercel.com/ezecaz/aff-massapro/deployments
- (Optional) Vercel CLI for scripted rollback: `vercel promote <deployment-url> --token "$VERCEL_TOKEN"`

## Rollback Procedure (Vercel Instant Rollback)

### Step 1 — Identify the previous good deployment

1. Go to https://vercel.com/ezecaz/aff-massapro/deployments
2. Find the most recent deployment that was "Ready" and serving production traffic BEFORE the bad deploy.
3. Note its deployment URL (e.g., `aisalon-massapro-abc123-ezecaz.vercel.app`).

### Step 2 — Promote the previous deployment to production

**Via dashboard (fastest):**
1. Click the three-dot menu (⋮) next to the previous deployment.
2. Click "Promote to Production".
3. Confirm.

**Via CLI (scriptable):**
```bash
vercel promote aisalon-massapro-abc123-ezecaz.vercel.app --token "$VERCEL_TOKEN"
```

The promotion takes effect within seconds. Vercel routes production traffic to the promoted deployment.

### Step 3 — Verify rollback

1. `curl -sI https://aisalon.massapro.com` — should return the same status as before the bad deploy
2. `node scripts/prod-smoke-test-extended.mjs` — should pass
3. Check Vercel logs for any new errors

If the rollback itself fails (extremely rare — Vercel platform issue):
- Check https://www.vercel-status.com/ for platform incidents
- Contact Vercel support: https://vercel.com/help
- Page the DevOps engineer

### Step 4 — Notify stakeholders

- Post in the team Slack (or worklog) with: "Rolled back production to deployment <URL> at <time>. Investigating."
- If users are affected, notify the PM who communicates with the platform owner (Eze).

### Step 5 — Investigate the failed deploy

DO NOT redeploy the same code. Investigate first:

1. Check Vercel build logs — did the build succeed but the runtime fail?
2. Check Vercel runtime logs — what errors appeared immediately after deploy?
3. Check `worklog.md` — what changed since the previous (good) deploy?
4. Reproduce locally: `bun run dev` with the same code, hit the failing endpoint
5. Fix on a feature branch, get it reviewed, then redeploy via the Deploy runbook

## Postmortem (mandatory for P0/P1)

Per plan §4.3, every rollback triggers a postmortem within 48 hours.

1. Copy `docs/postmortems/TEMPLATE.md` to `docs/postmortems/YYYY-MM-DD-incident.md`
2. Fill in: timeline, impact, root cause, action items with owners
3. The DevOps & Release Engineer leads the postmortem
4. Review at the next weekly sync

## Database rollback (rare)

If the bad deploy included a Prisma migration that modified data, rolling back the code is not enough — you must also roll back the database.

1. Identify the migration: `prisma/migrations/<timestamp>_<name>/`
2. Check if a `down.sql` or rollback migration exists (per Database Engineer's procedure)
3. If yes: `prisma migrate resolve --rolled-back <migration_name>` then apply the down migration
4. If no: restore from the most recent Neon backup (Neon daily automatic backups, 30-day retention per plan §5.1)
5. Coordinate with the Database Engineer — do NOT attempt a DB rollback alone

## What NOT to do

- ❌ Do NOT delete the bad deployment from Vercel — keep it for forensic analysis
- ❌ Do NOT fix-forward by deploying another change on top of the bad deploy — roll back first, then fix
- ❌ Do NOT skip the postmortem — even if the rollback was fast, the incident still happened
- ❌ Do NOT roll back without notifying the team — someone may be investigating the same issue
