/**
 * ECP Calculation Report (ECPR — C4 packed column) and ECR Calculation Report
 * (ECRR — C5 agitated column) — payload builders.
 *
 * Both reports render ONLY the persisted frozen result snapshots (sections
 * 'ecp' / 'ecr') of the latest accepted calculation runs — engines are never
 * re-run and no value is recomputed in the report layer. Every rich item is
 * rendered with its stored formula/source string VERBATIM (exact-citation
 * rule). Items whose status is Not Calculable or whose vendor/laboratory basis
 * is missing are listed explicitly, including the independent-verifiability
 * statement required for engineering review.
 *
 * The side-by-side technology comparison is DERIVED MECHANICALLY in the report
 * layer from the two frozen snapshots (the persisted 'comparison' section is
 * empty for this revision); it is labelled as report-layer derivation, not an
 * engine result.
 */
import { pool } from '../db';
import type { ReportPayload, ReportRow, ReportSection } from './report-framework';

const f2 = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '');
const f3 = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : '');

/** Format a rich engine item's numeric result, or its explicit status when null. */
const rv = (item: any, digits = 3): string => {
  if (!item) return '—';
  if (item.result == null) return item.status ?? 'Not Calculable';
  if (typeof item.result === 'number') return Number.isFinite(item.result) ? item.result.toFixed(digits) : 'Not Calculable';
  return String(item.result);
};

/** Row from a rich item — source string verbatim, status as source type. */
const rrow = (label: string, item: any, digits = 3): ReportRow => ({
  label: `${label}${item?.formulaReference ? ` [${item.formulaReference}]` : ''}`,
  value: rv(item, digits),
  unit: item?.units ?? '',
  sourceType: item?.status ?? '',
  sourceRef: item?.source ?? '',
});

/** Walk a frozen snapshot and index every distinct formulaReference → source string (verbatim). */
function collectEquationIndex(data: any): string[][] {
  const hits = new Map<string, Set<string>>();
  const walk = (o: any, path: string) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach((x, i) => walk(x, path)); return; }
    if (typeof o.formulaReference === 'string' && typeof o.source === 'string') {
      if (!hits.has(o.formulaReference)) hits.set(o.formulaReference, new Set());
      hits.get(o.formulaReference)!.add(o.source);
    }
    for (const k of Object.keys(o)) walk(o[k], path ? `${path}.${k}` : k);
  };
  walk(data, '');
  const SHOWN = 6;
  const refs = Array.from(hits.keys()).sort();
  const rows = refs.map(ref => {
    const all = Array.from(hits.get(ref)!);
    const shown = all.slice(0, SHOWN);
    const omitted = all.length - shown.length;
    return [ref, shown.join('\n') + (omitted > 0 ? `\n… ${omitted} further distinct usage string(s) omitted for legibility (they differ only in per-diameter numeric values) — the COMPLETE verbatim set is in the frozen JSON snapshot export accompanying this report.` : '')];
  });
  return [['Equation Ref', 'Formula / basis strings as stored in the frozen snapshot (verbatim; one line per distinct usage)'], ...rows];
}

/** Collect every warning string stored anywhere in the snapshot. */
function collectWarnings(data: any): string[] {
  const out = new Set<string>();
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (Array.isArray(o.warnings)) for (const w of o.warnings) if (typeof w === 'string') out.add(w);
    for (const k of Object.keys(o)) walk(o[k]);
  };
  walk(data);
  return Array.from(out);
}

/** Collect Not Calculable items with their stored explanation (verbatim). */
function collectNotCalculable(data: any): Array<{ where: string; source: string; validation: string; ref: string }> {
  const seen = new Map<string, { where: string; source: string; validation: string; ref: string }>();
  const walk = (o: any, path: string) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach((x) => walk(x, path)); return; }
    if (o.status === 'Not Calculable') {
      const key = `${o.source ?? ''}|${o.validation ?? o.reason ?? ''}`;
      if (!seen.has(key)) seen.set(key, { where: path, source: o.source ?? '—', validation: o.validation ?? o.reason ?? '—', ref: o.formulaReference ?? '' });
    }
    for (const k of Object.keys(o)) walk(o[k], path ? `${path}.${k}` : k);
  };
  walk(data, '');
  return Array.from(seen.values());
}

async function loadCommon(revisionId: number, section: 'ecp' | 'ecr') {
  const revQ = await pool.query(
    `SELECT r.*, d.design_number, d.title, d.design_type
       FROM design_software_revisions r JOIN design_software_designs d ON d.id = r.design_id
      WHERE r.id = $1`, [revisionId]);
  if (!revQ.rows.length) throw new Error('Revision not found');
  const rev = revQ.rows[0];
  const resQ = await pool.query(`SELECT data, engine_version, computed_at FROM design_software_results WHERE revision_id = $1 AND section = $2`, [revisionId, section]);
  if (!resQ.rows.length) throw Object.assign(new Error(`No persisted ${section.toUpperCase()} result snapshot for this revision — run the calculation first. The report never re-runs engines.`), { statusCode: 422 });
  // Bind run provenance to the frozen snapshot: pick the run whose timestamp
  // matches the snapshot's computed_at (±60 s). If no run matches, the report
  // fails closed on run identity (runId null) rather than citing a wrong run.
  const runQ = await pool.query(
    `SELECT id, engine_name, engine_version, calculation_status, calculated_at
       FROM design_software_calculation_runs
      WHERE revision_id = $1 AND calculation_type = $2
        AND abs(extract(epoch FROM (calculated_at - $3::timestamptz))) <= 60
      ORDER BY abs(extract(epoch FROM (calculated_at - $3::timestamptz))) LIMIT 1`,
    [revisionId, section, resQ.rows[0].computed_at]);
  if (!runQ.rows.length) {
    throw Object.assign(new Error(`No calculation run matches the persisted ${section.toUpperCase()} snapshot timestamp — run/snapshot provenance cannot be established; refusing to cite an unrelated run.`), { statusCode: 422 });
  }
  const diQ = await pool.query(`SELECT data FROM design_software_inputs WHERE revision_id = $1 AND section = 'design_identity'`, [revisionId]);
  const di: Record<string, string> = diQ.rows.reduce((a: any, r: any) => ({ ...a, ...r.data }), {});
  // The OTHER technology snapshot, for the mechanically derived comparison
  const otherSection = section === 'ecp' ? 'ecr' : 'ecp';
  const otherQ = await pool.query(`SELECT data FROM design_software_results WHERE revision_id = $1 AND section = $2`, [revisionId, otherSection]);
  return { rev, res: resQ.rows[0], run: runQ.rows[0], di, other: otherQ.rows[0]?.data ?? null };
}

/** Side-by-side ECP vs ECR comparison — derived in the report layer from the two frozen snapshots. */
function comparisonSection(ecp: any, ecr: any): ReportSection {
  if (!ecp || !ecr) {
    return { title: 'Technology Comparison — ECP vs ECR', paragraphs: ['The other technology snapshot is not persisted for this revision — no comparison is rendered.'] };
  }
  const hbP = ecp.heightBreakdown ?? {}; const hbR = ecr.heightBreakdown ?? {};
  const rows: string[][] = [
    ['Item', 'ECP (Packed Column, C4)', 'ECR (Agitated Column, C5)'],
    ['Theoretical stages (from C2)', String(ecp.designBasis?.theoreticalStages ?? '—'), String(ecr.designBasis?.theoreticalStages ?? '—')],
    ['Stage device', `HETS ${ecp.designBasis?.hets?.value ?? '—'} ${ecp.designBasis?.hets?.unit ?? ''} (${ecp.designBasis?.hets?.sourceType ?? ''})`, `${rv(ecr.compartments, 0)} compartments × ${ecr.designBasis?.compartmentHeight?.value ?? '—'} ${ecr.designBasis?.compartmentHeight?.unit ?? ''} (efficiency ${ecr.designBasis?.compartmentEfficiency?.value ?? '—'}, ${ecr.designBasis?.compartmentEfficiency?.sourceType ?? ''})`],
    ['Active height', `${rv(ecp.packingHeight, 2)} m packed (${ecp.packingHeight?.status ?? ''})`, `${rv(hbR.activeAgitatedHeight, 2)} m agitated (${hbR.activeAgitatedHeight?.status ?? ''})`],
    ['Total tangent-to-tangent', `${rv(hbP.totalTangentToTangent, 2)} m`, `${rv(hbR.totalTangentToTangent, 2)} m`],
    ['Overall vessel height', `${rv(hbP.overallVesselHeight, 2)} m`, `${rv(hbR.overallVesselHeight, 2)} m`],
    ['Internals basis', `Packing record: ${ecp.designBasis?.packing?.record?.productName ?? '—'} (${ecp.designBasis?.packing?.record?.revision ?? ''}) — Assumed screening data, not vendor-certified`, `Rotor: ${ecr.designBasis?.rotor?.rotorType ?? '—'}; D_R/D ratio ${ecr.designBasis?.rotor?.ratio?.value ?? '—'} (${ecr.designBasis?.rotor?.ratio?.sourceType ?? ''})`],
    ['Mechanical drive', 'None (static internals)', 'Agitated — motor design power is diameter- and speed-dependent (see ECR power tables); screening only, not a motor selection'],
    ['Hydraulic utilization screening', 'Not screenable — no Vendor Packing Capacity data in the packing record', 'Not screenable — no ECR-specific Vendor Hydraulic Capacity data'],
    ['Pressure drop', 'Not Calculable — no wet pressure-drop basis in the packing record', 'Not emitted by the C5 screening scope'],
    ['Run status', String(ecp.calculationRunStatus ?? '—'), String(ecr.calculationRunStatus ?? '—')],
  ];
  return {
    title: 'Technology Comparison — ECP vs ECR (Report-Layer Derivation)',
    intro: 'This side-by-side table is derived MECHANICALLY in the report layer from the two frozen C4/C5 snapshots of the same design revision. It is not an engine result and it expresses no technology preference — both technologies remain Pending Validation and neither utilization band can be screened without vendor capacity data.',
    table: rows,
  };
}

/** Engineering Decision Record — renders the latest (non-superseded) DS-SEL
 *  autonomous selection record verbatim. Read-only: the report never re-runs
 *  the selector and never recomputes any figure. */
async function decisionRecordSection(revisionId: number): Promise<ReportSection> {
  const q = await pool.query(
    `SELECT r.*, u.username AS created_by_name, du.username AS decision_by_name
       FROM design_selection_records r
       LEFT JOIN users u ON u.id = r.created_by
       LEFT JOIN users du ON du.id = r.decision_by
      WHERE r.revision_id = $1 AND r.is_superseded = FALSE
      ORDER BY r.created_at DESC LIMIT 1`, [revisionId]);
  if (!q.rows.length) {
    return { title: 'Engineering Decision Record (DS-SEL Autonomous Design Selection)', paragraphs: ['No design selection record exists for this revision — the autonomous selector runs after each accepted equipment calculation. No record is invented.'] };
  }
  const row = q.rows[0];
  const rec = row.record ?? {};
  const f4 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(4) : '—');
  const f2n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—');
  const term = rec.terminology ?? {
    utilizationLabel: 'Utilization against preliminary capacity-screening basis',
    marginLabel: 'Preliminary hydraulic loading margin',
    basisLabel: 'Thermopac preliminary SMVP throughput threshold',
    trueFloodingStatement: 'True flooding utilization and true flooding margin: Not Calculable — they remain Not Calculable until approved vendor, pilot or RRBO/NMP experimental flooding data are entered.',
  };
  const rows: ReportRow[] = [
    { label: 'Selected technology', value: rec.selectedTechnology ? String(rec.selectedTechnology).toUpperCase() : (rec.selectionStatus === 'engineering_review_required' ? 'NONE — engineering review required' : 'NONE — not recommendable'), sourceType: `Record #${row.id}`, sourceRef: rec.governanceState ?? '' },
    { label: 'Selected preliminary diameter', value: rec.selectedDiameter_mm != null ? String(rec.selectedDiameter_mm) : '—', unit: 'mm', sourceType: 'DS-SEL-003' },
    { label: 'Calculated minimum diameter', value: rec.calculatedMinimumDiameter_mm != null ? String(rec.calculatedMinimumDiameter_mm) : '—', unit: 'mm', sourceType: 'DS-SEL-001' },
    { label: 'Practical rounding rule', value: '—', sourceType: 'DS-SEL-002', sourceRef: rec.roundingRule ?? '' },
    { label: 'Normal loading at selected diameter', value: f2n(rec.normalLoading), unit: 'm³/(m²·h)', sourceType: 'Frozen sweep (verbatim)' },
    { label: 'Maximum loading at selected diameter', value: f2n(rec.maximumLoading), unit: 'm³/(m²·h)', sourceType: 'Frozen sweep (verbatim)' },
    { label: `${term.utilizationLabel} (maximum case governs)`, value: f4(rec.floodingUtilization), unit: '-', sourceType: 'DS-SEL-003', sourceRef: rec.capacityBasis ? `Basis: ${rec.capacityBasis.value} ${rec.capacityBasis.unit} — ${rec.capacityBasis.tier}` : '' },
    { label: term.marginLabel, value: `${f4(rec.floodingMarginFraction)} (${f2n(rec.floodingMarginAbsolute)} m³/(m²·h) absolute)`, sourceType: 'DS-SEL-005 step 2' },
    ...(term.trueFloodingStatement ? [{ label: 'True flooding utilization / true flooding margin', value: 'Not Calculable', sourceType: 'Governance', sourceRef: term.trueFloodingStatement } as ReportRow] : []),
    { label: 'Confidence level', value: String(rec.confidenceLevel ?? row.confidence_level ?? '—'), sourceType: 'Data maturity only — never a selection criterion' },
    { label: 'Engineer decision', value: String(row.decision ?? 'pending'), sourceType: row.decision_engineer ? `Engineer: ${row.decision_engineer}` : '', sourceRef: row.decision_reason ?? '' },
  ];
  if (row.decision === 'overridden') {
    rows.push({ label: 'Engineer Override — retained autonomous values', value: `Autonomous: ${rec.selectedTechnology ? String(rec.selectedTechnology).toUpperCase() : '—'} @ ${rec.selectedDiameter_mm ?? '—'} mm → Override: ${(row.override_technology ?? rec.selectedTechnology ?? '—').toUpperCase?.() ?? row.override_technology} @ ${row.override_diameter_mm ?? rec.selectedDiameter_mm ?? '—'} mm`, sourceType: 'Override', sourceRef: row.decision_reason ?? '' });
  }
  const cascadeTable: string[][] = [
    ['Step', 'Criterion', 'Evaluation', 'Outcome'],
    ...(rec.cascade ?? []).map((s: any) => [String(s.step), s.criterion, s.evaluation, s.outcome]),
  ];
  const paragraphs = [
    `Reason for the recommendation (assembled from the cascade evaluation, verbatim): ${rec.reason ?? '—'}`,
    `Governing assumptions in the selection path: ${(rec.governingAssumptions ?? []).map((a: any, i: number) => `(${i + 1}) ${a.item}: ${a.value} — ${a.source}`).join(' ') || 'none recorded'}.`,
    `Confidence basis: ${(rec.confidenceBasis ?? []).join(' ')}`,
    `Provenance: ${(rec.provenance?.runs ?? []).map((r: any) => `${String(r.technology).toUpperCase()} run #${r.runId} (${r.engine} v${r.engineVersion}, status '${r.status}')`).join('; ') || '—'}. ${rec.provenance?.note ?? ''} Record generated ${rec.generatedAt ?? '—'} by ${row.created_by_name ?? '—'}; selector ${rec.engine?.id ?? 'llx-design-selection'} v${rec.engine?.version ?? '—'} (rules DS-SEL-001…005).`,
  ];
  return {
    title: 'Engineering Decision Record (DS-SEL Autonomous Design Selection)',
    intro: 'Autonomous deterministic design selection — the software acts as the Process Design Engineer. All loadings are read verbatim from the frozen calculation run snapshots; the selector never recomputes engine results. CAPEX/OPEX are excluded by direction; confidence level is data-maturity information only and is never a tie-breaker.',
    rows, table: cascadeTable.length > 1 ? cascadeTable : undefined, paragraphs,
  };
}

function verifiabilitySection(data: any, tech: string): ReportSection {
  const nc = collectNotCalculable(data);
  const rows: string[][] = [['Equation Ref', 'Item (stored basis string)', 'Why it cannot be independently verified from this report (stored explanation, verbatim)'],
    ...nc.map(n => [n.ref || '—', n.source, n.validation])];
  return {
    title: 'Independent-Verifiability Statement',
    paragraphs: [
      `Items in the table below are NOT independently verifiable from this report: the engine declared them Not Calculable because the governing vendor/laboratory datum is absent, and no value was invented. A checker cannot reproduce a number that was never computed — closure of these items requires the named data, not re-calculation.`,
      `In addition, every ${tech} result carrying status 'Pending Validation' is ARITHMETICALLY verifiable from the inputs and formula strings in this report, but NOT engineering-verifiable: its basis contains Assumed data (see the Assumptions Register). Hand-checking confirms the arithmetic only; it does not validate the assumed values.`,
    ],
    table: rows.length > 1 ? rows : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ECP — Packed Column Calculation Report (C4)
// ─────────────────────────────────────────────────────────────────────────────
export async function buildEcpCalculationPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
  const { rev, res, run, di, other } = await loadCommon(revisionId, 'ecp');
  const ecp = res.data ?? {};
  const db = ecp.designBasis ?? {};
  const rec = db.packing?.record ?? {};
  const hb = ecp.heightBreakdown ?? {};

  const assumptions: ReportPayload['assumptions'] = (ecp.assumptions ?? []).map((a: any) => ({
    item: a.assumption, value: '—', sourceRef: a.consequence ?? '', status: 'Assumed — Pending Validation',
  }));
  const pushRich = (label: string, it: any) => {
    if (it?.sourceType === 'Assumed') assumptions.push({ item: label, value: `${it.value} ${it.unit ?? ''}`.trim(), sourceRef: it.sourceReference ?? '', status: 'Assumed — Pending Validation' });
  };
  pushRich('HETS', db.hets);
  pushRich('Packing size', rec.size); pushRich('Packing void fraction', rec.voidFraction); pushRich('Packing specific surface area', rec.specificSurfaceArea);

  const missing: ReportPayload['missingData'] = [
    { item: 'Vendor Packing Capacity', reason: 'No Vendor Packing Capacity data in the packing record — hydraulic utilization cannot be screened; the C3 generic percentage is not a substitute (ECP-002).', severity: 'warning' },
    { item: 'Vendor wet pressure-drop basis', reason: 'No wet pressure-drop basis in the packing record — pressure drop Not Calculable at every diameter; no universal Pa/m value is invented (ECP-007).', severity: 'warning' },
    { item: 'Vendor minimum wetting rate', reason: 'Not in the packing record — minimum-wetting check Not Calculable; never assumed (ECP-003).', severity: 'warning' },
    { item: 'Vendor recommended loading range', reason: 'Not in the packing record — recommended-loading check Not Calculable (ECP-003).', severity: 'warning' },
    { item: 'Distributor specification', reason: 'No distributor specification supplied — distributor checks run only when vendor distributor data exist (ECP-004).', severity: 'warning' },
    { item: 'Vendor-certified packing record', reason: `Packing record '${rec.id ?? '—'}' is a preliminary screening record with Assumed characteristics — replace with a vendor-certified record before any rating use.`, severity: 'warning' },
    { item: 'HETS confirmation', reason: 'HETS is Assumed (system data: solvent + feed + packing + temperature) — vendor/test confirmation required before the packed height is engineering-verified (ECP-005).', severity: 'warning' },
    { item: 'System derating factor', reason: 'Not supplied — 1.0 applied with NO_SYSTEM_DERATING_DATA warning; never invented.', severity: 'warning' },
  ];
  if (String(ecp.calculationRunStatus ?? '').toLowerCase() === 'warning') {
    missing.push({ item: 'C4 run status', reason: 'The persisted C4 run completed with warnings — see the warnings and limitations sections.', severity: 'warning' });
  }

  const diamTable = (kase: any): string[][] => {
    const header = ['D (m)', 'Area (m²)', 'u_c NMP (m³/m²·h)', 'u_d RRBO (m³/m²·h)', 'Total load (m³/m²·h)', 'Utilization (%)', 'ΔP (Pa)', 'Min wetting', 'Rec. loading', 'Feasibility'];
    return [header, ...(kase?.diameters ?? []).map((d: any) => [
      f2(d.diameter_m), f3(d.area?.result),
      f2(d.loads?.continuous?.result), f2(d.loads?.dispersed?.result), f2(d.loads?.total?.result),
      rv(d.ecpHydraulicUtilization, 1), rv(d.pressureDrop, 1), rv(d.minimumWettingStatus), rv(d.recommendedLoadingStatus),
      String(d.feasibility ?? '—'),
    ])];
  };
  const flowsRows = (kase: any): ReportRow[] => [
    { label: 'NMP (continuous) mass flow', value: f2(kase?.flows?.nmpMassFlow_kg_h), unit: 'kg/h', sourceType: 'From C2 frozen flows' },
    { label: 'RRBO (dispersed) mass flow', value: f2(kase?.flows?.rrboMassFlow_kg_h), unit: 'kg/h', sourceType: 'From C2 frozen flows' },
    { label: 'NMP volumetric flow', value: f2(kase?.flows?.nmpVolumetricFlow_m3_h), unit: 'm³/h', sourceType: 'From C2 frozen flows' },
    { label: 'RRBO volumetric flow', value: f2(kase?.flows?.rrboVolumetricFlow_m3_h), unit: 'm³/h', sourceType: 'From C2 frozen flows' },
    { label: 'Utilization screening band', value: `${kase?.utilizationBandPercent?.min ?? '—'} – ${kase?.utilizationBandPercent?.max ?? '—'}`, unit: '%', sourceType: 'Configurable criterion', sourceRef: kase?.utilizationBandPercent?.note ?? '' },
  ];

  const sections: ReportSection[] = [
    { title: 'Introduction, Design Basis & Run Identification', paragraphs: [
      `This ECP Calculation Report presents the Stage C4 packed-column screening for design ${rev.design_number}${rev.title ? `, ${rev.title}` : ''}, rendered from the frozen 'ecp' result snapshot of Design Revision Rev ${rev.revision_number}. Calculation run: #${run?.id ?? '—'} (engine ${run?.engine_name ?? 'llx-ecp'} v${res.engine_version ?? run?.engine_version ?? '—'}, status '${run?.calculation_status ?? '—'}', calculated ${run?.calculated_at ? new Date(run.calculated_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}). The engine was NOT re-run for this report.`,
      `Engine chain versions (verbatim from snapshot): ${Object.entries(ecp.engineVersions ?? {}).map(([k, v]) => `${k} v${v}`).join(', ') || '—'}. The governing design basis is stated in ${rev.design_number}-DBR; process flows derive from ${rev.design_number}-PDR; generic hydraulics from ${rev.design_number}-HDR (same revision).`,
      `Engine applicability statement (verbatim): "${ecp.applicabilityStatement ?? '—'}".`,
    ]},
    { title: 'Design Basis Inputs', rows: [
      { label: 'Operating temperature', value: String(db.operatingTemperatureC ?? ''), unit: '°C', sourceType: 'Design basis' },
      { label: 'Phase configuration', value: String(db.phaseConfiguration?.input ?? ''), sourceType: 'Engineer Entry', sourceRef: db.phaseConfiguration?.note ?? '' },
      { label: 'Dispersed / continuous phase', value: `${db.phaseConfiguration?.dispersedPhase ?? '—'} / ${db.phaseConfiguration?.continuousPhase ?? '—'}`, sourceType: 'Engineer Entry' },
      { label: 'Theoretical stages (from C2)', value: String(db.theoreticalStages ?? ''), sourceType: 'C2 frozen result' },
      { label: 'Height basis', value: String(db.heightBasis ?? ''), sourceType: 'Engine configuration' },
      { label: 'HETS', value: String(db.hets?.value ?? ''), unit: db.hets?.unit ?? 'm', sourceType: db.hets?.sourceType ?? '', sourceRef: `${db.hets?.sourceReference ?? ''} — ${db.hets?.note ?? ''}` },
      { label: 'System derating factor', value: String(db.systemDeratingFactor?.value ?? ''), sourceType: 'Not supplied — default 1.0', sourceRef: db.systemDeratingFactor?.note ?? '' },
      { label: 'RRBO density used', value: String(db.feedFluid?.densityUsed?.value ?? ''), unit: db.feedFluid?.densityUsed?.unit ?? '', sourceType: 'Entered/EPD', sourceRef: db.feedFluid?.densityUsed?.source ?? '' },
      { label: 'NMP density used', value: String(db.solventFluid?.densityUsed?.value ?? ''), unit: db.solventFluid?.densityUsed?.unit ?? '', sourceType: 'Entered/EPD', sourceRef: db.solventFluid?.densityUsed?.source ?? '' },
      { label: 'Utilization screening band', value: `${db.utilizationBandPercent?.min ?? '—'} – ${db.utilizationBandPercent?.max ?? '—'}`, unit: '%', sourceType: 'Configurable criterion', sourceRef: db.utilizationBandPercent?.note ?? '' },
    ]},
    { title: 'Packing Data (Consumed Record — Verbatim)', intro: `${db.packing?.consumedFrom ?? ''}. ${db.packing?.note ?? ''}`, rows: [
      { label: 'Record ID / revision', value: `${rec.id ?? '—'} / ${rec.revision ?? '—'}`, sourceType: 'Packing Database' },
      { label: 'Product', value: `${rec.productName ?? '—'} (${rec.productFamily ?? '—'})`, sourceType: 'Packing Database', sourceRef: rec.manufacturer ?? '' },
      { label: 'Type / geometry class / material', value: `${rec.packingType ?? '—'} / ${rec.geometryClass ?? '—'} / ${rec.material ?? '—'}`, sourceType: 'Packing Database' },
      { label: 'Nominal size', value: String(rec.size?.value ?? ''), unit: rec.size?.unit ?? '', sourceType: rec.size?.sourceType ?? '', sourceRef: rec.size?.sourceReference ?? '' },
      { label: 'Void fraction', value: String(rec.voidFraction?.value ?? ''), unit: '-', sourceType: rec.voidFraction?.sourceType ?? '', sourceRef: rec.voidFraction?.sourceReference ?? '' },
      { label: 'Specific surface area', value: String(rec.specificSurfaceArea?.value ?? ''), unit: rec.specificSurfaceArea?.unit ?? '', sourceType: rec.specificSurfaceArea?.sourceType ?? '', sourceRef: rec.specificSurfaceArea?.sourceReference ?? '' },
      { label: 'Record source', value: '—', sourceType: 'Controlled literature', sourceRef: rec.source ?? '' },
      { label: 'Vendor notes', value: '—', sourceType: 'Packing Database', sourceRef: rec.vendorNotes ?? '' },
    ]},
    { title: 'Equation Reference Index (From Frozen Snapshot)', intro: 'Every formula/basis string stored in the frozen snapshot, grouped by equation reference and reproduced verbatim. The controlled statements live in the C4 section of the Correlation & Equation Register; software-verification status is tracked in the V&V equation register (all ECP entries currently Partially Verified).', table: collectEquationIndex(ecp) },
    { title: 'HETS & Packing Height', rows: [rrow('Packed height (N × HETS)', ecp.packingHeight, 2)], paragraphs: [
      `HETS provenance (verbatim): value ${db.hets?.value ?? '—'} ${db.hets?.unit ?? ''}, source type ${db.hets?.sourceType ?? '—'}, reference "${db.hets?.sourceReference ?? '—'}"; system: ${db.hets?.feed ?? '—'} / ${db.hets?.solvent ?? '—'} on ${db.hets?.packing ?? '—'} at ${db.hets?.operatingTemperatureC ?? '—'} °C. Note (verbatim): ${db.hets?.note ?? '—'}.`,
    ]},
    { title: 'Bed Arrangement', intro: `Basis (verbatim): ${ecp.bedArrangement?.basis ?? '—'} [${ecp.bedArrangement?.formulaReference ?? ''}]`, table: [
      ['Bed', 'Height (m)'],
      ...(ecp.bedArrangement?.beds ?? []).map((b: any) => [String(b.bed), f2(b.height_m)]),
      ['Redistributors', ecp.bedArrangement?.redistributors != null ? String(ecp.bedArrangement.redistributors) : 'NOT STORED IN SNAPSHOT'],
    ]},
    { title: 'Case Flows — Normal', rows: flowsRows(ecp.normalCase) },
    { title: 'Hydraulic Loading & Capacity Screening — Normal Case', intro: 'Per-diameter hydraulic loading (ECP-001), utilization vs Vendor Packing Capacity (ECP-002 — not screenable for this record), vendor checks (ECP-003) and wet pressure drop (ECP-007). "Not Calculable" cells reproduce the engine finding — no value was invented.', table: diamTable(ecp.normalCase) },
    { title: 'Case Flows — Maximum Continuous', rows: flowsRows(ecp.maximumCase) },
    { title: 'Hydraulic Loading & Capacity Screening — Maximum Continuous Case', table: diamTable(ecp.maximumCase) },
    { title: 'Capacity / Flooding & Pressure-Drop Architecture', paragraphs: [
      `Capacity/flooding screening: hydraulic utilization is defined against Vendor Packing Capacity (ECP-002). The consumed packing record carries no Vendor Packing Capacity data, therefore utilization is Pending Validation at every diameter and the ${db.utilizationBandPercent?.min ?? '—'}–${db.utilizationBandPercent?.max ?? '—'} % screening band could not be applied. The C3 generic throughput percentage is not a substitute (engine statement, verbatim).`,
      `Pressure-drop architecture (verbatim): ${ecp.pressureDropArchitecture?.note ?? '—'} (wetApplied=${String(ecp.pressureDropArchitecture?.wetApplied)}, dryReserved=${String(ecp.pressureDropArchitecture?.dryReserved)}).`,
      `Rate-based placeholders (verbatim): ${ecp.rateBasedPlaceholders?.note ?? '—'} (HTU/NTU/ka/interfacial area all null — reserved, not calculated).`,
    ]},
    { title: 'Height Breakdown — Disengagement, T/T & Overall', intro: 'Internals stack from the frozen snapshot (ECP-008). Disengagement allowances are the Top/Bottom Disengagement lines.', rows: [
      ...(hb.lines ?? []).map((l: any) => rrow(l.label, l, 2)),
      rrow('Total tangent-to-tangent (T/T)', hb.totalTangentToTangent, 2),
      rrow('Overall vessel height', hb.overallVesselHeight, 2),
    ]},
    comparisonSection(ecp, other),
    await decisionRecordSection(revisionId),
    { title: 'Engine Warnings (Verbatim)', paragraphs: (() => { const w = collectWarnings(ecp); return w.length ? w.map((x, i) => `${i + 1}. ${x}`) : [`No warning strings stored on individual items. Run status: ${ecp.calculationRunStatus ?? '—'} — see Validation & Missing-Data Summary.`]; })() },
    { title: 'Limitations (Verbatim)', paragraphs: (ecp.limitations ?? []).map((l: string, i: number) => `${i + 1}. ${l}`) },
    verifiabilitySection(ecp, 'ECP'),
  ];

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'ECPR', docTypeTitle: 'ECP Calculation Report (Packed Column — Stage C4)',
    docNumber: `${rev.design_number}-ECPR`, reportRev: `Rev ${rev.revision_number}`,
    designNumber: rev.design_number, designTitle: rev.title ?? '',
    designType: rev.design_type === 'rnd' ? 'R&D / Independent Design' : 'Project Design',
    module: 'Liquid-Liquid Extraction', revisionLabel: `Rev ${rev.revision_number}`, revisionLifecycle: lifecycle,
    client: di.client, plantLocation: di.plant_location,
    preparedBy: di.prepared_by, checkedBy: di.checked_by, approvedBy: di.approved_by,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC', generatedByName,
    traceability: {
      revisionId,
      runs: [{ engine: run?.engine_name ?? 'llx-ecp', version: String(res.engine_version ?? '—'), runId: run?.id ?? null, ranAt: run?.calculated_at ? new Date(run.calculated_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : undefined }],
      note: `Renders the persisted 'ecp' result snapshot (computed ${res.computed_at ? new Date(res.computed_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}). Applicability: ${ecp.applicabilityStatement ?? '—'}`,
    },
    sections, assumptions, missingData: missing,
    references: [rec.source, db.packing?.consumedFrom].filter(Boolean),
    revisionHistory: [],
    watermark: ['approved', 'issued'].includes(lifecycle) ? undefined : 'PRELIMINARY — NOT FOR CONSTRUCTION',
  };
  return { payload, blocking: missing.filter(m => m.severity === 'error').length };
}

// ─────────────────────────────────────────────────────────────────────────────
// ECR — Agitated Column Calculation Report (C5)
// ─────────────────────────────────────────────────────────────────────────────
export async function buildEcrCalculationPayload(revisionId: number, generatedByName: string): Promise<{ payload: ReportPayload; blocking: number }> {
  const { rev, res, run, di, other } = await loadCommon(revisionId, 'ecr');
  const ecr = res.data ?? {};
  const db = ecr.designBasis ?? {};
  const hb = ecr.heightBreakdown ?? {};

  const assumptions: ReportPayload['assumptions'] = (ecr.assumptions ?? []).map((a: any) => ({
    item: a.assumption, value: '—', sourceRef: a.consequence ?? '', status: 'Assumed — Pending Validation',
  }));
  const pushRich = (label: string, it: any) => {
    if (it?.sourceType === 'Assumed') assumptions.push({ item: label, value: `${it.value} ${it.unit ?? ''}`.trim(), sourceRef: it.sourceReference ?? '', status: 'Assumed — Pending Validation' });
  };
  pushRich('Rotor-to-column diameter ratio', db.rotor?.ratio);
  pushRich('Compartment height', db.compartmentHeight);
  pushRich('Compartment efficiency', db.compartmentEfficiency);
  pushRich('Interfacial tension', db.interfacialTension);

  const missing: ReportPayload['missingData'] = [
    { item: 'ECR-specific Vendor Hydraulic Capacity', reason: 'Not supplied — hydraulic utilization cannot be screened at any diameter; the C3 generic percentage is not a substitute (ECR-002).', severity: 'warning' },
    { item: 'Tip-speed criteria (preferred range / vendor limit)', reason: 'Neither supplied — tip-speed classification Not Calculable; never assumed (ECR-009).', severity: 'warning' },
    { item: 'Stator geometry (open-area fraction, velocity limits)', reason: 'Not supplied — stator free-area velocity and stator-velocity-limit check Not Calculable (ECR-003).', severity: 'warning' },
    { item: 'Maximum allowable shaft power', reason: 'Not supplied — shaft-power check Not Calculable (ECR-009).', severity: 'warning' },
    { item: 'Maximum unsupported shaft length', reason: 'Not supplied — shaft-support check Not Calculable (ECR-009).', severity: 'warning' },
    { item: 'Vendor/mechanical bearing data', reason: 'Bearing/support requirements are Pending Validation — no bearing design is performed (ECR-009).', severity: 'warning' },
    { item: 'Power number (laboratory/vendor)', reason: 'N_P = 1 is an Assumed screening default — agitation power scales linearly with it; vendor/laboratory confirmation required (ECR-006).', severity: 'warning' },
    { item: 'System derating factor', reason: 'Not supplied — 1.0 applied with warning; never invented.', severity: 'warning' },
  ];
  if (String(ecr.calculationRunStatus ?? '').toLowerCase() === 'warning') {
    missing.push({ item: 'C5 run status', reason: 'The persisted C5 run completed with warnings — see the warnings and limitations sections.', severity: 'warning' });
  }

  const geomTable = (kase: any): string[][] => [
    ['D (m)', 'D_R (m)', 'D_R/D (–)', 'Swept area A_R (m²)', 'Rotor type'],
    ...(kase?.diameters ?? []).map((d: any) => [
      f2(d.diameter_m), rv(d.rotor?.rotorDiameter, 3), rv(d.rotor?.rotorToColumnDiameterRatio, 2), rv(d.rotor?.sweptArea, 4), String(d.rotor?.rotorType ?? '—'),
    ])];
  const speedTable = (kase: any): string[][] => [
    ['D (m)', 'N (rpm)', 'v_tip (m/s)', 'Re (–)', 'We (–)', 'Fr (–)', 'Tip-speed class'],
    ...(kase?.diameters ?? []).map((d: any) => { const a = d.rotor?.atSpeed?.[0] ?? {}; return [
      f2(d.diameter_m), rv(a.rotorSpeed_rpm, 0), rv(a.tipSpeed, 3), rv(a.reynolds, 0), rv(a.weber, 1), rv(a.froude, 4), String(a.tipSpeedClassification?.result ?? '—'),
    ]; })];
  const powerTable = (kase: any): string[][] => [
    ['D (m)', 'P per rotor (W)', 'P total shaft (W)', 'P motor design (W)', 'Density basis'],
    ...(kase?.diameters ?? []).map((d: any) => { const p = d.rotor?.atSpeed?.[0]?.power ?? {}; return [
      f2(d.diameter_m), rv(p.perRotor, 3), rv(p.totalShaft, 3), rv(p.motorDesign, 3), String(p.densityBasis?.selected ?? '—'),
    ]; })];
  const loadTable = (kase: any): string[][] => [
    ['D (m)', 'u_c NMP (m³/m²·h)', 'u_d RRBO (m³/m²·h)', 'Total (m³/m²·h)', 'Swept-area loading (m³/m²·h)', 'Stator free-area vel.', 'Utilization (%)', 'Feasibility'],
    ...(kase?.diameters ?? []).map((d: any) => [
      f2(d.diameter_m), f2(d.loads?.continuous?.result), f2(d.loads?.dispersed?.result), f2(d.loads?.total?.result),
      rv(d.rotorSweptAreaLoading, 1), rv(d.statorFreeAreaVelocity), rv(d.ecrHydraulicUtilization, 1), String(d.feasibility ?? '—'),
    ])];
  const flowsRows = (kase: any): ReportRow[] => [
    { label: 'NMP (continuous) mass flow', value: f2(kase?.flows?.nmpMassFlow_kg_h), unit: 'kg/h', sourceType: 'From C2 frozen flows' },
    { label: 'RRBO (dispersed) mass flow', value: f2(kase?.flows?.rrboMassFlow_kg_h), unit: 'kg/h', sourceType: 'From C2 frozen flows' },
    { label: 'NMP volumetric flow', value: f2(kase?.flows?.nmpVolumetricFlow_m3_h), unit: 'm³/h', sourceType: 'From C2 frozen flows' },
    { label: 'RRBO volumetric flow', value: f2(kase?.flows?.rrboVolumetricFlow_m3_h), unit: 'm³/h', sourceType: 'From C2 frozen flows' },
  ];

  const sections: ReportSection[] = [
    { title: 'Introduction, Design Basis & Run Identification', paragraphs: [
      `This ECR Calculation Report presents the Stage C5 agitated-column screening for design ${rev.design_number}${rev.title ? `, ${rev.title}` : ''}, rendered from the frozen 'ecr' result snapshot of Design Revision Rev ${rev.revision_number}. Calculation run: #${run?.id ?? '—'} (engine ${run?.engine_name ?? 'llx-ecr'} v${res.engine_version ?? run?.engine_version ?? '—'}, status '${run?.calculation_status ?? '—'}', calculated ${run?.calculated_at ? new Date(run.calculated_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}). The engine was NOT re-run for this report.`,
      `Engine chain versions (verbatim from snapshot): ${Object.entries(ecr.engineVersions ?? {}).map(([k, v]) => `${k} v${v}`).join(', ') || '—'}. Governing basis: ${rev.design_number}-DBR; process flows: ${rev.design_number}-PDR; generic hydraulics: ${rev.design_number}-HDR (same revision).`,
      `Engine applicability statement (verbatim): "${ecr.applicabilityStatement ?? '—'}".`,
    ]},
    { title: 'Design Basis Inputs', rows: [
      { label: 'Operating temperature', value: String(db.operatingTemperatureC ?? ''), unit: '°C', sourceType: 'Design basis' },
      { label: 'Phase configuration', value: String(db.phaseConfiguration?.input ?? ''), sourceType: 'Engineer Entry', sourceRef: db.phaseConfiguration?.note ?? '' },
      { label: 'Dispersed / continuous phase', value: `${db.phaseConfiguration?.dispersedPhase ?? '—'} / ${db.phaseConfiguration?.continuousPhase ?? '—'}`, sourceType: 'Engineer Entry' },
      { label: 'Theoretical stages (from C2)', value: String(db.theoreticalStages ?? ''), sourceType: 'C2 frozen result' },
      { label: 'Rotor type', value: String(db.rotor?.rotorType ?? ''), sourceType: 'Default label', sourceRef: db.rotor?.note ?? '' },
      { label: 'Rotor-to-column diameter ratio D_R/D', value: String(db.rotor?.ratio?.value ?? ''), unit: db.rotor?.ratio?.unit ?? '-', sourceType: db.rotor?.ratio?.sourceType ?? '', sourceRef: db.rotor?.ratio?.sourceReference ?? '' },
      { label: 'Compartment height', value: String(db.compartmentHeight?.value ?? ''), unit: db.compartmentHeight?.unit ?? 'm', sourceType: db.compartmentHeight?.sourceType ?? '', sourceRef: db.compartmentHeight?.sourceReference ?? '' },
      { label: 'Compartment efficiency', value: String(db.compartmentEfficiency?.value ?? ''), unit: '-', sourceType: db.compartmentEfficiency?.sourceType ?? '', sourceRef: db.compartmentEfficiency?.sourceReference ?? '' },
      { label: 'Power-density basis', value: String(db.powerDensityBasis?.selected ?? ''), sourceType: 'Engine configuration', sourceRef: db.powerDensityBasis?.note ?? '' },
      { label: 'Interfacial tension', value: String(db.interfacialTension?.value ?? ''), unit: db.interfacialTension?.unit ?? 'N/m', sourceType: db.interfacialTension?.sourceType ?? '', sourceRef: db.interfacialTension?.sourceReference ?? '' },
      { label: 'Continuous-phase viscosity', value: String(db.continuousPhaseViscosity?.value ?? ''), unit: db.continuousPhaseViscosity?.unit ?? 'Pa.s', sourceType: 'Assumed — Pending Validation', sourceRef: db.continuousPhaseViscosity?.source ?? '' },
      { label: 'RRBO density used', value: String(db.feedFluid?.densityUsed?.value ?? ''), unit: db.feedFluid?.densityUsed?.unit ?? '', sourceType: 'Entered/EPD', sourceRef: db.feedFluid?.densityUsed?.source ?? '' },
      { label: 'NMP density used', value: String(db.solventFluid?.densityUsed?.value ?? ''), unit: db.solventFluid?.densityUsed?.unit ?? '', sourceType: 'Entered/EPD', sourceRef: db.solventFluid?.densityUsed?.source ?? '' },
      { label: 'System derating factor', value: String(db.systemDeratingFactor?.value ?? ''), sourceType: 'Not supplied — default 1.0', sourceRef: db.systemDeratingFactor?.note ?? '' },
      { label: 'Tip-speed criteria', value: db.tipSpeedCriteria?.preferredRange == null && db.tipSpeedCriteria?.vendorLimit == null ? 'Not supplied' : `${db.tipSpeedCriteria?.preferredRange ?? '—'} / ${db.tipSpeedCriteria?.vendorLimit ?? '—'}`, sourceType: 'Not supplied', sourceRef: db.tipSpeedCriteria?.note ?? '' },
      { label: 'Vendor hydraulic capacity', value: 'Not supplied', sourceType: 'Not supplied', sourceRef: db.vendorHydraulicCapacity?.note ?? '' },
      { label: 'Utilization screening band', value: `${db.utilizationBandPercent?.min ?? '—'} – ${db.utilizationBandPercent?.max ?? '—'}`, unit: '%', sourceType: 'Configurable criterion', sourceRef: db.utilizationBandPercent?.note ?? '' },
    ]},
    { title: 'Equation Reference Index (From Frozen Snapshot)', intro: 'Every formula/basis string stored in the frozen snapshot, grouped by equation reference and reproduced verbatim. Controlled statements: C5 section of the Correlation & Equation Register; software-verification status tracked in the V&V equation register (all ECR entries currently Partially Verified).', table: collectEquationIndex(ecr) },
    { title: 'Compartments & Active Height', rows: [
      rrow('Number of compartments', ecr.compartments, 0),
      rrow('Active agitated height', hb.activeAgitatedHeight, 2),
    ]},
    { title: 'Case Flows — Normal', rows: flowsRows(ecr.normalCase) },
    { title: 'Rotor Geometry — Normal Case', intro: 'D_R from D_R/D ratio (ECR-004); swept area A_R = π·D_R²/4 (ECR-003/ECR-005 basis strings stored per diameter).', table: geomTable(ecr.normalCase) },
    { title: 'Rotor Speed, Tip Speed & Dimensionless Groups — Normal Case', intro: 'Single speed point per diameter (N = 60 rpm, Assumed screening default). Re = ρ_c·N·D_R²/μ_c; We = ρ_c·N²·D_R³/σ; Fr = N²·D_R/g; v_tip = π·D_R·N (ECR-005/ECR-009). No droplet-size prediction is made from We (engine statement, verbatim).', table: speedTable(ecr.normalCase) },
    { title: 'Agitation & Motor Power — Normal Case', intro: 'P₁ = N_P·ρ_m·N³·D_R⁵ per rotor (N_P = 1 Assumed); P_shaft = P₁ × rotors; P_motor = P_shaft/η_shaft(0.9, Assumed) × margin 1.25 (Assumed) — screening only, not a motor selection (ECR-006).', table: powerTable(ecr.normalCase) },
    { title: 'Hydraulic Loading & Utilization — Normal Case', intro: '"Not Calculable" cells reproduce the engine finding — no value was invented. Utilization is not screenable without ECR-specific Vendor Hydraulic Capacity (ECR-002).', table: loadTable(ecr.normalCase) },
    { title: 'Case Flows — Maximum Continuous', rows: flowsRows(ecr.maximumCase) },
    { title: 'Rotor Speed, Tip Speed & Dimensionless Groups — Maximum Continuous Case', table: speedTable(ecr.maximumCase) },
    { title: 'Agitation & Motor Power — Maximum Continuous Case', table: powerTable(ecr.maximumCase) },
    { title: 'Hydraulic Loading & Utilization — Maximum Continuous Case', table: loadTable(ecr.maximumCase) },
    { title: 'Mechanical Screening — Shaft, Bearings & Tip Speed', intro: 'Rendered from the first-diameter entries; the stored explanation strings are identical across diameters because no vendor/mechanical data were supplied.', rows: (() => { const d0 = ecr.normalCase?.diameters?.[0] ?? {}; const a0 = d0.rotor?.atSpeed?.[0] ?? {}; return [
      rrow('Tip-speed check', a0.mechanicalScreening?.tipSpeedCheck),
      rrow('Shaft-power check', a0.mechanicalScreening?.shaftPowerCheck),
      rrow('Shaft-support check', d0.shaftSupportCheck),
      rrow('Bearing/support requirements', d0.bearingSupportRequirements),
      rrow('Stator velocity limit check', d0.statorVelocityLimitCheck),
    ]; })() },
    { title: 'Height Breakdown — Disengagement, T/T & Overall', intro: 'Internals stack from the frozen snapshot (ECR-008). Disengagement allowances are the Top/Bottom Disengagement lines; the drive/seal/bearing allowance is excluded from T/T and included in the overall height.', rows: [
      ...(hb.lines ?? []).map((l: any) => rrow(l.label, l, 2)),
      rrow('Active agitated height', hb.activeAgitatedHeight, 2),
      rrow('Total tangent-to-tangent (T/T)', hb.totalTangentToTangent, 2),
      rrow('Overall vessel height', hb.overallVesselHeight, 2),
    ]},
    comparisonSection(other, ecr),
    await decisionRecordSection(revisionId),
    { title: 'Engine Warnings (Verbatim)', paragraphs: (() => { const w = collectWarnings(ecr); return w.length ? w.map((x, i) => `${i + 1}. ${x}`) : [`No warning strings stored on individual items. Run status: ${ecr.calculationRunStatus ?? '—'} — see Validation & Missing-Data Summary.`]; })() },
    { title: 'Limitations (Verbatim)', paragraphs: (ecr.limitations ?? []).map((l: string, i: number) => `${i + 1}. ${l}`) },
    verifiabilitySection(ecr, 'ECR'),
  ];

  const lifecycle = String(rev.status ?? 'draft');
  const payload: ReportPayload = {
    docType: 'ECRR', docTypeTitle: 'ECR Calculation Report (Agitated Column — Stage C5)',
    docNumber: `${rev.design_number}-ECRR`, reportRev: `Rev ${rev.revision_number}`,
    designNumber: rev.design_number, designTitle: rev.title ?? '',
    designType: rev.design_type === 'rnd' ? 'R&D / Independent Design' : 'Project Design',
    module: 'Liquid-Liquid Extraction', revisionLabel: `Rev ${rev.revision_number}`, revisionLifecycle: lifecycle,
    client: di.client, plantLocation: di.plant_location,
    preparedBy: di.prepared_by, checkedBy: di.checked_by, approvedBy: di.approved_by,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC', generatedByName,
    traceability: {
      revisionId,
      runs: [{ engine: run?.engine_name ?? 'llx-ecr', version: String(res.engine_version ?? '—'), runId: run?.id ?? null, ranAt: run?.calculated_at ? new Date(run.calculated_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : undefined }],
      note: `Renders the persisted 'ecr' result snapshot (computed ${res.computed_at ? new Date(res.computed_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}). Applicability: ${ecr.applicabilityStatement ?? '—'}`,
    },
    sections, assumptions, missingData: missing,
    references: [],
    revisionHistory: [],
    watermark: ['approved', 'issued'].includes(lifecycle) ? undefined : 'PRELIMINARY — NOT FOR CONSTRUCTION',
  };
  return { payload, blocking: missing.filter(m => m.severity === 'error').length };
}
