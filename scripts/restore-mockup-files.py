#!/usr/bin/env python3
"""
Restore mockup editor files from old Vercel deployment into current src/.
- Copies 7 entirely-missing files
- Overwrites 11 differing mockup files with old versions
- PRESERVES all current non-mockup files (salon pages, auth.ts fix, etc.)
- DOES NOT touch: app/resources/, components/salon/, lib/salon-data/,
  lib/auth.ts, app/admin/registrants/, app/globals.css, app/login/page.tsx,
  components/ais/app-header.tsx, hooks/use-local-storage.ts,
  app/api/admin/events/[id]/mockup-defaults/route.ts
"""
import shutil
from pathlib import Path

OLD = Path("/home/z/my-project/old-deployment/files/src")
NEW = Path("/home/z/my-project/src")

# Files to RESTORE from old (entirely missing OR differing mockup files)
MOCKUP_FILES_TO_RESTORE = [
    # --- entirely missing ---
    "app/admin/mockups/agenda-profile/agenda-profile-canvas.tsx",
    "app/admin/mockups/agenda-profile/agenda-profile-editor.tsx",
    "app/admin/mockups/agenda-profile/event-mapper.ts",
    "app/admin/mockups/agenda-profile/page.tsx",
    "app/admin/mockups/agenda-profile/sample-data.ts",
    "app/admin/mockups/agenda-profile/types.ts",
    "app/admin/mockups/shared/section-edit.tsx",
    # --- differing mockup files: replace with old ---
    "app/admin/mockups/event-profile/event-mapper.ts",
    "app/admin/mockups/event-profile/event-profile-canvas.tsx",
    "app/admin/mockups/event-profile/event-profile-editor.tsx",
    "app/admin/mockups/event-profile/page.tsx",
    "app/admin/mockups/event-profile/sample-data.ts",
    "app/admin/mockups/event-profile/types.ts",
    "app/admin/mockups/meet-the-speaker/event-mapper.ts",
    "app/admin/mockups/meet-the-speaker/meet-the-speaker-canvas.tsx",
    "app/admin/mockups/meet-the-speaker/meet-the-speaker-editor.tsx",
    "app/admin/mockups/meet-the-speaker/types.ts",
    "app/admin/mockups/mockups-client.tsx",
    "app/admin/mockups/shared/event-profile-form-view.tsx",
    "app/admin/mockups/shared/meet-the-speaker-form-view.tsx",
    "app/admin/mockups/shared/speaker-intro-form-view.tsx",
    "app/admin/mockups/speaker-intro/event-mapper.ts",
    "app/admin/mockups/speaker-intro/speaker-intro-canvas.tsx",
    "app/admin/mockups/speaker-intro/speaker-intro-editor.tsx",
    "app/admin/mockups/speaker-intro/types.ts",
]

print(f"Restoring {len(MOCKUP_FILES_TO_RESTORE)} mockup files from old deployment...")
for rel in MOCKUP_FILES_TO_RESTORE:
    src = OLD / rel
    dst = NEW / rel
    if not src.exists():
        print(f"  SKIP (not in old): {rel}")
        continue
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    print(f"  OK  {rel}")

print("\nDone. Non-mockup files (salon pages, auth, etc.) preserved.")
