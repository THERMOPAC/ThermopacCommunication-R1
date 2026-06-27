import { db } from '../db';
import { sql } from 'drizzle-orm';
import { createEpcTask } from '../epc-task-helpers';
import { resolveEpcAssignee, requireEpcAssignee } from '../epc-assignment-engine';
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

    if (docType === 'PO') {
      const { entityId, entityType } = await activatePurchaseOrder(draft, userId);

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

      console.log(`[DraftActivation] PO ${draft.doc_number} → purchase_order #${entityId}`);
      return { success: true, entityId, entityType, message: `Purchase Order ${draft.doc_number} created successfully.` };
    }

    return { success: false, error: `Unknown doc type: ${docType}` };
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

  const effectiveClassification = classification?.toLowerCase() ?? null;
  if (!effectiveClassification) {
    throw new Error(
      `[DraftActivation] BLOCKED: Cannot activate Drawing Order for unclassified item ` +
      `(make_or_buy is null on source_data). project_item_id=${draft.project_item_id}, ` +
      `doc=${draft.doc_number}. Set make_or_buy on the project item before activating.`
    );
  }
  if (effectiveClassification === 'buy') {
    throw new Error(
      `[DraftActivation] BLOCKED: Cannot activate Drawing Order for Buy item. ` +
      `project_item_id=${draft.project_item_id}, doc=${draft.doc_number}. ` +
      `Drawing Orders and Drawing Controls are only applicable to Make items.`
    );
  }

  let itemBarcode: string | null = null;
  let liveMasterItemId: number | null = sd.master_item_id || null;
  if (draft.project_item_id) {
    const piResult = await db.execute(
      sql`SELECT code_bars, item_id FROM project_items WHERE id = ${draft.project_item_id}`
    );
    if (piResult.rows.length > 0) {
      itemBarcode = (piResult.rows[0] as any).code_bars || null;
      if (!liveMasterItemId) {
        liveMasterItemId = (piResult.rows[0] as any).item_id || null;
      }
    }
  }

  const result = await db.execute(
    sql`INSERT INTO epc_drawing_orders
        (do_number, project_id, project_item_id, master_item_id, item_code, item_description,
         status, created_by)
        VALUES (${draft.doc_number}, ${draft.project_id}, ${draft.project_item_id},
                ${liveMasterItemId}, ${itemCode}, ${itemDesc},
                'open', ${userId})
        RETURNING id`
  );
  const doEntityId = (result.rows[0] as any).id;

  try {
    const dwgControlNumber = await generateDocumentNumber(draft.project_id, 'DWG', db);
    const procReq = effectiveClassification === 'buy';
    const mfgReq = effectiveClassification === 'make';
    const drawingNumber = itemBarcode || itemCode;

    let designAssigneeId: number | null = null;
    try {
      const dwgAssigneeResult = await resolveEpcAssignee('DWG_prepare', draft.project_id, String(userId));
      designAssigneeId = dwgAssigneeResult.userId || null;
    } catch (dwgAssigneeErr: any) {
      console.warn(`[DraftActivation] DWG_prepare assignee not resolved for DO ${draft.doc_number}: ${dwgAssigneeErr.message} — DWG will be created unassigned`);
    }

    const dwgInsertResult = await db.execute(
      sql`INSERT INTO epc_drawing_controls
          (dwg_control_number, revision_code, is_current, revision_status,
           project_id, project_item_id, master_item_id,
           drawing_number, drawing_title, drawing_revision,
           item_code, item_description, classification_snapshot,
           drawing_purpose, procurement_release_required, manufacturing_release_required,
           client_approval_required, client_approval_status,
           status, notes, created_by, assigned_to)
          VALUES (${dwgControlNumber}, '00', true, 'draft',
                  ${draft.project_id}, ${draft.project_item_id}, ${liveMasterItemId},
                  ${drawingNumber}, ${itemDesc}, ${'00'},
                  ${itemCode}, ${itemDesc}, ${classification},
                  'general', ${procReq}, ${mfgReq},
                  false, 'not_required',
                  'draft', ${'Auto-created from Drawing Order ' + draft.doc_number}, ${userId}, ${designAssigneeId})
          RETURNING id`
    );
    const dwgRecordId = (dwgInsertResult.rows[0] as any)?.id;
    console.log(`[DraftActivation] Created drawing control ${dwgControlNumber} from DO ${draft.doc_number} (assigned to user ${designAssigneeId})`);

    const projCodeResult = await db.execute(sql`SELECT code FROM projects WHERE id = ${draft.project_id}`);
    const projCode = projCodeResult.rows.length > 0 ? (projCodeResult.rows[0] as any).code : '';

    if (designAssigneeId && dwgRecordId) {
      await createEpcTask({
        projectId: draft.project_id, entityType: 'drawing_control', recordId: dwgRecordId, actionCode: 'upload',
        title: `Upload Drawing ${dwgControlNumber} for ${projCode}`,
        description: `Drawing ${dwgControlNumber} (${itemDesc || itemCode}) has been created for project ${projCode}. Please upload the drawing file and submit for review.`,
        assignedTo: designAssigneeId, createdBy: userId, priority: 'Medium', dueDays: 5,
      });
      console.log(`[DraftActivation] Created upload task for ${dwgControlNumber} assigned to user ${designAssigneeId}`);
    }

    try {
      if (!liveMasterItemId) {
        throw new Error(
          `Cannot create BOM for DO draft ${draft.doc_number} (project item ${draft.project_item_id}): ` +
          `master_item_id is NULL. Assign a master item to this project item before activating.`
        );
      }
      // Use resolveEpcAssignee (not require) so BOM is always created even if assignee resolution fails
      let bomAssigneeId: number | null = null;
      try {
        const bomAssigneeResult = await resolveEpcAssignee('BOM_prepare', draft.project_id, String(userId));
        bomAssigneeId = bomAssigneeResult.userId || null;
      } catch (assigneeErr: any) {
        console.warn(`[DraftActivation] BOM_prepare assignee not resolved for DO ${draft.doc_number}: ${assigneeErr.message} — BOM will be created unassigned`);
      }
      const bomNumber = await generateDocumentNumber(draft.project_id, 'BOM', db);
      const bomInsert = await db.execute(
        sql`INSERT INTO epc_bom_headers
            (bom_number, project_id, project_item_id, master_item_id, drawing_control_id,
             bom_type, bom_title, bom_description, item_code, item_description,
             classification_snapshot, drawing_number, drawing_revision,
             status, is_current, created_by, assigned_to)
            VALUES (${bomNumber}, ${draft.project_id}, ${draft.project_item_id}, ${liveMasterItemId}, ${dwgRecordId},
                    'assembly', ${'BOM for ' + (itemDesc || itemCode)}, ${'Auto-created from Drawing Order ' + draft.doc_number},
                    ${itemCode}, ${itemDesc},
                    ${classification}, ${drawingNumber}, ${'00'},
                    'draft', true, ${userId}, ${bomAssigneeId})
            RETURNING id`
      );
      const bomId = (bomInsert.rows[0] as any)?.id;
      console.log(`[DraftActivation] Created BOM ${bomNumber} linked to DWG ${dwgControlNumber} (assigned to user ${bomAssigneeId ?? 'unassigned'})`);

      // Auto-populate BOM lines from offer sub-items if this project item's offer item is the main (parent) item
      let bomLinesCreated = 0;
      let isOfferBacked = false;
      if (bomId && draft.project_item_id) {
        try {
          // Get this project item's source offer item
          const piOfferResult = await db.execute(
            sql`SELECT pi.source_offer_item_id, pi.source_offer_id, oi.is_sub_item
                FROM project_items pi
                LEFT JOIN offer_items oi ON oi.id = pi.source_offer_item_id
                WHERE pi.id = ${draft.project_item_id}`
          );
          const piOffer = piOfferResult.rows[0] as any;
          isOfferBacked = !!(piOffer?.source_offer_id);

          // Only auto-populate for the main (non-sub) item
          if (piOffer?.source_offer_id && piOffer?.is_sub_item === false) {
            const offerId = piOffer.source_offer_id;
            const mainOfferItemId = piOffer.source_offer_item_id;

            // Find all offer sub-items — those with parent_item_id = mainOfferItemId OR (parent_item_id IS NULL AND is_sub_item = true)
            const subItemsResult = await db.execute(
              sql`SELECT oi.id as offer_item_id, oi.product_code, oi.description, oi.quantity, oi.unit, oi.unit_price,
                         pi2.id as project_item_id, pi2.item_id as master_item_id, pi2.item_code as pi_item_code,
                         mi.item_code as master_code, mi.description as master_desc, mi.uom, mi.make_or_buy, mi.standard_cost
                  FROM offer_items oi
                  LEFT JOIN project_items pi2 ON pi2.project_id = ${draft.project_id} AND pi2.source_offer_item_id = oi.id
                  LEFT JOIN master_items mi ON mi.id = pi2.item_id
                  WHERE oi.offer_id = ${offerId}
                    AND oi.is_sub_item = true
                    AND (oi.parent_item_id = ${mainOfferItemId} OR oi.parent_item_id IS NULL)
                  ORDER BY oi.sort_order, oi.id`
            );

            let lineNum = 1;
            for (const sub of subItemsResult.rows as any[]) {
              if (!sub.master_item_id) {
                console.warn(`[DraftActivation] BOM line skipped for offer sub-item ${sub.offer_item_id} — no master_item found in project_items`);
                continue;
              }
              await db.execute(
                sql`INSERT INTO epc_bom_lines
                    (bom_header_id, line_number, component_item_id, component_item_code,
                     component_description, component_uom, component_make_or_buy,
                     quantity_per_unit, estimated_unit_cost, estimated_total_cost, planning_required)
                    VALUES (${bomId}, ${lineNum}, ${sub.master_item_id}, ${sub.master_code || sub.product_code},
                            ${sub.master_desc || sub.description}, ${sub.uom || sub.unit}, ${sub.make_or_buy || null},
                            ${parseFloat(sub.quantity) || 1},
                            ${sub.standard_cost || sub.unit_price || null},
                            ${(parseFloat(sub.standard_cost || sub.unit_price || '0') * (parseFloat(sub.quantity) || 1)) || null},
                            true)`
              );
              lineNum++;
              bomLinesCreated++;
            }
            if (bomLinesCreated > 0) {
              console.log(`[DraftActivation] Auto-populated ${bomLinesCreated} BOM lines for ${bomNumber} from offer ${offerId}`);
            }
          }

          // Auto-release BOM if project comes from an offer — offer confirmation is the BOM approval
          if (piOffer?.source_offer_id) {
            await db.execute(sql`UPDATE epc_bom_headers SET status = 'released' WHERE id = ${bomId}`);
            console.log(`[DraftActivation] BOM ${bomNumber} auto-released (offer-backed project, no human step required)`);
          }
        } catch (bomLineErr: any) {
          console.warn(`[DraftActivation] BOM line auto-population failed for ${bomNumber}:`, bomLineErr.message);
        }
      }

      const taskDesc = isOfferBacked
        ? `Bill of Materials ${bomNumber} (${itemDesc || itemCode}) has been auto-released for project ${projCode}. BOM lines are pre-populated from the confirmed offer (${bomLinesCreated} lines). No further action required.`
        : `Bill of Materials ${bomNumber} (${itemDesc || itemCode}) has been created for project ${projCode}. Please add BOM lines and submit for review.`;

      if (bomAssigneeId && bomId) {
        await createEpcTask({
          projectId: draft.project_id, entityType: 'bom_header', recordId: bomId, actionCode: 'prepare',
          title: `Prepare BOM ${bomNumber} for ${projCode}`,
          description: taskDesc,
          assignedTo: bomAssigneeId, createdBy: userId, priority: 'Medium', dueDays: 7,
        });
      }
    } catch (bomErr: any) {
      console.error(`[DraftActivation] FAILED to auto-create BOM for DO ${draft.doc_number}:`, bomErr.message, bomErr.stack);
    }
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
  const uom = sd.uom || 'set';
  const classification = sd.make_or_buy || 'Make';
  const projectItemId = draft.project_item_id;
  const isService = classification.toLowerCase() === 'service';

  // Resolve master_item_id live from project_items when source_data is stale/null
  let masterItemId: number | null = sd.master_item_id ? Number(sd.master_item_id) : null;
  if (!masterItemId) {
    const piRow = await db.execute(
      sql`SELECT item_id FROM project_items WHERE id = ${projectItemId} LIMIT 1`
    );
    masterItemId = (piRow.rows[0] as any)?.item_id || null;
    if (masterItemId) {
      console.log(`[DraftActivation] WO draft ${draft.id}: resolved live master_item_id=${masterItemId} for project_item_id=${projectItemId}`);
    }
  }

  // Live lookup: inject description, specification, drawing_no from master_items + epc_drawing_controls
  // source_data snapshot never carried these fields reliably — always read live at activation time
  let liveSpec: string | null = null;
  let liveDrawingNo: string | null = null;
  if (masterItemId) {
    const liveRow = await db.execute(sql`
      SELECT mi.description AS live_desc, mi.specification AS live_spec,
             dc.drawing_number AS live_drawing_no
      FROM master_items mi
      LEFT JOIN epc_drawing_controls dc
        ON dc.project_item_id = ${projectItemId} AND dc.is_current = true
      WHERE mi.id = ${masterItemId}
      LIMIT 1
    `);
    const live = liveRow.rows[0] as any;
    if (live) {
      if (!itemDesc && live.live_desc) itemDesc = live.live_desc;
      liveSpec = live.live_spec || null;
      liveDrawingNo = live.live_drawing_no || null;
    }
  }
  const itemSpec: string | null = sd.item_specification || liveSpec || null;
  const drawingNo: string | null = sd.drawing_no || liveDrawingNo || null;

  const planningType = isService ? 'service' : 'make';
  const planningAssigneeResult = isService
    ? await requireEpcAssignee('PLN_prepare', draft.project_id, 'full_auto')
    : await requireEpcAssignee('WO_prepare', draft.project_id, 'full_auto');
  const planningAssignee = planningAssigneeResult.userId;
  let planningNumber: string | null = null;
  try {
    planningNumber = await generateDocumentNumber(draft.project_id, 'PLN', db);
  } catch (e) {
    console.warn(`[DraftActivation] Could not generate PLN number, proceeding without it`);
  }

  const planningResult = await db.execute(
    sql`INSERT INTO item_planning_records
        (project_id, project_item_id, master_item_id, planning_type, planning_number, quantity, source, status, created_by, assigned_to)
        VALUES (${draft.project_id}, ${projectItemId}, ${masterItemId}, ${planningType}, ${planningNumber}, ${quantity}, 'wo_draft', 'active', ${userId}, ${planningAssignee})
        RETURNING id`
  );
  const planningRecordId = (planningResult.rows[0] as any).id;

  let executionRecordId: number | null = null;
  let woPrepId: number | null = null;

  if (!isService) {
    if (!masterItemId) {
      throw new Error(
        `Cannot activate WO draft ${draft.doc_number} (project item ${projectItemId}): ` +
        `master_item_id is NULL. Assign a master item to this project item before activating.`
      );
    }

    let productionNumber: string | null = null;
    try {
      productionNumber = await generateDocumentNumber(draft.project_id, 'MFG', db);
    } catch (e) {
      console.warn(`[DraftActivation] Could not generate production number, proceeding without it`);
    }

    const productionAssigneeResult = await requireEpcAssignee('WO_prepare', draft.project_id, 'full_auto');
    const productionAssignee = productionAssigneeResult.userId;

    const execResult = await db.execute(
      sql`INSERT INTO production_execution_records
          (project_id, project_item_id, planning_record_id, master_item_id,
           item_code, item_description, item_specification, uom,
           drawing_no, drawing_revision, quantity, make_classification,
           production_number, status, created_by, assigned_to)
          VALUES (${draft.project_id}, ${projectItemId}, ${planningRecordId}, ${masterItemId},
                  ${itemCode}, ${itemDesc}, ${itemSpec}, ${uom},
                  ${drawingNo}, ${sd.drawing_revision || null}, ${quantity}, ${classification},
                  ${productionNumber}, 'active', ${userId}, ${productionAssignee})
          RETURNING id`
    );
    executionRecordId = (execResult.rows[0] as any).id;
  }

  const woPrepResult = await db.execute(
    sql`INSERT INTO wo_preparation_records
        (project_id, project_item_id, planning_record_id, execution_record_id,
         master_item_id, item_code, item_description, item_specification, uom,
         drawing_no, quantity, make_classification, status, created_by)
        VALUES (${draft.project_id}, ${projectItemId}, ${planningRecordId}, ${executionRecordId},
                ${masterItemId}, ${itemCode}, ${itemDesc}, ${itemSpec}, ${uom},
                ${drawingNo}, ${quantity}, ${classification}, 'ready', ${userId})
        RETURNING id`
  );
  woPrepId = (woPrepResult.rows[0] as any).id;

  let woCreatedBy = userId;
  if (isService) {
    const woCreatedByResult = await resolveEpcAssignee('PLN_prepare', draft.project_id, 'full_auto');
    woCreatedBy = woCreatedByResult.userId ?? userId;
  }

  const epcWoResult = await db.execute(
    sql`INSERT INTO epc_work_orders
        (wo_number, project_id, project_item_id, planning_record_id, execution_record_id,
         wo_preparation_id, master_item_id, item_code, item_description, item_specification,
         uom, drawing_no, quantity, make_classification, status, created_by,
         wo_notes)
        VALUES (${draft.doc_number}, ${draft.project_id}, ${projectItemId},
                ${planningRecordId}, ${executionRecordId},
                ${woPrepId}, ${masterItemId}, ${itemCode}, ${itemDesc}, ${itemSpec},
                ${uom}, ${drawingNo}, ${quantity}, ${classification}, 'draft', ${woCreatedBy},
                ${'Auto-created from Execution Draft ' + draft.doc_number})
        RETURNING id`
  );
  const woEntityId = (epcWoResult.rows[0] as any).id;

  let qualityPlanId: number | null = null;
  if (!isService) {
    try {
      const qpNumber = await generateDocumentNumber(draft.project_id, 'QPL', db);
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
  }

  console.log(`[DraftActivation] WO chain (${classification}): planning #${planningRecordId} → execution #${executionRecordId} → wo_prep #${woPrepId} → epc_work_order #${woEntityId} → quality_plan #${qualityPlanId}`);
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

async function activatePurchaseOrder(draft: any, userId: number): Promise<{ entityId: number; entityType: string }> {
  const sd = draft.source_data || {};
  const itemCode = sd.item_code || sd.master_item_code || '';
  const itemDesc = sd.master_item_description || sd.item_description || '';
  const quantity = parseFloat(sd.quantity) || 1;
  const uom = sd.uom || 'set';
  const classification = sd.make_or_buy || 'Buy';
  const projectItemId = draft.project_item_id;

  // Resolve master_item_id live from project_items when source_data is stale/null
  let masterItemId: number | null = sd.master_item_id ? Number(sd.master_item_id) : null;
  if (!masterItemId) {
    const piRow = await db.execute(
      sql`SELECT item_id FROM project_items WHERE id = ${projectItemId} LIMIT 1`
    );
    masterItemId = (piRow.rows[0] as any)?.item_id || null;
    if (masterItemId) {
      console.log(`[DraftActivation] PO draft ${draft.id}: resolved live master_item_id=${masterItemId} for project_item_id=${projectItemId}`);
    }
  }

  const purchaseAssigneeResult = await requireEpcAssignee('PO_prepare', draft.project_id, 'full_auto');
  const purchaseAssignee = purchaseAssigneeResult.userId;

  let buyPlanningNumber: string | null = null;
  try {
    buyPlanningNumber = await generateDocumentNumber(draft.project_id, 'PLN', db);
  } catch (e) {
    console.warn(`[DraftActivation] Could not generate PLN number for buy record, proceeding without it`);
  }

  const planningResult = await db.execute(
    sql`INSERT INTO item_planning_records
        (project_id, project_item_id, master_item_id, planning_type, planning_number, quantity, source, status, created_by, assigned_to)
        VALUES (${draft.project_id}, ${projectItemId}, ${masterItemId}, 'buy', ${buyPlanningNumber}, ${quantity}, 'po_draft', 'active', ${userId}, ${purchaseAssignee})
        RETURNING id`
  );
  const planningRecordId = (planningResult.rows[0] as any).id;

  let poPrepNumber: string | null = null;
  try {
    poPrepNumber = await generateDocumentNumber(draft.project_id, 'POP', db);
  } catch (e) {
    console.warn(`[DraftActivation] Could not generate PO prep number, proceeding without it`);
  }

  const poPrepResult = await db.execute(
    sql`INSERT INTO po_preparation_records
        (project_id, project_item_id, planning_record_id, execution_record_id,
         master_item_id, item_code, item_description, uom, quantity,
         po_prep_number, status, created_by, assigned_to, created_at, updated_at)
        VALUES (${draft.project_id}, ${projectItemId}, ${planningRecordId}, ${null},
                ${masterItemId}, ${itemCode}, ${itemDesc}, ${uom}, ${quantity},
                ${poPrepNumber}, 'ready', ${userId}, ${purchaseAssignee}, NOW(), NOW())
        RETURNING id`
  );
  const poPrepId = (poPrepResult.rows[0] as any).id;

  const poResult = await db.execute(
    sql`INSERT INTO epc_purchase_orders
        (po_number, project_id, project_item_id, planning_record_id,
         po_preparation_id, master_item_id,
         status, created_by,
         po_notes)
        VALUES (${draft.doc_number}, ${draft.project_id}, ${projectItemId}, ${planningRecordId},
                ${poPrepId}, ${masterItemId},
                'draft', ${purchaseAssignee},
                ${'Auto-created from Execution Draft ' + draft.doc_number})
        RETURNING id`
  );
  const poEntityId = (poResult.rows[0] as any).id;

  console.log(`[DraftActivation] PO chain (${classification}): planning #${planningRecordId} → po_prep #${poPrepId} → epc_purchase_order #${poEntityId}`);
  return { entityId: poEntityId, entityType: 'epc_purchase_orders' };
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
