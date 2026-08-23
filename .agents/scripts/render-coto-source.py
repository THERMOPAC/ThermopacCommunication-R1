"""Render the controlled Coto 2022 source pages for visual table verification."""
from pathlib import Path

import fitz

SOURCE = Path("attached_assets/Extraction_of_aromatic_and_polyaromatic_compounds_with_NMP_1786368615037.pdf")
OUTPUT = Path(".agents/outputs/coto-source-render")

OUTPUT.mkdir(parents=True, exist_ok=True)
document = fitz.open(SOURCE)

# Page 3 is the paper's printed Table 3, which carries the phase compositions.
for page_number in (2, 3, 4):
    page = document[page_number]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    pixmap.save(OUTPUT / f"page-{page_number + 1}.png")

print(f"Rendered {len((2, 3, 4))} pages to {OUTPUT}")