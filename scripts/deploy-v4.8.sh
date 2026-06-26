#!/usr/bin/env bash
set -euo pipefail
cd /home/z/my-project
export VERCEL_TOKEN="VERCEL_PAT_REDACTED"
PROJECT_ID="prj_aoKtARAel8wlmcIlLRjjSPKshMLA"
TEAM_ID="team_xQgfSmNbNo5JFCAaVyRboPBf"

# Write .vercel/project.json so vercel CLI knows the project
mkdir -p .vercel
cat > .vercel/project.json <<JSON
{
  "projectId": "$PROJECT_ID",
  "orgId": "$TEAM_ID",
  "settings": {}
}
JSON

echo "[1/2] Deploying to Vercel production..."
npx -y vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN" 2>&1 | tail -30
echo ""
echo "[2/2] Done. Production URL: https://aisalon.massapro.com"
