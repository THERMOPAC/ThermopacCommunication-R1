import { describe, expect, it } from 'vitest';
import {
  buildStage4MixingAudit,
  calculateContinuousPeclet,
  calculateInterfacialArea,
  calculateKumarHartlandEc,
  calculateSuperficialPeclet,
  KH_PRIMARY_COEFFICIENT,
  KH_SENSITIVITY_COEFFICIENT,
} from '../server/ecr-pre-pilot/stage4-mixing-audit';

const input = () => ({
  selected: {
    columnDiameterM: 0.9742129194448474, rotorDiameterM: 0.4871064597224237,
    rpm: 30, d32M: 0.0025707441992382585,
  },
  operating: {
    operatingHoldup: 0.0816427744236363, floodHoldup: 0.20077600313512306,
    continuousSuperficialVelocityMS: 0.0009598419119466572,
    dispersedSuperficialVelocityMS: 0.0014905956171508057,
  },
  processBasis: {
    phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
    wetSolventPhase: { densityKgM3: 997, dynamicViscosityPaS: 0.001083 },
  },
});

describe('Stage 4 user-approved Kumar–Hartland mixing screening', () => {
  it('uses operating rather than flood holdup and preserves upstream inputs', () => {
    const data = input();
    const before = JSON.stringify(data);
    const audit = buildStage4MixingAudit(data);
    expect(audit.interfacialArea.value).toBeCloseTo(190.55052100748415, 10);
    expect(JSON.stringify(data)).toBe(before);
    expect(audit.inputs.rotationalFrequencyS1).toBe(0.5);
    expect(audit.inputs.continuousDensityKgM3).toBe(997);
    expect(audit.inputs.continuousViscosityPaS).toBe(0.001083);
    expect(audit.inputs.continuousInterstitialVelocityMS).toBeCloseTo(
      data.operating.continuousSuperficialVelocityMS / (1 - data.operating.operatingHoldup), 12);
  });

  it('calculates Ec with the approved SI-unit expression and does not require stator geometry', () => {
    const audit = buildStage4MixingAudit(input());
    expect(audit.inputs.rotorDiameterM).toBe(input().selected.rotorDiameterM);
    expect(audit.inputs.statorOpeningGeometry).toBeNull();
    expect(audit.blockers).toEqual([]);
    expect(audit.continuousMixing.value).toBeCloseTo(0.0015267874278949382, 15);
    expect(audit.continuousMixing.unit).toBe('m²/s');
    expect(audit.continuousMixing.selectedCorrelation).toBe('KUMAR_HARTLAND_EC_SCREENING');
    expect(audit.continuousMixing.hcM).toBeCloseTo(0.5 * input().selected.columnDiameterM, 15);
    expect(audit.continuousMixing.q).toBeCloseTo(253.74306625896455, 10);
    expect(audit.continuousMixing.coefficient).toBe(KH_PRIMARY_COEFFICIENT);
    expect(audit.sensitivity.status).toBe('CALCULATED_COEFFICIENT_SENSITIVITY');
    expect(audit.sensitivity.primaryEcM2S).toBeCloseTo(0.0015267874278949382, 15);
    expect(audit.sensitivity.sensitivityEcM2S).toBeCloseTo(0.0013431362780342957, 15);
    expect(audit.sensitivity.sensitivityCoefficient).toBe(KH_SENSITIVITY_COEFFICIENT);
    expect(audit.steinerCrossCheck.status).toBe('NOT_USED_IN_SCREENING');
    expect(audit.dispersedMixing).toMatchObject({ value: 0, status: 'SCREENING_ASSUMPTION' });
    expect(audit.applicability.extrapolationAssessment).toContain('OUTSIDE_CITED');
    expect(audit.screeningNotice).toContain('REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN');
  });

  it('requires a persisted rotor and velocities without silently substituting geometry or flows', () => {
    const data: any = input();
    delete data.selected.rotorDiameterM;
    delete data.operating.continuousSuperficialVelocityMS;
    const audit = buildStage4MixingAudit(data);
    expect(audit.blockers.some(b => b.code === 'STAGE4_ROTOR_DIAMETER_REQUIRED')).toBe(true);
    expect(audit.inputs.continuousSuperficialVelocityMS).toBeNull();
    expect(audit.blockers.some(b => b.code === 'STAGE4_PERSISTED_PHASE_VELOCITIES_REQUIRED')).toBe(true);
    expect(audit.blockers.some(b => b.code === 'STAGE4_GEOMETRY_INPUT_REQUIRED')).toBe(false);
    expect(audit.blockers.some(b => b.code === 'STAGE4_AXIAL_MIXING_SOURCE_EQUATION_UNVERIFIED')).toBe(false);
    expect(audit.continuousMixing.value).toBeNull();
  });

  it('reports coefficient sensitivity through the pure Ec helper', () => {
    const data = input();
    const helperInput = {
      columnDiameterM: data.selected.columnDiameterM,
      rotorDiameterM: data.selected.rotorDiameterM,
      rpm: data.selected.rpm,
      continuousSuperficialVelocityMS: data.operating.continuousSuperficialVelocityMS,
      dispersedSuperficialVelocityMS: data.operating.dispersedSuperficialVelocityMS,
      continuousDensityKgM3: data.processBasis.wetSolventPhase.densityKgM3,
      continuousViscosityPaS: data.processBasis.wetSolventPhase.dynamicViscosityPaS,
    };
    const primary = calculateKumarHartlandEc(helperInput, KH_PRIMARY_COEFFICIENT);
    const sensitivity = calculateKumarHartlandEc(helperInput, KH_SENSITIVITY_COEFFICIENT);
    expect(primary).toBeCloseTo(0.0015267874278949382, 15);
    expect(sensitivity).toBeCloseTo(0.0013431362780342957, 15);
    expect(primary).toBeGreaterThan(sensitivity);
  });

  it('implements superficial Peclet and a JSON-safe zero-dispersion limit', () => {
    expect(calculateSuperficialPeclet(4, 0.002, 0.0001)).toMatchObject({ value: 80, velocityBasis: 'SUPERFICIAL' });
    const zero = calculateSuperficialPeclet(4, 0.002, 0);
    expect(zero).toMatchObject({ value: null, status: 'INFINITE_ZERO_DISPERSION_LIMIT' });
    expect(JSON.parse(JSON.stringify(zero)).status).toBe('INFINITE_ZERO_DISPERSION_LIMIT');
  });

  it('calculates continuous Pe from active height, superficial Vc, and Ec', () => {
    expect(calculateContinuousPeclet(4, 0.002, 0.0001)).toMatchObject({
      value: 80,
      unit: '1',
      velocityBasis: 'SUPERFICIAL',
      dispersion: 'Ec',
    });
  });

  it('rejects nonphysical and nonfinite input rather than returning a number', () => {
    for (const [phi, d] of [[0, 0.01], [1, 0.01], [0.1, 0], [NaN, 0.01], [0.1, Infinity]]) {
      expect(() => calculateInterfacialArea(phi, d)).toThrow('STAGE4_INVALID_INTERFACIAL_AREA_INPUT');
    }
    for (const [h, v, e] of [[0, 1, 1], [1, 0, 1], [1, 1, -1], [1, 1, NaN]]) {
      expect(() => calculateSuperficialPeclet(h, v, e)).toThrow('STAGE4_INVALID_PECLET_INPUT');
    }
    expect(() => calculateContinuousPeclet(1, 1, 0)).toThrow('STAGE4_INVALID_CONTINUOUS_PECLET_INPUT');
  });
});