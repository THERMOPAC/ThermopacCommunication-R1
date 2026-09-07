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
  KUHNI_GEOMETRY_RESOLVER_V100_VERSION,
  KUHNI_GEOMETRY_RESOLVER_VERSION,
  PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  resolveKuhniGeometry,
  resolveKuhniGeometryV100,
  type TheoreticalStageAuthority,
} from "./ecr-pre-pilot/kuhni-geometry-resolver";
import {
  KUHNI_GEOMETRY_RESOLVER_V110_HASH,
  KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
  resolveKuhniGeometryV110,
} from "./ecr-pre-pilot/kuhni-geometry-resolver-v110";
import {
  JOB_A_COMPONENT_ORDER,
  JOB_A_MOLECULAR_DATA,
  JOB_A_STAGE2_ENGINE_ID,
  JOB_A_STAGE2_ENGINE_VERSION,
  evaluateJobA,
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
  currentJobCArtifactHashes,
  jobCResultHash,
  runJobCWorker,
} from "./ecr-pre-pilot/job-c";

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
  const result = resolveKuhniGeometryV110(basis, theoreticalStages);
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
      basis, theoreticalStages, result, KUHNI_GEOMETRY_RESOLVER_V110_HASH, immutableHash,
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
    const numericalReplay = (() => {
      switch (row.result?.engine?.version) {
        case KUHNI_GEOMETRY_RESOLVER_V100_VERSION:
          return resolveKuhniGeometryV100(row.processBasis, row.theoreticalStages);
        case KUHNI_GEOMETRY_RESOLVER_VERSION:
          return resolveKuhniGeometry(row.processBasis, row.theoreticalStages);
        case KUHNI_GEOMETRY_RESOLVER_V110_VERSION:
          return resolveKuhniGeometryV110(row.processBasis, row.theoreticalStages);
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
    return {
      id: row.id, createdAt: row.createdAt, immutableHash: row.immutableHash,
      integrityStatus: 'VERIFIED' as const, result: row.result,
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
  const stage3 = await getKuhniGeometryResolverRuns(userId, designId, true);
  if (!stage3) throw new Error('JOB_A_DEPENDENCY_BLOCKED:LATEST_VERIFIED_STAGE3_REQUIRED');
  const result = stage3.result as any;
  if (result?.engine?.version !== KUHNI_GEOMETRY_RESOLVER_V110_VERSION
    || result?.engine?.implementationHash !== KUHNI_GEOMETRY_RESOLVER_V110_HASH) {
    throw new Error('JOB_A_DEPENDENCY_BLOCKED:LATEST_STAGE3_V110_REQUIRED');
  }
  if (result.processBasis?.stage1SnapshotHash !== stage1.immutableHash) {
    throw new Error('JOB_A_DEPENDENCY_BLOCKED:STAGE1_STAGE3_HASH_MISMATCH');
  }
  const stage2Authority = result.theoreticalStagesUsed as TheoreticalStageAuthority | undefined;
  if (!stage2Authority || !Number.isInteger(stage2Authority.value)
    || stage2Authority.value < 1
    || !['STAGE_2_CALCULATED_NT', 'PRE_PILOT_DESIGN_DEFAULT']
      .includes(stage2Authority.provenance)) {
    throw new Error('JOB_A_DEPENDENCY_BLOCKED:INVALID_THEORETICAL_STAGE_AUTHORITY');
  }
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
  const stage3 = await getKuhniGeometryResolverRuns(userId, designId, true);
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

/**
 * Body-free Job C evaluation. All physical and duty inputs are reloaded from
 * the authenticated design's verified Job A/B/Stage 1/Stage 3 lineage.
 */
export async function prepareEcrPrePilotJobC(userId: number, designId: number) {
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
  const stage3 = await getKuhniGeometryResolverRuns(userId, designId, true);
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
  const targetCells = 7;
  if (!globalBoundary.axialLocalContactProfileComplete
    || !Array.isArray(sourceContacts) || sourceContacts.length < targetCells) {
    throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:AXIAL_LOCAL_CONTACT_PROFILE_UNAVAILABLE', {
      requiredRecordedContacts: targetCells,
      recordedContacts: Array.isArray(sourceContacts) ? sourceContacts.length : 0,
      repeatedOrInventedContactsPermitted: false,
      heightClaimed: false,
    });
  }
  const axialLocalContactProfile = Array.from({ length: targetCells }, (_, index) => {
    const first = Math.floor(index * sourceContacts.length / targetCells);
    const exclusiveLast = Math.floor((index + 1) * sourceContacts.length / targetCells);
    const bin = sourceContacts.slice(first, Math.max(first + 1, exclusiveLast));
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
        stage2ResultSnapshotHash: globalBoundary.provenance.resultSnapshotHash,
        mapping: 'CONTIGUOUS_EQUAL_AXIAL_BINS_ARITHMETIC_COMPOSITION_MEAN',
      },
    };
  });
  const axialLocalContactProfileAuthority = {
    qualification: 'GOVERNED_PINNED_STAGE2_AXIAL_LOCAL_CONTACT_PROFILE',
    componentOrder: [...JOB_C_COMPONENT_ORDER],
    phaseConfiguration: processBasis.phaseConfiguration,
    sourceStageCount: sourceContacts.length,
    targetNumericalCells: targetCells,
    mapping: 'CONTIGUOUS_EQUAL_AXIAL_BINS_ARITHMETIC_COMPOSITION_MEAN',
    stage2ResultSnapshotHash: globalBoundary.provenance.resultSnapshotHash,
  };
  const axialLocalContactProfileSha256 = jobCResultHash({
    authority: axialLocalContactProfileAuthority,
    profile: axialLocalContactProfile,
  });
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
  };
  const responseBasis = {
    schemaVersion: 'ECR_PRE_PILOT_JOB_C_V1' as const,
    labels: ['PRELIMINARY', 'PRE_PILOT_PREDICTIVE', 'NOT_PILOT_VALIDATED',
      'NOT_RELEASE_ELIGIBLE', 'NOT_FINAL_DESIGN'],
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
      status: 'INPUT_STATE_ONLY_NOT_FINAL_RPM_SELECTION',
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
  const body = {
    ...prepared.responseBasis,
    status: workerResult.status,
    workerResult,
  };
  return { ...body, resultSha256: jobCResultHash(body) };
}

export async function evaluateEcrPrePilotJobC(userId: number, designId: number) {
  return executePreparedEcrPrePilotJobC(await prepareEcrPrePilotJobC(userId, designId));
}