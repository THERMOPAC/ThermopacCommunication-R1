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
  'Upper bound of the Sulzer SMV/SMVP published screening throughput range 35–60 m³/(m²·h) (Johannes Rauber, Sulzer Chemtech Ltd., AIChE 2006) — a published typical SMVP throughput characteristic, NOT validated RRBO/NMP flooding capacity.';
const UTILIZATION_LIMIT_DEFAULT = 0.80;
const UTILIZATION_LIMIT_SOURCE =
  'Maximum allowable utilization against the preliminary capacity-screening basis — configurable screening criterion consistent with the C4/C5 utilization screening band upper bound (80 %); not a universal engineering rule.';

/** Governed terminology (audit correction 2026-08-06): when the basis is the
 *  screening threshold, utilization/margin are SCREENING quantities — true
 *  flooding utilization and flooding margin remain Not Calculable until
 *  approved vendor, pilot or RRBO/NMP experimental flooding data are entered. */
const TERMINOLOGY_PRELIMINARY = {
  utilizationLabel: 'Utilization against preliminary capacity-screening basis',
  marginLabel: 'Preliminary hydraulic loading margin',
  basisLabel: 'Thermopac preliminary SMVP throughput threshold',
  trueFloodingStatement:
    'True flooding utilization and true flooding margin: Not Calculable — they remain Not Calculable until approved vendor, pilot or RRBO/NMP experimental flooding data are entered.',
} as const;
const TERMINOLOGY_VALIDATED = {
  utilizationLabel: 'Flooding utilization',
  marginLabel: 'Flooding margin',
  basisLabel: 'Validated flooding capacity basis',
  trueFloodingStatement: null,
} as const;
const ECR_NOT_ASSESSABLE_TEXT =
  'ECR Not Assessable for Autonomous Hydraulic Selection — validated ECR capacity basis unavailable.';

type Tech = 'ecp' | 'ecr';

interface CapacityBasis {
  value: number;
  unit: string;
  tier: 'Vendor Validated' | 'Pilot Validated' | 'Thermopac preliminary SMVP throughput threshold';
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
  /** True when the technology cannot be assessed at all (no capacity basis / no
   *  accepted run) — governance distinguishes Not Assessable from Not
   *  Recommendable: non-assessability never implies technical inferiority. */
  notAssessable: boolean;
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
    normalLoading: number | null;
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
    return { value: threshold, unit: 'm³/(m²·h)', tier: 'Thermopac preliminary SMVP throughput threshold', source: PRELIM_THRESHOLD_SOURCE, assumed: true };
  }
  // ECR: the SMVP packing screening threshold applies to structured packing only —
  // it is NOT transferable to an agitated column. Without validated ECR capacity
  // data there is no capacity basis, and none is invented.
  return null;
}

function evaluateTechnology(tech: Tech, run: any | null, inputs: Record<string, any>): TechEvaluation {
  const base: TechEvaluation = {
    technology: tech, runId: null, runStatus: null, engineName: null, engineVersion: null,
    recommendable: false, notAssessable: false, notRecommendableReason: null, capacityBasis: null, utilizationLimit: null,
    maxTotalFlow_m3_h: null, normalTotalFlow_m3_h: null,
    calculatedMinimumDiameter_mm: null, selectedDiameter_mm: null,
    normalLoading: null, maximumLoading: null, floodingUtilization: null,
    floodingMarginFraction: null, floodingMarginAbsolute: null,
    pressureDropAtSelected: 'Not Calculable — no validated pressure-drop basis',
    checksNotAssessable: [], evaluationTable: [],
  };
  if (!run) {
    base.notAssessable = true;
    base.notRecommendableReason = `${tech.toUpperCase()} Not Assessable for Autonomous Hydraulic Selection — no accepted ${tech.toUpperCase()} calculation run exists for this revision.`;
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
    base.notAssessable = true;
    base.notRecommendableReason =
      ECR_NOT_ASSESSABLE_TEXT +
      ' The Thermopac preliminary SMVP throughput threshold derives from structured-packing (SMV/SMVP) published data and is not transferable to an agitated column; the C3 generic throughput percentage is not a substitute. Enter validated ECR flooding-capacity data (vendor or pilot) to make ECR assessable. Non-assessability does not imply technical inferiority; no capacity value was invented.';
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
    const normLoad = num(rowAt(normDiams, num(r.diameter_m) !== null ? (num(r.diameter_m)! * 1000) : NaN)?.loads?.total?.result);
    if (load === null) {
      base.evaluationTable.push({ diameter_mm: d_mm, maxLoading: NaN, normalLoading: normLoad, utilization: null, marginFraction: null, feasible: null, note: 'Total loading not stored in frozen snapshot' });
      continue;
    }
    const util = load / basis.value;
    const feasible = util <= uLimit.value;
    base.evaluationTable.push({
      diameter_mm: d_mm, maxLoading: load, normalLoading: normLoad, utilization: util, marginFraction: 1 - util, feasible,
      note: d_mm < firstIncrement_mm ? 'Below rounded minimum diameter' : null,
    });
    if (selected_mm === null && d_mm >= firstIncrement_mm && d_mm % INCREMENT_MM === 0 && feasible) selected_mm = d_mm;
  }
  if (selected_mm === null) {
    base.notRecommendableReason = `No diameter in the frozen ${tech.toUpperCase()} sweep at or above the rounded minimum (${firstIncrement_mm} mm) satisfies utilization ≤ ${uLimit.value} against the ${basis.tier} (${basis.value} ${basis.unit}). The sweep range may be exceeded — extend the engine sweep or review the basis.`;
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
    step: 1, criterion: 'Hydraulic feasibility / assessability',
    evaluation: evals.map(e => `${e.technology.toUpperCase()}: ${e.recommendable ? `assessable and feasible (selected ${e.selectedDiameter_mm} mm, utilization ${e.floodingUtilization?.toFixed(4)} against the ${e.capacityBasis?.tier ?? 'declared basis'})` : e.notAssessable ? `NOT ASSESSABLE — ${e.notRecommendableReason}` : `NOT feasible — ${e.notRecommendableReason}`}`).join(' | '),
    outcome: rec.length === 0 ? 'No assessable and feasible technology' : rec.length === 1 ? `${rec[0].technology.toUpperCase()} is the only currently assessable and hydraulically feasible technology — selected at step 1` : `${rec.length} technologies assessable and feasible — proceed to step 2`,
  });
  if (rec.length === 0) return { steps, selected: null as Tech | null, status: 'not_recommendable' as const, reason: `No technology is currently assessable and hydraulically feasible: ${elim.map(e => `${e.technology.toUpperCase()} — ${e.notRecommendableReason}`).join('; ')}` };
  if (rec.length === 1) {
    const sel = rec[0].technology.toUpperCase();
    const allElimNotAssessable = elim.length > 0 && elim.every(e => e.notAssessable);
    const reason = allElimNotAssessable
      ? `${sel} selected as the only currently assessable technology under the available preliminary hydraulic basis. This does not establish technical superiority over ${elim.map(e => e.technology.toUpperCase()).join(', ')}. ${elim.map(e => e.notRecommendableReason).join('; ')}`
      : `${sel} selected at cascade step 1 (hydraulic feasibility): ${elim.length ? elim.map(e => `${e.technology.toUpperCase()} — ${e.notRecommendableReason}`).join('; ') : 'only assessable and feasible technology'}`;
    return { steps, selected: rec[0].technology, status: 'recommended' as const, reason };
  }

  // Step 2 — direct comparison of the actual calculated hydraulic loading margins (no tie band)
  const sorted = [...rec].sort((a, b) => (b.floodingMarginFraction ?? -Infinity) - (a.floodingMarginFraction ?? -Infinity));
  const best = sorted[0]; const second = sorted[1];
  const m1 = best.floodingMarginFraction; const m2 = second.floodingMarginFraction;
  steps.push({
    step: 2, criterion: 'Hydraulic loading margin (direct comparison of calculated values; reported as preliminary when the basis is a screening threshold)',
    evaluation: rec.map(e => `${e.technology.toUpperCase()}: margin ${e.floodingMarginFraction?.toFixed(6)} (${e.floodingMarginAbsolute?.toFixed(3)} m³/(m²·h) absolute)`).join(' | '),
    outcome: m1 !== null && m2 !== null && m1 !== m2 ? `${best.technology.toUpperCase()} has the greater hydraulic loading margin — selected at step 2` : 'Margins identical — proceed to step 3',
  });
  if (m1 !== null && m2 !== null && m1 !== m2) {
    return { steps, selected: best.technology, status: 'recommended' as const, reason: `${best.technology.toUpperCase()} selected at cascade step 2: hydraulic loading margin ${m1.toFixed(4)} vs ${second.technology.toUpperCase()} ${m2.toFixed(4)} (direct comparison of calculated values).` };
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
    facts.push('Capacity basis tier: ' + (tiers.join(', ') || 'none') + ' — the Thermopac preliminary SMVP throughput threshold governs the selection path.');
  }
  facts.push('Ladder: Preliminary Screening → Engineering Standard → Vendor Validated → Pilot Validated → Commercially Proven. Confidence equals the maturity of the WEAKEST selection-path input. Engineering Standard requires an approved Thermopac standard basis (none registered); Commercially Proven requires an approved operating-reference record (register not yet established).');
  return { level, basis: facts };
}

const USER_SELECTION_STATEMENT =
  'Governed user selection of a larger, more conservative diameter — not an Engineer Override of an unsafe design. ' +
  'The user-selected diameter must belong to the governed 50 mm increment series and be equal to or greater than the autonomous calculated diameter; smaller values are rejected. ' +
  'The autonomous diameter is retained unaltered for traceability.';

export interface UserDiameterSelection {
  diameterMm: number;
  engineer: string;
  reason: string;
  /** ISO timestamp of the original selection (carry-forward retains it). */
  selectedAt?: string;
  carriedForward?: boolean;
}

/** Generate (or regenerate) the autonomous design selection record for a revision.
 *
 *  opts.userSelection — apply a governed user diameter selection (DS-SEL-006) on
 *  top of the autonomous result. When omitted, any user selection on the current
 *  active record is carried forward automatically IF it is still valid against
 *  the fresh autonomous evaluation (≥ new autonomous diameter, feasible in the
 *  new frozen sweep); otherwise it is dropped with an explicit notation and the
 *  record reverts to autonomous mode. The engineer decision always resets to
 *  pending — the new effective design must be reviewed again. */
export async function generateSelectionRecord(
  revisionId: number,
  userId: number,
  opts?: { userSelection?: UserDiameterSelection },
) {
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

  // ── DS-SEL-006 — governed user diameter selection ──────────────────────────
  // Explicit selection (opts.userSelection) is validated strictly and rejected
  // with a 422 on any violation. Absent an explicit selection, the current
  // active record's user selection is carried forward if still valid.
  const autoDia_mm = selectedEval?.selectedDiameter_mm ?? null;
  const evalRowAt = (d_mm: number) => selectedEval?.evaluationTable?.find(r => r.diameter_mm === d_mm) ?? null;

  let userSel: UserDiameterSelection | null = null;
  let userSelectionDropped: string | null = null;

  const validateUserSelection = (sel: UserDiameterSelection, strict: boolean): string | null => {
    const d = Math.round(Number(sel.diameterMm));
    if (!Number.isFinite(d) || d <= 0) return 'User-selected diameter is not a valid positive number.';
    if (d % INCREMENT_MM !== 0) return `User-selected diameter ${d} mm is not on the governed ${INCREMENT_MM} mm increment series — arbitrary values are not allowed.`;
    if (autoDia_mm === null) return 'No autonomous diameter is available — the governed user selection requires a recommendable autonomous selection first.';
    if (d < autoDia_mm) return `User-selected diameter ${d} mm is below the autonomous calculated minimum permitted diameter of ${autoDia_mm} mm (DS-SEL-003). A smaller diameter would exceed the allowable utilization limit against the declared capacity basis and is blocked.`;
    const row = evalRowAt(d);
    if (!row) return `User-selected diameter ${d} mm is outside the frozen sweep range of the accepted ${cascade.selected?.toUpperCase()} run — loadings are read verbatim from frozen snapshots and are never extrapolated. Valid range: ${selectedEval?.evaluationTable?.[0]?.diameter_mm ?? '?'}–${selectedEval?.evaluationTable?.slice(-1)[0]?.diameter_mm ?? '?'} mm.`;
    if (row.feasible === false) return `User-selected diameter ${d} mm is not feasible against the declared capacity basis per the frozen evaluation table.`;
    if (strict) {
      if (!String(sel.engineer ?? '').trim()) return 'Engineer name is required for a governed diameter selection.';
      if (!String(sel.reason ?? '').trim()) return 'A reason for selecting a larger diameter is required.';
    }
    return null;
  };

  if (opts?.userSelection) {
    const err = validateUserSelection(opts.userSelection, true);
    if (err) throw Object.assign(new Error(err), { statusCode: 422 });
    userSel = { ...opts.userSelection, diameterMm: Math.round(Number(opts.userSelection.diameterMm)), selectedAt: opts.userSelection.selectedAt ?? new Date().toISOString(), carriedForward: false };
  } else {
    // Carry-forward check against the current active record (read BEFORE superseding).
    const prevQ = await pool.query(
      `SELECT selection_mode, user_selected_diameter_mm, user_selection_engineer, user_selection_reason, user_selection_at
         FROM design_selection_records
        WHERE revision_id = $1 AND is_superseded = FALSE
        ORDER BY created_at DESC LIMIT 1`, [revisionId]);
    const prev = prevQ.rows[0];
    if (prev?.selection_mode === 'user_selected' && prev.user_selected_diameter_mm) {
      const candidate: UserDiameterSelection = {
        diameterMm: prev.user_selected_diameter_mm,
        engineer: prev.user_selection_engineer ?? '',
        reason: prev.user_selection_reason ?? '',
        selectedAt: prev.user_selection_at ? new Date(prev.user_selection_at).toISOString() : undefined,
        carriedForward: true,
      };
      const err = validateUserSelection(candidate, false);
      if (err) {
        userSelectionDropped = `Previous governed user diameter selection (${prev.user_selected_diameter_mm} mm by ${prev.user_selection_engineer ?? 'unknown'}) was NOT carried forward: ${err} The record reverts to the autonomous selection; a new governed selection may be entered.`;
      } else {
        userSel = candidate;
      }
    }
  }

  const effectiveDia_mm = userSel ? userSel.diameterMm : autoDia_mm;
  const effRow = effectiveDia_mm !== null ? evalRowAt(effectiveDia_mm) : null;
  const basisValue = selectedEval?.capacityBasis?.value ?? null;
  const effMaxLoading = userSel ? (effRow?.maxLoading ?? null) : (selectedEval?.maximumLoading ?? null);
  const effNormalLoading = userSel ? (effRow?.normalLoading ?? null) : (selectedEval?.normalLoading ?? null);
  const effUtilization = userSel ? (effRow?.utilization ?? null) : (selectedEval?.floodingUtilization ?? null);
  const effMarginFraction = effUtilization !== null && effUtilization !== undefined ? 1 - effUtilization : null;
  const effMarginAbsolute = effMaxLoading !== null && basisValue !== null ? basisValue - effMaxLoading : null;

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
    governanceState: 'Autonomous Preliminary Selection — Pending Hydraulic and Pressure-Drop Validation',
    roundingRule: ROUNDING_RULE_TEXT,
    incrementMm: INCREMENT_MM,
    // Governed terminology (audit correction 2026-08-06): screening-basis
    // quantities are never presented as true flooding quantities.
    terminology: (selectedEval?.capacityBasis && !selectedEval.capacityBasis.assumed) ? TERMINOLOGY_VALIDATED : TERMINOLOGY_PRELIMINARY,
    technologies: evals,
    cascade: cascade.steps,
    selectedTechnology: cascade.selected,
    selectedDiameter_mm: selectedEval?.selectedDiameter_mm ?? null,
    // ── DS-SEL-006 — diameter governance (autonomous / user-selected / effective)
    selectionMode: userSel ? 'user_selected' : 'autonomous',
    autonomousDiameter_mm: autoDia_mm,
    userSelectedDiameter_mm: userSel?.diameterMm ?? null,
    effectiveDiameter_mm: effectiveDia_mm,
    effectiveNormalLoading: effNormalLoading,
    effectiveMaximumLoading: effMaxLoading,
    effectiveFloodingUtilization: effUtilization,
    effectiveFloodingMarginFraction: effMarginFraction,
    effectiveFloodingMarginAbsolute: effMarginAbsolute,
    userSelection: userSel ? {
      engineer: userSel.engineer,
      reason: userSel.reason,
      selectedAt: userSel.selectedAt,
      carriedForward: userSel.carriedForward === true,
      statement: USER_SELECTION_STATEMENT,
    } : null,
    userSelectionDropped,
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
         (revision_id, record, selected_technology, selected_diameter_mm, confidence_level, selection_status, created_by,
          selection_mode, user_selected_diameter_mm, effective_diameter_mm,
          user_selection_engineer, user_selection_reason, user_selection_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [revisionId, JSON.stringify(record), cascade.selected, record.selectedDiameter_mm, confidence.level, cascade.status, userId,
       userSel ? 'user_selected' : 'autonomous', userSel?.diameterMm ?? null, effectiveDia_mm,
       userSel?.engineer ?? null, userSel?.reason ?? null, userSel?.selectedAt ? new Date(userSel.selectedAt) : null]);
    await client.query('COMMIT');
    return ins.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * DS-SEL-006 — Governed user diameter selection (single orchestrated action).
 *
 * Validates the entry (50 mm increment series, ≥ autonomous minimum — smaller
 * values rejected server-side), then automatically:
 *   1. re-runs C3 Common Hydraulics, C4 ECP, C5 ECR (where applicable) and the
 *      mechanical calculation with the effective diameter,
 *   2. supersedes the previous active DS-SEL record and creates a new traceable
 *      record in user_selected mode (decision resets to pending — the new
 *      effective design must be reviewed again),
 *   3. stores the impact assessment (previous vs new run IDs, loading,
 *      utilization, margin, pressure drop, holdup where calculable, heights),
 *   4. reconciles all affected reports (draft regenerated; for_review/released
 *      marked stale + new report generated; approval blocked while stale).
 */
export async function applyUserDiameterSelection(revisionId: number, userId: number, body: {
  diameterMm: number; engineer?: string; reason?: string;
}) {
  const revQ = await pool.query('SELECT id, is_frozen FROM design_software_revisions WHERE id = $1', [revisionId]);
  if (!revQ.rows.length) throw Object.assign(new Error('Revision not found'), { statusCode: 404 });
  if (revQ.rows[0].is_frozen) throw Object.assign(new Error('Revision is frozen — the governing diameter cannot be changed.'), { statusCode: 409 });

  const engineer = String(body.engineer ?? '').trim();
  const reason = String(body.reason ?? '').trim();
  const dia = Math.round(Number(body.diameterMm));
  if (!engineer) throw Object.assign(new Error('Engineer name is required for a governed diameter selection.'), { statusCode: 400 });
  if (!reason) throw Object.assign(new Error('A reason for selecting a larger diameter is required.'), { statusCode: 400 });
  if (!Number.isFinite(dia) || dia <= 0) throw Object.assign(new Error('User-selected diameter is not a valid positive number.'), { statusCode: 400 });
  if (dia % INCREMENT_MM !== 0) throw Object.assign(new Error(`User-selected diameter ${dia} mm is not on the governed ${INCREMENT_MM} mm increment series — arbitrary values are not allowed.`), { statusCode: 422 });

  // Early gate against the CURRENT autonomous minimum (final authoritative
  // validation re-runs against the FRESH record inside generateSelectionRecord).
  const active = await getLatestSelection(revisionId);
  if (!active) throw Object.assign(new Error('No design selection record exists — run the Stage 7 equipment calculations first.'), { statusCode: 422 });
  const activeAuto = active.record?.autonomousDiameter_mm ?? active.record?.selectedDiameter_mm ?? null;
  if (activeAuto !== null && dia < activeAuto) {
    throw Object.assign(new Error(`User-selected diameter ${dia} mm is below the autonomous calculated minimum permitted diameter of ${activeAuto} mm (DS-SEL-003). A smaller diameter would exceed the allowable utilization limit against the declared capacity basis and is blocked.`), { statusCode: 422 });
  }

  // ── Previous-state snapshot for the impact assessment ──────────────────────
  const prevRunsQ = await pool.query(
    `SELECT DISTINCT ON (calculation_type) id, calculation_type, calculation_status, result_snapshot
       FROM design_software_calculation_runs
      WHERE revision_id = $1 AND calculation_type IN ('hydraulics_common','ecp','ecr','mechanical_vessel')
      ORDER BY calculation_type, calculated_at DESC`, [revisionId]);
  const prevRuns: Record<string, any> = {};
  for (const r of prevRunsQ.rows) prevRuns[r.calculation_type] = r;
  const prevTech: Tech | null = (active.selected_technology === 'ecp' || active.selected_technology === 'ecr') ? active.selected_technology : null;
  const heightsOf = (run: any) => {
    const hb = run?.result_snapshot?.heightBreakdown ?? {};
    return {
      tangentToTangent_m: num(hb.totalTangentToTangent?.result),
      overallVesselHeight_m: num(hb.overallVesselHeight?.result),
    };
  };
  const prevState = {
    recordId: active.id,
    runIds: Object.fromEntries(Object.entries(prevRuns).map(([t, r]: [string, any]) => [t, r.id])),
    effectiveDiameter_mm: active.effective_diameter_mm ?? active.selected_diameter_mm ?? null,
    autonomousDiameter_mm: activeAuto,
    normalLoading: active.record?.effectiveNormalLoading ?? active.record?.normalLoading ?? null,
    maximumLoading: active.record?.effectiveMaximumLoading ?? active.record?.maximumLoading ?? null,
    floodingUtilization: active.record?.effectiveFloodingUtilization ?? active.record?.floodingUtilization ?? null,
    floodingMarginFraction: active.record?.effectiveFloodingMarginFraction ?? active.record?.floodingMarginFraction ?? null,
    pressureDrop: active.record?.technologies?.find((t: any) => t.technology === prevTech)?.pressureDropAtSelected ?? null,
    heights: prevTech ? heightsOf(prevRuns[prevTech]) : { tangentToTangent_m: null, overallVesselHeight_m: null },
  };

  // ── Automatic recalculation with the effective diameter ────────────────────
  const { runCalculation } = await import('../design-software-service');
  const rerunOutcome: Array<{ calculation: string; status: string; runId?: number; note?: string }> = [];
  const rerun = async (type: string, applicable: boolean, whyNot?: string) => {
    if (!applicable) { rerunOutcome.push({ calculation: type, status: 'not applicable', note: whyNot }); return; }
    const { run } = await runCalculation(revisionId, type, userId);
    if (run.calculation_status === 'error') {
      throw Object.assign(new Error(`Automatic ${type} recalculation failed — the governed diameter selection was NOT applied. Resolve the calculation error and retry.`), { statusCode: 422 });
    }
    rerunOutcome.push({ calculation: type, status: run.calculation_status, runId: run.id });
  };
  await rerun('hydraulics_common', true);
  await rerun('ecp', !!prevRuns.ecp, 'no prior accepted ECP run for this revision');
  await rerun('ecr', !!prevRuns.ecr, 'no prior ECR run for this revision — ECR not applicable');

  // ── New governed record (supersedes previous; decision resets to pending) ──
  const newRecordRow = await generateSelectionRecord(revisionId, userId, {
    userSelection: { diameterMm: dia, engineer, reason },
  });

  // Mechanical re-run AFTER the record exists so the mech geometry consumes the
  // effective diameter; its post-run hook regenerates the record with the user
  // selection carried forward. Mechanical is applicable only when it has run
  // before (it requires the Stage 8 technology selection).
  await rerun('mechanical_vessel', !!prevRuns.mechanical_vessel, 'no prior mechanical run for this revision — run it from Stage 9 when the mechanical basis is complete');

  // ── Impact assessment on the final active record ────────────────────────────
  const finalRec = await getLatestSelection(revisionId);
  const newRunsQ = await pool.query(
    `SELECT DISTINCT ON (calculation_type) id, calculation_type, result_snapshot
       FROM design_software_calculation_runs
      WHERE revision_id = $1 AND calculation_type IN ('hydraulics_common','ecp','ecr','mechanical_vessel')
        AND calculation_status IN ('success','warning')
      ORDER BY calculation_type, calculated_at DESC`, [revisionId]);
  const newRuns: Record<string, any> = {};
  for (const r of newRunsQ.rows) newRuns[r.calculation_type] = r;
  const newTech: Tech | null = (finalRec?.selected_technology === 'ecp' || finalRec?.selected_technology === 'ecr') ? finalRec.selected_technology : null;
  const impact = {
    kind: 'DS-SEL-006 governed user diameter selection',
    statement: USER_SELECTION_STATEMENT,
    engineer, reason, appliedAt: new Date().toISOString(),
    autonomousDiameter_mm: finalRec?.record?.autonomousDiameter_mm ?? null,
    userSelectedDiameter_mm: dia,
    effectiveDiameter_mm: finalRec?.effective_diameter_mm ?? dia,
    previous: prevState,
    new: {
      recordId: finalRec?.id ?? newRecordRow.id,
      runIds: Object.fromEntries(Object.entries(newRuns).map(([t, r]: [string, any]) => [t, r.id])),
      normalLoading: finalRec?.record?.effectiveNormalLoading ?? null,
      maximumLoading: finalRec?.record?.effectiveMaximumLoading ?? null,
      floodingUtilization: finalRec?.record?.effectiveFloodingUtilization ?? null,
      floodingMarginFraction: finalRec?.record?.effectiveFloodingMarginFraction ?? null,
      pressureDrop: finalRec?.record?.technologies?.find((t: any) => t.technology === newTech)?.pressureDropAtSelected ?? null,
      heights: newTech ? heightsOf(newRuns[newTech]) : { tangentToTangent_m: null, overallVesselHeight_m: null },
    },
    holdup: 'Not Calculable — the accepted engine snapshots carry no holdup result; no holdup value is invented.',
    note: 'All figures are read verbatim from the new frozen calculation runs and the governed selection record — nothing is recomputed here.',
  };
  await pool.query(
    `UPDATE design_selection_records
        SET selection_impact = $2, record = record || jsonb_build_object('selectionImpact', $2::jsonb)
      WHERE id = $1`, [finalRec?.id ?? newRecordRow.id, JSON.stringify(impact)]);

  // ── Report reconciliation ───────────────────────────────────────────────────
  const { reconcileReportsAfterDesignChange } = await import('../design-reports/report-service');
  const reports = await reconcileReportsAfterDesignChange(
    revisionId, userId,
    `Superseded by governed user diameter selection: effective diameter ${dia} mm (autonomous ${finalRec?.record?.autonomousDiameter_mm ?? activeAuto} mm) by ${engineer} on ${new Date().toISOString().slice(0, 10)}`);

  return {
    record: await getLatestSelection(revisionId),
    recalculations: rerunOutcome,
    reports,
  };
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
