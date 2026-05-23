import { jsPDF } from "jspdf";
import "jspdf-autotable";

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

// THERMOPAC brand colours
const BRAND_BLUE  = [30, 58, 138]  as [number, number, number]; // blue-900
const BRAND_RED   = [185, 28, 28]  as [number, number, number]; // red-700
const LIGHT_GRAY  = [245, 245, 245] as [number, number, number];
const MID_GRAY    = [107, 114, 128] as [number, number, number];
const DARK_GRAY   = [31, 41, 55]   as [number, number, number];

function addPageHeader(doc: jsPDF, sopNumber: string) {
  // Blue bar
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, 210, 18, "F");

  // THERMOPAC name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("THERMOPAC", 14, 11);

  // Red accent bar
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 18, 210, 2, "F");

  // SOP number watermark right side
  doc.setFontSize(8);
  doc.setTextColor(200, 210, 255);
  doc.text(sopNumber, 196, 11, { align: "right" });
}

function addPageFooter(doc: jsPDF, page: number, total: number, sopNumber: string) {
  const y = 291;
  doc.setDrawColor(...MID_GRAY);
  doc.setLineWidth(0.3);
  doc.line(14, y - 2, 196, y - 2);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MID_GRAY);
  doc.text(`${sopNumber}  |  THERMOPAC — CONFIDENTIAL`, 14, y + 3);
  doc.text(`Page ${page} of ${total}`, 196, y + 3, { align: "right" });
}

export async function downloadSopPdf(sop: any): Promise<void> {
  // 1. Fetch sections
  const r = await fetch(`/api/oi/sop/${sop.id}/sections`);
  if (!r.ok) throw new Error("Failed to fetch SOP sections");
  const sections: any[] = await r.json();

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const sopNum = sop.sopNumber ?? `SOP-${sop.id}`;

  // ── Page 1: Cover / Metadata ────────────────────────────────────────────────
  addPageHeader(doc, sopNum);

  let y = 30;

  // Title block
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(14, y, 182, 24, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND_BLUE);
  doc.text("Standard Operating Procedure", 105, y + 9, { align: "center" });

  doc.setFontSize(11);
  doc.setTextColor(...DARK_GRAY);
  const titleLines = doc.splitTextToSize(sop.title ?? "", 170);
  doc.text(titleLines, 105, y + 17, { align: "center" });

  y += 30;

  // Metadata table
  doc.autoTable({
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: BRAND_BLUE, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: LIGHT_GRAY, cellWidth: 40 },
      1: { cellWidth: 50 },
      2: { fontStyle: "bold", fillColor: LIGHT_GRAY, cellWidth: 40 },
      3: { cellWidth: 50 },
    },
    body: [
      ["SOP Number",   sopNum,                                   "Type",        (sop.sopType ?? "—").replace(/_/g, " ")],
      ["Department",   sop.department ?? "—",                    "Role",        sop.applicableRole ?? "—"],
      ["Process Area", sop.processArea ?? "—",                   "Status",      (sop.status ?? "—").replace(/_/g, " ")],
      ["Revision",     `v${sop.revisionNumber ?? 0}`,            "Sections",    String(sections.length)],
      ["Owner",        sop.ownerName ?? "—",                     "Effective",   sop.effectiveDate ? sop.effectiveDate.slice(0, 10) : "—"],
    ],
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Description
  if (sop.description) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("DESCRIPTION", 14, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK_GRAY);
    const descLines = doc.splitTextToSize(sop.description, 182);
    doc.text(descLines, 14, y);
    y += descLines.length * 4.5 + 6;
  }

  // Section list (table of contents)
  if (sections.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("TABLE OF CONTENTS", 14, y);
    y += 4;

    doc.autoTable({
      startY: y,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: BRAND_BLUE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 18, fontStyle: "bold" },
        1: { cellWidth: 164 },
      },
      head: [["Section", "Title"]],
      body: sections
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
        .map(s => [s.sectionNo, s.sectionTitle]),
      margin: { left: 14, right: 14 },
    });
  }

  // ── Pages 2+: Section Content ────────────────────────────────────────────────
  const sorted = sections.slice().sort((a, b) => a.sequence - b.sequence);

  for (const section of sorted) {
    doc.addPage();
    addPageHeader(doc, sopNum);
    y = 26;

    // Section heading
    doc.setFillColor(...BRAND_BLUE);
    doc.rect(14, y, 182, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`${section.sectionNo}  ${section.sectionTitle}`, 18, y + 5.5);
    y += 14;

    // Section content
    const content: string = section.sectionContent ?? "";
    const lines = content.split("\n");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK_GRAY);

    for (const rawLine of lines) {
      // Headings inside content (ALL CAPS lines followed by colon or standalone)
      const isHeading = /^[A-Z][A-Z\s\-\/()]{4,}[:]?\s*$/.test(rawLine.trim());

      if (isHeading && rawLine.trim().length > 0) {
        if (y > 274) { doc.addPage(); addPageHeader(doc, sopNum); y = 26; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...BRAND_BLUE);
        doc.text(rawLine, 14, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DARK_GRAY);
        y += 5;
      } else if (rawLine.trim() === "") {
        y += 2.5;
      } else {
        const wrapped = doc.splitTextToSize(rawLine, 182);
        for (const wl of wrapped) {
          if (y > 280) { doc.addPage(); addPageHeader(doc, sopNum); y = 26; }
          doc.text(wl, 14, y);
          y += 4.3;
        }
      }
    }
  }

  // ── Page numbers + footers ───────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addPageFooter(doc, p, totalPages, sopNum);
  }

  doc.save(`${sopNum}.pdf`);
}
