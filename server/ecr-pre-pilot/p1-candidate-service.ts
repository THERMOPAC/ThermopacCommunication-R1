import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { pool } from '../db';
import { validateStage1Snapshot, makeStage1HydrodynamicProcessBasis } from './stage1';
import { kuhniRunHash } from './kuhni-hydrodynamics';
import {
  canonicalizeStage3Stage4OptimizerControls,
  ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION as VERSION,
  ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH as HASH,
} from './stage3-stage4-optimizer';

export const P1_CANDIDATE_KIND = 'RRBO_P1_CANDIDATE_ONLY';
const session = randomUUID();
const active = new Map<string, Promise<void>>();
const persistenceFailures = new Map<string, string>();

export function calculateP1InWorker(basis: unknown, snapshotHash: string, controls: unknown): Promise<any> {
  return new Promise((resolveResult, reject) => {
    let received = false;
    const builtModule = resolve('dist/p1-optimizer.cjs');
    const modulePath = process.env.NODE_ENV === 'production' ? builtModule : resolve('server/ecr-pre-pilot/stage3-stage4-optimizer.ts');
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      if (workerData.module.endsWith('.ts')) require('tsx/cjs');
      const { optimizeStage3Stage4P1ForReview } = require(workerData.module);
      try { parentPort.postMessage({result: optimizeStage3Stage4P1ForReview(workerData.basis, workerData.snapshotHash, workerData.controls)}); }
      catch (error) { parentPort.postMessage({error: error.message}); }
    `, { eval: true, workerData: { module: modulePath, basis, snapshotHash, controls } });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('P1_CANDIDATE_TIME_LIMIT')); }, 15 * 60_000);
    worker.once('message', message => {
      received = true;
      clearTimeout(timer);
      void worker.terminate();
      message.error ? reject(new Error(message.error)) : resolveResult(message.result);
    });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => { clearTimeout(timer); if (!received) reject(new Error(`P1_WORKER_EXIT_WITHOUT_RESULT_${code}`)); });
  });
}

type QueryClient = Pick<typeof pool, 'query'>;

async function savedBasis(userId: number, designId: number, client: QueryClient = pool, lock = false) {
  const design = await client.query(`SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2${lock ? ' FOR SHARE' : ''}`, [designId, userId]);
  if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const snapshot = validateStage1Snapshot(design.rows[0].input_data);
  return { snapshot, basis: makeStage1HydrodynamicProcessBasis(snapshot) };
}

async function append(userId: number, designId: number, basis: any, metadata: any, result: any = null, client: QueryClient = pool) {
  const payload = { candidateKind: P1_CANDIDATE_KIND, metadata, result };
  const hash = kuhniRunHash({ basis, payload });
  await client.query(`INSERT INTO ecr_pre_pilot_kuhni_geometry_resolver_runs
    (design_id,created_by,stage1_snapshot_hash,process_basis,theoretical_stage_authority,result_snapshot,implementation_hash,immutable_hash)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
  [designId, userId, basis.stage1SnapshotHash, basis, { candidateOnly: true, designNt: 7 }, payload, HASH, hash]);
}

export async function getP1Candidates(userId: number, designId: number, candidateId?: string) {
  const { snapshot } = await savedBasis(userId, designId);
  return candidateViews(pool, userId, designId, snapshot.immutableHash, candidateId);
}

async function candidateViews(client: QueryClient, userId: number, designId: number, snapshotHash: string, candidateId?: string) {
  const rows = await client.query(`SELECT DISTINCT ON (result_snapshot#>>'{metadata,id}')
      process_basis AS basis,result_snapshot AS payload,immutable_hash AS hash,created_at AS "createdAt"
    FROM ecr_pre_pilot_kuhni_geometry_resolver_runs
    WHERE design_id=$1 AND created_by=$2 AND result_snapshot->>'candidateKind'=$3
      AND ($4::text IS NULL OR result_snapshot#>>'{metadata,id}'=$4)
    ORDER BY result_snapshot#>>'{metadata,id}',created_at DESC,id DESC`,
  [designId, userId, P1_CANDIDATE_KIND, candidateId ?? null]);
  return rows.rows.map((row: any) => {
    if (kuhniRunHash({ basis: row.basis, payload: row.payload }) !== row.hash) throw new Error('P1_CANDIDATE_INTEGRITY_FAILURE');
    const { metadata, result } = row.payload;
    if (result) {
      const { calculationHash, ...calculation } = result;
      if (result.engine.version !== VERSION || result.engine.implementationHash !== HASH || kuhniRunHash(calculation) !== calculationHash) throw new Error('P1_CANDIDATE_METHOD_INTEGRITY_FAILURE');
    }
    const persistenceError = persistenceFailures.get(metadata.id);
    return { ...metadata,
      status: persistenceError ? 'failed' : metadata.status === 'running' && Date.now() - Date.parse(metadata.requestedAt) > 16 * 60_000 ? 'interrupted' : metadata.status,
      ...(persistenceError ? { error: persistenceError } : {}),
      stale: metadata.sourceSnapshotHash !== snapshotHash, basis: row.basis, result,
      createdAt: row.createdAt, immutableHash: row.hash, candidateOnly: true };
  }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function startP1Candidate(userId: number, designId: number, input: any) {
  if (input?.phaseConfiguration !== 'rrbo-continuous-nmp-dispersed') throw new Error('P1_EXPLICIT_RRBO_CONTINUOUS_PHASE_REQUIRED');
  const controls = canonicalizeStage3Stage4OptimizerControls();
  const key = `${userId}:${designId}`;
  // Every submission query uses this one connection. Never borrow from the
  // pool while holding its reserved client (including a pool of size one).
  const client = await pool.connect();
  let releaseError: Error | undefined;
  let launch: { basis: any; metadata: any } | undefined;
  try {
    await client.query('BEGIN');
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired', [`p1-candidate:${key}`]);
    if (!lock.rows[0]?.acquired) throw new Error('P1_CANDIDATE_ALREADY_RUNNING');
    // Re-read only after obtaining the submission lock. Hold the design row
    // stable until intent commits, so a concurrent Stage-1 save cannot race it.
    const { snapshot, basis: saved } = await savedBasis(userId, designId, client, true);
    if (input.sourceSnapshotHash !== snapshot.immutableHash) throw new Error('P1_STAGE1_CHANGED_RELOAD_REQUIRED');
    if (saved.operatingTemperatureC !== 40) throw new Error('P1_REQUIRES_SAVED_40C_BASIS');
    const basis = { ...saved, phaseConfiguration: input.phaseConfiguration };
    const inputHash = kuhniRunHash({ basis, controls, version: VERSION, implementationHash: HASH });
    const history = await candidateViews(client, userId, designId, snapshot.immutableHash);
    const existing = history.find((item: any) => item.inputHash === inputHash && ['running', 'completed'].includes(item.status));
    if (existing) {
      await client.query('COMMIT');
      return existing;
    }
    if (active.has(key)) throw new Error('P1_CANDIDATE_ALREADY_RUNNING');
    const metadata = { id: randomUUID(), inputHash, session, status: 'running', sourceSnapshotHash: snapshot.immutableHash,
      originalPhaseConfiguration: saved.phaseConfiguration, phaseConfiguration: input.phaseConfiguration,
      propertyTemperatureC: saved.operatingTemperatureC, version: VERSION, implementationHash: HASH,
      candidateOnly: true, controls, requestedAt: new Date().toISOString() };
    await append(userId, designId, basis, metadata, null, client);
    await client.query('COMMIT');
    launch = { basis, metadata };
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { releaseError = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)); }
    throw error;
  } finally {
    // A failed rollback destroys the broken connection instead of returning
    // a possibly open transaction to the pool; release happens in every path.
    client.release(releaseError);
  }
  const { basis, metadata } = launch!;
  // Start only after commit and release. Terminal event writes may now use pool.
  const task = calculateP1InWorker(basis, metadata.sourceSnapshotHash, controls)
    .then(result => {
      const { calculationHash, ...calculation } = result;
      if (result.engine?.version !== VERSION || result.engine?.implementationHash !== HASH || kuhniRunHash(calculation) !== calculationHash) {
        throw new Error('P1_WORKER_METHOD_INTEGRITY_FAILURE');
      }
      return append(userId, designId, basis, { ...metadata, status: 'completed' }, result);
    })
    .catch(error => append(userId, designId, basis, { ...metadata, status: 'failed', error: error.message }))
    .catch(error => {
      persistenceFailures.set(metadata.id, `P1_CANDIDATE_PERSISTENCE_FAILED: ${error.message}`);
      console.error('P1 candidate persistence failed', metadata.id, error.message);
    })
    .finally(() => { active.delete(key); });
  active.set(key, task);
  return { ...metadata, basis, result: null };
}

export async function getP1CandidateBasis(userId: number, designId: number) {
  const { snapshot, basis } = await savedBasis(userId, designId);
  return { sourceSnapshotHash: snapshot.immutableHash, basis, methodVersion: VERSION, candidateOnly: true };
}