import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import * as fs from 'fs';

interface OfferPdfData {
  offerNumber: string;
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
      this.drawPageFooter();
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

    this.doc
      .fillColor('#003366')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('THERMOPAC', this.margin, this.currentY, { width: this.contentWidth });

    this.currentY += 26;

    this.doc
      .fillColor('#666666')
      .fontSize(8)
      .font('Helvetica')
      .text('Turnkey Engineering Solution Division', this.margin, this.currentY);

    this.currentY += 12;

    this.doc
      .fontSize(7)
      .fillColor('#888888')
      .text('L 4, 405 The Summit Business Bay, Vile Parle (East), W E Highway, Mumbai India 400 057', this.margin, this.currentY);

    this.currentY += 10;
    this.doc.text('Tel: +91 22 2617 8080 to 84  |  Fax: +91 22 2617 8084  |  E-Mail: sales@thermopac.in', this.margin, this.currentY);

    this.currentY += 16;
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
      .text(this.data.offerNumber, col2X + 80, this.currentY);

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

    this.doc
      .fontSize(9)
      .text(
        'We are pleased to submit our offer for design, manufacturing, supply and commissioning as per your requirement. Please find the details below:',
        this.margin,
        this.currentY,
        { width: this.contentWidth }
      );

    this.currentY += 30;
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
      sl: 30,
      description: 230,
      price: 80,
      qty: 50,
      tax: 40,
      amount: 80,
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
      { label: 'TAX', width: colWidths.tax },
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
    const mainItems = this.data.items.filter(i => !i.isSubItem);

    for (const item of mainItems) {
      slNo++;
      this.checkPageBreak(40);

      const descHeight = this.doc.heightOfString(item.description, { width: colWidths.description - 8, fontSize: 8 });
      const rowHeight = Math.max(30, descHeight + 12);

      if (slNo % 2 === 0) {
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

      this.doc
        .fillColor('#333333')
        .fontSize(8)
        .font('Helvetica')
        .text(String(slNo), colX + 4, this.currentY + 8, { width: colWidths.sl - 8, align: 'center' });
      colX += colWidths.sl;

      this.doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(item.description, colX + 4, this.currentY + 6, { width: colWidths.description - 8 });
      if (item.productCode) {
        this.doc
          .font('Helvetica')
          .fontSize(6.5)
          .fillColor('#888888')
          .text(`Code: ${item.productCode}`, colX + 4, this.currentY + 6 + descHeight + 1, { width: colWidths.description - 8 });
      }
      colX += colWidths.description;

      this.doc
        .fillColor('#333333')
        .font('Helvetica')
        .fontSize(8)
        .text(this.formatNumber(item.unitPrice), colX + 4, this.currentY + 8, { width: colWidths.price - 8, align: 'right' });
      colX += colWidths.price;

      this.doc
        .text(`${parseFloat(item.quantity)} ${item.unit}`, colX + 4, this.currentY + 8, { width: colWidths.qty - 8, align: 'center' });
      colX += colWidths.qty;

      const discPct = parseFloat(item.discountPercent || '0');
      this.doc
        .text(discPct > 0 ? `${discPct}%` : '-', colX + 4, this.currentY + 8, { width: colWidths.tax - 8, align: 'center' });
      colX += colWidths.tax;

      this.doc
        .font('Helvetica-Bold')
        .text(this.formatNumber(item.totalPrice), colX + 4, this.currentY + 8, { width: colWidths.amount - 8, align: 'right' });

      this.currentY += rowHeight;

      const subItems = this.data.items.filter(si => si.isSubItem);
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

    const taxPct = parseFloat(this.data.taxPercent || '0');
    if (taxPct > 0) {
      this.doc
        .fillColor('#333333')
        .font('Helvetica')
        .text(`Tax (${taxPct}%):`, labelX, this.currentY, { width: 140, align: 'right' });
      this.doc
        .font('Helvetica')
        .text(`+${this.data.currency} ${this.formatNumber(this.data.taxAmount)}`, valueX, this.currentY, { width: 100, align: 'right' });
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

    this.currentY += 30;
  }

  private drawTerms(): void {
    this.checkPageBreak(200);

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
    this.checkPageBreak(120);

    this.currentY += 20;

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

    this.doc
      .fillColor('#999999')
      .fontSize(6.5)
      .font('Helvetica')
      .text(
        'THERMOPAC | L 4, 405 The Summit Business Bay, Vile Parle (East), W E Highway, Mumbai India 400 057',
        this.margin,
        footerY + 5,
        { width: this.contentWidth, align: 'center' }
      );

    this.doc
      .text(
        'Tel: +91 22 2617 8080 to 84 | Fax: +91 22 2617 8084 | E-Mail: sales@thermopac.in',
        this.margin,
        footerY + 14,
        { width: this.contentWidth, align: 'center' }
      );
  }

  private generateToBuffer(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      this.doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);

      this.drawHeader();
      this.drawOfferInfo();
      this.drawCustomerInfo();
      this.drawSubject();
      this.drawDearLine();
      this.drawItemsTable();
      this.drawTotals();
      this.drawTerms();
      this.drawSignature();
      this.drawPageFooter();

      this.doc.end();
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
    this.drawPageFooter();

    this.doc.end();
  }

  public async generateWithTemplate(res: Response, templatePdfPath: string, position: string = 'after'): Promise<void> {
    try {
      const offerPdfBytes = await this.generateToBuffer();

      const templateBytes = fs.readFileSync(templatePdfPath);

      const mergedPdf = await PDFLibDocument.create();

      const offerDoc = await PDFLibDocument.load(offerPdfBytes);
      const templateDoc = await PDFLibDocument.load(templateBytes);

      if (position === 'before') {
        const templatePages = await mergedPdf.copyPages(templateDoc, templateDoc.getPageIndices());
        templatePages.forEach((page) => mergedPdf.addPage(page));

        const offerPages = await mergedPdf.copyPages(offerDoc, offerDoc.getPageIndices());
        offerPages.forEach((page) => mergedPdf.addPage(page));
      } else {
        const offerPages = await mergedPdf.copyPages(offerDoc, offerDoc.getPageIndices());
        offerPages.forEach((page) => mergedPdf.addPage(page));

        const templatePages = await mergedPdf.copyPages(templateDoc, templateDoc.getPageIndices());
        templatePages.forEach((page) => mergedPdf.addPage(page));
      }

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
