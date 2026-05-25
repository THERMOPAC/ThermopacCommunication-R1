/**
 * HAZOP Routes — Phase 1
 * ──────────────────────
 * Phase 1 scope: Study CRUD only (both modes).
 * No loop/step/node/generation routes in this file.
 *
 * Governed by: docs/hazop-phase1-execution-plan-v1.0.md
 */

import { Express, Request, Response } from 'express';
import { pool } from './db';
import { ensureAuthenticated } from './auth-middleware';
import { sendError, sendNotFound, sendBusinessError } from './utils/error-response';

const ALLOWED_STUDY_MODES = ['project_based', 'concept_expected_project'] as const;

const EQUIPMENT_CATEGORIES = [
  'Tank', 'Pump', 'Heat Exchanger', 'Heater', 'Vessel', 'Column', 'Separator',
  'Filter', 'Control Valve', 'Isolation Valve', 'Check Valve', 'Instrument',
  'Utility System', 'Drain', 'Vent', 'Product Outlet', 'Waste Outlet', 'Next Loop',
  // Phase 3B — TWFE equipment categories
  'TWFE Evaporator', 'Vacuum Condenser', 'Degasoil Flash Vessel',
  'Vacuum Ejector System', 'Residue Pump', 'Dehydration Column',
] as const;

const CONNECTION_TYPES = [
  'Pipe (flanged)', 'Pipe (screwed)', 'Pipe (welded)', 'Flexible hose',
  'Instrumentation line', 'Electrical signal', 'Mechanical link', 'Virtual (logic only)', 'Loop transition',
] as const;

const OUTLET_DESTINATIONS = [
  'next_step', 'prev_step', 'start_of_loop', 'next_node', 'next_loop',
  'specific_step', 'recycle', 'bypass',
  'drain', 'vent', 'product_outlet', 'waste_outlet',
] as const;

// Outlet destinations that REQUIRE an outlet_destination_ref (V11/V12)
const REF_REQUIRED_DESTINATIONS = new Set(['specific_step', 'recycle', 'bypass']);
const REF_FORMAT = /^\d+\.\d+\.\d+$/;

function getCurrentFyCode(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-based
  const year = now.getFullYear();
  // FY runs April → March; format YYZZ e.g. 2627 for FY 2026-27
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return `${String(fyStart).slice(2)}${String(fyEnd).slice(2)}`;
}

export async function setupHazopRoutes(app: Express): Promise<void> {

  // ── List studies for a project ──────────────────────────────────────────────
  app.get('/api/hazop/projects/:projectId/studies', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

      const proj = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId]);
      if (proj.rowCount === 0) return sendNotFound(res, 'Project');

      const result = await pool.query(`
        SELECT
          s.id, s.study_number, s.title, s.study_mode, s.status, s.revision,
          s.study_date, s.created_by, s.created_at, s.updated_at,
          TRIM(u.first_name || ' ' || u.last_name) AS created_by_name
        FROM hazop_studies s
        LEFT JOIN users u ON u.id = s.created_by
        WHERE s.project_id = $1
        ORDER BY s.created_at DESC
      `, [projectId]);

      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── List all concept studies ────────────────────────────────────────────────
  app.get('/api/hazop/concept-studies', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT
          s.id, s.study_number, s.title, s.concept_title, s.study_mode,
          s.status, s.revision, s.study_date, s.created_by, s.created_at, s.updated_at,
          TRIM(u.first_name || ' ' || u.last_name) AS created_by_name
        FROM hazop_studies s
        LEFT JOIN users u ON u.id = s.created_by
        WHERE s.study_mode = 'concept_expected_project'
        ORDER BY s.created_at DESC
      `);
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── Get study detail ────────────────────────────────────────────────────────
  app.get('/api/hazop/studies/:studyId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });

      const result = await pool.query(`
        SELECT
          s.*,
          TRIM(u.first_name || ' ' || u.last_name) AS created_by_name,
          TRIM(ul.first_name || ' ' || ul.last_name) AS study_leader_name,
          p.code AS project_code,
          p.customer_name
        FROM hazop_studies s
        LEFT JOIN users u ON u.id = s.created_by
        LEFT JOIN users ul ON ul.id = s.study_leader
        LEFT JOIN projects p ON p.id = s.project_id
        WHERE s.id = $1
      `, [studyId]);

      if (result.rowCount === 0) return sendNotFound(res, 'HAZOP Study');
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── Create study (both modes) ───────────────────────────────────────────────
  app.post('/api/hazop/studies', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = (req.user as any).id;
      const {
        study_mode, project_id, title, concept_title,
        process_description, design_basis, study_leader, team_members, study_date,
      } = req.body;

      // Validation
      if (!ALLOWED_STUDY_MODES.includes(study_mode)) {
        return res.status(400).json({ error: `study_mode must be 'project_based' or 'concept_expected_project'` });
      }
      if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'title is required' });
      }
      if (study_mode === 'project_based') {
        if (!project_id) return res.status(400).json({ error: 'project_id is required for project_based studies' });
        const projCheck = await client.query('SELECT id, code FROM projects WHERE id = $1', [project_id]);
        if (projCheck.rowCount === 0) return sendNotFound(res, 'Project');
      }
      if (study_mode === 'concept_expected_project' && project_id) {
        return res.status(400).json({ error: 'project_id must not be provided for concept studies' });
      }
      if (study_mode === 'concept_expected_project') {
        if (!concept_title || typeof concept_title !== 'string' || concept_title.trim() === '') {
          return res.status(400).json({ error: 'concept_title is required for concept studies' });
        }
      }

      await client.query('BEGIN');

      let studyNumber: string;

      if (study_mode === 'project_based') {
        // Advisory lock scoped to project
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('hazop-study-create-' || $1::text))`, [project_id]);

        // Resolve project code
        const projRow = await client.query('SELECT code FROM projects WHERE id = $1', [project_id]);
        const projectCode = projRow.rows[0].code;

        // Acquire sequence
        const seqResult = await client.query(`
          INSERT INTO doc_sequences (doc_type, project_id, fy_code, next_seq)
          VALUES ('HAZOP', $1, NULL, 2)
          ON CONFLICT (doc_type, project_id) WHERE project_id IS NOT NULL
          DO UPDATE SET next_seq = doc_sequences.next_seq + 1
          RETURNING next_seq - 1 AS allocated_seq
        `, [project_id]);
        const seq = seqResult.rows[0].allocated_seq;
        studyNumber = `${projectCode}-HAZOP-${String(seq).padStart(3, '0')}`;

      } else {
        // Concept mode — scoped to current FY
        const fyCode = getCurrentFyCode();
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('hazop-study-create-concept-' || $1))`, [fyCode]);

        const seqResult = await client.query(`
          INSERT INTO doc_sequences (doc_type, project_id, fy_code, next_seq)
          VALUES ('HAZOP-CONCEPT', NULL, $1, 2)
          ON CONFLICT (doc_type, fy_code) WHERE project_id IS NULL
          DO UPDATE SET next_seq = doc_sequences.next_seq + 1
          RETURNING next_seq - 1 AS allocated_seq
        `, [fyCode]);
        const seq = seqResult.rows[0].allocated_seq;
        studyNumber = `CONCEPT-HAZOP-${fyCode}-${String(seq).padStart(3, '0')}`;
      }

      // Insert study
      const teamJson = team_members ? JSON.stringify(team_members) : null;
      const insert = await client.query(`
        INSERT INTO hazop_studies (
          study_mode, project_id, study_number, title, concept_title,
          process_description, design_basis, study_leader, team_members,
          study_date, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, NOW(), NOW()
        ) RETURNING *
      `, [
        study_mode,
        study_mode === 'project_based' ? project_id : null,
        studyNumber,
        title.trim(),
        study_mode === 'concept_expected_project' ? (concept_title?.trim() ?? null) : null,
        process_description?.trim() ?? null,
        design_basis?.trim() ?? null,
        study_leader ?? null,
        teamJson,
        study_date ?? null,
        userId,
      ]);

      await client.query('COMMIT');
      res.status(201).json(insert.rows[0]);

    } catch (err) {
      await client.query('ROLLBACK');
      sendError(res, err);
    } finally {
      client.release();
    }
  });

  // ── Update study header fields (draft mode) ─────────────────────────────────
  app.patch('/api/hazop/studies/:studyId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });

      const existing = await pool.query('SELECT id, status FROM hazop_studies WHERE id = $1', [studyId]);
      if (existing.rowCount === 0) return sendNotFound(res, 'HAZOP Study');
      if (existing.rows[0].status === 'converted') {
        return res.status(409).json({ error: 'Converted studies are read-only' });
      }

      // Only allowed fields — prohibited fields silently ignored
      const allowed = ['title', 'concept_title', 'process_description', 'design_basis', 'study_leader', 'team_members', 'study_date'];
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      for (const field of allowed) {
        if (field in req.body) {
          updates.push(`${field} = $${idx}`);
          values.push(field === 'team_members' ? JSON.stringify(req.body[field]) : req.body[field]);
          idx++;
        }
      }

      if (updates.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });

      updates.push(`updated_at = NOW()`);
      values.push(studyId);

      const result = await pool.query(
        `UPDATE hazop_studies SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── Delete study (draft only) ───────────────────────────────────────────────
  app.delete('/api/hazop/studies/:studyId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });

      const existing = await pool.query('SELECT id, status FROM hazop_studies WHERE id = $1', [studyId]);
      if (existing.rowCount === 0) return sendNotFound(res, 'HAZOP Study');
      if (existing.rows[0].status !== 'draft') {
        return sendBusinessError(res, 'Only draft studies can be deleted');
      }

      await pool.query('DELETE FROM hazop_studies WHERE id = $1', [studyId]);
      res.status(204).send();
    } catch (err) { sendError(res, err); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Process Loop & Step Builder
  // ════════════════════════════════════════════════════════════════════════════

  // ── Helper: resolve study and enforce draft status ──────────────────────────
  async function resolveStudy(studyId: number) {
    const r = await pool.query('SELECT id, status, study_mode, project_id FROM hazop_studies WHERE id = $1', [studyId]);
    return r.rowCount === 0 ? null : r.rows[0];
  }

  // ── List loops for a study ──────────────────────────────────────────────────
  app.get('/api/hazop/studies/:studyId/loops', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });

      const study = await resolveStudy(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      const result = await pool.query(`
        SELECT l.*,
          (SELECT COUNT(*) FROM hazop_nodes n WHERE n.loop_id = l.id) AS node_count,
          (SELECT COUNT(*) FROM hazop_process_steps s WHERE s.loop_id = l.id) AS step_count
        FROM hazop_process_loops l
        WHERE l.study_id = $1
        ORDER BY l.sort_order, l.loop_number
      `, [studyId]);

      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── Create loop ─────────────────────────────────────────────────────────────
  app.post('/api/hazop/studies/:studyId/loops', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });

      const study = await resolveStudy(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      if (study.status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status to add loops' });

      const {
        loop_name, design_intent, fluid,
        operating_pressure_min, operating_pressure_max,
        operating_temp_min, operating_temp_max,
        p_and_id_ref, line_number,
      } = req.body;

      if (!loop_name || typeof loop_name !== 'string' || loop_name.trim() === '') {
        return res.status(400).json({ error: 'loop_name is required' });
      }

      const seqRes = await pool.query(
        'SELECT COALESCE(MAX(loop_number),0)+1 AS next_loop, COALESCE(MAX(sort_order),0)+1 AS next_sort FROM hazop_process_loops WHERE study_id=$1',
        [studyId]
      );
      const loopNumber = seqRes.rows[0].next_loop;
      const sortOrder = req.body.sort_order ?? seqRes.rows[0].next_sort;

      const result = await pool.query(`
        INSERT INTO hazop_process_loops
          (study_id, project_id, loop_number, loop_name, design_intent, fluid,
           operating_pressure_min, operating_pressure_max,
           operating_temp_min, operating_temp_max,
           p_and_id_ref, line_number, status, sort_order, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',$13,NOW(),NOW())
        RETURNING *
      `, [
        studyId, study.project_id, loopNumber, loop_name.trim(),
        design_intent?.trim() ?? null, fluid?.trim() ?? null,
        operating_pressure_min ?? null, operating_pressure_max ?? null,
        operating_temp_min ?? null, operating_temp_max ?? null,
        p_and_id_ref?.trim() ?? null, line_number?.trim() ?? null,
        sortOrder,
      ]);

      res.status(201).json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── Patch loop ──────────────────────────────────────────────────────────────
  app.patch('/api/hazop/loops/:loopId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const loopId = parseInt(req.params.loopId);
      if (isNaN(loopId)) return res.status(400).json({ error: 'Invalid loopId' });

      const loopRes = await pool.query('SELECT l.*, s.status AS study_status FROM hazop_process_loops l JOIN hazop_studies s ON s.id = l.study_id WHERE l.id = $1', [loopId]);
      if (loopRes.rowCount === 0) return sendNotFound(res, 'Process Loop');
      if (loopRes.rows[0].study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

      const allowed = ['loop_name','design_intent','fluid','operating_pressure_min','operating_pressure_max','operating_temp_min','operating_temp_max','p_and_id_ref','line_number','sort_order'];
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const f of allowed) {
        if (f in req.body) { updates.push(`${f}=$${idx}`); values.push(req.body[f]); idx++; }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
      updates.push(`updated_at=NOW()`);
      values.push(loopId);

      const result = await pool.query(
        `UPDATE hazop_process_loops SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
        values
      );
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── Delete loop (cascade: steps → nodes) ───────────────────────────────────
  app.delete('/api/hazop/loops/:loopId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const loopId = parseInt(req.params.loopId);
      if (isNaN(loopId)) return res.status(400).json({ error: 'Invalid loopId' });

      const loopRes = await pool.query('SELECT l.id, s.status AS study_status FROM hazop_process_loops l JOIN hazop_studies s ON s.id = l.study_id WHERE l.id = $1', [loopId]);
      if (loopRes.rowCount === 0) return sendNotFound(res, 'Process Loop');
      if (loopRes.rows[0].study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status to delete loops' });

      await pool.query('DELETE FROM hazop_process_loops WHERE id=$1', [loopId]);
      res.status(204).send();
    } catch (err) { sendError(res, err); }
  });

  // ── resolveNode helper ──────────────────────────────────────────────────────
  async function resolveNode(nodeId: number) {
    const r = await pool.query(`
      SELECT n.*, l.loop_number, l.study_id, l.project_id AS loop_project_id,
             s.status AS study_status, s.study_mode
      FROM hazop_nodes n
      JOIN hazop_process_loops l ON l.id = n.loop_id
      JOIN hazop_studies s ON s.id = l.study_id
      WHERE n.id = $1
    `, [nodeId]);
    return r.rowCount === 0 ? null : r.rows[0];
  }

  // ── List nodes for a loop ───────────────────────────────────────────────────
  app.get('/api/hazop/loops/:loopId/nodes', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const loopId = parseInt(req.params.loopId);
      if (isNaN(loopId)) return res.status(400).json({ error: 'Invalid loopId' });

      const loopRes = await pool.query('SELECT id FROM hazop_process_loops WHERE id=$1', [loopId]);
      if (loopRes.rowCount === 0) return sendNotFound(res, 'Process Loop');

      const result = await pool.query(`
        SELECT n.*,
          (SELECT COUNT(*) FROM hazop_process_steps s WHERE s.node_id = n.id) AS step_count
        FROM hazop_nodes n
        WHERE n.loop_id = $1
        ORDER BY n.node_number
      `, [loopId]);
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── Create node ─────────────────────────────────────────────────────────────
  app.post('/api/hazop/loops/:loopId/nodes', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const loopId = parseInt(req.params.loopId);
      if (isNaN(loopId)) return res.status(400).json({ error: 'Invalid loopId' });

      const loopRes = await pool.query(`
        SELECT l.*, s.status AS study_status, s.id AS study_id
        FROM hazop_process_loops l JOIN hazop_studies s ON s.id = l.study_id WHERE l.id = $1
      `, [loopId]);
      if (loopRes.rowCount === 0) return sendNotFound(res, 'Process Loop');
      const loop = loopRes.rows[0];
      if (loop.study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

      const { node_name, node_description, design_intent, p_and_id_ref } = req.body;
      if (!node_name || typeof node_name !== 'string' || !node_name.trim()) {
        return res.status(400).json({ error: 'node_name is required' });
      }

      const seqRes = await pool.query(
        'SELECT COALESCE(MAX(node_number),0)+1 AS next_num FROM hazop_nodes WHERE loop_id=$1',
        [loopId]
      );
      const nodeNumber = seqRes.rows[0].next_num;
      const nodeReference = `${loop.loop_number}.${nodeNumber}`;

      const result = await pool.query(`
        INSERT INTO hazop_nodes
          (study_id, loop_id, node_number, node_name, node_reference,
           node_description, design_intent, p_and_id_ref,
           process_function, operating_regime, phase_state,
           deviation_count, action_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,0)
        RETURNING *
      `, [
        loop.study_id, loopId, nodeNumber, node_name.trim(), nodeReference,
        node_description?.trim() ?? null,
        design_intent?.trim() ?? null,
        p_and_id_ref?.trim() ?? null,
        req.body.process_function?.trim() || 'General',
        req.body.operating_regime?.trim() || 'atmospheric',
        req.body.phase_state?.trim() || 'liquid',
      ]);
      res.status(201).json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── Patch node ──────────────────────────────────────────────────────────────
  app.patch('/api/hazop/nodes/:nodeId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const nodeId = parseInt(req.params.nodeId);
      if (isNaN(nodeId)) return res.status(400).json({ error: 'Invalid nodeId' });

      const node = await resolveNode(nodeId);
      if (!node) return sendNotFound(res, 'Process Node');
      if (node.study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

      if ('node_name' in req.body && (!req.body.node_name || !req.body.node_name.trim())) {
        return res.status(400).json({ error: 'node_name cannot be empty' });
      }

      const allowed = ['node_name', 'node_description', 'design_intent', 'p_and_id_ref',
                       'process_function', 'operating_regime', 'phase_state'];
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const f of allowed) {
        if (f in req.body) { updates.push(`${f}=$${idx}`); values.push(req.body[f]); idx++; }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
      values.push(nodeId);

      const result = await pool.query(
        `UPDATE hazop_nodes SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
        values
      );
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── Delete node (cascade: steps) ────────────────────────────────────────────
  app.delete('/api/hazop/nodes/:nodeId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const nodeId = parseInt(req.params.nodeId);
      if (isNaN(nodeId)) return res.status(400).json({ error: 'Invalid nodeId' });

      const node = await resolveNode(nodeId);
      if (!node) return sendNotFound(res, 'Process Node');
      if (node.study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status to delete nodes' });

      await pool.query('DELETE FROM hazop_nodes WHERE id=$1', [nodeId]);
      res.status(204).send();
    } catch (err) { sendError(res, err); }
  });

  // ── List steps for a node ───────────────────────────────────────────────────
  app.get('/api/hazop/nodes/:nodeId/steps', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const nodeId = parseInt(req.params.nodeId);
      if (isNaN(nodeId)) return res.status(400).json({ error: 'Invalid nodeId' });

      const nodeRes = await pool.query('SELECT id FROM hazop_nodes WHERE id=$1', [nodeId]);
      if (nodeRes.rowCount === 0) return sendNotFound(res, 'Process Node');

      const result = await pool.query(`
        SELECT s.*,
          ce.concept_tag AS concept_equipment_tag, ce.equipment_role AS concept_equipment_role,
          bl.tag_no AS buy_list_tag, bl.service_description AS buy_list_service
        FROM hazop_process_steps s
        LEFT JOIN hazop_concept_equipment ce ON ce.id = s.concept_equipment_id
        LEFT JOIN project_buy_list_lines bl ON bl.id = s.buy_list_line_id
        WHERE s.node_id = $1
        ORDER BY s.sequence_no
      `, [nodeId]);
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── Create step under a node ────────────────────────────────────────────────
  app.post('/api/hazop/nodes/:nodeId/steps', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const nodeId = parseInt(req.params.nodeId);
      if (isNaN(nodeId)) return res.status(400).json({ error: 'Invalid nodeId' });

      const nodeRes = await pool.query(`
        SELECT n.*, l.loop_number, l.study_id, l.project_id AS loop_project_id,
               s.status AS study_status, s.study_mode
        FROM hazop_nodes n
        JOIN hazop_process_loops l ON l.id = n.loop_id
        JOIN hazop_studies s ON s.id = l.study_id
        WHERE n.id = $1
      `, [nodeId]);
      if (nodeRes.rowCount === 0) return sendNotFound(res, 'Process Node');
      const node = nodeRes.rows[0];
      if (node.study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

      const {
        equipment_category, equipment_tag, equipment_role,
        connection_type, outlet_type, outlet_destination, outlet_destination_ref,
        operating_pressure, operating_temperature, fluid, remarks,
        buy_list_line_id, concept_equipment_id,
      } = req.body;

      if (!EQUIPMENT_CATEGORIES.includes(equipment_category)) {
        return res.status(400).json({ error: `Invalid equipment_category. Must be one of: ${EQUIPMENT_CATEGORIES.join(', ')}` });
      }
      if (!CONNECTION_TYPES.includes(connection_type)) {
        return res.status(400).json({ error: `Invalid connection_type. Must be one of: ${CONNECTION_TYPES.join(', ')}` });
      }
      if (!OUTLET_DESTINATIONS.includes(outlet_destination)) {
        return res.status(400).json({ error: `Invalid outlet_destination. Must be one of: ${OUTLET_DESTINATIONS.join(', ')}` });
      }

      // V11/V12 — outlet_destination_ref validation
      const refVal = outlet_destination_ref?.trim() || null;
      if (REF_REQUIRED_DESTINATIONS.has(outlet_destination) && !refVal) {
        return res.status(400).json({ error: `V11: outlet_destination_ref is required when outlet_destination is '${outlet_destination}'` });
      }
      if (refVal && !REF_FORMAT.test(refVal)) {
        return res.status(400).json({ error: 'V12: outlet_destination_ref must match format {L}.{N}.{S} (e.g. 1.2.3)' });
      }

      if (buy_list_line_id != null && concept_equipment_id != null) {
        return res.status(400).json({ error: 'buy_list_line_id and concept_equipment_id are mutually exclusive' });
      }
      if (concept_equipment_id != null && node.study_mode === 'project_based') {
        return res.status(400).json({ error: 'concept_equipment_id cannot be set on a project_based study' });
      }
      if (buy_list_line_id != null && node.study_mode === 'concept_expected_project') {
        return res.status(400).json({ error: 'buy_list_line_id cannot be set on a concept study' });
      }
      if (buy_list_line_id != null) {
        const blCheck = await pool.query(`
          SELECT l.id FROM project_buy_list_lines l
          JOIN project_buy_list_headers h ON h.id = l.buy_list_header_id
          WHERE l.id=$1 AND h.project_id=$2
        `, [buy_list_line_id, node.loop_project_id]);
        if (blCheck.rowCount === 0) return res.status(400).json({ error: 'buy_list_line_id does not belong to this study project' });
      }
      if (concept_equipment_id != null) {
        const ceCheck = await pool.query('SELECT id FROM hazop_concept_equipment WHERE id=$1 AND study_id=$2', [concept_equipment_id, node.study_id]);
        if (ceCheck.rowCount === 0) return res.status(400).json({ error: 'concept_equipment_id does not belong to this study' });
      }

      const seqRes = await pool.query(
        'SELECT COALESCE(MAX(sequence_no),0)+1 AS next_seq FROM hazop_process_steps WHERE node_id=$1',
        [nodeId]
      );
      const sequenceNo = seqRes.rows[0].next_seq;

      const warnings: string[] = [];
      const virtualCategories = ['Drain', 'Vent', 'Next Loop', 'Product Outlet', 'Waste Outlet'];
      if (sequenceNo === 1 && !['Tank','Vessel','Separator','Utility System'].includes(equipment_category) && connection_type !== 'Loop transition') {
        warnings.push('V1: First step should start with Tank, Vessel, Separator, Utility System, or Loop transition connection');
      }
      if (!virtualCategories.includes(equipment_category) && (!equipment_tag || !equipment_tag.trim())) {
        warnings.push('V3: equipment_tag is missing for a taggable step');
      }

      const result = await pool.query(`
        INSERT INTO hazop_process_steps
          (node_id, loop_id, project_id, sequence_no,
           equipment_category, equipment_tag, equipment_role,
           connection_type, outlet_type, outlet_destination, outlet_destination_ref,
           operating_pressure, operating_temperature, fluid, remarks,
           buy_list_line_id, concept_equipment_id,
           sort_order, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$4,NOW(),NOW())
        RETURNING *
      `, [
        nodeId, node.loop_id, node.loop_project_id, sequenceNo,
        equipment_category, equipment_tag?.trim() ?? null, equipment_role?.trim() ?? null,
        connection_type, outlet_type?.trim() ?? null, outlet_destination, refVal,
        operating_pressure ?? null, operating_temperature ?? null,
        fluid?.trim() ?? null, remarks?.trim() ?? null,
        buy_list_line_id ?? null, concept_equipment_id ?? null,
      ]);

      // KI-2: flag node topology changed if deviations were already generated
      await pool.query(
        `UPDATE hazop_nodes SET topology_changed_after_review = true WHERE id = $1 AND generated_at IS NOT NULL`,
        [nodeId]
      );

      res.status(201).json({ ...result.rows[0], warnings });
    } catch (err) { sendError(res, err); }
  });

  // ── Patch step ──────────────────────────────────────────────────────────────
  app.patch('/api/hazop/steps/:stepId', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const stepId = parseInt(req.params.stepId);
      if (isNaN(stepId)) return res.status(400).json({ error: 'Invalid stepId' });

      const stepRes = await client.query(`
        SELECT s.*, l.loop_number, l.study_id,
               st.status AS study_status, st.study_mode, st.project_id AS study_project_id
        FROM hazop_process_steps s
        JOIN hazop_process_loops l ON l.id = s.loop_id
        JOIN hazop_studies st ON st.id = l.study_id
        WHERE s.id = $1
      `, [stepId]);
      if (stepRes.rowCount === 0) return sendNotFound(res, 'Process Step');
      const existing = stepRes.rows[0];
      if (existing.study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

      // sequence_no is immutable — silently ignored
      const allowed = [
        'equipment_category','equipment_tag','equipment_role','connection_type',
        'outlet_type','outlet_destination','outlet_destination_ref',
        'operating_pressure','operating_temperature','fluid','remarks',
        'sort_order','buy_list_line_id','concept_equipment_id',
      ];

      const body = { ...req.body };
      delete body.sequence_no; // immutable — enforce here

      // Validate vocab if provided
      if (body.equipment_category && !EQUIPMENT_CATEGORIES.includes(body.equipment_category)) {
        return res.status(400).json({ error: `Invalid equipment_category` });
      }
      if (body.connection_type && !CONNECTION_TYPES.includes(body.connection_type)) {
        return res.status(400).json({ error: `Invalid connection_type` });
      }
      if (body.outlet_destination && !OUTLET_DESTINATIONS.includes(body.outlet_destination)) {
        return res.status(400).json({ error: `Invalid outlet_destination` });
      }

      // V11/V12 — outlet_destination_ref validation (evaluate against effective values)
      const effectiveOutletDest = body.outlet_destination ?? existing.outlet_destination;
      const effectiveOutletRef = 'outlet_destination_ref' in body
        ? (body.outlet_destination_ref?.trim() || null)
        : existing.outlet_destination_ref;
      if (REF_REQUIRED_DESTINATIONS.has(effectiveOutletDest) && !effectiveOutletRef) {
        return res.status(400).json({ error: `V11: outlet_destination_ref is required when outlet_destination is '${effectiveOutletDest}'` });
      }
      if (effectiveOutletRef && !REF_FORMAT.test(effectiveOutletRef)) {
        return res.status(400).json({ error: 'V12: outlet_destination_ref must match format {L}.{N}.{S} (e.g. 1.2.3)' });
      }

      // Mutual exclusivity
      const newBl = body.buy_list_line_id ?? existing.buy_list_line_id;
      const newCe = body.concept_equipment_id ?? existing.concept_equipment_id;
      if (newBl != null && newCe != null) return res.status(400).json({ error: 'buy_list_line_id and concept_equipment_id are mutually exclusive' });
      if (body.concept_equipment_id != null && existing.study_mode === 'project_based') {
        return res.status(400).json({ error: 'concept_equipment_id cannot be set on a project_based study' });
      }
      if (body.buy_list_line_id != null && existing.study_mode === 'concept_expected_project') {
        return res.status(400).json({ error: 'buy_list_line_id cannot be set on a concept study' });
      }
      if (body.buy_list_line_id != null) {
        const blCheck = await client.query(`
          SELECT l.id FROM project_buy_list_lines l
          JOIN project_buy_list_headers h ON h.id = l.buy_list_header_id
          WHERE l.id=$1 AND h.project_id=$2
        `, [body.buy_list_line_id, existing.study_project_id]);
        if (blCheck.rowCount === 0) return res.status(400).json({ error: 'buy_list_line_id does not belong to this study project' });
      }
      if (body.concept_equipment_id != null) {
        const ceCheck = await client.query('SELECT id FROM hazop_concept_equipment WHERE id=$1 AND study_id=$2', [body.concept_equipment_id, existing.study_id]);
        if (ceCheck.rowCount === 0) return res.status(400).json({ error: 'concept_equipment_id does not belong to this study' });
      }

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const f of allowed) {
        if (f in body) { updates.push(`${f}=$${idx}`); values.push(body[f]); idx++; }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
      updates.push(`updated_at=NOW()`);
      values.push(stepId);

      const stepUpdate = await client.query(
        `UPDATE hazop_process_steps SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
        values
      );

      // KI-2: flag node topology changed if deviations were already generated
      await client.query(
        `UPDATE hazop_nodes SET topology_changed_after_review = true WHERE id = $1 AND generated_at IS NOT NULL`,
        [existing.node_id]
      );

      await client.query('COMMIT');
      res.json(stepUpdate.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      sendError(res, err);
    } finally { client.release(); }
  });

  // ── Delete step (node NOT deleted — steps are independent of node lifecycle) ─
  app.delete('/api/hazop/steps/:stepId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const stepId = parseInt(req.params.stepId);
      if (isNaN(stepId)) return res.status(400).json({ error: 'Invalid stepId' });

      const stepRes = await pool.query(`
        SELECT s.id, s.node_id, st.status AS study_status
        FROM hazop_process_steps s
        JOIN hazop_nodes n ON n.id = s.node_id
        JOIN hazop_process_loops l ON l.id = n.loop_id
        JOIN hazop_studies st ON st.id = l.study_id
        WHERE s.id = $1
      `, [stepId]);
      if (stepRes.rowCount === 0) return sendNotFound(res, 'Process Step');
      const stepRow = stepRes.rows[0];
      if (stepRow.study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status to delete steps' });

      await pool.query('DELETE FROM hazop_process_steps WHERE id=$1', [stepId]);
      // KI-2: flag node topology changed if deviations were already generated
      await pool.query(
        `UPDATE hazop_nodes SET topology_changed_after_review = true WHERE id = $1 AND generated_at IS NOT NULL`,
        [stepRow.node_id]
      );
      res.status(204).send();
    } catch (err) { sendError(res, err); }
  });

  // ── List all nodes for a study (read-only) ──────────────────────────────────
  app.get('/api/hazop/studies/:studyId/nodes', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });

      const study = await resolveStudy(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      const result = await pool.query(`
        SELECT n.*,
          l.loop_number, l.loop_name,
          (SELECT COUNT(*) FROM hazop_process_steps s WHERE s.node_id = n.id) AS step_count
        FROM hazop_nodes n
        JOIN hazop_process_loops l ON l.id = n.loop_id
        WHERE n.study_id = $1
        ORDER BY l.sort_order, l.loop_number, n.node_number
      `, [studyId]);

      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── Equipment pool resolver (mode-aware) ────────────────────────────────────
  app.get('/api/hazop/studies/:studyId/equipment-pool', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });

      const study = await resolveStudy(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      const category = req.query.category as string | undefined;

      if (study.study_mode === 'project_based') {
        const params: any[] = [study.project_id];
        const catFilter = category ? 'AND bl.tag_no IS NOT NULL' : '';
        const result = await pool.query(`
          SELECT bl.id, bl.tag_no, bl.service_description, bl.buy_subgroup_id
          FROM project_buy_list_lines bl
          JOIN project_buy_list_headers h ON h.id = bl.buy_list_header_id
          WHERE h.project_id = $1 AND bl.tag_no IS NOT NULL AND bl.tag_no != ''
          ${catFilter}
          ORDER BY bl.tag_no
        `, params);
        res.json({ mode: 'project_based', items: result.rows });
      } else {
        const params: any[] = [studyId];
        const catFilter = category ? ' AND equipment_category = $2' : '';
        if (category) params.push(category);
        const result = await pool.query(
          `SELECT id, concept_tag, equipment_category, equipment_role, fluid
           FROM hazop_concept_equipment WHERE study_id=$1${catFilter} ORDER BY concept_tag`,
          params
        );
        res.json({ mode: 'concept', items: result.rows });
      }
    } catch (err) { sendError(res, err); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Concept Equipment CRUD (concept mode only)
  // ════════════════════════════════════════════════════════════════════════════

  // ── List concept equipment ──────────────────────────────────────────────────
  app.get('/api/hazop/studies/:studyId/concept-equipment', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });

      const study = await resolveStudy(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      if (study.study_mode !== 'concept_expected_project') {
        return res.status(400).json({ error: 'Concept equipment only available on concept studies' });
      }

      const result = await pool.query(
        'SELECT * FROM hazop_concept_equipment WHERE study_id=$1 ORDER BY concept_tag',
        [studyId]
      );
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── Create concept equipment ────────────────────────────────────────────────
  app.post('/api/hazop/studies/:studyId/concept-equipment', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });

      const study = await resolveStudy(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      if (study.study_mode !== 'concept_expected_project') return res.status(400).json({ error: 'Concept equipment only for concept studies' });
      if (study.status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

      const { equipment_category, concept_tag } = req.body;
      if (!EQUIPMENT_CATEGORIES.includes(equipment_category)) {
        return res.status(400).json({ error: `Invalid equipment_category` });
      }
      if (!concept_tag || !concept_tag.trim()) return res.status(400).json({ error: 'concept_tag is required' });

      const result = await pool.query(`
        INSERT INTO hazop_concept_equipment
          (study_id, equipment_category, concept_tag, equipment_role, make, model, kw_rating,
           estimated_pressure_min, estimated_pressure_max, estimated_temp_min, estimated_temp_max,
           fluid, has_vfd, hazardous_area, area_classification, design_assumption, notes,
           is_confirmed, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,false,NOW(),NOW())
        RETURNING *
      `, [
        studyId, equipment_category, concept_tag.trim(),
        req.body.equipment_role?.trim() ?? null,
        req.body.make?.trim() ?? null, req.body.model?.trim() ?? null,
        req.body.kw_rating ?? null,
        req.body.estimated_pressure_min ?? null, req.body.estimated_pressure_max ?? null,
        req.body.estimated_temp_min ?? null, req.body.estimated_temp_max ?? null,
        req.body.fluid?.trim() ?? null,
        req.body.has_vfd ?? false, req.body.hazardous_area ?? false,
        req.body.area_classification?.trim() ?? null,
        req.body.design_assumption?.trim() ?? null,
        req.body.notes?.trim() ?? null,
      ]);
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') return res.status(409).json({ error: 'concept_tag already exists for this study' });
      sendError(res, err);
    }
  });

  // ── Patch concept equipment ─────────────────────────────────────────────────
  app.patch('/api/hazop/concept-equipment/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

      const ceRes = await pool.query(`
        SELECT ce.*, s.status AS study_status
        FROM hazop_concept_equipment ce
        JOIN hazop_studies s ON s.id = ce.study_id
        WHERE ce.id = $1
      `, [id]);
      if (ceRes.rowCount === 0) return sendNotFound(res, 'Concept Equipment');
      if (ceRes.rows[0].study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

      // Block concept_tag change if linked to a step
      if ('concept_tag' in req.body && req.body.concept_tag !== ceRes.rows[0].concept_tag) {
        const linked = await pool.query('SELECT id FROM hazop_process_steps WHERE concept_equipment_id=$1 LIMIT 1', [id]);
        if (linked.rowCount! > 0) return res.status(409).json({ error: 'Tag in use by step — remove step link first' });
      }

      const allowed = [
        'equipment_category','concept_tag','equipment_role','make','model','kw_rating',
        'estimated_pressure_min','estimated_pressure_max','estimated_temp_min','estimated_temp_max',
        'fluid','has_vfd','hazardous_area','area_classification','design_assumption','notes',
      ];
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const f of allowed) {
        if (f in req.body) { updates.push(`${f}=$${idx}`); values.push(req.body[f]); idx++; }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
      updates.push(`updated_at=NOW()`);
      values.push(id);

      const result = await pool.query(
        `UPDATE hazop_concept_equipment SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
        values
      );
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── Delete concept equipment ────────────────────────────────────────────────
  app.delete('/api/hazop/concept-equipment/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

      const ceRes = await pool.query(`
        SELECT ce.id, s.status AS study_status
        FROM hazop_concept_equipment ce
        JOIN hazop_studies s ON s.id = ce.study_id
        WHERE ce.id = $1
      `, [id]);
      if (ceRes.rowCount === 0) return sendNotFound(res, 'Concept Equipment');
      if (ceRes.rows[0].study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

      const linked = await pool.query('SELECT id FROM hazop_process_steps WHERE concept_equipment_id=$1 LIMIT 1', [id]);
      if (linked.rowCount! > 0) return res.status(409).json({ error: 'Equipment linked to step — unlink step first' });

      await pool.query('DELETE FROM hazop_concept_equipment WHERE id=$1', [id]);
      res.status(204).send();
    } catch (err) { sendError(res, err); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 3B — Deviation Generation Engine
  // ════════════════════════════════════════════════════════════════════════════

  const GUIDEWORD_ORDER = ['No', 'More', 'Less', 'Reverse', 'Other Than', 'Part of', 'As well as', 'Early', 'Late'];
  const TWFE_PRIORITY_CATEGORIES = [
    'TWFE Evaporator', 'Vacuum Condenser', 'Degasoil Flash Vessel',
    'Vacuum Ejector System', 'Residue Pump', 'Dehydration Column',
  ];

  function parseJsonArray(val: any): string[] {
    if (Array.isArray(val)) return val as string[];
    if (typeof val === 'string') { try { return JSON.parse(val); } catch { return []; } }
    return [];
  }

  // ── Worksheet summary (all loops + nodes + generation status) ───────────────
  app.get('/api/hazop/studies/:studyId/worksheet-summary', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });
      const study = await resolveStudy(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      const rows = await pool.query(`
        SELECT l.id AS loop_id, l.loop_number, l.loop_name, l.sort_order,
               n.id AS node_id, n.node_number, n.node_name, n.node_reference,
               n.deviation_count, n.action_count, n.generated_at, n.generated_by,
               n.process_function, n.operating_regime, n.phase_state,
               n.topology_changed_after_review,
               (SELECT COUNT(*) FROM hazop_process_steps s WHERE s.node_id = n.id) AS step_count
        FROM hazop_process_loops l
        LEFT JOIN hazop_nodes n ON n.loop_id = l.id
        WHERE l.study_id = $1
        ORDER BY l.sort_order, l.loop_number, n.node_number
      `, [studyId]);

      const loopMap = new Map<number, any>();
      for (const row of rows.rows) {
        if (!loopMap.has(row.loop_id)) {
          loopMap.set(row.loop_id, {
            loop_id: row.loop_id, loop_number: row.loop_number,
            loop_name: row.loop_name, nodes: [],
          });
        }
        if (row.node_id != null) {
          loopMap.get(row.loop_id).nodes.push({
            node_id: row.node_id, node_number: row.node_number,
            node_name: row.node_name, node_reference: row.node_reference,
            deviation_count: row.deviation_count, action_count: row.action_count,
            generated_at: row.generated_at, generated_by: row.generated_by,
            process_function: row.process_function, operating_regime: row.operating_regime,
            phase_state: row.phase_state, step_count: row.step_count,
            topology_changed_after_review: row.topology_changed_after_review,
          });
        }
      }
      res.json({ study_id: studyId, loops: [...loopMap.values()] });
    } catch (err) { sendError(res, err); }
  });

  // ── Generate deviations for a single node ───────────────────────────────────
  app.post('/api/hazop/nodes/:nodeId/generate', ensureAuthenticated, async (req: Request, res: Response) => {
    const nodeId = parseInt(req.params.nodeId);
    if (isNaN(nodeId)) return res.status(400).json({ error: 'Invalid nodeId' });
    const userId = (req as any).user?.id ?? null;
    const forceRegen = req.body?.force_regen === true;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const nodeRes = await client.query(`
        SELECT n.*, l.loop_number, s.id AS study_id_check, s.status AS study_status
        FROM hazop_nodes n
        JOIN hazop_process_loops l ON l.id = n.loop_id
        JOIN hazop_studies s ON s.id = n.study_id
        WHERE n.id = $1
      `, [nodeId]);
      if (nodeRes.rowCount === 0) { await client.query('ROLLBACK'); return sendNotFound(res, 'Node'); }
      const node = nodeRes.rows[0];
      if (node.study_status !== 'draft') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Study must be in draft status' }); }

      await client.query(`SELECT pg_advisory_xact_lock($1::bigint)`, [node.study_id * 10000 + 3001]);

      const stepsRes = await client.query(
        `SELECT * FROM hazop_process_steps WHERE node_id = $1 ORDER BY sequence_no`, [nodeId]
      );
      if ((stepsRes.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Node has no steps — add at least one step before generating' });
      }
      const steps = stepsRes.rows;
      const categories = [...new Set(steps.map((s: any) => s.equipment_category as string))];

      const libRes = await client.query(
        `SELECT * FROM hazop_deviation_library WHERE equipment_category = ANY($1::text[]) AND applicable = true`,
        [categories]
      );
      let allLibRows = [...libRes.rows];

      if (node.operating_regime === 'vacuum') {
        const vacRes = await client.query(
          `SELECT * FROM hazop_deviation_library WHERE equipment_category = 'Vacuum Service' AND applicable = true`
        );
        allLibRows = [...allLibRows, ...vacRes.rows];
      }
      if (node.phase_state === 'two_phase' || node.phase_state === 'vapor') {
        const phaseRes = await client.query(
          `SELECT * FROM hazop_deviation_library WHERE equipment_category = 'Phase Transition' AND applicable = true`
        );
        allLibRows = [...allLibRows, ...phaseRes.rows];
      }

      let dominantCat: string | null = null;
      for (const prio of TWFE_PRIORITY_CATEGORIES) {
        if (categories.includes(prio)) { dominantCat = prio; break; }
      }
      if (!dominantCat && categories.length > 0) dominantCat = categories[0];

      const pairMap = new Map<string, any>();
      for (const row of allLibRows) {
        const key = `${row.guideword}|${row.parameter}`;
        if (!pairMap.has(key)) pairMap.set(key, row);
        if (row.equipment_category === dominantCat) pairMap.set(key, row);
      }

      const pairs = [...pairMap.entries()].sort(([, a], [, b]) => {
        const ia = GUIDEWORD_ORDER.indexOf(a.guideword);
        const ib = GUIDEWORD_ORDER.indexOf(b.guideword);
        if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        return String(a.parameter).localeCompare(String(b.parameter));
      });

      let generated = 0;
      let skipped = 0;

      for (const [key, bestRow] of pairs) {
        const [gw, param] = key.split('|');

        const existRes = await client.query(
          `SELECT id, reviewed FROM hazop_deviations WHERE node_id = $1 AND guideword = $2 AND parameter = $3`,
          [nodeId, gw, param]
        );
        if ((existRes.rowCount ?? 0) > 0) {
          const ex = existRes.rows[0];
          if (ex.reviewed || !forceRegen) { skipped++; continue; }
          await client.query(`UPDATE hazop_deviations SET deviation_description=$1 WHERE id=$2`,
            [bestRow.deviation_description, ex.id]);
          skipped++; continue;
        }

        const cntRes = await client.query(`SELECT COUNT(*) AS cnt FROM hazop_deviations WHERE node_id=$1`, [nodeId]);
        const seqNo = parseInt(cntRes.rows[0].cnt) + 1;
        const devNumber = `${node.node_reference}-D${String(seqNo).padStart(2, '0')}`;

        const devRes = await client.query(`
          INSERT INTO hazop_deviations
            (node_id, study_id, deviation_number, guideword, parameter, deviation_description, is_credible, reviewed, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,true,false,NOW())
          ON CONFLICT (node_id, guideword, parameter) DO NOTHING RETURNING id
        `, [nodeId, node.study_id, devNumber, gw, param, bestRow.deviation_description]);

        if ((devRes.rowCount ?? 0) === 0) { skipped++; continue; }
        const devId = devRes.rows[0].id;

        const causes = parseJsonArray(bestRow.typical_causes);
        for (let i = 0; i < causes.length; i++)
          await client.query(`INSERT INTO hazop_causes (deviation_id,cause_number,cause_description,source,deleted) VALUES($1,$2,$3,'library',false)`,
            [devId, i + 1, causes[i]]);

        const consequences = parseJsonArray(bestRow.typical_consequences);
        for (let i = 0; i < consequences.length; i++)
          await client.query(`INSERT INTO hazop_consequences (deviation_id,consequence_number,consequence_description,source,deleted) VALUES($1,$2,$3,'library',false)`,
            [devId, i + 1, consequences[i]]);

        const safeguards = parseJsonArray(bestRow.typical_safeguards);
        for (let i = 0; i < safeguards.length; i++)
          await client.query(`INSERT INTO hazop_safeguards (deviation_id,safeguard_number,safeguard_description,source,deleted) VALUES($1,$2,$3,'library',false)`,
            [devId, i + 1, safeguards[i]]);

        const actions = parseJsonArray(bestRow.typical_actions);
        for (let i = 0; i < actions.length; i++)
          await client.query(`INSERT INTO hazop_actions (deviation_id,action_number,action_description,source,status) VALUES($1,$2,$3,'library','open')`,
            [devId, i + 1, actions[i]]);

        generated++;
      }

      await client.query(`
        UPDATE hazop_nodes SET
          deviation_count = (SELECT COUNT(*) FROM hazop_deviations WHERE node_id=$1),
          action_count = (SELECT COUNT(*) FROM hazop_actions a JOIN hazop_deviations d ON d.id=a.deviation_id WHERE d.node_id=$1 AND a.status='open'),
          generated_at = NOW(), generated_by = $2, topology_changed_after_review = false
        WHERE id = $1
      `, [nodeId, userId]);

      await client.query('COMMIT');
      const stats = await pool.query(`SELECT deviation_count, action_count FROM hazop_nodes WHERE id=$1`, [nodeId]);
      res.json({ success: true, node_id: nodeId, generated, skipped,
        deviation_count: stats.rows[0]?.deviation_count ?? 0,
        action_count: stats.rows[0]?.action_count ?? 0 });
    } catch (err: any) {
      await client.query('ROLLBACK'); sendError(res, err);
    } finally { client.release(); }
  });

  // ── Bulk generate for entire study (skips nodes with no steps) ──────────────
  app.post('/api/hazop/studies/:studyId/generate', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });
      const study = await resolveStudy(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      if (study.status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

      const nodesRes = await pool.query(
        `SELECT n.id FROM hazop_nodes n
         WHERE n.study_id = $1
           AND EXISTS (SELECT 1 FROM hazop_process_steps s WHERE s.node_id = n.id)
         ORDER BY n.id`, [studyId]
      );
      const nodeIds: number[] = nodesRes.rows.map((r: any) => r.id);
      const forceRegen = req.body?.force_regen === true;

      let totalGenerated = 0;
      let totalSkipped = 0;
      const nodeResults: any[] = [];

      for (const nodeId of nodeIds) {
        // Re-use the single-node generation logic via internal call
        const mockReq = { params: { nodeId: String(nodeId) }, body: { force_regen: forceRegen }, user: (req as any).user } as any;
        let nodeResult: any = null;
        await new Promise<void>((resolve) => {
          const mockRes = {
            status: (code: number) => ({ json: (data: any) => { nodeResult = { node_id: nodeId, status: code, ...data }; resolve(); } }),
            json: (data: any) => { nodeResult = { node_id: nodeId, status: 200, ...data }; resolve(); },
          } as any;
          // Call the generate endpoint logic directly via pool
          (async () => {
            const userId = (req as any).user?.id ?? null;
            const client2 = await pool.connect();
            try {
              await client2.query('BEGIN');
              const nodeRes = await client2.query(`SELECT n.*, s.status AS study_status FROM hazop_nodes n JOIN hazop_process_loops l ON l.id=n.loop_id JOIN hazop_studies s ON s.id=n.study_id WHERE n.id=$1`, [nodeId]);
              const node = nodeRes.rows[0];
              await client2.query(`SELECT pg_advisory_xact_lock($1::bigint)`, [studyId * 10000 + 3001]);
              const stepsRes = await client2.query(`SELECT * FROM hazop_process_steps WHERE node_id=$1 ORDER BY sequence_no`, [nodeId]);
              const steps = stepsRes.rows;
              const categories = [...new Set(steps.map((s: any) => s.equipment_category as string))];
              const libRes = await client2.query(`SELECT * FROM hazop_deviation_library WHERE equipment_category = ANY($1::text[]) AND applicable=true`, [categories]);
              let allLibRows = [...libRes.rows];
              if (node.operating_regime === 'vacuum') {
                const vr = await client2.query(`SELECT * FROM hazop_deviation_library WHERE equipment_category='Vacuum Service' AND applicable=true`);
                allLibRows = [...allLibRows, ...vr.rows];
              }
              if (node.phase_state === 'two_phase' || node.phase_state === 'vapor') {
                const pr = await client2.query(`SELECT * FROM hazop_deviation_library WHERE equipment_category='Phase Transition' AND applicable=true`);
                allLibRows = [...allLibRows, ...pr.rows];
              }
              let dominantCat: string | null = null;
              for (const p of TWFE_PRIORITY_CATEGORIES) { if (categories.includes(p)) { dominantCat = p; break; } }
              if (!dominantCat && categories.length > 0) dominantCat = categories[0];
              const pairMap = new Map<string, any>();
              for (const row of allLibRows) {
                const key = `${row.guideword}|${row.parameter}`;
                if (!pairMap.has(key)) pairMap.set(key, row);
                if (row.equipment_category === dominantCat) pairMap.set(key, row);
              }
              const pairs = [...pairMap.entries()].sort(([, a], [, b]) => {
                const ia = GUIDEWORD_ORDER.indexOf(a.guideword); const ib = GUIDEWORD_ORDER.indexOf(b.guideword);
                if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
                return String(a.parameter).localeCompare(String(b.parameter));
              });
              let gen = 0; let sk = 0;
              for (const [key, bestRow] of pairs) {
                const [gw, param] = key.split('|');
                const existRes = await client2.query(`SELECT id, reviewed FROM hazop_deviations WHERE node_id=$1 AND guideword=$2 AND parameter=$3`, [nodeId, gw, param]);
                if ((existRes.rowCount ?? 0) > 0) { const ex = existRes.rows[0]; if (ex.reviewed || !forceRegen) { sk++; continue; } await client2.query(`UPDATE hazop_deviations SET deviation_description=$1 WHERE id=$2`, [bestRow.deviation_description, ex.id]); sk++; continue; }
                const cntRes = await client2.query(`SELECT COUNT(*) AS cnt FROM hazop_deviations WHERE node_id=$1`, [nodeId]);
                const seqNo = parseInt(cntRes.rows[0].cnt) + 1;
                const devRes = await client2.query(`INSERT INTO hazop_deviations (node_id,study_id,deviation_number,guideword,parameter,deviation_description,is_credible,reviewed,created_at) VALUES($1,$2,$3,$4,$5,$6,true,false,NOW()) ON CONFLICT (node_id,guideword,parameter) DO NOTHING RETURNING id`,
                  [nodeId, studyId, `${node.node_reference}-D${String(seqNo).padStart(2,'0')}`, gw, param, bestRow.deviation_description]);
                if ((devRes.rowCount ?? 0) === 0) { sk++; continue; }
                const devId = devRes.rows[0].id;
                const causes = parseJsonArray(bestRow.typical_causes); for (let i=0;i<causes.length;i++) await client2.query(`INSERT INTO hazop_causes(deviation_id,cause_number,cause_description,source,deleted) VALUES($1,$2,$3,'library',false)`,[devId,i+1,causes[i]]);
                const consequences = parseJsonArray(bestRow.typical_consequences); for (let i=0;i<consequences.length;i++) await client2.query(`INSERT INTO hazop_consequences(deviation_id,consequence_number,consequence_description,source,deleted) VALUES($1,$2,$3,'library',false)`,[devId,i+1,consequences[i]]);
                const safeguards = parseJsonArray(bestRow.typical_safeguards); for (let i=0;i<safeguards.length;i++) await client2.query(`INSERT INTO hazop_safeguards(deviation_id,safeguard_number,safeguard_description,source,deleted) VALUES($1,$2,$3,'library',false)`,[devId,i+1,safeguards[i]]);
                const actions = parseJsonArray(bestRow.typical_actions); for (let i=0;i<actions.length;i++) await client2.query(`INSERT INTO hazop_actions(deviation_id,action_number,action_description,source,status) VALUES($1,$2,$3,'library','open')`,[devId,i+1,actions[i]]);
                gen++;
              }
              await client2.query(`UPDATE hazop_nodes SET deviation_count=(SELECT COUNT(*) FROM hazop_deviations WHERE node_id=$1), action_count=(SELECT COUNT(*) FROM hazop_actions a JOIN hazop_deviations d ON d.id=a.deviation_id WHERE d.node_id=$1 AND a.status='open'), generated_at=NOW(), generated_by=$2, topology_changed_after_review=false WHERE id=$1`, [nodeId, userId]);
              await client2.query('COMMIT');
              nodeResult = { node_id: nodeId, status: 200, generated: gen, skipped: sk };
              resolve();
            } catch (e: any) { await client2.query('ROLLBACK'); nodeResult = { node_id: nodeId, status: 500, error: e.message }; resolve(); }
            finally { client2.release(); }
          })();
        });
        nodeResults.push(nodeResult);
        if (nodeResult?.generated) totalGenerated += nodeResult.generated;
        if (nodeResult?.skipped) totalSkipped += nodeResult.skipped;
      }

      res.json({ success: true, study_id: studyId, nodes_processed: nodeIds.length, total_generated: totalGenerated, total_skipped: totalSkipped, node_results: nodeResults });
    } catch (err: any) { sendError(res, err); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 3B — Deviation CRUD
  // ════════════════════════════════════════════════════════════════════════════

  // ── List deviations for a node (with nested causes/consequences/safeguards/actions) ──
  app.get('/api/hazop/nodes/:nodeId/deviations', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const nodeId = parseInt(req.params.nodeId);
      if (isNaN(nodeId)) return res.status(400).json({ error: 'Invalid nodeId' });
      const nodeRes = await pool.query('SELECT id, study_id FROM hazop_nodes WHERE id=$1', [nodeId]);
      if (nodeRes.rowCount === 0) return sendNotFound(res, 'Node');

      const devsRes = await pool.query(`
        SELECT d.*,
          COALESCE((SELECT json_agg(json_build_object('id',c.id,'cause_number',c.cause_number,'cause_description',c.cause_description,'source',c.source) ORDER BY c.cause_number) FROM hazop_causes c WHERE c.deviation_id=d.id AND c.deleted=false), '[]') AS causes,
          COALESCE((SELECT json_agg(json_build_object('id',cn.id,'consequence_number',cn.consequence_number,'consequence_description',cn.consequence_description,'source',cn.source) ORDER BY cn.consequence_number) FROM hazop_consequences cn WHERE cn.deviation_id=d.id AND cn.deleted=false), '[]') AS consequences,
          COALESCE((SELECT json_agg(json_build_object('id',sg.id,'safeguard_number',sg.safeguard_number,'safeguard_description',sg.safeguard_description,'safeguard_type',sg.safeguard_type,'tag_ref',sg.tag_ref,'source',sg.source) ORDER BY sg.safeguard_number) FROM hazop_safeguards sg WHERE sg.deviation_id=d.id AND sg.deleted=false), '[]') AS safeguards,
          COALESCE((SELECT json_agg(json_build_object('id',a.id,'action_number',a.action_number,'action_description',a.action_description,'action_type',a.action_type,'status',a.status,'assigned_to',a.assigned_to,'due_date',a.due_date,'source',a.source) ORDER BY a.action_number) FROM hazop_actions a WHERE a.deviation_id=d.id), '[]') AS actions
        FROM hazop_deviations d
        WHERE d.node_id = $1
        ORDER BY d.deviation_number
      `, [nodeId]);

      res.json(devsRes.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── Patch deviation ──────────────────────────────────────────────────────────
  app.patch('/api/hazop/deviations/:deviationId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const devId = parseInt(req.params.deviationId);
      if (isNaN(devId)) return res.status(400).json({ error: 'Invalid deviationId' });
      const devRes = await pool.query(`SELECT d.*, s.status AS study_status FROM hazop_deviations d JOIN hazop_studies s ON s.id=d.study_id WHERE d.id=$1`, [devId]);
      if (devRes.rowCount === 0) return sendNotFound(res, 'Deviation');
      if (devRes.rows[0].study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

      const allowed = ['deviation_description', 'is_credible', 'reviewed', 'severity', 'likelihood', 'risk_ranking', 'comments'];
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const f of allowed) {
        if (f in req.body) { updates.push(`${f}=$${idx}`); values.push(req.body[f]); idx++; }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
      values.push(devId);
      const result = await pool.query(`UPDATE hazop_deviations SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`, values);
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── Delete deviation (manual only) ───────────────────────────────────────────
  app.delete('/api/hazop/deviations/:deviationId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const devId = parseInt(req.params.deviationId);
      if (isNaN(devId)) return res.status(400).json({ error: 'Invalid deviationId' });
      const devRes = await pool.query(`SELECT d.*, s.status AS study_status FROM hazop_deviations d JOIN hazop_studies s ON s.id=d.study_id WHERE d.id=$1`, [devId]);
      if (devRes.rowCount === 0) return sendNotFound(res, 'Deviation');
      const dev = devRes.rows[0];
      if (dev.study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });
      if (dev.reviewed) return res.status(409).json({ error: 'Reviewed deviations cannot be deleted' });

      await pool.query('DELETE FROM hazop_deviations WHERE id=$1', [devId]);
      await pool.query(`UPDATE hazop_nodes SET deviation_count=(SELECT COUNT(*) FROM hazop_deviations WHERE node_id=$1) WHERE id=$1`, [dev.node_id]);
      res.status(204).send();
    } catch (err) { sendError(res, err); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 3B — Cause / Consequence / Safeguard / Action CRUD
  // ════════════════════════════════════════════════════════════════════════════

  function makeChildCrud(
    table: string, numberCol: string, descCol: string,
    parentCol: string, parentTable: string
  ) {
    // POST — add child row
    app.post(`/api/hazop/deviations/:deviationId/${table}`, ensureAuthenticated, async (req: Request, res: Response) => {
      try {
        const devId = parseInt(req.params.deviationId);
        if (isNaN(devId)) return res.status(400).json({ error: 'Invalid deviationId' });
        const devRes = await pool.query(`SELECT d.*, s.status AS study_status FROM hazop_deviations d JOIN hazop_studies s ON s.id=d.study_id WHERE d.id=$1`, [devId]);
        if (devRes.rowCount === 0) return sendNotFound(res, 'Deviation');
        if (devRes.rows[0].study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

        const desc = req.body[descCol];
        if (!desc || typeof desc !== 'string' || !desc.trim()) return res.status(400).json({ error: `${descCol} is required` });

        const seqRes = await pool.query(`SELECT COALESCE(MAX(${numberCol}),0)+1 AS next_num FROM ${parentTable} WHERE deviation_id=$1`, [devId]);
        const seqNum = seqRes.rows[0].next_num;

        const extraCols: string[] = [];
        const extraVals: any[] = [];
        if (table === 'safeguards') {
          if (req.body.safeguard_type) { extraCols.push('safeguard_type'); extraVals.push(req.body.safeguard_type); }
          if (req.body.tag_ref) { extraCols.push('tag_ref'); extraVals.push(req.body.tag_ref); }
        }
        if (table === 'actions') {
          if (req.body.action_type) { extraCols.push('action_type'); extraVals.push(req.body.action_type); }
          if (req.body.assigned_to) { extraCols.push('assigned_to'); extraVals.push(req.body.assigned_to); }
          if (req.body.due_date) { extraCols.push('due_date'); extraVals.push(req.body.due_date); }
        }

        const hasDeleted = table !== 'actions';
        const baseSQL = hasDeleted
          ? `INSERT INTO ${parentTable} (deviation_id,${numberCol},${descCol},source,deleted${extraCols.length ? ',' + extraCols.join(',') : ''}) VALUES($1,$2,$3,'manual',false${extraVals.map((_,i)=>',$'+(4+i)).join('')}) RETURNING *`
          : `INSERT INTO ${parentTable} (deviation_id,${numberCol},${descCol},source,status${extraCols.length ? ',' + extraCols.join(',') : ''}) VALUES($1,$2,$3,'manual','open'${extraVals.map((_,i)=>',$'+(4+i)).join('')}) RETURNING *`;

        const result = await pool.query(baseSQL, [devId, seqNum, desc.trim(), ...extraVals]);
        res.status(201).json(result.rows[0]);
      } catch (err) { sendError(res, err); }
    });

    // PATCH — update child row
    app.patch(`/api/hazop/${table}/:rowId`, ensureAuthenticated, async (req: Request, res: Response) => {
      try {
        const rowId = parseInt(req.params.rowId);
        if (isNaN(rowId)) return res.status(400).json({ error: 'Invalid rowId' });
        const rowRes = await pool.query(`SELECT r.*, s.status AS study_status FROM ${parentTable} r JOIN hazop_deviations d ON d.id=r.deviation_id JOIN hazop_studies s ON s.id=d.study_id WHERE r.id=$1`, [rowId]);
        if (rowRes.rowCount === 0) return sendNotFound(res, table);
        if (rowRes.rows[0].study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

        const allowedPatch: Record<string, string[]> = {
          causes: ['cause_description'],
          consequences: ['consequence_description'],
          safeguards: ['safeguard_description', 'safeguard_type', 'tag_ref'],
          actions: ['action_description', 'action_type', 'assigned_to', 'due_date', 'status', 'close_comments', 'closed_at'],
        };
        const fields = allowedPatch[table] ?? [descCol];
        const updates: string[] = [];
        const values: any[] = [];
        let idx = 1;
        for (const f of fields) {
          if (f in req.body) { updates.push(`${f}=$${idx}`); values.push(req.body[f]); idx++; }
        }
        if (updates.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
        if (table === 'actions' && req.body.status === 'closed' && !rowRes.rows[0].closed_at) {
          updates.push(`closed_at=NOW()`);
        }
        values.push(rowId);
        const result = await pool.query(`UPDATE ${parentTable} SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`, values);
        res.json(result.rows[0]);
      } catch (err) { sendError(res, err); }
    });

    // DELETE — hard delete (manual) or soft delete (library)
    app.delete(`/api/hazop/${table}/:rowId`, ensureAuthenticated, async (req: Request, res: Response) => {
      try {
        const rowId = parseInt(req.params.rowId);
        if (isNaN(rowId)) return res.status(400).json({ error: 'Invalid rowId' });
        const rowRes = await pool.query(`SELECT r.*, s.status AS study_status FROM ${parentTable} r JOIN hazop_deviations d ON d.id=r.deviation_id JOIN hazop_studies s ON s.id=d.study_id WHERE r.id=$1`, [rowId]);
        if (rowRes.rowCount === 0) return sendNotFound(res, table);
        if (rowRes.rows[0].study_status !== 'draft') return res.status(409).json({ error: 'Study must be in draft status' });

        if (rowRes.rows[0].source === 'library' && table !== 'actions') {
          await pool.query(`UPDATE ${parentTable} SET deleted=true WHERE id=$1`, [rowId]);
        } else {
          await pool.query(`DELETE FROM ${parentTable} WHERE id=$1`, [rowId]);
        }
        res.status(204).send();
      } catch (err) { sendError(res, err); }
    });
  }

  makeChildCrud('causes', 'cause_number', 'cause_description', 'deviation_id', 'hazop_causes');
  makeChildCrud('consequences', 'consequence_number', 'consequence_description', 'deviation_id', 'hazop_consequences');
  makeChildCrud('safeguards', 'safeguard_number', 'safeguard_description', 'deviation_id', 'hazop_safeguards');
  makeChildCrud('actions', 'action_number', 'action_description', 'deviation_id', 'hazop_actions');

  // ── Action register for a study ──────────────────────────────────────────────
  app.get('/api/hazop/studies/:studyId/actions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });
      const study = await resolveStudy(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      const status = req.query.status as string | undefined;
      const filterSQL = status ? `AND a.status = '${status.replace(/'/g, "''")}'` : '';

      const result = await pool.query(`
        SELECT a.id AS action_id, a.action_number, a.action_description, a.action_type,
               a.status, a.assigned_to, a.due_date, a.close_comments, a.closed_at, a.source,
               d.id AS deviation_id, d.deviation_number, d.guideword, d.parameter,
               n.id AS node_id, n.node_reference, n.node_name,
               l.loop_number, l.loop_name,
               u.username AS assigned_to_name
        FROM hazop_actions a
        JOIN hazop_deviations d ON d.id = a.deviation_id
        JOIN hazop_nodes n ON n.id = d.node_id
        JOIN hazop_process_loops l ON l.id = n.loop_id
        LEFT JOIN users u ON u.id = a.assigned_to
        WHERE d.study_id = $1 ${filterSQL}
        ORDER BY l.loop_number, n.node_number, d.deviation_number, a.action_number
      `, [studyId]);

      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });
}
