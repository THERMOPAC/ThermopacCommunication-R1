import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
  ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
} from '../server/ecr-pre-pilot/stage3-stage4-optimizer';

const state = vi.hoisted(() => ({
  row: null as any,
  finiteRateRun: vi.fn(),
  query: vi.fn(),
  values: [] as unknown[],
  index: 0,
  optimizer: false,
  optimizerRuns: 0,
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
    immutableHash: 's'.repeat(64),
    stage1: {
      minimumRecoveryPct: 90, minimumRaffinateSaturatesWt: 0,
      targetRaffinateTotalAromaticsWt: 100, targetRaffinatePolarAromaticsWt: 100,
      maximumNmpRaffinateWt: 100, feedSulfurPpm: 0, targetRaffinateSulfurPpm: 1,
      sulfurAllocationSatPct: 20, sulfurAllocationMonoPct: 20, sulfurAllocationDiPct: 20,
      sulfurAllocationPolyPct: 20, sulfurAllocationPaPct: 20,
    },
  }),
  stage1EquilibriumScientificContentHash: () => 'q'.repeat(64),
  makeStage1HydrodynamicProcessBasis: () => ({ stage1SnapshotHash: 's'.repeat(64) }),
}));
vi.mock('../server/ecr-pre-pilot/kuhni-hydrodynamics', () => ({
  kuhniRunHash: (value: unknown) => JSON.stringify(value),
}));
vi.mock('../server/ecr-pre-pilot/stage4-predictive-physical-sizing', () => ({
  STAGE4_PREDICTIVE_PHYSICAL_SIZING_VERSION: 'legacy',
  STAGE4_PREDICTIVE_PHYSICAL_SIZING_HASH: 'f'.repeat(64),
  runStage4PredictivePhysicalSizing: state.finiteRateRun,
}));
vi.mock('../server/ecr-pre-pilot-service', () => ({
  createStage3Stage4OptimizerRun: vi.fn(async () => {
    state.optimizerRuns += 1;
    state.optimizer = true;
    return optimizedStage3Row();
  }),
}));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => [
      state.index < state.values.length ? state.values[state.index++] : initial,
      vi.fn(),
    ],
  };
});

const { deriveStage4PrePilotSizing, calculateStage4PrePilotSizing } =
  await import('../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service');
const Panel = (await import('../client/src/components/ecr-pre-pilot/stage4-pre-pilot-sizing-panel')).default;

const stage3Result = {
  processBasis: { stage1SnapshotHash: 's'.repeat(64) },
  theoreticalStagesUsed: {
    value: 5, provenance: 'STAGE_2_CALCULATED_NT', stage2JobId: 'stage-2',
    stage2ResultHash: JSON.stringify({
      establishedTheoreticalStages: 5,
      executionStatus: 'COMPLETED_GOVERNED_SEQUENCE',
      stage1TargetGovernance: { stage1SnapshotHash: 's'.repeat(64) },
    }),
  },
  hydraulicDiagnosticPoint: {
    status: 'CALCULATED_IN_RANGE',
    columnDiameterM: .974213,
  },
};

function optimizedStage3Row() {
  const processBasis = {
    stage1SnapshotHash: 's'.repeat(64),
    phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
  };
  const geometry = {
    columnDiameterM: 0.72,
    compartmentHeightM: 0.18,
    hcToColumn: 0.25,
    rotorDiameterM: 0.288,
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
      snapshotHash: 's'.repeat(64),
      phaseConfiguration: processBasis.phaseConfiguration,
      processBasisSchemaVersion: 'TEST',
    },
    processBasis,
    designNt: { value: 7, provenance: 'FIXED_DESIGN7', stage2IsReferenceOnly: true },
    selectedOrientation: processBasis.phaseConfiguration,
    selectedGeometry: geometry,
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
      stage2ResultHash: stage3Result.theoreticalStagesUsed.stage2ResultHash,
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
    stage1_snapshot_hash: 's'.repeat(64),
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

function resetDb() {
  state.row = null;
  state.optimizer = false;
  state.optimizerRuns = 0;
  state.finiteRateRun.mockReset();
  state.query.mockReset();
  state.query.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM ecr_pre_pilot_designs')) return { rows: [{ input_data: {} }] };
    if (sql.includes('FROM ecr_pre_pilot_predictive_nt_jobs')) {
      return { rows: [{
        id: 'stage-2', input_snapshot: {
          stage1Authority: { snapshotHash: 's'.repeat(64), source: {} },
        }, engine_hash: 'a'.repeat(64), result_snapshot: JSON.parse(
          stage3Result.theoreticalStagesUsed.stage2ResultHash,
        ),
      }] };
    }
    if (sql.includes('FROM ecr_pre_pilot_kuhni_geometry_resolver_runs')) {
      return { rows: state.optimizer ? [optimizedStage3Row()] : [] };
    }
    if (sql.includes('INSERT INTO ecr_pre_pilot_stage4')) {
      state.row = {
        status: 'CALCULATED', result_snapshot: params[10],
        progress_snapshot: { phase: 'COMPLETE' }, error_code: null, attempt_token: params[11],
        started_at: 'now', deadline_at: 'now', completed_at: 'now',
      };
      return { rows: [] };
    }
    if (sql.includes('FROM ecr_pre_pilot_stage4_physical_sizing_calculations')) {
      return { rows: state.row ? [state.row] : [] };
    }
    return { rows: [] };
  });
}

describe('Stage 4 deterministic HETS screening', () => {
  it('calculates the fixed-Nt=7 HETS example without intermediate rounding', () => {
    const result = deriveStage4PrePilotSizing({
      calculatedNt: 5,
      stage2JobId: 'stage-2',
      stage2ResultHash: stage3Result.theoreticalStagesUsed.stage2ResultHash,
      stage3: { id: 'stage-3', immutableHash: 'i'.repeat(64), result: stage3Result },
    });
    expect(result.hetsSizing).toMatchObject({
      physicalCompartmentHeightM: .4871065,
      screeningHetsMPerTheoreticalStage: .4,
      calculatedScreeningCompartmentEfficiency: 1.21776625,
      fixedDesignTheoreticalStages: 7,
      actualStage2TheoreticalStagesReference: 5,
      requiredActiveHeightM: 2.8,
      requiredPhysicalCompartments: 6,
      installedActiveHeightM: 2.922639,
      designStatus: 'PRE-PILOT SCREENING',
    });
  });

  it('fails closed when the Stage-3 hydraulic evidence is absent', () => {
    const noHydraulics = {
      ...stage3Result,
      hydraulicDiagnosticPoint: null,
    };
    expect(() => deriveStage4PrePilotSizing({
      calculatedNt: 5, stage2JobId: 'other',
      stage2ResultHash: stage3Result.theoreticalStagesUsed.stage2ResultHash,
      stage3: { id: 'stage-3', immutableHash: 'i'.repeat(64), result: noHydraulics },
    })).toThrow('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  });

  it('persists the direct API result without invoking the retired finite-rate solver', async () => {
    resetDb();
    const result = await calculateStage4PrePilotSizing(7, 269);
    expect(state.finiteRateRun).not.toHaveBeenCalled();
    expect(result.calculation.status).toBe('CALCULATED');
    expect(state.optimizerRuns).toBe(1);
    expect(result.hetsSizing).toMatchObject({
      physicalCompartmentHeightM: .18,
      requiredActiveHeightM: 2.8,
      requiredPhysicalCompartments: 16,
      installedActiveHeightM: 2.88,
    });
    expect(result.hetsSizing.compartmentHeightRule).not.toBe('0.5D');
  });

  it('renders the HETS result card and does not promote outlet or target claims', () => {
    const result = deriveStage4PrePilotSizing({
      calculatedNt: 5, stage2JobId: 'stage-2',
      stage2ResultHash: stage3Result.theoreticalStagesUsed.stage2ResultHash,
      stage3: { id: 'stage-3', immutableHash: 'i'.repeat(64), result: stage3Result },
    });
    state.values = [{ ...result, calculationModel: 'ECR_STAGE4_HETS_SCREENING_V4_FIXED_DESIGN_NT7_HETS0.40' }, null, false];
    state.index = 0;
    const html = renderToStaticMarkup(React.createElement(Panel, { designId: 269 }));
    expect(html).toContain('Stage 4 HETS-Based Pre-Pilot Sizing');
    expect(html).toContain('121.8%');
    expect(html).toContain('2.92 m');
    expect(html).toContain('fixed-Nₜ=7');
    expect(html).toContain('applicability to RRBO/NMP is not established');
    expect(html).toContain('No outlet,');
    expect(html).not.toContain('Predicted primary raffinate outlet');
  });

  it('renders a fixed-Nt=7 result when the actual Stage-2 reference is absent', () => {
    const result = deriveStage4PrePilotSizing({
      stage3: { id: 'stage-3', immutableHash: 'i'.repeat(64), result: stage3Result },
    });
    state.values = [{ ...result, calculationModel: 'ECR_STAGE4_HETS_SCREENING_V4_FIXED_DESIGN_NT7_HETS0.40' }, null, false];
    state.index = 0;
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(React.createElement(Panel, { designId: 269 }));
    }).not.toThrow();
    expect(html).toContain('Actual accepted Stage-2 Nₜ (reference only)');
    expect(html).toContain('HETS-implied compartment efficiency hc/HETS (not performance)');
  });
});