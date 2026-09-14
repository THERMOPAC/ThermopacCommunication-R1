import { pool } from '../db';
import { kuhniRunHash } from './kuhni-hydrodynamics';
import { validateStage1Snapshot } from './stage1';
import { buildStage4MixingAudit } from './stage4-mixing-audit';
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

export async function getLiveStage4PrePilotSizing(userId: number, designId: number) {
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
  // Do not promote the currently available film/flash ingredients into a
  // physical-column result.  A single inlet flash and a forced zero-sum
  // transfer vector are not the required local 7C/non-equimolar closure.
  // In particular, a bounded integer search with unresolved numerical counts
  // must never be represented as a physical "no solution".
  const physicalSizing = {
    status: 'DEPENDENCY_BLOCKED' as const,
    classification: 'PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN',
    screeningNotice: 'PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN',
    implementation: null,
    primary: {
      selected: null,
      searchTermination: 'NOT_STARTED_REQUIRED_PHYSICAL_CLOSURE_MISSING',
      attemptedPhysicalCompartments: [],
      nonconvergedPhysicalCounts: [],
      lastConservedPhysicalTrial: null,
    },
    sensitivity: {
      selected: null,
      searchTermination: 'NOT_STARTED_REQUIRED_PHYSICAL_CLOSURE_MISSING',
      attemptedPhysicalCompartments: [],
      nonconvergedPhysicalCounts: [],
      lastConservedPhysicalTrial: null,
    },
    blockers: [
      'STAGE4_DYNAMIC_LOCAL_7C_EQUILIBRIUM_CLOSURE_REQUIRED',
      'STAGE4_NON_EQUIMOLAR_MULTICOMPONENT_TWO_FILM_INTERFACE_CLOSURE_REQUIRED',
      'STAGE4_INDEPENDENT_AXIAL_MESH_REFINEMENT_EVIDENCE_REQUIRED',
    ],
    materiality: {
      threshold: 'same integer physical compartments and <=5% relative active-height and overall-efficiency difference',
      comparable: false,
      heightRelativeDifference: null,
      efficiencyRelativeDifference: null,
      robustToKhCoefficientSensitivity: false,
      classification: 'NOT_COMPARABLE_PHYSICAL_SOLVES_NOT_AVAILABLE',
      note: 'Ec proximity alone is not a robustness criterion.',
    },
    assumptions: [
      'K&H Ec and Ed=0 are screening inputs only; they do not close the missing local multicomponent physical-column model.',
      'No physical-compartment count, active height, or overall efficiency is reported until the three explicit closure blockers are resolved.',
    ],
  };
  const primary = physicalSizing.primary.selected;
  return {
    ...projection,
    status: physicalSizing.status,
    classification: physicalSizing.classification,
    screeningNotice: physicalSizing.screeningNotice,
    mainOutputs: {
      diameterM: selected.columnDiameterM,
      overallEfficiency: primary?.overallEfficiency ?? null,
      physicalCompartments: primary?.physicalCompartments ?? null,
      activeHeightM: primary?.activeHeightM ?? null,
    },
    overallEfficiency: {
      value: primary?.overallEfficiency ?? null,
      status: primary
        ? 'CALCULATED_FROM_CONSERVED_TRANSFER_AND_AXIAL_DISPERSION_SCREENING'
        : 'NOT_EXECUTED_REQUIRED_CLOSURE_MISSING',
      dependency: primary ? null : physicalSizing.primary.searchTermination,
      closure: {
        implementationId: null,
        version: null,
        implementationHash: null,
      },
    },
    mixingAudit: {
      ...projection.mixingAudit,
      transferSolution: {
        status: primary ? 'CALCULATED_CONSERVED_AXIAL_DISPERSION_SCREENING'
          : 'NOT_EXECUTED_REQUIRED_CLOSURE_MISSING',
        detail: primary
          ? 'A rate-based seven-component, two-film, conserved counter-current physical-compartment search was run from the persisted Stage-3 point. No Stage-2 outlet was relabelled as a physical-column outlet.'
          : 'No physical-compartment search was executed. Dynamic local 7C equilibrium, non-equimolar two-film interface closure, and independent mesh-refinement evidence are required before a physical-column prediction may be reported.',
        physicalSizingStatus: physicalSizing.status,
      },
    },
    physicalSizing,
    physicalGeometry: {
      ...projection.physicalGeometry,
      equations: [
        'pitch = 0.5 × D',
        'physicalCompartments = first target-compliant integer count from conserved physical transfer-model search',
        'overallEfficiency = valid calculated Stage-2 NT / solved physical compartment count',
        'activeHeight = physicalCompartments × pitch',
      ],
    },
    assumptions: physicalSizing.assumptions,
  };
}

/**
 * The physical solve remains blocked rather than caching or replaying an
 * unjustified frozen-equilibrium approximation.  This endpoint stays read
 * only; it never writes Stage 2 or Stage 3.
 */