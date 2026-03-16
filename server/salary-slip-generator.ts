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

function fmtINR(num: number): string {
  return Math.round(num).toLocaleString('en-IN');
}

function fmtDec(num: number): string {
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export class SalarySlipGenerator {
  private doc: typeof PDFDocument.prototype;
  private pw: number = 595.28;
  private ph: number = 841.89;
  private m: number = 40;
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

  private textR(text: string, x: number, y: number, width: number) {
    this.doc.text(text, x, y, { width, align: 'right' });
  }

  private render(d: SalarySlipData): void {
    const doc = this.doc;
    const m = this.m;
    const w = this.w;
    const rightHalf = m + 310;

    const today = new Date();
    const dateStr = `${today.getDate()}-${today.toLocaleString('en-IN', { month: 'long' })}-${today.getFullYear()}`;

    let y = m;

    doc.fontSize(11).font('Helvetica');
    doc.text(`To ${d.employee.name}`, m, y);
    this.textR(`Date: ${dateStr}`, m, y, w);
    y += 30;

    doc.moveTo(m, y).lineTo(m + w, y).lineWidth(0.5).stroke();
    y += 10;

    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('SL.', m, y, { width: 25 });
    doc.text('Description', m + 25, y, { width: 165 });
    this.textR('Basic', m + 190, y, 80);
    this.textR('Earned Salary', m + 270, y, 80);
    this.textR('Salary Deduction', rightHalf, y, w - 310);
    y += 14;
    doc.moveTo(m, y).lineTo(m + w, y).lineWidth(0.3).stroke();
    y += 10;

    const lineH = 16;
    let leftY = y;
    let rightY = y;

    const earnedRows = [
      { n: 1, label: 'Basic', basic: d.earnings.basicSalary, earned: d.earnings.basicSalary },
      { n: 2, label: 'HRA', basic: d.earnings.hra, earned: d.earnings.hra },
      { n: 3, label: 'Conveyance', basic: d.earnings.conveyanceAllowance, earned: d.earnings.conveyanceAllowance },
      { n: 4, label: 'LTA', basic: d.earnings.ltaAllowance, earned: d.earnings.ltaAllowance },
      { n: 5, label: 'Special Allowance', basic: d.earnings.specialAllowance, earned: d.earnings.specialAllowance },
      { n: 6, label: 'Supplementary Allowance', basic: d.earnings.supplementaryAllowance, earned: d.earnings.supplementaryAllowance },
    ];

    const dedRows = [
      { n: 1, label: 'PT', amount: d.deductions.professionalTax },
      { n: 2, label: 'PF Employee', amount: d.deductions.providentFund },
      { n: 3, label: 'ESIC Employee', amount: d.deductions.esic },
      { n: 3, label: 'T.D.S.', amount: d.deductions.incomeTax },
      { n: 4, label: 'Loan Deduction', amount: d.deductions.loanDeduction },
      { n: 5, label: 'Advance', amount: d.deductions.advanceDeduction },
    ];

    doc.font('Helvetica').fontSize(8);

    doc.font('Helvetica-Bold').fontSize(8);
    this.textR('Earned Salary', rightHalf, rightY, 120);
    doc.font('Helvetica').fontSize(8);
    this.textR(String.fromCharCode(8377) + fmtDec(d.totals.grossEarnings), rightHalf + 120, rightY, w - 430);
    rightY += lineH;

    for (let i = 0; i < earnedRows.length; i++) {
      const row = earnedRows[i];
      doc.font('Helvetica').fontSize(8);

      doc.text(`${row.n}.`, m + 25, leftY, { width: 15 });
      doc.text(row.label, m + 40, leftY, { width: 150 });
      this.textR(fmtINR(row.basic), m + 190, leftY, 80);
      this.textR(fmtDec(row.earned), m + 270, leftY, 80);

      if (i < dedRows.length) {
        const ded = dedRows[i];
        doc.text(`${ded.n}.`, rightHalf, rightY, { width: 18 });
        doc.text(ded.label, rightHalf + 18, rightY, { width: 90 });
        doc.text('-', rightHalf + 108, rightY, { width: 15 });
        this.textR(String.fromCharCode(8377) + fmtDec(ded.amount), rightHalf + 120, rightY, w - 430);
        rightY += lineH;
      }

      leftY += lineH;
    }

    for (let i = earnedRows.length; i < dedRows.length; i++) {
      const ded = dedRows[i];
      doc.text(`${ded.n}.`, rightHalf, rightY, { width: 18 });
      doc.text(ded.label, rightHalf + 18, rightY, { width: 90 });
      doc.text('-', rightHalf + 108, rightY, { width: 15 });
      this.textR(String.fromCharCode(8377) + fmtDec(ded.amount), rightHalf + 120, rightY, w - 430);
      rightY += lineH;
    }

    leftY += 4;

    const kgpEarned = d.kgpPercent > 0 ? d.earnings.kgpAllowance : 0;
    const costRows = [
      { n: 7, label: `KGP Allowance        ${d.kgpPercent}%`, basic: fmtINR(d.earnings.kgpAllowance), earned: fmtDec(kgpEarned), showEarned: true },
      { n: 8, label: 'ESIC Employer Contribution', basic: fmtINR(d.employerCosts.esicEmployer), earned: '', showEarned: false },
      { n: 9, label: 'Group Insurance Cost', basic: fmtINR(d.employerCosts.groupInsurance), earned: '', showEarned: false },
      { n: 10, label: 'PF_Employer Contribution', basic: fmtINR(d.employerCosts.pfEmployer), earned: '', showEarned: false },
      { n: 11, label: 'Bonus', basic: fmtINR(d.earnings.bonus), earned: '', showEarned: false },
      { n: 12, label: 'Gratuity', basic: fmtINR(d.employerCosts.gratuity), earned: '', showEarned: false },
    ];

    rightY += 8;
    doc.font('Helvetica-Bold').fontSize(9);
    this.textR(`Take Home Salary: ${String.fromCharCode(8377)} ${fmtDec(d.totals.netPay)}`, rightHalf, rightY, w - 310);
    rightY += lineH + 6;
    doc.font('Helvetica').fontSize(8);

    const attendanceRows = [
      { n: 1, label: 'DayInMonth:', value: d.period.daysInMonth.toString() },
      { n: 2, label: 'Holidays :', value: d.period.holidays.toString() },
      { n: 3, label: 'Weekly Off:', value: d.period.weeklyOffs.toString() },
      { n: 4, label: 'Absent Day:', value: d.period.absentDays.toFixed(2) },
      { n: 5, label: 'Present Days:', value: d.period.presentDays.toFixed(2) },
      { n: 6, label: 'Paid Days:', value: d.period.paidDays.toFixed(2) },
      { n: 7, label: 'CL Balance:', value: d.period.clBalance.toFixed(2) },
    ];

    let attIdx = 0;

    for (let i = 0; i < costRows.length; i++) {
      const row = costRows[i];
      doc.font('Helvetica').fontSize(8);
      doc.text(`${row.n}.`, m + 25, leftY, { width: 15 });
      doc.text(row.label, m + 40, leftY, { width: 150 });
      this.textR(row.basic, m + 190, leftY, 80);
      if (row.showEarned) {
        this.textR(row.earned, m + 270, leftY, 80);
      }

      if (attIdx < attendanceRows.length) {
        const att = attendanceRows[attIdx];
        doc.text(`${att.n}.`, rightHalf, rightY, { width: 18 });
        doc.text(att.label, rightHalf + 22, rightY, { width: 80 });
        this.textR(att.value, rightHalf + 100, rightY, 40);
        doc.text('--E', rightHalf + 150, rightY, { width: 25 });
        rightY += lineH;
        attIdx++;
      }

      leftY += lineH;
    }

    for (; attIdx < attendanceRows.length; attIdx++) {
      const att = attendanceRows[attIdx];
      doc.text(`${att.n}.`, rightHalf, rightY, { width: 18 });
      doc.text(att.label, rightHalf + 22, rightY, { width: 80 });
      this.textR(att.value, rightHalf + 100, rightY, 40);
      doc.text('--E', rightHalf + 150, rightY, { width: 25 });
      rightY += lineH;
    }

    leftY += 6;
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('13.', m + 25, leftY, { width: 15 });
    doc.text('CTC Monthly', m + 40, leftY, { width: 150 });
    this.textR(fmtINR(d.totals.ctcMonthly), m + 190, leftY, 80);
    leftY += lineH;

    doc.text('14.', m + 25, leftY, { width: 15 });
    doc.text('CTC', m + 40, leftY, { width: 150 });
    this.textR(fmtINR(d.totals.ctcYearly), m + 190, leftY, 80);
    leftY += lineH;

    const signY = Math.max(leftY, rightY) + 40;
    doc.font('Helvetica').fontSize(9);
    this.textR('For Thermopac', m, signY, w);
    doc.font('Helvetica-Bold').fontSize(9);
    this.textR('General Manager', m, signY + 50, w);

    const footerY = this.ph - 55;
    doc.moveTo(m, footerY - 5).lineTo(m + w, footerY - 5).lineWidth(0.3).stroke();
    doc.font('Helvetica').fontSize(7);
    doc.text(
      'THERMOPAC Office: L 4, 405 The Summit Business Bay, Vile Parle Western Express Highway Vile Parle Mumbai India 400 057',
      m, footerY, { align: 'center', width: w }
    );
    doc.text(
      'Tel: + 91 22 2617 8080 to 84  Fax: + 91 22 2617 8084  E-Mail - sales@thermopac.in',
      m, footerY + 10, { align: 'center', width: w }
    );
    this.textR('Page #1', m, footerY + 10, w);
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
