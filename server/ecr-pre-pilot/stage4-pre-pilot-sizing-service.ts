import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../db';
import { kuhniRunHash } from './kuhni-hydrodynamics';
import {
  stage1EquilibriumScientificContentHash,
  validateStage1Snapshot,
  type EcrPrePilotStage1Snapshot,
} from './stage1';
import { validatePersistedAcceptedSevenComponentNtForStage4 } from './predictive-nt-job-service';
import {
  qualifyKuhniStage3Presentation,
  type KuhniStage3PresentationQualification,
} from './kuhni-stage3-presentation';

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const acceptedStage2Statuses = new Set([
  'COMPLETED_GOVERNED_SEQUENCE',
  'COMPLETED_DIAGNOSTIC_SEQUENCE',
  'COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX',
]);

export const STAGE4_HETS_IMPLEMENTATION_VERSION = 'ECR_STAGE4_HETS_SCREENING_V2';
export const STAGE4_HETS_IMPLEMENTATION_HASH = createHash('sha256').update(JSON.stringify({
  version: STAGE4_HETS_IMPLEMENTATION_VERSION,
  compartmentHeightRule: 'hc = 0.5D',
  screeningHets: 'HETS = 1.0 m/theoretical stage',
  physicalCount: 'ceil(Nt * HETS / hc)',
  requiredHeight: 'Nt * HETS',
  installedHeight: 'Nphysical * hc',
  scope: 'PRE_PILOT_SCREENING_NO_OUTLET_OR_TARGET_CLAIM',
  stage3Admission: 'CALCULATED_IN_RANGE_OR_INDEPENDENTLY_CHECKED_PREPILOT_HETS_ONLY',
  stage2Compatibility: 'EXACT_EQUILIBRIUM_INPUT_MATCH_EXCLUDING_ONLY_HYDRAULIC_PHASE_ORIENTATION',
})).digest('hex');

function fail(code: string): never {
  throw new Error(code);
}

type Stage3Projection = {
  id: number | string;
  immutableHash: string;
  stage1SnapshotHash?: string;
  result: Record<string, any>;
};

type PersistedStage2 = {
  id: string; design_id: number; created_by: number; input_snapshot: unknown; model_hash: string; status: string;
  engine_hash: string;
  result_snapshot: Record<string, any>;
};

export type Stage2HetsStage1Compatibility = {
  status:
    | 'EXACT_STAGE1_SNAPSHOT_MATCH'
    | 'EXACT_EQUILIBRIUM_INPUT_MATCH_EXCLUDING_HYDRAULIC_PHASE_ORIENTATION';
  currentStage1SnapshotHash: string;
  persistedStage2Stage1SnapshotHash: string;
  currentEquilibriumScientificInputHash: string;
  persistedEquilibriumScientificInputHash: string;
  excludedScientificInputField: 'stage1.phaseConfiguration' | null;
  currentPhaseConfiguration: string;
  persistedStage2PhaseConfiguration: string;
};

function validatePersistedStage2Stage1Authority(
  row: PersistedStage2,
  persistedStage1SnapshotHash: string,
): EcrPrePilotStage1Snapshot {
  const stage1Authority = (row.input_snapshot as any)?.stage1Authority;
  if (
    !stage1Authority
    || typeof stage1Authority !== 'object'
    || typeof stage1Authority.snapshotHash !== 'string'
  ) {
    fail('STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  }
  let persistedStage1: EcrPrePilotStage1Snapshot;
  try {
    persistedStage1 = validateStage1Snapshot(stage1Authority.source);
  } catch {
    fail('STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  }
  if (
    stage1Authority.snapshotHash !== persistedStage1.immutableHash
    || persistedStage1.immutableHash !== persistedStage1SnapshotHash
  ) {
    fail('STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  }
  return persistedStage1;
}

/**
 * Verifies Stage-2 evidence already persisted by the accepted Stage-2 worker.
 * It intentionally does not preflight or execute that worker/runtime: HETS
 * sizing uses the immutable accepted record and must stay a synchronous read.
 */
export function validatePersistedStage2HetsAuthority(
  row: PersistedStage2,
  currentStage1: EcrPrePilotStage1Snapshot,
) {
  const result = row?.result_snapshot;
  const persistedStage1SnapshotHash = result?.stage1TargetGovernance?.stage1SnapshotHash;
  if (
    !result || !acceptedStage2Statuses.has(String(result.executionStatus ?? ''))
    || typeof persistedStage1SnapshotHash !== 'string'
  ) {
    fail('STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  }
  const persistedStage1 = validatePersistedStage2Stage1Authority(
    row,
    persistedStage1SnapshotHash,
  );
  let stage1Compatibility: Stage2HetsStage1Compatibility;
  if (persistedStage1SnapshotHash === currentStage1.immutableHash) {
    // Direct immutable-hash matching is already stricter than the
    // orientation-only compatibility path. The stored Stage-1 source and
    // its wrapper hash have also been revalidated above, so the result hash
    // cannot be self-attested independently of the persisted input.
    const equilibriumHash = stage1EquilibriumScientificContentHash(currentStage1);
    stage1Compatibility = {
      status: 'EXACT_STAGE1_SNAPSHOT_MATCH',
      currentStage1SnapshotHash: currentStage1.immutableHash,
      persistedStage2Stage1SnapshotHash: persistedStage1SnapshotHash,
      currentEquilibriumScientificInputHash: equilibriumHash,
      persistedEquilibriumScientificInputHash:
        stage1EquilibriumScientificContentHash(persistedStage1),
      excludedScientificInputField: null,
      currentPhaseConfiguration: currentStage1.stage1.phaseConfiguration,
      persistedStage2PhaseConfiguration: persistedStage1.stage1.phaseConfiguration,
    };
  } else {
    const currentEquilibriumScientificInputHash =
      stage1EquilibriumScientificContentHash(currentStage1);
    const persistedEquilibriumScientificInputHash =
      stage1EquilibriumScientificContentHash(persistedStage1);
    if (currentEquilibriumScientificInputHash !== persistedEquilibriumScientificInputHash) {
      fail('STAGE4_STAGE2_EQUILIBRIUM_INPUT_MISMATCH_EXCEPT_PHASE_ORIENTATION');
    }
    stage1Compatibility = {
      status: 'EXACT_EQUILIBRIUM_INPUT_MATCH_EXCLUDING_HYDRAULIC_PHASE_ORIENTATION',
      currentStage1SnapshotHash: currentStage1.immutableHash,
      persistedStage2Stage1SnapshotHash: persistedStage1SnapshotHash,
      currentEquilibriumScientificInputHash,
      persistedEquilibriumScientificInputHash,
      excludedScientificInputField: 'stage1.phaseConfiguration',
      currentPhaseConfiguration: currentStage1.stage1.phaseConfiguration,
      persistedStage2PhaseConfiguration: persistedStage1.stage1.phaseConfiguration,
    };
  }
  try {
    const trusted = validatePersistedAcceptedSevenComponentNtForStage4(row);
    return {
      theoreticalStages: trusted.theoreticalStages,
      resultHash: kuhniRunHash(result),
      stage1Compatibility,
    };
  } catch (error) {
    fail((error as Error).message || 'STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  }
}

export type Stage3PrePilotHetsAdmission = {
  status: 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE';
  source: 'CALCULATED_IN_RANGE_TRIAL' | 'V150_EXTRAPOLATED_MODEL_ROOT';
  columnDiameterM: number;
  stage3PresentationQualificationHash: string;
  limitations: KuhniStage3PresentationQualification['limitations'];
};

/**
 * This turns the additive Stage-3 qualification into a deliberately narrow
 * admission record.  The qualifier has already re-evaluated the V1.5 reverse
 * root from its frozen primitive basis; this function only accepts its exact
 * HETS-only contract and never treats it as governed hydraulics.
 */
export function admitIndependentlyCheckedStage3PrePilotHetsCandidate(
  qualification: KuhniStage3PresentationQualification,
): Stage3PrePilotHetsAdmission | null {
  const candidate = qualification?.candidate;
  const governed = qualification?.governedOutput;
  if (
    qualification?.status !== 'CALCULATED_PRE_PILOT_WITH_MAJOR_SCALE_UP_EXTRAPOLATION'
    || qualification.lineage?.status !== 'CURRENT'
    || !candidate
    || candidate.available !== true
    || candidate.governed !== false
    || candidate.stage4Input !== false
    || candidate.stage4HetsScreeningInput !== true
    || candidate.independentCheck !== 'PASSED'
    || !['CALCULATED_IN_RANGE_TRIAL', 'V150_EXTRAPOLATED_MODEL_ROOT'].includes(candidate.source)
    || !positiveFinite(candidate.columnDiameterM)
    || governed?.candidateIsNotGoverned !== true
    || governed?.stage4Input !== false
    || governed?.stage4HetsScreeningInput !== true
  ) return null;
  return {
    status: 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE',
    source: candidate.source,
    columnDiameterM: candidate.columnDiameterM,
    stage3PresentationQualificationHash: kuhniRunHash(qualification),
    limitations: qualification.limitations,
  };
}

function positiveFinite(value: unknown): value is number {
  return finite(value) && value > 0;
}

export function deriveStage4PrePilotSizing(input: {
  calculatedNt: number;
  stage2JobId: string;
  stage2ResultHash: string;
  stage3: Stage3Projection;
  stage2Stage1Compatibility?: Stage2HetsStage1Compatibility;
  stage3PrePilotHetsAdmission?: Stage3PrePilotHetsAdmission | null;
}) {
  if (!Number.isInteger(input.calculatedNt) || input.calculatedNt <= 0) {
    fail('STAGE4_VALID_CALCULATED_STAGE2_NT_REQUIRED_NO_DEFAULT_APPLIED');
  }
  const persistedAuthority = input.stage3.result.theoreticalStagesUsed;
  // New Stage-3 runs carry a fixed geometry design basis (N_T=7) and retain
  // the actual accepted Stage-2 Predictive N_T separately.  Stage 4 sizing
  // remains governed by the latter; it must not accidentally consume the
  // geometry basis when Stage 2 calculated 4, 7, or 10.
  const authority = persistedAuthority?.provenance === 'STAGE3_GEOMETRY_DESIGN_NT'
    ? {
      value: persistedAuthority.stage2AcceptedPredictiveNt,
      provenance: persistedAuthority.stage2AcceptedPredictiveNtProvenance,
      stage2JobId: persistedAuthority.stage2JobId,
      stage2ResultHash: persistedAuthority.stage2ResultHash,
    }
    : persistedAuthority;
  const sameStage2Lineage = authority?.provenance === 'STAGE_2_CALCULATED_NT'
    && authority?.stage2JobId === input.stage2JobId
    && authority?.stage2ResultHash === input.stage2ResultHash
    && authority?.value === input.calculatedNt;
  const selected = input.stage3.result.hydraulicDiagnosticPoint;
  const inRangeHydraulics = selected?.status === 'CALCULATED_IN_RANGE'
    && positiveFinite(selected.columnDiameterM);
  const prePilotHetsAdmission = input.stage3PrePilotHetsAdmission;
  const prePilotCrossSnapshotLineage = !sameStage2Lineage
    && prePilotHetsAdmission?.status === 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE'
    && input.stage2Stage1Compatibility?.status
      === 'EXACT_EQUILIBRIUM_INPUT_MATCH_EXCLUDING_HYDRAULIC_PHASE_ORIENTATION'
    && persistedAuthority?.provenance === 'STAGE3_GEOMETRY_DESIGN_NT'
    && persistedAuthority?.value === 7
    && persistedAuthority?.stage3GeometryDesignNt === 7
    && persistedAuthority?.stage2AcceptedPredictiveNt == null
    && persistedAuthority?.stage2JobId == null
    && persistedAuthority?.stage2ResultHash == null;
  if (!sameStage2Lineage && !prePilotCrossSnapshotLineage) {
    fail('STAGE4_STAGE3_STALE_OR_NOT_SAME_LINEAGE_WITH_CALCULATED_STAGE2_NT');
  }
  if (!inRangeHydraulics && !prePilotHetsAdmission) {
    fail('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  }

  const diameterM = inRangeHydraulics
    ? selected.columnDiameterM
    : prePilotHetsAdmission!.columnDiameterM;
  const compartmentHeightM = .5 * diameterM;
  const hetsMPerTheoreticalStage = 1;
  const screeningEfficiency = compartmentHeightM / hetsMPerTheoreticalStage;
  const requiredActiveHeightM = input.calculatedNt * hetsMPerTheoreticalStage;
  const requiredPhysicalCompartments = Math.ceil(requiredActiveHeightM / compartmentHeightM);
  const installedActiveHeightM = requiredPhysicalCompartments * compartmentHeightM;
  if (!finite(compartmentHeightM) || !finite(screeningEfficiency)
    || !Number.isInteger(requiredPhysicalCompartments) || requiredPhysicalCompartments < 1
    || !finite(installedActiveHeightM)) fail('STAGE4_HETS_SCREENING_CALCULATION_INVALID');

  return {
    status: 'CALCULATED_HETS_PRE_PILOT_SCREENING',
    classification: 'PRE-PILOT PREDICTIVE / SCREENING DESIGN',
    screeningNotice: 'PRE-PILOT SCREENING',
    implementation: {
      version: STAGE4_HETS_IMPLEMENTATION_VERSION,
      implementationHash: STAGE4_HETS_IMPLEMENTATION_HASH,
    },
    mainOutputs: {
      diameterM,
      overallEfficiency: screeningEfficiency,
      physicalCompartments: requiredPhysicalCompartments,
      activeHeightM: requiredActiveHeightM,
      requiredActiveHeightM,
      installedActiveHeightM,
    },
    calculatedNt: {
      value: input.calculatedNt,
      provenance: sameStage2Lineage
        ? 'STAGE_2_CALCULATED_NT_SAME_LINEAGE'
        : 'STAGE_2_CALCULATED_NT_EXACT_EQUILIBRIUM_COMPATIBLE_STAGE1',
      stage2JobId: input.stage2JobId,
      stage2ResultHash: input.stage2ResultHash,
    },
    selectedStage3Hydraulics: {
      diameterM,
      source: inRangeHydraulics
        ? 'PERSISTED_STAGE3_HYDRAULIC_DIAGNOSTIC_POINT_NO_STAGE4_RESELECTION'
        : 'PERSISTED_STAGE3_INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE_NO_STAGE4_RESELECTION',
      stage3RunId: input.stage3.id,
      stage3ImmutableHash: input.stage3.immutableHash,
    },
    stage2Stage1Compatibility: input.stage2Stage1Compatibility ?? {
      status: 'EXACT_STAGE1_SNAPSHOT_MATCH',
      excludedScientificInputField: null,
    },
    stage3HetsAdmission: inRangeHydraulics
      ? {
        status: 'PERSISTED_CALCULATED_IN_RANGE_HYDRAULICS',
        source: 'PERSISTED_STAGE3_HYDRAULIC_DIAGNOSTIC_POINT_NO_STAGE4_RESELECTION',
      }
      : prePilotHetsAdmission,
    overallEfficiency: {
      value: screeningEfficiency,
      status: 'CALCULATED_FROM_HETS_SCREENING_ASSUMPTION',
      dependency: null,
      closure: null,
    },
    hetsSizing: {
      stage2TheoreticalStages: input.calculatedNt,
      stage3HydraulicColumnDiameterM: diameterM,
      compartmentHeightRule: '0.5D',
      physicalCompartmentHeightM: compartmentHeightM,
      screeningHetsMPerTheoreticalStage: hetsMPerTheoreticalStage,
      calculatedScreeningCompartmentEfficiency: screeningEfficiency,
      requiredActiveHeightM,
      requiredPhysicalCompartments,
      installedActiveHeightM,
      designStatus: 'PRE-PILOT SCREENING',
    },
    physicalGeometry: {
      pitchM: compartmentHeightM,
      pitchAssumption: 'PROVISIONAL PRE-PILOT GEOMETRY — PILOT / VENDOR CONFIRMATION REQUIRED: hc = 0.5D',
      equations: [
        'hc = 0.5 × D', 'ηscreening = hc / HETS', 'Hrequired = Nt × HETS',
        'Nphysical = ceil(Nt × HETS / hc)', 'Hinstalled = Nphysical × hc',
      ],
    },
    assumptions: [
      'Stage 4 carries the persisted Stage-3 selected hydraulic point forward and does not recalculate or reselect hydraulic candidates.',
      ...(prePilotHetsAdmission ? [
        'The independently checked Stage-3 pre-pilot candidate supplies diameter only to this HETS screening route; it is not governed hydraulics, finite-rate Stage 4, mass-transfer readiness, or commercial release authority.',
        ...prePilotHetsAdmission.limitations.flatMap(limitation => limitation.details),
      ] : []),
      'HETS = 1.0 m/theoretical stage is an explicit engineering screening assumption; its conservatism for the RRBO/NMP system is not established.',
      'Compartment height hc = 0.5D is provisional pre-pilot geometry requiring pilot and vendor/mechanical confirmation.',
      'The screening efficiency hc/HETS is not independently predicted or experimentally validated.',
      'Installed active height is not total vessel height. This screening makes no outlet, recovery, target-compliance, or final-design claim.',
    ],
  };
}

export type Stage4PrePilotSizingAuthority = {
  projection: ReturnType<typeof deriveStage4PrePilotSizing>;
  /** Retained only as read-only evidence shape for stopped historical scripts. */
  solverInput: { calculatedNt: number; stage1SnapshotHash: string; stage2JobId: string; stage2ResultHash: string; stage3RunId: string; stage3ImmutableHash: string; hydraulics: { diameterM: number } };
  lineageHash: string;
};

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
  const stage2Rows = await pool.query<PersistedStage2>(
    `SELECT id::text,design_id,created_by,input_snapshot,model_hash,engine_hash,status,result_snapshot FROM ecr_pre_pilot_predictive_nt_jobs
      WHERE design_id=$1 AND created_by=$2 AND status='completed'
        AND result_snapshot IS NOT NULL
        AND result_snapshot->>'status' IS DISTINCT FROM 'ENGINE_ERROR'
      ORDER BY created_at DESC,id DESC`,
    [designId, userId],
  );
  let rejectedStage2AuthorityCode: string | null = null;
  const stage2 = stage2Rows.rows.find(row => {
    try {
      validatePersistedStage2HetsAuthority(row, stage1);
      return true;
    } catch (error) {
      rejectedStage2AuthorityCode = (error as Error).message;
      return false;
    }
  });
  if (!stage2) {
    fail(rejectedStage2AuthorityCode
      || 'STAGE4_VALID_CALCULATED_STAGE2_NT_REQUIRED_NO_DEFAULT_APPLIED');
  }
  const trustedStage2 = validatePersistedStage2HetsAuthority(stage2, stage1);

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
  const immutableHash = kuhniRunHash({
    basis: row.process_basis,
    theoreticalStages: row.theoretical_stage_authority,
    parentHydrodynamicRun: row.parent_hydrodynamic_run_id
      ? { id: row.parent_hydrodynamic_run_id, immutable_hash: row.parent_hydrodynamic_run_hash } : null,
    result: row.result_snapshot,
  });
  if (immutableHash !== row.immutable_hash
    || row.stage1_snapshot_hash !== stage1.immutableHash
    || row.result_snapshot?.processBasis?.stage1SnapshotHash !== stage1.immutableHash) {
    fail('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  }
  const stage3: Stage3Projection = {
    id: row.id, immutableHash: row.immutable_hash, stage1SnapshotHash: row.stage1_snapshot_hash,
    result: row.result_snapshot,
  };
  // This is an additive read-only qualification of the already replayed
  // resolver record. It neither writes presentation data into the immutable
  // Stage-3 result nor calls the frozen geometry engine.
  const presentationQualification = qualifyKuhniStage3Presentation({
    result: row.result_snapshot,
    processBasis: row.process_basis as any,
    runStage1SnapshotHash: row.stage1_snapshot_hash,
    currentStage1SnapshotHash: stage1.immutableHash,
    integrityVerified: true,
  });
  const stage3PrePilotHetsAdmission =
    admitIndependentlyCheckedStage3PrePilotHetsCandidate(presentationQualification);
  const strictStage2Stage3Lineage = row.stage2_job_id === stage2.id
    && row.stage2_result_hash === trustedStage2.resultHash;
  const compatiblePrePilotStage3Lineage = Boolean(
    stage3PrePilotHetsAdmission
    && trustedStage2.stage1Compatibility.status
      === 'EXACT_EQUILIBRIUM_INPUT_MATCH_EXCLUDING_HYDRAULIC_PHASE_ORIENTATION'
    && row.theoretical_stage_authority
    && (row.theoretical_stage_authority as any).provenance === 'STAGE3_GEOMETRY_DESIGN_NT'
    && (row.theoretical_stage_authority as any).value === 7
    && (row.theoretical_stage_authority as any).stage3GeometryDesignNt === 7
    && (row.theoretical_stage_authority as any).stage2AcceptedPredictiveNt == null
    && row.stage2_job_id == null
    && row.stage2_result_hash == null,
  );
  if (!strictStage2Stage3Lineage && !compatiblePrePilotStage3Lineage) {
    fail('STAGE4_STAGE3_STALE_OR_NOT_SAME_LINEAGE_WITH_CALCULATED_STAGE2_NT');
  }
  const projection = deriveStage4PrePilotSizing({
    calculatedNt: trustedStage2.theoreticalStages,
    stage2JobId: stage2.id,
    stage2ResultHash: trustedStage2.resultHash,
    stage3,
    stage2Stage1Compatibility: trustedStage2.stage1Compatibility,
    stage3PrePilotHetsAdmission,
  });
  const solverInput = {
    calculatedNt: trustedStage2.theoreticalStages,
    stage1SnapshotHash: stage1.immutableHash,
    stage2JobId: stage2.id,
    stage2ResultHash: trustedStage2.resultHash,
    stage3RunId: String(row.id),
    stage3ImmutableHash: row.immutable_hash,
    hydraulics: { diameterM: projection.mainOutputs.diameterM },
  };
  const lineageHash = kuhniRunHash({
    owner: { userId, designId },
    stage1SnapshotHash: stage1.immutableHash,
    stage2: {
      jobId: stage2.id, resultHash: trustedStage2.resultHash,
      theoreticalStages: trustedStage2.theoreticalStages,
      stage1Compatibility: trustedStage2.stage1Compatibility,
    },
    stage3: {
      runId: String(row.id), immutableHash: row.immutable_hash,
      hydraulicDiameterM: projection.mainOutputs.diameterM,
      hetsAdmission: projection.stage3HetsAdmission,
    },
    implementation: projection.implementation,
  });
  return { projection, solverInput, lineageHash };
}

type StoredCalculation = {
  status: string; result_snapshot: any; progress_snapshot: Record<string, unknown> | null;
  error_code: string | null; attempt_token: string; started_at: string; deadline_at: string; completed_at: string | null;
};

function resultFor(authority: Stage4PrePilotSizingAuthority, calculation: StoredCalculation | null, historical?: StoredCalculation | null) {
  const calculated = calculation?.status === 'CALCULATED'
    && calculation?.result_snapshot?.implementation?.implementationHash === STAGE4_HETS_IMPLEMENTATION_HASH;
  const result = calculated ? calculation.result_snapshot : {
    status: 'UNRUN',
    classification: 'PRE-PILOT PREDICTIVE / SCREENING DESIGN',
    screeningNotice: 'PRE-PILOT SCREENING',
    mainOutputs: { diameterM: authority.projection.mainOutputs.diameterM, overallEfficiency: null, physicalCompartments: null, activeHeightM: null },
    calculatedNt: authority.projection.calculatedNt,
    selectedStage3Hydraulics: authority.projection.selectedStage3Hydraulics,
    assumptions: authority.projection.assumptions,
  };
  return {
    ...result,
    calculation: {
      status: calculated ? 'CALCULATED' : 'UNRUN',
      progress: { phase: calculated ? 'COMPLETE' : 'NOT_RUN_EXPLICIT_CALCULATION_REQUIRED' },
      lineageHash: authority.lineageHash,
      startedAt: calculation?.started_at ?? null,
      completedAt: calculation?.completed_at ?? null,
      errorCode: calculation?.error_code ?? null,
    },
    ...(historical ? {
      previousCalculation: {
        status: historical.status, errorCode: historical.error_code,
        completedAt: historical.completed_at, progress: historical.progress_snapshot, historical: true as const,
      },
    } : {}),
  };
}

export async function getLiveStage4PrePilotSizing(userId: number, designId: number) {
  const authority = await loadStage4PrePilotSizingAuthority(userId, designId);
  const stored = await pool.query<StoredCalculation>(
    `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
            deadline_at::text,completed_at::text
       FROM ecr_pre_pilot_stage4_physical_sizing_calculations
      WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3`,
    [userId, designId, authority.lineageHash],
  );
  let calculation = stored.rows[0] ?? null;
  let historical: StoredCalculation | null = null;
  if (!calculation || calculation.result_snapshot?.implementation?.implementationHash !== STAGE4_HETS_IMPLEMENTATION_HASH) {
    historical = calculation;
    if (!historical) {
      const previous = await pool.query<StoredCalculation>(
        `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
                deadline_at::text,completed_at::text
           FROM ecr_pre_pilot_stage4_physical_sizing_calculations
          WHERE created_by=$1 AND design_id=$2 AND lineage_hash<>$3
          ORDER BY completed_at DESC NULLS LAST,id DESC LIMIT 1`,
        [userId, designId, authority.lineageHash],
      );
      historical = previous.rows[0] ?? null;
    }
    calculation = null;
  }
  return resultFor(authority, calculation, historical);
}

export async function calculateStage4PrePilotSizing(userId: number, designId: number) {
  const authority = await loadStage4PrePilotSizingAuthority(userId, designId);
  const lookup = () => pool.query<StoredCalculation>(
    `SELECT status,result_snapshot,progress_snapshot,error_code,attempt_token,started_at::text,
            deadline_at::text,completed_at::text
       FROM ecr_pre_pilot_stage4_physical_sizing_calculations
      WHERE created_by=$1 AND design_id=$2 AND lineage_hash=$3`,
    [userId, designId, authority.lineageHash],
  );
  let calculation = (await lookup()).rows[0] ?? null;
  if (!calculation || calculation.result_snapshot?.implementation?.implementationHash !== STAGE4_HETS_IMPLEMENTATION_HASH) {
    const result = { ...authority.projection, calculationModel: STAGE4_HETS_IMPLEMENTATION_VERSION };
    await pool.query(
      `INSERT INTO ecr_pre_pilot_stage4_physical_sizing_calculations
        (design_id,created_by,lineage_hash,stage1_snapshot_hash,stage2_job_id,stage2_result_hash,
         stage3_run_id,stage3_immutable_hash,targets_hash,implementation_hash,status,result_snapshot,
         progress_snapshot,attempt_token,deadline_at,completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'CALCULATED',$11,
               '{"phase":"COMPLETE"}'::jsonb,$12,now(),now())
       ON CONFLICT (created_by,design_id,lineage_hash) DO NOTHING`,
      [designId, userId, authority.lineageHash, authority.solverInput.stage1SnapshotHash,
        authority.solverInput.stage2JobId, authority.solverInput.stage2ResultHash,
        authority.solverInput.stage3RunId, authority.solverInput.stage3ImmutableHash,
        authority.solverInput.stage1SnapshotHash, STAGE4_HETS_IMPLEMENTATION_HASH, result, randomUUID()],
    );
    calculation = (await lookup()).rows[0] ?? null;
  }
  return resultFor(authority, calculation);
}

export async function retryStage4PrePilotSizing(userId: number, designId: number) {
  return calculateStage4PrePilotSizing(userId, designId);
}

export async function stopStage4PrePilotSizing(userId: number, designId: number) {
  return getLiveStage4PrePilotSizing(userId, designId);
}