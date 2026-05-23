import { jsPDF } from "jspdf";

// ── Brand palette ─────────────────────────────────────────────────────────────
const B_BLUE  : [number,number,number] = [30,  58,  138];
const B_RED   : [number,number,number] = [185, 28,  28 ];
const B_LGRAY : [number,number,number] = [241, 245, 249];
const B_MGRAY : [number,number,number] = [148, 163, 184];
const B_DGRAY : [number,number,number] = [30,  41,  59 ];
const B_WHITE : [number,number,number] = [255, 255, 255];
const B_LBORD : [number,number,number] = [203, 213, 225];
const B_HBORD : [number,number,number] = [100, 116, 139];

// ── Page constants ─────────────────────────────────────────────────────────────
const ML = 15;          // left margin
const MR = 15;          // right margin
const PW = 210;
const PH = 297;
const CW = PW - ML - MR; // 180 mm content width
const BODY_FS  = 9;
const BODY_LH  = 5.2;   // line height mm for 9 pt

// ── Page chrome ───────────────────────────────────────────────────────────────
function hdr(doc: jsPDF, sopNum: string, title: string) {
  doc.setFillColor(...B_BLUE);
  doc.rect(0, 0, PW, 14, "F");
  doc.setFillColor(...B_RED);
  doc.rect(0, 14, PW, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...B_WHITE);
  doc.text("THERMOPAC", ML, 9.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(180, 200, 240);
  const maxTitle = 80;
  const short = title.length > maxTitle ? title.slice(0, maxTitle - 1) + "…" : title;
  doc.text(short, PW / 2, 9.5, { align: "center" });

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
  const h    = 6.5;
  const colW = CW / 2;
  if (shade) { doc.setFillColor(...B_LGRAY); doc.rect(ML, y, CW, h, "F"); }
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

// ── Table helpers ─────────────────────────────────────────────────────────────

/** True if a line looks like a markdown pipe-table row:  | cell | cell | … */
function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && (t.match(/\|/g) ?? []).length >= 3;
}

/** True if the row is a separator row: |---|---| or |:--|:--:| etc. */
function isSeparatorRow(line: string): boolean {
  if (!isTableRow(line)) return false;
  const inner = line.replace(/\s/g, "");
  return /^\|([-:]+\|)+$/.test(inner);
}

/** Parse a table row string into trimmed cell strings. */
function parseCells(line: string): string[] {
  return line.trim().split("|").slice(1, -1).map(c => c.trim());
}

/**
 * Compute a sensible per-column width array for `numCols` columns,
 * with the first column wider (label column) and remainder split equally.
 */
function colWidths(numCols: number, totalW: number): number[] {
  if (numCols <= 0) return [];
  if (numCols === 1) return [totalW];
  if (numCols === 2) return [totalW * 0.55, totalW * 0.45];
  // For 3+ cols: first col ~38 %, rest split equally
  const firstW = Math.min(Math.max(totalW * 0.38, 40), 75);
  const restW  = (totalW - firstW) / (numCols - 1);
  return [firstW, ...Array(numCols - 1).fill(restW)];
}

/**
 * Render a 2-D cell grid as an enterprise-style bordered PDF table.
 * rows[0] is treated as the header row.
 * Returns the new y cursor position.
 */
function drawTable(
  doc: jsPDF,
  rows: string[][],
  y: number,
  sopNum: string,
  sopTitle: string,
  tableWidth: number = CW,
): number {
  if (rows.length === 0) return y;

  const numCols = Math.max(...rows.map(r => r.length));
  if (numCols === 0) return y;

  const cw      = colWidths(numCols, tableWidth);
  const PAD     = 2;       // horizontal cell padding mm
  const HDR_H   = 7;       // header row height mm
  const ROW_H   = 5.5;     // data row height mm
  const FONT_SZ = 7.5;

  for (let r = 0; r < rows.length; r++) {
    const isHdr = r === 0;
    const rowH  = isHdr ? HDR_H : ROW_H;
    const rowY  = y;

    // ── Page-break ──────────────────────────────────────────────────────────
    if (y + rowH > 278) {
      doc.addPage();
      hdr(doc, sopNum, sopTitle);
      y = 20;
    }

    // ── Row background ────────────────────────────────────────────────────
    if (isHdr) {
      doc.setFillColor(...B_BLUE);
    } else if (r % 2 === 0) {
      doc.setFillColor(...B_LGRAY);
    } else {
      doc.setFillColor(...B_WHITE);
    }
    doc.rect(ML, y, tableWidth, rowH, "F");

    // ── Cell borders & text ───────────────────────────────────────────────
    let x = ML;
    for (let c = 0; c < numCols; c++) {
      const w    = cw[c] ?? 10;
      const cell = rows[r]?.[c] ?? "";

      // Outer cell border
      doc.setDrawColor(...B_HBORD);
      doc.setLineWidth(0.25);
      doc.rect(x, y, w, rowH, "S");

      // Typography
      doc.setFontSize(FONT_SZ);
      if (isHdr) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...B_WHITE);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...B_DGRAY);
      }

      const textY = y + rowH / 2 + 2.2; // vertically centred

      // Center short RASI codes in non-first columns; left-align otherwise
      if (!isHdr && c > 0 && cell.length <= 3) {
        doc.text(cell, x + w / 2, textY, { align: "center" });
      } else {
        // Truncate to fit cell width
        const maxW    = w - PAD * 2;
        const words   = doc.splitTextToSize(cell, maxW);
        const display = words[0] ?? "";
        doc.text(display, x + PAD, textY);
      }

      x += w;
    }

    y += rowH;
  }

  // Draw a strong bottom border under the whole table
  doc.setDrawColor(...B_HBORD);
  doc.setLineWidth(0.4);
  doc.line(ML, y, ML + tableWidth, y);

  return y + 3; // small gap after table
}

// ── Content-line renderer ─────────────────────────────────────────────────────

/**
 * Render a single block of section text (possibly containing pipe tables).
 * Returns updated y.
 */
function renderContent(
  doc: jsPDF,
  raw: string,
  startY: number,
  sopNum: string,
  sopTitle: string,
): number {
  const lines = raw.split(/\r?\n/);
  let y = startY;
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trimEnd();

    // ── Detect start of a pipe-table block ──────────────────────────────
    if (isTableRow(trimmed)) {
      // Collect contiguous table lines (rows + separator + blank between)
      const tableLines: string[] = [];
      while (i < lines.length && (isTableRow(lines[i]) || isSeparatorRow(lines[i]))) {
        tableLines.push(lines[i]);
        i++;
      }
      // Parse (skip separator rows)
      const tableRows: string[][] = tableLines
        .filter(l => !isSeparatorRow(l))
        .map(l => parseCells(l));

      if (tableRows.length > 0) {
        // Add some space before table
        y += 2;
        // Check if wide table should have a note
        const numCols = Math.max(...tableRows.map(r => r.length));
        if (numCols > 7) {
          // For very wide tables, reduce font slightly — still portrait
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7);
          doc.setTextColor(...B_MGRAY);
          doc.text("(Wide table — column widths auto-fitted to page width)", ML + 2, y);
          y += 4;
        }
        y = drawTable(doc, tableRows, y, sopNum, sopTitle, CW);
      }
      continue;
    }

    // ── Blank line ────────────────────────────────────────────────────────
    if (trimmed === "") {
      y += 2.5;
      i++;
      continue;
    }

    // ── Sub-heading detection ─────────────────────────────────────────────
    const isSubHdr =
      (/^[A-Z][A-Z0-9 ,&/()\-]{2,}:?\s*$/.test(trimmed) && trimmed.length <= 80) ||
      (/^[A-Za-z0-9][^:]{1,60}:\s*$/.test(trimmed) && trimmed.length <= 70);

    // ── Bullet list detection ─────────────────────────────────────────────
    const bulletMatch = trimmed.match(/^([•\-\*]|\d{1,2}\.)\s+/);

    if (isSubHdr && !bulletMatch) {
      if (y > 272) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(BODY_FS);
      doc.setTextColor(...B_BLUE);
      doc.text(trimmed, ML + 2, y);
      const tw = doc.getTextWidth(trimmed);
      doc.setDrawColor(...B_BLUE);
      doc.setLineWidth(0.3);
      doc.line(ML + 2, y + 0.8, ML + 2 + tw, y + 0.8);
      y += BODY_LH + 1;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...B_DGRAY);

    } else if (bulletMatch) {
      const prefix  = bulletMatch[0];
      const rest    = trimmed.slice(prefix.length);
      const indent  = ML + 6;
      const bWidth  = CW - 6 - 5;
      const wrapped = doc.splitTextToSize(rest, bWidth);
      for (let wi = 0; wi < wrapped.length; wi++) {
        if (y > 278) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
        doc.setFontSize(BODY_FS);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...B_DGRAY);
        if (wi === 0) {
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
      // Normal paragraph line
      const wrapped = doc.splitTextToSize(trimmed, CW - 4);
      for (const wl of wrapped) {
        if (y > 278) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
        doc.setFontSize(BODY_FS);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...B_DGRAY);
        doc.text(wl, ML + 2, y);
        y += BODY_LH;
      }
    }

    i++;
  }

  return y;
}

// ── Main export ───────────────────────────────────────────────────────────────
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
  y = kvRow(doc, y, false, "Process Area", area,  "Status",        status);
  y = kvRow(doc, y, true,  "Revision",   rev,     "Sections",      String(sorted.length));
  y = kvRow(doc, y, false, "Owner",      owner,   "Effective Date", effDate);
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
      doc.setDrawColor(...B_LBORD);
      doc.setLineWidth(0.15);
      doc.rect(ML, y, CW, rowH, "S");
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
  // CONTENT PAGES
  // ══════════════════════════════════════════════════════════════
  for (const section of sorted) {
    doc.addPage();
    hdr(doc, sopNum, sopTitle);
    y = 20;

    const secLabel = `${section.sectionNo ?? ""}   ${section.sectionTitle ?? ""}`;
    y = sectionBar(doc, y, secLabel);

    const raw: string = section.sectionContent ?? "(No content provided.)";
    y = renderContent(doc, raw, y, sopNum, sopTitle);
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
