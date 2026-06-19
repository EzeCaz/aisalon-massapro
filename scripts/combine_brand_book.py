#!/usr/bin/env python3
"""Combine all per-page brand book JSON extractions into one consolidated Markdown file
for the marketing expert to study."""
import json
import os
from pathlib import Path

TEXT_DIR = Path("/home/z/my-project/download/brand_book_text")
OUT_FILE = Path("/home/z/my-project/download/brand_book_combined.md")

pages = []
for i in range(1, 41):
    p = TEXT_DIR / f"page_{i:02d}.json"
    if not p.exists():
        print(f"Missing: {p}")
        continue
    data = json.loads(p.read_text())
    pages.append({
        "page": i,
        "content": data.get("content", "")
    })

with OUT_FILE.open("w", encoding="utf-8") as f:
    f.write("# AI Salon — Brand Book (Combined Extraction)\n\n")
    f.write(f"Source: AI Salon - Brand Book_00.pdf (40 pages)\n\n")
    f.write("---\n\n")
    for p in pages:
        f.write(f"\n\n## ============ PDF PAGE {p['page']} ============\n\n")
        f.write(p["content"])
        f.write("\n")

print(f"Wrote {OUT_FILE}  ({OUT_FILE.stat().st_size} bytes)")
