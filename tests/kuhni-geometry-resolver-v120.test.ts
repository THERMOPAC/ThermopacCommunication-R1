import { describe, expect, it } from 'vitest';
import type { HydrodynamicProcessBasis } from '../server/ecr-pre-pilot/kuhni-hydrodynamics';
import {
  KUHNI_GEOMETRY_RESOLVER_HASH,
  KUHNI_GEOMETRY_RESOLVER_V100_HASH,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver';
import {
  KUHNI_GEOMETRY_RESOLVER_V110_HASH,
  KUHNI_GEOMETRY_RESOLVER_V110_VERSION,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver-v110';
import {
  KUHNI_GEOMETRY_RESOLVER_V120_HASH,
  KUHNI_GEOMETRY_RESOLVER_V120_VERSION,
  KUHNI_HYDRAULIC_PREREQUISITE_CODES,
  resolveKuhniGeometryV120,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver-v120';
import { PRE_PILOT_DEFAULT_THEORETICAL_STAGES, resolveKuhniGeometryV100 } from '../server/ecr-pre-pilot/kuhni-geometry-resolver';
import { resolveKuhniGeometryV110 } from '../server/ecr-pre-pilot/kuhni-geometry-resolver-v110';

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
      saturates: 70,
      monoAromatics: 10,
      diAromatics: 10,
      polyAromatics: 5,
      polarAromatics: 5,
      nmp: 0,
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

const authority = {
  value: PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  provenance: 'PRE_PILOT_DESIGN_DEFAULT' as const,
  label: 'PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)',
  stage2JobId: null,
  stage2ResultHash: null,
};

function rejectedReasonSet(result: ReturnType<typeof resolveKuhniGeometryV120>) {
  return new Set(result.rejectedRpmTrials.map((trial) => trial.reason));
}

describe('Kühni V1.2.0 phase applicability boundary', () => {
  it('retains the valid heavy-continuous orientation and its in-range envelope', () => {
    const result = resolveKuhniGeometryV120(basis, authority);

    expect(result.engine).toMatchObject({
      version: KUHNI_GEOMETRY_RESOLVER_V120_VERSION,
      implementationHash: KUHNI_GEOMETRY_RESOLVER_V120_HASH,
      extendsImplementationHash: KUHNI_GEOMETRY_RESOLVER_V110_HASH,
    });
    expect(result.hydraulicPrerequisite).toMatchObject({
      code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.SUPPORTED_DENSITY_ORIENTATION,
    });
    expect(result.rootFailureReason).toBeNull();
    expect(result.hydraulicRpmEnvelope.length).toBeGreaterThan(0);
    expect(result.hydraulicDiagnosticPoint?.columnDiameterM).toBeGreaterThan(0);
    expect(result.phaseMetadata).toMatchObject({
      densityOrdering: 'CONTINUOUS_HEAVIER',
      densityDifferenceKgM3: 150,
      buoyancyMagnitudeKgM3: 150,
      buoyancyDirection: 'DISPERSED_UPWARD',
      interfacialTensionNM: 0.012,
      countercurrentVelocities: {
        basis: 'DIAGNOSTIC_DIAMETER_ROOT',
      },
      countercurrentMapping: {
        status: 'SUPPORTED_SOURCE_MAPPING',
        continuousDirection: 'DOWNWARD',
        dispersedDirection: 'UPWARD',
        continuousInlet: 'TOP',
        continuousOutlet: 'BOTTOM',
        dispersedInlet: 'BOTTOM',
        dispersedOutlet: 'TOP',
      },
      closureApplicability: {
        terminalDrag: 'EXECUTED_MYINT_PHASE_ORDER',
        holdup: 'EXECUTED_GARTHE_COUNTERCURRENT_CLOSURE',
        flooding: 'EXECUTED_TURNING_POINT_CLOSURE',
      },
    });
  });

  it('blocks RRBO-continuous denser NMP drops without swapping or absolute density', () => {
    const reversed = resolveKuhniGeometryV120({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    }, authority);

    expect(reversed.status).toBe('NOT_CALCULABLE');
    expect(reversed.hydraulicRpmEnvelope).toEqual([]);
    expect(reversed.excludedExtrapolatedTrials).toEqual([]);
    expect(reversed.hydraulicResolvedColumnDiameterM).toBeNull();
    expect(reversed.hydraulicDiagnosticPoint).toBeNull();
    expect(reversed.hydraulicPrerequisite).toMatchObject({
      code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.DENSER_DISPERSED_DOWNWARD_UNSUPPORTED,
    });
    expect(reversed.rootFailureReason).toEqual(reversed.hydraulicPrerequisite);
    expect(rejectedReasonSet(reversed)).toEqual(new Set([
      KUHNI_HYDRAULIC_PREREQUISITE_CODES.DENSER_DISPERSED_DOWNWARD_UNSUPPORTED,
    ]));
    expect(reversed.rejectedRpmTrials).toHaveLength(12);
    expect(reversed.rejectedRpmTrials.every((trial) => trial.message.includes('reversed-orientation'))).toBe(true);
    expect(reversed.phaseMetadata).toMatchObject({
      densityOrdering: 'CONTINUOUS_LIGHTER',
      densityDifferenceKgM3: -150,
      buoyancyMagnitudeKgM3: 150,
      buoyancyDirection: 'DISPERSED_DOWNWARD',
      interfacialTensionNM: 0.012,
      countercurrentVelocities: {
        continuousSuperficialVelocityMS: null,
        dispersedSuperficialVelocityMS: null,
        basis: 'NO_DIAMETER_ROOT_AVAILABLE',
      },
      continuousPhase: {
        identity: 'RRBO_FEED',
        densityKgM3: 878,
      },
      dispersedPhase: {
        identity: 'WET_NMP_SOLVENT_PHASE',
        densityKgM3: 1028,
      },
      gravityDirections: { continuous: 'UPWARD', dispersed: 'DOWNWARD' },
      countercurrentMapping: {
        status: 'NOT_APPLIED_UNSUPPORTED_ORIENTATION',
        continuousInlet: null,
        continuousOutlet: null,
        dispersedInlet: null,
        dispersedOutlet: null,
      },
      closureApplicability: {
        terminalDrag: 'NOT_EXECUTED_PHASE_ORIENTATION_UNSUPPORTED',
        holdup: 'NOT_EXECUTED_PHASE_ORIENTATION_UNSUPPORTED',
        flooding: 'NOT_EXECUTED_PHASE_ORIENTATION_UNSUPPORTED',
      },
    });
  });

  it('distinguishes equal density from a denser-downward orientation', () => {
    const equal = resolveKuhniGeometryV120({
      ...basis,
      wetSolventPhase: { ...basis.wetSolventPhase, densityKgM3: basis.rrboFeed.densityKgM3 },
    }, authority);

    expect(equal.hydraulicPrerequisite).toMatchObject({
      code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.EQUAL_PHASE_DENSITIES_UNSUPPORTED,
    });
    expect(equal.rootFailureReason).toEqual(equal.hydraulicPrerequisite);
    expect(equal.phaseMetadata).toMatchObject({
      densityOrdering: 'EQUAL',
      densityDifferenceKgM3: 0,
      buoyancyMagnitudeKgM3: 0,
      buoyancyDirection: 'NO_RELATIVE_BUOYANCY',
      gravityDirections: { continuous: 'UNKNOWN', dispersed: 'UNKNOWN' },
    });
    expect(equal.hydraulicRpmEnvelope).toEqual([]);
    expect(equal.hydraulicResolvedColumnDiameterM).toBeNull();
  });

  it('rejects nonphysical densities before terminal, holdup, or flooding roots', () => {
    const nonPhysical = resolveKuhniGeometryV120({
      ...basis,
      wetSolventPhase: { ...basis.wetSolventPhase, densityKgM3: 0 },
    }, authority);

    expect(nonPhysical.hydraulicPrerequisite).toMatchObject({
      code: KUHNI_HYDRAULIC_PREREQUISITE_CODES.NON_PHYSICAL_PHASE_DENSITY,
    });
    expect(nonPhysical.rootFailureReason).toEqual(nonPhysical.hydraulicPrerequisite);
    expect(nonPhysical.phaseMetadata).toMatchObject({
      densityOrdering: 'NON_PHYSICAL',
      densityDifferenceKgM3: -878,
      buoyancyMagnitudeKgM3: 878,
      buoyancyDirection: 'UNKNOWN',
      sourceApplicability: { status: 'UNSUPPORTED_EQUAL_OR_NON_PHYSICAL' },
    });
    expect(nonPhysical.hydraulicRpmEnvelope).toEqual([]);
    expect(nonPhysical.hydraulicResolvedColumnDiameterM).toBeNull();
  });

  it('keeps historical V1.0.0/V1.1.0 replay artifacts and hashes unchanged', () => {
    const historicalV100 = resolveKuhniGeometryV100(basis, authority);
    const historicalV110 = resolveKuhniGeometryV110(basis, authority);
    const active = resolveKuhniGeometryV120(basis, authority);

    expect(historicalV100.engine.version).toBe('KUHNI_GEOMETRY_RESOLVER_V1.0.0');
    expect(historicalV110.engine.version).toBe(KUHNI_GEOMETRY_RESOLVER_V110_VERSION);
    expect(historicalV100.engine.implementationHash).toBe(KUHNI_GEOMETRY_RESOLVER_V100_HASH);
    expect(historicalV110.engine.implementationHash).toBe(KUHNI_GEOMETRY_RESOLVER_V110_HASH);
    expect(KUHNI_GEOMETRY_RESOLVER_HASH).toBe('182bee35c75bfd102339abca5c7f93bcdd6bcfe3ce89f4512f25bb001eb2ba97');
    expect(KUHNI_GEOMETRY_RESOLVER_V100_HASH).toBe('d0be9dbe91002fdf979bc4657283cca467268d69c8c58264fe2f3dbdb6085598');
    expect(active.engine.version).toBe(KUHNI_GEOMETRY_RESOLVER_V120_VERSION);
    expect(active.calculationHash).not.toBe(historicalV110.calculationHash);
    expect(active.hydraulicRpmEnvelope.map(({ operatingHydraulics: _operatingHydraulics, ...trial }) => trial))
      .toEqual(historicalV110.hydraulicRpmEnvelope.map(({ operatingHydraulics: _operatingHydraulics, ...trial }) => trial));
  });
});