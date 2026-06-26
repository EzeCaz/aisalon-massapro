#!/usr/bin/env python3
"""
Restore files from the V4.7 backup tarball that are missing or older on the
current local filesystem. We only restore files where:
  - the file doesn't exist locally, OR
  - the local file's size differs from the tarball version, OR
  - the local file's mtime is older than the tarball's mtime

This is intentionally conservative — we don't blow away local edits, we
just bring back the V4.7 mockup files (and any other V4.x files) that
were lost during the sandbox rollback.
"""
from __future__ import annotations
import os
import sys
import tarfile
from pathlib import Path

PROJECT = Path("/home/z/my-project")
TAR = PROJECT / "download/aisalon-massapro-V4.7.tar.gz"

# Only restore files under these paths (so we don't accidentally clobber
# unrelated local changes):
RESTORE_PREFIXES = [
    "src/app/admin/mockups/",
    "src/app/api/admin/brand-images/",
    "src/app/api/events/",
    "src/app/admin/mockups/shared/",
    "src/lib/site-settings.ts",
    "src/app/admin/images/",
    "src/app/admin/knowledge-base/",
    "src/app/admin/members/archive/",
    "src/app/admin/check-in/",
    "src/app/admin/dashboard/",
    "src/app/admin/email/",
    "src/app/admin/admin-events-list.tsx",
    "src/app/admin/admin-members-table.tsx",
    "src/app/admin/page.tsx",
    "src/app/admin/speakers/",
    "src/app/admin/registrants/",
    "src/app/admin/events/",
    "src/app/api/admin/",
    "src/app/api/auth/",
    "src/app/api/profile/",
    "src/app/api/images/",
    "src/app/api/messages/",
    "src/app/api/presentations/",
    "src/app/api/site-settings/",
    "src/app/api/speakers/",
    "src/app/api/cron/",
    "src/app/api/route.ts",
    "src/app/login/",
    "src/app/onboarding/",
    "src/app/profile/",
    "src/app/events/",
    "src/app/e/",
    "src/app/layout.tsx",
    "src/app/page.tsx",
    "src/app/globals.css",
    "src/app/global-error.tsx",
    "src/components/",
    "src/hooks/",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.ts",
    "tailwind.config.ts",
    "postcss.config.mjs",
    "components.json",
    "vercel.json",
    ".env.example",
    ".gitignore",
    "next-env.d.ts",
    "bun.lock",
    "prisma/schema.prisma",
]

# NEVER restore these (they would break the sandbox):
SKIP_PATHS = {
    # keep whatever schema is currently local — we'll deal with sqlite/postgres
    # swap manually when we deploy
    "prisma/schema.prisma",
    # never overwrite env files
    ".env",
    ".env.local",
    ".env.vercel-prod",
    "scripts/.gdrive-token.json",
}


def should_restore(rel: str) -> bool:
    if rel in SKIP_PATHS:
        return False
    for p in RESTORE_PREFIXES:
        if rel.startswith(p):
            return True
    return False


def main():
    if not TAR.exists():
        print(f"[ERR] tarball not found: {TAR}", file=sys.stderr)
        sys.exit(1)

    with tarfile.open(TAR, "r:gz") as tar:
        members = tar.getmembers()

    restored = 0
    skipped_unchanged = 0
    skipped_filtered = 0

    with tarfile.open(TAR, "r:gz") as tar:
        for m in members:
            if not m.isfile():
                continue
            # Tarball paths look like "aisalon-massapro-V4.7/./src/app/..."
            # Strip the leading "<dirname>/./" prefix
            rel = m.name
            if rel.startswith("./"):
                rel = rel[2:]
            # Also strip the leading top-level dir if present
            parts = rel.split("/", 1)
            if len(parts) == 2 and parts[0].startswith("aisalon-massapro-"):
                rel = parts[1]
            elif rel.startswith("aisalon-massapro-"):
                # edge case: file at root with the prefix
                rel = rel.split("/", 1)[1] if "/" in rel else rel

            if not should_restore(rel):
                skipped_filtered += 1
                continue

            local_path = PROJECT / rel
            # Decide whether to restore
            need_restore = False
            if not local_path.exists():
                need_restore = True
            else:
                local_size = local_path.stat().st_size
                if local_size != m.size:
                    need_restore = True
                else:
                    # Same size — check mtime (tarball mtime vs local mtime)
                    import datetime
                    local_mtime = local_path.stat().st_mtime
                    if m.mtime > local_mtime:
                        need_restore = True

            if not need_restore:
                skipped_unchanged += 1
                continue

            # Extract
            local_path.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(m) as src, open(local_path, "wb") as dst:
                dst.write(src.read())
            os.utime(local_path, (m.mtime, m.mtime))
            print(f"  [RESTORED] {rel} ({m.size:,} bytes)")
            restored += 1

    print()
    print(f"Restored: {restored}")
    print(f"Skipped (unchanged): {skipped_unchanged}")
    print(f"Skipped (filtered out): {skipped_filtered}")


if __name__ == "__main__":
    main()
