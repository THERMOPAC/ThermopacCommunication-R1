import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import sourceManifest from './stage4-finite-rate-source-manifest.json';
import {
  evaluateJobA,
  JOB_A_COMPONENT_ORDER,
  JOB_A_IMPLEMENTATION_SHA256,
} from './job-a';
import {
  createSevenComponentLocalEquilibriumSession,
  STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION,
} from './stage4-seven-component-adapter';
import { calculateKumarHartlandEcDetails } from './stage4-mixing-audit';
import { createStage4DogboxInterfaceSession } from './stage4-dogbox-interface';
import {
  type JobBInterfaceRequest,
  type JobBInterfaceResponse,
} from './job-b-interface';

/**
 * A deliberately small, rate-based Stage-4 calculation.  It is not a
 * replacement for Stage 2: it uses the Stage-2 accepted N_T only as the
 * reference against which the independently searched physical count is
 * reported.  No Stage-2 outlet is used as a physical-column outlet or target.
 */
export const STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION =
  'ECR_STAGE4_PREDICTIVE_PHYSICAL_SIZING_V2' as const;
export const STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH = createHash('sha256').update([
  STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION,
  'dynamically-updated-pinned-seven-component-local-equilibrium',
  'job-a-two-film-coefficients',
  'non-equimolar-conserved-counter-current-finite-volume-axial-dispersion',
  'independent-fv-refinement-two-and-four-cells-per-physical-compartment',
  'molar-average-diagonal-generalized-fick-screening-frame',
  'kh-screening-ec-ed-zero-c0126-c0105',
  JSON.stringify(sourceManifest),
].join('|')).digest('hex');

const MW = [170.3348, 120.1916, 142.1971, 202.2506, 405.58, 99.1311, 18.01528];
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const hash = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const normalize = (values: number[]) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0) || values.some(value => !finite(value) || value < 0)) {
    throw new Error('STAGE4_PHYSICAL_SOLVER_INVALID_PHASE_STATE');
  }
  return values.map(value => value / total);
};

export type Stage4ScreeningProcessBasis = {
  temperatureK: number;
  phaseConfiguration: string;
  rrboFeed: { flowM3S: number; densityKgM3: number; dynamicViscosityPaS: number };
  wetSolventPhase: { flowM3S: number; densityKgM3: number; dynamicViscosityPaS: number };
  interfacialTensionNM: number;
  composition: {
    rrboFeedWt: {
      saturates: number; monoAromatics: number; diAromatics: number;
      polyAromatics: number; polarAromatics: number; nmp: number;
    };
    wetSolventWt: { nmp: number; water: number };
  };
};

export type Stage4ScreeningHydraulics = {
  diameterM: number; rotorDiameterM: number; rpm: number; d32M: number;
  operatingHoldup: number; continuousSuperficialVelocityMS: number;
  dispersedSuperficialVelocityMS: number;
};

type Flash = {
  status: string; phaseOrientation?: string; raffinateComposition?: number[];
  extractComposition?: number[]; resultHash?: string;
};
type FlashEvaluator = (request: {
  temperatureK: number; componentMolarInventory: number[];
  componentOrder: [...typeof JOB_A_COMPONENT_ORDER];
}, timeoutMs?: number) => Promise<Flash>;
type InterfaceEvaluator = (request: JobBInterfaceRequest, timeoutMs?: number) => Promise<JobBInterfaceResponse>;

export type Stage4PhysicalSizingInput = {
  calculatedNt: number;
  stage1SnapshotHash: string;
  stage2JobId: string;
  stage2ResultHash: string;
  stage2EngineHash: string;
  stage3RunId: number | string;
  stage3ImmutableHash: string;
  stage3ImplementationHash: string;
  selectedTrialId: string;
  selectedTrialOrdinal: number;
  processBasis: Stage4ScreeningProcessBasis;
  hydraulics: Stage4ScreeningHydraulics;
  stage1Targets: Record<string, unknown>;
  maximumCompartments?: number;
};
export type Stage4PhysicalCountOutcome = {
  physicalCompartments: number;
  status: 'TARGET_PASS' | 'TARGET_FAIL' | 'NUMERICAL_UNRESOLVED';
  reason: string | null;
};

/**
 * Operational timing is deliberately progress-only diagnostic data. It is not
 * included in a scientific result or used by any numerical decision.
 */
export type Stage4PhysicalSizingTelemetry = {
  operation: string;
  iteration: number | null;
  cellIndex: number | null;
  totalCells: number | null;
  elapsedMs: number;
  operationElapsedMs: number;
  interfaceCallsAttempted: number;
  interfaceCallsCompleted: number;
  residuals?: Record<string, number>;
  residualHistory?: Record<string, number>[];
  /** Timestamp of this saved observation; never a synthetic live clock. */
  checkpointTimestamp: string;
};

export type Stage4PhysicalSizingProgress = {
  caseCoefficient: 0.0126 | 0.0105;
  physicalCompartments: number | null;
  finiteVolumeCellsPerPhysicalCompartment: 2 | 4 | null;
  state: 'STARTED' | 'CONVERGED' | 'NUMERICAL_FAILURE';
  localFlashCalls: number;
  reason: string | null;
  telemetry?: Stage4PhysicalSizingTelemetry;
  /**
   * A physical trial is complete only after both mesh attempts have returned
   * and its physical-count outcome has been recorded.  In particular, a
   * currently running count is not included in completedPhysicalTrials.
   */
  completedPhysicalTrials: number;
  resolvedPhysicalTrials: number;
  unresolvedPhysicalTrials: number;
  lastCompletedPhysicalCount: number | null;
  minimumPhysicalCount: number;
  maximumPhysicalCount: number;
  totalPhysicalTrials: number;
  partialPhysicalCountOutcomes: Stage4PhysicalCountOutcome[];
};

export function calculateKumarHartlandScreeningDispersion(input: {
  c: 0.0126 | 0.0105;
  diameterM: number; rotorDiameterM: number; rpm: number;
  continuousSuperficialVelocityMS: number; dispersedSuperficialVelocityMS: number;
  continuousDensityKgM3: number; continuousViscosityPaS: number;
}) {
  const { c, diameterM: D, rotorDiameterM: DR, rpm, continuousSuperficialVelocityMS: vc,
    dispersedSuperficialVelocityMS: vd, continuousDensityKgM3: rho,
    continuousViscosityPaS: mu } = input;
  if (![D, DR, rpm, vc, vd, rho, mu].every(positive) || !(DR < D)) {
    throw new Error('STAGE4_KH_SCREENING_INPUT_INVALID');
  }
  const detail = calculateKumarHartlandEcDetails({
    columnDiameterM: D, rotorDiameterM: DR, rpm, continuousSuperficialVelocityMS: vc,
    dispersedSuperficialVelocityMS: vd, continuousDensityKgM3: rho,
    continuousViscosityPaS: mu, hcM: .5 * D,
  }, c);
  return {
    valueM2S: detail.ecM2S, normalizedEcOverVcHc: detail.dimensionlessEc,
    q: detail.q, compartmentPitchM: detail.hcM,
    c,
    equation: 'Ec/(Vc hc)=.42+.29(Vd/Vc)+[c q+13.38/(3.18+q)](Vc DR rho/mu)^-.08(D/DR)^.16(D/hc)^.10',
    assumptions: [
      'Engineer-authorized Kumar–Hartland screening expression; not a claimed exact reproduction of a 2017 publication.',
      'Vc and Vd are persisted superficial velocities; hc=0.5D; Ec is applied only to continuous-phase axial dispersion.',
      'Ed=0 m2/s screening assumption.',
    ],
  };
}

/**
 * Continuous-phase overall two-film coefficient with xC*=m*xD*.  Keeping
 * this small kernel exported makes the orientation and zero-driving-force
 * condition independently testable.
 */
export function calculateTwoFilmContinuousFlux(input: {
  kcMPerS: number; kdMPerS: number; continuousTotalConcentrationMolM3: number;
  dispersedTotalConcentrationMolM3: number; partitionXCOverXD: number;
  continuousMoleFraction: number; dispersedMoleFraction: number;
}) {
  const { kcMPerS: kc, kdMPerS: kd, continuousTotalConcentrationMolM3: cc,
    dispersedTotalConcentrationMolM3: cd, partitionXCOverXD: m,
    continuousMoleFraction: xc, dispersedMoleFraction: xd } = input;
  if (![kc, kd, cc, cd, m].every(positive) || ![xc, xd].every(value =>
    finite(value) && value >= 0 && value <= 1)) {
    throw new Error('STAGE4_TWO_FILM_INPUT_NONPHYSICAL');
  }
  const kocMPerS = 1 / (1 / kc + m * cc / (kd * cd));
  const drivingForce = xc - m * xd;
  const fluxMolM2S = kocMPerS * cc * drivingForce;
  if (!finite(kocMPerS) || !finite(fluxMolM2S)) throw new Error('STAGE4_TWO_FILM_RESULT_NONFINITE');
  return { kocMPerS, drivingForce, fluxMolM2S };
}

function feeds(basis: Stage4ScreeningProcessBasis) {
  const rrboMassKgS = basis.rrboFeed.flowM3S * basis.rrboFeed.densityKgM3;
  const wetMassKgS = basis.wetSolventPhase.flowM3S * basis.wetSolventPhase.densityKgM3;
  const r = basis.composition.rrboFeedWt;
  const w = basis.composition.wetSolventWt;
  const oil = [r.saturates, r.monoAromatics, r.diAromatics, r.polyAromatics,
    r.polarAromatics, r.nmp, 0].map((pct, index) => rrboMassKgS * pct * 10 / MW[index]);
  const solvent = [0, 0, 0, 0, 0, wetMassKgS * w.nmp * 10 / MW[5],
    wetMassKgS * w.water * 10 / MW[6]];
  if (basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed') {
    return { continuous: solvent, dispersed: oil, continuousIsExtract: true };
  }
  if (basis.phaseConfiguration === 'rrbo-continuous-nmp-dispersed') {
    return { continuous: oil, dispersed: solvent, continuousIsExtract: false };
  }
  throw new Error('STAGE4_PHYSICAL_SOLVER_PHASE_CONFIGURATION_INVALID');
}

export function evaluateStage4ProductTargets(outletOil: number[], oilFeed: number[], targets: Record<string, unknown>) {
  if (outletOil.length !== 7 || oilFeed.length !== 7
    || [...outletOil, ...oilFeed].some(value => !finite(value) || value < 0)) {
    throw new Error('STAGE4_PHYSICAL_SOLVER_NEGATIVE_OR_INVALID_PRODUCT_OUTLET');
  }
  const masses = outletOil.map((flow, index) => flow * MW[index]);
  const feedMass = oilFeed.map((flow, index) => flow * MW[index]);
  const hydrocarbon = masses.slice(0, 5).reduce((a, b) => a + b, 0);
  const feedHydrocarbon = feedMass.slice(0, 5).reduce((a, b) => a + b, 0);
  const full = masses.reduce((a, b) => a + b, 0);
  if (!(hydrocarbon > 0 && feedHydrocarbon > 0 && full > 0)) {
    throw new Error('STAGE4_PHYSICAL_SOLVER_PRODUCT_MASS_INVALID');
  }
  // Stage 4 uses the same explicitly governed Stage-1 product targets.  A
  // missing target is a data-integrity failure, never an unbounded default.
  const required = (name: string) => {
    const value = targets[name];
    if (!finite(value)) throw new Error(`STAGE4_STAGE1_TARGET_REQUIRED:${name}`);
    return value;
  };
  const recovery = 100 * hydrocarbon / feedHydrocarbon;
  const allocations = [
    required('sulfurAllocationSatPct'), required('sulfurAllocationMonoPct'),
    required('sulfurAllocationDiPct'), required('sulfurAllocationPolyPct'),
    required('sulfurAllocationPaPct'),
  ];
  const feedSulfur = required('feedSulfurPpm');
  const sulfurCanBeEvaluated = allocations.every((allocation, i) =>
    allocation === 0 || feedMass[i] > 0);
  // This is the already-admitted Stage-2 sulfur post-processing inference:
  // each molecular pool retains the fraction predicted by the 7C LLE solve.
  // It is not a newly fitted sulfur-transfer correlation.
  const sulfur = sulfurCanBeEvaluated
    ? allocations.reduce((sum, allocation, i) =>
      sum + feedSulfur * allocation / 100 * masses[i] / feedMass[i], 0)
    : null;
  const metrics = [
    ['NMP_FREE_RRBO_HYDROCARBON_RECOVERY_PCT', 'GTE', recovery,
      required('minimumRecoveryPct')],
    ['RAFFINATE_SATURATES_WT_PCT_NMP_FREE_HYDROCARBON', 'GTE', 100 * masses[0] / hydrocarbon,
      required('minimumRaffinateSaturatesWt')],
    ['RAFFINATE_TOTAL_AROMATICS_WT_PCT_NMP_FREE_HYDROCARBON', 'LTE',
      100 * (masses[1] + masses[2] + masses[3] + masses[4]) / hydrocarbon,
      required('targetRaffinateTotalAromaticsWt')],
    ['RAFFINATE_POLAR_AROMATICS_WT_PCT_NMP_FREE_HYDROCARBON', 'LTE', 100 * masses[4] / hydrocarbon,
      required('targetRaffinatePolarAromaticsWt')],
    ['RAFFINATE_NMP_WT_PCT_FULL_RAFFINATE_STREAM', 'LTE', 100 * masses[5] / full,
      required('maximumNmpRaffinateWt')],
  ].map(([name, comparator, actual, target]) => ({
    name, comparator, actual, target,
    status: comparator === 'GTE' ? actual >= target ? 'PASS' : 'FAIL' : actual <= target ? 'PASS' : 'FAIL',
  }));
  const sulfurTarget = required('targetRaffinateSulfurPpm');
  const sulfurMetric = sulfur === null ? {
    name: 'RAFFINATE_SULFUR_PPM', actual: null, target: sulfurTarget,
    status: 'NOT_EVALUATED_ZERO_FEED_MOLECULAR_POOL_PREVENTS_GOVERNED_STAGE2_INFERENCE' as const,
  } : {
    name: 'RAFFINATE_SULFUR_PPM', actual: sulfur, target: sulfurTarget,
    status: sulfur <= sulfurTarget ? 'PASS' as const : 'FAIL' as const,
  };
  return {
    metrics: [...metrics, sulfurMetric],
    allEvaluatedTargetsPassed: metrics.every(metric => metric.status === 'PASS')
      && sulfurMetric.status === 'PASS',
    raffinateRecoveryPct: recovery,
  };
}

type LocalFlash = {
  continuousEquilibriumComposition: number[];
  dispersedEquilibriumComposition: number[];
  resultHash: string | null;
};
export type Stage4FrozenCoarseIteration = {
  iteration: number;
  scaledUpdateResidual: number;
  /**
   * These are evaluated against the same reconstructed current state and
   * original finite-volume equations.  They are observations only; no
   * diagnostic value enters the solve or its convergence decision.
   */
  originalCoupledColumnResidual: {
    continuousAxialComponentBalanceMolS: number;
    totalComponentBalanceMolS: number;
  };
  originalConstitutiveResidual: { scaledMaximum: number };
  originalComponentBalanceResidual: { scaledMaximum: number };
  totalMassBalanceResidualKgS: number;
  physicalAdmissibility: {
    continuousFacesNonnegative: boolean;
    continuousTotalFaceFlowsPositive: boolean;
    localPhaseStatesNonnegative: boolean;
  };
  localInterfaceQualification: {
    status: 'QUALIFIED_BY_EXISTING_JOB_B_RESPONSE_GATE'
      | 'NOT_COMPLETED';
    completedCells: number;
    requiredCells: number;
    responseResultHashes: Array<string | null>;
  };
  /**
   * The existing solver only performs holdup-inventory pinned-flash admission
   * after its update gate passes. Do not label an interim state flash-admitted.
   */
  localFlashQualification: {
    status: 'NOT_EVALUATED_INTERIM_EXISTING_SOLVER_FINAL_ONLY';
  };
  /** Complete reconstructed state for this finished original FV iteration. */
  transferMolS: number[][];
  continuousFaceComponentFlowsMolS: number[][];
  continuousCellMoleFractions: number[][];
  dispersedCellInComponentFlowsMolS: number[][];
  dispersedCellOutComponentFlowsMolS: number[][];
  dispersedCellMoleFractions: number[][];
  outletPhaseFlows: {
    continuousMolS: number[];
    dispersedMolS: number[];
    continuousTotalMolS: number;
    dispersedTotalMolS: number;
    continuousMoleFractions: number[] | null;
    dispersedMoleFractions: number[] | null;
  };
};

export type Stage4FrozenCoarseDiagnosticResult = {
  schema: 'ECR_STAGE4_FROZEN_COARSE_MESH_DIAGNOSTIC_V1';
  caseCoefficient: 0.0126;
  physicalCompartments: number;
  finiteVolumeCellsPerPhysicalCompartment: 2;
  initialization: {
    method: 'EXISTING_ZERO_TRANSFER_DEFAULT'
      | 'EXACT_PRIOR_SOLVE_MESH_TRANSFER_STATE'
      | 'PRELAUNCH_FROZEN_FEED_GEOMETRY_UNIFORM_TWO_PERCENT_CONTINUOUS_DONOR_DRAW';
    suppliedTransferState: boolean;
  };
  solver: MeshSolve;
};

export type MeshSolve = {
  interfaceFailure?: {
    requestHash: string;
    request: Record<string, unknown>;
    response: Record<string, unknown>;
    iteration: number;
    cellIndex: number;
  };
  converged: boolean;
  reason: string | null;
  iterations: number;
  localFlashCalls: number;
  continuousOutlet: number[];
  dispersedOutlet: number[];
  transfer: number[][];
  maxScaledUpdateResidual: number | null;
  maxScaledConstitutiveResidual: number | null;
  maxScaledComponentBalanceResidual: number | null;
  maxAxialResidualMolS: number | null;
  maxDiffusiveFrameResidualMolS: number | null;
  maxFilmEqualityResidualMolS: number | null;
  maxStefanIdentityResidualMolS: number | null;
  /** Diagnostic-only independent reconstruction from the damped next state. */
  maxPostUpdateScaledComponentBalanceResidual?: number | null;
  postUpdateTotalMassBalanceResidualKgS?: number | null;
  maxPostUpdateContinuousAxialEquationResidualMolS?: number | null;
  postUpdatePhysicalAdmissibilityPassed?: boolean | null;
  /**
   * Present only on the opt-in frozen residual-controlled diagnostic.  The
   * production Picard route deliberately does not inspect or use it.
   */
  residualControlled?: {
    strategy: 'SAFEGUARDED_GOOD_BROYDEN_ACTUAL_WHOLE_COLUMN_RESIDUAL_V1';
    acceptedCandidates: number;
    rejectedCandidates: number;
    finalActualScaledResidual: number | null;
  };
};

export type Stage4ResidualControlledCandidate = {
  iteration: number;
  candidateId: number;
  disposition: 'INITIAL' | 'ACCEPTED' | 'REJECTED';
  rejectionReason: string | null;
  strategy: 'PICARD_BOOTSTRAP' | 'DENSE_GOOD_BROYDEN';
  actualResidualStatus: 'COMPLETE_FRESH_WHOLE_COLUMN_EVALUATION'
    | 'NOT_COMPLETED_PHYSICAL_OR_LOCAL_GATE_FAILED';
  actualRawResidualMolS: number[][];
  actualScaledResidual: number[];
  actualMaximumScaledResidual: number;
  stepScaled: number[];
  stepInfinityNorm: number;
  trustRegionInfinityRadius: number;
  physicalAdmissibility: {
    continuousFacesNonnegative: boolean;
    continuousTotalFaceFlowsPositive: boolean;
    localPhaseStatesNonnegative: boolean;
  };
  localInterfaceQualification: {
    status: 'QUALIFIED_BY_EXISTING_JOB_B_RESPONSE_GATE' | 'NOT_COMPLETED';
    completedCells: number;
    requiredCells: number;
    requests: Array<{
      cellIndex: number;
      requestHash: string;
      request: Record<string, unknown>;
      response: Record<string, unknown> | null;
      failure: string | null;
    }>;
  };
  transferMolS: number[][];
  continuousFaceComponentFlowsMolS: number[][];
  continuousCellMoleFractions: number[][];
  dispersedCellInComponentFlowsMolS: number[][];
  dispersedCellOutComponentFlowsMolS: number[][];
};

export type Stage4FrozenResidualControlledDiagnosticResult = {
  schema: 'ECR_STAGE4_FROZEN_RESIDUAL_CONTROLLED_WHOLE_COLUMN_DIAGNOSTIC_V1';
  caseCoefficient: 0.0126;
  physicalCompartments: 5;
  finiteVolumeCellsPerPhysicalCompartment: 2;
  initialization: Stage4FrozenCoarseDiagnosticResult['initialization'];
  solver: MeshSolve;
};

const vectorInfinityNorm = (values: number[]) => Math.max(...values.map(Math.abs));

/**
 * One dense, bounded inverse-Jacobian approximation is only 70x70 for the
 * frozen diagnostic.  It replaces expensive finite-difference columns while
 * preserving a fresh physical residual evaluation for every acceptance
 * decision.  Exporting these arithmetic kernels makes their safeguards
 * independently testable without a worker.
 */
export function stage4SafeguardedGoodBroydenStep(input: {
  inverseJacobian: number[][];
  scaledResidual: number[];
  trustRegionInfinityRadius: number;
}) {
  const { inverseJacobian, scaledResidual, trustRegionInfinityRadius } = input;
  if (!Number.isFinite(trustRegionInfinityRadius) || trustRegionInfinityRadius <= 0
    || inverseJacobian.length !== scaledResidual.length
    || inverseJacobian.some(row => row.length !== scaledResidual.length
      || row.some(value => !finite(value)))
    || scaledResidual.some(value => !finite(value))) {
    throw new Error('STAGE4_RESIDUAL_CONTROLLED_GOOD_BROYDEN_STEP_INPUT_INVALID');
  }
  const unconstrained = inverseJacobian.map(row =>
    -row.reduce((sum, value, i) => sum + value * scaledResidual[i], 0));
  const unconstrainedInfinityNorm = vectorInfinityNorm(unconstrained);
  const factor = unconstrainedInfinityNorm > trustRegionInfinityRadius
    ? trustRegionInfinityRadius / unconstrainedInfinityNorm : 1;
  const step = unconstrained.map(value => value * factor);
  return {
    step,
    unconstrainedInfinityNorm,
    stepInfinityNorm: vectorInfinityNorm(step),
    trustRegionLimited: factor < 1,
  };
}

export function stage4GoodBroydenInverseUpdate(inverseJacobian: number[][],
  acceptedStepScaled: number[], residualDifferenceScaled: number[]) {
  const n = acceptedStepScaled.length;
  if (inverseJacobian.length !== n || residualDifferenceScaled.length !== n
    || inverseJacobian.some(row => row.length !== n)
    || [...acceptedStepScaled, ...residualDifferenceScaled].some(value => !finite(value))) {
    throw new Error('STAGE4_RESIDUAL_CONTROLLED_BROYDEN_UPDATE_INPUT_INVALID');
  }
  const left = inverseJacobian[0].map((_value, col) => inverseJacobian.reduce((sum, row, r) =>
    sum + acceptedStepScaled[r] * row[col], 0));
  const by = inverseJacobian.map(row => row.reduce((sum, value, i) =>
    sum + value * residualDifferenceScaled[i], 0));
  const denominator = left.reduce((sum, value, i) => sum + value * residualDifferenceScaled[i], 0);
  const denominatorScale = Math.max(1, vectorInfinityNorm(left) * vectorInfinityNorm(residualDifferenceScaled));
  // Good inverse Broyden has denominator s^T H y. A near-zero denominator
  // would make a rank-one update numerically unbounded, so retain the prior
  // inverse approximation rather than claiming a secant it cannot support.
  if (left.some(value => !finite(value)) || by.some(value => !finite(value))
    || !finite(denominator) || !finite(denominatorScale)
    || Math.abs(denominator) <= 1e-14 * denominatorScale) {
    return inverseJacobian.map(row => [...row]);
  }
  return inverseJacobian.map((row, r) => row.map((value, col) =>
    value + (acceptedStepScaled[r] - by[r]) * left[col] / denominator));
}

export type Stage4FrozenCoarseReproductionComparison = {
  schema: 'ECR_STAGE4_FROZEN_COARSE_REPRODUCTION_COMPARATOR_V1';
  threshold: 2e-6;
  scale: {
    method: 'EXISTING_STAGE4_COMPONENT_SUPPLY_SCALE';
    zeroFloorMolS: 1e-12;
    componentSupplyScaleMolS: number[];
    transferCellScaleMolS: 'SAME_COMPONENT_SUPPLY_SCALE_NO_NEW_NORMALIZATION';
  };
  endpointShapesValid: boolean;
  perComponent: Array<{
    component: string;
    maximumAbsoluteTransferDifferenceMolS: number;
    scaledMaximumTransferDifference: number;
    continuousOutletDifferenceMolS: number;
    scaledContinuousOutletDifference: number;
    dispersedOutletDifferenceMolS: number;
    scaledDispersedOutletDifference: number;
  }>;
  maxima: {
    scaledTransfer: number;
    scaledContinuousOutlet: number;
    scaledDispersedOutlet: number;
    overallScaledDifference: number;
  };
  endpointsAgree: boolean;
};

export function stage4FrozenCoarseReproductionComparisonSpecification(input: Stage4PhysicalSizingInput) {
  const feed = feeds(input.processBasis);
  return {
    threshold: 2e-6 as const,
    scale: {
      method: 'EXISTING_STAGE4_COMPONENT_SUPPLY_SCALE' as const,
      zeroFloorMolS: 1e-12,
      componentSupplyScaleMolS: feed.continuous.map((value, index) =>
        Math.max(value + feed.dispersed[index], 1e-12)),
      transferCellScaleMolS: 'SAME_COMPONENT_SUPPLY_SCALE_NO_NEW_NORMALIZATION' as const,
    },
  };
}

/** Predeclared diagnostic comparison only; it does not choose or optimize a state. */
export function compareStage4FrozenCoarseReproductionEndpoints(input: Stage4PhysicalSizingInput,
  first: MeshSolve, second: MeshSolve): Stage4FrozenCoarseReproductionComparison {
  const specification = stage4FrozenCoarseReproductionComparisonSpecification(input);
  const scale = specification.scale.componentSupplyScaleMolS;
  const shapeValid = (mesh: MeshSolve) => mesh.transfer.length === 10
    && mesh.transfer.every(row => row.length === 7)
    && mesh.continuousOutlet.length === 7 && mesh.dispersedOutlet.length === 7;
  const endpointShapesValid = shapeValid(first) && shapeValid(second);
  const perComponent = JOB_A_COMPONENT_ORDER.map((component, i) => {
    const transferDifferences = endpointShapesValid
      ? first.transfer.map((row, j) => Math.abs(row[i] - second.transfer[j][i])) : [Infinity];
    const continuousDifference = endpointShapesValid
      ? Math.abs(first.continuousOutlet[i] - second.continuousOutlet[i]) : Infinity;
    const dispersedDifference = endpointShapesValid
      ? Math.abs(first.dispersedOutlet[i] - second.dispersedOutlet[i]) : Infinity;
    return {
      component,
      maximumAbsoluteTransferDifferenceMolS: Math.max(...transferDifferences),
      scaledMaximumTransferDifference: Math.max(...transferDifferences) / scale[i],
      continuousOutletDifferenceMolS: continuousDifference,
      scaledContinuousOutletDifference: continuousDifference / scale[i],
      dispersedOutletDifferenceMolS: dispersedDifference,
      scaledDispersedOutletDifference: dispersedDifference / scale[i],
    };
  });
  const maxima = {
    scaledTransfer: Math.max(...perComponent.map(row => row.scaledMaximumTransferDifference)),
    scaledContinuousOutlet: Math.max(...perComponent.map(row => row.scaledContinuousOutletDifference)),
    scaledDispersedOutlet: Math.max(...perComponent.map(row => row.scaledDispersedOutletDifference)),
    overallScaledDifference: Math.max(...perComponent.flatMap(row => [
      row.scaledMaximumTransferDifference,
      row.scaledContinuousOutletDifference,
      row.scaledDispersedOutletDifference,
    ])),
  };
  return {
    schema: 'ECR_STAGE4_FROZEN_COARSE_REPRODUCTION_COMPARATOR_V1',
    ...specification,
    endpointShapesValid,
    perComponent,
    maxima,
    endpointsAgree: endpointShapesValid && maxima.overallScaledDifference <= 2e-6,
  };
}

function reconstructDiagnosticTransferState(transfer: number[][], cells: number,
  continuousFeed: number[], dispersedFeed: number[]) {
  if (transfer.length !== cells || transfer.some(row =>
    row.length !== 7 || row.some(value => !finite(value)))) {
    throw new Error('STAGE4_DIAGNOSTIC_INITIAL_TRANSFER_SHAPE_OR_FINITE_GATE_FAILED');
  }
  const continuous = [...continuousFeed];
  const dispersed = [...dispersedFeed];
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < 7; i += 1) continuous[i] -= transfer[j][i];
  }
  for (let j = cells - 1; j >= 0; j -= 1) {
    for (let i = 0; i < 7; i += 1) dispersed[i] += transfer[j][i];
  }
  if (![...continuous, ...dispersed].every(value => value >= -1e-12 && finite(value))) {
    throw new Error('STAGE4_DIAGNOSTIC_INITIAL_TRANSFER_PHYSICAL_ADMISSIBILITY_GATE_FAILED');
  }
  return { transfer: transfer.map(row => [...row]), continuous, dispersed };
}

/**
 * This is solely the existing countercurrent transfer reconstruction exposed
 * for a frozen diagnostic preflight; it introduces no new transport physics.
 */
export function prepareStage4FrozenCoarseIndependentDonorSeed(input: Stage4PhysicalSizingInput) {
  if (input.calculatedNt !== 5 || input.maximumCompartments !== 5) {
    throw new Error('STAGE4_FROZEN_COARSE_DIAGNOSTIC_REQUIRES_ACCEPTED_NT_AND_FIVE_PHYSICAL_COMPARTMENTS');
  }
  const physicalCompartments = 5;
  const cells = physicalCompartments * 2;
  const donorFraction = .02;
  const feed = feeds(input.processBasis);
  // Positive N_i is the existing solver's continuous-to-dispersed direction.
  // The uniform 2% draw is bounded component-by-component by the actual
  // continuous donor inventory and is deliberately prepared before either run.
  const transfer = Array.from({ length: cells }, () =>
    feed.continuous.map(value => donorFraction * value / cells));
  const reconstruction = reconstructDiagnosticTransferState(transfer, cells,
    feed.continuous, feed.dispersed);
  return {
    method: 'PRELAUNCH_FROZEN_FEED_GEOMETRY_UNIFORM_TWO_PERCENT_CONTINUOUS_DONOR_DRAW' as const,
    donorFraction,
    transfer: reconstruction.transfer,
    reconstruction: {
      continuousOutletComponentFlowsMolS: reconstruction.continuous,
      dispersedOutletComponentFlowsMolS: reconstruction.dispersed,
    },
    initialSeparationFromZero: {
      maximumAbsoluteTransferMolS: Math.max(...reconstruction.transfer.flat().map(Math.abs)),
      totalContinuousDonorDrawMolS: reconstruction.transfer.flat()
        .reduce((sum, value) => sum + value, 0),
      fractionOfContinuousDonorInventory: donorFraction,
    },
  };
}

/** Component residual scale is the total supplied inventory of that component,
 * not the phase that happens to be indexed by the residual vector. */
const scaledMaximum = (values: number[], componentSupplyScale: number[]) =>
  Math.max(...values.map((value, index) =>
    Math.abs(value) / componentSupplyScale[index % componentSupplyScale.length]));

function validateLocalFlash(flash: Flash, continuousIsExtract: boolean): LocalFlash {
  if (flash.status !== 'CALCULATED' || flash.phaseOrientation !== 'NMP_RICH_EXTRACT'
    || !Array.isArray(flash.raffinateComposition) || !Array.isArray(flash.extractComposition)
    || flash.raffinateComposition.length !== 7 || flash.extractComposition.length !== 7) {
    throw new Error(`STAGE4_PINNED_7C_LOCAL_EQUILIBRIUM_UNAVAILABLE:${flash.status}`);
  }
  const continuousEquilibriumComposition = continuousIsExtract
    ? flash.extractComposition : flash.raffinateComposition;
  const dispersedEquilibriumComposition = continuousIsExtract
    ? flash.raffinateComposition : flash.extractComposition;
  if (![...continuousEquilibriumComposition, ...dispersedEquilibriumComposition]
    .every(positive)) throw new Error('STAGE4_LOCAL_EQUILIBRIUM_COMPOSITION_INVALID');
  return {
    continuousEquilibriumComposition,
    dispersedEquilibriumComposition,
    resultHash: typeof flash.resultHash === 'string' ? flash.resultHash : null,
  };
}

async function solveCase(input: Stage4PhysicalSizingInput, c: 0.0126 | 0.0105,
  flashEvaluator: FlashEvaluator, interfaceEvaluator: InterfaceEvaluator,
  controls: {
    startedAtMonotonicMs: number; deadlineMs: number; operationTimeoutMs: number;
    cancelled: () => boolean;
    progress?: (event: Stage4PhysicalSizingProgress) => void | Promise<void>;
    telemetry?: (event: Stage4PhysicalSizingProgress) => void | Promise<void>;
    diagnostic?: {
      physicalCompartments: number;
      cellsPerPhysicalCompartment: 2;
      initialTransfer?: number[][];
      onIteration?: (iteration: Stage4FrozenCoarseIteration) => void;
       strategy?: 'EXISTING_PICARD' | 'RESIDUAL_CONTROLLED_GOOD_BROYDEN';
       onCandidate?: (candidate: Stage4ResidualControlledCandidate) => void;
    };
  }) {
  let interfaceCallsAttempted = 0;
  let interfaceCallsCompleted = 0;
  const remainingOperationMs = () => Math.max(1, Math.min(
    controls.operationTimeoutMs, controls.deadlineMs - Date.now(),
  ));
  const operationTelemetry = (operation: string, operationStartedAt: number, iteration: number | null,
    cellIndex: number | null, totalCells: number | null, residuals?: Record<string, number>,
    residualHistory?: Record<string, number>[]): Stage4PhysicalSizingTelemetry => ({
    operation,
    iteration,
    cellIndex,
    totalCells,
    // Date.now() is a wall clock and may move backwards when NTP or a system
    // clock adjustment is applied.  Telemetry must remain an operational
    // observation, not a source of negative or discontinuous durations.
    elapsedMs: performance.now() - controls.startedAtMonotonicMs,
    operationElapsedMs: performance.now() - operationStartedAt,
    interfaceCallsAttempted,
    interfaceCallsCompleted,
    ...(residuals ? { residuals } : {}),
    ...(residualHistory ? { residualHistory } : {}),
    checkpointTimestamp: new Date().toISOString(),
  });
  const reportTelemetry = (event: Stage4PhysicalSizingProgress) => {
    try {
      const pending = controls.telemetry?.(event);
      if (pending && typeof (pending as PromiseLike<void>).then === 'function') {
        void Promise.resolve(pending).catch(error => {
          console.error('STAGE4_TELEMETRY_CALLBACK_FAILED', error);
        });
      }
    } catch (error) {
      // A diagnostic observer is advisory.  Never let an observer failure
      // change a numerical result or create an unhandled rejection.
      console.error('STAGE4_TELEMETRY_CALLBACK_FAILED', error);
    }
  };
  const emitInletTelemetry = (telemetry: Stage4PhysicalSizingTelemetry) => {
    const maximumPhysicalCount = input.maximumCompartments ?? 80;
    reportTelemetry({
      caseCoefficient: c,
      physicalCompartments: null,
      finiteVolumeCellsPerPhysicalCompartment: null,
      state: 'STARTED',
      localFlashCalls: 0,
      reason: null,
      telemetry,
      completedPhysicalTrials: 0,
      resolvedPhysicalTrials: 0,
      unresolvedPhysicalTrials: 0,
      lastCompletedPhysicalCount: null,
      minimumPhysicalCount: input.calculatedNt,
      maximumPhysicalCount,
      totalPhysicalTrials: maximumPhysicalCount - input.calculatedNt + 1,
      partialPhysicalCountOutcomes: [],
    });
  };
  if (controls.cancelled() || Date.now() > controls.deadlineMs) {
    throw new Error(controls.cancelled()
      ? 'STAGE4_FINITE_RATE_SOLVER_CANCELLED'
      : 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED');
  }
  const { processBasis: basis, hydraulics } = input;
  const feed = feeds(basis);
  const continuousPhase = basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed'
    ? basis.wetSolventPhase : basis.rrboFeed;
  const dispersedPhase = basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed'
    ? basis.rrboFeed : basis.wetSolventPhase;
  const dispersion = calculateKumarHartlandScreeningDispersion({
    c, diameterM: hydraulics.diameterM, rotorDiameterM: hydraulics.rotorDiameterM,
    rpm: hydraulics.rpm, continuousSuperficialVelocityMS: hydraulics.continuousSuperficialVelocityMS,
    dispersedSuperficialVelocityMS: hydraulics.dispersedSuperficialVelocityMS,
    continuousDensityKgM3: continuousPhase.densityKgM3,
    continuousViscosityPaS: continuousPhase.dynamicViscosityPaS,
  });
  const total = feed.continuous.map((value, i) => value + feed.dispersed[i]);
  // This first flash is only adapter/provenance binding and the base-film
  // composition. It is never retained as an equilibrium partition closure.
  const inletStartedAt = performance.now();
  emitInletTelemetry(operationTelemetry('INLET_LOCAL_EQUILIBRIUM_BINDING', inletStartedAt,
    null, null, null));
  const inletFlashResponse = await flashEvaluator({
    temperatureK: basis.temperatureK, componentMolarInventory: total,
    componentOrder: [...JOB_A_COMPONENT_ORDER],
  }, remainingOperationMs());
  emitInletTelemetry(operationTelemetry('INLET_LOCAL_EQUILIBRIUM_BINDING', inletStartedAt,
    null, null, null));
  const inletFlash = validateLocalFlash(inletFlashResponse, feed.continuousIsExtract);
  const localComposition = normalize(feed.continuous);
  const jobA = evaluateJobA({
    stage1SnapshotHash: input.stage1SnapshotHash, theoreticalStages: input.calculatedNt,
    theoreticalStageProvenance: 'STAGE_2_CALCULATED_NT', stage2JobId: input.stage2JobId,
    stage2ResultHash: input.stage2ResultHash, stage2EngineHash: input.stage2EngineHash,
    // The validated adapter response is the runtime integrity evidence used
    // here.  This field is an immutable adapter binding, not a second worker
    // launch merely to obtain a redundant preflight response.
    thermodynamicAdapterPreflightHash: inletFlash.resultHash
      ?? hash(`PINNED_7C_ADAPTER:${STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION}`),
    stage3RunId: String(input.stage3RunId), stage3ImmutableHash: input.stage3ImmutableHash,
    stage3ImplementationHash: input.stage3ImplementationHash, selectedTrialId: input.selectedTrialId,
    selectedTrialOrdinal: input.selectedTrialOrdinal, temperatureK: basis.temperatureK,
    interfacialTensionNM: basis.interfacialTensionNM, d32M: hydraulics.d32M,
    slipVelocityMS: hydraulics.continuousSuperficialVelocityMS / (1 - hydraulics.operatingHoldup)
      + hydraulics.dispersedSuperficialVelocityMS / hydraulics.operatingHoldup,
    continuous: { densityKgM3: continuousPhase.densityKgM3,
      dynamicViscosityPaS: continuousPhase.dynamicViscosityPaS, moleFractions: localComposition },
    dispersed: { densityKgM3: dispersedPhase.densityKgM3,
      dynamicViscosityPaS: dispersedPhase.dynamicViscosityPaS, moleFractions: normalize(feed.dispersed) },
  });
  const kc = JOB_A_COMPONENT_ORDER.map(component =>
    (jobA.cells as any[]).find(cell => cell.componentId === component && cell.phase === 'continuous').filmCoefficientMS);
  const kd = JOB_A_COMPONENT_ORDER.map(component =>
    (jobA.cells as any[]).find(cell => cell.componentId === component && cell.phase === 'dispersed').filmCoefficientMS);
  const pitch = dispersion.compartmentPitchM;
  const area = Math.PI * hydraulics.diameterM ** 2 / 4;
  const a = 6 * hydraulics.operatingHoldup / hydraulics.d32M;
  const cTot = continuousPhase.densityKgM3 / (normalize(feed.continuous)
    .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
  const dTot = dispersedPhase.densityKgM3 / (normalize(feed.dispersed)
    .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
  const max = input.maximumCompartments ?? 80;
  if (!Number.isInteger(max) || max < input.calculatedNt) {
    throw new Error('STAGE4_PHYSICAL_COUNT_BOUND_BELOW_ACCEPTED_NT');
  }
  const result = {
    c, dispersion,
    continuousPecletPerPhysicalCompartment:
      pitch * hydraulics.continuousSuperficialVelocityMS / dispersion.valueM2S,
    dispersedPecletPerPhysicalCompartment: {
      value: null, status: 'INFINITE_ZERO_DISPERSION_LIMIT_ED_ZERO',
    },
    equilibrium: {
      localClosure: 'PINNED_7C_FLASH_REEVALUATED_FROM_EACH_CURRENT_LOCAL_COUNTERCURRENT_STATE',
      inletAdapterResultHash: inletFlash.resultHash,
    },
    jobA: { implementationSha256: JOB_A_IMPLEMENTATION_SHA256, resultSha256: jobA.resultSha256 },
    twoFilm: {
      continuousFilmCoefficientKcMPerS: kc,
      dispersedFilmCoefficientKdMPerS: kd,
      constitutiveClosure: 'Job-B 13-unknown interface root: six continuous and six dispersed interface logits plus total Stefan molar flux; seven pinned-7C isoactivity equations and six independent component-flux equality equations.',
      rateEquations: 'rCi=kc_i CtC(xCb_i-xCi_i); JCi=rCi-xCi_i sum(rC); rDi=kd_i CtD(xDi_i-xDb_i); JDi=rDi-xDi_i sum(rD); Ni=JCi+xCi_i N=JDi+xDi_i N.',
      concentrationConvention: 'CtC and CtD are locally recomputed as frozen phase density divided by local phase-average molecular weight. Job-A kc/kd remain frozen from the persisted Stage-3 hydraulic state.',
      referenceFrame: 'Screening diagonal generalized-Fick two-film closure. J is zero-sum only in the molar-average diffusive frame; total interphase N_i retains its Stefan/convective sum and can change phase total molar flow.',
      orientation: feed.continuousIsExtract
        ? 'continuous=NMP-rich extract; dispersed=raffinate'
        : 'continuous=raffinate; dispersed=NMP-rich extract',
    },
    selected: null as any, attemptedPhysicalCompartments: [] as number[],
    maximumPhysicalCompartmentsSearched: max,
    nonconvergedPhysicalCounts: [] as number[],
    physicalCountOutcomes: [] as Stage4PhysicalCountOutcome[],
    lastConservedPhysicalTrial: null as any,
    meshRefinement: {
      coarseFiniteVolumeCellsPerPhysicalCompartment: 2,
      refinedFiniteVolumeCellsPerPhysicalCompartment: 4,
      acceptanceRelativeOutletDifference: .01,
    },
    searchTermination: null as string | null,
  };
  const totalPhysicalTrials = max - input.calculatedNt + 1;
  const emitProgress = async (event: Omit<Stage4PhysicalSizingProgress,
    'completedPhysicalTrials' | 'resolvedPhysicalTrials' | 'unresolvedPhysicalTrials'
    | 'lastCompletedPhysicalCount' | 'minimumPhysicalCount' | 'maximumPhysicalCount'
    | 'totalPhysicalTrials' | 'partialPhysicalCountOutcomes'>) => {
    const outcomes = result.physicalCountOutcomes.map(outcome => ({ ...outcome }));
    await controls.progress?.({
      ...event,
      completedPhysicalTrials: outcomes.length,
      resolvedPhysicalTrials: outcomes.filter(outcome =>
        outcome.status === 'TARGET_PASS' || outcome.status === 'TARGET_FAIL').length,
      unresolvedPhysicalTrials: outcomes.filter(outcome =>
        outcome.status === 'NUMERICAL_UNRESOLVED').length,
      lastCompletedPhysicalCount: outcomes.at(-1)?.physicalCompartments ?? null,
      minimumPhysicalCount: input.calculatedNt,
      maximumPhysicalCount: max,
      totalPhysicalTrials,
      partialPhysicalCountOutcomes: outcomes,
    });
  };
  const emitTelemetryProgress = (event: Omit<Stage4PhysicalSizingProgress,
    'completedPhysicalTrials' | 'resolvedPhysicalTrials' | 'unresolvedPhysicalTrials'
    | 'lastCompletedPhysicalCount' | 'minimumPhysicalCount' | 'maximumPhysicalCount'
    | 'totalPhysicalTrials' | 'partialPhysicalCountOutcomes'>) => {
    const outcomes = result.physicalCountOutcomes.map(outcome => ({ ...outcome }));
    reportTelemetry({
      ...event,
      completedPhysicalTrials: outcomes.length,
      resolvedPhysicalTrials: outcomes.filter(outcome =>
        outcome.status === 'TARGET_PASS' || outcome.status === 'TARGET_FAIL').length,
      unresolvedPhysicalTrials: outcomes.filter(outcome =>
        outcome.status === 'NUMERICAL_UNRESOLVED').length,
      lastCompletedPhysicalCount: outcomes.at(-1)?.physicalCompartments ?? null,
      minimumPhysicalCount: input.calculatedNt,
      maximumPhysicalCount: max,
      totalPhysicalTrials,
      partialPhysicalCountOutcomes: outcomes,
    });
  };
  const solveMesh = async (physicalCompartments: number, cellsPerPhysicalCompartment: number):
    Promise<MeshSolve> => {
    const cells = physicalCompartments * cellsPerPhysicalCompartment;
    const dz = pitch / cellsPerPhysicalCompartment;
    const interfacialArea = a * area * dz;
    const dispersionConductance = dispersion.valueM2S * area * cTot / dz;
    const feedScale = feed.continuous.map((value, index) =>
      Math.max(value + feed.dispersed[index], 1e-12));
    const residualHistory: Record<string, number>[] = [];
    // A separate reconstruction used only by the frozen diagnostic's final
    // post-update qualification.  It independently evaluates the same
    // boundary-flux/axial-dispersion equation rather than relying solely on
    // the transfer-sum cancellation that makes total component balance exact.
    const independentlyReconstructState = (candidate: number[][]) => {
      const faces = Array.from({ length: cells + 1 }, () => Array(7).fill(0));
      faces[0] = [...feed.continuous];
      for (let j = 0; j < cells; j += 1) {
        faces[j + 1] = faces[j].map((value, i) => value - candidate[j][i]);
      }
      const qFaces = faces.map(row => row.reduce((sum, value) => sum + value, 0));
      const continuousAdmissible = !faces.flat().some(value => !finite(value) || value < -1e-11)
        && qFaces.every(positive);
      const xc = Array.from({ length: cells }, () => Array(7).fill(0));
      if (continuousAdmissible) {
        xc[cells - 1] = faces[cells].map((value, i) => value / qFaces[cells]);
        for (let j = cells - 2; j >= 0; j -= 1) {
          xc[j] = faces[j + 1].map((value, i) =>
            (value + dispersionConductance * xc[j + 1][i])
            / (qFaces[j + 1] + dispersionConductance));
        }
      }
      const dIn = Array.from({ length: cells }, () => Array(7).fill(0));
      const dOut = Array.from({ length: cells }, () => Array(7).fill(0));
      let dispersed = [...feed.dispersed];
      for (let j = cells - 1; j >= 0; j -= 1) {
        dIn[j] = [...dispersed];
        dispersed = dispersed.map((value, i) => value + candidate[j][i]);
        dOut[j] = [...dispersed];
      }
      const localAdmissible = [...xc.flat(), ...dIn.flat(), ...dOut.flat()]
        .every(value => finite(value) && value >= -1e-11);
      const reconstructedFluxResiduals: number[] = [];
      if (continuousAdmissible) {
        for (let j = 0; j < cells - 1; j += 1) {
          for (let i = 0; i < 7; i += 1) {
            reconstructedFluxResiduals.push(faces[j + 1][i]
              - (qFaces[j + 1] * xc[j][i]
                + dispersionConductance * (xc[j][i] - xc[j + 1][i])));
          }
        }
        for (let i = 0; i < 7; i += 1) {
          reconstructedFluxResiduals.push(faces[cells][i] - qFaces[cells] * xc[cells - 1][i]);
        }
      }
      const continuousOutlet = faces[cells];
      const dispersedOutlet = dOut[0];
      const componentBalance = scaledMaximum(continuousOutlet.map((value, i) =>
        feed.continuous[i] + feed.dispersed[i] - value - dispersedOutlet[i]), feedScale);
      const massBalance = continuousOutlet.reduce((sum, value, i) =>
        sum + value * MW[i] / 1000, 0) + dispersedOutlet.reduce((sum, value, i) =>
        sum + value * MW[i] / 1000, 0) - feed.continuous.reduce((sum, value, i) =>
        sum + value * MW[i] / 1000, 0) - feed.dispersed.reduce((sum, value, i) =>
        sum + value * MW[i] / 1000, 0);
      return {
        componentBalance,
        massBalance,
        maximumAxialEquationResidual: reconstructedFluxResiduals.length
          ? Math.max(...reconstructedFluxResiduals.map(Math.abs)) : Infinity,
        physicallyAdmissible: continuousAdmissible && localAdmissible,
      };
    };
    const emitOperationalProgress = (operation: string, operationStartedAt: number,
      iteration: number | null, cellIndex: number | null, residuals?: Record<string, number>) => {
      emitTelemetryProgress({
        caseCoefficient: c,
        physicalCompartments,
        finiteVolumeCellsPerPhysicalCompartment: cellsPerPhysicalCompartment as 2 | 4,
        state: 'STARTED',
        localFlashCalls: flashCalls,
        reason: null,
        telemetry: operationTelemetry(operation, operationStartedAt, iteration, cellIndex, cells,
          residuals, residualHistory.map(entry => ({ ...entry }))),
      });
    };
    let transfer = controls.diagnostic?.initialTransfer
      ? controls.diagnostic.initialTransfer.map(row => [...row])
      : Array.from({ length: cells }, () => Array(7).fill(0));
    if (controls.diagnostic?.initialTransfer) {
      transfer = reconstructDiagnosticTransferState(transfer, cells,
        feed.continuous, feed.dispersed).transfer;
    }
    let latestFrame = 0;
    let latestFilmEquality = 0;
    let latestStefanIdentity = 0;
    let flashCalls = 0;
    let interfaceFailure: MeshSolve['interfaceFailure'];
    const maxIterations = 80;
    const relativeTolerance = 2e-6;
    /**
     * The sole finite-volume/local-interface state evaluator for both the
     * historical Picard loop and the opt-in residual-controlled loop below.
     * Keeping reconstruction, request assembly and the original Job-B gates in
     * this one closure prevents equation drift between diagnostic strategies.
     */
    const evaluateWholeColumnState = async (candidate: number[][], iteration: number) => {
      latestFrame = 0;
      latestFilmEquality = 0;
      latestStefanIdentity = 0;
      const faces = Array.from({ length: cells + 1 }, () => Array(7).fill(0));
      faces[0] = [...feed.continuous];
      for (let j = 0; j < cells; j += 1) {
        faces[j + 1] = faces[j].map((value, i) => value - candidate[j][i]);
      }
      const qFaces = faces.map(row => row.reduce((sum, value) => sum + value, 0));
      const continuousFacesNonnegative = !faces.flat().some(value => !finite(value) || value < -1e-11);
      const continuousTotalFaceFlowsPositive = qFaces.every(positive);
      if (!continuousFacesNonnegative || !continuousTotalFaceFlowsPositive) {
        return { failure: 'NONNEGATIVE_CONTINUOUS_FACE_GATE_FAILED', faces, qFaces,
          xc: [] as number[][], dIn: [] as number[][], dOut: [] as number[][],
          proposed: [] as number[][], interfaceResultHashes: [] as Array<string | null>,
          requests: [] as Stage4ResidualControlledCandidate['localInterfaceQualification']['requests'],
          physicalAdmissibility: { continuousFacesNonnegative, continuousTotalFaceFlowsPositive,
            localPhaseStatesNonnegative: false },
          diagnostics: { frame: latestFrame, filmEquality: latestFilmEquality, stefanIdentity: latestStefanIdentity } };
      }
      const xc = Array.from({ length: cells }, () => Array(7).fill(0));
      xc[cells - 1] = faces[cells].map((value, i) => value / qFaces[cells]);
      for (let j = cells - 2; j >= 0; j -= 1) {
        xc[j] = faces[j + 1].map((value, i) =>
          (value + dispersionConductance * xc[j + 1][i])
          / (qFaces[j + 1] + dispersionConductance));
      }
      const dIn = Array.from({ length: cells }, () => Array(7).fill(0));
      const dOut = Array.from({ length: cells }, () => Array(7).fill(0));
      let dispersed = [...feed.dispersed];
      for (let j = cells - 1; j >= 0; j -= 1) {
        dIn[j] = [...dispersed];
        dispersed = dispersed.map((value, i) => value + candidate[j][i]);
        dOut[j] = [...dispersed];
      }
      const localPhaseStatesNonnegative = ![...xc.flat(), ...dIn.flat(), ...dOut.flat()]
        .some(value => !finite(value) || value < -1e-11);
      if (!localPhaseStatesNonnegative) {
        return { failure: 'NONNEGATIVE_LOCAL_PHASE_STATE_GATE_FAILED', faces, qFaces, xc, dIn, dOut,
          proposed: [] as number[][], interfaceResultHashes: [] as Array<string | null>,
          requests: [] as Stage4ResidualControlledCandidate['localInterfaceQualification']['requests'],
          physicalAdmissibility: { continuousFacesNonnegative, continuousTotalFaceFlowsPositive,
            localPhaseStatesNonnegative },
          diagnostics: { frame: latestFrame, filmEquality: latestFilmEquality, stefanIdentity: latestStefanIdentity } };
      }
      const proposed: number[][] = [];
      const interfaceResultHashes: Array<string | null> = [];
      const requests: Stage4ResidualControlledCandidate['localInterfaceQualification']['requests'] = [];
      try {
        for (let j = 0; j < cells; j += 1) {
          const dInventory = dIn[j].map((value, i) => .5 * (value + dOut[j][i]));
          const xD = normalize(dInventory);
          const localCtC = continuousPhase.densityKgM3 / (xc[j]
            .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
          const localCtD = dispersedPhase.densityKgM3 / (xD
            .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
          if (controls.cancelled() || Date.now() > controls.deadlineMs) {
            throw new Error(controls.cancelled()
              ? 'STAGE4_FINITE_RATE_SOLVER_CANCELLED' : 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED');
          }
          const interfaceRequest: JobBInterfaceRequest = {
            componentOrder: [...JOB_A_COMPONENT_ORDER], T: basis.temperatureK,
            x_bulk_continuous: xc[j], x_bulk_dispersed: xD, kc, kd,
            CtC: localCtC, CtD: localCtD, phase_config: basis.phaseConfiguration as any,
          };
          const requestHash = createHash('sha256').update(JSON.stringify(interfaceRequest)).digest('hex');
          const interfaceStartedAt = performance.now();
          interfaceCallsAttempted += 1;
          emitOperationalProgress('INTERFACE_ROOT', interfaceStartedAt, iteration, j);
          let interfaceResult: JobBInterfaceResponse;
          try {
            interfaceResult = await interfaceEvaluator(interfaceRequest, remainingOperationMs());
          } catch (error) {
            requests.push({ cellIndex: j, requestHash, request: interfaceRequest as unknown as Record<string, unknown>, response: null,
              failure: error instanceof Error ? error.message : 'LOCAL_INTERFACE_UNKNOWN_FAILURE' });
            throw error;
          }
          interfaceCallsCompleted += 1;
          emitOperationalProgress('INTERFACE_ROOT', interfaceStartedAt, iteration, j);
          requests.push({ cellIndex: j, requestHash, request: interfaceRequest as unknown as Record<string, unknown>,
            response: interfaceResult as unknown as Record<string, unknown>, failure: null });
          if (!interfaceResult || typeof interfaceResult !== 'object'
            || interfaceResult.status !== 'CALCULATED_PRELIMINARY_INTERFACE'
            || !interfaceResult.interface
            || !Array.isArray(interfaceResult.interface.continuousComponentFluxMolM2S)
            || interfaceResult.interface.continuousComponentFluxMolM2S.length !== 7) {
            const status = interfaceResult?.status ?? 'INVALID_RESPONSE';
            requests.at(-1)!.failure = `STAGE4_JOB_B_INTERFACE_UNAVAILABLE:${status}`;
            interfaceFailure = { requestHash, request: interfaceRequest as unknown as Record<string, unknown>, response: interfaceResult,
              iteration, cellIndex: j };
            throw new Error(`STAGE4_JOB_B_INTERFACE_UNAVAILABLE:${status}`);
          }
          interfaceResultHashes.push(typeof (interfaceResult as any).resultHash === 'string'
            ? (interfaceResult as any).resultHash : null);
          const raw = interfaceResult.interface.continuousComponentFluxMolM2S
            .map(value => value * interfacialArea);
          if (raw.some(value => !finite(value))) {
            requests.at(-1)!.failure = 'STAGE4_JOB_B_INTERFACE_TRANSFER_INVALID';
            throw new Error('STAGE4_JOB_B_INTERFACE_TRANSFER_INVALID');
          }
          const equality = interfaceResult.interface.fluxEqualityResidualMolM2S;
          if (!Array.isArray(equality) || equality.length !== 7 || equality.some(value => !finite(value))
            || !finite(interfaceResult.interface.totalMolarFluxMolM2S)) {
            requests.at(-1)!.failure = 'STAGE4_JOB_B_INTERFACE_FILM_CLOSURE_INVALID';
            throw new Error('STAGE4_JOB_B_INTERFACE_FILM_CLOSURE_INVALID');
          }
          latestFilmEquality = Math.max(latestFilmEquality,
            ...equality.map(value => Math.abs(value) * interfacialArea));
          latestStefanIdentity = Math.max(latestStefanIdentity, Math.abs(
            raw.reduce((sum, value) => sum + value, 0)
            - interfaceResult.interface.totalMolarFluxMolM2S * interfacialArea,
          ));
          const diffusive = interfaceResult.interface.continuousDiffusiveFluxMolM2S;
          if (!Array.isArray(diffusive) || diffusive.length !== 7 || diffusive.some(value => !finite(value))) {
            requests.at(-1)!.failure = 'STAGE4_JOB_B_INTERFACE_DIFFUSIVE_FRAME_INVALID';
            throw new Error('STAGE4_JOB_B_INTERFACE_DIFFUSIVE_FRAME_INVALID');
          }
          latestFrame = Math.max(latestFrame,
            Math.abs(diffusive.reduce((sum, value) => sum + value, 0)) * interfacialArea);
          proposed.push(raw);
        }
      } catch (error) {
        return { failure: error instanceof Error ? error.message : 'LOCAL_EQUILIBRIUM_FAILURE',
          faces, qFaces, xc, dIn, dOut, proposed, interfaceResultHashes, requests,
          physicalAdmissibility: { continuousFacesNonnegative, continuousTotalFaceFlowsPositive,
            localPhaseStatesNonnegative },
          diagnostics: { frame: latestFrame, filmEquality: latestFilmEquality, stefanIdentity: latestStefanIdentity } };
      }
      return { failure: null, faces, qFaces, xc, dIn, dOut, proposed, interfaceResultHashes, requests,
        physicalAdmissibility: { continuousFacesNonnegative, continuousTotalFaceFlowsPositive,
          localPhaseStatesNonnegative },
        diagnostics: { frame: latestFrame, filmEquality: latestFilmEquality, stefanIdentity: latestStefanIdentity } };
    };
    if (controls.diagnostic?.strategy === 'RESIDUAL_CONTROLLED_GOOD_BROYDEN') {
      const flatten = (state: number[][]) => state.flat();
      const scaledResidual = (state: number[][], proposed: number[][]) =>
        flatten(state).map((value, i) => (value - flatten(proposed)[i]) / feedScale[i % 7]);
      const residualMerit = (values: number[]) => values.reduce((sum, value) =>
        sum + value * value, 0) / (2 * values.length);
      const feasible = (candidate: number[][]) => {
        const c = [...feed.continuous], d = [...feed.dispersed];
        for (let j = 0; j < cells; j += 1) {
          for (let i = 0; i < 7; i += 1) c[i] -= candidate[j][i];
          if (c.some(value => value < -1e-12 || !finite(value))) return false;
        }
        for (let j = cells - 1; j >= 0; j -= 1) {
          for (let i = 0; i < 7; i += 1) d[i] += candidate[j][i];
          if (d.some(value => value < -1e-12 || !finite(value))) return false;
        }
        return [...c, ...d].every(value => value >= -1e-12 && finite(value));
      };
      const candidateRecord = (evaluated: Awaited<ReturnType<typeof evaluateWholeColumnState>>,
        state: number[][], iteration: number, candidateId: number,
        disposition: Stage4ResidualControlledCandidate['disposition'],
        rejectionReason: string | null, strategy: Stage4ResidualControlledCandidate['strategy'],
        step: number[], radius: number) => {
        const raw = evaluated.failure ? [] : flatten(state).map((value, i) =>
          value - flatten(evaluated.proposed)[i]);
        const scaled = evaluated.failure ? [] : scaledResidual(state, evaluated.proposed);
        const row: Stage4ResidualControlledCandidate = {
          iteration, candidateId, disposition, rejectionReason, strategy,
          actualResidualStatus: evaluated.failure
            ? 'NOT_COMPLETED_PHYSICAL_OR_LOCAL_GATE_FAILED'
            : 'COMPLETE_FRESH_WHOLE_COLUMN_EVALUATION',
          actualRawResidualMolS: evaluated.failure ? state.map(() => []) : state.map((line, j) =>
            line.map((value, i) => value - evaluated.proposed[j][i])),
          actualScaledResidual: scaled,
          actualMaximumScaledResidual: scaled.length ? vectorInfinityNorm(scaled) : Infinity,
          stepScaled: step, stepInfinityNorm: step.length ? vectorInfinityNorm(step) : 0,
          trustRegionInfinityRadius: radius,
          physicalAdmissibility: evaluated.physicalAdmissibility,
          localInterfaceQualification: {
            status: evaluated.interfaceResultHashes.length === cells
              ? 'QUALIFIED_BY_EXISTING_JOB_B_RESPONSE_GATE' : 'NOT_COMPLETED',
            completedCells: evaluated.interfaceResultHashes.length, requiredCells: cells,
            requests: evaluated.requests,
          },
          transferMolS: state.map(line => [...line]),
          continuousFaceComponentFlowsMolS: evaluated.faces.map(line => [...line]),
          continuousCellMoleFractions: evaluated.xc.map(line => [...line]),
          dispersedCellInComponentFlowsMolS: evaluated.dIn.map(line => [...line]),
          dispersedCellOutComponentFlowsMolS: evaluated.dOut.map(line => [...line]),
        };
        try {
          // The harness checkpoints this complete object synchronously; an
          // observer exception must never turn a rejected state into acceptance.
          controls.diagnostic?.onCandidate?.(structuredClone(row));
        } catch (error) {
          console.error('STAGE4_RESIDUAL_CONTROLLED_CANDIDATE_OBSERVER_FAILED', error);
        }
        return row;
      };
      const residualFailure = (reason: string, iterations: number, state: number[][],
        acceptedCandidates: number, rejectedCandidates: number): MeshSolve => ({
        converged: false, reason, interfaceFailure, iterations, localFlashCalls: flashCalls,
        continuousOutlet: [], dispersedOutlet: [], transfer: state,
        maxScaledUpdateResidual: null, maxScaledConstitutiveResidual: null,
        maxScaledComponentBalanceResidual: null, maxAxialResidualMolS: null,
        maxDiffusiveFrameResidualMolS: latestFrame, maxFilmEqualityResidualMolS: latestFilmEquality,
        maxStefanIdentityResidualMolS: latestStefanIdentity,
        residualControlled: {
          strategy: 'SAFEGUARDED_GOOD_BROYDEN_ACTUAL_WHOLE_COLUMN_RESIDUAL_V1',
          acceptedCandidates, rejectedCandidates, finalActualScaledResidual: null,
        },
      });
      const finalLocalQualification = async (evaluated: Awaited<ReturnType<typeof evaluateWholeColumnState>>,
        iteration: number, residuals: Record<string, number>) => {
        for (let j = 0; j < cells; j += 1) {
          const xD = normalize(evaluated.dIn[j].map((value, i) =>
            .5 * (value + evaluated.dOut[j][i])));
          const localCtC = continuousPhase.densityKgM3 / (evaluated.xc[j]
            .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
          const localCtD = dispersedPhase.densityKgM3 / (xD
            .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
          const inventory = evaluated.xc[j].map((fraction, i) =>
            (1 - hydraulics.operatingHoldup) * area * dz * localCtC * fraction
            + hydraulics.operatingHoldup * area * dz * localCtD * xD[i]);
          const started = performance.now();
          emitOperationalProgress('FINAL_LOCAL_LLE_QUALIFICATION', started, iteration, j, residuals);
          const response = await flashEvaluator({
            temperatureK: basis.temperatureK, componentMolarInventory: inventory,
            componentOrder: [...JOB_A_COMPONENT_ORDER],
          }, remainingOperationMs());
          flashCalls += 1;
          emitOperationalProgress('FINAL_LOCAL_LLE_QUALIFICATION', started, iteration, j, residuals);
          validateLocalFlash(response, feed.continuousIsExtract);
        }
      };
      let state = transfer;
      let acceptedCandidates = 0;
      let rejectedCandidates = 0;
      let candidateId = 0;
      let trustRegionInfinityRadius = .05;
      let inverseJacobian: number[][] = Array.from({ length: cells * 7 }, (_row, r) =>
        Array.from({ length: cells * 7 }, (_col, col) => r === col ? .2 : 0));
      let current = await evaluateWholeColumnState(state, 0);
      const initial = candidateRecord(current, state, 0, candidateId++, 'INITIAL',
        current.failure, 'PICARD_BOOTSTRAP', [], trustRegionInfinityRadius);
      if (current.failure) return residualFailure(current.failure, 0, state, acceptedCandidates, rejectedCandidates);
      let residual = initial.actualScaledResidual;
      for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
        if (controls.cancelled() || Date.now() > controls.deadlineMs) {
          return residualFailure(controls.cancelled()
            ? 'STAGE4_FINITE_RATE_SOLVER_CANCELLED' : 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED',
          iteration - 1, state, acceptedCandidates, rejectedCandidates);
        }
        const currentMaximum = vectorInfinityNorm(residual);
        const diagnosticGatesPass = current.diagnostics.frame <= 1e-9
          && current.diagnostics.filmEquality <= 1e-9
          && current.diagnostics.stefanIdentity <= 1e-9;
        // A converged residual is still independently stability-qualified.
        // Preserve the original acceptance update gate as an observation of
        // the historical .20 Picard map at this same freshly evaluated state;
        // the residual-controlled proposal itself is never substituted for it.
        const originalPicardScaledUpdate = .20 * currentMaximum;
        if (currentMaximum <= 1e-5 && originalPicardScaledUpdate <= relativeTolerance
          && diagnosticGatesPass) {
          try {
            await finalLocalQualification(current, iteration, {
              actualMaximumScaledResidual: currentMaximum, originalPicardScaledUpdate,
            });
          } catch (error) {
            return residualFailure(error instanceof Error ? error.message : 'FINAL_LOCAL_LLE_QUALIFICATION_FAILED',
              iteration, state, acceptedCandidates, rejectedCandidates);
          }
          const postUpdate = independentlyReconstructState(state);
          const continuousOutlet = current.faces[cells];
          const dispersedOutlet = current.dOut[0];
          const accepted = postUpdate.componentBalance <= 1e-10 && Math.abs(postUpdate.massBalance) <= 1e-12
            && postUpdate.maximumAxialEquationResidual <= 1e-10 && postUpdate.physicallyAdmissible;
          return {
            converged: accepted,
            reason: accepted ? null : `FINAL_SCALED_RESIDUAL_GATE_FAILED:${currentMaximum}:${postUpdate.componentBalance}:${postUpdate.massBalance}`,
            iterations: iteration, localFlashCalls: flashCalls, continuousOutlet, dispersedOutlet, transfer: state,
            maxScaledUpdateResidual: originalPicardScaledUpdate, maxScaledConstitutiveResidual: currentMaximum,
            maxScaledComponentBalanceResidual: postUpdate.componentBalance,
            maxAxialResidualMolS: postUpdate.maximumAxialEquationResidual,
            maxDiffusiveFrameResidualMolS: current.diagnostics.frame,
            maxFilmEqualityResidualMolS: current.diagnostics.filmEquality,
            maxStefanIdentityResidualMolS: current.diagnostics.stefanIdentity,
            maxPostUpdateScaledComponentBalanceResidual: postUpdate.componentBalance,
            postUpdateTotalMassBalanceResidualKgS: postUpdate.massBalance,
            maxPostUpdateContinuousAxialEquationResidualMolS: postUpdate.maximumAxialEquationResidual,
            postUpdatePhysicalAdmissibilityPassed: postUpdate.physicallyAdmissible,
            residualControlled: {
              strategy: 'SAFEGUARDED_GOOD_BROYDEN_ACTUAL_WHOLE_COLUMN_RESIDUAL_V1',
              acceptedCandidates, rejectedCandidates, finalActualScaledResidual: currentMaximum,
            },
          };
        }
        const strategy = acceptedCandidates === 0 ? 'PICARD_BOOTSTRAP' as const
          : 'DENSE_GOOD_BROYDEN' as const;
        const proposal = stage4SafeguardedGoodBroydenStep({
          inverseJacobian, scaledResidual: residual, trustRegionInfinityRadius,
        });
        let step = proposal.step;
        let next = state.map((row, j) => row.map((value, i) =>
          value + step[j * 7 + i] * feedScale[i]));
        while (!feasible(next) && vectorInfinityNorm(step) > 1e-12) {
          step = step.map(value => value / 2);
          next = state.map((row, j) => row.map((value, i) =>
            value + step[j * 7 + i] * feedScale[i]));
        }
        if (!feasible(next)) {
          // Record the actual infeasible proposal too. No worker is called
          // after the physical gate fails, but its reconstructed state is
          // retained rather than silently replacing it with the prior state.
          const infeasible = await evaluateWholeColumnState(next, iteration);
          const rejected = candidateRecord(infeasible, next, iteration, candidateId++, 'REJECTED',
            'NONNEGATIVE_LINE_SEARCH_EXHAUSTED', strategy, step, trustRegionInfinityRadius);
          rejectedCandidates += 1;
          trustRegionInfinityRadius /= 2;
          if (trustRegionInfinityRadius < 1e-12) {
            return residualFailure(rejected.rejectionReason!, iteration, state, acceptedCandidates, rejectedCandidates);
          }
          continue;
        }
        const evaluated = await evaluateWholeColumnState(next, iteration);
        const nextResidual = evaluated.failure ? [] : scaledResidual(next, evaluated.proposed);
        const nextGatesPass = !evaluated.failure && evaluated.diagnostics.frame <= 1e-9
          && evaluated.diagnostics.filmEquality <= 1e-9 && evaluated.diagnostics.stefanIdentity <= 1e-9;
        const decreasesActualResidual = nextResidual.length === residual.length
          && residualMerit(nextResidual) < residualMerit(residual);
        if (!nextGatesPass || !decreasesActualResidual) {
          const rejectionReason = evaluated.failure ?? (!nextGatesPass
            ? 'ACTUAL_CANDIDATE_DIAGNOSTIC_GATE_FAILED'
            : 'ACTUAL_WHOLE_COLUMN_RESIDUAL_NOT_REDUCED');
          candidateRecord(evaluated, next, iteration, candidateId++, 'REJECTED',
            rejectionReason, strategy, step, trustRegionInfinityRadius);
          rejectedCandidates += 1;
          // A closed/timed-out worker or any returned protocol/integrity error
          // cannot become healthy by changing a column iterate.  Retain its
          // complete candidate evidence and stop; only explicit bulk-domain
          // violations are eligible for a smaller feasible proposal.
          const recoverableDomainFailure = evaluated.failure === 'NONNEGATIVE_CONTINUOUS_FACE_GATE_FAILED'
            || evaluated.failure === 'NONNEGATIVE_LOCAL_PHASE_STATE_GATE_FAILED';
          if (evaluated.failure && !recoverableDomainFailure) {
            return residualFailure(rejectionReason, iteration, state, acceptedCandidates, rejectedCandidates);
          }
          trustRegionInfinityRadius /= 2;
          continue;
        }
        candidateRecord(evaluated, next, iteration, candidateId++, 'ACCEPTED',
          null, strategy, step, trustRegionInfinityRadius);
        acceptedCandidates += 1;
        inverseJacobian = stage4GoodBroydenInverseUpdate(inverseJacobian, step,
          nextResidual.map((value, i) => value - residual[i]));
        state = next;
        current = evaluated;
        residual = nextResidual;
        trustRegionInfinityRadius = Math.min(.5, trustRegionInfinityRadius * 1.5);
      }
      return residualFailure('COUNTERCURRENT_NONLINEAR_ITERATION_LIMIT', maxIterations,
        state, acceptedCandidates, rejectedCandidates);
    }
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const iterationStartedAt = performance.now();
      if (Date.now() > controls.deadlineMs || controls.cancelled()) {
        return { converged: false,
          reason: controls.cancelled() ? 'STAGE4_FINITE_RATE_SOLVER_CANCELLED' : 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED',
          iterations: iteration,
          localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
          maxScaledUpdateResidual: null, maxScaledConstitutiveResidual: null,
          maxScaledComponentBalanceResidual: null, maxAxialResidualMolS: null,
          maxDiffusiveFrameResidualMolS: null, maxFilmEqualityResidualMolS: null,
          maxStefanIdentityResidualMolS: null };
      }
      const evaluated = await evaluateWholeColumnState(transfer, iteration + 1);
      if (evaluated.failure) {
        return { converged: false, reason: evaluated.failure, interfaceFailure,
          iterations: iteration + 1, localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
          maxScaledUpdateResidual: null, maxScaledConstitutiveResidual: null,
          maxScaledComponentBalanceResidual: null, maxAxialResidualMolS: null,
          maxDiffusiveFrameResidualMolS: null, maxFilmEqualityResidualMolS: null,
          maxStefanIdentityResidualMolS: null };
      }
      const { faces, qFaces, xc, dIn, dOut, proposed, interfaceResultHashes } = evaluated;
      // A bounded line search maintains non-negative face and countercurrent
      // dispersed flows; it is numerical damping, not a transfer limiter.
      let relaxation = .20;
      const feasible = (candidate: number[][]) => {
        const c = [...feed.continuous], d = [...feed.dispersed];
        for (let j = 0; j < cells; j += 1) {
          for (let i = 0; i < 7; i += 1) c[i] -= candidate[j][i];
          if (c.some(value => value < -1e-12 || !finite(value))) return false;
        }
        for (let j = cells - 1; j >= 0; j -= 1) {
          for (let i = 0; i < 7; i += 1) d[i] += candidate[j][i];
          if (d.some(value => value < -1e-12 || !finite(value))) return false;
        }
        return [...c, ...d].every(value => value >= -1e-12 && finite(value));
      };
      let next = transfer.map((row, j) => row.map((value, i) =>
        value + relaxation * (proposed[j][i] - value)));
      while (!feasible(next) && relaxation > 1e-10) {
        relaxation /= 2;
        next = transfer.map((row, j) => row.map((value, i) =>
          value + relaxation * (proposed[j][i] - value)));
      }
      if (!feasible(next)) {
        return { converged: false, reason: 'NONNEGATIVE_LINE_SEARCH_EXHAUSTED', iterations: iteration + 1,
          localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
          maxScaledUpdateResidual: null, maxScaledConstitutiveResidual: null,
          maxScaledComponentBalanceResidual: null, maxAxialResidualMolS: null,
          maxDiffusiveFrameResidualMolS: null, maxFilmEqualityResidualMolS: null,
          maxStefanIdentityResidualMolS: null };
      }
      const update = scaledMaximum(next.flatMap((row, j) => row.map((value, i) =>
        value - transfer[j][i])), feedScale);
      const iterationResiduals = {
        maxScaledUpdateResidual: update,
        maxDiffusiveFrameResidualMolS: latestFrame,
        maxFilmEqualityResidualMolS: latestFilmEquality,
        maxStefanIdentityResidualMolS: latestStefanIdentity,
      };
      if (controls.diagnostic) {
        const continuousOutlet = feed.continuous.map((value, i) =>
          value - transfer.reduce((sum, row) => sum + row[i], 0));
        const dispersedOutlet = feed.dispersed.map((value, i) =>
          value + transfer.reduce((sum, row) => sum + row[i], 0));
        const originalConstitutive = scaledMaximum(transfer.flatMap((row, j) =>
          row.map((value, i) => value - proposed[j][i])), feedScale);
        const originalAxial = Math.max(...transfer.flatMap((row, j) => row.map((value, i) =>
          faces[j][i] - faces[j + 1][i] - value).map(Math.abs)));
        const originalComponentBalance = scaledMaximum(continuousOutlet.map((value, i) =>
          feed.continuous[i] + feed.dispersed[i] - value - dispersedOutlet[i]), feedScale);
        const totalMassBalance = continuousOutlet.reduce((sum, value, i) =>
          sum + value * MW[i] / 1000, 0) + dispersedOutlet.reduce((sum, value, i) =>
          sum + value * MW[i] / 1000, 0) - feed.continuous.reduce((sum, value, i) =>
          sum + value * MW[i] / 1000, 0) - feed.dispersed.reduce((sum, value, i) =>
          sum + value * MW[i] / 1000, 0);
        const continuousTotal = continuousOutlet.reduce((sum, value) => sum + value, 0);
        const dispersedTotal = dispersedOutlet.reduce((sum, value) => sum + value, 0);
        try {
          controls.diagnostic.onIteration?.({
            iteration: iteration + 1,
            scaledUpdateResidual: update,
            originalCoupledColumnResidual: {
              continuousAxialComponentBalanceMolS: originalAxial,
              totalComponentBalanceMolS: Math.max(...continuousOutlet.map((value, i) =>
                Math.abs(feed.continuous[i] + feed.dispersed[i] - value - dispersedOutlet[i]))),
            },
            originalConstitutiveResidual: { scaledMaximum: originalConstitutive },
            originalComponentBalanceResidual: { scaledMaximum: originalComponentBalance },
            totalMassBalanceResidualKgS: totalMassBalance,
            physicalAdmissibility: {
              continuousFacesNonnegative: faces.flat().every(value => value >= -1e-11 && finite(value)),
              continuousTotalFaceFlowsPositive: qFaces.every(positive),
              localPhaseStatesNonnegative: [...xc.flat(), ...dIn.flat(), ...dOut.flat()]
                .every(value => value >= -1e-11 && finite(value)),
            },
            localInterfaceQualification: {
              status: interfaceResultHashes.length === cells
                ? 'QUALIFIED_BY_EXISTING_JOB_B_RESPONSE_GATE' : 'NOT_COMPLETED',
              completedCells: interfaceResultHashes.length,
              requiredCells: cells,
              responseResultHashes: interfaceResultHashes,
            },
            localFlashQualification: {
              status: 'NOT_EVALUATED_INTERIM_EXISTING_SOLVER_FINAL_ONLY',
            },
            transferMolS: transfer.map(row => [...row]),
            continuousFaceComponentFlowsMolS: faces.map(row => [...row]),
            continuousCellMoleFractions: xc.map(row => [...row]),
            dispersedCellInComponentFlowsMolS: dIn.map(row => [...row]),
            dispersedCellOutComponentFlowsMolS: dOut.map(row => [...row]),
            dispersedCellMoleFractions: dIn.map((row, j) =>
              normalize(row.map((value, i) => .5 * (value + dOut[j][i])))),
            outletPhaseFlows: {
              continuousMolS: continuousOutlet,
              dispersedMolS: dispersedOutlet,
              continuousTotalMolS: continuousTotal,
              dispersedTotalMolS: dispersedTotal,
              continuousMoleFractions: continuousTotal > 0 ? normalize(continuousOutlet) : null,
              dispersedMoleFractions: dispersedTotal > 0 ? normalize(dispersedOutlet) : null,
            },
          });
        } catch (error) {
          // A frozen diagnostic observer is not allowed to perturb production
          // numerical control flow. Its own durable checkpoint failure is
          // reported by the harness, not recast as a scientific solver result.
          console.error('STAGE4_DIAGNOSTIC_ITERATION_OBSERVER_FAILED', error);
        }
      }
      residualHistory.push(iterationResiduals);
      emitOperationalProgress('COUNTERCURRENT_ITERATION_COMPLETE', iterationStartedAt,
        iteration + 1, null, iterationResiduals);
      if (update <= relativeTolerance) {
        // `proposed` was evaluated from the *current* reconstructed faces and
        // local interface roots. Qualify that same state; returning `next`
        // would otherwise pair outlets with stale constitutive evaluations.
        const continuousOutlet = feed.continuous.map((value, i) =>
          value - transfer.reduce((sum, row) => sum + row[i], 0));
        const dispersedOutlet = feed.dispersed.map((value, i) =>
          value + transfer.reduce((sum, row) => sum + row[i], 0));
        const constitutive = scaledMaximum(transfer.flatMap((row, j) =>
          row.map((value, i) => value - proposed[j][i])), feedScale);
        const axial = Math.max(...transfer.flatMap((row, j) => row.map((value, i) =>
          faces[j][i] - faces[j + 1][i] - value).map(Math.abs)));
        const balance = scaledMaximum(continuousOutlet.map((value, i) =>
          feed.continuous[i] + feed.dispersed[i] - value - dispersedOutlet[i]), feedScale);
        // The frozen diagnostic also rebuilds the phase outlets from `next`,
        // independently of the current-state constitutive response. Component
        // and mass closure remain redundant transfer-conservation identities;
        // the separately reconstructed boundary-flux/dispersion residual is
        // the non-redundant axial-equation check. This is diagnostic-only and
        // cannot alter the production route.
        const postUpdate = controls.diagnostic ? independentlyReconstructState(next) : null;
        // Job-B has solved local chemical-potential/interface stability during
        // every iteration. Independently admit the converged bulk state using
        // the pinned flash once per FV cell, with liquid holdup inventory
        // rather than a throughput surrogate.
        try {
          for (let j = 0; j < cells; j += 1) {
            const xD = normalize(dIn[j].map((value, i) => .5 * (value + dOut[j][i])));
            const localCtC = continuousPhase.densityKgM3 / (xc[j]
              .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
            const localCtD = dispersedPhase.densityKgM3 / (xD
              .reduce((sum, fraction, i) => sum + fraction * MW[i], 0) / 1000);
            const inventory = xc[j].map((fraction, i) =>
              (1 - hydraulics.operatingHoldup) * area * dz * localCtC * fraction
              + hydraulics.operatingHoldup * area * dz * localCtD * xD[i]);
            if (controls.cancelled() || Date.now() > controls.deadlineMs) {
              throw new Error(controls.cancelled()
                ? 'STAGE4_FINITE_RATE_SOLVER_CANCELLED'
                : 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED');
            }
            const localQualificationStartedAt = performance.now();
            emitOperationalProgress('FINAL_LOCAL_LLE_QUALIFICATION', localQualificationStartedAt,
              iteration + 1, j, iterationResiduals);
            const localQualificationResponse = await flashEvaluator({
              temperatureK: basis.temperatureK, componentMolarInventory: inventory,
              componentOrder: [...JOB_A_COMPONENT_ORDER],
            }, remainingOperationMs());
            flashCalls += 1;
            emitOperationalProgress('FINAL_LOCAL_LLE_QUALIFICATION', localQualificationStartedAt,
              iteration + 1, j, iterationResiduals);
            validateLocalFlash(localQualificationResponse, feed.continuousIsExtract);
          }
        } catch (error) {
          return { converged: false, reason: error instanceof Error ? error.message : 'FINAL_LOCAL_LLE_QUALIFICATION_FAILED',
            iterations: iteration + 1, localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
            maxScaledUpdateResidual: update, maxScaledConstitutiveResidual: constitutive,
            maxScaledComponentBalanceResidual: balance, maxAxialResidualMolS: axial,
            maxDiffusiveFrameResidualMolS: latestFrame,
            maxFilmEqualityResidualMolS: latestFilmEquality,
            maxStefanIdentityResidualMolS: latestStefanIdentity };
        }
        const accepted = constitutive <= 1e-5 && balance <= 1e-10
          && (!controls.diagnostic || (!!postUpdate && postUpdate.componentBalance <= 1e-10
            && Math.abs(postUpdate.massBalance) <= 1e-12
            && postUpdate.maximumAxialEquationResidual <= 1e-10
            && postUpdate.physicallyAdmissible
            && latestFrame <= 1e-9
            && latestFilmEquality <= 1e-9
            && latestStefanIdentity <= 1e-9));
        return { converged: accepted,
          reason: accepted ? null
            : `FINAL_SCALED_RESIDUAL_GATE_FAILED:${constitutive}:${balance}:${postUpdate?.componentBalance ?? 'NOT_DIAGNOSTIC'}:${postUpdate?.massBalance ?? 'NOT_DIAGNOSTIC'}`,
          iterations: iteration + 1, localFlashCalls: flashCalls, continuousOutlet, dispersedOutlet, transfer,
          maxScaledUpdateResidual: update, maxScaledConstitutiveResidual: constitutive,
          maxScaledComponentBalanceResidual: balance, maxAxialResidualMolS: axial,
          maxDiffusiveFrameResidualMolS: latestFrame,
          maxFilmEqualityResidualMolS: latestFilmEquality,
          maxStefanIdentityResidualMolS: latestStefanIdentity,
          ...(postUpdate ? {
            maxPostUpdateScaledComponentBalanceResidual: postUpdate.componentBalance,
            postUpdateTotalMassBalanceResidualKgS: postUpdate.massBalance,
            maxPostUpdateContinuousAxialEquationResidualMolS: postUpdate.maximumAxialEquationResidual,
            postUpdatePhysicalAdmissibilityPassed: postUpdate.physicallyAdmissible,
          } : {}) };
      }
      transfer = next;
    }
    return { converged: false, reason: 'COUNTERCURRENT_NONLINEAR_ITERATION_LIMIT', iterations: maxIterations,
      localFlashCalls: flashCalls, continuousOutlet: [], dispersedOutlet: [], transfer,
      maxScaledUpdateResidual: null, maxScaledConstitutiveResidual: null,
      maxScaledComponentBalanceResidual: null, maxAxialResidualMolS: null,
      maxDiffusiveFrameResidualMolS: null, maxFilmEqualityResidualMolS: null,
      maxStefanIdentityResidualMolS: null };
  };

  if (controls.diagnostic) {
    if (controls.diagnostic.physicalCompartments !== input.calculatedNt
      || controls.diagnostic.cellsPerPhysicalCompartment !== 2) {
      throw new Error('STAGE4_FROZEN_COARSE_DIAGNOSTIC_SCOPE_INVALID');
    }
    const diagnosticMesh = await solveMesh(controls.diagnostic.physicalCompartments,
      controls.diagnostic.cellsPerPhysicalCompartment);
    return {
      ...result,
      diagnosticMesh,
    };
  }

  // N is physical hardware. The finite-volume resolution below is deliberately
  // independent (2 then 4 axial cells per physical compartment).
  let lowerCountUnresolved = false;
  for (let count = input.calculatedNt; count <= max; count += 1) {
    result.attemptedPhysicalCompartments.push(count);
    await emitProgress({ caseCoefficient: c, physicalCompartments: count,
      finiteVolumeCellsPerPhysicalCompartment: 2, state: 'STARTED', localFlashCalls: 0, reason: null });
    const coarse = await solveMesh(count, 2);
    await emitProgress({ caseCoefficient: c, physicalCompartments: count,
      finiteVolumeCellsPerPhysicalCompartment: 2,
      state: coarse.converged ? 'CONVERGED' : 'NUMERICAL_FAILURE',
      localFlashCalls: coarse.localFlashCalls, reason: coarse.reason });
    await emitProgress({ caseCoefficient: c, physicalCompartments: count,
      finiteVolumeCellsPerPhysicalCompartment: 4, state: 'STARTED', localFlashCalls: 0, reason: null });
    const refined = await solveMesh(count, 4);
    await emitProgress({ caseCoefficient: c, physicalCompartments: count,
      finiteVolumeCellsPerPhysicalCompartment: 4,
      state: refined.converged ? 'CONVERGED' : 'NUMERICAL_FAILURE',
      localFlashCalls: refined.localFlashCalls, reason: refined.reason });
    if (!coarse.converged || !refined.converged) {
      result.nonconvergedPhysicalCounts.push(count);
      result.physicalCountOutcomes.push({ physicalCompartments: count,
        status: 'NUMERICAL_UNRESOLVED', reason: `COARSE:${coarse.reason};REFINED:${refined.reason}` });
      lowerCountUnresolved = true;
      result.lastConservedPhysicalTrial = {
        physicalCompartments: count, status: 'NUMERICAL_FAILURE',
        coarse: { reason: coarse.reason, iterations: coarse.iterations, localFlashCalls: coarse.localFlashCalls,
          interfaceFailure: coarse.interfaceFailure ?? null },
        refined: { reason: refined.reason, iterations: refined.iterations, localFlashCalls: refined.localFlashCalls,
          interfaceFailure: refined.interfaceFailure ?? null },
      };
      await emitProgress({ caseCoefficient: c, physicalCompartments: count,
        finiteVolumeCellsPerPhysicalCompartment: 4,
        state: 'NUMERICAL_FAILURE', localFlashCalls: refined.localFlashCalls,
        reason: result.physicalCountOutcomes.at(-1)?.reason ?? refined.reason });
      // No higher count can establish a minimum while this count is unknown.
      // Preserve the evidence and leave time for the other coefficient case.
      break;
    }
    const meshDifference = scaledMaximum(refined.continuousOutlet.map((value, i) =>
      value - coarse.continuousOutlet[i]).concat(refined.dispersedOutlet.map((value, i) =>
      value - coarse.dispersedOutlet[i])), feed.continuous.map((value, i) =>
      Math.max(value + feed.dispersed[i], 1e-12)));
    const cf = refined.continuousOutlet;
    const df = refined.dispersedOutlet;
    const oilOutlet = feed.continuousIsExtract ? df : cf;
    if (oilOutlet.some(value => !finite(value) || value < 0)) {
      result.nonconvergedPhysicalCounts.push(count);
      result.physicalCountOutcomes.push({ physicalCompartments: count,
        status: 'NUMERICAL_UNRESOLVED', reason: 'FINAL_OIL_OUTLET_NONNEGATIVE_GATE_FAILED' });
      lowerCountUnresolved = true;
      await emitProgress({ caseCoefficient: c, physicalCompartments: count,
        finiteVolumeCellsPerPhysicalCompartment: 4,
        state: 'NUMERICAL_FAILURE', localFlashCalls: refined.localFlashCalls,
        reason: result.physicalCountOutcomes.at(-1)?.reason ?? null });
      break;
    }
    const duty = evaluateStage4ProductTargets(oilOutlet,
      feed.continuousIsExtract ? feed.dispersed : feed.continuous, input.stage1Targets);
    const coarseOilOutlet = feed.continuousIsExtract ? coarse.dispersedOutlet : coarse.continuousOutlet;
    const coarseDuty = evaluateStage4ProductTargets(coarseOilOutlet,
      feed.continuousIsExtract ? feed.dispersed : feed.continuous, input.stage1Targets);
    const targetStatusChanged = coarseDuty.metrics.some((metric, index) =>
      metric.status !== duty.metrics[index].status);
    if (meshDifference > .01 || targetStatusChanged) {
      result.nonconvergedPhysicalCounts.push(count);
      result.physicalCountOutcomes.push({ physicalCompartments: count,
        status: 'NUMERICAL_UNRESOLVED', reason: targetStatusChanged
          ? 'FV_REFINEMENT_CHANGED_TARGET_STATUS' : 'FV_REFINEMENT_OUTLET_DIFFERENCE_EXCEEDS_1_PCT' });
      lowerCountUnresolved = true;
      result.lastConservedPhysicalTrial = { physicalCompartments: count, status: 'FV_REFINEMENT_NOT_CONVERGED',
        relativeOutletDifference: meshDifference, targetStatusChanged, coarse, refined };
      await emitProgress({ caseCoefficient: c, physicalCompartments: count,
        finiteVolumeCellsPerPhysicalCompartment: 4,
        state: 'NUMERICAL_FAILURE', localFlashCalls: refined.localFlashCalls,
        reason: result.physicalCountOutcomes.at(-1)?.reason ?? null });
      break;
    }
    const mixResidual = refined.maxAxialResidualMolS ?? 1;
    const balance = refined.maxScaledComponentBalanceResidual ?? 1;
    if (mixResidual > 1e-10 || balance > 1e-10
      || (refined.maxDiffusiveFrameResidualMolS ?? 1) > 1e-9
      || (refined.maxFilmEqualityResidualMolS ?? 1) > 1e-9
      || (refined.maxStefanIdentityResidualMolS ?? 1) > 1e-9) {
      result.nonconvergedPhysicalCounts.push(count);
      result.physicalCountOutcomes.push({ physicalCompartments: count,
        status: 'NUMERICAL_UNRESOLVED', reason: 'FINAL_CONSERVATION_OR_FRAME_RESIDUAL_GATE_FAILED' });
      lowerCountUnresolved = true;
      await emitProgress({ caseCoefficient: c, physicalCompartments: count,
        finiteVolumeCellsPerPhysicalCompartment: 4,
        state: 'NUMERICAL_FAILURE', localFlashCalls: refined.localFlashCalls,
        reason: result.physicalCountOutcomes.at(-1)?.reason ?? null });
      break;
    }
    result.lastConservedPhysicalTrial = {
      physicalCompartments: count, activeHeightM: count * pitch,
      overallEfficiency: input.calculatedNt / count,
      targetCompliance: duty,
      maximumScaledGlobalComponentBalanceResidual: balance,
      continuousAxialDispersionConservationResidualMolS: mixResidual,
      scaledConstitutiveResidual: refined.maxScaledConstitutiveResidual,
      finiteVolumeRefinementRelativeOutletDifference: meshDifference,
    };
    result.physicalCountOutcomes.push({ physicalCompartments: count,
      status: duty.allEvaluatedTargetsPassed ? 'TARGET_PASS' : 'TARGET_FAIL',
      reason: duty.allEvaluatedTargetsPassed ? null : 'GOVERNED_PRODUCT_TARGETS_NOT_MET' });
    await emitProgress({ caseCoefficient: c, physicalCompartments: count,
      finiteVolumeCellsPerPhysicalCompartment: 4, state: 'CONVERGED',
      localFlashCalls: refined.localFlashCalls,
      reason: result.physicalCountOutcomes.at(-1)?.reason ?? null });
    if (duty.allEvaluatedTargetsPassed && !result.selected && !lowerCountUnresolved) {
      result.selected = {
        physicalCompartments: count, activeHeightM: count * pitch,
        overallEfficiency: input.calculatedNt / count,
        continuousColumnPeclet: count * pitch
          * hydraulics.continuousSuperficialVelocityMS / dispersion.valueM2S,
        continuousOutletMolarFlowMolS: cf, dispersedOutletMolarFlowMolS: df,
        oilRaffinateOutletMolarFlowMolS: oilOutlet, targetCompliance: duty,
        maximumScaledGlobalComponentBalanceResidual: balance,
        continuousAxialDispersionConservationResidualMolS: mixResidual,
        scaledConstitutiveResidual: refined.maxScaledConstitutiveResidual,
        continuousPhaseTotalMolarFlowChangeMolS: cf.reduce((sum, value) => sum + value, 0)
          - feed.continuous.reduce((sum, value) => sum + value, 0),
        dispersedPhaseTotalMolarFlowChangeMolS: df.reduce((sum, value) => sum + value, 0)
          - feed.dispersed.reduce((sum, value) => sum + value, 0),
        molarAverageDiffusiveFrameResidualMolS: refined.maxDiffusiveFrameResidualMolS,
        maximumFilmEqualityResidualMolS: refined.maxFilmEqualityResidualMolS,
        stefanTotalFluxIdentityResidualMolS: refined.maxStefanIdentityResidualMolS,
        finiteVolumeRefinementRelativeOutletDifference: meshDifference,
        axialDispersion: {
          EcM2S: dispersion.valueM2S, EdM2S: 0, continuousOnly: true,
          discretization: 'implicit cell-centred finite volume; Danckwerts inlet total component flux Qc*xFeed; zero diffusive outlet face',
        },
        localThermodynamics: 'Job-B evaluates pinned 7C chemical potentials and interface stability at each local nonlinear state; the independently pinned bulk 7C flash is freshly admitted at every converged FV-cell state.',
        concentrationConvention: 'Diagonal generalized-Fick two-film screening; total component transfer includes non-equimolar Stefan/convective contribution while the molar-average diffusive residual is zero.',
      };
      break;
    }
  }
  result.searchTermination = result.selected
    ? 'FIRST_CERTIFIABLE_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT'
    : result.nonconvergedPhysicalCounts.length
      ? 'TARGET_COMPLIANCE_UNKNOWN_NUMERICAL_PHYSICAL_COUNTS_REMAIN'
      : 'NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND';
  return result;
}

export type Stage4PredictivePhysicalSizingOptions = {
    flashEvaluator?: FlashEvaluator;
    interfaceEvaluator?: InterfaceEvaluator;
    timeoutMs?: number;
    /** Bounded whole-solve budget; every mesh/count reports a numerical
     * failure rather than allowing child timeouts to become unbounded work. */
    wallClockBudgetMs?: number;
    abortSignal?: AbortSignal;
    onNumericalProgress?: (progress: Stage4PhysicalSizingProgress) => void | Promise<void>;
    /**
     * Optional advisory-only telemetry observer.  It is deliberately separate
     * from mesh/phase progress so a diagnostic sink cannot hold a cell solve.
     */
    onTelemetryProgress?: (progress: Stage4PhysicalSizingProgress) => void | Promise<void>;
    onProgress?: (progress: {
      phase: 'PRIMARY_RUNNING' | 'PRIMARY_COMPLETE' | 'SENSITIVITY_RUNNING' | 'SENSITIVITY_COMPLETE';
      completedCases: 0 | 1 | 2;
      totalCases: 2;
    }) => void | Promise<void>;
    /**
     * Internal diagnostic route used only by runStage4FrozenCoarseDiagnostic.
     * It deliberately reuses solveCase/solveMesh, the evaluator cache, and
     * all existing worker gates while omitting production's count sweep,
     * refinement, and c=0.0105 sensitivity case.
     */
    frozenCoarseDiagnostic?: {
      physicalCompartments: number;
      initialTransfer?: number[][];
      initialTransferMethod?: Stage4FrozenCoarseDiagnosticResult['initialization']['method'];
      onIteration?: (iteration: Stage4FrozenCoarseIteration) => void;
       strategy?: 'EXISTING_PICARD' | 'RESIDUAL_CONTROLLED_GOOD_BROYDEN';
       onCandidate?: (candidate: Stage4ResidualControlledCandidate) => void;
    };
  };

export async function runStage4PredictivePhysicalSizing(input: Stage4PhysicalSizingInput,
  options?: Stage4PredictivePhysicalSizingOptions) {
  if (!Number.isInteger(input.calculatedNt) || input.calculatedNt < 1) {
    throw new Error('STAGE4_VALID_CALCULATED_STAGE2_NT_REQUIRED_NO_DEFAULT_APPLIED');
  }
  const diagnostic = options?.frozenCoarseDiagnostic;
  const wallClockBudgetMs = options?.wallClockBudgetMs ?? 900_000;
  // The production cap remains 30 minutes. The isolated, explicitly named
  // frozen diagnostic owns its separately disclosed one-hour observation
  // budget; it is not a production service setting.
  const maximumWallClockBudgetMs = diagnostic ? 3_600_000 : 1_800_000;
  if (!Number.isFinite(wallClockBudgetMs) || wallClockBudgetMs <= 0
    || wallClockBudgetMs > maximumWallClockBudgetMs) {
    throw new Error('STAGE4_WALL_CLOCK_BUDGET_INVALID');
  }
  const startedAtMonotonicMs = performance.now();
  const startedAtWallClockMs = Date.now();
  const controls = {
    startedAtMonotonicMs,
    deadlineMs: startedAtWallClockMs + wallClockBudgetMs,
    operationTimeoutMs: options?.timeoutMs ?? 120_000,
    cancelled: () => options?.abortSignal?.aborted === true,
    progress: options?.onNumericalProgress,
    // Legacy callers receive the full numerical stream.  Telemetry is routed
    // separately so per-cell observations can be advisory without changing
    // the awaited mesh/phase progress contract.
    telemetry: options?.onTelemetryProgress ?? options?.onNumericalProgress,
    ...(diagnostic ? {
      diagnostic: {
        physicalCompartments: diagnostic.physicalCompartments,
        cellsPerPhysicalCompartment: 2 as const,
        initialTransfer: diagnostic.initialTransfer,
        initialTransferMethod: diagnostic.initialTransferMethod,
        onIteration: diagnostic.onIteration,
         strategy: diagnostic.strategy,
         onCandidate: diagnostic.onCandidate,
      },
    } : {}),
  };
  const session = options?.flashEvaluator ? null : createSevenComponentLocalEquilibriumSession({
    timeoutMs: options?.timeoutMs ?? 120_000,
  });
  const interfaceSession = options?.interfaceEvaluator ? null
    : createStage4DogboxInterfaceSession({ timeoutMs: options?.timeoutMs ?? 120_000 });
  const closeSessions = () => {
    session?.close();
    interfaceSession?.close();
  };
  let rejectInterrupted!: (reason: Error) => void;
  const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
  // The watchdog is active between requests too; keep its rejection handled
  // even when no evaluation is currently awaiting it.
  void interrupted.catch(() => undefined);
  const abort = () => {
    rejectInterrupted(new Error('STAGE4_FINITE_RATE_SOLVER_CANCELLED'));
    closeSessions();
  };
  const deadlineTimer = setTimeout(() => {
    rejectInterrupted(new Error('GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED'));
    closeSessions();
  }, Math.max(1, controls.deadlineMs - Date.now()));
  options?.abortSignal?.addEventListener('abort', abort, { once: true });
  if (options?.abortSignal?.aborted) abort();
  const underlyingFlash: FlashEvaluator = options?.flashEvaluator ?? (request =>
    session!.evaluate(request) as Promise<Flash>);
  const underlyingInterface: InterfaceEvaluator = options?.interfaceEvaluator ?? (request =>
    interfaceSession!.solve(request));
  const rawEvaluator: FlashEvaluator = (request, timeout) =>
    Promise.race([underlyingFlash(request, timeout), interrupted]);
  const interfaceEvaluator: InterfaceEvaluator = (request, timeout) =>
    Promise.race([underlyingInterface(request, timeout), interrupted]);
  // Both K&H cases share one serial persistent pinned engine. This avoids a
  // process-per-cell import without widening the immutable adapter contract.
  const flashes = new Map<string, Promise<Flash>>();
  const evaluator: FlashEvaluator = (request, timeout) => {
    const key = JSON.stringify(request);
    const cached = flashes.get(key);
    if (cached) return cached;
    // This cache deduplicates only simultaneous requests. Settled local
    // states are removed, so changing countercurrent states cannot be
    // accidentally reused and memory is bounded even in a long count sweep.
    if (flashes.size >= 256) flashes.clear();
    const pending = rawEvaluator(request, timeout);
    flashes.set(key, pending);
    void pending.then(
      () => { if (flashes.get(key) === pending) flashes.delete(key); },
      () => { if (flashes.get(key) === pending) flashes.delete(key); },
    );
    return pending;
  };
  let primary: Awaited<ReturnType<typeof solveCase>>;
  let sensitivity: Awaited<ReturnType<typeof solveCase>>;
  try {
    await options?.onProgress?.({ phase: 'PRIMARY_RUNNING', completedCases: 0, totalCases: 2 });
    primary = await solveCase(input, .0126, evaluator, interfaceEvaluator, controls);
    await options?.onProgress?.({ phase: 'PRIMARY_COMPLETE', completedCases: 1, totalCases: 2 });
    if (diagnostic) {
      const solver = (primary as Awaited<ReturnType<typeof solveCase>> & {
        diagnosticMesh?: MeshSolve;
      }).diagnosticMesh;
      if (!solver) throw new Error('STAGE4_FROZEN_COARSE_DIAGNOSTIC_MESH_MISSING');
      if (diagnostic.strategy === 'RESIDUAL_CONTROLLED_GOOD_BROYDEN') {
        return {
          schema: 'ECR_STAGE4_FROZEN_RESIDUAL_CONTROLLED_WHOLE_COLUMN_DIAGNOSTIC_V1' as const,
          caseCoefficient: .0126 as const,
          physicalCompartments: 5 as const,
          finiteVolumeCellsPerPhysicalCompartment: 2 as const,
          initialization: {
            method: diagnostic.initialTransfer
              ? diagnostic.initialTransferMethod ?? 'EXACT_PRIOR_SOLVE_MESH_TRANSFER_STATE' as const
              : 'EXISTING_ZERO_TRANSFER_DEFAULT' as const,
            suppliedTransferState: !!diagnostic.initialTransfer,
          },
          solver,
        };
      }
      return {
        schema: 'ECR_STAGE4_FROZEN_COARSE_MESH_DIAGNOSTIC_V1' as const,
        caseCoefficient: .0126 as const,
        physicalCompartments: diagnostic.physicalCompartments,
        finiteVolumeCellsPerPhysicalCompartment: 2 as const,
        initialization: {
          method: diagnostic.initialTransfer
            ? diagnostic.initialTransferMethod ?? 'EXACT_PRIOR_SOLVE_MESH_TRANSFER_STATE' as const
            : 'EXISTING_ZERO_TRANSFER_DEFAULT' as const,
          suppliedTransferState: !!diagnostic.initialTransfer,
        },
        solver,
      };
    }
    await options?.onProgress?.({ phase: 'SENSITIVITY_RUNNING', completedCases: 1, totalCases: 2 });
    sensitivity = await solveCase(input, .0105, evaluator, interfaceEvaluator, controls);
    await options?.onProgress?.({ phase: 'SENSITIVITY_COMPLETE', completedCases: 2, totalCases: 2 });
  } finally {
    clearTimeout(deadlineTimer);
    options?.abortSignal?.removeEventListener('abort', abort);
    closeSessions();
  }
  const p = primary.selected, s = sensitivity.selected;
  const comparable = !!p && !!s;
  const heightRelativeDifference = comparable
    ? Math.abs(p.activeHeightM - s.activeHeightM) / Math.max(p.activeHeightM, s.activeHeightM) : null;
  const efficiencyRelativeDifference = comparable
    ? Math.abs(p.overallEfficiency - s.overallEfficiency) / Math.max(p.overallEfficiency, s.overallEfficiency) : null;
  const robust = comparable && p.physicalCompartments === s.physicalCompartments
    && heightRelativeDifference! <= .05 && efficiencyRelativeDifference! <= .05;
  const unresolved = primary.nonconvergedPhysicalCounts.length > 0
    || sensitivity.nonconvergedPhysicalCounts.length > 0;
  return {
    status: comparable ? 'CALCULATED_FINITE_RATE_SCREENING'
      : unresolved ? 'NUMERICAL_FAILURE_UNRESOLVED_PHYSICAL_COUNTS_REMAIN'
        : 'TARGET_FAILURE_NO_TARGET_COMPLIANT_COUNT_WITHIN_BOUND',
    classification: 'PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN',
    screeningNotice: 'PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN',
    implementation: {
      version: STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION,
      implementationHash: STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH,
    },
    primary, sensitivity,
    materiality: {
      threshold: 'same integer physical compartments and <=5% relative active-height and overall-efficiency difference',
      comparable, heightRelativeDifference, efficiencyRelativeDifference,
      robustToKhCoefficientSensitivity: robust,
      classification: robust ? 'ROBUST_WITHIN_DISCLOSED_SCREENING_THRESHOLD'
        : 'NOT_ROBUST_OR_NOT_COMPARABLE',
      note: 'Ec proximity alone is not a robustness criterion.',
    },
    assumptions: [
      'Each K&H case searches upward from accepted Stage-2 Nt and stops at the first certifiable conserved, mesh-qualified target pass or the first numerically unresolved count. An unresolved lower count prevents any higher count from establishing a minimum; remaining budget is reserved for the other coefficient case.',
      'Overall efficiency is calculated after the search as Stage-2 accepted Nt/Nphysical; it is never an input.',
      'Job-B evaluates pinned seven-component chemical potentials/interface stability from each current local countercurrent state. The independently pinned bulk-equilibrium adapter re-evaluates the converged holdup-weighted inventory in every FV cell; no inlet equilibrium partition is retained as a column closure.',
      'This is a finite-rate diagonal generalized-Fick screening closure in a molar-average frame, not a full Maxwell–Stefan model. The zero-sum diffusive frame residual does not erase non-equimolar Stefan/convective phase transfer.',
      'Job A two-film coefficients use frozen Stage-3 hydraulic state and phase-average feed compositions; composition-dependent transport and axial variation require pilot validation.',
      'Stage-4 interface roots use a separately pinned dogbox/Jacobian-scaled numerical strategy; the legacy interface equations, bounds, independent reproduction and physical/stability acceptance gates are unchanged.',
      'Ec uses the authorized screening expression; Ed=0. Two and four finite-volume cells per physical compartment are independently solved; mesh and nonlinear iteration counts are never physical compartment count.',
    ],
  };
}

/**
 * An offline-only entry point for a single exact coarse mesh. It calls the
 * existing solveCase closure and its existing solveMesh implementation; no
 * finite-volume equation, cache, gate, tolerance, or iteration limit is
 * duplicated here. Production callers retain the full two-mesh/two-case route.
 */
export async function runStage4FrozenCoarseDiagnostic(input: Stage4PhysicalSizingInput,
  options?: Omit<Stage4PredictivePhysicalSizingOptions, 'frozenCoarseDiagnostic'> & {
    initialTransfer?: number[][];
    initialTransferMethod?: Stage4FrozenCoarseDiagnosticResult['initialization']['method'];
    onIteration?: (iteration: Stage4FrozenCoarseIteration) => void;
  }): Promise<Stage4FrozenCoarseDiagnosticResult> {
  if (input.calculatedNt !== 5 || input.maximumCompartments !== 5) {
    throw new Error('STAGE4_FROZEN_COARSE_DIAGNOSTIC_REQUIRES_ACCEPTED_NT_AND_FIVE_PHYSICAL_COMPARTMENTS');
  }
  const result = await runStage4PredictivePhysicalSizing(input, {
    ...options,
    frozenCoarseDiagnostic: {
      physicalCompartments: 5,
      initialTransfer: options?.initialTransfer,
      initialTransferMethod: options?.initialTransferMethod,
      onIteration: options?.onIteration,
    },
  });
  if (!('schema' in result) || result.schema !== 'ECR_STAGE4_FROZEN_COARSE_MESH_DIAGNOSTIC_V1') {
    throw new Error('STAGE4_FROZEN_COARSE_DIAGNOSTIC_RESULT_MISSING');
  }
  return result as Stage4FrozenCoarseDiagnosticResult;
}

/**
 * User-authorized, offline-only whole-column nonlinear qualification. This is
 * intentionally a separate opt-in from the frozen Picard reproduction and
 * production count/refinement/sensitivity route. It is fixed to design-269's
 * governed five compartments, two FV cells per compartment, and c=.0126.
 */
export async function runStage4FrozenResidualControlledDiagnostic(input: Stage4PhysicalSizingInput,
  options?: Omit<Stage4PredictivePhysicalSizingOptions, 'frozenCoarseDiagnostic'> & {
    initialTransfer?: number[][];
    initialTransferMethod?: Stage4FrozenResidualControlledDiagnosticResult['initialization']['method'];
    onCandidate?: (candidate: Stage4ResidualControlledCandidate) => void;
  }): Promise<Stage4FrozenResidualControlledDiagnosticResult> {
  if (input.calculatedNt !== 5 || input.maximumCompartments !== 5) {
    throw new Error('STAGE4_FROZEN_RESIDUAL_CONTROLLED_DIAGNOSTIC_REQUIRES_ACCEPTED_NT_AND_FIVE_PHYSICAL_COMPARTMENTS');
  }
  const result = await runStage4PredictivePhysicalSizing(input, {
    ...options,
    frozenCoarseDiagnostic: {
      physicalCompartments: 5,
      initialTransfer: options?.initialTransfer,
      initialTransferMethod: options?.initialTransferMethod,
      strategy: 'RESIDUAL_CONTROLLED_GOOD_BROYDEN',
      onCandidate: options?.onCandidate,
    },
  });
  if (!('schema' in result)
    || result.schema !== 'ECR_STAGE4_FROZEN_RESIDUAL_CONTROLLED_WHOLE_COLUMN_DIAGNOSTIC_V1') {
    throw new Error('STAGE4_FROZEN_RESIDUAL_CONTROLLED_DIAGNOSTIC_RESULT_MISSING');
  }
  return result as Stage4FrozenResidualControlledDiagnosticResult;
}