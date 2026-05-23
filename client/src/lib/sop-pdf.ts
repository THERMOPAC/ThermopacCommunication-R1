import { jsPDF } from "jspdf";

// ── Brand palette ─────────────────────────────────────────────────────────────
const B_BLUE  : [number,number,number] = [30,  58,  138];
const B_RED   : [number,number,number] = [185, 28,  28 ];
const B_LGRAY : [number,number,number] = [241, 245, 249];
const B_MGRAY : [number,number,number] = [148, 163, 184];
const B_DGRAY : [number,number,number] = [30,  41,  59 ];
const B_WHITE : [number,number,number] = [255, 255, 255];
const B_LBORD : [number,number,number] = [203, 213, 225];

// ── Page constants ─────────────────────────────────────────────────────────────
const ML = 15; // left margin
const MR = 15; // right margin
const PW = 210;
const PH = 297;
const CW = PW - ML - MR; // 180mm content width
const BODY_FS = 9;
const BODY_LH = 5.2; // line height mm for 9pt

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(doc: jsPDF, y: number, minY = 24, limit = 278): number {
  return Math.max(y, minY);
}

function hdr(doc: jsPDF, sopNum: string, title: string) {
  // Blue top band
  doc.setFillColor(...B_BLUE);
  doc.rect(0, 0, PW, 14, "F");
  // Red accent line
  doc.setFillColor(...B_RED);
  doc.rect(0, 14, PW, 1.5, "F");
  // "THERMOPAC" wordmark
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...B_WHITE);
  doc.text("THERMOPAC", ML, 9.5);
  // Centre title (truncated)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(180, 200, 240);
  const maxTitle = 80;
  const shortTitle = title.length > maxTitle ? title.slice(0, maxTitle - 1) + "…" : title;
  doc.text(shortTitle, PW / 2, 9.5, { align: "center" });
  // SOP number right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(200, 215, 250);
  doc.text(sopNum, PW - MR, 9.5, { align: "right" });
}

function ftr(doc: jsPDF, page: number, total: number, sopNum: string) {
  const y = PH - 8;
  doc.setDrawColor(...B_LBORD);
  doc.setLineWidth(0.25);
  doc.line(ML, y - 1, PW - MR, y - 1);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...B_MGRAY);
  doc.text(`${sopNum}  ·  THERMOPAC Pvt. Ltd.  ·  CONFIDENTIAL DRAFT`, ML, y + 3);
  doc.text(`Page ${page} / ${total}`, PW - MR, y + 3, { align: "right" });
}

function sectionBar(doc: jsPDF, y: number, label: string): number {
  doc.setFillColor(...B_BLUE);
  doc.rect(ML, y, CW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...B_WHITE);
  doc.text(label, ML + 3, y + 5);
  return y + 9;
}

function kvRow(
  doc: jsPDF, y: number, shade: boolean,
  k1: string, v1: string, k2: string, v2: string,
): number {
  const h = 6.5;
  const colW = CW / 2;
  if (shade) {
    doc.setFillColor(...B_LGRAY);
    doc.rect(ML, y, CW, h, "F");
  }
  doc.setDrawColor(...B_LBORD);
  doc.setLineWidth(0.2);
  doc.rect(ML, y, CW, h, "S");
  doc.line(ML + colW, y, ML + colW, y + h);
  doc.line(ML + colW / 2, y, ML + colW / 2, y + h);
  doc.line(ML + colW + colW / 2, y, ML + colW + colW / 2, y + h);

  const ky = y + h - 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...B_BLUE);
  doc.text(k1, ML + 2, ky);
  doc.text(k2, ML + colW + 2, ky);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...B_DGRAY);
  doc.text(v1, ML + colW / 2 + 2, ky);
  doc.text(v2, ML + colW + colW / 2 + 2, ky);
  return y + h;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function downloadSopPdf(sop: any): Promise<void> {
  const res = await fetch(`/api/oi/sop/${sop.id}/sections`);
  if (!res.ok) throw new Error(`Sections fetch failed: ${res.status}`);
  const sections: any[] = await res.json();
  const sorted = sections.slice().sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  const sopNum   = sop.sopNumber ?? `SOP-${sop.id}`;
  const sopTitle = sop.title ?? sopNum;

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  // ══════════════════════════════════════════════════════════════
  // PAGE 1 — Cover
  // ══════════════════════════════════════════════════════════════
  hdr(doc, sopNum, sopTitle);
  let y = 20;

  // Hero title block
  doc.setFillColor(245, 248, 255);
  doc.rect(ML, y, CW, 26, "F");
  doc.setDrawColor(...B_BLUE);
  doc.setLineWidth(0.8);
  doc.line(ML, y, ML, y + 26);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...B_MGRAY);
  doc.text("STANDARD OPERATING PROCEDURE", ML + 5, y + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...B_BLUE);
  const titleWrapped = doc.splitTextToSize(sopTitle, CW - 8);
  doc.text(titleWrapped, ML + 5, y + 13);
  y += 28;

  // Metadata table
  const dept    = sop.department ?? "—";
  const role    = sop.applicableRole ?? "—";
  const type    = (sop.sopType ?? "—").replace(/_/g, " ");
  const status  = (sop.status ?? "—").replace(/_/g, " ").toUpperCase();
  const rev     = `v${sop.revisionNumber ?? 0}`;
  const owner   = sop.ownerName ?? "—";
  const effDate = sop.effectiveDate ? sop.effectiveDate.slice(0, 10) : "—";
  const area    = sop.processArea ?? "—";

  y = kvRow(doc, y, false, "SOP Number", sopNum,  "Type",          type);
  y = kvRow(doc, y, true,  "Department", dept,    "Applicable To", role);
  y = kvRow(doc, y, false, "Process Area",area,   "Status",        status);
  y = kvRow(doc, y, true,  "Revision",   rev,     "Sections",      String(sorted.length));
  y = kvRow(doc, y, false, "Owner",      owner,   "Effective Date",effDate);
  y += 5;

  // Description block
  if (sop.description) {
    y = sectionBar(doc, y, "DESCRIPTION");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_FS);
    doc.setTextColor(...B_DGRAY);
    const dl = doc.splitTextToSize(sop.description, CW - 4);
    for (const line of dl) {
      if (y > 272) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
      doc.text(line, ML + 2, y);
      y += BODY_LH;
    }
    y += 3;
  }

  // Table of Contents
  if (sorted.length > 0) {
    if (y > 240) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
    y = sectionBar(doc, y, "TABLE OF CONTENTS");

    for (let i = 0; i < sorted.length; i++) {
      if (y > 278) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
      const s = sorted[i];
      const rowH = 5.5;
      if (i % 2 === 0) { doc.setFillColor(...B_LGRAY); doc.rect(ML, y, CW, rowH, "F"); }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...B_BLUE);
      doc.text(s.sectionNo ?? "", ML + 2, y + rowH - 1.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...B_DGRAY);
      doc.text(s.sectionTitle ?? "", ML + 22, y + rowH - 1.5);
      y += rowH;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CONTENT PAGES — one section per page (or continue on same if short)
  // ══════════════════════════════════════════════════════════════
  for (const section of sorted) {
    doc.addPage();
    hdr(doc, sopNum, sopTitle);
    y = 20;

    // Section title bar
    const secLabel = `${section.sectionNo ?? ""}   ${section.sectionTitle ?? ""}`;
    y = sectionBar(doc, y, secLabel);

    const raw: string = section.sectionContent ?? "(No content provided.)";
    const lines = raw.split(/\r?\n/);

    doc.setFontSize(BODY_FS);

    for (let li = 0; li < lines.length; li++) {
      const trimmed = lines[li].trimEnd();

      if (trimmed === "") {
        y += 2.5;
        continue;
      }

      // Detect bold sub-headings: lines ending with ":" that are ≤70 chars
      // OR lines that are ALL CAPS with optional colon
      const isSubHdr =
        (/^[A-Z][A-Z0-9 ,&/()\-]{2,}:?\s*$/.test(trimmed) && trimmed.length <= 80)
        || (/^[A-Za-z0-9][^:]{1,60}:\s*$/.test(trimmed) && trimmed.length <= 70);

      // Detect bullet points: -, •, *, or numbered list 1. 2. etc.
      const bulletMatch = trimmed.match(/^([•\-\*]|\d{1,2}\.)\s+/);

      if (isSubHdr && !bulletMatch) {
        if (y > 272) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...B_BLUE);
        doc.text(trimmed, ML + 2, y);
        // Underline
        const tw = doc.getTextWidth(trimmed);
        doc.setDrawColor(...B_BLUE);
        doc.setLineWidth(0.3);
        doc.line(ML + 2, y + 0.8, ML + 2 + tw, y + 0.8);
        y += BODY_LH + 1;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...B_DGRAY);
      } else if (bulletMatch) {
        const prefix = bulletMatch[0];
        const rest   = trimmed.slice(prefix.length);
        const indent = ML + 6;
        const bWidth = CW - 6 - 5;
        const wrapped = doc.splitTextToSize(rest, bWidth);
        for (let wi = 0; wi < wrapped.length; wi++) {
          if (y > 278) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...B_DGRAY);
          if (wi === 0) {
            // Bullet symbol
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...B_BLUE);
            const sym = /^\d/.test(prefix) ? prefix.trim() : "•";
            doc.text(sym, ML + 2, y);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...B_DGRAY);
          }
          doc.text(wrapped[wi], indent, y);
          y += BODY_LH;
        }
      } else {
        const wrapped = doc.splitTextToSize(trimmed, CW - 4);
        for (const wl of wrapped) {
          if (y > 278) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...B_DGRAY);
          doc.text(wl, ML + 2, y);
          y += BODY_LH;
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Footers on all pages
  // ══════════════════════════════════════════════════════════════
  const total: number =
    typeof (doc as any).getNumberOfPages === "function"
      ? (doc as any).getNumberOfPages()
      : (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    ftr(doc, p, total, sopNum);
  }

  doc.save(`${sopNum}.pdf`);
}
