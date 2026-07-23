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
import multer from 'multer';
import crypto from 'crypto';
import { pool } from './db';
import { ensureAuthenticated } from './auth-middleware';
import { applyProjectElectricalStandards, stripElectricalOverridesMeta } from './utils/electrical-override';
import {
  resolveCatalogSapItemCode, groupPrefix, subgroupPrefix, buildCatalogItemCode, SAP_ITEM_CODE_MAX_LEN,
  resolveNfpMotorSapItemCode, buildNfpMotorItemCode,
  resolveFlpMotorSapItemCode, buildFlpMotorItemCode,
  resolveIsoValveSapItemCode, buildIsoValveItemCode,
  resolveCtrlValveSapItemCode, buildCtrlValveItemCode,
  resolveSafetyValveSapItemCode, buildSafetyValveItemCode,
} from './buy-catalog-sap-service';

/**
 * Compat shim: read the single make value from technical_attributes.
 * Supports new scalar `make` field and legacy `approved_makes` array/string.
 * Remove this shim after the T006 JSONB migration has run on all rows.
 */
function readMakeScalar(attrs: Record<string, unknown>): string {
  if (typeof attrs.make === 'string' && attrs.make.trim()) return attrs.make.trim();
  // legacy: pump/motor/instrument forms stored approved_makes array
  if (Array.isArray(attrs.approved_makes) && attrs.approved_makes.length > 0)
    return String(attrs.approved_makes[0] ?? '').trim();
  // legacy: electrical forms stored approved_makes as CSV string
  if (typeof attrs.approved_makes === 'string')
    return (attrs.approved_makes as string).split(',')[0]?.trim() ?? '';
  // legacy: valve forms stored 'makes' array (not 'approved_makes')
  if (Array.isArray(attrs.makes) && (attrs.makes as unknown[]).length > 0)
    return String((attrs.makes as unknown[])[0] ?? '').trim();
  return '';
}
import { requirePageAccess } from './utils/permission-utils';
import {
  sendError, sendValidationError, sendNotFound,
  sendPermissionError, sendBusinessError,
} from './utils/error-response';
import { canManage, roleHierarchy } from '@shared/roles';
import { seedPppcMasterData, validateSubgroupBelongsToGroup } from './utils/pppc-services';
import { agentEventBus } from './agents/framework/event-bus';
import { uploadFileWithDiagnostics } from './utils/gcs-enhanced-upload';
import { bucketName as GCS_BUCKET } from './utils/storage-config';
import { resolveGcsPath, GcsGovernanceError } from './utils/gcs-path-resolver';
import { isProjectFrozen } from './utils/epc-project-cascade';
import { getNextDocSeq } from './doc-sequence-service';
import {
  RAW_MATERIALS_CODE, isTaggableSubgroup,
  getNextTagNoInTx, getNextNTagNosInTx, previewNextTagNos,
  isTagNoUnique, logTagNoChange,
} from './tag-generation-service';
import { createPlcLineInTx } from './plc-line-service';

// ─── Phase 3 helpers ──────────────────────────────────────────────────────────
const dsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/png': 'png', 'image/gif': 'gif',
    'image/tiff': 'tiff', 'image/tiff-fx': 'tiff',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };
  return map[mime.toLowerCase()] ?? 'bin';
}

function sanitizeTagNo(tag: string): string {
  return tag.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_\-]/g, '');
}

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

function requireSeniorExecutive(req: Request, res: Response): boolean {
  const role = (req.user as any)?.role;
  const level = roleHierarchy[role] ?? 999;
  if (level > roleHierarchy['Senior Executive']) {
    sendPermissionError(res, 'Senior Executive or above required for this action.');
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
      // Code = BPK-{product_code_slug} — fixed forever, no sequence suffix
      const slug = rawCode
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 25)
        .replace(/-$/g, '');
      const candidate = `BPK-${slug}`;

      res.json({ packageCode: candidate });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/buy-packages — list with product info + line count
  app.get('/api/buy-packages', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
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

      // Only the latest version per product_id is returned (highest version wins)
      const result = await pool.query(
        `WITH latest AS (
           SELECT DISTINCT ON (bph.product_id)
             bph.id,
             bph.product_id,
             bph.package_code,
             bph.name,
             bph.description,
             bph.version,
             bph.status,
             bph.is_active,
             bph.created_by,
             bph.created_at,
             bph.updated_at
           FROM buy_package_headers bph
           ${where}
           ORDER BY bph.product_id, bph.version DESC
         )
         SELECT
           l.id,
           l.product_id          AS "productId",
           l.package_code        AS "packageCode",
           l.name,
           l.description,
           l.version,
           l.status,
           l.is_active           AS "isActive",
           l.created_by          AS "createdBy",
           l.created_at          AS "createdAt",
           l.updated_at          AS "updatedAt",
           p.product_code        AS "productCode",
           p.description         AS "productDescription",
           p.item_family         AS "itemFamily",
           COUNT(bpl.id)::int    AS "lineCount"
         FROM latest l
         JOIN products p ON p.id = l.product_id
         LEFT JOIN buy_package_lines bpl ON bpl.buy_package_header_id = l.id
         GROUP BY l.id, l.product_id, l.package_code, l.name, l.description,
                  l.version, l.status, l.is_active, l.created_by, l.created_at, l.updated_at,
                  p.product_code, p.description, p.item_family
         ORDER BY l.updated_at DESC`,
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

  // POST /api/buy-packages/:id/clone — Save As / Clone (Manager+)
  // Business rule: one active package per Grandparent/Top-level Product.
  // Creates a new draft on a DIFFERENT top-level product; deep-copies all lines.
  app.post('/api/buy-packages/:id/clone', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid package id');

      const { targetProductId, name } = req.body;
      if (!targetProductId) return sendValidationError(res, 'targetProductId is required');

      // Load source package
      const srcRow = await pool.query(`SELECT * FROM buy_package_headers WHERE id = $1`, [id]);
      if (srcRow.rowCount === 0) return sendNotFound(res, 'Buy package', id);
      const src = srcRow.rows[0];

      // Source and target cannot be the same product
      if (Number(targetProductId) === Number(src.product_id))
        return sendValidationError(res, 'Source and target products cannot be the same.');

      // Target product must exist and be a Grandparent (top-level) product
      const tgtProd = await pool.query(
        `SELECT id, product_code, is_grandparent FROM products WHERE id = $1`,
        [targetProductId],
      );
      if (tgtProd.rowCount === 0) return sendNotFound(res, 'Target product', targetProductId);
      if (!tgtProd.rows[0].is_grandparent)
        return sendValidationError(res, 'Target must be a top-level (Grandparent) product.');

      // Business rule: one active package per Grandparent/Top-level Product
      const activeCheck = await pool.query(
        `SELECT id FROM buy_package_headers WHERE product_id = $1 AND status = 'active' LIMIT 1`,
        [targetProductId],
      );
      if ((activeCheck.rowCount ?? 0) > 0)
        return sendBusinessError(res, 'Target product already has an active package. Archive it before cloning.');

      // Auto-generate package code: BPK-{product_code_slug} — no sequence suffix
      const rawCode: string = tgtProd.rows[0].product_code ?? '';
      const slug = rawCode
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 25)
        .replace(/-$/g, '');
      const packageCode = `BPK-${slug}`;

      // Resolve draft name and system-managed version
      const draftName = (name?.trim()) || `${src.name} - Draft`;
      const verRow = await pool.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM buy_package_headers WHERE product_id = $1`,
        [targetProductId],
      );
      const version = verRow.rows[0].v;
      const userId = (req.user as any)?.id ?? null;

      // Transaction: create header + deep-copy all lines
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const newHdr = await client.query(
          `INSERT INTO buy_package_headers
             (product_id, package_code, name, version, status, is_active, created_by, updated_at)
           VALUES ($1, $2, $3, $4, 'draft', false, $5, NOW())
           RETURNING id, package_code`,
          [targetProductId, packageCode, draftName, version, userId],
        );
        const newId   = newHdr.rows[0].id;
        const newCode = newHdr.rows[0].package_code;

        const lines = await client.query(
          `SELECT * FROM buy_package_lines WHERE buy_package_header_id = $1 ORDER BY line_number`, [id],
        );
        for (const l of lines.rows) {
          await client.query(
            `INSERT INTO buy_package_lines
               (buy_package_header_id, line_uid, line_number, buy_group_id, buy_subgroup_id, uom_id,
                generic_requirement, default_quantity, default_specification, technical_attributes,
                selection_required, datasheet_required, inspection_required,
                certificate_required, compliance_required, notes, sort_order,
                installed_on, model)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
            [
              newId, l.line_uid, l.line_number, l.buy_group_id, l.buy_subgroup_id, l.uom_id,
              l.generic_requirement, l.default_quantity, l.default_specification, l.technical_attributes,
              l.selection_required, l.datasheet_required, l.inspection_required,
              l.certificate_required, l.compliance_required, l.notes, l.sort_order,
              l.installed_on ?? null, (l.model as string | null) ?? 'TBN',
            ],
          );
        }

        await client.query('COMMIT');
        res.status(201).json({ id: newId, packageCode: newCode, linesCopied: lines.rowCount ?? 0 });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) { sendError(res, err); }
  });

  // POST /api/buy-packages/:id/revise — Create a new draft revision of an active package for the SAME product (Senior Manager+)
  // Business rule: only active packages can be revised. Creates version N+1 draft, deep-copies all lines.
  app.post('/api/buy-packages/:id/revise', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid package id');

      const srcRow = await pool.query(`SELECT * FROM buy_package_headers WHERE id = $1`, [id]);
      if (srcRow.rowCount === 0) return sendNotFound(res, 'Buy package', id);
      const src = srcRow.rows[0];

      if (src.status !== 'active')
        return sendBusinessError(res, 'Only active packages can be revised.');

      // Check no draft already exists for this product (one in-flight revision at a time)
      const draftCheck = await pool.query(
        `SELECT id FROM buy_package_headers WHERE product_id = $1 AND status = 'draft' LIMIT 1`,
        [src.product_id],
      );
      if ((draftCheck.rowCount ?? 0) > 0)
        return sendBusinessError(res, 'A draft revision already exists for this product. Complete or delete it before creating another.');

      const verRow = await pool.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM buy_package_headers WHERE product_id = $1`,
        [src.product_id],
      );
      const newVersion = verRow.rows[0].v;
      const userId = (req.user as any)?.id ?? null;

      // Revision keeps the SAME package code — only the version increments
      const newCode: string = src.package_code ?? '';

      const baseName = src.name.replace(/\s*\(Rev \d+\)$/i, '').trim();
      const draftName = `${baseName} (Rev ${newVersion})`;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Archive the source package immediately when revision draft is created
        await client.query(
          `UPDATE buy_package_headers SET status='archived', is_active=false, updated_at=NOW() WHERE id=$1`,
          [id],
        );

        const newHdr = await client.query(
          `INSERT INTO buy_package_headers
             (product_id, package_code, name, description, version, status, is_active, created_by, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'draft', false, $6, NOW())
           RETURNING id, package_code`,
          [src.product_id, newCode, draftName, src.description, newVersion, userId],
        );
        const newId   = newHdr.rows[0].id;
        const pkgCode = newHdr.rows[0].package_code;

        const lines = await client.query(
          `SELECT * FROM buy_package_lines WHERE buy_package_header_id = $1 ORDER BY line_number`, [id],
        );
        for (const l of lines.rows) {
          await client.query(
            `INSERT INTO buy_package_lines
               (buy_package_header_id, line_uid, line_number, buy_group_id, buy_subgroup_id, uom_id,
                generic_requirement, default_quantity, default_specification, technical_attributes,
                selection_required, datasheet_required, inspection_required,
                certificate_required, compliance_required, notes, sort_order,
                installed_on, model)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
            [
              newId, l.line_uid, l.line_number, l.buy_group_id, l.buy_subgroup_id, l.uom_id,
              l.generic_requirement, l.default_quantity, l.default_specification, l.technical_attributes,
              l.selection_required, l.datasheet_required, l.inspection_required,
              l.certificate_required, l.compliance_required, l.notes, l.sort_order,
              l.installed_on ?? null, (l.model as string | null) ?? 'TBN',
            ],
          );
        }

        await client.query('COMMIT');
        res.status(201).json({ id: newId, packageCode: pkgCode, version: newVersion, linesCopied: lines.rowCount ?? 0 });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) { sendError(res, err); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — BUY PACKAGE LINES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/buy-catalog/preview-code — read-only preview of what SAP Item Code will be assigned
  // Used by the Add/Edit Line form for live feedback before the user saves.
  // Query params: groupId, subgroupId, make, model
  app.get('/api/buy-catalog/preview-code', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const groupId    = parseInt(req.query.groupId    as string);
      const subgroupId = parseInt(req.query.subgroupId as string);
      const make       = (req.query.make  as string | undefined)?.trim() ?? '';
      const model      = (req.query.model as string | undefined)?.trim() ?? '';

      if (isNaN(groupId) || isNaN(subgroupId) || !make || !model)
        return sendValidationError(res, 'groupId, subgroupId, make, and model are required');

      // Check raw_materials group — no code for RM
      const grpRow = await pool.query<{ code: string }>(`SELECT code FROM buy_groups WHERE id = $1`, [groupId]);
      if (!grpRow.rowCount || grpRow.rows[0].code === 'raw_materials')
        return res.json({ code: null, isNew: false, isRawMaterials: true });

      // Check if this identity already has a catalog record
      const existing = await pool.query<{ item_code: string }>(
        `SELECT item_code FROM master_items
         WHERE item_type = 'catalog'
           AND buy_group_id    = $1
           AND buy_subgroup_id = $2
           AND catalog_make    = $3
           AND catalog_model   = $4
         LIMIT 1`,
        [groupId, subgroupId, make, model],
      );

      if (existing.rowCount && existing.rowCount > 0) {
        return res.json({ code: existing.rows[0].item_code, isNew: false, isRawMaterials: false });
      }

      // Not found — compute the deterministic code (read-only, no INSERT)
      // Format: {GRP}-{SUB}-{MAKE}-{MODEL}  e.g. PMP-CEN-KSB-CPKEY 65-200
      const grpCode  = grpRow.rows[0].code;
      const sgRow    = await pool.query<{ code: string }>(`SELECT code FROM buy_subgroups WHERE id = $1`, [subgroupId]);
      const grpPfx   = groupPrefix(grpCode);
      const sgPfx    = sgRow.rowCount && sgRow.rowCount > 0 ? subgroupPrefix(sgRow.rows[0].code) : 'GEN';
      const code     = buildCatalogItemCode(grpPfx, sgPfx, make, model);
      const tooLong  = code.length > SAP_ITEM_CODE_MAX_LEN;

      res.json({ code, isNew: true, isRawMaterials: false, isTooLong: tooLong, codeLength: code.length });
    } catch (err) { sendError(res, err); }
  });

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

  // POST /api/buy-packages/:id/lines — add line (Senior Executive+, draft only)
  app.post('/api/buy-packages/:id/lines', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorExecutive(req, res)) return;
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
        installedOn, model,
      } = req.body;

      if (!buyGroupId || !buySubgroupId || !uomId || !genericRequirement)
        return sendValidationError(res, 'buyGroupId, buySubgroupId, uomId, and genericRequirement are required');

      // Validate subgroup belongs to group (API layer)
      const valid = await validateSubgroupBelongsToGroup(pool, buyGroupId, buySubgroupId);
      if (!valid) return sendValidationError(res, 'buySubgroupId does not belong to the specified buyGroupId');

      // Validate Make + Model for non-raw-material groups
      const grpCodeRow = await pool.query(`SELECT code FROM buy_groups WHERE id = $1`, [buyGroupId]);
      const groupCode = grpCodeRow.rows[0]?.code as string | undefined;
      const sgCodeRow = await pool.query(`SELECT code FROM buy_subgroups WHERE id = $1`, [buySubgroupId]);
      const subgroupCode = sgCodeRow.rows[0]?.code as string | undefined;
      const isNfpMotor = groupCode === 'motors' && subgroupCode === 'non_flameproof';
      const isFlpMotor = groupCode === 'motors' && subgroupCode === 'flameproof';
      const isIsoValve    = groupCode === 'valves' && subgroupCode === 'isolation';
      const isCtrlValve   = groupCode === 'valves' && subgroupCode === 'control';
      const isSafetyValve = groupCode === 'valves' && subgroupCode === 'safety';
      if (groupCode && groupCode !== 'raw_materials' && !isNfpMotor && !isFlpMotor && !isIsoValve && !isCtrlValve && !isSafetyValve) {
        const attrs = (technicalAttributes ?? {}) as Record<string, unknown>;
        const make = readMakeScalar(attrs);
        const series = typeof attrs.preferred_series === 'string' ? attrs.preferred_series.trim() : '';
        if (!make) return sendValidationError(res, 'Make is required for non-Raw-Material lines');
        if (make.toUpperCase() === 'TBN') return sendValidationError(res, 'Make is still TBN — finalize the make first');
        if (!series) return sendValidationError(res, 'Model / Series is required for non-Raw-Material lines');
        if (series.toUpperCase() === 'TBN') return sendValidationError(res, 'Model / Series is still TBN — finalize the model first');
      }

      // Validate UOM exists (also fetch code for SAP item description)
      const uomCheck = await pool.query(`SELECT id, code FROM uom_master WHERE id = $1`, [uomId]);
      if (uomCheck.rowCount === 0) return sendNotFound(res, 'UOM', uomId);
      const uomCode = uomCheck.rows[0].code as string;

      // Resolve SAP Item Code for non-raw-material lines
      let sapMasterItemId: number | null = null;
      let sapItemCodeValue: string | null = null;
      if (groupCode && groupCode !== 'raw_materials') {
        const attrs = (technicalAttributes ?? {}) as Record<string, unknown>;
        if (isNfpMotor) {
          const motorTypeLabel = (attrs.motor_type as string | undefined)?.trim() ?? '';
          const powerKw        = (attrs.power      as string | undefined)?.trim() ?? '';
          const desc = `Non-Flameproof Motor — ${motorTypeLabel} — ${powerKw} kW`.slice(0, 255);
          const sapRes = await resolveNfpMotorSapItemCode(pool, buyGroupId, buySubgroupId, attrs, uomCode, desc);
          sapMasterItemId  = sapRes.masterItemId;
          sapItemCodeValue = sapRes.sapItemCode;
        } else if (isFlpMotor) {
          const motorTypeLabel = (attrs.motor_type as string | undefined)?.trim() ?? '';
          const powerKw        = (attrs.power      as string | undefined)?.trim() ?? '';
          const desc = `Flameproof Motor — ${motorTypeLabel} — ${powerKw} kW`.slice(0, 255);
          const sapRes = await resolveFlpMotorSapItemCode(pool, buyGroupId, buySubgroupId, attrs, uomCode, desc);
          sapMasterItemId  = sapRes.masterItemId;
          sapItemCodeValue = sapRes.sapItemCode;
        } else if (isIsoValve) {
          const valveTypeLabel = (attrs.valve_type  as string | undefined)?.trim() ?? '';
          const sizeLabel      = (attrs.size_nb      as string | undefined)?.trim() ?? '';
          const desc = `Isolation Valve — ${valveTypeLabel} — ${sizeLabel}`.slice(0, 255);
          const sapRes = await resolveIsoValveSapItemCode(pool, buyGroupId, buySubgroupId, attrs, uomCode, desc);
          sapMasterItemId  = sapRes.masterItemId;
          sapItemCodeValue = sapRes.sapItemCode;
        } else if (isCtrlValve) {
          const valveTypeLabel = (attrs.valve_type  as string | undefined)?.trim() ?? '';
          const sizeLabel      = (attrs.size_nb      as string | undefined)?.trim() ?? '';
          const desc = `Control Valve — ${valveTypeLabel} — ${sizeLabel}`.slice(0, 255);
          const sapRes = await resolveCtrlValveSapItemCode(pool, buyGroupId, buySubgroupId, attrs, uomCode, desc);
          sapMasterItemId  = sapRes.masterItemId;
          sapItemCodeValue = sapRes.sapItemCode;
        } else if (isSafetyValve) {
          const valveTypeLabel = (attrs.valve_type as string | undefined)?.trim() ?? '';
          const desc = `Safety Valve — ${valveTypeLabel}`.slice(0, 255);
          const sapRes = await resolveSafetyValveSapItemCode(pool, buyGroupId, buySubgroupId, attrs, uomCode, desc);
          sapMasterItemId  = sapRes.masterItemId;
          sapItemCodeValue = sapRes.sapItemCode;
        } else {
          const make  = readMakeScalar(attrs);
          const model2 = String(attrs.preferred_series as string).trim();
          const lblRow = await pool.query(
            `SELECT bg.label AS g, bs.label AS s
             FROM buy_groups bg, buy_subgroups bs
             WHERE bg.id = $1 AND bs.id = $2`,
            [buyGroupId, buySubgroupId],
          );
          const gLabel = (lblRow.rows[0]?.g as string) ?? '';
          const sLabel = (lblRow.rows[0]?.s as string) ?? '';
          const desc   = `${gLabel} — ${sLabel} — ${make} — ${model2}`.slice(0, 255);
          const sapRes = await resolveCatalogSapItemCode(
            pool, buyGroupId, buySubgroupId, make, model2, uomCode, desc,
          );
          sapMasterItemId  = sapRes.masterItemId;
          sapItemCodeValue = sapRes.sapItemCode;
        }
      }

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
           certificate_required, compliance_required, notes, sort_order, installed_on, model,
           master_item_id, sap_item_code, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
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
          installedOn?.trim() || null,
          (model as string | undefined)?.trim() || 'TBN',
          sapMasterItemId,
          sapItemCodeValue,
        ],
      );
      res.status(201).json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // PATCH /api/buy-package-lines/:id — edit line (Senior Executive+, draft package only)
  app.patch('/api/buy-package-lines/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorExecutive(req, res)) return;
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
      if (b.installedOn !== undefined)           { fields.push(`installed_on = $${idx++}`);          values.push(b.installedOn?.trim() || null); }
      if (b.model !== undefined)                 { fields.push(`model = $${idx++}`);                 values.push((b.model as string)?.trim() || 'TBN'); }

      // Validate Make + Model for non-raw-material groups (when technicalAttributes is being updated)
      if (b.technicalAttributes !== undefined) {
        const grpCodeRow2  = await pool.query(`SELECT code FROM buy_groups    WHERE id = $1`, [newGroupId]);
        const sgCodeRow2   = await pool.query(`SELECT code FROM buy_subgroups WHERE id = $1`, [newSubgroupId]);
        const groupCode2   = grpCodeRow2.rows[0]?.code as string | undefined;
        const subgroupCode2 = sgCodeRow2.rows[0]?.code as string | undefined;
        const isNfpMotor2     = groupCode2 === 'motors' && subgroupCode2 === 'non_flameproof';
        const isFlpMotor2  = groupCode2 === 'motors' && subgroupCode2 === 'flameproof';
        const isIsoValve2     = groupCode2 === 'valves' && subgroupCode2 === 'isolation';
        const isCtrlValve2    = groupCode2 === 'valves' && subgroupCode2 === 'control';
        const isSafetyValve2  = groupCode2 === 'valves' && subgroupCode2 === 'safety';
        if (groupCode2 && groupCode2 !== 'raw_materials' && !isNfpMotor2 && !isFlpMotor2 && !isIsoValve2 && !isCtrlValve2 && !isSafetyValve2) {
          const attrs2 = (b.technicalAttributes ?? {}) as Record<string, unknown>;
          const make2 = readMakeScalar(attrs2);
          const series2 = typeof attrs2.preferred_series === 'string' ? attrs2.preferred_series.trim() : '';
          if (!make2) return sendValidationError(res, 'Make is required for non-Raw-Material lines');
          if (make2.toUpperCase() === 'TBN') return sendValidationError(res, 'Make is still TBN — finalize the make first');
          if (!series2) return sendValidationError(res, 'Model / Series is required for non-Raw-Material lines');
          if (series2.toUpperCase() === 'TBN') return sendValidationError(res, 'Model / Series is still TBN — finalize the model first');
        }

        // Resolve SAP Item Code (Make/Model or spec may have changed)
        if (groupCode2 && groupCode2 !== 'raw_materials') {
          const attrs3  = (b.technicalAttributes ?? {}) as Record<string, unknown>;
          const uomRow3 = await pool.query(
            `SELECT u.code FROM uom_master u
             JOIN buy_package_lines bpl ON bpl.uom_id = u.id
             WHERE bpl.id = $1`,
            [id],
          );
          const uomCode3 = (uomRow3.rows[0]?.code as string) ?? 'Nos';
          if (isNfpMotor2) {
            const motorTypeLabel = (attrs3.motor_type as string | undefined)?.trim() ?? '';
            const powerKw        = (attrs3.power      as string | undefined)?.trim() ?? '';
            const desc3 = `Non-Flameproof Motor — ${motorTypeLabel} — ${powerKw} kW`.slice(0, 255);
            const sapRes3 = await resolveNfpMotorSapItemCode(pool, newGroupId, newSubgroupId, attrs3, uomCode3, desc3);
            fields.push(`master_item_id = $${idx++}`); values.push(sapRes3.masterItemId);
            fields.push(`sap_item_code  = $${idx++}`); values.push(sapRes3.sapItemCode);
          } else if (isFlpMotor2) {
            const motorTypeLabel = (attrs3.motor_type as string | undefined)?.trim() ?? '';
            const powerKw        = (attrs3.power      as string | undefined)?.trim() ?? '';
            const desc3 = `Flameproof Motor — ${motorTypeLabel} — ${powerKw} kW`.slice(0, 255);
            const sapRes3 = await resolveFlpMotorSapItemCode(pool, newGroupId, newSubgroupId, attrs3, uomCode3, desc3);
            fields.push(`master_item_id = $${idx++}`); values.push(sapRes3.masterItemId);
            fields.push(`sap_item_code  = $${idx++}`); values.push(sapRes3.sapItemCode);
          } else if (isIsoValve2) {
            const valveTypeLabel = (attrs3.valve_type as string | undefined)?.trim() ?? '';
            const sizeLabel      = (attrs3.size_nb    as string | undefined)?.trim() ?? '';
            const desc3 = `Isolation Valve — ${valveTypeLabel} — ${sizeLabel}`.slice(0, 255);
            const sapRes3 = await resolveIsoValveSapItemCode(pool, newGroupId, newSubgroupId, attrs3, uomCode3, desc3);
            fields.push(`master_item_id = $${idx++}`); values.push(sapRes3.masterItemId);
            fields.push(`sap_item_code  = $${idx++}`); values.push(sapRes3.sapItemCode);
          } else if (isCtrlValve2) {
            const valveTypeLabel = (attrs3.valve_type as string | undefined)?.trim() ?? '';
            const sizeLabel      = (attrs3.size_nb    as string | undefined)?.trim() ?? '';
            const desc3 = `Control Valve — ${valveTypeLabel} — ${sizeLabel}`.slice(0, 255);
            const sapRes3 = await resolveCtrlValveSapItemCode(pool, newGroupId, newSubgroupId, attrs3, uomCode3, desc3);
            fields.push(`master_item_id = $${idx++}`); values.push(sapRes3.masterItemId);
            fields.push(`sap_item_code  = $${idx++}`); values.push(sapRes3.sapItemCode);
          } else if (isSafetyValve2) {
            const valveTypeLabel = (attrs3.valve_type as string | undefined)?.trim() ?? '';
            const desc3 = `Safety Valve — ${valveTypeLabel}`.slice(0, 255);
            const sapRes3 = await resolveSafetyValveSapItemCode(pool, newGroupId, newSubgroupId, attrs3, uomCode3, desc3);
            fields.push(`master_item_id = $${idx++}`); values.push(sapRes3.masterItemId);
            fields.push(`sap_item_code  = $${idx++}`); values.push(sapRes3.sapItemCode);
          } else {
            const make3  = readMakeScalar(attrs3);
            const model3 = String(attrs3.preferred_series as string).trim();
            const lblRow3 = await pool.query(
              `SELECT bg.label AS g, bs.label AS s
               FROM buy_groups bg, buy_subgroups bs
               WHERE bg.id = $1 AND bs.id = $2`,
              [newGroupId, newSubgroupId],
            );
            const desc3  = `${(lblRow3.rows[0]?.g as string) ?? ''} — ${(lblRow3.rows[0]?.s as string) ?? ''} — ${make3} — ${model3}`.slice(0, 255);
            const sapRes3 = await resolveCatalogSapItemCode(
              pool, newGroupId, newSubgroupId, make3, model3, uomCode3, desc3,
            );
            fields.push(`master_item_id = $${idx++}`); values.push(sapRes3.masterItemId);
            fields.push(`sap_item_code  = $${idx++}`); values.push(sapRes3.sapItemCode);
          }
        }
      }

      if (fields.length === 0) return sendValidationError(res, 'No updatable fields provided');
      fields.push(`updated_at = NOW()`); values.push(id);
      const result = await pool.query(`UPDATE buy_package_lines SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
      res.json(result.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // DELETE /api/buy-package-lines/:id — delete line (Senior Executive+, draft package only)
  app.delete('/api/buy-package-lines/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireSeniorExecutive(req, res)) return;
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

  // ── Tag Number endpoints ─────────────────────────────────────────────────────

  // GET /api/projects/:projectId/next-tag-no?subgroupCode=pressure&qty=1
  app.get('/api/projects/:projectId/next-tag-no', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const projectId    = parseInt(req.params.projectId);
      const subgroupCode = (req.query.subgroupCode as string) ?? '';
      const qty          = Math.max(1, parseInt((req.query.qty as string) ?? '1', 10) || 1);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid projectId');
      if (!subgroupCode)    return sendValidationError(res, 'subgroupCode is required');

      const installedOn = (req.query.installedOn as string) || null;
      const tags = await previewNextTagNos(pool, projectId, subgroupCode, qty, installedOn);
      if (tags.length === 0) return res.json({ tagNo: null, preview: [] });
      res.json({ tagNo: tags[0], preview: tags });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/projects/:projectId/check-tag-no?tagNo=PT-101&excludeLineId=5
  app.get('/api/projects/:projectId/check-tag-no', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const projectId    = parseInt(req.params.projectId);
      const tagNo        = (req.query.tagNo as string) ?? '';
      const excludeId    = req.query.excludeLineId ? parseInt(req.query.excludeLineId as string) : undefined;
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid projectId');
      if (!tagNo)           return res.json({ unique: true });

      const unique = await isTagNoUnique(pool, projectId, tagNo, excludeId);
      if (unique) {
        res.json({ unique: true });
      } else {
        res.json({ unique: false, message: 'Tag No already exists in this project' });
      }
    } catch (err) { sendError(res, err); }
  });

  // GET /api/projects/:projectId/buy-lists
  app.get('/api/projects/:projectId/buy-lists', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid projectId');
      const allRevisions    = req.query.allRevisions    === 'true';
      const status          = req.query.status          as string | undefined;
      const buyGroupCode    = req.query.buyGroupCode    as string | undefined;
      const buySubgroupCode = req.query.buySubgroupCode as string | undefined;
      const conditions: string[] = ['h.project_id = $1'];
      const values: unknown[] = [projectId];
      let idx = 2;
      if (!allRevisions) { conditions.push('h.is_current = true'); }
      if (status) { conditions.push(`h.status = $${idx++}`); values.push(status); }
      if (buyGroupCode) {
        conditions.push(
          `EXISTS (SELECT 1 FROM project_buy_list_lines l2 JOIN buy_groups bg2 ON bg2.id = l2.buy_group_id WHERE l2.buy_list_header_id = h.id AND bg2.code = $${idx++})`,
        );
        values.push(buyGroupCode);
      }
      if (buySubgroupCode) {
        conditions.push(
          `EXISTS (SELECT 1 FROM project_buy_list_lines l2 JOIN buy_subgroups bs2 ON bs2.id = l2.buy_subgroup_id WHERE l2.buy_list_header_id = h.id AND bs2.code = $${idx++})`,
        );
        values.push(buySubgroupCode);
      }
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
           SUM(CASE WHEN bg.code != 'raw_materials' AND (l.tag_no IS NULL OR l.tag_no = '') THEN 1 ELSE 0 END)::int AS incomplete_lines
         FROM project_buy_list_headers h
         LEFT JOIN project_items pi ON pi.id = h.project_item_id
         LEFT JOIN buy_package_headers pkg ON pkg.id = h.source_package_id
         LEFT JOIN users u_c ON u_c.id = h.created_by
         LEFT JOIN users u_s ON u_s.id = h.submitted_by
         LEFT JOIN users u_r ON u_r.id = h.reviewed_by
         LEFT JOIN users u_rel ON u_rel.id = h.released_by
         LEFT JOIN project_buy_list_lines l ON l.buy_list_header_id = h.id
         LEFT JOIN buy_groups bg ON bg.id = l.buy_group_id
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

        // Fetch catalog lines with group/subgroup codes for tag generation
        const pkgLines = await pool.query(
          `SELECT pl.*, bg.code AS group_code, bs.code AS subgroup_code
           FROM buy_package_lines pl
           JOIN buy_groups bg ON bg.id = pl.buy_group_id
           JOIN buy_subgroups bs ON bs.id = pl.buy_subgroup_id
           WHERE pl.buy_package_header_id = $1 ORDER BY pl.line_number`,
          [sourcePackageId],
        );

        // Wrap header + line inserts in a transaction with advisory lock
        const convClient = await pool.connect();
        try {
          await convClient.query('BEGIN');
          await convClient.query('SELECT pg_advisory_xact_lock($1)', [projectId]);

          const hdr = await convClient.query(
            `INSERT INTO project_buy_list_headers
               (project_id, project_item_id, source_package_id, list_number, created_by, item_code)
             VALUES ($1,$2,$3,$4,$5, (SELECT item_code FROM project_items WHERE id = $2)) RETURNING id`,
            [projectId, projectItemId, sourcePackageId, listNumber, userId],
          );
          insertId = hdr.rows[0].id;

          const elecRes1 = await convClient.query(
            `SELECT electrical_voltage, electrical_frequency, electrical_phase FROM projects WHERE id = $1`,
            [projectId],
          );
          const elecRow1 = elecRes1.rows[0] ?? {};
          const projElec1 = {
            electricalVoltage:   (elecRow1.electrical_voltage   as string) ?? null,
            electricalFrequency: (elecRow1.electrical_frequency as string) ?? null,
            electricalPhase:     (elecRow1.electrical_phase     as string) ?? null,
          };

          for (let i = 0; i < pkgLines.rows.length; i++) {
            const pl = pkgLines.rows[i];
            const isRaw = pl.group_code === RAW_MATERIALS_CODE;
            const tagNo = isRaw
              ? ''
              : (await getNextTagNoInTx(convClient, projectId, pl.subgroup_code) ?? '');
            const finalAttrs1 = stripElectricalOverridesMeta(
              applyProjectElectricalStandards(pl.subgroup_code, (pl.technical_attributes ?? {}) as Record<string, unknown>, projElec1),
            );
            await convClient.query(
              `INSERT INTO project_buy_list_lines
                 (buy_list_header_id, project_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
                  generic_requirement, quantity, specification, technical_attributes,
                  tag_no, selection_required, datasheet_required, inspection_required,
                  certificate_required, compliance_required, source_package_line_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
              [
                insertId, projectId, i + 1, pl.buy_group_id, pl.buy_subgroup_id, pl.uom_id,
                pl.generic_requirement, pl.default_quantity, pl.default_specification,
                finalAttrs1,
                tagNo,
                pl.selection_required, pl.datasheet_required, pl.inspection_required,
                pl.certificate_required, pl.compliance_required, pl.id,
              ],
            );
          }
          await convClient.query('COMMIT');
        } catch (e) {
          await convClient.query('ROLLBACK');
          throw e;
        } finally {
          convClient.release();
        }
      } else {
        const hdr = await pool.query(
          `INSERT INTO project_buy_list_headers
             (project_id, project_item_id, list_number, created_by, item_code)
           VALUES ($1,$2,$3,$4, (SELECT item_code FROM project_items WHERE id = $2)) RETURNING id`,
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

      // Non-raw-materials lines must have tag_no
      const incomplete = await pool.query(
        `SELECT l.id, l.line_number FROM project_buy_list_lines l
         JOIN buy_groups bg ON bg.id = l.buy_group_id
         WHERE l.buy_list_header_id=$1
           AND bg.code != $2
           AND (l.tag_no IS NULL OR l.tag_no='')`,
        [id, RAW_MATERIALS_CODE],
      );
      if (incomplete.rowCount! > 0) {
        return sendBusinessError(res,
          `Cannot submit: ${incomplete.rowCount} line(s) missing Tag No. ` +
          `Lines: ${incomplete.rows.map((r: any) => r.line_number).join(', ')}`,
        );
      }

      // Project-wide duplicate Tag No check
      const projectId = hdr.rows[0].project_id as number;
      const dupTags = await pool.query(
        `SELECT tag_no, COUNT(*)::int AS n
         FROM project_buy_list_lines
         WHERE project_id = $1 AND tag_no <> ''
         GROUP BY tag_no HAVING COUNT(*) > 1`,
        [projectId],
      );
      if ((dupTags.rowCount ?? 0) > 0) {
        const tagList = dupTags.rows.map((r: any) => `${r.tag_no} (×${r.n})`).join(', ');
        return sendBusinessError(res, `Cannot submit: duplicate Tag Nos found in project — ${tagList}`);
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
      const hdr = await pool.query(
        `SELECT h.status, h.submitted_by, p.cost_lock_status
         FROM project_buy_list_headers h
         JOIN projects p ON p.id = h.project_id
         WHERE h.id=$1`,
        [id],
      );
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy list', id);
      if (hdr.rows[0].status !== 'under_review') return sendBusinessError(res, 'Only under_review lists can be reviewed.');
      const userId = (req.user as any)?.id;
      const role   = (req.user as any)?.role;
      const { recommendation, reviewNote } = req.body;
      const VALID_RECS = ['approve', 'reject', 'approve_with_comments'];
      if (!VALID_RECS.includes(recommendation)) return sendValidationError(res, 'Invalid recommendation value.');

      // Record the review
      await pool.query(
        `UPDATE project_buy_list_headers SET reviewed_by=$1, reviewed_at=NOW(),
          review_note=$2, review_recommendation=$3, updated_at=NOW() WHERE id=$4`,
        [userId, reviewNote ?? null, recommendation, id],
      );

      // Auto-release when recommendation is 'approve' AND requester has senior-manager rights
      // AND project is not cost-locked. A non-senior reviewer's approval still requires a
      // senior manager to click Release separately.
      let autoReleased = false;
      if (recommendation === 'approve' && canManage(role, 'Manager')) {
        const costLocked = hdr.rows[0].cost_lock_status === 'locked';
        if (!costLocked) {
          await pool.query(
            `UPDATE project_buy_list_headers SET status='released', released_by=$1, released_at=NOW(),
              release_note=$2, updated_at=NOW() WHERE id=$3`,
            [userId, reviewNote ?? null, id],
          );
          autoReleased = true;
        }
      }

      res.json({ success: true, autoReleased });
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
            is_current, status, supersedes_id, created_by, item_code)
         VALUES ($1,$2,$3,$4,$5,true,'draft',$6,$7, (SELECT item_code FROM project_items WHERE id = $2)) RETURNING id`,
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
             (buy_list_header_id, project_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
              generic_requirement, quantity, required_date, specification, technical_attributes,
              tag_no, equipment_reference, service_description,
              selection_required, datasheet_required, inspection_required,
              certificate_required, compliance_required, source_package_line_id, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [
            newId, old.project_id, l.line_number, l.buy_group_id, l.buy_subgroup_id, l.uom_id,
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
           u.code AS uom_code, u.label AS uom_label,
           ipr.planning_number AS ipr_planning_number,
           ipr.status AS ipr_status,
           mi.item_code AS selected_item_code, mi.description AS selected_item_description,
           pll.plc_number AS plc_number,
           pll.status AS plc_status
         FROM project_buy_list_lines l
         JOIN buy_groups bg ON bg.id = l.buy_group_id
         JOIN buy_subgroups bs ON bs.id = l.buy_subgroup_id
         JOIN uom_master u ON u.id = l.uom_id
         LEFT JOIN item_planning_records ipr ON ipr.id = l.planning_record_id
         LEFT JOIN master_items mi ON mi.id = l.selected_master_item_id
         LEFT JOIN procurement_list_lines pll ON pll.source_buy_list_line_id = l.id
           AND pll.status != 'cancelled'
         WHERE l.buy_list_header_id=$1
         ORDER BY bg.sort_order, bg.code, bs.sort_order, bs.code, l.tag_no, l.line_number`,
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

      const hdr = await pool.query(
        `SELECT h.status, h.project_id FROM project_buy_list_headers h WHERE h.id=$1`, [headerId],
      );
      if (hdr.rowCount === 0) return sendNotFound(res, 'Buy list', headerId);
      if (hdr.rows[0].status !== 'draft') return sendBusinessError(res, 'Lines can only be added to draft lists.');
      const projectId = hdr.rows[0].project_id as number;

      const {
        buyGroupId, buySubgroupId, uomId, genericRequirement,
        quantity, requiredDate, specification, technicalAttributes,
        tagNo, equipmentReference, serviceDescription,
        selectionRequired, datasheetRequired, inspectionRequired,
        certificateRequired, complianceRequired, notes,
        installedOn, model,
      } = req.body;
      if (!buyGroupId || !buySubgroupId || !uomId || !genericRequirement)
        return sendValidationError(res, 'buyGroupId, buySubgroupId, uomId, genericRequirement are required.');

      const valid = await validateSubgroupBelongsToGroup(pool, parseInt(buyGroupId), parseInt(buySubgroupId));
      if (!valid) return sendValidationError(res, 'buySubgroupId does not belong to the specified buyGroupId.');

      // Get group and subgroup codes
      const codeRow = await pool.query(
        `SELECT bg.code AS group_code, bs.code AS subgroup_code
         FROM buy_groups bg, buy_subgroups bs WHERE bg.id=$1 AND bs.id=$2`,
        [buyGroupId, buySubgroupId],
      );
      const groupCode    = (codeRow.rows[0]?.group_code    ?? '') as string;
      const subgroupCode = (codeRow.rows[0]?.subgroup_code ?? '') as string;
      const isRaw        = groupCode === RAW_MATERIALS_CODE;
      const taggable     = !isRaw && isTaggableSubgroup(subgroupCode);
      const qty          = Math.max(1, Math.round(parseFloat(quantity) || 1));
      const userTagNo    = (tagNo ?? '').toString().trim();

      // Block: taggable + qty>1 + manual tag
      if (taggable && qty > 1 && userTagNo) {
        return sendValidationError(res,
          'Manual Tag No cannot be used with Qty > 1. Leave Tag No blank for auto-generation.');
      }

      // Block: manual tag uniqueness (qty=1 only)
      if (taggable && qty === 1 && userTagNo) {
        const unique = await isTagNoUnique(pool, projectId, userTagNo);
        if (!unique) return res.status(409).json({ error: 'Tag No already exists in this project' });
      }

      // All inserts go inside a transaction with advisory lock (per project)
      const lineClient = await pool.connect();
      const createdLines: any[] = [];
      try {
        await lineClient.query('BEGIN');
        await lineClient.query('SELECT pg_advisory_xact_lock($1)', [projectId]);

        const maxRow = await lineClient.query(
          `SELECT COALESCE(MAX(line_number),0)::int AS m FROM project_buy_list_lines WHERE buy_list_header_id=$1`,
          [headerId],
        );
        const baseLine = maxRow.rows[0].m as number;
        const taJson   = technicalAttributes ? JSON.stringify(technicalAttributes) : null;

        const installedOnVal = (installedOn as string | undefined)?.trim() || null;
        const modelVal       = (model as string | undefined)?.trim() || 'TBN';

        if (!taggable) {
          // ── Non-taggable: one line, full quantity, no tag ──────────────────
          const r = await lineClient.query(
            `INSERT INTO project_buy_list_lines
               (buy_list_header_id, project_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
                generic_requirement, quantity, required_date, specification, technical_attributes,
                tag_no, equipment_reference, service_description,
                selection_required, datasheet_required, inspection_required,
                certificate_required, compliance_required, notes, installed_on, model)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
             RETURNING *`,
            [headerId, projectId, baseLine + 1, buyGroupId, buySubgroupId, uomId,
             genericRequirement, qty, requiredDate ?? null, specification ?? null, taJson,
             '', equipmentReference ?? '', serviceDescription ?? '',
             selectionRequired ?? true, datasheetRequired ?? false, inspectionRequired ?? false,
             certificateRequired ?? false, complianceRequired ?? false, notes ?? null, installedOnVal, modelVal],
          );
          createdLines.push(r.rows[0]);

        } else if (qty === 1) {
          // ── Taggable qty=1: user tag or auto-generate ──────────────────────
          const finalTag = userTagNo || (await getNextTagNoInTx(lineClient, projectId, subgroupCode, installedOnVal) ?? '');
          const r = await lineClient.query(
            `INSERT INTO project_buy_list_lines
               (buy_list_header_id, project_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
                generic_requirement, quantity, required_date, specification, technical_attributes,
                tag_no, equipment_reference, service_description,
                selection_required, datasheet_required, inspection_required,
                certificate_required, compliance_required, notes, installed_on, model)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
             RETURNING *`,
            [headerId, projectId, baseLine + 1, buyGroupId, buySubgroupId, uomId,
             genericRequirement, 1, requiredDate ?? null, specification ?? null, taJson,
             finalTag, equipmentReference ?? '', serviceDescription ?? '',
             selectionRequired ?? true, datasheetRequired ?? false, inspectionRequired ?? false,
             certificateRequired ?? false, complianceRequired ?? false, notes ?? null, installedOnVal, modelVal],
          );
          createdLines.push(r.rows[0]);

        } else {
          // ── Taggable qty>1: N lines each qty=1 with sequential tags ────────
          const tags = await getNextNTagNosInTx(lineClient, projectId, subgroupCode, qty, installedOnVal);
          for (let i = 0; i < qty; i++) {
            const r = await lineClient.query(
              `INSERT INTO project_buy_list_lines
                 (buy_list_header_id, project_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
                  generic_requirement, quantity, required_date, specification, technical_attributes,
                  tag_no, equipment_reference, service_description,
                  selection_required, datasheet_required, inspection_required,
                  certificate_required, compliance_required, notes, installed_on, model)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
               RETURNING *`,
              [headerId, projectId, baseLine + 1 + i, buyGroupId, buySubgroupId, uomId,
               genericRequirement, 1, requiredDate ?? null, specification ?? null, taJson,
               tags[i] ?? '', equipmentReference ?? '', serviceDescription ?? '',
               selectionRequired ?? true, datasheetRequired ?? false, inspectionRequired ?? false,
               certificateRequired ?? false, complianceRequired ?? false, notes ?? null, installedOnVal, modelVal],
            );
            createdLines.push(r.rows[0]);
          }
        }

        await lineClient.query('COMMIT');
      } catch (e) {
        await lineClient.query('ROLLBACK');
        throw e;
      } finally {
        lineClient.release();
      }

      if (createdLines.length === 1) {
        res.status(201).json(createdLines[0]);
      } else {
        res.status(201).json({
          linesCreated: createdLines.length,
          lines: createdLines,
          tags: createdLines.map(l => l.tag_no).filter(Boolean),
        });
      }
    } catch (err) { sendError(res, err); }
  });

  // PATCH /api/buy-list-lines/:id
  app.patch('/api/buy-list-lines/:id', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const line = await pool.query(
        `SELECT l.id, l.tag_no AS current_tag_no, l.buy_list_header_id,
                l.source_package_line_id,
                h.status, h.project_id,
                bg.code AS group_code, bs.code AS subgroup_code
         FROM project_buy_list_lines l
         JOIN project_buy_list_headers h ON h.id = l.buy_list_header_id
         JOIN buy_groups bg ON bg.id = l.buy_group_id
         JOIN buy_subgroups bs ON bs.id = l.buy_subgroup_id
         WHERE l.id=$1`,
        [id],
      );
      if (line.rowCount === 0) return sendNotFound(res, 'Buy list line', id);
      if (line.rows[0].status !== 'draft') return sendBusinessError(res, 'Lines can only be edited on draft lists.');

      // ── Tag No change handling ───────────────────────────────────────────────
      if (req.body.tagNo !== undefined) {
        const incoming   = (req.body.tagNo ?? '').toString().trim();
        const currentTag = (line.rows[0].current_tag_no ?? '') as string;
        const isRaw      = (line.rows[0].group_code as string) === RAW_MATERIALS_CODE;

        if (isRaw) {
          req.body.tagNo = '';  // force blank for raw materials regardless of input
        } else if (incoming !== currentTag) {
          if (incoming) {
            const unique = await isTagNoUnique(pool, line.rows[0].project_id, incoming, id);
            if (!unique) return res.status(409).json({ error: 'Tag No already exists in this project' });
          }
          // Will log audit after successful UPDATE (below)
        }
      }

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
        installedOn: 'installed_on',
        model: 'model',
      };
      for (const [key, col] of Object.entries(updatable)) {
        if (req.body[key] !== undefined) {
          fields.push(`${col}=$${idx++}`);
          vals.push(key === 'technicalAttributes' ? JSON.stringify(req.body[key]) : req.body[key]);
        }
      }
      if (fields.length === 0) return sendValidationError(res, 'No updatable fields provided.');

      // ── is_user_modified: auto-flag when user edits a catalog-seeded line ────
      const CATALOG_SENSITIVE = new Set(['genericRequirement', 'quantity', 'specification', 'technicalAttributes']);
      const hasCatalogEdit = Object.keys(req.body).some(k => CATALOG_SENSITIVE.has(k));
      if (hasCatalogEdit && line.rows[0].source_package_line_id != null) {
        fields.push(`is_user_modified=true`);
      }

      fields.push(`updated_at=NOW()`);
      vals.push(id);
      const result = await pool.query(
        `UPDATE project_buy_list_lines SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, vals,
      );
      const updated = result.rows[0];

      // Audit log: record every manual tag change
      if (req.body.tagNo !== undefined) {
        const incoming   = (req.body.tagNo ?? '').toString().trim();
        const currentTag = (line.rows[0].current_tag_no ?? '') as string;
        const isRaw      = (line.rows[0].group_code as string) === RAW_MATERIALS_CODE;
        if (!isRaw && incoming !== currentTag) {
          const changedBy = (req.user as any)?.id as number | undefined;
          if (changedBy) {
            logTagNoChange(
              pool, id, line.rows[0].buy_list_header_id, line.rows[0].project_id,
              currentTag, incoming, changedBy,
            ).catch(() => {});
          }
        }
      }

      res.json(updated);
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
           WHERE p.product_code = $1 AND bph.status = 'active'
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
           (project_id, project_item_id, source_package_id, list_number, item_code)
         VALUES ($1,$2,$3,$4, (SELECT item_code FROM project_items WHERE id = $2)) RETURNING id`,
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
              certificate_required, compliance_required, source_package_line_id, installed_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            newId, i + 1, pl.buy_group_id, pl.buy_subgroup_id, pl.uom_id,
            pl.generic_requirement, pl.default_quantity, pl.default_specification,
            pl.technical_attributes, pl.selection_required, pl.datasheet_required,
            pl.inspection_required, pl.certificate_required, pl.compliance_required, pl.id,
            pl.installed_on ?? null,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — SELECTION & DATASHEET WORKFLOW
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Helper: fetch line + header context (used by all Phase 3 routes) ──────
  async function getLineCtx(lineId: number) {
    const r = await pool.query<{
      lineId: number; buyListHeaderId: number; tagNo: string;
      selectionRequired: boolean; datasheetRequired: boolean;
      lineStatus: string; headerStatus: string;
      projectId: number; continentCode: string; countryCode: string;
      fyCode: string; projectSeq: string; customerId: number | null;
      listNumber: string;
    }>(
      `SELECT
         l.id                   AS "lineId",
         l.buy_list_header_id   AS "buyListHeaderId",
         l.tag_no               AS "tagNo",
         l.selection_required   AS "selectionRequired",
         l.datasheet_required   AS "datasheetRequired",
         l.status               AS "lineStatus",
         h.status               AS "headerStatus",
         h.project_id           AS "projectId",
         h.list_number          AS "listNumber",
         p.continent_code       AS "continentCode",
         p.country_code         AS "countryCode",
         p.fy_code              AS "fyCode",
         p.project_seq          AS "projectSeq",
         p.customer_id          AS "customerId"
       FROM project_buy_list_lines l
       JOIN project_buy_list_headers h ON h.id = l.buy_list_header_id
       JOIN projects p ON p.id = h.project_id
       WHERE l.id = $1`,
      [lineId],
    );
    return r.rows[0] ?? null;
  }

  // ─── Helper: resolve customer bp_code for GCS path ────────────────────────
  async function resolveCustomerSegment(customerId: number | null, projectCode: string): Promise<string> {
    if (customerId) {
      const cr = await pool.query<{ bpCode: string }>(`SELECT bp_code AS "bpCode" FROM customers WHERE id = $1`, [customerId]);
      if (cr.rows[0]?.bpCode) return cr.rows[0].bpCode;
    }
    return projectCode.replace(/\D.*/, '') || 'UNK';
  }

  // ─── Helper: queue GCS object for deletion ────────────────────────────────
  async function queueGcsDeletion(bucket: string, objectPath: string, reason: string, requestedBy: number, projectId: number) {
    await pool.query(
      `INSERT INTO gcs_object_deletions
         (gcs_bucket, gcs_object_path, deletion_reason, deletion_policy, requested_by, project_id, document_type, status)
       VALUES ($1, $2, $3, 'auto', $4, $5, 'datasheet', 'pending')`,
      [bucket, objectPath, reason, requestedBy, projectId],
    );
  }

  // ─── POST /api/buy-list-lines/:id/select ─────────────────────────────────
  app.post('/api/buy-list-lines/:id/select', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const lineId = parseInt(req.params.id);
      if (isNaN(lineId)) return sendValidationError(res, 'Invalid line id');

      const { masterItemId, drawingNumber, drawingRevision, notes } = req.body;
      if (!masterItemId || isNaN(parseInt(masterItemId))) return sendValidationError(res, 'masterItemId is required');
      const mItemId = parseInt(masterItemId);

      const ctx = await getLineCtx(lineId);
      if (!ctx) return sendNotFound(res, 'Buy list line', lineId);

      if (!['released', 'locked'].includes(ctx.headerStatus)) {
        return sendBusinessError(res, 'Selection requires buy list status to be released or locked.');
      }

      // Verify master item exists and snapshot fields
      const miRow = await pool.query<{ id: number; itemCode: string; description: string; specification: string | null }>(
        `SELECT id, item_code AS "itemCode", description, specification FROM master_items WHERE id = $1`, [mItemId],
      );
      if (miRow.rowCount === 0) return sendNotFound(res, 'Master item', mItemId);
      const mi = miRow.rows[0];

      // Check existing selection
      const existSel = await pool.query(`SELECT id, approval_status, datasheet_uploaded, datasheet_gcs_bucket, datasheet_gcs_object_path FROM buy_list_line_selections WHERE buy_list_line_id = $1`, [lineId]);
      if (existSel.rowCount && existSel.rowCount > 0) {
        const ex = existSel.rows[0];
        if (ex.approval_status === 'approved') {
          return res.status(409).json({ error: 'Selection already approved. Cannot replace an approved selection.' });
        }
        // Queue GCS deletion if datasheet was uploaded
        if (ex.datasheet_uploaded && ex.datasheet_gcs_object_path) {
          await queueGcsDeletion(ex.datasheet_gcs_bucket, ex.datasheet_gcs_object_path, 'replaced by new selection', (req.user as any).id, ctx.projectId);
        }
        await pool.query(`DELETE FROM buy_list_line_selections WHERE id = $1`, [ex.id]);
      }

      const userId = (req.user as any).id;
      const ins = await pool.query<{ id: number }>(
        `INSERT INTO buy_list_line_selections
           (buy_list_line_id, master_item_id, item_code, item_description, item_specification,
            drawing_number, drawing_revision, selected_by, selected_at, datasheet_required, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10)
         RETURNING id`,
        [lineId, mItemId, mi.itemCode, mi.description, mi.specification ?? null,
         drawingNumber ?? null, drawingRevision ?? null, userId, ctx.datasheetRequired, notes ?? null],
      );

      // Update line status
      await pool.query(
        `UPDATE project_buy_list_lines SET status = 'selected', updated_at = NOW() WHERE id = $1`,
        [lineId],
      );

      res.status(201).json({ selectionId: ins.rows[0].id, lineId, masterItemId: mItemId });
    } catch (err) { sendError(res, err); }
  });

  // ─── PATCH /api/buy-list-lines/:id/selection ──────────────────────────────
  app.patch('/api/buy-list-lines/:id/selection', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const lineId = parseInt(req.params.id);
      if (isNaN(lineId)) return sendValidationError(res, 'Invalid line id');

      const sel = await pool.query(`SELECT id, approval_status FROM buy_list_line_selections WHERE buy_list_line_id = $1`, [lineId]);
      if (!sel.rowCount || sel.rowCount === 0) return sendNotFound(res, 'Selection for line', lineId);
      const s = sel.rows[0];
      if (s.approval_status === 'approved') {
        return sendBusinessError(res, 'Cannot edit an approved selection.');
      }

      const { drawingNumber, drawingRevision, notes } = req.body;
      await pool.query(
        `UPDATE buy_list_line_selections
         SET drawing_number = COALESCE($1, drawing_number),
             drawing_revision = COALESCE($2, drawing_revision),
             notes = COALESCE($3, notes),
             updated_at = NOW()
         WHERE id = $4`,
        [drawingNumber ?? null, drawingRevision ?? null, notes ?? null, s.id],
      );

      const updated = await pool.query(`SELECT * FROM buy_list_line_selections WHERE id = $1`, [s.id]);
      res.json(updated.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/buy-list-lines/:id/selection/upload-datasheet ──────────────
  app.post(
    '/api/buy-list-lines/:id/selection/upload-datasheet',
    ensureAuthenticated,
    PAGE,
    dsUpload.single('datasheet'),
    async (req: Request, res: Response) => {
      try {
        const lineId = parseInt(req.params.id);
        if (isNaN(lineId)) return sendValidationError(res, 'Invalid line id');

        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) return sendValidationError(res, 'No file uploaded. Use multipart/form-data field name "datasheet".');

        const ctx = await getLineCtx(lineId);
        if (!ctx) return sendNotFound(res, 'Buy list line', lineId);

        if (!['released', 'locked'].includes(ctx.headerStatus)) {
          return sendBusinessError(res, 'Datasheet upload requires buy list status to be released or locked.');
        }

        const selRow = await pool.query(
          `SELECT id, approval_status, datasheet_uploaded, datasheet_gcs_bucket, datasheet_gcs_object_path, datasheet_revision_seq FROM buy_list_line_selections WHERE buy_list_line_id = $1`,
          [lineId],
        );
        if (!selRow.rowCount || selRow.rowCount === 0) return sendBusinessError(res, 'No selection exists for this line. Call POST /select first.');
        const sel = selRow.rows[0];
        if (sel.approval_status === 'approved') return sendBusinessError(res, 'Selection is already approved. Cannot re-upload datasheet.');

        const userId = (req.user as any).id;
        let revisionSeq: number = sel.datasheet_revision_seq;

        // On re-upload after rejection: increment revision_seq; queue old GCS path for deletion
        if (sel.approval_status === 'rejected' && sel.datasheet_uploaded && sel.datasheet_gcs_object_path) {
          await queueGcsDeletion(sel.datasheet_gcs_bucket, sel.datasheet_gcs_object_path, 'superseded by re-upload after rejection', userId, ctx.projectId);
          revisionSeq = sel.datasheet_revision_seq + 1;
        }

        // G1: Canonical GCS path via governance resolver (Dual-Storage Policy)
        const custSegment = await resolveCustomerSegment(ctx.customerId, '');
        const safeTag = sanitizeTagNo(ctx.tagNo) || 'NO_TAG';
        const ext = mimeToExt(file.mimetype);
        let gcsObjectPath: string;
        try {
          gcsObjectPath = await resolveGcsPath('PPPC_DATASHEET', {
            CC:     ctx.continentCode,
            CO:     ctx.countryCode,
            Cust:   custSegment,
            FY:     ctx.fyCode,
            NNN:    ctx.projectSeq,
            ListNo: ctx.listNumber,
            Tag:    safeTag,
            Seq:    String(lineId),
            rev:    String(revisionSeq),
            ext,
          });
        } catch (e: any) {
          if (e instanceof GcsGovernanceError) return res.status(503).json({ error: 'GCS_GOVERNANCE_ERROR', message: e.message });
          throw e;
        }
        const gcsBucket = GCS_BUCKET ?? 'thermopac_storage';

        // SHA-256 checksum
        const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

        // Upload to GCS (G1 write — must succeed before any DB record is created)
        const uploadResult = await uploadFileWithDiagnostics(gcsObjectPath, file.buffer, file.mimetype);
        if (!uploadResult.successful) {
          console.error('[PPPC Phase3] GCS upload failed:', uploadResult.error);
          return res.status(502).json({ error: 'GCS upload failed.', detail: String(uploadResult.error) });
        }

        // Update selection record (DB record created AFTER GCS success)
        await pool.query(
          `UPDATE buy_list_line_selections SET
             datasheet_uploaded         = true,
             datasheet_gcs_bucket       = $1,
             datasheet_gcs_object_path  = $2,
             datasheet_original_filename = $3,
             datasheet_mime_type        = $4,
             datasheet_file_size_bytes  = $5,
             datasheet_checksum_sha256  = $6,
             datasheet_revision_seq     = $7,
             datasheet_uploaded_by      = $8,
             datasheet_uploaded_at      = NOW(),
             approval_status            = 'pending',
             rejection_reason           = NULL,
             updated_at                 = NOW()
           WHERE id = $9`,
          [gcsBucket, gcsObjectPath, file.originalname, file.mimetype, file.size, checksum, revisionSeq, userId, sel.id],
        );

        // G2: Enqueue SAVE_FILE mirror job (Dual-Storage Policy — GCS → Windows)
        try {
          const mirrorJobRes = await pool.query(
            `INSERT INTO document_agent_jobs
               (job_type, status, relative_path, file_url, file_name, expected_sha256,
                source_module, source_record_id, created_by)
             VALUES ('SAVE_FILE', 'pending', $1, NULL, $2, $3, 'buy_list_line_selections', $4, $5)
             RETURNING id`,
            [gcsObjectPath, file.originalname, checksum, sel.id, userId],
          );
          const mirrorJobId = mirrorJobRes.rows[0].id as number;
          // G3: Mark mirror_status on source record
          await pool.query(
            `UPDATE buy_list_line_selections SET mirror_status = 'pending', mirror_job_id = $1 WHERE id = $2`,
            [mirrorJobId, sel.id],
          );
        } catch (mirrorErr) {
          // Mirror failure NEVER invalidates the GCS copy or DB record (Dual-Storage Policy)
          console.error('[PPPC] Mirror job enqueue failed — GCS copy remains valid:', mirrorErr);
        }

        // Update line status to datasheet_submitted
        await pool.query(
          `UPDATE project_buy_list_lines SET status = 'datasheet_submitted', updated_at = NOW() WHERE id = $1`,
          [lineId],
        );

        res.json({
          success: true,
          gcsObjectPath,
          gcsBucket,
          revisionSeq,
          checksum,
          originalFilename: file.originalname,
        });
      } catch (err) { sendError(res, err); }
    },
  );

  // ─── POST /api/buy-list-lines/:id/selection/approve ───────────────────────
  app.post('/api/buy-list-lines/:id/selection/approve', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;

      const lineId = parseInt(req.params.id);
      if (isNaN(lineId)) return sendValidationError(res, 'Invalid line id');

      const ctx = await getLineCtx(lineId);
      if (!ctx) return sendNotFound(res, 'Buy list line', lineId);

      if (!['released', 'locked'].includes(ctx.headerStatus)) {
        return sendBusinessError(res, 'Approval requires buy list status to be released or locked.');
      }

      const selRow = await pool.query(
        `SELECT id, master_item_id, approval_status, datasheet_required, datasheet_uploaded FROM buy_list_line_selections WHERE buy_list_line_id = $1`,
        [lineId],
      );
      if (!selRow.rowCount || selRow.rowCount === 0) return sendBusinessError(res, 'No selection exists for this line.');
      const sel = selRow.rows[0];

      if (sel.approval_status === 'approved') return sendBusinessError(res, 'Selection is already approved.');
      if (sel.approval_status === 'rejected') return sendBusinessError(res, 'Cannot approve after rejection — re-upload datasheet first.');
      if (sel.datasheet_required && !sel.datasheet_uploaded) {
        return sendBusinessError(res, 'Datasheet must be uploaded before approval when datasheet_required is true.');
      }

      const userId = (req.user as any).id;

      await pool.query(
        `UPDATE buy_list_line_selections SET
           approval_status = 'approved',
           approved_by     = $1,
           approved_at     = NOW(),
           updated_at      = NOW()
         WHERE id = $2`,
        [userId, sel.id],
      );

      // Update line: status = 'approved', selected_master_item_id
      await pool.query(
        `UPDATE project_buy_list_lines SET
           status                  = 'approved',
           selected_master_item_id = $1,
           updated_at              = NOW()
         WHERE id = $2`,
        [sel.master_item_id, lineId],
      );

      res.json({ success: true, lineId, masterItemId: sel.master_item_id });
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/buy-list-lines/:id/selection/reject ────────────────────────
  app.post('/api/buy-list-lines/:id/selection/reject', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;

      const lineId = parseInt(req.params.id);
      if (isNaN(lineId)) return sendValidationError(res, 'Invalid line id');

      const { rejectionReason } = req.body;
      if (!rejectionReason || !String(rejectionReason).trim()) {
        return sendValidationError(res, 'rejectionReason is required');
      }

      const ctx = await getLineCtx(lineId);
      if (!ctx) return sendNotFound(res, 'Buy list line', lineId);

      if (!['released', 'locked'].includes(ctx.headerStatus)) {
        return sendBusinessError(res, 'Rejection requires buy list status to be released or locked.');
      }

      const selRow = await pool.query(
        `SELECT id, approval_status, datasheet_uploaded FROM buy_list_line_selections WHERE buy_list_line_id = $1`,
        [lineId],
      );
      if (!selRow.rowCount || selRow.rowCount === 0) return sendBusinessError(res, 'No selection exists for this line.');
      const sel = selRow.rows[0];
      if (sel.approval_status === 'approved') return sendBusinessError(res, 'Cannot reject an already approved selection.');
      if (!sel.datasheet_uploaded) return sendBusinessError(res, 'Cannot reject before a datasheet has been uploaded.');

      await pool.query(
        `UPDATE buy_list_line_selections SET
           approval_status  = 'rejected',
           rejection_reason = $1,
           updated_at       = NOW()
         WHERE id = $2`,
        [String(rejectionReason).trim(), sel.id],
      );

      // Line status reverts to 'selected' (awaiting re-upload)
      await pool.query(
        `UPDATE project_buy_list_lines SET status = 'selected', updated_at = NOW() WHERE id = $1`,
        [lineId],
      );

      res.json({ success: true, lineId, rejectionReason: String(rejectionReason).trim() });
    } catch (err) { sendError(res, err); }
  });

  // ─── DELETE /api/buy-list-lines/:id/selection ─────────────────────────────
  app.delete('/api/buy-list-lines/:id/selection', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;

      const lineId = parseInt(req.params.id);
      if (isNaN(lineId)) return sendValidationError(res, 'Invalid line id');

      const ctx = await getLineCtx(lineId);
      if (!ctx) return sendNotFound(res, 'Buy list line', lineId);

      const selRow = await pool.query(
        `SELECT id, approval_status, datasheet_uploaded, datasheet_gcs_bucket, datasheet_gcs_object_path FROM buy_list_line_selections WHERE buy_list_line_id = $1`,
        [lineId],
      );
      if (!selRow.rowCount || selRow.rowCount === 0) return sendNotFound(res, 'Selection for line', lineId);
      const sel = selRow.rows[0];

      if (sel.approval_status === 'approved') {
        return sendBusinessError(res, 'Cannot delete an approved selection. The selection is locked.');
      }

      const userId = (req.user as any).id;

      // Queue GCS deletion if a datasheet was uploaded
      if (sel.datasheet_uploaded && sel.datasheet_gcs_object_path) {
        await queueGcsDeletion(sel.datasheet_gcs_bucket, sel.datasheet_gcs_object_path, 'selection deleted by manager', userId, ctx.projectId);
      }

      await pool.query(`DELETE FROM buy_list_line_selections WHERE id = $1`, [sel.id]);

      // Reset line status back to open
      await pool.query(
        `UPDATE project_buy_list_lines SET status = 'open', selected_master_item_id = NULL, updated_at = NOW() WHERE id = $1`,
        [lineId],
      );

      res.json({ success: true, lineId });
    } catch (err) { sendError(res, err); }
  });

  // ─── GET /api/buy-list-lines/:id/selection ────────────────────────────────
  app.get('/api/buy-list-lines/:id/selection', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const lineId = parseInt(req.params.id);
      if (isNaN(lineId)) return sendValidationError(res, 'Invalid line id');
      const r = await pool.query(
        `SELECT s.*,
                mi.item_code AS "masterItemCode",
                mi.description AS "masterItemDescription",
                u1.username AS "selectedByName",
                u2.username AS "approvedByName",
                u3.username AS "uploadedByName"
         FROM buy_list_line_selections s
         JOIN master_items mi ON mi.id = s.master_item_id
         JOIN users u1 ON u1.id = s.selected_by
         LEFT JOIN users u2 ON u2.id = s.approved_by
         LEFT JOIN users u3 ON u3.id = s.datasheet_uploaded_by
         WHERE s.buy_list_line_id = $1`,
        [lineId],
      );
      if (!r.rowCount || r.rowCount === 0) return res.status(404).json({ error: 'No selection for this line.' });
      res.json(r.rows[0]);
    } catch (err) { sendError(res, err); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4 — APPROVED BUY ITEMS TO PR / PO / QC
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Inline guards (mirror project-routes.ts pattern, uses pool directly) ─
  async function guardNotFrozen(projectId: number, res: Response): Promise<boolean> {
    const r = await pool.query(`SELECT status FROM projects WHERE id = $1`, [projectId]);
    if (!r.rows[0]) return true;
    if (isProjectFrozen(r.rows[0].status)) {
      const label = r.rows[0].status === 'canceled' ? 'canceled' : 'on hold';
      sendBusinessError(res, `Project is ${label} — no new records or status changes allowed.`);
      return false;
    }
    return true;
  }

  async function guardCostUnlocked(projectId: number, res: Response): Promise<boolean> {
    const r = await pool.query(`SELECT cost_lock_status FROM projects WHERE id = $1`, [projectId]);
    if (!r.rows[0]) return true;
    if ((r.rows[0].cost_lock_status ?? 'unlocked') === 'approved') {
      sendBusinessError(res, 'Cost is approved and locked — project items and BOMs cannot be modified.');
      return false;
    }
    return true;
  }

  // ─── POST /api/buy-list-lines/:id/raise-pr ────────────────────────────────
  app.post('/api/buy-list-lines/:id/raise-pr', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const lineId = parseInt(req.params.id);
      if (isNaN(lineId)) return sendValidationError(res, 'Invalid line id');

      // ── Fetch full line + header + project context ────────────────────────
      const ctxRow = await pool.query<{
        lineId: number; buyListHeaderId: number; tagNo: string;
        serviceDescription: string; equipmentReference: string;
        lineStatus: string; headerStatus: string;
        projectId: number; projectCode: string;
        selectedMasterItemId: number | null; planningRecordId: number | null;
        quantity: string;
      }>(
        `SELECT
           l.id                        AS "lineId",
           l.buy_list_header_id        AS "buyListHeaderId",
           l.tag_no                    AS "tagNo",
           l.service_description       AS "serviceDescription",
           l.equipment_reference       AS "equipmentReference",
           l.status                    AS "lineStatus",
           l.selected_master_item_id   AS "selectedMasterItemId",
           l.planning_record_id        AS "planningRecordId",
           l.quantity                  AS "quantity",
           h.status                    AS "headerStatus",
           h.project_id                AS "projectId",
           p.code                      AS "projectCode"
         FROM project_buy_list_lines l
         JOIN project_buy_list_headers h ON h.id = l.buy_list_header_id
         JOIN projects p ON p.id = h.project_id
         WHERE l.id = $1`,
        [lineId],
      );
      if (!ctxRow.rowCount || ctxRow.rowCount === 0) return sendNotFound(res, 'Buy list line', lineId);
      const ctx = ctxRow.rows[0];

      // ── Pre-guards ────────────────────────────────────────────────────────
      if (ctx.lineStatus !== 'approved') {
        return sendBusinessError(res, `Line must be approved before raising PR (current status: ${ctx.lineStatus}).`);
      }
      if (!['released', 'locked'].includes(ctx.headerStatus)) {
        return sendBusinessError(res, 'Buy list must be in released or locked status to raise PR.');
      }
      if (!(await guardNotFrozen(ctx.projectId, res))) return;
      if (!(await guardCostUnlocked(ctx.projectId, res))) return;

      // ── Duplicate prevention ──────────────────────────────────────────────
      if (ctx.planningRecordId) {
        const pr = await pool.query(
          `SELECT id, status FROM item_planning_records WHERE id = $1`,
          [ctx.planningRecordId],
        );
        if (pr.rows[0] && !['canceled', 'superseded'].includes(pr.rows[0].status)) {
          return res.status(409).json({
            error: 'Planning record already active for this line.',
            planningRecordId: ctx.planningRecordId,
            planningStatus: pr.rows[0].status,
          });
        }
      }

      const userId = (req.user as any).id;
      const qty = parseFloat(ctx.quantity) || 1;

      // ── project_items dedup: (master_item_id + tag_no) or (tag_no only when no master) ──
      let projectItemId: number;
      let isReused = false;

      if (ctx.selectedMasterItemId) {
        const piDedup = await pool.query<{ id: number }>(
          `SELECT id FROM project_items
           WHERE project_id = $1 AND item_id = $2 AND tag_no = $3
             AND source = 'buy_list' AND status != 'Cancelled' LIMIT 1`,
          [ctx.projectId, ctx.selectedMasterItemId, ctx.tagNo],
        );
        if (piDedup.rows[0]) {
          projectItemId = piDedup.rows[0].id;
          isReused = true;
          await pool.query(`UPDATE project_items SET required_quantity=$1, updated_at=NOW() WHERE id=$2`, [qty, projectItemId]);
        } else {
          const piIns = await pool.query<{ id: number }>(
            `INSERT INTO project_items (project_id,project_code,item_id,quantity,required_quantity,source,tag_no,notes,status,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,'buy_list',$6,$7,'Not Started',NOW(),NOW()) RETURNING id`,
            [ctx.projectId, ctx.projectCode, ctx.selectedMasterItemId, qty, qty, ctx.tagNo,
             `BUY LIST: ${ctx.tagNo}${ctx.serviceDescription ? ' | ' + ctx.serviceDescription : ''}`],
          );
          projectItemId = piIns.rows[0].id;
        }
      } else {
        // Direct-approved line — no master item yet; create project_item placeholder
        const piIns = await pool.query<{ id: number }>(
          `INSERT INTO project_items (project_id,project_code,item_id,quantity,required_quantity,source,tag_no,notes,status,created_at,updated_at)
           VALUES ($1,$2,NULL,$3,$4,'buy_list',$5,$6,'Not Started',NOW(),NOW()) RETURNING id`,
          [ctx.projectId, ctx.projectCode, qty, qty, ctx.tagNo,
           `BUY LIST: ${ctx.tagNo}${ctx.serviceDescription ? ' | ' + ctx.serviceDescription : ''}`],
        );
        projectItemId = piIns.rows[0].id;
      }

      // ── Generate planning number: {projectCode}-PLN-{seq} ─────────────────
      const seq = await getNextDocSeq('PLN', ctx.projectId, pool);
      const planningNumber = `${ctx.projectCode}-PLN-${seq}`;
      const planningNotes = [
        ctx.tagNo ? `Tag: ${ctx.tagNo}` : null,
        ctx.serviceDescription || null,
        ctx.equipmentReference || null,
      ].filter(Boolean).join(' | ');

      // ── INSERT item_planning_records ──────────────────────────────────────
      const plnIns = await pool.query<{ id: number }>(
        `INSERT INTO item_planning_records
           (project_id, project_item_id, master_item_id, planning_type, source,
            source_buy_list_header_id, source_buy_list_line_id,
            quantity, notes, planning_number, status, created_by,
            created_at, updated_at)
         VALUES ($1,$2,$3,'procurement','buy_list',$4,$5,$6,$7,$8,'draft',$9,NOW(),NOW())
         RETURNING id`,
        [
          ctx.projectId, projectItemId, ctx.selectedMasterItemId,
          ctx.buyListHeaderId, lineId,
          qty, planningNotes, planningNumber,
          userId,
        ],
      );
      const planningRecordId = plnIns.rows[0].id;

      // ── Link back to line ─────────────────────────────────────────────────
      await pool.query(
        `UPDATE project_buy_list_lines SET planning_record_id = $1, updated_at = NOW() WHERE id = $2`,
        [planningRecordId, lineId],
      );

      // ── Create PLC line (idempotent — skips if already exists) ───────────
      const plcClient = await pool.connect();
      try {
        await plcClient.query('BEGIN');
        await createPlcLineInTx(plcClient, {
          projectId: ctx.projectId,
          projectCode: ctx.projectCode,
          planningRecordId,
          planningNumber,
          sourceBuyListHeaderId: ctx.buyListHeaderId,
          sourceBuyListLineId: lineId,
          masterItemId: ctx.selectedMasterItemId ?? null,
          tagNo: ctx.tagNo ?? null,
          serviceDescription: ctx.serviceDescription ?? null,
          equipmentReference: ctx.equipmentReference ?? null,
          subgroupCode: null,
          subgroupLabel: null,
          qtyRequired: parseFloat(ctx.quantity) || 1,
          createdBy: userId,
        });
        await plcClient.query('COMMIT');
      } catch (plcErr: any) {
        await plcClient.query('ROLLBACK');
        console.warn('[PLC] createPlcLineInTx failed for line', lineId, plcErr.message);
      } finally {
        plcClient.release();
      }

      res.status(201).json({ success: true, planningRecordId, projectItemId, isReused });
    } catch (err) { sendError(res, err); }
  });

  // ─── GET /api/buy-lists/:id/procurement-status ────────────────────────────
  app.get('/api/buy-lists/:id/procurement-status', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const headerId = parseInt(req.params.id);
      if (isNaN(headerId)) return sendValidationError(res, 'Invalid buy list id');

      const hdr = await pool.query(`SELECT id FROM project_buy_list_headers WHERE id = $1`, [headerId]);
      if (!hdr.rowCount || hdr.rowCount === 0) return sendNotFound(res, 'Buy list', headerId);

      const result = await pool.query(
        `SELECT
           l.id                          AS "lineId",
           l.tag_no                      AS "tagNo",
           l.status                      AS "lineStatus",
           l.planning_record_id          AS "planningRecordId",
           ipr.status                    AS "planningStatus",
           ipr.planning_number           AS "planningNumber",
           per.id                        AS "procurementExecutionId",
           per.status                    AS "procurementStatus",
           ppr.id                        AS "poPrepId",
           ppr.status                    AS "poPrepStatus",
           epo.id                        AS "epcPoId",
           epo.status                    AS "epcPoStatus",
           epo.po_number                 AS "epcPoNumber",
           qpr.id                        AS "qualityPlanId",
           qpr.status                    AS "qualityStatus"
         FROM project_buy_list_lines l
         LEFT JOIN item_planning_records       ipr ON ipr.id  = l.planning_record_id
         LEFT JOIN procurement_execution_records per ON per.planning_record_id = ipr.id
         LEFT JOIN po_preparation_records      ppr ON ppr.execution_record_id = per.id
         LEFT JOIN epc_purchase_orders         epo ON epo.po_preparation_id   = ppr.id
         LEFT JOIN quality_planning_records    qpr ON qpr.planning_record_id  = ipr.id
         WHERE l.buy_list_header_id = $1
         ORDER BY l.line_number`,
        [headerId],
      );

      res.json({ lines: result.rows });
    } catch (err) { sendError(res, err); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5 — BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── GET /api/pppc/buy-items — Buy master items for selection picker ────────
  app.get('/api/pppc/buy-items', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'max-age=300');
    try {
      const r = await pool.query(
        `SELECT id, item_code, description, specification, uom
         FROM master_items
         WHERE LOWER(make_or_buy) IN ('buy','b')
         ORDER BY item_code`,
      );
      res.json(r.rows);
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/buy-lists/:id/bulk-select ─────────────────────────────────
  app.post('/api/buy-lists/:id/bulk-select', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const headerId = parseInt(req.params.id);
      if (isNaN(headerId)) return sendValidationError(res, 'Invalid buy list id');

      const { lines } = req.body as { lines: { lineId: number; masterItemId: number; drawingNumber?: string; drawingRevision?: string }[] };
      if (!Array.isArray(lines) || lines.length === 0) return sendValidationError(res, 'lines[] is required');

      const hdr = await pool.query(`SELECT id, status, project_id FROM project_buy_list_headers WHERE id = $1`, [headerId]);
      if (!hdr.rowCount || hdr.rowCount === 0) return sendNotFound(res, 'Buy list', headerId);
      const { status: hdrStatus } = hdr.rows[0];
      if (!['released', 'locked'].includes(hdrStatus)) return sendBusinessError(res, 'Bulk select requires buy list to be released or locked.');

      const userId = (req.user as any).id;
      const results: any[] = [];
      const errors: any[] = [];
      let succeeded = 0; let skipped = 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const item of lines) {
          const spName = `sp_${item.lineId}`;
          await client.query(`SAVEPOINT ${spName}`);
          try {
            const lineRow = await client.query(
              `SELECT l.id, l.status, l.datasheet_required, l.tag_no, h.project_id
               FROM project_buy_list_lines l JOIN project_buy_list_headers h ON h.id = l.buy_list_header_id
               WHERE l.id = $1 AND l.buy_list_header_id = $2`,
              [item.lineId, headerId],
            );
            if (!lineRow.rowCount || lineRow.rowCount === 0) throw new Error('Line not found in this buy list');
            const line = lineRow.rows[0];
            if (line.status === 'approved') { await client.query(`RELEASE SAVEPOINT ${spName}`); skipped++; results.push({ lineId: item.lineId, status: 'skipped', reason: 'already approved' }); continue; }

            const miRow = await client.query(`SELECT id, item_code, description, specification FROM master_items WHERE id = $1`, [item.masterItemId]);
            if (!miRow.rowCount || miRow.rowCount === 0) throw new Error(`Master item ${item.masterItemId} not found`);
            const mi = miRow.rows[0];

            const existSel = await client.query(`SELECT id, datasheet_uploaded, datasheet_gcs_bucket, datasheet_gcs_object_path FROM buy_list_line_selections WHERE buy_list_line_id = $1`, [item.lineId]);
            if (existSel.rowCount && existSel.rowCount > 0) {
              const ex = existSel.rows[0];
              if (ex.datasheet_uploaded && ex.datasheet_gcs_object_path) {
                await client.query(`INSERT INTO gcs_object_deletions (gcs_bucket,gcs_object_path,deletion_reason,deletion_policy,requested_by,project_id,document_type,status) VALUES($1,$2,'replaced by bulk select','auto',$3,$4,'datasheet','pending')`, [ex.datasheet_gcs_bucket, ex.datasheet_gcs_object_path, userId, line.project_id]);
              }
              await client.query(`DELETE FROM buy_list_line_selections WHERE id = $1`, [ex.id]);
            }

            await client.query(
              `INSERT INTO buy_list_line_selections (buy_list_line_id,master_item_id,item_code,item_description,item_specification,drawing_number,drawing_revision,selected_by,selected_at,datasheet_required) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9)`,
              [item.lineId, mi.id, mi.item_code, mi.description, mi.specification ?? null, item.drawingNumber ?? null, item.drawingRevision ?? null, userId, line.datasheet_required],
            );
            await client.query(`UPDATE project_buy_list_lines SET status='selected', updated_at=NOW() WHERE id=$1`, [item.lineId]);
            await client.query(`RELEASE SAVEPOINT ${spName}`);
            succeeded++; results.push({ lineId: item.lineId, status: 'ok' });
          } catch (e: any) {
            await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
            await client.query(`RELEASE SAVEPOINT ${spName}`);
            errors.push({ lineId: item.lineId, error: e.message });
          }
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

      res.json({ processed: lines.length, succeeded, skipped, errors, results });
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/buy-lists/:id/bulk-approve ─────────────────────────────────
  app.post('/api/buy-lists/:id/bulk-approve', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const headerId = parseInt(req.params.id);
      if (isNaN(headerId)) return sendValidationError(res, 'Invalid buy list id');

      const { lineIds, approvalNote } = req.body as { lineIds: number[]; approvalNote?: string };
      if (!Array.isArray(lineIds) || lineIds.length === 0) return sendValidationError(res, 'lineIds[] is required');

      const hdr = await pool.query(`SELECT status FROM project_buy_list_headers WHERE id = $1`, [headerId]);
      if (!hdr.rowCount || hdr.rowCount === 0) return sendNotFound(res, 'Buy list', headerId);
      if (!['released', 'locked'].includes(hdr.rows[0].status)) return sendBusinessError(res, 'Bulk approve requires buy list to be released or locked.');

      const userId = (req.user as any).id;
      const results: any[] = []; const errors: any[] = [];
      let succeeded = 0; let skipped = 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const lineId of lineIds) {
          const spName = `sp_${lineId}`;
          await client.query(`SAVEPOINT ${spName}`);
          try {
            const lineRow = await client.query(`SELECT id, status FROM project_buy_list_lines WHERE id = $1 AND buy_list_header_id = $2`, [lineId, headerId]);
            if (!lineRow.rowCount || lineRow.rowCount === 0) throw new Error('Line not found in this buy list');

            const selRow = await client.query(`SELECT id, master_item_id, approval_status, datasheet_required, datasheet_uploaded FROM buy_list_line_selections WHERE buy_list_line_id = $1`, [lineId]);
            if (!selRow.rowCount || selRow.rowCount === 0) throw new Error('No selection exists for this line');
            const sel = selRow.rows[0];

            if (sel.approval_status === 'approved') { await client.query(`RELEASE SAVEPOINT ${spName}`); skipped++; results.push({ lineId, status: 'skipped', reason: 'already approved' }); continue; }
            if (sel.approval_status === 'rejected') throw new Error('Cannot approve after rejection — re-upload datasheet first');
            if (sel.datasheet_required && !sel.datasheet_uploaded) throw new Error('Datasheet required but not uploaded');

            await client.query(`UPDATE buy_list_line_selections SET approval_status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2`, [userId, sel.id]);
            await client.query(`UPDATE project_buy_list_lines SET status='approved', selected_master_item_id=$1, updated_at=NOW() WHERE id=$2`, [sel.master_item_id, lineId]);
            await client.query(`RELEASE SAVEPOINT ${spName}`);
            succeeded++; results.push({ lineId, status: 'ok' });
          } catch (e: any) {
            await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
            await client.query(`RELEASE SAVEPOINT ${spName}`);
            errors.push({ lineId, error: e.message });
          }
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

      res.json({ processed: lineIds.length, succeeded, skipped, errors, results });
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/buy-lists/:id/bulk-direct-approve ──────────────────────────
  // Approves buy list lines directly (no vendor/master-item required).
  // Vendor assignment happens later on the PLC page after bid evaluation.
  app.post('/api/buy-lists/:id/bulk-direct-approve', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const headerId = parseInt(req.params.id);
      if (isNaN(headerId)) return sendValidationError(res, 'Invalid buy list id');

      const { lineIds } = req.body as { lineIds: number[] };
      if (!Array.isArray(lineIds) || lineIds.length === 0) return sendValidationError(res, 'lineIds[] is required');

      const hdr = await pool.query(`SELECT status FROM project_buy_list_headers WHERE id = $1`, [headerId]);
      if (!hdr.rowCount || hdr.rowCount === 0) return sendNotFound(res, 'Buy list', headerId);
      if (!['released', 'locked'].includes(hdr.rows[0].status))
        return sendBusinessError(res, 'Buy list must be released or locked to approve lines.');

      const userId = (req.user as any).id;
      const results: any[] = []; const errors: any[] = [];
      let succeeded = 0; let skipped = 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const lineId of lineIds) {
          const spName = `sp_${lineId}`;
          await client.query(`SAVEPOINT ${spName}`);
          try {
            const lineRow = await client.query(
              `SELECT id, status FROM project_buy_list_lines WHERE id = $1 AND buy_list_header_id = $2`,
              [lineId, headerId]
            );
            if (!lineRow.rowCount || lineRow.rowCount === 0) throw new Error('Line not found in this buy list');
            const line = lineRow.rows[0];

            if (line.status === 'approved') {
              await client.query(`RELEASE SAVEPOINT ${spName}`);
              skipped++;
              results.push({ lineId, status: 'skipped', reason: 'already approved' });
              continue;
            }
            if (['canceled', 'obsolete'].includes(line.status)) {
              throw new Error(`Cannot approve a ${line.status} line`);
            }

            await client.query(
              `UPDATE project_buy_list_lines SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2`,
              [userId, lineId]
            );
            await client.query(`RELEASE SAVEPOINT ${spName}`);
            succeeded++;
            results.push({ lineId, status: 'ok' });
          } catch (e: any) {
            await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
            await client.query(`RELEASE SAVEPOINT ${spName}`);
            errors.push({ lineId, error: e.message });
          }
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

      res.json({ processed: lineIds.length, succeeded, skipped, errors, results });
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/buy-lists/:id/raise-pr-all ─────────────────────────────────
  // Raises PR for all eligible lines (open/selected/approved) without needing lineIds from caller.
  app.post('/api/buy-lists/:id/raise-pr-all', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const headerId = parseInt(req.params.id);
      if (isNaN(headerId)) return sendValidationError(res, 'Invalid buy list id');
      const hdr = await pool.query(`SELECT h.status, h.project_id, p.status AS proj_status, p.cost_lock_status, p.code AS project_code FROM project_buy_list_headers h JOIN projects p ON p.id = h.project_id WHERE h.id = $1`, [headerId]);
      if (!hdr.rowCount || hdr.rowCount === 0) return sendNotFound(res, 'Buy list', headerId);
      const h = hdr.rows[0];
      if (!['released', 'locked'].includes(h.status)) return sendBusinessError(res, 'Raise-all requires buy list to be released or locked.');
      if (isProjectFrozen(h.proj_status)) return sendBusinessError(res, 'Project is frozen — no new records allowed.');
      if ((h.cost_lock_status ?? 'unlocked') === 'approved') return sendBusinessError(res, 'Cost is locked — project items cannot be modified.');
      // Fetch all eligible line IDs
      const eligibleRows = await pool.query(
        `SELECT id FROM project_buy_list_lines WHERE buy_list_header_id=$1 AND status NOT IN ('canceled','obsolete','pr_raised') ORDER BY line_number`,
        [headerId],
      );
      const lineIds: number[] = eligibleRows.rows.map((r: any) => r.id);
      if (lineIds.length === 0) return res.json({ succeeded: 0, errors: [], results: [], message: 'No eligible lines to raise.' });
      // Delegate to bulk-raise-pr logic via internal re-route
      req.body = { lineIds };
      // fall through by calling the shared handler inline
      const userId = (req.user as any).id;
      const seRes = await pool.query(`SELECT id FROM users WHERE role='Senior Executive' AND department='Purchase' AND is_active=true ORDER BY id LIMIT 1`);
      const purchaseAssigneeId: number | null = seRes.rows[0]?.id ?? null;
      const results: any[] = []; const errors: any[] = [];
      let succeeded = 0;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const lineId of lineIds) {
          const spName = `sp_${lineId}`;
          await client.query(`SAVEPOINT ${spName}`);
          try {
            const lineRow = await client.query(
              `SELECT l.id, l.status, l.tag_no, l.service_description, l.generic_requirement,
                      l.equipment_reference, l.quantity, l.selected_master_item_id, l.planning_record_id
               FROM project_buy_list_lines l WHERE l.id = $1 AND l.buy_list_header_id = $2`,
              [lineId, headerId],
            );
            if (!lineRow.rowCount || lineRow.rowCount === 0) throw new Error('Line not found');
            const line = lineRow.rows[0];
            if (line.planning_record_id) {
              const pr = await client.query(`SELECT status FROM item_planning_records WHERE id = $1`, [line.planning_record_id]);
              if (pr.rows[0] && !['canceled', 'superseded'].includes(pr.rows[0].status)) throw new Error('Active planning record already exists');
            }
            const qty = parseFloat(line.quantity) || 1;
            let projectItemId: number;
            if (line.selected_master_item_id) {
              const piDedup = await client.query(`SELECT id FROM project_items WHERE project_id=$1 AND item_id=$2 AND tag_no=$3 AND source='buy_list' AND status!='Cancelled' LIMIT 1`, [h.project_id, line.selected_master_item_id, line.tag_no]);
              if (piDedup.rows[0]) {
                projectItemId = piDedup.rows[0].id;
                await client.query(`UPDATE project_items SET required_quantity=$1, make_or_buy='Buy', updated_at=NOW() WHERE id=$2`, [qty, projectItemId]);
              } else {
                const piIns = await client.query<{ id: number }>(`INSERT INTO project_items (project_id,project_code,item_id,quantity,required_quantity,source,make_or_buy,tag_no,notes,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'buy_list','Buy',$6,$7,'Not Started',NOW(),NOW()) RETURNING id`,
                  [h.project_id, h.project_code, line.selected_master_item_id, qty, qty, line.tag_no,
                   `BUY LIST: ${line.tag_no}${line.service_description ? ' | ' + line.service_description : ''}`]);
                projectItemId = piIns.rows[0].id;
              }
            } else {
              const piIns = await client.query<{ id: number }>(`INSERT INTO project_items (project_id,project_code,item_id,quantity,required_quantity,source,make_or_buy,tag_no,notes,status,created_at,updated_at) VALUES($1,$2,NULL,$3,$4,'buy_list','Buy',$5,$6,'Not Started',NOW(),NOW()) RETURNING id`,
                [h.project_id, h.project_code, qty, qty, line.tag_no,
                 `BUY LIST: ${line.tag_no}${line.service_description ? ' | ' + line.service_description : ''}`]);
              projectItemId = piIns.rows[0].id;
            }
            const seq = await getNextDocSeq('PLN', h.project_id, pool);
            const planningNumber = `${h.project_code}-PLN-${seq}`;
            const notes = [line.tag_no ? `Tag: ${line.tag_no}` : null, line.service_description || null, line.equipment_reference || null].filter(Boolean).join(' | ');
            const plnIns = await client.query<{ id: number }>(
              `INSERT INTO item_planning_records (project_id,project_item_id,master_item_id,planning_type,source,source_buy_list_header_id,source_buy_list_line_id,quantity,notes,planning_number,status,assigned_to,created_by,created_at,updated_at) VALUES($1,$2,$3,'procurement','buy_list',$4,$5,$6,$7,$8,'draft',$9,$10,NOW(),NOW()) RETURNING id`,
              [h.project_id, projectItemId, line.selected_master_item_id, headerId, lineId, qty, notes, planningNumber, purchaseAssigneeId, userId],
            );
            const planningRecordId = plnIns.rows[0].id;
            await client.query(`UPDATE project_buy_list_lines SET planning_record_id=$1, updated_at=NOW() WHERE id=$2`, [planningRecordId, lineId]);
            try {
              await createPlcLineInTx(client, {
                projectId: h.project_id, projectCode: h.project_code, planningRecordId, planningNumber,
                sourceBuyListHeaderId: headerId, sourceBuyListLineId: lineId,
                masterItemId: line.selected_master_item_id, tagNo: line.tag_no ?? null,
                serviceDescription: line.service_description || line.generic_requirement || null,
                equipmentReference: line.equipment_reference ?? null,
                subgroupCode: null, subgroupLabel: null, qtyRequired: qty, createdBy: userId,
              });
            } catch (plcErr: any) {
              console.warn('[PLC] createPlcLineInTx failed in raise-pr-all for line', lineId, plcErr.message);
            }
            await client.query(`RELEASE SAVEPOINT ${spName}`);
            succeeded++; results.push({ lineId, status: 'ok', planningRecordId });
          } catch (e: any) {
            await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
            errors.push({ lineId, error: e.message });
          }
        }
        await client.query('COMMIT');
      } catch (txErr) { await client.query('ROLLBACK'); throw txErr; }
      finally { client.release(); }
      res.json({ succeeded, errors, results });
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/buy-lists/:id/bulk-raise-pr ────────────────────────────────
  app.post('/api/buy-lists/:id/bulk-raise-pr', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const headerId = parseInt(req.params.id);
      if (isNaN(headerId)) return sendValidationError(res, 'Invalid buy list id');

      const { lineIds } = req.body as { lineIds: number[] };
      if (!Array.isArray(lineIds) || lineIds.length === 0) return sendValidationError(res, 'lineIds[] is required');

      const hdr = await pool.query(`SELECT h.status, h.project_id, p.status AS proj_status, p.cost_lock_status, p.code AS project_code FROM project_buy_list_headers h JOIN projects p ON p.id = h.project_id WHERE h.id = $1`, [headerId]);
      if (!hdr.rowCount || hdr.rowCount === 0) return sendNotFound(res, 'Buy list', headerId);
      const h = hdr.rows[0];
      if (!['released', 'locked'].includes(h.status)) return sendBusinessError(res, 'Bulk raise-pr requires buy list to be released or locked.');
      if (isProjectFrozen(h.proj_status)) return sendBusinessError(res, 'Project is frozen — no new records allowed.');
      if ((h.cost_lock_status ?? 'unlocked') === 'approved') return sendBusinessError(res, 'Cost is locked — project items cannot be modified.');

      const userId = (req.user as any).id;
      const seRes2 = await pool.query(`SELECT id FROM users WHERE role='Senior Executive' AND department='Purchase' AND is_active=true ORDER BY id LIMIT 1`);
      const purchaseAssigneeId2: number | null = seRes2.rows[0]?.id ?? null;
      const results: any[] = []; const errors: any[] = [];
      let succeeded = 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const lineId of lineIds) {
          const spName = `sp_${lineId}`;
          await client.query(`SAVEPOINT ${spName}`);
          try {
            const lineRow = await client.query(
              `SELECT l.id, l.status, l.tag_no, l.service_description, l.generic_requirement,
                      l.equipment_reference, l.quantity, l.selected_master_item_id, l.planning_record_id
               FROM project_buy_list_lines l WHERE l.id = $1 AND l.buy_list_header_id = $2`,
              [lineId, headerId],
            );
            if (!lineRow.rowCount || lineRow.rowCount === 0) throw new Error('Line not found in this buy list');
            const line = lineRow.rows[0];
            if (['canceled', 'obsolete', 'pr_raised'].includes(line.status)) throw new Error(`Line status is '${line.status}' — cannot raise PR`);

            if (line.planning_record_id) {
              const pr = await client.query(`SELECT status FROM item_planning_records WHERE id = $1`, [line.planning_record_id]);
              if (pr.rows[0] && !['canceled', 'superseded'].includes(pr.rows[0].status)) throw new Error('Active planning record already exists');
            }

            const qty = parseFloat(line.quantity) || 1;

            let projectItemId: number;
            if (line.selected_master_item_id) {
              const piDedup = await client.query(`SELECT id FROM project_items WHERE project_id=$1 AND item_id=$2 AND tag_no=$3 AND source='buy_list' AND status!='Cancelled' LIMIT 1`, [h.project_id, line.selected_master_item_id, line.tag_no]);
              if (piDedup.rows[0]) {
                projectItemId = piDedup.rows[0].id;
                await client.query(`UPDATE project_items SET required_quantity=$1, make_or_buy='Buy', updated_at=NOW() WHERE id=$2`, [qty, projectItemId]);
              } else {
                const piIns = await client.query<{ id: number }>(`INSERT INTO project_items (project_id,project_code,item_id,quantity,required_quantity,source,make_or_buy,tag_no,notes,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'buy_list','Buy',$6,$7,'Not Started',NOW(),NOW()) RETURNING id`,
                  [h.project_id, h.project_code, line.selected_master_item_id, qty, qty, line.tag_no,
                   `BUY LIST: ${line.tag_no}${line.service_description ? ' | ' + line.service_description : ''}`]);
                projectItemId = piIns.rows[0].id;
              }
            } else {
              // Direct-approved line — no master item yet; create project_item placeholder
              const piIns = await client.query<{ id: number }>(`INSERT INTO project_items (project_id,project_code,item_id,quantity,required_quantity,source,make_or_buy,tag_no,notes,status,created_at,updated_at) VALUES($1,$2,NULL,$3,$4,'buy_list','Buy',$5,$6,'Not Started',NOW(),NOW()) RETURNING id`,
                [h.project_id, h.project_code, qty, qty, line.tag_no,
                 `BUY LIST: ${line.tag_no}${line.service_description ? ' | ' + line.service_description : ''}`]);
              projectItemId = piIns.rows[0].id;
            }

            const seq = await getNextDocSeq('PLN', h.project_id, pool);
            const planningNumber = `${h.project_code}-PLN-${seq}`;
            const notes = [line.tag_no ? `Tag: ${line.tag_no}` : null, line.service_description || null, line.equipment_reference || null].filter(Boolean).join(' | ');

            const plnIns = await client.query<{ id: number }>(
              `INSERT INTO item_planning_records (project_id,project_item_id,master_item_id,planning_type,source,source_buy_list_header_id,source_buy_list_line_id,quantity,notes,planning_number,status,assigned_to,created_by,created_at,updated_at) VALUES($1,$2,$3,'procurement','buy_list',$4,$5,$6,$7,$8,'draft',$9,$10,NOW(),NOW()) RETURNING id`,
              [h.project_id, projectItemId, line.selected_master_item_id, headerId, lineId, qty, notes, planningNumber, purchaseAssigneeId2, userId],
            );
            const planningRecordId = plnIns.rows[0].id;
            await client.query(`UPDATE project_buy_list_lines SET planning_record_id=$1, updated_at=NOW() WHERE id=$2`, [planningRecordId, lineId]);

            // ── Create PLC line (idempotent — skips if already exists) ───────
            try {
              await createPlcLineInTx(client, {
                projectId: h.project_id,
                projectCode: h.project_code,
                planningRecordId,
                planningNumber,
                sourceBuyListHeaderId: headerId,
                sourceBuyListLineId: lineId,
                masterItemId: line.selected_master_item_id,
                tagNo: line.tag_no ?? null,
                serviceDescription: line.service_description || line.generic_requirement || null,
                equipmentReference: line.equipment_reference ?? null,
                subgroupCode: null,
                subgroupLabel: null,
                qtyRequired: qty,
                createdBy: userId,
              });
            } catch (plcErr: any) {
              console.warn('[PLC] createPlcLineInTx failed in bulk-raise-pr for line', lineId, plcErr.message);
            }

            await client.query(`RELEASE SAVEPOINT ${spName}`);
            succeeded++; results.push({ lineId, status: 'ok', planningRecordId });
          } catch (e: any) {
            await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
            await client.query(`RELEASE SAVEPOINT ${spName}`);
            errors.push({ lineId, error: e.message });
          }
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

      res.json({ processed: lineIds.length, succeeded, errors, results });
    } catch (err) { sendError(res, err); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 6 — PPPC SMART ACTION: Generate / Sync PPPC
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Shared helper: check execution activity for a buy list line ─────────────
  async function lineHasActivity(lineId: number): Promise<{ blocked: boolean; reason: string }> {
    const r = await pool.query(
      `SELECT
         -- 1. Selection approved or datasheet uploaded
         EXISTS(
           SELECT 1 FROM buy_list_line_selections s
           WHERE s.buy_list_line_id = $1
             AND (s.approval_status = 'approved' OR s.datasheet_uploaded = true)
         ) AS has_selection_activity,

         -- 2. Active procurement execution record (RFQ / vendor selection)
         EXISTS(
           SELECT 1 FROM item_planning_records ipr
           JOIN procurement_execution_records per ON per.planning_record_id = ipr.id
           WHERE ipr.source_buy_list_line_id = $1
             AND per.status NOT IN ('cancelled','superseded')
         ) AS has_per_activity,

         -- 3. PO preparation record active (vendor finalized / technical review)
         EXISTS(
           SELECT 1 FROM item_planning_records ipr
           JOIN po_preparation_records ppr ON ppr.planning_record_id = ipr.id
           WHERE ipr.source_buy_list_line_id = $1
             AND ppr.status NOT IN ('cancelled','superseded')
         ) AS has_po_prep_activity,

         -- 4. EPC Purchase Order created / issued / approved / on-hold
         EXISTS(
           SELECT 1 FROM item_planning_records ipr
           JOIN epc_purchase_orders epo ON epo.planning_record_id = ipr.id
           WHERE ipr.source_buy_list_line_id = $1
             AND epo.status NOT IN ('cancelled','superseded')
         ) AS has_epc_po_activity,

         -- 5. Quality planning record active (technical quality approval)
         EXISTS(
           SELECT 1 FROM item_planning_records ipr
           JOIN quality_planning_records qpr ON qpr.planning_record_id = ipr.id
           WHERE ipr.source_buy_list_line_id = $1
             AND qpr.status NOT IN ('cancelled','superseded')
         ) AS has_quality_plan_activity,

         -- 6. Inspection execution record active (scheduled / in-progress / completed)
         EXISTS(
           SELECT 1 FROM item_planning_records ipr
           JOIN inspection_execution_records ier ON ier.planning_record_id = ipr.id
           WHERE ipr.source_buy_list_line_id = $1
             AND ier.status NOT IN ('cancelled','superseded')
         ) AS has_inspection_activity`,
      [lineId],
    );
    const row = r.rows[0];
    // Ordered by severity: most irreversible first
    if (row.has_epc_po_activity)       return { blocked: true, reason: 'EPC Purchase Order created / issued / approved' };
    if (row.has_inspection_activity)   return { blocked: true, reason: 'Inspection record active (scheduled / in-progress / completed)' };
    if (row.has_po_prep_activity)      return { blocked: true, reason: 'PO preparation active — vendor finalized / technical review in progress' };
    if (row.has_per_activity)          return { blocked: true, reason: 'Procurement execution record active (RFQ / vendor selection)' };
    if (row.has_quality_plan_activity) return { blocked: true, reason: 'Quality plan active' };
    if (row.has_selection_activity)    return { blocked: true, reason: 'Selection approved / datasheet uploaded' };
    return { blocked: false, reason: '' };
  }

  // ── Shared helper: find latest active package for a product ─────────────────
  async function latestActivePackageForProduct(productId: number) {
    const r = await pool.query(
      `SELECT id, version, package_code, name
       FROM buy_package_headers
       WHERE product_id = $1 AND status = 'active'
       ORDER BY version DESC LIMIT 1`,
      [productId],
    );
    return r.rows[0] ?? null;
  }

  // ─── GET /api/projects/:projectId/pppc-status ─────────────────────────────
  app.get('/api/projects/:projectId/pppc-status', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid projectId');

      // Find all project items and match to active buy package via bp_code (direct) OR
      // via product_code → products → buy_package_headers.product_id (fallback when bp_code is null)
      const itemsRes = await pool.query(
        `SELECT pi.id, pi.item_code, pi.description, pi.bp_code, pi.product_code,
                bph_latest.id AS latest_pkg_id, bph_latest.version AS latest_pkg_version,
                bph_latest.package_code AS latest_pkg_code,
                bph_latest.name AS latest_pkg_name,
                (SELECT COUNT(*)::int FROM buy_package_lines WHERE buy_package_header_id = bph_latest.id) AS latest_pkg_line_count,
                EXISTS(
                  SELECT 1 FROM project_buy_list_headers h
                  WHERE h.project_item_id = pi.id AND h.is_current = true
                    AND h.status NOT IN ('canceled','superseded')
                ) AS has_current_list,
                (
                  SELECT h.id FROM project_buy_list_headers h
                  WHERE h.project_item_id = pi.id AND h.is_current = true
                    AND h.status NOT IN ('canceled','superseded')
                  LIMIT 1
                ) AS current_list_id,
                (
                  SELECT h.source_package_id FROM project_buy_list_headers h
                  WHERE h.project_item_id = pi.id AND h.is_current = true
                    AND h.status NOT IN ('canceled','superseded')
                  LIMIT 1
                ) AS current_source_pkg_id
         FROM project_items pi
         LEFT JOIN LATERAL (
           SELECT bph.id, bph.version, bph.package_code, bph.name, bph.product_id
           FROM buy_package_headers bph
           LEFT JOIN products p ON p.id = bph.product_id
           WHERE bph.status = 'active'
             AND (
               (pi.bp_code IS NOT NULL AND pi.bp_code != '' AND bph.package_code = pi.bp_code)
               OR
               (pi.product_code IS NOT NULL AND pi.product_code != '' AND p.product_code = pi.product_code)
             )
           ORDER BY bph.version DESC LIMIT 1
         ) bph_latest ON true
         WHERE pi.project_id = $1
         ORDER BY pi.item_code`,
        [projectId],
      );

      const rows = itemsRes.rows;
      // An item is "package-eligible" if we found an active package via either match path
      const matchedWithPkg     = rows.filter((r: any) => r.latest_pkg_id);
      const noPackageMatch     = rows.filter((r: any) => !r.latest_pkg_id);

      const alreadyHasLists    = matchedWithPkg.filter((r: any) => r.has_current_list);
      const missingLists       = matchedWithPkg.filter((r: any) => !r.has_current_list);

      // Detect drift on existing lists (Scenario 2)
      const driftedLists: any[] = [];
      for (const item of alreadyHasLists) {
        if (!item.current_source_pkg_id || !item.latest_pkg_id) continue;
        // Get source package product_id
        const srcPkgRes = await pool.query(
          `SELECT product_id, version, package_code FROM buy_package_headers WHERE id = $1`,
          [item.current_source_pkg_id],
        );
        if (!srcPkgRes.rows[0]) continue;
        const srcPkg = srcPkgRes.rows[0];
        // Get latest active package for that product
        const latestPkg = await latestActivePackageForProduct(srcPkg.product_id);
        if (!latestPkg) continue;
        if (latestPkg.id !== item.current_source_pkg_id) {
          driftedLists.push({
            listId: item.current_list_id,
            projectItemId: item.id,
            projectItemCode: item.item_code,
            projectItemDescription: item.description,
            currentPackageId: item.current_source_pkg_id,
            currentPackageVersion: srcPkg.version,
            currentPackageCode: srcPkg.package_code,
            latestPackageId: latestPkg.id,
            latestPackageVersion: latestPkg.version,
            latestPackageCode: latestPkg.package_code,
          });
        }
      }

      // Determine scenario
      let scenario: 'backfill' | 'sync' | 'current';
      if (missingLists.length > 0) {
        scenario = 'backfill';
      } else if (driftedLists.length > 0) {
        scenario = 'sync';
      } else {
        scenario = 'current';
      }

      res.json({
        scenario,
        totalProjectItems: rows.length,
        withBpCode: matchedWithPkg.length,
        withoutBpCode: noPackageMatch.length,
        matchedWithPackage: matchedWithPkg.length,
        noPackageMatch: noPackageMatch.length,
        alreadyHasLists: alreadyHasLists.length,
        missingLists: missingLists.length,
        preview: missingLists.map((r: any) => ({
          projectItemId: r.id,
          projectItemCode: r.item_code,
          description: r.description,
          matchedPackageId: r.latest_pkg_id,
          matchedPackageCode: r.latest_pkg_code,
          matchedPackageName: r.latest_pkg_name,
          lineCount: r.latest_pkg_line_count,
        })),
        driftedLists,
      });
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/projects/:projectId/buy-lists/backfill ────────────────────
  app.post('/api/projects/:projectId/buy-lists/backfill', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return sendValidationError(res, 'Invalid projectId');
      const dryRun = req.body.dryRun === true;
      const userId = (req.user as any)?.id as number;

      // Find all items with an active package match (via bp_code OR product_code) that have no current buy list
      const missingRes = await pool.query(
        `SELECT pi.id AS project_item_id, pi.item_code, pi.description, pi.bp_code, pi.product_code,
                bph.id AS pkg_id, bph.version AS pkg_version, bph.package_code
         FROM project_items pi
         JOIN LATERAL (
           SELECT bph2.id, bph2.version, bph2.package_code
           FROM buy_package_headers bph2
           LEFT JOIN products p ON p.id = bph2.product_id
           WHERE bph2.status = 'active'
             AND (
               (pi.bp_code IS NOT NULL AND pi.bp_code != '' AND bph2.package_code = pi.bp_code)
               OR
               (pi.product_code IS NOT NULL AND pi.product_code != '' AND p.product_code = pi.product_code)
             )
           ORDER BY bph2.version DESC LIMIT 1
         ) bph ON true
         WHERE pi.project_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM project_buy_list_headers h
             WHERE h.project_item_id = pi.id AND h.is_current = true
               AND h.status NOT IN ('canceled','superseded')
           )
         ORDER BY pi.item_code`,
        [projectId],
      );

      const eligible = missingRes.rows;
      if (dryRun) {
        return res.json({
          dryRun: true,
          eligible: eligible.length,
          preview: eligible.map((r: any) => ({
            projectItemId: r.project_item_id,
            projectItemCode: r.item_code,
            description: r.description,
            matchedPackageId: r.pkg_id,
            matchedPackageCode: r.package_code,
          })),
        });
      }

      const created: any[] = [];
      const errors: any[] = [];

      for (const item of eligible) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock($1)', [projectId]);

          // Re-validate: package still latest active
          const revalidate = await client.query(
            `SELECT id FROM buy_package_headers WHERE id = $1 AND status = 'active'`,
            [item.pkg_id],
          );
          if (!revalidate.rows[0]) {
            await client.query('ROLLBACK');
            errors.push({ projectItemId: item.project_item_id, error: 'Package no longer active' });
            continue;
          }

          // Re-check no list exists (guard against race)
          const existsCheck = await client.query(
            `SELECT 1 FROM project_buy_list_headers
             WHERE project_item_id = $1 AND is_current = true AND status NOT IN ('canceled','superseded')`,
            [item.project_item_id],
          );
          if ((existsCheck.rowCount ?? 0) > 0) {
            await client.query('ROLLBACK');
            errors.push({ projectItemId: item.project_item_id, error: 'List already exists (race condition)' });
            continue;
          }

          const listNumber = await generateListNumber(projectId);

          const pkgLines = await client.query(
            `SELECT pl.*, bg.code AS group_code, bs.code AS subgroup_code
             FROM buy_package_lines pl
             JOIN buy_groups bg ON bg.id = pl.buy_group_id
             JOIN buy_subgroups bs ON bs.id = pl.buy_subgroup_id
             WHERE pl.buy_package_header_id = $1 ORDER BY pl.line_number`,
            [item.pkg_id],
          );

          const hdrRes = await client.query(
            `INSERT INTO project_buy_list_headers
               (project_id, project_item_id, source_package_id, list_number, created_by, item_code)
             VALUES ($1,$2,$3,$4,$5, (SELECT item_code FROM project_items WHERE id = $2)) RETURNING id`,
            [projectId, item.project_item_id, item.pkg_id, listNumber, userId],
          );
          const headerId = hdrRes.rows[0].id;

          for (let i = 0; i < pkgLines.rows.length; i++) {
            const pl = pkgLines.rows[i];
            const isRaw = pl.group_code === RAW_MATERIALS_CODE;
            const tagNo = isRaw ? '' : (await getNextTagNoInTx(client, projectId, pl.subgroup_code) ?? '');
            await client.query(
              `INSERT INTO project_buy_list_lines
                 (buy_list_header_id, project_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
                  generic_requirement, quantity, specification, technical_attributes,
                  tag_no, selection_required, datasheet_required, inspection_required,
                  certificate_required, compliance_required, source_package_line_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
              [
                headerId, projectId, i + 1, pl.buy_group_id, pl.buy_subgroup_id, pl.uom_id,
                pl.generic_requirement, pl.default_quantity, pl.default_specification,
                pl.technical_attributes, tagNo,
                pl.selection_required, pl.datasheet_required, pl.inspection_required,
                pl.certificate_required, pl.compliance_required, pl.id,
              ],
            );
          }

          // Audit event
          await client.query(
            `INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
             VALUES ($1, 'buy_list_backfill', $2, $3, NOW(), true)`,
            [
              projectId,
              JSON.stringify({
                listId: headerId, listNumber, projectItemId: item.project_item_id,
                sourcePackageId: item.pkg_id, sourcePackageCode: item.package_code,
                recovery: true, triggeredBy: userId,
              }),
              userId,
            ],
          );

          await client.query('COMMIT');
          created.push({ projectItemId: item.project_item_id, listId: headerId, listNumber, sourcePackageId: item.pkg_id });
        } catch (e: any) {
          await client.query('ROLLBACK');
          errors.push({ projectItemId: item.project_item_id, error: e.message });
        } finally {
          client.release();
        }
      }

      res.json({ dryRun: false, created: created.length, errors: errors.length, details: created, errorDetails: errors });
    } catch (err) { sendError(res, err); }
  });

  // ─── GET /api/buy-lists/:id/package-diff ─────────────────────────────────
  app.get('/api/buy-lists/:id/package-diff', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');

      const hdrRes = await pool.query(
        `SELECT h.*, bph.product_id AS source_product_id, bph.version AS source_pkg_version,
                bph.package_code AS source_pkg_code
         FROM project_buy_list_headers h
         LEFT JOIN buy_package_headers bph ON bph.id = h.source_package_id
         WHERE h.id = $1`,
        [id],
      );
      if (!hdrRes.rows[0]) return sendNotFound(res, 'Buy list', id);
      const hdr = hdrRes.rows[0];

      if (!hdr.source_package_id || !hdr.source_product_id) {
        return res.json({ upToDate: true, reason: 'No source package linked to this list' });
      }

      const latestPkg = await latestActivePackageForProduct(hdr.source_product_id);
      if (!latestPkg) {
        return res.json({ upToDate: true, reason: 'No active package found for source product' });
      }
      if (latestPkg.id === hdr.source_package_id) {
        return res.json({ upToDate: true, currentPackageId: hdr.source_package_id, latestPackageId: latestPkg.id });
      }

      // Load project lines with their source line_uid
      const projLinesRes = await pool.query(
        `SELECT l.*,
                bg.code AS buy_group_code, bg.label AS buy_group_label,
                bs.code AS buy_subgroup_code, bs.label AS buy_subgroup_label,
                u.code AS uom_code,
                bpl.line_uid AS source_line_uid,
                bpl.default_quantity AS catalog_default_qty,
                bpl.default_specification AS catalog_default_spec
         FROM project_buy_list_lines l
         JOIN buy_groups bg ON bg.id = l.buy_group_id
         JOIN buy_subgroups bs ON bs.id = l.buy_subgroup_id
         JOIN uom_master u ON u.id = l.uom_id
         LEFT JOIN buy_package_lines bpl ON bpl.id = l.source_package_line_id
         WHERE l.buy_list_header_id = $1
         ORDER BY bg.sort_order, bg.code, bs.sort_order, bs.code, l.tag_no, l.line_number`,
        [id],
      );

      // Load new package lines
      const newPkgLinesRes = await pool.query(
        `SELECT pl.*,
                bg.code AS buy_group_code, bg.label AS buy_group_label,
                bs.code AS buy_subgroup_code, bs.label AS buy_subgroup_label,
                u.code AS uom_code
         FROM buy_package_lines pl
         JOIN buy_groups bg ON bg.id = pl.buy_group_id
         JOIN buy_subgroups bs ON bs.id = pl.buy_subgroup_id
         JOIN uom_master u ON u.id = pl.uom_id
         WHERE pl.buy_package_header_id = $1
         ORDER BY pl.line_number`,
        [latestPkg.id],
      );

      const projLines = projLinesRes.rows;
      const newPkgLines = newPkgLinesRes.rows;

      // Build map: line_uid → new package line
      const newByUid = new Map<string, any>();
      for (const nl of newPkgLines) { newByUid.set(nl.line_uid, nl); }

      // Build set of line_uids that exist in the project list (via source)
      const projSourceUids = new Set<string>();
      for (const pl of projLines) { if (pl.source_line_uid) projSourceUids.add(pl.source_line_uid); }

      const newLines:       any[] = [];
      const removedLines:   any[] = [];
      const changedLines:   any[] = [];
      const unchangedLines: any[] = [];

      // Classify project lines
      for (const pl of projLines) {
        if (!pl.source_package_line_id || !pl.source_line_uid) continue; // user-added, skip in diff

        const matchedNewLine = newByUid.get(pl.source_line_uid);
        if (!matchedNewLine) {
          // Removed from new package
          const activity = await lineHasActivity(pl.id);
          removedLines.push({ ...pl, activityBlocked: activity.blocked, activityReason: activity.reason });
        } else {
          const qtyChanged  = parseFloat(matchedNewLine.default_quantity) !== parseFloat(pl.quantity);
          const specChanged = (matchedNewLine.default_specification ?? '') !== (pl.specification ?? '');
          if (qtyChanged || specChanged) {
            const activity = await lineHasActivity(pl.id);
            changedLines.push({
              ...pl,
              newPackageLineId: matchedNewLine.id,
              catalogQty: matchedNewLine.default_quantity,
              catalogSpec: matchedNewLine.default_specification,
              qtyChanged, specChanged,
              activityBlocked: activity.blocked,
              activityReason: activity.reason,
            });
          } else {
            unchangedLines.push({ ...pl, newPackageLineId: matchedNewLine.id });
          }
        }
      }

      // New lines: in new package, not in project (by line_uid)
      for (const nl of newPkgLines) {
        if (!projSourceUids.has(nl.line_uid)) {
          newLines.push(nl);
        }
      }

      const activityDetails = [
        ...removedLines.filter((l: any) => l.activityBlocked).map((l: any) => ({ lineId: l.id, reason: l.activityReason })),
        ...changedLines.filter((l: any) => l.activityBlocked).map((l: any) => ({ lineId: l.id, reason: l.activityReason })),
      ];

      res.json({
        upToDate: false,
        currentPackageId:      hdr.source_package_id,
        currentPackageVersion: hdr.source_pkg_version,
        currentPackageCode:    hdr.source_pkg_code,
        latestPackageId:       latestPkg.id,
        latestPackageVersion:  latestPkg.version,
        latestPackageCode:     latestPkg.package_code,
        summary: {
          new: newLines.length,
          removed: removedLines.length,
          changed: changedLines.length,
          userModified: changedLines.filter((l: any) => l.is_user_modified).length,
          unchanged: unchangedLines.length,
        },
        newLines,
        removedLines,
        changedLines,
        unchangedLines,
        activityBlocked: activityDetails.length > 0,
        activityDetails,
      });
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/buy-lists/:id/sync-additions ───────────────────────────────
  app.post('/api/buy-lists/:id/sync-additions', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const userId = (req.user as any)?.id as number;
      const note: string = req.body.note ?? '';

      const hdrRes = await pool.query(
        `SELECT h.*, bph.product_id AS source_product_id, bph.version AS source_pkg_version
         FROM project_buy_list_headers h
         LEFT JOIN buy_package_headers bph ON bph.id = h.source_package_id
         WHERE h.id = $1`,
        [id],
      );
      if (!hdrRes.rows[0]) return sendNotFound(res, 'Buy list', id);
      const hdr = hdrRes.rows[0];
      if (!['draft', 'under_review', 'released'].includes(hdr.status))
        return sendBusinessError(res, 'Cannot sync additions to a locked, superseded or cancelled list.');
      if (!hdr.source_package_id || !hdr.source_product_id)
        return sendBusinessError(res, 'This buy list has no source package linked.');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [hdr.project_id]);

        // Revalidate: latest active package still correct
        const latestRes = await client.query(
          `SELECT id, version, package_code FROM buy_package_headers
           WHERE product_id = $1 AND status = 'active'
           ORDER BY version DESC LIMIT 1`,
          [hdr.source_product_id],
        );
        const latestPkg = latestRes.rows[0];
        if (!latestPkg) {
          await client.query('ROLLBACK');
          return sendBusinessError(res, 'No active package found for source product. Cannot sync.');
        }
        if (latestPkg.id === hdr.source_package_id) {
          await client.query('ROLLBACK');
          return res.json({ message: 'Already up to date. No additions needed.' });
        }

        // Load project lines' source line_uids
        const projUidsRes = await client.query(
          `SELECT bpl.line_uid
           FROM project_buy_list_lines l
           JOIN buy_package_lines bpl ON bpl.id = l.source_package_line_id
           WHERE l.buy_list_header_id = $1`,
          [id],
        );
        const existingUids = new Set(projUidsRes.rows.map((r: any) => r.line_uid));

        // New package lines not yet in project list
        const newLinesRes = await client.query(
          `SELECT pl.*, bg.code AS group_code, bs.code AS subgroup_code
           FROM buy_package_lines pl
           JOIN buy_groups bg ON bg.id = pl.buy_group_id
           JOIN buy_subgroups bs ON bs.id = pl.buy_subgroup_id
           WHERE pl.buy_package_header_id = $1
           ORDER BY pl.line_number`,
          [latestPkg.id],
        );
        const toAdd = newLinesRes.rows.filter((pl: any) => !existingUids.has(pl.line_uid));

        // Get current max line_number
        const maxLineRes = await client.query(
          `SELECT COALESCE(MAX(line_number),0)::int AS m FROM project_buy_list_lines WHERE buy_list_header_id=$1`,
          [id],
        );
        let lineNum = maxLineRes.rows[0].m as number;

        const elecRes2 = await client.query(
          `SELECT electrical_voltage, electrical_frequency, electrical_phase FROM projects WHERE id = $1`,
          [hdr.project_id],
        );
        const elecRow2 = elecRes2.rows[0] ?? {};
        const projElec2 = {
          electricalVoltage:   (elecRow2.electrical_voltage   as string) ?? null,
          electricalFrequency: (elecRow2.electrical_frequency as string) ?? null,
          electricalPhase:     (elecRow2.electrical_phase     as string) ?? null,
        };

        let addedLines = 0;
        for (const pl of toAdd) {
          const isRaw = pl.group_code === RAW_MATERIALS_CODE;
          const tagNo = isRaw ? '' : (await getNextTagNoInTx(client, hdr.project_id, pl.subgroup_code, pl.installed_on ?? null) ?? '');
          const finalAttrs2 = stripElectricalOverridesMeta(
            applyProjectElectricalStandards(pl.subgroup_code, (pl.technical_attributes ?? {}) as Record<string, unknown>, projElec2),
          );
          await client.query(
            `INSERT INTO project_buy_list_lines
               (buy_list_header_id, project_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
                generic_requirement, quantity, specification, technical_attributes,
                tag_no, selection_required, datasheet_required, inspection_required,
                certificate_required, compliance_required, source_package_line_id, installed_on)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            [
              id, hdr.project_id, ++lineNum, pl.buy_group_id, pl.buy_subgroup_id, pl.uom_id,
              pl.generic_requirement, pl.default_quantity, pl.default_specification,
              finalAttrs2, tagNo,
              pl.selection_required, pl.datasheet_required, pl.inspection_required,
              pl.certificate_required, pl.compliance_required, pl.id, pl.installed_on ?? null,
            ],
          );
          addedLines++;
        }

        // Update latest_synced_package_id (source_package_id stays immutable)
        await client.query(
          `UPDATE project_buy_list_headers SET latest_synced_package_id=$1, updated_at=NOW() WHERE id=$2`,
          [latestPkg.id, id],
        );

        // Audit event
        await client.query(
          `INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
           VALUES ($1,'buy_list_sync_additions',$2,$3,NOW(),true)`,
          [
            hdr.project_id,
            JSON.stringify({
              listId: id, fromPackageId: hdr.source_package_id,
              fromPackageVersion: hdr.source_pkg_version,
              toPackageId: latestPkg.id, toPackageVersion: latestPkg.version,
              toPackageCode: latestPkg.package_code,
              syncMode: 'additions_only', addedLines, skippedLines: toAdd.length - addedLines,
              triggeredBy: userId, note,
            }),
            userId,
          ],
        );

        await client.query('COMMIT');
        res.json({ addedLines, latestPackageId: latestPkg.id, latestPackageCode: latestPkg.package_code });
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/buy-list-lines/:id/mark-obsolete ──────────────────────────
  app.post('/api/buy-list-lines/:id/mark-obsolete', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const userId = (req.user as any)?.id as number;

      const lineRes = await pool.query(
        `SELECT l.id, l.status, l.buy_list_header_id, h.project_id, h.status AS list_status
         FROM project_buy_list_lines l
         JOIN project_buy_list_headers h ON h.id = l.buy_list_header_id
         WHERE l.id = $1`,
        [id],
      );
      if (!lineRes.rows[0]) return sendNotFound(res, 'Buy list line', id);
      const line = lineRes.rows[0];
      if (line.status === 'obsolete') return res.json({ message: 'Already obsolete' });
      if (line.list_status === 'locked') return sendBusinessError(res, 'Cannot mark lines obsolete on a locked list.');

      const activity = await lineHasActivity(id);
      if (activity.blocked) return sendBusinessError(res, `Cannot mark obsolete: ${activity.reason}`);

      await pool.query(
        `UPDATE project_buy_list_lines SET status='obsolete', updated_at=NOW() WHERE id=$1`,
        [id],
      );

      await pool.query(
        `INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
         VALUES ($1,'buy_list_line_mark_obsolete',$2,$3,NOW(),true)`,
        [line.project_id, JSON.stringify({ lineId: id, listId: line.buy_list_header_id, triggeredBy: userId }), userId],
      );

      res.json({ success: true, lineId: id, status: 'obsolete' });
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/buy-list-lines/:id/sync-catalog-change ────────────────────
  app.post('/api/buy-list-lines/:id/sync-catalog-change', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      if (!requireManager(req, res)) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const { newPackageLineId } = req.body;
      if (!newPackageLineId) return sendValidationError(res, 'newPackageLineId is required');
      const userId = (req.user as any)?.id as number;

      const lineRes = await pool.query(
        `SELECT l.*, h.project_id, h.status AS list_status, bs.code AS buy_subgroup_code
         FROM project_buy_list_lines l
         JOIN project_buy_list_headers h ON h.id = l.buy_list_header_id
         JOIN buy_subgroups bs ON bs.id = l.buy_subgroup_id
         WHERE l.id = $1`,
        [id],
      );
      if (!lineRes.rows[0]) return sendNotFound(res, 'Buy list line', id);
      const line = lineRes.rows[0];

      if (line.is_user_modified)
        return sendBusinessError(res, 'This line has user modifications. Catalog sync cannot override user changes.');
      if (line.list_status === 'locked')
        return sendBusinessError(res, 'Cannot sync changes on a locked list.');

      const activity = await lineHasActivity(id);
      if (activity.blocked) return sendBusinessError(res, `Cannot sync: ${activity.reason}`);

      const newLineRes = await pool.query(
        `SELECT * FROM buy_package_lines WHERE id = $1`, [newPackageLineId],
      );
      if (!newLineRes.rows[0]) return sendNotFound(res, 'Buy package line', newPackageLineId);
      const nl = newLineRes.rows[0];

      const elecRes3 = await pool.query(
        `SELECT electrical_voltage, electrical_frequency, electrical_phase FROM projects WHERE id = $1`,
        [line.project_id],
      );
      const elecRow3 = elecRes3.rows[0] ?? {};
      const projElec3 = {
        electricalVoltage:   (elecRow3.electrical_voltage   as string) ?? null,
        electricalFrequency: (elecRow3.electrical_frequency as string) ?? null,
        electricalPhase:     (elecRow3.electrical_phase     as string) ?? null,
      };
      const finalAttrs3 = stripElectricalOverridesMeta(
        applyProjectElectricalStandards(line.buy_subgroup_code ?? '', (nl.technical_attributes ?? {}) as Record<string, unknown>, projElec3),
      );

      await pool.query(
        `UPDATE project_buy_list_lines
         SET quantity=$1, specification=$2, technical_attributes=$3,
             source_package_line_id=$4, updated_at=NOW()
         WHERE id=$5`,
        [nl.default_quantity, nl.default_specification, finalAttrs3, nl.id, id],
      );

      await pool.query(
        `INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
         VALUES ($1,'buy_list_line_sync_catalog_change',$2,$3,NOW(),true)`,
        [
          line.project_id,
          JSON.stringify({ lineId: id, oldSourceLineId: line.source_package_line_id, newSourceLineId: nl.id, triggeredBy: userId }),
          userId,
        ],
      );

      res.json({ success: true, lineId: id });
    } catch (err) { sendError(res, err); }
  });

  // ─── POST /api/buy-lists/:id/replace-from-package (Superuser only) ────────
  app.post('/api/buy-lists/:id/replace-from-package', ensureAuthenticated, PAGE, async (req: Request, res: Response) => {
    try {
      const role = (req.user as any)?.role;
      if (role !== 'Superuser') return sendPermissionError(res, 'Superuser only.');
      const id = parseInt(req.params.id);
      if (isNaN(id)) return sendValidationError(res, 'Invalid id');
      const { confirmationText, note } = req.body;
      if (confirmationText !== 'REPLACE') return sendValidationError(res, 'Type "REPLACE" to confirm full replacement.');
      const userId = (req.user as any)?.id as number;

      const hdrRes = await pool.query(
        `SELECT h.*, bph.product_id AS source_product_id
         FROM project_buy_list_headers h
         LEFT JOIN buy_package_headers bph ON bph.id = h.source_package_id
         WHERE h.id = $1`,
        [id],
      );
      if (!hdrRes.rows[0]) return sendNotFound(res, 'Buy list', id);
      const hdr = hdrRes.rows[0];
      if (!hdr.source_product_id) return sendBusinessError(res, 'No source package linked to this list.');
      if (hdr.status === 'locked') return sendBusinessError(res, 'Cannot replace a locked buy list.');

      // Check all lines for activity
      const allLinesRes = await pool.query(
        `SELECT id FROM project_buy_list_lines WHERE buy_list_header_id = $1 AND status != 'canceled'`,
        [id],
      );
      const blockedLines: any[] = [];
      for (const l of allLinesRes.rows) {
        const a = await lineHasActivity(l.id);
        if (a.blocked) blockedLines.push({ lineId: l.id, reason: a.reason });
      }
      if (blockedLines.length > 0)
        return res.status(409).json({ error: 'Full replacement blocked', blockedLines });

      const latestPkg = await latestActivePackageForProduct(hdr.source_product_id);
      if (!latestPkg) return sendBusinessError(res, 'No active package found. Cannot replace.');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [hdr.project_id]);

        // Revalidate still latest
        const revalRes = await client.query(
          `SELECT id FROM buy_package_headers WHERE id = $1 AND status = 'active'`,
          [latestPkg.id],
        );
        if (!revalRes.rows[0]) {
          await client.query('ROLLBACK');
          return sendBusinessError(res, 'Package is no longer active. Cannot replace.');
        }

        // FULL SNAPSHOT: header + lines + selections
        const snapLinesRes = await client.query(
          `SELECT l.*, s.id AS sel_id, s.master_item_id, s.item_code, s.item_description,
                  s.item_specification, s.drawing_number, s.drawing_revision,
                  s.approval_status, s.datasheet_uploaded, s.datasheet_gcs_object_path,
                  s.datasheet_original_filename, s.notes AS sel_notes
           FROM project_buy_list_lines l
           LEFT JOIN buy_list_line_selections s ON s.buy_list_line_id = l.id
           WHERE l.buy_list_header_id = $1`,
          [id],
        );

        await client.query(
          `INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
           VALUES ($1,'buy_list_full_replacement_snapshot',$2,$3,NOW(),true)`,
          [
            hdr.project_id,
            JSON.stringify({
              listId: id, listNumber: hdr.list_number, status: hdr.status,
              sourcePackageId: hdr.source_package_id,
              latestSyncedPackageId: hdr.latest_synced_package_id,
              headerSnapshot: hdr,
              linesSnapshot: snapLinesRes.rows,
              replacedWithPackageId: latestPkg.id,
              replacedWithPackageCode: latestPkg.package_code,
              note, triggeredBy: userId,
            }),
            userId,
          ],
        );

        // Delete selections then lines
        await client.query(
          `DELETE FROM buy_list_line_selections
           WHERE buy_list_line_id IN (
             SELECT id FROM project_buy_list_lines WHERE buy_list_header_id = $1
           )`,
          [id],
        );
        await client.query(
          `DELETE FROM project_buy_list_lines WHERE buy_list_header_id = $1`, [id],
        );

        // Re-seed from latest package
        const pkgLines = await client.query(
          `SELECT pl.*, bg.code AS group_code, bs.code AS subgroup_code
           FROM buy_package_lines pl
           JOIN buy_groups bg ON bg.id = pl.buy_group_id
           JOIN buy_subgroups bs ON bs.id = pl.buy_subgroup_id
           WHERE pl.buy_package_header_id = $1 ORDER BY pl.line_number`,
          [latestPkg.id],
        );

        const elecRes4 = await client.query(
          `SELECT electrical_voltage, electrical_frequency, electrical_phase FROM projects WHERE id = $1`,
          [hdr.project_id],
        );
        const elecRow4 = elecRes4.rows[0] ?? {};
        const projElec4 = {
          electricalVoltage:   (elecRow4.electrical_voltage   as string) ?? null,
          electricalFrequency: (elecRow4.electrical_frequency as string) ?? null,
          electricalPhase:     (elecRow4.electrical_phase     as string) ?? null,
        };

        for (let i = 0; i < pkgLines.rows.length; i++) {
          const pl = pkgLines.rows[i];
          const isRaw = pl.group_code === RAW_MATERIALS_CODE;
          const tagNo = isRaw ? '' : (await getNextTagNoInTx(client, hdr.project_id, pl.subgroup_code, pl.installed_on ?? null) ?? '');
          const finalAttrs4 = stripElectricalOverridesMeta(
            applyProjectElectricalStandards(pl.subgroup_code, (pl.technical_attributes ?? {}) as Record<string, unknown>, projElec4),
          );
          await client.query(
            `INSERT INTO project_buy_list_lines
               (buy_list_header_id, project_id, line_number, buy_group_id, buy_subgroup_id, uom_id,
                generic_requirement, quantity, specification, technical_attributes,
                tag_no, selection_required, datasheet_required, inspection_required,
                certificate_required, compliance_required, source_package_line_id, installed_on)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            [
              id, hdr.project_id, i + 1, pl.buy_group_id, pl.buy_subgroup_id, pl.uom_id,
              pl.generic_requirement, pl.default_quantity, pl.default_specification,
              finalAttrs4, tagNo,
              pl.selection_required, pl.datasheet_required, pl.inspection_required,
              pl.certificate_required, pl.compliance_required, pl.id, pl.installed_on ?? null,
            ],
          );
        }

        // Update header: latest_synced_package_id only — source_package_id is immutable
        await client.query(
          `UPDATE project_buy_list_headers
           SET latest_synced_package_id=$1, status='draft', updated_at=NOW()
           WHERE id=$2`,
          [latestPkg.id, id],
        );

        await client.query(
          `INSERT INTO project_workflow_events (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
           VALUES ($1,'buy_list_full_replacement',$2,$3,NOW(),true)`,
          [
            hdr.project_id,
            JSON.stringify({
              listId: id, newPackageId: latestPkg.id, newPackageCode: latestPkg.package_code,
              linesSeeded: pkgLines.rows.length, note, triggeredBy: userId,
            }),
            userId,
          ],
        );

        await client.query('COMMIT');
        res.json({ success: true, linesSeeded: pkgLines.rows.length, latestPackageId: latestPkg.id });
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (err) { sendError(res, err); }
  });

  console.log('[PPPC] ✅ Phase 0 routes registered (buy-groups · buy-subgroups · uom-master)');
  console.log('[PPPC] ✅ Phase 1 routes registered (buy-packages · buy-package-lines)');
  console.log('[PPPC] ✅ Phase 2 routes registered (project buy lists · buy list lines)');
  console.log('[PPPC] ✅ Phase 2 hook registered (offer→project buy list auto-creation)');
  console.log('[PPPC] ✅ Phase 3 routes registered (selection · upload-datasheet · approve · reject · delete)');
  console.log('[PPPC] ✅ Phase 6 routes registered (pppc-status · backfill · package-diff · sync-additions · mark-obsolete · sync-catalog-change · replace-from-package)');
  console.log('[PPPC] ✅ Phase 4 routes registered (raise-pr · procurement-status)');
}
