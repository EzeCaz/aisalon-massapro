# Vercel GitHub Integration — Auto-Deploy Setup Guide
# Plan ref: AISalon-Team-Plan-V3.0 §4.1 root cause #1 + Goal 2 Q1 priority
#
# This document is a STEP-BY-STEP guide. No code changes — all dashboard work.
# Outcome: every push to main auto-deploys to production. No CLI token needed.

## Why This Matters

The V3.0 deploy gap (per plan §1 Executive Summary) happened because:
- No Vercel token was in the agent environment
- No deploy hook was configured
- The only deploy path was manual CLI: `vercel deploy --prod --token ...`

With Vercel GitHub Integration, the flow becomes:
1. Developer pushes to `main`
2. Vercel auto-builds and deploys to production
3. GitHub Actions CI runs lint/typecheck/build in parallel
4. If CI fails, the next push is blocked (via branch protection)
5. If CI passes and Vercel deploy succeeds, smoke test job runs

## Setup Steps (15 minutes total)

### Step 1 — Connect GitHub repo to Vercel project (5 min)

1. Go to https://vercel.com/ezecaz/aff-massapro/settings/git
2. Under "Connected Git Repository", confirm `EzeCaz/aff-massapro` is connected.
   - If not: click "Connect Git Repository" → authorize Vercel on GitHub → pick the repo.
3. Under "Production Branch", confirm it says `main`.
4. Under "Ignored Build Step", leave EMPTY (we want every push to deploy).

### Step 2 — Configure auto-deploy on push (1 min)

1. Same page, scroll to "Deploy Hooks".
2. Skip — we don't need a hook. Push-to-main auto-deploys by default once the repo is connected.

### Step 3 — Set environment variables in Vercel (5 min)

1. Go to https://vercel.com/ezecaz/aff-massapro/settings/environment-variables
2. Confirm these exist (copy values from your local `.env.prod` or password manager):
   - `DATABASE_URL` — Neon PostgreSQL connection string
   - `NEXTAUTH_SECRET` — random 32+ char string
   - `NEXTAUTH_URL` — `https://aisalon.massapro.com`
   - `GOOGLE_CLIENT_ID` — Google OAuth client ID
   - `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
   - `ADMIN_EMAIL` — `eze@massapro.com` (comma-separated if multiple)
3. For each, ensure the environment scope is: Production ✓ Preview ✓ Development ✓

### Step 4 — Add CI secrets to GitHub (3 min)

1. Go to https://github.com/EzeCaz/aff-massapro/settings/secrets/actions
2. Add these secrets (used by `.github/workflows/ci.yml` smoke-test job):
   - `SMOKE_TEST_EMAIL` — `eze@massapro.com` (or a dedicated test account)
   - `SMOKE_TEST_PASSWORD` — the test account password

### Step 5 — Enable branch protection on main (1 min)

1. Go to https://github.com/EzeCaz/aff-massapro/settings/branches
2. Click "Add branch protection rule" for `main`:
   - ✓ Require status checks to pass before merging
   - ✓ Require branches to be up to date before merging
   - Required status checks: `Lint + Typecheck + Build` (from ci.yml)
   - ✓ Require conversation resolution
   - ✓ Do not allow bypassing the above settings

### Step 6 — Verify (1 min)

1. Make a tiny commit on a new branch: `git checkout -b test/ci-verify && git commit --allow-empty -m "test: verify CI" && git push origin test/ci-verify`
2. Open a PR. Confirm CI runs and passes.
3. Merge the PR. Confirm Vercel auto-deploys within ~2 minutes.
4. Run `node scripts/prod-smoke-test-extended.mjs` to verify production.

## Rollback

If auto-deploy misbehaves:
1. Vercel dashboard → Deployments → previous deployment → "Promote to Production" (instant rollback, per plan §4.3)
2. Disable auto-deploy temporarily: Vercel project settings → Git → "Pause deployments"
3. Investigate, fix on a branch, merge when ready.

## Cost

No additional cost. Vercel Hobby/Pro includes GitHub integration. GitHub Actions free tier covers 2,000 min/month for private repos (this CI uses ~15 min per run).
