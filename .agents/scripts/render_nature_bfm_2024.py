import fitz
from pathlib import Path
src='/tmp/kuhni-research/nature-2024.pdf'
out=Path('/tmp/kuhni-research/nature-2024')
out.mkdir(parents=True,exist_ok=True)
doc=fitz.open(src)
print('pages',doc.page_count)
for n in range(min(doc.page_count,8)):
    p=doc[n]
    pix=p.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False)
    fn=out/f'page-{n+1:02d}.png'
    pix.save(fn)
    print(fn)
