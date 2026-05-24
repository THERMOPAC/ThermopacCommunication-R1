import { db, pool } from '../db';
import { sql, inArray } from 'drizzle-orm';
import { projectItems } from '../../shared/schema';
import { getNextDocSeq } from '../doc-sequence-service';
import { createEpcTask } from '../epc-task-helpers';
import { resolveEpcAssignee } from '../epc-assignment-engine';
import * as epcCoding from '../epc-coding';
import {
  DraftDocType, ApprovalStatus, DependencyStatus,
  DraftGenerationSummary, ROUTING_MAP, SLA_DAYS, PRIORITY_MAP,
} from './pipeline-types';

export interface SyncAndGenerateSummary extends DraftGenerationSummary {
  itemsAdded: number;
}

export async function syncAndGenerateExecutionDrafts(
  projectId: number,
  userId: number
): Promise<SyncAndGenerateSummary> {
  const { itemsAdded, newItemIds } = await syncMissingProductChildren(projectId);
  const summary = await generateExecutionDrafts(projectId, userId);

  if (newItemIds.length > 0) {
    syncNewItemsToSap(newItemIds).catch(err =>
      console.error(`[EPC Sync] SAP batch sync failed (non-blocking):`, err.message)
    );
  }

  try {
    const { executeFullAutoPipeline } = await import('./full-auto-orchestrator');
    await executeFullAutoPipeline(projectId, userId);
    console.log(`[EPC Sync] Full-auto pipeline complete for project ${projectId}`);
  } catch (pipeErr: any) {
    console.error(`[EPC Sync] Full-auto pipeline failed (non-blocking):`, pipeErr.message);
  }

  return { ...summary, itemsAdded };
}

async function syncNewItemsToSap(itemIds: number[]): Promise<void> {
  const { syncProjectItemToSap } = await import('../project-item-detail-routes');
  const items = await db.select().from(projectItems).where(inArray(projectItems.id, itemIds));
  for (const item of items) {
    const result = await syncProjectItemToSap(item);
    if (result.error) {
      console.error(`[EPC Sync] SAP sync failed for item ${item.itemCode}: ${result.error}`);
    } else {
      console.log(`[EPC Sync] SAP sync OK for item ${item.itemCode}`);
    }
  }
}

async function findOrCreateMasterItem(
  client: any,
  productCode: string,
  description: string,
  unit: string,
  estimatedCost: string | null,
  hsnSacCode: string | null,
  itemCode: string,
): Promise<number> {
  const existing = await client.query(
    `SELECT id FROM master_items WHERE item_code = $1 LIMIT 1`,
    [itemCode]
  );
  if (existing.rows.length > 0) return existing.rows[0].id as number;

  const productRow = await client.query(
    `SELECT make_or_buy FROM products WHERE product_code = $1 LIMIT 1`,
    [productCode]
  );
  const makeOrBuy = productRow.rows.length > 0 ? (productRow.rows[0].make_or_buy || 'Make') : 'Make';

  const created = await client.query(
    `INSERT INTO master_items
     (item_code, description, uom, make_or_buy, estimated_cost, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING id`,
    [
      itemCode, description, unit || 'set', makeOrBuy,
      estimatedCost || null,
      hsnSacCode ? `HSN/SAC: ${hsnSacCode}` : null,
    ]
  );
  return created.rows[0].id as number;
}

async function syncMissingProductChildren(projectId: number): Promise<{ itemsAdded: number; newItemIds: number[] }> {
  const projResult = await db.execute(
    sql`SELECT id, code, fy_code, project_seq FROM projects WHERE id = ${projectId}`
  );
  if (projResult.rows.length === 0) throw new Error(`Project ${projectId} not found`);
  const project = projResult.rows[0];
  const fyCode = project.fy_code as string;
  const projectSeq = project.project_seq as string;
  const projectCode = project.code as string;

  const bpResult = await db.execute(
    sql`SELECT bp_code FROM project_items WHERE project_id = ${projectId} AND bp_code IS NOT NULL LIMIT 1`
  );
  const customerBpCode = (bpResult.rows.length > 0 ? bpResult.rows[0].bp_code as string : '') || '';

  const level2Items = await db.execute(
    sql`SELECT id, product_code, parent_project_item_id
        FROM project_items
        WHERE project_id = ${projectId}
          AND parent_project_item_id IS NOT NULL
          AND product_code IS NOT NULL`
  );

  if (level2Items.rows.length === 0) return { itemsAdded: 0, newItemIds: [] };

  let itemsAdded = 0;
  const newItemIds: number[] = [];
  const client = await pool.connect();
  try {
    for (const parentItem of level2Items.rows) {
      const parentProjectItemId = parentItem.id as number;
      const productCode = parentItem.product_code as string;

      const productResult = await db.execute(
        sql`SELECT id FROM products WHERE product_code = ${productCode} LIMIT 1`
      );
      if (productResult.rows.length === 0) continue;
      const productId = productResult.rows[0].id as number;

      const childRows = await db.execute(
        sql`SELECT pc.quantity, pc.sort_order, p.product_code, p.description, p.unit,
                   p.unit_price, p.make_or_buy, p.hsn_sac_code
            FROM product_children pc
            JOIN products p ON p.id = pc.child_product_id
            WHERE pc.parent_product_id = ${productId}
            ORDER BY pc.sort_order, pc.id`
      );
      if (childRows.rows.length === 0) continue;

      for (const child of childRows.rows) {
        const childProductCode = child.product_code as string;

        const childBaseCode = customerBpCode
          ? `${customerBpCode}-${childProductCode}`
          : childProductCode;
        const childItemCode = epcCoding.buildProjectItemCode(childBaseCode, fyCode, projectSeq);

        const dupCheck = await db.execute(
          sql`SELECT id FROM project_items WHERE item_code = ${childItemCode} LIMIT 1`
        );
        if (dupCheck.rows.length > 0) continue;
        const childCodeBars = await epcCoding.generateCodeBars(customerBpCode, fyCode, projectSeq, client);

        const childMasterItemId = await findOrCreateMasterItem(
          client, childProductCode, child.description as string,
          child.unit as string, child.unit_price as string,
          child.hsn_sac_code as string | null, childBaseCode
        );

        const makeOrBuy = (child.make_or_buy as string) || 'Make';
        const qty = Number(child.quantity) || 1;
        const desc = child.description as string;
        const uom = (child.unit as string) || 'set';
        const estimatedCost = child.unit_price as string | null;

        const insertResult = await db.execute(
          sql`INSERT INTO project_items
              (project_id, project_code, item_id, item_code, code_bars, description, uom,
               make_or_buy, quantity, estimated_cost, notes, status, source,
               parent_project_item_id, product_code, created_at, updated_at)
              VALUES (${projectId}, ${projectCode}, ${childMasterItemId}, ${childItemCode},
                      ${childCodeBars}, ${desc}, ${uom}, ${makeOrBuy},
                      ${qty}, ${estimatedCost}, ${desc}, 'Not Started', 'epc_workflow_sync',
                      ${parentProjectItemId}, ${childProductCode}, NOW(), NOW())
              RETURNING id`
        );
        const newId = (insertResult.rows[0] as any)?.id as number;
        if (newId) newItemIds.push(newId);
        itemsAdded++;
        console.log(`[EPC Sync] Added missing item ${childItemCode} under parent #${parentProjectItemId}`);
      }
    }
  } finally {
    client.release();
  }
  return { itemsAdded, newItemIds };
}

interface ProjectRecord {
  id: number;
  code: string;
  fyCode: string;
  projectSeq: string;
}

interface ProjectItemRecord {
  id: number;
  makeOrBuy: string | null;
  itemCode: string | null;
  description: string | null;
  quantity: string | null;
  uom: string | null;
  masterItemId: number | null;
  masterItemCode: string | null;
  masterItemDescription: string | null;
}

export async function generateExecutionDrafts(
  projectId: number,
  userId: number,
  tx?: any
): Promise<DraftGenerationSummary> {
  const executor = tx || db;
  const summary: DraftGenerationSummary = {
    projectId,
    created: 0,
    notApplicable: 0,
    blocked: 0,
    failed: 0,
    drafts: [],
  };

  const projResult = await executor.execute(
    sql`SELECT id, code, fy_code, project_seq FROM projects WHERE id = ${projectId}`
  );
  if (projResult.rows.length === 0) {
    throw new Error(`Project ${projectId} not found`);
  }
  const project: ProjectRecord = {
    id: projResult.rows[0].id as number,
    code: projResult.rows[0].code as string,
    fyCode: projResult.rows[0].fy_code as string,
    projectSeq: projResult.rows[0].project_seq as string,
  };

  const itemsResult = await executor.execute(
    sql`SELECT pi.id, pi.make_or_buy, pi.item_code, pi.description, pi.quantity, pi.uom,
               pi.item_id as master_item_id,
               mi.item_code as master_item_code, mi.description as master_item_description
        FROM project_items pi
        LEFT JOIN master_items mi ON mi.id = pi.item_id
        WHERE pi.project_id = ${projectId}
        ORDER BY pi.id`
  );

  if (itemsResult.rows.length === 0) {
    console.log(`[ExecutionDrafts] No items for project ${projectId}, skipping`);
    return summary;
  }

  for (const row of itemsResult.rows) {
    const item: ProjectItemRecord = {
      id: row.id as number,
      makeOrBuy: row.make_or_buy as string | null,
      itemCode: row.item_code as string | null,
      description: row.description as string | null,
      quantity: row.quantity as string | null,
      uom: row.uom as string | null,
      masterItemId: row.master_item_id as number | null,
      masterItemCode: row.master_item_code as string | null,
      masterItemDescription: row.master_item_description as string | null,
    };

    const existing = await executor.execute(
      sql`SELECT id FROM execution_drafts
          WHERE project_id = ${projectId} AND project_item_id = ${item.id}
            AND approval_status NOT IN ('rejected', 'canceled', 'not_applicable')
          LIMIT 1`
    );
    if (existing.rows.length > 0) {
      console.log(`[ExecutionDrafts] Drafts already exist for item ${item.id}, skipping`);
      continue;
    }

    const classification = (item.makeOrBuy || 'Make').toLowerCase();
    const isMake = classification === 'make';
    const isService = classification === 'service';
    const docTypes: DraftDocType[] = ['DO', 'WO', 'PO', 'IO'];

    for (const docType of docTypes) {
      const applicable = getApplicability(docType, isMake, isService);

      if (!applicable) {
        await insertDraft(executor, {
          projectId,
          projectItemId: item.id,
          docType,
          applicable: false,
          docNumber: null,
          approvalStatus: 'not_applicable',
          activationStatus: 'not_activated',
          dependencyDocType: null,
          dependencyStatus: 'not_required',
          sourceData: {},
          generatedByUserId: userId,
        });
        summary.notApplicable++;
        summary.drafts.push({
          docType,
          docNumber: null,
          projectItemId: item.id,
          approvalStatus: 'not_applicable',
          applicable: false,
        });
        continue;
      }

      let docNumber: string;
      if (docType === 'IO') {
        const seq = await getNextDocSeq('IO', projectId, executor);
        const category = isMake ? 'M' : 'B';
        docNumber = `IO-${project.fyCode}-${project.projectSeq}-${category}-${seq}`;
      } else {
        const seq = await getNextDocSeq(docType, projectId, executor);
        docNumber = `${project.code}-${docType}-${seq}`;
      }

      const depDocType = getDependencyDocType(docType, isMake, isService);
      const depStatus = isService ? 'not_required' as DependencyStatus : getDependencyStatus(docType, isMake);
      const approvalStatus: ApprovalStatus = depStatus === 'blocked' ? 'draft' : 'pending_approval';

      const sourceData = buildSourceData(item, docType, isMake);

      const draftResult = await insertDraft(executor, {
        projectId,
        projectItemId: item.id,
        docType,
        applicable: true,
        docNumber,
        approvalStatus,
        activationStatus: 'not_activated',
        dependencyDocType: depDocType,
        dependencyStatus: depStatus,
        sourceData,
        generatedByUserId: userId,
      });

      const draftId = draftResult;

      if (approvalStatus === 'pending_approval') {
        const workflowCodeMap: Record<DraftDocType, string> = { DO: 'DWG_approve', WO: 'WO_approve', PO: 'PO_approve', IO: 'INS_execute' };
        const assignment = await resolveEpcAssignee(workflowCodeMap[docType], projectId, 'pipeline', executor);
        const assignee = assignment.userId;
        const taskId = await createEpcTask({
          projectId,
          entityType: 'execution_draft',
          recordId: draftId,
          actionCode: 'approve',
          title: `Approve ${docType} ${docNumber} for ${item.itemCode || item.masterItemCode || `Item #${item.id}`}`,
          description: `Execution draft requires approval.\nDoc: ${docNumber}\nItem: ${item.itemCode || ''} — ${item.description || item.masterItemDescription || ''}\nType: ${docType}\nMake/Buy: ${item.makeOrBuy || 'N/A'}`,
          assignedTo: assignee,
          createdBy: userId,
          priority: PRIORITY_MAP[docType],
          dueDays: SLA_DAYS[docType],
          tx: executor,
        });

        if (taskId) {
          await executor.execute(
            sql`UPDATE execution_drafts SET linked_task_id = ${taskId} WHERE id = ${draftId}`
          );
        }
      }

      if (depStatus === 'blocked') summary.blocked++;
      summary.created++;
      summary.drafts.push({
        docType,
        docNumber,
        projectItemId: item.id,
        approvalStatus,
        applicable: true,
      });
    }
  }

  console.log(`[ExecutionDrafts] Project ${projectId}: created=${summary.created}, notApplicable=${summary.notApplicable}, blocked=${summary.blocked}`);
  return summary;
}

function getApplicability(docType: DraftDocType, isMake: boolean, isService: boolean = false): boolean {
  if (isService) {
    return docType === 'WO';
  }
  switch (docType) {
    case 'DO': return isMake;
    case 'WO': return isMake;
    case 'PO': return !isMake;
    case 'IO': return true;
    default: return false;
  }
}

function getDependencyDocType(docType: DraftDocType, isMake: boolean, isService: boolean = false): string | null {
  if (isService) return null;
  if (docType === 'WO' && isMake) return 'DO';
  return null;
}

function getDependencyStatus(docType: DraftDocType, isMake: boolean): DependencyStatus {
  if (docType === 'WO' && isMake) return 'blocked';
  return 'not_required';
}

function buildSourceData(item: ProjectItemRecord, docType: DraftDocType, isMake: boolean): Record<string, any> {
  const data: Record<string, any> = {
    make_or_buy: item.makeOrBuy,
    quantity: item.quantity,
    uom: item.uom,
    master_item_id: item.masterItemId,
    master_item_code: item.masterItemCode,
    master_item_description: item.masterItemDescription,
    item_code: item.itemCode,
  };

  if (docType === 'IO') {
    data.io_trigger_source = isMake ? 'wo_release' : 'po_issuance';
    data.io_inspection_type = isMake ? 'in-process' : 'incoming';
  }

  return data;
}

async function insertDraft(executor: any, params: {
  projectId: number;
  projectItemId: number;
  docType: string;
  applicable: boolean;
  docNumber: string | null;
  approvalStatus: string;
  activationStatus: string;
  dependencyDocType: string | null;
  dependencyStatus: string;
  sourceData: Record<string, any>;
  generatedByUserId: number;
}): Promise<number> {
  const result = await executor.execute(
    sql`INSERT INTO execution_drafts
        (project_id, project_item_id, doc_type, applicable, doc_number,
         approval_status, activation_status, generated_by, generated_by_user_id,
         dependency_doc_type, dependency_status, source_data)
        VALUES (${params.projectId}, ${params.projectItemId}, ${params.docType},
                ${params.applicable}, ${params.docNumber},
                ${params.approvalStatus}, ${params.activationStatus},
                'system', ${params.generatedByUserId},
                ${params.dependencyDocType}, ${params.dependencyStatus},
                ${JSON.stringify(params.sourceData)}::jsonb)
        RETURNING id`
  );
  return (result.rows[0] as any).id;
}
