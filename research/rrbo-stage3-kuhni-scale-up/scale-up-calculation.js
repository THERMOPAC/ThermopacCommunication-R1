#!/usr/bin/env node
/*
 * Independent, read-only reproduction of the Kühni scale-up calculations.
 *
 * This intentionally does not import production resolver code.  It implements
 * the equations stated in the companion report so that the baseline, pilot
 * invariant points, and h_c/D sensitivity can be independently replayed.
 *
 * Commands:
 *   node research/rrbo-stage3-kuhni-scale-up/scale-up-calculation.js
 *   node research/rrbo-stage3-kuhni-scale-up/scale-up-calculation.js --verify
 *   node research/rrbo-stage3-kuhni-scale-up/scale-up-calculation.js --output path.json
 */

import fs from 'node:fs';
import path from 'node:path';

const PI = Math.PI;
const G = 9.80665;
const ROOT_BOUND = 1e-7;
const ROTOR_TO_COLUMN = 0.5;
const STATOR_FREE_AREA = 0.35;
const POWER_NUMBER = 1.2;
const DIRECT_TURBULENCE_C = 0.42;
const MYINT_INTERFACE_PARAMETER = 0;
const GARTHE_SWARM_EXPONENT = 4.65;
const DESIGN_FLOOD_FRACTION = 0.7;
const MAX_TIP_SPEED_MS = 4.5;

const cases = {
  A: {
    name: 'NMP-continuous / RRBO-dispersed',
    temperatureC: 60,
    rpm: 30,
    rhoC: 997,
    muC: 0.001083,
    qC: 0.0007154797726512872,
    rhoD: 856,
    muD: 0.03,
    qD: 0.0011111111111111111,
    sigma: 0.0103,
    persistedDiameterM: 0.9742129194448474,
  },
  B: {
    name: 'RRBO-continuous / wet-NMP-dispersed',
    temperatureC: 40,
    rpm: 25,
    rhoC: 869,
    muC: 0.0598,
    qC: 0.0011111111111111111,
    rhoD: 1015,
    muD: 0.001416,
    qD: 0.0005707717569786535,
    sigma: 0.011,
    persistedDiameterM: 0.6930996970569214,
  },
};

function bisect(fn, low, high, iterations = 60) {
  let fLow = fn(low);
  const fHigh = fn(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) {
    throw new Error('ROOT_NOT_BRACKETED');
  }
  for (let i = 0; i < iterations; i += 1) {
    const mid = (low + high) / 2;
    const fMid = fn(mid);
    if (!Number.isFinite(fMid)) throw new Error('NON_FINITE_ROOT');
    if (fLow * fMid <= 0) high = mid;
    else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

function goldenMax(fn, low, high, iterations = 32) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let c = high - ratio * (high - low);
  let d = low + ratio * (high - low);
  let fc = fn(c);
  let fd = fn(d);
  for (let i = 0; i < iterations; i += 1) {
    if (fc > fd) {
      high = d;
      d = c;
      fd = fc;
      c = high - ratio * (high - low);
      fc = fn(c);
    } else {
      low = c;
      c = d;
      fc = fd;
      d = low + ratio * (high - low);
      fd = fn(d);
    }
  }
  const x = (low + high) / 2;
  return { x, value: fn(x) };
}

function myintDrag(re, kappa, lambda = MYINT_INTERFACE_PARAMETER) {
  return 8 * (2 + 3 * kappa + 3 * lambda)
    / (re * (1 + kappa + lambda))
    * (1 + 0.15 * re ** 0.687);
}

function terminalState(diameterM, basis) {
  const signedDeltaRho = basis.rhoC - basis.rhoD;
  const deltaRho = Math.abs(signedDeltaRho);
  const directionSign = Math.sign(signedDeltaRho);
  const kappa = basis.muD / basis.muC;
  const archimedes = basis.rhoC * deltaRho * G * diameterM ** 3 / basis.muC ** 2;
  const residual = (re) =>
    myintDrag(re, kappa, MYINT_INTERFACE_PARAMETER) * re ** 2
    - 4 * archimedes / 3;
  let high = 1;
  while (residual(high) < 0 && high < 1e7) high *= 2;
  const re = bisect(residual, 1e-12, high);
  const velocityMS = re * basis.muC / (basis.rhoC * diameterM);
  const signedVelocityMS = directionSign * velocityMS;
  const dragCoefficient = myintDrag(re, kappa, MYINT_INTERFACE_PARAMETER);
  const particleVolumeM3 = PI * diameterM ** 3 / 6;
  const projectedAreaM2 = PI * diameterM ** 2 / 4;
  const buoyancyForceN = signedDeltaRho * G * particleVolumeM3;
  const dragForceN = -0.5 * basis.rhoC * dragCoefficient * projectedAreaM2
    * Math.abs(signedVelocityMS) * signedVelocityMS;
  const netForceN = buoyancyForceN + dragForceN;
  const forceScaleN = Math.max(
    Math.abs(buoyancyForceN),
    Math.abs(dragForceN),
    Number.MIN_VALUE,
  );
  const signedRe = directionSign * re;
  const forceBalanceDimensionlessResidual =
    dragCoefficient * Math.abs(signedRe) * signedRe
    - 4 * basis.rhoC * signedDeltaRho * G * diameterM ** 3
      / (3 * basis.muC ** 2);
  const eotvos = deltaRho * G * diameterM ** 2 / basis.sigma;
  const morton = G * basis.muC ** 4 * deltaRho
    / (basis.rhoC ** 2 * basis.sigma ** 3);
  const taylor = re * morton ** 0.23;
  const aspectRatio = 1 - 0.0487 * taylor - 0.0289 * taylor ** 2;
  return {
    velocityMS,
    signedVelocityMS,
    signedRe,
    directionSign,
    direction: directionSign > 0 ? 'rise' : 'fall',
    signedDeltaRho,
    archimedes,
    archimedesSigned: directionSign * archimedes,
    dragCoefficient,
    forceBalance: {
      particleVolumeM3,
      projectedAreaM2,
      buoyancyForceN,
      dragForceN,
      netForceN,
      relativeResidual: netForceN / forceScaleN,
      dimensionlessResidual: forceBalanceDimensionlessResidual,
    },
    re,
    eotvos,
    morton,
    kappa,
    taylor,
    aspectRatio,
    weTerminal: basis.rhoC * velocityMS ** 2 * diameterM / basis.sigma,
  };
}

function hydrodynamics(
  diameterM,
  rpm,
  basis,
  heightRatio = 0.5,
  enforceTipLimit = true,
  computeCapacity = true,
) {
  const rotorDiameterM = ROTOR_TO_COLUMN * diameterM;
  const compartmentHeightM = heightRatio * diameterM;
  const n = rpm / 60;
  const areaM2 = PI * diameterM ** 2 / 4;
  const tipSpeedMS = PI * rotorDiameterM * n;
  if (enforceTipLimit && tipSpeedMS > MAX_TIP_SPEED_MS + 1e-12) {
    throw new Error('TIP_SPEED_LIMIT_EXCEEDED');
  }
  const powerW = POWER_NUMBER * basis.rhoC * n ** 3 * rotorDiameterM ** 5;
  const volumeM3 = areaM2 * compartmentHeightM;
  const psiWKg = powerW / (volumeM3 * basis.rhoC);
  const d32M = DIRECT_TURBULENCE_C
    * (basis.sigma / basis.rhoC) ** 0.6 * psiWKg ** -0.4;
  const terminal = terminalState(d32M, basis);
  const rotorReynolds = basis.rhoC * n * rotorDiameterM ** 2 / basis.muC;
  const sourcePowerNumber = 1.08 + 10.94 / Math.sqrt(rotorReynolds)
    + 257.37 / rotorReynolds ** 1.5;
  const characteristicFactor = 1
    - 1.669 * sourcePowerNumber ** -3.945
    - 2.807 * (d32M / (diameterM - rotorDiameterM)) ** 1.336
    - 1.159 * (compartmentHeightM / diameterM) ** 2.049
    + 2.1 * STATOR_FREE_AREA ** 1.032;
  const characteristicVelocityMS = terminal.velocityMS * characteristicFactor;
  const characteristicRe = basis.rhoC * characteristicVelocityMS * d32M / basis.muC;
  const characteristicDrag = myintDrag(
    characteristicRe,
    terminal.kappa,
    MYINT_INTERFACE_PARAMETER,
  );
  const swarmVelocity = (holdup) => {
    const residual = (velocity) => {
      const re = basis.rhoC * velocity * d32M / basis.muC;
      const drag = myintDrag(re, terminal.kappa, MYINT_INTERFACE_PARAMETER);
      return velocity - characteristicVelocityMS
        * Math.sqrt(
          characteristicDrag / drag
          * (1 - holdup) ** GARTHE_SWARM_EXPONENT,
        );
    };
    return bisect(residual, 1e-14, characteristicVelocityMS);
  };
  const result = {
    diameterM,
    rotorDiameterM,
    compartmentHeightM,
    rpm,
    tipSpeedMS,
    powerW,
    powerVolumeWM3: powerW / volumeM3,
    psiWKg,
    d32M,
    rotorReynolds,
    sourcePowerNumber,
    terminal,
    characteristicFactor,
    characteristicVelocityMS,
    characteristicVelocitySignedMS: terminal.directionSign * characteristicVelocityMS,
    characteristicRe,
    rotorWeber: basis.rhoC * tipSpeedMS ** 2 * rotorDiameterM / basis.sigma,
  };
  if (!computeCapacity) return result;
  const flowRatio = basis.qD / basis.qC;
  const capacityAtHoldup = (holdup) =>
    (1 + flowRatio) * swarmVelocity(holdup)
    / (flowRatio / holdup + 1 / (1 - holdup));
  const flood = goldenMax(capacityAtHoldup, ROOT_BOUND, 1 - ROOT_BOUND);
  const continuousSuperficialVelocityMS = basis.qC / areaM2;
  const dispersedSuperficialVelocityMS = basis.qD / areaM2;
  const totalSuperficialVelocityMS = continuousSuperficialVelocityMS
    + dispersedSuperficialVelocityMS;
  const swarmVelocityAtFloodMS = swarmVelocity(flood.x);
  const swarmRe = basis.rhoC * swarmVelocityAtFloodMS * d32M / basis.muC;
  const continuousBulkVelocitySignedMS = -terminal.directionSign
    * continuousSuperficialVelocityMS;
  const dispersedBulkVelocitySignedMS = terminal.directionSign
    * dispersedSuperficialVelocityMS;
  const relativeBulkVelocitySignedMS = dispersedBulkVelocitySignedMS
    - continuousBulkVelocitySignedMS;
  return {
    ...result,
    floodHoldup: flood.x,
    floodTotalSuperficialVelocityMS: flood.value,
    swarmVelocityAtFloodMS,
    swarmRe,
    continuousSuperficialVelocityMS,
    dispersedSuperficialVelocityMS,
    totalSuperficialVelocityMS,
    actualLoading: totalSuperficialVelocityMS / flood.value,
    signedCountercurrent: {
      convention: '+z upward; continuous phase is assigned countercurrent '
        + 'to the buoyancy-selected dispersed direction',
      continuousBulkVelocitySignedMS,
      dispersedBulkVelocitySignedMS,
      relativeBulkVelocitySignedMS,
      countercurrent: continuousBulkVelocitySignedMS
        * dispersedBulkVelocitySignedMS < 0,
      terminalSlipDirectionMatchesDispersedBulk:
        Math.sign(terminal.signedVelocityMS)
        === Math.sign(dispersedBulkVelocitySignedMS),
    },
  };
}

function rootAtLoading(basis, rpm, heightRatio = 0.5) {
  const physicalMinimumM = Math.max(0.1, 0.05 / heightRatio);
  const tipDerivedMaximumM = MAX_TIP_SPEED_MS * 60
    / (PI * ROTOR_TO_COLUMN * rpm);
  const samples = [];
  for (let i = 0; i <= 30; i += 1) {
    const diameter = physicalMinimumM
      * (tipDerivedMaximumM / physicalMinimumM) ** (i / 30);
    try {
      const result = hydrodynamics(diameter, rpm, basis, heightRatio);
      samples.push({ diameter, residual: result.actualLoading - DESIGN_FLOOD_FRACTION });
    } catch {
      // A candidate outside an equation domain is not a valid bracket point.
    }
  }
  const brackets = [];
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i - 1].residual * samples[i].residual <= 0) {
      brackets.push([samples[i - 1].diameter, samples[i].diameter]);
    }
  }
  const upper = hydrodynamics(tipDerivedMaximumM, rpm, basis, heightRatio);
  const roots = brackets.map(([low, high]) => {
    const diameter = bisect(
      (value) => hydrodynamics(value, rpm, basis, heightRatio).actualLoading
        - DESIGN_FLOOD_FRACTION,
      low,
      high,
    );
    return hydrodynamics(diameter, rpm, basis, heightRatio);
  });
  const root = roots[0] ?? null;
  return {
    heightRatio,
    searchBounds: { physicalMinimumM, tipDerivedMaximumM },
    boundedRootStatus: roots.length
      ? 'ROOTS_IN_BOUNDED_DOMAIN'
      : 'NO_ROOT_IN_BOUNDED_DOMAIN_NOT_INFEASIBILITY_PROOF',
    roots,
    selectedRoot: root
      ? { policy: 'smallest diameter root', diameterM: root.diameterM }
      : null,
    root,
    upperBound: upper,
  };
}

function pilotPoint(basis, diameterM, invariant) {
  let rpm;
  if (invariant === 'constant-tip-speed') {
    rpm = basis.rpm * basis.persistedDiameterM / diameterM;
  } else if (invariant === 'constant-PV') {
    rpm = basis.rpm * (basis.persistedDiameterM / diameterM) ** (2 / 3);
  } else if (invariant === 'constant-rotor-Re') {
    rpm = basis.rpm * (basis.persistedDiameterM / diameterM) ** 2;
  } else {
    throw new Error(`UNKNOWN_INVARIANT:${invariant}`);
  }
  // Pilot invariant points deliberately retain the calculated value even when
  // it exceeds the industrial screening ceiling; the result is flagged below.
  const point = hydrodynamics(diameterM, rpm, basis, 0.5, false, false);
  return {
    invariant,
    diameterM,
    rotorDiameterM: point.rotorDiameterM,
    compartmentHeightM: point.compartmentHeightM,
    rpm,
    tipSpeedMS: point.tipSpeedMS,
    powerW: point.powerW,
    powerVolumeWM3: point.powerVolumeWM3,
    psiWKg: point.psiWKg,
    d32M: point.d32M,
    rotorReynolds: point.rotorReynolds,
    rotorWeber: point.rotorWeber,
    tipSpeedLimitStatus: point.tipSpeedMS <= MAX_TIP_SPEED_MS
      ? 'PASS' : 'EXCEEDS_4_5_M_PER_S_SCREEN',
  };
}

function roundTripCheck(actual, expected, tolerance = 1e-9) {
  return Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected));
}

function run() {
  const industrial = {};
  const pilots = [];
  const sensitivity = {};
  for (const [id, basis] of Object.entries(cases)) {
    const point = hydrodynamics(basis.persistedDiameterM, basis.rpm, basis, 0.5);
    industrial[id] = {
      inputs: basis,
      geometry: point,
      d32MM: point.d32M * 1000,
      d32OverD: point.d32M / point.diameterM,
      d32OverRotor: point.d32M / point.rotorDiameterM,
      eotvos: point.terminal.eotvos,
      morton: point.terminal.morton,
      weTerminal: point.terminal.weTerminal,
      taylor: point.terminal.taylor,
      operatingFraction: point.actualLoading,
    };
    if (id === 'B') {
      for (const diameterM of [0.06, 0.15]) {
        for (const invariant of [
          'constant-tip-speed',
          'constant-PV',
          'constant-rotor-Re',
        ]) {
          pilots.push(pilotPoint(basis, diameterM, invariant));
        }
      }
      for (const ratio of [0.2, 0.25, 0.3, 0.5]) {
        sensitivity[ratio] = rootAtLoading(basis, basis.rpm, ratio);
      }
    }
  }

  const b = industrial.B.geometry;
  const checks = {
    caseABaselineDiameter: roundTripCheck(
      industrial.A.geometry.diameterM,
      cases.A.persistedDiameterM,
      1e-9,
    ),
    caseAD32: roundTripCheck(
      industrial.A.geometry.d32M,
      0.0025707441992382585,
      1e-9,
    ),
    caseATerminalRe: roundTripCheck(
      industrial.A.geometry.terminal.re,
      178.57240730624966,
      1e-9,
    ),
    caseAFloodHoldup: roundTripCheck(
      industrial.A.geometry.floodHoldup,
      0.20077600313512306,
      1e-9,
    ),
    caseAFloodVelocity: roundTripCheck(
      industrial.A.geometry.floodTotalSuperficialVelocityMS,
      0.0035006250415678046,
      1e-9,
    ),
    caseATip: roundTripCheck(
      industrial.A.geometry.tipSpeedMS,
      0.7651450376900494,
      1e-9,
    ),
    caseAWeber: roundTripCheck(industrial.A.geometry.rotorWeber, 27603.83066532709, 1e-9),
    caseALoading: roundTripCheck(industrial.A.geometry.actualLoading, 0.7, 1e-9),
    caseAForceBalance:
      Math.abs(industrial.A.geometry.terminal.forceBalance.relativeResidual) < 1e-12
      && Math.abs(industrial.A.geometry.terminal.forceBalance.dimensionlessResidual) < 1e-9,
    caseACountercurrent: industrial.A.geometry.signedCountercurrent.countercurrent
      && industrial.A.geometry.signedCountercurrent.terminalSlipDirectionMatchesDispersedBulk,
    caseBRoot: roundTripCheck(b.diameterM, cases.B.persistedDiameterM, 1e-9),
    caseBD32: roundTripCheck(b.d32M, 0.004745712291978018, 1e-9),
    caseBTerminalRe: roundTripCheck(b.terminal.re, 2.4045150651823217, 1e-9),
    caseBFloodHoldup: roundTripCheck(b.floodHoldup, 0.1447261647352734, 1e-9),
    caseBTip: roundTripCheck(b.tipSpeedMS, 0.4536326909613897, 1e-9),
    caseBWeber: roundTripCheck(b.rotorWeber, 5633.800880473315, 1e-9),
    caseBForceBalance:
      Math.abs(b.terminal.forceBalance.relativeResidual) < 1e-12
      && Math.abs(b.terminal.forceBalance.dimensionlessResidual) < 1e-9,
    caseBCountercurrent: b.signedCountercurrent.countercurrent
      && b.signedCountercurrent.terminalSlipDirectionMatchesDispersedBulk,
    noBoundedRootAtHcOverD020: sensitivity[0.2].root === null,
    noBoundedRootAtHcOverD025: sensitivity[0.25].root === null,
    noBoundedRootAtHcOverD030: sensitivity[0.3].root === null,
    rootAtHcOverD050: sensitivity[0.5].root !== null
      && roundTripCheck(sensitivity[0.5].root.diameterM, cases.B.persistedDiameterM, 1e-9),
    allRootsAtHcOverD050: sensitivity[0.5].roots.length === 2,
    secondRootAtHcOverD050: sensitivity[0.5].roots.length === 2
      && roundTripCheck(sensitivity[0.5].roots[1].diameterM, 4.9586421805663115, 1e-9),
    smallestRootSelected: sensitivity[0.5].selectedRoot?.diameterM
      === sensitivity[0.5].roots[0]?.diameterM,
  };
  const allChecksPass = Object.values(checks).every(Boolean);
  if (process.argv.includes('--verify') && !allChecksPass) {
    throw new Error(`VERIFICATION_FAILED:${JSON.stringify(checks)}`);
  }
  return {
    metadata: {
      generatedBy: 'research/rrbo-stage3-kuhni-scale-up/scale-up-calculation.js',
      equationsBasis: 'Independent transcription of current resolver equations; no production import',
      constants: {
        gravityMS2: G,
        rotorToColumn: ROTOR_TO_COLUMN,
        statorFreeAreaFraction: STATOR_FREE_AREA,
        powerNumber: POWER_NUMBER,
        directTurbulenceCoefficient: DIRECT_TURBULENCE_C,
        myintInterfaceParameter: MYINT_INTERFACE_PARAMETER,
        gartheSwarmExponent: GARTHE_SWARM_EXPONENT,
        designFloodFraction: DESIGN_FLOOD_FRACTION,
        maxTipSpeedMS: MAX_TIP_SPEED_MS,
      },
      commands: [
        'node research/rrbo-stage3-kuhni-scale-up/scale-up-calculation.js --output research/rrbo-stage3-kuhni-scale-up/scale-up-calculation-results.json',
        'node research/rrbo-stage3-kuhni-scale-up/scale-up-calculation.js --verify',
      ],
    },
    equations: {
      power: 'P = Np*rhoC*n^3*DR^5',
      specificPower: 'psi = P/(rhoC*A*hc)',
      dropSize: 'd32 = 0.42*(sigma/rhoC)^0.6*psi^-0.4',
      myintDrag: 'Cd = 8*(2+3*kappa+3*lambda)/(Re*(1+kappa+lambda))*(1+0.15*Re^0.687), lambda=0',
      signedForceBalance: '0 = (rhoC-rhoD)*g*(pi*d32^3/6) - 0.5*rhoC*Cd*(pi*d32^2/4)*|w|w',
      archimedes: 'Ar_signed = rhoC*(rhoC-rhoD)*g*d32^3/muC^2; Cd*|Re|Re = 4*Ar_signed/3',
      characteristicFactor: 'vchar/vt = 1 - 1.669*NpSource^-3.945 - 2.807*(d32/(D-DR))^1.336 - 1.159*(hc/D)^2.049 + 2.1*phiS^1.032',
      gartheSourcePowerNumber: 'NpSource = 1.08 + 10.94/ReR^0.5 + 257.37/ReR^1.5 (Garthe Eqs. 5.6-5.7, printed p. 86)',
      gartheSwarmSource: 'vs/vo = sqrt(Cd,o(Reo)/Cd,o(Res)*(1-hd)^4.65) (Garthe Eq. 8.3, printed p. 126)',
      currentSwarmClosure: 'vs = vchar*sqrt((Cd,char/Cd,swarm)*(1-h)^4.65), lambda=0',
      rotorWeber: 'We_R = rhoC*uTip^2*DR/sigma',
      terminalWeber: 'We_t = rhoC*|w_t|^2*d32/sigma',
      terminalTaylor: 'Ta = Re_t*Mo^0.23',
      floodCapacity: 'Uf = max_h [(1+Qd/Qc)*w_swarm(h)/(Qd/(Qc*h)+1/(1-h))]',
      operatingFraction: 'f = (Qc+Qd)/(A*Uf)',
    },
    industrial,
    pilots,
    sensitivity,
    checks: { ...checks, allChecksPass },
  };
}

const output = run();
const outputArgumentIndex = process.argv.indexOf('--output');
if (outputArgumentIndex >= 0) {
  const outputPath = process.argv[outputArgumentIndex + 1];
  if (!outputPath) throw new Error('MISSING_OUTPUT_PATH');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
