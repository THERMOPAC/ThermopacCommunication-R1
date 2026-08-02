/**
 * gcs-path-resolver.ts
 *
 * Single GCS path resolver for all governed upload/save routes.
 *
 * Architecture Decision (2026-06-12):
 *   GCS Governance is the single source of truth for GCS object path generation.
 *   No route may hardcode a path where a matching governance rule exists.
 *   Every governed upload calls resolveGcsPath(), which reads path_template
 *   from gcs_governance_rules at write time. If the rule is missing or inactive,
 *   the upload is rejected with a clear error — no silent fallbacks permitted.
 *
 * Usage:
 *   import { resolveGcsPath, GcsGovernanceError } from '../utils/gcs-path-resolver';
 *
 *   const gcsPath = await resolveGcsPath('COMPANY_GST_CERTIFICATE', {
 *     CompanyCode: 'TPEL', RevNo: '03', Seq: '001', Ext: 'pdf',
 *   });
 *
 * For routes that need ruleId + MIME/size validation, use resolveGcsPathWithMeta().
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { resolvePathTemplate } from '../services/gcs-governance-service';

export class GcsGovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GcsGovernanceError';
  }
}

/**
 * Resolves a canonical GCS object path for a governed document type.
 *
 * 1. Fetches the active path_template from gcs_governance_rules.
 * 2. Substitutes all {Token} placeholders with the provided token values.
 * 3. Validates that no {Token} placeholders remain after substitution.
 *
 * @throws GcsGovernanceError — if no active rule exists, or unresolved tokens remain.
 */
export async function resolveGcsPath(
  documentType: string,
  tokens: Record<string, string>,
): Promise<string> {
  const result = await db.execute(sql`
    SELECT path_template
    FROM gcs_governance_rules
    WHERE document_type = ${documentType}
      AND (active IS NULL OR active = true)
    LIMIT 1
  `);

  const template: string | null = (result.rows[0] as any)?.path_template ?? null;

  if (!template) {
    throw new GcsGovernanceError(
      `[GCS-PathResolver] No active governance rule for document_type='${documentType}'. ` +
      `Register and activate the rule in GCS Doc Governance before uploading.`,
    );
  }

  const resolved = resolvePathTemplate(template, tokens);

  const unresolved = resolved.match(/\{[A-Za-z]\w*\}/g);
  if (unresolved) {
    throw new GcsGovernanceError(
      `[GCS-PathResolver] Unresolved tokens in path for '${documentType}': ${unresolved.join(', ')}. ` +
      `Tokens provided: [${Object.keys(tokens).join(', ')}]. ` +
      `Update the path_template in GCS Doc Governance or add the missing token.`,
    );
  }

  return resolved;
}

// ─── resolveGcsPathWithMeta ──────────────────────────────────────────────────

/**
 * Richer resolver for routes that need the governance rule ID and optional
 * MIME-type / file-size validation performed inside the governance layer.
 *
 * Introduced for Offer Communication document routes (COMM_DOCUMENT,
 * COMM_SOR_COPY). resolveGcsPath() is unchanged.
 *
 * @throws GcsGovernanceError — no active rule, MIME mismatch, size exceeded,
 *                              or unresolved tokens.
 */
export interface GcsResolvedPathMeta {
  /** Fully resolved GCS object key ready for upload. */
  path:             string;
  /** gcs_governance_rules.id — store on the document revision record. */
  ruleId:           number;
  /** From gcs_governance_rules.allowed_mime_types; null = no restriction. */
  allowedMimeTypes: string[] | null;
  /** From gcs_governance_rules.max_file_size_mb; null = no restriction. */
  maxFileSizeMb:    number | null;
}

export async function resolveGcsPathWithMeta(
  documentType: string,
  tokens:        Record<string, string>,
  validate?:     { mimeType?: string; fileSizeBytes?: number },
): Promise<GcsResolvedPathMeta> {
  const result = await db.execute(sql`
    SELECT id, path_template, allowed_mime_types, max_file_size_mb
    FROM gcs_governance_rules
    WHERE document_type = ${documentType}
      AND (active IS NULL OR active = true)
    LIMIT 1
  `);

  const row = result.rows[0] as any;

  if (!row?.path_template) {
    throw new GcsGovernanceError(
      `[GCS-PathResolver] No active governance rule for document_type='${documentType}'. ` +
      `Register and activate the rule in GCS Doc Governance before uploading.`,
    );
  }

  const template: string        = row.path_template;
  const ruleId: number          = row.id;
  const allowedMimeTypes        = (row.allowed_mime_types as string[] | null) ?? null;
  const maxFileSizeMb           = row.max_file_size_mb != null ? Number(row.max_file_size_mb) : null;

  // MIME type validation (only when the rule declares allowed types)
  if (validate?.mimeType && allowedMimeTypes && allowedMimeTypes.length > 0) {
    if (!allowedMimeTypes.includes(validate.mimeType)) {
      throw new GcsGovernanceError(
        `[GCS-PathResolver] MIME type '${validate.mimeType}' is not permitted for ` +
        `document_type='${documentType}'. Allowed: [${allowedMimeTypes.join(', ')}].`,
      );
    }
  }

  // File size validation (only when the rule declares a limit)
  if (validate?.fileSizeBytes != null && maxFileSizeMb != null) {
    const limitBytes = maxFileSizeMb * 1024 * 1024;
    if (validate.fileSizeBytes > limitBytes) {
      throw new GcsGovernanceError(
        `[GCS-PathResolver] File size ${validate.fileSizeBytes} bytes exceeds the ` +
        `${maxFileSizeMb} MB governance limit for document_type='${documentType}'.`,
      );
    }
  }

  const resolved = resolvePathTemplate(template, tokens);

  const unresolved = resolved.match(/\{[A-Za-z]\w*\}/g);
  if (unresolved) {
    throw new GcsGovernanceError(
      `[GCS-PathResolver] Unresolved tokens in path for '${documentType}': ${unresolved.join(', ')}. ` +
      `Tokens provided: [${Object.keys(tokens).join(', ')}]. ` +
      `Update the path_template in GCS Doc Governance or add the missing token.`,
    );
  }

  return { path: resolved, ruleId, allowedMimeTypes, maxFileSizeMb };
}
