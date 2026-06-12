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
