#!/usr/bin/env bash
# Regression audit: compare V4.8 backup against the current /home/z/my-project.
# Reports:
#   1. Files that EXIST in V4.8 but are MISSING in current code (regression!)
#   2. Files that are NEW in current code (additions, OK)
#   3. Routes count comparison (using find on src/app/**/page.tsx + route.ts)
#
# Exit code: 0 = no regressions, 1 = regressions detected.
set -uo pipefail

OLD_ROOT="/tmp/v48-audit/aisalon-massapro-V4.8"
NEW_ROOT="/home/z/my-project"

echo "============================================================"
echo "  V4.8 → V4.9 Regression Audit"
echo "  OLD: $OLD_ROOT"
echo "  NEW: $NEW_ROOT"
echo "============================================================"
echo ""

# ---- 1. Files in V4.8 that are MISSING in current code (REGRESSION) ----
echo "[1/3] Files in V4.8 but MISSING in current code (REGRESSIONS):"
echo "------------------------------------------------------------"
# Get relative paths of all source files in V4.8 (excluding node_modules, .next, .git, build artifacts)
MISSING_COUNT=0
while IFS= read -r relpath; do
  if [ ! -f "$NEW_ROOT/$relpath" ]; then
    echo "  ❌ MISSING: $relpath"
    MISSING_COUNT=$((MISSING_COUNT + 1))
  fi
done < <(cd "$OLD_ROOT" && find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" -o -name "*.css" -o -name "*.md" \) 2>/dev/null | sort)

if [ "$MISSING_COUNT" -eq 0 ]; then
  echo "  ✓ No source files missing from current code."
else
  echo ""
  echo "  ⚠️  $MISSING_COUNT file(s) missing — investigate before deploy!"
fi
echo ""

# ---- 2. Files NEW in current code (additions, OK) ----
echo "[2/3] Files NEW in current code (additions since V4.8):"
echo "------------------------------------------------------------"
NEW_COUNT=0
while IFS= read -r relpath; do
  if [ ! -f "$OLD_ROOT/$relpath" ]; then
    echo "  ✨ NEW: $relpath"
    NEW_COUNT=$((NEW_COUNT + 1))
  fi
done < <(cd "$NEW_ROOT" && find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" -o -name "*.css" -o -name "*.md" \) 2>/dev/null | sort)
if [ "$NEW_COUNT" -eq 0 ]; then
  echo "  (no new files)"
fi
echo "  Total new files: $NEW_COUNT"
echo ""

# ---- 3. Routes comparison ----
echo "[3/3] Routes comparison:"
echo "------------------------------------------------------------"
OLD_ROUTES=$(cd "$OLD_ROOT" && find src/app -type f \( -name "page.tsx" -o -name "route.ts" \) 2>/dev/null | sort)
NEW_ROUTES=$(cd "$NEW_ROOT" && find src/app -type f \( -name "page.tsx" -o -name "route.ts" \) 2>/dev/null | sort)
OLD_ROUTE_COUNT=$(echo "$OLD_ROUTES" | wc -l)
NEW_ROUTE_COUNT=$(echo "$NEW_ROUTES" | wc -l)
echo "  V4.8 routes: $OLD_ROUTE_COUNT"
echo "  V4.9 routes: $NEW_ROUTE_COUNT"
echo ""
echo "  Routes in V4.8 but MISSING in V4.9:"
MISSING_ROUTES=0
while IFS= read -r r; do
  [ -z "$r" ] && continue
  if [ ! -f "$NEW_ROOT/$r" ]; then
    echo "    ❌ $r"
    MISSING_ROUTES=$((MISSING_ROUTES + 1))
  fi
done <<< "$OLD_ROUTES"
if [ "$MISSING_ROUTES" -eq 0 ]; then
  echo "    ✓ No routes missing."
fi
echo ""
echo "  Routes NEW in V4.9:"
while IFS= read -r r; do
  [ -z "$r" ] && continue
  if [ ! -f "$OLD_ROOT/$r" ]; then
    echo "    ✨ $r"
  fi
done <<< "$NEW_ROUTES"
echo ""
echo "============================================================"
if [ "$MISSING_COUNT" -gt 0 ] || [ "$MISSING_ROUTES" -gt 0 ]; then
  echo "  ❌ REGRESSION DETECTED — do not deploy until resolved."
  exit 1
else
  echo "  ✓ No regressions detected — safe to deploy."
  exit 0
fi
echo "============================================================"
