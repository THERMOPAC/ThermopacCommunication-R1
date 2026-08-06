/**
 * Common engineering-report framework — Stage 13 reporting architecture.
 *
 * Every design report (DBR, PDR, HDR, …) renders through this framework so
 * that cover page, headers, footers, table of contents, registers, references,
 * revision history, approval block and traceability are identical across the
 * whole document set. Reports NEVER render from live data — they render from a
 * frozen payload persisted in design_reports.payload (snapshot architecture).
 *
 * Numbering: {DesignNumber}-{DOC} (e.g. LLX-RND-2026-0001-DBR); the report
 * revision always follows the Design Revision (Rev 0, Rev 1, …).
 */
// @ts-ignore — pdfkit ships no type declarations in this project (same pattern tolerated in offer-pdf-generator.ts)
import PDFDocument from 'pdfkit';

export interface ReportRow {
  label: string;
  value: string;
  unit?: string;
  sourceType?: string;   // Engineer Entry | Thermopac Rule (Auto-Populated) | Assumed | Laboratory/Vendor | Not Entered
  sourceRef?: string;    // exact citation — rendered verbatim, never paraphrased
}

export interface ReportSection {
  title: string;
  intro?: string;
  rows?: ReportRow[];
  /** free-form table: first array is the header row */
  table?: string[][];
  paragraphs?: string[];
}

export interface ReportPayload {
  docType: string;
  docTypeTitle: string;
  docNumber: string;
  reportRev: string;
  designNumber: string;
  designTitle: string;
  designType: string;
  module: string;
  revisionLabel: string;
  revisionLifecycle: string;
  client?: string;
  plantLocation?: string;
  preparedBy?: string; checkedBy?: string; approvedBy?: string;
  generatedAt: string;
  generatedByName?: string;
  traceability: { revisionId: number; runs: Array<{ engine: string; version: string; runId: number | null; ranAt?: string }>; note?: string };
  sections: ReportSection[];
  assumptions: Array<{ item: string; value: string; sourceRef: string; status: string }>;
  missingData: Array<{ item: string; reason: string; severity: 'error' | 'warning' }>;
  references: string[];
  revisionHistory: Array<{ rev: string; date: string; by: string; note: string }>;
  watermark?: string; // e.g. PRELIMINARY — NOT FOR CONSTRUCTION
}

const M = 50;              // page margin (pt)
const W = 595.28 - 2 * M;  // usable width A4
const GRAY = '#555555';
const LIGHT = '#999999';
const RULE = '#cccccc';
const BRAND = '#7f1d1d';

export function renderReportPdf(p: ReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 70, bottom: 60, left: M, right: M }, bufferPages: true, info: { Title: `${p.docNumber} ${p.reportRev}`, Author: 'Thermopac Engineering' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const toc: Array<{ num: string; title: string; page: number }> = [];
    let secNum = 0;

    // ── Cover page ────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 6).fill(BRAND);
    doc.fillColor('#000');
    doc.moveDown(6);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND).text('THERMOPAC ENGINEERING LIMITED', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('Design Software — Engineering Report', { align: 'center' });
    doc.moveDown(5);
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#000').text(p.docTypeTitle, { align: 'center' });
    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(12).fillColor(GRAY).text(p.designTitle || p.module, { align: 'center' });
    doc.moveDown(3);
    const cov = (l: string, v: string) => {
      doc.font('Helvetica').fontSize(10).fillColor(GRAY).text(l, M + 90, doc.y, { continued: true, width: W - 180 });
      doc.font('Helvetica-Bold').fillColor('#000').text(`   ${v || '—'}`);
      doc.moveDown(0.35);
    };
    cov('Document Number', p.docNumber);
    cov('Report Revision', p.reportRev);
    cov('Design Number', p.designNumber);
    cov('Design Revision', `${p.revisionLabel} (${p.revisionLifecycle})`);
    cov('Module', p.module);
    cov('Design Type', p.designType);
    if (p.client) cov('Client / Customer', p.client);
    if (p.plantLocation) cov('Plant Location', p.plantLocation);
    cov('Generated', p.generatedAt);
    doc.moveDown(3);
    // Approval block
    const abY = doc.y;
    const colW = W / 3;
    (['Prepared By', 'Checked By', 'Approved By'] as const).forEach((t, i) => {
      const x = M + i * colW;
      doc.rect(x, abY, colW, 64).stroke(RULE);
      doc.font('Helvetica').fontSize(8).fillColor(LIGHT).text(t, x + 6, abY + 5);
      const name = [p.preparedBy, p.checkedBy, p.approvedBy][i] ?? '';
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text(name || ' ', x + 6, abY + 20, { width: colW - 12 });
      doc.font('Helvetica').fontSize(7).fillColor(LIGHT).text('Signature / Date', x + 6, abY + 52);
    });
    doc.x = M;

    // ── Traceability verso ───────────────────────────────────────────────────
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text('Traceability & Generation Record');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor(GRAY);
    doc.text(`This document was generated from a frozen report payload linked to Design Revision ${p.revisionLabel} (internal id ${p.traceability.revisionId}) of design ${p.designNumber}. It does not render live database values; regeneration from the same payload reproduces this document exactly.`);
    doc.moveDown(0.5);
    if (p.traceability.runs.length) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text('Calculation runs consumed:');
      p.traceability.runs.forEach(r => doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(`•  ${r.engine} ${r.version}${r.runId ? ` — run #${r.runId}` : ''}${r.ranAt ? ` (${r.ranAt})` : ''}`));
    } else {
      doc.text('Calculation runs consumed: none — this report renders design-basis inputs only.');
    }
    if (p.traceability.note) { doc.moveDown(0.4); doc.text(p.traceability.note); }
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text(`Generated ${p.generatedAt}${p.generatedByName ? ` by ${p.generatedByName}` : ''}.`);

    // TOC placeholder page — filled after body is laid out
    doc.addPage();
    const tocPageIndex = doc.bufferedPageRange().count - 1;
    doc.addPage(); // body starts on its own page — the TOC page is filled in later

    // ── Helpers ──────────────────────────────────────────────────────────────
    const ensure = (h: number) => { if (doc.y + h > doc.page.height - 70) doc.addPage(); };
    const heading = (title: string) => {
      secNum += 1;
      ensure(40);
      toc.push({ num: String(secNum), title, page: doc.bufferedPageRange().count });
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND).text(`${secNum}.  ${title}`, M, doc.y);
      doc.moveTo(M, doc.y + 2).lineTo(M + W, doc.y + 2).stroke(RULE);
      doc.moveDown(0.5);
      doc.fillColor('#000');
    };
    const drawTable = (header: string[], rows: string[][], widths?: number[]) => {
      const ws = widths ?? header.map(() => W / header.length);
      const rowH = (cells: string[], font: string, size: number) => Math.max(...cells.map((c, i) => doc.font(font).fontSize(size).heightOfString(c || ' ', { width: ws[i] - 8 }))) + 6;
      const drawRow = (cells: string[], y: number, bold = false, fill?: string) => {
        const h = rowH(cells, bold ? 'Helvetica-Bold' : 'Helvetica', bold ? 8 : 8);
        if (fill) doc.rect(M, y, W, h).fill(fill);
        let x = M;
        cells.forEach((c, i) => {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(bold ? '#000' : '#222').text(c || '—', x + 4, y + 3, { width: ws[i] - 8 });
          x += ws[i];
        });
        doc.moveTo(M, y + h).lineTo(M + W, y + h).stroke('#e5e5e5');
        return h;
      };
      ensure(rowH(header, 'Helvetica-Bold', 8) + 20);
      let y = doc.y;
      y += drawRow(header, y, true, '#f3f4f6');
      for (const r of rows) {
        const h = rowH(r, 'Helvetica', 8);
        if (y + h > doc.page.height - 70) { doc.addPage(); y = doc.y; y += drawRow(header, y, true, '#f3f4f6'); }
        y += drawRow(r, y);
      }
      doc.y = y + 6; doc.x = M;
    };

    // ── Body sections ────────────────────────────────────────────────────────
    for (const s of p.sections) {
      heading(s.title);
      if (s.intro) { doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(s.intro, M, doc.y, { width: W }); doc.moveDown(0.4); }
      for (const para of s.paragraphs ?? []) { doc.font('Helvetica').fontSize(9.5).fillColor('#111').text(para, M, doc.y, { width: W, align: 'justify' }); doc.moveDown(0.4); }
      if (s.rows?.length) {
        drawTable(
          ['Item', 'Value', 'Unit', 'Source Type', 'Source Reference'],
          s.rows.map(r => [r.label, r.value || 'NOT ENTERED', r.unit ?? '', r.sourceType ?? '', r.sourceRef ?? '']),
          [W * 0.24, W * 0.16, W * 0.09, W * 0.17, W * 0.34],
        );
      }
      if (s.table?.length) drawTable(s.table[0], s.table.slice(1));
    }

    // ── Assumptions Register ─────────────────────────────────────────────────
    heading('Assumptions Register');
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('Every value below carries source type Assumed or a Thermopac screening default and is Pending Validation. This register is extracted mechanically from the tagged source data — it cannot be edited in the report layer.', M, doc.y, { width: W });
    doc.moveDown(0.4);
    if (p.assumptions.length) {
      drawTable(['Item', 'Value', 'Source Reference', 'Validation Status'],
        p.assumptions.map(a => [a.item, a.value, a.sourceRef, a.status]),
        [W * 0.26, W * 0.14, W * 0.4, W * 0.2]);
    } else {
      doc.font('Helvetica').fontSize(9).fillColor('#111').text('No assumed values in the sections covered by this report.');
    }

    // ── Validation & Missing-Data Summary ────────────────────────────────────
    heading('Validation & Missing-Data Summary');
    if (p.missingData.length) {
      drawTable(['Severity', 'Item', 'Reason'],
        p.missingData.map(m2 => [m2.severity.toUpperCase(), m2.item, m2.reason]),
        [W * 0.12, W * 0.3, W * 0.58]);
    } else {
      doc.font('Helvetica').fontSize(9).fillColor('#111').text('No missing mandatory data. All mandatory basis values are entered or rule-populated.');
    }

    // ── References ───────────────────────────────────────────────────────────
    heading('References');
    p.references.forEach((r, i) => { ensure(14); doc.font('Helvetica').fontSize(9).fillColor('#111').text(`[${i + 1}]  ${r}`, M, doc.y, { width: W }); });
    if (!p.references.length) doc.font('Helvetica').fontSize(9).text('—');

    // ── Revision History ─────────────────────────────────────────────────────
    heading('Revision History');
    drawTable(['Report Rev', 'Date', 'Generated By', 'Description'],
      p.revisionHistory.map(h => [h.rev, h.date, h.by, h.note]),
      [W * 0.14, W * 0.16, W * 0.2, W * 0.5]);

    // ── Fill Table of Contents ───────────────────────────────────────────────
    doc.switchToPage(tocPageIndex);
    doc.y = 80; doc.x = M;
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text('Table of Contents', M, 80);
    doc.moveDown(0.8);
    for (const t of toc) {
      // Overflow guard: the TOC has exactly one reserved page. Letting pdfkit
      // auto-add a page here would shift every page number computed above.
      if (doc.y > doc.page.height - 90) {
        doc.font('Helvetica').fontSize(9).fillColor(LIGHT).text('… (continued — see section headings)', M, doc.y);
        break;
      }
      doc.font('Helvetica').fontSize(10).fillColor('#111');
      doc.text(`${t.num}.  ${t.title}`, M, doc.y, { continued: true, width: W - 40, lineBreak: false });
      doc.font('Helvetica').fillColor(LIGHT).text(`  ${t.page}`, { align: 'right' });
      doc.moveDown(0.2);
    }

    // ── Headers / footers / watermark on every page ──────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      if (i > 0) {
        doc.font('Helvetica').fontSize(7.5).fillColor(LIGHT);
        doc.text(`${p.docNumber}  ·  ${p.reportRev}  ·  ${p.docTypeTitle}`, M, 30, { width: W * 0.7, lineBreak: false });
        doc.text(`Page ${i + 1} of ${range.count}`, M + W * 0.7, 30, { width: W * 0.3, align: 'right', lineBreak: false });
        doc.moveTo(M, 42).lineTo(M + W, 42).stroke(RULE);
      }
      doc.moveTo(M, doc.page.height - 48).lineTo(M + W, doc.page.height - 48).stroke(RULE);
      doc.font('Helvetica').fontSize(7).fillColor(LIGHT)
        .text(`Generated ${p.generatedAt} · Design Revision ${p.revisionLabel} · Frozen payload — regeneration reproduces this document`, M, doc.page.height - 42, { width: W, align: 'center', lineBreak: false });
      if (p.watermark) {
        doc.save();
        doc.rotate(-40, { origin: [doc.page.width / 2, doc.page.height / 2] });
        doc.font('Helvetica-Bold').fontSize(42).fillColor('#000').opacity(0.07)
          .text(p.watermark, 0, doc.page.height / 2 - 24, { width: doc.page.width, align: 'center', lineBreak: false });
        doc.opacity(1).restore();
      }
    }
    doc.end();
  });
}
