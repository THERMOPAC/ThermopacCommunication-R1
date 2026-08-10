// Stage-2 flash-based refinement of the xylene-family NRTL parameters.
// Seeds from the stage-1 isoactivity fit; logs to .agents/outputs/tlle-stage2.log
import { appendFileSync, writeFileSync } from 'node:fs';
const LOG = '.agents/outputs/tlle-stage2.log';
writeFileSync(LOG, 'start\n');
const log = (m) => appendFileSync(LOG, m + '\n');

const T0 = 298.15, ALPHA = 0.2, N = 5;
const XYL = [
  { x: [0.641, 0.131, 0.050, 0.020, 0.158], y: [0.392, 0.142, 0.077, 0.038, 0.351] },
  { x: [0.651, 0.134, 0.047, 0.021, 0.147], y: [0.320, 0.150, 0.081, 0.050, 0.399] },
  { x: [0.664, 0.136, 0.055, 0.035, 0.110], y: [0.250, 0.162, 0.105, 0.095, 0.388] },
  { x: [0.725, 0.109, 0.037, 0.018, 0.111], y: [0.252, 0.141, 0.080, 0.064, 0.463] },
  { x: [0.800, 0.092, 0.022, 0.008, 0.078], y: [0.206, 0.113, 0.062, 0.036, 0.583] },
  { x: [0.813, 0.082, 0.020, 0.009, 0.076], y: [0.190, 0.113, 0.063, 0.048, 0.586] },
  { x: [0.822, 0.085, 0.022, 0.006, 0.065], y: [0.240, 0.124, 0.069, 0.017, 0.550] },
  { x: [0.857, 0.062, 0.015, 0.005, 0.061], y: [0.181, 0.094, 0.057, 0.024, 0.644] },
  { x: [0.858, 0.067, 0.015, 0.005, 0.055], y: [0.157, 0.098, 0.052, 0.026, 0.667] },
  { x: [0.860, 0.068, 0.018, 0.004, 0.050], y: [0.158, 0.104, 0.058, 0.014, 0.666] },
  { x: [0.863, 0.058, 0.013, 0.005, 0.061], y: [0.150, 0.085, 0.045, 0.033, 0.687] },
  { x: [0.877, 0.050, 0.011, 0.005, 0.057], y: [0.174, 0.093, 0.038, 0.021, 0.674] },
  { x: [0.878, 0.048, 0.010, 0.004, 0.060], y: [0.135, 0.073, 0.037, 0.027, 0.728] },
];
// Stage-1 result (isoactivity fit) — b (K) = tau0 * T0
const B1 = [
  [0, 1282.711, -7452.477, 3043.643, 743.955],
  [-98.497, 0, 5920.757, 1020.623, 578.648],
  [-309.808, -31.832, 0, 446.163, -101.251],
  [10644.129, 1557.137, -6552.579, 0, 1848.599],
  [376.533, 665.273, -8117.593, 1915.054, 0],
];
const tau1 = B1.map((r) => r.map((b) => b / T0));

function unpack(p) {
  const tau = Array.from({ length: N }, () => new Array(N).fill(0));
  let k = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) tau[i][j] = p[k++];
  return tau;
}
const pack = (tau) => tau.flatMap((r, i) => r.filter((_, j) => j !== i));
function lngamma(x, tau) {
  const G = tau.map((row) => row.map((t) => Math.exp(-ALPHA * t)));
  const S = new Array(N).fill(0), C = new Array(N).fill(0);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { S[i] += x[j] * G[j][i]; C[i] += x[j] * G[j][i] * tau[j][i]; }
  const ln = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    let t2 = 0;
    for (let j = 0; j < N; j++) t2 += (x[j] * G[i][j] / S[j]) * (tau[i][j] - C[j] / S[j]);
    ln[i] = C[i] / S[i] + t2;
  }
  return ln;
}
function flash(z, tau, x0, y0, iters = 250) {
  let x = x0.slice(), y = y0.slice(), beta = 0.5;
  for (let it = 0; it < iters; it++) {
    const lgx = lngamma(x, tau), lgy = lngamma(y, tau);
    const K = lgx.map((l, i) => Math.exp(l - lgy[i]));
    let lo = 1e-10, hi = 1 - 1e-10;
    const g = (b) => z.reduce((s, zi, i) => s + (zi * (K[i] - 1)) / (1 + b * (K[i] - 1)), 0);
    if (g(lo) * g(hi) > 0) beta = g(lo) > 0 ? hi : lo;
    else { for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (g(lo) * g(m) <= 0) hi = m; else lo = m; } beta = (lo + hi) / 2; }
    const xn = z.map((zi, i) => zi / (1 + beta * (K[i] - 1)));
    const yn = xn.map((xi, i) => K[i] * xi);
    const sx = xn.reduce((a, b) => a + b, 0), sy = yn.reduce((a, b) => a + b, 0);
    const xN = xn.map((v) => v / sx), yN = yn.map((v) => v / sy);
    const d = Math.max(...xN.map((v, i) => Math.abs(v - x[i])), ...yN.map((v, i) => Math.abs(v - y[i])));
    x = xN; y = yN; if (d < 1e-11) break;
  }
  const trivial = Math.max(...x.map((v, i) => Math.abs(v - y[i]))) < 1e-4;
  return { x, y, trivial };
}
function obj(p) {
  const tau = unpack(p);
  let f = 0;
  for (const tl of XYL) {
    const z = tl.x.map((v, i) => 0.5 * (v + tl.y[i]));
    const r = flash(z, tau, tl.x, tl.y, 200);
    if (r.trivial) { f += 10; continue; }
    for (let i = 0; i < N; i++) f += (r.x[i] - tl.x[i]) ** 2 + (r.y[i] - tl.y[i]) ** 2;
  }
  return f;
}
function nelderMead(f, x0, maxIter, step) {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) { const v = x0.slice(); v[i] += step; simplex.push(v); }
  let fv = simplex.map(f);
  for (let it = 0; it < maxIter; it++) {
    const idx = fv.map((v, i) => i).sort((a, b) => fv[a] - fv[b]);
    simplex = idx.map((i) => simplex[i]); fv = idx.map((i) => fv[i]);
    if (it % 100 === 0) log(`it ${it}: best ${fv[0].toExponential(4)}`);
    if (Math.abs(fv[n] - fv[0]) < 1e-14) break;
    const cen = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) cen[k] += simplex[i][k] / n;
    const xr = cen.map((c, k) => c + (c - simplex[n][k])); const fr = f(xr);
    if (fr < fv[0]) {
      const xe = cen.map((c, k) => c + 2 * (c - simplex[n][k])); const fe = f(xe);
      if (fe < fr) { simplex[n] = xe; fv[n] = fe; } else { simplex[n] = xr; fv[n] = fr; }
    } else if (fr < fv[n - 1]) { simplex[n] = xr; fv[n] = fr; }
    else {
      const xc = cen.map((c, k) => c + 0.5 * (simplex[n][k] - c)); const fc = f(xc);
      if (fc < fv[n]) { simplex[n] = xc; fv[n] = fc; }
      else for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, k) => simplex[0][k] + 0.5 * (v - simplex[0][k])); fv[i] = f(simplex[i]); }
    }
  }
  const best = fv.indexOf(Math.min(...fv));
  return { x: simplex[best], f: fv[best] };
}

let p = pack(tau1);
log(`seed obj = ${obj(p).toExponential(4)}`);
let r = { x: p, f: Infinity };
for (const step of [0.25, 0.08]) {
  r = nelderMead(obj, r.x, 1200, step);
  log(`after step ${step}: obj ${r.f.toExponential(4)}`);
}
const tauR = unpack(r.x);
let maxDev = 0, within = 0; const rows = [];
XYL.forEach((tl, idx) => {
  const z = tl.x.map((v, i) => 0.5 * (v + tl.y[i]));
  const rr = flash(z, tauR, tl.x, tl.y, 1500);
  const dev = Math.max(...rr.x.map((v, i) => Math.abs(v - tl.x[i])), ...rr.y.map((v, i) => Math.abs(v - tl.y[i])));
  maxDev = Math.max(maxDev, dev);
  if (dev <= 0.009 && !rr.trivial) within++;
  rows.push({ tieLine: idx + 1, maxAbsDev: +dev.toFixed(4), trivial: rr.trivial });
});
log('REPRO ' + JSON.stringify(rows));
log(`maxDev ${maxDev.toFixed(4)} withinGate ${within}/13`);
log('B_K ' + JSON.stringify(tauR.map((row) => row.map((t) => +(t * T0).toFixed(3)))));
for (const T of [298.15, 313.15, 328.15, 343.15, 358.15]) {
  const tauT = tauR.map((row) => row.map((t) => (t * T0) / T));
  const out = [];
  for (const idx of [0, 4, 8, 12]) {
    const tl = XYL[idx];
    const z = tl.x.map((v, i) => 0.5 * (v + tl.y[i]));
    const rr = flash(z, tauT, tl.x, tl.y, 1500);
    out.push(`tl${idx + 1}:${rr.trivial ? 'TRIVIAL' : 'x1R=' + Math.max(rr.x[0], rr.y[0]).toFixed(3)}`);
  }
  log(`T=${T}: ${out.join(' ')}`);
}
log('DONE');
