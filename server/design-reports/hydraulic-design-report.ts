/**
 * Hydraulic Design Report (HDR) — payload builder.
 *
 * Renders the persisted C3 generic hydraulic screening results
 * (hydraulics_common section): diameter screening tables for the normal and
 * maximum continuous cases, terminal-velocity screening, shape-regime
 * indicators, slip-model basis and the feasibility band summary. The engine's
 * own applicability statement is reproduced verbatim: this is PRELIMINARY
 * GENERIC HYDRAULIC SCREENING — NOT ECP OR ECR RATING. The report consumes
 * ONLY the frozen result snapshot — never re-runs the engine.
 */
import { pool } from '../db';
import type { ReportPayload, ReportRow, ReportSection } from './report-framework';

const f1 = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '');
const f2 = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '');
const f3 = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : '');
const f4 = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(4) : '');
const sci = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? v.toExponential(3) : '');

const FEAS_LABELS: Record<string, string> = {
  within_screening_band: 'Within screening band',
  above_screening_band: 'Above screening band (high loading)',
  below_minimum_loading_band: 'Below minimum loading band',
  hydraulically_infeasible: 'Hydraulically infeasible',
};

export async function buildHydraulicDesignPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
  const revQ = await pool.query(
    `SELECT r.*, d.design_number, d.title, d.design_type
       FROM design_software_revisions r
       JOIN design_software_designs d ON d.id = r.design_id
      WHERE r.id = $1`, [revisionId]);
  if (!revQ.rows.length) throw new Error('Revision not found');
  const rev = revQ.rows[0];

  const resQ = await pool.query(`SELECT data, engine_version, calculation_class, computed_at FROM design_software_results WHERE revision_id = $1 AND section = 'hydraulics_common'`, [revisionId]);
  if (!resQ.rows.length) {
    throw Object.assign(new Error('No persisted generic hydraulic screening (C3) results for this revision — run the Hydraulic Design calculation (Stage 5) first. The report never re-runs engines.'), { statusCode: 422 });
  }
  const res = resQ.rows[0];
  const hy = res.data ?? {};
  const db = hy.designBasis ?? {};

  const runQ = await pool.query(
    `SELECT id, engine_name, engine_version, calculation_status, calculated_at
       FROM design_software_calculation_runs
      WHERE revision_id = $1 AND calculation_type IN ('hydraulics','hydraulics_common','hydraulic_design')
      ORDER BY calculated_at DESC LIMIT 1`, [revisionId]);
  const run = runQ.rows[0];

  const diQ = await pool.query(`SELECT data FROM design_software_inputs WHERE revision_id = $1 AND section = 'design_identity'`, [revisionId]);
  const di: Record<string, string> = diQ.rows.reduce((a: any, r: any) => ({ ...a, ...r.data }), {});

  const assumptions: ReportPayload['assumptions'] = [];
  const missing: ReportPayload['missingData'] = [];
  const references = new Set<string>();

  // ── Engine assumptions — verbatim, with stored provenance where present ───
  for (const a of hy.assumptions ?? []) {
    assumptions.push({
      item: `Engine assumption (${a.scope ?? 'run'})`,
      value: '—',
      sourceRef: a.sourceReference ? `${a.assumption} — ${a.sourceReference}` : a.assumption,
      status: a.sourceType === 'Assumed' ? 'Assumed — Pending Validation' : 'Engine screening assumption',
    });
    if (a.sourceReference) references.add(a.sourceReference);
  }
  const ift = db.interfacialTension ?? hy.shapeRegimeIndicators?.interfacialTension;
  if (ift?.source?.startsWith('Assumed')) {
    assumptions.push({ item: 'Interfacial tension', value: `${ift.value} ${ift.unit ?? ''}`.trim(), sourceRef: ift.source, status: 'Pending Laboratory Validation' });
    references.add(ift.source);
  }

  const tvs = hy.terminalVelocityScreening ?? {};
  const sri = hy.shapeRegimeIndicators ?? {};

  // ── Diameter screening tables ──────────────────────────────────────────────
  const diameterTable = (kase: any): string[][] => {
    const header = ['ID (m)', 'Area (m²)', 'u_c NMP (mm/s)', 'u_d RRBO (mm/s)', 'Operating Holdup φ (–)', 'Interfacial Area (m²/m³)', '% of Throughput Max', 'Feasibility'];
    const rows = (kase?.diameters ?? []).map((d: any) => [
      f2(d.diameter_m),
      f3(d.area_m2),
      f2((d.continuousSuperficialVelocity_m_s ?? NaN) * 1000),
      f2((d.dispersedSuperficialVelocity_m_s ?? NaN) * 1000),
      d.holdup?.operatingHoldup != null ? f4(d.holdup.operatingHoldup) : 'Not Calculable',
      d.interfacialArea?.value_m2_m3 != null ? f1(d.interfacialArea.value_m2_m3) : '—',
      f1(d.percentageOfGenericHydraulicThroughputMaximum),
      FEAS_LABELS[d.genericHydraulicFeasibility] ?? d.genericHydraulicFeasibility ?? '—',
    ]);
    return [header, ...rows];
  };

  const bandSummary = (s: any): ReportRow[] => [
    { label: 'Minimum Feasible Diameter', value: f2(s?.minimumFeasibleDiameter_m), unit: 'm', sourceType: 'Calculated (C3)' },
    { label: 'Screening Band Diameter Range', value: s?.screeningBandDiameterRange_m ? `${f2(s.screeningBandDiameterRange_m.min)} – ${f2(s.screeningBandDiameterRange_m.max)}` : '', unit: 'm', sourceType: 'Calculated (C3)' },
    { label: 'Diameters Within Screening Band', value: (s?.withinScreeningBandDiameters_m ?? []).map(f2).join(', '), unit: 'm', sourceType: 'Calculated (C3)' },
    { label: 'Diameters Above Screening Band', value: (s?.aboveScreeningBandDiameters_m ?? []).map(f2).join(', ') || 'none', unit: 'm', sourceType: 'Calculated (C3)' },
    { label: 'Hydraulically Infeasible Diameters', value: (s?.hydraulicallyInfeasibleDiameters_m ?? []).map(f2).join(', ') || 'none', unit: 'm', sourceType: 'Calculated (C3)' },
    { label: 'Engine Trial-Diameter Recommendation', value: s?.selectedTrialDiameter_m != null ? f2(s.selectedTrialDiameter_m) : 'None', sourceType: 'C3 result snapshot', sourceRef: s?.selectedTrialDiameterNote ?? '' },
  ];

  if (String(hy.calculationRunStatus ?? '').toLowerCase() === 'warning') {
    missing.push({ item: 'C3 run status', reason: 'The persisted C3 run completed with warnings — see the engine assumptions and limitations sections.', severity: 'warning' });
  }
  missing.push({ item: 'Generic screening validity', reason: 'u_K (characteristic velocity), hindrance exponent n and d32 are screening assumptions — technology-specific rating (C4 ECP / C5 ECR) governs the final column hydraulics.', severity: 'warning' });

  const sections: ReportSection[] = [
    { title: 'Introduction & Applicability', paragraphs: [
      `This Hydraulic Design Report presents the generic counter-current hydraulic screening for design ${rev.design_number}, ${rev.title ?? ''}, rendered from the persisted C3 result snapshot for Design Revision Rev ${rev.revision_number}. The governing design basis is stated in ${rev.design_number}-DBR; process flows derive from ${rev.design_number}-PDR (same revision).`,
      `Engine applicability statement (verbatim): "${hy.applicabilityStatement ?? '—'}". Technology-specific hydraulics (packing or rotor internals) are rated by the C4 ECP / C5 ECR engines and reported separately.`,
    ]},
    { title: 'Hydraulic Design Basis', rows: [
      { label: 'Slip Model', value: String(db.slipModel ?? ''), sourceType: 'C3 result snapshot' },
      { label: 'Characteristic Velocity u_K', value: f4(db.characteristicVelocity?.value_m_s), unit: 'm/s', sourceType: 'Provisional', sourceRef: db.characteristicVelocity?.basis ?? '' },
      { label: 'Sauter Mean Diameter d32', value: String(db.sauterMeanDiameter?.value ?? ''), unit: 'm', sourceType: db.sauterMeanDiameter?.sourceType ?? '', sourceRef: db.sauterMeanDiameter?.sourceReference ?? '' },
      { label: 'Hindrance Exponent n', value: String(db.hindranceExponent?.value ?? db.hindranceExponent ?? ''), sourceType: db.hindranceExponent?.sourceType ?? 'Assumed', sourceRef: db.hindranceExponent?.sourceReference ?? 'Thermopac Preliminary Screening Default — n pending laboratory validation' },
      { label: 'Interfacial Tension', value: ift?.value != null ? String(ift.value) : '', unit: ift?.unit ?? 'N/m', sourceType: 'Assumed — Pending Validation', sourceRef: ift?.source ?? '' },
      { label: 'Density Difference', value: f1(db.densityDifference_kg_m3), unit: 'kg/m³', sourceType: 'Calculated (C3)' },
      { label: 'Operating Temperature', value: String(db.operatingTemperatureC ?? ''), unit: '°C', sourceType: 'Design basis' },
      { label: 'Holdup Search Bounds', value: db.holdupBounds ? `${db.holdupBounds.min ?? '—'} – ${db.holdupBounds.max ?? '—'}` : '', unit: 'φ (–)', sourceType: 'Engine configuration' },
    ]},
    { title: 'Terminal-Velocity Screening (Rigid Sphere)', intro: `Basis (verbatim): ${tvs.basis ?? '—'}`, rows: [
      { label: 'Terminal Velocity', value: f4(tvs.velocity_m_s), unit: 'm/s', sourceType: tvs.classification ?? '' },
      { label: 'Drop Reynolds Number', value: f2(tvs.reynolds), sourceType: tvs.classification ?? '' },
      { label: 'Drag Coefficient', value: f3(tvs.dragCoefficient), sourceType: tvs.classification ?? '' },
      { label: 'Flow Regime', value: String(tvs.regime ?? ''), sourceType: tvs.classification ?? '' },
      { label: 'd32 Used', value: String(tvs.d32_m ?? ''), unit: 'm', sourceType: 'Assumed', sourceRef: 'Thermopac Preliminary Screening Default' },
      { label: 'Dispersed / Continuous Phase', value: `${tvs.dispersedPhase ?? '—'} / ${tvs.continuousPhase ?? '—'}`, sourceType: 'Design basis' },
    ]},
    { title: 'Shape-Regime Indicators', intro: `Note (verbatim): ${sri.note ?? '—'}`, rows: [
      { label: 'Eötvös Number', value: f4(sri.eotvos), sourceType: sri.classification ?? '' },
      { label: 'Weber Number', value: f4(sri.weber), sourceType: sri.classification ?? '' },
      { label: 'Morton Number', value: sci(sri.morton), sourceType: sri.classification ?? '' },
    ]},
    { title: 'Feasibility Summary — Normal Case', rows: bandSummary(hy.normalCase?.summary) },
    { title: 'Diameter Screening Table — Normal Case', intro: 'Operating holdup from the slip balance u_slip = u_K·(1−φ)^n; interfacial area a = 6·φ/d32 (Pending Validation). "Not Calculable" = no holdup root within bounds at that diameter.', table: diameterTable(hy.normalCase) },
    { title: 'Feasibility Summary — Maximum Continuous Case', rows: bandSummary(hy.maximumCase?.summary) },
    { title: 'Diameter Screening Table — Maximum Continuous Case', table: diameterTable(hy.maximumCase) },
    { title: 'Limitations', paragraphs: (hy.limitations ?? []).map((l: string, i: number) => `${i + 1}. ${l}`) },
  ];

  // ── Diameter governance (DS-SEL-006) — the effective design diameter governs
  // downstream work; the screening tables above evaluate the full sweep range.
  const dselQ = await pool.query(
    `SELECT record FROM design_selection_records
      WHERE revision_id = $1 AND is_superseded = FALSE
      ORDER BY created_at DESC LIMIT 1`, [revisionId]);
  const dsel = dselQ.rows[0]?.record;
  if (dsel?.selectedDiameter_mm != null) {
    sections.push({
      title: 'Governing Diameter (DS-SEL-006)',
      rows: [
        { label: 'Autonomous calculated diameter (retained for traceability)', value: String(dsel.autonomousDiameter_mm ?? dsel.selectedDiameter_mm), unit: 'mm', sourceType: 'DS-SEL-003' },
        { label: 'User-selected governing diameter', value: dsel.userSelectedDiameter_mm != null ? String(dsel.userSelectedDiameter_mm) : 'None — autonomous selection governs', unit: dsel.userSelectedDiameter_mm != null ? 'mm' : undefined, sourceType: 'DS-SEL-006', sourceRef: dsel.userSelection ? `Governed selection by ${dsel.userSelection.engineer}: ${dsel.userSelection.reason}` : '' },
        { label: 'EFFECTIVE design diameter (governs all downstream calculations)', value: String(dsel.effectiveDiameter_mm ?? dsel.selectedDiameter_mm), unit: 'mm', sourceType: 'DS-SEL-006', sourceRef: dsel.selectionMode === 'user_selected' ? 'Governed user selection of a larger, more conservative diameter — not an Engineer Override of an unsafe design.' : 'Autonomous selection — no governed user selection entered.' },
      ],
      paragraphs: ['The diameter screening tables in this report evaluate the full sweep range by design; the row at the effective design diameter is the governing hydraulic operating point. See the Engineering Decision Record in the equipment calculation report for the full DS-SEL cascade and impact assessment.'],
    });
  }

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'HDR',
    docTypeTitle: 'Hydraulic Design Report',
    docNumber: `${rev.design_number}-HDR`,
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
      runs: [{ engine: run?.engine_name ?? 'hydraulics-common', version: String(res.engine_version ?? run?.engine_version ?? '—'), runId: run?.id ?? null, ranAt: run?.calculated_at ? new Date(run.calculated_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : undefined }],
      note: `Renders the persisted hydraulics_common result snapshot (computed ${res.computed_at ? new Date(res.computed_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}; CEL v${hy.celVersion ?? '—'}, EPD v${hy.epdVersion ?? '—'}). Applicability: ${hy.applicabilityStatement ?? '—'}.`,
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
