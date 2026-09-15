import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../server/db';
import {
  validatePersistedAcceptedSevenComponentNtForStage4,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';
import {
  loadStage4PrePilotSizingAuthority,
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
  });

  it('loads read-only Design 269 authority with fixed-Nt=7 HETS sizing and Stage-2 as reference only', async () => {
    const design = await pool.query<{ created_by: number }>(
      'SELECT created_by FROM ecr_pre_pilot_designs WHERE id=269',
    );
    const authority = await loadStage4PrePilotSizingAuthority(Number(design.rows[0].created_by), 269);
    expect(authority.projection.designNt.value).toBe(7);
    expect(authority.projection.actualStage2NtReference.value).toBe(4);
    expect(authority.projection.hetsSizing).toMatchObject({
      fixedDesignTheoreticalStages: 7,
      actualStage2TheoreticalStagesReference: 4,
      stage3HydraulicColumnDiameterM: .6930996970569214,
      physicalCompartmentHeightM: .3465498485284607,
      requiredActiveHeightM: 7,
      requiredPhysicalCompartments: 21,
      installedActiveHeightM: 7.277546819097675,
    });
    expect(authority.projection.stage2Stage1Compatibility).toMatchObject({
      status: 'EXACT_EQUILIBRIUM_INPUT_MATCH_EXCLUDING_HYDRAULIC_PHASE_ORIENTATION',
      excludedScientificInputField: 'stage1.phaseConfiguration',
    });
    expect(authority.projection.stage3HetsAdmission).toMatchObject({
      status: 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE',
      source: 'V150_EXTRAPOLATED_MODEL_ROOT',
      columnDiameterM: .6930996970569214,
    });
  });

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