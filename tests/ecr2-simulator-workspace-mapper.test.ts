import { describe, expect, it } from 'vitest';

import { mapWorkspaceProcessDesignInputs } from '../server/llx-process-design-input-mapper';

describe('ECR-2 simulator workspace adapter', () => {
  it('inherits upstream process data and keeps simulator-only BVP activation explicit', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      operating_temperature: '70',
      design_capacity_lph: '1000',
      feed_service: 'Re-Refined Base Oil SN300',
      so_ratio: '2',
      rrbo_saturates_wt: '50',
      rrbo_mono_aromatics_wt: '30',
      rrbo_di_aromatics_wt: '15',
      rrbo_poly_aromatics_wt: '5',
      nmp_purity: '99.5',
      column_diameter: '0.5',
      compartment_height: '0.25',
      rotor_ratio: '0.5',
      rotor_speed: '150',
      rotor_type: 'Kühni turbine',
      activeHeight_m: '1',
      powerNumber: '1.2',
      statorOpenAreaFraction: '0.5',
      shaftEfficiency: '0.8',
      mechanicalDesignMargin: '1.2',
      molecularWeights: JSON.stringify({
          saturates_g_mol: { value: 330, sourceType: 'Assumed', sourceReference: 'test' },
      }),
      d32Config: JSON.stringify({
          mode: 'engineer_supplied', value_m: 0.0005, sourceType: 'Assumed', sourceReference: 'test',
      }),
      bvp: JSON.stringify({
          rrboGradeId: 'rrbo-sn300',
          kuhniShdC2: { value: 1.25, sourceType: 'Assumed', sourceReference: 'test', scope: 'kuhni_shd_preliminary' },
      }),
    }, 'ecr_simulator');

    expect(mapped.operatingTemperatureC).toBe(70);
    expect(mapped.nmpPurity).toBe(0.995);
    expect(mapped.phaseConfiguration).toBe('nmp_continuous_rrbo_dispersed');
    expect(mapped.feedCompositionMassFraction).toEqual({
      saturates: 0.5, mono: 0.3, di: 0.15, poly: 0.05,
    });
    expect(mapped.columnDiameter_m).toBe(0.5);
    expect(mapped.activeHeight_m).toBe(1);
    expect(mapped.rotorToColumnDiameterRatio).toBe(0.5);
    expect(mapped.powerNumber).toMatchObject({ value: 1.2 });
    expect(mapped.d32Config).toMatchObject({ mode: 'engineer_supplied', value_m: 0.0005 });
    expect(mapped.bvp).toMatchObject({ rrboGradeId: 'rrbo-sn300' });
  });
});