import fitz
from pathlib import Path

root = Path("deliverables/r1-drawings")
doc = fitz.open(root / "fixture-dimensioned-five-view-package.pdf")
print("PDF pages:", len(doc))
for index, view in enumerate(["ga", "section", "compartment", "rotor", "stator"]):
    page = doc[index]
    text = page.get_text()
    assert "NOT FOR FABRICATION" in text
    assert len(page.get_drawings()) > 10
    assert len(page.get_images()) == 0
    outside = [
        block for block in page.get_text("blocks")
        if block[0] < 0 or block[1] < 0 or block[2] > page.rect.width + 1 or block[3] > page.rect.height + 1
    ]
    assert not outside, (view, outside)
    page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25)).save(root / f"fixture-pdf-{view}.png")
    print(view, "vector paths:", len(page.get_drawings()), "text chars:", len(text))