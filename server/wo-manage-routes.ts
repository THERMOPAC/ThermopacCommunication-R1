import { Request, Response, Router } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { sendError, sendNotFound, sendValidationError, sendPermissionError } from './utils/error-response';
import { roleHierarchy } from '@shared/roles';

const router = Router();

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

function getUserRole(req: Request): string {
  return (req.user as any)?.role || 'Employee';
}

function getUserId(req: Request): number {
  return (req.user as any)?.id;
}

function minRole(req: Request, res: Response, role: string): boolean {
  const lvl = roleHierarchy[getUserRole(req)];
  const need = roleHierarchy[role];
  if (lvl === undefined || lvl > need) {
    sendPermissionError(res, `Requires ${role} or above`);
    return false;
  }
  return true;
}

async function getWo(id: number) {
  const r = await db.execute(sql`SELECT id, project_id, status FROM epc_work_orders WHERE id = ${id}`);
  return r.rows[0] as any;
}

// ── GET /api/epc/work-orders/:id/manage ──────────────────────────────────────
router.get('/api/epc/work-orders/:id/manage', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid WO ID');

    const [woResult, schedResult, crewResult, holdResult, logResult, qplResult, ddsResult] = await Promise.all([
      db.execute(sql`
        SELECT ewo.*,
               COALESCE(NULLIF(ewo.item_description,''), mi.description) AS item_description,
               COALESCE(NULLIF(ewo.item_specification,''), mi.specification) AS item_specification,
               COALESCE(NULLIF(ewo.drawing_no,''), dc.drawing_number) AS drawing_no,
               COALESCE(
                 dwg_att.att_rev_code,
                 CASE
                   WHEN dc.revision_code ~ '^[A-Za-z]$' THEN UPPER(dc.revision_code)
                   WHEN dc.revision_code ~ '^\d+$' AND dc.revision_code::int < 26 THEN CHR(65 + dc.revision_code::int)
                   ELSE UPPER(dc.revision_code)
                 END
               ) AS drawing_revision_text,
               dc.status AS drawing_control_status,
               dc.released_for_manufacturing,
               dc.id AS drawing_control_id,
               prod.item_property_1_label AS product_p1_label,
               prod.item_property_2_label AS product_p2_label,
               prod.item_property_3 AS product_p3,
               u1.username AS created_by_name,
               u2.username AS approved_by_name,
               u3.username AS released_by_name,
               p.start_date AS project_start_date,
               p.target_end_date AS project_target_end_date,
               p.actual_end_date AS project_actual_end_date
        FROM epc_work_orders ewo
        LEFT JOIN master_items mi ON mi.id = ewo.master_item_id
        LEFT JOIN epc_drawing_controls dc ON dc.project_item_id = ewo.project_item_id AND dc.is_current = true
        LEFT JOIN LATERAL (
          SELECT eda.revision_code AS att_rev_code
          FROM epc_document_attachments eda
          WHERE eda.parent_entity_id = dc.id AND eda.doc_type = 'DWG' AND eda.is_current = true
          LIMIT 1
        ) dwg_att ON true
        LEFT JOIN project_items pi ON pi.id = ewo.project_item_id
        LEFT JOIN products prod ON prod.product_code = pi.product_code
        LEFT JOIN projects p ON p.id = ewo.project_id
        LEFT JOIN users u1 ON ewo.created_by = u1.id
        LEFT JOIN users u2 ON ewo.approved_by = u2.id
        LEFT JOIN users u3 ON ewo.released_by = u3.id
        WHERE ewo.id = ${id}
      `),
      db.execute(sql`SELECT * FROM wo_schedule WHERE epc_work_order_id = ${id}`),
      db.execute(sql`SELECT COUNT(*) AS crew_count FROM wo_crew_slots WHERE epc_work_order_id = ${id} AND is_active = true`),
      db.execute(sql`SELECT COUNT(*) AS open_hold_count, MAX(hold_reason) AS latest_hold_reason, MAX(hold_type) AS latest_hold_type, MIN(held_at) AS oldest_open_held_at FROM wo_hold_records WHERE epc_work_order_id = ${id} AND resolved_at IS NULL`),
      db.execute(sql`SELECT progress_percent FROM wo_daily_logs WHERE epc_work_order_id = ${id} AND status = 'submitted' ORDER BY log_date DESC LIMIT 1`),
      db.execute(sql`
        SELECT qp.id, qp.quality_plan_number, qp.status, qp.quality_requirement_type, qp.quality_notes,
               u.username AS assigned_to_name
        FROM quality_planning_records qp
        LEFT JOIN users u ON qp.assigned_to = u.id
        WHERE qp.id = (SELECT quality_plan_id FROM epc_work_orders WHERE id = ${id})
      `),
      db.execute(sql`
        SELECT dds.id FROM design_data_sheets dds
        JOIN epc_drawing_controls dc ON dc.id = dds.dwg_control_id
        WHERE dc.project_item_id = (SELECT project_item_id FROM epc_work_orders WHERE id = ${id}) AND dc.is_current = true
        LIMIT 1
      `),
    ]);

    if (woResult.rows.length === 0) return sendNotFound(res, 'Work order not found');
    const wo = woResult.rows[0] as any;

    const holdInfo = holdResult.rows[0] as any;
    const openHoldCount = parseInt(holdInfo.open_hold_count) || 0;

    res.json({
      ...wo,
      schedule: schedResult.rows[0] || null,
      crew_count: parseInt((crewResult.rows[0] as any).crew_count) || 0,
      open_hold_count: openHoldCount,
      open_hold_reason: openHoldCount > 0 ? holdInfo.latest_hold_reason : null,
      open_hold_type: openHoldCount > 0 ? holdInfo.latest_hold_type : null,
      oldest_open_held_at: openHoldCount > 0 ? holdInfo.oldest_open_held_at : null,
      latest_progress_percent: latestPct(logResult),
      quality_plan: qplResult.rows[0] || null,
      dds_id: (ddsResult.rows[0] as any)?.id || null,
    });
  } catch (e) { sendError(res, e); }
});

function latestPct(r: any) {
  if (r.rows.length === 0) return 0;
  return parseInt((r.rows[0] as any).progress_percent) || 0;
}

// ── GET /api/epc/work-orders/:id/schedule ────────────────────────────────────
router.get('/api/epc/work-orders/:id/schedule', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid WO ID');
    const r = await db.execute(sql`
      SELECT s.*, u1.username AS schedule_set_by_name, u2.username AS actual_start_by_name, u3.username AS actual_end_by_name
      FROM wo_schedule s
      LEFT JOIN users u1 ON s.schedule_set_by = u1.id
      LEFT JOIN users u2 ON s.actual_start_recorded_by = u2.id
      LEFT JOIN users u3 ON s.actual_end_recorded_by = u3.id
      WHERE s.epc_work_order_id = ${id}
    `);
    res.json(r.rows[0] || null);
  } catch (e) { sendError(res, e); }
});

// ── PUT /api/epc/work-orders/:id/schedule ────────────────────────────────────
router.put('/api/epc/work-orders/:id/schedule', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!minRole(req, res, 'Manager')) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid WO ID');
    const wo = await getWo(id);
    if (!wo) return sendNotFound(res, 'Work order not found');

    const userId = getUserId(req);
    const { target_start_date, target_completion_date, actual_start_date, actual_completion_date } = req.body;

    const existing = await db.execute(sql`SELECT id FROM wo_schedule WHERE epc_work_order_id = ${id}`);
    const now = new Date();

    if (existing.rows.length === 0) {
      await db.execute(sql`
        INSERT INTO wo_schedule (epc_work_order_id, target_start_date, target_completion_date, actual_start_date, actual_completion_date,
          schedule_set_by, schedule_set_at, actual_start_recorded_by, actual_start_recorded_at, actual_end_recorded_by, actual_end_recorded_at, updated_at)
        VALUES (${id},
          ${target_start_date || null}, ${target_completion_date || null},
          ${actual_start_date || null}, ${actual_completion_date || null},
          ${userId}, ${now},
          ${actual_start_date ? userId : null}, ${actual_start_date ? now : null},
          ${actual_completion_date ? userId : null}, ${actual_completion_date ? now : null},
          ${now})
      `);
    } else {
      await db.execute(sql`
        UPDATE wo_schedule SET
          target_start_date = ${target_start_date || null},
          target_completion_date = ${target_completion_date || null},
          actual_start_date = ${actual_start_date || null},
          actual_completion_date = ${actual_completion_date || null},
          schedule_set_by = ${userId},
          schedule_set_at = ${now},
          actual_start_recorded_by = CASE WHEN ${actual_start_date || null} IS NOT NULL THEN ${userId} ELSE actual_start_recorded_by END,
          actual_start_recorded_at = CASE WHEN ${actual_start_date || null} IS NOT NULL THEN ${now} ELSE actual_start_recorded_at END,
          actual_end_recorded_by = CASE WHEN ${actual_completion_date || null} IS NOT NULL THEN ${userId} ELSE actual_end_recorded_by END,
          actual_end_recorded_at = CASE WHEN ${actual_completion_date || null} IS NOT NULL THEN ${now} ELSE actual_end_recorded_at END,
          updated_at = ${now}
        WHERE epc_work_order_id = ${id}
      `);
    }

    const updated = await db.execute(sql`SELECT * FROM wo_schedule WHERE epc_work_order_id = ${id}`);
    res.json(updated.rows[0]);
  } catch (e) { sendError(res, e); }
});

// ── GET /api/epc/work-orders/:id/crew ────────────────────────────────────────
router.get('/api/epc/work-orders/:id/crew', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid WO ID');
    const r = await db.execute(sql`
      SELECT cs.*, u.username AS added_by_name
      FROM wo_crew_slots cs
      LEFT JOIN users u ON cs.added_by = u.id
      WHERE cs.epc_work_order_id = ${id} AND cs.is_active = true
      ORDER BY
        CASE cs.role_type WHEN 'team_leader' THEN 1 WHEN 'fitter' THEN 2 WHEN 'welder' THEN 3 WHEN 'helper' THEN 4 WHEN 'qc_person' THEN 5 ELSE 6 END,
        cs.slot_number
    `);
    res.json(r.rows);
  } catch (e) { sendError(res, e); }
});

// ── POST /api/epc/work-orders/:id/crew/slots ─────────────────────────────────
router.post('/api/epc/work-orders/:id/crew/slots', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!minRole(req, res, 'Manager')) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid WO ID');
    const wo = await getWo(id);
    if (!wo) return sendNotFound(res, 'Work order not found');

    const { role_type, assigned_name } = req.body;
    const validRoles = ['team_leader', 'fitter', 'welder', 'helper', 'qc_person'];
    if (!validRoles.includes(role_type)) return sendValidationError(res, 'Invalid role_type');

    if (role_type === 'team_leader') {
      const tlCheck = await db.execute(sql`SELECT COUNT(*) AS cnt FROM wo_crew_slots WHERE epc_work_order_id = ${id} AND role_type = 'team_leader' AND is_active = true`);
      if (parseInt((tlCheck.rows[0] as any).cnt) >= 2) {
        return res.status(409).json({ error: 'Maximum 2 Team Leaders allowed per WO' });
      }
    }

    const nextNum = await db.execute(sql`
      SELECT COALESCE(MAX(slot_number), 0) + 1 AS next_num FROM wo_crew_slots WHERE epc_work_order_id = ${id} AND role_type = ${role_type}
    `);
    const slotNumber = (nextNum.rows[0] as any).next_num;
    const roleLabel: Record<string, string> = { team_leader: 'Team Leader', fitter: 'Fitter', welder: 'Welder', helper: 'Helper', qc_person: 'QC Person' };
    const slotLabel = `${roleLabel[role_type]}-${slotNumber}`;

    const userId = getUserId(req);
    const r = await db.execute(sql`
      INSERT INTO wo_crew_slots (epc_work_order_id, role_type, slot_number, slot_label, assigned_name, is_active, added_by, added_at)
      VALUES (${id}, ${role_type}, ${slotNumber}, ${slotLabel}, ${assigned_name || null}, true, ${userId}, NOW())
      RETURNING *
    `);
    res.status(201).json(r.rows[0]);
  } catch (e) { sendError(res, e); }
});

// ── PUT /api/epc/work-orders/:id/crew/slots/:slotId ──────────────────────────
router.put('/api/epc/work-orders/:id/crew/slots/:slotId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!minRole(req, res, 'Manager')) return;
    const id = parseInt(req.params.id);
    const slotId = parseInt(req.params.slotId);
    if (isNaN(id) || isNaN(slotId)) return sendValidationError(res, 'Invalid ID');

    const existing = await db.execute(sql`SELECT * FROM wo_crew_slots WHERE id = ${slotId} AND epc_work_order_id = ${id}`);
    if (existing.rows.length === 0) return sendNotFound(res, 'Slot not found');
    const slot = existing.rows[0] as any;

    const { assigned_name } = req.body;
    const userId = getUserId(req);

    if (assigned_name !== slot.assigned_name) {
      await db.execute(sql`
        INSERT INTO wo_crew_slot_history (slot_id, previous_name, new_name, changed_by, changed_at)
        VALUES (${slotId}, ${slot.assigned_name || null}, ${assigned_name || null}, ${userId}, NOW())
      `);
    }

    await db.execute(sql`
      UPDATE wo_crew_slots SET assigned_name = ${assigned_name || null}, updated_at = NOW() WHERE id = ${slotId}
    `);
    const updated = await db.execute(sql`SELECT * FROM wo_crew_slots WHERE id = ${slotId}`);
    res.json(updated.rows[0]);
  } catch (e) { sendError(res, e); }
});

// ── DELETE /api/epc/work-orders/:id/crew/slots/:slotId ───────────────────────
router.delete('/api/epc/work-orders/:id/crew/slots/:slotId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!minRole(req, res, 'Manager')) return;
    const id = parseInt(req.params.id);
    const slotId = parseInt(req.params.slotId);
    if (isNaN(id) || isNaN(slotId)) return sendValidationError(res, 'Invalid ID');
    await db.execute(sql`UPDATE wo_crew_slots SET is_active = false, updated_at = NOW() WHERE id = ${slotId} AND epc_work_order_id = ${id}`);
    res.json({ ok: true });
  } catch (e) { sendError(res, e); }
});

// ── GET /api/epc/work-orders/:id/crew/slots/:slotId/history ──────────────────
router.get('/api/epc/work-orders/:id/crew/slots/:slotId/history', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const slotId = parseInt(req.params.slotId);
    if (isNaN(slotId)) return sendValidationError(res, 'Invalid slot ID');
    const r = await db.execute(sql`
      SELECT h.*, u.username AS changed_by_name FROM wo_crew_slot_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.slot_id = ${slotId} ORDER BY h.changed_at DESC
    `);
    res.json(r.rows);
  } catch (e) { sendError(res, e); }
});

// ── GET /api/epc/work-orders/:id/daily-logs ──────────────────────────────────
router.get('/api/epc/work-orders/:id/daily-logs', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid WO ID');
    const r = await db.execute(sql`
      SELECT dl.*, u.username AS reported_by_name, u2.username AS reviewed_by_name
      FROM wo_daily_logs dl
      LEFT JOIN users u ON dl.reported_by = u.id
      LEFT JOIN users u2 ON dl.reviewed_by = u2.id
      WHERE dl.epc_work_order_id = ${id} ORDER BY dl.log_date DESC
    `);
    res.json(r.rows);
  } catch (e) { sendError(res, e); }
});

// ── POST /api/epc/work-orders/:id/daily-logs ─────────────────────────────────
router.post('/api/epc/work-orders/:id/daily-logs', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid WO ID');
    const wo = await getWo(id);
    if (!wo) return sendNotFound(res, 'Work order not found');

    const { log_date, progress_percent, work_done_today, manpower_count, manpower_breakdown, hours_worked, issues_encountered, next_day_plan, crew_note } = req.body;
    if (!log_date) return sendValidationError(res, 'log_date is required');

    const existing = await db.execute(sql`SELECT id FROM wo_daily_logs WHERE epc_work_order_id = ${id} AND log_date = ${log_date}`);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'A log already exists for this date' });

    const userId = getUserId(req);
    const pct = Math.min(100, Math.max(0, parseInt(progress_percent) || 0));
    const r = await db.execute(sql`
      INSERT INTO wo_daily_logs (epc_work_order_id, log_date, reported_by, status, progress_percent, work_done_today, manpower_count, manpower_breakdown, hours_worked, issues_encountered, next_day_plan, crew_note)
      VALUES (${id}, ${log_date}, ${userId}, 'draft', ${pct}, ${work_done_today || null}, ${manpower_count || 0}, ${JSON.stringify(manpower_breakdown || {})}, ${hours_worked || 0}, ${issues_encountered || null}, ${next_day_plan || null}, ${crew_note || null})
      RETURNING *
    `);
    res.status(201).json(r.rows[0]);
  } catch (e) { sendError(res, e); }
});

// ── PUT /api/epc/work-orders/:id/daily-logs/:logId ───────────────────────────
router.put('/api/epc/work-orders/:id/daily-logs/:logId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const logId = parseInt(req.params.logId);
    if (isNaN(id) || isNaN(logId)) return sendValidationError(res, 'Invalid ID');

    const existing = await db.execute(sql`SELECT * FROM wo_daily_logs WHERE id = ${logId} AND epc_work_order_id = ${id}`);
    if (existing.rows.length === 0) return sendNotFound(res, 'Log not found');
    const log = existing.rows[0] as any;
    if (log.status === 'submitted') return sendPermissionError(res, 'Cannot edit a submitted log');

    const { progress_percent, work_done_today, manpower_count, manpower_breakdown, hours_worked, issues_encountered, next_day_plan, crew_note } = req.body;
    const pct = Math.min(100, Math.max(0, parseInt(progress_percent) || 0));
    await db.execute(sql`
      UPDATE wo_daily_logs SET
        progress_percent = ${pct}, work_done_today = ${work_done_today || null},
        manpower_count = ${manpower_count || 0}, manpower_breakdown = ${JSON.stringify(manpower_breakdown || {})},
        hours_worked = ${hours_worked || 0}, issues_encountered = ${issues_encountered || null},
        next_day_plan = ${next_day_plan || null}, crew_note = ${crew_note || null}, updated_at = NOW()
      WHERE id = ${logId}
    `);
    const updated = await db.execute(sql`SELECT * FROM wo_daily_logs WHERE id = ${logId}`);
    res.json(updated.rows[0]);
  } catch (e) { sendError(res, e); }
});

// ── POST /api/epc/work-orders/:id/daily-logs/:logId/submit ───────────────────
router.post('/api/epc/work-orders/:id/daily-logs/:logId/submit', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!minRole(req, res, 'Senior Executive')) return;
    const id = parseInt(req.params.id);
    const logId = parseInt(req.params.logId);
    if (isNaN(id) || isNaN(logId)) return sendValidationError(res, 'Invalid ID');
    const existing = await db.execute(sql`SELECT status FROM wo_daily_logs WHERE id = ${logId} AND epc_work_order_id = ${id}`);
    if (existing.rows.length === 0) return sendNotFound(res, 'Log not found');
    if ((existing.rows[0] as any).status === 'submitted') return res.status(409).json({ error: 'Already submitted' });
    await db.execute(sql`UPDATE wo_daily_logs SET status = 'submitted', updated_at = NOW() WHERE id = ${logId}`);
    res.json({ ok: true });
  } catch (e) { sendError(res, e); }
});

// ── GET /api/epc/work-orders/:id/holds ───────────────────────────────────────
router.get('/api/epc/work-orders/:id/holds', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid WO ID');
    const r = await db.execute(sql`
      SELECT h.*, u1.username AS held_by_name, u2.username AS resolved_by_name,
             EXTRACT(EPOCH FROM (COALESCE(h.resolved_at, NOW()) - h.held_at)) / 86400.0 AS impact_days
      FROM wo_hold_records h
      LEFT JOIN users u1 ON h.held_by = u1.id
      LEFT JOIN users u2 ON h.resolved_by = u2.id
      WHERE h.epc_work_order_id = ${id} ORDER BY h.held_at DESC
    `);
    res.json(r.rows);
  } catch (e) { sendError(res, e); }
});

// ── POST /api/epc/work-orders/:id/holds ──────────────────────────────────────
router.post('/api/epc/work-orders/:id/holds', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!minRole(req, res, 'Manager')) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid WO ID');
    const wo = await getWo(id);
    if (!wo) return sendNotFound(res, 'Work order not found');

    const { hold_type, hold_reason } = req.body;
    if (!hold_type || !hold_reason) return sendValidationError(res, 'hold_type and hold_reason are required');
    const validTypes = ['material_shortage', 'drawing_issue', 'machine_breakdown', 'quality_hold', 'customer_hold', 'other'];
    if (!validTypes.includes(hold_type)) return sendValidationError(res, 'Invalid hold_type');

    const userId = getUserId(req);
    const r = await db.execute(sql`
      INSERT INTO wo_hold_records (epc_work_order_id, hold_type, hold_reason, held_by, held_at)
      VALUES (${id}, ${hold_type}, ${hold_reason}, ${userId}, NOW()) RETURNING *
    `);
    res.status(201).json(r.rows[0]);
  } catch (e) { sendError(res, e); }
});

// ── POST /api/epc/work-orders/:id/holds/:holdId/resolve ──────────────────────
router.post('/api/epc/work-orders/:id/holds/:holdId/resolve', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!minRole(req, res, 'Manager')) return;
    const id = parseInt(req.params.id);
    const holdId = parseInt(req.params.holdId);
    if (isNaN(id) || isNaN(holdId)) return sendValidationError(res, 'Invalid ID');

    const existing = await db.execute(sql`SELECT * FROM wo_hold_records WHERE id = ${holdId} AND epc_work_order_id = ${id}`);
    if (existing.rows.length === 0) return sendNotFound(res, 'Hold record not found');
    if ((existing.rows[0] as any).resolved_at) return res.status(409).json({ error: 'Already resolved' });

    const { resolution_notes } = req.body;
    const userId = getUserId(req);
    await db.execute(sql`
      UPDATE wo_hold_records SET resolved_by = ${userId}, resolved_at = NOW(), resolution_notes = ${resolution_notes || null}
      WHERE id = ${holdId}
    `);
    const updated = await db.execute(sql`SELECT * FROM wo_hold_records WHERE id = ${holdId}`);
    res.json(updated.rows[0]);
  } catch (e) { sendError(res, e); }
});

// ── GET /api/epc/work-orders/:id/manpower-summary ────────────────────────────
router.get('/api/epc/work-orders/:id/manpower-summary', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid WO ID');
    const r = await db.execute(sql`
      SELECT
        COUNT(*) AS days_logged,
        SUM(manpower_count) AS total_man_days,
        SUM(hours_worked::numeric) AS total_man_hours,
        ROUND(AVG(manpower_count), 1) AS avg_daily_headcount,
        MAX(manpower_count) AS peak_headcount,
        SUM((manpower_breakdown->>'team_leaders')::numeric) AS total_team_leaders,
        SUM((manpower_breakdown->>'fitters')::numeric) AS total_fitters,
        SUM((manpower_breakdown->>'welders')::numeric) AS total_welders,
        SUM((manpower_breakdown->>'helpers')::numeric) AS total_helpers,
        SUM((manpower_breakdown->>'qc_persons')::numeric) AS total_qc_persons
      FROM wo_daily_logs
      WHERE epc_work_order_id = ${id}
    `);
    res.json(r.rows[0] || {});
  } catch (e) { sendError(res, e); }
});

// ── GET /api/epc/work-orders/:id/inspections ─────────────────────────────────
router.get('/api/epc/work-orders/:id/inspections', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendValidationError(res, 'Invalid WO ID');
    const qplRow = await db.execute(sql`SELECT quality_plan_id FROM epc_work_orders WHERE id = ${id}`);
    if (qplRow.rows.length === 0) return sendNotFound(res, 'Work order not found');
    const qplId = (qplRow.rows[0] as any).quality_plan_id;
    if (!qplId) return res.json([]);
    const r = await db.execute(sql`
      SELECT ier.*, u.username AS assigned_to_name
      FROM inspection_execution_records ier
      LEFT JOIN users u ON ier.assigned_to = u.id
      WHERE ier.quality_plan_id = ${qplId} AND ier.status NOT IN ('canceled','superseded')
      ORDER BY ier.created_at DESC
    `);
    res.json(r.rows);
  } catch (e) { sendError(res, e); }
});

export function setupWoManageRoutes(app: Router) {
  app.use(router);
}
