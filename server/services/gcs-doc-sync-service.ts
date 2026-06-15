/**
 * GCS-to-Doc Governance Sync Service — v1.0
 * Policy: docs/gcs-doc-governance-sync-v1.0.md
 *
 * GCS Doc Governance is the single source of truth for path definitions.
 * This service auto-creates / updates / deactivates / activates the matching
 * document_path_templates row whenever a GCS governance rule is mutated.
 *
 * Rules:
 *  - Sync failure is NON-BLOCKING for the GCS operation.
 *  - All sync failures are logged with prefix [GCS-DocSync].
 *  - No existing document_path_templates rows are ever deleted.
 */

import { db } from '../db';
import { documentPathTemplates, gcsGovernanceRules } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { GcsGovernanceRule } from '@shared/schema';

export interface DocSyncResult {
  action: 'created' | 'updated' | 'linked' | 'deactivated' | 'activated' | 'not_found' | 'skipped';
  templateId?: number;
  templateCode?: string;
  error?: string;
}

export interface BackfillResult {
  processed: number;
  created: number;
  linked: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// ─── Derivation helpers ──────────────────────────────────────────────────────

/** templateCode = {moduleKey}_{documentType}  or  {moduleKey}_{submoduleKey}_{documentType} */
function deriveTemplateCode(rule: GcsGovernanceRule): string {
  const parts = rule.submoduleKey
    ? [rule.moduleKey, rule.submoduleKey, rule.documentType]
    : [rule.moduleKey, rule.documentType];
  return parts.join('_').toLowerCase();
}

/**
 * Business Rule (final):
 *   IF module_key = 'company':
 *     relative_path_template = '{COMPANY}/' + path_template without leading 'TPEL/'
 *   ELSE:
 *     relative_path_template = path_template exactly as-is
 *
 * root_prefix is NOT consulted — it is irrelevant to this formula.
 */
function deriveRelativePath(rule: GcsGovernanceRule): string {
  const pathTemplate = rule.pathTemplate ?? '';
  if (rule.moduleKey === 'company') {
    if (pathTemplate.startsWith('TPEL/')) {
      return '{COMPANY}/' + pathTemplate.substring('TPEL/'.length);
    }
    return '{COMPANY}/' + pathTemplate;
  }
  return pathTemplate;
}

// ─── sync on CREATE ──────────────────────────────────────────────────────────

/**
 * Called after a new GCS rule is inserted.
 * Creates a new doc_path_template, or links to an existing unlinked one.
 */
export async function syncOnCreate(rule: GcsGovernanceRule): Promise<DocSyncResult> {
  try {
    const templateCode = deriveTemplateCode(rule);
    const relativePathTemplate = deriveRelativePath(rule);

    // Check if a row with this templateCode already exists
    const [existing] = await db
      .select()
      .from(documentPathTemplates)
      .where(eq(documentPathTemplates.templateCode, templateCode))
      .limit(1);

    if (existing) {
      if (!existing.gcsRuleId) {
        // Unlinked: link it and sync fields
        const [linked] = await db
          .update(documentPathTemplates)
          .set({
            gcsRuleId: rule.id,
            relativePathTemplate,
            revisionMode: rule.revisionMode,
            documentCategory: rule.moduleKey,
            active: rule.active,
            updatedAt: new Date(),
          })
          .where(eq(documentPathTemplates.id, existing.id))
          .returning();
        console.log(`[GCS-DocSync] Linked existing doc template #${linked.id} (${templateCode}) → GCS rule #${rule.id}`);
        return { action: 'linked', templateId: linked.id, templateCode };
      } else if (existing.gcsRuleId !== rule.id) {
        // Already owned by a different GCS rule — conflict
        const error = `templateCode '${templateCode}' already belongs to gcs_rule_id=${existing.gcsRuleId}`;
        console.warn(`[GCS-DocSync] Conflict: ${error}`);
        return { action: 'skipped', templateCode, error };
      } else {
        // Already linked to this rule (idempotent)
        return { action: 'linked', templateId: existing.id, templateCode };
      }
    }

    // No existing row — create new
    const [created] = await db
      .insert(documentPathTemplates)
      .values({
        templateCode,
        documentType:         rule.documentType,
        documentCategory:     rule.moduleKey,
        relativePathTemplate,
        fileNameTemplate:     null,
        revisionMode:         rule.revisionMode,
        fileExtension:        null,
        active:               rule.active,
        gcsRuleId:            rule.id,
      })
      .returning();

    console.log(`[GCS-DocSync] Created doc template #${created.id} (${templateCode}) linked to GCS rule #${rule.id}`);
    return { action: 'created', templateId: created.id, templateCode };
  } catch (e: any) {
    console.error(`[GCS-DocSync] Error on create for GCS rule #${rule.id}:`, e.message);
    return { action: 'skipped', error: e.message };
  }
}

// ─── sync on UPDATE (PATCH) ──────────────────────────────────────────────────

/**
 * Called after a GCS rule is patched.
 * Finds the linked doc_path_template and updates relativePathTemplate, revisionMode, active.
 * If no linked template is found, falls through to syncOnCreate logic.
 */
export async function syncOnUpdate(rule: GcsGovernanceRule): Promise<DocSyncResult> {
  try {
    const [linked] = await db
      .select()
      .from(documentPathTemplates)
      .where(eq(documentPathTemplates.gcsRuleId, rule.id))
      .limit(1);

    if (!linked) {
      console.warn(`[GCS-DocSync] No linked doc template found for GCS rule #${rule.id} on update — attempting create`);
      return syncOnCreate(rule);
    }

    const relativePathTemplate = deriveRelativePath(rule);
    const [updated] = await db
      .update(documentPathTemplates)
      .set({
        relativePathTemplate,
        revisionMode: rule.revisionMode,
        active:       rule.active,
        updatedAt:    new Date(),
      })
      .where(eq(documentPathTemplates.id, linked.id))
      .returning();

    console.log(`[GCS-DocSync] Updated doc template #${updated.id} (${updated.templateCode}) from GCS rule #${rule.id}`);
    return { action: 'updated', templateId: updated.id, templateCode: updated.templateCode };
  } catch (e: any) {
    console.error(`[GCS-DocSync] Error on update for GCS rule #${rule.id}:`, e.message);
    return { action: 'skipped', error: e.message };
  }
}

// ─── sync on DEACTIVATE ──────────────────────────────────────────────────────

export async function syncOnDeactivate(rule: GcsGovernanceRule): Promise<DocSyncResult> {
  try {
    const result = await db
      .update(documentPathTemplates)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(documentPathTemplates.gcsRuleId, rule.id))
      .returning();

    if (result.length === 0) {
      console.warn(`[GCS-DocSync] No linked doc template found for GCS rule #${rule.id} on deactivate`);
      return { action: 'not_found', error: `No linked doc template for GCS rule #${rule.id}` };
    }
    console.log(`[GCS-DocSync] Deactivated doc template #${result[0].id} from GCS rule #${rule.id}`);
    return { action: 'deactivated', templateId: result[0].id, templateCode: result[0].templateCode };
  } catch (e: any) {
    console.error(`[GCS-DocSync] Error on deactivate for GCS rule #${rule.id}:`, e.message);
    return { action: 'skipped', error: e.message };
  }
}

// ─── sync on ACTIVATE ────────────────────────────────────────────────────────

export async function syncOnActivate(rule: GcsGovernanceRule): Promise<DocSyncResult> {
  try {
    const result = await db
      .update(documentPathTemplates)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(documentPathTemplates.gcsRuleId, rule.id))
      .returning();

    if (result.length === 0) {
      console.warn(`[GCS-DocSync] No linked doc template found for GCS rule #${rule.id} on activate`);
      return { action: 'not_found', error: `No linked doc template for GCS rule #${rule.id}` };
    }
    console.log(`[GCS-DocSync] Activated doc template #${result[0].id} from GCS rule #${rule.id}`);
    return { action: 'activated', templateId: result[0].id, templateCode: result[0].templateCode };
  } catch (e: any) {
    console.error(`[GCS-DocSync] Error on activate for GCS rule #${rule.id}:`, e.message);
    return { action: 'skipped', error: e.message };
  }
}

// ─── backfill all existing GCS rules ─────────────────────────────────────────

/**
 * Admin backfill: iterates every GCS governance rule and ensures a linked
 * doc_path_template exists. Safe to run multiple times — idempotent.
 * No existing rows are deleted.
 */
export async function backfillAllGcsRules(): Promise<BackfillResult> {
  const rules = await db
    .select()
    .from(gcsGovernanceRules)
    .orderBy(gcsGovernanceRules.id);

  const result: BackfillResult = { processed: rules.length, created: 0, linked: 0, updated: 0, skipped: 0, errors: [] };

  for (const rule of rules) {
    // Check if already linked
    const [already] = await db
      .select({ id: documentPathTemplates.id })
      .from(documentPathTemplates)
      .where(eq(documentPathTemplates.gcsRuleId, rule.id))
      .limit(1);

    if (already) {
      // Linked: sync it (update path/revisionMode/active)
      const sr = await syncOnUpdate(rule);
      if (sr.error) { result.errors.push(`Rule #${rule.id}: ${sr.error}`); }
      else { result.updated++; }
    } else {
      // Not yet linked: create or link by templateCode
      const sr = await syncOnCreate(rule);
      if (sr.action === 'created') result.created++;
      else if (sr.action === 'linked') result.linked++;
      else if (sr.error) { result.skipped++; result.errors.push(`Rule #${rule.id}: ${sr.error}`); }
      else result.skipped++;
    }
  }

  console.log(`[GCS-DocSync] Backfill complete: ${JSON.stringify(result)}`);
  return result;
}
