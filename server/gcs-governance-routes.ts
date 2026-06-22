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
  gcsFileMigrationJobs,
  insertGcsGovernanceRuleSchema,
  insertGcsGovernanceTokenSchema,
  offers,
  customers,
} from '@shared/schema';
import { triggerFileMigration, hasMigrationHandler, previewMigration } from './services/gcs-file-migration-service';
import { eq, desc, and, or, ilike, isNull, isNotNull, count, sql, ne } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import {
  previewPath,
  getMonitorStats,
  issueUploadToken,
  validateUploadToken,
  getIssuedTokenStats,
  getIssuedTokens,
  extractTemplateTokens,
} from './services/gcs-governance-service';
import { buildQuotationGcsPath, buildEpcQtnGcsPath, resolveProjectGeoCodes } from './epc-coding';
import { buildCustToken } from './utils/cust-token';
import { pool } from './db';
import {
  runZeroTrustValidation,
  runDryRunSimulation,
  checkActivationFreeze,
} from './services/gcs-governance-zero-trust';
import {
  syncOnCreate,
  syncOnUpdate,
  syncOnDeactivate,
  syncOnActivate,
  backfillAllGcsRules,
} from './services/gcs-doc-sync-service';

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
      const createSync = await syncOnCreate(created);
      const createResponse: any = { ...created };
      if (createSync.error) createResponse.docTemplateSyncError = createSync.error;
      else createResponse.docTemplate = { id: createSync.templateId, templateCode: createSync.templateCode, action: createSync.action };
      res.status(201).json(createResponse);
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

      // Normalize module_key / submodule_key if provided
      if (updates.moduleKey !== undefined) {
        updates.moduleKey = slugify(updates.moduleKey);
        if (!SLUG_RE.test(updates.moduleKey)) {
          return res.status(400).json({ error: 'module_key must be slug-safe: lowercase letters, digits, underscores only (e.g. sales, qms)' });
        }
      }
      if (updates.submoduleKey !== undefined && updates.submoduleKey !== null) {
        updates.submoduleKey = slugify(updates.submoduleKey);
        if (!SLUG_RE.test(updates.submoduleKey)) {
          return res.status(400).json({ error: 'submodule_key must be slug-safe: lowercase letters, digits, underscores only' });
        }
      }

      // Normalize non-key fields
      if (updates.documentType) {
        updates.documentType = updates.documentType.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
      }
      if (updates.displayName) updates.displayName = updates.displayName.trim();
      if (updates.rootPrefix)  updates.rootPrefix  = updates.rootPrefix.trim();
      if (updates.pathTemplate) {
        updates.pathTemplate  = updates.pathTemplate.trim();
        // Recompute allowedTokens from the new template so path-test endpoints stay accurate
        updates.allowedTokens = extractTemplateTokens(updates.pathTemplate);
      }

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

      // Detect path_template change on a db_driven rule — capture BEFORE update
      const pathTemplateChanging =
        updates.pathTemplate !== undefined &&
        updates.pathTemplate.trim() !== (current.pathTemplate ?? '');

      const [updated] = await db.update(gcsGovernanceRules)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(gcsGovernanceRules.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Rule not found' });

      // Auto-trigger migration when path_template changes on an active db_driven rule
      let migrationJob: { jobId: number } | undefined;
      if (
        pathTemplateChanging &&
        updated.governanceMode === 'db_driven' &&
        hasMigrationHandler(updated.documentType)
      ) {
        try {
          migrationJob = await triggerFileMigration({
            ruleId:        updated.id,
            documentType:  updated.documentType,
            pathTemplate:  updated.pathTemplate!,
            rootPrefix:    updated.rootPrefix ?? '',
            triggerReason: 'auto_template_change',
            triggeredBy:   (req as any).user?.id,
          });
          console.log(
            `[GovernanceRoutes] Auto-migration job ${migrationJob.jobId} queued for rule ${id}` +
            ` (${updated.documentType}) — path_template changed`
          );
        } catch (migErr: any) {
          console.error(`[GovernanceRoutes] Failed to queue migration on template change for rule ${id}:`, migErr.message);
        }
      }

      const patchSync = await syncOnUpdate(updated);
      const patchResponse: any = { ...updated, ...(migrationJob ? { migrationJobId: migrationJob.jobId } : {}) };
      if (patchSync.error) patchResponse.docTemplateSyncError = patchSync.error;
      else patchResponse.docTemplate = { id: patchSync.templateId, templateCode: patchSync.templateCode, action: patchSync.action };
      res.json(patchResponse);
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
      const deactSync = await syncOnDeactivate(updated);
      const deactResponse: any = { ...updated };
      if (deactSync.error) deactResponse.docTemplateSyncError = deactSync.error;
      else deactResponse.docTemplate = { id: deactSync.templateId, templateCode: deactSync.templateCode, action: deactSync.action };
      res.json(deactResponse);
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
      const actSync = await syncOnActivate(updated);
      const actResponse: any = { ...updated };
      if (actSync.error) actResponse.docTemplateSyncError = actSync.error;
      else actResponse.docTemplate = { id: actSync.templateId, templateCode: actSync.templateCode, action: actSync.action };
      res.json(actResponse);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Backfill: sync all existing GCS rules → doc_path_templates ────────────
  app.post('/api/gcs-governance/backfill-doc-templates', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const result = await backfillAllGcsRules();
      console.log(`[GCS-DocSync] Admin backfill triggered by user ${(req as any).user?.id}: ${JSON.stringify(result)}`);
      res.json(result);
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

      // Fetch previous mode before updating
      const prevRows = await db.execute(sql`
        SELECT governance_mode, document_type, path_template, root_prefix FROM gcs_governance_rules WHERE id = ${id}
      `).then((r: any) => r.rows);
      const prevRule = prevRows[0] as any;

      const [updated] = await db.execute(sql`
        UPDATE gcs_governance_rules
        SET governance_mode = ${mode}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `).then((r: any) => r.rows);
      if (!updated) return res.status(404).json({ error: 'Rule not found' });

      // Auto-trigger file migration when switching hardcoded → db_driven
      let migrationJob: { jobId: number } | null = null;
      if (mode === 'db_driven' && prevRule?.governance_mode !== 'db_driven' && hasMigrationHandler(updated.document_type)) {
        try {
          migrationJob = await triggerFileMigration({
            ruleId:        id,
            documentType:  updated.document_type,
            pathTemplate:  updated.path_template,
            rootPrefix:    updated.root_prefix,
            triggerReason: 'auto_db_driven',
            triggeredBy:   (req as any).user?.id ?? undefined,
          });
          console.log(`[GovernanceRoutes] Auto-migration job ${migrationJob.jobId} queued for rule ${id} (${updated.document_type})`);
        } catch (migErr: any) {
          console.error(`[GovernanceRoutes] Auto-migration trigger failed for rule ${id}:`, migErr.message);
        }
      }

      res.json({ ...updated, migrationJob });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── File Migration Jobs — batch: latest job per rule (all rules) ──────────
  app.get('/api/gcs-governance/migration-jobs/all', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      // One query: latest job per rule_id using DISTINCT ON
      const rows = await db.execute(sql`
        SELECT DISTINCT ON (rule_id)
          id, rule_id, document_type, trigger_reason, triggered_by,
          status, total_files, processed_files, migrated_files,
          skipped_files, failed_files, missing_src_files,
          error_log, started_at, completed_at
        FROM gcs_file_migration_jobs
        ORDER BY rule_id, started_at DESC
      `).then((r: any) => r.rows);

      // Group by rule_id: Record<ruleId, job[]>
      const grouped: Record<string, any[]> = {};
      for (const row of rows) {
        const key = String(row.rule_id);
        grouped[key] = [row];
      }
      res.json(grouped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── File Migration Jobs — list jobs for a rule ────────────────────────────
  app.get('/api/gcs-governance/rules/:id/migration-jobs', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const ruleId = parseInt(req.params.id);
      const jobs = await db.select().from(gcsFileMigrationJobs)
        .where(eq(gcsFileMigrationJobs.ruleId, ruleId))
        .orderBy(desc(gcsFileMigrationJobs.startedAt))
        .limit(20);

      // ── Enrich error_log entries with current record active status ──────────
      // Maps document_type → source table name (subset that support is_active)
      const SOURCE_TABLE_MAP: Record<string, string> = {
        TRIP_DOCUMENT:  'trip_documents',
        VISA_DOCUMENT:  'visa_records',
      };

      const enriched = await Promise.all(jobs.map(async (job) => {
        const errorLog = job.errorLog as Array<{ fileId: number; oldPath: string; error: string; type?: string; isRecordActive?: boolean; deletedAt?: string | null }> | null;
        if (!errorLog || errorLog.length === 0) return job;

        const sourceTable = SOURCE_TABLE_MAP[job.documentType ?? ''];
        if (!sourceTable) return job;

        const missingSrcIds = errorLog
          .filter(e => e.type === 'missing_source')
          .map(e => e.fileId)
          .filter((id): id is number => typeof id === 'number');

        if (missingSrcIds.length === 0) return job;

        const rows = await db.execute(sql`
          SELECT id, is_active, deleted_at
          FROM ${sql.raw(sourceTable)}
          WHERE id IN (${sql.join(missingSrcIds.map(id => sql`${id}`), sql`, `)})
        `).then((r: any) => r.rows as Array<{ id: number; is_active: boolean; deleted_at: string | null }>);

        const activeMap = new Map(rows.map(r => [r.id, { isActive: r.is_active, deletedAt: r.deleted_at }]));

        const enrichedLog = errorLog.map(e => {
          if (e.type !== 'missing_source') return e;
          const rec = activeMap.get(e.fileId);
          return {
            ...e,
            isRecordActive: rec ? rec.isActive : null,
            deletedAt: rec ? rec.deletedAt : null,
          };
        });

        const activeMissingSrcFiles = enrichedLog.filter(
          e => e.type === 'missing_source' && e.isRecordActive !== false
        ).length;

        return { ...job, errorLog: enrichedLog, activeMissingSrcFiles };
      }));

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── File Migration — dry-run preview (read-only, no GCS/DB changes) ─────
  app.post('/api/gcs-governance/rules/:id/migrate-files/dry-run', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const ruleId = parseInt(req.params.id);
      const ruleRows = await db.execute(sql`
        SELECT document_type, path_template, root_prefix, governance_mode FROM gcs_governance_rules WHERE id = ${ruleId} AND active = true
      `).then((r: any) => r.rows);
      const rule = ruleRows[0] as any;
      if (!rule) return res.status(404).json({ error: 'Rule not found or inactive' });
      if (!hasMigrationHandler(rule.document_type)) {
        return res.status(422).json({ error: `No migration handler available for documentType=${rule.document_type}` });
      }
      const preview = await previewMigration({
        ruleId,
        documentType: rule.document_type,
        pathTemplate: rule.path_template,
        rootPrefix:   rule.root_prefix,
        triggeredBy:  (req as any).user?.id ?? undefined,
      });
      // 200 (synchronous) — preview is computed inline, no background job
      res.status(200).json(preview);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── File Migration — actual run (requires prior dry-run approval) ─────────
  // Body must include { approvedDryRunJobId: <number> } referencing a
  // dry_run job for this rule with status='preview'.  This prevents accidental
  // migration without first reviewing the dry-run output.
  app.post('/api/gcs-governance/rules/:id/migrate-files', ensureAuthenticated, async (req, res) => {
    if (!superuserOnly(req, res)) return;
    try {
      const ruleId = parseInt(req.params.id);
      const { approvedDryRunJobId } = req.body ?? {};

      // ── Approval gate ──────────────────────────────────────────────────────
      if (!approvedDryRunJobId || typeof approvedDryRunJobId !== 'number') {
        return res.status(400).json({
          error: 'approvedDryRunJobId is required. Run the dry-run preview first and pass its jobId here.',
        });
      }
      const dryRunRows = await db.execute(sql`
        SELECT id FROM gcs_file_migration_jobs
        WHERE id           = ${approvedDryRunJobId}
          AND rule_id      = ${ruleId}
          AND trigger_reason = 'dry_run'
          AND status       = 'preview'
      `).then((r: any) => r.rows);
      if (!dryRunRows.length) {
        return res.status(400).json({
          error: `No approved dry-run found (jobId=${approvedDryRunJobId}) for this rule. ` +
                 'Run the dry-run preview and pass its jobId to confirm.',
        });
      }

      // ── Proceed with actual migration ──────────────────────────────────────
      const ruleRows = await db.execute(sql`
        SELECT document_type, path_template, root_prefix, governance_mode FROM gcs_governance_rules WHERE id = ${ruleId} AND active = true
      `).then((r: any) => r.rows);
      const rule = ruleRows[0] as any;
      if (!rule) return res.status(404).json({ error: 'Rule not found or inactive' });
      if (!hasMigrationHandler(rule.document_type)) {
        return res.status(422).json({ error: `No migration handler available for documentType=${rule.document_type}` });
      }
      const job = await triggerFileMigration({
        ruleId,
        documentType:  rule.document_type,
        pathTemplate:  rule.path_template,
        rootPrefix:    rule.root_prefix,
        triggerReason: 'manual',
        triggeredBy:   (req as any).user?.id ?? undefined,
      });
      res.status(202).json(job);
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
        bp_code: string; bp_name: string;
      }>(
        `SELECT o.id, o.offer_number, o.customer_name, o.revision, o.subject, o.offer_type,
                o.customer_id, c.continent_code, c.country_code, c.short_code,
                c.bp_code, c.bp_name
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
      const custToken = offer.bp_code ? buildCustToken(offer.bp_code, offer.bp_name || '') : (sc ?? null);
      const missingGeo = !cc || !co || !sc;

      // Real subject slug (mirrors slugifySubject in quotation-pdf-artifact.ts)
      const subjectSlug = (offer.subject || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 40)
        .replace(/-+$/g, '') || 'offer';

      // Fetch QUOTATION governance rule from DB — source of truth for quotation path structure
      const qtnDocType = offer.offer_type === 'project-linked' ? 'EPC_QUOTATION' : 'QUOTATION';
      const qtnRuleRow = await pool.query(
        `SELECT path_template FROM gcs_governance_rules
         WHERE document_type = $1 AND (active IS NULL OR active = true)
         ORDER BY id ASC LIMIT 1`,
        [qtnDocType]
      );
      const qtnPathTemplate: string | null = qtnRuleRow.rows[0]?.path_template ?? null;

      // Resolve geo + offer tokens to get the expected folder prefix for this offer
      let qtnGeoResolvedTemplate: string | null = null;
      let qtnFolderPrefix: string | null = null;
      if (qtnPathTemplate && !missingGeo) {
        qtnGeoResolvedTemplate = qtnPathTemplate
          .replace('{CC}',      cc!)
          .replace('{CO}',      co!)
          .replace('{Cust}',    custToken!)
          .replace('{FY}',      fy)
          .replace('{OfferNo}', offer.offer_number);
        const lastSlash = qtnGeoResolvedTemplate.lastIndexOf('/');
        qtnFolderPrefix = lastSlash >= 0 ? qtnGeoResolvedTemplate.substring(0, lastSlash + 1) : null;
      }

      // Fetch all existing PDF artifacts for this offer
      const artifacts = await pool.query(
        `SELECT id, revision, price_mode, gcs_object_path, artifact_status, attachment_seq, generated_at
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
        qtnDocType,
        qtnPathTemplate,
        qtnGeoResolvedTemplate,
        qtnFolderPrefix,
        existingFiles: artifacts.rows.map((a: any) => ({
          id:            a.id,
          revision:      a.revision,
          priceMode:     a.price_mode,
          gcsObjectPath: a.gcs_object_path,
          attachmentSeq: a.attachment_seq,
          status:        a.artifact_status,
          generatedAt:   a.generated_at,
          pathMismatch:  qtnFolderPrefix ? !String(a.gcs_object_path ?? '').startsWith(qtnFolderPrefix) : false,
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

      // Fetch CO_DOCUMENT governance rule from DB — single source of truth for path structure
      const ruleRow = await pool.query(
        `SELECT path_template, display_name, revision_mode
         FROM gcs_governance_rules
         WHERE document_type = 'CO_DOCUMENT' AND (active IS NULL OR active = true)
         ORDER BY id ASC LIMIT 1`
      );
      const dbRule = ruleRow.rows[0] ?? null;
      if (!dbRule) {
        return res.status(500).json({ error: 'CO_DOCUMENT governance rule not found in DB — re-run the seed.' });
      }
      const pathTemplate: string = dbRule.path_template;

      // Resolve geo tokens — leave per-document tokens ({Seq},{Label},{rev}) as-is
      let geoResolvedTemplate: string | null = null;
      let folderPrefix: string | null = null;
      if (!missingGeo && geo) {
        geoResolvedTemplate = pathTemplate
          .replace('{CC}',   geo.continentCode)
          .replace('{CO}',   geo.countryCode)
          .replace('{Cust}', geo.customerCustToken)
          .replace('{FY}',   geo.fyCode)
          .replace('{Code}', geo.projectCode)
          .replace('{NNN}',  geo.projectSeq); // legacy fallback
        // Folder prefix = everything up to (and including) the last '/' before filename tokens
        const lastSlash = geoResolvedTemplate.lastIndexOf('/');
        folderPrefix = lastSlash >= 0 ? geoResolvedTemplate.substring(0, lastSlash + 1) : null;
      }

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
        pathTemplate,
        geoResolvedTemplate,
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
      if (!dbRule) {
        return res.status(500).json({ error: 'CO_DOCUMENT governance rule not found in DB — re-run the seed.' });
      }
      const pathTemplate: string = dbRule.path_template;

      // Resolve geo codes
      let geo: any;
      let missingGeo = false;
      try {
        geo = await resolveProjectGeoCodes(projectId);
      } catch {
        missingGeo = true;
      }

      // Build the "geo-resolved template": fill in all static project-level tokens,
      // leave per-document tokens ({Seq},{Label},{rev}) as-is.
      // Template driven from DB: CO_DOCUMENT governance rule (e.g. 1_Sales/3_Order_Contract)
      // {CC}=continent, {CO}=country, {Cust}=short code, {FY}=financial year,
      // {Code}=EPC project code (e.g. 2627-018) — folder becomes SOR_2627-018
      let geoResolvedTemplate: string | null = null;
      if (!missingGeo && geo) {
        geoResolvedTemplate = pathTemplate
          .replace('{CC}',   geo.continentCode)
          .replace('{CO}',   geo.countryCode)
          .replace('{Cust}', geo.customerCustToken)
          .replace('{FY}',   geo.fyCode)
          .replace('{Code}', geo.projectCode)
          .replace('{NNN}',  geo.projectSeq); // legacy fallback
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

        // Derive folder prefix from the DB-driven geoResolvedTemplate
        // (everything up to and including the last '/' before per-document tokens)
        const folderPrefix = geoResolvedTemplate
          ? (() => {
              const lastSlash = geoResolvedTemplate.lastIndexOf('/');
              return lastSlash >= 0 ? geoResolvedTemplate.substring(0, lastSlash + 1) : null;
            })()
          : null;

        // geoResolvedTemplate already has all project-level tokens filled in;
        // no per-order substitution needed in the new template (order number is not in path)
        const resolvedForOrder = geoResolvedTemplate ?? null;

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
