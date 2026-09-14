/**
 * Review-gated offline qualification of the user-authorized residual-controlled
 * whole-column solver.  It is fixed to design 269, c=.0126, and 5 x 2 cells;
 * it neither runs the production sizing lifecycle nor searches count, mesh, or
 * coefficient.  Launch only as a managed background task after review:
 *
 * FROZEN_RESIDUAL_CONTROLLED_DIAGNOSTIC_ARCHITECT_APPROVED=YES \
 *   npx tsx research/design269-stage4-five-compartment-residual-controlled-profile.ts
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { renameSync, writeFileSync } from 'node:fs';
import { pool } from '../server/db';
import { loadStage4PrePilotSizingAuthority } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';
import {
  compareStage4FrozenCoarseReproductionEndpoints,
  prepareStage4FrozenCoarseIndependentDonorSeed,
  runStage4FrozenResidualControlledDiagnostic,
  type Stage4FrozenResidualControlledDiagnosticResult,
  type Stage4ResidualControlledCandidate,
} from '../server/ecr-pre-pilot/stage4-predictive-physical-sizing';
import {
  sameFrozenDiagnosticIdentity,
  snapshotSourceAndWorkerIdentity,
} from './design269-stage4-frozen-diagnostic-identity';

const DESIGN_ID = 269;
const SOLVER_CAP_MS = 3_600_000;
const OUT = 'research/design269-stage4-frozen-residual-controlled-whole-column-diagnostic.json';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
};

type Attempt = {
  status: string;
  initialization: Record<string, unknown>;
  candidates: Stage4ResidualControlledCandidate[];
  result: Stage4FrozenResidualControlledDiagnosticResult | null;
  error: string | null;
};

async function main() {
  const started = performance.now();
  let status = 'INITIALIZING_READ_ONLY_OWNER_SCOPED';
  let authority: Record<string, unknown> | null = null;
  let frozenInput: any;
  let prelaunchIdentity: ReturnType<typeof snapshotSourceAndWorkerIdentity> | null = null;
  let postrunIdentity: ReturnType<typeof snapshotSourceAndWorkerIdentity> | null = null;
  let independentSecondStart: ReturnType<typeof prepareStage4FrozenCoarseIndependentDonorSeed> | null = null;
  let terminating = false;
  const attempts: { first: Attempt | null; independentRestart: Attempt | null } = {
    first: null, independentRestart: null,
  };
  const abort = new AbortController();
  const snapshot = () => ({
    schema: 'DESIGN269_STAGE4_FROZEN_RESIDUAL_CONTROLLED_WHOLE_COLUMN_DIAGNOSTIC_V1',
    scope: {
      designId: DESIGN_ID, physicalCompartments: 5, finiteVolumeCellsPerPhysicalCompartment: 2,
      khCoefficient: .0126, solverCapMs: SOLVER_CAP_MS, databaseAccess: 'READ_ONLY_OWNER_SCOPED_AUTHORITY',
      noProductionCalculationPersistence: true, noStage2OrStage3Execution: true, noRefinedMesh: true,
      noCoefficientSensitivity: true, noCountSearch: true,
      solver: 'SAFEGUARDED_GOOD_BROYDEN_ACTUAL_WHOLE_COLUMN_RESIDUAL_V1',
      acceptance: 'fresh residual merit decrease only; max residual <=1e-5 and original .20 Picard-map update <=2e-6 at the same state; original physical/film/stability gates retained',
      architectReviewRequiredBeforeLaunch: true,
    },
    status,
    timing: { checkpointTimestamp: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started) },
    authority, prelaunchIdentity, postrunIdentity, attempts,
  });
  const checkpoint = () => {
    writeFileSync(`${OUT}.tmp`, `${JSON.stringify(snapshot(), null, 2)}\n`, 'utf8');
    renameSync(`${OUT}.tmp`, OUT);
  };
  const terminate = () => {
    terminating = true;
    status = 'MANAGED_SIGTERM_CUTOFF_INCOMPLETE_EVIDENCE_RETAINED';
    abort.abort();
    checkpoint();
  };
  process.once('SIGTERM', terminate);
  try {
    checkpoint();
    const owner = await pool.query<{ created_by: number }>(
      'SELECT created_by FROM ecr_pre_pilot_designs WHERE id=$1', [DESIGN_ID]);
    if (!owner.rows[0]) throw new Error('RESIDUAL_CONTROLLED_PROFILE_DESIGN_NOT_FOUND');
    const loaded = await loadStage4PrePilotSizingAuthority(owner.rows[0].created_by, DESIGN_ID);
    if (loaded.solverInput.calculatedNt !== 5) throw new Error('RESIDUAL_CONTROLLED_PROFILE_REQUIRES_GOVERNED_NT_FIVE');
    frozenInput = deepFreeze(JSON.parse(JSON.stringify({ ...loaded.solverInput, maximumCompartments: 5 })));
    const inputHash = digest(frozenInput);
    independentSecondStart = deepFreeze(prepareStage4FrozenCoarseIndependentDonorSeed(frozenInput));
    prelaunchIdentity = snapshotSourceAndWorkerIdentity(
      'research/design269-stage4-five-compartment-residual-controlled-profile.ts');
    authority = {
      authorityAccess: 'READ_ONLY_OWNER_SCOPED_LOAD', lineageHash: loaded.lineageHash,
      solverInputSha256: inputHash, solverInput: frozenInput,
      independentSecondStart,
      endpointComparator: 'EXISTING_FROZEN_COARSE_2E-6_COMPARATOR',
    };
    status = 'PRELAUNCH_EVIDENCE_FROZEN_REVIEW_REQUIRED';
    checkpoint();
    if (process.env.FROZEN_RESIDUAL_CONTROLLED_DIAGNOSTIC_ARCHITECT_APPROVED !== 'YES') {
      status = 'AWAITING_ARCHITECT_REVIEW_NO_HEAVY_SOLVE_LAUNCHED';
      checkpoint();
      return;
    }
    const sourceGuard = () => {
      if (digest(frozenInput) !== inputHash || !prelaunchIdentity
        || !sameFrozenDiagnosticIdentity(prelaunchIdentity, snapshotSourceAndWorkerIdentity(
          'research/design269-stage4-five-compartment-residual-controlled-profile.ts'))) {
        throw new Error('RESIDUAL_CONTROLLED_FROZEN_INPUT_OR_SOLVER_IDENTITY_CHANGED');
      }
    };
    const run = async (attempt: Attempt, initialTransfer?: number[][]) => {
      sourceGuard();
      try {
        attempt.result = await runStage4FrozenResidualControlledDiagnostic(frozenInput, {
          timeoutMs: 120_000, wallClockBudgetMs: SOLVER_CAP_MS, abortSignal: abort.signal, initialTransfer,
          initialTransferMethod: attempt.initialization.method as any,
          onCandidate: candidate => {
            attempt.candidates.push(structuredClone(candidate));
            // Accepted and rejected candidates, their raw/scaled residuals and
            // complete request/response evidence become durable together.
            checkpoint();
          },
        });
        attempt.status = attempt.result.solver.converged
          ? 'COMPLETED_CONVERGED_UNACCEPTED_OFFLINE_DIAGNOSTIC'
          : 'COMPLETED_NUMERICAL_UNRESOLVED_EVIDENCE_RETAINED';
      } catch (error) {
        attempt.error = error instanceof Error ? error.message : 'UNKNOWN_RESIDUAL_CONTROLLED_DIAGNOSTIC_ERROR';
        attempt.status = terminating ? 'MANAGED_SIGTERM_CUTOFF_INCOMPLETE_EVIDENCE_RETAINED'
          : 'TERMINATED_WITH_EXPLICIT_ERROR_INCOMPLETE_EVIDENCE_RETAINED';
      }
      checkpoint();
    };
    const first: Attempt = { status: 'RUNNING', initialization: { method: 'EXISTING_ZERO_TRANSFER_DEFAULT' },
      candidates: [], result: null, error: null };
    attempts.first = first;
    status = 'FIRST_FROZEN_RESIDUAL_CONTROLLED_SOLVE_RUNNING';
    checkpoint();
    await run(first);
    const qualified = (attempt: Attempt) => {
      const solver = attempt.result?.solver;
      return !!solver && solver.converged && solver.reason === null && solver.localFlashCalls === 10
        && solver.interfaceFailure === undefined
        && solver.transfer.length === 10 && solver.transfer.every(row => row.length === 7)
        && solver.continuousOutlet.length === 7 && solver.dispersedOutlet.length === 7
        && solver.maxScaledConstitutiveResidual !== null && solver.maxScaledConstitutiveResidual <= 1e-5
        && solver.maxScaledUpdateResidual !== null && solver.maxScaledUpdateResidual <= 2e-6
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
        && solver.residualControlled?.strategy === 'SAFEGUARDED_GOOD_BROYDEN_ACTUAL_WHOLE_COLUMN_RESIDUAL_V1'
        && solver.residualControlled.finalActualScaledResidual !== null
        && solver.residualControlled.finalActualScaledResidual <= 1e-5;
    };
    if (qualified(first)) {
      const seed = independentSecondStart;
      if (!seed) throw new Error('RESIDUAL_CONTROLLED_PRELAUNCH_SECOND_START_MISSING');
      const second: Attempt = { status: 'RUNNING', initialization: {
        method: seed.method, donorFraction: seed.donorFraction, sourceStateSha256: digest(seed.transfer),
        constructionDependsOnFirstRun: false,
      }, candidates: [], result: null, error: null };
      attempts.independentRestart = second;
      status = 'INDEPENDENT_A_PRIORI_TWO_PERCENT_DONOR_SEED_RESTART_RUNNING';
      checkpoint();
      await run(second, seed.transfer);
      const comparison = qualified(second) && first.result && second.result
        ? compareStage4FrozenCoarseReproductionEndpoints(frozenInput, first.result.solver, second.result.solver) : null;
      second.initialization.endpointComparison = comparison;
      second.initialization.reproducible = comparison?.endpointsAgree === true;
    } else {
      attempts.independentRestart = { status: 'NOT_RUN_FIRST_PASS_FAILED_OR_UNQUALIFIED',
        initialization: { method: 'CONDITIONAL_SECOND_START_NOT_AUTHORIZED' }, candidates: [], result: null, error: null };
    }
    postrunIdentity = snapshotSourceAndWorkerIdentity(
      'research/design269-stage4-five-compartment-residual-controlled-profile.ts');
    if (!sameFrozenDiagnosticIdentity(prelaunchIdentity, postrunIdentity)) {
      throw new Error('RESIDUAL_CONTROLLED_SOURCE_OR_WORKER_IDENTITY_CHANGED_DURING_RUN');
    }
    status = terminating ? 'MANAGED_SIGTERM_CUTOFF_INCOMPLETE_EVIDENCE_RETAINED'
      : 'OFFLINE_FROZEN_RESIDUAL_CONTROLLED_DIAGNOSTIC_COMPLETED_NOT_A_PRODUCTION_RESULT';
  } catch (error) {
    status = terminating ? 'MANAGED_SIGTERM_CUTOFF_INCOMPLETE_EVIDENCE_RETAINED'
      : 'OFFLINE_RESIDUAL_CONTROLLED_DIAGNOSTIC_SETUP_ERROR_INCOMPLETE_EVIDENCE_RETAINED';
    Object.assign(authority ??= {}, { error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' });
  } finally {
    process.removeListener('SIGTERM', terminate);
    checkpoint();
    await pool.end();
  }
}

main().catch(async error => {
  await pool.end().catch(() => undefined);
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});