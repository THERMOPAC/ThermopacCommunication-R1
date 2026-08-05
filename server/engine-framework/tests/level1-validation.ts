// ═══════════════════════════════════════════════════════════════════════════════
// Stage C Level 1 (corrected scope) — validation test script
// Run: npx tsx server/engine-framework/tests/level1-validation.ts
// ═══════════════════════════════════════════════════════════════════════════════

import {
  convertUnits,
  reynolds, weber, froude, froudeSquared, froudeRotational, eotvos, morton,
  bisectionSolve, newtonRaphsonSolve, linearInterpolate, goldenSectionMaximize,
  columnCrossSectionArea, superficialVelocity, dragCoefficientSphere,
  terminalVelocitySphere, interfacialArea, slipVelocity,
  solveCounterCurrentHoldup, maximizeThroughputAtFixedFlowRatio, percentOfThroughputMaximum,
  getProperty, getInterfacialTension, listFluids, registerProjectFluid, unregisterProjectFluid,
  containsAssumedData, EngineeringInputError, NotImplementedError,
  CEL_VERSION, EPD_VERSION,
  schmidt, nusseltDittusBoelter, moodyFrictionFactor,
} from '../common-engineering-library';

let pass = 0, fail = 0;
function check(name: string, actual: number, expected: number, relTol = 0.01) {
  const ok = Math.abs(actual - expected) <= Math.abs(expected) * relTol + 1e-12;
  if (ok) { pass++; console.log(`  ✅ ${name}: ${actual} ≈ ${expected}`); }
  else { fail++; console.error(`  ❌ ${name}: got ${actual}, expected ${expected} (±${relTol * 100}%)`); }
}
function checkTrue(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}`); }
}
function checkThrows(name: string, fn: () => unknown) {
  try { fn(); fail++; console.error(`  ❌ ${name}: expected EngineeringInputError, none thrown`); }
  catch (e) {
    if (e instanceof EngineeringInputError) { pass++; console.log(`  ✅ ${name}: threw as expected`); }
    else { fail++; console.error(`  ❌ ${name}: wrong error type: ${e}`); }
  }
}

console.log('── Unit conversion (LLX unit set) ──');
check('1 m3/h → m3/s', convertUnits(1, 'm3/h', 'm3/s'), 1 / 3600);
check('1000 L/h → m3/h', convertUnits(1000, 'L/h', 'm3/h'), 1);
check('1 g/cm3 → kg/m3', convertUnits(1, 'g/cm3', 'kg/m3'), 1000);
check('1 cP → Pa·s', convertUnits(1, 'cP', 'Pa.s'), 1e-3);
check('1 mPa·s → cP', convertUnits(1, 'mPa.s', 'cP'), 1);
check('1 cSt → m2/s', convertUnits(1, 'cSt', 'm2/s'), 1e-6);
check('1 bar → kPa', convertUnits(1, 'bar', 'kPa'), 100);
check('1 bar → mbar', convertUnits(1, 'bar', 'mbar'), 1000);
check('10000 mmWC → Pa', convertUnits(10000, 'mmWC', 'Pa'), 98066.5);
check('72 mN/m → N/m', convertUnits(72, 'mN/m', 'N/m'), 0.072);
check('25 °C → K', convertUnits(25, 'C', 'K'), 298.15);
check('373.15 K → °C', convertUnits(373.15, 'K', 'C'), 100);
check('1500 mm → m', convertUnits(1500, 'mm', 'm'), 1.5);
check('120 rpm → 1/s', convertUnits(120, 'rpm', '1/s'), 2);
checkThrows('incompatible units bar→m', () => convertUnits(1, 'bar', 'm'));
checkThrows('temperature × factor misuse C→m', () => convertUnits(25, 'C', 'm'));
checkThrows('below absolute zero', () => convertUnits(-300, 'C', 'K'));

console.log('── Dimensionless numbers ──');
check('Re water 1 m/s, 50 mm', reynolds(997, 1, 0.05, 0.00089), 997 * 0.05 / 0.00089);
check('We', weber(997, 0.5, 0.002, 0.025), 997 * 0.25 * 0.002 / 0.025);
check('Fr', froude(1, 0.1), 1 / Math.sqrt(9.80665 * 0.1));
check('Fr² = Fr·Fr', froudeSquared(1, 0.1), Math.pow(froude(1, 0.1), 2), 1e-12);
check('Fr_rot = N²D/g (2 rps, 0.3 m)', froudeRotational(2, 0.3), 4 * 0.3 / 9.80665, 1e-12);
check('Eo', eotvos(85, 0.003, 0.025), 85 * 9.80665 * 9e-6 / 0.025);
check('Mo water-like', morton(0.001, 100, 1000, 0.03), 9.80665 * 1e-12 * 100 / (1e6 * 2.7e-5), 1e-6);
checkThrows('Re zero viscosity', () => reynolds(997, 1, 0.05, 0));

console.log('── Numerical solvers ──');
{
  const r = bisectionSolve((x) => x * x - 2, 0, 2);
  check('bisection √2', r.root, Math.SQRT2, 1e-6);
  checkTrue('bisection reports converged', r.converged);
  const n = newtonRaphsonSolve((x) => x * x - 2, (x) => 2 * x, 1);
  check('newton √2', n.root, Math.SQRT2, 1e-8);
  // Failure mode: bad derivative must NOT report convergence at a non-root
  const badD = newtonRaphsonSolve((x) => x * x + 1, () => 1e20, 5);
  checkTrue('newton with bogus derivative: converged=false', !badD.converged);
  // Vanishing derivative with bracketed fallback
  const fb = newtonRaphsonSolve((x) => x * x - 2, () => 0, 1, 1e-10, 50, { a: 0, b: 2 });
  check('newton→bisection fallback √2', fb.root, Math.SQRT2, 1e-6);
  checkTrue('fallback flagged in method', fb.method.includes('fallback'));
  check('interp', linearInterpolate([0, 10], [0, 100], 2.5), 25);
  checkThrows('interp extrapolation blocked by default', () => linearInterpolate([0, 10], [0, 100], 20));
  const g = goldenSectionMaximize((x) => -(x - 3) * (x - 3) + 7, 0, 10);
  check('golden-section max at x=3', g.x, 3, 1e-4);
  checkThrows('golden-section rejects NaN objective', () => goldenSectionMaximize(() => NaN, 0, 1));
  checkThrows('bisection no sign change', () => bisectionSolve((x) => x * x + 1, -1, 1));
}

console.log('── EPD: library fluids (water, NMP) ──');
{
  console.log('  fluids:', listFluids().map((f) => `${f.id}(${f.kind})`).join(', '));
  // Kell coefficient-transcription guards: tolerances tight enough that the
  // erroneous denominator coefficient 16.897850e-3 (vs correct 16.879850e-3)
  // fails every one of these (it gives 996.73 @25 °C, off by 0.32 kg/m³).
  check('water ρ @3.98°C (density maximum)', getProperty('water', 'density', 3.98).value, 999.972, 0.00005);
  check('water ρ @20°C (Kell 1975)', getProperty('water', 'density', 20).value, 998.204, 0.00005);
  check('water ρ @25°C (Kell 1975)', getProperty('water', 'density', 25).value, 997.045, 0.00005);
  check('water ρ @80°C', getProperty('water', 'density', 80).value, 971.798, 0.00005);
  check('water ρ @100°C', getProperty('water', 'density', 100).value, 958.364, 0.00005);
  check('water μ @25°C (Vogel)', getProperty('water', 'dynamicViscosity', 25).value, 0.000890, 0.005);
  check('water μ @80°C', getProperty('water', 'dynamicViscosity', 80).value, 0.000355, 0.01);
  check('water σ @25°C (IAPWS R1-76)', getProperty('water', 'surfaceTension', 25).value, 0.07197, 0.001);
  check('water σ @100°C', getProperty('water', 'surfaceTension', 100).value, 0.0589, 0.005);
  checkThrows('water cp not in Level 1 scope', () => getProperty('water', 'specificHeat', 25));
  check('NMP ρ @25°C (CRC)', getProperty('nmp', 'density', 25).value, 1028, 1e-9);
  check('NMP μ @25°C (CRC)', getProperty('nmp', 'dynamicViscosity', 25).value, 1.666e-3, 1e-9);
  check('NMP σ @25°C (Jasper)', getProperty('nmp', 'surfaceTension', 25).value, 0.0407, 1e-9);
  const nmpHot = getProperty('nmp', 'dynamicViscosity', 60);
  checkTrue('NMP tabular Assumed point warns', nmpHot.warnings.some((w) => w.code === 'EPD_ASSUMED_VALUE'));
  // Kell density validated 0–150 °C, so probe beyond that
  const extrap = getProperty('water', 'density', 160);
  checkTrue('extrapolation warning at 160°C', extrap.warnings.some((w) => w.code === 'EPD_TEMPERATURE_EXTRAPOLATION'));
  checkThrows('below absolute zero throws', () => getProperty('water', 'density', -300));
  checkThrows('physically impossible output throws (deep extrapolation)', () => getProperty('nmp', 'density', 5000));
  checkThrows('unknown fluid', () => getProperty('benzene', 'density', 25));
  checkTrue('no rapeseed/vegetable RRBO in library', !listFluids().some((f) => f.id === 'rrbo'));
}

console.log('── EPD: project fluid (RRBO = Re-Refined Base Oil) ──');
{
  registerProjectFluid({
    id: 'rrbo',
    name: 'RRBO (Re-Refined Base Oil) — test project',
    isProjectFluid: true,
    properties: {
      density: {
        value: 872, unit: 'kg/m3', referenceTemperatureC: 40,
        sourceType: 'Vendor', sourceReference: 'Vendor CoA #TEST-001',
        temperatureCoefficient: { slopePerC: -0.62, sourceType: 'Vendor', sourceReference: 'Vendor CoA #TEST-001' },
        validRangeC: { min: 20, max: 100 },
      },
      dynamicViscosity: {
        value: 0.032, unit: 'Pa.s', referenceTemperatureC: 40,
        sourceType: 'Assumed', sourceReference: 'Awaiting lab measurement',
      },
    },
    interfacialTension: {
      nmp: { value: 0.003, referenceTemperatureC: 25, sourceType: 'Assumed', sourceReference: 'Awaiting measurement' },
    },
  });
  check('RRBO ρ @40°C = entered value', getProperty('rrbo', 'density', 40).value, 872, 1e-12);
  check('RRBO ρ @60°C via explicit coefficient', getProperty('rrbo', 'density', 60).value, 872 - 0.62 * 20, 1e-9);
  const mu = getProperty('rrbo', 'dynamicViscosity', 60);
  check('RRBO μ constant (no coefficient supplied)', mu.value, 0.032, 1e-12);
  checkTrue('RRBO μ warns: assumed', mu.warnings.some((w) => w.code === 'EPD_ASSUMED_VALUE'));
  checkTrue('RRBO μ warns: no temperature correction', mu.warnings.some((w) => w.code === 'EPD_NO_TEMPERATURE_CORRECTION'));
  const ift = getInterfacialTension('rrbo', 'nmp');
  check('RRBO/NMP IFT engineer-entered', ift.value, 0.003, 1e-12);
  checkTrue('IFT warns: assumed', ift.warnings.some((w) => w.code === 'EPD_ASSUMED_VALUE'));
  checkThrows('no library IFT default water/nmp', () => getInterfacialTension('water', 'nmp'));
  checkThrows('project fluid wrong unit rejected', () => registerProjectFluid({
    id: 'rrbo2', name: 'x', isProjectFluid: true,
    properties: { density: { value: 0.87, unit: 'g/cm3', referenceTemperatureC: 25, sourceType: 'Measured', sourceReference: 'lab' } },
  }));
  checkThrows('project fluid missing sourceReference rejected', () => registerProjectFluid({
    id: 'rrbo3', name: 'x', isProjectFluid: true,
    properties: { density: { value: 870, unit: 'kg/m3', referenceTemperatureC: 25, sourceType: 'Measured', sourceReference: ' ' } },
  }));
  checkThrows('cannot redefine library fluid as project fluid', () => registerProjectFluid({
    id: 'water', name: 'x', isProjectFluid: true, properties: {},
  }));
  unregisterProjectFluid('rrbo');
  checkTrue('project fluid unregistered', !listFluids().some((f) => f.id === 'rrbo'));
}

console.log('── Hydraulics ──');
{
  check('area D=1m', columnCrossSectionArea(1), Math.PI / 4);
  check('superficial vel', superficialVelocity(0.01, Math.PI / 4), 0.01 / (Math.PI / 4));

  check('Cd @Re=0.01 (Stokes)', dragCoefficientSphere(0.01).value, 2400);
  check('Cd @Re=100 (Schiller-Naumann)', dragCoefficientSphere(100).value, (24 / 100) * (1 + 0.15 * Math.pow(100, 0.687)), 1e-9);
  check('Cd @Re=5000 (Newton)', dragCoefficientSphere(5000).value, 0.44);
  checkTrue('Cd warns beyond drag crisis', dragCoefficientSphere(5e5).warnings.some((w) => w.code === 'DRAG_CRISIS'));

  const tv = terminalVelocitySphere(0.001, 912, 997, 0.00089);
  console.log(`  rigid-sphere screening u_t (1mm, Δρ=85): ${(tv.velocity * 1000).toFixed(2)} mm/s (Re=${tv.reynolds.toFixed(2)}, ${tv.regime})`);
  checkTrue('terminal velocity converged', tv.converged);
  checkTrue('RIGID_SPHERE_SCREENING warning always present', tv.warnings.some((w) => w.code === 'RIGID_SPHERE_SCREENING'));
  const cdAt = dragCoefficientSphere(tv.reynolds).value;
  check('force balance satisfied', tv.velocity, Math.sqrt((4 * 9.80665 * 0.001 * 85) / (3 * cdAt * 997)), 1e-4);
  checkThrows('Δρ=0 rejected', () => terminalVelocitySphere(0.001, 997, 997, 0.00089));

  check('interfacial area φ=0.1, d32=2mm', interfacialArea(0.1, 0.002), 300);
  check('slip velocity identity', slipVelocity(0.005, 0.01, 0.2), 0.005 / 0.2 + 0.01 / 0.8);
  checkThrows('slip velocity φ=1 rejected', () => slipVelocity(0.005, 0.01, 1));

  // Generic holdup solver with an ENGINE-SUPPLIED slip model u_slip = u0(1−φ)
  const u0 = 0.05;
  const slipFn = (phi: number) => u0 * (1 - phi);
  const hold = solveCounterCurrentHoldup(slipFn, 0.004, 0.004);
  checkTrue('holdup solver finds ≥1 root', hold.roots.length >= 1);
  const phi1 = hold.roots[0];
  check('holdup root satisfies balance', slipVelocity(0.004, 0.004, phi1), slipFn(phi1), 1e-6);
  const flooded = solveCounterCurrentHoldup(slipFn, 0.05, 0.05);
  checkTrue('no root ⇒ NO_HOLDUP_SOLUTION warning', flooded.roots.length === 0 && flooded.warnings.some((w) => w.code === 'NO_HOLDUP_SOLUTION'));

  // Generic throughput maximizer: with u_d(φ)=u0·φ(1−φ)²/((1−φ)+Rφ), R=1 the
  // analytic maximum is at φ=1/3 (test of the MATH utility, no technology claim)
  const R = 1;
  const uD = (phi: number) => (u0 * phi * (1 - phi) ** 2) / ((1 - phi) + R * phi);
  const cap = maximizeThroughputAtFixedFlowRatio(uD, R);
  check('optimizer φ* (analytic 1/3)', cap.optimumHoldup, 1 / 3, 1e-4);
  check('optimizer u_d*', cap.dispersedVelocityAtMaximum, u0 * 4 / 27, 1e-4);
  check('u_c* = R·u_d*', cap.continuousVelocityAtMaximum, R * cap.dispersedVelocityAtMaximum, 1e-12);
  checkTrue('result binds flow ratio definition', cap.flowRatioDefinition === 'R = u_c / u_d' && cap.flowRatioValue === R);
  checkTrue('result stores holdup bounds', cap.holdupBounds.min > 0 && cap.holdupBounds.max < 1);
  checkTrue('optimizer converged', cap.converged);

  const pct = percentOfThroughputMaximum(0.002, 0.002, cap); // same ratio R=1
  checkTrue('percent-of-max computed at matching ratio', pct.value > 0 && pct.value < 100);
  checkThrows('off-ratio comparison rejected', () => percentOfThroughputMaximum(0.002, 0.01, cap));
  const offRatio = percentOfThroughputMaximum(0.002, 0.01, cap, true);
  checkTrue('off-ratio with override ⇒ FLOW_RATIO_MISMATCH warning', offRatio.warnings.some((w) => w.code === 'FLOW_RATIO_MISMATCH'));
}

console.log('── Versioning & deferred-function behaviour ──');
{
  checkTrue('CEL_VERSION assigned', CEL_VERSION === '1.0.0');
  checkTrue('EPD_VERSION assigned', EPD_VERSION === '1.0.0');
  const nmpHot60 = getProperty('nmp', 'dynamicViscosity', 60);
  checkTrue('containsAssumedData flags provisional NMP data', containsAssumedData(nmpHot60.warnings));
  checkTrue('containsAssumedData false for clean water data', !containsAssumedData(getProperty('water', 'density', 25).warnings));
  // Deferred functions must fail explicitly — never fabricate values
  for (const [name, fn] of [
    ['schmidt', () => schmidt(1000, 0.001, 1e-9)],
    ['nusseltDittusBoelter', () => nusseltDittusBoelter(1e4, 5, true)],
    ['moodyFrictionFactor', () => moodyFrictionFactor(1e5, 1e-4)],
  ] as Array<[string, () => number]>) {
    try { fn(); fail++; console.error(`  ❌ deferred ${name} did not throw`); }
    catch (e) {
      if (e instanceof NotImplementedError) { pass++; console.log(`  ✅ deferred ${name} throws NotImplementedError`); }
      else { fail++; console.error(`  ❌ deferred ${name} threw wrong type: ${e}`); }
    }
  }
}

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
