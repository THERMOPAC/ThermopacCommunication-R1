import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: new Map<string, any>(),
  target: 90,
  runs: [] as Array<{ resolve: (value: any) => void }>,
  previous: null as any,
  failProgressWriteAt: null as number | null,
  progressWriteCount: 0,
  run: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../server/db', () => ({ pool: { query: state.query } }));
vi.mock('../server/ecr-pre-pilot/predictive-nt-job-service', () => ({
  loadValidatedCompletedSevenComponentNtForStage4: async () => ({
    jobId: 'stage2', theoreticalStages: 2, engineHash: 'a'.repeat(64),
  }),
}));
vi.mock('../server/ecr-pre-pilot/stage1', () => ({
  validateStage1Snapshot: () => ({
    immutableHash: 's'.repeat(64),
    stage1: {
      minimumRecoveryPct: state.target, minimumRaffinateSaturatesWt: 0,
      targetRaffinateTotalAromaticsWt: 100, targetRaffinatePolarAromaticsWt: 100,
      maximumNmpRaffinateWt: 100, feedSulfurPpm: 0, targetRaffinateSulfurPpm: 1,
      sulfurAllocationSatPct: 20, sulfurAllocationMonoPct: 20, sulfurAllocationDiPct: 20,
      sulfurAllocationPolyPct: 20, sulfurAllocationPaPct: 20,
    },
  }),
  makeStage1HydrodynamicProcessBasis: () => basis(),
}));
vi.mock('../server/ecr-pre-pilot/stage4-predictive-physical-sizing', () => ({
  STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION: 'test-v1',
  STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH: 'f'.repeat(64),
  runStage4PredictivePhysicalSizing: state.run,
}));
vi.mock('../server/ecr-pre-pilot/kuhni-hydrodynamics', () => ({
  kuhniRunHash: (value: unknown) => JSON.stringify(value),
}));

const { calculateStage4PrePilotSizing, getLiveStage4PrePilotSizing, retryStage4PrePilotSizing,
  stopStage4PrePilotSizing } = await import('../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service');

function basis() {
  return {
    stage1SnapshotHash: 's'.repeat(64), temperatureK: 298.15,
    phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
    rrboFeed: { flowM3S: 1e-5, densityKgM3: 850, dynamicViscosityPaS: .003 },
    wetSolventPhase: { flowM3S: 1e-5, densityKgM3: 997, dynamicViscosityPaS: .001 },
    interfacialTensionNM: .01,
    composition: {
      rrboFeedWt: { saturates: 70, monoAromatics: 10, diAromatics: 8, polyAromatics: 5, polarAromatics: 4, nmp: 3 },
      wetSolventWt: { nmp: 99, water: 1 },
    },
  };
}

function stage2Snapshot() {
  return {
    accepted: 2, establishedTheoreticalStages: 2,
    executionStatus: 'COMPLETED_GOVERNED_SEQUENCE',
    stage1TargetGovernance: { stage1SnapshotHash: 's'.repeat(64) },
  };
}

function stage3Row() {
  const processBasis = basis();
  const result = {
    processBasis,
    engine: { implementationHash: 'b'.repeat(64) },
    theoreticalStagesUsed: {
      value: 2, provenance: 'STAGE_2_CALCULATED_NT', stage2JobId: 'stage2',
      stage2ResultHash: JSON.stringify(stage2Snapshot()),
    },
    hydraulicDiagnosticPoint: {
      status: 'CALCULATED_IN_RANGE', columnDiameterM: 1, rotorDiameterM: .5, rpm: 30, d32M: .002,
    },
    hydraulicRpmEnvelope: [{
      status: 'CALCULATED_IN_RANGE', columnDiameterM: 1, rotorDiameterM: .5, rpm: 30, d32M: .002,
      operatingHydraulics: {
        status: 'OPERATING_HOLDUP_CALCULATED', operatingHoldup: .2, floodHoldup: .4,
        continuousSuperficialVelocityMS: .001, dispersedSuperficialVelocityMS: .001,
      },
    }],
  };
  return {
    id: 'stage3', immutable_hash: JSON.stringify({
      basis: processBasis, theoreticalStages: result.theoreticalStagesUsed, parentHydrodynamicRun: null, result,
    }),
    stage1_snapshot_hash: 's'.repeat(64), stage2_job_id: 'stage2',
    stage2_result_hash: JSON.stringify(stage2Snapshot()), parent_hydrodynamic_run_id: null,
    parent_hydrodynamic_run_hash: null, process_basis: processBasis,
    theoretical_stage_authority: result.theoreticalStagesUsed, result_snapshot: result,
  };
}

function key(userId: number, designId: number, lineage: string) {
  return `${userId}:${designId}:${lineage}`;
}

function reset() {
  state.rows.clear();
  state.target = 90;
  state.runs.length = 0;
  state.previous = null;
  state.failProgressWriteAt = null;
  state.progressWriteCount = 0;
  state.run.mockReset();
  state.run.mockImplementation(() => new Promise(resolve => state.runs.push({ resolve })));
  state.query.mockReset();
  state.query.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM ecr_pre_pilot_designs')) return { rows: [{ input_data: {} }] };
    if (sql.includes('FROM ecr_pre_pilot_predictive_nt_jobs')) {
      return { rows: [{ id: 'stage2', engine_hash: 'a'.repeat(64), result_snapshot: stage2Snapshot() }] };
    }
    if (sql.includes('FROM ecr_pre_pilot_kuhni_geometry_resolver_runs')) return { rows: [stage3Row()] };
    if (sql.includes('lineage_hash<>')) {
      return { rows: state.previous ? [state.previous] : [] };
    }
    const lineage = params[2];
    const rowKey = key(params[0], params[1], lineage);
    if (sql.includes('SELECT') && sql.includes('stage4_physical')) {
      return { rows: state.rows.has(rowKey) ? [state.rows.get(rowKey)] : [] };
    }
    if (sql.includes('INSERT INTO ecr_pre_pilot_stage4')) {
      const insertKey = key(params[1], params[0], lineage);
      if (!state.rows.has(insertKey)) {
        state.rows.set(insertKey, {
          status: 'RUNNING', result_snapshot: null,
          progress_snapshot: { phase: 'QUEUED', completedCases: 0, totalCases: 2 },
          error_code: null, attempt_token: params[10], started_at: 'now',
          deadline_at: new Date(Date.now() + 60_000).toISOString(), completed_at: null,
        });
      }
      return { rows: [] };
    }
    const row = state.rows.get(rowKey);
    if (!row) return { rows: [] };
    if (sql.includes("SET progress_snapshot")) {
      state.progressWriteCount += 1;
      if (state.failProgressWriteAt === state.progressWriteCount) {
        throw new Error('STAGE4_PROGRESS_DATABASE_WRITE_FAILED');
      }
      if (row.attempt_token === params[3] && row.status === 'RUNNING') row.progress_snapshot = params[4];
    } else if (sql.includes("SET status=$5,result_snapshot")) {
      if (row.attempt_token === params[3] && row.status === 'RUNNING') {
        Object.assign(row, { status: params[4], result_snapshot: params[5], progress_snapshot: params[6] });
      }
    } else if (sql.includes("SET status=$5,error_code=$6")) {
      if (row.attempt_token === params[3] && row.status === 'RUNNING') {
        Object.assign(row, { status: params[4], error_code: params[5] });
        const current = row.progress_snapshot ?? {};
        row.progress_snapshot = { ...current, phase: 'FAILED' };
      }
    } else if (sql.includes("SET status='RUNNING'")) {
      Object.assign(row, { status: 'RUNNING', attempt_token: params[3], result_snapshot: null,
        error_code: null, deadline_at: new Date(Date.now() + 60_000).toISOString() });
      return { rows: [row] };
    } else if (sql.includes("SET status='INTERRUPTED'")) {
      row.status = 'INTERRUPTED';
    }
    return { rows: [] };
  });
}

const targetFailure = {
  status: 'TARGET_FAILURE_NO_TARGET_COMPLIANT_COUNT_WITHIN_BOUND',
  primary: { selected: null, nonconvergedPhysicalCounts: [],
    searchTermination: 'NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND' },
  sensitivity: { selected: null, nonconvergedPhysicalCounts: [],
    searchTermination: 'NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND' },
};

describe('Stage-4 persisted finite-rate lifecycle', () => {
  it('keeps GET read-only: it does not invoke the engine for an unrun lineage', async () => {
    reset();
    const result = await getLiveStage4PrePilotSizing(7, 269);
    expect(result.status).toBe('UNRUN');
    expect(state.run).not.toHaveBeenCalled();
  });

  it('deduplicates empty explicit calculations for the same owner and lineage', async () => {
    reset();
    await Promise.all([calculateStage4PrePilotSizing(8, 269), calculateStage4PrePilotSizing(8, 269)]);
    expect(state.run).toHaveBeenCalledTimes(1);
    expect(state.rows.size).toBe(1);
    state.runs[0].resolve(targetFailure);
  });

  it('initializes both coefficient trial maps before the first physical event', async () => {
    reset();
    state.run.mockImplementationOnce(async (_input: unknown, options: any) => {
      await options.onProgress({ phase: 'PRIMARY_RUNNING', completedCases: 0, totalCases: 2 });
      throw new Error('STAGE4_FINITE_RATE_SOLVER_RUN_TIMEOUT');
    });
    const started = await calculateStage4PrePilotSizing(8, 269);
    await new Promise(resolve => setTimeout(resolve, 0));
    const row = state.rows.get(key(8, 269, started.calculation.lineageHash));
    expect(row.progress_snapshot.physicalTrialProgress).toEqual({
      primary: {
        caseCoefficient: .0126, completedPhysicalTrials: 0, resolvedPhysicalTrials: 0,
        unresolvedPhysicalTrials: 0, lastCompletedPhysicalCount: null,
        minimumPhysicalCount: 2, maximumPhysicalCount: 80, totalPhysicalTrials: 79,
        partialPhysicalCountOutcomes: [],
      },
      sensitivity: {
        caseCoefficient: .0105, completedPhysicalTrials: 0, resolvedPhysicalTrials: 0,
        unresolvedPhysicalTrials: 0, lastCompletedPhysicalCount: null,
        minimumPhysicalCount: 2, maximumPhysicalCount: 80, totalPhysicalTrials: 79,
        partialPhysicalCountOutcomes: [],
      },
    });
  });

  it('still attempts terminal failure persistence when the latest progress write fails', async () => {
    reset();
    state.failProgressWriteAt = 2;
    const progressError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.run.mockImplementationOnce(async (_input: unknown, options: any) => {
      await options.onProgress({ phase: 'PRIMARY_RUNNING', completedCases: 0, totalCases: 2 });
      await options.onNumericalProgress({
        caseCoefficient: .0126, physicalCompartments: 2,
        finiteVolumeCellsPerPhysicalCompartment: 2, state: 'STARTED',
        localFlashCalls: 0, reason: null, completedPhysicalTrials: 0,
        resolvedPhysicalTrials: 0, unresolvedPhysicalTrials: 0,
        lastCompletedPhysicalCount: null, minimumPhysicalCount: 2,
        maximumPhysicalCount: 80, totalPhysicalTrials: 79,
        partialPhysicalCountOutcomes: [],
      });
    });
    const started = await calculateStage4PrePilotSizing(8, 269);
    await new Promise(resolve => setTimeout(resolve, 0));
    const row = state.rows.get(key(8, 269, started.calculation.lineageHash));
    expect(row.status).toBe('NUMERICAL_FAILURE');
    expect(row.error_code).toBe('STAGE4_PROGRESS_DATABASE_WRITE_FAILED');
    expect(progressError).toHaveBeenCalledWith(
      'STAGE4_PROGRESS_PERSISTENCE_FAILED',
      expect.any(Error),
    );
    expect(state.query.mock.calls.some(([sql]) =>
      String(sql).includes('SET status=$5,error_code=$6'))).toBe(true);
    progressError.mockRestore();
  });

  it('does not deliver a cached result when targets change the lineage', async () => {
    reset();
    const first = await calculateStage4PrePilotSizing(9, 269);
    state.runs[0].resolve(targetFailure);
    await Promise.resolve();
    state.target = 91;
    const changed = await getLiveStage4PrePilotSizing(9, 269);
    expect(first.calculation.lineageHash).not.toBe(changed.calculation.lineageHash);
    expect(changed.status).toBe('UNRUN');
  });

  it('surfaces expired leases as interrupted without launching from GET', async () => {
    reset();
    const unrun = await getLiveStage4PrePilotSizing(10, 269);
    state.rows.set(key(10, 269, unrun.calculation.lineageHash), {
      status: 'RUNNING', result_snapshot: null,
      progress_snapshot: { phase: 'PRIMARY_RUNNING', completedCases: 0, totalCases: 2 },
      error_code: null, attempt_token: 'orphaned-after-restart', started_at: 'then',
      deadline_at: new Date(Date.now() - 1).toISOString(), completed_at: null,
    });
    const result = await getLiveStage4PrePilotSizing(10, 269);
    expect(result.status).toBe('INTERRUPTED');
    expect(state.run).not.toHaveBeenCalled();
  });

  it('exposes only the prior terminal explanation when a refreshed lineage is unrun', async () => {
    reset();
    state.previous = {
      status: 'NUMERICAL_FAILURE',
      error_code: 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED',
      progress_snapshot: {
        phase: 'FAILED', completedCases: 1, totalCases: 2,
        physicalTrialProgress: { primary: { completedPhysicalTrials: 1 } },
      },
      completed_at: 'previous-completed-at',
      result_snapshot: { selected: 'must-not-be-exposed' },
      attempt_token: 'must-not-be-exposed',
    };
    const result = await getLiveStage4PrePilotSizing(15, 269);
    expect(result.status).toBe('UNRUN');
    expect(result.previousCalculation).toEqual({
      status: 'NUMERICAL_FAILURE',
      errorCode: 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED',
      completedAt: 'previous-completed-at',
      progress: state.previous.progress_snapshot,
      historical: true,
    });
    expect(result.previousCalculation).not.toHaveProperty('resultSnapshot');
    expect(result.previousCalculation).not.toHaveProperty('attemptToken');
    expect(state.run).not.toHaveBeenCalled();
    const historicalCall = state.query.mock.calls.find(([sql]) =>
      String(sql).includes('lineage_hash<>'));
    expect(historicalCall?.[1]).toEqual([15, 269, result.calculation.lineageHash]);
  });

  it('preserves finite numerical diagnostics without promoting their selected outputs', async () => {
    reset();
    const unrun = await getLiveStage4PrePilotSizing(12, 269);
    state.rows.set(key(12, 269, unrun.calculation.lineageHash), {
      status: 'NUMERICAL_FAILURE',
      result_snapshot: {
        primary: {
          selected: { physicalCompartments: 99, activeHeightM: 49.5, overallEfficiency: 2 / 99 },
          nonconvergedPhysicalCounts: [3, 4],
          searchTermination: 'TARGET_COMPLIANCE_UNKNOWN_NUMERICAL_PHYSICAL_COUNTS_REMAIN',
        },
        sensitivity: {
          selected: null, nonconvergedPhysicalCounts: [3],
          searchTermination: 'TARGET_COMPLIANCE_UNKNOWN_NUMERICAL_PHYSICAL_COUNTS_REMAIN',
        },
      },
      progress_snapshot: {
        phase: 'PRIMARY_RUNNING', completedCases: 0, totalCases: 2,
        currentPhysicalCompartments: 4, completedMeshes: 1,
      },
      error_code: 'STAGE4_ADAPTER_TIMEOUT', attempt_token: 'failed',
      started_at: 'then', deadline_at: 'then', completed_at: 'now',
    });
    const result = await getLiveStage4PrePilotSizing(12, 269);
    expect(result.status).toBe('NUMERICAL_FAILURE');
    expect(result.mainOutputs.physicalCompartments).toBeNull();
    expect(result.physicalSizing.primary.selected.physicalCompartments).toBe(99);
    expect(result.calculation.errorCode).toBe('STAGE4_ADAPTER_TIMEOUT');
    expect(result.calculation.progress).toMatchObject({
      phase: 'FAILED', currentPhysicalCompartments: 4, completedMeshes: 1,
    });
  });

  it('reports target failure as a target result rather than an unrun efficiency state', async () => {
    reset();
    const unrun = await getLiveStage4PrePilotSizing(13, 269);
    state.rows.set(key(13, 269, unrun.calculation.lineageHash), {
      status: 'TARGET_FAILURE', result_snapshot: targetFailure,
      progress_snapshot: { phase: 'SENSITIVITY_COMPLETE', completedCases: 2, totalCases: 2 },
      error_code: null, attempt_token: 'target-failed', started_at: 'then',
      deadline_at: 'later', completed_at: 'now',
    });
    const result = await getLiveStage4PrePilotSizing(13, 269);
    expect(result.overallEfficiency.status).toBe('NO_TARGET_COMPLIANT_PHYSICAL_SOLUTION');
    expect(result.calculation.progress).toMatchObject({ phase: 'COMPLETE', completedCases: 2 });
  });

  it('does not globally calculate or promote primary sizing when sensitivity is absent', async () => {
    reset();
    const started = await calculateStage4PrePilotSizing(14, 269);
    state.runs[0].resolve({
      status: 'TARGET_FAILURE_NO_TARGET_COMPLIANT_COUNT_WITHIN_BOUND',
      primary: {
        selected: { physicalCompartments: 4, activeHeightM: 2, overallEfficiency: .5 },
        nonconvergedPhysicalCounts: [],
        searchTermination: 'FULL_EXPLICIT_COUNT_SEARCH_COMPLETED_FIRST_TARGET_COMPLIANT_RETAINED',
      },
      sensitivity: {
        selected: null, nonconvergedPhysicalCounts: [],
        searchTermination: 'NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND',
      },
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const result = await getLiveStage4PrePilotSizing(14, 269);
    expect(result.status).toBe('TARGET_FAILURE');
    expect(result.mainOutputs.physicalCompartments).toBeNull();
    expect(result.physicalSizing.primary.selected.physicalCompartments).toBe(4);
  });

  it('retains per-case completed outcomes when a timeout starts sensitivity', async () => {
    reset();
    const primaryOutcome = {
      physicalCompartments: 5, status: 'TARGET_FAIL', reason: 'GOVERNED_PRODUCT_TARGETS_NOT_MET',
    };
    state.run.mockImplementationOnce(async (_input: unknown, options: any) => {
      await options.onProgress({ phase: 'PRIMARY_RUNNING', completedCases: 0, totalCases: 2 });
      await options.onNumericalProgress({
        caseCoefficient: .0126, physicalCompartments: 5,
        finiteVolumeCellsPerPhysicalCompartment: 2, state: 'STARTED',
        localFlashCalls: 0, reason: null, completedPhysicalTrials: 0,
        resolvedPhysicalTrials: 0, unresolvedPhysicalTrials: 0,
        lastCompletedPhysicalCount: null, minimumPhysicalCount: 5,
        maximumPhysicalCount: 80, totalPhysicalTrials: 76,
        partialPhysicalCountOutcomes: [],
      });
      await options.onNumericalProgress({
        caseCoefficient: .0126, physicalCompartments: 5,
        finiteVolumeCellsPerPhysicalCompartment: 4, state: 'CONVERGED',
        localFlashCalls: 1, reason: primaryOutcome.reason, completedPhysicalTrials: 1,
        resolvedPhysicalTrials: 1, unresolvedPhysicalTrials: 0,
        lastCompletedPhysicalCount: 5, minimumPhysicalCount: 5,
        maximumPhysicalCount: 80, totalPhysicalTrials: 76,
        partialPhysicalCountOutcomes: [primaryOutcome],
      });
      await options.onProgress({ phase: 'PRIMARY_COMPLETE', completedCases: 1, totalCases: 2 });
      await options.onProgress({ phase: 'SENSITIVITY_RUNNING', completedCases: 1, totalCases: 2 });
      await options.onNumericalProgress({
        caseCoefficient: .0105, physicalCompartments: 5,
        finiteVolumeCellsPerPhysicalCompartment: 2, state: 'STARTED',
        localFlashCalls: 0, reason: null, completedPhysicalTrials: 0,
        resolvedPhysicalTrials: 0, unresolvedPhysicalTrials: 0,
        lastCompletedPhysicalCount: null, minimumPhysicalCount: 5,
        maximumPhysicalCount: 80, totalPhysicalTrials: 76,
        partialPhysicalCountOutcomes: [],
      });
      throw new Error('STAGE4_FINITE_RATE_SOLVER_RUN_TIMEOUT');
    });
    const started = await calculateStage4PrePilotSizing(16, 269);
    await new Promise(resolve => setTimeout(resolve, 0));
    const row = state.rows.get(key(16, 269, started.calculation.lineageHash));
    expect(row.status).toBe('INTERRUPTED');
    expect(row.progress_snapshot).toMatchObject({
      phase: 'FAILED', completedCases: 1, totalCases: 2,
      completedPhysicalTrials: 0, maximumPhysicalCount: 80,
      physicalTrialProgress: {
        primary: {
          completedPhysicalTrials: 1, resolvedPhysicalTrials: 1,
          lastCompletedPhysicalCount: 5,
          partialPhysicalCountOutcomes: [primaryOutcome],
          coarse: { completedPhysicalTrials: 0 },
          refined: { completedPhysicalTrials: 1 },
        },
        sensitivity: { completedPhysicalTrials: 0, state: 'STARTED' },
      },
    });
  });

  it('requires explicit retry and prevents an old stopped attempt overwriting it', async () => {
    reset();
    const started = await calculateStage4PrePilotSizing(11, 269);
    const lineage = started.calculation.lineageHash;
    const oldToken = state.rows.get(key(11, 269, lineage)).attempt_token;
    await stopStage4PrePilotSizing(11, 269);
    await retryStage4PrePilotSizing(11, 269);
    const row = state.rows.get(key(11, 269, lineage));
    expect(row.attempt_token).not.toBe(oldToken);
    expect(state.run).toHaveBeenCalledTimes(2);
    state.runs[0].resolve(targetFailure);
    await Promise.resolve();
    expect(row.status).toBe('RUNNING');
    state.runs[1].resolve(targetFailure);
  });
});

it('keeps all Stage-4 calculate lifecycle routes empty-body only', () => {
  const routes = readFileSync('server/ecr-pre-pilot/routes.ts', 'utf8');
  expect(routes).toContain('/stage4/pre-pilot-sizing/calculate');
  expect(routes).toContain('/stage4/pre-pilot-sizing/retry');
  expect(routes).toContain('/stage4/pre-pilot-sizing/stop');
  expect(routes).toContain('STAGE4_PRE_PILOT_SIZING_CLIENT_SCIENTIFIC_INPUT_PROHIBITED');
});