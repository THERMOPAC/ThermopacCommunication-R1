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

function slugify(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '_');
  // NOTE: no silent stripping — SLUG_RE validation below will reject hyphens, dots, slashes etc.
}
const SLUG_RE = /^[a-z0-9_]+$/;

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

  // ── Meta: distinct module keys (DB + canonical list) ──────────────────────
  app.get('/api/gcs-governance/rules/meta/modules', ensureAuthenticated, async (req, res) => {
    try {
      const rows = await db
        .select({ moduleKey: gcsGovernanceRules.moduleKey })
        .from(gcsGovernanceRules)
        .groupBy(gcsGovernanceRules.moduleKey)
        .orderBy(gcsGovernanceRules.moduleKey);
      const dbModules = rows.map(r => r.moduleKey);
      const canonical = ['design', 'dvs', 'epc', 'finance', 'hr', 'internal', 'legal', 'legacy', 'qms', 'sales', 'sap'];
      const merged = [...new Set([...canonical, ...dbModules])].sort();
      res.json({ modules: merged });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Meta: distinct submodule keys for a given module ──────────────────────
  app.get('/api/gcs-governance/rules/meta/submodules', ensureAuthenticated, async (req, res) => {
    try {
      const { moduleKey } = req.query;
      if (!moduleKey) return res.status(400).json({ error: 'moduleKey query param required' });
      const rows = await db
        .select({ submoduleKey: gcsGovernanceRules.submoduleKey })
        .from(gcsGovernanceRules)
        .where(and(
          eq(gcsGovernanceRules.moduleKey, moduleKey as string),
          isNotNull(gcsGovernanceRules.submoduleKey),
        ))
        .groupBy(gcsGovernanceRules.submoduleKey)
        .orderBy(gcsGovernanceRules.submoduleKey);
      const submodules = rows.map(r => r.submoduleKey).filter(Boolean) as string[];
      res.json({ submodules });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/gcs-governance/rules', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const body = { ...req.body };

      // Normalize internal keys
      body.moduleKey = slugify(body.moduleKey ?? '');
      body.submoduleKey = body.submoduleKey ? slugify(body.submoduleKey) : null;
      body.documentType = (body.documentType ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');

      // Validate slug-safety
      if (!body.moduleKey || !SLUG_RE.test(body.moduleKey)) {
        return res.status(400).json({ error: 'module_key must be slug-safe: lowercase letters, digits, underscores only (e.g. qms, test_procedures)' });
      }
      if (body.submoduleKey !== null && !SLUG_RE.test(body.submoduleKey)) {
        return res.status(400).json({ error: 'submodule_key must be slug-safe: lowercase letters, digits, underscores only (e.g. pma, wpqr)' });
      }

      // Duplicate check: (module_key, submodule_key, document_type) must be unique
      const dupCheck = await db
        .select({ id: gcsGovernanceRules.id, displayName: gcsGovernanceRules.displayName })
        .from(gcsGovernanceRules)
        .where(and(
          eq(gcsGovernanceRules.moduleKey, body.moduleKey),
          body.submoduleKey ? eq(gcsGovernanceRules.submoduleKey, body.submoduleKey) : isNull(gcsGovernanceRules.submoduleKey),
          eq(gcsGovernanceRules.documentType, body.documentType),
        ))
        .limit(1);
      if (dupCheck.length > 0) {
        return res.status(409).json({
          error: `A rule already exists for module_key="${body.moduleKey}", submodule_key="${body.submoduleKey ?? ''}", document_type="${body.documentType}" (id=${dupCheck[0].id} — "${dupCheck[0].displayName}"). Edit that rule instead.`,
        });
      }

      const parsed = insertGcsGovernanceRuleSchema.safeParse({
        ...body,
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

      // Fetch current rule to enforce key immutability
      const [current] = await db.select().from(gcsGovernanceRules).where(eq(gcsGovernanceRules.id, id)).limit(1);
      if (!current) return res.status(404).json({ error: 'Rule not found' });

      // Reject changes to immutable governance keys
      if (updates.moduleKey !== undefined && slugify(updates.moduleKey) !== current.moduleKey) {
        return res.status(400).json({ error: 'module_key is a permanent governance identifier and cannot be changed after creation. Create a new rule with the correct key instead.' });
      }
      if (updates.submoduleKey !== undefined) {
        const normalizedNew = updates.submoduleKey ? slugify(updates.submoduleKey) : null;
        const normalizedCurrent = current.submoduleKey ?? null;
        if (normalizedNew !== normalizedCurrent) {
          return res.status(400).json({ error: 'submodule_key is a permanent governance identifier and cannot be changed after creation. Create a new rule with the correct key instead.' });
        }
      }

      // Normalize non-key fields
      if (updates.documentType) {
        updates.documentType = updates.documentType.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
      }
      if (updates.displayName) updates.displayName = updates.displayName.trim();
      if (updates.rootPrefix)  updates.rootPrefix  = updates.rootPrefix.trim();
      if (updates.pathTemplate) updates.pathTemplate = updates.pathTemplate.trim();

      // Duplicate check if document_type is changing
      if (updates.documentType && updates.documentType !== current.documentType) {
        const dupCheck = await db
          .select({ id: gcsGovernanceRules.id, displayName: gcsGovernanceRules.displayName })
          .from(gcsGovernanceRules)
          .where(and(
            eq(gcsGovernanceRules.moduleKey, current.moduleKey),
            current.submoduleKey ? eq(gcsGovernanceRules.submoduleKey, current.submoduleKey) : isNull(gcsGovernanceRules.submoduleKey),
            eq(gcsGovernanceRules.documentType, updates.documentType),
          ))
          .limit(1);
        if (dupCheck.length > 0 && dupCheck[0].id !== id) {
          return res.status(409).json({
            error: `Rule #${dupCheck[0].id} ("${dupCheck[0].displayName}") already uses document_type="${updates.documentType}" in this module/submodule. Choose a different document type.`,
          });
        }
      }

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
