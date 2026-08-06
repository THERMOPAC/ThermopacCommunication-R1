/**
 * DS-SEL — Autonomous Design Selection (deterministic engineering rules only).
 *
 * The software acts as the Process Design Engineer: it autonomously determines
 * the technology and column diameter from the FROZEN C4/C5 calculation run
 * snapshots and persists an Engineering Decision Record. No engine equation is
 * re-implemented or modified — the selector CONSUMES engine results only.
 *
 * Governed deterministic rules (registered as DS-SEL-001…005 in the V&V
 * equation register and the Correlation & Equation Register):
 *   DS-SEL-001  Calculated minimum diameter  D_min = sqrt(4·Q_max / (π·u_allow·C_basis))
 *   DS-SEL-002  Practical rounding rule — round UP to the next 50 mm increment, never down
 *   DS-SEL-003  Hydraulic feasibility — flooding utilization = L_total/C_basis ≤ u_allow,
 *               evaluated on the frozen maximum-continuous-case sweep row at the candidate
 *               diameter; selected diameter = smallest 50 mm increment that passes
 *   DS-SEL-004  Capacity-basis hierarchy — Vendor > Pilot > Thermopac preliminary screening
 *               threshold; the active tier is always named; no silent substitution
 *   DS-SEL-005  Technology cascade — (1) hydraulic feasibility, (2) direct comparison of
 *               calculated flooding margins, (3) pressure drop only when validated ΔP data
 *               exist for all remaining technologies. If technologies remain equivalent
 *               after all criteria: "Multiple technically acceptable solutions identified.
 *               Engineering review required." No preference is invented.
 *
 * Records are superseded-not-edited: every regeneration marks prior records
 * superseded and appends a new row bound to the exact run IDs consumed.
 */
import { pool } from '../db';

export const DSEL_ENGINE_ID = 'llx-design-selection';
export const DSEL_ENGINE_VERSION = '1.0.0';

const INCREMENT_MM = 50; // Approved practical diameter increment series (50 mm)
const ROUNDING_RULE_TEXT =
  'Practical rounding rule (DS-SEL-002): the calculated minimum diameter is rounded UP to the next 50 mm increment; rounding down is never permitted.';

// Thermopac preliminary screening threshold — upper bound of the Sulzer SMVP
// published screening throughput range (35–60 m³/(m²·h)); Assumed — NOT a
// validated flooding capacity for the RRBO/NMP system.
const PRELIM_THRESHOLD_DEFAULT = 60;
const PRELIM_THRESHOLD_SOURCE =
  'Upper bound of the Sulzer SMV/SMVP published screening throughput range 35–60 m³/(m²·h) (Johannes Rauber, Sulzer Chemtech Ltd., AIChE 2006) — preliminary screening threshold, NOT validated flooding capacity for the RRBO/NMP system.';
const UTILIZATION_LIMIT_DEFAULT = 0.80;
const UTILIZATION_LIMIT_SOURCE =
  'Maximum allowable flooding utilization for preliminary design — configurable screening criterion consistent with the C4/C5 utilization screening band upper bound (80 %); not a universal engineering rule.';

type Tech = 'ecp' | 'ecr';

interface CapacityBasis {
  value: number;
  unit: string;
  tier: 'Vendor Validated' | 'Pilot Validated' | 'Preliminary Screening Threshold';
  source: string;
  assumed: boolean;
}

interface TechEvaluation {
  technology: Tech;
  runId: number | null;
  runStatus: string | null;
  engineName: string | null;
  engineVersion: string | null;
  recommendable: boolean;
  notRecommendableReason: string | null;
  capacityBasis: CapacityBasis | null;
  utilizationLimit: { value: number; source: string; assumed: boolean } | null;
  maxTotalFlow_m3_h: number | null;
  normalTotalFlow_m3_h: number | null;
  calculatedMinimumDiameter_mm: number | null;
  selectedDiameter_mm: number | null;
  normalLoading: number | null;   // m³/(m²·h) at selected diameter, normal case
  maximumLoading: number | null;  // m³/(m²·h) at selected diameter, maximum case
  floodingUtilization: number | null;   // fraction, maximum case governs
  floodingMarginFraction: number | null;    // 1 − utilization
  floodingMarginAbsolute: number | null;    // basis − max loading, m³/(m²·h)
  pressureDropAtSelected: string;           // stored engine status, verbatim
  checksNotAssessable: string[];
  evaluationTable: Array<{
    diameter_mm: number;
    maxLoading: number;
    utilization: number | null;
    marginFraction: number | null;
    feasible: boolean | null;
    note: string | null;
  }>;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
};

/** Resolve the active capacity basis for a technology per DS-SEL-004 (strict hierarchy, no silent substitution). */
function resolveCapacityBasis(inputs: Record<string, any>, tech: Tech): CapacityBasis | null {
  const key = tech === 'ecp' ? 'validated_flooding_capacity' : 'ecr_validated_flooding_capacity';
  const validated = num(inputs[key]);
  if (validated !== null && validated > 0) {
    const srcType = String(inputs[`${key}_source_type`] ?? '').trim().toLowerCase();
    const tier = srcType === 'pilot' ? 'Pilot Validated' as const : 'Vendor Validated' as const;
    const ref = String(inputs[`${key}_source`] ?? '').trim();
    return {
      value: validated, unit: 'm³/(m²·h)', tier,
      source: ref || `Engineer-entered validated flooding capacity (${tier}) — source reference not supplied`,
      assumed: false,
    };
  }
  if (tech === 'ecp') {
    const threshold = num(inputs.preliminary_flooding_threshold) ?? PRELIM_THRESHOLD_DEFAULT;
    return { value: threshold, unit: 'm³/(m²·h)', tier: 'Preliminary Screening Threshold', source: PRELIM_THRESHOLD_SOURCE, assumed: true };
  }
  // ECR: the SMVP packing screening threshold applies to structured packing only —
  // it is NOT transferable to an agitated column. Without validated ECR capacity
  // data there is no capacity basis, and none is invented.
  return null;
}

function evaluateTechnology(tech: Tech, run: any | null, inputs: Record<string, any>): TechEvaluation {
  const base: TechEvaluation = {
    technology: tech, runId: null, runStatus: null, engineName: null, engineVersion: null,
    recommendable: false, notRecommendableReason: null, capacityBasis: null, utilizationLimit: null,
    maxTotalFlow_m3_h: null, normalTotalFlow_m3_h: null,
    calculatedMinimumDiameter_mm: null, selectedDiameter_mm: null,
    normalLoading: null, maximumLoading: null, floodingUtilization: null,
    floodingMarginFraction: null, floodingMarginAbsolute: null,
    pressureDropAtSelected: 'Not Calculable — no validated pressure-drop basis',
    checksNotAssessable: [], evaluationTable: [],
  };
  if (!run) {
    base.notRecommendableReason = `No accepted ${tech.toUpperCase()} calculation run exists for this revision — the technology cannot be assessed.`;
    return base;
  }
  base.runId = run.id;
  base.runStatus = run.calculation_status;
  base.engineName = run.engine_name;
  base.engineVersion = run.engine_version;
  if (!['success', 'warning'].includes(String(run.calculation_status))) {
    base.notRecommendableReason = `Latest ${tech.toUpperCase()} calculation run #${run.id} has status '${run.calculation_status}' — hydraulic feasibility cannot be established from a failed run.`;
    return base;
  }

  const snap = run.result_snapshot ?? {};
  const maxCase = snap.maximumCase ?? {};
  const normalCase = snap.normalCase ?? {};
  // Sort ascending by diameter regardless of stored sweep order — DS-SEL-003
  // requires the SMALLEST feasible increment, and the frozen snapshot preserves
  // caller-supplied candidate order which is not guaranteed sorted.
  const byDiameter = (a: any, b: any) => (num(a?.diameter_m) ?? Infinity) - (num(b?.diameter_m) ?? Infinity);
  const maxDiams: any[] = (Array.isArray(maxCase.diameters) ? [...maxCase.diameters] : []).sort(byDiameter);
  const normDiams: any[] = (Array.isArray(normalCase.diameters) ? [...normalCase.diameters] : []).sort(byDiameter);
  const maxFlows = maxCase.flows ?? {};
  const normFlows = normalCase.flows ?? {};
  const qMax = (num(maxFlows.nmpVolumetricFlow_m3_h) ?? NaN) + (num(maxFlows.rrboVolumetricFlow_m3_h) ?? NaN);
  const qNorm = (num(normFlows.nmpVolumetricFlow_m3_h) ?? NaN) + (num(normFlows.rrboVolumetricFlow_m3_h) ?? NaN);
  base.maxTotalFlow_m3_h = Number.isFinite(qMax) ? qMax : null;
  base.normalTotalFlow_m3_h = Number.isFinite(qNorm) ? qNorm : null;

  const basis = resolveCapacityBasis(inputs, tech);
  base.capacityBasis = basis;
  if (!basis) {
    base.notRecommendableReason =
      'No hydraulic capacity basis is available for ECR: the Thermopac preliminary screening threshold derives from structured-packing (SMV/SMVP) published data and is not transferable to an agitated column; the C3 generic throughput percentage is not a substitute. Enter validated ECR flooding-capacity data (vendor or pilot) to make ECR assessable. No capacity value was invented.';
    return base;
  }
  const uLimitVal = num(inputs.max_design_utilization) ?? UTILIZATION_LIMIT_DEFAULT;
  const uLimit = { value: uLimitVal, source: UTILIZATION_LIMIT_SOURCE, assumed: num(inputs.max_design_utilization) === null };
  base.utilizationLimit = uLimit;
  if (!(uLimit.value > 0 && uLimit.value <= 1)) {
    base.notRecommendableReason = `Entered maximum design utilization '${inputs.max_design_utilization}' is not a fraction in (0, 1] — correct the entry.`;
    return base;
  }
  if (!Number.isFinite(qMax) || qMax <= 0) {
    base.notRecommendableReason = `The frozen ${tech.toUpperCase()} maximum-case snapshot carries no valid total volumetric flow — feasibility cannot be assessed.`;
    return base;
  }

  // DS-SEL-001 — calculated minimum diameter
  const dMin_m = Math.sqrt((4 * qMax) / (Math.PI * uLimit.value * basis.value));
  base.calculatedMinimumDiameter_mm = Math.round(dMin_m * 1000 * 10) / 10;

  // DS-SEL-002 — round UP to next 50 mm increment (never down)
  const firstIncrement_mm = Math.ceil((dMin_m * 1000) / INCREMENT_MM - 1e-9) * INCREMENT_MM;

  // Frozen-sweep row lookup (never recompute loadings)
  const rowAt = (rows: any[], d_mm: number) => rows.find(r => Math.abs((num(r.diameter_m) ?? NaN) * 1000 - d_mm) < 0.5);

  // DS-SEL-003 — evaluate every sweep increment against the basis; select the
  // smallest practical increment ≥ the rounded minimum that passes.
  let selected_mm: number | null = null;
  for (const r of maxDiams) {
    const d_mm = Math.round((num(r.diameter_m) ?? 0) * 1000);
    const load = num(r.loads?.total?.result);
    if (load === null) {
      base.evaluationTable.push({ diameter_mm: d_mm, maxLoading: NaN, utilization: null, marginFraction: null, feasible: null, note: 'Total loading not stored in frozen snapshot' });
      continue;
    }
    const util = load / basis.value;
    const feasible = util <= uLimit.value;
    base.evaluationTable.push({
      diameter_mm: d_mm, maxLoading: load, utilization: util, marginFraction: 1 - util, feasible,
      note: d_mm < firstIncrement_mm ? 'Below rounded minimum diameter' : null,
    });
    if (selected_mm === null && d_mm >= firstIncrement_mm && d_mm % INCREMENT_MM === 0 && feasible) selected_mm = d_mm;
  }
  if (selected_mm === null) {
    base.notRecommendableReason = `No diameter in the frozen ${tech.toUpperCase()} sweep at or above the rounded minimum (${firstIncrement_mm} mm) satisfies utilization ≤ ${uLimit.value} against the ${basis.tier} basis (${basis.value} ${basis.unit}). The sweep range may be exceeded — extend the engine sweep or review the basis.`;
    return base;
  }

  const selMax = rowAt(maxDiams, selected_mm);
  const selNorm = rowAt(normDiams, selected_mm);
  base.selectedDiameter_mm = selected_mm;
  base.maximumLoading = num(selMax?.loads?.total?.result);
  base.normalLoading = num(selNorm?.loads?.total?.result);
  base.floodingUtilization = base.maximumLoading !== null ? base.maximumLoading / basis.value : null;
  base.floodingMarginFraction = base.floodingUtilization !== null ? 1 - base.floodingUtilization : null;
  base.floodingMarginAbsolute = base.maximumLoading !== null ? basis.value - base.maximumLoading : null;

  const dp = selMax?.pressureDrop;
  base.pressureDropAtSelected = dp?.result != null && typeof dp.result === 'number'
    ? `${dp.result} ${dp.units ?? ''}`.trim()
    : (dp?.status ?? 'Not Calculable — no validated pressure-drop basis in the frozen snapshot');

  // Checks that could not be applied (skipped-with-notation, never silently passed)
  const notAssessable: string[] = [];
  if (tech === 'ecp') {
    if (selMax?.minimumWettingStatus?.result == null) notAssessable.push('Minimum wetting check — engine status: ' + (selMax?.minimumWettingStatus?.status ?? 'Not Calculable (no vendor minimum-wetting data)'));
    if (selMax?.recommendedLoadingStatus?.result == null) notAssessable.push('Vendor recommended loading range — engine status: ' + (selMax?.recommendedLoadingStatus?.status ?? 'Not Calculable (no vendor data)'));
    notAssessable.push('Distributor operating-range check — no distributor specification supplied to the engine');
  }
  base.checksNotAssessable = notAssessable;
  base.recommendable = true;
  return base;
}

/** DS-SEL-005 — deterministic technology cascade. */
function runCascade(evals: TechEvaluation[]) {
  const steps: Array<{ step: number; criterion: string; evaluation: string; outcome: string }> = [];
  const rec = evals.filter(e => e.recommendable);
  const elim = evals.filter(e => !e.recommendable);
  steps.push({
    step: 1, criterion: 'Hydraulic feasibility',
    evaluation: evals.map(e => `${e.technology.toUpperCase()}: ${e.recommendable ? `recommendable (selected ${e.selectedDiameter_mm} mm, utilization ${e.floodingUtilization?.toFixed(4)})` : `NOT recommendable — ${e.notRecommendableReason}`}`).join(' | '),
    outcome: rec.length === 0 ? 'No recommendable technology' : rec.length === 1 ? `${rec[0].technology.toUpperCase()} is the only hydraulically recommendable technology — selected at step 1` : `${rec.length} technologies recommendable — proceed to step 2`,
  });
  if (rec.length === 0) return { steps, selected: null as Tech | null, status: 'not_recommendable' as const, reason: `No technology is hydraulically recommendable: ${elim.map(e => `${e.technology.toUpperCase()} — ${e.notRecommendableReason}`).join('; ')}` };
  if (rec.length === 1) return { steps, selected: rec[0].technology, status: 'recommended' as const, reason: `${rec[0].technology.toUpperCase()} selected at cascade step 1 (hydraulic feasibility): ${elim.length ? elim.map(e => `${e.technology.toUpperCase()} not recommendable — ${e.notRecommendableReason}`).join('; ') : 'only recommendable technology'}` };

  // Step 2 — direct comparison of the actual calculated flooding margins (no tie band)
  const sorted = [...rec].sort((a, b) => (b.floodingMarginFraction ?? -Infinity) - (a.floodingMarginFraction ?? -Infinity));
  const best = sorted[0]; const second = sorted[1];
  const m1 = best.floodingMarginFraction; const m2 = second.floodingMarginFraction;
  steps.push({
    step: 2, criterion: 'Flooding margin (direct comparison of calculated values)',
    evaluation: rec.map(e => `${e.technology.toUpperCase()}: margin ${e.floodingMarginFraction?.toFixed(6)} (${e.floodingMarginAbsolute?.toFixed(3)} m³/(m²·h) absolute)`).join(' | '),
    outcome: m1 !== null && m2 !== null && m1 !== m2 ? `${best.technology.toUpperCase()} has the greater flooding margin — selected at step 2` : 'Margins identical — proceed to step 3',
  });
  if (m1 !== null && m2 !== null && m1 !== m2) {
    return { steps, selected: best.technology, status: 'recommended' as const, reason: `${best.technology.toUpperCase()} selected at cascade step 2: flooding margin ${m1.toFixed(4)} vs ${second.technology.toUpperCase()} ${m2.toFixed(4)} (direct comparison of calculated values).` };
  }

  // Step 3 — pressure drop, only when validated ΔP data exist for ALL remaining technologies
  const allHaveDp = rec.every(e => /^\d/.test(e.pressureDropAtSelected));
  steps.push({
    step: 3, criterion: 'Pressure drop (applied only when validated ΔP data exist for all remaining technologies)',
    evaluation: rec.map(e => `${e.technology.toUpperCase()}: ${e.pressureDropAtSelected}`).join(' | '),
    outcome: allHaveDp ? 'Validated ΔP data available — lower pressure drop preferred' : 'Pressure-drop criterion not applied — validated pressure-drop data unavailable',
  });
  if (allHaveDp) {
    const byDp = [...rec].sort((a, b) => parseFloat(a.pressureDropAtSelected) - parseFloat(b.pressureDropAtSelected));
    if (parseFloat(byDp[0].pressureDropAtSelected) !== parseFloat(byDp[1].pressureDropAtSelected)) {
      return { steps, selected: byDp[0].technology, status: 'recommended' as const, reason: `${byDp[0].technology.toUpperCase()} selected at cascade step 3: lower validated pressure drop (${byDp[0].pressureDropAtSelected} vs ${byDp[1].pressureDropAtSelected}).` };
    }
  }
  return { steps, selected: null as Tech | null, status: 'engineering_review_required' as const, reason: 'Multiple technically acceptable solutions identified. Engineering review required.' };
}

/** Confidence ladder — weakest-link rule over the selection path. */
function deriveConfidence(evals: TechEvaluation[], selected: Tech | null): { level: string; basis: string[] } {
  const considered = selected ? evals.filter(e => e.technology === selected) : evals.filter(e => e.recommendable);
  const facts: string[] = [];
  let level = 'Preliminary Screening';
  const tiers = considered.map(e => e.capacityBasis?.tier).filter(Boolean);
  if (considered.length && tiers.every(t => t === 'Vendor Validated' || t === 'Pilot Validated')) {
    const anyAssumed = considered.some(e => e.capacityBasis?.assumed || e.utilizationLimit?.assumed);
    if (!anyAssumed) {
      level = tiers.every(t => t === 'Pilot Validated') ? 'Pilot Validated' : 'Vendor Validated';
    } else {
      facts.push('Utilization limit or capacity basis remains Assumed — confidence limited to Preliminary Screening.');
    }
  } else {
    facts.push('Capacity basis tier: ' + (tiers.join(', ') || 'none') + ' — Preliminary Screening threshold governs the selection path.');
  }
  facts.push('Ladder: Preliminary Screening → Engineering Standard → Vendor Validated → Pilot Validated → Commercially Proven. Confidence equals the maturity of the WEAKEST selection-path input. Engineering Standard requires an approved Thermopac standard basis (none registered); Commercially Proven requires an approved operating-reference record (register not yet established).');
  return { level, basis: facts };
}

/** Generate (or regenerate) the autonomous design selection record for a revision. */
export async function generateSelectionRecord(revisionId: number, userId: number) {
  const revQ = await pool.query('SELECT id, is_frozen FROM design_software_revisions WHERE id = $1', [revisionId]);
  if (!revQ.rows.length) throw Object.assign(new Error('Revision not found'), { statusCode: 404 });
  if (revQ.rows[0].is_frozen) throw Object.assign(new Error('Revision is frozen — the design selection record cannot be regenerated.'), { statusCode: 409 });

  const [runsQ, inputRows, assumpQ] = await Promise.all([
    pool.query(
      `SELECT DISTINCT ON (calculation_type) *
         FROM design_software_calculation_runs
        WHERE revision_id = $1 AND calculation_type IN ('ecp','ecr')
        ORDER BY calculation_type, calculated_at DESC`, [revisionId]),
    pool.query('SELECT section, data FROM design_software_inputs WHERE revision_id = $1', [revisionId]),
    pool.query(`SELECT parameter_label, assumed_value, unit, source_type, source_reference FROM design_software_assumptions WHERE revision_id = $1 AND source_type = 'Assumed'`, [revisionId]),
  ]);
  const inputs: Record<string, any> = {};
  for (const row of inputRows.rows) Object.assign(inputs, row.data);

  const runByType: Record<string, any> = {};
  for (const r of runsQ.rows) runByType[r.calculation_type] = r;
  if (!runByType.ecp && !runByType.ecr) {
    throw Object.assign(new Error('No ECP or ECR calculation run exists for this revision — run the Stage 7 equipment calculations first. The selector consumes frozen engine results only.'), { statusCode: 422 });
  }

  const evals: TechEvaluation[] = (['ecp', 'ecr'] as Tech[]).map(t => evaluateTechnology(t, runByType[t] ?? null, inputs));
  const cascade = runCascade(evals);
  const confidence = deriveConfidence(evals, cascade.selected);
  const selectedEval = cascade.selected ? evals.find(e => e.technology === cascade.selected)! : null;

  // Governing assumptions — the selection-path assumptions plus the revision's Assumed register entries
  const governingAssumptions: Array<{ item: string; value: string; source: string }> = [];
  for (const e of evals) {
    if (e.capacityBasis?.assumed) governingAssumptions.push({ item: `${e.technology.toUpperCase()} capacity basis (${e.capacityBasis.tier})`, value: `${e.capacityBasis.value} ${e.capacityBasis.unit}`, source: e.capacityBasis.source });
    if (e.utilizationLimit?.assumed && e.recommendable) governingAssumptions.push({ item: `${e.technology.toUpperCase()} maximum design utilization`, value: String(e.utilizationLimit.value), source: e.utilizationLimit.source });
  }
  for (const a of assumpQ.rows) {
    governingAssumptions.push({ item: a.parameter_label, value: `${typeof a.assumed_value === 'string' ? a.assumed_value : JSON.stringify(a.assumed_value)} ${a.unit ?? ''}`.trim(), source: a.source_reference ?? 'Assumptions Register (Assumed)' });
  }

  const record = {
    engine: { id: DSEL_ENGINE_ID, version: DSEL_ENGINE_VERSION },
    generatedAt: new Date().toISOString(),
    revisionId,
    governanceState: 'Autonomous Preliminary Selection — Pending Hydraulic Validation',
    roundingRule: ROUNDING_RULE_TEXT,
    incrementMm: INCREMENT_MM,
    technologies: evals,
    cascade: cascade.steps,
    selectedTechnology: cascade.selected,
    selectedDiameter_mm: selectedEval?.selectedDiameter_mm ?? null,
    calculatedMinimumDiameter_mm: selectedEval?.calculatedMinimumDiameter_mm ?? null,
    normalLoading: selectedEval?.normalLoading ?? null,
    maximumLoading: selectedEval?.maximumLoading ?? null,
    floodingUtilization: selectedEval?.floodingUtilization ?? null,
    floodingMarginFraction: selectedEval?.floodingMarginFraction ?? null,
    floodingMarginAbsolute: selectedEval?.floodingMarginAbsolute ?? null,
    capacityBasis: selectedEval?.capacityBasis ?? null,
    utilizationLimit: selectedEval?.utilizationLimit ?? null,
    confidenceLevel: confidence.level,
    confidenceBasis: confidence.basis,
    governingAssumptions,
    reason: cascade.reason,
    selectionStatus: cascade.status,
    provenance: {
      runs: evals.filter(e => e.runId).map(e => ({ technology: e.technology, runId: e.runId, engine: e.engineName, engineVersion: e.engineVersion, status: e.runStatus })),
      note: 'All loadings are read verbatim from the frozen calculation run snapshots — the selector never recomputes engine results.',
    },
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Revision-scoped advisory lock: serializes concurrent regenerations so at
    // most one non-superseded record can exist per revision at any time.
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [742001, revisionId]);
    await client.query('UPDATE design_selection_records SET is_superseded = TRUE WHERE revision_id = $1 AND is_superseded = FALSE', [revisionId]);
    const ins = await client.query(
      `INSERT INTO design_selection_records
         (revision_id, record, selected_technology, selected_diameter_mm, confidence_level, selection_status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [revisionId, JSON.stringify(record), cascade.selected, record.selectedDiameter_mm, confidence.level, cascade.status, userId]);
    await client.query('COMMIT');
    return ins.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getLatestSelection(revisionId: number) {
  const q = await pool.query(
    `SELECT r.*, u.username AS created_by_name, du.username AS decision_by_name
       FROM design_selection_records r
       LEFT JOIN users u ON u.id = r.created_by
       LEFT JOIN users du ON du.id = r.decision_by
      WHERE r.revision_id = $1 AND r.is_superseded = FALSE
      ORDER BY r.created_at DESC LIMIT 1`, [revisionId]);
  return q.rows[0] ?? null;
}

/** Record the engineer decision: approve / request_verification / override. */
export async function recordDecision(recordId: number, userId: number, body: {
  action: string; engineer?: string; reason?: string;
  overrideTechnology?: string; overrideDiameterMm?: number;
}) {
  const recQ = await pool.query(
    `SELECT r.*, rev.is_frozen FROM design_selection_records r
      JOIN design_software_revisions rev ON rev.id = r.revision_id
     WHERE r.id = $1`, [recordId]);
  if (!recQ.rows.length) throw Object.assign(new Error('Selection record not found'), { statusCode: 404 });
  const rec = recQ.rows[0];
  if (rec.is_frozen) throw Object.assign(new Error('Revision is frozen — decisions cannot be recorded.'), { statusCode: 409 });
  if (rec.is_superseded) throw Object.assign(new Error('This selection record has been superseded — decide on the latest record.'), { statusCode: 409 });

  const action = String(body.action ?? '');
  const engineer = String(body.engineer ?? '').trim();
  const reason = String(body.reason ?? '').trim();

  if (action === 'approve' || action === 'request_verification') {
    if (!engineer) throw Object.assign(new Error('Engineer name is required.'), { statusCode: 400 });
    const decision = action === 'approve' ? 'approved' : 'verification_requested';
    const upd = await pool.query(
      `UPDATE design_selection_records
          SET decision=$2, decision_by=$3, decision_at=NOW(), decision_engineer=$4, decision_reason=$5
        WHERE id=$1 AND is_superseded = FALSE AND decision = 'pending' RETURNING *`,
      [recordId, decision, userId, engineer, reason || null]);
    if (!upd.rows.length) throw Object.assign(new Error('This record was superseded or already decided while the decision was in flight — reload and decide on the latest record.'), { statusCode: 409 });
    return upd.rows[0];
  }

  if (action === 'override') {
    if (!engineer || !reason) throw Object.assign(new Error('Override requires the engineer name AND a mandatory engineering justification.'), { statusCode: 400 });
    const oTech = String(body.overrideTechnology ?? '').trim().toLowerCase() || null;
    const oDia = Number.isFinite(Number(body.overrideDiameterMm)) && Number(body.overrideDiameterMm) > 0 ? Math.round(Number(body.overrideDiameterMm)) : null;
    if (!oTech && !oDia) throw Object.assign(new Error('Override must change the technology and/or the diameter.'), { statusCode: 400 });
    if (oTech && !['ecp', 'ecr'].includes(oTech)) throw Object.assign(new Error(`Unknown override technology '${oTech}'.`), { statusCode: 400 });
    {
      // Reject no-op overrides: an "override" identical to the autonomous
      // recommendation would record a governance action without a change.
      const autoRec = rec.record ?? {};
      const effT = oTech ?? autoRec.selectedTechnology ?? null;
      const effD = oDia ?? autoRec.selectedDiameter_mm ?? null;
      if (effT === (autoRec.selectedTechnology ?? null) && effD === (autoRec.selectedDiameter_mm ?? null)) {
        throw Object.assign(new Error('Override values are identical to the autonomous recommendation — use Approve instead, or change the technology/diameter.'), { statusCode: 400 });
      }
    }

    // Impact assessment — read from the record's frozen evaluation table (never recomputed)
    const record = rec.record ?? {};
    const effTech = oTech ?? record.selectedTechnology ?? null;
    const effDia = oDia ?? record.selectedDiameter_mm ?? null;
    let impact: any = { note: 'Impact derived from the frozen evaluation table of this record — engine results were not recomputed.' };
    const techEval = (record.technologies ?? []).find((t: any) => t.technology === effTech);
    const row = techEval?.evaluationTable?.find((r: any) => r.diameter_mm === effDia);
    if (row) {
      impact = { ...impact, technology: effTech, diameter_mm: effDia, maxLoading: row.maxLoading, floodingUtilization: row.utilization, floodingMarginFraction: row.marginFraction, feasiblePerAutonomousCriteria: row.feasible };
    } else {
      impact = { ...impact, technology: effTech, diameter_mm: effDia, warning: 'The overridden diameter/technology is not in the frozen evaluation table — no hydraulic impact figures are available from this record. Re-run the equipment calculation to assess the override.' };
    }
    const upd = await pool.query(
      `UPDATE design_selection_records
          SET decision='overridden', decision_by=$2, decision_at=NOW(), decision_engineer=$3, decision_reason=$4,
              override_technology=$5, override_diameter_mm=$6, override_impact=$7
        WHERE id=$1 AND is_superseded = FALSE AND decision = 'pending' RETURNING *`,
      [recordId, userId, engineer, reason, oTech, oDia, JSON.stringify(impact)]);
    if (!upd.rows.length) throw Object.assign(new Error('This record was superseded or already decided while the decision was in flight — reload and decide on the latest record.'), { statusCode: 409 });
    return upd.rows[0];
  }

  throw Object.assign(new Error(`Unknown decision action '${action}' — expected approve, request_verification or override.`), { statusCode: 400 });
}
