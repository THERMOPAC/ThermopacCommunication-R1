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
  jobCScientificResultHash,
  type JobCProgress,
  JOB_C_TEMPORARY_DIAGNOSTIC_MODE,
  JOB_C_WORKFLOW_TEST_ONLY_MODE,
  validateJobCWorkflowTestOnlyWorkerResponse,
  workflowTestOnlyCompletionClaimed,
} from './job-c';
import { validateStage1Snapshot } from './stage1';
import { assessAcceptedJobCForPhysicalSizing } from './job-c-physical-sizing';

const OWNER = `job-c:${process.pid}:${randomUUID()}`;
const POLL_MS = Number(process.env.JOB_C_POLL_MS ?? 1_000);
const LEASE_MS = Number(process.env.JOB_C_LEASE_MS ?? 30_000);
let started = false;
let busy = false;
const activeControllers = new Map<string, AbortController>();

type EnqueueReuse = {
  reused: boolean;
  reason: 'UNCHANGED_TERMINAL_BLOCKED_JOB_C' | 'NEW_JOB_ENQUEUED';
  evidence: Record<string, string>;
};

const PARTIAL_SCHEMA = 'ECR_JOB_C_PARTIAL_V1';
const STRICT_DIAGNOSTIC_LAMBDA = JOB_C_TEMPORARY_DIAGNOSTIC_MODE.terminalLambda;
const STRICT_DIAGNOSTIC_HEIGHT = JOB_C_TEMPORARY_DIAGNOSTIC_MODE.heightTrialM;
const HASH = /^[a-f0-9]{64}$/;
const STRICT_ANCHOR_SCHEMA = 'ECR_JOB_C_STRICT_PARTIAL_CONTINUATION_ANCHOR_V1';
const STRICT_ANCHOR_LAMBDA = 8e-9;
const STRICT_ANCHOR_HEIGHT_M = 2;
const hashPattern = /^[a-f0-9]{64}$/;
// This is the fully pinned worker digest on the already accepted diagnostic
// record. It remains admissible solely as a source for re-evaluation by the
// current continuation worker, never as a substitute for current execution.
const HISTORICAL_STRICT_DIAGNOSTIC_WORKER_SHA256 =
  '2c2e266b8424bfc2dc9917294bf758da7517c2d3896626f7aad31de37b197c25';

export function validateJobCWorkerResponseStatus(result: {
  status: string;
  workerResult?: Record<string, any>;
}) {
  if (result.status !== 'BLOCKED_PRELIMINARY_JOB_C'
    && result.status !== 'CALCULATED_PRELIMINARY_JOB_C'
    && result.status !== 'CALCULATED_DIAGNOSTIC_PARTIAL_JOB_C'
    && result.status !== 'CALCULATED_WORKFLOW_TEST_ONLY_JOB_C') {
    throw new JobCError('JOB_C_WORKER_RESPONSE_STATUS_INVALID', {
      workerStatus: result.status,
      workerResult: result.workerResult,
    });
  }
}

export function jobCCheckpointRequestPayload(request: Record<string, any>) {
  const pristine = { ...request };
  delete pristine.protocol;
  delete pristine.operation;
  delete pristine.resumeCheckpoint;
  return pristine;
}

function pristineRequestHash(snapshot: any) {
  const request = snapshot?.prepared?.workerRequest;
  if (!request || typeof request !== 'object') {
    throw new JobCError('JOB_C_CHECKPOINT_REQUEST_MISSING');
  }
  return jobCResultHash(jobCCheckpointRequestPayload(request));
}

function exactStrictDiagnosticMode(mode: any) {
  return mode?.mode === JOB_C_TEMPORARY_DIAGNOSTIC_MODE.mode
    && mode?.terminalLambda === STRICT_DIAGNOSTIC_LAMBDA
    && mode?.heightTrialM === STRICT_DIAGNOSTIC_HEIGHT
    && mode?.normalAcceptancePermitted === false
    && mode?.workflowTestOnly !== true;
}

function confirmationEvidenceIsUncached(value: any) {
  return value?.independentRawReevaluationCount === 2
    && value?.bothScientificGateEvaluationsPassed === true
    && value?.exactlyRepeatable === true
    && value?.maximumMetricDifference === 0;
}

function gateMetricsAreAccepted(value: any) {
  return value?.rawFvGatePassed === true
    && value?.scaledFvGatePassed === true
    && value?.originalJobBGatePassed === true
    && value?.strictPositivityPassed === true
    && value?.accepted === true
    && [value?.rawFvResidualMolS, value?.scaledFvResidual,
      value?.maximumOriginalJobBGateResidual, value?.minimumFlowMolS]
      .every(item => typeof item === 'number' && Number.isFinite(item));
}

function diagnosticAnchorFromCheckpoint(row: any, sourceRequestHash: string) {
  const checkpoint = row?.partial_result_snapshot;
  if (!checkpoint
    || typeof row.partial_result_hash !== 'string'
    || !HASH.test(row.partial_result_hash)
    || jobCResultHash(checkpoint) !== row.partial_result_hash
    || checkpoint.schemaVersion !== PARTIAL_SCHEMA
    || checkpoint.complete !== false
    || checkpoint.requestSha256 !== sourceRequestHash
    || !Array.isArray(checkpoint.completedResults)) {
    return null;
  }
  const matches = checkpoint.completedResults.filter((candidate: any) =>
    candidate?.kind === 'ACCEPTED_COUPLED_CONTINUATION_ANCHOR'
    && candidate?.inputSha256 === sourceRequestHash
    && candidate?.value?.heightM === STRICT_DIAGNOSTIC_HEIGHT
    && candidate?.value?.lambda === STRICT_DIAGNOSTIC_LAMBDA);
  if (matches.length !== 1) return null;
  const completed = matches[0];
  const value = completed.value;
  const state = value?.state;
  if (!completed || !value
    || value.heightM !== STRICT_DIAGNOSTIC_HEIGHT
    || value.lambda !== STRICT_DIAGNOSTIC_LAMBDA
    || !Array.isArray(state) || state.length !== 189
    || state.some((item: unknown) => typeof item !== 'number' || !Number.isFinite(item))
    || !HASH.test(String(value.stateSha256 ?? ''))
    || jobCResultHash(state) !== value.stateSha256
    || !confirmationEvidenceIsUncached(value.deterministicConfirmation)) {
    return null;
  }
  return {
    checkpoint,
    completed,
    value,
    stateSha256: value.stateSha256,
  };
}

function sourceImplementationCompatible(sourceHash: unknown, currentHash: string) {
  return sourceHash === currentHash
    || sourceHash === HISTORICAL_STRICT_DIAGNOSTIC_WORKER_SHA256;
}

export function strictContinuationAttestationIsValid(worker: any, anchor: any) {
  const attestation = worker?.strictContinuationAnchorAttestation;
  const targets = attestation?.higherLambdaTargets;
  return attestation?.schemaVersion
      === 'ECR_JOB_C_STRICT_CONTINUATION_COMPLETION_ATTESTATION_V1'
    && attestation?.status
      === 'ANCHOR_CONSUMED_AND_REEVALUATED_BEFORE_HIGHER_LAMBDA'
    && attestation?.sourceJobId === anchor?.sourceJobId
    && attestation?.sourceProfileStateSha256 === anchor?.profileStateSha256
    && attestation?.consumedProfileStateSha256 === anchor?.profileStateSha256
    && attestation?.lambda === STRICT_ANCHOR_LAMBDA
    && attestation?.heightM === STRICT_ANCHOR_HEIGHT_M
    && attestation?.independentExactReevaluationCount === 2
    && attestation?.higherLambdaTargetReached === true
    && Array.isArray(targets)
    && targets[0] === STRICT_ANCHOR_LAMBDA
    && targets.some((lambda: unknown) => typeof lambda === 'number'
      && lambda > STRICT_ANCHOR_LAMBDA)
    && targets.includes(1);
}

/** Fail closed at the execution boundary for every continuation response. */
export function validateStrictContinuationExecutionResponse(
  result: any,
  frozenAnchor: any,
) {
  if (frozenAnchor == null) return;
  if (result?.status === 'BLOCKED_PRELIMINARY_JOB_C') return;
  const ordinaryCalculated = result?.status === 'CALCULATED_PRELIMINARY_JOB_C'
    && result?.workerResult?.status === 'CALCULATED_PRELIMINARY_JOB_C';
  if (!ordinaryCalculated) {
    throw new JobCError('JOB_C_STRICT_CONTINUATION_RESPONSE_INVALID', {
      required: 'BLOCKED_PRELIMINARY_JOB_C or matching calculated wrapper and worker response',
      wrapperStatus: result?.status ?? null,
      workerStatus: result?.workerResult?.status ?? null,
    });
  }
  if (!strictContinuationAttestationIsValid(result.workerResult, frozenAnchor)) {
    throw new JobCError('JOB_C_STRICT_CONTINUATION_COMPLETION_ATTESTATION_INVALID', {
      sourceJobId: frozenAnchor?.sourceJobId ?? null,
      workerAttestation: result.workerResult?.strictContinuationAnchorAttestation
        ?? null,
    });
  }
}

function validatedStrictDiagnosticAnchor(row: any) {
  const snapshot = row?.input_snapshot;
  const prepared = snapshot?.prepared;
  const sourceMode = prepared?.responseBasis?.diagnosticMode;
  const result = row?.result_snapshot;
  const worker = result?.workerResult;
  const endpoint = worker?.diagnosticPartialEndpoint;
  if (!snapshot || !prepared || !exactStrictDiagnosticMode(sourceMode)
    || row.status !== 'completed' || !row.completed_at
    || !result || !HASH.test(String(row.input_hash ?? ''))
    || jobCResultHash(snapshot) !== row.input_hash
    || !HASH.test(String(row.result_hash ?? ''))
    || jobCScientificResultHash(result) !== row.result_hash
    || result.resultSha256 !== jobCResultHash(result)
    || result.status !== 'CALCULATED_DIAGNOSTIC_PARTIAL_JOB_C'
    || worker?.status !== 'CALCULATED_DIAGNOSTIC_PARTIAL_JOB_C'
    || !HASH.test(String(worker?.resultSha256 ?? ''))
    || jobCScientificResultHash(worker) !== worker?.resultSha256
    || worker?.resultSha256 !== jobCScientificResultHash(worker)
    || worker?.diagnosticOnly !== true
    || !exactStrictDiagnosticMode(worker?.diagnosticMode)
    || worker?.workflowTestOnly === true
    || result?.workflowTestOnly === true
    || endpoint?.status !== 'QUALIFIED_PARTIAL_TRANSFER_ENDPOINT'
    || endpoint?.lambda !== STRICT_DIAGNOSTIC_LAMBDA
    || endpoint?.heightTrialM !== STRICT_DIAGNOSTIC_HEIGHT
    || !gateMetricsAreAccepted({
      ...(endpoint?.gateMetrics ?? {}),
      ...(endpoint?.gateDecision ?? {}),
    })
    || !confirmationEvidenceIsUncached(endpoint?.deterministicConfirmation)) {
    return null;
  }
  const sourceRequestHash = pristineRequestHash(snapshot);
  const anchor = diagnosticAnchorFromCheckpoint(row, sourceRequestHash);
  if (!anchor || !gateMetricsAreAccepted({
    ...(anchor.value.gateMetrics ?? {}),
    ...(endpoint?.gateDecision ?? {}),
  }) || jobCResultHash({
    rawFvResidualMolS: anchor.value.gateMetrics?.rawFvResidualMolS,
    scaledFvResidual: anchor.value.gateMetrics?.scaledFvResidual,
    maximumOriginalJobBGateResidual:
      anchor.value.gateMetrics?.maximumOriginalJobBGateResidual,
    minimumFlowMolS: anchor.value.gateMetrics?.minimumFlowMolS,
  }) !== jobCResultHash(endpoint?.gateMetrics)
    || jobCResultHash(anchor.value.deterministicConfirmation)
      !== jobCResultHash(endpoint?.deterministicConfirmation)) return null;
  return {
    row,
    snapshot,
    prepared,
    sourceRequestHash,
    result,
    worker,
    endpoint,
    anchor,
  };
}

export function validateJobCCheckpoint(
  checkpoint: Record<string, any>,
  expectedRequestHash: string,
) {
  const failures = [
    checkpoint?.schemaVersion === PARTIAL_SCHEMA ? null : 'SCHEMA_VERSION',
    checkpoint?.complete === false ? null : 'COMPLETE_FLAG',
    checkpoint?.requestSha256 === expectedRequestHash ? null : 'REQUEST_SHA256',
    Array.isArray(checkpoint?.completedResults) ? null : 'COMPLETED_RESULTS',
    checkpoint?.progress && typeof checkpoint.progress.phase === 'string'
      ? null : 'PROGRESS',
  ].filter(Boolean);
  if (failures.length) {
    throw new JobCError('JOB_C_CHECKPOINT_INVALID', {
      failures,
      expectedRequestHash,
      observedRequestHash: checkpoint?.requestSha256 ?? null,
    });
  }
}

function validPartial(row: any) {
  const partial = row?.partial_result_snapshot;
  return partial != null
    && typeof row.partial_result_hash === 'string'
    && /^[a-f0-9]{64}$/.test(row.partial_result_hash)
    && jobCResultHash(partial) === row.partial_result_hash
    && partial.schemaVersion === PARTIAL_SCHEMA
    && partial.complete === false
    && partial.requestSha256 === pristineRequestHash(row.input_snapshot)
    && Array.isArray(partial.completedResults)
    && partial.progress && typeof partial.progress.phase === 'string';
}

/**
 * Diagnostic mode is intentionally the sole scientific-request difference
 * permitted between the completed strict diagnostic and its future full Job-C
 * continuation. workerRequestSha256 is derived from that request, so it is
 * normalized from the diagnostic-free request rather than ignored.
 */
function diagnosticFreePrepared(prepared: any) {
  const workerRequest = { ...(prepared?.workerRequest ?? {}) };
  delete workerRequest.diagnosticMode;
  delete workerRequest.continuationAnchor;
  const responseBasis = { ...(prepared?.responseBasis ?? {}) };
  delete responseBasis.diagnosticMode;
  delete responseBasis.continuationAnchor;
  const dependencies = { ...(responseBasis.dependencies ?? {}) };
  delete dependencies.continuationAnchorSha256;
  dependencies.workerRequestSha256 = jobCResultHash(workerRequest);
  return {
    ...prepared,
    workerRequest,
    responseBasis: { ...responseBasis, dependencies },
  };
}

function sameGeometry(sourceRequest: any, currentRequest: any) {
  const fields = [
    'temperatureK', 'phaseConfiguration', 'compartments', 'columnDiameterM',
    'rpm', 'operatingHoldup', 'd32M', 'continuousTotalConcentrationMolM3',
    'dispersedTotalConcentrationMolM3', 'minimumRecoveryPct',
    'axialLocalContactProfileSha256',
  ];
  return fields.every(field => sourceRequest?.[field] === currentRequest?.[field])
    && jobCResultHash({
      continuousFeedMolS: sourceRequest?.continuousFeedMolS,
      dispersedFeedMolS: sourceRequest?.dispersedFeedMolS,
      kc: sourceRequest?.kc,
      kd: sourceRequest?.kd,
      boundaryBranchQualificationRequest: sourceRequest?.boundaryBranchQualificationRequest,
      axialLocalContactProfile: sourceRequest?.axialLocalContactProfile,
    }) === jobCResultHash({
      continuousFeedMolS: currentRequest?.continuousFeedMolS,
      dispersedFeedMolS: currentRequest?.dispersedFeedMolS,
      kc: currentRequest?.kc,
      kd: currentRequest?.kd,
      boundaryBranchQualificationRequest: currentRequest?.boundaryBranchQualificationRequest,
      axialLocalContactProfile: currentRequest?.axialLocalContactProfile,
    });
}

function strictContinuationAnchorFromSource(source: any, prepared: any, artifacts: ReturnType<typeof currentJobCArtifactHashes>) {
  const validated = validatedStrictDiagnosticAnchor(source);
  const sourcePrepared = source?.input_snapshot?.prepared;
  const sourceRequest = sourcePrepared?.workerRequest;
  const currentRequest = prepared?.workerRequest;
  const sourceDependencies = sourcePrepared?.responseBasis?.dependencies;
  const currentDependencies = prepared?.responseBasis?.dependencies;
  const normalizedSource = diagnosticFreePrepared(sourcePrepared);
  const normalizedCurrent = diagnosticFreePrepared(prepared);
  const normalizedSourceDependencies = { ...(sourceDependencies ?? {}) };
  const normalizedCurrentDependencies = { ...(currentDependencies ?? {}) };
  delete normalizedSourceDependencies.workerRequestSha256;
  delete normalizedCurrentDependencies.workerRequestSha256;
  const compatible = validated != null
    && jobCResultHash(normalizedSource) === jobCResultHash(normalizedCurrent)
    && jobCResultHash(normalizedSourceDependencies)
      === jobCResultHash(normalizedCurrentDependencies)
    && sameGeometry(sourceRequest, currentRequest)
    && source?.candidate_hash === artifacts.candidateHash
    && sourceImplementationCompatible(source?.implementation_hash,
      artifacts.implementationHash)
    && source?.job_b_engine_hash === currentDependencies?.jobBInterfaceWorkerSha256
    && sourceDependencies?.jobCBoundaryInterfaceQualifierSha256
      === artifacts.boundaryQualifierHash
    && sourceDependencies?.jobCBranchContinuationSha256
      === artifacts.branchContinuationHash
    && hashPattern.test(source?.implementation_hash ?? '');
  if (!validated || !compatible) {
    throw new JobCError('JOB_C_STRICT_CONTINUATION_ANCHOR_INVALID', {
      sourceJobId: source?.id ?? null,
      failures: [
        ...(validated ? [] : ['SOURCE_STATUS_OR_ENDPOINT_OR_CHECKPOINT_INTEGRITY']),
        ...(compatible ? [] : ['SCIENTIFIC_DEPENDENCY_OR_GEOMETRY_MISMATCH']),
      ],
    });
  }
  const gateMetrics = {
    rawFvResidualMolS: validated.anchor.value.gateMetrics.rawFvResidualMolS,
    scaledFvResidual: validated.anchor.value.gateMetrics.scaledFvResidual,
    maximumOriginalJobBGateResidual:
      validated.anchor.value.gateMetrics.maximumOriginalJobBGateResidual,
    minimumFlowMolS: validated.anchor.value.gateMetrics.minimumFlowMolS,
  };
  const lineage = {
    schemaVersion: STRICT_ANCHOR_SCHEMA,
    sourceJobId: source.id,
    sourceInputSha256: source.input_hash,
    sourcePreparedSha256: jobCResultHash(sourcePrepared),
    sourceResultSha256: source.result_hash,
    sourcePartialResultSha256: source.partial_result_hash,
    sourceCheckpointRequestSha256: validated.anchor.checkpoint.requestSha256,
    sourceRequestSha256: validated.sourceRequestHash,
    sourceWorkerResultSha256: validated.worker?.resultSha256,
    sourceImplementationSha256: source.implementation_hash,
    continuationWorkerImplementationSha256: artifacts.implementationHash,
    sourceImplementationCompatibility: source.implementation_hash
      === artifacts.implementationHash ? 'CURRENT_WORKER_EXACT'
      : 'HISTORICAL_STRICT_DIAGNOSTIC_WORKER_ALLOWLISTED',
    sourceCandidateSha256: source.candidate_hash,
    sourceDependencyLineageSha256: jobCResultHash(sourceDependencies),
    lambda: STRICT_ANCHOR_LAMBDA,
    heightM: STRICT_ANCHOR_HEIGHT_M,
    profileStateSha256: validated.anchor.stateSha256,
    profileState: validated.anchor.value.state,
    gateMetrics,
    gateDecision: validated.endpoint.gateDecision,
    deterministicConfirmation: validated.anchor.value.deterministicConfirmation,
    endpointConfirmation: validated.endpoint.deterministicConfirmation,
    sourceScientificLineageHash: jobCResultHash({
      workerRequest: normalizedSource.workerRequest,
      responseBasis: normalizedSource.responseBasis,
    }),
    qualification: 'ACCEPTED_PARTIAL_TRANSFER_CONTINUATION_ANCHOR_ONLY_NOT_ENGINEERING_ANCHOR',
  };
  return {
    lineage,
    workerContract: {
      ...lineage,
      sourceJobId: String(source.id),
      sourceInputSha256: source.input_hash,
      sourcePreparedSha256: jobCResultHash(sourcePrepared),
      sourceResultSha256: source.result_hash,
      sourceWorkerResultSha256: validated.worker?.resultSha256,
      sourceImplementationSha256: source.implementation_hash,
      continuationWorkerImplementationSha256: artifacts.implementationHash,
      sourceCandidateSha256: source.candidate_hash,
      sourceDependencyLineageSha256: jobCResultHash(sourceDependencies),
      sourcePartialResultSha256: source.partial_result_hash,
      sourceCheckpointRequestSha256: validated.anchor.checkpoint.requestSha256,
      profileStateSha256: validated.anchor.stateSha256,
      profileState: validated.anchor.value.state,
    },
  };
}

function preparedWithStrictContinuationAnchor(prepared: any, anchor: ReturnType<typeof strictContinuationAnchorFromSource>) {
  const workerRequest = {
    ...prepared.workerRequest,
    continuationAnchor: anchor.workerContract,
  };
  return {
    ...prepared,
    workerRequest,
    responseBasis: {
      ...prepared.responseBasis,
      continuationAnchor: anchor.lineage,
      dependencies: {
        ...prepared.responseBasis.dependencies,
        workerRequestSha256: jobCResultHash(workerRequest),
        continuationAnchorSha256: jobCResultHash(anchor.lineage),
      },
    },
  };
}

function publicJob(row: any, reuse?: EnqueueReuse) {
  const diagnostics = row.progress_snapshot && typeof row.progress_snapshot === 'object'
    ? row.progress_snapshot : {};
  const reportedElapsed = Number(diagnostics.elapsedSeconds);
  const liveElapsed = row.status === 'running' && row.started_at
    ? Math.max(0, (Date.now() - new Date(row.started_at).getTime()) / 1_000)
    : Number.NaN;
  const diagnosticMode = row.input_snapshot?.prepared?.responseBasis?.diagnosticMode;
  const diagnosticOnly = diagnosticMode?.mode === JOB_C_TEMPORARY_DIAGNOSTIC_MODE.mode
    || diagnosticMode?.mode === JOB_C_WORKFLOW_TEST_ONLY_MODE.mode;
  const workflowTestOnly = diagnosticMode?.mode === JOB_C_WORKFLOW_TEST_ONLY_MODE.mode;
  return {
    id: row.id,
    designId: Number(row.design_id),
    createdBy: Number(row.created_by),
    status: row.status,
    progress: {
      phase: row.progress_phase,
      completed: Number(row.progress_completed),
      total: row.progress_total == null ? null : Number(row.progress_total),
      ...diagnostics,
      elapsedSeconds: Number.isFinite(liveElapsed)
        ? Math.max(Number.isFinite(reportedElapsed) ? reportedElapsed : 0, liveElapsed)
        : Number.isFinite(reportedElapsed) ? reportedElapsed : null,
    },
    input: row.input_snapshot,
    inputHash: row.input_hash,
    implementationHash: row.implementation_hash,
    candidateHash: row.candidate_hash,
    jobBEngineHash: row.job_b_engine_hash,
    result: row.result_snapshot,
    resultHash: row.result_hash,
    partialResult: row.partial_result_snapshot ?? null,
    partialResultHash: row.partial_result_hash ?? null,
    scientificCompleted: !diagnosticOnly
      && (row.status === 'completed' || row.status === 'blocked'),
    diagnosticOnly,
    workflowTestOnly,
    error: row.error,
    attemptCount: Number(row.attempt_count),
    cancelRequestedAt: row.cancel_requested_at?.toISOString?.() ?? row.cancel_requested_at ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    ...(reuse ? { reuse } : {}),
  };
}

async function history(client: any, row: any, details: Record<string, unknown>) {
  await client.query(
    `INSERT INTO ecr_pre_pilot_job_c_job_history
      (job_id,input_snapshot,input_hash,implementation_hash,candidate_hash,job_b_engine_hash,
       status,progress_phase,progress_completed,progress_total,worker_owner,
       claim_token,attempt_count,result_snapshot,result_hash,error,details,progress_snapshot,
       partial_result_snapshot,partial_result_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [row.id, row.input_snapshot, row.input_hash, row.implementation_hash,
      row.candidate_hash, row.job_b_engine_hash, row.status, row.progress_phase,
       row.progress_completed, row.progress_total, row.worker_owner, row.claim_token,
       row.attempt_count, row.result_snapshot, row.result_hash, row.error, details,
       row.progress_snapshot, row.partial_result_snapshot, row.partial_result_hash],
  );
}

export async function enqueueJobC(
  userId: number,
  designId: number,
  options: {
    diagnosticOnly?: boolean;
    workflowTestOnly?: boolean;
    strictContinuationAnchor?: boolean;
  } = {},
) {
  // This is the only mutable-state read used to construct the job. The entire
  // server-derived request and its audit/lineage are persisted before returning.
  const diagnosticMode = options.workflowTestOnly ? JOB_C_WORKFLOW_TEST_ONLY_MODE
    : options.diagnosticOnly ? JOB_C_TEMPORARY_DIAGNOSTIC_MODE : null;
  let prepared = await prepareEcrPrePilotJobC(userId, designId, diagnosticMode);
  if (options.strictContinuationAnchor) {
    if (diagnosticMode) throw new JobCError('JOB_C_STRICT_CONTINUATION_ANCHOR_MODE_INVALID');
    const source = await pool.query(
      `SELECT * FROM ecr_pre_pilot_job_c_jobs
        WHERE created_by=$1 AND design_id=$2
          AND status='completed' AND completed_at IS NOT NULL
          AND result_snapshot->>'status'='CALCULATED_DIAGNOSTIC_PARTIAL_JOB_C'
          AND result_snapshot#>>'{workerResult,status}'='CALCULATED_DIAGNOSTIC_PARTIAL_JOB_C'
        ORDER BY completed_at DESC,created_at DESC,id DESC`,
      [userId, designId],
    );
    let anchor: ReturnType<typeof strictContinuationAnchorFromSource> | null = null;
    let lastInvalid: unknown = null;
    for (const candidate of source.rows) {
      try {
        anchor = strictContinuationAnchorFromSource(candidate, prepared, currentJobCArtifactHashes());
        break;
      } catch (error) {
        lastInvalid = error;
      }
    }
    if (!anchor) {
      if (lastInvalid instanceof JobCError) throw lastInvalid;
      throw new JobCError('JOB_C_STRICT_CONTINUATION_ANCHOR_NOT_FOUND', {
        required: 'Completed strict diagnostic at lambda=8e-9, 2 m, with unchanged gates and two uncached confirmations',
      });
    }
    prepared = preparedWithStrictContinuationAnchor(prepared, anchor);
  }
  const snapshot = {
    schemaVersion: 'ECR_PRE_PILOT_JOB_C_QUEUE_SNAPSHOT_V1',
    prepared,
  };
  const inputHash = jobCResultHash(snapshot) as string;
  const preparedInputHash = jobCResultHash(prepared) as string;
  const artifacts = currentJobCArtifactHashes();
  const dependencies = (prepared.responseBasis as any).dependencies;
  const jobBEngineHash = String(dependencies
    ?.jobBInterfaceWorkerSha256 ?? '');
  if (!/^[a-f0-9]{64}$/.test(jobBEngineHash)) {
    throw new Error('JOB_C_DEPENDENCY_BLOCKED:JOB_B_ENGINE_HASH_MISSING');
  }
  const boundaryQualifierHash = String(
    dependencies?.jobCBoundaryInterfaceQualifierSha256 ?? '',
  );
  const boundarySourceStateHash = String(
    dependencies?.boundaryBranchSourceStateSha256 ?? '',
  );
  if (boundaryQualifierHash !== artifacts.boundaryQualifierHash
    || !/^[a-f0-9]{64}$/.test(boundarySourceStateHash)) {
    throw new Error('JOB_C_DEPENDENCY_BLOCKED:BOUNDARY_LINEAGE_HASH_MISSING');
  }
  const branchContinuationHash = String(
    dependencies?.jobCBranchContinuationSha256 ?? '',
  );
  if (branchContinuationHash !== artifacts.branchContinuationHash) {
    throw new Error('JOB_C_DEPENDENCY_BLOCKED:BRANCH_CONTINUATION_LINEAGE_HASH_MISSING');
  }
  const frozenDependencyLineageHash = jobCResultHash(dependencies) as string;
  const evidence = {
    inputHash,
    preparedInputHash,
    implementationHash: artifacts.implementationHash,
    candidateHash: artifacts.candidateHash,
    jobBInterfaceWorkerHash: jobBEngineHash,
    boundaryQualifierHash,
    boundarySourceStateHash,
    branchContinuationHash,
    frozenDependencyLineageHash,
  };
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize reuse decisions in the authenticated design scope. In
    // particular, simultaneous retries cannot both miss the same blocked row
    // and append duplicate work. This requires no mutable deduplication column
    // or uniqueness constraint and leaves every historical job immutable.
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended('ecr-pre-pilot-job-c:' || $1::text || ':' || $2::text, 0)
       )`,
      [userId, designId],
    );
    const design = await client.query(
      'SELECT id FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2 FOR SHARE',
      [designId, userId],
    );
    if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
    const reusable = await client.query(
      `SELECT * FROM ecr_pre_pilot_job_c_jobs
        WHERE created_by=$1 AND design_id=$2
          AND status='blocked' AND completed_at IS NOT NULL
          AND result_snapshot IS NOT NULL
          AND result_hash ~ '^[a-f0-9]{64}$'
          AND input_hash=$3 AND implementation_hash=$4
          AND candidate_hash=$5 AND job_b_engine_hash=$6
          AND input_snapshot#>>'{prepared,responseBasis,dependencies,jobCBoundaryInterfaceQualifierSha256}'=$7
          AND input_snapshot#>>'{prepared,responseBasis,dependencies,boundaryBranchSourceStateSha256}'=$8
        ORDER BY created_at DESC,id DESC LIMIT 1
        FOR UPDATE`,
      [
        userId, designId, inputHash, artifacts.implementationHash,
        artifacts.candidateHash, jobBEngineHash, boundaryQualifierHash,
        boundarySourceStateHash,
      ],
    );
    const reusableRow = reusable.rows[0];
    // This pre-solve failure is not a scientific result. Preparation above
    // has freshly validated the current authorities; execution must still
    // compare them again. Do not permanently cache a transient disagreement
    // between the enqueue and execution processes as a transport failure.
    const preparedSnapshotMismatch = reusableRow?.error
      === 'JOB_C_DEPENDENCY_BLOCKED:STALE_OR_INVALID_LINEAGE'
      && reusableRow?.result_snapshot?.diagnostics?.reason
        === 'COMPLETE_PREPARED_DEPENDENCY_SNAPSHOT_CHANGED';
    const storedResultHashValid = reusableRow
      && reusableRow.result_snapshot != null
      && typeof reusableRow.result_hash === 'string'
      && /^[a-f0-9]{64}$/.test(reusableRow.result_hash)
      && jobCScientificResultHash(reusableRow.result_snapshot) === reusableRow.result_hash;
    if (reusableRow
      && !preparedSnapshotMismatch
      && jobCResultHash(reusableRow.input_snapshot) === reusableRow.input_hash
      && jobCResultHash(reusableRow.input_snapshot.prepared) === preparedInputHash
      && jobCResultHash(
        reusableRow.input_snapshot.prepared.responseBasis.dependencies,
      ) === frozenDependencyLineageHash
      && storedResultHashValid) {
      const reuse: EnqueueReuse = {
        reused: true,
        reason: 'UNCHANGED_TERMINAL_BLOCKED_JOB_C',
        evidence,
      };
      await history(client, reusableRow, {
        event: 'enqueue_reused',
        reason: reuse.reason,
        evidence,
      });
      await client.query('COMMIT');
      return publicJob(reusableRow, reuse);
    }
    // A stopped job is never a completed scientific result, but its immutable
    // checkpoint can safely seed a new attempt only when every frozen lineage
    // pin and the worker-request digest match this newly prepared request.
    const resumable = await client.query(
      `SELECT * FROM ecr_pre_pilot_job_c_jobs
        WHERE created_by=$1 AND design_id=$2 AND status='cancelled'
          AND input_hash=$3 AND implementation_hash=$4
          AND candidate_hash=$5 AND job_b_engine_hash=$6
          AND input_snapshot#>>'{prepared,responseBasis,dependencies,jobCBoundaryInterfaceQualifierSha256}'=$7
          AND input_snapshot#>>'{prepared,responseBasis,dependencies,boundaryBranchSourceStateSha256}'=$8
        ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,
      [userId, designId, inputHash, artifacts.implementationHash, artifacts.candidateHash,
        jobBEngineHash, boundaryQualifierHash, boundarySourceStateHash],
    );
    const resumeCheckpoint = !options.strictContinuationAnchor && validPartial(resumable.rows[0])
      && jobCResultHash(resumable.rows[0].input_snapshot.prepared) === preparedInputHash
      && jobCResultHash(resumable.rows[0].input_snapshot.prepared.responseBasis.dependencies)
        === frozenDependencyLineageHash
      ? resumable.rows[0].partial_result_snapshot : null;
    // An active job is deliberately not returned as a reusable result. Reject
    // the colliding enqueue instead, so concurrent first-time requests cannot
    // duplicate execution while preserving the pending/running job semantics.
    const active = await client.query(
      `SELECT id,status FROM ecr_pre_pilot_job_c_jobs
        WHERE created_by=$1 AND design_id=$2
          AND status IN ('pending','running')
          AND input_hash=$3 AND implementation_hash=$4
          AND candidate_hash=$5 AND job_b_engine_hash=$6
          AND input_snapshot#>>'{prepared,responseBasis,dependencies,jobCBoundaryInterfaceQualifierSha256}'=$7
          AND input_snapshot#>>'{prepared,responseBasis,dependencies,boundaryBranchSourceStateSha256}'=$8
        ORDER BY created_at DESC,id DESC LIMIT 1
        FOR UPDATE`,
      [
        userId, designId, inputHash, artifacts.implementationHash,
        artifacts.candidateHash, jobBEngineHash, boundaryQualifierHash,
        boundarySourceStateHash,
      ],
    );
    if (active.rows[0]) {
      throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:IDENTICAL_JOB_ALREADY_ACTIVE', {
        activeJobId: active.rows[0].id,
        activeJobStatus: active.rows[0].status,
        evidence,
      });
    }
    const inserted = await client.query(
      `INSERT INTO ecr_pre_pilot_job_c_jobs
       (id,design_id,created_by,input_snapshot,input_hash,implementation_hash,
         candidate_hash,job_b_engine_hash,partial_result_snapshot,partial_result_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *`,
      [id, designId, userId, snapshot, inputHash, artifacts.implementationHash,
         artifacts.candidateHash, jobBEngineHash, resumeCheckpoint,
         resumeCheckpoint ? jobCResultHash(resumeCheckpoint) : null],
    );
    await history(client, inserted.rows[0], {
      event: 'enqueued',
      ...(resumeCheckpoint ? { resumedFromPartial: true } : {}),
    });
    await client.query('COMMIT');
    startJobCWorker();
    return publicJob(inserted.rows[0], {
      reused: false,
      reason: 'NEW_JOB_ENQUEUED',
      evidence,
    });
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
      WHERE created_by=$1 AND design_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,
    [userId, designId],
  );
  return found.rows[0] ? publicJob(found.rows[0]) : null;
}

/**
 * A sizing assessment may only start from a completed, full-lambda Job-C
 * response.  In particular, a newer queued, diagnostic, blocked, or failed
 * row must not hide the most recent eligible parent result.
 *
 * The detailed scientific admission remains in the physical-sizing service;
 * this queue boundary establishes immutable queue status, ownership, and
 * response-integrity eligibility before that service is invoked.
 */
export async function getLatestCompletedScientificJobC(userId: number, designId: number) {
  const found = await pool.query(
    `SELECT * FROM ecr_pre_pilot_job_c_jobs
      WHERE created_by=$1 AND design_id=$2
        AND status='completed' AND completed_at IS NOT NULL
        AND result_snapshot IS NOT NULL
        AND result_hash ~ '^[a-f0-9]{64}$'
        AND result_snapshot->>'status'='CALCULATED_PRELIMINARY_JOB_C'
        AND result_snapshot#>>'{workerResult,status}'='CALCULATED_PRELIMINARY_JOB_C'
      ORDER BY completed_at DESC,created_at DESC,id DESC`,
    [userId, designId],
  );
  const row = found.rows.find((candidate: any) =>
    jobCScientificResultHash(candidate.result_snapshot) === candidate.result_hash
    && candidate.result_snapshot?.workerResult?.diagnosticOnly !== true
    && candidate.result_snapshot?.workerResult?.workflowTestOnly !== true
    && assessAcceptedJobCForPhysicalSizing(candidate.result_snapshot).accepted);
  if (!row) return null;
  return publicJob(row);
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
    if (changed.rows[0]) await history(client, changed.rows[0], {
      event: 'stop_requested',
      partialRetained: changed.rows[0].partial_result_snapshot != null,
    });
    await client.query('COMMIT');
    activeControllers.get(id)?.abort();
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
          progress_phase=CASE WHEN j.progress_phase='queued' THEN 'candidate 2m' ELSE j.progress_phase END,
          updated_at=NOW()
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
  activeControllers.set(row.id, controller);
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
      && artifacts.branchContinuationHash === deps?.jobCBranchContinuationSha256
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
        snapshot?.prepared?.responseBasis?.diagnosticMode?.mode
          === JOB_C_WORKFLOW_TEST_ONLY_MODE.mode
          ? JOB_C_WORKFLOW_TEST_ONLY_MODE
          : snapshot?.prepared?.responseBasis?.diagnosticMode?.mode
            === JOB_C_TEMPORARY_DIAGNOSTIC_MODE.mode
            ? JOB_C_TEMPORARY_DIAGNOSTIC_MODE : null,
      );
    } catch (error: any) {
      throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:STALE_OR_INVALID_LINEAGE', {
        reason: 'CURRENT_PINNED_DEPENDENCY_REVALIDATION_FAILED',
        cause: error?.message ?? String(error),
        causeDetails: error?.details ?? null,
      });
    }
    const frozenAnchor = snapshot?.prepared?.responseBasis?.continuationAnchor;
    if (frozenAnchor != null) {
      const source = await pool.query(
        `SELECT * FROM ecr_pre_pilot_job_c_jobs
          WHERE id=$1 AND created_by=$2 AND design_id=$3`,
        [frozenAnchor?.sourceJobId, row.created_by, row.design_id],
      );
      let refreshedAnchor: ReturnType<typeof strictContinuationAnchorFromSource>;
      try {
        refreshedAnchor = strictContinuationAnchorFromSource(
          source.rows[0], currentPrepared, artifacts,
        );
      } catch (error: any) {
        throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:STALE_OR_INVALID_LINEAGE', {
          reason: 'STRICT_CONTINUATION_SOURCE_REVALIDATION_FAILED',
          cause: error?.message ?? String(error),
          causeDetails: error?.details ?? null,
        });
      }
      if (jobCResultHash(refreshedAnchor.lineage) !== jobCResultHash(frozenAnchor)) {
        throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:STALE_OR_INVALID_LINEAGE', {
          reason: 'STRICT_CONTINUATION_SOURCE_LINEAGE_CHANGED',
        });
      }
      currentPrepared = preparedWithStrictContinuationAnchor(currentPrepared, refreshedAnchor);
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
    const resumeCheckpoint = validPartial(row) ? row.partial_result_snapshot : null;
    const preparedForExecution = resumeCheckpoint
      ? {
        ...snapshot.prepared,
        workerRequest: {
          ...snapshot.prepared.workerRequest,
          // This is intentionally not written into input_snapshot: its digest
          // remains the pristine, immutable scientific request.
          resumeCheckpoint,
        },
      }
      : snapshot.prepared;
    const result = await executePreparedEcrPrePilotJobC(preparedForExecution, {
      signal: controller.signal,
      onProgress: async (
        phase: string,
        completed = 0,
        total?: number | null,
        diagnostics?: JobCProgress,
      ) => {
        const progress = {
          ...(diagnostics ?? {}),
          phase,
          completed,
          total: total ?? null,
        };
        const changed = await guardedUpdate(row.id, token,
          `progress_phase=$3,progress_completed=GREATEST(progress_completed,$4),
           progress_total=$5,progress_snapshot=$6::jsonb,
           lease_expires_at=NOW()+($7*INTERVAL '1 millisecond')`,
          [phase, completed, total ?? null, progress, LEASE_MS]);
        if (changed.rows[0]) await history(pool, changed.rows[0], { event: 'progress' });
        if (changed.rows[0]?.cancel_requested_at) controller.abort();
      },
      onCheckpoint: async (checkpoint: Record<string, any>) => {
        validateJobCCheckpoint(checkpoint, pristineRequestHash(snapshot));
        const progress = checkpoint.progress as JobCProgress;
        const changed = await guardedUpdate(row.id, token,
          `partial_result_snapshot=$3::jsonb,partial_result_hash=$4,
           progress_phase=$5,progress_completed=GREATEST(progress_completed,$6),
           progress_total=$7,progress_snapshot=$8::jsonb,
           lease_expires_at=NOW()+($9*INTERVAL '1 millisecond')`,
          [checkpoint, jobCResultHash(checkpoint), progress.phase,
            progress.completed ?? 0, progress.total ?? null, progress, LEASE_MS]);
        if (!changed.rows[0]) throw new JobCError('JOB_C_CANCELLED');
        await history(pool, changed.rows[0], { event: 'checkpoint_committed' });
        if (changed.rows[0].cancel_requested_at) controller.abort();
      },
    });
    validateJobCWorkerResponseStatus(result);
    const expectsWorkflowTestOnly = snapshot?.prepared?.responseBasis?.diagnosticMode?.mode
      === JOB_C_WORKFLOW_TEST_ONLY_MODE.mode;
    if (expectsWorkflowTestOnly) {
      try {
        if (workflowTestOnlyCompletionClaimed(result.status)) {
          validateJobCWorkflowTestOnlyWorkerResponse(result.workerResult);
        }
      } catch (error: any) {
        if (error instanceof JobCError) {
          throw new JobCError(error.message, {
            ...error.details,
            workerResult: result.workerResult,
          });
        }
        throw error;
      }
    } else if (result.status === 'CALCULATED_WORKFLOW_TEST_ONLY_JOB_C') {
      throw new JobCError('JOB_C_WORKFLOW_TEST_ONLY_RESPONSE_INVALID', {
        failures: ['UNEXPECTED_WORKFLOW_TEST_ONLY_RESPONSE'],
        workerResult: result.workerResult,
      });
    }
    validateStrictContinuationExecutionResponse(result, frozenAnchor);
    const blocked = result.status === 'BLOCKED_PRELIMINARY_JOB_C';
    const final = await guardedUpdate(row.id, token,
      `status=CASE WHEN cancel_requested_at IS NULL THEN $3 ELSE 'cancelled' END,
       result_snapshot=CASE WHEN cancel_requested_at IS NULL THEN $4::jsonb ELSE NULL::jsonb END,
       result_hash=CASE WHEN cancel_requested_at IS NULL THEN $5 ELSE NULL END,
       error=CASE WHEN cancel_requested_at IS NULL THEN NULL ELSE 'JOB_C_CANCELLED' END,
       progress_phase='terminal',
       completed_at=NOW(),lease_expires_at=NULL,claim_token=NULL`,
      [blocked ? 'blocked' : 'completed', result, jobCScientificResultHash(result)]);
    if (final.rows[0]) await history(pool, final.rows[0], {
      event: final.rows[0].status,
      reason: blocked ? result.workerResult?.error ?? 'BLOCKED_PRELIMINARY_JOB_C' : null,
      diagnostics: blocked ? result.workerResult?.diagnostics ?? null : null,
    });
  } catch (error: any) {
    const cancelled = controller.signal.aborted || error?.message === 'JOB_C_CANCELLED';
    const blocked = !cancelled
      && error?.message === 'JOB_C_DEPENDENCY_BLOCKED:STALE_OR_INVALID_LINEAGE';
    const failureEvidence = error?.details?.workerResult
      ? {
        qualification: error?.message === 'JOB_C_WORKER_RESPONSE_STATUS_INVALID'
          ? 'WORKER_EVIDENCE_RETAINED_AFTER_RESPONSE_FAILURE'
          : 'WORKER_EVIDENCE_RETAINED_AFTER_CHECKPOINT_FAILURE',
        workerError: error.details.workerResult.error ?? null,
        checkpointError: error?.message ?? 'JOB_C_CHECKPOINT_PERSISTENCE_FAILED',
        checkpointDiagnostics: error?.details?.checkpointDiagnostics ?? null,
        workerResult: error.details.workerResult,
      } : null;
    const final = await guardedUpdate(row.id, token,
      `status=CASE WHEN cancel_requested_at IS NULL THEN $3 ELSE 'cancelled' END,
       error=CASE WHEN cancel_requested_at IS NULL THEN $4 ELSE 'JOB_C_CANCELLED' END,
         result_snapshot=CASE WHEN cancel_requested_at IS NULL AND ($3='blocked' OR $7)
          THEN $5::jsonb ELSE NULL::jsonb END,
         result_hash=CASE WHEN cancel_requested_at IS NULL AND ($3='blocked' OR $7)
          THEN $6 ELSE NULL END,
       progress_phase='terminal',
       completed_at=NOW(),lease_expires_at=NULL,claim_token=NULL`,
       [cancelled ? 'cancelled' : blocked ? 'blocked' : 'failed',
         error?.message ?? 'JOB_C_FAILED',
         failureEvidence ?? (error?.details ? { diagnostics: error.details } : null),
         failureEvidence
           ? jobCResultHash(failureEvidence)
           : error?.details ? jobCResultHash({ diagnostics: error.details }) : null,
         Boolean(failureEvidence)]);
    if (final.rows[0]) await history(pool, final.rows[0], {
      event: final.rows[0].status,
      reason: error?.message ?? 'JOB_C_FAILED',
      diagnostics: error?.details ?? null,
    });
  } finally {
    clearInterval(heartbeat);
    if (activeControllers.get(row.id) === controller) activeControllers.delete(row.id);
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