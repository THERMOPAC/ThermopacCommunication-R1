import { describe, expect, it } from 'vitest';
import { deriveStage4PrePilotSizing } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';

const stage3 = () => ({
  id: 42,
  immutableHash: 'a'.repeat(64),
  stage1SnapshotHash: 'b'.repeat(64),
  result: {
    theoreticalStagesUsed: {
      value: 5,
      provenance: 'STAGE_2_CALCULATED_NT',
      stage2JobId: 'stage-2-job',
      stage2ResultHash: 'c'.repeat(64),
    },
    hydraulicDiagnosticPoint: {
      status: 'CALCULATED_IN_RANGE',
      columnDiameterM: .974213,
    },
  },
});

const input = () => ({
  calculatedNt: 5,
  stage2JobId: 'stage-2-job',
  stage2ResultHash: 'c'.repeat(64),
  stage3: stage3(),
});

describe('Stage 4 HETS pre-pilot sizing projection', () => {
  it('uses the dynamic accepted Stage-2 Nt and persisted Stage-3 diameter at full calculation precision', () => {
    const result = deriveStage4PrePilotSizing(input());

    expect(result.hetsSizing).toEqual({
      stage2TheoreticalStages: 5,
      stage3HydraulicColumnDiameterM: .974213,
      compartmentHeightRule: '0.5D',
      physicalCompartmentHeightM: .4871065,
      screeningHetsMPerTheoreticalStage: 1,
      calculatedScreeningCompartmentEfficiency: .4871065,
      requiredActiveHeightM: 5,
      requiredPhysicalCompartments: 11,
      installedActiveHeightM: 5.3581715,
      designStatus: 'PRE-PILOT SCREENING',
    });
    expect(result.mainOutputs.activeHeightM).toBe(5);
    expect(result.mainOutputs.installedActiveHeightM).toBe(5.3581715);
  });

  it('keeps Stage-4 sizing on accepted Stage-2 N_T when Stage-3 geometry is fixed at 7', () => {
    const fixedGeometryStage3 = {
      ...stage3(),
      result: {
        ...stage3().result,
        theoreticalStagesUsed: {
          value: 7,
          provenance: 'STAGE3_GEOMETRY_DESIGN_NT',
          label: 'FIXED PRE-PILOT KUHNI GEOMETRY DESIGN BASIS (STAGE3_GEOMETRY_DESIGN_NT=7)',
          stage3GeometryDesignNt: 7,
          stage2AcceptedPredictiveNt: 4,
          stage2AcceptedPredictiveNtProvenance: 'STAGE_2_CALCULATED_NT',
          stage2AcceptedPredictiveNtLabel: 'STAGE-2 ACCEPTED PREDICTIVE N_T',
          stage2JobId: 'stage-2-job',
          stage2ResultHash: 'c'.repeat(64),
          reason: null,
        },
      },
    };
    const result = deriveStage4PrePilotSizing({
      calculatedNt: 4,
      stage2JobId: 'stage-2-job',
      stage2ResultHash: 'c'.repeat(64),
      stage3: fixedGeometryStage3,
    });

    expect(result.calculatedNt.value).toBe(4);
    expect(result.hetsSizing.stage2TheoreticalStages).toBe(4);
    expect(result.hetsSizing.requiredActiveHeightM).toBe(4);
  });

  it('does not let client-like manual values alter the authorized HETS calculation', () => {
    const result = deriveStage4PrePilotSizing({
      ...input(),
      hetsM: .4,
      overallEfficiency: .9,
    } as any);

    expect(result.hetsSizing.screeningHetsMPerTheoreticalStage).toBe(1);
    expect(result.hetsSizing.calculatedScreeningCompartmentEfficiency).toBe(.4871065);
    expect(result.hetsSizing.requiredPhysicalCompartments).toBe(11);
  });

  it('does not require retired transport, RPM, d32, or holdup inputs for HETS sizing', () => {
    const result = deriveStage4PrePilotSizing(input());
    expect(result.selectedStage3Hydraulics).toEqual(expect.objectContaining({
      diameterM: .974213,
      source: 'PERSISTED_STAGE3_HYDRAULIC_DIAGNOSTIC_POINT_NO_STAGE4_RESELECTION',
    }));
  });

  it('admits an independently checked reverse pre-pilot root only through the orientation-compatible HETS route', () => {
    const reverseStage3 = {
      ...stage3(),
      result: {
        theoreticalStagesUsed: {
          value: 7,
          provenance: 'STAGE3_GEOMETRY_DESIGN_NT',
          stage3GeometryDesignNt: 7,
          stage2AcceptedPredictiveNt: null,
          stage2JobId: null,
          stage2ResultHash: null,
        },
        hydraulicDiagnosticPoint: null,
      },
    };
    const result = deriveStage4PrePilotSizing({
      calculatedNt: 4,
      stage2JobId: 'stage-2-equivalent',
      stage2ResultHash: 'e'.repeat(64),
      stage3: reverseStage3,
      stage2Stage1Compatibility: {
        status: 'EXACT_EQUILIBRIUM_INPUT_MATCH_EXCLUDING_HYDRAULIC_PHASE_ORIENTATION',
        currentStage1SnapshotHash: 'b'.repeat(64),
        persistedStage2Stage1SnapshotHash: 'd'.repeat(64),
        currentEquilibriumScientificInputHash: 'f'.repeat(64),
        persistedEquilibriumScientificInputHash: 'f'.repeat(64),
        excludedScientificInputField: 'stage1.phaseConfiguration',
        currentPhaseConfiguration: 'rrbo-continuous-nmp-dispersed',
        persistedStage2PhaseConfiguration: 'nmp-continuous-rrbo-dispersed',
      },
      stage3PrePilotHetsAdmission: {
        status: 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE',
        source: 'V150_EXTRAPOLATED_MODEL_ROOT',
        columnDiameterM: .6930996970569214,
        stage3PresentationQualificationHash: 'p'.repeat(64),
        limitations: [],
      },
    });

    expect(result.calculatedNt.value).toBe(4);
    expect(result.hetsSizing.stage3HydraulicColumnDiameterM).toBe(.6930996970569214);
    expect(result.selectedStage3Hydraulics.source)
      .toBe('PERSISTED_STAGE3_INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE_NO_STAGE4_RESELECTION');
    expect(result.stage3HetsAdmission).toMatchObject({
      status: 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE',
      source: 'V150_EXTRAPOLATED_MODEL_ROOT',
    });
  });

  it('does not permit a pre-pilot root to bypass exact Stage-2 equilibrium compatibility', () => {
    const reverseStage3 = {
      ...stage3(),
      result: {
        theoreticalStagesUsed: {
          value: 7, provenance: 'STAGE3_GEOMETRY_DESIGN_NT',
          stage3GeometryDesignNt: 7, stage2AcceptedPredictiveNt: null,
          stage2JobId: null, stage2ResultHash: null,
        },
        hydraulicDiagnosticPoint: null,
      },
    };
    expect(() => deriveStage4PrePilotSizing({
      calculatedNt: 4, stage2JobId: 'stage-2-equivalent', stage2ResultHash: 'e'.repeat(64),
      stage3: reverseStage3,
      stage3PrePilotHetsAdmission: {
        status: 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE',
        source: 'V150_EXTRAPOLATED_MODEL_ROOT', columnDiameterM: .6930996970569214,
        stage3PresentationQualificationHash: 'p'.repeat(64), limitations: [],
      },
    })).toThrow('STAGE4_STAGE3_STALE_OR_NOT_SAME_LINEAGE_WITH_CALCULATED_STAGE2_NT');
  });

  it('rejects an invalid Stage-2 Nt rather than applying a default', () => {
    expect(() => deriveStage4PrePilotSizing({ ...input(), calculatedNt: 0 }))
      .toThrow('STAGE4_VALID_CALCULATED_STAGE2_NT_REQUIRED_NO_DEFAULT_APPLIED');
  });

  it('rejects stale Stage-3 Stage-2 authority rather than carrying a mismatched diameter forward', () => {
    const stale = input();
    stale.stage3.result.theoreticalStagesUsed.stage2ResultHash = 'd'.repeat(64);
    expect(() => deriveStage4PrePilotSizing(stale))
      .toThrow('STAGE4_STAGE3_STALE_OR_NOT_SAME_LINEAGE_WITH_CALCULATED_STAGE2_NT');
  });

  it('rejects a missing or invalid persisted Stage-3 screening diameter', () => {
    const invalid = input();
    invalid.stage3.result.hydraulicDiagnosticPoint.columnDiameterM = 0;
    expect(() => deriveStage4PrePilotSizing(invalid))
      .toThrow('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  });
});