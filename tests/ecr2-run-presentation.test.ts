import { describe, expect, it } from 'vitest';
import {
  selectEcr2RunPresentation,
} from '../client/src/pages/design-software/ecr2-run-presentation';

const predictiveSnapshot = {
  executionMode: 'PRE_PILOT_PREDICTIVE',
  calculationStatus: 'CALCULATED',
  bvp: { status: 'converged', source: 'predictive-run' },
};
const governedSnapshot = {
  executionMode: 'GOVERNED_RELEASE',
  calculationStatus: 'CALCULATED',
  bvp: { status: 'converged', source: 'governed-run' },
};

describe('ECR-2 run presentation isolation', () => {
  it('shows a successful predictive run when no accepted governed result exists', () => {
    const selected = selectEcr2RunPresentation({
      latestRun: {
        calculation_status: 'success',
        result_snapshot: predictiveSnapshot,
      },
      acceptedGovernedSnapshot: null,
    });

    expect(selected.displayedSnapshot).toBe(predictiveSnapshot);
    expect(selected.isPredictive).toBe(true);
    expect(selected.acceptedGovernedSnapshot).toBeNull();
    expect(selected.displaySource).toBe('CURRENT_RUN');
  });

  it('does not display an older governed result under a successful predictive run', () => {
    const selected = selectEcr2RunPresentation({
      latestRun: {
        calculation_status: 'success',
        result_snapshot: JSON.stringify(predictiveSnapshot),
      },
      acceptedGovernedSnapshot: governedSnapshot,
    });

    expect(selected.displayedSnapshot).toEqual(predictiveSnapshot);
    expect(selected.displayedSnapshot).not.toBe(governedSnapshot);
    expect(selected.acceptedGovernedSnapshot).toBe(governedSnapshot);
    expect(selected.isPredictive).toBe(true);
  });

  it('uses the accepted governed result only when no newer run is selected', () => {
    const selected = selectEcr2RunPresentation({
      latestRun: null,
      acceptedGovernedSnapshot: governedSnapshot,
    });

    expect(selected.displayedSnapshot).toBe(governedSnapshot);
    expect(selected.displaySource).toBe('ACCEPTED_GOVERNED_RESULT');
    expect(selected.isPredictive).toBe(false);
  });
});