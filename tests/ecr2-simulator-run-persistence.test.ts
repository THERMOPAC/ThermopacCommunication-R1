import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, engine, engineRegistry } = vi.hoisted(() => {
  const query = vi.fn();
  const engine = {
    validate: vi.fn(),
    calculate: vi.fn(),
    getEngineId: vi.fn(() => 'llx-ecr-simulator'),
    getEngineVersion: vi.fn(() => '2.1.0'),
  };
  const engineRegistry = {
    get: vi.fn(() => engine),
    getOrThrow: vi.fn(() => engine),
  };
  return { query, engine, engineRegistry };
});

vi.mock('../server/db', () => ({ pool: { query } }));
vi.mock('../server/engine-framework/registry', () => ({ engineRegistry }));

import { previewEcr2Stage8Resolution, runCalculation } from '../server/design-software-service';

const flatSimulatorInput = {
  operating_temperature: '70',
  design_capacity_lph: '1000',
  feed_service: 'Re-Refined Base Oil SN300',
  so_ratio: '2',
  rrbo_saturates_wt: '50',
  rrbo_mono_aromatics_wt: '30',
  rrbo_di_aromatics_wt: '15',
  rrbo_poly_aromatics_wt: '5',
  solvent_nmp_mole_fraction: '1',
  column_diameter: '0.5',
  compartment_height: '0.25',
  rotor_ratio: '0.5',
  rotor_speed: '150',
  activeHeight_m: '1',
  power_number: '1.2',
  stator_open_area_fraction: '0.5',
  shaft_efficiency: '80',
  mechanical_design_margin: '1.2',
  molecularWeights: JSON.stringify({
    saturates_g_mol: { value: 330, sourceType: 'Assumed', sourceReference: 'test' },
  }),
  d32Config: JSON.stringify({
    mode: 'engineer_supplied',
    value_m: 0.0005,
    sourceType: 'Assumed',
    sourceReference: 'test',
  }),
  bvp: JSON.stringify({
    rrboGradeId: 'rrbo-sn300',
  }),
};

function configureDatabase(resultData: Record<string, unknown> = { bvp: { status: 'converged' } }) {
  query.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (text.includes('FROM design_software_revisions')) {
      return { rows: [{ id: 7, design_id: 11, module_type: 'llx', status: 'draft', is_frozen: false }] };
    }
    if (text.includes('SELECT section, data FROM design_software_inputs')) {
      return { rows: [{ section: 'ecr_simulator', data: flatSimulatorInput }] };
    }
    if (text.includes('FROM design_selection_records')) {
      return { rows: [] };
    }
    if (text.includes('FROM design_software_results') && text.includes("section = 'hydraulics_common'")) {
      return { rows: [] };
    }
    if (text.includes('FROM design_software_results') && text.includes("section = 'ecr'")) {
      return {
        rows: [{
          data: {
            heightBreakdown: {
              activeAgitatedHeight: { result: 1 },
            },
          },
        }],
      };
    }
    if (text.includes('FROM design_software_results') && text.includes("section = 'process_design'")) {
      return { rows: [] };
    }
    if (text.includes('FROM design_software_inputs') && text.includes("section = 'process_design'")) {
      return { rows: [] };
    }
    if (text.includes('INSERT INTO design_software_calculation_runs')) {
      return { rows: [{ id: 101, calculation_type: 'ecr_simulator', calculation_status: 'success' }] };
    }
    if (text.includes('INSERT INTO design_software_results')) {
      return { rows: [{ revision_id: 7, section: 'ecr_simulator', data: resultData }] };
    }
    throw new Error(`Unexpected SQL in test: ${text}`);
  });
}

describe('ECR-2 simulator service run boundary', () => {
  beforeEach(() => {
    query.mockReset();
    engine.validate.mockReset();
    engine.calculate.mockReset();
    engineRegistry.get.mockClear();
    engineRegistry.getOrThrow.mockClear();
  });

  it('normalizes the flat UI payload and persists an accepted simulator snapshot', async () => {
    configureDatabase({ bvp: { status: 'converged', massBalanceStatus: 'passed' } });
    engine.validate.mockReturnValue({ errors: [] });
    engine.calculate.mockResolvedValue({
      status: 'success',
      data: { bvp: { status: 'converged', massBalanceStatus: 'passed' } },
      warnings: [],
      validationIssues: [],
      calculationClass: 'Preliminary Screening',
      engineId: 'llx-ecr-simulator',
      engineVersion: '2.1.0',
      computedAt: new Date(),
    });

    const result = await runCalculation(7, 'ecr_simulator', 3);
    const engineInput = engine.validate.mock.calls[0][0];

    expect(engineRegistry.get).toHaveBeenCalledWith('llx', 'ecr_simulator');
    expect(engineInput.activeHeight_m).toBe(1);
    expect(engineInput.powerNumber).toMatchObject({ value: 1.2 });
    expect(engineInput.d32Config).toMatchObject({ mode: 'engineer_supplied', value_m: 0.0005 });
    expect(engineInput.bvp).toMatchObject({ rrboGradeId: 'rrbo-sn300' });
    expect(engine.calculate).toHaveBeenCalledOnce();
    expect(result.run.calculation_type).toBe('ecr_simulator');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO design_software_results'))).toBe(true);
  });

  it('always persists a blocked/error run but does not replace the accepted result', async () => {
    configureDatabase();
    engine.validate.mockReturnValue({
      errors: [{ field: 'bvp', message: 'BVP dependency missing', severity: 'error' }],
    });

    const result = await runCalculation(7, 'ecr_simulator', 3);

    expect(result.result.status).toBe('error');
    expect(result.run.calculation_type).toBe('ecr_simulator');
    expect(engine.calculate).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO design_software_calculation_runs'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO design_software_results'))).toBe(false);
  });

  it('previews the current Stage 8 candidates without creating a calculation run', async () => {
    configureDatabase();

    const preview = await previewEcr2Stage8Resolution(7) as any;

    expect(preview).toMatchObject({
      resolver: 'ecr2-stage8-governed-resolver-v1',
      autoPopulatedCount: 14,
      unresolvedCount: 0,
    });
    expect(preview.records.diffusivity_sat_c.status).toBe('CALCULATED_PRELIMINARY');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO design_software_calculation_runs'))).toBe(false);
  });
});