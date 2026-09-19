import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as any[],
  statements: [] as string[],
  failHistory: false,
}));

vi.mock('../server/db', () => {
  const query = vi.fn(async (sql: string) => {
    state.statements.push(sql);
    if (sql.includes('UPDATE ecr_pre_pilot_job_c_jobs')) {
      const changed = state.rows.filter(row =>
        row.status === 'pending' || row.status === 'running');
      for (const row of changed) {
        row.cancel_requested_at ??= new Date('2026-09-19T00:00:00Z');
        row.status = 'cancelled';
        row.completed_at ??= new Date('2026-09-19T00:00:00Z');
        row.lease_expires_at = null;
        row.claim_token = null;
        row.worker_owner = null;
        row.error ??= 'ECR_PRE_PILOT_JOB_C_RETIRED';
      }
      return { rows: changed };
    }
    if (sql.includes('ecr_pre_pilot_job_c_job_history') && state.failHistory) {
      throw new Error('history unavailable');
    }
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  return {
    pool: {
      connect: vi.fn(async () => client),
      query,
    },
  };
});

vi.mock('../server/ecr-pre-pilot-service', () => ({
  executePreparedEcrPrePilotJobC: vi.fn(),
  prepareEcrPrePilotJobC: vi.fn(),
}));
vi.mock('../server/ecr-pre-pilot/stage1', () => ({
  validateStage1Snapshot: vi.fn(),
}));

import { retireActiveJobCJobs } from '../server/ecr-pre-pilot/job-c-job-service';

const row = (id: string, status: string) => ({
  id,
  status,
  input_snapshot: { retained: id },
  input_hash: 'a'.repeat(64),
  implementation_hash: 'b'.repeat(64),
  candidate_hash: 'c'.repeat(64),
  job_b_engine_hash: 'd'.repeat(64),
  progress_phase: 'expensive solve',
  progress_completed: 3,
  progress_total: 9,
  worker_owner: status === 'running' ? 'old-worker' : null,
  claim_token: status === 'running' ? 'old-claim' : null,
  lease_expires_at: status === 'running' ? new Date('2026-09-19T01:00:00Z') : null,
  attempt_count: 1,
  result_snapshot: { retainedResult: id },
  result_hash: 'e'.repeat(64),
  error: null,
  progress_snapshot: { retainedProgress: id },
  partial_result_snapshot: { retainedCheckpoint: id },
  partial_result_hash: 'f'.repeat(64),
  cancel_requested_at: null,
  completed_at: status === 'completed' ? new Date('2026-09-18T00:00:00Z') : null,
});

describe('retired Job C queue sweep', () => {
  beforeEach(() => {
    state.rows = [
      row('pending', 'pending'),
      row('running', 'running'),
      row('completed', 'completed'),
    ];
    state.statements = [];
    state.failHistory = false;
  });

  it('terminalizes pending and running rows while preserving diagnostics', async () => {
    const before = state.rows.map(item => ({
      result: item.result_snapshot,
      partial: item.partial_result_snapshot,
      progress: item.progress_snapshot,
      progressPhase: item.progress_phase,
    }));

    await expect(retireActiveJobCJobs()).resolves.toBe(2);

    for (const item of state.rows.slice(0, 2)) {
      expect(item).toMatchObject({
        status: 'cancelled',
        error: 'ECR_PRE_PILOT_JOB_C_RETIRED',
        lease_expires_at: null,
        claim_token: null,
        worker_owner: null,
      });
      expect(item.completed_at).toBeInstanceOf(Date);
    }
    state.rows.forEach((item, index) => {
      expect(item.result_snapshot).toBe(before[index].result);
      expect(item.partial_result_snapshot).toBe(before[index].partial);
      expect(item.progress_snapshot).toBe(before[index].progress);
      expect(item.progress_phase).toBe(before[index].progressPhase);
    });
    expect(state.rows[2].status).toBe('completed');
    expect(state.statements.at(-1)).toBe('COMMIT');
  });

  it('is idempotent and leaves completed history untouched', async () => {
    const completed = JSON.stringify(state.rows[2]);
    await expect(retireActiveJobCJobs()).resolves.toBe(2);
    state.statements = [];
    await expect(retireActiveJobCJobs()).resolves.toBe(0);
    expect(JSON.stringify(state.rows[2])).toBe(completed);
    expect(state.statements.some(sql =>
      sql.includes('ecr_pre_pilot_job_c_job_history'))).toBe(false);
  });

  it('rolls back when retirement history cannot be committed', async () => {
    state.failHistory = true;
    await expect(retireActiveJobCJobs()).rejects.toThrow('history unavailable');
    expect(state.statements).toContain('ROLLBACK');
    expect(state.statements).not.toContain('COMMIT');
  });
});