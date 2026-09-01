import PDFDocument from 'pdfkit';

const COMPONENTS = ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'] as const;
const COLORS = {
  navy: '#17365D',
  teal: '#087E8B',
  red: '#B3261E',
  green: '#16794A',
  amber: '#A15C00',
  ink: '#263238',
  muted: '#66727D',
  pale: '#EFF4F7',
  line: '#CBD6DE',
};

export type PredictiveNtReportSnapshot = {
  id: string;
  projectNumber: number;
  modelHash: string;
  engineHash: string;
  completedAt: Date | string;
  input: any;
  result: any;
};

function value(input: unknown, digits = 2) {
  if (input === null || input === undefined) return '—';
  if (typeof input !== 'number') return String(input);
  if (!Number.isFinite(input)) return String(input);
  const absolute = Math.abs(input);
  if (absolute > 0 && (absolute < 1e-4 || absolute > 1e5)) return input.toExponential(2);
  return input.toFixed(digits).replace(/\.0+$|(?<=\.[0-9]*?)0+$/, '');
}

function label(input: string) {
  return input.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

const HYDROCARBON_COMPONENTS = ['SAT', 'MONO', 'DI', 'POLY', 'PA'] as const;

function finiteNumber(input: unknown): number | null {
  return typeof input === 'number' && Number.isFinite(input) ? input : null;
}

function trialIsClosed(trial: any): boolean {
  return trial?.residualClosureStatus === 'CLOSED';
}

function solverDisplayStatus(trial: any): string {
  if (trial?.residualClosureStatus === 'CLOSED') return 'CLOSED';
  if (trial?.residualClosureStatus === 'UNCLOSED') return 'UNCONVERGED';
  return 'MISSING_EVIDENCE';
}

function explicitClosureSummary(trials: any[], secondary = false): string {
  if (trials.length === 0) return 'NOT_CALCULABLE / MISSING_EVIDENCE';
  const statuses = trials.map((trial) => secondary
    ? trial?.multistartEvidence?.bothStartsClosed
    : trial?.residualClosureStatus === 'CLOSED'
      ? true
      : trial?.residualClosureStatus === 'UNCLOSED'
        ? false
        : null);
  if (statuses.some((status) => status === null || status === undefined)) {
    return 'NOT_CALCULABLE / MISSING_EVIDENCE';
  }
  return statuses.every(Boolean) ? 'PASS' : 'FAIL';
}

function projectReference(snapshot: PredictiveNtReportSnapshot, stage1: any): string {
  const candidate = stage1?.projectReference ?? snapshot.projectNumber;
  if (
    candidate === null
    || candidate === undefined
    || String(candidate).trim() === ''
    || String(candidate).trim().toLowerCase() === 'nan'
  ) {
    throw new Error('PREDICTIVE_NT_REPORT_PROJECT_REFERENCE_MISSING');
  }
  return String(candidate);
}

export type PrePilotSulfurEstimate = {
  status: 'CALCULABLE' | 'NOT_CALCULABLE';
  reason?: string;
  totalPpm?: number;
  targetStatus?: 'ESTIMATED_PASS' | 'ESTIMATED_FAIL' | 'DIAGNOSTIC_ONLY — UNCONVERGED';
  contributionsPpm: Record<(typeof HYDROCARBON_COMPONENTS)[number], number | null>;
};

export function calculatePrePilotSulfurEstimate(stage1: any, trial: any): PrePilotSulfurEstimate {
  const empty = Object.fromEntries(
    HYDROCARBON_COMPONENTS.map((key) => [key, null]),
  ) as PrePilotSulfurEstimate['contributionsPpm'];
  const feedSulfur = finiteNumber(stage1?.feedSulfurPpm);
  const target = finiteNumber(stage1?.targetRaffinateSulfurPpm);
  const allocationValues = [
    stage1?.sulfurAllocationSatPct,
    stage1?.sulfurAllocationMonoPct,
    stage1?.sulfurAllocationDiPct,
    stage1?.sulfurAllocationPolyPct,
    stage1?.sulfurAllocationPaPct,
  ].map(finiteNumber);
  if (feedSulfur === null || target === null || allocationValues.some((entry) => entry === null)) {
    return { status: 'NOT_CALCULABLE', reason: 'MISSING_PERSISTED_SULFUR_INPUT', contributionsPpm: empty };
  }
  const allocations = allocationValues as number[];
  if (Math.abs(allocations.reduce((sum, entry) => sum + entry, 0) - 100) > 1e-9) {
    return { status: 'NOT_CALCULABLE', reason: 'SULFUR_ALLOCATION_TOTAL_NOT_100_PERCENT', contributionsPpm: empty };
  }
  const metrics = trial?.productMetrics ?? {};
  if (!['CLOSED', 'UNCLOSED'].includes(trial?.residualClosureStatus)) {
    return { status: 'NOT_CALCULABLE', reason: 'MISSING_PERSISTED_SOLVER_QUALIFICATION', contributionsPpm: empty };
  }
  const recovery = finiteNumber(metrics.nmpFreeHydrocarbonRecoveryPct);
  const extraction = metrics.componentExtractionPct ?? {};
  const removals = [
    finiteNumber(metrics.satLossPct),
    finiteNumber(extraction.MONO),
    finiteNumber(extraction.DI),
    finiteNumber(extraction.POLY),
    finiteNumber(extraction.PA),
  ];
  const feedFractions = [
    finiteNumber(stage1?.saturatesWt),
    finiteNumber(stage1?.monoAromaticsWt),
    finiteNumber(stage1?.diAromaticsWt),
    finiteNumber(stage1?.polyAromaticsWt),
    finiteNumber(stage1?.polarAromaticsWt),
  ];
  if (recovery === null || recovery <= 0 || removals.some((entry) => entry === null)) {
    return { status: 'NOT_CALCULABLE', reason: 'MISSING_PERSISTED_RECOVERY_OR_COMPONENT_REMOVAL', contributionsPpm: empty };
  }
  if (feedFractions.some((entry, index) => entry === 0 && allocations[index] > 0)) {
    return { status: 'NOT_CALCULABLE', reason: 'POSITIVE_SULFUR_ALLOCATION_TO_ZERO_FEED_COMPONENT', contributionsPpm: empty };
  }
  const contributions = HYDROCARBON_COMPONENTS.map((component, index) => [
    component,
    feedSulfur * (allocations[index] / 100) * (1 - (removals[index] as number) / 100) / (recovery / 100),
  ]) as Array<[(typeof HYDROCARBON_COMPONENTS)[number], number]>;
  const contributionsPpm = Object.fromEntries(contributions) as PrePilotSulfurEstimate['contributionsPpm'];
  const totalPpm = contributions.reduce((sum, [, entry]) => sum + entry, 0);
  return {
    status: 'CALCULABLE',
    totalPpm,
    targetStatus: trialIsClosed(trial)
      ? (totalPpm <= target ? 'ESTIMATED_PASS' : 'ESTIMATED_FAIL')
      : 'DIAGNOSTIC_ONLY — UNCONVERGED',
    contributionsPpm,
  };
}

export async function generatePredictiveNtReport(
  snapshot: PredictiveNtReportSnapshot,
): Promise<Buffer> {
  const r = snapshot;
  const o = r.result;
  const s = r.input?.stage1Authority?.source?.stage1 ?? {};
  if (!o || !Array.isArray(o.trials)) throw new Error('PREDICTIVE_NT_REPORT_RESULT_MISSING');
  const projectRef = projectReference(r, s);
  const controlledNegative = o.releaseEligible === false && o.predictiveNt == null;

  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: `Project ${projectRef} Predictive N_T Engineering Report`,
      Author: 'Thermopac',
      Subject: `Frozen Predictive N_T run ${r.id}`,
      CreationDate: new Date(r.completedAt),
      ModDate: new Date(r.completedAt),
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  let pageNumber = 0;

  const text = (
    content: unknown, x: number, y: number, width: number, size = 8,
    color = COLORS.ink, bold = false, align: 'left' | 'center' | 'right' = 'left',
  ) => {
    doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
      .text(String(content ?? '—'), x, y, { width, align, lineGap: 1.5, ellipsis: false });
  };
  const page = (title: string, landscape = false, subtitle = '') => {
    doc.addPage({
      size: 'A4',
      layout: landscape ? 'landscape' : 'portrait',
      margins: { top: 32, bottom: 32, left: 42, right: 42 },
    });
    pageNumber += 1;
    doc.rect(0, 0, doc.page.width, 12).fill(COLORS.teal);
    text(pageNumber, 42, 19, 40, 7, COLORS.muted);
    text(
      `PROJECT ${projectRef}  •  ${controlledNegative ? 'RESEARCH DIAGNOSTIC' : String(o.status ?? 'MISSING EVIDENCE')}`,
      doc.page.width - 292, 19, 250, 7, COLORS.muted, false, 'right',
    );
    text(title, 42, 39, doc.page.width - 84, 17, COLORS.navy, true);
    if (subtitle) text(subtitle, 42, 63, doc.page.width - 84, 8, COLORS.muted);
    doc.strokeColor(COLORS.line).moveTo(42, 78).lineTo(doc.page.width - 42, 78).stroke();
  };
  const pill = (content: string, x: number, y: number, width: number, color = COLORS.red) => {
    doc.roundedRect(x, y, width, 26, 4).fill(color);
    text(content, x + 7, y + 8, width - 14, 9, '#FFFFFF', true, 'center');
  };
  const grid = (items: Array<[string, unknown]>, x: number, y: number, width: number, row = 20) => {
    items.forEach(([key, entry], index) => {
      doc.rect(x, y + index * row, width, row).fill(index % 2 ? COLORS.pale : '#FFFFFF');
      text(key, x + 7, y + index * row + 6, width * 0.42, 7.3, COLORS.muted, true);
      text(value(entry), x + width * 0.44, y + index * row + 6, width * 0.54 - 7, 7.6);
    });
  };
  const table = (
    headers: string[], rows: string[][], x: number, y: number,
    widths: number[], rowHeight = 24, fontSize = 7,
  ) => {
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    doc.rect(x, y, totalWidth, rowHeight).fill(COLORS.navy);
    let cursor = x;
    headers.forEach((header, index) => {
      text(header, cursor + 3, y + 7, widths[index] - 6, fontSize, '#FFFFFF', true, 'center');
      cursor += widths[index];
    });
    rows.forEach((row, rowIndex) => {
      const rowY = y + rowHeight * (rowIndex + 1);
      doc.rect(x, rowY, totalWidth, rowHeight).fill(rowIndex % 2 ? COLORS.pale : '#FFFFFF');
      cursor = x;
      row.forEach((entry, index) => {
        const color = entry === 'PASS' ? COLORS.green
          : ['FAIL', 'UNCONVERGED'].includes(entry) ? COLORS.red
            : ['NOT CALCULABLE', 'NOT APPLICABLE'].includes(entry) ? COLORS.amber : COLORS.ink;
        text(entry, cursor + 3, rowY + 6, widths[index] - 6, fontSize, color,
          ['PASS', 'FAIL', 'UNCONVERGED'].includes(entry), 'center');
        cursor += widths[index];
      });
    });
  };

  page('Predictive N_T — Six-Component COSMO-SAC-2010');
  pill(
    controlledNegative
      ? 'RESEARCH DIAGNOSTIC — NOT ACCEPTED — NOT RELEASE ELIGIBLE'
      : `PERSISTED QUALIFICATION STATUS — ${String(o.status ?? 'MISSING_EVIDENCE')}`,
    42, 98, 510, controlledNegative ? COLORS.red : COLORS.teal,
  );
  text('Executive summary', 42, 140, 510, 16, COLORS.navy, true);
  text(
    `Project ${projectRef} completed ${o.trials.length} frozen candidate stage-count trials. A converged process-sensitivity trial is not an accepted Predictive N_T unless the separate scientific qualification is satisfied.`,
    42, 166, 510, 8.5,
  );
  grid([
    ['Project reference', projectRef],
    ['Job status', 'COMPLETED — report generated automatically'],
    ['Trials completed', `${o.trials.length} / ${r.input.maximumStages ?? o.trials.length}`],
    ['Accepted Predictive N_T', o.predictiveNt ?? 'NOT ASSIGNED'],
    ['Established theoretical stages', o.establishedTheoreticalStages ?? 'Not established'],
    ['Pilot validated', o.pilotValidated ? 'Yes' : 'No'],
    ['Calibration required', o.calibrationRequired ? 'Yes' : 'No'],
    ['Release eligible', o.releaseEligible ? 'Yes' : 'No'],
  ], 42, 215, 510, 20);
  doc.roundedRect(42, 390, 510, 128, 4).fill('#FFF3E5');
  text('ENGINEERING RESULT', 55, 404, 480, 9, COLORS.amber, true);
  text('Preferred engineering candidate: NOT ASSIGNED', 55, 428, 480, 10, COLORS.ink, true);
  text(
    'No governed preferred-candidate selection rule is persisted for this run. The report therefore does not invent or hardcode a stage selection. Accepted Predictive N_T remains a separate scientific qualification result.',
    55, 452, 480, 8.2,
  );
  text('COSMO-SAC sulfur prediction: NOT CALCULABLE', 55, 492, 480, 8.2, COLORS.red, true);
  text(`Completed ${new Date(r.completedAt).toISOString()}  •  Job ${r.id}`, 42, 720, 510, 7, COLORS.muted);

  page('1. Frozen Design Basis', false, 'OWNER-CONTROLLED / SAVED STAGE-1 INPUT AUTHORITY');
  grid([
    ['Project reference', projectRef],
    ['RRBO grade', s.rrboGrade],
    ['Operating temperature', `${value(s.operatingTemperatureC)} °C`],
    ['Operating pressure', `${value(s.operatingPressure)} bar(g)`],
    ['Phase configuration', s.phaseConfiguration],
    ['Solvent/oil mass ratio', s.solventOilRatio],
    ['Maximum stages', s.maximumStages],
    ['SAT identity', s.satIdentity],
    ['MONO identity', s.monoIdentity],
  ], 42, 100, 510, 25);
  text('Feed composition — mass basis', 42, 350, 510, 12, COLORS.navy, true);
  table(
    [...COMPONENTS],
    [[s.saturatesWt, s.monoAromaticsWt, s.diAromaticsWt, s.polyAromaticsWt, s.polarAromaticsWt, s.nmpInFeedWt].map((v) => `${value(Number(v), 5)} wt%`)],
    42, 380, [85, 85, 85, 85, 85, 85], 32, 7,
  );
  text('Saved product targets', 42, 475, 510, 12, COLORS.navy, true);
  grid([
    ['Maximum total aromatics', `${value(s.targetRaffinateTotalAromaticsWt)} wt% NMP-free`],
    ['Maximum polar aromatics', `${value(s.targetRaffinatePolarAromaticsWt)} wt% NMP-free`],
    ['Minimum saturates', `${value(s.minimumRaffinateSaturatesWt)} wt% NMP-free`],
    ['Minimum RRBO recovery', `${value(s.minimumRecoveryPct)} wt%`],
    ['Maximum NMP in raffinate', `${value(s.maximumNmpRaffinateWt)} wt% full stream`],
    ['Raffinate sulfur target', `${value(s.targetRaffinateSulfurPpm)} ppm (pre-pilot estimate only)`],
  ], 42, 505, 510, 24);

  page('1. Frozen Design Basis — Sulfur Allocation', false, 'PRE-PILOT ASSUMPTION — saved with the completed Stage-1 snapshot');
  const sulfurAllocations = [
    s.sulfurAllocationSatPct,
    s.sulfurAllocationMonoPct,
    s.sulfurAllocationDiPct,
    s.sulfurAllocationPolyPct,
    s.sulfurAllocationPaPct,
  ];
  const feedComposition = [
    s.saturatesWt,
    s.monoAromaticsWt,
    s.diAromaticsWt,
    s.polyAromaticsWt,
    s.polarAromaticsWt,
  ];
  table(
    ['Component', 'Feed wt%', 'Sulfur allocation %', 'Feed-basis sulfur contribution ppm'],
    HYDROCARBON_COMPONENTS.map((component, index) => {
      const allocation = finiteNumber(sulfurAllocations[index]);
      const feedSulfur = finiteNumber(s.feedSulfurPpm);
      return [
        component,
        value(finiteNumber(feedComposition[index]), 4),
        allocation === null ? 'NOT CALCULABLE' : value(allocation, 4),
        allocation === null || feedSulfur === null
          ? 'NOT CALCULABLE'
          : value(feedSulfur * allocation / 100, 4),
      ];
    }),
    42, 105, [85, 100, 145, 180], 34, 7,
  );
  grid([
    ['Feed sulfur', finiteNumber(s.feedSulfurPpm) === null ? 'NOT CALCULABLE' : `${value(s.feedSulfurPpm, 4)} ppm`],
    ['Raffinate sulfur target', finiteNumber(s.targetRaffinateSulfurPpm) === null ? 'NOT CALCULABLE' : `${value(s.targetRaffinateSulfurPpm, 4)} ppm`],
    ['Allocation total', sulfurAllocations.every((entry) => finiteNumber(entry) !== null)
      ? `${value(sulfurAllocations.reduce((sum: number, entry: unknown) => sum + Number(entry), 0), 4)} %`
      : 'NOT CALCULABLE'],
  ], 42, 325, 510, 25);
  text(
    'This allocation is an owner-controlled pre-pilot engineering assumption. It is not a hidden report constant and it does not make sulfur a COSMO-SAC component.',
    42, 425, 510, 8.5, COLORS.amber, true,
  );

  page(
    '2. Overall N_T Engineering Comparison',
    true,
    'Primary process comparison. Product composition is wt% on an NMP-free hydrocarbon basis; NMP is wt% of total raffinate.',
  );
  table(
    ['N_T', 'Solver', 'Recovery %', 'NMP %', 'SAT %', 'Arom %', 'PA %', 'SAT loss %', 'MONO rem %', 'DI rem %', 'POLY rem %', 'PA rem %', 'Sulfur ppm', 'Target', 'Scientific'],
    o.trials.map((trial: any) => {
      const metrics = trial.productMetrics ?? {};
      const extraction = metrics.componentExtractionPct ?? {};
      const sulfur = calculatePrePilotSulfurEstimate(s, trial);
      const closed = trialIsClosed(trial);
      return [
        String(trial.stageCount),
        solverDisplayStatus(trial),
        value(metrics.nmpFreeHydrocarbonRecoveryPct, 2),
        value(metrics.nmpInTotalRaffinateWt, 2),
        value(metrics.raffinateSaturatesWtNmpFree, 2),
        value(metrics.raffinateTotalAromaticsWtNmpFree, 2),
        value(metrics.raffinatePolarAromaticsWtNmpFree, 2),
        value(metrics.satLossPct, 2),
        value(extraction.MONO, 2),
        value(extraction.DI, 2),
        value(extraction.POLY, 2),
        value(extraction.PA, 2),
        sulfur.status === 'CALCULABLE' ? value(sulfur.totalPpm, 1) : 'N/C',
        closed
          ? (trial.allCalculableTargetsPass ? 'PASS' : 'FAIL')
          : trial?.residualClosureStatus === 'UNCLOSED'
            ? 'DIAGNOSTIC_ONLY — UNCONVERGED'
            : 'NOT_CALCULABLE / MISSING_EVIDENCE',
        trial.accepted ? 'QUALIFIED' : 'NOT QUALIFIED',
      ];
    }),
    30, 96, [30, 48, 48, 40, 40, 44, 38, 46, 51, 46, 48, 44, 48, 48, 58], 30, 4.6,
  );
  const comparisonNoteY = 96 + 30 * (o.trials.length + 1) + 14;
  text(
    'Recovery = NMP-free RRBO recovery. Removal/loss = component-relative boundary removal. Sulfur = PRE-PILOT ALLOCATION ESTIMATE ONLY. Unconverged values are diagnostic only and receive no engineering PASS/FAIL.',
    30, comparisonNoteY, 780, 7.5, COLORS.muted, true,
  );

  page('3. Component Extraction Performance', true, 'Engineering trade-off between RRBO recovery and aromatic/polar-component removal');
  table(
    ['N_T', 'Solver Status', 'RRBO Recovery %', 'SAT Loss %', 'MONO Removal %', 'DI Removal %', 'POLY Removal %', 'PA Removal %'],
    o.trials.map((trial: any) => {
      const metrics = trial.productMetrics ?? {};
      const extraction = metrics.componentExtractionPct ?? {};
      return [
        String(trial.stageCount),
        solverDisplayStatus(trial),
        value(metrics.nmpFreeHydrocarbonRecoveryPct, 3),
        value(metrics.satLossPct, 3),
        value(extraction.MONO, 3),
        value(extraction.DI, 3),
        value(extraction.POLY, 3),
        value(extraction.PA, 3),
      ];
    }),
    42, 105, [50, 100, 110, 90, 105, 95, 105, 95], 26, 6.2,
  );
  text('SAT is reported as SAT LOSS. NMP removal/extraction percentage is NOT APPLICABLE.', 42, 420, 755, 8.5, COLORS.amber, true);

  page('4. Pre-Pilot Sulfur Allocation Estimate', true, 'ESTIMATE ONLY — NOT A COSMO-SAC SULFUR PREDICTION — NOT PILOT VALIDATED');
  table(
    ['N_T', 'Solver', 'SAT ppm', 'MONO ppm', 'DI ppm', 'POLY ppm', 'PA ppm', 'Total ppm', 'Target ppm', 'Estimate Target Status'],
    o.trials.map((trial: any) => {
      const estimate = calculatePrePilotSulfurEstimate(s, trial);
      return [
        String(trial.stageCount),
        solverDisplayStatus(trial),
        value(estimate.contributionsPpm.SAT, 2),
        value(estimate.contributionsPpm.MONO, 2),
        value(estimate.contributionsPpm.DI, 2),
        value(estimate.contributionsPpm.POLY, 2),
        value(estimate.contributionsPpm.PA, 2),
        estimate.status === 'CALCULABLE' ? value(estimate.totalPpm, 2) : `NOT CALCULABLE: ${estimate.reason}`,
        value(finiteNumber(s.targetRaffinateSulfurPpm), 2),
        estimate.status === 'CALCULABLE' ? String(estimate.targetStatus) : 'NOT_CALCULABLE',
      ];
    }),
    30, 105, [34, 65, 58, 64, 58, 60, 58, 88, 62, 150], 27, 5.5,
  );
  text('Formal COSMO-SAC sulfur prediction: NOT CALCULABLE', 42, 420, 755, 9, COLORS.red, true);

  page('5. Engineering Stage Selection', false, 'Preferred engineering candidate, accepted Predictive N_T, and established theoretical stages are separate states');
  grid([
    ['Preferred engineering/process-sensitivity candidate', 'NOT ASSIGNED'],
    ['Accepted Predictive N_T', o.predictiveNt ?? 'NOT ASSIGNED'],
    ['Established theoretical stages', o.establishedTheoreticalStages ?? 'NOT ESTABLISHED'],
  ], 42, 110, 510, 38);
  doc.roundedRect(42, 260, 510, 120, 4).fill('#FFF3E5');
  text('SELECTION GOVERNANCE', 55, 278, 480, 9, COLORS.amber, true);
  text(
    'No explicit deterministic preferred-candidate selection rule is persisted for this completed run. No stage is selected by this report. Unconverged trials and scientifically unqualified trials can never become an accepted Predictive N_T through presentation logic.',
    55, 305, 480, 8.5,
  );

  page('6. Scientific Qualification Summary', false, 'Exact persisted evidence; PASS is never inferred from the absence of a blocker');
  const qualificationBlockers = Array.from(new Set(
    o.trials.flatMap((trial: any) => (trial.acceptanceBlockers ?? []).map((blocker: any) => blocker.code ?? String(blocker))),
  ));
  grid([
    ['Six-component molecular basis', o.stage1TargetGovernance?.sixComponentCosmoSacBasisManifestSha256 ? 'PERSISTED' : 'MISSING_EVIDENCE'],
    ['Stage-1 authority', r.input?.stage1Authority?.snapshotHash ? 'PERSISTED' : 'MISSING_EVIDENCE'],
    ['Primary solver closure', explicitClosureSummary(o.trials)],
    ['Secondary / multistart closure', explicitClosureSummary(o.trials, true)],
    ['Global TPD stability', o.globalStabilityQualification?.status ?? 'NOT_CALCULABLE / MISSING_EVIDENCE'],
    ['Sulfur thermodynamic prediction', 'NOT CALCULABLE'],
    ['Pilot validation', o.pilotValidated ? 'PASS' : 'NOT VALIDATED'],
    ['Calibration requirement', o.calibrationRequired ? 'REQUIRED' : 'NOT REQUIRED'],
    ['Release eligibility', o.releaseEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'],
    ['Accepted Predictive N_T', o.predictiveNt ?? 'NOT ASSIGNED'],
  ], 42, 100, 510, 28);
  text('Main-report blocker summary', 42, 410, 510, 11, COLORS.navy, true);
  text(qualificationBlockers.length ? `${qualificationBlockers.length} exact trial blocker code(s); see Appendix E.` : 'No trial blocker codes persisted.', 42, 438, 510, 8.5);

  for (const trial of o.trials) {
    const trialClosed = trial.residualClosureStatus === 'CLOSED';
    const trialUnconverged = trial.residualClosureStatus === 'UNCLOSED';
    const branchComparisonEvaluated = (trial.branchComparisonStatus
      ?? trial.multistartEvidence?.branchComparisonStatus
      ?? (trial.multistartEvidence?.bothStartsClosed ? 'EVALUATED' : 'NOT_EVALUABLE_ENDPOINT_UNCLOSED'))
      === 'EVALUATED';
    const branchDifference = branchComparisonEvaluated
      && typeof trial.multistartProductRelativeDifference === 'number'
      ? trial.multistartProductRelativeDifference
      : null;
    page(
      `Appendix A — N_T=${trial.stageCount} Numerical Diagnostics`,
      true,
      `RESEARCH DIAGNOSTIC — NOT ACCEPTED · numerical gates ${trial.numericalAcceptancePassed ? 'PASS' : 'FAIL'} · maximum component-balance residual ${Number(trial.maximumOverallComponentBalanceResidualMol).toExponential(3)}`,
    );
    const shift = trialClosed ? 0 : 22;
    if (!trialClosed) {
      pill(
        trialUnconverged
          ? 'UNCONVERGED DIAGNOSTIC — DO NOT USE FOR DESIGN SELECTION'
          : 'MISSING SOLVER QUALIFICATION — DO NOT USE FOR DESIGN SELECTION',
        42, 82, 755,
      );
    }
    const streams = trial.boundaryStreams ?? {};
    const metrics = trial.productMetrics ?? {};
    const extraction = metrics.componentExtractionPct ?? {};
    text(
      `Primary termination ${trial.solverTerminationStatus ?? 'MISSING_EVIDENCE'}   ·   Residual closure ${solverDisplayStatus(trial)}   ·   Maximum scaled equation residual ${Number(trial.maximumScaledEquationResidual).toExponential(3)}   ·   Branch comparison ${branchComparisonEvaluated && branchDifference !== null ? `EVALUATED (${branchDifference.toExponential(3)})` : 'NOT EVALUABLE — ENDPOINT UNCLOSED'}`,
      42, 90 + shift, 755, 8, COLORS.ink, true,
    );
    const blockers = (trial.acceptanceBlockers ?? [])
      .map((blocker: any) => blocker.code ?? 'UNSPECIFIED_GATE_FAILURE').join(' · ');
    text(`Blockers: ${blockers || 'None'}`, 42, 110 + shift, 755, 7, COLORS.amber, true);
    text(
      'Product targets — MASS BASIS (NMP-free hydrocarbon basis except total-raffinate NMP wt%)',
      42, 139 + shift, 755, 10, COLORS.navy, true,
    );
    const compliance = trial.targetCompliance ?? {};
    table(
      ['Target', 'Status', 'Limit', 'Calculated'],
      [
        'minimumNmpFreeRecoveryPct',
        'maximumNmpRaffinateWt',
        'minimumRaffinateSaturatesWt',
        'maximumRaffinateTotalAromaticsWt',
        'maximumRaffinatePolarAromaticsWt',
        'targetRaffinateSulfurPpm',
      ].map((key) => {
        const entry = compliance[key] ?? {};
        return [
          label(key),
          entry.status === 'NOT_CALCULABLE' ? 'NOT CALCULABLE' : entry.status,
          value(entry.target, 4),
          value(entry.calculated, 4),
        ];
      }),
      42, 158 + shift, [310, 130, 130, 130], trialClosed ? 18 : 16, 7,
    );
    const satFeed = streams.oilFeed?.componentMoles?.[0];
    const satExtract = streams.finalExtract?.componentMoles?.[0];
    const satLoss = satFeed > 0 ? 100 * satExtract / satFeed : null;
    text(
      'Boundary-mole removal diagnostics — SAT loss and aromatic-family removal (%)',
      42, 296 + shift, 755, 10, COLORS.navy, true,
    );
    table(
      ['Basis', ...COMPONENTS],
      [[
        'Removal / loss',
        value(satLoss, 4),
        value(extraction.MONO, 4),
        value(extraction.DI, 4),
        value(extraction.POLY, 4),
        value(extraction.PA, 4),
        'NOT APPLICABLE',
      ]],
      42, 315 + shift, [90, 110, 110, 110, 110, 110, 110], 20, 7,
    );
    table(
      ['Component moles', ...COMPONENTS],
      ['oilFeed', 'freshNmp', 'finalRaffinate', 'finalExtract'].map((key) => [
        label(key),
        ...(streams[key]?.componentMoles ?? []).map((entry: number) => Number(entry).toExponential(4)),
      ]),
      42, 370 + shift, [90, 110, 110, 110, 110, 110, 110],
      trialClosed ? 19 : 16, 6.5,
    );
    text('Overall six-component balance residual — component moles', 42, 480 + shift, 755, 10, COLORS.navy, true);
    table(
      ['Basis', ...COMPONENTS],
      [[
        'Residual',
        ...(trial.overallComponentBalanceResidualMol ?? [])
          .map((entry: number) => Number(entry).toExponential(3)),
      ]],
      42, 500 + shift, [90, 110, 110, 110, 110, 110, 110], 18, 6.5,
    );

    page(
      `Appendix C.1 — N_T=${trial.stageCount} Stage TPD and Stability Evidence`,
      true,
      'Stage numbering is from bottom to top: Stage 1 = RRBO-feed/bottom end; final stage = fresh-NMP/top end.',
    );
    if (!trialClosed) {
      pill(
        trialUnconverged
          ? 'UNCONVERGED DIAGNOSTIC — DO NOT USE FOR DESIGN SELECTION'
          : 'MISSING SOLVER QUALIFICATION — DO NOT USE FOR DESIGN SELECTION',
        42, 82, 755,
      );
    }
    const diagnosticRows = (trial.stages ?? []).map((stage: any) => [
      String(stage.stageFromFeedEnd),
      Number(stage.maximumComponentBalanceResidualMol).toExponential(3),
      stage.accepted ? 'PASS' : 'FAIL',
      Number(stage.isoactivityLogResidual).toExponential(3),
      Number(stage.localPostSplitStability?.raffinate?.minimumEigenvalue).toExponential(3),
      Number(stage.localPostSplitStability?.extract?.minimumEigenvalue).toExponential(3),
      Number(stage.postSplitTpdSearch?.raffinate?.minimum).toExponential(3),
      Number(stage.postSplitTpdSearch?.extract?.minimum).toExponential(3),
    ]);
    table(
      ['Stage', 'Local balance', 'Stage qualification', 'Isoactivity', 'R min eig', 'E min eig', 'R TPD min', 'E TPD min'],
      diagnosticRows, 42, trialClosed ? 100 : 115,
      [55, 105, 90, 90, 100, 100, 100, 100], 23, 6.3,
    );

    page(
      `Appendix B — N_T=${trial.stageCount} Six-Component Stage Outlet Compositions`,
      true,
      'Stage numbering is from bottom to top: Stage 1 = RRBO-feed/bottom end; final stage = fresh-NMP/top end.',
    );
    if (!trialClosed) {
      pill(
        trialUnconverged
          ? 'UNCONVERGED DIAGNOSTIC — DO NOT USE FOR DESIGN SELECTION'
          : 'MISSING SOLVER QUALIFICATION — DO NOT USE FOR DESIGN SELECTION',
        42, 82, 755,
      );
    }
    const outletRows: string[][] = [];
    for (const stage of trial.stages ?? []) {
      outletRows.push([
        `${stage.stageFromFeedEnd} R`,
        ...(stage.raffinateLeaving?.moleFractions ?? []).map((entry: number) => value(entry, 6)),
      ]);
      outletRows.push([
        `${stage.stageFromFeedEnd} E`,
        ...(stage.extractLeaving?.moleFractions ?? []).map((entry: number) => value(entry, 6)),
      ]);
    }
    text('PHASE MOLE FRACTIONS — NOT PRODUCT MASS FRACTIONS', 42, trialClosed ? 83 : 98, 755, 8, COLORS.amber, true);
    table(
      ['Stage / phase', ...COMPONENTS],
      outletRows, 42, trialClosed ? 105 : 120,
      [90, 110, 110, 110, 110, 110, 110], 20, 6.5,
    );
  }

  page(
    'Appendix D — Multistart / Solver Evidence',
    false,
    'Primary convergence is insufficient: both starts must close and boundary products must agree within 1e-6',
  );
  const multistartLimit = 1e-6;
  table(
    ['N_T', 'P termination', 'P closure / residual', 'S termination', 'S closure / residual', 'Branch difference', 'Gate'],
    o.trials.map((trial: any) => {
      const evidence = trial.multistartEvidence ?? {};
      const evaluated = (evidence.branchComparisonStatus
        ?? trial.branchComparisonStatus
        ?? (evidence.bothStartsClosed ? 'EVALUATED' : 'NOT_EVALUABLE_ENDPOINT_UNCLOSED'))
        === 'EVALUATED';
      const difference = evaluated && typeof trial.multistartProductRelativeDifference === 'number'
        ? trial.multistartProductRelativeDifference
        : null;
      const passed = evidence.bothStartsClosed === true
        && difference !== null
        && difference <= multistartLimit;
      return [
        String(trial.stageCount),
        evidence.primary?.terminationStatus ?? 'MISSING_EVIDENCE',
        `${evidence.primary?.residualClosureStatus ?? 'MISSING_EVIDENCE'} / ${Number(evidence.primary?.maximumScaledEquationResidual).toExponential(3)}`,
        evidence.secondary?.terminationStatus ?? 'MISSING_EVIDENCE',
        `${evidence.secondary?.residualClosureStatus ?? 'MISSING_EVIDENCE'} / ${Number(evidence.secondary?.maximumScaledEquationResidual).toExponential(3)}`,
        difference === null ? 'NOT EVALUABLE' : difference.toExponential(3),
        passed ? 'PASS' : 'FAIL',
      ];
    }),
    42, 100, [35, 68, 94, 68, 94, 92, 55], 36, 5.8,
  );
  doc.roundedRect(42, 510, 510, 110, 4).fill('#FFF3E5');
  text('MULTISTART INTERPRETATION BOUNDARY', 54, 525, 480, 8, COLORS.amber, true);
  text(
    'Optimizer termination and numerical residual closure are separate evidence. An unclosed endpoint is not a branch, so branch comparison is not evaluable until both starts close. The equation-closure tolerance remains 1e-8 and the boundary-product agreement tolerance remains 1e-6.',
    54, 546, 480, 8.1,
  );

  page('Appendix E — Exact Qualification Blockers', true, 'Complete frozen blocker set for every N_T — no truncation');
  table(
    ['N_T', 'Residual closure', 'Exact blocker codes'],
    o.trials.map((trial: any) => [
      String(trial.stageCount),
      solverDisplayStatus(trial),
      (trial.acceptanceBlockers ?? [])
        .map((blocker: any) => blocker.code ?? 'UNSPECIFIED_GATE_FAILURE').join('; ') || 'None recorded',
    ]),
    42, 100, [45, 95, 610], 40, 6.2,
  );

  const stability = o.globalStabilityQualification;
  page(
    'Appendix C.2 — Frozen Global TPD Qualification',
    false,
    'Task 216 evidence reconstructed from the closed Project 170 endpoints; never recalculated during PDF generation',
  );
  if (stability) {
    const classifications = Object.entries(stability.classificationCounts ?? {})
      .map(([classification, count]) => `${classification}: ${count}`)
      .join(' · ');
    grid([
      ['Evidence status', stability.status],
      ['Evidence qualified', stability.qualified ? 'Yes' : 'No'],
      ['Exact phase coverage', `${stability.coverage?.returnedPhaseEndpoints ?? '—'} / ${stability.coverage?.expectedPhaseEndpoints ?? '—'}`],
      ['Fully reproduced negative phases', stability.coverage?.failingPhaseCount],
      ['Negative or unresolved phases', stability.coverage?.negativeOrUnresolvedPhaseCount],
      ['Optimizer/refinement failures', stability.coverage?.optimizerRefinementFailureCount],
      ['Worst frozen TPD minimum', stability.worstMinimum],
      ['Unchanged TPD threshold', stability.postSplitTpdThreshold],
      ['Task 206 comparison candidate', stability.comparisonCandidate?.disposition],
      ['Frozen results SHA-256', stability.evidenceArtifacts?.resultsSha256],
      ['Frozen protocol SHA-256', stability.evidenceArtifacts?.protocolSha256],
    ], 42, 100, 510, 20);
    text('Frozen phase classifications', 42, 330, 510, 11, COLORS.navy, true);
    text(classifications || 'No classification summary persisted.', 42, 355, 510, 8.2);
    text('Exact governing blockers', 42, 410, 510, 11, COLORS.navy, true);
    const stabilityBlockers = Array.isArray(stability.blockers)
      ? stability.blockers.join(' · ')
      : 'TASK216_GLOBAL_STABILITY_EVIDENCE_INVALID';
    doc.roundedRect(42, 435, 510, 145, 4).fill('#FFF3E5');
    text(stabilityBlockers || 'None', 55, 450, 480, 8.2, COLORS.red, true);
    text(
      'A completed evidence run with blockers is a controlled negative scientific finding, not a software error. Predictive N_T remains unassigned and the output remains calibration-required and non-release-eligible.',
      55, 525, 480, 8,
    );
  } else {
    pill('TASK 216 FROZEN EVIDENCE NOT ATTACHED', 42, 105, 510);
    text(
      'This legacy completed snapshot predates the frozen global-stability evidence attachment. No current evidence has been substituted into this report.',
      42, 160, 510, 9,
    );
  }

  const task218 = o.task218CandidateGeneratedStability;
  page(
    'Appendix C.3 — Candidate-Generated Stability Evidence',
    false,
    'Immutable candidate cascade lineage; historical Task216/206 comparisons remain diagnostic only',
  );
  if (task218) {
    grid([
      ['Evidence status', task218.status],
      ['Candidate qualification', task218.qualified ? 'Qualified' : 'BLOCKED — CONTROLLED NEGATIVE'],
      ['Exact endpoint coverage', `${task218.coverage?.returned ?? '—'} / ${task218.coverage?.expected ?? '—'}`],
      ['Endpoint order', task218.endpointOrder],
      ['Candidate model SHA-256', task218.candidateModelSha256],
      ['Candidate parameter SHA-256', task218.candidateParameterSha256],
      ['Candidate flash SHA-256', task218.candidateFlashHash],
      ['Cascade / matrix SHA-256', `${task218.cascadeExecutionHash ?? '—'} / ${task218.endpointMatrixHash ?? '—'}`],
      ['Audit / qualification SHA-256', `${task218.auditHash ?? '—'} / ${task218.qualificationHash ?? '—'}`],
    ], 42, 100, 510, 24);
    text('Exact controlling blockers', 42, 340, 510, 11, COLORS.navy, true);
    doc.roundedRect(42, 365, 510, 100, 4).fill('#FFF3E5');
    text((task218.blockers ?? []).join(' · ') || 'None recorded', 55, 382, 480, 8.2, COLORS.red, true);
    text(
      'Task218 is candidate-generated controlled-negative evidence. It is research-only, calibration-required, not pilot validated, not release eligible; predictive N_T remains unassigned and sulfur remains NOT CALCULABLE.',
      55, 425, 480, 8,
    );
  } else {
    pill('TASK218 IMMUTABLE EVIDENCE NOT ATTACHED', 42, 105, 510);
  }

  page('7. Governance / Report Status', false, 'Immutable identifiers for the frozen completed snapshot; full provenance is Appendix F');
  pill(
    o.calibrationRequired
      ? 'CONTROLLED RESEARCH OUTPUT — CALIBRATION REQUIRED'
      : 'PERSISTED REPORT STATUS — CALIBRATION NOT REQUIRED',
    42, 98, 510, o.calibrationRequired ? COLORS.red : COLORS.teal,
  );
  grid([
    ['Thermodynamic classification', o.resultThermodynamicClassification],
    ['Model SHA-256', r.modelHash],
    ['Engine SHA-256', r.engineHash],
    ['Input SHA-256', o.inputHash],
    ['Stage 1 authority SHA-256', r.input?.stage1Authority?.snapshotHash ?? r.input?.stage1Authority?.source?.immutableHash],
    ['Six-component basis SHA-256', o.stage1TargetGovernance?.sixComponentCosmoSacBasisManifestSha256],
    ['Six-component binding SHA-256', o.stage1TargetGovernance?.sixComponentCosmoSacBindingSha256],
    ['Job ID', r.id],
  ], 42, 145, 510, 25);
  text('Persisted limitations', 42, 370, 510, 12, COLORS.navy, true);
  const limitations = [
    'Sulfur removal is NOT CALCULABLE from this aromatic-transfer model.',
    'The PA representative is non-sulfur-bearing and is not a sulfur surrogate.',
    'SAT is boundary-mole loss; NMP extraction percentage is not applicable.',
  ];
  if (!o.pilotValidated) limitations.splice(2, 0, 'Pilot validation is not established for this persisted snapshot.');
  if (!o.releaseEligible) limitations.splice(3, 0, 'This persisted snapshot is not release eligible.');
  if (o.calibrationRequired) limitations.splice(4, 0, 'Calibration remains required for this persisted snapshot.');
  limitations.forEach((entry, index) => {
    doc.circle(50, 406 + index * 38, 2.5).fill(COLORS.red);
    text(entry, 63, 397 + index * 38, 480, 8.7);
  });
  doc.roundedRect(42, 620, 510, 70, 4).fill(COLORS.pale);
  text('DOCUMENT CONTROL', 54, 632, 480, 8, COLORS.teal, true);
  text(
    'Generated automatically and exclusively from the persisted completed job snapshot. No live design inputs were read and no scientific calculation was rerun.',
    54, 650, 480, 8.3,
  );

  page('Appendix F — Governance and Provenance', false, 'Immutable identifiers and document-control evidence for the completed snapshot');
  grid([
    ['Thermodynamic classification', o.resultThermodynamicClassification],
    ['Model SHA-256', r.modelHash],
    ['Engine SHA-256', r.engineHash],
    ['Input SHA-256', o.inputHash],
    ['Stage-1 authority SHA-256', r.input?.stage1Authority?.snapshotHash ?? r.input?.stage1Authority?.source?.immutableHash],
    ['Six-component basis SHA-256', o.stage1TargetGovernance?.sixComponentCosmoSacBasisManifestSha256],
    ['Six-component binding SHA-256', o.stage1TargetGovernance?.sixComponentCosmoSacBindingSha256],
    ['Job ID', r.id],
    ['Completed at', new Date(r.completedAt).toISOString()],
  ], 42, 105, 510, 27);
  doc.roundedRect(42, 385, 510, 95, 4).fill(COLORS.pale);
  text('DOCUMENT CONTROL', 54, 400, 480, 8, COLORS.teal, true);
  text(
    'Generated exclusively from the persisted completed job snapshot. The renderer does not read live Stage-1 or workspace values and does not invoke COSMO-SAC, cascade, TPD, or multistart calculations.',
    54, 425, 480, 8.3,
  );

  doc.end();
  await new Promise<void>((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });
  return Buffer.concat(chunks);
}