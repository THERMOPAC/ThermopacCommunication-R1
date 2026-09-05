import { describe, expect, it } from 'vitest';
import type { HydrodynamicProcessBasis } from '../server/ecr-pre-pilot/kuhni-hydrodynamics';
import {
  KUHNI_GEOMETRY_RESOLVER_HASH,
  KUHNI_GEOMETRY_RESOLVER_V100_HASH,
  PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  resolveKuhniGeometry,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver';
import {
  KUHNI_GEOMETRY_RESOLVER_V110_HASH,
  KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
  resolveKuhniGeometryV110,
  resolveKuhniOperatingHoldupV110,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver-v110';

const basis: HydrodynamicProcessBasis = {
  schemaVersion: 'ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1',
  stage1SnapshotHash: 'b'.repeat(64),
  operatingTemperatureC: 50,
  temperatureK: 323.15,
  operatingPressure: 'atmospheric',
  phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
  composition: {
    rrboGrade: 'SN150',
    rrboFeedWt: {
      saturates: 70, monoAromatics: 10, diAromatics: 10,
      polyAromatics: 5, polarAromatics: 5, nmp: 0,
    },
    wetSolventWt: { nmp: 98, water: 2 },
  },
  rrboFeed: {
    identity: 'RRBO_FEED',
    valueLph: 4000,
    conversion: '',
    flowM3S: 4000e-3 / 3600,
    densityKgM3: 878,
    dynamicViscosityPaS: 0.056,
  },
  wetSolventPhase: {
    identity: 'WET_NMP_SOLVENT_PHASE',
    solventOilMassRatio: 0.5,
    conversion: '',
    flowM3S: (4000e-3 / 3600 * 878 * 0.5) / 1028,
    densityKgM3: 1028,
    dynamicViscosityPaS: 0.001666,
  },
  interfacialTensionNM: 0.012,
};

const feasibleInput = { processBasis: basis, columnDiameterM: 1.2, rpm: 30 };

describe('immutable Kuhni V1.1.0 operating-holdup extension', () => {
  it('solves the exact operating residual to numerical tolerance', () => {
    const result = resolveKuhniOperatingHoldupV110(feasibleInput);
    expect(result.status).toBe('OPERATING_HOLDUP_CALCULATED');
    if (result.status !== 'OPERATING_HOLDUP_CALCULATED') return;
    const loadingVelocity = result.dispersedSuperficialVelocityMS / result.operatingHoldup
      + result.continuousSuperficialVelocityMS / (1 - result.operatingHoldup);
    expect(result.operatingSwarmVelocityMS - loadingVelocity).toBeCloseTo(result.residual, 14);
    expect(Math.abs(result.residual)).toBeLessThan(1e-12);
  });

  it('selects only the stable low-holdup root below the flood turning point', () => {
    const result = resolveKuhniOperatingHoldupV110(feasibleInput);
    expect(result.status).toBe('OPERATING_HOLDUP_CALCULATED');
    expect(result.operatingHoldup).not.toBe(result.floodHoldup);
    expect(result.operatingHoldup).toBeLessThan(result.floodHoldup);
    expect(result.uncertainty.operatingBranch).toBe('STABLE_LOW_HOLDUP');
  });

  it('returns hydraulically infeasible and never substitutes flood holdup when no root exists', () => {
    const result = resolveKuhniOperatingHoldupV110({
      processBasis: basis,
      columnDiameterM: 0.1,
      rpm: 30,
    });
    expect(result).toMatchObject({
      status: 'HYDRAULICALLY_INFEASIBLE',
      operatingHoldup: null,
      residual: null,
      operatingSwarmVelocityMS: null,
      reason: 'NO_STABLE_LOW_HOLDUP_ROOT_BELOW_FLOODING_TURNING_POINT',
    });
    expect(result.floodHoldup).toBeGreaterThan(0);
    expect(result.maximumResidualBelowFlood).toBeLessThanOrEqual(0);
  });

  it('publishes a deterministic immutable version and implementation hash', () => {
    const first = resolveKuhniOperatingHoldupV110(feasibleInput);
    const second = resolveKuhniOperatingHoldupV110(feasibleInput);
    expect(KUHNI_GEOMETRY_RESOLVER_V110_VERSION).toBe('KUHNI_GEOMETRY_RESOLVER_V1.1.0');
    expect(KUHNI_GEOMETRY_RESOLVER_V110_HASH).toMatch(/^[a-f0-9]{64}$/);
    expect(first.engine).toEqual(second.engine);
    expect(first.engine.implementationHash).toBe(KUHNI_GEOMETRY_RESOLVER_V110_HASH);
  });

  it('enriches every V1.0.1 visible and audit-only geometry trial without changing its envelopes', () => {
    const authority = {
      value: PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
      provenance: 'PRE_PILOT_DESIGN_DEFAULT' as const,
      label: 'PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)',
      stage2JobId: null,
      stage2ResultHash: null,
    };
    const active = resolveKuhniGeometry(basis, authority);
    const result = resolveKuhniGeometryV110(basis, authority);
    const allTrials = [
      ...result.hydraulicRpmEnvelope,
      ...result.excludedExtrapolatedTrials,
    ];

    expect(result.engine).toMatchObject({
      version: KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
      implementationHash: KUHNI_GEOMETRY_RESOLVER_V110_HASH,
      extendsImplementationHash: KUHNI_GEOMETRY_RESOLVER_HASH,
    });
    expect(allTrials).toHaveLength(
      active.hydraulicRpmEnvelope.length + active.excludedExtrapolatedTrials.length,
    );
    for (const trial of allTrials) {
      expect(trial.operatingHydraulics.input).toMatchObject({
        processBasis: basis,
        columnDiameterM: trial.columnDiameterM,
        rpm: trial.rpm,
      });
      expect(trial.operatingHydraulics.engine.implementationHash)
        .toBe(KUHNI_GEOMETRY_RESOLVER_V110_HASH);
    }
    expect(result.hydraulicRpmEnvelope.map(({ operatingHydraulics, ...trial }) => trial))
      .toEqual(active.hydraulicRpmEnvelope);
    expect(result.excludedExtrapolatedTrials.map(({ operatingHydraulics, ...trial }) => trial))
      .toEqual(active.excludedExtrapolatedTrials);
  });

  it('preserves any hydraulically infeasible operating trials as explicit audit data', () => {
    const authority = {
      value: PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
      provenance: 'PRE_PILOT_DESIGN_DEFAULT' as const,
      label: 'PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)',
      stage2JobId: null,
      stage2ResultHash: null,
    };
    const result = resolveKuhniGeometryV110(basis, authority);
    const allTrials = [
      ...result.hydraulicRpmEnvelope,
      ...result.excludedExtrapolatedTrials,
    ];
    const infeasible = allTrials.filter(
      (trial) => trial.operatingHydraulics.status === 'HYDRAULICALLY_INFEASIBLE',
    );
    expect(allTrials).toHaveLength(
      result.hydraulicRpmEnvelope.length + result.excludedExtrapolatedTrials.length,
    );
    for (const trial of infeasible) {
      expect(trial.operatingHydraulics).toMatchObject({
        operatingHoldup: null,
        residual: null,
        operatingSwarmVelocityMS: null,
      });
    }
  });

  it('leaves the historical V1.0.0 and V1.0.1 hashes unchanged', () => {
    expect(KUHNI_GEOMETRY_RESOLVER_V100_HASH)
      .toBe('d0be9dbe91002fdf979bc4657283cca467268d69c8c58264fe2f3dbdb6085598');
    expect(KUHNI_GEOMETRY_RESOLVER_HASH)
      .toBe('182bee35c75bfd102339abca5c7f93bcdd6bcfe3ce89f4512f25bb001eb2ba97');
  });
});