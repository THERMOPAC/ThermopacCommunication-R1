import { describe, expect, it } from 'vitest';
import { solveECR2IdealStageCascade } from '../server/engines/llx/llx-ecr2-ideal-stage-cascade';

describe('ECR-2 same-specification ideal-stage cascade', () => {
  it('fails closed as not calculable when no converged phase split is available', () => {
    const result = solveECR2IdealStageCascade({
      operatingTemperature_C: 70,
      target: {
        value: 0.4379949896594715,
        sourceType: 'Assumed',
        sourceReference: 'ECR-2 ideal-stage regression fixture',
      },
      rrboFeedComponentFlows_kg_h: [50, 30, 15, 5, 0],
      nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, 172],
      physicalMolecularWeights_g_mol: [330, 300, 350, 430, 99.13],
      maxIdealStages: 4,
    });

    expect(result.status).toBe('not_calculable');
    expect(result.statusLabel).toBe('NOT_CALCULABLE');
    expect(result.establishedTheoreticalStages).toBeNull();
    expect(result.trials).toHaveLength(4);
    expect(result.trials.every((trial) => !trial.counterCurrentConverged)).toBe(true);
    expect(result.diagnostics.at(-1)).toContain('not evidence');
  });

  it('reports no feasible cascade only after valid same-basis trials fail the recovery gate', () => {
    const result = solveECR2IdealStageCascade({
      operatingTemperature_C: 50,
      target: { value: 0.1, sourceType: 'Assumed', sourceReference: 'Valid ECR-2 cascade fixture' },
      rrboFeedComponentFlows_kg_h: [2930.8, 172.4, 172.4, 172.4, 0],
      nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, 4003.88],
      physicalMolecularWeights_g_mol: [269.93, 320, 377.57, 459.45, 99.13],
      maxIdealStages: 2,
    });

    expect(result.status).toBe('no_feasible_theoretical_stage_cascade');
    expect(result.statusLabel).toBe('NO FEASIBLE THEORETICAL-STAGE CASCADE AT THE SPECIFIED CONDITIONS');
    expect(result.establishedTheoreticalStages).toBeNull();
    expect(result.trials).toHaveLength(2);
    for (const trial of result.trials) {
      expect(trial.counterCurrentConverged).toBe(true);
      expect(trial.massBalancePassed).toBe(true);
      expect(trial.productAromaticsMoleFraction).not.toBeNull();
      expect(trial.productAromaticsMoleFraction!).toBeLessThanOrEqual(result.target.value);
      expect(trial.rrboRecoveryMassFraction).toBeLessThan(0.95);
      expect(trial.failure).toContain('RRBO recovery');
    }
    expect(result.molecularWeightBasis).toMatchObject({
      componentOrder: ['Sat', 'Mono', 'Di', 'Poly', 'NMP'],
      physicalMolecularWeights_g_mol: [269.93, 320, 377.57, 459.45, 99.13],
      surrogateMolecularWeights_g_mol: [170.34, 106.17, 142.2, 202.25, 99.13],
    });
    expect(result.trials[0].productAromaticsMoleFraction).toBeCloseTo(0.0144119915, 9);
    expect(result.trials[0].rrboRecoveryMassFraction).toBeCloseTo(0.536715177, 9);

    const stage = result.trials[0].stageProfile[0];
    expect(stage.overallIncomingPhysicalMolarFlows_mol_h).toEqual([
      expect.closeTo(10857.62975586263, 8),
      expect.closeTo(538.75, 8),
      expect.closeTo(456.6040734168499, 8),
      expect.closeTo(375.23125476112745, 8),
      expect.closeTo(40390.194693836376, 8),
    ]);
    expect(stage.rrboOutgoingPhysicalMolarFlows_mol_h.map(
      (mol, index) => (mol * result.molecularWeightBasis.physicalMolecularWeights_g_mol[index]) / 1000,
    )).toEqual(stage.rrboOutgoing_kg_h);
    expect(stage.nmpOutgoingPhysicalMolarFlows_mol_h.map(
      (mol, index) => (mol * result.molecularWeightBasis.physicalMolecularWeights_g_mol[index]) / 1000,
    )).toEqual(stage.nmpOutgoing_kg_h);
  });
});