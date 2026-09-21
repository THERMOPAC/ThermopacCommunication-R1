// Offline diagnostic only. Run from repository root; no application imports.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const stem = 'deliverables/kuhni-terminal-chain';
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : e.isFile() ? [`${d}/${e.name}`] : []);
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const protectedPaths = walk('deliverables').filter(p => !p.startsWith(stem + '.'));
const before = Object.fromEntries(protectedPaths.map(p => [p, hash(p)]));
const prior = JSON.parse(fs.readFileSync('deliverables/kuhni-upward-transport-dsd.json'));
const frozen = JSON.parse(fs.readFileSync('deliverables/kuhni-end-section-preliminary-calculation.input.json'));
const p = prior.basis, areaFraction = 0.4, A = Math.PI * 0.7 ** 2 / 4;
assert.equal(frozen.selected.trial.freeArea, areaFraction);
assert.equal(p.d32_mm, 6.068);
const U = p.Qc_m3_h / 3600 / A, Uj = U / areaFraction;
const phi = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
const near = (a, b, rel = 3e-8) => assert(Math.abs(a - b) <= 1e-28 + rel * Math.abs(b), `${a} != ${b}`);
function integral(f, a, b, n = 4096) {
  if (b <= a) return 0;
  const h = (b - a) / n;
  let sum = f(a) + f(b), correction = 0;
  for (let i = 1; i < n; i++) {
    const y = (i % 2 ? 4 : 2) * f(a + h * i) - correction;
    const t = sum + y; correction = (t - sum) - y; sum = t;
  }
  return sum * h / 3;
}
function root(f, a, b) {
  assert(f(a) <= 0 && f(b) >= 0);
  for (let i = 0; i < 65; i++) {
    const m = (a + b) / 2;
    if (f(m) > 0) b = m; else a = m;
  }
  return (a + b) / 2;
}
function vt(dmm) {
  const d = dmm / 1000;
  const vs = (p.rhoD_kg_m3 - p.rhoC_kg_m3) * p.g_m_s2 * d * d / (18 * p.muC_Pa_s);
  return root(v => v * (1 + 0.15 * (p.rhoC_kg_m3 * v * d / p.muC_Pa_s) ** 0.687) - vs, 0, vs * 1.001);
}
const bulkRoot = root(d => vt(d) - U, 1e-6, 20);
const jetRoot = root(d => vt(d) - Uj, 1e-6, 20);
near(bulkRoot, prior.rows[0].zero_net_mm, 1e-12);
near(A * areaFraction * Uj * 3600, p.Qc_m3_h, 1e-12);
near(vt(jetRoot), Uj, 1e-12);
const rows = [0.35, 0.44, 0.7, 1].map(s => {
  const muN = Math.log(p.d32_mm) - 2.5 * s * s;
  const muV = muN + 3 * s * s, d = z => Math.exp(muV + s * z);
  const z = diameter => (Math.log(diameter) - muV) / s;
  const zj = z(jetRoot), zb = z(bulkRoot);
  const f = x => phi(x) * Math.max(1 - vt(d(x)) / Uj, 0);
  const total = integral(f, -16, zj), fine = integral(f, -16, zj, 8192);
  const coarse = integral(f, -16, zj, 2048);
  near(total, fine); near(coarse, fine); near(integral(f, -18, zj), total);
  const cI = integral(f, -16, zb) / total, cII = integral(f, zb, zj) / total;
  near(cI + cII, 1); near(integral(x => f(x) / total, -16, zj), 1);
  near(integral(phi, -16, 16), 1);
  near(1 / integral(x => phi(x) / d(x), -16, 16), p.d32_mm);
  const Kopening = Uj * total, Kj = areaFraction * Kopening;
  const Q = A * Kj * 3600;
  near(Q / p.Qc_m3_h, total);
  const cdf = cutoff => cutoff <= 0 ? 0 : cutoff >= jetRoot ? 1 : integral(f, -16, z(cutoff)) / total;
  const tails = [0.5, 1, 1.455, bulkRoot, 2.081, jetRoot].map(c => {
    const value = cdf(c), complement = c >= jetRoot ? 0 : integral(f, z(c), zj) / total;
    near(value + complement, 1);
    near(c >= jetRoot ? 1 : integral(f, -16, z(c), 8192) / fine, value);
    return { cutoff_mm: c, gross_upcrossing_volume_CDF: value, survival_above_cutoff: complement,
      local_volume_CDF: integral(phi, -16, z(c)) };
  });
  let last = 0;
  for (let i = 0; i <= 100; i++) {
    const x = -16 + (zj + 16) * i / 100, value = integral(f, -16, x) / total;
    assert(Number.isFinite(value) && value >= last - 1e-12 && value <= 1 + 1e-12);
    assert(f(x) >= 0); last = value;
  }
  assert.equal(cdf(jetRoot * 2), 1);
  assert.equal(f(zj + 0.1), 0);
  const percentiles = [0.1, 0.5, 0.9].map(probability => {
    const x = root(x => integral(f, -16, x) / total - probability, -16, zj);
    near(integral(f, -16, x, 8192) / fine, probability);
    return { probability, diameter_mm: d(x) };
  });
  const d32 = total / integral(x => f(x) / d(x), -16, zj);
  near(d32, fine / integral(x => f(x) / d(x), -16, zj, 8192));
  const old = prior.rows.find(r => r.s === s && r.model === 'SN' && r.diameter_mm === 700);
  const fb = x => phi(x) * Math.max(1 - vt(d(x)) / U, 0);
  near(integral(fb, -16, zb), old.K_up_over_U);
  const optimisticOut = Q * cI, optimisticReturn = Q * cII;
  near(optimisticOut + optimisticReturn, Q);
  return { s, muN, muV, K_opening_m_s: Kopening, Kj_full_area_m_s: Kj, Kj_over_U: total,
    gross_Q_m3_h_per_unit_alpha: Q, gross_crossing_volume_fractions: { I: cI, II: cII, III: 0 },
    tails, volume_flux_percentiles: percentiles, d32_gross_flux_mm: d32,
    earlier_full_bore: { K_m_s: old.K_up_m_s, K_over_U: old.K_up_over_U,
      gross_jet_to_full_bore_coefficient_ratio: Kj / old.K_up_m_s },
    illustrative_eventual_scenarios: {
      classII_all_return_classI_all_outlet: { outlet_fraction: cI, return_fraction: cII,
        outlet_m3_h_per_unit_alpha: optimisticOut, return_m3_h_per_unit_alpha: optimisticReturn },
      no_return_all_outlet: { outlet_fraction: 1, return_fraction: 0, outlet_m3_h_per_unit_alpha: Q },
      qualification: 'Conditional zero-final-inventory illustrations, not predictions or paired rigorous bounds. No-return/all-outlet needs a transport mechanism for class II, not uniform bulk flow.' },
    checks: { coarse_refined_relative_error: Math.abs(coarse / fine - 1),
      main_refined_relative_error: Math.abs(total / fine - 1), support_CDF_flux_balance_units_refinement: 'PASS' } };
});
const ledger = {
  status: 'Conserving architecture ready for closures; not a calibrated solver',
  rate_units: 'm3/s of tagged dispersed NMP at fixed reference density; I is m3, dI/dt is m3/s',
  opening: 'Qgross = A*alpha*Kj = Qfirst + Qreup; gross crossing events need not be unique supplied volume',
  jet_zone: 'dIjet/dt = Qgross - Rjet - Tjq + Tqj',
  quiet_and_withdrawal_zone: 'dIquiet/dt = Tjq - Tqj - Rquiet - Qout',
  total: 'd(Ijet+Iquiet)/dt = Qfirst + Qreup - Rjet - Rquiet - Qout',
  definitions: 'Rjet and Rquiet are actual downward fluxes across the external lower return boundary, distinguished by route; Tjq/Tqj are internal jet/quiet exchanges, which cancel. Return-path inventory is included in its originating zone until boundary crossing. Qout is actual raffinate interception, not arrival at a whole-plane proxy.',
  unique_pulse_absorbing_return: 'V0 = Vreturned_jet(t)+Vreturned_quiet(t)+Vout(t)+Ijet(t)+Iquiet(t), initially zero downstream inventory; stop each tag at its first external exit. For re-entry track the same tag, not a new cohort.',
  optional_conditional: 'For noninteracting unchanged-diameter tags, rI,rII are probabilities of irreversible jet return. Given no jet return, qk,ok,ik are quiet-return, outlet and residual-inventory fractions with qk+ok+ik=1. Rjet/V0=sum wk*rk; Rquiet/V0=sum wk*(1-rk)*qk; Vout/V0=sum wk*(1-rk)*ok; I/V0=sum wk*(1-rk)*ik. No probabilities or rates assigned.',
  survival: 'Sk(t)=1-FjetReturn,k(t)-FquietReturn,k(t)-Fout,k(t) for mutually exclusive absorbing first exits. Survival includes trapped and transiting volume, not removal.',
  transformations: 'Coalescence/breakup require volume-conserving size-transition operators and tagged-volume mixing, not disappearance sinks. Initial class labels track origin, not current size.',
  separate_sources: 'Fresh distributor NMP has a separate ledger/source Ffresh and its own DSD; do not use the fresh feed rate as Qfirst, Qgross or alpha. Dissolved NMP requires separate species/phase-transfer balances.',
  turbulence: 'Actual gross flux is integral over opening area of E[alpha(d,x,t)*max(uz-vt,0)] dd dA, with matching downward crossings. Mean positive-part replacement omits velocity/concentration correlations and recrossings; do not add an invented turbulence factor.'
};
for (const path of protectedPaths) assert.equal(hash(path), before[path], `Old deliverable changed: ${path}`);
const result = {
  status: 'PASS conditional numerical mathematics; HOLD actual terminal DSD, transmission and equipment performance',
  basis: p, top_reservation_mm: [700, 1600], open_area_fraction: areaFraction, A_m2: A,
  U_m_s: U, Uj_m_s: Uj, bulk_root_mm: bulkRoot, jet_root_mm: jetRoot,
  jet_root_Re: p.rhoC_kg_m3 * Uj * jetRoot / 1000 / p.muC_Pa_s,
  model: { Jj: 'A*0.4*alpha*pVlocal(d)*max(Uj-vt(d),0) [m3/s/mm]',
    Kj: '0.4*integral pVlocal(d)*max(Uj-vt,0) dd [m/s], full-area referenced',
    Kopening: 'Kj/0.4 [m/s], opening-area referenced',
    pVj: 'pVlocal*max(Uj-vt,0)/Kopening [1/mm]',
    alpha: 'Unknown local opening holdup, uniformly assumed with local DSD across openings. Not actual terminal DSD or selected-trial holdup.',
    support: '(0,infinity) local lognormal; gross mean-jet flux only below exact jet root. Numerical z>=-16, extended to -18 checked.',
    omitted_Kj_over_U_bound: phi(16) / 16,
    classification: 'I: vt<U persistent bulk-upflow eligible; II: U<=vt<Uj locally lifted, bulk-settling eligible, NOT automatically returned; III: vt>=Uj not lifted by mean jet. Boundaries have zero measure.',
    drag: 'Inherited SN isolated spherical immobile-interface model; not validated for actual interacting terminal flow.',
    undefined: 'At alpha=0 no physical crossing cohort exists. Normalized mathematical kernel requires Kj>0.' },
  rows, ledger, sourceSha256: Object.fromEntries([
    'deliverables/kuhni-upward-transport-dsd.mjs', 'deliverables/kuhni-upward-transport-dsd.json',
    'deliverables/kuhni-outlet-transmission.md', 'deliverables/kuhni-end-section-preliminary-calculation.input.json'
  ].map(path => [path, hash(path)])),
  checks: { protected_files_unchanged: protectedPaths.length, protected_sha256: before,
    status: 'PASS', no_app_DB_network_or_workflow_access: true }
};
fs.writeFileSync(`${stem}.json`, JSON.stringify(result, null, 2) + '\n');
const fmt = v => Number(v).toPrecision(9);
const table = (headers, data) => ['| ' + headers.join(' | ') + ' |', '|' + headers.map(() => '---:').join('|') + '|',
  ...data.map(r => '| ' + r.join(' | ') + ' |')].join('\n');
fs.writeFileSync(`${stem}.md`, `# Terminal stator → jet/return → quiet disengagement → raffinate

**FIRST conditional calculation, not a simple gravity settler or calibrated pipeline solver. PASS mathematics / HOLD actual performance.** Ø700 ×1600 top reservation, application, DB, saved records and all old deliverables remain unchanged. No equipment or coalescer is selected.

## Frozen basis and assumptions

Inherited Qc=${p.Qc_m3_h} m³/h, d32=6.068 mm; RRBO 869 kg/m³, 0.0598 Pa·s; NMP 1015 kg/m³, 0.001416 Pa·s; sigma=0.011 N/m; g=9.80665 m/s². Active Ø700 ×4200, 20 ×210 compartments, Ø231 rotor, 30 rpm, Np=1.2 and existing bottom reservation are not changed or requalified.

Top-local datum is the terminal/active-top boundary, with exact stator face needing mechanical confirmation: calming z=0–200 mm, distributor 200–300, quiet 300–900, outlet opening 900–970, CL935. The shell height 1600 mm is not a settling travel length. No jet-decay length, hole diameter, aperture count or residence time is deduced from open area.

Assumed uniform opening-local alpha and DSD, not actual terminal DSD: number ln(d/mm)~N(muN,s²), muN=ln(6.068)−2.5s²; volume muV=ln(6.068)+0.5s². Widths .35/.44 are conditional donor transfers, not measured target widths; .7/1 are broad analyst stresses. The inherited compartment mean is not a measured opening-local mean; unresolved fine modes remain unknown. No selected-trial holdup is transferred.

## First calculation and units

A=${fmt(A)} m²; open fraction=0.4; U=${fmt(U * 1000)} mm/s; nominal dilute Uj=U/0.4=${fmt(Uj * 1000)} mm/s. This is a carrier-only mean scale, not a two-phase velocity field.

pVlocal=phi((ln(d/mm)−muV)/s)/(s*d_mm) [1/mm].
Jj(d)=A*0.4*alpha*pVlocal*max(Uj−vt,0) [m³/s/mm].
**Kj=0.4 integral pVlocal*max(Uj−vt,0) dd [m/s]** is full-area referenced; Kopening=Kj/0.4 is opening-area referenced. Qgross=A*alpha*Kj; pVj=pVlocal*max(Uj−vt,0)/Kopening. d32j=1/integral(pVj/d)dd. Weighting is gross upcrossing **volume**, not number or local inventory.

Exact inherited SN bulk root=${fmt(bulkRoot)} mm; calculated mean-jet root=${fmt(jetRoot)} mm, Re=${fmt(result.jet_root_Re)}. SN is an inherited isolated spherical immobile-interface assumption, not terminal-flow validation.

- I: vt<U, d<bulk root: eligible for persistent mean bulk upflow, not guaranteed outlet.
- II: U≤vt<Uj: opening-lifted but bulk-settling eligible; not automatically returned.
- III: vt≥Uj: zero mean-jet upcrossing weight, not proof that actual turbulence cannot lift it.

${table(['s', 'Kj m/s', 'Kj/U', 'Qgross m³/h per alpha', 'I volume %', 'II volume %', 'd32j mm', 'dV10/50/90 mm'],
  rows.map(r => [r.s, fmt(r.Kj_full_area_m_s), fmt(r.Kj_over_U), fmt(r.gross_Q_m3_h_per_unit_alpha),
    fmt(100 * r.gross_crossing_volume_fractions.I), fmt(100 * r.gross_crossing_volume_fractions.II), fmt(r.d32_gross_flux_mm),
    r.volume_flux_percentiles.map(x => fmt(x.diameter_mm)).join('/')]))}

Per-alpha coefficients are not actual flow or ppm. Alpha is unknown; at alpha=0 no physical cohort exists.

### Gross upcrossing volume CDF (fractions)

${table(['s', 'cutoff mm', 'local volume CDF', 'gross jet CDF', 'gross jet survival'],
  rows.flatMap(r => r.tails.map(t => [r.s, fmt(t.cutoff_mm), fmt(t.local_volume_CDF), fmt(t.gross_upcrossing_volume_CDF), fmt(t.survival_above_cutoff)])))}

Rounded 1.455 mm is a reporting cutoff, not the exact class boundary. All CDFs at/above the jet root equal one.

## Comparison to earlier full-bore kernel — NOT matched-plane closure

${table(['s', 'earlier Kfull m/s', 'Kj/Kfull', 'earlier Kfull/U'],
  rows.map(r => [r.s, fmt(r.earlier_full_bore.K_m_s), fmt(r.earlier_full_bore.gross_jet_to_full_bore_coefficient_ratio), fmt(r.earlier_full_bore.K_over_U)]))}

Both calculations stipulate the same local DSD and alpha, but at different idealized planes with different speeds and areas. Their ratio is a conditional diagnostic, **not** an entrance-to-outlet transmission or a mass loss. The prior full-bore-selected cohort has no class II; it cannot simply be equated to the downstream product of this opening-selected cohort. Concentration redistribution, inventories, returns, supply and recrossings must close that connection.

## Deceleration is not a return mechanism

For an illustrative overdamped trajectory dz/dt=u(z)−vt, if u decreases monotonically from above vt to below vt, an equilibrium z* with u(z*)=vt has u'(z*)<0: below it motion is upward, above it downward. It is a **stable levitation/trapping point**, not a 1-D stall followed by permanent return. Reaching a low-velocity downward path requires cross-stream escape, recirculation or another justified mechanism. Inertia, turbulence and changing size may alter this, but none is closed here.

Nor may Uj be gradually reduced as a full-bore axial mean at fixed A and Qc: that violates continuity. Real jet deceleration involves spreading and entrainment with spatial return/compensating flow; cross-sectional carrier flux remains Qc under the nominal assumptions. Open fraction alone fixes neither spatial topology nor escape probability. No fabricated u(z), hole size or decay correlation is used.

## Cohort-conserving pipeline ledger

${Object.entries(ledger).map(([k, v]) => '- **' + k + ':** ' + v).join('\n')}

These are control-volume identities, not fitted rates. Internal jet/quiet exchange cancels exactly. If quiet-return droplets pass back through the jet control volume, represent that leg as Tqj and count external return once in Rjet, not again in Rquiet. Redefine route inventories consistently when changing boundaries. Sustained input with trapping can accumulate; do not silently impose steady state.

For independent tags the optional fractions sum to one algebraically because rk+(1−rk)(qk+ok+ik)=1. With coalescence, carry tagged NMP volume through size changes and mixed-source drops; origin labels must not be reassigned by current diameter. Coalescence itself conserves NMP volume and is not successful removal. Fresh distributor solvent, dissolved solvent and repeatedly crossing terminal-origin solvent have distinct source/accounting roles.

## Two explicit ideal scenarios, not calibrated bounds

${table(['s', 'II all return / I all outlet: outlet %', 'return %', 'outlet m³/h per alpha', 'no return / all outlet %', 'no-return outlet m³/h per alpha'],
  rows.map(r => [r.s, fmt(100 * r.gross_crossing_volume_fractions.I), fmt(100 * r.gross_crossing_volume_fractions.II),
    fmt(r.illustrative_eventual_scenarios.classII_all_return_classI_all_outlet.outlet_m3_h_per_unit_alpha), 100, fmt(r.gross_Q_m3_h_per_unit_alpha)]))}

The first is optimistic class-II removal with zero final inventory and class-I survival=1. It is not a rigorous lower outlet bound: class I can also return or coalesce into return-eligible sizes. The second is the trivial all-volume outlet ceiling for a unique, isolated, conserved cohort with no other source and zero final inventory; it is not attainable in unchanged-drop uniform bulk flow for class II without additional transport. Together these are **not a validated physical bracket**. At finite time neither scenario resolves accumulated volume, and a gross event denominator can count the same NMP repeatedly. No actual transmission, removal efficiency or absolute carryover is established.

## Closure requirements and checks

Needed: actual opening geometry and position; local alpha/DSD and joint size-resolved velocities; spatially continuous jet/return field and cross-stream exchange; terminal first-entry versus recrossing tagging; distributor source and evolution; volume-conserving coalescence/breakup; quiet-zone dispersion and inventory; actual lateral nozzle interception; irreversible return versus re-entrainment; representative interface properties and agreed carryover criterion. No new literature-access claim is made.

Numerical checks PASS: log-diameter Jacobian, local normalization and inverse-volume d32, nonnegative supported kernel, 101-point CDF monotonicity, CDF complements and refined values, flux percentiles/inverse moment refinement, exact root force balance, I+II=1, scenario volume balance, A*0.4*Uj=Qc, Qgross/(alpha*Qc)=Kj/U, previous full-bore coefficient reproduction. Simpson 2048/4096/8192 panels; maximum coarse/refined relative error=${fmt(Math.max(...rows.map(r => r.checks.coarse_refined_relative_error)))}. Lower support −16 extended to −18; omitted Kj/U≤${fmt(phi(16) / 16)}. These checks validate arithmetic, not physical closure.

${protectedPaths.length} pre-existing deliverables SHA-256 verified unchanged; hashes and residuals retained in JSON. Run \`node deliverables/kuhni-terminal-chain.mjs\` from repository root; Node built-ins only, writes only its new JSON/Markdown. No application, DB, network or workflow access. Architecture and conservation are ready for evidence-based closures; **not a calibrated solver, equipment selection or hydraulic/fabrication release**.
`);
console.log(JSON.stringify({ status: result.status, Uj_mm_s: Uj * 1000, jetRoot_mm: jetRoot,
  rows: rows.map(r => ({ s: r.s, Kj_m_s: r.Kj_full_area_m_s, fractions: r.gross_crossing_volume_fractions })),
  protected_files_unchanged: protectedPaths.length }, null, 2));