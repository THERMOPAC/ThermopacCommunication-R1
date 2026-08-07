/**
 * Engineering Design Report (EDR) — payload builder.
 *
 * The complete client-facing engineering design report: design basis extract,
 * process design summary, the full DS-SEL engineering decision record
 * (technology selection cascade + diameter governance, verbatim), governing
 * geometry and mechanical summary, and the document register of every report
 * issued for the revision. All values are read verbatim from the frozen
 * result snapshots and the active DS-SEL record — never re-runs engines,
 * never invents values.
 */
import { pool } from '../db';
import type { ReportPayload, ReportRow, ReportSection } from './report-framework';
import { decisionRecordSection } from './ecp-ecr-calculation-reports';

const s = (v: unknown): string => (v == null || v === '' ? '—' : String(v));
const fnum = (v: unknown, dp = 2): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(dp) : 'Not Calculable');

export async function buildEngineeringDesignReportPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
  const revQ = await pool.query(
    `SELECT r.*, d.design_number, d.title, d.design_type
       FROM design_software_revisions r
       JOIN design_software_designs d ON d.id = r.design_id
      WHERE r.id = $1`, [revisionId]);
  if (!revQ.rows.length) throw new Error('Revision not found');
  const rev = revQ.rows[0];

  const inQ = await pool.query(`SELECT section, data FROM design_software_inputs WHERE revision_id = $1`, [revisionId]);
  const bySection: Record<string, Record<string, any>> = {};
  for (const r of inQ.rows) bySection[r.section] = { ...(bySection[r.section] ?? {}), ...(r.data ?? {}) };
  const di = bySection['design_identity'] ?? {};
  const db = bySection['design_basis'] ?? {};
  const pd = bySection['process_design'] ?? {};

  const resQ = await pool.query(`SELECT section, data, engine_version, computed_at FROM design_software_results WHERE revision_id = $1`, [revisionId]);
  const results: Record<string, any> = {};
  for (const r of resQ.rows) results[r.section] = r;

  const dselQ = await pool.query(
    `SELECT record FROM design_selection_records
      WHERE revision_id = $1 AND is_superseded = FALSE
      ORDER BY created_at DESC LIMIT 1`, [revisionId]);
  const dsel = dselQ.rows[0]?.record;

  const runsQ = await pool.query(
    `SELECT id, calculation_type, engine_name, engine_version, calculation_status, calculated_at
       FROM design_software_calculation_runs
      WHERE revision_id = $1 AND calculation_status IN ('success','warning')
      ORDER BY calculated_at DESC`, [revisionId]);
  const latestRun: Record<string, any> = {};
  for (const r of runsQ.rows) if (!latestRun[r.calculation_type]) latestRun[r.calculation_type] = r;

  const assumptions: NonNullable<ReportPayload['assumptions']> = [];
  const missing: NonNullable<ReportPayload['missingData']> = [];
  const references = new Set<string>();

  if (!results['process_design']) missing.push({ item: 'Process design results (C2)', reason: 'No persisted C2 results — run the Process Design calculation before issuing the engineering design report.', severity: 'error' });
  if (!dsel) missing.push({ item: 'Design selection record', reason: 'No active DS-SEL record exists — run the Stage 7 equipment calculations so the technology and diameter selection is established.', severity: 'error' });
  if (!results['mechanical_vessel']) missing.push({ item: 'Mechanical design results', reason: 'No persisted mechanical results — run the Stage 9 Mechanical Design calculation before issuing the engineering design report.', severity: 'error' });

  const sections: ReportSection[] = [];

  // ── 1. Introduction & design basis extract ────────────────────────────────
  sections.push({
    title: 'Introduction & Design Basis Extract',
    intro: 'Key basis values — the complete source-classified basis is in the Design Basis Report (DBR).',
    rows: [
      { label: 'Design number / title', value: `${s(rev.design_number)} — ${s(rev.title)}`, sourceType: 'Design register' },
      { label: 'Client / Plant location', value: `${s(di.client)} / ${s(di.plant_location)}`, sourceType: 'Design identity' },
      { label: 'Service', value: `Liquid-liquid extraction — feed: ${s(db.feed_service)}; solvent: ${s(db.solvent)}`, sourceType: 'Design basis' },
      { label: 'Design capacity', value: db.design_capacity_lph ? `${db.design_capacity_lph} LPH${db.design_capacity_mtpa ? ` (${db.design_capacity_mtpa} MTPA)` : ''}` : '—', sourceType: 'Design basis' },
      { label: 'S/O ratio', value: s(pd.so_ratio), sourceType: 'Process basis' },
      { label: 'Extraction temperature / pressure', value: `${s(pd.extraction_temperature)} °C / ${s(pd.extraction_pressure)}`, sourceType: 'Process basis' },
      { label: 'Theoretical stages / stage efficiency', value: `${s(pd.theoretical_stages)} / ${s(pd.stage_efficiency)}`, sourceType: 'Process basis' },
    ],
  });

  // ── 2. Process design summary (C2, verbatim) ──────────────────────────────
  const c2 = results['process_design']?.data;
  if (c2) {
    const nb = c2.normalCase ?? c2.materialBalance?.normalCase ?? {};
    const mb = c2.maximumCase ?? c2.materialBalance?.maximumCase ?? {};
    const flowRows: ReportRow[] = [];
    const pushFlow = (label: string, kase: any) => {
      const feed = kase?.feed ?? kase?.streams?.feed; const solvent = kase?.solvent ?? kase?.streams?.solvent;
      if (feed || solvent) flowRows.push({ label, value: `feed ${fnum(feed?.volumetricFlow_m3_h ?? feed?.flow_m3_h)} m³/h; solvent ${fnum(solvent?.volumetricFlow_m3_h ?? solvent?.flow_m3_h)} m³/h`, sourceType: 'Frozen C2 snapshot (verbatim)' });
    };
    pushFlow('Normal case flows', nb);
    pushFlow('Maximum continuous case flows', mb);
    sections.push({
      title: 'Process Design Summary (C2)',
      intro: 'Headline flows only — the complete material and solvent balance with provenance is in the Process Design Report (PDR).',
      rows: flowRows.length ? flowRows : [{ label: 'C2 summary', value: 'See the Process Design Report (PDR) for the complete frozen balance.', sourceType: `Frozen C2 snapshot (engine v${s(results['process_design']?.engine_version)})` }],
    });
  }

  // ── 3. Engineering decision record — technology + diameter governance ─────
  sections.push(await decisionRecordSection(revisionId));

  // ── 4. Governing geometry & mechanical summary ────────────────────────────
  const mech = results['mechanical_vessel']?.data;
  if (mech) {
    const ds = mech.mechanicalDatasheet ?? {};
    const geo = ds.geometry ?? {};
    const dc = ds.designConditions ?? {};
    const mat = ds.material ?? {};
    const thk = ds.thickness ?? {};
    const w = ds.weights ?? {};
    if (!dc.designCode || String(dc.designCode) === 'NOT_ASSIGNED') {
      missing.push({ item: 'Design code', reason: 'No governing design code has been assigned (engine records NOT_ASSIGNED) — assign it in Stage 9 before issuing the engineering design report.', severity: 'error' });
    }
    sections.push({
      title: 'Governing Geometry & Mechanical Summary',
      intro: 'Read verbatim from the frozen mechanical snapshot at the effective design diameter (DS-SEL-006). Full workings are in the Mechanical Datasheet (MDS).',
      rows: [
        { label: 'Inside diameter', value: fnum(geo.insideDiameter_m, 3), unit: 'm', sourceType: 'Frozen mechanical snapshot' },
        { label: 'Tangent-to-tangent / overall height', value: `${fnum(geo.tangentToTangent_m, 2)} / ${fnum(geo.overallHeight_m, 2)}`, unit: 'm', sourceType: 'Frozen mechanical snapshot' },
        { label: 'Head type / orientation', value: `${s(geo.headType)} / ${s(geo.orientation)}`, sourceType: 'Frozen mechanical snapshot' },
        { label: 'Design pressure / temperature', value: `${fnum(dc.designPressure_barg)} barg / ${fnum(dc.designTemperature_C, 1)} °C`, sourceType: 'Frozen mechanical snapshot' },
        { label: 'Governing design code', value: s(dc.designCode), sourceType: dc.designCode && dc.designCode !== 'NOT_ASSIGNED' ? 'Stage 9 input' : 'NOT ASSIGNED — blocking' },
        { label: 'Material', value: `${s(mat.materialName)}${mat.materialSpecification ? ` — ${mat.materialSpecification}` : ''}`, sourceType: s(mat.source ?? 'Stage 9 input (frozen)') },
        { label: 'Selected shell / head thickness (screening)', value: `${typeof thk.shellSelected_mm === 'number' ? fnum(thk.shellSelected_mm, 1) : 'Not Calculable'} / ${typeof thk.headSelected_mm === 'number' ? fnum(thk.headSelected_mm, 1) : 'Not Calculable'}`, unit: 'mm', sourceType: 'Screening — detailed code design outstanding' },
        { label: 'Weights (empty / operating / hydrotest)', value: `${fnum(w.empty_kg, 0)} / ${fnum(w.operating_kg, 0)} / ${fnum(w.hydrotest_kg, 0)}`, unit: 'kg', sourceType: 'Frozen mechanical snapshot (screening)' },
      ],
    });
    for (const a of mech.assumptions ?? []) {
      assumptions.push({ item: `Mechanical engine assumption (${a.scope ?? 'run'})`, value: '—', sourceRef: a.sourceReference ? `${a.assumption} — ${a.sourceReference}` : String(a.assumption ?? a), status: a.sourceType === 'Assumed' ? 'Assumed — Pending Validation' : 'Engine screening assumption' });
      if (a.sourceReference) references.add(a.sourceReference);
    }
  }

  // ── 5. Calculation run register ────────────────────────────────────────────
  sections.push({
    title: 'Calculation Run Register (latest accepted run per type)',
    table: [
      ['Calculation', 'Run ID', 'Engine', 'Version', 'Status', 'Calculated at (UTC)'],
      ...Object.values(latestRun).map((r: any) => [s(r.calculation_type), String(r.id), s(r.engine_name), s(r.engine_version), s(r.calculation_status), r.calculated_at ? new Date(r.calculated_at).toISOString().replace('T', ' ').slice(0, 16) : '—']),
    ],
  });

  // ── 6. Document register ───────────────────────────────────────────────────
  const repQ = await pool.query(
    `SELECT doc_type, doc_number, report_rev, status, is_stale, created_at
       FROM design_reports WHERE revision_id = $1 ORDER BY doc_type, created_at`, [revisionId]);
  sections.push({
    title: 'Document Register',
    intro: 'Every report generated for this revision. Stale rows were superseded by a governed design change and are retained for the audit trail.',
    table: [
      ['Document', 'Doc No.', 'Rev', 'Status', 'Generated (UTC)'],
      ...repQ.rows.map((r: any) => [s(r.doc_type), s(r.doc_number), s(r.report_rev), r.is_stale ? `${r.status} (STALE — superseded)` : s(r.status), r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 16) : '—']),
    ],
  });

  missing.push({ item: 'Report maturity', reason: 'All results in this report are PRELIMINARY screening-class — see the individual calculation reports for the complete limitations and Not Calculable registers.', severity: 'warning' });

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'EDR',
    docTypeTitle: 'Engineering Design Report',
    docNumber: `${rev.design_number}-EDR`,
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
      runs: Object.values(latestRun).map((r: any) => ({ engine: r.engine_name, version: String(r.engine_version ?? '—'), runId: r.id, ranAt: r.calculated_at ? new Date(r.calculated_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : undefined })),
      note: 'Compiled verbatim from the frozen result snapshots, the active DS-SEL record and the report register — never re-runs engines.',
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
