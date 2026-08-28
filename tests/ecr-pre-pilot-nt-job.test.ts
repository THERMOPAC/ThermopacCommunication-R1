import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { PRE_PILOT_MODEL } from '../server/ecr-pre-pilot/model';
import {
  validatePredictiveNtExecutionEvidence,
  validatePredictiveNtJobInput,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';

const satMw = 226.44;
const monoMw = 148.25;
const sourceSat = 0.7;
const sourceMono = 0.3;
const sourceSatMoles = sourceSat / satMw;
const sourceMonoMoles = sourceMono / monoMw;
const sourceMoles = sourceSatMoles + sourceMonoMoles;
const maximumMonoMass = 0.25;
const targetMonoMoles = maximumMonoMass / monoMw;
const targetSatMoles = (1 - maximumMonoMass) / satMw;
const minimumSatMass = 0.75;
const minimumSatMoles = minimumSatMass / satMw;
const correspondingMonoMoles = (1 - minimumSatMass) / monoMw;

const validInput = {
  modelHash: PRE_PILOT_MODEL.modelHash,
  temperatureK: 323.15,
  solventMolarRatio: (1 / 99.13) / sourceMoles,
  sourceSolventOilMassRatio: 1,
  feedMoleFractions: [
    sourceSatMoles / sourceMoles,
    sourceMonoMoles / sourceMoles,
    0,
  ] as [number, number, number],
  satIdentity: 'n-hexadecane',
  monoIdentity: 'n-pentylbenzene',
  sourceFeedCompositionMassFraction: {
    saturates: sourceSat,
    mono: sourceMono,
    di: 0,
    poly: 0,
    polar: 0,
    nmp: 0,
  },
  sourceProductTargetsMassFraction: {
    maximumMono: maximumMonoMass,
    minimumSaturates: minimumSatMass,
  },
  targetRaffinateMonoHydrocarbonMoleFraction: targetMonoMoles / (targetMonoMoles + targetSatMoles),
  minimumRaffinateSaturatesHydrocarbonMoleFraction:
    minimumSatMoles / (minimumSatMoles + correspondingMonoMoles),
  maximumStages: 3,
};

describe('ECR Pre-Pilot Predictive N_T background jobs', () => {
  it('fails closed instead of running queued work against changed evidence', () => {
    const persisted = {
      input: validInput,
      modelHash: PRE_PILOT_MODEL.modelHash,
      engineHash: 'persisted-engine',
    };
    expect(validatePredictiveNtExecutionEvidence(persisted, 'changed-engine'))
      .toBe('PREDICTIVE_NT_ENGINE_HASH_MISMATCH');
    expect(validatePredictiveNtExecutionEvidence({
      ...persisted,
      modelHash: 'changed-model',
    }, 'persisted-engine')).toBe('PREDICTIVE_NT_MODEL_HASH_MISMATCH');
    expect(validatePredictiveNtExecutionEvidence(persisted, 'persisted-engine')).toBeNull();
  });

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

  it('rejects unsupported source components instead of silently projecting them', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      sourceFeedCompositionMassFraction: {
        ...validInput.sourceFeedCompositionMassFraction,
        saturates: 0.69,
        di: 0.01,
      },
    })).toThrow('UNSUPPORTED_COMPONENT_SCOPE');
  });

  it('rejects inconsistent feed, product, and solvent molecular conversions', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      feedMoleFractions: [0.7, 0.3, 0],
    })).toThrow('MOLECULAR_FEED_BASIS_MISMATCH');
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      targetRaffinateMonoHydrocarbonMoleFraction: 0.25,
    })).toThrow('MOLECULAR_PRODUCT_TARGET_BASIS_MISMATCH');
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      solventMolarRatio: 1,
    })).toThrow('MOLECULAR_SOLVENT_BASIS_MISMATCH');
  });

  it('rejects the deprecated molar recovery gate', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      minimumNmpFreeHydrocarbonRecovery: 0.95,
    })).toThrow('MASS_RECOVERY_GATE_UNAVAILABLE');
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
  }, 30_000);

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
  }, 30_000);
});