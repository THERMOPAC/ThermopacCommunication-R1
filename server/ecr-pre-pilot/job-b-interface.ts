import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const JOB_B_INTERFACE_PROTOCOL = 'ECR_JOB_B_INTERFACE_V1' as const;
export const JOB_B_INTERFACE_VERSION = '1.0.0' as const;
export const JOB_B_INTERFACE_COMPONENT_ORDER =
  ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'] as const;
export const JOB_B_INTERFACE_ENGINE_VERSION = '7C-1.5.0' as const;
export const JOB_B_INTERFACE_ENGINE_ID =
  'ECR2_PRE_PILOT_SEVEN_COMPONENT_0P5_5P0_H2O' as const;

const TRUSTED_ARTIFACT_SHA256 =
  'de8f85f556f7ca810343cb81242cf399355d6eef3af8a24ebe040d6d963457a0';
const TRUSTED_WORKER_SHA256 =
  'fa1a507340067a44ac0143565351d02e32af93b74ae1c0ba6cccc56cd5388d79';
const TRUSTED_STAGE4_ADAPTER_MANIFEST_SHA256 =
  'dac309f1a4335f192eb3d261213090b3404bd02fe7c5c869dd949c7b7b189ec2';
const TRUSTED_STAGE4_ADAPTER_ARTIFACT_SHA256 =
  '5dcb38f4a73e712d2a503840c263385b89a87dbd69fb3fab73e5eafa6fa56012';

type JsonObject = Record<string, unknown>;
export type JobBInterfacePhaseConfiguration =
  | 'nmp-continuous-rrbo-dispersed'
  | 'rrbo-continuous-nmp-dispersed';

/**
 * CtC/CtD and both bulk compositions are frozen boundary closure inputs.
 * phi and d32 are deliberately absent: this solver returns flux per area.
 */
export interface JobBInterfaceRequest {
  componentOrder: [...typeof JOB_B_INTERFACE_COMPONENT_ORDER];
  T: number;
  x_bulk_continuous: number[];
  x_bulk_dispersed: number[];
  kc: number[];
  kd: number[];
  CtC: number;
  CtD: number;
  phase_config: JobBInterfacePhaseConfiguration;
}

export type JobBInterfaceStatus =
  | 'PASS'
  | 'CALCULATED_PRELIMINARY_INTERFACE'
  | 'BLOCKED_NO_ACCEPTED_PHYSICAL_INTERFACE_ROOT'
  | 'FAILURE_INVALID_REQUEST';

export interface JobBInterfaceSolution {
  continuousMoleFractions: number[];
  dispersedMoleFractions: number[];
  totalMolarFluxMolM2S: number;
  continuousDiffusiveFluxMolM2S: number[];
  dispersedDiffusiveFluxMolM2S: number[];
  continuousComponentFluxMolM2S: number[];
  dispersedComponentFluxMolM2S: number[];
  fluxEqualityResidualMolM2S: number[];
}

export interface JobBInterfaceResponse extends JsonObject {
  protocol: typeof JOB_B_INTERFACE_PROTOCOL;
  version: typeof JOB_B_INTERFACE_VERSION;
  componentOrder: [...typeof JOB_B_INTERFACE_COMPONENT_ORDER];
  engineId: typeof JOB_B_INTERFACE_ENGINE_ID;
  engineVersion: typeof JOB_B_INTERFACE_ENGINE_VERSION;
  engineHash: string;
  stage4AdapterArtifactSha256: string;
  jobBInterfaceArtifactSha256: string;
  workerSha256: string;
  status: JobBInterfaceStatus;
  operation?: 'PREFLIGHT' | 'SOLVE_INTERFACE';
  selectedStartClass?: string;
  independentReproductionStartClass?: string;
  independentReproductionMaximumRelativeDifference?: number;
  interface?: JobBInterfaceSolution | null;
  startDiagnostics?: Array<Record<string, unknown>>;
  endpointAssessments?: Array<Record<string, unknown>>;
  error?: string;
  resultHash: string;
}

interface RuntimeManifest {
  schemaVersion: 'ECR_JOB_B_INTERFACE_RUNTIME_MANIFEST_V1';
  protocol: typeof JOB_B_INTERFACE_PROTOCOL;
  version: typeof JOB_B_INTERFACE_VERSION;
  componentOrder: string[];
  hashAlgorithm: 'sha256';
  fileCount: number;
  aggregateSha256: string;
  artifactSha256: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
  stage4Adapter: {
    defaultRelativePath: string;
    manifestSha256: string;
    artifactSha256: string;
  };
}

const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
const isHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as JsonObject)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('JOB_B_INTERFACE_NON_FINITE_VALUE');
  }
  return JSON.stringify(value);
};
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const hashNumber = (value: number) => {
  const [mantissa, exponent] = value.toExponential(16).toLowerCase().split('e');
  return `${mantissa}e${Number(exponent)}`;
};
const hashValue = (value: unknown): unknown => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JOB_B_INTERFACE_NON_FINITE_VALUE');
    return { $number: hashNumber(value) };
  }
  if (Array.isArray(value)) return value.map(hashValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonObject).map(([key, item]) => [key, hashValue(item)]),
    );
  }
  return value;
};
const resultDigest = (value: unknown) => hash(canonical(hashValue(value)));

function runtimeRoot() {
  return process.env.JOB_B_INTERFACE_RUNTIME_ROOT
    ? path.resolve(process.env.JOB_B_INTERFACE_RUNTIME_ROOT)
    : path.resolve(process.cwd(), 'dist/job-b-interface-runtime');
}
function stage4AdapterRoot(root: string, manifest: RuntimeManifest) {
  return process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT
    ? path.resolve(process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT)
    : path.resolve(root, manifest.stage4Adapter.defaultRelativePath);
}
function checkedFile(root: string, relativePath: string) {
  const target = path.resolve(root, relativePath);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error('JOB_B_INTERFACE_MANIFEST_PATH_INVALID');
  }
  return target;
}
function verifyManifest(root: string): RuntimeManifest {
  const bytes = fs.readFileSync(path.join(root, 'job-b-interface-manifest.json'));
  const manifest = JSON.parse(bytes.toString('utf8')) as RuntimeManifest;
  if (
    manifest.schemaVersion !== 'ECR_JOB_B_INTERFACE_RUNTIME_MANIFEST_V1'
    || manifest.protocol !== JOB_B_INTERFACE_PROTOCOL
    || manifest.version !== JOB_B_INTERFACE_VERSION
    || manifest.hashAlgorithm !== 'sha256'
    || !same(manifest.componentOrder, JOB_B_INTERFACE_COMPONENT_ORDER)
    || manifest.fileCount !== 1 || manifest.files.length !== 1
    || manifest.files[0].path !== 'server/ecr-pre-pilot/job-b-interface/worker.py'
    || manifest.files[0].sha256 !== TRUSTED_WORKER_SHA256
    || manifest.artifactSha256 !== TRUSTED_ARTIFACT_SHA256
    || manifest.stage4Adapter.manifestSha256
      !== TRUSTED_STAGE4_ADAPTER_MANIFEST_SHA256
    || manifest.stage4Adapter.artifactSha256
      !== TRUSTED_STAGE4_ADAPTER_ARTIFACT_SHA256
  ) throw new Error('JOB_B_INTERFACE_MANIFEST_IDENTITY_INVALID');
  const records = manifest.files.map(record => {
    const content = fs.readFileSync(checkedFile(root, record.path));
    if (content.length !== record.bytes || hash(content) !== record.sha256) {
      throw new Error('JOB_B_INTERFACE_RUNTIME_FILE_HASH_MISMATCH');
    }
    return `${record.path}:${record.bytes}:${record.sha256}`;
  });
  if (hash(records.join('\n')) !== manifest.aggregateSha256) {
    throw new Error('JOB_B_INTERFACE_RUNTIME_AGGREGATE_MISMATCH');
  }
  const unsigned: JsonObject = { ...manifest };
  delete unsigned.artifactSha256;
  if (hash(canonical(unsigned)) !== manifest.artifactSha256) {
    throw new Error('JOB_B_INTERFACE_ARTIFACT_HASH_MISMATCH');
  }
  const adapterManifestBytes = fs.readFileSync(path.join(
    stage4AdapterRoot(root, manifest),
    'stage4-seven-component-adapter-manifest.json',
  ));
  const adapterManifest = JSON.parse(adapterManifestBytes.toString('utf8')) as JsonObject;
  if (
    hash(adapterManifestBytes) !== manifest.stage4Adapter.manifestSha256
    || adapterManifest.artifactSha256 !== manifest.stage4Adapter.artifactSha256
  ) throw new Error('JOB_B_INTERFACE_STAGE4_ADAPTER_PIN_MISMATCH');
  return manifest;
}

function validateResponse(
  value: unknown,
  manifest: RuntimeManifest,
): JobBInterfaceResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('JOB_B_INTERFACE_RESPONSE_INVALID');
  }
  const response = value as JobBInterfaceResponse;
  const unsigned = { ...response };
  delete unsigned.resultHash;
  if (
    response.protocol !== JOB_B_INTERFACE_PROTOCOL
    || response.version !== JOB_B_INTERFACE_VERSION
    || !same(response.componentOrder, JOB_B_INTERFACE_COMPONENT_ORDER)
    || response.engineId !== JOB_B_INTERFACE_ENGINE_ID
    || response.engineVersion !== JOB_B_INTERFACE_ENGINE_VERSION
    || response.stage4AdapterArtifactSha256
      !== TRUSTED_STAGE4_ADAPTER_ARTIFACT_SHA256
    || response.jobBInterfaceArtifactSha256 !== manifest.artifactSha256
    || response.workerSha256 !== TRUSTED_WORKER_SHA256
    || !isHash(response.engineHash) || !isHash(response.resultHash)
    || resultDigest(unsigned) !== response.resultHash
  ) throw new Error('JOB_B_INTERFACE_RESPONSE_INTEGRITY_INVALID');
  return response;
}

async function invoke(
  operation: 'PREFLIGHT' | 'SOLVE_INTERFACE',
  request: JsonObject,
  timeoutMs: number,
) {
  const root = runtimeRoot();
  const manifest = verifyManifest(root);
  const adapterRoot = stage4AdapterRoot(root, manifest);
  const worker = checkedFile(
    root, 'server/ecr-pre-pilot/job-b-interface/worker.py',
  );
  const python = process.env.JOB_B_INTERFACE_PYTHON
    ?? process.env.STAGE4_EQUILIBRIUM_ADAPTER_PYTHON
    ?? 'python3.12';
  const childEnv: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH', 'LD_LIBRARY_PATH', 'LIBRARY_PATH', 'NIX_LD', 'NIX_LD_LIBRARY_PATH',
    'LOCALE_ARCHIVE', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR',
  ]) {
    if (process.env[key] !== undefined) childEnv[key] = process.env[key];
  }
  Object.assign(childEnv, {
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONUNBUFFERED: '1',
    JOB_B_INTERFACE_PROTOCOL,
    JOB_B_INTERFACE_RUNTIME_ROOT: root,
    STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL:
      'ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1',
    STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT: adapterRoot,
    STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT:
      process.env.STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT
      ?? path.resolve(adapterRoot, '../predictive-nt-runtime-7c-1-5'),
  });
  return await new Promise<JobBInterfaceResponse>((resolve, reject) => {
    const child = spawn(python, [worker], {
      cwd: root,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let settled = false;
    const finish = (error?: Error, response?: JobBInterfaceResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(response!);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('JOB_B_INTERFACE_TIMEOUT'));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.resume();
    child.on('error', () => finish(new Error('JOB_B_INTERFACE_PROCESS_START_FAILED')));
    child.on('close', code => {
      if (code !== 0) return finish(new Error('JOB_B_INTERFACE_PROCESS_FAILED'));
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length !== 1) {
        return finish(new Error('JOB_B_INTERFACE_PROTOCOL_FRAMING_INVALID'));
      }
      try {
        finish(undefined, validateResponse(JSON.parse(lines[0]), manifest));
      } catch (error) {
        finish(error instanceof Error
          ? error : new Error('JOB_B_INTERFACE_RESPONSE_INVALID'));
      }
    });
    child.stdin.end(`${JSON.stringify({
      protocol: JOB_B_INTERFACE_PROTOCOL,
      operation,
      ...request,
    })}\n`);
  });
}

export function solveSevenComponentTwoFilmInterface(
  request: JobBInterfaceRequest,
  options?: { timeoutMs?: number },
) {
  return invoke(
    'SOLVE_INTERFACE',
    request as unknown as JsonObject,
    options?.timeoutMs ?? 300_000,
  );
}

export function preflightSevenComponentTwoFilmInterface(
  options?: { timeoutMs?: number },
) {
  return invoke('PREFLIGHT', {}, options?.timeoutMs ?? 120_000);
}

export function jobBInterfaceArtifactHash() {
  return verifyManifest(runtimeRoot()).artifactSha256;
}