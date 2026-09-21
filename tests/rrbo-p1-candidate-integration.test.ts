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
import { startP1Candidate, startStage3Candidate, getP1Candidates, getP1CandidateBasis, getP1CandidateHistory, getP1CandidateSummary } from '../server/ecr-pre-pilot/p1-candidate-service';
import { kuhniRunHash } from '../server/ecr-pre-pilot/kuhni-hydrodynamics';
import { ECR_STAGE3_STAGE4_OPTIMIZER_VERSION as NMP_VERSION, ECR_STAGE3_STAGE4_OPTIMIZER_HASH as NMP_HASH, ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_VERSION as VERSION, ECR_STAGE3_STAGE4_OPTIMIZER_P1_REVIEW_HASH as HASH } from '../server/ecr-pre-pilot/stage3-stage4-optimizer';

let rows: any[] = [];
let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
let inTransaction = false;
const sourceBasis = { phaseConfiguration: 'rrbo-continuous-nmp-dispersed', operatingTemperatureC: 40, stage1SnapshotHash: 'source' };
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
      rows.push({ basis: values[3], payload: values[5], implementationHash: values[6], hash: values[7], createdAt: new Date(rows.length * 1000).toISOString() });
      return { rows: [] };
    }
    if (sql.includes('SELECT DISTINCT')) {
      const map = new Map();
      for (const row of rows) if (!values[3] || row.payload.metadata.id === values[3]) map.set(row.payload.metadata.id, row);
      if (sql.includes("result_snapshot->'metadata' AS metadata")) return { rows: [...map.values()].map(row => ({
        metadata: row.payload.metadata, resultStatus: row.payload.result?.status, createdAt: row.createdAt,
      })) };
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
const input = { sourceSnapshotHash: 'source' };
describe('P1 candidate integration without scientific optimizer execution', () => {
  it('polls metadata without transferring/hashing results; verified summary and full Stage4 detail still reject corruption', async () => {
    const calculation = { engine: { version: VERSION, implementationHash: HASH }, status: 'NO_SECOND_DIAMETER',
      processBasis: sourceBasis, stage1Authority: { snapshotHash: 'source' }, orientationComparison: [] };
    const result = { ...calculation, calculationHash: kuhniRunHash(calculation) };
    const payload = { candidateKind: 'RRBO_P1_CANDIDATE_ONLY', metadata: {
      id: 'saved', sourceSnapshotHash: 'source', status: 'completed', phaseConfiguration: sourceBasis.phaseConfiguration,
      version: VERSION, implementationHash: HASH,
    }, result };
    rows.push({ basis: sourceBasis, payload, hash: kuhniRunHash({ basis: sourceBasis, payload }), implementationHash: HASH });
    const history = await getP1CandidateHistory(7, 269);
    expect(history[0].verification).toBe('METADATA_ONLY');
    expect(history[0]).not.toHaveProperty('result');
    expect(history[0]).not.toHaveProperty('automaticSelection');
    expect(history[0]).not.toHaveProperty('basis');
    const sql = mocks.query.mock.calls.find(([sql]) => sql.includes('SELECT DISTINCT'))![0];
    expect(sql).not.toContain('result_snapshot AS payload');
    expect(mocks.query.mock.calls.at(-1)![1]).toEqual([269, 7, ['RRBO_P1_CANDIDATE_ONLY', 'NMP_STAGE3_CANDIDATE_ONLY']]);
    const summary = await getP1CandidateSummary(7, 269, 'saved');
    expect(summary?.summaryOnly).toBe(true);
    expect(summary?.automaticSelection).toBeTruthy();
    expect(summary?.result).not.toHaveProperty('orientationComparison');
    expect((await getP1Candidates(7, 269, 'saved'))[0].result).toEqual(result);
    mocks.validate.mockReturnValue({ immutableHash: 'new-save' });
    expect((await getP1CandidateSummary(7, 269, 'saved'))?.automaticSelection).toBeNull();
    await expect(getP1CandidateSummary(8, 269, 'saved')).rejects.toThrow('NOT_FOUND');
    payload.result.status = 'corrupted';
    await expect(getP1CandidateSummary(7, 269, 'saved')).rejects.toThrow('INTEGRITY_FAILURE');
    await expect(getP1Candidates(7, 269, 'saved')).rejects.toThrow('INTEGRITY_FAILURE');
    expect(mocks.workers).toHaveLength(0);
    expect(mocks.query.mock.calls.every(([sql]) => !/\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(sql))).toBe(true);
  });
  it.each([
    ['rrbo-continuous-nmp-dispersed', 'optimizeStage3Stage4P1ForReview', VERSION, HASH, 'RRBO_P1_CANDIDATE_ONLY'],
    ['nmp-continuous-rrbo-dispersed', 'optimizeStage3Stage4', NMP_VERSION, NMP_HASH, 'NMP_STAGE3_CANDIDATE_ONLY'],
  ])('dispatches saved %s with frozen identity and candidate-only persistence', async (phase, entryPoint, version, implementationHash, kind) => {
    mocks.basis.mockReturnValue({ ...sourceBasis, phaseConfiguration: phase });
    const pending = await startStage3Candidate(7, 201, input);
    expect(mocks.workers[0].options.workerData.entryPoint).toBe(entryPoint);
    expect(pending.version).toBe(version);
    expect(rows[0].payload.candidateKind).toBe(kind);
    expect(rows[0].payload.engine).toBeUndefined();
    const calculation = { engine: { version, implementationHash }, status: 'NO_SECOND_DIAMETER',
      processBasis: sourceBasis, stage1Authority: { snapshotHash: 'source' } };
    mocks.workers[0].emit('message', { result: { ...calculation, calculationHash: kuhniRunHash(calculation) } });
    await vi.waitFor(() => expect(rows).toHaveLength(2));
    expect((await getP1Candidates(7, 201))[0].status).toBe('completed');
    const terminalRow = rows[rows.length - 1];
    const intactEnvelopeHash = terminalRow.hash;
    terminalRow.implementationHash = 'corrupt-ledger-column-only';
    expect(kuhniRunHash({ basis: terminalRow.basis, payload: terminalRow.payload })).toBe(intactEnvelopeHash);
    await expect(getP1Candidates(7, 201)).rejects.toThrow('P1_CANDIDATE_LEDGER_IMPLEMENTATION_HASH_FAILURE');
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('implementation_hash AS "implementationHash"'))).toBe(true);
    expect([...client.query.mock.calls, ...mocks.query.mock.calls].every(([sql]) => !/\bUPDATE\b|\bDELETE\b/.test(sql))).toBe(true);
  });
  it('rejects ambiguous saved phase and method overrides without calculation', async () => {
    await expect(startStage3Candidate(7, 202, { ...input, method: 'P1' })).rejects.toThrow('OVERRIDE_NOT_ALLOWED');
    await expect(startStage3Candidate(7, 202, { sourceSnapshotHash: 'old' })).rejects.toThrow('STAGE1_CHANGED');
    mocks.basis.mockReturnValue({ ...sourceBasis, phaseConfiguration: 'auto' });
    await expect(startStage3Candidate(7, 202, input)).rejects.toThrow('EXPLICIT_SAVED_PHASE');
    await expect(getP1CandidateBasis(7, 202)).rejects.toThrow('EXPLICIT_SAVED_PHASE');
    expect(mocks.workers).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });
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
    expect(worker.options.workerData.entryPoint).toBe('optimizeStage3Stage4P1ForReview');
    expect(worker.code).toContain('calculate(workerData.basis, workerData.snapshotHash, workerData.controls)');
    expect(worker.options.workerData.basis.phaseConfiguration).toBe(sourceBasis.phaseConfiguration);
    expect(worker.options.workerData.snapshotHash).toBe('source');
    expect(sourceBasis).toEqual(original);
    expect((await startP1Candidate(7, 100, input)).id).toBe(pending.id);
    expect(mocks.workers).toHaveLength(1);
    const calculation = { engine: { version: VERSION, implementationHash: HASH }, status: 'NO_SECOND_DIAMETER',
      processBasis: sourceBasis, stage1Authority: { snapshotHash: 'source' },
      orientationComparison: [{ geometryGrid: [{ trials: [{ hydraulicMethod: { scenarios: [1, 2, 3, 4, 5, 6] } }] }] }] };
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
  it('rejects overrides, incompatible saved phase, stale source, wrong temperature and foreign ownership before dispatch', async () => {
    await expect(startP1Candidate(7, 101, { ...input, phaseConfiguration: sourceBasis.phaseConfiguration })).rejects.toThrow('P1_PHASE_OVERRIDE_NOT_ALLOWED');
    mocks.basis.mockReturnValue({ ...sourceBasis, phaseConfiguration: 'nmp-continuous-rrbo-dispersed' });
    await expect(startP1Candidate(7, 101, input)).rejects.toThrow('Change phase');
    mocks.basis.mockReturnValue(sourceBasis);
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