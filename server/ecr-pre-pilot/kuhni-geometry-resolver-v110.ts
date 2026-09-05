import { createHash } from 'node:crypto';
import type { HydrodynamicProcessBasis } from './kuhni-hydrodynamics';
import {
  KUHNI_DRAG_MODEL_VERSION,
  KUHNI_GEOMETRY_RESOLVER_HASH,
  resolveKuhniGeometry,
  type TheoreticalStageAuthority,
} from './kuhni-geometry-resolver';
import { kuhniRunHash } from './kuhni-hydrodynamics';

export const KUHNI_GEOMETRY_RESOLVER_V110_VERSION = 'KUHNI_GEOMETRY_RESOLVER_V1.1.0';

const G = 9.80665;
const PI = Math.PI;
const ROTOR_TO_COLUMN = 0.5;
const COMPARTMENT_TO_COLUMN = 0.5;
const STATOR_FREE_AREA = 0.35;
const POWER_NUMBER = 1.2;
const DIRECT_TURBULENCE_C = 0.42;
const MAX_TIP_SPEED_MS = 4.5;
const ROOT_BOUND = 1e-7;

const implementationDescriptors = [
  KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
  KUHNI_GEOMETRY_RESOLVER_HASH,
  KUHNI_DRAG_MODEL_VERSION,
  'frozen-stage-3-characteristic-velocity-and-swarm-model',
  'F(phi)=vchar(phi)-[jD/phi+jC/(1-phi)]',
  'stable-low-holdup-root-strictly-below-flooding-turning-point',
  'no-root=HYDRAULICALLY_INFEASIBLE|flood-holdup-never-substituted',
];

export const KUHNI_GEOMETRY_RESOLVER_V110_HASH = createHash('sha256')
  .update(implementationDescriptors.join('|'))
  .digest('hex');

export type KuhniOperatingHoldupInput = {
  processBasis: HydrodynamicProcessBasis;
  columnDiameterM: number;
  rpm: number;
};

export type KuhniOperatingHoldupApplicability = {
  status: 'CALCULATED_IN_RANGE' | 'CALCULATED_EXTRAPOLATED';
  codes: string[];
  drag: string[];
  shape: string[];
};

export type KuhniOperatingHoldupUncertainty = {
  classification: 'PRE_PILOT_PREDICTIVE_NOT_VENDOR_GUARANTEED';
  operatingBranch: 'STABLE_LOW_HOLDUP';
  statement: string;
};

type CommonResult = {
  engine: {
    id: 'kuhni_geometry_resolver';
    version: typeof KUHNI_GEOMETRY_RESOLVER_V110_VERSION;
    implementationHash: typeof KUHNI_GEOMETRY_RESOLVER_V110_HASH;
    dragModel: typeof KUHNI_DRAG_MODEL_VERSION;
    extendsImplementationHash: typeof KUHNI_GEOMETRY_RESOLVER_HASH;
  };
  input: KuhniOperatingHoldupInput;
  floodHoldup: number;
  operatingHoldup: number | null;
  residual: number | null;
  maximumResidualBelowFlood: number;
  continuousSuperficialVelocityMS: number;
  dispersedSuperficialVelocityMS: number;
  characteristicVelocityMS: number;
  operatingSwarmVelocityMS: number | null;
  floodTotalSuperficialVelocityMS: number;
  applicability: KuhniOperatingHoldupApplicability;
  uncertainty: KuhniOperatingHoldupUncertainty;
};

export type KuhniOperatingHoldupResult = CommonResult & (
  {
    status: 'OPERATING_HOLDUP_CALCULATED';
    operatingHoldup: number;
    residual: number;
    operatingSwarmVelocityMS: number;
    reason: null;
  } | {
    status: 'HYDRAULICALLY_INFEASIBLE';
    operatingHoldup: null;
    residual: null;
    operatingSwarmVelocityMS: null;
    reason: 'NO_STABLE_LOW_HOLDUP_ROOT_BELOW_FLOODING_TURNING_POINT';
  }
);

function bisect(fn: (x: number) => number, low: number, high: number, iterations = 60) {
  let fLow = fn(low);
  const fHigh = fn(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) {
    throw new Error('ROOT_NOT_BRACKETED');
  }
  for (let i = 0; i < iterations; i += 1) {
    const mid = (low + high) / 2;
    const fMid = fn(mid);
    if (!Number.isFinite(fMid)) throw new Error('NON_FINITE_ROOT_RESIDUAL');
    if (fLow * fMid <= 0) high = mid;
    else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

function goldenMax(fn: (x: number) => number, low: number, high: number, iterations = 32) {
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

function myintDrag(re: number, kappa: number, lambda: number) {
  if (!(re > 0) || !(kappa > 0) || lambda < 0) throw new Error('INVALID_MYINT_STATE');
  return 8 * (2 + 3 * kappa + 3 * lambda) / (re * (1 + kappa + lambda))
    * (1 + 0.15 * re ** 0.687);
}

function terminalState(
  diameterM: number,
  rhoC: number,
  rhoD: number,
  muC: number,
  muD: number,
  sigma: number,
) {
  const deltaRho = rhoC - rhoD;
  if (!(diameterM > 0 && deltaRho > 0 && sigma > 0 && muC > 0 && muD > 0)) {
    throw new Error('NON_PHYSICAL_TERMINAL_INPUT');
  }
  const kappa = muD / muC;
  const archimedes = rhoC * deltaRho * G * diameterM ** 3 / muC ** 2;
  const dragResidual = (re: number) =>
    myintDrag(re, kappa, 0) * re ** 2 - 4 * archimedes / 3;
  let high = 1;
  while (dragResidual(high) < 0 && high < 1e7) high *= 2;
  const re = bisect(dragResidual, 1e-12, high);
  const velocityMS = re * muC / (rhoC * diameterM);
  const eotvos = deltaRho * G * diameterM ** 2 / sigma;
  const morton = G * muC ** 4 * deltaRho / (rhoC ** 2 * sigma ** 3);
  const taylor = re * morton ** 0.23;
  const aspectRatio = 1 - 0.0487 * taylor - 0.0289 * taylor ** 2;
  return { velocityMS, re, eotvos, morton, kappa, taylor, aspectRatio };
}

export function resolveKuhniOperatingHoldupV110(
  input: KuhniOperatingHoldupInput,
): KuhniOperatingHoldupResult {
  const { processBasis: basis, columnDiameterM, rpm } = input;
  if (!(columnDiameterM > 0 && Number.isFinite(columnDiameterM))) {
    throw new Error('COLUMN_DIAMETER_MUST_BE_POSITIVE');
  }
  if (!(rpm > 0 && Number.isFinite(rpm))) throw new Error('RPM_MUST_BE_POSITIVE');

  const continuous = basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed'
    ? basis.wetSolventPhase : basis.rrboFeed;
  const dispersed = basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed'
    ? basis.rrboFeed : basis.wetSolventPhase;
  if (!(continuous.densityKgM3 > dispersed.densityKgM3)) {
    throw new Error('CONTINUOUS_PHASE_MUST_BE_HEAVIER');
  }

  const rotorDiameterM = ROTOR_TO_COLUMN * columnDiameterM;
  const compartmentHeightM = COMPARTMENT_TO_COLUMN * columnDiameterM;
  const n = rpm / 60;
  const tipSpeedMS = PI * rotorDiameterM * n;
  if (tipSpeedMS > MAX_TIP_SPEED_MS) throw new Error('TIP_SPEED_LIMIT_EXCEEDED');
  const areaM2 = PI * columnDiameterM ** 2 / 4;
  const powerW = POWER_NUMBER * continuous.densityKgM3 * n ** 3 * rotorDiameterM ** 5;
  const psiWKg = powerW / (areaM2 * compartmentHeightM * continuous.densityKgM3);
  const d32M = DIRECT_TURBULENCE_C
    * (basis.interfacialTensionNM / continuous.densityKgM3) ** 0.6 * psiWKg ** -0.4;
  if (!(d32M > 0 && Number.isFinite(d32M))) throw new Error('D32_NOT_CALCULABLE');

  const terminal = terminalState(
    d32M,
    continuous.densityKgM3,
    dispersed.densityKgM3,
    continuous.dynamicViscosityPaS,
    dispersed.dynamicViscosityPaS,
    basis.interfacialTensionNM,
  );
  const rotorReynolds =
    continuous.densityKgM3 * n * rotorDiameterM ** 2 / continuous.dynamicViscosityPaS;
  if (!(rotorReynolds > 0)) throw new Error('ROTOR_REYNOLDS_NOT_CALCULABLE');
  const sourcePowerNumber =
    1.08 + 10.94 / Math.sqrt(rotorReynolds) + 257.37 / rotorReynolds ** 1.5;
  const characteristicFactor = 1
    - 1.669 * sourcePowerNumber ** -3.945
    - 2.807 * (d32M / (columnDiameterM - rotorDiameterM)) ** 1.336
    - 1.159 * (compartmentHeightM / columnDiameterM) ** 2.049
    + 2.1 * STATOR_FREE_AREA ** 1.032;
  if (!(characteristicFactor > 0)) {
    throw new Error('NON_POSITIVE_GARTHE_CHARACTERISTIC_FACTOR');
  }
  const characteristicVelocityMS = terminal.velocityMS * characteristicFactor;
  const characteristicRe =
    continuous.densityKgM3 * characteristicVelocityMS * d32M
    / continuous.dynamicViscosityPaS;
  const characteristicDrag = myintDrag(characteristicRe, terminal.kappa, 0);
  const swarmVelocity = (holdup: number) => {
    const velocityResidual = (velocity: number) => {
      const re =
        continuous.densityKgM3 * velocity * d32M / continuous.dynamicViscosityPaS;
      const drag = myintDrag(re, terminal.kappa, 0);
      return velocity - characteristicVelocityMS
        * Math.sqrt(characteristicDrag / drag * (1 - holdup) ** 4.65);
    };
    return bisect(velocityResidual, 1e-14, characteristicVelocityMS);
  };

  const flowRatio = dispersed.flowM3S / continuous.flowM3S;
  const capacityAtHoldup = (holdup: number) =>
    (1 + flowRatio) * swarmVelocity(holdup)
    / (flowRatio / holdup + 1 / (1 - holdup));
  const flood = goldenMax(capacityAtHoldup, ROOT_BOUND, 1 - ROOT_BOUND);
  if (!(flood.value > 0 && flood.x > ROOT_BOUND && flood.x < 1 - ROOT_BOUND)) {
    throw new Error('NO_INTERIOR_FLOODING_MAXIMUM');
  }

  const continuousSuperficialVelocityMS = continuous.flowM3S / areaM2;
  const dispersedSuperficialVelocityMS = dispersed.flowM3S / areaM2;
  const residualAtHoldup = (holdup: number) =>
    swarmVelocity(holdup) - (
      dispersedSuperficialVelocityMS / holdup
      + continuousSuperficialVelocityMS / (1 - holdup)
    );
  const maximumResidualBelowFlood = residualAtHoldup(flood.x);

  const dragApplicability: string[] = [];
  const shapeApplicability: string[] = [];
  const dragCheck = (condition: boolean, code: string) => {
    if (!condition) dragApplicability.push(code);
  };
  const shapeCheck = (condition: boolean, code: string) => {
    if (!condition) shapeApplicability.push(code);
  };
  const log10Morton = Math.log10(terminal.morton);
  dragCheck(log10Morton > -11.6 && log10Morton < -0.9, `MYINT_DRAG_MORTON_EXTRAPOLATED:${log10Morton}`);
  dragCheck(terminal.re > 0.17 && terminal.re < 200, `MYINT_TERMINAL_RE_EXTRAPOLATED:${terminal.re}`);
  dragCheck(characteristicRe > 0.17 && characteristicRe < 200, `MYINT_CHARACTERISTIC_RE_EXTRAPOLATED:${characteristicRe}`);
  dragCheck(terminal.eotvos > 0.017 && terminal.eotvos < 12.1, `MYINT_DRAG_EOTVOS_EXTRAPOLATED:${terminal.eotvos}`);
  dragCheck(terminal.kappa > 0.1 && terminal.kappa < 100, `MYINT_DRAG_KAPPA_EXTRAPOLATED:${terminal.kappa}`);
  shapeCheck(log10Morton >= -11.6 && log10Morton <= -0.9, `MYINT_SHAPE_MORTON_EXTRAPOLATED:${log10Morton}`);
  shapeCheck(terminal.re >= 0.015 && terminal.re <= 850, `MYINT_SHAPE_RE_EXTRAPOLATED:${terminal.re}`);
  shapeCheck(terminal.eotvos >= 0.017 && terminal.eotvos <= 9.3, `MYINT_SHAPE_EOTVOS_EXTRAPOLATED:${terminal.eotvos}`);
  shapeCheck(terminal.taylor >= 0.0074 && terminal.taylor <= 3.6, `MYINT_SHAPE_TAYLOR_EXTRAPOLATED:${terminal.taylor}`);
  shapeCheck(terminal.kappa >= 0.1 && terminal.kappa <= 100, `MYINT_SHAPE_KAPPA_EXTRAPOLATED:${terminal.kappa}`);
  shapeCheck(terminal.aspectRatio > 0 && terminal.aspectRatio <= 1, `MYINT_SHAPE_NON_PHYSICAL:${terminal.aspectRatio}`);
  const applicabilityCodes = [...dragApplicability, ...shapeApplicability];
  const common = {
    engine: {
      id: 'kuhni_geometry_resolver' as const,
      version: KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
      implementationHash: KUHNI_GEOMETRY_RESOLVER_V110_HASH,
      dragModel: KUHNI_DRAG_MODEL_VERSION,
      extendsImplementationHash: KUHNI_GEOMETRY_RESOLVER_HASH,
    },
    input,
    floodHoldup: flood.x,
    maximumResidualBelowFlood,
    continuousSuperficialVelocityMS,
    dispersedSuperficialVelocityMS,
    characteristicVelocityMS,
    floodTotalSuperficialVelocityMS: flood.value,
    applicability: {
      status: applicabilityCodes.length
        ? 'CALCULATED_EXTRAPOLATED' as const
        : 'CALCULATED_IN_RANGE' as const,
      codes: applicabilityCodes,
      drag: dragApplicability,
      shape: shapeApplicability,
    },
    uncertainty: {
      classification: 'PRE_PILOT_PREDICTIVE_NOT_VENDOR_GUARANTEED' as const,
      operatingBranch: 'STABLE_LOW_HOLDUP' as const,
      statement:
        'Operating holdup is the low branch of the frozen Stage-3 closure; correlation applicability codes quantify model extrapolation, not measurement uncertainty.',
    },
  };

  if (!(maximumResidualBelowFlood > 0)) {
    return {
      ...common,
      status: 'HYDRAULICALLY_INFEASIBLE',
      operatingHoldup: null,
      residual: null,
      operatingSwarmVelocityMS: null,
      reason: 'NO_STABLE_LOW_HOLDUP_ROOT_BELOW_FLOODING_TURNING_POINT',
    };
  }

  const operatingHoldup = bisect(residualAtHoldup, ROOT_BOUND, flood.x);
  const residual = residualAtHoldup(operatingHoldup);
  return {
    ...common,
    status: 'OPERATING_HOLDUP_CALCULATED',
    operatingHoldup,
    residual,
    operatingSwarmVelocityMS: swarmVelocity(operatingHoldup),
    reason: null,
  };
}

/**
 * Extends the active V1.0.1 geometry result without changing its admission
 * rule or hydraulic envelope.  In particular, audit-only extrapolated trials
 * remain audit-only, but receive the same Stage-3 operating-state evaluation
 * as displayed trials.
 */
export function resolveKuhniGeometryV110(
  basis: HydrodynamicProcessBasis,
  theoreticalStages: TheoreticalStageAuthority,
) {
  const activeGeometry = resolveKuhniGeometry(basis, theoreticalStages);
  const enrichTrial = <T extends { columnDiameterM: number; rpm: number }>(trial: T) => ({
    ...trial,
    operatingHydraulics: resolveKuhniOperatingHoldupV110({
      processBasis: basis,
      columnDiameterM: trial.columnDiameterM,
      rpm: trial.rpm,
    }),
  });
  const hydraulicRpmEnvelope = activeGeometry.hydraulicRpmEnvelope.map(enrichTrial);
  const excludedExtrapolatedTrials = activeGeometry.excludedExtrapolatedTrials
    .map(enrichTrial);
  const { calculationHash: _activeCalculationHash, ...activeResult } = activeGeometry;
  const result = {
    ...activeResult,
    engine: {
      id: 'kuhni_geometry_resolver' as const,
      version: KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
      implementationHash: KUHNI_GEOMETRY_RESOLVER_V110_HASH,
      dragModel: KUHNI_DRAG_MODEL_VERSION,
      extendsImplementationHash: KUHNI_GEOMETRY_RESOLVER_HASH,
    },
    hydraulicRpmEnvelope,
    excludedExtrapolatedTrials,
    calculationReport: {
      ...activeGeometry.calculationReport,
      title: `${KUHNI_GEOMETRY_RESOLVER_V110_VERSION} calculation report`,
    },
  };
  return { ...result, calculationHash: kuhniRunHash(result) };
}