import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const JOB_C_PROTOCOL = 'ECR_PRE_PILOT_JOB_C_V1' as const;
export const JOB_C_COMPONENT_ORDER = ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'] as const;
export const JOB_C_PRELIMINARY_SENSITIVITY_BASIS = Object.freeze({
  authorization: 'USER_AUTHORIZED_PROJECT_CONTROLLED_PRELIMINARY_SENSITIVITY_BASIS',
  axialDispersionContinuousM2S: { nominal: 0.010, minimum: 0.003, maximum: 0.030 },
  axialDispersionDispersedM2S: { nominal: 0.0010, minimum: 0.0003, maximum: 0.0030 },
  activeHeightSearchM: { minimum: 2, maximum: 20, use: 'NUMERICAL_SEARCH_ONLY' },
});
const JOB_C_QUALIFICATION_BUDGET_MS = 600_000;
const JOB_C_NONLINEAR_SOLVER_BUDGET_MS = 720_000;
const JOB_C_TERMINATION_GRACE_MS = 30_000;

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
  };
}
export class JobCError extends Error {
  constructor(message: string, readonly details: Record<string, unknown> = {}) {
    super(message); this.name = 'JobCError';
  }
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
}

export async function runJobCWorker(request: JobCWorkerRequest, options: {
  timeoutMs?: number; signal?: AbortSignal;
  onProgress?: (phase: string, completed?: number, total?: number) => void | Promise<void>;
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
      if (manifest.schemaVersion !== 'ECR_PRE_PILOT_JOB_C_RUNTIME_MANIFEST_V1'
        || manifest.protocol !== JOB_C_PROTOCOL
        || manifest.worker?.path !== 'server/ecr-pre-pilot/job-c/worker.py'
        || manifest.worker?.bytes !== workerBytes.length
        || manifest.worker?.sha256 !== createHash('sha256').update(workerBytes).digest('hex')
        || manifest.candidateInterface?.version !== 'ECR_JOB_C_CANDIDATE_INTERFACE_V1'
        || manifest.candidateInterface?.bytes !== candidateBytes.length
        || manifest.candidateInterface?.sha256
          !== createHash('sha256').update(candidateBytes).digest('hex')
        || manifest.boundaryInterfaceQualifier?.version !== 'ECR_JOB_C_BOUNDARY_INTERFACE_QUALIFIER_V1'
        || manifest.boundaryInterfaceQualifier?.bytes !== qualifierBytes.length
        || manifest.boundaryInterfaceQualifier?.sha256
          !== createHash('sha256').update(qualifierBytes).digest('hex')) {
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
    const finish = (error?: Error, value?: Record<string, any>) => {
      if (settled) return; settled = true; clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value!);
    };
    const terminate = () => {
      child.kill('SIGTERM');
      const killTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
      killTimer.unref();
    };
    const abort = () => { terminate(); finish(new JobCError('JOB_C_CANCELLED')); };
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      terminate(); finish(new JobCError('JOB_C_TIMEOUT'));
    }, Math.max(
      options.timeoutMs ?? 0,
      JOB_C_QUALIFICATION_BUDGET_MS
        + JOB_C_NONLINEAR_SOLVER_BUDGET_MS
        + JOB_C_TERMINATION_GRACE_MS,
    ));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      const text = String(chunk);
      stdout += text;
      progressBuffer += text;
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('JOB_C_PROGRESS ')) continue;
        try {
          const progress = JSON.parse(line.slice('JOB_C_PROGRESS '.length));
          if (typeof progress.phase === 'string') {
            void Promise.resolve(
              options.onProgress?.(progress.phase, progress.completed, progress.total),
            ).catch(() => { /* lease heartbeat remains authoritative */ });
          }
        } catch { /* malformed progress never changes final scientific JSON */ }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      if (stderr.length < 4096) stderr += String(chunk).slice(0, 4096 - stderr.length);
    });
    child.on('error', () => finish(new JobCError('JOB_C_WORKER_START_FAILED')));
    child.on('close', code => {
      if (code !== 0) return finish(new JobCError('JOB_C_WORKER_FAILED', {
        exitCode: code,
        diagnostic: stderr.replaceAll(process.cwd(), '<workspace>').trim().slice(-2000),
      }));
      try {
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
        const finalLines = lines.filter(line => !line.startsWith('JOB_C_PROGRESS '));
        if (finalLines.length !== 1) throw new Error();
        const response = JSON.parse(finalLines[0]);
        if (response.protocol !== JOB_C_PROTOCOL
          || JSON.stringify(response.componentOrder ?? JOB_C_COMPONENT_ORDER)
            !== JSON.stringify(JOB_C_COMPONENT_ORDER)
          || response.resultSha256 !== jobCResultHash(response)) throw new Error();
        finish(undefined, response);
      } catch {
        finish(new JobCError('JOB_C_WORKER_RESPONSE_INTEGRITY_INVALID'));
      }
    });
    child.stdin.end(`${JSON.stringify({ protocol: JOB_C_PROTOCOL, operation: 'SOLVE_HEIGHT', ...request })}\n`);
  });
}