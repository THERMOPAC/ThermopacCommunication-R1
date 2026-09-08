import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';

const outDir = import.meta.dirname;
const root = path.resolve(outDir, '../..');
const id = process.argv[2];
if (!['so-0.75', 'so-1.0'].includes(id)) throw new Error('INVALID_CASE_ID');
const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
const row = manifest.cases.find((entry) => entry.id === id);
const runtimeRoot = path.join(root, manifest.runtimeRoot);
const worker = path.join(runtimeRoot, manifest.workerRelative);
const requestPath = path.join(root, row.requestPath);
const stdoutPath = path.join(outDir, `${id}-raw-output.json`);
const stderrPath = path.join(outDir, `${id}-stderr.log`);
const statusPath = path.join(outDir, `${id}-status.json`);
const checkpointsDir = path.join(outDir, `${id}-checkpoints`);
fs.mkdirSync(checkpointsDir);
const stdoutFd = fs.openSync(stdoutPath, 'wx');
const stderrFd = fs.openSync(stderrPath, 'wx');
const started = new Date();
let checkpointCount = 0;
let stderrBuffer = '';
let timedOut = false;
let terminal = false;

function writeStatus(state, extra = {}) {
  const temporary = `${statusPath}.tmp`;
  const payload = {
    schemaVersion: 'OFFLINE_SOLVENT_SENSITIVITY_STATUS_V1',
    id, state, runnerPid: process.pid, childPid: child?.pid ?? null,
    startedAt: started.toISOString(), updatedAt: new Date().toISOString(),
    checkpointCount, maximumScientificWallSeconds: 2400, ...extra,
  };
  const fd = fs.openSync(temporary, 'w');
  fs.writeSync(fd, `${JSON.stringify(payload, null, 2)}\n`);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(temporary, statusPath);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

let child;
child = spawn('python3.12', [worker], {
  cwd: runtimeRoot,
  detached: true,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },
});
writeStatus('RUNNING');
const deadline = setTimeout(() => {
  timedOut = true;
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  }, 5000).unref();
}, 2_400_000);

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
    const match = /^PREDICTIVE_NT_CHECKPOINT\s+(\d+)\s+([a-f0-9]{64})\s+([A-Za-z0-9+/=]+)$/.exec(line);
    if (!match) continue;
    const stageCount = Number(match[1]);
    const payloadHash = match[2];
    const canonicalPayload = Buffer.from(match[3], 'base64');
    if (sha256(canonicalPayload) !== payloadHash) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      throw new Error('CHECKPOINT_PAYLOAD_HASH_MISMATCH');
    }
    const checkpointPath = path.join(checkpointsDir, `stage-${stageCount}-${payloadHash}.json`);
    const fd = fs.openSync(checkpointPath, 'wx');
    fs.writeSync(fd, canonicalPayload);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.chmodSync(checkpointPath, 0o444);
    checkpointCount += 1;
    writeStatus('RUNNING', { lastCheckpointStageCount: stageCount, lastCheckpointSha256: payloadHash });
    child.stdin.write(`PREDICTIVE_NT_ACK ${stageCount} ${payloadHash}\n`);
  }
});
child.on('error', (error) => {
  if (!terminal) writeStatus('PROCESS_ERROR', { error: error.message });
});
child.on('close', (code, signal) => {
  terminal = true;
  clearTimeout(deadline);
  fs.fsyncSync(stdoutFd); fs.closeSync(stdoutFd);
  fs.fsyncSync(stderrFd); fs.closeSync(stderrFd);
  let parsed = null;
  let parseError = null;
  try { parsed = JSON.parse(fs.readFileSync(stdoutPath, 'utf8')); } catch (error) { parseError = error.message; }
  const state = timedOut ? 'TERMINAL_PARTIAL_TIMEOUT'
    : code === 0 && parsed ? 'COMPLETED' : 'FAILED';
  writeStatus(state, {
    exitCode: code, signal, timedOut,
    stdoutSha256: sha256(fs.readFileSync(stdoutPath)),
    stderrSha256: sha256(fs.readFileSync(stderrPath)),
    outputParseStatus: parsed ? 'PASS' : 'FAIL',
    outputParseError: parseError,
    resultStatus: parsed?.status ?? null,
  });
  fs.chmodSync(stdoutPath, 0o444);
  fs.chmodSync(stderrPath, 0o444);
  fs.chmodSync(statusPath, 0o444);
  process.exit(state === 'COMPLETED' ? 0 : timedOut ? 124 : 1);
});
child.stdin.write(fs.readFileSync(requestPath));