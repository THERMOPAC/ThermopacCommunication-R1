import { describe, expect, it } from 'vitest';
import { deriveStage4PrePilotSizing } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';
import {
  ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
  ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
} from '../server/ecr-pre-pilot/stage3-stage4-optimizer';

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
  it('uses the current optimizer geometry and never regenerates legacy half-diameter compartments', () => {
    const stage1Hash = 'b'.repeat(64);
    const result = {
      engine: {
        version: ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
        implementationHash: ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
      },
      stage1Authority: { snapshotHash: stage1Hash },
      processBasis: { stage1SnapshotHash: stage1Hash },
      selectionRationale: {
        diameterSelection: {
          rule: 'NEXT_SMALLEST_ACCEPTED_ADEQUATE_DIAMETER',
          acceptedAdequateDiametersM: [0.3, 0.4, 0.5],
          SMALLEST_ACCEPTED_ADEQUATE_DIAMETER: 0.3,
          SELECTED_NEXT_SMALLEST_ACCEPTED_DIAMETER: 0.4,
          status: 'SELECTED',
        },
      },
      stage4GeometryInput: {
        status: 'SELECTED_IMMUTABLE_OPTIMIZER_GEOMETRY',
        columnDiameterM: 0.4,
        compartmentHeightM: 0.08,
        hcToColumn: 0.2,
        rotorDiameterM: 0.16,
        rotorToColumn: 0.4,
        freeArea: 0.3,
        rpm: 50,
      },
      hydraulicDiagnosticPoint: null,
      theoreticalStagesUsed: {
        value: 7,
        provenance: 'STAGE3_GEOMETRY_DESIGN_NT',
        stage3GeometryDesignNt: 7,
      },
    };
    const resultSizing = deriveStage4PrePilotSizing({
      calculatedNt: 5,
      stage2JobId: 'stage-2-job',
      stage2ResultHash: 'c'.repeat(64),
      stage3: {
        id: 43,
        immutableHash: 'd'.repeat(64),
        stage1SnapshotHash: stage1Hash,
        result,
      },
    });
    expect(resultSizing.mainOutputs.diameterM).toBe(0.4);
    expect(resultSizing.selectedStage3Hydraulics.ranking?.diameterSelection)
      .toEqual(result.selectionRationale.diameterSelection);
    expect(resultSizing.selectedStage3Hydraulics.compartmentHeightM).toBe(0.08);
    expect(resultSizing.hetsSizing.requiredPhysicalCompartments).toBe(Math.ceil(2.8 / 0.08));
    expect(resultSizing.implementation.version).not.toContain('LEGACY');
  });

  it('uses fixed Stage-4 design Nt=7 and retains the actual Stage-2 value as reference', () => {
    const result = deriveStage4PrePilotSizing(input());

    expect(result.hetsSizing).toEqual({
      fixedDesignTheoreticalStages: 7,
      actualStage2TheoreticalStagesReference: 5,
      stage3HydraulicColumnDiameterM: .974213,
      compartmentHeightRule: '0.5D',
      physicalCompartmentHeightM: .4871065,
      screeningHetsMPerTheoreticalStage: .4,
      calculatedScreeningCompartmentEfficiency: 1.21776625,
      requiredActiveHeightM: 2.8,
      requiredPhysicalCompartments: 6,
      installedActiveHeightM: 2.922639,
      designStatus: 'PRE-PILOT SCREENING',
    });
    expect(result.designNt).toMatchObject({ value: 7 });
    expect(result.actualStage2NtReference).toMatchObject({ value: 5, status: 'AVAILABLE_REFERENCE_ONLY' });
    expect(result.mainOutputs.activeHeightM).toBe(2.8);
    expect(result.mainOutputs.installedActiveHeightM).toBe(2.922639);
  });

  it('keeps Stage-4 HETS sizing fixed at 7 when Stage-3 geometry is also fixed at 7', () => {
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

    expect(result.actualStage2NtReference.value).toBe(4);
    expect(result.hetsSizing.fixedDesignTheoreticalStages).toBe(7);
    expect(result.hetsSizing.actualStage2TheoreticalStagesReference).toBe(4);
    expect(result.hetsSizing.requiredActiveHeightM).toBe(2.8);
  });

  it.each([4, 10])('keeps physical sizing at fixed 7 when actual Stage-2 Nt is %i', actualNt => {
    const result = deriveStage4PrePilotSizing({
      ...input(),
      calculatedNt: actualNt,
    });

    expect(result.actualStage2NtReference.value).toBe(actualNt);
    expect(result.hetsSizing).toMatchObject({
      fixedDesignTheoreticalStages: 7,
      requiredActiveHeightM: 2.8,
      requiredPhysicalCompartments: 6,
      installedActiveHeightM: 2.922639,
    });
  });

  it('sizes at fixed 7 when actual Stage-2 evidence is unavailable', () => {
    const result = deriveStage4PrePilotSizing({
      stage3: stage3(),
    });

    expect(result.actualStage2NtReference).toMatchObject({
      value: null,
      status: 'NOT_AVAILABLE_REFERENCE_ONLY',
    });
    expect(result.hetsSizing).toMatchObject({
      fixedDesignTheoreticalStages: 7,
      actualStage2TheoreticalStagesReference: null,
      requiredActiveHeightM: 2.8,
      requiredPhysicalCompartments: 6,
      installedActiveHeightM: 2.922639,
    });
  });

  it('does not let client-like manual values alter the authorized fixed HETS calculation', () => {
    const result = deriveStage4PrePilotSizing({
      ...input(),
      hetsM: .4,
      overallEfficiency: .9,
    } as any);

    expect(result.hetsSizing.screeningHetsMPerTheoreticalStage).toBe(.4);
    expect(result.hetsSizing.calculatedScreeningCompartmentEfficiency).toBe(1.21776625);
    expect(result.hetsSizing.requiredPhysicalCompartments).toBe(6);
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

    expect(result.actualStage2NtReference.value).toBe(4);
    expect(result.hetsSizing).toMatchObject({
      fixedDesignTheoreticalStages: 7,
      requiredActiveHeightM: 2.8,
      requiredPhysicalCompartments: 9,
      installedActiveHeightM: .6930996970569214 / 2 * 9,
    });
    expect(result.hetsSizing.stage3HydraulicColumnDiameterM).toBe(.6930996970569214);
    expect(result.selectedStage3Hydraulics.source)
      .toBe('PERSISTED_STAGE3_INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE_NO_STAGE4_RESELECTION');
    expect(result.stage3HetsAdmission).toMatchObject({
      status: 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE',
      source: 'V150_EXTRAPOLATED_MODEL_ROOT',
    });
  });

  it('admits the reverse HETS-only root when actual Stage-2 evidence is unavailable', () => {
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
    const result = deriveStage4PrePilotSizing({
      stage3: reverseStage3,
      stage3PrePilotHetsAdmission: {
        status: 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE',
        source: 'V150_EXTRAPOLATED_MODEL_ROOT', columnDiameterM: .6930996970569214,
        stage3PresentationQualificationHash: 'p'.repeat(64), limitations: [],
      },
    });
    expect(result.actualStage2NtReference.value).toBeNull();
    expect(result.hetsSizing.installedActiveHeightM).toBeCloseTo(3.1189486368, 10);
  });

  it('keeps reverse-orientation physical sizing at fixed 7 when actual Stage-2 Nt is 10', () => {
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
    const result = deriveStage4PrePilotSizing({
      calculatedNt: 10, stage2JobId: 'stage-2-reverse', stage2ResultHash: 'e'.repeat(64),
      stage3: reverseStage3,
      stage3PrePilotHetsAdmission: {
        status: 'INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE',
        source: 'V150_EXTRAPOLATED_MODEL_ROOT', columnDiameterM: .6930996970569214,
        stage3PresentationQualificationHash: 'p'.repeat(64), limitations: [],
      },
    });
    expect(result.actualStage2NtReference.value).toBe(10);
    expect(result.hetsSizing).toMatchObject({
      fixedDesignTheoreticalStages: 7,
      requiredActiveHeightM: 2.8,
      requiredPhysicalCompartments: 9,
      installedActiveHeightM: .6930996970569214 / 2 * 9,
    });
  });

  it('rejects malformed supplied Stage-2 reference evidence rather than silently changing it', () => {
    expect(() => deriveStage4PrePilotSizing({ ...input(), calculatedNt: 0 }))
      .toThrow('STAGE4_ACTUAL_STAGE2_NT_REFERENCE_INVALID');
  });

  it('does not substitute a stale Stage-3 embedded Stage-2 value for the explicit actual reference', () => {
    const stale = input();
    stale.stage3.result.theoreticalStagesUsed.stage2ResultHash = 'd'.repeat(64);
    const result = deriveStage4PrePilotSizing(stale);
    expect(result.actualStage2NtReference.value).toBe(5);
    expect(result.hetsSizing.requiredActiveHeightM).toBe(2.8);
  });

  it('rejects a missing or invalid persisted Stage-3 screening diameter', () => {
    const invalid = input();
    invalid.stage3.result.hydraulicDiagnosticPoint.columnDiameterM = 0;
    expect(() => deriveStage4PrePilotSizing(invalid))
      .toThrow('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  });
});