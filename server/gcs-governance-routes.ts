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
  gcsGovernanceRuleVersions,
  gcsGovernanceAuditLog,
  gcsPathMigrationLog,
  insertGcsGovernanceRuleSchema,
  insertGcsGovernanceTokenSchema,
  offers,
  customers,
} from '@shared/schema';
import { eq, desc, and, or, ilike, isNull, isNotNull, count, sql, ne } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import {
  previewPath,
  getMonitorStats,
  issueUploadToken,
  validateUploadToken,
  getIssuedTokenStats,
  getIssuedTokens,
} from './services/gcs-governance-service';
import { buildQuotationGcsPath, buildEpcQtnGcsPath, resolveProjectGeoCodes } from './epc-coding';
import { pool } from './db';
import {
  runZeroTrustValidation,
  runDryRunSimulation,
  checkActivationFreeze,
} from './services/gcs-governance-zero-trust';

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

  // ── Governance Mode — enable/disable DB-driven routing per rule ──────────
  app.patch('/api/gcs-governance/rules/:id/governance-mode', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const id = parseInt(req.params.id);
      const { mode } = req.body;
      if (!mode || !['hardcoded', 'db_driven'].includes(mode)) {
        return res.status(400).json({ error: 'mode must be "hardcoded" or "db_driven"' });
      }
      const [updated] = await db.execute(sql`
        UPDATE gcs_governance_rules
        SET governance_mode = ${mode}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `).then((r: any) => r.rows);
      if (!updated) return res.status(404).json({ error: 'Rule not found' });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Per-rule: issued tokens (last 20) with stats ───────────────────────
  app.get('/api/gcs-governance/rules/:id/tokens', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const ruleId = parseInt(req.params.id);
      const tokens = await db.select().from(gcsUploadTokens)
        .where(eq(gcsUploadTokens.ruleId, ruleId))
        .orderBy(desc(gcsUploadTokens.issuedAt))
        .limit(20);
      const statsRow = await db.execute(sql`
        SELECT
          COUNT(*)::int                                                             AS total,
          COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at > NOW())::int      AS live,
          COUNT(*) FILTER (WHERE used_at IS NOT NULL)::int                         AS used,
          COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at <= NOW())::int     AS expired
        FROM gcs_upload_tokens WHERE rule_id = ${ruleId}
      `).then((r: any) => r.rows[0]);
      res.json({
        tokens,
        stats: {
          total:   Number(statsRow?.total   ?? 0),
          live:    Number(statsRow?.live    ?? 0),
          used:    Number(statsRow?.used    ?? 0),
          expired: Number(statsRow?.expired ?? 0),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Per-rule: monitor log (last 20) with stats ────────────────────────
  app.get('/api/gcs-governance/rules/:id/monitor-log', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const ruleId = parseInt(req.params.id);
      const logs = await db.select().from(gcsUploadMonitorLog)
        .where(eq(gcsUploadMonitorLog.matchedRuleId, ruleId))
        .orderBy(desc(gcsUploadMonitorLog.detectedAt))
        .limit(20);
      const statsRow = await db.execute(sql`
        SELECT
          COUNT(*)::int                                                      AS total,
          COUNT(*) FILTER (WHERE path_conforms = true)::int                 AS conforming,
          COUNT(*) FILTER (WHERE path_conforms = false)::int                AS violations
        FROM gcs_upload_monitor_log WHERE matched_rule_id = ${ruleId}
      `).then((r: any) => r.rows[0]);
      res.json({
        logs,
        stats: {
          total:      Number(statsRow?.total      ?? 0),
          conforming: Number(statsRow?.conforming ?? 0),
          violations: Number(statsRow?.violations ?? 0),
        },
      });
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

  // ── Phase 0: Rule Version Lifecycle ─────────────────────────────────────

  async function logGovernanceEvent(opts: {
    eventType: string;
    ruleId?: number;
    versionId?: number;
    actorId?: number;
    actorRole?: string;
    payload?: Record<string, unknown>;
    req: Request;
  }) {
    try {
      const ip = opts.req.ip ?? (opts.req as any).connection?.remoteAddress ?? null;
      await db.insert(gcsGovernanceAuditLog).values({
        eventType: opts.eventType,
        ruleId: opts.ruleId ?? null,
        versionId: opts.versionId ?? null,
        actorId: opts.actorId ?? null,
        actorRole: opts.actorRole ?? null,
        payload: opts.payload ?? null,
        ipAddress: typeof ip === 'string' ? ip.slice(0, 45) : null,
      });
    } catch (err) {
      console.warn('[GCS-Governance] Audit log write failed:', err);
    }
  }

  // List versions for a rule
  app.get('/api/gcs-governance/rules/:ruleId/versions', ensureAuthenticated, async (req, res) => {
    try {
      const ruleId = parseInt(req.params.ruleId);
      const versions = await db
        .select()
        .from(gcsGovernanceRuleVersions)
        .where(eq(gcsGovernanceRuleVersions.ruleId, ruleId))
        .orderBy(desc(gcsGovernanceRuleVersions.versionNumber));
      res.json(versions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create a new draft version
  app.post('/api/gcs-governance/rules/:ruleId/versions', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const ruleId = parseInt(req.params.ruleId);
      const actorId = (req as any).user?.id;
      const actorRole = (req as any).user?.role;

      const [rule] = await db.select().from(gcsGovernanceRules).where(eq(gcsGovernanceRules.id, ruleId)).limit(1);
      if (!rule) return res.status(404).json({ error: 'Rule not found' });

      // Check no draft/pending_approval already exists
      const [existingDraft] = await db
        .select({ id: gcsGovernanceRuleVersions.id, status: gcsGovernanceRuleVersions.status })
        .from(gcsGovernanceRuleVersions)
        .where(and(
          eq(gcsGovernanceRuleVersions.ruleId, ruleId),
          sql`status IN ('draft', 'pending_approval')`,
        ))
        .limit(1);
      if (existingDraft) {
        return res.status(409).json({
          error: `A version in "${existingDraft.status}" already exists for this rule. ` +
            `Retire it before creating a new draft.`,
        });
      }

      // Determine next version number
      const [maxRow] = await db
        .select({ max: sql<number>`MAX(version_number)` })
        .from(gcsGovernanceRuleVersions)
        .where(eq(gcsGovernanceRuleVersions.ruleId, ruleId));
      const nextNum = (maxRow?.max ?? 0) + 1;

      const { pathTemplate, revisionMode, rootPrefix, displayName, notes } = req.body;
      if (!pathTemplate) return res.status(400).json({ error: 'pathTemplate required' });

      const [created] = await db.insert(gcsGovernanceRuleVersions).values({
        ruleId,
        versionNumber: nextNum,
        pathTemplate: pathTemplate.trim(),
        revisionMode: revisionMode ?? rule.revisionMode,
        rootPrefix: (rootPrefix ?? rule.rootPrefix).trim(),
        displayName: (displayName ?? rule.displayName).trim(),
        notes: notes ?? null,
        status: 'draft',
        createdBy: actorId ?? null,
      }).returning();

      await logGovernanceEvent({ eventType: 'version_created', ruleId, versionId: created.id, actorId, actorRole, req });
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Submit for approval — runs Zero-Trust validation
  app.post('/api/gcs-governance/rules/:ruleId/versions/:versionId/submit', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const ruleId = parseInt(req.params.ruleId);
      const versionId = parseInt(req.params.versionId);
      const actorId = (req as any).user?.id;
      const actorRole = (req as any).user?.role;

      const [version] = await db.select().from(gcsGovernanceRuleVersions)
        .where(and(eq(gcsGovernanceRuleVersions.id, versionId), eq(gcsGovernanceRuleVersions.ruleId, ruleId)))
        .limit(1);
      if (!version) return res.status(404).json({ error: 'Version not found' });
      if (version.status !== 'draft') return res.status(400).json({ error: `Can only submit draft versions. Current status: ${version.status}` });

      const validation = await runZeroTrustValidation(versionId, actorId ?? null);

      await db.update(gcsGovernanceRuleVersions)
        .set({
          status: 'pending_approval',
          validationEvidence: validation as any,
        })
        .where(eq(gcsGovernanceRuleVersions.id, versionId));

      await logGovernanceEvent({
        eventType: 'version_submitted',
        ruleId, versionId, actorId, actorRole,
        payload: { validationOverall: validation.overall },
        req,
      });

      res.json({ ...version, status: 'pending_approval', validationEvidence: validation });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Approve a pending version
  app.post('/api/gcs-governance/rules/:ruleId/versions/:versionId/approve', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const ruleId = parseInt(req.params.ruleId);
      const versionId = parseInt(req.params.versionId);
      const actorId = (req as any).user?.id;
      const actorRole = (req as any).user?.role;

      const [version] = await db.select().from(gcsGovernanceRuleVersions)
        .where(and(eq(gcsGovernanceRuleVersions.id, versionId), eq(gcsGovernanceRuleVersions.ruleId, ruleId)))
        .limit(1);
      if (!version) return res.status(404).json({ error: 'Version not found' });
      if (version.status !== 'pending_approval') return res.status(400).json({ error: `Can only approve pending_approval versions. Current status: ${version.status}` });
      if (version.createdBy === actorId) return res.status(403).json({ error: 'The creator of a version cannot approve it. A different Superuser must approve.' });

      const [updated] = await db.update(gcsGovernanceRuleVersions)
        .set({ status: 'approved', approvedBy: actorId ?? null, approvedAt: new Date() })
        .where(eq(gcsGovernanceRuleVersions.id, versionId))
        .returning();

      await logGovernanceEvent({ eventType: 'version_approved', ruleId, versionId, actorId, actorRole, req });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Activate an approved version — two modes:
  //   { dryRun: true }                              → simulate only, store evidence, no routing change
  //   { dryRun: false, confirmation: "ACTIVATE" }   → freeze check then atomic swap
  app.post('/api/gcs-governance/rules/:ruleId/versions/:versionId/activate', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const ruleId = parseInt(req.params.ruleId);
      const versionId = parseInt(req.params.versionId);
      const actorId = (req as any).user?.id;
      const actorRole = (req as any).user?.role;
      const { dryRun = false, confirmation } = req.body ?? {};

      const [version] = await db.select().from(gcsGovernanceRuleVersions)
        .where(and(eq(gcsGovernanceRuleVersions.id, versionId), eq(gcsGovernanceRuleVersions.ruleId, ruleId)))
        .limit(1);
      if (!version) return res.status(404).json({ error: 'Version not found' });
      if (version.status !== 'approved') return res.status(400).json({ error: `Can only activate approved versions. Current status: ${version.status}` });

      // ── DRY-RUN MODE ────────────────────────────────────────────────────
      if (dryRun === true) {
        const dryRunResult = await runDryRunSimulation(versionId, actorId ?? null);

        // Merge dry_run into existing validation_evidence (preserve static checks)
        const existingEvidence = (version.validationEvidence as Record<string, unknown>) ?? {};
        const updatedEvidence = { ...existingEvidence, dry_run: dryRunResult };

        await db.update(gcsGovernanceRuleVersions)
          .set({ validationEvidence: updatedEvidence as any })
          .where(eq(gcsGovernanceRuleVersions.id, versionId));

        await logGovernanceEvent({
          eventType: 'dry_run_ran',
          ruleId, versionId, actorId, actorRole,
          payload: {
            overallDryRun: dryRunResult.overallDryRun,
            sampleCount: dryRunResult.sampleCount,
            sampleSource: dryRunResult.sampleSource,
          },
          req,
        });

        return res.json({ dryRun: true, ...dryRunResult });
      }

      // ── COMMIT MODE ──────────────────────────────────────────────────────

      // Gate 1: dry-run must have already passed
      const evidence = (version.validationEvidence as any) ?? {};
      if (evidence?.dry_run?.overallDryRun !== 'PASS') {
        return res.status(409).json({
          error: 'DRY_RUN_REQUIRED',
          message: 'A dry-run with overall_dry_run="PASS" must be completed before activation. Run dry-run first.',
        });
      }

      // Gate 2: confirmation string
      if (confirmation !== 'ACTIVATE') {
        return res.status(400).json({ error: 'Confirmation "ACTIVATE" required' });
      }

      // Gate 3: freeze check — block if any live pending tokens exist for this rule
      const freeze = await checkActivationFreeze(ruleId);
      if (freeze.blocked) {
        await logGovernanceEvent({
          eventType: 'activation_freeze_blocked',
          ruleId, versionId, actorId, actorRole,
          payload: { count: freeze.count, tokenIds: freeze.tokenIds, latestExpiry: freeze.latestExpiry },
          req,
        });
        return res.status(409).json({
          error: 'ACTIVATION_FREEZE',
          reason: 'live_pending_tokens',
          count: freeze.count,
          tokenIds: freeze.tokenIds,
          earliestExpiry: freeze.earliestExpiry,
          latestExpiry: freeze.latestExpiry,
          message: `${freeze.count} upload token(s) are currently live for this rule. Wait for them to expire or be consumed before activating. Latest expiry: ${freeze.latestExpiry}`,
        });
      }

      // Gate 4: Atomic routing swap
      await db.transaction(async (tx) => {
        await tx.update(gcsGovernanceRuleVersions)
          .set({ status: 'superseded', supersededAt: new Date() })
          .where(and(
            eq(gcsGovernanceRuleVersions.ruleId, ruleId),
            eq(gcsGovernanceRuleVersions.status, 'active'),
            ne(gcsGovernanceRuleVersions.id, versionId),
          ));

        await tx.update(gcsGovernanceRuleVersions)
          .set({ status: 'active', activatedBy: actorId ?? null, activatedAt: new Date() })
          .where(eq(gcsGovernanceRuleVersions.id, versionId));

        // Propagate pathTemplate to rule row for monitor-log compatibility (Phase 0)
        await tx.update(gcsGovernanceRules)
          .set({ pathTemplate: version.pathTemplate, rootPrefix: version.rootPrefix, updatedAt: new Date() })
          .where(eq(gcsGovernanceRules.id, ruleId));
      });

      await logGovernanceEvent({
        eventType: 'version_activated',
        ruleId, versionId, actorId, actorRole,
        payload: { activationFreezeCheckedAt: new Date().toISOString(), liveTokensAtActivation: 0 },
        req,
      });

      const [refreshed] = await db.select().from(gcsGovernanceRuleVersions)
        .where(eq(gcsGovernanceRuleVersions.id, versionId)).limit(1);
      res.json(refreshed);
    } catch (err: any) {
      if (err.message?.includes('unique') || err.message?.includes('gcs_rule_versions_one_active')) {
        return res.status(409).json({ error: 'Concurrent activation detected. Refresh and try again.' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // Rollback — restore a superseded version to active (with freeze check)
  app.post('/api/gcs-governance/rules/:ruleId/versions/:versionId/rollback', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const ruleId = parseInt(req.params.ruleId);
      const versionId = parseInt(req.params.versionId);
      const actorId = (req as any).user?.id;
      const actorRole = (req as any).user?.role;
      const { confirmation } = req.body ?? {};

      const [version] = await db.select().from(gcsGovernanceRuleVersions)
        .where(and(eq(gcsGovernanceRuleVersions.id, versionId), eq(gcsGovernanceRuleVersions.ruleId, ruleId)))
        .limit(1);
      if (!version) return res.status(404).json({ error: 'Version not found' });
      if (version.status !== 'superseded') return res.status(400).json({ error: `Can only rollback superseded versions. Current status: ${version.status}` });

      if (confirmation !== 'ROLLBACK') {
        return res.status(400).json({ error: 'Confirmation "ROLLBACK" required' });
      }

      // Freeze check — same guard as activation
      const freeze = await checkActivationFreeze(ruleId);
      if (freeze.blocked) {
        await logGovernanceEvent({
          eventType: 'activation_freeze_blocked',
          ruleId, versionId, actorId, actorRole,
          payload: { operation: 'rollback', count: freeze.count, tokenIds: freeze.tokenIds, latestExpiry: freeze.latestExpiry },
          req,
        });
        return res.status(409).json({
          error: 'ACTIVATION_FREEZE',
          reason: 'live_pending_tokens',
          count: freeze.count,
          tokenIds: freeze.tokenIds,
          earliestExpiry: freeze.earliestExpiry,
          latestExpiry: freeze.latestExpiry,
          message: `${freeze.count} upload token(s) are currently live. Rollback blocked until all live tokens expire or are consumed. Latest expiry: ${freeze.latestExpiry}`,
        });
      }

      await db.transaction(async (tx) => {
        // Mark current active as superseded
        await tx.update(gcsGovernanceRuleVersions)
          .set({ status: 'superseded', supersededAt: new Date() })
          .where(and(
            eq(gcsGovernanceRuleVersions.ruleId, ruleId),
            eq(gcsGovernanceRuleVersions.status, 'active'),
          ));

        // Restore target to active
        // NOTE: existing tokens issued under any version retain their original
        // version_id and resolved_path unchanged (§3.6 token immutability)
        await tx.update(gcsGovernanceRuleVersions)
          .set({ status: 'active', supersededAt: null, activatedBy: actorId ?? null, activatedAt: new Date() })
          .where(eq(gcsGovernanceRuleVersions.id, versionId));

        // Propagate to rule row
        await tx.update(gcsGovernanceRules)
          .set({ pathTemplate: version.pathTemplate, rootPrefix: version.rootPrefix, updatedAt: new Date() })
          .where(eq(gcsGovernanceRules.id, ruleId));
      });

      await logGovernanceEvent({
        eventType: 'version_rolled_back',
        ruleId, versionId, actorId, actorRole,
        payload: {
          fromVersionNumber: version.versionNumber,
          activationFreezeCheckedAt: new Date().toISOString(),
          liveTokensAtRollback: 0,
        },
        req,
      });

      const [refreshed] = await db.select().from(gcsGovernanceRuleVersions)
        .where(eq(gcsGovernanceRuleVersions.id, versionId)).limit(1);
      res.json(refreshed);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Retire a draft or approved version
  app.post('/api/gcs-governance/rules/:ruleId/versions/:versionId/retire', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const ruleId = parseInt(req.params.ruleId);
      const versionId = parseInt(req.params.versionId);
      const actorId = (req as any).user?.id;
      const actorRole = (req as any).user?.role;

      const [version] = await db.select().from(gcsGovernanceRuleVersions)
        .where(and(eq(gcsGovernanceRuleVersions.id, versionId), eq(gcsGovernanceRuleVersions.ruleId, ruleId)))
        .limit(1);
      if (!version) return res.status(404).json({ error: 'Version not found' });
      if (!['draft', 'approved', 'pending_approval'].includes(version.status)) {
        return res.status(400).json({ error: `Can only retire draft/pending_approval/approved versions. Current status: ${version.status}` });
      }

      const [updated] = await db.update(gcsGovernanceRuleVersions)
        .set({ status: 'retired', supersededAt: new Date() })
        .where(eq(gcsGovernanceRuleVersions.id, versionId))
        .returning();

      await logGovernanceEvent({ eventType: 'version_retired', ruleId, versionId, actorId, actorRole, req });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Force seed v1 versions for rules missing a version (admin/Superuser only)
  app.post('/api/gcs-governance/rules/seed-v1-versions', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const allRules = await db.select().from(gcsGovernanceRules);
      let seeded = 0;
      for (const rule of allRules) {
        const existingVersion = await db
          .select({ id: gcsGovernanceRuleVersions.id })
          .from(gcsGovernanceRuleVersions)
          .where(eq(gcsGovernanceRuleVersions.ruleId, rule.id))
          .limit(1);
        if (existingVersion.length === 0) {
          await db.insert(gcsGovernanceRuleVersions).values({
            ruleId: rule.id,
            versionNumber: 1,
            pathTemplate: rule.pathTemplate,
            revisionMode: rule.revisionMode,
            rootPrefix: rule.rootPrefix,
            displayName: rule.displayName,
            notes: `v1: Admin-triggered Phase 0 bootstrap from rule definition.`,
            status: 'active',
            activatedAt: new Date(),
            createdBy: (req as any).user?.id ?? null,
          });
          seeded++;
        }
      }
      res.json({ seeded, total: allRules.length, message: `Seeded ${seeded} v1 version(s)` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Migration Log ────────────────────────────────────────────────────────

  app.get('/api/gcs-governance/migration-log', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const { status, ruleId } = req.query;
      const conditions: any[] = [];
      if (status) conditions.push(eq(gcsPathMigrationLog.status, status as string));
      if (ruleId) conditions.push(eq(gcsPathMigrationLog.ruleId, parseInt(ruleId as string)));

      const rows = conditions.length
        ? await db.select().from(gcsPathMigrationLog).where(and(...conditions)).orderBy(gcsPathMigrationLog.ruleId)
        : await db.select().from(gcsPathMigrationLog).orderBy(gcsPathMigrationLog.ruleId);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/gcs-governance/migration-log/:id', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const id = parseInt(req.params.id);
      const { status, notes } = req.body;
      const updates: any = {};
      if (status) updates.status = status;
      if (notes !== undefined) updates.notes = notes;
      if (status === 'done') {
        updates.migratedAt = new Date();
        updates.migratedBy = (req as any).user?.id ?? null;
      }
      const [updated] = await db.update(gcsPathMigrationLog)
        .set(updates)
        .where(eq(gcsPathMigrationLog.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Migration log entry not found' });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Governance audit log (read-only for Superuser)
  app.get('/api/gcs-governance/audit-log', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const { ruleId, limit = '100' } = req.query;
      const conditions: any[] = [];
      if (ruleId) conditions.push(eq(gcsGovernanceAuditLog.ruleId, parseInt(ruleId as string)));
      const rows = conditions.length
        ? await db.select().from(gcsGovernanceAuditLog).where(and(...conditions)).orderBy(desc(gcsGovernanceAuditLog.eventAt)).limit(parseInt(limit as string))
        : await db.select().from(gcsGovernanceAuditLog).orderBy(desc(gcsGovernanceAuditLog.eventAt)).limit(parseInt(limit as string));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GCS Path Test for a specific Offer ───────────────────────────────────
  app.get('/api/offers/:id/gcs-path-test', ensureAuthenticated, async (req, res) => {
    try {
      const offerId = parseInt(req.params.id);
      if (isNaN(offerId)) return res.status(400).json({ error: 'Invalid offer ID' });

      // Fetch offer + customer geo codes and short_code
      const result = await pool.query<{
        id: number; offer_number: string; customer_name: string; revision: number;
        subject: string; offer_type: string; customer_id: number;
        continent_code: string; country_code: string; short_code: string;
      }>(
        `SELECT o.id, o.offer_number, o.customer_name, o.revision, o.subject, o.offer_type,
                o.customer_id, c.continent_code, c.country_code, c.short_code
         FROM offers o
         LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.id = $1`,
        [offerId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Offer not found' });
      const offer = result.rows[0];

      // Extract FY from offer number — OFR-2627-0018 → "2627"
      const fyMatch = offer.offer_number?.match(/OFR-(\d{4})-/);
      const fy = fyMatch ? fyMatch[1] : 'YYYY';

      // Customer geo codes (required for path builder)
      const cc  = offer.continent_code ?? null;
      const co  = offer.country_code   ?? null;
      const sc  = offer.short_code     ?? null;
      const missingGeo = !cc || !co || !sc;

      // Real subject slug (mirrors slugifySubject in quotation-pdf-artifact.ts)
      const subjectSlug = (offer.subject || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 40)
        .replace(/-+$/g, '') || 'offer';

      // Fetch all existing PDF artifacts for this offer
      const artifacts = await pool.query(
        `SELECT id, revision, price_mode, gcs_object_path, artifact_status, generated_at
         FROM quotation_pdf_artifacts
         WHERE offer_id = $1
         ORDER BY generated_at ASC`,
        [offerId]
      );

      // Next seq = max across ALL non-superseded artifacts for this offer (mirrors atomic lock logic)
      const nonSuperseded = artifacts.rows.filter((a: any) => a.artifact_status !== 'superseded');
      const maxSeq = nonSuperseded.reduce((m: number, a: any) => Math.max(m, a.attachment_seq ?? 0), 0);
      const nextSeq = maxSeq + 1;

      res.json({
        offer: {
          id:           offer.id,
          offerNumber:  offer.offer_number,
          customerName: offer.customer_name,
          offerType:    offer.offer_type,
          revision:     offer.revision,
          subject:      offer.subject,
          continentCode: cc,
          countryCode:   co,
          shortCode:     sc,
          fyCode:        fy,
          subjectSlug,
          missingGeo,
        },
        existingFiles: artifacts.rows.map((a: any) => ({
          id:            a.id,
          revision:      a.revision,
          priceMode:     a.price_mode,
          gcsObjectPath: a.gcs_object_path,
          attachmentSeq: a.attachment_seq,
          status:        a.artifact_status,
          generatedAt:   a.generated_at,
        })),
        nextSeq,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Customer Order Path sub-endpoint ─────────────────────────────────────
  // GET /api/offers/:id/gcs-co-path-test
  // Returns existing CO documents + resolved CO folder prefix for an offer that
  // has been converted to an order. Scoped to the linked project.
  app.get('/api/offers/:id/gcs-co-path-test', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const offerId = parseInt(req.params.id);
      if (isNaN(offerId)) return res.status(400).json({ error: 'Invalid offer ID' });

      // Find conversion snapshot → project_id + order_number
      const convResult = await pool.query(
        `SELECT project_id, order_number FROM offer_conversion_snapshots
         WHERE offer_id = $1 LIMIT 1`,
        [offerId]
      );
      if (convResult.rows.length === 0) {
        return res.json({ converted: false });
      }
      const { project_id: projectId, order_number: orderNumber } = convResult.rows[0];
      if (!projectId) {
        return res.json({ converted: true, projectId: null, orderNumber, missingProject: true });
      }

      // Resolve project geo codes (throws if project has missing geo)
      let geo: any;
      let missingGeo = false;
      try {
        geo = await resolveProjectGeoCodes(projectId);
      } catch {
        missingGeo = true;
      }

      // Existing CO documents for this project + order
      const coDocs = await pool.query(
        `SELECT id, customer_order_number, document_label, revision_code,
                attachment_seq, gcs_object_path, original_file_name, status, created_at
         FROM customer_order_documents
         WHERE project_id = $1 AND customer_order_number = $2
         ORDER BY attachment_seq ASC`,
        [projectId, orderNumber]
      );

      // Next CO seq
      const maxCoSeq = coDocs.rows.reduce((m: number, r: any) => Math.max(m, r.attachment_seq ?? 0), 0);
      const nextCoSeq = maxCoSeq + 1;

      // Folder prefix (the part we know before label+filename are chosen)
      const folderPrefix = missingGeo ? null
        : `TPEL/${geo.continentCode}/${geo.countryCode}/${geo.customerShortCode}/${geo.fyCode}/${geo.projectSeq}/CO/${orderNumber}/`;

      res.json({
        converted: true,
        projectId,
        projectCode:  geo?.projectCode  ?? null,
        projectSeq:   geo?.projectSeq   ?? null,
        orderNumber,
        continentCode: geo?.continentCode ?? null,
        countryCode:   geo?.countryCode   ?? null,
        shortCode:     geo?.customerShortCode ?? null,
        fyCode:        geo?.fyCode        ?? null,
        missingGeo,
        folderPrefix,
        nextCoSeq,
        existingCoDocs: coDocs.rows.map((r: any) => ({
          id:                  r.id,
          documentLabel:       r.document_label,
          revisionCode:        r.revision_code,
          attachmentSeq:       r.attachment_seq,
          gcsObjectPath:       r.gcs_object_path,
          originalFileName:    r.original_file_name,
          status:              r.status,
          createdAt:           r.created_at,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Project GCS Path Test ────────────────────────────────────────────────
  // GET /api/projects/:id/gcs-path-test
  // Returns resolved GCS path info for a project: geo codes + CO_DOCUMENT
  // governance rule (DB-driven template) + all CO orders.
  app.get('/api/projects/:id/gcs-path-test', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

      // Fetch CO_DOCUMENT governance rule from DB (DB-driven path template)
      const ruleRow = await pool.query(
        `SELECT path_template, display_name, revision_mode, notes
         FROM gcs_governance_rules
         WHERE document_type = 'CO_DOCUMENT' AND (active IS NULL OR active = true)
         ORDER BY id ASC LIMIT 1`
      );
      const dbRule = ruleRow.rows[0] ?? null;
      const pathTemplate: string = dbRule?.path_template
        ?? 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/CO/{CO}/{Seq}-{Label}-rev-{rev}.{ext}';

      // Resolve geo codes
      let geo: any;
      let missingGeo = false;
      try {
        geo = await resolveProjectGeoCodes(projectId);
      } catch {
        missingGeo = true;
      }

      // Build the "geo-resolved template": fill in all static geo tokens,
      // leave per-document tokens ({Seq},{Label},{rev},{ext}) as-is.
      // NOTE: {CO} appears twice in the template — position 2 = country code,
      // position after literal CO/ = customer order number.
      // We resolve left-to-right: first {CO} → countryCode, second → kept as {OrderNo}.
      let geoResolvedTemplate: string | null = null;
      if (!missingGeo && geo) {
        // Replace tokens we know statically, handling the {CO} overload explicitly
        // by splitting on the literal "CO/" folder boundary.
        const parts = pathTemplate.split('/CO/');
        if (parts.length === 2) {
          const prefix = parts[0]
            .replace('{CC}',   geo.continentCode)
            .replace('{CO}',   geo.countryCode)
            .replace('{Cust}', geo.customerShortCode)
            .replace('{FY}',   geo.fyCode)
            .replace('{NNN}',  geo.projectSeq);
          const suffix = parts[1]; // keeps {CO}/{Seq}-{Label}-rev-{rev}.{ext}
          geoResolvedTemplate = `${prefix}/CO/${suffix}`;
        } else {
          // Fallback: simple replace (leaves second {CO} for order number)
          geoResolvedTemplate = pathTemplate
            .replace('{CC}',   geo.continentCode)
            .replace('{Cust}', geo.customerShortCode)
            .replace('{FY}',   geo.fyCode)
            .replace('{NNN}',  geo.projectSeq);
        }
      }

      // Get project code from DB for display when geo resolution fails
      const projRow = await pool.query(
        `SELECT code FROM projects WHERE id = $1`,
        [projectId]
      );
      const projectCode = geo?.projectCode ?? projRow.rows[0]?.code ?? null;

      // All order numbers linked to this project via conversion snapshots
      const snapshotOrders = await pool.query(
        `SELECT DISTINCT order_number FROM offer_conversion_snapshots
         WHERE project_id = $1 AND order_number IS NOT NULL
         ORDER BY order_number`,
        [projectId]
      );

      // All CO documents for this project, grouped by order number
      const allCoDocs = await pool.query(
        `SELECT id, customer_order_number, document_label, revision_code,
                attachment_seq, gcs_object_path, original_file_name, status, created_at
         FROM customer_order_documents
         WHERE project_id = $1
         ORDER BY customer_order_number, attachment_seq ASC`,
        [projectId]
      );

      // Merge order numbers from both snapshots and existing docs
      const docOrderNumbers = new Set<string>(allCoDocs.rows.map((r: any) => r.customer_order_number));
      const snapshotOrderNumbers = new Set<string>(snapshotOrders.rows.map((r: any) => r.order_number));
      const allOrderNumbers = Array.from(new Set([...snapshotOrderNumbers, ...docOrderNumbers])).sort();

      const coOrders = allOrderNumbers.map((orderNumber: string) => {
        const docs = allCoDocs.rows.filter((r: any) => r.customer_order_number === orderNumber);
        const maxSeq = docs.reduce((m: number, r: any) => Math.max(m, r.attachment_seq ?? 0), 0);

        // Compute folder prefix using actual code logic (matches customer-order-document-routes.ts)
        const folderPrefix = missingGeo || !geo
          ? null
          : `TPEL/${geo.continentCode}/${geo.countryCode}/${geo.customerShortCode}/${geo.fyCode}/${geo.projectSeq}/CO/${orderNumber}/`;

        // Resolve geoResolvedTemplate for this specific order number
        const resolvedForOrder = geoResolvedTemplate
          ? geoResolvedTemplate.replace('{CO}', orderNumber)
          : null;

        return {
          orderNumber,
          folderPrefix,
          resolvedForOrder,
          nextCoSeq: maxSeq + 1,
          docs: docs.map((r: any) => ({
            id:               r.id,
            documentLabel:    r.document_label,
            revisionCode:     r.revision_code,
            attachmentSeq:    r.attachment_seq,
            gcsObjectPath:    r.gcs_object_path,
            originalFileName: r.original_file_name,
            status:           r.status,
            createdAt:        r.created_at,
          })),
        };
      });

      res.json({
        projectId,
        projectCode,
        projectSeq:    geo?.projectSeq        ?? null,
        continentCode: geo?.continentCode      ?? null,
        countryCode:   geo?.countryCode        ?? null,
        shortCode:     geo?.customerShortCode  ?? null,
        fyCode:        geo?.fyCode             ?? null,
        missingGeo,
        // DB-driven governance rule
        pathTemplate,
        geoResolvedTemplate,
        ruleDisplayName:  dbRule?.display_name  ?? 'Customer Order Document',
        ruleRevisionMode: dbRule?.revision_mode ?? 'numeric',
        ruleNotes:        dbRule?.notes         ?? null,
        coOrders,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[GCS-Governance] Routes registered at /api/gcs-governance/* (Phase 0 + Phase 1)');
}
