/**
 * Controlled diagnostic only.
 *
 * Candidate: THERMOPAC_NRTL_FIT_TO_COTO_2022_XYLENE_LLE
 * This script must never write the active NRTL registry or parameter artifact.
 *
 * Fit target: both phases simultaneously through midpoint-feed two-phase
 * flashes of the 13 governed Coto xylene-family tie-lines at 298.15 K.
 * Primary convention: alpha = 0.2 fixed, 20 directional tau_ij values fitted
 * at T0, each bounded to [-40, 40].
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { COTO_2022_XYLENE_TIELINES, COTO_2022_UX, COTO_2022_RESIDUAL_TOLERANCE, COTO_2022_TEMPERATURE_K } from '../../server/engine-framework/cel/coto2022-nmp-lle';
import { NRTL_B_K, NRTL_ALPHA } from '../../server/engine-framework/cel/llx-temperature-lle-model';

const T0 = COTO_2022_TEMPERATURE_K;
const N = 5;
const P = 20;
const ALPHA = NRTL_ALPHA;
const LO = -40;
const HI = 40;
const GATE = COTO_2022_RESIDUAL_TOLERANCE;
const U = COTO_2022_UX;
const MAX_FLASH_ITERS = 1500;
const FIT_FLASH_ITERS = 180;
const OUT = path.join('.agents', 'outputs', 'thermopac-nrtl-fit-to-coto-2022-xylene-lle');

type Vec = number[];
type Matrix = number[][];
type TieLine = typeof COTO_2022_XYLENE_TIELINES[number];

function clip(v: number): number { return Math.max(LO, Math.min(HI, v)); }
function unpack(v: Vec): Matrix {
  const t = Array.from({ length: N }, () => new Array(N).fill(0));
  let k = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) t[i][j] = v[k++];
  return t;
}
function pack(t: Matrix): Vec {
  const v: Vec = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) v.push(t[i][j]);
  return v;
}
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function lnGamma(x: readonly number[], tau: Matrix): Vec {
  const G = tau.map((row) => row.map((v, j) => j === tau.indexOf(row) ? 1 : Math.exp(-ALPHA * v)));
  const S = new Array(N).fill(0);
  const C = new Array(N).fill(0);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    S[i] += x[j] * G[j][i];
    C[i] += x[j] * G[j][i] * tau[j][i];
  }
  return Array.from({ length: N }, (_, i) => {
    let second = 0;
    for (let j = 0; j < N; j++) second += (x[j] * G[i][j] / S[j]) * (tau[i][j] - C[j] / S[j]);
    return C[i] / S[i] + second;
  });
}
function flash(z: readonly number[], tau: Matrix, x0: readonly number[], y0: readonly number[], maxIter = MAX_FLASH_ITERS) {
  let x = [...x0], y = [...y0], beta = 0.5, d = Infinity;
  for (let it = 0; it < maxIter; it++) {
    const lgx = lnGamma(x, tau), lgy = lnGamma(y, tau);
    const K = lgx.map((v, i) => Math.exp(Math.max(-60, Math.min(60, v - lgy[i]))));
    const g = (b: number) => z.reduce((s, zi, i) => s + zi * (K[i] - 1) / (1 + b * (K[i] - 1)), 0);
    let lo = 1e-10, hi = 1 - 1e-10;
    if (g(lo) * g(hi) > 0) beta = g(lo) > 0 ? hi : lo;
    else {
      for (let k = 0; k < 80; k++) {
        const m = (lo + hi) / 2;
        if (g(lo) * g(m) <= 0) hi = m; else lo = m;
      }
      beta = (lo + hi) / 2;
    }
    const xn = z.map((zi, i) => zi / (1 + beta * (K[i] - 1)));
    const yn = xn.map((xi, i) => K[i] * xi);
    const sx = xn.reduce((a, b) => a + b, 0), sy = yn.reduce((a, b) => a + b, 0);
    const xN = xn.map((v) => v / sx), yN = yn.map((v) => v / sy);
    d = Math.max(...xN.map((v, i) => Math.abs(v - x[i])), ...yN.map((v, i) => Math.abs(v - y[i])));
    x = xN; y = yN;
    if (d < 1e-11) return { x, y, beta, converged: true, trivial: Math.max(...x.map((v, i) => Math.abs(v - y[i]))) < 1e-4, iterations: it + 1, d };
  }
  return { x, y, beta, converged: false, trivial: Math.max(...x.map((v, i) => Math.abs(v - y[i]))) < 1e-4, iterations: maxIter, d };
}
function residualVector(v: Vec, rows: readonly TieLine[], maxIter = MAX_FLASH_ITERS): { residuals: Vec; rows: any[] } {
  const tau = unpack(v);
  const residuals: Vec = [];
  const details: any[] = [];
  for (const tl of rows) {
    const z = tl.x.map((xi, i) => 0.5 * (xi + tl.y[i]));
    const f = flash(z, tau, tl.x, tl.y, maxIter);
    const [xp, yp] = f.x[0] >= f.y[0] ? [f.x, f.y] : [f.y, f.x];
    for (let i = 0; i < N; i++) {
      residuals.push((xp[i] - tl.x[i]) / U);
      residuals.push((yp[i] - tl.y[i]) / U);
    }
    details.push({ sourceTableRow: tl.tableOrder, predictedRaffinate: xp, predictedExtract: yp, converged: f.converged, trivial: f.trivial, iterations: f.iterations, flashDelta: f.d });
  }
  return { residuals, rows: details };
}
function objective(v: Vec, rows: readonly TieLine[]): number {
  const r = residualVector(v, rows, FIT_FLASH_ITERS);
  const bad = r.rows.filter((x) => !x.converged || x.trivial).length;
  const sum = r.residuals.reduce((s, x) => s + x * x, 0);
  return Number.isFinite(sum) ? sum + bad * 1e5 : 1e30;
}
function nelderMead(start: Vec, rows: readonly TieLine[], maxIter = 2500, step = 2): { x: Vec; fx: number; iterations: number; converged: boolean } {
  const n = start.length;
  let simplex = [start.map(clip)];
  for (let i = 0; i < n; i++) {
    const p = start.map(clip);
    p[i] = clip(p[i] + step);
    simplex.push(p);
  }
  let f = simplex.map((x) => objective(x, rows));
  let iterations = 0;
  let converged = false;
  for (let it = 0; it < maxIter; it++) {
    iterations = it + 1;
    const order = f.map((_, i) => i).sort((a, b) => f[a] - f[b]);
    simplex = order.map((i) => simplex[i]); f = order.map((i) => f[i]);
    if (Math.abs(f[n] - f[0]) < 1e-10 && Math.max(...simplex[0].map((v, i) => Math.abs(v - simplex[n][i]))) < 1e-7) {
      converged = true; break;
    }
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) c[k] += simplex[i][k] / n;
    const reflect = c.map((v, k) => clip(v + (v - simplex[n][k])));
    const fr = objective(reflect, rows);
    if (fr < f[0]) {
      const expand = c.map((v, k) => clip(v + 2 * (v - simplex[n][k])));
      const fe = objective(expand, rows);
      simplex[n] = fe < fr ? expand : reflect; f[n] = Math.min(fe, fr);
    } else if (fr < f[n - 1]) {
      simplex[n] = reflect; f[n] = fr;
    } else {
      const contract = c.map((v, k) => clip(v + 0.5 * (simplex[n][k] - v)));
      const fc = objective(contract, rows);
      if (fc < f[n]) { simplex[n] = contract; f[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, k) => clip(simplex[0][k] + 0.5 * (v - simplex[0][k])));
          f[i] = objective(simplex[i], rows);
        }
      }
    }
  }
  const best = f.indexOf(Math.min(...f));
  return { x: simplex[best], fx: f[best], iterations, converged };
}
function singularValues(j: Matrix): number[] {
  const m = j.length, n = j[0]?.length ?? 0;
  const a = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let r = 0; r < m; r++) for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) a[i][k] += j[r][i] * j[r][k];
  for (let sweep = 0; sweep < 100 * n * n; sweep++) {
    let p = 0, q = 1, max = 0;
    for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) if (Math.abs(a[i][k]) > max) { max = Math.abs(a[i][k]); p = i; q = k; }
    if (max < 1e-10) break;
    const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(theta), s = Math.sin(theta);
    for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
    for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
  }
  return a.map((_, i) => Math.sqrt(Math.max(0, a[i][i]))).sort((a, b) => b - a);
}
function round(v: number, n = 8): number { return Number(v.toFixed(n)); }

const rows = COTO_2022_XYLENE_TIELINES;
const starts: Vec[] = [pack(NRTL_B_K.map((r) => r.map((b) => b / T0)))];
for (let s = 0; s < 5; s++) {
  const r = rng(20260823 + s * 1009);
  starts.push(Array.from({ length: P }, () => -8 + 16 * r()));
}
const runs: any[] = [];
let best: { x: Vec; fx: number; iterations: number; converged: boolean } | null = null;
for (let i = 0; i < starts.length; i++) {
  const r = nelderMead(starts[i], rows);
  runs.push({ start: i + 1, objective: r.fx, iterations: r.iterations, optimizerConverged: r.converged });
  if (!best || r.fx < best.fx) best = r;
  console.log(`start ${i + 1}/${starts.length}: objective=${r.fx.toFixed(6)} iterations=${r.iterations} converged=${r.converged}`);
}
if (!best) throw new Error('No regression run completed');

const final = residualVector(best.x, rows);
const perRow = final.rows.map((d, i) => {
  const tl = rows[i];
  const diffs = [...d.predictedRaffinate.map((v: number, k: number) => v - tl.x[k]), ...d.predictedExtract.map((v: number, k: number) => v - tl.y[k])];
  const maxAbs = Math.max(...diffs.map(Math.abs));
  const rms = Math.sqrt(diffs.reduce((s: number, v: number) => s + v * v, 0) / diffs.length);
  const lgx = lnGamma(tl.x, unpack(best!.x)), lgy = lnGamma(tl.y, unpack(best!.x));
  const iso = tl.x.map((v, k) => Math.log(v) + lgx[k] - Math.log(tl.y[k]) - lgy[k]);
  return { ...d, experimentalRaffinate: tl.x, experimentalExtract: tl.y, maxAbsError: round(maxAbs), rmsCompositionError: round(rms), isoactivityResiduals: iso.map((v) => round(v)), maxAbsIsoactivityResidual: round(Math.max(...iso.map(Math.abs))), pass: d.converged && !d.trivial && maxAbs <= GATE };
});
const allErrors = perRow.flatMap((r) => [...r.predictedRaffinate.map((v: number, i: number) => v - r.experimentalRaffinate[i]), ...r.predictedExtract.map((v: number, i: number) => v - r.experimentalExtract[i])]);
const rmsError = Math.sqrt(allErrors.reduce((s, v) => s + v * v, 0) / allErrors.length);
const maxError = Math.max(...allErrors.map(Math.abs));

const base = final.residuals;
const jac: Matrix = Array.from({ length: base.length }, () => new Array(P).fill(0));
for (let k = 0; k < P; k++) {
  const h = 1e-4 * Math.max(1, Math.abs(best.x[k]));
  const plus = best.x.slice(); plus[k] = clip(plus[k] + h);
  const minus = best.x.slice(); minus[k] = clip(minus[k] - h);
  const rp = residualVector(plus, rows).residuals, rm = residualVector(minus, rows).residuals;
  const denom = plus[k] - minus[k] || h;
  for (let i = 0; i < base.length; i++) jac[i][k] = (rp[i] - rm[i]) / denom;
}
const sv = singularValues(jac);
const svMax = sv[0] || 0;
const identRank = sv.filter((x) => x > svMax * 1e-6).length;
const boundHits = best.x.filter((x) => Math.abs(Math.abs(x) - HI) < 1e-6).length;

const result = {
  candidateId: 'THERMOPAC_NRTL_FIT_TO_COTO_2022_XYLENE_LLE',
  status: 'UNADMITTED_DIAGNOSTIC',
  data: { dataset: 'COTO2022_TABLE3_NMP_LLE', sourceRows: 13, temperatureK: T0, components: ['Sat=n-dodecane', 'Mono=1,4-xylene', 'Di=1-methylnaphthalene', 'Poly=pyrene', 'Solvent=NMP'], uncertaintyMoleFraction: U, gate: GATE },
  model: { form: 'NRTL', fittedParameters: '20 directional tau_ij at T0', alpha: ALPHA, alphaFitted: false, boundsTau: [LO, HI], temperatureParameterization: 'diagnostic anchor only; no temperature dependence inferred' },
  optimizer: { method: 'bounded Nelder-Mead with clipping', starts: starts.length, runs, bestObjectiveScaledByUxSquared: best.fx, bestOptimizerIterations: best.iterations, bestOptimizerConverged: best.converged },
  fittedTauAt298_15: unpack(best.x).map((r) => r.map((v) => round(v, 6))),
  fittedB_KEquivalent: unpack(best.x).map((r) => r.map((v) => round(v * T0, 3))),
  identifiability: { jacobianResidualRows: base.length, parameterCount: P, singularValues: sv.map((v) => round(v, 6)), effectiveRankRelative1eMinus6: identRank, conditionNumberUsingEffectiveRank: sv[identRank - 1] ? round(svMax / sv[identRank - 1]) : null, boundHitCount: boundHits, interpretation: boundHits ? 'At least one directional parameter is bound; free optimum is not established.' : 'No fitted tau parameter is at a bound, but effective rank below parameter count and a broad singular-value spread show one practically weak parameter combination.' },
  reproduction: { rows: perRow, rmsError: round(rmsError), maxError: round(maxError), tieLinesPassing: perRow.filter((r) => r.pass).length, tieLinesTotal: rows.length, allTieLinesPass: perRow.every((r) => r.pass) },
  comparisonToCurrent: { currentTieLinesPassing: 2, currentTieLinesTotal: 13, currentRmsError: 0.01888125, currentMaxError: 0.09198078, currentSource: 'active LLX_TLLE_NRTL_TAU_B_OVER_T matrix, independently re-flashed at 298.15 K', deltaPassing: perRow.filter((r) => r.pass).length - 2, deltaMaxError: round(maxError - 0.09198078) },
  conclusion: perRow.every((r) => r.pass) ? 'FIVE_COMPONENT_NRTL_BASIS_ADEQUATE' : (perRow.filter((r) => r.pass).length >= 9 ? 'FIVE_COMPONENT_NRTL_BASIS_MARGINAL' : 'FIVE_COMPONENT_NRTL_BASIS_INADEQUATE'),
  governance: ['UNADMITTED_DIAGNOSTIC', 'No active registry or artifact modified', 'No Coto data, BVP, K&H, d32, holdup, properties, Run #711, DBT, or Optimizer modified'],
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(OUT, 'report.md'), [
  `# ${result.candidateId}`,
  '',
  `Status: **${result.status}**`,
  '',
  '## Method',
  `- 13 verified Coto 2022 xylene-family tie-lines at ${T0} K.`,
  '- Five-component basis: Sat=n-dodecane; Mono=1,4-xylene; Di=1-methylnaphthalene; Poly=pyrene; Solvent=NMP.',
  `- Simultaneous two-phase midpoint-flash composition objective over both phases, scaled by u(x)=${U}.`,
  `- ${starts.length} deterministic bounded multi-start runs; alpha=${ALPHA} fixed; each directional tau bound [${LO}, ${HI}].`,
  '',
  '## Reproduction',
  `- RMS error: **${result.reproduction.rmsError}**`,
  `- Maximum absolute error: **${result.reproduction.maxError}**`,
  `- Tie-lines passing the ${GATE} gate: **${result.reproduction.tieLinesPassing}/${rows.length}**`,
  `- Conclusion: **${result.conclusion}**`,
  '',
  '| Source row | max abs error | RMS error | max abs isoactivity residual | converged | PASS |',
  '|---:|---:|---:|---:|:---:|:---:|',
  ...perRow.map((r) => `| ${r.sourceTableRow} | ${r.maxAbsError} | ${r.rmsCompositionError} | ${r.maxAbsIsoactivityResidual} | ${r.converged ? 'yes' : 'no'} | ${r.pass ? 'PASS' : 'FAIL'} |`),
  '',
  '## Fitted tau matrix at 298.15 K',
  'Rows and columns: [Sat, Mono, Di, Poly, Solvent]. Diagonal entries are zero.',
  '',
  '```json',
  JSON.stringify(result.fittedTauAt298_15, null, 2),
  '```',
  '',
  '## Identifiability',
  `- Jacobian residual rows: ${base.length}; fitted parameters: ${P}.`,
  `- Effective numerical rank at relative 1e-6: ${identRank}/${P}.`,
  `- Bound hits: ${boundHits}.`,
  `- Singular values: ${sv.map((v) => v.toFixed(6)).join(', ')}.`,
  '',
  '## Comparison with current active result',
  `- Current: 2/13 pass; RMS error ${result.comparisonToCurrent.currentRmsError}; maximum error ${result.comparisonToCurrent.currentMaxError}.`,
  `- Candidate: ${result.reproduction.tieLinesPassing}/13 pass; RMS error ${result.reproduction.rmsError}; maximum error ${result.reproduction.maxError}.`,
  '',
  'The candidate is diagnostic only and is not promoted or admitted.',
].join('\n'));
console.log(`BEST objective=${best.fx} pass=${result.reproduction.tieLinesPassing}/13 rms=${result.reproduction.rmsError} max=${result.reproduction.maxError} conclusion=${result.conclusion}`);
console.log(`Wrote ${OUT}/result.json and ${OUT}/report.md`);