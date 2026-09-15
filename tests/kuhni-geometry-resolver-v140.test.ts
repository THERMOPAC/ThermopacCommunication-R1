import { describe, expect, it } from 'vitest';
import type { HydrodynamicProcessBasis } from '../server/ecr-pre-pilot/kuhni-hydrodynamics';
import {
  PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  type TheoreticalStageAuthority,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver';
import {
  KUHNI_GEOMETRY_RESOLVER_V140_HASH,
  KUHNI_GEOMETRY_RESOLVER_V140_VERSION,
  KUHNI_REVERSE_ORIENTATION_CODES,
  resolveKuhniGeometryV140,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver-v140';

const basis: HydrodynamicProcessBasis = {
  schemaVersion: 'ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1',
  stage1SnapshotHash: 'c'.repeat(64),
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

const authority: TheoreticalStageAuthority = {
  value: PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  provenance: 'STAGE3_GEOMETRY_DESIGN_NT',
  label: 'FIXED PRE-PILOT KUHNI GEOMETRY DESIGN BASIS (STAGE3_GEOMETRY_DESIGN_NT=7)',
  stage3GeometryDesignNt: PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  stage2AcceptedPredictiveNtName: 'STAGE2_ACCEPTED_PREDICTIVE_NT',
  stage2AcceptedPredictiveNt: null,
  stage2AcceptedPredictiveNtProvenance: 'STAGE_2_ACCEPTED_PREDICTIVE_NT_UNAVAILABLE',
  stage2AcceptedPredictiveNtLabel: 'STAGE-2 ACCEPTED PREDICTIVE N_T UNAVAILABLE',
  stage2JobId: null,
  stage2ResultHash: null,
};

describe('Kühni V1.4.0 preliminary reverse-orientation route', () => {
  it('keeps the supported orientation numerical envelope separate and versioned', () => {
    const result = resolveKuhniGeometryV140({
      ...basis,
      phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
    }, authority);

    expect(result.engine).toMatchObject({
      version: KUHNI_GEOMETRY_RESOLVER_V140_VERSION,
      implementationHash: KUHNI_GEOMETRY_RESOLVER_V140_HASH,
    });
    expect(result.hydraulicRpmEnvelope.length).toBeGreaterThan(0);
    expect(result.phaseMetadata).toMatchObject({
      densityDifferenceKgM3: 150,
      buoyancyMagnitudeKgM3: 150,
      buoyancyDirection: 'DISPERSED_UPWARD',
      continuousPhase: { identity: 'WET_NMP_SOLVENT_PHASE', densityKgM3: 1028 },
      dispersedPhase: { identity: 'RRBO_FEED', densityKgM3: 878 },
    });
    expect(result.reverseOrientationDiagnostics).toBeUndefined();
  });

  it('uses signed buoyancy and selected reverse phase properties without admitting diameter', () => {
    const result = resolveKuhniGeometryV140({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    }, authority);
    const diagnostics = result.reverseOrientationDiagnostics;
    const first = diagnostics.trials[0];

    expect(result.engine.version).toBe(KUHNI_GEOMETRY_RESOLVER_V140_VERSION);
    expect(result.status).toBe('PRELIMINARY_REVERSE_ORIENTATION_DIAGNOSTICS');
    expect(result.hydraulicPrerequisite.code).toBe(KUHNI_REVERSE_ORIENTATION_CODES.PRELIMINARY_ONLY);
    expect(result.hydraulicRpmEnvelope).toEqual([]);
    expect(result.hydraulicDiagnosticPoint).toBeNull();
    expect(result.hydraulicResolvedColumnDiameterM).toBeNull();
    expect(result.excludedExtrapolatedTrialCount).toBe(5);
    expect(result.excludedExtrapolatedTrials).toHaveLength(5);
    expect(diagnostics.rejectedTrialCount).toBe(7);
    expect(diagnostics).toMatchObject({
      status: 'PRELIMINARY_EXTRAPOLATION_ONLY',
      excludedFromHydraulicEnvelope: true,
      noGovernedDiameter: true,
      signedBuoyancy: {
        deltaRhoKgM3: -150,
        magnitudeKgM3: 150,
        direction: 'DISPERSED_DOWNWARD',
      },
      countercurrentMapping: {
        continuousPhase: 'RRBO',
        continuousDirection: 'UPWARD',
        continuousInlet: 'BOTTOM',
        continuousOutlet: 'TOP',
        dispersedPhase: 'NMP',
        dispersedDirection: 'DOWNWARD',
        dispersedInlet: 'TOP',
        dispersedOutlet: 'BOTTOM',
      },
    });
    expect(first.phaseProperties.continuous).toMatchObject({
      identity: 'RRBO_FEED',
      densityKgM3: 878,
      dynamicViscosityPaS: 0.056,
    });
    expect(first.phaseProperties.dispersed).toMatchObject({
      identity: 'WET_NMP_SOLVENT_PHASE',
      densityKgM3: 1028,
      dynamicViscosityPaS: 0.001666,
    });
    expect(first.terminal.deltaRhoKgM3).toBe(-150);
    expect(first.terminal.relativeVelocityMS).toBeLessThan(0);
    expect(first.terminal.signedBuoyancyForceN).toBeLessThan(0);
    expect(first.terminal.buoyancyForceMagnitudeN).toBe(
      Math.abs(first.terminal.signedBuoyancyForceN),
    );
    expect(Math.abs(first.terminal.forceBalanceResidualN)).toBeLessThan(1e-12);
    expect(first.countercurrentAtFlood.dispersedVelocityMS).toBeLessThan(0);
    expect(first.countercurrentAtFlood.relativeVelocityMS).toBeLessThan(0);
    expect(first.characteristicVelocityMS).toBeLessThan(0);
    expect(first.swarmVelocityAtFloodMS).toBeLessThan(0);
    expect(first.countercurrentAtFlood.velocityEquation).toBe(
      'uC=+jC/(1-h), uD=-jD/h, w=uD-uC=-(jD/h+jC/(1-h))',
    );
    for (const trial of diagnostics.trials) {
      const areaM2 = Math.PI * trial.columnDiameterM ** 2 / 4;
      expect(trial.actualLoading).toBeCloseTo(
        (basis.rrboFeed.flowM3S + basis.wetSolventPhase.flowM3S)
          / (areaM2 * trial.floodTotalSuperficialVelocityMS),
        12,
      );
      expect(trial.actualLoading).toBeCloseTo(0.7, 10);
      expect(trial.countercurrentAtFlood.continuousVelocityMS).toBeGreaterThan(0);
      expect(trial.countercurrentAtFlood.dispersedVelocityMS).toBeLessThan(0);
      expect(trial.countercurrentAtFlood.relativeVelocityMS).toBeCloseTo(
        trial.countercurrentAtFlood.dispersedVelocityMS
          - trial.countercurrentAtFlood.continuousVelocityMS,
        12,
      );
      expect(Math.abs(trial.terminal.forceBalanceResidualN)).toBeLessThan(1e-12);
    }
    expect(first.applicability.status).toBe('CALCULATED_EXTRAPOLATED');
    expect(first.applicability.codes.some((code) => code.includes('UNQUALIFIED'))).toBe(true);
  });

  it('fails equal and nonphysical densities before reverse numerical closure', () => {
    const equal = resolveKuhniGeometryV140({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
      wetSolventPhase: { ...basis.wetSolventPhase, densityKgM3: basis.rrboFeed.densityKgM3 },
    }, authority);
    expect(equal.hydraulicPrerequisite.code).toBe('EQUAL_PHASE_DENSITIES_UNSUPPORTED');
    expect(equal.hydraulicRpmEnvelope).toEqual([]);
    expect(equal.reverseOrientationDiagnostics).toBeUndefined();

    const nonPhysical = resolveKuhniGeometryV140({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
      wetSolventPhase: { ...basis.wetSolventPhase, densityKgM3: 0 },
    }, authority);
    expect(nonPhysical.hydraulicPrerequisite.code).toBe('NON_PHYSICAL_PHASE_DENSITY');
    expect(nonPhysical.hydraulicRpmEnvelope).toEqual([]);
    expect(nonPhysical.reverseOrientationDiagnostics).toBeUndefined();
  });

  it('preserves density-difference magnitude while reversing the physical sign', () => {
    const supported = resolveKuhniGeometryV140({
      ...basis,
      phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
    }, authority);
    const reverse = resolveKuhniGeometryV140({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    }, authority);

    expect(supported.phaseMetadata.buoyancyMagnitudeKgM3)
      .toBe(reverse.phaseMetadata.buoyancyMagnitudeKgM3);
    expect(supported.phaseMetadata.densityDifferenceKgM3)
      .toBe(-reverse.phaseMetadata.densityDifferenceKgM3);
    expect(supported.phaseMetadata.buoyancyDirection).toBe('DISPERSED_UPWARD');
    expect(reverse.phaseMetadata.buoyancyDirection).toBe('DISPERSED_DOWNWARD');
  });

  it('is deterministic and does not alter historical resolver hashes', () => {
    const first = resolveKuhniGeometryV140({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    }, authority);
    const second = resolveKuhniGeometryV140({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    }, authority);

    expect(first.calculationHash).toBe(second.calculationHash);
    expect(first.engine.extendsImplementationHash).toBeDefined();
    expect(first.engine.implementationHash).toBe(KUHNI_GEOMETRY_RESOLVER_V140_HASH);
    expect(KUHNI_GEOMETRY_RESOLVER_V140_HASH).toBe(
      '9c4eb9c5e8ab2a3fcf20dd510f00bd975e9437db38da561c54ed4e5c4f9d710a',
    );
  });
});