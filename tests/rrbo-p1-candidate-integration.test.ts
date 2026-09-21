import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const mocks = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), validate: vi.fn(), basis: vi.fn(), workers: [] as any[],
}));
vi.mock('../server/db', () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock('../server/ecr-pre-pilot/stage1', () => ({
  validateStage1Snapshot: mocks.validate, makeStage1HydrodynamicProcessBasis: mocks.basis,
}));
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events');
  return { Worker: class extends EventEmitter {
    constructor(public code: string, public options: any) { super(); mocks.workers.push(this); }
    terminate = vi.fn(async () => 0);
  } };
});
import { startP1Candidate, getP1Candidates, getP1CandidateBasis } from '../server/ecr-pre-pilot/p1-candidate-service';
import { kuhniRunHash } from '../server/ecr-pre-pilot/kuhni-hydrodynamics';
import { ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION as VERSION, ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH as HASH } from '../server/ecr-pre-pilot/stage3-stage4-optimizer';

let rows: any[] = [];
let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
let inTransaction = false;
const sourceBasis = { phaseConfiguration: 'nmp-continuous-rrbo-dispersed', operatingTemperatureC: 40, stage1SnapshotHash: 'source' };
beforeEach(() => {
  vi.clearAllMocks(); mocks.workers.length = 0; rows = [];
  mocks.validate.mockReturnValue({ immutableHash: 'source' });
  mocks.basis.mockReturnValue(sourceBasis);
  inTransaction = false;
  const execute = async (sql: string, values: any[] = []) => {
    if (sql === 'BEGIN') { inTransaction = true; return { rows: [] }; }
    if (sql === 'COMMIT' || sql === 'ROLLBACK') { inTransaction = false; return { rows: [] }; }
    if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: true }] };
    if (sql.includes('FROM ecr_pre_pilot_designs')) return { rows: values[1] === 7 ? [{ input_data: {} }] : [] };
    if (sql.startsWith('INSERT')) {
      rows.push({ basis: values[3], payload: values[5], hash: values[7], createdAt: new Date(rows.length * 1000).toISOString() });
      return { rows: [] };
    }
    if (sql.includes('SELECT DISTINCT')) {
      const map = new Map();
      for (const row of rows) if (!values[3] || row.payload.metadata.id === values[3]) map.set(row.payload.metadata.id, row);
      return { rows: [...map.values()] };
    }
    throw new Error(`Unexpected SQL ${sql}`);
  };
  client = { query: vi.fn(execute), release: vi.fn() };
  mocks.connect.mockResolvedValue(client);
  mocks.query.mockImplementation((sql, values) => {
    if (inTransaction) throw new Error('POOL_QUERY_UNDER_RESERVED_TRANSACTION');
    return execute(sql, values);
  });
});
const input = { phaseConfiguration: 'rrbo-continuous-nmp-dispersed', sourceSnapshotHash: 'source' };
describe('P1 candidate integration without scientific optimizer execution', () => {
  it('persists candidate intent, dispatches exact P1 in a worker, deduplicates, and restores complete results', async () => {
    const original = structuredClone(sourceBasis);
    const pending = await startP1Candidate(7, 100, input);
    expect(pending.status).toBe('running');
    expect(rows[0].payload.candidateKind).toBe('RRBO_P1_CANDIDATE_ONLY');
    expect(rows[0].payload.engine).toBeUndefined(); // Cannot match an authority query.
    expect(mocks.workers).toHaveLength(1);
    expect(client.release).toHaveBeenCalled();
    expect(client.query.mock.calls.map(([sql]) => sql)).toContain('COMMIT');
    expect(client.query.mock.calls.some(([sql]) => sql.endsWith('FOR SHARE'))).toBe(true);
    expect(mocks.query).not.toHaveBeenCalled();
    const worker = mocks.workers[0];
    expect(worker.code).toContain('optimizeStage3Stage4P1ForReview(workerData.basis, workerData.snapshotHash, workerData.controls)');
    expect(worker.options.workerData.basis.phaseConfiguration).toBe(input.phaseConfiguration);
    expect(worker.options.workerData.snapshotHash).toBe('source');
    expect(sourceBasis).toEqual(original);
    expect((await startP1Candidate(7, 100, input)).id).toBe(pending.id);
    expect(mocks.workers).toHaveLength(1);
    const calculation = { engine: { version: VERSION, implementationHash: HASH }, status: 'NO_SECOND_DIAMETER', orientationComparison: [{ geometryGrid: [{ trials: [{ hydraulicMethod: { scenarios: [1, 2, 3, 4, 5, 6] } }] }] }] };
    const result = { ...calculation, calculationHash: kuhniRunHash(calculation) };
    worker.emit('message', { result });
    await vi.waitFor(() => expect(rows).toHaveLength(2));
    const [loaded] = await getP1Candidates(7, 100, pending.id);
    expect(loaded.status).toBe('completed');
    expect(loaded.result).toEqual(result);
    expect(loaded.stale).toBe(false);
    expect((await startP1Candidate(7, 100, input)).id).toBe(pending.id);
    mocks.validate.mockReturnValue({ immutableHash: 'changed' });
    expect((await getP1Candidates(7, 100))[0].stale).toBe(true);
    expect((await getP1Candidates(7, 100, 'unowned-or-other-design-id'))).toEqual([]);
    expect(mocks.query.mock.calls.every(([sql]) => !/\bUPDATE\b|\bDELETE\b/.test(sql))).toBe(true);
  });
  it('rejects missing explicit phase, stale source, wrong temperature and foreign ownership before dispatch', async () => {
    await expect(startP1Candidate(7, 101, {})).rejects.toThrow('P1_EXPLICIT');
    await expect(startP1Candidate(7, 101, { ...input, sourceSnapshotHash: 'old' })).rejects.toThrow('P1_STAGE1_CHANGED');
    await expect(startP1Candidate(8, 101, input)).rejects.toThrow('DESIGN_NOT_FOUND');
    await expect(getP1Candidates(8, 101)).rejects.toThrow('DESIGN_NOT_FOUND');
    mocks.basis.mockReturnValue({ ...sourceBasis, operatingTemperatureC: 50 });
    await expect(startP1Candidate(7, 101, input)).rejects.toThrow('P1_REQUIRES_SAVED_40C');
    expect(mocks.workers).toHaveLength(0);
  });
  it('exposes the actual saved basis without phase mutation', async () => {
    expect(await getP1CandidateBasis(7, 102)).toMatchObject({ sourceSnapshotHash: 'source', basis: sourceBasis });
    const routes = readFileSync('server/ecr-pre-pilot/p1-candidate-routes.ts', 'utf8');
    expect(routes).toContain('app.post(p1Path, ensureAuthenticated');
    expect(routes).toContain('getP1Candidates(userId, designId, req.params.candidateId)');
  });
  it('uses nonblocking transaction lock contention and releases without a pool query or worker', async () => {
    client.query.mockImplementation(async sql => {
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: false }] };
      return { rows: [] };
    });
    await expect(startP1Candidate(7, 103, input)).rejects.toThrow('P1_CANDIDATE_ALREADY_RUNNING');
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(mocks.workers).toHaveLength(0);
  });
  it('rejects a Stage-1 change while waiting for the reserved connection/lock before intent is saved', async () => {
    let grant!: (value: any) => void;
    mocks.connect.mockReturnValueOnce(new Promise(resolve => { grant = resolve; }));
    const submission = startP1Candidate(7, 104, input);
    expect(mocks.validate).not.toHaveBeenCalled();
    mocks.validate.mockReturnValue({ immutableHash: 'saved-while-acquiring' });
    grant(client);
    await expect(submission).rejects.toThrow('P1_STAGE1_CHANGED_RELOAD_REQUIRED');
    expect(client.query.mock.calls.map(([sql]) => sql).at(-1)).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(rows).toHaveLength(0);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.workers).toHaveLength(0);
  });
  it('releases a broken connection even if rollback fails, preserving the original error', async () => {
    const rollbackError = new Error('rollback failed');
    client.query.mockImplementation(async sql => {
      if (sql === 'ROLLBACK') throw rollbackError;
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: false }] };
      return { rows: [] };
    });
    await expect(startP1Candidate(7, 105, input)).rejects.toThrow('P1_CANDIDATE_ALREADY_RUNNING');
    expect(client.release).toHaveBeenCalledExactlyOnceWith(rollbackError);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.workers).toHaveLength(0);
  });
  it('persists worker exit without a result as a terminal failure after client release', async () => {
    const pending = await startP1Candidate(7, 106, input);
    expect(client.release).toHaveBeenCalled();
    mocks.workers[0].emit('exit', 0);
    await vi.waitFor(() => expect(rows).toHaveLength(2));
    const [failed] = await getP1Candidates(7, 106, pending.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('P1_WORKER_EXIT_WITHOUT_RESULT_0');
  });
  it('rejects a simultaneous contender without consuming pool queries or waiting for the first submission', async () => {
    let grantLock!: () => void;
    const execute = client.query.getMockImplementation()!;
    client.query.mockImplementation(async (sql, values) => {
      if (sql.includes('pg_try_advisory_xact_lock')) {
        await new Promise<void>(resolve => { grantLock = resolve; });
        return { rows: [{ acquired: true }] };
      }
      return execute(sql, values);
    });
    const contender = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('pg_try_advisory_xact_lock') ? [{ acquired: false }] : [] })), release: vi.fn() };
    mocks.connect.mockResolvedValueOnce(client).mockResolvedValueOnce(contender);
    const first = startP1Candidate(7, 107, input);
    await vi.waitFor(() => expect(grantLock).toBeTypeOf('function'));
    await expect(startP1Candidate(7, 107, input)).rejects.toThrow('P1_CANDIDATE_ALREADY_RUNNING');
    expect(contender.release).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(client.release).not.toHaveBeenCalled();
    // A Stage-1 save during acquisition must be read after the lock resolves.
    mocks.validate.mockReturnValue({ immutableHash: 'concurrent-save' });
    grantLock();
    await expect(first).rejects.toThrow('P1_STAGE1_CHANGED_RELOAD_REQUIRED');
    expect(client.release).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
    expect(mocks.workers).toHaveLength(0);
  });
});