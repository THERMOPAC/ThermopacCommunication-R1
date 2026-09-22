"""Render every PDF page and contact sheets; inspect text bounds without OCR."""
import json
import pathlib
import sys
import fitz
from PIL import Image, ImageDraw

for filename in sys.argv[1:]:
    pdf = pathlib.Path(filename)
    document = fitz.open(pdf)
    out = pdf.parent / (pdf.stem + "-review")
    out.mkdir(parents=True, exist_ok=True)
    thumbnails, overflow, empty, landscape = [], [], [], []
    text_pages = []
    for index, page in enumerate(document):
        text = page.get_text()
        text_pages.append(text)
        if len(text.strip()) < 30:
            empty.append(index + 1)
        if page.rect.width > page.rect.height:
            landscape.append(index + 1)
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    x0, y0, x1, y1 = span["bbox"]
                    if x0 < -1 or y0 < -1 or x1 > page.rect.width + 1 or y1 > page.rect.height + 1:
                        overflow.append({"page": index + 1, "text": span["text"]})
        pix = page.get_pixmap(matrix=fitz.Matrix(100 / 72, 100 / 72), alpha=False)
        path = out / f"page-{index + 1:03}.png"
        pix.save(path)
        image = Image.open(path).convert("RGB")
        image.thumbnail((180, 255))
        tile = Image.new("RGB", (200, 280), "#dde3e9")
        tile.paste(image, ((200 - image.width) // 2, 8))
        ImageDraw.Draw(tile).text((8, 262), f"Page {index + 1}", fill="black")
        thumbnails.append(tile)
    for start in range(0, len(thumbnails), 30):
        subset = thumbnails[start:start + 30]
        contact = Image.new("RGB", (1000, ((len(subset) + 4) // 5) * 280), "white")
        for i, tile in enumerate(subset):
            contact.paste(tile, ((i % 5) * 200, (i // 5) * 280))
        contact.save(out / f"contact-{start // 30 + 1:02}.jpg", quality=90)
    summary = {"pdf": str(pdf), "pages": len(document), "landscapeDrawingPages": landscape,
               "emptyPages": empty, "outOfPageText": overflow}
    (out / "inspection.json").write_text(json.dumps(summary, indent=2))
    (out / "extracted-text.txt").write_text("\n\f\n".join(text_pages))
    print(json.dumps(summary))