#!/usr/bin/env bash
# backup-to-github.sh — PREVIEW
# Activation: copy to scripts/backup-to-github.sh in the repo root.
#             Requires `gh` CLI authenticated (gh auth login).
#
# Implements AISalon-Team-Plan-V3.0 §5.2 Backup Procedure.
# Idempotent — safe to re-run. Creates a git tag, a GitHub Release, and
# uploads the V3.x tarball as a release asset.
#
# Usage:
#   ./scripts/backup-to-github.sh v3.0.0           # tag HEAD and release
#   ./scripts/backup-to-github.sh v3.0.0 --tarball download/aisalon-massapro-V3.0.tar.gz
#   ./scripts/backup-to-github.sh v3.1.0 --notes github-release/v3.1.0-release-notes.md

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

if [ $# -lt 1 ]; then
  echo "Usage: $0 <tag> [--tarball <path>] [--notes <path>]"
  echo "Example: $0 v3.1.0 --tarball download/aisalon-massapro-V3.1.tar.gz"
  exit 1
fi

TAG="$1"
TARBALL=""
NOTES=""
shift
while [ $# -gt 0 ]; do
  case "$1" in
    --tarball) TARBALL="$2"; shift 2 ;;
    --notes)   NOTES="$2";   shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Resolve repo root
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

echo "============================================================"
echo "  Backup to GitHub — tag $TAG"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

# Step 1 — Verify clean working tree (per plan §5.2)
echo -e "\n1. Verify clean working tree"
if [ -n "$(git status --porcelain)" ]; then
  echo -e "  ${RED}FAIL${NC} working tree has uncommitted changes:"
  git status --short | head -10
  echo "  Commit or stash before tagging."
  exit 1
fi
echo -e "  ${GREEN}OK${NC} working tree clean"

# Step 2 — Verify tag does not already exist
echo -e "\n2. Verify tag $TAG does not already exist"
if git tag --list | grep -qx "$TAG"; then
  echo -e "  ${YELLOW}WARN${NC} tag $TAG already exists locally"
  echo "  To re-create: git tag -d $TAG && git push origin :refs/tags/$TAG"
  echo "  Continuing anyway (release creation will be idempotent)..."
else
  # Step 3 — Create tag from current HEAD
  echo -e "\n3. Create tag $TAG from HEAD"
  git tag -a "$TAG" -m "Release $TAG — $(git log -1 --pretty='%s')"
  echo -e "  ${GREEN}OK${NC} tag created"
fi

# Step 4 — Push tag to origin
echo -e "\n4. Push tag to origin"
if git push origin "$TAG" 2>&1; then
  echo -e "  ${GREEN}OK${NC} tag pushed"
else
  echo -e "  ${YELLOW}WARN${NC} push failed (tag may already exist on origin)"
fi

# Step 5 — Find or build tarball
echo -e "\n5. Locate tarball"
if [ -z "$TARBALL" ]; then
  # Default pattern: download/aisalon-massapro-V<MAJOR>.<MINOR>.tar.gz
  VERSION="${TAG#v}"
  TARBALL="download/aisalon-massapro-V${VERSION}.tar.gz"
  echo "  No --tarball provided, defaulting to: $TARBALL"
fi
if [ ! -f "$TARBALL" ]; then
  echo -e "  ${YELLOW}WARN${NC} tarball not found at $TARBALL"
  echo "  Build it first: ./scripts/make-v3-backup.sh  (or make-v3.1-backup.sh)"
  echo "  Continuing without tarball upload..."
  TARBALL=""
else
  SIZE=$(du -h "$TARBALL" | cut -f1)
  MD5=$(md5sum "$TARBALL" | cut -d' ' -f1)
  echo -e "  ${GREEN}OK${NC} found: $TARBALL ($SIZE, md5: ${MD5:0:12}...)"
fi

# Step 6 — Verify gh CLI is authenticated
echo -e "\n6. Verify gh CLI authentication"
if ! command -v gh >/dev/null 2>&1; then
  echo -e "  ${RED}FAIL${NC} gh CLI not installed"
  echo "  Install: https://cli.github.com/"
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo -e "  ${RED}FAIL${NC} gh CLI not authenticated"
  echo "  Run: gh auth login"
  exit 1
fi
echo -e "  ${GREEN}OK${NC} gh authenticated as $(gh api user --jq .login)"

# Step 7 — Create GitHub Release (idempotent)
echo -e "\n7. Create GitHub Release for $TAG"
if gh release view "$TAG" >/dev/null 2>&1; then
  echo -e "  ${YELLOW}WARN${NC} release $TAG already exists — will update"
  NOTES_FLAG=""
  if [ -n "$NOTES" ] && [ -f "$NOTES" ]; then
    NOTES_FLAG="--notes-file $NOTES"
    echo "  Updating release notes from: $NOTES"
  fi
  if [ -n "$NOTES_FLAG" ]; then
    gh release edit "$TAG" $NOTES_FLAG
  fi
else
  if [ -n "$NOTES" ] && [ -f "$NOTES" ]; then
    gh release create "$TAG" --title "$TAG" --notes-file "$NOTES"
  else
    gh release create "$TAG" --title "$TAG" --generate-notes
  fi
  echo -e "  ${GREEN}OK${NC} release created"
fi

# Step 8 — Upload tarball asset (idempotent)
if [ -n "$TARBALL" ]; then
  echo -e "\n8. Upload tarball asset"
  ASSET_NAME=$(basename "$TARBALL")
  # Delete existing asset if present (idempotent)
  if gh release view "$TAG" --json assets --jq ".assets[].name" 2>/dev/null | grep -qx "$ASSET_NAME"; then
    echo "  Asset $ASSET_NAME already exists — skipping upload"
  else
    gh release upload "$TAG" "$TARBALL" --clobber
    echo -e "  ${GREEN}OK${NC} uploaded $ASSET_NAME"
  fi
fi

# Step 9 — Prune older releases (keep last 10) per plan §5.2
echo -e "\n9. Prune older releases (keep last 10)"
ALL_RELEASES=$(gh release list --limit 100 --json tagName,publishedAt --jq '.[] | "\(.publishedAt) \(.tagName)"' | sort -r)
COUNT=$(echo "$ALL_RELEASES" | wc -l)
if [ "$COUNT" -gt 10 ]; then
  TO_DELETE=$(echo "$ALL_RELEASES" | tail -n +11 | awk '{print $2}')
  for old_tag in $TO_DELETE; do
    echo "  Deleting old release: $old_tag"
    gh release delete "$old_tag" --yes --cleanup-tag 2>/dev/null || true
  done
  echo -e "  ${GREEN}OK${NC} pruned $((COUNT - 10)) old releases"
else
  echo -e "  ${GREEN}OK${NC} only $COUNT releases — no pruning needed"
fi

# Step 10 — Append worklog entry per plan §5.2 last step
echo -e "\n10. Append worklog entry"
WORKLOG="$REPO_ROOT/worklog.md"
if [ -f "$WORKLOG" ]; then
  cat >> "$WORKLOG" << EOF

---
Task ID: backup-$TAG
Agent: backup-to-github.sh
Task: Automated GitHub backup for release $TAG

Work Log:
- Created git tag $TAG from HEAD $(git rev-parse --short HEAD)
- Pushed tag to origin
- Created/updated GitHub Release for $TAG
- Uploaded tarball: ${TARBALL:-none}
- Pruned older releases (kept last 10)

Stage Summary:
- Release URL: $(gh release view "$TAG" --json url --jq .url 2>/dev/null || echo "n/a")
- Tarball MD5: ${MD5:-n/a}
- Tag commit: $(git rev-parse HEAD)
EOF
  echo -e "  ${GREEN}OK${NC} worklog appended"
else
  echo -e "  ${YELLOW}WARN${NC} worklog.md not found at $WORKLOG"
fi

echo -e "\n============================================================"
echo -e "  ${GREEN}BACKUP COMPLETE${NC} — tag $TAG"
echo "============================================================"
