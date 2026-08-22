import { describe, expect, it } from 'vitest';
import {
  ECR2_STAGE8_COMPONENTS,
  validateEcr2Stage8,
} from '../client/src/lib/ecr2-stage8-validation';
import {
  ecr2Stage8EvidenceFingerprint,
  findEcr2Stage8Evidence,
} from '../shared/ecr2-stage8-evidence';
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
    partition_basis_approved_by: 'Test Engineer',
    partition_basis_approved_at: '2026-08-22T10:00',
  };

  for (const component of ECR2_STAGE8_COMPONENTS.slice(0, 4)) {
    const prefix = `molecular_weight_${component.key}`;
    sim[`${prefix}_value`] = '250';
    sim[`${prefix}_source_type`] = 'Assumed';
    sim[`${prefix}_source_reference`] = 'Approved physical surrogate basis';
    sim[`${prefix}_evidence_status`] = 'ACCEPTED_AUTO_BASIS';
    sim[`${prefix}_original_evidence`] = 'Accepted controlled evidence record';
  }
  for (const component of ECR2_STAGE8_COMPONENTS) {
    for (const phase of ['c', 'd']) {
      const prefix = `diffusivity_${component.key}_${phase}`;
      sim[`${prefix}_value`] = '0.000000001';
      sim[`${prefix}_source_type`] = 'Literature';
      sim[`${prefix}_source_reference`] = 'Approved diffusivity record';
      sim[`${prefix}_reference_temperature_c`] = '60';
      sim[`${prefix}_method`] = 'Engineer-reviewed source value';
      sim[`${prefix}_evidence_status`] = 'ACCEPTED_AUTO_BASIS';
      sim[`${prefix}_original_evidence`] = 'Accepted controlled evidence record';
    }
  }
  sim.kuhni_shd_c2_evidence_status = 'ACCEPTED_AUTO_BASIS';
  sim.kuhni_shd_c2_original_evidence = 'Accepted controlled evidence record';
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

  it('requires auditable approver and timestamp metadata for the separate Kd approval row', () => {
    const withoutAudit = completeStage8();
    delete withoutAudit.partition_basis_approved_by;
    delete withoutAudit.partition_basis_approved_at;
    const errors = validateEcr2Stage8(withoutAudit, true);
    expect(errors).toHaveProperty('partition_basis_approved_by');
    expect(errors).toHaveProperty('partition_basis_approved_at');
  });

  it('blocks a calculated record until the engineer accepts its evidence basis or overrides it', () => {
    const pending = {
      ...completeStage8(),
      diffusivity_sat_c_evidence_status: 'AUTO_RESOLVED_PENDING_ACCEPTANCE',
    };
    expect(validateEcr2Stage8(pending, true)).toHaveProperty('diffusivity_sat_c_evidence_status');
    expect(validateEcr2Stage8({
      ...pending,
      diffusivity_sat_c_evidence_status: 'ENGINEER_OVERRIDE',
      diffusivity_sat_c_original_evidence: 'original correlation evidence retained',
      diffusivity_sat_c_override_reason: 'Controlled engineering exception',
      diffusivity_sat_c_override_user: '23',
      diffusivity_sat_c_override_at: '2026-08-22T10:00:00.000Z',
    }, true)).not.toHaveProperty('diffusivity_sat_c_evidence_status');
  });

  it('treats an exact accepted server candidate as a complete diffusivity without duplicate manual fields', () => {
    const sim = completeStage8();
    const prefix = 'diffusivity_sat_c';
    delete sim[`${prefix}_value`];
    delete sim[`${prefix}_source_type`];
    delete sim[`${prefix}_source_reference`];
    delete sim[`${prefix}_reference_temperature_c`];
    delete sim[`${prefix}_method`];
    const candidate = {
      ...findEcr2Stage8Evidence('diffusivity_sat_c'),
      status: 'CALCULATED_PRELIMINARY' as const,
      value: 1.2e-9,
      method: 'Controlled Stage 8 preliminary route',
      inputSnapshot: { temperature_C: 60 },
    };
    const fingerprint = ecr2Stage8EvidenceFingerprint(candidate);
    sim[`${prefix}_original_evidence`] = fingerprint;
    sim[`${prefix}_resolver_fingerprint`] = fingerprint;
    sim[`${prefix}_evidence_status`] = 'ACCEPTED_AUTO_BASIS';

    const errors = validateEcr2Stage8(sim, true, { diffusivity_sat_c: candidate });
    expect(errors).not.toHaveProperty(`${prefix}_value`);
    expect(errors).not.toHaveProperty(`${prefix}_reference_temperature_c`);
    expect(errors).not.toHaveProperty(`${prefix}_method`);
    expect(errors).not.toHaveProperty(`${prefix}_evidence_status`);
  });

  it('requires reason, user, and timestamp for an engineer override', () => {
    const overridden = {
      ...completeStage8(),
      molecular_weight_sat_evidence_status: 'ENGINEER_OVERRIDE',
    };
    expect(validateEcr2Stage8(overridden, true)).toHaveProperty('molecular_weight_sat_evidence_status');

    Object.assign(overridden, {
      molecular_weight_sat_override_reason: 'Characterization evidence supersedes system candidate',
      molecular_weight_sat_override_user: '23',
      molecular_weight_sat_override_at: '2026-08-22T10:00:00.000Z',
    });
    expect(validateEcr2Stage8(overridden, true)).not.toHaveProperty('molecular_weight_sat_evidence_status');
  });
});