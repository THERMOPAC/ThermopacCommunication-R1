from pathlib import Path

import fitz


pdf_path = Path(
    "attached_assets/Shirvani_2016_Kühni_flooding_drop-size_paper_1788586188612.pdf"
)
output_dir = Path(".agents/outputs/shirvani-2016-audit")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(pdf_path)
crops = {
    "source-tables": (1, fitz.Rect(20, 25, 590, 780)),
    "eq-5-and-table-6": (5, fitz.Rect(15, 250, 590, 780)),
    "eq-5-last-groups": (5, fitz.Rect(75, 565, 305, 635)),
    "eq-7": (5, fitz.Rect(300, 315, 590, 620)),
    "figures-6-7-table-7": (6, fitz.Rect(15, 25, 590, 550)),
    "figure-8-errors": (6, fitz.Rect(290, 25, 590, 780)),
}

for name, (page_index, clip) in crops.items():
    pixmap = document[page_index].get_pixmap(
        matrix=fitz.Matrix(4.0, 4.0),
        clip=clip,
        alpha=False,
    )
    output_path = output_dir / f"{name}.png"
    pixmap.save(output_path)
    print(output_path)