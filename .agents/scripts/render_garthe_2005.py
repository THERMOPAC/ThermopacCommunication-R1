from pathlib import Path

import fitz


SOURCE = Path("attached_assets/Paper_1788587264307.pdf")
OUTPUT = Path(".agents/outputs/garthe-2005-review")
OUTPUT.mkdir(parents=True, exist_ok=True)

doc = fitz.open(SOURCE)

for page_number in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 75, 97, 137, 151, 160, 161]:
    page = doc[page_number]
    pix = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False)
    pix.save(OUTPUT / f"page-{page_number + 1:03d}.png")

with (OUTPUT / "metadata.txt").open("w", encoding="utf-8") as handle:
    handle.write(f"pages={doc.page_count}\n")
    handle.write(f"metadata={doc.metadata}\n")