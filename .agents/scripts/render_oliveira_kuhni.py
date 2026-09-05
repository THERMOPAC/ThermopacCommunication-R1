from pathlib import Path

import fitz


pdf_path = Path("attached_assets/A_STUDY_OF_THE_DROP_SIZE_DISTRIBUTIONS_1788585700948.pdf")
output_dir = Path(".agents/outputs/oliveira-2008-kuhni")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(pdf_path)
print(f"pages={document.page_count}")

for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
    output_path = output_dir / f"page-{index + 1:02d}.png"
    pixmap.save(output_path)
    print(output_path)