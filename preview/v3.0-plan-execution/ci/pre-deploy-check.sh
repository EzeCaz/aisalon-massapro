#!/usr/bin/env bash
# Pre-deploy checklist — PREVIEW
# Activation: copy this file to scripts/pre-deploy-check.sh in the repo root.
#
# Implements AISalon-Team-Plan-V3.0 §4.2 Pre-Deploy Checklist.
# Run this BEFORE every production deploy. Exit non-zero on any failure.
#
# Usage:
#   ./scripts/pre-deploy-check.sh                # full check
#   ./scripts/pre-deploy-check.sh --skip-build   # skip the slow bun run build
#   ./scripts/pre-deploy-check.sh --help

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --help|-h)
      echo "Usage: $0 [--skip-build]"
      echo "  --skip-build  Skip the slow 'bun run build' step (use only if you just built)"
      exit 0
      ;;
  esac
done

PASS=0
FAIL=0
WARN=0

check() {
  local label="$1"
  local cmd="$2"
  local optional="${3:-false}"
  echo -n "  [ ] $label ... "
  if eval "$cmd" >/tmp/predeploy.log 2>&1; then
    echo -e "${GREEN}OK${NC}"
    PASS=$((PASS+1))
  else
    if [ "$optional" = "true" ]; then
      echo -e "${YELLOW}WARN${NC}"
      cat /tmp/predeploy.log | sed 's/^/      /'
      WARN=$((WARN+1))
    else
      echo -e "${RED}FAIL${NC}"
      cat /tmp/predeploy.log | sed 's/^/      /'
      FAIL=$((FAIL+1))
    fi
  fi
}

echo "============================================================"
echo "  Pre-Deploy Checklist — AI Salon Tel Aviv"
echo "  Plan ref: AISalon-Team-Plan-V3.0 §4.2"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"
echo ""

echo "1. LOCAL BUILD"
if [ "$SKIP_BUILD" -eq 1 ]; then
  echo -e "  ${YELLOW}SKIP${NC} --skip-build passed"
else
  check "bun run build exits 0" "bun run build"
fi
check "TypeScript clean (tsc --noEmit)" "bunx tsc --noEmit"
check "ESLint clean (bun run lint)" "bun run lint"
echo ""

echo "2. WORKING TREE"
check "git status is clean" "test -z \"\$(git status --porcelain)\""
echo ""

echo "3. BRANCH DRIFT (per plan §4.1 — reconciliation)"
AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "?")
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "?")
echo "  Local main is $AHEAD ahead, $BEHIND behind origin/main"
if [ "$AHEAD" = "0" ] && [ "$BEHIND" = "0" ]; then
  echo -e "  ${GREEN}OK${NC} in sync with origin"
  PASS=$((PASS+1))
elif [ "$BEHIND" = "0" ]; then
  echo -e "  ${GREEN}OK${NC} ahead only (safe to deploy)"
  PASS=$((PASS+1))
else
  echo -e "  ${YELLOW}WARN${NC} local is behind origin — pull/rebase before deploy"
  WARN=$((WARN+1))
fi
echo ""

echo "4. INTENDED COMMITS"
echo "  Commits on HEAD not on origin/main:"
git log origin/main..HEAD --oneline 2>/dev/null | head -10 | sed 's/^/    /'
if [ -z "$(git log origin/main..HEAD --oneline 2>/dev/null)" ]; then
  echo "    (none — deploying origin/main HEAD)"
fi
echo ""

echo "5. ENV VAR DRIFT (per plan §4.2 item 6)"
if [ -f .env.example ] && command -v vercel >/dev/null 2>&1; then
  check "vercel env ls matches .env.example keys" \
    "diff <(grep -E '^[A-Z_]+=' .env.example | cut -d= -f1 | sort) <(vercel env ls production 2>/dev/null | awk '{print \$1}' | sort)" \
    "true"
else
  echo -e "  ${YELLOW}SKIP${NC} .env.example or vercel CLI not available"
  WARN=$((WARN+1))
fi
echo ""

echo "6. SMOKE TEST"
if [ -f scripts/prod-smoke-test-extended.mjs ]; then
  echo -e "  ${GREEN}OK${NC} scripts/prod-smoke-test-extended.mjs exists"
  PASS=$((PASS+1))
elif [ -f scripts/prod-smoke-test.mjs ]; then
  echo -e "  ${YELLOW}WARN${NC} only legacy scripts/prod-smoke-test.mjs — promote extended version"
  WARN=$((WARN+1))
else
  echo -e "  ${RED}FAIL${NC} no smoke test script found"
  FAIL=$((FAIL+1))
fi
echo ""

echo "7. VERSION TAG"
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")
echo "  Latest tag: $LATEST_TAG"
echo "  HEAD:       $(git rev-parse --short HEAD)"
if git describe --tags --exact-match HEAD >/dev/null 2>&1; then
  echo -e "  ${GREEN}OK${NC} HEAD is tagged"
  PASS=$((PASS+1))
else
  echo -e "  ${YELLOW}WARN${NC} HEAD is not tagged — tag v3.x.0 before or right after deploy"
  WARN=$((WARN+1))
fi
echo ""

echo "8. MIGRATIONS"
if [ -d prisma/migrations ]; then
  NEW_MIGRATIONS=$(find prisma/migrations -name migration.sql -newer prisma/migrations/.last-applied 2>/dev/null | wc -l || echo 0)
  if [ "$NEW_MIGRATIONS" -gt 0 ]; then
    echo -e "  ${YELLOW}WARN${NC} $NEW_MIGRATIONS unverified migration(s) — run on staging first"
    WARN=$((WARN+1))
  else
    echo -e "  ${GREEN}OK${NC} no unverified migrations"
    PASS=$((PASS+1))
  fi
else
  echo -e "  ${GREEN}OK${NC} no migrations directory (SQLite push-based schema)"
  PASS=$((PASS+1))
fi
echo ""

echo "============================================================"
echo "  SUMMARY: $PASS passed, $WARN warnings, $FAIL failures"
echo "============================================================"

if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}RESULT: BLOCK DEPLOY${NC} — fix failures before proceeding"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo -e "  ${YELLOW}RESULT: PROCEED WITH CAUTION${NC} — review warnings"
  exit 0
else
  echo -e "  ${GREEN}RESULT: CLEAR TO DEPLOY${NC}"
  exit 0
fi
