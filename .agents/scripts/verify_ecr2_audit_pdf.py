from pathlib import Path
import fitz

pdf_path = Path(".agents/outputs/ECR2-Optimizer-Readiness-Audit-Run-656.pdf")
render_dir = Path(".agents/outputs/ecr2-audit-render")
render_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf_path)
print(f"pages={doc.page_count}")
all_text = "\n".join(page.get_text() for page in doc)
required = [
    "LLX-RND-2026-0003",
    "Run 656",
    "2026-08-23 14:13:10.713 UTC",
    "NOT READY FOR PRELIMINARY OPTIMIZER",
]
for phrase in required:
    print(f"contains[{phrase}]={phrase in all_text}")

for index, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
    pix.save(render_dir / f"page-{index + 1:02d}.png")
print(f"rendered={len(list(render_dir.glob('page-*.png')))}")