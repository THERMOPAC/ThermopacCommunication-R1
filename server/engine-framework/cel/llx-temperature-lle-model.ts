// ═══════════════════════════════════════════════════════════════════════════════
// CEL — Governed Temperature-Dependent LLE Model (NRTL τ(T)) — LLX / NMP–RRBO
//
// Purpose (engineering direction 2026-08-10): the user-selected Extraction
// Temperature is the governing calculation input. Equilibrium must be
// calculable at ANY user temperature:
//   • Inside the calibrated temperature range → Interpolation
//   • Outside it → Extrapolation, ALWAYS classified
//     "Temperature Extrapolation — Preliminary / Pending Validation"
// No silent extrapolation; no hard temperature limits imposed by this module.
//
// MODEL (governed):
//   NRTL (Renon & Prausnitz, AIChE J. 14 (1968) 135–144) with the model's
//   canonical temperature dependence τij(T) = bij / T (bij = Δgij/R, K),
//   αij = 0.2 (liquid–liquid convention). The bij were regressed against the
//   13 governed xylene-family Coto 2022 Table 3 tie-lines (298.15 K) — the
//   ONLY dataset currently admitted to the calibration registry. No
//   multi-temperature data has been admitted yet, so the temperature
//   dependence beyond 298.15 K is the NRTL form itself, uncalibrated —
//   which is exactly why every off-calibration result is labelled
//   Temperature Extrapolation — Preliminary / Pending Validation.
//
// CALIBRATION REGISTRY (auto-extending):
//   The calibrated temperature range is COMPUTED from the admitted datasets
//   below — it is never hard-coded. Admitting future controlled literature,
//   vendor, pilot, or Thermopac experimental datasets (with re-regressed
//   parameters) extends the range automatically.
//
// REPRODUCTION RECORD (V&V evidence, regression of 2026-08-10):
//   Two-phase flash reproduction of the 13 governed tie-lines at 298.15 K is
//   recorded verbatim in TLLE_REPRODUCTION_RECORD against the governed gate
//   3·u(x) = 0.009. The NRTL model does NOT meet the 0.009 gate on all
//   tie-lines (recorded honestly below) — consistent with the source paper's
//   own finding that even Mod. UNIFAC (Do) shows σ_K,par ≈ 31 % at the
//   calibration temperature. CONSEQUENCE: at temperatures inside the
//   calibrated range the engine uses the GOVERNED EXPERIMENTAL TIE-LINES
//   directly (exact); the NRTL model is used only where no experimental
//   data exists (temperature extrapolation), always labelled Preliminary /
//   Pending Validation. This model is NEVER labelled "temperature-corrected".
// ═══════════════════════════════════════════════════════════════════════════════

import {
  TieLine, COTO_2022_XYLENE_TIELINES, COTO_2022_TEMPERATURE_K,
  COTO_2022_TEMPERATURE_TOLERANCE_K, COTO_2022_DATASET_ID,
  COTO_2022_DATASET_VERSION, COTO_2022_CITATION, COTO_2022_UX,
} from './coto2022-nmp-lle';

export const TLLE_MODEL_ID = 'LLX_TLLE_NRTL_TAU_B_OVER_T';
export const TLLE_MODEL_VERSION = '1.0.0';
export const TLLE_MODEL_NAME =
  'NRTL τij(T) = bij/T, α = 0.2 — regressed on governed Coto 2022 tie-lines (298.15 K)';
export const TLLE_MODEL_CITATION =
  'H. Renon, J.M. Prausnitz, "Local compositions in thermodynamic excess functions for liquid mixtures", AIChE J. 14 (1968) 135–144; parameters regressed against ' + COTO_2022_CITATION;

export const NRTL_ALPHA = 0.2;
const N = 5; // [n-dodecane, 1,4-xylene, 1-methylnaphtalene, pyrene, NMP]

/** Regressed NRTL bij (K): τij(T) = bij / T. Regression record:
 *  scripts/regress-tlle-nrtl.mjs (isoactivity fit + flash-based refinement,
 *  13 xylene-family tie-lines, 298.15 K, α = 0.2). REPLACED ONLY by a
 *  re-regression when new datasets are admitted to the calibration registry. */
export const NRTL_B_K: readonly (readonly number[])[] = [
  [0, -82.13, -7059.558, 1664.196, 695.273],
  [48.861, 0, 6722.003, 1430.251, -550.274],
  [-169.991, 1198.535, 0, -198.334, 149.692],
  [10330.048, 2563.551, -6337.475, 0, 2619.557],
  [489.81, 531.328, -8143.726, 1090.341, 0],
];

// ── Calibration registry (auto-extending) ────────────────────────────────────

export interface CalibrationDataset {
  datasetId: string;
  datasetVersion: string;
  citation: string;
  admitted: string; // ISO date of engineering admission
  /** Experimental tie-line families this dataset supplies, keyed by their
   *  measurement temperature. A dataset counts toward the calibrated range
   *  ONLY through temperatures whose tie-line family is actually usable
   *  (≥ 4 tie-lines) — the classification "interpolation" is never granted by
   *  a registry temperature that cannot supply its own equilibrium data. */
  tieLineFamilies: readonly { temperatureK: number; tieLines: readonly TieLine[] }[];
}

/** Datasets admitted to the calibration of this model. Adding an entry (with
 *  its experimental tie-line families AND re-regressed NRTL_B_K) extends the
 *  calibrated range automatically. */
export const TLLE_CALIBRATION_REGISTRY: readonly CalibrationDataset[] = [
  {
    datasetId: COTO_2022_DATASET_ID,
    datasetVersion: COTO_2022_DATASET_VERSION,
    citation: COTO_2022_CITATION,
    admitted: '2026-08-10',
    tieLineFamilies: [{ temperatureK: COTO_2022_TEMPERATURE_K, tieLines: COTO_2022_XYLENE_TIELINES }],
  },
];

const MIN_USABLE_TIELINES = 4;

/** Calibration temperatures that actually carry a usable experimental
 *  tie-line family (≥ 4 tie-lines). Only these count as calibrated. */
export function usableCalibrationPointsK(): number[] {
  return TLLE_CALIBRATION_REGISTRY.flatMap((d) =>
    d.tieLineFamilies.filter((f) => f.tieLines.length >= MIN_USABLE_TIELINES).map((f) => f.temperatureK),
  );
}

export function calibratedTemperatureRangeK(): { minK: number; maxK: number } {
  const ts = usableCalibrationPointsK();
  return { minK: Math.min(...ts), maxK: Math.max(...ts) };
}

/** The experimental tie-line family governing a user temperature, when one
 *  exists within the acceptance window (10·u(T) = 0.5 K) of a usable
 *  calibration point. Returns null when no experimental data governs T —
 *  i.e. the model must extrapolate. */
export function experimentalFamilyForTemperature(userTemperatureK: number):
  { dataset: CalibrationDataset; temperatureK: number; tieLines: readonly TieLine[] } | null {
  let bestMatch: { dataset: CalibrationDataset; temperatureK: number; tieLines: readonly TieLine[] } | null = null;
  let bestDist = Infinity;
  for (const d of TLLE_CALIBRATION_REGISTRY) {
    for (const f of d.tieLineFamilies) {
      if (f.tieLines.length < MIN_USABLE_TIELINES) continue;
      const dist = Math.abs(userTemperatureK - f.temperatureK);
      if (dist <= COTO_2022_TEMPERATURE_TOLERANCE_K && dist < bestDist) {
        bestMatch = { dataset: d, temperatureK: f.temperatureK, tieLines: f.tieLines };
        bestDist = dist;
      }
    }
  }
  return bestMatch;
}

export interface TemperatureModelStatus {
  userTemperatureK: number;
  calibratedRangeK: { minK: number; maxK: number };
  mode: 'interpolation' | 'extrapolation';
  /** K outside the calibrated range (0 when interpolating). */
  distanceOutsideRangeK: number;
  classification: string;
  statement: string;
  modelId: string;
  modelVersion: string;
  modelName: string;
  calibrationDatasets: readonly CalibrationDataset[];
}

export const TLLE_EXTRAPOLATION_CLASSIFICATION =
  'Temperature Extrapolation — Preliminary / Pending Validation';

export function temperatureModelStatus(userTemperatureK: number): TemperatureModelStatus {
  const range = calibratedTemperatureRangeK();
  // "Interpolation" is granted ONLY when a usable experimental tie-line
  // family governs the user temperature (within the 10·u(T) = 0.5 K
  // acceptance window of a calibration point that carries data). A registry
  // temperature without its own tie-line family never grants the label.
  const inside = experimentalFamilyForTemperature(userTemperatureK) !== null;
  const points = usableCalibrationPointsK();
  const nearest = Math.min(...points.map((p) => Math.abs(userTemperatureK - p)));
  const dist = inside ? 0 : Math.max(0, nearest - COTO_2022_TEMPERATURE_TOLERANCE_K);
  return {
    userTemperatureK,
    calibratedRangeK: range,
    mode: inside ? 'interpolation' : 'extrapolation',
    distanceOutsideRangeK: Math.round(dist * 100) / 100,
    classification: inside ? 'Within Calibrated Temperature Range — Interpolation' : TLLE_EXTRAPOLATION_CLASSIFICATION,
    statement: inside
      ? `Extraction temperature ${userTemperatureK.toFixed(2)} K lies within the calibrated temperature range [${range.minK.toFixed(2)}, ${range.maxK.toFixed(2)}] K — equilibrium taken by interpolation of the governed experimental tie-lines.`
      : `Extraction temperature ${userTemperatureK.toFixed(2)} K lies ${dist.toFixed(2)} K outside the calibrated temperature range [${range.minK.toFixed(2)}, ${range.maxK.toFixed(2)}] K. Equilibrium is EXTRAPOLATED with the governed NRTL τ(T) = b/T model (parameters regressed at 298.15 K only). Classification: ${TLLE_EXTRAPOLATION_CLASSIFICATION}. The calibrated range extends automatically as controlled literature, vendor, pilot, or Thermopac experimental data are admitted to the calibration registry.`,
    modelId: TLLE_MODEL_ID,
    modelVersion: TLLE_MODEL_VERSION,
    modelName: TLLE_MODEL_NAME,
    calibrationDatasets: TLLE_CALIBRATION_REGISTRY,
  };
}

// ── Reproduction record (V&V evidence — updated with each regression) ────────

export const TLLE_REPRODUCTION_GATE = 3 * COTO_2022_UX; // 0.009
/** Max |Δx| per governed tie-line (flash at 298.15 K vs experiment), gate
 *  3·u(x) = 0.009. Recorded verbatim from the regression run — see
 *  .agents/outputs/tlle-nrtl-regression.md. */
export const TLLE_REPRODUCTION_RECORD = {
  regressionDate: '2026-08-10',
  perTieLineMaxAbsDev: [
    { tieLine: 1, maxAbsDev: 0.092 }, { tieLine: 2, maxAbsDev: 0.0474 },
    { tieLine: 3, maxAbsDev: 0.066 }, { tieLine: 4, maxAbsDev: 0.0194 },
    { tieLine: 5, maxAbsDev: 0.0133 }, { tieLine: 6, maxAbsDev: 0.0121 },
    { tieLine: 7, maxAbsDev: 0.0205 }, { tieLine: 8, maxAbsDev: 0.0146 },
    { tieLine: 9, maxAbsDev: 0.0165 }, { tieLine: 10, maxAbsDev: 0.0253 },
    { tieLine: 11, maxAbsDev: 0.0079 }, { tieLine: 12, maxAbsDev: 0.0283 },
    { tieLine: 13, maxAbsDev: 0.007 },
  ],
  maxAbsDev: 0.092,
  tieLinesWithinGate: 2,
  tieLinesTotal: 13,
  gate: TLLE_REPRODUCTION_GATE,
  verdict:
    `NRTL τ(T)=b/T (α=0.2) does NOT reproduce all governed tie-lines within the 3·u(x) = ${TLLE_REPRODUCTION_GATE} gate (2/13 within gate; max |Δx| = 0.092). Recorded honestly; consistent with the source paper's own model errors (Mod. UNIFAC-Do σ_K,par ≈ 31 %). Therefore: within the calibrated range the governed EXPERIMENTAL tie-lines are used directly (exact); the NRTL model serves ONLY for temperature extrapolation, always classified '${'Temperature Extrapolation — Preliminary / Pending Validation'}'.`,
} as const;

// ── NRTL activity coefficients & two-phase flash ─────────────────────────────

function tauAt(T: number): number[][] {
  return NRTL_B_K.map((row) => row.map((b) => b / T));
}

export function nrtlLnGamma(x: readonly number[], T: number): number[] {
  const tau = tauAt(T);
  const G = tau.map((row) => row.map((t) => Math.exp(-NRTL_ALPHA * t)));
  const S = new Array(N).fill(0), C = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) { S[i] += x[j] * G[j][i]; C[i] += x[j] * G[j][i] * tau[j][i]; }
  }
  const ln = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    let t2 = 0;
    for (let j = 0; j < N; j++) t2 += (x[j] * G[i][j] / S[j]) * (tau[i][j] - C[j] / S[j]);
    ln[i] = C[i] / S[i] + t2;
  }
  return ln;
}

export class TlleModelError extends Error {
  constructor(public readonly limit: string, public readonly detail: string) {
    super(`${limit}: ${detail}`);
    this.name = 'TlleModelError';
  }
}

interface FlashResult { x: number[]; y: number[]; beta: number; trivial: boolean; converged: boolean }

/** Isothermal two-phase LLE flash (successive substitution + Rachford–Rice). */
export function nrtlFlash(z: readonly number[], T: number, x0: readonly number[], y0: readonly number[]): FlashResult {
  let x = [...x0], y = [...y0];
  let beta = 0.5;
  let converged = false;
  for (let it = 0; it < 1500; it++) {
    const lgx = nrtlLnGamma(x, T), lgy = nrtlLnGamma(y, T);
    const K = lgx.map((l, i) => Math.exp(l - lgy[i]));
    let lo = 1e-10, hi = 1 - 1e-10;
    const g = (b: number) => z.reduce((s, zi, i) => s + (zi * (K[i] - 1)) / (1 + b * (K[i] - 1)), 0);
    if (g(lo) * g(hi) > 0) beta = g(lo) > 0 ? hi : lo;
    else {
      for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (g(lo) * g(m) <= 0) hi = m; else lo = m; }
      beta = (lo + hi) / 2;
    }
    const xn = z.map((zi, i) => zi / (1 + beta * (K[i] - 1)));
    const yn = xn.map((xi, i) => K[i] * xi);
    const sx = xn.reduce((a, b) => a + b, 0), sy = yn.reduce((a, b) => a + b, 0);
    const xN = xn.map((v) => v / sx), yN = yn.map((v) => v / sy);
    const d = Math.max(
      ...xN.map((v, i) => Math.abs(v - x[i])),
      ...yN.map((v, i) => Math.abs(v - y[i])),
    );
    x = xN; y = yN;
    if (d < 1e-12) { converged = true; break; }
  }
  const trivial = Math.max(...x.map((v, i) => Math.abs(v - y[i]))) < 1e-4;
  return { x, y, beta, trivial, converged };
}

export interface ModelTieLineFamily {
  tieLines: TieLine[];
  temperatureK: number;
  x1RMin: number;
  x1RMax: number;
  sourceTieLinesUsed: number;
  droppedTieLines: { tableOrder: number; reason: string }[];
  datasetId: string;
  datasetVersion: string;
  citation: string;
  basisLabel: string;
}

/** Generate the model tie-line family at the user temperature by flashing the
 *  overall composition (midpoint) of each governed 298.15 K tie-line with the
 *  NRTL τ(T) model at T. The governed experimental tie-lines are the anchor
 *  compositions; nothing else is invented. Fails closed (TlleModelError) when
 *  the model cannot produce a usable two-phase family at T. */
export function generateModelTieLinesAtTemperature(temperatureK: number): ModelTieLineFamily {
  if (!Number.isFinite(temperatureK) || temperatureK <= 0) {
    throw new TlleModelError('Invalid input', `temperatureK = ${temperatureK} must be a positive finite number`);
  }
  const tieLines: TieLine[] = [];
  const dropped: { tableOrder: number; reason: string }[] = [];
  for (const tl of COTO_2022_XYLENE_TIELINES) {
    const z = tl.x.map((v, i) => 0.5 * (v + tl.y[i]));
    const r = nrtlFlash(z, temperatureK, tl.x, tl.y);
    if (!r.converged) { dropped.push({ tableOrder: tl.tableOrder, reason: 'flash did not converge' }); continue; }
    if (r.trivial) { dropped.push({ tableOrder: tl.tableOrder, reason: 'trivial (single-phase) solution — feed point outside the model two-phase region at this temperature' }); continue; }
    if (r.x.some((v) => !Number.isFinite(v)) || r.y.some((v) => !Number.isFinite(v))) {
      dropped.push({ tableOrder: tl.tableOrder, reason: 'flash produced non-finite compositions — numerically unusable at this temperature' });
      continue;
    }
    // orient: raffinate = phase richer in n-dodecane
    const [xr, ye] = r.x[0] >= r.y[0] ? [r.x, r.y] : [r.y, r.x];
    tieLines.push({ x: xr.map((v) => Math.round(v * 1e4) / 1e4), y: ye.map((v) => Math.round(v * 1e4) / 1e4), tableOrder: tl.tableOrder, nominalR: tl.nominalR });
  }
  tieLines.sort((a, b) => a.x[0] - b.x[0]);
  // drop non-monotone duplicates in x1R (keep first)
  const mono: TieLine[] = [];
  for (const t of tieLines) {
    if (mono.length === 0 || t.x[0] > mono[mono.length - 1].x[0] + 1e-6) mono.push(t);
    else dropped.push({ tableOrder: t.tableOrder, reason: 'non-monotone x1R after model flash — dropped to preserve the interpolation coordinate' });
  }
  if (mono.length < 4) {
    throw new TlleModelError(
      'Temperature-Dependent LLE Model — DEVELOPMENT GAP',
      `the governed NRTL τ(T) model produced only ${mono.length} usable tie-lines at ${temperatureK.toFixed(2)} K (minimum 4 required for a governed interpolation family). ${dropped.length} anchor tie-lines were dropped: ${dropped.map((d) => `Table-3 row ${d.tableOrder} (${d.reason})`).join('; ') || 'none'}. Equilibrium at this temperature is not representable by the current calibration — admit experimental data at or near this temperature to the calibration registry.`,
    );
  }
  return {
    tieLines: mono,
    temperatureK,
    x1RMin: mono[0].x[0],
    x1RMax: mono[mono.length - 1].x[0],
    sourceTieLinesUsed: mono.length,
    droppedTieLines: dropped,
    datasetId: `${TLLE_MODEL_ID}@${temperatureK.toFixed(2)}K`,
    datasetVersion: TLLE_MODEL_VERSION,
    citation: TLLE_MODEL_CITATION,
    basisLabel: `NRTL τ(T) model tie-line family evaluated at ${temperatureK.toFixed(2)} K (anchors: governed Coto 2022 Table 3 tie-line overall compositions) — ${TLLE_EXTRAPOLATION_CLASSIFICATION}`,
  };
}
