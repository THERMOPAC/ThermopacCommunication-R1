/**
 * Mechanical Datasheet (MDS) — payload builder.
 *
 * Fabrication-oriented mechanical design datasheet: full thickness workings
 * (calculated → +CA → required → selected plate, with the engine's formula
 * strings verbatim), design conditions, materials, geometry, the complete
 * nozzle schedule with projections/facings, supports, the full weight
 * breakdown with formula provenance, lifting and the engine's validation
 * checklist. Consumes ONLY the frozen mechanical_vessel result snapshot —
 * never re-runs the engine, never invents values (Not Calculable verbatim).
 */
import { pool } from '../db';
import type { ReportPayload, ReportRow, ReportSection } from './report-framework';

const s = (v: unknown): string => (v == null || v === '' ? '—' : String(v));
const fnum = (v: unknown, dp = 2): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(dp) : 'Not Calculable');

/** Render a rich engine ResultItem as a report row — formula/source verbatim. */
function itemRow(label: string, it: any, unitOverride?: string): ReportRow {
  if (!it) return { label, value: '—', sourceType: 'Absent from frozen snapshot' };
  const value = it.result == null ? String(it.status ?? 'Not Calculable') : (typeof it.result === 'number' ? String(Math.round(it.result * 1000) / 1000) : String(it.result));
  return {
    label,
    value,
    unit: unitOverride ?? (it.units || undefined),
    sourceType: `${it.formulaReference ?? '—'} — ${it.status ?? '—'}`,
    sourceRef: [it.source, it.validation].filter(Boolean).join(' | '),
  };
}

export async function buildMechanicalDatasheetPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
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
  const sd = mech.shellDesign ?? {};
  const wts = mech.weights ?? {};
  const lift = mech.lifting ?? {};

  const runQ = await pool.query(
    `SELECT id, engine_name, engine_version, calculated_at
       FROM design_software_calculation_runs
      WHERE revision_id = $1 AND calculation_type = 'mechanical_vessel'
      ORDER BY calculated_at DESC LIMIT 1`, [revisionId]);
  const run = runQ.rows[0];

  const diQ = await pool.query(`SELECT data FROM design_software_inputs WHERE revision_id = $1 AND section = 'design_identity'`, [revisionId]);
  const di: Record<string, string> = diQ.rows.reduce((a: any, r: any) => ({ ...a, ...r.data }), {});

  const assumptions: ReportPayload['assumptions'] = [];
  const missing: ReportPayload['missingData'] = [];
  const references = new Set<string>();

  for (const a of mech.assumptions ?? []) {
    assumptions.push({
      item: `Mechanical engine assumption (${a.scope ?? 'run'})`,
      value: '—',
      sourceRef: a.sourceReference ? `${a.assumption} — ${a.sourceReference}` : String(a.assumption ?? a),
      status: a.sourceType === 'Assumed' ? 'Assumed — Pending Validation' : 'Engine screening assumption',
    });
    if (a.sourceReference) references.add(a.sourceReference);
  }
  if (String(mech.calculationRunStatus ?? '').toLowerCase() === 'warning') {
    missing.push({ item: 'Mechanical run status', reason: 'The persisted mechanical run completed with warnings — see the assumptions and checklist sections.', severity: 'warning' });
  }
  missing.push({ item: 'Datasheet maturity', reason: `This is a PRELIMINARY (screening) mechanical datasheet — ${s(mech.designBasis?.thicknessMethod)}. Detailed mechanical design per the governing code is required before fabrication.`, severity: 'warning' });

  const dc = ds.designConditions ?? {};
  const mat = ds.material ?? {};
  const geo = ds.geometry ?? {};

  if (!dc.designCode || String(dc.designCode) === 'NOT_ASSIGNED') {
    missing.push({ item: 'Design code', reason: 'No governing design code has been assigned (engine records NOT_ASSIGNED). A mechanical datasheet cannot be issued for fabrication without the governing code — assign it in Stage 9.', severity: 'error' });
  }
  if (sd.shellThicknessSelected?.result == null) {
    missing.push({ item: 'Shell thickness (selected)', reason: `Selected shell plate is Not Calculable in the frozen snapshot: ${s(sd.shellThicknessSelected?.source)}.`, severity: 'error' });
  }
  if (sd.headThicknessSelected?.result == null) {
    missing.push({ item: 'Head thickness (selected)', reason: `Selected head plate is Not Calculable in the frozen snapshot: ${s(sd.headThicknessSelected?.source)}.`, severity: 'error' });
  }

  const sections: ReportSection[] = [
    { title: 'Identification & Design Conditions', rows: [
      { label: 'Design number / title', value: `${s(rev.design_number)} — ${s(rev.title)}`, sourceType: 'Design register' },
      { label: 'Client / Plant location', value: `${s(di.client)} / ${s(di.plant_location)}`, sourceType: 'Design identity' },
      { label: 'Orientation', value: s(geo.orientation), sourceType: 'Frozen mechanical snapshot', sourceRef: s(mech.designBasis?.orientationInput) },
      { label: 'Operating / design pressure', value: `${fnum(dc.operatingPressure_barg)} / ${fnum(dc.designPressure_barg)}`, unit: 'barg', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Operating / design temperature', value: `${fnum(dc.operatingTemperature_C, 1)} / ${fnum(dc.designTemperature_C, 1)}`, unit: '°C', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Governing design code', value: s(dc.designCode), sourceType: dc.designCode && dc.designCode !== 'NOT_ASSIGNED' ? 'Stage 9 input' : 'NOT ASSIGNED — blocking', sourceRef: dc.designCode === 'NOT_ASSIGNED' ? 'The engine records NOT_ASSIGNED verbatim; no code is invented.' : '' },
      { label: 'Joint efficiency', value: fnum(dc.jointEfficiency), unit: '-', sourceType: 'Stage 9 input (frozen)' },
      { label: 'Pressure unit basis', value: s(mech.designBasis?.pressureUnitBasis), sourceType: 'Engine declaration (verbatim)' },
    ]},
    { title: 'Materials', rows: [
      { label: 'Shell / head material', value: `${s(mat.materialName)}${mat.materialSpecification ? ` — ${mat.materialSpecification}` : ''}${mat.materialGrade ? ` Gr. ${mat.materialGrade}` : ''}`, sourceType: s(mat.source ?? 'Stage 9 input (frozen)') },
      { label: 'Allowable stress', value: fnum(mat.allowableStress_MPa, 1), unit: 'MPa', sourceType: s(mat.source ?? 'Stage 9 input (frozen)') },
      { label: 'Material density', value: fnum(mat.density_kg_m3, 0), unit: 'kg/m³', sourceType: s(mat.source ?? 'Stage 9 input (frozen)') },
      { label: 'Corrosion allowance', value: fnum(mat.corrosionAllowance_mm, 1), unit: 'mm', sourceType: 'Stage 9 input (frozen)' },
    ]},
    { title: 'Geometry', rows: [
      { label: 'Inside diameter', value: fnum(geo.insideDiameter_m, 3), unit: 'm', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Tangent-to-tangent length', value: fnum(geo.tangentToTangent_m, 2), unit: 'm', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Overall vessel height', value: fnum(geo.overallHeight_m, 2), unit: 'm', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Straight shell length', value: fnum(geo.straightShell_m, 2), unit: 'm', sourceType: 'Frozen mechanical snapshot' },
      { label: 'Head type / depth', value: `${s(geo.headType)} / ${fnum(geo.headDepth_m, 3)} m`, sourceType: 'Frozen mechanical snapshot' },
    ]},
    { title: 'Thickness Design Workings (verbatim engine formulas)', intro: `Method: ${s(mech.designBasis?.thicknessMethod)}. Every row reproduces the engine's stored formula string, source and status verbatim.`, rows: [
      itemRow('Shell thickness — calculated', sd.shellThicknessCalculated),
      itemRow('Head thickness — calculated', sd.headThicknessCalculated),
      itemRow('Corrosion allowance added', sd.corrosionAllowanceAdded),
      itemRow('Shell thickness — required (t_calc + CA)', sd.shellThicknessRequired),
      itemRow('Head thickness — required (t_calc + CA)', sd.headThicknessRequired),
      itemRow('Shell plate — selected', sd.shellThicknessSelected),
      itemRow('Head plate — selected', sd.headThicknessSelected),
    ]},
    { title: 'Supports', rows: [
      { label: 'Support type / quantity', value: `${s(ds.support?.type)} / ${s(ds.support?.quantity)}`, sourceType: 'Frozen mechanical snapshot', sourceRef: s(ds.support?.basis) === '—' ? '' : String(ds.support?.basis) },
    ]},
    { title: 'Weights (full breakdown with formula provenance)', rows: [
      itemRow('Shell', wts.shell),
      itemRow('Heads', wts.heads),
      itemRow('Nozzles / manways allowance', wts.nozzles),
      itemRow('Internals', wts.internals),
      itemRow('Supports', wts.supports),
      itemRow('Insulation', wts.insulation),
      itemRow('Future platforms / ladders', wts.futurePlatforms),
      itemRow('Empty (fabricated) weight', wts.emptyWeight),
      itemRow('Vessel volume', wts.vesselVolume),
      itemRow('Operating weight', wts.operatingWeight),
      itemRow('Hydrotest weight', wts.hydrotestWeight),
    ]},
    { title: 'Lifting (preliminary — NOT verified)', rows: [
      itemRow('Lifting lug quantity', lift.lugQuantity),
      { label: 'Suggested lug locations', value: (lift.suggestedLocations ?? ds.lifting?.suggestedLocations ?? []).join('; ') || '—', sourceType: 'Suggested — NOT verified (future lifting analysis required)' },
    ]},
  ];

  // ── Nozzle schedule (full — with facing/projection) ────────────────────────
  const nozzles: any[] = mech.nozzleSchedule ?? [];
  if (nozzles.length) {
    sections.push({
      title: 'Nozzle Schedule (full)',
      intro: 'Read verbatim from the frozen mechanical run snapshot. "Not Calculable" sizes were never assumed by the engine.',
      table: [
        ['Tag', 'Service', 'Size (DN)', 'Size basis (verbatim)', 'Rating', 'Facing', 'Flange Std / Class', 'Projection (mm)', 'Remarks'],
        ...nozzles.map((n: any) => [
          s(n.tag), s(n.service),
          n.size?.result != null ? String(n.size.result) : String(n.size?.status ?? 'Not Calculable'),
          s(n.size?.source),
          s(n.rating), s(n.facing), `${s(n.flangeStandard)} / ${s(n.flangeClass)}`,
          n.projection?.result != null ? String(n.projection.result) : s(n.projection?.status),
          s(n.remarks ?? ''),
        ]),
      ],
    });
    const isMissingVal = (v: unknown) => v == null || v === '' || /not calculable|not entered|not_assigned/i.test(String(v));
    const incomplete = nozzles.filter((n: any) => n.size?.result == null || isMissingVal(n.rating));
    if (incomplete.length) {
      missing.push({ item: 'Nozzle schedule completeness', reason: `Nozzle(s) ${incomplete.map((n: any) => s(n.tag)).join(', ')} have Not Calculable size and/or missing rating in the frozen snapshot. Complete the Stage 9 nozzle inputs and re-run before leaving draft.`, severity: 'error' });
    }
  } else {
    missing.push({ item: 'Nozzle schedule', reason: 'No nozzle rows exist in the frozen mechanical snapshot — enter the nozzle schedule in Stage 9 and re-run the mechanical calculation.', severity: 'error' });
  }

  // ── Validation checklist + future analyses ────────────────────────────────
  const checklist: Record<string, { pass?: boolean; evidence?: string }> = mech.validationChecklist ?? {};
  const checklistEntries = Object.entries(checklist);
  if (checklistEntries.length) {
    sections.push({
      title: 'Engine Validation Checklist (verbatim)',
      table: [['Check', 'Result', 'Evidence (verbatim)'], ...checklistEntries.map(([name, c]) => [name, c?.pass === true ? 'PASS' : c?.pass === false ? 'FAIL' : '—', s(c?.evidence)])],
    });
    const failed = checklistEntries.filter(([, c]) => c?.pass === false);
    if (failed.length) {
      missing.push({ item: 'Engine validation checklist', reason: `Failed check(s) in the frozen mechanical run: ${failed.map(([n, c]) => `${n} (${s(c?.evidence)})`).join('; ')}. A fabrication datasheet cannot leave draft with failed engine checks — resolve the Stage 9 inputs and re-run.`, severity: 'error' });
    }
  } else {
    missing.push({ item: 'Engine validation checklist', reason: 'The frozen mechanical snapshot carries no validation checklist — re-run the Stage 9 mechanical calculation on the current engine version.', severity: 'error' });
  }
  const futureParas: string[] = [];
  if (mech.applicabilityStatement) futureParas.push(`Applicability (verbatim): ${mech.applicabilityStatement}`);
  for (const l of mech.limitations ?? []) futureParas.push(`Limitation (verbatim): ${l}`);
  if (mech.futureAnalyses) futureParas.push(`Analyses NOT performed in this screening design (engine declaration, verbatim): ${JSON.stringify(mech.futureAnalyses)}`);
  if (futureParas.length) sections.push({ title: 'Applicability, Limitations & Outstanding Analyses', paragraphs: futureParas });

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'MDS',
    docTypeTitle: 'Mechanical Datasheet',
    docNumber: `${rev.design_number}-MDS`,
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
      note: `Renders the persisted mechanical_vessel result snapshot (computed ${res.computed_at ? new Date(res.computed_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}). Source equipment engine: ${s(mech.engineVersions?.sourceEngine)}.`,
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
