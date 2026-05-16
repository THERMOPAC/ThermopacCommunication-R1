/**
 * GCS Governance Routes — Phase 0 + Phase 1
 * CRUD for rules, token registry, monitor log, and upload token issuance.
 * Monitor-only: reads existing data, never blocks uploads.
 */

import type { Express, Request, Response } from 'express';
import { db } from './db';
import {
  gcsGovernanceRules,
  gcsGovernanceTokenRegistry,
  gcsUploadMonitorLog,
  gcsUploadTokens,
  insertGcsGovernanceRuleSchema,
  insertGcsGovernanceTokenSchema,
} from '@shared/schema';
import { eq, desc, and, or, ilike, isNull, isNotNull, count, sql } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import {
  previewPath,
  getMonitorStats,
  issueUploadToken,
  validateUploadToken,
  getIssuedTokenStats,
  getIssuedTokens,
} from './services/gcs-governance-service';

function superuserOnly(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!user || user.role !== 'Superuser') {
    res.status(403).json({ error: 'Superuser access required' });
    return false;
  }
  return true;
}

export function setupGcsGovernanceRoutes(app: Express): void {

  // ── Token Registry ──────────────────────────────────────────────────────

  app.get('/api/gcs-governance/tokens', ensureAuthenticated, async (req, res) => {
    try {
      const tokens = await db.select().from(gcsGovernanceTokenRegistry).orderBy(gcsGovernanceTokenRegistry.tokenName);
      res.json(tokens);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/gcs-governance/tokens', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const parsed = insertGcsGovernanceTokenSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [created] = await db.insert(gcsGovernanceTokenRegistry).values(parsed.data).returning();
      res.status(201).json(created);
    } catch (err: any) {
      if (err.message?.includes('unique')) return res.status(409).json({ error: 'Token name already exists' });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/gcs-governance/tokens/:id', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const id = parseInt(req.params.id);
      const { tokenName, ...rest } = req.body;
      const [updated] = await db.update(gcsGovernanceTokenRegistry)
        .set(rest)
        .where(eq(gcsGovernanceTokenRegistry.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Token not found' });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Governance Rules ────────────────────────────────────────────────────

  app.get('/api/gcs-governance/rules', ensureAuthenticated, async (req, res) => {
    try {
      const { module: moduleKey, active } = req.query;
      let query = db.select().from(gcsGovernanceRules);
      const conditions = [];
      if (moduleKey) conditions.push(eq(gcsGovernanceRules.moduleKey, moduleKey as string));
      if (active !== undefined) conditions.push(eq(gcsGovernanceRules.active, active === 'true'));
      const rules = conditions.length
        ? await db.select().from(gcsGovernanceRules).where(and(...conditions)).orderBy(gcsGovernanceRules.moduleKey, gcsGovernanceRules.documentType)
        : await db.select().from(gcsGovernanceRules).orderBy(gcsGovernanceRules.moduleKey, gcsGovernanceRules.documentType);
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/gcs-governance/rules', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const parsed = insertGcsGovernanceRuleSchema.safeParse({
        ...req.body,
        createdBy: (req as any).user?.id,
      });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const [created] = await db.insert(gcsGovernanceRules).values(parsed.data).returning();
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/gcs-governance/rules/:id', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const id = parseInt(req.params.id);
      const { id: _id, createdAt, createdBy, ...updates } = req.body;
      const [updated] = await db.update(gcsGovernanceRules)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(gcsGovernanceRules.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Rule not found' });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/gcs-governance/rules/:id/deactivate', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const id = parseInt(req.params.id);
      const [updated] = await db.update(gcsGovernanceRules)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(gcsGovernanceRules.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Rule not found' });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/gcs-governance/rules/:id/activate', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const id = parseInt(req.params.id);
      const [updated] = await db.update(gcsGovernanceRules)
        .set({ active: true, updatedAt: new Date() })
        .where(eq(gcsGovernanceRules.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Rule not found' });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Path preview — resolve a template with sample token values
  app.post('/api/gcs-governance/rules/preview', ensureAuthenticated, async (req, res) => {
    try {
      const { pathTemplate, tokens } = req.body;
      if (!pathTemplate) return res.status(400).json({ error: 'pathTemplate required' });
      const result = previewPath(pathTemplate, tokens ?? {});
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Monitor Log ──────────────────────────────────────────────────────────

  app.get('/api/gcs-governance/monitor-log/stats', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const stats = await getMonitorStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/gcs-governance/monitor-log', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const { module: moduleKey, conforms, limit = '200', offset = '0' } = req.query;
      const conditions = [];
      if (moduleKey) conditions.push(eq(gcsUploadMonitorLog.moduleKey, moduleKey as string));
      if (conforms === 'true')  conditions.push(eq(gcsUploadMonitorLog.pathConforms, true));
      if (conforms === 'false') conditions.push(eq(gcsUploadMonitorLog.pathConforms, false));
      if (conforms === 'unmatched') conditions.push(isNull(gcsUploadMonitorLog.matchedRuleId));

      const rows = conditions.length
        ? await db.select().from(gcsUploadMonitorLog)
            .where(and(...conditions))
            .orderBy(desc(gcsUploadMonitorLog.detectedAt))
            .limit(parseInt(limit as string))
            .offset(parseInt(offset as string))
        : await db.select().from(gcsUploadMonitorLog)
            .orderBy(desc(gcsUploadMonitorLog.detectedAt))
            .limit(parseInt(limit as string))
            .offset(parseInt(offset as string));

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Phase 1: Upload Tokens ───────────────────────────────────────────────

  // Issue a new short-lived upload token
  app.post('/api/gcs-governance/upload-tokens/issue', ensureAuthenticated, async (req, res) => {
    try {
      const { ruleId, tokenValues, ttlSeconds, notes } = req.body;
      if (!ruleId) return res.status(400).json({ error: 'ruleId required' });
      if (!tokenValues || typeof tokenValues !== 'object') return res.status(400).json({ error: 'tokenValues object required' });

      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Authenticated user required' });

      const result = await issueUploadToken({
        ruleId: parseInt(ruleId),
        tokenValues,
        issuedTo: userId,
        ttlSeconds: ttlSeconds ? parseInt(ttlSeconds) : 300,
        notes,
      });

      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Validate a raw token against an actual GCS path
  app.post('/api/gcs-governance/upload-tokens/validate', ensureAuthenticated, async (req, res) => {
    try {
      const { rawToken, actualPath } = req.body;
      if (!rawToken) return res.status(400).json({ error: 'rawToken required' });
      if (!actualPath) return res.status(400).json({ error: 'actualPath required' });

      const result = await validateUploadToken({ rawToken, actualPath });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Stats: counts by status
  app.get('/api/gcs-governance/upload-tokens/stats', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const stats = await getIssuedTokenStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List issued tokens with filters
  app.get('/api/gcs-governance/upload-tokens', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const { module: moduleKey, status, limit = '100', offset = '0' } = req.query;
      const tokens = await getIssuedTokens({
        moduleKey: moduleKey as string | undefined,
        status: status as any,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
      // Never return the token hash — return only safe fields
      const safe = tokens.map(({ tokenHash: _h, ...rest }) => rest);
      res.json(safe);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[GCS-Governance] Routes registered at /api/gcs-governance/* (Phase 0 + Phase 1)');
}
