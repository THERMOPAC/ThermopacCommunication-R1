from pathlib import Path

import fitz


pdf_path = Path("attached_assets/41598_2024_Article_52542_1787396196058.pdf")
output_dir = Path(".agents/outputs/mirzaei-2023")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(pdf_path)
page = document[2]
matrix = fitz.Matrix(3, 3)
pixmap = page.get_pixmap(matrix=matrix, alpha=False)
pixmap.save(output_dir / "page-3.png")

# Table 1, central correlation column. The high-resolution crop preserves
# superscripts/subscripts for source transcription.
table_crop = fitz.Rect(280, 450, 525, 535)
crop_pixmap = page.get_pixmap(matrix=fitz.Matrix(6, 6), clip=table_crop, alpha=False)
crop_pixmap.save(output_dir / "table-1-central-rows.png")

# Table 1 reference 24: Kumar & Hartland (1996), above the reference-25 row.
kh1996_crop = fitz.Rect(275, 405, 525, 465)
kh1996_pixmap = page.get_pixmap(matrix=fitz.Matrix(7, 7), clip=kh1996_crop, alpha=False)
kh1996_pixmap.save(output_dir / "table-1-kh1996-row.png")

# Save positioned text blocks as an audit aid for locating the Kühni row.
blocks = page.get_text("dict")["blocks"]
lines = []
for block in blocks:
    if block.get("type") != 0:
        continue
    for line in block.get("lines", []):
        text = "".join(span.get("text", "") for span in line.get("spans", []))
        if text.strip():
            lines.append({"bbox": line["bbox"], "text": text})

(output_dir / "page-3-text-blocks.json").write_text(
    __import__("json").dumps(lines, indent=2, ensure_ascii=False),
    encoding="utf-8",
)
print(f"Rendered {pdf_path} page 3 to {output_dir / 'page-3.png'}")
print(f"Saved {len(lines)} positioned text lines")