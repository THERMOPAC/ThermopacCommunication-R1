import { createHash } from 'node:crypto';
import type { HydrodynamicProcessBasis } from './kuhni-hydrodynamics';
import {
  KUHNI_GEOMETRY_RESOLVER_V130_HASH,
  KUHNI_GEOMETRY_RESOLVER_V130_VERSION,
  resolveKuhniGeometryV130,
} from './kuhni-geometry-resolver-v130';
import { kuhniRunHash } from './kuhni-hydrodynamics';
import type { TheoreticalStageAuthority } from './kuhni-geometry-resolver';

/**
 * V1.4.0 is a deliberately non-governing reverse-orientation diagnostic
 * route.  V1.3.0 and all earlier resolver artifacts remain immutable.  The
 * route evaluates the signed force balance and the existing pre-pilot
 * correlations with the selected RRBO/NMP phase properties, but it never
 * admits a reverse trial to the hydraulic envelope.  The correlation output
 * is retained as an explicitly extrapolated diagnostic so that a future
 * qualification can be compared without silently turning a numerical root
 * into a design diameter.
 */
export const KUHNI_GEOMETRY_RESOLVER_V140_VERSION = 'KUHNI_GEOMETRY_RESOLVER_V1.4.0';

const G = 9.80665;
const PI = Math.PI;
const ROTOR_TO_COLUMN = 0.5;
const COMPARTMENT_TO_COLUMN = 0.5;
const STATOR_FREE_AREA = 0.35;
const POWER_NUMBER = 1.2;
const DIRECT_TURBULENCE_C = 0.42;
const DESIGN_FLOOD_FRACTION = 0.7;
const MIN_RPM = 5;
const MAX_RPM = 60;
const RPM_STEP = 5;
const MAX_TIP_SPEED_MS = 4.5;
const MIN_ROTOR_DIAMETER_M = 0.05;
const MIN_COMPARTMENT_HEIGHT_M = 0.05;
const ROOT_BOUND = 1e-7;

const implementationDescriptors = [
  KUHNI_GEOMETRY_RESOLVER_V140_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V130_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V130_HASH,
  'reverse-orientation-signed-buoyancy-force-balance',
  'countercurrent-mapping:rrbo-upward-bottom-to-top|nmp-downward-top-to-bottom',
  'preliminary-only:never-admit-reverse-trial-or-diameter',
  'myint-garthe-reverse-extrapolation-explicitly-diagnostic',
  'fixed-stage3-geometry-design-nt-and-stage2-retained-separately',
  'actual-loading:total-flow-over-area-over-flood-capacity-velocity',
];

export const KUHNI_GEOMETRY_RESOLVER_V140_HASH = createHash('sha256')
  .update(implementationDescriptors.join('|'))
  .digest('hex');

export const KUHNI_REVERSE_ORIENTATION_CODES = {
  PRELIMINARY_ONLY: 'REVERSE_ORIENTATION_PRELIMINARY_ONLY',
  TRIAL_EXCLUDED: 'REVERSE_ORIENTATION_PRELIMINARY_TRIAL_EXCLUDED',
  NUMERICAL_TRIAL_FAILURE: 'REVERSE_ORIENTATION_TRIAL_NUMERICAL_FAILURE',
} as const;

type PhaseLike = {
  identity: string;
  flowM3S: number;
  densityKgM3: number;
  dynamicViscosityPaS: number;
};

type SignedTerminalState = {
  deltaRhoKgM3: number;
  buoyancyMagnitudeKgM3: number;
  buoyancyDirection: 'DISPERSED_UPWARD' | 'DISPERSED_DOWNWARD';
  relativeVelocityMS: number;
  relativeVelocityMagnitudeMS: number;
  re: number;
  dragCoefficient: number;
  eotvos: number;
  morton: number;
  kappa: number;
  taylor: number;
  aspectRatio: number;
  signedBuoyancyForceN: number;
  buoyancyForceMagnitudeN: number;
  signedDragForceN: number;
  dragForceMagnitudeN: number;
  forceBalanceResidualN: number;
};

type ReverseTrialDiagnostic = {
  rpm: number;
  columnDiameterM: number;
  rotorDiameterM: number;
  compartmentHeightM: number;
  tipSpeedMS: number;
  powerW: number;
  powerVolumeWM3: number;
  psiWKg: number;
  d32M: number;
  rotorReynolds: number;
  sourcePowerNumber: number;
  characteristicFactor: number;
  characteristicVelocityMS: number;
  characteristicVelocityMagnitudeMS: number;
  characteristicRe: number;
  floodHoldup: number;
  floodTotalSuperficialVelocityMS: number;
  swarmVelocityAtFloodMS: number;
  swarmVelocityAtFloodMagnitudeMS: number;
  swarmRe: number;
  actualLoading: number;
  designFloodFraction: number;
  hydraulicPass: false;
  continuousSuperficialVelocityMS: number;
  dispersedSuperficialVelocityMS: number;
  countercurrentAtFlood: {
    holdup: number;
    continuousVelocityMS: number;
    dispersedVelocityMS: number;
    relativeVelocityMS: number;
    velocityEquation: string;
  };
  terminal: SignedTerminalState;
  phaseProperties: {
    continuous: PhaseLike;
    dispersed: PhaseLike;
  };
  applicability: {
    status: 'CALCULATED_EXTRAPOLATED';
    codes: string[];
    drag: string[];
    shape: string[];
    closure: string[];
  };
  status: 'CALCULATED_EXTRAPOLATED';
};

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

/**
 * Myint's clean-drop drag expression is kept here only as a numerical
 * diagnostic.  The sign is not hidden in the drag expression: drag uses the
 * positive speed magnitude and the signed relative velocity is applied in the
 * force balance below.
 */
function myintDrag(re: number, kappa: number, lambda: number) {
  if (!(re > 0) || !(kappa > 0) || lambda < 0) throw new Error('INVALID_MYINT_STATE');
  return 8 * (2 + 3 * kappa + 3 * lambda) / (re * (1 + kappa + lambda))
    * (1 + 0.15 * re ** 0.687);
}

/**
 * The only reverse-orientation terminal relation that is independently
 * derived in the evidence record is:
 *
 *   0 = (rhoC-rhoD)Vg - 0.5 rhoC Cd Ap |w|w
 *   sign(w) = sign(rhoC-rhoD)
 *
 * The Myint Cd root below is therefore labelled extrapolated; it does not
 * claim that a reverse RRBO/NMP drop is covered by that source.
 */
function signedTerminalState(
  diameterM: number,
  rhoC: number,
  rhoD: number,
  muC: number,
  muD: number,
  sigma: number,
): SignedTerminalState {
  const deltaRho = rhoC - rhoD;
  const buoyancyMagnitude = Math.abs(deltaRho);
  if (!(diameterM > 0 && buoyancyMagnitude > 0 && sigma > 0 && muC > 0 && muD > 0)) {
    throw new Error('NON_PHYSICAL_SIGNED_TERMINAL_INPUT');
  }
  const kappa = muD / muC;
  const archimedes = rhoC * buoyancyMagnitude * G * diameterM ** 3 / muC ** 2;
  const dragResidual = (re: number) =>
    myintDrag(re, kappa, 0) * re ** 2 - 4 * archimedes / 3;
  let high = 1;
  while (dragResidual(high) < 0 && high < 1e7) high *= 2;
  const re = bisect(dragResidual, 1e-12, high);
  const dragCoefficient = myintDrag(re, kappa, 0);
  const relativeVelocityMagnitudeMS = re * muC / (rhoC * diameterM);
  const direction = Math.sign(deltaRho);
  const relativeVelocityMS = direction * relativeVelocityMagnitudeMS;
  const projectedAreaM2 = PI * diameterM ** 2 / 4;
  const volumeM3 = PI * diameterM ** 3 / 6;
  const signedBuoyancyForceN = deltaRho * volumeM3 * G;
  const signedDragForceN = 0.5 * rhoC * dragCoefficient * projectedAreaM2
    * Math.abs(relativeVelocityMS) * relativeVelocityMS;
  const eotvos = buoyancyMagnitude * G * diameterM ** 2 / sigma;
  const morton = G * muC ** 4 * buoyancyMagnitude / (rhoC ** 2 * sigma ** 3);
  const taylor = re * morton ** 0.23;
  const aspectRatio = 1 - 0.0487 * taylor - 0.0289 * taylor ** 2;
  return {
    deltaRhoKgM3: deltaRho,
    buoyancyMagnitudeKgM3: buoyancyMagnitude,
    buoyancyDirection: deltaRho > 0 ? 'DISPERSED_UPWARD' : 'DISPERSED_DOWNWARD',
    relativeVelocityMS,
    relativeVelocityMagnitudeMS,
    re,
    dragCoefficient,
    eotvos,
    morton,
    kappa,
    taylor,
    aspectRatio,
    signedBuoyancyForceN,
    buoyancyForceMagnitudeN: Math.abs(signedBuoyancyForceN),
    signedDragForceN,
    dragForceMagnitudeN: Math.abs(signedDragForceN),
    forceBalanceResidualN: signedBuoyancyForceN - signedDragForceN,
  };
}

function selectReversePhases(basis: HydrodynamicProcessBasis) {
  return {
    continuous: basis.rrboFeed,
    dispersed: basis.wetSolventPhase,
  };
}

function reverseTrial(
  columnDiameterM: number,
  rpm: number,
  basis: HydrodynamicProcessBasis,
): ReverseTrialDiagnostic {
  const { continuous, dispersed } = selectReversePhases(basis);
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

  const terminal = signedTerminalState(
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
  const characteristicVelocityMagnitudeMS = terminal.relativeVelocityMagnitudeMS * characteristicFactor;
  const characteristicRe =
    continuous.densityKgM3 * characteristicVelocityMagnitudeMS * d32M
    / continuous.dynamicViscosityPaS;
  const characteristicDrag = myintDrag(characteristicRe, terminal.kappa, 0);
  const swarmVelocityMagnitude = (holdup: number) => {
    const velocityResidual = (velocity: number) => {
      const re =
        continuous.densityKgM3 * velocity * d32M / continuous.dynamicViscosityPaS;
      const drag = myintDrag(re, terminal.kappa, 0);
      return velocity - characteristicVelocityMagnitudeMS
        * Math.sqrt(characteristicDrag / drag * (1 - holdup) ** 4.65);
    };
    return bisect(velocityResidual, 1e-14, characteristicVelocityMagnitudeMS);
  };

  const flowRatio = dispersed.flowM3S / continuous.flowM3S;
  const capacityAtHoldup = (holdup: number) =>
    (1 + flowRatio) * swarmVelocityMagnitude(holdup)
    / (flowRatio / holdup + 1 / (1 - holdup));
  const flood = goldenMax(capacityAtHoldup, ROOT_BOUND, 1 - ROOT_BOUND);
  if (!(flood.value > 0 && flood.x > ROOT_BOUND && flood.x < 1 - ROOT_BOUND)) {
    throw new Error('NO_INTERIOR_FLOODING_MAXIMUM');
  }

  const continuousSuperficialVelocityMS = continuous.flowM3S / areaM2;
  const dispersedSuperficialVelocityMS = -dispersed.flowM3S / areaM2;
  const continuousVelocityMS = continuousSuperficialVelocityMS / (1 - flood.x);
  const dispersedVelocityMS = dispersedSuperficialVelocityMS / flood.x;
  const signedRelativeVelocityMS = dispersedVelocityMS - continuousVelocityMS;
  const dragApplicability: string[] = [
    'REVERSE_ORIENTATION_MYINT_DRAG_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION',
  ];
  const shapeApplicability: string[] = [
    'REVERSE_ORIENTATION_MYINT_SHAPE_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION',
  ];
  const closureApplicability: string[] = [
    'REVERSE_ORIENTATION_GARTHE_CHARACTERISTIC_VELOCITY_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION',
    'REVERSE_ORIENTATION_SWARM_HOLDUP_CLOSURE_UNQUALIFIED',
    'REVERSE_ORIENTATION_FLOODING_CLOSURE_UNQUALIFIED',
  ];
  const log10Morton = Math.log10(terminal.morton);
  const dragCheck = (condition: boolean, code: string) => {
    if (!condition) dragApplicability.push(code);
  };
  const shapeCheck = (condition: boolean, code: string) => {
    if (!condition) shapeApplicability.push(code);
  };
  dragCheck(log10Morton > -11.6 && log10Morton < -0.9, `MYINT_DRAG_MORTON_EXTRAPOLATED:${log10Morton}`);
  dragCheck(terminal.re > 0.17 && terminal.re < 200, `MYINT_TERMINAL_RE_EXTRAPOLATED:${terminal.re}`);
  dragCheck(characteristicRe > 0.17 && characteristicRe < 200, `MYINT_CHARACTERISTIC_RE_EXTRAPOLATED:${characteristicRe}`);
  dragCheck(terminal.eotvos > 0.017 && terminal.eotvos < 12.1, `MYINT_DRAG_EOTVOS_EXTRAPOLATED:${terminal.eotvos}`);
  dragCheck(terminal.kappa > 0.1 && terminal.kappa < 100, `MYINT_DRAG_KAPPA_EXTRAPOLATED:${terminal.kappa}`);
  const swarmRe = continuous.densityKgM3 * swarmVelocityMagnitude(flood.x) * d32M
    / continuous.dynamicViscosityPaS;
  dragCheck(swarmRe > 0.17 && swarmRe < 200, `MYINT_SWARM_RE_EXTRAPOLATED:${swarmRe}`);
  shapeCheck(log10Morton >= -11.6 && log10Morton <= -0.9, `MYINT_SHAPE_MORTON_EXTRAPOLATED:${log10Morton}`);
  shapeCheck(terminal.re >= 0.015 && terminal.re <= 850, `MYINT_SHAPE_RE_EXTRAPOLATED:${terminal.re}`);
  shapeCheck(terminal.eotvos >= 0.017 && terminal.eotvos <= 9.3, `MYINT_SHAPE_EOTVOS_EXTRAPOLATED:${terminal.eotvos}`);
  shapeCheck(terminal.taylor >= 0.0074 && terminal.taylor <= 3.6, `MYINT_SHAPE_TAYLOR_EXTRAPOLATED:${terminal.taylor}`);
  shapeCheck(terminal.kappa >= 0.1 && terminal.kappa <= 100, `MYINT_SHAPE_KAPPA_EXTRAPOLATED:${terminal.kappa}`);
  shapeCheck(terminal.aspectRatio > 0 && terminal.aspectRatio <= 1, `MYINT_SHAPE_NON_PHYSICAL:${terminal.aspectRatio}`);

  return {
    rpm,
    columnDiameterM,
    rotorDiameterM,
    compartmentHeightM,
    tipSpeedMS,
    powerW,
    powerVolumeWM3: powerW / (areaM2 * compartmentHeightM),
    psiWKg,
    d32M,
    rotorReynolds,
    sourcePowerNumber,
    characteristicFactor,
    characteristicVelocityMS: Math.sign(terminal.relativeVelocityMS) * characteristicVelocityMagnitudeMS,
    characteristicVelocityMagnitudeMS,
    characteristicRe,
    floodHoldup: flood.x,
    floodTotalSuperficialVelocityMS: flood.value,
    swarmVelocityAtFloodMS: Math.sign(terminal.relativeVelocityMS) * swarmVelocityMagnitude(flood.x),
    swarmVelocityAtFloodMagnitudeMS: swarmVelocityMagnitude(flood.x),
    swarmRe,
    actualLoading: (continuous.flowM3S + dispersed.flowM3S)
      / (areaM2 * flood.value),
    designFloodFraction: DESIGN_FLOOD_FRACTION,
    hydraulicPass: false,
    continuousSuperficialVelocityMS,
    dispersedSuperficialVelocityMS,
    countercurrentAtFlood: {
      holdup: flood.x,
      continuousVelocityMS,
      dispersedVelocityMS,
      relativeVelocityMS: signedRelativeVelocityMS,
      velocityEquation: 'uC=+jC/(1-h), uD=-jD/h, w=uD-uC=-(jD/h+jC/(1-h))',
    },
    terminal,
    phaseProperties: { continuous, dispersed },
    applicability: {
      status: 'CALCULATED_EXTRAPOLATED',
      codes: [...dragApplicability, ...shapeApplicability, ...closureApplicability],
      drag: dragApplicability,
      shape: shapeApplicability,
      closure: closureApplicability,
    },
    status: 'CALCULATED_EXTRAPOLATED',
  };
}

function reverseDiameterForRpm(rpm: number, basis: HydrodynamicProcessBasis) {
  const physicalMinimumM = Math.max(
    MIN_ROTOR_DIAMETER_M / ROTOR_TO_COLUMN,
    MIN_COMPARTMENT_HEIGHT_M / COMPARTMENT_TO_COLUMN,
  );
  const tipDerivedMaximumM = MAX_TIP_SPEED_MS * 60 / (PI * ROTOR_TO_COLUMN * rpm);
  if (!(tipDerivedMaximumM > physicalMinimumM)) throw new Error('NO_REVERSE_DIAMETER_SEARCH_INTERVAL');
  const samples: Array<{ diameter: number; residual: number }> = [];
  for (let i = 0; i <= 30; i += 1) {
    const diameter = physicalMinimumM * (tipDerivedMaximumM / physicalMinimumM) ** (i / 30);
    try {
      const value = reverseTrial(diameter, rpm, basis).actualLoading - DESIGN_FLOOD_FRACTION;
      if (Number.isFinite(value)) samples.push({ diameter, residual: value });
    } catch {
      // The rejected RPM record below preserves a numerical domain failure;
      // it is never converted into a fallback diameter.
    }
  }
  let bracket: [number, number] | null = null;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i - 1].residual * samples[i].residual <= 0) {
      bracket = [samples[i - 1].diameter, samples[i].diameter];
      break;
    }
  }
  if (!bracket) throw new Error('NO_REVERSE_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS');
  const diameter = bisect(
    (value) => reverseTrial(value, rpm, basis).actualLoading - DESIGN_FLOOD_FRACTION,
    bracket[0],
    bracket[1],
  );
  return {
    ...reverseTrial(diameter, rpm, basis),
    searchBounds: {
      physicalMinimumM,
      tipDerivedMaximumM,
      basis: 'rotor/compartment source minima and 4.5 m/s tip-speed ceiling',
    },
  };
}

function isReverseOrientation(basis: HydrodynamicProcessBasis): boolean {
  return basis.phaseConfiguration === 'rrbo-continuous-nmp-dispersed';
}

/**
 * Resolve V1.4.0.  Supported heavy-continuous inputs are delegated to V1.3.0
 * unchanged except for the immutable version wrapper.  The reverse route is
 * intentionally diagnostic-only: roots are retained under
 * excludedExtrapolatedTrials and reverseOrientationDiagnostics, never under
 * hydraulicRpmEnvelope or hydraulicDiagnosticPoint.
 */
export function resolveKuhniGeometryV140(
  basis: HydrodynamicProcessBasis,
  theoreticalStages: TheoreticalStageAuthority,
) {
  const historical = resolveKuhniGeometryV130(basis, theoreticalStages);
  // V1.2/V1.3 validate densities, flows, viscosities and interfacial tension
  // before the reverse route.  Equal or nonphysical properties must remain a
  // closed prerequisite, not become a signed numerical extrapolation.
  if (
    !isReverseOrientation(basis)
    || historical.hydraulicPrerequisite?.code !== 'CONTINUOUS_PHASE_MUST_BE_HEAVIER'
  ) {
    const { calculationHash: _historicalCalculationHash, ...historicalPayload } = historical;
    const result = {
      ...historicalPayload,
      engine: {
        ...historical.engine,
        version: KUHNI_GEOMETRY_RESOLVER_V140_VERSION,
        implementationHash: KUHNI_GEOMETRY_RESOLVER_V140_HASH,
        extendsImplementationHash: KUHNI_GEOMETRY_RESOLVER_V130_HASH,
      },
    };
    return { ...result, calculationHash: kuhniRunHash(result) };
  }

  const diagnostics: ReverseTrialDiagnostic[] = [];
  const rejectedRpmTrials: Array<{ rpm: number; reason: string; message: string }> = [];
  for (let rpm = MIN_RPM; rpm <= MAX_RPM; rpm += RPM_STEP) {
    try {
      diagnostics.push(reverseDiameterForRpm(rpm, basis));
    } catch (error) {
      const reason = error instanceof Error
        ? error.message
        : KUHNI_REVERSE_ORIENTATION_CODES.NUMERICAL_TRIAL_FAILURE;
      rejectedRpmTrials.push({
        rpm,
        reason,
        message: `Reverse-orientation preliminary trial was not numerically evaluable at ${rpm} RPM; no fallback diameter was retained.`,
      });
    }
  }
  const reverseMessage =
    'RRBO-continuous / downward NMP is evaluated only as a preliminary diagnostic. '
    + 'Signed buoyancy and countercurrent mapping are derived, but reverse drop shape/drag, swarm holdup, '
    + 'flooding and phase-control closures are not qualified for this RRBO/NMP service. '
    + 'All numerical trials are empirical extrapolations and are excluded from hydraulic diameter admission.';
  const { calculationHash: _historicalCalculationHash, ...historicalPayload } = historical;
  const phaseMetadata = {
    ...historical.phaseMetadata,
    reversePreliminaryMapping: {
      status: 'PROPOSED_PRELIMINARY_NOT_GOVERNED',
      continuousPhase: 'RRBO',
      continuousDirection: 'UPWARD',
      continuousInlet: 'BOTTOM',
      continuousOutlet: 'TOP',
      dispersedPhase: 'NMP',
      dispersedDirection: 'DOWNWARD',
      dispersedInlet: 'TOP',
      dispersedOutlet: 'BOTTOM',
      velocityConvention: 'uC=+jC/(1-h), uD=-jD/h, w=uD-uC',
    },
    reversePreliminaryClosure: {
      signedBuoyancyEquation: '0=(rhoC-rhoD)Vg-0.5*rhoC*Cd*Ap*|w|w; sign(w)=sign(rhoC-rhoD)',
      buoyancyMagnitudeEquation: '|B|=|rhoC-rhoD|*V*g; B_signed=(rhoC-rhoD)*V*g',
      countercurrentVelocityEquation: 'uC=+jC/(1-h), uD=-jD/h, w=-(jD/h+jC/(1-h))',
      signedDensityDifferenceKgM3: basis.rrboFeed.densityKgM3 - basis.wetSolventPhase.densityKgM3,
      status: 'PRELIMINARY_EXTRAPOLATION_ONLY',
      noDiameterAdmission: true,
      unsupportedEmpiricalClosures: [
        'REVERSE_ORIENTATION_MYINT_DRAG_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION',
        'REVERSE_ORIENTATION_MYINT_SHAPE_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION',
        'REVERSE_ORIENTATION_GARTHE_CHARACTERISTIC_VELOCITY_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION',
        'REVERSE_ORIENTATION_SWARM_HOLDUP_CLOSURE_UNQUALIFIED',
        'REVERSE_ORIENTATION_FLOODING_CLOSURE_UNQUALIFIED',
      ],
    },
  };
  const result = {
    ...historicalPayload,
    status: 'PRELIMINARY_REVERSE_ORIENTATION_DIAGNOSTICS' as const,
    engine: {
      ...historical.engine,
      version: KUHNI_GEOMETRY_RESOLVER_V140_VERSION,
      implementationHash: KUHNI_GEOMETRY_RESOLVER_V140_HASH,
      extendsImplementationHash: KUHNI_GEOMETRY_RESOLVER_V130_HASH,
    },
    hydraulicPrerequisite: {
      code: KUHNI_REVERSE_ORIENTATION_CODES.PRELIMINARY_ONLY,
      message: reverseMessage,
    },
    phaseMetadata,
    rootFailureReason: {
      code: KUHNI_REVERSE_ORIENTATION_CODES.PRELIMINARY_ONLY,
      message: 'No reverse-orientation preliminary trial is admissible as a governed hydraulic diameter; inspect reverseOrientationDiagnostics for excluded diagnostics.',
    },
    hydraulicRpmEnvelope: [],
    excludedExtrapolatedTrialCount: diagnostics.length,
    excludedExtrapolatedTrials: diagnostics,
    resultAdmissionRule: 'ONLY_CALCULATED_IN_RANGE_TRIALS_ARE_DISPLAYED_OR_USED_FOR_THE_HYDRAULIC_DIAGNOSTIC; REVERSE_ORIENTATION_PRELIMINARY_TRIALS_ARE_ALWAYS_EXCLUDED',
    hydraulicDiagnosticPoint: null,
    hydraulicResolvedColumnDiameterM: null,
    resolvedColumnDiameterM: null,
    finalOperatingRpm: null,
    physicalCompartments: null,
    activeHeightM: null,
    reverseOrientationDiagnostics: {
      status: 'PRELIMINARY_EXTRAPOLATION_ONLY',
      trialCount: diagnostics.length,
      rejectedTrialCount: rejectedRpmTrials.length,
      rejectedTrials: rejectedRpmTrials,
      excludedFromHydraulicEnvelope: true,
      noGovernedDiameter: true,
      selectedPhaseProperties: {
        continuous: historical.phaseMetadata.continuousPhase,
        dispersed: historical.phaseMetadata.dispersedPhase,
      },
      signedBuoyancy: {
        deltaRhoKgM3: basis.rrboFeed.densityKgM3 - basis.wetSolventPhase.densityKgM3,
        magnitudeKgM3: Math.abs(basis.rrboFeed.densityKgM3 - basis.wetSolventPhase.densityKgM3),
        direction: 'DISPERSED_DOWNWARD',
        equation: '0=(rhoC-rhoD)Vg-0.5*rhoC*Cd*Ap*|w|w',
        magnitudeEquation: '|B|=|rhoC-rhoD|*V*g; B_signed=(rhoC-rhoD)*V*g',
      },
      countercurrentMapping: phaseMetadata.reversePreliminaryMapping,
      equationLimits: [
        'The signed force balance is analytical and is not a reverse Kühni flooding qualification.',
        'Myint clean-drop drag and shape are outside their demonstrated phase/orientation evidence here; each trial is CALCULATED_EXTRAPOLATED.',
        'Garthe characteristic velocity, swarm holdup, flooding and phase-control closures have no qualified RRBO-continuous/downward-NMP reverse route.',
      ],
      trials: diagnostics,
    },
    rejectedRpmTrials,
    blockers: [
      ...(historical.blockers ?? []),
      KUHNI_REVERSE_ORIENTATION_CODES.PRELIMINARY_ONLY,
      reverseMessage,
    ],
    evidence: {
      ...historical.evidence,
      extrapolationRule: 'Reverse numerical diagnostics are retained as preliminary CALCULATED_EXTRAPOLATED records only; no reverse record is admitted as a calculated-in-range hydraulic result.',
      phaseOrientation: {
        status: 'PRELIMINARY_REVERSE_ORIENTATION_EXCLUDED',
        sourceOrientation: phaseMetadata.sourceApplicability.sourceOrientation,
        message: reverseMessage,
      },
      reverseSignedBuoyancy: 'Derived force balance: 0=(rhoC-rhoD)Vg-0.5*rhoC*Cd*Ap*|w|w; for denser NMP, delta rho<0 and w<0.',
      reverseCountercurrentMapping: 'Proposed diagnostic mapping only: RRBO continuous upward from bottom to top; NMP dispersed downward from top to bottom.',
    },
    calculationReport: {
      ...historical.calculationReport,
      title: `${KUHNI_GEOMETRY_RESOLVER_V140_VERSION} calculation report`,
      hydraulicResolvedColumnDiameterM: null,
      hydraulicDiagnosticRpm: null,
      hydraulicRpmRange: null,
      finalOperatingRpm: null,
      physicalCompartments: null,
      activeHeightM: null,
      disposition: 'Reverse-orientation preliminary diagnostics retained; no governed hydraulic diameter, RPM, or Stage-3 geometry was admitted.',
    },
  };
  return { ...result, calculationHash: kuhniRunHash(result) };
}

export type KuhniGeometryV140Result = ReturnType<typeof resolveKuhniGeometryV140>;