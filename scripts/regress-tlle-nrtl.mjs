// ─────────────────────────────────────────────────────────────────────────────
// Offline regression of NRTL binary interaction parameters against the
// governed Coto 2022 Table 3 tie-lines (298.15 K). Canonical NRTL form
// τij = bij / T  (bij = Δgij/R, K) — the model's OWN temperature dependence;
// no multi-temperature data is invented. α = 0.2 fixed (LLE convention).
// Objective: isoactivity residuals in log form over all tie-lines.
// Validation: full two-phase flash reproduction vs gate 3·u(x) = 0.009.
// Output: bij matrix + reproduction record (pasted into the CEL module).
// ─────────────────────────────────────────────────────────────────────────────

const T0 = 298.15;
const ALPHA = 0.2;
const N = 5; // [c12, xylene(or toluene), MeN, pyrene, NMP]

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
const TOL = [
  { x: [0.645, 0.106, 0.048, 0.020, 0.181], y: [0.397, 0.142, 0.072, 0.032, 0.357] },
  { x: [0.783, 0.080, 0.025, 0.007, 0.105], y: [0.210, 0.113, 0.061, 0.028, 0.588] },
  { x: [0.861, 0.053, 0.016, 0.005, 0.065], y: [0.177, 0.088, 0.049, 0.022, 0.664] },
  { x: [0.894, 0.032, 0.009, 0.003, 0.062], y: [0.145, 0.054, 0.030, 0.013, 0.758] },
];

// params: 20 values = tau[i][j] for i!=j (row-major, skipping diagonal) at T0
function unpack(p) {
  const tau = Array.from({ length: N }, () => new Array(N).fill(0));
  let k = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) tau[i][j] = p[k++];
  return tau;
}
function lngamma(x, tau) {
  const G = tau.map((row) => row.map((t) => Math.exp(-ALPHA * t)));
  const ln = new Array(N).fill(0);
  const S = new Array(N).fill(0), C = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    let s = 0, c = 0;
    for (let j = 0; j < N; j++) { s += x[j] * G[j][i]; c += x[j] * G[j][i] * tau[j][i]; }
    S[i] = s; C[i] = c;
  }
  for (let i = 0; i < N; i++) {
    let t2 = 0;
    for (let j = 0; j < N; j++) t2 += (x[j] * G[i][j] / S[j]) * (tau[i][j] - C[j] / S[j]);
    ln[i] = C[i] / S[i] + t2;
  }
  return ln;
}
function objective(p, data) {
  const tau = unpack(p);
  let f = 0;
  for (const tl of data) {
    const lgR = lngamma(tl.x, tau), lgE = lngamma(tl.y, tau);
    for (let i = 0; i < N; i++) {
      const r = Math.log(tl.x[i]) + lgR[i] - Math.log(tl.y[i]) - lgE[i];
      f += r * r;
    }
  }
  return f;
}

// Nelder–Mead
function nelderMead(f, x0, { maxIter = 20000, step = 0.5 } = {}) {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) { const v = x0.slice(); v[i] += step; simplex.push(v); }
  let fv = simplex.map(f);
  for (let it = 0; it < maxIter; it++) {
    const idx = fv.map((v, i) => i).sort((a, b) => fv[a] - fv[b]);
    simplex = idx.map((i) => simplex[i]); fv = idx.map((i) => fv[i]);
    if (Math.abs(fv[n] - fv[0]) < 1e-12) break;
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

// Two-phase flash at temperature T with tau scaled by T0/T (τ = b/T, b = τ0·T0)
function flash(z, tau0, T, x0, y0) {
  const tau = tau0.map((r) => r.map((t) => (t * T0) / T));
  let x = x0.slice(), y = y0.slice();
  let beta = 0.5;
  for (let it = 0; it < 1000; it++) {
    const lgx = lngamma(x, tau), lgy = lngamma(y, tau);
    const K = lgx.map((l, i) => Math.exp(l - lgy[i]));
    // Rachford–Rice for beta (extract fraction)
    let lo = 1e-10, hi = 1 - 1e-10;
    const g = (b) => z.reduce((s, zi, i) => s + (zi * (K[i] - 1)) / (1 + b * (K[i] - 1)), 0);
    if (g(lo) * g(hi) > 0) beta = g(lo) > 0 ? hi : lo;
    else for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (g(lo) * g(m) <= 0) hi = m; else lo = m; beta = (lo + hi) / 2; }
    const xn = z.map((zi, i) => zi / (1 + beta * (K[i] - 1)));
    const yn = xn.map((xi, i) => K[i] * xi);
    const sx = xn.reduce((a, b2) => a + b2, 0), sy = yn.reduce((a, b2) => a + b2, 0);
    const xN = xn.map((v) => v / sx), yN = yn.map((v) => v / sy);
    const d = Math.max(...xN.map((v, i) => Math.abs(v - x[i])), ...yN.map((v, i) => Math.abs(v - y[i])));
    x = xN; y = yN;
    if (d < 1e-12) break;
  }
  const trivial = Math.max(...x.map((v, i) => Math.abs(v - y[i]))) < 1e-4;
  return { x, y, beta, trivial };
}

function run(name, data) {
  let best = null;
  for (let s = 0; s < 6; s++) {
    const rng = mulberry32(1234 + s * 999);
    const x0 = Array.from({ length: 20 }, () => (rng() - 0.5) * 4);
    let r = nelderMead((p) => objective(p, data), x0, { maxIter: 30000, step: 0.6 });
    r = nelderMead((p) => objective(p, data), r.x, { maxIter: 30000, step: 0.1 });
    if (!best || r.f < best.f) best = r;
  }
  const tau0 = unpack(best.x);
  console.log(`\n== ${name}: objective = ${best.f.toExponential(3)} (sum sq log-isoactivity residuals, ${data.length} tie-lines)`);
  // flash reproduction at 298.15 K
  let maxDev = 0, fails = 0;
  const rows = [];
  data.forEach((tl, idx) => {
    const z = tl.x.map((v, i) => 0.5 * (v + tl.y[i]));
    const r = flash(z, tau0, T0, tl.x, tl.y);
    const dev = Math.max(...r.x.map((v, i) => Math.abs(v - tl.x[i])), ...r.y.map((v, i) => Math.abs(v - tl.y[i])));
    maxDev = Math.max(maxDev, dev);
    if (dev > 0.009 || r.trivial) fails++;
    rows.push({ idx: idx + 1, dev: +dev.toFixed(4), trivial: r.trivial });
  });
  console.log('flash reproduction per tie-line (max |Δx|, gate 0.009):', JSON.stringify(rows));
  console.log(`maxDev = ${maxDev.toFixed(4)}; tie-lines failing gate or trivial: ${fails}/${data.length}`);
  // b matrix (K)
  const b = tau0.map((r) => r.map((t) => +(t * T0).toFixed(3)));
  console.log('b (K) matrix (tau_ij = b_ij / T):');
  console.log(JSON.stringify(b));
  return { tau0, b, maxDev, fails };
}

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const rx = run('XYLENE family (13 tie-lines)', XYL);
run('TOLUENE family (4 tie-lines)', TOL);

// Demonstrate extrapolation behaviour at a few temperatures for xylene set
console.log('\n== Extrapolation demo (xylene params, tie-line 1 midpoint feed):');
for (const T of [298.15, 313.15, 328.15, 343.15]) {
  const tl = XYL[0];
  const z = tl.x.map((v, i) => 0.5 * (v + tl.y[i]));
  const r = flash(z, rx.tau0, T, tl.x, tl.y);
  console.log(`T=${T} K: x1R=${r.x[0].toFixed(3)} trivial=${r.trivial} x=${r.x.map((v) => v.toFixed(3)).join(',')} y=${r.y.map((v) => v.toFixed(3)).join(',')}`);
}

// ── Stage 2: flash-based composition refinement ──────────────────────────────
function flashObjective(p, data) {
  const tau0 = unpack(p);
  let f = 0;
  for (const tl of data) {
    const z = tl.x.map((v, i) => 0.5 * (v + tl.y[i]));
    const r = flash(z, tau0, T0, tl.x, tl.y);
    if (r.trivial) { f += 10; continue; }
    for (let i = 0; i < N; i++) f += (r.x[i] - tl.x[i]) ** 2 + (r.y[i] - tl.y[i]) ** 2;
  }
  return f;
}
console.log('\n== Stage 2 refinement (xylene): flash-based objective');
let ref = { x: rx.tau0.flatMap((r, i) => r.filter((_, j) => j !== i)), f: Infinity };
for (const step of [0.4, 0.15, 0.05]) {
  ref = nelderMead((p) => flashObjective(p, XYL), ref.x, { maxIter: 40000, step });
  console.log(`step ${step}: obj = ${ref.f.toExponential(3)}`);
}
const tauR = unpack(ref.x);
let maxDev2 = 0; const rows2 = [];
XYL.forEach((tl, idx) => {
  const z = tl.x.map((v, i) => 0.5 * (v + tl.y[i]));
  const r = flash(z, tauR, T0, tl.x, tl.y);
  const dev = Math.max(...r.x.map((v, i) => Math.abs(v - tl.x[i])), ...r.y.map((v, i) => Math.abs(v - tl.y[i])));
  maxDev2 = Math.max(maxDev2, dev);
  rows2.push({ idx: idx + 1, dev: +dev.toFixed(4), trivial: r.trivial });
});
console.log('refined reproduction:', JSON.stringify(rows2));
console.log('maxDev =', maxDev2.toFixed(4));
console.log('refined b (K):', JSON.stringify(tauR.map((r) => r.map((t) => +(t * T0).toFixed(3)))));
console.log('\n== Extrapolation demo (refined):');
for (const T of [298.15, 313.15, 328.15, 343.15]) {
  for (const idx of [0, 6, 12]) {
    const tl = XYL[idx];
    const z = tl.x.map((v, i) => 0.5 * (v + tl.y[i]));
    const r = flash(z, tauR, T, tl.x, tl.y);
    console.log(`T=${T} tl=${idx + 1}: trivial=${r.trivial} x=[${r.x.map((v) => v.toFixed(3))}] y=[${r.y.map((v) => v.toFixed(3))}]`);
  }
}
