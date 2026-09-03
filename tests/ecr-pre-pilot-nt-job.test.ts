import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRE_PILOT_MODEL } from '../server/ecr-pre-pilot/model';
import {
  enqueuePredictiveNtRuntimeTestJob,
  derivePredictiveNtInputFromStage1,
  derivePredictiveNtSixComponentInputFromStage1,
  attachStage1ResultGovernance,
  expectedTask216GlobalStabilityEvidence,
  expectedTask218CandidateGeneratedStabilityEvidence,
  getPredictiveNtJob,
  preflightPredictiveNtRuntime,
  predictiveNtCheckpointProtocol,
  validateTask216GlobalStabilityEvidence,
  validateTask218CandidateGeneratedStabilityEvidence,
  validatePredictiveNtExecutionEvidence,
  validatePredictiveNtCheckpointContract,
  validatePredictiveNtJobInput,
  validateSevenComponentPersistedResult,
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
    saturatesWt: '65',
    monoAromaticsWt: '20',
    diAromaticsWt: '5',
    polyAromaticsWt: '3',
    polarAromaticsWt: '5',
    nmpInFeedWt: '2',
    rrboDensityKgM3: '850',
    rrboDynamicViscosityCp: '20',
    rrboInterfacialTensionMnM: '8',
    nmpPurityWt: '99.5',
    nmpWaterWt: '0.5',
    nmpTemperatureC: '50',
    nmpDensityKgM3: '1000',
    nmpDynamicViscosityCp: '1.2',
    solventOilRatio: '1.50',
    targetRaffinateSulfurPpm: '1000',
    minimumRaffinateSaturatesWt: '90',
    targetRaffinateTotalAromaticsWt: '10.0',
    targetRaffinatePolarAromaticsWt: '0.50',
    minimumRecoveryPct: '90',
    maximumNmpRaffinateWt: '1.0',
    feedSulfurPpm: '3500',
    sulfurAllocationSatPct: '0',
    sulfurAllocationMonoPct: '20',
    sulfurAllocationDiPct: '30',
    sulfurAllocationPolyPct: '40',
    sulfurAllocationPaPct: '10',
    designBasisNotes: 'Stage 1 authority integration fixture',
    satIdentity: 'n-dodecane',
    monoIdentity: 'n-propylbenzene',
    maximumStages: '10',
  };
}

// Existing queue/checkpoint fixtures exercise the immutable 6C archive
// contract. New submissions use the default 7C derivation below.
const validInput = derivePredictiveNtSixComponentInputFromStage1(
  makeStage1Snapshot(canonicalizeStage1Input(validStage1(209), 209)),
  209,
);

function validInputWithMaximumStages(maximumStages: number) {
  return derivePredictiveNtSixComponentInputFromStage1(
    makeStage1Snapshot(canonicalizeStage1Input({
      ...validStage1(209),
      maximumStages: String(maximumStages),
    }, 209)),
    209,
  );
}

function validTask216Evidence() {
  return {
    evidenceId: 'TASK_216_MONO_RICH_GLOBAL_STABILITY_V1',
    researchOnly: true,
    calibrationRequired: true,
    releaseEligible: false,
    predictiveNt: null,
    ...expectedTask216GlobalStabilityEvidence(),
  };
}

function useAckProtocolFixture() {
  process.env.PREDICTIVE_NT_TEST_WORKER_SCRIPT =
    path.join(process.cwd(), 'tests/fixtures/predictive_nt_ack_protocol_worker.py');
}

describe('ECR Pre-Pilot Predictive N_T background jobs', () => {
  beforeAll(async () => {
    await pool.query(
      `UPDATE ecr_pre_pilot_predictive_nt_jobs
          SET status = 'failed',
              error = 'TEST_RUN_INTERRUPTED_CLEANUP',
              lease_expires_at = NULL,
              completed_at = NOW(),
              updated_at = NOW()
        WHERE status IN ('pending', 'running')
          AND input_snapshot ? '_runtimeTestOwner'`,
    );
  });

  afterAll(async () => {
    await pool.query(
      `UPDATE ecr_pre_pilot_predictive_nt_jobs
          SET status = 'failed',
              error = 'TEST_RUN_INTERRUPTED_CLEANUP',
              lease_expires_at = NULL,
              completed_at = NOW(),
              updated_at = NOW()
        WHERE status IN ('pending', 'running')
          AND input_snapshot ? '_runtimeTestOwner'`,
    );
    delete process.env.PREDICTIVE_NT_TEST_WORKER_SCRIPT;
    delete process.env.PREDICTIVE_NT_RUNTIME_ROOT;
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

  it('rejects Task 216 hash, coverage, and false blocker-free evidence mutations', () => {
    const hashes = {
      protocolSha256: '1'.repeat(64),
      runnerSha256: '2'.repeat(64),
      resultsSha256: '3'.repeat(64),
      reportSha256: '4'.repeat(64),
      provenanceSha256: '5'.repeat(64),
    };
    const expected = {
      evidenceArtifacts: hashes,
      status: 'BLOCKED_FAIL_CLOSED',
      qualified: false,
      postSplitTpdThreshold: -1e-8,
      exactReferenceJobId: 'reference-job',
      coverage: {
        expectedPhaseEndpoints: 110,
        returnedPhaseEndpoints: 110,
        failingPhaseCount: 42,
        negativeOrUnresolvedPhaseCount: 73,
        optimizerRefinementFailureCount: 31,
      },
      blockers: [
        'POST_SPLIT_TPD_STABILITY_FAILED',
        'FROZEN_COMPOSITION_VALIDATION_FAILED',
      ],
      worstMinimum: -0.62,
      worstFullyReproducedMinimum: -0.61,
      classificationCounts: {
        GENUINE_LOWER_GIBBS_BASIN: 42,
        OPTIMIZER_REFINEMENT_FAILURE: 31,
        STABLE_PHASE: 37,
      },
      comparisonCandidate: {
        disposition: 'REJECTED_FROZEN_VALIDATION_AND_GLOBAL_INSTABILITY',
        qualified: false,
        frozenValidationPassed: false,
        classificationCounts: {
          GENUINE_LOWER_GIBBS_BASIN: 10,
          STABLE_PHASE: 100,
        },
        worstMinimum: -0.1,
      },
    };
    const evidence = {
      evidenceId: 'TASK_216_MONO_RICH_GLOBAL_STABILITY_V1',
      researchOnly: true,
      calibrationRequired: true,
      releaseEligible: false,
      predictiveNt: null,
      ...expected,
    };
    expect(validateTask216GlobalStabilityEvidence(evidence, expected)).toBeNull();
    expect(validateTask216GlobalStabilityEvidence({
      ...evidence,
      evidenceArtifacts: { ...hashes, resultsSha256: '0'.repeat(64) },
    }, expected)).toBe('TASK216_GLOBAL_STABILITY_EVIDENCE_HASH_MISMATCH');
    expect(validateTask216GlobalStabilityEvidence({
      ...evidence,
      coverage: { ...evidence.coverage, returnedPhaseEndpoints: 109 },
    }, expected)).toBe('TASK216_GLOBAL_STABILITY_PHASE_COVERAGE_INCOMPLETE');
    expect(validateTask216GlobalStabilityEvidence({
      ...evidence,
      blockers: ['FROZEN_COMPOSITION_VALIDATION_FAILED'],
    }, expected)).toBe('TASK216_GLOBAL_STABILITY_FALSE_BLOCKER_FREE_CLAIM');
    expect(validateTask216GlobalStabilityEvidence(undefined, expected))
      .toBe('TASK216_GLOBAL_STABILITY_EVIDENCE_MISSING');
    for (const mutation of [
      { ...evidence, exactReferenceJobId: 'other-job' },
      {
        ...evidence,
        coverage: { ...evidence.coverage, negativeOrUnresolvedPhaseCount: 72 },
      },
      {
        ...evidence,
        coverage: { ...evidence.coverage, optimizerRefinementFailureCount: 30 },
      },
      {
        ...evidence,
        comparisonCandidate: {
          ...evidence.comparisonCandidate,
          disposition: 'QUALIFIED',
        },
      },
      {
        ...evidence,
        comparisonCandidate: {
          ...evidence.comparisonCandidate,
          worstMinimum: 0,
        },
      },
    ]) {
      expect(validateTask216GlobalStabilityEvidence(mutation, expected))
        .toBe('TASK216_GLOBAL_STABILITY_FROZEN_SUMMARY_MISMATCH');
    }
  });

  it('rejects Task218 candidate lineage, endpoint, verdict, and governance mutations', () => {
    const evidence = expectedTask218CandidateGeneratedStabilityEvidence();
    expect(validateTask218CandidateGeneratedStabilityEvidence(evidence)).toBeNull();
    for (const mutation of [
      { ...evidence, evidenceId: 'TASK_216_MONO_RICH_GLOBAL_STABILITY_V1' },
      {
        ...evidence,
        evidenceArtifacts: {
          ...evidence.evidenceArtifacts,
          resultsSha256: '0'.repeat(64),
        },
      },
      { ...evidence, candidateModelSha256: '0'.repeat(64) },
      { ...evidence, auditHash: '0'.repeat(64) },
      { ...evidence, candidateParameterSha256: '0'.repeat(64) },
      { ...evidence, candidateFlashHash: '0'.repeat(64) },
      { ...evidence, cascadeExecutionHash: '0'.repeat(64) },
      { ...evidence, endpointMatrixHash: '0'.repeat(64) },
      { ...evidence, qualificationHash: '0'.repeat(64) },
      { ...evidence, componentOrder: [...evidence.componentOrder].reverse() },
      { ...evidence, coverage: { ...evidence.coverage, returned: 109 } },
      {
        ...evidence,
        coverage: {
          ...evidence.coverage,
          classifications: { STABLE_PHASE: 110 },
        },
      },
      { ...evidence, endpointOrder: 'reordered' },
      {
        ...evidence,
        gates: { ...evidence.gates, allGlobalTpdPassed: false },
      },
      { ...evidence, blockers: evidence.blockers.slice(1) },
      {
        ...evidence,
        historicalComparisons: {
          ...evidence.historicalComparisons,
          disposition: 'QUALIFICATION_EVIDENCE',
        },
      },
      { ...evidence, status: 'QUALIFIED' },
      { ...evidence, qualified: true },
      { ...evidence, releaseEligible: true },
      { ...evidence, pilotValidated: true },
      { ...evidence, release: true },
      { ...evidence, predictiveNt: 1 },
      { ...evidence, sulfurPrediction: 'CALCULABLE' },
    ]) {
      expect(validateTask218CandidateGeneratedStabilityEvidence(mutation))
        .toMatch(/TASK218_CANDIDATE_(?:FROZEN_SUMMARY_MISMATCH|GOVERNANCE_VIOLATION)/);
    }
    expect(validateTask218CandidateGeneratedStabilityEvidence(undefined))
      .toBe('TASK218_CANDIDATE_EVIDENCE_MISSING');
  }, 30_000);

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

  it('rejects a PA source mutation that is not reconstructed from Stage 1', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      sourceFeedCompositionMassFraction: {
        ...validInput.sourceFeedCompositionMassFraction,
        saturates: 0.69,
        polar: 0.01,
      },
    })).toThrow('MOLECULAR_FEED_BASIS_MISMATCH');
  });

  it('rejects inconsistent feed, product, and solvent molecular conversions', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      feedMoleFractions: [0.7, 0.3, 0, 0, 0, 0],
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
          di: 0,
          poly: 0,
          polar: 0,
          nmp: 0,
        },
        feedMoleFractions: [
          (saturates / 170.34) / moles,
          (mono / 120.19) / moles,
           0, 0, 0, 0,
        ] as [number, number, number, number, number, number],
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
        minimumMassRecovery: { targetPercent: 85, status: 'CALCULABLE' as const },
      },
    })],
  ])('rejects valid-looking %s mutations not reconstructed from Stage 1', (_name, mutate) => {
    expect(() => validatePredictiveNtJobInput(mutate())).toThrow('STAGE1_AUTHORITY_MISMATCH');
  });

  it('rejects a changed six-component engine contract', () => {
    expect(() => validatePredictiveNtJobInput({
      ...validInput,
      engineComponentContract: {
        ...validInput.engineComponentContract,
        thermodynamicModel: 'COSMO-SAC-2010',
      },
    } as any)).toThrow('PREDICTIVE_NT_SIX_COMPONENT_CONTRACT_REQUIRED');
  });

  it('routes new controlled-water derivations to the 7C contract with an exact wet-solvent closure', () => {
    const seven = derivePredictiveNtInputFromStage1(
      makeStage1Snapshot(canonicalizeStage1Input(validStage1(209), 209)),
      209,
    );
    expect(seven.engineContractVersion).toBe('7C-1.1.0');
    expect(seven.engineComponentContract).toMatchObject({
      componentCount: 7,
      families: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
      thermodynamicModel: 'COSMO_SAC_2010_PROJECT_NMP_LLE_RESIDUAL_H2O_EXTENSION',
    });
    expect(seven.feedMoleFractions).toHaveLength(7);
    expect(seven.solventSpecificationAudit).toEqual({
      nmpPurityMassPercent: 99.5,
      nmpWaterMassPercent: 0.5,
    });
    expect(seven.wetSolventConstruction?.dryNmpMassPerUnitFeedMass).toBeCloseTo(1.4925, 12);
    expect(seven.wetSolventConstruction?.waterMassPerUnitFeedMass).toBeCloseTo(0.0075, 12);
    expect(seven.wetSolventConstruction?.massClosureResidual).toBeLessThanOrEqual(1e-12);
    expect(
      seven.wetSolventConstruction!.totalWetSolventMassPerUnitFeedMass
      - seven.wetSolventConstruction!.dryNmpMassPerUnitFeedMass
      - seven.wetSolventConstruction!.waterMassPerUnitFeedMass,
    ).toBeCloseTo(0, 12);
    expect(() => validatePredictiveNtJobInput({
      ...seven,
      feedMoleFractions: [...seven.feedMoleFractions.slice(0, 6), 0.2],
    })).toThrow('PREDICTIVE_NT_SEVEN_COMPONENT_CONTRACT_REQUIRED');
  });

  it('rejects a 7C input reconstructed under another engine contract', () => {
    const seven = derivePredictiveNtInputFromStage1(
      makeStage1Snapshot(canonicalizeStage1Input(validStage1(209), 209)),
      209,
    );
    expect(() => validatePredictiveNtJobInput({
      ...seven,
      engineContractVersion: '6C-1.0.0',
    })).toThrow('PREDICTIVE_NT_SIX_COMPONENT_CONTRACT_REQUIRED');
  });

  it('uses ACK_V3 for 7C and rejects cross-engine checkpoint contracts', () => {
    const seven = derivePredictiveNtInputFromStage1(
      makeStage1Snapshot(canonicalizeStage1Input(validStage1(209), 209)),
      209,
    );
    expect(predictiveNtCheckpointProtocol(seven)).toBe('ACK_V3_ENGINE_CONTRACT');
    expect(validatePredictiveNtCheckpointContract(
      seven,
      'ACK_V3_ENGINE_CONTRACT',
      '7C-1.1.0',
    )).toBe('ACK_V3_ENGINE_CONTRACT');
    expect(() => validatePredictiveNtCheckpointContract(
      seven,
      'ACK_V2',
      '6C-LEGACY',
    )).toThrow('PREDICTIVE_NT_CROSS_ENGINE_CHECKPOINT_FORBIDDEN');
    expect(predictiveNtCheckpointProtocol(validInput)).toBe('ACK_V2');
    expect(() => validatePredictiveNtCheckpointContract(
      validInput,
      'ACK_V3_ENGINE_CONTRACT',
      '7C-1.1.0',
    )).toThrow('PREDICTIVE_NT_CROSS_ENGINE_CHECKPOINT_FORBIDDEN');
  });

  it('rejects an internally closed but rescaled 7C wet-solvent result', () => {
    const seven = derivePredictiveNtInputFromStage1(
      makeStage1Snapshot(canonicalizeStage1Input({
        ...validStage1(209),
        maximumStages: '2',
      }, 209)),
      209,
    );
    const fractions = Array(7).fill(1 / 7);
    const stream = {
      componentMoles: Array(7).fill(1),
      componentMass: Array(7).fill(1),
      flowMol: 7,
      mass: 7,
      moleFractions: fractions,
      massFractions: fractions,
    };
    const result: any = {
      engineContractVersion: '7C-1.1.0',
      componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
      status: 'IMPLEMENTED — PREDICTIVE QUALIFICATION PENDING',
      implementationStatus: 'IMPLEMENTED',
      releaseEligible: false,
      predictiveNt: null,
      establishedTheoreticalStages: null,
      sulfurPrediction: { status: 'NOT_CALCULABLE' },
      qualificationEvidence: {
        directWaterBearingLleValidated: false,
        independentBlindQualificationPassed: false,
      },
      thermodynamicCondition: {
        temperatureC: 50,
        temperatureK: 323.15,
        authority: 'IMMUTABLE_STAGE1_OPERATING_TEMPERATURE',
      },
      wetSolventConstruction: {
        rrboFeedMass: 100,
        totalWetSolventMass: 150,
        dryNmpMass: 149.25,
        waterMass: 0.75,
        nmpWeightPercentOfWetSolvent: 99.5,
        waterWeightPercentOfWetSolvent: 0.5,
        massClosureResidual: 0,
        componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
      },
      trials: [1, 2].map((stageCount) => ({
        stageCount,
        overallComponentBalanceResidualMol: Array(7).fill(0),
        overallComponentBalanceResidualMass: Array(7).fill(0),
        boundaryStreams: {
          oilFeed: stream,
          freshWetSolvent: stream,
          finalRaffinate: stream,
          finalExtract: stream,
        },
        stages: Array.from({ length: stageCount }, () => ({
          raffinateIncoming: stream,
          extractIncoming: stream,
          raffinateLeaving: stream,
          extractLeaving: stream,
        })),
      })),
    };
    expect(validateSevenComponentPersistedResult(result, { input: seven })).toBeNull();
    const rescaled = {
      ...result,
      wetSolventConstruction: {
        ...result.wetSolventConstruction,
        rrboFeedMass: 200,
        totalWetSolventMass: 300,
        dryNmpMass: 298.5,
        waterMass: 1.5,
      },
    };
    expect(validateSevenComponentPersistedResult(rescaled, { input: seven }))
      .toBe('PREDICTIVE_NT_7C_WET_SOLVENT_AUTHORITY_MISMATCH');
  });

  it('persists a fail-closed 7C engine error without fabricating successful trials', () => {
    const seven = derivePredictiveNtInputFromStage1(
      makeStage1Snapshot(canonicalizeStage1Input(validStage1(209), 209)),
      209,
    );
    expect(validateSevenComponentPersistedResult({
      engineContractVersion: '7C-1.1.0',
      componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
      status: 'ENGINE_ERROR',
      releaseEligible: false,
      predictiveNt: null,
      establishedTheoreticalStages: null,
      error: 'RuntimeError: SEVEN_COMPONENT_STAGE_FLASH_UNRESOLVED:1',
    }, { input: seven })).toBeNull();
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
    const derived = derivePredictiveNtSixComponentInputFromStage1(snapshot, design.projectNumber);

    expect(derived).toMatchObject({
      modelHash: PRE_PILOT_MODEL.modelHash,
      temperatureK: 323.15,
      satIdentity: 'n-dodecane',
      monoIdentity: 'n-propylbenzene',
      sourceFeedCompositionMassFraction: {
        saturates: 0.65,
        mono: 0.2,
        di: 0.05,
        poly: 0.03,
        polar: 0.05,
        nmp: 0.02,
      },
      sourceProductTargetsMassFraction: {
        maximumTotalAromatics: 0.1,
        maximumPolarAromatics: 0.005,
        minimumSaturates: 0.9,
        maximumNmp: 0.01,
        minimumRrboRecovery: 0.9,
      },
      maximumStages: 10,
      stage1Authority: {
        schemaVersion: 'ECR_PRE_PILOT_STAGE_1_V1',
        sulfurPrediction: {
          status: 'NOT_CALCULABLE',
          calibrationStatus: 'CALIBRATION_REQUIRED',
        },
        minimumMassRecovery: {
          targetPercent: 90,
          status: 'CALCULABLE',
        },
      },
    });
    expect(derived.stage1Authority?.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => validatePredictiveNtJobInput(derived)).not.toThrow();
    expect(attachStage1ResultGovernance({
      status: 'RESEARCH_DIAGNOSTIC_NOT_ACCEPTED',
      predictiveNt: null,
      globalStabilityQualification: validTask216Evidence(),
      task218CandidateGeneratedStability: expectedTask218CandidateGeneratedStabilityEvidence(),
    }, derived)).toMatchObject({
      status: 'RESEARCH_DIAGNOSTIC_NOT_ACCEPTED',
      predictiveNt: null,
      stage1TargetGovernance: {
        predictiveNtAuthority: 'FROZEN_SIX_COMPONENT_COSMO_SAC_RESEARCH_ENGINE',
        predictiveNtEngineScope: {
          componentCount: 6,
          thermodynamicModel: 'COSMO-SAC-2010',
          researchDiagnosticOnly: true,
        },
        sulfurPrediction: {
          status: 'NOT_CALCULABLE',
          calibrationStatus: 'CALIBRATION_REQUIRED',
        },
        minimumMassRecovery: {
          targetPercent: 90,
          status: 'CALCULABLE',
        },
        overallEcrProductAcceptance: false,
        overallEcrProductAcceptanceStatus: 'RESEARCH_DIAGNOSTIC_NOT_RELEASE_ELIGIBLE',
      },
    });
    expect(() => attachStage1ResultGovernance({
      status: 'RESEARCH_DIAGNOSTIC_NOT_ACCEPTED',
      predictiveNt: null,
    }, derived)).toThrow('TASK216_GLOBAL_STABILITY_EVIDENCE_MISSING');
    expect(() => attachStage1ResultGovernance({
      status: 'RESEARCH_DIAGNOSTIC_NOT_ACCEPTED',
      predictiveNt: null,
      globalStabilityQualification: validTask216Evidence(),
    }, derived)).toThrow('TASK218_CANDIDATE_EVIDENCE_MISSING');
    expect(() => attachStage1ResultGovernance({
      status: 'RUNNING',
      checkpoint: { protocol: 'ACK_V2' },
    }, derived)).toThrow('PREDICTIVE_NT_TERMINAL_RUNNING_ACK_PAYLOAD_FORBIDDEN');
    expect(attachStage1ResultGovernance({
      status: 'RUNNING',
      checkpoint: { protocol: 'ACK_V2' },
    }, derived, { allowAckCheckpoint: true })).toMatchObject({
      status: 'RUNNING',
      checkpoint: { protocol: 'ACK_V2' },
      predictiveNt: null,
      releaseEligible: false,
    });
  }, 60_000);

  it('admits positive PA and feed NMP in the saved six-component Stage 1 scope', async () => {
    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for Stage 1 scope test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, `stage1-scope-${Date.now()}`);
    const stage1 = validStage1(design.projectNumber);
    stage1.saturatesWt = '64';
    stage1.polarAromaticsWt = '6';
    const snapshot = await saveEcrPrePilotStage1(userId, design.id, stage1);
    expect(() => derivePredictiveNtSixComponentInputFromStage1(snapshot, design.projectNumber)).not.toThrow();
  });

  it('fails closed for an unsupported saved phase configuration', async () => {
    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for Stage 1 phase test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, `stage1-phase-${Date.now()}`);
    const stage1 = validStage1(design.projectNumber);
    stage1.phaseConfiguration = 'rrbo-continuous-nmp-dispersed';
    const snapshot = await saveEcrPrePilotStage1(userId, design.id, stage1);
    expect(() => derivePredictiveNtSixComponentInputFromStage1(snapshot, design.projectNumber))
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

  it('fails preflight before submission when a packaged runtime artifact is missing', () => {
    execFileSync('node', ['scripts/package-predictive-nt-runtime.mjs']);
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'predictive-nt-runtime-'));
    cpSync('dist/predictive-nt-runtime', temporaryRoot, { recursive: true });
    process.env.PREDICTIVE_NT_RUNTIME_ROOT = temporaryRoot;
    try {
      const relativeScipyPath =
        'server/research/ecr-pre-pilot-cosmosac/vendor/python/scipy/optimize/_lsq/least_squares.py';
      const temporaryScipyPath = path.join(temporaryRoot, relativeScipyPath);
      appendFileSync(temporaryScipyPath, '\n# tampered scientific optimizer\n');
      expect(() => preflightPredictiveNtRuntime())
        .toThrow(/SCIENTIFIC_RUNTIME_MANIFEST_FILE_MISMATCH/);
      copyFileSync(path.join('dist/predictive-nt-runtime', relativeScipyPath), temporaryScipyPath);

      rmSync(path.join(
        temporaryRoot,
        'server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles/sigma3/BBEAQIROQSPTKN-UHFFFAOYSA-N.sigma',
      ));
      expect(() => preflightPredictiveNtRuntime())
        .toThrow(/(?:SCIENTIFIC_RUNTIME_(?:INPUT_MISSING|MANIFEST_FILE_MISMATCH)|FileNotFoundError)/);
    } finally {
      delete process.env.PREDICTIVE_NT_RUNTIME_ROOT;
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it('runs a saved Stage-1 stage search to completion from the production runtime bundle', async () => {
    execFileSync('node', ['scripts/package-predictive-nt-runtime.mjs']);
    process.env.PREDICTIVE_NT_RUNTIME_ROOT = 'dist/predictive-nt-runtime';
    expect(preflightPredictiveNtRuntime()).toMatchObject({
      status: 'PASS',
      python: '3.12',
      engineId: 'ECR2_PREDICTIVE_NT_SIX_COMPONENT_COSMOSAC',
      componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'],
      modelIdentity: 'COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL',
    });
    const preflight = preflightPredictiveNtRuntime();
    expect(preflight.engineHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preflight.verifiedScientificInputCount).toBeGreaterThanOrEqual(2_000);
    expect(preflight.verifiedScientificInputAggregateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(preflight.verifiedNativeDependencyCount).toBeGreaterThan(0);
    expect(preflight.verifiedNativeDependencyAggregateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(preflight.runtimeManifestStatus).toBe('PACKAGED_MANIFEST_VERIFIED');

    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for Predictive N_T integration test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, 'predictive-nt-prod-integration-v1');
    try {
      const submitted = await enqueuePredictiveNtRuntimeTestJob(
        validInputWithMaximumStages(2),
        userId,
        design.id,
        { restartAfterAcknowledgedStage: 1 },
      );

      let completed = await getPredictiveNtJob(submitted.jobId, userId, design.id);
      const deadline = Date.now() + 270_000;
      while (completed?.status !== 'completed' && completed?.status !== 'failed' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        completed = await getPredictiveNtJob(submitted.jobId, userId, design.id);
      }

      expect(completed?.status, completed?.error ?? 'job did not complete').toBe('completed');
      expect(completed?.modelHash).toBe(PRE_PILOT_MODEL.modelHash);
      const restartHistory = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM ecr_pre_pilot_predictive_nt_job_history
          WHERE job_id = $1
            AND details->>'event' = 'stale_job_reclaimed'`,
        [submitted.jobId],
      );
      expect(restartHistory.rows[0].total).toBeGreaterThanOrEqual(1);
      expect(completed?.engineHash).toBe(
        preflight.engineHash,
      );
      expect(completed?.result).toMatchObject({
        status: 'RESEARCH_DIAGNOSTIC_NOT_ACCEPTED',
        establishedTheoreticalStages: null,
        releaseEligible: false,
        calibrationRequired: true,
        componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'],
        modelIdentity: 'COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL',
        engine: {
          engineId: 'ECR2_PREDICTIVE_NT_SIX_COMPONENT_COSMOSAC',
          engineHash: completed?.engineHash,
        },
        globalStabilityQualification: {
          evidenceId: 'TASK_216_MONO_RICH_GLOBAL_STABILITY_V1',
          status: 'BLOCKED_FAIL_CLOSED',
          qualified: false,
          researchOnly: true,
          calibrationRequired: true,
          releaseEligible: false,
          predictiveNt: null,
          postSplitTpdThreshold: -1e-8,
          coverage: {
            expectedPhaseEndpoints: 110,
            returnedPhaseEndpoints: 110,
            failingPhaseCount: 57,
            negativeOrUnresolvedPhaseCount: 96,
            optimizerRefinementFailureCount: 39,
          },
          comparisonCandidate: {
            disposition: 'REJECTED_FROZEN_VALIDATION_AND_GLOBAL_INSTABILITY',
            qualified: false,
            frozenValidationPassed: false,
          },
          blockers: [
            'FROZEN_COMPOSITION_VALIDATION_FAILED',
            'POST_SPLIT_TPD_STABILITY_FAILED',
            'DIRECT_MATCHING_SIX_COMPONENT_LLE_EVIDENCE_MISSING',
          ],
        },
        stage1Authority: {
          freshModeledNmpMassBasis: 150,
          nmpPurityAndWaterSpecificationOnly: {
            nmpPurityWt: 99.5,
            nmpWaterWt: 0.5,
          },
        },
      });
      const result = completed?.result as any;
      expect(result.globalStabilityQualification.evidenceArtifacts.resultsSha256)
        .toMatch(/^[a-f0-9]{64}$/);
      expect(result.globalStabilityQualification.classificationCounts).toEqual({
        GENUINE_LOWER_GIBBS_BASIN: 57,
        LOCAL_HESSIAN_ONLY_ARTIFACT: 14,
        OPTIMIZER_REFINEMENT_FAILURE: 39,
      });
      expect(result.stage1TargetGovernance.overallEcrProductAcceptance).toBe(false);
      expect(result.trials).toHaveLength(2);
      expect(result.trials[0]).toMatchObject({
        stageCount: 1,
        researchStatus: 'RESEARCH_DIAGNOSTIC_NOT_ACCEPTED',
        releaseEligible: false,
        numericalAcceptancePassed: expect.any(Boolean),
        boundaryStreams: {
          oilFeed: { componentMoles: expect.any(Array) },
          freshNmp: { componentMoles: expect.any(Array) },
        },
      });
      expect(result.trials[0].boundaryStreams.oilFeed.componentMass).toHaveLength(6);
      expect(result.trials[0].boundaryStreams.freshNmp.componentMass).toHaveLength(6);
      expect(result.trials[0].boundaryStreams.oilFeed.componentMass[4]).toBeGreaterThan(0);
      expect(result.trials[0].boundaryStreams.oilFeed.componentMass[5]).toBeGreaterThan(0);
      expect(result.trials[0].boundaryStreams.freshNmp.componentMass.slice(0, 5))
        .toEqual([0, 0, 0, 0, 0]);
      expect(result.trials[0].boundaryStreams.freshNmp.componentMass[5]).toBeGreaterThan(0);
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
      expect(result.trials[0].maximumOverallComponentBalanceResidualMol).toBeLessThanOrEqual(1e-8);
      expect(Math.abs(Object.values(result.trials[0].overallComponentBalanceResidualMol)
        .reduce((sum: number, value) => sum + Number(value), 0))).toBeLessThanOrEqual(1e-8);
      for (const trial of result.trials) {
        expect(trial.residualClosureStatus).toMatch(/^(CLOSED|UNCLOSED)$/);
        expect(trial.solverTerminationStatus).toMatch(
          /^(MAX_NFEV|GTOL|FTOL|XTOL|FTOL_AND_XTOL|RESIDUAL_CLOSURE|NEWTON_STOPPED_UNCLOSED|NUMERICAL_ERROR|UNKNOWN)$/,
        );
        expect(trial.multistartEvidence.primary).toMatchObject({
          terminationStatus: expect.any(String),
          terminationMessage: expect.any(String),
          functionEvaluations: expect.any(Number),
          maximumScaledEquationResidual: expect.any(Number),
          closureLimit: 1e-8,
          residualClosureStatus: expect.stringMatching(/^(CLOSED|UNCLOSED)$/),
        });
        expect(trial.multistartEvidence.secondary).toMatchObject({
          terminationStatus: expect.any(String),
          terminationMessage: expect.any(String),
          functionEvaluations: expect.any(Number),
          maximumScaledEquationResidual: expect.any(Number),
          closureLimit: 1e-8,
          residualClosureStatus: expect.stringMatching(/^(CLOSED|UNCLOSED)$/),
        });
        const bothClosed = trial.multistartEvidence.primary.residualClosureStatus === 'CLOSED'
          && trial.multistartEvidence.secondary.residualClosureStatus === 'CLOSED';
        expect(trial.multistartEvidence.bothStartsClosed).toBe(bothClosed);
        expect(trial.branchComparisonStatus).toBe(
          bothClosed ? 'EVALUATED' : 'NOT_EVALUABLE_ENDPOINT_UNCLOSED',
        );
        expect(trial.multistartProductRelativeDifference == null).toBe(!bothClosed);
        if (!bothClosed) {
          expect(trial.acceptanceBlockers.map(({ code }: { code: string }) => code))
            .not.toContain('MULTISTART_BRANCH_REPRODUCTION_FAILED');
        }
      }
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
  }, 420_000);

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
    useAckProtocolFixture();
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
    expect((terminal?.result as any)?.globalStabilityQualification).toMatchObject({
      evidenceId: 'TASK_216_MONO_RICH_GLOBAL_STABILITY_V1',
      predictiveNt: null,
      releaseEligible: false,
    });
    expect((terminal?.result as any)?.task218CandidateGeneratedStability).toMatchObject({
      evidenceId: 'TASK_218_CANDIDATE_GENERATED_CONTROLLED_NEGATIVE_V1',
      predictiveNt: null,
      sulfurPrediction: 'NOT_CALCULABLE',
      pilotValidated: false,
      releaseEligible: false,
    });
  }, 150_000);

  it('fails a zero-exit final RUNNING ACK payload and persists server evidence', async () => {
    useAckProtocolFixture();
    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for terminal ACK bypass test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, 'predictive-nt-terminal-ack-bypass-v1');
    const submitted = await enqueuePredictiveNtRuntimeTestJob(
      validInputWithMaximumStages(2),
      userId,
      design.id,
      { replaceFinalPayloadWithRunningAck: true },
    );
    let terminal = await getPredictiveNtJob(submitted.jobId, userId, design.id);
    const deadline = Date.now() + 120_000;
    while (terminal?.status !== 'completed' && terminal?.status !== 'failed' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      terminal = await getPredictiveNtJob(submitted.jobId, userId, design.id);
    }
    expect(terminal?.status).toBe('failed');
    expect(terminal?.error).toContain('PREDICTIVE_NT_TERMINAL_RUNNING_ACK_PAYLOAD_FORBIDDEN');
    expect(terminal?.result).toMatchObject({
      status: 'ENGINE_ERROR',
      predictiveNt: null,
      releaseEligible: false,
      calibrationRequired: true,
      globalStabilityQualification: {
        evidenceId: 'TASK_216_MONO_RICH_GLOBAL_STABILITY_V1',
        predictiveNt: null,
        releaseEligible: false,
      },
      task218CandidateGeneratedStability: {
        evidenceId: 'TASK_218_CANDIDATE_GENERATED_CONTROLLED_NEGATIVE_V1',
        predictiveNt: null,
        sulfurPrediction: 'NOT_CALCULABLE',
        pilotValidated: false,
        releaseEligible: false,
      },
    });
  }, 150_000);

  it('replaces an admitted completed result when report generation fails', async () => {
    useAckProtocolFixture();
    const user = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1');
    if (!user.rows[0]) throw new Error('No user available for report failure test');
    const userId = Number(user.rows[0].id);
    const design = await allocateEcrPrePilotDesign(userId, 'predictive-nt-report-failure-v1');
    const submitted = await enqueuePredictiveNtRuntimeTestJob(
      validInputWithMaximumStages(2),
      userId,
      design.id,
      { forceReportGenerationFailure: true },
    );
    let terminal = await getPredictiveNtJob(submitted.jobId, userId, design.id);
    const deadline = Date.now() + 120_000;
    while (terminal?.status !== 'completed' && terminal?.status !== 'failed' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      terminal = await getPredictiveNtJob(submitted.jobId, userId, design.id);
    }
    expect(terminal?.status).toBe('failed');
    expect(terminal?.error).toContain(
      'PREDICTIVE_NT_REPORT_GENERATION_FAILED: PREDICTIVE_NT_TEST_FORCED_REPORT_GENERATION_FAILURE',
    );
    expect(terminal?.result).toMatchObject({
      status: 'ENGINE_ERROR',
      predictiveNt: null,
      releaseEligible: false,
      calibrationRequired: true,
      globalStabilityQualification: {
        evidenceId: 'TASK_216_MONO_RICH_GLOBAL_STABILITY_V1',
        predictiveNt: null,
        releaseEligible: false,
      },
      task218CandidateGeneratedStability: {
        evidenceId: 'TASK_218_CANDIDATE_GENERATED_CONTROLLED_NEGATIVE_V1',
        status: 'BLOCKED_FAIL_CLOSED',
        qualified: false,
        predictiveNt: null,
        sulfurPrediction: 'NOT_CALCULABLE',
        pilotValidated: false,
        releaseEligible: false,
      },
    });
    expect(terminal?.report.available).toBe(false);
  }, 150_000);

  it('resumes at the next stage after a worker restart without rewriting acknowledged evidence', async () => {
    useAckProtocolFixture();
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
    useAckProtocolFixture();
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