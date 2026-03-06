import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

interface OfferPdfData {
  offerNumber: string;
  revision: number;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string;
  contactPerson: string;
  subject: string;
  currency: string;
  subtotal: string;
  discountPercent: string;
  discountAmount: string;
  taxPercent: string;
  taxAmount: string;
  totalAmount: string;
  validUntil: string;
  paymentTerms: string;
  deliveryTerms: string;
  notes: string;
  termsAndConditions: string;
  items: Array<{
    description: string;
    productCode: string;
    unit: string;
    quantity: string;
    unitPrice: string;
    discountPercent: string;
    totalPrice: string;
    hsnSacCode: string;
    isSubItem: boolean;
  }>;
}

export class OfferPdfGenerator {
  private doc: PDFKit.PDFDocument;
  private pageWidth: number = 595.28;
  private pageHeight: number = 841.89;
  private margin: number = 50;
  private contentWidth: number;
  private currentY: number = 0;
  private data: OfferPdfData;

  constructor(data: OfferPdfData) {
    this.data = data;
    this.contentWidth = this.pageWidth - 2 * this.margin;
    this.doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: `Offer ${data.offerNumber}`,
        Author: 'THERMOPAC',
        Subject: data.subject,
      },
    });
  }

  private formatNumber(val: string | number): string {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private checkPageBreak(requiredSpace: number = 100): void {
    if (this.currentY + requiredSpace > this.pageHeight - this.margin - 40) {
      this.doc.addPage();
      this.currentY = this.margin;
    }
  }

  private drawLine(y: number, color: string = '#003366'): void {
    this.doc
      .strokeColor(color)
      .lineWidth(1)
      .moveTo(this.margin, y)
      .lineTo(this.pageWidth - this.margin, y)
      .stroke();
  }

  private drawHeader(): void {
    this.currentY = this.margin;

    const logoPath = path.join(process.cwd(), 'client', 'public', 'assets', 'thermopac-logo.jpg');
    try {
      if (fs.existsSync(logoPath)) {
        const logoWidth = 160;
        const logoHeight = 45;
        const logoX = this.pageWidth - this.margin - logoWidth;
        this.doc.image(logoPath, logoX, this.margin, { width: logoWidth, fit: [logoWidth, logoHeight] });
      }
    } catch (e) {
    }

    this.currentY = this.margin + 50;
    this.drawLine(this.currentY, '#003366');
    this.currentY += 2;
    this.drawLine(this.currentY, '#003366');
    this.currentY += 15;
  }

  private drawOfferInfo(): void {
    const col1X = this.margin;
    const col2X = this.pageWidth - this.margin - 180;

    this.doc
      .fillColor('#003366')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('QUOTATION', col1X, this.currentY);

    this.doc
      .fillColor('#333333')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Quotation No:', col2X, this.currentY);
    this.doc
      .font('Helvetica')
      .text(this.data.offerNumber + (this.data.revision > 0 ? ` Rev.${this.data.revision}` : ''), col2X + 80, this.currentY);

    this.currentY += 14;

    this.doc
      .font('Helvetica-Bold')
      .text('Date:', col2X, this.currentY);
    this.doc
      .font('Helvetica')
      .text(this.formatDate(this.data.createdAt), col2X + 80, this.currentY);

    this.currentY += 14;

    this.doc
      .font('Helvetica-Bold')
      .text('Valid Until:', col2X, this.currentY);
    this.doc
      .font('Helvetica')
      .text(this.formatDate(this.data.validUntil), col2X + 80, this.currentY);

    this.currentY += 25;
  }

  private drawCustomerInfo(): void {
    this.doc
      .fillColor('#003366')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('TO:', this.margin, this.currentY);

    this.currentY += 15;

    this.doc
      .fillColor('#333333')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(this.data.customerName, this.margin, this.currentY);

    this.currentY += 14;

    if (this.data.contactPerson) {
      this.doc
        .fontSize(9)
        .font('Helvetica')
        .text(`Attn: ${this.data.contactPerson}`, this.margin, this.currentY);
      this.currentY += 12;
    }

    if (this.data.customerAddress) {
      const addressLines = this.data.customerAddress.split('\n');
      for (const line of addressLines) {
        this.doc
          .fontSize(9)
          .font('Helvetica')
          .text(line.trim(), this.margin, this.currentY, { width: this.contentWidth * 0.6 });
        this.currentY += 12;
      }
    }

    if (this.data.customerEmail) {
      this.doc
        .fontSize(9)
        .font('Helvetica')
        .text(`Email: ${this.data.customerEmail}`, this.margin, this.currentY);
      this.currentY += 12;
    }

    this.currentY += 10;
  }

  private drawSubject(): void {
    this.doc
      .fillColor('#003366')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Sub.:', this.margin, this.currentY);

    this.currentY += 14;

    this.doc
      .fillColor('#333333')
      .fontSize(10)
      .font('Helvetica')
      .text(this.data.subject, this.margin, this.currentY, { width: this.contentWidth });

    this.currentY += 20;

    this.drawLine(this.currentY, '#CCCCCC');
    this.currentY += 15;
  }

  private drawDearLine(): void {
    const salutation = this.data.contactPerson
      ? `Dear ${this.data.contactPerson},`
      : 'Dear Sir/Madam,';

    this.doc
      .fillColor('#333333')
      .fontSize(10)
      .font('Helvetica')
      .text(salutation, this.margin, this.currentY);

    this.currentY += 16;

    const introText = `We are pleased to submit our offer for design, manufacturing, supply and commissioning offer.

Thermopac is building the Re-refining plants and equipment's Since 1986, Thermopac has developed in-house technology for lower Capex and higher yields. We have the state of the art Manufacturing facility located at Rabale near Navi Mumbai. We manufacture all key equipment's like evaporator, distillation columns, etc. and forward integration for grease, lubricants, etc.

We have constructed more than 35 Re-refining plants in 5 different Continents. in the last 14 years. All these Re-refinery plants manufacture environment-friendly re-refined plant lube oil.

We build refineries with modular construction with a room to enhance the capacity. We take pride to mention that Thermopac is the only company that is building true turnkey re-refinery plants all over the world.

Moreover, Thermopac expertise extends beyond the construction of re-refinery plants. The company offers a range of services, including technical support, training, and ongoing maintenance. This holistic approach ensures that clients can operate their plants efficiently and effectively, maximizing their investment and achieving long-term success. Thermopac dedication to customer satisfaction is evident in their commitment to providing top-notch service and support throughout the entire lifecycle of the plant.`;

    this.doc
      .fontSize(9)
      .text(
        introText,
        this.margin,
        this.currentY,
        { width: this.contentWidth, lineGap: 3 }
      );

    this.currentY = this.doc.y + 30;

    this.doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('For THERMOPAC', this.margin, this.currentY);
    this.currentY = this.doc.y + 2;

    this.doc
      .fontSize(9)
      .font('Helvetica')
      .text('(Turnkey Engineering Solution Division)', this.margin, this.currentY);
    this.currentY = this.doc.y + 20;

    this.doc
      .moveTo(this.margin, this.currentY)
      .lineTo(this.margin + 200, this.currentY)
      .strokeColor('#333333')
      .lineWidth(0.8)
      .stroke();
    this.currentY += 6;

    this.doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Marketing Manager', this.margin, this.currentY);
    this.doc.font('Helvetica');

    this.currentY = this.doc.y + 10;
  }

  private drawItemsTable(): void {
    this.checkPageBreak(200);

    this.doc
      .fillColor('#003366')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('PRICE SCHEDULE', this.margin, this.currentY);

    this.currentY += 20;

    const colWidths = {
      sl: 25,
      description: 250,
      price: 80,
      qty: 50,
      amount: 90,
    };

    const headerY = this.currentY;
    this.doc
      .rect(this.margin, headerY, this.contentWidth, 22)
      .fill('#003366');

    let colX = this.margin;
    const headers = [
      { label: 'SL.', width: colWidths.sl },
      { label: 'ITEM DESCRIPTION', width: colWidths.description },
      { label: 'PRICE', width: colWidths.price },
      { label: 'QTY', width: colWidths.qty },
      { label: `AMOUNT ${this.data.currency}`, width: colWidths.amount },
    ];

    for (const h of headers) {
      this.doc
        .fillColor('#FFFFFF')
        .fontSize(7)
        .font('Helvetica-Bold')
        .text(h.label, colX + 4, headerY + 6, { width: h.width - 8, align: h.label === 'ITEM DESCRIPTION' ? 'left' : 'center' });
      colX += h.width;
    }

    this.currentY = headerY + 22;

    let slNo = 0;
    let rowIndex = 0;

    for (const item of this.data.items) {
      if (!item.isSubItem) slNo++;
      rowIndex++;
      this.checkPageBreak(40);

      const isSubItem = item.isSubItem;
      const descIndent = isSubItem ? 12 : 0;
      const descWidth = colWidths.description - 8 - descIndent;
      const descHeight = this.doc.heightOfString(item.description, { width: descWidth, fontSize: isSubItem ? 7 : 8 });
      const rowHeight = Math.max(isSubItem ? 22 : 30, descHeight + 12);

      if (isSubItem) {
        this.doc
          .rect(this.margin, this.currentY, this.contentWidth, rowHeight)
          .fill('#FAFAFA');
      } else if (rowIndex % 2 === 0) {
        this.doc
          .rect(this.margin, this.currentY, this.contentWidth, rowHeight)
          .fill('#F5F8FC');
      }

      this.doc
        .strokeColor('#E0E0E0')
        .lineWidth(0.5)
        .rect(this.margin, this.currentY, this.contentWidth, rowHeight)
        .stroke();

      colX = this.margin;

      if (!isSubItem) {
        this.doc
          .fillColor('#333333')
          .fontSize(8)
          .font('Helvetica')
          .text(String(slNo), colX + 4, this.currentY + 8, { width: colWidths.sl - 8, align: 'center' });
      }
      colX += colWidths.sl;

      this.doc
        .font(isSubItem ? 'Helvetica' : 'Helvetica-Bold')
        .fontSize(isSubItem ? 7 : 8)
        .fillColor(isSubItem ? '#666666' : '#333333')
        .text((isSubItem ? '↳ ' : '') + item.description, colX + 4 + descIndent, this.currentY + 6, { width: descWidth });
      if (item.productCode) {
        this.doc
          .font('Helvetica')
          .fontSize(6.5)
          .fillColor('#888888')
          .text(`Code: ${item.productCode}`, colX + 4 + descIndent, this.currentY + 6 + descHeight + 1, { width: descWidth });
      }
      colX += colWidths.description;

      this.doc
        .fillColor(isSubItem ? '#666666' : '#333333')
        .font('Helvetica')
        .fontSize(isSubItem ? 7 : 8)
        .text(this.formatNumber(item.unitPrice), colX + 4, this.currentY + 8, { width: colWidths.price - 8, align: 'right' });
      colX += colWidths.price;

      this.doc
        .text(`${parseFloat(item.quantity)} ${item.unit}`, colX + 4, this.currentY + 8, { width: colWidths.qty - 8, align: 'center' });
      colX += colWidths.qty;

      this.doc
        .font(isSubItem ? 'Helvetica' : 'Helvetica-Bold')
        .text(this.formatNumber(item.totalPrice), colX + 4, this.currentY + 8, { width: colWidths.amount - 8, align: 'right' });

      this.currentY += rowHeight;
    }

    this.currentY += 5;
  }

  private drawTotals(): void {
    this.checkPageBreak(120);

    const totalsX = this.pageWidth - this.margin - 250;
    const labelX = totalsX;
    const valueX = totalsX + 150;
    const totalWidth = 250;

    this.doc
      .rect(totalsX, this.currentY, totalWidth, 2)
      .fill('#003366');

    this.currentY += 8;

    const taxPct = parseFloat(this.data.taxPercent || '0');
    if (taxPct > 0) {
      this.doc
        .fillColor('#333333')
        .fontSize(9)
        .font('Helvetica')
        .text(`Tax (${taxPct}%):`, labelX, this.currentY, { width: 140, align: 'right' });
      this.doc
        .font('Helvetica')
        .text(`+${this.data.currency} ${this.formatNumber(this.data.taxAmount)}`, valueX, this.currentY, { width: 100, align: 'right' });
      this.currentY += 16;
    }

    this.doc
      .fillColor('#333333')
      .fontSize(9)
      .font('Helvetica')
      .text('Subtotal:', labelX, this.currentY, { width: 140, align: 'right' });
    this.doc
      .font('Helvetica-Bold')
      .text(`${this.data.currency} ${this.formatNumber(this.data.subtotal)}`, valueX, this.currentY, { width: 100, align: 'right' });

    this.currentY += 16;

    const discPct = parseFloat(this.data.discountPercent || '0');
    if (discPct > 0) {
      this.doc
        .font('Helvetica')
        .text(`Discount (${discPct}%):`, labelX, this.currentY, { width: 140, align: 'right' });
      this.doc
        .fillColor('#CC0000')
        .font('Helvetica')
        .text(`-${this.data.currency} ${this.formatNumber(this.data.discountAmount)}`, valueX, this.currentY, { width: 100, align: 'right' });
      this.currentY += 16;
    }

    this.drawLine(this.currentY, '#003366');
    this.currentY += 8;

    this.doc
      .rect(totalsX, this.currentY - 4, totalWidth, 22)
      .fill('#003366');

    this.doc
      .fillColor('#FFFFFF')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('TOTAL:', labelX + 5, this.currentY, { width: 135, align: 'right' });
    this.doc
      .text(`${this.data.currency} ${this.formatNumber(this.data.totalAmount)}`, valueX, this.currentY, { width: 100, align: 'right' });

    this.currentY += 20;
  }

  private drawTerms(): void {
    this.checkPageBreak(60);

    if (this.data.paymentTerms) {
      this.doc
        .fillColor('#003366')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('TERMS OF PAYMENT:', this.margin, this.currentY);
      this.currentY += 14;

      this.doc
        .fillColor('#333333')
        .fontSize(9)
        .font('Helvetica')
        .text(this.data.paymentTerms, this.margin, this.currentY, { width: this.contentWidth });
      this.currentY += 20;
    }

    if (this.data.deliveryTerms) {
      this.checkPageBreak(60);
      this.doc
        .fillColor('#003366')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('DELIVERY TERMS:', this.margin, this.currentY);
      this.currentY += 14;

      this.doc
        .fillColor('#333333')
        .fontSize(9)
        .font('Helvetica')
        .text(this.data.deliveryTerms, this.margin, this.currentY, { width: this.contentWidth });
      this.currentY += 20;
    }

    this.checkPageBreak(60);
    this.doc
      .fillColor('#003366')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('VALIDITY OF THE OFFER:', this.margin, this.currentY);
    this.currentY += 14;

    this.doc
      .fillColor('#333333')
      .fontSize(9)
      .font('Helvetica')
      .text(
        `This offer is valid until ${this.formatDate(this.data.validUntil)}. Thereafter, the validity is subject to our written confirmation.`,
        this.margin,
        this.currentY,
        { width: this.contentWidth }
      );
    this.currentY += 20;

    if (this.data.notes) {
      this.checkPageBreak(60);
      this.doc
        .fillColor('#003366')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('REMARKS:', this.margin, this.currentY);
      this.currentY += 14;

      this.doc
        .fillColor('#333333')
        .fontSize(9)
        .font('Helvetica')
        .text(this.data.notes, this.margin, this.currentY, { width: this.contentWidth });
      this.currentY += 20;
    }

    if (this.data.termsAndConditions) {
      this.checkPageBreak(80);
      this.doc
        .fillColor('#003366')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('TERMS AND CONDITIONS:', this.margin, this.currentY);
      this.currentY += 14;

      this.doc
        .fillColor('#333333')
        .fontSize(9)
        .font('Helvetica')
        .text(this.data.termsAndConditions, this.margin, this.currentY, { width: this.contentWidth });
      this.currentY += 20;
    }
  }

  private drawSignature(): void {
    this.checkPageBreak(80);

    this.currentY += 10;

    this.drawLine(this.currentY, '#CCCCCC');
    this.currentY += 20;

    this.doc
      .fillColor('#333333')
      .fontSize(9)
      .font('Helvetica')
      .text('We look forward to receiving your valued order.', this.margin, this.currentY);

    this.currentY += 30;

    this.doc
      .fillColor('#003366')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('For THERMOPAC', this.margin, this.currentY);

    this.currentY += 12;
    this.doc
      .fontSize(9)
      .text('(Turnkey Engineering Solution Division)', this.margin, this.currentY);

    this.currentY += 40;

    this.doc
      .fillColor('#333333')
      .font('Helvetica')
      .fontSize(9)
      .text('_____________________________', this.margin, this.currentY);

    this.currentY += 14;
    this.doc
      .font('Helvetica-Bold')
      .text('Marketing Manager', this.margin, this.currentY);
  }

  private drawPageFooter(): void {
    const footerY = this.pageHeight - 35;
    this.doc
      .fillColor('#CCCCCC')
      .lineWidth(0.5)
      .moveTo(this.margin, footerY)
      .lineTo(this.pageWidth - this.margin, footerY)
      .stroke();

    const line1 = 'THERMOPAC | L 4, 405 The Summit Business Bay, Vile Parle (East), W E Highway, Mumbai India 400 057';
    const line2 = 'Tel: +91 22 2617 8080 to 84 | Fax: +91 22 2617 8084 | E-Mail: sales@thermopac.in';

    this.doc.fontSize(6.5).font('Helvetica').fillColor('#999999');
    const w1 = this.doc.widthOfString(line1);
    const w2 = this.doc.widthOfString(line2);
    const x1 = this.margin + (this.contentWidth - w1) / 2;
    const x2 = this.margin + (this.contentWidth - w2) / 2;

    const savedY = (this.doc as any).y;
    this.doc.text(line1, x1, footerY + 5, { lineBreak: false });
    this.doc.text(line2, x2, footerY + 14, { lineBreak: false });
    (this.doc as any).y = savedY;
  }

  private generatePartBuffer(drawFns: (() => void)[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const partDoc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });
      const origDoc = this.doc;
      this.doc = partDoc;
      this.currentY = 0;

      const chunks: Buffer[] = [];
      partDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      partDoc.on('end', () => {
        this.doc = origDoc;
        resolve(Buffer.concat(chunks));
      });
      partDoc.on('error', (err) => {
        this.doc = origDoc;
        reject(err);
      });

      drawFns.forEach(fn => fn.call(this));

      partDoc.end();
    });
  }

  public generate(res: Response): void {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${this.data.offerNumber.replace(/\//g, '-')}_Quotation.pdf"`
    );

    this.doc.pipe(res);

    this.drawHeader();
    this.drawOfferInfo();
    this.drawCustomerInfo();
    this.drawSubject();
    this.drawDearLine();
    this.drawItemsTable();
    this.drawTotals();
    this.drawTerms();
    this.drawSignature();

    const range = this.doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      this.doc.switchToPage(i);
      this.drawPageFooter();
    }
    this.doc.flushPages();
    this.doc.end();
  }

  public async generateWithTemplate(res: Response, templatePdfPath: string): Promise<void> {
    try {
      const templateBytes = fs.readFileSync(templatePdfPath);
      const templateDoc = await PDFLibDocument.load(templateBytes);
      const mergedPdf = await PDFLibDocument.create();

      const part1Bytes = await this.generatePartBuffer([
        this.drawHeader, this.drawOfferInfo, this.drawCustomerInfo,
        this.drawSubject, this.drawDearLine,
      ]);
      const part2Bytes = await this.generatePartBuffer([
        this.drawHeader, this.drawItemsTable, this.drawTotals,
        this.drawTerms, this.drawSignature,
      ]);

      const part1Doc = await PDFLibDocument.load(part1Bytes);
      const part2Doc = await PDFLibDocument.load(part2Bytes);

      const p1Pages = await mergedPdf.copyPages(part1Doc, part1Doc.getPageIndices());
      p1Pages.forEach((page) => mergedPdf.addPage(page));

      const tplPages = await mergedPdf.copyPages(templateDoc, templateDoc.getPageIndices());
      tplPages.forEach((page) => mergedPdf.addPage(page));

      const p2Pages = await mergedPdf.copyPages(part2Doc, part2Doc.getPageIndices());
      p2Pages.forEach((page) => mergedPdf.addPage(page));

      const mergedBytes = await mergedPdf.save();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${this.data.offerNumber.replace(/\//g, '-')}_Quotation.pdf"`
      );
      res.end(Buffer.from(mergedBytes));
    } catch (error) {
      console.error('Error merging PDFs:', error);
      this.generate(res);
    }
  }
}
