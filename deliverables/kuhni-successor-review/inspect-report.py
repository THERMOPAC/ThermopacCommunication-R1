from pathlib import Path
import fitz
root = Path(__file__).resolve().parent
doc = fitz.open(root / "engineering-review-report.pdf")
texts = [p.get_text() for p in doc]
all_text = "\n".join(texts)
required = ["6804", "45 RPM", "SCALE_UP_EXTRAPOLATION", "11,752.698",
            "8,884.689", "10,931.353", "39.559479", "UNRESOLVED",
            "Stage-3 audit", "T-01", "S-01", "C-01", "Source citations",
            "e2afc059444f3c22c5d3a64b83ed81b59b5a122bd51ac1c9bc9897337d788249"]
for needle in required:
    assert needle in all_text, needle
outliers = []
for i, page in enumerate(doc):
    assert "NOT FOR FABRICATION" in texts[i], i
    assert f"Page {i+1} / {len(doc)}" in texts[i], (i, "footer")
    for block in page.get_text("blocks"):
        x0, y0, x1, y1 = block[:4]
        if min(x0,y0) < 0 or x1 > page.rect.width + .5 or y1 > page.rect.height + .5:
            outliers.append((i+1,block))
samples = {0,1,len(doc)-1}
for i,t in enumerate(texts):
    if any(s in t for s in ["T-01", "S-01", "C-01", "5 · Upper", "8 · Clearance"]):
        samples.add(i)
for i in sorted(samples):
    doc[i].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(root/f"review-page-{i+1}.png")
(root/"engineering-review-report.txt").write_text(all_text)
print({"pages":len(doc),"outOfPageBlocks":len(outliers),"samplePages":[i+1 for i in sorted(samples)],"pdfBytes":(root/"engineering-review-report.pdf").stat().st_size})
assert not outliers, outliers
for i,t in enumerate(texts):
    print(i+1, len(t), t.splitlines()[0:3])