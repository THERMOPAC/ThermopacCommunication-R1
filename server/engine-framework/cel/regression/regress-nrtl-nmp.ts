/**
 * OFFLINE regression of the NRTL τ(T) parameters for the RRBO-surrogate/NMP
 * system — the ONLY producer of data/nrtl-params-v1.json.
 *
 * Run:  npx tsx server/engine-framework/cel/regression/regress-nrtl-nmp.ts
 *
 * Approved regression architecture (user approval 2026-08-10), hierarchical
 * Coto-anchored form:
 *   STAGE A (298.15 K anchor): regress all 20 τ(298.15 K) values on the Coto
 *     2022 tie-lines alone (isoactivity pre-fit, then direct flash-composition
 *     polish). This guarantees the governed anchor is not distorted by
 *     species-lumping mismatch with the literature ternaries.
 *   STAGE B (temperature slopes): regress the shared slopes bij for the
 *     SAT/MONO/NMP pairs on the multi-temperature literature sets
 *     (Fahim 2005, Fandary 2006, Aljimaz 2006; 289–328 K, NIST ThermoML),
 *     with per-dataset nuisance offsets δ absorbing the alkane/alkylbenzene
 *     species mismatch (C12–C17, C9–C11 lumped into SAT/MONO). Only the
 *     slopes b transfer to the governed model:
 *         τij(T) = τij(298.15) + bij·(1/T − 1/298.15)
 *   DI/POLY pairs: bij ≡ 0 (bounded assumption — no multi-T data).
 *
 *   VALIDATION GATE (must pass before the model may govern):
 *     a. Flash-reproduce all 17 Coto tie-lines at 298.15 K:
 *        RMSD ≤ 3·u(x) = 0.009 mole fraction.
 *     b. Leave-one-temperature-out on the multi-T sets (tests the transferred
 *        slopes): RMSD ≤ 3·max u of the left-out group.
 *     c. Model K_MONO temperature-trend sign must match experiment per dataset.
 *   admitted = a && b && c. FAILURE IS A VALID OUTCOME — the artifact is still
 *   written with admitted=false and the application fails closed
 *   ("Temperature-Dependent LLE Model — DEVELOPMENT GAP").
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  COTO_2022_XYLENE_TIELINES, COTO_2022_TOLUENE_TIELINES, COTO_2022_TEMPERATURE_K, COTO_2022_UX, COTO_2022_CITATION,
} from '../coto2022-nmp-lle';
import { nrtlLnGamma, lleFlash, NRTL_MODEL_ID, type NrtlParams, type NrtlModelArtifact } from '../nrtl-nmp-lle';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const DATA = path.join(HERE, '..', 'data');
const N = 5; // SAT MONO DI POLY NMP
const IDX = { SAT: 0, MONO: 1, DI: 2, POLY: 3, NMP: 4 } as const;
const ALPHA = 0.2;
const T0 = COTO_2022_TEMPERATURE_K; // 298.15 anchor
const U_FLOOR = COTO_2022_UX; // 0.003

interface CalTieLine { T: number; x: number[]; y: number[]; u: number; source: string }

function loadCoto(): CalTieLine[] {
  return [...COTO_2022_XYLENE_TIELINES, ...COTO_2022_TOLUENE_TIELINES].map((tl) => ({
    T: T0, x: [...tl.x], y: [...tl.y], u: COTO_2022_UX, source: 'coto2022',
  }));
}
function loadMulti(): CalTieLine[] {
  const multi = JSON.parse(fs.readFileSync(path.join(DATA, 'multi-t-nmp-lle.json'), 'utf8'));
  const rows: CalTieLine[] = [];
  for (const r of multi.tieLines) {
    const mk = (p: Record<string, number>) => {
      const v = [0, 0, 0, 0, 0];
      v[IDX.SAT] = p.SAT ?? 0; v[IDX.MONO] = p.MONO ?? 0; v[IDX.NMP] = p.NMP ?? 0;
      const s = v.reduce((a, b) => a + b, 0); return v.map((c) => c / s);
    };
    rows.push({ T: r.T_K, x: mk(r.raffinate), y: mk(r.extract), u: Math.max(U_FLOOR, r.u_x ?? U_FLOOR), source: r.source });
  }
  return rows;
}

// ── Parameterisation ─────────────────────────────────────────────────────────
const PAIRS: [number, number][] = [];
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) PAIRS.push([i, j]);
const B_PAIR_LIST: [number, number][] = [[0, 1], [0, 4], [1, 4]]; // SAT-MONO, SAT-NMP, MONO-NMP

/** Build NrtlParams from anchor τ0 (20 values) + slopes b (6 values, ordered per B_PAIR_LIST i→j then j→i).
 *  τij(T) = τ0ij + bij(1/T − 1/T0) ⇒ a = τ0 − b/T0, bMatrix = b. */
function buildParams(tau0: number[], bs: number[]): NrtlParams {
  const a = Array.from({ length: N }, () => new Array(N).fill(0));
  const b = Array.from({ length: N }, () => new Array(N).fill(0));
  const alpha = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? 0 : ALPHA)));
  let k = 0;
  for (const [i, j] of PAIRS) { a[i][j] = tau0[k++]; a[j][i] = tau0[k++]; }
  let m = 0;
  for (const [i, j] of B_PAIR_LIST) {
    b[i][j] = bs[m]; a[i][j] -= bs[m] / T0; m++;
    b[j][i] = bs[m]; a[j][i] -= bs[m] / T0; m++;
  }
  return { a, b, alpha };
}

// ── Objectives ───────────────────────────────────────────────────────────────
function isoactivityObj(p: NrtlParams, rows: CalTieLine[]): number {
  let s = 0;
  for (const tl of rows) {
    const lgx = nrtlLnGamma(tl.x, tl.T, p), lgy = nrtlLnGamma(tl.y, tl.T, p);
    for (let i = 0; i < N; i++) {
      if (tl.x[i] < 1e-6 || tl.y[i] < 1e-6) continue;
      const r = Math.log(tl.x[i]) + lgx[i] - Math.log(tl.y[i]) - lgy[i];
      s += (r * r) / (tl.u * tl.u);
    }
  }
  return Number.isFinite(s) ? s : 1e30;
}
function flashObj(p: NrtlParams, rows: CalTieLine[]): number {
  let s = 0;
  for (const tl of rows) {
    const z = tl.x.map((xi, i) => 0.5 * (xi + tl.y[i]));
    const fl = lleFlash(z, tl.T, p, tl.x, tl.y);
    if (!fl.twoPhase || !fl.converged) { s += 10; continue; } // heavy single-phase penalty
    for (let i = 0; i < N; i++) s += (fl.x[i] - tl.x[i]) ** 2 + (fl.y[i] - tl.y[i]) ** 2;
  }
  return Number.isFinite(s) ? s : 1e30;
}

// ── Nelder–Mead ──────────────────────────────────────────────────────────────
function nelderMead(f: (v: number[]) => number, x0: number[], maxIter: number, step = 0.25): { x: number[]; fx: number } {
  const n = x0.length, al = 1, ga = 2, rh = 0.5, si = 0.5;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += p[i] !== 0 ? 0.15 * Math.abs(p[i]) + 0.02 : step; simplex.push(p); }
  let fvals = simplex.map(f);
  for (let it = 0; it < maxIter; it++) {
    const order = fvals.map((fv, i) => [fv, i] as [number, number]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    simplex = order.map((i) => simplex[i]); fvals = order.map((i) => fvals[i]);
    if (Math.abs(fvals[n] - fvals[0]) < 1e-11 * (1 + Math.abs(fvals[0]))) break;
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
    const xr = c.map((ci, j) => ci + al * (ci - simplex[n][j])); const fr = f(xr);
    if (fr < fvals[0]) { const xe = c.map((ci, j) => ci + ga * (xr[j] - ci)); const fe = f(xe); if (fe < fr) { simplex[n] = xe; fvals[n] = fe; } else { simplex[n] = xr; fvals[n] = fr; } }
    else if (fr < fvals[n - 1]) { simplex[n] = xr; fvals[n] = fr; }
    else { const xc = c.map((ci, j) => ci + rh * (simplex[n][j] - ci)); const fc = f(xc);
      if (fc < fvals[n]) { simplex[n] = xc; fvals[n] = fc; }
      else for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((s2, j) => simplex[0][j] + si * (s2 - simplex[0][j])); fvals[i] = f(simplex[i]); } }
  }
  const best = fvals.indexOf(Math.min(...fvals));
  return { x: simplex[best], fx: fvals[best] };
}
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

// ── STAGE A: Coto anchor ─────────────────────────────────────────────────────
function fitAnchor(coto: CalTieLine[], starts = 8): { tau0: number[]; flashRmsd: number } {
  const zeroB = new Array(6).fill(0);
  // cheap isoactivity multi-start, then rank candidates by flash objective
  const cands: { x: number[]; iso: number }[] = [];
  for (let s = 0; s < starts; s++) {
    const rnd = lcg(97 + s * 7919);
    const v0 = new Array(20).fill(0).map(() => (rnd() - 0.5) * 3);
    // physically-informed: strong SAT↔NMP repulsion
    const kSatNmp = PAIRS.findIndex(([i, j]) => i === 0 && j === 4) * 2;
    v0[kSatNmp] = 2.5 + rnd(); v0[kSatNmp + 1] = 2.5 + rnd();
    const r1 = nelderMead((v) => isoactivityObj(buildParams(v, zeroB), coto), v0, 6000);
    cands.push({ x: r1.x, iso: r1.fx });
    console.log(`  A start ${s + 1}/${starts}: iso obj ${r1.fx.toExponential(3)}`);
  }
  cands.sort((a, b) => a.iso - b.iso);
  // flash-polish only the two best isoactivity candidates (flash evals are expensive)
  let best: { x: number[]; fx: number } | null = null;
  for (const c of cands.slice(0, 3)) {
    const r2 = nelderMead((v) => flashObj(buildParams(v, zeroB), coto), c.x, 1600);
    console.log(`  A flash polish: obj ${r2.fx.toExponential(3)}`);
    if (!best || r2.fx < best.fx) best = r2;
  }
  const r3 = nelderMead((v) => flashObj(buildParams(best!.x, zeroB), coto), best!.x, 3000);
  console.log(`  A final polish: obj ${r3.fx.toExponential(3)}`);
  return { tau0: r3.x, flashRmsd: NaN };
}

// ── STAGE B: shared slopes + per-dataset nuisance offsets ───────────────────
// Free vector: [b(6) | δ_fahim(6) | δ_fandary(6) | δ_aljimaz(6)] — δ applies to
// the same three pairs' τ0 for that dataset only (nuisance, NOT transferred).
const SOURCES = ['fahim2005', 'fandary2006', 'aljimaz2006'];
function stageBObjective(v: number[], tau0: number[], rows: CalTieLine[]): number {
  let s = 0;
  for (const src of SOURCES) {
    const dsRows = rows.filter((r) => r.source === src);
    if (!dsRows.length) continue;
    const delta = v.slice(6 + SOURCES.indexOf(src) * 6, 12 + SOURCES.indexOf(src) * 6);
    const tauDs = tau0.slice();
    let m = 0;
    for (const [i, j] of B_PAIR_LIST) {
      const k = PAIRS.findIndex(([a, b2]) => a === i && b2 === j) * 2;
      tauDs[k] += delta[m++]; tauDs[k + 1] += delta[m++];
    }
    const p = buildParams(tauDs, v.slice(0, 6));
    s += isoactivityObj(p, dsRows);
  }
  return s;
}
function fitSlopes(tau0: number[], rows: CalTieLine[], starts = 3, iters = 4500): number[] {
  let best: { x: number[]; fx: number } | null = null;
  for (let s = 0; s < starts; s++) {
    const rnd = lcg(1234 + s * 104729);
    const v0 = new Array(24).fill(0).map((_, i) => (i < 6 ? (rnd() - 0.5) * 600 : (rnd() - 0.5) * 0.6));
    const r = nelderMead((v) => stageBObjective(v, tau0, rows), v0, iters, 50);
    if (!best || r.fx < best.fx) best = r;
  }
  return best!.x;
}

// ── Flash deviation metric ───────────────────────────────────────────────────
function flashDeviations(p: NrtlParams, rows: CalTieLine[]): { rmsd: number; maxAbs: number; nFlashed: number; nSinglePhase: number } {
  let ss = 0, cnt = 0, maxAbs = 0, nSingle = 0, nOk = 0;
  for (const tl of rows) {
    const z = tl.x.map((xi, i) => 0.5 * (xi + tl.y[i]));
    const fl = lleFlash(z, tl.T, p, tl.x, tl.y);
    if (!fl.twoPhase || !fl.converged) { nSingle++; continue; }
    nOk++;
    for (let i = 0; i < N; i++) for (const d of [fl.x[i] - tl.x[i], fl.y[i] - tl.y[i]]) { ss += d * d; cnt++; maxAbs = Math.max(maxAbs, Math.abs(d)); }
  }
  return { rmsd: cnt ? Math.sqrt(ss / cnt) : Infinity, maxAbs: nOk ? maxAbs : Infinity, nFlashed: nOk, nSinglePhase: nSingle };
}

/** Apply a dataset's nuisance δ to the anchor and return params with shared b. */
function dsParams(tau0: number[], v: number[], src: string): NrtlParams {
  const delta = v.slice(6 + SOURCES.indexOf(src) * 6, 12 + SOURCES.indexOf(src) * 6);
  const tauDs = tau0.slice();
  let m = 0;
  for (const [i, j] of B_PAIR_LIST) {
    const k = PAIRS.findIndex(([a, b2]) => a === i && b2 === j) * 2;
    tauDs[k] += delta[m++]; tauDs[k + 1] += delta[m++];
  }
  return buildParams(tauDs, v.slice(0, 6));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const coto = loadCoto();
  const multi = loadMulti();
  const temps = [...new Set(multi.map((c) => c.T))].sort((a, b) => a - b);
  console.log(`Coto anchor: ${coto.length} tie-lines @ ${T0} K; multi-T: ${multi.length} tie-lines @ ${temps.join(', ')} K`);

  console.log('STAGE A: Coto 298.15 K anchor fit (isoactivity pre-fit + flash polish)…');
  let t0ms = Date.now();
  const { tau0 } = fitAnchor(coto);
  const anchorParams = buildParams(tau0, new Array(6).fill(0));
  const cotoDev = flashDeviations(anchorParams, coto);
  console.log(`  Coto flash: RMSD ${cotoDev.rmsd.toFixed(4)}, max|Δx| ${cotoDev.maxAbs.toFixed(4)}, single-phase ${cotoDev.nSinglePhase}/17  (${((Date.now() - t0ms) / 1000).toFixed(0)} s)`);

  console.log('STAGE B: shared temperature slopes (per-dataset nuisance offsets)…');
  t0ms = Date.now();
  const vB = fitSlopes(tau0, multi);
  console.log(`  slopes b = [${vB.slice(0, 6).map((b) => b.toFixed(1)).join(', ')}] K  (${((Date.now() - t0ms) / 1000).toFixed(0)} s)`);
  const governed = buildParams(tau0, vB.slice(0, 6));

  console.log('VALIDATION GATE…');
  const cotoGate = flashDeviations(governed, coto); // b terms vanish at T0 ⇒ identical to anchor
  const cotoTol = 3 * COTO_2022_UX;
  const cotoPass = cotoGate.rmsd <= cotoTol && cotoGate.nSinglePhase === 0;
  console.log(`  (a) Coto: RMSD ${cotoGate.rmsd.toFixed(4)} vs tol ${cotoTol} → ${cotoPass ? 'PASS' : 'FAIL'}`);

  const loto: { leftOutT_K: number; rmsd: number; maxAbsDev: number; pass: boolean }[] = [];
  for (const T of temps) {
    const train = multi.filter((c) => c.T !== T);
    const vT = fitSlopes(tau0, train, 1, 3000);
    let ss = 0, cnt = 0, maxAbs = 0, nSingle = 0;
    const test = multi.filter((c) => c.T === T);
    for (const tl of test) {
      const p = dsParams(tau0, vT, tl.source);
      const z = tl.x.map((xi, i) => 0.5 * (xi + tl.y[i]));
      const fl = lleFlash(z, tl.T, p, tl.x, tl.y);
      if (!fl.twoPhase || !fl.converged) { nSingle++; continue; }
      for (let i = 0; i < N; i++) for (const d of [fl.x[i] - tl.x[i], fl.y[i] - tl.y[i]]) { ss += d * d; cnt++; maxAbs = Math.max(maxAbs, Math.abs(d)); }
    }
    const rmsd = cnt ? Math.sqrt(ss / cnt) : Infinity;
    const tol = 3 * Math.max(...test.map((t) => t.u));
    const pass = rmsd <= tol && nSingle === 0;
    loto.push({ leftOutT_K: T, rmsd: Number(rmsd.toFixed(5)), maxAbsDev: Number(maxAbs.toFixed(5)), pass });
    console.log(`  (b) LOTO ${T} K: RMSD ${rmsd.toFixed(4)}, max ${maxAbs.toFixed(4)}, single-phase ${nSingle}/${test.length} → ${pass ? 'PASS' : 'FAIL'} (tol ${tol.toFixed(4)})`);
  }
  const lotoPass = loto.every((l) => l.pass);

  const trendNotes: string[] = [];
  let trendPass = true;
  for (const src of SOURCES) {
    const rows = multi.filter((c) => c.source === src && c.x[IDX.MONO] > 0.02 && c.y[IDX.MONO] > 0.02);
    const byT = new Map<number, number[]>();
    for (const r of rows) { const k = r.y[IDX.MONO] / r.x[IDX.MONO]; byT.set(r.T, [...(byT.get(r.T) ?? []), k]); }
    const ts = [...byT.keys()].sort((a, b) => a - b);
    if (ts.length < 2) continue;
    const means = ts.map((t) => byT.get(t)!.reduce((a, b) => a + b, 0) / byT.get(t)!.length);
    const expSign = Math.sign(means[means.length - 1] - means[0]);
    const p = dsParams(tau0, vB, src);
    const mid = rows[Math.floor(rows.length / 2)];
    const kAt = (T: number) => { const fl = lleFlash(mid.x.map((xi, i) => 0.5 * (xi + mid.y[i])), T, p, mid.x, mid.y); return fl.twoPhase ? fl.y[IDX.MONO] / fl.x[IDX.MONO] : NaN; };
    const mSign = Math.sign(kAt(ts[ts.length - 1]) - kAt(ts[0]));
    const ok = Number.isFinite(mSign) && (expSign === 0 || mSign === expSign);
    if (!ok) trendPass = false;
    trendNotes.push(`${src}: experimental K_MONO trend sign ${expSign}, model ${mSign} → ${ok ? 'PASS' : 'FAIL'}`);
  }
  trendNotes.forEach((n) => console.log('  (c) trend ' + n));

  const admitted = cotoPass && lotoPass && trendPass;
  const multiRaw = JSON.parse(fs.readFileSync(path.join(DATA, 'multi-t-nmp-lle.json'), 'utf8'));
  const artifact: NrtlModelArtifact = {
    modelId: NRTL_MODEL_ID,
    version: '1.1.0',
    generatedAtUtc: new Date().toISOString(),
    citationList: [COTO_2022_CITATION, ...Object.values(multiRaw.citation as Record<string, string>)],
    temperatureEnvelopeK: { min: Math.min(...temps, T0), max: Math.max(...temps, T0) },
    params: governed,
    objective: {
      description: 'Hierarchical Coto-anchored regression: Stage A τ(298.15 K) on Coto tie-lines (isoactivity pre-fit + direct flash-composition polish); Stage B shared temperature slopes b on multi-T literature (per-dataset nuisance offsets absorb species lumping; only b transfers). Weights 1/u(x)², u floored at 0.003.',
      finalValue: flashObj(governed, coto), nTieLines: coto.length + multi.length, weightFloorUx: U_FLOOR,
    },
    validation: {
      cotoRmsd: Number(cotoGate.rmsd.toFixed(5)), cotoMaxAbsDev: Number(cotoGate.maxAbs.toFixed(5)), cotoTolerance: cotoTol, cotoPass,
      loto, lotoPass, admitted,
      notes: [
        `Coto flash reproduction: ${cotoGate.nFlashed}/17 two-phase, ${cotoGate.nSinglePhase} collapsed.`,
        ...trendNotes,
        admitted ? 'Model ADMITTED by validation gate.' : 'Model NOT admitted — application fails closed (Temperature-Dependent LLE Model — DEVELOPMENT GAP).',
      ],
    },
    boundedAssumptions: [
      'DI/POLY binary τ slopes bij ≡ 0 (no multi-temperature polyaromatic data) — approved bounded assumption; off-298.15 K results carry POLYAROMATIC_TEMPERATURE_ASSUMPTION and are Pending Validation.',
      'Temperature slopes for SAT/MONO/NMP pairs transferred from C12–C17 alkane + C9–C11 alkylbenzene literature via per-dataset nuisance offsets; the offsets themselves are NOT part of the governed model.',
    ],
  };
  fs.writeFileSync(path.join(DATA, 'nrtl-params-v1.json'), JSON.stringify(artifact, null, 1));
  console.log(`\nArtifact written (admitted=${admitted}) → data/nrtl-params-v1.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
