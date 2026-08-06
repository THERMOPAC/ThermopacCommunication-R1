/**
 * Process Design Report (PDR) — payload builder.
 *
 * Renders the persisted C2 Process Design engine results for the revision:
 * gross inlet balance, component material balance (normal + maximum case),
 * solvent balance, yields/recoveries and the preliminary stage-equivalent
 * estimate. Every engine-assumed split fraction is carried into the
 * Assumptions Register with its exact stored source reference. The report
 * consumes ONLY the frozen result snapshot — never re-runs the engine.
 */
import { pool } from '../db';
import type { ReportPayload, ReportRow, ReportSection } from './report-framework';

const f1 = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '');
const f2 = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '');
const pct = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? (v * 100).toFixed(2) : '');

export async function buildProcessDesignPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
  const revQ = await pool.query(
    `SELECT r.*, d.design_number, d.title, d.design_type
       FROM design_software_revisions r
       JOIN design_software_designs d ON d.id = r.design_id
      WHERE r.id = $1`, [revisionId]);
  if (!revQ.rows.length) throw new Error('Revision not found');
  const rev = revQ.rows[0];

  const resQ = await pool.query(`SELECT data, engine_version, calculation_class, computed_at FROM design_software_results WHERE revision_id = $1 AND section = 'process_design'`, [revisionId]);
  if (!resQ.rows.length) {
    throw Object.assign(new Error('No persisted Process Design (C2) results for this revision — run the Process Design calculation (Stage 6) first. The report never re-runs engines.'), { statusCode: 422 });
  }
  const res = resQ.rows[0];
  const pd = res.data ?? {};

  const runQ = await pool.query(
    `SELECT id, engine_name, engine_version, calculation_status, calculated_at
       FROM design_software_calculation_runs
      WHERE revision_id = $1 AND calculation_type = 'process_design'
      ORDER BY calculated_at DESC LIMIT 1`, [revisionId]);
  const run = runQ.rows[0];

  const inputsQ = await pool.query(`SELECT section, data FROM design_software_inputs WHERE revision_id = $1 AND section IN ('design_identity','process_design')`, [revisionId]);
  const bySection: Record<string, Record<string, string>> = {};
  for (const row of inputsQ.rows) bySection[row.section] = { ...(bySection[row.section] ?? {}), ...(row.data ?? {}) };
  const di = bySection['design_identity'] ?? {};

  const assumptions: ReportPayload['assumptions'] = [];
  const missing: ReportPayload['missingData'] = [];
  const references = new Set<string>();

  // ── Split fractions → assumptions register (verbatim stored citations) ────
  const splits = pd.normalCase?.componentBalance?.splitFractionsUsed ?? {};
  const SPLIT_LABELS: Record<string, string> = {
    soluteMassFractionInFeed: 'Solute mass fraction in feed',
    soluteRecoveryToExtract: 'Solute recovery to extract',
    oilLossToExtractFraction: 'Oil/carrier loss to extract',
    solventCarryoverFraction: 'NMP carryover to raffinate',
  };
  const splitRows: ReportRow[] = Object.entries(SPLIT_LABELS).map(([key, label]) => {
    const sf = splits[key];
    if (!sf) { missing.push({ item: label, reason: 'Split fraction absent from the persisted C2 result snapshot.', severity: 'warning' }); return { label, value: '', sourceType: 'Not in snapshot' }; }
    if (sf.sourceType === 'Assumed') assumptions.push({ item: `Split fraction — ${label}`, value: String(sf.value), sourceRef: sf.sourceReference ?? '', status: 'Pending Validation' });
    if (sf.sourceReference) references.add(sf.sourceReference);
    return { label, value: String(sf.value), unit: 'fraction', sourceType: sf.sourceType, sourceRef: sf.sourceReference ?? '' };
  });

  // ── Engine run-scope assumptions ───────────────────────────────────────────
  for (const a of pd.assumptions ?? []) {
    assumptions.push({ item: `Engine assumption (${a.scope ?? 'run'})`, value: '—', sourceRef: a.assumption, status: 'Engine screening assumption' });
  }
  // Feed fluid density provenance from the frozen result design basis
  const fd = pd.designBasis?.feedFluid?.enteredDensity;
  if (fd?.sourceType === 'Assumed') {
    assumptions.push({ item: `Feed density (${pd.designBasis?.feedFluid?.name ?? 'feed'})`, value: `${fd.value} ${fd.unit ?? ''} @ ${fd.referenceTemperatureC ?? '—'} °C`, sourceRef: fd.sourceReference ?? '', status: 'Pending Validation' });
    if (fd.sourceReference) references.add(fd.sourceReference);
  }

  // ── Balance tables ─────────────────────────────────────────────────────────
  const balanceTable = (cb: any): string[][] => {
    const streams: Array<[string, string]> = [['feed', 'Feed'], ['solvent', 'Solvent (NMP)'], ['extract', 'Extract'], ['raffinate', 'Raffinate']];
    const header = ['Stream', `Oil / Carrier (${cb?.unit ?? 'kg/h'})`, `Solute (${cb?.unit ?? 'kg/h'})`, `NMP (${cb?.unit ?? 'kg/h'})`, `Total (${cb?.unit ?? 'kg/h'})`];
    const rows = streams.map(([k, label]) => {
      const s = cb?.[k] ?? {};
      return [label, f1(s.oilCarrier), f1(s.solute), f1(s.nmp), f1(s.total)];
    });
    const inTotal = (cb?.feed?.total ?? 0) + (cb?.solvent?.total ?? 0);
    const outTotal = (cb?.extract?.total ?? 0) + (cb?.raffinate?.total ?? 0);
    rows.push(['IN total (Feed + Solvent)', '', '', '', f1(inTotal)]);
    rows.push(['OUT total (Extract + Raffinate)', '', '', '', f1(outTotal)]);
    rows.push(['Closure (absolute)', '', '', '', `${f2(cb?.closure?.absolute_kg_h)} kg/h`]);
    return [header, ...rows];
  };

  const flows = pd.flows ?? {};
  const nYields = pd.normalCase?.yields ?? {};
  const classification = String(res.calculation_class ?? 'Preliminary Screening');

  if (nYields.classification === 'Pending Validation') {
    missing.push({ item: 'Component balance & yields', reason: 'C2 results are classified Pending Validation — split fractions are Thermopac screening defaults, not laboratory/vendor equilibrium data.', severity: 'warning' });
  }

  const sections: ReportSection[] = [
    { title: 'Introduction', paragraphs: [
      `This Process Design Report presents the preliminary process design results for design ${rev.design_number}, ${rev.title ?? ''}. It renders the persisted C2 Process Design engine result snapshot for Design Revision Rev ${rev.revision_number}; the governing design basis is stated in ${rev.design_number}-DBR (same revision).`,
      `Calculation class: ${classification}. Results computed ${res.computed_at ? new Date(res.computed_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'} by engine ${run?.engine_name ?? 'llx-process-design'} v${res.engine_version ?? '—'}.`,
    ]},
    { title: 'Process Configuration', intro: pd.phaseConfiguration?.note, rows: [
      { label: 'Continuous Phase', value: String(pd.phaseConfiguration?.continuousPhase ?? ''), sourceType: pd.phaseConfiguration?.classification ?? 'C2 result snapshot', sourceRef: `Engineer input: ${pd.phaseConfiguration?.input ?? '—'}` },
      { label: 'Dispersed Phase', value: String(pd.phaseConfiguration?.dispersedPhase ?? ''), sourceType: pd.phaseConfiguration?.classification ?? 'C2 result snapshot' },
      { label: 'Heavier / Lighter Phase', value: `${pd.phaseConfiguration?.heavierPhase ?? '—'} / ${pd.phaseConfiguration?.lighterPhase ?? '—'}`, sourceType: pd.phaseConfiguration?.classification ?? 'C2 result snapshot' },
      { label: 'Density Difference', value: f1(pd.phaseConfiguration?.densityDifference_kg_m3), unit: 'kg/m³', sourceType: pd.phaseConfiguration?.classification ?? 'C2 result snapshot' },
      { label: 'Solvent : Oil Ratio (mass basis)', value: f2(pd.solventToOilRatio?.value), unit: ': 1', sourceType: 'Calculated (C2)', sourceRef: pd.solventToOilRatio?.basis ?? '' },
      { label: 'Max Circulation Factor', value: String(flows.maxCirculationFactor ?? ''), sourceType: 'C2 result snapshot' },
    ]},
    { title: 'Flow Summary', rows: [
      { label: 'Feed Mass Flow', value: f1(flows.feedMassFlow), unit: flows.unitMass ?? 'kg/h', sourceType: 'Calculated (C2)' },
      { label: 'Feed Volumetric Flow', value: f2(flows.feedVolumetricFlow), unit: flows.unitVolumetric ?? 'm³/h', sourceType: 'Calculated (C2)' },
      { label: 'Normal Solvent Mass Flow', value: f1(flows.normalSolventMassFlow), unit: flows.unitMass ?? 'kg/h', sourceType: 'Calculated (C2)' },
      { label: 'Normal Solvent Volumetric Flow', value: f2(flows.normalSolventVolumetricFlow), unit: flows.unitVolumetric ?? 'm³/h', sourceType: 'Calculated (C2)' },
      { label: 'Maximum Solvent Mass Flow', value: f1(flows.maximumSolventMassFlow), unit: flows.unitMass ?? 'kg/h', sourceType: 'Calculated (C2)' },
      { label: 'Maximum Solvent Volumetric Flow', value: f2(flows.maximumSolventVolumetricFlow), unit: flows.unitVolumetric ?? 'm³/h', sourceType: 'Calculated (C2)' },
    ]},
    { title: 'Material Balance — Normal Case', intro: `Classification: ${pd.normalCase?.componentBalance?.classification ?? '—'}.`, table: balanceTable(pd.normalCase?.componentBalance) },
    { title: 'Material Balance — Maximum Continuous Case', intro: `Classification: ${pd.maximumCase?.componentBalance?.classification ?? '—'}. Normal-case split fractions applied unchanged (screening assumption).`, table: balanceTable(pd.maximumCase?.componentBalance) },
    { title: 'Solvent Balance', rows: [
      { label: 'Solvent Feed (Normal)', value: f1(pd.normalCase?.componentBalance?.solvent?.nmp), unit: 'kg/h', sourceType: 'Calculated (C2)' },
      { label: 'NMP to Extract (Normal)', value: f1(pd.normalCase?.componentBalance?.extract?.nmp), unit: 'kg/h', sourceType: 'Calculated (C2)' },
      { label: 'NMP Carryover to Raffinate (Normal)', value: f1(pd.normalCase?.componentBalance?.raffinate?.nmp), unit: 'kg/h', sourceType: 'Calculated (C2)' },
      { label: 'Solvent Recovery to Extract', value: pct(nYields.solventRecoveryToExtract), unit: '%', sourceType: 'Calculated (C2)' },
      { label: 'Solvent Feed (Maximum)', value: f1(pd.maximumCase?.componentBalance?.solvent?.nmp), unit: 'kg/h', sourceType: 'Calculated (C2)' },
    ]},
    { title: 'Yields & Recoveries (Normal Case)', intro: `Classification: ${nYields.classification ?? '—'}.`, rows: [
      { label: 'Extracted Solute Recovery', value: pct(nYields.extractedSoluteRecovery), unit: '%', sourceType: 'Calculated (C2)' },
      { label: 'Recovered Oil/Carrier Yield', value: pct(nYields.recoveredOilCarrierYield), unit: '%', sourceType: 'Calculated (C2)' },
      { label: 'Solvent-Free Raffinate Yield', value: pct(nYields.solventFreeRaffinateYield), unit: '%', sourceType: 'Calculated (C2)' },
      { label: 'Gross Extract / Feed Ratio', value: f2(nYields.grossExtractToFeedRatio), sourceType: 'Calculated (C2)' },
      { label: 'Gross Raffinate / Feed Ratio', value: f2(nYields.grossRaffinateToFeedRatio), sourceType: 'Calculated (C2)' },
      { label: 'NMP Carryover to Raffinate', value: pct(nYields.nmpCarryoverToRaffinate), unit: '%', sourceType: 'Calculated (C2)' },
    ]},
    { title: 'Split Fractions Used', intro: 'Split fractions govern the component balance. Assumed values are Thermopac preliminary screening defaults — replace with laboratory/vendor equilibrium data before design approval.', rows: splitRows },
    { title: 'Preliminary Stage-Equivalent Estimate', intro: pd.stages?.note, rows: [
      { label: 'Theoretical Stages', value: String(pd.stages?.theoreticalStages ?? ''), sourceType: pd.stages?.classification ?? '' },
      { label: 'Stage / Compartment Efficiency', value: pct(pd.stages?.compartmentOrStageEfficiency), unit: '%', sourceType: pd.stages?.classification ?? '' },
      { label: 'Estimated Physical Stages', value: String(pd.stages?.estimatedPhysicalStages ?? ''), sourceType: pd.stages?.classification ?? '' },
    ]},
  ];

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'PDR',
    docTypeTitle: 'Process Design Report',
    docNumber: `${rev.design_number}-PDR`,
    reportRev: `Rev ${rev.revision_number}`,
    designNumber: rev.design_number,
    designTitle: rev.title ?? '',
    designType: rev.design_type === 'rnd' ? 'R&D / Independent Design' : 'Project Design',
    module: 'Liquid-Liquid Extraction',
    revisionLabel: `Rev ${rev.revision_number}`,
    revisionLifecycle: lifecycle,
    client: di.client, plantLocation: di.plant_location,
    preparedBy: di.prepared_by, checkedBy: di.checked_by, approvedBy: di.approved_by,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    generatedByName,
    traceability: {
      revisionId,
      runs: [{ engine: run?.engine_name ?? 'llx-process-design', version: String(res.engine_version ?? run?.engine_version ?? '—'), runId: run?.id ?? null, ranAt: run?.calculated_at ? new Date(run.calculated_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : undefined }],
      note: `Renders the persisted process_design result snapshot (computed ${res.computed_at ? new Date(res.computed_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}; CEL v${pd.celVersion ?? '—'}, EPD v${pd.epdVersion ?? '—'}). Design basis: see ${rev.design_number}-DBR.`,
    },
    sections,
    assumptions,
    missingData: missing,
    references: Array.from(references),
    revisionHistory: [],
    watermark: ['approved', 'issued'].includes(lifecycle) ? undefined : 'PRELIMINARY — NOT FOR CONSTRUCTION',
  };
  return { payload, blocking: missing.filter(m => m.severity === 'error').length };
}
