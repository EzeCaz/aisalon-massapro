#!/usr/bin/env python3
"""
prepare-doc-viewer.py — Stage assets for the /doc viewer page.

Extracts /home/z/my-project/download/coma-platform-capabilities-and-goals.docx into:
  public/doc-viewer/content.json     structured blocks (headings/paragraphs/tables)
  public/doc-viewer/document.pdf     LibreOffice conversion (preview + download)
  public/doc-viewer/pages/page-N.png rendered page images
  public/doc-viewer/code/*.txt       source code files (safe to serve as text)
  public/doc-viewer/manifest.json    metadata: pages, files, stats
"""
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime

BASE = "/home/z/my-project"
DOCX = f"{BASE}/download/coma-platform-capabilities-and-goals.docx"
OUT = f"{BASE}/public/doc-viewer"

# ── 1. Structured content extraction ─────────────────────────────────
def extract_blocks():
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.table import Table as DxTable
    from docx.text.paragraph import Paragraph as DxPara

    doc = Document(DOCX)

    def iter_block_items(parent):
        from docx.oxml.ns import qn
        body = parent.element.body
        for child in body.iterchildren():
            if child.tag == qn("w:p"):
                yield DxPara(child, parent)
            elif child.tag == qn("w:tbl"):
                yield DxTable(child, parent)

    def para_data(p):
        text = "".join(run.text for run in p.runs) or p.text
        runs = [
            {"text": r.text, "bold": bool(r.bold), "italic": bool(r.italic),
             "color": (r.font.color.rgb.__str__() if r.font.color and r.font.color.rgb else None)}
            for r in p.runs if r.text
        ]
        align = p.alignment
        return text, runs, align

    blocks = []
    for item in iter_block_items(doc):
        if isinstance(item, DxPara):
            text, runs, align = para_data(item)
            style = ((item.style.name if item.style is not None else "") or "").lower()
            if not text.strip():
                # keep page-break-ish empties out; note explicit breaks instead
                if "page break" in style:
                    blocks.append({"type": "pagebreak"})
                continue
            b = {"type": "para", "text": text}
            if runs:
                b["runs"] = runs
            if align is not None:
                b["align"] = str(align).split(".")[-1].split(" ")[0].lower()
            if "heading 1" in style or "title" in style:
                b["level"] = 1
            elif "heading 2" in style:
                b["level"] = 2
            elif "heading 3" in style:
                b["level"] = 3
            elif "heading" in style:
                b["level"] = 4
            if b.get("level"):
                b["type"] = "heading"
            if style.startswith("toc") or style == "toc 1":
                b["toc"] = True
            blocks.append(b)
        elif isinstance(item, DxTable):
            rows = []
            for row in item.rows:
                cells = []
                for cell in row.cells:
                    cells.append(cell.text.replace("\n", " ").strip())
                rows.append(cells)
            blocks.append({"type": "table", "rows": rows})

    return blocks


# ── 2. docx → PDF → page PNGs ────────────────────────────────────────
def render_pdf_and_pages():
    tmp = f"{OUT}/_pdf_tmp"
    os.makedirs(tmp, exist_ok=True)
    subprocess.run(
        ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", tmp, DOCX],
        check=True, capture_output=True, timeout=180,
    )
    pdf_name = os.path.splitext(os.path.basename(DOCX))[0] + ".pdf"
    pdf_src = os.path.join(tmp, pdf_name)
    pdf_dst = f"{OUT}/document.pdf"
    shutil.move(pdf_src, pdf_dst)

    pages_dir = f"{OUT}/pages"
    if os.path.isdir(pages_dir):
        shutil.rmtree(pages_dir)
    os.makedirs(pages_dir)
    subprocess.run(
        ["pdftoppm", "-png", "-r", "110", pdf_dst, f"{pages_dir}/page"],
        check=True, capture_output=True, timeout=180,
    )
    pages = sorted(os.listdir(pages_dir))
    shutil.rmtree(tmp)
    return pdf_dst, pages


# ── 3. Code files ────────────────────────────────────────────────────
CODE_FILES = [
    ("generate-platform-summary.js", "scripts/generate-platform-summary.js", "javascript"),
    ("postprocess-summary-docx.py", "scripts/postprocess-summary-docx.py", "python"),
    ("prepare-doc-viewer.py", "scripts/prepare-doc-viewer.py", "python"),
]


def stage_code():
    code_dir = f"{OUT}/code"
    if os.path.isdir(code_dir):
        shutil.rmtree(code_dir)
    os.makedirs(code_dir)
    manifest = []
    for name, src, lang in CODE_FILES:
        full = os.path.join(BASE, src)
        if not os.path.isfile(full):
            continue
        shutil.copy2(full, os.path.join(code_dir, name))
        with open(full, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        manifest.append({
            "name": name,
            "path": src,
            "language": lang,
            "lines": content.count("\n") + 1,
            "bytes": len(content.encode("utf-8")),
        })
    return manifest


# ── main ─────────────────────────────────────────────────────────────
def main():
    if not os.path.isfile(DOCX):
        print(f"ERROR: {DOCX} not found", file=sys.stderr)
        sys.exit(1)
    os.makedirs(OUT, exist_ok=True)

    blocks = extract_blocks()
    with open(f"{OUT}/content.json", "w", encoding="utf-8") as f:
        json.dump({"blocks": blocks}, f, ensure_ascii=False, indent=1)

    pdf_path, pages = render_pdf_and_pages()
    code_manifest = stage_code()

    st = os.stat(DOCX)
    doc_stats = {
        "title": "Coma Platform — Capabilities & Goals",
        "file": "download/coma-platform-capabilities-and-goals.docx",
        "sizeBytes": st.st_size,
        "modified": datetime.fromtimestamp(st.st_mtime).isoformat(),
        "wordCount": sum(len(b.get("text", "").split()) for b in blocks),
        "headings": sum(1 for b in blocks if b["type"] == "heading"),
        "tables": sum(1 for b in blocks if b["type"] == "table"),
        "paragraphs": sum(1 for b in blocks if b["type"] == "para"),
    }

    manifest = {
        "stats": doc_stats,
        "pdf": "document.pdf",
        "pages": [f"pages/{p}" for p in pages],
        "code": code_manifest,
        "generatedAt": datetime.now().isoformat(),
    }
    with open(f"{OUT}/manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    print(f"blocks={len(blocks)} words={doc_stats['wordCount']} "
          f"headings={doc_stats['headings']} tables={doc_stats['tables']} "
          f"pages={len(pages)} codeFiles={len(code_manifest)}")
    print(f"staged at {OUT}")


if __name__ == "__main__":
    main()
