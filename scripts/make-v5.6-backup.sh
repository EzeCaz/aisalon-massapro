#!/bin/bash
# V5.6 milestone backup — fixed image section + size issues + tz + login dup + public events
# Captures the source tree (src/, prisma/, public/, configs) into a tarball + a manifest
# with SHA256 fingerprints. Excludes node_modules, .next, old-deployment, skills.

set -e
PROJECT_ROOT="/home/z/my-project"
BACKUP_DIR="$PROJECT_ROOT/download/v5.6-backup"
STAGING="$BACKUP_DIR/staging"
TAR_PATH="$PROJECT_ROOT/download/aisalon-massapro-V5.6-source.tar.gz"
MANIFEST_PATH="$BACKUP_DIR/MANIFEST.txt"

rm -rf "$STAGING" "$TAR_PATH"
mkdir -p "$STAGING"

# Copy source files (mirror the repo structure)
echo "[backup] staging source files..."
mkdir -p "$STAGING/src" "$STAGING/prisma" "$STAGING/public"
cp -r "$PROJECT_ROOT/src"/* "$STAGING/src/" 2>/dev/null || true
cp -r "$PROJECT_ROOT/prisma"/* "$STAGING/prisma/" 2>/dev/null || true
cp -r "$PROJECT_ROOT/public"/* "$STAGING/public/" 2>/dev/null || true

# Copy top-level config files
for f in package.json bun.lock next.config.ts tsconfig.json tailwind.config.ts \
         postcss.config.mjs components.json vercel.json .env.example README.md \
         next-env.d.ts Caddyfile; do
  [ -f "$PROJECT_ROOT/$f" ] && cp "$PROJECT_ROOT/$f" "$STAGING/"
done

# Write a manifest with file count + git info + sha256 of the tarball
echo "[backup] creating tarball..."
cd "$PROJECT_ROOT/download"
tar -czf "aisalon-massapro-V5.6-source.tar.gz" -C "$STAGING" .

echo "[backup] computing manifest..."
COMMIT=$(cd "$PROJECT_ROOT" && git rev-parse HEAD)
COMMIT_MSG=$(cd "$PROJECT_ROOT" && git log -1 --pretty=format:'%s')
TARBALL_SHA=$(sha256sum "aisalon-massapro-V5.6-source.tar.gz" | awk '{print $1}')
FILE_COUNT=$(find "$STAGING" -type f | wc -l)
TARBALL_SIZE=$(du -h "aisalon-massapro-V5.6-source.tar.gz" | awk '{print $1}')

cat > "$MANIFEST_PATH" << EOF
==================================================================
AI Salon MassaPro — V5.6 Milestone Backup
==================================================================
Created: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Git commit: $COMMIT
Commit message: $COMMIT_MSG

What's in this milestone:
  1. Mobile login page no longer shows "Empowering AI Connections" twice.
     Logo variant changed from horizontal-tagline to horizontal, single
     subtitle now reads "Empowering AI Connections in Tel Aviv".

  2. /events list is now PUBLIC. Anonymous visitors see a "Join AI Salon"
     banner that routes to /login?callbackUrl=/events. Signed-in users
     still get the onboarding gate.

  3. /events/[slug] now redirects anonymous visitors to the public
     /e/[slug] landing page (no more login wall on the event page).

  4. /e/[slug] public CTA: button label now reads "Join AI Salon" for
     anonymous visitors. Signed-in visitors still see "Register to event".

  5. Timezone fix in event-editor.tsx + new-event-form.tsx:
     The admin event form used browser-local time, which broke on UTC
     servers/previews — saved event times were 3h ahead of what the
     admin entered, which propagated to the mockups. Now uses explicit
     Asia/Jerusalem conversion (mirrors admin-agenda-tab.tsx).

  6. (From V5.5, still in place) Hero/overlay image resize on all
     mockups + speaker columns + save-as-default + login banner fix.

Files in backup: $FILE_COUNT
Tarball: aisalon-massapro-V5.6-source.tar.gz
Tarball size: $TARBALL_SIZE
Tarball SHA256: $TARBALL_SHA

Contents:
  src/                  — Next.js app source (admin, api, components, lib, hooks)
  prisma/               — Database schema
  public/               — Static images, brand assets, favicon
  package.json, etc.    — Top-level configs

Preview deployment:
  https://aisalon-massapro-kk6bzoobf-ezecazs-projects.vercel.app

Production deployment:
  https://aisalon.massapro.com
EOF

# Cleanup staging
rm -rf "$STAGING"

echo ""
echo "[backup] DONE"
echo "  Tarball: $TAR_PATH"
echo "  Manifest: $MANIFEST_PATH"
echo "  Size: $TARBALL_SIZE"
echo "  SHA256: $TARBALL_SHA"
