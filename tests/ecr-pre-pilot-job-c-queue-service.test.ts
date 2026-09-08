import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  prepared: {} as any,
  prepareError: null as any,
  reusableRow: null as any,
  activeRow: null as any,
  insertedRow: null as any,
  claimedRow: null as any,
  terminalRow: null as any,
  queries: [] as Array<{ sql: string; values: unknown[] }>,
}));

vi.mock('../server/db', () => {
  const query = async (sql: string, values: unknown[] = []) => {
    state.queries.push({ sql, values });
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK'
      || sql.includes('pg_advisory_xact_lock')
      || sql.includes('ecr_pre_pilot_job_c_job_history')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT id FROM ecr_pre_pilot_designs')) {
      return { rows: [{ id: values[0] }] };
    }
    if (sql.includes("status='blocked' AND completed_at IS NOT NULL")) {
      const row = state.reusableRow;
      const matches = row
        && row.created_by === values[0]
        && row.design_id === values[1]
        && row.input_hash === values[2]
        && row.implementation_hash === values[3]
        && row.candidate_hash === values[4]
        && row.job_b_engine_hash === values[5]
        && row.input_snapshot.prepared.responseBasis.dependencies
          .jobCBoundaryInterfaceQualifierSha256 === values[6]
        && row.input_snapshot.prepared.responseBasis.dependencies
          .boundaryBranchSourceStateSha256 === values[7];
      return { rows: matches ? [row] : [] };
    }
    if (sql.includes("status IN ('pending','running')")) {
      return { rows: state.activeRow ? [state.activeRow] : [] };
    }
    if (sql.includes('INSERT INTO ecr_pre_pilot_job_c_jobs')) {
      return { rows: [state.insertedRow] };
    }
    if (sql.includes('WITH candidate AS (')) {
      const row = state.claimedRow;
      state.claimedRow = null;
      return { rows: row ? [row] : [] };
    }
    if (sql.includes('SELECT d.input_data,')) {
      return {
        rows: [{
          input_data: {},
          stage3_hash: state.insertedRow.input_snapshot.prepared.responseBasis
            .dependencies.stage3ImmutableHash,
        }],
      };
    }
    if (sql.includes('UPDATE ecr_pre_pilot_job_c_jobs SET')
      && sql.includes("progress_phase='terminal'")) {
      state.terminalRow = {
        ...state.insertedRow,
        status: values[2],
        error: values[3],
        result_snapshot: values[4],
        result_hash: values[5],
        progress_phase: 'terminal',
        completed_at: new Date('2026-01-01T00:00:03Z'),
      };
      return { rows: [state.terminalRow] };
    }
    // The immediate queue poll after a new insert finds no work in this unit
    // test; worker execution itself is outside the queue reuse contract.
    return { rows: [] };
  };
  const client = { query: vi.fn(query), release: vi.fn() };
  return {
    pool: {
      connect: vi.fn(async () => client),
      query: vi.fn(query),
    },
  };
});

vi.mock('../server/ecr-pre-pilot-service', () => ({
  prepareEcrPrePilotJobC: vi.fn(async () => {
    if (state.prepareError) throw state.prepareError;
    return state.prepared;
  }),
  executePreparedEcrPrePilotJobC: vi.fn(),
}));

vi.mock('../server/ecr-pre-pilot/stage1', () => ({
  validateStage1Snapshot: vi.fn(() => ({
    immutableHash: state.prepared.responseBasis.dependencies.stage1SnapshotHash,
  })),
}));

vi.mock('../server/ecr-pre-pilot/job-c', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/ecr-pre-pilot/job-c')>();
  return {
    ...actual,
    currentJobCArtifactHashes: () => ({
      implementationHash: '1'.repeat(64),
      candidateHash: '2'.repeat(64),
      boundaryQualifierHash: '3'.repeat(64),
      branchContinuationHash: 'a'.repeat(64),
    }),
  };
});

import { enqueueJobC } from '../server/ecr-pre-pilot/job-c-job-service';
import { JobCError, jobCResultHash } from '../server/ecr-pre-pilot/job-c';
import {
  executePreparedEcrPrePilotJobC,
  prepareEcrPrePilotJobC,
} from '../server/ecr-pre-pilot-service';

const makePrepared = (sourceStateHash = '4'.repeat(64)) => ({
  workerRequest: { inlet: 'unchanged' },
  responseBasis: {
    dependencies: {
      stage1SnapshotHash: '5'.repeat(64),
      stage3ImmutableHash: '6'.repeat(64),
      jobAResultSha256: '7'.repeat(64),
      jobBResultSha256: '8'.repeat(64),
      jobBInterfaceWorkerSha256: '9'.repeat(64),
      jobCBoundaryInterfaceQualifierSha256: '3'.repeat(64),
      jobCBranchContinuationSha256: 'a'.repeat(64),
      boundaryBranchSourceStateSha256: sourceStateHash,
    },
  },
});

const makeRow = (prepared: ReturnType<typeof makePrepared>, status = 'blocked') => {
  const input_snapshot = {
    schemaVersion: 'ECR_PRE_PILOT_JOB_C_QUEUE_SNAPSHOT_V1',
    prepared,
  };
  return {
    id: '10000000-0000-4000-8000-000000000001',
    design_id: 22,
    created_by: 11,
    status,
    progress_phase: 'terminal',
    progress_completed: 1,
    progress_total: 1,
    input_snapshot,
    input_hash: jobCResultHash(input_snapshot),
    implementation_hash: '1'.repeat(64),
    candidate_hash: '2'.repeat(64),
    job_b_engine_hash: '9'.repeat(64),
    result_snapshot: { status: 'BLOCKED_PRELIMINARY_JOB_C', evidence: 'terminal' },
    result_hash: jobCResultHash({
      status: 'BLOCKED_PRELIMINARY_JOB_C',
      evidence: 'terminal',
    }),
    error: 'BLOCKED_PRELIMINARY_JOB_C',
    attempt_count: 1,
    cancel_requested_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    started_at: new Date('2026-01-01T00:00:01Z'),
    completed_at: new Date('2026-01-01T00:00:02Z'),
  };
};

describe('Job C queue blocked-result reuse', () => {
  beforeEach(() => {
    state.queries.length = 0;
    state.prepared = makePrepared();
    state.prepareError = null;
    state.reusableRow = makeRow(state.prepared);
    state.activeRow = null;
    state.insertedRow = makeRow(state.prepared, 'pending');
    state.claimedRow = null;
    state.terminalRow = null;
    vi.mocked(prepareEcrPrePilotJobC).mockClear();
    vi.mocked(executePreparedEcrPrePilotJobC).mockClear();
  });

  it('returns the unchanged latest terminal blocked row without inserting', async () => {
    const result = await enqueueJobC(11, 22);

    expect(result.id).toBe(state.reusableRow.id);
    expect(result.status).toBe('blocked');
    expect(result.reuse).toMatchObject({
      reused: true,
      reason: 'UNCHANGED_TERMINAL_BLOCKED_JOB_C',
      evidence: {
        inputHash: state.reusableRow.input_hash,
        implementationHash: '1'.repeat(64),
        candidateHash: '2'.repeat(64),
        jobBInterfaceWorkerHash: '9'.repeat(64),
        boundaryQualifierHash: '3'.repeat(64),
        boundarySourceStateHash: '4'.repeat(64),
        branchContinuationHash: 'a'.repeat(64),
      },
    });
    expect(state.queries.some(({ sql }) =>
      sql.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(state.queries.some(({ sql }) =>
      sql.includes('INSERT INTO ecr_pre_pilot_job_c_jobs'))).toBe(false);
    expect(state.queries.some(({ sql, values }) =>
      sql.includes('ecr_pre_pilot_job_c_job_history')
      && (values[16] as any)?.event === 'enqueue_reused')).toBe(true);
  });

  it('persists a sparse axial-profile block without creating a worker request', async () => {
    state.reusableRow = null;
    state.claimedRow = {
      ...state.insertedRow,
      status: 'running',
      previous_status: 'pending',
      claim_token: 'claim-sparse-profile',
      worker_owner: 'test-owner',
      attempt_count: 1,
    };
    const sparseBlock = new JobCError(
      'JOB_C_DEPENDENCY_BLOCKED:AXIAL_LOCAL_CONTACT_PROFILE_UNAVAILABLE',
      {
        requiredRecordedContacts: 7,
        recordedContacts: 6,
        expectedStageFromFeedEndPositions: [1, 2, 3, 4, 5, 6, 7],
        recordedStageFromFeedEndPositions: [1, 2, 3, 4, 5, 6],
        duplicateStageFromFeedEndPositions: [],
        missingStageFromFeedEndPositions: [7],
        unexpectedStageFromFeedEndPositions: [],
        invalidStageFromFeedEndContactIndexes: [],
        repeatedOrInventedContactsPermitted: false,
        heightClaimed: false,
      },
    );
    vi.mocked(prepareEcrPrePilotJobC)
      .mockResolvedValueOnce(state.prepared)
      .mockRejectedValueOnce(sparseBlock);

    const response = await enqueueJobC(11, 22);

    expect(response).toMatchObject({
      id: state.insertedRow.id,
      designId: 22,
      createdBy: 11,
      status: 'pending',
      progress: { phase: 'terminal', completed: 1, total: 1 },
      reuse: {
        reused: false,
        reason: 'NEW_JOB_ENQUEUED',
      },
    });
    await vi.waitFor(() => expect(state.terminalRow).not.toBeNull());
    expect(state.terminalRow).toMatchObject({
      status: 'blocked',
      error: 'JOB_C_DEPENDENCY_BLOCKED:STALE_OR_INVALID_LINEAGE',
      result_snapshot: {
        diagnostics: {
          reason: 'CURRENT_PINNED_DEPENDENCY_REVALIDATION_FAILED',
          cause: 'JOB_C_DEPENDENCY_BLOCKED:AXIAL_LOCAL_CONTACT_PROFILE_UNAVAILABLE',
          causeDetails: {
            requiredRecordedContacts: 7,
            recordedContacts: 6,
            expectedStageFromFeedEndPositions: [1, 2, 3, 4, 5, 6, 7],
            recordedStageFromFeedEndPositions: [1, 2, 3, 4, 5, 6],
            duplicateStageFromFeedEndPositions: [],
            missingStageFromFeedEndPositions: [7],
            unexpectedStageFromFeedEndPositions: [],
            invalidStageFromFeedEndContactIndexes: [],
            repeatedOrInventedContactsPermitted: false,
            heightClaimed: false,
          },
        },
      },
    });
    expect(executePreparedEcrPrePilotJobC).not.toHaveBeenCalled();
    expect(state.queries.some(({ sql, values }) =>
      sql.includes('ecr_pre_pilot_job_c_job_history')
      && (values[16] as any)?.event === 'blocked'
      && (values[16] as any)?.diagnostics?.cause
        === 'JOB_C_DEPENDENCY_BLOCKED:AXIAL_LOCAL_CONTACT_PROFILE_UNAVAILABLE'))
      .toBe(true);
  });

  it('does not reuse when frozen boundary/dependency input changes', async () => {
    state.prepared = makePrepared('a'.repeat(64));
    state.insertedRow = makeRow(state.prepared, 'pending');

    const result = await enqueueJobC(11, 22);

    expect(result.id).toBe(state.insertedRow.id);
    expect(result.reuse).toMatchObject({
      reused: false,
      reason: 'NEW_JOB_ENQUEUED',
    });
    expect(state.queries.some(({ sql }) =>
      sql.includes('INSERT INTO ecr_pre_pilot_job_c_jobs'))).toBe(true);
  });

  it.each([
    {
      label: 'null',
      resultSnapshot: null,
      resultHash: null,
    },
    {
      label: 'malformed',
      resultSnapshot: { status: 'BLOCKED_PRELIMINARY_JOB_C' },
      resultHash: 'not-a-valid-result-hash',
    },
  ])('does not reuse a $label blocked result', async ({
    resultSnapshot,
    resultHash,
  }) => {
    state.reusableRow.result_snapshot = resultSnapshot;
    state.reusableRow.result_hash = resultHash;

    const result = await enqueueJobC(11, 22);

    expect(result.reuse).toMatchObject({
      reused: false,
      reason: 'NEW_JOB_ENQUEUED',
    });
    expect(state.queries.some(({ sql }) =>
      sql.includes('INSERT INTO ecr_pre_pilot_job_c_jobs'))).toBe(true);
  });

  it('rejects rather than reuses or duplicates an identical active job', async () => {
    state.reusableRow = null;
    state.activeRow = makeRow(state.prepared, 'running');

    await expect(enqueueJobC(11, 22)).rejects.toMatchObject({
      message: 'JOB_C_DEPENDENCY_BLOCKED:IDENTICAL_JOB_ALREADY_ACTIVE',
      details: {
        activeJobId: state.activeRow.id,
        activeJobStatus: 'running',
      },
    });
    expect(state.queries.some(({ sql }) =>
      sql.includes('INSERT INTO ecr_pre_pilot_job_c_jobs'))).toBe(false);
  });
});