/** Parent launches this CLI with managed run_in_background. No DB imports. */
import { existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { evaluateP1ResearchEnvelope30To200 } from '../../server/ecr-pre-pilot/stage3-stage4-optimizer';
import { dir, read, sha, save } from './common';
const input = read(dir + 'input.json'), manifest = read(dir + 'input-manifest.json');
if (sha(dir + 'input.json') !== manifest.inputSha256) throw Error('Input checksum mismatch');
for (const [p, h] of Object.entries({ ...manifest.codeHashes, ...manifest.comparatorHashes })) if (sha(p) !== h) throw Error('Frozen source/comparator changed: ' + p);
if (existsSync(dir + 'result.json') || existsSync(dir + 'run-start.json')) throw Error('Refusing repeated scientific sweep');
const start = performance.now();
const log = (event: any) => appendFileSync(dir + 'progress.jsonl', JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
save('run-start.json', { at: new Date().toISOString(), pid: process.pid, inputSha256: manifest.inputSha256, managedTaskId: process.env.P1_MANAGED_TASK_ID ?? 'RECORDED_BY_PARENT', earlyStop: false });
log({ status: 'RUNNING', expectedTrials: 13230, expectedScenarios: 79380 });
try {
  const output = evaluateP1ResearchEnvelope30To200(input.basis, input.currentStage1Hash);
  // NaN is never silently converted to null in physical trial/scenario output.
  for (const g of output.orientation.geometryGrid) for (const t of g.trials) {
    JSON.stringify(t, (k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) throw Error('Nonfinite trial diagnostic: ' + k); return v; });
  }
  const result = { ...output, provenance: { inputSha256: manifest.inputSha256, experimentalEnvelope: input.experimentalEnvelope }, elapsedSeconds: (performance.now() - start) / 1000 };
  // No-window group score uses Infinity internally, not a physical diagnostic.
  writeFileSync(dir + 'result.json', JSON.stringify(result, (_, v) => typeof v === 'number' && !Number.isFinite(v) ? 'NONFINITE_RANKING_SENTINEL' : v));
  save('compute-terminal.json', { status: 'COMPUTE_COMPLETE_PENDING_VALIDATION', elapsedSeconds: result.elapsedSeconds, resultSha256: sha(dir + 'result.json') });
  log({ status: 'COMPUTE_COMPLETE_PENDING_VALIDATION', elapsedSeconds: result.elapsedSeconds });
  await import('./report');
} catch (e) {
  save('terminal.json', { status: 'FAILED', elapsedSeconds: (performance.now() - start) / 1000, error: String(e) });
  log({ status: 'FAILED', error: String(e) });
  throw e;
}