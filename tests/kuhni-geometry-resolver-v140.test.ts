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
import {
  assessReverseExtrapolatedModelRoot,
  KUHNI_GEOMETRY_RESOLVER_V150_HASH,
  KUHNI_GEOMETRY_RESOLVER_V150_VERSION,
  resolveKuhniGeometryV150,
  selectIllustrativeExtrapolatedModelRoot,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver-v150';

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

describe('Kühni V1.5.0 reverse-orientation extrapolated model-root illustration', () => {
  it('selects only an invariant-checked extrapolated model root for illustration', () => {
    const result = resolveKuhniGeometryV150({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    }, authority);
    const point = result.illustrativeExtrapolatedModelRoot;

    expect(result.engine).toMatchObject({
      version: KUHNI_GEOMETRY_RESOLVER_V150_VERSION,
      implementationHash: KUHNI_GEOMETRY_RESOLVER_V150_HASH,
    });
    expect(result.illustrativeModelRootSelection.status).toBe('EXTRAPOLATED_MODEL_ROOT_SELECTED_FOR_ILLUSTRATION');
    expect(point).not.toBeNull();
    expect(point?.rpm).toBe(25);
    expect(point?.modelRootAssessment.status).toBe('EXTRAPOLATED_MODEL_ROOT');
    expect(point?.modelRootAssessment.sourceQualification).toBe('CALCULATED_EXTRAPOLATED');
    expect(point?.modelRootAssessment.physicalDomain.status).toBe('PASS');
    expect(point?.modelRootAssessment.numericalClosure.status).toBe('PASS');
    expect(point?.modelRootAssessment.selectedProperties.status).toBe('PASS');
    expect(point?.modelRootAssessment.shape.status).toBe('PASS');
    expect(point?.modelRootAssessment.holdup.status).toBe('PASS');
    expect(point?.modelRootAssessment.massFlux.status).toBe('PASS');
    expect(point?.modelRootAssessment.evidenceQualification.status).toBe('PASS');
    expect(result.illustrativeModelRootSelection.physicalFeasibility).toBe('NOT_ESTABLISHED');
    expect(result.illustrativeModelRootSelection.designDiameter).toBeNull();
    expect(point?.massFluxKgM2S).toBeGreaterThan(0);
    expect(result.hydraulicRpmEnvelope).toEqual([]);
    expect(result.hydraulicDiagnosticPoint).toBeNull();
    expect(result.hydraulicResolvedColumnDiameterM).toBeNull();
    expect(result.illustrativeExtrapolatedModelRootDiameterM).toBe(point?.columnDiameterM);
    expect(result.stage4GovernedAdmission).toMatchObject({
      status: 'BLOCKED_REQUIRES_CALCULATED_IN_RANGE_STAGE3_TRIAL',
      illustrativeModelRootIsNotAnInput: true,
    });
    expect(result.reverseOrientationDiagnostics.modelRootRejectedTrials).toHaveLength(7);
    expect(result.reverseOrientationDiagnostics.modelRootRejectedTrials[0].modelRootAssessment).toMatchObject({
      status: 'BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE',
      category: 'NUMERICAL_ROOT_FAILURE',
    });
    expect(result.reverseOrientationDiagnostics.sourceRangeWarningsRetained).toBe(true);
    expect(point?.modelRootAssessment.warnings.some((warning: string) => warning.includes('UNQUALIFIED'))).toBe(true);
    const replay = resolveKuhniGeometryV150({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    }, authority);
    expect(replay.calculationHash).toBe(result.calculationHash);
  });

  it('retains physical shape failures as blocking while preserving warnings', () => {
    const result = resolveKuhniGeometryV150({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    }, authority);
    const blocked = result.reverseOrientationDiagnostics.trials
      .find((trial: any) => trial.rpm === 20);

    expect(blocked?.modelRootAssessment.status).toBe('BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE');
    expect(blocked?.modelRootAssessment.shape.status).toBe('FAIL');
    expect(blocked?.modelRootAssessment.shape.failures).toContain('SHAPE_ASPECT_RATIO_NOT_REAL');
    expect(blocked?.modelRootAssessment.warnings).toContain(
      'REVERSE_ORIENTATION_SWARM_HOLDUP_CLOSURE_UNQUALIFIED',
    );
    expect(result.illustrativeModelRootSelection.selectedRpm).toBe(25);
  });

  it('fails closed when evidence warnings or primitive invariants are lost', () => {
    const result: any = resolveKuhniGeometryV150({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    }, authority);
    const point = result.illustrativeExtrapolatedModelRoot;
    const warning = point.modelRootAssessment.evidenceQualification.requiredWarnings[0];

    const warningLoss = assessReverseExtrapolatedModelRoot({
      ...point,
      applicability: {
        ...point.applicability,
        codes: point.applicability.codes.filter((code: string) => code !== warning),
      },
    }, { ...basis, phaseConfiguration: 'rrbo-continuous-nmp-dispersed' });
    expect(warningLoss.status).toBe('BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE');
    expect(warningLoss.evidenceQualification.status).toBe('FAIL');
    expect(warningLoss.evidenceQualification.missingWarnings).toContain(warning);

    const invalidStatus = assessReverseExtrapolatedModelRoot({
      ...point,
      status: 'CALCULATED_IN_RANGE',
    }, { ...basis, phaseConfiguration: 'rrbo-continuous-nmp-dispersed' });
    expect(invalidStatus.status).toBe('BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE');
    expect(invalidStatus.evidenceQualification.statusFailures).toContain(
      'TRIAL_STATUS_NOT_CALCULATED_EXTRAPOLATED',
    );
    const invalidApplicabilityStatus = assessReverseExtrapolatedModelRoot({
      ...point,
      applicability: { ...point.applicability, status: 'CALCULATED_IN_RANGE' },
    }, { ...basis, phaseConfiguration: 'rrbo-continuous-nmp-dispersed' });
    expect(invalidApplicabilityStatus.evidenceQualification.statusFailures).toContain(
      'APPLICABILITY_STATUS_NOT_CALCULATED_EXTRAPOLATED',
    );

    const invalidLoading = assessReverseExtrapolatedModelRoot({
      ...point,
      actualLoading: point.actualLoading + 0.01,
    }, { ...basis, phaseConfiguration: 'rrbo-continuous-nmp-dispersed' });
    expect(invalidLoading.status).toBe('BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE');
    expect(invalidLoading.numericalClosure.failures).toContain(
      'FLOOD_LOADING_ROOT_NOT_CLOSED_FROM_PRIMITIVE_FLOW_AREA',
    );

    const invalidForce = assessReverseExtrapolatedModelRoot({
      ...point,
      terminal: { ...point.terminal, forceBalanceResidualN: 1 },
    }, { ...basis, phaseConfiguration: 'rrbo-continuous-nmp-dispersed' });
    expect(invalidForce.status).toBe('BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE');
    expect(invalidForce.numericalClosure.failures).toContain('SIGNED_FORCE_BALANCE_NOT_CLOSED');

    const invalidFlow = assessReverseExtrapolatedModelRoot({
      ...point,
      continuousSuperficialVelocityMS: point.continuousSuperficialVelocityMS * 2,
    }, { ...basis, phaseConfiguration: 'rrbo-continuous-nmp-dispersed' });
    expect(invalidFlow.status).toBe('BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE');
    expect(invalidFlow.numericalClosure.failures).toContain('PRIMITIVE_CONTINUOUS_FLOW_AREA_MISMATCH');

    const invalidHoldup = assessReverseExtrapolatedModelRoot({
      ...point,
      floodHoldup: 0,
    }, { ...basis, phaseConfiguration: 'rrbo-continuous-nmp-dispersed' });
    expect(invalidHoldup.status).toBe('BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE');
    expect(invalidHoldup.holdup.failures).toContain('FLOOD_HOLDUP_NOT_STRICTLY_INTERIOR');

    const invalidDensitySign = assessReverseExtrapolatedModelRoot({
      ...point,
      terminal: { ...point.terminal, deltaRhoKgM3: 150 },
    }, { ...basis, phaseConfiguration: 'rrbo-continuous-nmp-dispersed' });
    expect(invalidDensitySign.status).toBe('BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE');
    expect(invalidDensitySign.numericalClosure.failures).toContain('SIGNED_DENSITY_DIFFERENCE_NOT_REVERSE');
  });

  it('uses deterministic minimum-diameter then RPM semantics for multiple roots', () => {
    const result: any = resolveKuhniGeometryV150({
      ...basis,
      phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    }, authority);
    const root = result.illustrativeExtrapolatedModelRoot;
    const larger = {
      ...root,
      rpm: 5,
      columnDiameterM: root.columnDiameterM + 0.01,
    };
    const sameDiameterLowerRpm = {
      ...root,
      rpm: root.rpm - 1,
      columnDiameterM: root.columnDiameterM,
    };
    expect(selectIllustrativeExtrapolatedModelRoot([larger, root, sameDiameterLowerRpm]))
      .toMatchObject({ rpm: sameDiameterLowerRpm.rpm, columnDiameterM: root.columnDiameterM });
    expect(selectIllustrativeExtrapolatedModelRoot([{
      ...root,
      modelRootAssessment: { ...root.modelRootAssessment, status: 'BLOCKED_PHYSICAL_OR_NUMERICAL_OR_EVIDENCE' },
    }])).toBeNull();
  });
});