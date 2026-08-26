---
name: PDFKit footer bounds
description: Prevent unbounded PDF page creation when rendering buffered engineering reports.
---

PDFKit report footers must be written inside the document's configured printable bottom boundary, and the final page count must be captured before iterating buffered pages to add footers.

**Why:** Writing a footer below the bottom margin can trigger automatic pagination while the report is being post-processed. With `bufferPages` enabled, that can grow the page buffer until the Node process exhausts its heap.

**How to apply:** Keep absolute footer coordinates above `pageHeight - bottomMargin`, capture `const pageCount = doc.bufferedPageRange().count` once, then switch each existing page and render its explicit page number. Validate page count and rendered first/last pages after generating an engineering PDF.