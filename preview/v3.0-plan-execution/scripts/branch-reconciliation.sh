#!/usr/bin/env bash
# branch-reconciliation.sh — PREVIEW
# Activation: copy to scripts/branch-reconciliation.sh
#
# Implements AISalon-Team-Plan-V3.0 §4.1 root cause #2 (branch reconciliation).
#
# IMPORTANT: By default this script runs in DRY-RUN mode — it ONLY shows what
# would happen. Pass --apply to actually perform the rebase + force-push.
#
# The local main branch has diverged from origin/main (52 ahead, 39 behind per
# the plan §2). This script helps reconcile safely:
#   1. Verify a backup tag exists (refuses to run without one)
#   2. Fetch latest origin
#   3. Show the divergence (commits ahead, commits behind)
#   4. In --apply mode: rebase local onto origin/main, then force-push
#   5. After rebase: verify build still passes
#
# Usage:
#   ./scripts/branch-reconciliation.sh                 # dry-run (default)
#   ./scripts/branch-reconciliation.sh --apply         # actually rebase + push
#   ./scripts/branch-reconciliation.sh --apply --no-verify  # skip post-rebase build

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

APPLY=0
NO_VERIFY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --no-verify) NO_VERIFY=1 ;;
    --help|-h)
      echo "Usage: $0 [--apply] [--no-verify]"
      echo "  --apply      Actually perform the rebase + force-push (default: dry-run)"
      echo "  --no-verify  Skip the post-rebase build check"
      exit 0
      ;;
  esac
done

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

echo "============================================================"
echo "  Branch Reconciliation — main ↔ origin/main"
echo "  Mode: $([ $APPLY -eq 1 ] && echo 'APPLY' || echo 'DRY-RUN')"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

# Step 1 — Verify backup tag exists
echo -e "\n1. Verify backup tag exists"
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -z "$LATEST_TAG" ]; then
  echo -e "  ${RED}FAIL${NC} no git tag found — create one before reconciling"
  echo "  Run: ./scripts/backup-to-github.sh v3.0.0"
  exit 1
fi
TAG_AGE=$(git log -1 --format="%ci" "$LATEST_TAG" 2>/dev/null | cut -d' ' -f1)
echo -e "  ${GREEN}OK${NC} latest tag: $LATEST_TAG (from $TAG_AGE)"

# Step 2 — Fetch origin
echo -e "\n2. Fetch origin"
git fetch origin main 2>&1 | sed 's/^/  /'
echo -e "  ${GREEN}OK${NC} fetched"

# Step 3 — Show divergence
echo -e "\n3. Branch divergence"
AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
echo "  Local main is $AHEAD commits ahead, $BEHIND commits behind origin/main"

if [ "$AHEAD" -eq 0 ] && [ "$BEHIND" -eq 0 ]; then
  echo -e "  ${GREEN}OK${NC} branches are in sync — nothing to do"
  exit 0
fi

if [ "$BEHIND" -eq 0 ]; then
  echo -e "  ${GREEN}OK${NC} local is ahead only — push normally: git push origin main"
  if [ $APPLY -eq 1 ]; then
    git push origin main
  fi
  exit 0
fi

echo ""
echo "  Commits on local main NOT on origin/main (ahead):"
git log origin/main..HEAD --oneline 2>/dev/null | head -20 | sed 's/^/    /'
if [ "$AHEAD" -gt 20 ]; then
  echo "    ... and $((AHEAD - 20)) more"
fi

echo ""
echo "  Commits on origin/main NOT on local main (behind):"
git log HEAD..origin/main --oneline 2>/dev/null | head -20 | sed 's/^/    /'
if [ "$BEHIND" -gt 20 ]; then
  echo "    ... and $((BEHIND - 20)) more"
fi

# Step 4 — Check for potential conflicts
echo -e "\n4. Conflict preview"
MERGE_BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo "")
if [ -n "$MERGE_BASE" ]; then
  CONFLICTS=$(git diff --name-only origin/main...HEAD | xargs -I{} git log --oneline origin/main..HEAD -- {} 2>/dev/null | wc -l || echo 0)
  echo "  Files changed on local since merge-base:"
  git diff --name-only origin/main...HEAD | head -20 | sed 's/^/    /'
  echo ""
  echo "  Files changed on origin since merge-base:"
  git diff --name-only HEAD...origin/main | head -20 | sed 's/^/    /'
  echo ""
  OVERLAP=$(comm -12 <(git diff --name-only origin/main...HEAD | sort) <(git diff --name-only HEAD...origin/main | sort))
  if [ -n "$OVERLAP" ]; then
    echo -e "  ${YELLOW}WARN${NC} files changed on BOTH sides — likely conflicts:"
    echo "$OVERLAP" | sed 's/^/    /'
  else
    echo -e "  ${GREEN}OK${NC} no overlapping files — rebase should be clean"
  fi
fi

if [ $APPLY -eq 0 ]; then
  echo -e "\n============================================================"
  echo -e "  ${YELLOW}DRY-RUN COMPLETE${NC} — no changes made"
  echo "  To actually rebase + push: $0 --apply"
  echo "  ⚠️  This will REWRITE history on origin/main (force-push)."
  echo "  ⚠️  Ensure all collaborators are notified before --apply."
  echo "============================================================"
  exit 0
fi

# Step 5 — Apply: rebase
echo -e "\n5. Rebase local main onto origin/main"
git rebase origin/main 2>&1 | sed 's/^/  /'
if [ $? -ne 0 ]; then
  echo -e "  ${RED}FAIL${NC} rebase encountered conflicts"
  echo "  Resolve them manually, then:"
  echo "    git rebase --continue"
  echo "    git push --force-with-lease origin main"
  exit 1
fi
echo -e "  ${GREEN}OK${NC} rebase complete"

# Step 6 — Post-rebase build verification
if [ $NO_VERIFY -eq 0 ]; then
  echo -e "\n6. Post-rebase build verification"
  if bun run build >/tmp/post-rebase-build.log 2>&1; then
    echo -e "  ${GREEN}OK${NC} build passes after rebase"
  else
    echo -e "  ${RED}FAIL${NC} build fails after rebase — DO NOT PUSH"
    echo "  See /tmp/post-rebase-build.log"
    tail -20 /tmp/post-rebase-build.log | sed 's/^/    /'
    echo ""
    echo "  To undo the rebase: git rebase --abort  (if still in progress)"
    echo "  Or reset to pre-rebase state: git reset --hard ORIG_HEAD"
    exit 1
  fi
fi

# Step 7 — Force-push with lease (safer than --force)
echo -e "\n7. Force-push (with lease) to origin/main"
git push --force-with-lease origin main 2>&1 | sed 's/^/  /'
echo -e "  ${GREEN}OK${NC} pushed"

# Step 8 — Verify sync
echo -e "\n8. Verify sync"
AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [ "$AHEAD" -eq 0 ] && [ "$BEHIND" -eq 0 ]; then
  echo -e "  ${GREEN}OK${NC} branches in sync"
else
  echo -e "  ${YELLOW}WARN${NC} still divergent: $AHEAD ahead, $BEHIND behind"
fi

echo -e "\n============================================================"
echo -e "  ${GREEN}RECONCILIATION COMPLETE${NC}"
echo "============================================================"
