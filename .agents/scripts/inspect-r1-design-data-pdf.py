import fitz
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
doc = fitz.open(path)
assert 5 < len(doc) < 120, f"Unexpected page count {len(doc)}"
for index, page in enumerate(doc):
    text = page.get_text()
    assert "NOT FOR FABRICATION" in text, index
    assert f"Page {index + 1} of {len(doc)}" in text, index
    for word in page.get_text("words"):
        assert word[0] >= 35 and word[1] >= 18, (index, word)
        assert word[2] <= page.rect.width - 34 and word[3] <= page.rect.height - 35, (index, word)
    if index in (0, 1, 2, len(doc)-1) or any(s in text for s in ("Complete connection /", "Rotor geometry", "Stator geometry", "Component quantities", "Critical clearances", "Validation results")):
        page.get_pixmap(matrix=fitz.Matrix(1.3, 1.3)).save(str(path.parent / f"fixture-design-data-page-{index+1}.png"))
print(f"{len(doc)} pages; every page bounded and numbered; sampled pages rendered")