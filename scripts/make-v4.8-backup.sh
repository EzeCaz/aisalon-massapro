#!/usr/bin/env bash
#
# Create the V4.8 milestone backup of the entire AI Salon Tel Aviv project.
#
# V4.8 = Speaker Intro editor: brand-image logo, conditional triangle overlay,
#        Form/JSON view toggle, per-module font-scale controls, Download PNG
#        button, Share buttons (7 platforms), getPngDataUrl helper fix.
#
# Output: /home/z/my-project/download/aisalon-massapro-V4.8.tar.gz
#
set -euo pipefail

PROJECT_DIR="/home/z/my-project"
DOWNLOAD_DIR="${PROJECT_DIR}/download"
BACKUP_NAME="aisalon-massapro-V4.8"
OUT="${DOWNLOAD_DIR}/${BACKUP_NAME}.tar.gz"
MANIFEST="${DOWNLOAD_DIR}/${BACKUP_NAME}-MANIFEST.txt"

mkdir -p "${DOWNLOAD_DIR}"
rm -f "${OUT}" "${MANIFEST}"

if command -v pbzip2 >/dev/null 2>&1; then
  COMPRESS_FLAG="--use-compress-program=pbzip2"
else
  COMPRESS_FLAG="--gzip"
fi

echo "Creating V4.8 milestone backup at ${OUT}…"

cd "${PROJECT_DIR}"

cat > "${MANIFEST}" <<EOF
==============================================================
AI Salon Tel Aviv — MassaPro Platform
Milestone Backup: V4.8
==============================================================

Backup created:    $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Created by:        Super Z (autonomous agent)
Machine:           $(hostname)
Project dir:       ${PROJECT_DIR}

Production URL:    https://aisalon.massapro.com
Vercel project ID: prj_aoKtARAel8wlmcIlLRjjSPKshMLA
Vercel team ID:    team_xQgfSmNbNo5JFCAaVyRboPBf
Git remote:        https://github.com/EzeCaz/aff-massapro.git
Git branch:        $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(no git)")
Git HEAD commit:   $(git rev-parse HEAD 2>/dev/null || echo "(no git)")
Git HEAD subject:  $(git log -1 --pretty=%s 2>/dev/null || echo "(no git)")

What's in V4.8:

  Speaker Intro editor (/admin/mockups/speaker-intro):

    A. Brand image logo — replaced the "ai salon" gradient wordmark
       with the meerkat brand image:
       https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png
       Configurable via data.branding.imageUrl + data.branding.height.

    B. Triangle overlay auto-hide — when the user picks a new hero
       image via the image picker, data.heroOverlay.showTriangleOverlay
       is automatically set to false. The overlay SVG on the canvas
       is conditionally rendered (showTriangleOverlay !== false).
       Admins can re-enable it via the Form View toggle.

    C. Form View toggle — left panel can switch between Form (structured
       inputs with labeled fields, color pickers, dropdowns) and JSON
       (raw textarea with syntax-ish formatting). Toggle is a 2-button
       segmented control in the editor toolbar.

    D. Per-module font-scale controls — event name and event topic each
       have a fontScale field (default 1.0) exposed in the Form View
       as a number input + live "current px" readout. Canvas multiplies
       the base fontSize by the scale.

    E. Download PNG button — prominent black button in the toolbar.
       Exports the 1200×800 canvas at 2× DPR (2400×1600 PNG) via
       html-to-image's toPng. Filename includes the event slug.

    F. Share buttons — purple "Share" button next to Download. Tries
       Web Share API first (mobile native sheet). Falls back to a
       dropdown of 7 platforms:
         - LinkedIn (share URL)
         - WhatsApp (share URL + PNG download)
         - Facebook (share URL)
         - Instagram (download-only — opens instagram.com)
         - Telegram (share URL)
         - TikTok (download-only — opens tiktok.com/upload)
         - WeChat (download-only — opens wechat.com)
       Each platform downloads the PNG first so the user can attach
       it in the platform's composer.

    Bug fix: getPngDataUrl was referenced by <ShareButtons> but never
    defined — added a useCallback that wraps toPng() on canvasRef.
    handleDownloadPng now also uses getPngDataUrl (DRY).

  Mockups index (/admin/mockups):
    - Existing 4-section layout preserved (Mockup Templates → Brand
      Library Uploader → Brand Assets → System Prompt). Mockup
      Templates is already first per user spec.

Rollback instructions:
  1. Untar this backup on a fresh machine:
       tar -xzf ${BACKUP_NAME}.tar.gz
  2. cd into the extracted directory
  3. bun install
  4. Set DATABASE_URL to point to the production Postgres (or a snapshot)
  5. bun run build
  6. vercel link --yes (re-link to the same project)
  7. vercel deploy --prod --yes

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
echo ""
echo "Size:"
du -h "${OUT}" | cut -f1
echo ""
echo "Total files in backup:"
tar --list --file "${OUT}" | wc -l
