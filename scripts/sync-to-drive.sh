#!/usr/bin/env bash
#
# scripts/sync-to-drive.sh
# ────────────────────────
# Mirror the most recent database backup (and any other files under
# download/backups/) to Google Drive using rclone.
#
# Prerequisites (ONE-TIME SETUP):
#
# 1. Install rclone:
#      curl https://rclone.org/install.sh | sudo bash
#    (or on macOS:  brew install rclone)
#
# 2. Configure a Google Drive remote:
#      rclone config
#      # Choose: n) new remote
#      # Name: gdrive
#      # Storage: drive (Google Drive)
#      # Client ID/secret: leave blank (use rclone's own) OR set your own
#      # Scope: 1 (full access)
#      # When prompted, open the printed URL in a browser and authorize.
#
# 3. Create a folder on Google Drive named e.g. "aisalon-backups" and
#    copy its ID from the URL (https://drive.google.com/drive/folders/<ID>).
#
# 4. Add to /home/z/my-project/.env:
#      RCLONE_DRIVE_FOLDER_ID=<the folder ID from step 3>
#      AUTO_SYNC_DRIVE=1   # so db-backup.sh will call this script automatically
#
# 5. (Optional) add a nightly cron entry:
#      0 3 * * *  cd /home/z/my-project && ./scripts/db-backup.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v rclone >/dev/null 2>&1; then
  echo "[sync-to-drive] ERROR: rclone is not installed." >&2
  echo "[sync-to-drive]        See the header of this file for setup instructions." >&2
  exit 1
fi

# Load .env for RCLONE_DRIVE_FOLDER_ID.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . .env
  set +a
fi

REMOTE="gdrive"
FOLDER="${RCLONE_DRIVE_FOLDER_ID:-aisalon-backups}"
SRC="download/backups"

if [ ! -d "$SRC" ]; then
  echo "[sync-to-drive] No $SRC directory yet — nothing to sync."
  exit 0
fi

echo "[sync-to-drive] rclone: $SRC/ → $REMOTE:$FOLDER/db/  (mirror, no deletes)"
rclone sync "$SRC" "$REMOTE:$FOLDER/db" \
  --transfers 4 \
  --checkers 8 \
  --drive-stop-on-upload-limit \
  --drive-use-trash=false \
  --stats=10s \
  --stats-one-line \
  -v

echo "[sync-to-drive] OK"
