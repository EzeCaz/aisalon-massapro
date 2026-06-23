#!/usr/bin/env bash
#
# Create the V3.5 milestone backup of the entire AI Salon Tel Aviv project.
#
# V3.5 = snapshot of current state (= V3.4 codebase, no functional changes
#        since V3.4 deploy). Captured at the user's request as a fresh
#        rollback point.
#
# Output: /home/z/my-project/download/aisalon-massapro-V3.5.tar.gz
#
set -euo pipefail

PROJECT_DIR="/home/z/my-project"
DOWNLOAD_DIR="${PROJECT_DIR}/download"
BACKUP_NAME="aisalon-massapro-V3.5"
OUT="${DOWNLOAD_DIR}/${BACKUP_NAME}.tar.gz"
MANIFEST="${DOWNLOAD_DIR}/${BACKUP_NAME}-MANIFEST.txt"

mkdir -p "${DOWNLOAD_DIR}"
rm -f "${OUT}" "${MANIFEST}"

if command -v pbzip2 >/dev/null 2>&1; then
  COMPRESS_FLAG="--use-compress-program=pbzip2"
else
  COMPRESS_FLAG="--gzip"
fi

echo "Creating V3.5 milestone backup at ${OUT}…"

cd "${PROJECT_DIR}"

cat > "${MANIFEST}" <<EOF
==============================================================
AI Salon Tel Aviv — MassaPro Platform
Milestone Backup: V3.5
==============================================================

Backup created:    $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Created by:        Super Z (autonomous agent)
Machine:           $(hostname)
Project dir:       ${PROJECT_DIR}

Production URL:    https://aisalon.massapro.com
Vercel project ID: prj_aoKtARAel8wlmcIlLRjjSPKshMLA
Vercel team ID:    team_xQgfSmNbNo5JFCAaVyRboPBf
Git remote:        https://github.com/EzeCaz/aff-massapro.git
Git branch:        $(git rev-parse --abbrev-ref HEAD)
Git HEAD commit:   $(git rev-parse HEAD)
Git HEAD subject:  $(git log -1 --pretty=%s)

What's in V3.5:

  V3.5 is a snapshot backup of the current production state. No
  functional changes were made between V3.4 and V3.5 — this is a
  fresh rollback point captured at the user's request.

  Complete feature set (carried forward from V3.4 and earlier):

  V3.4:
    - /admin/registrants TDZ hotfix (filtered useMemo hoisted above
      its first usage; was crashing the page on every render)
    - Dashboard chart-type toggle: each of the 6 charts has a
      Bar / Pie / Table segmented control in its header
    - Global "Set all" control above the charts grid bulk-switches
      all 6 charts at once
    - Table view shows color swatches + counts + share % + sticky
      total row + sticky header
    - Tag chart preserves tag-catalog colors in all 3 modes

  V3.3:
    - AI event extractor (paste event content → LLM extracts fields)
    - Registrants bulk-link + find-members smart matching
    - Sticky table headers across all admin tables
    - Member picker with smart matching (email/mobile/name/domain)
    - RBAC hotfixes: single Super Admin, isSuperAdmin helper,
      auto-sync, getCurrentUser destructuring fix

  V3.2: Email editor shrink-to-fit, RBAC role dropdown
  V3.1: Agenda thumbnail 1/N counter + click-to-open slideshow
  V3.0: Email editor, click-to-edit, edit button, company combobox,
        slideshow viewer, CSV/XLS bulk import for Members + Registrants

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
