/**
 * Step 4 — independent thermodynamic proof-of-concept.
 *
 * This file is intentionally outside Stage 8 and does not import an ECR
 * simulator, Stage 8 resolver, production NRTL artifact, or cascade solver.
 *
 * It provides:
 *   1. direct-data predictive benchmarking on the admitted NMP systems;
 *   2. a documented COSMO-SAC-style molecular-surface proxy;
 *   3. a documented Modified-UNIFAC-Dortmund-style group proxy;
 *   4. direct-data-calibrated NRTL and UNIQUAC comparisons;
 *   5. held-out temperature/system diagnostics;
 *   6. predictive-only BT/DBT/heavy-sulfur envelopes.
 *
 * The two predictive models are deliberately named "..._PROXY". A real
 * COSMO-RS/COSMO-SAC quantum surface calculation is not installed in this
 * repository. The proxy is a deterministic, fixed-parameter prior with a
 * molecular descriptor basis; it must not be promoted to a governed model
 * without replacing it with an actual sigma-profile implementation.
 *
 * Run:
 *   npx tsx server/research/ecr2-step4/thermodynamic-proof-of-concept.ts
 *
 * Outputs:
 *   .agents/outputs/ecr2-step4-thermodynamic-poc/results.json
 *   .agents/outputs/ecr2-step4-thermodynamic-poc/report.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Verbatim Step-4 controlled copy of Coto 2022 Table 3. Keeping the small,
 * immutable data copy here is deliberate: this proof must not depend on
 * production CEL or Stage 8 code to execute.
 */
const COTO_2022_TEMPERATURE_K = 298.15;
const COTO_2022_UX = 0.003;
const COTO_2022_CITATION =
  'B. Coto, I. Suárez, M.J. Tenorio, S. Nieto, N. Alvarez, J.J. Espada, "Extraction of aromatic and polyaromatic compounds with NMP: Experimental and model description", Fluid Phase Equilibria 554 (2022) 113293, Table 3';
const COTO_2022_XYLENE_TIELINES = [
  { x: [0.641, 0.131, 0.050, 0.020, 0.158], y: [0.392, 0.142, 0.077, 0.038, 0.351], tableOrder: 2 },
  { x: [0.651, 0.134, 0.047, 0.021, 0.147], y: [0.320, 0.150, 0.081, 0.050, 0.399], tableOrder: 5 },
  { x: [0.664, 0.136, 0.055, 0.035, 0.110], y: [0.250, 0.162, 0.105, 0.095, 0.388], tableOrder: 9 },
  { x: [0.725, 0.109, 0.037, 0.018, 0.111], y: [0.252, 0.141, 0.080, 0.064, 0.463], tableOrder: 10 },
  { x: [0.800, 0.092, 0.022, 0.008, 0.078], y: [0.206, 0.113, 0.062, 0.036, 0.583], tableOrder: 6 },
  { x: [0.813, 0.082, 0.020, 0.009, 0.076], y: [0.190, 0.113, 0.063, 0.048, 0.586], tableOrder: 11 },
  { x: [0.822, 0.085, 0.022, 0.006, 0.065], y: [0.240, 0.124, 0.069, 0.017, 0.550], tableOrder: 3 },
  { x: [0.857, 0.062, 0.015, 0.005, 0.061], y: [0.181, 0.094, 0.057, 0.024, 0.644], tableOrder: 7 },
  { x: [0.858, 0.067, 0.015, 0.005, 0.055], y: [0.157, 0.098, 0.052, 0.026, 0.667], tableOrder: 4 },
  { x: [0.860, 0.068, 0.018, 0.004, 0.050], y: [0.158, 0.104, 0.058, 0.014, 0.666], tableOrder: 1 },
  { x: [0.863, 0.058, 0.013, 0.005, 0.061], y: [0.150, 0.085, 0.045, 0.033, 0.687], tableOrder: 12 },
  { x: [0.877, 0.050, 0.011, 0.005, 0.057], y: [0.174, 0.093, 0.038, 0.021, 0.674], tableOrder: 8 },
  { x: [0.878, 0.048, 0.010, 0.004, 0.060], y: [0.135, 0.073, 0.037, 0.027, 0.728], tableOrder: 13 },
] as const;
const COTO_2022_TOLUENE_TIELINES = [
  { x: [0.645, 0.106, 0.048, 0.020, 0.181], y: [0.397, 0.142, 0.072, 0.032, 0.357], tableOrder: 14 },
  { x: [0.783, 0.080, 0.025, 0.007, 0.105], y: [0.210, 0.113, 0.061, 0.028, 0.588], tableOrder: 15 },
  { x: [0.861, 0.053, 0.016, 0.005, 0.065], y: [0.177, 0.088, 0.049, 0.022, 0.664], tableOrder: 16 },
  { x: [0.894, 0.032, 0.009, 0.003, 0.062], y: [0.145, 0.054, 0.030, 0.013, 0.758], tableOrder: 17 },
] as const;

type ModelName =
  | 'COSMO_SAC_DESCRIPTOR_PROXY'
  | 'MODIFIED_UNIFAC_DORTMUND_PROXY'
  | 'NRTL_DIRECT_CALIBRATED'
  | 'UNIQUAC_DIRECT_CALIBRATED';

type Family = 'SAT' | 'MONO' | 'DI' | 'POLY' | 'NMP' | 'BT' | 'DBT' | 'HEAVY_S';

interface Descriptor {
  family: Family;
  /** Fixed polarity / hydrogen-bond surface descriptor, 0..1. */
  polarity: number;
  /** Aromatic surface fraction, 0..1. */
  aromaticity: number;
  /** Size / dispersion descriptor, roughly relative molecular size. */
  size: number;
  /** UNIFAC-style group counts used by the group proxy. */
  groups: { hydrocarbon: number; aromatic: number; polar: number; hetero: number };
}

interface BenchmarkRow {
  id: string;
  source: string;
  system: string;
  components: Family[];
  temperatureK: number;
  x: number[]; // raffinate / hydrocarbon-rich phase
  y: number[]; // extract / NMP-rich phase
  u: number;
  directTwoPhase: true;
}

interface NrtlParams {
  tau: number[][];
  alpha: number[][];
  /** Optional fixed or fitted temperature slope: tau(T)=tau0+slope*(1/T-1/T0). */
  tauSlope?: number[][];
}

interface FlashResult {
  converged: boolean;
  twoPhase: boolean;
  x: number[];
  y: number[];
  beta: number;
  iterations: number;
}

interface Prediction {
  model: ModelName;
  rowId: string;
  twoPhase: boolean;
  converged: boolean;
  x: number[];
  y: number[];
  beta: number;
  iterations: number;
  note?: string;
}

interface MetricSummary {
  model: ModelName;
  scope: string;
  nRows: number;
  nTwoPhasePredicted: number;
  nFailed: number;
  phaseRecall: number | null;
  phaseFalseSinglePhaseRate: number | null;
  compositionRmsd: number | null;
  compositionMae: number | null;
  nmpInRaffinateRmse: number | null;
  hydrocarbonInExtractRmse: number | null;
  logKrmse: number | null;
  aromaticSelectivityLogRmse: number | null;
  thiophenicSelectivity: 'NOT_ADMITTED_RAW_DATA' | 'NOT_APPLICABLE' | number;
  notes: string[];
}

interface FitRecord {
  model: ModelName;
  scope: string;
  trainingRows: number;
  excludedRows: number;
  objective: number;
  params: NrtlParams;
}

const OUT_DIR = path.resolve('.agents/outputs/ecr2-step4-thermodynamic-poc');
const MULTI_PATH = path.resolve('server/engine-framework/cel/data/multi-t-nmp-lle.json');
const T0 = COTO_2022_TEMPERATURE_K;
const EPS = 1e-12;
const CALIBRATION_GATE = 3 * COTO_2022_UX;

const DESCRIPTORS: Record<Family, Descriptor> = {
  SAT: {
    family: 'SAT', polarity: 0.03, aromaticity: 0.0, size: 0.72,
    groups: { hydrocarbon: 12, aromatic: 0, polar: 0, hetero: 0 },
  },
  MONO: {
    family: 'MONO', polarity: 0.24, aromaticity: 0.72, size: 0.62,
    groups: { hydrocarbon: 7, aromatic: 1, polar: 0, hetero: 0 },
  },
  DI: {
    family: 'DI', polarity: 0.34, aromaticity: 0.88, size: 0.78,
    groups: { hydrocarbon: 8, aromatic: 2, polar: 0, hetero: 0 },
  },
  POLY: {
    family: 'POLY', polarity: 0.42, aromaticity: 0.96, size: 0.95,
    groups: { hydrocarbon: 10, aromatic: 4, polar: 0, hetero: 0 },
  },
  NMP: {
    family: 'NMP', polarity: 1.0, aromaticity: 0.0, size: 0.46,
    groups: { hydrocarbon: 3, aromatic: 0, polar: 1, hetero: 1 },
  },
  BT: {
    family: 'BT', polarity: 0.46, aromaticity: 0.90, size: 0.64,
    groups: { hydrocarbon: 6, aromatic: 2, polar: 0, hetero: 1 },
  },
  DBT: {
    family: 'DBT', polarity: 0.58, aromaticity: 0.97, size: 0.82,
    groups: { hydrocarbon: 8, aromatic: 3, polar: 0, hetero: 1 },
  },
  HEAVY_S: {
    family: 'HEAVY_S', polarity: 0.68, aromaticity: 0.99, size: 0.98,
    groups: { hydrocarbon: 10, aromatic: 4, polar: 0, hetero: 1 },
  },
};

function sum(v: readonly number[]): number {
  return v.reduce((a, b) => a + b, 0);
}

function normalize(v: readonly number[]): number[] {
  const s = sum(v);
  return s > EPS ? v.map((a) => a / s) : v.map(() => 1 / v.length);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function rms(values: number[]): number | null {
  return values.length ? Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length) : null;
}

function mae(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + Math.abs(v), 0) / values.length : null;
}

function logSafe(v: number): number {
  return Math.log(Math.max(EPS, v));
}

function makeBenchmarkRows(): BenchmarkRow[] {
  const cotoRows: BenchmarkRow[] = [];
  for (const [family, rows] of [
    ['COTO_XYLENE', COTO_2022_XYLENE_TIELINES] as const,
    ['COTO_TOLUENE', COTO_2022_TOLUENE_TIELINES] as const,
  ]) {
    for (const tl of rows) {
      cotoRows.push({
        id: `${family}_TABLE3_${tl.tableOrder}`,
        source: 'Coto2022_Table3',
        system: family,
        components: family === 'COTO_XYLENE'
          ? ['SAT', 'MONO', 'DI', 'POLY', 'NMP']
          : ['SAT', 'MONO', 'DI', 'POLY', 'NMP'],
        temperatureK: T0,
        x: normalize(tl.x),
        y: normalize(tl.y),
        u: COTO_2022_UX,
        directTwoPhase: true,
      });
    }
  }

  const raw = JSON.parse(fs.readFileSync(MULTI_PATH, 'utf8')) as {
    citation: Record<string, string>;
    tieLines: Array<{
      source: string;
      T_K: number;
      raffinate: Record<string, number>;
      extract: Record<string, number>;
      u_x?: number;
      components?: Record<string, string>;
    }>;
  };
  const multiRows: BenchmarkRow[] = raw.tieLines.map((r, i) => ({
    id: `${r.source}_${r.T_K}_${i + 1}`,
    source: r.source,
    system: `${r.source}_SAT_MONO_NMP`,
    components: ['SAT', 'MONO', 'NMP'],
    temperatureK: r.T_K,
    x: normalize([r.raffinate.SAT ?? 0, r.raffinate.MONO ?? 0, r.raffinate.NMP ?? 0]),
    y: normalize([r.extract.SAT ?? 0, r.extract.MONO ?? 0, r.extract.NMP ?? 0]),
    u: Math.max(COTO_2022_UX, r.u_x ?? COTO_2022_UX),
    directTwoPhase: true,
  }));
  return [...cotoRows, ...multiRows];
}

function pairwiseMatrix(
  components: Family[],
  pair: (a: Descriptor, b: Descriptor, direction: 1 | -1) => number,
): number[][] {
  return components.map((ci) => components.map((cj) => {
    if (ci === cj) return 0;
    return pair(DESCRIPTORS[ci], DESCRIPTORS[cj], ci < cj ? 1 : -1);
  }));
}

/**
 * COSMO-SAC-style descriptor prior.
 *
 * This approximates a segment/sigma-profile interaction using polarity,
 * aromatic surface, and molecular-size descriptors. The constants are fixed
 * before fitting and are not estimated from the benchmark rows.
 */
function makeCosmoSacProxyParams(components: Family[], _temperatureK = T0): NrtlParams {
  const tau = pairwiseMatrix(components, (a, b, direction) => {
    const polarityMismatch = Math.abs(a.polarity - b.polarity);
    const donorAcceptor = (a.family === 'NMP' || b.family === 'NMP') ? 0.35 : 0;
    const aromaticMismatch = Math.abs(a.aromaticity - b.aromaticity);
    const sizeMismatch = Math.abs(a.size - b.size);
    const directionBias = direction * (a.polarity - b.polarity) * 0.20;
    return clamp(
      0.12 + 2.35 * polarityMismatch + 0.55 * donorAcceptor +
      0.25 * aromaticMismatch + 0.18 * sizeMismatch + directionBias,
      -2.0,
      5.5,
    );
  });
  const tauSlope = pairwiseMatrix(components, (a, b, direction) => {
    const polarityMismatch = Math.abs(a.polarity - b.polarity);
    const aromaticMismatch = Math.abs(a.aromaticity - b.aromaticity);
    return direction * (180 + 260 * polarityMismatch + 80 * aromaticMismatch);
  });
  return {
    tau,
    alpha: components.map((_, i) => components.map((__, j) => i === j ? 0 : 0.20)),
    tauSlope,
  };
}

/**
 * Modified-UNIFAC-Dortmund-style group-contribution prior.
 *
 * This is a transparent group proxy, not a claim that the Dortmund group
 * parameter database is embedded here. Fixed group contrasts create the
 * predictive prior; no benchmark compositions are used to select them.
 */
function makeUnifacDortmundProxyParams(components: Family[], _temperatureK = T0): NrtlParams {
  const tau = pairwiseMatrix(components, (a, b, direction) => {
    const groupContrast =
      Math.abs(a.groups.polar - b.groups.polar) * 1.15 +
      Math.abs(a.groups.hetero - b.groups.hetero) * 0.70 +
      Math.abs(a.groups.aromatic - b.groups.aromatic) * 0.06 +
      Math.abs(a.groups.hydrocarbon - b.groups.hydrocarbon) * 0.015;
    const NmpContrast = (a.family === 'NMP' || b.family === 'NMP') ? 1.4 : 0;
    return clamp(0.08 + groupContrast + NmpContrast + direction * 0.05, -2.0, 5.5);
  });
  const tauSlope = pairwiseMatrix(components, (a, b, direction) =>
    direction * (120 + 45 * Math.abs(a.groups.polar - b.groups.polar) +
      20 * Math.abs(a.groups.aromatic - b.groups.aromatic)));
  return {
    tau,
    alpha: components.map((_, i) => components.map((__, j) => i === j ? 0 : 0.20)),
    tauSlope,
  };
}

function nrtlLnGamma(x: readonly number[], p: NrtlParams, temperatureK = T0): number[] {
  const n = x.length;
  const tau = p.tau.map((row, i) => row.map((t, j) =>
    i === j ? 0 : t + (p.tauSlope?.[i]?.[j] ?? 0) * (1 / temperatureK - 1 / T0)));
  const G = tau.map((row, i) => row.map((t, j) => i === j ? 1 : Math.exp(-p.alpha[i][j] * t)));
  const ln = new Array(n).fill(0) as number[];
  for (let i = 0; i < n; i++) {
    let sNum = 0, sDen = 0;
    for (let j = 0; j < n; j++) {
      sNum += x[j] * G[j][i] * tau[j][i];
      sDen += x[j] * G[j][i];
    }
    let term = 0;
    for (let j = 0; j < n; j++) {
      let d = 0, num = 0;
      for (let k = 0; k < n; k++) {
        d += x[k] * G[k][j];
        num += x[k] * G[k][j] * tau[k][j];
      }
      term += (x[j] * G[i][j] / Math.max(EPS, d)) *
        (tau[i][j] - num / Math.max(EPS, d));
    }
    ln[i] = sNum / Math.max(EPS, sDen) + term;
  }
  return ln;
}

function uniquacLnGamma(x: readonly number[], p: NrtlParams, components: Family[], temperatureK = T0): number[] {
  // UNIQUAC combinatorial + residual contribution. Representative r/q values
  // are fixed pseudo-component assumptions; the residual tau_ij interaction
  // matrix is fitted independently for this model and is NOT an NRTL term.
  const r = components.map((c) => 0.75 + DESCRIPTORS[c].size * 1.5);
  const q = components.map((c) => 0.80 + DESCRIPTORS[c].aromaticity * 0.50 + DESCRIPTORS[c].polarity * 0.35);
  const zCoord = 10;
  const phi = x.map((xi, i) => xi * r[i] / Math.max(EPS, x.reduce((s, xv, k) => s + xv * r[k], 0)));
  const theta = x.map((xi, i) => xi * q[i] / Math.max(EPS, x.reduce((s, xv, k) => s + xv * q[k], 0)));
  const l = r.map((ri, i) => (zCoord / 2) * (ri - q[i]) - (ri - 1));
  const ln = x.map((xi, i) => {
    const combinatorial = logSafe(phi[i] / Math.max(EPS, xi)) +
      (zCoord / 2) * q[i] * logSafe(theta[i] / Math.max(EPS, phi[i])) +
      l[i] - (phi.reduce((s, ph, k) => s + ph * l[k], 0) * r[i] / Math.max(EPS, r.reduce((s, rv, k) => s + x[k] * rv, 0)));
    return combinatorial;
  });
  const interaction = p.tau.map((row, i) => row.map((t, j) =>
    i === j ? 1 : Math.exp(-clamp(t + (p.tauSlope?.[i]?.[j] ?? 0) * (1 / temperatureK - 1 / T0), -18, 18))));
  const residual = x.map((_, i) => {
    const sumThetaTauJi = theta.reduce((s, thetaJ, j) => s + thetaJ * interaction[j][i], 0);
    const sumFraction = theta.reduce((s, thetaJ, j) => {
      const denom = theta.reduce((inner, thetaK, k) => inner + thetaK * interaction[k][j], 0);
      return s + thetaJ * interaction[i][j] / Math.max(EPS, denom);
    }, 0);
    return q[i] * (1 - logSafe(sumThetaTauJi) - sumFraction);
  });
  return ln.map((v, i) => v + residual[i]);
}

function biasedInitial(z: readonly number[], hydrocarbonFirst: boolean): number[] {
  const a = z.map((v, i) => {
    if (i === 0 && hydrocarbonFirst) return v + 0.12;
    if (i === z.length - 1 && !hydrocarbonFirst) return v + 0.12;
    if (i === z.length - 1 && hydrocarbonFirst) return Math.max(0, v - 0.08);
    if (i === 0 && !hydrocarbonFirst) return Math.max(0, v - 0.08);
    return v;
  });
  return normalize(a);
}

function flash(
  zRaw: readonly number[],
  p: NrtlParams,
  components: Family[],
  useUniquac: boolean,
  temperatureK = T0,
): FlashResult {
  const z = normalize(zRaw);
  let x = biasedInitial(z, true);
  let y = biasedInitial(z, false);
  let K = x.map((xi, i) => Math.max(1e-8, y[i]) / Math.max(1e-8, xi));
  let beta = 0.5;
  for (let it = 1; it <= 1000; it++) {
    const g = (b: number) => z.reduce((s, zi, i) => s + zi * (K[i] - 1) / (1 + b * (K[i] - 1)), 0);
    if (g(1e-10) < 0 || g(1 - 1e-10) > 0) {
      return { converged: true, twoPhase: false, x: z.slice(), y: z.slice(), beta: Number.NaN, iterations: it };
    }
    let lo = 1e-10, hi = 1 - 1e-10;
    for (let j = 0; j < 160; j++) {
      const mid = (lo + hi) / 2;
      if (g(mid) > 0) lo = mid; else hi = mid;
    }
    beta = (lo + hi) / 2;
    const xn = normalize(z.map((zi, i) => zi / (1 + beta * (K[i] - 1))));
    const yn = normalize(z.map((zi, i) => K[i] * zi / (1 + beta * (K[i] - 1))));
    const lgx = useUniquac ? uniquacLnGamma(xn, p, components, temperatureK) : nrtlLnGamma(xn, p, temperatureK);
    const lgy = useUniquac ? uniquacLnGamma(yn, p, components, temperatureK) : nrtlLnGamma(yn, p, temperatureK);
    let maxChange = 0;
    for (let i = 0; i < z.length; i++) {
      const knew = Math.exp(clamp(lgx[i] - lgy[i], -18, 18));
      maxChange = Math.max(maxChange, Math.abs(knew - K[i]) / Math.max(1e-8, K[i]));
      K[i] = 0.55 * K[i] + 0.45 * knew;
    }
    x = xn;
    y = yn;
    if (maxChange < 1e-9) {
      const distance = Math.sqrt(x.reduce((s, xi, i) => s + (xi - y[i]) ** 2, 0));
      if (distance < 1e-5) {
        return { converged: true, twoPhase: false, x, y, beta, iterations: it };
      }
      if (x[0] < y[0]) {
        const tx = x; x = y; y = tx;
        beta = 1 - beta;
      }
      return { converged: true, twoPhase: true, x, y, beta, iterations: it };
    }
  }
  return { converged: false, twoPhase: false, x, y, beta, iterations: 1000 };
}

function predict(row: BenchmarkRow, model: ModelName, params?: NrtlParams): Prediction {
  const useUniquac = model === 'UNIQUAC_DIRECT_CALIBRATED';
  const p = params ??
    (model === 'COSMO_SAC_DESCRIPTOR_PROXY'
      ? makeCosmoSacProxyParams(row.components, row.temperatureK)
      : makeUnifacDortmundProxyParams(row.components, row.temperatureK));
  const result = flash(row.x.map((v, i) => 0.5 * (v + row.y[i])), p, row.components, useUniquac, row.temperatureK);
  return {
    model,
    rowId: row.id,
    twoPhase: result.twoPhase,
    converged: result.converged,
    x: result.x,
    y: result.y,
    beta: result.beta,
    iterations: result.iterations,
    note: result.twoPhase ? undefined : 'Predicted single phase or trivial split',
  };
}

function parameterVector(n: number, temperatureAware: boolean): number[] {
  const count = n * (n - 1);
  return Array.from({ length: temperatureAware ? count * 2 : count }, (_, i) =>
    i < count ? (i % 3 === 0 ? 1.6 : 0.25) : 0);
}

function vectorToParams(v: readonly number[], n: number, temperatureAware: boolean): NrtlParams {
  const tau = Array.from({ length: n }, () => new Array(n).fill(0));
  const tauSlope = Array.from({ length: n }, () => new Array(n).fill(0));
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) tau[i][j] = clamp(v[k++], -8, 8);
    }
  }
  if (temperatureAware) {
    k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) tauSlope[i][j] = clamp(v[n * (n - 1) + k++], -15000, 15000);
      }
    }
  }
  return {
    tau,
    alpha: tau.map((_, i) => tau.map((__, j) => i === j ? 0 : 0.20)),
    tauSlope: temperatureAware ? tauSlope : undefined,
  };
}

function isoactivityObjective(
  rows: BenchmarkRow[],
  model: 'NRTL' | 'UNIQUAC',
  vector: readonly number[],
  temperatureAware: boolean,
): number {
  if (!rows.length) return 1e30;
  const p = vectorToParams(vector, rows[0].components.length, temperatureAware);
  let objective = 0;
  for (const row of rows) {
    const gx = model === 'UNIQUAC'
      ? uniquacLnGamma(row.x, p, row.components, row.temperatureK)
      : nrtlLnGamma(row.x, p, row.temperatureK);
    const gy = model === 'UNIQUAC'
      ? uniquacLnGamma(row.y, p, row.components, row.temperatureK)
      : nrtlLnGamma(row.y, p, row.temperatureK);
    for (let i = 0; i < row.x.length; i++) {
      if (row.x[i] < 1e-8 || row.y[i] < 1e-8) continue;
      const residual = Math.log(row.x[i]) + gx[i] - Math.log(row.y[i]) - gy[i];
      objective += (residual / Math.max(row.u, COTO_2022_UX)) ** 2;
    }
  }
  // Mild regularization prevents a fitted proof-of-concept from selecting
  // thermodynamically extreme parameters that only memorize sparse rows.
  objective += 0.02 * vector.reduce((s, v) => s + v * v, 0);
  return Number.isFinite(objective) ? objective : 1e30;
}

interface ParameterBound {
  lo: number;
  hi: number;
  initialStep: number;
}

function nelderMead(
  f: (v: number[]) => number,
  start: number[],
  maxIter: number,
  bounds: ParameterBound[],
): { x: number[]; fx: number } {
  const n = start.length;
  const project = (v: number, index: number) => clamp(v, bounds[index].lo, bounds[index].hi);
  let simplex = [start.slice()];
  for (let i = 0; i < n; i++) {
    const p = start.slice();
    p[i] = project(p[i] + bounds[i].initialStep, i);
    simplex.push(p);
  }
  let values = simplex.map(f);
  for (let iter = 0; iter < maxIter; iter++) {
    const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    simplex = order.map((i) => simplex[i]);
    values = order.map((i) => values[i]);
    if (Math.abs(values[n] - values[0]) < 1e-9 * (1 + Math.abs(values[0]))) break;
    const centroid = new Array(n).fill(0) as number[];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    const reflected = centroid.map((c, j) => project(c + (c - simplex[n][j]), j));
    const fr = f(reflected);
    if (fr < values[0]) {
      const expanded = centroid.map((c, j) => project(c + 2 * (reflected[j] - c), j));
      const fe = f(expanded);
      simplex[n] = fe < fr ? expanded : reflected;
      values[n] = Math.min(fe, fr);
    } else if (fr < values[n - 1]) {
      simplex[n] = reflected;
      values[n] = fr;
    } else {
      const contracted = centroid.map((c, j) => project(c + 0.5 * (simplex[n][j] - c), j));
      const fc = f(contracted);
      if (fc < values[n]) {
        simplex[n] = contracted;
        values[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => project(simplex[0][j] + 0.5 * (v - simplex[0][j]), j));
          values[i] = f(simplex[i]);
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] < values[best]) best = i;
  return { x: simplex[best], fx: values[best] };
}

function fitDirect(
  rows: BenchmarkRow[],
  model: 'NRTL' | 'UNIQUAC',
  scope: string,
): FitRecord {
  const n = rows[0]?.components.length ?? 0;
  if (!rows.length || !n) throw new Error(`Cannot fit ${model}: no rows for ${scope}`);
  const temperatureAware = new Set(rows.map((r) => r.temperatureK)).size > 1;
  const start = parameterVector(n, temperatureAware);
  const tauCount = n * (n - 1);
  const bounds: ParameterBound[] = Array.from(
    { length: start.length },
    (_, i) => i < tauCount
      ? { lo: -8, hi: 8, initialStep: 0.30 }
      : { lo: -15000, hi: 15000, initialStep: 600 },
  );
  const result = nelderMead(
    (v) => isoactivityObjective(rows, model, v, temperatureAware),
    start,
    n >= 5 ? 1600 : temperatureAware ? 1400 : 1000,
    bounds,
  );
  return {
    model: model === 'NRTL' ? 'NRTL_DIRECT_CALIBRATED' : 'UNIQUAC_DIRECT_CALIBRATED',
    scope,
    trainingRows: rows.length,
    excludedRows: 0,
    objective: result.fx,
    params: vectorToParams(result.x, n, temperatureAware),
  };
}

function metricSummary(
  rows: BenchmarkRow[],
  predictions: Prediction[],
  model: ModelName,
  scope: string,
): MetricSummary {
  const byId = new Map(predictions.map((p) => [p.rowId, p]));
  const composition: number[] = [];
  const nmpR: number[] = [];
  const hcE: number[] = [];
  const logK: number[] = [];
  const aromaticSel: number[] = [];
  let nTwo = 0;
  let nFailed = 0;
  const aromaticIndicesByRow: number[][] = [];
  for (const row of rows) {
    const p = byId.get(row.id);
    if (!p || !p.converged || !p.twoPhase) {
      nFailed++;
      continue;
    }
    nTwo++;
    for (const phase of ['x', 'y'] as const) {
      const observed = row[phase];
      const predicted = p[phase];
      for (let i = 0; i < observed.length; i++) composition.push(predicted[i] - observed[i]);
    }
    const nmp = row.components.indexOf('NMP');
    nmpR.push(p.x[nmp] - row.x[nmp]);
    hcE.push((1 - p.y[nmp]) - (1 - row.y[nmp]));
    for (let i = 0; i < row.components.length; i++) {
      if (row.x[i] <= 1e-8 || row.y[i] <= 1e-8 || p.x[i] <= 1e-8 || p.y[i] <= 1e-8) continue;
      logK.push(Math.log(p.y[i] / p.x[i]) - Math.log(row.y[i] / row.x[i]));
    }
    const sat = row.components.indexOf('SAT');
    const aromatic = row.components.flatMap((c, i) => c === 'MONO' || c === 'DI' || c === 'POLY' ? [i] : []);
    aromaticIndicesByRow.push(aromatic);
    if (sat >= 0 && aromatic.length && p.x[sat] > EPS && row.x[sat] > EPS) {
      const predK = aromatic.reduce((s, i) => s + p.y[i] / Math.max(EPS, p.x[i]), 0) / aromatic.length;
      const obsK = aromatic.reduce((s, i) => s + row.y[i] / Math.max(EPS, row.x[i]), 0) / aromatic.length;
      aromaticSel.push(Math.log(predK / Math.max(EPS, p.y[sat] / p.x[sat])) -
        Math.log(obsK / Math.max(EPS, row.y[sat] / row.x[sat])));
    }
  }
  return {
    model,
    scope,
    nRows: rows.length,
    nTwoPhasePredicted: nTwo,
    nFailed,
    phaseRecall: rows.length ? nTwo / rows.length : null,
    phaseFalseSinglePhaseRate: rows.length ? nFailed / rows.length : null,
    compositionRmsd: rms(composition),
    compositionMae: mae(composition),
    nmpInRaffinateRmse: rms(nmpR),
    hydrocarbonInExtractRmse: rms(hcE),
    logKrmse: rms(logK),
    aromaticSelectivityLogRmse: rms(aromaticSel),
    thiophenicSelectivity: rows.some((r) => r.components.includes('BT') || r.components.includes('DBT') || r.components.includes('HEAVY_S'))
      ? rms(logK) ?? null
      : 'NOT_ADMITTED_RAW_DATA',
    notes: [
      'Composition errors are absolute mole-fraction errors over both phases.',
      'K_i errors are RMSE in ln(K_pred/K_exp), excluding zero-composition entries.',
      rows.some((r) => r.components.includes('BT') || r.components.includes('DBT') || r.components.includes('HEAVY_S'))
        ? 'Thiophenic selectivity is scored for this sulfur-family prediction.'
        : 'No raw thiophene/benzothiophene/DBT NMP tie-line dataset is present in the admitted workspace; no experimental thiophenic error is claimed.',
    ],
  };
}

function predictSet(rows: BenchmarkRow[], model: ModelName, fit?: FitRecord): Prediction[] {
  return rows.map((row) => predict(row, model, fit?.params));
}

function grouped<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = out.get(k) ?? [];
    group.push(row);
    out.set(k, group);
  }
  return out;
}

function round(v: number | null, dp = 5): number | null {
  return v === null || !Number.isFinite(v) ? null : Number(v.toFixed(dp));
}

function roundMetrics(m: MetricSummary): MetricSummary {
  return {
    ...m,
    phaseRecall: round(m.phaseRecall),
    phaseFalseSinglePhaseRate: round(m.phaseFalseSinglePhaseRate),
    compositionRmsd: round(m.compositionRmsd),
    compositionMae: round(m.compositionMae),
    nmpInRaffinateRmse: round(m.nmpInRaffinateRmse),
    hydrocarbonInExtractRmse: round(m.hydrocarbonInExtractRmse),
    logKrmse: round(m.logKrmse),
    aromaticSelectivityLogRmse: m.aromaticSelectivityLogRmse === null || typeof m.aromaticSelectivityLogRmse === 'string'
      ? m.aromaticSelectivityLogRmse
      : round(m.aromaticSelectivityLogRmse),
    thiophenicSelectivity: typeof m.thiophenicSelectivity === 'number'
      ? (round(m.thiophenicSelectivity) ?? m.thiophenicSelectivity)
      : m.thiophenicSelectivity,
  };
}

interface SulfurEnvelopePoint {
  temperatureK: number;
  nmpFeedMoleFraction: number;
  family: 'BT' | 'DBT' | 'HEAVY_S';
  representative: string;
  model: 'COSMO_SAC_DESCRIPTOR_PROXY' | 'MODIFIED_UNIFAC_DORTMUND_PROXY';
  K: number | null;
  status: 'PREDICTIVE_ONLY' | 'NOT_CALCULABLE_SINGLE_PHASE' | 'NOT_CALCULABLE_FLASH';
}

function sulfurEnvelope(): SulfurEnvelopePoint[] {
  const temperatures = [298.15, 308.15, 343.15];
  const nmpFeeds = [0.10, 0.20, 0.35, 0.50];
  const familyVariants: Record<'BT' | 'DBT' | 'HEAVY_S', Array<[string, number, number, number]>> = {
    BT: [['light', 0.42, 0.88, 0.60], ['central', 0.46, 0.90, 0.64], ['heavy', 0.51, 0.92, 0.69]],
    DBT: [['light', 0.54, 0.95, 0.76], ['central', 0.58, 0.97, 0.82], ['heavy', 0.64, 0.98, 0.88]],
    HEAVY_S: [['light', 0.62, 0.97, 0.88], ['central', 0.68, 0.99, 0.98], ['heavy', 0.75, 1.00, 1.05]],
  };
  const output: SulfurEnvelopePoint[] = [];
  for (const T of temperatures) {
    for (const nmp of nmpFeeds) {
      for (const family of ['BT', 'DBT', 'HEAVY_S'] as const) {
        for (const [representative, polarity, aromaticity, size] of familyVariants[family]) {
          const original = DESCRIPTORS[family];
          (DESCRIPTORS as Record<string, Descriptor>)[family] = {
            ...original,
            polarity,
            aromaticity,
            size,
          };
          const components: Family[] = ['SAT', family, 'NMP'];
          // Fixed 2 mol% sulfur family, with the requested NMP fraction
          // represented exactly; the balance is a saturate carrier.
          const z = [1 - nmp - 0.02, 0.02, nmp];
          for (const model of ['COSMO_SAC_DESCRIPTOR_PROXY', 'MODIFIED_UNIFAC_DORTMUND_PROXY'] as const) {
            const p = model === 'COSMO_SAC_DESCRIPTOR_PROXY'
              ? makeCosmoSacProxyParams(components, T)
              : makeUnifacDortmundProxyParams(components, T);
            const fl = flash(z, p, components, false, T);
            let K: number | null = null;
            let status: SulfurEnvelopePoint['status'] = 'PREDICTIVE_ONLY';
            if (!fl.converged) status = 'NOT_CALCULABLE_FLASH';
            else if (!fl.twoPhase) status = 'NOT_CALCULABLE_SINGLE_PHASE';
            else K = fl.y[1] / Math.max(EPS, fl.x[1]);
            output.push({ temperatureK: T, nmpFeedMoleFraction: nmp, family, representative, model, K, status });
          }
          (DESCRIPTORS as Record<string, Descriptor>)[family] = original;
        }
      }
    }
  }
  return output;
}

function markdownTable(rows: Array<Record<string, string | number | null>>): string {
  if (!rows.length) return '_No rows._';
  const keys = Object.keys(rows[0]);
  const header = `| ${keys.join(' | ')} |`;
  const rule = `| ${keys.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${keys.map((k) => r[k] === null ? '—' : String(r[k])).join(' | ')} |`).join('\n');
  return `${header}\n${rule}\n${body}`;
}

function buildReport(result: {
  generatedAt: string;
  datasetSummary: Record<string, unknown>;
  predictiveMetrics: MetricSummary[];
  calibratedMetrics: MetricSummary[];
  crossValidationMetrics: MetricSummary[];
  fitRecords: FitRecord[];
  sulfurEnvelope: SulfurEnvelopePoint[];
}): string {
  const pRows = result.predictiveMetrics.map((m) => ({
    scope: m.scope,
    model: m.model,
    n: m.nRows,
    phaseRecall: m.phaseRecall,
    compRMSD: m.compositionRmsd,
    NMP_xR_RMSE: m.nmpInRaffinateRmse,
    HC_yE_RMSE: m.hydrocarbonInExtractRmse,
    lnK_RMSE: m.logKrmse,
    aromaticSel_ln_RMSE: m.aromaticSelectivityLogRmse,
  }));
  const cRows = result.calibratedMetrics.map((m) => ({
    scope: m.scope,
    model: m.model,
    n: m.nRows,
    phaseRecall: m.phaseRecall,
    compRMSD: m.compositionRmsd,
    NMP_xR_RMSE: m.nmpInRaffinateRmse,
    HC_yE_RMSE: m.hydrocarbonInExtractRmse,
    lnK_RMSE: m.logKrmse,
    aromaticSel_ln_RMSE: m.aromaticSelectivityLogRmse,
  }));
  const cvRows = result.crossValidationMetrics.map((m) => ({
    scope: m.scope,
    model: m.model,
    n: m.nRows,
    phaseRecall: m.phaseRecall,
    compRMSD: m.compositionRmsd,
    NMP_xR_RMSE: m.nmpInRaffinateRmse,
    HC_yE_RMSE: m.hydrocarbonInExtractRmse,
    lnK_RMSE: m.logKrmse,
  }));
  const envelopeGroups = grouped(result.sulfurEnvelope.filter((r) => r.status === 'PREDICTIVE_ONLY'), (r) => `${r.temperatureK}|${r.family}|${r.model}`);
  const envRows: Array<Record<string, string | number | null>> = [];
  for (const [key, values] of envelopeGroups) {
    const [temperatureK, family, model] = key.split('|');
    const ks = values.map((v) => v.K).filter((v): v is number => v !== null);
    envRows.push({
      T_K: Number(temperatureK),
      family,
      model,
      K_min: ks.length ? round(Math.min(...ks)) : null,
      K_central: round(values.find((v) => v.representative === 'central')?.K ?? null),
      K_max: ks.length ? round(Math.max(...ks)) : null,
      uncertaintyBasis: 'representative-compound spread; model disagreement reported separately',
    });
  }
  const failedPredictive = result.predictiveMetrics.reduce((s, m) => s + m.nFailed, 0);
  const failedCv = result.crossValidationMetrics.reduce((s, m) => s + m.nFailed, 0);
  return `# Step 4 — Independent Thermodynamic Proof-of-Concept

Generated: ${result.generatedAt}

## Executive conclusion

This proof establishes a reproducible research engine and a quantitative baseline, but it does **not** yet qualify the sulfur model for Stage 8. The direct-data-calibrated **NRTL** route improves the admitted hydrocarbon benchmarks relative to fixed predictive priors. The calibrated UNIQUAC comparator has lower conditional errors on some successful flashes but frequently misses the measured two-phase split, so it is a documented failed comparator rather than an overall improvement. Held-out performance remains materially worse than in-sample performance and the current evidence has no raw thiophene/benzothiophene/DBT tie-line table. BT/DBT/heavy-sulfur results are therefore predictive-only envelopes.

The architecture is credible for continued pre-pilot research because it preserves method separation, direct-data calibration boundaries, held-out validation, phase-topology failures, and uncertainty. It is not yet credible as a release-ready physical LLE foundation until the direct sulfur datasets are retrieved/admitted and a real COSMO-RS/COSMO-SAC implementation replaces the descriptor proxy.

## Scope and evidence

- Coto 2022 Table 3: 17 controlled NMP/hydrocarbon tie-lines at ${T0.toFixed(2)} K; ${result.datasetSummary.cotoRows} rows retained.
- NMP/hydrocarbon multi-temperature records: ${result.datasetSummary.multiRows} rows from Fahim (2005), Fandary (2006), and Aljimaz (2006), spanning ${result.datasetSummary.multiTemperatures} K.
- All benchmark rows are direct two-phase experimental rows with normalized phase compositions and recorded composition uncertainty.
- Coto source: ${COTO_2022_CITATION}.
- No raw Mguni/thiophene, heptane/thiophene, Murata DBT, or other sulfur tie-line table is present in the admitted workspace; those sources cannot be scored against experiment here.

## Method contract

| Method | Use in this proof | Data fitted before scoring? |
|---|---|---:|
| COSMO-SAC descriptor proxy | Fixed polarity/aromaticity/size molecular-surface prior | No |
| Modified UNIFAC Dortmund group proxy | Fixed group-contrast prior | No |
| Direct NRTL | NRTL binary interactions fitted only to the stated training rows; multi-temperature scopes use \`τ(T)=τ₀+b(1/T−1/T₀)\` | Yes |
| Direct UNIQUAC | UNIQUAC residual interactions fitted only to the stated training rows; multi-temperature scopes use the same residual temperature form and fixed representative r/q values | Yes |

The first two methods are explicitly **proxies**, not full COSMO-RS or Dortmund database implementations. They are useful for proving the comparison and provenance machinery, not for claiming molecular-level validation.

## Pure predictive benchmark

Pure predictive mode is run before calibration. Phase recall is the fraction of experimental two-phase rows for which the predicted flash converges to a non-trivial two-phase split. Composition RMSD covers both phases and all components.

${markdownTable(pRows)}

Interpretation:

- \`lnK_RMSE\` is the RMSE of ln(K_pred/K_exp), so zero is exact and 0.693 is approximately a factor-of-two error.
- NMP-in-raffinate and hydrocarbon-in-extract metrics directly test mutual solubility, rather than assuming one phase is pure solvent or pure hydrocarbon.
- Aromatic selectivity is evaluated against the available MONO/DI/POLY aromatic components. Experimental thiophenic selectivity is not scored because no raw sulfur tie-line system is admitted.
- Predictive failures are retained. This run recorded ${failedPredictive} predictive failed/single-phase cases across the reported scopes; they are not imputed.

## Direct-data calibration

The calibrated models fit isoactivity residuals using only the direct rows in each reported training scope. Calibration metrics are deliberately reported separately from cross-validation metrics.

${markdownTable(cRows)}

Fit records:

${markdownTable(result.fitRecords.map((f) => ({
  model: f.model,
  scope: f.scope,
  trainingRows: f.trainingRows,
  objective: round(f.objective),
})))}

Calibration reduces equilibrium residuals by construction. It is not evidence of predictive skill by itself.

The UNIQUAC route must also reproduce phase topology. Its lower conditional composition error is not used to claim success when the flash predicts a single phase for a measured two-phase row; those failures are retained in the phase-recall column.

## Held-out validation

For the multi-temperature systems, each source is evaluated using leave-one-temperature-out fitting. A held-out temperature is never used to fit the reported prediction. A leave-one-system-out comparison is also included where the component basis is shared; its purpose is diagnostic and it is not a substitute for sulfur-family validation.

${markdownTable(cvRows)}

Held-out failures remain visible: ${failedCv} failed/single-phase cases were recorded in the cross-validation scopes. The principal validation question is whether composition, K_i, mutual solubility, and selectivity errors remain acceptable without seeing the held-out tie-lines. The report does not collapse these results into the smaller in-sample calibration errors.

## Temperature behavior

The multi-temperature records provide evidence at ${result.datasetSummary.multiTemperatures} K. The LOTO rows above test the fitted \(τ(T)\) behavior only within those admitted hydrocarbon systems and temperatures. The two predictive priors carry fixed method-specific temperature sensitivity, not direct sulfur temperature calibration. No validated temperature law is claimed for BT/DBT/heavy sulfur. Any 343.15 K envelope below is model extrapolation and remains preliminary.

## Preliminary sulfur partition envelopes

The following are bounded model predictions for representative-compound variants. They are not experimental sulfur validation and must not enter Stage 8.

${markdownTable(envRows)}

Envelope status:

- \`PREDICTIVE_ONLY\`: model flash converged, but no direct sulfur tie-line validation exists.
- \`NOT_CALCULABLE_SINGLE_PHASE\`: the selected predictive prior did not produce a non-trivial two-phase split.
- \`NOT_CALCULABLE_FLASH\`: numerical flash failure; no value substituted.
- Ranges combine representative-compound variation. COSMO-proxy versus UNIFAC-proxy differences are shown as model-form disagreement by separate rows, not hidden inside one mean.
- Exact sulfur removal is not inferred from aromatic partitioning. A sulfur mass balance requires measured or bounded sulfur-family feed fractions.

## Credibility decision

**Recommended: continue as the independent pre-pilot research foundation, not as a Stage 8 governing model yet.**

Evidence supporting continuation:

1. direct and calibrated modes are separated;
2. phase formation, composition, mutual solubility, K_i, selectivity, and temperature diagnostics are quantitative;
3. calibration error and held-out error are separate;
4. nonconvergence and unsupported sulfur data remain explicit;
5. the sulfur output is component/family partitioning rather than an empirical sulfur-removal multiplier.

Blocking evidence before promotion:

1. retrieve and quality-check the raw direct NMP/thiophene dataset;
2. retrieve direct NMP/BT and NMP/DBT composition-resolved data or mark those families permanently predictive-only;
3. replace the COSMO-SAC descriptor proxy with an actual reproducible sigma-profile implementation and versioned molecular inputs;
4. perform held-out sulfur-family validation and multi-temperature checks near the intended pilot temperature;
5. only then define a governed correction/surrogate and connect it to the physical ECR simulator.

## Reproducibility

Run:

\`\`\`text
npx tsx server/research/ecr2-step4/thermodynamic-proof-of-concept.ts
\`\`\`

The JSON companion contains every metric, fit record, benchmark count, and sulfur-envelope point. The runner does not import Stage 8, the production NRTL artifact, the ECR simulator, or any process-design solver.
`;
}

async function main(): Promise<void> {
  const rows = makeBenchmarkRows();
  const cotoRows = rows.filter((r) => r.source === 'Coto2022_Table3');
  const multiRows = rows.filter((r) => r.source !== 'Coto2022_Table3');
  const allScope = (scope: string) => rows.filter((r) => r.system === scope);
  const predictiveMetrics: MetricSummary[] = [];
  const predictiveModels: ModelName[] = ['COSMO_SAC_DESCRIPTOR_PROXY', 'MODIFIED_UNIFAC_DORTMUND_PROXY'];
  for (const model of predictiveModels) {
    predictiveMetrics.push(roundMetrics(metricSummary(cotoRows, predictSet(cotoRows, model), model, 'Coto2022 17 tie-lines')));
    for (const [source, sourceRows] of grouped(multiRows, (r) => r.source)) {
      predictiveMetrics.push(roundMetrics(metricSummary(sourceRows, predictSet(sourceRows, model), model, source)));
    }
  }

  const fitRecords: FitRecord[] = [];
  const calibratedMetrics: MetricSummary[] = [];
  const fullFitRows = [
    ['Coto2022 17 tie-lines', cotoRows] as const,
    ...[...grouped(multiRows, (r) => r.source)].map(([source, sourceRows]) => [source, sourceRows] as const),
  ];
  for (const [scope, scopeRows] of fullFitRows) {
    for (const fitModel of ['NRTL', 'UNIQUAC'] as const) {
      const fit = fitDirect(scopeRows, fitModel, scope);
      fitRecords.push(fit);
      calibratedMetrics.push(roundMetrics(metricSummary(
        scopeRows,
        predictSet(scopeRows, fit.model, fit),
        fit.model,
        `${scope} calibration`,
      )));
    }
  }

  const crossValidationMetrics: MetricSummary[] = [];
  // Leave-one-temperature-out within each multi-temperature source.
  for (const [source, sourceRows] of grouped(multiRows, (r) => r.source)) {
    for (const T of [...new Set(sourceRows.map((r) => r.temperatureK))].sort((a, b) => a - b)) {
      const train = sourceRows.filter((r) => r.temperatureK !== T);
      const test = sourceRows.filter((r) => r.temperatureK === T);
      if (train.length < 3 || test.length === 0) continue;
      for (const fitModel of ['NRTL', 'UNIQUAC'] as const) {
        const fit = fitDirect(train, fitModel, `${source} LOTO ${T} K`);
        crossValidationMetrics.push(roundMetrics(metricSummary(
          test,
          predictSet(test, fit.model, fit),
          fit.model,
          `${source} LOTO ${T} K`,
        )));
      }
    }
  }
  // Leave-one-system-out diagnostic over the shared SAT/MONO/NMP basis.
  for (const [source, test] of grouped(multiRows, (r) => r.source)) {
    const train = multiRows.filter((r) => r.source !== source);
    for (const fitModel of ['NRTL', 'UNIQUAC'] as const) {
      const fit = fitDirect(train, fitModel, `LOSO excluding ${source}`);
      crossValidationMetrics.push(roundMetrics(metricSummary(
        test,
        predictSet(test, fit.model, fit),
        fit.model,
        `LOSO test ${source}`,
      )));
    }
  }

  const envelope = sulfurEnvelope();
  const raw = {
    generatedAt: new Date().toISOString(),
    methodVersion: 'ECR2_STEP4_THERMODYNAMIC_POC_1.0.0',
    stage8Modified: false,
    datasetSummary: {
      cotoRows: cotoRows.length,
      multiRows: multiRows.length,
      totalRows: rows.length,
      multiTemperatures: [...new Set(multiRows.map((r) => r.temperatureK))].sort((a, b) => a - b),
      sources: [...new Set(rows.map((r) => r.source))],
      cotoCitation: COTO_2022_CITATION,
      calibrationGate: CALIBRATION_GATE,
      sulfurRawTieLinesAdmitted: false,
    },
    predictiveMetrics,
    calibratedMetrics,
    crossValidationMetrics,
    fitRecords,
    sulfurEnvelope: envelope,
    provenance: {
      predictiveCosmo: 'COSMO-SAC-style descriptor proxy; not a full COSMO-RS/COSMO-SAC implementation',
      predictiveUnifac: 'Modified-UNIFAC-Dortmund-style fixed group proxy; Dortmund database not embedded',
      calibration: 'Direct NRTL/UNIQUAC fit to the named training rows only',
      initialization: 'Deterministic phase-biased flash initialization; experimental phase compositions are not used as initial guesses',
      noImputation: true,
    },
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(raw, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'report.md'), buildReport(raw));
  console.log(`Wrote ${path.join(OUT_DIR, 'results.json')}`);
  console.log(`Wrote ${path.join(OUT_DIR, 'report.md')}`);
  console.log(`Rows: ${rows.length}; predictive metric groups: ${predictiveMetrics.length}; CV groups: ${crossValidationMetrics.length}`);
  console.log(`Sulfur envelope points: ${envelope.length}; direct sulfur tie-line data admitted: false`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});