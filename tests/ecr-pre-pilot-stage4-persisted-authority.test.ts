import { afterAll, describe, expect, it, vi } from 'vitest';
import { pool } from '../server/db';
import {
  validatePersistedAcceptedSevenComponentNtForStage4,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';
import {
  loadStage4PrePilotSizingAuthority,
  STAGE4_HETS_DESIGN_NT,
  STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_VERSION,
  validatePersistedStage2HetsAuthority,
} from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';
import { validateStage1Snapshot } from '../server/ecr-pre-pilot/stage1';

type PersistedStage2Row = {
  id: string; design_id: number; created_by: number; input_snapshot: unknown;
  model_hash: string; engine_hash: string; status: string; result_snapshot: unknown;
};

async function acceptedDesign269Stage2(): Promise<PersistedStage2Row> {
  const rows = await pool.query<PersistedStage2Row>(
    `SELECT id::text,design_id,created_by,input_snapshot,model_hash,engine_hash,status,result_snapshot
       FROM ecr_pre_pilot_predictive_nt_jobs
      WHERE design_id=269 AND status='completed'
        AND result_snapshot->>'establishedTheoreticalStages' IS NOT NULL
      ORDER BY created_at DESC,id DESC LIMIT 1`,
  );
  if (!rows.rows[0]) throw new Error('DESIGN269_ACCEPTED_STAGE2_FIXTURE_NOT_FOUND');
  return rows.rows[0];
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe.sequential('Stage 4 persisted Stage-2 authority validator', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('accepts the real completed Design 269 Stage-2 scientific record without a runtime preflight', async () => {
    const row = await acceptedDesign269Stage2();
    const accepted = validatePersistedAcceptedSevenComponentNtForStage4(row);
    expect(accepted.theoreticalStages).toBe(4);
    expect(accepted.selectedTrial).toMatchObject({
      stageCount: 4,
      accepted: true,
      numericalAcceptancePassed: true,
      allCalculableTargetsPass: true,
      physicalLleClassification: 'PHYSICAL_LLE',
    });
  }, 30_000);

  it('uses the approved current optimizer without changing the fixed HETS design authority', async () => {
    const design = await pool.query<{ created_by: number }>(
      'SELECT created_by FROM ecr_pre_pilot_designs WHERE id=269',
    );
    const authority = await loadStage4PrePilotSizingAuthority(
      Number(design.rows[0].created_by),
      269,
    );
    expect(authority.projection.designNt).toMatchObject({
      value: STAGE4_HETS_DESIGN_NT,
      provenance: 'STAGE4_FIXED_HETS_PRE_PILOT_DESIGN_NT',
    });
    expect(authority.projection.actualStage2NtReference).toMatchObject({
      value: 4,
      status: 'AVAILABLE_REFERENCE_ONLY',
    });
    expect(authority.projection.implementation?.version)
      .toBe(STAGE4_OPTIMIZED_HETS_IMPLEMENTATION_VERSION);
    expect(authority.projection.selectedStage3Hydraulics.source)
      .toBe('PERSISTED_STAGE3_OPTIMIZER_GEOMETRY_NO_STAGE4_RESELECTION');
    expect(authority.projection.selectedStage3Hydraulics.hcToColumn)
      .toBeGreaterThanOrEqual(0.2);
    expect(authority.projection.selectedStage3Hydraulics.hcToColumn)
      .toBeLessThanOrEqual(0.3);
    expect(authority.projection.selectedStage3Hydraulics.hcToColumn).not.toBe(0.5);
  }, 30_000);

  it('does not reinterpret the historical Design 269 geometry when no current optimizer exists', async () => {
    const design = await pool.query<{ created_by: number }>(
      'SELECT created_by FROM ecr_pre_pilot_designs WHERE id=269',
    );
    const query = pool.query.bind(pool);
    const querySpy = vi.spyOn(pool, 'query').mockImplementation((async (...args: any[]) => {
      if (String(args[0]).includes('FROM ecr_pre_pilot_kuhni_geometry_resolver_runs')) {
        return { rows: [], rowCount: 0 };
      }
      return query(...args);
    }) as typeof pool.query);
    try {
      await expect(loadStage4PrePilotSizingAuthority(
        Number(design.rows[0].created_by),
        269,
      )).rejects.toThrow('STAGE4_CURRENT_STAGE3_OPTIMIZER_REQUIRED');
    } finally {
      querySpy.mockRestore();
    }
  }, 30_000);

  it('rejects a Stage-2 result hash that is changed without changing its stored Stage-1 input', async () => {
    const row = copy(await acceptedDesign269Stage2()) as any;
    const design = await pool.query<{ input_data: unknown }>(
      'SELECT input_data FROM ecr_pre_pilot_designs WHERE id=269',
    );
    const currentStage1 = validateStage1Snapshot(design.rows[0].input_data);
    row.result_snapshot.stage1TargetGovernance.stage1SnapshotHash =
      currentStage1.immutableHash;
    expect(() => validatePersistedStage2HetsAuthority(row, currentStage1))
      .toThrow('STAGE4_PERSISTED_ACCEPTED_STAGE2_INTEGRITY_INVALID');
  });

  it.each([
    ['an arbitrary row engine digest', (row: any) => { row.engine_hash = '0'.repeat(64); }],
    ['a coordinated self-attested engine/hash-chain rewrite', (row: any) => {
      const invented = '0'.repeat(64);
      row.engine_hash = invented;
      row.result_snapshot.engine.engineHash = invented;
      row.result_snapshot.engine.verifiedScientificInputAggregateSha256 = invented;
      row.result_snapshot.engine.historicalEngineHashes['7C-1.5.0'] = invented;
    }],
    ['missing trial evidence', (row: any) => { row.result_snapshot.trials = []; }],
    ['a mismatched selected Nt', (row: any) => { row.result_snapshot.predictiveNt = 5; }],
    ['a rejected selected trial', (row: any) => { row.result_snapshot.trials.find((trial: any) => trial.stageCount === 4).accepted = false; }],
    ['a failed target gate', (row: any) => { row.result_snapshot.trials.find((trial: any) => trial.stageCount === 4).allCalculableTargetsPass = false; }],
    ['a nonphysical LLE classification', (row: any) => { row.result_snapshot.trials.find((trial: any) => trial.stageCount === 4).physicalLleClassification = 'UNRESOLVED'; }],
  ])('rejects %s', async (_reason, mutate) => {
    const row = copy(await acceptedDesign269Stage2()) as any;
    mutate(row);
    expect(() => validatePersistedAcceptedSevenComponentNtForStage4(row)).toThrow();
  });
});