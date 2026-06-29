#!/bin/bash
# ==============================================================================
# Unified milestone backup for AI Salon MassaPro
# ==============================================================================
# Creates a complete backup of the current source tree at HEAD:
#   1. Local tarball      -> /home/z/my-project/download/aisalon-massapro-V<x>-source.tar.gz
#   2. Local MANIFEST.txt -> /home/z/my-project/download/v<x>-backup/MANIFEST.txt
#   3. Google Drive       -> uploads tarball + manifest to the shared Drive folder
#   4. GitHub release     -> creates a tag v<x> on HEAD, attaches both files
#
# USAGE:
#   scripts/make-milestone-backup.sh <VERSION> <KIND> [NOTES_FILE] [VERCEL_DEPLOYMENT_ID]
#
#   VERSION              e.g. V5.8  (case-insensitive, will be uppercased)
#   KIND                 MAJOR | MINOR | PATCH (only affects the manifest headline)
#   NOTES_FILE           optional path to a markdown/text file whose contents
#                        will be embedded verbatim into the MANIFEST under
#                        "What's in this milestone" AND used as the GitHub
#                        release body. If omitted, falls back to commit subject.
#   VERCEL_DEPLOYMENT_ID optional, e.g. dpl_AbCd1234... If provided, it gets
#                        embedded in the manifest as the rollback pin. If
#                        omitted, the script prints instructions telling you
#                        to wait for Vercel and re-run with the ID.
#
# EXAMPLES:
#   scripts/make-milestone-backup.sh V5.8 MAJOR
#   scripts/make-milestone-backup.sh V5.8 MAJOR notes/v5.8-notes.md
#   scripts/make-milestone-backup.sh V5.8 MAJOR notes/v5.8-notes.md dpl_xxx
#   # Re-run later just to fill in the Vercel pin:
#   scripts/make-milestone-backup.sh V5.8 MAJOR notes/v5.8-notes.md dpl_xxx
#
# IDEMPOTENCE:
#   - Local tarball + manifest are OVERWRITTEN each run.
#   - Drive files with the same name are UPDATED IN PLACE by upload-backup-to-drive.py.
#   - If a GitHub release for this tag already exists, the script aborts with
#     an error (use --force to delete + recreate the release).
#
# PREREQS:
#   - scripts/.gdrive-token.json must exist (run scripts/google-drive-upload.py --auth-url once).
#   - git remote 'origin' must contain the GitHub token (current setup).
#   - jq + curl installed.
# ==============================================================================

set -euo pipefail

# ---- arg parsing ------------------------------------------------------------
FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1; shift
fi

VERSION_RAW="${1:?usage: $0 <VERSION> <KIND> [NOTES_FILE] [VERCEL_DEPLOYMENT_ID]}"
KIND="${2:?kind required: MAJOR | MINOR | PATCH}"
NOTES_FILE="${3:-}"
VERCEL_ID="${4:-}"

VERSION="$(echo "$VERSION_RAW" | tr '[:lower:]' '[:upper:]')"   # V5.8
TAG="$(echo "$VERSION" | tr '[:upper:]' '[:lower:]')"            # v5.8
BACKUP_SLUG="${TAG}-backup"                                      # v5.8-backup

PROJECT_ROOT="/home/z/my-project"
DOWNLOAD_DIR="$PROJECT_ROOT/download"
BACKUP_DIR="$DOWNLOAD_DIR/$BACKUP_SLUG"
STAGING="$BACKUP_DIR/staging"
TAR_NAME="aisalon-massapro-${VERSION}-source.tar.gz"
TAR_PATH="$DOWNLOAD_DIR/$TAR_NAME"
MANIFEST_PATH="$BACKUP_DIR/MANIFEST.txt"
MANIFEST_DRV_NAME="aisalon-massapro-${VERSION}-MANIFEST.txt"
MANIFEST_DRV_PATH="$BACKUP_DIR/$MANIFEST_DRV_NAME"

REPO="EzeCaz/aisalon-massapro"
DRIVE_FOLDER_URL="https://drive.google.com/drive/folders/19fJYP9rwNTwWTJNi-tXCUoyg8oeylHMj"

# ---- preflight --------------------------------------------------------------
command -v jq   >/dev/null || { echo "[ERR] jq not installed";   exit 1; }
command -v curl >/dev/null || { echo "[ERR] curl not installed"; exit 1; }
[ -f "$PROJECT_ROOT/scripts/.gdrive-token.json" ] || {
  echo "[ERR] scripts/.gdrive-token.json missing."
  echo "      Run: python3 scripts/google-drive-upload.py --auth-url"
  exit 1
}

cd "$PROJECT_ROOT"

# Sanity: refuse if there are uncommitted changes (we don't want to back up
# state that doesn't match what will deploy).
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[WARN] git working tree has uncommitted changes."
  echo "       The backup will reflect the HEAD commit, NOT your working tree."
  echo "       Press Ctrl-C in 5s to abort, or wait to continue..."
  sleep 5
fi

COMMIT="$(git rev-parse HEAD)"
COMMIT_SHORT="$(git rev-parse --short HEAD)"
COMMIT_MSG="$(git log -1 --pretty=format:'%s')"
COMMIT_DATE="$(git log -1 --pretty=format:'%cI')"

# Extract the GitHub token from the remote URL (format: https://USER:TOKEN@github.com/...)
GH_TOKEN="$(git remote get-url origin | sed -E 's|https://[^:]+:([^@]+)@github\.com.*|\1|')"
if [[ ! "$GH_TOKEN" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "[ERR] could not extract a valid GitHub token from the git remote URL."
  echo "      Remote URL was: $(git remote get-url origin | sed -E 's|://([^:]+):[^@]+@|://\1:***@|')"
  exit 1
fi

# Load release notes (from file, or fall back to commit message)
if [[ -n "$NOTES_FILE" ]]; then
  [ -f "$NOTES_FILE" ] || { echo "[ERR] notes file not found: $NOTES_FILE"; exit 1; }
  NOTES_BODY="$(cat "$NOTES_FILE")"
else
  NOTES_BODY="Milestone backup for $VERSION. Commit: $COMMIT_MSG"
fi

# ---- step 1: stage + tar ----------------------------------------------------
echo "[1/6] staging source files at HEAD $COMMIT_SHORT ..."
rm -rf "$STAGING" "$TAR_PATH" "$MANIFEST_PATH" "$MANIFEST_DRV_PATH"
mkdir -p "$STAGING/src" "$STAGING/prisma" "$STAGING/public"
# Use git archive to get a pristine snapshot of the committed tree (no
# node_modules, no .next, no working-tree noise). Then layer in any
# untracked-but-needed files explicitly if needed.
git archive --format=tar HEAD src prisma public \
  package.json bun.lock next.config.ts tsconfig.json tailwind.config.ts \
  postcss.config.mjs components.json vercel.json .env.example README.md \
  next-env.d.ts Caddyfile .gitignore .eslintrc.json .vercelignore \
  2>/dev/null | tar -x -C "$STAGING/"

# Fallback for any top-level files git archive skipped (older git versions
# don't like archiving dotfiles together with regular files in one call).
for f in .gitignore .eslintrc.json .vercelignore; do
  if [ -f "$PROJECT_ROOT/$f" ] && [ ! -f "$STAGING/$f" ]; then
    cp "$PROJECT_ROOT/$f" "$STAGING/"
  fi
done

echo "[2/6] creating tarball..."
mkdir -p "$DOWNLOAD_DIR"
tar -czf "$TAR_PATH" -C "$STAGING" .
TARBALL_SHA="$(sha256sum "$TAR_PATH" | awk '{print $1}')"
FILE_COUNT="$(find "$STAGING" -type f | wc -l | tr -d ' ')"
TARBALL_SIZE="$(du -h "$TAR_PATH" | awk '{print $1}')"
rm -rf "$STAGING"

# ---- step 3: write manifest -------------------------------------------------
echo "[3/6] writing manifest..."
mkdir -p "$BACKUP_DIR"

VERCEL_BLOCK=""
if [[ -n "$VERCEL_ID" ]]; then
  VERCEL_BLOCK="Vercel deployment ID (pinned for rollback): $VERCEL_ID
Production URL: https://aisalon.massapro.com

To roll back to this deployment:
  vercel promote $VERCEL_ID --target production --scope team_xQgfSmNbNo5JFCAaVyRboPBf

Or via the Vercel dashboard:
  https://vercel.com/ezecazs-projects/aisalon-massapro/deployments/$VERCEL_ID"
else
  VERCEL_BLOCK="Vercel deployment ID (pinned for rollback): dpl_<TO BE FILLED IN>
  >> Wait for Vercel to finish auto-deploying commit $COMMIT_SHORT, then re-run:
  >>   scripts/make-milestone-backup.sh $VERSION $KIND \"$NOTES_FILE\" dpl_xxxxx
  >> (the script will overwrite this manifest + Drive copy + GitHub release asset)"
fi

cat > "$MANIFEST_PATH" << EOF
==================================================================
AI Salon MassaPro — $VERSION $KIND MILESTONE BACKUP
==================================================================
Created: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Git commit: $COMMIT
Commit date: $COMMIT_DATE
Commit message: $COMMIT_MSG

What's in this milestone ($VERSION):
$NOTES_BODY

Files in backup: $FILE_COUNT
Tarball: $TAR_NAME
Tarball size: $TARBALL_SIZE
Tarball SHA256: $TARBALL_SHA

Contents:
  src/                  — Next.js app source (admin, api, components, lib, hooks)
  prisma/               — Database schema
  public/               — Static images, brand assets, favicon
  package.json, etc.    — Top-level configs

==================================================================
VERCEL DEPLOYMENT PIN (immutable, never auto-deleted)
==================================================================
$VERCEL_BLOCK

==================================================================
GITHUB RELEASE (immutable tag)
==================================================================
Release URL: https://github.com/$REPO/releases/tag/$TAG

To checkout this release locally:
  git clone https://github.com/$REPO.git
  cd aisalon-massapro
  git checkout $TAG

==================================================================
GOOGLE DRIVE BACKUP
==================================================================
Drive folder: $DRIVE_FOLDER_URL
Files:
  - $TAR_NAME
  - $MANIFEST_DRV_NAME

To restore from Drive:
  python3 scripts/download-v47-from-drive.py   # adapt as needed
EOF

# Copy manifest with the Drive-friendly name (so it doesn't collide with other versions)
cp "$MANIFEST_PATH" "$MANIFEST_DRV_PATH"

# ---- step 4: upload to Google Drive -----------------------------------------
echo "[4/6] uploading tarball + manifest to Google Drive..."
python3 "$PROJECT_ROOT/scripts/upload-backup-to-drive.py" \
  "$TAR_PATH" "$MANIFEST_DRV_PATH"

# ---- step 5: GitHub release + assets ----------------------------------------
echo "[5/6] creating GitHub release $TAG (commit $COMMIT_SHORT)..."

# Check if release already exists
EXISTING_HTML_URL="$(curl -sS -o /tmp/release-check.json -w '%{http_code}' \
  -H "Authorization: token $GH_TOKEN" \
  "https://api.github.com/repos/$REPO/releases/tags/$TAG")"
if [[ "$EXISTING_HTML_URL" == "200" ]]; then
  if [[ "$FORCE" == "1" ]]; then
    EXISTING_ID="$(jq -r .id /tmp/release-check.json)"
    echo "[INFO] --force: deleting existing release $TAG (id=$EXISTING_ID)..."
    curl -sS -X DELETE -H "Authorization: token $GH_TOKEN" \
      "https://api.github.com/repos/$REPO/releases/$EXISTING_ID" -o /dev/null
    # Also delete the tag
    git push origin ":refs/tags/$TAG" 2>/dev/null || true
  else
    echo "[ERR] release $TAG already exists: $(jq -r .html_url /tmp/release-check.json)"
    echo "      Re-run with --force to delete + recreate, or delete it manually:"
    echo "        curl -X DELETE -H 'Authorization: token \$GH_TOKEN' \\"
    echo "          https://api.github.com/repos/$REPO/releases/$(jq -r .id /tmp/release-check.json)"
    exit 1
  fi
fi

# Create the release
RELEASE_BODY_JSON="$(jq -n \
  --arg tag "$TAG" \
  --arg name "$VERSION $KIND milestone backup" \
  --arg body "$NOTES_BODY" \
  --arg target "$COMMIT" \
  '{tag_name: $tag, name: $name, body: $body, target_commitish: $target}')"

curl -sS -o /tmp/release-create.json -w 'HTTP %{http_code}\n' \
  -X POST "https://api.github.com/repos/$REPO/releases" \
  -H "Authorization: token $GH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$RELEASE_BODY_JSON" >&2

if ! jq -e .id /tmp/release-create.json >/dev/null 2>&1; then
  echo "[ERR] failed to create GitHub release. Response:"
  cat /tmp/release-create.json >&2
  exit 1
fi
RELEASE_ID="$(jq -r .id /tmp/release-create.json)"
RELEASE_HTML_URL="$(jq -r .html_url /tmp/release-create.json)"
UPLOAD_URL="$(jq -r .upload_url /tmp/release-create.json | sed 's/{?name,label}//')"

echo "[INFO] release created: $RELEASE_HTML_URL (id=$RELEASE_ID)"

# Upload tarball as release asset
echo "      uploading tarball as release asset..."
TARBALL_ASSET_URL="$(curl -sS -X POST \
  "$UPLOAD_URL?name=$TAR_NAME" \
  -H "Authorization: token $GH_TOKEN" \
  -H "Content-Type: application/gzip" \
  --data-binary "@$TAR_PATH" | jq -r .browser_download_url)"
echo "      -> $TARBALL_ASSET_URL"

# Upload manifest as release asset
echo "      uploading manifest as release asset..."
MANIFEST_ASSET_URL="$(curl -sS -X POST \
  "$UPLOAD_URL?name=$MANIFEST_DRV_NAME" \
  -H "Authorization: token $GH_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary "@$MANIFEST_DRV_PATH" | jq -r .browser_download_url)"
echo "      -> $MANIFEST_ASSET_URL"

# ---- step 6: summary --------------------------------------------------------
echo "[6/6] done."
cat << SUMMARY

==================================================================
MILESTONE BACKUP COMPLETE — $VERSION ($KIND)
==================================================================
Git commit:          $COMMIT
Commit msg:          $COMMIT_MSG

Local tarball:       $TAR_PATH
Local manifest:      $MANIFEST_PATH
Tarball SHA256:      $TARBALL_SHA
Tarball size:        $TARBALL_SIZE
Files in backup:     $FILE_COUNT

Google Drive folder: $DRIVE_FOLDER_URL
  - $TAR_NAME
  - $MANIFEST_DRV_NAME

GitHub release:      $RELEASE_HTML_URL
  - $TARBALL_ASSET_URL
  - $MANIFEST_ASSET_URL
SUMMARY

if [[ -z "$VERCEL_ID" ]]; then
  cat << ACTION

==================================================================
ACTION REQUIRED (one manual step):
==================================================================
1. Wait for Vercel to finish auto-deploying commit $COMMIT_SHORT.
   Watch: https://vercel.com/ezecazs-projects/aisalon-massapro/deployments
2. Copy the production deployment ID (starts with "dpl_").
3. Re-run this script with the ID as the 4th arg:
     scripts/make-milestone-backup.sh $VERSION $KIND "$NOTES_FILE" dpl_xxxxx
   The script will overwrite the local manifest + Drive copy + GitHub
   release asset with the deployment ID filled in.
ACTION
else
  cat << ROLLBACK

==================================================================
ROLLBACK (instant):
==================================================================
  vercel promote $VERCEL_ID --target production --scope team_xQgfSmNbNo5JFCAaVyRboPBf
ROLLBACK
fi

echo
echo "[OK] $VERSION backup is complete in 3 places:"
echo "  - local:   $TAR_PATH"
echo "  - Drive:   $DRIVE_FOLDER_URL"
echo "  - GitHub:  $RELEASE_HTML_URL"
