from pathlib import Path
import json
import fitz

source = Path(
    "deliverables/stage2-report-corrected/"
    "Project-236-Stage2-a7a03f6f-1587-401b-8329-8b67c53a6a93.pdf"
)
output = Path("deliverables/stage2-report-corrected/comparison-page.png")
document = fitz.open(source)
matches = [
    index for index, page in enumerate(document)
    if "Theoretical-stage comparison & selection" in page.get_text()
    and "MINIMUM SAVED ACCEPTED N_T" in page.get_text()
]
assert len(matches) == 1, matches
page = document[matches[0]]
outside = [
    block[:4] for block in page.get_text("blocks")
    if not fitz.Rect(block[:4]) in page.rect
]
assert not outside, outside
required = [
    "MINIMUM SAVED ACCEPTED N_T: 4",
    "Numerical",
    "Saved",
    "SULFUR BASIS MISMATCH",
    "Historical saved PASS/FAIL is preserved",
    "demonstrated product-concentration compliance",
]
text = page.get_text()
for phrase in required:
    assert phrase in text, phrase
page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).save(output)
print(json.dumps({
    "pdf": str(source),
    "pageCount": document.page_count,
    "comparisonPage": matches[0] + 1,
    "comparisonPageSize": [page.rect.width, page.rect.height],
    "textBlocksOutsidePage": len(outside),
    "renderedPng": str(output),
}))