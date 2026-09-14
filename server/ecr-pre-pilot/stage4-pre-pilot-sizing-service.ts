import { pool } from '../db';
import { randomUUID } from 'node:crypto';
import { kuhniRunHash } from './kuhni-hydrodynamics';
import { makeStage1HydrodynamicProcessBasis, validateStage1Snapshot } from './stage1';
import { buildStage4MixingAudit } from './stage4-mixing-audit';
import {
  runStage4PredictivePhysicalSizing,
  STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH,
  STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION,
  type Stage4PhysicalSizingInput,
  type Stage4PhysicalSizingProgress,
} from './stage4-predictive-physical-sizing';
import {
  loadValidatedCompletedSevenComponentNtForStage4,
} from './predictive-nt-job-service';

const FINITE = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const USABLE_STAGE2_STATUSES = new Set([
  'COMPLETED_GOVERNED_SEQUENCE',
  'COMPLETED_DIAGNOSTIC_SEQUENCE',
  'COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX',
]);

export type Stage4EfficiencyContext = {
  calculatedNt: number;
  stage2JobId: string;
  stage2ResultHash: string;
  stage3RunId: number | string;
  stage3ImmutableHash: string;
  diameterM: number;
  rpm: number;
  d32M: number;
  operatingHoldup: number;
  floodHoldup: number;
};

/**
 * This is the only allowed extension point for Stage-4 efficiency.  A closure
 * must consume the supported mass-transfer and axial-mixing state and identify
 * its immutable implementation.  A manual Eo/HETS value has no path here.
 */
export type SupportedOverallEfficiencyClosure = {
  implementationId: string;
  version: string;
  implementationHash: string;
  calculate(context: Stage4EfficiencyContext): number;
};

// No such closure has been admitted.  Do not replace this with a numerical
// estimate: the live projection must remain null until an approved closure is
// registered with its mass-transfer/axial-mixing lineage.
const registeredOverallEfficiencyClosure: SupportedOverallEfficiencyClosure | null = null;

function fail(code: string): never {
  throw new Error(code);
}

function closureResult(
  context: Stage4EfficiencyContext,
  closure = registeredOverallEfficiencyClosure,
) {
  if (!closure) {
    return {
      value: null,
      status: 'DEPENDENCY_BLOCKED' as const,
      dependency:
        'MASS_TRANSFER_AND_AXIAL_MIXING_OVERALL_EFFICIENCY_CLOSURE_REQUIRED',
      closure: null,
    };
  }
  const value = closure.calculate(context);
  if (!FINITE(value) || value <= 0 || value > 1) {
    fail('STAGE4_SUPPORTED_OVERALL_EFFICIENCY_CLOSURE_RETURNED_INVALID_VALUE');
  }
  return {
    value,
    status: 'CALCULATED_FROM_SUPPORTED_TRANSFER_MIXING_CLOSURE' as const,
    dependency: null,
    closure: {
      implementationId: closure.implementationId,
      version: closure.version,
      implementationHash: closure.implementationHash,
    },
  };
}

type Stage3Projection = {
  id: number | string;
  immutableHash: string;
  stage1SnapshotHash?: string;
  result: Record<string, any>;
};

export function deriveStage4PrePilotSizing(input: {
  calculatedNt: number;
  stage2JobId: string;
  stage2ResultHash: string;
  stage3: Stage3Projection;
  overallEfficiencyClosure?: SupportedOverallEfficiencyClosure | null;
}) {
  if (!Number.isInteger(input.calculatedNt) || input.calculatedNt <= 0) {
    fail('STAGE4_VALID_CALCULATED_STAGE2_NT_REQUIRED_NO_DEFAULT_APPLIED');
  }
  const authority = input.stage3.result.theoreticalStagesUsed;
  if (authority?.provenance !== 'STAGE_2_CALCULATED_NT'
    || authority?.stage2JobId !== input.stage2JobId
    || authority?.stage2ResultHash !== input.stage2ResultHash
    || authority?.value !== input.calculatedNt) {
    fail('STAGE4_STAGE3_STALE_OR_NOT_SAME_LINEAGE_WITH_CALCULATED_STAGE2_NT');
  }

  // This point is selected by the persisted Stage-3 resolver.  Stage 4 never
  // re-runs a candidate search and therefore cannot silently choose another D.
  const selected = input.stage3.result.hydraulicDiagnosticPoint;
  const trial = Array.isArray(input.stage3.result.hydraulicRpmEnvelope)
    ? input.stage3.result.hydraulicRpmEnvelope.find((candidate: any) =>
      candidate?.rpm === selected?.rpm
      && candidate?.columnDiameterM === selected?.columnDiameterM)
    : null;
  const operating = trial?.operatingHydraulics;
  if (!selected || selected.status !== 'CALCULATED_IN_RANGE'
    || !FINITE(selected.columnDiameterM) || selected.columnDiameterM <= 0
    || !FINITE(selected.rpm) || selected.rpm <= 0
    || !FINITE(selected.d32M) || selected.d32M <= 0
    || !operating || operating.status !== 'OPERATING_HOLDUP_CALCULATED'
    || !FINITE(operating.operatingHoldup) || !FINITE(operating.floodHoldup)
    || !(operating.operatingHoldup > 0 && operating.operatingHoldup < operating.floodHoldup)) {
    fail('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  }

  const hydraulics = {
    diameterM: selected.columnDiameterM,
    rpm: selected.rpm,
    d32M: selected.d32M,
    operatingHoldup: operating.operatingHoldup,
    floodHoldup: operating.floodHoldup,
    holdupMargin: operating.floodHoldup - operating.operatingHoldup,
    source: 'PERSISTED_STAGE3_HYDRAULIC_DIAGNOSTIC_POINT_NO_STAGE4_RESELECTION',
    stage3RunId: input.stage3.id,
    stage3ImmutableHash: input.stage3.immutableHash,
  };
  const context: Stage4EfficiencyContext = {
    calculatedNt: input.calculatedNt,
    stage2JobId: input.stage2JobId,
    stage2ResultHash: input.stage2ResultHash,
    stage3RunId: input.stage3.id,
    stage3ImmutableHash: input.stage3.immutableHash,
    ...hydraulics,
  };
  const mixingAudit = buildStage4MixingAudit({
    selected,
    operating,
    processBasis: input.stage3.result.processBasis,
  });
  // A supplied extension cannot bypass missing correlation/geometry evidence.
  const overallEfficiency = closureResult(context,
    mixingAudit.blockers.length ? null : input.overallEfficiencyClosure);
  if (overallEfficiency.value === null && mixingAudit.blockers.length) {
    overallEfficiency.dependency = mixingAudit.blockers[0].code;
  }
  const pitchM = 0.5 * hydraulics.diameterM;
  const physicalCompartments = overallEfficiency.value === null
    ? null
    : Math.ceil(input.calculatedNt / overallEfficiency.value);
  const activeHeightM = physicalCompartments === null ? null : physicalCompartments * pitchM;

  return {
    status: overallEfficiency.value === null
      ? 'DEPENDENCY_BLOCKED'
      : 'CALCULATED_PRE_PILOT_PREDICTIVE_NOT_FINAL_DESIGN',
    classification: 'PRE_PILOT_PREDICTIVE_NOT_FINAL_DESIGN_NOT_RELEASE_ELIGIBLE',
    mainOutputs: {
      diameterM: hydraulics.diameterM,
      overallEfficiency: overallEfficiency.value,
      physicalCompartments,
      activeHeightM,
    },
    calculatedNt: {
      value: input.calculatedNt,
      provenance: 'STAGE_2_CALCULATED_NT_SAME_LINEAGE',
      stage2JobId: input.stage2JobId,
      stage2ResultHash: input.stage2ResultHash,
    },
    selectedStage3Hydraulics: hydraulics,
    mixingAudit,
    overallEfficiency,
    physicalGeometry: {
      pitchM,
      pitchAssumption:
        'PRE_PILOT_GEOMETRY_ASSUMPTION: physical compartment pitch = 0.5 × persisted Stage-3 column diameter',
      equations: [
        'pitch = 0.5 × D',
        'physicalCompartments = required integer count from conserved physical transfer-model search (not yet calculated)',
        'overallEfficiency = valid calculated Stage-2 NT / solved physical compartment count',
        'activeHeight = physicalCompartments × pitch',
      ],
      units: {
        diameterM: 'm',
        overallEfficiency: 'fraction',
        physicalCompartments: 'count',
        activeHeightM: 'm',
      },
    },
    jobAProvenance: {
      status: 'NOT_AVAILABLE_FROM_PERSISTED_STAGE3_RECORD',
      reason: 'Job A is not persisted as a reusable provenance artifact; Stage 4 does not launch it.',
    },
    assumptions: [
      'Stage 4 carries the persisted Stage-3 selected hydraulic point forward and does not recalculate or reselect hydraulic candidates.',
      'No manual or assumed overall efficiency, HETS, FV-cell count, Job A/B/C launch, lambda=1 continuation, or full transfer-acceptance calculation is used in this path.',
      'Physical count must be determined by a conserved transfer-model search; efficiency is reported afterward. Source/geometry blockers are listed explicitly in the mixing audit.',
    ],
  };
}

const STAGE4_SCREENING_NOTICE =
  'PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN';

export type Stage4PrePilotSizingAuthority = {
  projection: ReturnType<typeof deriveStage4PrePilotSizing>;
  solverInput: Stage4PhysicalSizingInput;
  lineageHash: string;
};

type StoredStage4Calculation = {
  status: 'RUNNING' | 'INTERRUPTED' | 'CALCULATED' | 'TARGET_FAILURE' | 'NUMERICAL_FAILURE';
  result_snapshot: any;
  progress_snapshot: Record<string, unknown> | null;
  error_code: string | null;
  attempt_token: string;
  started_at: string;
  deadline_at: string;
  completed_at: string | null;
};

type PreviousStage4Calculation = {
  status: StoredStage4Calculation['status'];
  error_code: string | null;
  progress_snapshot: Record<string, unknown> | null;
  completed_at: string | null;
};

const localInflight = new Map<string, {
  task: Promise<void>;
  abort: AbortController;
  attemptToken: string;
}>();
function assertJsonFinite(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    fail('STAGE4_FINITE_RATE_SOLVER_NONFINITE_RESULT');
  }
  if (Array.isArray(value)) value.forEach(assertJsonFinite);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertJsonFinite);
}

function stage1Targets(stage1: ReturnType<typeof validateStage1Snapshot>) {
  const source = stage1.stage1;
  return {
    minimumRecoveryPct: source.minimumRecoveryPct,
    minimumRaffinateSaturatesWt: source.minimumRaffinateSaturatesWt,
    targetRaffinateTotalAromaticsWt: source.targetRaffinateTotalAromaticsWt,
    targetRaffinatePolarAromaticsWt: source.targetRaffinatePolarAromaticsWt,
    maximumNmpRaffinateWt: source.maximumNmpRaffinateWt,
    feedSulfurPpm: source.feedSulfurPpm,
    targetRaffinateSulfurPpm: source.targetRaffinateSulfurPpm,
    sulfurAllocationSatPct: source.sulfurAllocationSatPct,
    sulfurAllocationMonoPct: source.sulfurAllocationMonoPct,
    sulfurAllocationDiPct: source.sulfurAllocationDiPct,
    sulfurAllocationPolyPct: source.sulfurAllocationPolyPct,
    sulfurAllocationPaPct: source.sulfurAllocationPaPct,
  };
}

/**
 * The one authority/input builder for Stage 4.  It reads (and never mutates)
 * the governed Stage-1/2/3 records, so the worker and GET use identical
 * owner-scoped lineage.
 */
export async function loadStage4PrePilotSizingAuthority(
  userId: number,
  designId: number,
): Promise<Stage4PrePilotSizingAuthority> {
  const design = await pool.query<{ input_data: unknown }>(
    'SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2',
    [designId, userId],
  );
  if (!design.rows[0]) fail('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const stage1 = validateStage1Snapshot(design.rows[0].input_data);
  const stage2Rows = await pool.query<{ id: string; engine_hash: string; result_snapshot: any }>(
    `SELECT id::text,engine_hash,result_snapshot FROM ecr_pre_pilot_predictive_nt_jobs
      WHERE design_id=$1 AND created_by=$2 AND status='completed'
        AND result_snapshot IS NOT NULL
        AND result_snapshot->>'status' IS DISTINCT FROM 'ENGINE_ERROR'
        AND result_snapshot#>>'{stage1TargetGovernance,stage1SnapshotHash}'=$3
      ORDER BY created_at DESC,id DESC`,
    [designId, userId, stage1.immutableHash],
  );
  const stage2 = stage2Rows.rows.find((row) => {
    const result = row.result_snapshot;
    const nt = result?.establishedTheoreticalStages ?? result?.predictiveNt;
    return USABLE_STAGE2_STATUSES.has(String(result?.executionStatus ?? ''))
      && Number.isInteger(nt) && nt > 0;
  });
  if (!stage2) fail('STAGE4_VALID_CALCULATED_STAGE2_NT_REQUIRED_NO_DEFAULT_APPLIED');
  const nt = stage2.result_snapshot.establishedTheoreticalStages
    ?? stage2.result_snapshot.predictiveNt;
  // Re-establish the unique accepted Stage-2 result through the server-owned
  // validator.  The loose status query above is only a discovery query and is
  // never the scientific authority for Stage 4.
  const trustedStage2 = await loadValidatedCompletedSevenComponentNtForStage4(
    stage2.id, userId, designId,
  );
  if (trustedStage2.jobId !== stage2.id || trustedStage2.theoreticalStages !== nt
    || trustedStage2.engineHash !== stage2.engine_hash) {
    fail('STAGE4_STAGE2_TRUSTED_AUTHORITY_MISMATCH');
  }
  const stage2ResultHash = kuhniRunHash(stage2.result_snapshot);
  // Read the immutable persisted Stage-3 record directly.  The normal
  // resolver-reader performs a numerical replay for its own verification;
  // that would be a prohibited fresh hydraulic candidate calculation here.
  const stage3Rows = await pool.query<{
    id: string; immutable_hash: string; stage1_snapshot_hash: string;
    stage2_job_id: string | null; stage2_result_hash: string | null;
    parent_hydrodynamic_run_id: string | null; parent_hydrodynamic_run_hash: string | null;
    process_basis: unknown; theoretical_stage_authority: unknown; result_snapshot: Record<string, any>;
  }>(
    `SELECT id::text,immutable_hash,stage1_snapshot_hash,stage2_job_id::text,stage2_result_hash,
            parent_hydrodynamic_run_id::text,parent_hydrodynamic_run_hash,process_basis,
            theoretical_stage_authority,result_snapshot
       FROM ecr_pre_pilot_kuhni_geometry_resolver_runs
      WHERE design_id=$1 AND created_by=$2
      ORDER BY created_at DESC,id DESC LIMIT 1`,
    [designId, userId],
  );
  const row = stage3Rows.rows[0];
  if (!row) fail('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  const replayedHash = kuhniRunHash({
    basis: row.process_basis,
    theoreticalStages: row.theoretical_stage_authority,
    parentHydrodynamicRun: row.parent_hydrodynamic_run_id
      ? { id: row.parent_hydrodynamic_run_id, immutable_hash: row.parent_hydrodynamic_run_hash }
      : null,
    result: row.result_snapshot,
  });
  const stage3: Stage3Projection = {
    id: row.id,
    immutableHash: row.immutable_hash,
    stage1SnapshotHash: row.stage1_snapshot_hash,
    result: row.result_snapshot,
  };
  if (replayedHash !== stage3.immutableHash
    || stage3.stage1SnapshotHash !== stage1.immutableHash
    || stage3.result?.processBasis?.stage1SnapshotHash !== stage1.immutableHash
    || row.stage2_job_id !== stage2.id
    || row.stage2_result_hash !== stage2ResultHash) {
    fail('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  }
  const projection = deriveStage4PrePilotSizing({
    calculatedNt: nt,
    stage2JobId: stage2.id,
    stage2ResultHash,
    stage3,
  });
  const selected = stage3.result.hydraulicDiagnosticPoint;
  const operating = stage3.result.hydraulicRpmEnvelope.find((candidate: any) =>
    candidate?.rpm === selected?.rpm
    && candidate?.columnDiameterM === selected?.columnDiameterM)?.operatingHydraulics;
  if (!FINITE(selected.rotorDiameterM) || selected.rotorDiameterM <= 0
    || !FINITE(operating?.continuousSuperficialVelocityMS)
    || !FINITE(operating?.dispersedSuperficialVelocityMS)
    || !/^[a-f0-9]{64}$/.test(String(stage2.engine_hash))
    || !/^[a-f0-9]{64}$/.test(String(stage3.result?.engine?.implementationHash ?? ''))) {
    fail('STAGE4_PINNED_TRANSFER_AND_MIXING_LINEAGE_INPUT_REQUIRED');
  }
  const persistedBasis = stage3.result.processBasis;
  const expectedStage1Basis = makeStage1HydrodynamicProcessBasis(stage1);
  if (!persistedBasis || typeof persistedBasis !== 'object'
    || (persistedBasis as any).stage1SnapshotHash !== expectedStage1Basis.stage1SnapshotHash) {
    fail('STAGE4_PERSISTED_STAGE3_PROCESS_BASIS_REQUIRED');
  }
  const envelope = Array.isArray(stage3.result.hydraulicRpmEnvelope)
    ? stage3.result.hydraulicRpmEnvelope : [];
  const selectedTrialOrdinal = envelope.findIndex((candidate: any) =>
    candidate?.rpm === selected?.rpm
    && candidate?.columnDiameterM === selected?.columnDiameterM);
  if (selectedTrialOrdinal < 0) fail('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  const targets = stage1Targets(stage1);
  const solverInput: Stage4PhysicalSizingInput = {
    calculatedNt: nt,
    stage1SnapshotHash: stage1.immutableHash,
    stage2JobId: stage2.id,
    stage2ResultHash,
    stage2EngineHash: stage2.engine_hash,
    stage3RunId: stage3.id,
    stage3ImmutableHash: stage3.immutableHash,
    stage3ImplementationHash: stage3.result.engine.implementationHash,
    selectedTrialId: `rpm:${selected.rpm}:diameterM:${selected.columnDiameterM}`,
    selectedTrialOrdinal,
    processBasis: persistedBasis as Stage4PhysicalSizingInput['processBasis'],
    hydraulics: {
      diameterM: selected.columnDiameterM, rotorDiameterM: selected.rotorDiameterM,
      rpm: selected.rpm, d32M: selected.d32M, operatingHoldup: operating.operatingHoldup,
      continuousSuperficialVelocityMS: operating.continuousSuperficialVelocityMS,
      dispersedSuperficialVelocityMS: operating.dispersedSuperficialVelocityMS,
    },
    stage1Targets: targets,
    maximumCompartments: 80,
  };
  const lineageHash = kuhniRunHash({
    owner: { userId, designId },
    stage1SnapshotHash: solverInput.stage1SnapshotHash,
    stage2: { jobId: solverInput.stage2JobId, resultHash: solverInput.stage2ResultHash,
      engineHash: solverInput.stage2EngineHash, theoreticalStages: solverInput.calculatedNt },
    stage3: { runId: String(solverInput.stage3RunId), immutableHash: solverInput.stage3ImmutableHash,
      implementationHash: solverInput.stage3ImplementationHash, selectedTrialId: solverInput.selectedTrialId,
      selectedTrialOrdinal: solverInput.selectedTrialOrdinal },
    processBasis: solverInput.processBasis,
    targets,
    implementation: { version: STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION,
      implementationHash: STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH },
  });
  return { projection, solverInput, lineageHash };
}

function idlePhysicalSizing(status: 'UNRUN' | 'RUNNING' | 'INTERRUPTED' | 'NUMERICAL_FAILURE', errorCode?: string | null) {
  const termination = status === 'UNRUN' ? 'NOT_RUN_EXPLICIT_CALCULATION_REQUIRED'
    : status === 'RUNNING' ? 'FINITE_RATE_SOLVER_RUNNING'
      : status === 'INTERRUPTED' ? 'FINITE_RATE_SOLVER_INTERRUPTED_EXPLICIT_RETRY_REQUIRED'
      : 'FINITE_RATE_SOLVER_NUMERICAL_FAILURE';
  const caseResult = {
    selected: null,
    searchTermination: termination,
    attemptedPhysicalCompartments: [],
    nonconvergedPhysicalCounts: [],
    lastConservedPhysicalTrial: null,
  };
  return {
    status,
    classification: STAGE4_SCREENING_NOTICE,
    screeningNotice: STAGE4_SCREENING_NOTICE,
    implementation: {
      version: STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION,
      implementationHash: STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH,
    },
    primary: caseResult,
    sensitivity: { ...caseResult },
    blockers: [],
    materiality: {
      threshold: 'same integer physical compartments and <=5% relative active-height and overall-efficiency difference',
      comparable: false,
      heightRelativeDifference: null,
      efficiencyRelativeDifference: null,
      robustToKhCoefficientSensitivity: false,
      classification: 'NOT_COMPARABLE_PHYSICAL_SOLVES_NOT_AVAILABLE',
      note: 'Ec proximity alone is not a robustness criterion.',
    },
    ...(errorCode ? { errorCode } : {}),
  };
}

function stage4Response(
  authority: Stage4PrePilotSizingAuthority,
  calculation: StoredStage4Calculation | null,
  previousCalculation?: PreviousStage4Calculation | null,
) {
  const state = calculation?.status ?? 'UNRUN';
  // A numerical solver can return valuable counted trial/mesh diagnostics
  // before it establishes that no unknown counts remain. Preserve that
  // validated evidence, but never turn any selected values into outputs
  // unless the terminal calculation itself is CALCULATED.
  const physicalSizing = calculation?.result_snapshot
    && (calculation.status === 'CALCULATED'
      || calculation.status === 'TARGET_FAILURE'
      || calculation.status === 'NUMERICAL_FAILURE')
    ? calculation.result_snapshot
    : idlePhysicalSizing(state === 'RUNNING' ? 'RUNNING'
      : state === 'INTERRUPTED' ? 'INTERRUPTED'
      : state === 'NUMERICAL_FAILURE' ? 'NUMERICAL_FAILURE' : 'UNRUN',
    calculation?.error_code);
  const primary = calculation?.status === 'CALCULATED'
    ? physicalSizing?.primary?.selected ?? null : null;
  const storedProgress = calculation?.progress_snapshot ?? {};
  const terminalProgress = state === 'NUMERICAL_FAILURE' || state === 'INTERRUPTED'
    ? {
      ...storedProgress,
      phase: 'FAILED',
      completedCases: storedProgress.completedCases ?? 0,
      totalCases: storedProgress.totalCases ?? 2,
    }
    : state === 'CALCULATED' || state === 'TARGET_FAILURE'
      ? {
        ...storedProgress,
        phase: 'COMPLETE',
        completedCases: storedProgress.completedCases ?? 2,
        totalCases: storedProgress.totalCases ?? 2,
      }
      : null;
  return {
    ...authority.projection,
    status: state,
    classification: STAGE4_SCREENING_NOTICE,
    screeningNotice: STAGE4_SCREENING_NOTICE,
    mainOutputs: {
      diameterM: authority.solverInput.hydraulics.diameterM,
      overallEfficiency: primary?.overallEfficiency ?? null,
      physicalCompartments: primary?.physicalCompartments ?? null,
      activeHeightM: primary?.activeHeightM ?? null,
    },
    overallEfficiency: {
      value: primary?.overallEfficiency ?? null,
      status: primary
        ? 'CALCULATED_FROM_CONSERVED_TRANSFER_AND_AXIAL_DISPERSION_SCREENING'
        : state === 'TARGET_FAILURE' ? 'NO_TARGET_COMPLIANT_PHYSICAL_SOLUTION'
        : state === 'RUNNING' ? 'FINITE_RATE_SCREENING_RUNNING'
          : state === 'NUMERICAL_FAILURE' ? 'FINITE_RATE_SCREENING_NUMERICAL_FAILURE'
            : state === 'INTERRUPTED' ? 'FINITE_RATE_SCREENING_INTERRUPTED_EXPLICIT_RETRY_REQUIRED'
            : 'NOT_RUN_EXPLICIT_CALCULATION_REQUIRED',
      dependency: primary ? null : physicalSizing.primary?.searchTermination,
      closure: {
        implementationId: 'STAGE4_DIAGONAL_FINITE_RATE_SCREENING',
        version: STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION,
        implementationHash: STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH,
      },
    },
    mixingAudit: {
      ...authority.projection.mixingAudit,
      transferSolution: {
        status: primary ? 'CALCULATED_CONSERVED_AXIAL_DISPERSION_SCREENING' : state,
        detail: primary
          ? 'A rate-based seven-component, two-film, conserved counter-current physical-compartment search was run from the persisted Stage-3 point. No Stage-2 outlet was relabelled as a physical-column outlet.'
          : state === 'RUNNING'
            ? 'The bounded finite-rate physical-compartment search is running from the persisted Stage-3 point.'
            : 'No finite-rate physical-compartment search has been delivered for the current immutable lineage.',
        physicalSizingStatus: state,
      },
    },
    physicalSizing,
    physicalGeometry: {
      ...authority.projection.physicalGeometry,
      equations: [
        'pitch = 0.5 × D',
        'physicalCompartments = first target-compliant integer count from conserved physical transfer-model search',
        'overallEfficiency = valid calculated Stage-2 NT / solved physical compartment count',
        'activeHeight = physicalCompartments × pitch',
      ],
    },
    calculation: {
      status: state,
      progress: state === 'RUNNING'
        ? { ...storedProgress, phase: storedProgress.phase ?? 'QUEUED',
          completedCases: storedProgress.completedCases ?? 0,
          totalCases: storedProgress.totalCases ?? 2,
          maximumPhysicalCompartments: authority.solverInput.maximumCompartments }
        : state === 'INTERRUPTED'
          ? { ...terminalProgress, phase: 'FAILED',
            maximumPhysicalCompartments: authority.solverInput.maximumCompartments }
        : state === 'UNRUN'
          ? { phase: 'NOT_RUN_EXPLICIT_CALCULATION_REQUIRED', completedCases: 0, totalCases: 2,
            maximumPhysicalCompartments: authority.solverInput.maximumCompartments }
          : { ...terminalProgress,
            maximumPhysicalCompartments: authority.solverInput.maximumCompartments },
      lineageHash: authority.lineageHash,
      startedAt: calculation?.started_at ?? null,
      completedAt: calculation?.completed_at ?? null,
      errorCode: calculation?.error_code ?? null,
    },
    ...(previousCalculation ? {
      previousCalculation: {
        status: previousCalculation.status,
        errorCode: previousCalculation.error_code,
        completedAt: previousCalculation.completed_at,
        progress: previousCalculation.progress_snapshot,
        historical: true as const,
      },
    } : {}),
    assumptions: physicalSizing.assumptions ?? authority.projection.assumptions,
  };
}

function expired(calculation: StoredStage4Calculation) {
  return calculation.status === 'RUNNING'
    && new Date(calculation.deadline_at).getTime() <= Date.now();
}

function startLocalFiniteRateRun(
  authority: Stage4PrePilotSizingAuthority,
  userId: number,
  designId: number,
  attemptToken: string,
  initialProgress: Record<string, unknown> | null = null,
) {
  const update = (sql: string, params: unknown[]) => pool.query(sql, params);
  const abort = new AbortController();
  /**
   * Numerical progress callbacks are emitted from the solver while the
   * phase callbacks are awaited by the solver.  Keep one ordered write chain
   * anyway: a slow database write must never let an older mesh event replace a
   * newer count outcome (or let the initial QUEUED phase replace
   * PRIMARY_RUNNING).  The in-memory snapshot is updated before enqueueing
   * each write, so every queued write has the complete state accumulated up to
   * that event.
   */
  const minimumPhysicalCount = authority.solverInput.calculatedNt;
  const maximumPhysicalCount = authority.solverInput.maximumCompartments ?? 80;
  const totalPhysicalTrials = maximumPhysicalCount - minimumPhysicalCount + 1;
  const savedPhysicalTrialProgress = initialProgress?.physicalTrialProgress
    && typeof initialProgress.physicalTrialProgress === 'object'
    && !Array.isArray(initialProgress.physicalTrialProgress)
    ? initialProgress.physicalTrialProgress as Record<string, unknown>
    : {};
  const initialCaseProgress = (
    caseCoefficient: Stage4PhysicalSizingProgress['caseCoefficient'],
  ) => {
    const key = caseCoefficient === .0126 ? 'primary' : 'sensitivity';
    const saved = savedPhysicalTrialProgress[key]
      && typeof savedPhysicalTrialProgress[key] === 'object'
      && !Array.isArray(savedPhysicalTrialProgress[key])
      ? savedPhysicalTrialProgress[key] as Record<string, unknown>
      : {};
    return {
      caseCoefficient,
      completedPhysicalTrials: 0,
      resolvedPhysicalTrials: 0,
      unresolvedPhysicalTrials: 0,
      lastCompletedPhysicalCount: null,
      minimumPhysicalCount,
      maximumPhysicalCount,
      totalPhysicalTrials,
      partialPhysicalCountOutcomes: [],
      ...saved,
    };
  };
  let persistedProgress: Record<string, unknown> = {
    ...(initialProgress ?? {}),
    phase: initialProgress?.phase ?? 'QUEUED',
    completedCases: initialProgress?.completedCases ?? 0,
    totalCases: initialProgress?.totalCases ?? 2,
    maximumPhysicalCompartments: authority.solverInput.maximumCompartments,
    physicalTrialProgress: {
      primary: initialCaseProgress(.0126),
      sensitivity: initialCaseProgress(.0105),
    },
  };
  /**
   * Progress is split into two lanes. Mesh/phase transitions are awaited so
   * their persisted ordering remains part of the lifecycle contract.
   * Per-cell telemetry is advisory: retain only its latest snapshot while a
   * database write is in flight, and never charge the solver for that write.
   */
  let progressWrite: Promise<unknown> = Promise.resolve();
  let advisorySnapshot: Record<string, unknown> | null = null;
  let telemetrySequence = 0;
  let supersededTelemetrySequence = 0;
  let advisoryDrain: Promise<void> | null = null;
  const writeSnapshot = (snapshot: Record<string, unknown>) => {
    const write = progressWrite.then(() => update(
      `UPDATE ecr_pre_pilot_stage4_physical_sizing_calculations
          SET progress_snapshot=$5
        WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3
          AND attempt_token=$4 AND status='RUNNING'`,
      [userId, designId, authority.lineageHash, attemptToken, snapshot],
    ));
    // Keep the ordered lane usable after an advisory failure.  The returned
    // promise still rejects for awaited mesh/phase writes.
    progressWrite = write.catch(() => undefined);
    return write;
  };
  const enqueueProgress = (next: Record<string, unknown>) => {
    persistedProgress = next;
    supersededTelemetrySequence = telemetrySequence;
    advisorySnapshot = null;
    return writeSnapshot(next).catch(error => {
      console.error('STAGE4_PROGRESS_PERSISTENCE_FAILED', error);
      throw error;
    });
  };
  const startAdvisoryDrain = () => {
    if (advisoryDrain || !advisorySnapshot) return;
    advisoryDrain = (async () => {
      // Let synchronous bursts of cell checkpoints collapse to one snapshot
      // before opening a database write.
      await Promise.resolve();
      while (advisorySnapshot) {
        const snapshot = advisorySnapshot;
        const sequence = telemetrySequence;
        advisorySnapshot = null;
        // A later awaited mesh/phase snapshot already contains the latest
        // in-memory diagnostic fields. Do not let a captured older telemetry
        // object overwrite it after the ordered write completes.
        if (sequence <= supersededTelemetrySequence) continue;
        try {
          await writeSnapshot(snapshot);
        } catch (error) {
          console.error('STAGE4_TELEMETRY_PERSISTENCE_FAILED', error);
        }
        await Promise.resolve();
      }
    })()
      .catch(error => {
        console.error('STAGE4_TELEMETRY_PERSISTENCE_FAILED', error);
      })
      .finally(() => {
        advisoryDrain = null;
        if (advisorySnapshot) startAdvisoryDrain();
      });
    // Advisory work must never become an unhandled rejection and is not
    // returned to the solver's awaited callback.
    void advisoryDrain;
  };
  const enqueueTelemetry = (next: Record<string, unknown>) => {
    persistedProgress = next;
    telemetrySequence += 1;
    advisorySnapshot = next;
    startAdvisoryDrain();
  };
  const flushProgress = async () => {
    // A telemetry callback may have queued a replacement while the previous
    // snapshot was being written.  Drain until both the coalescing slot and
    // ordered write lane are empty.
    while (advisoryDrain || advisorySnapshot) {
      if (advisoryDrain) await advisoryDrain;
      else startAdvisoryDrain();
    }
    await progressWrite;
  };
  const phaseProgress = (progress: {
    phase: 'PRIMARY_RUNNING' | 'PRIMARY_COMPLETE' | 'SENSITIVITY_RUNNING' | 'SENSITIVITY_COMPLETE';
    completedCases: 0 | 1 | 2;
    totalCases: 2;
  }) => enqueueProgress({
    ...persistedProgress,
    ...progress,
  });
  const numericalProgress = (progress: Stage4PhysicalSizingProgress) => {
    const key = progress.caseCoefficient === .0126 ? 'primary' : 'sensitivity';
    const map = persistedProgress.physicalTrialProgress
      && typeof persistedProgress.physicalTrialProgress === 'object'
      ? persistedProgress.physicalTrialProgress as Record<string, unknown>
      : {};
    const previousCase = map[key] && typeof map[key] === 'object'
      ? map[key] as Record<string, unknown>
      : {};
    const mesh = progress.finiteVolumeCellsPerPhysicalCompartment === 2
      ? 'coarse'
      : progress.finiteVolumeCellsPerPhysicalCompartment === 4 ? 'refined' : null;
    const caseProgress: Record<string, unknown> = {
      ...previousCase,
      ...progress,
      phase: persistedProgress.phase,
      completedCases: persistedProgress.completedCases,
      totalCases: persistedProgress.totalCases,
      ...(mesh ? { [mesh]: progress } : {}),
    };
    const physicalTrialProgress = { ...map, [key]: caseProgress };
    // Keep the case map as the durable source of truth, while retaining the
    // latest event's fields at the snapshot root for existing consumers.
    const next = {
      ...persistedProgress,
      ...progress,
      physicalTrialProgress,
    };
    if (progress.telemetry) {
      enqueueTelemetry(next);
      return;
    }
    return enqueueProgress(next);
  };
  const task = (async () => {
    try {
      const result = await runStage4PredictivePhysicalSizing(authority.solverInput, {
        // A direct verified inlet flash takes ~79 s on the pinned runtime;
        // 30 s was an invalid operational cap, not a solver convergence gate.
        // Each request is still capped and additionally receives only the
        // remaining whole-solve budget.
        timeoutMs: 120_000,
        // This is a whole-solve cap, not a per-child timeout. It remains
        // inside the persisted ten-minute lease so the solver can return
        // counted numerical failures and cleanly close both worker sessions.
        wallClockBudgetMs: 9 * 60_000,
        abortSignal: abort.signal,
        onProgress: phaseProgress,
        onNumericalProgress: numericalProgress,
        onTelemetryProgress: numericalProgress,
      });
      // The final status update must follow the last count event and the
      // latest coalesced telemetry snapshot.  Otherwise a late mesh write can
      // overwrite the terminal phase or counters.
      await flushProgress();
      assertJsonFinite(result);
      const unknownCounts = [result.primary, result.sensitivity].some(caseResult =>
        caseResult.searchTermination.includes('UNKNOWN_NUMERICAL')
        || caseResult.nonconvergedPhysicalCounts.length > 0);
      // Global CALCULATED means both disclosed K&H cases produced a valid
      // target-compliant finite-rate result. A valid primary alone remains
      // useful diagnostic evidence but cannot be delivered as a complete
      // sizing result while sensitivity is unresolved or fails.
      const status = result.primary.selected && result.sensitivity.selected ? 'CALCULATED'
        : unknownCounts ? 'NUMERICAL_FAILURE' : 'TARGET_FAILURE';
      await update(
        `UPDATE ecr_pre_pilot_stage4_physical_sizing_calculations
            SET status=$5,result_snapshot=$6,progress_snapshot=$7,
                error_code=NULL,completed_at=now()
          WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3
            AND attempt_token=$4 AND status='RUNNING'`,
        [userId, designId, authority.lineageHash, attemptToken, status, result,
          {
            ...persistedProgress,
            ...(status === 'NUMERICAL_FAILURE'
              ? { phase: 'FAILED' }
              : { phase: 'COMPLETE', completedCases: 2, totalCases: 2 }),
          }],
      );
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : 'STAGE4_FINITE_RATE_SOLVER_FAILED';
      const status = abort.signal.aborted || errorCode === 'STAGE4_FINITE_RATE_SOLVER_RUN_TIMEOUT'
        ? 'INTERRUPTED' : 'NUMERICAL_FAILURE';
      // A timeout/abort can happen while a child request is unresolved. Keep
      // the most recent completed-count/outcome snapshot rather than replacing
      // it with a fresh zero-progress failure record.
    try {
      await flushProgress();
      } catch (progressError) {
        // A progress write must never prevent the terminal failure status
        // from being attempted.  Keep the error visible in server diagnostics
        // while retaining the last successfully persisted snapshot.
        console.error('STAGE4_PROGRESS_PERSISTENCE_FAILED', progressError);
      }
      try {
        await update(
          `UPDATE ecr_pre_pilot_stage4_physical_sizing_calculations
              SET status=$5,error_code=$6,
                  progress_snapshot=$7,
                  completed_at=now()
            WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3
              AND attempt_token=$4 AND status='RUNNING'`,
          [userId, designId, authority.lineageHash, attemptToken, status, errorCode,
            { ...persistedProgress, phase: 'FAILED' }],
        );
      } catch (terminalError) {
        // The detached local task must settle even if the terminal write is
        // unavailable; otherwise it would surface as an unhandled rejection.
        console.error('STAGE4_TERMINAL_STATUS_PERSISTENCE_FAILED', terminalError);
      }
    } finally {
      if (localInflight.get(authority.lineageHash)?.attemptToken === attemptToken) {
        localInflight.delete(authority.lineageHash);
      }
    }
  })();
  localInflight.set(authority.lineageHash, { task, abort, attemptToken });
}

/**
 * Read-only latest result. GET rebuilds authority to reject stale ownership,
 * targets, or implementation lineage, but never starts a numerical solve.
 */
export async function getLiveStage4PrePilotSizing(userId: number, designId: number) {
  const authority = await loadStage4PrePilotSizingAuthority(userId, designId);
  const stored = await pool.query<StoredStage4Calculation>(
    `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
            deadline_at::text,completed_at::text
       FROM ecr_pre_pilot_stage4_physical_sizing_calculations
      WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3`,
    [userId, designId, authority.lineageHash],
  );
  const calculation = stored.rows[0] ?? null;
  let previousCalculation: PreviousStage4Calculation | null = null;
  if (!calculation) {
    // A refreshed implementation/source manifest intentionally creates a new
    // lineage.  Keep the prior terminal explanation discoverable without
    // presenting its scientific result as current and without exposing
    // attempt tokens.  This is deliberately read-only and owner-scoped.
    const historical = await pool.query<PreviousStage4Calculation>(
      `SELECT status,error_code,progress_snapshot,completed_at::text
         FROM ecr_pre_pilot_stage4_physical_sizing_calculations
        WHERE created_by=$1 AND design_id=$2 AND lineage_hash<>$3
          AND status IN ('INTERRUPTED','CALCULATED','TARGET_FAILURE','NUMERICAL_FAILURE')
        ORDER BY completed_at DESC NULLS LAST,id DESC
        LIMIT 1`,
      [userId, designId, authority.lineageHash],
    );
    previousCalculation = historical.rows[0] ?? null;
  }
  if (calculation && expired(calculation) && !localInflight.has(authority.lineageHash)) {
    calculation.status = 'INTERRUPTED';
    calculation.error_code = 'STAGE4_FINITE_RATE_SOLVER_RUN_LEASE_EXPIRED_EXPLICIT_RETRY_REQUIRED';
  }
  return stage4Response(authority, calculation, previousCalculation);
}

/**
 * Explicitly starts the bounded finite-rate screening calculation. Scientific
 * values are intentionally absent from this API; the builder above owns them.
 */
export async function calculateStage4PrePilotSizing(userId: number, designId: number) {
  const authority = await loadStage4PrePilotSizingAuthority(userId, designId);
  const lookup = () => pool.query<StoredStage4Calculation>(
    `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
            deadline_at::text,completed_at::text
       FROM ecr_pre_pilot_stage4_physical_sizing_calculations
      WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3`,
    [userId, designId, authority.lineageHash],
  );
  let calculation = (await lookup()).rows[0] ?? null;
  if (!calculation) {
    const attemptToken = randomUUID();
    await pool.query(
      `INSERT INTO ecr_pre_pilot_stage4_physical_sizing_calculations
        (design_id,created_by,lineage_hash,stage1_snapshot_hash,stage2_job_id,stage2_result_hash,
         stage3_run_id,stage3_immutable_hash,targets_hash,implementation_hash,status,attempt_token,deadline_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'RUNNING',$11,now() + interval '10 minutes')
       ON CONFLICT (created_by,design_id,lineage_hash) DO NOTHING`,
      [designId, userId, authority.lineageHash, authority.solverInput.stage1SnapshotHash,
        authority.solverInput.stage2JobId, authority.solverInput.stage2ResultHash,
        String(authority.solverInput.stage3RunId), authority.solverInput.stage3ImmutableHash,
        kuhniRunHash(authority.solverInput.stage1Targets), STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH,
        attemptToken],
    );
    calculation = (await lookup()).rows[0] ?? null;
  }
  if (calculation?.status === 'RUNNING' && !localInflight.has(authority.lineageHash)
    && !expired(calculation)) {
    startLocalFiniteRateRun(authority, userId, designId, calculation.attempt_token,
      calculation.progress_snapshot);
  }
  return stage4Response(authority, calculation);
}

/**
 * A failed/expired calculation is never silently rerun. This separate,
 * empty-payload action makes retry an explicit user decision and atomically
 * replaces the expired attempt lease before launching a new local worker.
 */
export async function retryStage4PrePilotSizing(userId: number, designId: number) {
  const authority = await loadStage4PrePilotSizingAuthority(userId, designId);
  const attemptToken = randomUUID();
  const restarted = await pool.query<StoredStage4Calculation>(
    `UPDATE ecr_pre_pilot_stage4_physical_sizing_calculations
        SET status='RUNNING',result_snapshot=NULL,error_code=NULL,
            progress_snapshot='{"phase":"QUEUED","completedCases":0,"totalCases":2}'::jsonb,
            attempt_token=$4,started_at=now(),deadline_at=now() + interval '10 minutes',completed_at=NULL
      WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3
        AND (status IN ('INTERRUPTED','NUMERICAL_FAILURE') OR (status='RUNNING' AND deadline_at <= now()))
      RETURNING status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
                deadline_at::text,completed_at::text`,
    [userId, designId, authority.lineageHash, attemptToken],
  );
  const calculation = restarted.rows[0] ?? (await pool.query<StoredStage4Calculation>(
    `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
            deadline_at::text,completed_at::text
       FROM ecr_pre_pilot_stage4_physical_sizing_calculations
      WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3`,
    [userId, designId, authority.lineageHash],
  )).rows[0] ?? null;
  if (restarted.rows[0]) {
    const previous = localInflight.get(authority.lineageHash);
    previous?.abort.abort();
    localInflight.delete(authority.lineageHash);
    startLocalFiniteRateRun(authority, userId, designId, attemptToken, {
      phase: 'QUEUED', completedCases: 0, totalCases: 2,
    });
  }
  return stage4Response(authority, calculation);
}

/** Explicitly interrupts only the current owner's current-lineage attempt. */
export async function stopStage4PrePilotSizing(userId: number, designId: number) {
  const authority = await loadStage4PrePilotSizingAuthority(userId, designId);
  const observed = await pool.query<StoredStage4Calculation>(
    `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
            deadline_at::text,completed_at::text
       FROM ecr_pre_pilot_stage4_physical_sizing_calculations
      WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3`,
    [userId, designId, authority.lineageHash],
  );
  const calculation = observed.rows[0] ?? null;
  if (!calculation || calculation.status !== 'RUNNING') {
    return stage4Response(authority, calculation);
  }
  const active = localInflight.get(authority.lineageHash);
  if (active?.attemptToken === calculation.attempt_token) active.abort.abort();
  await pool.query(
    `UPDATE ecr_pre_pilot_stage4_physical_sizing_calculations
        SET status='INTERRUPTED',
            error_code='STAGE4_FINITE_RATE_SOLVER_CANCELLED_EXPLICIT_RETRY_REQUIRED',
            completed_at=now()
       WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3
         AND attempt_token=$4 AND status='RUNNING'`,
    [userId, designId, authority.lineageHash, calculation.attempt_token],
  );
  const stored = await pool.query<StoredStage4Calculation>(
    `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
            deadline_at::text,completed_at::text
       FROM ecr_pre_pilot_stage4_physical_sizing_calculations
      WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3`,
    [userId, designId, authority.lineageHash],
  );
  return stage4Response(authority, stored.rows[0] ?? null);
}
