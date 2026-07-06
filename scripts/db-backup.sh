#!/usr/bin/env bash
#
# scripts/db-backup.sh
# ───────────────────
# Back up the entire Postgres database (every Prisma model) to a
# gzipped JSON archive under download/backups/. Designed to run
# before any schema migration, and as a recurring cron job.
#
# Output:
#   download/backups/db-<YYYYMMDD-HHMMSS>-<short-sha>.json.gz
#   download/backups/db-latest.json.gz   (symlink to the newest)
#
# The JSON inside the gzip is shaped as:
#   {
#     "schemaVersion": "<prisma schema hash>",
#     "timestamp": "2026-07-07T12:34:56.000Z",
#     "models": {
#       "User": [ { ... }, ... ],
#       "Event": [ ... ],
#       ...
#     }
#   }
#
# Restore: pipe the file through `gunzip` and walk the JSON with a
# prisma script (see scripts/db-restore.ts — to be written when first
# needed).
#
# Google Drive sync: this script ONLY writes locally. To mirror to
# Google Drive, install rclone (https://rclone.org/install/) and run
# `scripts/sync-to-drive.sh` afterwards, OR add a cron entry like:
#
#   0 3 * * *  cd /home/z/my-project && ./scripts/db-backup.sh && ./scripts/sync-to-drive.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

# Load .env so DATABASE_URL is available to the Node script.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . .env
  set +a
fi

BACKUP_DIR="download/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
SHORT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'nogit')"
FILE="$BACKUP_DIR/db-${TIMESTAMP}-${SHORT_SHA}.json.gz"

echo "[db-backup] exporting every Prisma model to $FILE ..."

# Use bun if available (faster), fall back to npx tsx.
if command -v bun >/dev/null 2>&1; then
  bun run scripts/db-backup.ts "$FILE"
elif command -v npx >/dev/null 2>&1; then
  npx tsx scripts/db-backup.ts "$FILE"
else
  echo "[db-backup] ERROR: neither bun nor npx found in PATH." >&2
  exit 1
fi

# Update the "latest" symlink so external sync tools can grab a stable path.
ln -sf "$(basename "$FILE")" "$BACKUP_DIR/db-latest.json.gz"

# Print a small summary so cron logs are useful.
SIZE="$(du -h "$FILE" | cut -f1)"
MODELS="$(gunzip -c "$FILE" | node -e "
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const counts = Object.entries(j.models).map(([k, v]) => k + '=' + (Array.isArray(v) ? v.length : 0));
    console.log(counts.join(' '));
  });
")"

echo "[db-backup] OK  $FILE  ($SIZE)"
echo "[db-backup] models: $MODELS"

# ── Auto-sync to Google Drive ────────────────────────────────────
# Two methods supported (in priority order):
#
#   1. Python service-account (RECOMMENDED for headless servers)
#      Requires: GDRIVE_FOLDER_ID + GCP_SERVICE_ACCOUNT_PATH in .env,
#      plus `pip install google-auth google-api-python-client`.
#      See scripts/drive-backup.py for one-time setup instructions.
#
#   2. rclone OAuth (works if rclone is configured with a "gdrive" remote)
#      Requires: rclone installed, `rclone config` run once, and
#      RCLONE_DRIVE_FOLDER_ID in .env.
#
# Enable either by setting AUTO_SYNC_DRIVE=1 in .env or your shell.
if [ "${AUTO_SYNC_DRIVE:-0}" = "1" ]; then
  if [ -n "${GDRIVE_FOLDER_ID:-}" ] && [ -x "/usr/bin/python3" ] && [ -f "scripts/drive-backup.py" ]; then
    echo "[db-backup] AUTO_SYNC_DRIVE=1 — uploading to Google Drive via service account ..."
    if /usr/bin/python3 scripts/drive-backup.py --latest; then
      echo "[db-backup] Google Drive sync done."
    else
      echo "[db-backup] WARNING: drive-backup.py failed. See logs above." >&2
    fi
  elif [ -n "${RCLONE_DRIVE_FOLDER_ID:-}" ] && command -v rclone >/dev/null 2>&1; then
    echo "[db-backup] AUTO_SYNC_DRIVE=1 — copying to Google Drive via rclone ..."
    rclone copyto "$FILE" "gdrive:${RCLONE_DRIVE_FOLDER_ID:-aisalon-backups}/db/$(basename "$FILE")" \
      --drive-stop-on-upload-limit \
      --transfers 1 \
      --quiet
    echo "[db-backup] Google Drive sync done."
  else
    echo "[db-backup] WARNING: AUTO_SYNC_DRIVE=1 but no Drive method is configured." >&2
    echo "[db-backup]          Either set GDRIVE_FOLDER_ID + drop a service-account JSON" >&2
    echo "[db-backup]          (see scripts/drive-backup.py docstring) OR install rclone" >&2
    echo "[db-backup]          and run 'rclone config'. Skipping drive sync." >&2
  fi
fi
