import { beforeEach, describe, expect, it, vi } from 'vitest';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const state = vi.hoisted(() => ({
  parent: null as any,
  acceptedParents: [] as any[],
  stage1: { immutableHash: 'a'.repeat(64) } as any,
  latest: null as any,
  sizingResult: null as any,
  onSizingSolve: null as null | (() => void),
  queries: [] as Array<{ sql: string; values: unknown[] }>,
}));

vi.mock('../server/db', () => ({
  pool: {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      state.queries.push({ sql, values });
      if (sql.includes('FROM ecr_pre_pilot_job_c_jobs')) {
        if (values.length === 2) {
          return { rows: state.acceptedParents };
        }
        const parent = state.parent;
        return {
          rows: parent && parent.id === values[0]
            && parent.design_id === values[1] && parent.created_by === values[2]
            ? [parent] : [],
        };
      }
      if (sql.includes('FROM ecr_pre_pilot_designs')) {
        return { rows: [{ input_data: { immutable: 'stage-1' } }] };
      }
      if (sql.includes('INSERT INTO ecr_pre_pilot_job_c_physical_sizing_results')) {
        state.latest = {
          id: 7,
          parent_job_id: values[0],
          design_id: values[1],
          created_by: values[2],
          parent_result_hash: values[3],
          stage1_snapshot_hash: values[4],
          process_basis: values[5],
          input_snapshot: values[6],
          result_snapshot: values[7],
          result_hash: values[8],
          immutable_hash: values[9],
          created_at: new Date('2026-01-01T00:00:00Z'),
        };
        return { rows: [{ id: 7, created_at: state.latest.created_at }] };
      }
      if (sql.includes('FROM ecr_pre_pilot_job_c_physical_sizing_results')) {
        return { rows: state.latest ? [state.latest] : [] };
      }
      return { rows: [] };
    }),
  },
}));

vi.mock('../server/ecr-pre-pilot/stage1', async (importOriginal) => ({
  ...await importOriginal<typeof import('../server/ecr-pre-pilot/stage1')>(),
  validateStage1Snapshot: vi.fn((input: any) => input?.immutableHash ? input : state.stage1),
  makeStage1HydrodynamicProcessBasis: vi.fn(),
}));

vi.mock('../server/ecr-pre-pilot/job-c-physical-sizing', () => ({
  sizeAcceptedJobCWithWorkerTransport: vi.fn(async () => {
    state.onSizingSolve?.();
    return state.sizingResult ?? {
      status: 'DEPENDENCY_BLOCKED',
      reason: 'JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:SUPPORTED_MECHANICAL_SPACING_BASIS_REQUIRED',
    };
  }),
  summarizeJobCPhysicalSizingDependency: vi.fn(),
  assessAcceptedJobCForPhysicalSizing: vi.fn(() => ({ accepted: true })),
}));

import {
  evaluateCompletedJobCPhysicalSizing,
  getLatestCompletedJobCPhysicalSizing,
} from '../server/ecr-pre-pilot-service';
import { jobCResultHash, jobCScientificResultHash } from '../server/ecr-pre-pilot/job-c';

function parent() {
  const result = {
    status: 'CALCULATED_PRELIMINARY_JOB_C',
    workerResult: { status: 'CALCULATED_PRELIMINARY_JOB_C' },
    dependencies: { stage1SnapshotHash: hashA },
  };
  return {
    id: '10000000-0000-4000-8000-000000000001',
    design_id: 22,
    created_by: 11,
    status: 'completed',
    input_snapshot: { prepared: { workerRequest: { inlet: 'frozen' } } },
    result_snapshot: result,
    result_hash: jobCScientificResultHash(result),
  };
}

describe('persisted Job-C physical sizing child result', () => {
  beforeEach(() => {
    state.parent = parent();
    state.stage1 = { immutableHash: hashA };
    state.acceptedParents = [state.parent];
    state.latest = null;
    state.sizingResult = null;
    state.onSizingSolve = null;
    state.queries.length = 0;
  });

  it('persists a separate immutable child and reloads it instead of the parent summary', async () => {
    const result = await evaluateCompletedJobCPhysicalSizing(11, 22, {
      id: state.parent.id,
    });

    expect(result).toMatchObject({
      id: 7,
      parentJobId: state.parent.id,
      stage1SnapshotHash: hashA,
      status: 'DEPENDENCY_BLOCKED',
    });
    expect(state.parent.result_snapshot.physicalSizing).toBeUndefined();
    expect(state.latest.process_basis).toMatchObject({
      status: 'DEPENDENCY_BLOCKED',
      reason: 'JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:SUPPORTED_MECHANICAL_SPACING_BASIS_REQUIRED',
    });

    const reloaded = await getLatestCompletedJobCPhysicalSizing(11, 22);
    expect(reloaded).toEqual(result);
  });

  it('rejects a caller-selected parent outside the authenticated design ownership scope', async () => {
    await expect(evaluateCompletedJobCPhysicalSizing(99, 22, {
      id: state.parent.id,
    })).rejects.toThrow('SERVICE_OWNED_COMPLETED_JOB_C_QUEUE_LINEAGE_REQUIRED');
    expect(state.latest).toBeNull();
  });

  it('persists an explicit block rather than sizing from a changed Stage-1 snapshot', async () => {
    state.stage1 = { immutableHash: hashB };

    const result = await evaluateCompletedJobCPhysicalSizing(11, 22, {
      id: state.parent.id,
    });

    expect(result).toMatchObject({
      status: 'DEPENDENCY_BLOCKED',
      reasons: ['JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:STAGE1_SNAPSHOT_LINEAGE_MISMATCH'],
      sourceStage1SnapshotHash: hashA,
      actualStage1SnapshotHash: hashB,
    });
    expect(state.latest.input_snapshot.processBasis).toMatchObject({
      status: 'DEPENDENCY_BLOCKED',
      reason: 'JOB_C_PHYSICAL_SIZING_DEPENDENCY_BLOCKED:STAGE1_SNAPSHOT_LINEAGE_MISMATCH',
    });
  });

  it('fails closed on a persisted child result hash mismatch', async () => {
    await evaluateCompletedJobCPhysicalSizing(11, 22, { id: state.parent.id });
    state.latest.result_hash = hashB;

    await expect(getLatestCompletedJobCPhysicalSizing(11, 22)).rejects.toThrow(
      'JOB_C_PHYSICAL_SIZING_RESULT_INTEGRITY_FAILURE',
    );
  });

  it('returns an explicit stale block without calculated geometry after Stage-1 changes', async () => {
    await evaluateCompletedJobCPhysicalSizing(11, 22, { id: state.parent.id });
    const calculated = {
      status: 'CALCULATED',
      finalGeometry: { columnDiameterM: 1.25, installedActiveHeightM: 8.4 },
      physicalCompartments: 21,
    };
    state.latest.result_snapshot = calculated;
    state.latest.result_hash = jobCResultHash(calculated);
    state.latest.immutable_hash = jobCResultHash({
      inputSnapshot: state.latest.input_snapshot,
      result: calculated,
    });
    state.stage1 = { immutableHash: hashB };

    const reloaded = await getLatestCompletedJobCPhysicalSizing(11, 22);

    expect(reloaded).toMatchObject({
      status: 'DEPENDENCY_BLOCKED',
      staleStatus: 'STALE',
      reasons: ['JOB_C_PHYSICAL_SIZING_RESULT_STALE:CURRENT_STAGE1_SNAPSHOT_CHANGED'],
      sourceStage1SnapshotHash: hashA,
      actualStage1SnapshotHash: hashB,
    });
    expect(reloaded).not.toHaveProperty('finalGeometry');
    expect(reloaded).not.toHaveProperty('physicalCompartments');
  });

  it('returns an explicit stale block without geometry when its accepted parent is superseded', async () => {
    await evaluateCompletedJobCPhysicalSizing(11, 22, { id: state.parent.id });
    const calculated = {
      status: 'CALCULATED',
      finalGeometry: { columnDiameterM: 1.25, installedActiveHeightM: 8.4 },
    };
    state.latest.result_snapshot = calculated;
    state.latest.result_hash = jobCResultHash(calculated);
    state.latest.immutable_hash = jobCResultHash({
      inputSnapshot: state.latest.input_snapshot,
      result: calculated,
    });
    state.acceptedParents = [{
      ...state.parent,
      id: '20000000-0000-4000-8000-000000000002',
    }];

    const reloaded = await getLatestCompletedJobCPhysicalSizing(11, 22);

    expect(reloaded).toMatchObject({
      status: 'DEPENDENCY_BLOCKED',
      staleStatus: 'STALE',
      reasons: ['JOB_C_PHYSICAL_SIZING_RESULT_STALE:ACCEPTED_PARENT_SUPERSEDED'],
      currentAcceptedParentJobId: '20000000-0000-4000-8000-000000000002',
    });
    expect(reloaded).not.toHaveProperty('finalGeometry');
  });

  it('does not persist or return solver geometry when Stage-1 changes during the solve', async () => {
    state.sizingResult = {
      status: 'CALCULATED',
      finalGeometry: { columnDiameterM: 1.25, installedActiveHeightM: 8.4 },
      physicalCompartments: 21,
    };
    state.onSizingSolve = () => {
      state.stage1 = { immutableHash: hashB };
    };

    const result = await evaluateCompletedJobCPhysicalSizing(11, 22, { id: state.parent.id });

    expect(result).toMatchObject({
      status: 'DEPENDENCY_BLOCKED',
      staleStatus: 'STALE',
      reasons: ['JOB_C_PHYSICAL_SIZING_RESULT_STALE:CURRENT_STAGE1_SNAPSHOT_CHANGED_DURING_EVALUATION'],
      sourceStage1SnapshotHash: hashA,
      actualStage1SnapshotHash: hashB,
    });
    expect(result).not.toHaveProperty('finalGeometry');
    expect(result).not.toHaveProperty('physicalCompartments');
    expect(state.latest).toBeNull();
  });

  it('does not persist or return solver geometry when a newer accepted parent arrives during the solve', async () => {
    state.sizingResult = {
      status: 'CALCULATED',
      finalGeometry: { columnDiameterM: 1.25, installedActiveHeightM: 8.4 },
    };
    state.onSizingSolve = () => {
      state.acceptedParents = [{
        ...state.parent,
        id: '30000000-0000-4000-8000-000000000003',
      }];
    };

    const result = await evaluateCompletedJobCPhysicalSizing(11, 22, { id: state.parent.id });

    expect(result).toMatchObject({
      status: 'DEPENDENCY_BLOCKED',
      staleStatus: 'STALE',
      reasons: ['JOB_C_PHYSICAL_SIZING_RESULT_STALE:ACCEPTED_PARENT_SUPERSEDED_DURING_EVALUATION'],
      currentAcceptedParentJobId: '30000000-0000-4000-8000-000000000003',
    });
    expect(result).not.toHaveProperty('finalGeometry');
    expect(state.latest).toBeNull();
  });

  it('returns a stale dependency block without persisting when no accepted parent remains', async () => {
    state.onSizingSolve = () => {
      state.acceptedParents = [];
    };

    const result = await evaluateCompletedJobCPhysicalSizing(11, 22, { id: state.parent.id });

    expect(result).toMatchObject({
      status: 'DEPENDENCY_BLOCKED',
      staleStatus: 'STALE',
      reasons: ['JOB_C_PHYSICAL_SIZING_RESULT_STALE:CURRENT_ACCEPTED_PARENT_UNAVAILABLE_DURING_EVALUATION'],
    });
    expect(state.latest).toBeNull();
  });
});