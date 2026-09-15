import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
  ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
} from '../server/ecr-pre-pilot/stage3-stage4-optimizer';

const state = vi.hoisted(() => ({
  rows: new Map<string, any>(),
  previous: null as any,
  stage1Hash: 's'.repeat(64),
  stage2Available: true,
  currentOptimizer: false,
  optimizerDiameterM: 0.8,
  optimizerRuns: 0,
  finiteRateRun: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../server/db', () => ({ pool: { query: state.query } }));
vi.mock('../server/ecr-pre-pilot/predictive-nt-job-service', () => ({
  loadValidatedCompletedSevenComponentNtForStage4: async () => ({
    jobId: 'stage-2', theoreticalStages: 5, engineHash: 'a'.repeat(64),
  }),
  validatePersistedAcceptedSevenComponentNtForStage4: (row: any) => ({
    theoreticalStages: row.result_snapshot.establishedTheoreticalStages,
  }),
}));
vi.mock('../server/ecr-pre-pilot/stage1', () => ({
  validateStage1Snapshot: () => ({
    immutableHash: state.stage1Hash,
    stage1: {
      minimumRecoveryPct: 90, minimumRaffinateSaturatesWt: 0,
      targetRaffinateTotalAromaticsWt: 100, targetRaffinatePolarAromaticsWt: 100,
      maximumNmpRaffinateWt: 100, feedSulfurPpm: 0, targetRaffinateSulfurPpm: 1,
      sulfurAllocationSatPct: 20, sulfurAllocationMonoPct: 20, sulfurAllocationDiPct: 20,
      sulfurAllocationPolyPct: 20, sulfurAllocationPaPct: 20,
    },
  }),
  stage1EquilibriumScientificContentHash: () => 'q'.repeat(64),
}));
vi.mock('../server/ecr-pre-pilot/kuhni-hydrodynamics', () => ({
  kuhniRunHash: (value: unknown) => JSON.stringify(value),
}));
vi.mock('../server/ecr-pre-pilot/stage4-predictive-physical-sizing', () => ({
  STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION: 'retired-test-implementation',
  STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH: 'f'.repeat(64),
  runStage4PredictivePhysicalSizing: state.finiteRateRun,
}));
vi.mock('../server/ecr-pre-pilot-service', () => ({
  createStage3Stage4OptimizerRun: vi.fn(async (_userId: number, _designId: number) => {
    state.optimizerRuns += 1;
    state.currentOptimizer = true;
    return optimizerRow();
  }),
}));

const {
  calculateStage4PrePilotSizing,
  getLiveStage4PrePilotSizing,
  retryStage4PrePilotSizing,
  stopStage4PrePilotSizing,
} = await import('../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service');

function stage2Snapshot() {
  return {
    establishedTheoreticalStages: 5,
    executionStatus: 'COMPLETED_GOVERNED_SEQUENCE',
    stage1TargetGovernance: { stage1SnapshotHash: state.stage1Hash },
  };
}

function stage3Row() {
  const processBasis = { stage1SnapshotHash: state.stage1Hash };
  const result = {
    processBasis,
    theoreticalStagesUsed: {
      value: 5,
      provenance: 'STAGE_2_CALCULATED_NT',
      stage2JobId: 'stage-2',
      stage2ResultHash: JSON.stringify(stage2Snapshot()),
    },
    hydraulicDiagnosticPoint: { status: 'CALCULATED_IN_RANGE', columnDiameterM: .974213 },
  };
  return {
    id: 'stage-3',
    immutable_hash: JSON.stringify({
      basis: processBasis, theoreticalStages: result.theoreticalStagesUsed,
      parentHydrodynamicRun: null, result,
    }),
    stage1_snapshot_hash: state.stage1Hash,
    stage2_job_id: 'stage-2',
    stage2_result_hash: result.theoreticalStagesUsed.stage2ResultHash,
    parent_hydrodynamic_run_id: null,
    parent_hydrodynamic_run_hash: null,
    process_basis: processBasis,
    theoretical_stage_authority: result.theoreticalStagesUsed,
    result_snapshot: result,
  };
}

function optimizerRow() {
  const processBasis = {
    stage1SnapshotHash: state.stage1Hash,
    phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
  };
  const geometry = {
    columnDiameterM: state.optimizerDiameterM,
    compartmentHeightM: state.optimizerDiameterM * 0.25,
    hcToColumn: 0.25,
    rotorDiameterM: state.optimizerDiameterM * 0.4,
    rotorToColumn: 0.4,
    freeArea: 0.3,
  };
  const result: any = {
    schemaVersion: 'ECR_STAGE3_STAGE4_OPTIMIZER_RESULT_V1',
    status: 'OPTIMIZED_FIXED_GEOMETRY_WINDOW',
    classification: 'PRE_PILOT_HYDRAULIC_SCREENING_NOT_SEPARATION_QUALIFICATION',
    engine: {
      id: 'ecr_stage3_stage4_optimizer',
      version: ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
      implementationHash: ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
    },
    stage1Authority: {
      snapshotHash: state.stage1Hash,
      phaseConfiguration: processBasis.phaseConfiguration,
      processBasisSchemaVersion: 'TEST',
    },
    processBasis,
    designNt: { value: 7, provenance: 'FIXED_DESIGN7', stage2IsReferenceOnly: true },
    selectedOrientation: processBasis.phaseConfiguration,
    selectedGeometry: geometry,
    selectedOperatingWindow: { lowRpm: 30, highRpm: 70, widthRpm: 40 },
    selectedRpm: 50,
    selectedTrial: { status: 'CALCULATED_IN_RANGE', columnDiameterM: geometry.columnDiameterM, rpm: 50 },
    hydraulicDiagnosticPoint: null,
    stage4GeometryInput: {
      status: 'SELECTED_IMMUTABLE_OPTIMIZER_GEOMETRY',
      ...geometry,
      rpm: 50,
      optimizerResultHash: 'o'.repeat(64),
    },
    theoreticalStagesUsed: {
      value: 5,
      provenance: 'STAGE_2_CALCULATED_NT',
      stage2JobId: 'stage-2',
      stage2ResultHash: JSON.stringify(stage2Snapshot()),
    },
  };
  result.calculationHash = JSON.stringify(result);
  return {
    id: 'optimizer-stage-3',
    immutable_hash: JSON.stringify({
      basis: processBasis,
      theoreticalStages: result.theoreticalStagesUsed,
      parentHydrodynamicRun: null,
      result,
    }),
    stage1_snapshot_hash: state.stage1Hash,
    implementation_hash: ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
    stage2_job_id: 'stage-2',
    stage2_result_hash: result.theoreticalStagesUsed.stage2ResultHash,
    parent_hydrodynamic_run_id: null,
    parent_hydrodynamic_run_hash: null,
    process_basis: processBasis,
    theoretical_stage_authority: result.theoreticalStagesUsed,
    result_snapshot: result,
  };
}

function key(userId: number, designId: number, lineage: string) {
  return `${userId}:${designId}:${lineage}`;
}

function reset() {
  state.rows.clear();
  state.previous = null;
  state.stage1Hash = 's'.repeat(64);
  state.stage2Available = true;
  state.currentOptimizer = false;
  state.optimizerDiameterM = 0.8;
  state.optimizerRuns = 0;
  state.finiteRateRun.mockReset();
  state.query.mockReset();
  state.query.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM ecr_pre_pilot_designs')) return { rows: [{ input_data: {} }] };
    if (sql.includes('FROM ecr_pre_pilot_predictive_nt_jobs')) {
      return { rows: state.stage2Available ? [{
        id: 'stage-2',
        input_snapshot: { stage1Authority: { snapshotHash: state.stage1Hash, source: {} } },
        engine_hash: 'a'.repeat(64),
        result_snapshot: stage2Snapshot(),
      }] : [] };
    }
    if (sql.includes('FROM ecr_pre_pilot_kuhni_geometry_resolver_runs')) {
      return { rows: state.currentOptimizer ? [optimizerRow()] : [] };
    }
    if (sql.includes('lineage_hash<>')) return { rows: state.previous ? [state.previous] : [] };
    if (sql.includes('FROM ecr_pre_pilot_stage4_physical_sizing_calculations')) {
      if (params.length === 2) return { rows: state.previous ? [state.previous] : [] };
      return { rows: state.rows.get(key(params[0], params[1], params[2]))
        ? [state.rows.get(key(params[0], params[1], params[2]))] : [] };
    }
    if (sql.includes('INSERT INTO ecr_pre_pilot_stage4')) {
      const rowKey = key(params[1], params[0], params[2]);
      if (!state.rows.has(rowKey)) {
        state.rows.set(rowKey, {
          status: 'CALCULATED',
          result_snapshot: params[10],
          progress_snapshot: { phase: 'COMPLETE' },
          error_code: null,
          attempt_token: params[11],
          started_at: 'now',
          deadline_at: 'now',
          completed_at: 'now',
        });
      }
      return { rows: [] };
    }
    return { rows: [] };
  });
}

describe('Stage 4 persisted HETS lifecycle', () => {
  it('keeps GET read-only and does not invoke the retired finite-rate engine', async () => {
    reset();
    const result = await getLiveStage4PrePilotSizing(7, 269);
    expect(result.status).toBe('UNRUN');
    expect(result.mainOutputs.physicalCompartments).toBeNull();
    expect(state.finiteRateRun).not.toHaveBeenCalled();
  });

  it('persists one deterministic result for one owner/current lineage and never starts a heavy job', async () => {
    reset();
    const [first, second] = await Promise.all([
      calculateStage4PrePilotSizing(8, 269),
      calculateStage4PrePilotSizing(8, 269),
    ]);
    expect(first.calculation.lineageHash).toBe(second.calculation.lineageHash);
    expect(state.rows.size).toBe(1);
    expect(state.optimizerRuns).toBe(1);
    expect(first.status).toBe('CALCULATED_HETS_PRE_PILOT_SCREENING');
    expect(first.hetsSizing).toMatchObject({
      fixedDesignTheoreticalStages: 7,
      actualStage2TheoreticalStagesReference: 5,
      compartmentHeightRule: 'PERSISTED_STAGE3_SELECTED_hc',
      physicalCompartmentHeightM: 0.2,
      requiredActiveHeightM: 7,
      requiredPhysicalCompartments: 35,
      installedActiveHeightM: 7,
    });
    expect(first.hetsSizing.compartmentHeightRule).not.toBe('0.5D');
    expect(state.finiteRateRun).not.toHaveBeenCalled();
  });

  it('does not return another owner’s saved result', async () => {
    reset();
    const ownerOne = await calculateStage4PrePilotSizing(8, 269);
    const ownerTwo = await getLiveStage4PrePilotSizing(9, 269);
    expect(ownerOne.status).toBe('CALCULATED_HETS_PRE_PILOT_SCREENING');
    expect(ownerTwo.status).toBe('UNRUN');
    expect(ownerTwo.calculation.lineageHash).not.toBe(ownerOne.calculation.lineageHash);
  });

  it('does not reuse a calculation when accepted upstream lineage changes', async () => {
    reset();
    const first = await calculateStage4PrePilotSizing(8, 269);
    state.stage1Hash = 't'.repeat(64);
    const changed = await getLiveStage4PrePilotSizing(8, 269);
    expect(changed.status).toBe('UNRUN');
    expect(changed.calculation.lineageHash).not.toBe(first.calculation.lineageHash);
    expect(changed.mainOutputs.physicalCompartments).toBeNull();
  });

  it('keeps a V1.0 1.2 m record historical, then persists the current .5 m optimizer result', async () => {
    reset();
    state.previous = {
      status: 'CALCULATED',
      error_code: null,
      progress_snapshot: { phase: 'COMPLETE' },
      completed_at: 'legacy-completed-at',
      result_snapshot: {
        implementation: {
          version: 'ECR_STAGE4_HETS_SCREENING_V1.0',
          implementationHash: '0'.repeat(64),
        },
        mainOutputs: { diameterM: 1.2, physicalCompartments: 14, activeHeightM: 7 },
        selectedStage3Hydraulics: { diameterM: 1.2, compartmentHeightM: 0.6 },
      },
      attempt_token: 'must-not-be-exposed',
    };

    const stale = await getLiveStage4PrePilotSizing(8, 269);
    expect(stale.currentOptimizerRequired).toBe(true);
    expect(stale.historicalCalculationOnly).toBe(true);
    expect(stale.mainOutputs.diameterM).toBeNull();
    expect(JSON.stringify(stale)).not.toContain('"diameterM":1.2');

    state.optimizerDiameterM = 0.5;
    const current = await calculateStage4PrePilotSizing(8, 269);
    expect(current.status).toBe('CALCULATED_HETS_PRE_PILOT_SCREENING');
    expect(current.currentOptimizer).toMatchObject({
      version: ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
      implementationHash: ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
    });
    expect(current.mainOutputs.diameterM).toBe(0.5);
    expect(current.selectedStage3Hydraulics.compartmentHeightM).toBe(0.125);
    expect(current.selectedStage3Hydraulics.compartmentHeightM)
      .not.toBe(current.mainOutputs.diameterM * 0.5);
  });

  it('permits fixed-Nt=7 HETS sizing with a nullable absent Stage-2 reference', async () => {
    reset();
    state.stage2Available = false;
    const result = await calculateStage4PrePilotSizing(8, 269);
    expect(result.actualStage2NtReference).toMatchObject({
      value: null,
      status: 'NOT_AVAILABLE_REFERENCE_ONLY',
    });
    expect(result.hetsSizing).toMatchObject({
      fixedDesignTheoreticalStages: 7,
      requiredActiveHeightM: 7,
      requiredPhysicalCompartments: 35,
      installedActiveHeightM: 7,
    });
  });

  it('treats a prior V2 HETS snapshot as historical and unrun until V3 is calculated', async () => {
    reset();
    await calculateStage4PrePilotSizing(8, 269);
    const saved = [...state.rows.values()][0];
    saved.result_snapshot.implementation.version = 'ECR_STAGE4_HETS_SCREENING_V2';
    saved.result_snapshot.implementation.implementationHash = '0'.repeat(64);
    const result = await getLiveStage4PrePilotSizing(8, 269);
    expect(result.status).toBe('UNRUN');
    expect(result.previousCalculation?.historical).toBe(true);
  });

  it('retains only diagnostic metadata, never legacy scientific outputs, for an old calculation', async () => {
    reset();
    state.previous = {
      status: 'NUMERICAL_FAILURE',
      error_code: 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED',
      progress_snapshot: { phase: 'FAILED', completedCases: 1 },
      completed_at: 'previous-completed-at',
      result_snapshot: { primary: { selected: { physicalCompartments: 99 } } },
      attempt_token: 'must-not-be-exposed',
    };
    const result = await getLiveStage4PrePilotSizing(15, 269);
    expect(result.status).toBe('UNRUN');
    expect(result.previousCalculation).toEqual({
      status: 'NUMERICAL_FAILURE',
      errorCode: 'GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED',
      completedAt: 'previous-completed-at',
      progress: { phase: 'FAILED', completedCases: 1 },
      implementationVersion: null,
      historical: true,
      staleReason: 'LEGACY_STAGE4_RESULT_REQUIRES_CURRENT_STAGE3_OPTIMIZER',
    });
    expect(JSON.stringify(result)).not.toContain('"physicalCompartments":99');
    expect(JSON.stringify(result)).not.toContain('must-not-be-exposed');
  });

  it('retry and stop never create or interrupt a scientific worker for synchronous HETS sizing', async () => {
    reset();
    const result = await retryStage4PrePilotSizing(8, 269);
    const stopped = await stopStage4PrePilotSizing(8, 269);
    expect(result.status).toBe('CALCULATED_HETS_PRE_PILOT_SCREENING');
    expect(stopped.status).toBe('CALCULATED_HETS_PRE_PILOT_SCREENING');
    expect(state.finiteRateRun).not.toHaveBeenCalled();
  });
});

it('keeps Stage-4 actions empty-body only and documents the HETS endpoint contract', () => {
  const routes = readFileSync('server/ecr-pre-pilot/routes.ts', 'utf8');
  const service = readFileSync('server/ecr-pre-pilot/stage4-pre-pilot-sizing-service.ts', 'utf8');
  expect(routes).toContain('/stage4/pre-pilot-sizing/calculate');
  expect(routes).toContain('STAGE4_PRE_PILOT_SIZING_CLIENT_SCIENTIFIC_INPUT_PROHIBITED');
  expect(routes).toContain('synchronous deterministic HETS screening calculation');
  // The persisted validator is side-effect-free; Stage 4 never invokes the
  // Stage-2 Python preflight on GET/calculate/retry.
  expect(service).toContain('validatePersistedAcceptedSevenComponentNtForStage4');
  expect(service).not.toContain('spawnSync');
});