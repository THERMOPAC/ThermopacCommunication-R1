import { db } from '../db';
import { sql } from 'drizzle-orm';

export async function createInspectionOrderFromEpcWO(
  epcWorkOrderId: number,
  userId: number
): Promise<{ id: number; inspectionOrderNumber: string }> {
  const woResult = await db.execute(
    sql`SELECT wo.id, wo.wo_number, wo.project_id, wo.project_item_id,
               wo.item_code, wo.item_description, wo.drawing_no, wo.quantity, wo.uom,
               p.code AS project_code
        FROM epc_work_orders wo
        JOIN projects p ON p.id = wo.project_id
        WHERE wo.id = ${epcWorkOrderId}`
  );

  if (woResult.rows.length === 0) {
    throw new Error(`EPC Work Order ${epcWorkOrderId} not found`);
  }
  const wo = woResult.rows[0] as any;

  const existingResult = await db.execute(
    sql`SELECT id, inspection_order_number FROM inspection_orders
        WHERE epc_work_order_id = ${epcWorkOrderId}
        LIMIT 1`
  );
  if (existingResult.rows.length > 0) {
    const existing = existingResult.rows[0] as any;
    return { id: existing.id, inspectionOrderNumber: existing.inspection_order_number };
  }

  const year = new Date().getFullYear();

  const seqResult = await db.execute(
    sql`SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq
        FROM inspection_orders
        WHERE project_id = ${wo.project_id}`
  );
  const seq = (seqResult.rows[0] as any).next_seq;

  const woSeq = wo.wo_number?.split('-WO-')?.[1] || String(seq).padStart(4, '0');
  const inspectionOrderNumber = `IO-${year}-${wo.project_code}-W-${woSeq}`;

  const insertResult = await db.execute(
    sql`INSERT INTO inspection_orders
        (project_id, project_code, inspection_order_number, title,
         item_id, item_code, description, drawing_no,
         work_order_id, epc_work_order_id,
         status, inspection_type, quantity, unit,
         sequence_number, created_by, created_at, updated_at)
        VALUES (
          ${wo.project_id},
          ${wo.project_code},
          ${inspectionOrderNumber},
          ${'Final Inspection — ' + (wo.item_description || wo.item_code)},
          ${wo.project_item_id},
          ${wo.item_code},
          ${wo.item_description || wo.item_code},
          ${wo.drawing_no || null},
          null,
          ${epcWorkOrderId},
          'pending',
          'final',
          ${wo.quantity || 1},
          ${wo.uom || 'Nos'},
          ${seq},
          ${userId},
          NOW(), NOW()
        )
        RETURNING id, inspection_order_number`
  );

  const row = insertResult.rows[0] as any;

  await db.execute(
    sql`UPDATE epc_work_orders
        SET quality_status = 'in_progress', updated_at = NOW()
        WHERE id = ${epcWorkOrderId}
          AND quality_status = 'pending_inspection'`
  );

  console.log(`[IO-Handover] Created IO ${row.inspection_order_number} for EPC WO ${wo.wo_number}`);
  return { id: row.id, inspectionOrderNumber: row.inspection_order_number };
}

export async function writeBackWOQualityStatus(inspectionOrderId: number): Promise<void> {
  const ioResult = await db.execute(
    sql`SELECT id, epc_work_order_id, status FROM inspection_orders WHERE id = ${inspectionOrderId}`
  );
  if (ioResult.rows.length === 0) return;

  const io = ioResult.rows[0] as any;
  if (!io.epc_work_order_id) return;

  if (io.status === 'completed') {
    await db.execute(
      sql`UPDATE epc_work_orders
          SET quality_status         = 'inspection_cleared',
              quality_cleared_at     = NOW(),
              quality_cleared_inspection_id = ${inspectionOrderId},
              quality_failure_reason = NULL,
              quality_failed_inspection_id  = NULL,
              updated_at             = NOW()
          WHERE id = ${io.epc_work_order_id}
            AND status NOT IN ('canceled', 'superseded')`
    );
    console.log(`[IO-Handover] WO ${io.epc_work_order_id} marked inspection_cleared via IO ${inspectionOrderId}`);
  } else if (io.status === 'canceled') {
    await db.execute(
      sql`UPDATE epc_work_orders
          SET quality_status = 'pending_inspection',
              updated_at     = NOW()
          WHERE id = ${io.epc_work_order_id}
            AND quality_status NOT IN ('inspection_cleared')`
    );
    console.log(`[IO-Handover] WO ${io.epc_work_order_id} reverted to pending_inspection — IO canceled`);
  }
}
