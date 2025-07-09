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
  };
  totals: {
    grossEarnings: number;
    totalDeductions: number;
    netPay: number;
  };
  netPayInWords: string;
}

export class SalarySlipGenerator {
  private doc: PDFDocument;
  private pageWidth: number = 595.28; // A4 width
  private pageHeight: number = 841.89; // A4 height
  private margin: number = 50;
  private contentWidth: number;

  constructor() {
    this.doc = new PDFDocument({ size: 'A4', margin: this.margin });
    this.contentWidth = this.pageWidth - (this.margin * 2);
  }

  async generateSalarySlip(data: SalarySlipData, res: Response): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 
          `attachment; filename="Salary_Slip_${data.employee.name.replace(/\s+/g, '_')}_${data.period.month}_${data.period.year}.pdf"`
        );

        // Pipe the PDF to response
        this.doc.pipe(res);

        // Generate PDF content
        this.addHeader(data);
        this.addEmployeeDetails(data);
        this.addSalaryDetails(data);
        this.addFooter(data);

        // Finalize the PDF
        this.doc.end();
        
        this.doc.on('end', () => {
          resolve();
        });

        this.doc.on('error', (error) => {
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private addHeader(data: SalarySlipData): void {
    // Company logo and name
    this.doc.fontSize(20)
           .font('Helvetica-Bold')
           .text(data.company.name, this.margin, this.margin, { align: 'center' });

    this.doc.fontSize(10)
           .font('Helvetica')
           .text(data.company.address, this.margin, this.margin + 30, { align: 'center' });

    // Title
    this.doc.fontSize(16)
           .font('Helvetica-Bold')
           .text('SALARY SLIP', this.margin, this.margin + 60, { align: 'center' });

    // Period
    this.doc.fontSize(12)
           .text(`For the month of ${data.period.month} ${data.period.year}`, 
                  this.margin, this.margin + 85, { align: 'center' });

    // Horizontal line
    this.doc.moveTo(this.margin, this.margin + 110)
           .lineTo(this.pageWidth - this.margin, this.margin + 110)
           .stroke();
  }

  private addEmployeeDetails(data: SalarySlipData): void {
    const startY = this.margin + 130;
    const leftColumn = this.margin;
    const rightColumn = this.margin + (this.contentWidth / 2);

    this.doc.fontSize(10).font('Helvetica-Bold');

    // Left column
    this.doc.text('Employee Name:', leftColumn, startY);
    this.doc.font('Helvetica').text(data.employee.name, leftColumn + 80, startY);

    this.doc.font('Helvetica-Bold').text('Employee Code:', leftColumn, startY + 20);
    this.doc.font('Helvetica').text(data.employee.employeeCode, leftColumn + 80, startY + 20);

    this.doc.font('Helvetica-Bold').text('Designation:', leftColumn, startY + 40);
    this.doc.font('Helvetica').text(data.employee.designation, leftColumn + 80, startY + 40);

    this.doc.font('Helvetica-Bold').text('Department:', leftColumn, startY + 60);
    this.doc.font('Helvetica').text(data.employee.department, leftColumn + 80, startY + 60);

    // Right column
    this.doc.font('Helvetica-Bold').text('Date of Joining:', rightColumn, startY);
    this.doc.font('Helvetica').text(data.employee.joiningDate, rightColumn + 80, startY);

    this.doc.font('Helvetica-Bold').text('Working Days:', rightColumn, startY + 20);
    this.doc.font('Helvetica').text(data.period.workingDays.toString(), rightColumn + 80, startY + 20);

    this.doc.font('Helvetica-Bold').text('Paid Days:', rightColumn, startY + 40);
    this.doc.font('Helvetica').text(data.period.paidDays.toString(), rightColumn + 80, startY + 40);

    if (data.employee.panNumber) {
      this.doc.font('Helvetica-Bold').text('PAN:', rightColumn, startY + 60);
      this.doc.font('Helvetica').text(data.employee.panNumber, rightColumn + 80, startY + 60);
    }

    // Horizontal line
    this.doc.moveTo(this.margin, startY + 90)
           .lineTo(this.pageWidth - this.margin, startY + 90)
           .stroke();
  }

  private addSalaryDetails(data: SalarySlipData): void {
    const startY = this.margin + 250;
    const columnWidth = this.contentWidth / 4;

    // Table headers
    this.doc.fontSize(11).font('Helvetica-Bold');
    this.doc.text('EARNINGS', this.margin, startY);
    this.doc.text('AMOUNT (₹)', this.margin + columnWidth * 1.5, startY, { align: 'right', width: columnWidth });
    this.doc.text('DEDUCTIONS', this.margin + columnWidth * 2.5, startY);
    this.doc.text('AMOUNT (₹)', this.margin + columnWidth * 3.5, startY, { align: 'right', width: columnWidth });

    // Table lines
    this.doc.moveTo(this.margin, startY + 15)
           .lineTo(this.pageWidth - this.margin, startY + 15)
           .stroke();

    this.doc.moveTo(this.margin + columnWidth * 2, startY - 5)
           .lineTo(this.margin + columnWidth * 2, startY + 400)
           .stroke();

    let currentY = startY + 25;
    this.doc.fontSize(10).font('Helvetica');

    // Earnings
    const earnings = [
      ['Basic Salary', data.earnings.basicSalary],
      ['House Rent Allowance', data.earnings.hra],
      ['Conveyance Allowance', data.earnings.conveyanceAllowance],
      ['LTA Allowance', data.earnings.ltaAllowance],
      ['Special Allowance', data.earnings.specialAllowance],
      ['Supplementary Allowance', data.earnings.supplementaryAllowance],
      ['KGP Allowance', data.earnings.kgpAllowance],
      ['Overtime Pay', data.earnings.overtimePay],
      ['Bonus', data.earnings.bonus],
      ['Other Allowances', data.earnings.otherAllowances]
    ];

    // Deductions
    const deductions = [
      ['Provident Fund', data.deductions.providentFund],
      ['Professional Tax', data.deductions.professionalTax],
      ['Income Tax (TDS)', data.deductions.incomeTax],
      ['ESIC', data.deductions.esic],
      ['Group Insurance', data.deductions.groupInsurance],
      ['Other Deductions', data.deductions.otherDeductions]
    ];

    // Add earnings
    earnings.forEach(([label, amount], index) => {
      if (amount > 0) {
        this.doc.text(label, this.margin, currentY);
        this.doc.text(amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 
                     this.margin + columnWidth * 1.5, currentY, { align: 'right', width: columnWidth });
        currentY += 18;
      }
    });

    // Add deductions
    let deductionY = startY + 25;
    deductions.forEach(([label, amount], index) => {
      if (amount > 0) {
        this.doc.text(label, this.margin + columnWidth * 2.5, deductionY);
        this.doc.text(amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 
                     this.margin + columnWidth * 3.5, deductionY, { align: 'right', width: columnWidth });
        deductionY += 18;
      }
    });

    // Totals section
    const totalsY = Math.max(currentY, deductionY) + 20;
    
    this.doc.moveTo(this.margin, totalsY)
           .lineTo(this.pageWidth - this.margin, totalsY)
           .stroke();

    this.doc.fontSize(11).font('Helvetica-Bold');
    this.doc.text('GROSS EARNINGS', this.margin, totalsY + 10);
    this.doc.text(data.totals.grossEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 
                 this.margin + columnWidth * 1.5, totalsY + 10, { align: 'right', width: columnWidth });

    this.doc.text('TOTAL DEDUCTIONS', this.margin + columnWidth * 2.5, totalsY + 10);
    this.doc.text(data.totals.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 
                 this.margin + columnWidth * 3.5, totalsY + 10, { align: 'right', width: columnWidth });

    // Net Pay
    this.doc.moveTo(this.margin, totalsY + 35)
           .lineTo(this.pageWidth - this.margin, totalsY + 35)
           .stroke();

    this.doc.fontSize(12).font('Helvetica-Bold');
    this.doc.text('NET PAY', this.margin, totalsY + 45);
    this.doc.text(data.totals.netPay.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 
                 this.margin + columnWidth * 3.5, totalsY + 45, { align: 'right', width: columnWidth });

    // Net pay in words
    this.doc.fontSize(10).font('Helvetica');
    this.doc.text(`Net Pay in Words: ${data.netPayInWords}`, this.margin, totalsY + 70, 
                 { width: this.contentWidth });
  }

  private addFooter(data: SalarySlipData): void {
    const footerY = this.pageHeight - 150;

    this.doc.moveTo(this.margin, footerY)
           .lineTo(this.pageWidth - this.margin, footerY)
           .stroke();

    this.doc.fontSize(10).font('Helvetica');
    this.doc.text('This is a computer-generated salary slip and does not require a signature.', 
                 this.margin, footerY + 20, { align: 'center' });

    // Bank details if available
    if (data.employee.bankAccount) {
      this.doc.text(`Bank Account: ${data.employee.bankAccount}`, 
                   this.margin, footerY + 40, { align: 'center' });
    }

    this.doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 
                 this.margin, footerY + 60, { align: 'center' });
  }
}

// Helper function to convert number to words
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

  if (crores > 0) {
    result += convertHundreds(crores) + 'Crore ';
  }
  if (lakhs > 0) {
    result += convertHundreds(lakhs) + 'Lakh ';
  }
  if (thousands > 0) {
    result += convertHundreds(thousands) + 'Thousand ';
  }
  if (hundreds > 0) {
    result += convertHundreds(hundreds);
  }

  if (result.trim()) {
    result += 'Rupees ';
  }

  if (paise > 0) {
    result += convertHundreds(paise) + 'Paise ';
  }

  return result.trim() + ' Only';
}