from pathlib import Path

import fitz


pdf_path = Path("attached_assets/A_STUDY_OF_THE_DROP_SIZE_DISTRIBUTIONS_1788585700948.pdf")
output_dir = Path(".agents/outputs/oliveira-2008-kuhni/crops")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(pdf_path)
crops = {
    "eq-1": (1, fitz.Rect(40, 230, 310, 405)),
    "geometry-and-ranges": (2, fitz.Rect(35, 55, 580, 610)),
    "eq-6": (8, fitz.Rect(300, 160, 590, 510)),
    "eq-7": (9, fitz.Rect(300, 410, 590, 735)),
    "rotor-reynolds": (11, fitz.Rect(35, 35, 590, 510)),
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