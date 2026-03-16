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

export class SalarySlipGenerator {
  private doc: typeof PDFDocument.prototype;
  private pageWidth: number = 595.28;
  private pageHeight: number = 841.89;
  private margin: number = 40;
  private contentWidth: number;

  constructor() {
    this.doc = new PDFDocument({ size: 'A4', margin: this.margin });
    this.contentWidth = this.pageWidth - (this.margin * 2);
  }

  private fmt(num: number): string {
    return Math.round(num).toLocaleString('en-IN');
  }

  private fmtDec(num: number): string {
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async generateSalarySlip(data: SalarySlipData, res: Response): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const fileName = `Salary_Slip_${data.employee.name.replace(/\s+/g, '_')}_${data.period.month}_${data.period.year}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        this.doc.pipe(res);

        this.drawSlip(data);

        this.doc.end();
        this.doc.on('end', () => resolve());
        this.doc.on('error', (error: any) => reject(error));
      } catch (error) {
        reject(error);
      }
    });
  }

  private drawSlip(data: SalarySlipData): void {
    const d = this.doc;
    const m = this.margin;
    const w = this.contentWidth;
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    let y = m;

    d.fontSize(10).font('Helvetica');
    d.text(`To ${data.employee.name}`, m, y);
    d.text(`Date: ${dateStr}`, m, y, { align: 'right', width: w });
    y += 25;

    d.moveTo(m, y).lineTo(m + w, y).lineWidth(0.5).stroke();
    y += 8;

    const col1X = m;
    const col2X = m + 200;
    const col3X = m + 310;
    const col4X = m + 370;

    d.fontSize(8).font('Helvetica-Bold');
    d.text('SL.', col1X, y, { width: 25 });
    d.text('Description', col1X + 25, y, { width: 160 });
    d.text('Basic', col2X, y, { width: 100, align: 'right' });
    d.text('Earned Salary', col3X, y, { width: 100, align: 'right' });
    d.text('Salary Deduction', col4X + 30, y, { width: 120, align: 'right' });
    y += 15;

    d.moveTo(m, y).lineTo(m + w, y).lineWidth(0.3).stroke();
    y += 8;

    d.font('Helvetica').fontSize(8);

    const basicFull = data.earnings.basicSalary;
    const earnedItems = [
      { label: 'Basic', basic: this.fmt(basicFull), earned: this.fmtDec(basicFull) },
      { label: 'HRA', basic: this.fmt(data.earnings.hra), earned: this.fmtDec(data.earnings.hra) },
      { label: 'Conveyance', basic: this.fmt(data.earnings.conveyanceAllowance), earned: this.fmtDec(data.earnings.conveyanceAllowance) },
      { label: 'LTA', basic: this.fmt(data.earnings.ltaAllowance), earned: this.fmtDec(data.earnings.ltaAllowance) },
      { label: 'Special Allowance', basic: this.fmt(data.earnings.specialAllowance), earned: this.fmtDec(data.earnings.specialAllowance) },
      { label: 'Supplementary Allowance', basic: this.fmt(data.earnings.supplementaryAllowance), earned: this.fmtDec(data.earnings.supplementaryAllowance) },
    ];

    const deductionItems = [
      { label: 'PT', amount: data.deductions.professionalTax },
      { label: 'PF Employee', amount: data.deductions.providentFund },
      { label: 'ESIC Employee', amount: data.deductions.esic },
      { label: 'T.D.S.', amount: data.deductions.incomeTax },
      { label: 'Loan Deduction', amount: data.deductions.loanDeduction },
      { label: 'Advance', amount: data.deductions.advanceDeduction },
    ];

    const employerItems = [
      { label: `KGP Allowance        ${data.kgpPercent}%`, basic: this.fmt(data.earnings.kgpAllowance), earned: this.fmtDec(data.earnings.kgpAllowance > 0 ? data.earnings.kgpAllowance : 0) },
      { label: 'ESIC Employer Contribution', basic: this.fmt(data.employerCosts.esicEmployer), earned: '' },
      { label: 'Group Insurance Cost', basic: this.fmt(data.employerCosts.groupInsurance), earned: '' },
      { label: 'PF_Employer Contribution', basic: this.fmt(data.employerCosts.pfEmployer), earned: '' },
      { label: 'Bonus', basic: this.fmt(data.earnings.bonus), earned: '' },
      { label: 'Gratuity', basic: this.fmt(data.employerCosts.gratuity), earned: '' },
    ];

    const attendanceItems = [
      { label: 'DayInMonth:', value: data.period.daysInMonth.toString() },
      { label: 'Holidays :', value: data.period.holidays.toString() },
      { label: 'Weekly Off:', value: data.period.weeklyOffs.toString() },
      { label: 'Absent Day:', value: data.period.absentDays.toFixed(2) },
      { label: 'Present Days:', value: data.period.presentDays.toFixed(2) },
      { label: 'Paid Days:', value: data.period.paidDays.toFixed(2) },
      { label: 'CL Balance:', value: data.period.clBalance.toFixed(2) },
    ];

    let leftY = y;
    let rightY = y;
    let slNo = 1;

    for (let i = 0; i < earnedItems.length; i++) {
      const item = earnedItems[i];
      d.font('Helvetica').fontSize(8);
      d.text(`${slNo}`, col1X, leftY, { width: 20 });
      d.text(`${i + 1}. ${item.label}`, col1X + 20, leftY, { width: 170 });
      d.text(item.basic, col2X, leftY, { width: 100, align: 'right' });
      d.text(item.earned, col3X, leftY, { width: 100, align: 'right' });

      if (i === 0) {
        d.font('Helvetica-Bold').fontSize(8);
        d.text(`Earned Salary`, col4X + 30, rightY, { width: 75 });
        d.text(`₹${this.fmtDec(data.totals.grossEarnings)}`, col4X + 105, rightY, { width: 60, align: 'right' });
        rightY += 14;
      }

      if (i < deductionItems.length) {
        const ded = deductionItems[i];
        d.font('Helvetica').fontSize(8);
        d.text(`${i + 1}.`, col4X + 30, rightY, { width: 15 });
        d.text(ded.label, col4X + 45, rightY, { width: 75 });
        d.text(`-`, col4X + 110, rightY, { width: 15, align: 'right' });
        d.text(`₹${this.fmtDec(ded.amount)}`, col4X + 115, rightY, { width: 50, align: 'right' });
        rightY += 14;
      }

      if (i === 0) slNo = 1;
      leftY += 14;
    }

    leftY += 4;
    d.font('Helvetica').fontSize(8);
    for (let i = 0; i < employerItems.length; i++) {
      const item = employerItems[i];
      d.text(`${earnedItems.length + i + 1}. ${item.label}`, col1X + 20, leftY, { width: 170 });
      d.text(item.basic, col2X, leftY, { width: 100, align: 'right' });
      if (item.earned) {
        d.text(item.earned, col3X, leftY, { width: 100, align: 'right' });
      }

      if (i === 0) {
        rightY += 10;
        d.font('Helvetica-Bold').fontSize(9);
        d.text(`Take Home Salary: ₹ ${this.fmtDec(data.totals.netPay)}`, col4X + 30, rightY, { width: 135, align: 'right' });
        rightY += 18;
      }

      if (i >= 1 && (i - 1) < attendanceItems.length) {
        const att = attendanceItems[i - 1];
        d.font('Helvetica').fontSize(8);
        d.text(`${i}.`, col4X + 30, rightY, { width: 15 });
        d.text(att.label, col4X + 45, rightY, { width: 75 });
        d.text(att.value, col4X + 120, rightY, { width: 30, align: 'right' });
        d.text('--E', col4X + 150, rightY, { width: 20, align: 'right' });
        rightY += 14;
      }
      leftY += 14;
    }

    for (let i = employerItems.length - 1; i < attendanceItems.length; i++) {
      const att = attendanceItems[i];
      d.font('Helvetica').fontSize(8);
      d.text(`${i + 1}.`, col4X + 30, rightY, { width: 15 });
      d.text(att.label, col4X + 45, rightY, { width: 75 });
      d.text(att.value, col4X + 120, rightY, { width: 30, align: 'right' });
      d.text('--E', col4X + 150, rightY, { width: 20, align: 'right' });
      rightY += 14;
    }

    leftY += 4;
    d.font('Helvetica-Bold').fontSize(8);
    d.text(`${earnedItems.length + employerItems.length + 1}. CTC Monthly`, col1X + 20, leftY, { width: 170 });
    d.text(this.fmt(data.totals.ctcMonthly), col2X, leftY, { width: 100, align: 'right' });
    leftY += 14;

    d.text(`${earnedItems.length + employerItems.length + 2}. CTC`, col1X + 20, leftY, { width: 170 });
    d.text(this.fmt(data.totals.ctcYearly), col2X, leftY, { width: 100, align: 'right' });
    leftY += 20;

    const bottomY = Math.max(leftY, rightY) + 20;

    d.font('Helvetica').fontSize(9);
    d.text('For Thermopac', m + w - 120, bottomY, { width: 120, align: 'right' });
    d.text('', m + w - 120, bottomY + 30, { width: 120, align: 'right' });
    d.text('', m + w - 120, bottomY + 40, { width: 120, align: 'right' });
    d.font('Helvetica-Bold').fontSize(9);
    d.text('General Manager', m + w - 120, bottomY + 50, { width: 120, align: 'right' });

    const footerY = this.pageHeight - 60;
    d.moveTo(m, footerY - 10).lineTo(m + w, footerY - 10).lineWidth(0.3).stroke();
    d.font('Helvetica').fontSize(7);
    d.text(
      'THERMOPAC Office: L 4, 405 The Summit Business Bay, Vile Parle Western Express Highway Vile Parle Mumbai India 400 057',
      m, footerY, { align: 'center', width: w }
    );
    d.text(
      'Tel: + 91 22 2617 8080 to 84  Fax: + 91 22 2617 8084  E-Mail - sales@thermopac.in',
      m, footerY + 12, { align: 'center', width: w }
    );

    d.fontSize(7).text(`Page #1`, m + w - 40, footerY + 12, { width: 40, align: 'right' });
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
    if (num > 0) {
      result += ones[num] + ' ';
    }
    return result;
  }

  if (amount === 0) return 'Zero Rupees Only';

  const crores = Math.floor(amount / 10000000);
  const lakhs = Math.floor((amount % 10000000) / 100000);
  const thousands = Math.floor((amount % 100000) / 1000);
  const hundreds = amount % 1000;
  const paise = Math.round((amount % 1) * 100);

  let result = '';
  if (crores > 0) result += convertHundreds(crores) + 'Crore ';
  if (lakhs > 0) result += convertHundreds(lakhs) + 'Lakh ';
  if (thousands > 0) result += convertHundreds(thousands) + 'Thousand ';
  if (hundreds > 0) result += convertHundreds(hundreds);
  if (result.trim()) result += 'Rupees ';
  if (paise > 0) result += convertHundreds(paise) + 'Paise ';

  return result.trim() + ' Only';
}
