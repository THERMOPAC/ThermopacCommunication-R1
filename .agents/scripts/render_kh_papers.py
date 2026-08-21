from pathlib import Path

import pymupdf


PAPERS = [
    (
        "2017-kuhni",
        Path("attached_assets/0_Experimental_Determination_of_Continuous_Phase_Ove_1787290773756.pdf"),
    ),
    (
        "2011-pulsed-disc-doughnut",
        Path("attached_assets/1_Mass_transfer_performance_in_pulsed_disc_and_dough_1787290773756.pdf"),
    ),
]

OUTPUT_DIR = Path(".agents/outputs/kh1999-secondary-literature")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

EQUATION_CROPS = {
    ("2011-pulsed-disc-doughnut", 6): {
        "equations-8-and-9": (50, 315, 430, 740),
        "equations-10-to-13": (370, 315, 570, 625),
    },
    ("2017-kuhni", 9): {
        "kh1999-equation-18": (50, 405, 570, 585),
    },
}

for label, pdf_path in PAPERS:
    document = pymupdf.open(pdf_path)
    print(f"{label}: {document.page_count} pages")
    extracted_pages = []
    for page_number, page in enumerate(document, start=1):
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
        image_path = OUTPUT_DIR / f"{label}-page-{page_number:02d}.png"
        pixmap.save(image_path)
        for crop_name, crop_box in EQUATION_CROPS.get((label, page_number), {}).items():
            crop_pixmap = page.get_pixmap(
                matrix=pymupdf.Matrix(4, 4),
                clip=pymupdf.Rect(*crop_box),
                alpha=False,
            )
            crop_pixmap.save(OUTPUT_DIR / f"{label}-{crop_name}.png")
        extracted_pages.append(f"\n\n===== {label} — PAGE {page_number} =====\n{page.get_text('text')}")
        print(f"  rendered {image_path}")
    (OUTPUT_DIR / f"{label}.txt").write_text("".join(extracted_pages), encoding="utf-8")