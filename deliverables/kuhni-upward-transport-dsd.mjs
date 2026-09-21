// Offline only; run from repository root: node deliverables/kuhni-upward-transport-dsd.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const stem = 'deliverables/kuhni-upward-transport-dsd';
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.isFile() ? [`${dir}/${e.name}`] : []);
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const protectedPaths = walk('deliverables').filter(p => !p.startsWith(stem));
const before = Object.fromEntries(protectedPaths.map(p => [p, hash(p)]));
const prior = JSON.parse(fs.readFileSync('deliverables/kuhni-top-dsd-investigation.results.json'));
const physics = JSON.parse(fs.readFileSync('deliverables/top-disengager-physics.results.json'));
const sources = ['kuhni-top-dsd-investigation.mjs', 'kuhni-top-dsd-investigation.results.json',
  'top-disengager-physics.mjs', 'top-disengager-physics.results.json', 'kuhni-dsd-moment-analysis.md',
  'kuhni-outlet-dsd-literature.md', 'kuhni-terminal-coalescence-review.md', 'disengager-drag-evidence.md'];
const p = { d32_mm: 6.068, Qc_m3_h: 3.82179423, rhoC_kg_m3: 869, rhoD_kg_m3: 1015,
  muC_Pa_s: 0.0598, muD_Pa_s: 0.001416, sigma_N_m: 0.011, g_m_s2: 9.80665 };
assert.equal(prior.basis.d32_mm, p.d32_mm);
assert.equal(physics.properties.Qm3h, p.Qc_m3_h);
const widths = [0.35, 0.44, 0.70, 1], cutoffs = [0.5, 1, 1.455, 2.081];
const phi = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
const near = (a, b, rel = 2e-8, abs = 1e-28) => assert(Math.abs(a - b) <= abs + rel * Math.abs(b), `${a} != ${b}`);
function simpson(f, a, b, n = 4096) {
  if (b <= a) return 0;
  const h = (b - a) / n;
  let sum = f(a) + f(b), compensation = 0;
  for (let i = 1; i < n; i++) {
    const y = (i % 2 ? 4 : 2) * f(a + i * h) - compensation;
    const t = sum + y; compensation = (t - sum) - y; sum = t;
  }
  return sum * h / 3;
}
// Direct smaller normal tail avoids cancellation at very small local fractions.
function cdf(z) {
  const x = Math.abs(z);
  const small = phi(x) * simpson(t => Math.exp(-x * t - t * t / 2), 0, 16);
  return z <= 0 ? small : 1 - small;
}
function root(f, lo, hi) {
  assert(f(lo) <= 0 && f(hi) >= 0, 'Unbracketed root');
  for (let i = 0; i < 65; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
const lambda = p.muD_Pa_s / p.muC_Pa_s;
const cleanFactor = (2 + 3 * lambda) / (3 * (1 + lambda));
function vt(d_mm, model = 'SN') {
  const d = d_mm / 1000;
  const stokes = (p.rhoD_kg_m3 - p.rhoC_kg_m3) * p.g_m_s2 * d * d / (18 * p.muC_Pa_s);
  const factor = model === 'SN' ? 1 : cleanFactor;
  return root(v => factor * v * (1 + 0.15 * (p.rhoC_kg_m3 * v * d / p.muC_Pa_s) ** 0.687) - stokes, 0, stokes / factor * 1.001);
}
near(cdf(-8), 6.220960574271784e-16);
near(cdf(-3), 0.0013498980316300945);
near(cdf(0), 0.5);
const momentChecks = widths.map(s => {
  const muN = Math.log(p.d32_mm) - 2.5 * s * s, muV = muN + 3 * s * s;
  const moments = [0, 1, 2, 3].map(k => {
    const analytic = Math.exp(k * muN + k * k * s * s / 2);
    const numerical = simpson(z => phi(z) * Math.exp(k * (muN + s * z)), -16, 16);
    near(numerical, analytic);
    return { k, analytic, numerical };
  });
  near(moments[3].numerical / moments[2].numerical, p.d32_mm);
  const inverse = simpson(z => phi(z) / Math.exp(muV + s * z), -16, 16);
  near(inverse, 1 / p.d32_mm);
  cutoffs.forEach((c, i) => near(cdf((Math.log(c) - muV) / s), prior.lognormal.find(r => r.sigma_ln === s).tails[i].volume_fraction));
  const noSlipNormalization = simpson(phi, -16, 16);
  near(noSlipNormalization, 1);
  return { s, moments, inverse_volume_per_mm: inverse, vt_zero_K_over_U: noSlipNormalization, vt_zero_d32_mm: noSlipNormalization / inverse };
});
function calculate(D, s, model) {
  const A = Math.PI * (D / 1000) ** 2 / 4, U = p.Qc_m3_h / 3600 / A;
  const muV = Math.log(p.d32_mm) + 0.5 * s * s;
  const d0 = root(d => vt(d, model) - U, 1e-6, 20);
  const z0 = (Math.log(d0) - muV) / s;
  const diameter = z => Math.exp(muV + s * z);
  // dP_V = phi(z) dz; this explicitly includes the logarithmic Jacobian.
  const f = z => phi(z) * Math.max(1 - vt(diameter(z), model) / U, 0);
  const integrate = (a, b, n = 4096) => simpson(f, a, b, n);
  const r = integrate(-16, z0), coarse = integrate(-16, z0, 2048), fine = integrate(-16, z0, 8192);
  near(r, fine); near(coarse, fine);
  near(integrate(-18, z0), r);
  assert(r > 0 && r < 1);
  const K = U * r;
  const F = c => c >= d0 ? 1 : integrate(-16, (Math.log(c) - muV) / s) / r;
  const tails = [...cutoffs, d0].map(c => {
    const z = (Math.log(c) - muV) / s;
    const up = F(c), survival = c >= d0 ? 0 : integrate(z, z0) / r;
    near(up + survival, 1);
    near(c >= d0 ? 1 : integrate(-16, z, 8192) / fine, up);
    const local = cdf(z);
    // vt=0 limiting CDF recovers the same local volume CDF.
    near(simpson(phi, -16, z), local);
    return { cutoff_mm: c, role: c === d0 ? 'actual model zero-net root' : 'reporting cutoff only',
      local_volume_CDF: local, upward_volume_flux_CDF: up, upward_survival_fraction: survival };
  });
  const percentiles = [0.1, 0.5, 0.9].map(prob => {
    const z = root(x => integrate(-16, x, 4096) / r - prob, -16, z0);
    near(integrate(-16, z, 8192) / fine, prob, 1e-7);
    return { probability: prob, diameter_mm: diameter(z) };
  });
  const inverse = simpson(z => f(z) / diameter(z), -16, z0);
  const d32up = r / inverse;
  near(simpson(z => f(z) / r, -16, z0), 1);
  near(d32up, fine / simpson(z => f(z) / diameter(z), -16, z0, 8192));
  assert(d32up > 0 && d32up < d0);
  let previous = -1, previousV = -1;
  for (let i = 0; i <= 1000; i++) {
    const z = -16 + (z0 + 16) * i / 1000, d = diameter(z), v = vt(d, model);
    assert(Number.isFinite(f(z)) && f(z) >= 0 && Number.isFinite(v) && v >= previousV);
    previousV = v;
    // Dense CDF scan uses 128 panels; production CDFs use 4096/8192.
    const value = i === 1000 ? 1 : integrate(-16, z, 128) / r;
    assert(Number.isFinite(value) && value >= previous - 1e-12 && value <= 1 + 1e-12);
    previous = value;
  }
  const rootRe = p.rhoC_kg_m3 * U * d0 / 1000 / p.muC_Pa_s;
  const rootEo = (p.rhoD_kg_m3 - p.rhoC_kg_m3) * p.g_m_s2 * (d0 / 1000) ** 2 / p.sigma_N_m;
  return { diameter_mm: D, s, model, A_m2: A, U_m_s: U, zero_net_mm: d0, zero_net_Re: rootRe, zero_net_Eo: rootEo,
    mu_volume_log_mm: muV, K_up_m_s: K, K_up_over_U: r, tails, volume_flux_percentiles: percentiles, d32_up_mm: d32up,
    Qup_m3_h_per_unit_alpha: A * K * 3600, ppmv_relative_Qc_per_unit_alpha: r * 1e6,
    illustrative_alpha_0_01: { status: 'PER 1 VOL% LOCAL HOLDUP SCALING ONLY; NOT ACTUAL HOLDUP OR ACTUAL PPM',
      Qup_m3_h: A * K * 3600 * 0.01, ppmv_relative_Qc: r * 1e4 },
    checks: { normalized: true, dense_1001_point_monotonic_finite: true, coarse_refined_relative_error: Math.abs(coarse / fine - 1),
      main_refined_relative_error: Math.abs(r / fine - 1), z_lower: -16, z_upper: z0,
      omitted_local_volume_lower_tail_bound: phi(16) / 16, omitted_K_over_U_bound: phi(16) / 16,
      lower_support_extended_to_minus18_agrees: true } };
}
const rows = [];
for (const D of [700, 900, 1000, 1200]) for (const s of widths) rows.push(calculate(D, s, 'SN'));
for (const s of widths) rows.push(calculate(700, s, 'Myint_clean_EXTRAPOLATION'));
near(rows[0].zero_net_mm * 1000, physics.zeroNet700Um, 1e-12);
for (const s of widths) {
  const subset = rows.filter(r => r.s === s && r.model === 'SN');
  for (let i = 1; i < subset.length; i++) assert(subset[i].K_up_over_U < subset[i - 1].K_up_over_U);
  assert(rows.find(r => r.s === s && r.model !== 'SN').K_up_over_U < subset[0].K_up_over_U);
}
for (const path of protectedPaths) assert.equal(hash(path), before[path], `Protected file changed: ${path}`);
const result = {
  status: 'OFFLINE CONDITIONAL ONE-WAY PLANE TRANSPORT; EQUIPMENT PERFORMANCE HOLD',
  classification: { I: 'Inherited fixed properties, calculated mean and 700 x 1600 mm top reservation',
    A: 'Assumed local number-lognormal, widths, uniform dilute slip; unknown alpha',
    C: 'Calculated conditional transport, not measured/predicted actual carryover',
    E: 'Reporting cutoffs and larger comparison diameters, not capture duties or selected geometry' },
  basis: p, unchanged_top_reservation_mm: [700, 1600], lambda,
  model: { pV_local_per_mm: 'phi((ln(d/mm)-muV)/s)/(s*d_mm)', muN: 'ln(6.068)-2.5*s^2', muV: 'ln(6.068)+0.5*s^2',
    Jup: 'alpha*pVlocal(d)*max(U-vt(d),0)', K_up: 'integral pVlocal(d)*max(U-vt(d),0) dd [m/s]',
    pVup: 'pVlocal(d)*max(U-vt(d),0)/K_up; defined only for K_up>0',
    d32up: '1 / integral pVup(d)/d dd', U: 'Qc/A nominal dilute velocity; no finite-holdup velocity correction',
    absoluteScaling: 'Qup=A*alpha*K_up; ppmv relative to continuous Qc = alpha*(K_up/U)*1e6, NOT total-dispersion denominator',
    mobility: 'Myint et al. 2006 DOI 10.1299/jfst.1.72 Eq.9 clean C/mu=0: CD=24/Re*(2+3lambda)/(3*(1+lambda))*(1+0.15Re^0.687). EXTRAPOLATION: lambda=0.02368 below tested 0.1; contributing Re and Eo also partly below tested ranges (0.17<Re<200, 0.017<Eo<12.1). Not validation or guaranteed bound. Correct creeping limit is HR, v/Stokes=3*(1+lambda)/(2+3lambda).',
    sn: 'Inherited isolated spherical immobile-interface Schiller-Naumann model; base threshold unchanged; not physical validation',
    support: 'Physical assumed lognormal support (0,infinity), not donor detection bounds. Numerical z>=-16; upward support ends at exact vt=U root. Coarse local tail above root has zero upward weight, not a need to extrapolate its drag.',
    undefinedCases: 'If alpha=0 there is no physical upward flux; normalized kernel is only a conditional mathematical shape. If K_up=0 its normalized DSD, percentiles and d32 are undefined; all evaluated lognormal cases have K_up>0.' },
  interpretation: [
    's=.35/.44 are conditional donor-width transfers, not fitted RRBO widths or confidence limits; .70/1 are analyst broad stresses.',
    'Same assumed local DSD and alpha at all diameters: conditional transport sensitivity, NOT a solved modified steady field or geometry selection.',
    'Snapshot one-way crossing flux is not steady outlet escape. No turbulence, coalescence, breakup, spatial holdup, resupply or residence-time closure.',
    'No fresh solvent flow used as entrainment source or holdup. No actual alpha, absolute ppm or carryover established.',
    'No capture efficiency assigned. Retain 700 reservation; neither certify nor reject it from these conditional tails.',
    'Need local/plane-resolved DSD and alpha, upward velocities, feed/drop supply, evolving quiet-zone population and agreed actual carryover limit.' ],
  sourceSha256: Object.fromEntries(sources.map(x => [x, hash(`deliverables/${x}`)])),
  momentChecks, rows, checks: { status: 'PASS numerical mathematics only', protected_files_unchanged: protectedPaths.length,
    local_CDF_matches_prior: true, inherited_exact_SN_root_matches: true, no_slip_limit: true,
    larger_area_transport_monotonic: true, no_app_DB_network_access: true }
};
fs.writeFileSync(`${stem}.json`, JSON.stringify(result, null, 2) + '\n');
const fmt = x => Number(x).toPrecision(9);
const table = (headers, data) => ['| ' + headers.join(' | ') + ' |', '|' + headers.map(() => '---:').join('|') + '|',
  ...data.map(r => '| ' + r.join(' | ') + ' |')].join('\n');
const base = rows.filter(r => r.diameter_mm === 700 && r.model === 'SN');
const report = `# Offline upward transported DSD — conditional, not outlet certification

**700 × 1600 mm remains the unchanged top reservation. No app, DB, saved design, old deliverable or PDF is changed.** This resolves the next mathematical question: under specified local lognormal hypotheses, how does upward slip selection change the DSD? It does not establish the actual terminal population or solve the actual 700-mm carryover problem.

## Classifications and basis

I = inherited fixed inputs; A = assumptions; C = calculated conditional results; E = reporting choices. All tables are C conditional on A, not predictions. Inputs [I]: d32=6.068 mm (calculated compartment mean, not measured local top mean), Qc=${p.Qc_m3_h} m³/h, RRBO rho=869 kg/m³ and mu=0.0598 Pa·s, NMP rho=1015 kg/m³ and mu=0.001416 Pa·s, sigma=0.011 N/m, g=9.80665 m/s². At 700 mm, U=${fmt(base[0].U_m_s * 1000)} mm/s.

Number-lognormal [A]: ln(d/1 mm) ~ N(muN,s²), muN=ln(6.068)-2.5s²; volume-lognormal muV=ln(6.068)+0.5s². Widths .35/.44 are conditional transfers from Oliveira et al. (2008), DOI 10.1590/S0104-66322008000400010, as audited in the prior investigation. Neither is a fitted target width. Widths .70/1 are deliberately broad sensitivities. Donor local photographs are not upward flux measurements; no sub-500 µm completeness or target transfer has been established.

## Transport definition and units

pVlocal(d)=phi((ln(d/mm)-muV)/s)/(s*d_mm), normalized per mm. Jup(d)=alpha*pVlocal(d)*max(U-vt(d),0). K_up=integral pVlocal*max(U-vt,0) dd [m/s]; pVup=Jup/(alpha*K_up). Flux percentiles are volume-flux weighted, not local volume or number weighted. d32up=1/integral(pVup/d)dd, not the inherited 6.068 mm.

U=Qc/A is the inherited nominal dilute approximation, not Qc/[A*(1-alpha)]. Alpha is the unknown local dispersed volume fraction, assumed uniform across the plane. Qup=A*alpha*K_up and ppmv=Qup/Qc*1e6=alpha*(K_up/U)*1e6. The denominator is **continuous flow**, not total dispersion. No fresh solvent flow is used as source load or holdup.

## 700-mm SN results

Exact zero-net root **${base[0].zero_net_mm.toPrecision(16)} mm**, not the reporting cutoff 1.455 mm. At 2.081 mm the upward CDF is exactly one because it exceeds that root; this is not a capture guarantee. No factor-of-two design velocity screen is applied to the one-way physical crossing kernel.

${table(['s', 'K_up m/s', 'K_up/U', 'dV10 mm', 'dV50 mm', 'dV90 mm', 'd32up mm', 'ppmv per 1 vol% alpha ONLY'],
  base.map(r => [r.s, fmt(r.K_up_m_s), fmt(r.K_up_over_U), ...r.volume_flux_percentiles.map(x => fmt(x.diameter_mm)), fmt(r.d32_up_mm), fmt(r.illustrative_alpha_0_01.ppmv_relative_Qc)]))}

The last column is **illustrative scaling per 1 vol% local holdup, NOT actual holdup or actual ppm**. Multiply that column by alpha/0.01 only if an applicable local alpha becomes established. At alpha=0 no physical flux exists. For K_up=0 normalized flux statistics would be undefined; none of these assumed full-support lognormal cases has K_up=0.

### CDFs as fractions, not percentages

${table(['s', 'cutoff mm', 'local volume CDF', 'upward flux CDF', 'upward survival above cutoff'],
  base.flatMap(r => r.tails.map(t => [r.s, t.cutoff_mm === r.zero_net_mm ? fmt(t.cutoff_mm) + ' (exact root)' : t.cutoff_mm,
    fmt(t.local_volume_CDF), fmt(t.upward_volume_flux_CDF), fmt(t.upward_survival_fraction)])))}

The tiny nonzero survival above rounded 1.455 mm is integrated directly, not lost by reporting the rounded cutoff as the exact root. Large normalized fine fractions can coexist with extremely small flux mass. Conversely, widening the assumed local DSD raises available fine volume greatly; neither width is known for this service.

## Mobility diagnostic — EXTRAPOLATION, not validation

${result.model.mobility}

The calculation uses that published finite-Re form, not an unlabelled HR speed at finite Re. SN remains the unchanged base. These sensitivities do not validate either clean interfaces or spherical drops; no mobility or swarm bound is claimed.

${table(['s', 'model', 'root mm', 'root Re', 'root Eo', 'K_up/U', 'dV10/50/90 mm', 'd32up mm', 'ppmv per 1 vol% ONLY'],
  rows.filter(r => r.model !== 'SN').map(r => [r.s, 'clean EXTRAPOLATION', fmt(r.zero_net_mm), fmt(r.zero_net_Re), fmt(r.zero_net_Eo),
    fmt(r.K_up_over_U), r.volume_flux_percentiles.map(x => fmt(x.diameter_mm)).join('/'), fmt(r.d32_up_mm), fmt(r.illustrative_alpha_0_01.ppmv_relative_Qc)]))}

All clean-model CDFs and per-alpha flux coefficients are retained in JSON.

## Larger area: same assumed local DSD and alpha, no geometry selection

${table(['diameter mm [E]', 's [A]', 'U mm/s', 'SN root mm', 'K_up/U', 'Qup m³/h per 1 vol% ONLY', 'ppmv per 1 vol% ONLY'],
  rows.filter(r => r.model === 'SN').map(r => [r.diameter_mm, r.s, fmt(r.U_m_s * 1000), fmt(r.zero_net_mm), fmt(r.K_up_over_U),
    fmt(r.illustrative_alpha_0_01.Qup_m3_h), fmt(r.illustrative_alpha_0_01.ppmv_relative_Qc)]))}

These are conditional transport sensitivities at 900/1000/1200 mm with the SAME local DSD and alpha, not a recalculated steady population or a recommendation. A real area change changes flow, spatial holdup, supply and coalescence, which this model does not solve.

## Numerical verification (PASS means mathematics only)

- Integration uses standardized log diameter z=(ln d-muV)/s with pV dd=phi(z)dz. Physical local support is (0,infinity); numerical lower z=-16 excludes less than ${fmt(phi(16) / 16)} local volume and K_up/U. Extending to -18 agrees. No donor detection limit is imposed as a physical minimum.
- Upward support is explicitly truncated at the exact model vt=U root; no unresolved corner is integrated across. Every CDF above the root is exactly one.
- Compensated composite Simpson with 2048/4096/8192 panels checks refinement; maximum coarse/refined relative K error ${fmt(Math.max(...rows.map(r => r.checks.coarse_refined_relative_error)))}. CDFs, percentiles and inverse moments are also checked against refined quadrature.
- Number moments 0–3, local d32, volume inverse moment, full local normalization and prior local CDFs agree. vt=0 gives K_up/U=1, pVup=pVlocal and d32up=6.068 mm. Reference normal tails include z=-8 without cancellation.
- Upward normalization, complement CDF integrals, positive bounded coefficients and percentiles, 1001-point finite nonnegative density/speed and monotonic CDF scans pass in every case. Increasing area lowers K_up/U for each identical local DSD; clean extrapolation lowers it relative to SN. Exact 700 SN root agrees with the inherited physics JSON.
- ${protectedPaths.length} pre-existing deliverable files were hashed and verified unchanged. JSON contains provenance hashes and check residuals. No application module, database, workflow or network was accessed.

## What can be concluded about the actual problem?

The upward transported population is a strongly selected fine subset, not a local snapshot volume DSD, and its mean is not 6.068 mm. The calculated conditional flux varies strongly with the unmeasured tail width. This makes local d32 alone insufficient to certify or reject the 700-mm top.

This is an instantaneous **one-way plane crossing** calculation for a stipulated snapshot concentration and velocity, not steady outlet escape. Selective depletion/return, resupply, fresh-feed droplet formation, turbulent crossings, residence time, coalescence, breakup and nonuniform flow are not closed. No assigned capture grade efficiency or absolute carryover is inferred. Required next evidence: applicable local/plane DSD and alpha, size-resolved upward velocity or flux, feed/drop supply and quiet-zone evolution, plus an agreed carryover specification. Retain the reservation and performance HOLD; neither enlargement nor a coalescer is selected.

## Reproduction and sources

Run \`node deliverables/kuhni-upward-transport-dsd.mjs\` from repository root. Node built-ins only; writes only this prefix's JSON and Markdown. Sources are the inherited investigation/physics generators and JSON, latest DSD moment/literature/coalescence reports and drag evidence; hashes are in JSON. No new literature-access claim is made.
`;
fs.writeFileSync(`${stem}.md`, report);
console.log(JSON.stringify({ status: result.checks.status, base700: base.map(r => ({ s: r.s, K_U: r.K_up_over_U,
  percentiles_mm: r.volume_flux_percentiles.map(x => x.diameter_mm), d32up_mm: r.d32_up_mm,
  ppmv_per_1volpct_only: r.illustrative_alpha_0_01.ppmv_relative_Qc })), checks: result.checks }, null, 2));