#!/usr/bin/env python3
"""Remove the docx-js TableOfContents sample entry that duplicates TOC entry 1.

docx-js emits one pre-seeded hyperlink entry (tab pos 8788, PAGEREF to _Toc1, no
visible page number) inside the TOC field; add_toc_placeholders.py then injects
the real placeholder entries after it, so the first heading appears twice in the
pre-update TOC view. Word regenerates the whole field on Update Field, so this is
cosmetic - but the placeholder view (and LibreOffice PDF render) should be clean.

Rule: inside the TOC <w:sdt>, delete the first entry paragraph whose visible text
equals the visible text of the immediately following entry paragraph.

Usage: python3 fix_toc_sample_entry.py <file.docx>
"""
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def visible_text(paragraph_xml: str) -> str:
    return "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", paragraph_xml)).strip()


def fix(path: str) -> None:
    src = Path(path)
    with zipfile.ZipFile(src) as z:
        names = z.namelist()
        data = {n: z.read(n) for n in names}

    doc = data["word/document.xml"].decode("utf-8")

    m_sdt = re.search(r"<w:sdt>[\s\S]*?</w:sdt>", doc)
    if not m_sdt:
        print("WARN: no TOC sdt block found")
        return
    sdt = m_sdt.group(0)

    # Split the sdt content into top-level paragraphs
    paras = re.findall(r"<w:p>[\s\S]*?</w:p>", sdt)
    new_sdt = sdt
    fixed = False
    for i in range(len(paras) - 1):
        a, b = paras[i], paras[i + 1]
        ta, tb = visible_text(a), visible_text(b)
        # Injected entries carry their page number as trailing text ("...Summary1")
        same = ta and tb != ta and tb.startswith(ta) and tb[len(ta):].strip().isdigit()
        if same and "<w:hyperlink" in a and "<w:hyperlink" not in b:
            # a = docx-js sample entry, but its paragraph ALSO carries the TOC field
            # opener (begin + instrText + separate runs). Keep those runs: remove the
            # hyperlink element, then graft the field runs into the start of paragraph b
            # so the field structure survives without an empty leftover line.
            fld_runs = re.search(r"<w:r>(?:(?!<w:hyperlink)[\s\S])*</w:r>(?=<w:hyperlink)", a)
            if not fld_runs:
                fld_runs = re.search(r"(<w:r>[\s\S]*?</w:r>)(?=<w:hyperlink)", a)
            hyper = re.search(r"<w:hyperlink[\s\S]*?</w:hyperlink>", a)
            if fld_runs and hyper:
                runs_xml = fld_runs.group(0)
                b_open = re.match(r"<w:p>(<w:pPr>[\s\S]*?</w:pPr>)?", b)
                insert_at = b_open.end() if b_open else len("<w:p>")
                b_fixed = b[:insert_at] + runs_xml + b[insert_at:]
                new_sdt = new_sdt.replace(a, "", 1)
                new_sdt = new_sdt.replace(b, b_fixed, 1)
                fixed = True
            break  # only the first sample entry exists

    if fixed:
        doc = doc.replace(sdt, new_sdt, 1)
        data["word/document.xml"] = doc.encode("utf-8")
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
            out = Path(tmp.name)
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            for n in names:
                z.writestr(n, data[n])
        shutil.move(str(out), str(src))
        print(f"FIXED 1 sample TOC entry (field runs preserved, duplicate text removed)")
    else:
        print("OK: no duplicate sample entry found")


if __name__ == "__main__":
    fix(sys.argv[1])
