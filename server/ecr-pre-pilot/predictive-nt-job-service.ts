import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db';
import { PRE_PILOT_MODEL, startPrePilotNt } from './model';

export interface PredictiveNtJobInput {
  modelHash: string;
  temperatureK: number;
  solventMolarRatio: number;
  feedMoleFractions: [number, number, number];
  satIdentity: string;
  monoIdentity: string;
  targetRaffinateMonoHydrocarbonMoleFraction: number;
  minimumRaffinateSaturatesHydrocarbonMoleFraction?: number;
  minimumNmpFreeHydrocarbonRecovery?: number;
  maximumStages?: number;
}

type PredictiveNtJob = {
  id: string;
  designId: number;
  modelHash: string;
  engineHash: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdBy: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  input: PredictiveNtJobInput;
  progress: { completedStageTrials: number; maximumStages: number };
  result: unknown;
  error: string | null;
};

const MAX_QUEUED_JOBS = 10;
const MAX_ACTIVE_JOBS_PER_USER = 2;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;
const LEASE_MS = 45 * 1000;
const POLL_MS = 1_000;
const PREDICTIVE_NT_ENGINE_SHA256 = '1db1e575d03db871b180bcbb5d4ab015ce84af41a8a7bc0f64910623fd25353d';
const WORKER_OWNER = `${os.hostname()}:${process.pid}:${randomUUID()}`;
let workerStarted = false;
let workerBusy = false;

const SAT_IDENTITIES = new Set([
  'n-dodecane',
  'n-tetradecane',
  'n-hexadecane',
  'n-heptadecane',
]);
const MONO_IDENTITIES = new Set([
  'n-propylbenzene',
  'n-pentylbenzene',
  'sec-butylbenzene',
  '1,3,5-trimethylbenzene',
  'p-xylene',
  'toluene',
]);

export function validatePredictiveNtJobInput(input: PredictiveNtJobInput) {
  if (!Array.isArray(input.feedMoleFractions) || input.feedMoleFractions.length !== 3) {
    throw new Error('INVALID_FEED_COMPOSITION');
  }
  const feedSum = input.feedMoleFractions.reduce((sum, value) => sum + value, 0);
  if (
    input.feedMoleFractions.some((value) => !Number.isFinite(value) || value < 0)
    || Math.abs(feedSum - 1) > 1e-6
    || input.feedMoleFractions[2] > 1e-12
  ) {
    throw new Error('INVALID_FEED_COMPOSITION');
  }
  const maximumStages = input.maximumStages ?? 10;
  if (
    !Number.isFinite(input.temperatureK) || input.temperatureK <= 0
    || !Number.isFinite(input.solventMolarRatio) || input.solventMolarRatio <= 0
    || !Number.isFinite(input.targetRaffinateMonoHydrocarbonMoleFraction)
    || input.targetRaffinateMonoHydrocarbonMoleFraction <= 0
    || input.targetRaffinateMonoHydrocarbonMoleFraction >= 1
    || !Number.isInteger(maximumStages) || maximumStages < 1 || maximumStages > 20
  ) {
    throw new Error('INVALID_CASCADE_INPUT');
  }
  const gate = startPrePilotNt({
    executionMode: 'ECR_PRE_PILOT_PREDICTIVE',
    requestedModelHash: input.modelHash,
    feedCompositionMassFraction: {
      saturates: input.feedMoleFractions[0],
      mono: input.feedMoleFractions[1],
      di: 0,
      poly: 0,
    },
    sulfurObjectiveRequested: false,
  });
  if (!gate.mayRunPredictiveNt) throw new Error(gate.status);
  if (!input.satIdentity?.trim() || !input.monoIdentity?.trim()) {
    throw new Error('MOLECULAR_BASIS_REQUIRED');
  }
  if (!SAT_IDENTITIES.has(input.satIdentity) || !MONO_IDENTITIES.has(input.monoIdentity)) {
    throw new Error('MOLECULAR_IDENTITY_UNAVAILABLE');
  }
  return gate;
}

export function validatePredictiveNtExecutionEvidence(
  job: Pick<PredictiveNtJob, 'input' | 'modelHash' | 'engineHash'>,
  currentEngineHash: string,
) {
  if (currentEngineHash !== job.engineHash) return 'PREDICTIVE_NT_ENGINE_HASH_MISMATCH';
  if (
    job.modelHash !== job.input.modelHash
    || job.modelHash !== PRE_PILOT_MODEL.modelHash
  ) {
    return 'PREDICTIVE_NT_MODEL_HASH_MISMATCH';
  }
  return null;
}

function mapJob(row: any): PredictiveNtJob {
  return {
    id: row.id,
    designId: Number(row.design_id),
    modelHash: row.model_hash,
    engineHash: row.engine_hash,
    status: row.status,
    createdBy: Number(row.created_by),
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    input: row.input_snapshot,
    progress: {
      completedStageTrials: Number(row.completed_trials),
      maximumStages: Number(row.maximum_stages),
    },
    result: row.result_snapshot,
    error: row.error,
  };
}

async function recordHistory(client: any, row: any, details: Record<string, unknown> = {}) {
  await client.query(
    `INSERT INTO ecr_pre_pilot_predictive_nt_job_history
       (job_id, input_snapshot, model_hash, engine_hash, status,
        completed_trials, maximum_stages, worker_owner, attempt_count,
        result_snapshot, error, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      row.id, row.input_snapshot, row.model_hash, row.engine_hash, row.status,
      row.completed_trials, row.maximum_stages, row.worker_owner,
      row.attempt_count, row.result_snapshot, row.error, details,
    ],
  );
}

async function claimNextJob() {
  const claimToken = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `WITH candidate AS (
         SELECT id, status AS previous_status
           FROM ecr_pre_pilot_predictive_nt_jobs
          WHERE status = 'pending'
             OR (status = 'running' AND lease_expires_at < NOW())
          ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
       UPDATE ecr_pre_pilot_predictive_nt_jobs AS job
          SET status = 'running',
              worker_owner = $1,
              claim_token = $2,
              attempt_count = attempt_count + 1,
              lease_expires_at = NOW() + ($3 * INTERVAL '1 millisecond'),
              started_at = COALESCE(started_at, NOW()),
              completed_at = NULL,
              updated_at = NOW()
         FROM candidate
        WHERE job.id = candidate.id
      RETURNING job.*, candidate.previous_status`,
      [WORKER_OWNER, claimToken, LEASE_MS],
    );
    const row = claimed.rows[0];
    if (row) await recordHistory(client, row, {
      event: row.previous_status === 'running' ? 'stale_job_reclaimed' : 'job_claimed',
      previousStatus: row.previous_status,
      claimToken,
    });
    await client.query('COMMIT');
    return row ? { row, claimToken } : null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateProgress(jobId: string, claimToken: string, completed: number, maximum: number) {
  const updated = await pool.query(
    `UPDATE ecr_pre_pilot_predictive_nt_jobs
        SET completed_trials = GREATEST(completed_trials, $3),
            maximum_stages = $4,
            lease_expires_at = NOW() + ($5 * INTERVAL '1 millisecond'),
            updated_at = NOW()
      WHERE id = $1 AND status = 'running' AND claim_token = $2
      RETURNING *`,
    [jobId, claimToken, completed, maximum, LEASE_MS],
  );
  if (updated.rows[0]) await recordHistory(pool, updated.rows[0], { event: 'progress' });
}

async function renewLease(jobId: string, claimToken: string) {
  await pool.query(
    `UPDATE ecr_pre_pilot_predictive_nt_jobs
        SET lease_expires_at = NOW() + ($3 * INTERVAL '1 millisecond'),
            updated_at = NOW()
      WHERE id = $1 AND status = 'running' AND claim_token = $2`,
    [jobId, claimToken, LEASE_MS],
  );
}

async function finishJob(
  jobId: string,
  claimToken: string,
  status: 'completed' | 'failed',
  result: unknown,
  error: string | null,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE ecr_pre_pilot_predictive_nt_jobs
          SET status = $3, result_snapshot = $4, error = $5,
              completed_at = NOW(), lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'running' AND claim_token = $2
        RETURNING *`,
      [jobId, claimToken, status, result, error],
    );
    if (updated.rows[0]) await recordHistory(client, updated.rows[0], { event: 'finished' });
    await client.query('COMMIT');
  } catch (failure) {
    await client.query('ROLLBACK');
    throw failure;
  } finally {
    client.release();
  }
}

function execute(job: PredictiveNtJob, claimToken: string) {
  const script = path.resolve(
    process.cwd(),
    'server/research/ecr-pre-pilot-model-freeze/predictive_nt_cascade.py',
  );
  const engineHash = createHash('sha256').update(fs.readFileSync(script)).digest('hex');
  const evidenceError = validatePredictiveNtExecutionEvidence(job, engineHash);
  if (evidenceError) {
    void finishJob(job.id, claimToken, 'failed', null, evidenceError)
      .finally(() => { workerBusy = false; });
    return;
  }

  const child = spawn('python3.12', [script], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let lastProgress = -1;
  const heartbeat = setInterval(() => {
    void renewLease(job.id, claimToken)
      .catch((error) => console.error('[Predictive N_T] Lease renewal failed:', error));
  }, Math.floor(LEASE_MS / 3));
  heartbeat.unref();
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, JOB_TIMEOUT_MS);

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
    if (stdout.length > 20_000_000) child.kill('SIGKILL');
  });
  child.stderr.on('data', (chunk) => {
    const text = String(chunk);
    stderr += text;
    for (const match of text.matchAll(/PREDICTIVE_NT_PROGRESS\s+(\d+)\s+(\d+)/g)) {
      job.progress = {
        completedStageTrials: Number(match[1]),
        maximumStages: Number(match[2]),
      };
      if (job.progress.completedStageTrials !== lastProgress) {
        lastProgress = job.progress.completedStageTrials;
        void updateProgress(
          job.id,
          claimToken,
          job.progress.completedStageTrials,
          job.progress.maximumStages,
        ).catch((error) => console.error('[Predictive N_T] Progress persistence failed:', error));
      }
    }
    if (stderr.length > 1_000_000) stderr = stderr.slice(-1_000_000);
  });
  child.on('error', (error) => {
    stderr = error.message;
  });
  child.on('close', async (code) => {
    clearTimeout(timeout);
    clearInterval(heartbeat);
    let result: unknown = null;
    try {
      result = stdout ? JSON.parse(stdout) : null;
    } catch {
      result = null;
    }
    const status = code === 0 ? 'completed' : 'failed';
    const error = code === 0 ? null : timedOut
      ? 'PREDICTIVE_NT_JOB_TIMEOUT'
      : (
        (result as { error?: string } | null)?.error
        || stderr.trim()
        || `Python worker exited with code ${code}`
      );
    try {
      await finishJob(job.id, claimToken, status, result, error);
    } catch (failure) {
      console.error('[Predictive N_T] Completion persistence failed:', failure);
    } finally {
      workerBusy = false;
    }
  });
  child.stdin.end(JSON.stringify({ ...job.input, engineHash }));
}

async function pollWorker() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const claimed = await claimNextJob();
    if (!claimed) {
      workerBusy = false;
      return;
    }
    execute(mapJob(claimed.row), claimed.claimToken);
  } catch (error) {
    workerBusy = false;
    console.error('[Predictive N_T] Queue poll failed:', error);
  }
}

export function startPredictiveNtWorker() {
  if (workerStarted) return;
  workerStarted = true;
  const timer = setInterval(() => void pollWorker(), POLL_MS);
  timer.unref();
  void pollWorker();
}

export async function enqueuePredictiveNtJob(
  input: PredictiveNtJobInput,
  userId: number,
  designId: number,
) {
  const gate = validatePredictiveNtJobInput(input);
  const immutableInput = { ...input, modelHash: PRE_PILOT_MODEL.modelHash };
  const jobId = randomUUID();
  const client = await pool.connect();
  let job: PredictiveNtJob;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('ecr_pre_pilot_predictive_nt_enqueue'))`);
    const design = await client.query(
      `SELECT id FROM ecr_pre_pilot_designs WHERE id = $1 AND created_by = $2`,
      [designId, userId],
    );
    if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
    const counts = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE created_by = $1)::int AS user_total
         FROM ecr_pre_pilot_predictive_nt_jobs
        WHERE status IN ('pending', 'running')`,
      [userId],
    );
    if (counts.rows[0].total >= MAX_QUEUED_JOBS) throw new Error('PREDICTIVE_NT_QUEUE_FULL');
    if (counts.rows[0].user_total >= MAX_ACTIVE_JOBS_PER_USER) {
      throw new Error('PREDICTIVE_NT_USER_JOB_LIMIT');
    }
    const inserted = await client.query(
      `INSERT INTO ecr_pre_pilot_predictive_nt_jobs
         (id, design_id, created_by, input_snapshot, model_hash, engine_hash,
          maximum_stages)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        jobId, designId, userId, immutableInput, PRE_PILOT_MODEL.modelHash,
        PREDICTIVE_NT_ENGINE_SHA256, input.maximumStages ?? 10,
      ],
    );
    await recordHistory(client, inserted.rows[0], { event: 'enqueued' });
    await client.query('COMMIT');
    job = mapJob(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  startPredictiveNtWorker();
  return {
    jobId: job.id,
    status: job.status,
    model: PRE_PILOT_MODEL,
    gate,
  };
}

export async function getPredictiveNtJob(jobId: string, userId: number, designId: number) {
  const found = await pool.query(
    `SELECT * FROM ecr_pre_pilot_predictive_nt_jobs
      WHERE id = $1 AND created_by = $2 AND design_id = $3`,
    [jobId, userId, designId],
  );
  return found.rows[0] ? mapJob(found.rows[0]) : null;
}