// Offline only. Run from repository root; writes only this prefix's JSON/Markdown.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const stem = 'deliverables/kuhni-outlet-transmission';
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(`${dir}/${e.name}`) : e.isFile() ? [`${dir}/${e.name}`] : []);
const hash = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const protectedPaths = walk('deliverables').filter(path => !path.startsWith(stem));
const oldHashes = Object.fromEntries(protectedPaths.map(path => [path, hash(path)]));
const prior = JSON.parse(fs.readFileSync('deliverables/kuhni-upward-transport-dsd.json'));
const p = prior.basis;
const A = Math.PI * 0.7 ** 2 / 4, U = p.Qc_m3_h / 3600 / A;
const near = (a, b, r = 3e-8, abs = 1e-25) =>
  assert(Math.abs(a - b) <= abs + r * Math.abs(b), `${a} != ${b}`);
function simpson(f, a, b, n = 4096) {
  if (b <= a) return 0;
  const h = (b - a) / n;
  let sum = f(a) + f(b), correction = 0;
  for (let i = 1; i < n; i++) {
    const y = (i % 2 ? 4 : 2) * f(a + i * h) - correction;
    const t = sum + y; correction = (t - sum) - y; sum = t;
  }
  return sum * h / 3;
}
function root(f, lo, hi) {
  assert(f(lo) <= 0 && f(hi) >= 0);
  for (let i = 0; i < 62; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
const phi = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
function normalCDF(z) {
  const x = Math.abs(z);
  const tail = phi(x) * simpson(t => Math.exp(-x * t - t * t / 2), 0, 16, 8192);
  return z <= 0 ? tail : 1 - tail;
}
function vt(dmm) {
  const d = dmm / 1000;
  const st = (p.rhoD_kg_m3 - p.rhoC_kg_m3) * p.g_m_s2 * d * d / (18 * p.muC_Pa_s);
  return root(v => v * (1 + 0.15 * (p.rhoC_kg_m3 * v * d / p.muC_Pa_s) ** 0.687) - st, 0, st * 1.001);
}
const dRoot = root(d => vt(d) - U, 0, 3);
near(dRoot, 1.4553431783600201);
near(normalCDF(-8), 6.220960574271784e-16);
const lengths = [
  { L_m: 0.9, role: 'PRIMARY: terminal boundary z=0 to outlet lower-edge onset z=900 mm' },
  { L_m: 0.935, role: 'SENSITIVITY: terminal boundary to outlet CL; not an actual streamline length' },
  { L_m: 0.6, role: 'QUIET ONLY: z=300 to 900 mm; same stipulated incoming distribution at z=300, not total terminal-to-outlet travel' }
];
const rows = [];
for (const s of [0.35, 0.44, 0.7, 1]) {
  const inherited = prior.rows.find(r => r.diameter_mm === 700 && r.model === 'SN' && r.s === s);
  const muV = Math.log(p.d32_mm) + 0.5 * s * s;
  const zr = (Math.log(dRoot) - muV) / s;
  const speed = z => Math.max(0, U - vt(Math.exp(muV + s * z)));
  const kernel = z => phi(z) * speed(z);
  const Ks = [2048, 4096, 8192].map(n => simpson(kernel, -16, zr, n));
  const K = Ks[2], Fv = normalCDF(zr);
  Ks.forEach(k => near(k, K));
  near(K, inherited.K_up_m_s);
  near(simpson(kernel, -18, zr, 8192), K);
  near(simpson(phi, -16, zr, 8192), Fv);
  const cdfD = (d, n = 8192) => simpson(kernel, -16, (Math.log(d) - muV) / s, n) / K;
  for (const length of lengths) {
    const L = length.L_m;
    function timePoint(minutes, n = 8192) {
      const seconds = minutes * 60;
      if (seconds <= L / U) return { minutes, transmitted_fraction: 0, remaining_fraction: 1 };
      const d = root(d => vt(d) - (U - L / seconds), 0, dRoot);
      const z = (Math.log(d) - muV) / s;
      const transmitted = simpson(kernel, -16, z, n) / K;
      // Direct upper-tail integration, not subtraction from a CDF near one.
      const remaining = simpson(kernel, z, zr, n) / K;
      near(transmitted + remaining, 1);
      return { minutes, transmitted_fraction: transmitted, remaining_fraction: remaining, maximum_arrived_d_mm: d };
    }
    const byTime = [10, 20, 30, 60, 120, 600, 6000, 60000].map(t => timePoint(t));
    byTime.forEach(point => near(timePoint(point.minutes, 4096).transmitted_fraction, point.transmitted_fraction));
    for (let i = 1; i < byTime.length; i++) assert(byTime[i].transmitted_fraction >= byTime[i - 1].transmitted_fraction);
    const percentiles = inherited.volume_flux_percentiles.map(q => {
      near(cdfD(q.diameter_mm), q.probability);
      const minutes = L / (U - vt(q.diameter_mm)) / 60;
      near(timePoint(minutes).transmitted_fraction, q.probability);
      return { probability: q.probability, minutes, diameter_mm: q.diameter_mm };
    });
    const meanSeconds = L * Fv / K;
    // Independent quadrature of p_up*T with endpoint limit after cancellation.
    const numericalMean = simpson(z => {
      const v = speed(z);
      return v > 1e-14 ? kernel(z) / K * (L / v) : L * phi(z) / K;
    }, -16, zr, 8192);
    near(numericalMean, meanSeconds);
    const derivative = (vt(dRoot + 1e-5) - vt(dRoot - 1e-5)) / 2e-5;
    const localDensityAtRoot = phi(zr) / (s * dRoot);
    const tailCoefficient_s2 = localDensityAtRoot * L * L / (2 * derivative * K);
    const last = byTime.at(-1);
    const tailRatio = last.remaining_fraction * (last.minutes * 60) ** 2 / tailCoefficient_s2;
    near(tailRatio, 1, 0.003);
    rows.push({
      s, ...length, K_up_m_s: K, Fv_local_at_root: Fv,
      minimum_time_minutes_infimum: L / U / 60,
      by_time: byTime, time_percentiles: percentiles,
      mean_time_minutes: meanSeconds / 60, eventual_transmission_fraction: 1,
      steady_inventory_m3_per_unit_alpha: A * L * Fv,
      checks: { K_2048_4096_8192: Ks, K_coarse_refined_relative_error: Math.abs(Ks[0] / K - 1),
        mean_direct_quadrature_minutes: numericalMean / 60,
        tail_asymptotic_coefficient_s2: tailCoefficient_s2, large_time_tail_ratio: tailRatio }
    });
  }
}
for (const s of [0.35, 0.44, 0.7, 1]) {
  const base = rows.find(r => r.s === s && r.L_m === 0.9);
  rows.filter(r => r.s === s).forEach(r => near(r.mean_time_minutes / base.mean_time_minutes, r.L_m / 0.9));
}
for (const path of protectedPaths) assert.equal(hash(path), oldHashes[path], `Changed old file: ${path}`);
const result = {
  status: 'PASS mathematics and provenance; HOLD actual outlet fraction and equipment performance',
  basis: p, inherited_basis_classification: prior.classification, inherited_model_caveats: prior.model,
  inherited_interpretation: prior.interpretation, unchanged_top_reservation_mm: [700, 1600],
  geometry: { terminal_boundary_mm: 0, distributor_mm: [200, 300], quiet_mm: [300, 900],
    outlet_opening_mm: [900, 970], outlet_CL_mm: 935, gross_height_mm_not_travel_length: 1600 },
  A_m2: A, U_m_s: U, ideal_open_area_fraction: 0.4,
  ideal_stator_carrier_U_over_0_4_m_s: U / 0.4,
  SN_zero_net_d_mm: dRoot,
  population: 'Inherited full-bore mean-flow surrogate pVup, NOT measured or calculated actual terminal-stator crossing DSD',
  assumptions: ['Dilute uniform constant full-bore carrier U at all elevations', 'Incoming NMP volume-flux weights pVlocal*(U-vt)/K on 0<d<root',
    'Unchanged spherical isolated-drop SN slip, no coalescence or breakup', 'No deposition, turbulent return, dissolution or other sink/source along path',
    'Absorbing whole outlet plane surrogate, not a resolved side-nozzle streamline field', 'Zero initial inventory for startup interpretations'],
  equations: { travel: 'T(d)=L/(U-vt(d))', mean: 'E_up[T]=L*Fv_local(dRoot)/K_up',
    time_CDF: 'P_up(T<=t)=integral_0^d_t pVup(d) dd; vt(d_t)=U-L/t; zero for t<=L/U',
    steady_inventory: 'I_inf=Qin*E[T]=A*alpha*L*Fv_local(dRoot)',
    startup_inventory: 'I(t)=Qin*integral_0^t [1-F_T(a)] da',
    constant_step_cumulative_out: 'Vout(t)=Qin*integral_0^t F_T(a) da; not Qin*t*F_T(t)',
    long_tail: '1-F_T(t) ~ pVlocal(dRoot)*L^2/[2*vt_prime(dRoot)*K_up*t^2]' },
  rows, sourceSha256: Object.fromEntries(['kuhni-upward-transport-dsd.mjs', 'kuhni-upward-transport-dsd.json',
    'kuhni-upward-transport-dsd.md', 'top-disengager-layout.md'].map(f => [f, hash(`deliverables/${f}`)])),
  checks: { status: 'PASS', protected_old_deliverable_count: protectedPaths.length, protected_old_sha256: oldHashes,
    old_files_unchanged: true, lower_z_minus16_and_minus18_agree: true, normal_tail_check: true,
    flux_normalization_and_complements: true, quadrature_refinement: true, inherited_percentiles_reproduced: true,
    mean_cancellation_identity: true, linear_length_scaling: true, large_time_asymptotic_checked: true }
};
const fmt = x => x.toPrecision(7);
const table = (header, body) => `| ${header.join(' | ')} |\n|${header.map(() => '---:').join('|')}|\n${body.map(r => `| ${r.join(' | ')} |`).join('\n')}`;
const report = `# Offline outlet transmission — conditional baseline, actual performance HOLD

**PASS mathematics; HOLD actual terminal-to-raffinate transmission and Ø700 ×1600 performance.** No application, database, old deliverable, workflow, design or PDF is changed. No new literature or fluid-field evidence is claimed.

## Answer and the critical population distinction

Under the stipulated uniform constant Ø700 dilute flow, unchanged drops and no coalescence, breakup, deposition, turbulent return or other sink, **100% of the selected incoming NMP volume eventually reaches the absorbing outlet plane**. Every selected diameter 0<d<${fmt(dRoot)} mm has U−vt(d)>0 over the entire height. The zero-speed endpoint has zero incoming flux measure. Height delays these drops; it does not remove them. This is a conditional mathematical baseline, **not an actual 100% outlet-fraction prediction**.

The inherited pVup is based on **full-bore mean U**, not the actual terminal-stator crossing DSD. At nominal open area 0.4, the ideal carrier-only opening-average U/0.4 is **${fmt(U / 0.4 * 1000)} mm/s**, versus full-bore **${fmt(U * 1000)} mm/s** (2.5 times). This scale is not a two-phase velocity field: local jets, recirculation, turbulence, finite holdup and return flow can change crossings and entrain drops above the full-bore root. No corresponding stator crossing population or new crossing cutoff is asserted. A genuinely supplied terminal crossing population could therefore have a different outlet fraction even in a subsequently calmer full-bore region.

## Frozen basis and assumptions

Inherited: d32=${p.d32_mm} mm, Qc=${p.Qc_m3_h} m³/h, RRBO rho=${p.rhoC_kg_m3} kg/m³ and mu=${p.muC_Pa_s} Pa·s; NMP rho=${p.rhoD_kg_m3} kg/m³ and mu=${p.muD_Pa_s} Pa·s; sigma=${p.sigma_N_m} N/m; g=${p.g_m_s2} m/s². Active Ø700 ×4200, 20 ×210 compartments, Ø231 rotor, 30 rpm, Np=1.2, existing terminal internals and bottom Ø700 neck ×300 + cone 173.205 + Ø900 straight ×1200 remain untouched and un-requalified.

Assumed number lognormal: muN=ln(6.068)−2.5s²; volume muV=ln(6.068)+0.5s². Widths .35/.44 are conditional donor transfers, not measured RRBO widths; .70/1 are broad stresses, not uncertainty intervals. The inherited d32 is a calculated compartment mean, not measured terminal-local mean. The unresolved fine mode, donor sub-500 µm completeness, local alpha and applicable tail remain unknown. SN isolated spherical immobile-interface slip is inherited, not validated. The prior clean-interface diagnostic root ≈1.193546 mm is an extrapolation, not a validated alternative or uncertainty bound; this calculation does not replace those caveats with a certified root. Dissolved NMP is outside the drop claim. No fresh-solvent rate is substituted for entrainment.

The full-bore surrogate uses U=Qc/A, not Qc/[A(1−alpha)], and pVup=pVlocal(d)(U−vt)/K_up below the exact SN root; incoming **volume flux**, not number or local inventory, is the weighting. Conditional statistics require nonzero incoming flux; at alpha=0 no physical transmission fraction is observable. No invented velocity field, separator sink or kinetic constant is introduced.

## Actual layout versus mathematical absorbing plane

Top-local z=0 is the terminal/active-top boundary (actual stator upper-face position needs mechanical confirmation). Calming 0–200 mm; distributor 200–300; quiet region 300–900; outlet opening 900–970, CL935. **Primary L=0.900 m** is the terminal-to-lower-edge onset plane proxy. L=0.935 m is a centerline sensitivity, not actual streamline length. L=0.600 m is only quiet-zone travel with the same stipulated population at its entrance; it omits the first 300 mm and does not solve distributor evolution. No 1.600 m travel path is credited. Cover, operating band, freeboard and gross shell height are not upstream settling lengths.

The ideal whole-plane absorber deliberately ignores lateral nozzle approach, turn-in, possible bypass and nonuniform residence time. Therefore even “arrival at the plane” is only a surrogate for actual outlet interception.

## Incoming-volume transmission versus time

T=L/[U−vt(d)]. For t>L/U, vt(d_t)=U−L/t and F_T(t)=integral from 0 to d_t of pVup. Otherwise F_T=0. All percentages below are conditional incoming NMP volume fractions, not removal efficiencies.

${lengths.map(length => {
  const subset = rows.filter(r => r.L_m === length.L_m);
  return `### L=${length.L_m} m — ${length.role}\n\n` + table(
    ['s', '10 min %', '20 min %', '30 min %', '60 min %', 'eventual %', 'T10 min', 'T50 min', 'T90 min', 'mean min'],
    subset.map(r => [r.s, ...r.by_time.slice(0, 4).map(t => fmt(t.transmitted_fraction * 100)), 100,
      ...r.time_percentiles.map(q => fmt(q.minutes)), fmt(r.mean_time_minutes)]));
}).join('\n\n')}

### Long-time tail, primary 0.900 m

${table(['s', 'remaining at 120 min', '600 min', '6000 min', '60000 min'],
  rows.filter(r => r.L_m === 0.9).map(r => [r.s, ...r.by_time.slice(4).map(t => fmt(t.remaining_fraction))]))}

Remaining fractions are integrated directly, avoiding 1−CDF cancellation. T diverges as d approaches the root, but the incoming flux density vanishes linearly there. Their product cancels:

**E_up[T] = integral pVlocal(U−vt)/K × L/(U−vt) dd = L Fvlocal(root)/K_up.**

Thus the mean is finite with no imposed near-root cutoff. For smooth nonzero local density, survival decays as t^-2; the second time moment diverges logarithmically in this exact ideal full-support model. A slow tail is not evidence of capture. The earliest possible times (infima as d→0) are ${lengths.map(l => `${l.L_m} m: ${fmt(l.L_m / U / 60)} min`).join('; ')}.

## Pulse, startup, steady state and inventory

- An instantaneous pulse whose incoming-volume composition equals pVup has cumulative arrived fraction F_T(t).
- A constant step input Qin with fixed composition and zero initial inventory has instantaneous Qout(t)/Qin=F_T(t). Its cumulative outlet volume is Qin integral_0^t F_T(a) da; the cumulative fraction of all volume supplied by time t is that integral divided by t, **not** F_T(t).
- Under sustained steady input, Qout/Qin→1. The inlet/outlet steady flux composition is unchanged; inventory is preferentially weighted toward slow drops. A finite observation time cannot establish removal efficiency.
- I(t)=Qin integral_0^t [1−F_T(a)] da; I_inf=Qin E[T]. With inherited Qin=A alpha K_up, **I_inf=A alpha L Fvlocal(root)**, finite despite arbitrarily long individual travel times. Alpha is unknown; JSON gives per-unit-alpha inventory coefficients, not an actual holdup or mass.
- An imposed step requires maintained resupply. In this noninteracting surrogate the steady size-resolved concentration is Qin pVup/[A(U−vt)]=alpha pVlocal below the root; startup fills it progressively. If real resupply, finite inventory, interactions or holdup invalidate constant U and fixed inlet composition, these results no longer close the physical problem. No upstream source balance has been established. Fresh distributor drops are separate from the tagged terminal-origin cohort and cannot be silently included in its numerator.

Coalescence conserves NMP volume while changing the DSD and subsequent slip. It is not itself successful removal. No arbitrary coalescence-event or irreversible-return hazard is assigned. Successful removal would require demonstrated return/collection and no subsequent escape, with a population/volume balance.

## Verification and decision

Numerics: standardized log-diameter Simpson quadrature, 2048/4096/8192 panel refinement; lower support −16 extended to −18; normal small-tail reference; inherited K and flux percentiles reproduced; time-CDF complements and monotonicity; direct canceled-mean quadrature versus analytical mean; linear length scaling; direct long-tail integral versus t^-2 asymptote. Maximum coarse/refined K relative error ${fmt(Math.max(...rows.map(r => r.checks.K_coarse_refined_relative_error)))}. All assertions PASS. JSON retains residuals, assumptions and inherited caveats.

${protectedPaths.length} old deliverable files were SHA-256 hashed and verified unchanged; full old-file hashes and four direct source hashes are in JSON. Run \`node deliverables/kuhni-outlet-transmission.mjs\` offline from repository root to reproduce only the new JSON/Markdown.

**Actual fraction remains unidentifiable from these inputs.** Need actual terminal-plane incoming one-way size/volume flux and spatial velocities (including stator openings and turbulent recrossings), a clear tagged-volume denominator distinguishing repeated crossings, representative properties/mobility and fine-mode bounds, distributor source/evolution, downstream velocity/dispersion and outlet interception, coalescence/breakup with conserved NMP tracking, qualified return/deposition/collection and re-entrainment behavior, startup/steady inventory and resupply balance, and an agreed carryover specification. Measurements or a validated coupled transport/population model must close these terms.

Retain Ø700 ×1600 as the unchanged preliminary reservation. This work neither certifies bare gravity separation, rejects that shell, selects enlargement nor qualifies a coalescer/guard package. **PASS conditional mathematics / HOLD actual outlet fraction, capture and hydraulic/fabrication release.**
`;
fs.writeFileSync(`${stem}.json`, JSON.stringify(result, null, 2) + '\n');
fs.writeFileSync(`${stem}.md`, report);
for (const path of protectedPaths) assert.equal(hash(path), oldHashes[path]);
console.log(JSON.stringify({ status: result.status, primary: rows.filter(r => r.L_m === 0.9),
  old_files_verified: protectedPaths.length }, null, 2));