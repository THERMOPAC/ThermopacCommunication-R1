import { db } from '../db';
import { sql } from 'drizzle-orm';
import { getNextDocSeq } from '../doc-sequence-service';
import { createEpcTask, resolveAssignee } from '../epc-task-helpers';
import {
  DraftDocType, ApprovalStatus, DependencyStatus,
  DraftGenerationSummary, DEPT_MAP, SLA_DAYS, PRIORITY_MAP,
} from './pipeline-types';

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

    const isMake = (item.makeOrBuy || '').toLowerCase() === 'make';
    const docTypes: DraftDocType[] = ['DO', 'WO', 'PO', 'IO'];

    for (const docType of docTypes) {
      const applicable = getApplicability(docType, isMake);

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

      const depDocType = getDependencyDocType(docType, isMake);
      const depStatus = getDependencyStatus(docType, isMake);
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
        const assignee = await resolveAssignee(projectId, DEPT_MAP[docType], userId, executor);
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

function getApplicability(docType: DraftDocType, isMake: boolean): boolean {
  switch (docType) {
    case 'DO': return isMake;
    case 'WO': return isMake;
    case 'PO': return !isMake;
    case 'IO': return true;
    default: return false;
  }
}

function getDependencyDocType(docType: DraftDocType, isMake: boolean): string | null {
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
