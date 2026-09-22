import { describe, expect, it } from 'vitest';
import type { TrustedCompletedSevenComponentNtForStage4 } from '../server/ecr-pre-pilot/predictive-nt-job-service';
import { bindNormalProductTrial } from '../server/ecr-pre-pilot/stage5-normal-product-source';

const hash = 'a'.repeat(64);
const stream = (componentMass: number[]) => ({
  componentMass,
  mass: componentMass.reduce((sum, value) => sum + value, 0),
});
function authority(): TrustedCompletedSevenComponentNtForStage4 {
  return {
    jobId: 'job-current',
    designId: 9,
    engineHash: 'b'.repeat(64),
    stage4AdapterScienceEngineHash: 'c'.repeat(64),
    theoreticalStages: 4,
    resultSnapshotHash: hash,
    selectedTrial: {
      accepted: true,
      stageCount: 4,
      boundaryStreams: {
        oilFeed: stream([60, 15, 10, 8, 6, 1, 0]),
        freshWetSolvent: stream([0, 0, 0, 0, 0, 58.8, 1.2]),
        finalRaffinate: stream([58, 10, 5, 2, 1, 4, .2]),
        finalExtract: stream([2, 5, 5, 6, 5, 55.8, 1]),
      },
    },
  };
}
const reference = { stage2JobId: 'job-current', stage2ResultHash: hash, value: 4 };

describe('Stage 5 normal-product process source', () => {
  it('binds only the validator-selected frozen normal trial and scales its simultaneous products', () => {
    const trusted = authority();
    const original = JSON.stringify(trusted);
    const result = bindNormalProductTrial(trusted, reference, 2200);

    expect(result.status).toBe('NORMAL_PRODUCT_TRIAL_BOUND_DENSITIES_REQUIRED');
    expect(result.sourceIdentity).toBe('STAGE2_ACCEPTED_NORMAL_TRIAL:job-current:N4');
    expect(result.raffinateComponentKgH).toEqual([1276, 220, 110, 44, 22, 88, 4.4]);
    expect(result.extractComponentKgH).toEqual([44, 110, 110, 132, 110, 1227.6, 22]);
    expect(result.raffinateComponentKgH.reduce((a, b) => a + b, 0)
      + result.extractComponentKgH.reduce((a, b) => a + b, 0)).toBeCloseTo(3520);
    expect(JSON.stringify(trusted)).toBe(original);
  });

  it('reports density gaps instead of synthesizing product volume from feed densities', () => {
    const result = bindNormalProductTrial(authority(), reference, 2200);
    expect(result.raffinateDensityKgM3).toBeNull();
    expect(result.extractDensityKgM3).toBeNull();
    expect(result.holds).toEqual([
      'NORMAL_RAFFINATE_OPERATING_DENSITY_NOT_QUALIFIED',
      'NORMAL_EXTRACT_OPERATING_DENSITY_NOT_QUALIFIED',
    ]);
    expect(result).not.toHaveProperty('topNormalM3H');
    expect(result).not.toHaveProperty('bottomNormalM3H');
    expect(JSON.stringify(result)).not.toMatch(/1\.5|120%|900|1000/);
  });

  it('fails closed for a different frozen identity rather than choosing another trial', () => {
    expect(() => bindNormalProductTrial(authority(), { ...reference, value: 7 }, 2200))
      .toThrow('STAGE5_NORMAL_PRODUCT_FROZEN_STAGE2_IDENTITY_MISMATCH');
    expect(() => bindNormalProductTrial(authority(), { ...reference, stage2ResultHash: 'd'.repeat(64) }, 2200))
      .toThrow('STAGE5_NORMAL_PRODUCT_FROZEN_STAGE2_IDENTITY_MISMATCH');
    expect(() => bindNormalProductTrial(authority(), { ...reference, stage2JobId: 'latest-job' }, 2200))
      .toThrow('STAGE5_NORMAL_PRODUCT_FROZEN_STAGE2_IDENTITY_MISMATCH');
  });

  it('rejects malformed or unbalanced boundary evidence without defaults', () => {
    const rejected = authority() as any;
    rejected.selectedTrial.accepted = false;
    expect(() => bindNormalProductTrial(rejected, reference, 2200))
      .toThrow('STAGE5_NORMAL_PRODUCT_BOUND_TRIAL_INVALID');

    const unbalanced = authority() as any;
    unbalanced.selectedTrial.boundaryStreams.finalExtract.componentMass[0] += 1;
    unbalanced.selectedTrial.boundaryStreams.finalExtract.mass += 1;
    expect(() => bindNormalProductTrial(unbalanced, reference, 2200))
      .toThrow('STAGE5_NORMAL_PRODUCT_COMPONENT_BALANCE_INVALID');
    expect(() => bindNormalProductTrial(authority(), reference, 0))
      .toThrow('STAGE5_NORMAL_PRODUCT_STAGE1_OIL_RATE_INVALID');
  });
});