// ═══════════════════════════════════════════════════════════════════════════════
// CEL — Direct NRTL Counter-Current N_T Solver — LLX / NMP–RRBO
//
// PURPOSE: Replaces the finite-locus Hunter-Nash solver for temperature-
//   extrapolation conditions. nrtlFlash() is called directly per equilibrium
//   stage for any composition, eliminating the x1R-envelope restriction that
//   produced degenerate N_T = 1 for all conditions when the feed n-dodecane
//   mole fraction (0.881) exceeded the NRTL model x1R_max (0.837) at 60°C.
//
// STAGE NUMBERING:
//   j = 1  →  raffinate end  (fresh NMP solvent enters below Stage 1)
//   j = N  →  feed end       (feed enters above Stage N)
//
// METHOD: Successive substitution. Each outer iteration sweeps j = N → 1:
//   • Mix incoming streams:   Mⱼ = L_{j+1}·x_{j+1} + E_{j-1}·y_{j-1}  (mol)
//   • nrtlFlash(zMⱼ, T)  →  equilibrium split (Lⱼ, xⱼ, Eⱼ, yⱼ)
//   Repeat until max|Δx|, |Δy| < 1e-10 for all stages and components.
//   Test N = 1, 2, 3, … until Stage-1 raffinate aromatics ≤ target.
//   Feed mole fractions normalized to Σ = 1 at entry.
//
// CLASSIFICATION: Every result is "Temperature Extrapolation — Preliminary /
//   Pending Validation". NRTL parameters are calibrated at 298.15 K only.
//   The extrapolation label is never removed without re-regression against
//   experimental data at or near the evaluation temperature.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  nrtlFlash,
  nrtlLnGamma,
  TLLE_MODEL_ID,
  TLLE_MODEL_VERSION,
  TLLE_MODEL_CITATION,
  TLLE_EXTRAPOLATION_CLASSIFICATION,
  TLLE_REPRODUCTION_RECORD,
} from './llx-temperature-lle-model';
import {
  GovernedNtResult,
  COTO_COMPONENTS,
} from './coto2022-nmp-lle';
import { calculateLLEAromaticQuantity } from './product-quality-basis';

// ── Solver constants ──────────────────────────────────────────────────────────

const NC          = 5;     // components: [n-C12, xylene, 1-MeNaph, pyrene, NMP]
const AR_LO       = 1;     // first aromatic index (1,4-xylene)
const AR_HI       = 3;     // last  aromatic index (pyrene)
const MAX_STAGES  = 10;    // fail closed if N_T > this
const OUTER_MAX_ITER = 500;
const OUTER_TOL   = 1e-10; // composition convergence: max|Δx|,|Δy| across all stages
const BALANCE_TOL = 1e-7;  // per-component mole balance (mol; basis F = 1 mol)
const ISOACT_TOL  = 1e-8;  // isoactivity gate: |xᵢγᴿᵢ − yᵢγᴱᵢ|

const PURE_NMP: readonly number[] = [0, 0, 0, 0, 1];

// ── Pure helpers ──────────────────────────────────────────────────────────────

function arSum(v: readonly number[]): number {
  let s = 0;
  for (let i = AR_LO; i <= AR_HI; i++) s += v[i];
  return s;
}

function normVec(v: readonly number[]): number[] {
  const s = v.reduce((a, b) => a + b, 0);
  return s > 0 ? v.map(c => c / s) : Array(NC).fill(1 / NC) as number[];
}

function r5(n: number): number { return Math.round(n * 1e5) / 1e5; }
function r8(n: number): number { return Math.round(n * 1e8) / 1e8; }

// ── Public types ──────────────────────────────────────────────────────────────

export interface NrtlDirectCascadeInput {
  temperatureK: number;
  /** Raw (un-normalized) feed mole fractions [sat, mono, di, poly, NMP]. Normalized internally. */
  feedMoleFractions: readonly number[];
  /** Molar solvent ratio: mol fresh NMP per mol feed. */
  solventMolarRatio: number;
  /** Target raffinate total aromatics (mole fraction, not percent). */
  targetRaffinateAromaticsMole: number;
}

export interface NrtlDirectStageBalanceRow {
  component: string;
  lhs_mol: number;
  rhs_mol: number;
  residual_mol: number;
  withinTol: boolean;
}

export interface NrtlDirectCascadeStageTrace {
  stageNumber: number;                     // j (1 = raffinate end = product stage)
  raffinateFlow_mol: number;
  raffinate_x: readonly number[];
  raffinateAromatics_molPct: number;
  extractFlow_mol: number;
  extract_y: readonly number[];
  extractAromatics_molPct: number;
  componentBalance: {
    label: string;
    rows: NrtlDirectStageBalanceRow[];
    totalResidual_mol: number;
    converged: boolean;
  };
  isoactivityResiduals: { component: string; residual: number; withinTol: boolean }[];
}

export interface NrtlDirectCascadeTrace {
  method: 'Direct NRTL counter-current cascade — successive substitution';
  temperatureK: number;
  feedBasis_mol: 1;
  feedMoleFractions_normalized: readonly number[];
  feedAromatics_molPct: number;
  solventBasis_mol: number;
  solventMolarRatio_mol_per_mol: number;
  targetRaffinateAromatics_molFrac: number;
  targetRaffinateAromatics_molPct: number;
  outerIterationsToConvergence: number;
  convergenceTolerance: number;
  /** Raffinate aromatics at each tested N (N=0 = feed). */
  aromaticsPerNTest: {
    N: number;
    raffinateAromatics_molFrac: number;
    raffinateAromatics_molPct: number;
    targetMet: boolean;
  }[];
  integerNT: number;
  fractionalNT: number;
  fractionalNTBasis: 'Interpolated Fractional Theoretical Stages';
  /** numerator of the interpolation: target_molPct − aromatics[N−1]_molPct (≤ 0) */
  interpolationNumerator_molPct: number;
  /** denominator: aromatics[N]_molPct − aromatics[N−1]_molPct (≤ 0) */
  interpolationDenominator_molPct: number;
  stages: NrtlDirectCascadeStageTrace[];
  overallBalance: {
    label: 'F·zF + S·zS = L₁·x₁ + E_N·y_N (basis: F = 1 mol)';
    rows: NrtlDirectStageBalanceRow[];
    totalResidual_mol: number;
    converged: boolean;
  };
  modelReproductionRecord: {
    maxAbsDev_at_calibrationT: number;
    tieLinesWithinGate: number;
    tieLinesTotal: number;
    gate: number;
    note: string;
  };
}

/** GovernedNtResult extended with the direct-cascade trace. */
export interface NrtlDirectCascadeResult extends GovernedNtResult {
  directCascadeTrace?: NrtlDirectCascadeTrace;
}

// ── Internal: converged sweep state ──────────────────────────────────────────

interface SweepState {
  Lvec: number[];     // Lvec[j] = raffinate mol leaving stage j (index 1..N)
  xvec: number[][];  // xvec[j] = raffinate composition at stage j
  Evec: number[];     // Evec[j] = extract   mol leaving stage j
  yvec: number[][];  // yvec[j] = extract   composition at stage j
  iters: number;     // outer iterations used
}

// ── Core cascade runner ───────────────────────────────────────────────────────

function runCascade(
  N: number,
  F: number, zF: readonly number[],
  S: number, zS: readonly number[],
  T: number,
  x0: readonly number[], y0: readonly number[],  // warm-start compositions
): SweepState | null {

  // Arrays indexed 0..N+1; boundaries at 0 (fresh solvent) and N+1 (feed)
  const Lvec = new Array(N + 2).fill(0) as number[];
  const xvec = Array.from({ length: N + 2 }, () => [...x0]) as number[][];
  const Evec = new Array(N + 2).fill(0) as number[];
  const yvec = Array.from({ length: N + 2 }, () => [...y0]) as number[][];

  // Immutable boundary conditions
  Lvec[N + 1] = F; xvec[N + 1] = [...zF];
  Evec[0]     = S; yvec[0]     = [...zS];

  // Crude initial flow magnitudes (corrected after first sweep)
  const beta0 = 0.5;
  const M0    = F + S;
  for (let j = 1; j <= N; j++) {
    Lvec[j] = (1 - beta0) * M0;
    Evec[j] = beta0 * M0;
  }

  let convergedAt = 0;
  for (let iter = 1; iter <= OUTER_MAX_ITER; iter++) {
    // Save previous compositions for convergence check
    const xPrev = xvec.map(v => [...v]);
    const yPrev = yvec.map(v => [...v]);

    // Sweep j = N (feed end) downto j = 1 (raffinate end)
    for (let j = N; j >= 1; j--) {
      const Lin  = j === N ? F                : Lvec[j + 1];
      const xin  = j === N ? (zF as number[]) : xvec[j + 1];
      const Ein  = j === 1 ? S                : Evec[j - 1];
      const yin  = j === 1 ? (zS as number[]) : yvec[j - 1];

      const Mj   = Lin + Ein;
      const zMj  = xin.map((v, i) => (v * Lin + yin[i] * Ein) / Mj);

      const fj   = nrtlFlash(zMj, T, xvec[j], yvec[j]);
      if (!fj.converged || fj.trivial) return null; // fail closed

      // Orient: raffinate = n-C12-rich phase (index 0)
      const isXRaff = fj.x[0] >= fj.y[0];
      const xj    = isXRaff ? fj.x : fj.y;
      const yj    = isXRaff ? fj.y : fj.x;
      const betaE = isXRaff ? fj.beta : 1 - fj.beta; // extract fraction of Mj

      Lvec[j] = (1 - betaE) * Mj;
      xvec[j] = [...xj];
      Evec[j] = betaE * Mj;
      yvec[j] = [...yj];
    }

    // Convergence: max composition change across all stages and components
    let maxDelta = 0;
    for (let j = 1; j <= N; j++) {
      for (let i = 0; i < NC; i++) {
        const dx = Math.abs(xvec[j][i] - xPrev[j][i]);
        const dy = Math.abs(yvec[j][i] - yPrev[j][i]);
        if (dx > maxDelta) maxDelta = dx;
        if (dy > maxDelta) maxDelta = dy;
      }
    }
    if (maxDelta < OUTER_TOL) { convergedAt = iter; break; }
  }

  if (convergedAt === 0) return null; // did not converge within OUTER_MAX_ITER

  return { Lvec, xvec, Evec, yvec, iters: convergedAt };
}

// ── Balance and isoactivity helpers ──────────────────────────────────────────

function buildBalance(
  Lin:  number, xin:  readonly number[],
  Ein:  number, yin:  readonly number[],
  Lout: number, xout: readonly number[],
  Eout: number, yout: readonly number[],
  label: string,
): NrtlDirectCascadeStageTrace['componentBalance'] {
  const rows: NrtlDirectStageBalanceRow[] = [];
  let totRes = 0;
  let allOk  = true;
  for (let i = 0; i < NC; i++) {
    const lhs = Lin * xin[i]  + Ein * yin[i];
    const rhs = Lout * xout[i] + Eout * yout[i];
    const res = lhs - rhs;
    const ok  = Math.abs(res) < BALANCE_TOL;
    if (!ok) allOk = false;
    totRes += res;
    rows.push({ component: COTO_COMPONENTS[i], lhs_mol: r8(lhs), rhs_mol: r8(rhs), residual_mol: r8(res), withinTol: ok });
  }
  return { label, rows, totalResidual_mol: r8(totRes), converged: allOk };
}

function buildIsoact(
  x: readonly number[], y: readonly number[], T: number,
): NrtlDirectCascadeStageTrace['isoactivityResiduals'] {
  const lgx = nrtlLnGamma(x, T);
  const lgy = nrtlLnGamma(y, T);
  return Array.from({ length: NC }, (_, i) => {
    const res = x[i] * Math.exp(lgx[i]) - y[i] * Math.exp(lgy[i]);
    return { component: COTO_COMPONENTS[i], residual: r8(res), withinTol: Math.abs(res) < ISOACT_TOL };
  });
}

// ── Main exported function ────────────────────────────────────────────────────

export function computeNrtlDirectCascadeNt(
  input: NrtlDirectCascadeInput,
): NrtlDirectCascadeResult {

  const T         = input.temperatureK;
  const zFraw     = input.feedMoleFractions;
  const rDesign   = input.solventMolarRatio;
  const targetAr  = input.targetRaffinateAromaticsMole;

  // ── Fixed fields for every result variant ──────────────────────────────────
  const base = {
    datasetId:      `${TLLE_MODEL_ID}@${T.toFixed(2)}K`,
    datasetVersion: TLLE_MODEL_VERSION,
    citation:       TLLE_MODEL_CITATION,
    governingMeasure: 'total raffinate aromatics (mole fraction)' as const,
    stageTrace:     [],   // Hunter-Nash trace not used; directCascadeTrace carries all detail
    temperatureStatus: 'model_at_design_temperature' as const,
    temperatureStatement:
      `${TLLE_EXTRAPOLATION_CLASSIFICATION}. ` +
      `Extraction temperature ${T.toFixed(2)} K; NRTL τij(T) = bij/T parameters calibrated at ` +
      `298.15 K only (${TLLE_REPRODUCTION_RECORD.tieLinesWithinGate}/${TLLE_REPRODUCTION_RECORD.tieLinesTotal} ` +
      `governed tie-lines within reproduction gate ${TLLE_REPRODUCTION_RECORD.gate}; ` +
      `max|Δx| = ${TLLE_REPRODUCTION_RECORD.maxAbsDev} at calibration temperature). ` +
      `Result requires validation against controlled LLE data at or near ${T.toFixed(2)} K.`,
    method:
      'Direct NRTL counter-current cascade (N-stage successive substitution, basis F = 1 mol). ' +
      `Stages j = 1..N (j=1: raffinate end, fresh NMP enters below; j=N: feed end, feed enters above). ` +
      'Per stage: mix incoming streams → nrtlFlash() isothermal LLE flash ' +
      `(Rachford-Rice + successive substitution, α = 0.2, τij = bij/T, T = ${T.toFixed(2)} K) → ` +
      'converged equilibrium split (L, x, E, y). ' +
      'Outer sweep j=N→1 iterated until max|Δx|,|Δy| < 1×10⁻¹⁰ for all stages. ' +
      'Minimum integer N for which Stage-1 raffinate aromatics ≤ target. ' +
      'Fractional N_T by linear interpolation between N−1 and N raffinate-aromatics profiles ' +
      '(labelled "Interpolated Fractional Theoretical Stages"). ' +
      'Feed mole fractions normalized to Σ = 1 at cascade entry. ' +
      'No x1R-envelope restriction — equilibrium solved for arbitrary compositions.',
    exclusions: [
      'Hunter-Nash finite-locus interpolation: NOT used. Direct nrtlFlash() per stage eliminates the x1R-envelope restriction.',
      'No extrapolation of compositions beyond the NRTL two-phase region at the evaluation temperature.',
      'Constant Ki, Kremser, independent-per-component McCabe-Thiele: prohibited (variable flows, mutual solubility).',
      'Temperature correction or extrapolation of 298.15 K Coto 2022 experimental tie-lines: prohibited.',
      'Coto 2022 paper r-values and Table 2 feed labels: excluded (governed finding — feed/phase closure fails for 12/17 rows).',
    ],
    caveats: [
      `NRTL model calibrated at 298.15 K only. Off-calibration evaluation at ${T.toFixed(2)} K ` +
        `uses τij(T) = bij/T form — ${TLLE_EXTRAPOLATION_CLASSIFICATION}.`,
      `Calibration reproduction at 298.15 K: max|Δx| = ${TLLE_REPRODUCTION_RECORD.maxAbsDev} ` +
        `vs gate ${TLLE_REPRODUCTION_RECORD.gate} ` +
        `(${TLLE_REPRODUCTION_RECORD.tieLinesWithinGate}/${TLLE_REPRODUCTION_RECORD.tieLinesTotal} tie-lines within gate). ` +
        `Model uncertainty increases with temperature distance from calibration.`,
      'Pseudo-component mapping (RRBO classes → n-dodecane/1,4-xylene/1-methylnaphtalene/pyrene) is a governed screening analogy, not measured RRBO equilibrium.',
      'Source-dataset caveat (Coto 2022): Table 2 feeds and Table 3 phases fail material-balance closure; a systematic NMR aromatics-quantification bias cannot be excluded. Tie-lines retained as internally consistent equilibrium data.',
    ],
  };

  const fail = (limit: string, detail: string): NrtlDirectCascadeResult =>
    ({ ...base, status: 'not_calculable', limitExceeded: { limit, detail } });

  // ── Validate inputs ─────────────────────────────────────────────────────────
  if (!Number.isFinite(T) || T <= 0)
    return fail('Invalid input', `temperatureK = ${T} must be a positive finite number`);

  if (!Array.isArray(zFraw) || zFraw.length !== NC || (zFraw as number[]).some(v => !Number.isFinite(v) || v < 0))
    return fail('Invalid input', 'feedMoleFractions must be 5 non-negative finite numbers [sat, mono, di, poly, NMP]');

  const rawSum = (zFraw as number[]).reduce((a, b) => a + b, 0);
  if (Math.abs(rawSum - 1) > 0.005)
    return fail('Invalid input', `feedMoleFractions sum to ${rawSum.toFixed(5)} — must sum to 1.000 ± 0.005`);

  if (!Number.isFinite(rDesign) || rDesign <= 0)
    return fail('Invalid input', `solventMolarRatio must be > 0, got ${rDesign}`);

  if (!Number.isFinite(targetAr) || targetAr <= 0 || targetAr >= 1)
    return fail('Invalid input', `targetRaffinateAromaticsMole must be in (0, 1), got ${targetAr}`);

  // ── Normalize feed ──────────────────────────────────────────────────────────
  const zF: number[] = normVec(zFraw as number[]);
  const aromF = arSum(zF);

  // ── Separation duty ─────────────────────────────────────────────────────────
  if (aromF <= targetAr + 1e-9)
    return fail(
      'Invalid design case',
      `Feed total aromatics ${(aromF * 100).toFixed(4)} mol% does not exceed raffinate target ` +
      `${(targetAr * 100).toFixed(4)} mol% — no separation duty exists.`,
    );

  // ── Cascade basis ───────────────────────────────────────────────────────────
  const F = 1.0;
  const S = rDesign * F;
  const zS: number[] = [...PURE_NMP];

  // ── Global mixing-point flash → warm-start compositions ────────────────────
  const Mtot = F + S;
  const zMix = zF.map((v, i) => (v * F + zS[i] * S) / Mtot);
  const f0   = nrtlFlash(zMix, T, zF, zS as number[]);

  if (!f0.converged || f0.trivial)
    return fail(
      'Initial equilibrium check failed',
      `NRTL flash of the overall mixing point (NMP mole fraction ≈ ${(S / Mtot).toFixed(4)}) ` +
      `did not converge or produced a trivial (single-phase) solution at T = ${T.toFixed(2)} K. ` +
      `The mixing-point composition may be outside the two-phase region at this temperature. Fail closed.`,
    );

  // Orient warm-start: raffinate = n-C12-rich phase
  const x0: number[] = f0.x[0] >= f0.y[0] ? [...f0.x] : [...f0.y];
  const y0: number[] = f0.x[0] >= f0.y[0] ? [...f0.y] : [...f0.x];

  // ── N-stage search ──────────────────────────────────────────────────────────
  // arPerN[n] = raffinate aromatics from an n-stage cascade (mol fraction)
  // arPerN[0] = feed aromatics (0 stages)
  const arPerN: number[] = [aromF];

  let foundN: number | null = null;
  let finalState: SweepState | null = null;

  for (let N = 1; N <= MAX_STAGES; N++) {
    const result = runCascade(N, F, zF, S, zS, T, x0, y0);

    if (result === null)
      return fail(
        'Cascade failed to converge',
        `The direct NRTL cascade did not converge for N = ${N} stage(s) at T = ${T.toFixed(2)} K ` +
        `within ${OUTER_MAX_ITER} outer iterations (tolerance ${OUTER_TOL}). ` +
        `The NRTL flash inside a stage may have produced a trivial or non-converging result. Fail closed.`,
      );

    const raffinateAr = arSum(result.xvec[1]); // Stage 1 leaving = raffinate product
    arPerN.push(raffinateAr);

    if (raffinateAr <= targetAr + 1e-9) {
      foundN     = N;
      finalState = result;
      break;
    }
  }

  if (foundN === null || finalState === null)
    return fail(
      'N_T exceeds solver search limit',
      `Stage-1 raffinate aromatics did not reach the target ${(targetAr * 100).toFixed(4)} mol% ` +
      `within ${MAX_STAGES} theoretical stages. ` +
      `Best achieved: ${(arPerN[arPerN.length - 1] * 100).toFixed(4)} mol% at N = ${MAX_STAGES}. ` +
      `Consider increasing the solvent ratio or relaxing the target aromatics specification.`,
    );

  const N = foundN;

  // ── Fractional N_T by interpolation between N−1 and N ──────────────────────
  //   arPerN[N]   ≤ target < arPerN[N-1]
  //   N_T_frac = (N-1) + (target - arPerN[N-1]) / (arPerN[N] - arPerN[N-1])
  //            ∈ (N-1, N]  (both numerator and denominator ≤ 0)
  const arAtN   = arPerN[N]     * 100; // mol%
  const arAtNm1 = arPerN[N - 1] * 100; // mol%
  const tgtPct  = targetAr * 100;
  const denom   = arAtN - arAtNm1;     // ≤ 0
  const numer   = tgtPct - arAtNm1;    // ≤ 0

  const nTFrac  = (N - 1) + (Math.abs(denom) > 1e-12 ? numer / denom : 1.0);
  const nTInt   = Math.ceil(nTFrac - 1e-9);

  // ── Build stage traces and validate balances ────────────────────────────────
  const stageTraces: NrtlDirectCascadeStageTrace[] = [];
  let balanceOk  = true;
  let isoactOk   = true;

  for (let j = 1; j <= N; j++) {
    const Lin = j === N ? F                : finalState.Lvec[j + 1];
    const xin = j === N ? zF               : finalState.xvec[j + 1];
    const Ein = j === 1 ? S                : finalState.Evec[j - 1];
    const yin = j === 1 ? zS               : finalState.yvec[j - 1];

    // Balance label
    const labelParts: string[] = [];
    if (j === N) labelParts.push('F·zF');
    else          labelParts.push(`L₍${j + 1}₎·x₍${j + 1}₎`);
    if (j === 1) labelParts.push('S·zS');
    else          labelParts.push(`E₍${j - 1}₎·y₍${j - 1}₎`);
    const lhsStr = labelParts.join(' + ');
    const rhsStr = `L₍${j}₎·x₍${j}₎ + E₍${j}₎·y₍${j}₎`;
    const label  = `${lhsStr} = ${rhsStr}`;

    const bal  = buildBalance(Lin, xin, Ein, yin, finalState.Lvec[j], finalState.xvec[j], finalState.Evec[j], finalState.yvec[j], label);
    const iso  = buildIsoact(finalState.xvec[j], finalState.yvec[j], T);

    if (!bal.converged) balanceOk = false;
    if (iso.some(r => !r.withinTol)) isoactOk = false;

    stageTraces.push({
      stageNumber:             j,
      raffinateFlow_mol:       r8(finalState.Lvec[j]),
      raffinate_x:             finalState.xvec[j].map(r8),
      raffinateAromatics_molPct: r5(arSum(finalState.xvec[j]) * 100),
      extractFlow_mol:         r8(finalState.Evec[j]),
      extract_y:               finalState.yvec[j].map(r8),
      extractAromatics_molPct: r5(arSum(finalState.yvec[j]) * 100),
      componentBalance:        bal,
      isoactivityResiduals:    iso,
    });
  }

  // Overall cascade balance: F·zF + S·zS = L₁·x₁ + E_N·y_N
  const overallBal = buildBalance(
    F,  zF,
    S,  zS,
    finalState.Lvec[1], finalState.xvec[1],
    finalState.Evec[N], finalState.yvec[N],
    'F·zF + S·zS = L₁·x₁ + E_N·y_N (basis: F = 1 mol)',
  );
  if (!overallBal.converged) balanceOk = false;

  // Fail closed on balance or isoactivity violations
  if (!balanceOk)
    return fail(
      'Multicomponent Balance Closure Outside Tolerance',
      `One or more per-stage component balances exceed ${BALANCE_TOL} mol (basis F = 1 mol) ` +
      `after cascade convergence (T = ${T.toFixed(2)} K, N = ${N}). Fail closed.`,
    );
  if (!isoactOk)
    return fail(
      'Isoactivity Condition Outside Tolerance',
      `One or more components at one or more stages have |xᵢγᴿᵢ − yᵢγᴱᵢ| > ${ISOACT_TOL} ` +
      `after cascade convergence (T = ${T.toFixed(2)} K, N = ${N}). ` +
      `The NRTL flash may not have converged to the equilibrium point. Fail closed.`,
    );

  // ── Assemble cascade trace ──────────────────────────────────────────────────
  const cascadeTrace: NrtlDirectCascadeTrace = {
    method:                         'Direct NRTL counter-current cascade — successive substitution',
    temperatureK:                   T,
    feedBasis_mol:                  1,
    feedMoleFractions_normalized:   zF.map(r8),
    feedAromatics_molPct:           r5(aromF * 100),
    solventBasis_mol:               r8(S),
    solventMolarRatio_mol_per_mol:  r8(rDesign),
    targetRaffinateAromatics_molFrac: r8(targetAr),
    targetRaffinateAromatics_molPct:  r5(targetAr * 100),
    outerIterationsToConvergence:   finalState.iters,
    convergenceTolerance:           OUTER_TOL,
    aromaticsPerNTest: arPerN.map((ar, idx) => ({
      N:                        idx,
      raffinateAromatics_molFrac: r8(ar),
      raffinateAromatics_molPct:  r5(ar * 100),
      targetMet:                  ar <= targetAr + 1e-9,
    })),
    integerNT:    nTInt,
    fractionalNT: r5(nTFrac),
    fractionalNTBasis: 'Interpolated Fractional Theoretical Stages',
    interpolationNumerator_molPct:   r8(numer),
    interpolationDenominator_molPct: r8(denom),
    stages:        stageTraces,
    overallBalance: {
      label:            'F·zF + S·zS = L₁·x₁ + E_N·y_N (basis: F = 1 mol)',
      rows:             overallBal.rows,
      totalResidual_mol: overallBal.totalResidual_mol,
      converged:        overallBal.converged,
    },
    modelReproductionRecord: {
      maxAbsDev_at_calibrationT: TLLE_REPRODUCTION_RECORD.maxAbsDev,
      tieLinesWithinGate:        TLLE_REPRODUCTION_RECORD.tieLinesWithinGate,
      tieLinesTotal:             TLLE_REPRODUCTION_RECORD.tieLinesTotal,
      gate:                      TLLE_REPRODUCTION_RECORD.gate,
      note:                      TLLE_REPRODUCTION_RECORD.verdict,
    },
  };

  return {
    ...base,
    status:                   'calculated',
    theoreticalStages:        r5(nTFrac),
    theoreticalStagesRounded: nTInt,
    raffinateAromaticsLLE:    calculateLLEAromaticQuantity(finalState.xvec[1]),
    directCascadeTrace:       cascadeTrace,
  };
}
