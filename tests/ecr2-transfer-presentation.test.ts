import { describe, expect, it } from 'vitest';

import { canDisplayECR2PreliminaryTransferPerformance } from '../client/src/lib/ecr2-transfer-presentation';

describe('ECR-2 transfer-result presentation', () => {
  it('shows numerical transfer performance only for an accepted preliminary BVP', () => {
    expect(canDisplayECR2PreliminaryTransferPerformance(
      { status: 'converged', massBalanceStatus: 'passed' },
      { status: 'LOCAL_PRELIMINARY_CALCULATED' },
    )).toBe(true);
  });

  it('hides locally evaluable but non-converged BVP arrays from calculated-result presentation', () => {
    expect(canDisplayECR2PreliminaryTransferPerformance(
      { status: 'non_converged', massBalanceStatus: 'failed' },
      { status: 'LOCAL_PRELIMINARY_BLOCKED' },
    )).toBe(false);
  });
});