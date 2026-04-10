import { db } from '../db';
import { sql } from 'drizzle-orm';
import { createEpcTask, resolveAssignee } from '../epc-task-helpers';
import { ROUTING_MAP, PRIORITY_MAP, SLA_DAYS } from './pipeline-types';
import type { DraftDocType } from './pipeline-types';
import { generateDocumentNumber } from '../epc-coding';

export async function activateDraft(
  draftId: number,
  userId: number
): Promise<{ success: boolean; entityId?: number; entityType?: string; message?: string; error?: string }> {
  const draftResult = await db.execute(
    sql`SELECT * FROM execution_drafts WHERE id = ${draftId}`
  );
  if (draftResult.rows.length === 0) {
    return { success: false, error: 'Draft not found.' };
  }
  const draft = draftResult.rows[0] as any;

  if (draft.approval_status !== 'approved') {
    return { success: false, error: `Draft must be approved before activation. Current status: "${draft.approval_status}".` };
  }
  if (draft.activation_status === 'activated') {
    return {
      success: false,
      error: 'Draft already activated.',
      entityId: draft.activated_entity_id,
      entityType: draft.activated_entity_type,
    };
  }
  if (!draft.applicable) {
    return { success: false, error: 'Draft is not applicable.' };
  }

  if (draft.doc_type === 'IO') {
    return { success: false, error: 'IO drafts are activated by existing WO-release / PO-issuance triggers, not manually.' };
  }

  try {
    await db.execute(
      sql`UPDATE execution_drafts SET activation_status = 'pending_activation', updated_at = NOW() WHERE id = ${draftId}`
    );

    const docType = draft.doc_type as DraftDocType;

    if (docType === 'DO') {
      const { entityId, entityType } = await activateDrawingOrder(draft, userId);

      await db.execute(
        sql`UPDATE execution_drafts
            SET activation_status = 'activated',
                activated_entity_id = ${entityId},
                activated_entity_type = ${entityType},
                activated_by = ${userId},
                activated_at = NOW(),
                updated_at = NOW()
            WHERE id = ${draftId}`
      );

      console.log(`[DraftActivation] DO ${draft.doc_number} → entity #${entityId} (${entityType})`);
      return { success: true, entityId, entityType };
    }

    if (docType === 'WO') {
      const { entityId, entityType } = await activateWorkOrder(draft, userId);

      await db.execute(
        sql`UPDATE execution_drafts
            SET activation_status = 'activated',
                activated_entity_id = ${entityId},
                activated_entity_type = ${entityType},
                activated_by = ${userId},
                activated_at = NOW(),
                updated_at = NOW()
            WHERE id = ${draftId}`
      );

      console.log(`[DraftActivation] WO ${draft.doc_number} → work_order #${entityId}`);
      return { success: true, entityId, entityType, message: `Work Order ${draft.doc_number} created successfully.` };
    }

    const routing = ROUTING_MAP[docType as keyof typeof ROUTING_MAP] || { department: 'Projects', preferredRole: 'Senior Executive' };
    const assignee = await resolveAssignee(draft.project_id, routing.department, userId, undefined, routing.preferredRole);
    const entityLabel = 'Purchase Order';
    const taskId = await createEpcTask({
      projectId: draft.project_id,
      entityType: 'execution_draft',
      recordId: draftId,
      actionCode: `create_${docType.toLowerCase()}`,
      title: `Create ${entityLabel} ${draft.doc_number}`,
      description: `Approved execution draft ${draft.doc_number} is ready for ${entityLabel} creation.\nItem: ${draft.source_data?.item_code || draft.source_data?.master_item_code || ''}\nQuantity: ${draft.source_data?.quantity || 'N/A'}\nUOM: ${draft.source_data?.uom || 'N/A'}\n\nPlease create the ${entityLabel} via the standard workflow and link it back to this draft.`,
      assignedTo: assignee,
      createdBy: userId,
      priority: PRIORITY_MAP[docType] || 'High',
      dueDays: SLA_DAYS[docType] || 3,
    });

    if (taskId) {
      await db.execute(
        sql`UPDATE execution_drafts SET linked_task_id = ${taskId} WHERE id = ${draftId}`
      );
    }

    console.log(`[DraftActivation] ${docType} ${draft.doc_number} → pending_activation (task #${taskId})`);
    return {
      success: true,
      message: `${entityLabel} draft approved. A task has been created for ${entityLabel} creation via the standard workflow.`,
    };
  } catch (error: any) {
    await db.execute(
      sql`UPDATE execution_drafts
          SET activation_status = 'activation_failed',
              error_message = ${error.message || 'Unknown error'},
              updated_at = NOW()
          WHERE id = ${draftId}`
    );
    console.error(`[DraftActivation] Failed for draft ${draftId}:`, error);
    return { success: false, error: `Activation failed: ${error.message}` };
  }
}

async function activateDrawingOrder(draft: any, userId: number): Promise<{ entityId: number; entityType: string }> {
  const sd = draft.source_data || {};
  const itemCode = sd.item_code || sd.master_item_code || null;
  const itemDesc = sd.master_item_description || sd.item_description || null;
  const classification = sd.make_or_buy || sd.classification || null;

  let itemBarcode: string | null = null;
  if (draft.project_item_id) {
    const piResult = await db.execute(
      sql`SELECT code_bars FROM project_items WHERE id = ${draft.project_item_id}`
    );
    if (piResult.rows.length > 0) {
      itemBarcode = (piResult.rows[0] as any).code_bars || null;
    }
  }

  const result = await db.execute(
    sql`INSERT INTO epc_drawing_orders
        (do_number, project_id, project_item_id, master_item_id, item_code, item_description,
         status, created_by)
        VALUES (${draft.doc_number}, ${draft.project_id}, ${draft.project_item_id},
                ${sd.master_item_id || null}, ${itemCode}, ${itemDesc},
                'open', ${userId})
        RETURNING id`
  );
  const doEntityId = (result.rows[0] as any).id;

  try {
    const dwgControlNumber = await generateDocumentNumber(draft.project_id, 'DWG', db);
    const procReq = classification === 'Buy' || true;
    const mfgReq = classification === 'Make' || true;
    const drawingNumber = itemBarcode || itemCode;

    await db.execute(
      sql`INSERT INTO epc_drawing_controls
          (dwg_control_number, revision_code, is_current, revision_status,
           project_id, project_item_id, master_item_id,
           drawing_number, drawing_title, drawing_revision,
           item_code, item_description, classification_snapshot,
           drawing_purpose, procurement_release_required, manufacturing_release_required,
           client_approval_required, client_approval_status,
           status, notes, created_by)
          VALUES (${dwgControlNumber}, '00', true, 'draft',
                  ${draft.project_id}, ${draft.project_item_id}, ${sd.master_item_id || null},
                  ${drawingNumber}, ${itemDesc}, ${'00'},
                  ${itemCode}, ${itemDesc}, ${classification},
                  'general', ${procReq}, ${mfgReq},
                  false, 'not_required',
                  'draft', ${'Auto-created from Drawing Order ' + draft.doc_number}, ${userId})`
    );
    console.log(`[DraftActivation] Created drawing control ${dwgControlNumber} from DO ${draft.doc_number}`);
  } catch (err: any) {
    console.error(`[DraftActivation] Warning: Failed to auto-create drawing control for DO ${draft.doc_number}:`, err.message);
  }

  return { entityId: doEntityId, entityType: 'epc_drawing_orders' };
}

async function activateWorkOrder(draft: any, userId: number): Promise<{ entityId: number; entityType: string }> {
  const sd = draft.source_data || {};
  const itemCode = sd.item_code || sd.master_item_code || '';
  const itemDesc = sd.master_item_description || sd.item_description || '';
  const quantity = parseFloat(sd.quantity) || 1;
  const masterItemId = sd.master_item_id;
  const uom = sd.uom || 'set';
  const classification = sd.make_or_buy || 'Make';
  const projectItemId = draft.project_item_id;

  const planningResult = await db.execute(
    sql`INSERT INTO item_planning_records
        (project_id, project_item_id, master_item_id, planning_type, status)
        VALUES (${draft.project_id}, ${projectItemId}, ${masterItemId}, 'make', 'active')
        RETURNING id`
  );
  const planningRecordId = (planningResult.rows[0] as any).id;

  let productionNumber: string | null = null;
  try {
    productionNumber = await generateDocumentNumber(draft.project_id, 'MFG');
  } catch (e) {
    console.warn(`[DraftActivation] Could not generate production number, proceeding without it`);
  }

  const productionAssignee = await resolveAssignee(draft.project_id, 'Production', userId, undefined, 'Manager');

  const execResult = await db.execute(
    sql`INSERT INTO production_execution_records
        (project_id, project_item_id, planning_record_id, master_item_id,
         item_code, item_description, item_specification, uom,
         drawing_no, drawing_revision, quantity, make_classification,
         production_number, status, created_by, assigned_to)
        VALUES (${draft.project_id}, ${projectItemId}, ${planningRecordId}, ${masterItemId},
                ${itemCode}, ${itemDesc}, ${sd.item_specification || null}, ${uom},
                ${sd.drawing_no || null}, ${sd.drawing_revision || null}, ${quantity}, ${classification},
                ${productionNumber}, 'active', ${userId}, ${productionAssignee})
        RETURNING id`
  );
  const executionRecordId = (execResult.rows[0] as any).id;

  const woPrepResult = await db.execute(
    sql`INSERT INTO wo_preparation_records
        (project_id, project_item_id, planning_record_id, execution_record_id,
         master_item_id, item_code, item_description, uom, quantity,
         make_classification, status, created_by)
        VALUES (${draft.project_id}, ${projectItemId}, ${planningRecordId}, ${executionRecordId},
                ${masterItemId}, ${itemCode}, ${itemDesc}, ${uom}, ${quantity},
                ${classification}, 'ready', ${userId})
        RETURNING id`
  );
  const woPrepId = (woPrepResult.rows[0] as any).id;

  const epcWoResult = await db.execute(
    sql`INSERT INTO epc_work_orders
        (wo_number, project_id, project_item_id, planning_record_id, execution_record_id,
         wo_preparation_id, master_item_id, item_code, item_description, uom,
         quantity, make_classification, status, created_by,
         wo_notes)
        VALUES (${draft.doc_number}, ${draft.project_id}, ${projectItemId},
                ${planningRecordId}, ${executionRecordId},
                ${woPrepId}, ${masterItemId}, ${itemCode}, ${itemDesc}, ${uom},
                ${quantity}, ${classification}, 'draft', ${userId},
                ${'Auto-created from Execution Draft ' + draft.doc_number})
        RETURNING id`
  );
  const woEntityId = (epcWoResult.rows[0] as any).id;

  let qualityPlanId: number | null = null;
  try {
    const qpNumber = await generateDocumentNumber(draft.project_id, 'QPL');
    const qpResult = await db.execute(
      sql`INSERT INTO quality_planning_records
          (project_id, project_item_id, master_item_id, source_context,
           item_code, item_description, uom, quantity,
           quality_requirement_type, quality_plan_number, quality_notes,
           status, created_by, created_at, updated_at)
          VALUES (${draft.project_id}, ${projectItemId}, ${masterItemId}, 'work_order',
                  ${itemCode}, ${itemDesc}, ${uom}, ${quantity},
                  'standard_inspection', ${qpNumber},
                  ${'Auto-created from WO activation ' + draft.doc_number},
                  'draft', ${userId}, NOW(), NOW())
          RETURNING id`
    );
    qualityPlanId = (qpResult.rows[0] as any).id;
    await db.execute(
      sql`UPDATE epc_work_orders SET quality_plan_id = ${qualityPlanId}, updated_at = NOW() WHERE id = ${woEntityId}`
    );
    console.log(`[DraftActivation] Quality plan ${qpNumber} (id=${qualityPlanId}) created for WO #${woEntityId}`);
  } catch (qpErr) {
    console.error(`[DraftActivation] Non-critical: failed to create quality plan for WO #${woEntityId}`, qpErr);
  }

  console.log(`[DraftActivation] WO chain: planning #${planningRecordId} → execution #${executionRecordId} → wo_prep #${woPrepId} → epc_work_order #${woEntityId} → quality_plan #${qualityPlanId}`);
  return { entityId: woEntityId, entityType: 'epc_work_orders' };
}

export async function linkEntityToDraft(
  draftId: number,
  entityId: number,
  entityType: string,
  userId: number
): Promise<{ success: boolean; error?: string }> {
  const draftResult = await db.execute(
    sql`SELECT * FROM execution_drafts WHERE id = ${draftId}`
  );
  if (draftResult.rows.length === 0) {
    return { success: false, error: 'Draft not found.' };
  }
  const draft = draftResult.rows[0] as any;

  if (draft.activation_status === 'activated') {
    return { success: false, error: 'Draft already activated.' };
  }
  if (draft.approval_status !== 'approved') {
    return { success: false, error: 'Draft must be approved to link an entity.' };
  }

  await db.execute(
    sql`UPDATE execution_drafts
        SET activation_status = 'activated',
            activated_entity_id = ${entityId},
            activated_entity_type = ${entityType},
            activated_by = ${userId},
            activated_at = NOW(),
            updated_at = NOW()
        WHERE id = ${draftId}`
  );

  console.log(`[DraftActivation] Draft #${draftId} linked to ${entityType} #${entityId}`);
  return { success: true };
}

export async function linkIODraftToTriggeredIO(
  projectId: number,
  projectItemId: number,
  ioNumber: string,
  ioId: number,
  triggerSource: string
): Promise<void> {
  const ioDraft = await db.execute(
    sql`SELECT id, doc_number FROM execution_drafts
        WHERE project_id = ${projectId}
          AND project_item_id = ${projectItemId}
          AND doc_type = 'IO'
          AND applicable = true
          AND approval_status = 'approved'
          AND activation_status != 'activated'
        LIMIT 1`
  );

  if (ioDraft.rows.length === 0) return;

  const draft = ioDraft.rows[0] as any;
  const actualDocNumber = draft.doc_number !== ioNumber ? ioNumber : null;

  await db.execute(
    sql`UPDATE execution_drafts
        SET activation_status = 'activated',
            activated_entity_id = ${ioId},
            activated_entity_type = 'inspection_orders',
            activated_at = NOW(),
            actual_doc_number = ${actualDocNumber},
            updated_at = NOW()
        WHERE id = ${draft.id}`
  );

  console.log(`[DraftActivation] IO draft #${draft.id} linked to triggered IO #${ioId} (${ioNumber}) via ${triggerSource}`);
}
