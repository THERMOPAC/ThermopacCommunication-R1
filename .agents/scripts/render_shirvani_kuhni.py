from pathlib import Path

import fitz


pdf_path = Path("attached_assets/shirvani_2016_kuhni_flooding_drop_size.pdf")
output_dir = Path(".agents/outputs/shirvani-2016-kuhni")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(pdf_path)
print(f"pages={document.page_count}")

for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
    output_path = output_dir / f"page-{index + 1:02d}.png"
    pixmap.save(output_path)
    print(output_path)