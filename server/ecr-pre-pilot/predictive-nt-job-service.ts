import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db';
import { PRE_PILOT_MODEL, startPrePilotNt } from './model';
import {
  canonicalizeStage1Input,
  ECR_PRE_PILOT_STAGE1_SCHEMA,
  PREDICTIVE_NT_MOLECULAR_REGISTRY,
  stage1SnapshotHash,
  type EcrPrePilotStage1Snapshot,
} from './stage1';

export interface PredictiveNtJobInput {
  modelHash: string;
  temperatureK: number;
  solventMolarRatio: number;
  feedMoleFractions: [number, number, number];
  satIdentity: string;
  monoIdentity: string;
  sourceFeedCompositionMassFraction: {
    saturates: number;
    mono: number;
    di: number;
    poly: number;
    polar: number;
    nmp: number;
  };
  sourceProductTargetsMassFraction: {
    maximumMono: number;
    minimumSaturates: number;
  };
  sourceSolventOilMassRatio: number;
  targetRaffinateMonoHydrocarbonMoleFraction: number;
  minimumRaffinateSaturatesHydrocarbonMoleFraction?: number;
  maximumStages?: number;
  stage1Authority?: {
    schemaVersion: typeof ECR_PRE_PILOT_STAGE1_SCHEMA;
    savedAt: string;
    snapshotHash: string;
    source: EcrPrePilotStage1Snapshot;
    sulfurPrediction: {
      status: 'NOT_CALCULABLE';
      calibrationStatus: 'CALIBRATION_REQUIRED';
    };
    minimumMassRecovery: {
      targetPercent: number;
      status: 'NOT_CALCULABLE';
    };
  };
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
const JOB_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const LEASE_MS = 45 * 1000;
const POLL_MS = 1_000;
const PREDICTIVE_NT_ENGINE_SHA256 = '70a39141ed6ed3dfb9f0e95b38db459f95752fb9e75beefe767e95b64b35fa32';
const PREDICTIVE_NT_RUNTIME_SUPPORT_SHA256 = {
  'server/research/ecr-pre-pilot-uniquac/model.py':
    'c1130eba32c1b84c55309b71ee88c7ce6297b16c5a465486f5f505158c551ebc',
  'server/research/ecr-pre-pilot-uniquac/structural-provenance.json':
    'ec79321c475d13aabb280caca5bbe2bd1d9b50d1011be2f9623881aef58caf43',
} as const;
const WORKER_OWNER = `${os.hostname()}:${process.pid}:${randomUUID()}`;
let workerStarted = false;
let workerBusy = false;
type RuntimeTestHooks = {
  killAfterAcknowledgedStage?: number;
  replayMismatchAtStage?: number;
};
const runtimeTestHooks = new Map<string, RuntimeTestHooks>();

function runtimeRoot() {
  if (process.env.PREDICTIVE_NT_RUNTIME_ROOT) {
    return path.resolve(process.env.PREDICTIVE_NT_RUNTIME_ROOT);
  }
  return process.env.NODE_ENV === 'production'
    ? path.resolve(process.cwd(), 'dist/predictive-nt-runtime')
    : process.cwd();
}

function workerScript() {
  return path.join(
    runtimeRoot(),
    'server/research/ecr-pre-pilot-model-freeze/predictive_nt_cascade.py',
  );
}

export function preflightPredictiveNtRuntime() {
  const script = workerScript();
  if (!fs.existsSync(script)) throw new Error(`PREDICTIVE_NT_RUNTIME_MISSING: ${script}`);
  const engineHash = createHash('sha256').update(fs.readFileSync(script)).digest('hex');
  if (engineHash !== PREDICTIVE_NT_ENGINE_SHA256) {
    throw new Error('PREDICTIVE_NT_RUNTIME_PREFLIGHT_FAILED: engine hash mismatch');
  }
  for (const [relativePath, expectedHash] of Object.entries(PREDICTIVE_NT_RUNTIME_SUPPORT_SHA256)) {
    const supportPath = path.join(runtimeRoot(), relativePath);
    if (!fs.existsSync(supportPath)) {
      throw new Error(`PREDICTIVE_NT_RUNTIME_MISSING: ${supportPath}`);
    }
    const actualHash = createHash('sha256').update(fs.readFileSync(supportPath)).digest('hex');
    if (actualHash !== expectedHash) {
      throw new Error(`PREDICTIVE_NT_RUNTIME_PREFLIGHT_FAILED: ${relativePath} hash mismatch`);
    }
  }
  const check = spawnSync('python3.12', [script, '--preflight'], {
    cwd: runtimeRoot(),
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (check.error || check.status !== 0) {
    const detail = check.error?.message || check.stderr.trim() || `exit ${check.status}`;
    throw new Error(`PREDICTIVE_NT_RUNTIME_PREFLIGHT_FAILED: ${detail}`);
  }
  let result: any;
  try {
    result = JSON.parse(check.stdout);
  } catch {
    throw new Error('PREDICTIVE_NT_RUNTIME_PREFLIGHT_FAILED: invalid worker response');
  }
  if (
    result.status !== 'PASS'
    || result.python !== '3.12'
    || result.modelHash !== PRE_PILOT_MODEL.modelHash
  ) {
    throw new Error('PREDICTIVE_NT_RUNTIME_PREFLIGHT_FAILED: invalid evidence');
  }
  return result;
}

export { PREDICTIVE_NT_MOLECULAR_REGISTRY };

const SAT_IDENTITIES = new Set<string>(
  PREDICTIVE_NT_MOLECULAR_REGISTRY.saturates.map(({ identity }) => identity),
);
const MONO_IDENTITIES = new Set<string>(
  PREDICTIVE_NT_MOLECULAR_REGISTRY.monoAromatics.map(({ identity }) => identity),
);

export function derivePredictiveNtInputFromStage1(
  rawSnapshot: unknown,
  projectNumber: number,
): PredictiveNtJobInput {
  if (!rawSnapshot || typeof rawSnapshot !== 'object') throw new Error('STAGE1_INPUT_NOT_SAVED');
  const snapshot = rawSnapshot as EcrPrePilotStage1Snapshot;
  if (
    snapshot.schemaVersion !== ECR_PRE_PILOT_STAGE1_SCHEMA
    || !snapshot.savedAt
    || snapshot.sulfurPrediction?.status !== 'NOT_CALCULABLE'
    || snapshot.sulfurPrediction?.calibrationStatus !== 'CALIBRATION_REQUIRED'
  ) {
    throw new Error('STAGE1_INPUT_NOT_SAVED');
  }
  const stage1 = canonicalizeStage1Input(snapshot.stage1, projectNumber);
  if (
    stage1.diAromaticsWt > 1e-12
    || stage1.polyAromaticsWt > 1e-12
    || stage1.polarAromaticsWt > 1e-12
    || stage1.nmpInFeedWt > 1e-12
  ) {
    throw new Error('UNSUPPORTED_COMPONENT_SCOPE');
  }
  if (stage1.phaseConfiguration !== 'nmp-continuous-rrbo-dispersed') {
    throw new Error('UNSUPPORTED_PHASE_CONFIGURATION');
  }
  const sat = PREDICTIVE_NT_MOLECULAR_REGISTRY.saturates
    .find(({ identity }) => identity === stage1.satIdentity)!;
  const mono = PREDICTIVE_NT_MOLECULAR_REGISTRY.monoAromatics
    .find(({ identity }) => identity === stage1.monoIdentity)!;
  const sourceSat = stage1.saturatesWt / 100;
  const sourceMono = stage1.monoAromaticsWt / 100;
  const sourceSatMoles = sourceSat / sat.molecularWeightGmol;
  const sourceMonoMoles = sourceMono / mono.molecularWeightGmol;
  const sourceMoles = sourceSatMoles + sourceMonoMoles;
  if (sourceMoles <= 0) throw new Error('INVALID_STAGE1_COMPOSITION_TOTAL');
  const maximumMono = stage1.targetRaffinateTotalAromaticsWt / 100;
  const minimumSaturates = stage1.minimumRaffinateSaturatesWt / 100;
  const targetMonoMoles = maximumMono / mono.molecularWeightGmol;
  const targetSatMoles = (1 - maximumMono) / sat.molecularWeightGmol;
  const minimumSatMoles = minimumSaturates / sat.molecularWeightGmol;
  const correspondingMonoMoles = (1 - minimumSaturates) / mono.molecularWeightGmol;

  return {
    modelHash: PRE_PILOT_MODEL.modelHash,
    temperatureK: stage1.operatingTemperatureC + 273.15,
    solventMolarRatio: (stage1.solventOilRatio / 99.13) / sourceMoles,
    feedMoleFractions: [
      sourceSatMoles / sourceMoles,
      sourceMonoMoles / sourceMoles,
      0,
    ],
    satIdentity: stage1.satIdentity,
    monoIdentity: stage1.monoIdentity,
    sourceFeedCompositionMassFraction: {
      saturates: sourceSat,
      mono: sourceMono,
      di: 0,
      poly: 0,
      polar: 0,
      nmp: 0,
    },
    sourceProductTargetsMassFraction: {
      maximumMono,
      minimumSaturates,
    },
    sourceSolventOilMassRatio: stage1.solventOilRatio,
    targetRaffinateMonoHydrocarbonMoleFraction:
      targetMonoMoles / (targetMonoMoles + targetSatMoles),
    minimumRaffinateSaturatesHydrocarbonMoleFraction:
      minimumSatMoles / (minimumSatMoles + correspondingMonoMoles),
    maximumStages: stage1.maximumStages,
    stage1Authority: {
      schemaVersion: ECR_PRE_PILOT_STAGE1_SCHEMA,
      savedAt: snapshot.savedAt,
      snapshotHash: stage1SnapshotHash(snapshot),
      source: snapshot,
      sulfurPrediction: snapshot.sulfurPrediction,
      minimumMassRecovery: {
        targetPercent: stage1.minimumRecoveryPct,
        status: 'NOT_CALCULABLE',
      },
    },
  };
}

export function validatePredictiveNtJobInput(input: PredictiveNtJobInput) {
  if ('minimumNmpFreeHydrocarbonRecovery' in input) {
    throw new Error('MASS_RECOVERY_GATE_UNAVAILABLE');
  }
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
      saturates: input.sourceFeedCompositionMassFraction.saturates,
      mono: input.sourceFeedCompositionMassFraction.mono,
      di: input.sourceFeedCompositionMassFraction.di,
      poly: input.sourceFeedCompositionMassFraction.poly,
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
  const sourceFeed = input.sourceFeedCompositionMassFraction;
  if (!sourceFeed || Object.values(sourceFeed).some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('SOURCE_FEED_BASIS_REQUIRED');
  }
  const sourceFeedSum = Object.values(sourceFeed).reduce((sum, value) => sum + value, 0);
  if (Math.abs(sourceFeedSum - 1) > 1e-6) throw new Error('INVALID_SOURCE_FEED_BASIS');
  if (sourceFeed.di > 1e-12 || sourceFeed.poly > 1e-12 || sourceFeed.polar > 1e-12 || sourceFeed.nmp > 1e-12) {
    throw new Error('UNSUPPORTED_COMPONENT_SCOPE');
  }
  const sat = PREDICTIVE_NT_MOLECULAR_REGISTRY.saturates.find(({ identity }) => identity === input.satIdentity)!;
  const mono = PREDICTIVE_NT_MOLECULAR_REGISTRY.monoAromatics.find(({ identity }) => identity === input.monoIdentity)!;
  const sourceSatMoles = sourceFeed.saturates / sat.molecularWeightGmol;
  const sourceMonoMoles = sourceFeed.mono / mono.molecularWeightGmol;
  const sourceMoles = sourceSatMoles + sourceMonoMoles;
  if (
    sourceMoles <= 0
    || Math.abs(input.feedMoleFractions[0] - sourceSatMoles / sourceMoles) > 1e-6
    || Math.abs(input.feedMoleFractions[1] - sourceMonoMoles / sourceMoles) > 1e-6
  ) {
    throw new Error('MOLECULAR_FEED_BASIS_MISMATCH');
  }
  if (!Number.isFinite(input.sourceSolventOilMassRatio) || input.sourceSolventOilMassRatio <= 0) {
    throw new Error('SOURCE_SOLVENT_MASS_BASIS_REQUIRED');
  }
  const expectedSolventMolarRatio = (input.sourceSolventOilMassRatio / 99.13) / sourceMoles;
  if (Math.abs(input.solventMolarRatio - expectedSolventMolarRatio) > 1e-6) {
    throw new Error('MOLECULAR_SOLVENT_BASIS_MISMATCH');
  }
  const sourceTargets = input.sourceProductTargetsMassFraction;
  if (
    !sourceTargets
    || !Number.isFinite(sourceTargets.maximumMono)
    || !Number.isFinite(sourceTargets.minimumSaturates)
    || sourceTargets.maximumMono <= 0
    || sourceTargets.maximumMono >= 1
    || sourceTargets.minimumSaturates <= 0
    || sourceTargets.minimumSaturates >= 1
  ) {
    throw new Error('SOURCE_PRODUCT_TARGET_BASIS_REQUIRED');
  }
  const targetMonoMoles = sourceTargets.maximumMono / mono.molecularWeightGmol;
  const targetSatMoles = (1 - sourceTargets.maximumMono) / sat.molecularWeightGmol;
  const expectedTargetMono = targetMonoMoles / (targetMonoMoles + targetSatMoles);
  const minimumSatMoles = sourceTargets.minimumSaturates / sat.molecularWeightGmol;
  const correspondingMonoMoles = (1 - sourceTargets.minimumSaturates) / mono.molecularWeightGmol;
  const expectedMinimumSat = minimumSatMoles / (minimumSatMoles + correspondingMonoMoles);
  if (
    Math.abs(input.targetRaffinateMonoHydrocarbonMoleFraction - expectedTargetMono) > 1e-6
    || Math.abs((input.minimumRaffinateSaturatesHydrocarbonMoleFraction ?? 0) - expectedMinimumSat) > 1e-6
  ) {
    throw new Error('MOLECULAR_PRODUCT_TARGET_BASIS_MISMATCH');
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

export function attachStage1ResultGovernance(
  pythonResult: unknown,
  input: PredictiveNtJobInput,
) {
  if (!pythonResult || typeof pythonResult !== 'object' || !input.stage1Authority) return pythonResult;
  return {
    ...(pythonResult as Record<string, unknown>),
    stage1TargetGovernance: {
      stage1SnapshotHash: input.stage1Authority.snapshotHash,
      predictiveNtAuthority: 'FROZEN_PYTHON_THERMODYNAMIC_ENGINE',
      supportedAcceptanceBasis: [
        'MAXIMUM_RAFFINATE_MONO_AROMATICS',
        'MINIMUM_RAFFINATE_SATURATES',
        'COMPONENT_BALANCES',
        'INDEPENDENT_THERMODYNAMIC_CHECKS',
      ],
      sulfurPrediction: input.stage1Authority.sulfurPrediction,
      minimumMassRecovery: input.stage1Authority.minimumMassRecovery,
      overallEcrProductAcceptance: false,
      overallEcrProductAcceptanceStatus: 'BLOCKED_BY_NOT_CALCULABLE_TARGETS',
    },
  };
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

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function persistTrialCheckpoint(
  jobId: string,
  claimToken: string,
  stageCount: number,
  trialHash: string,
  canonicalTrial: string,
) {
  if (!/^[a-f0-9]{64}$/.test(trialHash) || canonicalTrial.length > 5_000_000) {
    throw new Error('PREDICTIVE_NT_CHECKPOINT_INVALID');
  }
  if (createHash('sha256').update(canonicalTrial).digest('hex') !== trialHash) {
    throw new Error('PREDICTIVE_NT_CHECKPOINT_HASH_MISMATCH');
  }
  let trial: any;
  try {
    trial = JSON.parse(canonicalTrial);
  } catch {
    throw new Error('PREDICTIVE_NT_CHECKPOINT_INVALID');
  }
  if (!Number.isInteger(stageCount) || stageCount < 1 || trial?.stageCount !== stageCount) {
    throw new Error('PREDICTIVE_NT_CHECKPOINT_SEQUENCE_INVALID');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM ecr_pre_pilot_predictive_nt_jobs
        WHERE id = $1 AND status = 'running' AND claim_token = $2
        FOR UPDATE`,
      [jobId, claimToken],
    );
    const row = locked.rows[0];
    if (!row) throw new Error('PREDICTIVE_NT_CHECKPOINT_STALE_OWNER');
    const existingResult = row.result_snapshot && typeof row.result_snapshot === 'object'
      ? row.result_snapshot as Record<string, any>
      : {};
    const existingTrials = Array.isArray(existingResult.trials) ? [...existingResult.trials] : [];
    const existingHashes = Array.isArray(existingResult.checkpoint?.trialHashes)
      ? [...existingResult.checkpoint.trialHashes]
      : [];
    const completed = Number(row.completed_trials);

    if (stageCount <= completed) {
      if (existingHashes[stageCount - 1] !== trialHash) {
        throw new Error('PREDICTIVE_NT_CHECKPOINT_REPLAY_MISMATCH');
      }
      await client.query('COMMIT');
      return;
    }
    if (stageCount !== completed + 1 || existingTrials.length !== completed) {
      throw new Error('PREDICTIVE_NT_CHECKPOINT_SEQUENCE_INVALID');
    }

    existingTrials.push(trial);
    existingHashes.push(trialHash);
    const checkpointResult = attachStage1ResultGovernance({
      status: 'RUNNING',
      predictiveNt: null,
      establishedTheoreticalStages: null,
      releaseEligible: false,
      calibrationRequired: true,
      trials: existingTrials,
      checkpoint: {
        protocol: 'ACK_V1',
        acknowledgedStageCount: stageCount,
        trialHashes: existingHashes,
      },
    }, row.input_snapshot);
    const updated = await client.query(
      `UPDATE ecr_pre_pilot_predictive_nt_jobs
          SET completed_trials = $3,
              result_snapshot = $4,
              lease_expires_at = NOW() + ($5 * INTERVAL '1 millisecond'),
              updated_at = NOW()
        WHERE id = $1 AND status = 'running' AND claim_token = $2
        RETURNING *`,
      [jobId, claimToken, stageCount, checkpointResult, LEASE_MS],
    );
    if (!updated.rows[0]) throw new Error('PREDICTIVE_NT_CHECKPOINT_STALE_OWNER');
    await recordHistory(client, updated.rows[0], {
      event: 'trial_checkpoint_acknowledged',
      stageCount,
      trialHash,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
    const locked = await client.query(
      `SELECT * FROM ecr_pre_pilot_predictive_nt_jobs
        WHERE id = $1 AND status = 'running' AND claim_token = $2
        FOR UPDATE`,
      [jobId, claimToken],
    );
    const current = locked.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return;
    }
    const checkpointTrials = Array.isArray(current.result_snapshot?.trials)
      ? current.result_snapshot.trials
      : [];
    const checkpointHashes = Array.isArray(current.result_snapshot?.checkpoint?.trialHashes)
      ? current.result_snapshot.checkpoint.trialHashes
      : [];
    const suppliedTrials = result && typeof result === 'object' && Array.isArray((result as any).trials)
      ? (result as any).trials
      : [];
    const suppliedMatchesCheckpoints = checkpointTrials.every(
      (trial: unknown, index: number) => (
        canonicalJson(suppliedTrials[index]) === canonicalJson(trial)
      ),
    );
    let finalStatus = status;
    let finalError = error;
    if (
      status === 'completed'
      && (
        Number(current.completed_trials) !== Number(current.maximum_stages)
        || checkpointHashes.length !== Number(current.maximum_stages)
        || suppliedTrials.length !== Number(current.maximum_stages)
        || !suppliedMatchesCheckpoints
      )
    ) {
      finalStatus = 'failed';
      finalError = 'PREDICTIVE_NT_FINAL_CHECKPOINT_MISMATCH';
    }
    const finalResult = result && typeof result === 'object'
      ? {
        ...(result as Record<string, unknown>),
        trials: suppliedMatchesCheckpoints
          && suppliedTrials.length >= checkpointTrials.length
          ? (result as any).trials
          : checkpointTrials,
        checkpoint: current.result_snapshot?.checkpoint,
      }
      : current.result_snapshot;
    const updated = await client.query(
      `UPDATE ecr_pre_pilot_predictive_nt_jobs
          SET status = $3, result_snapshot = $4, error = $5,
              completed_at = NOW(), lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'running' AND claim_token = $2
        RETURNING *`,
      [jobId, claimToken, finalStatus, finalResult, finalError],
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
  const script = workerScript();
  const engineHash = createHash('sha256').update(fs.readFileSync(script)).digest('hex');
  const evidenceError = validatePredictiveNtExecutionEvidence(job, engineHash);
  if (evidenceError) {
    void finishJob(job.id, claimToken, 'failed', null, evidenceError)
      .finally(() => { workerBusy = false; });
    return;
  }

  const child = spawn('python3.12', [script], {
    cwd: runtimeRoot(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let stderrLineBuffer = '';
  let timedOut = false;
  let checkpointFailure: Error | null = null;
  let checkpointQueue = Promise.resolve();
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
    stderrLineBuffer += text;
    const lines = stderrLineBuffer.split('\n');
    stderrLineBuffer = lines.pop() ?? '';
    for (const line of lines) {
      const checkpoint = /^PREDICTIVE_NT_CHECKPOINT\s+(\d+)\s+([a-f0-9]{64})\s+([A-Za-z0-9+/=]+)$/.exec(line);
      if (checkpoint) {
        const stageCount = Number(checkpoint[1]);
        const trialHash = checkpoint[2];
        const canonicalTrial = Buffer.from(checkpoint[3], 'base64').toString('utf8');
        checkpointQueue = checkpointQueue
          .then(() => persistTrialCheckpoint(
            job.id,
            claimToken,
            stageCount,
            trialHash,
            canonicalTrial,
          ))
          .then(async () => {
            const testHooks = runtimeTestHooks.get(job.id);
            if (
              process.env.NODE_ENV === 'test'
              && testHooks?.replayMismatchAtStage === stageCount
            ) {
              const mismatchedTrial = canonicalTrial.replace(/}$/, ',"testReplayMismatch":true}');
              const mismatchedHash = createHash('sha256').update(mismatchedTrial).digest('hex');
              await persistTrialCheckpoint(
                job.id,
                claimToken,
                stageCount,
                mismatchedHash,
                mismatchedTrial,
              );
            }
            if (!child.killed) {
              child.stdin.write(`PREDICTIVE_NT_ACK ${stageCount} ${trialHash}\n`);
              if (
                process.env.NODE_ENV === 'test'
                && testHooks?.killAfterAcknowledgedStage === stageCount
              ) {
                checkpointFailure = new Error('PREDICTIVE_NT_TEST_TERMINATED_AFTER_ACK');
                child.kill('SIGKILL');
              }
            }
          })
          .catch((error) => {
            checkpointFailure = error instanceof Error ? error : new Error(String(error));
            child.kill('SIGKILL');
          });
        continue;
      }
      stderr += `${line}\n`;
      const progress = /^PREDICTIVE_NT_PROGRESS\s+(\d+)\s+(\d+)$/.exec(line);
      if (!progress) continue;
      job.progress = {
        completedStageTrials: Number(progress[1]),
        maximumStages: Number(progress[2]),
      };
    }
    if (stderr.length > 1_000_000) stderr = stderr.slice(-1_000_000);
  });
  child.on('error', (error) => {
    stderr = error.message;
  });
  child.stdin.on('error', (error) => {
    if (!checkpointFailure) checkpointFailure = error;
  });
  child.on('close', async (code) => {
    clearTimeout(timeout);
    clearInterval(heartbeat);
    await checkpointQueue;
    if (stderrLineBuffer) stderr += stderrLineBuffer;
    let result: unknown = null;
    try {
      result = stdout ? JSON.parse(stdout) : null;
      result = attachStage1ResultGovernance(result, job.input);
    } catch {
      result = null;
    }
    const status = code === 0 && !checkpointFailure ? 'completed' : 'failed';
    const error = status === 'completed' ? null : timedOut
      ? 'PREDICTIVE_NT_JOB_TIMEOUT'
      : (
        checkpointFailure?.message
        || (
        (result as { error?: string } | null)?.error
        || stderr.trim()
        || `Python worker exited with code ${code}`
        )
      );
    try {
      await finishJob(job.id, claimToken, status, result, error);
    } catch (failure) {
      console.error('[Predictive N_T] Completion persistence failed:', failure);
    } finally {
      runtimeTestHooks.delete(job.id);
      workerBusy = false;
    }
  });
  child.stdin.write(`${JSON.stringify({
    ...job.input,
    engineHash,
    _checkpointProtocol: 'ACK_V1',
  })}\n`);
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
  preflightPredictiveNtRuntime();
  workerStarted = true;
  const timer = setInterval(() => void pollWorker(), POLL_MS);
  timer.unref();
  void pollWorker();
}

async function enqueueRawPredictiveNtJob(
  input: PredictiveNtJobInput,
  userId: number,
  designId: number,
  testHooks?: RuntimeTestHooks,
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
  if (testHooks) runtimeTestHooks.set(job.id, testHooks);
  startPredictiveNtWorker();
  return {
    jobId: job.id,
    status: job.status,
    model: PRE_PILOT_MODEL,
    gate,
  };
}

export async function enqueuePredictiveNtRuntimeTestJob(
  input: unknown,
  userId: number,
  designId: number,
  testHooks?: RuntimeTestHooks,
) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('RAW_PREDICTIVE_NT_ENQUEUE_DISABLED');
  }
  return enqueueRawPredictiveNtJob(input, userId, designId, testHooks);
}

export async function enqueuePredictiveNtJobFromSavedStage1(
  userId: number,
  designId: number,
) {
  const jobId = randomUUID();
  const client = await pool.connect();
  let job: PredictiveNtJob;
  let gate: ReturnType<typeof validatePredictiveNtJobInput>;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('ecr_pre_pilot_predictive_nt_enqueue'))`);
    const design = await client.query<{
      id: number;
      project_number: number;
      input_data: unknown;
    }>(
      `SELECT id, project_number, input_data
         FROM ecr_pre_pilot_designs
        WHERE id = $1 AND created_by = $2
        FOR SHARE`,
      [designId, userId],
    );
    if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
    const input = derivePredictiveNtInputFromStage1(
      design.rows[0].input_data,
      Number(design.rows[0].project_number),
    );
    gate = validatePredictiveNtJobInput(input);
    const immutableInput = { ...input, modelHash: PRE_PILOT_MODEL.modelHash };
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
    await recordHistory(client, inserted.rows[0], {
      event: 'enqueued_from_saved_stage1',
      stage1SnapshotHash: input.stage1Authority?.snapshotHash,
      stage1SavedAt: input.stage1Authority?.savedAt,
    });
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
    stage1Authority: job.input.stage1Authority,
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