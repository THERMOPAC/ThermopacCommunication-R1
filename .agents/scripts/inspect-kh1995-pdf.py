import json
from pathlib import Path

import fitz


PDF = Path("attached_assets/Kumar_&_Hartland_(1995)_paper_1787715630689.pdf")
OUT = Path(".agents/outputs/kh1995-paper")
OUT.mkdir(parents=True, exist_ok=True)

doc = fitz.open(PDF)
print(json.dumps({
    "pages": doc.page_count,
    "metadata": doc.metadata,
    "page_sizes": [
        {"page": i + 1, "width": page.rect.width, "height": page.rect.height}
        for i, page in enumerate(doc)
    ],
}, indent=2))

for index, page in enumerate(doc):
    text = page.get_text("text")
    (OUT / f"page-{index + 1:02d}.txt").write_text(text, encoding="utf-8")
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    pix.save(OUT / f"page-{index + 1:02d}.png")
    print(f"page {index + 1}: {len(text)} text characters, {len(page.get_images(full=True))} embedded images")

# High-resolution crops preserve the equation typography that the PDF text layer
# represents poorly.
crops = {
    "page-05-epsilon-equation.png": (4, fitz.Rect(35, 150, 330, 410)),
    "page-06-equation-15-to-19.png": (5, fitz.Rect(35, 365, 345, 670)),
    "page-06-kuhni-constants.png": (5, fitz.Rect(35, 40, 595, 245)),
    "page-07-unified-equation.png": (5, fitz.Rect(35, 610, 350, 770)),
}
for filename, (page_index, clip) in crops.items():
    page = doc[page_index]
    pix = page.get_pixmap(matrix=fitz.Matrix(4, 4), clip=clip, alpha=False)
    pix.save(OUT / filename)
    print(f"crop: {filename}")