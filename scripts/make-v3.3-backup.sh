#!/usr/bin/env bash
#
# Create the V3.3 milestone backup of the entire AI Salon Tel Aviv project.
#
# V3.3 = V3.2 + AI event extractor + registrants bulk-link + sticky
#        table headers + member-picker with smart matching + RBAC
#        hotfixes (single Super Admin, auto-sync, isSuperAdmin helper).
#
# Output: /home/z/my-project/download/aisalon-massapro-V3.3.tar.gz
#
set -euo pipefail

PROJECT_DIR="/home/z/my-project"
DOWNLOAD_DIR="${PROJECT_DIR}/download"
BACKUP_NAME="aisalon-massapro-V3.3"
OUT="${DOWNLOAD_DIR}/${BACKUP_NAME}.tar.gz"
MANIFEST="${DOWNLOAD_DIR}/${BACKUP_NAME}-MANIFEST.txt"

mkdir -p "${DOWNLOAD_DIR}"
rm -f "${OUT}" "${MANIFEST}"

if command -v pbzip2 >/dev/null 2>&1; then
  COMPRESS_FLAG="--use-compress-program=pbzip2"
else
  COMPRESS_FLAG="--gzip"
fi

echo "Creating V3.3 milestone backup at ${OUT}…"

cd "${PROJECT_DIR}"

cat > "${MANIFEST}" <<EOF
==============================================================
AI Salon Tel Aviv — MassaPro Platform
Milestone Backup: V3.3
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

What's new in V3.3 (vs V3.2):

  RBAC HOTFIXES (post-V3.2):
    - Single Super Admin: eze@massapro.com only (ezeszna@gmail.com removed)
    - New isSuperAdmin({ email, role }) helper — email-based check is
      authoritative, catching stale DB role state
    - getCurrentUser() auto-syncs: if email is in allowlist but DB role
      isn't SUPER_ADMIN, upgrades the DB row inline
    - /admin page also auto-syncs on load — no logout/login required
    - Fixed destructuring bug: getCurrentUser() returns { user, error },
      not the user directly

  AI EVENT EXTRACTOR (Feature 4 from prior batch):
    - New POST /api/admin/events/extract endpoint
    - Paste raw event content → LLM extracts title/dates/venue/description/
      takeaways/intended-for/RSVP URL + speaker list
    - Uses z-ai-web-dev-sdk chat completions with strict JSON output
    - New event form (/admin/events/new) has a purple "AI Event Extractor"
      panel at the top — paste content, click "Extract fields with AI",
      all fields auto-populate. Speakers shown as preview list.

  STICKY TABLE HEADERS:
    - All admin tables now have sticky <thead> (top-0, z-10, bg-white)
      so headers stay visible when scrolling through long lists.

  REGISTRANTS BULK SELECT (Feature 3 from new batch):
    - /admin/registrants table has a checkbox column on the left
    - "Select all" checkbox in the header (selects all filtered rows)
    - Selection-aware toolbar: shows count + bulk actions when rows selected

  ADD TO EXISTING MEMBER (Feature 4 from new batch):
    - "Add to existing member" button on each unlinked registrant row
    - Opens a member picker dialog showing ALL members
    - Smart matching: members ranked by likelihood (email match > mobile
      match > name match > email domain match > similar name)
    - Top suggestions shown at the top with a "Likely match" badge
    - Selecting a member links the RSVP to that user (sets userId)
    - New PATCH /api/admin/registrants/[id] supports { userId } field
      directly (was previously only auto-linked via email change)

  LOOK FOR MEMBERS (Feature 5 from new batch):
    - "Look for members" bulk button — processes all unlinked registrants
    - For each unlinked RSVP, finds the best-matching member using the
      same smart-matching algorithm
    - Shows a review dialog with all suggested matches before applying
    - Admin can accept all, accept some, or skip
    - New POST /api/admin/registrants/bulk-link endpoint — accepts a list
      of { rsvpId, userId } pairs and links them all in one transaction

V3.0 + V3.1 + V3.2 features also included (carried forward):
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
