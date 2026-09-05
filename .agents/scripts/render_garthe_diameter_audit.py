from pathlib import Path
import fitz
src=Path('attached_assets/Paper_1788587264307.pdf')
out=Path('.agents/outputs/garthe-diameter-audit')
out.mkdir(parents=True, exist_ok=True)
doc=fitz.open(src)
# PDF page numbers (1-based): terminal-velocity chapter, power definitions,
# drop-size/breakage equations, Kühni Eq. 5.6/5.7, swarm/flooding chapter.
for pno in [34,35,36,37,40,41,42,45,46,97,98,99,111,112,113,114,140,141,142,143,144,145,146,147,158,159,160,161,162,163]:
    page=doc[pno-1]
    pix=page.get_pixmap(matrix=fitz.Matrix(2.4,2.4),alpha=False)
    pix.save(out/f'page-{pno:03d}.png')
print(f'rendered 30 pages from {doc.page_count}-page source into {out}')
