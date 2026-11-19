#!/usr/bin/env python3
"""Patch docx page-number footers for WPS compatibility (per docx skill toc.md).

- Maps each section (sectPr) to its footer file via footerReference r:id + document.xml.rels
- Adds explicit format switch to the PAGE field: upperRoman -> PAGE \\* ROMAN, decimal -> PAGE \\* arabic
- Removes empty <w:pgNumType/> emitted for sections without pageNumbers (confuses WPS)

Usage: python3 patch_docx_footers.py <file.docx>
"""
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

ROMAN = "ROMAN"
ARABIC = "arabic"


def patch(path: str) -> None:
    src = Path(path)
    with zipfile.ZipFile(src) as z:
        names = z.namelist()
        data = {n: z.read(n) for n in names}

    doc = data["word/document.xml"].decode("utf-8")
    rels = data["word/_rels/document.xml.rels"].decode("utf-8")
    rid_to_target = dict(re.findall(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels))

    # sectPr blocks in document order; default footer refs + pgNumType fmt per section
    section_fmts = {}  # footer filename -> ROMAN | ARABIC
    for sect in re.findall(r"<w:sectPr[ >][\s\S]*?</w:sectPr>", doc):
        m_fmt = re.search(r'<w:pgNumType[^>]*w:fmt="([^"]+)"', sect)
        fmt = m_fmt.group(1) if m_fmt else None
        for m in re.finditer(r'<w:footerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"', sect):
            target = rid_to_target.get(m.group(1), "")
            fname = "word/" + target.lstrip("/") if not target.startswith("word/") else target
            if fmt == "upperRoman":
                section_fmts[fname] = ROMAN
            elif fmt == "decimal":
                section_fmts[fname] = ARABIC

    patched = []
    for fname, kind in section_fmts.items():
        if fname not in data:
            continue
        xml = data[fname].decode("utf-8")
        switch = ROMAN if kind == ROMAN else ARABIC
        new_xml, n1 = re.subn(
            r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
            r"\g<1> PAGE \\* " + switch + r" \\* MERGEFORMAT \g<2>",
            xml,
        )
        new_xml, n2 = re.subn(
            r'(<w:fldSimple[^>]*w:instr=")\s*PAGE\s*(")',
            r"\g<1> PAGE \\* " + switch + r" \\* MERGEFORMAT \g<2>",
            new_xml,
        )
        if n1 + n2:
            data[fname] = new_xml.encode("utf-8")
            patched.append(f"{fname} -> {switch} ({n1 + n2} field(s))")

    # Remove empty pgNumType (docx-js emits it for sections without pageNumbers)
    doc2, n_removed = re.subn(r"<w:pgNumType/>", "", doc)
    data["word/document.xml"] = doc2.encode("utf-8")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
        out = Path(tmp.name)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.writestr(n, data[n])
    shutil.move(str(out), str(src))

    for line in patched:
        print("PATCHED " + line)
    print(f"REMOVED {n_removed} empty <w:pgNumType/>")
    if not patched:
        print("WARN: no footer PAGE fields patched - check section/footer mapping")


if __name__ == "__main__":
    patch(sys.argv[1])
