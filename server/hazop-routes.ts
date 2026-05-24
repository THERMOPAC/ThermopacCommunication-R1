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
}
