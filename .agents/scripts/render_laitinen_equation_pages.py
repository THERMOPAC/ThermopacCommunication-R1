import fitz
from pathlib import Path

pdf_path = Path("attached_assets/CHEM_Laitinen_Murtom_ki_et_al_Axial_Dispersion_2019_Chemical_E_1786951069179.pdf")
out_dir = Path(".agents/outputs/laitinen-pages")
out_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(pdf_path)
for page_number, page in enumerate(document, start=1):
    text = page.get_text("text")
    if any(term in text.lower() for term in ("kumar", "hartland", "sherwood", "mass transfer coefficient")):
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        pixmap.save(out_dir / f"page-{page_number}.png")
        print(f"Rendered page {page_number}")

for page_number in (14, 15):
    page = document[page_number - 1]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(5, 5))
    pixmap.save(out_dir / f"page-{page_number}-highres.png")
    print(f"Rendered high-resolution page {page_number}")