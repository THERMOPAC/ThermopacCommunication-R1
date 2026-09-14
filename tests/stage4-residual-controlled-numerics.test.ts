import { describe, expect, it } from 'vitest';
import {
  stage4GoodBroydenInverseUpdate,
  stage4SafeguardedGoodBroydenStep,
} from '../server/ecr-pre-pilot/stage4-predictive-physical-sizing';

describe('Stage-4 residual-controlled numerical safeguards', () => {
  it('limits an inverse-Broyden proposal by the declared infinity-norm trust region', () => {
    const step = stage4SafeguardedGoodBroydenStep({
      inverseJacobian: [[.2, 0], [0, .2]],
      scaledResidual: [10, -5],
      trustRegionInfinityRadius: .5,
    });
    expect(step.unconstrainedInfinityNorm).toBe(2);
    expect(step.trustRegionLimited).toBe(true);
    expect(step.stepInfinityNorm).toBeCloseTo(.5);
    expect(step.step).toEqual([-.5, .25]);
  });

  it('retains the prior inverse approximation for a degenerate secant', () => {
    const inverse = [[.2, 0], [0, .2]];
    expect(stage4GoodBroydenInverseUpdate(inverse, [1, 2], [0, 0])).toEqual(inverse);
  });

  it('satisfies the accepted good-Broyden secant without finite-difference columns', () => {
    const inverse = [[.2, 0], [0, .2]];
    const step = [.1, -.3];
    const residualDifference = [.5, -.25];
    const updated = stage4GoodBroydenInverseUpdate(inverse, step, residualDifference);
    const product = updated.map(row => row.reduce((sum, value, i) =>
      sum + value * residualDifference[i], 0));
    expect(product[0]).toBeCloseTo(step[0], 14);
    expect(product[1]).toBeCloseTo(step[1], 14);
  });

  it('rejects non-finite or shape-invalid numerical input explicitly', () => {
    expect(() => stage4SafeguardedGoodBroydenStep({
      inverseJacobian: [[.2]], scaledResidual: [Number.NaN], trustRegionInfinityRadius: 1,
    })).toThrow('STAGE4_RESIDUAL_CONTROLLED_GOOD_BROYDEN_STEP_INPUT_INVALID');
    expect(() => stage4GoodBroydenInverseUpdate([[.2]], [1, 2], [1, 2]))
      .toThrow('STAGE4_RESIDUAL_CONTROLLED_BROYDEN_UPDATE_INPUT_INVALID');
  });
});