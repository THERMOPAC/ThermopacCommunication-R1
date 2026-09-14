/**
 * Architect-review-only offline convergence diagnostic. It is one frozen
 * design-269 coarse (5 physical compartments × 2 FV cells) solve using the
 * existing Stage-4 solveMesh closure. It does not call the production sizing
 * lifecycle, count sweep, refinement, or coefficient sensitivity route.
 *
 * Do not launch automatically. After architect review, launch as a managed
 * background task (not a detached `timeout` shell) with:
 *   FROZEN_COARSE_DIAGNOSTIC_ARCHITECT_APPROVED=YES \
 *     npx tsx research/design269-stage4-five-compartment-actual-profile.ts
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pool } from '../server/db';
import { loadStage4PrePilotSizingAuthority } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';
import {
  compareStage4FrozenCoarseReproductionEndpoints,
  prepareStage4FrozenCoarseIndependentDonorSeed,
  runStage4FrozenCoarseDiagnostic,
  stage4FrozenCoarseReproductionComparisonSpecification,
  type Stage4FrozenCoarseDiagnosticResult,
  type Stage4FrozenCoarseIteration,
  type Stage4PhysicalSizingProgress,
} from '../server/ecr-pre-pilot/stage4-predictive-physical-sizing';
import {
  sameFrozenDiagnosticIdentity,
  snapshotSourceAndWorkerIdentity,
} from './design269-stage4-frozen-diagnostic-identity';

const DESIGN_ID = 269;
const PHYSICAL_COMPARTMENTS = 5;
const COARSE_CELLS_PER_PHYSICAL_COMPARTMENT = 2;
const SOLVER_CAP_MS = 3_600_000;
const OUT = 'research/design269-stage4-frozen-coarse-mesh-convergence-diagnostic.json';
const hash = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const fileHash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
};

type Attempt = {
  status: string;
  initialization: Record<string, unknown>;
  trace: Stage4FrozenCoarseIteration[];
  finalCompletedIterationState: Stage4FrozenCoarseIteration | null;
  latestTelemetry: Stage4PhysicalSizingProgress | null;
  result: Stage4FrozenCoarseDiagnosticResult | null;
  error: string | null;
};

async function main() {
  const harnessStarted = performance.now();
  let status = 'AUTHORITY_LOADING_READ_ONLY_OWNER_SCOPED';
  let latestTelemetry: Stage4PhysicalSizingProgress | null = null;
  const telemetry: Stage4PhysicalSizingProgress[] = [];
  let terminating = false;
  let authority: Record<string, unknown> | null = null;
  let prelaunchIdentity: ReturnType<typeof snapshotSourceAndWorkerIdentity> | null = null;
  let postrunIdentity: ReturnType<typeof snapshotSourceAndWorkerIdentity> | null = null;
  const attempts: { first: Attempt | null; independentRestart: Attempt | null } = {
    first: null, independentRestart: null,
  };
  const abort = new AbortController();

  const snapshot = () => ({
    schema: 'DESIGN269_STAGE4_FROZEN_COARSE_MESH_CONVERGENCE_DIAGNOSTIC_V1',
    scope: {
      designId: DESIGN_ID,
      physicalCompartments: PHYSICAL_COMPARTMENTS,
      finiteVolumeCellsPerPhysicalCompartment: COARSE_CELLS_PER_PHYSICAL_COMPARTMENT,
      khCoefficient: 0.0126,
      solverCapMs: SOLVER_CAP_MS,
      databaseAccess: 'READ_ONLY_OWNER_SCOPED_AUTHORITY',
      noProductionCalculationPersistence: true,
      noStage2OrStage3Execution: true,
      actualPinnedInletLocalEquilibrium: true,
      actualPinnedDogboxInterface: true,
      injectedEvaluators: false,
      noRefinedMesh: true,
      noCoefficientSensitivity: true,
      noCountSearch: true,
      noOptimization: true,
      fullColumnSizingAcceptanceClaimed: false,
      architectReviewRequiredBeforeLaunch: true,
    },
    status,
    timing: {
      checkpointTimestamp: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - harnessStarted),
    },
    authority,
    sourceManifestRefreshGuard: {
      source: 'server/ecr-pre-pilot/stage4-predictive-physical-sizing.ts',
      preDiagnosticHookSha256: '398656082d617001906e832632aebc76169cd672f1cc79a55a21d792d45ccf56',
      postDiagnosticHookSha256: fileHash('server/ecr-pre-pilot/stage4-predictive-physical-sizing.ts'),
      declaredChangeScope: 'additive frozen diagnostic dispatch and observation only',
      numericalEquationChanges: 'NONE_DECLARED; existing solveMesh, cache, gates, 80 iterations, and 2e-6 update tolerance are invoked without replacement',
    },
    prelaunchIdentity,
    postrunIdentity,
    latestTelemetry,
    telemetry,
    attempts,
  });
  const writeCheckpointSync = () => {
    const temporary = `${OUT}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(snapshot(), null, 2)}\n`, 'utf8');
    renameSync(temporary, OUT);
  };
  const logCheckpoint = (event: string) => {
    console.log(JSON.stringify({
      event,
      status,
      elapsedMs: Math.round(performance.now() - harnessStarted),
      operation: latestTelemetry?.telemetry?.operation ?? null,
      iteration: latestTelemetry?.telemetry?.iteration ?? null,
      cellIndex: latestTelemetry?.telemetry?.cellIndex ?? null,
    }));
  };
  const onTerm = () => {
    terminating = true;
    status = 'MANAGED_SIGTERM_CUTOFF_INCOMPLETE_EVIDENCE_RETAINED';
    abort.abort();
    writeCheckpointSync();
    logCheckpoint('MANAGED_SIGTERM_CHECKPOINT_SAVED');
  };
  process.once('SIGTERM', onTerm);

  try {
    status = 'INITIAL_CHECKPOINT_BEFORE_READ_ONLY_AUTHORITY';
    writeCheckpointSync();
    logCheckpoint('INITIAL_CHECKPOINT_SAVED');
    const owner = await pool.query<{ created_by: number }>(
      'SELECT created_by FROM ecr_pre_pilot_designs WHERE id=$1',
      [DESIGN_ID],
    );
    if (!owner.rows[0]) throw new Error('ACTUAL_PROFILE_DESIGN_NOT_FOUND');
    const ownedAuthority = await loadStage4PrePilotSizingAuthority(owner.rows[0].created_by, DESIGN_ID);
    if (ownedAuthority.solverInput.calculatedNt !== PHYSICAL_COMPARTMENTS) {
      throw new Error('ACTUAL_PROFILE_FIVE_COMPARTMENT_BOUND_BELOW_GOVERNED_NT');
    }
    const frozenInput = deepFreeze(JSON.parse(JSON.stringify({
      ...ownedAuthority.solverInput,
      maximumCompartments: PHYSICAL_COMPARTMENTS,
    })));
    const frozenInputSha256 = hash(frozenInput);
    // Construct and gate this alternate independently before the default run.
    // It cannot observe, copy, or be updated from first-run residuals/endpoints.
    const independentSecondStart = prepareStage4FrozenCoarseIndependentDonorSeed(frozenInput);
    const reproductionComparisonSpecification =
      stage4FrozenCoarseReproductionComparisonSpecification(frozenInput);
    authority = {
      authorityAccess: 'READ_ONLY_OWNER_SCOPED_LOAD',
      ownerScopedDesignId: DESIGN_ID,
      lineageHash: ownedAuthority.lineageHash,
      solverInputSha256: hash(frozenInput),
      solverInput: frozenInput,
      calculatedNt: frozenInput.calculatedNt,
      maximumCompartments: frozenInput.maximumCompartments,
      prelaunchIndependentSecondStart: {
        method: independentSecondStart.method,
        donorFraction: independentSecondStart.donorFraction,
        transferStateSha256: hash(independentSecondStart.transfer),
        initialSeparationFromZero: independentSecondStart.initialSeparationFromZero,
        reconstruction: independentSecondStart.reconstruction,
        constructionDependsOnFirstRun: false,
        existingReconstructionAdmissibilityGatePassed: true,
      },
      predeclaredReproductionComparison: {
        ...reproductionComparisonSpecification,
        dependsOnFirstEndpointForSeedConstruction: false,
        purpose: 'comparison only; no state selection, optimization, or feedback',
      },
    };
    prelaunchIdentity = snapshotSourceAndWorkerIdentity('research/design269-stage4-five-compartment-actual-profile.ts');
    status = 'PRELAUNCH_EVIDENCE_FROZEN_REVIEW_REQUIRED';
    writeCheckpointSync();
    logCheckpoint('PRELAUNCH_AUTHORITY_AND_IDENTITIES_FROZEN');
    if (process.env.FROZEN_COARSE_DIAGNOSTIC_ARCHITECT_APPROVED !== 'YES') {
      status = 'AWAITING_ARCHITECT_REVIEW_NO_HEAVY_SOLVE_LAUNCHED';
      writeCheckpointSync();
      logCheckpoint('ARCHITECT_APPROVAL_REQUIRED');
      return;
    }

    const newAttempt = (initialTransfer?: number[][],
      suppliedInitialization?: Record<string, unknown>): Attempt => ({
        status: 'RUNNING',
        initialization: suppliedInitialization ?? (initialTransfer
          ? { method: 'EXACT_PRIOR_SOLVE_MESH_TRANSFER_STATE', syntheticProfile: false }
          : { method: 'EXISTING_ZERO_TRANSFER_DEFAULT', syntheticProfile: false }),
        trace: [],
        finalCompletedIterationState: null,
        latestTelemetry: null,
        result: null,
        error: null,
      });
    const assertFrozenEvidenceBeforeStart = () => {
      if (hash(frozenInput) !== frozenInputSha256) {
        throw new Error('FROZEN_DIAGNOSTIC_INPUT_HASH_CHANGED_BEFORE_START');
      }
      if (!prelaunchIdentity || !sameFrozenDiagnosticIdentity(prelaunchIdentity,
        snapshotSourceAndWorkerIdentity('research/design269-stage4-five-compartment-actual-profile.ts'))) {
        throw new Error('FROZEN_DIAGNOSTIC_SOURCE_OR_WORKER_IDENTITY_CHANGED_BEFORE_START');
      }
    };
    const runAttempt = async (attempt: Attempt, initialTransfer?: number[][]): Promise<Attempt> => {
      assertFrozenEvidenceBeforeStart();
      const onIteration = (iteration: Stage4FrozenCoarseIteration) => {
        attempt.trace.push(structuredClone(iteration));
        attempt.finalCompletedIterationState = structuredClone(iteration);
        writeCheckpointSync();
        logCheckpoint('COMPLETED_ITERATION_ATOMICALLY_RETAINED');
      };
      try {
        attempt.result = await runStage4FrozenCoarseDiagnostic(frozenInput, {
          timeoutMs: 120_000,
          wallClockBudgetMs: SOLVER_CAP_MS,
          abortSignal: abort.signal,
          initialTransfer,
          initialTransferMethod: attempt.initialization.method as
            | 'EXISTING_ZERO_TRANSFER_DEFAULT'
            | 'EXACT_PRIOR_SOLVE_MESH_TRANSFER_STATE'
            | 'PRELAUNCH_FROZEN_FEED_GEOMETRY_UNIFORM_TWO_PERCENT_CONTINUOUS_DONOR_DRAW'
            | undefined,
          onIteration,
          onTelemetryProgress: progress => {
            latestTelemetry = structuredClone(progress);
            attempt.latestTelemetry = structuredClone(progress);
            telemetry.push(structuredClone(progress));
          },
          onNumericalProgress: progress => {
            latestTelemetry = structuredClone(progress);
            attempt.latestTelemetry = structuredClone(progress);
          },
        });
        attempt.status = attempt.result.solver.converged
          ? 'COMPLETED_CONVERGED_UNACCEPTED_OFFLINE_DIAGNOSTIC'
          : 'COMPLETED_NOT_CONVERGED_UNACCEPTED_OFFLINE_DIAGNOSTIC';
      } catch (error) {
        attempt.error = error instanceof Error ? error.message : 'UNKNOWN_DIAGNOSTIC_ERROR';
        attempt.status = terminating
          ? 'MANAGED_SIGTERM_CUTOFF_INCOMPLETE_EVIDENCE_RETAINED'
          : 'TERMINATED_WITH_EXPLICIT_ERROR_INCOMPLETE_EVIDENCE_RETAINED';
      }
      writeCheckpointSync();
      return attempt;
    };

    status = 'FIRST_FROZEN_COARSE_SOLVE_RUNNING';
    const firstAttempt = newAttempt();
    attempts.first = firstAttempt;
    writeCheckpointSync();
    await runAttempt(firstAttempt);
    const qualifiesCompletedAttempt = (attempt: Attempt) => {
      const solver = attempt.result?.solver;
      const finalIteration = attempt.finalCompletedIterationState;
      return !!solver
        && solver.converged
        && solver.reason === null
        && solver.interfaceFailure === undefined
        && solver.iterations > 0
        && solver.localFlashCalls === 10
        && solver.transfer.length === 10 && solver.transfer.every(row => row.length === 7)
        && solver.continuousOutlet.length === 7 && solver.dispersedOutlet.length === 7
        && solver.maxScaledUpdateResidual !== null && solver.maxScaledUpdateResidual <= 2e-6
        && solver.maxScaledConstitutiveResidual !== null && solver.maxScaledConstitutiveResidual <= 1e-5
        && solver.maxScaledComponentBalanceResidual !== null && solver.maxScaledComponentBalanceResidual <= 1e-10
        && solver.maxAxialResidualMolS !== null && solver.maxAxialResidualMolS <= 1e-10
        && solver.maxDiffusiveFrameResidualMolS !== null && solver.maxDiffusiveFrameResidualMolS <= 1e-9
        && solver.maxFilmEqualityResidualMolS !== null && solver.maxFilmEqualityResidualMolS <= 1e-9
        && solver.maxStefanIdentityResidualMolS !== null && solver.maxStefanIdentityResidualMolS <= 1e-9
        && solver.maxPostUpdateScaledComponentBalanceResidual !== null
        && solver.maxPostUpdateScaledComponentBalanceResidual !== undefined
        && solver.maxPostUpdateScaledComponentBalanceResidual <= 1e-10
        && solver.postUpdateTotalMassBalanceResidualKgS !== null
        && solver.postUpdateTotalMassBalanceResidualKgS !== undefined
        && Math.abs(solver.postUpdateTotalMassBalanceResidualKgS) <= 1e-12
        && solver.maxPostUpdateContinuousAxialEquationResidualMolS !== null
        && solver.maxPostUpdateContinuousAxialEquationResidualMolS !== undefined
        && solver.maxPostUpdateContinuousAxialEquationResidualMolS <= 1e-10
        && solver.postUpdatePhysicalAdmissibilityPassed === true
        && !!finalIteration
        && finalIteration.physicalAdmissibility.continuousFacesNonnegative
        && finalIteration.physicalAdmissibility.continuousTotalFaceFlowsPositive
        && finalIteration.physicalAdmissibility.localPhaseStatesNonnegative
        && finalIteration.localInterfaceQualification.status === 'QUALIFIED_BY_EXISTING_JOB_B_RESPONSE_GATE'
        && finalIteration.localInterfaceQualification.completedCells === 10;
    };
    const firstPassQualification = qualifiesCompletedAttempt(firstAttempt);
    firstAttempt.initialization.firstPassQualificationForIndependentSecondStart = {
      passed: firstPassQualification,
      checks: 'converged/reason/interface/local-LLE/count/shape/update/actual-constitutive/original-and-post-update axial+component+mass balances/admissibility',
    };
    if (firstPassQualification) {
      status = 'CONDITIONAL_INDEPENDENT_PRELAUNCH_SEED_RESTART_RUNNING';
      const secondAttempt = newAttempt(independentSecondStart.transfer, {
        method: independentSecondStart.method,
        source: 'prelaunch frozen feed/geometry only; no first-run endpoint or residual used',
        sourceStateSha256: hash(independentSecondStart.transfer),
        donorFraction: independentSecondStart.donorFraction,
        reconstruction: independentSecondStart.reconstruction,
        materiallyDifferentFromZeroTransfer: true,
      });
      attempts.independentRestart = secondAttempt;
      writeCheckpointSync();
      await runAttempt(secondAttempt, independentSecondStart.transfer);
      secondAttempt.initialization.existingSolveMeshInitialTransferGatePassed = secondAttempt.result !== null;
      const secondPassQualification = qualifiesCompletedAttempt(secondAttempt);
      const comparison = secondPassQualification && firstAttempt.result?.solver && secondAttempt.result?.solver
        ? compareStage4FrozenCoarseReproductionEndpoints(frozenInput,
          firstAttempt.result.solver, secondAttempt.result.solver)
        : null;
      secondAttempt.initialization.reproductionAcceptanceQualification = {
        passed: secondPassQualification,
        sameGatesAsFirstPass: true,
        endpointComparison: comparison,
        reproducible: firstPassQualification && secondPassQualification && comparison?.endpointsAgree === true,
        branch: !secondPassQualification
          ? 'SECOND_ATTEMPT_FAILED_OR_UNQUALIFIED'
          : comparison?.endpointsAgree
            ? 'BOTH_QUALIFIED_ENDPOINTS_AGREE'
            : 'BOTH_QUALIFIED_ENDPOINTS_DIFFER',
      };
      if (secondPassQualification && comparison?.endpointsAgree) {
        secondAttempt.status = 'REPRODUCIBLE_TWO_QUALIFIED_INDEPENDENT_STARTS_UNACCEPTED_OFFLINE_DIAGNOSTIC';
      } else if (secondPassQualification) {
        secondAttempt.status = 'BOTH_QUALIFIED_ENDPOINTS_DIFFER_UNACCEPTED_OFFLINE_DIAGNOSTIC';
      }
    } else {
      attempts.independentRestart = {
        status: 'NOT_RUN_FIRST_PASS_FAILED_OR_UNQUALIFIED',
        initialization: {
          method: 'CONDITIONAL_SECOND_START_NOT_AUTHORIZED',
          branch: 'SECOND_NOT_RUN',
          firstPassQualification: false,
        },
        trace: [], finalCompletedIterationState: null,
        latestTelemetry: null, result: null, error: null,
      };
    }
    postrunIdentity = snapshotSourceAndWorkerIdentity('research/design269-stage4-five-compartment-actual-profile.ts');
    if (!sameFrozenDiagnosticIdentity(prelaunchIdentity, postrunIdentity)) {
      throw new Error('FROZEN_DIAGNOSTIC_SOURCE_OR_WORKER_IDENTITY_CHANGED_DURING_RUN');
    }
    status = terminating
      ? 'MANAGED_SIGTERM_CUTOFF_INCOMPLETE_EVIDENCE_RETAINED'
      : 'OFFLINE_FROZEN_COARSE_DIAGNOSTIC_COMPLETED_NOT_A_PRODUCTION_RESULT';
  } catch (error) {
    status = terminating
      ? 'MANAGED_SIGTERM_CUTOFF_INCOMPLETE_EVIDENCE_RETAINED'
      : 'OFFLINE_DIAGNOSTIC_SETUP_ERROR_INCOMPLETE_EVIDENCE_RETAINED';
    Object.assign(authority ??= {}, {
      error: error instanceof Error ? error.message : 'ACTUAL_PROFILE_UNKNOWN_ERROR',
    });
  } finally {
    process.removeListener('SIGTERM', onTerm);
    writeCheckpointSync();
    logCheckpoint('FINAL_CHECKPOINT_SAVED');
    await pool.end();
  }
}

main().catch(async error => {
  await pool.end().catch(() => undefined);
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});