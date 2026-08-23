from pathlib import Path
import fitz

pdf_path = Path(".agents/outputs/LLX-RND-2026-0003-Run-711.pdf")
out_dir = Path(".agents/outputs/run711-rendered")
out_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(pdf_path)
for page_number, page in enumerate(document, start=1):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    pixmap.save(out_dir / f"page-{page_number:02d}.png")

print(f"rendered {len(document)} pages to {out_dir}")