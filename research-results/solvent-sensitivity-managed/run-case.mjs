import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const pairs = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith('--') || value === undefined) fail('INVALID_CLI_ARGUMENTS');
  pairs.set(key.slice(2), value);
}
const required = ['case', 'request', 'out', 'worker', 'deadline'];
if (required.some((key) => !pairs.has(key)) || pairs.size !== required.length) {
  fail('REQUIRED_CLI_ARGUMENTS: --case --request --out --worker --deadline');
}
const caseId = pairs.get('case');
if (!['so-0.75', 'so-1.0', 'protocol-test'].includes(caseId)) fail('INVALID_CASE_ID');
const requestPath = path.resolve(pairs.get('request'));
const outDir = path.resolve(pairs.get('out'));
const workerPath = path.resolve(pairs.get('worker'));
const deadlineSeconds = Number(pairs.get('deadline'));
if (!Number.isInteger(deadlineSeconds) || deadlineSeconds < 1 || deadlineSeconds > 2400) {
  fail('INVALID_DEADLINE_SECONDS');
}
const production = caseId !== 'protocol-test';
const managedRoot = path.resolve(import.meta.dirname);
if (production && (!outDir.startsWith(`${managedRoot}${path.sep}`) || deadlineSeconds !== 2400)) {
  fail('PRODUCTION_OUTPUT_OR_DEADLINE_NOT_FROZEN');
}
if (!fs.statSync(requestPath).isFile() || !fs.statSync(workerPath).isFile()) {
  fail('REQUEST_OR_WORKER_NOT_FOUND');
}
const requestBytes = fs.readFileSync(requestPath);
const requestText = requestBytes.toString('utf8');
if (!requestText.endsWith('\n') || requestText.slice(0, -1).includes('\n')) {
  fail('REQUEST_MUST_BE_EXACTLY_ONE_JSON_LINE');
}
const request = JSON.parse(requestText);
const ratio = request.sourceSolventOilMassRatio;
if (production && (
  ratio !== (caseId === 'so-0.75' ? 0.75 : 1)
  || request.ntTest !== 10
  || request.engineContractVersion !== '7C-1.5.0'
  || request.engineHash !== '4f0b57dd41a2d768e1964e49ecee23e87de358ad7de697a2b315ab94a79091ac'
  || request.modelHash !== 'f165f0d23eeae810e40341f1cc86a2b97514bc21b74838d4a08eab1760e6e1af'
  || request._checkpointProtocol !== 'ACK_V3_ENGINE_CONTRACT'
  || request._resume !== null
)) fail('FROZEN_PRODUCTION_REQUEST_MISMATCH');

fs.mkdirSync(outDir);
const stdoutPath = path.join(outDir, 'raw-output.json');
const stderrPath = path.join(outDir, 'stderr.log');
const statusPath = path.join(outDir, 'status.json');
const checkpointDir = path.join(outDir, 'checkpoints');
fs.mkdirSync(checkpointDir);
const stdoutFd = fs.openSync(stdoutPath, 'wx');
const stderrFd = fs.openSync(stderrPath, 'wx');
const startedAt = new Date();
let child;
let checkpointCount = 0;
let stderrBuffer = '';
let terminal = false;
let terminationReason = null;
let escalationTimer = null;

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function status(state, extra = {}) {
  const temporary = `${statusPath}.tmp-${process.pid}`;
  const value = {
    schemaVersion: 'OFFLINE_SOLVENT_SENSITIVITY_MANAGED_STATUS_V1',
    caseId,
    state,
    runnerPid: process.pid,
    scientificChildPid: child?.pid ?? null,
    scientificProcessGroupId: child?.pid ?? null,
    startedAt: startedAt.toISOString(),
    updatedAt: new Date().toISOString(),
    deadlineSeconds,
    checkpointCount,
    terminationReason,
    ...extra,
  };
  const fd = fs.openSync(temporary, 'wx');
  fs.writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(temporary, statusPath);
}

function stopGroup(signal, reason) {
  if (!terminationReason) terminationReason = reason;
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    try { process.kill(-child.pid, signal); } catch (error) {
      if (error.code !== 'ESRCH') process.stderr.write(`GROUP_SIGNAL_ERROR:${error.message}\n`);
    }
  }
}

function externallyStopped(signal) {
  status('STOP_REQUESTED', { receivedSignal: signal });
  stopGroup('SIGTERM', `RUNNER_RECEIVED_${signal}`);
  if (!escalationTimer) {
    escalationTimer = setTimeout(() => stopGroup('SIGKILL', `RUNNER_RECEIVED_${signal}`), 5000);
  }
}
process.on('SIGTERM', () => externallyStopped('SIGTERM'));
process.on('SIGINT', () => externallyStopped('SIGINT'));

child = spawn('python3.12', [workerPath], {
  cwd: production
    ? path.resolve('dist/predictive-nt-runtime-7c-1-5')
    : path.dirname(workerPath),
  detached: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});
status('RUNNING');
const deadlineTimer = setTimeout(() => {
  status('DEADLINE_STOP_REQUESTED');
  stopGroup('SIGTERM', 'SCIENTIFIC_DEADLINE_EXCEEDED');
  escalationTimer = setTimeout(
    () => stopGroup('SIGKILL', 'SCIENTIFIC_DEADLINE_EXCEEDED'),
    5000,
  );
}, deadlineSeconds * 1000);

child.stdout.on('data', (chunk) => {
  fs.writeSync(stdoutFd, chunk);
  fs.fsyncSync(stdoutFd);
});
child.stderr.on('data', (chunk) => {
  fs.writeSync(stderrFd, chunk);
  fs.fsyncSync(stderrFd);
  stderrBuffer += chunk.toString();
  const lines = stderrBuffer.split('\n');
  stderrBuffer = lines.pop() ?? '';
  for (const line of lines) {
    const checkpoint =
      /^PREDICTIVE_NT_CHECKPOINT\s+(\d+)\s+([a-f0-9]{64})\s+([A-Za-z0-9+/=]+)$/.exec(line);
    if (!checkpoint) continue;
    const stageCount = Number(checkpoint[1]);
    const claimedHash = checkpoint[2];
    const payload = Buffer.from(checkpoint[3], 'base64');
    if (digest(payload) !== claimedHash) {
      status('CHECKPOINT_REJECTED', { error: 'CHECKPOINT_PAYLOAD_HASH_MISMATCH' });
      stopGroup('SIGKILL', 'CHECKPOINT_PAYLOAD_HASH_MISMATCH');
      continue;
    }
    const checkpointPath = path.join(
      checkpointDir,
      `stage-${stageCount}-${claimedHash}.json`,
    );
    const checkpointFd = fs.openSync(checkpointPath, 'wx');
    fs.writeSync(checkpointFd, payload);
    fs.fsyncSync(checkpointFd);
    fs.closeSync(checkpointFd);
    fs.chmodSync(checkpointPath, 0o444);
    checkpointCount += 1;
    status('RUNNING', {
      lastCheckpointStageCount: stageCount,
      lastCheckpointSha256: claimedHash,
    });
    child.stdin.write(`PREDICTIVE_NT_ACK ${stageCount} ${claimedHash}\n`);
  }
});
child.stdin.on('error', (error) => {
  status('STDIN_ERROR', { error: error.message });
  stopGroup('SIGKILL', 'SCIENTIFIC_STDIN_ERROR');
});
child.on('error', (error) => {
  status('SPAWN_ERROR', { error: error.message });
  terminationReason ||= 'SCIENTIFIC_SPAWN_ERROR';
});
child.on('close', (code, signal) => {
  terminal = true;
  clearTimeout(deadlineTimer);
  if (escalationTimer) clearTimeout(escalationTimer);
  fs.fsyncSync(stdoutFd);
  fs.closeSync(stdoutFd);
  fs.fsyncSync(stderrFd);
  fs.closeSync(stderrFd);
  let result = null;
  let parseError = null;
  try {
    result = JSON.parse(fs.readFileSync(stdoutPath, 'utf8'));
  } catch (error) {
    parseError = error.message;
  }
  const strictReport = {
    jsonParsed: result !== null,
    engineContractMatches: result?.engineContractVersion === request.engineContractVersion,
    engineHashMatches: result?.engine?.engineHash === request.engineHash,
    ntTestedMatches: result?.ntTested === request.ntTest,
    wetSolventRatioMatches:
      result?.wetSolventConstruction?.solventOilMassRatio === ratio,
    componentOrderMatches:
      JSON.stringify(result?.componentOrder) ===
      JSON.stringify(['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O']),
    exactlyOneCheckpoint: checkpointCount === 1,
  };
  const strictPass = Object.values(strictReport).every(Boolean);
  const state = terminationReason === 'SCIENTIFIC_DEADLINE_EXCEEDED'
    ? 'TERMINAL_PARTIAL_TIMEOUT'
    : terminationReason?.startsWith('RUNNER_RECEIVED_')
      ? 'TERMINAL_EXTERNAL_STOP'
      : code === 0 && strictPass ? 'COMPLETED' : 'FAILED';
  status(state, {
    exitCode: code,
    signal,
    parseError,
    strictOutputReport: strictReport,
    stdoutSha256: digest(fs.readFileSync(stdoutPath)),
    stderrSha256: digest(fs.readFileSync(stderrPath)),
  });
  fs.chmodSync(stdoutPath, 0o444);
  fs.chmodSync(stderrPath, 0o444);
  fs.chmodSync(statusPath, 0o444);
  process.exit(state === 'COMPLETED' ? 0 : state === 'TERMINAL_PARTIAL_TIMEOUT' ? 124 : 1);
});
child.stdin.write(requestBytes);

process.on('exit', () => {
  if (!terminal) stopGroup('SIGKILL', terminationReason ?? 'RUNNER_EXITED_BEFORE_CHILD');
});