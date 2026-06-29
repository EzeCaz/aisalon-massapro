#!/usr/bin/env python3
"""Compare old Vercel deployment files vs current src/ and produce a
human-readable summary of lost/changed features."""
import os
import subprocess
from pathlib import Path

OLD = Path("/home/z/my-project/old-deployment/files/src")
NEW = Path("/home/z/my-project/src")

def run_diff(old, new):
    r = subprocess.run(["diff", str(old), str(new)], capture_output=True, text=True)
    added = sum(1 for l in r.stdout.splitlines() if l.startswith(">"))
    removed = sum(1 for l in r.stdout.splitlines() if l.startswith("<"))
    return removed, added  # removed-from-old, added-in-new

def list_files(root):
    out = set()
    for dp, dn, fn in os.walk(root):
        for f in fn:
            out.add(Path(dp).relative_to(root) / f)
    return out

old_files = list_files(OLD)
new_files = list_files(NEW)

# Filter to interesting files
SKIP_PATTERNS = ["node_modules", ".next", "worklog.md", "/.git/", ".images"]
def keep(p):
    s = str(p)
    return not any(pat in s for pat in SKIP_PATTERNS)

old_files = {f for f in old_files if keep(f)}
new_files = {f for f in new_files if keep(f)}

only_old = sorted(old_files - new_files)
only_new = sorted(new_files - old_files)
both = sorted(old_files & new_files)

differing = []
for f in both:
    o = OLD / f
    n = NEW / f
    if o.read_bytes() != n.read_bytes():
        removed, added = run_diff(o, n)
        differing.append((str(f), removed, added))

print("=" * 78)
print("FILES ONLY IN OLD DEPLOYMENT (lost from current)")
print("=" * 78)
for f in only_old:
    sz = (OLD / f).stat().st_size
    print(f"  +{sz:>6}b  {f}")

print()
print("=" * 78)
print("FILES ONLY IN CURRENT (added after old deployment)")
print("=" * 78)
for f in only_new:
    sz = (NEW / f).stat().st_size
    print(f"  +{sz:>6}b  {f}")

print()
print("=" * 78)
print("FILES THAT DIFFER (changed between old and current)")
print("=" * 78)
print(f"{'file':<70}  {'-old':>5}  {'+new':>5}")
print("-" * 78)
for f, removed, added in differing:
    short = f if len(f) <= 70 else "..." + f[-67:]
    print(f"{short:<70}  {removed:>5}  {added:>5}")

print()
print(f"TOTAL: only-in-old={len(only_old)}, only-in-current={len(only_new)}, differing={len(differing)}")
