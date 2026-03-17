import PDFDocument from 'pdfkit';
import { Response } from 'express';

interface SalarySlipData {
  employee: {
    name: string;
    employeeCode: string;
    designation: string;
    department: string;
    joiningDate: string;
    bankAccount: string;
    panNumber?: string;
    uan?: string;
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
    esicEmployer: number;
    groupInsurance: number;
    pfEmployer: number;
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
  netPayInWords: string;
}

export { SalarySlipData };

const rupee = String.fromCharCode(8377);

function fmtINR(num: number): string {
  return rupee + ' ' + Math.round(num).toLocaleString('en-IN');
}

function fmtDec(num: number): string {
  return rupee + ' ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(num: number): string {
  return Math.round(num).toLocaleString('en-IN');
}

export class SalarySlipGenerator {
  private doc: typeof PDFDocument.prototype;
  private pw: number = 595.28;
  private ph: number = 841.89;
  private m: number = 36;
  private w: number;

  constructor() {
    this.doc = new PDFDocument({ size: 'A4', margin: this.m });
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
    this.doc.moveTo(this.m, y).lineTo(this.m + this.w, y).lineWidth(width).strokeColor(color).stroke();
  }

  private vLine(x: number, y1: number, y2: number, color: string = '#D1D5DB', width: number = 0.5) {
    this.doc.moveTo(x, y1).lineTo(x, y2).lineWidth(width).strokeColor(color).stroke();
  }

  private render(d: SalarySlipData): void {
    const doc = this.doc;
    const m = this.m;
    const w = this.w;
    const midX = m + w / 2;

    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}-${today.toLocaleString('en-IN', { month: 'short' })}-${today.getFullYear()}`;

    let y = m;

    doc.rect(m, y, w, 60).fillColor('#1E3A5F').fill();
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#FFFFFF');
    doc.text('THERMOPAC', m + 20, y + 10, { width: w - 40 });
    doc.font('Helvetica').fontSize(9).fillColor('#C8D8E8');
    doc.text('Engineering Excellence', m + 20, y + 32, { width: w - 40 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF');
    doc.text('SALARY SLIP', m + 20, y + 18, { width: w - 40, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor('#C8D8E8');
    doc.text(`${d.period.month} ${d.period.year}`, m + 20, y + 32, { width: w - 40, align: 'right' });
    doc.text(`Date: ${dateStr}`, m + 20, y + 44, { width: w - 40, align: 'right' });

    y += 68;
    doc.fillColor('#000000');

    doc.rect(m, y, w, 70).fillColor('#F8FAFC').fill();
    this.hLine(y, '#1E3A5F', 1);
    y += 8;
    doc.fillColor('#6B7280');

    const col1 = m + 10;
    const col2 = m + 130;
    const col3 = midX + 10;
    const col4 = midX + 110;

    doc.font('Helvetica').fontSize(7.5).fillColor('#6B7280');
    doc.text('Employee Name', col1, y);
    doc.text('Employee Code', col3, y);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1F2937');
    doc.text(d.employee.name, col2, y);
    doc.text(d.employee.employeeCode || 'N/A', col4, y);
    y += 14;

    doc.font('Helvetica').fontSize(7.5).fillColor('#6B7280');
    doc.text('Designation', col1, y);
    doc.text('Department', col3, y);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1F2937');
    doc.text(d.employee.designation || 'N/A', col2, y);
    doc.text(d.employee.department || 'N/A', col4, y);
    y += 14;

    doc.font('Helvetica').fontSize(7.5).fillColor('#6B7280');
    doc.text('Date of Joining', col1, y);
    doc.text('PAN', col3, y);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1F2937');
    doc.text(d.employee.joiningDate || 'N/A', col2, y);
    doc.text(d.employee.panNumber || 'N/A', col4, y);
    y += 14;

    doc.font('Helvetica').fontSize(7.5).fillColor('#6B7280');
    doc.text('Bank Account', col1, y);
    doc.text('UAN', col3, y);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1F2937');
    doc.text(d.employee.bankAccount || 'N/A', col2, y);
    doc.text(d.employee.uan || 'N/A', col4, y);

    y += 22;

    const attY = y;
    doc.rect(m, attY, w, 18).fillColor('#EFF6FF').fill();
    this.hLine(attY, '#1E3A5F', 0.8);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1E3A5F');
    doc.text('ATTENDANCE SUMMARY', m + 10, attY + 5, { width: w - 20 });
    y = attY + 20;

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
    doc.rect(m, y, w, 28).fillColor('#FFFFFF').fill();
    for (let i = 0; i < attData.length; i++) {
      const x = m + i * attColW;
      doc.font('Helvetica').fontSize(6.5).fillColor('#6B7280');
      doc.text(attData[i].label, x + 4, y + 4, { width: attColW - 8, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1F2937');
      doc.text(attData[i].value, x + 4, y + 15, { width: attColW - 8, align: 'center' });
      if (i > 0) this.vLine(x, y, y + 28, '#E5E7EB', 0.3);
    }
    this.hLine(y + 28, '#D1D5DB', 0.5);
    y += 34;

    const earningsX = m;
    const deductionsX = midX;
    const tableTop = y;

    doc.rect(earningsX, tableTop, w / 2, 18).fillColor('#F0FDF4').fill();
    doc.rect(deductionsX, tableTop, w / 2, 18).fillColor('#FEF2F2').fill();
    this.hLine(tableTop, '#1E3A5F', 0.8);
    this.vLine(midX, tableTop, tableTop + 18, '#1E3A5F', 0.8);

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#166534');
    doc.text('EARNINGS', earningsX + 10, tableTop + 5, { width: w / 2 - 20 });
    doc.text('Amount', earningsX + 10, tableTop + 5, { width: w / 2 - 20, align: 'right' });
    doc.fillColor('#991B1B');
    doc.text('DEDUCTIONS', deductionsX + 10, tableTop + 5, { width: w / 2 - 20 });
    doc.text('Amount', deductionsX + 10, tableTop + 5, { width: w / 2 - 20, align: 'right' });

    y = tableTop + 20;

    const earnRows = [
      { label: 'Basic Salary', value: d.earnings.basicSalary },
      { label: 'House Rent Allowance (HRA)', value: d.earnings.hra },
      { label: 'Conveyance Allowance', value: d.earnings.conveyanceAllowance },
      { label: 'Leave Travel Allowance (LTA)', value: d.earnings.ltaAllowance },
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

    const dedRows = [
      { label: 'Provident Fund (Employee)', value: d.deductions.providentFund },
      { label: 'Professional Tax', value: d.deductions.professionalTax },
      { label: 'ESIC (Employee)', value: d.deductions.esic },
      { label: 'Income Tax (TDS)', value: d.deductions.incomeTax },
      { label: 'Loan Deduction', value: d.deductions.loanDeduction },
      { label: 'Advance Deduction', value: d.deductions.advanceDeduction },
    ];

    const rowH = 15;
    const maxRows = Math.max(earnRows.length, dedRows.length);

    doc.fillColor('#374151');
    for (let i = 0; i < maxRows; i++) {
      const rowY = y + i * rowH;
      const bgColor = i % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
      doc.rect(earningsX, rowY, w / 2, rowH).fillColor(bgColor).fill();
      doc.rect(deductionsX, rowY, w / 2, rowH).fillColor(bgColor).fill();

      if (i < earnRows.length) {
        doc.font('Helvetica').fontSize(7.5).fillColor('#374151');
        doc.text(earnRows[i].label, earningsX + 10, rowY + 3.5, { width: w / 2 - 90 });
        doc.font('Helvetica').fontSize(7.5).fillColor('#1F2937');
        doc.text(fmtDec(earnRows[i].value), earningsX + 10, rowY + 3.5, { width: w / 2 - 20, align: 'right' });
      }

      if (i < dedRows.length) {
        doc.font('Helvetica').fontSize(7.5).fillColor('#374151');
        doc.text(dedRows[i].label, deductionsX + 10, rowY + 3.5, { width: w / 2 - 90 });
        doc.font('Helvetica').fontSize(7.5).fillColor('#1F2937');
        doc.text(fmtDec(dedRows[i].value), deductionsX + 10, rowY + 3.5, { width: w / 2 - 20, align: 'right' });
      }
      this.vLine(midX, rowY, rowY + rowH, '#E5E7EB', 0.3);
    }

    const totalRowY = y + maxRows * rowH;
    doc.rect(earningsX, totalRowY, w / 2, 18).fillColor('#ECFDF5').fill();
    doc.rect(deductionsX, totalRowY, w / 2, 18).fillColor('#FEF2F2').fill();
    this.hLine(totalRowY, '#D1D5DB', 0.5);
    this.vLine(midX, totalRowY, totalRowY + 18, '#1E3A5F', 0.5);

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#166534');
    doc.text('Gross Earnings', earningsX + 10, totalRowY + 5, { width: w / 2 - 90 });
    doc.text(fmtDec(d.totals.grossEarnings), earningsX + 10, totalRowY + 5, { width: w / 2 - 20, align: 'right' });
    doc.fillColor('#991B1B');
    doc.text('Total Deductions', deductionsX + 10, totalRowY + 5, { width: w / 2 - 90 });
    doc.text(fmtDec(d.totals.totalDeductions), deductionsX + 10, totalRowY + 5, { width: w / 2 - 20, align: 'right' });

    this.hLine(totalRowY + 18, '#1E3A5F', 0.8);
    y = totalRowY + 24;

    doc.rect(m, y, w, 30).fillColor('#1E3A5F').fill();
    doc.font('Helvetica').fontSize(8).fillColor('#C8D8E8');
    doc.text('NET PAY', m + 15, y + 5);
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#FFFFFF');
    doc.text(fmtDec(d.totals.netPay), m + 15, y + 5, { width: w - 30, align: 'right' });
    doc.font('Helvetica').fontSize(7).fillColor('#C8D8E8');
    const wordsText = d.netPayInWords || numberToWords(Math.round(d.totals.netPay));
    doc.text(wordsText, m + 15, y + 21, { width: w - 30 });
    y += 36;

    const ctcY = y;
    doc.rect(m, ctcY, w, 18).fillColor('#EFF6FF').fill();
    this.hLine(ctcY, '#1E3A5F', 0.8);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1E3A5F');
    doc.text('EMPLOYER CONTRIBUTIONS & CTC', m + 10, ctcY + 5, { width: w - 20 });
    y = ctcY + 20;

    const ctcRows = [
      { label: 'PF (Employer)', value: fmtINR(d.employerCosts.pfEmployer) },
      { label: 'ESIC (Employer)', value: fmtINR(d.employerCosts.esicEmployer) },
      { label: 'Group Insurance', value: fmtINR(d.employerCosts.groupInsurance) },
      { label: 'Gratuity', value: fmtINR(d.employerCosts.gratuity) },
      { label: 'Bonus', value: fmtINR(d.earnings.bonus) },
    ];

    const ctcColW = w / 3;
    for (let i = 0; i < ctcRows.length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = m + col * ctcColW;
      const ry = y + row * 14;
      doc.font('Helvetica').fontSize(7).fillColor('#6B7280');
      doc.text(ctcRows[i].label, x + 10, ry + 2);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#1F2937');
      doc.text(ctcRows[i].value, x + 100, ry + 2);
    }
    y += Math.ceil(ctcRows.length / 3) * 14 + 4;

    this.hLine(y, '#D1D5DB', 0.3);
    y += 4;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1E3A5F');
    doc.text(`CTC (Monthly): ${fmtINR(d.totals.ctcMonthly)}`, m + 10, y);
    doc.text(`CTC (Annual): ${fmtINR(d.totals.ctcYearly)}`, m + 10, y, { width: w - 20, align: 'right' });
    y += 18;

    this.hLine(y, '#D1D5DB', 0.3);
    y += 30;

    doc.font('Helvetica').fontSize(8).fillColor('#6B7280');
    doc.text('For THERMOPAC', m, y, { width: w - 20, align: 'right' });
    y += 40;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1F2937');
    doc.text('Authorized Signatory', m, y, { width: w - 20, align: 'right' });

    y += 20;
    doc.font('Helvetica').fontSize(6.5).fillColor('#9CA3AF');
    doc.text('This is a computer-generated document and does not require a physical signature.', m, y, { width: w, align: 'center' });

    const footerY = this.ph - 42;
    this.hLine(footerY - 5, '#1E3A5F', 0.8);
    doc.font('Helvetica').fontSize(6.5).fillColor('#6B7280');
    doc.text(
      'THERMOPAC  |  L 4, 405 The Summit Business Bay, Vile Parle, Western Express Highway, Mumbai 400 057',
      m, footerY, { align: 'center', width: w }
    );
    doc.text(
      'Tel: +91 22 2617 8080-84  |  Fax: +91 22 2617 8084  |  Email: sales@thermopac.in',
      m, footerY + 10, { align: 'center', width: w }
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
