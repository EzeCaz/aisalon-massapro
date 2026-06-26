#!/usr/bin/env bash
#
# Create the V4.9 milestone backup of the AI Salon Tel Aviv project.
#
# V4.9 = Hero imageScaleY, Form/Share/Download on all mockups,
#        Share-no-download fix, SiteSetting schema fix + favicon set,
#        V4.7 schema restored (SiteSetting, EventCoHost, archived users,
#        RSVP check-in codes, panelists).
#
set -euo pipefail

PROJECT_DIR="/home/z/my-project"
DOWNLOAD_DIR="${PROJECT_DIR}/download"
BACKUP_NAME="aisalon-massapro-V4.9"
OUT="${DOWNLOAD_DIR}/${BACKUP_NAME}.tar.gz"
MANIFEST="${DOWNLOAD_DIR}/${BACKUP_NAME}-MANIFEST.txt"

mkdir -p "${DOWNLOAD_DIR}"
rm -f "${OUT}" "${MANIFEST}"

if command -v pbzip2 >/dev/null 2>&1; then
  COMPRESS_FLAG="--use-compress-program=pbzip2"
else
  COMPRESS_FLAG="--gzip"
fi

echo "Creating V4.9 milestone backup at ${OUT}…"

cd "${PROJECT_DIR}"

cat > "${MANIFEST}" <<EOF
==============================================================
AI Salon Tel Aviv — MassaPro Platform
Milestone Backup: V4.9
==============================================================

Backup created:    $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Created by:        Super Z (autonomous agent)
Project dir:       ${PROJECT_DIR}
Production URL:    https://aisalon.massapro.com
Vercel project ID: prj_aoKtARAel8wlmcIlLRjjSPKshMLA
Vercel team ID:    team_xQgfSmNbNo5JFCAaVyRboPBf

What's in V4.9:

  1. Speaker Intro — Hero image scale (Y) added
     - New field: data.heroOverlay.imageScaleY (default 1)
     - Canvas applies it as the height % of the hero container
     - Form View exposes it as a number input next to imageScale (×)

  2. Form/Share/Download buttons on ALL 3 mockups
     - meet-the-speaker-editor.tsx: added Form/JSON toggle, ShareButtons,
       getPngDataUrl helper, Form view (was JSON-only with "Show JSON")
     - event-profile-editor.tsx: same upgrades
     - speaker-intro-editor.tsx: already had all 3 from V4.8

  3. Share button no longer auto-downloads PNG
     - LinkedIn/WhatsApp/Facebook/Telegram: just open the share URL
       (no download — user clicked Share, not Download)
     - Instagram/TikTok/WeChat: still download first (no other way —
       these platforms don't support web share URLs)
     - Updated helper text in the dropdown to clarify behavior

  4. Favicon / Login hero / Login banner — FIXED
     - Root cause: prisma/schema.prisma was missing the SiteSetting
       model entirely (lost during a prior sandbox rollback). All
       /api/admin/brand-images/select POSTs were failing with
       "relation SiteSetting does not exist".
     - Fix: restored the full V4.7 schema (17 models including
       SiteSetting, EventCoHost, archived users, RSVP check-in codes,
       panelists m:n join table).
     - Ran scripts/apply-v4.9-schema-changes.mjs on production Neon
       to create the missing tables/columns (idempotent — IF NOT EXISTS).
     - Ran scripts/set-default-favicon.mjs to set the favicon to the
       meerkat brand image (admin can change via /admin/images).
     - .images/ folder + public/images/favicon.webp + falafel-meerkat.jpg
       restored from V4.7 backup.

  5. Audit: V4.7 vs V4.8 — what was lost
     - prisma/schema.prisma: SiteSetting model, EventCoHost model,
       User.archivedAt/archivedBy, EventRsvp.checkInCode/checkedInAt/
       doorCheckedAt/doorCheckedBy, _EventAgendaItemToSpeaker join
       table, EventAgendaItem.panelists relation — ALL RESTORED.
     - public/images/favicon.webp, public/images/falafel-meerkat.jpg
       — RESTORED from V4.7 backup.
     - .images/ folder (10 stock brand images) — RESTORED.
     - All V4.8 speaker-intro features (brand image logo, triangle
       overlay auto-hide, Form/JSON toggle, per-module font-scale,
       Download PNG, Share buttons) — preserved.
     - All V4.7 mockup files (meet-the-speaker, event-profile,
       speaker-intro) — preserved.

Rollback instructions:
  1. Untar: tar -xzf ${BACKUP_NAME}.tar.gz
  2. cd into the extracted directory
  3. bun install
  4. Set DATABASE_URL to production Postgres
  5. bun run build
  6. vercel deploy --prod --yes --token \$VERCEL_TOKEN

==============================================================
EOF

tar ${COMPRESS_FLAG} \
  --create \
  --file "${OUT}" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.vercel' \
  --exclude='.git' \
  --exclude='skills' \
  --exclude='upload' \
  --exclude='db' \
  --exclude='tool-results' \
  --exclude='dev.log' \
  --exclude='*.log' \
  --exclude='.env.local' \
  --exclude='.env.prod' \
  --exclude='download' \
  --exclude='preview' \
  --transform "s,^,${BACKUP_NAME}/," \
  "${MANIFEST#${PROJECT_DIR}/}" \
  .

echo ""
echo "✓ Backup created: ${OUT}"
du -h "${OUT}" | cut -f1
echo ""
echo "Total files in backup:"
tar --list --file "${OUT}" | wc -l
