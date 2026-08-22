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
    expect(mapped.bvp).not.toHaveProperty('kuhniShdC2');
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

  it('derives Stage 8 evidence server-side and strips the retired C2 snapshot path', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      molecular_weight_sat_value: '330',
      molecular_weight_sat_source_type: 'Literature',
      molecular_weight_sat_source_reference: 'RRBO characterization',
      molecular_weight_sat_evidence_status: 'ENGINEER_OVERRIDE',
      diffusivity_sat_c_value: '0.000000001',
      diffusivity_sat_c_source_type: 'Literature',
      diffusivity_sat_c_source_reference: 'Wilke-Chang evidence',
      diffusivity_sat_c_reference_temperature_c: '70',
      diffusivity_sat_c_method: 'Wilke-Chang (1955)',
      bvp: JSON.stringify({
        kuhniShdC2: { value: 1.2, sourceType: 'Literature', sourceReference: 'retired input', scope: 'kuhni_shd_preliminary' },
      }),
      partition_basis_approval_status: 'engineer_approved_governed',
      partition_basis_source_reference: 'Governing relation review',
      partition_basis_approved_by: 'A. Engineer',
      partition_basis_approved_at: '2026-08-22T10:00',
    }, 'ecr_simulator');

    expect(mapped.molecularWeights).toMatchObject({
      saturates_g_mol: {
        evidenceStatus: 'ENGINEER_OVERRIDE',
      },
    });
    expect(mapped.bvp).toMatchObject({
      stage8Evidence: {
        diffusivity_sat_c: {
          status: 'BLOCKED_MISSING_REQUIRED_EVIDENCE',
        },
      },
      partitionBasis: {
        approvedBy: 'A. Engineer',
        approvedAt: '2026-08-22T10:00',
      },
    });
    expect(mapped.bvp).not.toHaveProperty('kuhniShdC2');
  });

  it('auto-calculates all ten preliminary SN300 diffusivities from server-owned operating-temperature bases', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      feed_service: 'Re-Refined Base Oil SN300',
      operating_temperature: '60',
      rrbo_saturates_wt: '50',
      rrbo_mono_aromatics_wt: '30',
      rrbo_di_aromatics_wt: '15',
      rrbo_poly_aromatics_wt: '5',
    }, 'ecr_simulator');
    const evidence = (mapped.bvp as any).stage8Evidence;
    const resolution = (mapped.bvp as any).stage8Resolution;
    expect(Object.keys(evidence)).toHaveLength(14);
    expect(evidence.physical_mw_sat.status).toBe('AUTO_RESOLVED_PENDING_ACCEPTANCE');
    expect(evidence.physical_mw_sat).toMatchObject({
      value: 269.93,
      evidenceLevel: 'ENGINEER_APPROVED_PRELIMINARY',
    });
    expect(evidence.diffusivity_sat_c.status).toBe('CALCULATED_PRELIMINARY');
    expect(evidence.diffusivity_sat_d.status).toBe('CALCULATED_PRELIMINARY');
    expect(evidence.diffusivity_nmp_c.status).toBe('CALCULATED_PRELIMINARY');
    expect(evidence.diffusivity_nmp_d.status).toBe('CALCULATED_PRELIMINARY');
    expect(resolution).toMatchObject({
      resolver: 'ecr2-stage8-governed-resolver-v1',
      operatingTemperature_C: 60,
      autoPopulatedCount: 14,
      unresolvedCount: 0,
    });
    expect(resolution.records.diffusivity_sat_c).toMatchObject({
      unit: 'm2/s',
      status: 'CALCULATED_PRELIMINARY',
      validatedForRRBONMP: false,
      pilotCalibrationStatus: 'NOT_YET_VALIDATED',
    });
    expect(resolution.records.diffusivity_sat_c.inputSnapshot).toMatchObject({
      temperature_C: 60,
      solventMolecularWeight_g_mol: 99.13,
    });
    expect(resolution.records.diffusivity_sat_d.inputSnapshot).toMatchObject({
      temperature_C: 60,
    });
  });

  it('normalizes a normally rounded 99.9999% SN300 composition before resolving the RRBO-rich diffusivities', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      feed_service: 'Re-Refined Base Oil SN300',
      operating_temperature: '70',
      rrbo_saturates_wt: '75',
      rrbo_mono_aromatics_wt: '8.3333',
      rrbo_di_aromatics_wt: '8.3333',
      rrbo_poly_aromatics_wt: '8.3333',
    }, 'ecr_simulator');
    const resolution = (mapped.bvp as any).stage8Resolution;

    expect(resolution.autoPopulatedCount).toBe(14);
    expect(resolution.unresolvedCount).toBe(0);
    expect(resolution.records.diffusivity_sat_d.status).toBe('CALCULATED_PRELIMINARY');
    expect(resolution.records.diffusivity_nmp_d.status).toBe('CALCULATED_PRELIMINARY');
  });

  it('does not let the SN300 preliminary family basis leak to another RRBO grade', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      feed_service: 'Re-Refined Base Oil SN500',
      operating_temperature: '60',
    }, 'ecr_simulator');
    const resolution = (mapped.bvp as any).stage8Resolution;

    expect(resolution.records.physical_mw_sat.status).toBe('BLOCKED_MISSING_REQUIRED_EVIDENCE');
    expect(resolution.autoPopulatedCount).toBe(0);
  });

  it('fails closed when a client-carried RRBO fluid ID conflicts with the governed Feed Service', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      feed_service: 'Re-Refined Base Oil SN500',
      rrboFluidId: 'rrbo-sn300',
      operating_temperature: '60',
    }, 'ecr_simulator');
    const resolution = (mapped.bvp as any).stage8Resolution;

    expect(resolution.records.physical_mw_sat.status).toBe('BLOCKED_MISSING_REQUIRED_EVIDENCE');
    expect(resolution.autoPopulatedCount).toBe(0);
  });

  it('fails closed for an unrecognized Feed Service rather than defaulting to SN300 physical properties', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      feed_service: 'Uncharacterized Re-Refined Oil',
      rrboFluidId: 'rrbo-sn300',
      operating_temperature: '60',
    }, 'ecr_simulator');
    const resolution = (mapped.bvp as any).stage8Resolution;

    expect(resolution.records.physical_mw_sat.status).toBe('BLOCKED_MISSING_REQUIRED_EVIDENCE');
    expect(resolution.autoPopulatedCount).toBe(0);
  });
});
