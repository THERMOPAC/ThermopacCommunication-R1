import { describe, expect, it } from 'vitest';
import {
  PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  resolveKuhniGeometry,
  resolveKuhniGeometryV100,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver';
import type { HydrodynamicProcessBasis } from '../server/ecr-pre-pilot/kuhni-hydrodynamics';

const basis: HydrodynamicProcessBasis = {
  schemaVersion: 'ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1',
  stage1SnapshotHash: 'b'.repeat(64),
  operatingTemperatureC: 50, temperatureK: 323.15, operatingPressure: 'atmospheric',
  phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
  composition: { rrboGrade: 'SN150', rrboFeedWt: { saturates: 70, monoAromatics: 10, diAromatics: 10, polyAromatics: 5, polarAromatics: 5, nmp: 0 }, wetSolventWt: { nmp: 98, water: 2 } },
  rrboFeed: { identity: 'RRBO_FEED', valueLph: 4000, conversion: '', flowM3S: 4000e-3 / 3600, densityKgM3: 878, dynamicViscosityPaS: .056 },
  wetSolventPhase: { identity: 'WET_NMP_SOLVENT_PHASE', solventOilMassRatio: .5, conversion: '', flowM3S: (4000e-3 / 3600 * 878 * .5) / 1028, densityKgM3: 1028, dynamicViscosityPaS: .001666 },
  interfacialTensionNM: .012,
};

describe('immutable Kuhni geometry resolver', () => {
  it('uses explicit fallback provenance in the deterministic result hash', () => {
    const authority = {
      value: PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
      provenance: 'PRE_PILOT_DESIGN_DEFAULT' as const,
      label: 'PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)',
      stage2JobId: null,
      stage2ResultHash: null,
    };
    const first = resolveKuhniGeometry(basis, authority);
    const second = resolveKuhniGeometry(basis, authority);
    expect(first.calculationHash).toBe(second.calculationHash);
    expect(first.theoreticalStagesUsed).toEqual(authority);
    expect(first.hydraulicRpmEnvelope.length).toBeGreaterThan(0);
    expect(first.hydraulicRpmEnvelope.every((trial) => trial.status === 'CALCULATED_IN_RANGE')).toBe(true);
    expect(first.excludedExtrapolatedTrialCount).toBeGreaterThan(0);
  });

  it('binds a changed Stage-2 NT and provenance into a new hash', () => {
    const fallback = resolveKuhniGeometry(basis, {
      value: 7, provenance: 'PRE_PILOT_DESIGN_DEFAULT',
      label: 'PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)',
      stage2JobId: null, stage2ResultHash: null,
    });
    const stage2 = resolveKuhniGeometry(basis, {
      value: 5, provenance: 'STAGE_2_CALCULATED_NT',
      label: 'STAGE-2 CALCULATED THEORETICAL STAGES',
      stage2JobId: 'job-1', stage2ResultHash: 'c'.repeat(64),
    });
    expect(stage2.calculationHash).not.toBe(fallback.calculationHash);
  });

  it('keeps final RPM and physical height blocked until efficiency physics exists', () => {
    const result = resolveKuhniGeometry(basis, {
      value: 7, provenance: 'PRE_PILOT_DESIGN_DEFAULT',
      label: 'PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)',
      stage2JobId: null, stage2ResultHash: null,
    });
    expect(result.finalOperatingRpm).toBeNull();
    expect(result.physicalCompartments).toBeNull();
    expect(result.coupledSelection.status).toBe('DEPENDENCY_BLOCKED');
    expect(result.evidence.swarm).toContain('square-root');
    expect(result.calculationReport.theoreticalStagesUsed.value).toBe(7);
  });

  it('implements the rendered Garthe Eq. 5.7 exponents and complete shape trace', () => {
    const result = resolveKuhniGeometry(basis, {
      value: 7, provenance: 'PRE_PILOT_DESIGN_DEFAULT',
      label: 'PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)',
      stage2JobId: null, stage2ResultHash: null,
    });
    const trial = result.hydraulicRpmEnvelope[0];
    const expected = 1.08 + 10.94 / Math.sqrt(trial.rotorReynolds)
      + 257.37 / trial.rotorReynolds ** 1.5;
    expect(trial.sourcePowerNumber).toBeCloseTo(expected, 12);
    expect(Array.isArray(trial.dragApplicability)).toBe(true);
    expect(Array.isArray(trial.shapeApplicability)).toBe(true);
    expect(trial.terminal).toMatchObject({
      morton: expect.any(Number),
      taylor: expect.any(Number),
      aspectRatio: expect.any(Number),
    });
  });

  it('replays the immutable V1.0.0 envelope while V1.0.1 admits only in-range results', () => {
    const authority = {
      value: 7, provenance: 'PRE_PILOT_DESIGN_DEFAULT' as const,
      label: 'PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)',
      stage2JobId: null, stage2ResultHash: null,
    };
    const historical = resolveKuhniGeometryV100(basis, authority);
    const current = resolveKuhniGeometry(basis, authority);
    expect(historical.engine.version).toBe('KUHNI_GEOMETRY_RESOLVER_V1.0.0');
    expect(historical.hydraulicRpmEnvelope.some((trial) => trial.status === 'CALCULATED_EXTRAPOLATED')).toBe(true);
    expect(current.engine.version).toBe('KUHNI_GEOMETRY_RESOLVER_V1.0.1');
    expect(current.hydraulicRpmEnvelope.every((trial) => trial.status === 'CALCULATED_IN_RANGE')).toBe(true);
    expect(current.hydraulicDiagnosticPoint?.columnDiameterM).toBeGreaterThan(
      historical.hydraulicDiagnosticPoint?.columnDiameterM ?? 0,
    );
  });
});