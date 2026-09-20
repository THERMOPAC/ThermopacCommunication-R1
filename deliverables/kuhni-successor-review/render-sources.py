from pathlib import Path
import fitz

out = Path("deliverables/kuhni-successor-review/sources")
out.mkdir(parents=True, exist_ok=True)
sources = [
    ("garthe", "attached_assets/Paper_1788587264307.pdf", [72, 73, 74, 75, 76, 189]),
    ("oliveira", "attached_assets/A_STUDY_OF_THE_DROP_SIZE_DISTRIBUTIONS_1788585700948.pdf", [1, 2, 3]),
    ("asadollahzadeh", "research/sources/kuhni-mass-transfer/asadollahzadeh-2017-primary.pdf", [1, 2, 3]),
]
for name, path, pages in sources:
    doc = fitz.open(path)
    for n in pages:
        page = doc[n-1]
        page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6)).save(out / f"{name}-pdf-page-{n}.png")
        (out / f"{name}-pdf-page-{n}.txt").write_text(page.get_text())
    print(name, len(doc), pages)