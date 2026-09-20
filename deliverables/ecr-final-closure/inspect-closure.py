"""Report-only PDF inspection; never interacts with application or database."""
from pathlib import Path
import fitz, re, json
root = Path(__file__).resolve().parent
doc = fitz.open(root / "final-engineering-closure.pdf")
texts = [page.get_text() for page in doc]
whole = "\n".join(texts)
assert not re.search(r"\bEMS\b", whole, re.I)
for token in ["FINAL ENGINEERING CLOSURE CANDIDATE", "CE sensitivity", "112", "72", "11,752.698",
              "8,884.689", "10,931.353", "16,912.970", "95%", "SCALE_UP_EXTRAPOLATION",
              "FLOW ARROWS ARE SCHEMATIC", "NOT CFD STREAMLINES",
              "STATOR OPENING AND TURBINE EYE ARE NOT A SEALED DUCT"]:
    assert token in whole, token
for i, page in enumerate(doc):
    assert "NOT FOR FABRICATION" in texts[i]
    assert f"Page {i+1} / {len(doc)}" in texts[i]
    for b in page.get_text("blocks"):
        assert b[0] >= -1 and b[1] >= -1 and b[2] <= page.rect.width + 1 and b[3] <= page.rect.height + 1, (i,b)
    if i in [0,11] or any(x in texts[i] for x in ["6 · CE sensitivity", "10 · Improved turbine",
                                            "11 · Double-entry flow", "12 · Improved stator",
                                            "13 · Improved typical", "18 · Final engineering"]):
        page.get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(root / f"review-page-{i+1}.png")
(root / "final-engineering-closure.txt").write_text(whole)
(root / "verification.json").write_text(json.dumps({
    "pages": len(doc), "out_of_page_text_blocks": 0,
    "required_content_checks": "pass", "excluded_geometry_term_scan": "pass"
}, indent=2))
print(f"PASS: {len(doc)} pages, bounded text, all watermarks and numbered footers; content scan complete.")