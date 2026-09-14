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