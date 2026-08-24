import { describe, expect, it } from 'vitest';

import { LLXECRSimulatorEngine } from '../server/engines/llx/llx-ecr-simulator-engine';
import { ECR2_RRBO_NMP_SIGMA_CONSTANT_PRELIMINARY_BASIS } from '../shared/ecr2-interfacial-tension-basis';

const tagged = (value: number, unit: string, sourceReference: string) => ({
  value,
  unit,
  sourceType: 'Assumed' as const,
  sourceReference,
});

describe('ECR-2 user-selected sigma temperature resolution', () => {
  it('uses the unchanged 70 °C sigma anchor at a selected 50 °C condition within its governed range', async () => {
    const result = await new LLXECRSimulatorEngine().calculate({
      operatingTemperatureC: 50,
      rrboMassFlow_kg_h: 1000,
      nmpMassFlow_kg_h: 1200,
      feedCompositionMassFraction: { saturates: 0.52, mono: 0.22, di: 0.16, poly: 0.10 },
      nmpPurity: 0.998,
      phaseConfiguration: 'nmp_continuous_rrbo_dispersed',
      columnDiameter_m: 0.6,
      columnDiameterTrials_m: [0.6],
      activeHeight_m: 4,
      compartmentHeight_m: 0.5,
      rotorToColumnDiameterRatio: 0.5,
      rotorSpeed_rpm: 150,
      rotorType: 'shrouded turbine',
      powerNumber: tagged(5, '-', 'test power number'),
      shaftEfficiency: tagged(0.85, '-', 'test shaft efficiency'),
      mechanicalDesignMargin: tagged(1.2, '-', 'test design margin'),
      feedDensity: tagged(870, 'kg/m3', 'test RRBO density'),
      feedViscosity: {
        ...tagged(0.008, 'Pa.s', 'test RRBO viscosity at 70 °C'),
        referenceTemperatureC: 70,
      },
      interfacialTension: {
        ...tagged(0.012, 'N/m', 'NMP/RRBO preliminary screening sigma anchor at 70 °C'),
        referenceTemperatureC: 70,
        preliminaryConstantBasisId: ECR2_RRBO_NMP_SIGMA_CONSTANT_PRELIMINARY_BASIS.id,
      },
      molecularWeights: {
        saturates_g_mol: tagged(450, 'g/mol', 'physical characterization fixture'),
        mono_g_mol: tagged(190, 'g/mol', 'physical characterization fixture'),
        di_g_mol: tagged(230, 'g/mol', 'physical characterization fixture'),
        poly_g_mol: tagged(310, 'g/mol', 'physical characterization fixture'),
      },
    }, {});

    const data = result.data as Record<string, any>;
    const sigma = data.designBasis.interfacialTension;
    expect(data.designBasis.operatingTemperatureC).toBe(50);
    expect(sigma.value_N_m).toBe(0.012);
    expect(sigma.requestedTemperature_C).toBe(50);
    expect(sigma.resolutionMode).toBe('preliminary_constant_over_range');
    expect(sigma.applicabilityRange_C).toEqual({ min: 25, max: 100 });
    expect(sigma.anchor).toMatchObject({ temperature_C: 70, value_N_m: 0.012 });
    expect(sigma.warnings).toContain('INTERFACIAL_TENSION_TEMPERATURE_DEPENDENCE_NOT_MODELLED');
    expect(result.warnings.some((warning: any) =>
      warning.code === 'INTERFACIAL_TENSION_TEMPERATURE_DEPENDENCE_NOT_MODELLED',
    )).toBe(true);
  });

  it('does not resolve the 70 °C sigma anchor outside the governed 25–100 °C range', async () => {
    const result = await new LLXECRSimulatorEngine().calculate({
      operatingTemperatureC: 101,
      rrboMassFlow_kg_h: 1000,
      nmpMassFlow_kg_h: 1200,
      feedCompositionMassFraction: { saturates: 0.52, mono: 0.22, di: 0.16, poly: 0.10 },
      nmpPurity: 0.998,
      phaseConfiguration: 'nmp_continuous_rrbo_dispersed',
      columnDiameter_m: 0.6,
      columnDiameterTrials_m: [0.6],
      activeHeight_m: 4,
      compartmentHeight_m: 0.5,
      rotorToColumnDiameterRatio: 0.5,
      rotorSpeed_rpm: 150,
      rotorType: 'shrouded turbine',
      powerNumber: tagged(5, '-', 'test power number'),
      shaftEfficiency: tagged(0.85, '-', 'test shaft efficiency'),
      mechanicalDesignMargin: tagged(1.2, '-', 'test design margin'),
      feedDensity: tagged(870, 'kg/m3', 'test RRBO density'),
      feedViscosity: {
        ...tagged(0.008, 'Pa.s', 'test RRBO viscosity at 70 °C'),
        referenceTemperatureC: 70,
      },
      interfacialTension: {
        ...tagged(0.012, 'N/m', 'NMP/RRBO preliminary screening sigma anchor at 70 °C'),
        referenceTemperatureC: 70,
        preliminaryConstantBasisId: ECR2_RRBO_NMP_SIGMA_CONSTANT_PRELIMINARY_BASIS.id,
      },
      molecularWeights: {
        saturates_g_mol: tagged(450, 'g/mol', 'physical characterization fixture'),
        mono_g_mol: tagged(190, 'g/mol', 'physical characterization fixture'),
        di_g_mol: tagged(230, 'g/mol', 'physical characterization fixture'),
        poly_g_mol: tagged(310, 'g/mol', 'physical characterization fixture'),
      },
    }, {});

    const data = result.data as Record<string, any>;
    expect(data.designBasis.interfacialTension).toMatchObject({
      status: 'unresolved',
      requestedTemperature_C: 101,
      value_N_m: null,
    });
    expect(result.warnings.some((warning: any) =>
      warning.code === 'SIGMA_TEMPERATURE_ROUTE_UNAVAILABLE',
    )).toBe(true);
  });

  it('does not reuse an ordinary vendor anchor at another temperature without the explicit screening-basis ID', async () => {
    const result = await new LLXECRSimulatorEngine().calculate({
      operatingTemperatureC: 50, rrboMassFlow_kg_h: 1000, nmpMassFlow_kg_h: 1200,
      feedCompositionMassFraction: { saturates: 0.52, mono: 0.22, di: 0.16, poly: 0.10 },
      nmpPurity: 0.998, phaseConfiguration: 'nmp_continuous_rrbo_dispersed',
      columnDiameter_m: 0.6, columnDiameterTrials_m: [0.6], activeHeight_m: 4, compartmentHeight_m: 0.5,
      rotorToColumnDiameterRatio: 0.5, rotorSpeed_rpm: 150, rotorType: 'shrouded turbine',
      powerNumber: tagged(5, '-', 'test power number'), shaftEfficiency: tagged(0.85, '-', 'test shaft efficiency'),
      mechanicalDesignMargin: tagged(1.2, '-', 'test design margin'), feedDensity: tagged(870, 'kg/m3', 'test RRBO density'),
      feedViscosity: { ...tagged(0.008, 'Pa.s', 'test RRBO viscosity at 70 °C'), referenceTemperatureC: 70 },
      interfacialTension: { value: 0.012, unit: 'N/m', sourceType: 'Vendor', sourceReference: 'single-temperature vendor datum', referenceTemperatureC: 70 },
      molecularWeights: {
        saturates_g_mol: tagged(450, 'g/mol', 'physical characterization fixture'),
        mono_g_mol: tagged(190, 'g/mol', 'physical characterization fixture'),
        di_g_mol: tagged(230, 'g/mol', 'physical characterization fixture'),
        poly_g_mol: tagged(310, 'g/mol', 'physical characterization fixture'),
      },
    }, {});
    expect((result.data as any).designBasis.interfacialTension).toMatchObject({
      status: 'unresolved',
      requestedTemperature_C: 50,
      value_N_m: null,
    });
    expect(result.warnings.some((warning: any) =>
      warning.code === 'SIGMA_TEMPERATURE_ROUTE_UNAVAILABLE',
    )).toBe(true);
  });
});