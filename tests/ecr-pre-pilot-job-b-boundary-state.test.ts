import { beforeEach, describe, expect, it, vi } from 'vitest';

const predictiveMocks = vi.hoisted(() => ({
  validateInput: vi.fn(),
  validateResult: vi.fn(),
  validateExecution: vi.fn(),
}));

vi.mock('../server/ecr-pre-pilot/predictive-nt-job-service', () => ({
  validatePredictiveNtJobInput: predictiveMocks.validateInput,
  validateSevenComponentPersistedResult: predictiveMocks.validateResult,
  validatePredictiveNtExecutionEvidence: predictiveMocks.validateExecution,
}));

vi.mock('../server/ecr-pre-pilot/stage1', () => ({
  validateStage1Snapshot: (value: unknown) => {
    if (!value || typeof value !== 'object' || !(value as any).immutableHash) {
      throw new Error('STAGE1_SNAPSHOT_INVALID');
    }
    return value;
  },
}));

import { PRE_PILOT_MULTISTAGE_MODEL } from '../server/ecr-pre-pilot/model';
import {
  JOB_B_BOUNDARY_COMPONENT_ORDER,
  JobBBoundaryStateError,
  extractJobCGlobalBoundaryState,
  extractJobBBoundaryState,
  jobBBoundarySourceResultHash,
  loadJobBBoundaryState,
} from '../server/ecr-pre-pilot/job-b-boundary-state';
import { evaluateJobA, jobAResultHash, type JobAEvaluationInput } from '../server/ecr-pre-pilot/job-a';
import { makeJobBInterfaceRequest } from '../server/ecr-pre-pilot/job-b-simultaneous';
import { prepareJobCAxialLocalContactProfile } from '../server/ecr-pre-pilot-service';

const h = (character: string) => character.repeat(64);
const stage1Hash = h('a');
const engineHash = h('e');

const currentStage1 = (immutableHash = stage1Hash) => ({
  immutableHash,
  stage1: { operatingTemperatureC: 50 },
});

const stream = (fractions: number[]) => ({
  flowMol: 1,
  mass: 1,
  componentMoles: [...fractions],
  moleFractions: [...fractions],
  componentMass: [...fractions],
  massFractions: [...fractions],
});

const rrboIncoming = () => stream([.73, .1, .08, .04, .05, 0, 0]);
const extractIncoming = () => stream([.01, .01, .01, .01, .01, .9, .05]);

function sourceRow(overrides: Record<string, unknown> = {}) {
  const oilFeed = rrboIncoming();
  const freshWetSolvent = extractIncoming();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    design_id: 269,
    created_by: 3,
    engine_hash: engineHash,
    model_hash: PRE_PILOT_MULTISTAGE_MODEL.modelHash,
    completed_at: '2025-01-01T00:00:00.000Z',
    input_snapshot: {
      engineContractVersion: '7C-1.5.0',
      modelHash: PRE_PILOT_MULTISTAGE_MODEL.modelHash,
      temperatureK: 323.15,
      engineComponentContract: {
        componentCount: 7,
        families: [...JOB_B_BOUNDARY_COMPONENT_ORDER],
        thermodynamicModel: 'NATIVE_SEVEN_COMPONENT_COSMO_SAC_2010_ADDITIVE_RK_H2O',
      },
      stage1Authority: {
        snapshotHash: stage1Hash,
        source: currentStage1(),
      },
    },
    result_snapshot: {
      componentOrder: [...JOB_B_BOUNDARY_COMPONENT_ORDER],
      thermodynamicCondition: { temperatureK: 323.15 },
      // Deliberately rejected-looking outlets: the extractor must never read them.
      trials: [{
        stageCount: 1,
        accepted: false,
        boundaryStreams: {
          oilFeed,
          freshWetSolvent,
          finalRaffinate: { rejectedOutlet: true },
          finalExtract: { rejectedOutlet: true },
        },
        stages: [{
          stageFromFeedEnd: 1,
          accepted: false,
          componentOrder: [...JOB_B_BOUNDARY_COMPONENT_ORDER],
          raffinateIncoming: oilFeed,
          extractIncoming: freshWetSolvent,
          raffinateLeaving: { rejectedOutlet: true },
          extractLeaving: { rejectedOutlet: true },
        }],
      }],
    },
    ...overrides,
  };
}

function extract(row = sourceRow(), requestedNT = 7, stage1 = currentStage1()) {
  return extractJobBBoundaryState({
    row: row as any,
    currentStage1: stage1,
    requestedNT,
    currentEngineHash: engineHash,
  });
}

beforeEach(() => {
  predictiveMocks.validateInput.mockReset();
  predictiveMocks.validateResult.mockReset().mockReturnValue(null);
  predictiveMocks.validateExecution.mockReset().mockImplementation(
    (job: any, current: string) =>
      job.engineHash === current ? null : 'PREDICTIVE_NT_ENGINE_HASH_MISMATCH',
  );
});

describe('Job B governed Stage-2 incoming boundary loader', () => {
  it('keeps an N>1 loaded Job-B extract local while Job C uses fresh solvent globally', () => {
    const row = sourceRow() as any;
    const trial = row.result_snapshot.trials[0];
    trial.stageCount = 10;
    const loadedExtract = stream([.03, .02, .01, .01, .01, .87, .05]);
    trial.stages[0].extractIncoming = loadedExtract;
    const result = extractJobCGlobalBoundaryState({
      row,
      currentStage1: currentStage1(),
      requestedNT: 10,
      currentEngineHash: engineHash,
      expectedProvenance: {
        stage2JobId: row.id,
        resultSnapshotHash: jobBBoundarySourceResultHash(row.result_snapshot),
        engineHash,
        modelHash: PRE_PILOT_MULTISTAGE_MODEL.modelHash,
        stage1ImmutableHash: stage1Hash,
        sourceStageCount: 10,
      },
    });
    expect(result.freshWetSolvent.stream).toEqual(trial.boundaryStreams.freshWetSolvent);
    expect(result.jobBLocalInterfaceState.extractIncoming.stream).toEqual(loadedExtract);
    expect(result.jobBLocalInterfaceState.extractIncoming.stream)
      .not.toEqual(result.freshWetSolvent.stream);
    expect(result.provenance.boundaryRole)
      .toBe('GLOBAL_COLUMN_INLETS_NOT_JOB_B_LOCAL_INTERFACE_BULKS');
    expect(result.axialLocalContactProfileComplete).toBe(false);
    expect(result.axialLocalContacts).toHaveLength(1);
  });

  it('retains requested N_T=7 while explicitly selecting the only recorded N=1 trial', () => {
    const result = extract();
    expect(result).toMatchObject({
      requestedNT: 7,
      sourceStageCount: 1,
      stageFromFeedEnd: 1,
      trialAccepted: false,
      stageAccepted: false,
      temperatureK: 323.15,
      componentOrder: [...JOB_B_BOUNDARY_COMPONENT_ORDER],
      provenance: {
        requestedNT: 7,
        sourceStageCount: 1,
        requestedNtWasDirectlyRecorded: false,
        temperatureK: 323.15,
      },
    });
    expect(result.requestedNT).not.toBe(result.sourceStageCount);
  });

  it('returns the saved incoming bulks, not rejected leaving or final outlet records', () => {
    const row = sourceRow();
    const result = extract(row);
    const stage = (row.result_snapshot as any).trials[0].stages[0];
    expect(result.extractIncoming.stream).toEqual(stage.extractIncoming);
    expect(result.raffinateIncoming.stream).toEqual(stage.raffinateIncoming);
    expect(result.extractIncoming.stream).not.toEqual(stage.extractLeaving);
    expect(result.raffinateIncoming.stream).not.toEqual(stage.raffinateLeaving);
    expect(result.extractIncoming).toMatchObject({
      role: 'extractIncoming',
      phaseIdentity: 'EXTRACT_PHASE_BULK',
      normalizedAsSaved: true,
      trialAccepted: false,
      stageAccepted: false,
      qualification: {
        inletBoundaryKnown: true,
        equilibriumOutletClaimed: false,
        acceptedLleClaimed: false,
        mayBeUsedWhenRecordedOutputsFailed: true,
      },
    });
    expect(result.raffinateIncoming.phaseIdentity).toBe('RAFFINATE_PHASE_BULK');
    expect(result.extractIncoming.propertyPath).toContain('extractIncoming');
    expect(result.raffinateIncoming.propertyPath).toContain('raffinateIncoming');
  });

  it('checks seven-component normalization and mole/mass closure without replacing saved arrays', () => {
    const row = sourceRow();
    const original = (row.result_snapshot as any).trials[0].stages[0].extractIncoming;
    const result = extract(row);
    expect(result.extractIncoming.stream.moleFractions).toEqual(original.moleFractions);
    expect(result.extractIncoming.stream.componentMoles).toEqual(original.componentMoles);

    const malformed = sourceRow();
    (malformed.result_snapshot as any).trials[0].stages[0]
      .extractIncoming.moleFractions[0] += .1;
    expect(() => extract(malformed)).toThrow(/RECORDED_INCOMING_STREAM_CLOSURE_FAILED/);
  });

  it('preserves governed trace solvent inventory in the authoritative RRBO inlet', () => {
    const seeded = sourceRow();
    const rrbo = (seeded.result_snapshot as any).trials[0].boundaryStreams.oilFeed;
    for (const field of [
      'componentMoles', 'moleFractions', 'componentMass', 'massFractions',
    ]) {
      rrbo[field][4] -= .01;
      rrbo[field][5] += .01;
    }
    const result = extract(seeded);
    expect(result.raffinateIncoming.stream).toEqual(rrbo);
    expect(result.raffinateIncoming.stream.moleFractions[5]).toBe(.01);
  });

  it('rejects stale Stage-1 authority, stale engine, temperature, order, and invalid input', () => {
    expect(() => extract(sourceRow(), 7, currentStage1(h('b'))))
      .toThrow(/STALE_STAGE1_AUTHORITY/);

    const staleEngine = sourceRow({ engine_hash: h('f') });
    expect(() => extract(staleEngine)).toThrow(/PREDICTIVE_NT_ENGINE_HASH_MISMATCH/);

    const wrongTemperature = sourceRow();
    (wrongTemperature.result_snapshot as any).thermodynamicCondition.temperatureK = 320;
    expect(() => extract(wrongTemperature)).toThrow(/RESULT_IDENTITY_MISMATCH/);

    const wrongOrder = sourceRow();
    (wrongOrder.input_snapshot as any).engineComponentContract.families.reverse();
    expect(() => extract(wrongOrder)).toThrow(/PINNED_7C_1_5_IDENTITY_REQUIRED/);

    predictiveMocks.validateInput.mockImplementationOnce(() => {
      throw new Error('PREDICTIVE_NT_7C_INPUT_RECONSTRUCTION_MISMATCH');
    });
    expect(() => extract(sourceRow())).toThrow(/STAGE2_INPUT_INVALID/);
  });

  it('does not guess among multiple trials when requested N_T is absent', () => {
    const row = sourceRow();
    const trial = (row.result_snapshot as any).trials[0];
    (row.result_snapshot as any).trials = [
      { ...trial, stageCount: 1 },
      { ...trial, stageCount: 2 },
    ];
    expect(() => extract(row, 7)).toThrow(/NO_UNAMBIGUOUS_RECORDED_TRIAL/);
  });

  it('enforces design ownership and fails closed for an empty completed-job lookup', async () => {
    const emptyQuery = vi.fn().mockResolvedValue({ rows: [] });
    await expect(loadJobBBoundaryState(3, 269, 7, {
      query: emptyQuery,
      currentEngineHash: () => engineHash,
    })).rejects.toThrow(/OWNED_DESIGN_NOT_FOUND/);
    expect(emptyQuery.mock.calls[0][1]).toEqual([3, 269]);
    expect(emptyQuery.mock.calls[0][0]).toContain('created_by = $1');
    expect(emptyQuery.mock.calls[0][0]).toContain("status = 'completed'");

    const noJobQuery = vi.fn().mockResolvedValue({
      rows: [{ current_stage1: currentStage1(), id: null }],
    });
    await expect(loadJobBBoundaryState(3, 269, 7, {
      query: noJobQuery,
      currentEngineHash: () => engineHash,
    })).rejects.toThrow(/LATEST_COMPLETED_7C_1_5_STAGE2_NOT_FOUND/);

    const foreign = sourceRow({ created_by: 4 });
    const foreignQuery = vi.fn().mockResolvedValue({
      rows: [{ ...foreign, current_stage1: currentStage1() }],
    });
    await expect(loadJobBBoundaryState(3, 269, 7, {
      query: foreignQuery,
      currentEngineHash: () => engineHash,
    })).rejects.toThrow(/STAGE2_OWNERSHIP_MISMATCH/);
  });

  it('makes the loader invalidate stale Stage-1 and deployed-engine lineage', async () => {
    const staleStage1Query = vi.fn().mockResolvedValue({
      rows: [{ ...sourceRow(), current_stage1: currentStage1(h('b')) }],
    });
    await expect(loadJobBBoundaryState(3, 269, 7, {
      query: staleStage1Query,
      currentEngineHash: () => engineHash,
    })).rejects.toThrow(/STALE_STAGE1_AUTHORITY/);

    const validQuery = vi.fn().mockResolvedValue({
      rows: [{ ...sourceRow(), current_stage1: currentStage1() }],
    });
    await expect(loadJobBBoundaryState(3, 269, 7, {
      query: validQuery,
      currentEngineHash: () => h('f'),
    })).rejects.toThrow(/PREDICTIVE_NT_ENGINE_HASH_MISMATCH/);
  });

  it('surfaces structured diagnostics rather than inventing a state', () => {
    try {
      extract(sourceRow(), 0);
      throw new Error('expected structured boundary error');
    } catch (error) {
      expect(error).toBeInstanceOf(JobBBoundaryStateError);
      expect(error).toMatchObject({
        code: 'REQUESTED_NT_INVALID',
        diagnostics: { requestedNT: 0 },
        details: { requestedNT: 0 },
      });
    }
  });
});

const jobAInput = (): JobAEvaluationInput => ({
  stage1SnapshotHash: stage1Hash,
  theoreticalStages: 7,
  theoreticalStageProvenance: 'PRE_PILOT_DESIGN_DEFAULT',
  stage2JobId: null,
  stage2ResultHash: null,
  stage2EngineHash: engineHash,
  thermodynamicAdapterPreflightHash: h('f'),
  stage3RunId: 'stage-3',
  stage3ImmutableHash: h('b'),
  stage3ImplementationHash: h('c'),
  selectedTrialId: 'rpm:60:diameterM:0.5',
  selectedTrialOrdinal: 0,
  temperatureK: 323.15,
  interfacialTensionNM: .012,
  d32M: .002,
  slipVelocityMS: .08,
  continuous: {
    densityKgM3: 1000,
    dynamicViscosityPaS: .002,
    moleFractions: [.02, .01, .01, .01, .01, .89, .05],
  },
  dispersed: {
    densityKgM3: 850,
    dynamicViscosityPaS: .012,
    moleFractions: [.55, .15, .1, .08, .07, .05, 0],
  },
});

describe('Job B simultaneous interface request boundary use', () => {
  it('uses saved Stage-2 bulks rather than Job-A phase compositions or hydraulic terms', () => {
    const boundary = extract();
    const jobA = evaluateJobA(jobAInput()) as any;
    const first = makeJobBInterfaceRequest(
      jobA,
      boundary,
      'nmp-continuous-rrbo-dispersed',
    );
    expect(first.request.x_bulk_continuous)
      .toEqual(boundary.extractIncoming.stream.moleFractions);
    expect(first.request.x_bulk_dispersed)
      .toEqual(boundary.raffinateIncoming.stream.moleFractions);
    expect(first.request.x_bulk_continuous).not.toEqual(jobA.input.continuous.moleFractions);
    expect(first.request.x_bulk_dispersed).not.toEqual(jobA.input.dispersed.moleFractions);
    expect(first.request).not.toHaveProperty('holdup');
    expect(first.request).not.toHaveProperty('phi');
    expect(first.request).not.toHaveProperty('d32');
    expect(first.request).not.toHaveProperty('m');

    const changedStage3Phi = structuredClone(jobA);
    changedStage3Phi.localHydraulics.operatingHoldup = .73;
    changedStage3Phi.resultSha256 = jobAResultHash(changedStage3Phi);
    const second = makeJobBInterfaceRequest(
      changedStage3Phi,
      boundary,
      'nmp-continuous-rrbo-dispersed',
    );
    expect(second.request).toEqual(first.request);
  });
});

describe('Job C axial local-contact profile preparation', () => {
  const contact = (stageFromFeedEnd: number) => ({
    stageFromFeedEnd,
    propertyPath: `stage-${stageFromFeedEnd}`,
    extractIncoming: extractIncoming(),
    raffinateIncoming: rrboIncoming(),
  });

  it.each([1, 2, 3, 4, 5, 6])(
    'fails closed for a complete ordered Stage-2 record with %i contacts',
    (recordedContacts) => {
      const contacts = Array.from(
        { length: recordedContacts },
        (_, index) => contact(index + 1),
      );
      let workerRequestCreated = false;
      try {
        const prepared = prepareJobCAxialLocalContactProfile(
          contacts,
          true,
          true,
          h('9'),
        );
        workerRequestCreated = Boolean(prepared);
        throw new Error('expected sparse profile dependency block');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({
          message: 'JOB_C_DEPENDENCY_BLOCKED:AXIAL_LOCAL_CONTACT_PROFILE_UNAVAILABLE',
          details: {
            requiredRecordedContacts: 7,
            recordedContacts,
            repeatedOrInventedContactsPermitted: false,
            heightClaimed: false,
          },
        });
      }
      expect(workerRequestCreated).toBe(false);
      expect(contacts.map(item => item.stageFromFeedEnd))
        .toEqual(Array.from({ length: recordedContacts }, (_, index) => index + 1));
    },
  );

  it('retains deterministic contiguous-bin mapping for more than seven contacts', () => {
    const contacts = Array.from({ length: 10 }, (_, index) => contact(index + 1));
    const prepared = prepareJobCAxialLocalContactProfile(contacts, true, true, h('9'));
    expect(prepared.profile).toHaveLength(7);
    expect(prepared.profile.map(cell => cell.provenance.sourceStageFromFeedEnd)).toEqual([
      [1], [2], [3, 4], [5], [6, 7], [8], [9, 10],
    ]);
    expect(prepared.profile.flatMap(cell => cell.provenance.sourceStageFromFeedEnd))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(prepared.profile.every(cell =>
      cell.provenance.mapping === 'CONTIGUOUS_EQUAL_AXIAL_BINS_ARITHMETIC_COMPOSITION_MEAN'))
      .toBe(true);
  });

  it.each([
    ['duplicate', [1, 2, 3, 4, 5, 6, 6]],
    ['gap', [1, 2, 3, 4, 5, 6, 8]],
  ])('rejects a full-length profile with a %s axial position before mapping', (_, positions) => {
    let profileMappingEntered = false;
    const contacts = positions.map(stageFromFeedEnd => ({
      stageFromFeedEnd,
      propertyPath: `stage-${stageFromFeedEnd}`,
      get extractIncoming() {
        profileMappingEntered = true;
        throw new Error('profile mapping must not read malformed contacts');
      },
      get raffinateIncoming() {
        profileMappingEntered = true;
        throw new Error('profile mapping must not read malformed contacts');
      },
    }));
    let workerRequestCreated = false;
    try {
      const prepared = prepareJobCAxialLocalContactProfile(contacts, true, true, h('9'));
      workerRequestCreated = Boolean(prepared);
      throw new Error('expected malformed profile dependency block');
    } catch (error) {
      expect(error).toMatchObject({
        message: 'JOB_C_DEPENDENCY_BLOCKED:AXIAL_LOCAL_CONTACT_PROFILE_UNAVAILABLE',
        details: {
          requiredRecordedContacts: 7,
          recordedContacts: 7,
          repeatedOrInventedContactsPermitted: false,
          heightClaimed: false,
        },
      });
    }
    expect(profileMappingEntered).toBe(false);
    expect(workerRequestCreated).toBe(false);
  });
});
