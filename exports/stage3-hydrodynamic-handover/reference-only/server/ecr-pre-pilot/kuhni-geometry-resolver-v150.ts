import { createHash } from 'node:crypto';
import type { HydrodynamicProcessBasis } from './kuhni-hydrodynamics';
import {
  KUHNI_GEOMETRY_RESOLVER_V140_HASH,
  KUHNI_GEOMETRY_RESOLVER_V140_VERSION,
  resolveKuhniGeometryV140,
} from './kuhni-geometry-resolver-v140';
import type { TheoreticalStageAuthority } from './kuhni-geometry-resolver';
import { kuhniRunHash } from './kuhni-hydrodynamics';

/**
 * V1.5.0 adds an explicitly assumption-based illustrative model root to the
 * reverse-orientation diagnostic route.  It does not change V1.4.0, does not
 * reclassify any source-range warning, and never places the point in the
 * calculated-in-range hydraulic envelope.  The point is deliberately kept in
 * a separate namespace so Stage 4's governed input contract continues to
 * fail closed.
 */
export const KUHNI_GEOMETRY_RESOLVER_V150_VERSION = 'KUHNI_GEOMETRY_RESOLVER_V1.5.0';

const G = 9.80665;
const PI = Math.PI;
const MAX_TIP_SPEED_MS = 4.5;
const DESIGN_FLOOD_FRACTION = 0.7;
const FORCE_BALANCE_RELATIVE_TOLERANCE = 1e-8;
const LOADING_CLOSURE_TOLERANCE = 1e-6;
const MIN_POSITIVE_HOLDUP = 1e-7;

const implementationDescriptors = [
  KUHNI_GEOMETRY_RESOLVER_V150_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V140_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V140_HASH,
  'reverse-extrapolated-model-root-separate-from-governed-envelope',
  'physical-domain-gates:properties|geometry|d32|force-closure|shape|holdup|mass-flux',
  'numerical-gates:loading-root|countercurrent-signs|finite-positive-states',
  'source-range-warnings-retained-and-never-reclassified-in-range',
  'selection:min-diameter-then-rpm-among-extrapolated-model-roots-for-illustration-only',
  'stage4-governed-input:hydraulicDiagnosticPoint-remains-null',
  'fixed-stage3-geometry-design-nt-and-stage2-retained-separately',
];

export const KUHNI_GEOMETRY_RESOLVER_V150_HASH = createHash('sha256')
  .update(implementationDescriptors.join('|'))
  .digest('hex');

const MANDATORY_EXTRAPOLATION_WARNINGS = [
  'REVERSE_ORIENTATION_MYINT_DRAG_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION',
  'REVERSE_ORIENTATION_MYINT_SHAPE_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION',
  'REVERSE_ORIENTATION_GARTHE_CHARACTERISTIC_VELOCITY_UNSUPPORTED_EMPIRICAL_EXTRAPOLATION',
  'REVERSE_ORIENTATION_SWARM_HOLDUP_CLOSURE_UNQUALIFIED',
  'REVERSE_ORIENTATION_FLOODING_CLOSURE_UNQUALIFIED',
] as const;

type PhaseLike = {
  identity: string;
  flowM3S: number;
  densityKgM3: number;
  dynamicViscosityPaS: number;
};

type ReverseTrial = Record<string, any>;

export type ReverseExtrapolatedModelRootAssessment = {
  status: 'EXTRAPOLATED_MODEL_ROOT' | 'BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE';
  sourceQualification: 'CALCULATED_EXTRAPOLATED';
  physicalDomain: {
    status: 'PASS' | 'FAIL';
    failures: string[];
  };
  numericalClosure: {
    status: 'PASS' | 'FAIL';
    failures: string[];
    forceBalanceResidualRelative: number | null;
    primitiveForceBalanceResidualRelative: number | null;
    loadingResidual: number | null;
    primitiveLoadingResidual: number | null;
    loadingTolerance: number;
  };
  selectedProperties: {
    status: 'PASS' | 'FAIL';
    failures: string[];
    continuous: PhaseLike | null;
    dispersed: PhaseLike | null;
  };
  shape: {
    status: 'PASS' | 'FAIL';
    failures: string[];
    aspectRatio: number | null;
  };
  holdup: {
    status: 'PASS' | 'FAIL';
    failures: string[];
    floodHoldup: number | null;
  };
  massFlux: {
    status: 'PASS' | 'FAIL';
    failures: string[];
    continuousKgM2S: number | null;
    dispersedKgM2S: number | null;
    totalKgM2S: number | null;
  };
  evidenceQualification: {
    status: 'PASS' | 'FAIL';
    requiredWarnings: string[];
    presentWarnings: string[];
    missingWarnings: string[];
    requiredStatus: 'CALCULATED_EXTRAPOLATED';
    trialStatus: string | null;
    applicabilityStatus: string | null;
    statusFailures: string[];
  };
  warnings: string[];
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positiveFinite(value: unknown): value is number {
  return finite(value) && value > 0;
}

function checkPositive(
  failures: string[],
  value: unknown,
  code: string,
) {
  if (!positiveFinite(value)) failures.push(code);
}

function checkFinite(
  failures: string[],
  value: unknown,
  code: string,
) {
  if (!finite(value)) failures.push(code);
}

function closeEnough(actual: unknown, expected: number, absoluteTolerance = 1e-10, relativeTolerance = 1e-8) {
  return finite(actual)
    && Math.abs(actual - expected)
      <= Math.max(absoluteTolerance, relativeTolerance * Math.max(Math.abs(expected), 1));
}

function selectedPhase(
  trial: ReverseTrial,
  basis: HydrodynamicProcessBasis,
) {
  const continuous = trial.phaseProperties?.continuous as PhaseLike | undefined;
  const dispersed = trial.phaseProperties?.dispersed as PhaseLike | undefined;
  const expectedContinuous = basis.rrboFeed;
  const expectedDispersed = basis.wetSolventPhase;
  const failures: string[] = [];
  const validate = (
    actual: PhaseLike | undefined,
    expected: PhaseLike,
    prefix: string,
  ) => {
    if (!actual) {
      failures.push(`${prefix}_PROPERTY_RECORD_MISSING`);
      return;
    }
    if (actual.identity !== expected.identity) {
      failures.push(`${prefix}_IDENTITY_MISMATCH`);
    }
    for (const [key, value] of [
      ['FLOW_M3S', actual.flowM3S],
      ['DENSITY_KG_M3', actual.densityKgM3],
      ['DYNAMIC_VISCOSITY_PA_S', actual.dynamicViscosityPaS],
    ] as const) {
      if (!positiveFinite(value)) failures.push(`${prefix}_${key}_NON_PHYSICAL`);
    }
    if (
      actual.flowM3S !== expected.flowM3S
      || actual.densityKgM3 !== expected.densityKgM3
      || actual.dynamicViscosityPaS !== expected.dynamicViscosityPaS
    ) {
      failures.push(`${prefix}_PROPERTY_SNAPSHOT_MISMATCH`);
    }
  };
  validate(continuous, expectedContinuous, 'CONTINUOUS');
  validate(dispersed, expectedDispersed, 'DISPERSED');
  return {
    continuous: continuous ?? null,
    dispersed: dispersed ?? null,
    expectedContinuous,
    expectedDispersed,
    failures,
  };
}

/**
 * Check whether a V1.4 reverse trial is internally invariant under the
 * explicitly stated extrapolation assumptions. Correlation applicability is
 * intentionally not converted into physical feasibility: required warnings
 * are fail-closed and every passing result remains an extrapolated model root.
 */
export function assessReverseExtrapolatedModelRoot(
  trial: ReverseTrial,
  basis: HydrodynamicProcessBasis,
): ReverseExtrapolatedModelRootAssessment {
  const properties = selectedPhase(trial, basis);
  const physicalFailures: string[] = [];
  const numericalFailures: string[] = [];
  const shapeFailures: string[] = [];
  const holdupFailures: string[] = [];
  const massFluxFailures: string[] = [];
  const terminal = trial.terminal ?? {};
  const sourceWarnings = Array.isArray(trial.applicability?.codes)
    ? trial.applicability.codes.map(String)
    : ['REVERSE_ORIENTATION_SOURCE_APPLICABILITY_NOT_RECORDED'];
  const missingWarnings = MANDATORY_EXTRAPOLATION_WARNINGS
    .filter((warning) => !sourceWarnings.includes(warning));
  const trialStatus = typeof trial.status === 'string' ? trial.status : null;
  const applicabilityStatus =
    typeof trial.applicability?.status === 'string' ? trial.applicability.status : null;
  const statusFailures = [
    ...(trialStatus === 'CALCULATED_EXTRAPOLATED' ? [] : ['TRIAL_STATUS_NOT_CALCULATED_EXTRAPOLATED']),
    ...(applicabilityStatus === 'CALCULATED_EXTRAPOLATED' ? [] : ['APPLICABILITY_STATUS_NOT_CALCULATED_EXTRAPOLATED']),
  ];
  const warnings = [
    ...sourceWarnings,
    ...missingWarnings.map((warning) => `MANDATORY_WARNING_MISSING:${warning}`),
  ];

  if (!positiveFinite(basis.interfacialTensionNM)) {
    physicalFailures.push('INTERFACIAL_TENSION_NON_PHYSICAL');
  }
  physicalFailures.push(...properties.failures);

  checkPositive(physicalFailures, trial.columnDiameterM, 'COLUMN_DIAMETER_NON_PHYSICAL');
  checkPositive(physicalFailures, trial.rotorDiameterM, 'ROTOR_DIAMETER_NON_PHYSICAL');
  checkPositive(physicalFailures, trial.compartmentHeightM, 'COMPARTMENT_HEIGHT_NON_PHYSICAL');
  if (
    positiveFinite(trial.rotorDiameterM)
    && positiveFinite(trial.columnDiameterM)
    && trial.rotorDiameterM >= trial.columnDiameterM
  ) {
    physicalFailures.push('ROTOR_DIAMETER_NOT_BELOW_COLUMN_DIAMETER');
  }
  checkPositive(physicalFailures, trial.d32M, 'D32_NON_PHYSICAL');
  if (
    positiveFinite(trial.d32M)
    && positiveFinite(trial.columnDiameterM)
    && positiveFinite(trial.rotorDiameterM)
    && trial.d32M >= trial.columnDiameterM - trial.rotorDiameterM
  ) {
    physicalFailures.push('D32_NOT_BELOW_ROTOR_CLEARANCE');
  }
  checkPositive(physicalFailures, trial.powerW, 'POWER_NON_PHYSICAL');
  checkPositive(physicalFailures, trial.powerVolumeWM3, 'POWER_VOLUME_NON_PHYSICAL');
  checkPositive(physicalFailures, trial.psiWKg, 'SPECIFIC_POWER_NON_PHYSICAL');
  if (!finite(trial.tipSpeedMS) || trial.tipSpeedMS <= 0) {
    physicalFailures.push('TIP_SPEED_NON_PHYSICAL');
  } else if (trial.tipSpeedMS > MAX_TIP_SPEED_MS) {
    physicalFailures.push('TIP_SPEED_LIMIT_EXCEEDED');
  }

  checkPositive(numericalFailures, trial.rpm, 'RPM_NON_PHYSICAL');
  checkPositive(numericalFailures, trial.rotorReynolds, 'ROTOR_REYNOLDS_NON_POSITIVE');
  checkPositive(numericalFailures, terminal.re, 'TERMINAL_RE_NOT_POSITIVE');
  checkPositive(numericalFailures, terminal.dragCoefficient, 'TERMINAL_DRAG_NOT_POSITIVE');
  checkPositive(numericalFailures, terminal.eotvos, 'TERMINAL_EOTVOS_NOT_POSITIVE');
  checkPositive(numericalFailures, terminal.morton, 'TERMINAL_MORTON_NOT_POSITIVE');
  checkPositive(numericalFailures, terminal.kappa, 'TERMINAL_KAPPA_NOT_POSITIVE');
  checkPositive(numericalFailures, terminal.taylor, 'TERMINAL_TAYLOR_NOT_POSITIVE');
  checkPositive(numericalFailures, trial.characteristicRe, 'CHARACTERISTIC_RE_NOT_POSITIVE');
  checkPositive(numericalFailures, trial.swarmRe, 'SWARM_RE_NOT_POSITIVE');
  checkPositive(numericalFailures, trial.characteristicVelocityMagnitudeMS, 'CHARACTERISTIC_SPEED_NOT_POSITIVE');
  checkPositive(numericalFailures, trial.swarmVelocityAtFloodMagnitudeMS, 'SWARM_SPEED_NOT_POSITIVE');
  if (!(finite(terminal.deltaRhoKgM3) && terminal.deltaRhoKgM3 < 0)) {
    numericalFailures.push('SIGNED_DENSITY_DIFFERENCE_NOT_REVERSE');
  }
  if (!(finite(terminal.relativeVelocityMS) && terminal.relativeVelocityMS < 0)) {
    numericalFailures.push('TERMINAL_RELATIVE_VELOCITY_NOT_DOWNWARD');
  }
  if (!(finite(trial.characteristicVelocityMS) && trial.characteristicVelocityMS < 0)) {
    numericalFailures.push('CHARACTERISTIC_VELOCITY_NOT_DOWNWARD');
  }
  if (!(finite(trial.swarmVelocityAtFloodMS) && trial.swarmVelocityAtFloodMS < 0)) {
    numericalFailures.push('SWARM_VELOCITY_NOT_DOWNWARD');
  }

  const buoyancyForce = trial.terminal?.buoyancyForceMagnitudeN;
  const dragForce = trial.terminal?.dragForceMagnitudeN;
  const forceResidual = trial.terminal?.forceBalanceResidualN;
  const areaM2ForInvariants = positiveFinite(trial.columnDiameterM)
    ? PI * trial.columnDiameterM ** 2 / 4
    : NaN;
  const primitiveDeltaRho = basis.rrboFeed.densityKgM3 - basis.wetSolventPhase.densityKgM3;
  const primitiveVolumeM3 = positiveFinite(trial.d32M)
    ? PI * trial.d32M ** 3 / 6
    : NaN;
  const primitiveProjectedAreaM2 = positiveFinite(trial.d32M)
    ? PI * trial.d32M ** 2 / 4
    : NaN;
  const primitiveSignedBuoyancyForceN = finite(primitiveVolumeM3)
    ? primitiveDeltaRho * primitiveVolumeM3 * G
    : NaN;
  const primitiveSignedDragForceN =
    positiveFinite(basis.rrboFeed.densityKgM3)
    && positiveFinite(trial.terminal?.dragCoefficient)
    && finite(trial.terminal?.relativeVelocityMS)
    && finite(primitiveProjectedAreaM2)
      ? 0.5 * basis.rrboFeed.densityKgM3 * trial.terminal.dragCoefficient
        * primitiveProjectedAreaM2
        * Math.abs(trial.terminal.relativeVelocityMS) * trial.terminal.relativeVelocityMS
      : NaN;
  const primitiveForceBalanceResidualN =
    finite(primitiveSignedBuoyancyForceN) && finite(primitiveSignedDragForceN)
      ? primitiveSignedBuoyancyForceN - primitiveSignedDragForceN
      : NaN;
  const forceScale = Math.max(
    finite(buoyancyForce) ? Math.abs(buoyancyForce) : 0,
    finite(dragForce) ? Math.abs(dragForce) : 0,
    1e-12,
  );
  if (!(finite(terminal.signedBuoyancyForceN) && terminal.signedBuoyancyForceN < 0)) {
    numericalFailures.push('SIGNED_BUOYANCY_FORCE_NOT_DOWNWARD');
  }
  if (!(finite(terminal.signedDragForceN) && terminal.signedDragForceN < 0)) {
    numericalFailures.push('SIGNED_DRAG_FORCE_NOT_DOWNWARD');
  }
  checkPositive(numericalFailures, terminal.buoyancyForceMagnitudeN, 'BUOYANCY_FORCE_MAGNITUDE_NOT_POSITIVE');
  checkPositive(numericalFailures, terminal.dragForceMagnitudeN, 'DRAG_FORCE_MAGNITUDE_NOT_POSITIVE');
  if (!closeEnough(terminal.signedBuoyancyForceN, primitiveSignedBuoyancyForceN)) {
    numericalFailures.push('PRIMITIVE_SIGNED_BUOYANCY_RECOMPUTATION_MISMATCH');
  }
  if (!closeEnough(terminal.signedDragForceN, primitiveSignedDragForceN)) {
    numericalFailures.push('PRIMITIVE_SIGNED_DRAG_RECOMPUTATION_MISMATCH');
  }
  if (!closeEnough(terminal.forceBalanceResidualN, primitiveForceBalanceResidualN)) {
    numericalFailures.push('PRIMITIVE_FORCE_RESIDUAL_RECOMPUTATION_MISMATCH');
  }
  const forceBalanceResidualRelative = finite(forceResidual)
    ? Math.abs(forceResidual) / forceScale
    : null;
  const primitiveForceScale = Math.max(
    finite(primitiveSignedBuoyancyForceN) ? Math.abs(primitiveSignedBuoyancyForceN) : 0,
    finite(primitiveSignedDragForceN) ? Math.abs(primitiveSignedDragForceN) : 0,
    1e-12,
  );
  const primitiveForceBalanceResidualRelative = finite(primitiveForceBalanceResidualN)
    ? Math.abs(primitiveForceBalanceResidualN) / primitiveForceScale
    : null;
  if (
    forceBalanceResidualRelative === null
    || forceBalanceResidualRelative > FORCE_BALANCE_RELATIVE_TOLERANCE
    || primitiveForceBalanceResidualRelative === null
    || primitiveForceBalanceResidualRelative > FORCE_BALANCE_RELATIVE_TOLERANCE
  ) {
    numericalFailures.push('SIGNED_FORCE_BALANCE_NOT_CLOSED');
  }

  const primitiveLoading = positiveFinite(areaM2ForInvariants)
    && positiveFinite(trial.floodTotalSuperficialVelocityMS)
    ? (basis.rrboFeed.flowM3S + basis.wetSolventPhase.flowM3S)
      / (areaM2ForInvariants * trial.floodTotalSuperficialVelocityMS)
    : NaN;
  const loadingResidual = finite(trial.actualLoading)
    ? Math.abs(trial.actualLoading - DESIGN_FLOOD_FRACTION)
    : null;
  const primitiveLoadingResidual = finite(primitiveLoading)
    ? Math.abs(primitiveLoading - DESIGN_FLOOD_FRACTION)
    : null;
  if (
    loadingResidual === null
    || loadingResidual > LOADING_CLOSURE_TOLERANCE
    || primitiveLoadingResidual === null
    || primitiveLoadingResidual > LOADING_CLOSURE_TOLERANCE
    || !closeEnough(trial.actualLoading, primitiveLoading, LOADING_CLOSURE_TOLERANCE, 1e-8)
    || !(trial.actualLoading > 0)
  ) {
    numericalFailures.push('FLOOD_LOADING_ROOT_NOT_CLOSED_FROM_PRIMITIVE_FLOW_AREA');
  }

  checkFinite(shapeFailures, terminal.aspectRatio, 'SHAPE_ASPECT_RATIO_NOT_FINITE');
  if (
    !positiveFinite(terminal.aspectRatio)
    || terminal.aspectRatio > 1
  ) {
    shapeFailures.push('SHAPE_ASPECT_RATIO_NOT_REAL');
  }
  checkFinite(shapeFailures, terminal.taylor, 'SHAPE_TAYLOR_NOT_FINITE');
  checkPositive(shapeFailures, terminal.taylor, 'SHAPE_TAYLOR_NOT_POSITIVE');
  checkPositive(shapeFailures, terminal.morton, 'SHAPE_MORTON_NOT_POSITIVE');

  if (
    !finite(trial.floodHoldup)
    || trial.floodHoldup <= MIN_POSITIVE_HOLDUP
    || trial.floodHoldup >= 1 - MIN_POSITIVE_HOLDUP
  ) {
    holdupFailures.push('FLOOD_HOLDUP_NOT_STRICTLY_INTERIOR');
  }
  checkPositive(holdupFailures, trial.floodTotalSuperficialVelocityMS, 'FLOOD_CAPACITY_VELOCITY_NOT_POSITIVE');
  checkPositive(holdupFailures, trial.swarmVelocityAtFloodMagnitudeMS, 'FLOOD_SWARM_VELOCITY_NOT_POSITIVE');

  const countercurrent = trial.countercurrentAtFlood ?? {};
  if (!closeEnough(terminal.deltaRhoKgM3, primitiveDeltaRho)) {
    numericalFailures.push('PRIMITIVE_SIGNED_DENSITY_DIFFERENCE_MISMATCH');
  }
  const primitiveContinuousSuperficialVelocityMS =
    positiveFinite(areaM2ForInvariants)
      ? basis.rrboFeed.flowM3S / areaM2ForInvariants
      : NaN;
  const primitiveDispersedSuperficialVelocityMS =
    positiveFinite(areaM2ForInvariants)
      ? -basis.wetSolventPhase.flowM3S / areaM2ForInvariants
      : NaN;
  const primitiveContinuousVelocityMS =
    finite(primitiveContinuousSuperficialVelocityMS)
    && finite(trial.floodHoldup)
    && trial.floodHoldup > 0
    && trial.floodHoldup < 1
      ? primitiveContinuousSuperficialVelocityMS / (1 - trial.floodHoldup)
      : NaN;
  const primitiveDispersedVelocityMS =
    finite(primitiveDispersedSuperficialVelocityMS)
    && finite(trial.floodHoldup)
    && trial.floodHoldup > 0
    && trial.floodHoldup < 1
      ? primitiveDispersedSuperficialVelocityMS / trial.floodHoldup
      : NaN;
  const primitiveRelativeVelocityMS =
    finite(primitiveContinuousVelocityMS) && finite(primitiveDispersedVelocityMS)
      ? primitiveDispersedVelocityMS - primitiveContinuousVelocityMS
      : NaN;
  if (!closeEnough(trial.continuousSuperficialVelocityMS, primitiveContinuousSuperficialVelocityMS)) {
    numericalFailures.push('PRIMITIVE_CONTINUOUS_FLOW_AREA_MISMATCH');
  }
  if (!closeEnough(trial.dispersedSuperficialVelocityMS, primitiveDispersedSuperficialVelocityMS)) {
    numericalFailures.push('PRIMITIVE_DISPERSED_FLOW_AREA_MISMATCH');
  }
  if (!closeEnough(countercurrent.continuousVelocityMS, primitiveContinuousVelocityMS)) {
    numericalFailures.push('PRIMITIVE_CONTINUOUS_HOLDUP_VELOCITY_MISMATCH');
  }
  if (!closeEnough(countercurrent.dispersedVelocityMS, primitiveDispersedVelocityMS)) {
    numericalFailures.push('PRIMITIVE_DISPERSED_HOLDUP_VELOCITY_MISMATCH');
  }
  if (!closeEnough(countercurrent.relativeVelocityMS, primitiveRelativeVelocityMS)) {
    numericalFailures.push('PRIMITIVE_RELATIVE_HOLDUP_VELOCITY_MISMATCH');
  }
  if (!positiveFinite(countercurrent.continuousVelocityMS)) {
    holdupFailures.push('CONTINUOUS_COUNTERCURRENT_VELOCITY_NOT_POSITIVE');
  }
  if (!(finite(countercurrent.dispersedVelocityMS) && countercurrent.dispersedVelocityMS < 0)) {
    holdupFailures.push('DISPERSED_COUNTERCURRENT_VELOCITY_NOT_DOWNWARD');
  }
  if (!(finite(countercurrent.relativeVelocityMS) && countercurrent.relativeVelocityMS < 0)) {
    holdupFailures.push('RELATIVE_COUNTERCURRENT_VELOCITY_NOT_DOWNWARD');
  }
  if (
    finite(countercurrent.continuousVelocityMS)
    && finite(countercurrent.dispersedVelocityMS)
    && finite(countercurrent.relativeVelocityMS)
    && Math.abs(
      countercurrent.relativeVelocityMS
      - (countercurrent.dispersedVelocityMS - countercurrent.continuousVelocityMS),
    ) > 1e-10
  ) {
    numericalFailures.push('COUNTERCURRENT_RELATIVE_VELOCITY_NOT_CLOSED');
  }

  const areaM2 = positiveFinite(trial.columnDiameterM)
    ? PI * trial.columnDiameterM ** 2 / 4
    : NaN;
  const continuous = properties.continuous;
  const dispersed = properties.dispersed;
  const continuousVolumetricFlux = continuous && positiveFinite(areaM2)
    ? continuous.flowM3S / areaM2
    : NaN;
  const dispersedVolumetricFlux = dispersed && positiveFinite(areaM2)
    ? dispersed.flowM3S / areaM2
    : NaN;
  const continuousMassFlux = continuous && finite(continuousVolumetricFlux)
    ? continuousVolumetricFlux * continuous.densityKgM3
    : NaN;
  const dispersedMassFlux = dispersed && finite(dispersedVolumetricFlux)
    ? dispersedVolumetricFlux * dispersed.densityKgM3
    : NaN;
  const totalMassFlux = finite(continuousMassFlux) && finite(dispersedMassFlux)
    ? continuousMassFlux + dispersedMassFlux
    : NaN;
  if (!positiveFinite(continuousMassFlux)) massFluxFailures.push('CONTINUOUS_MASS_FLUX_NON_POSITIVE');
  if (!positiveFinite(dispersedMassFlux)) massFluxFailures.push('DISPERSED_MASS_FLUX_NON_POSITIVE');
  if (!positiveFinite(totalMassFlux)) massFluxFailures.push('TOTAL_MASS_FLUX_NON_POSITIVE');

  const physicalDomainPass = physicalFailures.length === 0;
  const selectedPropertiesPass = properties.failures.length === 0;
  const numericalClosurePass = numericalFailures.length === 0;
  const shapePass = shapeFailures.length === 0;
  const holdupPass = holdupFailures.length === 0;
  const massFluxPass = massFluxFailures.length === 0;
  const evidenceQualificationPass = missingWarnings.length === 0 && statusFailures.length === 0;
  return {
    status: physicalDomainPass
      && selectedPropertiesPass
      && numericalClosurePass
      && shapePass
      && holdupPass
      && massFluxPass
      && evidenceQualificationPass
      ? 'EXTRAPOLATED_MODEL_ROOT'
      : 'BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE',
    sourceQualification: 'CALCULATED_EXTRAPOLATED',
    physicalDomain: { status: physicalDomainPass ? 'PASS' : 'FAIL', failures: physicalFailures },
    numericalClosure: {
      status: numericalClosurePass ? 'PASS' : 'FAIL',
      failures: numericalFailures,
      forceBalanceResidualRelative,
      primitiveForceBalanceResidualRelative,
      loadingResidual,
      primitiveLoadingResidual,
      loadingTolerance: LOADING_CLOSURE_TOLERANCE,
    },
    selectedProperties: {
      status: selectedPropertiesPass ? 'PASS' : 'FAIL',
      failures: properties.failures,
      continuous: properties.continuous,
      dispersed: properties.dispersed,
    },
    shape: {
      status: shapePass ? 'PASS' : 'FAIL',
      failures: shapeFailures,
      aspectRatio: finite(terminal.aspectRatio) ? terminal.aspectRatio : null,
    },
    holdup: {
      status: holdupPass ? 'PASS' : 'FAIL',
      failures: holdupFailures,
      floodHoldup: finite(trial.floodHoldup) ? trial.floodHoldup : null,
    },
    massFlux: {
      status: massFluxPass ? 'PASS' : 'FAIL',
      failures: massFluxFailures,
      continuousKgM2S: finite(continuousMassFlux) ? continuousMassFlux : null,
      dispersedKgM2S: finite(dispersedMassFlux) ? dispersedMassFlux : null,
      totalKgM2S: finite(totalMassFlux) ? totalMassFlux : null,
    },
    evidenceQualification: {
      status: evidenceQualificationPass ? 'PASS' : 'FAIL',
      requiredWarnings: [...MANDATORY_EXTRAPOLATION_WARNINGS],
      presentWarnings: sourceWarnings,
      missingWarnings,
      requiredStatus: 'CALCULATED_EXTRAPOLATED',
      trialStatus,
      applicabilityStatus,
      statusFailures,
    },
    warnings,
  };
}

export function selectIllustrativeExtrapolatedModelRoot(
  trials: readonly ReverseTrial[],
): ReverseTrial | null {
  return [...trials]
    .filter((trial) => trial.modelRootAssessment?.status === 'EXTRAPOLATED_MODEL_ROOT')
    .sort((left, right) =>
      left.columnDiameterM - right.columnDiameterM || left.rpm - right.rpm)
    .at(0) ?? null;
}

const EXTRAPOLATED_MODEL_ROOT_ASSUMPTIONS = [
  'Signed reverse buoyancy and RRBO-upward/NMP-downward countercurrent mapping are explicit kinematic assumptions, not a qualified reverse Kühni source route.',
  'Myint terminal drag and shape equations are reused outside demonstrated RRBO-continuous/downward-NMP orientation and retain every source-range warning.',
  'Garthe characteristic velocity and swarm holdup closures are reused as an engineering screening assumption; no reverse RRBO/NMP validation is claimed.',
  'Turning-point flood capacity and the 70% loading root are numerical screening closures; the point is not a governed flooding or vendor design result.',
  'A selected root is an illustrative extrapolated model root only; passing invariant checks does not establish reverse physical feasibility or a design diameter.',
];

function versionNonReverseResult(historical: ReturnType<typeof resolveKuhniGeometryV140>) {
  const { calculationHash: _historicalCalculationHash, ...payload } = historical;
  const result = {
    ...payload,
    engine: {
      ...historical.engine,
      version: KUHNI_GEOMETRY_RESOLVER_V150_VERSION,
      implementationHash: KUHNI_GEOMETRY_RESOLVER_V150_HASH,
      extendsImplementationHash: KUHNI_GEOMETRY_RESOLVER_V140_HASH,
    },
  };
  return { ...result, calculationHash: kuhniRunHash(result) };
}

function isReverseOrientation(basis: HydrodynamicProcessBasis): boolean {
  return basis.phaseConfiguration === 'rrbo-continuous-nmp-dispersed';
}

/**
 * Resolve V1.5.0.  Only the reverse route receives an assumption-based point.
 * Existing supported-orientation results are wrapped immutably and retain
 * V1.4.0 numerical behavior.
 */
export function resolveKuhniGeometryV150(
  basis: HydrodynamicProcessBasis,
  theoreticalStages: TheoreticalStageAuthority,
) {
  const historical = resolveKuhniGeometryV140(basis, theoreticalStages);
  if (!isReverseOrientation(basis)) return versionNonReverseResult(historical);

  const diagnostics = (historical as any).reverseOrientationDiagnostics as {
    trials: ReverseTrial[];
    [key: string]: any;
  };
  const assessedTrials: ReverseTrial[] = diagnostics.trials.map((trial: ReverseTrial) => {
    const modelRootAssessment = assessReverseExtrapolatedModelRoot(trial, basis);
    return {
      ...trial,
      modelRootAssessment,
      massFluxKgM2S: modelRootAssessment.massFlux.totalKgM2S,
    } as ReverseTrial;
  });
  const assessedRejectedTrials: ReverseTrial[] = (diagnostics.rejectedTrials ?? [])
    .map((trial: ReverseTrial) => ({
      ...trial,
      modelRootAssessment: {
        status: 'BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE',
        category: 'NUMERICAL_ROOT_FAILURE',
        failures: [
          String(trial.reason ?? 'NO_REVERSE_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS'),
        ],
        warnings: [],
      },
    }));
  const selectedModelRoot = selectIllustrativeExtrapolatedModelRoot(assessedTrials);
  const illustrativeModelRootSelection = selectedModelRoot
    ? {
      status: 'EXTRAPOLATED_MODEL_ROOT_SELECTED_FOR_ILLUSTRATION' as const,
      sourceQualification: 'CALCULATED_EXTRAPOLATED' as const,
      selectedTrialId: `rpm:${selectedModelRoot.rpm}:diameterM:${selectedModelRoot.columnDiameterM}`,
      selectedRpm: selectedModelRoot.rpm,
      selectedColumnDiameterM: selectedModelRoot.columnDiameterM,
      selectionRule: 'MINIMUM_DIAMETER_AMONG_EXTRAPOLATED_MODEL_ROOTS_THEN_RPM; ILLUSTRATIVE ONLY; NOT A FEASIBILITY OR DESIGN OPTIMIZATION',
      assumptions: [...EXTRAPOLATED_MODEL_ROOT_ASSUMPTIONS],
      sourceRangeWarnings: [...selectedModelRoot.modelRootAssessment.warnings],
      invariantChecks: selectedModelRoot.modelRootAssessment,
      physicalFeasibility: 'NOT_ESTABLISHED',
      designDiameter: null,
      governedDiameter: null,
      governedHydraulicDiagnosticPoint: null,
      stage4Admission: 'BLOCKED_REQUIRES_CALCULATED_IN_RANGE_STAGE3_TRIAL',
    }
    : {
      status: 'NO_EXTRAPOLATED_MODEL_ROOT_PASSES_REQUIRED_INVARIANTS' as const,
      sourceQualification: 'CALCULATED_EXTRAPOLATED' as const,
      selectedTrialId: null,
      selectedRpm: null,
      selectedColumnDiameterM: null,
      selectionRule: 'MINIMUM_DIAMETER_AMONG_EXTRAPOLATED_MODEL_ROOTS_THEN_RPM; ILLUSTRATIVE ONLY; NOT A FEASIBILITY OR DESIGN OPTIMIZATION',
      assumptions: [...EXTRAPOLATED_MODEL_ROOT_ASSUMPTIONS],
      sourceRangeWarnings: [],
      invariantChecks: null,
      physicalFeasibility: 'NOT_ESTABLISHED',
      designDiameter: null,
      governedDiameter: null,
      governedHydraulicDiagnosticPoint: null,
      stage4Admission: 'BLOCKED_NO_EXTRAPOLATED_MODEL_ROOT',
    };
  const { calculationHash: _historicalCalculationHash, ...historicalPayload } = historical;
  const reverseMessage =
    'RRBO-continuous / downward NMP remains outside the qualified Kühni source orientation. '
    + 'V1.5.0 may expose an extrapolated model root for illustration after invariant checks under '
    + 'explicit reverse-mapping, drag, shape, swarm and flooding assumptions. The root does not '
    + 'establish physical feasibility or a design diameter, and is never CALCULATED_IN_RANGE, '
    + 'governed, or a Stage-4 input.';
  const result = {
    ...historicalPayload,
    status: 'EXTRAPOLATED_REVERSE_ORIENTATION_DIAGNOSTICS_WITH_ILLUSTRATIVE_MODEL_ROOT' as const,
    engine: {
      ...historical.engine,
      version: KUHNI_GEOMETRY_RESOLVER_V150_VERSION,
      implementationHash: KUHNI_GEOMETRY_RESOLVER_V150_HASH,
      extendsImplementationHash: KUHNI_GEOMETRY_RESOLVER_V140_HASH,
    },
    hydraulicPrerequisite: {
      code: 'REVERSE_ORIENTATION_EXTRAPOLATED_MODEL_ROOT_ONLY',
      message: reverseMessage,
    },
    hydraulicRpmEnvelope: [],
    excludedExtrapolatedTrialCount: assessedTrials.length,
    excludedExtrapolatedTrials: assessedTrials,
    resultAdmissionRule:
      'ONLY_CALCULATED_IN_RANGE_TRIALS_ARE_DISPLAYED_OR_USED_FOR_THE_GOVERNED_HYDRAULIC_DIAGNOSTIC; '
      + 'V1.5.0 extrapolated model roots remain outside hydraulicRpmEnvelope and Stage-4 governed lineage.',
    hydraulicDiagnosticPoint: null,
    hydraulicResolvedColumnDiameterM: null,
    resolvedColumnDiameterM: null,
    finalOperatingRpm: null,
    physicalCompartments: null,
    activeHeightM: null,
    illustrativeExtrapolatedModelRoot: selectedModelRoot,
    illustrativeExtrapolatedModelRootDiameterM: selectedModelRoot?.columnDiameterM ?? null,
    illustrativeModelRootSelection,
    stage4GovernedAdmission: {
      status: 'BLOCKED_REQUIRES_CALCULATED_IN_RANGE_STAGE3_TRIAL',
      governedHydraulicDiagnosticPoint: null,
      illustrativeModelRootIsNotAnInput: true,
      message:
        'The extrapolated model root is visible for pre-pilot illustration only; it does not '
        + 'establish physical feasibility or a design diameter. '
        + 'Stage 4 governed HETS or finite-rate sizing requires a CALCULATED_IN_RANGE Stage-3 trial.',
    },
    reverseOrientationDiagnostics: {
      ...diagnostics,
      status: 'EXTRAPOLATION_WITH_ILLUSTRATIVE_MODEL_ROOT',
      trials: assessedTrials,
      rejectedTrials: assessedRejectedTrials,
      trialCount: assessedTrials.length,
      rejectedTrialCount: assessedRejectedTrials.length,
      modelRootRejectedTrials: assessedRejectedTrials,
      excludedFromHydraulicEnvelope: true,
      noGovernedDiameter: true,
      illustrativeModelRootSelection,
      illustrativeModelRootAssumptions: [...EXTRAPOLATED_MODEL_ROOT_ASSUMPTIONS],
      sourceRangeWarningsRetained: true,
    },
    rootFailureReason: {
      code: 'REVERSE_ORIENTATION_EXTRAPOLATED_MODEL_ROOT_ONLY',
      message:
        'No CALCULATED_IN_RANGE reverse trial is admitted. A separate extrapolated model root '
        + (selectedModelRoot
          ? 'is selected for illustration only; it does not establish physical feasibility or a design diameter.'
          : 'passed the required invariant checks.'),
    },
    blockers: [
      ...(historical.blockers ?? []).filter((blocker: string) =>
        !blocker.includes('No reverse-orientation preliminary trial is admissible')
        && !blocker.includes('REVERSE_ORIENTATION_PRELIMINARY_ONLY')
        && !blocker.includes('RRBO-continuous / downward NMP remains outside the qualified Kühni source orientation')),
      'REVERSE_ORIENTATION_EXTRAPOLATED_MODEL_ROOT_ONLY',
      'GOVERNED_STAGE3_DIAMETER_UNAVAILABLE',
    ],
    evidence: {
      ...historical.evidence,
      extrapolationRule:
        'Source-range and reverse-orientation violations remain visible; an extrapolated model root '
        + 'is selected for illustration only after independent primitive-basis invariant checks. '
        + 'Those checks do not establish physical feasibility or a design diameter.',
      illustrativeModelRootSelectionRule: illustrativeModelRootSelection.selectionRule,
      illustrativeModelRootAssumptions: [...EXTRAPOLATED_MODEL_ROOT_ASSUMPTIONS],
      phaseOrientation: {
        status: 'EXTRAPOLATED_REVERSE_ORIENTATION_EXCLUDED',
        sourceOrientation: diagnostics.selectedPhaseProperties,
        message: reverseMessage,
      },
    },
    calculationReport: {
      ...historical.calculationReport,
      title: `${KUHNI_GEOMETRY_RESOLVER_V150_VERSION} calculation report`,
      hydraulicResolvedColumnDiameterM: null,
      hydraulicDiagnosticRpm: null,
      hydraulicRpmRange: null,
      finalOperatingRpm: null,
      physicalCompartments: null,
      activeHeightM: null,
      illustrativeExtrapolatedModelRootDiameterM: selectedModelRoot?.columnDiameterM ?? null,
      disposition:
        'Extrapolated model root retained separately for illustration only; no physical feasibility, '
        + 'governed hydraulic diameter, RPM, or Stage-3 geometry was established or admitted.',
    },
  };
  return { ...result, calculationHash: kuhniRunHash(result) };
}

export type KuhniGeometryV150Result = ReturnType<typeof resolveKuhniGeometryV150>;