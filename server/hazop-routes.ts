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

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 4A START — Safety Logic Modeling Layer
  // Governed by: docs/hazop-phase4-execution-plan-v1.3.md
  // Advisory lock key: study_id * 10000 + 4001
  // ════════════════════════════════════════════════════════════════════════════

  // ── Vocabularies (frozen per §12.3) ─────────────────────────────────────────
  const P4A_EVENT_TYPES = new Set([
    'process_deviation','equipment_failure','utility_failure','vacuum_failure',
    'phase_transition','thermal_runaway','overpressure','operator_error',
    'instrument_failure','power_failure',
  ]);
  const P4A_TRANSITION_TYPES = new Set([
    'evaporation','condensation','flashing','devolatilization','film_formation',
    'film_breakdown','foaming','entrainment','thermal_cracking','vacuum_break',
  ]);
  const P4A_SEVERITY = new Set(['minor','serious','major','critical','catastrophic']);
  const P4A_MODES = new Set(['startup','normal','shutdown','cleaning','maintenance','upset','emergency']);
  const P4A_PROTECTION_LAYERS = new Set(['BPCS','SIS','Mechanical','Procedural','Operator','Relief']);
  const P4A_LOGIC_TYPES = new Set(['parallel','sequential','latched','permissive','voting','manual_reset']);
  const P4A_CRITICALITY = new Set(['instant','fast','medium','slow','operator_managed']);
  const P4A_EFFECTIVENESS = new Set(['low','medium','high','verified']);
  const P4A_HUMAN_DEP = new Set(['none','low','medium','high','critical']);
  const P4A_CCF_GROUPS = new Set([
    'vacuum_system','thermal_oil','power','instrument_air',
    'cooling_water','utilities','control_system','shared_equipment',
  ]);
  const P4A_ACTION_TYPES = new Set([
    'stop','open','close','alarm','start','cooldown','isolate','de_energise','vent','other',
  ]);

  // ── Number generator (advisory-locked) ──────────────────────────────────────
  async function nextP4AGroupNumber(client: any, studyId: number, prefix: string): Promise<string> {
    await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
    const r = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(group_number FROM '\\d+$') AS INT)),0)+1 AS nxt
       FROM hazop_event_groups WHERE study_id=$1 AND group_number LIKE $2`,
      [studyId, `${prefix}-%`]
    );
    return `${prefix}-${String(r.rows[0].nxt).padStart(3, '0')}`;
  }
  async function nextRgNumber(client: any, studyId: number): Promise<string> {
    await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
    const r = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(group_number FROM '\\d+$') AS INT)),0)+1 AS nxt
       FROM hazop_response_groups WHERE study_id=$1`,
      [studyId]
    );
    return `RG-${String(r.rows[0].nxt).padStart(3, '0')}`;
  }

  // ── resolveStudyForP4 ────────────────────────────────────────────────────────
  async function resolveStudyForP4(studyId: number) {
    const r = await pool.query('SELECT id, status FROM hazop_studies WHERE id=$1', [studyId]);
    return r.rowCount === 0 ? null : r.rows[0];
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // EVENT GROUPS
  // ══════════════════════════════════════════════════════════════════════════════

  // ── List event groups ────────────────────────────────────────────────────────
  app.get('/api/hazop/studies/:studyId/event-groups', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      const { event_type, process_transition_type, consequence_severity, operating_mode, common_cause_group } = req.query;
      const conditions: string[] = ['eg.study_id = $1'];
      const params: any[] = [studyId];
      let idx = 2;
      if (event_type) { conditions.push(`eg.event_type = $${idx++}`); params.push(event_type); }
      if (process_transition_type) { conditions.push(`eg.process_transition_type = $${idx++}`); params.push(process_transition_type); }
      if (consequence_severity) { conditions.push(`eg.consequence_severity = $${idx++}`); params.push(consequence_severity); }
      if (operating_mode) { conditions.push(`eg.operating_mode = $${idx++}`); params.push(operating_mode); }
      if (common_cause_group) { conditions.push(`eg.common_cause_group = $${idx++}`); params.push(common_cause_group); }

      const result = await pool.query(`
        SELECT eg.*,
          TRIM(u.first_name || ' ' || u.last_name) AS created_by_name,
          (SELECT COUNT(*) FROM hazop_event_group_members m WHERE m.group_id = eg.id) AS member_count
        FROM hazop_event_groups eg
        LEFT JOIN users u ON u.id = eg.created_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY eg.group_number
      `, params);
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── Get single event group with members ─────────────────────────────────────
  app.get('/api/hazop/event-groups/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

      const eg = await pool.query('SELECT * FROM hazop_event_groups WHERE id=$1', [id]);
      if (eg.rowCount === 0) return sendNotFound(res, 'Event Group');

      const members = await pool.query(`
        SELECT m.id, m.deviation_id,
               d.deviation_number, d.guideword, d.parameter, d.deviation_description,
               n.node_reference, n.node_name
        FROM hazop_event_group_members m
        JOIN hazop_deviations d ON d.id = m.deviation_id
        JOIN hazop_nodes n ON n.id = d.node_id
        WHERE m.group_id = $1
        ORDER BY d.deviation_number
      `, [id]);

      res.json({ ...eg.rows[0], members: members.rows });
    } catch (err) { sendError(res, err); }
  });

  // ── Create event group ───────────────────────────────────────────────────────
  app.post('/api/hazop/studies/:studyId/event-groups', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      const {
        group_name, event_type, process_transition_type, consequence_severity,
        operating_mode, common_cause_group, description, operating_regime,
        phase_state, process_function,
      } = req.body;

      if (!group_name?.trim()) return res.status(400).json({ error: 'group_name is required' });
      if (!event_type || !P4A_EVENT_TYPES.has(event_type)) return res.status(400).json({ error: 'Invalid event_type' });
      if (process_transition_type && !P4A_TRANSITION_TYPES.has(process_transition_type)) return res.status(400).json({ error: 'Invalid process_transition_type' });
      if (consequence_severity && !P4A_SEVERITY.has(consequence_severity)) return res.status(400).json({ error: 'Invalid consequence_severity' });
      if (operating_mode && !P4A_MODES.has(operating_mode)) return res.status(400).json({ error: 'Invalid operating_mode' });
      if (common_cause_group && !P4A_CCF_GROUPS.has(common_cause_group)) return res.status(400).json({ error: 'Invalid common_cause_group' });

      const userId = (req.user as any).id;
      await client.query('BEGIN');
      const groupNumber = await nextP4AGroupNumber(client, studyId, 'EG');
      const result = await client.query(`
        INSERT INTO hazop_event_groups
          (study_id, group_number, group_name, event_type, process_transition_type,
           consequence_severity, operating_mode, common_cause_group, description,
           operating_regime, phase_state, process_function, source, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manual',$13)
        RETURNING *
      `, [
        studyId, groupNumber, group_name.trim(), event_type,
        process_transition_type ?? null, consequence_severity ?? null,
        operating_mode ?? null, common_cause_group ?? null,
        description?.trim() ?? null, operating_regime ?? null,
        phase_state ?? null, process_function?.trim() ?? null, userId,
      ]);
      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      sendError(res, err);
    } finally { client.release(); }
  });

  // ── Update event group ───────────────────────────────────────────────────────
  app.patch('/api/hazop/event-groups/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

      const eg = await pool.query('SELECT eg.id, s.status FROM hazop_event_groups eg JOIN hazop_studies s ON s.id = eg.study_id WHERE eg.id=$1', [id]);
      if (eg.rowCount === 0) return sendNotFound(res, 'Event Group');

      const allowed = ['group_name','event_type','process_transition_type','consequence_severity',
        'operating_mode','common_cause_group','description','operating_regime','phase_state','process_function'];
      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;
      for (const key of allowed) {
        const snakeKey = key;
        if (req.body[snakeKey] !== undefined) {
          updates.push(`${snakeKey} = $${idx++}`);
          params.push(req.body[snakeKey] === '' ? null : req.body[snakeKey]);
        }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
      params.push(id);
      const result = await pool.query(
        `UPDATE hazop_event_groups SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`,
        params
      );
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── Delete event group ───────────────────────────────────────────────────────
  app.delete('/api/hazop/event-groups/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const eg = await pool.query('SELECT id FROM hazop_event_groups WHERE id=$1', [id]);
      if (eg.rowCount === 0) return sendNotFound(res, 'Event Group');
      await pool.query('DELETE FROM hazop_event_groups WHERE id=$1', [id]);
      res.status(204).send();
    } catch (err) { sendError(res, err); }
  });

  // ── Add deviation member to group ────────────────────────────────────────────
  app.post('/api/hazop/event-groups/:id/members', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.params.id);
      if (isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });
      const { deviation_id } = req.body;
      if (!deviation_id) return res.status(400).json({ error: 'deviation_id is required' });

      const eg = await pool.query('SELECT id FROM hazop_event_groups WHERE id=$1', [groupId]);
      if (eg.rowCount === 0) return sendNotFound(res, 'Event Group');
      const dev = await pool.query('SELECT id FROM hazop_deviations WHERE id=$1', [deviation_id]);
      if (dev.rowCount === 0) return sendNotFound(res, 'Deviation');

      try {
        const result = await pool.query(
          'INSERT INTO hazop_event_group_members (group_id, deviation_id) VALUES ($1,$2) RETURNING *',
          [groupId, deviation_id]
        );
        res.status(201).json(result.rows[0]);
      } catch (e: any) {
        if (e.code === '23505') return res.status(409).json({ error: 'Deviation already in this group' });
        throw e;
      }
    } catch (err) { sendError(res, err); }
  });

  // ── Remove deviation member from group ───────────────────────────────────────
  app.delete('/api/hazop/event-group-members/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const r = await pool.query('SELECT id FROM hazop_event_group_members WHERE id=$1', [id]);
      if (r.rowCount === 0) return sendNotFound(res, 'Event Group Member');
      await pool.query('DELETE FROM hazop_event_group_members WHERE id=$1', [id]);
      res.status(204).send();
    } catch (err) { sendError(res, err); }
  });

  // ── Auto-extract event groups (regime-aware, 13-step pipeline steps 1–6) ─────
  app.post('/api/hazop/studies/:studyId/event-groups/extract', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);

      // Fetch all deviations with their node context
      const devs = await client.query(`
        SELECT d.id AS deviation_id, d.guideword, d.parameter, d.deviation_description,
               d.deviation_number,
               n.operating_regime, n.phase_state, n.process_function,
               n.node_reference, n.node_name, n.id AS node_id
        FROM hazop_deviations d
        JOIN hazop_nodes n ON n.id = d.node_id
        WHERE d.study_id = $1 AND d.is_credible = true
        ORDER BY n.node_reference, d.deviation_number
      `, [studyId]);

      const userId = (req.user as any).id;
      let created = 0;
      let linked = 0;
      const skipped: number[] = [];

      // Group deviations by (event_type, process_transition_type, operating_regime, phase_state)
      // to create manageable event groups
      const buckets = new Map<string, { devIds: number[]; eventType: string; transitionType: string | null;
        regime: string | null; phaseState: string | null; processFunction: string | null;
        severity: string; mode: string; ccfGroup: string | null }>();

      for (const d of devs.rows) {
        // Step 1: Event type classification
        const eventType = classifyEventType(d);
        // Step 2: Process transition inference
        const transitionType = inferTransitionType(d, eventType);
        // Step 3: CCF group auto-assignment
        const ccfGroup = inferCcfGroup(d, eventType);
        // Step 4: Operating mode inference
        const mode = inferOperatingMode(d);
        // Step 5: Consequence severity inference
        const severity = inferSeverity(d, eventType, transitionType);

        const key = `${eventType}|${transitionType ?? ''}|${d.operating_regime}|${d.phase_state}`;
        if (!buckets.has(key)) {
          buckets.set(key, {
            devIds: [], eventType, transitionType, regime: d.operating_regime,
            phaseState: d.phase_state, processFunction: d.process_function,
            severity, mode, ccfGroup,
          });
        }
        buckets.get(key)!.devIds.push(d.deviation_id);
      }

      // Step 6: Create event groups and members (idempotent — skip existing members)
      for (const [, bucket] of buckets) {
        if (bucket.devIds.length === 0) continue;

        const groupNumber = await nextP4AGroupNumber(client, studyId, 'EG');
        const label = buildGroupLabel(bucket.eventType, bucket.transitionType, bucket.regime, bucket.phaseState);

        const egRes = await client.query(`
          INSERT INTO hazop_event_groups
            (study_id, group_number, group_name, event_type, process_transition_type,
             consequence_severity, operating_mode, common_cause_group, operating_regime,
             phase_state, process_function, source, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'auto_extracted',$12)
          ON CONFLICT (study_id, group_number) DO NOTHING
          RETURNING id
        `, [
          studyId, groupNumber, label, bucket.eventType, bucket.transitionType,
          bucket.severity, bucket.mode, bucket.ccfGroup,
          bucket.regime, bucket.phaseState, bucket.processFunction, userId,
        ]);

        const groupId = egRes.rows[0]?.id;
        if (!groupId) continue;
        created++;

        for (const devId of bucket.devIds) {
          try {
            await client.query(
              'INSERT INTO hazop_event_group_members (group_id, deviation_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [groupId, devId]
            );
            linked++;
          } catch { skipped.push(devId); }
        }
      }

      await client.query('COMMIT');
      res.json({ created_groups: created, linked_members: linked, skipped_count: skipped.length });
    } catch (err) {
      await client.query('ROLLBACK');
      sendError(res, err);
    } finally { client.release(); }
  });

  // ── Event type classification (Step 1) ──────────────────────────────────────
  function classifyEventType(d: { guideword: string; parameter: string; operating_regime: string; phase_state: string; process_function: string | null; deviation_description: string }): string {
    const gw = d.guideword?.toLowerCase() ?? '';
    const param = d.parameter?.toLowerCase() ?? '';
    const regime = d.operating_regime ?? '';
    const phase = d.phase_state ?? '';
    const fn = (d.process_function ?? '').toLowerCase();
    const desc = (d.deviation_description ?? '').toLowerCase();

    if (regime === 'vacuum' && (param === 'pressure' || desc.includes('vacuum'))) return 'vacuum_failure';
    if (fn.includes('twfe') && gw === 'no' && param === 'flow') return 'vacuum_failure';
    if (fn.includes('twfe') && param === 'temperature' && gw === 'more') return 'thermal_runaway';
    if (phase === 'vapor' && param === 'temperature' && gw === 'more') return 'thermal_runaway';
    if (phase === 'vapor' && param === 'pressure' && gw === 'more') return 'overpressure';
    if (fn.includes('flash') && param === 'pressure' && gw === 'more') return 'overpressure';
    if (phase === 'two_phase' && (param === 'composition' || param === 'level')) return 'phase_transition';
    if (param === 'utility' || desc.includes('utility')) return 'utility_failure';
    if (param === 'power' || desc.includes('power failure')) return 'power_failure';
    if (desc.includes('instrument') || param === 'instrument') return 'instrument_failure';
    if (desc.includes('operator') || desc.includes('human error')) return 'operator_error';
    if (gw === 'more' && param === 'pressure') return 'overpressure';
    if (desc.includes('equipment failure') || desc.includes('mechanical failure')) return 'equipment_failure';
    return 'process_deviation';
  }

  // ── Process transition inference (Step 2) ───────────────────────────────────
  function inferTransitionType(d: { guideword: string; parameter: string; operating_regime: string; phase_state: string; process_function: string | null }, eventType: string): string | null {
    const regime = d.operating_regime ?? '';
    const phase = d.phase_state ?? '';
    const fn = (d.process_function ?? '').toLowerCase();
    const gw = d.guideword?.toLowerCase() ?? '';
    const param = d.parameter?.toLowerCase() ?? '';

    if (eventType === 'vacuum_failure') {
      if (phase === 'two_phase') return 'entrainment';
      return 'vacuum_break';
    }
    if (eventType === 'thermal_runaway') return 'thermal_cracking';
    if (eventType === 'overpressure') {
      if (fn.includes('flash') || fn.includes('degas')) return 'flashing';
      return 'devolatilization';
    }
    if (eventType === 'phase_transition') {
      if (param === 'level') return 'foaming';
      return 'entrainment';
    }
    if (eventType === 'utility_failure' && (fn.includes('cool') || param === 'temperature')) return 'condensation';
    if (fn.includes('twfe') && gw === 'more' && param === 'temperature') {
      return regime === 'vacuum' ? 'film_breakdown' : 'film_formation';
    }
    if (phase === 'vapor') return 'devolatilization';
    if (phase === 'liquid') return 'evaporation';
    return null;
  }

  // ── CCF group auto-assignment (Step 3) ──────────────────────────────────────
  function inferCcfGroup(d: { process_function: string | null; deviation_description: string }, eventType: string): string | null {
    const fn = (d.process_function ?? '').toLowerCase();
    const desc = (d.deviation_description ?? '').toLowerCase();
    if (eventType === 'power_failure') return 'power';
    if (eventType === 'vacuum_failure' || fn.includes('vacuum')) return 'vacuum_system';
    if (eventType === 'utility_failure' && (fn.includes('cool') || desc.includes('cooling'))) return 'cooling_water';
    if (eventType === 'instrument_failure' && desc.includes('instrument air')) return 'instrument_air';
    if (eventType === 'utility_failure') return 'utilities';
    if (desc.includes('dcs') || desc.includes('plc') || desc.includes('control system')) return 'control_system';
    if (fn.includes('thermal oil') || fn.includes('heater')) return 'thermal_oil';
    return null;
  }

  // ── Operating mode inference (Step 4) ───────────────────────────────────────
  function inferOperatingMode(d: { deviation_description: string; process_function: string | null }): string {
    const text = ((d.deviation_description ?? '') + ' ' + (d.process_function ?? '')).toLowerCase();
    if (text.includes('startup') || text.includes('commission')) return 'startup';
    if (text.includes('cleaning') || text.includes('cip')) return 'cleaning';
    if (text.includes('maintenance') || text.includes('isolation')) return 'maintenance';
    if (text.includes('shutdown') || text.includes('depressure') || text.includes('drain')) return 'shutdown';
    return 'normal';
  }

  // ── Consequence severity inference (Step 5) ──────────────────────────────────
  function inferSeverity(d: { operating_regime: string; phase_state: string }, eventType: string, transitionType: string | null): string {
    if (eventType === 'vacuum_failure' && transitionType === 'vacuum_break') return 'catastrophic';
    if (eventType === 'thermal_runaway') return 'catastrophic';
    if (eventType === 'power_failure' && transitionType === 'vacuum_break') return 'catastrophic';
    if (eventType === 'overpressure') return 'critical';
    if (eventType === 'equipment_failure' && transitionType === 'film_breakdown') return 'critical';
    if (eventType === 'phase_transition') return 'major';
    if (eventType === 'utility_failure') return 'serious';
    if (eventType === 'instrument_failure') return 'serious';
    if (eventType === 'operator_error') return 'serious';
    return 'minor';
  }

  // ── Build group name label ───────────────────────────────────────────────────
  function buildGroupLabel(eventType: string, transitionType: string | null, regime: string | null, phase: string | null): string {
    const typeLabel: Record<string, string> = {
      vacuum_failure: 'Vacuum Failure', thermal_runaway: 'Thermal Runaway',
      overpressure: 'Overpressure', phase_transition: 'Phase Transition',
      power_failure: 'Power Failure', utility_failure: 'Utility Failure',
      equipment_failure: 'Equipment Failure', instrument_failure: 'Instrument Failure',
      operator_error: 'Operator Error', process_deviation: 'Process Deviation',
    };
    const transLabel: Record<string, string> = {
      vacuum_break: 'Vacuum Break', film_breakdown: 'Film Breakdown',
      thermal_cracking: 'Thermal Cracking', foaming: 'Foaming',
      entrainment: 'Entrainment', flashing: 'Flashing',
      devolatilization: 'Devolatilization', film_formation: 'Film Formation',
      condensation: 'Condensation', evaporation: 'Evaporation',
    };
    let label = typeLabel[eventType] ?? eventType;
    if (transitionType && transLabel[transitionType]) label += ` — ${transLabel[transitionType]}`;
    if (regime === 'vacuum') label += ' (Vacuum)';
    else if (phase === 'two_phase') label += ' (2-Phase)';
    else if (phase === 'vapor') label += ' (Vapor)';
    return label;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RESPONSE GROUPS
  // ══════════════════════════════════════════════════════════════════════════════

  // ── List response groups ─────────────────────────────────────────────────────
  app.get('/api/hazop/studies/:studyId/response-groups', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      const conditions: string[] = ['rg.study_id = $1'];
      const params: any[] = [studyId];
      let idx = 2;
      const filterFields = ['protection_layer','logic_type','criticality_class','effectiveness_rating','human_dependency_level','operating_mode'];
      for (const f of filterFields) {
        if (req.query[f]) { conditions.push(`rg.${f} = $${idx++}`); params.push(req.query[f]); }
      }

      const result = await pool.query(`
        SELECT rg.*,
          TRIM(u.first_name || ' ' || u.last_name) AS created_by_name,
          (SELECT COUNT(*) FROM hazop_response_group_actions a WHERE a.response_group_id = rg.id) AS action_count
        FROM hazop_response_groups rg
        LEFT JOIN users u ON u.id = rg.created_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY rg.group_number
      `, params);
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── Get single response group with actions ───────────────────────────────────
  app.get('/api/hazop/response-groups/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const rg = await pool.query('SELECT * FROM hazop_response_groups WHERE id=$1', [id]);
      if (rg.rowCount === 0) return sendNotFound(res, 'Response Group');
      const actions = await pool.query(
        'SELECT * FROM hazop_response_group_actions WHERE response_group_id=$1 ORDER BY sequence_no',
        [id]
      );
      res.json({ ...rg.rows[0], actions: actions.rows });
    } catch (err) { sendError(res, err); }
  });

  // ── Create response group ────────────────────────────────────────────────────
  app.post('/api/hazop/studies/:studyId/response-groups', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      const {
        group_name, protection_layer, logic_type, criticality_class,
        effectiveness_rating, human_dependency_level, operating_mode,
        is_independent_protection_layer, common_cause_group, description,
      } = req.body;

      if (!group_name?.trim()) return res.status(400).json({ error: 'group_name is required' });
      if (!protection_layer || !P4A_PROTECTION_LAYERS.has(protection_layer)) return res.status(400).json({ error: 'Invalid protection_layer' });
      if (logic_type && !P4A_LOGIC_TYPES.has(logic_type)) return res.status(400).json({ error: 'Invalid logic_type' });
      if (criticality_class && !P4A_CRITICALITY.has(criticality_class)) return res.status(400).json({ error: 'Invalid criticality_class' });
      if (effectiveness_rating && !P4A_EFFECTIVENESS.has(effectiveness_rating)) return res.status(400).json({ error: 'Invalid effectiveness_rating' });
      if (human_dependency_level && !P4A_HUMAN_DEP.has(human_dependency_level)) return res.status(400).json({ error: 'Invalid human_dependency_level' });
      if (operating_mode && !P4A_MODES.has(operating_mode)) return res.status(400).json({ error: 'Invalid operating_mode' });
      if (common_cause_group && !P4A_CCF_GROUPS.has(common_cause_group)) return res.status(400).json({ error: 'Invalid common_cause_group' });

      const userId = (req.user as any).id;
      await client.query('BEGIN');
      const groupNumber = await nextRgNumber(client, studyId);

      const result = await client.query(`
        INSERT INTO hazop_response_groups
          (study_id, group_number, group_name, protection_layer, logic_type, criticality_class,
           effectiveness_rating, human_dependency_level, operating_mode,
           is_independent_protection_layer, common_cause_group, description, source, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manual',$13)
        RETURNING *
      `, [
        studyId, groupNumber, group_name.trim(), protection_layer,
        logic_type ?? null, criticality_class ?? null, effectiveness_rating ?? null,
        human_dependency_level ?? null, operating_mode ?? null,
        is_independent_protection_layer === true || is_independent_protection_layer === 'true',
        common_cause_group ?? null, description?.trim() ?? null, userId,
      ]);
      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      sendError(res, err);
    } finally { client.release(); }
  });

  // ── Update response group ────────────────────────────────────────────────────
  app.patch('/api/hazop/response-groups/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const rg = await pool.query('SELECT id FROM hazop_response_groups WHERE id=$1', [id]);
      if (rg.rowCount === 0) return sendNotFound(res, 'Response Group');

      const allowed = ['group_name','protection_layer','logic_type','criticality_class',
        'effectiveness_rating','human_dependency_level','operating_mode',
        'is_independent_protection_layer','common_cause_group','description'];
      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          updates.push(`${key} = $${idx++}`);
          params.push(req.body[key] === '' ? null : req.body[key]);
        }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
      params.push(id);
      const result = await pool.query(
        `UPDATE hazop_response_groups SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`,
        params
      );
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── Delete response group ────────────────────────────────────────────────────
  app.delete('/api/hazop/response-groups/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const rg = await pool.query('SELECT id FROM hazop_response_groups WHERE id=$1', [id]);
      if (rg.rowCount === 0) return sendNotFound(res, 'Response Group');
      await pool.query('DELETE FROM hazop_response_groups WHERE id=$1', [id]);
      res.status(204).send();
    } catch (err) { sendError(res, err); }
  });

  // ── Add action to response group ─────────────────────────────────────────────
  app.post('/api/hazop/response-groups/:id/actions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.params.id);
      if (isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });
      const rg = await pool.query('SELECT id FROM hazop_response_groups WHERE id=$1', [groupId]);
      if (rg.rowCount === 0) return sendNotFound(res, 'Response Group');

      const { action_description, action_type, tag_ref, source_safeguard_id, source_action_id } = req.body;
      if (!action_description?.trim()) return res.status(400).json({ error: 'action_description is required' });
      if (action_type && !P4A_ACTION_TYPES.has(action_type)) return res.status(400).json({ error: 'Invalid action_type' });

      const seqRes = await pool.query(
        'SELECT COALESCE(MAX(sequence_no),0)+1 AS next_seq FROM hazop_response_group_actions WHERE response_group_id=$1',
        [groupId]
      );
      const seqNo = seqRes.rows[0].next_seq;

      const result = await pool.query(`
        INSERT INTO hazop_response_group_actions
          (response_group_id, sequence_no, action_description, action_type, tag_ref,
           source_safeguard_id, source_action_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *
      `, [groupId, seqNo, action_description.trim(), action_type ?? null,
          tag_ref?.trim() ?? null, source_safeguard_id ?? null, source_action_id ?? null]);
      res.status(201).json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── Update response group action ─────────────────────────────────────────────
  app.patch('/api/hazop/response-group-actions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const a = await pool.query('SELECT id FROM hazop_response_group_actions WHERE id=$1', [id]);
      if (a.rowCount === 0) return sendNotFound(res, 'Response Group Action');

      // confidence_score is NOT accepted from client (engine-only)
      const allowed = ['action_description','action_type','tag_ref','sequence_no','source_safeguard_id','source_action_id'];
      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          updates.push(`${key} = $${idx++}`);
          params.push(req.body[key] === '' ? null : req.body[key]);
        }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
      params.push(id);
      try {
        const result = await pool.query(
          `UPDATE hazop_response_group_actions SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`,
          params
        );
        res.json(result.rows[0]);
      } catch (e: any) {
        if (e.code === '23505') return res.status(409).json({ error: 'Sequence number already in use for this group' });
        throw e;
      }
    } catch (err) { sendError(res, err); }
  });

  // ── Delete response group action ─────────────────────────────────────────────
  app.delete('/api/hazop/response-group-actions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const a = await pool.query('SELECT id FROM hazop_response_group_actions WHERE id=$1', [id]);
      if (a.rowCount === 0) return sendNotFound(res, 'Response Group Action');
      await pool.query('DELETE FROM hazop_response_group_actions WHERE id=$1', [id]);
      res.status(204).send();
    } catch (err) { sendError(res, err); }
  });

  // ── Auto-extract response groups from safeguards (Steps 7–12) ────────────────
  app.post('/api/hazop/studies/:studyId/response-groups/extract', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);

      const userId = (req.user as any).id;

      // Step 7: Fetch safeguards with node context
      const safeguards = await client.query(`
        SELECT s.id AS safeguard_id, s.safeguard_description, s.safeguard_type, s.tag_ref,
               d.id AS deviation_id, d.guideword, d.parameter,
               n.operating_regime, n.phase_state, n.process_function
        FROM hazop_safeguards s
        JOIN hazop_deviations d ON d.id = s.deviation_id
        JOIN hazop_nodes n ON n.id = d.node_id
        WHERE d.study_id = $1 AND s.deleted = false
        ORDER BY s.safeguard_type, s.tag_ref, s.id
      `, [studyId]);

      // Step 7 (cont): Classify protection layer from safeguard_type
      // Steps 8–11: Group by (protection_layer, tag_ref prefix, operating_mode context)
      const rgBuckets = new Map<string, {
        safeguardIds: number[]; protectionLayer: string; logicType: string;
        criticalityClass: string; effectivenessRating: string; humanDepLevel: string;
        name: string; operatingMode: string;
      }>();

      for (const s of safeguards.rows) {
        const pl = classifyProtectionLayer(s.safeguard_type);
        const mode = inferOperatingMode({ deviation_description: s.safeguard_description, process_function: s.process_function });
        const key = `${pl}|${s.tag_ref ?? 'no-tag'}|${mode}`;
        const name = buildRgName(pl, s.tag_ref, s.safeguard_description);

        if (!rgBuckets.has(key)) {
          rgBuckets.set(key, {
            safeguardIds: [], protectionLayer: pl,
            logicType: pl === 'SIS' ? 'latched' : 'parallel',
            criticalityClass: deriveCriticality(pl, s),
            effectivenessRating: deriveEffectiveness(pl, null),
            humanDepLevel: deriveHumanDep(pl),
            name, operatingMode: mode,
          });
        }
        rgBuckets.get(key)!.safeguardIds.push(s.safeguard_id);
      }

      let createdGroups = 0;
      let createdActions = 0;

      for (const [, bucket] of rgBuckets) {
        if (bucket.safeguardIds.length === 0) continue;

        const groupNumber = await nextRgNumber(client, studyId);
        const isIPL = bucket.protectionLayer === 'SIS' || bucket.protectionLayer === 'Mechanical' || bucket.protectionLayer === 'Relief';

        const rgRes = await client.query(`
          INSERT INTO hazop_response_groups
            (study_id, group_number, group_name, protection_layer, logic_type, criticality_class,
             effectiveness_rating, human_dependency_level, operating_mode,
             is_independent_protection_layer, source, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'auto_extracted',$11)
          ON CONFLICT (study_id, group_number) DO NOTHING
          RETURNING id
        `, [
          studyId, groupNumber, bucket.name, bucket.protectionLayer, bucket.logicType,
          bucket.criticalityClass, bucket.effectivenessRating, bucket.humanDepLevel,
          bucket.operatingMode, isIPL, userId,
        ]);

        const rgId = rgRes.rows[0]?.id;
        if (!rgId) continue;
        createdGroups++;

        // Step 12: Create actions from safeguards
        let seqNo = 1;
        for (const sfId of bucket.safeguardIds) {
          const sfRow = safeguards.rows.find(r => r.safeguard_id === sfId);
          if (!sfRow) continue;

          const actionType = deriveActionType(sfRow.safeguard_type, sfRow.safeguard_description);
          // Step 13: Confidence score
          const confidenceScore = computeConfidenceScore(sfRow);

          try {
            await client.query(`
              INSERT INTO hazop_response_group_actions
                (response_group_id, sequence_no, action_description, action_type, tag_ref,
                 confidence_score, source_safeguard_id)
              VALUES ($1,$2,$3,$4,$5,$6,$7)
              ON CONFLICT (response_group_id, sequence_no) DO NOTHING
            `, [rgId, seqNo, sfRow.safeguard_description, actionType, sfRow.tag_ref ?? null, confidenceScore, sfId]);
            seqNo++;
            createdActions++;
          } catch { /* skip duplicates */ }
        }
      }

      await client.query('COMMIT');
      res.json({ created_groups: createdGroups, created_actions: createdActions });
    } catch (err) {
      await client.query('ROLLBACK');
      sendError(res, err);
    } finally { client.release(); }
  });

  // ── Protection layer classification (Step 7) ─────────────────────────────────
  function classifyProtectionLayer(safeguardType: string | null): string {
    if (!safeguardType) return 'Operator';
    const t = safeguardType.toLowerCase();
    if (t === 'alarm') return 'BPCS';
    if (t === 'trip' || t === 'shutdown' || t === 'sis') return 'SIS';
    if (t === 'interlock') return 'BPCS';
    if (t === 'relief_device' || t === 'relief') return 'Mechanical';
    if (t === 'procedure' || t === 'procedural') return 'Procedural';
    if (t === 'design' || t === 'mechanical') return 'Mechanical';
    return 'Operator';
  }

  function deriveCriticality(pl: string, s: any): string {
    if (pl === 'SIS') return 'instant';
    if (pl === 'Mechanical' || pl === 'Relief') return 'instant';
    if (pl === 'BPCS') return 'fast';
    if (pl === 'Procedural') return 'medium';
    return 'slow';
  }

  function deriveEffectiveness(pl: string, confidenceScore: number | null): string {
    if (pl === 'Relief') return 'verified';
    if (pl === 'Mechanical') return 'high';
    if (pl === 'SIS') return confidenceScore !== null && confidenceScore >= 75 ? 'high' : 'medium';
    if (pl === 'BPCS') return confidenceScore !== null && confidenceScore >= 75 ? 'medium' : 'low';
    return 'low';
  }

  function deriveHumanDep(pl: string): string {
    if (pl === 'SIS' || pl === 'Mechanical' || pl === 'Relief') return 'none';
    if (pl === 'BPCS') return 'low';
    return 'high';
  }

  function deriveActionType(safeguardType: string | null, description: string): string {
    const t = (safeguardType ?? '').toLowerCase();
    const d = (description ?? '').toLowerCase();
    if (t === 'alarm') return 'alarm';
    if (t === 'trip' || t === 'shutdown' || t === 'sis') return 'stop';
    if (d.includes('open') || d.includes('n2') || d.includes('nitrogen')) return 'open';
    if (d.includes('close') || d.includes('isolat')) return 'close';
    if (d.includes('cool')) return 'cooldown';
    if (d.includes('vent')) return 'vent';
    if (d.includes('de-energ') || d.includes('deenerg') || d.includes('heater')) return 'de_energise';
    return 'other';
  }

  function computeConfidenceScore(s: any): number {
    let score = 0;
    if (s.safeguard_id) score += 40;           // source_safeguard linked
    if (s.safeguard_type) score += 20;         // protection layer unambiguous
    if (s.tag_ref) score += 15;                // tag_ref populated
    const actionType = deriveActionType(s.safeguard_type, s.safeguard_description);
    if (actionType !== 'other') score += 10;   // action_type classified
    if (s.safeguard_type) score += 10;         // safeguard_type was populated
    // operating_regime exact match — +5 if vacuum regime clearly set
    if (s.operating_regime && s.operating_regime !== 'atmospheric') score += 5;
    return Math.min(score, 100);
  }

  function buildRgName(pl: string, tagRef: string | null, description: string): string {
    if (tagRef) return `${pl} — ${tagRef}`;
    const desc = (description ?? '').substring(0, 50).trim();
    return `${pl} — ${desc || 'Protective Response'}`;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 4A SUMMARY
  // ══════════════════════════════════════════════════════════════════════════════

  app.get('/api/hazop/studies/:studyId/phase4-summary', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      if (isNaN(studyId)) return res.status(400).json({ error: 'Invalid studyId' });
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      const [egCount, egmCount, rgCount, rgaCount, confDist] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM hazop_event_groups WHERE study_id=$1', [studyId]),
        pool.query(`SELECT COUNT(*) FROM hazop_event_group_members m
                    JOIN hazop_event_groups eg ON eg.id = m.group_id WHERE eg.study_id=$1`, [studyId]),
        pool.query('SELECT COUNT(*) FROM hazop_response_groups WHERE study_id=$1', [studyId]),
        pool.query(`SELECT COUNT(*) FROM hazop_response_group_actions a
                    JOIN hazop_response_groups rg ON rg.id = a.response_group_id WHERE rg.study_id=$1`, [studyId]),
        pool.query(`SELECT
            SUM(CASE WHEN a.confidence_score < 50 THEN 1 ELSE 0 END) AS low,
            SUM(CASE WHEN a.confidence_score BETWEEN 50 AND 74 THEN 1 ELSE 0 END) AS medium,
            SUM(CASE WHEN a.confidence_score BETWEEN 75 AND 89 THEN 1 ELSE 0 END) AS high,
            SUM(CASE WHEN a.confidence_score >= 90 THEN 1 ELSE 0 END) AS verified,
            SUM(CASE WHEN a.confidence_score IS NULL THEN 1 ELSE 0 END) AS manual
          FROM hazop_response_group_actions a
          JOIN hazop_response_groups rg ON rg.id = a.response_group_id WHERE rg.study_id=$1`, [studyId]),
      ]);

      const bpcsSis = await pool.query(`
        SELECT protection_layer, COUNT(*) FROM hazop_response_groups WHERE study_id=$1 GROUP BY protection_layer
      `, [studyId]);

      const severityBreakdown = await pool.query(`
        SELECT consequence_severity, COUNT(*) FROM hazop_event_groups WHERE study_id=$1 AND consequence_severity IS NOT NULL GROUP BY consequence_severity
      `, [studyId]);

      res.json({
        event_group_count: parseInt(egCount.rows[0].count),
        member_count: parseInt(egmCount.rows[0].count),
        response_group_count: parseInt(rgCount.rows[0].count),
        response_group_action_count: parseInt(rgaCount.rows[0].count),
        protection_layer_breakdown: Object.fromEntries(bpcsSis.rows.map(r => [r.protection_layer, parseInt(r.count)])),
        severity_breakdown: Object.fromEntries(severityBreakdown.rows.map(r => [r.consequence_severity, parseInt(r.count)])),
        confidence_distribution: confDist.rows[0],
      });
    } catch (err) { sendError(res, err); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 4A END
  // ════════════════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 4B START — Engineering Safety Artefacts
  // Advisory lock key: study_id * 10000 + 4001  (shared with Phase 4A)
  // Governed by: docs/hazop-phase4-execution-plan-v1.3.md
  // ════════════════════════════════════════════════════════════════════════════

  // ── Shared helper: allocate next BL-{nnn} baseline revision ────────────────
  async function nextBaselineRevision(client: any, studyId: number): Promise<string> {
    await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
    const r = await client.query(`
      SELECT COALESCE(MAX(CAST(SUBSTRING(baseline_revision FROM '\\d+$') AS INT)), 0) + 1 AS nxt
      FROM (
        SELECT baseline_revision FROM hazop_ce_matrices      WHERE study_id = $1 AND baseline_revision IS NOT NULL
        UNION ALL
        SELECT baseline_revision FROM hazop_safety_functions WHERE study_id = $1 AND baseline_revision IS NOT NULL
        UNION ALL
        SELECT baseline_revision FROM hazop_interlocks        WHERE study_id = $1 AND baseline_revision IS NOT NULL
        UNION ALL
        SELECT baseline_revision FROM hazop_alarm_trips       WHERE study_id = $1 AND baseline_revision IS NOT NULL
        UNION ALL
        SELECT baseline_revision FROM hazop_scenarios         WHERE study_id = $1 AND baseline_revision IS NOT NULL
      ) t
    `, [studyId]);
    return `BL-${String(r.rows[0].nxt).padStart(3, '0')}`;
  }

  // ── Scenario consequence description from event group ─────────────────────
  function buildScenarioConsequenceDescription(eg: any): string {
    const trans: Record<string,string> = {
      vacuum_break: 'vacuum break and atmospheric air ingress',
      film_breakdown: 'film formation failure and dry running',
      thermal_cracking: 'thermal decomposition of product',
      foaming: 'foam carry-over to condenser and vacuum pump',
      entrainment: 'liquid entrainment into vapour stream',
      flashing: 'uncontrolled flash vaporisation',
      devolatilization: 'excess devolatilisation and product loss',
      condensation: 'incomplete condensation and vapour breakthrough',
    };
    const transDesc = eg.process_transition_type ? ` resulting in ${trans[eg.process_transition_type] ?? eg.process_transition_type}` : '';
    return `${eg.group_name}${transDesc}. Operating regime: ${eg.operating_regime ?? 'unknown'}, Phase: ${eg.phase_state ?? 'unknown'}.`;
  }

  function inferResidualRisk(severity: string, ipl_count: number): string {
    if (severity === 'catastrophic' && ipl_count < 2) return 'intolerable';
    if (severity === 'catastrophic') return 'unacceptable';
    if (severity === 'critical' && ipl_count < 2) return 'unacceptable';
    if (severity === 'critical') return 'tolerable';
    if (severity === 'major') return 'tolerable';
    return 'negligible';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4B-01: SCENARIOS
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/hazop/studies/:studyId/scenarios
  app.get('/api/hazop/studies/:studyId/scenarios', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const { consequence_severity, operating_mode, residual_risk } = req.query as any;
      let q = `SELECT s.*, eg.group_number AS eg_number, eg.group_name AS eg_name,
                 eg.event_type, eg.process_transition_type, eg.operating_regime, eg.common_cause_group
               FROM hazop_scenarios s
               LEFT JOIN hazop_event_groups eg ON eg.id = s.initiating_event_group_id
               WHERE s.study_id = $1`;
      const params: any[] = [studyId];
      if (consequence_severity) { params.push(consequence_severity); q += ` AND s.consequence_severity = $${params.length}`; }
      if (operating_mode)       { params.push(operating_mode);       q += ` AND s.operating_mode = $${params.length}`; }
      if (residual_risk)        { params.push(residual_risk);        q += ` AND s.residual_risk = $${params.length}`; }
      q += ' ORDER BY s.scenario_number';
      const r = await pool.query(q, params);
      res.json(r.rows);
    } catch (err) { sendError(res, err); }
  });

  // GET /api/hazop/scenarios/:id
  app.get('/api/hazop/scenarios/:id', ensureAuthenticated, async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT s.*, eg.group_number AS eg_number, eg.group_name AS eg_name,
               eg.event_type, eg.process_transition_type, eg.operating_regime, eg.common_cause_group,
               eg.consequence_severity AS eg_severity, eg.operating_mode AS eg_mode
        FROM hazop_scenarios s
        LEFT JOIN hazop_event_groups eg ON eg.id = s.initiating_event_group_id
        WHERE s.id = $1`, [req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'Scenario');
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // POST /api/hazop/studies/:studyId/scenarios
  app.post('/api/hazop/studies/:studyId/scenarios', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      const { title, initiating_event_group_id, consequence_description, consequence_severity,
              operating_mode, human_dependency_level, residual_risk, notes } = req.body;
      if (!title || !consequence_description || !consequence_severity)
        return res.status(400).json({ message: 'title, consequence_description, consequence_severity required' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
        const nxt = await client.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(scenario_number FROM '\\d+$') AS INT)),0)+1 AS n FROM hazop_scenarios WHERE study_id=$1`, [studyId]);
        const num = `SC-${String(nxt.rows[0].n).padStart(3,'0')}`;
        const r = await client.query(`
          INSERT INTO hazop_scenarios (study_id, scenario_number, title, initiating_event_group_id,
            consequence_description, consequence_severity, operating_mode, human_dependency_level,
            residual_risk, notes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [studyId, num, title, initiating_event_group_id ?? null, consequence_description,
           consequence_severity, operating_mode ?? null, human_dependency_level ?? null,
           residual_risk ?? null, notes ?? null, (req.user as any).id]);
        await client.query('COMMIT');
        res.status(201).json(r.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // PATCH /api/hazop/scenarios/:id
  app.patch('/api/hazop/scenarios/:id', ensureAuthenticated, async (req, res) => {
    try {
      const { title, initiating_event_group_id, consequence_description, consequence_severity,
              operating_mode, human_dependency_level, residual_risk, notes } = req.body;
      const fields: string[] = []; const vals: any[] = [];
      const add = (col: string, v: any) => { if (v !== undefined) { vals.push(v); fields.push(`${col}=$${vals.length}`); } };
      add('title', title); add('initiating_event_group_id', initiating_event_group_id);
      add('consequence_description', consequence_description); add('consequence_severity', consequence_severity);
      add('operating_mode', operating_mode); add('human_dependency_level', human_dependency_level);
      add('residual_risk', residual_risk); add('notes', notes);
      if (!fields.length) return res.status(400).json({ message: 'Nothing to update' });
      vals.push(req.params.id);
      const r = await pool.query(`UPDATE hazop_scenarios SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
      if (!r.rows[0]) return sendNotFound(res, 'Scenario');
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // DELETE /api/hazop/scenarios/:id
  app.delete('/api/hazop/scenarios/:id', ensureAuthenticated, async (req, res) => {
    try {
      const r = await pool.query('SELECT baseline_revision FROM hazop_scenarios WHERE id=$1', [req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'Scenario');
      if (r.rows[0].baseline_revision)
        return res.status(409).json({ message: 'Cannot delete a baselined safety record' });
      await pool.query('DELETE FROM hazop_scenarios WHERE id=$1', [req.params.id]);
      res.json({ message: 'Deleted' });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/hazop/scenarios/:id/set-baseline
  app.post('/api/hazop/scenarios/:id/set-baseline', ensureAuthenticated, async (req, res) => {
    try {
      const sc = await pool.query('SELECT * FROM hazop_scenarios WHERE id=$1', [req.params.id]);
      if (!sc.rows[0]) return sendNotFound(res, 'Scenario');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const bl = await nextBaselineRevision(client, sc.rows[0].study_id);
        const r = await client.query(
          'UPDATE hazop_scenarios SET baseline_revision=$1 WHERE id=$2 RETURNING *', [bl, req.params.id]);
        await client.query('COMMIT');
        res.json(r.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // POST /api/hazop/studies/:studyId/scenarios/generate-from-event-groups  (idempotent)
  app.post('/api/hazop/studies/:studyId/scenarios/generate-from-event-groups', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      const egs = await pool.query(`
        SELECT eg.*, COUNT(rg.id) AS ipl_count
        FROM hazop_event_groups eg
        LEFT JOIN hazop_response_groups rg ON rg.study_id = eg.study_id
          AND rg.is_independent_protection_layer = true
          AND rg.operating_mode = eg.operating_mode
        WHERE eg.study_id = $1
        GROUP BY eg.id ORDER BY eg.group_number`, [studyId]);
      const client = await pool.connect();
      let created = 0; let skipped = 0;
      try {
        await client.query('BEGIN');
        for (const eg of egs.rows) {
          const exists = await client.query(
            'SELECT id FROM hazop_scenarios WHERE study_id=$1 AND initiating_event_group_id=$2', [studyId, eg.id]);
          if (exists.rows.length) { skipped++; continue; }
          await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
          const nxt = await client.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(scenario_number FROM '\\d+$') AS INT)),0)+1 AS n FROM hazop_scenarios WHERE study_id=$1`, [studyId]);
          const num = `SC-${String(nxt.rows[0].n).padStart(3,'0')}`;
          const severity = eg.consequence_severity ?? 'major';
          const ipl_count = parseInt(eg.ipl_count ?? '0');
          const residual = inferResidualRisk(severity, ipl_count);
          await client.query(`
            INSERT INTO hazop_scenarios (study_id, scenario_number, title, initiating_event_group_id,
              consequence_description, consequence_severity, operating_mode, residual_risk, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [studyId, num, eg.group_name, eg.id,
             buildScenarioConsequenceDescription(eg),
             severity, eg.operating_mode ?? 'normal', residual, (req.user as any).id]);
          created++;
        }
        await client.query('COMMIT');
        res.status(201).json({ created, skipped, total_event_groups: egs.rows.length });
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4B-02: C&E MATRICES
  // ══════════════════════════════════════════════════════════════════════════

  app.get('/api/hazop/studies/:studyId/ce-matrices', ensureAuthenticated, async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT m.*, n.node_reference, n.node_name,
               (SELECT COUNT(*) FROM hazop_ce_rows WHERE matrix_id=m.id) AS row_count,
               (SELECT COUNT(*) FROM hazop_ce_columns WHERE matrix_id=m.id) AS col_count
        FROM hazop_ce_matrices m
        LEFT JOIN hazop_nodes n ON n.id = m.node_id
        WHERE m.study_id=$1 ORDER BY m.matrix_number`, [req.params.studyId]);
      res.json(r.rows);
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/hazop/studies/:studyId/ce-matrices', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      const { node_id, title, scope_description } = req.body;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
        const nxt = await client.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(matrix_number FROM '\\d+$') AS INT)),0)+1 AS n FROM hazop_ce_matrices WHERE study_id=$1`, [studyId]);
        const studyShort = study.study_number?.replace(/[^0-9]/g,'').slice(-4) ?? String(studyId);
        const num = `CEM-${studyShort}-${String(nxt.rows[0].n).padStart(3,'0')}`;
        const r = await client.query(`
          INSERT INTO hazop_ce_matrices (study_id, node_id, matrix_number, title, scope_description, created_by)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [studyId, node_id ?? null, num, title ?? null, scope_description ?? null, (req.user as any).id]);
        await client.query('COMMIT');
        res.status(201).json(r.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  app.get('/api/hazop/ce-matrices/:id', ensureAuthenticated, async (req, res) => {
    try {
      const [mat, rows, cols, cells] = await Promise.all([
        pool.query(`SELECT m.*, n.node_reference, n.node_name FROM hazop_ce_matrices m
                    LEFT JOIN hazop_nodes n ON n.id=m.node_id WHERE m.id=$1`, [req.params.id]),
        pool.query('SELECT * FROM hazop_ce_rows WHERE matrix_id=$1 ORDER BY row_number', [req.params.id]),
        pool.query('SELECT * FROM hazop_ce_columns WHERE matrix_id=$1 ORDER BY col_number', [req.params.id]),
        pool.query('SELECT * FROM hazop_ce_cells WHERE v4b_matrix_id=$1', [req.params.id]),
      ]);
      if (!mat.rows[0]) return sendNotFound(res, 'C&E Matrix');
      res.json({ ...mat.rows[0], rows: rows.rows, columns: cols.rows, cells: cells.rows });
    } catch (err) { sendError(res, err); }
  });

  app.patch('/api/hazop/ce-matrices/:id', ensureAuthenticated, async (req, res) => {
    try {
      const { title, scope_description, status } = req.body;
      const r = await pool.query(
        `UPDATE hazop_ce_matrices SET title=$1, scope_description=$2, status=COALESCE($3,status) WHERE id=$4 RETURNING *`,
        [title ?? null, scope_description ?? null, status ?? null, req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'C&E Matrix');
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/hazop/ce-matrices/:id', ensureAuthenticated, async (req, res) => {
    try {
      const r = await pool.query('SELECT baseline_revision FROM hazop_ce_matrices WHERE id=$1', [req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'C&E Matrix');
      if (r.rows[0].baseline_revision) return res.status(409).json({ message: 'Cannot delete a baselined safety record' });
      await pool.query('DELETE FROM hazop_ce_matrices WHERE id=$1', [req.params.id]);
      res.json({ message: 'Deleted' });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/hazop/ce-matrices/:id/set-baseline', ensureAuthenticated, async (req, res) => {
    try {
      const m = await pool.query('SELECT * FROM hazop_ce_matrices WHERE id=$1', [req.params.id]);
      if (!m.rows[0]) return sendNotFound(res, 'C&E Matrix');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const bl = await nextBaselineRevision(client, m.rows[0].study_id);
        const r = await client.query(
          `UPDATE hazop_ce_matrices SET baseline_revision=$1, status='approved' WHERE id=$2 RETURNING *`, [bl, req.params.id]);
        await client.query('COMMIT');
        res.json(r.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // Rows CRUD
  app.post('/api/hazop/ce-matrices/:id/rows', ensureAuthenticated, async (req, res) => {
    try {
      const { description, event_type, tag_ref, source_deviation_id, source_cause_id, event_group_id } = req.body;
      if (!description) return res.status(400).json({ message: 'description required' });
      const nxt = await pool.query(`SELECT COALESCE(MAX(row_number),0)+1 AS n FROM hazop_ce_rows WHERE matrix_id=$1`, [req.params.id]);
      const r = await pool.query(`INSERT INTO hazop_ce_rows (matrix_id, row_number, description, event_type, tag_ref, source_deviation_id, source_cause_id, event_group_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.id, nxt.rows[0].n, description, event_type??null, tag_ref??null,
         source_deviation_id??null, source_cause_id??null, event_group_id??null]);
      res.status(201).json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/hazop/ce-rows/:id', ensureAuthenticated, async (req, res) => {
    try {
      await pool.query('DELETE FROM hazop_ce_rows WHERE id=$1', [req.params.id]);
      res.json({ message: 'Deleted' });
    } catch (err) { sendError(res, err); }
  });

  // Columns CRUD
  app.post('/api/hazop/ce-matrices/:id/columns', ensureAuthenticated, async (req, res) => {
    try {
      const { description, col_type, protection_layer, tag_ref, source_safeguard_id, response_group_id } = req.body;
      if (!description) return res.status(400).json({ message: 'description required' });
      const nxt = await pool.query(`SELECT COALESCE(MAX(col_number),0)+1 AS n FROM hazop_ce_columns WHERE matrix_id=$1`, [req.params.id]);
      const r = await pool.query(`INSERT INTO hazop_ce_columns (matrix_id, col_number, description, col_type, protection_layer, tag_ref, source_safeguard_id, response_group_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.id, nxt.rows[0].n, description, col_type??'interlock', protection_layer??null,
         tag_ref??null, source_safeguard_id??null, response_group_id??null]);
      res.status(201).json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/hazop/ce-columns/:id', ensureAuthenticated, async (req, res) => {
    try {
      await pool.query('DELETE FROM hazop_ce_columns WHERE id=$1', [req.params.id]);
      res.json({ message: 'Deleted' });
    } catch (err) { sendError(res, err); }
  });

  // Cell toggle
  app.post('/api/hazop/ce-matrices/:id/cells', ensureAuthenticated, async (req, res) => {
    try {
      const { row_id, col_id, triggered, notes } = req.body;
      if (!row_id || !col_id) return res.status(400).json({ message: 'row_id and col_id required' });
      const r = await pool.query(`
        INSERT INTO hazop_ce_cells (v4b_matrix_id, row_id, col_id, triggered, notes, matrix_id, cause_id, effect_id)
        VALUES ($1,$2,$3,$4,$5,$1,$2,$3)
        ON CONFLICT (cause_id, effect_id) DO UPDATE SET triggered=EXCLUDED.triggered, notes=EXCLUDED.notes
        RETURNING *`, [req.params.id, row_id, col_id, triggered ?? true, notes ?? null]);
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // Populate matrix from event/response groups
  app.post('/api/hazop/studies/:studyId/ce-matrices/populate-from-groups', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      const { node_id } = req.body;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
        const nxt = await client.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(matrix_number FROM '\\d+$') AS INT)),0)+1 AS n FROM hazop_ce_matrices WHERE study_id=$1`, [studyId]);
        const studyShort = study.study_number?.replace(/[^0-9]/g,'').slice(-4) ?? String(studyId);
        const num = `CEM-${studyShort}-${String(nxt.rows[0].n).padStart(3,'0')}`;
        const mat = await client.query(
          `INSERT INTO hazop_ce_matrices (study_id, node_id, matrix_number, title, scope_description, created_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [studyId, node_id ?? null, num, 'Auto-generated C&E Matrix', 'Generated from event groups and response groups', (req.user as any).id]);
        const matId = mat.rows[0].id;

        // Rows from event groups
        const egs = await client.query('SELECT * FROM hazop_event_groups WHERE study_id=$1 ORDER BY group_number', [studyId]);
        let rowNum = 1;
        for (const eg of egs.rows) {
          await client.query(
            `INSERT INTO hazop_ce_rows (matrix_id, row_number, description, event_type, event_group_id)
             VALUES ($1,$2,$3,$4,$5)`,
            [matId, rowNum, eg.group_name, eg.event_type, eg.id]);
          rowNum++;
        }

        // Columns from response groups (IPLs)
        const rgs = await client.query(
          `SELECT * FROM hazop_response_groups WHERE study_id=$1 AND is_independent_protection_layer=true ORDER BY group_number`, [studyId]);
        let colNum = 1;
        for (const rg of rgs.rows) {
          await client.query(
            `INSERT INTO hazop_ce_columns (matrix_id, col_number, description, col_type, protection_layer, response_group_id)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [matId, colNum, rg.group_name, rg.protection_layer === 'SIS' ? 'sis' : 'interlock',
             rg.protection_layer, rg.id]);
          colNum++;
        }

        await client.query('COMMIT');
        res.status(201).json({ matrix_id: matId, matrix_number: num, row_count: egs.rows.length, col_count: rgs.rows.length });
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4B-03: SAFETY FUNCTIONS (extends existing table with v1.3 fields)
  // ══════════════════════════════════════════════════════════════════════════

  app.get('/api/hazop/studies/:studyId/safety-functions', ensureAuthenticated, async (req, res) => {
    try {
      const r = await pool.query(`SELECT * FROM hazop_safety_functions WHERE study_id=$1 ORDER BY sif_number`, [req.params.studyId]);
      res.json(r.rows);
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/hazop/studies/:studyId/safety-functions', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      const { description, process_demand, safety_action, sil_required, response_time_sec,
              initiating_tag, final_element, protection_layer, consequence_severity,
              effectiveness_rating, is_independent_protection_layer, response_group_id,
              source_deviation_id, source_safeguard_id, notes } = req.body;
      if (!description) return res.status(400).json({ message: 'description required' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
        const nxt = await client.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(sif_number FROM '\\d+$') AS INT)),0)+1 AS n FROM hazop_safety_functions WHERE study_id=$1`, [studyId]);
        const num = `SIF-${String(nxt.rows[0].n).padStart(3,'0')}`;
        const r = await client.query(`
          INSERT INTO hazop_safety_functions
            (study_id, sif_number, sif_description, description, initiating_cause, process_demand,
             safety_action, initiator_tag, initiating_tag, final_element_tag, final_element,
             protection_layer, consequence_severity, effectiveness_rating,
             is_independent_protection_layer, response_group_id, source_deviation_id,
             source_safeguard_id, notes, status, created_at, updated_at)
          VALUES ($1,$2,$3,$3,$4,$4,$5,$6,$6,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft',NOW(),NOW())
          RETURNING *`,
          [studyId, num, description, process_demand??null, safety_action??null,
           initiating_tag??null, final_element??null, protection_layer??'SIS',
           consequence_severity??null, effectiveness_rating??null,
           is_independent_protection_layer ?? true,
           response_group_id??null, source_deviation_id??null,
           source_safeguard_id??null, notes??null]);
        await client.query('COMMIT');
        res.status(201).json(r.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  app.patch('/api/hazop/safety-functions/:id', ensureAuthenticated, async (req, res) => {
    try {
      const { description, consequence_severity, effectiveness_rating, is_independent_protection_layer,
              protection_layer, safety_action, response_time_sec, initiating_tag, final_element,
              process_demand, sil_required, response_group_id, notes, status } = req.body;
      const r = await pool.query(`
        UPDATE hazop_safety_functions SET
          description=COALESCE($1,description), sif_description=COALESCE($1,sif_description),
          consequence_severity=COALESCE($2,consequence_severity),
          effectiveness_rating=COALESCE($3,effectiveness_rating),
          is_independent_protection_layer=COALESCE($4,is_independent_protection_layer),
          protection_layer=COALESCE($5,protection_layer),
          safety_action=COALESCE($6,safety_action),
          response_time_sec=COALESCE($7,response_time_sec),
          initiating_tag=COALESCE($8,initiating_tag), initiator_tag=COALESCE($8,initiator_tag),
          final_element=COALESCE($9,final_element), final_element_tag=COALESCE($9,final_element_tag),
          process_demand=COALESCE($10,process_demand), initiating_cause=COALESCE($10,initiating_cause),
          response_group_id=COALESCE($11,response_group_id),
          notes=COALESCE($12,notes), status=COALESCE($13,status), updated_at=NOW()
        WHERE id=$14 RETURNING *`,
        [description, consequence_severity, effectiveness_rating, is_independent_protection_layer,
         protection_layer, safety_action, response_time_sec, initiating_tag, final_element,
         process_demand, response_group_id, notes, status, req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'Safety Function');
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/hazop/safety-functions/:id', ensureAuthenticated, async (req, res) => {
    try {
      const r = await pool.query('SELECT baseline_revision FROM hazop_safety_functions WHERE id=$1', [req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'Safety Function');
      if (r.rows[0].baseline_revision) return res.status(409).json({ message: 'Cannot delete a baselined safety record' });
      await pool.query('DELETE FROM hazop_safety_functions WHERE id=$1', [req.params.id]);
      res.json({ message: 'Deleted' });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/hazop/safety-functions/:id/set-baseline', ensureAuthenticated, async (req, res) => {
    try {
      const sf = await pool.query('SELECT * FROM hazop_safety_functions WHERE id=$1', [req.params.id]);
      if (!sf.rows[0]) return sendNotFound(res, 'Safety Function');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const bl = await nextBaselineRevision(client, sf.rows[0].study_id);
        const r = await client.query(
          `UPDATE hazop_safety_functions SET baseline_revision=$1, status='approved', updated_at=NOW() WHERE id=$2 RETURNING *`,
          [bl, req.params.id]);
        await client.query('COMMIT');
        res.json(r.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // Auto-extract safety functions from response groups (SIS IPLs)
  app.post('/api/hazop/studies/:studyId/safety-functions/extract', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      const sisRgs = await pool.query(`
        SELECT rg.*, a.action_description, a.tag_ref AS act_tag, a.confidence_score
        FROM hazop_response_groups rg
        LEFT JOIN hazop_response_group_actions a ON a.response_group_id = rg.id AND a.sequence_no = 1
        WHERE rg.study_id=$1 AND rg.protection_layer='SIS' AND rg.is_independent_protection_layer=true
        ORDER BY rg.group_number`, [studyId]);
      const client = await pool.connect();
      let created = 0; let skipped = 0;
      try {
        await client.query('BEGIN');
        for (const rg of sisRgs.rows) {
          const ex = await client.query(
            'SELECT id FROM hazop_safety_functions WHERE study_id=$1 AND response_group_id=$2', [studyId, rg.id]);
          if (ex.rows.length) { skipped++; continue; }
          await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
          const nxt = await client.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(sif_number FROM '\\d+$') AS INT)),0)+1 AS n FROM hazop_safety_functions WHERE study_id=$1`, [studyId]);
          const num = `SIF-${String(nxt.rows[0].n).padStart(3,'0')}`;
          await client.query(`
            INSERT INTO hazop_safety_functions
              (study_id, sif_number, sif_description, description, initiating_cause, process_demand,
               safety_action, initiating_tag, initiator_tag, final_element_tag, final_element,
               protection_layer, consequence_severity, effectiveness_rating,
               is_independent_protection_layer, response_group_id, status, created_at, updated_at)
            VALUES ($1,$2,$3,$3,$4,$4,$5,$6,$6,$7,$7,$8,$9,$10,$11,$12,'draft',NOW(),NOW())`,
            [studyId, num, rg.group_name,
             `Demand on SIS from: ${rg.group_name}`, rg.action_description ?? 'Trip action',
             rg.act_tag ?? null, rg.act_tag ?? null,
             'SIS', null, rg.effectiveness_rating ?? 'medium',
             true, rg.id]);
          created++;
        }
        await client.query('COMMIT');
        res.status(201).json({ created, skipped });
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4B-04: INTERLOCKS + INTERLOCK ACTIONS
  // ══════════════════════════════════════════════════════════════════════════

  app.get('/api/hazop/studies/:studyId/interlocks', ensureAuthenticated, async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT il.*, eg.group_number AS eg_number, eg.group_name AS eg_name,
               rg.group_number AS rg_number, rg.group_name AS rg_name,
               (SELECT json_agg(a ORDER BY a.sequence_no) FROM hazop_interlock_actions a WHERE a.interlock_id=il.id) AS actions
        FROM hazop_interlocks il
        LEFT JOIN hazop_event_groups eg ON eg.id = il.event_group_id
        LEFT JOIN hazop_response_groups rg ON rg.id = il.response_group_id
        WHERE il.study_id=$1 ORDER BY il.interlock_number`, [req.params.studyId]);
      res.json(r.rows);
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/hazop/studies/:studyId/interlocks', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      const { description, interlock_type, protection_layer, logic_type, criticality_class,
              consequence_severity, effectiveness_rating, is_independent_protection_layer,
              initiating_condition, initiating_tag, final_element_tag, set_point, reset_type,
              bypass_provision, sil_level, event_group_id, response_group_id,
              source_deviation_id, source_safeguard_id, notes } = req.body;
      if (!description) return res.status(400).json({ message: 'description required' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
        const intType = interlock_type ?? 'process';
        const prefix = intType === 'SIS' ? 'SIS' : 'IL';
        const nxt = await client.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(interlock_number FROM '\\d+$') AS INT)),0)+1 AS n FROM hazop_interlocks WHERE study_id=$1 AND interlock_number LIKE '${prefix}-%'`, [studyId]);
        const num = `${prefix}-${String(nxt.rows[0].n).padStart(3,'0')}`;
        const r = await client.query(`
          INSERT INTO hazop_interlocks
            (study_id, interlock_number, interlock_type, protection_layer, logic_type,
             criticality_class, consequence_severity, effectiveness_rating,
             is_independent_protection_layer, description, initiating_condition, initiating_tag,
             final_element_tag, set_point, reset_type, bypass_provision, sil_level,
             event_group_id, response_group_id, source_deviation_id, source_safeguard_id, notes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
          RETURNING *`,
          [studyId, num, intType, protection_layer??'BPCS', logic_type??'parallel',
           criticality_class??null, consequence_severity??null, effectiveness_rating??null,
           is_independent_protection_layer??false, description, initiating_condition??null,
           initiating_tag??null, final_element_tag??null, set_point??null, reset_type??null,
           bypass_provision??false, sil_level??null, event_group_id??null, response_group_id??null,
           source_deviation_id??null, source_safeguard_id??null, notes??null, (req.user as any).id]);
        await client.query('COMMIT');
        res.status(201).json(r.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  app.patch('/api/hazop/interlocks/:id', ensureAuthenticated, async (req, res) => {
    try {
      const { description, interlock_type, protection_layer, logic_type, criticality_class,
              consequence_severity, effectiveness_rating, is_independent_protection_layer,
              initiating_condition, initiating_tag, final_element_tag, set_point, reset_type,
              bypass_provision, sil_level, status, notes } = req.body;
      const r = await pool.query(`
        UPDATE hazop_interlocks SET
          description=COALESCE($1,description), interlock_type=COALESCE($2,interlock_type),
          protection_layer=COALESCE($3,protection_layer), logic_type=COALESCE($4,logic_type),
          criticality_class=COALESCE($5,criticality_class),
          consequence_severity=COALESCE($6,consequence_severity),
          effectiveness_rating=COALESCE($7,effectiveness_rating),
          is_independent_protection_layer=COALESCE($8,is_independent_protection_layer),
          initiating_condition=COALESCE($9,initiating_condition),
          initiating_tag=COALESCE($10,initiating_tag), final_element_tag=COALESCE($11,final_element_tag),
          set_point=COALESCE($12,set_point), reset_type=COALESCE($13,reset_type),
          bypass_provision=COALESCE($14,bypass_provision), sil_level=COALESCE($15,sil_level),
          status=COALESCE($16,status), notes=COALESCE($17,notes)
        WHERE id=$18 RETURNING *`,
        [description, interlock_type, protection_layer, logic_type, criticality_class,
         consequence_severity, effectiveness_rating, is_independent_protection_layer,
         initiating_condition, initiating_tag, final_element_tag, set_point, reset_type,
         bypass_provision, sil_level, status, notes, req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'Interlock');
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/hazop/interlocks/:id', ensureAuthenticated, async (req, res) => {
    try {
      const r = await pool.query('SELECT baseline_revision FROM hazop_interlocks WHERE id=$1', [req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'Interlock');
      if (r.rows[0].baseline_revision) return res.status(409).json({ message: 'Cannot delete a baselined safety record' });
      await pool.query('DELETE FROM hazop_interlocks WHERE id=$1', [req.params.id]);
      res.json({ message: 'Deleted' });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/hazop/interlocks/:id/set-baseline', ensureAuthenticated, async (req, res) => {
    try {
      const il = await pool.query('SELECT * FROM hazop_interlocks WHERE id=$1', [req.params.id]);
      if (!il.rows[0]) return sendNotFound(res, 'Interlock');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const bl = await nextBaselineRevision(client, il.rows[0].study_id);
        const r = await client.query(
          `UPDATE hazop_interlocks SET baseline_revision=$1, status='approved' WHERE id=$2 RETURNING *`,
          [bl, req.params.id]);
        await client.query('COMMIT');
        res.json(r.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // Interlock actions
  app.post('/api/hazop/interlocks/:id/actions', ensureAuthenticated, async (req, res) => {
    try {
      const { action_description, action_type, fail_state, tag_ref, confidence_score, source_safeguard_id } = req.body;
      if (!action_description) return res.status(400).json({ message: 'action_description required' });
      const nxt = await pool.query(`SELECT COALESCE(MAX(sequence_no),0)+1 AS n FROM hazop_interlock_actions WHERE interlock_id=$1`, [req.params.id]);
      const r = await pool.query(`
        INSERT INTO hazop_interlock_actions (interlock_id, sequence_no, action_description, action_type, fail_state, tag_ref, confidence_score, source_safeguard_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.id, nxt.rows[0].n, action_description, action_type??null, fail_state??null,
         tag_ref??null, confidence_score??null, source_safeguard_id??null]);
      res.status(201).json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  app.patch('/api/hazop/interlock-actions/:id', ensureAuthenticated, async (req, res) => {
    try {
      const { action_description, action_type, fail_state, tag_ref, confidence_score } = req.body;
      const r = await pool.query(`
        UPDATE hazop_interlock_actions SET
          action_description=COALESCE($1,action_description), action_type=COALESCE($2,action_type),
          fail_state=COALESCE($3,fail_state), tag_ref=COALESCE($4,tag_ref),
          confidence_score=COALESCE($5,confidence_score)
        WHERE id=$6 RETURNING *`,
        [action_description, action_type, fail_state, tag_ref, confidence_score, req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'Interlock Action');
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/hazop/interlock-actions/:id', ensureAuthenticated, async (req, res) => {
    try {
      await pool.query('DELETE FROM hazop_interlock_actions WHERE id=$1', [req.params.id]);
      res.json({ message: 'Deleted' });
    } catch (err) { sendError(res, err); }
  });

  // Extract interlocks from SIS response groups + interlock actions from actions
  app.post('/api/hazop/studies/:studyId/interlocks/extract', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      const rgs = await pool.query(`
        SELECT rg.*, eg.consequence_severity AS eg_severity
        FROM hazop_response_groups rg
        LEFT JOIN hazop_event_groups eg ON eg.study_id=rg.study_id
          AND rg.operating_mode = eg.operating_mode
        WHERE rg.study_id=$1 AND rg.protection_layer IN ('SIS','BPCS') AND rg.is_independent_protection_layer=true
        GROUP BY rg.id, eg.consequence_severity ORDER BY rg.group_number`, [studyId]);
      const client = await pool.connect();
      let created = 0; let skipped = 0;
      try {
        await client.query('BEGIN');
        for (const rg of rgs.rows) {
          const ex = await client.query('SELECT id FROM hazop_interlocks WHERE study_id=$1 AND response_group_id=$2', [studyId, rg.id]);
          if (ex.rows.length) { skipped++; continue; }
          await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
          const intType = rg.protection_layer === 'SIS' ? 'SIS' : 'process';
          const prefix = intType === 'SIS' ? 'SIS' : 'IL';
          const nxt = await client.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(interlock_number FROM '\\d+$') AS INT)),0)+1 AS n FROM hazop_interlocks WHERE study_id=$1 AND interlock_number LIKE '${prefix}-%'`, [studyId]);
          const num = `${prefix}-${String(nxt.rows[0].n).padStart(3,'0')}`;
          const il = await client.query(`
            INSERT INTO hazop_interlocks (study_id, interlock_number, interlock_type, protection_layer, logic_type,
              criticality_class, consequence_severity, effectiveness_rating, is_independent_protection_layer,
              description, response_group_id, status, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'identified',$12) RETURNING id`,
            [studyId, num, intType, rg.protection_layer, rg.logic_type ?? 'parallel',
             rg.criticality_class, rg.eg_severity ?? null, rg.effectiveness_rating,
             rg.is_independent_protection_layer, rg.group_name, rg.id, (req.user as any).id]);
          // Extract actions from response group actions
          const acts = await client.query(
            'SELECT * FROM hazop_response_group_actions WHERE response_group_id=$1 ORDER BY sequence_no', [rg.id]);
          let seqNo = 1;
          for (const a of acts.rows) {
            const failState = rg.protection_layer === 'SIS' ? 'deenergize_to_trip' :
                              (a.action_type === 'close' ? 'fail_closed' :
                               a.action_type === 'open'  ? 'fail_open' : null);
            await client.query(`
              INSERT INTO hazop_interlock_actions (interlock_id, sequence_no, action_description, action_type, fail_state, tag_ref, confidence_score, source_safeguard_id)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [il.rows[0].id, seqNo, a.action_description, a.action_type, failState,
               a.tag_ref, a.confidence_score, a.source_safeguard_id]);
            seqNo++;
          }
          created++;
        }
        await client.query('COMMIT');
        res.status(201).json({ created, skipped });
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4B-05: ALARM / TRIP REGISTER
  // ══════════════════════════════════════════════════════════════════════════

  app.get('/api/hazop/studies/:studyId/alarm-trips', ensureAuthenticated, async (req, res) => {
    try {
      const { alarm_type, protection_layer, rationalization_status, priority } = req.query as any;
      let q = `SELECT at.*, eg.group_number AS eg_number, eg.group_name AS eg_name,
                 il.interlock_number
               FROM hazop_alarm_trips at
               LEFT JOIN hazop_event_groups eg ON eg.id = at.event_group_id
               LEFT JOIN hazop_interlocks il ON il.id = at.interlock_id
               WHERE at.study_id=$1`;
      const params: any[] = [req.params.studyId];
      if (alarm_type)              { params.push(alarm_type);              q += ` AND at.alarm_type=$${params.length}`; }
      if (protection_layer)        { params.push(protection_layer);        q += ` AND at.protection_layer=$${params.length}`; }
      if (rationalization_status)  { params.push(rationalization_status);  q += ` AND at.rationalization_status=$${params.length}`; }
      if (priority)                { params.push(priority);                q += ` AND at.priority=$${params.length}`; }
      q += ' ORDER BY at.alarm_number';
      const r = await pool.query(q, params);
      res.json(r.rows);
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/hazop/studies/:studyId/alarm-trips', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      const { description, alarm_type, protection_layer, criticality_class, effectiveness_rating,
              human_dependency_level, tag_ref, process_parameter, set_point, alarm_action, trip_action,
              response_time_sec, operator_action_required, priority, source_deviation_id,
              source_safeguard_id, interlock_id, event_group_id, notes } = req.body;
      if (!description || !alarm_type) return res.status(400).json({ message: 'description and alarm_type required' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
        const aType = alarm_type.toUpperCase();
        const prefix = aType === 'ALARM' || aType === 'alarm' ? 'ALM' : 'TRIP';
        const pattern = prefix === 'ALM' ? 'ALM-%' : 'TRIP-%';
        const nxt = await client.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(alarm_number FROM '\\d+$') AS INT)),0)+1 AS n FROM hazop_alarm_trips WHERE study_id=$1 AND alarm_number LIKE '${pattern}'`, [studyId]);
        const num = prefix === 'ALM'
          ? `ALM-${String(nxt.rows[0].n).padStart(4,'0')}`
          : `TRIP-${String(nxt.rows[0].n).padStart(4,'0')}`;
        const r = await client.query(`
          INSERT INTO hazop_alarm_trips (study_id, alarm_number, alarm_type, protection_layer,
            criticality_class, effectiveness_rating, human_dependency_level, tag_ref, description,
            process_parameter, set_point, alarm_action, trip_action, response_time_sec,
            operator_action_required, priority, source_deviation_id, source_safeguard_id,
            interlock_id, event_group_id, notes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
          RETURNING *`,
          [studyId, num, alarm_type, protection_layer??'BPCS', criticality_class??null,
           effectiveness_rating??null, human_dependency_level??null, tag_ref??null,
           description, process_parameter??null, set_point??null, alarm_action??null,
           trip_action??null, response_time_sec??null, operator_action_required??true,
           priority??'medium', source_deviation_id??null, source_safeguard_id??null,
           interlock_id??null, event_group_id??null, notes??null, (req.user as any).id]);
        await client.query('COMMIT');
        res.status(201).json(r.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  app.patch('/api/hazop/alarm-trips/:id', ensureAuthenticated, async (req, res) => {
    try {
      const { description, alarm_type, protection_layer, criticality_class, effectiveness_rating,
              human_dependency_level, tag_ref, process_parameter, set_point, alarm_action, trip_action,
              response_time_sec, operator_action_required, priority, rationalization_status, notes } = req.body;
      const r = await pool.query(`
        UPDATE hazop_alarm_trips SET
          description=COALESCE($1,description), alarm_type=COALESCE($2,alarm_type),
          protection_layer=COALESCE($3,protection_layer), criticality_class=COALESCE($4,criticality_class),
          effectiveness_rating=COALESCE($5,effectiveness_rating),
          human_dependency_level=COALESCE($6,human_dependency_level),
          tag_ref=COALESCE($7,tag_ref), process_parameter=COALESCE($8,process_parameter),
          set_point=COALESCE($9,set_point), alarm_action=COALESCE($10,alarm_action),
          trip_action=COALESCE($11,trip_action), response_time_sec=COALESCE($12,response_time_sec),
          operator_action_required=COALESCE($13,operator_action_required),
          priority=COALESCE($14,priority), rationalization_status=COALESCE($15,rationalization_status),
          notes=COALESCE($16,notes)
        WHERE id=$17 RETURNING *`,
        [description, alarm_type, protection_layer, criticality_class, effectiveness_rating,
         human_dependency_level, tag_ref, process_parameter, set_point, alarm_action, trip_action,
         response_time_sec, operator_action_required, priority, rationalization_status, notes, req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'Alarm/Trip');
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/hazop/alarm-trips/:id', ensureAuthenticated, async (req, res) => {
    try {
      const r = await pool.query('SELECT baseline_revision FROM hazop_alarm_trips WHERE id=$1', [req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'Alarm/Trip');
      if (r.rows[0].baseline_revision) return res.status(409).json({ message: 'Cannot delete a baselined safety record' });
      await pool.query('DELETE FROM hazop_alarm_trips WHERE id=$1', [req.params.id]);
      res.json({ message: 'Deleted' });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/hazop/alarm-trips/:id/set-baseline', ensureAuthenticated, async (req, res) => {
    try {
      const at = await pool.query('SELECT * FROM hazop_alarm_trips WHERE id=$1', [req.params.id]);
      if (!at.rows[0]) return sendNotFound(res, 'Alarm/Trip');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const bl = await nextBaselineRevision(client, at.rows[0].study_id);
        const r = await client.query(
          `UPDATE hazop_alarm_trips SET baseline_revision=$1, rationalization_status='rationalized' WHERE id=$2 RETURNING *`,
          [bl, req.params.id]);
        await client.query('COMMIT');
        res.json(r.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // Auto-extract alarm/trip records from alarm/trip response groups
  app.post('/api/hazop/studies/:studyId/alarm-trips/extract', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      const alarmRgs = await pool.query(`
        SELECT rg.*, a.action_description, a.tag_ref AS act_tag, a.action_type
        FROM hazop_response_groups rg
        LEFT JOIN hazop_response_group_actions a ON a.response_group_id=rg.id AND a.sequence_no=1
        WHERE rg.study_id=$1 AND rg.protection_layer='BPCS'
        ORDER BY rg.group_number`, [studyId]);
      const client = await pool.connect();
      let created = 0; let skipped = 0;
      try {
        await client.query('BEGIN');
        for (const rg of alarmRgs.rows) {
          const ex = await client.query(
            `SELECT id FROM hazop_alarm_trips WHERE study_id=$1 AND (tag_ref=$2 OR description=$3)`,
            [studyId, rg.act_tag, rg.group_name]);
          if (ex.rows.length) { skipped++; continue; }
          await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
          const isAlarm = rg.action_type === 'alarm';
          const prefix = isAlarm ? 'ALM' : 'TRIP';
          const pattern = isAlarm ? 'ALM-%' : 'TRIP-%';
          const nxt = await client.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(alarm_number FROM '\\d+$') AS INT)),0)+1 AS n FROM hazop_alarm_trips WHERE study_id=$1 AND alarm_number LIKE '${pattern}'`, [studyId]);
          const num = isAlarm
            ? `ALM-${String(nxt.rows[0].n).padStart(4,'0')}`
            : `TRIP-${String(nxt.rows[0].n).padStart(4,'0')}`;
          await client.query(`
            INSERT INTO hazop_alarm_trips (study_id, alarm_number, alarm_type, protection_layer,
              criticality_class, effectiveness_rating, human_dependency_level, tag_ref, description,
              operator_action_required, priority, event_group_id, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [studyId, num, isAlarm ? 'alarm' : 'trip', 'BPCS',
             rg.criticality_class, rg.effectiveness_rating, rg.human_dependency_level,
             rg.act_tag ?? null, rg.group_name,
             !isAlarm, isAlarm ? 'medium' : 'high', null, (req.user as any).id]);
          created++;
        }
        await client.query('COMMIT');
        res.status(201).json({ created, skipped });
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4B-06: SAFETY CRITICAL ELEMENTS (SCE)
  // ══════════════════════════════════════════════════════════════════════════

  app.get('/api/hazop/studies/:studyId/safety-critical-elements', ensureAuthenticated, async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT sce.*, sf.sif_number, sf.description AS sif_desc,
               il.interlock_number
        FROM hazop_safety_critical_elements sce
        LEFT JOIN hazop_safety_functions sf ON sf.id = sce.linked_sif_id
        LEFT JOIN hazop_interlocks il ON il.id = sce.linked_interlock_id
        WHERE sce.study_id=$1 ORDER BY sce.sce_number`, [req.params.studyId]);
      res.json(r.rows);
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/hazop/studies/:studyId/safety-critical-elements', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');
      const { tag_ref, description, equipment_type, protection_layer, fail_state,
              linked_sif_id, linked_interlock_id, proof_test_required,
              inspection_interval_days, notes } = req.body;
      if (!tag_ref || !description) return res.status(400).json({ message: 'tag_ref and description required' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [studyId * 10000 + 4001]);
        const nxt = await client.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(sce_number FROM '\\d+$') AS INT)),0)+1 AS n FROM hazop_safety_critical_elements WHERE study_id=$1`, [studyId]);
        const num = `SCE-${String(nxt.rows[0].n).padStart(3,'0')}`;
        const r = await client.query(`
          INSERT INTO hazop_safety_critical_elements
            (study_id, sce_number, tag_ref, description, equipment_type, protection_layer, fail_state,
             linked_sif_id, linked_interlock_id, proof_test_required, inspection_interval_days, notes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [studyId, num, tag_ref, description, equipment_type??null, protection_layer??null, fail_state??null,
           linked_sif_id??null, linked_interlock_id??null, proof_test_required??true,
           inspection_interval_days??null, notes??null, (req.user as any).id]);
        await client.query('COMMIT');
        res.status(201).json(r.rows[0]);
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  app.patch('/api/hazop/safety-critical-elements/:id', ensureAuthenticated, async (req, res) => {
    try {
      const { tag_ref, description, equipment_type, protection_layer, fail_state,
              linked_sif_id, linked_interlock_id, proof_test_required, inspection_interval_days, notes } = req.body;
      const r = await pool.query(`
        UPDATE hazop_safety_critical_elements SET
          tag_ref=COALESCE($1,tag_ref), description=COALESCE($2,description),
          equipment_type=COALESCE($3,equipment_type), protection_layer=COALESCE($4,protection_layer),
          fail_state=COALESCE($5,fail_state), linked_sif_id=COALESCE($6,linked_sif_id),
          linked_interlock_id=COALESCE($7,linked_interlock_id),
          proof_test_required=COALESCE($8,proof_test_required),
          inspection_interval_days=COALESCE($9,inspection_interval_days),
          notes=COALESCE($10,notes)
        WHERE id=$11 RETURNING *`,
        [tag_ref, description, equipment_type, protection_layer, fail_state,
         linked_sif_id, linked_interlock_id, proof_test_required, inspection_interval_days, notes, req.params.id]);
      if (!r.rows[0]) return sendNotFound(res, 'SCE');
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  app.delete('/api/hazop/safety-critical-elements/:id', ensureAuthenticated, async (req, res) => {
    try {
      await pool.query('DELETE FROM hazop_safety_critical_elements WHERE id=$1', [req.params.id]);
      res.json({ message: 'Deleted' });
    } catch (err) { sendError(res, err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4B-07: PHASE 4 SUMMARY (v1.3 additions)
  // Replaces the Phase 4A-only summary above
  // ══════════════════════════════════════════════════════════════════════════

  app.get('/api/hazop/studies/:studyId/phase4-summary-v2', ensureAuthenticated, async (req, res) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const study = await resolveStudyForP4(studyId);
      if (!study) return sendNotFound(res, 'HAZOP Study');

      const [egCount, egmCount, rgCount, rgaCount, confDist,
             scCount, scBaselined, scSeverity, scMode,
             ilCount, ilFailState, atCount, sceCount,
             effDist, hdCritical, failStateNotSet,
             plBreakdown, severityBreakdown] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM hazop_event_groups WHERE study_id=$1', [studyId]),
        pool.query(`SELECT COUNT(*) FROM hazop_event_group_members m JOIN hazop_event_groups eg ON eg.id=m.group_id WHERE eg.study_id=$1`, [studyId]),
        pool.query('SELECT COUNT(*) FROM hazop_response_groups WHERE study_id=$1', [studyId]),
        pool.query(`SELECT COUNT(*) FROM hazop_response_group_actions a JOIN hazop_response_groups rg ON rg.id=a.response_group_id WHERE rg.study_id=$1`, [studyId]),
        pool.query(`SELECT
            SUM(CASE WHEN a.confidence_score < 50 THEN 1 ELSE 0 END) AS low,
            SUM(CASE WHEN a.confidence_score BETWEEN 50 AND 74 THEN 1 ELSE 0 END) AS medium,
            SUM(CASE WHEN a.confidence_score BETWEEN 75 AND 89 THEN 1 ELSE 0 END) AS high,
            SUM(CASE WHEN a.confidence_score >= 90 THEN 1 ELSE 0 END) AS verified,
            SUM(CASE WHEN a.confidence_score IS NULL THEN 1 ELSE 0 END) AS manual
          FROM hazop_response_group_actions a JOIN hazop_response_groups rg ON rg.id=a.response_group_id WHERE rg.study_id=$1`, [studyId]),
        pool.query('SELECT COUNT(*) FROM hazop_scenarios WHERE study_id=$1', [studyId]),
        pool.query('SELECT COUNT(*) FROM hazop_scenarios WHERE study_id=$1 AND baseline_revision IS NOT NULL', [studyId]),
        pool.query(`SELECT consequence_severity, COUNT(*) FROM hazop_scenarios WHERE study_id=$1 AND consequence_severity IS NOT NULL GROUP BY consequence_severity`, [studyId]),
        pool.query(`SELECT operating_mode, COUNT(*) FROM hazop_scenarios WHERE study_id=$1 AND operating_mode IS NOT NULL GROUP BY operating_mode`, [studyId]),
        pool.query('SELECT COUNT(*) FROM hazop_interlocks WHERE study_id=$1', [studyId]),
        pool.query('SELECT COUNT(*) FROM hazop_interlocks WHERE study_id=$1 AND baseline_revision IS NOT NULL', [studyId]),
        pool.query('SELECT COUNT(*) FROM hazop_alarm_trips WHERE study_id=$1', [studyId]),
        pool.query('SELECT COUNT(*) FROM hazop_safety_critical_elements WHERE study_id=$1', [studyId]),
        pool.query(`SELECT
            SUM(CASE WHEN effectiveness_rating='low' THEN 1 ELSE 0 END) AS low,
            SUM(CASE WHEN effectiveness_rating='medium' THEN 1 ELSE 0 END) AS medium,
            SUM(CASE WHEN effectiveness_rating='high' THEN 1 ELSE 0 END) AS high,
            SUM(CASE WHEN effectiveness_rating='verified' THEN 1 ELSE 0 END) AS verified
          FROM hazop_response_groups WHERE study_id=$1`, [studyId]),
        pool.query(`SELECT COUNT(*) FROM hazop_response_groups WHERE study_id=$1 AND human_dependency_level='critical'`, [studyId]),
        pool.query(`SELECT COUNT(*) FROM hazop_interlock_actions a
          JOIN hazop_interlocks il ON il.id=a.interlock_id WHERE il.study_id=$1 AND a.fail_state IS NULL`, [studyId]),
        pool.query(`SELECT protection_layer, COUNT(*) FROM hazop_response_groups WHERE study_id=$1 GROUP BY protection_layer`, [studyId]),
        pool.query(`SELECT consequence_severity, COUNT(*) FROM hazop_event_groups WHERE study_id=$1 AND consequence_severity IS NOT NULL GROUP BY consequence_severity`, [studyId]),
      ]);

      const scTotal = parseInt(scCount.rows[0].count);
      const scBaselinedCount = parseInt(scBaselined.rows[0].count);

      res.json({
        event_group_count: parseInt(egCount.rows[0].count),
        member_count: parseInt(egmCount.rows[0].count),
        response_group_count: parseInt(rgCount.rows[0].count),
        response_group_action_count: parseInt(rgaCount.rows[0].count),
        protection_layer_breakdown: Object.fromEntries(plBreakdown.rows.map(r => [r.protection_layer, parseInt(r.count)])),
        severity_breakdown: Object.fromEntries(severityBreakdown.rows.map(r => [r.consequence_severity, parseInt(r.count)])),
        confidence_distribution: confDist.rows[0],
        scenario_count: scTotal,
        scenarios_with_baseline: scTotal > 0 ? Math.round(scBaselinedCount / scTotal * 100) : 0,
        scenarios_by_severity: Object.fromEntries(scSeverity.rows.map(r => [r.consequence_severity, parseInt(r.count)])),
        scenarios_by_operating_mode: Object.fromEntries(scMode.rows.map(r => [r.operating_mode, parseInt(r.count)])),
        interlock_count: parseInt(ilCount.rows[0].count),
        interlocks_with_baseline: parseInt(ilFailState.rows[0].count),
        alarm_trip_count: parseInt(atCount.rows[0].count),
        sce_count: parseInt(sceCount.rows[0].count),
        effectiveness_distribution: effDist.rows[0],
        human_dependency_critical_count: parseInt(hdCritical.rows[0].count),
        fail_state_not_set_count: parseInt(failStateNotSet.rows[0].count),
      });
    } catch (err) { sendError(res, err); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 4B END
  // ════════════════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 5A START — LOPA Core (IPL Stack + PFD Arithmetic)
  // ════════════════════════════════════════════════════════════════════════════

  // ── Pure arithmetic engine ─────────────────────────────────────────────────

  const IEF_DEFAULTS: Record<string, number> = {
    equipment_failure: 0.1, vacuum_failure: 0.1, thermal_runaway: 0.01,
    power_failure: 0.1,     utility_failure: 0.3, phase_transition: 0.3,
    instrument_failure: 0.1, operator_error: 0.01, process_deviation: 0.3, overpressure: 0.01,
  };

  const RTTF_DEFAULTS: Record<string, number> = {
    minor: 1e-2, serious: 1e-3, major: 1e-4, critical: 1e-5, catastrophic: 1e-6,
  };

  function getPfdDefault(protectionLayer: string, effectivenessRating: string | null): number {
    const key = `${protectionLayer}:${effectivenessRating ?? 'medium'}`;
    const pfdMap: Record<string, number> = {
      'SIS:verified': 0.001,     'SIS:high': 0.01,    'SIS:medium': 0.1,    'SIS:low': 0.3,
      'Mechanical:verified': 0.01,'Mechanical:high': 0.01,'Mechanical:medium': 0.01,'Mechanical:low': 0.01,
      'Relief:verified': 0.01,   'Relief:high': 0.01, 'Relief:medium': 0.01,'Relief:low': 0.01,
      'BPCS:verified': 0.1,      'BPCS:high': 0.1,    'BPCS:medium': 0.1,   'BPCS:low': 0.3,
      'Procedural:verified': 0.1,'Procedural:high': 0.1,'Procedural:medium': 0.3,'Procedural:low': 1.0,
      'Operator:verified': 0.1,  'Operator:high': 0.1,'Operator:medium': 0.3,'Operator:low': 1.0,
      'Operator:critical': 1.0,  'Operator:none': 1.0,
    };
    return pfdMap[key] ?? 0.1;
  }

  // ── computeLopa v1.1 ── 2026-05-25 ───────────────────────────────────────────
  // Eligibility: credit_applied=true AND is_independent=true AND pfd_value > 0
  // CCF derating: per ccf_group, only the member with the lowest PFD is credited;
  //   remaining members are counted in ccf_derated_count and excluded from product.
  // Warnings: >3 credited IPLs; MEF < 1e-12/yr.
  // arithmetic_version stored as '1.1' on every recalculate.

  interface IplStackItemV11 {
    id: number;
    pfd_value: number | null;
    credit_applied: boolean;
    is_independent: boolean;
    ccf_group: string | null;
  }

  interface ComputeLopaResultV11 {
    pfdProduct: number;
    achievedMef: number;
    riskGapRatio: number;
    lopaOutcome: string;
    requiredAdditionalPfd: number | null;
    requiredSil: number | null;
    creditedIplCount: number;
    excludedIplCount: number;
    ccfDeratedCount: number;
    warnings: string[];
    arithmeticVersion: string;
    creditableMap: Map<number, boolean>;
  }

  function computeLopaV11(
    iefPerYear: number,
    rttfPerYear: number,
    stackItems: IplStackItemV11[]
  ): ComputeLopaResultV11 {
    // Step 1 — eligibility gate
    const candidates: IplStackItemV11[] = [];
    let excludedIplCount = 0;
    for (const item of stackItems) {
      if (!item.credit_applied) continue; // user did not request credit — not counted
      if (!item.is_independent || item.pfd_value == null || item.pfd_value <= 0) {
        excludedIplCount++;
      } else {
        candidates.push(item);
      }
    }

    // Step 2 — CCF derating
    const ccfBuckets = new Map<string, IplStackItemV11[]>();
    const noCcfItems: IplStackItemV11[] = [];
    for (const item of candidates) {
      const grp = item.ccf_group?.trim() || null;
      if (grp) {
        if (!ccfBuckets.has(grp)) ccfBuckets.set(grp, []);
        ccfBuckets.get(grp)!.push(item);
      } else {
        noCcfItems.push(item);
      }
    }

    let ccfDeratedCount = 0;
    const deratedIds = new Set<number>();
    const creditedItems: IplStackItemV11[] = [...noCcfItems];

    for (const [, items] of ccfBuckets) {
      // Most conservative = lowest PFD credited; others derated
      const sorted = [...items].sort((a, b) => a.pfd_value! - b.pfd_value!);
      creditedItems.push(sorted[0]);
      for (let i = 1; i < sorted.length; i++) {
        deratedIds.add(sorted[i].id);
        ccfDeratedCount++;
      }
    }

    // Step 3 — per-item creditable map
    const creditableMap = new Map<number, boolean>();
    const creditedIdSet = new Set(creditedItems.map(i => i.id));
    for (const item of stackItems) {
      creditableMap.set(item.id, creditedIdSet.has(item.id));
    }

    // Step 4 — PFD product (no credited items → product = 1, i.e. no protection)
    const pfdProduct = creditedItems.length > 0
      ? creditedItems.reduce((acc, i) => acc * i.pfd_value!, 1)
      : 1;
    const achievedMef = iefPerYear * pfdProduct;
    const riskGapRatio = achievedMef / rttfPerYear;

    // Step 5 — warnings
    const warnings: string[] = [];
    if (creditedItems.length > 3) {
      warnings.push(
        `Excessive IPL credit: ${creditedItems.length} IPLs credited. ` +
        `Verify independence and CCF assumptions per IEC 61511.`
      );
    }
    if (achievedMef < 1e-12) {
      warnings.push(
        `Achieved MEF (${achievedMef.toExponential(2)} per year) is unrealistically optimistic. ` +
        `Review IPL independence and CCF assumptions.`
      );
    }

    // Step 6 — outcome + SIL
    let lopaOutcome: string;
    let requiredAdditionalPfd: number | null = null;
    let requiredSil: number | null = null;

    if (riskGapRatio <= 1.0) {
      lopaOutcome = 'tolerable';
    } else {
      requiredAdditionalPfd = rttfPerYear / achievedMef;
      const silRaw = -Math.log10(requiredAdditionalPfd);
      requiredSil = Math.min(4, Math.max(1, Math.ceil(silRaw)));
      if (requiredAdditionalPfd <= 0.001) lopaOutcome = 'requires_sif_upgrade';
      else if (requiredAdditionalPfd <= 0.01) lopaOutcome = 'requires_sif';
      else lopaOutcome = 'gap_exists';
    }

    return {
      pfdProduct,
      achievedMef,
      riskGapRatio,
      lopaOutcome,
      requiredAdditionalPfd,
      requiredSil,
      creditedIplCount: creditedItems.length,
      excludedIplCount,
      ccfDeratedCount,
      warnings,
      arithmeticVersion: '1.1',
      creditableMap,
    };
  }

  async function nextLopaNumber(studyId: number): Promise<string> {
    const r = await pool.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(lopa_number FROM 6) AS INTEGER)),0)+1 AS n
       FROM hazop_lopa_records WHERE study_id=$1`, [studyId]);
    return `LOPA-${String(r.rows[0].n).padStart(3, '0')}`;
  }

  async function nextLopaBaseline(studyId: number): Promise<string> {
    const r = await pool.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(baseline_revision FROM 4) AS INTEGER)),0)+1 AS n
       FROM hazop_lopa_records WHERE study_id=$1 AND baseline_revision IS NOT NULL`, [studyId]);
    return `BL-${String(r.rows[0].n).padStart(3, '0')}`;
  }

  // ── GET /api/hazop/studies/:studyId/lopa ───────────────────────────────────
  app.get('/api/hazop/studies/:studyId/lopa', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const rows = await pool.query(`
        SELECT lr.*,
               sc.scenario_number, sc.title AS scenario_title,
               sc.consequence_severity, sc.residual_risk,
               sc.operating_mode,
               (SELECT COUNT(*) FROM hazop_scenario_ipl_stack s WHERE s.scenario_id=lr.scenario_id) AS ipl_count,
               (SELECT COUNT(*) FROM hazop_scenario_ipl_stack s WHERE s.scenario_id=lr.scenario_id AND s.credit_applied=true) AS credited_count
        FROM hazop_lopa_records lr
        JOIN hazop_scenarios sc ON sc.id=lr.scenario_id
        WHERE lr.study_id=$1
        ORDER BY lr.lopa_number`, [studyId]);
      res.json(rows.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── POST /api/hazop/studies/:studyId/lopa/generate ────────────────────────
  app.post('/api/hazop/studies/:studyId/lopa/generate', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const studyId = parseInt(req.params.studyId);
      const userId = (req as any).user?.id;

      const scenarioRows = await client.query(`
        SELECT sc.id, sc.scenario_number, sc.title, sc.consequence_severity,
               eg.event_type
        FROM hazop_scenarios sc
        LEFT JOIN hazop_event_groups eg ON eg.id=sc.initiating_event_group_id
        WHERE sc.study_id=$1
          AND sc.id NOT IN (SELECT scenario_id FROM hazop_lopa_records WHERE study_id=$1)
        ORDER BY sc.scenario_number`, [studyId]);

      let created = 0;
      for (const sc of scenarioRows.rows) {
        const lopaNum = await nextLopaNumber(studyId);
        const ief = IEF_DEFAULTS[sc.event_type ?? ''] ?? 0.1;
        const rttf = RTTF_DEFAULTS[sc.consequence_severity ?? ''] ?? 1e-4;
        await client.query(`
          INSERT INTO hazop_lopa_records
            (study_id, scenario_id, lopa_number, title, ie_frequency_per_year,
             ie_frequency_basis, consequence_category, rttf_per_year, rttf_basis,
             lopa_status, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10)`,
          [studyId, sc.id, lopaNum,
           `LOPA — ${sc.title}`,
           ief, `Default from event_type: ${sc.event_type ?? 'unknown'}`,
           sc.consequence_severity ?? 'major',
           rttf, `Risk tolerance target — ${sc.consequence_severity ?? 'major'} consequence category`,
           userId]);
        created++;
      }
      await client.query('COMMIT');
      res.status(201).json({ created, message: `${created} LOPA record(s) generated` });
    } catch (err) { await client.query('ROLLBACK'); sendError(res, err); }
    finally { client.release(); }
  });

  // ── GET /api/hazop/lopa/:id ────────────────────────────────────────────────
  app.get('/api/hazop/lopa/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const r = await pool.query(`
        SELECT lr.*,
               sc.scenario_number, sc.title AS scenario_title,
               sc.consequence_severity, sc.residual_risk,
               sc.operating_mode, sc.baseline_revision AS scenario_baseline,
               eg.event_type, eg.group_number AS eg_number
        FROM hazop_lopa_records lr
        JOIN hazop_scenarios sc ON sc.id=lr.scenario_id
        LEFT JOIN hazop_event_groups eg ON eg.id=sc.initiating_event_group_id
        WHERE lr.id=$1`, [id]);
      if (!r.rows[0]) return sendNotFound(res, 'LOPA record');
      const lopa = r.rows[0];
      const stack = await pool.query(`
        SELECT s.*,
               rg.group_number AS rg_number,
               sf.sif_number,
               il.interlock_number
        FROM hazop_scenario_ipl_stack s
        LEFT JOIN hazop_response_groups rg ON rg.id=s.response_group_id
        LEFT JOIN hazop_safety_functions sf ON sf.id=s.safety_function_id
        LEFT JOIN hazop_interlocks il ON il.id=s.interlock_id
        WHERE s.scenario_id=$1
        ORDER BY s.stack_position`, [lopa.scenario_id]);
      res.json({ ...lopa, ipl_stack: stack.rows });
    } catch (err) { sendError(res, err); }
  });

  // ── PATCH /api/hazop/lopa/:id ──────────────────────────────────────────────
  app.patch('/api/hazop/lopa/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { ie_frequency_per_year, ie_frequency_basis, rttf_per_year, rttf_basis,
              consequence_category, lopa_status, notes, title } = req.body;
      const r = await pool.query(`
        UPDATE hazop_lopa_records SET
          ie_frequency_per_year = COALESCE($1, ie_frequency_per_year),
          ie_frequency_basis    = COALESCE($2, ie_frequency_basis),
          rttf_per_year         = COALESCE($3, rttf_per_year),
          rttf_basis            = COALESCE($4, rttf_basis),
          consequence_category  = COALESCE($5, consequence_category),
          lopa_status           = COALESCE($6, lopa_status),
          notes                 = COALESCE($7, notes),
          title                 = COALESCE($8, title)
        WHERE id=$9 RETURNING *`,
        [ie_frequency_per_year, ie_frequency_basis, rttf_per_year, rttf_basis,
         consequence_category, lopa_status, notes, title, id]);
      if (!r.rows[0]) return sendNotFound(res, 'LOPA record');
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── DELETE /api/hazop/lopa/:id ─────────────────────────────────────────────
  app.delete('/api/hazop/lopa/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const r = await pool.query('SELECT baseline_revision FROM hazop_lopa_records WHERE id=$1', [id]);
      if (!r.rows[0]) return sendNotFound(res, 'LOPA record');
      if (r.rows[0].baseline_revision) return sendBusinessError(res, 'Cannot delete a baselined LOPA record', 409);
      await pool.query('DELETE FROM hazop_lopa_records WHERE id=$1', [id]);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  // ── POST /api/hazop/lopa/:id/set-baseline ─────────────────────────────────
  app.post('/api/hazop/lopa/:id/set-baseline', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = parseInt(req.params.id);
      const r = await client.query('SELECT study_id FROM hazop_lopa_records WHERE id=$1 FOR UPDATE', [id]);
      if (!r.rows[0]) return sendNotFound(res, 'LOPA record');
      await client.query(`SELECT pg_advisory_xact_lock($1)`, [r.rows[0].study_id * 10000 + 5001]);
      const bl = await nextLopaBaseline(r.rows[0].study_id);
      const updated = await client.query(
        `UPDATE hazop_lopa_records SET baseline_revision=$1, lopa_status='approved' WHERE id=$2 RETURNING *`,
        [bl, id]);
      await client.query('COMMIT');
      res.json(updated.rows[0]);
    } catch (err) { await client.query('ROLLBACK'); sendError(res, err); }
    finally { client.release(); }
  });

  // ── POST /api/hazop/lopa/:id/recalculate (v1.1) ───────────────────────────
  app.post('/api/hazop/lopa/:id/recalculate', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = parseInt(req.params.id);
      const lr = await client.query('SELECT * FROM hazop_lopa_records WHERE id=$1', [id]);
      if (!lr.rows[0]) return sendNotFound(res, 'LOPA record');
      const lopa = lr.rows[0];

      // Fetch full stack with independence flag + CCF group from source tables
      const stack = await client.query(`
        SELECT s.id, s.pfd_value, s.credit_applied, s.is_independent,
               COALESCE(rg.common_cause_group, '') AS ccf_group
        FROM hazop_scenario_ipl_stack s
        LEFT JOIN hazop_response_groups rg ON rg.id = s.response_group_id
        WHERE s.scenario_id = $1
        ORDER BY s.stack_position`, [lopa.scenario_id]);

      const stackItems: IplStackItemV11[] = stack.rows.map((r: any) => ({
        id: r.id,
        pfd_value: r.pfd_value != null ? parseFloat(r.pfd_value) : null,
        credit_applied: r.credit_applied,
        is_independent: r.is_independent,
        ccf_group: r.ccf_group || null,
      }));

      const result = computeLopaV11(
        parseFloat(lopa.ie_frequency_per_year),
        parseFloat(lopa.rttf_per_year),
        stackItems
      );

      // Persist creditable flag on each stack item
      for (const [itemId, creditable] of result.creditableMap) {
        await client.query(
          'UPDATE hazop_scenario_ipl_stack SET creditable=$1 WHERE id=$2',
          [creditable, itemId]);
      }

      const updated = await client.query(`
        UPDATE hazop_lopa_records SET
          pfd_product             = $1,
          achieved_mef_per_year   = $2,
          risk_gap_ratio          = $3,
          lopa_outcome            = $4,
          required_additional_pfd = $5,
          required_sil            = $6,
          credited_ipl_count      = $7,
          excluded_ipl_count      = $8,
          ccf_derated_count       = $9,
          arithmetic_version      = $10,
          warnings                = $11
        WHERE id=$12 RETURNING *`,
        [result.pfdProduct, result.achievedMef, result.riskGapRatio,
         result.lopaOutcome, result.requiredAdditionalPfd, result.requiredSil,
         result.creditedIplCount, result.excludedIplCount, result.ccfDeratedCount,
         result.arithmeticVersion,
         result.warnings.length > 0 ? result.warnings : null,
         id]);

      await client.query('COMMIT');
      res.json({
        ...updated.rows[0],
        warnings: result.warnings,
        lopa_outcome: result.lopaOutcome,
        credited_ipl_count: result.creditedIplCount,
        excluded_ipl_count: result.excludedIplCount,
        ccf_derated_count: result.ccfDeratedCount,
        arithmetic_version: result.arithmeticVersion,
      });
    } catch (err) { await client.query('ROLLBACK'); sendError(res, err); }
    finally { client.release(); }
  });

  // ── GET /api/hazop/studies/:studyId/ipl-stack/:scenarioId ─────────────────
  app.get('/api/hazop/studies/:studyId/ipl-stack/:scenarioId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const scenarioId = parseInt(req.params.scenarioId);
      const rows = await pool.query(`
        SELECT s.*,
               rg.group_number AS rg_number, rg.description AS rg_description,
               sf.sif_number, sf.sif_description,
               il.interlock_number, il.interlock_type
        FROM hazop_scenario_ipl_stack s
        LEFT JOIN hazop_response_groups rg ON rg.id=s.response_group_id
        LEFT JOIN hazop_safety_functions sf ON sf.id=s.safety_function_id
        LEFT JOIN hazop_interlocks il ON il.id=s.interlock_id
        WHERE s.scenario_id=$1
        ORDER BY s.stack_position`, [scenarioId]);
      res.json(rows.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── POST /api/hazop/studies/:studyId/ipl-stack/:scenarioId/build ──────────
  app.post('/api/hazop/studies/:studyId/ipl-stack/:scenarioId/build', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const studyId   = parseInt(req.params.studyId);
      const scenarioId = parseInt(req.params.scenarioId);
      const userId    = (req as any).user?.id;

      // Verify scenario belongs to study
      const scCheck = await client.query('SELECT id FROM hazop_scenarios WHERE id=$1 AND study_id=$2', [scenarioId, studyId]);
      if (!scCheck.rows[0]) return sendNotFound(res, 'Scenario');

      // Collect IPL-flagged response groups already in stack (to avoid duplicates)
      const existing = await client.query(
        'SELECT response_group_id FROM hazop_scenario_ipl_stack WHERE scenario_id=$1 AND response_group_id IS NOT NULL',
        [scenarioId]);
      const existingRgIds = new Set(existing.rows.map((r: any) => r.response_group_id));

      // Get max stack_position
      const posR = await client.query(
        'SELECT COALESCE(MAX(stack_position),0) AS max_pos FROM hazop_scenario_ipl_stack WHERE scenario_id=$1', [scenarioId]);
      let pos = parseInt(posR.rows[0].max_pos);

      // Fetch IPL-flagged response groups for the study (includes CCF group for traceability)
      const rgRows = await client.query(`
        SELECT id, group_number, description, protection_layer, effectiveness_rating,
               human_dependency_level, is_independent_protection_layer, common_cause_group
        FROM hazop_response_groups
        WHERE study_id=$1 AND is_independent_protection_layer=true
        ORDER BY group_number`, [studyId]);

      // Fetch IPL-flagged SIFs (not already represented via response group)
      const sfRows = await client.query(`
        SELECT id, sif_number, sif_description, protection_layer, effectiveness_rating,
               is_independent_protection_layer, response_group_id
        FROM hazop_safety_functions
        WHERE study_id=$1 AND is_independent_protection_layer=true
        ORDER BY sif_number`, [studyId]);

      let added = 0;

      for (const rg of rgRows.rows) {
        if (existingRgIds.has(rg.id)) continue;
        pos++;
        const pfd = getPfdDefault(rg.protection_layer, rg.effectiveness_rating);
        await client.query(`
          INSERT INTO hazop_scenario_ipl_stack
            (study_id, scenario_id, response_group_id, ipl_type, ipl_label,
             protection_layer, is_independent, effectiveness_rating, human_dependency_level,
             pfd_value, pfd_source, credit_applied, ccf_group, stack_position, created_by)
          VALUES ($1,$2,$3,'response_group',$4,$5,$6,$7,$8,$9,'default',true,$10,$11,$12)`,
          [studyId, scenarioId, rg.id,
           `${rg.group_number}${rg.description ? ' — ' + rg.description : ''}`,
           rg.protection_layer, rg.is_independent_protection_layer,
           rg.effectiveness_rating, rg.human_dependency_level,
           pfd, rg.common_cause_group || null, pos, userId]);
        added++;
      }

      // Add SIFs whose response_group_id is not already in the stack via RG
      const existingSfIds = new Set(existing.rows.map((r: any) => r.safety_function_id));
      for (const sf of sfRows.rows) {
        if (existingSfIds.has(sf.id)) continue;
        // Skip if the RG was already added above
        if (sf.response_group_id && existingRgIds.has(sf.response_group_id)) continue;
        pos++;
        const pfd = getPfdDefault(sf.protection_layer, sf.effectiveness_rating);
        await client.query(`
          INSERT INTO hazop_scenario_ipl_stack
            (study_id, scenario_id, safety_function_id, ipl_type, ipl_label,
             protection_layer, is_independent, effectiveness_rating,
             pfd_value, pfd_source, credit_applied, stack_position, created_by)
          VALUES ($1,$2,$3,'safety_function',$4,$5,true,$6,$7,'default',true,$8,$9)`,
          [studyId, scenarioId, sf.id,
           `${sf.sif_number}${sf.sif_description ? ' — ' + sf.sif_description : ''}`,
           sf.protection_layer, sf.effectiveness_rating,
           pfd, pos, userId]);
        added++;
      }

      await client.query('COMMIT');
      res.status(201).json({ added, message: `${added} IPL(s) added to stack` });
    } catch (err) { await client.query('ROLLBACK'); sendError(res, err); }
    finally { client.release(); }
  });

  // ── POST /api/hazop/ipl-stack/items ───────────────────────────────────────
  app.post('/api/hazop/ipl-stack/items', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = (req as any).user?.id;
      const { study_id, scenario_id, ipl_type, ipl_label, protection_layer,
              is_independent, effectiveness_rating, human_dependency_level,
              fail_state, pfd_value, pfd_source, pfd_basis, credit_applied, notes } = req.body;
      if (!study_id || !scenario_id || !ipl_type || !ipl_label || !protection_layer)
        return sendBusinessError(res, 'study_id, scenario_id, ipl_type, ipl_label, protection_layer required', 400);

      const posR = await client.query(
        'SELECT COALESCE(MAX(stack_position),0)+1 AS pos FROM hazop_scenario_ipl_stack WHERE scenario_id=$1', [scenario_id]);
      const pos = posR.rows[0].pos;
      const defaultPfd = pfd_value ?? getPfdDefault(protection_layer, effectiveness_rating ?? null);

      const r = await client.query(`
        INSERT INTO hazop_scenario_ipl_stack
          (study_id, scenario_id, ipl_type, ipl_label, protection_layer,
           is_independent, effectiveness_rating, human_dependency_level,
           fail_state, pfd_value, pfd_source, pfd_basis,
           credit_applied, stack_position, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [study_id, scenario_id, ipl_type, ipl_label, protection_layer,
         is_independent ?? false, effectiveness_rating, human_dependency_level,
         fail_state, defaultPfd, pfd_source ?? 'default', pfd_basis,
         credit_applied ?? true, pos, notes, userId]);
      await client.query('COMMIT');
      res.status(201).json(r.rows[0]);
    } catch (err) { await client.query('ROLLBACK'); sendError(res, err); }
    finally { client.release(); }
  });

  // ── PATCH /api/hazop/ipl-stack/items/:id ──────────────────────────────────
  app.patch('/api/hazop/ipl-stack/items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { pfd_value, pfd_source, pfd_basis, credit_applied,
              effectiveness_rating, notes, ipl_label, stack_position } = req.body;
      const r = await pool.query(`
        UPDATE hazop_scenario_ipl_stack SET
          pfd_value           = COALESCE($1, pfd_value),
          pfd_source          = COALESCE($2, pfd_source),
          pfd_basis           = COALESCE($3, pfd_basis),
          credit_applied      = COALESCE($4, credit_applied),
          effectiveness_rating= COALESCE($5, effectiveness_rating),
          notes               = COALESCE($6, notes),
          ipl_label           = COALESCE($7, ipl_label),
          stack_position      = COALESCE($8, stack_position)
        WHERE id=$9 RETURNING *`,
        [pfd_value, pfd_source, pfd_basis, credit_applied,
         effectiveness_rating, notes, ipl_label, stack_position, id]);
      if (!r.rows[0]) return sendNotFound(res, 'IPL stack item');
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── DELETE /api/hazop/ipl-stack/items/:id ─────────────────────────────────
  app.delete('/api/hazop/ipl-stack/items/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const r = await pool.query('DELETE FROM hazop_scenario_ipl_stack WHERE id=$1 RETURNING id', [id]);
      if (!r.rows[0]) return sendNotFound(res, 'IPL stack item');
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  // ── GET /api/hazop/studies/:studyId/phase5a-summary ───────────────────────
  app.get('/api/hazop/studies/:studyId/phase5a-summary', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const [lopaCount, lopaApproved, lopaGap, iplCount, iplCredited,
             tolerable, requires_sif, uncalculated, scenarioCount] = await Promise.all([
        pool.query('SELECT COUNT(*) AS count FROM hazop_lopa_records WHERE study_id=$1', [studyId]),
        pool.query(`SELECT COUNT(*) AS count FROM hazop_lopa_records WHERE study_id=$1 AND lopa_status='approved'`, [studyId]),
        pool.query(`SELECT COUNT(*) AS count FROM hazop_lopa_records WHERE study_id=$1 AND lopa_outcome IN ('requires_sif','requires_sif_upgrade','gap_exists')`, [studyId]),
        pool.query('SELECT COUNT(*) AS count FROM hazop_scenario_ipl_stack WHERE study_id=$1', [studyId]),
        pool.query('SELECT COUNT(*) AS count FROM hazop_scenario_ipl_stack WHERE study_id=$1 AND credit_applied=true', [studyId]),
        pool.query(`SELECT COUNT(*) AS count FROM hazop_lopa_records WHERE study_id=$1 AND lopa_outcome='tolerable'`, [studyId]),
        pool.query(`SELECT COUNT(*) AS count FROM hazop_lopa_records WHERE study_id=$1 AND lopa_outcome IN ('requires_sif','requires_sif_upgrade')`, [studyId]),
        pool.query('SELECT COUNT(*) AS count FROM hazop_lopa_records WHERE study_id=$1 AND lopa_outcome IS NULL', [studyId]),
        pool.query('SELECT COUNT(*) AS count FROM hazop_scenarios WHERE study_id=$1', [studyId]),
      ]);
      res.json({
        lopa_count:             parseInt(lopaCount.rows[0].count),
        lopa_approved_count:    parseInt(lopaApproved.rows[0].count),
        lopa_gap_count:         parseInt(lopaGap.rows[0].count),
        ipl_item_count:         parseInt(iplCount.rows[0].count),
        ipl_credited_count:     parseInt(iplCredited.rows[0].count),
        tolerable_count:        parseInt(tolerable.rows[0].count),
        requires_sif_count:     parseInt(requires_sif.rows[0].count),
        uncalculated_count:     parseInt(uncalculated.rows[0].count),
        scenario_count:         parseInt(scenarioCount.rows[0].count),
        lopa_coverage_pct: parseInt(scenarioCount.rows[0].count) > 0
          ? Math.round(parseInt(lopaCount.rows[0].count) / parseInt(scenarioCount.rows[0].count) * 100)
          : 0,
      });
    } catch (err) { sendError(res, err); }
  });

  // ── GET /api/hazop/lopa/pfd-defaults (lookup table export) ────────────────
  app.get('/api/hazop/lopa/pfd-defaults', ensureAuthenticated, (_req: Request, res: Response) => {
    const layers = ['SIS','Mechanical','Relief','BPCS','Procedural','Operator'];
    const ratings = ['verified','high','medium','low','critical','none'];
    const result: Record<string, Record<string, number>> = {};
    for (const l of layers) {
      result[l] = {};
      for (const r of ratings) {
        const v = getPfdDefault(l, r);
        result[l][r] = v;
      }
    }
    res.json({ defaults: result, ief_defaults: IEF_DEFAULTS, rttf_defaults: RTTF_DEFAULTS });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 5B — Safety Requirements Specification (SRS)
  // ════════════════════════════════════════════════════════════════════════════

  // PFD default from SIL level
  function pfdFromSil(sil: number): number {
    if (sil >= 4) return 0.0001;
    if (sil === 3) return 0.001;
    if (sil === 2) return 0.01;
    return 0.1; // SIL 1
  }

  // Generate HTML for SRS PDF
  function buildSrsHtml(srs: any, sif: any, lopa: any | null, study: any): string {
    const fmtDate = (v: string | null) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const fmtNum = (v: string | number | null, dec = 6) => v != null ? parseFloat(String(v)).toFixed(dec) : '—';
    const fmtSci = (v: string | number | null) => {
      if (v == null) return '—';
      const n = parseFloat(String(v));
      if (isNaN(n)) return '—';
      return n.toExponential(3);
    };
    const silBg = (s: number) => ['', '#d1fae5', '#fef9c3', '#fee2e2', '#991b1b'][s] ?? '#f3f4f6';
    const silColor = (s: number) => s >= 4 ? '#fff' : '#111';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; background: #fff; }
  .page { padding: 14mm 12mm 12mm 12mm; max-width: 210mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a5f; padding-bottom: 6pt; margin-bottom: 10pt; }
  .header-left h1 { font-size: 15pt; color: #1e3a5f; font-weight: 700; }
  .header-left p { font-size: 8pt; color: #555; margin-top: 2pt; }
  .header-right { text-align: right; font-size: 8pt; color: #555; }
  .badge { display: inline-block; padding: 2pt 8pt; border-radius: 4pt; font-weight: 700; font-size: 9pt; }
  .section { margin-bottom: 10pt; }
  .section-title { font-size: 9pt; font-weight: 700; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.5pt; border-bottom: 1px solid #c7d2e0; padding-bottom: 2pt; margin-bottom: 6pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { background: #f0f4f8; color: #1e3a5f; font-weight: 600; padding: 4pt 6pt; text-align: left; border: 1px solid #d1d5db; }
  td { padding: 4pt 6pt; border: 1px solid #d1d5db; vertical-align: top; }
  .label { color: #555; font-size: 8.5pt; width: 38%; }
  .value { font-weight: 500; }
  .warn { background: #fffbeb; color: #92400e; padding: 4pt 8pt; border-radius: 4pt; font-size: 8.5pt; border: 1px solid #fde68a; margin-bottom: 6pt; }
  .footer { border-top: 1px solid #d1d5db; margin-top: 14pt; padding-top: 6pt; font-size: 7.5pt; color: #888; display: flex; justify-content: space-between; }
  .page-break { page-break-before: always; padding-top: 14mm; }
  .status-chip { display: inline-block; padding: 1pt 6pt; border-radius: 3pt; font-size: 8pt; font-weight: 600; }
  .status-draft { background: #f3f4f6; color: #374151; }
  .status-in_review { background: #dbeafe; color: #1e40af; }
  .status-approved { background: #d1fae5; color: #065f46; }
  .status-superseded { background: #fef3c7; color: #92400e; }
</style>
</head>
<body>
<div class="page">

  <!-- PAGE 1 -->
  <div class="header">
    <div class="header-left">
      <h1>Safety Requirements Specification</h1>
      <p>IEC 61511 SRS Document — THERMOPAC QMS</p>
    </div>
    <div class="header-right">
      <div><strong>${srs.srs_number}</strong></div>
      <div style="margin-top:3pt">
        <span class="status-chip status-${srs.srs_status}">${srs.srs_status.toUpperCase()}</span>
      </div>
      ${srs.baseline_revision ? `<div style="margin-top:3pt;color:#065f46;font-weight:600">${srs.baseline_revision}</div>` : ''}
      <div style="margin-top:4pt">Generated: ${fmtDate(new Date().toISOString())}</div>
    </div>
  </div>

  <!-- Study & SIF identification -->
  <div class="section">
    <div class="section-title">1 — Identification</div>
    <table>
      <tr><td class="label">Study</td><td class="value">${study.study_number ?? ''} — ${study.title ?? ''}</td>
          <td class="label">SIF Number</td><td class="value">${sif.sif_number}</td></tr>
      <tr><td class="label">SIF Description</td><td class="value" colspan="3">${sif.sif_description ?? '—'}</td></tr>
      <tr><td class="label">Linked LOPA</td><td class="value">${lopa ? `${lopa.lopa_number} — ${lopa.lopa_outcome ?? 'not calculated'}` : 'Not linked'}</td>
          <td class="label">SRS Status</td><td class="value">${srs.srs_status}</td></tr>
      ${srs.approved_by_name ? `<tr><td class="label">Approved By</td><td class="value">${srs.approved_by_name}</td>
          <td class="label">Approved At</td><td class="value">${fmtDate(srs.approved_at)}</td></tr>` : ''}
    </table>
  </div>

  <!-- SIL Determination -->
  <div class="section">
    <div class="section-title">2 — SIL Determination</div>
    ${lopa && lopa.required_sil && lopa.required_sil !== srs.sil_required ? `<div class="warn">⚠ SIL mismatch: SRS requires SIL ${srs.sil_required}, but linked LOPA ${lopa.lopa_number} requires SIL ${lopa.required_sil}. Review and resolve before approval.</div>` : ''}
    <table>
      <tr>
        <td class="label">SIL Required</td>
        <td><span class="badge" style="background:${silBg(srs.sil_required)};color:${silColor(srs.sil_required)}">SIL ${srs.sil_required}</span></td>
        <td class="label">SIL Proposed</td>
        <td>${srs.sil_proposed ? `<span class="badge" style="background:${silBg(srs.sil_proposed)};color:${silColor(srs.sil_proposed)}">SIL ${srs.sil_proposed}</span>` : '—'}</td>
      </tr>
      <tr>
        <td class="label">PFD Required</td><td class="value" style="font-family:monospace">${fmtSci(srs.pfd_required)}</td>
        <td class="label">PFD Target</td><td class="value" style="font-family:monospace">${fmtSci(srs.pfd_target)}</td>
      </tr>
      ${lopa ? `<tr>
        <td class="label">LOPA MEF</td><td class="value" style="font-family:monospace">${fmtSci(lopa.achieved_mef_per_year)}</td>
        <td class="label">LOPA Risk Gap</td><td class="value">× ${lopa.risk_gap_ratio ? parseFloat(lopa.risk_gap_ratio).toFixed(3) : '—'}</td>
      </tr>` : ''}
    </table>
  </div>

  <!-- Functional Requirements -->
  <div class="section">
    <div class="section-title">3 — Functional Requirements</div>
    <table>
      <tr><td class="label">Process Demand</td><td class="value" colspan="3">${srs.process_demand_description}</td></tr>
      <tr><td class="label">Safe State</td><td class="value" colspan="3">${srs.safe_state_description}</td></tr>
      <tr>
        <td class="label">Process Input Tag</td><td class="value">${srs.process_input_tag ?? '—'}</td>
        <td class="label">Final Element Tag</td><td class="value">${srs.final_element_tag ?? '—'}</td>
      </tr>
      <tr>
        <td class="label">Final Element Action</td><td class="value">${srs.final_element_action ?? '—'}</td>
        <td class="label">Fail State</td><td class="value">${srs.fail_state ?? '—'}</td>
      </tr>
      <tr>
        <td class="label">Process Safety Time</td><td class="value">${srs.process_safety_time_sec != null ? srs.process_safety_time_sec + ' s' : '—'}</td>
        <td class="label">Response Time Required</td><td class="value">${srs.response_time_required_sec != null ? srs.response_time_required_sec + ' s' : '—'}</td>
      </tr>
      <tr>
        <td class="label">Manual Reset Required</td><td class="value" colspan="3">${srs.manual_reset_required ? 'Yes' : 'No'}</td>
      </tr>
    </table>
  </div>

  <!-- PAGE 2 -->
  <div class="page-break">
    <div class="header">
      <div class="header-left">
        <h1>Safety Requirements Specification</h1>
        <p>${srs.srs_number} — ${sif.sif_number} — Page 2 of 2</p>
      </div>
      <div class="header-right">
        <div>${srs.baseline_revision ?? 'DRAFT'}</div>
        <div style="margin-top:4pt">Generated: ${fmtDate(new Date().toISOString())}</div>
      </div>
    </div>

    <!-- Proof Test -->
    <div class="section">
      <div class="section-title">4 — Proof Test Requirements</div>
      <table>
        <tr>
          <td class="label">Proof Test Interval</td><td class="value">${srs.proof_test_interval_days != null ? srs.proof_test_interval_days + ' days' : '—'}</td>
          <td class="label">Diagnostic Coverage</td><td class="value">${srs.proof_test_coverage != null ? parseFloat(srs.proof_test_coverage).toFixed(1) + '%' : '—'}</td>
        </tr>
        <tr>
          <td class="label">Procedure Reference</td><td class="value" colspan="3">${srs.proof_test_procedure_ref ?? '—'}</td>
        </tr>
      </table>
    </div>

    <!-- Architecture -->
    <div class="section">
      <div class="section-title">5 — Architecture &amp; Hardware</div>
      <table>
        <tr>
          <td class="label">Architecture Type</td><td class="value">${srs.architecture_type ?? '—'}</td>
          <td class="label">Hardware Fault Tolerance</td><td class="value">HFT = ${srs.hardware_fault_tolerance ?? 0}</td>
        </tr>
      </table>
    </div>

    <!-- Notes -->
    ${srs.notes ? `<div class="section">
      <div class="section-title">6 — Notes</div>
      <table><tr><td>${srs.notes}</td></tr></table>
    </div>` : ''}

    <!-- Signature block -->
    <div class="section" style="margin-top:20pt">
      <div class="section-title">7 — Approval Record</div>
      <table>
        <tr><th>Role</th><th>Name</th><th>Signature</th><th>Date</th></tr>
        <tr>
          <td>Prepared by</td>
          <td>${srs.created_by_name ?? '—'}</td>
          <td style="height:20pt"></td>
          <td>${fmtDate(srs.created_at)}</td>
        </tr>
        <tr>
          <td>Approved by</td>
          <td>${srs.approved_by_name ?? '—'}</td>
          <td style="height:20pt"></td>
          <td>${fmtDate(srs.approved_at)}</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <span>IEC 61511 SRS — THERMOPAC QMS — Confidential</span>
      <span>${srs.srs_number} | ${study.study_number ?? 'Study'} | Rev: ${srs.baseline_revision ?? 'DRAFT'}</span>
    </div>
  </div>

</div>
</body>
</html>`;
  }

  // ── GET /api/hazop/studies/:studyId/srs ───────────────────────────────────
  app.get('/api/hazop/studies/:studyId/srs', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const rows = await pool.query(`
        SELECT sr.*,
               sf.sif_number, sf.sif_description, sf.sil_target AS sif_sil_target,
               sf.protection_layer AS sif_protection_layer,
               lr.lopa_number, lr.required_sil AS lopa_required_sil,
               lr.lopa_outcome, lr.lopa_status AS lopa_status_val,
               lr.achieved_mef_per_year,
               u_app.username AS approved_by_name,
               u_cr.username  AS created_by_name,
               CASE WHEN lr.required_sil IS NOT NULL AND lr.required_sil <> sr.sil_required
                    THEN true ELSE false END AS sil_mismatch
        FROM hazop_srs_records sr
        JOIN hazop_safety_functions sf ON sf.id = sr.safety_function_id
        LEFT JOIN hazop_lopa_records lr ON lr.id = sr.lopa_id
        LEFT JOIN users u_app ON u_app.id = sr.approved_by
        LEFT JOIN users u_cr  ON u_cr.id  = sr.created_by
        WHERE sr.study_id = $1
        ORDER BY sr.srs_number`, [studyId]);
      res.json(rows.rows);
    } catch (err) { sendError(res, err); }
  });

  // ── POST /api/hazop/studies/:studyId/srs/extract ──────────────────────────
  app.post('/api/hazop/studies/:studyId/srs/extract', ensureAuthenticated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const studyId = parseInt(req.params.studyId);
      const userId  = (req as any).user?.id;

      // Fetch all SIFs in study without an existing SRS
      const sifs = await client.query(`
        SELECT sf.id, sf.sif_number, sf.sif_description, sf.sil_target,
               sf.process_demand, sf.safety_action, sf.initiator_tag,
               sf.final_element_tag, sf.final_element_action, sf.response_time_sec,
               sf.protection_layer, sf.effectiveness_rating, sf.consequence_severity
        FROM hazop_safety_functions sf
        WHERE sf.study_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM hazop_srs_records sr WHERE sr.safety_function_id = sf.id
          )
        ORDER BY sf.sif_number`, [studyId]);

      // Next SRS number sequence
      const lastNum = await client.query(
        `SELECT srs_number FROM hazop_srs_records WHERE study_id=$1 ORDER BY srs_number DESC LIMIT 1`, [studyId]);
      let seq = lastNum.rows[0]
        ? parseInt((lastNum.rows[0].srs_number as string).replace('SRS-', '')) + 1
        : 1;

      const created: any[] = [];

      for (const sif of sifs.rows) {
        const silRaw = sif.sil_target ? parseInt(sif.sil_target) : 2;
        const silRequired = (silRaw >= 1 && silRaw <= 4) ? silRaw : 2;
        const pfdRequired = pfdFromSil(silRequired);
        const srsNum = `SRS-${String(seq).padStart(3, '0')}`;
        seq++;

        const r = await client.query(`
          INSERT INTO hazop_srs_records
            (study_id, safety_function_id, srs_number,
             sil_required, sil_proposed, pfd_required, pfd_target,
             process_demand_description, safe_state_description,
             process_input_tag, final_element_tag, final_element_action,
             response_time_required_sec,
             srs_status, created_by)
          VALUES ($1,$2,$3,$4,$4,$5,$5,$6,$7,$8,$9,$10,$11,'draft',$12)
          RETURNING *`,
          [studyId, sif.id, srsNum,
           silRequired, pfdRequired,
           sif.process_demand ?? `SIF demand: ${sif.sif_number}`,
           sif.safety_action  ?? `Activate ${sif.sif_number}`,
           sif.initiator_tag, sif.final_element_tag, sif.final_element_action,
           sif.response_time_sec,
           userId]);
        created.push(r.rows[0]);
      }

      const skippedCount = await client.query(
        `SELECT COUNT(*) AS n FROM hazop_safety_functions sf
         WHERE sf.study_id=$1 AND EXISTS (
           SELECT 1 FROM hazop_srs_records sr WHERE sr.safety_function_id=sf.id
         )`, [studyId]);

      await client.query('COMMIT');
      res.status(201).json({
        created: created.length,
        skipped: parseInt(skippedCount.rows[0].n),
        message: `${created.length} SRS record(s) created, ${skippedCount.rows[0].n} SIF(s) already had an SRS`,
        records: created,
      });
    } catch (err) { await client.query('ROLLBACK'); sendError(res, err); }
    finally { client.release(); }
  });

  // ── GET /api/hazop/srs/:id ────────────────────────────────────────────────
  app.get('/api/hazop/srs/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const r = await pool.query(`
        SELECT sr.*,
               sf.sif_number, sf.sif_description, sf.sil_target AS sif_sil_target,
               sf.protection_layer AS sif_protection_layer,
               sf.consequence_severity AS sif_consequence_severity,
               lr.lopa_number, lr.required_sil AS lopa_required_sil,
               lr.lopa_outcome, lr.achieved_mef_per_year,
               lr.risk_gap_ratio, lr.required_additional_pfd,
               lr.lopa_status AS lopa_status_val,
               u_app.username AS approved_by_name,
               u_cr.username  AS created_by_name,
               CASE WHEN lr.required_sil IS NOT NULL AND lr.required_sil <> sr.sil_required
                    THEN true ELSE false END AS sil_mismatch
        FROM hazop_srs_records sr
        JOIN hazop_safety_functions sf ON sf.id = sr.safety_function_id
        LEFT JOIN hazop_lopa_records lr ON lr.id = sr.lopa_id
        LEFT JOIN users u_app ON u_app.id = sr.approved_by
        LEFT JOIN users u_cr  ON u_cr.id  = sr.created_by
        WHERE sr.id = $1`, [id]);
      if (!r.rows[0]) return sendNotFound(res, 'SRS record');
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── PATCH /api/hazop/srs/:id ──────────────────────────────────────────────
  app.patch('/api/hazop/srs/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      // Fetch current record
      const cur = await pool.query('SELECT * FROM hazop_srs_records WHERE id=$1', [id]);
      if (!cur.rows[0]) return sendNotFound(res, 'SRS record');
      const current = cur.rows[0];

      // 409 if approved
      if (current.srs_status === 'approved') {
        return sendBusinessError(res, 'Approved SRS cannot be modified. Raise an MOC to make changes.', 409);
      }

      const {
        lopa_id, sil_required, sil_proposed, pfd_required, pfd_target,
        process_demand_description, safe_state_description,
        process_input_tag, final_element_tag, final_element_action, fail_state,
        process_safety_time_sec, response_time_required_sec, manual_reset_required,
        proof_test_interval_days, proof_test_coverage, proof_test_procedure_ref,
        architecture_type, hardware_fault_tolerance,
        srs_status, notes,
      } = req.body;

      // Validation: pfd_target ≤ pfd_required
      const effectivePfdRequired = pfd_required ?? current.pfd_required;
      const effectivePfdTarget   = pfd_target   ?? current.pfd_target;
      if (effectivePfdTarget != null && effectivePfdRequired != null &&
          parseFloat(effectivePfdTarget) > parseFloat(effectivePfdRequired)) {
        return sendBusinessError(res,
          `pfd_target (${effectivePfdTarget}) must be ≤ pfd_required (${effectivePfdRequired})`, 422);
      }

      // Validation: response_time ≤ process_safety_time
      const effRespTime    = response_time_required_sec ?? current.response_time_required_sec;
      const effProcSfTime  = process_safety_time_sec    ?? current.process_safety_time_sec;
      if (effRespTime != null && effProcSfTime != null && effRespTime > effProcSfTime) {
        return sendBusinessError(res,
          `response_time_required_sec (${effRespTime}s) must be ≤ process_safety_time_sec (${effProcSfTime}s)`, 422);
      }

      const updated = await pool.query(`
        UPDATE hazop_srs_records SET
          lopa_id                    = COALESCE($1,  lopa_id),
          sil_required               = COALESCE($2,  sil_required),
          sil_proposed               = COALESCE($3,  sil_proposed),
          pfd_required               = COALESCE($4,  pfd_required),
          pfd_target                 = COALESCE($5,  pfd_target),
          process_demand_description = COALESCE($6,  process_demand_description),
          safe_state_description     = COALESCE($7,  safe_state_description),
          process_input_tag          = COALESCE($8,  process_input_tag),
          final_element_tag          = COALESCE($9,  final_element_tag),
          final_element_action       = COALESCE($10, final_element_action),
          fail_state                 = COALESCE($11, fail_state),
          process_safety_time_sec    = COALESCE($12, process_safety_time_sec),
          response_time_required_sec = COALESCE($13, response_time_required_sec),
          manual_reset_required      = COALESCE($14, manual_reset_required),
          proof_test_interval_days   = COALESCE($15, proof_test_interval_days),
          proof_test_coverage        = COALESCE($16, proof_test_coverage),
          proof_test_procedure_ref   = COALESCE($17, proof_test_procedure_ref),
          architecture_type          = COALESCE($18, architecture_type),
          hardware_fault_tolerance   = COALESCE($19, hardware_fault_tolerance),
          srs_status                 = COALESCE($20, srs_status),
          notes                      = COALESCE($21, notes)
        WHERE id=$22 RETURNING *`,
        [lopa_id, sil_required, sil_proposed, pfd_required, pfd_target,
         process_demand_description, safe_state_description,
         process_input_tag, final_element_tag, final_element_action, fail_state,
         process_safety_time_sec, response_time_required_sec, manual_reset_required,
         proof_test_interval_days, proof_test_coverage, proof_test_procedure_ref,
         architecture_type, hardware_fault_tolerance,
         srs_status, notes, id]);

      // SIL mismatch warning
      const warnings: string[] = [];
      if (lopa_id || current.lopa_id) {
        const linkedLopaId = lopa_id ?? current.lopa_id;
        const lopaRow = await pool.query('SELECT required_sil, lopa_number FROM hazop_lopa_records WHERE id=$1', [linkedLopaId]);
        if (lopaRow.rows[0]?.required_sil != null) {
          const lopaSil  = lopaRow.rows[0].required_sil;
          const srsSil   = sil_required ?? updated.rows[0].sil_required;
          if (lopaSil !== srsSil) {
            warnings.push(`SIL mismatch: SRS requires SIL ${srsSil}, but linked LOPA ${lopaRow.rows[0].lopa_number} requires SIL ${lopaSil}. Review and resolve before approval.`);
          }
        }
      }

      res.json({ ...updated.rows[0], warnings });
    } catch (err) { sendError(res, err); }
  });

  // ── DELETE /api/hazop/srs/:id ─────────────────────────────────────────────
  app.delete('/api/hazop/srs/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const cur = await pool.query('SELECT srs_status, baseline_revision FROM hazop_srs_records WHERE id=$1', [id]);
      if (!cur.rows[0]) return sendNotFound(res, 'SRS record');
      if (cur.rows[0].srs_status === 'approved' || cur.rows[0].baseline_revision) {
        return sendBusinessError(res, 'Approved or baselined SRS cannot be deleted.', 409);
      }
      await pool.query('DELETE FROM hazop_srs_records WHERE id=$1', [id]);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  // ── POST /api/hazop/srs/:id/set-baseline ──────────────────────────────────
  app.post('/api/hazop/srs/:id/set-baseline', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id     = parseInt(req.params.id);
      const userId = (req as any).user?.id;
      const role   = (req as any).user?.role;

      // Role gate: Superuser, General Manager, Senior Manager only
      const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager'];
      if (!allowedRoles.includes(role)) {
        return sendBusinessError(res, 'Only Superuser, General Manager, or Senior Manager may approve an SRS baseline.', 403);
      }

      const cur = await pool.query('SELECT * FROM hazop_srs_records WHERE id=$1', [id]);
      if (!cur.rows[0]) return sendNotFound(res, 'SRS record');
      const srs = cur.rows[0];

      // Self-approval check
      if (srs.created_by && srs.created_by === userId) {
        return sendBusinessError(res, 'Self-approval is not permitted. The approver must differ from the preparer.', 422);
      }

      // Must not already be approved (unless Superuser re-baselining)
      if (srs.srs_status === 'approved' && role !== 'Superuser') {
        return sendBusinessError(res, 'SRS is already approved. Only Superuser may re-baseline.', 409);
      }

      // Generate next baseline revision for this study
      const lastBl = await pool.query(
        `SELECT baseline_revision FROM hazop_srs_records
         WHERE study_id=$1 AND baseline_revision IS NOT NULL
         ORDER BY baseline_revision DESC LIMIT 1`, [srs.study_id]);
      let nextSeq = 1;
      if (lastBl.rows[0]?.baseline_revision) {
        const m = (lastBl.rows[0].baseline_revision as string).match(/BL-(\d+)/);
        if (m) nextSeq = parseInt(m[1]) + 1;
      }
      const baselineRevision = `BL-${String(nextSeq).padStart(3, '0')}`;

      const updated = await pool.query(`
        UPDATE hazop_srs_records SET
          srs_status        = 'approved',
          baseline_revision = $1,
          approved_by       = $2,
          approved_at       = NOW()
        WHERE id = $3 RETURNING *`,
        [baselineRevision, userId, id]);

      res.json(updated.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ── GET /api/hazop/srs/:id/export-pdf ────────────────────────────────────
  app.get('/api/hazop/srs/:id/export-pdf', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      // Fetch SRS with all joined data
      const r = await pool.query(`
        SELECT sr.*,
               sf.sif_number, sf.sif_description,
               lr.lopa_number, lr.required_sil AS lopa_required_sil,
               lr.lopa_outcome, lr.achieved_mef_per_year, lr.risk_gap_ratio,
               lr.required_additional_pfd,
               st.study_number, st.title AS study_title,
               u_app.username AS approved_by_name,
               u_cr.username  AS created_by_name
        FROM hazop_srs_records sr
        JOIN hazop_safety_functions sf ON sf.id = sr.safety_function_id
        JOIN hazop_studies st ON st.id = sr.study_id
        LEFT JOIN hazop_lopa_records lr ON lr.id = sr.lopa_id
        LEFT JOIN users u_app ON u_app.id = sr.approved_by
        LEFT JOIN users u_cr  ON u_cr.id  = sr.created_by
        WHERE sr.id = $1`, [id]);
      if (!r.rows[0]) return sendNotFound(res, 'SRS record');

      const srs  = r.rows[0];
      const sif  = { sif_number: srs.sif_number, sif_description: srs.sif_description };
      const lopa = srs.lopa_number ? {
        lopa_number: srs.lopa_number, required_sil: srs.lopa_required_sil,
        lopa_outcome: srs.lopa_outcome, achieved_mef_per_year: srs.achieved_mef_per_year,
        risk_gap_ratio: srs.risk_gap_ratio, required_additional_pfd: srs.required_additional_pfd,
      } : null;
      const study = { study_number: srs.study_number, title: srs.study_title };

      // Required field check
      const missing: string[] = [];
      if (!srs.process_demand_description) missing.push('process_demand_description');
      if (!srs.safe_state_description)     missing.push('safe_state_description');
      if (!srs.sil_required)               missing.push('sil_required');
      if (!srs.pfd_required)               missing.push('pfd_required');
      if (missing.length > 0) {
        return sendBusinessError(res,
          `Cannot generate PDF — missing required fields: ${missing.join(', ')}`, 422);
      }

      // Build HTML and render via puppeteer
      const html = buildSrsHtml(srs, sif, lopa, study);

      const puppeteer = await import('puppeteer-core');
      // Reuse chromium path helper approach from dds-pdf-service
      const chromiumPaths = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'];
      const fs = await import('fs');
      const executablePath = chromiumPaths.find(p => fs.existsSync(p)) ?? '/usr/bin/chromium-browser';

      const browser = await puppeteer.default.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        executablePath,
        headless: true,
      });

      let pdfBuffer: Buffer;
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const rawPdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });
        pdfBuffer = Buffer.from(rawPdf);
      } finally {
        await browser.close();
      }

      const filename = `${srs.srs_number}-${srs.sif_number}-${srs.baseline_revision ?? 'DRAFT'}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.end(pdfBuffer);
    } catch (err) { sendError(res, err); }
  });

  // ── GET /api/hazop/studies/:studyId/srs-summary ───────────────────────────
  app.get('/api/hazop/studies/:studyId/srs-summary', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const studyId = parseInt(req.params.studyId);
      const [total, approved, mismatch, sifCount] = await Promise.all([
        pool.query('SELECT COUNT(*) AS n FROM hazop_srs_records WHERE study_id=$1', [studyId]),
        pool.query(`SELECT COUNT(*) AS n FROM hazop_srs_records WHERE study_id=$1 AND srs_status='approved'`, [studyId]),
        pool.query(`
          SELECT COUNT(*) AS n FROM hazop_srs_records sr
          JOIN hazop_lopa_records lr ON lr.id=sr.lopa_id
          WHERE sr.study_id=$1 AND lr.required_sil IS NOT NULL AND lr.required_sil <> sr.sil_required`, [studyId]),
        pool.query('SELECT COUNT(*) AS n FROM hazop_safety_functions WHERE study_id=$1', [studyId]),
      ]);
      res.json({
        srs_count:          parseInt(total.rows[0].n),
        srs_approved_count: parseInt(approved.rows[0].n),
        sil_mismatch_count: parseInt(mismatch.rows[0].n),
        sif_count:          parseInt(sifCount.rows[0].n),
        srs_coverage_pct:   parseInt(sifCount.rows[0].n) > 0
          ? Math.round(parseInt(total.rows[0].n) / parseInt(sifCount.rows[0].n) * 100)
          : 0,
      });
    } catch (err) { sendError(res, err); }
  });

  // ── GET /api/hazop/srs/:id/lopa-candidates ───────────────────────────────
  // Returns all LOPA records for the study, ranked by match score against the SIF.
  // Scoring: SIF in scenario IPL stack (+3) · SIL match (+2) · consequence match (+1)
  app.get('/api/hazop/srs/:id/lopa-candidates', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      // 1. Fetch SRS + SIF attributes
      const srsRow = await pool.query(`
        SELECT sr.study_id, sr.lopa_id AS current_lopa_id,
               sif.id AS sif_id, sif.sil_target,
               sif.response_group_id, sif.consequence_severity, sif.ce_column_id
        FROM hazop_srs_records sr
        JOIN hazop_safety_functions sif ON sif.id = sr.safety_function_id
        WHERE sr.id = $1`, [id]);
      if (!srsRow.rows[0]) return sendNotFound(res, 'SRS record');

      const { study_id, current_lopa_id, sif_id, sil_target,
              response_group_id, consequence_severity } = srsRow.rows[0];

      // 2. Scenarios where this SIF appears in the IPL stack
      const iplScen = await pool.query(
        `SELECT DISTINCT scenario_id FROM hazop_scenario_ipl_stack WHERE safety_function_id = $1`, [sif_id]);
      const iplScenIds: number[] = iplScen.rows.map((r: any) => r.scenario_id);

      // 3. Scenarios linked via shared response group (via response group id on scenarios through LOPA/interlocks)
      const rgScen = response_group_id ? await pool.query(
        `SELECT DISTINCT lr.scenario_id
         FROM hazop_lopa_records lr
         JOIN hazop_scenarios sc ON sc.id = lr.scenario_id
         JOIN hazop_interlocks il ON il.response_group_id = $1 AND il.study_id = $2
         WHERE lr.study_id = $2`, [response_group_id, study_id]) : { rows: [] };
      const rgScenIds: number[] = (rgScen.rows as any[]).map(r => r.scenario_id);

      const allLinkedScenIds = [...new Set([...iplScenIds, ...rgScenIds])];

      // 4. Fetch and score all LOPAs in the study
      const lopas = await pool.query(`
        SELECT lr.id, lr.lopa_number, lr.scenario_id, lr.required_sil,
               lr.lopa_outcome, lr.lopa_status, lr.consequence_category,
               sc.scenario_number, sc.title AS scenario_title,
               sc.consequence_severity AS scenario_consequence
        FROM hazop_lopa_records lr
        JOIN hazop_scenarios sc ON sc.id = lr.scenario_id
        WHERE lr.study_id = $1
        ORDER BY lr.lopa_number`, [study_id]);

      const scored = lopas.rows.map((lr: any) => {
        const reasons: string[] = [];
        let score = 0;

        // IPL stack match — strongest signal
        if (iplScenIds.includes(lr.scenario_id)) {
          score += 3;
          reasons.push('SIF appears in this scenario\'s IPL stack');
        }
        // Response group match via linked scenario
        if (rgScenIds.includes(lr.scenario_id) && !iplScenIds.includes(lr.scenario_id)) {
          score += 2;
          reasons.push('Shared response group with this scenario');
        }
        // SIL match
        if (sil_target && lr.required_sil != null && String(lr.required_sil) === String(sil_target)) {
          score += 2;
          reasons.push(`SIL target matches (SIL ${lr.required_sil})`);
        }
        // Consequence severity match
        if (consequence_severity &&
            (lr.consequence_category === consequence_severity ||
             lr.scenario_consequence === consequence_severity)) {
          score += 1;
          reasons.push(`Consequence severity matches (${consequence_severity})`);
        }

        return {
          ...lr,
          match_score: score,
          match_reasons: reasons,
          is_current: lr.id === current_lopa_id,
          is_suggested: score >= 2,
        };
      });

      // Sort: suggested first (score desc), then alphabetically
      scored.sort((a: any, b: any) =>
        b.match_score - a.match_score || a.lopa_number.localeCompare(b.lopa_number));

      res.json({
        candidates: scored,
        sif_scenario_ids: iplScenIds,
        current_lopa_id,
      });
    } catch (err) { sendError(res, err); }
  });

  // ── GET /api/hazop/srs/:id/traceability ──────────────────────────────────
  // Full lifecycle chain: Scenario → LOPA → SIF → Interlock
  app.get('/api/hazop/srs/:id/traceability', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      const r = await pool.query(`
        SELECT
          -- SRS
          sr.srs_number, sr.srs_status, sr.baseline_revision,
          -- SIF
          sif.sif_number, sif.sif_description, sif.sil_target AS sif_sil_target,
          sif.response_group_id, sif.protection_layer AS sif_protection_layer,
          sif.consequence_severity AS sif_consequence_severity,
          -- LOPA (linked)
          lr.lopa_number, lr.lopa_outcome, lr.required_sil AS lopa_required_sil,
          lr.lopa_status AS lopa_status_val, lr.scenario_id AS lopa_scenario_id,
          -- Scenario from LOPA
          sc_lopa.scenario_number AS lopa_scenario_number,
          sc_lopa.title           AS lopa_scenario_title,
          sc_lopa.consequence_severity AS lopa_scenario_consequence,
          -- Event group from LOPA scenario
          eg.group_number AS event_group_number,
          eg.group_name   AS event_group_name,
          -- Response group from SIF
          rg.group_number  AS response_group_number,
          rg.group_name    AS response_group_name,
          rg.protection_layer AS response_group_layer,
          -- Best scenario from IPL stack (if no LOPA linked)
          sc_ipl.scenario_number AS ipl_scenario_number,
          sc_ipl.title           AS ipl_scenario_title,
          -- Interlock sharing this response group
          il.interlock_number, il.description AS interlock_description,
          il.sil_level AS interlock_sil, il.interlock_type,
          il.criticality_class AS interlock_criticality
        FROM hazop_srs_records sr
        JOIN hazop_safety_functions sif ON sif.id = sr.safety_function_id
        LEFT JOIN hazop_lopa_records lr ON lr.id = sr.lopa_id
        LEFT JOIN hazop_scenarios sc_lopa ON sc_lopa.id = lr.scenario_id
        LEFT JOIN hazop_event_groups eg ON eg.id = sc_lopa.initiating_event_group_id
        LEFT JOIN hazop_response_groups rg ON rg.id = sif.response_group_id
        LEFT JOIN LATERAL (
          SELECT sc2.scenario_number, sc2.title
          FROM hazop_scenario_ipl_stack ipl2
          JOIN hazop_scenarios sc2 ON sc2.id = ipl2.scenario_id
          WHERE ipl2.safety_function_id = sif.id
          ORDER BY sc2.scenario_number
          LIMIT 1
        ) sc_ipl ON true
        LEFT JOIN LATERAL (
          SELECT il2.interlock_number, il2.description, il2.sil_level,
                 il2.interlock_type, il2.criticality_class
          FROM hazop_interlocks il2
          WHERE il2.response_group_id = sif.response_group_id
            AND il2.study_id = sr.study_id
          ORDER BY il2.interlock_number
          LIMIT 1
        ) il ON true
        WHERE sr.id = $1`, [id]);

      if (!r.rows[0]) return sendNotFound(res, 'SRS record');

      const row = r.rows[0];

      // Determine best scenario to show (prefer LOPA-linked; fall back to IPL stack)
      const scenario = row.lopa_scenario_number
        ? { number: row.lopa_scenario_number, title: row.lopa_scenario_title, source: 'lopa' }
        : row.ipl_scenario_number
          ? { number: row.ipl_scenario_number, title: row.ipl_scenario_title, source: 'ipl_stack' }
          : null;

      res.json({
        srs:      { number: row.srs_number, status: row.srs_status, baseline: row.baseline_revision },
        sif:      { number: row.sif_number, description: row.sif_description, sil_target: row.sif_sil_target,
                    protection_layer: row.sif_protection_layer, consequence_severity: row.sif_consequence_severity },
        lopa:     row.lopa_number ? { number: row.lopa_number, outcome: row.lopa_outcome,
                    required_sil: row.lopa_required_sil, status: row.lopa_status_val } : null,
        scenario,
        event_group: row.event_group_number
          ? { number: row.event_group_number, name: row.event_group_name } : null,
        response_group: row.response_group_number
          ? { number: row.response_group_number, name: row.response_group_name,
              layer: row.response_group_layer } : null,
        interlock: row.interlock_number
          ? { number: row.interlock_number, description: row.interlock_description,
              sil: row.interlock_sil, type: row.interlock_type,
              criticality: row.interlock_criticality } : null,
      });
    } catch (err) { sendError(res, err); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 5A END / PHASE 5B END
  // ════════════════════════════════════════════════════════════════════════════
}
