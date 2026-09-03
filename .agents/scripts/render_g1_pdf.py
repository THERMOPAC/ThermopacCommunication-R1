import fitz
from pathlib import Path
src = Path('attached_assets/G_1_1788452071575.pdf')
out = Path('.agents/outputs/g1-page-1.png')
doc = fitz.open(src)
page = doc[0]
pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
pix.save(out)
print(f'pages={doc.page_count} page1={page.rect} output={out}')
