import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const STAGE4_SEVEN_COMPONENT_ADAPTER_PROTOCOL =
  'ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1' as const;
export const STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION = '1.0.0' as const;
export const STAGE4_SEVEN_COMPONENT_ORDER =
  ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'] as const;
export const STAGE4_SEVEN_COMPONENT_ENGINE_VERSION = '7C-1.5.0' as const;
export const STAGE4_SEVEN_COMPONENT_ENGINE_ID =
  'ECR2_PRE_PILOT_SEVEN_COMPONENT_0P5_5P0_H2O' as const;
const TRUSTED_BASE_MANIFEST_SHA256 =
  'f4e6e0156e6dc82dfaa3bf012a67ff143eb8cb45dd7c8208d9f924cec0d023fc';
const TRUSTED_BASE_AGGREGATE_SHA256 =
  '4ebbf36fde2c44be3920839ad189f349b93aae6bb905fbed2fa71bf257c3dbed';
const TRUSTED_BASE_FILE_COUNT = 2346;
const TRUSTED_ACTIVE_WORKER_SHA256 =
  'aff19f8c42e846245aefa3ab86ba931a09b7cdbdff76d729c9cd7a18447f5156';
const TRUSTED_SCIENTIFIC_ENGINE_SHA256 =
  '0ce9e61f7bdb87a2ccaa1a70edc547343e6cf03585b557855eaeaced1ad0f2d6';
const TRUSTED_ADAPTER_WORKER_SHA256 =
  '2ae60e5349e714fd3596c46f86554f02dd35204bc57e86cab5a54d046314c1d8';
const TRUSTED_ADAPTER_ARTIFACT_SHA256 =
  '5dcb38f4a73e712d2a503840c263385b89a87dbd69fb3fab73e5eafa6fa56012';

type JsonObject = Record<string, unknown>;
export type AdapterStatus =
  | 'PASS' | 'CALCULATED' | 'BLOCKED_NO_PHYSICAL_LLE'
  | 'BLOCKED_STABILITY_GATES' | 'BLOCKED_REFERENCE_DUTY_GATES'
  | 'FAILURE_NUMERICAL_GATES' | 'FAILURE_INVALID_REQUEST';

export interface LocalEquilibriumRequest {
  temperatureK: number;
  componentMolarInventory: number[];
  componentOrder: [...typeof STAGE4_SEVEN_COMPONENT_ORDER];
}
export interface ReferenceDutyRequest {
  temperatureK: number;
  componentOrder: [...typeof STAGE4_SEVEN_COMPONENT_ORDER];
  continuousFeedComponentMoles: number[];
  dispersedFeedComponentMoles: number[];
  completedStage2Job?: {
    jobId: string;
    userId: number;
    designId: number;
  };
}
export interface AdapterResponse extends JsonObject {
  protocol: typeof STAGE4_SEVEN_COMPONENT_ADAPTER_PROTOCOL;
  adapterVersion: typeof STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION;
  engineId: typeof STAGE4_SEVEN_COMPONENT_ENGINE_ID;
  engineVersion: typeof STAGE4_SEVEN_COMPONENT_ENGINE_VERSION;
  engineHash: string;
  componentOrder: [...typeof STAGE4_SEVEN_COMPONENT_ORDER];
  status: AdapterStatus;
  resultHash: string;
}
interface AdapterManifest {
  schemaVersion: 'ECR_STAGE4_ADAPTER_RUNTIME_MANIFEST_V1';
  protocol: typeof STAGE4_SEVEN_COMPONENT_ADAPTER_PROTOCOL;
  adapterVersion: typeof STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION;
  engineId: typeof STAGE4_SEVEN_COMPONENT_ENGINE_ID;
  engineVersion: typeof STAGE4_SEVEN_COMPONENT_ENGINE_VERSION;
  engineHash: string;
  componentOrder: string[];
  fileCount: number;
  aggregateSha256: string;
  artifactSha256: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
  baseRuntime: {
    artifact: 'predictive-nt-runtime-7c-1-5';
    defaultRelativePath: string;
    manifestPath: string;
    manifestSha256: string;
    aggregateSha256: string;
    fileCount: number;
    activeWorkerPath: string;
    activeWorkerSha256: string;
    scientificEnginePath: string;
    scientificEngineSha256: string;
  };
}
interface BaseManifest {
  schemaVersion: 'PREDICTIVE_NT_RUNTIME_MANIFEST_V1';
  hashAlgorithm: 'sha256';
  fileCount: number;
  aggregateSha256: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as JsonObject)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('NON_FINITE_ADAPTER_VALUE');
  }
  return JSON.stringify(value);
}
function hashNumber(value: number) {
  const [mantissa, exponent] = value.toExponential(16).toLowerCase().split('e');
  return `${mantissa}e${Number(exponent)}`;
}
function hashValue(value: unknown): unknown {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_FINITE_ADAPTER_VALUE');
    return { $number: hashNumber(value) };
  }
  if (Array.isArray(value)) return value.map(hashValue);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value as JsonObject).map(([key, item]) => [key, hashValue(item)]),
  );
  return value;
}
const resultDigest = (value: unknown) => hash(canonical(hashValue(value)));
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const isHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function runtimeRoot() {
  return process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT
    ? path.resolve(process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT)
    : path.resolve(process.cwd(), 'dist/stage4-seven-component-adapter-runtime');
}
function baseRuntimeRoot(adapterRoot: string, manifest: AdapterManifest) {
  return process.env.STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT
    ? path.resolve(process.env.STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT)
    : path.resolve(adapterRoot, manifest.baseRuntime.defaultRelativePath);
}
function checkedFile(root: string, relativePath: string) {
  const file = path.resolve(root, relativePath);
  if (!file.startsWith(`${root}${path.sep}`)) {
    throw new Error('STAGE4_RUNTIME_MANIFEST_PATH_INVALID');
  }
  return file;
}
function verifyManifest(root: string): AdapterManifest {
  const manifestPath = path.join(root, 'stage4-seven-component-adapter-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as AdapterManifest;
  if (
    manifest.schemaVersion !== 'ECR_STAGE4_ADAPTER_RUNTIME_MANIFEST_V1'
    || manifest.protocol !== STAGE4_SEVEN_COMPONENT_ADAPTER_PROTOCOL
    || manifest.adapterVersion !== STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION
    || manifest.engineId !== STAGE4_SEVEN_COMPONENT_ENGINE_ID
    || manifest.engineVersion !== STAGE4_SEVEN_COMPONENT_ENGINE_VERSION
    || !same(manifest.componentOrder, STAGE4_SEVEN_COMPONENT_ORDER)
    || manifest.fileCount !== manifest.files.length
    || !isHash(manifest.aggregateSha256) || !isHash(manifest.artifactSha256)
    || manifest.baseRuntime?.artifact !== 'predictive-nt-runtime-7c-1-5'
    || !isHash(manifest.baseRuntime.manifestSha256)
    || !isHash(manifest.baseRuntime.aggregateSha256)
    || !isHash(manifest.baseRuntime.activeWorkerSha256)
    || !isHash(manifest.baseRuntime.scientificEngineSha256)
    || manifest.baseRuntime.manifestSha256 !== TRUSTED_BASE_MANIFEST_SHA256
    || manifest.baseRuntime.aggregateSha256 !== TRUSTED_BASE_AGGREGATE_SHA256
    || manifest.baseRuntime.fileCount !== TRUSTED_BASE_FILE_COUNT
    || manifest.baseRuntime.activeWorkerSha256 !== TRUSTED_ACTIVE_WORKER_SHA256
    || manifest.baseRuntime.scientificEngineSha256 !== TRUSTED_SCIENTIFIC_ENGINE_SHA256
    || manifest.artifactSha256 !== TRUSTED_ADAPTER_ARTIFACT_SHA256
  ) throw new Error('STAGE4_ADAPTER_MANIFEST_IDENTITY_INVALID');
  const records = manifest.files.map(record => {
    const file = checkedFile(root, record.path);
    const content = fs.readFileSync(file);
    if (content.length !== record.bytes || hash(content) !== record.sha256) {
      throw new Error('STAGE4_ADAPTER_RUNTIME_FILE_HASH_MISMATCH');
    }
    return `${record.path}:${record.bytes}:${record.sha256}`;
  });
  if (hash(records.join('\n')) !== manifest.aggregateSha256) {
    throw new Error('STAGE4_ADAPTER_AGGREGATE_HASH_MISMATCH');
  }
  if (
    manifest.files.length !== 1
    || manifest.files[0].path
      !== 'server/ecr-pre-pilot/stage4-seven-component-adapter/worker.py'
    || manifest.files[0].sha256 !== TRUSTED_ADAPTER_WORKER_SHA256
  ) throw new Error('STAGE4_ADAPTER_WORKER_TRUST_ANCHOR_MISMATCH');
  const unsigned: Record<string, unknown> = { ...manifest };
  delete unsigned.artifactSha256;
  if (hash(canonical(unsigned)) !== manifest.artifactSha256) {
    throw new Error('STAGE4_ADAPTER_ARTIFACT_HASH_MISMATCH');
  }
  return manifest;
}
function verifyBaseManifest(root: string, pin: AdapterManifest['baseRuntime']) {
  const manifestFile = checkedFile(root, pin.manifestPath);
  const bytes = fs.readFileSync(manifestFile);
  if (hash(bytes) !== pin.manifestSha256) {
    throw new Error('STAGE4_BASE_RUNTIME_MANIFEST_HASH_MISMATCH');
  }
  const manifest = JSON.parse(bytes.toString('utf8')) as BaseManifest;
  if (
    manifest.schemaVersion !== 'PREDICTIVE_NT_RUNTIME_MANIFEST_V1'
    || manifest.hashAlgorithm !== 'sha256'
    || manifest.fileCount !== pin.fileCount
    || manifest.fileCount !== manifest.files.length
    || manifest.aggregateSha256 !== pin.aggregateSha256
  ) throw new Error('STAGE4_BASE_RUNTIME_MANIFEST_IDENTITY_INVALID');
  const records = manifest.files.map(record => {
    const content = fs.readFileSync(checkedFile(root, record.path));
    if (content.length !== record.bytes || hash(content) !== record.sha256) {
      throw new Error('STAGE4_BASE_RUNTIME_FILE_HASH_MISMATCH');
    }
    return `${record.path}:${record.bytes}:${record.sha256}`;
  });
  if (hash(records.join('\n')) !== manifest.aggregateSha256) {
    throw new Error('STAGE4_BASE_RUNTIME_AGGREGATE_HASH_MISMATCH');
  }
  const byPath = new Map(manifest.files.map(record => [record.path, record.sha256]));
  if (
    byPath.get(pin.activeWorkerPath) !== pin.activeWorkerSha256
    || byPath.get(pin.scientificEnginePath) !== pin.scientificEngineSha256
  ) throw new Error('STAGE4_BASE_RUNTIME_ENGINE_BINDING_MISMATCH');
}

function validateResponse(value: unknown, manifest: AdapterManifest): AdapterResponse {
  if (!value || typeof value !== 'object') throw new Error('STAGE4_ADAPTER_RESPONSE_INVALID');
  const result = value as AdapterResponse;
  const unsigned = { ...result };
  delete unsigned.resultHash;
  if (
    result.protocol !== STAGE4_SEVEN_COMPONENT_ADAPTER_PROTOCOL
    || result.adapterVersion !== STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION
    || result.engineId !== manifest.engineId || result.engineVersion !== manifest.engineVersion
    || result.engineHash !== manifest.engineHash
    || !same(result.componentOrder, STAGE4_SEVEN_COMPONENT_ORDER)
    || !isHash(result.engineHash) || !isHash(result.resultHash)
    || resultDigest(unsigned) !== result.resultHash
  ) throw new Error('STAGE4_ADAPTER_RESPONSE_INTEGRITY_INVALID');
  return result;
}

async function invoke(operation: string, body: JsonObject, timeoutMs = 120_000) {
  const root = runtimeRoot();
  const manifest = verifyManifest(root);
  const baseRoot = baseRuntimeRoot(root, manifest);
  verifyBaseManifest(baseRoot, manifest.baseRuntime);
  const worker = path.join(
    root, 'server/ecr-pre-pilot/stage4-seven-component-adapter/worker.py',
  );
  const python = process.env.STAGE4_EQUILIBRIUM_ADAPTER_PYTHON ?? 'python3.12';
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
    STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL: STAGE4_SEVEN_COMPONENT_ADAPTER_PROTOCOL,
    STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT: root,
    STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT: baseRoot,
  });
  return await new Promise<AdapterResponse>((resolve, reject) => {
    const child = spawn(python, [worker], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
    });
    let stdout = '', settled = false;
    const finish = (error?: Error, response?: AdapterResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(response!);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('STAGE4_ADAPTER_TIMEOUT'));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.resume();
    child.on('error', () => finish(new Error('STAGE4_ADAPTER_PROCESS_START_FAILED')));
    child.on('close', code => {
      if (code !== 0) return finish(new Error('STAGE4_ADAPTER_PROCESS_FAILED'));
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length !== 1) return finish(new Error('STAGE4_ADAPTER_PROTOCOL_FRAMING_INVALID'));
      try {
        finish(undefined, validateResponse(JSON.parse(lines[0]), manifest));
      } catch (error) {
        finish(error instanceof Error ? error : new Error('STAGE4_ADAPTER_RESPONSE_INVALID'));
      }
    });
    child.stdin.end(`${JSON.stringify({
      protocol: STAGE4_SEVEN_COMPONENT_ADAPTER_PROTOCOL, operation, ...body,
    })}\n`);
  });
}

export async function evaluateSevenComponentLocalEquilibrium(
  request: LocalEquilibriumRequest,
  options?: { timeoutMs?: number },
) {
  return invoke('LOCAL_EQUILIBRIUM', request as unknown as JsonObject, options?.timeoutMs);
}
export async function generateSevenComponentReferenceDuty(
  request: ReferenceDutyRequest,
  options?: { timeoutMs?: number },
) {
  if (request.completedStage2Job) {
    const { loadValidatedCompletedSevenComponentNtForStage4 } = await import(
      './predictive-nt-job-service'
    );
    try {
      const trusted = await loadValidatedCompletedSevenComponentNtForStage4(
        request.completedStage2Job.jobId,
        request.completedStage2Job.userId,
        request.completedStage2Job.designId,
      );
      const adapterRoot = runtimeRoot();
      const manifest = verifyManifest(adapterRoot);
      verifyBaseManifest(baseRuntimeRoot(adapterRoot, manifest), manifest.baseRuntime);
      if (trusted.engineHash !== manifest.engineHash) {
        throw new Error('STAGE4_STAGE2_ENGINE_HASH_MISMATCH');
      }
      const response: Record<string, unknown> = {
        protocol: STAGE4_SEVEN_COMPONENT_ADAPTER_PROTOCOL,
        adapterVersion: STAGE4_SEVEN_COMPONENT_ADAPTER_VERSION,
        engineId: manifest.engineId,
        engineVersion: manifest.engineVersion,
        engineHash: manifest.engineHash,
        componentOrder: [...STAGE4_SEVEN_COMPONENT_ORDER],
        status: 'CALCULATED',
        operation: 'REFERENCE_DUTY',
        provenance: 'CALCULATED_STAGE_2',
        theoreticalStages: trusted.theoreticalStages,
        stage2ResultHash: trusted.resultSnapshotHash,
        duty: {
          id: resultDigest({
            resultSnapshotHash: trusted.resultSnapshotHash,
            selectedTrial: trusted.selectedTrial,
          }),
          schemaVersion: 'ECR_STAGE4_REFERENCE_DUTY_V1',
          componentOrder: [...STAGE4_SEVEN_COMPONENT_ORDER],
          theoreticalStages: trusted.theoreticalStages,
          selectedTrial: trusted.selectedTrial,
        },
      };
      response.resultHash = resultDigest(response);
      return validateResponse(response, manifest);
    } catch {
      // A missing, stale, or invalid Stage-2 job is never admitted as evidence.
      // Execute the real governed seven-stage design fallback instead.
    }
  }
  const { completedStage2Job: _serverResolvedJob, ...fallback } = request;
  return invoke(
    'REFERENCE_DUTY',
    fallback as unknown as JsonObject,
    options?.timeoutMs ?? 900_000,
  );
}
export async function preflightSevenComponentStage4Adapter(options?: { timeoutMs?: number }) {
  return invoke('PREFLIGHT', {}, options?.timeoutMs);
}
export function stage4SevenComponentAdapterArtifactHash() {
  return verifyManifest(runtimeRoot()).artifactSha256;
}