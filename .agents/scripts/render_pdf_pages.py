import fitz, os
doc = fitz.open('attached_assets/Extraction_of_aromatic_and_polyaromatic_compounds_with_NMP_1786368615037.pdf')
os.makedirs('.agents/outputs', exist_ok=True)
for i in range(doc.page_count):
    page = doc[i]
    pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5))
    out = f'.agents/outputs/page_{i+1:02d}.png'
    pix.save(out)
    print(f'Saved {out}')
print('Done')
