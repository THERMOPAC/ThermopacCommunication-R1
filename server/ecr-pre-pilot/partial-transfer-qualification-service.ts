import { randomUUID } from 'node:crypto';
import { pool } from '../db';
import {
  currentOwnedStrictPartialAnchor,
  getKuhniGeometryResolverRuns,
} from '../ecr-pre-pilot-service';
import {
  evaluateDirectPartialTransferStage1Targets,
  PARTIAL_TRANSFER_ANCHOR_HEIGHT_M,
} from './stage4-partial-transfer-sizing';
import {
  solveDirectPartialTransferSizingCandidate,
} from './job-c-physical-sizing';
import { jobCResultHash } from './job-c';
import { makeStage1HydrodynamicProcessBasis, validateStage1Snapshot } from './stage1';

/**
 * This is intentionally a narrow, independently persisted lifecycle.  It is
 * neither a Job-C queue record nor a D/H search: one user click requests only
 * the historical accepted geometry at H=2 m and lambda=8e-9.
 */
export const SINGLE_QUALIFICATION_CONTRACT = 'USER_TRIGGERED_SINGLE_QUALIFICATION_V1' as const;
export const SINGLE_QUALIFICATION_SOURCE_DIAMETER_M = 1.0287688499748642;
export const SINGLE_QUALIFICATION_DISPLAY_DIAMETER_M = 1.02876885;

type QualificationRow = {
  id: string; status: string; input_snapshot: any; input_hash: string;
  result_snapshot: any; result_hash: string | null; progress: any; error: string | null;
  created_at: Date; started_at: Date | null; completed_at: Date | null;
};

const activeControllers = new Map<string, AbortController>();
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function publicRow(row: QualificationRow) {
  return {
    qualificationId: row.id, status: row.status, input: row.input_snapshot,
    inputHash: row.input_hash, result: row.result_snapshot, resultHash: row.result_hash,
    progress: row.progress ?? {}, error: row.error,
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at && new Date(row.started_at).toISOString(),
    completedAt: row.completed_at && new Date(row.completed_at).toISOString(),
  };
}

async function qualificationPreflight(userId: number, designId: number) {
  const design = await pool.query<{ input_data: unknown }>(
    `SELECT input_data FROM ecr_pre_pilot_designs WHERE id=$1 AND created_by=$2`,
    [designId, userId],
  );
  if (!design.rows[0]) throw new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND');
  const stage1 = validateStage1Snapshot(design.rows[0].input_data);
  const source = await currentOwnedStrictPartialAnchor(userId, designId);
  if (!source) throw new Error('SINGLE_QUALIFICATION_STRICT_SAVED_189_ANCHOR_NOT_FOUND_OR_INVALID');
  if (source.anchor.stage1SnapshotHash !== stage1.immutableHash) {
    throw new Error('SINGLE_QUALIFICATION_SOURCE_STAGE1_LINEAGE_MISMATCH');
  }
  const request = source.anchor.workerRequest;
  // This literal comparison protects the historical geometry from display
  // rounding.  The request's original IEEE value is passed through unchanged.
  if (request?.columnDiameterM !== SINGLE_QUALIFICATION_SOURCE_DIAMETER_M
    || !finite(request?.rpm) || !finite(request?.operatingHoldup) || !finite(request?.d32M)) {
    throw new Error('SINGLE_QUALIFICATION_HISTORICAL_SOURCE_GEOMETRY_MISMATCH');
  }
  const stage3 = (await getKuhniGeometryResolverRuns(userId, designId))
    .find((item: any) => item.immutableHash === source.anchor.sourceDependencies.stage3ImmutableHash);
  if (!stage3) throw new Error('SINGLE_QUALIFICATION_SOURCE_STAGE3_AUTHORITY_MISSING');
  const candidates = Array.isArray((stage3 as any)?.result?.hydraulicRpmEnvelope)
    ? (stage3 as any).result.hydraulicRpmEnvelope : [];
  const ordinal = candidates.findIndex((item: any) =>
    item?.status === 'CALCULATED_IN_RANGE'
    && item?.columnDiameterM === SINGLE_QUALIFICATION_SOURCE_DIAMETER_M
    && item?.rpm === request.rpm);
  if (ordinal < 0) {
    throw new Error('SINGLE_QUALIFICATION_HISTORICAL_FILM_GEOMETRY_BASIS_NOT_EQUIVALENT');
  }
  const evidence = candidates[ordinal];
  return {
    source: source.anchor, stage1, request, stage3,
    candidate: {
      candidate: {
        ordinal, trialId: `stage3:${ordinal}`, trialImmutableHash: (stage3 as any).immutableHash,
        // Do not substitute the rounded display value.
        columnDiameterM: request.columnDiameterM, rpm: request.rpm,
        compartmentHeightM: evidence.compartmentHeightM, powerVolumeWM3: evidence.powerVolumeWM3,
        status: evidence.status, applicability: evidence.applicability ?? [],
        uncertainty: evidence.uncertainty ?? [], pilotValidated: false, hydraulicallyFeasible: true,
      },
      stage3Evidence: {
        columnDiameterM: evidence.columnDiameterM, rpm: evidence.rpm,
        compartmentHeightM: evidence.compartmentHeightM, d32M: evidence.d32M,
        operatingHoldup: evidence.operatingHydraulics?.operatingHoldup,
        floodHoldup: evidence.operatingHydraulics?.floodHoldup,
      },
    },
  };
}

function targetChecks(stage1: any, request: any, transport: any) {
  const selected = transport?.selected;
  return evaluateDirectPartialTransferStage1Targets({
    phaseConfiguration: request.phaseConfiguration,
    componentOrder: transport?.response?.componentOrder,
    numericalCells: selected?.numericalCells,
    recoveryPct: selected?.recoveryPctNmpFreeRrboHydrocarbonMassBasis,
    targets: {
      minimumRecoveryPct: stage1.stage1.minimumRecoveryPct,
      minimumRaffinateSaturatesWt: stage1.stage1.minimumRaffinateSaturatesWt,
      targetRaffinateTotalAromaticsWt: stage1.stage1.targetRaffinateTotalAromaticsWt,
      targetRaffinatePolarAromaticsWt: stage1.stage1.targetRaffinatePolarAromaticsWt,
      maximumNmpRaffinateWt: stage1.stage1.maximumNmpRaffinateWt,
      targetRaffinateSulfurPpm: stage1.stage1.targetRaffinateSulfurPpm,
    },
    recoveryTolerancePct: .01,
  });
}

async function persistProgress(id: string, progress: Record<string, any>) {
  await pool.query(
    `UPDATE ecr_pre_pilot_partial_transfer_qualification_jobs
        SET progress=$2,updated_at=now() WHERE id=$1 AND status='running'`,
    [id, progress],
  );
}

async function executeQualification(rowId: string, userId: number, designId: number, prepared: any) {
  const controller = new AbortController();
  activeControllers.set(rowId, controller);
  const started = Date.now();
  try {
    const claimed = await pool.query(
      `UPDATE ecr_pre_pilot_partial_transfer_qualification_jobs
          SET status='running',started_at=now(),updated_at=now(),
              progress=jsonb_build_object('phase','starting single qualification','elapsedSeconds',0)
        WHERE id=$1 AND status='pending' RETURNING id`,
      [rowId],
    );
    if (!claimed.rows[0]) return;
    const transport = await solveDirectPartialTransferSizingCandidate({
      anchor: prepared.source, workerRequest: prepared.request,
      processBasis: makeStage1HydrodynamicProcessBasis(prepared.stage1),
      candidate: prepared.candidate, heightM: PARTIAL_TRANSFER_ANCHOR_HEIGHT_M,
      signal: controller.signal, runtimeBudgetSeconds: null,
      qualificationContract: SINGLE_QUALIFICATION_CONTRACT,
      onProgress: async (workerProgress) => {
        await persistProgress(rowId, {
          ...workerProgress, elapsedSeconds: Math.max(0, (Date.now() - started) / 1000),
          contract: SINGLE_QUALIFICATION_CONTRACT,
        });
      },
    });
    const checks = targetChecks(prepared.stage1, prepared.request, transport);
    const numericalQualification = transport.status === 'TRANSPORT_GATES_PASSED';
    const result = {
      contract: SINGLE_QUALIFICATION_CONTRACT,
      classification: 'SINGLE_NUMERICAL_QUALIFICATION_NOT_FULL_SIZING_OR_PHYSICAL_COMPARTMENTS',
      source: {
        anchorJobId: prepared.source.sourceJobId,
        anchorResultHash: prepared.source.sourceResultHash,
        exactSaved189StateSha256: prepared.source.profileStateSha256,
        sourceDiameterM: SINGLE_QUALIFICATION_SOURCE_DIAMETER_M,
        displayDiameterM: SINGLE_QUALIFICATION_DISPLAY_DIAMETER_M,
        sourceRpm: prepared.request.rpm, heightM: PARTIAL_TRANSFER_ANCHOR_HEIGHT_M,
        lambda: 8e-9,
      },
      numericalQualification: numericalQualification ? 'PASSED_ALL_UNCHANGED_GATES' : 'NOT_QUALIFIED',
      targetQualification: checks.valid
        ? (checks.allEvaluatedNonSulfurTargetsPassed ? 'EVALUABLE_NON_SULFUR_TARGETS_PASSED' : 'TARGETS_MISSED')
        : 'TARGETS_NOT_EVALUABLE',
      targetChecks: checks,
      transport,
      // Present only after the worker's direct nonlinear solve and two
      // uncached all-gate evaluations; this is a seed, never target evidence.
      neighborWarmStart: transport?.selected?.directSolve?.eligibleNeighbourWarmStart ?? {
        eligible: false, reason: 'ALL_GATE_CONVERGED_DIRECT_SOLVE_REQUIRED',
      },
      elapsedSeconds: Math.max(0, (Date.now() - started) / 1000),
    };
    const status = controller.signal.aborted ? 'cancelled' : 'completed';
    await pool.query(
      `UPDATE ecr_pre_pilot_partial_transfer_qualification_jobs
          SET status=$2,result_snapshot=$3,result_hash=$4,
              progress=$5,completed_at=now(),updated_at=now()
        WHERE id=$1 AND status='running'`,
      [rowId, status, result, jobCResultHash(result), {
        phase: status === 'completed' ? 'completed' : 'cancelled',
        elapsedSeconds: result.elapsedSeconds,
      }],
    );
  } catch (error) {
    const cancelled = controller.signal.aborted;
    await pool.query(
      `UPDATE ecr_pre_pilot_partial_transfer_qualification_jobs
          SET status=$2,error=$3,progress=$4,completed_at=now(),updated_at=now()
        WHERE id=$1 AND status='running'`,
      [rowId, cancelled ? 'cancelled' : 'failed',
        cancelled ? 'SINGLE_QUALIFICATION_CANCELLED' : (error instanceof Error ? error.message : 'SINGLE_QUALIFICATION_FAILED'),
        { phase: cancelled ? 'cancelled' : 'failed', elapsedSeconds: Math.max(0, (Date.now() - started) / 1000) }],
    );
  } finally {
    activeControllers.delete(rowId);
  }
}

export async function startSinglePartialTransferQualification(userId: number, designId: number) {
  const prepared = await qualificationPreflight(userId, designId);
  const input = {
    contract: SINGLE_QUALIFICATION_CONTRACT, anchorJobId: prepared.source.sourceJobId,
    anchorResultHash: prepared.source.sourceResultHash, anchorStateSha256: prepared.source.profileStateSha256,
    stage1SnapshotHash: prepared.stage1.immutableHash, stage3ImmutableHash: prepared.stage3.immutableHash,
    sourceDiameterM: SINGLE_QUALIFICATION_SOURCE_DIAMETER_M, sourceRpm: prepared.request.rpm,
    heightM: PARTIAL_TRANSFER_ANCHOR_HEIGHT_M, lambda: 8e-9,
  };
  const inputHash = jobCResultHash(input);
  const existing = await pool.query<QualificationRow>(
    `SELECT * FROM ecr_pre_pilot_partial_transfer_qualification_jobs
      WHERE created_by=$1 AND design_id=$2 AND input_hash=$3
      ORDER BY created_at DESC LIMIT 1`, [userId, designId, inputHash],
  );
  if (existing.rows[0]) return { ...publicRow(existing.rows[0]), reused: true };
  const id = randomUUID();
  try {
    const created = await pool.query<QualificationRow>(
      `INSERT INTO ecr_pre_pilot_partial_transfer_qualification_jobs
        (id,design_id,created_by,status,input_snapshot,input_hash,progress)
       VALUES ($1,$2,$3,'pending',$4,$5,'{}'::jsonb) RETURNING *`,
      [id, designId, userId, input, inputHash],
    );
    // Detached by design: browser disconnects cannot cancel scientific work.
    void executeQualification(id, userId, designId, prepared);
    return { ...publicRow(created.rows[0]), reused: false };
  } catch (error: any) {
    if (error?.code === '23505') {
      const active = await pool.query<QualificationRow>(
        `SELECT * FROM ecr_pre_pilot_partial_transfer_qualification_jobs
          WHERE created_by=$1 AND design_id=$2 AND status IN ('pending','running')
          ORDER BY created_at DESC LIMIT 1`, [userId, designId],
      );
      if (active.rows[0]) return { ...publicRow(active.rows[0]), reused: true };
    }
    throw error;
  }
}

export async function getSinglePartialTransferQualification(
  userId: number, designId: number, id?: string,
) {
  const result = await pool.query<QualificationRow>(
    `SELECT * FROM ecr_pre_pilot_partial_transfer_qualification_jobs
      WHERE created_by=$1 AND design_id=$2 ${id ? 'AND id=$3' : ''}
      ORDER BY created_at DESC LIMIT 1`,
    id ? [userId, designId, id] : [userId, designId],
  );
  return result.rows[0] ? publicRow(result.rows[0]) : null;
}

export async function cancelSinglePartialTransferQualification(userId: number, designId: number, id: string) {
  const row = await pool.query<QualificationRow>(
    `SELECT * FROM ecr_pre_pilot_partial_transfer_qualification_jobs
      WHERE id=$1 AND created_by=$2 AND design_id=$3`, [id, userId, designId],
  );
  if (!row.rows[0]) return null;
  activeControllers.get(id)?.abort();
  const updated = await pool.query<QualificationRow>(
    `UPDATE ecr_pre_pilot_partial_transfer_qualification_jobs
        SET status='cancelled',error='SINGLE_QUALIFICATION_CANCELLED_BY_USER',
            progress=jsonb_build_object('phase','cancellation requested'),completed_at=now(),updated_at=now()
      WHERE id=$1 AND status IN ('pending','running') RETURNING *`, [id],
  );
  return publicRow(updated.rows[0] ?? row.rows[0]);
}

/** Crash recovery is deliberately terminal, never a hidden restart. */
export async function markInterruptedSinglePartialTransferQualifications() {
  await pool.query(
    `UPDATE ecr_pre_pilot_partial_transfer_qualification_jobs
        SET status='interrupted',error='SINGLE_QUALIFICATION_INTERRUPTED_PROCESS_RESTART_NO_AUTORUN',
            completed_at=now(),updated_at=now()
      WHERE status IN ('pending','running')`,
  );
}