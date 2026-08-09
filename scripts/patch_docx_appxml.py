#!/usr/bin/env python3
"""
Patch docProps/app.xml inside a DOCX file to include the <Application> element
that Microsoft Word's strict OOXML validator requires.

Empty <Properties/> causes Word to refuse opening the file with a
"The file is corrupt" error, even though every other viewer opens it fine.

Usage:
    python patch_docx_appxml.py <input.docx> <output.docx>
"""

import sys
import zipfile
import shutil
import os
from pathlib import Path

# Proper app.xml content that Word accepts.
# Note: <Application> and <AppVersion> are the minimum required elements.
PROPER_APP_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office Word</Application><AppVersion>16.0000</AppVersion><Company>MassaPro</Company><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><DigSig>false</DigSig><TitlesOfParts><vt:vector size="2" baseType="lpstr"><vt:lpstr>Body</vt:lpstr><vt:lpstr>Headers/Footers</vt:lpstr></vt:vector></TitlesOfParts></Properties>"""


def patch_docx(input_path: str, output_path: str) -> None:
    input_path = Path(input_path).resolve()
    output_path = Path(output_path).resolve()

    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    # Read all entries from the source DOCX
    with zipfile.ZipFile(input_path, "r") as zin:
        entries = zin.infolist()
        contents = {entry.filename: zin.read(entry.filename) for entry in entries}

    # Patch docProps/app.xml
    app_xml_path = "docProps/app.xml"
    if app_xml_path not in contents:
        print(f"WARNING: {app_xml_path} not found in DOCX — file may already be malformed")
    else:
        old_size = len(contents[app_xml_path])
        contents[app_xml_path] = PROPER_APP_XML.encode("utf-8")
        new_size = len(contents[app_xml_path])
        print(f"Patched {app_xml_path}: {old_size} bytes → {new_size} bytes")

    # Write the new DOCX. Important: use ZIP_DEFLATED compression, preserve
    # original structure (directories as empty entries, file ordering).
    # Word is sensitive to [Content_Types].xml being the FIRST entry.
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zout:
        # Ensure [Content_Types].xml is first (Word requirement)
        priority_files = ["[Content_Types].xml", "_rels/.rels"]
        written = set()

        for priority in priority_files:
            if priority in contents:
                # Get original ZipInfo to preserve metadata
                orig_info = next(e for e in entries if e.filename == priority)
                new_info = zipfile.ZipInfo(filename=priority, date_time=orig_info.date_time)
                new_info.compress_type = zipfile.ZIP_DEFLATED
                new_info.external_attr = orig_info.external_attr
                zout.writestr(new_info, contents[priority])
                written.add(priority)

        # Write the rest
        for entry in entries:
            if entry.filename in written:
                continue
            new_info = zipfile.ZipInfo(filename=entry.filename, date_time=entry.date_time)
            new_info.compress_type = zipfile.ZIP_DEFLATED
            new_info.external_attr = entry.external_attr
            zout.writestr(new_info, contents[entry.filename])
            written.add(entry.filename)

    print(f"\nWritten: {output_path} ({output_path.stat().st_size} bytes)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python patch_docx_appxml.py <input.docx> <output.docx>")
        sys.exit(1)

    patch_docx(sys.argv[1], sys.argv[2])

    # Verify the output
    print("\n=== Verification ===")
    with zipfile.ZipFile(sys.argv[2], "r") as z:
        # Check app.xml
        app_xml = z.read("docProps/app.xml").decode("utf-8")
        print(f"app.xml length: {len(app_xml)} chars")
        if "<Application>" in app_xml:
            print("✓ <Application> element present")
        else:
            print("✗ <Application> element STILL MISSING — patch failed")
            sys.exit(2)

        # Run zip integrity check
        bad = z.testzip()
        if bad is None:
            print("✓ Zip integrity OK")
        else:
            print(f"✗ Zip integrity FAILED on: {bad}")
            sys.exit(3)
