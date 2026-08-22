from pathlib import Path
import fitz

PDF = Path("attached_assets/Drop_size_in_a_liquid_pulsed_sieve-plate_extractio_1787397293698.pdf")
OUT = Path(".agents/outputs/usman-2009")
OUT.mkdir(parents=True, exist_ok=True)

doc = fitz.open(PDF)
print("metadata:", doc.metadata)
print("pages:", doc.page_count)

for index, page in enumerate(doc):
    page_no = index + 1
    pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
    image_path = OUT / f"page-{page_no:02d}.png"
    pix.save(image_path)

    text = page.get_text("text")
    (OUT / f"page-{page_no:02d}.txt").write_text(text, encoding="utf-8")
    print(f"page {page_no}: {page.rect.width:.1f}x{page.rect.height:.1f}, "
          f"text={len(text)} chars, image={image_path}")

# High-resolution crop of the printed Kumar & Hartland (1986) Eq. (2).
page = doc[3]
clip = fitz.Rect(270, 175, 570, 330)
pix = page.get_pixmap(matrix=fitz.Matrix(5, 5), clip=clip, alpha=False)
crop_path = OUT / "page-04-kh1986-eq2.png"
pix.save(crop_path)
print("equation crop:", crop_path)
