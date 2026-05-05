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
        .slice(0, 18);

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

  console.log('[PPPC] ✅ Phase 0 routes registered (buy-groups · buy-subgroups · uom-master)');
  console.log('[PPPC] ✅ Phase 1 routes registered (buy-packages · buy-package-lines)');
}
