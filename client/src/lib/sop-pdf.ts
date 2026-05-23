import { jsPDF } from "jspdf";

// ── Brand palette ─────────────────────────────────────────────────────────────
const B_BLUE  : [number,number,number] = [30,  58,  138];
const B_RED   : [number,number,number] = [185, 28,  28 ];
const B_LGRAY : [number,number,number] = [241, 245, 249];
const B_ALGRAY: [number,number,number] = [224, 231, 242]; // alternate row
const B_MGRAY : [number,number,number] = [148, 163, 184];
const B_DGRAY : [number,number,number] = [30,  41,  59 ];
const B_WHITE : [number,number,number] = [255, 255, 255];
const B_LBORD : [number,number,number] = [180, 195, 220];
const B_HBORD : [number,number,number] = [80,  100, 150];

// ── Page constants ─────────────────────────────────────────────────────────────
const ML     = 14;         // left margin
const MR     = 14;         // right margin
const PW     = 210;
const PH     = 297;
const CW     = PW - ML - MR; // 182 mm content width
const BODY_FS = 8.5;
const BODY_LH = 5.0;

// ── Page chrome ───────────────────────────────────────────────────────────────
function hdr(doc: jsPDF, sopNum: string, title: string) {
  doc.setFillColor(...B_BLUE);
  doc.rect(0, 0, PW, 13, "F");
  doc.setFillColor(...B_RED);
  doc.rect(0, 13, PW, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...B_WHITE);
  doc.text("THERMOPAC", ML, 9);

  const short = title.length > 75 ? title.slice(0, 74) + "…" : title;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(175, 200, 240);
  doc.text(short, PW / 2, 9, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(200, 215, 250);
  doc.text(sopNum, PW - MR, 9, { align: "right" });
}

function ftr(doc: jsPDF, page: number, total: number, sopNum: string) {
  const y = PH - 8;
  doc.setDrawColor(...B_LBORD);
  doc.setLineWidth(0.25);
  doc.line(ML, y - 1, PW - MR, y - 1);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
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

// ── Table Detection ────────────────────────────────────────────────────────────

/**
 * True if a line is a separator row: contains ONLY dashes, pipes, colons, spaces.
 * e.g.  "---|---"  or  "-----------|------------|-------"
 */
function isDashSep(line: string): boolean {
  const t = line.trim();
  return t.length >= 3 && /^[\-\|:\s]+$/.test(t) && t.includes("-");
}

/**
 * True if a line is a genuine table data row:
 * - Contains at least one "|"
 * - Is NOT a bullet line (starts with •, *, %, numbers)
 * - Is NOT a dash separator
 * - Is NOT a pure note line (starts with "[")
 */
function isTableDataRow(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (!t.includes("|")) return false;
  if (isDashSep(t)) return false;
  // Exclude bullet lines
  if (/^[•\*%]/.test(t)) return false;
  // Exclude lines that are clearly bullet dashes: "- word" (dash + space + word without |...no, still has |)
  // Actually if starts with "- " and the | is inside a description, it's a bullet
  if (/^-\s+\S/.test(t) && !/\|\s/.test(t.slice(0, 5))) return false;
  // Exclude numbered list lines
  if (/^\d+[\.\)]\s/.test(t)) return false;
  // Exclude "KEY:" legend lines (single isolated pipe-line that is a legend)
  // We handle this through the block min-size requirement instead
  return true;
}

/**
 * Parse a pipe-delimited row into trimmed cell strings.
 * Handles both "| a | b |" and "a | b" formats.
 */
function parseCells(line: string): string[] {
  const t = line.trim();
  if (t.startsWith("|") && t.endsWith("|")) {
    return t.split("|").slice(1, -1).map(c => c.trim());
  }
  return t.split("|").map(c => c.trim());
}

/**
 * Try to detect a table block starting at lines[startIdx].
 * Returns [parsedRows, nextLineIndex] or null if not a table.
 *
 * Detection rules:
 *   A. data-row immediately followed by a separator row → table (header+sep+data)
 *   B. 3+ consecutive data-rows with no separator → table (headerless)
 */
function detectTable(lines: string[], startIdx: number): [string[][], number] | null {
  if (!isTableDataRow(lines[startIdx])) return null;

  // Check for pattern A: first line is header, second is separator
  const second = lines[startIdx + 1] ?? "";
  const isPatternA = isDashSep(second.trim());

  // Check for pattern B: 3+ consecutive table data rows
  let consecutiveCount = 0;
  for (let k = startIdx; k < lines.length; k++) {
    if (isTableDataRow(lines[k])) consecutiveCount++;
    else break;
  }
  const isPatternB = consecutiveCount >= 3;

  if (!isPatternA && !isPatternB) return null;

  // Collect the full block
  const block: string[] = [];
  let i = startIdx;
  while (i < lines.length) {
    const t = lines[i].trim();
    // End block on empty line or a non-table, non-separator line
    if (t === "") { i++; break; }
    if (!isTableDataRow(lines[i]) && !isDashSep(lines[i])) break;
    block.push(lines[i]);
    i++;
  }

  // Parse: skip separator rows, keep data rows
  const rows = block
    .filter(l => !isDashSep(l))
    .map(l => parseCells(l))
    .filter(r => r.length > 0 && r.some(c => c.length > 0));

  if (rows.length < 2) return null; // need header + at least 1 data row
  return [rows, i];
}

// ── Column width computation ─────────────────────────────────────────────────

/**
 * Compute column widths proportional to max content length,
 * with smart min/max guards per column type.
 */
function computeColWidths(rows: string[][], totalW: number): number[] {
  const numCols = Math.max(...rows.map(r => r.length));
  if (numCols === 0) return [];
  if (numCols === 1) return [totalW];

  // Max character length per column (over all rows)
  const maxLens: number[] = Array(numCols).fill(0);
  for (const row of rows) {
    for (let c = 0; c < numCols; c++) {
      maxLens[c] = Math.max(maxLens[c], (row[c] ?? "").length);
    }
  }

  // Clamp each col: min 8 chars, max 60 chars for proportional calc
  const clamped = maxLens.map(l => Math.min(Math.max(l, 8), 60));
  const total   = clamped.reduce((a, b) => a + b, 0);
  const raw     = clamped.map(l => (l / total) * totalW);

  // Enforce absolute minimums (mm)
  const MIN = 12;
  const widths = raw.map(w => Math.max(w, MIN));
  const sum    = widths.reduce((a, b) => a + b, 0);

  // Scale to exactly fit totalW
  return widths.map(w => (w / sum) * totalW);
}

// ── Table renderer ────────────────────────────────────────────────────────────

const TBL_FONT   = 7.5;  // font size inside tables
const TBL_LINE_H = 3.5;  // mm per wrapped line at TBL_FONT
const TBL_PAD    = 1.8;  // horizontal cell padding
const TBL_HDR_H  = 7;    // header row height
const TBL_MIN_H  = 5.5;  // min data row height

function drawTable(
  doc: jsPDF,
  rows: string[][],
  startY: number,
  sopNum: string,
  sopTitle: string,
  tableW: number = CW,
): number {
  if (rows.length === 0) return startY;
  const numCols = Math.max(...rows.map(r => r.length));
  if (numCols === 0) return startY;

  const cw  = computeColWidths(rows, tableW);
  let y = startY;

  for (let r = 0; r < rows.length; r++) {
    const isHdr = r === 0;
    const row   = rows[r];

    // ── Compute row height based on wrapped text ────────────────────────────
    let rowH = isHdr ? TBL_HDR_H : TBL_MIN_H;
    if (!isHdr) {
      let maxLines = 1;
      doc.setFontSize(TBL_FONT);
      for (let c = 0; c < numCols; c++) {
        const avail = (cw[c] ?? 12) - TBL_PAD * 2;
        const cell  = row[c] ?? "";
        // Skip centering RASI codes — they fit on 1 line
        if (c > 0 && cell.length <= 3) continue;
        const wrapped = doc.splitTextToSize(cell, Math.max(avail, 5));
        maxLines = Math.max(maxLines, wrapped.length);
      }
      rowH = Math.max(TBL_MIN_H, maxLines * TBL_LINE_H + TBL_PAD * 2 + 1);
    }

    // ── Page-break check ──────────────────────────────────────────────────
    if (y + rowH > 276) {
      doc.addPage();
      hdr(doc, sopNum, sopTitle);
      y = 20;
      // Re-draw header on continuation page
      if (r > 0) {
        y = _drawRow(doc, rows[0], y, TBL_HDR_H, cw, numCols, true, tableW);
      }
    }

    y = _drawRow(doc, row, y, rowH, cw, numCols, isHdr, tableW, r);
  }

  // Final bottom border
  doc.setDrawColor(...B_HBORD);
  doc.setLineWidth(0.4);
  doc.line(ML, y, ML + tableW, y);

  return y + 3;
}

function _drawRow(
  doc: jsPDF,
  cells: string[],
  y: number,
  rowH: number,
  cw: number[],
  numCols: number,
  isHdr: boolean,
  tableW: number,
  rowIdx = 0,
): number {
  // Background
  if (isHdr) {
    doc.setFillColor(...B_BLUE);
  } else if (rowIdx % 2 === 1) {
    doc.setFillColor(...B_LGRAY);
  } else {
    doc.setFillColor(...B_ALGRAY);
  }
  doc.rect(ML, y, tableW, rowH, "F");

  // Cells
  let x = ML;
  for (let c = 0; c < numCols; c++) {
    const w    = cw[c] ?? 12;
    const cell = cells[c] ?? "";

    // Cell border
    doc.setDrawColor(...B_HBORD);
    doc.setLineWidth(0.2);
    doc.rect(x, y, w, rowH, "S");

    // Typography
    doc.setFontSize(TBL_FONT);
    if (isHdr) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...B_WHITE);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...B_DGRAY);
    }

    const avail = w - TBL_PAD * 2;

    // Center short codes (RASI / L1 / v0 etc.) in non-first columns
    if (!isHdr && c > 0 && cell.length <= 4) {
      const midY = y + rowH / 2 + 1.5;
      doc.text(cell, x + w / 2, midY, { align: "center" });
    } else {
      const wrapped = doc.splitTextToSize(cell, Math.max(avail, 5));
      let ty = y + TBL_PAD + 2.5;
      for (const wl of wrapped) {
        if (ty < y + rowH - 0.5) {
          doc.text(wl, x + TBL_PAD, ty);
          ty += TBL_LINE_H;
        }
      }
    }

    x += w;
  }

  return y + rowH;
}

// ── Note-box renderer ─────────────────────────────────────────────────────────
/**
 * Render a [note in brackets] as a shaded info box.
 */
function drawNoteBox(
  doc: jsPDF,
  text: string,
  y: number,
  sopNum: string,
  sopTitle: string,
): number {
  const boxW = CW;
  doc.setFontSize(7.5);
  const wrapped = doc.splitTextToSize(text, boxW - 8);
  const boxH = Math.max(8, wrapped.length * 4 + 5);

  if (y + boxH > 276) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }

  doc.setFillColor(255, 251, 230); // light amber
  doc.setDrawColor(180, 150, 60);
  doc.setLineWidth(0.3);
  doc.rect(ML, y, boxW, boxH, "FD");
  // Left accent line
  doc.setFillColor(180, 150, 60);
  doc.rect(ML, y, 2, boxH, "F");

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 70, 10);
  let ty = y + 4.5;
  for (const wl of wrapped) {
    if (ty < y + boxH - 1) { doc.text(wl, ML + 5, ty); ty += 4; }
  }

  return y + boxH + 2;
}

// ── Sub-heading renderer ──────────────────────────────────────────────────────
function drawSubHdr(doc: jsPDF, text: string, y: number): number {
  // Full-width shaded sub-section bar
  const barH = 6;
  doc.setFillColor(225, 232, 248);
  doc.setDrawColor(...B_LBORD);
  doc.setLineWidth(0.2);
  doc.rect(ML, y, CW, barH, "FD");
  // Blue left accent
  doc.setFillColor(...B_BLUE);
  doc.rect(ML, y, 2.5, barH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...B_BLUE);
  doc.text(text, ML + 5, y + barH - 1.5);
  return y + barH + 2;
}

// ── Content renderer ──────────────────────────────────────────────────────────
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
    const line    = lines[i];
    const trimmed = line.trimEnd();
    const t       = trimmed.trim();

    // ── Empty line ──────────────────────────────────────────────────────────
    if (!t) { y += 2; i++; continue; }

    // ── Table block ─────────────────────────────────────────────────────────
    const tableResult = detectTable(lines, i);
    if (tableResult) {
      const [tableRows, nextIdx] = tableResult;
      y += 1;
      if (y > 265) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
      y = drawTable(doc, tableRows, y, sopNum, sopTitle);
      i = nextIdx;
      continue;
    }

    // ── [Note in brackets] ──────────────────────────────────────────────────
    if (/^\[.{5,}[^\]]*\]?\s*$/.test(t) && t.length > 10) {
      // Remove outer brackets if present
      const noteText = t.replace(/^\[|\]$/g, "").trim();
      y = drawNoteBox(doc, noteText, y, sopNum, sopTitle);
      i++;
      continue;
    }

    // ── DRAFT / review line ─────────────────────────────────────────────────
    if (t.startsWith("---") || t.startsWith("— DRAFT")) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(...B_MGRAY);
      if (y > 276) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
      doc.text(t, ML + 2, y);
      y += 4;
      i++;
      continue;
    }

    // ── ALL-CAPS sub-heading (e.g. "SYSTEM PRECONDITIONS:") ─────────────────
    const isAllCapsHdr =
      /^[A-Z][A-Z0-9 ,&/()\-–—]{3,}:?\s*$/.test(t) &&
      t.length <= 90 &&
      !t.includes("|");

    if (isAllCapsHdr) {
      if (y > 272) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
      y = drawSubHdr(doc, t, y);
      i++;
      continue;
    }

    // ── Mixed-case heading ending with colon (e.g. "REVISION TRIGGERS (…):") ─
    const isMixedHdr =
      /^[A-Z][A-Za-z0-9 ,&/()\-–—]{3,}:\s*$/.test(t) &&
      t.length <= 80 &&
      !t.includes("|");

    if (isMixedHdr) {
      if (y > 272) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
      y = drawSubHdr(doc, t, y);
      i++;
      continue;
    }

    // ── Bullet / numbered list ────────────────────────────────────────────────
    const bulletMatch = t.match(/^([•\-\*]|\d{1,2}[\.\)]|[%][¡!])\s+/);
    if (bulletMatch) {
      const prefix  = bulletMatch[0];
      const rest    = t.slice(prefix.length);
      const indent  = ML + 5.5;
      const bW      = CW - 5.5 - 2;
      doc.setFontSize(BODY_FS);
      const wrapped = doc.splitTextToSize(rest, bW);
      for (let wi = 0; wi < wrapped.length; wi++) {
        if (y > 276) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
        if (wi === 0) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...B_BLUE);
          const sym = /^\d/.test(prefix) ? prefix.trim() : "•";
          doc.text(sym, ML + 1.5, y);
        }
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...B_DGRAY);
        doc.text(wrapped[wi], indent, y);
        y += BODY_LH;
      }
      i++;
      continue;
    }

    // ── Normal body text ──────────────────────────────────────────────────────
    const wrapped = doc.splitTextToSize(t, CW - 4);
    for (const wl of wrapped) {
      if (y > 276) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(BODY_FS);
      doc.setTextColor(...B_DGRAY);
      doc.text(wl, ML + 2, y);
      y += BODY_LH;
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
  let y = 19;

  // Hero block
  doc.setFillColor(244, 247, 255);
  doc.setDrawColor(...B_BLUE);
  doc.setLineWidth(0.6);
  doc.rect(ML, y, CW, 26, "FD");
  doc.setFillColor(...B_BLUE);
  doc.rect(ML, y, 3, 26, "F"); // left accent bar

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...B_MGRAY);
  doc.text("STANDARD OPERATING PROCEDURE", ML + 7, y + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...B_BLUE);
  const titleWrapped = doc.splitTextToSize(sopTitle, CW - 12);
  doc.text(titleWrapped, ML + 7, y + 13);
  y += 28;

  // Metadata table
  y = kvRow(doc, y, false, "SOP Number",   sop.sopNumber ?? "—",                    "Type",           (sop.sopType ?? "—").replace(/_/g, " "));
  y = kvRow(doc, y, true,  "Department",   sop.department ?? "—",                   "Applicable To",  sop.applicableRole ?? "—");
  y = kvRow(doc, y, false, "Process Area", sop.processArea ?? "—",                  "Status",         (sop.status ?? "—").replace(/_/g, " ").toUpperCase());
  y = kvRow(doc, y, true,  "Revision",     `v${sop.revisionNumber ?? 0}`,           "Sections",       String(sorted.length));
  y = kvRow(doc, y, false, "Owner",        sop.ownerName ?? "—",                    "Effective Date", sop.effectiveDate ? sop.effectiveDate.slice(0, 10) : "—");
  y += 5;

  // Description
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
    if (y > 242) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
    y = sectionBar(doc, y, "TABLE OF CONTENTS");
    for (let i = 0; i < sorted.length; i++) {
      if (y > 276) { doc.addPage(); hdr(doc, sopNum, sopTitle); y = 20; }
      const s   = sorted[i];
      const rH  = 5.5;
      // alternating rows
      doc.setFillColor(...(i % 2 === 0 ? B_LGRAY : B_WHITE));
      doc.rect(ML, y, CW, rH, "F");
      doc.setDrawColor(...B_LBORD);
      doc.setLineWidth(0.15);
      doc.rect(ML, y, CW, rH, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...B_BLUE);
      doc.text(s.sectionNo ?? "", ML + 2, y + rH - 1.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...B_DGRAY);
      doc.text(s.sectionTitle ?? "", ML + 22, y + rH - 1.5);
      y += rH;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CONTENT PAGES
  // ══════════════════════════════════════════════════════════════
  for (const section of sorted) {
    doc.addPage();
    hdr(doc, sopNum, sopTitle);
    y = 20;
    y = sectionBar(doc, y, `${section.sectionNo ?? ""}   ${section.sectionTitle ?? ""}`);
    const raw: string = section.sectionContent ?? "(No content provided.)";
    y = renderContent(doc, raw, y, sopNum, sopTitle);
  }

  // ══════════════════════════════════════════════════════════════
  // Footers
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
