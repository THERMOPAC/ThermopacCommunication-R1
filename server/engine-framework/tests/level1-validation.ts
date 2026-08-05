// ═══════════════════════════════════════════════════════════════════════════════
// Stage C Level 1 — validation test script
// Run: npx tsx server/engine-framework/tests/level1-validation.ts
// ═══════════════════════════════════════════════════════════════════════════════

import {
  convertUnits,
  reynolds, weber, froude, eotvos,
  bisectionSolve, newtonRaphsonSolve, linearInterpolate, goldenSectionMaximize,
  columnCrossSectionArea, superficialVelocity, dragCoefficientSphere,
  terminalVelocitySphere, interfacialArea, slipVelocity,
  thorntonFloodingPoint, percentOfFlooding,
  getProperty, getInterfacialTension, listFluids,
  EngineeringInputError,
} from '../common-engineering-library';

let pass = 0, fail = 0;
function check(name: string, actual: number, expected: number, relTol = 0.01) {
  const ok = Math.abs(actual - expected) <= Math.abs(expected) * relTol + 1e-12;
  if (ok) { pass++; console.log(`  ✅ ${name}: ${actual} ≈ ${expected}`); }
  else { fail++; console.error(`  ❌ ${name}: got ${actual}, expected ${expected} (±${relTol * 100}%)`); }
}
function checkThrows(name: string, fn: () => unknown) {
  try { fn(); fail++; console.error(`  ❌ ${name}: expected EngineeringInputError, none thrown`); }
  catch (e) {
    if (e instanceof EngineeringInputError) { pass++; console.log(`  ✅ ${name}: threw as expected`); }
    else { fail++; console.error(`  ❌ ${name}: wrong error type: ${e}`); }
  }
}

console.log('── Unit conversion ──');
check('1 bar → Pa', convertUnits(1, 'bar', 'Pa'), 1e5);
check('1 m3/h → m3/s', convertUnits(1, 'm3/h', 'm3/s'), 1 / 3600);
check('100 °C → K', convertUnits(100, 'C', 'K'), 373.15);
check('212 °F → °C', convertUnits(212, 'F', 'C'), 100);
check('1 cP → Pa·s', convertUnits(1, 'cP', 'Pa.s'), 1e-3);
check('round-trip kg/m3', convertUnits(convertUnits(997, 'kg/m3', 'g/cm3'), 'g/cm3', 'kg/m3'), 997);
checkThrows('incompatible units', () => convertUnits(1, 'bar', 'm'));

console.log('── Dimensionless numbers ──');
check('Re water 1 m/s in 50 mm pipe', reynolds(997, 1, 0.05, 0.00089), 997 * 1 * 0.05 / 0.00089);
check('We', weber(997, 0.5, 0.002, 0.025), 997 * 0.25 * 0.002 / 0.025);
check('Fr', froude(1, 0.1), 1 / Math.sqrt(9.80665 * 0.1));
check('Eo', eotvos(85, 0.003, 0.025), 85 * 9.80665 * 9e-6 / 0.025);
checkThrows('Re zero viscosity', () => reynolds(997, 1, 0.05, 0));

console.log('── Numerical solvers ──');
{
  const r = bisectionSolve((x) => x * x - 2, 0, 2);
  check('bisection √2', r.root, Math.SQRT2, 1e-6);
  const n = newtonRaphsonSolve((x) => x * x - 2, (x) => 2 * x, 1);
  check('newton √2', n.root, Math.SQRT2, 1e-8);
  check('interp', linearInterpolate([0, 10], [0, 100], 2.5), 25);
  const g = goldenSectionMaximize((x) => -(x - 3) * (x - 3) + 7, 0, 10);
  check('golden-section max at x=3', g.x, 3, 1e-4);
  checkThrows('bisection no sign change', () => bisectionSolve((x) => x * x + 1, -1, 1));
}

console.log('── EPD: water / NMP / RRBO ──');
{
  console.log('  fluids:', listFluids().map((f) => f.id).join(', '));
  check('water ρ @25°C', getProperty('water', 'density', 25).value, 997.05, 0.001);
  check('water μ @25°C', getProperty('water', 'dynamicViscosity', 25).value, 0.00089, 0.01);
  check('water σ @25°C', getProperty('water', 'surfaceTension', 25).value, 0.0720, 0.01);
  check('water cp @25°C', getProperty('water', 'specificHeat', 25).value, 4181, 0.005);
  check('water k @25°C', getProperty('water', 'thermalConductivity', 25).value, 0.607, 0.01);
  check('NMP ρ @25°C', getProperty('nmp', 'density', 25).value, 1028, 0.005);
  check('NMP μ @25°C', getProperty('nmp', 'dynamicViscosity', 25).value, 0.00165, 0.02);
  check('NMP μ @80°C', getProperty('nmp', 'dynamicViscosity', 80).value, 0.00075, 0.03);
  check('RRBO ρ @25°C', getProperty('rrbo', 'density', 25).value, 911.75, 0.005);
  check('RRBO μ @25°C', getProperty('rrbo', 'dynamicViscosity', 25).value, 0.068, 0.03);
  check('RRBO μ @80°C', getProperty('rrbo', 'dynamicViscosity', 80).value, 0.011, 0.05);
  const extrap = getProperty('water', 'density', 150);
  console.log(`  ${extrap.warnings.length > 0 ? '✅' : '❌'} extrapolation warning at 150°C: ${extrap.warnings[0]?.code}`);
  extrap.warnings.length > 0 ? pass++ : fail++;
  const rrboWarn = getProperty('rrbo', 'density', 25);
  console.log(`  ${rrboWarn.warnings.some((w) => w.code === 'EPD_UNVALIDATED_DATA') ? '✅' : '❌'} RRBO unvalidated-data warning present`);
  rrboWarn.warnings.some((w) => w.code === 'EPD_UNVALIDATED_DATA') ? pass++ : fail++;
  check('IFT rrbo/water', getInterfacialTension('rrbo', 'water').value, 0.025, 1e-9);
  checkThrows('unknown fluid', () => getProperty('benzene', 'density', 25));
}

console.log('── Hydraulics ──');
{
  check('area D=1m', columnCrossSectionArea(1), Math.PI / 4);
  check('superficial vel', superficialVelocity(0.01, Math.PI / 4), 0.01 / (Math.PI / 4));

  // Drag: Stokes regime
  check('Cd @Re=0.01', dragCoefficientSphere(0.01).value, 2400);
  // Schiller-Naumann at Re=100: (24/100)(1+0.15·100^0.687) ≈ 1.0921
  check('Cd @Re=100', dragCoefficientSphere(100).value, (24 / 100) * (1 + 0.15 * Math.pow(100, 0.687)), 1e-9);
  check('Cd @Re=5000', dragCoefficientSphere(5000).value, 0.44);

  // Terminal velocity: 1mm oil drop rising in water (Δρ≈85 kg/m³)
  const tv = terminalVelocitySphere(0.001, 911.8, 997, 0.00089);
  console.log(`  terminal velocity 1mm RRBO drop in water: ${(tv.velocity * 1000).toFixed(2)} mm/s (Re=${tv.reynolds.toFixed(2)}, ${tv.regime}, converged=${tv.converged})`);
  // Sanity: force balance residual should be ~0
  const cdAt = dragCoefficientSphere(tv.reynolds).value;
  const uCheck = Math.sqrt((4 * 9.80665 * 0.001 * (997 - 911.8)) / (3 * cdAt * 997));
  check('terminal velocity force balance', tv.velocity, uCheck, 1e-4);

  check('interfacial area φ=0.1 d32=2mm', interfacialArea(0.1, 0.002), 300);
  check('slip velocity', slipVelocity(0.005, 0.01, 0.2), 0.005 / 0.2 + 0.01 / 0.8);

  // Flooding: at R=1 analytic maximum is φ_f = 1/3
  const fl = thorntonFloodingPoint(0.05, 1);
  check('flooding φ_f at R=1', fl.holdupAtFlooding, 1 / 3, 1e-4);
  // u_df at φ=1/3, R=1: u0·(1/3)(2/3)²/((2/3)+(1/3)) = u0·4/27
  check('flooding u_df at R=1', fl.dispersedVelocityAtFlooding, 0.05 * 4 / 27, 1e-4);
  const pct = percentOfFlooding(0.001, 0.001, fl);
  console.log(`  percent of flooding: ${pct.value.toFixed(1)}% (warnings: ${pct.warnings.map((w) => w.code).join(', ') || 'none'})`);
  pct.value > 0 && pct.value < 100 ? pass++ : fail++;
  checkThrows('terminal velocity Δρ=0', () => terminalVelocitySphere(0.001, 997, 997, 0.00089));
}

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
