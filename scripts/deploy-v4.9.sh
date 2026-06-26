#!/usr/bin/env bash
set -euo pipefail
cd /home/z/my-project
export VERCEL_TOKEN="VERCEL_PAT_REDACTED"
PROJECT_ID="prj_aoKtARAel8wlmcIlLRjjSPKshMLA"
TEAM_ID="team_xQgfSmNbNo5JFCAaVyRboPBf"

mkdir -p .vercel
cat > .vercel/project.json <<JSON
{
  "projectId": "$PROJECT_ID",
  "orgId": "$TEAM_ID",
  "settings": {}
}
JSON

echo "[1/2] Deploying V4.9 to Vercel production..."
npx -y vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN" 2>&1 | tail -30
echo ""
echo "[2/2] Done. Production URL: https://aisalon.massapro.com"
