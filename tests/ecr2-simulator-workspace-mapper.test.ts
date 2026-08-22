import { describe, expect, it } from 'vitest';

import { mapWorkspaceProcessDesignInputs } from '../server/llx-process-design-input-mapper';

describe('ECR-2 simulator workspace adapter', () => {
  it('uses Stage 4 Extraction Temperature for every Stage 8 resolver even when stale engine-shaped temperatures are present', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      extraction_temperature: '40',
      operating_temperature: '70',
      operatingTemperature: 70,
      operatingTemperatureC: 70,
      feed_service: 'Re-Refined Base Oil SN300',
      design_capacity_lph: '117.6',
      so_ratio: '1.72',
      rrbo_saturates_wt: '50',
      rrbo_mono_aromatics_wt: '30',
      rrbo_di_aromatics_wt: '15',
      rrbo_poly_aromatics_wt: '5',
      rrbo_viscosity_dynamic_value: '52',
      rrbo_viscosity_dynamic_ref_temp: '40',
      interfacial_tension_value: '12',
      interfacial_tension_ref_temp: '70',
      interfacial_tension_source: 'Assumed',
    }, 'ecr_simulator');

    const bvp = mapped.bvp as any;
    expect(mapped.operatingTemperature).toBe(40);
    expect(mapped.operatingTemperatureC).toBe(40);
    expect(mapped.extractionTemperature).toBe(40);
    expect(mapped.operatingTemperatureProvenance).toContain('Stage 4 Extraction Temperature');
    expect((mapped.feedDensity as any).referenceTemperatureC).toBe(40);
    expect((mapped.interfacialTension as any).referenceTemperatureC).toBe(70);
    expect(bvp.stage8Resolution.operatingTemperature_C).toBe(40);
    expect(bvp.stage8Resolution.records.diffusivity_sat_c.inputSnapshot.temperature_C).toBe(40);
    expect(bvp.diffusivity.Sat.De_c.referenceTemperature_C).toBe(40);
  });

  it('propagates the source-tagged sigma temperature coefficient without inventing one', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      extraction_temperature: '70',
      feed_service: 'Re-Refined Base Oil SN300',
      interfacial_tension_value: '14',
      interfacial_tension_ref_temp: '40',
      interfacial_tension_source: 'Measured',
      interfacial_tension_source_reference: 'RRBO/NMP IFT laboratory series',
      interfacial_tension_temperature_coefficient: '-0.03',
      interfacial_tension_temperature_coefficient_source: 'Literature',
      interfacial_tension_temperature_coefficient_source_reference: 'Approved IFT temperature coefficient memorandum',
    }, 'ecr_simulator');

    expect(mapped.interfacialTension).toMatchObject({
      value: 0.014,
      referenceTemperatureC: 40,
      sourceType: 'Measured',
      sourceReference: 'RRBO/NMP IFT laboratory series',
      temperatureCoefficient: {
        sourceType: 'Literature',
        sourceReference: 'Approved IFT temperature coefficient memorandum',
      },
    });
    expect((mapped.interfacialTension as any).temperatureCoefficient.slopePerC)
      .toBeCloseTo(-0.00003, 12);
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

  it('strips retired Kühni Shd C2 values from legacy flat, nested evidence, and resolver payloads', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      feed_service: 'Uncharacterized Re-Refined Oil',
      rrboFluidId: 'rrbo-sn300',
      operating_temperature: '60',
      kuhni_shd_c2_value: '4.33',
      kuhni_shd_c2_source_type: 'Literature',
      kuhni_shd_c2_source_reference: 'pulsed column only',
      bvp: JSON.stringify({
        kuhniShdC2: {
          value: 4.33,
          sourceType: 'Literature',
          sourceReference: 'pulsed column only',
          scope: 'kuhni_shd_preliminary',
        },
        stage8Evidence: {
          kuhni_shd_c2: { status: 'ACCEPTED_AUTO_BASIS', value: 4.33 },
        },
        stage8Resolution: {
          records: {
            kuhni_shd_c2: { status: 'ACCEPTED_AUTO_BASIS', value: 4.33 },
          },
        },
      }),
    }, 'ecr_simulator');
    const bvp = mapped.bvp as any;

    expect(bvp).not.toHaveProperty('kuhniShdC2');
    expect(bvp.stage8Evidence).not.toHaveProperty('kuhni_shd_c2');
    expect(bvp.stage8Resolution.records).not.toHaveProperty('kuhni_shd_c2');
    expect(mapped).not.toHaveProperty('kuhni_shd_c2_value');
  });
});