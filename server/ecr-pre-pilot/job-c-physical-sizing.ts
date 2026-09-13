import {
  runKuhniMassTransfer,
  type HydraulicCandidate,
  type KuhniMassTransferDependencies,
  type KuhniMassTransferInput,
} from './kuhni-mass-transfer';
import {
  resolveKuhniOperatingHoldupV110,
} from './kuhni-geometry-resolver-v110';
import type { HydrodynamicProcessBasis } from './kuhni-hydrodynamics';
import {
  evaluateJobA,
  JOB_A_COMPONENT_ORDER,
  JOB_A_MOLECULAR_DATA,
  type JobAEvaluationInput,
} from './job-a';
import {
  jobCResultHash,
  jobCScientificResultHash,
  runJobCWorker,
  type JobCPhysicalSizingTrial,
  type JobCWorkerRequest,
} from './job-c';

const HASH = /^[a-f0-9]{64}$/;
const FULL_QUALIFICATION = /^QUALIFIED_JOB_C_BOUNDARY_BRANCH_\d+_OF_\d+_REPLAYED$/;

export type JobCPhysicalSizingAdmission = {
  accepted: boolean;
  reasons: string[];
  numericalCells: number | null;
  requiredHeightM: number | null;
  evidence: {
    fullLambda: boolean;
    immutableLineage: boolean;
    exactQualification: boolean;
    independentlyReproducedAndStable: boolean;
    governingGates: boolean;
    workerResultIntegrity: boolean;
    outerResultIntegrity: boolean;
    qualifierResponseIntegrity: boolean;
  };
};

export type PhysicalMechanicalBasis = {
  source: string;
  hash: string;
  status: 'GOVERNED';
  spacingRule: 'STAGE3_FROZEN_COMPARTMENT_HEIGHT_M';
  /**
   * Hardware spacing from an admitted mechanical drawing/specification.  It
   * must not be populated from Job C's FV cell count or Stage-3's hydraulic
   * geometry ratio.
   */
  compartmentHeightM: number;
};

export type PhysicalSizingHydraulicCandidate = {
  candidate: HydraulicCandidate;
  stage3Evidence: {
    columnDiameterM: number;
    rpm: number;
    compartmentHeightM: number;
    d32M: number;
    operatingHoldup: number;
    floodHoldup: number;
  };
};

export type RoundedGeometryRevalidation = {
  d32M: number;
  operatingHoldup: number;
  floodHoldup: number;
  hydraulicCriteriaPassed: boolean;
  provenance: string;
};

export type AcceptedJobCPhysicalSizingInput = {
  jobCResult: Record<string, any>;
  mechanicalBasis: PhysicalMechanicalBasis | null;
  hydraulicCandidates: PhysicalSizingHydraulicCandidate[];
  massTransferInput: Omit<KuhniMassTransferInput, 'hydraulicCandidates'>;
  dependencies: KuhniMassTransferDependencies;
  /**
   * This revalidation is deliberately separate from a historical Stage-3
   * record.  It must be run for the integer, installed physical geometry
   * selected by the coupled calculation.
   */
  revalidateRoundedGeometry: (
    candidate: PhysicalSizingHydraulicCandidate,
    installedHeightM: number,
    physicalCompartments: number,
  ) => RoundedGeometryRevalidation;
};

type FullQualifier = Record<string, any>;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function stableAndReproduced(qualifier: FullQualifier): boolean {
  const thresholds = qualifier?.acceptanceThresholds;
  const evidence = qualifier?.selectedGateEvidence;
  const local = evidence?.localStability;
  const tpd = evidence?.routineTpd;
  const reproductionLimit = thresholds?.independentStartReproductionRelativeTolerance;
  return qualifier?.status === 'QUALIFIED_JOB_C_BOUNDARY_BRANCH'
    && finite(qualifier?.independentReproductionMaximumRelativeDifference)
    && finite(reproductionLimit)
    && qualifier.independentReproductionMaximumRelativeDifference <= reproductionLimit
    && ['continuous', 'dispersed'].every(phase =>
      local?.[phase]?.minimumEigenvalue >= thresholds?.minimumLocalStabilityCurvature
      && local?.[phase]?.stepSizeConverged === true
      && tpd?.[phase]?.minimum >= thresholds?.postInterfaceTpdThreshold
      && tpd?.[phase]?.allRefinementsAccepted === true
      && tpd?.[phase]?.explicitMonoRichBasinSearch?.allRequiredSearchesAccepted === true);
}

function exactQualifierIntegrity(cells: unknown, qualification: unknown): boolean {
  const match = typeof qualification === 'string'
    ? qualification.match(/^QUALIFIED_JOB_C_BOUNDARY_BRANCH_(\d+)_OF_(\d+)_REPLAYED$/)
    : null;
  if (!match || !Array.isArray(cells) || !cells.length
    || Number(match[1]) !== cells.length || Number(match[2]) !== cells.length) return false;
  const ordinals = cells.map((cell: any) => cell?.numericalCell);
  if (!ordinals.every((ordinal: unknown) => Number.isInteger(ordinal) && ordinal >= 1)
    || new Set(ordinals).size !== cells.length
    || !ordinals.every((ordinal: number) => ordinal <= cells.length)) return false;
  return cells.every((cell: any) => {
    const full = cell?.exactBoundaryQualifier?.fullResponse;
    const recorded = cell?.exactBoundaryQualifier?.fullResponseSha256;
    const qualifierContent = full && typeof full === 'object'
      ? Object.fromEntries(Object.entries(full).filter(([key]) => key !== 'resultHash'))
      : null;
    return cell?.exactBoundaryQualifier?.status === 'QUALIFIED_JOB_C_BOUNDARY_BRANCH'
      && HASH.test(recorded ?? '')
      && full?.resultHash === recorded
      && jobCScientificResultHash(qualifierContent) === recorded;
  });
}

/**
 * This is intentionally a strict admission gate rather than a best-effort
 * parser.  A partial-lambda/workflow result can never be converted into a
 * physical design merely because it happens to contain finite cell data.
 */
export function assessAcceptedJobCForPhysicalSizing(
  jobCResult: Record<string, any>,
): JobCPhysicalSizingAdmission {
  const worker = jobCResult?.workerResult ?? jobCResult;
  const selected = worker?.sensitivityCases?.[0]?.selected;
  const dependencies = jobCResult?.dependencies;
  const cells = selected?.numericalCells;
  const residuals = selected?.residualDiagnostics;
  const qualification = selected?.exactQualificationStatus;
  const reasons: string[] = [];

  const fullLambda = jobCResult?.status === 'CALCULATED_PRELIMINARY_JOB_C'
    && worker?.status === 'CALCULATED_PRELIMINARY_JOB_C'
    && worker?.diagnosticOnly !== true
    && worker?.workflowTestOnly !== true
    && selected?.outletDuty?.lambda === 1;
  if (!fullLambda) reasons.push('JOB_C_FULL_LAMBDA_ACCEPTED_RESULT_REQUIRED');

  const immutableLineage = [
    worker?.resultSha256,
    dependencies?.stage1SnapshotHash,
    dependencies?.jobAResultSha256,
    dependencies?.jobBResultSha256,
    dependencies?.stage3ImmutableHash,
    dependencies?.stage2EngineHash,
    dependencies?.jobBInterfaceArtifactSha256,
    dependencies?.jobBInterfaceWorkerSha256,
    dependencies?.jobCBoundaryInterfaceQualifierSha256,
    dependencies?.jobCBranchContinuationSha256,
  ].every(value => typeof value === 'string' && HASH.test(value));
  if (!immutableLineage) reasons.push('JOB_C_OWNED_IMMUTABLE_LINEAGE_REQUIRED');

  const workerResultIntegrity = typeof worker?.resultSha256 === 'string'
    && HASH.test(worker.resultSha256)
    && jobCScientificResultHash(worker) === worker.resultSha256;
  if (!workerResultIntegrity) reasons.push('JOB_C_WORKER_SCIENTIFIC_RESULT_INTEGRITY_REQUIRED');
  const outerResultIntegrity = worker === jobCResult
    ? true
    // A physical revalidation is a direct worker response. Its signed,
    // service-owned source outer result was verified before this operation.
    : !Object.prototype.hasOwnProperty.call(jobCResult ?? {}, 'resultSha256')
      ? true
    : typeof jobCResult?.resultSha256 === 'string'
      && HASH.test(jobCResult.resultSha256)
      && jobCResultHash(jobCResult) === jobCResult.resultSha256;
  if (!outerResultIntegrity) reasons.push('JOB_C_OUTER_RESULT_INTEGRITY_REQUIRED');

  const qualifierResponseIntegrity = exactQualifierIntegrity(cells, qualification);
  const exactQualification = typeof qualification === 'string'
    && FULL_QUALIFICATION.test(qualification)
    && Array.isArray(cells)
    && cells.length > 0
    && residuals?.exactQualifiedCellCount === cells.length
    && qualifierResponseIntegrity;
  if (!exactQualification) reasons.push('JOB_C_FULL_TRANSFER_EXACT_CELL_QUALIFICATION_REQUIRED');

  const independentlyReproducedAndStable = Array.isArray(cells) && cells.length > 0
    && cells.every((cell: any) => stableAndReproduced(
      cell?.exactBoundaryQualifier?.fullResponse,
    ));
  if (!independentlyReproducedAndStable) {
    reasons.push('JOB_C_INDEPENDENT_REPRODUCTION_AND_STABILITY_REQUIRED');
  }

  const governingGates = finite(residuals?.maximumExactCellResidualMolS)
    && finite(residuals?.maximumExactScaledCellResidual)
    && finite(residuals?.maximumExactGlobalBalanceResidualMolS)
    && finite(residuals?.minimumLocalComponentFlowMolS)
    && residuals.maximumExactCellResidualMolS <= 1e-7
    && residuals.maximumExactScaledCellResidual <= 1e-7
    && residuals.maximumExactGlobalBalanceResidualMolS <= 1e-7
    && residuals.minimumLocalComponentFlowMolS > 0
    && finite(selected?.recoveryPctNmpFreeRrboHydrocarbonMassBasis)
    && finite(selected?.outletDuty?.productDuty?.targetRecoveryPct)
    && selected.recoveryPctNmpFreeRrboHydrocarbonMassBasis
      >= selected.outletDuty.productDuty.targetRecoveryPct;
  if (!governingGates) reasons.push('JOB_C_GOVERNING_DUTY_OR_RESIDUAL_GATES_REQUIRED');

  return {
    accepted: reasons.length === 0,
    reasons,
    numericalCells: Array.isArray(cells) ? cells.length : null,
    requiredHeightM: finite(selected?.heightM) ? selected.heightM : null,
    evidence: {
      fullLambda,
      immutableLineage,
      exactQualification,
      independentlyReproducedAndStable,
      governingGates,
      workerResultIntegrity,
      outerResultIntegrity,
      qualifierResponseIntegrity,
    },
  };
}

function validateMechanicalBasis(basis: PhysicalMechanicalBasis | null) {
  if (!basis || basis.status !== 'GOVERNED' || !basis.source
    || !HASH.test(basis.hash)
    || basis.spacingRule !== 'STAGE3_FROZEN_COMPARTMENT_HEIGHT_M'
    || !finite(basis.compartmentHeightM) || basis.compartmentHeightM <= 0) {
    throw new Error('JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:SUPPORTED_MECHANICAL_SPACING_BASIS_REQUIRED');
  }
}

function validateOwnedSizingLineage(input: AcceptedJobCPhysicalSizingInput) {
  const dependencies = input.jobCResult.dependencies;
  const lineage = input.massTransferInput.lineage;
  if (lineage.stage1SnapshotHash !== dependencies.stage1SnapshotHash
    || lineage.stage3.immutableHash !== dependencies.stage3ImmutableHash
    || lineage.stage2.engineHash !== dependencies.stage2EngineHash
    || lineage.hardwareGeometry.hash !== input.mechanicalBasis?.hash) {
    throw new Error('JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:OWNED_IMMUTABLE_LINEAGE_MISMATCH');
  }
  for (const item of input.hydraulicCandidates) {
    const { candidate, stage3Evidence } = item;
    if (candidate.trialImmutableHash !== dependencies.stage3ImmutableHash
      || candidate.columnDiameterM !== stage3Evidence.columnDiameterM
      || candidate.rpm !== stage3Evidence.rpm
      || candidate.compartmentHeightM !== stage3Evidence.compartmentHeightM
      || !finite(stage3Evidence.d32M) || !(stage3Evidence.d32M > 0)
      || !finite(stage3Evidence.operatingHoldup) || !(stage3Evidence.operatingHoldup > 0)
      || !finite(stage3Evidence.floodHoldup)
      || !(stage3Evidence.floodHoldup > stage3Evidence.operatingHoldup)) {
      throw new Error('JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:STAGE3_HYDRAULIC_CANDIDATE_LINEAGE_INVALID');
    }
  }
}

/**
 * Uses the existing Stage-3 operating-holdup closure for the final integer
 * geometry check.  It does not substitute flood holdup: a missing stable
 * operating root remains a failed hydraulic revalidation.
 */
export function stage3RoundedGeometryRevalidator(
  processBasis: HydrodynamicProcessBasis,
) {
  return (
    candidate: PhysicalSizingHydraulicCandidate,
    _installedHeightM: number,
    _physicalCompartments: number,
  ): RoundedGeometryRevalidation => {
    const result = resolveKuhniOperatingHoldupV110({
      processBasis,
      columnDiameterM: candidate.candidate.columnDiameterM,
      rpm: candidate.candidate.rpm,
    });
    if (result.status !== 'OPERATING_HOLDUP_CALCULATED') {
      throw new Error('JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:ROUNDED_GEOMETRY_HYDRAULIC_ROOT_UNAVAILABLE');
    }
    return {
      d32M: candidate.stage3Evidence.d32M,
      operatingHoldup: result.operatingHoldup,
      floodHoldup: result.floodHoldup,
      hydraulicCriteriaPassed: result.operatingHoldup < result.floodHoldup,
      provenance: 'STAGE3_V110_OPERATING_HOLDUP_RECALCULATED_FOR_INSTALLED_INTEGER_GEOMETRY',
    };
  };
}

/**
 * Performs only a post-acceptance sizing calculation.  It never invokes,
 * queues, resumes, or repeats Job C.  The supplied transport closures are
 * the existing reusable physical solver boundary; callers without an admitted
 * closure must report that dependency instead of fitting an efficiency.
 */
export function sizeAcceptedJobCPhysicalKuhniColumn(
  input: AcceptedJobCPhysicalSizingInput,
) {
  const admission = assessAcceptedJobCForPhysicalSizing(input.jobCResult);
  if (!admission.accepted) {
    return {
      status: 'DEPENDENCY_BLOCKED' as const,
      classification: 'PRELIMINARY_CLASSIFICATION_PRESERVED_NOT_RELEASE_ELIGIBLE' as const,
      admission,
      reasons: admission.reasons,
    };
  }
  validateMechanicalBasis(input.mechanicalBasis);
  if (!Array.isArray(input.hydraulicCandidates) || !input.hydraulicCandidates.length) {
    throw new Error('JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:HYDRAULIC_CANDIDATES_REQUIRED');
  }
  validateOwnedSizingLineage(input);

  const byOrdinal = new Map(input.hydraulicCandidates.map(item => [
    item.candidate.ordinal, item,
  ]));
  const solved = runKuhniMassTransfer({
    ...input.massTransferInput,
    hydraulicCandidates: input.hydraulicCandidates.map(item => item.candidate),
  }, input.dependencies);
  if (!solved.selectedDesign) {
    return {
      status: 'NO_PHYSICAL_SIZING_SOLUTION' as const,
      classification: 'PRELIMINARY_CLASSIFICATION_PRESERVED_NOT_RELEASE_ELIGIBLE' as const,
      admission,
      transport: solved,
      reasons: solved.candidateEvaluations.map(item => item.reason ?? item.status),
    };
  }

  const roundedTrials = solved.feasibleEnvelope.flatMap(design => {
    const candidate = byOrdinal.get(design.ordinal);
    if (!candidate) {
      throw new Error('JOB_C_PHYSICAL_SIZING_INTERNAL_CANDIDATE_LINEAGE_MISMATCH');
    }
    try {
      const rounded = input.revalidateRoundedGeometry(
        candidate, design.activeHeightM, design.physicalCompartments,
      );
      const passed = finite(rounded.d32M) && rounded.d32M > 0
        && finite(rounded.operatingHoldup) && rounded.operatingHoldup > 0
        && rounded.operatingHoldup < 1
        && finite(rounded.floodHoldup) && rounded.floodHoldup > rounded.operatingHoldup
        && rounded.hydraulicCriteriaPassed === true;
      return passed ? [{ design, candidate, rounded }] : [];
    } catch {
      return [];
    }
  }).sort((left, right) => {
    const same = (a: number, b: number) =>
      Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
    return !same(left.design.activeVolumeM3, right.design.activeVolumeM3)
      ? left.design.activeVolumeM3 - right.design.activeVolumeM3
      : !same(left.design.shaftPowerW, right.design.shaftPowerW)
        ? left.design.shaftPowerW - right.design.shaftPowerW
        : left.design.rpm - right.design.rpm
          || left.design.ordinal - right.design.ordinal;
  });
  const selected = roundedTrials[0];
  if (!selected) {
    return {
      status: 'NO_PHYSICAL_SIZING_SOLUTION' as const,
      classification: 'PRELIMINARY_CLASSIFICATION_PRESERVED_NOT_RELEASE_ELIGIBLE' as const,
      admission,
      transport: solved,
      reasons: ['ROUNDED_PHYSICAL_GEOMETRY_REVALIDATION_FAILED'],
    };
  }
  const { design, candidate: selectedCandidate, rounded } = selected;
  const numericalCompartments = admission.numericalCells;
  return {
    status: 'CALCULATED_PRELIMINARY_PHYSICAL_KUHNI_SIZING' as const,
    classification: 'PRE_PILOT_PREDICTIVE_NOT_VENDOR_GUARANTEED_NOT_RELEASE_ELIGIBLE' as const,
    admission,
    mechanicalBasis: input.mechanicalBasis,
    requiredHeightM: admission.requiredHeightM,
    installedHeightM: design.activeHeightM,
    physicalCompartments: design.physicalCompartments,
    numericalCompartments,
    compartmentMapping: {
      physicalFrom: 'SUPPORTED_STAGE3_MECHANICAL_SPACING_BASIS',
      numericalFrom: 'JOB_C_NUMERICAL_FV_DISCRETIZATION_ONLY',
      efficiencyBasis: 'DEPENDENCY_BLOCKED:ADMITTED_PHYSICAL_COMPARTMENT_EFFICIENCY_MODEL_REQUIRED',
      overallEfficiency: null,
      hetsM: null,
    },
    finalGeometry: {
      rpm: design.rpm,
      diameterM: selectedCandidate.candidate.columnDiameterM,
      d32M: rounded.d32M,
      operatingHoldup: rounded.operatingHoldup,
      floodHoldup: rounded.floodHoldup,
      provenance: rounded.provenance,
      roundedGeometryRevalidated: true,
    },
    trialEvidence: solved.candidateEvaluations,
    transport: solved,
  };
}

/**
 * The real transport revalidation adapter is available below.  This summary
 * intentionally remains blocked until a distinct governed mechanical spacing
 * basis is present; it never treats Stage-3 hydraulic ratios or Job-C FV cells
 * as a hardware drawing.
 */
export function summarizeJobCPhysicalSizingDependency(
  jobCResult: Record<string, any>,
) {
  const admission = assessAcceptedJobCForPhysicalSizing(jobCResult);
  return {
    status: admission.accepted ? 'DEPENDENCY_BLOCKED' : 'UNACCEPTED_JOB_C_RESULT',
    classification: 'PRELIMINARY_CLASSIFICATION_PRESERVED_NOT_RELEASE_ELIGIBLE',
    admission,
    requiredHeightM: admission.requiredHeightM,
    installedHeightM: null,
    numericalCompartments: admission.numericalCells,
    trialEvidence: jobCResult?.physicalSizingCandidateAuthority ?? null,
    requiredDependencies: admission.accepted
      ? ['SUPPORTED_PHYSICAL_MECHANICAL_COMPARTMENT_SPACING_BASIS'] : [],
    reason: admission.accepted
      ? 'JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:SUPPORTED_MECHANICAL_SPACING_BASIS_REQUIRED'
      : 'JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:FULL_LAMBDA_ACCEPTED_JOB_C_REQUIRED',
    physicalCompartments: null,
    efficiency: null,
    finalOperatingRpm: null,
    finalColumnDiameterM: null,
  };
}

export type AcceptedJobCWorkerPhysicalSizingInput = {
  /** The immutable completed Job-C response, never a mutable UI payload. */
  jobCResult: Record<string, any>;
  /** The service-owned completed queue record containing that exact response. */
  completedQueueJob: {
    status: 'completed';
    result: Record<string, any>;
    resultHash: string;
    input: { prepared?: { workerRequest?: JobCWorkerRequest } };
  };
  /** The exact immutable request persisted with that completed Job-C result. */
  workerRequest: JobCWorkerRequest;
  mechanicalBasis: PhysicalMechanicalBasis | null;
  processBasis: HydrodynamicProcessBasis;
  hydraulicCandidates: PhysicalSizingHydraulicCandidate[];
};

/**
 * The immutable Job-A input preserved with the completed Job-C request.  The
 * adapter replaces only the Stage-3-dependent state (trial, d32 and slip) for
 * each candidate, then invokes the established Job-A implementation to obtain
 * that candidate's films.
 */
export type PinnedJobAFilmRecalculationBasis = Omit<
  JobAEvaluationInput,
  'd32M' | 'slipVelocityMS' | 'selectedTrialId' | 'selectedTrialOrdinal'
> & {
  sourceJobAResultSha256: string;
};

type WorkerTransport = (
  request: JobCWorkerRequest,
  options: { operation: 'SOLVE_HEIGHT' | 'REVALIDATE_PHYSICAL_TRIAL' },
) => Promise<Record<string, any>>;

let testWorkerTransport: WorkerTransport | null = null;
type CalculatedOperatingHydraulics = Extract<
  ReturnType<typeof resolveKuhniOperatingHoldupV110>,
  { status: 'OPERATING_HOLDUP_CALCULATED' }
> & { d32M: number };

/**
 * Test-only process seam. Production always invokes runJobCWorker directly;
 * callers cannot provide a transport closure through the sizing input.
 */
export function setJobCPhysicalSizingWorkerTransportForTest(
  transport: WorkerTransport | null,
) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JOB_C_PHYSICAL_SIZING_TEST_TRANSPORT_PROHIBITED_IN_PRODUCTION');
  }
  const previous = testWorkerTransport;
  testWorkerTransport = transport;
  return () => { testWorkerTransport = previous; };
}

const sameNumber = (left: number, right: number) =>
  Math.abs(left - right) <= 1e-12 * Math.max(1, Math.abs(left), Math.abs(right));

function jobAMoleFractions(weights: readonly number[]) {
  const moles = weights.map((weight, index) =>
    weight / JOB_A_MOLECULAR_DATA[JOB_A_COMPONENT_ORDER[index]].molecularWeightGmol);
  const total = moles.reduce((sum, value) => sum + value, 0);
  if (!(total > 0) || moles.some(value => !finite(value) || value < 0)) {
    throw new Error('JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:PINNED_PROCESS_BASIS_COMPOSITION_INVALID');
  }
  return moles.map(value => value / total);
}

function sameVector(left: unknown, right: readonly number[]) {
  return Array.isArray(left) && left.length === right.length
    && left.every((value, index) => finite(value) && sameNumber(value, right[index]));
}

/**
 * Recalculate the films rather than carrying the source Job-C kc/kd into a
 * candidate with a different d32, holdup, diameter, or RPM. The phase
 * compositions and properties are checked against the pinned Stage-1 process
 * basis before calling Job A, so this is not a caller-supplied correlation
 * basis.
 */
function recomputeCandidateJobAFilms(
  input: AcceptedJobCWorkerPhysicalSizingInput,
  item: PhysicalSizingHydraulicCandidate,
  hydraulic: CalculatedOperatingHydraulics,
) {
  const basis = (input.workerRequest as JobCWorkerRequest & {
    jobAFilmRecalculationBasis?: PinnedJobAFilmRecalculationBasis;
  }).jobAFilmRecalculationBasis;
  const dependencies = input.jobCResult.dependencies;
  const process = input.processBasis;
  if (!basis || !HASH.test(basis.sourceJobAResultSha256)
    || basis.sourceJobAResultSha256 !== dependencies?.jobAResultSha256
    || basis.stage1SnapshotHash !== dependencies?.stage1SnapshotHash
    || basis.stage1SnapshotHash !== process?.stage1SnapshotHash
    || basis.stage2EngineHash !== dependencies?.stage2EngineHash
    || basis.stage3ImmutableHash !== dependencies?.stage3ImmutableHash
    || !HASH.test(basis.thermodynamicAdapterPreflightHash)
    || !HASH.test(basis.stage3ImplementationHash)
    || !basis.stage3RunId
    || !Number.isInteger(basis.theoreticalStages) || basis.theoreticalStages < 1
    || !['STAGE_2_CALCULATED_NT', 'PRE_PILOT_DESIGN_DEFAULT']
      .includes(basis.theoreticalStageProvenance)
    || (basis.theoreticalStageProvenance === 'STAGE_2_CALCULATED_NT'
      && (!basis.stage2JobId || !HASH.test(basis.stage2ResultHash ?? '')))
    || (basis.theoreticalStageProvenance === 'PRE_PILOT_DESIGN_DEFAULT'
      && basis.stage2ResultHash !== null)) {
    throw new Error('JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:PINNED_JOB_A_FILM_BASIS_REQUIRED');
  }
  if (basis.temperatureK !== process.temperatureK
    || basis.interfacialTensionNM !== process.interfacialTensionNM
    || basis.stage1SnapshotHash !== process.stage1SnapshotHash
    || basis.stage3ImmutableHash !== dependencies.stage3ImmutableHash) {
    throw new Error('JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:PINNED_JOB_A_FILM_PROCESS_BASIS_MISMATCH');
  }
  const rrboFractions = jobAMoleFractions([
    process.composition.rrboFeedWt.saturates,
    process.composition.rrboFeedWt.monoAromatics,
    process.composition.rrboFeedWt.diAromatics,
    process.composition.rrboFeedWt.polyAromatics,
    process.composition.rrboFeedWt.polarAromatics,
    process.composition.rrboFeedWt.nmp,
    0,
  ]);
  const solventFractions = jobAMoleFractions([
    0, 0, 0, 0, 0,
    process.composition.wetSolventWt.nmp,
    process.composition.wetSolventWt.water,
  ]);
  const nmpContinuous = process.phaseConfiguration === 'nmp-continuous-rrbo-dispersed';
  const expectedContinuous = nmpContinuous ? process.wetSolventPhase : process.rrboFeed;
  const expectedDispersed = nmpContinuous ? process.rrboFeed : process.wetSolventPhase;
  const expectedContinuousFractions = nmpContinuous ? solventFractions : rrboFractions;
  const expectedDispersedFractions = nmpContinuous ? rrboFractions : solventFractions;
  if (basis.continuous.densityKgM3 !== expectedContinuous.densityKgM3
    || basis.continuous.dynamicViscosityPaS !== expectedContinuous.dynamicViscosityPaS
    || basis.dispersed.densityKgM3 !== expectedDispersed.densityKgM3
    || basis.dispersed.dynamicViscosityPaS !== expectedDispersed.dynamicViscosityPaS
    || !sameVector(basis.continuous.moleFractions, expectedContinuousFractions)
    || !sameVector(basis.dispersed.moleFractions, expectedDispersedFractions)) {
    throw new Error('JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:PINNED_JOB_A_FILM_PROCESS_BASIS_MISMATCH');
  }
  const areaM2 = Math.PI * item.candidate.columnDiameterM ** 2 / 4;
  const slipVelocityMS = expectedDispersed.flowM3S / areaM2 / hydraulic.operatingHoldup
    + expectedContinuous.flowM3S / areaM2 / (1 - hydraulic.operatingHoldup);
  const jobA = evaluateJobA({
    ...basis,
    selectedTrialId: item.candidate.trialId,
    selectedTrialOrdinal: item.candidate.ordinal,
    d32M: hydraulic.d32M,
    slipVelocityMS,
  });
  const coefficients = (phase: 'continuous' | 'dispersed') => JOB_A_COMPONENT_ORDER.map(
    componentId => {
      const cell = jobA.cells.find(entry =>
        entry.componentId === componentId && entry.phase === phase);
      if (!cell || !finite(cell.filmCoefficientMS) || !(cell.filmCoefficientMS > 0)) {
        throw new Error(`JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:RECALCULATED_JOB_A_FILM_INVALID:${phase}:${componentId}`);
      }
      return cell.filmCoefficientMS;
    },
  );
  return { kc: coefficients('continuous'), kd: coefficients('dispersed'), jobA, slipVelocityMS };
}

function candidateWorkerRequest(
  workerRequest: JobCWorkerRequest,
  item: PhysicalSizingHydraulicCandidate,
  hydraulic: CalculatedOperatingHydraulics,
  films: { kc: number[]; kd: number[] },
): JobCWorkerRequest {
  const branch = {
    ...workerRequest.boundaryBranchQualificationRequest,
    kc: films.kc,
    kd: films.kd,
  };
  const { sourceStateSha256: _ignored, ...branchSource } = branch;
  return {
    ...workerRequest,
    columnDiameterM: item.candidate.columnDiameterM,
    rpm: item.candidate.rpm,
    operatingHoldup: hydraulic.operatingHoldup,
    d32M: hydraulic.d32M,
    kc: films.kc,
    kd: films.kd,
    boundaryBranchQualificationRequest: {
      ...branchSource,
      sourceStateSha256: jobCResultHash(branchSource),
    },
  };
}

function physicalTrialCandidateMatches(
  workerResult: Record<string, any>,
  trial: JobCPhysicalSizingTrial,
): boolean {
  const selected = workerResult?.sensitivityCases?.[0]?.selected;
  const observed = selected?.physicalSizingTrial;
  return workerResult?.status === 'CALCULATED_PRELIMINARY_JOB_C'
    && workerResult?.physicalSizingRevalidation?.status
      === 'RECALCULATED_FULL_LAMBDA_TRANSPORT'
    && observed?.transportRecomputed === true
    && observed?.physicalCompartmentsAreNotNumericalCells === true
    && selected?.heightM === trial.installedHeightM
    && selected?.profileSolvedHeightM === trial.installedHeightM
    && observed?.installedHeightM === trial.installedHeightM
    && observed?.physicalCompartments === trial.physicalCompartments
    && observed?.candidateOrdinal === trial.candidateOrdinal
    && observed?.mechanicalBasisHash === trial.mechanicalBasisHash
    && observed?.stage3ImmutableHash === trial.stage3ImmutableHash
    && workerResult?.physicalSizingRevalidation?.physicalSizingTrial?.sourceJobCResultSha256
      === trial.sourceJobCResultSha256
    && workerResult?.physicalSizingRevalidation?.physicalSizingTrial?.sourceWorkerResultSha256
      === trial.sourceWorkerResultSha256;
}

/**
 * Re-evaluates each candidate at its integer installed hardware height with
 * the real Job-C worker. The seven Job-C FV cells remain a numerical mesh;
 * physical compartments come only from the governed mechanical spacing basis.
 *
 * This function does not enqueue, resume, or repeat Job C. It invokes the
 * worker's isolated REVALIDATE_PHYSICAL_TRIAL operation only after a caller
 * has supplied an accepted, immutable Job-C result.
 */
export async function sizeAcceptedJobCWithWorkerTransport(
  input: AcceptedJobCWorkerPhysicalSizingInput,
) {
  const admission = assessAcceptedJobCForPhysicalSizing(input.jobCResult);
  const blocked = (reason: string, extra: Record<string, unknown> = {}) => ({
    status: 'DEPENDENCY_BLOCKED' as const,
    classification: 'PRELIMINARY_CLASSIFICATION_PRESERVED_NOT_RELEASE_ELIGIBLE' as const,
    admission,
    reasons: [reason],
    ...extra,
  });
  if (!admission.accepted) {
    return blocked('FULL_LAMBDA_ACCEPTED_JOB_C_REQUIRED', {
      reasons: admission.reasons,
    });
  }
  const queue = input.completedQueueJob;
  if (queue?.status !== 'completed'
    || !HASH.test(queue?.resultHash ?? '')
    || jobCResultHash(queue?.result) !== jobCResultHash(input.jobCResult)
    || jobCScientificResultHash(queue?.result) !== queue?.resultHash
    || jobCResultHash(queue?.input?.prepared?.workerRequest)
      !== jobCResultHash(input.workerRequest)) {
    return blocked('SERVICE_OWNED_COMPLETED_JOB_C_QUEUE_LINEAGE_REQUIRED');
  }
  try {
    validateMechanicalBasis(input.mechanicalBasis);
  } catch (error) {
    return blocked(error instanceof Error ? error.message : 'SUPPORTED_MECHANICAL_SPACING_BASIS_REQUIRED');
  }
  if (!input.hydraulicCandidates.length || !admission.requiredHeightM) {
    return blocked('HYDRAULIC_CANDIDATES_AND_ACCEPTED_HEIGHT_REQUIRED');
  }
  const dependencies = input.jobCResult.dependencies;
  const requestHash = dependencies?.workerRequestSha256;
  if (!HASH.test(requestHash ?? '') || requestHash !== jobCResultHash(input.workerRequest)) {
    return blocked('OWNED_IMMUTABLE_WORKER_REQUEST_LINEAGE_REQUIRED');
  }
  try {
    validateOwnedSizingLineage({
      jobCResult: input.jobCResult,
      mechanicalBasis: input.mechanicalBasis,
      hydraulicCandidates: input.hydraulicCandidates,
      // These are not used by validateOwnedSizingLineage; preserve its one
      // immutable-lineage implementation rather than duplicating the checks.
      massTransferInput: {
        lineage: {
          stage1SnapshotHash: dependencies.stage1SnapshotHash,
          stage2: {
            modelId: 'JOB_C_WORKER_TRANSPORT',
            modelHash: dependencies.stage2EngineHash,
            engineId: 'JOB_C_WORKER_TRANSPORT',
            engineHash: dependencies.stage2EngineHash,
            equilibriumId: 'JOB_B_INTERFACE',
            equilibriumHash: dependencies.jobBInterfaceWorkerSha256,
          },
          stage3: { runId: 'IMMUTABLE_STAGE3', version: '1.1.0', immutableHash: dependencies.stage3ImmutableHash },
          propertyPackageHash: dependencies.jobBResultSha256,
          evidencePackageHash: dependencies.jobCBoundaryInterfaceQualifierSha256,
          hardwareGeometry: {
            source: input.mechanicalBasis.source,
            hash: input.mechanicalBasis.hash,
            status: input.mechanicalBasis.status,
          },
        },
      } as Omit<KuhniMassTransferInput, 'hydraulicCandidates'>,
      dependencies: {} as KuhniMassTransferDependencies,
      revalidateRoundedGeometry: () => {
        throw new Error('NOT_USED');
      },
    });
  } catch (error) {
    return blocked(error instanceof Error ? error.message : 'OWNED_IMMUTABLE_LINEAGE_MISMATCH');
  }

  const sourceWorker = input.jobCResult.workerResult ?? input.jobCResult;
  if (!HASH.test(sourceWorker?.resultSha256 ?? '')) {
    return blocked('OWNED_IMMUTABLE_WORKER_RESULT_REQUIRED');
  }
  // This is deliberately not injectable through the production input: accepted
  // physical sizing invokes the isolated worker operation. The module seam is
  // only enabled by an explicit test helper and is prohibited in production.
  const execute = (request: JobCWorkerRequest, operation: 'SOLVE_HEIGHT' | 'REVALIDATE_PHYSICAL_TRIAL') =>
    testWorkerTransport
      ? testWorkerTransport(request, { operation })
      : runJobCWorker(request, { operation });
  const trialEvidence: Array<Record<string, unknown>> = [];
  const feasible: Array<{
    item: PhysicalSizingHydraulicCandidate;
    hydraulic: CalculatedOperatingHydraulics;
    requiredHeightM: number;
    physicalCompartments: number;
    installedHeightM: number;
    response: Record<string, any>;
    selected: Record<string, any>;
  }> = [];
  for (const item of [...input.hydraulicCandidates].sort((left, right) =>
    left.candidate.ordinal - right.candidate.ordinal)) {
    const spacingMismatch = Math.abs(
      item.candidate.compartmentHeightM - input.mechanicalBasis.compartmentHeightM,
    ) > 1e-12 * Math.max(1, item.candidate.compartmentHeightM,
      input.mechanicalBasis.compartmentHeightM);
    if (spacingMismatch) {
      trialEvidence.push({
        ordinal: item.candidate.ordinal,
        status: 'MECHANICAL_SPACING_HYDRAULIC_GEOMETRY_MISMATCH',
        reason: 'MECHANICAL_BASIS_SPACING_DOES_NOT_MATCH_FROZEN_STAGE3_GEOMETRY;_COMPLETE_GEOMETRY_HYDRAULIC_RECOMPUTATION_REQUIRED',
      });
      continue;
    }
    const hydraulic = resolveKuhniOperatingHoldupV110({
      processBasis: input.processBasis,
      columnDiameterM: item.candidate.columnDiameterM,
      rpm: item.candidate.rpm,
    });
    if (hydraulic.status !== 'OPERATING_HOLDUP_CALCULATED') {
      trialEvidence.push({
        ordinal: item.candidate.ordinal,
        status: 'HYDRAULICALLY_INFEASIBLE',
        reason: hydraulic.reason,
      });
      continue;
    }
    let trial: JobCPhysicalSizingTrial | undefined;
    try {
      const films = recomputeCandidateJobAFilms(input, item, hydraulic);
      const candidateRequest = candidateWorkerRequest(input.workerRequest, item, hydraulic, films);
      // The source accepted height belongs to its original Stage-3 transport
      // state. Search this candidate's full Job-C transport first, then map
      // that candidate requirement to the admitted integer hardware spacing.
      const searched = await execute(candidateRequest, 'SOLVE_HEIGHT');
      const searchedResult = {
        status: searched.status,
        workerResult: searched,
        dependencies,
      };
      const searchAdmission = assessAcceptedJobCForPhysicalSizing(searchedResult);
      const requiredHeightM = searched?.sensitivityCases?.[0]?.selected?.heightM;
      if (!searchAdmission.accepted || !finite(requiredHeightM) || !(requiredHeightM > 0)) {
        trialEvidence.push({
          ordinal: item.candidate.ordinal,
          status: 'TRANSPORT_HEIGHT_SEARCH_REJECTED',
          reasons: searchAdmission.reasons,
        });
        continue;
      }
      const physicalCompartments = Math.ceil(
        requiredHeightM / input.mechanicalBasis.compartmentHeightM,
      );
      const installedHeightM = physicalCompartments * input.mechanicalBasis.compartmentHeightM;
      trial = {
        sourceJobCResultSha256: jobCResultHash(input.jobCResult),
        sourceWorkerResultSha256: sourceWorker.resultSha256,
        mechanicalBasisHash: input.mechanicalBasis.hash,
        stage3ImmutableHash: dependencies.stage3ImmutableHash,
        installedHeightM,
        physicalCompartments,
        candidateOrdinal: item.candidate.ordinal,
      };
      const response = await execute({
        ...candidateRequest,
        physicalSizingTrial: trial,
      }, 'REVALIDATE_PHYSICAL_TRIAL');
      const revalidated = {
        status: response.status,
        workerResult: response,
        dependencies,
      };
      const trialAdmission = assessAcceptedJobCForPhysicalSizing(revalidated);
      if (!physicalTrialCandidateMatches(response, trial) || !trialAdmission.accepted) {
        trialEvidence.push({
          ordinal: item.candidate.ordinal,
          status: 'TRANSPORT_REVALIDATION_REJECTED',
          reasons: trialAdmission.reasons,
          physicalTrial: trial,
        });
        continue;
      }
      const selected = response.sensitivityCases[0].selected;
      trialEvidence.push({
        ordinal: item.candidate.ordinal,
        status: 'FEASIBLE',
        physicalTrial: trial,
        requiredHeightM,
        recalculatedJobAResultSha256: films.jobA.resultSha256,
        recalculatedSlipVelocityMS: films.slipVelocityMS,
        workerResultSha256: response.resultSha256,
      });
      feasible.push({
        item, hydraulic, requiredHeightM, physicalCompartments, installedHeightM, response, selected,
      });
    } catch (error) {
      trialEvidence.push({
        ordinal: item.candidate.ordinal,
        status: 'TRANSPORT_REVALIDATION_FAILED',
        reason: error instanceof Error ? error.message : 'UNKNOWN_WORKER_FAILURE',
        ...(trial ? { physicalTrial: trial } : {}),
      });
    }
  }
  const selectedFeasible = feasible.sort((left, right) => {
    const volume = (entry: typeof left) =>
      Math.PI * entry.item.candidate.columnDiameterM ** 2 / 4 * entry.installedHeightM;
    const power = (entry: typeof left) =>
      volume(entry) * entry.item.candidate.powerVolumeWM3;
    const same = (a: number, b: number) =>
      Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
    return !same(volume(left), volume(right)) ? volume(left) - volume(right)
      : !same(power(left), power(right)) ? power(left) - power(right)
        : left.item.candidate.rpm - right.item.candidate.rpm
          || left.item.candidate.ordinal - right.item.candidate.ordinal;
  })[0];
  if (selectedFeasible) {
    const {
      item, hydraulic, requiredHeightM, physicalCompartments, installedHeightM, response, selected,
    } =
      selectedFeasible;
    return {
      status: 'CALCULATED_PRELIMINARY_PHYSICAL_KUHNI_SIZING' as const,
      classification: 'PRE_PILOT_PREDICTIVE_NOT_VENDOR_GUARANTEED_NOT_RELEASE_ELIGIBLE' as const,
      admission,
      mechanicalBasis: input.mechanicalBasis,
      requiredHeightM,
      installedHeightM,
      physicalCompartments,
      numericalCompartments: admission.numericalCells,
      compartmentMapping: {
        physicalFrom: 'GOVERNED_MECHANICAL_COMPARTMENT_SPACING_BASIS',
        numericalFrom: 'JOB_C_NUMERICAL_FV_DISCRETIZATION_ONLY',
        efficiencyBasis: 'DEPENDENCY_BLOCKED:ADMITTED_PHYSICAL_COMPARTMENT_EFFICIENCY_MODEL_REQUIRED',
        overallEfficiency: null,
        hetsM: null,
      },
      finalGeometry: {
        rpm: item.candidate.rpm,
        diameterM: item.candidate.columnDiameterM,
        d32M: hydraulic.d32M,
        operatingHoldup: hydraulic.operatingHoldup,
        floodHoldup: hydraulic.floodHoldup,
        provenance: 'STAGE3_V110_RECALCULATED_AND_FULL_JOB_C_TRANSPORT_REVALIDATED',
        roundedGeometryRevalidated: true,
      },
      transportRevalidation: response,
      trialEvidence,
      recoveryPctNmpFreeRrboHydrocarbonMassBasis:
        selected.recoveryPctNmpFreeRrboHydrocarbonMassBasis,
    };
  }
  return {
    status: 'NO_PHYSICAL_SIZING_SOLUTION' as const,
    classification: 'PRELIMINARY_CLASSIFICATION_PRESERVED_NOT_RELEASE_ELIGIBLE' as const,
    admission,
    reasons: ['NO_CANDIDATE_PASSED_FULL_JOB_C_TRANSPORT_AND_HYDRAULIC_REVALIDATION'],
    trialEvidence,
  };
}