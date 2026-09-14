import { describe, expect, it } from 'vitest';
import { deriveStage4PrePilotSizing } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';

const stage3 = () => ({
  id: 42,
  immutableHash: 'a'.repeat(64),
  stage1SnapshotHash: 'b'.repeat(64),
  result: {
    theoreticalStagesUsed: {
      value: 6,
      provenance: 'STAGE_2_CALCULATED_NT',
      stage2JobId: 'stage-2-job',
      stage2ResultHash: 'c'.repeat(64),
    },
    hydraulicDiagnosticPoint: {
      status: 'CALCULATED_IN_RANGE',
      columnDiameterM: 1.2,
      rpm: 30,
      d32M: 0.004,
    },
    hydraulicRpmEnvelope: [{
      status: 'CALCULATED_IN_RANGE',
      columnDiameterM: 1.2,
      rpm: 30,
      d32M: 0.004,
      operatingHydraulics: {
        status: 'OPERATING_HOLDUP_CALCULATED',
        operatingHoldup: 0.22,
        floodHoldup: 0.38,
      },
    }],
  },
});

const input = () => ({
  calculatedNt: 6,
  stage2JobId: 'stage-2-job',
  stage2ResultHash: 'c'.repeat(64),
  stage3: stage3(),
});

describe('Stage 4 live pre-pilot physical-sizing projection', () => {
  it('does not allow an unrecognised manual efficiency or HETS payload to bypass the missing closure', () => {
    const result = deriveStage4PrePilotSizing({
      ...input(),
      overallEfficiency: 0.9,
      hetsM: 0.4,
    } as any);

    expect(result.overallEfficiency).toMatchObject({
      value: null,
      status: 'DEPENDENCY_BLOCKED',
      dependency: 'STAGE4_ROTOR_DIAMETER_REQUIRED',
    });
    expect(result.mainOutputs.physicalCompartments).toBeNull();
    expect(result.mainOutputs.activeHeightM).toBeNull();
  });

  it('uses the explicit pre-pilot pitch assumption while leaving output null without a closure', () => {
    const result = deriveStage4PrePilotSizing(input());

    expect(result.mainOutputs.diameterM).toBe(1.2);
    expect(result.physicalGeometry.pitchM).toBe(0.6);
    expect(result.physicalGeometry.pitchAssumption).toContain('0.5');
    expect(result.mainOutputs.overallEfficiency).toBeNull();
  });

  it('does not let an extension bypass source and geometry blockers', () => {
    let called = false;
    const result = deriveStage4PrePilotSizing({
      ...input(),
      overallEfficiencyClosure: {
        implementationId: 'unqualified', version: 'test', implementationHash: 'test',
        calculate: () => { called = true; return 0.9; },
      },
    });
    expect(called).toBe(false);
    expect(result.mainOutputs.physicalCompartments).toBeNull();
    expect(result.mixingAudit.blockers[0].code).toBe('STAGE4_ROTOR_DIAMETER_REQUIRED');
  });

  it('rejects an invalid Stage-2 NT rather than applying the historical default of seven', () => {
    expect(() => deriveStage4PrePilotSizing({ ...input(), calculatedNt: 0 }))
      .toThrow('STAGE4_VALID_CALCULATED_STAGE2_NT_REQUIRED_NO_DEFAULT_APPLIED');
  });

  it('rejects stale Stage-3 authority rather than carrying a mismatched hydraulic point forward', () => {
    const stale = input();
    stale.stage3.result.theoreticalStagesUsed.stage2ResultHash = 'd'.repeat(64);
    expect(() => deriveStage4PrePilotSizing(stale))
      .toThrow('STAGE4_STAGE3_STALE_OR_NOT_SAME_LINEAGE_WITH_CALCULATED_STAGE2_NT');
  });

  it('rejects invalid persisted selected hydraulics and does not recalculate another candidate', () => {
    const invalid = input();
    invalid.stage3.result.hydraulicRpmEnvelope[0].operatingHydraulics.operatingHoldup = null;
    expect(() => deriveStage4PrePilotSizing(invalid))
      .toThrow('STAGE4_VALID_CURRENT_STAGE3_SELECTED_HYDRAULICS_REQUIRED');
  });
});