import fitz
from pathlib import Path
pdf = Path('attached_assets/Paper_1788587264307.pdf')
out = Path('.agents/outputs/garthe-p126')
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(pdf)
print('pages', doc.page_count, 'metadata', doc.metadata)
# printed p. 126 is normally PDF zero-based page index 125, but render nearby
for printed in [125, 126, 127]:
    idx = printed - 1
    if 0 <= idx < len(doc):
        page = doc[idx]
        pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
        path = out / f'printed-page-{printed:03d}.png'
        pix.save(path)
        print(path, page.rect, 'text:', page.get_text()[:500].replace('\n',' | '))
# crop equation area from printed p126 using text bounding boxes; save full and focused candidate crops
idx = 125
page = doc[idx]
blocks = page.get_text('dict')['blocks']
for i,b in enumerate(blocks):
    if b.get('type') != 0: continue
    text=''.join(s.get('text','') for line in b.get('lines',[]) for s in line.get('spans',[]))
    if '8.3' in text or 'vs' in text or 'v_s' in text or 'sqrt' in text or 'h_d' in text:
        print('block',i,'bbox',b['bbox'],'text',repr(text[:1000]))
        r=fitz.Rect(b['bbox'])
        r += (-30,-30,30,30)
        r &= page.rect
        pix=page.get_pixmap(matrix=fitz.Matrix(5,5), clip=r, alpha=False)
        cp=out/f'printed-page-126-block-{i}.png'; pix.save(cp); print('crop',cp)
