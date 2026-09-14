/**
 * Bounded, read-only, actual-worker Stage-4 profile at exactly five physical
 * compartments. Unlike the first-request capture, this starts the pinned inlet
 * local-equilibrium and dogbox workers; it injects no states or evaluators.
 *
 * It is an offline diagnostic only: authority records are read owner-scoped,
 * no lifecycle method is called, and no calculation/result row is written.
 * The persisted artifact contains the latest saved solver telemetry at normal
 * completion, an in-solver budget stop, or managed SIGTERM.
 *
 * Launch only after the telemetry changes are final, as one managed task:
 *   timeout --preserve-status 190s npx tsx research/design269-stage4-five-compartment-actual-profile.ts
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { renameSync, writeFileSync } from 'node:fs';
import { pool } from '../server/db';
import { loadStage4PrePilotSizingAuthority } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';
import {
  runStage4PredictivePhysicalSizing,
  type Stage4PhysicalSizingProgress,
} from '../server/ecr-pre-pilot/stage4-predictive-physical-sizing';

const DESIGN_ID = 269;
const PHYSICAL_COMPARTMENTS = 5;
const SOLVER_CAP_MS = 180_000;
const OUT = 'research/design269-stage4-five-compartment-actual-profile.json';
const hash = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');

async function main() {
  const harnessStarted = performance.now();
  let status = 'AUTHORITY_LOADING';
  let latestTelemetry: Stage4PhysicalSizingProgress | null = null;
  const recentTelemetry: Stage4PhysicalSizingProgress[] = [];
  let terminating = false;
  let authoritySummary: Record<string, unknown> | null = null;
  const abort = new AbortController();

  const snapshot = () => ({
    schema: 'DESIGN269_STAGE4_FIVE_COMPARTMENT_ACTUAL_WORKER_PROFILE_V1',
    scope: {
      designId: DESIGN_ID,
      physicalCompartments: PHYSICAL_COMPARTMENTS,
      solverCapMs: SOLVER_CAP_MS,
      externalCapMs: 190_000,
      databaseAccess: 'READ_ONLY_OWNER_SCOPED_AUTHORITY',
      noProductionCalculationPersistence: true,
      noStage2OrStage3Execution: true,
      actualPinnedInletLocalEquilibrium: true,
      actualPinnedDogboxInterface: true,
      injectedEvaluators: false,
      fullColumnSizingAcceptanceClaimed: false,
    },
    status,
    timing: {
      checkpointTimestamp: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - harnessStarted),
    },
    authority: authoritySummary,
    latestTelemetry,
    recentTelemetry,
  });
  const writeCheckpointSync = () => {
    // The first managed attempt left a zero-byte artifact; its precise
    // interruption point is not known. Async writes do have a
    // truncate-before-completion interval, so write a complete small JSON
    // sibling first and atomically replace the prior checkpoint.
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
    status = 'MANAGED_SIGTERM_CUTOFF_RETAINING_LATEST_TELEMETRY';
    abort.abort();
    writeCheckpointSync();
    logCheckpoint('MANAGED_SIGTERM_CHECKPOINT_SAVED');
  };
  process.once('SIGTERM', onTerm);

  try {
    status = 'INITIAL_SNAPSHOT_BEFORE_AUTHORITY_LOAD';
    writeCheckpointSync();
    logCheckpoint('INITIAL_CHECKPOINT_SAVED');
    const owner = await pool.query<{ created_by: number }>(
      'SELECT created_by FROM ecr_pre_pilot_designs WHERE id=$1',
      [DESIGN_ID],
    );
    if (!owner.rows[0]) throw new Error('ACTUAL_PROFILE_DESIGN_NOT_FOUND');
    const authority = await loadStage4PrePilotSizingAuthority(owner.rows[0].created_by, DESIGN_ID);
    if (authority.solverInput.calculatedNt > PHYSICAL_COMPARTMENTS) {
      throw new Error('ACTUAL_PROFILE_FIVE_COMPARTMENT_BOUND_BELOW_GOVERNED_NT');
    }
    authoritySummary = {
      lineageHash: authority.lineageHash,
      solverInputHash: hash(authority.solverInput),
      calculatedNt: authority.solverInput.calculatedNt,
      maximumCompartments: PHYSICAL_COMPARTMENTS,
    };
    status = 'ACTUAL_SOLVER_READY';
    writeCheckpointSync();
    logCheckpoint('AUTHORITY_READY_CHECKPOINT_SAVED');

    status = 'ACTUAL_SOLVER_RUNNING';
    writeCheckpointSync();
    logCheckpoint('ACTUAL_SOLVER_STARTED');
    const result = await runStage4PredictivePhysicalSizing({
      ...authority.solverInput,
      maximumCompartments: PHYSICAL_COMPARTMENTS,
    }, {
      timeoutMs: 120_000,
      wallClockBudgetMs: SOLVER_CAP_MS,
      abortSignal: abort.signal,
      // This observer only stores memory and schedules an asynchronous file
      // checkpoint. It is deliberately not awaited by the numerical solver.
      onTelemetryProgress: (progress) => {
        latestTelemetry = structuredClone(progress);
        recentTelemetry.push(structuredClone(progress));
        if (recentTelemetry.length > 32) recentTelemetry.shift();
        writeCheckpointSync();
        logCheckpoint('TELEMETRY_CHECKPOINT_SAVED');
      },
      // Phase/mesh events are retained too, but do no I/O in the awaited lane.
      onNumericalProgress: (progress) => {
        latestTelemetry = structuredClone(progress);
        recentTelemetry.push(structuredClone(progress));
        if (recentTelemetry.length > 32) recentTelemetry.shift();
      },
    });
    status = terminating
      ? 'MANAGED_SIGTERM_CUTOFF_RETAINING_LATEST_TELEMETRY'
      : 'ACTUAL_SOLVER_RETURNED_OFFLINE_NOT_ACCEPTED';
    Object.assign(authoritySummary, {
      returnedStatus: result.status,
      primaryTermination: result.primary.searchTermination,
      sensitivityTermination: result.sensitivity.searchTermination,
    });
  } catch (error) {
    status = terminating
      ? 'MANAGED_SIGTERM_CUTOFF_RETAINING_LATEST_TELEMETRY'
      : 'ACTUAL_SOLVER_ERROR_RETAINING_LATEST_TELEMETRY';
    Object.assign(authoritySummary ??= {}, {
      error: error instanceof Error ? error.message : 'ACTUAL_PROFILE_UNKNOWN_ERROR',
    });
    if (!terminating) throw error;
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