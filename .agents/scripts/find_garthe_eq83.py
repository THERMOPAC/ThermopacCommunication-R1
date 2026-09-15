import fitz
from pathlib import Path
pdf=Path('attached_assets/Paper_1788587264307.pdf')
out=Path('.agents/outputs/garthe-eq83')
out.mkdir(parents=True,exist_ok=True)
doc=fitz.open(pdf)
for idx,page in enumerate(doc):
    txt=page.get_text()
    if '8.3' in txt or '8. 3' in txt or 'h_d' in txt or 'swarm' in txt.lower() or 'v_s/v_o' in txt:
      print('pdf_index',idx,'printed_hint',txt[:120].replace('\n',' | '),'hits', [q for q in ['8.3','8. 3','h_d','swarm','v_s/v_o'] if q in txt])
      pix=page.get_pixmap(matrix=fitz.Matrix(3,3),alpha=False)
      p=out/f'pdf-index-{idx+1:03d}.png';pix.save(p)
      # print lines around relevant terms
      for line in txt.splitlines():
        if any(q in line for q in ['8.3','8. 3','h_d','swarm','v_s/v_o']): print(' ',repr(line))
