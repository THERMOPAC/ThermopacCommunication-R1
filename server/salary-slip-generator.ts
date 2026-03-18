import PDFDocument from 'pdfkit';
import { Response } from 'express';

interface SalarySlipData {
  employee: {
    name: string;
    employeeCode: string;
    designation: string;
    department: string;
    joiningDate: string;
    panNumber?: string;
  };
  company: {
    name: string;
    address: string;
    logo?: string;
  };
  period: {
    month: string;
    year: number;
    workingDays: number;
    paidDays: number;
    daysInMonth: number;
    holidays: number;
    weeklyOffs: number;
    absentDays: number;
    presentDays: number;
    clBalance: number;
    lopDays: number;
  };
  earnings: {
    basicSalary: number;
    hra: number;
    conveyanceAllowance: number;
    ltaAllowance: number;
    specialAllowance: number;
    supplementaryAllowance: number;
    kgpAllowance: number;
    overtimePay: number;
    bonus: number;
    otherAllowances: number;
  };
  deductions: {
    providentFund: number;
    professionalTax: number;
    incomeTax: number;
    esic: number;
    groupInsurance: number;
    otherDeductions: number;
    loanDeduction: number;
    advanceDeduction: number;
  };
  employerCosts: {
    pfEmployer: number;
    esicEmployer: number;
    groupInsurance: number;
    gratuity: number;
  };
  totals: {
    grossEarnings: number;
    totalDeductions: number;
    netPay: number;
    ctcMonthly: number;
    ctcYearly: number;
  };
  kgpPercent: number;
  netPayInWords?: string;
}

function fmtINR(v: number): string {
  return '\u00B9 ' + v.toLocaleString('en-IN');
}

function fmtDec(v: number): string {
  return '\u00B9 ' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export class SalarySlipGenerator {
  private doc: typeof PDFDocument.prototype;
  private pw: number = 595.28;
  private ph: number = 841.89;
  private m: number = 36;
  private w: number;

  constructor() {
    this.doc = new PDFDocument({ size: 'A4', margin: this.m, autoFirstPage: true });
    this.w = this.pw - this.m * 2;
  }

  async generateSalarySlip(data: SalarySlipData, res: Response): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const fn = `Salary_Slip_${data.employee.name.replace(/\s+/g, '_')}_${data.period.month}_${data.period.year}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
        this.doc.pipe(res);
        this.render(data);
        this.doc.end();
        this.doc.on('end', () => resolve());
        this.doc.on('error', (e: any) => reject(e));
      } catch (e) { reject(e); }
    });
  }

  private hLine(y: number, color: string = '#D1D5DB', width: number = 0.5) {
    this.doc.save();
    this.doc.moveTo(this.m, y).lineTo(this.m + this.w, y).lineWidth(width).strokeColor(color).stroke();
    this.doc.restore();
  }

  private vLine(x: number, y1: number, y2: number, color: string = '#D1D5DB', width: number = 0.5) {
    this.doc.save();
    this.doc.moveTo(x, y1).lineTo(x, y2).lineWidth(width).strokeColor(color).stroke();
    this.doc.restore();
  }

  private t(text: string, x: number, y: number, opts: any = {}) {
    this.doc.text(text, x, y, { ...opts, lineBreak: false });
  }

  private render(d: SalarySlipData): void {
    const doc = this.doc;
    const m = this.m;
    const w = this.w;
    const midX = m + w / 2;

    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}-${today.toLocaleString('en-IN', { month: 'short' })}-${today.getFullYear()}`;

    let y = m;

    doc.save();
    doc.rect(m, y, w, 44).fillColor('#1E3A5F').fill();
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#FFFFFF');
    this.t('THERMOPAC', m + 12, y + 7);
    doc.font('Helvetica').fontSize(7.5).fillColor('#C8D8E8');
    this.t('Engineering Excellence', m + 12, y + 24);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF');
    this.t('SALARY SLIP', m + 12, y + 10, { width: w - 24, align: 'right' });
    doc.font('Helvetica').fontSize(7).fillColor('#C8D8E8');
    this.t(`${d.period.month} ${d.period.year}  |  Date: ${dateStr}`, m + 12, y + 24, { width: w - 24, align: 'right' });

    y += 48;
    doc.fillColor('#000000');

    doc.save();
    doc.rect(m, y, w, 44).fillColor('#F8FAFC').fill();
    doc.restore();
    this.hLine(y, '#1E3A5F', 0.8);
    y += 5;

    const col1 = m + 8;
    const col2 = m + 95;
    const col3 = midX + 8;
    const col4 = midX + 95;
    const infoFontSize = 7;
    const infoLineH = 11;

    doc.font('Helvetica').fontSize(infoFontSize).fillColor('#6B7280');
    this.t('Employee Name', col1, y);
    this.t('Employee Code', col3, y);
    doc.font('Helvetica-Bold').fontSize(infoFontSize + 0.5).fillColor('#1F2937');
    this.t(d.employee.name, col2, y);
    this.t(d.employee.employeeCode || 'N/A', col4, y);
    y += infoLineH;

    doc.font('Helvetica').fontSize(infoFontSize).fillColor('#6B7280');
    this.t('Designation', col1, y);
    this.t('Department', col3, y);
    doc.font('Helvetica-Bold').fontSize(infoFontSize + 0.5).fillColor('#1F2937');
    this.t(d.employee.designation || 'N/A', col2, y);
    this.t(d.employee.department || 'N/A', col4, y);
    y += infoLineH;

    doc.font('Helvetica').fontSize(infoFontSize).fillColor('#6B7280');
    this.t('Date of Joining', col1, y);
    this.t('PAN', col3, y);
    doc.font('Helvetica-Bold').fontSize(infoFontSize + 0.5).fillColor('#1F2937');
    this.t(d.employee.joiningDate || 'N/A', col2, y);
    this.t(d.employee.panNumber || 'N/A', col4, y);

    y += infoLineH + 4;

    doc.save();
    doc.rect(m, y, w, 13).fillColor('#EFF6FF').fill();
    doc.restore();
    this.hLine(y, '#1E3A5F', 0.6);
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#1E3A5F');
    this.t('ATTENDANCE SUMMARY', m + 8, y + 3.5);
    y += 14;

    const attData = [
      { label: 'Days in Month', value: d.period.daysInMonth.toString() },
      { label: 'Holidays', value: d.period.holidays.toString() },
      { label: 'Weekly Offs', value: d.period.weeklyOffs.toString() },
      { label: 'Present Days', value: d.period.presentDays.toFixed(1) },
      { label: 'Absent Days', value: d.period.absentDays.toFixed(1) },
      { label: 'Paid Days', value: d.period.paidDays.toFixed(1) },
      { label: 'CL Balance', value: d.period.clBalance.toFixed(1) },
    ];

    const attColW = w / 7;
    doc.save();
    doc.rect(m, y, w, 20).fillColor('#FFFFFF').fill();
    doc.restore();
    for (let i = 0; i < attData.length; i++) {
      const x = m + i * attColW;
      doc.font('Helvetica').fontSize(5.5).fillColor('#6B7280');
      this.t(attData[i].label, x + 2, y + 1, { width: attColW - 4, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#1F2937');
      this.t(attData[i].value, x + 2, y + 10, { width: attColW - 4, align: 'center' });
      if (i > 0) this.vLine(x, y, y + 20, '#E5E7EB', 0.3);
    }
    this.hLine(y + 20, '#D1D5DB', 0.4);
    y += 23;

    const earningsX = m;
    const deductionsX = midX;
    const tableTop = y;

    doc.save();
    doc.rect(earningsX, tableTop, w / 2, 13).fillColor('#F0FDF4').fill();
    doc.rect(deductionsX, tableTop, w / 2, 13).fillColor('#FEF2F2').fill();
    doc.restore();
    this.hLine(tableTop, '#1E3A5F', 0.6);
    this.vLine(midX, tableTop, tableTop + 13, '#1E3A5F', 0.6);

    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#166534');
    this.t('EARNINGS', earningsX + 8, tableTop + 3.5);
    this.t('Amount', earningsX + 8, tableTop + 3.5, { width: w / 2 - 16, align: 'right' });
    doc.fillColor('#991B1B');
    this.t('DEDUCTIONS', deductionsX + 8, tableTop + 3.5);
    this.t('Amount', deductionsX + 8, tableTop + 3.5, { width: w / 2 - 16, align: 'right' });

    y = tableTop + 14;

    const earnRows = [
      { label: 'Basic Salary', value: d.earnings.basicSalary },
      { label: 'HRA', value: d.earnings.hra },
      { label: 'Conveyance Allowance', value: d.earnings.conveyanceAllowance },
      { label: 'LTA', value: d.earnings.ltaAllowance },
      { label: 'Special Allowance', value: d.earnings.specialAllowance },
      { label: 'Supplementary Allowance', value: d.earnings.supplementaryAllowance },
    ];
    if (d.kgpPercent > 0 || d.earnings.kgpAllowance > 0) {
      earnRows.push({ label: `KGP Allowance (${d.kgpPercent}%)`, value: d.earnings.kgpAllowance });
    }
    if (d.earnings.overtimePay > 0) {
      earnRows.push({ label: 'Overtime Pay', value: d.earnings.overtimePay });
    }
    if (d.earnings.otherAllowances > 0) {
      earnRows.push({ label: 'Other Allowances', value: d.earnings.otherAllowances });
    }

    const dedRows: { label: string; value: number }[] = [
      { label: 'Provident Fund (Employee)', value: d.deductions.providentFund },
      { label: 'Professional Tax', value: d.deductions.professionalTax },
      { label: 'ESIC (Employee)', value: d.deductions.esic },
      { label: 'Income Tax (TDS)', value: d.deductions.incomeTax },
    ];
    if (d.deductions.loanDeduction > 0) {
      dedRows.push({ label: 'Loan Deduction', value: d.deductions.loanDeduction });
    }
    if (d.deductions.advanceDeduction > 0) {
      dedRows.push({ label: 'Advance Deduction', value: d.deductions.advanceDeduction });
    }
    if (d.deductions.otherDeductions > 0) {
      dedRows.push({ label: 'Other Deductions', value: d.deductions.otherDeductions });
    }

    const rowH = 12;
    const maxRows = Math.max(earnRows.length, dedRows.length);

    for (let i = 0; i < maxRows; i++) {
      const rowY = y + i * rowH;
      const bgColor = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
      doc.save();
      doc.rect(earningsX, rowY, w / 2, rowH).fillColor(bgColor).fill();
      doc.rect(deductionsX, rowY, w / 2, rowH).fillColor(bgColor).fill();
      doc.restore();

      if (i < earnRows.length) {
        doc.font('Helvetica').fontSize(6.5).fillColor('#374151');
        this.t(earnRows[i].label, earningsX + 8, rowY + 2.5, { width: w / 2 - 80 });
        this.t(fmtDec(earnRows[i].value), earningsX + 8, rowY + 2.5, { width: w / 2 - 16, align: 'right' });
      }

      if (i < dedRows.length) {
        doc.font('Helvetica').fontSize(6.5).fillColor('#374151');
        this.t(dedRows[i].label, deductionsX + 8, rowY + 2.5, { width: w / 2 - 80 });
        this.t(fmtDec(dedRows[i].value), deductionsX + 8, rowY + 2.5, { width: w / 2 - 16, align: 'right' });
      }
      this.vLine(midX, rowY, rowY + rowH, '#E5E7EB', 0.3);
    }

    const totalRowY = y + maxRows * rowH;
    doc.save();
    doc.rect(earningsX, totalRowY, w / 2, 13).fillColor('#ECFDF5').fill();
    doc.rect(deductionsX, totalRowY, w / 2, 13).fillColor('#FEF2F2').fill();
    doc.restore();
    this.hLine(totalRowY, '#D1D5DB', 0.4);
    this.vLine(midX, totalRowY, totalRowY + 13, '#1E3A5F', 0.4);

    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#166534');
    this.t('Gross Earnings', earningsX + 8, totalRowY + 3.5);
    this.t(fmtDec(d.totals.grossEarnings), earningsX + 8, totalRowY + 3.5, { width: w / 2 - 16, align: 'right' });
    doc.fillColor('#991B1B');
    this.t('Total Deductions', deductionsX + 8, totalRowY + 3.5);
    this.t(fmtDec(d.totals.totalDeductions), deductionsX + 8, totalRowY + 3.5, { width: w / 2 - 16, align: 'right' });

    this.hLine(totalRowY + 13, '#1E3A5F', 0.6);
    y = totalRowY + 16;

    doc.save();
    doc.rect(m, y, w, 22).fillColor('#1E3A5F').fill();
    doc.restore();
    doc.font('Helvetica').fontSize(6.5).fillColor('#C8D8E8');
    this.t('NET PAY', m + 10, y + 2);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#FFFFFF');
    this.t(fmtDec(d.totals.netPay), m + 10, y + 2, { width: w - 20, align: 'right' });
    const wordsText = d.netPayInWords || numberToWords(Math.round(d.totals.netPay));
    doc.font('Helvetica').fontSize(6).fillColor('#C8D8E8');
    this.t(wordsText, m + 10, y + 15);
    y += 25;

    doc.save();
    doc.rect(m, y, w, 12).fillColor('#EFF6FF').fill();
    doc.restore();
    this.hLine(y, '#1E3A5F', 0.6);
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#1E3A5F');
    this.t('EMPLOYER CONTRIBUTIONS & CTC', m + 8, y + 3);
    y += 13;

    const ctcItems = [
      { label: 'PF (Employer)', value: fmtINR(d.employerCosts.pfEmployer) },
      { label: 'ESIC (Employer)', value: fmtINR(d.employerCosts.esicEmployer) },
      { label: 'Group Insurance', value: fmtINR(d.employerCosts.groupInsurance) },
      { label: 'Gratuity', value: fmtINR(d.employerCosts.gratuity) },
      { label: 'Bonus', value: fmtINR(d.earnings.bonus) },
    ];

    const ctcColW = w / 3;
    for (let i = 0; i < ctcItems.length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = m + col * ctcColW;
      const ry = y + row * 11;
      doc.font('Helvetica').fontSize(6).fillColor('#6B7280');
      this.t(ctcItems[i].label + ':', x + 8, ry + 1);
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#1F2937');
      this.t(ctcItems[i].value, x + 80, ry + 1);
    }
    y += Math.ceil(ctcItems.length / 3) * 11 + 1;

    this.hLine(y, '#D1D5DB', 0.3);
    y += 2;
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#1E3A5F');
    this.t(`CTC (Monthly): ${fmtINR(d.totals.ctcMonthly)}`, m + 8, y);
    this.t(`CTC (Annual): ${fmtINR(d.totals.ctcYearly)}`, m + 8, y, { width: w - 16, align: 'right' });
    y += 12;

    this.hLine(y, '#D1D5DB', 0.3);
    y += 16;

    doc.font('Helvetica').fontSize(7).fillColor('#6B7280');
    this.t('For THERMOPAC', m, y, { width: w - 16, align: 'right' });
    y += 24;
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#1F2937');
    this.t('Authorized Signatory', m, y, { width: w - 16, align: 'right' });

    y += 10;
    doc.font('Helvetica').fontSize(5.5).fillColor('#9CA3AF');
    this.t('This is a computer-generated document and does not require a physical signature.', m, y, { width: w, align: 'center' });

    const footerY = this.ph - 32;
    this.hLine(footerY - 3, '#1E3A5F', 0.6);
    doc.font('Helvetica').fontSize(5.5).fillColor('#6B7280');
    this.t(
      'THERMOPAC  |  L 4, 405 The Summit Business Bay, Vile Parle, Western Express Highway, Mumbai 400 057',
      m, footerY, { width: w, align: 'center' }
    );
    this.t(
      'Tel: +91 22 2617 8080-84  |  Fax: +91 22 2617 8084  |  Email: sales@thermopac.in',
      m, footerY + 8, { width: w, align: 'center' }
    );
  }
}

export function numberToWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertHundreds(num: number): string {
    let result = '';
    if (num >= 100) {
      result += ones[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }
    if (num >= 20) {
      result += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    } else if (num >= 10) {
      result += teens[num - 10] + ' ';
      return result;
    }
    if (num > 0) result += ones[num] + ' ';
    return result;
  }

  if (amount === 0) return 'Zero Rupees Only';
  const crores = Math.floor(amount / 10000000);
  const lakhs = Math.floor((amount % 10000000) / 100000);
  const thousands = Math.floor((amount % 100000) / 1000);
  const hundreds = amount % 1000;

  let result = '';
  if (crores > 0) result += convertHundreds(crores) + 'Crore ';
  if (lakhs > 0) result += convertHundreds(lakhs) + 'Lakh ';
  if (thousands > 0) result += convertHundreds(thousands) + 'Thousand ';
  if (hundreds > 0) result += convertHundreds(hundreds);
  if (result.trim()) result += 'Rupees ';
  return result.trim() + ' Only';
}
