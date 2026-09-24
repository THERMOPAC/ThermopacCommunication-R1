import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRE_PILOT_MODEL } from '../server/ecr-pre-pilot/model';
import {
  attachStage1ResultGovernance,
  derivePredictiveNtSixComponentInputFromStage1,
} from '../server/ecr-pre-pilot/predictive-nt-job-service';
import {
  canonicalizeStage1Input,
  makeStage1Snapshot,
  stage1SnapshotHash,
} from '../server/ecr-pre-pilot/stage1';

function archivedStage1Input() {
  return {
    projectReference: '209',
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
    maximumStages: '2',
  };
}

describe('Predictive N_T retired runtime archive', () => {
  it('replays the retired 6C scientific assertions from research source', () => {
    const worker = path.resolve(
      'server/research/ecr-pre-pilot-model-freeze/predictive_nt_six_component.py',
    );
    const preflight = JSON.parse(execFileSync(
      'python3.12',
      [worker, '--preflight'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    ));
    expect(preflight).toMatchObject({
      status: 'PASS',
      python: '3.12',
      engineId: 'ECR2_PREDICTIVE_NT_SIX_COMPONENT_COSMOSAC',
      componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'],
      modelIdentity: 'COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL',
      runtimeManifestStatus: 'SOURCE_TREE_NO_PACKAGE_MANIFEST',
    });
    expect(preflight.engineHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preflight.verifiedScientificInputCount).toBeGreaterThanOrEqual(2_000);
    expect(preflight.verifiedScientificInputAggregateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(preflight.verifiedNativeDependencyCount).toBeGreaterThan(0);
    expect(preflight.verifiedNativeDependencyAggregateSha256).toMatch(/^[a-f0-9]{64}$/);

    const input = derivePredictiveNtSixComponentInputFromStage1(
      makeStage1Snapshot(canonicalizeStage1Input(archivedStage1Input(), 209)),
      209,
    );
    // The retired worker's authority schema predates removal of the redundant
    // NMP temperature field. Reconstruct that historical source contract
    // without routing it through retired production packaging or submission.
    const currentSource = input.stage1Authority!.source;
    const archivedSourceWithoutHash = {
      ...currentSource,
      stage1: {
        ...currentSource.stage1,
        nmpTemperatureC: currentSource.stage1.operatingTemperatureC,
      },
    };
    const archivedSource = {
      ...archivedSourceWithoutHash,
      immutableHash: stage1SnapshotHash(archivedSourceWithoutHash),
    };
    const archivedRequest = {
      ...input,
      engineHash: preflight.engineHash,
      stage1Authority: {
        ...input.stage1Authority,
        snapshotHash: archivedSource.immutableHash,
        source: archivedSource,
      },
    };
    const execution = spawnSync(
      'python3.12',
      [worker],
      {
        encoding: 'utf8',
        input: `${JSON.stringify(archivedRequest)}\n`,
        maxBuffer: 256 * 1024 * 1024,
        timeout: 420_000,
      },
    );
    expect(
      execution.status,
      execution.stdout || execution.stderr || execution.error?.message,
    ).toBe(0);
    const rawResult = JSON.parse(execution.stdout);
    const result = attachStage1ResultGovernance(rawResult, input) as any;

    expect(result).toMatchObject({
      status: 'RESEARCH_DIAGNOSTIC_NOT_ACCEPTED',
      establishedTheoreticalStages: null,
      releaseEligible: false,
      calibrationRequired: true,
      componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'],
      modelIdentity: 'COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL',
      engine: {
        engineId: 'ECR2_PREDICTIVE_NT_SIX_COMPONENT_COSMOSAC',
        engineHash: preflight.engineHash,
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
    expect(result.model.modelHash).toBe(PRE_PILOT_MODEL.modelHash);
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
  }, 420_000);

  it('traces 7C-1.5 assembled stages once per solve without mutating methods', () => {
    const wrapper = path.resolve(
      'server/ecr-pre-pilot/predictive-nt-seven-component-v1-5-progress/worker.py',
    );
    const output = execFileSync('python3.12', ['-c', `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("progress_wrapper_test", ${JSON.stringify(wrapper)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Fake:
    def solve_cascade(self, count, fail=False):
        stages = []
        for index in range(count):
            self.unrelated_helper(index)
            stages.append({"stage": index + 1})
        if fail:
            raise RuntimeError("expected test failure")
        return stages
    def unrelated_helper(self, index):
        return index * 2
fake = Fake()
events = []
original_method = fake.solve_cascade
prior_trace = sys.gettrace()
assert module.observe_stage_assembly(
    fake.solve_cascade, 3, lambda done, maximum: events.append([done, maximum]), 3
) == [{"stage": 1}, {"stage": 2}, {"stage": 3}]
assert fake.solve_cascade.__func__ is original_method.__func__
assert sys.gettrace() is prior_trace
assert module.observe_stage_assembly(
    fake.solve_cascade, 2, lambda done, maximum: events.append([done, maximum]), 2
) == [{"stage": 1}, {"stage": 2}]
try:
    module.observe_stage_assembly(fake.solve_cascade, 2, lambda *_: None, 2, True)
except RuntimeError:
    pass
else:
    raise AssertionError("exception was not propagated")
assert sys.gettrace() is prior_trace
print(json.dumps(events))
`], { encoding: 'utf8' });
    expect(JSON.parse(output)).toEqual([
      [0, 3], [1, 3], [2, 3], [3, 3],
      [0, 2], [1, 2], [2, 2],
    ]);
  }, 30_000);
});