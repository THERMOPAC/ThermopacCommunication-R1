/**
 * PPPC Routes — Phase 0
 * ─────────────────────
 * Master reference table APIs:
 *   buy_groups  ·  buy_subgroups  ·  uom_master
 *
 * All endpoints are behind:
 *   • ensureAuthenticated
 *   • requirePageAccess('buy-list-control')
 *
 * Write endpoints (POST / PATCH) additionally require role ≥ Senior Manager.
 *
 * Registered via: setupPppcRoutes(app) called from server/routes.ts
 */

import express, { Request, Response } from 'express';
import { pool } from './db';
import { ensureAuthenticated } from './auth-middleware';
import { requirePageAccess } from './utils/permission-utils';
import { sendError, sendValidationError, sendNotFound, sendPermissionError } from './utils/error-response';
import { canManage } from '@shared/roles';
import { seedPppcMasterData, validateSubgroupBelongsToGroup } from './utils/pppc-services';

// ─── Role guard helper ────────────────────────────────────────────────────────
function requireSeniorManager(req: Request, res: Response): boolean {
  const role = (req.user as any)?.role;
  if (!canManage(role, 'Manager')) {
    sendPermissionError(res, 'Senior Manager or above is required for this action.');
    return false;
  }
  return true;
}

// ─── Route setup (called from routes.ts) ─────────────────────────────────────
export async function setupPppcRoutes(app: express.Express): Promise<void> {

  // Seed master data on start (idempotent — safe to call every boot)
  await seedPppcMasterData(pool);

  const PAGE = requirePageAccess('buy-list-control');

  // ═══════════════════════════════════════════════════════════════════════════
  // BUY GROUPS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/buy-groups — list all buy groups (optionally filter by isActive)
  app.get('/api/buy-groups', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const onlyActive = req.query.active !== 'false';
      const result = await pool.query(
        `SELECT id, code, label, sort_order, is_active, created_at, updated_at
         FROM buy_groups
         ${onlyActive ? 'WHERE is_active = true' : ''}
         ORDER BY sort_order, code`,
      );
      res.json(result.rows);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /api/buy-groups/:id — single buy group with its subgroups
  app.get('/api/buy-groups/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid buy group id');

      const grpResult = await pool.query(
        `SELECT id, code, label, sort_order, is_active, created_at, updated_at
         FROM buy_groups WHERE id = $1`,
        [id],
      );
      if (grpResult.rowCount === 0) return sendNotFound(res, 'Buy group', id);

      const subResult = await pool.query(
        `SELECT id, buy_group_id, code, label, sort_order, is_active
         FROM buy_subgroups WHERE buy_group_id = $1 ORDER BY sort_order, code`,
        [id],
      );

      res.json({ ...grpResult.rows[0], subgroups: subResult.rows });
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /api/buy-groups — create a new buy group
  app.post('/api/buy-groups', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;

      const { code, label, sortOrder } = req.body;
      if (!code || !label) return sendValidationError(res, 'code and label are required');
      if (!/^[A-Z0-9_-]{1,40}$/.test(code)) {
        return sendValidationError(res, 'code must be 1–40 chars, uppercase letters/digits/hyphens/underscores only');
      }

      const result = await pool.query(
        `INSERT INTO buy_groups (code, label, sort_order, is_active, updated_at)
         VALUES ($1, $2, $3, true, NOW())
         RETURNING *`,
        [code.trim(), label.trim(), parseInt(sortOrder) || 0],
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') return sendValidationError(res, `Buy group code '${req.body.code}' already exists`);
      sendError(res, err);
    }
  });

  // PATCH /api/buy-groups/:id — update label / sortOrder / isActive
  app.patch('/api/buy-groups/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;

      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid buy group id');

      const existing = await pool.query(`SELECT id FROM buy_groups WHERE id = $1`, [id]);
      if (existing.rowCount === 0) return sendNotFound(res, 'Buy group', id);

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (req.body.label !== undefined)     { fields.push(`label = $${idx++}`);      values.push(req.body.label.trim()); }
      if (req.body.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(parseInt(req.body.sortOrder)); }
      if (req.body.isActive !== undefined)  { fields.push(`is_active = $${idx++}`);  values.push(Boolean(req.body.isActive)); }

      if (fields.length === 0) return sendValidationError(res, 'No updatable fields provided');

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await pool.query(
        `UPDATE buy_groups SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values,
      );
      res.json(result.rows[0]);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BUY SUBGROUPS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/buy-groups/:groupId/subgroups — subgroups for a specific group
  app.get('/api/buy-groups/:groupId/subgroups', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.params.groupId);
      if (isNaN(groupId)) return sendValidationError(res, 'Invalid buy group id');

      const grpCheck = await pool.query(`SELECT id FROM buy_groups WHERE id = $1`, [groupId]);
      if (grpCheck.rowCount === 0) return sendNotFound(res, 'Buy group', groupId);

      const onlyActive = req.query.active !== 'false';
      const result = await pool.query(
        `SELECT id, buy_group_id, code, label, sort_order, is_active, created_at, updated_at
         FROM buy_subgroups
         WHERE buy_group_id = $1 ${onlyActive ? 'AND is_active = true' : ''}
         ORDER BY sort_order, code`,
        [groupId],
      );
      res.json(result.rows);
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /api/buy-subgroups — create a new subgroup under a group
  app.post('/api/buy-subgroups', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;

      const { buyGroupId, code, label, sortOrder } = req.body;
      if (!buyGroupId || !code || !label) {
        return sendValidationError(res, 'buyGroupId, code, and label are required');
      }
      if (!/^[A-Z0-9_-]{1,60}$/.test(code)) {
        return sendValidationError(res, 'code must be 1–60 chars, uppercase letters/digits/hyphens/underscores only');
      }

      const grpCheck = await pool.query(`SELECT id FROM buy_groups WHERE id = $1`, [buyGroupId]);
      if (grpCheck.rowCount === 0) return sendNotFound(res, 'Buy group', buyGroupId);

      const result = await pool.query(
        `INSERT INTO buy_subgroups (buy_group_id, code, label, sort_order, is_active, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW())
         RETURNING *`,
        [buyGroupId, code.trim(), label.trim(), parseInt(sortOrder) || 0],
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      sendError(res, err);
    }
  });

  // PATCH /api/buy-subgroups/:id — update label / sortOrder / isActive
  app.patch('/api/buy-subgroups/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;

      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid subgroup id');

      const existing = await pool.query(`SELECT id, buy_group_id FROM buy_subgroups WHERE id = $1`, [id]);
      if (existing.rowCount === 0) return sendNotFound(res, 'Buy subgroup', id);

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (req.body.label !== undefined)     { fields.push(`label = $${idx++}`);      values.push(req.body.label.trim()); }
      if (req.body.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(parseInt(req.body.sortOrder)); }
      if (req.body.isActive !== undefined)  { fields.push(`is_active = $${idx++}`);  values.push(Boolean(req.body.isActive)); }

      if (fields.length === 0) return sendValidationError(res, 'No updatable fields provided');

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await pool.query(
        `UPDATE buy_subgroups SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values,
      );
      res.json(result.rows[0]);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UOM MASTER
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/uom-master — list all UOMs (optionally filter by active / category)
  app.get('/api/uom-master', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const conditions: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (req.query.active !== 'false') {
        conditions.push(`is_active = true`);
      }
      if (req.query.category) {
        conditions.push(`category = $${idx++}`);
        values.push(req.query.category);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await pool.query(
        `SELECT id, code, label, category, is_active, sort_order, created_at
         FROM uom_master ${where}
         ORDER BY sort_order, code`,
        values,
      );
      res.json(result.rows);
    } catch (err) {
      sendError(res, err);
    }
  });

  // GET /api/uom-master/:id — single UOM
  app.get('/api/uom-master/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid UOM id');

      const result = await pool.query(
        `SELECT id, code, label, category, is_active, sort_order, created_at FROM uom_master WHERE id = $1`,
        [id],
      );
      if (result.rowCount === 0) return sendNotFound(res, 'UOM', id);
      res.json(result.rows[0]);
    } catch (err) {
      sendError(res, err);
    }
  });

  // POST /api/uom-master — create a new UOM
  app.post('/api/uom-master', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;

      const { code, label, category, sortOrder } = req.body;
      if (!code || !label) return sendValidationError(res, 'code and label are required');
      if (!/^[A-Z0-9_/]{1,20}$/.test(code)) {
        return sendValidationError(res, 'code must be 1–20 chars, uppercase letters/digits/underscores/slashes only');
      }

      const result = await pool.query(
        `INSERT INTO uom_master (code, label, category, sort_order, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING *`,
        [code.trim(), label.trim(), category?.trim() || null, parseInt(sortOrder) || 0],
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') return sendValidationError(res, `UOM code '${req.body.code}' already exists`);
      sendError(res, err);
    }
  });

  // PATCH /api/uom-master/:id — update label / category / sortOrder / isActive
  app.patch('/api/uom-master/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;

      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid UOM id');

      const existing = await pool.query(`SELECT id FROM uom_master WHERE id = $1`, [id]);
      if (existing.rowCount === 0) return sendNotFound(res, 'UOM', id);

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (req.body.label !== undefined)     { fields.push(`label = $${idx++}`);     values.push(req.body.label.trim()); }
      if (req.body.category !== undefined)  { fields.push(`category = $${idx++}`);  values.push(req.body.category?.trim() || null); }
      if (req.body.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(parseInt(req.body.sortOrder)); }
      if (req.body.isActive !== undefined)  { fields.push(`is_active = $${idx++}`);  values.push(Boolean(req.body.isActive)); }

      if (fields.length === 0) return sendValidationError(res, 'No updatable fields provided');

      values.push(id);
      const result = await pool.query(
        `UPDATE uom_master SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values,
      );
      res.json(result.rows[0]);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY — subgroup membership check (exposed for front-end debug only)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/buy-groups/:groupId/subgroups/:subgroupId/validate
  app.get(
    '/api/buy-groups/:groupId/subgroups/:subgroupId/validate',
    ensureAuthenticated, PAGE,
    async (req: Request, res: Response) => {
      try {
        const groupId    = parseInt(req.params.groupId);
        const subgroupId = parseInt(req.params.subgroupId);
        if (isNaN(groupId) || isNaN(subgroupId)) return sendValidationError(res, 'Invalid id parameters');

        const valid = await validateSubgroupBelongsToGroup(pool, groupId, subgroupId);
        res.json({ valid });
      } catch (err) {
        sendError(res, err);
      }
    },
  );

  console.log('[PPPC] ✅ Phase 0 routes registered (buy-groups · buy-subgroups · uom-master)');
}
