import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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

const jobs = new Map<string, PredictiveNtJob>();
const pendingJobIds: string[] = [];
const MAX_RETAINED_JOBS = 100;
const MAX_QUEUED_JOBS = 10;
const MAX_ACTIVE_JOBS_PER_USER = 2;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;
const PREDICTIVE_NT_ENGINE_SHA256 = '1db1e575d03db871b180bcbb5d4ab015ce84af41a8a7bc0f64910623fd25353d';
let activeJobId: string | null = null;

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

function trimCompletedJobs() {
  if (jobs.size <= MAX_RETAINED_JOBS) return;
  for (const [id, job] of jobs) {
    if (job.status === 'completed' || job.status === 'failed') jobs.delete(id);
    if (jobs.size <= MAX_RETAINED_JOBS) break;
  }
}

function startNextJob() {
  if (activeJobId !== null) return;
  while (pendingJobIds.length > 0) {
    const next = jobs.get(pendingJobIds.shift()!);
    if (next?.status === 'pending') {
      execute(next);
      return;
    }
  }
}

function execute(job: PredictiveNtJob) {
  activeJobId = job.id;
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  const script = path.resolve(
    process.cwd(),
    'server/research/ecr-pre-pilot-model-freeze/predictive_nt_cascade.py',
  );
  const engineHash = createHash('sha256').update(fs.readFileSync(script)).digest('hex');
  if (engineHash !== PREDICTIVE_NT_ENGINE_SHA256) {
    job.status = 'failed';
    job.error = 'PREDICTIVE_NT_ENGINE_HASH_MISMATCH';
    job.completedAt = new Date().toISOString();
    activeJobId = null;
    startNextJob();
    return;
  }

  const child = spawn('python3.12', [script], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
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
    }
    if (stderr.length > 1_000_000) stderr = stderr.slice(-1_000_000);
  });
  child.on('error', (error) => {
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
  });
  child.on('close', (code) => {
    clearTimeout(timeout);
    try {
      job.result = stdout ? JSON.parse(stdout) : null;
    } catch {
      job.result = null;
    }
    job.status = code === 0 ? 'completed' : 'failed';
    job.error = code === 0 ? null : timedOut
      ? 'PREDICTIVE_NT_JOB_TIMEOUT'
      : (
        (job.result as { error?: string } | null)?.error
        || stderr.trim()
        || `Python worker exited with code ${code}`
      );
    job.completedAt = new Date().toISOString();
    activeJobId = null;
    startNextJob();
  });
  child.stdin.end(JSON.stringify({ ...job.input, engineHash }));
}

export async function enqueuePredictiveNtJob(
  input: PredictiveNtJobInput,
  userId: number,
  designId: number,
) {
  const design = await pool.query(
    `SELECT id
       FROM ecr_pre_pilot_designs
      WHERE id = $1 AND created_by = $2`,
    [designId, userId],
  );
  if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');

  const activeJobs = [...jobs.values()].filter(
    (job) => job.status === 'pending' || job.status === 'running',
  );
  if (activeJobs.length >= MAX_QUEUED_JOBS) throw new Error('PREDICTIVE_NT_QUEUE_FULL');
  if (activeJobs.filter((job) => job.createdBy === userId).length >= MAX_ACTIVE_JOBS_PER_USER) {
    throw new Error('PREDICTIVE_NT_USER_JOB_LIMIT');
  }

  const gate = validatePredictiveNtJobInput(input);
  const job: PredictiveNtJob = {
    id: randomUUID(),
    designId,
    status: 'pending',
    createdBy: userId,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    input: { ...input, modelHash: PRE_PILOT_MODEL.modelHash },
    progress: {
      completedStageTrials: 0,
      maximumStages: input.maximumStages ?? 10,
    },
    result: null,
    error: null,
  };
  jobs.set(job.id, job);
  pendingJobIds.push(job.id);
  trimCompletedJobs();
  setImmediate(startNextJob);
  return {
    jobId: job.id,
    status: job.status,
    model: PRE_PILOT_MODEL,
    gate,
  };
}

export function getPredictiveNtJob(jobId: string, userId: number, designId: number) {
  const job = jobs.get(jobId);
  if (!job || job.createdBy !== userId || job.designId !== designId) return null;
  return job;
}