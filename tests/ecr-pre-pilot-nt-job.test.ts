import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PRE_PILOT_MODEL } from '../server/ecr-pre-pilot/model';
import {
  enqueuePredictiveNtRuntimeTestJob,
  derivePredictiveNtInputFromStage1,
  attachStage1ResultGovernance,
  getPredictiveNtJob,
  preflightPredictiveNtRuntime,
  validatePredictiveNtExecutionEvidence,
  validatePredictiveNtJobInput,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';
import { allocateEcrPrePilotDesign, saveEcrPrePilotStage1 } from '../server/ecr-pre-pilot-service';
import { pool } from '../server/db';

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

function validStage1(projectNumber: number) {
  return {
    projectReference: String(projectNumber),
    rrboGrade: 'SN300',
    designFeedRateLph: '1000',
    operatingTemperatureC: '50',
    operatingPressure: '2.0',
    phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
    saturatesWt: '70',
    monoAromaticsWt: '30',
    diAromaticsWt: '0',
    polyAromaticsWt: '0',
    polarAromaticsWt: '0',
    nmpInFeedWt: '0',
    rrboDensityKgM3: '850',
    rrboDynamicViscosityCp: '20',
    rrboInterfacialTensionMnM: '8',
    nmpPurityWt: '99.5',
    nmpWaterWt: '0.05',
    nmpTemperatureC: '50',
    nmpDensityKgM3: '1000',
    nmpDynamicViscosityCp: '1.2',
    solventOilRatio: '1.00',
    targetRaffinateSulfurPpm: '1000',
    minimumRaffinateSaturatesWt: '90',
    targetRaffinateTotalAromaticsWt: '10.0',
    targetRaffinatePolarAromaticsWt: '0.50',
    minimumRecoveryPct: '95',
    maximumNmpRaffinateWt: '0.50',
    feedSulfurPpm: '3500',
    designBasisNotes: 'Stage 1 authority integration fixture',
    satIdentity: 'n-hexadecane',
    monoIdentity: 'n-pentylbenzene',
    maximumStages: '10',
  };
}

describe('ECR Pre-Pilot Predictive N_T background jobs', () => {
  it('converges the damped component-flow cascade through N=5 with bounded streams and closed balances', () => {
    const output = execFileSync(
      'python3.12',
      [path.join(process.cwd(), 'tests/fixtures/predictive_nt_component_flow_check.py')],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    const trials = JSON.parse(output);
    expect(trials).toHaveLength(5);
    for (const [index, trial] of trials.entries()) {
      expect(trial.stageCount).toBe(index + 1);
      expect(trial.sweeps).toBeLessThanOrEqual(300);
      expect(trial.balanceAccepted).toBe(true);
      expect(trial.overallMaximum).toBeLessThanOrEqual(1e-8);
      expect(trial.localMaximum).toBeLessThanOrEqual(1e-8);
      expect(trial.bounded).toBe(true);
      expect(trial.initialization).toBe(
        index === 0 ? 'COLD_COMPONENT_FLOW' : 'N_MINUS_1_COMPONENT_FLOW_CONTINUATION',
      );
    }
  });

  afterAll(async () => {
    await pool.end();
  });

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

  it('derives the complete solver request from the saved Stage 1 snapshot', async () => {
    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for Stage 1 authority test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, `stage1-authority-${Date.now()}`);
    const snapshot = await saveEcrPrePilotStage1(userId, design.id, validStage1(design.projectNumber));
    const derived = derivePredictiveNtInputFromStage1(snapshot, design.projectNumber);

    expect(derived).toMatchObject({
      modelHash: PRE_PILOT_MODEL.modelHash,
      temperatureK: 323.15,
      satIdentity: 'n-hexadecane',
      monoIdentity: 'n-pentylbenzene',
      sourceFeedCompositionMassFraction: {
        saturates: 0.7,
        mono: 0.3,
        di: 0,
        poly: 0,
        polar: 0,
        nmp: 0,
      },
      sourceProductTargetsMassFraction: {
        maximumMono: 0.1,
        minimumSaturates: 0.9,
      },
      maximumStages: 10,
      stage1Authority: {
        schemaVersion: 'ECR_PRE_PILOT_STAGE_1_V1',
        sulfurPrediction: {
          status: 'NOT_CALCULABLE',
          calibrationStatus: 'CALIBRATION_REQUIRED',
        },
        minimumMassRecovery: {
          targetPercent: 95,
          status: 'NOT_CALCULABLE',
        },
      },
    });
    expect(derived.stage1Authority?.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => validatePredictiveNtJobInput(derived)).not.toThrow();
    expect(attachStage1ResultGovernance({
      status: 'ACCEPTED_PREDICTIVE_NT',
      predictiveNt: 3,
    }, derived)).toMatchObject({
      status: 'ACCEPTED_PREDICTIVE_NT',
      predictiveNt: 3,
      stage1TargetGovernance: {
        predictiveNtAuthority: 'FROZEN_PYTHON_THERMODYNAMIC_ENGINE',
        sulfurPrediction: {
          status: 'NOT_CALCULABLE',
          calibrationStatus: 'CALIBRATION_REQUIRED',
        },
        minimumMassRecovery: {
          targetPercent: 95,
          status: 'NOT_CALCULABLE',
        },
        overallEcrProductAcceptance: false,
        overallEcrProductAcceptanceStatus: 'BLOCKED_BY_NOT_CALCULABLE_TARGETS',
      },
    });
  });

  it('fails closed when the saved Stage 1 scope includes unsupported feed', async () => {
    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for Stage 1 scope test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, `stage1-scope-${Date.now()}`);
    const stage1 = validStage1(design.projectNumber);
    stage1.saturatesWt = '69';
    stage1.diAromaticsWt = '1';
    const snapshot = await saveEcrPrePilotStage1(userId, design.id, stage1);
    expect(() => derivePredictiveNtInputFromStage1(snapshot, design.projectNumber))
      .toThrow('UNSUPPORTED_COMPONENT_SCOPE');
  });

  it('fails closed for an unsupported saved phase configuration', async () => {
    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for Stage 1 phase test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, `stage1-phase-${Date.now()}`);
    const stage1 = validStage1(design.projectNumber);
    stage1.phaseConfiguration = 'rrbo-continuous-nmp-dispersed';
    const snapshot = await saveEcrPrePilotStage1(userId, design.id, stage1);
    expect(() => derivePredictiveNtInputFromStage1(snapshot, design.projectNumber))
      .toThrow('UNSUPPORTED_PHASE_CONFIGURATION');
  });

  it('disables the raw scientific enqueue outside the test runtime', async () => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(enqueuePredictiveNtRuntimeTestJob(validInput, 1, 1))
        .rejects.toThrow('RAW_PREDICTIVE_NT_ENQUEUE_DISABLED');
    } finally {
      process.env.NODE_ENV = prior;
    }
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

  it('fails preflight before submission when a packaged runtime artifact is missing', () => {
    execFileSync('node', ['scripts/package-predictive-nt-runtime.mjs']);
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'predictive-nt-runtime-'));
    cpSync('dist/predictive-nt-runtime', temporaryRoot, { recursive: true });
    rmSync(path.join(temporaryRoot, 'server/research/ecr-pre-pilot-uniquac/model.py'));
    process.env.PREDICTIVE_NT_RUNTIME_ROOT = temporaryRoot;
    try {
      expect(() => preflightPredictiveNtRuntime()).toThrow('PREDICTIVE_NT_RUNTIME_MISSING');
    } finally {
      delete process.env.PREDICTIVE_NT_RUNTIME_ROOT;
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('runs a one-stage job to completion from the production runtime bundle', async () => {
    execFileSync('node', ['scripts/package-predictive-nt-runtime.mjs']);
    process.env.PREDICTIVE_NT_RUNTIME_ROOT = 'dist/predictive-nt-runtime';
    expect(preflightPredictiveNtRuntime()).toMatchObject({
      status: 'PASS',
      python: '3.12',
      modelHash: PRE_PILOT_MODEL.modelHash,
    });

    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for Predictive N_T integration test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, 'predictive-nt-prod-integration-v1');
    try {
      const submitted = await enqueuePredictiveNtRuntimeTestJob(
        { ...validInput, maximumStages: 1 },
        userId,
        design.id,
      );

      let completed = await getPredictiveNtJob(submitted.jobId, userId, design.id);
      const deadline = Date.now() + 120_000;
      while (completed?.status !== 'completed' && completed?.status !== 'failed' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        completed = await getPredictiveNtJob(submitted.jobId, userId, design.id);
      }

      expect(completed?.status, completed?.error ?? 'job did not complete').toBe('completed');
      expect(completed?.modelHash).toBe(PRE_PILOT_MODEL.modelHash);
      expect(completed?.engineHash).toBe(
        '70a39141ed6ed3dfb9f0e95b38db459f95752fb9e75beefe767e95b64b35fa32',
      );
      expect(completed?.result).toMatchObject({
        status: 'ACCEPTED_PREDICTIVE_NT',
        establishedTheoreticalStages: null,
        releaseEligible: false,
        calibrationRequired: true,
        model: {
          modelHash: PRE_PILOT_MODEL.modelHash,
          runtimeVerification: 'PASS',
        },
        engine: {
          engineHash: completed?.engineHash,
        },
      });
      const result = completed?.result as any;
      expect(result.trials).toHaveLength(1);
      expect(result.checkpoint).toMatchObject({
        protocol: 'ACK_V1',
        acknowledgedStageCount: 1,
      });
      expect(result.checkpoint.trialHashes).toHaveLength(1);
      expect(result.trials[0].balanceAccepted).toBe(true);
      expect(result.trials[0].overallComponentBalanceMaximum).toBeLessThanOrEqual(1e-8);
      expect(Math.abs(Object.values(result.trials[0].overallComponentBalanceResiduals)
        .reduce((sum: number, value) => sum + Number(value), 0))).toBeLessThanOrEqual(1e-8);
      const checkpointHistory = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM ecr_pre_pilot_predictive_nt_job_history
          WHERE job_id = $1
            AND details->>'event' = 'trial_checkpoint_acknowledged'`,
        [submitted.jobId],
      );
      expect(checkpointHistory.rows[0].total).toBeGreaterThanOrEqual(1);
    } finally {
      delete process.env.PREDICTIVE_NT_RUNTIME_ROOT;
    }
  }, 150_000);

  it.each([
    {
      name: 'retains the acknowledged prefix when the worker dies before N+1',
      hooks: { killAfterAcknowledgedStage: 1 },
      error: 'PREDICTIVE_NT_TEST_TERMINATED_AFTER_ACK',
    },
    {
      name: 'rejects a mismatched replay without losing the committed trial',
      hooks: { replayMismatchAtStage: 1 },
      error: 'PREDICTIVE_NT_CHECKPOINT_REPLAY_MISMATCH',
    },
  ])('$name', async ({ hooks, error }) => {
    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for checkpoint fault test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, 'predictive-nt-checkpoint-fault-v1');
    const submitted = await enqueuePredictiveNtRuntimeTestJob(
      { ...validInput, maximumStages: 2 },
      userId,
      design.id,
      hooks,
    );
    let terminal = await getPredictiveNtJob(submitted.jobId, userId, design.id);
    const deadline = Date.now() + 120_000;
    while (terminal?.status !== 'completed' && terminal?.status !== 'failed' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      terminal = await getPredictiveNtJob(submitted.jobId, userId, design.id);
    }
    expect(terminal?.status).toBe('failed');
    expect(terminal?.error).toContain(error);
    expect((terminal?.result as any)?.trials).toHaveLength(1);
    expect((terminal?.result as any)?.checkpoint).toMatchObject({
      protocol: 'ACK_V1',
      acknowledgedStageCount: 1,
    });
  }, 150_000);
});