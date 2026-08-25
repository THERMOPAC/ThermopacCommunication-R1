import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ calls: 0, failFirst: true }));

vi.mock('../server/engines/llx/llx-ecr2-local-nrtl', () => ({
  computeLocalNRTL: vi.fn((params: { z_feed: number[] }) => {
    state.calls += 1;
    if (state.failFirst && state.calls === 1) {
      return {
        flashConverged: false,
        flashTrivial: false,
        x_eq: null,
        y_eq: null,
        flashBeta: null,
        temperatureStatus: { classification: 'fixture' },
      };
    }
    // An intentional non-trivial but component-conserving fixture split:
    // 99% stays in the RRBO-oriented phase, allowing N=2 to pass both gates.
    return {
      flashConverged: true,
      flashTrivial: false,
      x_eq: params.z_feed,
      y_eq: params.z_feed,
      flashBeta: 0.01,
      temperatureStatus: { classification: 'fixture' },
    };
  }),
}));

import { solveECR2IdealStageCascade } from '../server/engines/llx/llx-ecr2-ideal-stage-cascade';

describe('ECR-2 ideal-stage minimum-count proof', () => {
  it('does not establish a later passing N when a lower N was not calculable', () => {
    state.calls = 0;
    state.failFirst = true;
    const result = solveECR2IdealStageCascade({
      operatingTemperature_C: 50,
      target: { value: 0.1, sourceType: 'Assumed', sourceReference: 'Minimum-proof ordering fixture' },
      rrboFeedComponentFlows_kg_h: [100, 0, 0, 0, 0],
      nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, 1],
      physicalMolecularWeights_g_mol: [300, 300, 350, 430, 99.13],
      maxIdealStages: 2,
    });

    expect(result.trials[0]).toMatchObject({ idealStageCount: 1, counterCurrentConverged: false });
    expect(result.trials[1]).toMatchObject({ idealStageCount: 2, accepted: true, massBalancePassed: true });
    expect(result.status).toBe('not_calculable');
    expect(result.statusLabel).toBe('NOT_CALCULABLE');
    expect(result.establishedTheoreticalStages).toBeNull();
    expect(result.diagnostics.at(-1)).toContain('every smaller integer stage count');
  });

  it('establishes the minimum N when every lower count was valid and the first count passes', () => {
    state.calls = 0;
    state.failFirst = false;
    const result = solveECR2IdealStageCascade({
      operatingTemperature_C: 50,
      target: { value: 0.1, sourceType: 'Assumed', sourceReference: 'Established minimum fixture' },
      rrboFeedComponentFlows_kg_h: [100, 0, 0, 0, 0],
      nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, 1],
      physicalMolecularWeights_g_mol: [300, 300, 350, 430, 99.13],
      maxIdealStages: 2,
    });

    expect(result.status).toBe('target_met');
    expect(result.establishedTheoreticalStages).toBe(1);
    expect(result.selectedTrial).toMatchObject({
      idealStageCount: 1,
      accepted: true,
      counterCurrentConverged: true,
      massBalancePassed: true,
    });
  });
});