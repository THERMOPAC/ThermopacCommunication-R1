import { createHash } from 'node:crypto';
import type { HydrodynamicProcessBasis } from './kuhni-hydrodynamics';
import type { TheoreticalStageAuthority } from './kuhni-geometry-resolver';
import {
  KUHNI_GEOMETRY_RESOLVER_V110_HASH,
  KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
  resolveKuhniGeometryV110,
} from './kuhni-geometry-resolver-v110';
import { kuhniRunHash } from './kuhni-hydrodynamics';

/**
 * V1.2.0 is deliberately a new resolver artifact.  V1.0.0, V1.0.1 and
 * V1.1.0 are historical numerical artifacts and must continue to replay
 * byte-for-byte.  This version adds the phase-applicability boundary around
 * the frozen V1.1.0 equations; it does not reinterpret a negative density
 * difference as a positive one.
 */
export const KUHNI_GEOMETRY_RESOLVER_V120_VERSION = 'KUHNI_GEOMETRY_RESOLVER_V1.2.0';

const MIN_RPM = 5;
const MAX_RPM = 60;
const RPM_STEP = 5;

const implementationDescriptors = [
  KUHNI_GEOMETRY_RESOLVER_V120_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
  KUHNI_GEOMETRY_RESOLVER_V110_HASH,
  'phase-applicability-boundary:continuous-heavy-downward-dispersed-light-upward-only',
  'no-abs-density|no-phase-swap|no-reversed-buoyancy-fallback',
  'explicit-prerequisite-root-failure-phase-metadata',
  'preserve-stage1-stage2-lineage-and-inrange-admission',
];

export const KUHNI_GEOMETRY_RESOLVER_V120_HASH = createHash('sha256')
  .update(implementationDescriptors.join('|'))
  .digest('hex');

export const KUHNI_HYDRAULIC_PREREQUISITE_CODES = {
  SUPPORTED_DENSITY_ORIENTATION: 'SUPPORTED_DENSITY_ORIENTATION',
  // Retain the established V1.0/V1.1 rejection code while the message adds
  // the narrower V1.2.0 diagnosis (the dispersed phase is denser/downward).
  DENSER_DISPERSED_DOWNWARD_UNSUPPORTED: 'CONTINUOUS_PHASE_MUST_BE_HEAVIER',
  EQUAL_PHASE_DENSITIES_UNSUPPORTED: 'EQUAL_PHASE_DENSITIES_UNSUPPORTED',
  NON_PHYSICAL_PHASE_DENSITY: 'NON_PHYSICAL_PHASE_DENSITY',
  NON_PHYSICAL_PHASE_FLOW: 'NON_PHYSICAL_PHASE_FLOW',
  NON_PHYSICAL_PHASE_VISCOSITY: 'NON_PHYSICAL_PHASE_VISCOSITY',
  NON_PHYSICAL_INTERFACIAL_TENSION: 'NON_PHYSICAL_INTERFACIAL_TENSION',
  UNSUPPORTED_PHASE_CONFIGURATION: 'UNSUPPORTED_PHASE_CONFIGURATION',
} as const;

export type KuhniHydraulicPrerequisite = {
  code: string;
  message: string;
};

type Direction = 'UPWARD' | 'DOWNWARD' | 'UNKNOWN';
type MappingStatus = 'SUPPORTED_SOURCE_MAPPING' | 'NOT_APPLIED_UNSUPPORTED_ORIENTATION';

type PhaseSnapshot = {
  identity: string | null;
  flowM3S: number | null;
  densityKgM3: number | null;
  dynamicViscosityPaS: number | null;
};

export type KuhniPhaseMetadata = {
  phaseConfiguration: string;
  densityOrdering: 'CONTINUOUS_HEAVIER' | 'CONTINUOUS_LIGHTER' | 'EQUAL' | 'NON_PHYSICAL' | 'UNKNOWN';
  densityDifferenceKgM3: number | null;
  buoyancyMagnitudeKgM3: number | null;
  buoyancyDirection: 'DISPERSED_UPWARD' | 'DISPERSED_DOWNWARD' | 'NO_RELATIVE_BUOYANCY' | 'UNKNOWN';
  interfacialTensionNM: number | null;
  continuousPhase: PhaseSnapshot;
  dispersedPhase: PhaseSnapshot;
  gravityDirections: {
    continuous: Direction;
    dispersed: Direction;
  };
  countercurrentVelocities: {
    continuousSuperficialVelocityMS: number | null;
    dispersedSuperficialVelocityMS: number | null;
    basis: 'DIAGNOSTIC_DIAMETER_ROOT' | 'NO_DIAMETER_ROOT_AVAILABLE';
  };
  countercurrentMapping: {
    status: MappingStatus;
    continuousDirection: 'DOWNWARD' | null;
    dispersedDirection: 'UPWARD' | null;
    continuousInlet: 'TOP' | null;
    continuousOutlet: 'BOTTOM' | null;
    dispersedInlet: 'BOTTOM' | null;
    dispersedOutlet: 'TOP' | null;
    velocityConvention: 'POSITIVE_SUPERFICIAL_MAGNITUDES_WITH_SOURCE_COUNTERCURRENT_MAPPING' | null;
  };
  closureApplicability: {
    terminalDrag: 'EXECUTED_MYINT_PHASE_ORDER' | 'NOT_EXECUTED_PHASE_ORIENTATION_UNSUPPORTED';
    holdup: 'EXECUTED_GARTHE_COUNTERCURRENT_CLOSURE' | 'NOT_EXECUTED_PHASE_ORIENTATION_UNSUPPORTED';
    flooding: 'EXECUTED_TURNING_POINT_CLOSURE' | 'NOT_EXECUTED_PHASE_ORIENTATION_UNSUPPORTED';
  };
  sourceApplicability: {
    status: 'SUPPORTED_SOURCE_ORIENTATION' | 'UNSUPPORTED_DENSER_DISPERSED_DOWNWARD' | 'UNSUPPORTED_EQUAL_OR_NON_PHYSICAL';
    sourceOrientation: 'HEAVY_CONTINUOUS_DOWNWARD_LIGHT_DISPERSED_UPWARD';
    evidence: string[];
    limits: string[];
  };
};

type RootFailureReason = {
  code: string;
  message: string;
};

type PhaseLike = {
  identity: string;
  flowM3S: number;
  densityKgM3: number;
  dynamicViscosityPaS: number;
};

type PhaseSelection = {
  continuous: PhaseLike | null;
  dispersed: PhaseLike | null;
};

const SOURCE_EVIDENCE = [
  'Laitinen et al. (2019) describes the Kühni source case as heavier continuous phase downward and lighter dispersed phase upward.',
  'Kumar-Hartland holdup and terminal closures retain rho_c-rho_d as a signed buoyancy difference; no absolute-value or reversed-phase rule is published here.',
  'Asadollahzadeh et al. (2017) reports heavy-phase inlet/light-phase outlet control for a water-continuous, organic-dispersed Kühni column.',
  'Weber et al. (2019) validates a rise-velocity, swarm, coalescence and phase-inversion route for water-continuous/toluene-dispersed service, not RRBO-continuous/NMP-dispersed service.',
];

const SOURCE_LIMITS = [
  'No reviewed source supplies a denser dispersed-drop downward Kühni inlet/outlet mapping for the RRBO/NMP pair.',
  'No reviewed source closes reversed-orientation holdup, flooding, phase inversion, or interface control with RRBO/NMP properties.',
  'A finite algebraic root is not treated as evidence of reversed-orientation applicability.',
];

function phaseSelection(basis: HydrodynamicProcessBasis): PhaseSelection {
  if (basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed') {
    return { continuous: basis.wetSolventPhase, dispersed: basis.rrboFeed };
  }
  if (basis.phaseConfiguration === 'rrbo-continuous-nmp-dispersed') {
    return { continuous: basis.rrboFeed, dispersed: basis.wetSolventPhase };
  }
  return { continuous: null, dispersed: null };
}

function phaseSnapshot(phase: PhaseLike | null): PhaseSnapshot {
  return phase
    ? {
      identity: phase.identity,
      flowM3S: phase.flowM3S,
      densityKgM3: phase.densityKgM3,
      dynamicViscosityPaS: phase.dynamicViscosityPaS,
    }
    : {
      identity: null,
      flowM3S: null,
      densityKgM3: null,
      dynamicViscosityPaS: null,
    };
}

function directionForDensityDifference(delta: number | null): Direction {
  if (delta === null || !Number.isFinite(delta) || delta === 0) return 'UNKNOWN';
  return delta > 0 ? 'DOWNWARD' : 'UPWARD';
}

function makePhaseMetadata(
  basis: HydrodynamicProcessBasis,
  selection: PhaseSelection,
  prerequisiteCode: string,
): KuhniPhaseMetadata {
  const densityDifference = selection.continuous && selection.dispersed
    ? selection.continuous.densityKgM3 - selection.dispersed.densityKgM3
    : null;
  const physicalDensityValues = Boolean(
    selection.continuous && selection.dispersed
    && Number.isFinite(selection.continuous.densityKgM3) && selection.continuous.densityKgM3 > 0
    && Number.isFinite(selection.dispersed.densityKgM3) && selection.dispersed.densityKgM3 > 0,
  );
  const densityOrdering = !physicalDensityValues
    ? 'NON_PHYSICAL'
    : densityDifference === null || !Number.isFinite(densityDifference)
    ? 'UNKNOWN'
    : densityDifference > 0
      ? 'CONTINUOUS_HEAVIER'
      : densityDifference < 0
        ? 'CONTINUOUS_LIGHTER'
        : 'EQUAL';
  const supported = prerequisiteCode === KUHNI_HYDRAULIC_PREREQUISITE_CODES.SUPPORTED_DENSITY_ORIENTATION;
  const gravityContinuous = physicalDensityValues
    ? directionForDensityDifference(densityDifference)
    : 'UNKNOWN';
  const gravityDispersed = gravityContinuous === 'DOWNWARD'
    ? 'UPWARD'
    : gravityContinuous === 'UPWARD'
      ? 'DOWNWARD'
      : 'UNKNOWN';
  const buoyancyDirection = !physicalDensityValues
    ? 'UNKNOWN'
    : densityDifference === null || !Number.isFinite(densityDifference)
    ? 'UNKNOWN'
    : densityDifference > 0
      ? 'DISPERSED_UPWARD'
      : densityDifference < 0
        ? 'DISPERSED_DOWNWARD'
        : 'NO_RELATIVE_BUOYANCY';
  const unsupportedReverse =
    prerequisiteCode === KUHNI_HYDRAULIC_PREREQUISITE_CODES.DENSER_DISPERSED_DOWNWARD_UNSUPPORTED;

  return {
    phaseConfiguration: basis.phaseConfiguration,
    densityOrdering,
    densityDifferenceKgM3: densityDifference,
    buoyancyMagnitudeKgM3: densityDifference === null || !Number.isFinite(densityDifference)
      ? null
      : Math.abs(densityDifference),
    buoyancyDirection,
    interfacialTensionNM: Number.isFinite(basis.interfacialTensionNM)
      ? basis.interfacialTensionNM
      : null,
    continuousPhase: phaseSnapshot(selection.continuous),
    dispersedPhase: phaseSnapshot(selection.dispersed),
    gravityDirections: { continuous: gravityContinuous, dispersed: gravityDispersed },
    countercurrentVelocities: {
      continuousSuperficialVelocityMS: null,
      dispersedSuperficialVelocityMS: null,
      basis: 'NO_DIAMETER_ROOT_AVAILABLE',
    },
    countercurrentMapping: {
      status: supported ? 'SUPPORTED_SOURCE_MAPPING' : 'NOT_APPLIED_UNSUPPORTED_ORIENTATION',
      continuousDirection: supported ? 'DOWNWARD' : null,
      dispersedDirection: supported ? 'UPWARD' : null,
      continuousInlet: supported ? 'TOP' : null,
      continuousOutlet: supported ? 'BOTTOM' : null,
      dispersedInlet: supported ? 'BOTTOM' : null,
      dispersedOutlet: supported ? 'TOP' : null,
      velocityConvention: supported
        ? 'POSITIVE_SUPERFICIAL_MAGNITUDES_WITH_SOURCE_COUNTERCURRENT_MAPPING'
        : null,
    },
    closureApplicability: {
      terminalDrag: supported ? 'EXECUTED_MYINT_PHASE_ORDER' : 'NOT_EXECUTED_PHASE_ORIENTATION_UNSUPPORTED',
      holdup: supported ? 'EXECUTED_GARTHE_COUNTERCURRENT_CLOSURE' : 'NOT_EXECUTED_PHASE_ORIENTATION_UNSUPPORTED',
      flooding: supported ? 'EXECUTED_TURNING_POINT_CLOSURE' : 'NOT_EXECUTED_PHASE_ORIENTATION_UNSUPPORTED',
    },
    sourceApplicability: {
      status: supported
        ? 'SUPPORTED_SOURCE_ORIENTATION'
        : unsupportedReverse
          ? 'UNSUPPORTED_DENSER_DISPERSED_DOWNWARD'
          : 'UNSUPPORTED_EQUAL_OR_NON_PHYSICAL',
      sourceOrientation: 'HEAVY_CONTINUOUS_DOWNWARD_LIGHT_DISPERSED_UPWARD',
      evidence: [...SOURCE_EVIDENCE],
      limits: [...SOURCE_LIMITS],
    },
  };
}

function selectPrerequisite(
  basis: HydrodynamicProcessBasis,
  selection: PhaseSelection,
): KuhniHydraulicPrerequisite {
  if (!selection.continuous || !selection.dispersed) {
    return {
      code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.UNSUPPORTED_PHASE_CONFIGURATION,
      message: `Kühni Stage-3 hydraulics do not have a governed continuous/dispersed mapping for phase configuration "${basis.phaseConfiguration}". No diameter or RPM root was attempted.`,
    };
  }

  const phases = [selection.continuous, selection.dispersed];
  if (phases.some((phase) =>
    !Number.isFinite(phase.densityKgM3) || phase.densityKgM3 <= 0)) {
    return {
      code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.NON_PHYSICAL_PHASE_DENSITY,
      message: 'Stage-3 hydraulics require finite positive continuous and dispersed densities; no diameter or RPM root was attempted.',
    };
  }
  if (phases.some((phase) => !Number.isFinite(phase.flowM3S) || phase.flowM3S <= 0)) {
    return {
      code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.NON_PHYSICAL_PHASE_FLOW,
      message: 'Stage-3 hydraulics require finite positive flow for both phases; no diameter or RPM root was attempted.',
    };
  }
  if (phases.some((phase) =>
    !Number.isFinite(phase.dynamicViscosityPaS) || phase.dynamicViscosityPaS <= 0)) {
    return {
      code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.NON_PHYSICAL_PHASE_VISCOSITY,
      message: 'Stage-3 hydraulics require finite positive viscosity for both phases; no diameter or RPM root was attempted.',
    };
  }
  if (!Number.isFinite(basis.interfacialTensionNM) || basis.interfacialTensionNM <= 0) {
    return {
      code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.NON_PHYSICAL_INTERFACIAL_TENSION,
      message: 'Stage-3 hydraulics require finite positive interfacial tension; no diameter or RPM root was attempted.',
    };
  }

  const densityDifference = selection.continuous.densityKgM3 - selection.dispersed.densityKgM3;
  if (densityDifference === 0) {
    return {
      code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.EQUAL_PHASE_DENSITIES_UNSUPPORTED,
      message: 'Stage-3 hydraulics require a non-zero buoyancy difference; equal phase densities have no governed drop direction and no diameter or RPM root was attempted.',
    };
  }
  if (densityDifference < 0) {
    return {
      code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.DENSER_DISPERSED_DOWNWARD_UNSUPPORTED,
      message: 'Stage-3 hydraulics currently support only the evidenced heavy-continuous/downward and light-dispersed/upward Kühni orientation. The denser dispersed phase would move downward here, but reversed-orientation buoyancy, countercurrent inlet/outlet mapping, holdup and flooding closure are not qualified; no diameter or RPM root was attempted.',
    };
  }
  return {
    code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.SUPPORTED_DENSITY_ORIENTATION,
    message: 'The continuous phase is denser than the dispersed phase; the evidenced heavy-continuous/downward and light-dispersed/upward Kühni orientation is applicable to the frozen Stage-3 closure.',
  };
}

function engineForV120() {
  return {
    id: 'kuhni_geometry_resolver' as const,
    version: KUHNI_GEOMETRY_RESOLVER_V120_VERSION,
    implementationHash: KUHNI_GEOMETRY_RESOLVER_V120_HASH,
    dragModel: 'MYINT_GARTHE_PREPILOT_CLOSURE_V1.0.0' as const,
    extendsImplementationHash: KUHNI_GEOMETRY_RESOLVER_V110_HASH,
  };
}

function rejectedRpmTrials(prerequisite: KuhniHydraulicPrerequisite) {
  const rejected: Array<{ rpm: number; reason: string; message: string }> = [];
  for (let rpm = MIN_RPM; rpm <= MAX_RPM; rpm += RPM_STEP) {
    rejected.push({ rpm, reason: prerequisite.code, message: prerequisite.message });
  }
  return rejected;
}

function addDiagnosticVelocities(
  metadata: KuhniPhaseMetadata,
  diagnosticPoint: unknown,
  selection: PhaseSelection,
): KuhniPhaseMetadata {
  if (!diagnosticPoint || typeof diagnosticPoint !== 'object') return metadata;
  const columnDiameterM = (diagnosticPoint as { columnDiameterM?: unknown }).columnDiameterM;
  if (typeof columnDiameterM === 'number' && Number.isFinite(columnDiameterM) && columnDiameterM > 0
    && selection.continuous && selection.dispersed) {
    const areaM2 = Math.PI * columnDiameterM ** 2 / 4;
    return {
      ...metadata,
      countercurrentVelocities: {
        continuousSuperficialVelocityMS: selection.continuous.flowM3S / areaM2,
        dispersedSuperficialVelocityMS: selection.dispersed.flowM3S / areaM2,
        basis: 'DIAGNOSTIC_DIAMETER_ROOT',
      },
    };
  }
  const operatingHydraulics = (diagnosticPoint as {
    operatingHydraulics?: {
      continuousSuperficialVelocityMS?: unknown;
      dispersedSuperficialVelocityMS?: unknown;
    };
  }).operatingHydraulics;
  if (!operatingHydraulics) return metadata;
  const continuous = operatingHydraulics.continuousSuperficialVelocityMS;
  const dispersed = operatingHydraulics.dispersedSuperficialVelocityMS;
  if (typeof continuous !== 'number' || !Number.isFinite(continuous)
    || typeof dispersed !== 'number' || !Number.isFinite(dispersed)) {
    return metadata;
  }
  return {
    ...metadata,
    countercurrentVelocities: {
      continuousSuperficialVelocityMS: continuous,
      dispersedSuperficialVelocityMS: dispersed,
      basis: 'DIAGNOSTIC_DIAMETER_ROOT',
    },
  };
}

function unsupportedResult(
  basis: HydrodynamicProcessBasis,
  theoreticalStages: TheoreticalStageAuthority,
  prerequisite: KuhniHydraulicPrerequisite,
  phaseMetadata: KuhniPhaseMetadata,
) {
  // Do not call an older numerical resolver for a blocked prerequisite.  A
  // malformed basis could otherwise pass that resolver's older density guard
  // and briefly enter a terminal/holdup equation before its result was
  // discarded.  Construct the blocked artifact directly, with no numerical
  // root attempt and the same lineage fields as a calculated result.
  const massTransferBlocker =
    'MASS_TRANSFER_COMPARTMENT_EFFICIENCY_MODEL_UNAVAILABLE: no approved equation currently maps local transfer to compartment efficiency and physical height.';
  const result = {
    status: 'NOT_CALCULABLE' as const,
    classification: 'PRE_PILOT_PREDICTIVE_NOT_VENDOR_GUARANTEED' as const,
    engine: engineForV120(),
    theoreticalStagesUsed: theoreticalStages,
    authority: {
      processBasis: 'IMMUTABLE_STAGE_1_SNAPSHOT',
      geometryAndRpm: 'SYSTEM_RESOLVED_NO_USER_AUTHORITY',
      ratios: { rotorToColumn: 0.5, compartmentToColumn: 0.5, rotorToCompartment: 1 },
      constants: {
        statorFreeAreaFraction: 0.35,
        powerNumber: 1.2,
        directTurbulenceC: 0.42,
        designFloodFraction: 0.7,
      },
    },
    processBasis: basis,
    hydraulicPrerequisite: prerequisite,
    phaseMetadata,
    rootFailureReason: {
      code: prerequisite.code,
      message: prerequisite.message,
    } satisfies RootFailureReason,
    hydraulicRpmEnvelope: [],
    excludedExtrapolatedTrialCount: 0,
    excludedExtrapolatedTrials: [],
    resultAdmissionRule: 'ONLY_CALCULATED_IN_RANGE_TRIALS_ARE_DISPLAYED_OR_USED_FOR_THE_HYDRAULIC_DIAGNOSTIC',
    hydraulicDiagnosticPoint: null,
    hydraulicResolvedColumnDiameterM: null,
    rejectedRpmTrials: rejectedRpmTrials(prerequisite),
    blockers: [
      `HYDRAULIC_PREREQUISITE_BLOCKED:${prerequisite.code}`,
      prerequisite.message,
      massTransferBlocker,
    ],
    resolvedColumnDiameterM: null,
    finalOperatingRpm: null,
    physicalCompartments: null,
    activeHeightM: null,
    coupledSelection: { status: 'DEPENDENCY_BLOCKED' as const, blocker: massTransferBlocker },
    evidence: {
      drag: 'Myint et al. (2006), clean-drop branch; not executed outside the source-supported phase orientation.',
      shape: 'Myint et al. (2007), not executed outside the source-supported phase orientation.',
      characteristic: 'Garthe (2005) Eq. 5.6 and Eq. 5.7; not executed outside the source-supported phase orientation.',
      swarm: 'Garthe (2005) Eq. 8.3; not executed outside the source-supported phase orientation.',
      flooding: 'Turning-point capacity; not executed outside the source-supported phase orientation.',
      extrapolationRule: 'Unsupported phase orientation is a prerequisite boundary, not an executable extrapolation.',
      phaseOrientation: {
        status: 'UNSUPPORTED_ORIENTATION_BLOCKED',
        sourceOrientation: phaseMetadata.sourceApplicability.sourceOrientation,
        message: prerequisite.message,
      },
    },
    calculationReport: {
      title: `${KUHNI_GEOMETRY_RESOLVER_V120_VERSION} calculation report`,
      theoreticalStagesUsed: theoreticalStages,
      hydraulicResolvedColumnDiameterM: null,
      hydraulicDiagnosticRpm: null,
      hydraulicRpmRange: null,
      finalOperatingRpm: null,
      physicalCompartments: null,
      activeHeightM: null,
      disposition: 'Hydraulic prerequisite blocked; no diameter root was attempted.',
    },
  };
  return { ...result, calculationHash: kuhniRunHash(result) };
}

function rootFailureReason(
  result: ReturnType<typeof resolveKuhniGeometryV110>,
): RootFailureReason | null {
  if (result.hydraulicRpmEnvelope.length > 0) return null;
  const firstRejected = result.rejectedRpmTrials[0];
  if (firstRejected) {
    return {
      code: firstRejected.reason,
      message: `No in-range diameter root was retained. First rejected RPM ${firstRejected.rpm}: ${firstRejected.reason}.`,
    };
  }
  if (result.excludedExtrapolatedTrials.length > 0) {
    return {
      code: 'NO_CALCULATED_IN_RANGE_TRIAL',
      message: 'Diameter roots exist only as excluded extrapolated trials; no CALCULATED_IN_RANGE Stage-3 trial is available for display or lineage.',
    };
  }
  return {
    code: 'NO_STAGE3_DIAMETER_ROOT',
    message: 'No Stage-3 diameter root was retained within the physical search bounds.',
  };
}

/**
 * Active Stage-3 resolver.  Only the source-supported density orientation
 * reaches V1.1.0's drag/holdup/flooding equations.  The reverse orientation
 * returns a persisted, hashable unsupported result with no old diameter
 * fallback.
 */
export function resolveKuhniGeometryV120(
  basis: HydrodynamicProcessBasis,
  theoreticalStages: TheoreticalStageAuthority,
) {
  const selection = phaseSelection(basis);
  const prerequisite = selectPrerequisite(basis, selection);
  const phaseMetadata = makePhaseMetadata(basis, selection, prerequisite.code);

  if (prerequisite.code !== KUHNI_HYDRAULIC_PREREQUISITE_CODES.SUPPORTED_DENSITY_ORIENTATION) {
    return unsupportedResult(basis, theoreticalStages, prerequisite, phaseMetadata);
  }

  const historical = resolveKuhniGeometryV110(basis, theoreticalStages);
  const { calculationHash: _historicalCalculationHash, ...historicalPayload } = historical;
  const resolvedPhaseMetadata = addDiagnosticVelocities(
    phaseMetadata,
    historical.hydraulicDiagnosticPoint,
    selection,
  );
  const result = {
    ...historicalPayload,
    engine: engineForV120(),
    hydraulicPrerequisite: prerequisite,
    phaseMetadata: resolvedPhaseMetadata,
    rootFailureReason: rootFailureReason(historical),
    rejectedRpmTrials: historical.rejectedRpmTrials.map((trial) => ({
      ...trial,
      message: `No in-range diameter root was retained at ${trial.rpm} RPM: ${trial.reason}.`,
    })),
    evidence: {
      ...historical.evidence,
      phaseOrientation: {
        status: 'SUPPORTED_SOURCE_ORIENTATION',
        sourceOrientation: phaseMetadata.sourceApplicability.sourceOrientation,
        message: prerequisite.message,
      },
    },
    calculationReport: {
      ...historical.calculationReport,
      title: `${KUHNI_GEOMETRY_RESOLVER_V120_VERSION} calculation report`,
    },
  };
  return { ...result, calculationHash: kuhniRunHash(result) };
}

export type KuhniGeometryV120Result = ReturnType<typeof resolveKuhniGeometryV120>;
