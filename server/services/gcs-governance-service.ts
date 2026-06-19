/**
 * GCS Governance Service — Phase 0 + Phase 1
 * Monitor-only mode: logs uploads, validates paths against rules, never blocks.
 * Phase 1: upload token issuance and validation.
 */

import { db } from '../db';
import {
  gcsGovernanceRules,
  gcsUploadMonitorLog,
  gcsUploadTokens,
  gcsGovernanceRuleVersions,
  type GcsGovernanceRule,
  type GcsUploadToken,
  type InsertGcsUploadMonitorLog,
} from '@shared/schema';
import { eq, desc, and, or, ilike, sql, lt, isNotNull, gte } from 'drizzle-orm';
import { randomBytes, createHash } from 'crypto';

// ─── Token substitution ───────────────────────────────────────────────────

export function resolvePathTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => tokens[key] ?? `{${key}}`);
}

export function extractTemplateTokens(template: string): string[] {
  const matches = template.match(/\{(\w+)\}/g) ?? [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}

export function validatePathAgainstTemplate(
  path: string,
  template: string,
  rootPrefix: string,
): { conforms: boolean; reason?: string } {
  if (!path.startsWith(rootPrefix.replace(/\{[^}]+\}/g, ''))) {
    const staticRoot = rootPrefix.split('{')[0].replace(/\/$/, '');
    if (staticRoot && !path.startsWith(staticRoot)) {
      return { conforms: false, reason: `Path does not start with expected root prefix '${staticRoot}'` };
    }
  }

  // Build a regex from the template by converting {TOKEN} → capture groups
  const regexStr = '^' + template
    .replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '{' || c === '}') ? c : `\\${c}`)
    .replace(/\\\{[^}]+\\\}/g, '[^/]+') // token → one path segment
    .replace(/\{[^}]+\}/g, '[^/]+')
    + '(/.*)?$';

  try {
    const regex = new RegExp(regexStr);
    if (!regex.test(path)) {
      return { conforms: false, reason: 'Path structure does not match rule template' };
    }
  } catch {
    return { conforms: false, reason: 'Template regex compilation failed' };
  }

  return { conforms: true };
}

// ─── Rule matching ────────────────────────────────────────────────────────

export async function matchRuleForPath(path: string): Promise<GcsGovernanceRule | null> {
  const rules = await db.select().from(gcsGovernanceRules).where(eq(gcsGovernanceRules.active, true));

  // Try to find a rule whose static root prefix matches the path
  for (const rule of rules) {
    const staticRoot = rule.rootPrefix.split('{')[0].replace(/\/$/, '');
    if (staticRoot && path.startsWith(staticRoot)) {
      return rule;
    }
  }
  return null;
}

// ─── Monitor logging ──────────────────────────────────────────────────────

export async function logUploadEvent(params: {
  gcsPath: string;
  moduleKey?: string;
  documentType?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  uploadedBy?: number;
  routeFile?: string;
}): Promise<void> {
  try {
    const rule = await matchRuleForPath(params.gcsPath);
    let pathConforms: boolean | undefined = undefined;
    let violationReason: string | undefined = undefined;

    if (rule) {
      const result = validatePathAgainstTemplate(params.gcsPath, rule.pathTemplate, rule.rootPrefix);
      pathConforms = result.conforms;
      violationReason = result.reason;
    }

    const entry: InsertGcsUploadMonitorLog = {
      matchedRuleId: rule?.id ?? null,
      moduleKey: params.moduleKey ?? rule?.moduleKey ?? null,
      documentType: params.documentType ?? rule?.documentType ?? null,
      detectedGcsPath: params.gcsPath,
      pathConforms: pathConforms ?? null,
      violationReason: violationReason ?? null,
      fileSizeBytes: params.fileSizeBytes ?? null,
      mimeType: params.mimeType ?? null,
      uploadedBy: params.uploadedBy ?? null,
      routeFile: params.routeFile ?? null,
    };

    await db.insert(gcsUploadMonitorLog).values(entry);
  } catch (err) {
    // Monitor log failures must never affect the actual upload
    console.warn('[GCS-Governance] Monitor log write failed:', err);
  }
}

// ─── Path preview ─────────────────────────────────────────────────────────

export function previewPath(template: string, tokens: Record<string, string>): {
  resolved: string;
  unresolvedTokens: string[];
} {
  const unresolvedTokens: string[] = [];
  const resolved = template.replace(/\{(\w+)\}/g, (_, key) => {
    if (tokens[key] !== undefined && tokens[key] !== '') return tokens[key];
    unresolvedTokens.push(key);
    return `{${key}}`;
  });
  return { resolved, unresolvedTokens };
}

// ─── Monitor stats ────────────────────────────────────────────────────────

export async function getMonitorStats(): Promise<{
  total: number;
  conforming: number;
  violations: number;
  unmatched: number;
}> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                        AS total,
      COUNT(*) FILTER (WHERE path_conforms = true)::int                   AS conforming,
      COUNT(*) FILTER (WHERE path_conforms = false)::int                  AS violations,
      COUNT(*) FILTER (WHERE matched_rule_id IS NULL)::int                AS unmatched
    FROM gcs_upload_monitor_log
  `);
  const [row] = result.rows as any[];
  return {
    total:      Number((row as any).total ?? 0),
    conforming: Number((row as any).conforming ?? 0),
    violations: Number((row as any).violations ?? 0),
    unmatched:  Number((row as any).unmatched ?? 0),
  };
}

// ─── Startup Governance Parity Check ─────────────────────────────────────

/**
 * Runs at startup. Reads governance state from DB and reports any parity
 * violations. Never creates, updates, or repairs governance data.
 * Non-fatal — server continues, but violations are clearly visible in logs.
 */
export async function runGovernanceParityCheck(): Promise<void> {
  console.log('[GCS-Governance] Running startup parity check...');
  try {
    const rows = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM gcs_governance_rules)                             AS rules_total,
        (SELECT COUNT(*)::int FROM document_path_templates)                          AS templates_total,
        (SELECT COUNT(*)::int FROM document_path_templates WHERE gcs_rule_id IS NULL) AS unlinked,
        (SELECT COUNT(*)::int FROM gcs_governance_rules r
         WHERE NOT EXISTS (
           SELECT 1 FROM document_path_templates t WHERE t.gcs_rule_id = r.id
         ))                                                                           AS orphan_rules,
        (SELECT COUNT(*)::int FROM (
          SELECT module_key, submodule_key, document_type
          FROM gcs_governance_rules
          GROUP BY module_key, submodule_key, document_type
          HAVING COUNT(*) > 1
        ) dups)                                                                       AS duplicate_doc_types
    `);

    const r = rows.rows[0] as {
      rules_total: number; templates_total: number; unlinked: number;
      orphan_rules: number; duplicate_doc_types: number;
    };

    const pass =
      r.rules_total === r.templates_total &&
      r.unlinked === 0 &&
      r.orphan_rules === 0 &&
      r.duplicate_doc_types === 0;

    if (pass) {
      console.log(
        `[GCS-Governance] PARITY OK — rules=${r.rules_total}, templates=${r.templates_total}, unlinked=0, orphan_rules=0, duplicates=0`
      );
    } else {
      console.error('[GCS-Governance] PARITY FAILED:');
      if (r.rules_total !== r.templates_total)
        console.error(`  rules=${r.rules_total} != templates=${r.templates_total}`);
      if (r.unlinked > 0)
        console.error(`  unlinked templates=${r.unlinked} (gcs_rule_id IS NULL)`);
      if (r.orphan_rules > 0)
        console.error(`  orphan_rules=${r.orphan_rules} (rules with no linked template)`);
      if (r.duplicate_doc_types > 0)
        console.error(`  duplicate_doc_types=${r.duplicate_doc_types}`);
    }
  } catch (err) {
    console.warn('[GCS-Governance] Parity check failed to run:', err);
  }
}

// ─── Phase 1: Upload Token Issuance ──────────────────────────────────────

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function issueUploadToken(params: {
  ruleId: number;
  tokenValues: Record<string, string>;
  issuedTo: number;
  ttlSeconds?: number;
  notes?: string;
}): Promise<{
  rawToken: string;
  resolvedPath: string;
  expiresAt: Date;
  tokenId: number;
  unresolvedTokens: string[];
  versionId: number;
  versionNumber: number;
}> {
  const { ruleId, tokenValues, issuedTo, ttlSeconds = 300, notes } = params;

  // Load the governance rule (identity: moduleKey, documentType, active check)
  const [rule] = await db.select().from(gcsGovernanceRules).where(eq(gcsGovernanceRules.id, ruleId)).limit(1);
  if (!rule) throw new Error(`Governance rule ${ruleId} not found`);
  if (!rule.active) throw new Error(`Governance rule ${ruleId} is inactive`);

  // Load the active VERSION — sole source of pathTemplate and rootPrefix (Phase 0+)
  const [version] = await db
    .select()
    .from(gcsGovernanceRuleVersions)
    .where(and(
      eq(gcsGovernanceRuleVersions.ruleId, ruleId),
      eq(gcsGovernanceRuleVersions.status, 'active'),
    ))
    .limit(1);

  if (!version) {
    throw new Error(
      `[GCS Governance] No active version found for rule ${ruleId} ` +
      `(${rule.moduleKey}/${rule.documentType}). Upload rejected — ` +
      `run seed-v1 or create and activate a version first.`,
    );
  }

  // Resolve the path template from the active version
  const { resolved, unresolvedTokens } = previewPath(version.pathTemplate, tokenValues);

  if (unresolvedTokens.length > 0) {
    throw new Error(`Unresolved tokens: ${unresolvedTokens.map(t => `{${t}}`).join(', ')}. Provide values for all tokens.`);
  }

  // Generate the raw token (32 bytes = 64 hex chars)
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

  const [inserted] = await db.insert(gcsUploadTokens).values({
    ruleId,
    tokenHash,
    resolvedPath: resolved,
    rootPrefix: version.rootPrefix,
    moduleKey: rule.moduleKey,
    documentType: rule.documentType,
    tokenValues: tokenValues as any,
    maxFileSizeBytes: rule.maxFileSizeMb ? rule.maxFileSizeMb * 1024 * 1024 : null,
    allowedMimeTypes: rule.allowedMimeTypes ?? null,
    issuedTo,
    expiresAt,
    notes: notes ?? null,
    versionId: version.id,
  }).returning();

  return {
    rawToken,
    resolvedPath: resolved,
    expiresAt,
    tokenId: inserted.id,
    unresolvedTokens,
    versionId: version.id,
    versionNumber: version.versionNumber,
  };
}

// ─── Phase 1: Upload Token Validation ────────────────────────────────────

export async function validateUploadToken(params: {
  rawToken: string;
  actualPath: string;
}): Promise<{
  valid: boolean;
  tokenId?: number;
  resolvedPath?: string;
  reason?: 'not_found' | 'expired' | 'already_used' | 'path_mismatch';
}> {
  const { rawToken, actualPath } = params;
  const tokenHash = hashToken(rawToken);

  const [token] = await db.select().from(gcsUploadTokens)
    .where(eq(gcsUploadTokens.tokenHash, tokenHash))
    .limit(1);

  if (!token) return { valid: false, reason: 'not_found' };
  if (new Date() > token.expiresAt) return { valid: false, tokenId: token.id, reason: 'expired' };
  if (token.usedAt !== null) return { valid: false, tokenId: token.id, reason: 'already_used' };
  if (token.resolvedPath !== actualPath) {
    return { valid: false, tokenId: token.id, reason: 'path_mismatch', resolvedPath: token.resolvedPath };
  }

  // Mark as used
  await db.update(gcsUploadTokens)
    .set({ usedAt: new Date(), usedForPath: actualPath })
    .where(eq(gcsUploadTokens.id, token.id));

  return { valid: true, tokenId: token.id, resolvedPath: token.resolvedPath };
}

// ─── Phase 1: Issued Token Queries ───────────────────────────────────────

export async function getIssuedTokenStats(): Promise<{
  total: number;
  live: number;
  used: number;
  expired: number;
}> {
  const now = new Date();
  const tokenResult = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                                       AS total,
      COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at > NOW())::int               AS live,
      COUNT(*) FILTER (WHERE used_at IS NOT NULL)::int                                  AS used,
      COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at <= NOW())::int              AS expired
    FROM gcs_upload_tokens
  `);
  const [row] = tokenResult.rows as any[];
  return {
    total:   Number((row as any).total   ?? 0),
    live:    Number((row as any).live    ?? 0),
    used:    Number((row as any).used    ?? 0),
    expired: Number((row as any).expired ?? 0),
  };
}

export async function getIssuedTokens(filters: {
  moduleKey?: string;
  status?: 'live' | 'used' | 'expired' | 'all';
  limit?: number;
  offset?: number;
}): Promise<GcsUploadToken[]> {
  const { moduleKey, status = 'all', limit = 100, offset = 0 } = filters;

  const conditions: any[] = [];
  if (moduleKey) conditions.push(eq(gcsUploadTokens.moduleKey, moduleKey));
  if (status === 'used')    conditions.push(isNotNull(gcsUploadTokens.usedAt));
  if (status === 'live')    conditions.push(
    sql`${gcsUploadTokens.usedAt} IS NULL AND ${gcsUploadTokens.expiresAt} > NOW()`
  );
  if (status === 'expired') conditions.push(
    sql`${gcsUploadTokens.usedAt} IS NULL AND ${gcsUploadTokens.expiresAt} <= NOW()`
  );

  return conditions.length > 0
    ? db.select().from(gcsUploadTokens)
        .where(and(...conditions))
        .orderBy(desc(gcsUploadTokens.issuedAt))
        .limit(limit)
        .offset(offset)
    : db.select().from(gcsUploadTokens)
        .orderBy(desc(gcsUploadTokens.issuedAt))
        .limit(limit)
        .offset(offset);
}
