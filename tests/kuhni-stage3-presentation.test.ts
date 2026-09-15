import { describe, expect, it } from 'vitest';
import type { HydrodynamicProcessBasis } from '../server/ecr-pre-pilot/kuhni-hydrodynamics';
import {
  PRE_PILOT_DEFAULT_THEORETICAL_STAGES,
  type TheoreticalStageAuthority,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver';
import { resolveKuhniGeometryV150 } from '../server/ecr-pre-pilot/kuhni-geometry-resolver-v150';
import { qualifyKuhniStage3Presentation } from '../server/ecr-pre-pilot/kuhni-stage3-presentation';

const basis: HydrodynamicProcessBasis = {
  schemaVersion: 'ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1',
  stage1SnapshotHash: 'c'.repeat(64),
  operatingTemperatureC: 50,
  temperatureK: 323.15,
  operatingPressure: 'atmospheric',
  phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
  composition: {
    rrboGrade: 'SN150',
    rrboFeedWt: { saturates: 70, monoAromatics: 10, diAromatics: 10, polyAromatics: 5, polarAromatics: 5, nmp: 0 },
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

describe('Stage-3 additive presentation qualification', () => {
  it('maps only the persisted, independently rechecked V1.5 root to a pre-pilot candidate', () => {
    const result = resolveKuhniGeometryV150(basis, authority);
    const presentation = qualifyKuhniStage3Presentation({
      result,
      processBasis: basis,
      runStage1SnapshotHash: basis.stage1SnapshotHash,
      currentStage1SnapshotHash: basis.stage1SnapshotHash,
      integrityVerified: true,
    });

    expect(presentation.status).toBe('CALCULATED_PRE_PILOT_WITH_MAJOR_SCALE_UP_EXTRAPOLATION');
    expect(presentation.candidate).toMatchObject({
      available: true,
      source: 'V150_EXTRAPOLATED_MODEL_ROOT',
      status: 'CALCULATED_PRE_PILOT_WITH_MAJOR_SCALE_UP_EXTRAPOLATION',
      qualification: 'CALCULATED_PRE_PILOT_WITH_MAJOR_SCALE_UP_EXTRAPOLATION',
      governed: false,
      stage4Input: false,
      independentCheck: 'PASSED',
    });
    expect(presentation.candidate?.columnDiameterM).toBeCloseTo(
      result.illustrativeExtrapolatedModelRoot.columnDiameterM,
      12,
    );
    expect(presentation.candidate).toMatchObject({
      rotorDiameterM: result.illustrativeExtrapolatedModelRoot.rotorDiameterM,
      compartmentHeightM: result.illustrativeExtrapolatedModelRoot.compartmentHeightM,
      rpm: result.illustrativeExtrapolatedModelRoot.rpm,
      d32M: result.illustrativeExtrapolatedModelRoot.d32M,
      floodHoldup: result.illustrativeExtrapolatedModelRoot.floodHoldup,
      actualLoading: result.illustrativeExtrapolatedModelRoot.actualLoading,
      tipSpeedMS: result.illustrativeExtrapolatedModelRoot.tipSpeedMS,
      powerVolumeWM3: result.illustrativeExtrapolatedModelRoot.powerVolumeWM3,
      massFluxKgM2S: result.illustrativeExtrapolatedModelRoot.massFluxKgM2S,
    });
    expect(presentation.limitations.map((item) => item.group)).toEqual([
      'SCALE_UP',
      'ORIENTATION_AND_PHASE_CONTROL',
      'GEOMETRY_AND_CORRELATIONS',
      'DOWNSTREAM_GOVERNANCE',
    ]);
    expect(result.hydraulicRpmEnvelope).toEqual([]);
    expect(result.hydraulicDiagnosticPoint).toBeNull();
  });

  it('fails closed for stale lineage and cannot admit a client-shaped root', () => {
    const result = resolveKuhniGeometryV150(basis, authority);
    const stale = qualifyKuhniStage3Presentation({
      result: {
        ...result,
        illustrativeExtrapolatedModelRoot: {
          ...result.illustrativeExtrapolatedModelRoot,
          columnDiameterM: 123,
        },
      },
      processBasis: basis,
      runStage1SnapshotHash: basis.stage1SnapshotHash,
      currentStage1SnapshotHash: 'd'.repeat(64),
      integrityVerified: true,
    });

    expect(stale.status).toBe('NO_PREPILOT_CANDIDATE');
    expect(stale.candidate).toBeNull();
    expect(stale.failure?.code).toBe('PRESENTATION_STAGE1_LINEAGE_NOT_CURRENT');
  });

  it('classifies the historical supported-orientation point with the same full-chain caveat', () => {
    const supportedBasis = {
      ...basis,
      phaseConfiguration: 'nmp-continuous-rrbo-dispersed' as const,
      rrboFeed: {
        ...basis.rrboFeed,
        densityKgM3: 856,
        dynamicViscosityPaS: 0.03,
      },
      wetSolventPhase: {
        ...basis.wetSolventPhase,
        densityKgM3: 997,
        dynamicViscosityPaS: 0.001083,
      },
    };
    const result = resolveKuhniGeometryV150(supportedBasis, authority);
    const presentation = qualifyKuhniStage3Presentation({
      result,
      processBasis: supportedBasis,
      runStage1SnapshotHash: supportedBasis.stage1SnapshotHash,
      currentStage1SnapshotHash: supportedBasis.stage1SnapshotHash,
      integrityVerified: true,
    });

    expect(presentation.status).toBe('CALCULATED_PRE_PILOT_WITH_MAJOR_SCALE_UP_EXTRAPOLATION');
    expect(presentation.candidate).toMatchObject({
      source: 'CALCULATED_IN_RANGE_TRIAL',
      governed: false,
      stage4Input: false,
    });
    expect(presentation.limitations.map((item) => item.group)).toContain('SCALE_UP');
    expect(presentation.limitations.map((item) => item.group)).toContain('DOWNSTREAM_GOVERNANCE');
  });
});