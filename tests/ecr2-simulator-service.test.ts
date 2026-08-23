// ECR-2 simulator service/database regression coverage.
//
// These tests intentionally use the persisted workspace sections and the
// service's runCalculation path.  Engine-only tests cannot catch a missing
// input snapshot, an incorrectly promoted result, or ECR-1 cross-contamination.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
  design_capacity_lph: '117.6',
  feed_service: 'Re-Refined Base Oil SN300',
  so_ratio: '1.72',
  rrbo_saturates_wt: '50',
  rrbo_mono_aromatics_wt: '30',
  rrbo_di_aromatics_wt: '15',
  rrbo_poly_aromatics_wt: '5',
  solvent_nmp_mole_fraction: '1',
  rrbo_viscosity_dynamic_value: '52',
  rrbo_viscosity_dynamic_ref_temp: '40',
  rrbo_viscosity_dynamic_source: 'Assumed',
  interfacial_tension_value: '12',
  interfacial_tension_ref_temp: '70',
  interfacial_tension_source: 'Assumed',
};

const simulatorInputs = {
  column_diameter: '0.2523',
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
    expect(resultSnapshot.calculationRunStatus).toBe('counter_current_bvp_accepted');
    expect(resultSnapshot.geometry).toMatchObject({
      nCompartments: 1,
      columnDiameter_m: 0.2523,
    });
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
    expect(snapshot.bvp.massBalanceStatus).toBe('failed');
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
