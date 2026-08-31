#!/usr/bin/env python3
"""Build a minimal but valid EPUB 3 fixture (nav TOC + cover) for tests.

build(path) writes an .epub to `path`. Run directly to drop one at ./fixture.epub
"""
import sys
import zipfile

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

OPF = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>The Fixture Book</dc:title>
    <dc:creator>Ada Testwright</dc:creator>
    <dc:date>2021</dc:date>
    <dc:identifier id="bookid">urn:isbn:9780000000001</dc:identifier>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>
"""

NAV = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
  <nav epub:type="toc">
    <ol>
      <li><a href="c1.xhtml">The Alpha Chapter</a></li>
      <li><a href="c2.xhtml#mid">The Beta Chapter</a></li>
      <li><a href="c2.xhtml#end">The Gamma Chapter</a></li>
    </ol>
  </nav>
</body></html>
"""

C1 = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body>
<h1>The Alpha Chapter</h1>
<p>{alpha}</p>
</body></html>
"""

C2 = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body>
<h1>Beta start</h1>
<p id="mid">{beta}</p>
<p id="end">{gamma}</p>
</body></html>
"""

# 1x1 transparent PNG
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6360000002000100ffff03000006000557bfabd400"
    "00000049454e44ae426082"
)


def build(path: str) -> str:
    alpha = ("Alpha covers systems and habits. " * 40).strip()
    beta = ("Beta covers feedback loops and leverage points. " * 40).strip()
    gamma = ("Gamma covers stocks and flows over time. " * 40).strip()
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", CONTAINER)
        z.writestr("OEBPS/content.opf", OPF)
        z.writestr("OEBPS/nav.xhtml", NAV)
        z.writestr("OEBPS/c1.xhtml", C1.format(alpha=alpha))
        z.writestr("OEBPS/c2.xhtml", C2.format(beta=beta, gamma=gamma))
        z.writestr("OEBPS/cover.png", PNG)
    return path


if __name__ == "__main__":
    print(build(sys.argv[1] if len(sys.argv) > 1 else "fixture.epub"))
