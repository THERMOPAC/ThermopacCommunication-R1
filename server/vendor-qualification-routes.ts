/**
 * Vendor Subgroup Qualification (AVL) Routes — Phase 1
 * Governance: docs/procurement-list-control-baseline-v1.md §9e
 */

import { Express, Request, Response } from 'express';
import { pool } from './db';
import { logPlcAudit } from './plc-line-service';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// ─── GET /api/vendor-subgroup-qualification — list by vendorId ─────────────
// ─── POST /api/vendor-subgroup-qualification — create
// ─── PATCH /api/vendor-subgroup-qualification/:id — update status/score
// ─── GET /api/vendor-subgroup-qualification/check — check vendor+subgroup
// ─── GET /api/vendors/:vendorId/subgroup-qualifications — all for a vendor

export function setupVendorQualificationRoutes(app: Express): void {

  app.get('/api/vendor-subgroup-qualification', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { vendorId, subgroupCode, status } = req.query;
      const conditions: string[] = [];
      const params: any[] = [];
      if (vendorId) { params.push(parseInt(vendorId as string)); conditions.push(`vsq.vendor_id = $${params.length}`); }
      if (subgroupCode) { params.push(subgroupCode); conditions.push(`vsq.subgroup_code = $${params.length}`); }
      if (status) { params.push(status); conditions.push(`vsq.status = $${params.length}`); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const r = await pool.query(
        `SELECT vsq.*, u.name AS qualified_by_name, u2.name AS created_by_name, v.name AS vendor_name
         FROM vendor_subgroup_qualification vsq
         LEFT JOIN users u ON u.id = vsq.qualified_by
         LEFT JOIN users u2 ON u2.id = vsq.created_by
         LEFT JOIN vendors v ON v.id = vsq.vendor_id
         ${where}
         ORDER BY vsq.vendor_id, vsq.subgroup_code`,
        params,
      );
      res.json(r.rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/vendor-subgroup-qualification', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { vendorId, subgroupCode, subgroupLabel, status, notes, conditions: cond, validUntil, annualReviewDue } = req.body;
      if (!vendorId || !subgroupCode) return res.status(400).json({ error: 'vendorId and subgroupCode are required' });

      const existing = await pool.query(
        `SELECT id FROM vendor_subgroup_qualification WHERE vendor_id = $1 AND subgroup_code = $2`,
        [vendorId, subgroupCode],
      );
      if (existing.rows[0]) return res.status(409).json({ error: 'Qualification record already exists for this vendor + subgroup', existingId: existing.rows[0].id });

      const r = await pool.query(
        `INSERT INTO vendor_subgroup_qualification
           (vendor_id, subgroup_code, subgroup_label, status, notes, conditions, valid_until, annual_review_due, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
         RETURNING *`,
        [vendorId, subgroupCode, subgroupLabel ?? null, status ?? 'under_review', notes ?? null, cond ?? null, validUntil ?? null, annualReviewDue ?? null, userId],
      );
      const row = r.rows[0];

      // Find a project_id for audit — use the first project in the system if no context
      const projectCtx = await pool.query(`SELECT id FROM projects LIMIT 1`);
      if (projectCtx.rows[0]) {
        await logPlcAudit(pool, {
          projectId: projectCtx.rows[0].id,
          entityType: 'vendor_qual',
          entityId: row.id,
          eventType: 'vendor_qual_created',
          oldStatus: null,
          newStatus: status ?? 'under_review',
          changedBy: userId,
          notes: `AVL created for vendor ${vendorId}, subgroup ${subgroupCode}`,
        });
      }

      res.status(201).json(row);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch('/api/vendor-subgroup-qualification/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const userId = (req.user as any).id;
      const { status, notes, conditions: cond, validUntil, annualReviewDue, performanceScore } = req.body;

      const curr = await pool.query(`SELECT * FROM vendor_subgroup_qualification WHERE id = $1`, [id]);
      if (!curr.rows[0]) return res.status(404).json({ error: 'Qualification record not found' });
      const old = curr.rows[0];

      const sets: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
      const p = () => { params.push(arguments[0]); return `$${params.length}`; };

      if (status !== undefined) {
        params.push(status); sets.push(`status = $${params.length}`);
        if (status === 'qualified' || status === 'conditionally_qualified') {
          params.push(userId); sets.push(`qualified_by = $${params.length}`);
          sets.push(`qualified_at = NOW()`);
          params.push(userId); sets.push(`last_reviewed_by = $${params.length}`);
          sets.push(`last_reviewed_at = NOW()`);
        }
      }
      if (notes !== undefined) { params.push(notes); sets.push(`notes = $${params.length}`); }
      if (cond !== undefined) { params.push(cond); sets.push(`conditions = $${params.length}`); }
      if (validUntil !== undefined) { params.push(validUntil); sets.push(`valid_until = $${params.length}`); }
      if (annualReviewDue !== undefined) { params.push(annualReviewDue); sets.push(`annual_review_due = $${params.length}`); }
      if (performanceScore !== undefined) { params.push(performanceScore); sets.push(`performance_score = $${params.length}`); }

      params.push(id);
      const r = await pool.query(
        `UPDATE vendor_subgroup_qualification SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params,
      );

      if (status && status !== old.status) {
        const projectCtx = await pool.query(`SELECT id FROM projects LIMIT 1`);
        if (projectCtx.rows[0]) {
          await logPlcAudit(pool, {
            projectId: projectCtx.rows[0].id,
            entityType: 'vendor_qual',
            entityId: id,
            eventType: `vendor_qual_status_changed`,
            oldStatus: old.status,
            newStatus: status,
            changedBy: userId,
          });
        }
      }

      res.json(r.rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Check if a vendor is qualified for a subgroup — used by PO Group Wizard Step 1
  app.get('/api/vendor-subgroup-qualification/check', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { vendorId, subgroupCode } = req.query;
      if (!vendorId || !subgroupCode) return res.status(400).json({ error: 'vendorId and subgroupCode are required' });
      const r = await pool.query(
        `SELECT id, status, valid_until, performance_score, conditions
         FROM vendor_subgroup_qualification
         WHERE vendor_id = $1 AND subgroup_code = $2`,
        [parseInt(vendorId as string), subgroupCode],
      );
      if (!r.rows[0]) return res.json({ qualified: false, status: null, record: null });
      const row = r.rows[0];
      const qualified = ['qualified', 'conditionally_qualified'].includes(row.status);
      res.json({ qualified, status: row.status, record: row });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // All qualifications for a vendor
  app.get('/api/vendors/:vendorId/subgroup-qualifications', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      if (isNaN(vendorId)) return res.status(400).json({ error: 'Invalid vendorId' });
      const r = await pool.query(
        `SELECT vsq.*, u.name AS qualified_by_name
         FROM vendor_subgroup_qualification vsq
         LEFT JOIN users u ON u.id = vsq.qualified_by
         WHERE vsq.vendor_id = $1
         ORDER BY vsq.subgroup_code`,
        [vendorId],
      );
      res.json(r.rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  console.log('[VendorQual] AVL qualification routes registered');
}
