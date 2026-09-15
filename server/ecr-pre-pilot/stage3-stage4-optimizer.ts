import { createHash } from 'node:crypto';
import {
  evaluateKuhniHydrodynamics,
  kuhniRunHash,
  type HydrodynamicProcessBasis,
} from './kuhni-hydrodynamics';
import {
  evaluateKuhniReverseTrial,
  type KuhniReverseTrialDiagnostic,
} from './kuhni-geometry-resolver-v140';
import { evaluateKuhniHydraulicTrial } from './kuhni-geometry-resolver';
export { evaluateKuhniReverseTrial };

/**
 * This is an additive optimizer.  The V1.1-V1.5 resolver implementations are
 * intentionally not imported here: their hashes and replay contracts are
 * historical records and must remain frozen.
 */
export const ECR_STAGE3_STAGE4_OPTIMIZER_VERSION =
  'ECR_STAGE3_STAGE4_OPTIMIZER_V1.1.0';
/**
 * The pre-correction engine remains named here so immutable rows written by
 * V1.0.0 can still be replayed and verified.  It is deliberately not returned
 * by a current-result query and is never used for new runs.
 */
export const ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_VERSION =
  'ECR_STAGE3_STAGE4_OPTIMIZER_V1.0.0';
const LEGACY_OPTIMIZER_DESCRIPTOR = [
  ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_VERSION,
  'fixed-design-nt:7',
  'stage2-nt:reference-only',
  'grid:D|hc/D=.20,.25,.30|rotor/D=.33,.40,.50|free-area=.20,.30,.40|rpm=30..70',
  'accepted-basis:Np=1.2|existing-d32|larger-diameter-scale-up-disclosed',
  'candidate-forward-model:kuhni-phase1-primitives',
  'selection:fixed-geometry-useful-rpm-window-not-minimum-d-or-maximum-rpm',
  'root-search:bounded-finite-grid-bisection-all-brackets',
].join('|');
export const ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_HASH = createHash('sha256')
  .update(LEGACY_OPTIMIZER_DESCRIPTOR)
  .digest('hex');
const OPTIMIZER_DESCRIPTOR = [
  ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
  'fixed-design-nt:7',
  'stage2-nt:reference-only',
  'grid:D|hc/D=.20,.25,.30|rotor/D=.33,.40,.50|free-area=.20,.30,.40|rpm=30..70',
  'accepted-basis:Np=1.2|existing-d32|larger-diameter-scale-up-disclosed',
  'candidate-forward-model:kuhni-phase1-primitives',
  'selection:useful-window-preference-then-smallest-adequate-diameter-then-wider-frontier',
  'useful-window-preference:configurable-ranking-preference-default-15-rpm-not-hydraulic-limit',
  'root-search:bounded-finite-grid-bisection-all-brackets',
].join('|');
export const ECR_STAGE3_STAGE4_OPTIMIZER_HASH = createHash('sha256')
  .update(OPTIMIZER_DESCRIPTOR)
  .digest('hex');
// Short aliases are kept for callers that refer to this as the Stage-3
// optimizer while the persisted engine identifier remains unambiguous.
export const STAGE3_OPTIMIZER_VERSION = ECR_STAGE3_STAGE4_OPTIMIZER_VERSION;
export const STAGE3_OPTIMIZER_IMPLEMENTATION_HASH = ECR_STAGE3_STAGE4_OPTIMIZER_HASH;

export const ECR_STAGE3_STAGE4_DESIGN_NT = 7 as const;
export const OPTIMIZER_RPM_MIN = 30;
export const OPTIMIZER_RPM_MAX = 70;
export const OPTIMIZER_DEFAULT_RPM_STEP = 5;
export const OPTIMIZER_HC_TO_COLUMN_GRID = [0.2, 0.25, 0.3] as const;
export const OPTIMIZER_ROTOR_TO_COLUMN_GRID = [0.33, 0.4, 0.5] as const;
export const OPTIMIZER_FREE_AREA_GRID = [0.2, 0.3, 0.4] as const;
export const OPTIMIZER_DEFAULT_DIAMETER_MIN_M = 0.2;
export const OPTIMIZER_DEFAULT_DIAMETER_MAX_M = 1.5;
export const OPTIMIZER_DEFAULT_DIAMETER_STEP_M = 0.1;
export const OPTIMIZER_DEFAULT_MINIMUM_USEFUL_WINDOW_RPM = 15;

type Orientation =
  | 'nmp-continuous-rrbo-dispersed'
  | 'rrbo-continuous-nmp-dispersed';

export type Stage3Stage4OptimizerControls = {
  diameterMinM?: number;
  diameterMaxM?: number;
  diameterStepM?: number;
  rpmMin?: number;
  rpmMax?: number;
  rpmStep?: number;
  hcToColumn?: number[];
  rotorToColumn?: number[];
  freeArea?: number[];
  compareOrientations?: boolean;
  /**
   * Ranking preference only.  This does not reject a hydraulic trial or
   * change the accepted 30..70 rpm search bounds.
   */
  minimumUsefulWindowRpm?: number;
};

export type CanonicalStage3Stage4OptimizerControls = {
  diameterMinM: number;
  diameterMaxM: number;
  diameterStepM: number;
  rpmMin: number;
  rpmMax: number;
  rpmStep: number;
  hcToColumn: number[];
  rotorToColumn: number[];
  freeArea: number[];
  compareOrientations: boolean;
  minimumUsefulWindowRpm: number;
};

type Candidate = {
  diameterM: number;
  hcToColumn: number;
  rotorToColumn: number;
  freeArea: number;
  compartmentHeightM: number;
  rotorDiameterM: number;
  rpm: number;
  tipSpeedMS: number;
  powerW: number;
  powerVolumeWM3: number;
  psiWKg: number;
  d32M: number | null;
  holdup: number | null;
  interfacialAreaM2M3: number | null;
  actualLoading: number | null;
  designFloodFraction?: number | null;
  signedForceBalanceResidualN?: number | null;
  buoyancyDirection?: 'DISPERSED_UPWARD' | 'DISPERSED_DOWNWARD' | null;
  hydraulicPass?: boolean | null;
  rotorReynolds: number;
  status: 'FEASIBLE' | 'INFEASIBLE';
  validity: 'IN_RANGE' | 'SCALE_UP_EXTRAPOLATION' | 'PHYSICAL_INVALID';
  reasons: string[];
  sourceDiagnostics: string[];
};

export type GeometryGroup = {
  geometry: {
    columnDiameterM: number;
    compartmentHeightM: number;
    hcToColumn: number;
    rotorDiameterM: number;
    rotorToColumn: number;
    freeArea: number;
  };
  trials: Candidate[];
  operatingWindow: {
    rpmMin: number;
    rpmMax: number;
    widthRpm: number;
    validTrialCount: number;
    edgeMarginRpm: number;
  } | null;
  score: {
    windowWidthRpm: number;
    edgeMarginRpm: number;
    validTrialCount: number;
    centerDistanceRpm: number;
    tieBreakPowerVolumeWM3: number;
  };
  /** Ranking metadata is additive and never enters hydraulic admission. */
  meetsUsefulWindowPreference?: boolean;
};

export type OptimizerRankingAlternative = {
  role:
    | 'SELECTED_COMPACT'
    | 'WIDER_FRONTIER'
    | 'FRONTIER_ALTERNATIVE'
    | 'SIZE_WINDOW_COMPARISON'
    | 'BEST_AVAILABLE';
  geometry: GeometryGroup['geometry'];
  operatingWindow: NonNullable<GeometryGroup['operatingWindow']>;
  meetsUsefulWindowPreference: boolean;
  representativeTrial: {
    rpm: number;
    tipSpeedMS: number;
    actualLoading: number | null;
    designFloodFraction: number | null;
    d32M: number | null;
    holdup: number | null;
    powerVolumeWM3: number;
  } | null;
  rationale: string;
};

export type OptimizerRankingEvidence = {
  usefulWindowPreference: {
    minimumWindowWidthRpm: number;
    meaning: 'RANKING_PREFERENCE_NOT_HYDRAULIC_LIMIT';
    adequateGeometryCount: number;
    selectedMeetsPreference: boolean;
  };
  paretoFrontier: OptimizerRankingAlternative[];
  sizeWindowComparisons: OptimizerRankingAlternative[];
  alternatives: OptimizerRankingAlternative[];
};

type OrientationResult = {
  orientation: Orientation;
  status: 'SELECTED' | 'FEASIBLE_COMPARISON' | 'NO_FEASIBLE_WINDOW';
  phaseSelection: {
    continuousIdentity: string;
    dispersedIdentity: string;
    continuousFlowM3S: number;
    dispersedFlowM3S: number;
    continuousDensityKgM3: number;
    dispersedDensityKgM3: number;
  };
  selectedGeometry: GeometryGroup['geometry'] | null;
  operatingWindow: GeometryGroup['operatingWindow'];
  selectedScore: GeometryGroup['score'] | null;
  rankingEvidence?: OptimizerRankingEvidence;
  selectedRpm: number | null;
  selectedTrial: Candidate | null;
  geometryGrid: GeometryGroup[];
  rejectedTrialCount: number;
  rejectionReasons: Array<{ reason: string; count: number }>;
  rootSearch: {
    bounds: { minimumDiameterM: number; maximumDiameterM: number };
    residualDefinition: string;
    brackets: Array<{ lowM: number; highM: number; residualLow: number; residualHigh: number }>;
    rootsM: number[];
    rootResiduals: Array<{ rootM: number; residual: number }>;
    allRootsRetained: true;
  };
  freeAreaSensitivity: {
    status: 'SENSITIVITY_OBSERVED' | 'MODEL_INSENSITIVE_IN_CURRENT_EQUATIONS' | 'NOT_AVAILABLE';
    statement: string;
    variation: { holdupRange: number | null; d32RangeM: number | null; powerVolumeRangeWM3: number | null };
  };
};

export type Stage3Stage4OptimizerResult = {
  schemaVersion: 'ECR_STAGE3_STAGE4_OPTIMIZER_RESULT_V1';
  status: 'OPTIMIZED_FIXED_GEOMETRY_WINDOW' | 'NO_FEASIBLE_ORIENTATION';
  classification: 'PRE_PILOT_HYDRAULIC_SCREENING_NOT_SEPARATION_QUALIFICATION';
  engine: {
    id: 'ecr_stage3_stage4_optimizer';
    version: typeof ECR_STAGE3_STAGE4_OPTIMIZER_VERSION
      | typeof ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_VERSION;
    implementationHash: string;
  };
  stage1Authority: {
    snapshotHash: string;
    phaseConfiguration: Orientation;
    processBasisSchemaVersion: string;
  };
  processBasis: HydrodynamicProcessBasis;
  designNt: {
    value: 7;
    provenance: 'FIXED_DESIGN7';
    stage2IsReferenceOnly: true;
  };
  /** Legacy V1.0 replay rows intentionally omit the additive preference. */
  controls: Omit<CanonicalStage3Stage4OptimizerControls, 'minimumUsefulWindowRpm'>
    & { minimumUsefulWindowRpm?: number };
  selectedOrientation: Orientation | null;
  selectedGeometry: GeometryGroup['geometry'] | null;
  selectedOperatingWindow: GeometryGroup['operatingWindow'];
  selectedRpm: number | null;
  selectedTrial: Candidate | null;
  selectedOrientationDiagnostics: {
    freeAreaSensitivity: OrientationResult['freeAreaSensitivity'] | null;
    rootSearch: OrientationResult['rootSearch'] | null;
    rejectedTrialCount: number;
    rejectionReasons: OrientationResult['rejectionReasons'];
  };
  freeAreaSensitivity: OrientationResult['freeAreaSensitivity'] | null;
  candidateGrid: Array<{
    orientation: Orientation;
    diameterM: number[];
    hcToColumn: number[];
    rotorToColumn: number[];
    freeArea: number[];
    rpm: number[];
  }>;
  selectionRationale: {
    objective: string;
    ordering: string[];
    selectedScore: GeometryGroup['score'] | null;
    usefulWindowPreference?: OptimizerRankingEvidence['usefulWindowPreference'];
    paretoFrontier?: OptimizerRankingAlternative[];
    sizeWindowComparisons?: OptimizerRankingAlternative[];
    alternatives?: OptimizerRankingAlternative[];
  };
  /** Stage 4 consumes this object and never reconstructs hc from D. */
  stage4GeometryInput: {
    status: 'SELECTED_IMMUTABLE_OPTIMIZER_GEOMETRY' | 'UNAVAILABLE';
    columnDiameterM: number | null;
    compartmentHeightM: number | null;
    hcToColumn: number | null;
    rotorDiameterM: number | null;
    rotorToColumn: number | null;
    freeArea: number | null;
    rpm: number | null;
    optimizerResultHash: string | null;
  };
  orientationComparison: OrientationResult[];
  assumptions: string[];
  blockers: string[];
  calculationHash: string;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values.map((value) => Number(value).toFixed(12)))]
    .map(Number)
    .sort((left, right) => left - right);
}

function boundedGrid(
  min: number,
  max: number,
  step: number,
  key: string,
): number[] {
  if (!finite(min) || !finite(max) || !finite(step) || step <= 0 || min > max) {
    throw new Error(`INVALID_STAGE3_STAGE4_OPTIMIZER_${key}`);
  }
  const values: number[] = [];
  for (let value = min; value <= max + step * 1e-9; value += step) {
    values.push(Number(value.toFixed(12)));
    if (values.length > 1000) throw new Error('STAGE3_STAGE4_OPTIMIZER_GRID_TOO_LARGE');
  }
  if (!values.length || values.at(-1)! < max - step * 1e-8) values.push(max);
  return uniqueSorted(values);
}

function boundedChoiceGrid(
  values: readonly number[] | undefined,
  minimum: number,
  maximum: number,
  key: string,
  fallback: readonly number[],
): number[] {
  const chosen = values?.length ? values : fallback;
  if (chosen.length > 50) throw new Error('STAGE3_STAGE4_OPTIMIZER_GRID_TOO_LARGE');
  const result = uniqueSorted(chosen);
  if (!result.length || result.some((value) => !finite(value) || value < minimum || value > maximum)) {
    throw new Error(`INVALID_STAGE3_STAGE4_OPTIMIZER_${key}`);
  }
  return result;
}

export function canonicalizeStage3Stage4OptimizerControls(
  raw?: unknown,
): CanonicalStage3Stage4OptimizerControls {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const numberOr = (key: string, fallback: number) =>
    source[key] === undefined ? fallback : Number(source[key]);
  const diameterMinM = numberOr('diameterMinM', OPTIMIZER_DEFAULT_DIAMETER_MIN_M);
  const diameterMaxM = numberOr('diameterMaxM', OPTIMIZER_DEFAULT_DIAMETER_MAX_M);
  const diameterStepM = numberOr('diameterStepM', OPTIMIZER_DEFAULT_DIAMETER_STEP_M);
  const rpmMin = numberOr('rpmMin', OPTIMIZER_RPM_MIN);
  const rpmMax = numberOr('rpmMax', OPTIMIZER_RPM_MAX);
  const rpmStep = numberOr('rpmStep', OPTIMIZER_DEFAULT_RPM_STEP);
  // This value is intentionally a preference, not an admission bound.  A
  // caller may request a threshold larger than the bounded search span; in
  // that case the deterministic ranking records that no candidate met it and
  // still returns the best available hydraulic window.
  const preferenceSource = source.minimumUsefulWindowRpm === undefined
    ? source.minimumWindowWidthRpm === undefined
      ? source.usefulWindowMinRpm
      : source.minimumWindowWidthRpm
    : source.minimumUsefulWindowRpm;
  const minimumUsefulWindowRpm = preferenceSource === undefined
    ? OPTIMIZER_DEFAULT_MINIMUM_USEFUL_WINDOW_RPM
    : (typeof preferenceSource === 'number'
      || (typeof preferenceSource === 'string' && preferenceSource.trim() !== ''))
      ? Number(preferenceSource)
      : Number.NaN;
  if (
    !finite(diameterMinM) || !finite(diameterMaxM) || diameterMinM <= 0
    || diameterMaxM <= diameterMinM || diameterMaxM > 5 || diameterStepM <= 0
    || diameterStepM > diameterMaxM - diameterMinM
  ) throw new Error('INVALID_STAGE3_STAGE4_OPTIMIZER_DIAMETER_GRID');
  if (
    !finite(rpmMin) || !finite(rpmMax) || rpmMin < OPTIMIZER_RPM_MIN
    || rpmMax > OPTIMIZER_RPM_MAX || rpmMax < rpmMin
    || !finite(rpmStep) || rpmStep <= 0
  ) throw new Error('INVALID_STAGE3_STAGE4_OPTIMIZER_RPM_GRID');
  if (!finite(minimumUsefulWindowRpm) || minimumUsefulWindowRpm < 0) {
    throw new Error('INVALID_STAGE3_STAGE4_OPTIMIZER_USEFUL_WINDOW_PREFERENCE');
  }
  const controls = {
    diameterMinM,
    diameterMaxM,
    diameterStepM,
    rpmMin,
    rpmMax,
    rpmStep,
    hcToColumn: boundedChoiceGrid(
      source.hcToColumn as number[] | undefined, 0.2, 0.3, 'HC_TO_COLUMN_GRID',
      OPTIMIZER_HC_TO_COLUMN_GRID,
    ),
    rotorToColumn: boundedChoiceGrid(
      source.rotorToColumn as number[] | undefined, 0.33, 0.5, 'ROTOR_TO_COLUMN_GRID',
      OPTIMIZER_ROTOR_TO_COLUMN_GRID,
    ),
    freeArea: boundedChoiceGrid(
      source.freeArea as number[] | undefined, 0.2, 0.4, 'FREE_AREA_GRID',
      OPTIMIZER_FREE_AREA_GRID,
    ),
    compareOrientations: source.compareOrientations === undefined
      ? true
      : Boolean(source.compareOrientations),
    minimumUsefulWindowRpm,
  };
  const diameterCount = Math.ceil((diameterMaxM - diameterMinM) / diameterStepM) + 1;
  const rpmCount = Math.ceil((rpmMax - rpmMin) / rpmStep) + 1;
  if (diameterCount * rpmCount * controls.hcToColumn.length
    * controls.rotorToColumn.length * controls.freeArea.length > 20000) {
    throw new Error('STAGE3_STAGE4_OPTIMIZER_GRID_TOO_LARGE');
  }
  return controls;
}

/**
 * Return every sign-changing bracket, including a zero-valued grid point.
 * The optimizer does not silently discard a second root when a residual is
 * non-monotone.
 */
export function findAllBoundedRootBrackets(
  samples: readonly { x: number; residual: number }[],
): Array<{ low: number; high: number; residualLow: number; residualHigh: number }> {
  const sorted = [...samples]
    .filter((sample) => finite(sample.x) && finite(sample.residual))
    .sort((left, right) => left.x - right.x);
  const brackets: Array<{ low: number; high: number; residualLow: number; residualHigh: number }> = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current.residual === 0) {
      brackets.push({
        low: current.x, high: current.x,
        residualLow: current.residual, residualHigh: current.residual,
      });
    }
    const next = sorted[index + 1];
    if (next && current.residual * next.residual < 0) {
      brackets.push({
        low: current.x, high: next.x,
        residualLow: current.residual, residualHigh: next.residual,
      });
    }
  }
  return brackets;
}

function bisectRoot(
  residual: (x: number) => number,
  low: number,
  high: number,
): number {
  if (low === high) return low;
  let fLow = residual(low);
  let fHigh = residual(high);
  if (!finite(fLow) || !finite(fHigh) || fLow * fHigh > 0) {
    throw new Error('STAGE3_STAGE4_OPTIMIZER_ROOT_NOT_BRACKETED');
  }
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (low + high) / 2;
    const fMiddle = residual(middle);
    if (!finite(fMiddle)) throw new Error('STAGE3_STAGE4_OPTIMIZER_NON_FINITE_ROOT_RESIDUAL');
    if (Math.abs(fMiddle) <= 1e-10 || Math.abs(high - low) <= 1e-10) return middle;
    if (fLow * fMiddle <= 0) {
      high = middle;
      fHigh = fMiddle;
    } else {
      low = middle;
      fLow = fMiddle;
    }
  }
  return (low + high) / 2;
}

function phaseProperties(basis: HydrodynamicProcessBasis) {
  const reverse = basis.phaseConfiguration === 'rrbo-continuous-nmp-dispersed';
  const continuous = reverse ? basis.rrboFeed : basis.wetSolventPhase;
  const dispersed = reverse ? basis.wetSolventPhase : basis.rrboFeed;
  return { continuous, dispersed };
}

function trialFromRecord(
  record: Record<string, any>,
  diameterM: number,
  hcToColumn: number,
  rotorToColumn: number,
  freeArea: number,
  rpm: number,
): Candidate {
  const geometry = record.records?.[0]?.geometry;
  const reasonSet = [
    ...(Array.isArray(record.blockers) ? record.blockers : []),
    ...(Array.isArray(record.applicabilityDiagnostics) ? record.applicabilityDiagnostics : []),
  ].map(String);
  const tipSpeedMS = Number(record.records?.[0]?.tipSpeedMS);
  const recordRow = record.records?.[0] ?? {};
  const d32M = finite(recordRow.d32M) ? recordRow.d32M : null;
  const holdup = finite(recordRow.phiD) ? recordRow.phiD : null;
  const interfacialAreaM2M3 = finite(recordRow.interfacialAreaM2M3)
    ? recordRow.interfacialAreaM2M3 : null;
  const physicalReasons: string[] = [];
  if (!positive(diameterM) || !positive(diameterM * hcToColumn)) physicalReasons.push('NON_POSITIVE_GEOMETRY');
  if (!(rotorToColumn > 0 && rotorToColumn < 1)) physicalReasons.push('ROTOR_NOT_BELOW_COLUMN');
  if (!positive(tipSpeedMS) || tipSpeedMS > 4.5) physicalReasons.push('TIP_SPEED_LIMIT_EXCEEDED');
  if (!positive(recordRow.powerW) || !positive(recordRow.powerVolumeWM3) || !positive(recordRow.psiWKg)) {
    physicalReasons.push('POWER_STATE_NOT_PHYSICAL');
  }
  if (!positive(d32M)) physicalReasons.push('D32_NOT_CALCULABLE');
  if (!(finite(holdup) && holdup > 0 && holdup < 1)) physicalReasons.push('HOLdup_NOT_CALCULABLE');
  if (!positive(interfacialAreaM2M3)) physicalReasons.push('INTERFACIAL_AREA_NOT_CALCULABLE');
  if (recordRow.status === 'PRELIMINARY_DIAGNOSTIC_HOLD' && reasonSet.some((reason) => reason.includes('NOT_CALCULABLE'))) {
    physicalReasons.push('EQUATION_STATE_NOT_CALCULABLE');
  }
  const sourceOutOfRange = reasonSet.some((reason) => reason.startsWith('TABLE_1_OUT_OF_RANGE'));
  return {
    diameterM,
    hcToColumn,
    rotorToColumn,
    freeArea,
    compartmentHeightM: diameterM * hcToColumn,
    rotorDiameterM: diameterM * rotorToColumn,
    rpm,
    tipSpeedMS,
    powerW: Number(recordRow.powerW),
    powerVolumeWM3: Number(recordRow.powerVolumeWM3),
    psiWKg: Number(recordRow.psiWKg),
    d32M,
    holdup,
    interfacialAreaM2M3,
    actualLoading: null,
    designFloodFraction: null,
    signedForceBalanceResidualN: null,
    buoyancyDirection: null,
    hydraulicPass: null,
    rotorReynolds: Number(recordRow.rotorReynolds),
    status: physicalReasons.length ? 'INFEASIBLE' : 'FEASIBLE',
    validity: physicalReasons.length ? 'PHYSICAL_INVALID' : sourceOutOfRange
      ? 'SCALE_UP_EXTRAPOLATION' : 'IN_RANGE',
    reasons: physicalReasons,
    sourceDiagnostics: reasonSet,
  };
}

function reverseTrialFromRecord(
  record: KuhniReverseTrialDiagnostic,
  diameterM: number,
  hcToColumn: number,
  rotorToColumn: number,
  freeArea: number,
  rpm: number,
): Candidate {
  const physicalReasons: string[] = [];
  if (!(record.tipSpeedMS > 0) || record.tipSpeedMS > 4.5) {
    physicalReasons.push('TIP_SPEED_LIMIT_EXCEEDED');
  }
  if (!(record.d32M > 0 && Number.isFinite(record.d32M))) {
    physicalReasons.push('D32_NOT_CALCULABLE');
  }
  if (!(record.floodHoldup > 0 && record.floodHoldup < 1)) {
    physicalReasons.push('SIGNED_REVERSE_HOLDUP_NOT_CALCULABLE');
  }
  if (!(record.actualLoading > 0 && Number.isFinite(record.actualLoading))) {
    physicalReasons.push('SIGNED_REVERSE_LOADING_NOT_CALCULABLE');
  } else if (record.actualLoading > record.designFloodFraction) {
    physicalReasons.push('ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION');
  }
  if (!(record.powerW > 0 && record.powerVolumeWM3 > 0 && record.psiWKg > 0)) {
    physicalReasons.push('POWER_STATE_NOT_PHYSICAL');
  }
  if (
    !Number.isFinite(record.terminal.forceBalanceResidualN)
    || Math.abs(record.terminal.forceBalanceResidualN) > 1e-8
  ) {
    physicalReasons.push('SIGNED_FORCE_BALANCE_RESIDUAL_NOT_CLOSED');
  }
  return {
    diameterM,
    hcToColumn,
    rotorToColumn,
    freeArea,
    compartmentHeightM: record.compartmentHeightM,
    rotorDiameterM: record.rotorDiameterM,
    rpm,
    tipSpeedMS: record.tipSpeedMS,
    powerW: record.powerW,
    powerVolumeWM3: record.powerVolumeWM3,
    psiWKg: record.psiWKg,
    d32M: record.d32M,
    holdup: record.floodHoldup,
    interfacialAreaM2M3: record.d32M > 0 ? 6 * record.floodHoldup / record.d32M : null,
    actualLoading: record.actualLoading,
    designFloodFraction: record.designFloodFraction,
    signedForceBalanceResidualN: record.terminal.forceBalanceResidualN,
    buoyancyDirection: record.terminal.buoyancyDirection,
    // V1.4 deliberately marks reverse trials diagnostic-only. The optimizer
    // derives its bounded pre-pilot admission independently from the signed
    // force closure, finite physical state, tip-speed ceiling and the
    // established 70% design-flood cap.
    hydraulicPass: physicalReasons.length === 0,
    rotorReynolds: record.rotorReynolds,
    status: physicalReasons.length ? 'INFEASIBLE' : 'FEASIBLE',
    validity: physicalReasons.length ? 'PHYSICAL_INVALID' : 'SCALE_UP_EXTRAPOLATION',
    reasons: physicalReasons,
    sourceDiagnostics: [
      'REVERSE_ORIENTATION_SIGNED_FORCE_BALANCE_DIAGNOSTIC_ONLY',
      ...(record.applicability?.codes ?? []),
    ],
  };
}

function evaluateTrial(
  basis: HydrodynamicProcessBasis,
  diameterM: number,
  hcToColumn: number,
  rotorToColumn: number,
  freeArea: number,
  rpm: number,
): Candidate {
  try {
    if (basis.phaseConfiguration === 'rrbo-continuous-nmp-dispersed') {
      const reverse = evaluateKuhniReverseTrial(
        diameterM,
        rpm,
        basis,
        {
          rotorToColumn,
          compartmentToColumn: hcToColumn,
          statorFreeArea: freeArea,
          powerNumber: 1.2,
          directTurbulenceC: 0.42,
        },
      );
      return reverseTrialFromRecord(
        reverse,
        diameterM,
        hcToColumn,
        rotorToColumn,
        freeArea,
        rpm,
      );
    }
    const result = evaluateKuhniHydrodynamics({
      columnDiameterM: diameterM,
      rotorDiameterM: diameterM * rotorToColumn,
      rotorToColumnRatio: rotorToColumn,
      compartmentHeightM: diameterM * hcToColumn,
      statorFreeAreaFraction: freeArea,
      rotorSpeedRpmMin: rpm,
      rotorSpeedRpmMax: rpm,
      rotorSpeedRpmStep: 1,
      powerNumber: 1.2,
      directTurbulenceC: 0.42,
      allowApplicabilityExtrapolation: true,
    }, basis) as Record<string, any>;
    const candidate = trialFromRecord(result, diameterM, hcToColumn, rotorToColumn, freeArea, rpm);
    const hydraulicTrial = evaluateKuhniHydraulicTrial(
      diameterM,
      rpm,
      basis,
      {
        rotorToColumn,
        compartmentToColumn: hcToColumn,
        statorFreeArea: freeArea,
        powerNumber: 1.2,
        directTurbulenceC: 0.42,
      },
    );
    candidate.actualLoading = hydraulicTrial.actualLoading;
    candidate.designFloodFraction = hydraulicTrial.designFloodFraction;
    candidate.sourceDiagnostics = [
      ...candidate.sourceDiagnostics,
      ...(hydraulicTrial.applicability ?? []),
    ];
    if (!hydraulicTrial.hydraulicPass) {
      candidate.reasons.push('ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION');
    }
    candidate.hydraulicPass = hydraulicTrial.hydraulicPass && candidate.reasons.length === 0;
    if (!candidate.hydraulicPass) {
      candidate.status = 'INFEASIBLE';
      candidate.validity = 'PHYSICAL_INVALID';
    }
    return candidate;
  } catch (error) {
    return {
      diameterM, hcToColumn, rotorToColumn, freeArea,
      compartmentHeightM: diameterM * hcToColumn,
      rotorDiameterM: diameterM * rotorToColumn,
      rpm, tipSpeedMS: Number.NaN, powerW: Number.NaN,
      powerVolumeWM3: Number.NaN, psiWKg: Number.NaN, d32M: null,
      holdup: null, interfacialAreaM2M3: null, actualLoading: null,
      designFloodFraction: null,
      signedForceBalanceResidualN: null, buoyancyDirection: null, hydraulicPass: null,
      rotorReynolds: Number.NaN, status: 'INFEASIBLE',
      validity: 'PHYSICAL_INVALID',
      reasons: [error instanceof Error ? error.message : 'TRIAL_EVALUATION_FAILED'],
      sourceDiagnostics: [],
    };
  }
}

function geometryKey(diameterM: number, hc: number, rotor: number, free: number) {
  return [diameterM, hc, rotor, free].map((value) => value.toFixed(12)).join('|');
}

function selectLegacyWindow(groups: GeometryGroup[]): GeometryGroup | null {
  const feasible = groups.filter((group) => group.operatingWindow);
  feasible.sort((left, right) =>
    right.score.windowWidthRpm - left.score.windowWidthRpm
    || right.score.edgeMarginRpm - left.score.edgeMarginRpm
    || right.score.validTrialCount - left.score.validTrialCount
    || left.score.centerDistanceRpm - right.score.centerDistanceRpm
    || left.score.tieBreakPowerVolumeWM3 - right.score.tieBreakPowerVolumeWM3
    || left.geometry.columnDiameterM - right.geometry.columnDiameterM
    || left.geometry.hcToColumn - right.geometry.hcToColumn
    || left.geometry.rotorToColumn - right.geometry.rotorToColumn
    || left.geometry.freeArea - right.geometry.freeArea,
  );
  return feasible[0] ?? null;
}

function rankingStableTie(left: GeometryGroup, right: GeometryGroup): number {
  return right.score.edgeMarginRpm - left.score.edgeMarginRpm
    || right.score.validTrialCount - left.score.validTrialCount
    || left.score.centerDistanceRpm - right.score.centerDistanceRpm
    || left.score.tieBreakPowerVolumeWM3 - right.score.tieBreakPowerVolumeWM3
    || left.geometry.columnDiameterM - right.geometry.columnDiameterM
    || left.geometry.hcToColumn - right.geometry.hcToColumn
    || left.geometry.rotorToColumn - right.geometry.rotorToColumn
    || left.geometry.freeArea - right.geometry.freeArea;
}

function groupWidth(group: GeometryGroup): number {
  return group.operatingWindow?.widthRpm ?? Number.NEGATIVE_INFINITY;
}

function dominatesForSizeWindow(left: GeometryGroup, right: GeometryGroup): boolean {
  const leftWidth = groupWidth(left);
  const rightWidth = groupWidth(right);
  const noLarger = left.geometry.columnDiameterM <= right.geometry.columnDiameterM;
  const noNarrower = leftWidth >= rightWidth;
  const strictlyBetter = left.geometry.columnDiameterM < right.geometry.columnDiameterM
    || leftWidth > rightWidth;
  return noLarger && noNarrower && strictlyBetter;
}

function representativeTrial(group: GeometryGroup): Candidate | null {
  if (!group.operatingWindow) return null;
  const midpoint = (group.operatingWindow.rpmMin + group.operatingWindow.rpmMax) / 2;
  return [...group.trials]
    .filter((trial) =>
      trial.status === 'FEASIBLE'
      && trial.rpm >= group.operatingWindow!.rpmMin
      && trial.rpm <= group.operatingWindow!.rpmMax)
    .sort((left, right) =>
      Math.abs(left.rpm - midpoint) - Math.abs(right.rpm - midpoint)
      // A midpoint tie is resolved toward the higher occupied RPM so the
      // representative agrees with the corrected selected-trial rule.
      || right.rpm - left.rpm
      || left.powerVolumeWM3 - right.powerVolumeWM3)[0] ?? null;
}

function selectedAlternativeRole(
  selected: GeometryGroup | null,
  minimumUsefulWindowRpm: number,
): OptimizerRankingAlternative['role'] {
  return selected?.operatingWindow
    && selected.operatingWindow.widthRpm >= minimumUsefulWindowRpm - 1e-12
    ? 'SELECTED_COMPACT'
    : 'BEST_AVAILABLE';
}

function representativeTrialEvidence(group: GeometryGroup) {
  const trial = representativeTrial(group);
  return trial
    ? {
      rpm: trial.rpm,
      tipSpeedMS: trial.tipSpeedMS,
      actualLoading: trial.actualLoading,
      designFloodFraction: trial.designFloodFraction ?? null,
      d32M: trial.d32M,
      holdup: trial.holdup,
      powerVolumeWM3: trial.powerVolumeWM3,
    }
    : null;
}

function summarizeRankingAlternative(
  group: GeometryGroup,
  role: OptimizerRankingAlternative['role'],
  minimumUsefulWindowRpm: number,
  selected: GeometryGroup | null,
  rationaleOverride?: string,
): OptimizerRankingAlternative {
  const operatingWindow = group.operatingWindow!;
  const meets = operatingWindow.widthRpm >= minimumUsefulWindowRpm - 1e-12;
  const selectedText = selected && group === selected
    ? selectedAlternativeRole(selected, minimumUsefulWindowRpm) === 'SELECTED_COMPACT'
      ? 'It is the selected smallest adequate geometry.'
      : 'No geometry met the useful-window preference; it is the best available hydraulic window, not a smallest adequate geometry.'
    : meets
      ? 'It meets the useful-window preference and is retained for size/window review.'
      : 'It is retained as a below-preference hydraulic fallback/frontier point.';
  const rationale = rationaleOverride ?? (role === 'WIDER_FRONTIER'
    ? `It trades a larger column for the widest retained frontier window (${operatingWindow.widthRpm} rpm). ${selectedText}`
    : selectedText);
  return {
    role,
    geometry: group.geometry,
    operatingWindow,
    meetsUsefulWindowPreference: meets,
    representativeTrial: representativeTrialEvidence(group),
    rationale,
  };
}

function bestFeasibleGroupAtDiameter(
  groups: readonly GeometryGroup[],
  diameterM: number,
): GeometryGroup | null {
  return [...groups]
    .filter((group) =>
      group.operatingWindow !== null
      && Math.abs(group.geometry.columnDiameterM - diameterM) <= 1e-12)
    .sort((left, right) =>
      groupWidth(right) - groupWidth(left)
      || rankingStableTie(left, right))[0] ?? null;
}

function buildSizeWindowComparisons(
  feasible: readonly GeometryGroup[],
  selected: GeometryGroup | null,
  wider: GeometryGroup | null,
  minimumUsefulWindowRpm: number,
): OptimizerRankingAlternative[] {
  if (!selected) return [];
  const selectedDiameter = selected.geometry.columnDiameterM;
  const occupiedLargerDiameters = uniqueSorted(
    feasible
      .map((group) => group.geometry.columnDiameterM)
      .filter((diameterM) => diameterM > selectedDiameter + 1e-12),
  );
  const comparisonDiameters = occupiedLargerDiameters.slice(0, 2);
  if (
    wider
    && !comparisonDiameters.some((diameterM) =>
      Math.abs(diameterM - wider.geometry.columnDiameterM) <= 1e-12)
  ) {
    comparisonDiameters.push(wider.geometry.columnDiameterM);
  }
  const comparisonGroups = [
    selected,
    ...comparisonDiameters
      .map((diameterM) => bestFeasibleGroupAtDiameter(feasible, diameterM))
      .filter((group): group is GeometryGroup => Boolean(group)),
  ];
  return comparisonGroups.map((group) => {
    const isSelected = group === selected;
    const isWider = wider === group;
    const widthDelta = isSelected || !selected
      ? 0
      : groupWidth(group) - groupWidth(selected);
    const widthStatement = isSelected
      ? selectedAlternativeRole(selected, minimumUsefulWindowRpm) === 'SELECTED_COMPACT'
        ? 'It is the selected smallest adequate occupied-grid geometry.'
        : 'No geometry met the useful-window preference; this is the best available hydraulic window and not a smallest adequate geometry.'
      : Math.abs(widthDelta) <= 1e-12
        ? `Its contiguous window is the same width as the selected ${selectedDiameter.toFixed(3)} m candidate; the diameter-first rule therefore retains the smaller selected geometry without a cost assumption.`
        : widthDelta > 0
          ? `It adds ${widthDelta} rpm of window width versus the selected ${selectedDiameter.toFixed(3)} m candidate and is retained as an occupied-grid size/window comparison.`
          : `Its window is ${Math.abs(widthDelta)} rpm narrower than the selected ${selectedDiameter.toFixed(3)} m candidate; it remains visible as an occupied-grid comparison.`;
    return summarizeRankingAlternative(
      group,
      isSelected
        ? selectedAlternativeRole(selected, minimumUsefulWindowRpm)
        : isWider ? 'WIDER_FRONTIER' : 'SIZE_WINDOW_COMPARISON',
      minimumUsefulWindowRpm,
      selected,
      widthStatement,
    );
  });
}

/**
 * Rank only already-admitted hydraulic geometry groups.  This function never
 * changes trial admission: the useful-window value is an explicit preference
 * used after the hydraulic envelope has been formed.
 *
 * The first decision is adequacy (window >= preference).  Among adequate
 * groups, the smallest diameter wins; width, edge margin and the remaining
 * deterministic fields only resolve equal-size ties.  If no group meets the
 * preference, the widest available group is returned and the evidence records
 * that the preference was unmet.  The Pareto frontier and the next occupied
 * size-grid comparisons are retained to make the size/window tradeoff
 * auditable without an invented cost or power weight.
 */
export function rankGeometryGroups(
  groups: readonly GeometryGroup[],
  minimumUsefulWindowRpm = OPTIMIZER_DEFAULT_MINIMUM_USEFUL_WINDOW_RPM,
): {
  selected: GeometryGroup | null;
  adequateGeometryCount: number;
  paretoFrontier: GeometryGroup[];
  sizeWindowComparisons: OptimizerRankingAlternative[];
  alternatives: OptimizerRankingAlternative[];
} {
  if (!finite(minimumUsefulWindowRpm) || minimumUsefulWindowRpm < 0) {
    throw new Error('INVALID_STAGE3_STAGE4_OPTIMIZER_USEFUL_WINDOW_PREFERENCE');
  }
  const feasible = groups.filter((group) => group.operatingWindow !== null);
  const adequate = feasible.filter((group) =>
    group.operatingWindow!.widthRpm >= minimumUsefulWindowRpm - 1e-12);
  const pool = adequate.length ? adequate : feasible;
  const ranked = [...pool].sort((left, right) => {
    if (!adequate.length) {
      return groupWidth(right) - groupWidth(left)
        || left.geometry.columnDiameterM - right.geometry.columnDiameterM
        || rankingStableTie(left, right);
    }
    return left.geometry.columnDiameterM - right.geometry.columnDiameterM
      || groupWidth(right) - groupWidth(left)
      || rankingStableTie(left, right);
  });
  const selected = ranked[0] ?? null;
  const paretoFrontier = feasible
    .filter((group) => !feasible.some((other) => other !== group
      && dominatesForSizeWindow(other, group)))
    .sort((left, right) =>
      left.geometry.columnDiameterM - right.geometry.columnDiameterM
      || groupWidth(right) - groupWidth(left)
      || rankingStableTie(left, right));
  const wider = [...paretoFrontier]
    .filter((group) => group !== selected)
    .sort((left, right) =>
      groupWidth(right) - groupWidth(left)
      || left.geometry.columnDiameterM - right.geometry.columnDiameterM
      || rankingStableTie(left, right))[0];
  const sizeWindowComparisons = buildSizeWindowComparisons(
    feasible,
    selected,
    wider ?? null,
    minimumUsefulWindowRpm,
  );
  const sizeComparisonAlternatives = sizeWindowComparisons.filter((alternative) =>
    alternative.role !== 'SELECTED_COMPACT' && alternative.role !== 'BEST_AVAILABLE');
  const frontierAlternatives = paretoFrontier
    .filter((group) => group !== selected)
    .map((group) => summarizeRankingAlternative(
      group,
      group === wider ? 'WIDER_FRONTIER' : 'FRONTIER_ALTERNATIVE',
      minimumUsefulWindowRpm,
      selected,
    ));
  const comparisonKeys = new Set(sizeWindowComparisons.map((alternative) =>
    geometryKey(
      alternative.geometry.columnDiameterM,
      alternative.geometry.hcToColumn,
      alternative.geometry.rotorToColumn,
      alternative.geometry.freeArea,
    )));
  const distinctFrontierAlternatives = frontierAlternatives.filter((alternative) =>
    !comparisonKeys.has(geometryKey(
      alternative.geometry.columnDiameterM,
      alternative.geometry.hcToColumn,
      alternative.geometry.rotorToColumn,
      alternative.geometry.freeArea,
    )));
  const alternatives = [...sizeComparisonAlternatives, ...distinctFrontierAlternatives];
  return {
    selected,
    adequateGeometryCount: adequate.length,
    paretoFrontier,
    sizeWindowComparisons,
    alternatives,
  };
}

function selectWindow(
  groups: GeometryGroup[],
  minimumUsefulWindowRpm: number,
): GeometryGroup | null {
  return rankGeometryGroups(groups, minimumUsefulWindowRpm).selected;
}

function selectedTrialForPolicy(
  selected: GeometryGroup | null,
  controls: CanonicalStage3Stage4OptimizerControls,
  rankingPolicy: 'CORRECTED' | 'LEGACY',
): Candidate | null {
  if (!selected?.operatingWindow) return null;
  if (rankingPolicy === 'LEGACY') {
    // Frozen V1.0 replay behavior: preserve the prior rounded-midpoint
    // lookup and its historical global-feasible fallback exactly.
    return selected.trials.find((trial) =>
      trial.status === 'FEASIBLE'
      && trial.rpm === Math.round(
        (selected.operatingWindow!.rpmMin + selected.operatingWindow!.rpmMax) / 2 / controls.rpmStep,
      ) * controls.rpmStep,
    ) ?? selected.trials.find((trial) => trial.status === 'FEASIBLE') ?? null;
  }
  const midpoint = (selected.operatingWindow.rpmMin + selected.operatingWindow.rpmMax) / 2;
  return [...selected.trials]
    .filter((trial) =>
      trial.status === 'FEASIBLE'
      && trial.rpm >= selected.operatingWindow!.rpmMin
      && trial.rpm <= selected.operatingWindow!.rpmMax)
    .sort((left, right) =>
      Math.abs(left.rpm - midpoint) - Math.abs(right.rpm - midpoint)
      || right.rpm - left.rpm
      || left.powerVolumeWM3 - right.powerVolumeWM3)[0] ?? null;
}

function optimizeOrientation(
  basis: HydrodynamicProcessBasis,
  controls: CanonicalStage3Stage4OptimizerControls,
  rankingPolicy: 'CORRECTED' | 'LEGACY' = 'CORRECTED',
): OrientationResult {
  const { continuous, dispersed } = phaseProperties(basis);
  const diameters = boundedGrid(
    controls.diameterMinM, controls.diameterMaxM, controls.diameterStepM, 'DIAMETER_GRID',
  );
  const rpms = boundedGrid(controls.rpmMin, controls.rpmMax, controls.rpmStep, 'RPM_GRID');
  const groups: GeometryGroup[] = [];
  let rejectedTrialCount = 0;
  const rejectionReasons = new Map<string, number>();
  for (const diameterM of diameters) {
    for (const hcToColumn of controls.hcToColumn) {
      for (const rotorToColumn of controls.rotorToColumn) {
        for (const freeArea of controls.freeArea) {
          const trials = rpms.map((rpm) =>
            evaluateTrial(basis, diameterM, hcToColumn, rotorToColumn, freeArea, rpm));
          const valid = trials.filter((trial) => trial.status === 'FEASIBLE');
          trials.filter((trial) => trial.status !== 'FEASIBLE').forEach((trial) => {
            rejectedTrialCount += 1;
            trial.reasons.forEach((reason) => rejectionReasons.set(reason, (rejectionReasons.get(reason) ?? 0) + 1));
          });
          let operatingWindow: GeometryGroup['operatingWindow'] = null;
          if (valid.length) {
            const runs: Candidate[][] = [];
            let current: Candidate[] = [];
            for (const trial of trials) {
              if (trial.status !== 'FEASIBLE') {
                if (current.length) runs.push(current);
                current = [];
              } else {
                current.push(trial);
              }
            }
            if (current.length) runs.push(current);
            const window = runs.sort((left, right) =>
              right.length - left.length
              || left[0].rpm - right[0].rpm)[0];
            if (window?.length) {
              operatingWindow = {
                rpmMin: window[0].rpm,
                rpmMax: window.at(-1)!.rpm,
                widthRpm: window.at(-1)!.rpm - window[0].rpm,
                validTrialCount: window.length,
                edgeMarginRpm: Math.min(
                  window[0].rpm - controls.rpmMin,
                  controls.rpmMax - window.at(-1)!.rpm,
                ),
              };
            }
          }
          const candidateAtCenter = valid.sort((left, right) =>
            Math.abs(left.rpm - (controls.rpmMin + controls.rpmMax) / 2)
            - Math.abs(right.rpm - (controls.rpmMin + controls.rpmMax) / 2)
            || left.powerVolumeWM3 - right.powerVolumeWM3)[0];
          const window = operatingWindow;
          groups.push({
            geometry: {
              columnDiameterM: diameterM,
              compartmentHeightM: diameterM * hcToColumn,
              hcToColumn,
              rotorDiameterM: diameterM * rotorToColumn,
              rotorToColumn,
              freeArea,
            },
            trials,
            operatingWindow,
            score: {
              windowWidthRpm: window?.widthRpm ?? -1,
              edgeMarginRpm: window?.edgeMarginRpm ?? -1,
              validTrialCount: window?.validTrialCount ?? 0,
              centerDistanceRpm: candidateAtCenter
                ? Math.abs(candidateAtCenter.rpm - (controls.rpmMin + controls.rpmMax) / 2)
                : Number.POSITIVE_INFINITY,
              tieBreakPowerVolumeWM3: candidateAtCenter?.powerVolumeWM3
                ?? Number.POSITIVE_INFINITY,
            },
            ...(rankingPolicy === 'CORRECTED' && operatingWindow
              ? {
                meetsUsefulWindowPreference:
                  operatingWindow.widthRpm >= controls.minimumUsefulWindowRpm - 1e-12,
              }
              : {}),
          });
        }
      }
    }
  }
  const correctedRanking = rankingPolicy === 'CORRECTED'
    ? rankGeometryGroups(groups, controls.minimumUsefulWindowRpm)
    : null;
  const selected = rankingPolicy === 'CORRECTED'
    ? correctedRanking!.selected
    : selectLegacyWindow(groups);
  const selectedTrial = selectedTrialForPolicy(selected, controls, rankingPolicy);
  const rootSamples = diameters.map((diameterM) => ({
    x: diameterM,
    residual: Math.PI * (selected?.geometry.rotorToColumn ?? controls.rotorToColumn[0])
      * diameterM * (selectedTrial?.rpm ?? controls.rpmMin) / 60 - 4.5,
  }));
  const brackets = findAllBoundedRootBrackets(rootSamples);
  const rootsM = brackets.map((bracket) => bracket.low === bracket.high
    ? bracket.low
    : bisectRoot(
      (diameterM) => Math.PI * (selected?.geometry.rotorToColumn ?? controls.rotorToColumn[0])
        * diameterM * (selectedTrial?.rpm ?? controls.rpmMin) / 60 - 4.5,
      bracket.low, bracket.high,
    ));
  const selectedFreeAreaTrials = selected
    ? groups.filter((group) =>
      group.geometry.columnDiameterM === selected.geometry.columnDiameterM
      && group.geometry.hcToColumn === selected.geometry.hcToColumn
      && group.geometry.rotorToColumn === selected.geometry.rotorToColumn,
    ).flatMap((group) => group.trials.filter((trial) =>
      trial.status === 'FEASIBLE' && trial.rpm === selectedTrial?.rpm))
    : [];
  const holdups = selectedFreeAreaTrials.map((trial) => trial.holdup).filter(finite);
  const d32s = selectedFreeAreaTrials.map((trial) => trial.d32M).filter(finite);
  const powers = selectedFreeAreaTrials.map((trial) => trial.powerVolumeWM3).filter(finite);
  const variation = {
    holdupRange: holdups.length ? Math.max(...holdups) - Math.min(...holdups) : null,
    d32RangeM: d32s.length ? Math.max(...d32s) - Math.min(...d32s) : null,
    powerVolumeRangeWM3: powers.length ? Math.max(...powers) - Math.min(...powers) : null,
  };
  const observed = [variation.holdupRange, variation.d32RangeM, variation.powerVolumeRangeWM3]
    .some((value) => value !== null && value > 1e-12);
  const rankingEvidence = correctedRanking
    ? {
      usefulWindowPreference: {
        minimumWindowWidthRpm: controls.minimumUsefulWindowRpm,
        meaning: 'RANKING_PREFERENCE_NOT_HYDRAULIC_LIMIT' as const,
        adequateGeometryCount: correctedRanking.adequateGeometryCount,
        selectedMeetsPreference: Boolean(
          selected?.operatingWindow
          && selected.operatingWindow.widthRpm >= controls.minimumUsefulWindowRpm - 1e-12,
        ),
      },
      paretoFrontier: [
        ...(selected?.operatingWindow
          ? [summarizeRankingAlternative(
            selected,
            selectedAlternativeRole(selected, controls.minimumUsefulWindowRpm),
            controls.minimumUsefulWindowRpm,
            selected,
          )]
          : []),
        ...correctedRanking.alternatives.filter((alternative) =>
          alternative.role === 'WIDER_FRONTIER'
          || alternative.role === 'FRONTIER_ALTERNATIVE'),
      ],
      sizeWindowComparisons: correctedRanking.sizeWindowComparisons,
      alternatives: correctedRanking.alternatives,
    }
    : undefined;
  return {
    orientation: basis.phaseConfiguration as Orientation,
    status: selected ? 'SELECTED' : 'NO_FEASIBLE_WINDOW',
    phaseSelection: {
      continuousIdentity: continuous.identity,
      dispersedIdentity: dispersed.identity,
      continuousFlowM3S: continuous.flowM3S,
      dispersedFlowM3S: dispersed.flowM3S,
      continuousDensityKgM3: continuous.densityKgM3,
      dispersedDensityKgM3: dispersed.densityKgM3,
    },
    selectedGeometry: selected?.geometry ?? null,
    operatingWindow: selected?.operatingWindow ?? null,
    selectedScore: selected?.score ?? null,
    ...(rankingEvidence ? { rankingEvidence } : {}),
    selectedRpm: selectedTrial?.rpm ?? null,
    selectedTrial,
    geometryGrid: groups,
    rejectedTrialCount,
    rejectionReasons: [...rejectionReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
    rootSearch: {
      bounds: { minimumDiameterM: controls.diameterMinM, maximumDiameterM: controls.diameterMaxM },
      residualDefinition: 'r(D)=pi*(Dr/D)*D*(RPM/60)-4.5 m/s; all bounded sign-change roots retained',
      brackets: brackets.map((bracket) => ({
        lowM: bracket.low, highM: bracket.high,
        residualLow: bracket.residualLow, residualHigh: bracket.residualHigh,
      })),
      rootsM,
      rootResiduals: rootsM.map((rootM) => ({
        rootM,
        residual: Math.PI * (selected?.geometry.rotorToColumn ?? controls.rotorToColumn[0])
          * rootM * (selectedTrial?.rpm ?? controls.rpmMin) / 60 - 4.5,
      })),
      allRootsRetained: true,
    },
    freeAreaSensitivity: {
      status: selectedTrial
        ? observed ? 'SENSITIVITY_OBSERVED' : 'MODEL_INSENSITIVE_IN_CURRENT_EQUATIONS'
        : 'NOT_AVAILABLE',
      statement: selectedTrial
        ? observed
          ? 'Free area is used by the existing Kühni holdup primitive; the selected trial family shows a finite response. No additional free-area effect was invented.'
          : 'The current equations are insensitive at the selected grid point; no free-area effect was invented or added.'
        : 'No feasible selected trial exists from which to assess free-area sensitivity.',
      variation,
    },
  };
}

function alternativeBasis(basis: HydrodynamicProcessBasis): HydrodynamicProcessBasis {
  const phaseConfiguration: Orientation = basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed'
    ? 'rrbo-continuous-nmp-dispersed'
    : 'nmp-continuous-rrbo-dispersed';
  return { ...basis, phaseConfiguration };
}

function validateOptimizerAuthority(
  basis: HydrodynamicProcessBasis,
  stage1SnapshotHash: string,
): void {
  if (
    !basis
    || typeof basis !== 'object'
    || !/^[a-f0-9]{64}$/.test(stage1SnapshotHash)
    || basis.stage1SnapshotHash !== stage1SnapshotHash
    || ![
      'nmp-continuous-rrbo-dispersed',
      'rrbo-continuous-nmp-dispersed',
    ].includes(basis.phaseConfiguration)
  ) {
    throw new Error('STAGE3_STAGE4_OPTIMIZER_STAGE1_AUTHORITY_INVALID');
  }
}

function optimizeStage3Stage4Internal(
  basis: HydrodynamicProcessBasis,
  stage1SnapshotHash: string,
  rawControls: unknown,
  rankingPolicy: 'CORRECTED' | 'LEGACY',
): Stage3Stage4OptimizerResult {
  const controls = canonicalizeStage3Stage4OptimizerControls(rawControls);
  const current = optimizeOrientation(basis, controls, rankingPolicy);
  const comparison = controls.compareOrientations
    ? optimizeOrientation(alternativeBasis(basis), controls, rankingPolicy)
    : null;
  const orientations = [
    { ...current, status: current.selectedGeometry ? 'SELECTED' as const : current.status },
    ...(comparison ? [{
      ...comparison,
      status: comparison.selectedGeometry ? 'FEASIBLE_COMPARISON' as const : comparison.status,
    }] : []),
  ];
  // Stage 1 owns the orientation. The alternate orientation is comparison
  // evidence only; it must never silently replace a selected Stage-1 phase
  // assignment because its window happens to be numerically wider.
  const selected = current.selectedGeometry ? current : null;
  const selectedTrial = selected?.selectedTrial ?? null;
  const selectionHash = selected
    ? kuhniRunHash({
      stage1SnapshotHash,
      orientation: selected.orientation,
      geometry: selected.selectedGeometry,
      operatingWindow: selected.operatingWindow,
      rpm: selected.selectedRpm,
    })
    : null;
  const outputControls = rankingPolicy === 'LEGACY'
    ? (({ minimumUsefulWindowRpm: _ignored, ...legacyControls }) =>
      legacyControls as CanonicalStage3Stage4OptimizerControls)(controls)
    : controls;
  const resultWithoutHash: Omit<Stage3Stage4OptimizerResult, 'calculationHash'> = {
    schemaVersion: 'ECR_STAGE3_STAGE4_OPTIMIZER_RESULT_V1',
    status: selected ? 'OPTIMIZED_FIXED_GEOMETRY_WINDOW' : 'NO_FEASIBLE_ORIENTATION',
    classification: 'PRE_PILOT_HYDRAULIC_SCREENING_NOT_SEPARATION_QUALIFICATION',
    engine: {
      id: 'ecr_stage3_stage4_optimizer',
      version: rankingPolicy === 'LEGACY'
        ? ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_VERSION
        : ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
      implementationHash: rankingPolicy === 'LEGACY'
        ? ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_HASH
        : ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
    },
    stage1Authority: {
      snapshotHash: stage1SnapshotHash,
      phaseConfiguration: basis.phaseConfiguration as Orientation,
      processBasisSchemaVersion: basis.schemaVersion,
    },
    processBasis: basis,
    designNt: { value: 7, provenance: 'FIXED_DESIGN7', stage2IsReferenceOnly: true },
    controls: outputControls,
    selectedOrientation: selected?.orientation ?? null,
    selectedGeometry: selected?.selectedGeometry ?? null,
    selectedOperatingWindow: selected?.operatingWindow ?? null,
    selectedRpm: selected?.selectedRpm ?? null,
    selectedTrial,
    selectedOrientationDiagnostics: {
      freeAreaSensitivity: selected?.freeAreaSensitivity ?? null,
      rootSearch: selected?.rootSearch ?? null,
      rejectedTrialCount: selected?.rejectedTrialCount ?? 0,
      rejectionReasons: selected?.rejectionReasons ?? [],
    },
    freeAreaSensitivity: selected?.freeAreaSensitivity ?? null,
    candidateGrid: orientations.map((item) => ({
      orientation: item.orientation,
      diameterM: boundedGrid(
        controls.diameterMinM, controls.diameterMaxM, controls.diameterStepM, 'DIAMETER_GRID',
      ),
      hcToColumn: controls.hcToColumn,
      rotorToColumn: controls.rotorToColumn,
      freeArea: controls.freeArea,
      rpm: boundedGrid(controls.rpmMin, controls.rpmMax, controls.rpmStep, 'RPM_GRID'),
    })),
    selectionRationale: rankingPolicy === 'LEGACY'
      ? {
        objective: 'Maximize a contiguous valid fixed-geometry RPM-window width, then central edge margin and valid count; no invented power limit is applied.',
        ordering: [
          'windowWidthRpm descending',
          'edgeMarginRpm descending',
          'validTrialCount descending',
          'distance of representative RPM from search midpoint ascending',
          'representative P/V ascending as a tie-break only',
          'D, hc/D, rotor/D, and free area ascending as stable deterministic ties',
        ],
        selectedScore: selected?.selectedScore ?? null,
      }
      : {
        objective: 'Prefer a configurable useful contiguous RPM window, then choose the smallest adequate column; retain the non-dominated wider-window frontier without invented cost or power weights.',
        ordering: [
          'useful-window preference: widthRpm >= minimumUsefulWindowRpm (ranking preference only; not a hydraulic limit)',
          'among candidates meeting the preference: column diameter ascending (smallest adequate diameter)',
          'for equal diameter: window width descending',
          'edgeMarginRpm, validTrialCount, representative RPM distance, P/V, hc/D, rotor/D, and free area as deterministic tie-breaks',
          'retain Pareto frontier by minimizing diameter and maximizing contiguous window width; report wider frontier alternatives rather than converting tradeoffs into a fabricated score',
        ],
        selectedScore: selected?.selectedScore ?? null,
        usefulWindowPreference: current.rankingEvidence?.usefulWindowPreference,
        paretoFrontier: current.rankingEvidence?.paretoFrontier,
        sizeWindowComparisons: current.rankingEvidence?.sizeWindowComparisons,
        alternatives: current.rankingEvidence?.alternatives,
      },
    stage4GeometryInput: {
      status: selected?.selectedGeometry && selectedTrial
        ? 'SELECTED_IMMUTABLE_OPTIMIZER_GEOMETRY' : 'UNAVAILABLE',
      columnDiameterM: selected?.selectedGeometry?.columnDiameterM ?? null,
      compartmentHeightM: selected?.selectedGeometry?.compartmentHeightM ?? null,
      hcToColumn: selected?.selectedGeometry?.hcToColumn ?? null,
      rotorDiameterM: selected?.selectedGeometry?.rotorDiameterM ?? null,
      rotorToColumn: selected?.selectedGeometry?.rotorToColumn ?? null,
      freeArea: selected?.selectedGeometry?.freeArea ?? null,
      rpm: selected?.selectedRpm ?? null,
      optimizerResultHash: selectionHash,
    },
    orientationComparison: orientations,
    assumptions: [
      'Stage 1 is the sole process/property authority; no project-specific or historical property values are reconstructed.',
      'Fixed design N_T=7 is the Stage 3/4 design basis. Actual accepted Stage-2 N_T is reference evidence only.',
      'Np=1.2, the existing d32 primitive, and larger-diameter scale-up are accepted assumptions retained with source-range disclosures.',
      'Only hc/D=0.20, 0.25, and 0.30 are newly generated. Historical legacy geometry remains replayable but is not a new optimizer candidate.',
      ...(rankingPolicy === 'LEGACY'
        ? [
          'The result seeks a fixed geometry with a contiguous useful RPM window. It does not impose an invented power limit or automatically select maximum RPM/minimum diameter.',
        ]
        : [
          'The useful-window minimum is a transparent ranking preference, not a hydraulic limit. The corrected ranking chooses the true smallest adequate diameter and retains the wider non-dominated frontier for review.',
        ]),
      'For RRBO-continuous/NMP-dispersed Stage-1 orientation, signed V1.4/V1.5 reverse force-balance, countercurrent and extrapolated d32 primitives are used. Reverse diagnostics remain explicitly extrapolated and never silently switch to the alternate orientation.',
      'HETS=1.0 m/theoretical stage remains a screening implication only; separation, outlet quality, and commercial qualification are not claimed.',
      'Source-range diagnostics are retained as extrapolation metadata; physical invalidity and non-finite equation states are rejected.',
    ],
    blockers: selected ? [] : ['NO_FEASIBLE_FIXED_GEOMETRY_OPERATING_WINDOW'],
  };
  const calculationHash = kuhniRunHash(resultWithoutHash);
  // The Stage-3 immutable row hash, rather than a self-referential result
  // field, is the Stage-4 geometry lineage identity.
  return { ...resultWithoutHash, calculationHash };
}

/**
 * Current immutable optimizer entry point.  The Stage-1 basis and all
 * hydraulic/geometry bounds remain server-owned.
 */
export function optimizeStage3Stage4(
  basis: HydrodynamicProcessBasis,
  stage1SnapshotHash: string,
  rawControls?: unknown,
): Stage3Stage4OptimizerResult {
  validateOptimizerAuthority(basis, stage1SnapshotHash);
  return optimizeStage3Stage4Internal(basis, stage1SnapshotHash, rawControls, 'CORRECTED');
}

/**
 * Read-only numerical replay for V1.0.0 rows.  It intentionally uses the old
 * width-first selector and emits the old engine/hash/shape, so historical
 * hashes remain verifiable while current-result APIs can treat those rows as
 * stale rather than silently re-ranking them.
 */
export function replayLegacyStage3Stage4(
  basis: HydrodynamicProcessBasis,
  stage1SnapshotHash: string,
  rawControls?: unknown,
): Stage3Stage4OptimizerResult {
  validateOptimizerAuthority(basis, stage1SnapshotHash);
  return optimizeStage3Stage4Internal(basis, stage1SnapshotHash, rawControls, 'LEGACY');
}

export const runStage3Stage4Optimizer = optimizeStage3Stage4;

/**
 * Candidate trials are persisted for audit/replay, but they are not needed by
 * the Stage-3/4 result card or Stage-4 lineage. Never send the full bounded
 * grid over the normal latest-result API response.
 */
export function compactStage3Stage4OptimizerResult(
  result: Stage3Stage4OptimizerResult,
): Stage3Stage4OptimizerResult {
  return {
    ...result,
    orientationComparison: result.orientationComparison.map((orientation) => ({
      ...orientation,
      geometryGrid: [],
    })),
  };
}
