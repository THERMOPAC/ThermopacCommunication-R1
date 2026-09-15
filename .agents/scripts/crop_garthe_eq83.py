import fitz
from pathlib import Path
pdf='attached_assets/Paper_1788587264307.pdf'
out=Path('.agents/outputs/garthe-eq83-correct/eq83-radical-crop.png')
doc=fitz.open(pdf)
page=doc[137]  # PDF page 138, printed 126
clip=fitz.Rect(48, 92, 530, 150)
pix=page.get_pixmap(matrix=fitz.Matrix(7,7), clip=clip, alpha=False)
pix.save(out)
print(out, clip, pix.width, pix.height)
