// ECR-2 simulator service/database regression coverage.
//
// These tests intentionally use the persisted workspace sections and the
// service's runCalculation path.  Engine-only tests cannot catch a missing
// input snapshot, an incorrectly promoted result, or ECR-1 cross-contamination.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mapWorkspaceProcessDesignInputs } from '../server/llx-process-design-input-mapper';

const ENGINE_VERSION = '1.0.0';

const molecularWeights = {
  saturates_g_mol: {
    value: 330,
    sourceType: 'Assumed',
    sourceReference: 'ECR-2 service regression fixture',
  },
  mono_g_mol: {
    value: 300,
    sourceType: 'Assumed',
    sourceReference: 'ECR-2 service regression fixture',
  },
  di_g_mol: {
    value: 350,
    sourceType: 'Assumed',
    sourceReference: 'ECR-2 service regression fixture',
  },
  poly_g_mol: {
    value: 430,
    sourceType: 'Assumed',
    sourceReference: 'ECR-2 service regression fixture',
  },
};

const diffusivity = {
  Sat: {
    De_c: {
      value_m2_s: 2.5e-9,
      sourceType: 'Assumed',
      sourceReference: 'ECR-2 service regression fixture',
      referenceTemperature_C: 70,
      method: 'Test fixture',
      status: 'engineer_supplied',
    },
    De_d: {
      value_m2_s: 2.2e-9,
      sourceType: 'Assumed',
      sourceReference: 'ECR-2 service regression fixture',
      referenceTemperature_C: 70,
      method: 'Test fixture',
      status: 'engineer_supplied',
    },
  },
  Mono: {
    De_c: {
      value_m2_s: 2.0e-9,
      sourceType: 'Assumed',
      sourceReference: 'ECR-2 service regression fixture',
      referenceTemperature_C: 70,
      method: 'Test fixture',
      status: 'engineer_supplied',
    },
    De_d: {
      value_m2_s: 1.8e-9,
      sourceType: 'Assumed',
      sourceReference: 'ECR-2 service regression fixture',
      referenceTemperature_C: 70,
      method: 'Test fixture',
      status: 'engineer_supplied',
    },
  },
  Di: {
    De_c: {
      value_m2_s: 1.6e-9,
      sourceType: 'Assumed',
      sourceReference: 'ECR-2 service regression fixture',
      referenceTemperature_C: 70,
      method: 'Test fixture',
      status: 'engineer_supplied',
    },
    De_d: {
      value_m2_s: 1.4e-9,
      sourceType: 'Assumed',
      sourceReference: 'ECR-2 service regression fixture',
      referenceTemperature_C: 70,
      method: 'Test fixture',
      status: 'engineer_supplied',
    },
  },
  Poly: {
    De_c: {
      value_m2_s: 1.2e-9,
      sourceType: 'Assumed',
      sourceReference: 'ECR-2 service regression fixture',
      referenceTemperature_C: 70,
      method: 'Test fixture',
      status: 'engineer_supplied',
    },
    De_d: {
      value_m2_s: 1.0e-9,
      sourceType: 'Assumed',
      sourceReference: 'ECR-2 service regression fixture',
      referenceTemperature_C: 70,
      method: 'Test fixture',
      status: 'engineer_supplied',
    },
  },
  NMP: {
    De_c: {
      value_m2_s: 2.4e-9,
      sourceType: 'Assumed',
      sourceReference: 'ECR-2 service regression fixture',
      referenceTemperature_C: 70,
      method: 'Test fixture',
      status: 'engineer_supplied',
    },
    De_d: {
      value_m2_s: 1.9e-9,
      sourceType: 'Assumed',
      sourceReference: 'ECR-2 service regression fixture',
      referenceTemperature_C: 70,
      method: 'Test fixture',
      status: 'engineer_supplied',
    },
  },
};

const bvp = {
  rrboGradeId: 'rrbo-sn300',
  partitionBasis: {
    basis: 'K_d_concentration',
    approvalStatus: 'engineer_approved_governed',
    sourceReference: 'ECR-2 service regression fixture',
    approvedBy: 'Test Engineer',
    approvedAt: '2026-08-22T10:00:00Z',
  },
  diffusivity,
  solverOptions: {
    transferStrength: 0,
  },
};

const processDesignInputs = {
  operating_temperature: '70',
  extraction_temperature: '70',
  design_capacity_lph: '117.6',
  feed_service: 'Re-Refined Base Oil SN300',
  so_ratio: '1.72',
  rrbo_saturates_wt: '50',
  rrbo_mono_aromatics_wt: '30',
  rrbo_di_aromatics_wt: '15',
  rrbo_poly_aromatics_wt: '5',
  // Zero-transfer fixture: this is the governed RRBO SN300 hydrocarbon-only
  // inlet aromatic mole fraction for 50/30/15/5 mass fractions. It lets the
  // progressive process-height solver accept its physical lower trial without
  // inventing a manual Stage 7 height.
  target_raffinate_aromatics_mol: '43.79949896594715',
  target_raffinate_aromatics_source: 'Assumed',
  target_raffinate_aromatics_source_reference: 'ECR-2 service regression target',
  target_raffinate_aromatics_basis: 'hydrocarbon_only_physical_outlet',
  solvent_nmp_mole_fraction: '1',
  rrbo_viscosity_dynamic_value: '52',
  rrbo_viscosity_dynamic_ref_temp: '40',
  rrbo_viscosity_dynamic_source: 'Assumed',
  interfacial_tension_value: '12',
  interfacial_tension_ref_temp: '70',
  interfacial_tension_source: 'Assumed',
};

const simulatorInputs = {
  // Legacy manual search fields are deliberately retained in this fixture to
  // prove the mapper and engine ignore them for new ECR-2 calculations.
  column_diameter: '0.2523',
  column_diameter_trials_m: '0.2523, 0.35',
  governed_psi_w_kg: '0.1',
  governed_psi_source_type: 'Assumed',
  governed_psi_source_reference: 'ECR-2 service regression governed process condition',
  ecr_active_height_m: '0.01',
  compartment_height: '0.01',
  compartment_height_source: 'Assumed',
  compartment_height_source_reference: 'ECR-2 service regression fixture',
  rotor_ratio: '0.5',
  rotor_speed: '150',
  rotor_type: 'shrouded turbine',
  power_number: '0.1',
  power_number_source_reference: 'ECR-2 service regression fixture',
  stator_open_area_fraction: '0.5',
  stator_open_area_fraction_source_reference: 'ECR-2 service regression fixture',
  shaft_efficiency: '80',
  shaft_efficiency_source_reference: 'ECR-2 service regression fixture',
  mechanical_design_margin: '1.2',
  mechanical_design_margin_source_reference: 'ECR-2 service regression fixture',
  molecularWeights: JSON.stringify(molecularWeights),
  d32Config: JSON.stringify({
    mode: 'engineer_supplied',
    value_m: 0.0005,
    sourceType: 'Assumed',
    sourceReference: 'ECR-2 service regression fixture',
  }),
  bvp: JSON.stringify(bvp),
};

type Service = typeof import('../server/design-software-service');
type DbPool = typeof import('../server/db').pool;

let service: Service;
let pool: DbPool;
let userId: number;
let revisionId: number;
let designId: number;
let acceptedRun: any;
let ecr1Sentinel: any;

async function persistSimulatorInputs(data: Record<string, unknown> = simulatorInputs) {
  await service.upsertInput(revisionId, 'process_design', processDesignInputs, ENGINE_VERSION, userId);
  await service.upsertInput(revisionId, 'ecr_simulator', data, ENGINE_VERSION, userId);
}

describe('ECR-2 simulator service run path', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

    ({ pool } = await import('../server/db'));
    service = await import('../server/design-software-service');
    await import('../server/engines/llx/index');

    const user = await pool.query<{ id: number }>(
      'SELECT id FROM users ORDER BY id LIMIT 1',
    );
    if (!user.rows[0]) throw new Error('No user available for ECR-2 service test fixture');
    userId = user.rows[0].id;

    const created = await service.createDesign({
      moduleType: 'llx',
      designType: 'rnd',
      title: `ECR-2 simulator service regression ${process.pid}-${Date.now()}`,
      createdBy: userId,
    });
    designId = created.id;
    revisionId = created.current_revision_id;

    // This is deliberately an ECR-1-shaped accepted result.  The simulator
    // must never update or replace it while writing its own ecr_simulator row.
    const ecr1 = await pool.query(
      `INSERT INTO design_software_results
         (revision_id, section, data, engine_version, calculation_class, computed_by)
       VALUES ($1, 'ecr', $2, 'ecr-1-fixture', 'Preliminary Screening', $3)
       RETURNING *`,
      [
        revisionId,
        JSON.stringify({
          fixture: 'ECR-1 must remain unchanged',
          calculationRunStatus: 'ecr1_fixture_accepted',
        }),
        userId,
      ],
    );
    ecr1Sentinel = ecr1.rows[0];

    await persistSimulatorInputs();
    await service.acceptAllEcr2Stage8ResolvedValues(revisionId, userId);
  }, 60_000);

  afterAll(async () => {
    if (designId && pool) {
      await pool.query('DELETE FROM design_software_designs WHERE id = $1', [designId]);
    }
    if (pool) await pool.end();
  }, 60_000);

  it('executes from persisted sections and stores a complete accepted run snapshot', async () => {
    const execution = await service.runCalculation(revisionId, 'ecr_simulator', userId);
    acceptedRun = execution.run;

    expect(execution.result.status).toBe('warning');
    expect(acceptedRun.calculation_type).toBe('ecr_simulator');
    expect(acceptedRun.engine_name).toBe('llx-ecr-simulator');
    expect(acceptedRun.calculation_status).toBe('warning');

    const inputSnapshot = acceptedRun.input_snapshot;
    const resultSnapshot = acceptedRun.result_snapshot;
    expect(inputSnapshot.operatingTemperatureC).toBe(70);
    expect(inputSnapshot.phaseConfiguration).toBe('nmp_continuous_rrbo_dispersed');
    expect(inputSnapshot.bvp).toMatchObject({
      rrboGradeId: 'rrbo-sn300',
      partitionBasis: { basis: 'K_d_concentration' },
    });
    expect(inputSnapshot.columnDiameterTrials_m).toBeUndefined();
    expect(inputSnapshot.governedPsi_W_kg).toBeUndefined();
    expect(resultSnapshot.calculationRunStatus).toBe('counter_current_bvp_accepted');
    expect(resultSnapshot.geometry).toMatchObject({
      nCompartments: 1,
      columnDiameter_m: 0.3,
    });
    expect(resultSnapshot.diameterSizing).toMatchObject({
      method: 'engine_generated_independent_progressive_bvp_trials',
      selectedDiameter_m: null,
      selectionStatus: 'NOT_SELECTED_BY_SIMULATOR',
      trialCount: 5,
      processSizingBasis: {
        id: 'ecr2_preliminary_process_sizing_basis_v1',
        status: 'PRELIMINARY_DEFAULT',
        governedPsi_W_kg: 0.1,
      },
    });
    expect(resultSnapshot.diameterSizing.trials).toHaveLength(5);
    expect(resultSnapshot.diameterSizing.trials.map((trial: any) => trial.diameter_m)).toEqual([0.3, 0.45, 0.6, 0.8, 1]);
    for (const trial of resultSnapshot.diameterSizing.trials) {
      expect(trial.governedPsi_W_kg).toBeCloseTo(0.1, 12);
      expect(trial.powerPerVolume_W_m3).toBeCloseTo(trial.rhoMix_kg_m3 * 0.1, 10);
      expect(trial.governance).toMatchObject({
        releaseStatus: 'NOT_RELEASE_ELIGIBLE',
        diameterSelection: 'NOT_SELECTED_BY_SIMULATOR',
      });
    }
    expect(resultSnapshot.bvp.status).toBe('converged');
    expect(resultSnapshot.bvp.massBalanceStatus).toBe('passed');
    expect(resultSnapshot.transferStatus).toMatchObject({
      status: 'LOCAL_PRELIMINARY_CALCULATED',
      governedValues: 'UNAVAILABLE',
      releaseStatus: 'NOT_RELEASE_ELIGIBLE',
    });
    expect(resultSnapshot.dependencyGraph.transferStatus).toMatchObject({
      status: 'LOCAL_PRELIMINARY_CALCULATED',
      releaseStatus: 'NOT_RELEASE_ELIGIBLE',
    });
    expect(resultSnapshot.bvp.componentBalances_kg_h).toHaveLength(5);
    expect(resultSnapshot.bvp.totalMassBalance_kg_h).toBeCloseTo(0, 8);
    expect(resultSnapshot.headlineEngineeringResults).toMatchObject({
      status: 'CALCULATED_PRELIMINARY',
      releaseStatus: 'NOT_RELEASE_ELIGIBLE',
      rrboNmpFeed: {
        rrbo_kg_h: expect.any(Number),
        nmp_kg_h: expect.any(Number),
        soRatio_mass: expect.any(Number),
      },
      rrboRecovery_percent: expect.closeTo(100, 8),
      extractOilYield_percent: expect.closeTo(0, 8),
      totalAromaticRemoval_percent: expect.closeTo(0, 8),
      sulfurDbtPrediction: 'NOT_IMPLEMENTED',
      sulfurDbtPredictionNote: expect.stringContaining('must not be interpreted'),
      productQualityBasis: {
        raffinate: expect.stringContaining('Hydrocarbon-only'),
      },
    });
    expect(resultSnapshot.headlineEngineeringResults.componentPerformance).toMatchObject({
      saturates: {
        raffinateRecovery_percent: expect.closeTo(100, 8),
        removal_percent: expect.closeTo(0, 8),
      },
      nmp: {
        extractRecovery_percent: expect.closeTo(100, 8),
      },
    });
    expect(resultSnapshot.massBalanceSummary).toMatchObject({
      componentOrder: ['Sat', 'Mono', 'Di', 'Poly', 'NMP'],
      status: 'passed',
      feed_kg_h: expect.any(Array),
      raffinate_kg_h: expect.any(Array),
      extract_kg_h: expect.any(Array),
    });
    expect(resultSnapshot.bvp.axialProfile[0]).toMatchObject({
      k_c_m_s: expect.any(Array),
      k_d_m_s: expect.any(Array),
      K_overall_m_s: expect.any(Array),
      Koa_per_s: expect.any(Array),
      drivingForce_kg_m3: expect.any(Array),
      transferRate_kg_m3_s: expect.any(Array),
    });

    const accepted = await service.listResults(revisionId);
    const simulatorResult = accepted.find((row: any) => row.section === 'ecr_simulator');
    expect(simulatorResult?.data).toMatchObject({
      calculationRunStatus: 'counter_current_bvp_accepted',
    });
  });

  it('ignores legacy manual diameter and ψ values so they cannot alter the generated ECR-2 search', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      ...processDesignInputs,
      ...simulatorInputs,
      column_diameter_trials_m: '0.2523, malformed',
      governed_psi_w_kg: '999',
    }, 'ecr_simulator');
    expect(mapped.columnDiameterTrials_m).toBeUndefined();
    expect(mapped.columnDiameter_m).toBeUndefined();
    expect(mapped.governedPsi_W_kg).toBeUndefined();
  });

  it('persists a structured dependency-blocked snapshot when BVP inputs are missing', async () => {
    await persistSimulatorInputs({ ...simulatorInputs, bvp: null, d32Config: null });
    await service.acceptAllEcr2Stage8ResolvedValues(revisionId, userId);

    const execution = await service.runCalculation(revisionId, 'ecr_simulator', userId);
    const snapshot = execution.run.result_snapshot;

    expect(execution.result.status).toBe('error');
    expect(execution.run.calculation_status).toBe('error');
    expect(snapshot.calculationRunStatus).toBe('counter_current_bvp_not_accepted');
    expect(snapshot.bvp.massBalanceStatus).toBe('not_evaluated');
    expect(snapshot.bvp.status).not.toBe('converged');
    expect(snapshot.headlineEngineeringResults).toMatchObject({
      status: 'NOT_CALCULABLE',
      raffinateFlow_kg_h: null,
      rrboRecovery_percent: null,
      totalAromaticRemoval_percent: null,
    });

    const accepted = await service.listResults(revisionId);
    const simulatorResult = accepted.find((row: any) => row.section === 'ecr_simulator');
    expect(simulatorResult?.data.calculationRunStatus).toBe('counter_current_bvp_accepted');

    await persistSimulatorInputs();
    await service.acceptAllEcr2Stage8ResolvedValues(revisionId, userId);
  });

  it('never accepts a simulator result whose BVP mass balance fails', async () => {
    if (!acceptedRun) {
      acceptedRun = (await service.runCalculation(revisionId, 'ecr_simulator', userId)).run;
    }

    const deliberatelyImbalancedPriorState = acceptedRun.result_snapshot.bvp.stateVector
      .map((value: number) => value * 0.99);

    await persistSimulatorInputs({
      ...simulatorInputs,
      bvp: JSON.stringify({
        ...bvp,
        solverOptions: {
          transferStrength: 0,
          maxIterations: 1,
          maxFunctionEvaluations: 1,
        },
        previousSolution: deliberatelyImbalancedPriorState,
      }),
    });
    await service.acceptAllEcr2Stage8ResolvedValues(revisionId, userId);

    const execution = await service.runCalculation(revisionId, 'ecr_simulator', userId);
    const snapshot = execution.run.result_snapshot;

    expect(execution.result.status).toBe('error');
    expect(execution.run.calculation_status).toBe('error');
    expect(snapshot.calculationRunStatus).toBe('counter_current_bvp_not_accepted');
    // A failed lower physical-height solve is intentionally retained as a
    // NOT_CALCULATED blocked snapshot; no unaccepted BVP state is promoted as
    // a valid mass-balance result.
    expect(snapshot.bvp.massBalanceStatus).toBe('not_evaluated');
    expect(snapshot.bvp.status).not.toBe('converged');

    const accepted = await service.listResults(revisionId);
    const simulatorResult = accepted.find((row: any) => row.section === 'ecr_simulator');
    expect(simulatorResult?.data.calculationRunStatus).toBe('counter_current_bvp_accepted');
  });

  it('leaves the accepted ECR-1 result unchanged after simulator execution', async () => {
    const after = await pool.query(
      `SELECT * FROM design_software_results
       WHERE revision_id = $1 AND section = 'ecr'`,
      [revisionId],
    );

    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].id).toBe(ecr1Sentinel.id);
    expect(after.rows[0].data).toEqual(ecr1Sentinel.data);
    expect(after.rows[0].engine_version).toBe(ecr1Sentinel.engine_version);
  });
});
