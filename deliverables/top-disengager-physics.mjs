// Offline only. Reproduce: node deliverables/top-disengager-physics.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const prefix = new URL('./top-disengager-physics.', import.meta.url);
const inputBytes = readFileSync(new URL('./kuhni-end-section-preliminary-calculation.input.json', import.meta.url));
const old = JSON.parse(inputBytes);
const p = { rhoC: 869, rhoD: 1015, muC: 0.0598, muD: 0.001416, sigma: 0.011, g: 9.80665, Qm3h: 3.82179423, f: 0.5 };
assert.equal(old.stage1.rrboDensityKgM3, p.rhoC);
assert.equal(old.stage1.nmpDensityKgM3, p.rhoD);
assert.equal(old.stage1.rrboDynamicViscosityCp / 1000, p.muC);
assert.equal(old.stage1.nmpDynamicViscosityCp / 1000, p.muD);
const lambda = p.muD / p.muC;
function root(fn, lo, hi) {
  assert(fn(lo) <= 0 && fn(hi) >= 0, 'Root not bracketed');
  for (let i = 0; i < 120; i++) {
    const m = (lo + hi) / 2;
    if (fn(m) > 0) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
}
function velocity(d, props = p, clean = false) {
  const k = props.muD / props.muC;
  const factor = clean ? (2 + 3 * k) / (3 * (1 + k)) : 1;
  const stokes = (props.rhoD - props.rhoC) * props.g * d * d / (18 * props.muC);
  const v = root(v => factor * v * (1 + 0.15 * (props.rhoC * v * d / props.muC) ** 0.687) - stokes, 0, stokes / factor * 1.01);
  const Re = props.rhoC * v * d / props.muC;
  return { v, Re, CD: factor * 24 / Re * (1 + 0.15 * Re ** 0.687), stokes,
    HR: stokes * 3 * (1 + k) / (2 + 3 * k),
    Eo: (props.rhoD - props.rhoC) * props.g * d * d / props.sigma,
    We: props.rhoC * v * v * d / props.sigma,
    Ca: props.muC * v / props.sigma };
}
const requiredID = (v, Q = p.Qm3h, f = p.f) => Math.sqrt(4 * Q / 3600 / (Math.PI * f * v));
const U700 = p.Qm3h / 3600 / (Math.PI * 0.7 ** 2 / 4);
const rows = [100, 250, 500, 1000, 1500, 2000, 2500, 3000, 6068].map(um => {
  const sn = velocity(um * 1e-6);
  const cleanExtrapolation = velocity(um * 1e-6, p, true);
  assert(Math.abs(sn.CD * p.rhoC * sn.v ** 2 / 2 - 2 / 3 * um * 1e-6 * (p.rhoD - p.rhoC) * p.g) < 1e-10);
  return { diameterUm: um, sn, cleanExtrapolation, requiredIDm: requiredID(sn.v), cleanExtrapolationIDm: requiredID(cleanExtrapolation.v), netDownward700MS: sn.v - U700, pass700AssumedScreen: U700 <= p.f * sn.v };
});
const dutyUm = 500;
const scenarios = [
  { name: 'nominal', props: p, Q: p.Qm3h, multiplier: 1 },
  { name: 'viscosity_plus25pct', props: { ...p, muC: p.muC * 1.25 }, Q: p.Qm3h, multiplier: 1 },
  { name: 'density_difference_minus20pct', props: { ...p, rhoD: p.rhoC + (p.rhoD - p.rhoC) * 0.8 }, Q: p.Qm3h, multiplier: 1 },
  { name: 'throughput_plus10pct', props: p, Q: p.Qm3h * 1.1, multiplier: 1 },
  { name: 'unqualified_velocity_derating20pct', props: p, Q: p.Qm3h, multiplier: 0.8 },
  { name: 'combined_engineering_stress_not_confidence_bound', props: { ...p, muC: p.muC * 1.25, rhoD: p.rhoC + (p.rhoD - p.rhoC) * 0.8 }, Q: p.Qm3h * 1.1, multiplier: 0.8 },
].map(s => {
  const v = velocity(dutyUm * 1e-6, s.props).v * s.multiplier;
  return { ...s, vMS: v, requiredIDm: requiredID(v, s.Q) };
});
const cutoffs = [0.7, 0.9, 1.2, 1.5, 2, 3, 4].map(IDm => {
  const U = p.Qm3h / 3600 / (Math.PI * IDm ** 2 / 4);
  const d = root(d => velocity(d).v - U / p.f, 1e-7, 0.02);
  return { IDm, Ums: U, cutoffUm: d * 1e6, ...velocity(d) };
});
const result = {
  status: 'ENGINEER_SELECTED_CONDITIONAL_SCREEN_NOT_RELEASE_OR_CARRYOVER_GUARANTEE',
  frozen: { activeIDmm: 700, activeHeightMm: 4200, compartments: 20, compartmentHeightMm: 210, rotorDiameterMm: 231, rpm: 30, Np: 1.2, bottomIDmm: 900, bottomHeightMm: 1200 },
  inputSha256: createHash('sha256').update(inputBytes).digest('hex'), properties: p, lambda,
  Morton: p.g * p.muC ** 4 * (p.rhoD - p.rhoC) / (p.rhoC ** 2 * p.sigma ** 3),
  U700MS: U700, requiredV700MS: U700 / p.f, rows, dutyUm, scenarios, cutoffs,
  zeroNet700Um: root(d => velocity(d).v - U700, 1e-7, 0.02) * 1e6,
  integratedReturnPath: {
    status: 'NO_INTEGRATED_HYDRAULIC_PASS_WITHOUT_QUALIFIED_RETURN_PATH',
    topology: 'RRBO upward through 700-mm throat and expanding cone into enlarged top; captured NMP must return downward or use a protected bypass',
    assumptions: 'Uniform axial continuous flow, constant Q, dilute constant-size drops, no coalescence; local cone flow may differ',
    assignedDutyUm: dutyUm,
    zeroNetLocalIDm: requiredID(velocity(dutyUm * 1e-6).v, p.Qm3h, 1),
    downwardNetAt3000MS: velocity(dutyUm * 1e-6).v - p.Qm3h / 3600 / (Math.PI * 3 ** 2 / 4),
    downwardNetAt700MS: velocity(dutyUm * 1e-6).v - U700,
    dutyComparisons: [500, 1000, 2000].map(um => {
      const v = velocity(um * 1e-6).v;
      return { assignedDutyUm: um, nominalAreaIDmAtHalfV: requiredID(v),
        zeroNetLocalIDm: requiredID(v, p.Qm3h, 1), downwardNetAt700MS: v - U700,
        interpretation: 'Assigned separation duty only; not an evidenced tail percentile or carryover guarantee' };
    }),
    bypassQualification: [
      'Defined collection topology and protected submerged NMP drain/downcomer discharge',
      'Hydrostatic driving head against opposing pressure and all return-line losses',
      'Measured dispersed load, collection holdup and coalescence capacity',
      'No RRBO short-circuiting, backflow, plugging or uncontrolled interface inventory',
      'Pilot/vendor hydraulic verification including transients and local entrainment',
    ],
  },
};
writeFileSync(new URL(`${prefix.href}results.json`), JSON.stringify(result, null, 2) + '\n');
const table = ['| Drop µm | SN vt mm/s | Re | Eo | We | HR mm/s* | Clean finite-Re mm/s* | SN ID mm | Clean ID mm* |',
  '|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...rows.map(r => `| ${r.diameterUm} | ${(r.sn.v * 1000).toFixed(6)} | ${r.sn.Re.toPrecision(5)} | ${r.sn.Eo.toPrecision(5)} | ${r.sn.We.toPrecision(5)} | ${(r.sn.HR * 1000).toFixed(6)} | ${(r.cleanExtrapolation.v * 1000).toFixed(6)} | ${(r.requiredIDm * 1000).toFixed(1)} | ${(r.cleanExtrapolationIDm * 1000).toFixed(1)} |`),
  '\n*HR requires creeping spherical clean conditions; Myint clean finite-Re results extrapolate below tested viscosity ratio. Neither column is a guaranteed bound. Large-drop spherical results are diagnostics only.\n',
  '| 500 µm scenario (assumed, not statistical) | Required ID mm |',
  '|---|---:|', ...scenarios.map(s => `| ${s.name} | ${(s.requiredIDm * 1000).toFixed(1)} |`),
  '\n| ID mm | SN conditional cutoff µm |',
  '|---:|---:|', ...cutoffs.map(c => `| ${(c.IDm * 1000).toFixed(0)} | ${c.cutoffUm.toFixed(3)} |`)];
writeFileSync(new URL(`${prefix.href}tables.md`), '# Offline top calculation tables\n\n' + table.join('\n') + '\n');
console.log(JSON.stringify({ U700, duty: rows[2], scenarios, cutoffs, zeroNet700Um: result.zeroNet700Um }, null, 2));