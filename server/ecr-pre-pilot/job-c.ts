import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const JOB_C_PROTOCOL = 'ECR_PRE_PILOT_JOB_C_V1' as const;
export const JOB_C_COMPONENT_ORDER = ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'] as const;
/**
 * The only authorized partial-transfer route.  This is deliberately a
 * server-owned constant rather than a request-body option: it is copied into
 * each queued worker request and therefore becomes part of immutable lineage.
 */
export const JOB_C_TEMPORARY_DIAGNOSTIC_MODE = Object.freeze({
  mode: 'TEMPORARY_PARTIAL_TRANSFER_DIAGNOSTIC_ONLY_V1',
  terminalLambda: 6.5e-9,
  heightTrialM: 2,
  normalAcceptancePermitted: false,
  qualification: 'USER_AUTHORIZED_TEMPORARY_DIAGNOSTIC_ONLY',
});
export const JOB_C_PRELIMINARY_SENSITIVITY_BASIS = Object.freeze({
  authorization: 'USER_AUTHORIZED_PROJECT_CONTROLLED_PRELIMINARY_SENSITIVITY_BASIS',
  axialDispersionContinuousM2S: { nominal: 0.010, minimum: 0.003, maximum: 0.030 },
  axialDispersionDispersedM2S: { nominal: 0.0010, minimum: 0.0003, maximum: 0.0030 },
  activeHeightSearchM: { minimum: 2, maximum: 20, use: 'NUMERICAL_SEARCH_ONLY' },
});
// This is a cancellation grace period, not a calculation runtime limit.
const JOB_C_CANCELLATION_GRACE_MS = 30_000;

const canonical = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`
    : JSON.stringify(value);
const hashValue = (value: unknown): unknown => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JOB_C_NON_FINITE_HASH_INPUT');
    const [mantissa, exponent] = value.toExponential(16).toLowerCase().split('e');
    return { $number: `${mantissa}e${Number(exponent)}` };
  }
  if (Array.isArray(value)) return value.map(hashValue);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, hashValue(child)]),
  );
  return value;
};
export const jobCResultHash = (value: unknown) => {
  const snapshot = value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'resultSha256')) : value;
  return createHash('sha256').update(canonical(hashValue(snapshot))).digest('hex');
};
export const jobCScientificResultHash = (value: unknown) => {
  const snapshot = value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'resultSha256' && key !== 'runtimeDiagnostics'))
    : value;
  return createHash('sha256').update(canonical(hashValue(snapshot))).digest('hex');
};
export function currentJobCArtifactHashes() {
  const root = process.env.JOB_C_RUNTIME_ROOT
    ? path.resolve(process.env.JOB_C_RUNTIME_ROOT)
    : process.env.NODE_ENV === 'production'
      ? path.resolve(process.cwd(), 'dist/job-c-runtime') : process.cwd();
  const digest = (relative: string) =>
    createHash('sha256').update(fs.readFileSync(path.resolve(root, relative))).digest('hex');
  return {
    implementationHash: digest('server/ecr-pre-pilot/job-c/worker.py'),
    candidateHash: digest('server/ecr-pre-pilot/job-c/candidate_interface.py'),
    boundaryQualifierHash: digest('server/ecr-pre-pilot/job-c/boundary_interface_qualifier.py'),
    branchContinuationHash: digest('server/ecr-pre-pilot/job-c/branch_continuation.py'),
  };
}
export class JobCError extends Error {
  constructor(message: string, readonly details: Record<string, unknown> = {}) {
    super(message); this.name = 'JobCError';
  }
}

export interface JobCProgress {
  phase: string;
  completed?: number;
  total?: number | null;
  iteration?: number | null;
  residual?: number | null;
  residualKind?: string | null;
  elapsedSeconds?: number;
  heightCandidateM?: number | null;
  continuationLambda?: number | null;
  continuationTrial?: number | null;
  acceptedLowerLambda?: number | null;
  rejectedUpperLambda?: number | null;
  rawFvResidualMolS?: number | null;
  scaledFvResidual?: number | null;
  maximumOriginalJobBGateResidual?: number | null;
  minimumFlowMolS?: number | null;
  rawFvGatePassed?: boolean | null;
  scaledFvGatePassed?: boolean | null;
  originalJobBGatePassed?: boolean | null;
  strictPositivityPassed?: boolean | null;
  accepted?: boolean | null;
}

export interface JobCWorkerRequest extends Record<string, unknown> {
  componentOrder: string[]; temperatureK: number;
  continuousFeedMolS: number[]; dispersedFeedMolS: number[];
  continuousTotalConcentrationMolM3: number; dispersedTotalConcentrationMolM3: number;
  kc: number[]; kd: number[]; phaseConfiguration: string; compartments: number;
  columnDiameterM: number; rpm: number; operatingHoldup: number; d32M: number;
  minimumRecoveryPct: number;
  boundaryBranchQualificationRequest: {
    componentOrder: string[]; T: number;
    x_bulk_continuous: number[]; x_bulk_dispersed: number[];
    kc: number[]; kd: number[]; CtC: number; CtD: number; phase_config: string;
    provenance: Record<string, unknown>; sourceStateSha256: string;
  };
  axialLocalContactProfile: Array<{
    numericalCell: number;
    x_bulk_continuous: number[];
    x_bulk_dispersed: number[];
    provenance: Record<string, unknown>;
  }>;
  axialLocalContactProfileAuthority: {
    qualification: string;
    componentOrder: string[];
    phaseConfiguration: string;
    sourceStageCount: number;
    targetNumericalCells: number;
    mapping: string;
    stage2ResultSnapshotHash: string;
  };
  axialLocalContactProfileSha256: string;
  diagnosticMode?: typeof JOB_C_TEMPORARY_DIAGNOSTIC_MODE;
}

export async function runJobCWorker(request: JobCWorkerRequest, options: {
  signal?: AbortSignal;
  onProgress?: (
    phase: string,
    completed?: number,
    total?: number | null,
    diagnostics?: JobCProgress,
  ) => void | Promise<void>;
  onCheckpoint?: (checkpoint: Record<string, any>) => void | Promise<void>;
  /** Research capture only; never bypasses the response integrity check. */
  onRawResponse?: (raw: string) => void;
} = {}) {
  const workerRoot = process.env.JOB_C_RUNTIME_ROOT
    ? path.resolve(process.env.JOB_C_RUNTIME_ROOT)
    : process.env.NODE_ENV === 'production'
      ? path.resolve(process.cwd(), 'dist/job-c-runtime') : process.cwd();
  const worker = path.resolve(workerRoot, 'server/ecr-pre-pilot/job-c/worker.py');
  if (!fs.existsSync(worker)) throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:WORKER_UNAVAILABLE');
  const manifestPath = path.join(workerRoot, 'job-c-runtime-manifest.json');
  if (process.env.NODE_ENV === 'production' || fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const workerBytes = fs.readFileSync(worker);
      const candidate = path.resolve(workerRoot, 'server/ecr-pre-pilot/job-c/candidate_interface.py');
      const candidateBytes = fs.readFileSync(candidate);
      const qualifier = path.resolve(workerRoot, 'server/ecr-pre-pilot/job-c/boundary_interface_qualifier.py');
      const qualifierBytes = fs.readFileSync(qualifier);
      const branchContinuation = path.resolve(
        workerRoot, 'server/ecr-pre-pilot/job-c/branch_continuation.py',
      );
      const branchContinuationBytes = fs.readFileSync(branchContinuation);
      if (manifest.schemaVersion !== 'ECR_PRE_PILOT_JOB_C_RUNTIME_MANIFEST_V1'
        || manifest.protocol !== JOB_C_PROTOCOL
        || manifest.worker?.path !== 'server/ecr-pre-pilot/job-c/worker.py'
        || manifest.worker?.bytes !== workerBytes.length
        || manifest.worker?.sha256 !== createHash('sha256').update(workerBytes).digest('hex')
        || manifest.candidateInterface?.version !== 'ECR_JOB_C_CANDIDATE_INTERFACE_V1'
        || manifest.candidateInterface?.bytes !== candidateBytes.length
        || manifest.candidateInterface?.sha256
          !== createHash('sha256').update(candidateBytes).digest('hex')
        || manifest.boundaryInterfaceQualifier?.version !== 'ECR_JOB_C_BOUNDARY_INTERFACE_QUALIFIER_V2'
        || manifest.boundaryInterfaceQualifier?.bytes !== qualifierBytes.length
        || manifest.boundaryInterfaceQualifier?.sha256
          !== createHash('sha256').update(qualifierBytes).digest('hex')
        || manifest.branchContinuation?.version !== 'ECR_JOB_C_BRANCH_CONTINUATION_V1'
        || manifest.branchContinuation?.path
          !== 'server/ecr-pre-pilot/job-c/branch_continuation.py'
        || manifest.branchContinuation?.bytes !== branchContinuationBytes.length
        || manifest.branchContinuation?.sha256
          !== createHash('sha256').update(branchContinuationBytes).digest('hex')) {
        throw new Error();
      }
    } catch {
      throw new JobCError('JOB_C_DEPENDENCY_BLOCKED:RUNTIME_MANIFEST_INTEGRITY_FAILURE');
    }
  }
  const jobBRoot = process.env.JOB_B_INTERFACE_RUNTIME_ROOT
    ? path.resolve(process.env.JOB_B_INTERFACE_RUNTIME_ROOT)
    : path.resolve(process.cwd(), 'dist/job-b-interface-runtime');
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'LD_LIBRARY_PATH', 'NIX_LD', 'NIX_LD_LIBRARY_PATH',
    'LOCALE_ARCHIVE', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  Object.assign(env, {
    PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1',
    JOB_B_INTERFACE_PROTOCOL: 'ECR_JOB_B_INTERFACE_V1',
    JOB_B_INTERFACE_RUNTIME_ROOT: jobBRoot,
    JOB_C_QUALIFICATION_CACHE_DIR:
      process.env.JOB_C_QUALIFICATION_CACHE_DIR
      ?? path.resolve(workerRoot, '.cache/qualification'),
    STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL: 'ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1',
    STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT:
      process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT
      ?? path.resolve(jobBRoot, '../stage4-seven-component-adapter-runtime'),
    STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT:
      process.env.STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT
      ?? path.resolve(jobBRoot, '../predictive-nt-runtime-7c-1-5'),
  });
  return new Promise<Record<string, any>>((resolve, reject) => {
    const python = process.env.JOB_C_PYTHON
      ?? process.env.JOB_B_INTERFACE_PYTHON
      ?? process.env.STAGE4_EQUILIBRIUM_ADAPTER_PYTHON
      ?? 'python3.12';
    const child = spawn(python, [worker],
      { cwd: process.cwd(), env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let progressBuffer = ''; let settled = false;
    let cancellationRequested = false;
    let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
    let callbackChain = Promise.resolve();
    let checkpointCallbackError: Error | undefined;
    const finish = (error?: Error, value?: Record<string, any>) => {
      if (settled) return; settled = true; clearTimeout(cancellationTimer);
      options.signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value!);
    };
    const terminateForCancellation = () => {
      if (cancellationRequested) return;
      cancellationRequested = true;
      child.kill('SIGTERM');
      cancellationTimer = setTimeout(() => child.kill('SIGKILL'), JOB_C_CANCELLATION_GRACE_MS);
      cancellationTimer.unref();
    };
    const abort = () => { terminateForCancellation(); };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) terminateForCancellation();
    const processWorkerLine = (line: string) => {
      try {
        if (line.startsWith('JOB_C_PROGRESS ')) {
          const progress = JSON.parse(line.slice('JOB_C_PROGRESS '.length)) as JobCProgress;
          if (typeof progress.phase === 'string') {
            callbackChain = callbackChain.then(() => options.onProgress?.(
              progress.phase, progress.completed, progress.total, progress,
            )).catch(() => { /* lease heartbeat remains authoritative */ });
          }
        } else if (line.startsWith('JOB_C_CHECKPOINT ')) {
          const checkpoint = JSON.parse(line.slice('JOB_C_CHECKPOINT '.length));
          if (checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint)) {
            callbackChain = callbackChain.then(() => options.onCheckpoint?.(checkpoint))
              .catch(error => {
                checkpointCallbackError = error instanceof Error
                  ? error : new JobCError('JOB_C_CHECKPOINT_PERSISTENCE_FAILED');
              });
          } else {
            checkpointCallbackError = new JobCError('JOB_C_CHECKPOINT_INVALID', {
              failures: ['MALFORMED_CHECKPOINT_ENVELOPE'],
            });
          }
        } else {
          stdout += `${line}\n`;
        }
      } catch {
        if (line.startsWith('JOB_C_CHECKPOINT ')) {
          checkpointCallbackError = new JobCError('JOB_C_CHECKPOINT_INVALID', {
            failures: ['MALFORMED_CHECKPOINT_ENVELOPE'],
          });
        }
        // Malformed progress remains non-authoritative.
      }
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      const text = String(chunk);
      progressBuffer += text;
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() ?? '';
      for (const line of lines) processWorkerLine(line);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      if (stderr.length < 4096) stderr += String(chunk).slice(0, 4096 - stderr.length);
    });
    child.on('error', () => finish(new JobCError('JOB_C_WORKER_START_FAILED')));
    child.on('close', async code => {
      clearTimeout(cancellationTimer);
      if (progressBuffer) {
        processWorkerLine(progressBuffer);
        progressBuffer = '';
      }
      await callbackChain;
      if (code !== 0) return finish(new JobCError(
        cancellationRequested ? 'JOB_C_CANCELLED' : 'JOB_C_WORKER_FAILED',
        {
          exitCode: code,
          diagnostic: stderr.replaceAll(process.cwd(), '<workspace>').trim().slice(-2000),
        },
      ));
      try {
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
        const finalLines = lines.filter(line =>
          !line.startsWith('JOB_C_PROGRESS ') && !line.startsWith('JOB_C_CHECKPOINT '));
        options.onRawResponse?.(finalLines.join('\n'));
        if (finalLines.length !== 1) throw new Error();
        const response = JSON.parse(finalLines[0]);
        if (response.protocol !== JOB_C_PROTOCOL
          || JSON.stringify(response.componentOrder ?? JOB_C_COMPONENT_ORDER)
            !== JSON.stringify(JOB_C_COMPONENT_ORDER)
          || response.resultSha256 !== jobCScientificResultHash(response)) throw new Error();
        if (checkpointCallbackError) {
          return finish(new JobCError('JOB_C_CHECKPOINT_PERSISTENCE_FAILED', {
            cause: checkpointCallbackError.message,
            checkpointDiagnostics:
              (checkpointCallbackError as JobCError).details ?? null,
            workerResult: response,
          }));
        }
        if (cancellationRequested || response.status === 'INTERRUPTED_PRELIMINARY_JOB_C') {
          finish(new JobCError('JOB_C_CANCELLED', { workerResult: response }));
        } else {
          finish(undefined, response);
        }
      } catch {
        finish(new JobCError('JOB_C_WORKER_RESPONSE_INTEGRITY_INVALID'));
      }
    });
    child.stdin.end(`${JSON.stringify({ protocol: JOB_C_PROTOCOL, operation: 'SOLVE_HEIGHT', ...request })}\n`);
  });
}