import fitz
from pathlib import Path
pdf=Path('attached_assets/Paper_1788587264307.pdf')
out=Path('.agents/outputs/garthe-eq83-correct')
out.mkdir(parents=True,exist_ok=True)
doc=fitz.open(pdf)
idx=137 # PDF 1-based page 138; printed page number 126
page=doc[idx]
print('pdf_index_zero',idx,'rect',page.rect)
print(page.get_text())
pix=page.get_pixmap(matrix=fitz.Matrix(4,4),alpha=False)
full=out/'pdf-page-138-printed-126.png'; pix.save(full); print('full',full)
for i,b in enumerate(page.get_text('dict')['blocks']):
 if b.get('type')!=0: continue
 text=''.join(s.get('text','') for line in b.get('lines',[]) for s in line.get('spans',[]))
 print('block',i,'bbox',b['bbox'],'text=',repr(text))
 if any(x in text for x in ['(8.3)','8.3','h','Re','v']):
  r=fitz.Rect(b['bbox'])+(-40,-35,40,35); r &= page.rect
  cp=out/f'block-{i}.png'; page.get_pixmap(matrix=fitz.Matrix(6,6),clip=r,alpha=False).save(cp); print('crop',cp,'clip',r)
