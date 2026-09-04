import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db';
import { PRE_PILOT_MODEL, PRE_PILOT_MULTISTAGE_MODEL, startPrePilotNt } from './model';
import {
  canonicalizeStage1Input,
  ECR_PRE_PILOT_STAGE1_SCHEMA,
  PREDICTIVE_NT_MOLECULAR_REGISTRY,
  stage1SnapshotHash,
  validateStage1Snapshot,
  type EcrPrePilotStage1Snapshot,
} from './stage1';
import {
  SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256,
  type SixComponentProfileFileReader,
  verifyStage1SixComponentCosmoSacProfileFiles,
} from './six-component-cosmo-sac-basis';
import { generatePredictiveNtReport } from './predictive-nt-report';
import { PREDICTIVE_NT_RESEARCH_CANDIDATE } from './predictive-nt-research-candidate';

export interface PredictiveNtJobInput {
  engineContractVersion?: '6C-1.0.0' | '7C-1.1.0' | '7C-1.2.0' | '7C-1.3.0' | '7C-1.4.0';
  engineComponentContract: {
    componentCount: 6 | 7;
    families: readonly string[];
    thermodynamicModel:
      | 'FROZEN_SIX_COMPONENT_COSMO_SAC_2010'
      | 'COSMO_SAC_2010_PROJECT_NMP_LLE_RESIDUAL_H2O_EXTENSION'
      | 'NATIVE_SEVEN_COMPONENT_COSMO_SAC_2010_H2O'
      | 'NATIVE_SEVEN_COMPONENT_COSMO_SAC_2010_ADDITIVE_RK_H2O';
    researchDiagnosticOnly?: true;
    qualificationStatus?: 'PENDING_GOVERNED_WATER_BEARING_LLE_AND_BLIND_QUALIFICATION';
  };
  modelHash: string;
  temperatureK: number;
  solventMolarRatio: number;
  feedMoleFractions: number[];
  satIdentity: string;
  monoIdentity: string;
  sourceFeedCompositionMassFraction: {
    saturates: number;
    mono: number;
    di: number;
    poly: number;
    polar: number;
    nmp: number;
  };
  sourceProductTargetsMassFraction: {
    maximumTotalAromatics: number;
    maximumPolarAromatics: number;
    minimumSaturates: number;
    maximumNmp: number;
    minimumRrboRecovery: number;
  };
  sourceSolventOilMassRatio: number;
  solventSpecificationAudit: {
    nmpPurityMassPercent: number;
    nmpWaterMassPercent: number;
  };
  wetSolventConstruction?: {
    basis: 'FIXED_TOTAL_WET_SOLVENT_MASS';
    totalWetSolventMassPerUnitFeedMass: number;
    dryNmpMassPerUnitFeedMass: number;
    waterMassPerUnitFeedMass: number;
    massClosureResidual: number;
  };
  targetRaffinateMonoHydrocarbonMoleFraction: number;
  minimumRaffinateSaturatesHydrocarbonMoleFraction?: number;
  maximumStages?: number;
  ntTest?: number;
  stage1Authority?: {
    schemaVersion: typeof ECR_PRE_PILOT_STAGE1_SCHEMA;
    savedAt: string;
    snapshotHash: string;
    source: EcrPrePilotStage1Snapshot;
    sulfurPrediction: {
      status: 'NOT_CALCULABLE';
      calibrationStatus: 'CALIBRATION_REQUIRED';
    };
    minimumMassRecovery: {
      targetPercent: number;
      status: 'CALCULABLE' | 'NOT_CALCULABLE';
    };
    polarAromaticsAdmission: typeof PREDICTIVE_NT_MOLECULAR_REGISTRY.polarAromatics;
    sixComponentCosmoSacBasisManifestSha256: string;
    sixComponentCosmoSacBindingSha256: string;
  };
}

type PredictiveNtJob = {
  id: string;
  designId: number;
  modelHash: string;
  engineHash: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdBy: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  input: PredictiveNtJobInput;
  progress: { completedStageTrials: number; maximumStages: number };
  result: unknown;
  report: {
    available: boolean;
    filename: string | null;
    sha256: string | null;
    generatedAt: string | null;
    downloadUrl: string | null;
  };
  error: string | null;
};

const MAX_QUEUED_JOBS = 10;
const MAX_ACTIVE_JOBS_PER_USER = 2;
const JOB_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const LEASE_MS = 45 * 1000;
const POLL_MS = 1_000;
const PREDICTIVE_NT_ENGINE_SHA256 = process.env.PREDICTIVE_NT_ENGINE_SHA256 ?? '';
const PREDICTIVE_NT_7C_ENGINE_SHA256 = process.env.PREDICTIVE_NT_7C_ENGINE_SHA256 ?? '';
const PREDICTIVE_NT_7C_1_2_ENGINE_SHA256 =
  process.env.PREDICTIVE_NT_7C_1_2_ENGINE_SHA256 ?? '';
const PREDICTIVE_NT_7C_1_3_ENGINE_SHA256 =
  process.env.PREDICTIVE_NT_7C_1_3_ENGINE_SHA256 ?? '';
const PREDICTIVE_NT_7C_1_4_ENGINE_SHA256 =
  process.env.PREDICTIVE_NT_7C_1_4_ENGINE_SHA256 ?? '';
const WORKER_OWNER = `${os.hostname()}:${process.pid}:${randomUUID()}`;
let workerStarted = false;
let workerBusy = false;
const activeWorkerChildren = new Map<string, ReturnType<typeof spawn>>();
const task218EvidenceCache = new Map<string, unknown>();
type RuntimeTestHooks = {
  killAfterAcknowledgedStage?: number;
  replayMismatchAtStage?: number;
  restartAfterAcknowledgedStage?: number;
  replaceFinalPayloadWithRunningAck?: boolean;
  forceReportGenerationFailure?: boolean;
};
const runtimeTestHooks = new Map<string, RuntimeTestHooks>();

function runtimeRoot(input?: PredictiveNtJobInput) {
  if (process.env.PREDICTIVE_NT_RUNTIME_ROOT) {
    return path.resolve(process.env.PREDICTIVE_NT_RUNTIME_ROOT);
  }
  return process.env.NODE_ENV === 'production'
    ? path.resolve(
      process.cwd(),
      input?.engineContractVersion === '7C-1.4.0'
        ? 'dist/predictive-nt-runtime-7c-1-4'
        : input?.engineContractVersion === '7C-1.3.0'
        ? 'dist/predictive-nt-runtime-7c-1-3'
        : input?.engineContractVersion === '7C-1.2.0'
          ? 'dist/predictive-nt-runtime-7c-1-2'
          : isSevenComponentInput(input)
            ? 'dist/predictive-nt-runtime-7c'
            : 'dist/predictive-nt-runtime',
    )
    : process.cwd();
}

type Task216GlobalStabilityEvidenceExpectation = {
  evidenceArtifacts: {
    protocolSha256: string;
    runnerSha256: string;
    resultsSha256: string;
    reportSha256: string;
    provenanceSha256: string;
  };
  status: string;
  qualified: boolean;
  postSplitTpdThreshold: number;
  exactReferenceJobId: string;
  coverage: {
    expectedPhaseEndpoints: number;
    returnedPhaseEndpoints: number;
    failingPhaseCount: number;
    negativeOrUnresolvedPhaseCount: number;
    optimizerRefinementFailureCount: number;
  };
  blockers: string[];
  worstMinimum: number;
  worstFullyReproducedMinimum: number | null;
  classificationCounts: Record<string, number>;
  comparisonCandidate: {
    disposition: string;
    qualified: boolean;
    frozenValidationPassed: boolean;
    classificationCounts: Record<string, number>;
    worstMinimum: number;
  };
};

function sha256RuntimeFile(relativePath: string) {
  return createHash('sha256')
    .update(fs.readFileSync(path.join(runtimeRoot(), relativePath)))
    .digest('hex');
}

export function expectedTask216GlobalStabilityEvidence(): Task216GlobalStabilityEvidenceExpectation {
  const resultPath = path.join(
    runtimeRoot(),
    '.agents/outputs/task-216-mono-rich-global-stability/results.json',
  );
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const phases = Array.isArray(result.phases) ? result.phases : [];
  const classificationCounts = phases.reduce(
    (counts: Record<string, number>, phase: any) => {
      const classification = String(phase?.classification ?? 'UNCLASSIFIED');
      counts[classification] = (counts[classification] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const minima = phases
    .map((phase: any) => Number(phase?.minimum))
    .filter((minimum: number) => Number.isFinite(minimum));
  const fullyReproducedMinima = phases
    .filter((phase: any) => phase?.fullyReproducedNegative === true)
    .map((phase: any) => Number(phase?.minimum))
    .filter((minimum: number) => Number.isFinite(minimum));
  const candidate = result.task206CandidateComparison ?? {};
  const candidatePhases = Array.isArray(candidate.sameEndpointFullGlobalSearches)
    ? candidate.sameEndpointFullGlobalSearches
    : [];
  const phaseKeys = phases
    .map((phase: any) => `${phase?.trialStageCount}:${phase?.stageFromFeedEnd}:${phase?.phase}`)
    .sort();
  const candidatePhaseKeys = candidatePhases
    .map((phase: any) => `${phase?.trialStageCount}:${phase?.stageFromFeedEnd}:${phase?.phase}`)
    .sort();
  const candidateClassificationCounts = candidatePhases.reduce(
    (counts: Record<string, number>, phase: any) => {
      const classification = String(phase?.classification ?? 'UNCLASSIFIED');
      counts[classification] = (counts[classification] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const candidateMinima = candidatePhases
    .map((phase: any) => Number(phase?.minimum))
    .filter((minimum: number) => Number.isFinite(minimum));
  const frozenValidationRows = Object.values(candidate.frozenValidation ?? {}) as any[];
  const frozenValidationPassed = frozenValidationRows.length > 0
    && frozenValidationRows.every((row) => row?.status === 'PASS');
  if (
    phases.length !== result.coverage?.expectedPhaseEndpoints
    || phases.length !== result.coverage?.returnedPhaseEndpoints
    || minima.length !== phases.length
    || candidatePhases.length !== phases.length
    || candidateMinima.length !== candidatePhases.length
    || canonicalJson(candidatePhaseKeys) !== canonicalJson(phaseKeys)
  ) {
    throw new Error('TASK216_GLOBAL_STABILITY_FROZEN_EVIDENCE_INCOMPLETE');
  }
  return {
    evidenceArtifacts: {
      protocolSha256: sha256RuntimeFile(
        'server/research/task-216-mono-rich-global-stability/protocol.json',
      ),
      runnerSha256: sha256RuntimeFile(
        'server/research/task-216-mono-rich-global-stability/run.py',
      ),
      resultsSha256: sha256RuntimeFile(
        '.agents/outputs/task-216-mono-rich-global-stability/results.json',
      ),
      reportSha256: sha256RuntimeFile(
        '.agents/outputs/task-216-mono-rich-global-stability/report.md',
      ),
      provenanceSha256: sha256RuntimeFile(
        '.agents/outputs/task-216-mono-rich-global-stability/provenance-manifest.json',
      ),
    },
    status: String(result.status),
    qualified: result.qualified === true,
    postSplitTpdThreshold: Number(result.postSplitTpdThreshold),
    exactReferenceJobId: String(result.referenceJob?.id ?? ''),
    coverage: {
      expectedPhaseEndpoints: Number(result.coverage.expectedPhaseEndpoints),
      returnedPhaseEndpoints: Number(result.coverage.returnedPhaseEndpoints),
      failingPhaseCount: Number(result.coverage.failingPhaseCount),
      negativeOrUnresolvedPhaseCount: Number(result.coverage.negativeOrUnresolvedPhaseCount),
      optimizerRefinementFailureCount:
        Number(classificationCounts.OPTIMIZER_REFINEMENT_FAILURE ?? 0),
    },
    blockers: Array.isArray(result.blockers) ? result.blockers.map(String) : [],
    worstMinimum: Math.min(...minima),
    worstFullyReproducedMinimum: fullyReproducedMinima.length > 0
      ? Math.min(...fullyReproducedMinima)
      : null,
    classificationCounts,
    comparisonCandidate: {
      disposition: 'REJECTED_FROZEN_VALIDATION_AND_GLOBAL_INSTABILITY',
      qualified: candidate.qualifiedForThisHarness === true,
      frozenValidationPassed,
      classificationCounts: candidateClassificationCounts,
      worstMinimum: Math.min(...candidateMinima),
    },
  };
}

export function validateTask216GlobalStabilityEvidence(
  evidence: unknown,
  expected = expectedTask216GlobalStabilityEvidence(),
) {
  if (!evidence || typeof evidence !== 'object') {
    return 'TASK216_GLOBAL_STABILITY_EVIDENCE_MISSING';
  }
  const actual = evidence as Record<string, any>;
  if (
    actual.evidenceId !== 'TASK_216_MONO_RICH_GLOBAL_STABILITY_V1'
    || actual.researchOnly !== true
    || actual.calibrationRequired !== true
    || actual.releaseEligible !== false
    || actual.predictiveNt !== null
  ) {
    return 'TASK216_GLOBAL_STABILITY_GOVERNANCE_VIOLATION';
  }
  if (canonicalJson(actual.evidenceArtifacts) !== canonicalJson(expected.evidenceArtifacts)) {
    return 'TASK216_GLOBAL_STABILITY_EVIDENCE_HASH_MISMATCH';
  }
  if (
    actual.coverage?.expectedPhaseEndpoints !== expected.coverage.expectedPhaseEndpoints
    || actual.coverage?.returnedPhaseEndpoints !== expected.coverage.returnedPhaseEndpoints
    || actual.coverage?.returnedPhaseEndpoints !== actual.coverage?.expectedPhaseEndpoints
  ) {
    return 'TASK216_GLOBAL_STABILITY_PHASE_COVERAGE_INCOMPLETE';
  }
  const actualBlockers = Array.isArray(actual.blockers) ? actual.blockers.map(String) : [];
  if (
    actual.coverage?.negativeOrUnresolvedPhaseCount > 0
    && !actualBlockers.includes('POST_SPLIT_TPD_STABILITY_FAILED')
  ) {
    return 'TASK216_GLOBAL_STABILITY_FALSE_BLOCKER_FREE_CLAIM';
  }
  if (
    actual.status !== expected.status
    || actual.qualified !== expected.qualified
    || actual.postSplitTpdThreshold !== expected.postSplitTpdThreshold
    || actual.exactReferenceJobId !== expected.exactReferenceJobId
    || actual.coverage?.failingPhaseCount !== expected.coverage.failingPhaseCount
    || actual.coverage?.negativeOrUnresolvedPhaseCount
      !== expected.coverage.negativeOrUnresolvedPhaseCount
    || actual.coverage?.optimizerRefinementFailureCount
      !== expected.coverage.optimizerRefinementFailureCount
    || actual.worstMinimum !== expected.worstMinimum
    || actual.worstFullyReproducedMinimum !== expected.worstFullyReproducedMinimum
    || canonicalJson(actual.classificationCounts) !== canonicalJson(expected.classificationCounts)
    || canonicalJson(actual.comparisonCandidate)
      !== canonicalJson(expected.comparisonCandidate)
    || canonicalJson(actualBlockers) !== canonicalJson(expected.blockers)
  ) {
    return 'TASK216_GLOBAL_STABILITY_FROZEN_SUMMARY_MISMATCH';
  }
  if (
    (actualBlockers.length > 0 && actual.qualified !== false)
    || (actualBlockers.length === 0 && actual.status === 'BLOCKED_FAIL_CLOSED')
  ) {
    return 'TASK216_GLOBAL_STABILITY_FALSE_BLOCKER_FREE_CLAIM';
  }
  return null;
}

/** Reconstruct, rather than trust, the compact Task218 terminal attachment. */
export function expectedTask218CandidateGeneratedStabilityEvidence() {
  const base = runtimeRoot();
  const read = (relative: string) => JSON.parse(fs.readFileSync(path.join(base, relative), 'utf8'));
  const protocolPath = 'server/research/task-218-candidate-generated-stability/protocol.json';
  const runnerPath = 'server/research/task-218-candidate-generated-stability/run.py';
  const verifierPath = 'server/research/task-218-candidate-generated-stability/verify.py';
  const resultsPath = '.agents/outputs/task-218-candidate-generated-stability/results.json';
  const reportPath = '.agents/outputs/task-218-candidate-generated-stability/report.md';
  const manifestPath = '.agents/outputs/task-218-candidate-generated-stability/provenance-manifest.json';
  const protocol = read(protocolPath);
  const result = read(resultsPath);
  const manifest = read(manifestPath);
  const artifacts = Object.fromEntries([
    ['protocolSha256', protocolPath], ['runnerSha256', runnerPath],
    ['verifierSha256', verifierPath], ['resultsSha256', resultsPath],
    ['reportSha256', reportPath], ['provenanceSha256', manifestPath],
  ].map(([key, file]) => [key, sha256RuntimeFile(file)]));
  if (
    !['protocolSha256', 'runnerSha256', 'verifierSha256', 'resultsSha256', 'reportSha256']
      .every((key) => manifest[key] === artifacts[key])
    || canonicalJson(protocol.pinnedInputs) !== canonicalJson(result.pinnedInputs)
    || canonicalJson(result.pinnedInputs) !== canonicalJson(manifest.pinnedInputs)
    || protocol.expectedEndpointCount !== 110
    || canonicalJson(protocol.componentOrder) !== canonicalJson(['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'])
  ) throw new Error('TASK218_CANDIDATE_FROZEN_ARTIFACT_INVALID');
  const pinnedPaths: Record<string, string> = {
    candidateProtocolSha256: 'server/research/task-218-root-cause-candidate/protocol.json',
    candidateResultsSha256: '.agents/outputs/task-218-root-cause-candidate/results.json',
    candidateProvenanceSha256: '.agents/outputs/task-218-root-cause-candidate/provenance-manifest.json',
    rootCauseProtocolSha256: 'server/research/task-218-task216-root-cause/protocol.json',
    rootCauseRunnerSha256: 'server/research/task-218-task216-root-cause/run.py',
    rootCauseResultsSha256: '.agents/outputs/task-218-task216-root-cause/results.json',
    rootCauseProvenanceSha256: '.agents/outputs/task-218-task216-root-cause/provenance-manifest.json',
    task216ProtocolSha256: 'server/research/task-216-mono-rich-global-stability/protocol.json',
    task216RunnerSha256: 'server/research/task-216-mono-rich-global-stability/run.py',
    task216ResultsSha256: '.agents/outputs/task-216-mono-rich-global-stability/results.json',
    task216ProvenanceSha256: '.agents/outputs/task-216-mono-rich-global-stability/provenance-manifest.json',
    task206ProtocolSha256: 'server/research/task-206-stability-constrained-amendment/protocol.json',
    task206RunnerSha256: 'server/research/task-206-stability-constrained-amendment/run.py',
    task206ResultsSha256: '.agents/outputs/task-206-stability-constrained-amendment/results.json',
    task206ProvenanceSha256: '.agents/outputs/task-206-stability-constrained-amendment/provenance-manifest.json',
    task213ProtocolSha256: 'server/research/task-213-mono-rich-qualification/protocol.json',
    task213RunnerSha256: 'server/research/task-213-mono-rich-qualification/run.py',
    task213ResultsSha256: '.agents/outputs/task-213-mono-rich-qualification/results.json',
    task213ProvenanceSha256: '.agents/outputs/task-213-mono-rich-qualification/provenance-manifest.json',
    amendmentModelSha256: 'server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py',
    amendmentProtocolSha256: 'server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json',
    countercurrentRunnerSha256: 'server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/run.py',
    countercurrentProtocolSha256: 'server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/protocol.json',
    productionWorkerSha256: 'server/research/ecr-pre-pilot-model-freeze/predictive_nt_six_component.py',
    evidenceSha256: 'server/engine-framework/cel/data/multi-t-nmp-lle.json',
  };
  if (!Object.entries(pinnedPaths).every(([key, file]) => result.pinnedInputs?.[key] === sha256RuntimeFile(file))) {
    throw new Error('TASK218_CANDIDATE_PINNED_LINEAGE_MISMATCH');
  }
  const endpoints = result.endpointMatrix;
  const phases = result.phases;
  if (!Array.isArray(endpoints) || !Array.isArray(phases) || endpoints.length !== 110 || phases.length !== 110) {
    throw new Error('TASK218_CANDIDATE_ENDPOINT_COVERAGE_INCOMPLETE');
  }
  let index = 0;
  for (let trialStageCount = 1; trialStageCount <= 10; trialStageCount += 1) {
    for (let stageFromFeedEnd = 1; stageFromFeedEnd <= trialStageCount; stageFromFeedEnd += 1) {
      for (const phase of ['raffinate', 'extract']) {
        const endpoint = endpoints[index];
        const audit = phases[index++];
        if (
          endpoint?.trialStageCount !== trialStageCount || endpoint?.stageFromFeedEnd !== stageFromFeedEnd
          || endpoint?.phase !== phase || !/^[a-f0-9]{64}$/.test(endpoint?.endpointHash ?? '')
          || !Array.isArray(endpoint?.composition) || endpoint.composition.length !== 6
          || audit?.endpointHash !== endpoint.endpointHash || audit?.trialStageCount !== trialStageCount
          || audit?.stageFromFeedEnd !== stageFromFeedEnd || audit?.phase !== phase
          || audit?.modelSha256 !== result.candidateModelSha256
          || audit?.parameterVectorSha256 !== result.candidateParameterSha256
          || typeof audit?.classification !== 'string' || typeof audit?.fullyReproducedNegative !== 'boolean'
        ) throw new Error('TASK218_CANDIDATE_ENDPOINT_LINEAGE_INVALID');
      }
    }
  }
  const trials = result.cascadeTrials;
  const trialByCount = new Map<number, any>(
    (Array.isArray(trials) ? trials : []).map((trial: any) => [trial.stageCount, trial] as [number, any]),
  );
  const endpointDerivationValid = endpoints.every((endpoint: any) => {
    const trial = trialByCount.get(endpoint.trialStageCount);
    const streams = endpoint.phase === 'raffinate'
      ? trial?.generatedStreams?.raffinateComponentMoles
      : trial?.generatedStreams?.extractComponentMoles;
    const flow = streams?.[endpoint.stageFromFeedEnd - 1];
    const total = Array.isArray(flow) ? flow.reduce((sum: number, item: number) => sum + item, 0) : NaN;
    const compositionMatches = Array.isArray(flow) && Array.isArray(endpoint.composition)
      && flow.length === 6 && endpoint.composition.length === 6
      && flow.every((item: number, component: number) => Number.isFinite(item) && item > 0
        && Math.abs(item / total - endpoint.composition[component]) <= 2e-15);
    return compositionMatches && endpoint.trialHash === trial?.trialHash;
  });
  if (!Array.isArray(trials) || trials.length !== 10 || !endpointDerivationValid) {
    throw new Error('TASK218_CANDIDATE_CRYPTOGRAPHIC_LINEAGE_INVALID');
  }
  const expectedBlockers = [
    'FROZEN_COMPOSITION_VALIDATION_FAILED',
    'CARRIED_TIE_LINE_GATE_FAILED',
    'DIRECT_MATCHING_SIX_COMPONENT_LLE_EVIDENCE_MISSING',
    'CANDIDATE_CASCADE_LOCAL_OR_GLOBAL_STABILITY_FAILED',
  ];
  if (
    result.candidateModelSha256 !== '92700b3b8e24ba63253c33fab7349d605e88101235121a3c5b96cda696860c6b'
    || result.cascadeExecutionHash !== '8c634ea01cb580a3f49ba7d57a4951c00cace1632b791201803b4a2dcbb13f20'
    || result.endpointMatrixHash !== '21463f68f2c06ed4d5b9927202bc940e13072c77892bfed6fad2db2fa59ec948'
    || result.auditHash !== '95bd2f2d8629e03c900ab6d8bce9728101e2624a669b231583cd89fb15f30ffa'
    || result.qualificationHash !== 'b33f00aa1f1b3aca51abc7fd7e5d4634dde8753dd041ce00721b9b4bef10254a'
    || result.status !== 'BLOCKED_FAIL_CLOSED' || result.qualified !== false
    || canonicalJson(result.coverage) !== canonicalJson({
      expected: 110, returned: 110, negativeOrUnresolved: 0,
      fullyReproducedNegative: 0, classifications: { LOCAL_HESSIAN_ONLY_ARTIFACT: 110 },
    })
    || canonicalJson(result.blockers) !== canonicalJson(expectedBlockers)
    || result.gates?.candidateValidationPassed !== false || result.gates?.tieLinePassed !== false
    || result.gates?.directEvidenceAvailable !== false || result.gates?.allCascadeStagesAccepted !== false
    || result.gates?.flashAccepted !== true || result.gates?.allGlobalTpdPassed !== true
    || !trials.every((trial: any, index: number) => (
      trial.trial?.accepted === (index < 6)
      && (index < 6 || trial.trial?.acceptanceBlockers?.some(
        (blocker: any) => blocker?.code === 'POST_SPLIT_LOCAL_STABILITY_FAILED',
      ))
    ))
  ) throw new Error('TASK218_CANDIDATE_APPROVED_FACTS_MISMATCH');
  if (
    result.coverage?.expected !== 110 || result.coverage?.returned !== 110
    || result.historicalComparisons?.disposition !== 'DIAGNOSTIC_ONLY_HISTORICAL'
    || result.historicalComparisons?.task216?.phaseCount !== 110
  ) throw new Error('TASK218_CANDIDATE_COVERAGE_OR_HISTORY_INVALID');
  const expectedSummary = {
    evidenceId: 'TASK_218_CANDIDATE_GENERATED_CONTROLLED_NEGATIVE_V1',
    schemaVersion: result.schemaVersion, evidenceArtifacts: artifacts,
    candidateModelSha256: result.candidateModelSha256, candidateParameterSha256: result.candidateParameterSha256,
    candidateFlashHash: result.candidateFlashHash, cascadeExecutionHash: result.cascadeExecutionHash,
    endpointMatrixHash: result.endpointMatrixHash, auditHash: result.auditHash,
    qualificationHash: result.qualificationHash, componentOrder: protocol.componentOrder,
    endpointOrder: protocol.endpointOrder, coverage: result.coverage, gates: result.gates,
    blockers: result.blockers, status: result.status, qualified: result.qualified,
    historicalComparisons: result.historicalComparisons, researchOnly: result.researchOnly,
    calibrationRequired: result.calibration, pilotValidated: result.pilot, release: result.release,
    releaseEligible: result.releaseEligible, predictiveNt: result.predictiveNt,
    sulfurPrediction: result.sulfurPrediction,
  };
  const cacheKey = base;
  if (!task218EvidenceCache.has(cacheKey)) {
    const check = spawnSync('python3.12', [
      path.join(base, 'server/research/ecr-pre-pilot-model-freeze/predictive_nt_six_component.py'),
      '--task218-evidence',
    ], { cwd: base, encoding: 'utf8', timeout: 60_000 });
    if (check.error || check.status !== 0) {
      throw new Error(`TASK218_CANDIDATE_CRYPTOGRAPHIC_LINEAGE_INVALID: ${check.error?.message ?? check.stderr.trim()}`);
    }
    try { task218EvidenceCache.set(cacheKey, JSON.parse(check.stdout)); } catch {
      throw new Error('TASK218_CANDIDATE_CRYPTOGRAPHIC_LINEAGE_INVALID');
    }
  }
  const pythonEvidence = task218EvidenceCache.get(cacheKey);
  if (canonicalJson(pythonEvidence) !== canonicalJson(expectedSummary)) {
    throw new Error('TASK218_CANDIDATE_PYTHON_LINEAGE_SUMMARY_MISMATCH');
  }
  return pythonEvidence;
}

export function validateTask218CandidateGeneratedStabilityEvidence(evidence: unknown) {
  if (!evidence || typeof evidence !== 'object') return 'TASK218_CANDIDATE_EVIDENCE_MISSING';
  const actual = evidence as Record<string, unknown>;
  if (
    actual.evidenceId !== 'TASK_218_CANDIDATE_GENERATED_CONTROLLED_NEGATIVE_V1'
    || actual.status !== 'BLOCKED_FAIL_CLOSED' || actual.qualified !== false
    || actual.researchOnly !== true || actual.calibrationRequired !== true
    || actual.pilotValidated !== false || actual.release !== false || actual.releaseEligible !== false
    || actual.predictiveNt !== null || actual.sulfurPrediction !== 'NOT_CALCULABLE'
  ) return 'TASK218_CANDIDATE_GOVERNANCE_VIOLATION';
  let expected: unknown;
  try { expected = expectedTask218CandidateGeneratedStabilityEvidence(); } catch (error) {
    return error instanceof Error ? error.message : 'TASK218_CANDIDATE_FROZEN_ARTIFACT_INVALID';
  }
  return canonicalJson(actual) === canonicalJson(expected)
    ? null
    : 'TASK218_CANDIDATE_FROZEN_SUMMARY_MISMATCH';
}

function isSevenComponentInput(input?: PredictiveNtJobInput) {
  return input?.engineContractVersion === '7C-1.1.0'
    || input?.engineContractVersion === '7C-1.2.0'
    || input?.engineContractVersion === '7C-1.3.0'
    || input?.engineContractVersion === '7C-1.4.0';
}

function isNativeSevenComponentInput(input?: PredictiveNtJobInput) {
  return input?.engineContractVersion === '7C-1.3.0'
    || input?.engineContractVersion === '7C-1.4.0';
}

function isReplacementSevenComponentInput(input?: PredictiveNtJobInput) {
  return input?.engineContractVersion === '7C-1.4.0';
}

function usesSimultaneousSevenComponentCascade(input?: PredictiveNtJobInput) {
  return input?.engineContractVersion === '7C-1.2.0'
    || input?.engineContractVersion === '7C-1.3.0'
    || input?.engineContractVersion === '7C-1.4.0';
}

export function predictiveNtCheckpointProtocol(input: PredictiveNtJobInput) {
  return isSevenComponentInput(input) ? 'ACK_V3_ENGINE_CONTRACT' as const : 'ACK_V2' as const;
}

export function validatePredictiveNtCheckpointContract(
  input: PredictiveNtJobInput,
  protocol: unknown,
  engineContractVersion: unknown,
) {
  const expectedProtocol = predictiveNtCheckpointProtocol(input);
  if (
    protocol !== expectedProtocol
    || (
      isSevenComponentInput(input)
      && engineContractVersion !== input.engineContractVersion
    )
    || (
      !isSevenComponentInput(input)
      && engineContractVersion != null
      && engineContractVersion !== '6C-LEGACY'
    )
  ) throw new Error('PREDICTIVE_NT_CROSS_ENGINE_CHECKPOINT_FORBIDDEN');
  return expectedProtocol;
}

function workerScript(input?: PredictiveNtJobInput) {
  if (process.env.NODE_ENV === 'test' && process.env.PREDICTIVE_NT_TEST_WORKER_SCRIPT) {
    return path.resolve(process.env.PREDICTIVE_NT_TEST_WORKER_SCRIPT);
  }
  return path.join(
    runtimeRoot(input),
    input?.engineContractVersion === '7C-1.4.0'
      ? 'server/ecr-pre-pilot/predictive-nt-seven-component-v1-4/worker.py'
      : input?.engineContractVersion === '7C-1.3.0'
      ? 'server/ecr-pre-pilot/predictive-nt-seven-component-v1-3/worker.py'
      : input?.engineContractVersion === '7C-1.2.0'
        ? 'server/ecr-pre-pilot/predictive-nt-seven-component-v1-2/worker.py'
        : isSevenComponentInput(input as PredictiveNtJobInput)
          ? 'server/ecr-pre-pilot/predictive-nt-seven-component/worker.py'
          : 'server/research/ecr-pre-pilot-model-freeze/predictive_nt_six_component.py',
  );
}

function readPredictiveNtRuntimePreflight(input?: PredictiveNtJobInput) {
  const script = workerScript(input);
  if (!fs.existsSync(script)) throw new Error(`PREDICTIVE_NT_RUNTIME_MISSING: ${script}`);
  const check = spawnSync('python3.12', [script, '--preflight'], {
    cwd: runtimeRoot(input),
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (check.error || check.status !== 0) {
    const detail = check.error?.message || check.stderr.trim() || `exit ${check.status}`;
    throw new Error(`PREDICTIVE_NT_RUNTIME_PREFLIGHT_FAILED: ${detail}`);
  }
  let result: any;
  try {
    result = JSON.parse(check.stdout);
  } catch {
    throw new Error('PREDICTIVE_NT_RUNTIME_PREFLIGHT_FAILED: invalid worker response');
  }
  if (
    result.status !== 'PASS'
    || result.python !== '3.12'
    || !/^[a-f0-9]{64}$/.test(result.engineHash)
    || (
      result.testProtocolFixture === true
        ? process.env.NODE_ENV !== 'test'
        : (
          (
            isSevenComponentInput(input as PredictiveNtJobInput)
              ? (
                result.engineId !== (
                  input?.engineContractVersion === '7C-1.4.0'
                    ? 'ECR2_PRE_PILOT_MULTISTAGE_SEVEN_COMPONENT_NATIVE_RK_CASCADE'
                    : input?.engineContractVersion === '7C-1.3.0'
                    ? 'ECR2_PREDICTIVE_NT_SEVEN_COMPONENT_NATIVE_CCOSMO_CASCADE'
                    : input?.engineContractVersion === '7C-1.2.0'
                      ? 'ECR2_PREDICTIVE_NT_SEVEN_COMPONENT_SIMULTANEOUS_COUPLED_CASCADE'
                    : 'ECR2_PREDICTIVE_NT_SEVEN_COMPONENT_ASSEMBLED_RESIDUAL_EXTENSION'
                )
                || result.engineContractVersion !== input?.engineContractVersion
                || (
                  isNativeSevenComponentInput(input)
                    ? (
                       result.modelIdentity !== (
                         isReplacementSevenComponentInput(input)
                           ? 'NATIVE_SEVEN_COMPONENT_CCOSMO_2010_PLUS_ADDITIVE_REDLICH_KISTER'
                           : 'NATIVE_SEVEN_COMPONENT_CCOSMO_2010'
                       )
                       || (
                         isReplacementSevenComponentInput(input)
                           ? (
                             result.nativeGibbsContributionRetained !== true
                             || result.task238ArtifactVersion !== 'TASK-238-NMP-OIL-RK-0.2.0'
                             || !/^[a-f0-9]{64}$/.test(result.task238ParameterVectorSha256 ?? '')
                           )
                           : result.residualAmendmentApplied !== false
                       )
                      || result.cascadeParentContract !== '7C-1.2.0'
                      || !/^[a-f0-9]{64}$/.test(result.historicalEngineHashes?.['7C-1.1.0'] ?? '')
                      || !/^[a-f0-9]{64}$/.test(result.historicalEngineHashes?.['7C-1.2.0'] ?? '')
                    )
                    : (
                      result.modelIdentity !== 'COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL + H2O_EXTENSION'
                      || result.modelInheritanceEvidence?.status !== 'PASS'
                      || result.modelInheritanceEvidence?.modelComponentCheckCount !== 4
                      || result.modelInheritanceEvidence?.profileIdentityCheckCount !== 6
                      || result.modelInheritanceEvidence?.h2oZeroProductionStatePermitted !== false
                      || result.modelInheritanceEvidence?.actualSevenComponentWaterWtPctRange?.minimum !== 0.5
                      || result.modelInheritanceEvidence?.actualSevenComponentWaterWtPctRange?.maximum !== 3.0
                      || !/^[a-f0-9]{64}$/.test(result.modelInheritanceEvidence?.sha256 ?? '')
                    )
                )
                || JSON.stringify(result.componentOrder) !== JSON.stringify(
                  ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
                )
                || result.checkpointProtocol !== 'ACK_V3_ENGINE_CONTRACT'
                || result.governanceStatus !== (
                  isReplacementSevenComponentInput(input)
                    ? 'PRE-PILOT MULTISTAGE PREDICTIVE MODEL'
                    : 'IMPLEMENTED — PREDICTIVE QUALIFICATION PENDING'
                )
                || (
                  usesSimultaneousSevenComponentCascade(input)
                  && (
                    result.cascadeEquationCountPerStage !== 14
                    || result.routineTpdLatticeDenominator !== 4
                    || result.routineTpdLatticePointCount !== 210
                    || result.exhaustiveEscalationContract !== (
                       isReplacementSevenComponentInput(input)
                         ? 'SAME_MODEL_EXPLICIT_MONO_RICH_SEARCH'
                         : isNativeSevenComponentInput(input)
                           ? 'NATIVE_7C_QUALIFICATION_SEARCH'
                        : '7C-1.1.0'
                    )
                  )
                )
              )
              : (
                result.engineId !== 'ECR2_PREDICTIVE_NT_SIX_COMPONENT_COSMOSAC'
                || JSON.stringify(result.componentOrder) !== JSON.stringify(['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'])
                || result.modelIdentity !== 'COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL'
              )
          )
          || !Number.isInteger(result.verifiedScientificInputCount)
          || result.verifiedScientificInputCount < 2_000
          || !/^[a-f0-9]{64}$/.test(result.verifiedScientificInputAggregateSha256)
          || !Number.isInteger(result.verifiedNativeDependencyCount)
          || result.verifiedNativeDependencyCount < 1
          || !/^[a-f0-9]{64}$/.test(result.verifiedNativeDependencyAggregateSha256)
          || !['SOURCE_TREE_NO_PACKAGE_MANIFEST', 'PACKAGED_MANIFEST_VERIFIED']
            .includes(result.runtimeManifestStatus)
          || (
            process.env.NODE_ENV === 'production'
            && result.runtimeManifestStatus !== 'PACKAGED_MANIFEST_VERIFIED'
          )
        )
    )
  ) {
    throw new Error('PREDICTIVE_NT_RUNTIME_PREFLIGHT_FAILED: invalid evidence');
  }
  const configuredHash = input?.engineContractVersion === '7C-1.4.0'
    ? PREDICTIVE_NT_7C_1_4_ENGINE_SHA256
    : input?.engineContractVersion === '7C-1.3.0'
    ? PREDICTIVE_NT_7C_1_3_ENGINE_SHA256
    : input?.engineContractVersion === '7C-1.2.0'
      ? PREDICTIVE_NT_7C_1_2_ENGINE_SHA256
      : isSevenComponentInput(input as PredictiveNtJobInput)
        ? PREDICTIVE_NT_7C_ENGINE_SHA256
        : PREDICTIVE_NT_ENGINE_SHA256;
  if (configuredHash && result.engineHash !== configuredHash) {
    throw new Error('PREDICTIVE_NT_RUNTIME_PREFLIGHT_FAILED: engine hash mismatch');
  }
  return result;
}

function currentPredictiveNtEngineHash(input?: PredictiveNtJobInput) {
  return readPredictiveNtRuntimePreflight(input).engineHash as string;
}

export function preflightPredictiveNtRuntime() {
  return readPredictiveNtRuntimePreflight();
}

export { PREDICTIVE_NT_MOLECULAR_REGISTRY };

const SAT_IDENTITIES = new Set<string>(
  PREDICTIVE_NT_MOLECULAR_REGISTRY.saturates.map(({ identity }) => identity),
);
const MONO_IDENTITIES = new Set<string>(
  PREDICTIVE_NT_MOLECULAR_REGISTRY.monoAromatics.map(({ identity }) => identity),
);

export function derivePredictiveNtSixComponentInputFromStage1(
  rawSnapshot: unknown,
  projectNumber: number,
  profileReader?: SixComponentProfileFileReader,
): PredictiveNtJobInput {
  const snapshot = validateStage1Snapshot(rawSnapshot);
  verifyStage1SixComponentCosmoSacProfileFiles(snapshot.sixComponentCosmoSacBinding, profileReader);
  if (
    snapshot.schemaVersion !== ECR_PRE_PILOT_STAGE1_SCHEMA
    || !snapshot.savedAt
    || snapshot.sulfurPrediction?.status !== 'NOT_CALCULABLE'
    || snapshot.sulfurPrediction?.calibrationStatus !== 'CALIBRATION_REQUIRED'
  ) {
    throw new Error('STAGE1_INPUT_NOT_SAVED');
  }
  const stage1 = canonicalizeStage1Input(snapshot.stage1, projectNumber);
  if (canonicalJson(snapshot.stage1) !== canonicalJson(stage1)) {
    throw new Error('STAGE1_AUTHORITY_MISMATCH');
  }
  if (stage1.phaseConfiguration !== 'nmp-continuous-rrbo-dispersed') {
    throw new Error('UNSUPPORTED_PHASE_CONFIGURATION');
  }
  const sat = PREDICTIVE_NT_MOLECULAR_REGISTRY.saturates
    .find(({ identity }) => identity === stage1.satIdentity)!;
  const mono = PREDICTIVE_NT_MOLECULAR_REGISTRY.monoAromatics
    .find(({ identity }) => identity === stage1.monoIdentity)!;
  const sourceSat = stage1.saturatesWt / 100;
  const sourceMono = stage1.monoAromaticsWt / 100;
  const sourceDi = stage1.diAromaticsWt / 100;
  const sourcePoly = stage1.polyAromaticsWt / 100;
  const sourcePa = stage1.polarAromaticsWt / 100;
  const sourceNmp = stage1.nmpInFeedWt / 100;
  const sourceSatMoles = sourceSat / sat.molecularWeightGmol;
  const sourceMonoMoles = sourceMono / mono.molecularWeightGmol;
  const sourceDiMoles = sourceDi / PREDICTIVE_NT_MOLECULAR_REGISTRY.diAromatics.molecularWeightGmol;
  const sourcePolyMoles = sourcePoly / PREDICTIVE_NT_MOLECULAR_REGISTRY.polyAromatics.molecularWeightGmol;
  const sourcePaMoles = sourcePa / PREDICTIVE_NT_MOLECULAR_REGISTRY.polarAromatics.molecularWeightGmol;
  const sourceNmpMoles = sourceNmp / PREDICTIVE_NT_MOLECULAR_REGISTRY.nmp.molecularWeightGmol;
  const sourceMoles = sourceSatMoles + sourceMonoMoles + sourceDiMoles + sourcePolyMoles
    + sourcePaMoles + sourceNmpMoles;
  if (sourceMoles <= 0) throw new Error('INVALID_STAGE1_COMPOSITION_TOTAL');
  const maximumTotalAromatics = stage1.targetRaffinateTotalAromaticsWt / 100;
  const minimumSaturates = stage1.minimumRaffinateSaturatesWt / 100;
  const targetMonoMoles = maximumTotalAromatics / mono.molecularWeightGmol;
  const targetSatMoles = (1 - maximumTotalAromatics) / sat.molecularWeightGmol;
  const minimumSatMoles = minimumSaturates / sat.molecularWeightGmol;
  const correspondingMonoMoles = (1 - minimumSaturates) / mono.molecularWeightGmol;

  return {
    engineComponentContract: {
      componentCount: 6,
      families: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'],
      thermodynamicModel: 'FROZEN_SIX_COMPONENT_COSMO_SAC_2010',
      researchDiagnosticOnly: true,
    },
    modelHash: PRE_PILOT_MODEL.modelHash,
    temperatureK: stage1.operatingTemperatureC + 273.15,
    solventMolarRatio: (stage1.solventOilRatio / PREDICTIVE_NT_MOLECULAR_REGISTRY.nmp.molecularWeightGmol) / sourceMoles,
    feedMoleFractions: [
      sourceSatMoles / sourceMoles,
      sourceMonoMoles / sourceMoles,
      sourceDiMoles / sourceMoles,
      sourcePolyMoles / sourceMoles,
      sourcePaMoles / sourceMoles,
      sourceNmpMoles / sourceMoles,
    ],
    satIdentity: stage1.satIdentity,
    monoIdentity: stage1.monoIdentity,
    sourceFeedCompositionMassFraction: {
      saturates: sourceSat,
      mono: sourceMono,
      di: sourceDi,
      poly: sourcePoly,
      polar: sourcePa,
      nmp: sourceNmp,
    },
    sourceProductTargetsMassFraction: {
      maximumTotalAromatics,
      maximumPolarAromatics: stage1.targetRaffinatePolarAromaticsWt / 100,
      minimumSaturates,
      maximumNmp: stage1.maximumNmpRaffinateWt / 100,
      minimumRrboRecovery: stage1.minimumRecoveryPct / 100,
    },
    sourceSolventOilMassRatio: stage1.solventOilRatio,
    solventSpecificationAudit: {
      nmpPurityMassPercent: stage1.nmpPurityWt,
      nmpWaterMassPercent: stage1.nmpWaterWt,
    },
    targetRaffinateMonoHydrocarbonMoleFraction:
      targetMonoMoles / (targetMonoMoles + targetSatMoles),
    minimumRaffinateSaturatesHydrocarbonMoleFraction:
      minimumSatMoles / (minimumSatMoles + correspondingMonoMoles),
    maximumStages: stage1.maximumStages,
    stage1Authority: {
      schemaVersion: ECR_PRE_PILOT_STAGE1_SCHEMA,
      savedAt: snapshot.savedAt,
      snapshotHash: snapshot.immutableHash,
      source: snapshot,
      sulfurPrediction: snapshot.sulfurPrediction,
      polarAromaticsAdmission: PREDICTIVE_NT_MOLECULAR_REGISTRY.polarAromatics,
      sixComponentCosmoSacBasisManifestSha256:
        snapshot.sixComponentCosmoSacBasisManifestSha256,
      sixComponentCosmoSacBindingSha256: snapshot.sixComponentCosmoSacBindingSha256,
      minimumMassRecovery: {
        targetPercent: stage1.minimumRecoveryPct,
        status: 'CALCULABLE',
      },
    },
  };
}

/** All newly submitted controlled-water jobs are bound to the production 7C contract. */
export function derivePredictiveNtInputFromStage1(
  rawSnapshot: unknown,
  projectNumber: number,
  profileReader?: SixComponentProfileFileReader,
): PredictiveNtJobInput {
  const legacy = derivePredictiveNtSixComponentInputFromStage1(
    rawSnapshot,
    projectNumber,
    profileReader,
  );
  const waterFraction = legacy.solventSpecificationAudit.nmpWaterMassPercent / 100;
  const nmpFraction = legacy.solventSpecificationAudit.nmpPurityMassPercent / 100;
  const wet = legacy.sourceSolventOilMassRatio;
  if (Math.abs(waterFraction + nmpFraction - 1) > 1e-9) {
    throw new Error('STAGE1_INVALID_WET_SOLVENT_COMPOSITION');
  }
  const stage1 = legacy.stage1Authority!.source.stage1;
  const masses = [
    stage1.saturatesWt, stage1.monoAromaticsWt, stage1.diAromaticsWt,
    stage1.polyAromaticsWt, stage1.polarAromaticsWt, stage1.nmpInFeedWt, 0,
  ];
  const molecularWeights = [
    PREDICTIVE_NT_MOLECULAR_REGISTRY.saturates
      .find(({ identity }) => identity === stage1.satIdentity)!.molecularWeightGmol,
    PREDICTIVE_NT_MOLECULAR_REGISTRY.monoAromatics
      .find(({ identity }) => identity === stage1.monoIdentity)!.molecularWeightGmol,
    PREDICTIVE_NT_MOLECULAR_REGISTRY.diAromatics.molecularWeightGmol,
    PREDICTIVE_NT_MOLECULAR_REGISTRY.polyAromatics.molecularWeightGmol,
    PREDICTIVE_NT_MOLECULAR_REGISTRY.polarAromatics.molecularWeightGmol,
    PREDICTIVE_NT_MOLECULAR_REGISTRY.nmp.molecularWeightGmol,
    18.01528,
  ];
  const moles = masses.map((mass, index) => mass / molecularWeights[index]);
  const moleTotal = moles.reduce((sum, value) => sum + value, 0);
  return {
    ...legacy,
    engineContractVersion: '7C-1.4.0',
    modelHash: PRE_PILOT_MULTISTAGE_MODEL.modelHash,
    engineComponentContract: {
      componentCount: 7,
      families: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
      thermodynamicModel: 'NATIVE_SEVEN_COMPONENT_COSMO_SAC_2010_ADDITIVE_RK_H2O',
    },
    feedMoleFractions: moles.map((value) => value / moleTotal),
    solventMolarRatio: (
      wet * nmpFraction / molecularWeights[5] + wet * waterFraction / molecularWeights[6]
    ) / (moleTotal / 100),
    wetSolventConstruction: {
      basis: 'FIXED_TOTAL_WET_SOLVENT_MASS',
      totalWetSolventMassPerUnitFeedMass: wet,
      dryNmpMassPerUnitFeedMass: wet * nmpFraction,
      waterMassPerUnitFeedMass: wet * waterFraction,
      massClosureResidual: Math.abs(wet - wet * nmpFraction - wet * waterFraction),
    },
  };
}

export function validatePredictiveNtJobInput(
  input: PredictiveNtJobInput,
  profileReader?: SixComponentProfileFileReader,
) {
  if (isSevenComponentInput(input)) {
    const expectedOrder = ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'];
    if (
      input.engineComponentContract?.componentCount !== 7
      || input.engineComponentContract?.thermodynamicModel
        !== (
          isReplacementSevenComponentInput(input)
            ? 'NATIVE_SEVEN_COMPONENT_COSMO_SAC_2010_ADDITIVE_RK_H2O'
            : isNativeSevenComponentInput(input)
              ? 'NATIVE_SEVEN_COMPONENT_COSMO_SAC_2010_H2O'
            : 'COSMO_SAC_2010_PROJECT_NMP_LLE_RESIDUAL_H2O_EXTENSION'
        )
      || (
        !isReplacementSevenComponentInput(input)
        && input.engineComponentContract?.qualificationStatus
          !== 'PENDING_GOVERNED_WATER_BEARING_LLE_AND_BLIND_QUALIFICATION'
      )
      || canonicalJson(input.engineComponentContract?.families) !== canonicalJson(expectedOrder)
      || !Array.isArray(input.feedMoleFractions)
      || input.feedMoleFractions.length !== 7
      || input.feedMoleFractions.some((value) => !Number.isFinite(value) || value < 0)
      || Math.abs(input.feedMoleFractions.reduce((sum, value) => sum + value, 0) - 1) > 1e-9
      || input.wetSolventConstruction?.basis !== 'FIXED_TOTAL_WET_SOLVENT_MASS'
      || !Number.isFinite(input.wetSolventConstruction.massClosureResidual)
      || input.wetSolventConstruction.massClosureResidual > 1e-12
      || Math.abs(
        input.wetSolventConstruction.totalWetSolventMassPerUnitFeedMass
        - input.wetSolventConstruction.dryNmpMassPerUnitFeedMass
        - input.wetSolventConstruction.waterMassPerUnitFeedMass
      ) > 1e-12
    ) {
      throw new Error('PREDICTIVE_NT_SEVEN_COMPONENT_CONTRACT_REQUIRED');
    }
    if (!input.stage1Authority) throw new Error('STAGE1_AUTHORITY_REQUIRED');
    const snapshot = validateStage1Snapshot(input.stage1Authority.source);
    verifyStage1SixComponentCosmoSacProfileFiles(snapshot.sixComponentCosmoSacBinding, profileReader);
    const projectNumber = Number(snapshot.stage1.projectReference);
    const { _runtimeTestOwner, ...comparable } = input as PredictiveNtJobInput & {
      _runtimeTestOwner?: unknown;
    };
    const expected = derivePredictiveNtInputFromStage1(snapshot, projectNumber, profileReader);
    // Residual-bearing 7C-1.1.0/1.2.0 remain exact historical inputs only.
     // New derivation uses immutable native-plus-RK thermodynamics 7C-1.4.0.
    if (
      input.engineContractVersion === '7C-1.1.0'
      || input.engineContractVersion === '7C-1.2.0'
    ) {
      expected.engineContractVersion = input.engineContractVersion;
      expected.engineComponentContract = {
        componentCount: 7,
        families: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
        thermodynamicModel: 'COSMO_SAC_2010_PROJECT_NMP_LLE_RESIDUAL_H2O_EXTENSION',
        qualificationStatus: 'PENDING_GOVERNED_WATER_BEARING_LLE_AND_BLIND_QUALIFICATION',
      };
    }
    if (
      (_runtimeTestOwner !== undefined && process.env.NODE_ENV !== 'test')
      || canonicalJson(comparable) !== canonicalJson(expected)
    ) {
      // The authority remains immutable, but callers need to distinguish a
      // malformed 7C derived vector/wet charge from a legacy snapshot error.
      throw new Error('PREDICTIVE_NT_7C_INPUT_RECONSTRUCTION_MISMATCH');
    }
    const gate = startPrePilotNt({
      executionMode: 'ECR_PRE_PILOT_PREDICTIVE',
      requestedModelHash: input.modelHash,
      feedCompositionMassFraction: {
        saturates: input.sourceFeedCompositionMassFraction.saturates,
        mono: input.sourceFeedCompositionMassFraction.mono,
        di: input.sourceFeedCompositionMassFraction.di,
        poly: input.sourceFeedCompositionMassFraction.poly,
        polar: input.sourceFeedCompositionMassFraction.polar,
      },
      sulfurObjectiveRequested: false,
    });
    if (!gate.mayRunPredictiveNt) throw new Error(gate.status);
    if (isReplacementSevenComponentInput(input)) {
      return {
        ...gate,
        model: PRE_PILOT_MULTISTAGE_MODEL,
        calibrationRequired: false as const,
        diagnostics: [
          'The job is bound to the immutable 7C-1.4.0 simultaneous seven-component counter-current engine and governed Stage 1 inputs.',
          'Experimental wet LLE data are not required for pre-pilot execution; future pilot data may be compared without rewriting historical results.',
          'Predictive N_T requires complete multistage closure, physical LLE, stable daughter phases, reproducible branches, and every calculable Stage 1 target to pass.',
          'Sulfur remains NOT_CALCULABLE and cannot be inferred from aromatic transfer.',
        ],
      };
    }
    return gate;
  }
  if (
    input.engineComponentContract?.componentCount !== 6
    || input.engineComponentContract?.thermodynamicModel !== 'FROZEN_SIX_COMPONENT_COSMO_SAC_2010'
    || input.engineComponentContract?.researchDiagnosticOnly !== true
    || JSON.stringify(input.engineComponentContract?.families) !==
      JSON.stringify(['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'])
  ) {
    throw new Error('PREDICTIVE_NT_SIX_COMPONENT_CONTRACT_REQUIRED');
  }
  if (!input.stage1Authority) throw new Error('STAGE1_AUTHORITY_REQUIRED');
  const authoritySnapshot = validateStage1Snapshot(input.stage1Authority.source);
  const authorityProjectNumber = Number(authoritySnapshot.stage1.projectReference);
  if (
    !Number.isInteger(authorityProjectNumber)
    || authorityProjectNumber < 1
    || canonicalJson(authoritySnapshot.stage1)
      !== canonicalJson(canonicalizeStage1Input(authoritySnapshot.stage1, authorityProjectNumber))
  ) {
    throw new Error('STAGE1_AUTHORITY_MISMATCH');
  }
  if (!input.satIdentity?.trim() || !input.monoIdentity?.trim()) {
    throw new Error('MOLECULAR_BASIS_REQUIRED');
  }
  if (!SAT_IDENTITIES.has(input.satIdentity) || !MONO_IDENTITIES.has(input.monoIdentity)) {
    throw new Error('MOLECULAR_IDENTITY_UNAVAILABLE');
  }
  if (
    input.stage1Authority.schemaVersion !== ECR_PRE_PILOT_STAGE1_SCHEMA
    || input.stage1Authority.savedAt !== authoritySnapshot.savedAt
    || input.stage1Authority.snapshotHash !== authoritySnapshot.immutableHash
    || input.stage1Authority.snapshotHash !== stage1SnapshotHash(authoritySnapshot)
    || input.stage1Authority.sixComponentCosmoSacBasisManifestSha256 !==
      SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256
    || input.stage1Authority.sixComponentCosmoSacBindingSha256 !==
      authoritySnapshot.sixComponentCosmoSacBindingSha256
    || input.satIdentity !== authoritySnapshot.stage1.satIdentity
    || input.monoIdentity !== authoritySnapshot.stage1.monoIdentity
  ) {
    throw new Error('STAGE1_AUTHORITY_MISMATCH');
  }
  verifyStage1SixComponentCosmoSacProfileFiles(
    authoritySnapshot.sixComponentCosmoSacBinding,
    profileReader,
  );
  if ('minimumNmpFreeHydrocarbonRecovery' in input) {
    throw new Error('MASS_RECOVERY_GATE_UNAVAILABLE');
  }
  if (!Array.isArray(input.feedMoleFractions) || input.feedMoleFractions.length !== 6) {
    throw new Error('INVALID_FEED_COMPOSITION');
  }
  const feedSum = input.feedMoleFractions.reduce((sum, value) => sum + value, 0);
  if (
    input.feedMoleFractions.some((value) => !Number.isFinite(value) || value < 0)
    || Math.abs(feedSum - 1) > 1e-6
  ) {
    throw new Error('INVALID_FEED_COMPOSITION');
  }
  const maximumStages = input.maximumStages ?? 10;
  const ntTest = input.ntTest;
  if (
    !Number.isFinite(input.temperatureK) || input.temperatureK <= 0
    || !Number.isFinite(input.solventMolarRatio) || input.solventMolarRatio <= 0
    || !Number.isFinite(input.targetRaffinateMonoHydrocarbonMoleFraction)
    || input.targetRaffinateMonoHydrocarbonMoleFraction <= 0
    || input.targetRaffinateMonoHydrocarbonMoleFraction >= 1
    || !Number.isInteger(maximumStages) || maximumStages < 1 || maximumStages > 20
    || (ntTest !== undefined && (
      !Number.isInteger(ntTest) || ntTest < 1 || ntTest > 10
      || !isReplacementSevenComponentInput(input)
    ))
  ) {
    throw new Error('INVALID_CASCADE_INPUT');
  }
  const gate = startPrePilotNt({
    executionMode: 'ECR_PRE_PILOT_PREDICTIVE',
    requestedModelHash: input.modelHash,
    feedCompositionMassFraction: {
      saturates: input.sourceFeedCompositionMassFraction.saturates,
      mono: input.sourceFeedCompositionMassFraction.mono,
      di: input.sourceFeedCompositionMassFraction.di,
      poly: input.sourceFeedCompositionMassFraction.poly,
      polar: input.sourceFeedCompositionMassFraction.polar,
    },
    sulfurObjectiveRequested: false,
  });
  if (!gate.mayRunPredictiveNt) throw new Error(gate.status);
  const sourceFeed = input.sourceFeedCompositionMassFraction;
  if (!sourceFeed || Object.values(sourceFeed).some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('SOURCE_FEED_BASIS_REQUIRED');
  }
  const sourceFeedSum = Object.values(sourceFeed).reduce((sum, value) => sum + value, 0);
  if (Math.abs(sourceFeedSum - 1) > 1e-6) throw new Error('INVALID_SOURCE_FEED_BASIS');
  const sat = PREDICTIVE_NT_MOLECULAR_REGISTRY.saturates.find(({ identity }) => identity === input.satIdentity)!;
  const mono = PREDICTIVE_NT_MOLECULAR_REGISTRY.monoAromatics.find(({ identity }) => identity === input.monoIdentity)!;
  const sourceSatMoles = sourceFeed.saturates / sat.molecularWeightGmol;
  const sourceMonoMoles = sourceFeed.mono / mono.molecularWeightGmol;
  const sourceDiMoles = sourceFeed.di / PREDICTIVE_NT_MOLECULAR_REGISTRY.diAromatics.molecularWeightGmol;
  const sourcePolyMoles = sourceFeed.poly / PREDICTIVE_NT_MOLECULAR_REGISTRY.polyAromatics.molecularWeightGmol;
  const sourcePaMoles = sourceFeed.polar / PREDICTIVE_NT_MOLECULAR_REGISTRY.polarAromatics.molecularWeightGmol;
  const sourceNmpMoles = sourceFeed.nmp / PREDICTIVE_NT_MOLECULAR_REGISTRY.nmp.molecularWeightGmol;
  const sourceMoles = sourceSatMoles + sourceMonoMoles + sourceDiMoles + sourcePolyMoles
    + sourcePaMoles + sourceNmpMoles;
  if (
    sourceMoles <= 0
    || Math.abs(input.feedMoleFractions[0] - sourceSatMoles / sourceMoles) > 1e-6
    || Math.abs(input.feedMoleFractions[1] - sourceMonoMoles / sourceMoles) > 1e-6
    || Math.abs(input.feedMoleFractions[2] - sourceDiMoles / sourceMoles) > 1e-6
    || Math.abs(input.feedMoleFractions[3] - sourcePolyMoles / sourceMoles) > 1e-6
    || Math.abs(input.feedMoleFractions[4] - sourcePaMoles / sourceMoles) > 1e-6
    || Math.abs(input.feedMoleFractions[5] - sourceNmpMoles / sourceMoles) > 1e-6
  ) {
    throw new Error('MOLECULAR_FEED_BASIS_MISMATCH');
  }
  if (!Number.isFinite(input.sourceSolventOilMassRatio) || input.sourceSolventOilMassRatio <= 0) {
    throw new Error('SOURCE_SOLVENT_MASS_BASIS_REQUIRED');
  }
  const expectedSolventMolarRatio = (input.sourceSolventOilMassRatio / PREDICTIVE_NT_MOLECULAR_REGISTRY.nmp.molecularWeightGmol) / sourceMoles;
  if (Math.abs(input.solventMolarRatio - expectedSolventMolarRatio) > 1e-6) {
    throw new Error('MOLECULAR_SOLVENT_BASIS_MISMATCH');
  }
  const sourceTargets = input.sourceProductTargetsMassFraction;
  if (
    !sourceTargets
    || !Number.isFinite(sourceTargets.maximumTotalAromatics)
    || !Number.isFinite(sourceTargets.maximumPolarAromatics)
    || !Number.isFinite(sourceTargets.minimumSaturates)
    || !Number.isFinite(sourceTargets.maximumNmp)
    || !Number.isFinite(sourceTargets.minimumRrboRecovery)
    || sourceTargets.maximumTotalAromatics <= 0
    || sourceTargets.maximumTotalAromatics >= 1
    || sourceTargets.maximumPolarAromatics < 0
    || sourceTargets.maximumPolarAromatics >= 1
    || sourceTargets.maximumNmp < 0
    || sourceTargets.maximumNmp >= 1
    || sourceTargets.minimumRrboRecovery <= 0
    || sourceTargets.minimumRrboRecovery > 1
    || sourceTargets.minimumSaturates <= 0
    || sourceTargets.minimumSaturates >= 1
  ) {
    throw new Error('SOURCE_PRODUCT_TARGET_BASIS_REQUIRED');
  }
  const targetMonoMoles = sourceTargets.maximumTotalAromatics / mono.molecularWeightGmol;
  const targetSatMoles = (1 - sourceTargets.maximumTotalAromatics) / sat.molecularWeightGmol;
  const expectedTargetMono = targetMonoMoles / (targetMonoMoles + targetSatMoles);
  const minimumSatMoles = sourceTargets.minimumSaturates / sat.molecularWeightGmol;
  const correspondingMonoMoles = (1 - sourceTargets.minimumSaturates) / mono.molecularWeightGmol;
  const expectedMinimumSat = minimumSatMoles / (minimumSatMoles + correspondingMonoMoles);
  if (
    Math.abs(input.targetRaffinateMonoHydrocarbonMoleFraction - expectedTargetMono) > 1e-6
    || Math.abs((input.minimumRaffinateSaturatesHydrocarbonMoleFraction ?? 0) - expectedMinimumSat) > 1e-6
  ) {
    throw new Error('MOLECULAR_PRODUCT_TARGET_BASIS_MISMATCH');
  }
  const projectNumber = authorityProjectNumber;
  if (!Number.isInteger(projectNumber) || projectNumber < 1) {
    throw new Error('STAGE1_AUTHORITY_MISMATCH');
  }
  let expected: PredictiveNtJobInput;
  try {
    expected = derivePredictiveNtSixComponentInputFromStage1(
      authoritySnapshot,
      projectNumber,
      profileReader,
    );
  } catch (error) {
    throw error;
  }
  const { _runtimeTestOwner, ...authorityComparableInput } = input as PredictiveNtJobInput & {
    _runtimeTestOwner?: unknown;
  };
  if (
    (_runtimeTestOwner !== undefined && process.env.NODE_ENV !== 'test')
    || canonicalJson(authorityComparableInput) !== canonicalJson(expected)
  ) {
    throw new Error('STAGE1_AUTHORITY_MISMATCH');
  }
  return gate;
}

export function validatePredictiveNtExecutionEvidence(
  job: Pick<PredictiveNtJob, 'input' | 'modelHash' | 'engineHash'>,
  currentEngineHash: string,
) {
  if (currentEngineHash !== job.engineHash) return 'PREDICTIVE_NT_ENGINE_HASH_MISMATCH';
  if (
    job.modelHash !== job.input.modelHash
    || job.modelHash !== (
      isReplacementSevenComponentInput(job.input)
        ? PRE_PILOT_MULTISTAGE_MODEL.modelHash
        : PRE_PILOT_MODEL.modelHash
    )
  ) {
    return 'PREDICTIVE_NT_MODEL_HASH_MISMATCH';
  }
  return null;
}

const SEVEN_COMPONENT_ORDER = ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'] as const;

export function validateSevenComponentPersistedResult(
  result: unknown,
  options: { intermediate?: boolean; input?: PredictiveNtJobInput } = {},
) {
  const value = result as any;
  if (
    !value || typeof value !== 'object'
    || !['7C-1.1.0', '7C-1.2.0', '7C-1.3.0', '7C-1.4.0'].includes(value.engineContractVersion)
    || (
      options.input
      && value.engineContractVersion !== options.input.engineContractVersion
    )
    || canonicalJson(value.componentOrder) !== canonicalJson(SEVEN_COMPONENT_ORDER)
    || value.releaseEligible !== false
    || (
      value.engineContractVersion !== '7C-1.4.0'
      && (value.predictiveNt !== null || value.establishedTheoreticalStages !== null)
    )
  ) return 'PREDICTIVE_NT_7C_RESULT_CONTRACT_INVALID';
  const replacement = value.engineContractVersion === '7C-1.4.0';
  if (!options.intermediate && value.status !== 'ENGINE_ERROR' && (
    value.status !== (
      replacement
        ? 'PRE-PILOT MULTISTAGE PREDICTIVE MODEL'
        : 'IMPLEMENTED — PREDICTIVE QUALIFICATION PENDING'
    )
    || value.implementationStatus !== 'IMPLEMENTED'
    || value.sulfurPrediction?.status !== 'NOT_CALCULABLE'
    || (
      replacement
        ? value.qualificationEvidence?.experimentalWetLleRequiredForExecution !== false
        : (
          value.qualificationEvidence?.directWaterBearingLleValidated !== false
          || value.qualificationEvidence?.independentBlindQualificationPassed !== false
        )
    )
  )) return 'PREDICTIVE_NT_7C_RESULT_GOVERNANCE_INVALID';
  // Terminal engine failures must persist their evidence without pretending
  // that successful trial, stream, or wet-solvent output exists.
  if (value.status === 'ENGINE_ERROR') return null;
  if (!Array.isArray(value.trials)) return 'PREDICTIVE_NT_7C_RESULT_TRIALS_INVALID';
  const governedTrialsAccepted = value.trials.filter(
    (trial: any) => (
      value.engineContractVersion === '7C-1.4.0'
        ? trial?.accepted === true
        : trial?.numericalAcceptancePassed === true
    ),
  ).length;
  const diagnosticTrialsCalculated = value.trials.filter(
    (trial: any) => trial?.diagnosticContinuationUsed === true,
  ).length;
  if (!options.intermediate && (
    value.trialsAttempted !== value.trials.length
    || value.governedTrialsAccepted !== governedTrialsAccepted
    || value.diagnosticTrialsCalculated !== diagnosticTrialsCalculated
    || value.governedTrialsAccepted < 0
    || value.governedTrialsAccepted > value.trialsAttempted
    || value.diagnosticTrialsCalculated < 0
    || value.diagnosticTrialsCalculated > value.trialsAttempted
  )) return 'PREDICTIVE_NT_7C_TRIAL_CLASSIFICATION_INVALID';
  const blockedResultContract = {
    BLOCKED_NO_LIQUID_SPLIT: {
      blockingCode: 'SEVEN_COMPONENT_NO_LIQUID_SPLIT',
      phaseBehavior: 'NO_SPLIT_FOUND_DENSE_RESEARCH_SEARCH',
    },
    BLOCKED_PHASE_TOPOLOGY_UNRESOLVED: {
      blockingCode: 'SEVEN_COMPONENT_PHASE_TOPOLOGY_UNRESOLVED',
      phaseBehavior: 'UNRESOLVED',
    },
  }[value.executionStatus as 'BLOCKED_NO_LIQUID_SPLIT' | 'BLOCKED_PHASE_TOPOLOGY_UNRESOLVED'];
  const blockedPhaseResult = Boolean(blockedResultContract);
  if (blockedPhaseResult && (
    value.blockingCode !== blockedResultContract.blockingCode
    || !Number.isInteger(value.blockedCascadeTrialCount)
    || value.blockedCascadeTrialCount < 1
    || value.blockedCascadeTrialCount > (options.input?.maximumStages ?? 10)
    || !Number.isInteger(value.blockedStageFromFeedEnd)
    || value.blockedStageFromFeedEnd < 1
    || value.blockedStageFromFeedEnd > value.blockedCascadeTrialCount
    || value.trials.length !== value.blockedCascadeTrialCount - 1
    || value.flashEvidence?.phaseBehavior !== blockedResultContract.phaseBehavior
    || value.flashEvidence?.phaseFractionExtract !== null
  )) return 'PREDICTIVE_NT_7C_BLOCKED_RESULT_INVALID';
  if (
    !options.intermediate
    && options.input
    && !blockedPhaseResult
    && value.trials.length !== (options.input.ntTest === undefined ? options.input.maximumStages : 1)
  ) return 'PREDICTIVE_NT_7C_RESULT_TRIALS_INVALID';
  if (
    !options.intermediate
    && options.input
    && !blockedPhaseResult
    && !['COMPLETED_GOVERNED_SEQUENCE', 'COMPLETED_DIAGNOSTIC_SEQUENCE',
      'COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX']
      .includes(value.executionStatus)
  ) return 'PREDICTIVE_NT_7C_TRIAL_CLASSIFICATION_INVALID';
  const finiteVector = (vector: unknown, nonnegative = false) => (
    Array.isArray(vector) && vector.length === 7
    && vector.every((entry) => (
      typeof entry === 'number' && Number.isFinite(entry) && (!nonnegative || entry >= 0)
    ))
  );
  const validStream = (stream: any) => {
    if (
      !stream || !finiteVector(stream.componentMoles, true)
      || !finiteVector(stream.componentMass, true)
      || !finiteVector(stream.moleFractions, true)
      || !finiteVector(stream.massFractions, true)
      || !Number.isFinite(stream.flowMol) || stream.flowMol < 0
      || !Number.isFinite(stream.mass) || stream.mass < 0
    ) return false;
    const moleSum = stream.moleFractions.reduce((sum: number, entry: number) => sum + entry, 0);
    const massSum = stream.massFractions.reduce((sum: number, entry: number) => sum + entry, 0);
    return Math.abs(moleSum - 1) <= 1e-8 && Math.abs(massSum - 1) <= 1e-8;
  };
  for (const trial of value.trials) {
    if (
      !Number.isInteger(trial?.stageCount) || trial.stageCount < 1
      || !Array.isArray(trial?.stages) || trial.stages.length !== trial.stageCount
      || !finiteVector(trial?.overallComponentBalanceResidualMol)
      || !finiteVector(trial?.overallComponentBalanceResidualMass)
      || !['GOVERNED_RESULT', 'NO_PHYSICAL_LLE', 'NUMERICALLY_OR_TARGET_REJECTED',
        'NON_GOVERNED_METASTABLE_OR_UNRESOLVED_NOT_RELEASE_ELIGIBLE']
        .includes(trial?.governanceClassification)
      || typeof trial?.diagnosticContinuationUsed !== 'boolean'
    ) return 'PREDICTIVE_NT_7C_RESULT_TRIALS_INVALID';
    for (const streamName of ['oilFeed', 'freshWetSolvent', 'finalRaffinate', 'finalExtract']) {
      if (!validStream(trial?.boundaryStreams?.[streamName])) {
        return 'PREDICTIVE_NT_7C_RESULT_VECTOR_INTEGRITY_INVALID';
      }
    }
    for (const stage of trial.stages) {
      if (!['GOVERNED_EQUILIBRIUM',
        'NON_GOVERNED_METASTABLE_OR_UNRESOLVED_NOT_RELEASE_ELIGIBLE']
        .includes(stage?.governanceClassification)) {
        return 'PREDICTIVE_NT_7C_TRIAL_CLASSIFICATION_INVALID';
      }
      for (const stream of ['raffinateIncoming', 'extractIncoming', 'raffinateLeaving', 'extractLeaving']) {
        if (!validStream(stage?.[stream])) {
          return 'PREDICTIVE_NT_7C_RESULT_VECTOR_INTEGRITY_INVALID';
        }
      }
      if (replacement && (
        stage?.explicitMonoRichBasinAuditAccepted !== true
        || ['raffinate', 'extract'].some((phase) => {
          const audit = stage?.postSplitTpdSearch?.[phase]?.explicitMonoRichBasinSearch;
          return !audit
            || audit.allRequiredSearchesAccepted !== true
            || audit.historicalFalseBasinSeedIncluded !== true
            || audit.region !== 'x_MONO >= 0.5'
            || !Array.isArray(audit.searches)
            || audit.searches.length < 3
            || audit.searches.some((search: any) => (
              search?.optimizerSuccess !== true
              || search?.replayOptimizerSuccess !== true
              || !Number.isFinite(search?.minimum)
              || !Number.isFinite(search?.replayMinimum)
              || search.minimum < -1e-8
              || search.replayMinimum < -1e-8
              || !Number.isFinite(search?.replayMaximumCompositionDifference)
              || search.replayMaximumCompositionDifference > 1e-8
              || !finiteVector(search?.composition)
              || Math.abs(search.composition.reduce((sum: number, x: number) => sum + x, 0) - 1) > 1e-8
              || search.composition[1] < 0.5 - 1e-8
            ));
        })
      )) return 'PREDICTIVE_NT_7C_MONO_RICH_AUDIT_INVALID';
    }
  }
  if (!options.intermediate && options.input) {
    const stage1 = options.input.stage1Authority?.source.stage1;
    const wet = value.wetSolventConstruction;
    const rrboFeedMass = Number(wet?.rrboFeedMass);
    const governedFeedMass = stage1
      ? stage1.saturatesWt + stage1.monoAromaticsWt + stage1.diAromaticsWt
        + stage1.polyAromaticsWt + stage1.polarAromaticsWt + stage1.nmpInFeedWt
      : Number.NaN;
    const expectedWetMass = governedFeedMass
      * Number(options.input.wetSolventConstruction?.totalWetSolventMassPerUnitFeedMass);
    const expectedNmpMass = governedFeedMass
      * Number(options.input.wetSolventConstruction?.dryNmpMassPerUnitFeedMass);
    const expectedWaterMass = governedFeedMass
      * Number(options.input.wetSolventConstruction?.waterMassPerUnitFeedMass);
    const expectedTemperatureC = Number(stage1?.operatingTemperatureC);
    const expectedTemperatureK = expectedTemperatureC + 273.15;
    if (
      !stage1 || !Number.isFinite(governedFeedMass) || governedFeedMass <= 0
      || Math.abs(governedFeedMass - 100) > 1e-9
      || !Number.isFinite(rrboFeedMass) || Math.abs(rrboFeedMass - governedFeedMass) > 1e-9
      || Math.abs(Number(wet?.totalWetSolventMass) - expectedWetMass) > 1e-9
      || Math.abs(Number(wet?.dryNmpMass) - expectedNmpMass) > 1e-9
      || Math.abs(Number(wet?.waterMass) - expectedWaterMass) > 1e-9
      || Math.abs(Number(wet?.nmpWeightPercentOfWetSolvent) - stage1.nmpPurityWt) > 1e-9
      || Math.abs(Number(wet?.waterWeightPercentOfWetSolvent) - stage1.nmpWaterWt) > 1e-9
      || Math.abs(Number(wet?.massClosureResidual)) > 1e-12
      || canonicalJson(wet?.componentOrder) !== canonicalJson(SEVEN_COMPONENT_ORDER)
    ) return 'PREDICTIVE_NT_7C_WET_SOLVENT_AUTHORITY_MISMATCH';
    if (
      !Number.isFinite(expectedTemperatureC)
      || Math.abs(Number(value.thermodynamicCondition?.temperatureC) - expectedTemperatureC) > 1e-9
      || Math.abs(Number(value.thermodynamicCondition?.temperatureK) - expectedTemperatureK) > 1e-9
      || value.thermodynamicCondition?.authority !== 'IMMUTABLE_STAGE1_OPERATING_TEMPERATURE'
    ) return 'PREDICTIVE_NT_7C_TEMPERATURE_AUTHORITY_MISMATCH';
    if (replacement) {
      const accepted = value.trials.filter((trial: any) => trial?.accepted === true);
      const selected = accepted.length
        ? Math.min(...accepted.map((trial: any) => trial.stageCount))
        : null;
      if (
        value.predictiveNt !== selected
        || value.establishedTheoreticalStages !== selected
        || value.calibrationRequired !== false
        || accepted.some((trial: any) => (
          trial.numericalAcceptancePassed !== true
          || trial.allCalculableTargetsPass !== true
          || trial.physicalLleClassification !== 'PHYSICAL_LLE'
        ))
      ) return 'PREDICTIVE_NT_7C_PREDICTIVE_SELECTION_INVALID';
    }
  }
  return null;
}

export function attachStage1ResultGovernance(
  pythonResult: unknown,
  input: PredictiveNtJobInput,
  options: { allowAckCheckpoint?: boolean } = {},
) {
  if (!pythonResult || typeof pythonResult !== 'object' || !input.stage1Authority) return pythonResult;
  const {
    sixComponentRemoval: _discardedSixComponentRemoval,
    sixComponentCosmoSac: _discardedCosmoSacClaim,
    removalClaims: _discardedRemovalClaims,
    ...admittedResult
  } = pythonResult as Record<string, unknown>;
  const isIntermediateCheckpoint = options.allowAckCheckpoint === true
    && admittedResult.status === 'RUNNING'
    && ['ACK_V2', 'ACK_V3_ENGINE_CONTRACT'].includes(
      String((admittedResult.checkpoint as Record<string, unknown> | undefined)?.protocol),
    );
  if (admittedResult.status === 'RUNNING' && !isIntermediateCheckpoint) {
    throw new Error('PREDICTIVE_NT_TERMINAL_RUNNING_ACK_PAYLOAD_FORBIDDEN');
  }
  const sevenComponent = isSevenComponentInput(input);
  if (!isIntermediateCheckpoint && !sevenComponent) {
    const evidenceError = validateTask216GlobalStabilityEvidence(
      admittedResult.globalStabilityQualification,
    );
    if (evidenceError) throw new Error(evidenceError);
    const task218EvidenceError = validateTask218CandidateGeneratedStabilityEvidence(
      admittedResult.task218CandidateGeneratedStability,
    );
    if (task218EvidenceError) throw new Error(task218EvidenceError);
  }
  if (sevenComponent) {
    const replacement = isReplacementSevenComponentInput(input);
    const governed = {
      ...admittedResult,
      engineContractVersion: input.engineContractVersion,
      componentOrder: [...SEVEN_COMPONENT_ORDER],
      model: {
        modelHash: replacement
          ? PRE_PILOT_MULTISTAGE_MODEL.modelHash
          : PRE_PILOT_MODEL.modelHash,
        runtimeVerification: 'PASS',
      },
      resultThermodynamicClassification: replacement
        ? 'PRE_PILOT_MULTISTAGE_PREDICTIVE_MODEL'
        : 'SEVEN_COMPONENT_CCOSMO_IMPLEMENTED_QUALIFICATION_PENDING',
      predictiveNt: replacement ? admittedResult.predictiveNt : null,
      establishedTheoreticalStages: replacement ? admittedResult.establishedTheoreticalStages : null,
      releaseEligible: false,
      calibrationRequired: replacement ? false : true,
      stage1TargetGovernance: {
        stage1SnapshotHash: input.stage1Authority.snapshotHash,
        predictiveNtAuthority: replacement
          ? 'VERSIONED_SEVEN_COMPONENT_NATIVE_RK_MULTISTAGE_ENGINE'
          : 'VERSIONED_SEVEN_COMPONENT_CCOSMO_PRODUCTION_ENGINE',
        predictiveNtEngineScope: {
          componentCount: 7,
          componentOrder: [...SEVEN_COMPONENT_ORDER],
          thermodynamicModel: 'COSMO-SAC-2010',
          implementationStatus: 'IMPLEMENTED',
          predictiveQualification: replacement ? 'PRE_PILOT_MULTISTAGE' : 'PENDING',
        },
        sulfurPrediction: input.stage1Authority.sulfurPrediction,
        overallEcrProductAcceptance: false,
        overallEcrProductAcceptanceStatus: replacement
          ? 'PRE_PILOT_MULTISTAGE_PREDICTIVE_MODEL'
          : 'PREDICTIVE_QUALIFICATION_PENDING_NOT_RELEASE_ELIGIBLE',
      },
    };
    const validationError = validateSevenComponentPersistedResult(
      governed,
      { intermediate: isIntermediateCheckpoint, input },
    );
    if (validationError) throw new Error(validationError);
    return governed;
  }
  return {
    ...admittedResult,
    model: {
      modelHash: PRE_PILOT_MODEL.modelHash,
      runtimeVerification: 'PASS',
    },
    resultThermodynamicClassification: 'SIX_COMPONENT_COSMO_SAC_2010_RESEARCH_DIAGNOSTIC',
    predictiveNt: null,
    releaseEligible: false,
    establishedTheoreticalStages: null,
    calibrationRequired: true,
    stage1TargetGovernance: {
      stage1SnapshotHash: input.stage1Authority.snapshotHash,
        predictiveNtAuthority: 'FROZEN_SIX_COMPONENT_COSMO_SAC_RESEARCH_ENGINE',
      predictiveNtEngineScope: {
          componentCount: 6,
          thermodynamicModel: 'COSMO-SAC-2010',
          researchDiagnosticOnly: true,
          mayEmitSixComponentRemovalClaims: true,
      },
      sixComponentCosmoSacBasisManifestSha256:
        input.stage1Authority.sixComponentCosmoSacBasisManifestSha256,
      sixComponentCosmoSacBindingSha256:
        input.stage1Authority.sixComponentCosmoSacBindingSha256,
      sixComponentRemoval: deriveSixComponentCosmoSacRemoval(pythonResult),
      supportedAcceptanceBasis: [
        'MAXIMUM_RAFFINATE_MONO_AROMATICS',
        'MAXIMUM_RAFFINATE_TOTAL_AROMATICS',
        'MINIMUM_RAFFINATE_SATURATES',
        'MAXIMUM_RAFFINATE_NMP',
        'MINIMUM_RRBO_MASS_RECOVERY',
        'COMPONENT_BALANCES',
        'INDEPENDENT_THERMODYNAMIC_CHECKS',
      ],
      sulfurPrediction: input.stage1Authority.sulfurPrediction,
      minimumMassRecovery: input.stage1Authority.minimumMassRecovery,
      polarAromaticsAdmission: input.stage1Authority.polarAromaticsAdmission,
      overallEcrProductAcceptance: false,
      overallEcrProductAcceptanceStatus: 'RESEARCH_DIAGNOSTIC_NOT_RELEASE_ELIGIBLE',
    },
  };
}

function terminalFailureEvidence(result: unknown, input: PredictiveNtJobInput, error: string | null) {
  const payload = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  if (isSevenComponentInput(input)) {
    return attachStage1ResultGovernance({
      ...payload,
      status: 'ENGINE_ERROR',
      implementationStatus: 'IMPLEMENTED',
      error: error ?? payload.error ?? 'PREDICTIVE_NT_TERMINAL_RESULT_UNAVAILABLE',
      trials: Array.isArray(payload.trials) ? payload.trials : [],
      sulfurPrediction: { status: 'NOT_CALCULABLE' },
      qualificationEvidence: {
        directWaterBearingLleValidated: false,
        independentBlindQualificationPassed: false,
      },
    }, input);
  }
  // Never accept worker-owned terminal evidence after a crash, timeout, or
  // parse failure.  The server reconstructs the frozen envelope itself.
  return attachStage1ResultGovernance({
    ...payload,
    status: 'ENGINE_ERROR',
    error: error ?? payload.error ?? 'PREDICTIVE_NT_TERMINAL_RESULT_UNAVAILABLE',
    globalStabilityQualification: {
      evidenceId: 'TASK_216_MONO_RICH_GLOBAL_STABILITY_V1',
      researchOnly: true, calibrationRequired: true, releaseEligible: false, predictiveNt: null,
      ...expectedTask216GlobalStabilityEvidence(),
    },
    task218CandidateGeneratedStability: expectedTask218CandidateGeneratedStabilityEvidence(),
  }, input);
}

type RemovalFamily = 'MONO' | 'DI' | 'POLY' | 'PA';
type SixFlowFamily = 'SAT' | RemovalFamily | 'NMP';

function notCalculableRemoval(diagnostic: string) {
  return {
    status: 'NOT_CALCULABLE' as const,
    valuePercent: null,
    diagnostic,
  };
}

export function deriveSixComponentCosmoSacRemoval(
  result: unknown,
  sixComponentCosmoSacEngine = true,
) {
  const blocked = (diagnostic: string) => ({
    status: 'NOT_CALCULABLE' as const,
    removals: {
      MONO: notCalculableRemoval(diagnostic),
      DI: notCalculableRemoval(diagnostic),
      POLY: notCalculableRemoval(diagnostic),
      PA: notCalculableRemoval(diagnostic),
    },
  });
  if (!sixComponentCosmoSacEngine) {
    return blocked('SIX_COMPONENT_COSMO_SAC_ENGINE_REQUIRED');
  }
  if (!result || typeof result !== 'object') return blocked('SIX_COMPONENT_RESULT_MISSING');
  const source = result as Record<string, any>;
  if (
    source.status !== 'ACCEPTED_SIX_COMPONENT_COSMO_SAC'
    || source.accepted !== true
    || source.numericallyAccepted !== true
  ) {
    return blocked('SIX_COMPONENT_RESULT_NOT_ACCEPTED');
  }
  const feed = source.feedComponentFlows;
  const raffinate = source.raffinateComponentFlows;
  const families: readonly SixFlowFamily[] = ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'];
  if (
    !feed || !raffinate
    || families.some((family) =>
      !Number.isFinite(feed[family])
      || !Number.isFinite(raffinate[family])
      || feed[family] < 0
      || raffinate[family] < 0)
  ) {
    return blocked('COMPLETE_SIX_COMPONENT_FLOWS_REQUIRED');
  }
  const removalFamilies: readonly RemovalFamily[] = ['MONO', 'DI', 'POLY', 'PA'];
  if (removalFamilies.some((family) => feed[family] <= 0)) {
    return blocked('POSITIVE_COMPONENT_FEED_FLOW_REQUIRED');
  }
  return {
    status: 'CALCULABLE' as const,
    removals: Object.fromEntries(removalFamilies.map((family) => [
      family,
      {
        status: 'CALCULABLE',
        valuePercent: ((feed[family] - raffinate[family]) / feed[family]) * 100,
        diagnostic: null,
      },
    ])) as Record<RemovalFamily, {
      status: 'CALCULABLE';
      valuePercent: number;
      diagnostic: null;
    }>,
  };
}

function mapJob(row: any): PredictiveNtJob {
  const persistedResult = row.result_snapshot;
  const result = (
    persistedResult
    && typeof persistedResult === 'object'
    && isSevenComponentInput(row.input_snapshot)
    && !isReplacementSevenComponentInput(row.input_snapshot)
  ) ? {
      ...persistedResult,
      researchOnlyReplacementModel: PREDICTIVE_NT_RESEARCH_CANDIDATE,
    } : persistedResult;
  return {
    id: row.id,
    designId: Number(row.design_id),
    modelHash: row.model_hash,
    engineHash: row.engine_hash,
    status: row.status,
    createdBy: Number(row.created_by),
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    input: row.input_snapshot,
    progress: {
      completedStageTrials: Number(row.completed_trials),
      maximumStages: Number(row.maximum_stages),
    },
    result,
    report: {
      available: Boolean(row.report_generated_at && row.report_filename),
      filename: row.report_filename ?? null,
      sha256: row.report_sha256 ?? null,
      generatedAt: row.report_generated_at
        ? new Date(row.report_generated_at).toISOString()
        : null,
      downloadUrl: row.report_generated_at
        ? `/api/ecr-pre-pilot/designs/${Number(row.design_id)}/predictive-nt/jobs/${row.id}/report`
        : null,
    },
    error: row.error,
  };
}

async function recordHistory(client: any, row: any, details: Record<string, unknown> = {}) {
  await client.query(
    `INSERT INTO ecr_pre_pilot_predictive_nt_job_history
       (job_id, input_snapshot, model_hash, engine_hash, status,
        completed_trials, maximum_stages, worker_owner, attempt_count,
        result_snapshot, error, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      row.id, row.input_snapshot, row.model_hash, row.engine_hash, row.status,
      row.completed_trials, row.maximum_stages, row.worker_owner,
      row.attempt_count, row.result_snapshot, row.error, details,
    ],
  );
}

async function claimNextJob() {
  const claimToken = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `WITH candidate AS (
         SELECT id, status AS previous_status
           FROM ecr_pre_pilot_predictive_nt_jobs
          WHERE (
                  status = 'pending'
                  OR (status = 'running' AND lease_expires_at < NOW())
                )
            AND (
                  input_snapshot->>'_runtimeTestOwner' IS NULL
                  OR input_snapshot->>'_runtimeTestOwner' = $4
                )
          ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
       UPDATE ecr_pre_pilot_predictive_nt_jobs AS job
          SET status = 'running',
              worker_owner = $1,
              claim_token = $2,
              attempt_count = attempt_count + 1,
              lease_expires_at = NOW() + ($3 * INTERVAL '1 millisecond'),
              started_at = COALESCE(started_at, NOW()),
              completed_at = NULL,
              updated_at = NOW()
         FROM candidate
        WHERE job.id = candidate.id
      RETURNING job.*, candidate.previous_status`,
      [WORKER_OWNER, claimToken, LEASE_MS, WORKER_OWNER],
    );
    const row = claimed.rows[0];
    if (row) await recordHistory(client, row, {
      event: row.previous_status === 'running' ? 'stale_job_reclaimed' : 'job_claimed',
      previousStatus: row.previous_status,
      claimToken,
    });
    await client.query('COMMIT');
    return row ? { row, claimToken } : null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateProgress(jobId: string, claimToken: string, completed: number, maximum: number) {
  const updated = await pool.query(
    `UPDATE ecr_pre_pilot_predictive_nt_jobs
        SET completed_trials = GREATEST(completed_trials, $3),
            maximum_stages = $4,
            lease_expires_at = NOW() + ($5 * INTERVAL '1 millisecond'),
            updated_at = NOW()
      WHERE id = $1 AND status = 'running' AND claim_token = $2
      RETURNING *`,
    [jobId, claimToken, completed, maximum, LEASE_MS],
  );
  if (updated.rows[0]) await recordHistory(pool, updated.rows[0], { event: 'progress' });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function persistTrialCheckpoint(
  jobId: string,
  claimToken: string,
  stageCount: number,
  payloadHash: string,
  canonicalPayload: string,
) {
  if (!/^[a-f0-9]{64}$/.test(payloadHash) || canonicalPayload.length > 10_000_000) {
    throw new Error('PREDICTIVE_NT_CHECKPOINT_INVALID');
  }
  if (createHash('sha256').update(canonicalPayload).digest('hex') !== payloadHash) {
    throw new Error('PREDICTIVE_NT_CHECKPOINT_HASH_MISMATCH');
  }
  let payload: any;
  try {
    payload = JSON.parse(canonicalPayload);
  } catch {
    throw new Error('PREDICTIVE_NT_CHECKPOINT_INVALID');
  }
  const canonicalTrial = payload?.trialCanonical;
  const trialHash = payload?.trialHash;
  const continuationState = payload?.continuationState;
  const continuationStageCount = payload?.continuationStageCount;
  if (
    typeof canonicalTrial !== 'string'
    || !/^[a-f0-9]{64}$/.test(trialHash)
    || createHash('sha256').update(canonicalTrial).digest('hex') !== trialHash
    || !continuationState
  ) {
    throw new Error('PREDICTIVE_NT_CHECKPOINT_HASH_MISMATCH');
  }
  let trial: any;
  try {
    trial = JSON.parse(canonicalTrial);
  } catch {
    throw new Error('PREDICTIVE_NT_CHECKPOINT_INVALID');
  }
  if (!Number.isInteger(stageCount) || stageCount < 1 || trial?.stageCount !== stageCount) {
    throw new Error('PREDICTIVE_NT_CHECKPOINT_SEQUENCE_INVALID');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT job.*, design.project_number
         FROM ecr_pre_pilot_predictive_nt_jobs AS job
         JOIN ecr_pre_pilot_designs AS design ON design.id = job.design_id
        WHERE job.id = $1 AND job.status = 'running' AND job.claim_token = $2
        FOR UPDATE`,
      [jobId, claimToken],
    );
    const row = locked.rows[0];
    if (!row) throw new Error('PREDICTIVE_NT_CHECKPOINT_STALE_OWNER');
    const sevenComponent = isSevenComponentInput(row.input_snapshot);
    const expectedProtocol = validatePredictiveNtCheckpointContract(
      row.input_snapshot,
      sevenComponent ? payload.protocol : 'ACK_V2',
      sevenComponent ? payload.engineContractVersion : null,
    );
    if (
      usesSimultaneousSevenComponentCascade(row.input_snapshot)
      && (
        !Number.isInteger(continuationStageCount)
        || continuationStageCount < 0
        || continuationStageCount > stageCount
      )
    ) throw new Error('PREDICTIVE_NT_7C_CONTINUATION_LINEAGE_INVALID');
    if (
      sevenComponent
      && (
        payload.engineContractVersion !== row.input_snapshot.engineContractVersion
        || canonicalJson(payload.componentOrder) !== canonicalJson(SEVEN_COMPONENT_ORDER)
      )
    ) throw new Error('PREDICTIVE_NT_CROSS_ENGINE_CHECKPOINT_FORBIDDEN');
    const existingResult = row.result_snapshot && typeof row.result_snapshot === 'object'
      ? row.result_snapshot as Record<string, any>
      : {};
    const existingTrials = Array.isArray(existingResult.trials) ? [...existingResult.trials] : [];
    const existingHashes = Array.isArray(existingResult.checkpoint?.trialHashes)
      ? [...existingResult.checkpoint.trialHashes]
      : [];
    const existingCanonicals = Array.isArray(existingResult.checkpoint?.trialCanonicals)
      ? [...existingResult.checkpoint.trialCanonicals]
      : [];
    const existingPayloadHashes = Array.isArray(existingResult.checkpoint?.payloadHashes)
      ? [...existingResult.checkpoint.payloadHashes]
      : [];
    const existingPayloadCanonicals = Array.isArray(existingResult.checkpoint?.payloadCanonicals)
      ? [...existingResult.checkpoint.payloadCanonicals]
      : [];
    const completed = Number(row.completed_trials);
    const singleTestStage = Number(row.input_snapshot?.ntTest);
    const checkpointOrdinal = Number.isInteger(singleTestStage) ? 1 : stageCount;

    if (checkpointOrdinal <= completed) {
      if (
        existingHashes[checkpointOrdinal - 1] !== trialHash
        || existingPayloadHashes[checkpointOrdinal - 1] !== payloadHash
      ) {
        throw new Error('PREDICTIVE_NT_CHECKPOINT_REPLAY_MISMATCH');
      }
      await client.query('COMMIT');
      return;
    }
    if (checkpointOrdinal !== completed + 1 || existingTrials.length !== completed) {
      throw new Error('PREDICTIVE_NT_CHECKPOINT_SEQUENCE_INVALID');
    }

    existingTrials.push(trial);
    existingHashes.push(trialHash);
    const checkpointResult = attachStage1ResultGovernance({
      status: 'RUNNING',
      predictiveNt: null,
      establishedTheoreticalStages: null,
      releaseEligible: false,
      calibrationRequired: true,
      trials: existingTrials,
      checkpoint: {
        protocol: expectedProtocol,
        engineContractVersion: sevenComponent
          ? row.input_snapshot.engineContractVersion
          : '6C-LEGACY',
        acknowledgedStageCount: checkpointOrdinal,
        trialHashes: existingHashes,
        trialCanonicals: [...existingCanonicals, canonicalTrial],
        payloadHashes: [...existingPayloadHashes, payloadHash],
        payloadCanonicals: [...existingPayloadCanonicals, canonicalPayload],
        latestContinuationState: continuationState,
        latestContinuationStageCount: Number.isInteger(singleTestStage)
          ? 0
          : usesSimultaneousSevenComponentCascade(row.input_snapshot)
          ? continuationStageCount
          : stageCount,
        inputHash: createHash('sha256').update(canonicalJson(row.input_snapshot)).digest('hex'),
        modelHash: row.model_hash,
        engineHash: row.engine_hash,
      },
    }, row.input_snapshot, { allowAckCheckpoint: true });
    const updated = await client.query(
      `UPDATE ecr_pre_pilot_predictive_nt_jobs
          SET completed_trials = $3,
              result_snapshot = $4,
              lease_expires_at = NOW() + ($5 * INTERVAL '1 millisecond'),
              updated_at = NOW()
        WHERE id = $1 AND status = 'running' AND claim_token = $2
        RETURNING *`,
      [jobId, claimToken, checkpointOrdinal, checkpointResult, LEASE_MS],
    );
    if (!updated.rows[0]) throw new Error('PREDICTIVE_NT_CHECKPOINT_STALE_OWNER');
    await recordHistory(client, updated.rows[0], {
      event: 'trial_checkpoint_acknowledged',
      stageCount,
      trialHash,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function buildResumeRequest(job: PredictiveNtJob) {
  const result = job.result as any;
  const checkpoint = result?.checkpoint;
  const completed = job.progress.completedStageTrials;
  if (completed === 0) return null;
  const sevenComponent = isSevenComponentInput(job.input);
  const expectedProtocol = validatePredictiveNtCheckpointContract(
    job.input,
    checkpoint?.protocol,
    checkpoint?.engineContractVersion,
  );
  if (
    checkpoint.acknowledgedStageCount !== completed
    || checkpoint.inputHash !== createHash('sha256').update(canonicalJson(job.input)).digest('hex')
    || checkpoint.modelHash !== job.modelHash
    || checkpoint.engineHash !== job.engineHash
    || !Array.isArray(result?.trials)
    || !Array.isArray(checkpoint.trialHashes)
    || !Array.isArray(checkpoint.trialCanonicals)
    || !Array.isArray(checkpoint.payloadHashes)
    || !Array.isArray(checkpoint.payloadCanonicals)
    || result.trials.length !== completed
    || checkpoint.trialHashes.length !== completed
    || checkpoint.trialCanonicals.length !== completed
    || checkpoint.payloadHashes.length !== completed
    || checkpoint.payloadCanonicals.length !== completed
    || !checkpoint.latestContinuationState
    || (
      usesSimultaneousSevenComponentCascade(job.input)
      && (
        !Number.isInteger(checkpoint.latestContinuationStageCount)
        || checkpoint.latestContinuationStageCount < 0
        || checkpoint.latestContinuationStageCount > completed
      )
    )
  ) {
    throw new Error('PREDICTIVE_NT_RESUME_CHECKPOINT_INVALID');
  }
  for (let index = 0; index < completed; index += 1) {
    const canonical = checkpoint.trialCanonicals[index];
    const canonicalPayload = checkpoint.payloadCanonicals[index];
    let payload;
    try {
      payload = JSON.parse(canonicalPayload);
    } catch {
      throw new Error('PREDICTIVE_NT_RESUME_CHECKPOINT_HASH_MISMATCH');
    }
    if (
      typeof canonical !== 'string'
      || typeof canonicalPayload !== 'string'
      || createHash('sha256').update(canonical).digest('hex') !== checkpoint.trialHashes[index]
      || createHash('sha256').update(canonicalPayload).digest('hex') !== checkpoint.payloadHashes[index]
      || payload.trialCanonical !== canonical
      || payload.trialHash !== checkpoint.trialHashes[index]
      || canonicalJson(JSON.parse(canonical)) !== canonicalJson(result.trials[index])
      || (
        index === completed - 1
        && (
          canonicalJson(payload.continuationState)
            !== canonicalJson(checkpoint.latestContinuationState)
          || (
            usesSimultaneousSevenComponentCascade(job.input)
            && payload.continuationStageCount !== checkpoint.latestContinuationStageCount
          )
        )
      )
    ) {
      throw new Error('PREDICTIVE_NT_RESUME_CHECKPOINT_HASH_MISMATCH');
    }
  }
  return {
    engineContractVersion: sevenComponent
      ? job.input.engineContractVersion
      : '6C-LEGACY',
    acknowledgedStageCount: completed,
    trials: result.trials,
    continuationState: checkpoint.latestContinuationState,
    continuationStageCount: usesSimultaneousSevenComponentCascade(job.input)
      ? checkpoint.latestContinuationStageCount
      : completed,
  };
}

async function renewLease(jobId: string, claimToken: string) {
  const renewed = await pool.query(
    `UPDATE ecr_pre_pilot_predictive_nt_jobs
        SET lease_expires_at = NOW() + ($3 * INTERVAL '1 millisecond'),
            updated_at = NOW()
      WHERE id = $1 AND status = 'running' AND claim_token = $2`,
    [jobId, claimToken, LEASE_MS],
  );
  return (renewed.rowCount ?? 0) === 1;
}

async function finishJob(
  jobId: string,
  claimToken: string,
  status: 'completed' | 'failed',
  result: unknown,
  error: string | null,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM ecr_pre_pilot_predictive_nt_jobs
        WHERE id = $1 AND status = 'running' AND claim_token = $2
        FOR UPDATE`,
      [jobId, claimToken],
    );
    const current = locked.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return;
    }
    const checkpointTrials = Array.isArray(current.result_snapshot?.trials)
      ? current.result_snapshot.trials
      : [];
    const checkpointHashes = Array.isArray(current.result_snapshot?.checkpoint?.trialHashes)
      ? current.result_snapshot.checkpoint.trialHashes
      : [];
    const suppliedTrials = result && typeof result === 'object' && Array.isArray((result as any).trials)
      ? (result as any).trials
      : [];
    const suppliedMatchesCheckpoints = checkpointTrials.every(
      (trial: unknown, index: number) => (
        canonicalJson(suppliedTrials[index]) === canonicalJson(trial)
      ),
    );
    const blockedPhaseResult = (
      result
      && typeof result === 'object'
      && ['BLOCKED_NO_LIQUID_SPLIT', 'BLOCKED_PHASE_TOPOLOGY_UNRESOLVED']
        .includes((result as any).executionStatus)
    );
    const expectedTerminalTrials = blockedPhaseResult
      ? Number((result as any).blockedCascadeTrialCount) - 1
      : Number(current.maximum_stages);
    let finalStatus = status;
    let finalError = error;
    if (
      status === 'completed'
      && (
        !Number.isInteger(expectedTerminalTrials)
        || expectedTerminalTrials < 0
        || Number(current.completed_trials) !== expectedTerminalTrials
        || checkpointHashes.length !== expectedTerminalTrials
        || suppliedTrials.length !== expectedTerminalTrials
        || !suppliedMatchesCheckpoints
      )
    ) {
      const firstMismatchedTrial = checkpointTrials.findIndex(
        (trial: unknown, index: number) => canonicalJson(suppliedTrials[index]) !== canonicalJson(trial),
      );
      console.error('[Predictive N_T] Final checkpoint mismatch', {
        jobId,
        completedTrials: Number(current.completed_trials),
        maximumStages: Number(current.maximum_stages),
        checkpointHashCount: checkpointHashes.length,
        checkpointTrialCount: checkpointTrials.length,
        suppliedTrialCount: suppliedTrials.length,
        firstMismatchedTrial,
        suppliedTrialHash: firstMismatchedTrial >= 0
          ? createHash('sha256').update(canonicalJson(suppliedTrials[firstMismatchedTrial])).digest('hex')
          : null,
        checkpointTrialHash: firstMismatchedTrial >= 0
          ? createHash('sha256').update(canonicalJson(checkpointTrials[firstMismatchedTrial])).digest('hex')
          : null,
      });
      finalStatus = 'failed';
      finalError = 'PREDICTIVE_NT_FINAL_CHECKPOINT_MISMATCH';
    }
    let finalResult = result && typeof result === 'object'
      ? {
        ...(result as Record<string, unknown>),
        trials: suppliedMatchesCheckpoints
          && suppliedTrials.length >= checkpointTrials.length
          ? (result as any).trials
          : checkpointTrials,
        checkpoint: current.result_snapshot?.checkpoint,
      }
      : current.result_snapshot;
    try {
      finalResult = finalStatus === 'completed'
        ? attachStage1ResultGovernance(finalResult, current.input_snapshot)
        : terminalFailureEvidence(finalResult, current.input_snapshot, finalError);
    } catch (evidenceError) {
      finalStatus = 'failed';
      finalError = `PREDICTIVE_NT_TERMINAL_EVIDENCE_INVALID: ${
        evidenceError instanceof Error ? evidenceError.message : String(evidenceError)
      }`;
      // A malformed worker payload is never authoritative on a failed job.
      finalResult = terminalFailureEvidence(null, current.input_snapshot, finalError);
    }
    let reportPdf: Buffer | null = null;
    let reportFilename: string | null = null;
    let reportSha256: string | null = null;
    const terminalCompletedAt = current.completed_at ?? new Date();
    if (finalStatus === 'completed') {
      try {
        if (
          process.env.NODE_ENV === 'test'
          && runtimeTestHooks.get(jobId)?.forceReportGenerationFailure === true
        ) {
          throw new Error('PREDICTIVE_NT_TEST_FORCED_REPORT_GENERATION_FAILURE');
        }
        reportPdf = await generatePredictiveNtReport({
          id: current.id,
          projectNumber: Number(current.project_number),
          modelHash: current.model_hash,
          engineHash: current.engine_hash,
          completedAt: terminalCompletedAt,
          input: current.input_snapshot,
          result: finalResult,
        });
        reportFilename = `Project-${Number(current.project_number)}-Predictive-NT-Run-${current.id}.pdf`;
        reportSha256 = createHash('sha256').update(reportPdf).digest('hex');
      } catch (reportError) {
        finalStatus = 'failed';
        finalError = `PREDICTIVE_NT_REPORT_GENERATION_FAILED: ${
          reportError instanceof Error ? reportError.message : String(reportError)
        }`;
        finalResult = terminalFailureEvidence(finalResult, current.input_snapshot, finalError);
      }
    }
    const updated = await client.query(
      `UPDATE ecr_pre_pilot_predictive_nt_jobs
          SET status = $3, result_snapshot = $4, error = $5,
               report_pdf = $6, report_filename = $7, report_sha256 = $8,
                report_generated_at = CASE WHEN $6::bytea IS NULL THEN NULL ELSE $9::timestamptz END,
                completed_at = $9::timestamptz, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'running' AND claim_token = $2
        RETURNING *`,
      [
        jobId, claimToken, finalStatus, finalResult, finalError,
        reportPdf, reportFilename, reportSha256, terminalCompletedAt,
      ],
    );
    if (updated.rows[0]) await recordHistory(client, updated.rows[0], { event: 'finished' });
    await client.query('COMMIT');
  } catch (failure) {
    await client.query('ROLLBACK');
    throw failure;
  } finally {
    client.release();
  }
}

function execute(job: PredictiveNtJob, claimToken: string) {
  const script = workerScript(job.input);
  let engineHash: string;
  try {
    engineHash = currentPredictiveNtEngineHash(job.input);
  } catch (error) {
    void finishJob(job.id, claimToken, 'failed', job.result, (error as Error).message)
      .finally(() => { workerBusy = false; });
    return;
  }
  const evidenceError = validatePredictiveNtExecutionEvidence(job, engineHash);
  if (evidenceError) {
    console.error('[Predictive N_T] Execution evidence mismatch', {
      jobId: job.id,
      persistedEngineHash: job.engineHash,
      currentEngineHash: engineHash,
      persistedModelHash: job.modelHash,
      inputModelHash: job.input.modelHash,
       currentModelHash: isReplacementSevenComponentInput(job.input)
         ? PRE_PILOT_MULTISTAGE_MODEL.modelHash
         : PRE_PILOT_MODEL.modelHash,
      runtimeRoot: runtimeRoot(job.input),
    });
    void finishJob(job.id, claimToken, 'failed', null, evidenceError)
      .finally(() => { workerBusy = false; });
    return;
  }
  try {
    validatePredictiveNtJobInput(job.input, (relativePath) =>
      fs.readFileSync(path.join(runtimeRoot(job.input), relativePath)));
  } catch (error) {
    void finishJob(job.id, claimToken, 'failed', job.result, (error as Error).message)
      .finally(() => { workerBusy = false; });
    return;
  }

  let resumeRequest;
  try {
    resumeRequest = buildResumeRequest(job);
  } catch (error) {
    void finishJob(job.id, claimToken, 'failed', job.result, (error as Error).message)
      .finally(() => { workerBusy = false; });
    return;
  }
  const child = spawn('python3.12', [script], {
    cwd: runtimeRoot(job.input),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  activeWorkerChildren.set(job.id, child);
  let stdout = '';
  let stderr = '';
  let stderrLineBuffer = '';
  let timedOut = false;
  let checkpointFailure: Error | null = null;
  let simulatedRestart = false;
  let checkpointQueue = Promise.resolve();
  const heartbeat = setInterval(() => {
    void renewLease(job.id, claimToken)
      .then((renewed) => {
        if (!renewed && child.exitCode === null && child.signalCode === null) {
          child.kill('SIGTERM');
          const forceStop = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          }, 2_000);
          forceStop.unref();
        }
      })
      .catch((error) => console.error('[Predictive N_T] Lease renewal failed:', error));
  }, Math.floor(LEASE_MS / 3));
  heartbeat.unref();
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, JOB_TIMEOUT_MS);

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
    if (stdout.length > 20_000_000) child.kill('SIGKILL');
  });
  child.stderr.on('data', (chunk) => {
    const text = String(chunk);
    stderrLineBuffer += text;
    const lines = stderrLineBuffer.split('\n');
    stderrLineBuffer = lines.pop() ?? '';
    for (const line of lines) {
      const checkpoint = /^PREDICTIVE_NT_CHECKPOINT\s+(\d+)\s+([a-f0-9]{64})\s+([A-Za-z0-9+/=]+)$/.exec(line);
      if (checkpoint) {
        const stageCount = Number(checkpoint[1]);
        const payloadHash = checkpoint[2];
        const canonicalPayload = Buffer.from(checkpoint[3], 'base64').toString('utf8');
        checkpointQueue = checkpointQueue
          .then(() => persistTrialCheckpoint(
            job.id,
            claimToken,
            stageCount,
            payloadHash,
            canonicalPayload,
          ))
          .then(async () => {
            const testHooks = runtimeTestHooks.get(job.id);
            if (
              process.env.NODE_ENV === 'test'
              && testHooks?.replayMismatchAtStage === stageCount
            ) {
              const mismatchedPayload = canonicalPayload.replace(/}$/, ',"testReplayMismatch":true}');
              const mismatchedHash = createHash('sha256').update(mismatchedPayload).digest('hex');
              await persistTrialCheckpoint(
                job.id,
                claimToken,
                stageCount,
                mismatchedHash,
                mismatchedPayload,
              );
            }
            if (!child.killed) {
              child.stdin.write(`PREDICTIVE_NT_ACK ${stageCount} ${payloadHash}\n`);
              if (
                process.env.NODE_ENV === 'test'
                && testHooks?.restartAfterAcknowledgedStage === stageCount
              ) {
                simulatedRestart = true;
                delete testHooks.restartAfterAcknowledgedStage;
                child.kill('SIGKILL');
                return;
              }
              if (
                process.env.NODE_ENV === 'test'
                && testHooks?.killAfterAcknowledgedStage === stageCount
              ) {
                checkpointFailure = new Error('PREDICTIVE_NT_TEST_TERMINATED_AFTER_ACK');
                child.kill('SIGKILL');
              }
            }
          })
          .catch((error) => {
            checkpointFailure = error instanceof Error ? error : new Error(String(error));
            child.kill('SIGKILL');
          });
        continue;
      }
      stderr += `${line}\n`;
      const progress = /^PREDICTIVE_NT_PROGRESS\s+(\d+)\s+(\d+)$/.exec(line);
      if (!progress) continue;
      job.progress = {
        completedStageTrials: Number(progress[1]),
        maximumStages: Number(progress[2]),
      };
    }
    if (stderr.length > 1_000_000) stderr = stderr.slice(-1_000_000);
  });
  child.on('error', (error) => {
    stderr = error.message;
  });
  child.stdin.on('error', (error) => {
    if (!checkpointFailure) checkpointFailure = error;
  });
  child.on('close', async (code) => {
    if (activeWorkerChildren.get(job.id) === child) {
      activeWorkerChildren.delete(job.id);
    }
    clearTimeout(timeout);
    clearInterval(heartbeat);
    await checkpointQueue;
    if (simulatedRestart) {
      await pool.query(
        `UPDATE ecr_pre_pilot_predictive_nt_jobs
            SET lease_expires_at = NOW() - INTERVAL '1 second'
          WHERE id = $1 AND status = 'running' AND claim_token = $2`,
        [job.id, claimToken],
      );
      workerBusy = false;
      void pollWorker();
      return;
    }
    if (stderrLineBuffer) stderr += stderrLineBuffer;
    let result: unknown = null;
    try {
      result = stdout ? JSON.parse(stdout) : null;
      const finalPayloadTestHooks = runtimeTestHooks.get(job.id);
      if (
        process.env.NODE_ENV === 'test'
        && finalPayloadTestHooks?.replaceFinalPayloadWithRunningAck === true
        && result && typeof result === 'object'
      ) {
        result = {
          ...(result as Record<string, unknown>),
          status: 'RUNNING',
          checkpoint: { protocol: 'ACK_V2' },
        };
      }
      result = attachStage1ResultGovernance(result, job.input);
    } catch (resultError) {
      checkpointFailure = resultError instanceof Error
        ? new Error(`PREDICTIVE_NT_RESULT_INVALID: ${resultError.message}`)
        : new Error(`PREDICTIVE_NT_RESULT_INVALID: ${String(resultError)}`);
      result = null;
    }
    const status = code === 0 && !checkpointFailure ? 'completed' : 'failed';
    const error = status === 'completed' ? null : timedOut
      ? 'PREDICTIVE_NT_JOB_TIMEOUT'
      : (
        checkpointFailure?.message
        || (
        (result as { error?: string } | null)?.error
        || stderr.trim()
        || `Python worker exited with code ${code}`
        )
      );
    try {
      await finishJob(job.id, claimToken, status, result, error);
    } catch (failure) {
      console.error('[Predictive N_T] Completion persistence failed:', failure);
    } finally {
      runtimeTestHooks.delete(job.id);
      workerBusy = false;
    }
  });
  child.stdin.write(`${JSON.stringify({
    ...job.input,
    engineHash,
    _checkpointProtocol: predictiveNtCheckpointProtocol(job.input),
    _resume: resumeRequest,
  })}\n`);
}

async function pollWorker() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const claimed = await claimNextJob();
    if (!claimed) {
      workerBusy = false;
      return;
    }
    execute(mapJob(claimed.row), claimed.claimToken);
  } catch (error) {
    workerBusy = false;
    console.error('[Predictive N_T] Queue poll failed:', error);
  }
}

export function startPredictiveNtWorker() {
  if (workerStarted) return;
  preflightPredictiveNtRuntime();
  workerStarted = true;
  const timer = setInterval(() => void pollWorker(), POLL_MS);
  timer.unref();
  void pollWorker();
}

async function enqueueRawPredictiveNtJob(
  input: PredictiveNtJobInput,
  userId: number,
  designId: number,
  testHooks?: RuntimeTestHooks,
  runtimeTestOwner = false,
) {
  const gate = validatePredictiveNtJobInput(input);
  const engineHash = currentPredictiveNtEngineHash(input);
  const selectedModelHash = isReplacementSevenComponentInput(input)
    ? PRE_PILOT_MULTISTAGE_MODEL.modelHash
    : PRE_PILOT_MODEL.modelHash;
  const immutableInput = {
    ...input,
    modelHash: selectedModelHash,
    ...(runtimeTestOwner || testHooks ? { _runtimeTestOwner: WORKER_OWNER } : {}),
  };
  const jobId = randomUUID();
  const client = await pool.connect();
  let job: PredictiveNtJob;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('ecr_pre_pilot_predictive_nt_enqueue'))`);
    const design = await client.query(
      `SELECT id FROM ecr_pre_pilot_designs WHERE id = $1 AND created_by = $2`,
      [designId, userId],
    );
    if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
    const counts = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE created_by = $1)::int AS user_total
         FROM ecr_pre_pilot_predictive_nt_jobs
        WHERE status IN ('pending', 'running')`,
      [userId],
    );
    if (counts.rows[0].total >= MAX_QUEUED_JOBS) throw new Error('PREDICTIVE_NT_QUEUE_FULL');
    if (counts.rows[0].user_total >= MAX_ACTIVE_JOBS_PER_USER) {
      throw new Error('PREDICTIVE_NT_USER_JOB_LIMIT');
    }
    const inserted = await client.query(
      `INSERT INTO ecr_pre_pilot_predictive_nt_jobs
         (id, design_id, created_by, input_snapshot, model_hash, engine_hash,
          maximum_stages)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        jobId, designId, userId, immutableInput, selectedModelHash,
        engineHash, input.maximumStages ?? 10,
      ],
    );
    await recordHistory(client, inserted.rows[0], { event: 'enqueued' });
    await client.query('COMMIT');
    job = mapJob(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (testHooks) runtimeTestHooks.set(job.id, testHooks);
  startPredictiveNtWorker();
  return {
    jobId: job.id,
    status: job.status,
    model: isReplacementSevenComponentInput(input)
      ? PRE_PILOT_MULTISTAGE_MODEL
      : PRE_PILOT_MODEL,
    gate,
  };
}

export async function enqueuePredictiveNtRuntimeTestJob(
  input: unknown,
  userId: number,
  designId: number,
  testHooks?: RuntimeTestHooks,
) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('RAW_PREDICTIVE_NT_ENQUEUE_DISABLED');
  }
  return enqueueRawPredictiveNtJob(input as PredictiveNtJobInput, userId, designId, testHooks, true);
}

export async function enqueuePredictiveNtJobFromSavedStage1(
  userId: number,
  designId: number,
  ntTest: number = 7,
) {
  const jobId = randomUUID();
  const client = await pool.connect();
  let job: PredictiveNtJob;
  let gate: ReturnType<typeof validatePredictiveNtJobInput>;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('ecr_pre_pilot_predictive_nt_enqueue'))`);
    const design = await client.query<{
      id: number;
      project_number: number;
      input_data: unknown;
    }>(
      `SELECT id, project_number, input_data
         FROM ecr_pre_pilot_designs
        WHERE id = $1 AND created_by = $2
        FOR SHARE`,
      [designId, userId],
    );
    if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
    const derivedInput = derivePredictiveNtInputFromStage1(
      design.rows[0].input_data,
      Number(design.rows[0].project_number),
    );
    if (!Number.isInteger(ntTest) || ntTest < 1 || ntTest > 10) {
      throw new Error('INVALID_NT_TEST');
    }
    const input = { ...derivedInput, ntTest };
    gate = validatePredictiveNtJobInput(input);
    const engineHash = currentPredictiveNtEngineHash(input);
    const immutableInput = { ...input, modelHash: PRE_PILOT_MULTISTAGE_MODEL.modelHash };
    const counts = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE created_by = $1)::int AS user_total
         FROM ecr_pre_pilot_predictive_nt_jobs
        WHERE status IN ('pending', 'running')`,
      [userId],
    );
    if (counts.rows[0].total >= MAX_QUEUED_JOBS) throw new Error('PREDICTIVE_NT_QUEUE_FULL');
    if (counts.rows[0].user_total >= MAX_ACTIVE_JOBS_PER_USER) {
      throw new Error('PREDICTIVE_NT_USER_JOB_LIMIT');
    }
    const inserted = await client.query(
      `INSERT INTO ecr_pre_pilot_predictive_nt_jobs
         (id, design_id, created_by, input_snapshot, model_hash, engine_hash,
          maximum_stages)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        jobId, designId, userId, immutableInput, PRE_PILOT_MULTISTAGE_MODEL.modelHash,
        engineHash, 1,
      ],
    );
    await recordHistory(client, inserted.rows[0], {
      event: 'enqueued_from_saved_stage1',
      stage1SnapshotHash: input.stage1Authority?.snapshotHash,
      stage1SavedAt: input.stage1Authority?.savedAt,
    });
    await client.query('COMMIT');
    job = mapJob(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  startPredictiveNtWorker();
  return {
    jobId: job.id,
    status: job.status,
    model: PRE_PILOT_MULTISTAGE_MODEL,
    gate,
    stage1Authority: job.input.stage1Authority,
  };
}

export async function getPredictiveNtJob(jobId: string, userId: number, designId: number) {
  const found = await pool.query(
    `SELECT * FROM ecr_pre_pilot_predictive_nt_jobs
      WHERE id = $1 AND created_by = $2 AND design_id = $3`,
    [jobId, userId, designId],
  );
  return found.rows[0] ? mapJob(found.rows[0]) : null;
}

export async function getLatestPredictiveNtJob(userId: number, designId: number) {
  const found = await pool.query(
    `SELECT * FROM ecr_pre_pilot_predictive_nt_jobs
      WHERE created_by = $1 AND design_id = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, designId],
  );
  return found.rows[0] ? mapJob(found.rows[0]) : null;
}

export async function stopPredictiveNtJob(jobId: string, userId: number, designId: number) {
  const client = await pool.connect();
  let stopped: PredictiveNtJob | null = null;
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT *
         FROM ecr_pre_pilot_predictive_nt_jobs
        WHERE id = $1 AND created_by = $2 AND design_id = $3
        FOR UPDATE`,
      [jobId, userId, designId],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }
    if (!['pending', 'running'].includes(row.status)) {
      await client.query('COMMIT');
      return mapJob(row);
    }
    const updated = await client.query(
      `UPDATE ecr_pre_pilot_predictive_nt_jobs
          SET status = 'failed',
              error = 'PREDICTIVE_NT_STOPPED_BY_USER',
              worker_owner = NULL,
              claim_token = NULL,
              lease_expires_at = NULL,
              completed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [jobId],
    );
    await recordHistory(client, updated.rows[0], { event: 'stopped_by_user' });
    await client.query('COMMIT');
    stopped = mapJob(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const child = activeWorkerChildren.get(jobId);
  if (child && !child.killed) {
    child.kill('SIGTERM');
    const forceStop = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 2_000);
    forceStop.unref();
  }
  return stopped;
}

export async function getPredictiveNtJobReport(
  jobId: string,
  userId: number,
  designId: number,
) {
  const found = await pool.query(
    `SELECT report_pdf, report_filename, report_sha256
       FROM ecr_pre_pilot_predictive_nt_jobs
      WHERE id = $1 AND created_by = $2 AND design_id = $3
        AND status = 'completed' AND report_generated_at IS NOT NULL`,
    [jobId, userId, designId],
  );
  if (!found.rows[0]?.report_pdf) return null;
  return {
    pdf: Buffer.from(found.rows[0].report_pdf),
    filename: String(found.rows[0].report_filename),
    sha256: String(found.rows[0].report_sha256),
  };
}