import { describe, expect, it } from 'vitest';

import {
  LLXECRSimulatorEngine,
  type ComponentVector,
} from '../server/engines/llx/llx-ecr-simulator-engine';
import { SURROGATE_MW } from '../server/engine-framework/cel/coto2022-nmp-lle';

function tagged(value: number, unit: string) {
  return { value, unit, sourceType: 'Assumed', sourceReference: 'ECR-2 LLE temperature regression fixture' };
}

function simulatorInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operatingTemperatureC: 25,
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
    powerNumber: tagged(5, '-'),
    shaftEfficiency: tagged(0.85, '-'),
    mechanicalDesignMargin: tagged(1.2, '-'),
    feedDensity: tagged(870, 'kg/m3'),
    feedViscosity: tagged(0.008, 'Pa.s'),
    interfacialTension: tagged(0.012, 'N/m'),
    molecularWeights: {
      saturates_g_mol: tagged(450, 'g/mol'),
      mono_g_mol: tagged(190, 'g/mol'),
      di_g_mol: tagged(230, 'g/mol'),
      poly_g_mol: tagged(310, 'g/mol'),
    },
    ...overrides,
  };
}

const canonicalC2Feed: ComponentVector = [
  0.52 / SURROGATE_MW.c12,
  0.22 / SURROGATE_MW.xylene,
  0.16 / SURROGATE_MW.methylnaphtalene,
  0.10 / SURROGATE_MW.pyrene,
  0,
].map((value, _, values) => value / values.reduce((sum, item) => sum + item, 0)) as ComponentVector;

describe('ECR-2 selected-temperature run-level NRTL LLE flash', () => {
  it('executes and persists LLE at the exact Stage 4 temperature for a calibrated and extrapolated run', async () => {
    const engine = new LLXECRSimulatorEngine();
    const calibrationRun = await engine.calculate(simulatorInput({ operatingTemperatureC: 25 }), {});
    const extrapolatedRun = await engine.calculate(simulatorInput({ operatingTemperatureC: 50 }), {});
    const calibrationFlash = (calibrationRun.data as Record<string, any>).lleFlashAtOperatingTemperature;
    const extrapolatedFlash = (extrapolatedRun.data as Record<string, any>).lleFlashAtOperatingTemperature;

    expect(calibrationFlash).toMatchObject({
      temperature: {
        selectedOperatingTemperature_C: 25,
        selectedOperatingTemperature_K: 298.15,
        authority: 'Stage 4 Extraction Temperature',
      },
      converged: true,
      thermodynamicValidity: {
        operatingTemperatureK: 298.15,
        selectedTemperatureApplicability: 'VALIDATED_PRELIMINARY',
      },
    });
    expect(calibrationFlash.raffinatePhaseMoleFractions).toHaveLength(5);
    expect(calibrationFlash.extractPhaseMoleFractions).toHaveLength(5);
    expect(['two_phase_converged', 'trivial_single_phase']).toContain(calibrationFlash.status);

    expect(extrapolatedFlash).toMatchObject({
      temperature: {
        selectedOperatingTemperature_C: 50,
        selectedOperatingTemperature_K: 323.15,
      },
      converged: true,
      thermodynamicValidity: {
        operatingTemperatureK: 323.15,
        selectedTemperatureApplicability: 'EXTRAPOLATED_PRELIMINARY',
      },
    });
    expect(extrapolatedFlash.raffinatePhaseMoleFractions).toHaveLength(5);
    expect(extrapolatedFlash.extractPhaseMoleFractions).toHaveLength(5);
    expect(['two_phase_converged', 'trivial_single_phase']).toContain(extrapolatedFlash.status);
    expect(extrapolatedFlash.temperatureStatus.classification)
      .toContain('Temperature Extrapolation — Preliminary / Pending Validation');
    expect((extrapolatedRun.data as Record<string, any>).designBasis.nrtlModelStatus.execution)
      .toMatchObject({ selectedOperatingTemperatureK: 323.15, status: extrapolatedFlash.status });
  });

  it('rejects a competing C2 handoff temperature before it can override Stage 4', () => {
    const validation = new LLXECRSimulatorEngine().validate(simulatorInput({
      operatingTemperatureC: 50,
      c2ThermodynamicHandoff: {
        feedMoleFractions: canonicalC2Feed,
        temperatureK: 298.15,
      },
    }));

    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'c2ThermodynamicHandoff.temperatureK',
        severity: 'error',
      }),
    ]));
  });
});