# Runbooks

> *Step-by-step procedures for repeatable operations. Owned by Codex, contributed to by every agent.*

---

## Runbook: Deploy to production (Beacon)

**Prerequisites**: Atlas has signed off the DB track (or written `skipped.md`). Sentinel has signed off QA (Gate 7). User has explicitly said "deploy".

```bash
# 1. Verify build locally
cd /home/z/my-project
npx tsc --noEmit
npx next build

# 2. Capture the current production deployment URL (for rollback)
# (Vercel CLI: npx vercel ls --prod)
# Note the most recent production deployment URL.

# 3. Commit all changes
git add -A
git commit -m "<conventional commit message>"
git push origin main

# 4. Deploy to Vercel production
VERCEL_TOKEN=VERCEL_TOKEN_REDACTED \
  npx vercel deploy --prod --yes \
  --token=VERCEL_TOKEN_REDACTED

# 5. Smoke test (Sentinel takes over here)
for path in / /events /admin /admin/speakers /admin/registrants /admin/events/new /admin/dashboard /admin/email; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -L "https://aisalon.massapro.com${path}")
  echo "${path} → HTTP ${status}"
done

# 6. Append release-log.md entry
```

---

## Runbook: Rollback a Vercel deploy (Beacon)

**Trigger**: Sentinel's prod verify failed, OR the user explicitly requested rollback.

```bash
# 1. List recent production deployments
npx vercel ls --prod

# 2. Find the previous production deployment URL (the one before the failed deploy)

# 3. Promote it to production
npx vercel promote <previous-deployment-url> --token=$VERCEL_TOKEN

# 4. Verify the rollback
curl -s -o /dev/null -w "%{http_code}" -L https://aisalon.massapro.com

# 5. Append a "ROLLBACK" entry to core/releases/release-log.md
# 6. Notify Meridian + the user
```

---

## Runbook: Create a backup (Atlas)

**Prerequisites**: Working tree is clean or Atlas has acknowledged dirty files.

```bash
# 1. Read the current manifest to determine the next version number
tail -30 /home/z/my-project/backups/MANIFEST.md

# 2. Run pre-backup checks
cd /home/z/my-project
git status --short
npx tsc --noEmit

# 3. Create an annotated git tag
git tag -a v<N>.<M> -m "Backup v<N>.<M> — <one-line summary>"

# 4. Create the tarball
tar --exclude='node_modules' --exclude='.next' --exclude='.git' \
    --exclude='backups' --exclude='tool-results' --exclude='agent-ctx' \
    --exclude='skills' --exclude='upload' --exclude='examples' \
    --exclude='*.log' \
    -czf /home/z/my-project/backups/aisalon-v<N>.<M>-<YYYYMMDD-HHMMSS>.tar.gz \
    .

# 5. Verify the tarball (re-extract and count)
mkdir -p /tmp/verify-<N>
tar -xzf /home/z/my-project/backups/aisalon-v<N>.<M>-<YYYYMMDD-HHMMSS>.tar.gz -C /tmp/verify-<N>
find /tmp/verify-<N> -type f | wc -l
# Compare to expected count

# 6. Compute SHA-256
sha256sum /home/z/my-project/backups/aisalon-v<N>.<M>-<YYYYMMDD-HHMMSS>.tar.gz

# 7. Push the tag to GitHub (if token allows)
git push origin v<N>.<M>

# 8. Append manifest entry to /home/z/my-project/backups/MANIFEST.md
# 9. Append worklog entry under the task ID
```

---

## Runbook: Run a Prisma migration (Atlas)

**Prerequisites**: `schema-diff.md` is written and signed. Pre-migration backup tarball exists and is verified. User has approved the deploy plan.

```bash
# 1. Verify the pre-migration backup
ls -la /home/z/my-project/backups/aisalon-v<N>-<timestamp>.tar.gz
sha256sum /home/z/my-project/backups/aisalon-v<N>-<timestamp>.tar.gz
# Compare to manifest entry

# 2. Pull the current production schema to confirm it matches expected
npx prisma db pull
git diff prisma/schema.prisma  # should be empty if schema is in sync

# 3. Apply the migration
# For additive changes (new column/table):
npx prisma db push
# For breaking changes (rename/drop):
# npx prisma migrate dev --name <slug>
# npx prisma migrate deploy

# 4. Verify the migration
npx prisma db pull
git diff prisma/schema.prisma  # should now show the new schema

# 5. Append entry to core/db/schema-history.md
# 6. Sign off to Beacon: "DB migration complete, schema verified."
```

---

## Runbook: Restore from a backup (Atlas)

**Prerequisites**: User has explicitly said "restore v<X>".

```bash
# 1. Look up the version in the manifest
grep -A 20 "v<X>" /home/z/my-project/backups/MANIFEST.md

# 2. Confirm the tarball exists and SHA-256 matches
ls -la /home/z/my-project/backups/aisalon-v<X>-<timestamp>.tar.gz
sha256sum /home/z/my-project/backups/aisalon-v<X>-<timestamp>.tar.gz
# Compare to manifest

# 3. Ask the user: restore to a new branch or detached HEAD?
# Atlas refuses to force-checkout over a dirty working tree.

# 4. Perform the checkout
git checkout -b restore/v<X> v<X>
# OR
git checkout v<X>

# 5. Verify the restore builds
npm install
npx tsc --noEmit

# 6. Report: restore complete, build status, any manual steps needed
# 7. DO NOT auto-deploy. Restore is a read operation.
```

---

## Changelog

- **v1.0** (2026-06-22) — Initial runbooks: deploy, rollback, backup, migrate, restore.
