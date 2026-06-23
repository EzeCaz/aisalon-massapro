#!/usr/bin/env bash
#
# Create the V3.4 milestone backup of the entire AI Salon Tel Aviv project.
#
# V3.4 = V3.3 + /admin/registrants TDZ hotfix + dashboard chart-type toggle
#        (per-chart bar/pie/table + global "change all" control).
#
# Output: /home/z/my-project/download/aisalon-massapro-V3.4.tar.gz
#
set -euo pipefail

PROJECT_DIR="/home/z/my-project"
DOWNLOAD_DIR="${PROJECT_DIR}/download"
BACKUP_NAME="aisalon-massapro-V3.4"
OUT="${DOWNLOAD_DIR}/${BACKUP_NAME}.tar.gz"
MANIFEST="${DOWNLOAD_DIR}/${BACKUP_NAME}-MANIFEST.txt"

mkdir -p "${DOWNLOAD_DIR}"
rm -f "${OUT}" "${MANIFEST}"

if command -v pbzip2 >/dev/null 2>&1; then
  COMPRESS_FLAG="--use-compress-program=pbzip2"
else
  COMPRESS_FLAG="--gzip"
fi

echo "Creating V3.4 milestone backup at ${OUT}…"

cd "${PROJECT_DIR}"

cat > "${MANIFEST}" <<EOF
==============================================================
AI Salon Tel Aviv — MassaPro Platform
Milestone Backup: V3.4
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

What's new in V3.4 (vs V3.3):

  REGISTRANTS TDZ HOTFIX:
    - /admin/registrants was crashing on every render with
      "Cannot access 'filtered' before initialization" — the
      filtered useMemo was referenced at the top of the component
      body (in the allFilteredSelected/someFilteredSelected
      derivations) BEFORE its declaration further down.
    - TypeScript doesn't catch TDZ, so the build passed clean.
    - Fix: hoisted the filtered useMemo above its first usage.
      Added an inline comment to prevent regression.

  DASHBOARD CHART-TYPE TOGGLE:
    - Each chart on /admin/dashboard now has a 3-button segmented
      control in the top-right: Bar / Pie / Table.
    - Switching to Table renders the same underlying data as a
      sortable HTML table with color swatches + count + share %.
    - Switching to Pie renders a pie chart with the same color
      palette as the bar chart.
    - Switching to Bar renders either a vertical bar chart (for
      timeseries / few-category data) or a horizontal bar chart
      (for category data with long labels — interests, profile
      categories, tags).
    - A global "Set all" control above the charts grid lets the
      admin switch all 6 charts to bar, pie, or table in one click.
    - Defaults preserved: Signups = bar (was line), Source = pie,
      Interests = bar, Categories = bar, Applied = pie, Tags = bar.
    - Tag chart keeps its tag-catalog colors in all 3 modes.
    - Table mode shows sticky header so long lists stay readable.

V3.0 + V3.1 + V3.2 + V3.3 features also included (carried forward):
  - V3.3: AI event extractor, registrants bulk-link, sticky table
          headers, member-picker with smart matching, RBAC hotfixes
  - V3.2: Email editor shrink-to-fit, RBAC role dropdown
  - V3.1: Agenda thumbnail 1/N counter + click-to-open slideshow w/ dnd-kit reorder
  - V3.0: Email editor, click-to-edit, edit button, company combobox,
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
echo ""
echo "Manifest:"
cat "${MANIFEST}"
