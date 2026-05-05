/**
 * PPPC Routes — Phase 0 + Phase 1
 * ─────────────────────────────────
 * Phase 0: buy_groups · buy_subgroups · uom_master
 * Phase 1: buy_package_headers · buy_package_lines
 *
 * All endpoints require:
 *   • ensureAuthenticated
 *   • requirePageAccess('buy-list-control')
 *
 * Write role guards:
 *   • requireSeniorManager  → Superuser / GM / Senior Manager (canManage > Manager)
 *   • requireManager        → + Manager (role level ≤ 3)
 */

import express, { Request, Response } from 'express';
import { pool } from './db';
import { ensureAuthenticated } from './auth-middleware';
import { requirePageAccess } from './utils/permission-utils';
import {
  sendError, sendValidationError, sendNotFound,
  sendPermissionError, sendBusinessError,
} from './utils/error-response';
import { canManage, roleHierarchy } from '@shared/roles';
import { seedPppcMasterData, validateSubgroupBelongsToGroup } from './utils/pppc-services';
import { agentEventBus } from './agents/framework/event-bus';

// ─── Role guard helpers ───────────────────────────────────────────────────────

function requireSeniorManager(req: Request, res: Response): boolean {
  const role = (req.user as any)?.role;
  if (!canManage(role, 'Manager')) {
    sendPermissionError(res, 'Senior Manager or above required for this action.');
    return false;
  }
  return true;
}

function requireManager(req: Request, res: Response): boolean {
  const role = (req.user as any)?.role;
  const level = roleHierarchy[role] ?? 999;
  if (level > roleHierarchy['Manager']) {
    sendPermissionError(res, 'Manager or above required for this action.');
    return false;
  }
  return true;
}

// ─── Route setup (called from routes.ts) ─────────────────────────────────────
export async function setupPppcRoutes(app: express.Express): Promise<void> {

  await seedPppcMasterData(pool);

  const PAGE = requirePageAccess('buy-list-control');

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 0 — BUY GROUPS
  // ═══════════════════════════════════════════════════════════════════════════

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
    } catch (err) { sendError(res, err); }
  });

  app.get('/api/buy-groups/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid buy group id');
      const grp = await pool.query(
        `SELECT id, code, label, sort_order, is_active, created_at, updated_at FROM buy_groups WHERE id = $1`, [id],
      );
      if (grp.rowCount === 0) return sendNotFound(res, 'Buy group', id);
      const subs = await pool.query(
        `SELECT id, buy_group_id, code, label, sort_order, is_active FROM buy_subgroups WHERE buy_group_id = $1 ORDER BY sort_order, code`, [id],
      );
      res.json({ ...grp.rows[0], subgroups: subs.rows });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/buy-groups', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const { code, label, sortOrder } = req.body;
      if (!code || !label) return sendValidationError(res, 'code and label are required');
      if (!/^[A-Z0-9_-]{1,40}$/.test(code))
        return sendValidationError(res, 'code must be 1–40 chars, uppercase letters/digits/hyphens/underscores only');
      const result = await pool.query(
        `INSERT INTO buy_groups (code, label, sort_order, is_active, updated_at) VALUES ($1,$2,$3,true,NOW()) RETURNING *`,
        [code.trim(), label.trim(), parseInt(sortOrder) || 0],
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') return sendValidationError(res, `Buy group code '${req.body.code}' already exists`);
      sendError(res, err);
    }
  });

  app.patch('/api/buy-groups/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid buy group id');
      const existing = await pool.query(`SELECT id FROM buy_groups WHERE id = $1`, [id]);
      if (existing.rowCount === 0) return sendNotFound(res, 'Buy group', id);
      const fields: string[] = []; const values: unknown[] = []; let idx = 1;
      if (req.body.label !== undefined)     { fields.push(`label = $${idx++}`);      values.push(req.body.label.trim()); }
      if (req.body.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(parseInt(req.body.sortOrder)); }
      if (req.body.isActive !== undefined)  { fields.push(`is_active = $${idx++}`);  values.push(Boolean(req.body.isActive)); }
      if (fields.length === 0) return sendValidationError(res, 'No updatable fields provided');
      fields.push(`updated_at = NOW()`); values.push(id);
      const result = await pool.query(`UPDATE buy_groups SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 0 — BUY SUBGROUPS
  // ═══════════════════════════════════════════════════════════════════════════

  app.get('/api/buy-groups/:groupId/subgroups', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.params.groupId);
      if (isNaN(groupId)) return sendValidationError(res, 'Invalid buy group id');
      const grpCheck = await pool.query(`SELECT id FROM buy_groups WHERE id = $1`, [groupId]);
      if (grpCheck.rowCount === 0) return sendNotFound(res, 'Buy group', groupId);
      const onlyActive = req.query.active !== 'false';
      const result = await pool.query(
        `SELECT id, buy_group_id, code, label, sort_order, is_active, created_at, updated_at
         FROM buy_subgroups WHERE buy_group_id = $1 ${onlyActive ? 'AND is_active = true' : ''} ORDER BY sort_order, code`,
        [groupId],
      );
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/buy-subgroups', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const { buyGroupId, code, label, sortOrder } = req.body;
      if (!buyGroupId || !code || !label) return sendValidationError(res, 'buyGroupId, code, and label are required');
      if (!/^[A-Z0-9_-]{1,60}$/.test(code))
        return sendValidationError(res, 'code must be 1–60 chars, uppercase letters/digits/hyphens/underscores only');
      const grpCheck = await pool.query(`SELECT id FROM buy_groups WHERE id = $1`, [buyGroupId]);
      if (grpCheck.rowCount === 0) return sendNotFound(res, 'Buy group', buyGroupId);
      const result = await pool.query(
        `INSERT INTO buy_subgroups (buy_group_id, code, label, sort_order, is_active, updated_at) VALUES ($1,$2,$3,$4,true,NOW()) RETURNING *`,
        [buyGroupId, code.trim(), label.trim(), parseInt(sortOrder) || 0],
      );
      res.status(201).json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  app.patch('/api/buy-subgroups/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid subgroup id');
      const existing = await pool.query(`SELECT id FROM buy_subgroups WHERE id = $1`, [id]);
      if (existing.rowCount === 0) return sendNotFound(res, 'Buy subgroup', id);
      const fields: string[] = []; const values: unknown[] = []; let idx = 1;
      if (req.body.label !== undefined)     { fields.push(`label = $${idx++}`);      values.push(req.body.label.trim()); }
      if (req.body.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(parseInt(req.body.sortOrder)); }
      if (req.body.isActive !== undefined)  { fields.push(`is_active = $${idx++}`);  values.push(Boolean(req.body.isActive)); }
      if (fields.length === 0) return sendValidationError(res, 'No updatable fields provided');
      fields.push(`updated_at = NOW()`); values.push(id);
      const result = await pool.query(`UPDATE buy_subgroups SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 0 — UOM MASTER
  // ═══════════════════════════════════════════════════════════════════════════

  app.get('/api/uom-master', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const conditions: string[] = []; const values: unknown[] = []; let idx = 1;
      if (req.query.active !== 'false') conditions.push(`is_active = true`);
      if (req.query.category) { conditions.push(`category = $${idx++}`); values.push(req.query.category); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await pool.query(
        `SELECT id, code, label, category, is_active, sort_order, created_at FROM uom_master ${where} ORDER BY sort_order, code`,
        values,
      );
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  app.get('/api/uom-master/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid UOM id');
      const result = await pool.query(
        `SELECT id, code, label, category, is_active, sort_order, created_at FROM uom_master WHERE id = $1`, [id],
      );
      if (result.rowCount === 0) return sendNotFound(res, 'UOM', id);
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/uom-master', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const { code, label, category, sortOrder } = req.body;
      if (!code || !label) return sendValidationError(res, 'code and label are required');
      if (!/^[A-Z0-9_/]{1,20}$/.test(code))
        return sendValidationError(res, 'code must be 1–20 chars, uppercase letters/digits/underscores/slashes only');
      const result = await pool.query(
        `INSERT INTO uom_master (code, label, category, sort_order, is_active) VALUES ($1,$2,$3,$4,true) RETURNING *`,
        [code.trim(), label.trim(), category?.trim() || null, parseInt(sortOrder) || 0],
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') return sendValidationError(res, `UOM code '${req.body.code}' already exists`);
      sendError(res, err);
    }
  });

  app.patch('/api/uom-master/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid UOM id');
      const existing = await pool.query(`SELECT id FROM uom_master WHERE id = $1`, [id]);
      if (existing.rowCount === 0) return sendNotFound(res, 'UOM', id);
      const fields: string[] = []; const values: unknown[] = []; let idx = 1;
      if (req.body.label !== undefined)     { fields.push(`label = $${idx++}`);     values.push(req.body.label.trim()); }
      if (req.body.category !== undefined)  { fields.push(`category = $${idx++}`);  values.push(req.body.category?.trim() || null); }
      if (req.body.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(parseInt(req.body.sortOrder)); }
      if (req.body.isActive !== undefined)  { fields.push(`is_active = $${idx++}`);  values.push(Boolean(req.body.isActive)); }
      if (fields.length === 0) return sendValidationError(res, 'No updatable fields provided');
      values.push(id);
      const result = await pool.query(`UPDATE uom_master SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // UTILITY — subgroup membership check
  app.get('/api/buy-groups/:groupId/subgroups/:subgroupId/validate', ensureAuthenticated, PAGE,
    async (req: Request, res: Response) => {
      try {
        const groupId    = parseInt(req.params.groupId);
        const subgroupId = parseInt(req.params.subgroupId);
        if (isNaN(groupId) || isNaN(subgroupId)) return sendValidationError(res, 'Invalid id parameters');
        const valid = await validateSubgroupBelongsToGroup(pool, groupId, subgroupId);
        res.json({ valid });
      } catch (err) { sendError(res, err); }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — BUY PACKAGE HEADERS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/buy-packages/generate-code?productId=X — auto-generate next package code
  app.get('/api/buy-packages/generate-code', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.query.productId as string);
      if (isNaN(productId)) return sendValidationError(res, 'productId query param required');

      const prodRow = await pool.query(
        `SELECT product_code FROM products WHERE id = $1`,
        [productId],
      );
      if (prodRow.rowCount === 0) return sendNotFound(res, 'Product', productId);

      const rawCode: string = prodRow.rows[0].product_code ?? '';
      // Clean: uppercase, replace spaces→hyphens, strip non-alphanumeric-non-hyphen, max 18 chars
      const slug = rawCode
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 22)
        .replace(/-$/g, '');

      // Count how many packages exist for this product already (to compute next seq)
      const countRow = await pool.query(
        `SELECT COUNT(*)::int AS n FROM buy_package_headers WHERE product_id = $1`,
        [productId],
      );
      let seq = (countRow.rows[0].n ?? 0) + 1;

      // Find a code that doesn't collide (in case of gaps)
      let candidate = `BPK-${slug}-${String(seq).padStart(3, '0')}`;
      while (true) {
        const clash = await pool.query(
          `SELECT 1 FROM buy_package_headers WHERE package_code = $1`,
          [candidate],
        );
        if (clash.rowCount === 0) break;
        seq++;
        candidate = `BPK-${slug}-${String(seq).padStart(3, '0')}`;
      }

      res.json({ packageCode: candidate });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/buy-packages — list with product info + line count
  app.get('/api/buy-packages', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const conditions: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (req.query.status) {
        conditions.push(`bph.status = $${idx++}`);
        values.push(req.query.status);
      }
      if (req.query.productId) {
        conditions.push(`bph.product_id = $${idx++}`);
        values.push(parseInt(req.query.productId as string));
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT
           bph.id, bph.product_id, bph.package_code, bph.name, bph.description,
           bph.version, bph.status, bph.is_active, bph.created_by, bph.created_at, bph.updated_at,
           p.product_code, p.description AS product_description, p.item_family,
           COUNT(bpl.id)::int AS line_count
         FROM buy_package_headers bph
         JOIN products p ON p.id = bph.product_id
         LEFT JOIN buy_package_lines bpl ON bpl.buy_package_header_id = bph.id
         ${where}
         GROUP BY bph.id, p.product_code, p.description, p.item_family
         ORDER BY bph.created_at DESC`,
        values,
      );
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // GET /api/buy-packages/:id — single package with full line details
  app.get('/api/buy-packages/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid package id');

      const hdr = await pool.query(
        `SELECT bph.*, p.product_code, p.description AS product_description
         FROM buy_package_headers bph
         JOIN products p ON p.id = bph.product_id
         WHERE bph.id = $1`,
        [id],
      );
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy package', id);

      const lines = await pool.query(
        `SELECT bpl.*,
           bg.code AS buy_group_code, bg.label AS buy_group_label,
           bs.code AS buy_subgroup_code, bs.label AS buy_subgroup_label,
           u.code AS uom_code, u.label AS uom_label
         FROM buy_package_lines bpl
         JOIN buy_groups bg ON bg.id = bpl.buy_group_id
         JOIN buy_subgroups bs ON bs.id = bpl.buy_subgroup_id
         JOIN uom_master u ON u.id = bpl.uom_id
         WHERE bpl.buy_package_header_id = $1
         ORDER BY bpl.sort_order, bpl.line_number`,
        [id],
      );

      res.json({ ...hdr.rows[0], lines: lines.rows });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-packages — create header (Manager+)
  app.post('/api/buy-packages', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;

      const { productId, packageCode, name, description } = req.body;
      if (!productId || !packageCode || !name)
        return sendValidationError(res, 'productId, packageCode, and name are required');

      const productCheck = await pool.query(`SELECT id FROM products WHERE id = $1`, [productId]);
      if (productCheck.rowCount === 0) return sendNotFound(res, 'Product', productId);

      // Auto version: max(version) + 1 for same product, or 1
      const verResult = await pool.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM buy_package_headers WHERE product_id = $1`,
        [productId],
      );
      const version = verResult.rows[0].next_version;

      const createdBy = (req.user as any)?.id ?? null;

      const result = await pool.query(
        `INSERT INTO buy_package_headers
           (product_id, package_code, name, description, version, status, is_active, created_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'draft', true, $6, NOW())
         RETURNING *`,
        [productId, packageCode.trim().toUpperCase(), name.trim(), description?.trim() || null, version, createdBy],
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') return sendValidationError(res, `Package code '${req.body.packageCode}' already exists`);
      sendError(res, err);
    }
  });

  // PATCH /api/buy-packages/:id — edit header (Manager+, draft only)
  app.patch('/api/buy-packages/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid package id');

      const existing = await pool.query(`SELECT id, status FROM buy_package_headers WHERE id = $1`, [id]);
      if (existing.rowCount === 0) return sendNotFound(res, 'Buy package', id);
      if (existing.rows[0].status !== 'draft')
        return sendBusinessError(res, 'Only draft packages can be edited.');

      const fields: string[] = []; const values: unknown[] = []; let idx = 1;
      if (req.body.name !== undefined)        { fields.push(`name = $${idx++}`);        values.push(req.body.name.trim()); }
      if (req.body.description !== undefined) { fields.push(`description = $${idx++}`); values.push(req.body.description?.trim() || null); }
      if (fields.length === 0) return sendValidationError(res, 'No updatable fields provided');
      fields.push(`updated_at = NOW()`); values.push(id);
      const result = await pool.query(`UPDATE buy_package_headers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-packages/:id/activate — draft → active (Senior Manager+)
  // Business rule: requires ≥1 line. Supersedes (archives) any existing active package for same product.
  app.post('/api/buy-packages/:id/activate', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid package id');

      const existing = await pool.query(`SELECT id, status, product_id FROM buy_package_headers WHERE id = $1`, [id]);
      if (existing.rowCount === 0) return sendNotFound(res, 'Buy package', id);
      const pkg = existing.rows[0];
      if (pkg.status !== 'draft') return sendBusinessError(res, 'Only draft packages can be activated.');

      const lineCount = await pool.query(
        `SELECT COUNT(*) FROM buy_package_lines WHERE buy_package_header_id = $1`, [id],
      );
      if (parseInt(lineCount.rows[0].count) === 0)
        return sendBusinessError(res, 'Package must have at least one line before activating.');

      // Supersede any existing active package for this product
      await pool.query(
        `UPDATE buy_package_headers
         SET status = 'archived', is_active = false, updated_at = NOW()
         WHERE product_id = $1 AND status = 'active' AND id != $2`,
        [pkg.product_id, id],
      );

      const result = await pool.query(
        `UPDATE buy_package_headers SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *`, [id],
      );
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-packages/:id/archive — active → archived (Senior Manager+)
  app.post('/api/buy-packages/:id/archive', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid package id');

      const existing = await pool.query(`SELECT id, status FROM buy_package_headers WHERE id = $1`, [id]);
      if (existing.rowCount === 0) return sendNotFound(res, 'Buy package', id);
      if (existing.rows[0].status !== 'active') return sendBusinessError(res, 'Only active packages can be archived.');

      const result = await pool.query(
        `UPDATE buy_package_headers SET status = 'archived', is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`, [id],
      );
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — BUY PACKAGE LINES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/buy-packages/:id/lines — lines with group/subgroup/UOM labels
  app.get('/api/buy-packages/:id/lines', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid package id');

      const hdrCheck = await pool.query(`SELECT id FROM buy_package_headers WHERE id = $1`, [id]);
      if (hdrCheck.rowCount === 0) return sendNotFound(res, 'Buy package', id);

      const result = await pool.query(
        `SELECT bpl.*,
           bg.code AS buy_group_code, bg.label AS buy_group_label,
           bs.code AS buy_subgroup_code, bs.label AS buy_subgroup_label,
           u.code AS uom_code, u.label AS uom_label
         FROM buy_package_lines bpl
         JOIN buy_groups bg ON bg.id = bpl.buy_group_id
         JOIN buy_subgroups bs ON bs.id = bpl.buy_subgroup_id
         JOIN uom_master u ON u.id = bpl.uom_id
         WHERE bpl.buy_package_header_id = $1
         ORDER BY bpl.sort_order, bpl.line_number`,
        [id],
      );
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-packages/:id/lines — add line (Manager+, draft only)
  app.post('/api/buy-packages/:id/lines', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const headerId = parseInt(req.params.id);
      if (isNaN(headerId)) return sendValidationError(res, 'Invalid package id');

      const hdr = await pool.query(`SELECT id, status FROM buy_package_headers WHERE id = $1`, [headerId]);
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy package', headerId);
      if (hdr.rows[0].status !== 'draft') return sendBusinessError(res, 'Lines can only be added to draft packages.');

      const {
        buyGroupId, buySubgroupId, uomId, genericRequirement,
        defaultQuantity, defaultSpecification, technicalAttributes,
        selectionRequired, datasheetRequired, inspectionRequired,
        certificateRequired, complianceRequired, notes, sortOrder,
      } = req.body;

      if (!buyGroupId || !buySubgroupId || !uomId || !genericRequirement)
        return sendValidationError(res, 'buyGroupId, buySubgroupId, uomId, and genericRequirement are required');

      // Validate subgroup belongs to group (API layer)
      const valid = await validateSubgroupBelongsToGroup(pool, buyGroupId, buySubgroupId);
      if (!valid) return sendValidationError(res, 'buySubgroupId does not belong to the specified buyGroupId');

      // Validate UOM exists
      const uomCheck = await pool.query(`SELECT id FROM uom_master WHERE id = $1`, [uomId]);
      if (uomCheck.rowCount === 0) return sendNotFound(res, 'UOM', uomId);

      // Auto line_number: max + 1 for this package
      const lineNumResult = await pool.query(
        `SELECT COALESCE(MAX(line_number), 0) + 1 AS next_line FROM buy_package_lines WHERE buy_package_header_id = $1`,
        [headerId],
      );
      const lineNumber = lineNumResult.rows[0].next_line;

      const result = await pool.query(
        `INSERT INTO buy_package_lines (
           buy_package_header_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
           generic_requirement, default_quantity, default_specification, technical_attributes,
           selection_required, datasheet_required, inspection_required,
           certificate_required, compliance_required, notes, sort_order, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
         RETURNING *`,
        [
          headerId, lineNumber, buyGroupId, buySubgroupId, uomId,
          genericRequirement.trim(),
          defaultQuantity ?? 1,
          defaultSpecification?.trim() || null,
          technicalAttributes ? JSON.stringify(technicalAttributes) : null,
          selectionRequired !== false,
          Boolean(datasheetRequired),
          Boolean(inspectionRequired),
          Boolean(certificateRequired),
          Boolean(complianceRequired),
          notes?.trim() || null,
          parseInt(sortOrder) || 0,
        ],
      );
      res.status(201).json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // PATCH /api/buy-package-lines/:id — edit line (Manager+, draft package only)
  app.patch('/api/buy-package-lines/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid line id');

      const line = await pool.query(
        `SELECT bpl.*, bph.status FROM buy_package_lines bpl
         JOIN buy_package_headers bph ON bph.id = bpl.buy_package_header_id
         WHERE bpl.id = $1`,
        [id],
      );
      if (line.rowCount === 0) return sendNotFound(res, 'Buy package line', id);
      if (line.rows[0].status !== 'draft') return sendBusinessError(res, 'Lines can only be edited on draft packages.');

      const fields: string[] = []; const values: unknown[] = []; let idx = 1;
      const b = req.body;

      // If group or subgroup changes, re-validate membership
      const newGroupId    = b.buyGroupId    !== undefined ? b.buyGroupId    : line.rows[0].buy_group_id;
      const newSubgroupId = b.buySubgroupId !== undefined ? b.buySubgroupId : line.rows[0].buy_subgroup_id;

      if (b.buyGroupId !== undefined || b.buySubgroupId !== undefined) {
        const valid = await validateSubgroupBelongsToGroup(pool, newGroupId, newSubgroupId);
        if (!valid) return sendValidationError(res, 'buySubgroupId does not belong to the specified buyGroupId');
      }

      if (b.buyGroupId !== undefined)           { fields.push(`buy_group_id = $${idx++}`);          values.push(b.buyGroupId); }
      if (b.buySubgroupId !== undefined)         { fields.push(`buy_subgroup_id = $${idx++}`);       values.push(b.buySubgroupId); }
      if (b.uomId !== undefined)                 { fields.push(`uom_id = $${idx++}`);                values.push(b.uomId); }
      if (b.genericRequirement !== undefined)    { fields.push(`generic_requirement = $${idx++}`);   values.push(b.genericRequirement.trim()); }
      if (b.defaultQuantity !== undefined)       { fields.push(`default_quantity = $${idx++}`);      values.push(b.defaultQuantity); }
      if (b.defaultSpecification !== undefined)  { fields.push(`default_specification = $${idx++}`); values.push(b.defaultSpecification?.trim() || null); }
      if (b.technicalAttributes !== undefined)   { fields.push(`technical_attributes = $${idx++}`);  values.push(JSON.stringify(b.technicalAttributes)); }
      if (b.selectionRequired !== undefined)     { fields.push(`selection_required = $${idx++}`);    values.push(Boolean(b.selectionRequired)); }
      if (b.datasheetRequired !== undefined)     { fields.push(`datasheet_required = $${idx++}`);    values.push(Boolean(b.datasheetRequired)); }
      if (b.inspectionRequired !== undefined)    { fields.push(`inspection_required = $${idx++}`);   values.push(Boolean(b.inspectionRequired)); }
      if (b.certificateRequired !== undefined)   { fields.push(`certificate_required = $${idx++}`);  values.push(Boolean(b.certificateRequired)); }
      if (b.complianceRequired !== undefined)    { fields.push(`compliance_required = $${idx++}`);   values.push(Boolean(b.complianceRequired)); }
      if (b.notes !== undefined)                 { fields.push(`notes = $${idx++}`);                 values.push(b.notes?.trim() || null); }
      if (b.sortOrder !== undefined)             { fields.push(`sort_order = $${idx++}`);            values.push(parseInt(b.sortOrder)); }

      if (fields.length === 0) return sendValidationError(res, 'No updatable fields provided');
      fields.push(`updated_at = NOW()`); values.push(id);
      const result = await pool.query(`UPDATE buy_package_lines SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // DELETE /api/buy-package-lines/:id — delete line (Manager+, draft package only)
  app.delete('/api/buy-package-lines/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid line id');

      const line = await pool.query(
        `SELECT bpl.id, bph.status FROM buy_package_lines bpl
         JOIN buy_package_headers bph ON bph.id = bpl.buy_package_header_id
         WHERE bpl.id = $1`,
        [id],
      );
      if (line.rowCount === 0) return sendNotFound(res, 'Buy package line', id);
      if (line.rows[0].status !== 'draft') return sendBusinessError(res, 'Lines can only be deleted from draft packages.');

      await pool.query(`DELETE FROM buy_package_lines WHERE id = $1`, [id]);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — PROJECT BUY PROCUREMENT LIST
  // ═══════════════════════════════════════════════════════════════════════════

  // ── List-number generator ─────────────────────────────────────────────────
  async function generateListNumber(projectId: number): Promise<string> {
    const proj = await pool.query(
      `SELECT fy_code, project_seq FROM projects WHERE id = $1`, [projectId],
    );
    if (proj.rowCount === 0) throw new Error('Project not found');
    const { fy_code, project_seq } = proj.rows[0];
    const countRow = await pool.query(
      `SELECT COUNT(*)::int AS n FROM project_buy_list_headers WHERE project_id = $1`, [projectId],
    );
    let seq = (countRow.rows[0].n ?? 0) + 1;
    let candidate = `${fy_code}-${project_seq}-BPL-${String(seq).padStart(3, '0')}`;
    while (true) {
      const clash = await pool.query(
        `SELECT 1 FROM project_buy_list_headers WHERE list_number = $1`, [candidate],
      );
      if (clash.rowCount === 0) break;
      seq++;
      candidate = `${fy_code}-${project_seq}-BPL-${String(seq).padStart(3, '0')}`;
    }
    return candidate;
  }

  // GET /api/projects/:projectId/buy-lists
  app.get('/api/projects/:projectId/buy-lists', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid projectId');
      const allRevisions = req.query.allRevisions === 'true';
      const status = req.query.status as string | undefined;
      const conditions: string[] = ['h.project_id = $1'];
      const values: unknown[] = [projectId];
      let idx = 2;
      if (!allRevisions) { conditions.push('h.is_current = true'); }
      if (status) { conditions.push(`h.status = $${idx++}`); values.push(status); }
      const result = await pool.query(
        `SELECT h.*,
           pi.description AS project_item_description, pi.item_code AS project_item_code,
           pi.make_or_buy,
           pkg.package_code AS source_package_code, pkg.name AS source_package_name,
           u_c.username AS created_by_name,
           u_s.username AS submitted_by_name,
           u_r.username AS reviewed_by_name,
           u_rel.username AS released_by_name,
           COUNT(l.id)::int AS line_count,
           SUM(CASE WHEN l.tag_no = '' OR l.equipment_reference = '' OR l.service_description = '' THEN 1 ELSE 0 END)::int AS incomplete_lines
         FROM project_buy_list_headers h
         LEFT JOIN project_items pi ON pi.id = h.project_item_id
         LEFT JOIN buy_package_headers pkg ON pkg.id = h.source_package_id
         LEFT JOIN users u_c ON u_c.id = h.created_by
         LEFT JOIN users u_s ON u_s.id = h.submitted_by
         LEFT JOIN users u_r ON u_r.id = h.reviewed_by
         LEFT JOIN users u_rel ON u_rel.id = h.released_by
         LEFT JOIN project_buy_list_lines l ON l.buy_list_header_id = h.id
         WHERE ${conditions.join(' AND ')}
         GROUP BY h.id, pi.description, pi.item_code, pi.make_or_buy,
                  pkg.package_code, pkg.name, u_c.username, u_s.username, u_r.username, u_rel.username
         ORDER BY h.created_at DESC`,
        values,
      );
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // GET /api/buy-lists/:id
  app.get('/api/buy-lists/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const result = await pool.query(
        `SELECT h.*,
           pi.description AS project_item_description, pi.item_code AS project_item_code,
           pkg.package_code AS source_package_code, pkg.name AS source_package_name,
           u_c.username AS created_by_name, u_s.username AS submitted_by_name,
           u_r.username AS reviewed_by_name, u_rel.username AS released_by_name
         FROM project_buy_list_headers h
         LEFT JOIN project_items pi ON pi.id = h.project_item_id
         LEFT JOIN buy_package_headers pkg ON pkg.id = h.source_package_id
         LEFT JOIN users u_c ON u_c.id = h.created_by
         LEFT JOIN users u_s ON u_s.id = h.submitted_by
         LEFT JOIN users u_r ON u_r.id = h.reviewed_by
         LEFT JOIN users u_rel ON u_rel.id = h.released_by
         WHERE h.id = $1`,
        [id],
      );
      if (result.rowCount === 0) return sendNotFound(res, 'Buy list', id);
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // POST /api/projects/:projectId/buy-lists
  app.post('/api/projects/:projectId/buy-lists', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid projectId');
      const { projectItemId, sourcePackageId } = req.body;
      if (!projectItemId) return sendValidationError(res, 'projectItemId is required');
      const userId = (req.user as any)?.id;

      const listNumber = await generateListNumber(projectId);

      let insertId: number;
      if (sourcePackageId) {
        // Copy lines from package
        const pkgCheck = await pool.query(
          `SELECT id, status FROM buy_package_headers WHERE id = $1`, [sourcePackageId],
        );
        if (pkgCheck.rowCount === 0) return sendNotFound(res, 'Source package', sourcePackageId);

        const hdr = await pool.query(
          `INSERT INTO project_buy_list_headers
             (project_id, project_item_id, source_package_id, list_number, created_by)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [projectId, projectItemId, sourcePackageId, listNumber, userId],
        );
        insertId = hdr.rows[0].id;

        const pkgLines = await pool.query(
          `SELECT * FROM buy_package_lines WHERE buy_package_header_id = $1 ORDER BY line_number`,
          [sourcePackageId],
        );
        for (let i = 0; i < pkgLines.rows.length; i++) {
          const pl = pkgLines.rows[i];
          await pool.query(
            `INSERT INTO project_buy_list_lines
               (buy_list_header_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
                generic_requirement, quantity, specification, technical_attributes,
                selection_required, datasheet_required, inspection_required,
                certificate_required, compliance_required, source_package_line_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              insertId, i + 1, pl.buy_group_id, pl.buy_subgroup_id, pl.uom_id,
              pl.generic_requirement, pl.default_quantity, pl.default_specification,
              pl.technical_attributes,
              pl.selection_required, pl.datasheet_required, pl.inspection_required,
              pl.certificate_required, pl.compliance_required, pl.id,
            ],
          );
        }
      } else {
        const hdr = await pool.query(
          `INSERT INTO project_buy_list_headers
             (project_id, project_item_id, list_number, created_by)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [projectId, projectItemId, listNumber, userId],
        );
        insertId = hdr.rows[0].id;
      }

      const created = await pool.query(`SELECT * FROM project_buy_list_headers WHERE id = $1`, [insertId]);
      res.status(201).json(created.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // PATCH /api/buy-lists/:id
  app.patch('/api/buy-lists/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const hdr = await pool.query(`SELECT status FROM project_buy_list_headers WHERE id = $1`, [id]);
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy list', id);
      if (hdr.rows[0].status !== 'draft') return sendBusinessError(res, 'Only draft buy lists can be edited.');
      const { revisionNotes } = req.body;
      await pool.query(
        `UPDATE project_buy_list_headers SET revision_notes=$1, updated_at=NOW() WHERE id=$2`,
        [revisionNotes ?? null, id],
      );
      const updated = await pool.query(`SELECT * FROM project_buy_list_headers WHERE id=$1`, [id]);
      res.json(updated.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-lists/:id/submit-for-review
  app.post('/api/buy-lists/:id/submit-for-review', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const hdr = await pool.query(`SELECT * FROM project_buy_list_headers WHERE id=$1`, [id]);
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy list', id);
      if (hdr.rows[0].status !== 'draft') return sendBusinessError(res, 'Only draft lists can be submitted.');

      // Must have at least 1 line
      const lineCount = await pool.query(
        `SELECT COUNT(*)::int AS n FROM project_buy_list_lines WHERE buy_list_header_id=$1`, [id],
      );
      if (lineCount.rows[0].n === 0) return sendBusinessError(res, 'Cannot submit: buy list has no lines.');

      // All lines must have tag_no, equipment_reference, service_description
      const incomplete = await pool.query(
        `SELECT id, line_number FROM project_buy_list_lines
         WHERE buy_list_header_id=$1 AND (tag_no='' OR equipment_reference='' OR service_description='')`,
        [id],
      );
      if (incomplete.rowCount! > 0) {
        return sendBusinessError(res,
          `Cannot submit: ${incomplete.rowCount} line(s) missing tag_no, equipment_reference, or service_description. ` +
          `Lines: ${incomplete.rows.map((r: any) => r.line_number).join(', ')}`,
        );
      }

      const userId = (req.user as any)?.id;
      await pool.query(
        `UPDATE project_buy_list_headers SET status='under_review', submitted_by=$1, submitted_at=NOW(),
          submission_note=$2, updated_at=NOW() WHERE id=$3`,
        [userId, req.body.submissionNote ?? null, id],
      );
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-lists/:id/revert-to-draft
  app.post('/api/buy-lists/:id/revert-to-draft', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const hdr = await pool.query(`SELECT status FROM project_buy_list_headers WHERE id=$1`, [id]);
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy list', id);
      if (hdr.rows[0].status !== 'under_review') return sendBusinessError(res, 'Only under_review lists can be reverted.');
      await pool.query(
        `UPDATE project_buy_list_headers SET status='draft',
          reviewed_by=NULL, reviewed_at=NULL, review_note=NULL, review_recommendation=NULL,
          updated_at=NOW() WHERE id=$1`,
        [id],
      );
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-lists/:id/review
  app.post('/api/buy-lists/:id/review', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const hdr = await pool.query(`SELECT status, submitted_by FROM project_buy_list_headers WHERE id=$1`, [id]);
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy list', id);
      if (hdr.rows[0].status !== 'under_review') return sendBusinessError(res, 'Only under_review lists can be reviewed.');
      const userId = (req.user as any)?.id;
      if (hdr.rows[0].submitted_by === userId) return sendBusinessError(res, 'Submitter cannot be the reviewer.');
      const { recommendation, reviewNote } = req.body;
      const VALID_RECS = ['approve', 'reject', 'approve_with_comments'];
      if (!VALID_RECS.includes(recommendation)) return sendValidationError(res, 'Invalid recommendation value.');
      await pool.query(
        `UPDATE project_buy_list_headers SET reviewed_by=$1, reviewed_at=NOW(),
          review_note=$2, review_recommendation=$3, updated_at=NOW() WHERE id=$4`,
        [userId, reviewNote ?? null, recommendation, id],
      );
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-lists/:id/release
  app.post('/api/buy-lists/:id/release', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const hdr = await pool.query(
        `SELECT h.status, h.reviewed_by, p.cost_lock_status
         FROM project_buy_list_headers h
         JOIN projects p ON p.id = h.project_id
         WHERE h.id=$1`,
        [id],
      );
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy list', id);
      const { status, reviewed_by, cost_lock_status } = hdr.rows[0];
      if (status !== 'under_review') return sendBusinessError(res, 'Only under_review lists can be released.');
      if (!reviewed_by) return sendBusinessError(res, 'List must be reviewed before release.');
      if (cost_lock_status === 'locked') return sendBusinessError(res, 'Project is cost-locked.');
      const userId = (req.user as any)?.id;
      await pool.query(
        `UPDATE project_buy_list_headers SET status='released', released_by=$1, released_at=NOW(),
          release_note=$2, updated_at=NOW() WHERE id=$3`,
        [userId, req.body.releaseNote ?? null, id],
      );
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-lists/:id/lock
  app.post('/api/buy-lists/:id/lock', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const hdr = await pool.query(
        `SELECT h.status, p.cost_lock_status FROM project_buy_list_headers h
         JOIN projects p ON p.id = h.project_id WHERE h.id=$1`,
        [id],
      );
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy list', id);
      if (hdr.rows[0].status !== 'released') return sendBusinessError(res, 'Only released lists can be locked.');
      if (hdr.rows[0].cost_lock_status === 'locked') return sendBusinessError(res, 'Project is cost-locked.');
      await pool.query(
        `UPDATE project_buy_list_headers SET status='locked', updated_at=NOW() WHERE id=$1`, [id],
      );
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-lists/:id/cancel
  app.post('/api/buy-lists/:id/cancel', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const hdr = await pool.query(`SELECT status FROM project_buy_list_headers WHERE id=$1`, [id]);
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy list', id);
      const { status } = hdr.rows[0];
      if (!['draft', 'under_review'].includes(status))
        return sendBusinessError(res, 'Released lists cannot be cancelled — use supersede instead.');
      const { cancelReason } = req.body;
      if (!cancelReason?.trim()) return sendValidationError(res, 'cancelReason is required.');
      const userId = (req.user as any)?.id;
      await pool.query(
        `UPDATE project_buy_list_headers SET status='canceled', cancelled_by=$1,
          cancelled_at=NOW(), cancel_reason=$2, is_current=false, updated_at=NOW() WHERE id=$3`,
        [userId, cancelReason.trim(), id],
      );
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-lists/:id/supersede
  app.post('/api/buy-lists/:id/supersede', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const hdr = await pool.query(`SELECT * FROM project_buy_list_headers WHERE id=$1`, [id]);
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy list', id);
      const old = hdr.rows[0];
      if (!['released', 'locked'].includes(old.status))
        return sendBusinessError(res, 'Only released or locked lists can be superseded.');
      if (!old.is_current) return sendBusinessError(res, 'List is already superseded.');
      const { supersessionReason } = req.body;
      if (!supersessionReason?.trim()) return sendValidationError(res, 'supersessionReason is required.');

      // Advance revision code: A→B→C…
      const nextRevCode = String.fromCharCode(old.revision_code.charCodeAt(0) + 1);
      const userId = (req.user as any)?.id;
      const listNumber = await generateListNumber(old.project_id);

      // Create new draft successor
      const newHdr = await pool.query(
        `INSERT INTO project_buy_list_headers
           (project_id, project_item_id, source_package_id, list_number, revision_code,
            is_current, status, supersedes_id, created_by)
         VALUES ($1,$2,$3,$4,$5,true,'draft',$6,$7) RETURNING id`,
        [old.project_id, old.project_item_id, old.source_package_id, listNumber,
         nextRevCode, id, userId],
      );
      const newId = newHdr.rows[0].id;

      // Mark old as superseded
      await pool.query(
        `UPDATE project_buy_list_headers SET status='superseded', is_current=false,
          superseded_by=$1, superseded_at=NOW(), supersession_reason=$2, updated_at=NOW()
         WHERE id=$3`,
        [newId, supersessionReason.trim(), id],
      );

      // Deep-copy lines to new header
      const lines = await pool.query(
        `SELECT * FROM project_buy_list_lines WHERE buy_list_header_id=$1 ORDER BY line_number`, [id],
      );
      for (const l of lines.rows) {
        await pool.query(
          `INSERT INTO project_buy_list_lines
             (buy_list_header_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
              generic_requirement, quantity, required_date, specification, technical_attributes,
              tag_no, equipment_reference, service_description,
              selection_required, datasheet_required, inspection_required,
              certificate_required, compliance_required, source_package_line_id, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [
            newId, l.line_number, l.buy_group_id, l.buy_subgroup_id, l.uom_id,
            l.generic_requirement, l.quantity, l.required_date, l.specification, l.technical_attributes,
            l.tag_no, l.equipment_reference, l.service_description,
            l.selection_required, l.datasheet_required, l.inspection_required,
            l.certificate_required, l.compliance_required, l.source_package_line_id, l.notes,
          ],
        );
      }

      res.status(201).json({ newBuyListId: newId, listNumber });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/buy-lists/:id/lines
  app.get('/api/buy-lists/:id/lines', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const result = await pool.query(
        `SELECT l.*,
           bg.code AS buy_group_code, bg.label AS buy_group_label,
           bs.code AS buy_subgroup_code, bs.label AS buy_subgroup_label,
           u.code AS uom_code, u.label AS uom_label
         FROM project_buy_list_lines l
         JOIN buy_groups bg ON bg.id = l.buy_group_id
         JOIN buy_subgroups bs ON bs.id = l.buy_subgroup_id
         JOIN uom_master u ON u.id = l.uom_id
         WHERE l.buy_list_header_id=$1
         ORDER BY l.line_number`,
        [id],
      );
      res.json(result.rows);
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-lists/:id/lines
  app.post('/api/buy-lists/:id/lines', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const headerId = parseInt(req.params.id);
      if (isNaN(headerId)) return sendValidationError(res, 'Invalid id');
      const hdr = await pool.query(`SELECT status FROM project_buy_list_headers WHERE id=$1`, [headerId]);
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy list', headerId);
      if (hdr.rows[0].status !== 'draft') return sendBusinessError(res, 'Lines can only be added to draft lists.');

      const {
        buyGroupId, buySubgroupId, uomId, genericRequirement,
        quantity, requiredDate, specification, technicalAttributes,
        tagNo, equipmentReference, serviceDescription,
        selectionRequired, datasheetRequired, inspectionRequired,
        certificateRequired, complianceRequired, notes,
      } = req.body;
      if (!buyGroupId || !buySubgroupId || !uomId || !genericRequirement)
        return sendValidationError(res, 'buyGroupId, buySubgroupId, uomId, genericRequirement are required.');

      const valid = await validateSubgroupBelongsToGroup(pool, parseInt(buyGroupId), parseInt(buySubgroupId));
      if (!valid) return sendValidationError(res, 'buySubgroupId does not belong to the specified buyGroupId.');

      const maxLine = await pool.query(
        `SELECT COALESCE(MAX(line_number),0)::int AS m FROM project_buy_list_lines WHERE buy_list_header_id=$1`, [headerId],
      );
      const lineNumber = maxLine.rows[0].m + 1;

      const result = await pool.query(
        `INSERT INTO project_buy_list_lines
           (buy_list_header_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
            generic_requirement, quantity, required_date, specification, technical_attributes,
            tag_no, equipment_reference, service_description,
            selection_required, datasheet_required, inspection_required,
            certificate_required, compliance_required, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING *`,
        [
          headerId, lineNumber, buyGroupId, buySubgroupId, uomId,
          genericRequirement, quantity ?? 1, requiredDate ?? null, specification ?? null,
          technicalAttributes ? JSON.stringify(technicalAttributes) : null,
          tagNo ?? '', equipmentReference ?? '', serviceDescription ?? '',
          selectionRequired ?? true, datasheetRequired ?? false, inspectionRequired ?? false,
          certificateRequired ?? false, complianceRequired ?? false, notes ?? null,
        ],
      );
      res.status(201).json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // PATCH /api/buy-list-lines/:id
  app.patch('/api/buy-list-lines/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const line = await pool.query(
        `SELECT l.id, h.status, l.buy_group_id FROM project_buy_list_lines l
         JOIN project_buy_list_headers h ON h.id = l.buy_list_header_id WHERE l.id=$1`,
        [id],
      );
      if (line.rowCount === 0) return sendNotFound(res, 'Buy list line', id);
      if (line.rows[0].status !== 'draft') return sendBusinessError(res, 'Lines can only be edited on draft lists.');

      if (req.body.buySubgroupId && req.body.buyGroupId) {
        const valid = await validateSubgroupBelongsToGroup(pool, parseInt(req.body.buyGroupId), parseInt(req.body.buySubgroupId));
        if (!valid) return sendValidationError(res, 'buySubgroupId does not belong to the specified buyGroupId.');
      }

      const fields: string[] = []; const vals: unknown[] = []; let idx = 1;
      const updatable: Record<string, string> = {
        buyGroupId: 'buy_group_id', buySubgroupId: 'buy_subgroup_id', uomId: 'uom_id',
        genericRequirement: 'generic_requirement', quantity: 'quantity',
        requiredDate: 'required_date', specification: 'specification',
        technicalAttributes: 'technical_attributes',
        tagNo: 'tag_no', equipmentReference: 'equipment_reference',
        serviceDescription: 'service_description',
        selectionRequired: 'selection_required', datasheetRequired: 'datasheet_required',
        inspectionRequired: 'inspection_required', certificateRequired: 'certificate_required',
        complianceRequired: 'compliance_required', notes: 'notes',
      };
      for (const [key, col] of Object.entries(updatable)) {
        if (req.body[key] !== undefined) {
          fields.push(`${col}=$${idx++}`);
          vals.push(key === 'technicalAttributes' ? JSON.stringify(req.body[key]) : req.body[key]);
        }
      }
      if (fields.length === 0) return sendValidationError(res, 'No updatable fields provided.');
      fields.push(`updated_at=NOW()`);
      vals.push(id);
      const result = await pool.query(
        `UPDATE project_buy_list_lines SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, vals,
      );
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // DELETE /api/buy-list-lines/:id
  app.delete('/api/buy-list-lines/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const line = await pool.query(
        `SELECT l.id, h.status FROM project_buy_list_lines l
         JOIN project_buy_list_headers h ON h.id = l.buy_list_header_id WHERE l.id=$1`,
        [id],
      );
      if (line.rowCount === 0) return sendNotFound(res, 'Buy list line', id);
      if (line.rows[0].status !== 'draft') return sendBusinessError(res, 'Lines can only be deleted from draft lists.');
      await pool.query(`DELETE FROM project_buy_list_lines WHERE id=$1`, [id]);
      res.json({ success: true });
    } catch (err) { sendError(res, err); }
  });

  // ── Offer→Project hook: auto-create buy list when a project item is added ──
  // Fires when project.item.added is emitted (from project-routes.ts after item creation).
  // If the project has source_offer_id and the item belongs to a product with an active
  // buy package, automatically creates a buy list seeded from that package.
  agentEventBus.subscribe('project.item.added', async (payload: any) => {
    try {
      const { projectId, projectItemId } = payload ?? {};
      if (!projectId || !projectItemId) return;

      // Check project has source_offer_id and no existing buy list for this item
      const projRow = await pool.query(
        `SELECT id, source_offer_id, fy_code, project_seq
         FROM projects WHERE id = $1 AND source_offer_id IS NOT NULL`,
        [projectId],
      );
      if (projRow.rowCount === 0) return;  // not an offer-backed project

      const already = await pool.query(
        `SELECT 1 FROM project_buy_list_headers WHERE project_id=$1 AND project_item_id=$2 AND is_current=true`,
        [projectId, projectItemId],
      );
      if (already.rowCount! > 0) return;  // already has a buy list

      // Get the project item to find its product_id (via bp_code or product_code)
      const piRow = await pool.query(
        `SELECT pi.bp_code, pi.product_code, pi.item_id
         FROM project_items pi WHERE pi.id = $1`,
        [projectItemId],
      );
      if (piRow.rowCount === 0) return;
      const pi = piRow.rows[0];

      // Find the active buy package matching this item's product
      let pkgRow: any = null;
      if (pi.bp_code) {
        const r = await pool.query(
          `SELECT bph.id FROM buy_package_headers bph
           JOIN products p ON p.id = bph.product_id
           WHERE p.bp_code = $1 AND bph.status = 'active'
           ORDER BY bph.version DESC LIMIT 1`,
          [pi.bp_code],
        );
        if (r.rowCount! > 0) pkgRow = r.rows[0];
      }
      if (!pkgRow && pi.product_code) {
        const r = await pool.query(
          `SELECT bph.id FROM buy_package_headers bph
           JOIN products p ON p.id = bph.product_id
           WHERE p.code = $1 AND bph.status = 'active'
           ORDER BY bph.version DESC LIMIT 1`,
          [pi.product_code],
        );
        if (r.rowCount! > 0) pkgRow = r.rows[0];
      }
      if (!pkgRow) return;  // no active buy package for this product

      // Generate list number
      const { fy_code, project_seq } = projRow.rows[0];
      const countRow = await pool.query(
        `SELECT COUNT(*)::int AS n FROM project_buy_list_headers WHERE project_id = $1`, [projectId],
      );
      let seq = (countRow.rows[0].n ?? 0) + 1;
      let listNumber = `${fy_code}-${project_seq}-BPL-${String(seq).padStart(3, '0')}`;
      while (true) {
        const clash = await pool.query(
          `SELECT 1 FROM project_buy_list_headers WHERE list_number = $1`, [listNumber],
        );
        if (clash.rowCount === 0) break;
        seq++;
        listNumber = `${fy_code}-${project_seq}-BPL-${String(seq).padStart(3, '0')}`;
      }

      // Create buy list header
      const hdr = await pool.query(
        `INSERT INTO project_buy_list_headers
           (project_id, project_item_id, source_package_id, list_number)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [projectId, projectItemId, pkgRow.id, listNumber],
      );
      const newId = hdr.rows[0].id;

      // Copy package lines
      const pkgLines = await pool.query(
        `SELECT * FROM buy_package_lines WHERE buy_package_header_id = $1 ORDER BY line_number`,
        [pkgRow.id],
      );
      for (let i = 0; i < pkgLines.rows.length; i++) {
        const pl = pkgLines.rows[i];
        await pool.query(
          `INSERT INTO project_buy_list_lines
             (buy_list_header_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
              generic_requirement, quantity, specification, technical_attributes,
              selection_required, datasheet_required, inspection_required,
              certificate_required, compliance_required, source_package_line_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            newId, i + 1, pl.buy_group_id, pl.buy_subgroup_id, pl.uom_id,
            pl.generic_requirement, pl.default_quantity, pl.default_specification,
            pl.technical_attributes, pl.selection_required, pl.datasheet_required,
            pl.inspection_required, pl.certificate_required, pl.compliance_required, pl.id,
          ],
        );
      }

      // Log workflow event
      await pool.query(
        `INSERT INTO project_workflow_events
           (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
         VALUES ($1,'buy_list_auto_created',$2,'pppc-routes',NOW(),false)`,
        [projectId, JSON.stringify({
          projectItemId, buyListHeaderId: newId, listNumber,
          sourcePackageId: pkgRow.id, linesCount: pkgLines.rows.length,
        })],
      );

      console.log(`[PPPC] 🤖 Auto-created buy list ${listNumber} (id=${newId}) for project ${projectId}, item ${projectItemId}`);
    } catch (err: any) {
      console.error('[PPPC] ❌ Error in project.item.added hook:', err?.message ?? err);
    }
  });

  console.log('[PPPC] ✅ Phase 0 routes registered (buy-groups · buy-subgroups · uom-master)');
  console.log('[PPPC] ✅ Phase 1 routes registered (buy-packages · buy-package-lines)');
  console.log('[PPPC] ✅ Phase 2 routes registered (project buy lists · buy list lines)');
  console.log('[PPPC] ✅ Phase 2 hook registered (offer→project buy list auto-creation)');
}
