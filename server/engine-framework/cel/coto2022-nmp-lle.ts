// ═══════════════════════════════════════════════════════════════════════════════
// CEL — Coto 2022 Governed Multicomponent LLE Dataset & Theoretical-Stage
//       Calculation (NMP / hydrocarbon system)
//
// Source paper (controlled copy: attached_assets/Extraction_of_aromatic_and_
// polyaromatic_compounds_with_NMP_1786368615037.pdf):
//   B. Coto, I. Suárez, M.J. Tenorio, S. Nieto, N. Alvarez, J.J. Espada,
//   "Extraction of aromatic and polyaromatic compounds with NMP: Experimental
//   and model description", Fluid Phase Equilibria 554 (2022) 113293.
//
// GOVERNANCE (binding — approved by engineering direction 2026-08-10):
//  • Table 3 tie-line phase compositions (17 rows: 13 xylene-family +
//    4 toluene-family, mole fractions, 298.15 K, 101.6 kPa, u(x) = 0.003)
//    are Controlled Literature equilibrium data, transcribed VERBATIM from
//    the paper's PDF text layer. They are never modified, smoothed, or
//    extended.
//  • The paper's r (NMP/SC mol/mol) values and Table 2 feed-family labels are
//    EXCLUDED from all calculations: full material-balance closure of
//    Table 2 feeds + r + Table 3 phases fails (aromatic bracket test fails
//    for 12/17 rows; residuals up to 52×u(x); no basis reinterpretation
//    closes). r itself was verified internally consistent with the paper's
//    experimental g/g series — the imbalance lies between Table 2 and
//    Table 3. Verification record: .agents/outputs/coto2022-governed-tielines.md
//  • Interpolation coordinate is x1R (raffinate n-dodecane mole fraction) —
//    an intrinsic phase coordinate, verified monotone for aromatic
//    components. Piecewise-linear interpolation of BOTH phase composition
//    vectors simultaneously. NO extrapolation beyond the tabulated x1R range.
//  • Constant-Ki, Kremser, and independent-per-component McCabe–Thiele
//    treatments are PROHIBITED: the data disprove constant Ki (spans up to
//    4.2×) and show strong mutual solubility (NMP in raffinate 5.0–15.8
//    mol %, non-NMP in extract 27.2–64.9 mol %), so constant-flow methods
//    are invalid. Stage stepping uses variable-flow envelope balances
//    (Hunter–Nash difference-point form) tracking total molar flows.
//  • Temperature governance: tie-lines are 298.15 K ONLY and are used AS-IS —
//    never temperature-corrected or extrapolated. A design temperature
//    outside 298.15 K ± 0.5 K does NOT suppress the calculation; the result
//    is downgraded to "Preliminary / Outside Experimental Temperature Range /
//    Pending RRBO-NMP Validation" (approved Controlled-Literature RRBO
//    Surrogate LLE Model use). No UNIFAC or other model extrapolation is permitted
//    (paper's best model, Mod. UNIFAC Dortmund, shows σ_K,par ≈ 31 % of the
//    max K_par at the calibration temperature itself — Table 4).
//  • Composition validity: raffinate locus x1R ∈ [0.641, 0.878]. Any stage
//    composition outside this envelope fails closed as "Outside Experimental
//    Composition Range — Pending Validation", stating the exact limit.
//  • Dataset caveat (declared, unresolved): a systematic NMR aromatics-
//    quantification bias in the source cannot be excluded (it would not
//    break tie-line internal consistency). Carried on every result.
//  • Pseudo-component mapping (RRBO classes → paper surrogates) is a
//    governed screening analogy, NOT measured RRBO equilibrium:
//      saturates → n-dodecane (1), mono-aromatics → 1,4-xylene (3),
//      di-aromatics → 1-methylnaphtalene (4), poly-aromatics → pyrene (5),
//      solvent → NMP (6). Toluene-family rows are retained as controlled
//      data but not used by the xylene-family interpolation.
//    RRBO class molecular weights are GOVERNED INPUTS (GPC/MS or engineer-
//    tagged) — never assumed by this module.
// ═══════════════════════════════════════════════════════════════════════════════

export const COTO_2022_CITATION =
  'B. Coto, I. Suárez, M.J. Tenorio, S. Nieto, N. Alvarez, J.J. Espada, "Extraction of aromatic and polyaromatic compounds with NMP: Experimental and model description", Fluid Phase Equilibria 554 (2022) 113293, Table 3';

export const COTO_2022_DATASET_ID = 'COTO2022_TABLE3_NMP_LLE';
export const COTO_2022_DATASET_VERSION = '1.0.0';

/** Experimental temperature of every tie-line (K). The ONLY valid temperature. */
export const COTO_2022_TEMPERATURE_K = 298.15;
/** Acceptance half-window around the experimental temperature (K). Chosen as
 *  10 × u(T) = 0.5 K — an instrument-uncertainty allowance, NOT an
 *  extrapolation window. */
export const COTO_2022_TEMPERATURE_TOLERANCE_K = 0.5;
/** Reported standard uncertainty of every mole fraction. */
export const COTO_2022_UX = 0.003;
/** Balance-closure gate: every non-closing component residual (mole fraction)
 *  must satisfy |residual| ≤ 3 × u(x). Beyond this the multicomponent balance
 *  has NOT closed and the result fails closed — residuals are a gate, not a
 *  footnote. Total-flow closure gate: |E − (F+S−R_N)| / F ≤ 1 %. */
export const COTO_2022_RESIDUAL_TOLERANCE = 3 * COTO_2022_UX; // 0.009
export const COTO_2022_TOTAL_FLOW_REL_TOLERANCE = 0.01;

/** Pseudo-component order used throughout: index 0..4. */
export const COTO_COMPONENTS = ['n-dodecane', '1,4-xylene', '1-methylnaphtalene', 'pyrene', 'NMP'] as const;
export const COTO_COMPONENT_ROLES = ['saturates (RRBO)', 'mono-aromatics (RRBO)', 'di-aromatics (RRBO)', 'poly-aromatics (RRBO)', 'solvent'] as const;

/** Pure-surrogate molecular weights (g/mol) — exact literature compound MWs,
 *  used ONLY for the paper's own compounds (e.g. NMP molar conversion).
 *  RRBO class MWs are governed inputs and must NOT default to these. */
export const SURROGATE_MW = { c12: 170.34, xylene: 106.17, methylnaphtalene: 142.20, pyrene: 202.25, nmp: 99.13 } as const;

export interface TieLine {
  /** Raffinate mole fractions [c12, xyl, men, pyr, nmp] — sums to 1.000 */
  x: readonly number[];
  /** Extract mole fractions [c12, xyl, men, pyr, nmp] — sums to 1.000 */
  y: readonly number[];
  /** Position in the paper's Table 3 (1-based, print order) — provenance only */
  tableOrder: number;
  /** Paper's nominal r (mol NMP / mol SC) — provenance annotation ONLY.
   *  EXCLUDED from all calculations (governed finding: feed/phase closure fails). */
  nominalR: number;
}

/** Xylene-family tie-lines (13), sorted ascending by x1R — the governed
 *  interpolation family. Verbatim from Table 3. */
export const COTO_2022_XYLENE_TIELINES: readonly TieLine[] = [
  { x: [0.641, 0.131, 0.050, 0.020, 0.158], y: [0.392, 0.142, 0.077, 0.038, 0.351], tableOrder: 2,  nominalR: 0.7 },
  { x: [0.651, 0.134, 0.047, 0.021, 0.147], y: [0.320, 0.150, 0.081, 0.050, 0.399], tableOrder: 5,  nominalR: 0.7 },
  { x: [0.664, 0.136, 0.055, 0.035, 0.110], y: [0.250, 0.162, 0.105, 0.095, 0.388], tableOrder: 9,  nominalR: 0.4 },
  { x: [0.725, 0.109, 0.037, 0.018, 0.111], y: [0.252, 0.141, 0.080, 0.064, 0.463], tableOrder: 10, nominalR: 0.8 },
  { x: [0.800, 0.092, 0.022, 0.008, 0.078], y: [0.206, 0.113, 0.062, 0.036, 0.583], tableOrder: 6,  nominalR: 1.5 },
  { x: [0.813, 0.082, 0.020, 0.009, 0.076], y: [0.190, 0.113, 0.063, 0.048, 0.586], tableOrder: 11, nominalR: 1.4 },
  { x: [0.822, 0.085, 0.022, 0.006, 0.065], y: [0.240, 0.124, 0.069, 0.017, 0.550], tableOrder: 3,  nominalR: 1.5 },
  { x: [0.857, 0.062, 0.015, 0.005, 0.061], y: [0.181, 0.094, 0.057, 0.024, 0.644], tableOrder: 7,  nominalR: 2.2 },
  { x: [0.858, 0.067, 0.015, 0.005, 0.055], y: [0.157, 0.098, 0.052, 0.026, 0.667], tableOrder: 4,  nominalR: 2.2 },
  { x: [0.860, 0.068, 0.018, 0.004, 0.050], y: [0.158, 0.104, 0.058, 0.014, 0.666], tableOrder: 1,  nominalR: 2.2 },
  { x: [0.863, 0.058, 0.013, 0.005, 0.061], y: [0.150, 0.085, 0.045, 0.033, 0.687], tableOrder: 12, nominalR: 2.3 },
  { x: [0.877, 0.050, 0.011, 0.005, 0.057], y: [0.174, 0.093, 0.038, 0.021, 0.674], tableOrder: 8,  nominalR: 3.0 },
  { x: [0.878, 0.048, 0.010, 0.004, 0.060], y: [0.135, 0.073, 0.037, 0.027, 0.728], tableOrder: 13, nominalR: 3.0 },
] as const;

/** Toluene-family tie-lines (4) — retained as Controlled Literature; NOT part
 *  of the xylene-family interpolation. Component order here:
 *  [c12, toluene, men, pyr, nmp]. */
export const COTO_2022_TOLUENE_TIELINES: readonly TieLine[] = [
  { x: [0.645, 0.106, 0.048, 0.020, 0.181], y: [0.397, 0.142, 0.072, 0.032, 0.357], tableOrder: 14, nominalR: 0.7 },
  { x: [0.783, 0.080, 0.025, 0.007, 0.105], y: [0.210, 0.113, 0.061, 0.028, 0.588], tableOrder: 15, nominalR: 1.4 },
  { x: [0.861, 0.053, 0.016, 0.005, 0.065], y: [0.177, 0.088, 0.049, 0.022, 0.664], tableOrder: 16, nominalR: 2.1 },
  { x: [0.894, 0.032, 0.009, 0.003, 0.062], y: [0.145, 0.054, 0.030, 0.013, 0.758], tableOrder: 17, nominalR: 4.2 },
] as const;

/** Governed raffinate-locus envelope (from the data, NOT from r). */
export const COTO_2022_X1R_MIN = COTO_2022_XYLENE_TIELINES[0].x[0];       // 0.641
export const COTO_2022_X1R_MAX = COTO_2022_XYLENE_TIELINES[COTO_2022_XYLENE_TIELINES.length - 1].x[0]; // 0.878

const N_COMP = 5;
const AR_LO = 1, AR_HI = 3; // aromatic component index range (inclusive): xyl, men, pyr

function sum(v: readonly number[]): number { return v.reduce((a, b) => a + b, 0); }
function aromatics(v: readonly number[]): number { let s = 0; for (let i = AR_LO; i <= AR_HI; i++) s += v[i]; return s; }
function normalize(v: number[]): number[] { const s = sum(v); return v.map((c) => c / s); }
function round(v: number, dp: number): number { const f = 10 ** dp; return Math.round(v * f) / f; }

export interface TieLineInterpolation {
  x1R: number;
  raffinate: number[];
  extract: number[];
  bracket: { lowerTableOrder: number; upperTableOrder: number; fraction: number };
}

/** Piecewise-linear interpolation of BOTH phases at raffinate coordinate x1R.
 *  Fails closed (throws EnvelopeError) outside the governed x1R envelope. */
export class CotoEnvelopeError extends Error {
  constructor(
    public readonly limit: string,
    public readonly detail: string,
  ) { super(`${limit}: ${detail}`); this.name = 'CotoEnvelopeError'; }
}

export function interpolateTieLine(x1R: number, rows: readonly TieLine[] = COTO_2022_XYLENE_TIELINES): TieLineInterpolation {
  const x1Min = rows[0].x[0];
  const x1Max = rows[rows.length - 1].x[0];
  if (!Number.isFinite(x1R)) throw new CotoEnvelopeError('Invalid coordinate', `x1R = ${x1R} is not a finite number`);
  if (x1R < x1Min - 1e-12 || x1R > x1Max + 1e-12) {
    throw new CotoEnvelopeError(
      'Outside Experimental Composition Range — Pending Validation',
      `raffinate x1R = ${x1R.toFixed(4)} is outside the governed tie-line envelope x1R ∈ [${x1Min}, ${x1Max}]. No composition extrapolation is permitted.`,
    );
  }
  const clamped = Math.min(Math.max(x1R, x1Min), x1Max);
  let i = rows.findIndex((r) => r.x[0] >= clamped);
  if (i <= 0) i = 1;
  const lo = rows[i - 1], hi = rows[i];
  const f = hi.x[0] > lo.x[0] ? (clamped - lo.x[0]) / (hi.x[0] - lo.x[0]) : 0;
  const raff = normalize(lo.x.map((a, k) => a + f * (hi.x[k] - a)));
  const ext = normalize(lo.y.map((a, k) => a + f * (hi.y[k] - a)));
  return { x1R: clamped, raffinate: raff, extract: ext, bracket: { lowerTableOrder: lo.tableOrder, upperTableOrder: hi.tableOrder, fraction: f } };
}

/** Find the locus x1R whose raffinate total-aromatics equals the target
 *  (monotone decreasing in x1R — verified). Fails closed outside envelope. */
export function locusX1RForAromatics(targetAromaticsMole: number, rows: readonly TieLine[] = COTO_2022_XYLENE_TIELINES): number {
  const x1Min = rows[0].x[0];
  const x1Max = rows[rows.length - 1].x[0];
  const arMin = aromatics(rows[rows.length - 1].x); // at x1R max
  const arMax = aromatics(rows[0].x);               // at x1R min
  if (targetAromaticsMole < arMin - 1e-12 || targetAromaticsMole > arMax + 1e-12) {
    throw new CotoEnvelopeError(
      'Outside Experimental Composition Range — Pending Validation',
      `target raffinate aromatics ${targetAromaticsMole.toFixed(4)} (mole fraction) is outside the governed raffinate-locus range [${arMin.toFixed(3)}, ${arMax.toFixed(3)}] (x1R ∈ [${x1Min}, ${x1Max}]). No extrapolation is permitted.`,
    );
  }
  // bisection on x1R
  let lo = x1Min, hi = x1Max;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    const ar = aromatics(interpolateTieLine(mid, rows).raffinate);
    if (ar > targetAromaticsMole) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Variable-flow counter-current stage calculation ──────────────────────────

export interface StageTraceEntry {
  stageFromRaffinateEnd: number;
  raffinateLeaving: { flow_mol: number; x: number[] };
  extractLeaving: { flow_mol: number; y: number[]; equilibriumBracket: TieLineInterpolation['bracket'] };
  passingRaffinateFromAbove: { flow_mol: number; x: number[] };
  /** Component residuals (mole fraction) of the locus-closure check on the
   *  three components NOT used to close the balance (closed on C12 + NMP). */
  locusConsistencyResiduals: { component: string; residual: number }[];
  aromaticsInPassingStream: number;
}

export interface GovernedNtInput {
  temperatureK: number;
  /** Feed pseudo-component mole fractions [saturates, mono, di, poly, nmp] — must sum to 1 ±0.005 */
  feedMoleFractions: number[];
  /** Design molar solvent ratio: mol NMP entering / mol feed entering */
  solventMolarRatio: number;
  /** Target raffinate total aromatics (mole fraction) — anchored on the tie-line locus */
  targetRaffinateAromaticsMole: number;
  /** NMP purity of the solvent make-up, mole fraction NMP (recycle aromatics reduce it) */
  solventNmpMoleFraction?: number; // default 1.0 (pure)
  /** Optional alternative equilibrium basis: a model-generated tie-line family
   *  AT the design temperature (governed NRTL τ(T) model). When provided, the
   *  cascade runs unchanged on this family (composition interpolation-only
   *  within ITS envelope) and the 298.15 K temperature-window logic is
   *  bypassed — the equilibrium is by construction at the design temperature.
   *  Classification/labelling of the model basis is the CALLER's duty. */
  equilibriumBasis?: {
    tieLines: readonly TieLine[]; // sorted ascending by x[0]
    datasetId: string;
    datasetVersion: string;
    citation: string;
    basisLabel: string;
  };
}

export interface GovernedNtResult {
  datasetId: string;
  datasetVersion: string;
  citation: string;
  status: 'calculated' | 'not_calculable';
  /** Exact limit exceeded when not_calculable (fail-closed statement). */
  limitExceeded?: { limit: string; detail: string };
  /** Temperature governance: design T inside the 298.15 K experimental window,
   *  outside it (tie-lines used as-is at 298.15 K; NEVER temperature-corrected
   *  or extrapolated), or 'model_at_design_temperature' — the equilibrium came
   *  from a governed temperature-dependent model evaluated AT the design
   *  temperature (caller labels interpolation/extrapolation status). */
  temperatureStatus?: 'in_range' | 'outside_range_preliminary' | 'model_at_design_temperature';
  /** Exact user-facing statement when temperatureStatus = outside_range_preliminary. */
  temperatureStatement?: string;
  theoreticalStages?: number;        // fractional N_T
  theoreticalStagesRounded?: number; // ceil
  /** Present when the feed entered a stage whose fractional utilisation could
   *  not be resolved on the governed locus — N_T reported whole (conservative). */
  feedStageNote?: string;
  governingMeasure: 'total raffinate aromatics (mole fraction)';
  stageTrace: StageTraceEntry[];
  spec?: { x1R: number; raffinate: number[]; equilibriumExtract: number[]; bracket: TieLineInterpolation['bracket'] };
  balances?: {
    basisRaffinateFlow_mol: number;
    solventFlow_mol: number;
    impliedFeedFlow_mol: number;
    impliedSolventMolarRatio: number;
    designSolventMolarRatio: number;
    ratioClosureRelError: number;
  };
  method: string;
  exclusions: string[];
  caveats: string[];
}

const METHOD_TEXT =
  'Counter-current cascade, variable total molar flows. Envelope balances (stages j..N): E_j = R_{j-1} + S − R_N; R_{j-1}·x_{i,j-1} = R_N·x_{i,N} + E_j·y_{i,j} − S·y_{S,i}. Equilibrium from governed x1R tie-line interpolation (both phases simultaneously). Per stage the passing stream is closed on n-dodecane + NMP with the raffinate-locus constraint; xylene/1-methylnaphtalene/pyrene balances are reported as consistency residuals. Solvent flow S is iterated (secant) so the implied feed satisfies the design molar solvent ratio. Fractional stage by linear crossing of the feed total-aromatics.';

const EXCLUSIONS = [
  'Paper r (NMP/SC) values and Table 2 feed-family labels excluded — feed/phase mass-balance closure fails (verified 2026-08-10).',
  'Constant Ki prohibited (data span up to 4.2×).',
  'Kremser prohibited (variable flows; PD-009 retired).',
  'Independent-per-component McCabe–Thiele prohibited (multicomponent coupling proven by data).',
  'No composition extrapolation beyond x1R ∈ [0.641, 0.878].',
  'No temperature correction or extrapolation of the 298.15 K tie-lines (Mod. UNIFAC Dortmund rejected: σ_K,par ≈ 31 % at calibration temperature). Off-temperature designs use the tie-lines as-is and the result is Preliminary — Pending RRBO/NMP Validation.',
];

const CAVEATS = [
  'Pseudo-component mapping (RRBO classes → n-dodecane/1,4-xylene/1-methylnaphtalene/pyrene) is a governed screening analogy, not measured RRBO equilibrium.',
  'Source-dataset caveat: Table 2 feeds and Table 3 phases fail material-balance closure; a systematic NMR aromatics-quantification bias in the source cannot be excluded. Tie-lines retained as internally consistent equilibrium data.',
  'Non-monotone pairs within u(x)=0.003 exist in x6R and x1E columns; piecewise-linear treatment carries the raw scatter without smoothing.',
];

export function computeGovernedTheoreticalStages(input: GovernedNtInput): GovernedNtResult {
  const basis = input.equilibriumBasis;
  const rows = basis?.tieLines ?? COTO_2022_XYLENE_TIELINES;
  const X1_MIN = rows[0].x[0];
  const X1_MAX = rows[rows.length - 1].x[0];
  const interp = (v: number) => interpolateTieLine(v, rows);
  const base: Pick<GovernedNtResult, 'datasetId' | 'datasetVersion' | 'citation' | 'governingMeasure' | 'stageTrace' | 'method' | 'exclusions' | 'caveats' | 'temperatureStatus' | 'temperatureStatement'> = {
    datasetId: basis?.datasetId ?? COTO_2022_DATASET_ID,
    datasetVersion: basis?.datasetVersion ?? COTO_2022_DATASET_VERSION,
    citation: basis?.citation ?? COTO_2022_CITATION,
    governingMeasure: 'total raffinate aromatics (mole fraction)' as const,
    stageTrace: [] as StageTraceEntry[],
    method: METHOD_TEXT,
    exclusions: EXCLUSIONS,
    caveats: CAVEATS,
  };
  const fail = (limit: string, detail: string): GovernedNtResult =>
    ({ ...base, status: 'not_calculable', limitExceeded: { limit, detail } });

  // ── Temperature governance (approved use: Controlled-Literature RRBO
  // Surrogate LLE Model — Preliminary / Outside Experimental Temperature
  // Range / Pending RRBO-NMP Validation). A design temperature outside the
  // 298.15 K experimental window does NOT by itself suppress the calculation:
  // the 298.15 K tie-lines are used AS-IS (never temperature-corrected or
  // extrapolated) and the result is downgraded to Preliminary. Composition-
  // envelope violations and missing inputs still fail closed. ────────────────
  if (!Number.isFinite(input.temperatureK)) return fail('Invalid input', `temperatureK = ${input.temperatureK} is not finite`);
  if (basis) {
    // Model-generated equilibrium AT the design temperature: the 298.15 K
    // experimental-window logic does not apply. The caller carries the
    // interpolation/extrapolation classification.
    base.temperatureStatus = 'model_at_design_temperature';
  } else {
    const temperatureInRange = Math.abs(input.temperatureK - COTO_2022_TEMPERATURE_K) <= COTO_2022_TEMPERATURE_TOLERANCE_K;
    const temperatureStatus: 'in_range' | 'outside_range_preliminary' = temperatureInRange ? 'in_range' : 'outside_range_preliminary';
    const temperatureStatement = temperatureInRange
      ? undefined
      : `NT calculated using 298.15 K controlled-literature equilibrium data; design temperature ${input.temperatureK.toFixed(2)} K is outside the experimental temperature range. Result is Preliminary — Pending RRBO/NMP Validation.`;
    base.temperatureStatus = temperatureStatus;
    if (temperatureStatement) base.temperatureStatement = temperatureStatement;
  }

  // ── Limit 2: feed composition sanity ────────────────────────────────────────
  const zF = input.feedMoleFractions;
  if (!Array.isArray(zF) || zF.length !== N_COMP || zF.some((v) => !Number.isFinite(v) || v < 0)) {
    return fail('Invalid input', 'feedMoleFractions must be 5 non-negative finite mole fractions [saturates, mono, di, poly, NMP]');
  }
  if (Math.abs(sum(zF) - 1) > 0.005) {
    return fail('Invalid input', `feedMoleFractions sum to ${sum(zF).toFixed(4)} — must sum to 1.000 ± 0.005`);
  }
  const aromF = aromatics(zF);

  const yS = [0, 0, 0, 0, 1];
  const sPurity = input.solventNmpMoleFraction ?? 1.0;
  if (!(sPurity > 0 && sPurity <= 1)) return fail('Invalid input', `solventNmpMoleFraction must be in (0, 1], got ${sPurity}`);
  if (sPurity < 1) {
    // Recycle aromatics in solvent: distribute the impurity across aromatics is
    // NOT permitted without governed speciation — fail closed rather than assume.
    return fail(
      'Governed input incomplete',
      `solvent NMP mole fraction ${sPurity} < 1: aromatic speciation of the recycled-solvent impurity is a governed input that is not yet available. Provide validated recycle-solvent composition or use pure-NMP basis with the impurity carried as a declared assumption at C1.`,
    );
  }

  // ── Limit 3: raffinate spec on the governed locus ───────────────────────────
  let specX1R: number;
  try { specX1R = locusX1RForAromatics(input.targetRaffinateAromaticsMole, rows); }
  catch (e) { if (e instanceof CotoEnvelopeError) return fail(e.limit, e.detail); throw e; }
  const spec = interp(specX1R);
  const xN = spec.raffinate;
  const aromSpec = aromatics(xN);
  if (aromF <= aromSpec + 1e-9) {
    return fail('Invalid design case', `feed total aromatics ${aromF.toFixed(4)} (mole) must exceed the raffinate target ${aromSpec.toFixed(4)} — no separation duty exists.`);
  }

  const rDesign = input.solventMolarRatio;
  if (!(Number.isFinite(rDesign) && rDesign > 0)) return fail('Invalid input', `solventMolarRatio must be > 0, got ${rDesign}`);

  // ── Cascade for a given solvent flow S (basis R_N = 100 mol) ───────────────
  const RN = 100;
  interface CascadeOut { crossed: boolean; nT?: number; trace: StageTraceEntry[]; impliedFeed?: number; totalFlowRelResidual?: number; offEnvelope?: { stage: number; x1: number }; feedStageNote?: string; }
  const runCascade = (S: number): CascadeOut => {
    const trace: StageTraceEntry[] = [];
    let yCurr = spec.extract.slice();
    let bracket = spec.bracket;
    let aromPrev = aromSpec;
    let xCurr = xN.slice();
    let Rcurr = RN;
    for (let stage = 1; stage <= 25; stage++) {
      // Solve R_prev with the locus constraint: x_prev(NMP) − locus_NMP(x_prev(C12)) = 0
      const xPrevOf = (Rp: number): { xp: number[]; E: number } => {
        const E = Rp + S - RN;
        const xp = normalize(Array.from({ length: N_COMP }, (_, i) => (RN * xN[i] + E * yCurr[i] - S * yS[i]) / Rp));
        return { xp, E };
      };
      const g = (Rp: number): { val: number | null; xp: number[]; E: number } => {
        const { xp, E } = xPrevOf(Rp);
        if (E <= 0) return { val: null, xp, E };
        if (!xp.every((v) => Number.isFinite(v))) return { val: null, xp, E };
        if (xp[0] < X1_MIN || xp[0] > X1_MAX) return { val: null, xp, E };
        return { val: xp[4] - interp(xp[0]).raffinate[4], xp, E };
      };
      // bracket search on R_prev
      let sol: number | null = null;
      let prev: { Rp: number; val: number } | null = null;
      let offEnv: { Rp: number; xp: number[] } | null = null;
      const RLO = RN * 0.2, RHI = RN * 6;
      for (let k = 0; k <= 1600; k++) {
        const Rp = RLO + (k * (RHI - RLO)) / 1600;
        const { val, xp } = g(Rp);
        if (val === null) { if (Number.isFinite(xp[0]) && xp[0] > 0) offEnv = { Rp, xp }; prev = null; continue; }
        if (prev && prev.val * val <= 0) {
          let a = prev.Rp, b = Rp;
          for (let it = 0; it < 60; it++) {
            const m = (a + b) / 2;
            const vm = g(m).val;
            if (vm === null) { a = m; continue; }
            if ((vm > 0) === (prev.val > 0)) a = m; else b = m;
          }
          sol = (a + b) / 2;
          break;
        }
        prev = { Rp, val };
      }
      if (sol === null) {
        // No passing stream can be placed on the governed raffinate locus at
        // this stage — the FEED must enter this stage directly (the feed
        // point is a design input, not an equilibrium point, so this involves
        // no tie-line extrapolation). Solve the implied feed flow F from the
        // stages j..N envelope balance closed on n-dodecane + NMP (the
        // verified hand-calculation closure):
        //   F·zF_0 − E·y_0 = RN·xN_0
        //   F·zF_4 − E·y_4 = RN·xN_4 − S
        // then report all other component balances and total closure as
        // residuals. If the solution is infeasible, the design separation
        // depth is outside the governed composition envelope.
        const det = -zF[0] * yCurr[4] + yCurr[0] * zF[4];
        if (Math.abs(det) > 1e-12) {
          const b0 = RN * xN[0];
          const b4 = RN * xN[4] - S;
          const F = (-b0 * yCurr[4] + yCurr[0] * b4) / det;
          const E = (zF[0] * b4 - zF[4] * b0) / det;
          const totalResidual = E - (F + S - RN);
          // Feasibility of the implied flows is checked on the UNROUNDED
          // physical values BEFORE any display rounding: flows must be finite,
          // positive, and physically plausible (the feed cannot be smaller
          // than the raffinate product nor absurdly larger than the basis —
          // a runaway secant iterate must be rejected here, not reported).
          const flowsPlausible =
            Number.isFinite(F) && Number.isFinite(E) && F > 0 && E > 0 &&
            F >= RN * 0.5 && F <= RN * 1e3 && E <= (F + S) &&
            Number.isFinite(totalResidual);
          if (flowsPlausible && aromF > aromPrev - 1e-9) {
            const residuals = [1, 2, 3].map((i) => ({
              component: COTO_COMPONENTS[i],
              residual: round((RN * xN[i] + E * yCurr[i] - S * yS[i]) / F - zF[i], 5),
            }));
            residuals.push({ component: 'total-flow closure (mol, E − (F+S−R_N))', residual: round(totalResidual, 4) });
            trace.push({
              stageFromRaffinateEnd: stage,
              raffinateLeaving: { flow_mol: round(Rcurr, 2), x: xCurr.map((v) => round(v, 4)) },
              extractLeaving: { flow_mol: round(E, 2), y: yCurr.map((v) => round(v, 4)), equilibriumBracket: bracket },
              passingRaffinateFromAbove: { flow_mol: round(F, 2), x: zF.map((v) => round(v, 4)) },
              locusConsistencyResiduals: residuals,
              aromaticsInPassingStream: round(aromF, 4),
            });
            return {
              crossed: true,
              nT: stage,
              trace,
              impliedFeed: F,
              totalFlowRelResidual: totalResidual / F,
              feedStageNote: `Feed enters stage ${stage} (counted from the raffinate end) directly; the fractional utilisation of this stage cannot be resolved on the governed tie-line locus (extrapolation prohibited), so N_T is reported as the whole stage count — conservative.`,
            };
          }
        }
        return { crossed: false, trace, offEnvelope: offEnv ? { stage, x1: offEnv.xp[0] } : { stage, x1: NaN } };
      }
      const { xp, E } = xPrevOf(sol);
      // consistency residuals on the non-closing components (xyl, men, pyr)
      const locus = interp(xp[0]).raffinate;
      const residuals = [1, 2, 3].map((i) => ({ component: COTO_COMPONENTS[i], residual: round(xp[i] - locus[i], 5) }));
      const arom = aromatics(xp);
      trace.push({
        stageFromRaffinateEnd: stage,
        raffinateLeaving: { flow_mol: round(Rcurr, 2), x: xCurr.map((v) => round(v, 4)) },
        extractLeaving: { flow_mol: round(E, 2), y: yCurr.map((v) => round(v, 4)), equilibriumBracket: bracket },
        passingRaffinateFromAbove: { flow_mol: round(sol, 2), x: xp.map((v) => round(v, 4)) },
        locusConsistencyResiduals: residuals,
        aromaticsInPassingStream: round(arom, 4),
      });
      if (arom >= aromF) {
        // Crossing within this stage step: fractional stage by linear crossing
        // of feed total-aromatics between successive governed passing streams.
        // The implied feed flow is solved from the same C12+NMP 2×2 closure
        // (feed entering above this stage), for the solvent-ratio iteration.
        const frac = (aromF - aromPrev) / (arom - aromPrev);
        const det = -zF[0] * yCurr[4] + yCurr[0] * zF[4];
        let F = sol;
        if (Math.abs(det) > 1e-12) {
          const b0 = RN * xN[0];
          const b4 = RN * xN[4] - S;
          const cand = (-b0 * yCurr[4] + yCurr[0] * b4) / det;
          if (Number.isFinite(cand) && cand >= RN * 0.5 && cand <= RN * 1e3) F = cand;
        }
        return { crossed: true, nT: stage - 1 + frac, trace, impliedFeed: F };
      }
      aromPrev = arom;
      xCurr = xp;
      Rcurr = sol;
      const eq = interp(xp[0]);
      yCurr = eq.extract;
      bracket = eq.bracket;
    }
    return { crossed: false, trace };
  };

  // ── Secant iteration on S to honor the design molar solvent ratio ──────────
  // Implied ratio = S / impliedFeed. Design ratio given per mol feed.
  const evalRatio = (S: number): { out: CascadeOut; ratio?: number } => {
    const out = runCascade(S);
    if (out.crossed && out.impliedFeed) return { out, ratio: S / out.impliedFeed };
    return { out };
  };
  let S0 = rDesign * RN, S1 = rDesign * RN * 1.5;
  let best: { out: CascadeOut; ratio?: number; S: number } | null = null;
  let e0: number | null = null;
  let r0 = evalRatio(S0);
  if (r0.ratio !== undefined) { e0 = r0.ratio - rDesign; best = { ...r0, S: S0 }; }
  for (let it = 0; it < 40 && S1 > 0; it++) {
    const r1 = evalRatio(S1);
    if (r1.ratio === undefined) { S1 = (S0 + S1) / 2; continue; }
    const e1 = r1.ratio - rDesign;
    if (best === null || Math.abs(e1) < Math.abs((best.ratio ?? Infinity) - rDesign)) best = { ...r1, S: S1 };
    if (Math.abs(e1 / rDesign) < 1e-4) break;
    if (e0 === null) { e0 = e1; const t = S1; S1 = S1 * (1 - 0.5 * Math.sign(e1)); S0 = t; continue; }
    const dS = (S1 - S0) * (e1 / (e1 - e0 || 1e-12));
    S0 = S1; e0 = e1; S1 = Math.max(S1 - dS, 1e-6);
  }

  // ── Residual gate: the multicomponent balance must CLOSE, not merely be
  // reported. Any component residual beyond 3·u(x), or total-flow closure
  // beyond 1 % of the implied feed, fails the run closed. ──────────────────
  if (best && best.out.crossed && best.out.nT !== undefined && best.ratio !== undefined) {
    const violations: string[] = [];
    for (const t of best.out.trace) {
      for (const r of t.locusConsistencyResiduals) {
        // Total-flow closure is checked on the UNROUNDED relative residual
        // (|E − (F+S−R_N)| / F) captured before display rounding — never on
        // the rounded trace value against an absolute-scaled tolerance.
        if (r.component.startsWith('total-flow')) continue;
        if (Math.abs(r.residual) > COTO_2022_RESIDUAL_TOLERANCE) {
          violations.push(`stage ${t.stageFromRaffinateEnd}: ${r.component} residual ${r.residual} exceeds tolerance 3·u(x) = ${COTO_2022_RESIDUAL_TOLERANCE}`);
        }
      }
    }
    const relTotal = best.out.totalFlowRelResidual;
    if (relTotal !== undefined && (!Number.isFinite(relTotal) || Math.abs(relTotal) > COTO_2022_TOTAL_FLOW_REL_TOLERANCE)) {
      violations.push(`total-flow closure |E − (F+S−R_N)| / F = ${Number.isFinite(relTotal) ? Math.abs(relTotal).toExponential(3) : 'non-finite'} exceeds tolerance ${COTO_2022_TOTAL_FLOW_REL_TOLERANCE * 100} % of implied feed (unrounded check)`);
    }
    if (violations.length > 0) {
      return {
        ...base,
        status: 'not_calculable',
        stageTrace: best.out.trace,
        spec: { x1R: round(specX1R, 4), raffinate: xN.map((v) => round(v, 4)), equilibriumExtract: spec.extract.map((v) => round(v, 4)), bracket: spec.bracket },
        limitExceeded: {
          limit: 'Multicomponent Balance Closure Outside Tolerance — Pending Validation',
          detail: `the variable-flow cascade solution does not close all five component balances within the governed tolerance (3·u(x) = ${COTO_2022_RESIDUAL_TOLERANCE} mole fraction per component; total-flow ≤ ${COTO_2022_TOTAL_FLOW_REL_TOLERANCE * 100} % of implied feed): ${violations.join('; ')}. N_T is Not Calculable — the design point's multicomponent behaviour is not representable on the governed tie-line locus.`,
        },
      };
    }
  }

  if (!best || !best.out.crossed || best.ratio === undefined || best.out.nT === undefined) {
    const probe = runCascade(rDesign * RN);
    const detail = probe.offEnvelope
      ? `stage stepping left the governed raffinate-locus envelope at stage ${probe.offEnvelope.stage} (computed passing-stream x1R = ${Number.isFinite(probe.offEnvelope.x1) ? probe.offEnvelope.x1.toFixed(4) : 'not on locus'}; governed envelope x1R ∈ [${X1_MIN}, ${X1_MAX}]) before reaching the feed composition. The design separation depth exceeds the governed composition envelope of the equilibrium basis.`
      : 'no counter-current solution reaches the feed composition within the governed envelope at the design solvent ratio.';
    return { ...base, status: 'not_calculable', stageTrace: probe.trace, spec: { x1R: round(specX1R, 4), raffinate: xN.map((v) => round(v, 4)), equilibriumExtract: spec.extract.map((v) => round(v, 4)), bracket: spec.bracket }, limitExceeded: { limit: 'Outside Experimental Composition Range — Pending Validation', detail } };
  }

  const nT = best.out.nT;
  return {
    ...base,
    status: 'calculated',
    theoreticalStages: round(nT, 2),
    theoreticalStagesRounded: Math.ceil(nT - 1e-9),
    ...(best.out.feedStageNote ? { feedStageNote: best.out.feedStageNote } : {}),
    stageTrace: best.out.trace,
    spec: { x1R: round(specX1R, 4), raffinate: xN.map((v) => round(v, 4)), equilibriumExtract: spec.extract.map((v) => round(v, 4)), bracket: spec.bracket },
    balances: {
      basisRaffinateFlow_mol: RN,
      solventFlow_mol: round(best.S, 3),
      impliedFeedFlow_mol: round(best.out.impliedFeed!, 3),
      impliedSolventMolarRatio: round(best.ratio, 4),
      designSolventMolarRatio: rDesign,
      ratioClosureRelError: round(Math.abs(best.ratio - rDesign) / rDesign, 6),
    },
  };
}
