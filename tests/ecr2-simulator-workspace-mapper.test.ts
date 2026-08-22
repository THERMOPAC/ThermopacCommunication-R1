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
      nmp_purity_value: '99.5',
      column_diameter: '0.5',
      compartment_height: '0.25',
      rotor_ratio: '0.5',
      rotor_speed: '150',
      rotor_type: 'Kühni turbine',
      ecr_active_height_m: '1',
      activeHeight_m: '9',
      power_number: '1.2',
      stator_open_area_fraction: '0.5',
      shaft_efficiency: '80',
      mechanical_design_margin: '1.2',
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

  it('normalizes a simulator-section NMP purity percentage to an engine mass fraction', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      nmpPurity: '99.5',
    }, 'ecr_simulator');

    expect(mapped.nmpPurity).toBe(0.995);
  });

  it('does not let a blank Stage 7 rotor label suppress the identification fallback', () => {
    const mapped = mapWorkspaceProcessDesignInputs({}, 'ecr_simulator');

    expect(mapped.rotorType).toBe('Kühni turbine (default label)');
  });

  it('derives Stage 8 evidence server-side and preserves an auditable override in the engine snapshot', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      __stage8_actor_id: '3',
      __stage8_server_timestamp: '2026-08-22T10:00:00.000Z',
      molecular_weight_sat_value: '330',
      molecular_weight_sat_source_type: 'Literature',
      molecular_weight_sat_source_reference: 'RRBO characterization',
      molecular_weight_sat_evidence_status: 'ENGINEER_OVERRIDE',
      molecular_weight_sat_original_evidence: 'original record',
      molecular_weight_sat_override_reason: 'Approved engineering exception',
      molecular_weight_sat_override_user: '3',
      molecular_weight_sat_override_at: '2026-08-22T10:00:00.000Z',
      diffusivity_sat_c_value: '0.000000001',
      diffusivity_sat_c_source_type: 'Literature',
      diffusivity_sat_c_source_reference: 'Wilke-Chang evidence',
      diffusivity_sat_c_reference_temperature_c: '70',
      diffusivity_sat_c_method: 'Wilke-Chang (1955)',
      diffusivity_sat_c_evidence_status: 'ACCEPTED_AUTO_BASIS',
      diffusivity_sat_c_original_evidence: 'resolved at 70 C',
      kuhni_shd_c2_value: '1.2',
      kuhni_shd_c2_source_type: 'Literature',
      kuhni_shd_c2_source_reference: 'Scoped Kühni evidence',
      kuhni_shd_c2_evidence_status: 'ENGINEER_OVERRIDE',
      kuhni_shd_c2_original_evidence: 'approval candidate',
      kuhni_shd_c2_override_reason: 'Approved engineering exception',
      kuhni_shd_c2_override_user: '3',
      kuhni_shd_c2_override_at: '2026-08-22T10:00:00.000Z',
      partition_basis_approval_status: 'engineer_approved_governed',
      partition_basis_source_reference: 'Governing relation review',
      partition_basis_approved_by: 'A. Engineer',
      partition_basis_approved_at: '2026-08-22T10:00',
    }, 'ecr_simulator');

    expect(mapped.molecularWeights).toMatchObject({
      saturates_g_mol: {
        evidenceStatus: 'ENGINEER_OVERRIDE',
        originalEvidence: expect.stringContaining('"id":"physical_mw_sat"'),
      },
    });
    expect(mapped.bvp).toMatchObject({
      stage8Evidence: {
        diffusivity_sat_c: {
          status: 'BLOCKED_MISSING_REQUIRED_EVIDENCE',
          originalEvidence: expect.stringContaining('"id":"diffusivity_sat_c"'),
        },
        kuhni_shd_c2: {
          status: 'ENGINEER_OVERRIDE',
          originalEvidence: expect.stringContaining('"id":"kuhni_shd_c2"'),
          overrideReason: 'Approved engineering exception',
          overrideUser: '3',
          overrideAt: '2026-08-22T10:00:00.000Z',
        },
      },
      partitionBasis: {
        approvedBy: 'A. Engineer',
        approvedAt: '2026-08-22T10:00',
      },
    });
  });

  it('initializes every unmapped Stage 8 evidence record to its catalog blocking state', () => {
    const mapped = mapWorkspaceProcessDesignInputs({ operating_temperature: '60' }, 'ecr_simulator');
    const evidence = (mapped.bvp as any).stage8Evidence;
    const resolution = (mapped.bvp as any).stage8Resolution;
    expect(Object.keys(evidence)).toHaveLength(15);
    expect(evidence.physical_mw_sat.status).toBe('BLOCKED_MISSING_REQUIRED_EVIDENCE');
    expect(evidence.diffusivity_sat_c.status).toBe('BLOCKED_MISSING_REQUIRED_EVIDENCE');
    expect(evidence.kuhni_shd_c2.status).toBe('APPROVAL_REQUIRED');
    expect(resolution).toMatchObject({
      resolver: 'ecr2-stage8-governed-resolver-v1',
      operatingTemperature_C: 60,
      autoPopulatedCount: 0,
      unresolvedCount: 15,
    });
    // The mapper did evaluate the governed NMP viscosity route, so the
    // remaining continuous-phase gap begins at NMP MW/association and the
    // physical solute characterization — not a fabricated temperature value.
    expect(resolution.records.diffusivity_sat_c.blockingReason).toContain('NMP molecular weight');
  });
});