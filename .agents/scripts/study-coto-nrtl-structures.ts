/**
 * Model-form / regression-structure study. Diagnostic only.
 * Never writes the active NRTL registry or any Simulator input.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  COTO_2022_XYLENE_TIELINES,
  COTO_2022_RESIDUAL_TOLERANCE,
  COTO_2022_TEMPERATURE_K,
  COTO_2022_UX,
} from '../../server/engine-framework/cel/coto2022-nmp-lle';
import { NRTL_B_K, NRTL_ALPHA } from '../../server/engine-framework/cel/llx-temperature-lle-model';

const N = 5;
const T0 = COTO_2022_TEMPERATURE_K;
const ALPHA = NRTL_ALPHA;
const U = COTO_2022_UX;
const GATE = COTO_2022_RESIDUAL_TOLERANCE;
const LO = -40;
const HI = 40;
const FIT_FLASH_ITERS = 180;
const FINAL_FLASH_ITERS = 1500;
const OUT = path.join('.agents', 'outputs', 'coto-nrtl-model-form-study');
type Vec = number[];
type Matrix = number[][];
type Structure = { id: string; label: string; parameterLabels: string[]; decode: (v: Vec) => Matrix; starts: number; iterations: number };

const rows = COTO_2022_XYLENE_TIELINES;
const HC = [0, 1, 2, 3];
const pairLabels = (i: number, j: number) => [`tau_${i}_${j}`, `tau_${j}_${i}`];
const symmetricPairs = (): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) out.push([i, j]);
  return out;
};
function labelsForPairs(pairs: [number, number][], symmetric: boolean): string[] {
  return pairs.flatMap(([i, j]) => symmetric ? [`tau_${i}_${j}=tau_${j}_${i}`] : pairLabels(i, j));
}
function blank(): Matrix { return Array.from({ length: N }, () => new Array(N).fill(0)); }
function symmetricDecode(pairs: [number, number][], v: Vec): Matrix {
  const t = blank();
  pairs.forEach(([i, j], k) => { t[i][j] = v[k]; t[j][i] = v[k]; });
  return t;
}
const solventPairs: [number, number][] = HC.map((i) => [i, 4]);
const allPairs = symmetricPairs();
const structures: Structure[] = [
  {
    id: 'NRTL_4_SOLVENT_SYMMETRIC',
    label: 'Only symmetric hydrocarbon↔NMP interactions; hydrocarbon↔hydrocarbon tau=0',
    parameterLabels: labelsForPairs(solventPairs, true),
    decode: (v) => symmetricDecode(solventPairs, v),
    starts: 4, iterations: 1000,
  },
  {
    id: 'NRTL_8_SOLVENT_DIRECTIONAL',
    label: 'Only directional hydrocarbon↔NMP interactions; hydrocarbon↔hydrocarbon tau=0',
    parameterLabels: labelsForPairs(solventPairs, false),
    decode: (v) => {
      const t = blank();
      solventPairs.forEach(([i, j], k) => { t[i][j] = v[2 * k]; t[j][i] = v[2 * k + 1]; });
      return t;
    },
    starts: 4, iterations: 1200,
  },
  {
    id: 'NRTL_10_ALL_SYMMETRIC',
    label: 'All ten binary interactions symmetric',
    parameterLabels: labelsForPairs(allPairs, true),
    decode: (v) => symmetricDecode(allPairs, v),
    starts: 4, iterations: 1400,
  },
  {
    id: 'NRTL_14_HC_SYMMETRIC_SOLVENT_DIRECTIONAL',
    label: 'Six symmetric hydrocarbon pairs plus eight directional hydrocarbon↔NMP parameters',
    parameterLabels: [...labelsForPairs(allPairs.filter(([i, j]) => i !== 4 && j !== 4), true), ...labelsForPairs(solventPairs, false)],
    decode: (v) => {
      const t = blank();
      allPairs.filter(([i, j]) => i !== 4 && j !== 4).forEach(([i, j], k) => { t[i][j] = v[k]; t[j][i] = v[k]; });
      solventPairs.forEach(([i, j], k) => { t[i][j] = v[6 + 2 * k]; t[j][i] = v[6 + 2 * k + 1]; });
      return t;
    },
    starts: 3, iterations: 1600,
  },
  {
    id: 'NRTL_20_FULL_DIRECTIONAL',
    label: 'All twenty directional interactions',
    parameterLabels: allPairs.flatMap(([i, j]) => pairLabels(i, j)),
    decode: (v) => {
      const t = blank(); let k = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) t[i][j] = v[k++];
      return t;
    },
    starts: 3, iterations: 1800,
  },
];
function clip(v: number): number { return Math.max(LO, Math.min(HI, v)); }
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function currentTau(): Matrix { return NRTL_B_K.map((r) => r.map((b) => b / T0)); }
function seedFor(s: Structure, n: number): Vec {
  const r = rng(20260823 + n * 9176 + s.id.length * 13);
  const current = currentTau();
  if (n === 0) {
    if (s.id === 'NRTL_4_SOLVENT_SYMMETRIC') return solventPairs.map(([i, j]) => (current[i][j] + current[j][i]) / 2);
    if (s.id === 'NRTL_8_SOLVENT_DIRECTIONAL') return solventPairs.flatMap(([i, j]) => [current[i][j], current[j][i]]);
    if (s.id === 'NRTL_10_ALL_SYMMETRIC') return allPairs.map(([i, j]) => (current[i][j] + current[j][i]) / 2);
    if (s.id === 'NRTL_14_HC_SYMMETRIC_SOLVENT_DIRECTIONAL') return [
      ...allPairs.filter(([i, j]) => i !== 4 && j !== 4).map(([i, j]) => (current[i][j] + current[j][i]) / 2),
      ...solventPairs.flatMap(([i, j]) => [current[i][j], current[j][i]]),
    ];
    return current.flatMap((row, i) => row.filter((_, j) => j !== i));
  }
  return Array.from({ length: s.parameterLabels.length }, () => -8 + 16 * r());
}
function lnGamma(x: readonly number[], tau: Matrix): Vec {
  const G = tau.map((row, i) => row.map((v, j) => i === j ? 1 : Math.exp(-ALPHA * v)));
  const S = new Array(N).fill(0), C = new Array(N).fill(0);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { S[i] += x[j] * G[j][i]; C[i] += x[j] * G[j][i] * tau[j][i]; }
  return Array.from({ length: N }, (_, i) => {
    let second = 0;
    for (let j = 0; j < N; j++) second += (x[j] * G[i][j] / S[j]) * (tau[i][j] - C[j] / S[j]);
    return C[i] / S[i] + second;
  });
}
function flash(z: readonly number[], tau: Matrix, x0: readonly number[], y0: readonly number[], maxIter: number) {
  let x = [...x0], y = [...y0], beta = 0.5, delta = Infinity;
  for (let it = 0; it < maxIter; it++) {
    const lgx = lnGamma(x, tau), lgy = lnGamma(y, tau);
    const K = lgx.map((v, i) => Math.exp(Math.max(-60, Math.min(60, v - lgy[i]))));
    const g = (b: number) => z.reduce((sum, zi, i) => sum + zi * (K[i] - 1) / (1 + b * (K[i] - 1)), 0);
    let lo = 1e-10, hi = 1 - 1e-10;
    if (g(lo) * g(hi) > 0) beta = g(lo) > 0 ? hi : lo;
    else for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (g(lo) * g(m) <= 0) hi = m; else lo = m; }
    if (g(lo) * g(hi) <= 0) beta = (lo + hi) / 2;
    const xn = z.map((zi, i) => zi / (1 + beta * (K[i] - 1)));
    const yn = xn.map((xi, i) => K[i] * xi);
    const sx = xn.reduce((a, b) => a + b, 0), sy = yn.reduce((a, b) => a + b, 0);
    const xN = xn.map((v) => v / sx), yN = yn.map((v) => v / sy);
    delta = Math.max(...xN.map((v, i) => Math.abs(v - x[i])), ...yN.map((v, i) => Math.abs(v - y[i])));
    x = xN; y = yN;
    if (delta < 1e-11) return { x, y, beta, converged: true, trivial: Math.max(...x.map((v, i) => Math.abs(v - y[i]))) < 1e-4, iterations: it + 1, delta };
  }
  return { x, y, beta, converged: false, trivial: Math.max(...x.map((v, i) => Math.abs(v - y[i]))) < 1e-4, iterations: maxIter, delta };
}
function residualVector(s: Structure, v: Vec, maxIter: number) {
  const tau = s.decode(v), residuals: Vec = [], details: any[] = [];
  for (const tl of rows) {
    const z = tl.x.map((xi, i) => 0.5 * (xi + tl.y[i]));
    const f = flash(z, tau, tl.x, tl.y, maxIter);
    const [xp, yp] = f.x[0] >= f.y[0] ? [f.x, f.y] : [f.y, f.x];
    for (let i = 0; i < N; i++) { residuals.push((xp[i] - tl.x[i]) / U); residuals.push((yp[i] - tl.y[i]) / U); }
    details.push({ sourceTableRow: tl.tableOrder, predictedRaffinate: xp, predictedExtract: yp, converged: f.converged, trivial: f.trivial, iterations: f.iterations });
  }
  return { residuals, details };
}
function objective(s: Structure, v: Vec): number {
  const r = residualVector(s, v, FIT_FLASH_ITERS);
  const bad = r.details.filter((d) => !d.converged || d.trivial).length;
  const value = r.residuals.reduce((sum, x) => sum + x * x, 0);
  return Number.isFinite(value) ? value + bad * 1e5 : 1e30;
}
function nelderMead(s: Structure, start: Vec): { x: Vec; fx: number; iterations: number; converged: boolean } {
  const n = start.length, step = 2;
  let simplex = [start.map(clip)];
  for (let i = 0; i < n; i++) { const p = start.map(clip); p[i] = clip(p[i] + step); simplex.push(p); }
  let f = simplex.map((v) => objective(s, v));
  for (let it = 0; it < s.iterations; it++) {
    const order = f.map((_, i) => i).sort((a, b) => f[a] - f[b]);
    simplex = order.map((i) => simplex[i]); f = order.map((i) => f[i]);
    if (Math.abs(f[n] - f[0]) < 1e-10 && Math.max(...simplex[0].map((v, i) => Math.abs(v - simplex[n][i]))) < 1e-7) return { x: simplex[0], fx: f[0], iterations: it + 1, converged: true };
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) c[k] += simplex[i][k] / n;
    const xr = c.map((v, k) => clip(v + (v - simplex[n][k]))), fr = objective(s, xr);
    if (fr < f[0]) {
      const xe = c.map((v, k) => clip(v + 2 * (v - simplex[n][k]))), fe = objective(s, xe);
      simplex[n] = fe < fr ? xe : xr; f[n] = Math.min(fe, fr);
    } else if (fr < f[n - 1]) { simplex[n] = xr; f[n] = fr; }
    else {
      const xc = c.map((v, k) => clip(v + 0.5 * (simplex[n][k] - v))), fc = objective(s, xc);
      if (fc < f[n]) { simplex[n] = xc; f[n] = fc; }
      else for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, k) => clip(simplex[0][k] + 0.5 * (v - simplex[0][k]))); f[i] = objective(s, simplex[i]); }
    }
  }
  const best = f.indexOf(Math.min(...f));
  return { x: simplex[best], fx: f[best], iterations: s.iterations, converged: false };
}
function singularValues(j: Matrix): number[] {
  const n = j[0]?.length ?? 0, a = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const row of j) for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) a[i][k] += row[i] * row[k];
  for (let sweep = 0; sweep < 100 * n * n; sweep++) {
    let p = 0, q = 1, mx = 0;
    for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) if (Math.abs(a[i][k]) > mx) { mx = Math.abs(a[i][k]); p = i; q = k; }
    if (mx < 1e-10) break;
    const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(theta), ss = Math.sin(theta);
    for (let k = 0; k < n; k++) { const ap = a[p][k], aq = a[q][k]; a[p][k] = c * ap - ss * aq; a[q][k] = ss * ap + c * aq; }
    for (let k = 0; k < n; k++) { const ap = a[k][p], aq = a[k][q]; a[k][p] = c * ap - ss * aq; a[k][q] = ss * ap + c * aq; }
  }
  return a.map((_, i) => Math.sqrt(Math.max(0, a[i][i]))).sort((x, y) => y - x);
}
function round(v: number, dp = 8): number { return Number(v.toFixed(dp)); }
function assess(s: Structure, best: { x: Vec; fx: number; iterations: number; converged: boolean }, runs: any[]) {
  const final = residualVector(s, best.x, FINAL_FLASH_ITERS);
  const tau = s.decode(best.x);
  const perRow = final.details.map((d, i) => {
    const tl = rows[i], errors = [...d.predictedRaffinate.map((v: number, k: number) => v - tl.x[k]), ...d.predictedExtract.map((v: number, k: number) => v - tl.y[k])];
    const lgx = lnGamma(tl.x, tau), lgy = lnGamma(tl.y, tau);
    const iso = tl.x.map((v, k) => Math.log(v) + lgx[k] - Math.log(tl.y[k]) - lgy[k]);
    return { ...d, experimentalRaffinate: tl.x, experimentalExtract: tl.y, maxAbsError: round(Math.max(...errors.map(Math.abs))), rmsCompositionError: round(Math.sqrt(errors.reduce((sum: number, v: number) => sum + v * v, 0) / errors.length)), maxAbsIsoactivityResidual: round(Math.max(...iso.map(Math.abs))), isoactivityResiduals: iso.map((v) => round(v)), pass: d.converged && !d.trivial && Math.max(...errors.map(Math.abs)) <= GATE };
  });
  const errors = perRow.flatMap((r) => [...r.predictedRaffinate.map((v: number, i: number) => v - r.experimentalRaffinate[i]), ...r.predictedExtract.map((v: number, i: number) => v - r.experimentalExtract[i])]);
  const isoAll = perRow.flatMap((r) => r.isoactivityResiduals);
  const base = final.residuals, p = best.x.length, jac: Matrix = Array.from({ length: base.length }, () => new Array(p).fill(0));
  for (let k = 0; k < p; k++) {
    const h = 1e-4 * Math.max(1, Math.abs(best.x[k])), plus = best.x.slice(), minus = best.x.slice();
    plus[k] = clip(plus[k] + h); minus[k] = clip(minus[k] - h);
    const rp = residualVector(s, plus, FINAL_FLASH_ITERS).residuals, rm = residualVector(s, minus, FINAL_FLASH_ITERS).residuals, denom = plus[k] - minus[k] || h;
    for (let i = 0; i < base.length; i++) jac[i][k] = (rp[i] - rm[i]) / denom;
  }
  const sv = singularValues(jac), maxSv = sv[0] || 0, rank = sv.filter((v) => v > maxSv * 1e-6).length;
  return {
    id: s.id, label: s.label, parameterCount: p, parameterLabels: s.parameterLabels,
    alpha: ALPHA, tauBounds: [LO, HI], fittedTauAt298_15: tau.map((r) => r.map((v) => round(v, 6))),
    optimizer: { method: 'bounded Nelder-Mead with clipping', starts: s.starts, runs, bestObjectiveScaledByUxSquared: best.fx, bestIterations: best.iterations, bestConverged: best.converged },
    jacobian: { residualRows: base.length, rankRelative1eMinus6: rank, conditionNumberUsingEffectiveRank: sv[rank - 1] ? round(maxSv / sv[rank - 1], 3) : null, singularValues: sv.map((v) => round(v, 6)) },
    reproduction: { rows: perRow, rmsCompositionError: round(Math.sqrt(errors.reduce((sum, v) => sum + v * v, 0) / errors.length)), maxCompositionError: round(Math.max(...errors.map(Math.abs))), tieLinesPassing: perRow.filter((r) => r.pass).length, tieLinesTotal: rows.length, endpointIsoactivityRms: round(Math.sqrt(isoAll.reduce((sum, v) => sum + v * v, 0) / isoAll.length)), endpointIsoactivityMax: round(Math.max(...isoAll.map(Math.abs))) },
  };
}
function baseline() {
  const s = structures.find((x) => x.id === 'NRTL_20_FULL_DIRECTIONAL')!;
  const v = seedFor(s, 0);
  const a = assess(s, { x: v, fx: objective(s, v), iterations: 0, converged: false }, []);
  return { rmsCompositionError: a.reproduction.rmsCompositionError, maxCompositionError: a.reproduction.maxCompositionError, tieLinesPassing: a.reproduction.tieLinesPassing };
}

const requestedStructure = process.env.STRUCTURE;
const selectedStructures = requestedStructure ? structures.filter((s) => s.id === requestedStructure) : structures;
if (requestedStructure && selectedStructures.length !== 1) throw new Error(`Unknown STRUCTURE '${requestedStructure}'`);
fs.mkdirSync(OUT, { recursive: true });
const results: any[] = [];
for (const s of selectedStructures) {
  const runs: any[] = [];
  let best: { x: Vec; fx: number; iterations: number; converged: boolean } | null = null;
  for (let i = 0; i < s.starts; i++) {
    const run = nelderMead(s, seedFor(s, i));
    runs.push({ start: i + 1, objective: round(run.fx, 6), iterations: run.iterations, optimizerConverged: run.converged });
    if (!best || run.fx < best.fx) best = run;
    console.log(`${s.id} start ${i + 1}/${s.starts}: objective=${run.fx.toFixed(5)} iterations=${run.iterations} converged=${run.converged}`);
  }
  const assessment = assess(s, best!, runs);
  results.push(assessment);
  fs.writeFileSync(path.join(OUT, `${s.id}.json`), JSON.stringify(assessment, null, 2));
}
const benchmark = {
  status: 'SOURCE_REPORTED_BENCHMARK_NOT_REIMPLEMENTED',
  reason: 'Coto 2022 reports aggregate Table 4 deviations for UNIFAC variants but does not provide a complete executable UNIFAC group-assignment/parameter artifact or per-row calculated compositions in the controlled PDF.',
  sourceConditions: '298.15 K, atmospheric pressure, Table 3 data',
  reportedTable4: {
    columns: ['UNIFAC', 'Mod.UNIFAC (Dortmund)', 'Mod.UNIFAC (NIST)', 'Classical UNIFAC refit AC-NMP'],
    sigmaAll: [0.12, 0.09, 0.13, 0.07],
    sigmaRaffinate: [0.15, 0.09, 0.16, 0.06],
    sigmaExtract: [0.07, 0.08, 0.09, 0.08],
    sigmaRaffinatePar: [0.05, 0.02, 0.04, 0.009],
    refitParameters: { AC_to_NMP: -145, NMP_to_AC: -10 },
  },
  interpretation: 'These are the independent published benchmark values. Exact per-row UNIFAC reproduction is not claimed without the missing controlled parameter/group artifact.',
};
const result = {
  studyId: 'COTO_2022_NRTL_MODEL_FORM_REGRESSION_STRUCTURE_STUDY',
  candidateStatus: 'UNADMITTED_DIAGNOSTIC',
  data: { sourceRows: 13, temperatureK: T0, uncertaintyMoleFraction: U, gate: GATE, components: ['Sat=n-dodecane', 'Mono=1,4-xylene', 'Di=1-methylnaphthalene', 'Poly=pyrene', 'Solvent=NMP'] },
  fixedAcrossStructures: { model: 'NRTL', alpha: ALPHA, alphaFitted: false, tauBounds: [LO, HI], temperatureDependence: 'none; anchor study only' },
  baselineCurrentActive: requestedStructure ? null : baseline(),
  structures: results,
  unifacBenchmark: benchmark,
  governance: ['No active NRTL registry modified', 'No parameters promoted', 'No Simulator/BVP/K&H/d32/holdup/properties/Run #711/DBT/Optimizer modified'],
};
if (requestedStructure) {
  console.log(`Wrote ${OUT}/${requestedStructure}.json`);
  process.exit(0);
}
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
const lines = [
  '# Coto 2022 NRTL model-form / regression-structure study',
  '',
  'Status: **UNADMITTED_DIAGNOSTIC**',
  '',
  `All structures use alpha=${ALPHA} fixed, tau bounds [${LO}, ${HI}], 13 xylene-family tie-lines at ${T0} K, and a two-phase composition objective over both phases.`,
  '',
  '| Structure | Parameters | Best objective / U² | Optimizer converged | Jacobian rank | Condition number | RMS error | Max error | Gate passes | Endpoint iso RMS / max |',
  '|:---|---:|---:|:---:|---:|---:|---:|---:|---:|---:|',
  ...results.map((r) => `| ${r.id} | ${r.parameterCount} | ${r.optimizer.bestObjectiveScaledByUxSquared} | ${r.optimizer.bestConverged ? 'yes' : 'no'} | ${r.jacobian.rankRelative1eMinus6}/${r.parameterCount} | ${r.jacobian.conditionNumberUsingEffectiveRank} | ${r.reproduction.rmsCompositionError} | ${r.reproduction.maxCompositionError} | ${r.reproduction.tieLinesPassing}/13 | ${r.reproduction.endpointIsoactivityRms} / ${r.reproduction.endpointIsoactivityMax} |`),
  '',
  '## Current active baseline',
  `The current active 20-directional matrix independently gives RMS=${result.baselineCurrentActive.rmsCompositionError}, max=${result.baselineCurrentActive.maxCompositionError}, and ${result.baselineCurrentActive.tieLinesPassing}/13 passes.`,
  '',
  '## Published UNIFAC benchmark',
  'Coto Table 4 is recorded as an independent source benchmark, not falsely reimplemented from missing group assignments and parameter artifacts.',
  '',
  '| Metric | UNIFAC | Mod. Dortmund | Mod. NIST | Classical refit |',
  '|:---|---:|---:|---:|---:|',
  `| sigma all compositions | 0.12 | 0.09 | 0.13 | 0.07 |`,
  `| sigma raffinate | 0.15 | 0.09 | 0.16 | 0.06 |`,
  `| sigma extract | 0.07 | 0.08 | 0.09 | 0.08 |`,
  `| sigma raffinate polyaromatics | 0.05 | 0.02 | 0.04 | 0.009 |`,
  '',
  'The detailed per-row NRTL endpoint compositions and residuals are in result.json.',
];
fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));
console.log(`Wrote ${OUT}/result.json and ${OUT}/report.md`);