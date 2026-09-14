import { describe, expect, it } from 'vitest';
import { buildStage4MixingAudit, calculateInterfacialArea, calculateSuperficialPeclet } from '../server/ecr-pre-pilot/stage4-mixing-audit';

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

describe('Stage 4 source-qualified partial mixing calculation', () => {
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

  it('does not invent stator geometry or admit unverified constants', () => {
    const audit = buildStage4MixingAudit(input());
    expect(audit.inputs.rotorDiameterM).toBe(input().selected.rotorDiameterM);
    expect(audit.inputs.statorOpeningGeometry).toBeNull();
    expect(audit.blockers[0].parameters).toEqual(['statorOpeningGeometry']);
    expect(audit.continuousMixing.value).toBeNull();
    expect(audit.continuousMixing.selectedCorrelation).toBeNull();
    expect(audit.steinerCrossCheck.status).toBe('SOURCE_EQUATION_UNVERIFIED');
    expect(audit.sensitivity.result).toBeNull();
    expect(audit.dispersedMixing).toMatchObject({ value: 0, status: 'SCREENING_ASSUMPTION' });
    expect(audit.applicability.extrapolationAssessment).toContain('OUTSIDE_CITED');
  });

  it('lists missing rotor and velocities without silently substituting geometry or flows', () => {
    const data: any = input();
    delete data.selected.rotorDiameterM;
    delete data.operating.continuousSuperficialVelocityMS;
    const audit = buildStage4MixingAudit(data);
    expect(audit.blockers[0].parameters).toContain('rotorDiameterM');
    expect(audit.inputs.continuousSuperficialVelocityMS).toBeNull();
    expect(audit.blockers.some(b => b.code === 'STAGE4_PERSISTED_PHASE_VELOCITIES_REQUIRED')).toBe(true);
  });

  it('implements superficial Peclet and a JSON-safe zero-dispersion limit', () => {
    expect(calculateSuperficialPeclet(4, 0.002, 0.0001)).toMatchObject({ value: 80, velocityBasis: 'SUPERFICIAL' });
    const zero = calculateSuperficialPeclet(4, 0.002, 0);
    expect(zero).toMatchObject({ value: null, status: 'INFINITE_ZERO_DISPERSION_LIMIT' });
    expect(JSON.parse(JSON.stringify(zero)).status).toBe('INFINITE_ZERO_DISPERSION_LIMIT');
  });

  it('rejects nonphysical and nonfinite input rather than returning a number', () => {
    for (const [phi, d] of [[0, 0.01], [1, 0.01], [0.1, 0], [NaN, 0.01], [0.1, Infinity]]) {
      expect(() => calculateInterfacialArea(phi, d)).toThrow('STAGE4_INVALID_INTERFACIAL_AREA_INPUT');
    }
    for (const [h, v, e] of [[0, 1, 1], [1, 0, 1], [1, 1, -1], [1, 1, NaN]]) {
      expect(() => calculateSuperficialPeclet(h, v, e)).toThrow('STAGE4_INVALID_PECLET_INPUT');
    }
  });
});