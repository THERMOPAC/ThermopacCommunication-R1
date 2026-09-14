/**
 * Bounded, read-only timing harness for the first production-assembled
 * Stage-4 Job-B interface request for design 269.
 *
 * It first obtains the owner-scoped authority from the database, then uses the
 * production Stage-4 request assembler with non-scientific capture-only
 * evaluators. Exactly one captured request is submitted to the pinned dogbox
 * session. It never starts the Stage-4 lifecycle service, writes a production
 * calculation row, or runs Stage 2/3. The output file is written before the
 * worker starts so an external cutoff retains the exact request and timing
 * checkpoint already observed.
 *
 * Run only as a managed, bounded background shell:
 *   timeout --preserve-status 180s npx tsx research/design269-stage4-interface-profile.ts
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pool } from '../server/db';
import { createStage4DogboxInterfaceSession } from '../server/ecr-pre-pilot/stage4-dogbox-interface';
import { loadStage4PrePilotSizingAuthority } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';
import { runStage4PredictivePhysicalSizing } from '../server/ecr-pre-pilot/stage4-predictive-physical-sizing';

const DESIGN_ID = 269;
const CAP_MS = 180_000;
const OUT = 'research/design269-stage4-interface-profile.json';
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const elapsedMs = (startedAt: number) => Date.now() - startedAt;

async function main() {
  const startedAt = Date.now();
  const owner = await pool.query<{ created_by: number }>(
    'SELECT created_by FROM ecr_pre_pilot_designs WHERE id=$1',
    [DESIGN_ID],
  );
  if (!owner.rows[0]) throw new Error('PROFILE_DESIGN_NOT_FOUND');
  const authority = await loadStage4PrePilotSizingAuthority(owner.rows[0].created_by, DESIGN_ID);
  const captured: Array<{ request: Record<string, unknown>; requestHash: string }> = [];
  // This invokes only the production TypeScript assembler. The injected
  // evaluators are explicitly structural and cannot produce a scientific
  // Stage-4 result.
  await runStage4PredictivePhysicalSizing({
    ...authority.solverInput,
    maximumCompartments: authority.solverInput.calculatedNt,
  }, {
    wallClockBudgetMs: 30_000,
    flashEvaluator: async () => ({
      status: 'CALCULATED',
      phaseOrientation: 'NMP_RICH_EXTRACT',
      raffinateComposition: Array(7).fill(1 / 7),
      extractComposition: Array(7).fill(1 / 7),
      resultHash: '0'.repeat(64),
    }),
    interfaceEvaluator: async request => {
      captured.push({ request, requestHash: sha(request) });
      return { status: 'BLOCKED_PROFILE_CAPTURE_ONLY' } as any;
    },
  });
  const first = captured[0];
  if (!first) throw new Error('PROFILE_PRODUCTION_REQUEST_CAPTURE_MISSING');
  const checkpoint = {
    schema: 'DESIGN269_STAGE4_FIRST_INTERFACE_PROFILE_V1',
    scope: {
      designId: DESIGN_ID,
      capMs: CAP_MS,
      databaseAccess: 'READ_ONLY_OWNER_SCOPED_AUTHORITY',
      noProductionCalculationPersistence: true,
      noStage2OrStage3Execution: true,
      noFullColumnExecution: true,
      workerRequestsPlanned: 1,
    },
    requestAssembly: {
      enginePath: 'runStage4PredictivePhysicalSizing injected capture-only evaluators',
      capturedRequestCount: captured.length,
      firstRequestHash: first.requestHash,
      capturedRequestHashes: captured.map(entry => entry.requestHash),
      exactFirstRequest: first.request,
    },
    timing: {
      startedAt: new Date(startedAt).toISOString(),
      checkpointTimestamp: new Date().toISOString(),
      elapsedMs: elapsedMs(startedAt),
      operation: 'PRODUCTION_REQUEST_ASSEMBLED',
    },
    status: 'REQUEST_ASSEMBLED_WORKER_NOT_STARTED',
  };
  await writeFile(OUT, `${JSON.stringify(checkpoint, null, 2)}\n`);

  const remainingMs = () => Math.max(1, CAP_MS - elapsedMs(startedAt));
  const session = createStage4DogboxInterfaceSession({ timeoutMs: remainingMs() });
  let cutoff: NodeJS.Timeout | null = null;
  let operationStartedAt: number | null = null;
  try {
    cutoff = setTimeout(() => session.close(), remainingMs());
    operationStartedAt = Date.now();
    await writeFile(OUT, `${JSON.stringify({
      ...checkpoint,
      status: 'WORKER_RUNNING',
      timing: {
        ...checkpoint.timing,
        checkpointTimestamp: new Date().toISOString(),
        elapsedMs: elapsedMs(startedAt),
        operation: 'SOLVE_INTERFACE',
        operationElapsedMs: 0,
      },
    }, null, 2)}\n`);
    const response = await session.solve(first.request as any, remainingMs());
    await writeFile(OUT, `${JSON.stringify({
      ...checkpoint,
      status: 'WORKER_COMPLETED',
      timing: {
        ...checkpoint.timing,
        checkpointTimestamp: new Date().toISOString(),
        elapsedMs: elapsedMs(startedAt),
        operation: 'SOLVE_INTERFACE',
        operationElapsedMs: elapsedMs(operationStartedAt),
      },
      worker: {
        requestHash: first.requestHash,
        responseStatus: response.status,
        responseResultHash: response.resultHash,
      },
    }, null, 2)}\n`);
  } catch (error) {
    await writeFile(OUT, `${JSON.stringify({
      ...checkpoint,
      status: elapsedMs(startedAt) >= CAP_MS
        ? 'CUTOFF_RETAINED_EXACT_REQUEST' : 'WORKER_ERROR_RETAINED_EXACT_REQUEST',
      timing: {
        ...checkpoint.timing,
        checkpointTimestamp: new Date().toISOString(),
        elapsedMs: elapsedMs(startedAt),
        operation: 'SOLVE_INTERFACE',
        ...(operationStartedAt === null ? {} : {
          operationElapsedMs: elapsedMs(operationStartedAt),
        }),
      },
      error: error instanceof Error ? error.message : 'PROFILE_WORKER_UNKNOWN_ERROR',
    }, null, 2)}\n`);
    throw error;
  } finally {
    if (cutoff) clearTimeout(cutoff);
    session.close();
    await pool.end();
  }
}

main().catch(async error => {
  await pool.end().catch(() => undefined);
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});