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

export async function generatePredictiveNtReport(
  snapshot: PredictiveNtReportSnapshot,
): Promise<Buffer> {
  const r = snapshot;
  const o = r.result;
  const s = r.input?.stage1Authority?.source?.stage1 ?? {};
  if (!o || !Array.isArray(o.trials)) throw new Error('PREDICTIVE_NT_REPORT_RESULT_MISSING');

  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: `Project ${r.projectNumber} Predictive N_T Engineering Report`,
      Author: 'Thermopac',
      Subject: `Frozen Predictive N_T run ${r.id}`,
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
      `PROJECT ${r.projectNumber}  •  RESEARCH DIAGNOSTIC`,
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
  pill('RESEARCH DIAGNOSTIC — NOT ACCEPTED — NOT RELEASE ELIGIBLE', 42, 98, 510);
  text('Executive verdict', 42, 145, 510, 16, COLORS.navy, true);
  text(
    `The calculation completed all ${o.trials.length} configured stage trials. Predictive N_T and established theoretical stages remain ${o.predictiveNt == null ? 'unassigned' : `reported as ${o.predictiveNt}`}. Qualification remains governed by the complete frozen blocker evidence below.`,
    42, 174, 510, 9,
  );
  grid([
    ['Job status', 'COMPLETED — report generated automatically'],
    ['Trials completed', `${o.trials.length} / ${r.input.maximumStages ?? o.trials.length}`],
    ['Diagnostic Predictive N_T', o.predictiveNt ?? 'Not assigned'],
    ['Established theoretical stages', o.establishedTheoreticalStages ?? 'Not established'],
    ['Sulfur prediction', 'NOT CALCULABLE'],
    ['Pilot validated', o.pilotValidated ? 'Yes' : 'No'],
    ['Calibration required', o.calibrationRequired ? 'Yes' : 'No'],
    ['Release eligible', o.releaseEligible ? 'Yes' : 'No'],
  ], 42, 235, 510, 23);
  doc.roundedRect(42, 445, 510, 90, 4).fill('#FFF3E5');
  text('ENGINEERING INTERPRETATION', 55, 460, 480, 9, COLORS.amber, true);
  text(
    '“Not accepted” is a scientific qualification verdict, not a software failure. This report preserves the full completed run snapshot; it does not rerun the model or substitute current design inputs.',
    55, 482, 480, 8.5,
  );
  text(`Completed ${new Date(r.completedAt).toISOString()}  •  Job ${r.id}`, 42, 720, 510, 7, COLORS.muted);

  page('1. Frozen Stage 1 design basis', false, 'Owner-controlled input authority used by the solver');
  grid([
    ['Project reference', s.projectReference ?? r.projectNumber],
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
    ['Sulfur target', 'AUDIT ONLY — NOT CALCULABLE'],
  ], 42, 505, 510, 24);

  page(
    '2. Six-component trial comparison',
    true,
    'Boundary-mole removal diagnostics and final-raffinate phase mole fractions; un-converged rows are explicitly flagged',
  );
  table(
    ['N_T', 'Residual closure', 'SAT loss %', 'MONO removal %', 'DI removal %', 'POLY removal %', 'PA removal %', 'NMP'],
    o.trials.map((trial: any) => {
      const metrics = trial.productMetrics ?? {};
      const extraction = metrics.componentExtractionPct ?? {};
      const streams = trial.boundaryStreams ?? {};
      const satFeed = streams.oilFeed?.componentMoles?.[0];
      const satExtract = streams.finalExtract?.componentMoles?.[0];
      const satLoss = satFeed > 0 ? 100 * satExtract / satFeed : null;
      return [
        String(trial.stageCount),
        trial.residualClosureStatus ?? (trial.solverSuccess ? 'CLOSED' : 'UNCLOSED'),
        value(satLoss, 3),
        value(extraction.MONO, 3),
        value(extraction.DI, 3),
        value(extraction.POLY, 3),
        value(extraction.PA, 3),
        'NOT APPLICABLE',
      ];
    }),
    42, 96, [42, 88, 88, 102, 88, 96, 92, 104], 20, 6,
  );
  text(
    'Final raffinate composition — PHASE MOLE FRACTION (each row sums to 1)',
    42, 323, 750, 10, COLORS.navy, true,
  );
  table(
    ['N_T', 'Residual closure', ...COMPONENTS],
    o.trials.map((trial: any) => [
      String(trial.stageCount),
      trial.residualClosureStatus ?? (trial.solverSuccess ? 'CLOSED' : 'UNCLOSED'),
      ...(trial.boundaryStreams?.finalRaffinate?.moleFractions ?? [])
        .map((entry: number) => value(entry, 5)),
    ]),
    42, 342, [42, 88, 100, 100, 100, 100, 100, 100], 20, 6,
  );

  for (const trial of o.trials) {
    const trialClosed = (trial.residualClosureStatus
      ?? (trial.solverSuccess ? 'CLOSED' : 'UNCLOSED')) === 'CLOSED';
    const branchComparisonEvaluated = (trial.branchComparisonStatus
      ?? trial.multistartEvidence?.branchComparisonStatus
      ?? (trial.multistartEvidence?.bothStartsClosed ? 'EVALUATED' : 'NOT_EVALUABLE_ENDPOINT_UNCLOSED'))
      === 'EVALUATED';
    const branchDifference = branchComparisonEvaluated
      && typeof trial.multistartProductRelativeDifference === 'number'
      ? trial.multistartProductRelativeDifference
      : null;
    page(
      `3. Trial ${trial.stageCount} — complete diagnostic overview`,
      true,
      `RESEARCH DIAGNOSTIC — NOT ACCEPTED · numerical gates ${trial.numericalAcceptancePassed ? 'PASS' : 'FAIL'} · maximum component-balance residual ${Number(trial.maximumOverallComponentBalanceResidualMol).toExponential(3)}`,
    );
    const shift = trialClosed ? 0 : 22;
    if (!trialClosed) {
      pill('RESIDUAL-UNCLOSED DIAGNOSTIC — DO NOT INTERPRET AS AN EQUILIBRIUM RESULT', 42, 82, 755);
    }
    const streams = trial.boundaryStreams ?? {};
    const metrics = trial.productMetrics ?? {};
    const extraction = metrics.componentExtractionPct ?? {};
    text(
      `Primary termination ${trial.solverTerminationStatus ?? (trial.solverSuccess ? 'SUCCESS' : 'NOT RECORDED')}   ·   Residual closure ${trialClosed ? 'CLOSED' : 'UNCLOSED'}   ·   Maximum scaled equation residual ${Number(trial.maximumScaledEquationResidual).toExponential(3)}   ·   Branch comparison ${branchComparisonEvaluated && branchDifference !== null ? `EVALUATED (${branchDifference.toExponential(3)})` : 'NOT EVALUABLE — ENDPOINT UNCLOSED'}`,
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
      `3. Trial ${trial.stageCount} — internal stage diagnostics`,
      true,
      'Stage qualification combines local balance, isoactivity, local-Hessian stability, and global TPD; raw diagnostics remain separate',
    );
    if (!trialClosed) {
      pill('RESIDUAL-UNCLOSED DIAGNOSTIC — DO NOT INTERPRET AS AN EQUILIBRIUM RESULT', 42, 82, 755);
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
      `3. Trial ${trial.stageCount} — six-component stage outlets`,
      true,
      'PHASE MOLE FRACTIONS — each raffinate and extract row sums to 1; these are not product mass fractions',
    );
    if (!trialClosed) {
      pill('RESIDUAL-UNCLOSED DIAGNOSTIC — DO NOT INTERPRET AS AN EQUILIBRIUM RESULT', 42, 82, 755);
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
    table(
      ['Stage / phase', ...COMPONENTS],
      outletRows, 42, trialClosed ? 100 : 115,
      [90, 110, 110, 110, 110, 110, 110], 20, 6.5,
    );
  }

  page(
    '5. Numerical and multistart diagnostics',
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
        evidence.primary?.terminationStatus ?? (evidence.primary?.solverSuccess ? 'SUCCESS' : 'LEGACY'),
        `${evidence.primary?.residualClosureStatus ?? (evidence.bothStartsClosed ? 'CLOSED' : 'LEGACY')} / ${Number(evidence.primary?.maximumScaledEquationResidual).toExponential(3)}`,
        evidence.secondary?.terminationStatus ?? (evidence.secondary?.solverSuccess ? 'SUCCESS' : 'LEGACY'),
        `${evidence.secondary?.residualClosureStatus ?? (evidence.bothStartsClosed ? 'CLOSED' : 'LEGACY')} / ${Number(evidence.secondary?.maximumScaledEquationResidual).toExponential(3)}`,
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

  page('6. Exact qualification blockers', true, 'Complete frozen blocker set for every trial — no truncation');
  table(
    ['N_T', 'Residual closure', 'Exact blocker codes'],
    o.trials.map((trial: any) => [
      String(trial.stageCount),
      trial.residualClosureStatus ?? (trial.solverSuccess ? 'CLOSED' : 'UNCLOSED'),
      (trial.acceptanceBlockers ?? [])
        .map((blocker: any) => blocker.code ?? 'UNSPECIFIED_GATE_FAILURE').join('; ') || 'None recorded',
    ]),
    42, 100, [45, 95, 610], 40, 6.2,
  );

  page('7. Governance and provenance', false, 'Immutable identifiers for the frozen completed snapshot');
  pill('CONTROLLED RESEARCH OUTPUT — CALIBRATION REQUIRED', 42, 98, 510);
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
  text('Mandatory limitations', 42, 370, 510, 12, COLORS.navy, true);
  [
    'Sulfur removal is NOT CALCULABLE from this aromatic-transfer model.',
    'The PA representative is non-sulfur-bearing and is not a sulfur surrogate.',
    'No research diagnostic is pilot validated or release eligible.',
    'Calibration and direct matching NMP/RRBO evidence remain required.',
    'SAT is boundary-mole loss; NMP extraction percentage is not applicable.',
  ].forEach((entry, index) => {
    doc.circle(50, 406 + index * 38, 2.5).fill(COLORS.red);
    text(entry, 63, 397 + index * 38, 480, 8.7);
  });
  doc.roundedRect(42, 620, 510, 70, 4).fill(COLORS.pale);
  text('DOCUMENT CONTROL', 54, 632, 480, 8, COLORS.teal, true);
  text(
    'Generated automatically and exclusively from the persisted completed job snapshot. No live design inputs were read and no scientific calculation was rerun.',
    54, 650, 480, 8.3,
  );

  doc.end();
  await new Promise<void>((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });
  return Buffer.concat(chunks);
}