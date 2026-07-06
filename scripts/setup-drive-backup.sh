#!/usr/bin/env bash
#
# scripts/setup-drive-backup.sh
# ─────────────────────────────
# Interactive helper that walks you through setting up Google Drive
# backups for the AI Salon database. Run this ONCE.
#
# What it does:
#   1. Verifies Python + google-auth are installed (installs if missing).
#   2. Asks you to drop a Google Service Account JSON at
#      /home/z/my-project/.gcp-service-account.json
#   3. Asks for the Google Drive folder ID where backups should land.
#   4. Writes GDRIVE_FOLDER_ID + AUTO_SYNC_DRIVE=1 to .env.
#   5. Runs a one-shot backup + upload to verify everything works.
#   6. (Optionally) installs a nightly cron entry.
#
# For the service account JSON + Drive folder setup, see the
# docstring at the top of scripts/drive-backup.py.
#
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_ROOT="$(pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
SA_FILE="$PROJECT_ROOT/.gcp-service-account.json"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
dim()  { printf '\033[2m%s\033[0m\n' "$*"; }
red()  { printf '\033[31m%s\033[0m\n' "$*"; }
green(){ printf '\033[32m%s\033[0m\n' "$*"; }

echo
bold "═══════════════════════════════════════════════════════════════"
bold "  Google Drive backup setup — AI Salon Tel Aviv"
bold "═══════════════════════════════════════════════════════════════"
echo
echo "This script wires up nightly DB backups → Google Drive."
echo "It uses a Google Service Account (no browser OAuth needed)."
echo
echo "Prerequisites (do these in your Google Cloud Console first):"
echo
dim "  1. Open https://console.cloud.google.com/"
dim "  2. Enable the Google Drive API for your project."
dim "  3. Create a Service Account, then download its JSON key."
dim "  4. Create a folder on your personal Google Drive (e.g."
dim "     'AI Salon Backups'). Copy its ID from the URL."
dim "  5. SHARE that folder with the service account email as Editor."
echo
echo "Full step-by-step: see the docstring at the top of"
echo "  scripts/drive-backup.py"
echo
read -r -p "Have you completed steps 1–5 above? [y/N] " ready
if [[ ! "$ready" =~ ^[Yy]$ ]]; then
  echo "OK — go complete the steps above, then re-run this script."
  exit 0
fi
echo

# ── Step 1: Check Python + google libs ───────────────────────────
bold "Step 1 — Verifying Python + Google API libraries ..."
if ! /usr/bin/python3 -c "from google.oauth2 import service_account" 2>/dev/null; then
  echo "  Installing google-auth + google-api-python-client ..."
  pip install --break-system-packages --quiet \
    google-auth google-auth-oauthlib google-api-python-client
fi
if /usr/bin/python3 -c "from google.oauth2 import service_account; from googleapiclient.discovery import build" 2>/dev/null; then
  green "  ✓ Google API libraries ready."
else
  red "  ✗ Failed to install Google API libraries. Run manually:"
  echo "    pip install --break-system-packages google-auth google-api-python-client"
  exit 1
fi
echo

# ── Step 2: Service account JSON ─────────────────────────────────
bold "Step 2 — Service account JSON ..."
if [ -f "$SA_FILE" ]; then
  green "  ✓ Found existing $SA_FILE"
  read -r -p "  Replace it with a new one? [y/N] " replace
  if [[ "$replace" =~ ^[Yy]$ ]]; then
    echo "  Drop the new JSON at: $SA_FILE"
    read -r -p "  Press Enter when done ... "
  fi
else
  echo "  Drop the service account JSON at:"
  echo "    $SA_FILE"
  read -r -p "  Press Enter when done ... "
fi
if [ ! -f "$SA_FILE" ]; then
  red "  ✗ $SA_FILE not found. Aborting."
  exit 1
fi
chmod 600 "$SA_FILE"
green "  ✓ $SA_FILE ready (chmod 600)."
# Show the service account email so the user knows what to share the folder with.
SA_EMAIL=$(/usr/bin/python3 -c "import json; print(json.load(open('$SA_FILE'))['client_email'])" 2>/dev/null || echo "unknown")
echo "  Service account email: $SA_EMAIL"
echo "  (If you haven't yet, share your Drive folder with this email as Editor.)"
echo

# ── Step 3: Drive folder ID ──────────────────────────────────────
bold "Step 3 — Google Drive folder ID ..."
echo "  Open your Drive folder in the browser. The URL looks like:"
echo "    https://drive.google.com/drive/folders/<FOLDER_ID>"
echo "  Paste the FOLDER_ID (the long string after /folders/):"
read -r -p "  > " FOLDER_ID
if [ -z "$FOLDER_ID" ]; then
  red "  ✗ No folder ID entered. Aborting."
  exit 1
fi
echo "  Folder ID: $FOLDER_ID"
echo

# ── Step 4: Write to .env ────────────────────────────────────────
bold "Step 4 — Writing config to .env ..."
touch "$ENV_FILE"
# Remove any existing entries for the keys we manage.
sed -i '/^GDRIVE_FOLDER_ID=/d; /^GCP_SERVICE_ACCOUNT_PATH=/d; /^AUTO_SYNC_DRIVE=/d' "$ENV_FILE"
{
  echo ""
  echo "# Google Drive backup (managed by scripts/setup-drive-backup.sh)"
  echo "GDRIVE_FOLDER_ID=$FOLDER_ID"
  echo "GCP_SERVICE_ACCOUNT_PATH=$SA_FILE"
  echo "AUTO_SYNC_DRIVE=1"
} >> "$ENV_FILE"
green "  ✓ .env updated."
echo

# ── Step 5: Verify by running a real backup + upload ─────────────
bold "Step 5 — Test run: backup + upload to Google Drive ..."
read -r -p "  Run a test backup now? [Y/n] " test_run
if [[ ! "$test_run" =~ ^[Nn]$ ]]; then
  echo "  Running scripts/db-backup.sh ..."
  if bash scripts/db-backup.sh; then
    green "  ✓ Backup + Drive sync successful."
  else
    red "  ✗ Test run failed. Check the output above."
    exit 1
  fi
fi
echo

# ── Step 6: Optional cron ────────────────────────────────────────
bold "Step 6 — Nightly cron job (optional) ..."
echo "  Recommended cron entry (runs nightly at 3 AM server time):"
echo
echo "    0 3 * * *  cd $PROJECT_ROOT && bash scripts/db-backup.sh >> .dev-server.log 2>&1"
echo
read -r -p "  Install this cron entry now? [y/N] " install_cron
if [[ "$install_cron" =~ ^[Yy]$ ]]; then
  CRON_LINE="0 3 * * *  cd $PROJECT_ROOT && bash scripts/db-backup.sh >> $PROJECT_ROOT/.dev-server.log 2>&1"
  # Add only if not already present.
  if crontab -l 2>/dev/null | grep -qF "$CRON_LINE"; then
    green "  ✓ Cron entry already present."
  else
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
    green "  ✓ Cron entry installed. Backups will run nightly at 3:00 AM."
  fi
fi
echo
green "═══════════════════════════════════════════════════════════════"
green "  Setup complete. Backups will land in:"
green "  Google Drive → $FOLDER_ID/db/db-<timestamp>-<sha>.json.gz"
green "═══════════════════════════════════════════════════════════════"
