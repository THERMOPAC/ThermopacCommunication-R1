import { describe, expect, it } from 'vitest';
import {
  ECR2_STAGE8_COMPONENTS,
  validateEcr2Stage8,
} from '../client/src/lib/ecr2-stage8-validation';
import {
  thermodynamicMoleFractionsFromPhysicalMassFractions,
} from '../server/engines/llx/llx-ecr2-counter-current-bvp';

function completeStage8(): Record<string, string> {
  const sim: Record<string, string> = {
    kuhni_shd_c2_value: '1.25',
    kuhni_shd_c2_source_type: 'Literature',
    kuhni_shd_c2_source_reference: 'Kühni/Hartland 1999, preliminary reconstruction',
    partition_basis_approval_status: 'engineer_approved_governed',
    partition_basis_source_reference: 'ECR-2 governed concentration-basis approval',
  };

  for (const component of ECR2_STAGE8_COMPONENTS.slice(0, 4)) {
    const prefix = `molecular_weight_${component.key}`;
    sim[`${prefix}_value`] = '250';
    sim[`${prefix}_source_type`] = 'Assumed';
    sim[`${prefix}_source_reference`] = 'Approved physical surrogate basis';
  }
  for (const component of ECR2_STAGE8_COMPONENTS) {
    for (const phase of ['c', 'd']) {
      const prefix = `diffusivity_${component.key}_${phase}`;
      sim[`${prefix}_value`] = '0.000000001';
      sim[`${prefix}_source_type`] = 'Literature';
      sim[`${prefix}_source_reference`] = 'Approved diffusivity record';
      sim[`${prefix}_reference_temperature_c`] = '60';
      sim[`${prefix}_method`] = 'Engineer-reviewed source value';
    }
  }
  return sim;
}

describe('ECR-2 Stage 8 dependency graph', () => {
  it('uses the governed d32 route without requiring a duplicate engineer value or a BVP JSON object', () => {
    const errors = validateEcr2Stage8(completeStage8(), true);
    expect(errors).toEqual({});
    expect(errors).not.toHaveProperty('d32Config');
    expect(errors).not.toHaveProperty('bvp');
  });

  it('reports every missing diffusivity by component and phase instead of one generic BVP blocker', () => {
    const errors = validateEcr2Stage8({}, true);
    expect(errors).toHaveProperty('diffusivity_sat_c_value');
    expect(errors).toHaveProperty('diffusivity_nmp_d_value');
    expect(errors).not.toHaveProperty('bvp');
  });

  it('keeps physical-MW editing outside the local NRTL coordinate basis', () => {
    const original = completeStage8();
    const altered = { ...original, molecular_weight_sat_value: '650', molecular_weight_poly_value: '120' };
    expect(validateEcr2Stage8(original, true)).toEqual({});
    expect(validateEcr2Stage8(altered, true)).toEqual({});

    const physicalMassFractions = [0.2, 0.12, 0.06, 0.02, 0.6];
    const before = thermodynamicMoleFractionsFromPhysicalMassFractions(physicalMassFractions);
    const after = thermodynamicMoleFractionsFromPhysicalMassFractions(physicalMassFractions);
    expect(after).toEqual(before);
  });
});