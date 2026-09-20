import { describe, expect, it } from 'vitest';
import { deriveStage4PrePilotSizing } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';
import {
  ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
  ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
} from '../server/ecr-pre-pilot/stage3-stage4-optimizer';

const stage1Hash = 'b'.repeat(64);

function stage3(diameterM = .6, hcToColumn = .3) {
  const compartmentHeightM = diameterM * hcToColumn;
  return {
    id: 43,
    immutableHash: 'd'.repeat(64),
    stage1SnapshotHash: stage1Hash,
    result: {
      engine: {
        version: ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
        implementationHash: ECR_STAGE3_STAGE4_OPTIMIZER_HASH,
      },
      stage1Authority: { snapshotHash: stage1Hash },
      processBasis: { stage1SnapshotHash: stage1Hash },
      selectedOrientation: 'nmp-continuous-rrbo-dispersed',
      stage4GeometryInput: {
        status: 'SELECTED_IMMUTABLE_OPTIMIZER_GEOMETRY',
        columnDiameterM: diameterM,
        compartmentHeightM,
        hcToColumn,
        rotorDiameterM: diameterM * .4,
        rotorToColumn: .4,
        freeArea: .3,
        rpm: 50,
        optimizerResultHash: 'o'.repeat(64),
      },
    },
  };
}

function derive(diameterM = .6, calculatedNt: number | null = 5) {
  return deriveStage4PrePilotSizing({
    calculatedNt,
    stage2JobId: calculatedNt == null ? null : 'stage-2-job',
    stage2ResultHash: calculatedNt == null ? null : 'c'.repeat(64),
    stage3: stage3(diameterM),
  });
}

describe('Stage 4 adopted compartment-efficiency sizing projection', () => {
  it('implements the fixed-Nt=7, eta=.40 Design269 result from persisted hc', () => {
    const result = derive(.6, 5);
    expect(result.hetsSizing).toEqual({
      sizingMethod: 'ADOPTED_COMPARTMENT_EFFICIENCY',
      designCompartmentEfficiency: .4,
      fixedDesignTheoreticalStages: 7,
      actualStage2TheoreticalStagesReference: 5,
      stage3HydraulicColumnDiameterM: .6,
      compartmentHeightRule: 'PERSISTED_STAGE3_SELECTED_hc',
      physicalCompartmentHeightM: .18,
      impliedInstalledHetsMPerTheoreticalStage: 3.24 / 7,
      requiredActiveHeightM: 3.24,
      requiredPhysicalCompartments: 18,
      installedActiveHeightM: 3.24,
      designStatus: 'PRE-PILOT SCREENING',
    });
    expect(result.hetsSizing).not.toHaveProperty('screeningHetsMPerTheoreticalStage');
    expect(result.hetsSizing).not.toHaveProperty('calculatedScreeningCompartmentEfficiency');
    expect(result.mainOutputs).toMatchObject({
      physicalCompartments: 18,
      activeHeightM: 3.24,
      requiredActiveHeightM: 3.24,
      installedActiveHeightM: 3.24,
    });
  });

  it.each([
    [.6, .18, 3.24],
    [.7, .21, 3.78],
    [.8, .24, 4.32],
    [.9, .27, 4.86],
    [1, .3, 5.4],
  ])('keeps NC=18 while persisted Stage-3 diameter %f scales hc and height', (diameter, hc, height) => {
    const result = derive(diameter, 7);
    expect(result.hetsSizing.requiredPhysicalCompartments).toBe(18);
    expect(result.hetsSizing.physicalCompartmentHeightM).toBeCloseTo(hc, 12);
    expect(result.hetsSizing.requiredActiveHeightM).toBeCloseTo(height, 12);
    expect(result.hetsSizing.installedActiveHeightM).toBeCloseTo(height, 12);
  });

  it.each([4, 5, 7, 10])('keeps actual Stage-2 Nt=%i reference-only', actualNt => {
    const result = derive(.6, actualNt);
    expect(result.actualStage2NtReference).toMatchObject({
      value: actualNt,
      status: 'AVAILABLE_REFERENCE_ONLY',
    });
    expect(result.hetsSizing.fixedDesignTheoreticalStages).toBe(7);
    expect(result.hetsSizing.requiredPhysicalCompartments).toBe(18);
  });

  it('allows an absent Stage-2 reference without changing fixed-Nt sizing', () => {
    const result = derive(.6, null);
    expect(result.actualStage2NtReference).toMatchObject({
      value: null,
      status: 'NOT_AVAILABLE_REFERENCE_ONLY',
    });
    expect(result.hetsSizing.requiredPhysicalCompartments).toBe(18);
  });

  it('fails closed without persisted authoritative Stage-3 hc and never infers hc=.5D', () => {
    const invalid = stage3();
    invalid.result.stage4GeometryInput.compartmentHeightM = 0;
    expect(() => deriveStage4PrePilotSizing({ stage3: invalid }))
      .toThrow('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  });

  it('rejects malformed supplied Stage-2 reference evidence', () => {
    expect(() => deriveStage4PrePilotSizing({
      calculatedNt: 0,
      stage2JobId: 'stage-2-job',
      stage2ResultHash: 'c'.repeat(64),
      stage3: stage3(),
    })).toThrow('STAGE4_ACTUAL_STAGE2_NT_REFERENCE_INVALID');
  });
});