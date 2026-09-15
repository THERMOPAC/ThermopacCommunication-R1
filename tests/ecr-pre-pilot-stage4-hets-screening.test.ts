import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  row: null as any,
  finiteRateRun: vi.fn(),
  query: vi.fn(),
  values: [] as unknown[],
  index: 0,
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

function resetDb() {
  state.row = null;
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
      const processBasis = stage3Result.processBasis;
      return { rows: [{
        id: 'stage-3',
        immutable_hash: JSON.stringify({
          basis: processBasis, theoreticalStages: stage3Result.theoreticalStagesUsed,
          parentHydrodynamicRun: null, result: stage3Result,
        }),
        stage1_snapshot_hash: 's'.repeat(64), stage2_job_id: 'stage-2',
        stage2_result_hash: stage3Result.theoreticalStagesUsed.stage2ResultHash,
        parent_hydrodynamic_run_id: null, parent_hydrodynamic_run_hash: null,
        process_basis: processBasis, theoretical_stage_authority: stage3Result.theoreticalStagesUsed,
        result_snapshot: stage3Result,
      }] };
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
  it('calculates the approved example without intermediate rounding', () => {
    const result = deriveStage4PrePilotSizing({
      calculatedNt: 5,
      stage2JobId: 'stage-2',
      stage2ResultHash: stage3Result.theoreticalStagesUsed.stage2ResultHash,
      stage3: { id: 'stage-3', immutableHash: 'i'.repeat(64), result: stage3Result },
    });
    expect(result.hetsSizing).toMatchObject({
      physicalCompartmentHeightM: .4871065,
      screeningHetsMPerTheoreticalStage: 1,
      calculatedScreeningCompartmentEfficiency: .4871065,
      requiredActiveHeightM: 5,
      requiredPhysicalCompartments: 11,
      installedActiveHeightM: 5.3581715,
      designStatus: 'PRE-PILOT SCREENING',
    });
  });

  it('fails closed for stale Stage-2/Stage-3 authority', () => {
    expect(() => deriveStage4PrePilotSizing({
      calculatedNt: 5, stage2JobId: 'other',
      stage2ResultHash: stage3Result.theoreticalStagesUsed.stage2ResultHash,
      stage3: { id: 'stage-3', immutableHash: 'i'.repeat(64), result: stage3Result },
    })).toThrow('STAGE4_STAGE3_STALE_OR_NOT_SAME_LINEAGE_WITH_CALCULATED_STAGE2_NT');
  });

  it('persists the direct API result without invoking the retired finite-rate solver', async () => {
    resetDb();
    const result = await calculateStage4PrePilotSizing(7, 269);
    expect(state.finiteRateRun).not.toHaveBeenCalled();
    expect(result.calculation.status).toBe('CALCULATED');
    expect(result.hetsSizing.installedActiveHeightM).toBe(5.3581715);
  });

  it('renders the HETS result card and does not promote outlet or target claims', () => {
    const result = deriveStage4PrePilotSizing({
      calculatedNt: 5, stage2JobId: 'stage-2',
      stage2ResultHash: stage3Result.theoreticalStagesUsed.stage2ResultHash,
      stage3: { id: 'stage-3', immutableHash: 'i'.repeat(64), result: stage3Result },
    });
    state.values = [{ ...result, calculationModel: 'ECR_STAGE4_HETS_SCREENING_V2' }, null, false];
    state.index = 0;
    const html = renderToStaticMarkup(React.createElement(Panel, { designId: 269 }));
    expect(html).toContain('Stage 4 HETS-Based Pre-Pilot Sizing');
    expect(html).toContain('48.7%');
    expect(html).toContain('5.36 m');
    expect(html).toContain('conservatism for RRBO/NMP is not established');
    expect(html).toContain('No outlet,');
    expect(html).not.toContain('Predicted primary raffinate outlet');
  });
});