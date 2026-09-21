import { describe, expect, it } from 'vitest';
import { dragCoefficient, evaluateRrboHydraulicTrial, swarmSpeeds } from '../server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1';
import { evaluateP1ReviewTrial as evaluateTrial, evaluateTrial as evaluateCurrentTrial, compactStage3Stage4OptimizerResult, evaluateKuhniReverseTrial } from '../server/ecr-pre-pilot/stage3-stage4-optimizer';
import type { HydrodynamicProcessBasis } from '../server/ecr-pre-pilot/kuhni-hydrodynamics';
import { readFileSync } from 'node:fs';

const basis = {
  phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
  operatingTemperatureC: 40, interfacialTensionNM: .011,
  rrboFeed: { densityKgM3: 869, dynamicViscosityPaS: .0598, flowM3S: 4 / 3600 },
  wetSolventPhase: { densityKgM3: 1015, dynamicViscosityPaS: .001416, flowM3S: .6 * 869 / 1015 * 4 / 3600 },
} as HydrodynamicProcessBasis;
const geometry = { rotorToColumn: .33, compartmentToColumn: .30, statorFreeArea: .30 };
// A single nominated trial, not a diameter/RPM search or equipment recommendation.
const run = () => evaluateRrboHydraulicTrial(1.2, 40, basis, geometry);

describe('RRBO hydraulic P1 pure trial', () => {
  it('reproduces HR and rigid Stokes low-Re limits across viscosity ratios', () => {
    for (const x of [.000001, .0236789, 1, 1e6]) {
      const re = 1e-16;
      expect(dragCoefficient(re, x, 1.168, 'BARRY_PARLANGE_MOBILE') * re)
        .toBeCloseTo(16 * (1 + 1.5 * x) / (1 + x), 6);
    }
    expect(dragCoefficient(1e-16, .0236789, 1.168, 'SCHILLER_NAUMANN_IMMOBILE') * 1e-16).toBeCloseTo(24, 10);
  });
  it('converts Garthe superficial velocity to slip and preserves limiting exponents', () => {
    for (const phi of [.01, .2, .7]) {
      const low = swarmSpeeds(phi, .01, 1, re => 24 / re);
      expect(low.superficialSwarmMS / .01).toBeCloseTo((1 - phi) ** 4.65, 12);
      expect(low.slipMS / .01).toBeCloseTo((1 - phi) ** 3.65, 12);
      const high = swarmSpeeds(phi, .01, 1, () => 1);
      expect(high.superficialSwarmMS / .01).toBeCloseTo((1 - phi) ** 2.325, 12);
    }
  });
  it('uses both interfaces at all C endpoints and selects lower capacity, not a nominated interface', () => {
    const result = run();
    expect(result.scenarios).toHaveLength(6);
    expect([...new Set(result.scenarios.map(s => s.coefficient))]).toEqual([.36, .42, .43]);
    expect(result.governing.capacityMS).toBe(Math.min(...result.scenarios.map(s => s.capacityMS)));
    expect(result.qualification.inversion).toBe('UNKNOWN');
    expect(result.qualification.entrainment).toBe('UNKNOWN');
    expect(result.sourceExtrapolation.status).toBe('EXTRAPOLATED');
    expect(result.status).toBe('PREPILOT_EXTRAPOLATED_METHOD');
    expect(result.maximumLoading).toBe(.70);
    for (const s of result.scenarios) {
      expect(Math.abs(s.forceBalanceResidualN)).toBeLessThan(1e-12);
      expect(s.diagnostics.eotvos).toBeGreaterThan(0);
      expect(s.diagnostics.ohnesorgeContinuous).toBeGreaterThan(0);
    }
  });
  it('finds actual dilute-connected roots, separate from flood, with actual balances and area', () => {
    const dilute = structuredClone(basis);
    dilute.rrboFeed.flowM3S *= .01;
    dilute.wetSolventPhase.flowM3S *= .01;
    const result = evaluateRrboHydraulicTrial(1.2, 40, dilute, geometry);
    for (const s of result.scenarios) {
      expect(s.operatingRoots).toHaveLength(2);
      expect(s.operatingHoldup).toBeLessThan(s.floodHoldup);
      expect(s.operatingHoldup).toBeCloseTo(s.operatingRoots[0], 12);
      expect(s.continuation).toHaveLength(16);
      expect(Math.abs(s.operatingBalanceResidualMS!)).toBeLessThan(1e-10);
      expect(s.interfacialAreaM2M3).toBeCloseTo(6 * s.operatingHoldup! / s.d32M, 10);
      expect(s.operatingSpeeds!.slipMS).toBeCloseTo(result.jd / s.operatingHoldup! + result.jc / (1 - s.operatingHoldup!), 10);
    }
  });
  it('does not substitute flood holdup when no operating root exists', () => {
    const overloaded = structuredClone(basis);
    overloaded.rrboFeed.flowM3S *= 1e6;
    overloaded.wetSolventPhase.flowM3S *= 1e6;
    const result = evaluateRrboHydraulicTrial(1.2, 40, overloaded, geometry);
    expect(result.screeningPass).toBe(false);
    result.scenarios.forEach(s => {
      expect(s.operatingHoldup).toBeNull();
      expect(s.interfacialAreaM2M3).toBeNull();
      expect(s.branchStatus).toBe('NO_DILUTE_CONNECTED_ROOT');
      expect(s.floodHoldup).toBeGreaterThan(0);
    });
    expect(result.qualification.inversion).toBe('UNKNOWN');
  });
  it('rejects nonfinite/invalid inputs explicitly', () => {
    for (const diameter of [0, -1, NaN, Infinity]) expect(() => evaluateRrboHydraulicTrial(diameter, 40, basis, geometry)).toThrow();
    expect(() => evaluateRrboHydraulicTrial(1.2, 0, basis, geometry)).toThrow();
    expect(() => evaluateRrboHydraulicTrial(1.2, 40, basis, { ...geometry, rotorToColumn: 1 })).toThrow();
    expect(() => evaluateRrboHydraulicTrial(1.2, 40, { ...basis, interfacialTensionNM: NaN }, geometry)).toThrow();
    expect(() => evaluateRrboHydraulicTrial(1.2, 40, { ...basis, operatingTemperatureC: 50 }, geometry)).toThrow('P1_REQUIRES_SAVED_40C_BASIS');
    expect(() => dragCoefficient(-1, 1, 1, 'BARRY_PARLANGE_MOBILE')).toThrow();
  });
  it('wires current single-trial adapter and JSON evidence without mutating authority', () => {
    const before = JSON.stringify(basis);
    const trial = evaluateTrial(basis, 1.2, .30, .33, .30, 40);
    expect(trial.hydraulicMethod).toBeDefined();
    expect(trial.holdup).toBe(trial.hydraulicMethod!.governing.operatingHoldup);
    expect(trial.floodHoldup).toBe(trial.hydraulicMethod!.governing.floodHoldup);
    expect(JSON.parse(JSON.stringify(trial)).hydraulicMethod.qualification.inversion).toBe('UNKNOWN');
    expect(JSON.stringify(basis)).toBe(before);
    // Compactor preserves selectedTrial verbatim (no optimizer execution).
    const compact = compactStage3Stage4OptimizerResult({ selectedTrial: trial, orientationComparison: [] } as any);
    expect(JSON.parse(JSON.stringify(compact)).selectedTrial.hydraulicMethod.scenarios).toHaveLength(6);
  });
  it('keeps historical adapter opt-in replay path and old source equations untouched', () => {
    const old = evaluateCurrentTrial(basis, 1.2, .30, .33, .30, 40);
    expect(old.hydraulicMethod).toBeUndefined();
    const record = evaluateKuhniReverseTrial(1.2, 40, basis, {
      ...geometry, powerNumber: 1.2, directTurbulenceC: .42,
    });
    expect(old.holdup).toBe(record.floodHoldup);
    expect(old.interfacialAreaM2M3).toBe(6 * record.floodHoldup / record.d32M);
    const source = readFileSync('server/ecr-pre-pilot/kuhni-geometry-resolver-v140.ts', 'utf8');
    expect(source).toContain('holdup: flood.x');
    expect(source).not.toContain('RRBO_WETNMP_KUHNI_HYDRAULIC_P1');
  });
  it('does not infer physical qualification from an accepted loading', () => {
    const dilute = structuredClone(basis);
    dilute.rrboFeed.flowM3S *= .01; dilute.wetSolventPhase.flowM3S *= .01;
    const trial = evaluateTrial(dilute, 1.2, .30, .33, .30, 40);
    expect(trial.hydraulicPass).toBe(true);
    expect(trial.validity).toBe('SCALE_UP_EXTRAPOLATION');
    expect(trial.hydraulicMethod!.qualification).toEqual({
      inversion: 'UNKNOWN', entrainment: 'UNKNOWN', disengagement: 'UNKNOWN',
      turbulence: 'UNKNOWN', sphericalDrop: 'UNKNOWN', schillerNaumannRange: 'UNKNOWN', interfaceMobility: 'UNKNOWN',
    });
  });
});