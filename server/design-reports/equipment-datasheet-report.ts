/**
 * Equipment Datasheet (EDS) — payload builder.
 *
 * Engineering datasheet for equipment procurement: service & identification,
 * process operating/design conditions, fluid properties, governing geometry
 * (effective design diameter per DS-SEL-006), materials & thicknesses, nozzle
 * schedule, supports, weights and lifting. The datasheet consumes ONLY the
 * frozen mechanical_vessel result snapshot and the persisted design inputs —
 * it never re-runs engines and never invents values. Items the engine
 * declared Not Calculable / Not Assigned are reproduced verbatim.
 */
import { pool } from '../db';
import type { ReportPayload, ReportRow, ReportSection } from './report-framework';

const fnum = (v: unknown, dp = 2): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(dp) : '—');
const f0 = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : '—');
const s = (v: unknown): string => (v == null || v === '' ? '—' : String(v));

export async function buildEquipmentDatasheetPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
  const revQ = await pool.query(
    `SELECT r.*, d.design_number, d.title, d.design_type
       FROM design_software_revisions r
       JOIN design_software_designs d ON d.id = r.design_id
      WHERE r.id = $1`, [revisionId]);
  if (!revQ.rows.length) throw new Error('Revision not found');
  const rev = revQ.rows[0];

  // ── Frozen mechanical result snapshot (never re-run) ──────────────────────
  const resQ = await pool.query(`SELECT data, engine_version, computed_at FROM design_software_results WHERE revision_id = $1 AND section = 'mechanical_vessel'`, [revisionId]);
  if (!resQ.rows.length) {
    throw Object.assign(new Error('No persisted mechanical design results for this revision — run the Mechanical Design calculation (Stage 9) first. The datasheet never re-runs engines.'), { statusCode: 422 });
  }
  const res = resQ.rows[0];
  const mech = res.data ?? {};
  const ds = mech.mechanicalDatasheet ?? {};

  const runQ = await pool.query(
    `SELECT id, engine_name, engine_version, calculation_status, calculated_at
       FROM design_software_calculation_runs
      WHERE revision_id = $1 AND calculation_type = 'mechanical_vessel'
      ORDER BY calculated_at DESC LIMIT 1`, [revisionId]);
  const run = runQ.rows[0];

  // ── Design inputs by section ───────────────────────────────────────────────
  const inQ = await pool.query(`SELECT section, data FROM design_software_inputs WHERE revision_id = $1`, [revisionId]);
  const bySection: Record<string, Record<string, any>> = {};
  for (const r of inQ.rows) bySection[r.section] = { ...(bySection[r.section] ?? {}), ...(r.data ?? {}) };
  const di = bySection['design_identity'] ?? {};
  const db = bySection['design_basis'] ?? {};
  const fp = bySection['fluid_properties'] ?? {};

  // ── Active DS-SEL record — governing diameter ─────────────────────────────
  const dselQ = await pool.query(
    `SELECT record FROM design_selection_records
      WHERE revision_id = $1 AND is_superseded = FALSE
      ORDER BY created_at DESC LIMIT 1`, [revisionId]);
  const dsel = dselQ.rows[0]?.record;

  const assumptions: ReportPayload['assumptions'] = [];
  const missing: ReportPayload['missingData'] = [];
  const references = new Set<string>();

  for (const a of ds.assumptions ?? mech.assumptions ?? []) {
    assumptions.push({
      item: `Mechanical engine assumption (${a.scope ?? 'run'})`,
      value: '—',
      sourceRef: a.sourceReference ? `${a.assumption} — ${a.sourceReference}` : String(a.assumption ?? a),
      status: a.sourceType === 'Assumed' ? 'Assumed — Pending Validation' : 'Engine screening assumption',
    });
    if (a.sourceReference) references.add(a.sourceReference);
  }

  if (String(mech.calculationRunStatus ?? '').toLowerCase() === 'warning') {
    missing.push({ item: 'Mechanical run status', reason: 'The persisted mechanical run completed with warnings — see the assumptions and limitations sections.', severity: 'warning' });
  }
  if (ds.datasheetType === 'PRELIMINARY_MECHANICAL_DATASHEET' || ds.revision === 'SCREENING') {
    missing.push({ item: 'Datasheet maturity', reason: 'The mechanical engine classifies this as a PRELIMINARY (screening) datasheet — detailed mechanical design per the governing code is required before procurement release.', severity: 'warning' });
  }

  const dc = ds.designConditions ?? {};
  const mat = ds.material ?? {};
  const geo = ds.geometry ?? {};
  const thk = ds.thickness ?? {};
  const sup = ds.support ?? {};
  const wts = ds.weights ?? {};
  const lift = ds.lifting ?? {};

  if (!dc.designCode || String(dc.designCode) === 'NOT_ASSIGNED') {
    missing.push({ item: 'Design code', reason: 'No governing design code has been assigned in the mechanical design inputs (engine records NOT_ASSIGNED). A datasheet cannot be issued for procurement without the governing code — assign it in Stage 9.', severity: 'error' });
  }

  // ── Sections ───────────────────────────────────────────────────────────────
  const sections: ReportSection[] = [
    { title: 'Service & Identification', rows: [
      { label: 'Equipment service', value: `Liquid-Liquid Extraction Column — feed: ${s(db.feed_service)}; solvent: ${s(db.solvent)}`, sourceType: 'Design basis' },
      { label: 'Design number', value: s(rev.design_number), sourceType: 'Design register' },
      { label: 'Client / Plant location', value: `${s(di.client)} / ${s(di.plant_location)}`, sourceType: 'Design identity' },
      { label: 'Orientation', value: s(geo.orientation ?? db.vessel_orientation), sourceType: 'Frozen mechanical snapshot' },
      { label: 'Design capacity', value: db.design_capacity_lph ? `${db.design_capacity_lph} LPH${db.design_capacity_mtpa ? ` (${db.design_capacity_mtpa} MTPA)` : ''}` : '—', sourceType: 'Design basis' },
    ]},
    { title: 'Process & Design Conditions', intro: 'Read verbatim from the frozen mechanical run snapshot (Stage 9 governing values).', rows: [
      { label: 'Operating pressure', value: fnum(dc.operatingPressure_barg), unit: 'barg', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Design pressure', value: fnum(dc.designPressure_barg), unit: 'barg', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Operating temperature', value: fnum(dc.operatingTemperature_C, 1), unit: '°C', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Design temperature', value: fnum(dc.designTemperature_C, 1), unit: '°C', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Governing design code', value: s(dc.designCode), sourceType: dc.designCode && dc.designCode !== 'NOT_ASSIGNED' ? 'Stage 9 input' : 'NOT ASSIGNED — blocking', sourceRef: dc.designCode === 'NOT_ASSIGNED' ? 'The engine records NOT_ASSIGNED verbatim; no code is invented.' : '' },
      { label: 'Joint efficiency', value: fnum(dc.jointEfficiency), unit: '-', sourceType: 'Stage 9 input (frozen)' },
      ...(db.llx_full_vacuum_required != null ? [{ label: 'Full vacuum required', value: s(db.llx_full_vacuum_required), sourceType: 'Design basis' } as ReportRow] : []),
    ]},
    { title: 'Fluid Properties (Datasheet Extract)', intro: 'Stored fluid-property values with their recorded sources — see the Design Basis Report for the complete register.', rows: [
      { label: 'Feed (RRBO) density', value: fp.rrbo_density_value ? `${fp.rrbo_density_value} ${s(fp.rrbo_density_unit)}` : '—', sourceType: s(fp.rrbo_density_source), sourceRef: fp.rrbo_density_ref_temp ? `at ${fp.rrbo_density_ref_temp}` : '' },
      { label: 'Feed (RRBO) dynamic viscosity', value: fp.rrbo_viscosity_dynamic_value ? `${fp.rrbo_viscosity_dynamic_value} ${s(fp.rrbo_viscosity_dynamic_unit)}` : '—', sourceType: s(fp.rrbo_viscosity_dynamic_source), sourceRef: fp.rrbo_viscosity_dynamic_ref_temp ? `at ${fp.rrbo_viscosity_dynamic_ref_temp}` : '' },
      { label: 'Solvent (NMP) density', value: fp.nmp_density_value ? `${fp.nmp_density_value} ${s(fp.nmp_density_unit)}` : '—', sourceType: s(fp.nmp_density_source), sourceRef: fp.nmp_density_ref_temp ? `at ${fp.nmp_density_ref_temp}` : '' },
      { label: 'Solvent (NMP) dynamic viscosity', value: fp.nmp_viscosity_dynamic_value ? `${fp.nmp_viscosity_dynamic_value} ${s(fp.nmp_viscosity_dynamic_unit)}` : '—', sourceType: s(fp.nmp_viscosity_dynamic_source), sourceRef: fp.nmp_viscosity_dynamic_ref_temp ? `at ${fp.nmp_viscosity_dynamic_ref_temp}` : '' },
      { label: 'Interfacial tension', value: fp.interfacial_tension_value ? `${fp.interfacial_tension_value} ${s(fp.interfacial_tension_unit)}` : '—', sourceType: s(fp.interfacial_tension_source) },
    ]},
    { title: 'Governing Geometry', intro: 'Dimensions read verbatim from the frozen mechanical run snapshot, computed at the effective design diameter (DS-SEL-006).', rows: [
      { label: 'Inside diameter', value: fnum(geo.insideDiameter_m, 3), unit: 'm', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Tangent-to-tangent length', value: fnum(geo.tangentToTangent_m, 2), unit: 'm', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Overall vessel height', value: fnum(geo.overallHeight_m, 2), unit: 'm', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Straight shell length', value: fnum(geo.straightShell_m, 2), unit: 'm', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Head type / depth', value: `${s(geo.headType)} / ${fnum(geo.headDepth_m, 3)} m`, sourceType: 'Frozen mechanical snapshot' },
    ]},
    { title: 'Materials & Thicknesses', rows: [
      { label: 'Shell / head material', value: `${s(mat.materialName)}${mat.materialSpecification ? ` — ${mat.materialSpecification}` : ''}${mat.materialGrade ? ` Gr. ${mat.materialGrade}` : ''}`, sourceType: s(mat.source ?? 'Stage 9 input (frozen)') },
      { label: 'Allowable stress', value: fnum(mat.allowableStress_MPa, 1), unit: 'MPa', sourceType: s(mat.source ?? 'Stage 9 input (frozen)') },
      { label: 'Material density', value: f0(mat.density_kg_m3), unit: 'kg/m³', sourceType: s(mat.source ?? 'Stage 9 input (frozen)') },
      { label: 'Corrosion allowance', value: fnum(mat.corrosionAllowance_mm ?? thk.corrosionAllowance_mm, 1), unit: 'mm', sourceType: 'Stage 9 input (frozen)' },
      { label: 'Shell thickness (selected)', value: fnum(thk.shellSelected_mm, 1), unit: 'mm', sourceType: s(thk.method ?? 'Frozen mechanical snapshot') },
      { label: 'Head thickness (selected)', value: fnum(thk.headSelected_mm, 1), unit: 'mm', sourceType: s(thk.method ?? 'Frozen mechanical snapshot') },
    ]},
    { title: 'Supports, Weights & Lifting', rows: [
      { label: 'Support type / quantity', value: `${s(sup.type)} / ${s(sup.quantity)}`, sourceType: 'Frozen mechanical snapshot', sourceRef: s(sup.basis ?? '') === '—' ? '' : String(sup.basis) },
      { label: 'Empty weight', value: f0(wts.empty_kg), unit: 'kg', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Operating weight', value: f0(wts.operating_kg), unit: 'kg', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Hydrotest weight', value: f0(wts.hydrotest_kg), unit: 'kg', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Weight breakdown (shell/heads/nozzles/internals/supports)', value: `${f0(wts.shell_kg)} / ${f0(wts.heads_kg)} / ${f0(wts.nozzles_kg)} / ${f0(wts.internals_kg)} / ${f0(wts.supports_kg)} kg`, sourceType: 'Frozen mechanical snapshot' },
      { label: 'Lifting lugs', value: lift.lugQuantity != null ? `${lift.lugQuantity}${(lift.suggestedLocations ?? []).length ? ` — ${lift.suggestedLocations.join('; ')}` : ''}` : '—', sourceType: lift.verified ? 'Verified' : 'Suggested — NOT verified (future analysis)' },
    ]},
  ];

  // ── Nozzle schedule table ──────────────────────────────────────────────────
  const nozzles: any[] = ds.nozzles ?? mech.nozzleSchedule ?? [];
  if (nozzles.length) {
    sections.push({
      title: 'Nozzle Schedule',
      intro: 'Read verbatim from the frozen mechanical run snapshot (Stage 9 nozzle inputs).',
      table: [
        ['Tag', 'Service', 'Size (DN)', 'Rating', 'Facing', 'Flange Std / Class', 'Remarks'],
        ...nozzles.map((n: any) => [s(n.tag), s(n.service), s(n.size_DN ?? n.size), s(n.rating), s(n.facing), `${s(n.flangeStandard)} / ${s(n.flangeClass)}`, s(n.remarks ?? '')]),
      ],
    });
  } else {
    missing.push({ item: 'Nozzle schedule', reason: 'No nozzle rows exist in the frozen mechanical snapshot — enter the nozzle schedule in Stage 9 and re-run the mechanical calculation.', severity: 'error' });
  }

  // ── Diameter governance (DS-SEL-006) ──────────────────────────────────────
  if (dsel?.selectedDiameter_mm != null) {
    sections.push({
      title: 'Governing Diameter (DS-SEL-006)',
      rows: [
        { label: 'Autonomous calculated diameter (retained for traceability)', value: String(dsel.autonomousDiameter_mm ?? dsel.selectedDiameter_mm), unit: 'mm', sourceType: 'DS-SEL-003' },
        { label: 'User-selected governing diameter', value: dsel.userSelectedDiameter_mm != null ? String(dsel.userSelectedDiameter_mm) : 'None — autonomous selection governs', unit: dsel.userSelectedDiameter_mm != null ? 'mm' : undefined, sourceType: 'DS-SEL-006', sourceRef: dsel.userSelection ? `Governed selection by ${dsel.userSelection.engineer}: ${dsel.userSelection.reason}` : '' },
        { label: 'EFFECTIVE design diameter (governs this datasheet)', value: String(dsel.effectiveDiameter_mm ?? dsel.selectedDiameter_mm), unit: 'mm', sourceType: 'DS-SEL-006', sourceRef: dsel.selectionMode === 'user_selected' ? 'Governed user selection of a larger, more conservative diameter — not an Engineer Override of an unsafe design.' : 'Autonomous selection — no governed user selection entered.' },
      ],
    });
    const effM = (dsel.effectiveDiameter_mm ?? dsel.selectedDiameter_mm) / 1000;
    if (typeof geo.insideDiameter_m === 'number' && Math.abs(geo.insideDiameter_m - effM) > 0.0005) {
      missing.push({ item: 'Diameter consistency', reason: `The frozen mechanical snapshot inside diameter (${geo.insideDiameter_m} m) does not match the effective design diameter (${effM} m) — a Stage 9 explicit diameter override or a stale mechanical run governs. Re-run the mechanical calculation or resolve the override before issue.`, severity: 'error' });
    }
  } else {
    missing.push({ item: 'Design selection record', reason: 'No active DS-SEL record exists — run the Stage 7 equipment calculations so the governing diameter is established.', severity: 'error' });
  }

  // ── Applicability & future analyses ───────────────────────────────────────
  const futureParas: string[] = [];
  if (mech.applicabilityStatement) futureParas.push(`Applicability (verbatim): ${mech.applicabilityStatement}`);
  for (const l of mech.limitations ?? []) futureParas.push(`Limitation (verbatim): ${l}`);
  if (ds.futureAnalyses || mech.futureAnalyses) futureParas.push(`Analyses NOT performed in this screening datasheet (engine declaration, verbatim): ${JSON.stringify(ds.futureAnalyses ?? mech.futureAnalyses)}`);
  if (ds.note) futureParas.push(String(ds.note));
  if (futureParas.length) sections.push({ title: 'Applicability, Limitations & Outstanding Analyses', paragraphs: futureParas });

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'EDS',
    docTypeTitle: 'Equipment Datasheet',
    docNumber: `${rev.design_number}-EDS`,
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
      note: `Renders the persisted mechanical_vessel result snapshot (computed ${res.computed_at ? new Date(res.computed_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}). ${ds.datasheetType ? `Engine datasheet classification: ${ds.datasheetType} (${ds.revision ?? '—'}).` : ''}`,
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
