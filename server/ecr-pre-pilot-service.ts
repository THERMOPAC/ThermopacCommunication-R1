import { pool } from "./db";
import {
  canonicalizeStage1Input,
  makeStage1Snapshot,
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
  KUHNI_GEOMETRY_RESOLVER_HASH,
  KUHNI_GEOMETRY_RESOLVER_V100_VERSION,
  PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  resolveKuhniGeometry,
  resolveKuhniGeometryV100,
  type TheoreticalStageAuthority,
} from "./ecr-pre-pilot/kuhni-geometry-resolver";

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
  const design = await pool.query<{ project_number: number }>(
    `SELECT project_number
       FROM ecr_pre_pilot_designs
      WHERE id = $1 AND created_by = $2`,
    [designId, userId],
  );
  if (!design.rows[0]) throw new Error("ECR_PRE_PILOT_DESIGN_NOT_FOUND");
  const stage1 = canonicalizeStage1Input(rawInput, Number(design.rows[0].project_number));
  const snapshot = makeStage1Snapshot(stage1);
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

function resolveTheoreticalStageAuthority(
  stage1Hash: string,
  job: { id: string; status: string; result_snapshot: any } | undefined,
): TheoreticalStageAuthority {
  const result = job?.result_snapshot;
  const candidate = Number(result?.establishedTheoreticalStages ?? result?.predictiveNt);
  const valid = job?.status === 'completed'
    && result
    && result.status !== 'ENGINE_ERROR'
    && USABLE_THERMODYNAMIC_EXECUTION_STATUSES.has(String(result.executionStatus ?? ''))
    && result.stage1TargetGovernance?.stage1SnapshotHash === stage1Hash
    && Number.isInteger(candidate)
    && candidate > 0;
  if (valid) {
    return {
      value: candidate,
      provenance: 'STAGE_2_CALCULATED_NT',
      label: 'STAGE-2 CALCULATED THEORETICAL STAGES',
      stage2JobId: job!.id,
      stage2ResultHash: kuhniRunHash(result),
    };
  }
  return {
    value: PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
    provenance: 'PRE_PILOT_DESIGN_DEFAULT',
    label: 'PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)',
    stage2JobId: null,
    stage2ResultHash: null,
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
  const result = resolveKuhniGeometry(basis, theoreticalStages);
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
      basis, theoreticalStages, result, KUHNI_GEOMETRY_RESOLVER_HASH, immutableHash,
    ],
  );
  return {
    id: saved.rows[0].id,
    createdAt: saved.rows[0].created_at,
    immutableHash,
    integrityStatus: 'VERIFIED' as const,
    ...result,
  };
}

export async function getKuhniGeometryResolverRuns(userId: number, designId: number, latest = false) {
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
      ORDER BY created_at DESC, id DESC ${latest ? 'LIMIT 1' : ''}`,
    [designId, userId],
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
    const numericalReplay = row.result?.engine?.version === KUHNI_GEOMETRY_RESOLVER_V100_VERSION
      ? resolveKuhniGeometryV100(row.processBasis, row.theoreticalStages)
      : resolveKuhniGeometry(row.processBasis, row.theoreticalStages);
    if (
      replayed !== row.immutableHash
      || row.implementationHash !== row.result?.engine?.implementationHash
      || row.stage1SnapshotHash !== row.processBasis?.stage1SnapshotHash
      || kuhniRunHash(calculationPayload) !== calculationHash
      || kuhniRunHash(numericalReplay) !== kuhniRunHash(row.result)
    ) {
      throw new Error('ECR_PRE_PILOT_KUHNI_RESOLVER_INTEGRITY_FAILURE');
    }
    return {
      id: row.id, createdAt: row.createdAt, immutableHash: row.immutableHash,
      integrityStatus: 'VERIFIED' as const, result: row.result,
    };
  });
  return latest ? verified[0] ?? null : verified;
}