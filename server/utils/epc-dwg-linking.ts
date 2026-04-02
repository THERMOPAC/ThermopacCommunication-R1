import { pool } from '../db';
import { createEpcTask, resolveAssignee, resolveManagerId, resolveProjectCode } from '../epc-task-helpers';

interface DwgLinkingResult {
  autoLinked: number;
  ambiguous: number;
  unmatched: number;
  reviewTaskIds: number[];
  details: { dwgId: number; dwgControlNumber: string; action: string; matchCount: number; linkedItemId?: number }[];
}

export async function autoLinkUnlinkedDrawings(projectId: number, userId: number): Promise<DwgLinkingResult> {
  const result: DwgLinkingResult = {
    autoLinked: 0, ambiguous: 0, unmatched: 0,
    reviewTaskIds: [], details: [],
  };

  const unlinked = await pool.query(
    `SELECT id, dwg_control_number, drawing_number, drawing_title, master_item_id, item_code
     FROM epc_drawing_controls
     WHERE project_id = $1 AND project_item_id IS NULL
       AND status NOT IN ('cancelled', 'superseded')`,
    [projectId]
  );

  if (unlinked.rows.length === 0) return result;

  const projectCode = await resolveProjectCode(projectId);
  const pmId = await resolveManagerId(projectId);
  const engLead = await resolveAssignee(projectId, 'Engineering', userId);

  for (const dwg of unlinked.rows) {
    const candidates = await pool.query(
      `SELECT pi.id as project_item_id, pi.item_id, mi.item_code, mi.description, mi.make_or_buy
       FROM project_items pi
       JOIN master_items mi ON mi.id = pi.item_id
       WHERE pi.project_id = $1 AND pi.status != 'cancelled'
         AND mi.make_or_buy IN ('Make', 'Assembly')
         AND NOT EXISTS (
           SELECT 1 FROM epc_drawing_controls dc
           WHERE dc.project_item_id = pi.id AND dc.project_id = $1
             AND dc.status NOT IN ('cancelled', 'superseded')
         )
         AND (
           mi.id = $2
           OR ($3 IS NOT NULL AND mi.item_code = $3)
         )`,
      [projectId, dwg.master_item_id, dwg.item_code]
    );

    if (candidates.rows.length === 1) {
      const match = candidates.rows[0];
      await pool.query(
        `UPDATE epc_drawing_controls SET project_item_id = $1, updated_at = NOW() WHERE id = $2`,
        [match.project_item_id, dwg.id]
      );
      result.autoLinked++;
      result.details.push({
        dwgId: dwg.id, dwgControlNumber: dwg.dwg_control_number,
        action: 'auto_linked', matchCount: 1, linkedItemId: match.project_item_id,
      });
    } else if (candidates.rows.length > 1) {
      result.ambiguous++;
      result.details.push({
        dwgId: dwg.id, dwgControlNumber: dwg.dwg_control_number,
        action: 'ambiguous', matchCount: candidates.rows.length,
      });
      const task = await createEpcTask({
        projectId, entityType: 'drawing_control', recordId: dwg.id, actionCode: 'dwg_link_ambiguous',
        title: `Resolve ambiguous drawing link for ${dwg.dwg_control_number}`,
        description: `Drawing ${dwg.dwg_control_number} matches ${candidates.rows.length} project items by item code "${dwg.item_code}". Manual linking required.`,
        assignedTo: engLead || pmId || userId, createdBy: userId, priority: 'Medium', dueDays: 5,
      });
      if (task?.id) result.reviewTaskIds.push(task.id);
    } else {
      result.unmatched++;
      result.details.push({
        dwgId: dwg.id, dwgControlNumber: dwg.dwg_control_number,
        action: 'unmatched', matchCount: 0,
      });
      const task = await createEpcTask({
        projectId, entityType: 'drawing_control', recordId: dwg.id, actionCode: 'dwg_link_unmatched',
        title: `Link unmatched drawing ${dwg.dwg_control_number} to a project item`,
        description: `Drawing ${dwg.dwg_control_number} (item code: ${dwg.item_code || 'N/A'}) could not be auto-linked. No matching Make/Assembly item found without an existing drawing control.`,
        assignedTo: engLead || pmId || userId, createdBy: userId, priority: 'Medium', dueDays: 7,
      });
      if (task?.id) result.reviewTaskIds.push(task.id);
    }
  }

  await pool.query(
    `INSERT INTO project_workflow_events (project_id, event_type, event_data, created_by, created_at)
     VALUES ($1, 'dwg_auto_linking', $2, $3, NOW())`,
    [projectId, JSON.stringify(result), userId]
  );

  console.log(`[DWG-Link] Project ${projectCode}: ${result.autoLinked} auto-linked, ${result.ambiguous} ambiguous, ${result.unmatched} unmatched`);
  return result;
}

export function isDwgGateRequired(makeOrBuy: string | null): boolean {
  const classification = (makeOrBuy || '').toLowerCase();
  return classification === 'make' || classification === 'assembly';
}
