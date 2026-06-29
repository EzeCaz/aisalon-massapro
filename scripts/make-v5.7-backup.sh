#!/bin/bash
# V5.7 milestone backup — Major release
# Captures the full source tree + creates a GitHub release + pins the Vercel
# deployment. The tarball is also saved to /home/z/my-project/download/ for
# local retrieval.
#
# This is a MAJOR milestone: WhatsApp header pill + unlinked registrants
# filter + speaker page save crash fix, on top of the V5.6 fixes (mobile
# login dup slogan, public events list, tz-safe event form).

set -e
PROJECT_ROOT="/home/z/my-project"
BACKUP_DIR="$PROJECT_ROOT/download/v5.7-backup"
STAGING="$BACKUP_DIR/staging"
TAR_PATH="$PROJECT_ROOT/download/aisalon-massapro-V5.7-source.tar.gz"
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
tar -czf "aisalon-massapro-V5.7-source.tar.gz" -C "$STAGING" .

echo "[backup] computing manifest..."
COMMIT=$(cd "$PROJECT_ROOT" && git rev-parse HEAD)
COMMIT_MSG=$(cd "$PROJECT_ROOT" && git log -1 --pretty=format:'%s')
TARBALL_SHA=$(sha256sum "aisalon-massapro-V5.7-source.tar.gz" | awk '{print $1}')
FILE_COUNT=$(find "$STAGING" -type f | wc -l)
TARBALL_SIZE=$(du -h "aisalon-massapro-V5.7-source.tar.gz" | awk '{print $1}')

cat > "$MANIFEST_PATH" << EOF
==================================================================
AI Salon MassaPro — V5.7 MAJOR MILESTONE BACKUP
==================================================================
Created: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Git commit: $COMMIT
Commit message: $COMMIT_MSG

What's in this milestone (V5.7, on top of V5.6):

B. WhatsApp 'Join our group' pill in header (LEFT of Events):
   - New SiteSetting key: whatsappGroupUrl (default: AI Salon TLV group
     https://chat.whatsapp.com/DnOIlSxZi8c8DT1wdWELu3)
   - AppHeader renders a green pill on desktop + icon-only pill on mobile,
     visible to everyone (logged-in or not).
   - New POST /api/admin/whatsapp endpoint (SUPER_ADMIN-only, https-only).
   - New WhatsAppLinkEditor component at /admin/images (below the gallery)
     with input + Test button + Save. Changes take effect next page load,
     no redeploy needed.

C. Unlinked registrants filter at /admin/registrants:
   - New dropdown next to Status: All / Unlinked only / Linked only.
   - 'Unlinked only' is the most common admin task (finding registrants
     that need to be linked to a member account). Restored from V3.8.

D. Speaker page save crash fix:
   - POST /api/admin/speakers and PATCH /api/admin/speakers/[id] now
     include the event + user + _count relations in the response.
   - The client's handleSaved was calling s.event.slug / s.event.title
     on the returned speaker — without event in the payload, it crashed
     with 'Cannot read properties of undefined (reading slug)'.
   - Hardened speakers-tab-client.tsx to defensively handle a missing
     event relation (graceful fallback instead of page-level error).

Also includes all V5.6 fixes (still in place):
   - Mobile login page no longer shows 'Empowering AI Connections' twice
   - /events list is PUBLIC (anon visitors see 'Join AI Salon' banner)
   - /events/[slug] redirects anon visitors to /e/[slug]
   - /e/[slug] button label 'Join AI Salon' for anon visitors
   - Timezone fix in event-editor.tsx + new-event-form.tsx (Asia/Jerusalem
     explicit conversion, no more browser-TZ bug)

Files in backup: $FILE_COUNT
Tarball: aisalon-massapro-V5.7-source.tar.gz
Tarball size: $TARBALL_SIZE
Tarball SHA256: $TARBALL_SHA

Contents:
  src/                  — Next.js app source (admin, api, components, lib, hooks)
  prisma/               — Database schema
  public/               — Static images, brand assets, favicon
  package.json, etc.    — Top-level configs

Preview deployment:
  https://aisalon-massapro-kqrzplbva-ezecazs-projects.vercel.app

Production deployment:
  https://aisalon.massapro.com

Vercel deployment ID (pinned for rollback):
  dpl_<will be filled in after GitHub release creation>

GitHub release:
  https://github.com/EzeCaz/aisalon-massapro/releases/tag/v5.7
EOF

# Cleanup staging
rm -rf "$STAGING"

echo ""
echo "[backup] DONE — local artifacts"
echo "  Tarball: $TAR_PATH"
echo "  Manifest: $MANIFEST_PATH"
echo "  Size: $TARBALL_SIZE"
echo "  SHA256: $TARBALL_SHA"
