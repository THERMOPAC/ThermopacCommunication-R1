import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db';
import { PRE_PILOT_MULTISTAGE_MODEL } from './model';
import {
  type PredictiveNtJobInput,
  validatePredictiveNtExecutionEvidence,
  validatePredictiveNtJobInput,
  validateSevenComponentPersistedResult,
} from './predictive-nt-job-service';
import { validateStage1Snapshot, type EcrPrePilotStage1Snapshot } from './stage1';

export const JOB_B_BOUNDARY_COMPONENT_ORDER =
  ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'] as const;
export const JOB_B_DEFAULT_REQUESTED_NT = 7 as const;

type JsonRecord = Record<string, any>;

export type JobBBoundarySourceRow = {
  id: string;
  design_id?: number;
  created_by?: number;
  input_snapshot: unknown;
  result_snapshot: unknown;
  engine_hash: string;
  model_hash: string;
  completed_at?: string | Date | null;
};

export class JobBBoundaryStateError extends Error {
  readonly code: string;
  readonly diagnostics: Readonly<Record<string, unknown>>;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: string, diagnostics: Record<string, unknown> = {}) {
    super(`JOB_B_BOUNDARY_STATE_BLOCKED:${code}`);
    this.name = 'JobBBoundaryStateError';
    this.code = code;
    this.diagnostics = Object.freeze({ ...diagnostics });
    this.details = this.diagnostics;
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('JOB_B_BOUNDARY_NONFINITE_HASH_INPUT');
  }
  return JSON.stringify(value);
}

export function jobBBoundarySourceResultHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function close(left: number, right: number, tolerance = 1e-10): boolean {
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

function assertBoundaryStream(stream: unknown, propertyPath: string): asserts stream is JsonRecord {
  const value = stream as JsonRecord;
  const vectorNames = ['componentMoles', 'moleFractions', 'componentMass', 'massFractions'];
  if (!value || typeof value !== 'object'
    || !Number.isFinite(value.flowMol) || value.flowMol < 0
    || !Number.isFinite(value.mass) || value.mass < 0
    || vectorNames.some(name => !Array.isArray(value[name])
      || value[name].length !== JOB_B_BOUNDARY_COMPONENT_ORDER.length
      || value[name].some((entry: unknown) =>
        typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0))) {
    throw new JobBBoundaryStateError('INVALID_RECORDED_INCOMING_STREAM', { propertyPath });
  }
  const moleTotal = value.componentMoles.reduce((sum: number, entry: number) => sum + entry, 0);
  const massTotal = value.componentMass.reduce((sum: number, entry: number) => sum + entry, 0);
  const moleFractionTotal =
    value.moleFractions.reduce((sum: number, entry: number) => sum + entry, 0);
  const massFractionTotal =
    value.massFractions.reduce((sum: number, entry: number) => sum + entry, 0);
  const moleClosure = value.componentMoles.every((entry: number, index: number) =>
    close(entry, value.flowMol * value.moleFractions[index]));
  const massClosure = value.componentMass.every((entry: number, index: number) =>
    close(entry, value.mass * value.massFractions[index]));
  if (!close(moleTotal, value.flowMol)
    || !close(massTotal, value.mass)
    || !close(moleFractionTotal, 1)
    || !close(massFractionTotal, 1)
    || !moleClosure || !massClosure) {
    throw new JobBBoundaryStateError('RECORDED_INCOMING_STREAM_CLOSURE_FAILED', {
      propertyPath,
      flowMol: value.flowMol,
      componentMolesTotal: moleTotal,
      mass: value.mass,
      componentMassTotal: massTotal,
      moleFractionTotal,
      massFractionTotal,
    });
  }
}

function assertSameStream(
  incoming: JsonRecord,
  boundary: unknown,
  incomingPath: string,
  boundaryPath: string,
) {
  if (!same(incoming, boundary)) {
    throw new JobBBoundaryStateError('COLUMN_BOUNDARY_STREAM_MISMATCH', {
      incomingPath,
      boundaryPath,
    });
  }
}

/**
 * Pure validation/extraction boundary. In particular, this does not calculate
 * equilibrium, N_T, phase properties, or a replacement composition.
 */
export function extractJobBBoundaryState(args: {
  row: JobBBoundarySourceRow;
  currentStage1: unknown;
  requestedNT?: number;
  currentEngineHash: string;
}) {
  const requestedNT = args.requestedNT ?? JOB_B_DEFAULT_REQUESTED_NT;
  if (!Number.isInteger(requestedNT) || requestedNT < 1) {
    throw new JobBBoundaryStateError('REQUESTED_NT_INVALID', { requestedNT });
  }
  const currentStage1 = validateStage1Snapshot(args.currentStage1);
  const input = args.row.input_snapshot as PredictiveNtJobInput;
  try {
    validatePredictiveNtJobInput(input);
  } catch (error) {
    throw new JobBBoundaryStateError('STAGE2_INPUT_INVALID', {
      cause: error instanceof Error ? error.message : String(error),
      jobId: args.row.id,
    });
  }
  if (input.engineContractVersion !== '7C-1.5.0'
    || input.modelHash !== PRE_PILOT_MULTISTAGE_MODEL.modelHash
    || args.row.model_hash !== PRE_PILOT_MULTISTAGE_MODEL.modelHash
    || !same(input.engineComponentContract.families, JOB_B_BOUNDARY_COMPONENT_ORDER)) {
    throw new JobBBoundaryStateError('PINNED_7C_1_5_IDENTITY_REQUIRED', {
      jobId: args.row.id,
      engineContractVersion: input.engineContractVersion ?? null,
      modelHash: args.row.model_hash ?? null,
    });
  }
  if (currentStage1.immutableHash !== input.stage1Authority?.source?.immutableHash
    || input.stage1Authority.snapshotHash !== currentStage1.immutableHash) {
    throw new JobBBoundaryStateError('STALE_STAGE1_AUTHORITY', {
      currentStage1ImmutableHash: currentStage1.immutableHash,
      sourceStage1ImmutableHash: input.stage1Authority?.source?.immutableHash ?? null,
      jobId: args.row.id,
    });
  }
  if (input.temperatureK !== currentStage1.stage1.operatingTemperatureC + 273.15) {
    throw new JobBBoundaryStateError('TEMPERATURE_AUTHORITY_MISMATCH', {
      inputTemperatureK: input.temperatureK,
      currentStage1TemperatureK: currentStage1.stage1.operatingTemperatureC + 273.15,
    });
  }
  const executionError = validatePredictiveNtExecutionEvidence({
    input,
    modelHash: args.row.model_hash,
    engineHash: args.row.engine_hash,
  }, args.currentEngineHash);
  if (executionError) {
    throw new JobBBoundaryStateError(executionError, {
      recordedEngineHash: args.row.engine_hash,
      currentEngineHash: args.currentEngineHash,
      jobId: args.row.id,
    });
  }
  const resultError = validateSevenComponentPersistedResult(
    args.row.result_snapshot,
    { input },
  );
  if (resultError) {
    throw new JobBBoundaryStateError('STAGE2_RESULT_INVALID', {
      validationError: resultError,
      jobId: args.row.id,
    });
  }
  const result = args.row.result_snapshot as JsonRecord;
  if (!same(result.componentOrder, JOB_B_BOUNDARY_COMPONENT_ORDER)
    || result.thermodynamicCondition?.temperatureK !== input.temperatureK) {
    throw new JobBBoundaryStateError('RESULT_IDENTITY_MISMATCH', {
      jobId: args.row.id,
      resultTemperatureK: result.thermodynamicCondition?.temperatureK ?? null,
      inputTemperatureK: input.temperatureK,
    });
  }
  const matching = result.trials.filter((trial: JsonRecord) => trial?.stageCount === requestedNT);
  const trial = matching.length === 1
    ? matching[0]
    : matching.length === 0 && result.trials.length === 1
      ? result.trials[0]
      : null;
  if (!trial || !Number.isInteger(trial.stageCount) || trial.stageCount < 1) {
    throw new JobBBoundaryStateError('NO_UNAMBIGUOUS_RECORDED_TRIAL', {
      requestedNT,
      recordedStageCounts: result.trials.map((candidate: JsonRecord) =>
        candidate?.stageCount ?? null),
      jobId: args.row.id,
    });
  }
  const stages = trial.stages.filter((stage: JsonRecord) => stage?.stageFromFeedEnd === 1);
  if (stages.length !== 1) {
    throw new JobBBoundaryStateError('FEED_END_STAGE_NOT_UNIQUE', {
      requestedNT,
      sourceStageCount: trial.stageCount,
      feedEndStageMatches: stages.length,
      jobId: args.row.id,
    });
  }
  const stage = stages[0];
  const extractPath = `result_snapshot.trials[stageCount=${trial.stageCount}]`
    + '.stages[stageFromFeedEnd=1].extractIncoming';
  const raffinatePath = `result_snapshot.trials[stageCount=${trial.stageCount}]`
    + '.stages[stageFromFeedEnd=1].raffinateIncoming';
  assertBoundaryStream(stage.extractIncoming, extractPath);
  assertBoundaryStream(stage.raffinateIncoming, raffinatePath);
  assertSameStream(
    stage.raffinateIncoming,
    trial.boundaryStreams?.oilFeed,
    raffinatePath,
    `result_snapshot.trials[stageCount=${trial.stageCount}].boundaryStreams.oilFeed`,
  );
  if (trial.stageCount === 1) {
    assertSameStream(
      stage.extractIncoming,
      trial.boundaryStreams?.freshWetSolvent,
      extractPath,
      `result_snapshot.trials[stageCount=${trial.stageCount}].boundaryStreams.freshWetSolvent`,
    );
  }
  const resultSnapshotHash = jobBBoundarySourceResultHash(args.row.result_snapshot);
  const qualification = Object.freeze({
    basis: 'RECORDED_STAGE2_INCOMING_BOUNDARY_BULK',
    inletBoundaryKnown: true,
    equilibriumOutletClaimed: false,
    acceptedLleClaimed: false,
    mayBeUsedWhenRecordedOutputsFailed: true,
  });
  const provenance = Object.freeze({
    stage2JobId: args.row.id,
    resultSnapshotHash,
    engineHash: args.row.engine_hash,
    modelHash: args.row.model_hash,
    engineContractVersion: input.engineContractVersion,
    stage1ImmutableHash: currentStage1.immutableHash,
    temperatureK: input.temperatureK,
    componentOrder: [...JOB_B_BOUNDARY_COMPONENT_ORDER],
    stageFromFeedEnd: 1 as const,
    sourceStageCount: trial.stageCount as number,
    requestedNT,
    requestedNtWasDirectlyRecorded: trial.stageCount === requestedNT,
  });
  const makeBoundary = (
    role: 'extractIncoming' | 'raffinateIncoming',
    phaseIdentity: 'EXTRACT_PHASE_BULK' | 'RAFFINATE_PHASE_BULK',
    stream: JsonRecord,
    propertyPath: string,
  ) => Object.freeze({
    role,
    phaseIdentity,
    source: 'GOVERNED_STAGE2_RECORDED_INCOMING_BOUNDARY' as const,
    propertyPath,
    normalizedAsSaved: true as const,
    stageAccepted: stage.accepted === true,
    trialAccepted: trial.accepted === true,
    qualification,
    stream: Object.freeze(stream),
  });
  const extractIncoming = makeBoundary(
    'extractIncoming', 'EXTRACT_PHASE_BULK', stage.extractIncoming, extractPath,
  );
  const raffinateIncoming = makeBoundary(
    'raffinateIncoming', 'RAFFINATE_PHASE_BULK', stage.raffinateIncoming, raffinatePath,
  );
  return Object.freeze({
    status: 'RECORDED_STAGE2_INCOMING_BOUNDARIES_VALIDATED' as const,
    requestedNT,
    sourceStageCount: trial.stageCount as number,
    stageFromFeedEnd: 1 as const,
    componentOrder: [...JOB_B_BOUNDARY_COMPONENT_ORDER],
    temperatureK: input.temperatureK,
    trialAccepted: trial.accepted === true,
    stageAccepted: stage.accepted === true,
    extractIncoming,
    raffinateIncoming,
    boundaryStates: Object.freeze([extractIncoming, raffinateIncoming]),
    provenance,
  });
}

/**
 * Resolves the hash of the deployed 7C-1.5 worker. The extraction API accepts
 * this value explicitly so its validator remains deterministic and unit
 * testable.
 */
export function currentJobBBoundaryStage2EngineHash(): string {
  const root = process.env.PREDICTIVE_NT_RUNTIME_ROOT
    ? path.resolve(process.env.PREDICTIVE_NT_RUNTIME_ROOT)
    : process.env.NODE_ENV === 'production'
      ? path.resolve(process.cwd(), 'dist/predictive-nt-runtime-7c-1-5')
      : process.cwd();
  const script = path.join(
    root,
    'server/ecr-pre-pilot/predictive-nt-seven-component-v1-5/worker.py',
  );
  if (!fs.existsSync(script)) {
    throw new JobBBoundaryStateError('CURRENT_STAGE2_ENGINE_UNAVAILABLE', { script });
  }
  const checked = spawnSync('python3.12', [script, '--preflight'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (checked.error || checked.status !== 0) {
    throw new JobBBoundaryStateError('CURRENT_STAGE2_ENGINE_PREFLIGHT_FAILED', {
      cause: checked.error?.message || checked.stderr.trim() || `exit ${checked.status}`,
    });
  }
  let evidence: JsonRecord;
  try {
    evidence = JSON.parse(checked.stdout);
  } catch {
    throw new JobBBoundaryStateError('CURRENT_STAGE2_ENGINE_PREFLIGHT_INVALID');
  }
  if (evidence.status !== 'PASS'
    || evidence.engineContractVersion !== '7C-1.5.0'
    || evidence.engineId !== 'ECR2_PRE_PILOT_SEVEN_COMPONENT_0P5_5P0_H2O'
    || !same(evidence.componentOrder, JOB_B_BOUNDARY_COMPONENT_ORDER)
    || typeof evidence.engineHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(evidence.engineHash)) {
    throw new JobBBoundaryStateError('CURRENT_STAGE2_ENGINE_PREFLIGHT_INVALID');
  }
  const configured = process.env.PREDICTIVE_NT_7C_1_5_ENGINE_SHA256;
  if (configured && configured !== evidence.engineHash) {
    throw new JobBBoundaryStateError('CURRENT_STAGE2_ENGINE_HASH_MISMATCH', {
      configuredEngineHash: configured,
      preflightEngineHash: evidence.engineHash,
    });
  }
  return evidence.engineHash;
}

type BoundaryLoaderDependencies = {
  query: (
    text: string,
    values: any[],
  ) => Promise<{ rows: any[] }>;
  currentEngineHash: () => string;
};

export async function loadJobBBoundaryState(
  userId: number,
  designId: number,
  requestedNT = JOB_B_DEFAULT_REQUESTED_NT,
  dependencies: BoundaryLoaderDependencies = {
    query: pool.query.bind(pool),
    currentEngineHash: currentJobBBoundaryStage2EngineHash,
  },
) {
  if (!Number.isInteger(userId) || userId < 1
    || !Number.isInteger(designId) || designId < 1) {
    throw new JobBBoundaryStateError('OWNER_OR_DESIGN_INVALID', { userId, designId });
  }
  const found = await dependencies.query(
    `SELECT d.input_data AS current_stage1,
            j.id, j.design_id, j.created_by, j.input_snapshot,
            j.result_snapshot, j.engine_hash, j.model_hash, j.completed_at
       FROM ecr_pre_pilot_designs d
       LEFT JOIN LATERAL (
         SELECT id, design_id, created_by, input_snapshot, result_snapshot,
                engine_hash, model_hash, completed_at, created_at
           FROM ecr_pre_pilot_predictive_nt_jobs
          WHERE design_id = d.id
            AND created_by = $1
            AND status = 'completed'
            AND input_snapshot->>'engineContractVersion' = '7C-1.5.0'
          ORDER BY completed_at DESC NULLS LAST, created_at DESC, id DESC
          LIMIT 1
       ) j ON TRUE
      WHERE d.id = $2 AND d.created_by = $1`,
    [userId, designId],
  );
  const row = found.rows[0] as (JobBBoundarySourceRow & { current_stage1: unknown }) | undefined;
  if (!row) {
    throw new JobBBoundaryStateError('OWNED_DESIGN_NOT_FOUND', { userId, designId });
  }
  if (!row.id || !row.result_snapshot) {
    throw new JobBBoundaryStateError('LATEST_COMPLETED_7C_1_5_STAGE2_NOT_FOUND', {
      userId,
      designId,
    });
  }
  if (Number(row.design_id) !== designId || Number(row.created_by) !== userId) {
    throw new JobBBoundaryStateError('STAGE2_OWNERSHIP_MISMATCH', {
      userId,
      designId,
      recordedOwner: row.created_by ?? null,
      recordedDesign: row.design_id ?? null,
    });
  }
  let currentStage1: EcrPrePilotStage1Snapshot;
  try {
    currentStage1 = validateStage1Snapshot(row.current_stage1);
  } catch (error) {
    throw new JobBBoundaryStateError('CURRENT_STAGE1_INVALID', {
      cause: error instanceof Error ? error.message : String(error),
      designId,
    });
  }
  return extractJobBBoundaryState({
    row,
    currentStage1,
    requestedNT,
    currentEngineHash: dependencies.currentEngineHash(),
  });
}