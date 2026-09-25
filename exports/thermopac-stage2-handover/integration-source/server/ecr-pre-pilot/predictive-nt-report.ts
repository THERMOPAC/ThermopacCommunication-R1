import PDFDocument from 'pdfkit';
import { createHash } from 'node:crypto';
import { frozenMolecularBasis, reportTrials } from './predictive-nt-report-evidence';

const SIX_COMPONENTS = ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'] as const;
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
  if (!Number.isFinite(input)) return 'Not recorded';
  const absolute = Math.abs(input);
  if (absolute > 0 && (absolute < 1e-4 || absolute > 1e5)) return input.toExponential(2);
  return input.toFixed(digits).replace(/\.0+$|(?<=\.[0-9]*?)0+$/, '');
}

function label(input: string) {
  const targetLabels: Record<string, string> = {
    minimumNmpFreeRecoveryPct: 'Minimum RRBO recovery (%)',
    minimumRecoveryPct: 'Minimum RRBO recovery (%)',
    maximumNmpRaffinateWt: 'Maximum NMP in raffinate (wt%)',
    minimumRaffinateSaturatesWt: 'Minimum saturates (wt%)',
    maximumRaffinateTotalAromaticsWt: 'Maximum total aromatics (wt%)',
    maximumRaffinatePolarAromaticsWt: 'Maximum polar aromatics (wt%)',
    targetRaffinateSulfurPpm: 'Raffinate sulfur target (ppm)',
  };
  if (targetLabels[input]) return targetLabels[input];
  return input.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
}

const HYDROCARBON_COMPONENTS = ['SAT', 'MONO', 'DI', 'POLY', 'PA'] as const;

export const PREDICTIVE_NT_REPORT_RENDERER_VERSION =
  '2026-09-23-theoretical-stage-comparison-v1';

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
  if (!r.result || !Array.isArray(r.result.trials)) throw new Error('PREDICTIVE_NT_REPORT_RESULT_MISSING');
  const o = { ...r.result, trials: reportTrials(r.result) };
  const molecular = await frozenMolecularBasis(r.input, r.result);
  const components: string[] = Array.isArray(o?.componentOrder)
    ? o.componentOrder
    : [...SIX_COMPONENTS];
  const sevenComponent = components.length === 7 && components[6] === 'H2O';
  const s = r.input?.stage1Authority?.source?.stage1 ?? {};
  if (!o || !Array.isArray(o.trials)) throw new Error('PREDICTIVE_NT_REPORT_RESULT_MISSING');
  const projectRef = projectReference(r, s);
  const controlledNegative = o.releaseEligible === false && o.predictiveNt == null;
  const prePilotMultistage = ['7C-1.4.0', '7C-1.5.0', '7C-1.6.0'].includes(o.engineContractVersion);

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
  const sections: Array<{ title: string; page: number }> = [];
  let contentsPage = -1;
  const testedCounts = o.trials.map((trial: any) => trial.stageCount).join(', ');
  const scientific = (v: unknown, digits = 3) => finiteNumber(v) === null ? 'Not recorded' : Number(v).toExponential(digits);

  const text = (
    content: unknown, x: number, y: number, width: number, size = 8,
    color = COLORS.ink, bold = false, align: 'left' | 'center' | 'right' = 'left',
  ) => {
    doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
      .text(String(content ?? 'Not recorded'), x, y, { width, align, lineGap: 1.5, ellipsis: false });
  };
  const page = (title: string, landscape = false, subtitle = '') => {
    doc.addPage({
      size: 'A4',
      layout: landscape ? 'landscape' : 'portrait',
      margins: { top: 32, bottom: 32, left: 42, right: 42 },
    });
    pageNumber += 1;
    sections.push({ title, page: pageNumber });
    doc.outline.addItem(title);
    doc.rect(0, 0, doc.page.width, 12).fill(COLORS.teal);
    text(pageNumber, 42, 19, 40, 7, COLORS.muted);
    text(
      `PROJECT ${projectRef}  |  FROZEN STAGE-2 REPORT`,
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
      text(key, x + 7, y + index * row + 6, width * 0.42, 8.3, COLORS.muted, true);
      text(value(entry), x + width * 0.44, y + index * row + 6, width * 0.54 - 7, 8.6);
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
      const selected = headers[0] === 'N_T' && row[0] === String(o.predictiveNt);
      doc.rect(x, rowY, totalWidth, rowHeight).fill(selected ? '#DDF2EE' : rowIndex % 2 ? COLORS.pale : '#FFFFFF');
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

  page(`Predictive N_T — ${sevenComponent ? 'Seven-Component cCOSMO (with H2O)' : 'Six-Component COSMO-SAC-2010'}`);
  pill(
    controlledNegative
      ? (sevenComponent
        ? (prePilotMultistage
          ? 'PRE-PILOT MULTISTAGE PREDICTIVE MODEL — NO FULLY ACCEPTED TRIAL — NOT RELEASE ELIGIBLE'
          : 'IMPLEMENTED — PREDICTIVE QUALIFICATION PENDING — NOT RELEASE ELIGIBLE')
        : 'RESEARCH DIAGNOSTIC — NOT ACCEPTED — NOT RELEASE ELIGIBLE')
      : `PERSISTED QUALIFICATION STATUS — ${String(o.status ?? 'MISSING_EVIDENCE')}`,
    42, 98, 510, controlledNegative ? COLORS.red : COLORS.teal,
  );
  text('Executive summary', 42, 140, 510, 16, COLORS.navy, true);
  text(
    prePilotMultistage
      ? `Project ${projectRef} completed ${o.trials.length} simultaneous counter-current matrix trials. Predictive N_T is assigned only from a fully accepted physical multistage trial.`
      : `Project ${projectRef} completed ${o.trials.length} frozen candidate stage-count trials. A converged process-sensitivity trial is not an accepted Predictive N_T unless the separate scientific qualification is satisfied.`,
    42, 166, 510, 8.5,
  );
  grid([
    ['Project reference', projectRef],
    ['Job status', 'COMPLETED — report generated automatically'],
    ['N_T tested', testedCounts],
    ['Trials completed', `${o.trials.length} / ${r.input.ntTest == null ? (r.input.maximumStages ?? o.trials.length) : 1}`],
    ['Accepted Predictive N_T', o.predictiveNt ?? 'NOT ASSIGNED'],
    ['Established theoretical stages', o.establishedTheoreticalStages ?? 'Not established'],
    ['Pilot validated', o.pilotValidated ? 'Yes' : 'No'],
    ['Calibration required', o.calibrationRequired ? 'Yes' : 'No'],
    ['Release eligible', o.releaseEligible ? 'Yes' : 'No'],
  ], 42, 215, 510, 18);
  doc.roundedRect(42, 390, 510, 128, 4).fill('#FFF3E5');
  text('ENGINEERING RESULT', 55, 404, 480, 9, COLORS.amber, true);
  text(
    `Preferred engineering candidate: ${prePilotMultistage
      ? (o.predictiveNt == null ? 'NOT ASSIGNED — NO FULLY ACCEPTED TRIAL' : `N_T = ${o.predictiveNt}`)
      : 'NOT ASSIGNED'}`,
    55, 428, 480, 10, COLORS.ink, true,
  );
  text(
    prePilotMultistage
      ? 'Selection is reproducible: choose the smallest stage count whose complete simultaneous solution passes closure, positive-flow, phase, post-split TPD, branch-reproduction, and Stage-1 target gates. Experimental wet LLE is not an execution gate.'
      : 'No governed preferred-candidate selection rule is persisted for this run. The report therefore does not invent or hardcode a stage selection. Accepted Predictive N_T remains a separate scientific qualification result.',
    55, 452, 480, 8.2,
  );
  text(
    prePilotMultistage
      ? (
        o.sulfurPrediction?.status === 'CALCULABLE'
          ? `Allocation: ${value(o.sulfurPrediction.predictedRaffinateSulfurPpm, 2)} feed-basis ppm; removal ${value(o.sulfurPrediction.sulfurRemovalPct, 3)}%; historical target ${o.sulfurPrediction.targetStatus} — BASIS MISMATCH`
          : `Governed sulfur post-processing: NOT CALCULABLE — ${o.sulfurPrediction?.reason ?? 'invalid trial'}`
      )
      : 'COSMO-SAC sulfur prediction: NOT CALCULABLE',
    55, 492, 480, 8.2,
    prePilotMultistage ? COLORS.amber : COLORS.red,
    true,
  );
  text(`Completed ${new Date(r.completedAt).toISOString()}  •  Job ${r.id}`, 42, 760, 510, 7, COLORS.muted);
  const selected = o.trials.find((trial: any) => trial.stageCount === o.predictiveNt);
  if (selected) {
    text('Selected trial versus frozen targets', 42, 535, 510, 11, COLORS.navy, true);
    const entries = Object.entries(selected.targetCompliance ?? {})
      .filter(([key]) => key !== 'minimumNmpFreeRecoveryPct');
    table(['Target (mass basis)', 'Result', 'Limit', 'Margin', 'Saved status'],
      entries.map(([key, raw]) => {
        const entry = raw as any;
        const margin = finiteNumber(entry.target) !== null && finiteNumber(entry.calculated) !== null
          ? (entry.direction === 'MINIMUM' || key.startsWith('minimum') ? entry.calculated - entry.target : entry.target - entry.calculated) : null;
        return [key === 'minimumRecoveryPct' ? 'RRBO recovery %' : key === 'targetRaffinateSulfurPpm'
          ? 'Raffinate sulfur target (ppm)*' : label(key).replace('maximum ', 'Max ').replace('minimum ', 'Min '),
        value(entry.calculated), value(entry.target), key === 'targetRaffinateSulfurPpm' && prePilotMultistage ? 'Mismatch' : value(margin), entry.status ?? 'Not recorded'];
      }), 42, 555, [228, 68, 68, 68, 78], 20, 7);
    if (prePilotMultistage) text('*BASIS MISMATCH: result is feed-basis retained sulfur; target is intended raffinate concentration. Historical PASS is preserved, NOT demonstrated product-concentration compliance.', 42, 700, 510, 8, COLORS.amber, true);
  }

  const comparisonTargetOrder = [
    'minimumRecoveryPct',
    'minimumNmpFreeRecoveryPct',
    'maximumNmpRaffinateWt',
    'minimumRaffinateSaturatesWt',
    'maximumRaffinateTotalAromaticsWt',
    'maximumRaffinatePolarAromaticsWt',
    'targetRaffinateSulfurPpm',
  ];
  // This page is a literal view of the frozen result fields. In particular, do
  // not use reporting-enriched aliases when enumerating targetCompliance.
  const comparisonTrials: any[] = r.result.trials;
  const frozenTargetKeys = Array.from(new Set(
    comparisonTrials.flatMap((trial: any) => Object.keys(trial?.targetCompliance ?? {})),
  )).sort((left, right) => {
    const leftIndex = comparisonTargetOrder.indexOf(left);
    const rightIndex = comparisonTargetOrder.indexOf(right);
    return (leftIndex < 0 ? comparisonTargetOrder.length : leftIndex)
      - (rightIndex < 0 ? comparisonTargetOrder.length : rightIndex)
      || left.localeCompare(right);
  });
  const acceptedStageCounts = comparisonTrials
    .filter((trial: any) => trial?.accepted === true && finiteNumber(trial?.stageCount) !== null)
    .map((trial: any) => Number(trial.stageCount));
  const minimumSavedAccepted = acceptedStageCounts.length > 0
    ? Math.min(...acceptedStageCounts)
    : null;
  const targetHeading = (key: string) => {
    const saved = comparisonTrials
      .map((trial: any) => trial?.targetCompliance?.[key])
      .filter((entry: any) => entry && typeof entry === 'object');
    const targets = Array.from(new Set(saved
      .map((entry: any) => finiteNumber(entry.target))
      .filter((entry: number | null): entry is number => entry !== null)));
    const directions = Array.from(new Set(saved
      .map((entry: any) => entry.direction)
      .filter((entry: unknown): entry is string => typeof entry === 'string' && entry.length > 0)));
    const shortLabels: Record<string, string> = {
      minimumRecoveryPct: 'RRBO recovery',
      minimumNmpFreeRecoveryPct: 'RRBO recovery',
      maximumNmpRaffinateWt: 'NMP in raffinate',
      minimumRaffinateSaturatesWt: 'Saturates',
      maximumRaffinateTotalAromaticsWt: 'Total aromatics',
      maximumRaffinatePolarAromaticsWt: 'Polar aromatics',
      targetRaffinateSulfurPpm: 'Sulfur*',
    };
    const unit = key === 'targetRaffinateSulfurPpm' ? ' ppm' : ' wt%';
    const limit = targets.length === 1 && directions.length === 1
      ? `${directions[0] === 'MINIMUM' ? '>=' : directions[0] === 'MAXIMUM' ? '<=' : directions[0]} ${value(targets[0])}${unit}`
      : targets.length === 0
        ? 'saved limit unavailable'
        : 'mixed saved limits';
    return `${shortLabels[key] ?? label(key)}\n${limit}`;
  };

  page(
    'Theoretical-stage comparison & selection',
    true,
    'Saved target checks, numerical acceptance, and final saved acceptance are reported separately; no scientific acceptance is recalculated.',
  );
  const comparisonWidth = doc.page.width - 84;
  doc.roundedRect(42, 92, comparisonWidth, 46, 4)
    .fill(minimumSavedAccepted === null ? '#FFF3E5' : '#E4F3EC');
  text(
    minimumSavedAccepted === null
      ? 'MINIMUM SAVED ACCEPTED N_T: NOT ASSIGNED'
      : `MINIMUM SAVED ACCEPTED N_T: ${minimumSavedAccepted}`,
    54, 105, comparisonWidth - 24, 11,
    minimumSavedAccepted === null ? COLORS.amber : COLORS.green, true,
  );
  text(
    minimumSavedAccepted === null
      ? 'No trial in the frozen result has saved acceptance = true.'
      : 'Highlight identifies the lowest stage count with saved acceptance = true; it is not an economic optimum or a reporting re-evaluation.',
    54, 122, comparisonWidth - 24, 7.4, COLORS.muted,
  );
  if (frozenTargetKeys.length === 0) {
    doc.roundedRect(42, 158, comparisonWidth, 92, 4).fill(COLORS.pale);
    text('SAVED TARGET COMPARISON UNAVAILABLE', 54, 178, comparisonWidth - 24, 11, COLORS.amber, true);
    text('No targetCompliance entries are persisted for any frozen trial. Numerical and saved acceptance states are listed below without inventing target limits or results.', 54, 202, comparisonWidth - 24, 8.5);
  }
  const fixedWidths = [36, 78, 92];
  const availableTargetWidth = comparisonWidth - fixedWidths.reduce((sum, width) => sum + width, 0);
  const targetWidth = frozenTargetKeys.length > 0 ? availableTargetWidth / frozenTargetKeys.length : availableTargetWidth;
  const widths = [
    fixedWidths[0],
    ...frozenTargetKeys.map(() => targetWidth),
    fixedWidths[1],
    fixedWidths[2],
  ];
  const headers = ['N_T', ...frozenTargetKeys.map(targetHeading), 'Numerical\nchecks', 'Saved\nacceptance'];
  const tableY = frozenTargetKeys.length === 0 ? 270 : 158;
  const rowHeight = 25;
  doc.rect(42, tableY, comparisonWidth, 38).fill(COLORS.navy);
  let comparisonX = 42;
  headers.forEach((header, index) => {
    text(header, comparisonX + 2, tableY + 8, widths[index] - 4,
      frozenTargetKeys.length > 7 ? 5.2 : 6.2, '#FFFFFF', true, 'center');
    comparisonX += widths[index];
  });
  comparisonTrials.forEach((trial: any, rowIndex: number) => {
    const rowY = tableY + 38 + rowIndex * rowHeight;
    const highlighted = minimumSavedAccepted !== null
      && Number(trial?.stageCount) === minimumSavedAccepted;
    doc.rect(42, rowY, comparisonWidth, rowHeight)
      .fill(highlighted ? '#DDF2EE' : rowIndex % 2 ? COLORS.pale : '#FFFFFF');
    const row = [
      String(trial?.stageCount ?? '—'),
      ...frozenTargetKeys.map((key) => {
        const entry = trial?.targetCompliance?.[key];
        if (!entry || typeof entry !== 'object') return 'UNAVAILABLE';
        return `${value(entry.calculated)}\n${entry.status ?? 'STATUS UNAVAILABLE'}`;
      }),
      trial?.numericalAcceptancePassed === true
        ? 'PASS'
        : trial?.numericalAcceptancePassed === false
          ? 'FAIL'
          : 'UNAVAILABLE',
      trial?.accepted === true
        ? 'ACCEPTED'
        : trial?.accepted === false
          ? 'NOT ACCEPTED'
          : 'UNAVAILABLE',
    ];
    comparisonX = 42;
    row.forEach((entry, index) => {
      const status = String(entry).split('\n').at(-1);
      const color = ['PASS', 'ACCEPTED'].includes(status ?? '') ? COLORS.green
        : ['FAIL', 'NOT ACCEPTED'].includes(status ?? '') ? COLORS.red
          : status === 'UNAVAILABLE' || status === 'STATUS UNAVAILABLE' ? COLORS.amber
            : COLORS.ink;
      text(entry, comparisonX + 2, rowY + 5, widths[index] - 4,
        frozenTargetKeys.length > 7 ? 5.2 : 6.4, color,
        highlighted || ['PASS', 'FAIL', 'ACCEPTED', 'NOT ACCEPTED'].includes(status ?? ''),
        'center');
      comparisonX += widths[index];
    });
  });
  const comparisonNotesY = tableY + 38 + comparisonTrials.length * rowHeight + 12;
  text(
    'BASIS  Recovery is NMP-free hydrocarbon recovery. Saturates and aromatics are wt% on an NMP-free raffinate basis; NMP is wt% of total raffinate. Displayed limits, values, and PASS/FAIL statuses come only from each frozen targetCompliance record. Missing and mixed saved targets remain explicit.',
    42, comparisonNotesY, comparisonWidth, 7.2, COLORS.muted,
  );
  text(
    '* SULFUR BASIS MISMATCH  The saved result is feed-basis retained-sulfur equivalent, while the saved intended target is raffinate concentration. Historical saved PASS/FAIL is preserved, but PASS is NOT demonstrated product-concentration compliance.',
    42, comparisonNotesY + 31, comparisonWidth, 7.5, COLORS.amber, true,
  );
  text(
    'ACCEPTANCE  Product-target statuses, numerical checks, and saved acceptance are distinct frozen fields. Product-target passes alone do not establish acceptance. This page does not mutate the job snapshot, rerun equilibrium, or recompute scientific acceptance.',
    42, comparisonNotesY + 55, comparisonWidth, 7.2, COLORS.muted, true,
  );

  page('Contents and reading guide');
  contentsPage = pageNumber - 1;
  text('Frozen acceptance is preserved. Reporting-derived component removal does not re-evaluate qualification. Green comparison rows identify the saved selected trial; unaccepted trials remain diagnostic.', 42, 92, 510, 9);
  text('Main report and appendix groups are indexed below; PDF bookmarks provide every trial page.', 42, 140, 510, 9);

  page('1. Frozen Design Basis', false, 'OWNER-CONTROLLED / SAVED STAGE-1 INPUT AUTHORITY');
  grid([
    ['Project reference', projectRef],
    ['RRBO grade', s.rrboGrade],
    ['Operating temperature', `${value(s.operatingTemperatureC)} °C`],
    ['Operating pressure', `${value(s.operatingPressure)} bar(g)`],
    ['Phase configuration', s.phaseConfiguration],
    ['Solvent/oil mass ratio', s.solventOilRatio],
    ['Maximum stages', s.maximumStages],
    ['N_T tested', testedCounts],
    ['SAT identity', s.satIdentity],
    ['MONO identity', s.monoIdentity],
  ], 42, 100, 510, 25);
  text('Feed composition — mass basis', 42, 350, 510, 12, COLORS.navy, true);
  table(
    [...components],
    [[
      s.saturatesWt, s.monoAromaticsWt, s.diAromaticsWt, s.polyAromaticsWt,
      s.polarAromaticsWt, s.nmpInFeedWt,
       ...(sevenComponent ? [o.trials[0]?.boundaryStreams?.oilFeed?.massFractions?.[6] == null ? null : 100 * o.trials[0].boundaryStreams.oilFeed.massFractions[6]] : []),
    ].map((v) => v == null ? 'Not recorded' : `${value(Number(v), 5)} wt%`)],
    42, 380, components.map(() => 510 / components.length), 32, 7,
  );
  text('Saved product targets', 42, 475, 510, 12, COLORS.navy, true);
  grid([
    ['Maximum total aromatics', `${value(s.targetRaffinateTotalAromaticsWt)} wt% NMP-free`],
    ['Maximum polar aromatics', `${value(s.targetRaffinatePolarAromaticsWt)} wt% NMP-free`],
    ['Minimum saturates', `${value(s.minimumRaffinateSaturatesWt)} wt% NMP-free`],
    ['Minimum RRBO recovery', `${value(s.minimumRecoveryPct)} wt%`],
    ['Maximum NMP in raffinate', `${value(s.maximumNmpRaffinateWt)} wt% full stream`],
    ['Raffinate sulfur target', `${value(s.targetRaffinateSulfurPpm)} ppm`],
  ], 42, 505, 510, 24);

  page('1.2 Frozen solvent and stream basis', false, 'Saved Stage-1 conditions and actual frozen boundary construction');
  grid([
    ['Fresh-solvent NMP purity', `${value(s.nmpPurityWt)} wt%`],
    ['Fresh-solvent water', `${value(s.nmpWaterWt)} wt%`],
    ['S/O construction', r.input.wetSolventConstruction?.basis ?? 'Not recorded'],
    ['Total wet solvent / oil mass', r.input.wetSolventConstruction?.totalWetSolventMassPerUnitFeedMass],
    ['Dry NMP / oil mass', value(r.input.wetSolventConstruction?.dryNmpMassPerUnitFeedMass, 6)],
    ['Water / oil mass', value(r.input.wetSolventConstruction?.waterMassPerUnitFeedMass, 6)],
    ['Physical design feed rate', `${value(s.designFeedRateLph)} L/h`],
    ['Frozen boundary oil mass', o.trials[0]?.boundaryStreams?.oilFeed?.mass],
    ['Frozen boundary wet-solvent mass', o.trials[0]?.boundaryStreams?.freshWetSolvent?.mass],
  ], 42, 105, 510, 34);
  text('Boundary quantities use the persisted normalized stream basis, not plant molar flow. Component mass divided by component moles gives the frozen molecular weight (g/mol on a gram/mol normalization). RRBO recovery and product composition exclude NMP and H2O; total aromatics = MONO + DI + POLY, with PA reported separately. NMP and H2O contents use the full raffinate stream. S/O is total wet-solvent mass / oil-feed mass when the frozen construction says FIXED_TOTAL_WET_SOLVENT_MASS.', 42, 440, 510, 10);
  grid([
    ['RRBO / NMP density', `${value(s.rrboDensityKgM3)} / ${value(s.nmpDensityKgM3)} kg/m3`],
    ['RRBO / NMP dynamic viscosity', `${value(s.rrboDynamicViscosityCp)} / ${value(s.nmpDynamicViscosityCp)} cP`],
    ['Saved interfacial tension', `${value(s.rrboInterfacialTensionMnM)} mN/m`],
    ['Saved basis notes', s.designBasisNotes || 'No notes recorded'],
  ], 42, 600, 510, 30);

  page('1.3 Frozen thermodynamic basis', false, 'NIST COSMO-SAC-2010 / cCOSMO implementation and job-specific amendments');
  grid([
    ['Base activity model', o.stage1TargetGovernance?.predictiveNtEngineScope?.thermodynamicModel ?? 'Not recorded'],
    ['Actual model identity', o.engine?.modelIdentity ?? o.scientificIntegrity?.activeThermodynamicModel ?? 'Not recorded'],
    ['Engine version / contract', o.engine?.engineVersion ?? o.engineContractVersion],
    ['Native Gibbs contribution retained', String(o.scientificIntegrity?.nativeGibbsContributionRetained ?? 'Not recorded')],
    ['Inherited residual applied', String(o.scientificIntegrity?.inheritedSixComponentResidualApplied ?? 'Not recorded')],
    ['Additive interaction form', o.scientificIntegrity?.interactionForm ?? 'Not recorded'],
    ['Interaction pairs / parameters', `${o.scientificIntegrity?.interactionPairCount ?? 'Not recorded'} / ${o.scientificIntegrity?.interactionParameterCount ?? 'Not recorded'}`],
  ], 42, 100, 510, 48);
  text(o.scientificIntegrity?.nativeGibbsContributionRetained === true
    ? 'cCOSMO identifies the implementation, not a different molecular basis. For this native-plus-RK contract the NIST COSMO-SAC-2010 contribution is retained with the persisted additive Redlich-Kister interaction model. This is not an unamended COSMO-SAC prediction. Model and parameter digests, molecular generation routes and sigma-profile provenance follow in the provenance appendix. Missing artifacts are never replaced with current-model values.'
    : 'Only the model identity and amendments recorded in this frozen job are reported. Missing model/version evidence remains explicitly unavailable; no current model or native-plus-RK amendment is assumed. See the provenance appendix for the available immutable references.', 42, 465, 510, 10);
  page(`1.4 ${sevenComponent ? 'Seven' : 'Six'}-component molecular identities`, true, 'Identities from hash-verified frozen generation manifests; unavailable identities remain explicit');
  const order = o.componentOrder ?? components;
  table(['Family', 'Molecule / surrogate', 'CAS', 'MW g/mol*'],
    order.map((family: string) => {
      const c = molecular.components.find((entry: any) => entry.family === family);
      const i = order.indexOf(family);
      const b = o.trials[0]?.boundaryStreams;
      const stream = (b?.oilFeed?.componentMoles?.[i] ?? 0) > 0 ? b.oilFeed : b?.freshWetSolvent;
      const n = stream?.componentMoles?.[i], mass = stream?.componentMass?.[i];
      return [family, c?.name ?? 'Not recorded', c?.cas ?? 'Not recorded', n > 0 && finiteNumber(mass) !== null ? value(mass / n, 5) : 'Not recorded'];
    }), 42, 110, [65, 450, 120, 115], 43, 10);
  text('*Reporting reconstruction from persisted boundary component mass / component moles, not a replacement molecular-weight database. PA is a non-sulfur-bearing surrogate. H2O is explicitly included in equilibrium.', 42, 480, 750, 10);

  page(
    '1.5 Frozen Design Basis — Sulfur Allocation',
    false,
    'OWNER-CONTROLLED MASS ALLOCATION — saved with the completed Stage-1 snapshot',
  );
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
    'This allocation is an owner-controlled mass-allocation basis. It is not a hidden factor, does not make sulfur a thermodynamic component, and does not alter the seven-component equilibrium solution.',
    42, 425, 510, 8.5, COLORS.amber, true,
  );

  page(
    '2. Overall N_T Engineering Comparison',
    true,
    'Primary process comparison. Product composition is wt% on an NMP-free hydrocarbon basis; NMP is wt% of total raffinate.',
  );
  table(
    ['N_T', 'Closure', 'Recovery %', 'NMP wt%', 'SAT wt%', 'Arom wt%', 'PA wt%', 'Sulfur ppm*', 'Targets', 'Saved acceptance'],
    o.trials.map((trial: any) => {
      const metrics = trial.productMetrics ?? {};
      const extraction = metrics.componentExtractionPct ?? {};
      const sulfur = prePilotMultistage ? trial.sulfurPrediction : calculatePrePilotSulfurEstimate(s, trial);
      const closed = trialIsClosed(trial);
      return [
        String(trial.stageCount),
        solverDisplayStatus(trial),
        value(metrics.nmpFreeHydrocarbonRecoveryPct, 2),
        value(metrics.nmpInTotalRaffinateWt, 2),
        value(metrics.raffinateSaturatesWtNmpFree, 2),
        value(metrics.raffinateTotalAromaticsWtNmpFree, 2),
        value(metrics.raffinatePolarAromaticsWtNmpFree, 2),
        sulfur?.status === 'CALCULABLE'
          ? value(prePilotMultistage ? sulfur.predictedRaffinateSulfurPpm : sulfur.totalPpm, 1)
          : 'N/C',
        closed
          ? (trial.allCalculableTargetsPass ? 'PASS' : 'FAIL')
          : trial?.residualClosureStatus === 'UNCLOSED'
            ? 'DIAGNOSTIC_ONLY — UNCONVERGED'
            : 'NOT_CALCULABLE / MISSING_EVIDENCE',
         trial.accepted ? 'ACCEPTED' : 'NOT ACCEPTED',
      ];
    }),
    42, 100, [35, 65, 75, 65, 65, 65, 65, 85, 70, 160], 32, 8,
  );
  const comparisonNoteY = 100 + 32 * (o.trials.length + 1) + 14;
  text(
    prePilotMultistage
      ? '*Sulfur BASIS MISMATCH: saved result is feed-basis retained sulfur; intended target is raffinate concentration. Historical target PASS is NOT demonstrated product-concentration compliance. All saved statuses/selection remain unchanged. Selected trial is highlighted.'
      : 'Recovery = NMP-free RRBO recovery. Removal/loss = component-relative boundary removal. Sulfur = PRE-PILOT ALLOCATION ESTIMATE ONLY. Unconverged values are diagnostic only and receive no engineering PASS/FAIL.',
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
    42, 105, [40, 90, 105, 90, 110, 100, 110, 105], 27, 8,
  );
  text('Reporting-derived where metrics were absent: removal/loss (%) = 100*(oil-feed component moles - final-raffinate component moles)/oil-feed component moles. The same component MW cancels, so component-relative mass removal is identical. No equilibrium rerun. Recovery uses persisted hydrocarbon mass recovery (or boundary component masses if absent). SAT = loss; NMP removal = not applicable. Unaccepted trials remain diagnostic.', 42, 430, 755, 9, COLORS.amber, true);

  page(
    prePilotMultistage ? '4. Governed Sulfur Post-Processing' : '4. Pre-Pilot Sulfur Allocation Estimate',
    true,
    prePilotMultistage
      ? 'POST-PROCESSING MASS ALLOCATION — DOES NOT MODIFY THERMODYNAMICS OR EQUILIBRIUM'
      : 'ESTIMATE ONLY — NOT A COSMO-SAC SULFUR PREDICTION — NOT PILOT VALIDATED',
  );
  table(
    ['N_T', 'Closure', 'SAT ppm', 'MONO ppm', 'DI ppm', 'POLY ppm', 'PA ppm',
      prePilotMultistage ? 'Feed-basis ppm' : 'Product ppm',
      prePilotMultistage ? 'Allocated removal %' : 'Not applicable', 'Raffinate target ppm*', prePilotMultistage ? 'Historical target*' : 'Estimate target'],
    o.trials.map((trial: any) => {
      const estimate = prePilotMultistage ? trial.sulfurPrediction : calculatePrePilotSulfurEstimate(s, trial);
      const contributions = prePilotMultistage
        ? estimate?.remainingContributionsPpm
        : estimate?.contributionsPpm;
      const total = prePilotMultistage
        ? estimate?.predictedRaffinateSulfurPpm
        : estimate?.totalPpm;
      return [
        String(trial.stageCount),
        solverDisplayStatus(trial),
        value(contributions?.SAT, 2),
        value(contributions?.MONO, 2),
        value(contributions?.DI, 2),
        value(contributions?.POLY, 2),
        value(contributions?.PA, 2),
        estimate?.status === 'CALCULABLE' ? value(total, 2) : 'Not calculable',
        prePilotMultistage && estimate?.status === 'CALCULABLE'
          ? value(estimate.sulfurRemovalPct, 3)
          : '—',
        value(finiteNumber(s.targetRaffinateSulfurPpm), 2),
        estimate?.status === 'CALCULABLE' ? String(estimate.targetStatus) : 'NOT_CALCULABLE',
      ];
    }),
    42, 105, [30, 60, 45, 60, 55, 60, 55, 85, 80, 60, 160], 29, 7.5,
  );
  text(
    prePilotMultistage
      ? 'Frozen allocation basis: S_retained = S_feed * sum(allocation_i * m_i,R / m_i,F). Allocated sulfur mass removal (%) = 100*(1 - S_retained/S_feed). Feed-basis ppm is NOT recovery-normalized raffinate concentration; the frozen model does not divide by RRBO recovery. Existing values and target decisions are preserved, not corrected scientifically.'
      : 'Formal COSMO-SAC sulfur prediction: NOT CALCULABLE',
    42, 440, 755, 9, prePilotMultistage ? COLORS.navy : COLORS.red, true,
  );
  text(prePilotMultistage
    ? '*BASIS MISMATCH: the original target is intended raffinate sulfur concentration, but the saved comparison uses feed-basis retained sulfur. Historical PASS is NOT demonstrated product-concentration compliance. Concentration reduction = 100*(1-C_R/C_F) requires consistent concentration bases. Direct thermodynamic sulfur prediction remains NOT CALCULABLE. Scientific review requires separate authorization; no result or target decision is altered.'
    : 'Direct thermodynamic sulfur prediction: NOT CALCULABLE. This legacy allocation estimate divides retained sulfur by hydrocarbon recovery to report estimated product ppm. Estimated target status is not scientific acceptance. Concentration reduction = 100*(1 - C_R/C_F); allocated sulfur mass removal = 100*(1 - (C_R/C_F)*hydrocarbon recovery fraction). Neither changes the frozen solver or acceptance result.', 42, 500, 755, 9);

  page('Engineering trends versus frozen targets', true, 'Filled green = accepted; red cross = not accepted. Points never confer scientific qualification.');
  const panels = [
    ['Total aromatics (wt%, hydrocarbon basis)', 'raffinateTotalAromaticsWtNmpFree', s.targetRaffinateTotalAromaticsWt],
    ['Polar aromatics (wt%, hydrocarbon basis)', 'raffinatePolarAromaticsWtNmpFree', s.targetRaffinatePolarAromaticsWt],
    ['RRBO mass recovery (%)', 'nmpFreeHydrocarbonRecoveryPct', s.minimumRecoveryPct],
    ['Allocated retained sulfur (feed-basis ppm)', 'sulfur', s.targetRaffinateSulfurPpm],
  ];
  panels.forEach(([title, key, target], panel) => {
    const x = 65 + (panel % 2) * 395, y = 130 + Math.floor(panel / 2) * 215, w = 315, h = 125;
    text(title, x - 15, y - 32, 355, 10, COLORS.navy, true);
    const points = o.trials.map((t: any) => ({ n: t.stageCount, accepted: t.accepted,
      v: key === 'sulfur' ? (t.sulfurPrediction?.status === 'CALCULABLE' ? t.sulfurPrediction.predictedRaffinateSulfurPpm : null) : t.productMetrics?.[key as string] }))
      .filter((p: any) => finiteNumber(p.v) !== null);
    const vals = points.map((p: any) => p.v).concat(finiteNumber(target) !== null ? [target] : []);
    if (!vals.length) { text('No recorded values', x, y, w, 10); return; }
    const lo = Math.max(0, Math.min(...vals) * 0.9), hi = Math.max(...vals) * 1.08 || 1;
    const ns = o.trials.map((t: any) => t.stageCount), nmin = Math.min(...ns), nmax = Math.max(...ns);
    const px = (n: number) => x + (n - nmin) / Math.max(1, nmax - nmin) * w;
    const py = (v: number) => y + h - (v - lo) / (hi - lo) * h;
    doc.strokeColor(COLORS.line).lineWidth(0.7).moveTo(x, y).lineTo(x, y + h).lineTo(x + w, y + h).stroke();
    text(value(hi, 1), x - 38, y - 4, 34, 7, COLORS.muted, false, 'right');
    text(value(lo, 1), x - 38, y + h - 5, 34, 7, COLORS.muted, false, 'right');
    if (finiteNumber(target) !== null) {
      doc.strokeColor(COLORS.amber).dash(3).moveTo(x, py(Number(target))).lineTo(x + w, py(Number(target))).stroke().undash();
      text(key === 'sulfur' ? `Raffinate target ${value(target)}: DIFFERENT BASIS, reference only` : `Target ${value(target)}`, x + 5, py(Number(target)) - 12, w, 7, COLORS.amber);
    }
    points.forEach((p: any) => {
      if (p.accepted) doc.circle(px(p.n), py(p.v), p.n === o.predictiveNt ? 4 : 2.6).fill(COLORS.green);
      else doc.strokeColor(COLORS.red).moveTo(px(p.n) - 3, py(p.v) - 3).lineTo(px(p.n) + 3, py(p.v) + 3)
        .moveTo(px(p.n) - 3, py(p.v) + 3).lineTo(px(p.n) + 3, py(p.v) - 3).stroke();
    });
    ns.forEach((n: number) => text(String(n), px(n) - 9, y + h + 7, 18, 7, COLORS.muted, false, 'center'));
    text('N_T (theoretical stages)', x + 65, y + h + 22, 200, 8, COLORS.muted);
  });

  page('5. Engineering Stage Selection', false, 'Preferred engineering candidate, accepted Predictive N_T, and established theoretical stages are separate states');
  grid([
    ['Preferred engineering/process-sensitivity candidate',
      prePilotMultistage && o.predictiveNt != null ? `N_T = ${o.predictiveNt}` : 'NOT ASSIGNED'],
    ['Accepted Predictive N_T', o.predictiveNt ?? 'NOT ASSIGNED'],
    ['Established theoretical stages', o.establishedTheoreticalStages ?? 'NOT ESTABLISHED'],
  ], 42, 110, 510, 38);
  doc.roundedRect(42, 260, 510, 120, 4).fill('#FFF3E5');
  text('SELECTION GOVERNANCE', 55, 278, 480, 9, COLORS.amber, true);
  text(
    prePilotMultistage
      ? 'The persisted deterministic rule selects the smallest fully accepted simultaneous trial. Collapsed stages are NO_PHYSICAL_LLE and remain unselected; numerical or target failures cannot become Predictive N_T through presentation logic.'
      : 'No explicit deterministic preferred-candidate selection rule is persisted for this completed run. No stage is selected by this report. Unconverged trials and scientifically unqualified trials can never become an accepted Predictive N_T through presentation logic.',
    55, 305, 480, 8.5,
  );
  const preceding = o.trials.filter((t: any) => selected && t.stageCount < selected.stageCount).at(-1);
  if (preceding) {
    const failures = Object.entries(preceding.targetCompliance ?? {}).filter(([, v]) => (v as any)?.status === 'FAIL')
      .map(([key, v]) => `${label(key)}: ${value((v as any).calculated, 4)} versus ${value((v as any).target, 4)}`);
    text(`Immediately preceding trial N_T=${preceding.stageCount}: ${failures.length ? failures.join('; ') : preceding.reportingDisposition}. Selection shown above is persisted, not recomputed by this report.`, 42, 415, 510, 10);
  }

  page('6. Scientific Qualification Summary', false, 'Exact persisted evidence; PASS is never inferred from the absence of a blocker');
  const qualificationBlockers = Array.from(new Set(
    o.trials.flatMap((trial: any) => (trial.acceptanceBlockers ?? []).map((blocker: any) => blocker.code ?? String(blocker))),
  ));
  grid([
    [sevenComponent ? 'Seven-component molecular basis incl. H2O' : 'Six-component molecular basis',
      sevenComponent ? 'PERSISTED' : (o.stage1TargetGovernance?.sixComponentCosmoSacBasisManifestSha256 ? 'PERSISTED' : 'MISSING_EVIDENCE')],
    ['Stage-1 authority', r.input?.stage1Authority?.snapshotHash ? 'PERSISTED' : 'MISSING_EVIDENCE'],
    [prePilotMultistage ? 'Combined endpoint closure' : 'Primary solver closure', explicitClosureSummary(o.trials)],
    ['Multistart: both endpoints closed', explicitClosureSummary(o.trials, true)],
    ['Global TPD stability', sevenComponent
       ? (prePilotMultistage
         ? 'Per-stage TPD and explicit MONO-rich evidence in trial appendices'
        : 'IMPLEMENTED — PREDICTIVE QUALIFICATION PENDING')
      : (o.globalStabilityQualification?.status ?? 'NOT_CALCULABLE / MISSING_EVIDENCE')],
    ['Sulfur thermodynamic prediction', 'NOT CALCULABLE'],
    ['Pilot validation', o.pilotValidated ? 'PASS' : 'NOT VALIDATED'],
    ['Calibration requirement', o.calibrationRequired ? 'REQUIRED' : 'NOT REQUIRED'],
    ['Release eligibility', o.releaseEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'],
    ['Accepted Predictive N_T', o.predictiveNt ?? 'NOT ASSIGNED'],
  ], 42, 100, 510, 28);
  text('Main-report blocker summary', 42, 410, 510, 11, COLORS.navy, true);
   text(qualificationBlockers.length ? `${qualificationBlockers.length} exact trial blocker code(s); see Appendix C.` : 'No exact blocker-code array is recorded. This is NOT evidence of acceptance. Appendix C lists persisted numerical, target and stage dispositions, including rejected trials.', 42, 438, 510, 9);
   text('Evidence completeness is separate from saved acceptance. In supported 7C matrix contracts, closure and termination status are combined endpoint fields. CLOSED establishes both endpoints closed; UNCLOSED does not identify the failing endpoint. Individual optimizer terminations are not recorded. Native residuals and branch differences are preserved; no gate or selected N_T changes.', 42, 510, 510, 10);

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
       `Appendix A.${trial.stageCount}.1 — N_T=${trial.stageCount} Numerical Diagnostics`,
      true,
       `${trial.accepted ? 'ACCEPTED' : 'NOT ACCEPTED'} (persisted) | numerical acceptance ${trial.numericalAcceptancePassed === true ? 'PASS' : trial.numericalAcceptancePassed === false ? 'FAIL' : 'Not recorded'} | maximum component balance residual ${scientific(trial.maximumOverallComponentBalanceResidualMol)}`,
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
      `${trial.multistartEvidence?.combinedTerminationStatus ? 'Combined endpoint status' : 'Primary termination'} ${trial.solverTerminationStatus ?? 'MISSING_EVIDENCE'} | Closure ${solverDisplayStatus(trial)} | Scaled residual ${scientific(trial.maximumScaledEquationResidual)} | Branch ${branchComparisonEvaluated && branchDifference !== null ? `EVALUATED (${branchDifference.toExponential(3)})` : trial.multistartEvidence?.bothStartsClosed === false ? 'NOT EVALUABLE — ENDPOINT UNCLOSED' : 'NOT EVALUABLE — MISSING EVIDENCE'}`,
      42, 90 + shift, 755, 8, COLORS.ink, true,
    );
    const blockers = (trial.acceptanceBlockers ?? [])
      .map((blocker: any) => blocker.code ?? 'UNSPECIFIED_GATE_FAILURE').join(' · ');
    text(`Exact blocker codes: ${blockers || 'Not recorded; see persisted disposition in Appendix C'}`, 42, 110 + shift, 755, 7, COLORS.amber, true);
    text(
      prePilotMultistage
        ? 'Targets: hydrocarbon mass basis; NMP full-stream; sulfur feed-basis result vs raffinate target: BASIS MISMATCH'
        : 'Product targets — MASS BASIS (NMP-free hydrocarbon basis except total-raffinate NMP wt%)',
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
           key === 'minimumNmpFreeRecoveryPct' ? 'Minimum RRBO recovery (%)' : label(key),
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
      ['Basis', ...components],
      [[
        'Removal / loss',
         value(metrics.satLossPct ?? satLoss, 4),
        value(extraction.MONO, 4),
        value(extraction.DI, 4),
        value(extraction.POLY, 4),
        value(extraction.PA, 4),
        'NOT APPLICABLE',
        ...(sevenComponent ? ['NOT APPLICABLE'] : []),
      ]],
      42, 315 + shift, [90, ...components.map(() => 660 / components.length)], 20, 7,
    );
    table(
      ['Component moles', ...components],
      ['oilFeed', sevenComponent ? 'freshWetSolvent' : 'freshNmp', 'finalRaffinate', 'finalExtract'].map((key) => [
        label(key),
        ...(streams[key]?.componentMoles ?? []).map((entry: number) => Number(entry).toExponential(4)),
      ]),
      42, 370 + shift, [90, ...components.map(() => 660 / components.length)],
      trialClosed ? 19 : 16, 6.5,
    );
    text(`Overall ${sevenComponent ? 'seven' : 'six'}-component balance residual — component moles`, 42, 480 + shift, 755, 10, COLORS.navy, true);
    table(
      ['Basis', ...components],
      [[
        'Residual',
        ...(trial.overallComponentBalanceResidualMol ?? [])
          .map((entry: number) => Number(entry).toExponential(3)),
      ]],
      42, 500 + shift, [90, ...components.map(() => 660 / components.length)], 18, 6.5,
    );

    page(
       `Appendix A.${trial.stageCount}.2 — Stage TPD and Stability Evidence`,
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
       scientific(stage.maximumComponentBalanceResidualMol),
       stage.accepted === true ? 'PASS' : stage.accepted === false ? 'FAIL' : 'Not recorded',
       scientific(stage.isoactivityLogResidual),
       scientific(stage.localPostSplitStability?.raffinate?.minimumEigenvalue),
       scientific(stage.localPostSplitStability?.extract?.minimumEigenvalue),
       scientific(stage.postSplitTpdSearch?.raffinate?.minimum),
       scientific(stage.postSplitTpdSearch?.extract?.minimum),
    ]);
    table(
      ['Stage', 'Local balance', 'Stage qualification', 'Isoactivity', 'R min eig', 'E min eig', 'R TPD min', 'E TPD min'],
      diagnosticRows, 42, trialClosed ? 100 : 115,
      [55, 105, 90, 90, 100, 100, 100, 100], 23, 8,
    );
    const stageFlag = (v: unknown) => v === true ? 'PASS' : v === false ? 'FAIL' : 'Not recorded';
    text('Persisted refinement / explicit MONO-rich acceptance (not inferred from the minimum)', 42, 367, 750, 9, COLORS.navy, true);
    table(['Stage', 'R refinements', 'E refinements', 'R MONO-rich', 'E MONO-rich'],
      (trial.stages ?? []).map((stage: any) => [
        String(stage.stageFromFeedEnd),
        stageFlag(stage.postSplitTpdSearch?.raffinate?.allRefinementsAccepted),
        stageFlag(stage.postSplitTpdSearch?.extract?.allRefinementsAccepted),
        stageFlag(stage.postSplitTpdSearch?.raffinate?.explicitMonoRichBasinSearch?.allRequiredSearchesAccepted),
        stageFlag(stage.postSplitTpdSearch?.extract?.explicitMonoRichBasinSearch?.allRequiredSearchesAccepted),
      ]), 42, 386, [50, 175, 175, 175, 175], 15, 7);

    page(
       `Appendix A.${trial.stageCount}.3 — ${sevenComponent ? 'Seven-Component' : 'Six-Component'} Stage Outlet Compositions`,
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
      ['Stage / phase', ...components],
      outletRows, 42, trialClosed ? 105 : 120,
      [90, ...components.map(() => 660 / components.length)], 20, 6.5,
    );
  }

  page(
    'Appendix B — Multistart / Solver Evidence',
    true,
    'Primary convergence is insufficient: both starts must close and boundary products must agree within 1e-6',
  );
  const multistartLimit = 1e-6;
  table(
    ['N_T', 'Combined endpoint status', 'P closure / residual', 'P / S optimizer termination', 'S closure / residual', 'Branch difference', 'Branch gate'],
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
        evidence.combinedTerminationStatus
          ? `${evidence.combinedTerminationStatus} / ${evidence.combinedClosureStatus}`
          : 'Not recorded',
        `${evidence.primary?.residualClosureStatus ?? 'MISSING_EVIDENCE'} / ${scientific(evidence.primary?.maximumScaledEquationResidual)}`,
        evidence.combinedTerminationStatus ? 'Neither separately recorded'
          : `${evidence.primary?.terminationStatus ?? 'MISSING_EVIDENCE'} / ${evidence.secondary?.terminationStatus ?? 'MISSING_EVIDENCE'}`,
        `${evidence.secondary?.residualClosureStatus ?? 'MISSING_EVIDENCE'} / ${scientific(evidence.secondary?.maximumScaledEquationResidual)}`,
        difference === null ? 'NOT EVALUABLE' : difference.toExponential(3),
        typeof trial.branchReproduced === 'boolean' ? (trial.branchReproduced ? 'PASS' : 'FAIL')
          : evidence.bothStartsClosed == null || difference === null ? 'NOT EVALUABLE' : passed ? 'PASS' : 'FAIL',
      ];
    }),
    42, 100, [40, 110, 145, 120, 145, 105, 85], 30, 8,
  );
  doc.roundedRect(42, 455, 750, 90, 4).fill('#FFF3E5');
  text('MULTISTART INTERPRETATION BOUNDARY', 54, 465, 720, 8, COLORS.amber, true);
  text(
    'Matrix 7C CONVERGED/UNCLOSED and closure are combined endpoint statuses, NOT optimizer termination. CLOSED proves both endpoints closed; UNCLOSED does not identify which endpoint failed. Individual optimizer terminations are not separately recorded. Branch gate uses persisted branchReproduced when available. Missing evidence is NOT failure; branch reproduction alone does not establish numerical/stage acceptance. No gate is rerun.',
    54, 485, 720, 9,
  );

  page('Appendix C — Frozen qualification dispositions', true, 'Exact codes where recorded; native persisted flags otherwise. No invented rejection codes.');
  table(
    ['N_T', 'Closure', 'Exact codes / persisted disposition'],
    o.trials.map((trial: any) => [
      String(trial.stageCount),
      solverDisplayStatus(trial),
      [(trial.acceptanceBlockers ?? []).map((blocker: any) => blocker.code ?? String(blocker)).join('; ') || 'Exact codes not recorded',
        trial.reportingDisposition, trial.sulfurPrediction?.reason].filter(Boolean).join('. '),
    ]),
    42, 100, [45, 95, 610], 40, 8,
  );

  const stability = o.globalStabilityQualification;
  page(
    'Appendix D — Supplementary global TPD evidence',
    false,
    'Legacy supplementary evidence, separate from native matrix per-stage TPD evidence',
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
      ['Historical comparison candidate', stability.comparisonCandidate?.disposition],
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
    pill('SUPPLEMENTARY GLOBAL EVIDENCE NOT ATTACHED', 42, 105, 510, COLORS.amber);
    text(
      'This supplementary schema is not attached to the frozen job. Native per-stage stability evidence remains in Appendix A. Absence of this legacy attachment is not a new qualification failure. No current evidence has been substituted.',
      42, 160, 510, 9,
    );
  }

  const task218 = o.task218CandidateGeneratedStability;
  if (task218 || stability) page(
    'Appendix D.2 — Candidate-generated supplementary evidence',
    false,
    'Immutable candidate cascade lineage; historical comparisons remain diagnostic only',
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
      'This is supplementary candidate-generated evidence, not a replacement for the saved run disposition. Saved calibration, pilot-validation, release and selected-stage states remain unchanged.',
      55, 425, 480, 8,
    );
  } else {
    pill('CANDIDATE SUPPLEMENTARY EVIDENCE NOT ATTACHED', 42, stability ? 105 : 250, 510, COLORS.amber);
    if (!stability) text('No candidate-generated legacy attachment is recorded. This report does not manufacture it or reclassify the saved matrix result.', 42, 300, 510, 10);
  }

  page('Appendix E — Governance / Report Status', false, '7. Governance / Report Status — full immutable provenance is Appendix F');
  pill(
    o.calibrationRequired
      ? 'CONTROLLED RESEARCH OUTPUT — CALIBRATION REQUIRED'
      : 'PERSISTED REPORT STATUS — CALIBRATION NOT REQUIRED',
    42, 98, 510, o.calibrationRequired ? COLORS.red : COLORS.teal,
  );
  grid([
    ['Thermodynamic classification', o.resultThermodynamicClassification],
    ['Full immutable digests', 'See provenance appendix'],
    ['Job ID', r.id],
  ], 42, 145, 510, 25);
  text('Persisted limitations', 42, 370, 510, 12, COLORS.navy, true);
  const limitations = [
    'Direct thermodynamic sulfur prediction is NOT CALCULABLE. Allocation-based retained sulfur and removal are separate saved estimates.',
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
    ['Six-component basis SHA-256', r.input?.stage1Authority?.sixComponentCosmoSacBasisManifestSha256 ?? o.stage1TargetGovernance?.sixComponentCosmoSacBasisManifestSha256],
    ['Six-component binding SHA-256', r.input?.stage1Authority?.sixComponentCosmoSacBindingSha256 ?? o.stage1TargetGovernance?.sixComponentCosmoSacBindingSha256],
    ['Job ID', r.id],
    ['Completed at', new Date(r.completedAt).toISOString()],
  ], 42, 105, 510, 27);
  doc.roundedRect(42, 385, 510, 95, 4).fill(COLORS.pale);
  text('DOCUMENT CONTROL', 54, 400, 480, 8, COLORS.teal, true);
  text(
    'Generated exclusively from the persisted completed job snapshot. The renderer does not read live Stage-1 or workspace values and does not invoke COSMO-SAC, cascade, TPD, or multistart calculations.',
    54, 425, 480, 8.3,
  );

  const provenanceRows: Array<[string, unknown]> = [
    ['Input snapshot SHA-256 (report-derived)', createHash('sha256').update(JSON.stringify(r.input)).digest('hex')],
    ['Result snapshot SHA-256 (report-derived)', createHash('sha256').update(JSON.stringify(r.result)).digest('hex')],
    ['Digest serialization basis', 'UTF-8 JSON.stringify of the frozen snapshot objects in stored property order; not a replacement for engine-owned canonical hashes.'],
    ['cCOSMO native binary SHA-256', o.scientificRuntime?.cCOSMOBinarySha256],
    ['Scientific model contract', o.engine?.scientificModelContract],
    ['Native runtime versions', JSON.stringify(o.scientificRuntime ?? {})],
    ...Object.entries(o.scientificIntegrity ?? {}).filter(([key]) => /Sha256|Model|interactionForm|ResidualApplied/.test(key))
      .map(([key, entry]) => [label(key), typeof entry === 'object' ? JSON.stringify(entry) : String(entry)] as [string, string]),
    ...molecular.provenance,
    ...molecular.components.flatMap((c: any) => [
      [`${c.family} molecular identity`, `${c.name ?? 'Not recorded'}; CAS ${c.cas ?? 'not recorded'}; InChIKey ${c.inchiKey ?? 'not recorded'}`],
      [`${c.family} sigma profile SHA-256`, c.profileSha256 ?? 'Not recorded'],
      [`${c.family} optimized geometry SHA-256`, c.optimizedGeometrySha256 ?? 'Not recorded'],
      [`${c.family} surface SHA-256`, c.surfaceSha256 ?? 'Not recorded'],
    ] as Array<[string, string]>),
  ];
  // Dynamic rows preserve full hash/provenance strings without clipping or fixed-height overflow.
  let provenanceY = 100;
  page('Appendix F — Model and molecular provenance', false, 'Only frozen fields or artifacts whose bytes match frozen SHA-256 digests');
  for (const [key, entry] of provenanceRows) {
    const rendered = value(entry);
    doc.font('Helvetica').fontSize(9);
    const height = Math.max(40, doc.heightOfString(rendered, { width: 315, lineGap: 1.5 }) + 18);
    if (provenanceY + height > 765) { page('Appendix F — Provenance continued'); provenanceY = 100; }
    text(key, 42, provenanceY + 5, 175, 9, COLORS.muted, true);
    text(rendered, 225, provenanceY + 5, 325, 9);
    doc.strokeColor(COLORS.line).moveTo(42, provenanceY + height - 2).lineTo(552, provenanceY + height - 2).stroke();
    provenanceY += height;
  }

  doc.switchToPage(contentsPage);
  const majorSections = sections.filter(({ title }) => !title.startsWith('Appendix A.')
    && title !== 'Contents and reading guide' && title !== 'Appendix F — Provenance continued');
  majorSections.push({ title: 'Appendix A — All trial diagnostics, stability and outlets (bookmarked individually)', page: sections.find(s => s.title.startsWith('Appendix A.'))?.page ?? 0 });
  majorSections.sort((a, b) => a.page - b.page);
  majorSections.forEach((section, index) => {
    text(section.title, 42, 180 + index * 24, 455, 8.5, COLORS.navy);
    text(section.page, 512, 180 + index * 24, 40, 8.5, COLORS.navy, false, 'right');
  });
  const total = doc.bufferedPageRange().count;
  for (let index = 0; index < total; index++) {
    doc.switchToPage(index);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    text(`Page ${index + 1} of ${total}  |  Frozen run ${r.id}`, 42, doc.page.height - 25, doc.page.width - 84, 7, COLORS.muted, false, 'center');
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });
  return Buffer.concat(chunks);
}