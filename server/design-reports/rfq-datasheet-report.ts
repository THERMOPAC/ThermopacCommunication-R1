/**
 * RFQ Datasheet (RFQ) — payload builder.
 *
 * Request-for-quotation specification sheet: the purchaser's data (service,
 * design conditions, governing geometry at the effective design diameter,
 * materials, nozzle schedule, weights) read verbatim from the frozen
 * mechanical snapshot, plus an explicit VENDOR-SCOPE section that lists the
 * analyses this preliminary design did NOT perform (engine declaration
 * verbatim) — the vendor must confirm/perform them. Never invents scope,
 * inspection classes or test requirements that were not entered.
 */
import { pool } from '../db';
import type { ReportPayload, ReportRow, ReportSection } from './report-framework';

const s = (v: unknown): string => (v == null || v === '' ? '—' : String(v));
const fnum = (v: unknown, dp = 2): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(dp) : 'Not Calculable');
const f0 = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : 'Not Calculable');

export async function buildRfqDatasheetPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
  const revQ = await pool.query(
    `SELECT r.*, d.design_number, d.title, d.design_type
       FROM design_software_revisions r
       JOIN design_software_designs d ON d.id = r.design_id
      WHERE r.id = $1`, [revisionId]);
  if (!revQ.rows.length) throw new Error('Revision not found');
  const rev = revQ.rows[0];

  const resQ = await pool.query(`SELECT data, engine_version, computed_at FROM design_software_results WHERE revision_id = $1 AND section = 'mechanical_vessel'`, [revisionId]);
  if (!resQ.rows.length) {
    throw Object.assign(new Error('No persisted mechanical design results for this revision — run the Mechanical Design calculation (Stage 9) first. The datasheet never re-runs engines.'), { statusCode: 422 });
  }
  const res = resQ.rows[0];
  const mech = res.data ?? {};
  const ds = mech.mechanicalDatasheet ?? {};

  const runQ = await pool.query(
    `SELECT id, engine_name, engine_version, calculated_at
       FROM design_software_calculation_runs
      WHERE revision_id = $1 AND calculation_type = 'mechanical_vessel'
      ORDER BY calculated_at DESC LIMIT 1`, [revisionId]);
  const run = runQ.rows[0];

  const inQ = await pool.query(`SELECT section, data FROM design_software_inputs WHERE revision_id = $1`, [revisionId]);
  const bySection: Record<string, Record<string, any>> = {};
  for (const r of inQ.rows) bySection[r.section] = { ...(bySection[r.section] ?? {}), ...(r.data ?? {}) };
  const di = bySection['design_identity'] ?? {};
  const db = bySection['design_basis'] ?? {};

  const dselQ = await pool.query(
    `SELECT record FROM design_selection_records
      WHERE revision_id = $1 AND is_superseded = FALSE
      ORDER BY created_at DESC LIMIT 1`, [revisionId]);
  const dsel = dselQ.rows[0]?.record;

  const assumptions: ReportPayload['assumptions'] = [];
  const missing: ReportPayload['missingData'] = [];
  const references = new Set<string>();

  const dc = ds.designConditions ?? {};
  const mat = ds.material ?? {};
  const geo = ds.geometry ?? {};
  const thk = ds.thickness ?? {};
  const wts = ds.weights ?? {};

  if (!dc.designCode || String(dc.designCode) === 'NOT_ASSIGNED') {
    missing.push({ item: 'Design code', reason: 'No governing design code has been assigned (engine records NOT_ASSIGNED). An RFQ cannot be issued without the code the vendor must design to — assign it in Stage 9.', severity: 'error' });
  }
  if (String(mech.calculationRunStatus ?? '').toLowerCase() === 'warning') {
    missing.push({ item: 'Mechanical run status', reason: 'The persisted mechanical run completed with warnings — see the vendor-scope section for the outstanding analyses.', severity: 'warning' });
  }
  missing.push({ item: 'RFQ maturity', reason: 'Purchaser data are from a PRELIMINARY (screening) mechanical design — thicknesses and weights are indicative for quotation only; detailed design per the governing code is the vendor\'s scope.', severity: 'warning' });

  const sections: ReportSection[] = [
    { title: 'Enquiry Identification', rows: [
      { label: 'Equipment', value: `Liquid-Liquid Extraction Column — feed: ${s(db.feed_service)}; solvent: ${s(db.solvent)}`, sourceType: 'Design basis' },
      { label: 'Design number / title', value: `${s(rev.design_number)} — ${s(rev.title)}`, sourceType: 'Design register' },
      { label: 'Client / Plant location', value: `${s(di.client)} / ${s(di.plant_location)}`, sourceType: 'Design identity' },
    ]},
    { title: 'Purchaser Design Data', intro: 'Read verbatim from the frozen mechanical run snapshot at the effective design diameter (DS-SEL-006).', rows: [
      { label: 'Operating / design pressure', value: `${fnum(dc.operatingPressure_barg)} / ${fnum(dc.designPressure_barg)}`, unit: 'barg', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Operating / design temperature', value: `${fnum(dc.operatingTemperature_C, 1)} / ${fnum(dc.designTemperature_C, 1)}`, unit: '°C', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Governing design code (vendor design basis)', value: s(dc.designCode), sourceType: dc.designCode && dc.designCode !== 'NOT_ASSIGNED' ? 'Stage 9 input' : 'NOT ASSIGNED — blocking' },
      { label: 'Inside diameter', value: fnum(geo.insideDiameter_m, 3), unit: 'm', sourceType: 'Frozen mechanical snapshot (effective design diameter, DS-SEL-006)' },
      { label: 'Tangent-to-tangent / overall height', value: `${fnum(geo.tangentToTangent_m, 2)} / ${fnum(geo.overallHeight_m, 2)}`, unit: 'm', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Head type', value: s(geo.headType), sourceType: 'Frozen mechanical snapshot' },
      { label: 'Orientation', value: s(geo.orientation), sourceType: 'Frozen mechanical snapshot' },
      { label: 'Material (shell/heads)', value: `${s(mat.materialName)}${mat.materialSpecification ? ` — ${mat.materialSpecification}` : ''}${mat.materialGrade ? ` Gr. ${mat.materialGrade}` : ''}`, sourceType: s(mat.source ?? 'Stage 9 input (frozen)') },
      { label: 'Corrosion allowance', value: fnum(mat.corrosionAllowance_mm ?? thk.corrosionAllowance_mm, 1), unit: 'mm', sourceType: 'Stage 9 input (frozen)' },
      { label: 'Indicative shell / head thickness (screening)', value: `${typeof thk.shellSelected_mm === 'number' ? fnum(thk.shellSelected_mm, 1) : 'Not Calculable'} / ${typeof thk.headSelected_mm === 'number' ? fnum(thk.headSelected_mm, 1) : 'Not Calculable'}`, unit: 'mm', sourceType: 'Screening indication only — vendor to confirm by code calculation' },
      { label: 'Indicative weights (empty / operating / hydrotest)', value: `${f0(wts.empty_kg)} / ${f0(wts.operating_kg)} / ${f0(wts.hydrotest_kg)}`, unit: 'kg', sourceType: 'Screening indication only — vendor to confirm' },
      { label: 'Support type / quantity', value: `${s(ds.support?.type)} / ${s(ds.support?.quantity)}`, sourceType: 'Frozen mechanical snapshot' },
    ]},
  ];

  // ── Nozzle schedule ────────────────────────────────────────────────────────
  const nozzles: any[] = ds.nozzles ?? [];
  if (nozzles.length) {
    sections.push({
      title: 'Nozzle Schedule',
      intro: 'Read verbatim from the frozen mechanical run snapshot (Stage 9 nozzle inputs).',
      table: [
        ['Tag', 'Service', 'Size (DN)', 'Rating', 'Facing', 'Flange Std / Class', 'Remarks'],
        ...nozzles.map((n: any) => [s(n.tag), s(n.service), s(n.size_DN ?? n.size), s(n.rating), s(n.facing), `${s(n.flangeStandard)} / ${s(n.flangeClass)}`, s(n.remarks ?? '')]),
      ],
    });
    const isMissingVal = (v: unknown) => v == null || v === '' || /not calculable|not entered|not_assigned/i.test(String(v));
    const incomplete = nozzles.filter((n: any) => isMissingVal(n.size_DN ?? n.size) || isMissingVal(n.rating) || isMissingVal(n.facing) || isMissingVal(n.flangeStandard) || isMissingVal(n.flangeClass));
    if (incomplete.length) {
      missing.push({ item: 'Nozzle schedule completeness', reason: `Nozzle(s) ${incomplete.map((n: any) => s(n.tag)).join(', ')} are missing size, rating, facing and/or flange standard/class in the frozen snapshot — an RFQ cannot go to vendors with incompletely specified nozzles. Complete the Stage 9 nozzle inputs (or defaults) and re-run.`, severity: 'error' });
    }
  } else {
    missing.push({ item: 'Nozzle schedule', reason: 'No nozzle rows exist in the frozen mechanical snapshot — enter the nozzle schedule in Stage 9 and re-run the mechanical calculation.', severity: 'error' });
  }

  // ── Diameter governance consistency ───────────────────────────────────────
  if (dsel?.selectedDiameter_mm != null) {
    const effM = (dsel.effectiveDiameter_mm ?? dsel.selectedDiameter_mm) / 1000;
    if (typeof geo.insideDiameter_m !== 'number' || !Number.isFinite(geo.insideDiameter_m)) {
      missing.push({ item: 'Diameter consistency', reason: 'The frozen mechanical snapshot carries no numeric inside diameter — the consistency check against the effective design diameter (DS-SEL-006) cannot be performed. Re-run the mechanical calculation.', severity: 'error' });
    } else if (Math.abs(geo.insideDiameter_m - effM) > 0.0005) {
      missing.push({ item: 'Diameter consistency', reason: `The frozen mechanical snapshot inside diameter (${geo.insideDiameter_m} m) does not match the effective design diameter (${effM} m). Re-run the mechanical calculation or resolve the Stage 9 override before issue.`, severity: 'error' });
    }
  } else {
    missing.push({ item: 'Design selection record', reason: 'No active DS-SEL record exists — run the Stage 7 equipment calculations so the governing diameter is established.', severity: 'error' });
  }

  // ── Vendor scope — from the engine's own declarations, verbatim ───────────
  const vendorParas: string[] = [
    'The purchaser data above derive from a preliminary screening design. The following items are explicitly OUTSIDE the purchaser\'s screening calculation and form part of the vendor\'s design scope (engine declarations reproduced verbatim — nothing is invented):',
  ];
  if (mech.applicabilityStatement) vendorParas.push(`Applicability (verbatim): ${mech.applicabilityStatement}`);
  for (const l of mech.limitations ?? []) vendorParas.push(`Limitation (verbatim): ${l}`);
  if (mech.futureAnalyses) vendorParas.push(`Analyses NOT performed (verbatim): ${JSON.stringify(mech.futureAnalyses)}`);
  vendorParas.push('Inspection classes, NDE extents, testing and documentation requirements have NOT been specified in the design inputs and are therefore not stated here — they must be defined in the purchase specification before order placement.');
  sections.push({ title: 'Vendor Scope & Outstanding Analyses', paragraphs: vendorParas });

  for (const a of mech.assumptions ?? []) {
    assumptions.push({
      item: `Mechanical engine assumption (${a.scope ?? 'run'})`,
      value: '—',
      sourceRef: a.sourceReference ? `${a.assumption} — ${a.sourceReference}` : String(a.assumption ?? a),
      status: a.sourceType === 'Assumed' ? 'Assumed — Pending Validation' : 'Engine screening assumption',
    });
    if (a.sourceReference) references.add(a.sourceReference);
  }

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'RFQ',
    docTypeTitle: 'RFQ Datasheet',
    docNumber: `${rev.design_number}-RFQ`,
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
      runs: [{ engine: run?.engine_name ?? 'mechanical-vessel', version: String(res.engine_version ?? run?.engine_version ?? '—'), runId: run?.id ?? null, ranAt: run?.calculated_at ? new Date(run.calculated_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : undefined }],
      note: `Renders the persisted mechanical_vessel result snapshot (computed ${res.computed_at ? new Date(res.computed_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}).`,
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
