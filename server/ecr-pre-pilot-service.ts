import { pool } from "./db";
import {
  canonicalizeStage1Input,
  makeStage1Snapshot,
  stage1ScientificContentHash,
  validateStage1Snapshot,
  makeStage1HydrodynamicProcessBasis,
  type EcrPrePilotStage1Snapshot,
} from "./ecr-pre-pilot/stage1";
import {
  canonicalizeKuhniHydrodynamicInput,
  evaluateKuhniHydrodynamics,
  kuhniRunHash,
} from "./ecr-pre-pilot/kuhni-hydrodynamics";
import {
  KUHNI_GEOMETRY_RESOLVER_V100_VERSION,
  KUHNI_GEOMETRY_RESOLVER_VERSION,
  PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  STAGE2_ACCEPTED_PREDICTIVE_NT,
  STAGE3_GEOMETRY_DESIGN_NT,
  resolveKuhniGeometry,
  resolveKuhniGeometryV100,
  type Stage3GeometryStageAuthority,
  type TheoreticalStageAuthority,
} from "./ecr-pre-pilot/kuhni-geometry-resolver";
import {
  KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
  resolveKuhniGeometryV110,
} from "./ecr-pre-pilot/kuhni-geometry-resolver-v110";
import {
  KUHNI_GEOMETRY_RESOLVER_V120_HASH,
  KUHNI_GEOMETRY_RESOLVER_V120_VERSION,
  resolveKuhniGeometryV120,
} from "./ecr-pre-pilot/kuhni-geometry-resolver-v120";
import {
  KUHNI_GEOMETRY_RESOLVER_V130_HASH,
  KUHNI_GEOMETRY_RESOLVER_V130_VERSION,
  resolveKuhniGeometryV130,
} from "./ecr-pre-pilot/kuhni-geometry-resolver-v130";
import {
  KUHNI_GEOMETRY_RESOLVER_V140_HASH,
  KUHNI_GEOMETRY_RESOLVER_V140_VERSION,
  resolveKuhniGeometryV140,
} from "./ecr-pre-pilot/kuhni-geometry-resolver-v140";
import {
  KUHNI_GEOMETRY_RESOLVER_V150_HASH,
  KUHNI_GEOMETRY_RESOLVER_V150_VERSION,
  resolveKuhniGeometryV150,
} from "./ecr-pre-pilot/kuhni-geometry-resolver-v150";
import {
  qualifyKuhniStage3Presentation,
  type KuhniStage3PresentationQualification,
} from "./ecr-pre-pilot/kuhni-stage3-presentation";
import {
  ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
  ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_VERSION,
  ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
  compactStage3Stage4OptimizerResult,
  optimizeStage3Stage4,
  replayLegacyStage3Stage4,
} from "./ecr-pre-pilot/stage3-stage4-optimizer";
import {
  JOB_A_COMPONENT_ORDER,
  JOB_A_MOLECULAR_DATA,
  JOB_A_STAGE2_ENGINE_ID,
  JOB_A_STAGE2_ENGINE_VERSION,
  evaluateJobA,
  type JobAEvaluationInput,
} from "./ecr-pre-pilot/job-a";
import {
  assertJobBStage3ParentMatchesJobA,
} from "./ecr-pre-pilot/job-b";
import { evaluateJobBSimultaneous } from "./ecr-pre-pilot/job-b-simultaneous";
import { preflightSevenComponentTwoFilmInterface } from "./ecr-pre-pilot/job-b-interface";
import { loadJobCGlobalBoundaryState } from "./ecr-pre-pilot/job-b-boundary-state";
import {
  JOB_C_COMPONENT_ORDER,
  JOB_C_PRELIMINARY_SENSITIVITY_BASIS,
  JobCError,
  JOB_C_TEMPORARY_DIAGNOSTIC_MODE,
  JOB_C_WORKFLOW_TEST_ONLY_MODE,
  currentJobCArtifactHashes,
  jobCResultHash,
  jobCScientificResultHash,
  runJobCWorker,
  validateJobCWorkflowTestOnlyWorkerResponse,
  workflowTestOnlyCompletionClaimed,
} from "./ecr-pre-pilot/job-c";
import {
  assessAcceptedJobCForPhysicalSizing,
  solveDirectPartialTransferSizingCandidate,
  sizeAcceptedJobCWithWorkerTransport,
  summarizeJobCPhysicalSizingDependency,
} from "./ecr-pre-pilot/job-c-physical-sizing";
import {
  PARTIAL_TRANSFER_ANCHOR_HEIGHT_M,
  PARTIAL_TRANSFER_SIZING_VERSION,
  evaluateDirectPartialTransferStage1Targets,
  eligibleDirectPartialTransferCandidates,
  partialTransferHeightBracketResolved,
  verifyOwnedStrictPartialAnchor,
  type StrictPartialAnchor,
} from "./ecr-pre-pilot/stage4-partial-transfer-sizing";

const COUNTER_ROW_ID = 1;
const MAX_ALLOCATION_ATTEMPTS = 3;
const ALLOCATION_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export type EcrPrePilotDesignAllocation = {
  id: number;
  projectNumber: number;
  status: string;
  existing: boolean;
  inputData: unknown;
};

export async function getLatestSavedEcrPrePilotDesign(
  userId: number,
): Promise<EcrPrePilotDesignAllocation | null> {
  if (!Number.isInteger(userId) || userId < 1) {
    throw new Error("Authenticated user is required.");
  }
  const result = await pool.query<{
    id: number;
    project_number: number;
    status: string;
    input_data: unknown;
  }>(
    `SELECT id, project_number, status, input_data
       FROM ecr_pre_pilot_designs
      WHERE created_by = $1
        AND input_data ? 'stage1'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1`,
    [userId],
  );
  const design = result.rows[0];
  if (!design) return null;
  return {
    id: Number(design.id),
    projectNumber: Number(design.project_number),
    status: design.status,
    existing: true,
    inputData: design.input_data,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

function assertValidAllocationKey(allocationKey: string): void {
  if (!ALLOCATION_KEY_PATTERN.test(allocationKey)) {
    throw new Error("Idempotency-Key must contain 16–128 letters, numbers, underscores, or hyphens.");
  }
}

/**
 * Allocates one immutable ECR Pre-Pilot project number.
 *
 * The counter update, append-only allocation record, and draft record are one
 * transaction. A number is returned only after the transaction commits.
 */
export async function allocateEcrPrePilotDesign(
  userId: number,
  allocationKey: string,
): Promise<EcrPrePilotDesignAllocation> {
  if (!Number.isInteger(userId) || userId < 1) {
    throw new Error("Authenticated user is required.");
  }
  assertValidAllocationKey(allocationKey);

  for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingAllocation = await client.query<{
        project_number: number;
      }>(
        `SELECT project_number
           FROM ecr_pre_pilot_number_allocations
          WHERE allocated_by = $1 AND allocation_key = $2
          FOR UPDATE`,
        [userId, allocationKey],
      );

      if (existingAllocation.rows[0]) {
        const existingDesign = await client.query<{ id: number; status: string; input_data: unknown }>(
          `SELECT id, status, input_data
             FROM ecr_pre_pilot_designs
            WHERE project_number = $1`,
          [existingAllocation.rows[0].project_number],
        );
        if (!existingDesign.rows[0]) {
          throw new Error("The existing project-number allocation has no design record.");
        }
        const existing = existingDesign.rows[0];
        await client.query("COMMIT");
        return {
          id: Number(existing.id),
          projectNumber: Number(existingAllocation.rows[0].project_number),
          status: existing.status,
          existing: true,
          inputData: existing.input_data,
        };
      }

      await client.query(
        `INSERT INTO ecr_pre_pilot_number_counters (id, next_number)
         VALUES ($1, 1)
         ON CONFLICT (id) DO NOTHING`,
        [COUNTER_ROW_ID],
      );

      const nextNumber = await client.query<{ project_number: number }>(
        `UPDATE ecr_pre_pilot_number_counters
            SET next_number = next_number + 1
          WHERE id = $1
      RETURNING next_number - 1 AS project_number`,
        [COUNTER_ROW_ID],
      );
      if (!nextNumber.rows[0]) {
        throw new Error("Project-number counter is unavailable.");
      }

      const projectNumber = Number(nextNumber.rows[0].project_number);
      await client.query(
        `INSERT INTO ecr_pre_pilot_number_allocations
          (project_number, allocation_key, allocated_by)
         VALUES ($1, $2, $3)`,
        [projectNumber, allocationKey, userId],
      );

      const design = await client.query<{ id: number; status: string }>(
        `INSERT INTO ecr_pre_pilot_designs
          (project_number, allocation_key, created_by, status, input_data)
         VALUES ($1, $2, $3, 'draft', '{}'::jsonb)
      RETURNING id, status`,
        [projectNumber, allocationKey, userId],
      );
      if (!design.rows[0]) {
        throw new Error("ECR Pre-Pilot design could not be created.");
      }

      await client.query("COMMIT");
      return {
        id: Number(design.rows[0].id),
        projectNumber,
        status: design.rows[0].status,
        existing: false,
        inputData: {},
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isUniqueViolation(error) && attempt < MAX_ALLOCATION_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  throw new Error("Project-number allocation could not be completed.");
}

export async function saveEcrPrePilotStage1(
  userId: number,
  designId: number,
  rawInput: unknown,
): Promise<EcrPrePilotStage1Snapshot> {
  const design = await pool.query<{ project_number: number; input_data: unknown }>(
    `SELECT project_number, input_data
       FROM ecr_pre_pilot_designs
      WHERE id = $1 AND created_by = $2`,
    [designId, userId],
  );
  if (!design.rows[0]) throw new Error("ECR_PRE_PILOT_DESIGN_NOT_FOUND");
  const stage1 = canonicalizeStage1Input(rawInput, Number(design.rows[0].project_number));
  const snapshot = makeStage1Snapshot(stage1);
  try {
    const existing = validateStage1Snapshot(design.rows[0].input_data);
    if (stage1ScientificContentHash(existing) === stage1ScientificContentHash(snapshot)) {
      return existing;
    }
  } catch {
    // Unsaved or invalid prior input cannot establish scientific equivalence.
  }
  const updated = await pool.query(
    `UPDATE ecr_pre_pilot_designs
        SET input_data = $3, updated_at = NOW()
      WHERE id = $1 AND created_by = $2
      RETURNING id`,
    [designId, userId, snapshot],
  );
  if (!updated.rows[0]) throw new Error("ECR_PRE_PILOT_DESIGN_NOT_FOUND");
  return snapshot;
}

export async function createKuhniHydrodynamicRun(userId: number, designId: number, rawInput: unknown) {
  const design = await pool.query<{ input_data: unknown }>(
    `SELECT input_data FROM ecr_pre_pilot_designs WHERE id = $1 AND created_by = $2`, [designId, userId],
  );
  if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const stage1 = validateStage1Snapshot(design.rows[0].input_data);
  const input = canonicalizeKuhniHydrodynamicInput(rawInput);
  const basis = makeStage1HydrodynamicProcessBasis(stage1);
  const result = evaluateKuhniHydrodynamics(input, basis);
  const immutableHash = kuhniRunHash({ input, basis, result });
  const saved = await pool.query<{ id: number; created_at: string }>(
    `INSERT INTO ecr_pre_pilot_kuhni_hydrodynamic_runs
       (design_id, created_by, stage1_snapshot_hash, process_basis, input_snapshot, result_snapshot, implementation_hash, immutable_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
    [designId, userId, stage1.immutableHash, basis, input, result, result.engine.implementationHash, immutableHash],
  );
  return { id: Number(saved.rows[0].id), createdAt: saved.rows[0].created_at, immutableHash, ...result };
}

export async function getKuhniHydrodynamicRuns(userId: number, designId: number, latest = false) {
  const result = await pool.query(
    `SELECT id, created_at AS "createdAt",
            stage1_snapshot_hash AS "stage1SnapshotHash",
            process_basis AS "processBasis",
            input_snapshot AS "inputSnapshot",
            result_snapshot AS result,
            implementation_hash AS "implementationHash",
            immutable_hash AS "immutableHash"
       FROM ecr_pre_pilot_kuhni_hydrodynamic_runs
      WHERE design_id=$1 AND created_by=$2 ORDER BY created_at DESC, id DESC ${latest ? 'LIMIT 1' : ''}`,
    [designId, userId],
  );
  const verified = result.rows.map((row) => {
    const replayedHash = kuhniRunHash({
      input: row.inputSnapshot,
      basis: row.processBasis,
      result: row.result,
    });
    const stage1HashMatches = row.stage1SnapshotHash === row.processBasis?.stage1SnapshotHash;
    const implementationHashMatches = row.implementationHash === row.result?.engine?.implementationHash;
    if (replayedHash !== row.immutableHash || !stage1HashMatches || !implementationHashMatches) {
      throw new Error('ECR_PRE_PILOT_KUHNI_INTEGRITY_FAILURE');
    }
    return {
      id: Number(row.id),
      createdAt: row.createdAt,
      immutableHash: row.immutableHash,
      integrityStatus: 'VERIFIED' as const,
      result: row.result,
    };
  });
  return latest ? verified[0] ?? null : verified;
}

const USABLE_THERMODYNAMIC_EXECUTION_STATUSES = new Set([
  'COMPLETED_GOVERNED_SEQUENCE',
  'COMPLETED_DIAGNOSTIC_SEQUENCE',
  'COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX',
]);

export function resolveTheoreticalStageAuthority(
  stage1Hash: string,
  job: { id: string; status: string; result_snapshot: any } | undefined,
): Stage3GeometryStageAuthority {
  const result = job?.result_snapshot;
  const candidate = Number(result?.establishedTheoreticalStages ?? result?.predictiveNt);
  const valid = job?.status === 'completed'
    && result
    && result.status !== 'ENGINE_ERROR'
    && USABLE_THERMODYNAMIC_EXECUTION_STATUSES.has(String(result.executionStatus ?? ''))
    && result.stage1TargetGovernance?.stage1SnapshotHash === stage1Hash
    && Number.isInteger(candidate)
    && candidate > 0;
  const stage2ResultHash = valid ? kuhniRunHash(result) : null;
  const stage2AcceptedPredictiveNt = valid ? candidate : null;
  const reason = valid
    ? null
    : job?.status === 'completed'
      ? 'STAGE_2_ACCEPTED_PREDICTIVE_NT_UNAVAILABLE_OR_INVALID_FOR_CURRENT_STAGE1'
      : 'VALID_CALCULATED_STAGE_2_NT_UNAVAILABLE';
  return {
    value: STAGE3_GEOMETRY_DESIGN_NT,
    provenance: 'STAGE3_GEOMETRY_DESIGN_NT',
    label: 'FIXED PRE-PILOT KUHNI GEOMETRY DESIGN BASIS (STAGE3_GEOMETRY_DESIGN_NT=7)',
    stage3GeometryDesignNt: STAGE3_GEOMETRY_DESIGN_NT,
    stage2AcceptedPredictiveNtName: STAGE2_ACCEPTED_PREDICTIVE_NT,
    stage2AcceptedPredictiveNt,
    stage2AcceptedPredictiveNtProvenance: valid
      ? 'STAGE_2_CALCULATED_NT'
      : 'STAGE_2_ACCEPTED_PREDICTIVE_NT_UNAVAILABLE',
    stage2AcceptedPredictiveNtLabel: valid
      ? 'STAGE-2 ACCEPTED PREDICTIVE N_T'
      : 'STAGE-2 ACCEPTED PREDICTIVE N_T UNAVAILABLE',
    reason,
    stage2JobId: valid ? job!.id : null,
    stage2ResultHash,
  };
}

export async function createKuhniGeometryResolverRun(userId: number, designId: number) {
  const design = await pool.query<{ input_data: unknown }>(
    `SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2`,
    [designId, userId],
  );
  if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const stage1 = validateStage1Snapshot(design.rows[0].input_data);
  const basis = makeStage1HydrodynamicProcessBasis(stage1);
  const stage2 = await pool.query<{ id: string; status: string; result_snapshot: unknown }>(
    `SELECT id::text, status, result_snapshot
       FROM ecr_pre_pilot_predictive_nt_jobs
      WHERE design_id=$1
        AND created_by=$2
        AND status='completed'
        AND result_snapshot IS NOT NULL
        AND result_snapshot->>'status' IS DISTINCT FROM 'ENGINE_ERROR'
        AND result_snapshot->>'executionStatus' = ANY($3::text[])
        AND result_snapshot#>>'{stage1TargetGovernance,stage1SnapshotHash}'=$4
        AND COALESCE(result_snapshot->>'establishedTheoreticalStages', result_snapshot->>'predictiveNt') ~ '^[1-9][0-9]*$'
      ORDER BY created_at DESC LIMIT 1`,
    [designId, userId, [...USABLE_THERMODYNAMIC_EXECUTION_STATUSES], stage1.immutableHash],
  );
  const theoreticalStages = resolveTheoreticalStageAuthority(stage1.immutableHash, stage2.rows[0] as any);
  const parent = await pool.query<{ id: string; immutable_hash: string }>(
    `SELECT id::text, immutable_hash
       FROM ecr_pre_pilot_kuhni_hydrodynamic_runs
      WHERE design_id=$1 AND created_by=$2
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [designId, userId],
  );
  const parentRun = parent.rows[0] ?? null;
  // Keep the governed heavy-continuous route on V1.3.0. V1.5.0 is selected
  // only for RRBO-continuous/downward-NMP. Its assumption-based preliminary
  // point is a separate payload and cannot alter the governed envelope.
  const result = basis.phaseConfiguration === "rrbo-continuous-nmp-dispersed"
    ? resolveKuhniGeometryV150(basis, theoreticalStages)
    : resolveKuhniGeometryV130(basis, theoreticalStages);
  const immutableHash = kuhniRunHash({
    basis,
    theoreticalStages,
    parentHydrodynamicRun: parentRun,
    result,
  });
  const saved = await pool.query<{ id: string; created_at: string }>(
    `INSERT INTO ecr_pre_pilot_kuhni_geometry_resolver_runs
       (design_id, created_by, stage1_snapshot_hash, stage2_job_id, stage2_result_hash,
        parent_hydrodynamic_run_id, parent_hydrodynamic_run_hash, process_basis,
        theoretical_stage_authority, result_snapshot, implementation_hash, immutable_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id::text, created_at`,
    [
      designId, userId, stage1.immutableHash,
      theoreticalStages.stage2JobId, theoreticalStages.stage2ResultHash,
      parentRun?.id ?? null, parentRun?.immutable_hash ?? null,
      basis, theoreticalStages, result, result.engine.implementationHash, immutableHash,
    ],
  );
  const presentationQualification = qualifyKuhniStage3Presentation({
    result,
    processBasis: basis,
    runStage1SnapshotHash: stage1.immutableHash,
    currentStage1SnapshotHash: stage1.immutableHash,
    integrityVerified: true,
  });
  return {
    id: saved.rows[0].id,
    createdAt: saved.rows[0].created_at,
    immutableHash,
    integrityStatus: 'VERIFIED' as const,
    stage1SnapshotHash: stage1.immutableHash,
    implementationHash: result.engine.implementationHash,
    presentationQualification,
    ...result,
  };
}

/**
 * Persist the additive Stage3/4 optimizer in the same immutable resolver
 * ledger.  Keeping one ledger preserves the existing ownership and freshness
 * checks while the versioned engine dispatch above/below keeps V1.1-V1.5
 * historical replay untouched.
 */
export async function createStage3Stage4OptimizerRun(
  userId: number,
  designId: number,
  rawControls?: unknown,
) {
  const design = await pool.query<{ input_data: unknown }>(
    `SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2`,
    [designId, userId],
  );
  if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const stage1 = validateStage1Snapshot(design.rows[0].input_data);
  const basis = makeStage1HydrodynamicProcessBasis(stage1);
  const stage2 = await pool.query<{ id: string; status: string; result_snapshot: any }>(
    `SELECT id::text,status,result_snapshot
       FROM ecr_pre_pilot_predictive_nt_jobs
      WHERE design_id=$1 AND created_by=$2 AND status='completed'
        AND result_snapshot IS NOT NULL
        AND result_snapshot->>'status' IS DISTINCT FROM 'ENGINE_ERROR'
        AND result_snapshot->>'executionStatus' = ANY($3::text[])
        AND result_snapshot#>>'{stage1TargetGovernance,stage1SnapshotHash}'=$4
      ORDER BY created_at DESC,id DESC LIMIT 1`,
    [designId, userId, [...USABLE_THERMODYNAMIC_EXECUTION_STATUSES], stage1.immutableHash],
  );
  const stage2Authority = resolveTheoreticalStageAuthority(stage1.immutableHash, stage2.rows[0] as any);
  const parent = await pool.query<{ id: string; immutable_hash: string }>(
    `SELECT id::text,immutable_hash
       FROM ecr_pre_pilot_kuhni_hydrodynamic_runs
      WHERE design_id=$1 AND created_by=$2
      ORDER BY created_at DESC,id DESC LIMIT 1`,
    [designId, userId],
  );
  const parentRun = parent.rows[0] ?? null;
  const result = optimizeStage3Stage4(basis, stage1.immutableHash, rawControls);
  const immutableHash = kuhniRunHash({
    basis,
    theoreticalStages: stage2Authority,
    parentHydrodynamicRun: parentRun,
    result,
  });
  const saved = await pool.query<{ id: string; created_at: string }>(
    `INSERT INTO ecr_pre_pilot_kuhni_geometry_resolver_runs
       (design_id,created_by,stage1_snapshot_hash,stage2_job_id,stage2_result_hash,
        parent_hydrodynamic_run_id,parent_hydrodynamic_run_hash,process_basis,
        theoretical_stage_authority,result_snapshot,implementation_hash,immutable_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id::text,created_at`,
    [
      designId, userId, stage1.immutableHash,
      stage2Authority.stage2JobId, stage2Authority.stage2ResultHash,
      parentRun?.id ?? null, parentRun?.immutable_hash ?? null,
      basis, stage2Authority, result, ECR_STAGE3_STAGE4_OPTIMIZER_HASH, immutableHash,
    ],
  );
  const apiResult = compactStage3Stage4OptimizerResult(result);
  return {
    id: saved.rows[0].id,
    createdAt: saved.rows[0].created_at,
    immutableHash,
    integrityStatus: 'VERIFIED' as const,
    stage1SnapshotHash: stage1.immutableHash,
    implementationHash: ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
    optimizerVersion: ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
    stage2Reference: {
      value: stage2Authority.stage2AcceptedPredictiveNt,
      jobId: stage2Authority.stage2JobId,
      resultHash: stage2Authority.stage2ResultHash,
      status: stage2Authority.stage2AcceptedPredictiveNtProvenance,
    },
    ...apiResult,
  };
}

export async function getStage3Stage4OptimizerRuns(
  userId: number,
  designId: number,
  latest = false,
) {
  const design = await pool.query<{ input_data: unknown }>(
    `SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2`,
    [designId, userId],
  );
  if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const currentStage1 = validateStage1Snapshot(design.rows[0].input_data);
  const rows = await pool.query<any>(
    `SELECT id::text,created_at AS "createdAt",
            stage1_snapshot_hash AS "stage1SnapshotHash",
            stage2_job_id::text AS "stage2JobId",
            stage2_result_hash AS "stage2ResultHash",
            parent_hydrodynamic_run_id::text AS "parentHydrodynamicRunId",
            parent_hydrodynamic_run_hash AS "parentHydrodynamicRunHash",
            process_basis AS "processBasis",
            theoretical_stage_authority AS "theoreticalStages",
            result_snapshot AS result,
            implementation_hash AS "implementationHash",
            immutable_hash AS "immutableHash"
       FROM ecr_pre_pilot_kuhni_geometry_resolver_runs
      WHERE design_id=$1 AND created_by=$2
        AND stage1_snapshot_hash=$3
        AND result_snapshot->'engine'->>'version'=$4
         AND implementation_hash=$5
         AND result_snapshot->'engine'->>'implementationHash'=$5
      ORDER BY created_at DESC,id DESC
      ${latest ? 'LIMIT 1' : ''}`,
    [designId, userId, currentStage1.immutableHash, ECR_STAGE3_STAGE4_OPTIMIZER_VERSION, ECR_STAGE3_STAGE4_OPTIMIZER_HASH],
  );
  const verified = rows.rows.map((row) => {
    const result = row.result;
    const { calculationHash, ...calculationPayload } = result ?? {};
    const immutableHash = kuhniRunHash({
      basis: row.processBasis,
      theoreticalStages: row.theoreticalStages,
      parentHydrodynamicRun: row.parentHydrodynamicRunId
        ? { id: row.parentHydrodynamicRunId, immutable_hash: row.parentHydrodynamicRunHash }
        : null,
      result,
    });
    if (
      immutableHash !== row.immutableHash
      || row.implementationHash !== ECR_STAGE3_STAGE4_OPTIMIZER_HASH
      || row.implementationHash !== result?.engine?.implementationHash
      || row.stage1SnapshotHash !== currentStage1.immutableHash
      || row.processBasis?.stage1SnapshotHash !== currentStage1.immutableHash
      || result?.stage1Authority?.snapshotHash !== currentStage1.immutableHash
      || kuhniRunHash(calculationPayload) !== calculationHash
    ) {
      throw new Error('ECR_PRE_PILOT_KUHNI_RESOLVER_INTEGRITY_FAILURE');
    }
    const presentationQualification: KuhniStage3PresentationQualification =
      qualifyKuhniStage3Presentation({
        result,
        processBasis: row.processBasis,
        runStage1SnapshotHash: row.stage1SnapshotHash,
        currentStage1SnapshotHash: currentStage1.immutableHash,
        integrityVerified: true,
      });
    return {
      id: row.id,
      createdAt: row.createdAt,
      immutableHash: row.immutableHash,
      integrityStatus: 'VERIFIED' as const,
      stage1SnapshotHash: row.stage1SnapshotHash,
      implementationHash: row.implementationHash,
      presentationQualification,
      result: compactStage3Stage4OptimizerResult(result),
    };
  });
  return latest ? verified[0] ?? null : verified;
}

export async function getKuhniGeometryResolverRuns(
  userId: number,
  designId: number,
  latest = false,
  historicalOnly = false,
) {
  const currentDesign = await pool.query<{ input_data: unknown }>(
    `SELECT input_data
       FROM ecr_pre_pilot_designs
      WHERE id=$1 AND created_by=$2`,
    [designId, userId],
  );
  let currentStage1SnapshotHash: string | null = null;
  try {
    currentStage1SnapshotHash = currentDesign.rows[0]
      ? validateStage1Snapshot(currentDesign.rows[0].input_data).immutableHash
      : null;
  } catch {
    // An invalid or unsaved current Stage-1 record must fail closed for the
    // additive presentation candidate; historical replay remains available.
  }
  const rows = await pool.query(
    `SELECT id::text, created_at AS "createdAt",
            stage1_snapshot_hash AS "stage1SnapshotHash",
            stage2_job_id::text AS "stage2JobId",
            stage2_result_hash AS "stage2ResultHash",
            parent_hydrodynamic_run_id::text AS "parentHydrodynamicRunId",
            parent_hydrodynamic_run_hash AS "parentHydrodynamicRunHash",
            process_basis AS "processBasis",
            theoretical_stage_authority AS "theoreticalStages",
            result_snapshot AS result,
            implementation_hash AS "implementationHash",
            immutable_hash AS "immutableHash"
       FROM ecr_pre_pilot_kuhni_geometry_resolver_runs
      WHERE design_id=$1 AND created_by=$2
      ${historicalOnly
        ? `AND result_snapshot->'engine'->>'version' <> $3`
        : ''}
      ORDER BY created_at DESC, id DESC ${latest ? 'LIMIT 1' : ''}`,
    historicalOnly
      ? [designId, userId, ECR_STAGE3_STAGE4_OPTIMIZER_VERSION]
      : [designId, userId],
  );
  const verified = rows.rows.map((row: any) => {
    const replayed = kuhniRunHash({
      basis: row.processBasis,
      theoreticalStages: row.theoreticalStages,
      parentHydrodynamicRun: row.parentHydrodynamicRunId
        ? { id: row.parentHydrodynamicRunId, immutable_hash: row.parentHydrodynamicRunHash }
        : null,
      result: row.result,
    });
    const { calculationHash, ...calculationPayload } = row.result ?? {};
    const numericalReplay = (() => {
      switch (row.result?.engine?.version) {
        case KUHNI_GEOMETRY_RESOLVER_V100_VERSION:
          return resolveKuhniGeometryV100(row.processBasis, row.theoreticalStages);
        case KUHNI_GEOMETRY_RESOLVER_VERSION:
          return resolveKuhniGeometry(row.processBasis, row.theoreticalStages);
        case KUHNI_GEOMETRY_RESOLVER_V110_VERSION:
          return resolveKuhniGeometryV110(row.processBasis, row.theoreticalStages);
        case KUHNI_GEOMETRY_RESOLVER_V120_VERSION:
          return resolveKuhniGeometryV120(row.processBasis, row.theoreticalStages);
        case KUHNI_GEOMETRY_RESOLVER_V130_VERSION:
          return resolveKuhniGeometryV130(row.processBasis, row.theoreticalStages);
        case KUHNI_GEOMETRY_RESOLVER_V140_VERSION:
          return resolveKuhniGeometryV140(row.processBasis, row.theoreticalStages);
        case KUHNI_GEOMETRY_RESOLVER_V150_VERSION:
          return resolveKuhniGeometryV150(row.processBasis, row.theoreticalStages);
        case ECR_STAGE3_STAGE4_OPTIMIZER_VERSION:
          return optimizeStage3Stage4(
            row.processBasis,
            row.processBasis?.stage1SnapshotHash,
            row.result?.controls,
          );
        case ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_VERSION:
          return replayLegacyStage3Stage4(
            row.processBasis,
            row.processBasis?.stage1SnapshotHash,
            row.result?.controls,
          );
        default:
          throw new Error('ECR_PRE_PILOT_KUHNI_RESOLVER_UNKNOWN_ENGINE_VERSION');
      }
    })();
    if (
      replayed !== row.immutableHash
      || row.implementationHash !== row.result?.engine?.implementationHash
      || row.stage1SnapshotHash !== row.processBasis?.stage1SnapshotHash
      || kuhniRunHash(calculationPayload) !== calculationHash
      || kuhniRunHash(numericalReplay) !== kuhniRunHash(row.result)
    ) {
      throw new Error('ECR_PRE_PILOT_KUHNI_RESOLVER_INTEGRITY_FAILURE');
    }
    const presentationQualification: KuhniStage3PresentationQualification =
      qualifyKuhniStage3Presentation({
        result: row.result,
        processBasis: row.processBasis,
        runStage1SnapshotHash: row.stage1SnapshotHash,
        currentStage1SnapshotHash,
        integrityVerified: true,
      });
    return {
      id: row.id, createdAt: row.createdAt, immutableHash: row.immutableHash,
      integrityStatus: 'VERIFIED' as const,
      stage1SnapshotHash: row.stage1SnapshotHash,
      implementationHash: row.implementationHash,
      presentationQualification,
      result: row.result,
    };
  });
  return latest ? verified[0] ?? null : verified;
}

function jobAMoleFractions(weights: readonly number[]): number[] {
  const moles = weights.map((weight, index) =>
    weight / JOB_A_MOLECULAR_DATA[JOB_A_COMPONENT_ORDER[index]].molecularWeightGmol);
  const total = moles.reduce((sum, value) => sum + value, 0);
  if (!(total > 0) || moles.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error('JOB_A_DEPENDENCY_BLOCKED:INVALID_STAGE1_PHASE_COMPOSITION');
  }
  return moles.map(value => value / total);
}

/**
 * Job A is intentionally recomputed from verified immutable dependencies. No
 * request body is accepted as physical authority and no Job-A persistence is
 * required.
 */
export async function evaluateEcrPrePilotJobA(userId: number, designId: number) {
  const design = await pool.query<{ input_data: unknown }>(
    `SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2`,
    [designId, userId],
  );
  if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  let stage1: EcrPrePilotStage1Snapshot;
  try {
    stage1 = validateStage1Snapshot(design.rows[0].input_data);
  } catch {
    throw new Error('JOB_A_DEPENDENCY_BLOCKED:LATEST_SAVED_STAGE1_REQUIRED');
  }
  // Job A is a historical resolver consumer; the current Stage-3/4
  // optimizer is consumed by Stage 4 and must not be mistaken for a V1.x
  // geometry replay.
  const stage3 = await getKuhniGeometryResolverRuns(userId, designId, true, true) as any;
  if (!stage3) throw new Error('JOB_A_DEPENDENCY_BLOCKED:LATEST_VERIFIED_STAGE3_REQUIRED');
  const result = stage3.result as any;
  const activeV130 = result?.engine?.version === KUHNI_GEOMETRY_RESOLVER_V130_VERSION
    && result?.engine?.implementationHash === KUHNI_GEOMETRY_RESOLVER_V130_HASH;
  const activeV140 = result?.engine?.version === KUHNI_GEOMETRY_RESOLVER_V140_VERSION
    && result?.engine?.implementationHash === KUHNI_GEOMETRY_RESOLVER_V140_HASH;
  const activeV150 = result?.engine?.version === KUHNI_GEOMETRY_RESOLVER_V150_VERSION
    && result?.engine?.implementationHash === KUHNI_GEOMETRY_RESOLVER_V150_HASH;
  const historicalV120 = result?.engine?.version === KUHNI_GEOMETRY_RESOLVER_V120_VERSION
    && result?.engine?.implementationHash === KUHNI_GEOMETRY_RESOLVER_V120_HASH;
  if (!activeV130 && !activeV140 && !activeV150 && !historicalV120) {
    throw new Error('JOB_A_DEPENDENCY_BLOCKED:LATEST_STAGE3_V130_REQUIRED');
  }
  if (result.processBasis?.stage1SnapshotHash !== stage1.immutableHash) {
    throw new Error('JOB_A_DEPENDENCY_BLOCKED:STAGE1_STAGE3_HASH_MISMATCH');
  }
  const geometryAuthority = result.theoreticalStagesUsed as TheoreticalStageAuthority | undefined;
  if (!geometryAuthority || !Number.isInteger(geometryAuthority.value) || geometryAuthority.value < 1
    || ((activeV130 || activeV140 || activeV150)
      && (geometryAuthority.provenance !== 'STAGE3_GEOMETRY_DESIGN_NT'
        || geometryAuthority.value !== STAGE3_GEOMETRY_DESIGN_NT
        || geometryAuthority.stage3GeometryDesignNt !== STAGE3_GEOMETRY_DESIGN_NT))
    || (historicalV120
      && !['STAGE_2_CALCULATED_NT', 'PRE_PILOT_DESIGN_DEFAULT'].includes(geometryAuthority.provenance))) {
    throw new Error('JOB_A_DEPENDENCY_BLOCKED:INVALID_THEORETICAL_STAGE_AUTHORITY');
  }
  // Stage 4 Job-A keeps its scientific authority on the actual accepted
  // Stage-2 value.  It must never consume the fixed Stage-3 geometry value
  // when Stage 2 calculated 4, 7, or 10 stages.
  const stage2Authority: TheoreticalStageAuthority = historicalV120
    ? geometryAuthority
    : Number.isInteger(geometryAuthority.stage2AcceptedPredictiveNt)
      && (geometryAuthority.stage2AcceptedPredictiveNt as number) > 0
      && geometryAuthority.stage2AcceptedPredictiveNtProvenance === 'STAGE_2_CALCULATED_NT'
      ? {
        value: geometryAuthority.stage2AcceptedPredictiveNt as number,
        provenance: 'STAGE_2_CALCULATED_NT',
        label: geometryAuthority.stage2AcceptedPredictiveNtLabel ?? 'STAGE-2 ACCEPTED PREDICTIVE N_T',
        stage2JobId: geometryAuthority.stage2JobId,
        stage2ResultHash: geometryAuthority.stage2ResultHash,
      }
      : {
        value: STAGE3_GEOMETRY_DESIGN_NT,
        provenance: 'PRE_PILOT_DESIGN_DEFAULT',
        label: 'STAGE-2 ACCEPTED PREDICTIVE N_T UNAVAILABLE (Job-A pre-pilot default only)',
        stage2JobId: null,
        stage2ResultHash: null,
      };
  let verifiedStage2: Awaited<ReturnType<
    typeof import('./ecr-pre-pilot/predictive-nt-job-service')['loadValidatedCompletedSevenComponentNtForStage4']
  >> | null = null;
  if (stage2Authority.provenance === 'STAGE_2_CALCULATED_NT') {
    if (!stage2Authority.stage2JobId || !stage2Authority.stage2ResultHash) {
      throw new Error('JOB_A_DEPENDENCY_BLOCKED:INVALID_CALCULATED_NT_LINEAGE');
    }
    try {
      const { loadValidatedCompletedSevenComponentNtForStage4 } = await import(
        './ecr-pre-pilot/predictive-nt-job-service'
      );
      verifiedStage2 = await loadValidatedCompletedSevenComponentNtForStage4(
        stage2Authority.stage2JobId, userId, designId,
      );
    } catch {
      throw new Error('JOB_A_DEPENDENCY_BLOCKED:INVALID_CALCULATED_NT_LINEAGE');
    }
    if (verifiedStage2.resultSnapshotHash !== stage2Authority.stage2ResultHash) {
      throw new Error('JOB_A_DEPENDENCY_BLOCKED:STAGE2_STAGE3_HASH_MISMATCH');
    }
  } else if (stage2Authority.value !== PRE_PILOT_DEFAULT_THEORETICAL_STAGES) {
    throw new Error('JOB_A_DEPENDENCY_BLOCKED:DEFAULT_NT_MUST_EQUAL_7');
  }
  const eligible = (result.hydraulicRpmEnvelope as any[] ?? [])
    .map((trial, ordinal) => ({ trial, ordinal }))
    .filter(({ trial }) => trial.status === 'CALCULATED_IN_RANGE'
      && trial.operatingHydraulics?.status === 'OPERATING_HOLDUP_CALCULATED')
    .sort((a, b) => a.trial.columnDiameterM - b.trial.columnDiameterM
      || a.trial.rpm - b.trial.rpm || a.ordinal - b.ordinal);
  if (!eligible.length) {
    throw new Error('JOB_A_DEPENDENCY_BLOCKED:NO_CALCULATED_IN_RANGE_STAGE3_TRIAL');
  }
  const { trial, ordinal } = eligible[0];
  const basis = result.processBasis;
  const rrboWeights = [
    stage1.stage1.saturatesWt, stage1.stage1.monoAromaticsWt,
    stage1.stage1.diAromaticsWt, stage1.stage1.polyAromaticsWt,
    stage1.stage1.polarAromaticsWt, stage1.stage1.nmpInFeedWt, 0,
  ];
  const solventWeights = [0, 0, 0, 0, 0, stage1.stage1.nmpPurityWt, stage1.stage1.nmpWaterWt];
  const rrbo = {
    densityKgM3: basis.rrboFeed.densityKgM3,
    dynamicViscosityPaS: basis.rrboFeed.dynamicViscosityPaS,
    moleFractions: jobAMoleFractions(rrboWeights),
  };
  const solvent = {
    densityKgM3: basis.wetSolventPhase.densityKgM3,
    dynamicViscosityPaS: basis.wetSolventPhase.dynamicViscosityPaS,
    moleFractions: jobAMoleFractions(solventWeights),
  };
  const nmpContinuous = basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed';
  const { preflightSevenComponentStage4Adapter } = await import(
    './ecr-pre-pilot/stage4-seven-component-adapter'
  );
  const adapterPreflight = await preflightSevenComponentStage4Adapter({ timeoutMs: 120_000 });
  if (adapterPreflight.status !== 'PASS'
    || adapterPreflight.engineId !== JOB_A_STAGE2_ENGINE_ID
    || adapterPreflight.engineVersion !== JOB_A_STAGE2_ENGINE_VERSION
    || JSON.stringify(adapterPreflight.componentOrder) !== JSON.stringify(JOB_A_COMPONENT_ORDER)
    || !/^[a-f0-9]{64}$/.test(adapterPreflight.engineHash)
    || !/^[a-f0-9]{64}$/.test(adapterPreflight.resultHash)) {
    throw new Error('JOB_A_DEPENDENCY_BLOCKED:7C_1_5_ADAPTER_PREFLIGHT_REQUIRED');
  }
  return evaluateJobA({
    stage1SnapshotHash: stage1.immutableHash,
    theoreticalStages: stage2Authority.value,
    theoreticalStageProvenance: stage2Authority.provenance,
    stage2JobId: verifiedStage2?.jobId ?? null,
    stage2ResultHash: verifiedStage2?.resultSnapshotHash ?? null,
    stage2EngineHash: adapterPreflight.engineHash,
    thermodynamicAdapterPreflightHash: adapterPreflight.resultHash,
    stage3RunId: stage3.id,
    stage3ImmutableHash: stage3.immutableHash,
    stage3ImplementationHash: result.engine.implementationHash,
    selectedTrialId: `rpm:${trial.rpm}:diameterM:${trial.columnDiameterM}`,
    selectedTrialOrdinal: ordinal,
    temperatureK: basis.temperatureK,
    interfacialTensionNM: basis.interfacialTensionNM,
    d32M: trial.d32M,
    slipVelocityMS: trial.operatingHydraulics.operatingSwarmVelocityMS,
    continuous: nmpContinuous ? solvent : rrbo,
    dispersed: nmpContinuous ? rrbo : solvent,
  });
}

/**
 * Job B is a server-owned local diagnostic. It consumes the already governed
 * Job-A coefficients and the exact Stage-3 trial selected by Job A, then runs
 * a simultaneous interface solve using separate Stage-2 incoming boundaries.
 * Stage-3 holdup enters interfacial area only, never thermodynamic composition.
 * It deliberately does not size a column.
 */
export async function evaluateEcrPrePilotJobB(userId: number, designId: number) {
  const jobA = await evaluateEcrPrePilotJobA(userId, designId);
  const stage3 = await getKuhniGeometryResolverRuns(userId, designId, true, true);
  assertJobBStage3ParentMatchesJobA(jobA, stage3);
  const envelope = (stage3.result as any)?.hydraulicRpmEnvelope as any[] ?? [];
  const trial = envelope.find((candidate, ordinal) =>
    `rpm:${candidate.rpm}:diameterM:${candidate.columnDiameterM}`
      === jobA.dependencies.selectedTrialId
    && ordinal === jobA.dependencies.selectedTrialOrdinal);
  if (!trial || trial.operatingHydraulics?.status !== 'OPERATING_HOLDUP_CALCULATED'
    || trial.d32M !== jobA.localHydraulics.d32M) {
    throw new Error('JOB_B_DEPENDENCY_BLOCKED:FROZEN_STAGE3_TRIAL_MISMATCH');
  }
  const operatingHoldup = trial.operatingHydraulics.operatingHoldup;
  return evaluateJobBSimultaneous(userId, designId, jobA, operatingHoldup,
    (stage3.result as any).processBasis?.phaseConfiguration);
}

export function prepareJobCAxialLocalContactProfile(
  sourceContacts: readonly any[],
  axialLocalContactProfileComplete: boolean,
  nmpContinuous: boolean,
  stage2ResultSnapshotHash: string,
) {
  const targetCells = 7;
  const contacts = Array.isArray(sourceContacts) ? sourceContacts : [];
  const diagnosticContacts = contacts.map((contact, index) => ({
    contact,
    sourceRowIndex: Number.isInteger(contact?.sourceRowIndex)
      && Number(contact.sourceRowIndex) > 0
      ? Number(contact.sourceRowIndex)
      : index + 1,
  })).sort((left, right) => left.sourceRowIndex - right.sourceRowIndex);
  const requiredAxialPositions = Math.max(targetCells, contacts.length);
  const expectedStageFromFeedEndPositions = Array.from(
    { length: requiredAxialPositions },
    (_, index) => index + 1,
  );
  const recordedStageFromFeedEndPositions = diagnosticContacts.map(({ contact }) =>
    contact?.stageFromFeedEnd);
  const validRecordedPositions = recordedStageFromFeedEndPositions.filter(
    (position): position is number =>
      Number.isInteger(position) && position > 0,
  );
  const positionCounts = new Map<number, number>();
  for (const position of validRecordedPositions) {
    positionCounts.set(position, (positionCounts.get(position) ?? 0) + 1);
  }
  const duplicateStageFromFeedEndPositions = [...positionCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([position]) => position)
    .sort((a, b) => a - b);
  const expectedPositionSet = new Set(expectedStageFromFeedEndPositions);
  const recordedPositionSet = new Set(validRecordedPositions);
  const missingStageFromFeedEndPositions = expectedStageFromFeedEndPositions
    .filter(position => !recordedPositionSet.has(position));
  const unexpectedStageFromFeedEndPositions = [...recordedPositionSet]
    .filter(position => !expectedPositionSet.has(position))
    .sort((a, b) => a - b);
  const invalidStageFromFeedEndContactIndexes = diagnosticContacts
    .map(({ contact, sourceRowIndex }) =>
      Number.isInteger(contact?.stageFromFeedEnd) && Number(contact.stageFromFeedEnd) > 0
        ? null
        : sourceRowIndex)
    .filter((index): index is number => index !== null);
  const axialPositionsComplete = contacts.length >= targetCells
    && missingStageFromFeedEndPositions.length === 0
    && duplicateStageFromFeedEndPositions.length === 0
    && unexpectedStageFromFeedEndPositions.length === 0
    && invalidStageFromFeedEndContactIndexes.length === 0;
  if (!axialLocalContactProfileComplete
    || !Array.isArray(sourceContacts) || contacts.length < targetCells
    || !axialPositionsComplete) {
    throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:AXIAL_LOCAL_CONTACT_PROFILE_UNAVAILABLE', {
      requiredRecordedContacts: targetCells,
      recordedContacts: contacts.length,
      expectedStageFromFeedEndPositions,
      recordedStageFromFeedEndPositions,
      duplicateStageFromFeedEndPositions,
      missingStageFromFeedEndPositions,
      unexpectedStageFromFeedEndPositions,
      invalidStageFromFeedEndContactIndexes,
      repeatedOrInventedContactsPermitted: false,
      heightClaimed: false,
    });
  }
  const normalizedSeven = (value: unknown) => Array.isArray(value) && value.length === 7
    && value.every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0)
    && Math.abs(value.reduce((sum, item) => sum + item, 0) - 1) <= 1e-10;
  const orderedContacts = [...contacts].sort((left, right) =>
    left.stageFromFeedEnd - right.stageFromFeedEnd);
  const ascendingStage2Bins = Array.from({ length: targetCells }, (_, index) => {
    const first = Math.floor(index * orderedContacts.length / targetCells);
    const exclusiveLast = Math.floor((index + 1) * orderedContacts.length / targetCells);
    return orderedContacts.slice(first, Math.max(first + 1, exclusiveLast));
  });
  const workerOrderedBins = [...ascendingStage2Bins].reverse();
  const profile = workerOrderedBins.map((bin, index) => {
    const continuousRows = bin.map(contact =>
      nmpContinuous ? contact.extractIncoming.moleFractions
        : contact.raffinateIncoming.moleFractions);
    const dispersedRows = bin.map(contact =>
      nmpContinuous ? contact.raffinateIncoming.moleFractions
        : contact.extractIncoming.moleFractions);
    if (continuousRows.some(value => !normalizedSeven(value))
      || dispersedRows.some(value => !normalizedSeven(value))) {
      throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:AXIAL_LOCAL_CONTACT_PROFILE_INVALID', {
        numericalCell: index + 1,
      });
    }
    const average = (rows: number[][]) => JOB_C_COMPONENT_ORDER.map((_, component) =>
      rows.reduce((sum, row) => sum + row[component], 0) / rows.length);
    return {
      numericalCell: index + 1,
      x_bulk_continuous: average(continuousRows),
      x_bulk_dispersed: average(dispersedRows),
      provenance: {
        source: 'PINNED_STAGE2_RECORDED_LOCAL_CONTACTS_REBINNED_TO_FV_CELLS',
        sourceStageFromFeedEnd: bin.map(contact => contact.stageFromFeedEnd),
        propertyPaths: bin.map(contact => contact.propertyPath),
        stage2ResultSnapshotHash,
        mapping: 'STAGE2_FEED_END_ASCENDING_EQUAL_BINS_REVERSED_TO_CONTINUOUS_INLET_FV_ORDER_V1',
      },
    };
  });
  return { targetCells, profile };
}

/**
 * Body-free Job C evaluation. All physical and duty inputs are reloaded from
 * the authenticated design's verified Job A/B/Stage 1/Stage 3 lineage.
 */
export async function prepareEcrPrePilotJobC(
  userId: number,
  designId: number,
  diagnosticMode: typeof JOB_C_TEMPORARY_DIAGNOSTIC_MODE
    | typeof JOB_C_WORKFLOW_TEST_ONLY_MODE | null = null,
) {
  const jobCArtifacts = currentJobCArtifactHashes();
  const jobA = await evaluateEcrPrePilotJobA(userId, designId);
  const jobB = await evaluateEcrPrePilotJobB(userId, designId);
  let jobBPreflight: Record<string, any>;
  try {
    jobBPreflight = await preflightSevenComponentTwoFilmInterface({ timeoutMs: 120_000 });
  } catch {
    throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:JOB_B_RUNTIME_PREFLIGHT_FAILED');
  }
  if (jobBPreflight.status !== 'PASS'
    || jobBPreflight.engineHash !== jobA.dependencies.stage2EngineHash
    || !/^[a-f0-9]{64}$/.test(jobBPreflight.jobBInterfaceArtifactSha256 ?? '')
    || !/^[a-f0-9]{64}$/.test(jobBPreflight.workerSha256 ?? '')) {
    throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:JOB_B_RUNTIME_PIN_NOT_ACCEPTED', {
      status: jobBPreflight.status ?? null,
      engineHash: jobBPreflight.engineHash ?? null,
      jobBInterfaceArtifactSha256: jobBPreflight.jobBInterfaceArtifactSha256 ?? null,
      workerSha256: jobBPreflight.workerSha256 ?? null,
    });
  }
  if (jobB.dependencies?.jobAResultSha256 !== jobA.resultSha256
    || jobB.dependencies?.stage1SnapshotHash !== jobA.dependencies.stage1SnapshotHash
    || jobB.dependencies?.stage3ImmutableHash !== jobA.dependencies.stage3ImmutableHash) {
    throw new Error('JOB_C_DEPENDENCY_BLOCKED:JOB_A_B_LINEAGE_MISMATCH');
  }
  const interfaceResult = jobB.interfaceResult?.interface;
  if (!interfaceResult
    || !Array.isArray(interfaceResult.continuousComponentFluxMolM2S)
    || !Array.isArray(interfaceResult.dispersedComponentFluxMolM2S)) {
    throw new Error('JOB_C_DEPENDENCY_BLOCKED:SIMULTANEOUS_JOB_B_REQUIRED');
  }
  for (let index = 0; index < JOB_C_COMPONENT_ORDER.length; index++) {
    const continuous = interfaceResult.continuousComponentFluxMolM2S[index];
    const dispersed = interfaceResult.dispersedComponentFluxMolM2S[index];
    const scale = Math.max(Math.abs(continuous), Math.abs(dispersed), 1e-12);
    if (!Number.isFinite(continuous) || !Number.isFinite(dispersed)
      || (Math.abs(continuous - dispersed) > 1e-12
        && Math.abs(continuous - dispersed) / scale > 1e-8)) {
      throw new Error(`JOB_C_DEPENDENCY_BLOCKED:JOB_B_LOCAL_FILMS_DISAGREE:${JOB_C_COMPONENT_ORDER[index]}`);
    }
  }
  const found = await pool.query<{ input_data: unknown }>(
    `SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2`,
    [designId, userId],
  );
  if (!found.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const stage1 = validateStage1Snapshot(found.rows[0].input_data);
  if (stage1.immutableHash !== jobA.dependencies.stage1SnapshotHash) {
    throw new Error('JOB_C_DEPENDENCY_BLOCKED:STAGE1_CHANGED');
  }
  const stage3 = await getKuhniGeometryResolverRuns(userId, designId, true, true);
  assertJobBStage3ParentMatchesJobA(jobA, stage3);
  const envelope = (stage3!.result as any).hydraulicRpmEnvelope as any[];
  const trial = envelope.find((candidate, ordinal) =>
    `rpm:${candidate.rpm}:diameterM:${candidate.columnDiameterM}`
      === jobA.dependencies.selectedTrialId
    && ordinal === jobA.dependencies.selectedTrialOrdinal);
  if (!trial || trial.d32M !== jobA.localHydraulics.d32M
    || trial.operatingHydraulics?.operatingHoldup !== jobB.frozenLocalHydraulics?.operatingHoldup) {
    throw new Error('JOB_C_DEPENDENCY_BLOCKED:STAGE3_SELECTED_TRIAL_MISMATCH');
  }
  const audit = jobB.inputAudit;
  const sourceProvenance = audit.stage2Provenance;
  const globalBoundary = await loadJobCGlobalBoundaryState(
    userId,
    designId,
    jobA.dependencies.theoreticalStages,
    {
      stage2JobId: sourceProvenance.stage2JobId,
      resultSnapshotHash: sourceProvenance.resultSnapshotHash,
      engineHash: sourceProvenance.engineHash,
      modelHash: sourceProvenance.modelHash,
      stage1ImmutableHash: sourceProvenance.stage1ImmutableHash,
      sourceStageCount: sourceProvenance.sourceStageCount,
    },
    {
      query: pool.query.bind(pool),
      currentEngineHash: () => jobA.dependencies.stage2EngineHash,
    },
  );
  const processBasis = (stage3!.result as any)?.processBasis;
  const rrbo = processBasis?.rrboFeed;
  const solvent = processBasis?.wetSolventPhase;
  const composition = processBasis?.composition;
  if (processBasis?.stage1SnapshotHash !== stage1.immutableHash
    || !rrbo || !solvent || !composition?.rrboFeedWt || !composition?.wetSolventWt
    || rrbo.conversion !== 'L/h * 1e-3 m3/L / 3600 s/h'
    || solvent.conversion !== '(RRBO m3/s * RRBO kg/m3 * S/O) / wet-solvent kg/m3') {
    throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:INLET_FLOW_TIME_BASIS_NOT_GOVERNED', {
      required: 'Exact frozen Stage-3 processBasis volumetric-flow, density, composition, conversion, and Stage-1 hash authorities',
      stage3ProcessBasisPresent: Boolean(processBasis),
      processBasisStage1SnapshotHash: processBasis?.stage1SnapshotHash ?? null,
    });
  }
  const finitePositive = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (![rrbo.flowM3S, rrbo.densityKgM3, solvent.flowM3S, solvent.densityKgM3,
    solvent.solventOilMassRatio].every(finitePositive)) {
    throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:INVALID_STAGE3_INLET_FLOW_AUTHORITY');
  }
  // Exact 7C-1.5 stream-basis MW vector. MONO's engine value (120.194)
  // intentionally remains distinct from Job A's transport-data display value.
  const molecularWeights = [
    170.3348, 120.194, 142.1971, 202.2506, 405.58, 99.1311, 18.01528,
  ];
  const molecularWeightProvenance = {
    componentOrder: [...JOB_C_COMPONENT_ORDER],
    valuesGmol: molecularWeights,
    identities: JOB_C_COMPONENT_ORDER.map(component => ({
      component, identity: JOB_A_MOLECULAR_DATA[component].identity,
      cas: JOB_A_MOLECULAR_DATA[component].cas,
    })),
    authority: 'FROZEN_7C_1_5_STREAM_BASIS_REPRESENTATIVE_MOLECULAR_IDENTITIES',
  };
  const derive = (identity: string, flowM3S: number, densityKgM3: number,
    weights: number[]) => {
    if (weights.length !== 7 || weights.some(value => !Number.isFinite(value) || value < 0)) {
      throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:INVALID_STAGE3_INLET_COMPOSITION', { identity });
    }
    const weightTotalPct = weights.reduce((sum, value) => sum + value, 0);
    if (Math.abs(weightTotalPct - 100) > 1e-10) {
      throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:STAGE3_INLET_MASS_FRACTION_CLOSURE_FAILED',
        { identity, weightTotalPct });
    }
    const massFlowKgS = flowM3S * densityKgM3;
    const componentMassFlowKgS = weights.map(weight => massFlowKgS * weight / 100);
    const componentMolarFlowMolS = componentMassFlowKgS.map((mass, index) =>
      mass / (molecularWeights[index] / 1000));
    const totalMolarFlowMolS = componentMolarFlowMolS.reduce((sum, value) => sum + value, 0);
    const moleFractions = componentMolarFlowMolS.map(value => value / totalMolarFlowMolS);
    const massClosureResidualKgS = componentMassFlowKgS.reduce((sum, value) => sum + value, 0)
      - massFlowKgS;
    if (!finitePositive(massFlowKgS) || !finitePositive(totalMolarFlowMolS)
      || componentMolarFlowMolS.some(value => !Number.isFinite(value) || value < 0)
      || Math.abs(massClosureResidualKgS) > 1e-12 * Math.max(1, massFlowKgS)) {
      throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:STAGE3_INLET_FLOW_CONVERSION_FAILED',
        { identity, massClosureResidualKgS });
    }
    return {
      identity, flowM3S, densityKgM3, massFlowKgS, weightsPct: weights,
      componentMassFlowKgS, componentMolarFlowMolS, totalMolarFlowMolS,
      moleFractions, weightTotalPct, massClosureResidualKgS,
      equations: {
        phaseMassFlow: 'massFlowKgS = flowM3S * densityKgM3',
        componentMassFlow: 'componentMassFlowKgS_i = massFlowKgS * massFraction_i',
        componentMolarFlow: 'componentMolarFlowMolS_i = componentMassFlowKgS_i / molecularWeightKgMol_i',
      },
    };
  };
  const rrboDerived = derive('RRBO_FEED', rrbo.flowM3S, rrbo.densityKgM3, [
    composition.rrboFeedWt.saturates, composition.rrboFeedWt.monoAromatics,
    composition.rrboFeedWt.diAromatics, composition.rrboFeedWt.polyAromatics,
    composition.rrboFeedWt.polarAromatics, composition.rrboFeedWt.nmp, 0,
  ]);
  const solventDerived = derive('WET_NMP_SOLVENT_PHASE', solvent.flowM3S,
    solvent.densityKgM3, [0, 0, 0, 0, 0,
      composition.wetSolventWt.nmp, composition.wetSolventWt.water]);
  const solventRatioClosureResidual = solventDerived.massFlowKgS / rrboDerived.massFlowKgS
    - solvent.solventOilMassRatio;
  if (Math.abs(solventRatioClosureResidual) > 1e-10) {
    throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:STAGE3_SOLVENT_RATIO_CLOSURE_FAILED',
      { solventRatioClosureResidual });
  }
  const nmpContinuous = processBasis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed';
  if (!nmpContinuous
    && processBasis.phaseConfiguration !== 'rrbo-continuous-nmp-dispersed') {
    throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:INVALID_STAGE3_PHASE_CONFIGURATION');
  }
  const continuousDerived = nmpContinuous ? solventDerived : rrboDerived;
  const dispersedDerived = nmpContinuous ? rrboDerived : solventDerived;
  const continuousGlobalBoundary = nmpContinuous
    ? globalBoundary.freshWetSolvent : globalBoundary.oilFeed;
  const dispersedGlobalBoundary = nmpContinuous
    ? globalBoundary.oilFeed : globalBoundary.freshWetSolvent;
  const flowConversionAudit = {
    authority: 'FROZEN_STAGE3_PROCESS_BASIS_CONVERTED_TO_COMPONENT_MOLAR_FLOW_RATE',
    stage3ProcessBasisHash: jobCResultHash(processBasis),
    molecularWeightProvenance,
    molecularWeightProvenanceSha256: jobCResultHash(molecularWeightProvenance),
    rrbo: rrboDerived, wetSolvent: solventDerived,
    phaseConfiguration: processBasis.phaseConfiguration,
    continuousPhysicalStream: continuousDerived.identity,
    dispersedPhysicalStream: dispersedDerived.identity,
    globalColumnBoundaryProvenance: globalBoundary.provenance,
    globalColumnBoundaries: {
      continuous: continuousGlobalBoundary,
      dispersed: dispersedGlobalBoundary,
    },
    jobBLocalInterfaceStateProvenance: {
      qualification: 'LOCAL_FEED_END_BULKS_NOT_GLOBAL_COLUMN_INLETS',
      stage2Provenance: audit.stage2Provenance,
      continuous: audit.bulkContinuousProvenance,
      dispersed: audit.bulkDispersedProvenance,
    },
    solventRatioClosureResidual,
    stage2ComponentMolesUsedAsMolarFlowRate: false,
  };
  const maximumBoundaryMoleFractionResidual = Math.max(
    ...continuousDerived.moleFractions.map((value, index) =>
      Math.abs(value - continuousGlobalBoundary.stream.moleFractions[index])),
    ...dispersedDerived.moleFractions.map((value, index) =>
      Math.abs(value - dispersedGlobalBoundary.stream.moleFractions[index])),
  );
  if (!Number.isFinite(maximumBoundaryMoleFractionResidual)
    || maximumBoundaryMoleFractionResidual > 1e-10) {
    throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:STAGE3_STAGE2_INLET_COMPOSITION_MISMATCH', {
      maximumBoundaryMoleFractionResidual,
      tolerance: 1e-10,
      inputAudit: flowConversionAudit,
    });
  }
  const continuousFeedMolS = [...continuousDerived.componentMolarFlowMolS];
  const dispersedFeedMolS = [...dispersedDerived.componentMolarFlowMolS];
  const continuousGlobalCtMolM3 =
    continuousDerived.totalMolarFlowMolS / continuousDerived.flowM3S;
  const dispersedGlobalCtMolM3 =
    dispersedDerived.totalMolarFlowMolS / dispersedDerived.flowM3S;
  const jobCInputAudit = {
    ...flowConversionAudit,
    globalBoundaryStateSha256: jobCResultHash(globalBoundary),
    globalBoundaryProvenanceSha256: jobCResultHash(globalBoundary.provenance),
    correctedStage2BoundaryMoleFractionTolerance: 1e-10,
    maximumBoundaryMoleFractionResidual,
    stage2ComponentMolesUsedAsMolarFlowRate: false,
    fixedTotalConcentrationClosure: {
      continuousMolM3: continuousGlobalCtMolM3,
      dispersedMolM3: dispersedGlobalCtMolM3,
      source: 'FROZEN_STAGE3_GLOBAL_INLET_TOTAL_MOLAR_FLOW_DIVIDED_BY_VOLUMETRIC_FLOW',
      localVolumeFlowEquation: 'localPhaseVolumeFlowM3S = localTotalMolarFlowMolS / fixedCtMolM3',
      mixtureDensityRecomputed: false,
      qualification: 'PRELIMINARY_FIXED_CT_NO_LOCAL_MIXTURE_DENSITY_CLOSURE',
    },
  };
  const request = audit.exactInterfaceEquilibriumRequest;
  const normalizedSeven = (value: unknown) => Array.isArray(value) && value.length === 7
    && value.every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0)
    && Math.abs(value.reduce((sum, item) => sum + item, 0) - 1) <= 1e-10;
  if (request.phase_config !== processBasis.phaseConfiguration
    || JSON.stringify(request.componentOrder) !== JSON.stringify(JOB_C_COMPONENT_ORDER)
    || JSON.stringify(request.kc) !== JSON.stringify(jobB.inputAudit.kc)
    || JSON.stringify(request.kd) !== JSON.stringify(jobB.inputAudit.kd)
    || !normalizedSeven(request.x_bulk_continuous)
    || !normalizedSeven(request.x_bulk_dispersed)
    || !finitePositive(request.CtC) || !finitePositive(request.CtD)) {
    throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:BOUNDARY_BRANCH_SOURCE_INVALID');
  }
  const boundaryBranchSource = {
    componentOrder: [...request.componentOrder],
    T: request.T,
    x_bulk_continuous: [...request.x_bulk_continuous],
    x_bulk_dispersed: [...request.x_bulk_dispersed],
    kc: [...request.kc], kd: [...request.kd],
    CtC: request.CtC, CtD: request.CtD, phase_config: request.phase_config,
    provenance: {
      qualification: 'RECORDED_STAGE2_FEED_END_LOCAL_CONTACT_STATE',
      stage2Provenance: audit.stage2Provenance,
      continuous: audit.bulkContinuousProvenance,
      dispersed: audit.bulkDispersedProvenance,
    },
  };
  const boundaryBranchQualificationRequest = {
    ...boundaryBranchSource,
    sourceStateSha256: jobCResultHash(boundaryBranchSource),
  };
  const sourceContacts = globalBoundary.axialLocalContacts;
  const { targetCells, profile: axialLocalContactProfile } =
    prepareJobCAxialLocalContactProfile(
      sourceContacts,
      globalBoundary.axialLocalContactProfileComplete,
      nmpContinuous,
      globalBoundary.provenance.resultSnapshotHash,
    );
  const axialLocalContactProfileAuthority = {
    qualification: 'GOVERNED_PINNED_STAGE2_AXIAL_LOCAL_CONTACT_PROFILE',
    componentOrder: [...JOB_C_COMPONENT_ORDER],
    phaseConfiguration: processBasis.phaseConfiguration,
    sourceStageCount: sourceContacts.length,
    targetNumericalCells: targetCells,
    mapping: 'STAGE2_FEED_END_ASCENDING_EQUAL_BINS_REVERSED_TO_CONTINUOUS_INLET_FV_ORDER_V1',
    stage2ResultSnapshotHash: globalBoundary.provenance.resultSnapshotHash,
  };
  const axialLocalContactProfileSha256 = jobCResultHash({
    authority: axialLocalContactProfileAuthority,
    profile: axialLocalContactProfile,
  });
  // Preserve the exact immutable Job-A correlation input with the Job-C
  // request.  Physical sizing may recalculate films for a different
  // hydraulically admissible candidate, but it may only replace this
  // candidate-dependent state; no current UI or Stage-1 values are read.
  const {
    d32M: _sourceD32M,
    slipVelocityMS: _sourceSlipVelocityMS,
    selectedTrialId: _sourceSelectedTrialId,
    selectedTrialOrdinal: _sourceSelectedTrialOrdinal,
    ...jobAFilmInput
  } = jobA.input as JobAEvaluationInput;
  const jobAFilmRecalculationBasis = {
    ...jobAFilmInput,
    sourceJobAResultSha256: jobA.resultSha256,
  };
  const workerRequest = {
    componentOrder: [...JOB_C_COMPONENT_ORDER],
    temperatureK: request.T,
    continuousFeedMolS,
    dispersedFeedMolS,
    continuousTotalConcentrationMolM3: continuousGlobalCtMolM3,
    dispersedTotalConcentrationMolM3: dispersedGlobalCtMolM3,
    kc: [...request.kc],
    kd: [...request.kd],
    phaseConfiguration: request.phase_config,
    compartments: targetCells,
    columnDiameterM: trial.columnDiameterM,
    rpm: trial.rpm,
    operatingHoldup: trial.operatingHydraulics.operatingHoldup,
    d32M: trial.d32M,
    minimumRecoveryPct: stage1.stage1.minimumRecoveryPct,
    boundaryBranchQualificationRequest,
    axialLocalContactProfile,
    axialLocalContactProfileAuthority,
    axialLocalContactProfileSha256,
    jobAFilmRecalculationBasis,
    ...(diagnosticMode ? { diagnosticMode } : {}),
  };
  const responseBasis = {
    schemaVersion: 'ECR_PRE_PILOT_JOB_C_V1' as const,
    labels: ['PRELIMINARY', 'PRE_PILOT_PREDICTIVE', 'NOT_PILOT_VALIDATED',
      'NOT_RELEASE_ELIGIBLE', 'NOT_FINAL_DESIGN'],
    ...(diagnosticMode ? {
      diagnosticMode: {
        ...diagnosticMode,
        normalScientificAcceptance: 'BLOCKED_PARTIAL_TRANSFER_ENDPOINT_NEVER_ACCEPTED_DESIGN',
      },
    } : {}),
    componentOrder: [...JOB_C_COMPONENT_ORDER],
    preliminarySensitivityBasis: JOB_C_PRELIMINARY_SENSITIVITY_BASIS,
    theoreticalCompartmentAuthority: {
      compartments: targetCells,
      source: 'FIXED_JOB_C_NUMERICAL_FV_DISCRETIZATION',
      stage2TheoreticalStages: jobA.dependencies.theoreticalStages,
      stage2TheoreticalStageSource: jobA.dependencies.theoreticalStageProvenance,
      fallbackValue: 7,
      fallbackUsed: false,
      qualification: 'NUMERICAL_FV_DISCRETIZATION_NOT_PHYSICAL_STAGE_COUNT',
    },
    target: {
      minimumRecoveryPct: stage1.stage1.minimumRecoveryPct,
      basis: 'NMP_FREE_RRBO_HYDROCARBON_MASS_SAT_MONO_DI_POLY_PA',
      aromaticsAndSulfurTargetsUsedInHeightSolve: false,
    },
    selectedStage3State: {
      runId: stage3!.id, immutableHash: stage3!.immutableHash,
      trialId: jobA.dependencies.selectedTrialId, columnDiameterM: trial.columnDiameterM,
      rpm: trial.rpm, d32M: trial.d32M,
      operatingHoldup: trial.operatingHydraulics.operatingHoldup,
      floodHoldup: trial.operatingHydraulics.floodHoldup,
      status: 'INPUT_STATE_ONLY_NOT_FINAL_RPM_SELECTION',
    },
    physicalSizingCandidateAuthority: {
      status: 'DEPENDENCY_BLOCKED',
      mechanicalCompartmentBasis: {
        status: 'UNSUPPORTED',
        reason: 'SUPPORTED_PHYSICAL_MECHANICAL_COMPARTMENT_SPACING_BASIS_REQUIRED',
        qualification: 'Stage-3 system-resolved compartment ratios are hydraulic geometry inputs, not an admitted physical hardware spacing basis.',
      },
      candidates: envelope.map((candidate, ordinal) => ({
        ordinal,
        trialId: `rpm:${candidate.rpm}:diameterM:${candidate.columnDiameterM}`,
        stage3ImmutableHash: stage3!.immutableHash,
        rpm: candidate.rpm,
        columnDiameterM: candidate.columnDiameterM,
        compartmentHeightM: candidate.compartmentHeightM,
        powerVolumeWM3: candidate.powerVolumeWM3,
        applicability: candidate.applicability ?? [],
        uncertainty: candidate.uncertainty ?? [],
        hydraulicStatus: candidate.status,
        operatingHydraulicsStatus: candidate.operatingHydraulics?.status ?? null,
        d32M: candidate.d32M ?? null,
        operatingHoldup: candidate.operatingHydraulics?.operatingHoldup ?? null,
        floodHoldup: candidate.operatingHydraulics?.floodHoldup ?? null,
        eligibleForPhysicalTransportTrial: candidate.status === 'CALCULATED_IN_RANGE'
          && candidate.operatingHydraulics?.status === 'OPERATING_HOLDUP_CALCULATED',
      })),
      finalSelection: null,
      qualification: 'CANDIDATE_EVIDENCE_ONLY_NO_PHYSICAL_HEIGHT_OR_EFFICIENCY_CLAIM',
    },
    dependencies: {
      stage1SnapshotHash: stage1.immutableHash,
      jobAResultSha256: jobA.resultSha256,
      jobBResultSha256: jobB.resultSha256,
      stage2BoundaryResultSha256: jobB.dependencies.stage2BoundaryResultSha256,
      globalBoundaryStateSha256: jobCResultHash(globalBoundary),
      globalBoundaryProvenanceSha256: jobCResultHash(globalBoundary.provenance),
      stage2EngineHash: jobA.dependencies.stage2EngineHash,
      jobBInterfaceArtifactSha256: jobBPreflight.jobBInterfaceArtifactSha256,
      jobBInterfaceWorkerSha256: jobBPreflight.workerSha256,
      stage3ImmutableHash: stage3!.immutableHash,
      boundaryBranchSourceStateSha256: boundaryBranchQualificationRequest.sourceStateSha256,
      jobCBoundaryInterfaceQualifierSha256: jobCArtifacts.boundaryQualifierHash,
      jobCBranchContinuationSha256: jobCArtifacts.branchContinuationHash,
      workerRequestSha256: jobCResultHash(workerRequest),
    },
    model: {
      flow: 'STEADY_STATE_COUNTERCURRENT_PER_COMPONENT',
      axialDispersion: 'FINITE_VOLUME_BACKMIXING',
      inletBoundary: 'DANCKWERTS_TYPE',
      outletBoundary: 'ZERO_GRADIENT',
      interphaseSource: 'EQUAL_AND_OPPOSITE_FROM_CONTINUOUS_FILM_NO_AVERAGING',
      localInterfaces: 'RECOMPUTED_FOR_CONVERGED_LOCAL_STATES',
      globalPartitionCoefficientUsed: false,
      efficiencyCalculated: false,
    },
    inputAudit: jobCInputAudit,
    boundaryBranchQualificationSource: boundaryBranchQualificationRequest,
    exclusions: {
      finalRpmSelected: false, jobDPerformed: false, releaseEligible: false,
      userEditableConstantsPersisted: false,
    },
  };
  return { workerRequest, responseBasis };
}

export async function executePreparedEcrPrePilotJobC(
  prepared: Awaited<ReturnType<typeof prepareEcrPrePilotJobC>>,
  options: Parameters<typeof runJobCWorker>[1] = {},
) {
  const workerResult = await runJobCWorker(prepared.workerRequest, options);
  const diagnosticMode = (prepared.responseBasis as any).diagnosticMode;
  const endpoint = workerResult?.diagnosticPartialEndpoint;
  const workflowTestOnly = diagnosticMode?.mode === JOB_C_WORKFLOW_TEST_ONLY_MODE.mode;
  if (workflowTestOnly) {
    try {
      if (workflowTestOnlyCompletionClaimed(workerResult?.status)) {
        validateJobCWorkflowTestOnlyWorkerResponse(workerResult);
      }
    } catch (error: any) {
      if (error instanceof JobCError) {
        throw new JobCError(error.message, {
          ...error.details,
          workerResult,
        });
      }
      throw error;
    }
  } else if (workerResult?.status === 'CALCULATED_WORKFLOW_TEST_ONLY_JOB_C') {
    throw new JobCError('JOB_C_WORKFLOW_TEST_ONLY_RESPONSE_INVALID', {
      failures: ['UNEXPECTED_WORKFLOW_TEST_ONLY_RESPONSE'],
      workerResult,
    });
  }
  const diagnosticDownstreamSizing = diagnosticMode
    ? workflowTestOnly
      ? endpoint?.status === 'WORKFLOW_TEST_ONLY_REAL_STATE_EVALUATED'
        ? {
          status: 'WORKFLOW_TEST_ONLY_NOT_ACCEPTED_DESIGN',
          warning: 'WORKFLOW TEST ONLY — NOT AN ACCEPTED DESIGN. One finite, bounded, strictly positive real state was evaluated at the capped partial-transfer lambda. Scientific residual gates are reported unchanged and may fail; no downstream optimization was performed.',
          partialTransferLambda: endpoint.lambda,
          criterionSatisfyingDiagnosticHeight: false,
          scientificCompleted: false,
          scientificAccepted: false,
          workflowTestOnly: true,
          fields: {
            d32M: { value: prepared.workerRequest.d32M, provenance: 'FROZEN_STAGE3_SELECTED_TRIAL_D32_INPUT' },
            holdup: { value: prepared.workerRequest.operatingHoldup, provenance: 'FROZEN_STAGE3_SELECTED_TRIAL_OPERATING_HOLDUP_INPUT' },
            flooding: { value: (prepared.responseBasis as any).selectedStage3State?.floodHoldup ?? null,
              provenance: 'FROZEN_STAGE3_SELECTED_TRIAL_FLOOD_HOLDUP',
              unavailableReason: (prepared.responseBasis as any).selectedStage3State?.floodHoldup == null
                ? 'STAGE3_SELECTED_TRIAL_HAS_NO_SUPPORTED_FLOOD_HOLDUP_CALCULATION' : null },
            rpm: { value: prepared.workerRequest.rpm, provenance: 'FROZEN_STAGE3_SELECTED_TRIAL_INPUT_NOT_OPTIMIZED' },
            diameterM: { value: prepared.workerRequest.columnDiameterM, provenance: 'FROZEN_STAGE3_SELECTED_TRIAL_INPUT_NOT_OPTIMIZED' },
            heightM: { value: endpoint.heightTrialM, provenance: 'WORKFLOW_TEST_ONLY_FIXED_HEIGHT_TRIAL_NOT_RECOVERY_CRITERION_SATISFYING' },
            compartments: { value: prepared.workerRequest.compartments, provenance: 'FIXED_JOB_C_NUMERICAL_FV_DISCRETIZATION_NOT_PHYSICAL_STAGE_COUNT' },
          },
          scientificGateDecision: endpoint.gateDecision,
          stateSha256: endpoint.stateSha256,
        }
        : {
          status: 'UNAVAILABLE_WORKFLOW_TEST_PREREQUISITES_NOT_MET',
          warning: 'WORKFLOW TEST ONLY did not produce a finite, bounded, strictly positive real state. No downstream values are reported.',
          unavailableReason: workerResult?.error ?? 'WORKFLOW_TEST_ONLY_STATE_NOT_AVAILABLE',
          scientificCompleted: false,
          workflowTestOnly: true,
        }
      : endpoint?.status === 'QUALIFIED_PARTIAL_TRANSFER_ENDPOINT'
      ? {
        status: 'PROVISIONAL_DIAGNOSTIC_PARTIAL_TRANSFER',
        warning: 'Partial-transfer diagnostic only. This is a height trial, not a criterion-satisfying height or an accepted design.',
        partialTransferLambda: endpoint.lambda,
        criterionSatisfyingDiagnosticHeight: false,
        fields: {
          d32M: { value: prepared.workerRequest.d32M, provenance: 'FROZEN_STAGE3_SELECTED_TRIAL_D32_INPUT' },
          holdup: { value: prepared.workerRequest.operatingHoldup, provenance: 'FROZEN_STAGE3_SELECTED_TRIAL_OPERATING_HOLDUP_INPUT' },
          flooding: { value: (prepared.responseBasis as any).selectedStage3State?.floodHoldup ?? null,
            provenance: 'FROZEN_STAGE3_SELECTED_TRIAL_FLOOD_HOLDUP',
            unavailableReason: (prepared.responseBasis as any).selectedStage3State?.floodHoldup == null
              ? 'STAGE3_SELECTED_TRIAL_HAS_NO_SUPPORTED_FLOOD_HOLDUP_CALCULATION' : null },
          rpm: { value: prepared.workerRequest.rpm, provenance: 'FROZEN_STAGE3_SELECTED_TRIAL_INPUT_NOT_OPTIMIZED' },
          diameterM: { value: prepared.workerRequest.columnDiameterM, provenance: 'FROZEN_STAGE3_SELECTED_TRIAL_INPUT_NOT_OPTIMIZED' },
          heightM: { value: endpoint.heightTrialM, provenance: 'JOB_C_PARTIAL_TRANSFER_HEIGHT_TRIAL_NOT_RECOVERY_CRITERION_SATISFYING' },
          compartments: { value: prepared.workerRequest.compartments, provenance: 'FIXED_JOB_C_NUMERICAL_FV_DISCRETIZATION_NOT_PHYSICAL_STAGE_COUNT' },
        },
      }
      : {
        status: 'UNAVAILABLE_ENDPOINT_NOT_QUALIFIED',
        warning: 'No downstream diagnostic values are reported because the partial-transfer endpoint did not qualify.',
        unavailableReason: workerResult?.error ?? 'PARTIAL_TRANSFER_ENDPOINT_NOT_AVAILABLE',
      }
    : undefined;
  const body = {
    ...prepared.responseBasis,
    status: workerResult.status,
    workerResult,
    ...(diagnosticDownstreamSizing ? { diagnosticDownstreamSizing } : {}),
  };
  // This assessment has no worker side effect.  In particular it does not
  // enqueue or rerun Job C: it only exposes whether this immutable result can
  // be handed to the separately admitted physical-height transport kernel.
  const physicalSizing = summarizeJobCPhysicalSizingDependency(body);
  const result = { ...body, physicalSizing };
  return { ...result, resultSha256: jobCResultHash(result) };
}

export async function evaluateEcrPrePilotJobC(userId: number, designId: number) {
  return executePreparedEcrPrePilotJobC(await prepareEcrPrePilotJobC(userId, designId));
}

type CurrentPhysicalSizingAuthority = {
  stage1: EcrPrePilotStage1Snapshot;
  acceptedParent: { id: string; result_hash: string } | null;
};

/**
 * Resolve the live authorities at the point an immutable sizing child is
 * about to be exposed.  This intentionally mirrors the selection boundary
 * used by the sizing route rather than trusting an earlier read.
 */
async function getCurrentPhysicalSizingAuthority(
  userId: number,
  designId: number,
): Promise<CurrentPhysicalSizingAuthority> {
  const design = await pool.query<{ input_data: unknown }>(
    `SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2`,
    [designId, userId],
  );
  if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const stage1 = validateStage1Snapshot(design.rows[0].input_data);
  const candidates = await pool.query(
    `SELECT id,result_snapshot,result_hash
       FROM ecr_pre_pilot_job_c_jobs
      WHERE created_by=$1 AND design_id=$2
        AND status='completed' AND completed_at IS NOT NULL
        AND result_snapshot IS NOT NULL
        AND result_hash ~ '^[a-f0-9]{64}$'
        AND result_snapshot->>'status'='CALCULATED_PRELIMINARY_JOB_C'
        AND result_snapshot#>>'{workerResult,status}'='CALCULATED_PRELIMINARY_JOB_C'
      ORDER BY completed_at DESC,created_at DESC,id DESC`,
    [userId, designId],
  );
  const acceptedParent = candidates.rows.find((candidate: any) =>
    jobCScientificResultHash(candidate.result_snapshot) === candidate.result_hash
    && candidate.result_snapshot?.workerResult?.diagnosticOnly !== true
    && candidate.result_snapshot?.workerResult?.workflowTestOnly !== true
    && assessAcceptedJobCForPhysicalSizing(candidate.result_snapshot).accepted) ?? null;
  return { stage1, acceptedParent };
}

function physicalSizingStaleBlock(input: {
  reason: string;
  requiredDependency: string;
  sourceStage1SnapshotHash: string | null;
  actualStage1SnapshotHash: string;
  parentJobId?: string;
  parentResultHash?: string;
  details?: Record<string, unknown>;
}) {
  return {
    ...(input.parentJobId ? { parentJobId: input.parentJobId } : {}),
    ...(input.parentResultHash ? { parentResultHash: input.parentResultHash } : {}),
    status: 'DEPENDENCY_BLOCKED',
    staleStatus: 'STALE',
    classification: 'PRELIMINARY_CLASSIFICATION_PRESERVED_NOT_RELEASE_ELIGIBLE',
    reasons: [input.reason],
    requiredDependencies: [input.requiredDependency],
    sourceStage1SnapshotHash: input.sourceStage1SnapshotHash,
    actualStage1SnapshotHash: input.actualStage1SnapshotHash,
    ...input.details,
  };
}

/**
 * Explicitly starts physical sizing from the persisted completed Job-C queue
 * record.  It never queues, resumes, or repeats normal Job C.  Mechanical
 * spacing evidence is not yet persisted by this product, so the adapter
 * correctly returns its specific dependency block after it has verified the
 * queue-owned Job-C result and request lineage.
 */
export async function evaluateCompletedJobCPhysicalSizing(
  userId: number,
  designId: number,
  completedJob: Record<string, any>,
) {
  // Do not accept a route/UI copy of a Job C response as authority.  The
  // supplied object is useful for selecting the parent, but the database row
  // is reloaded in the authenticated scope before a child result is written.
  const owned = await pool.query(
    `SELECT id, status, input_snapshot, result_snapshot, result_hash
       FROM ecr_pre_pilot_job_c_jobs
      WHERE id=$1 AND design_id=$2 AND created_by=$3`,
    [completedJob?.id, designId, userId],
  );
  const parent = owned.rows[0];
  if (!parent
    || parent.status !== 'completed'
    || parent.result_snapshot?.status !== 'CALCULATED_PRELIMINARY_JOB_C'
    || parent.result_snapshot?.workerResult?.status !== 'CALCULATED_PRELIMINARY_JOB_C'
    || typeof parent.result_hash !== 'string'
    || jobCScientificResultHash(parent.result_snapshot) !== parent.result_hash) {
    throw new Error('SERVICE_OWNED_COMPLETED_JOB_C_QUEUE_LINEAGE_REQUIRED');
  }
  const completed = {
    id: parent.id,
    status: parent.status,
    input: parent.input_snapshot,
    result: parent.result_snapshot,
    resultHash: parent.result_hash,
  };
  const workerRequest = completed.input?.prepared?.workerRequest;
  if (!workerRequest || typeof workerRequest !== 'object') {
    throw new Error('SERVICE_OWNED_COMPLETED_JOB_C_WORKER_REQUEST_REQUIRED');
  }
  const authority = completed.result?.physicalSizingCandidateAuthority;
  const mechanical = authority?.mechanicalCompartmentBasis;
  const mechanicalBasis = mechanical?.status === 'GOVERNED'
    && typeof mechanical.source === 'string'
    && typeof mechanical.hash === 'string'
    && mechanical.spacingRule === 'STAGE3_FROZEN_COMPARTMENT_HEIGHT_M'
    && Number.isFinite(mechanical.compartmentHeightM)
    ? mechanical : null;
  // The data model currently persists no governed mechanical drawing.  This
  // explicit result is retained as an immutable child assessment; it is not a
  // permission to infer hardware spacing from Stage-3 hydraulic geometry or
  // Job-C numerical cells.
  let processBasis: any = null;
  let hydraulicCandidates: any[] = [];
  const found = await pool.query<{ input_data: unknown }>(
    `SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2`,
    [designId, userId],
  );
  if (!found.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const stage1 = validateStage1Snapshot(found.rows[0].input_data);
  const acceptedStage1Hash = completed.result?.dependencies?.stage1SnapshotHash;
  let physicalSizing: any;
  if (stage1.immutableHash !== acceptedStage1Hash) {
    // Never construct a process basis from a changed Stage-1 input and attach
    // it to an older accepted Job C result.
    physicalSizing = {
      status: 'DEPENDENCY_BLOCKED',
      classification: 'PRELIMINARY_CLASSIFICATION_PRESERVED_NOT_RELEASE_ELIGIBLE',
      reasons: ['JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:STAGE1_SNAPSHOT_LINEAGE_MISMATCH'],
      requiredDependencies: ['ACCEPTED_JOB_C_STAGE1_SNAPSHOT_MATCHING_CURRENT_IMMUTABLE_STAGE1'],
      sourceStage1SnapshotHash: acceptedStage1Hash ?? null,
      actualStage1SnapshotHash: stage1.immutableHash,
    };
  } else if (mechanicalBasis) {
    processBasis = makeStage1HydrodynamicProcessBasis(stage1);
    // Use the immutable Stage-3 result pinned by the accepted parent, not a
    // later resolver run that may belong to a different Stage-1 snapshot.
    const stage3 = (await getKuhniGeometryResolverRuns(userId, designId, false, true))
      .find((run: any) => run.immutableHash === completed.result?.dependencies?.stage3ImmutableHash);
    if (!stage3) {
      throw new Error('JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:ACCEPTED_STAGE3_IMMUTABLE_RESULT_REQUIRED');
    }
    const envelope = (stage3?.result as any)?.hydraulicRpmEnvelope;
    if (!Array.isArray(envelope)) {
      throw new Error('JOB_C_PHYSICAL_SIZING_STAGE3_CANDIDATE_AUTHORITY_REQUIRED');
    }
    hydraulicCandidates = envelope
      .filter((candidate: any) => candidate?.status === 'CALCULATED_IN_RANGE'
        && candidate?.operatingHydraulics?.status === 'OPERATING_HOLDUP_CALCULATED')
      .map((candidate: any, ordinal: number) => ({
        candidate: {
          ...candidate, ordinal, trialId: `stage3:${ordinal}`,
          trialImmutableHash: stage3.immutableHash,
          hydraulicallyFeasible: true,
        },
        stage3Evidence: {
          columnDiameterM: candidate.columnDiameterM, rpm: candidate.rpm,
          compartmentHeightM: candidate.compartmentHeightM, d32M: candidate.d32M,
          operatingHoldup: candidate.operatingHydraulics.operatingHoldup,
          floodHoldup: candidate.operatingHydraulics.floodHoldup,
        },
      }));
  }
  if (!physicalSizing) {
    physicalSizing = await sizeAcceptedJobCWithWorkerTransport({
      jobCResult: completed.result,
      completedQueueJob: {
        status: completed.status,
        result: completed.result,
        resultHash: completed.resultHash,
        input: completed.input,
      } as any,
      workerRequest,
      mechanicalBasis,
      processBasis,
      hydraulicCandidates,
    });
  }
  // The transport solve can be long-running.  Re-read both live authorities
  // immediately before writing its child result so a Stage-1 edit or a newer
  // accepted Job-C parent cannot be persisted/returned as current geometry.
  const current = await getCurrentPhysicalSizingAuthority(userId, designId);
  if (current.stage1.immutableHash !== stage1.immutableHash) {
    return physicalSizingStaleBlock({
      parentJobId: parent.id,
      parentResultHash: parent.result_hash,
      reason: 'JOB_C_PHYSICAL_SIZING_RESULT_STALE:CURRENT_STAGE1_SNAPSHOT_CHANGED_DURING_EVALUATION',
      requiredDependency: 'CURRENT_IMMUTABLE_STAGE1_MUST_MATCH_EVALUATED_PHYSICAL_SIZING_SNAPSHOT',
      sourceStage1SnapshotHash: stage1.immutableHash,
      actualStage1SnapshotHash: current.stage1.immutableHash,
    });
  }
  if (!current.acceptedParent) {
    return physicalSizingStaleBlock({
      parentJobId: parent.id,
      parentResultHash: parent.result_hash,
      reason: 'JOB_C_PHYSICAL_SIZING_RESULT_STALE:CURRENT_ACCEPTED_PARENT_UNAVAILABLE_DURING_EVALUATION',
      requiredDependency: 'CURRENT_OWNED_ACCEPTED_JOB_C_PARENT_REQUIRED',
      sourceStage1SnapshotHash: stage1.immutableHash,
      actualStage1SnapshotHash: current.stage1.immutableHash,
    });
  }
  if (current.acceptedParent.id !== parent.id
    || current.acceptedParent.result_hash !== parent.result_hash) {
    return physicalSizingStaleBlock({
      parentJobId: parent.id,
      parentResultHash: parent.result_hash,
      reason: 'JOB_C_PHYSICAL_SIZING_RESULT_STALE:ACCEPTED_PARENT_SUPERSEDED_DURING_EVALUATION',
      requiredDependency: 'CURRENT_OWNED_ACCEPTED_JOB_C_PARENT_MUST_MATCH_EVALUATED_PHYSICAL_SIZING_PARENT',
      sourceStage1SnapshotHash: stage1.immutableHash,
      actualStage1SnapshotHash: current.stage1.immutableHash,
      details: {
        currentAcceptedParentJobId: current.acceptedParent.id,
        currentAcceptedParentResultHash: current.acceptedParent.result_hash,
      },
    });
  }
  await persistCompletedJobCPhysicalSizing({
    userId,
    designId,
    parentJobId: parent.id,
    parentResultHash: parent.result_hash,
    stage1Snapshot: stage1,
    processBasis,
    result: physicalSizing,
  });
  // Return only the same current-lineage representation served by GET, never
  // the raw solver/persistence payload.
  const currentRepresentation = await getLatestCompletedJobCPhysicalSizing(userId, designId);
  if (!currentRepresentation) {
    throw new Error('JOB_C_PHYSICAL_SIZING_PERSISTED_RESULT_NOT_FOUND');
  }
  return currentRepresentation;
}

type PersistedPhysicalSizingInput = {
  userId: number;
  designId: number;
  parentJobId: string;
  parentResultHash: string;
  stage1Snapshot: EcrPrePilotStage1Snapshot;
  processBasis: unknown;
  result: Record<string, any>;
};

/**
 * Append an immutable physical-sizing child result.  This follows the
 * snapshot/result-hash storage pattern used by persisted design results:
 * POST never mutates its Job-C parent, and GET is served from this child row.
 */
async function persistCompletedJobCPhysicalSizing(input: PersistedPhysicalSizingInput) {
  // PostgreSQL jsonb NOT NULL rejects SQL NULL (unlike JSON `null`).  A
  // missing governed mechanical basis intentionally does not create a
  // hydrodynamic process basis for transport; retain this explicit immutable
  // blocked-basis snapshot instead of silently storing a nullable authority.
  const persistedProcessBasis = input.processBasis ?? {
    status: 'DEPENDENCY_BLOCKED',
    reason: Array.isArray(input.result?.reasons) && input.result.reasons.length
      ? input.result.reasons[0]
      : 'JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:SUPPORTED_MECHANICAL_SPACING_BASIS_REQUIRED',
    qualification: 'NO_GOVERNED_MECHANICAL_BASIS_NO_TRANSPORT_PROCESS_BASIS_CONSTRUCTED',
  };
  const inputSnapshot = {
    schemaVersion: 'ECR_PRE_PILOT_JOB_C_PHYSICAL_SIZING_RESULT_V1',
    parentJobId: input.parentJobId,
    parentResultHash: input.parentResultHash,
    stage1SnapshotHash: input.stage1Snapshot.immutableHash,
    stage1Snapshot: input.stage1Snapshot,
    processBasis: persistedProcessBasis,
  };
  const resultHash = jobCResultHash(input.result);
  const immutableHash = jobCResultHash({ inputSnapshot, result: input.result });
  const saved = await pool.query<{
    id: number;
    created_at: string | Date;
  }>(
    `INSERT INTO ecr_pre_pilot_job_c_physical_sizing_results
       (parent_job_id,design_id,created_by,parent_result_hash,stage1_snapshot_hash,
        process_basis,input_snapshot,result_snapshot,result_hash,immutable_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id,created_at`,
    [
      input.parentJobId, input.designId, input.userId, input.parentResultHash,
      input.stage1Snapshot.immutableHash, persistedProcessBasis, inputSnapshot,
      input.result, resultHash, immutableHash,
    ],
  );
  return {
    id: Number(saved.rows[0].id),
    createdAt: new Date(saved.rows[0].created_at).toISOString(),
    parentJobId: input.parentJobId,
    parentResultHash: input.parentResultHash,
    stage1SnapshotHash: input.stage1Snapshot.immutableHash,
    resultHash,
    immutableHash,
    ...input.result,
  };
}

export async function getLatestCompletedJobCPhysicalSizing(userId: number, designId: number) {
  const found = await pool.query(
    `SELECT id,parent_job_id,parent_result_hash,stage1_snapshot_hash,input_snapshot,
            result_snapshot,result_hash,immutable_hash,created_at
       FROM ecr_pre_pilot_job_c_physical_sizing_results
      WHERE created_by=$1 AND design_id=$2
      ORDER BY created_at DESC,id DESC LIMIT 1`,
    [userId, designId],
  );
  const row = found.rows[0];
  if (!row) return null;
  const expectedImmutableHash = jobCResultHash({
    inputSnapshot: row.input_snapshot,
    result: row.result_snapshot,
  });
  let storedStage1Hash: string | null = null;
  try {
    storedStage1Hash = validateStage1Snapshot(
      row.input_snapshot?.stage1Snapshot,
    ).immutableHash;
  } catch {
    // A child result must retain a valid, self-authenticating Stage-1 snapshot,
    // not merely repeat a hash supplied in a JSON field.
  }
  if (typeof row.result_hash !== 'string'
    || jobCResultHash(row.result_snapshot) !== row.result_hash
    || row.immutable_hash !== expectedImmutableHash
    || row.input_snapshot?.parentJobId !== row.parent_job_id
    || row.input_snapshot?.parentResultHash !== row.parent_result_hash
    || row.input_snapshot?.stage1SnapshotHash !== row.stage1_snapshot_hash
    || row.input_snapshot?.stage1Snapshot?.immutableHash !== row.stage1_snapshot_hash
    || storedStage1Hash !== row.stage1_snapshot_hash) {
    throw new Error('JOB_C_PHYSICAL_SIZING_RESULT_INTEGRITY_FAILURE');
  }
  // A child record is immutable historical evidence, but it is not a
  // perpetual geometry authority.  Before serving it as the design's current
  // assessment, bind it to the currently validated Stage-1 snapshot.  This
  // prevents an old calculated geometry being rendered after a saved Stage-1
  // edit, even when the child itself remains cryptographically intact.
  const current = await getCurrentPhysicalSizingAuthority(userId, designId);
  const stale = (reason: string, requiredDependency: string, details: Record<string, unknown> = {}) => ({
    id: Number(row.id),
    createdAt: new Date(row.created_at).toISOString(),
    stage1SnapshotHash: row.stage1_snapshot_hash,
    resultHash: row.result_hash,
    immutableHash: row.immutable_hash,
    ...physicalSizingStaleBlock({
      parentJobId: row.parent_job_id,
      parentResultHash: row.parent_result_hash,
      reason,
      requiredDependency,
      sourceStage1SnapshotHash: row.stage1_snapshot_hash,
      actualStage1SnapshotHash: current.stage1.immutableHash,
    }),
    ...details,
  });
  if (current.stage1.immutableHash !== row.stage1_snapshot_hash) {
    return stale(
      'JOB_C_PHYSICAL_SIZING_RESULT_STALE:CURRENT_STAGE1_SNAPSHOT_CHANGED',
      'CURRENT_IMMUTABLE_STAGE1_MUST_MATCH_PHYSICAL_SIZING_CHILD_SNAPSHOT',
    );
  }

  // The result parent must still be the same current, owned, accepted Job-C
  // parent that the POST route would select.  A later accepted Job-C result
  // supersedes this child assessment; never mix its historical geometry into
  // the current design view.
  if (!current.acceptedParent) {
    return stale(
      'JOB_C_PHYSICAL_SIZING_RESULT_STALE:CURRENT_ACCEPTED_PARENT_UNAVAILABLE',
      'CURRENT_OWNED_ACCEPTED_JOB_C_PARENT_REQUIRED',
    );
  }
  if (current.acceptedParent.id !== row.parent_job_id
    || current.acceptedParent.result_hash !== row.parent_result_hash) {
    return stale(
      'JOB_C_PHYSICAL_SIZING_RESULT_STALE:ACCEPTED_PARENT_SUPERSEDED',
      'CURRENT_OWNED_ACCEPTED_JOB_C_PARENT_MUST_MATCH_PHYSICAL_SIZING_CHILD_PARENT',
      {
        currentAcceptedParentJobId: current.acceptedParent.id,
        currentAcceptedParentResultHash: current.acceptedParent.result_hash,
      },
    );
  }
  return {
    id: Number(row.id),
    createdAt: new Date(row.created_at).toISOString(),
    parentJobId: row.parent_job_id,
    parentResultHash: row.parent_result_hash,
    stage1SnapshotHash: row.stage1_snapshot_hash,
    resultHash: row.result_hash,
    immutableHash: row.immutable_hash,
    ...row.result_snapshot,
  };
}

export async function currentOwnedStrictPartialAnchor(userId: number, designId: number) {
  const sources = await pool.query(
    `SELECT id,status,completed_at,input_snapshot,input_hash,result_snapshot,result_hash,
             partial_result_snapshot,partial_result_hash,implementation_hash,candidate_hash,
             job_b_engine_hash
       FROM ecr_pre_pilot_job_c_jobs
      WHERE created_by=$1 AND design_id=$2 AND status='completed'
      ORDER BY completed_at DESC,created_at DESC,id DESC`,
    [userId, designId],
  );
  for (const row of sources.rows) {
    const anchor = verifyOwnedStrictPartialAnchor(row);
    if (anchor) return { row, anchor };
  }
  return null;
}

/**
 * The strict partial-transfer anchor is immutable seed/provenance evidence.
 * This path runs only explicitly requested, isolated fixed-lambda candidate
 * worker trials; it has no queue import, resume, continuation, or lambda-one
 * solve.
 */
export async function evaluatePartialTransferPhysicalSizing(
  userId: number,
  designId: number,
  options: { signal?: AbortSignal } = {},
) {
  const found = await pool.query<{ input_data: unknown }>(
    `SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2`,
    [designId, userId],
  );
  if (!found.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const stage1 = validateStage1Snapshot(found.rows[0].input_data);
  const source = await currentOwnedStrictPartialAnchor(userId, designId);
  if (!source) {
    return {
      status: 'DEPENDENCY_BLOCKED',
      reason: 'PARTIAL_TRANSFER_STRICT_LAMBDA_8E_MINUS_9_2M_ANCHOR_NOT_FOUND_OR_INVALID',
      requiredActiveHeightM: null,
      physicalCompartments: null,
      conditionalOverallTheoreticalToPhysicalEstimate: null,
      efficiencyNullReason: 'VERIFIED_STRICT_PARTIAL_TRANSFER_ANCHOR_REQUIRED',
    };
  }
  if (source.anchor.stage1SnapshotHash !== stage1.immutableHash) {
    return {
      status: 'DEPENDENCY_BLOCKED', staleStatus: 'STALE',
      reason: 'PARTIAL_TRANSFER_ANCHOR_STAGE1_LINEAGE_MISMATCH',
      sourceStage1SnapshotHash: source.anchor.stage1SnapshotHash,
      actualStage1SnapshotHash: stage1.immutableHash,
    };
  }
  // Reuse the resolver's self-authenticating immutable-result reader. Raw
  // database JSON is never sufficient authority for this calculation.
  const stage3 = (await getKuhniGeometryResolverRuns(userId, designId, false, true))
    .find((item: any) => item.immutableHash === source.anchor.sourceDependencies.stage3ImmutableHash);
  const request = source.anchor.workerRequest;
  if (!stage3) {
    return {
      status: 'DEPENDENCY_BLOCKED',
      reason: 'PARTIAL_TRANSFER_ANCHOR_STAGE3_IMMUTABLE_GEOMETRY_AUTHORITY_REQUIRED',
      anchorJobId: source.anchor.sourceJobId,
      stage3ImmutableHash: source.anchor.sourceDependencies.stage3ImmutableHash,
    };
  }
  const targetRecoveryPct = stage1.stage1.minimumRecoveryPct;
  const recoveryTolerancePct = 0.01;
  const minimumSearchHeightM = 0.25;
  const maximumSearchHeightM = 20;
  const heightToleranceM = 0.02;
  const separationCriteria = (trial: any) => evaluateDirectPartialTransferStage1Targets({
    phaseConfiguration: request.phaseConfiguration,
    componentOrder: trial?.response?.componentOrder,
    numericalCells: trial?.selected?.numericalCells,
    recoveryPct: trial?.selected?.recoveryPctNmpFreeRrboHydrocarbonMassBasis,
    targets: {
      minimumRecoveryPct: targetRecoveryPct,
      minimumRaffinateSaturatesWt: stage1.stage1.minimumRaffinateSaturatesWt,
      targetRaffinateTotalAromaticsWt: stage1.stage1.targetRaffinateTotalAromaticsWt,
      targetRaffinatePolarAromaticsWt: stage1.stage1.targetRaffinatePolarAromaticsWt,
      maximumNmpRaffinateWt: stage1.stage1.maximumNmpRaffinateWt,
      targetRaffinateSulfurPpm: stage1.stage1.targetRaffinateSulfurPpm,
    },
    recoveryTolerancePct,
  });
  const processBasis = makeStage1HydrodynamicProcessBasis(stage1);
  // D=1.02877 m/H=2 m are source trials, never the answer.  Every eligible
  // persisted Stage-3 D/RPM candidate is rechecked; cap work explicitly so a
  // direct user request cannot turn into an unbounded Job-C workload.
  const sourceCandidateRecords = ((stage3 as any)?.result?.hydraulicRpmEnvelope ?? [])
    .map((item: any, ordinal: number) => ({
      candidate: {
        ordinal, trialId: `stage3:${ordinal}`, trialImmutableHash: (stage3 as any).immutableHash,
        rpm: item?.rpm, columnDiameterM: item?.columnDiameterM,
        compartmentHeightM: item?.compartmentHeightM, powerVolumeWM3: item?.powerVolumeWM3,
        status: item?.status, applicability: item?.applicability ?? [],
        uncertainty: item?.uncertainty ?? [], pilotValidated: false, hydraulicallyFeasible: true,
      },
      stage3Evidence: {
        columnDiameterM: item?.columnDiameterM, rpm: item?.rpm,
        compartmentHeightM: item?.compartmentHeightM, d32M: item?.d32M,
        operatingHoldup: item?.operatingHydraulics?.operatingHoldup,
        floodHoldup: item?.operatingHydraulics?.floodHoldup,
      },
    }));
  const sourceCandidates = eligibleDirectPartialTransferCandidates(
    sourceCandidateRecords,
    (item: any) => item.candidate.status === 'CALCULATED_IN_RANGE'
      && Number.isFinite(item.candidate.columnDiameterM) && item.candidate.columnDiameterM > 0
      && Number.isFinite(item.candidate.rpm) && item.candidate.rpm > 0,
  );
  if (!sourceCandidates.length) {
    const result = {
      status: 'NO_FEASIBLE_CANDIDATE',
      reason: 'PARTIAL_TRANSFER_NO_ELIGIBLE_STAGE3_DIAMETER_RPM_CANDIDATES',
      classification: 'PRE_PILOT_DIRECT_PARTIAL_LAMBDA_NOT_RELEASE_ELIGIBLE',
      requiredActiveHeightM: null, physicalCompartments: null,
      conditionalOverallTheoreticalToPhysicalEstimate: null,
      efficiencyNullReason: 'SUPPORTED_PHYSICAL_COMPARTMENT_EFFICIENCY_MODEL_REQUIRED',
      trialEvidence: [],
    };
    await persistPartialTransferPhysicalSizing({
      userId, designId, anchor: source.anchor, stage1,
      stage3ImmutableHash: (stage3 as any).immutableHash, result,
    });
    return result;
  }
  const trialEvidence: any[] = [];
  const feasible: any[] = [];
  let searchIndeterminate = false;
  const searchController = new AbortController();
  let searchDeadlineExceeded = false;
  let searchCallBudgetExceeded = false;
  let searchClientCancelled = false;
  let callsStarted = 0;
  const searchTimer = setTimeout(() => {
    searchDeadlineExceeded = true;
    searchController.abort();
  }, 120_000);
  searchTimer.unref();
  const abortForClient = () => {
    searchClientCancelled = true;
    searchController.abort();
  };
  options.signal?.addEventListener('abort', abortForClient, { once: true });
  for (const candidateTrial of sourceCandidates) {
    const evaluateAt = async (heightM: number) => {
      if (searchController.signal.aborted || callsStarted >= 16) {
        searchCallBudgetExceeded ||= !searchController.signal.aborted;
        return {
          status: 'SEARCH_BUDGET_EXHAUSTED' as const,
          candidateOrdinal: candidateTrial.candidate.ordinal, heightM,
          reason: searchDeadlineExceeded
            ? 'PARTIAL_TRANSFER_AGGREGATE_RUNTIME_BUDGET_EXHAUSTED'
            : searchClientCancelled ? 'PARTIAL_TRANSFER_CLIENT_CANCELLED'
            : 'PARTIAL_TRANSFER_AGGREGATE_CALL_BUDGET_EXHAUSTED',
        };
      }
      callsStarted += 1;
      try {
        return await solveDirectPartialTransferSizingCandidate({
          anchor: source.anchor, workerRequest: request as any, processBasis,
          candidate: candidateTrial, heightM, signal: searchController.signal,
        });
      } catch (error) {
        return {
          status: 'TRANSPORT_RECALCULATION_FAILED' as const,
          candidateOrdinal: candidateTrial.candidate.ordinal,
          heightM,
          reason: error instanceof Error ? error.message : 'PARTIAL_TRANSFER_CANDIDATE_RECALCULATION_FAILED',
        };
      }
    };
    const recoveryAt = (value: any) => {
      const recovery = value?.selected?.recoveryPctNmpFreeRrboHydrocarbonMassBasis;
      return typeof recovery === 'number' && Number.isFinite(recovery) ? recovery : Number.NaN;
    };
    const criteriaPassed = (value: any) => {
      const criteria = separationCriteria(value);
      return criteria.valid && criteria.allEvaluatedNonSulfurTargetsPassed;
    };
    const qualityPassed = (value: any) => {
      const criteria = separationCriteria(value);
      return criteria.valid && criteria.qualityTargetsPassed;
    };
    const transportPassed = (value: any) => value?.status === 'TRANSPORT_GATES_PASSED'
      && Number.isFinite(recoveryAt(value));
    const indeterminate = (value: any) => [
      'TRANSPORT_TIMEOUT', 'TRANSPORT_CANCELLED', 'SEARCH_BUDGET_EXHAUSTED',
    ].includes(value?.status);
    const unknownTransportOutcome = (value: any) => ![
      'HYDRAULICALLY_INFEASIBLE', 'HYDRAULIC_APPLICABILITY_REJECTED',
    ].includes(value?.status);
    // Search below the 2 m seed first.  0.25 m is an explicit direct-model
    // lower bound (not a mechanical compartment assertion); if it passes all
    // evaluable targets there is no unsupported claim of a smaller H.
    let lowerBracket = await evaluateAt(minimumSearchHeightM);
    if (indeterminate(lowerBracket)) {
      searchIndeterminate = true;
      trialEvidence.push({ candidate: candidateTrial.candidate, status: 'INDETERMINATE', lowerBracket });
      continue;
    }
    if (!transportPassed(lowerBracket)) {
      searchIndeterminate ||= unknownTransportOutcome(lowerBracket);
      trialEvidence.push({ candidate: candidateTrial.candidate, status: 'LOWER_HEIGHT_TRANSPORT_FAILED',
        lowerBracket, reason: 'PARTIAL_TRANSFER_LOWER_SEARCH_BOUND_TRANSPORT_NOT_QUALIFIED' });
      continue;
    }
    let upperBracket: any = lowerBracket;
    let selected: any = criteriaPassed(lowerBracket)
      ? lowerBracket : null;
    if (!selected) {
      const seed = await evaluateAt(PARTIAL_TRANSFER_ANCHOR_HEIGHT_M);
      if (indeterminate(seed)) {
        searchIndeterminate = true;
        trialEvidence.push({ candidate: candidateTrial.candidate, status: 'INDETERMINATE', lowerBracket, seed });
        continue;
      }
      if (!transportPassed(seed)) {
        searchIndeterminate ||= unknownTransportOutcome(seed);
        trialEvidence.push({ candidate: candidateTrial.candidate, status: 'SEED_HEIGHT_TRANSPORT_FAILED',
          lowerBracket, seed, reason: 'PARTIAL_TRANSFER_2M_SEED_TRANSPORT_NOT_QUALIFIED' });
        continue;
      }
      upperBracket = seed;
      if (criteriaPassed(seed)) selected = seed;
    }
    if (!selected) {
      const maximum = await evaluateAt(maximumSearchHeightM);
      if (indeterminate(maximum)) {
        searchIndeterminate = true;
        trialEvidence.push({ candidate: candidateTrial.candidate, status: 'INDETERMINATE',
          lowerBracket, upperBracket, maximum });
        continue;
      }
      if (!transportPassed(maximum)) {
        searchIndeterminate ||= unknownTransportOutcome(maximum);
        trialEvidence.push({ candidate: candidateTrial.candidate, status: 'UPPER_HEIGHT_TRANSPORT_FAILED',
          lowerBracket, upperBracket, maximum,
          reason: 'PARTIAL_TRANSFER_UPPER_SEARCH_BOUND_TRANSPORT_NOT_QUALIFIED' });
        continue;
      }
      if (!criteriaPassed(maximum)) {
        // Quality (SAT/total aromatics/PA) is treated separately from
        // recovery/NMP.  It may first pass at high H while recovery or NMP
        // fails there, so bracket its observed transition and explicitly
        // check the other constraints at the quality boundary.  Neither
        // endpoint failure proves the interval has no feasible interior.
        if (qualityPassed(maximum) && !qualityPassed(lowerBracket)) {
          let qualityLo = lowerBracket.heightM;
          let qualityHi = maximum.heightM;
          let qualityBoundary: any = maximum;
          while (!partialTransferHeightBracketResolved(
            qualityLo, qualityHi, heightToleranceM,
          )) {
            const middle = await evaluateAt((qualityLo + qualityHi) / 2);
            if (indeterminate(middle) || !transportPassed(middle)) {
              searchIndeterminate = true;
              trialEvidence.push({ candidate: candidateTrial.candidate,
                status: 'QUALITY_BOUNDARY_INDETERMINATE', lowerBracket, maximum, middle });
              qualityBoundary = null;
              break;
            }
            if (qualityPassed(middle)) {
              qualityHi = middle.heightM;
              qualityBoundary = middle;
            } else {
              qualityLo = middle.heightM;
            }
          }
          if (qualityBoundary && criteriaPassed(qualityBoundary)) {
            selected = qualityBoundary;
            upperBracket = qualityBoundary;
          } else {
            searchIndeterminate = true;
            trialEvidence.push({ candidate: candidateTrial.candidate,
              status: 'QUALITY_BOUNDARY_RECOVERY_OR_NMP_NOT_PROVEN',
              lowerBracket, maximum, qualityBoundary,
              reason: 'SPARSE_OR_NONMONOTONIC_RECOVERY_NMP_BEHAVIOR_CANNOT_PROVE_NO_INTERIOR_FEASIBLE_HEIGHT' });
            continue;
          }
        } else {
          searchIndeterminate = true;
          trialEvidence.push({ candidate: candidateTrial.candidate, status: 'SPARSE_INTERVAL_TARGETS_UNRESOLVED',
            lowerBracket, upperBracket, maximum,
            reason: 'ENDPOINT_TARGET_FAILURE_DOES_NOT_PROVE_NO_INTERIOR_PARTIAL_TRANSFER_SOLUTION' });
          continue;
        }
      }
      if (!selected) {
        // The actual passing upper point, never the preceding failing point,
        // is the initial selected candidate.
        selected = maximum;
        upperBracket = maximum;
      }
    }
    let lo = lowerBracket.heightM; let hi = selected.heightM;
    for (let iteration = 0; !partialTransferHeightBracketResolved(
      lo, hi, heightToleranceM,
    ); iteration += 1) {
      const middle = await evaluateAt((lo + hi) / 2);
      if (indeterminate(middle)) {
        searchIndeterminate = true;
        trialEvidence.push({ candidate: candidateTrial.candidate, status: 'INDETERMINATE',
          iteration, lowerBracket, upperBracket, middle });
        selected = null;
        break;
      }
      if (!transportPassed(middle)) {
        searchIndeterminate ||= unknownTransportOutcome(middle);
        trialEvidence.push({ candidate: candidateTrial.candidate, status: 'HEIGHT_SEARCH_TRANSPORT_FAILED',
          iteration, lowerBracket, upperBracket, middle });
        selected = null;
        break;
      }
      if (criteriaPassed(middle)) {
        hi = middle.heightM; selected = middle; upperBracket = middle;
      } else {
        lo = middle.heightM; lowerBracket = middle;
      }
    }
    if (!selected) continue;
    const selectedCriteria = separationCriteria(selected);
    if (!selectedCriteria.valid) {
      searchIndeterminate = true;
      trialEvidence.push({ candidate: candidateTrial.candidate, status: 'TARGET_EVALUATION_INVALID',
        selected, criteria: selectedCriteria });
      continue;
    }
    feasible.push({ candidate: candidateTrial, selected, lowerBracket, upperBracket,
      criteria: selectedCriteria });
    trialEvidence.push({ candidate: candidateTrial.candidate, status: 'FEASIBLE',
      lowerBracket, upperBracket, selected, criteria: separationCriteria(selected),
      hydraulicClosure: {
        status: 'HEIGHT_INDEPENDENT_AT_FIXED_D_RPM_AND_PROCESS_THROUGHPUT',
        basis: 'V110_HOLDUP_D32_CLOSURE_RECALCULATED_PER_D_RPM;_H_DOES_NOT_APPEAR_IN_THE_CLOSURE',
        hydraulic: selected.hydraulic,
      } });
  }
  clearTimeout(searchTimer);
  options.signal?.removeEventListener('abort', abortForClient);
  const chosen = feasible.sort((left, right) =>
    left.selected.heightM - right.selected.heightM
    || left.candidate.candidate.columnDiameterM - right.candidate.candidate.columnDiameterM
    || left.candidate.candidate.rpm - right.candidate.candidate.rpm)[0];
  const searchIncomplete = searchIndeterminate || searchDeadlineExceeded
    || searchCallBudgetExceeded || searchClientCancelled;
  const result = (!chosen || searchIncomplete) ? {
    status: searchIncomplete
      ? 'INDETERMINATE' : 'NO_FEASIBLE_CANDIDATE',
    reason: searchIncomplete
      ? 'PARTIAL_TRANSFER_SEARCH_INCOMPLETE;_UNQUALIFIED_OR_TIMED_OUT_DIRECT_SOLVES_ARE_NOT_FEASIBILITY_EVIDENCE'
      : 'PARTIAL_TRANSFER_NO_CANDIDATE_MET_ALL_EVALUABLE_STAGE1_TARGETS_AFTER_DIRECT_189_TRANSPORT_AND_HYDRAULIC_GATES',
    classification: 'PRE_PILOT_DIRECT_PARTIAL_LAMBDA_NOT_RELEASE_ELIGIBLE',
    requiredActiveHeightM: null, physicalCompartments: null,
    conditionalOverallTheoreticalToPhysicalEstimate: null,
    efficiencyNullReason: 'SUPPORTED_PHYSICAL_COMPARTMENT_EFFICIENCY_MODEL_REQUIRED',
    trialEvidence,
    candidateScreeningBasis: sourceCandidates,
    searchBudget: {
      maximumWallClockSeconds: 120, maximumWorkerCalls: 16, callsStarted,
      deadlineExceeded: searchDeadlineExceeded, callBudgetExceeded: searchCallBudgetExceeded,
      clientCancelled: searchClientCancelled,
    },
    searchQualification: {
      targetMonotonicity: 'NOT_PROVEN;_SPARSE_OR_UNQUALIFIED_INTERVALS_ARE_INDETERMINATE',
      requiredHeight: 'NOT_CALCULATED_BECAUSE_THE_BOUNDED_SEARCH_DID_NOT_COMPLETE',
    },
    provisionalBestCandidate: chosen ? {
      candidateOrdinal: chosen.candidate.candidate.ordinal,
      heightM: chosen.selected.heightM,
      qualification: 'NOT_A_FINAL_SELECTION_BECAUSE_BOUNDED_SEARCH_DID_NOT_COMPLETE',
    } : null,
  } : {
    status: 'CALCULATED_EVALUABLE_TARGETS_WITH_SULFUR_AND_EFFICIENCY_BLOCKED',
    classification: 'PRE_PILOT_DIRECT_NONLINEAR_PARTIAL_LAMBDA_NOT_RELEASE_ELIGIBLE',
    reason: 'SULFUR_NOT_EVALUATED_AND_SUPPORTED_PHYSICAL_COMPARTMENT_EFFICIENCY_MODEL_REQUIRED',
    anchor: { sourceJobId: source.anchor.sourceJobId, sourceResultHash: source.anchor.sourceResultHash,
      lambda: 8e-9, heightM: 2, profileStateSha256: source.anchor.profileStateSha256,
      verification: 'OWNED_IMMUTABLE_STRICT_DIAGNOSTIC_CHECKPOINT_VERIFIED_READ_ONLY' },
    stage3Geometry: { immutableHash: (stage3 as any).immutableHash,
      columnDiameterM: chosen.candidate.candidate.columnDiameterM, rpm: chosen.candidate.candidate.rpm,
      provenance: 'CANDIDATE_SPECIFIC_HYDRAULICS_AND_FILMS_RECALCULATED' },
    target: { recoveryPct: targetRecoveryPct,
      basis: 'STAGE1_MINIMUM_RECOVERY_PCT_NMP_FREE_RRBO_HYDROCARBON_MASS_SAT_MONO_DI_POLY_PA',
      lowerBracket: { heightM: chosen.lowerBracket.heightM, recoveryPct: recoveryAt(chosen.lowerBracket) },
      upperBracket: { heightM: chosen.upperBracket.heightM, recoveryPct: recoveryAt(chosen.upperBracket) },
      recoveryTolerancePct,
      criteria: chosen.criteria.criteria,
      allEvaluableNonSulfurTargetsPassed: true,
      sulfur: chosen.criteria.sulfurCriterion },
    requiredActiveHeightM: chosen.selected.heightM,
    physicalCompartments: null,
    conditionalOverallTheoreticalToPhysicalEstimate: null,
    efficiencyLabel: 'NOT_CALCULATED',
    efficiencyNullReason: 'SUPPORTED_PHYSICAL_COMPARTMENT_EFFICIENCY_MODEL_REQUIRED',
    solve: chosen.selected.selected,
    trialEvidence,
    candidateScreeningBasis: sourceCandidates,
    searchBudget: {
      maximumWallClockSeconds: 120, maximumWorkerCalls: 16, callsStarted,
      deadlineExceeded: searchDeadlineExceeded, callBudgetExceeded: searchCallBudgetExceeded,
      clientCancelled: searchClientCancelled,
    },
    searchQualification: {
      targetMonotonicity: 'OBSERVED_LOCALLY_FOR_BISECTION_ONLY;_NOT_A_GLOBAL_MONOTONICITY_CLAIM',
      requiredHeight: 'BOUNDED_ESTIMATE_WITHIN_THE_LAST_QUALIFIED_ALL_TARGET_INTERVAL_AT_0.02_M_OR_LESS',
    },
    assumptions: ['Each D/RPM/H point re-solves local interfaces, original Job-A films, and the coupled 189 equations at lambda=8e-9.',
      'The 189-coordinate strict anchor is a seed and immutable provenance only; no frozen secant coefficients or homotopy are used.',
      'No supported physical-compartment efficiency model or actual mechanical spacing evidence is available; no stage efficiency is reported.',
      'This isolated operation does not enqueue, resume, or run lambda=1 Job C.'],
    equations: ['Unchanged coupled 98 finite-volume balances + 91 local interface equations.',
      'Candidate local film fluxes and FV source terms are recomputed at every D/RPM/H trial.'],
  };
  await persistPartialTransferPhysicalSizing({
    userId, designId, anchor: source.anchor, stage1, stage3ImmutableHash: (stage3 as any).immutableHash, result,
  });
  return result;
}

async function persistPartialTransferPhysicalSizing(input: {
  userId: number; designId: number; anchor: StrictPartialAnchor;
  stage1: EcrPrePilotStage1Snapshot; stage3ImmutableHash: string; result: Record<string, any>;
}) {
  const inputSnapshot = {
    schemaVersion: PARTIAL_TRANSFER_SIZING_VERSION,
    anchorJobId: input.anchor.sourceJobId, anchorResultHash: input.anchor.sourceResultHash,
    anchorStateSha256: input.anchor.profileStateSha256, stage1SnapshotHash: input.stage1.immutableHash,
    stage3ImmutableHash: input.stage3ImmutableHash,
  };
  const resultHash = jobCResultHash(input.result);
  await pool.query(
    `INSERT INTO ecr_pre_pilot_partial_transfer_physical_sizing_results
      (anchor_job_id,design_id,created_by,anchor_result_hash,stage1_snapshot_hash,
       stage3_immutable_hash,input_snapshot,result_snapshot,result_hash,immutable_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [input.anchor.sourceJobId, input.designId, input.userId, input.anchor.sourceResultHash,
      input.stage1.immutableHash, input.stage3ImmutableHash, inputSnapshot, input.result, resultHash,
      jobCResultHash({ inputSnapshot, result: input.result })],
  );
}

export async function getLatestPartialTransferPhysicalSizing(userId: number, designId: number) {
  const rows = await pool.query(
    `SELECT * FROM ecr_pre_pilot_partial_transfer_physical_sizing_results
      WHERE created_by=$1 AND design_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,
    [userId, designId],
  );
  const row = rows.rows[0];
  if (!row) return null;
  if (jobCResultHash(row.result_snapshot) !== row.result_hash
    || jobCResultHash({ inputSnapshot: row.input_snapshot, result: row.result_snapshot }) !== row.immutable_hash) {
    throw new Error('PARTIAL_TRANSFER_PHYSICAL_SIZING_RESULT_INTEGRITY_FAILURE');
  }
  // A stale assessment remains useful audit evidence. Preserve its saved
  // server-derived geometry/null reasons while clearly overriding status so
  // the UI cannot present it as current.
  let sourceRun: {
    id: string | number;
    created_at: string | Date | null;
    started_at: string | Date | null;
    completed_at: string | Date | null;
    status: string | null;
  } | null = null;
  try {
    const sourceRunResult = await pool.query(
      `SELECT id,created_at,started_at,completed_at,status
         FROM ecr_pre_pilot_job_c_jobs
        WHERE id=$1 AND design_id=$2 AND created_by=$3`,
      [row.anchor_job_id, designId, userId],
    );
    sourceRun = sourceRunResult.rows[0] ?? null;
  } catch {
    // The immutable child remains readable if an older deployment does not
    // expose optional source-run metadata. Hash and lineage checks below are
    // still authoritative.
  }
  const savedAssessment = {
    ...row.result_snapshot,
    id: Number(row.id), createdAt: new Date(row.created_at).toISOString(),
    resultHash: row.result_hash, immutableHash: row.immutable_hash,
    sourceRunId: row.anchor_job_id,
    sourceRunCreatedAt: sourceRun?.created_at ? new Date(sourceRun.created_at).toISOString() : null,
    sourceRunStartedAt: sourceRun?.started_at ? new Date(sourceRun.started_at).toISOString() : null,
    sourceRunCompletedAt: sourceRun?.completed_at ? new Date(sourceRun.completed_at).toISOString() : null,
    sourceRunStatus: sourceRun?.status ?? null,
  };
  const design = await pool.query<{ input_data: unknown }>(
    `SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2`, [designId, userId],
  );
  const stage1 = design.rows[0] && validateStage1Snapshot(design.rows[0].input_data);
  if (!stage1 || stage1.immutableHash !== row.stage1_snapshot_hash) {
    return { ...savedAssessment, status: 'DEPENDENCY_BLOCKED', staleStatus: 'STALE',
      reason: 'PARTIAL_TRANSFER_PHYSICAL_SIZING_CURRENT_STAGE1_LINEAGE_CHANGED',
      sourceStage1SnapshotHash: row.stage1_snapshot_hash,
      actualStage1SnapshotHash: stage1?.immutableHash ?? null };
  }
  const parent = await pool.query(
    `SELECT id,status,completed_at,input_snapshot,input_hash,result_snapshot,result_hash,
             partial_result_snapshot,partial_result_hash,implementation_hash,candidate_hash,
             job_b_engine_hash FROM ecr_pre_pilot_job_c_jobs
      WHERE id=$1 AND design_id=$2 AND created_by=$3`,
    [row.anchor_job_id, designId, userId],
  );
  const anchor = verifyOwnedStrictPartialAnchor(parent.rows[0]);
  if (!anchor || anchor.sourceResultHash !== row.anchor_result_hash) {
    return { ...savedAssessment, status: 'DEPENDENCY_BLOCKED', staleStatus: 'STALE',
      reason: 'PARTIAL_TRANSFER_PHYSICAL_SIZING_STRICT_ANCHOR_UNAVAILABLE_OR_TAMPERED' };
  }
  if (anchor.sourceDependencies.stage3ImmutableHash !== row.stage3_immutable_hash) {
    return { ...savedAssessment, status: 'DEPENDENCY_BLOCKED', staleStatus: 'STALE',
      reason: 'PARTIAL_TRANSFER_PHYSICAL_SIZING_SAVED_STAGE3_LINEAGE_MISMATCH',
      sourceStage3ImmutableHash: anchor.sourceDependencies.stage3ImmutableHash,
      savedStage3ImmutableHash: row.stage3_immutable_hash };
  }
  const currentStage3 = await getKuhniGeometryResolverRuns(userId, designId, true, true);
  if (!currentStage3 || currentStage3.immutableHash !== row.stage3_immutable_hash) {
    return { ...savedAssessment, status: 'DEPENDENCY_BLOCKED', staleStatus: 'STALE',
      reason: 'PARTIAL_TRANSFER_PHYSICAL_SIZING_CURRENT_STAGE3_LINEAGE_CHANGED',
      savedStage3ImmutableHash: row.stage3_immutable_hash,
      actualStage3ImmutableHash: currentStage3?.immutableHash ?? null };
  }
  const currentAnchor = await currentOwnedStrictPartialAnchor(userId, designId);
  if (!currentAnchor || currentAnchor.anchor.sourceJobId !== anchor.sourceJobId
    || currentAnchor.anchor.sourceResultHash !== anchor.sourceResultHash) {
    return { ...savedAssessment, status: 'DEPENDENCY_BLOCKED', staleStatus: 'STALE',
      reason: 'PARTIAL_TRANSFER_PHYSICAL_SIZING_STRICT_ANCHOR_SUPERSEDED',
      sourceAnchorJobId: anchor.sourceJobId,
      currentAnchorJobId: currentAnchor?.anchor.sourceJobId ?? null };
  }
  return savedAssessment;
}