import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { PRE_PILOT_MODEL } from '../server/ecr-pre-pilot/model';
import {
  validatePredictiveNtJobInput,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';

const validInput = {
  modelHash: PRE_PILOT_MODEL.modelHash,
  temperatureK: 323.15,
  solventMolarRatio: 1,
  feedMoleFractions: [0.7, 0.3, 0] as [number, number, number],
  satIdentity: 'n-hexadecane',
  monoIdentity: 'n-pentylbenzene',
  targetRaffinateMonoHydrocarbonMoleFraction: 0.25,
  maximumStages: 3,
};

describe('ECR Pre-Pilot Predictive N_T background jobs', () => {
  it('binds every job input to the frozen package and never establishes N_T at validation', () => {
    const gate = validatePredictiveNtJobInput(validInput);
    expect(gate).toMatchObject({
      model: {
        packageId: 'PRE_PILOT_MODEL',
        modelHash: PRE_PILOT_MODEL.modelHash,
        calibrationStatus: 'CALIBRATION_REQUIRED',
      },
      mayRunPredictiveNt: true,
      establishedTheoreticalStages: null,
    });
  });

  it('fails closed for a changed model hash', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      modelHash: 'changed',
    })).toThrow('MODEL_HASH_MISMATCH');
  });

  it('requires an explicit molecular basis', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      monoIdentity: '',
    })).toThrow('MOLECULAR_BASIS_REQUIRED');
  });

  it('rejects molecular identities outside the frozen descriptor registry', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      satIdentity: 'invented-saturate',
    })).toThrow('MOLECULAR_IDENTITY_UNAVAILABLE');
  });

  it('does not stop the minimum-stage search at a non-monotonic diagnostic', () => {
    const result = JSON.parse(execFileSync(
      'python3.12',
      [
        'server/research/ecr-pre-pilot-model-freeze/predictive_nt_cascade.py',
        '--self-test-selection',
      ],
      { encoding: 'utf8' },
    ));
    expect(result).toEqual({
      status: 'PASS',
      selectedStageCount: 3,
      allTrialsEvaluated: true,
    });
  });

  it('rejects a self-consistent manifest that is not the declared frozen model', () => {
    const result = JSON.parse(execFileSync(
      'python3.12',
      [
        'server/research/ecr-pre-pilot-model-freeze/predictive_nt_cascade.py',
        '--self-test-manifest-binding',
      ],
      { encoding: 'utf8' },
    ));
    expect(result).toEqual({
      status: 'PASS',
      changedManifestRejected: true,
    });
  });
});