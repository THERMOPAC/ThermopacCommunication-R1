import { pool } from '../db';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { generateDocumentNumber } from '../epc-coding';
import { triggerInspectionOnWoRelease } from '../utils/epc-inspection-trigger';
import { triggerInspectionOnPoIssuance } from '../utils/epc-inspection-trigger';
import { linkIODraftToTriggeredIO } from './draft-activation';
import type { AutomationContext, StepResult, PipelineResult } from './full-auto-types';
import { STALE_THRESHOLD_MS } from './full-auto-types';

const LOG_PREFIX = '[FullAuto]';

export async function executeFullAutoPipeline(
  projectId: number,
  triggerUserId: number,
): Promise<PipelineResult> {
  const runId = uuidv4();
  const startedAt = new Date();
  const stepResults: StepResult[] = [];

  const ctx: AutomationContext = {
    runId, projectId, triggerUserId,
    actorType: 'system',
    actorRef: 'full_auto_orchestrator',
    startedAt,
    currentPhase: 0,
    currentStep: 'init',
  };

  console.log(`${LOG_PREFIX} Starting pipeline run=${runId} project=${projectId} trigger_user=${triggerUserId}`);

  try {
    await acquirePipelineLock(ctx);
  } catch (lockErr: any) {
    console.error(`${LOG_PREFIX} Lock acquisition failed: ${lockErr.message}`);
    return {
      success: false, runId, projectId, phasesCompleted: 0, stepResults,
      failedStep: 'acquire_lock', failedError: lockErr.message, duration: 0,
    };
  }

  try {
    await emitEvent(ctx, 'full_auto.pipeline_started', {
      runId, projectId, triggerUserId, automationMode: 'full_auto',
    });

    await executePhase1(ctx, stepResults);
    await updateHeartbeat(ctx, 2, 'phase2_cascade');

    await executePhase2(ctx, stepResults);
    await updateHeartbeat(ctx, 3, 'phase3_activation');

    await executePhase3(ctx, stepResults);
    await updateHeartbeat(ctx, 4, 'phase4_quality');

    await executePhase4(ctx, stepResults);
    await updateHeartbeat(ctx, 5, 'phase5_complete');

    await executePhase5(ctx, stepResults);

    await completePipelineRun(ctx, stepResults);

    const duration = Date.now() - startedAt.getTime();
    await emitEvent(ctx, 'full_auto.pipeline_complete', {
      runId, projectId, phasesCompleted: 5, duration,
    });

    console.log(`${LOG_PREFIX} Pipeline complete run=${runId} duration=${duration}ms`);
    return { success: true, runId, projectId, phasesCompleted: 5, stepResults, duration };
  } catch (error: any) {
    const duration = Date.now() - startedAt.getTime();
    const failedStep = ctx.currentStep;
    console.error(`${LOG_PREFIX} Pipeline FAILED run=${runId} step=${failedStep}: ${error.message}`);

    await failPipelineRun(ctx, failedStep, error.message, stepResults);
    await emitEvent(ctx, 'full_auto.pipeline_failed', {
      runId, projectId, failedStep, error: error.message,
    });

    return {
      success: false, runId, projectId,
      phasesCompleted: ctx.currentPhase - 1, stepResults,
      failedStep, failedError: error.message, duration,
    };
  }
}

async function acquirePipelineLock(ctx: AutomationContext): Promise<void> {
  const staleCheck = await pool.query(
    `UPDATE automation_pipeline_runs
     SET status = 'stale', failure_message = 'Recovered by new run'
     WHERE project_id = $1 AND status = 'running'
       AND heartbeat_at < NOW() - INTERVAL '10 minutes'
     RETURNING run_id`,
    [ctx.projectId]
  );

  if (staleCheck.rows.length > 0) {
    for (const row of staleCheck.rows) {
      console.log(`${LOG_PREFIX} Recovered stale run ${row.run_id}`);
      await emitEvent(ctx, 'full_auto.pipeline_stale_recovered', {
        runId: ctx.runId, staleRunId: row.run_id, projectId: ctx.projectId,
      });
    }
  }

  const activeCheck = await pool.query(
    `SELECT run_id FROM automation_pipeline_runs
     WHERE project_id = $1 AND status = 'running'`,
    [ctx.projectId]
  );

  if (activeCheck.rows.length > 0) {
    throw new Error(`PIPELINE_ALREADY_RUNNING: run_id=${activeCheck.rows[0].run_id}`);
  }

  await pool.query(
    `INSERT INTO automation_pipeline_runs
     (run_id, project_id, status, current_phase, current_step, trigger_user_id, started_at, heartbeat_at, step_results)
     VALUES ($1, $2, 'running', 1, 'init', $3, NOW(), NOW(), '{}')`,
    [ctx.runId, ctx.projectId, ctx.triggerUserId]
  );

  await pool.query(
    `UPDATE projects SET automation_run_id = $1, updated_at = NOW() WHERE id = $2`,
    [ctx.runId, ctx.projectId]
  );
}

async function updateHeartbeat(ctx: AutomationContext, phase: number, step: string): Promise<void> {
  ctx.currentPhase = phase;
  ctx.currentStep = step;
  await pool.query(
    `UPDATE automation_pipeline_runs
     SET heartbeat_at = NOW(), current_phase = $1, current_step = $2
     WHERE run_id = $3`,
    [phase, step, ctx.runId]
  );
}

async function completePipelineRun(ctx: AutomationContext, stepResults: StepResult[]): Promise<void> {
  await pool.query(
    `UPDATE automation_pipeline_runs
     SET status = 'completed', completed_at = NOW(), current_phase = 5, current_step = 'complete',
         step_results = $1
     WHERE run_id = $2`,
    [JSON.stringify(stepResults), ctx.runId]
  );
  await pool.query(
    `UPDATE projects SET automation_completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [ctx.projectId]
  );
}

async function failPipelineRun(ctx: AutomationContext, failedStep: string, message: string, stepResults: StepResult[]): Promise<void> {
  await pool.query(
    `UPDATE automation_pipeline_runs
     SET status = 'failed', failed_at = NOW(), failure_step = $1, failure_message = $2,
         step_results = $3
     WHERE run_id = $4`,
    [failedStep, message, JSON.stringify(stepResults), ctx.runId]
  );
}

async function emitEvent(ctx: AutomationContext, eventName: string, payload: Record<string, any>): Promise<void> {
  const idempotencyKey = `${ctx.runId}:${eventName}:${payload.entityType || 'pipeline'}:${payload.entityId || ctx.projectId}`;
  payload.idempotency_key = idempotencyKey;
  payload.actor_type = ctx.actorType;
  payload.actor_ref = ctx.actorRef;
  payload.trigger_user_id = ctx.triggerUserId;

  try {
    const dupCheck = await pool.query(
      `SELECT 1 FROM project_workflow_events
       WHERE project_id = $1 AND event_payload->>'idempotency_key' = $2
       LIMIT 1`,
      [ctx.projectId, idempotencyKey]
    );
    if (dupCheck.rows.length > 0) return;

    await pool.query(
      `INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())`,
      [ctx.projectId, eventName, JSON.stringify(payload), ctx.actorRef]
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} Non-critical: failed to emit event ${eventName}`, err);
  }
}

function addResult(results: StepResult[], step: string, phase: number, data: Partial<StepResult>): void {
  results.push({ step, phase, success: true, timestamp: new Date().toISOString(), ...data });
}


async function executePhase1(ctx: AutomationContext, results: StepResult[]): Promise<void> {
  ctx.currentPhase = 1;
  ctx.currentStep = 'phase1_approve_do_po_drafts';
  console.log(`${LOG_PREFIX} Phase 1: Approve independent drafts (DO, PO)`);

  const drafts = await pool.query(
    `SELECT id, doc_type, doc_number, approval_status, applicable
     FROM execution_drafts
     WHERE project_id = $1 AND applicable = true
       AND doc_type IN ('DO', 'PO')
       AND approval_status IN ('draft', 'pending_approval')
     ORDER BY doc_type, id`,
    [ctx.projectId]
  );

  for (const draft of drafts.rows) {
    ctx.currentStep = `phase1_approve_${draft.doc_type}_${draft.id}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE execution_drafts
         SET approval_status = 'approved', approved_by = NULL,
             created_source_type = 'system', created_source_ref = $1,
             automation_run_id = $2, updated_at = NOW()
         WHERE id = $3 AND approval_status IN ('draft', 'pending_approval')`,
        [ctx.actorRef, ctx.runId, draft.id]
      );
      await client.query('COMMIT');

      await emitEvent(ctx, 'full_auto.draft_approved', {
        runId: ctx.runId, draftId: draft.id, docType: draft.doc_type,
        docNumber: draft.doc_number, phase: 1, entityType: 'execution_draft', entityId: draft.id,
      });

      addResult(results, `approve_draft_${draft.doc_type}_${draft.id}`, 1, {
        entityId: draft.id, entityType: 'execution_draft', docNumber: draft.doc_number,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`${LOG_PREFIX} Phase 1 complete: ${drafts.rows.length} drafts approved`);
}


async function executePhase2(ctx: AutomationContext, results: StepResult[]): Promise<void> {
  ctx.currentPhase = 2;
  ctx.currentStep = 'phase2_cascade_wo_drafts';
  console.log(`${LOG_PREFIX} Phase 2: Cascade DO approval → unblock + approve WO drafts`);

  const approvedDOs = await pool.query(
    `SELECT DISTINCT project_item_id, doc_number FROM execution_drafts
     WHERE project_id = $1 AND doc_type = 'DO' AND approval_status = 'approved' AND applicable = true`,
    [ctx.projectId]
  );

  for (const doRow of approvedDOs.rows) {
    await pool.query(
      `UPDATE execution_drafts
       SET dependency_status = 'met', updated_at = NOW()
       WHERE project_id = $1 AND project_item_id = $2
         AND doc_type = 'WO' AND dependency_status = 'blocked' AND applicable = true`,
      [ctx.projectId, doRow.project_item_id]
    );
  }

  const woDrafts = await pool.query(
    `SELECT id, doc_type, doc_number, approval_status
     FROM execution_drafts
     WHERE project_id = $1 AND applicable = true
       AND doc_type = 'WO'
       AND approval_status IN ('draft', 'pending_approval')
       AND dependency_status != 'blocked'
     ORDER BY id`,
    [ctx.projectId]
  );

  for (const draft of woDrafts.rows) {
    ctx.currentStep = `phase2_approve_WO_${draft.id}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE execution_drafts
         SET approval_status = 'approved', approved_by = NULL,
             created_source_type = 'system', created_source_ref = $1,
             automation_run_id = $2, updated_at = NOW()
         WHERE id = $3 AND approval_status IN ('draft', 'pending_approval')`,
        [ctx.actorRef, ctx.runId, draft.id]
      );
      await client.query('COMMIT');

      await emitEvent(ctx, 'full_auto.draft_approved', {
        runId: ctx.runId, draftId: draft.id, docType: 'WO',
        docNumber: draft.doc_number, phase: 2, entityType: 'execution_draft', entityId: draft.id,
      });

      addResult(results, `approve_draft_WO_${draft.id}`, 2, {
        entityId: draft.id, entityType: 'execution_draft', docNumber: draft.doc_number,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`${LOG_PREFIX} Phase 2 complete: ${woDrafts.rows.length} WO drafts approved`);
}


async function executePhase3(ctx: AutomationContext, results: StepResult[]): Promise<void> {
  ctx.currentPhase = 3;
  ctx.currentStep = 'phase3_activate_and_release';
  console.log(`${LOG_PREFIX} Phase 3: Activate drafts → approve/release WOs → approve/issue POs`);

  const approvedDrafts = await pool.query(
    `SELECT id, doc_type, doc_number, activation_status, activated_entity_id
     FROM execution_drafts
     WHERE project_id = $1 AND applicable = true
       AND approval_status = 'approved'
       AND doc_type IN ('DO', 'WO', 'PO')
     ORDER BY CASE doc_type WHEN 'DO' THEN 1 WHEN 'WO' THEN 2 WHEN 'PO' THEN 3 END, id`,
    [ctx.projectId]
  );

  for (const draft of approvedDrafts.rows) {
    if (draft.activation_status === 'activated' && draft.activated_entity_id) {
      addResult(results, `activate_${draft.doc_type}_${draft.id}`, 3, {
        skipped: true, skipReason: 'already_activated',
        entityId: draft.activated_entity_id, docNumber: draft.doc_number,
      });
      continue;
    }

    ctx.currentStep = `phase3_activate_${draft.doc_type}_${draft.id}`;

    const { activateDraft } = await import('./draft-activation');
    const activationResult = await activateDraft(draft.id, ctx.triggerUserId);

    if (!activationResult.success) {
      throw new Error(`Activation failed for ${draft.doc_type} draft #${draft.id}: ${activationResult.error}`);
    }

    if (activationResult.entityId) {
      await pool.query(
        `UPDATE ${getEntityTable(draft.doc_type)} SET
           created_source_type = 'system',
           created_source_ref = $1,
           automation_run_id = $2,
           updated_at = NOW()
         WHERE id = $3`,
        [ctx.actorRef, ctx.runId, activationResult.entityId]
      );
    }

    await emitEvent(ctx, 'full_auto.draft_activated', {
      runId: ctx.runId, draftId: draft.id, docType: draft.doc_type,
      entityId: activationResult.entityId, entityType: activationResult.entityType,
    });

    addResult(results, `activate_${draft.doc_type}_${draft.id}`, 3, {
      entityId: activationResult.entityId, entityType: activationResult.entityType, docNumber: draft.doc_number,
    });
  }

  await autoApproveAndReleaseWOs(ctx, results);
  await autoApproveAndIssuePOs(ctx, results);

  console.log(`${LOG_PREFIX} Phase 3 complete`);
}

function getEntityTable(docType: string): string {
  switch (docType) {
    case 'DO': return 'epc_drawing_orders';
    case 'WO': return 'epc_work_orders';
    case 'PO': return 'epc_purchase_orders';
    default: return '';
  }
}

async function autoApproveAndReleaseWOs(ctx: AutomationContext, results: StepResult[]): Promise<void> {
  const wos = await pool.query(
    `SELECT w.id, w.wo_number, w.status, w.project_item_id
     FROM epc_work_orders w
     WHERE w.project_id = $1
       AND w.created_source_type = 'system'
       AND w.automation_run_id = $2
       AND w.status = 'draft'
     ORDER BY w.id`,
    [ctx.projectId, ctx.runId]
  );

  for (const wo of wos.rows) {
    ctx.currentStep = `phase3_approve_wo_${wo.id}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE epc_work_orders
         SET status = 'approved', approved_by = NULL, approved_at = NOW(),
             approval_note = 'System auto-approved (full_auto pipeline)', updated_at = NOW()
         WHERE id = $1 AND status = 'draft'`,
        [wo.id]
      );
      await client.query(`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
        VALUES ($1, 'epc_work_order.approved', $2::jsonb, $3, NOW())`,
        [ctx.projectId, JSON.stringify({
          epcWoId: wo.id, woNumber: wo.wo_number, approvedBy: null,
          approvalNote: 'System auto-approved (full_auto pipeline)',
          idempotency_key: `${ctx.runId}:wo_approve:epc_work_orders:${wo.id}`,
          actor_type: 'system', actor_ref: ctx.actorRef,
        }), ctx.actorRef]
      );
      await client.query('COMMIT');

      await emitEvent(ctx, 'full_auto.wo_approved', {
        runId: ctx.runId, woId: wo.id, woNumber: wo.wo_number,
        entityType: 'epc_work_orders', entityId: wo.id,
      });

      addResult(results, `approve_wo_${wo.id}`, 3, {
        entityId: wo.id, entityType: 'epc_work_orders', docNumber: wo.wo_number,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const approvedWos = await pool.query(
    `SELECT w.id, w.wo_number, w.project_item_id
     FROM epc_work_orders w
     WHERE w.project_id = $1
       AND w.created_source_type = 'system'
       AND w.automation_run_id = $2
       AND w.status = 'approved'
     ORDER BY w.id`,
    [ctx.projectId, ctx.runId]
  );

  for (const wo of approvedWos.rows) {
    ctx.currentStep = `phase3_release_wo_${wo.id}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE epc_work_orders
         SET status = 'released', released_by = NULL, released_at = NOW(),
             release_note = 'System auto-released (full_auto pipeline)', updated_at = NOW()
         WHERE id = $1 AND status = 'approved'`,
        [wo.id]
      );
      await client.query(`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
        VALUES ($1, 'epc_work_order.released', $2::jsonb, $3, NOW())`,
        [ctx.projectId, JSON.stringify({
          epcWoId: wo.id, woNumber: wo.wo_number, releasedBy: null,
          releaseNote: 'System auto-released (full_auto pipeline)',
          idempotency_key: `${ctx.runId}:wo_release:epc_work_orders:${wo.id}`,
          actor_type: 'system', actor_ref: ctx.actorRef,
        }), ctx.actorRef]
      );
      await client.query('COMMIT');

      await emitEvent(ctx, 'full_auto.wo_released', {
        runId: ctx.runId, woId: wo.id, woNumber: wo.wo_number,
        entityType: 'epc_work_orders', entityId: wo.id,
      });

      addResult(results, `release_wo_${wo.id}`, 3, {
        entityId: wo.id, entityType: 'epc_work_orders', docNumber: wo.wo_number,
      });

      try {
        const insResult = await triggerInspectionOnWoRelease(
          wo.id, wo.wo_number, ctx.projectId, wo.project_item_id, ctx.triggerUserId
        );
        if (insResult.created) {
          await emitEvent(ctx, 'full_auto.io_triggered', {
            runId: ctx.runId, ioId: insResult.inspectionOrderId,
            ioNumber: insResult.inspectionOrderNumber,
            sourceType: 'work_order', sourceId: wo.id,
            entityType: 'inspection_orders', entityId: insResult.inspectionOrderId,
          });
        }
        try {
          await linkIODraftToTriggeredIO(ctx.projectId, wo.project_item_id, ctx.triggerUserId);
          if (insResult.inspectionOrderId) {
            await emitEvent(ctx, 'full_auto.io_draft_linked', {
              runId: ctx.runId, ioId: insResult.inspectionOrderId,
              entityType: 'execution_draft', entityId: 0,
            });
          }
        } catch (linkErr) {
          console.error(`${LOG_PREFIX} Non-critical: IO draft link failed for WO ${wo.wo_number}`, linkErr);
        }
      } catch (insErr) {
        console.error(`${LOG_PREFIX} Non-critical: inspection trigger failed for WO ${wo.wo_number}`, insErr);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

async function autoApproveAndIssuePOs(ctx: AutomationContext, results: StepResult[]): Promise<void> {
  const pos = await pool.query(
    `SELECT p.id, p.po_number, p.status, p.project_item_id
     FROM epc_purchase_orders p
     WHERE p.project_id = $1
       AND p.created_source_type = 'system'
       AND p.automation_run_id = $2
       AND p.status = 'draft'
     ORDER BY p.id`,
    [ctx.projectId, ctx.runId]
  );

  for (const po of pos.rows) {
    ctx.currentStep = `phase3_approve_po_${po.id}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE epc_purchase_orders
         SET status = 'approved', approved_by = NULL, approved_at = NOW(),
             approval_note = 'System auto-approved (full_auto pipeline)',
             quality_status = 'not_applicable',
             updated_at = NOW()
         WHERE id = $1 AND status = 'draft'`,
        [po.id]
      );
      await client.query(`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
        VALUES ($1, 'epc_purchase_order.approved', $2::jsonb, $3, NOW())`,
        [ctx.projectId, JSON.stringify({
          epcPoId: po.id, poNumber: po.po_number, approvedBy: null,
          idempotency_key: `${ctx.runId}:po_approve:epc_purchase_orders:${po.id}`,
          actor_type: 'system', actor_ref: ctx.actorRef,
        }), ctx.actorRef]
      );
      await client.query('COMMIT');

      await emitEvent(ctx, 'full_auto.po_approved', {
        runId: ctx.runId, poId: po.id, poNumber: po.po_number,
        entityType: 'epc_purchase_orders', entityId: po.id,
      });

      addResult(results, `approve_po_${po.id}`, 3, {
        entityId: po.id, entityType: 'epc_purchase_orders', docNumber: po.po_number,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const approvedPos = await pool.query(
    `SELECT p.id, p.po_number, p.project_item_id
     FROM epc_purchase_orders p
     WHERE p.project_id = $1
       AND p.created_source_type = 'system'
       AND p.automation_run_id = $2
       AND p.status = 'approved'
     ORDER BY p.id`,
    [ctx.projectId, ctx.runId]
  );

  for (const po of approvedPos.rows) {
    ctx.currentStep = `phase3_issue_po_${po.id}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE epc_purchase_orders
         SET status = 'issued', issued_by = NULL, issued_at = NOW(),
             issue_note = 'System auto-issued (full_auto pipeline)', updated_at = NOW()
         WHERE id = $1 AND status = 'approved'`,
        [po.id]
      );
      await client.query(`INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at)
        VALUES ($1, 'epc_purchase_order.issued', $2::jsonb, $3, NOW())`,
        [ctx.projectId, JSON.stringify({
          epcPoId: po.id, poNumber: po.po_number, issuedBy: null,
          idempotency_key: `${ctx.runId}:po_issue:epc_purchase_orders:${po.id}`,
          actor_type: 'system', actor_ref: ctx.actorRef,
        }), ctx.actorRef]
      );
      await client.query('COMMIT');

      await emitEvent(ctx, 'full_auto.po_issued', {
        runId: ctx.runId, poId: po.id, poNumber: po.po_number,
        entityType: 'epc_purchase_orders', entityId: po.id,
      });

      addResult(results, `issue_po_${po.id}`, 3, {
        entityId: po.id, entityType: 'epc_purchase_orders', docNumber: po.po_number,
      });

      try {
        const insResult = await triggerInspectionOnPoIssuance(
          po.id, po.po_number, ctx.projectId, po.project_item_id, ctx.triggerUserId
        );
        if (insResult.created) {
          await emitEvent(ctx, 'full_auto.io_triggered', {
            runId: ctx.runId, ioId: insResult.inspectionOrderId,
            ioNumber: insResult.inspectionOrderNumber,
            sourceType: 'purchase_order', sourceId: po.id,
            entityType: 'inspection_orders', entityId: insResult.inspectionOrderId,
          });
        }
        try {
          await linkIODraftToTriggeredIO(ctx.projectId, po.project_item_id, ctx.triggerUserId);
        } catch (linkErr) {
          console.error(`${LOG_PREFIX} Non-critical: IO draft link failed for PO ${po.po_number}`, linkErr);
        }
      } catch (insErr) {
        console.error(`${LOG_PREFIX} Non-critical: inspection trigger failed for PO ${po.po_number}`, insErr);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}


async function executePhase4(ctx: AutomationContext, results: StepResult[]): Promise<void> {
  ctx.currentPhase = 4;
  ctx.currentStep = 'phase4_quality_inspections';
  console.log(`${LOG_PREFIX} Phase 4: Quality plans + inspection records for released WOs`);

  const releasedWos = await pool.query(
    `SELECT w.id, w.wo_number, w.project_item_id, w.master_item_id,
            w.item_code, w.item_description, w.uom, w.quantity,
            w.quality_plan_id
     FROM epc_work_orders w
     WHERE w.project_id = $1
       AND w.created_source_type = 'system'
       AND w.automation_run_id = $2
       AND w.status = 'released'
     ORDER BY w.id`,
    [ctx.projectId, ctx.runId]
  );

  for (const wo of releasedWos.rows) {
    let qualityPlanId = wo.quality_plan_id;

    if (!qualityPlanId) {
      ctx.currentStep = `phase4_create_qpl_wo_${wo.id}`;

      const existingQpl = await pool.query(
        `SELECT id FROM quality_planning_records
         WHERE project_id = $1 AND project_item_id = $2 AND source_context = 'work_order'
           AND status NOT IN ('canceled')
         LIMIT 1`,
        [ctx.projectId, wo.project_item_id]
      );

      if (existingQpl.rows.length > 0) {
        qualityPlanId = existingQpl.rows[0].id;
        addResult(results, `create_qpl_wo_${wo.id}`, 4, {
          skipped: true, skipReason: 'quality_plan_exists',
          entityId: qualityPlanId, entityType: 'quality_planning_records',
        });
      } else {
        const qpNumber = await generateDocumentNumber(ctx.projectId, 'QPL');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const qpResult = await client.query(
            `INSERT INTO quality_planning_records
             (project_id, project_item_id, master_item_id, source_context,
              item_code, item_description, uom, quantity,
              quality_requirement_type, quality_plan_number, quality_notes,
              status, created_by, created_source_type, created_source_ref, automation_run_id,
              created_at, updated_at)
             VALUES ($1, $2, $3, 'work_order',
                     $4, $5, $6, $7,
                     'standard_inspection', $8,
                     $9,
                     'draft', $10, 'system', $11, $12,
                     NOW(), NOW())
             RETURNING id`,
            [ctx.projectId, wo.project_item_id, wo.master_item_id,
             wo.item_code, wo.item_description, wo.uom, wo.quantity,
             qpNumber,
             `Auto-created by full_auto pipeline for WO ${wo.wo_number}`,
             ctx.triggerUserId, ctx.actorRef, ctx.runId]
          );
          qualityPlanId = qpResult.rows[0].id;

          await client.query(
            `UPDATE epc_work_orders SET quality_plan_id = $1, updated_at = NOW() WHERE id = $2`,
            [qualityPlanId, wo.id]
          );
          await client.query('COMMIT');

          await emitEvent(ctx, 'full_auto.quality_plan_created', {
            runId: ctx.runId, qplId: qualityPlanId, qplNumber: qpNumber, woId: wo.id,
            entityType: 'quality_planning_records', entityId: qualityPlanId,
          });

          addResult(results, `create_qpl_wo_${wo.id}`, 4, {
            entityId: qualityPlanId, entityType: 'quality_planning_records', docNumber: qpNumber,
          });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }
    } else {
      addResult(results, `create_qpl_wo_${wo.id}`, 4, {
        skipped: true, skipReason: 'quality_plan_already_linked',
        entityId: qualityPlanId, entityType: 'quality_planning_records',
      });
    }

    if (qualityPlanId) {
      ctx.currentStep = `phase4_create_inspection_wo_${wo.id}`;

      const existingInsp = await pool.query(
        `SELECT id FROM inspection_execution_records
         WHERE project_id = $1 AND project_item_id = $2 AND quality_plan_id = $3
           AND status NOT IN ('canceled')
         LIMIT 1`,
        [ctx.projectId, wo.project_item_id, qualityPlanId]
      );

      if (existingInsp.rows.length > 0) {
        addResult(results, `create_inspection_wo_${wo.id}`, 4, {
          skipped: true, skipReason: 'inspection_exists',
          entityId: existingInsp.rows[0].id, entityType: 'inspection_execution_records',
        });
      } else {
        const inspNumber = await generateDocumentNumber(ctx.projectId, 'INS');

        const qcInspector = await pool.query(
          `SELECT id FROM users
           WHERE department = 'Quality Control' AND role = 'Senior Executive'
             AND is_active = true
           LIMIT 1`
        );
        const inspectorId = qcInspector.rows.length > 0 ? qcInspector.rows[0].id : ctx.triggerUserId;

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const insResult = await client.query(
            `INSERT INTO inspection_execution_records
             (inspection_number, project_id, project_item_id, quality_plan_id,
              master_item_id, source_context, inspection_type,
              item_code, item_description, uom, quantity,
              inspection_notes, status,
              scheduled_by, scheduled_at,
              assigned_to, created_by,
              created_source_type, created_source_ref, automation_run_id,
              created_at, updated_at)
             VALUES ($1, $2, $3, $4,
                     $5, 'work_order', 'in-process',
                     $6, $7, $8, $9,
                     $10, 'scheduled',
                     NULL, NOW(),
                     $11, $12,
                     'system', $13, $14,
                     NOW(), NOW())
             RETURNING id`,
            [inspNumber, ctx.projectId, wo.project_item_id, qualityPlanId,
             wo.master_item_id,
             wo.item_code, wo.item_description, wo.uom, wo.quantity,
             `Auto-created by full_auto pipeline for WO ${wo.wo_number}`,
             inspectorId, ctx.triggerUserId,
             ctx.actorRef, ctx.runId]
          );
          const inspId = insResult.rows[0].id;
          await client.query('COMMIT');

          await emitEvent(ctx, 'full_auto.inspection_created', {
            runId: ctx.runId, inspectionId: inspId, inspectionNumber: inspNumber,
            qplId: qualityPlanId,
            entityType: 'inspection_execution_records', entityId: inspId,
          });

          await emitEvent(ctx, 'full_auto.inspection_scheduled', {
            runId: ctx.runId, inspectionId: inspId, assignedTo: inspectorId,
            entityType: 'inspection_execution_records', entityId: inspId,
          });

          addResult(results, `create_inspection_wo_${wo.id}`, 4, {
            entityId: inspId, entityType: 'inspection_execution_records', docNumber: inspNumber,
          });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }
    }
  }

  console.log(`${LOG_PREFIX} Phase 4 complete`);
}


async function executePhase5(ctx: AutomationContext, results: StepResult[]): Promise<void> {
  ctx.currentPhase = 5;
  ctx.currentStep = 'phase5_verify_completion';
  console.log(`${LOG_PREFIX} Phase 5: Verify execution-ready state`);

  const pendingDrafts = await pool.query(
    `SELECT id, doc_type, approval_status, activation_status
     FROM execution_drafts
     WHERE project_id = $1 AND applicable = true
       AND doc_type IN ('DO', 'WO', 'PO')
       AND (approval_status NOT IN ('approved') OR activation_status NOT IN ('activated'))`,
    [ctx.projectId]
  );

  if (pendingDrafts.rows.length > 0) {
    const pending = pendingDrafts.rows.map((d: any) => `${d.doc_type}#${d.id}(${d.approval_status}/${d.activation_status})`).join(', ');
    console.warn(`${LOG_PREFIX} Phase 5: ${pendingDrafts.rows.length} applicable drafts not in terminal state: ${pending}`);
    addResult(results, 'verify_completion', 5, {
      success: true,
      skipReason: `${pendingDrafts.rows.length} drafts not yet terminal (non-blocking)`,
    });
  } else {
    addResult(results, 'verify_completion', 5, {});
  }

  console.log(`${LOG_PREFIX} Phase 5 complete`);
}
