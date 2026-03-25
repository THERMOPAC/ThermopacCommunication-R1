import PDFDocument from 'pdfkit';
import { Response } from 'express';

const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

const COLORS = {
  primary: '#1a365d',
  secondary: '#2b6cb0',
  accent: '#e2e8f0',
  headerBg: '#1a365d',
  headerText: '#ffffff',
  tableBorder: '#cbd5e0',
  tableHeaderBg: '#edf2f7',
  lightBg: '#f7fafc',
  text: '#1a202c',
  muted: '#718096',
  success: '#276749',
  warning: '#c05621',
  danger: '#c53030',
};

interface AppraisalReportData {
  appraisal: any;
  cycle: any;
  kpis: any[];
  competencies: any[];
  approvals: any[];
  score: {
    kpiWeightedScore: number;
    competencyAvgScore: number;
    overallCalculatedScore: number;
    effectiveScore: number;
    l2OverrideScore: number | null;
    l2OverrideReason: string | null;
    ratingBand: string;
    selfAssessment: { kpiSelfWeightedScore: number; competencySelfAvgScore: number; overallSelfScore: number };
  };
}

function fmt(val: any, fallback = '—'): string {
  if (val === null || val === undefined || val === '' || val === 'null') return fallback;
  return String(val);
}

function fmtScore(val: any): string {
  if (val === null || val === undefined) return '—';
  const n = parseFloat(val);
  return isNaN(n) ? '—' : n.toFixed(2);
}

function fmtDate(val: any): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

function fmtDateTime(val: any): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return '—'; }
}

function ratingLabel(band: string): string {
  const map: Record<string, string> = {
    excellent: 'Excellent', very_good: 'Very Good', good: 'Good', fair: 'Fair', poor: 'Needs Improvement'
  };
  return map[band] || band;
}

function ratingColor(band: string): string {
  const map: Record<string, string> = {
    excellent: COLORS.success, very_good: '#2f855a', good: COLORS.secondary, fair: COLORS.warning, poor: COLORS.danger
  };
  return map[band] || COLORS.text;
}

function normalizeBool(val: any, trueLabel = 'Yes', falseLabel = 'No'): string {
  if (val === true || val === 'true' || val === 'yes' || val === 'Yes') return trueLabel;
  if (val === false || val === 'false' || val === 'no' || val === 'No') return falseLabel;
  if (!val) return 'Not Applicable';
  return String(val);
}

function normalizeRecommendation(val: any): string {
  if (!val || val === '' || val === 'null' || val === 'none') return 'Not Applicable';
  return String(val);
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: 'Draft', open: 'Open', self_submitted: 'Self Submitted', l1_reviewed: 'L1 Reviewed',
    l2_reviewed: 'L2 Reviewed', approved: 'Approved', closed: 'Closed', revision_requested: 'Revision Requested'
  };
  return map[s] || s;
}

export class AppraisalReportGenerator {
  private doc!: typeof PDFDocument.prototype;
  private currentY = 0;
  private pageNum = 0;
  private totalPages = 0;
  private pageWidth = 595.28;
  private pageHeight = 841.89;
  private margin = 45;
  private contentWidth: number;
  private data!: AppraisalReportData;
  private footerText = '';

  constructor() {
    this.contentWidth = this.pageWidth - this.margin * 2;
  }

  async generate(data: AppraisalReportData, res: Response): Promise<void> {
    this.data = data;
    const a = data.appraisal;
    const fy = data.cycle?.financialYear || 'Unknown';
    const empCode = a.employeeCode || 'EMP';
    const filename = `Appraisal_Report_${empCode}_${fy.replace(/\//g, '-')}.pdf`;
    this.footerText = `THERMOPAC HRMS — Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    this.doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 60, left: this.margin, right: this.margin }, bufferPages: true });
    this.doc.pipe(res);

    this.currentY = 50;
    this.pageNum = 1;

    this.drawHeader();
    this.drawEmployeeInfo();
    this.drawCycleInfo();
    this.drawReviewHierarchy();
    this.drawFinalOutcome();
    this.drawScoreSummary();
    this.drawKpiTable();
    this.drawCompetencyTable();
    this.drawSelfAssessment();
    this.drawReviewerComments();
    this.drawFinalDecision();
    this.drawApprovalHistory();
    this.drawSignOff();

    this.totalPages = this.doc.bufferedPageRange().count;
    for (let i = 0; i < this.totalPages; i++) {
      this.doc.switchToPage(i);
      this.drawFooter(i + 1);
    }

    this.doc.end();
  }

  private checkPageBreak(needed: number) {
    if (this.currentY + needed > this.pageHeight - 70) {
      this.doc.addPage();
      this.pageNum++;
      this.currentY = 50;
    }
  }

  private drawFooter(page: number) {
    const y = this.pageHeight - 35;
    this.doc.font(FONT_REGULAR).fontSize(7).fillColor(COLORS.muted);
    this.doc.text(this.footerText, this.margin, y, { width: this.contentWidth / 2, align: 'left' });
    this.doc.text(`Page ${page} of ${this.totalPages}`, this.margin + this.contentWidth / 2, y, { width: this.contentWidth / 2, align: 'right' });
    this.doc.moveTo(this.margin, y - 5).lineTo(this.margin + this.contentWidth, y - 5).strokeColor(COLORS.tableBorder).lineWidth(0.5).stroke();
  }

  private sectionTitle(title: string) {
    this.checkPageBreak(35);
    this.currentY += 12;
    this.doc.moveTo(this.margin, this.currentY).lineTo(this.margin + this.contentWidth, this.currentY).strokeColor(COLORS.secondary).lineWidth(1).stroke();
    this.currentY += 6;
    this.doc.font(FONT_BOLD).fontSize(11).fillColor(COLORS.primary).text(title, this.margin, this.currentY);
    this.currentY += 18;
  }

  private labelValue(label: string, value: string, x: number, width: number) {
    this.doc.font(FONT_BOLD).fontSize(8).fillColor(COLORS.muted).text(label, x, this.currentY, { width });
    this.doc.font(FONT_REGULAR).fontSize(9).fillColor(COLORS.text).text(value, x, this.currentY + 11, { width });
  }

  private drawHeader() {
    this.doc.rect(this.margin, this.currentY, this.contentWidth, 50).fill(COLORS.headerBg);
    this.doc.font(FONT_BOLD).fontSize(16).fillColor(COLORS.headerText).text('THERMOPAC', this.margin + 15, this.currentY + 10);
    this.doc.font(FONT_REGULAR).fontSize(9).fillColor('#a0aec0').text('Employee Appraisal Final Report', this.margin + 15, this.currentY + 30);
    const fy = this.data.cycle?.financialYear || '';
    if (fy) {
      this.doc.font(FONT_BOLD).fontSize(10).fillColor(COLORS.headerText).text(fy, this.margin + this.contentWidth - 100, this.currentY + 18, { width: 85, align: 'right' });
    }
    this.currentY += 60;
  }

  private drawEmployeeInfo() {
    this.sectionTitle('Employee Information');
    const a = this.data.appraisal;
    const col = this.contentWidth / 4;
    this.labelValue('Employee Name', fmt(a.employeeName), this.margin, col);
    this.labelValue('Employee Code', fmt(a.employeeCode), this.margin + col, col);
    this.labelValue('Department', fmt(a.department), this.margin + col * 2, col);
    this.labelValue('Designation', fmt(a.designation), this.margin + col * 3, col);
    this.currentY += 28;
    this.labelValue('Date of Joining', fmtDate(a.dateOfJoining), this.margin, col);
    this.labelValue('Employment Type', fmt(a.employmentType, 'Not Provided'), this.margin + col, col);
    this.currentY += 28;
  }

  private drawCycleInfo() {
    this.sectionTitle('Appraisal Cycle');
    const c = this.data.cycle;
    const col = this.contentWidth / 4;
    this.labelValue('Cycle Name', fmt(c?.name), this.margin, col);
    this.labelValue('Financial Year', fmt(c?.financialYear), this.margin + col, col);
    this.labelValue('Start Date', fmtDate(c?.startDate), this.margin + col * 2, col);
    this.labelValue('Closure Date', fmtDate(c?.closureDate), this.margin + col * 3, col);
    this.currentY += 28;
  }

  private drawReviewHierarchy() {
    this.sectionTitle('Review Hierarchy');
    const a = this.data.appraisal;
    const col = this.contentWidth / 4;
    this.labelValue('Employee', fmt(a.employeeName), this.margin, col);
    this.labelValue('L1 Reviewer', fmt(a.l1ReviewerName), this.margin + col, col);
    this.labelValue('L2 Reviewer', fmt(a.l2ReviewerName), this.margin + col * 2, col);
    this.labelValue('L3 Approver', fmt(a.l3ApproverName), this.margin + col * 3, col);
    this.currentY += 28;
  }

  private drawFinalOutcome() {
    this.sectionTitle('Final Outcome');
    const a = this.data.appraisal;
    const s = this.data.score;
    this.checkPageBreak(80);

    this.doc.rect(this.margin, this.currentY, this.contentWidth, 60).fill(COLORS.lightBg).stroke(COLORS.tableBorder);

    const col = this.contentWidth / 5;
    const iy = this.currentY + 8;
    this.doc.font(FONT_BOLD).fontSize(7).fillColor(COLORS.muted);
    this.doc.text('Status', this.margin + 10, iy, { width: col });
    this.doc.text('Effective Score', this.margin + col, iy, { width: col });
    this.doc.text('Final Rating', this.margin + col * 2, iy, { width: col });
    this.doc.text('Override Applied', this.margin + col * 3, iy, { width: col });

    this.doc.font(FONT_BOLD).fontSize(12).fillColor(COLORS.text);
    this.doc.text(statusLabel(a.status), this.margin + 10, iy + 14, { width: col });
    this.doc.text(fmtScore(s.effectiveScore), this.margin + col, iy + 14, { width: col });
    this.doc.fillColor(ratingColor(s.ratingBand)).text(ratingLabel(s.ratingBand), this.margin + col * 2, iy + 14, { width: col });

    const overrideApplied = s.l2OverrideScore !== null;
    this.doc.font(FONT_REGULAR).fontSize(9).fillColor(COLORS.text).text(overrideApplied ? 'Yes' : 'No', this.margin + col * 3, iy + 14, { width: col });

    if (overrideApplied) {
      this.doc.font(FONT_REGULAR).fontSize(7).fillColor(COLORS.muted);
      this.doc.text(`Override by: ${fmt(a.l2ReviewerName)}`, this.margin + col * 3, iy + 30, { width: col * 2 - 10 });
      this.doc.text(`Reason: ${fmt(s.l2OverrideReason, 'Not Provided')}`, this.margin + col * 3, iy + 40, { width: col * 2 - 10 });
    }
    this.currentY += 70;
  }

  private drawScoreSummary() {
    this.sectionTitle('Score Summary');
    const s = this.data.score;
    this.checkPageBreak(120);

    const rows = [
      ['Component', 'Self Score', 'Manager Score', 'Weight', 'Weighted Score'],
      ['KPI Performance', fmtScore(s.selfAssessment.kpiSelfWeightedScore), fmtScore(s.kpiWeightedScore), '70%', fmtScore(s.kpiWeightedScore * 0.70)],
      ['Competencies', fmtScore(s.selfAssessment.competencySelfAvgScore), fmtScore(s.competencyAvgScore), '30%', fmtScore(s.competencyAvgScore * 0.30)],
    ];
    this.drawSimpleTable(rows, [this.contentWidth * 0.28, this.contentWidth * 0.18, this.contentWidth * 0.18, this.contentWidth * 0.14, this.contentWidth * 0.22]);

    this.currentY += 6;
    this.doc.font(FONT_REGULAR).fontSize(8).fillColor(COLORS.muted);
    this.doc.text(`Overall Calculated Score: ${fmtScore(s.overallCalculatedScore)} = (KPI × 0.70) + (Competency × 0.30)`, this.margin, this.currentY);
    this.currentY += 12;

    if (s.l2OverrideScore !== null) {
      this.doc.rect(this.margin, this.currentY, this.contentWidth, 35).fill('#fffbeb').stroke('#f6e05e');
      this.doc.font(FONT_BOLD).fontSize(8).fillColor(COLORS.warning).text('Score Override Applied', this.margin + 8, this.currentY + 5);
      this.doc.font(FONT_REGULAR).fontSize(8).fillColor(COLORS.text);
      this.doc.text(`Calculated: ${fmtScore(s.overallCalculatedScore)}  →  Overridden to: ${fmtScore(s.l2OverrideScore)}`, this.margin + 8, this.currentY + 17);
      this.doc.text(`Reason: ${fmt(s.l2OverrideReason, 'Not Provided')}`, this.margin + 250, this.currentY + 17, { width: this.contentWidth - 260 });
      this.currentY += 42;
    }

    this.doc.font(FONT_BOLD).fontSize(9).fillColor(COLORS.primary).text(`Final Effective Score: ${fmtScore(s.effectiveScore)}   |   Rating: ${ratingLabel(s.ratingBand)}`, this.margin, this.currentY);
    this.currentY += 16;
  }

  private drawKpiTable() {
    this.sectionTitle('KPI Evaluation');
    const kpis = this.data.kpis;
    if (!kpis.length) {
      this.doc.font(FONT_REGULAR).fontSize(9).fillColor(COLORS.muted).text('No KPIs recorded.', this.margin, this.currentY);
      this.currentY += 16;
      return;
    }

    const colWidths = [25, 110, 45, 50, 50, 45, 45, 45, 45, 45];
    const headers = ['#', 'KPI Title', 'Weight', 'Target', 'Achieved', 'Self', 'L1', 'L2', 'Final', 'Comment'];

    this.drawTableHeader(headers, colWidths);

    let totalWeight = 0;
    for (let i = 0; i < kpis.length; i++) {
      const k = kpis[i];
      const finalScore = k.managerScore ? parseFloat(k.managerScore) : (k.selfScore ? parseFloat(k.selfScore) : null);
      const comment = fmt(k.managerComments || k.l2Comments, '');
      const shortComment = comment.length > 20 ? comment.substring(0, 18) + '…' : comment;
      const row = [
        String(i + 1),
        fmt(k.kpiTitle),
        fmt(k.weightage) + '%',
        fmt(k.targetValue),
        fmt(k.achievedValue),
        fmtScore(k.selfScore),
        fmtScore(k.managerScore),
        fmtScore(k.l2Score),
        finalScore !== null ? finalScore.toFixed(2) : '—',
        shortComment,
      ];
      this.drawTableRow(row, colWidths, i % 2 === 0);
      totalWeight += parseFloat(k.weightage) || 0;
    }

    this.currentY += 4;
    this.doc.font(FONT_BOLD).fontSize(8).fillColor(COLORS.primary);
    this.doc.text(`Total Weight: ${totalWeight.toFixed(0)}%   |   KPI Weighted Score: ${fmtScore(this.data.score.kpiWeightedScore)}`, this.margin, this.currentY);
    this.currentY += 16;
  }

  private drawCompetencyTable() {
    this.sectionTitle('Competency Evaluation');
    const comps = this.data.competencies;
    if (!comps.length) {
      this.doc.font(FONT_REGULAR).fontSize(9).fillColor(COLORS.muted).text('No competencies recorded.', this.margin, this.currentY);
      this.currentY += 16;
      return;
    }

    const colWidths = [25, 140, 55, 55, 55, 55, 55, 65];
    const headers = ['#', 'Competency', 'Self', 'L1', 'L2', 'Final', 'Comment', ''];

    this.drawTableHeader(headers.slice(0, 7), colWidths.slice(0, 7));

    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      const finalScore = c.managerScore ? parseFloat(c.managerScore) : (c.selfScore ? parseFloat(c.selfScore) : null);
      const comment = fmt(c.managerComments || c.l2Comments, '');
      const shortComment = comment.length > 25 ? comment.substring(0, 23) + '…' : comment;
      const row = [
        String(i + 1),
        fmt(c.competencyName),
        fmtScore(c.selfScore),
        fmtScore(c.managerScore),
        fmtScore(c.l2Score),
        finalScore !== null ? finalScore.toFixed(2) : '—',
        shortComment,
      ];
      this.drawTableRow(row, colWidths.slice(0, 7), i % 2 === 0);
    }

    this.currentY += 4;
    this.doc.font(FONT_BOLD).fontSize(8).fillColor(COLORS.primary);
    this.doc.text(`Competency Average Score: ${fmtScore(this.data.score.competencyAvgScore)}`, this.margin, this.currentY);
    this.currentY += 16;
  }

  private drawSelfAssessment() {
    const narrative = this.data.appraisal.selfAssessmentNarrative;
    if (!narrative) return;
    this.sectionTitle('Self-Assessment Narrative');
    this.checkPageBreak(40);
    this.doc.font(FONT_REGULAR).fontSize(8.5).fillColor(COLORS.text);
    const textHeight = this.doc.heightOfString(narrative, { width: this.contentWidth - 20 });
    const blockHeight = textHeight + 16;
    this.checkPageBreak(Math.min(blockHeight, 200));
    this.doc.rect(this.margin, this.currentY, this.contentWidth, blockHeight).fill(COLORS.lightBg).stroke(COLORS.tableBorder);
    this.doc.font(FONT_REGULAR).fontSize(8.5).fillColor(COLORS.text).text(narrative, this.margin + 10, this.currentY + 8, { width: this.contentWidth - 20 });
    this.currentY += blockHeight + 8;
  }

  private drawReviewerComments() {
    this.sectionTitle('Reviewer Comments & Recommendations');
    const a = this.data.appraisal;

    if (a.l1Comments || a.l1ReviewedAt) {
      this.drawReviewerBlock('L1 Reviewer', a.l1ReviewerName, a.l1ReviewedAt, a.l1Comments, [
        ['Increment Recommendation', normalizeRecommendation(a.l1IncrementRecommendation)],
        ['Promotion Recommendation', normalizeRecommendation(a.l1PromotionRecommendation)],
        ['Training Recommendation', normalizeRecommendation(a.l1TrainingRecommendation)],
      ]);
    }

    if (a.l2Comments || a.l2ReviewedAt) {
      const extra: [string, string][] = [
        ['Override Applied', this.data.score.l2OverrideScore !== null ? 'Yes' : 'No'],
      ];
      if (this.data.score.l2OverrideScore !== null) {
        extra.push(['Override Reason', fmt(this.data.score.l2OverrideReason, 'Not Provided')]);
      }
      extra.push(
        ['Increment Recommendation', normalizeRecommendation(a.l2IncrementRecommendation)],
        ['Promotion Recommendation', normalizeRecommendation(a.l2PromotionRecommendation)],
        ['Training Recommendation', normalizeRecommendation(a.l2TrainingRecommendation)],
      );
      this.drawReviewerBlock('L2 Reviewer', a.l2ReviewerName, a.l2ReviewedAt, a.l2Comments, extra);
    }

    if (a.l3Comments || a.l3FinalRemarks || a.l3ApprovedAt) {
      this.drawReviewerBlock('L3 Approver / Final Authority', a.l3ApproverName, a.l3ApprovedAt,
        a.l3Comments || a.l3FinalRemarks, [
          ['Increment Type', normalizeRecommendation(a.l3IncrementType)],
          ['Increment Value', a.l3IncrementValue ? `${a.l3IncrementValue}%` : 'Not Applicable'],
          ['Promotion Approved', normalizeBool(a.l3PromotionApproved)],
          ['New Designation', fmt(a.l3NewDesignation, 'Not Applicable')],
          ['Effective Date', fmtDate(a.l3EffectiveDate)],
        ]);
    }
  }

  private drawReviewerBlock(title: string, name: string | null, date: any, comments: string | null, fields: [string, string][]) {
    this.checkPageBreak(80);
    this.doc.rect(this.margin, this.currentY, this.contentWidth, 20).fill(COLORS.tableHeaderBg);
    this.doc.font(FONT_BOLD).fontSize(9).fillColor(COLORS.primary).text(title, this.margin + 8, this.currentY + 5);
    this.doc.font(FONT_REGULAR).fontSize(8).fillColor(COLORS.muted).text(`${fmt(name)} — ${fmtDate(date)}`, this.margin + 200, this.currentY + 6);
    this.currentY += 24;

    if (comments) {
      this.doc.font(FONT_REGULAR).fontSize(8).fillColor(COLORS.text).text(comments, this.margin + 8, this.currentY, { width: this.contentWidth - 16 });
      this.currentY += this.doc.heightOfString(comments, { width: this.contentWidth - 16 }) + 8;
    }

    const colW = this.contentWidth / 3;
    for (let i = 0; i < fields.length; i += 3) {
      this.checkPageBreak(20);
      for (let j = 0; j < 3 && i + j < fields.length; j++) {
        const [label, value] = fields[i + j];
        this.doc.font(FONT_BOLD).fontSize(7).fillColor(COLORS.muted).text(label, this.margin + j * colW + 8, this.currentY);
        this.doc.font(FONT_REGULAR).fontSize(8).fillColor(COLORS.text).text(value, this.margin + j * colW + 8, this.currentY + 10, { width: colW - 16 });
      }
      this.currentY += 24;
    }
    this.currentY += 6;
  }

  private drawFinalDecision() {
    this.sectionTitle('Final Decision Summary');
    const a = this.data.appraisal;
    const s = this.data.score;
    this.checkPageBreak(70);

    this.doc.rect(this.margin, this.currentY, this.contentWidth, 55).fill('#f0fff4').stroke('#c6f6d5');

    const col = this.contentWidth / 4;
    const iy = this.currentY + 8;
    const fields = [
      ['Final Rating', ratingLabel(s.ratingBand)],
      ['Effective Score', fmtScore(s.effectiveScore)],
      ['Increment', a.l3IncrementType && a.l3IncrementType !== 'none' ? `${a.l3IncrementType} — ${a.l3IncrementValue || ''}%` : 'Not Applicable'],
      ['Promotion', normalizeBool(a.l3PromotionApproved)],
    ];
    for (let i = 0; i < fields.length; i++) {
      this.doc.font(FONT_BOLD).fontSize(7).fillColor(COLORS.muted).text(fields[i][0], this.margin + i * col + 10, iy);
      this.doc.font(FONT_BOLD).fontSize(10).fillColor(COLORS.text).text(fields[i][1], this.margin + i * col + 10, iy + 12);
    }

    const row2y = iy + 30;
    this.doc.font(FONT_BOLD).fontSize(7).fillColor(COLORS.muted).text('New Designation', this.margin + 10, row2y);
    this.doc.font(FONT_REGULAR).fontSize(8).fillColor(COLORS.text).text(fmt(a.l3NewDesignation, 'Not Applicable'), this.margin + 10, row2y + 10);
    this.doc.font(FONT_BOLD).fontSize(7).fillColor(COLORS.muted).text('Effective Date', this.margin + col + 10, row2y);
    this.doc.font(FONT_REGULAR).fontSize(8).fillColor(COLORS.text).text(fmtDate(a.l3EffectiveDate), this.margin + col + 10, row2y + 10);

    this.currentY += 65;
  }

  private drawApprovalHistory() {
    this.sectionTitle('Approval History');
    const approvals = this.data.approvals;
    if (!approvals.length) {
      this.doc.font(FONT_REGULAR).fontSize(9).fillColor(COLORS.muted).text('No approval history recorded.', this.margin, this.currentY);
      this.currentY += 16;
      return;
    }

    const colWidths = [110, 90, 90, 100, 115];
    const headers = ['Date & Time', 'From Status', 'To Status', 'Performed By', 'Remarks'];
    this.drawTableHeader(headers, colWidths);

    for (let i = 0; i < approvals.length; i++) {
      const ap = approvals[i];
      const row = [
        fmtDateTime(ap.createdAt),
        statusLabel(ap.previousStatus),
        statusLabel(ap.newStatus),
        fmt(ap.performedByName),
        fmt(ap.remarks, ''),
      ];
      this.drawTableRow(row, colWidths, i % 2 === 0);
    }
    this.currentY += 8;
  }

  private drawSignOff() {
    this.sectionTitle('Sign-Off');
    this.checkPageBreak(100);
    const a = this.data.appraisal;

    const signatories = [
      { role: 'Employee', name: a.employeeName, designation: a.designation, date: a.selfSubmittedAt },
      { role: 'L1 Reviewer', name: a.l1ReviewerName, designation: null, date: a.l1ReviewedAt },
      { role: 'L2 Reviewer', name: a.l2ReviewerName, designation: null, date: a.l2ReviewedAt },
      { role: 'L3 Approver', name: a.l3ApproverName, designation: null, date: a.l3ApprovedAt },
    ];

    const boxW = (this.contentWidth - 30) / 4;
    for (let i = 0; i < signatories.length; i++) {
      const x = this.margin + i * (boxW + 10);
      const s = signatories[i];
      this.doc.rect(x, this.currentY, boxW, 70).stroke(COLORS.tableBorder);

      this.doc.font(FONT_BOLD).fontSize(8).fillColor(COLORS.primary).text(s.role, x + 6, this.currentY + 6, { width: boxW - 12 });
      this.doc.font(FONT_REGULAR).fontSize(8).fillColor(COLORS.text).text(fmt(s.name), x + 6, this.currentY + 20, { width: boxW - 12 });
      if (s.designation) {
        this.doc.font(FONT_REGULAR).fontSize(7).fillColor(COLORS.muted).text(s.designation, x + 6, this.currentY + 32, { width: boxW - 12 });
      }
      this.doc.font(FONT_REGULAR).fontSize(7).fillColor(COLORS.muted).text(fmtDate(s.date), x + 6, this.currentY + 44, { width: boxW - 12 });
      if (s.date) {
        this.doc.font(FONT_BOLD).fontSize(6.5).fillColor(COLORS.success).text('Electronically Approved', x + 6, this.currentY + 56, { width: boxW - 12 });
      }
    }
    this.currentY += 80;
  }

  private drawTableHeader(headers: string[], colWidths: number[]) {
    this.checkPageBreak(25);
    let x = this.margin;
    const h = 18;
    for (let i = 0; i < headers.length; i++) {
      this.doc.rect(x, this.currentY, colWidths[i], h).fill(COLORS.headerBg);
      this.doc.font(FONT_BOLD).fontSize(7).fillColor(COLORS.headerText).text(headers[i], x + 3, this.currentY + 5, { width: colWidths[i] - 6 });
      x += colWidths[i];
    }
    this.currentY += h;
  }

  private drawTableRow(cells: string[], colWidths: number[], even: boolean) {
    this.checkPageBreak(18);
    let x = this.margin;
    const h = 16;
    for (let i = 0; i < cells.length; i++) {
      if (even) this.doc.rect(x, this.currentY, colWidths[i], h).fill(COLORS.lightBg);
      this.doc.font(FONT_REGULAR).fontSize(7).fillColor(COLORS.text).text(cells[i], x + 3, this.currentY + 4, { width: colWidths[i] - 6, lineBreak: false });
      x += colWidths[i];
    }
    this.currentY += h;
  }

  private drawSimpleTable(rows: string[][], colWidths: number[]) {
    for (let r = 0; r < rows.length; r++) {
      if (r === 0) {
        this.drawTableHeader(rows[r], colWidths);
      } else {
        this.drawTableRow(rows[r], colWidths, r % 2 === 0);
      }
    }
  }
}
