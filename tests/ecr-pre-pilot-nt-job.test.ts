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
import { canonicalizeStage1Input, makeStage1Snapshot } from '../server/ecr-pre-pilot/stage1';

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
    solventOilRatio: '1.50',
    targetRaffinateSulfurPpm: '1000',
    minimumRaffinateSaturatesWt: '90',
    targetRaffinateTotalAromaticsWt: '10.0',
    targetRaffinatePolarAromaticsWt: '0.50',
    minimumRecoveryPct: '95',
    maximumNmpRaffinateWt: '0.50',
    feedSulfurPpm: '3500',
    designBasisNotes: 'Stage 1 authority integration fixture',
    satIdentity: 'n-dodecane',
    monoIdentity: 'n-propylbenzene',
    maximumStages: '10',
  };
}

const validInput = derivePredictiveNtInputFromStage1(
  makeStage1Snapshot(canonicalizeStage1Input(validStage1(209), 209)),
  209,
);

function validInputWithMaximumStages(maximumStages: number) {
  return derivePredictiveNtInputFromStage1(
    makeStage1Snapshot(canonicalizeStage1Input({
      ...validStage1(209),
      maximumStages: String(maximumStages),
    }, 209)),
    209,
  );
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
  }, 30_000);

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

  it('rejects positive PA source mass instead of silently projecting it', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      sourceFeedCompositionMassFraction: {
        ...validInput.sourceFeedCompositionMassFraction,
        saturates: 0.69,
        polar: 0.01,
      },
    })).toThrow('POLAR_AROMATICS_THERMODYNAMIC_CLOSURE_UNAVAILABLE');
  });

  it('rejects inconsistent feed, product, and solvent molecular conversions', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      feedMoleFractions: [0.7, 0.3, 0, 0, 0],
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

  it.each([
    ['temperature', () => ({ ...validInput, temperatureK: validInput.temperatureK + 1 })],
    ['maximum stages', () => ({ ...validInput, maximumStages: validInput.maximumStages - 1 })],
    ['self-consistent solvent basis', () => {
      const sourceSolventOilMassRatio = validInput.sourceSolventOilMassRatio * 0.9;
      return {
        ...validInput,
        sourceSolventOilMassRatio,
        solventMolarRatio: validInput.solventMolarRatio * 0.9,
      };
    }],
    ['self-consistent feed basis', () => {
      const saturates = 0.6;
      const mono = 0.4;
      const moles = saturates / 170.34 + mono / 120.19;
      return {
        ...validInput,
        sourceFeedCompositionMassFraction: {
          ...validInput.sourceFeedCompositionMassFraction,
          saturates,
          mono,
        },
        feedMoleFractions: [
          (saturates / 170.34) / moles,
          (mono / 120.19) / moles,
          0, 0, 0,
        ] as [number, number, number, number, number],
        solventMolarRatio: (validInput.sourceSolventOilMassRatio / 99.1311) / moles,
      };
    }],
    ['self-consistent product target basis', () => {
      const maximumTotalAromatics = 0.07;
      const monoMoles = maximumTotalAromatics / 120.19;
      const satMoles = (1 - maximumTotalAromatics) / 170.34;
      return {
        ...validInput,
        sourceProductTargetsMassFraction: {
          ...validInput.sourceProductTargetsMassFraction,
          maximumTotalAromatics,
        },
        targetRaffinateMonoHydrocarbonMoleFraction: monoMoles / (monoMoles + satMoles),
      };
    }],
    ['authority recovery governance', () => ({
      ...validInput,
      stage1Authority: {
        ...validInput.stage1Authority!,
        minimumMassRecovery: { targetPercent: 90, status: 'CALCULABLE' as const },
      },
    })],
  ])('rejects valid-looking %s mutations not reconstructed from Stage 1', (_name, mutate) => {
    expect(() => validatePredictiveNtJobInput(mutate())).toThrow('STAGE1_AUTHORITY_MISMATCH');
  });

  it('rejects a changed five-component engine contract', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      engineComponentContract: {
        ...validInput.engineComponentContract,
        thermodynamicModel: 'COSMO-SAC-2010',
      },
    } as any)).toThrow('PREDICTIVE_NT_FIVE_COMPONENT_CONTRACT_REQUIRED');
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
      satIdentity: 'n-dodecane',
      monoIdentity: 'n-propylbenzene',
      sourceFeedCompositionMassFraction: {
        saturates: 0.7,
        mono: 0.3,
        di: 0,
        poly: 0,
        polar: 0,
        nmp: 0,
      },
      sourceProductTargetsMassFraction: {
        maximumTotalAromatics: 0.1,
        maximumPolarAromatics: 0.005,
        minimumSaturates: 0.9,
        maximumNmp: 0.005,
        minimumRrboRecovery: 0.95,
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
          status: 'CALCULABLE',
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
          status: 'CALCULABLE',
        },
        overallEcrProductAcceptance: false,
        overallEcrProductAcceptanceStatus: 'BLOCKED_BY_NOT_CALCULABLE_TARGETS',
      },
    });
  }, 30_000);

  it('fails closed when the saved Stage 1 scope includes positive PA feed', async () => {
    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for Stage 1 scope test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, `stage1-scope-${Date.now()}`);
    const stage1 = validStage1(design.projectNumber);
    stage1.saturatesWt = '69';
    stage1.polarAromaticsWt = '1';
    const snapshot = await saveEcrPrePilotStage1(userId, design.id, stage1);
    expect(() => derivePredictiveNtInputFromStage1(snapshot, design.projectNumber))
      .toThrow('POLAR_AROMATICS_THERMODYNAMIC_CLOSURE_UNAVAILABLE');
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

  it('runs a saved Stage-1 stage search to completion from the production runtime bundle', async () => {
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
        validInputWithMaximumStages(2),
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
        '5af4ade3777068a4b2aac4afdd0956b9c5f52ca55c1f96f33c28e91f0ac5ece2',
      );
      expect(completed?.result).toMatchObject({
        status: 'TARGET_NOT_REACHED',
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
      expect(result.trials).toHaveLength(2);
      expect(result.checkpoint).toMatchObject({
        protocol: 'ACK_V2',
        acknowledgedStageCount: 2,
        modelHash: PRE_PILOT_MODEL.modelHash,
        engineHash: completed?.engineHash,
      });
      expect(result.checkpoint.trialHashes).toHaveLength(2);
      expect(result.checkpoint.trialCanonicals).toHaveLength(2);
      expect(result.checkpoint.payloadHashes).toHaveLength(2);
      expect(result.checkpoint.payloadCanonicals).toHaveLength(2);
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
      validInputWithMaximumStages(2),
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
      protocol: 'ACK_V2',
      acknowledgedStageCount: 1,
    });
  }, 150_000);

  it('resumes at the next stage after a worker restart without rewriting acknowledged evidence', async () => {
    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for checkpoint restart test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, 'predictive-nt-checkpoint-resume-v2');
    const submitted = await enqueuePredictiveNtRuntimeTestJob(
      validInputWithMaximumStages(2),
      userId,
      design.id,
      { restartAfterAcknowledgedStage: 1 },
    );
    let terminal = await getPredictiveNtJob(submitted.jobId, userId, design.id);
    const deadline = Date.now() + 180_000;
    while (terminal?.status !== 'completed' && terminal?.status !== 'failed' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      terminal = await getPredictiveNtJob(submitted.jobId, userId, design.id);
    }

    expect(terminal?.status, terminal?.error ?? 'job did not complete').toBe('completed');
    const result = terminal?.result as any;
    expect(result.trials.map((trial: any) => trial.stageCount)).toEqual([1, 2]);
    expect(result.trials[1].solverDiagnostics.initialization)
      .toBe('N_MINUS_1_COMPONENT_FLOW_CONTINUATION');
    expect(result.checkpoint).toMatchObject({
      protocol: 'ACK_V2',
      acknowledgedStageCount: 2,
      modelHash: PRE_PILOT_MODEL.modelHash,
      engineHash: terminal?.engineHash,
    });
    expect(result.checkpoint.trialHashes).toHaveLength(2);
    expect(result.checkpoint.trialCanonicals).toHaveLength(2);
    expect(result.checkpoint.payloadHashes).toHaveLength(2);
    expect(result.checkpoint.payloadCanonicals).toHaveLength(2);

    const history = await pool.query(
      `SELECT details->>'stageCount' AS stage_count,
              details->>'trialHash' AS trial_hash,
              COUNT(*)::int AS total
         FROM ecr_pre_pilot_predictive_nt_job_history
        WHERE job_id = $1
          AND details->>'event' = 'trial_checkpoint_acknowledged'
        GROUP BY details->>'stageCount', details->>'trialHash'
        ORDER BY (details->>'stageCount')::int`,
      [submitted.jobId],
    );
    expect(history.rows).toEqual([
      { stage_count: '1', trial_hash: result.checkpoint.trialHashes[0], total: 1 },
      { stage_count: '2', trial_hash: result.checkpoint.trialHashes[1], total: 1 },
    ]);
  }, 210_000);

  it('finalizes from checkpoints when the worker restarts after the final acknowledgement', async () => {
    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for final checkpoint restart test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, 'predictive-nt-final-checkpoint-resume-v2');
    const submitted = await enqueuePredictiveNtRuntimeTestJob(
      validInputWithMaximumStages(2),
      userId,
      design.id,
      { restartAfterAcknowledgedStage: 2 },
    );
    let terminal = await getPredictiveNtJob(submitted.jobId, userId, design.id);
    const deadline = Date.now() + 180_000;
    while (terminal?.status !== 'completed' && terminal?.status !== 'failed' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      terminal = await getPredictiveNtJob(submitted.jobId, userId, design.id);
    }

    expect(terminal?.status, terminal?.error ?? 'job did not complete').toBe('completed');
    const result = terminal?.result as any;
    expect(result.trials.map((trial: any) => trial.stageCount)).toEqual([1, 2]);
    expect(result.checkpoint.acknowledgedStageCount).toBe(2);
    const history = await pool.query(
      `SELECT details->>'stageCount' AS stage_count, COUNT(*)::int AS total
         FROM ecr_pre_pilot_predictive_nt_job_history
        WHERE job_id = $1
          AND details->>'event' = 'trial_checkpoint_acknowledged'
        GROUP BY details->>'stageCount'
        ORDER BY (details->>'stageCount')::int`,
      [submitted.jobId],
    );
    expect(history.rows).toEqual([
      { stage_count: '1', total: 1 },
      { stage_count: '2', total: 1 },
    ]);
  }, 210_000);
});