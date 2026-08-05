// ═══════════════════════════════════════════════════════════════════════════════
// Stage C3 — LLX Common Hydraulic Screening Engine validation suite
// Run: npx tsx server/engine-framework/tests/c3-hydraulics.ts
//
// Covers the correction-13 test list: both phase configurations; maximum
// solvent flow changing u_d in one configuration and u_c in the other;
// missing IFT allowing partial calculation; entered u_K with measured n;
// assumed n = 1 causing Pending Validation; terminal velocity reused as u_K
// causing Pending Validation; root ambiguity near the hydraulic limit;
// no-root infeasibility; configurable holdup bounds; configurable loading
// band; separate normal/maximum optima; diameter classification (no
// recommendation); concurrent property-context isolation — plus analytic
// benchmarks (area, φ* = 1/3 and u_d* = 4·u_K/27 at R = 1 n = 1, slip-balance
// residual at the operating root, Stokes terminal velocity).
// ═══════════════════════════════════════════════════════════════════════════════

import { LLXHydraulicsEngine } from '../../engines/llx/llx-hydraulics-engine';
import { getProperty } from '../epd/database';
import type { CalculationContext } from '../types';

let pass = 0, fail = 0;

function checkTrue(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function check(name: string, actual: number | null | undefined, expected: number, relTol = 1e-9) {
  const ok = actual !== null && actual !== undefined && Number.isFinite(actual)
    && Math.abs(actual - expected) <= relTol * Math.max(Math.abs(expected), 1e-12);
  if (ok) { pass++; console.log(`  ✅ ${name}: ${actual}`); }
  else { fail++; console.error(`  ❌ ${name}: got ${actual}, expected ${expected}`); }
}

const engine = new LLXHydraulicsEngine();
const ctx: CalculationContext = { revisionId: 999002, designId: 1, moduleType: 'llx', userId: 1 };

const tag = (value: number, sourceType = 'Measured', sourceReference = 'Thermopac hydraulic test HT-2026-003') =>
  ({ value, sourceType, sourceReference });

const T = 60;
const rhoNMP60 = getProperty('nmp', 'density', T).value;

/** Base inputs on the Stage C2 approved flows. */
function baseInputs(): Record<string, unknown> {
  return {
    operatingTemperature: T,
    feedFlow: { value: 5000, basis: 'mass' },
    feedDensity: { value: 895, referenceTemperatureC: T, sourceType: 'Measured', sourceReference: 'Thermopac lab density LR-2026-011' },
    feedViscosity: { value: 0.012, referenceTemperatureC: T, sourceType: 'Measured', sourceReference: 'Thermopac lab viscosity LR-2026-012' },
    solventToOilRatio: 1.5,
    maxCirculationFactor: 1.2,
    phaseConfiguration: 'nmp_continuous_rrbo_dispersed',
    interfacialTension: { value: 0.012, referenceTemperatureC: T, sourceType: 'Vendor', sourceReference: 'Vendor datasheet IFT-NMP-RRBO-01' },
    sauterMeanDiameter: tag(0.0015),
    characteristicVelocity: tag(0.03),
    hindranceExponent: tag(1.4, 'Vendor', 'Vendor hydraulic test report VH-77'),
    diameterSweep: { min: 0.6, max: 1.6, step: 0.2 },
  };
}

async function main() {
  const qRRBO = 5000 / 895 / 3600;   // m³/s
  const qNMPn = 7500 / rhoNMP60 / 3600;
  const qNMPm = 9000 / rhoNMP60 / 3600;

  // ── 1. Base run, phase mapping, geometry, terminology ──
  console.log('── Base run (NMP continuous / RRBO dispersed) ──');
  {
    const res = await engine.calculate(baseInputs(), ctx);
    checkTrue('status not error', res.status !== 'error');
    const d = res.data as any;
    checkTrue('applicability statement present', d.applicabilityStatement === 'PRELIMINARY GENERIC HYDRAULIC SCREENING — NOT ECP OR ECR RATING');
    checkTrue('limitations list ≥ 8 entries', Array.isArray(d.limitations) && d.limitations.length >= 8);
    checkTrue('no forbidden terminology', !JSON.stringify(d).match(/flooding percentage|ECP Flooding|ECR Flooding|Recommended Vendor/i));
    check('versions recorded', d.celVersion === '1.0.0' && d.epdVersion === '1.0.0' ? 1 : 0, 1);

    const row = d.normalCase.diameters[2]; // D = 1.0 m — inside the feasible range
    const A = Math.PI * 1.0 * 1.0 / 4;
    check('area πD²/4 at D=1.0', row.area_m2, A);
    check('RRBO superficial velocity', row.rrboSuperficialVelocity_m_s, qRRBO / A);
    check('NMP superficial velocity', row.nmpSuperficialVelocity_m_s, qNMPn / A);
    checkTrue('u_c = NMP, u_d = RRBO (nmp_continuous_rrbo_dispersed)',
      row.continuousSuperficialVelocity_m_s === row.nmpSuperficialVelocity_m_s
      && row.dispersedSuperficialVelocity_m_s === row.rrboSuperficialVelocity_m_s);
    checkTrue('flow-ratio definition + phase names stored',
      row.flowRatio.definition.includes('u_c / u_d') && row.flowRatio.continuousPhase === 'NMP' && row.flowRatio.dispersedPhase === 'RRBO');
    checkTrue('holdup bounds stored in snapshot', d.designBasis.holdupBounds.min === 0.005 && d.designBasis.holdupBounds.max === 0.6);
    checkTrue('entered density+viscosity persisted', d.designBasis.feedFluid.enteredDensity.sourceReference.includes('LR-2026-011') && d.designBasis.feedFluid.enteredViscosity.value === 0.012);

    // Slip-balance residual at the reported operating root (analytic identity)
    const op = row.holdup.operatingHoldup;
    checkTrue('operating holdup established', typeof op === 'number' && op > 0);
    if (typeof op === 'number') {
      const uD = row.dispersedSuperficialVelocity_m_s, uC = row.continuousSuperficialVelocity_m_s;
      const resid = uD / op + uC / (1 - op) - 0.03 * Math.pow(1 - op, 1.4);
      checkTrue('slip-balance residual ≈ 0 at operating root', Math.abs(resid) < 1e-8, `resid=${resid}`);
    }
    checkTrue('interfacial area from operating holdup only', row.interfacialArea.classification !== 'Not Calculable'
      && Math.abs(row.interfacialArea.value_m2_m3 - 6 * row.holdup.operatingHoldup / 0.0015) < 1e-9);
    checkTrue('shape-regime indicators calculated with IFT', d.shapeRegimeIndicators.classification === 'Calculated Screening Result'
      && d.shapeRegimeIndicators.eotvos > 0 && d.shapeRegimeIndicators.morton > 0);
    checkTrue('terminal velocity is rigid-sphere screening', JSON.stringify(res.warnings).includes('RIGID_SPHERE_SCREENING'));
    checkTrue('no diameter recommendation key', !('recommendedDiameter' in d.normalCase.summary)
      && d.normalCase.summary.selectedTrialDiameter_m === null);
  }

  // ── 2. Phase-dependent velocity assignment + max case direction ──
  console.log('── Phase configurations & maximum-case velocity direction ──');
  {
    // NMP continuous: maximum solvent flow changes u_c, not u_d
    const res1 = await engine.calculate(baseInputs(), ctx);
    const d1 = (res1.data as any);
    const n1 = d1.normalCase.diameters[0], m1 = d1.maximumCase.diameters[0];
    checkTrue('nmp_continuous: max case changes u_c', m1.continuousSuperficialVelocity_m_s > n1.continuousSuperficialVelocity_m_s * 1.15);
    check('nmp_continuous: max case u_d unchanged', m1.dispersedSuperficialVelocity_m_s, n1.dispersedSuperficialVelocity_m_s);

    // RRBO continuous: maximum solvent flow changes u_d, not u_c
    const i2 = baseInputs();
    i2.phaseConfiguration = 'rrbo_continuous_nmp_dispersed';
    const res2 = await engine.calculate(i2, ctx);
    const d2 = (res2.data as any);
    const n2 = d2.normalCase.diameters[0], m2 = d2.maximumCase.diameters[0];
    checkTrue('rrbo_continuous: u_c = RRBO, u_d = NMP',
      n2.continuousSuperficialVelocity_m_s === n2.rrboSuperficialVelocity_m_s && n2.dispersedSuperficialVelocity_m_s === n2.nmpSuperficialVelocity_m_s);
    checkTrue('rrbo_continuous: max case changes u_d', m2.dispersedSuperficialVelocity_m_s > n2.dispersedSuperficialVelocity_m_s * 1.15);
    check('rrbo_continuous: max case u_c unchanged', m2.continuousSuperficialVelocity_m_s, n2.continuousSuperficialVelocity_m_s);
    check('max NMP superficial velocity ratio = 1.2', m2.nmpSuperficialVelocity_m_s / n2.nmpSuperficialVelocity_m_s, 1.2, 1e-9);
  }

  // ── 3. Missing IFT allows partial calculation ──
  console.log('── Missing interfacial tension — partial calculation ──');
  {
    const i = baseInputs();
    delete i.interfacialTension;
    const res = await engine.calculate(i, ctx);
    const d = res.data as any;
    checkTrue('run not blocked without IFT', res.status !== 'error');
    checkTrue('We/Eo/Mo Not Calculable without IFT', d.shapeRegimeIndicators.classification === 'Not Calculable');
    checkTrue('velocities still calculated', d.normalCase.diameters[0].rrboSuperficialVelocity_m_s > 0);
    checkTrue('density difference still calculated', d.designBasis.densityDifference_kg_m3 > 0);
    checkTrue('terminal velocity still calculated', d.terminalVelocityScreening.classification !== 'Not Calculable');
    checkTrue('holdup still calculated with independent u_K', typeof d.normalCase.diameters[2].holdup.operatingHoldup === 'number');
  }

  // ── 4. Slip-model governance ──
  console.log('── u_K / n governance ──');
  {
    // Entered u_K with measured/vendor n → no assumed-slip warnings
    const res = await engine.calculate(baseInputs(), ctx);
    checkTrue('entered u_K + vendor n: no ASSUMED_HINDRANCE_EXPONENT', !JSON.stringify(res.warnings).includes('ASSUMED_HINDRANCE_EXPONENT'));
    checkTrue('entered u_K + vendor n: no rigid-sphere u_K warning', !JSON.stringify(res.warnings).includes('CHARACTERISTIC_VELOCITY_FROM_RIGID_SPHERE_SCREENING'));

    // Assumed n = 1 → warning + Pending Validation
    const i2 = baseInputs();
    i2.hindranceExponent = tag(1, 'Assumed', 'No hindrance data — engineer assumption');
    const res2 = await engine.calculate(i2, ctx);
    const d2 = res2.data as any;
    checkTrue('assumed n=1 emits ASSUMED_HINDRANCE_EXPONENT', JSON.stringify(res2.warnings).includes('ASSUMED_HINDRANCE_EXPONENT'));
    checkTrue('assumed n=1 → pending_validation', d2.calculationRunStatus === 'pending_validation');
    checkTrue('assumed n=1 → holdup Pending Validation', d2.normalCase.diameters[2].holdup.classification === 'Pending Validation');
    checkTrue('assumed n stored in assumptions register', JSON.stringify(d2.assumptions).includes('Hindrance exponent'));

    // Missing n with u_K → rejected (n never defaulted)
    const i3 = baseInputs();
    delete i3.hindranceExponent;
    const v3 = engine.validate(i3);
    checkTrue('missing n rejected — never defaulted to 1', !v3.valid);
    const r3 = await engine.calculate(i3, ctx);
    checkTrue('missing n blocks via gate', r3.status === 'error' && (r3.data as any).calculationRunStatus === 'calculation_blocked');

    // Terminal velocity reused as u_K → explicit option, warning, pending
    const i4 = baseInputs();
    delete i4.characteristicVelocity;
    i4.useTerminalVelocityAsCharacteristic = true;
    const res4 = await engine.calculate(i4, ctx);
    const d4 = res4.data as any;
    checkTrue('u_t as u_K emits CHARACTERISTIC_VELOCITY_FROM_RIGID_SPHERE_SCREENING', JSON.stringify(res4.warnings).includes('CHARACTERISTIC_VELOCITY_FROM_RIGID_SPHERE_SCREENING'));
    checkTrue('u_t as u_K → pending_validation', d4.calculationRunStatus === 'pending_validation');
    checkTrue('u_t as u_K → throughput Pending Validation', d4.normalCase.diameters.some((r: any) => r.genericHydraulicThroughputMaximum?.classification === 'Pending Validation'));

    // No u_K basis at all → holdup Not Calculable, everything else proceeds
    const i5 = baseInputs();
    delete i5.characteristicVelocity;
    delete i5.hindranceExponent;
    const res5 = await engine.calculate(i5, ctx);
    const d5 = res5.data as any;
    checkTrue('no u_K basis: holdup Not Calculable', d5.normalCase.diameters[0].holdup.classification === 'Not Calculable');
    checkTrue('no u_K basis: velocities still calculated', d5.normalCase.diameters[0].nmpSuperficialVelocity_m_s > 0);
  }

  // ── 5. Analytic throughput benchmark at R = 1, n = 1 ──
  console.log('── Analytic benchmark: φ* = 1/3, u_d* = 4·u_K/27 at R = 1, n = 1 ──');
  {
    const i = baseInputs();
    // Volumetric feed 5 m³/h and NMP mass flow chosen so Q_NMP = Q_RRBO → R = 1 exactly
    i.feedFlow = { value: 5, basis: 'volumetric' };
    delete i.solventToOilRatio;
    i.solventFlow = 5 * rhoNMP60;
    i.maxCirculationFactor = 1.2;
    i.hindranceExponent = tag(1, 'Assumed', 'Analytic benchmark n = 1');
    i.holdupBounds = { min: 0.005, max: 0.6 };
    delete i.diameterSweep; i.diameterValues = [1.0];
    const res = await engine.calculate(i, ctx);
    const row = (res.data as any).normalCase.diameters[0];
    check('R = 1 exactly', row.flowRatio.value, 1, 1e-9);
    check('φ* = 1/3', row.genericHydraulicThroughputMaximum.optimumHoldup, 1 / 3, 1e-5);
    check('u_d* = 4·u_K/27', row.genericHydraulicThroughputMaximum.dispersedVelocityAtMaximum_m_s, 4 * 0.03 / 27, 1e-6);
  }

  // ── 6. Infeasibility & ambiguity near the hydraulic limit ──
  console.log('── No-root infeasibility & ambiguous branch ──');
  {
    // Tiny diameter → velocities far above the generic maximum → no root
    const i = baseInputs();
    delete i.diameterSweep; i.diameterValues = [0.1];
    const res = await engine.calculate(i, ctx);
    const row = (res.data as any).normalCase.diameters[0];
    checkTrue('no-root diameter → hydraulically_infeasible', row.genericHydraulicFeasibility === 'hydraulically_infeasible');
    checkTrue('no-root: holdup Not Calculable with reason', row.holdup.classification === 'Not Calculable');
    checkTrue('NO_HOLDUP_SOLUTION warning emitted', JSON.stringify(res.warnings).includes('NO_HOLDUP_SOLUTION'));

    // Near the limit with a wide isolation tolerance → AMBIGUOUS_HOLDUP_BRANCH
    let found = false;
    for (let D = 0.60; D <= 1.10 && !found; D += 0.01) {
      const j = baseInputs();
      delete j.diameterSweep; j.diameterValues = [Number(D.toFixed(4))];
      j.rootIsolationTolerance = 0.2;
      const r = await engine.calculate(j, ctx);
      const rw = (r.data as any).normalCase.diameters[0];
      if (rw.holdup.ambiguous) {
        found = true;
        checkTrue('AMBIGUOUS_HOLDUP_BRANCH warning emitted', JSON.stringify(r.warnings).includes('AMBIGUOUS_HOLDUP_BRANCH'));
        checkTrue('ambiguous → operating holdup Pending Validation', rw.holdup.classification === 'Pending Validation');
        checkTrue('ambiguous → all roots still returned', rw.holdup.allRoots.length > 1);
        checkTrue('ambiguous → interfacial area withheld', rw.interfacialArea.classification === 'Not Calculable');
      }
    }
    checkTrue('found an ambiguous near-limit diameter', found);
  }

  // ── 7. Configurable bounds & loading band ──
  console.log('── Configurable holdup bounds & screening band ──');
  {
    const i = baseInputs();
    i.holdupBounds = { min: 0.01, max: 0.4 };
    i.screeningBandPercent = { min: 30, max: 70 };
    const res = await engine.calculate(i, ctx);
    const d = res.data as any;
    checkTrue('custom holdup bounds stored', d.designBasis.holdupBounds.min === 0.01 && d.designBasis.holdupBounds.max === 0.4
      && d.normalCase.diameters[0].holdup.configuredBounds.max === 0.4);
    checkTrue('custom screening band stored + labelled configurable', d.normalCase.screeningBandPercent.min === 30
      && d.normalCase.screeningBandPercent.max === 70 && d.normalCase.screeningBandPercent.note.includes('not a universal'));
    // Same physics, different band ⇒ different classification of some diameter
    const res2 = await engine.calculate(baseInputs(), ctx);
    const cls1 = d.normalCase.diameters.map((r: any) => r.genericHydraulicFeasibility).join(',');
    const cls2 = (res2.data as any).normalCase.diameters.map((r: any) => r.genericHydraulicFeasibility).join(',');
    checkTrue('band change reclassifies diameters', cls1 !== cls2, `${cls1} vs ${cls2}`);

    // Bound above the moderate-holdup limit → applicability warning
    const i3 = baseInputs();
    i3.holdupBounds = { min: 0.005, max: 0.8 };
    const res3 = await engine.calculate(i3, ctx);
    checkTrue('bounds above 0.60 flagged outside applicability', JSON.stringify(res3.warnings).includes('HOLDUP_BOUND_ABOVE_MODERATE_LIMIT'));
  }

  // ── 8. Independent case optima & diameter classification ──
  console.log('── Independent normal/maximum optima & sweep classification ──');
  {
    const res = await engine.calculate(baseInputs(), ctx);
    const d = res.data as any;
    const n0 = d.normalCase.diameters[0], m0 = d.maximumCase.diameters[0];
    checkTrue('cases use different flow ratios', Math.abs(n0.flowRatio.value - m0.flowRatio.value) > 0.01);
    checkTrue('cases have different throughput optima', n0.genericHydraulicThroughputMaximum.optimumHoldup !== m0.genericHydraulicThroughputMaximum.optimumHoldup
      || n0.genericHydraulicThroughputMaximum.dispersedVelocityAtMaximum_m_s !== m0.genericHydraulicThroughputMaximum.dispersedVelocityAtMaximum_m_s);
    checkTrue('normal case reports both phase velocities per row', 'rrboSuperficialVelocity_m_s' in n0 && 'nmpSuperficialVelocity_m_s' in n0);
    const s = d.normalCase.summary;
    checkTrue('summary provides classification lists', Array.isArray(s.hydraulicallyInfeasibleDiameters_m)
      && Array.isArray(s.aboveScreeningBandDiameters_m) && Array.isArray(s.withinScreeningBandDiameters_m) && Array.isArray(s.belowMinimumLoadingBandDiameters_m));
    checkTrue('all sweep diameters classified', s.hydraulicallyInfeasibleDiameters_m.length + s.aboveScreeningBandDiameters_m.length
      + s.withinScreeningBandDiameters_m.length + s.belowMinimumLoadingBandDiameters_m.length === d.normalCase.diameters.length);

    // Engineer-selected trial diameter is echoed, never invented
    const i2 = baseInputs();
    i2.selectedTrialDiameter = 1.2;
    const res2 = await engine.calculate(i2, ctx);
    checkTrue('selected trial diameter echoed as engineer choice', (res2.data as any).normalCase.summary.selectedTrialDiameter_m === 1.2
      && (res2.data as any).normalCase.summary.selectedTrialDiameterNote.includes('Engineer-selected'));
  }

  // ── 9. Stokes-regime terminal-velocity benchmark ──
  console.log('── Stokes terminal-velocity benchmark ──');
  {
    const i = baseInputs();
    i.sauterMeanDiameter = tag(0.00005); // 50 µm → Re « 0.1
    delete i.characteristicVelocity; delete i.hindranceExponent; // avoid holdup noise
    const res = await engine.calculate(i, ctx);
    const tv = (res.data as any).terminalVelocityScreening;
    const muNMP = getProperty('nmp', 'dynamicViscosity', T).value;
    const dRho = Math.abs(895 - rhoNMP60);
    const stokes = 9.80665 * 0.00005 * 0.00005 * dRho / (18 * muNMP);
    checkTrue('Stokes regime detected', tv.regime === 'stokes');
    check('u_t matches closed-form Stokes', tv.velocity_m_s, stokes, 2e-2);
  }

  // ── 10. d32 band governance ──
  console.log('── d32 screening band ──');
  {
    const i = baseInputs();
    i.sauterMeanDiameter = tag(0.008);
    i.d32ScreeningBand = { min: 0.0005, max: 0.005 }; // no source → user-defined label
    const res = await engine.calculate(i, ctx);
    const d = res.data as any;
    checkTrue('unreferenced band labelled User-defined screening range', d.designBasis.d32ScreeningBand.label === 'User-defined screening range');
    checkTrue('d32 outside configured band warned', JSON.stringify(res.warnings).includes('D32_OUTSIDE_SCREENING_BAND'));
    const i2 = baseInputs();
    const res2 = await engine.calculate(i2, ctx);
    checkTrue('no band configured → no band warning, no invented citation', !JSON.stringify(res2.warnings).includes('D32_OUTSIDE_SCREENING_BAND')
      && (res2.data as any).designBasis.d32ScreeningBand === null);
  }

  // ── 11. Invalid inputs blocked end-to-end ──
  console.log('── Invalid inputs ──');
  {
    const cases: Array<[string, (i: Record<string, unknown>) => void]> = [
      ['missing feedViscosity', (i) => { delete i.feedViscosity; }],
      ['missing diameterSweep', (i) => { delete i.diameterSweep; }],
      ['inverted diameterSweep', (i) => { i.diameterSweep = { min: 2, max: 1, step: 0.1 }; }],
      ['u_K without source tag', (i) => { i.characteristicVelocity = { value: 0.03 }; }],
      ['invalid holdup bounds', (i) => { i.holdupBounds = { min: 0.5, max: 0.2 }; }],
      ['invalid screening band', (i) => { i.screeningBandPercent = { min: 90, max: 50 }; }],
      ['both u_K and useTerminalVelocityAsCharacteristic', (i) => { i.useTerminalVelocityAsCharacteristic = true; }],
      ['inconsistent solventFlow vs ratio', (i) => { i.solventFlow = 7600; }],
      ['negative IFT', (i) => { i.interfacialTension = { value: -0.01, referenceTemperatureC: T, sourceType: 'Vendor', sourceReference: 'x' }; }],
      ['n = 1 with Vendor tag (Assumed-only rule)', (i) => { i.hindranceExponent = tag(1, 'Vendor', 'VH-77'); }],
      ['n = 1 with Measured tag (Assumed-only rule)', (i) => { i.hindranceExponent = tag(1, 'Measured', 'LR-1'); }],
      ['degenerate sweep min = max (single diameter must use diameterValues)', (i) => { i.diameterSweep = { min: 1, max: 1, step: 0.2 }; }],
      ['both diameterSweep and diameterValues', (i) => { i.diameterValues = [1.0]; }],
      ['empty diameterValues', (i) => { delete i.diameterSweep; i.diameterValues = []; }],
      ['non-positive diameterValues entry', (i) => { delete i.diameterSweep; i.diameterValues = [1.0, -0.5]; }],
      ['sub-ULP diameter step', (i) => { i.diameterSweep = { min: 1, max: 2, step: 1e-18 }; }],
      ['oversized diameter sweep (> 200 points)', (i) => { i.diameterSweep = { min: 0.1, max: 5, step: 0.01 }; }],
    ];
    for (const [name, mutate] of cases) {
      const i = baseInputs();
      mutate(i);
      const res = await engine.calculate(i, ctx);
      checkTrue(`blocked: ${name}`, res.status === 'error' && (res.data as any).calculationRunStatus === 'calculation_blocked'
        && !JSON.stringify(res.data).includes('NaN'));
    }
  }

  // ── 11b. Validation warnings propagate into run warnings ──
  console.log('── Gate warning propagation ──');
  {
    const i = baseInputs();
    i.maxCirculationFactor = 2.0; // valid but outside typical 1.1–1.5 band
    const res = await engine.calculate(i, ctx);
    checkTrue('out-of-band maxCirculationFactor surfaces as run warning',
      res.status !== 'error' && JSON.stringify(res.warnings).includes('maxCirculationFactor'));
  }

  // ── 12. Concurrent property-context isolation ──
  console.log('── Concurrency isolation ──');
  {
    const a = baseInputs();
    (a.feedDensity as any) = { value: 880, referenceTemperatureC: T, sourceType: 'Measured', sourceReference: 'Project A density LR-A-001' };
    (a.feedViscosity as any) = { value: 0.010, referenceTemperatureC: T, sourceType: 'Measured', sourceReference: 'Project A viscosity LR-A-002' };
    const b = baseInputs();
    (b.feedDensity as any) = { value: 940, referenceTemperatureC: T, sourceType: 'Measured', sourceReference: 'Project B density LR-B-001' };
    (b.feedViscosity as any) = { value: 0.020, referenceTemperatureC: T, sourceType: 'Measured', sourceReference: 'Project B viscosity LR-B-002' };
    const runs = await Promise.all(Array.from({ length: 10 }, (_, k) =>
      engine.calculate(k % 2 === 0 ? a : b, { revisionId: 200 + k, designId: k, moduleType: 'llx', userId: 1 })));
    let isolated = true;
    runs.forEach((res, k) => {
      const db = (res.data as any).designBasis;
      const expRho = k % 2 === 0 ? 880 : 940;
      const expMu = k % 2 === 0 ? 0.010 : 0.020;
      if (db.feedFluid.density.value !== expRho || db.feedFluid.dynamicViscosity.value !== expMu) isolated = false;
      if (Math.abs(db.densityDifference_kg_m3 - Math.abs(rhoNMP60 - expRho)) > 1e-9) isolated = false;
    });
    checkTrue('10 interleaved runs each see only their own RRBO ρ and μ', isolated);
    let leaked = true;
    try { getProperty('rrbo', 'density', T); } catch { leaked = false; }
    checkTrue('no RRBO leaked into the shared registry', !leaked);
  }

  console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
