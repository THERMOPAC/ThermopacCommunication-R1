import { describe, expect, it } from 'vitest';
import {
  STAGE3_GEOMETRY_DESIGN_NT,
  type Stage3GeometryStageAuthority,
} from '../server/ecr-pre-pilot/kuhni-geometry-resolver';
import { resolveTheoreticalStageAuthority } from '../server/ecr-pre-pilot-service';

const stage1Hash = 's'.repeat(64);

function completedStage2(value: number) {
  return {
    id: `stage-2-${value}`,
    status: 'completed',
    result_snapshot: {
      establishedTheoreticalStages: value,
      executionStatus: 'COMPLETED_GOVERNED_SEQUENCE',
      stage1TargetGovernance: { stage1SnapshotHash: stage1Hash },
    },
  };
}

describe('Stage-3 fixed Kühni geometry design authority', () => {
  it.each([4, 7, 10])('keeps Stage-2 accepted N_T=%i separate from geometry N_T=7', (stage2Nt) => {
    const authority = resolveTheoreticalStageAuthority(stage1Hash, completedStage2(stage2Nt));

    expect(authority).toMatchObject<Partial<Stage3GeometryStageAuthority>>({
      value: STAGE3_GEOMETRY_DESIGN_NT,
      provenance: 'STAGE3_GEOMETRY_DESIGN_NT',
      stage3GeometryDesignNt: STAGE3_GEOMETRY_DESIGN_NT,
      stage2AcceptedPredictiveNt: stage2Nt,
      stage2AcceptedPredictiveNtProvenance: 'STAGE_2_CALCULATED_NT',
      stage2JobId: `stage-2-${stage2Nt}`,
    });
    expect(authority.label).toContain('STAGE3_GEOMETRY_DESIGN_NT=7');
    expect(authority.stage2ResultHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses fixed geometry N_T=7 while reporting unavailable Stage-2 explicitly', () => {
    const authority = resolveTheoreticalStageAuthority(stage1Hash, undefined);

    expect(authority).toMatchObject({
      value: STAGE3_GEOMETRY_DESIGN_NT,
      provenance: 'STAGE3_GEOMETRY_DESIGN_NT',
      stage2AcceptedPredictiveNt: null,
      stage2AcceptedPredictiveNtProvenance: 'STAGE_2_ACCEPTED_PREDICTIVE_NT_UNAVAILABLE',
      stage2JobId: null,
      stage2ResultHash: null,
    });
    expect(authority.label).toContain('FIXED PRE-PILOT KUHNI GEOMETRY DESIGN BASIS');
    expect(authority.reason).toContain('UNAVAILABLE');
  });
});