#!/usr/bin/env python3
"""Post-process the platform summary docx for WPS compatibility:
1. Remove empty <w:pgNumType/> from document.xml (cover section artifact)
2. Patch footer PAGE fields with explicit format switches:
   - footer used in the Roman (TOC) section -> PAGE \\* ROMAN \\* MERGEFORMAT
   - footer used in the Arabic (body) section -> PAGE \\* arabic \\* MERGEFORMAT
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/coma-platform-capabilities-and-goals.docx")
tmp = path.with_suffix(".tmp.docx")

with zipfile.ZipFile(path, "r") as zin:
    names = zin.namelist()
    contents = {n: zin.read(n) for n in names}

doc_xml = contents["word/document.xml"].decode("utf-8")

# 1. Remove empty pgNumType (docx-js emits these on sections without pageNumbers)
doc_xml, n_removed = re.subn(r"<w:pgNumType/>", "", doc_xml)

# Map footer rIds -> usage section. Identify which footers are referenced from
# which section by scanning sectPr blocks in order (cover=none, TOC=roman, body=arabic).
sect_blocks = re.findall(r"<w:sectPr[\s\S]*?</w:sectPr>", doc_xml)
footer_fmt = {}  # rId -> "roman" | "arabic"
for idx, block in enumerate(sect_blocks):
    for m in re.finditer(r'<w:footerReference[^>]*r:id="(rId\d+)"', block):
        # section 0 = cover (skip), 1 = TOC (roman), 2 = body (arabic)
        if idx == 1:
            footer_fmt[m.group(1)] = "ROMAN"
        elif idx == 2:
            footer_fmt[m.group(1)] = "arabic"

# Resolve rId -> footer file via document.xml.rels
rels = contents["word/_rels/document.xml.rels"].decode("utf-8")
rid_to_file = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(footer\d+\.xml)"', rels))

patched = []
for rid, fmt in footer_fmt.items():
    fname = rid_to_file.get(rid)
    if not fname:
        continue
    key = f"word/{fname}"
    if key not in contents:
        continue
    xml = contents[key].decode("utf-8")
    new_xml, n = re.subn(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        rf"\1 PAGE \\* {fmt} \\* MERGEFORMAT \2",
        xml,
    )
    if n:
        contents[key] = new_xml.encode("utf-8")
        patched.append(f"{fname} -> {fmt} ({n} field)")

contents["word/document.xml"] = doc_xml.encode("utf-8")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, contents[n])

shutil.move(str(tmp), str(path))
print(f"Removed {n_removed} empty pgNumType elements; patched footers: {patched if patched else 'none found (check rId mapping)'}")
