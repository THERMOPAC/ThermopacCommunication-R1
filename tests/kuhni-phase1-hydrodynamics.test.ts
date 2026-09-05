import { describe, expect, it } from 'vitest';
import {
  canonicalizeKuhniHydrodynamicInput, evaluateKuhniHydrodynamics,
  type HydrodynamicProcessBasis,
} from '../server/ecr-pre-pilot/kuhni-hydrodynamics';
import { makeStage1HydrodynamicProcessBasis } from '../server/ecr-pre-pilot/stage1';

const basis: HydrodynamicProcessBasis = {
  schemaVersion: 'ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1', stage1SnapshotHash: 'a'.repeat(64),
  operatingTemperatureC: 40, temperatureK: 313.15, operatingPressure: 'atmospheric',
  phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
  composition: { rrboGrade: 'SN150', rrboFeedWt: { saturates: 70, monoAromatics: 10, diAromatics: 10, polyAromatics: 5, polarAromatics: 5, nmp: 0 }, wetSolventWt: { nmp: 98, water: 2 } },
  rrboFeed: { identity: 'RRBO_FEED', valueLph: 100, conversion: 'L/h * 1e-3 m3/L / 3600 s/h', flowM3S: 100e-3 / 3600, densityKgM3: 850, dynamicViscosityPaS: .001 },
  wetSolventPhase: { identity: 'WET_NMP_SOLVENT_PHASE', solventOilMassRatio: .5, conversion: '(RRBO m3/s * RRBO kg/m3 * S/O) / wet-solvent kg/m3', flowM3S: 100e-3 / 3600 * .425, densityKgM3: 1000, dynamicViscosityPaS: .001 },
  interfacialTensionNM: .01,
};
const input = canonicalizeKuhniHydrodynamicInput({
  columnDiameterM: .1, rotorDiameterM: .06, compartmentHeightM: .06, statorFreeAreaFraction: .3,
  rotorSpeedRpmMin: 60, rotorSpeedRpmMax: 60, rotorSpeedRpmStep: 1, powerNumber: 1, directTurbulenceC: .4,
});
describe('Kuhni Phase-1 hydrodynamics', () => {
  it('uses the declared area, power, and one-factor area identities', () => {
    const record = evaluateKuhniHydrodynamics(input, basis).records[0];
    expect(record.powerVolumeWM3).toBeCloseTo(record.powerW / (Math.PI * .1 ** 2 / 4 * .06));
    if (record.phiD && record.d32M) expect(record.interfacialAreaM2M3).toBeCloseTo(6 * record.phiD / record.d32M);
  });
  it('hard-blocks tip speeds above 4.5 m/s and never invents flooding', () => {
    const result = evaluateKuhniHydrodynamics({ ...input, rotorSpeedRpmMin: 1500, rotorSpeedRpmMax: 1500 }, basis).records[0];
    expect(result.diagnostics.join(' ')).toContain('TIP_SPEED_LIMIT_EXCEEDED');
    expect(result.status).toBe('PRELIMINARY_DIAGNOSTIC_HOLD');
    expect(result.blockers).toContain('TIP_SPEED_LIMIT_EXCEEDED');
    expect(result.flooding.status).toBe('CORRELATION_UNAVAILABLE');
    expect(result.flooding.floodingVelocityMS).toBeNull();
    expect(result.flooding.capacityMetric).toBeNull();
    expect(result.flooding.percentFlooding).toBeNull();
  });
  it('fails closed outside the Table-1 source envelope', () => {
    const result = evaluateKuhniHydrodynamics(input, { ...basis, wetSolventPhase: { ...basis.wetSolventPhase, densityKgM3: 1100 } }).records[0];
    expect(result.holdup.status).toBe('NOT_CALCULABLE');
    expect(result.phiD).toBeNull();
    expect(result.d32.status).toBe('CALCULATED_PRELIMINARY');
    expect(result.slip.dependency).toBe('KH1995_HOLDUP_NOT_CALCULABLE');
    expect(result.interfacialArea.dependency).toBe('KH1995_HOLDUP_NOT_CALCULABLE');
  });
  it('maps phase flows from the saved Stage-1 orientation', () => {
    const reversed = evaluateKuhniHydrodynamics({ ...input }, { ...basis, phaseConfiguration: 'rrbo-continuous-nmp-dispersed' }).records[0];
    expect(reversed.superficialVelocitiesMS.continuousIdentity).toBe('RRBO_FEED');
    expect(reversed.superficialVelocitiesMS.Uc).toBeCloseTo(basis.rrboFeed.flowM3S / (Math.PI * .1 ** 2 / 4));
  });
  it('implements Eq19 with e^-0.77 rather than exp(-0.77)', () => {
    const result = evaluateKuhniHydrodynamics(input, basis);
    const lowFreeArea = result.records[0].phiD!;
    const highFreeArea = evaluateKuhniHydrodynamics({ ...input, statorFreeAreaFraction: .6 }, basis).records[0].phiD!;
    expect(lowFreeArea / highFreeArea).toBeCloseTo((.3 / .6) ** -.77, 10);
    expect(result.status).toBe('PRELIMINARY_DIAGNOSTIC_HOLD');
    expect(result.blockers.join(' ')).toContain('FLOODING_CAPACITY_CORRELATION_UNAVAILABLE');
  });
  it('inherits temperature-resolved Stage-1 properties exactly without a property model', () => {
    const project = (temperature: number, rho: number, viscosityCp: number) => makeStage1HydrodynamicProcessBasis({
      immutableHash: `${temperature}`.padEnd(64, 'b'),
      stage1: {
        operatingTemperatureC: temperature, temperatureK: temperature + 273.15,
        operatingPressure: 'atmospheric', phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
        rrboGrade: 'SN150', designFeedRateLph: 100, solventOilRatio: .5,
        rrboDensityKgM3: 850, rrboDynamicViscosityCp: 7.25,
        nmpDensityKgM3: rho, nmpDynamicViscosityCp: viscosityCp,
        rrboInterfacialTensionMnM: 9.4, saturatesWt: 70, monoAromaticsWt: 10,
        diAromaticsWt: 10, polyAromaticsWt: 5, polarAromaticsWt: 5, nmpInFeedWt: 0,
        nmpPurityWt: 98, nmpWaterWt: 2,
      },
    } as any);
    const cold = project(30, 1002, 1.4), hot = project(80, 996, .82);
    expect(cold.wetSolventPhase.dynamicViscosityPaS).toBe(.0014);
    expect(hot.wetSolventPhase.dynamicViscosityPaS).toBe(.00082);
    expect(hot.wetSolventPhase.densityKgM3).toBe(996);
    expect(hot.operatingTemperatureC).toBe(80);
    expect(hot.interfacialTensionNM).toBe(.0094);
  });
  it('persists governed geometry ratios and rejects physically impossible geometry', () => {
    const result = evaluateKuhniHydrodynamics(input, basis).records[0];
    expect(result.geometry.ratios).toEqual({
      rotorToColumn: .6,
      compartmentToColumn: .6,
      rotorToCompartment: 1,
      statorFreeArea: .3,
    });
    expect(() => canonicalizeKuhniHydrodynamicInput({
      ...input,
      rotorDiameterM: .11,
    })).toThrow('INVALID_KUHNI_RANGE');
    expect(() => canonicalizeKuhniHydrodynamicInput({
      ...input,
      statorFreeAreaFraction: 1.01,
    })).toThrow('INVALID_KUHNI_RANGE');
  });
  it('keeps a governed Stage-1 throughput/property case as an explicit diagnostic hold', () => {
    const governedBasis: HydrodynamicProcessBasis = {
      ...basis,
      operatingTemperatureC: 25,
      temperatureK: 298.15,
      operatingPressure: '2.0',
      rrboFeed: {
        ...basis.rrboFeed,
        valueLph: 4000,
        flowM3S: 4000e-3 / 3600,
        densityKgM3: 878,
        dynamicViscosityPaS: .106,
      },
      wetSolventPhase: {
        ...basis.wetSolventPhase,
        solventOilMassRatio: .5,
        flowM3S: (4000e-3 / 3600 * 878 * .5) / 1028,
        densityKgM3: 1028,
        dynamicViscosityPaS: .001666,
      },
      interfacialTensionNM: .012,
    };
    const sourceGeometry = canonicalizeKuhniHydrodynamicInput({
      columnDiameterM: .15,
      rotorToColumnRatio: .5,
      compartmentHeightM: .075,
      statorFreeAreaFraction: .35,
      rotorSpeedRpmMin: 60,
      rotorSpeedRpmMax: 60,
      rotorSpeedRpmStep: 60,
      powerNumber: 1.2,
      directTurbulenceC: .42,
    });
    const result = evaluateKuhniHydrodynamics(sourceGeometry, governedBasis);
    expect(result.status).toBe('PRELIMINARY_DIAGNOSTIC_HOLD');
    expect(result.records[0].d32.status).toBe('CALCULATED_PRELIMINARY');
    expect(result.records[0].holdup.status).toBe('NOT_CALCULABLE');
    expect(result.records[0].slip.status).toBe('NOT_CALCULABLE');
    expect(result.records[0].interfacialArea.status).toBe('NOT_CALCULABLE');
    expect(result.blockers.join(' ')).toContain('TABLE_1_OUT_OF_RANGE:mu_d=0.106');
    expect(result.source.chemicalSystemQualification.executionGate).toBe(false);
  });
});