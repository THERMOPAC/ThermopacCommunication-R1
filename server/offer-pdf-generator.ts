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

const ENGLISH_STRINGS = {
  quotation: 'QUOTATION',
  quotationNo: 'Quotation No:',
  date: 'Date:',
  validUntil: 'Valid Until:',
  to: 'TO:',
  attn: 'Attn:',
  email: 'Email:',
  sub: 'Sub.:',
  dear: 'Dear',
  dearSirMadam: 'Dear Sir/Madam,',
  introText: `We are pleased to submit our Techno-Commercial proposal for the Design, Engineering, and Manufacture, supply, installation and commissioning.
Our portfolio consists off Lubricant re-refining plants, Regenerative type base oil polishing system & Lubricant Blending Plant

Thermopac is building the Re-refining plants and equipment's Since 1986, Thermopac has developed in-house technology for lower Capex and higher yields. We have the state of the art Manufacturing facility located at Rabale near Navi Mumbai. We manufacture all key equipment's like evaporator, distillation columns, etc. and forward integration for grease, lubricants, etc.

We have constructed more than 35 Re-refining plants in 5 different Continents. All these Re-refining plants manufacture environment-friendly re-refine Base Oil

We build refineries / Lubricant re-refining plants with modular construction with a room to enhance the capacity. We take pride to mention that Thermopac is the only company that is building true turnkey re-refinery plants all over the Globe

Moreover, Thermopac expertise extends beyond the construction of re-refinery plants. The company offers a range of services, including technical support, training, and ongoing maintenance. This holistic approach ensures that clients can operate their plants efficiently and effectively, maximizing their investment and achieving long-term success. Thermopac dedication to customer satisfaction is evident in their commitment to providing top-notch service and support throughout the entire lifecycle of the plant.`,
  forThermopac: 'For THERMOPAC',
  turnkeyDivision: '(Turnkey Engineering Solution Division)',
  marketingManager: 'Marketing Manager',
  priceSchedule: 'PRICE SCHEDULE',
  sl: 'SL.',
  itemDescription: 'ITEM DESCRIPTION',
  price: 'PRICE',
  qty: 'QTY',
  amount: 'AMOUNT',
  subtotal: 'Subtotal:',
  discount: 'Discount',
  tax: 'Tax',
  total: 'TOTAL:',
  termsOfPayment: 'TERMS OF PAYMENT:',
  deliveryTerms: 'DELIVERY TERMS:',
  validityOfOffer: 'VALIDITY OF THE OFFER:',
  validityText: 'This offer is valid until {date}. Thereafter, the validity is subject to our written confirmation.',
  remarks: 'REMARKS:',
  termsAndConditions: 'TERMS AND CONDITIONS:',
  closingLine: 'We look forward to receiving your valued order.',
};

export class OfferPdfGenerator {
  private doc: PDFKit.PDFDocument;
  private pageWidth: number = 595.28;
  private pageHeight: number = 841.89;
  private margin: number = 50;
  private contentWidth: number;
  private currentY: number = 0;
  private data: OfferPdfData;
  private strings = ENGLISH_STRINGS;
  private priceMode: 'combined' | 'breakup' | 'technical' = 'breakup';

  constructor(data: OfferPdfData, options?: { priceMode?: 'combined' | 'breakup' | 'technical' }) {
    this.data = data;
    this.priceMode = options?.priceMode || 'breakup';
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
        const logoWidth = 60;
        const logoHeight = 17;
        const logoX = this.pageWidth - this.margin - logoWidth;
        this.doc.image(logoPath, logoX, this.margin, { width: logoWidth, fit: [logoWidth, logoHeight] });
      }
    } catch (e) {
    }

    this.currentY = this.margin + 85;
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
      .text(this.strings.quotation, col1X, this.currentY);

    this.doc
      .fillColor('#333333')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(this.strings.quotationNo, col2X, this.currentY);
    this.doc
      .font('Helvetica')
      .text(this.data.offerNumber + (this.data.revision > 0 ? ` Rev.${this.data.revision}` : ''), col2X + 80, this.currentY);

    this.currentY += 14;

    this.doc
      .font('Helvetica-Bold')
      .text(this.strings.date, col2X, this.currentY);
    this.doc
      .font('Helvetica')
      .text(this.formatDate(this.data.createdAt), col2X + 80, this.currentY);

    this.currentY += 14;

    this.doc
      .font('Helvetica-Bold')
      .text(this.strings.validUntil, col2X, this.currentY);
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
      .text(this.strings.to, this.margin, this.currentY);

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
        .text(`${this.strings.attn} ${this.data.contactPerson}`, this.margin, this.currentY);
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
        .text(`${this.strings.email} ${this.data.customerEmail}`, this.margin, this.currentY);
      this.currentY += 12;
    }

    this.currentY += 10;
  }

  private drawSubject(): void {
    this.doc
      .fillColor('#003366')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(this.strings.sub, this.margin, this.currentY);

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
      ? `${this.strings.dear} ${this.data.contactPerson},`
      : this.strings.dearSirMadam;

    this.doc
      .fillColor('#333333')
      .fontSize(10)
      .font('Helvetica')
      .text(salutation, this.margin, this.currentY);

    this.currentY += 16;

    const introText = this.strings.introText;

    this.doc
      .fontSize(9)
      .text(
        introText,
        this.margin,
        this.currentY,
        { width: this.contentWidth, lineGap: 3, align: 'justify' }
      );

    this.currentY = this.doc.y + 30;

    this.doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(this.strings.forThermopac, this.margin, this.currentY);
    this.currentY = this.doc.y + 2;

    this.doc
      .fontSize(9)
      .font('Helvetica')
      .text(this.strings.turnkeyDivision, this.margin, this.currentY);
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
      .text(this.strings.marketingManager, this.margin, this.currentY);
    this.doc.font('Helvetica');

    this.currentY = this.doc.y + 10;
  }

  private drawItemsTable(): void {
    this.checkPageBreak(200);

    const isTechnical = this.priceMode === 'technical';

    this.doc
      .fillColor('#003366')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(isTechnical ? 'TECHNICAL SPECIFICATION' : this.strings.priceSchedule, this.margin, this.currentY);

    this.currentY += 20;
    const colWidths = isTechnical ? {
      sl: 25,
      description: 340,
      price: 0,
      qty: 130,
      amount: 0,
    } : {
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
      { label: this.strings.sl, width: colWidths.sl },
      { label: this.strings.itemDescription, width: colWidths.description },
      ...(!isTechnical ? [
        { label: this.strings.price, width: colWidths.price },
      ] : []),
      { label: this.strings.qty, width: colWidths.qty },
      ...(!isTechnical ? [
        { label: `${this.strings.amount} ${this.data.currency}`, width: colWidths.amount },
      ] : []),
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
        .text((isSubItem ? '- ' : '') + item.description, colX + 4 + descIndent, this.currentY + 6, { width: descWidth });
      if (item.productCode) {
        this.doc
          .font('Helvetica')
          .fontSize(6.5)
          .fillColor('#888888')
          .text(`Code: ${item.productCode}`, colX + 4 + descIndent, this.currentY + 6 + descHeight + 1, { width: descWidth });
      }
      colX += colWidths.description;

      const hideSubItemPrices = isSubItem && this.priceMode === 'combined';
      const hidePrices = isTechnical || hideSubItemPrices;

      if (!isTechnical) {
        this.doc
          .fillColor(isSubItem ? '#666666' : '#333333')
          .font('Helvetica')
          .fontSize(isSubItem ? 7 : 8)
          .text(hidePrices ? '' : this.formatNumber(item.unitPrice), colX + 4, this.currentY + 8, { width: colWidths.price - 8, align: 'right' });
        colX += colWidths.price;
      }

      this.doc
        .fillColor(isSubItem ? '#666666' : '#333333')
        .font('Helvetica')
        .fontSize(isSubItem ? 7 : 8)
        .text(hideSubItemPrices ? '' : `${parseFloat(item.quantity)} ${item.unit}`, colX + 4, this.currentY + 8, { width: colWidths.qty - 8, align: 'center' });
      colX += colWidths.qty;

      if (!isTechnical) {
        this.doc
          .font(isSubItem ? 'Helvetica' : 'Helvetica-Bold')
          .text(hidePrices ? '' : this.formatNumber(item.totalPrice), colX + 4, this.currentY + 8, { width: colWidths.amount - 8, align: 'right' });
      }

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
      .text(this.strings.subtotal, labelX, this.currentY, { width: 140, align: 'right' });
    this.doc
      .font('Helvetica-Bold')
      .text(`${this.data.currency} ${this.formatNumber(this.data.subtotal)}`, valueX, this.currentY, { width: 100, align: 'right' });

    this.currentY += 16;

    const discPct = parseFloat(this.data.discountPercent || '0');
    if (discPct > 0) {
      this.doc
        .font('Helvetica')
        .text(`${this.strings.discount} (${discPct}%):`, labelX, this.currentY, { width: 140, align: 'right' });
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
      .text(this.strings.total, labelX + 5, this.currentY, { width: 135, align: 'right' });
    this.doc
      .text(`${this.data.currency} ${this.formatNumber(this.data.totalAmount)}`, valueX, this.currentY, { width: 100, align: 'right' });

    this.currentY += 20;
  }

  private drawTermsSectionHeader(text: string): void {
    this.checkPageBreak(30);
    this.doc
      .fillColor('#003366')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(text, this.margin, this.currentY);
    this.currentY += 14;
  }

  private drawTermsBody(text: string, indent: number = 0): void {
    const opts = { width: this.contentWidth - indent };
    this.doc
      .fillColor('#333333')
      .fontSize(8.5)
      .font('Helvetica')
      .text(text, this.margin + indent, this.currentY, opts);
    const h = this.doc.heightOfString(text, opts);
    this.currentY += h + 6;
  }

  private drawTermsBullet(text: string, indent: number = 20): void {
    this.checkPageBreak(16);
    this.doc
      .fillColor('#333333')
      .fontSize(8.5)
      .font('Helvetica')
      .text('-', this.margin + indent - 10, this.currentY)
      .text(text, this.margin + indent, this.currentY, { width: this.contentWidth - indent });
    const h = this.doc.heightOfString(text, { width: this.contentWidth - indent });
    this.currentY += h + 4;
  }

  private drawTerms(): void {
    this.checkPageBreak(60);

    this.drawTermsBody(
      'Any deviation from the standard (layout, P & ID and GA drawings) will result in additional pipes, valves, cables and tanks, if quoted above. Any additional items will be to the client\'s account.',
    );
    this.currentY += 4;

    this.drawTermsBody(
      '** Instrument and electrical cables: lengths and sizes are as per our standard layout and in quantities required only for interconnecting refinery panel to refinery skids and PMCC panel to transfer pumps. Any additional instrument cable, electrical cable or accessories will be to the client\'s account',
    );
    this.currentY += 6;

    this.drawTermsSectionHeader('BASIS OF PRICES:');
    this.drawTermsBody(
      'The ex-factory price quoted above includes packing, wherever applicable. Forwarding, freight and insurance when not quoted separately are to be arranged by the customer. All prices quoted in ' + this.data.currency + ' and on Ex-Works basis at our Mumbai factory. The above prices are ex-works, excluding packing and forwarding if not quoted separately. Insurance if required should be arranged by the customer.',
      10,
    );

    if (this.data.deliveryTerms) {
      this.drawTermsSectionHeader('DELIVERY TERMS:');
      this.drawTermsBody(this.data.deliveryTerms, 10);
    }

    this.drawTermsSectionHeader('SUPERVISION OF ERECTION AND COMMISSIONING IF REQUIRED:');
    this.drawTermsBody(
      'These charges are additional from the offer price, daily charges, hotel cost; air travel and type of travel will be indicated prior to acceptance of order.',
      10,
    );

    this.drawTermsSectionHeader('VALIDITY OF THE OFFER:');
    this.drawTermsBody(
      'Offer is only valid for 60 days from the date of this offer. Thereafter, the validity is subject to our written confirmation.',
      10,
    );

    this.drawTermsSectionHeader('Terms of Payment');
    if (this.data.paymentTerms) {
      this.drawTermsBody(this.data.paymentTerms, 10);
    } else {
      this.drawTermsBody(
        'i. 40% Contract Value by wire transfer as an advance along with Purchase Order and signing this contract',
        10,
      );
      this.drawTermsBody(
        'ii. 60% of Contract Value against the readiness of the plant in Mumbai',
        10,
      );
    }

    this.drawTermsSectionHeader('WHAT WE DON\'T DO:');
    this.drawTermsBullet('Architectural and civil job', 30);
    this.drawTermsBullet('Tank fabrication and piping fabrication', 30);
    this.drawTermsBullet('Insulation and cladding: material supply and labor', 30);
    this.drawTermsBullet('Electrical and instrument cable laying and connections', 30);
    this.drawTermsBullet('Supply of locally approved Firefighting components such as deluge valves, hydrants, fire hose and fire alarm system', 30);

    this.drawTermsSectionHeader('Commissioning and Final Acceptance');
    this.drawTermsBody(
      'Commissioning and final acceptance testing shall include mechanical and process commissioning of the Equipment to demonstrate its ability to produce products in accordance with the offer above. In performing the commissioning and testing it shall be the responsibility of Customer to provide the raw material/fuel required to operate the Equipment at desired levels, along with operational and maintenance personnel sufficient to operate the Equipment.',
      10,
    );
    this.drawTermsBody(
      'THERMOPAC\'s sole responsibility will be to provide technical assistance and guidance of the overall equipment commissioning test procedure. Equipment acceptance testing shall commence upon seven (7) calendar days\' notice by Customer to THERMOPAC that the plant has been completed to the point that such trials can begin following the delivery and installation of the equipment and structure and final installation activities of Customer.',
      10,
    );
    this.drawTermsBody(
      'THERMOPAC will then provide Customer a detailed plan for process commission of the Equipment. Final Acceptance and the date of Final Acceptance shall have deemed to have occurred upon the Equipment operating per the specifications set forth in the offer above for Twelve Hours (12) Hours Test run performance guarantee operation.',
      10,
    );
    this.drawTermsBody(
      'Services for commissioning and Final Acceptance include the services of THERMOPAC\'s representative(s) on-site for up to Three (3) days with additional Twelve Hours (12) Hours Test run performance guarantee operation after operation begins to ensure that the installation has been made in a good and workmanlike manner from the point of view of mechanical working and to set various controls that are necessary. THERMOPAC will further conduct all necessary demonstrations and training to Customer for the purpose of user education and for the operation / maintenance of the equipment.',
      10,
    );

    this.checkPageBreak(100);
    this.currentY += 10;

    const tableTop = this.currentY;
    const col1X = this.margin + 10;
    const col2X = this.margin + 80;
    const col3X = this.margin + 280;
    const col4X = this.margin + 400;
    const rowH = 18;

    this.doc.fillColor('#003366').fontSize(8).font('Helvetica-Bold');
    this.doc.text('Sr.', col1X, tableTop);
    this.doc.text('Designation', col2X, tableTop);
    this.doc.text('Type of Air Travel', col3X, tableTop);
    this.doc.text('Daily Allowance', col4X, tableTop);
    this.currentY = tableTop + rowH;

    this.doc.fillColor('#333333').fontSize(8).font('Helvetica');
    const travelRows = [
      { sr: '1', designation: 'After Sales Manager', travel: 'Business Class', allowance: 'US$ 350 / Day' },
      { sr: '2', designation: 'After Sales Engineer', travel: 'Economy Class', allowance: 'US$ 350 / Day' },
      { sr: '3', designation: 'Assistant Engineer', travel: 'Economy Class', allowance: 'US$ 300 / Day' },
    ];
    for (const row of travelRows) {
      this.doc.text(row.sr, col1X, this.currentY);
      this.doc.text(row.designation, col2X, this.currentY);
      this.doc.text(row.travel, col3X, this.currentY);
      this.doc.text(row.allowance, col4X, this.currentY);
      this.currentY += rowH;
    }

    this.currentY += 6;
    this.drawTermsBody(
      'Air Travel cost and lodging and food are in addition to the contract price and shall be invoiced per the above schedule based on the actual number of visits and number of days THERMOPAC personnel spend at the Site, plus actual lodging, food and travel expenses.',
      10,
    );

    if (this.data.notes) {
      this.checkPageBreak(60);
      this.drawTermsSectionHeader('REMARKS:');
      this.drawTermsBody(this.data.notes, 10);
    }

    if (this.data.termsAndConditions) {
      this.checkPageBreak(80);
      this.drawTermsSectionHeader('TERMS AND CONDITIONS:');
      this.drawTermsBody(this.data.termsAndConditions, 10);
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
      .text(this.strings.closingLine, this.margin, this.currentY);

    this.currentY += 30;

    this.doc
      .fillColor('#003366')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(this.strings.forThermopac, this.margin, this.currentY);

    this.currentY += 12;
    this.doc
      .fontSize(9)
      .text(this.strings.turnkeyDivision, this.margin, this.currentY);

    this.currentY += 40;

    this.doc
      .fillColor('#333333')
      .font('Helvetica')
      .fontSize(9)
      .text('_____________________________', this.margin, this.currentY);

    this.currentY += 14;
    this.doc
      .font('Helvetica-Bold')
      .text(this.strings.marketingManager, this.margin, this.currentY);
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
        bufferPages: true,
      });
      const origDoc = this.doc;
      this.doc = partDoc;
      this.currentY = this.margin;

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

      partDoc.flushPages();
      partDoc.end();
    });
  }

  public async generate(res: Response): Promise<void> {
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
    if (this.priceMode !== 'technical') {
      this.drawTotals();
    }
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

  public async generateWithTemplate(res: Response, templatePdfPath: string, pageRange?: { startPage?: number | null; endPage?: number | null }): Promise<void> {
    try {
      const templateBytes = fs.readFileSync(templatePdfPath);
      const templateDoc = await PDFLibDocument.load(templateBytes);
      const mergedPdf = await PDFLibDocument.create();

      const part1Bytes = await this.generatePartBuffer([
        this.drawHeader, this.drawOfferInfo, this.drawCustomerInfo,
        this.drawSubject, this.drawDearLine,
      ]);
      const part2Methods = this.priceMode === 'technical'
        ? [this.drawItemsTable, this.drawTerms, this.drawSignature]
        : [this.drawItemsTable, this.drawTotals, this.drawTerms, this.drawSignature];
      const part2Bytes = await this.generatePartBuffer(part2Methods);

      const part1Doc = await PDFLibDocument.load(part1Bytes);
      const part2Doc = await PDFLibDocument.load(part2Bytes);

      const p1Pages = await mergedPdf.copyPages(part1Doc, part1Doc.getPageIndices());
      p1Pages.forEach((page) => mergedPdf.addPage(page));

      const totalTemplatePages = templateDoc.getPageCount();
      const start = Math.max(0, (pageRange?.startPage || 1) - 1);
      const end = Math.min(totalTemplatePages, pageRange?.endPage || totalTemplatePages);
      const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);

      const tplPages = await mergedPdf.copyPages(templateDoc, pageIndices);
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
