import { jsPDF } from "jspdf";

// THERMOPAC brand colours (RGB)
const BRAND_BLUE  : [number, number, number] = [30,  58,  138];
const BRAND_RED   : [number, number, number] = [185, 28,  28 ];
const LIGHT_GRAY  : [number, number, number] = [245, 245, 245];
const MID_GRAY    : [number, number, number] = [107, 114, 128];
const DARK_GRAY   : [number, number, number] = [31,  41,  55 ];
const WHITE       : [number, number, number] = [255, 255, 255];

// ─── Header / Footer helpers ───────────────────────────────────────────────────
function addHeader(doc: jsPDF, sopNumber: string) {
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, 210, 16, "F");
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 16, 210, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text("THERMOPAC", 14, 11);

  doc.setFontSize(8);
  doc.setTextColor(200, 210, 255);
  doc.text(sopNumber, 196, 11, { align: "right" });
}

function addFooter(doc: jsPDF, page: number, total: number, sopNumber: string) {
  doc.setDrawColor(...MID_GRAY);
  doc.setLineWidth(0.3);
  doc.line(14, 287, 196, 287);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MID_GRAY);
  doc.text(`${sopNumber}  |  THERMOPAC — CONFIDENTIAL  |  DRAFT`, 14, 292);
  doc.text(`Page ${page} of ${total}`, 196, 292, { align: "right" });
}

// ─── Simple key-value row ──────────────────────────────────────────────────────
function metaRow(
  doc: jsPDF,
  y: number,
  label1: string, val1: string,
  label2: string, val2: string,
) {
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(14, y, 86, 7, "F");
  doc.rect(104, y, 92, 7, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_BLUE);
  doc.text(label1, 17, y + 5);
  doc.text(label2, 107, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK_GRAY);
  doc.text(val1, 50, y + 5);
  doc.text(val2, 140, y + 5);
  return y + 8;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function downloadSopPdf(sop: any): Promise<void> {
  // 1. Fetch sections
  const res = await fetch(`/api/oi/sop/${sop.id}/sections`);
  if (!res.ok) throw new Error(`Failed to fetch sections: ${res.status}`);
  const sections: any[] = await res.json();
  const sorted = sections.slice().sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  const sopNum = sop.sopNumber ?? `SOP-${sop.id}`;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // ── PAGE 1: Cover ────────────────────────────────────────────────────────────
  addHeader(doc, sopNum);
  let y = 24;

  // Title block
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(14, y, 182, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  doc.text("STANDARD OPERATING PROCEDURE", 105, y + 7, { align: "center" });
  y += 14;

  // SOP title
  const titleLines = doc.splitTextToSize(sop.title ?? "", 178);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND_BLUE);
  doc.text(titleLines, 105, y + 6, { align: "center" });
  y += titleLines.length * 7 + 6;

  // Divider
  doc.setDrawColor(...BRAND_RED);
  doc.setLineWidth(0.8);
  doc.line(14, y, 196, y);
  y += 5;

  // Metadata grid
  y = metaRow(doc, y, "SOP Number", sopNum,                                   "Type",         (sop.sopType ?? "—").replace(/_/g, " "));
  y = metaRow(doc, y, "Department", sop.department ?? "—",                    "Applicable To", sop.applicableRole ?? "—");
  y = metaRow(doc, y, "Process Area", sop.processArea ?? "—",                 "Status",        (sop.status ?? "—").replace(/_/g, " ").toUpperCase());
  y = metaRow(doc, y, "Revision",   `v${sop.revisionNumber ?? 0}`,            "Sections",      String(sorted.length));
  y = metaRow(doc, y, "Owner",      sop.ownerName ?? "—",                     "Effective Date",sop.effectiveDate ? sop.effectiveDate.slice(0, 10) : "—");
  y += 4;

  // Description
  if (sop.description) {
    doc.setFillColor(...BRAND_BLUE);
    doc.rect(14, y, 182, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...WHITE);
    doc.text("DESCRIPTION", 17, y + 4);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK_GRAY);
    const descLines = doc.splitTextToSize(sop.description, 182);
    doc.text(descLines, 14, y);
    y += descLines.length * 4.5 + 6;
  }

  // Table of contents
  if (sorted.length > 0) {
    if (y > 240) { doc.addPage(); addHeader(doc, sopNum); y = 24; }

    doc.setFillColor(...BRAND_BLUE);
    doc.rect(14, y, 182, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...WHITE);
    doc.text("TABLE OF CONTENTS", 17, y + 4);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);

    for (let i = 0; i < sorted.length; i++) {
      if (y > 278) { doc.addPage(); addHeader(doc, sopNum); y = 24; }
      const s = sorted[i];
      const isEven = i % 2 === 0;
      if (isEven) {
        doc.setFillColor(...LIGHT_GRAY);
        doc.rect(14, y - 3, 182, 5.5, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND_BLUE);
      doc.text(s.sectionNo, 17, y + 1);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK_GRAY);
      doc.text(s.sectionTitle, 32, y + 1);
      y += 5.5;
    }
  }

  // ── PAGES: Section Content ────────────────────────────────────────────────────
  for (const section of sorted) {
    doc.addPage();
    addHeader(doc, sopNum);
    y = 24;

    // Section heading bar
    doc.setFillColor(...BRAND_BLUE);
    doc.rect(14, y, 182, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...WHITE);
    doc.text(`${section.sectionNo}   ${section.sectionTitle}`, 18, y + 5.5);
    y += 12;

    // Content
    const raw: string = section.sectionContent ?? "(No content)";
    doc.setFontSize(8.5);

    for (const line of raw.split("\n")) {
      const trimmed = line.trimEnd();

      // Detect ALL-CAPS heading lines (min 4 chars, ends with optional colon)
      const isHeading = /^[A-Z][A-Z &/|()\-]{3,}:?\s*$/.test(trimmed) && trimmed.length > 0;

      if (trimmed === "") {
        y += 2;
      } else if (isHeading) {
        if (y > 272) { doc.addPage(); addHeader(doc, sopNum); y = 24; }
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND_BLUE);
        doc.text(trimmed, 14, y);
        y += 5.5;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DARK_GRAY);
      } else {
        const wrapped = doc.splitTextToSize(trimmed, 182);
        for (const wl of wrapped) {
          if (y > 278) { doc.addPage(); addHeader(doc, sopNum); y = 24; }
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...DARK_GRAY);
          doc.text(wl, 14, y);
          y += 4.3;
        }
      }
    }
  }

  // ── Footers on all pages ──────────────────────────────────────────────────────
  const total: number = typeof (doc as any).getNumberOfPages === "function"
    ? (doc as any).getNumberOfPages()
    : (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    addFooter(doc, p, total, sopNum);
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  doc.save(`${sopNum}.pdf`);
}
