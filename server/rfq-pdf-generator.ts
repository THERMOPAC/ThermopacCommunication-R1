/**
 * RFQ PDF Generator — Baseline v1.0
 * Generates a professional Request for Quotation PDF using PDFKit.
 * Governance: docs/rfq-email-dispatch-baseline-v1.0.md §8
 */
import PDFDocument from 'pdfkit';

export interface RfqPdfLine {
  plcNumber: string;
  tagNo: string | null;
  itemCode: string | null;
  serviceDescription: string | null;
  qtyRequired: string | number;
  uom?: string | null;
  specificationNotes?: string | null;
}

export interface RfqPdfInput {
  rfqNumber: string;
  rfqDate: string | null;
  submissionDeadline: string | null;
  subject: string | null;
  notes: string | null;
  vendorName: string;
  vendorContactPerson: string | null;
  vendorAddress: string | null;
  vendorCity: string | null;
  vendorCountry: string | null;
  lines: RfqPdfLine[];
  projectCode: string;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

export async function generateRfqPdf(input: RfqPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: input.rfqNumber } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 100; // usable width
    const BRAND = '#1e3a5f';
    const RED = '#dc2626';
    const LIGHT_GREY = '#f1f5f9';
    const MID_GREY = '#64748b';

    // ── Header bar ─────────────────────────────────────────────────────────────
    doc.rect(50, 40, W, 52).fill(BRAND);
    doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
      .text('THERMOPAC', 60, 52, { continued: true });
    doc.fontSize(10).font('Helvetica').fillColor('#93c5fd')
      .text('  Engineering Private Limited', { continued: false });
    doc.fontSize(9).fillColor('#cbd5e1').text('Request for Quotation', 60, 72);

    // RFQ number top-right
    doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold')
      .text(input.rfqNumber, 50, 56, { align: 'right', width: W });

    doc.moveDown(2.5);

    // ── Meta block ─────────────────────────────────────────────────────────────
    const metaY = 105;
    doc.rect(50, metaY, W, 50).fill(LIGHT_GREY);

    const col1 = 60, col2 = 220, col3 = 380;
    const rowA = metaY + 8, rowB = metaY + 25;
    doc.fontSize(7).fillColor(MID_GREY).font('Helvetica').text('RFQ DATE', col1, rowA);
    doc.fontSize(8).fillColor('#0f172a').font('Helvetica-Bold').text(fmtDate(input.rfqDate), col1, rowB);

    doc.fontSize(7).fillColor(MID_GREY).font('Helvetica').text('SUBMISSION DEADLINE', col2, rowA);
    doc.fontSize(8).fillColor(RED).font('Helvetica-Bold').text(fmtDate(input.submissionDeadline), col2, rowB);

    doc.fontSize(7).fillColor(MID_GREY).font('Helvetica').text('PROJECT', col3, rowA);
    doc.fontSize(8).fillColor('#0f172a').font('Helvetica-Bold').text(input.projectCode, col3, rowB);

    // ── Vendor address ─────────────────────────────────────────────────────────
    const addrY = metaY + 65;
    doc.fontSize(7).fillColor(MID_GREY).font('Helvetica').text('TO:', 50, addrY);
    doc.fontSize(10).fillColor('#0f172a').font('Helvetica-Bold').text(input.vendorName, 50, addrY + 10);
    if (input.vendorContactPerson) {
      doc.fontSize(9).font('Helvetica').fillColor('#374151').text(`Attn: ${input.vendorContactPerson}`, 50, addrY + 23);
    }
    const addrParts = [input.vendorAddress, input.vendorCity, input.vendorCountry].filter(Boolean).join(', ');
    if (addrParts) {
      doc.fontSize(8).fillColor(MID_GREY).text(addrParts, 50, addrY + 36);
    }

    // Subject
    if (input.subject) {
      doc.rect(50, addrY + 55, W, 20).fill('#e0f2fe');
      doc.fontSize(9).fillColor('#0369a1').font('Helvetica-Bold')
        .text(`Sub: ${input.subject}`, 56, addrY + 61, { width: W - 12 });
    }

    // ── Body text ──────────────────────────────────────────────────────────────
    const bodyStart = addrY + 85;
    doc.fontSize(9).fillColor('#1e293b').font('Helvetica')
      .text(
        'Dear Sir / Madam,\n\nWe invite your best offer for the supply of the following items as per specifications below. ' +
        'Please quote unit price (ex-works), delivery period in weeks, validity of offer, and payment terms.',
        50, bodyStart, { width: W }
      );

    // ── Line items table ───────────────────────────────────────────────────────
    const tableY = doc.y + 16;
    const cols = { sno: 50, plc: 72, tag: 148, desc: 220, itemCode: 360, qty: 460, uom: 498 };
    const rowH = 18;

    // Header row
    doc.rect(50, tableY, W, rowH).fill(BRAND);
    doc.fontSize(7).fillColor('#ffffff').font('Helvetica-Bold');
    doc.text('#',       cols.sno,  tableY + 5, { width: 18 });
    doc.text('PLC No',  cols.plc,  tableY + 5, { width: 72 });
    doc.text('Tag No',  cols.tag,  tableY + 5, { width: 68 });
    doc.text('Description / Specification', cols.desc, tableY + 5, { width: 136 });
    doc.text('Item Code', cols.itemCode, tableY + 5, { width: 96 });
    doc.text('Qty',      cols.qty,  tableY + 5, { width: 34, align: 'right' });
    doc.text('UOM',      cols.uom,  tableY + 5, { width: 42 });

    let rowY = tableY + rowH;
    input.lines.forEach((line, i) => {
      const desc = [line.serviceDescription, line.specificationNotes].filter(Boolean).join(' | ') || '—';
      const descLines = Math.ceil(desc.length / 48);
      const cellH = Math.max(rowH, descLines * 11 + 7);

      if (rowY + cellH > doc.page.height - 80) {
        doc.addPage();
        rowY = 50;
      }

      if (i % 2 === 0) doc.rect(50, rowY, W, cellH).fill('#f8fafc');
      else doc.rect(50, rowY, W, cellH).fill('#ffffff');

      doc.fontSize(7).fillColor('#0f172a').font('Helvetica');
      doc.text(String(i + 1), cols.sno, rowY + 5, { width: 18 });
      doc.text(line.plcNumber, cols.plc, rowY + 5, { width: 72 });
      doc.text(line.tagNo || '—', cols.tag, rowY + 5, { width: 68 });
      doc.text(desc, cols.desc, rowY + 5, { width: 136 });
      doc.text(line.itemCode || '—', cols.itemCode, rowY + 5, { width: 96 });
      doc.text(String(line.qtyRequired), cols.qty, rowY + 5, { width: 34, align: 'right' });
      doc.text(line.uom || '—', cols.uom, rowY + 5, { width: 42 });

      // row border bottom
      doc.moveTo(50, rowY + cellH).lineTo(50 + W, rowY + cellH).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      rowY += cellH;
    });

    // ── Notes ──────────────────────────────────────────────────────────────────
    if (input.notes) {
      rowY += 14;
      if (rowY + 40 > doc.page.height - 80) { doc.addPage(); rowY = 50; }
      doc.fontSize(7).fillColor(MID_GREY).font('Helvetica-Bold').text('NOTES:', 50, rowY);
      doc.fontSize(8).fillColor('#374151').font('Helvetica').text(input.notes, 50, rowY + 10, { width: W });
      rowY = doc.y + 10;
    }

    // ── Terms & Conditions ─────────────────────────────────────────────────────
    const tcY = Math.max(rowY + 20, 40);
    if (tcY + 90 > doc.page.height - 60) doc.addPage();

    doc.rect(50, tcY, W, 15).fill(BRAND);
    doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold').text('TERMS & CONDITIONS', 56, tcY + 4);

    const tcText = [
      '1. Prices must be quoted in INR (exclusive of GST). GST to be stated separately.',
      '2. Delivery period to be confirmed from date of Purchase Order.',
      '3. Payment terms: 30 days from invoice date / as per PO terms.',
      '4. Material to comply with specifications, drawings, and standards referenced herein.',
      '5. THERMOPAC reserves the right to reject any or all offers without assigning reasons.',
      '6. Validity of offer: minimum 60 days from submission date.',
    ].join('\n');

    doc.fontSize(7.5).fillColor('#1e293b').font('Helvetica')
      .text(tcText, 50, tcY + 20, { width: W });

    // ── Signature block ────────────────────────────────────────────────────────
    const sigY = doc.y + 20;
    if (sigY + 50 > doc.page.height - 30) doc.addPage();
    doc.moveTo(50, sigY + 40).lineTo(200, sigY + 40).strokeColor('#94a3b8').lineWidth(0.5).stroke();
    doc.fontSize(7.5).fillColor(MID_GREY).text('Authorised Signatory — THERMOPAC Engineering Pvt Ltd', 50, sigY + 43);

    // ── Footer ─────────────────────────────────────────────────────────────────
    const footY = doc.page.height - 35;
    doc.rect(50, footY, W, 0.5).fill('#e2e8f0');
    doc.fontSize(6.5).fillColor('#94a3b8')
      .text(`Generated: ${new Date().toLocaleDateString('en-GB')} | ${input.rfqNumber} | THERMOPAC QMS`, 50, footY + 6, { align: 'center', width: W });

    doc.end();
  });
}
