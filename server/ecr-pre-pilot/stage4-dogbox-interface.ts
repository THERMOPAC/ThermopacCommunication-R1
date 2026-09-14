import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { JobBInterfaceRequest, JobBInterfaceResponse } from './job-b-interface';

const PROTOCOL = 'ECR_JOB_B_INTERFACE_V1';
const WRAPPER_RUNTIME_SCHEMA = 'ECR_STAGE4_JOB_B_DOGBOX_RUNTIME_MANIFEST_V1';
const STRATEGY_ID = 'STAGE4_DOGBOX_JAC_SCALED_V1';
const WRAPPER_WORKER = 'server/ecr-pre-pilot/job-b-interface-stage4-dogbox/worker.py';
const LEGACY_WORKER_SHA256 = '70229d3eacfde61d906f39bc3dec8a29387cabfc96944493ffb5318653e02f2d';
const LEGACY_ARTIFACT_SHA256 = '71c21d480c81e5971754fa664f42259ab9dd117f77ff37a8361a0e2d89de12db';
const LEGACY_MANIFEST_SHA256 = 'daa9e16e366b57bbd0c8ad71581cfde705127d9cd3594939c7a7f67d296662da';
const TRUSTED_WRAPPER_WORKER_SHA256 = 'bc549bd13fb2caee0f94ae4281bc69cdd9c84cfb8414fff47a295ec6a93996e5';
const TRUSTED_WRAPPER_ARTIFACT_SHA256 = 'ab4d9ffa71953743171d821b823907683c77dec5a48e900bba3a31898514978b';

type Json = Record<string, unknown>;
interface Manifest {
  schemaVersion: string; protocol: string; artifactSha256: string; aggregateSha256: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
  legacyRuntime: { defaultRelativePath: string; artifactSha256: string };
  legacyWorkerSha256: string;
  numericalStrategy: { id: string; leastSquaresMethod: string; xScale: string };
}
export interface Stage4DogboxInterfaceResponse extends JobBInterfaceResponse {
  numericalStrategy: {
    id: typeof STRATEGY_ID; leastSquaresMethod: 'dogbox'; xScale: 'jac';
    legacyWorkerSha256: string; wrapperWorkerSha256: string;
  };
}
export interface Stage4DogboxInterfaceSession {
  solve(request: JobBInterfaceRequest, timeoutMs?: number): Promise<Stage4DogboxInterfaceResponse>;
  close(): void;
}

const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value as Json).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
    : JSON.stringify(value);
const hashNumber = (value: number) => {
  const [m, e] = value.toExponential(16).toLowerCase().split('e');
  return `${m}e${Number(e)}`;
};
const hashValue = (value: unknown): unknown => typeof value === 'number'
  ? { $number: hashNumber(value) }
  : Array.isArray(value) ? value.map(hashValue)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value as Json).map(([k, v]) => [k, hashValue(v)])) : value;
const resultHash = (value: unknown) => sha(canonical(hashValue(value)));
const checked = (root: string, relative: string) => {
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('STAGE4_DOGBOX_MANIFEST_PATH_INVALID');
  return target;
};
function wrapperRoot() {
  return path.resolve(process.env.STAGE4_JOB_B_DOGBOX_RUNTIME_ROOT
    ?? path.join(process.cwd(), 'dist/stage4-job-b-dogbox-runtime'));
}

/** Public for integration tests and startup-only fail-closed verification. */
export function verifyStage4DogboxRuntime(root = wrapperRoot()) {
  const manifestBytes = fs.readFileSync(path.join(root, 'stage4-job-b-dogbox-manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString()) as Manifest;
  const record = manifest.files?.[0];
  if (manifest.schemaVersion !== WRAPPER_RUNTIME_SCHEMA || manifest.protocol !== PROTOCOL
    || manifest.artifactSha256 !== TRUSTED_WRAPPER_ARTIFACT_SHA256
    || manifest.legacyWorkerSha256 !== LEGACY_WORKER_SHA256
    || manifest.legacyRuntime?.artifactSha256 !== LEGACY_ARTIFACT_SHA256
    || manifest.numericalStrategy?.id !== STRATEGY_ID
    || manifest.numericalStrategy?.leastSquaresMethod !== 'dogbox'
    || manifest.numericalStrategy?.xScale !== 'jac' || manifest.files.length !== 1
    || record.path !== WRAPPER_WORKER || record.sha256 !== TRUSTED_WRAPPER_WORKER_SHA256) {
    throw new Error('STAGE4_DOGBOX_MANIFEST_IDENTITY_INVALID');
  }
  const unsigned = { ...manifest } as Record<string, unknown>;
  delete unsigned.artifactSha256;
  if (sha(canonical(unsigned)) !== manifest.artifactSha256) {
    throw new Error('STAGE4_DOGBOX_MANIFEST_ARTIFACT_HASH_MISMATCH');
  }
  const source = fs.readFileSync(checked(root, record.path));
  if (source.length !== record.bytes || sha(source) !== record.sha256
    || sha(`${record.path}:${record.bytes}:${record.sha256}`) !== manifest.aggregateSha256) {
    throw new Error('STAGE4_DOGBOX_RUNTIME_FILE_HASH_MISMATCH');
  }
  const legacyRoot = path.resolve(process.env.STAGE4_JOB_B_LEGACY_RUNTIME_ROOT
    ?? path.join(root, manifest.legacyRuntime.defaultRelativePath));
  const legacyBytes = fs.readFileSync(path.join(legacyRoot, 'job-b-interface-manifest.json'));
  const legacy = JSON.parse(legacyBytes.toString());
  if (legacy.artifactSha256 !== LEGACY_ARTIFACT_SHA256
    || sha(legacyBytes) !== LEGACY_MANIFEST_SHA256
    || legacy.files?.length !== 1 || legacy.files?.[0]?.sha256 !== LEGACY_WORKER_SHA256) {
    throw new Error('STAGE4_DOGBOX_LEGACY_RUNTIME_PIN_INVALID');
  }
  return { root, legacyRoot, manifest };
}
function validate(value: unknown, manifest: Manifest): Stage4DogboxInterfaceResponse {
  if (!value || typeof value !== 'object') throw new Error('STAGE4_DOGBOX_RESPONSE_INVALID');
  const response = value as Stage4DogboxInterfaceResponse;
  const unsigned = { ...response }; delete unsigned.resultHash;
  if (response.protocol !== PROTOCOL || response.jobBInterfaceArtifactSha256 !== manifest.artifactSha256
    || response.workerSha256 !== TRUSTED_WRAPPER_WORKER_SHA256
    || response.numericalStrategy?.id !== STRATEGY_ID
    || response.numericalStrategy?.leastSquaresMethod !== 'dogbox'
    || response.numericalStrategy?.xScale !== 'jac'
    || response.numericalStrategy?.legacyWorkerSha256 !== LEGACY_WORKER_SHA256
    || response.numericalStrategy?.wrapperWorkerSha256 !== TRUSTED_WRAPPER_WORKER_SHA256
    || !/^[a-f0-9]{64}$/.test(response.resultHash) || resultHash(unsigned) !== response.resultHash) {
    throw new Error('STAGE4_DOGBOX_RESPONSE_INTEGRITY_INVALID');
  }
  return response;
}

export function createStage4DogboxInterfaceSession(
  options?: { timeoutMs?: number },
): Stage4DogboxInterfaceSession {
  const { root, legacyRoot, manifest } = verifyStage4DogboxRuntime();
  const adapterRoot = path.resolve(process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT
    ?? path.join(legacyRoot, '../stage4-seven-component-adapter-runtime'));
  const python = process.env.STAGE4_JOB_B_DOGBOX_PYTHON
    ?? process.env.JOB_B_INTERFACE_PYTHON ?? process.env.STAGE4_EQUILIBRIUM_ADAPTER_PYTHON ?? 'python3.12';
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'LD_LIBRARY_PATH', 'LIBRARY_PATH', 'NIX_LD', 'NIX_LD_LIBRARY_PATH',
    'LOCALE_ARCHIVE', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1', JOB_B_INTERFACE_PROTOCOL: PROTOCOL,
    STAGE4_JOB_B_DOGBOX_RUNTIME_ROOT: root, STAGE4_JOB_B_LEGACY_RUNTIME_ROOT: legacyRoot,
    STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL: 'ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1',
    STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT: adapterRoot,
    STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT: process.env.STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT
      ?? path.resolve(adapterRoot, '../predictive-nt-runtime-7c-1-5'),
  });
  const child = spawn(python, [checked(root, WRAPPER_WORKER)], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const defaultTimeout = options?.timeoutMs ?? 120_000;
  let closed = false, output = '';
  type Pending = { resolve: (v: Stage4DogboxInterfaceResponse) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
  const pending: Pending[] = [];
  const fail = (error: Error) => { while (pending.length) { const p = pending.shift()!; clearTimeout(p.timer); p.reject(error); } };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output += chunk; let end = output.indexOf('\n');
    while (end >= 0) {
      const line = output.slice(0, end).trim(); output = output.slice(end + 1); const p = pending.shift();
      if (!p || !line) { closed = true; child.kill('SIGKILL'); fail(new Error('STAGE4_DOGBOX_PROTOCOL_FRAMING_INVALID')); return; }
      clearTimeout(p.timer);
      try { p.resolve(validate(JSON.parse(line), manifest)); } catch (e) { p.reject(e instanceof Error ? e : new Error('STAGE4_DOGBOX_RESPONSE_INVALID')); }
      end = output.indexOf('\n');
    }
  });
  child.stderr.resume();
  child.on('error', () => { closed = true; fail(new Error('STAGE4_DOGBOX_PROCESS_START_FAILED')); });
  child.on('close', () => { if (!closed) { closed = true; fail(new Error('STAGE4_DOGBOX_PROCESS_FAILED')); } });
  return { solve(request, timeoutMs = defaultTimeout) {
    if (closed) return Promise.reject(new Error('STAGE4_DOGBOX_SESSION_CLOSED'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { closed = true; child.kill('SIGKILL'); reject(new Error('STAGE4_DOGBOX_TIMEOUT')); fail(new Error('STAGE4_DOGBOX_TIMEOUT')); }, timeoutMs);
      pending.push({ resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ protocol: PROTOCOL, operation: 'SOLVE_INTERFACE', ...request })}\n`);
    });
  }, close() { if (!closed) { closed = true; child.kill('SIGKILL'); fail(new Error('STAGE4_DOGBOX_SESSION_CLOSED')); } } };
}