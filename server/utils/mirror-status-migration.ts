/**
 * mirror-status-migration.ts
 *
 * Idempotent startup migration: adds mirror_status / mirror_job_id columns to every
 * source table participating in the Dual Document Saving Policy (Phase 3 — G3 compliance).
 *
 * Rules (Dual-Storage Policy):
 *   - Uses ADD COLUMN IF NOT EXISTS — safe to run on every server boot.
 *   - mirror_status VARCHAR(20) NOT NULL DEFAULT 'pending'
 *   - mirror_job_id INTEGER nullable FK to document_agent_jobs(id) ON DELETE SET NULL
 *   - Migration failure is logged but does NOT abort the server.
 *
 * Tables covered:
 *   P1 modules (G1 remediated in this session):
 *     buy_list_line_selections, epc_slddrw_extraction_jobs, qms_document_revisions,
 *     trip_documents, wps_documents, inspection_documents, contracts,
 *     epc_document_attachments, design_data_sheets, design_basic_drawings,
 *     drawing_transmittals, design_standards, design_project_backups,
 *     quotation_pdf_artifacts, bank_realization_certificates
 *
 *   P2 modules (G1 already compliant, adding G2+G3):
 *     vendor_compliance_docs, customer_order_documents, welder_photos, dvs_staging_documents
 *
 *   Legal management modules (G2+G3 added, G3 best-effort):
 *     compliance_register, posh_cases, legal_notices, policy_templates,
 *     nda_agreements, exclusivity_agreements
 *
 *   Welder photo module (welders table — photoPath column used as GCS path):
 *     welders
 */

import { pool } from '../db';

const TABLES: string[] = [
  // P1 modules
  'buy_list_line_selections',
  'epc_slddrw_extraction_jobs',
  'qms_document_revisions',
  'trip_documents',
  'wps_documents',
  'inspection_documents',
  'contracts',
  'epc_document_attachments',
  'design_data_sheets',
  'design_basic_drawings',
  'drawing_transmittals',
  'design_standards',
  'design_project_backups',
  'quotation_pdf_artifacts',
  'bank_realization_certificates',
  // P2 modules (G1 already compliant)
  'vendor_compliance_docs',
  'customer_order_documents',
  'welder_photos',
  'dvs_staging_documents',
  // Legal management modules
  'compliance_register',
  'posh_cases',
  'legal_notices',
  'policy_templates',
  'nda_agreements',
  'exclusivity_agreements',
  // Welder photo (photoPath column used as GCS path)
  'welders',
];

export async function initMirrorStatusColumns(): Promise<void> {
  const client = await pool.connect();
  try {
    let succeeded = 0;
    for (const table of TABLES) {
      try {
        await client.query(`
          ALTER TABLE ${table}
            ADD COLUMN IF NOT EXISTS mirror_status  VARCHAR(20) NOT NULL DEFAULT 'pending',
            ADD COLUMN IF NOT EXISTS mirror_job_id  INTEGER REFERENCES document_agent_jobs(id) ON DELETE SET NULL
        `);
        succeeded++;
      } catch (tableErr: any) {
        // Table may not exist yet (future migration) — log and continue
        console.warn(`[MirrorMigration] Skipped ${table}: ${tableErr.message}`);
      }
    }
    console.log(`[MirrorMigration] mirror_status/mirror_job_id ensured on ${succeeded}/${TABLES.length} tables.`);
  } catch (err) {
    console.error('[MirrorMigration] Unexpected error during column migration:', err);
  } finally {
    client.release();
  }
}
