import { randomUUID } from 'node:crypto';
import { pool } from '../db';
import {
  executePreparedEcrPrePilotJobC,
  prepareEcrPrePilotJobC,
} from '../ecr-pre-pilot-service';
import {
  currentJobCArtifactHashes,
  JobCError,
  jobCResultHash,
} from './job-c';
import { validateStage1Snapshot } from './stage1';

const OWNER = `job-c:${process.pid}:${randomUUID()}`;
const POLL_MS = Number(process.env.JOB_C_POLL_MS ?? 1_000);
const LEASE_MS = Number(process.env.JOB_C_LEASE_MS ?? 30_000);
const TIMEOUT_MS = Math.max(Number(process.env.JOB_C_TIMEOUT_MS ?? 900_000), 600_000);
let started = false;
let busy = false;

function publicJob(row: any) {
  return {
    id: row.id,
    designId: Number(row.design_id),
    createdBy: Number(row.created_by),
    status: row.status,
    progress: {
      phase: row.progress_phase,
      completed: Number(row.progress_completed),
      total: row.progress_total == null ? null : Number(row.progress_total),
    },
    input: row.input_snapshot,
    inputHash: row.input_hash,
    implementationHash: row.implementation_hash,
    candidateHash: row.candidate_hash,
    jobBEngineHash: row.job_b_engine_hash,
    result: row.result_snapshot,
    resultHash: row.result_hash,
    error: row.error,
    attemptCount: Number(row.attempt_count),
    cancelRequestedAt: row.cancel_requested_at?.toISOString?.() ?? row.cancel_requested_at ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

async function history(client: any, row: any, details: Record<string, unknown>) {
  await client.query(
    `INSERT INTO ecr_pre_pilot_job_c_job_history
      (job_id,input_snapshot,input_hash,implementation_hash,candidate_hash,job_b_engine_hash,
       status,progress_phase,progress_completed,progress_total,worker_owner,
       claim_token,attempt_count,result_snapshot,result_hash,error,details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [row.id, row.input_snapshot, row.input_hash, row.implementation_hash,
      row.candidate_hash, row.job_b_engine_hash, row.status, row.progress_phase,
      row.progress_completed, row.progress_total, row.worker_owner, row.claim_token,
      row.attempt_count, row.result_snapshot, row.result_hash, row.error, details],
  );
}

export async function enqueueJobC(userId: number, designId: number) {
  // This is the only mutable-state read used to construct the job. The entire
  // server-derived request and its audit/lineage are persisted before returning.
  const prepared = await prepareEcrPrePilotJobC(userId, designId);
  const snapshot = {
    schemaVersion: 'ECR_PRE_PILOT_JOB_C_QUEUE_SNAPSHOT_V1',
    prepared,
  };
  const inputHash = jobCResultHash(snapshot) as string;
  const artifacts = currentJobCArtifactHashes();
  const jobBEngineHash = String((prepared.responseBasis as any).dependencies
    ?.jobBInterfaceWorkerSha256 ?? '');
  if (!/^[a-f0-9]{64}$/.test(jobBEngineHash)) {
    throw new Error('JOB_C_DEPENDENCY_BLOCKED:JOB_B_ENGINE_HASH_MISSING');
  }
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const design = await client.query(
      'SELECT id FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2 FOR SHARE',
      [designId, userId],
    );
    if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
    const inserted = await client.query(
      `INSERT INTO ecr_pre_pilot_job_c_jobs
       (id,design_id,created_by,input_snapshot,input_hash,implementation_hash,
        candidate_hash,job_b_engine_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, designId, userId, snapshot, inputHash, artifacts.implementationHash,
        artifacts.candidateHash, jobBEngineHash],
    );
    await history(client, inserted.rows[0], { event: 'enqueued' });
    await client.query('COMMIT');
    startJobCWorker();
    return publicJob(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getJobC(id: string, userId: number, designId: number) {
  const found = await pool.query(
    'SELECT * FROM ecr_pre_pilot_job_c_jobs WHERE id=$1 AND created_by=$2 AND design_id=$3',
    [id, userId, designId],
  );
  return found.rows[0] ? publicJob(found.rows[0]) : null;
}

export async function getLatestJobC(userId: number, designId: number) {
  const found = await pool.query(
    `SELECT * FROM ecr_pre_pilot_job_c_jobs
      WHERE created_by=$1 AND design_id=$2 ORDER BY created_at DESC LIMIT 1`,
    [userId, designId],
  );
  return found.rows[0] ? publicJob(found.rows[0]) : null;
}

export async function cancelJobC(id: string, userId: number, designId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const changed = await client.query(
      `UPDATE ecr_pre_pilot_job_c_jobs
       SET cancel_requested_at=COALESCE(cancel_requested_at,NOW()),
           status=CASE WHEN status='pending' THEN 'cancelled' ELSE status END,
           completed_at=CASE WHEN status='pending' THEN NOW() ELSE completed_at END,
           progress_phase=CASE WHEN status='pending' THEN 'terminal' ELSE progress_phase END,
           updated_at=NOW()
       WHERE id=$1 AND created_by=$2 AND design_id=$3
         AND status IN ('pending','running') RETURNING *`,
      [id, userId, designId],
    );
    if (changed.rows[0]) await history(client, changed.rows[0], { event: 'cancel_requested' });
    await client.query('COMMIT');
    return changed.rows[0] ? publicJob(changed.rows[0]) : getJobC(id, userId, designId);
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}

async function claim() {
  const token = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `WITH candidate AS (
         SELECT id,status previous_status FROM ecr_pre_pilot_job_c_jobs
          WHERE cancel_requested_at IS NULL
            AND (status='pending' OR (status='running' AND lease_expires_at<NOW()))
          ORDER BY CASE WHEN status='running' THEN 0 ELSE 1 END,created_at
          FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE ecr_pre_pilot_job_c_jobs j SET status='running',worker_owner=$1,
         claim_token=$2,lease_expires_at=NOW()+($3*INTERVAL '1 millisecond'),
         attempt_count=attempt_count+1,started_at=COALESCE(started_at,NOW()),
         progress_phase='candidate 2m',updated_at=NOW()
       FROM candidate WHERE j.id=candidate.id
       RETURNING j.*,candidate.previous_status`,
      [OWNER, token, LEASE_MS],
    );
    if (result.rows[0]) await history(client, result.rows[0], {
      event: result.rows[0].previous_status === 'running' ? 'stale_lease_reclaimed' : 'claimed',
    });
    await client.query('COMMIT');
    return result.rows[0] ? { row: result.rows[0], token } : null;
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}

async function guardedUpdate(id: string, token: string, sql: string, values: unknown[]) {
  return pool.query(
    `UPDATE ecr_pre_pilot_job_c_jobs SET ${sql},updated_at=NOW()
      WHERE id=$1 AND status='running' AND claim_token=$2 RETURNING *`,
    [id, token, ...values],
  );
}

async function execute(row: any, token: string) {
  const controller = new AbortController();
  const heartbeat = setInterval(async () => {
    try {
      const state = await guardedUpdate(row.id, token,
        `lease_expires_at=NOW()+($3*INTERVAL '1 millisecond')`, [LEASE_MS]);
      if (!state.rows[0] || state.rows[0].cancel_requested_at) controller.abort();
    } catch {
      controller.abort();
    }
  }, Math.max(1_000, Math.floor(LEASE_MS / 3)));
  heartbeat.unref();
  try {
    const design = await pool.query(
      `SELECT d.input_data,
              (SELECT immutable_hash
                 FROM ecr_pre_pilot_kuhni_geometry_resolver_runs r
                WHERE r.design_id=d.id AND r.created_by=d.created_by
                ORDER BY created_at DESC LIMIT 1) AS stage3_hash
         FROM ecr_pre_pilot_designs d WHERE d.id=$1 AND d.created_by=$2`,
      [row.design_id, row.created_by],
    );
    const snapshot = row.input_snapshot;
    const artifacts = currentJobCArtifactHashes();
    const deps = snapshot?.prepared?.responseBasis?.dependencies;
    const currentStage1Hash = design.rows[0]
      ? validateStage1Snapshot(design.rows[0].input_data).immutableHash : null;
    const immutable = jobCResultHash(snapshot) === row.input_hash
      && artifacts.implementationHash === row.implementation_hash
      && artifacts.candidateHash === row.candidate_hash
      && artifacts.boundaryQualifierHash === deps?.jobCBoundaryInterfaceQualifierSha256
      && deps?.jobBInterfaceWorkerSha256 === row.job_b_engine_hash
      && deps?.stage1SnapshotHash === currentStage1Hash
      && deps?.stage3ImmutableHash === design.rows[0]?.stage3_hash;
    if (!design.rows[0] || !immutable) {
      throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:STALE_OR_INVALID_LINEAGE', {
        reason: 'IMMUTABLE_SNAPSHOT_OR_PRIMARY_PIN_MISMATCH',
      });
    }
    // Rebuild, but do not execute, Job C from current authorities. Equality of
    // the complete prepared evidence revalidates the exact Stage-2 source row
    // (result/engine/model/Stage-1 pins), global-boundary provenance and hash,
    // Job-A/B lineage, and latest selected Stage-3 run/trial. Preparation also
    // reruns the current Job-B runtime preflight; its engine, interface artifact,
    // and worker hashes are all part of responseBasis.dependencies.
    let currentPrepared: Awaited<ReturnType<typeof prepareEcrPrePilotJobC>>;
    try {
      currentPrepared = await prepareEcrPrePilotJobC(
        Number(row.created_by),
        Number(row.design_id),
      );
    } catch (error: any) {
      throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:STALE_OR_INVALID_LINEAGE', {
        reason: 'CURRENT_PINNED_DEPENDENCY_REVALIDATION_FAILED',
        cause: error?.message ?? String(error),
        causeDetails: error?.details ?? null,
      });
    }
    const frozenPreparedHash = jobCResultHash(snapshot.prepared);
    const currentPreparedHash = jobCResultHash(currentPrepared);
    if (currentPreparedHash !== frozenPreparedHash) {
      throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:STALE_OR_INVALID_LINEAGE', {
        reason: 'COMPLETE_PREPARED_DEPENDENCY_SNAPSHOT_CHANGED',
        frozenPreparedHash,
        currentPreparedHash,
      });
    }
    const result = await executePreparedEcrPrePilotJobC(snapshot.prepared, {
      timeoutMs: TIMEOUT_MS,
      signal: controller.signal,
      onProgress: async (phase, completed = 0, total) => {
        const changed = await guardedUpdate(row.id, token,
          `progress_phase=$3,progress_completed=GREATEST(progress_completed,$4),
           progress_total=$5,lease_expires_at=NOW()+($6*INTERVAL '1 millisecond')`,
          [phase, completed, total ?? null, LEASE_MS]);
        if (changed.rows[0]) await history(pool, changed.rows[0], { event: 'progress' });
      },
    });
    const blocked = result.status === 'BLOCKED_PRELIMINARY_JOB_C';
    if (!blocked && result.status !== 'CALCULATED_PRELIMINARY_JOB_C') {
      throw new JobCError('JOB_C_WORKER_RESPONSE_STATUS_INVALID', { workerStatus: result.status });
    }
    const final = await guardedUpdate(row.id, token,
      `status=CASE WHEN cancel_requested_at IS NULL THEN $3 ELSE 'cancelled' END,
       result_snapshot=CASE WHEN cancel_requested_at IS NULL THEN $4::jsonb ELSE NULL::jsonb END,
       result_hash=CASE WHEN cancel_requested_at IS NULL THEN $5 ELSE NULL END,
       error=CASE WHEN cancel_requested_at IS NULL THEN NULL ELSE 'JOB_C_CANCELLED' END,
       progress_phase='terminal',
       completed_at=NOW(),lease_expires_at=NULL,claim_token=NULL`,
      [blocked ? 'blocked' : 'completed', result, jobCResultHash(result)]);
    if (final.rows[0]) await history(pool, final.rows[0], {
      event: final.rows[0].status,
      reason: blocked ? result.workerResult?.error ?? 'BLOCKED_PRELIMINARY_JOB_C' : null,
      diagnostics: blocked ? result.workerResult?.diagnostics ?? null : null,
    });
  } catch (error: any) {
    const cancelled = controller.signal.aborted || error?.message === 'JOB_C_CANCELLED';
    const blocked = !cancelled
      && error?.message === 'JOB_C_DEPENDENCY_BLOCKED:STALE_OR_INVALID_LINEAGE';
    const final = await guardedUpdate(row.id, token,
      `status=CASE WHEN cancel_requested_at IS NULL THEN $3 ELSE 'cancelled' END,
       error=CASE WHEN cancel_requested_at IS NULL THEN $4 ELSE 'JOB_C_CANCELLED' END,
       result_snapshot=CASE WHEN cancel_requested_at IS NULL THEN $5::jsonb ELSE NULL::jsonb END,
       result_hash=CASE WHEN cancel_requested_at IS NULL THEN $6 ELSE NULL END,
       progress_phase='terminal',
       completed_at=NOW(),lease_expires_at=NULL,claim_token=NULL`,
      [cancelled ? 'cancelled' : blocked ? 'blocked' : 'failed', error?.message ?? 'JOB_C_FAILED',
        error?.details ? { diagnostics: error.details } : null,
        error?.details ? jobCResultHash({ diagnostics: error.details }) : null]);
    if (final.rows[0]) await history(pool, final.rows[0], {
      event: final.rows[0].status,
      reason: error?.message ?? 'JOB_C_FAILED',
      diagnostics: error?.details ?? null,
    });
  } finally {
    clearInterval(heartbeat);
    busy = false;
  }
}

async function poll() {
  if (busy) return;
  busy = true;
  try {
    const next = await claim();
    if (!next) { busy = false; return; }
    void execute(next.row, next.token);
  } catch (error) {
    busy = false;
    console.error('[Job C] Queue poll failed:', error);
  }
}

export function startJobCWorker() {
  if (started) return;
  started = true;
  const timer = setInterval(() => void poll(), POLL_MS);
  timer.unref();
  void poll();
}