/**
 * NRTL temperature-dependent LLE model for the RRBO-surrogate / NMP system.
 * ─────────────────────────────────────────────────────────────────────────────
 * GOVERNANCE (approved engineering-development path, 2026-08-10):
 *   • Model: NRTL with linear temperature-dependent binary interaction
 *     energies τij(T) = aij + bij/T, non-randomness α fixed per pair.
 *   • Component basis: the governed 5-pseudo-component set of the Coto 2022
 *     dataset — [SAT (n-C12), MONO (1,4-xylene), DI (1-methylnaphthalene),
 *     POLY (pyrene), NMP].
 *   • Calibration data (Controlled Literature, admitted by user approval):
 *       — Coto 2022 Table 3 tie-lines at 298.15 K (anchor, all classes)
 *       — Fahim et al., Fluid Phase Equilib. 231 (2005) 163–170
 *       — Fandary et al., J. Chem. Thermodyn. 38 (2006) 455–460
 *       — Aljimaz et al., J. Chem. Eng. Data 51 (2006) 1026–1030
 *     (multi-temperature n-alkane + alkylbenzene + NMP ternaries, 289–328 K,
 *      NIST/ThermoML machine-readable records; class-lumped SAT/MONO/NMP).
 *   • DI/POLY pairs have NO multi-temperature data: their bij ≡ 0 (bounded
 *     assumption approved by user — τ constant at the 298.15 K-regressed
 *     value). Any result at T ≠ 298.15 K therefore carries the
 *     POLYAROMATIC_TEMPERATURE_ASSUMPTION caveat and is Pending Validation.
 *   • The model may govern ONLY if the validation gate passed at regression
 *     time (Coto tie-line reproduction + leave-one-temperature-out). The
 *     regression artifact JSON records pass/fail; this module fails closed
 *     ("Temperature-Dependent LLE Model — DEVELOPMENT GAP") when the artifact
 *     is missing or not admitted.
 *   • Interpolation only: user temperature must lie inside the calibrated
 *     envelope [T_MIN, T_MAX] recorded in the artifact. Outside → fail closed
 *     (DEVELOPMENT GAP: no calibration data at T). NEVER extrapolate.
 *   • Equilibrium at T is a flash of the model — never a scaling or
 *     "correction" of experimental tie-lines.
 *
 * Regression artifact: server/engine-framework/cel/data/nrtl-params-v1.json
 * produced ONLY by server/engine-framework/cel/regression/regress-nrtl-nmp.ts
 * (full provenance, objective, residuals, validation record inside).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COTO_2022_XYLENE_TIELINES, type TieLine } from './coto2022-nmp-lle';

export const NRTL_MODEL_ID = 'NRTL_NMP_RRBO_SURROGATE';
export const NRTL_DEVELOPMENT_GAP = 'Temperature-Dependent LLE Model — DEVELOPMENT GAP';

export const NRTL_COMPONENT_LABELS = ['SAT (n-C12)', 'MONO (1,4-xylene)', 'DI (1-methylnaphthalene)', 'POLY (pyrene)', 'NMP'] as const;
const N = 5;

export interface NrtlParams {
  /** aij (dimensionless τ intercept), 5×5, diagonal 0 */
  a: number[][];
  /** bij (K, τ slope term τij = aij + bij/T), 5×5, diagonal 0; DI/POLY rows+cols ≡ 0 by bounded assumption */
  b: number[][];
  /** non-randomness αij = αji, 5×5, diagonal 0 */
  alpha: number[][];
}

export interface NrtlValidationRecord {
  cotoRmsd: number;
  cotoMaxAbsDev: number;
  cotoTolerance: number;
  cotoPass: boolean;
  /** leave-one-temperature-out prediction records */
  loto: { leftOutT_K: number; rmsd: number; maxAbsDev: number; pass: boolean }[];
  lotoPass: boolean;
  admitted: boolean;
  notes: string[];
}

export interface NrtlModelArtifact {
  modelId: string;
  version: string;
  generatedAtUtc: string;
  citationList: string[];
  temperatureEnvelopeK: { min: number; max: number };
  params: NrtlParams;
  objective: { description: string; finalValue: number; nTieLines: number; weightFloorUx: number };
  validation: NrtlValidationRecord;
  boundedAssumptions: string[];
}

export interface NrtlModelStatus {
  available: boolean;
  admitted: boolean;
  artifact?: NrtlModelArtifact;
  /** exact user-facing gap statement when not admitted/available */
  gap?: { limit: string; detail: string };
}

let cached: NrtlModelStatus | null = null;

/** Returns a description of the first structural defect, or null if sound. */
function validateArtifactStructure(a: NrtlModelArtifact): string | null {
  const isMatrix = (m: unknown, name: string): string | null => {
    if (!Array.isArray(m) || m.length !== N) return `${name} is not a ${N}×${N} matrix`;
    for (let i = 0; i < N; i++) {
      const row = (m as unknown[])[i];
      if (!Array.isArray(row) || row.length !== N) return `${name}[${i}] is not length ${N}`;
      for (let j = 0; j < N; j++) {
        const v = (row as unknown[])[j];
        if (typeof v !== 'number' || !Number.isFinite(v)) return `${name}[${i}][${j}] is not a finite number`;
      }
      if ((row as number[])[i] !== 0) return `${name}[${i}][${i}] must be 0 (diagonal)`;
    }
    return null;
  };
  if (!a.params) return 'params missing';
  const pErr = isMatrix(a.params.a, 'params.a') ?? isMatrix(a.params.b, 'params.b') ?? isMatrix(a.params.alpha, 'params.alpha');
  if (pErr) return pErr;
  const env = a.temperatureEnvelopeK;
  if (!env || !Number.isFinite(env.min) || !Number.isFinite(env.max) || !(env.min < env.max)) {
    return 'temperatureEnvelopeK missing or min/max not finite with min < max';
  }
  const v = a.validation;
  if (!v || typeof v.admitted !== 'boolean' || typeof v.cotoPass !== 'boolean' || typeof v.lotoPass !== 'boolean'
    || !Number.isFinite(v.cotoRmsd) || !Number.isFinite(v.cotoTolerance) || !Array.isArray(v.loto)) {
    return 'validation record incomplete (admitted/cotoPass/lotoPass/cotoRmsd/cotoTolerance/loto required)';
  }
  if (v.admitted && (!v.cotoPass || !v.lotoPass)) return 'validation record inconsistent: admitted=true but a gate component failed';
  if (v.admitted && v.cotoRmsd > v.cotoTolerance) return 'validation record inconsistent: admitted=true but cotoRmsd exceeds cotoTolerance';
  if (typeof a.version !== 'string' || a.version.length === 0) return 'version missing';
  return null;
}

function artifactPath(): string {
  const here = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, 'data', 'nrtl-params-v1.json');
}

/** Load (cached) the regression artifact. Fails closed — never throws. */
export function getNrtlModelStatus(forceReload = false): NrtlModelStatus {
  if (cached && !forceReload) return cached;
  try {
    const p = artifactPath();
    if (!fs.existsSync(p)) {
      cached = { available: false, admitted: false, gap: { limit: NRTL_DEVELOPMENT_GAP, detail: 'No regressed parameter artifact exists (regression not yet run or not committed). Temperature-dependent equilibrium cannot be calculated.' } };
      return cached;
    }
    const artifact = JSON.parse(fs.readFileSync(p, 'utf8')) as NrtlModelArtifact;
    if (artifact.modelId !== NRTL_MODEL_ID) {
      cached = { available: false, admitted: false, gap: { limit: NRTL_DEVELOPMENT_GAP, detail: `Parameter artifact modelId '${artifact.modelId}' does not match '${NRTL_MODEL_ID}'.` } };
      return cached;
    }
    // Full structural validation — any malformed/inconsistent artifact fails
    // closed as DEVELOPMENT GAP rather than surfacing generic runtime errors.
    const structuralError = validateArtifactStructure(artifact);
    if (structuralError) {
      cached = { available: false, admitted: false, gap: { limit: NRTL_DEVELOPMENT_GAP, detail: `Parameter artifact is structurally invalid: ${structuralError}. The model cannot govern.` } };
      return cached;
    }
    if (!artifact.validation?.admitted) {
      const v = artifact.validation;
      cached = {
        available: true, admitted: false, artifact,
        gap: {
          limit: NRTL_DEVELOPMENT_GAP,
          detail: `Regressed model failed the governed validation gate and is NOT admitted: Coto 298.15 K reproduction RMSD ${v?.cotoRmsd?.toFixed(4) ?? '—'} (max |Δx| ${v?.cotoMaxAbsDev?.toFixed(4) ?? '—'}) vs tolerance ${v?.cotoTolerance ?? '—'}; leave-one-temperature-out ${v?.lotoPass ? 'passed' : 'failed'}. Additional experimental data (multi-temperature polyaromatic/RRBO tie-lines) are required.`,
        },
      };
      return cached;
    }
    cached = { available: true, admitted: true, artifact };
    return cached;
  } catch (e) {
    cached = { available: false, admitted: false, gap: { limit: NRTL_DEVELOPMENT_GAP, detail: `Parameter artifact could not be read/parsed: ${e instanceof Error ? e.message : String(e)}.` } };
    return cached;
  }
}

// ── NRTL activity coefficients ────────────────────────────────────────────────

export function nrtlLnGamma(x: readonly number[], T_K: number, p: NrtlParams): number[] {
  const tau: number[][] = [], G: number[][] = [];
  for (let i = 0; i < N; i++) {
    tau.push([]); G.push([]);
    for (let j = 0; j < N; j++) {
      const t = i === j ? 0 : p.a[i][j] + p.b[i][j] / T_K;
      tau[i].push(t);
      G[i].push(i === j ? 1 : Math.exp(-p.alpha[i][j] * t));
    }
  }
  const ln: number[] = [];
  for (let i = 0; i < N; i++) {
    let sum1n = 0, sum1d = 0;
    for (let j = 0; j < N; j++) { sum1n += tau[j][i] * G[j][i] * x[j]; sum1d += G[j][i] * x[j]; }
    let term2 = 0;
    for (let j = 0; j < N; j++) {
      let dj = 0, nj = 0;
      for (let k = 0; k < N; k++) { dj += G[k][j] * x[k]; nj += x[k] * tau[k][j] * G[k][j]; }
      term2 += (x[j] * G[i][j] / dj) * (tau[i][j] - nj / dj);
    }
    ln.push(sum1n / sum1d + term2);
  }
  return ln;
}

// ── Isothermal two-phase LLE flash ───────────────────────────────────────────

export interface FlashResult {
  converged: boolean;
  twoPhase: boolean;
  /** raffinate = SAT-rich phase */
  x: number[];
  /** extract = NMP-rich phase */
  y: number[];
  beta: number; // extract fraction of feed (mol basis)
  iterations: number;
}

function rachfordRice(z: readonly number[], K: readonly number[]): number {
  // solve g(beta)=Σ z(K-1)/(1+beta(K-1)) = 0 on (0,1) by bisection
  const g = (b: number) => z.reduce((s, zi, i) => s + (zi * (K[i] - 1)) / (1 + b * (K[i] - 1)), 0);
  let lo = 1e-10, hi = 1 - 1e-10;
  if (g(lo) < 0 || g(hi) > 0) return NaN; // no root in (0,1) → single phase
  for (let it = 0; it < 200; it++) { const mid = (lo + hi) / 2; if (g(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export function lleFlash(z: readonly number[], T_K: number, p: NrtlParams, initX?: readonly number[], initY?: readonly number[]): FlashResult {
  let K: number[];
  if (initX && initY) K = initX.map((xi, i) => Math.max(1e-8, initY[i] || 1e-8) / Math.max(1e-8, xi || 1e-8));
  else K = [0.25, 1.3, 2.5, 4.0, 8.0]; // generic NMP-extraction K init (extract/raffinate)
  let x = [...z], y = [...z], beta = 0.5, converged = false, it = 0;
  for (; it < 800; it++) {
    beta = rachfordRice(z, K);
    if (!Number.isFinite(beta)) return { converged: true, twoPhase: false, x: [...z], y: [...z], beta: NaN, iterations: it };
    const xn: number[] = [], yn: number[] = [];
    for (let i = 0; i < N; i++) { const d = 1 + beta * (K[i] - 1); xn.push(z[i] / d); yn.push(K[i] * z[i] / d); }
    const sx = xn.reduce((a, b) => a + b, 0), sy = yn.reduce((a, b) => a + b, 0);
    for (let i = 0; i < N; i++) { xn[i] /= sx; yn[i] /= sy; }
    const lgx = nrtlLnGamma(xn, T_K, p), lgy = nrtlLnGamma(yn, T_K, p);
    let maxdK = 0;
    for (let i = 0; i < N; i++) {
      const Knew = Math.exp(lgx[i] - lgy[i]);
      maxdK = Math.max(maxdK, Math.abs(Knew - K[i]) / Math.max(1e-8, K[i]));
      K[i] = 0.5 * K[i] + 0.5 * Knew; // damped
    }
    x = xn; y = yn;
    if (maxdK < 1e-9) { converged = true; break; }
  }
  // trivial-solution detection
  const dist = Math.sqrt(x.reduce((s, xi, i) => s + (xi - y[i]) ** 2, 0));
  if (dist < 1e-4) return { converged, twoPhase: false, x, y, beta, iterations: it };
  // orient: raffinate = SAT-rich
  if (y[0] > x[0]) { const t = x; x = y; y = t; beta = 1 - beta; }
  return { converged, twoPhase: true, x, y, beta, iterations: it };
}

// ── Model tie-line table at user temperature ─────────────────────────────────

export class NrtlModelError extends Error {
  constructor(public readonly limit: string, public readonly detail: string) {
    super(`${limit}: ${detail}`); this.name = 'NrtlModelError';
  }
}

/** Generate a governed tie-line table at temperature T by flashing the NRTL
 *  model from the Coto tie-line midpoint feeds. Fails closed when the model
 *  is not admitted or T is outside the calibrated envelope. */
export function generateNrtlTieLineTable(T_K: number): { tieLines: TieLine[]; artifact: NrtlModelArtifact } {
  const status = getNrtlModelStatus();
  if (!status.admitted || !status.artifact) {
    const g = status.gap ?? { limit: NRTL_DEVELOPMENT_GAP, detail: 'Model unavailable.' };
    throw new NrtlModelError(g.limit, g.detail);
  }
  const art = status.artifact;
  const { min, max } = art.temperatureEnvelopeK;
  if (!Number.isFinite(T_K) || T_K < min - 1e-9 || T_K > max + 1e-9) {
    throw new NrtlModelError(
      NRTL_DEVELOPMENT_GAP,
      `Extraction temperature ${Number.isFinite(T_K) ? T_K.toFixed(2) : String(T_K)} K is outside the calibrated envelope [${min.toFixed(2)}, ${max.toFixed(2)}] K. Interpolation only — no extrapolation is permitted. Additional calibration tie-lines at the design temperature are required.`,
    );
  }
  const tieLines: TieLine[] = [];
  let order = 0;
  for (const tl of COTO_2022_XYLENE_TIELINES) {
    const z = tl.x.map((xi, i) => 0.5 * (xi + tl.y[i]));
    const fl = lleFlash(z, T_K, art.params, tl.x, tl.y);
    if (!fl.converged || !fl.twoPhase) continue;
    order += 1;
    tieLines.push({ x: fl.x.map((v) => Number(v.toFixed(6))), y: fl.y.map((v) => Number(v.toFixed(6))), tableOrder: order, nominalR: NaN });
  }
  tieLines.sort((a, b) => a.x[0] - b.x[0]);
  if (tieLines.length < 4) {
    throw new NrtlModelError(
      NRTL_DEVELOPMENT_GAP,
      `NRTL flash at ${T_K.toFixed(2)} K produced only ${tieLines.length} two-phase tie-lines from the ${COTO_2022_XYLENE_TIELINES.length} governed feed loci — the two-phase envelope is too narrow for a governed cascade at this temperature.`,
    );
  }
  return { tieLines, artifact: art };
}
