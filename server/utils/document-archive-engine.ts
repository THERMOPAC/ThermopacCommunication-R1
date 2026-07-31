/**
 * document-archive-engine.ts
 *
 * Generic versioned document archiving engine.
 *
 * Today this powers Quotation PDF archiving. The strategy pattern means
 * future document types (Purchase Orders, Inspection Reports, Drawings, etc.)
 * plug in by implementing DocumentArchiveStrategy without touching this file.
 *
 * Core contract
 * ─────────────
 * • runDocumentArchive   — generate all buffers, upload to GCS, create artifact
 *                          rows and mirror jobs atomically. Returns only on full
 *                          success. Throws (and compensates) on any failure.
 * • rollbackDocumentArchive — single reusable compensation function called by
 *                          every failure path in the system.
 */

import * as fs from 'fs';
import { pool } from '../db';
import storageClient from './storage-config';
import { bucketName } from './storage-config';
import { storeQuotationPdfArtifactBlocking } from './quotation-pdf-artifact';
import { OfferPdfGenerator } from '../offer-pdf-generator';

// ── Public types ──────────────────────────────────────────────────────────────

export interface DocumentArchiveStrategy {
  documentType: string;
  generateBuffers(revision: number): Promise<{ mode: string; buffer: Buffer }[]>;
}

export interface ArchiveArtifact {
  mode: string;
  artifactId: number;
  gcsObjectPath: string;
  mirrorJobId: number;
}

export interface ArchiveEngineResult {
  archiveRevisionId: number;
  revision: number;
  artifacts: ArchiveArtifact[];
}

export interface RollbackParams {
  archiveRevisionId?: number;
  artifactIds:      number[];
  gcsObjectPaths:   string[];
  mirrorJobIds:     number[];
}

// ── Quotation-specific strategy ───────────────────────────────────────────────

export class QuotationArchiveStrategy implements DocumentArchiveStrategy {
  readonly documentType = 'QUOTATION';

  constructor(
    private offerData: any,
    private items: any[],
    private templatePath: string | null,
    private templateRange: { startPage?: number | null; endPage?: number | null },
    private mode?: 'combined' | 'breakup' | 'technical',
  ) {}

  async generateBuffers(revision: number): Promise<{ mode: string; buffer: Buffer }[]> {
    const modes = this.mode
      ? [this.mode]
      : (['combined', 'breakup', 'technical'] as const);
    return Promise.all(
      modes.map(async (mode) => {
        const generator = new OfferPdfGenerator(
          {
            offerNumber:       this.offerData.offerNumber,
            revision,
            createdAt:         this.offerData.createdAt?.toISOString() || new Date().toISOString(),
            customerName:      this.offerData.customerName,
            customerEmail:     this.offerData.customerEmail  || '',
            customerAddress:   this.offerData.customerAddress || '',
            contactPerson:     this.offerData.contactPerson   || '',
            subject:           this.offerData.subject,
            currency:          this.offerData.currency,
            subtotal:          this.offerData.subtotal,
            discountPercent:   this.offerData.discountPercent  || '0',
            discountAmount:    this.offerData.discountAmount   || '0',
            taxPercent:        this.offerData.taxPercent       || '0',
            taxAmount:         this.offerData.taxAmount        || '0',
            totalAmount:       this.offerData.totalAmount,
            validUntil:        this.offerData.validUntil?.toISOString() || '',
            paymentTerms:      this.offerData.paymentTerms    || '',
            deliveryTerms:     this.offerData.deliveryTerms   || '',
            notes:             this.offerData.notes           || '',
            termsAndConditions:this.offerData.termsAndConditions || '',
            items: this.items.map((item: any) => ({
              description:     item.description,
              productCode:     item.productCode   || '',
              unit:            item.unit,
              quantity:        item.quantity,
              unitPrice:       item.unitPrice,
              discountPercent: item.discountPercent || '0',
              totalPrice:      item.totalPrice,
              hsnSacCode:      item.hsnSacCode || '',
              isSubItem:       item.isSubItem  || false,
            })),
          },
          { priceMode: mode },
        );

        let buffer: Buffer;
        if (this.templatePath && fs.existsSync(this.templatePath)) {
          buffer = await generator.generateWithTemplateToBuffer(this.templatePath, this.templateRange);
        } else {
          buffer = await generator.generateToBuffer();
        }
        return { mode, buffer };
      }),
    );
  }
}

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Run a full document archive transaction:
 *  1. Insert offer_archive_revisions row (status = 'archiving')
 *  2. Generate all buffers via strategy (parallel)
 *  3. Upload each to GCS + create artifact row + create mirror job (parallel, blocking)
 *  4. On full success: mark revision 'active', return result
 *  5. On any failure: compensate all succeeded steps, rethrow
 */
export async function runDocumentArchive(params: {
  offerId:     number;
  offerNumber: string;
  revision:    number;
  actionType:  'CREATED' | 'UPDATED';
  userId:      number;
  strategy:    DocumentArchiveStrategy;
}): Promise<ArchiveEngineResult> {
  const { offerId, offerNumber, revision, actionType, userId, strategy } = params;

  // Step 1 — Create (or reset) archive revision record.
  // ON CONFLICT handles retries: a previous 'failed' row for the same
  // (offer_id, revision) is reset to 'archiving' so the attempt can proceed.
  const archRevRes = await pool.query(
    `INSERT INTO offer_archive_revisions (offer_id, revision, action_type, status, archived_by)
     VALUES ($1, $2, $3, 'archiving', $4)
     ON CONFLICT (offer_id, revision) DO UPDATE
       SET status       = 'archiving',
           action_type  = EXCLUDED.action_type,
           archived_by  = EXCLUDED.archived_by,
           archived_at  = NOW(),
           completed_at = NULL,
           error_detail = NULL
     RETURNING id`,
    [offerId, revision, actionType, userId],
  );
  const archiveRevisionId: number = archRevRes.rows[0].id;

  // Step 2 — Generate PDF buffers
  let buffers: { mode: string; buffer: Buffer }[];
  try {
    buffers = await strategy.generateBuffers(revision);
  } catch (genErr: any) {
    // Generation failed before any GCS work — just mark the revision record failed
    await pool.query(
      `UPDATE offer_archive_revisions SET status = 'failed', error_detail = $1 WHERE id = $2`,
      [genErr.message || String(genErr), archiveRevisionId],
    ).catch((e) => console.error('[archive-engine] Failed to mark revision failed after gen error:', e));
    throw genErr;
  }

  // Step 3 — Upload + artifact + mirror (all modes in parallel)
  const storeResults = await Promise.allSettled(
    buffers.map(({ mode, buffer }) =>
      storeQuotationPdfArtifactBlocking(
        buffer, offerId, offerNumber, revision, mode, userId, archiveRevisionId, actionType,
      ),
    ),
  );

  const succeeded = storeResults
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value);

  const failed = storeResults.filter((r) => r.status === 'rejected');

  if (failed.length > 0) {
    // Compensate whatever succeeded
    await rollbackDocumentArchive({
      archiveRevisionId,
      artifactIds:    succeeded.map((r) => r.artifactId),
      gcsObjectPaths: succeeded.map((r) => r.gcsObjectPath),
      mirrorJobIds:   succeeded.map((r) => r.mirrorJobId).filter(Boolean),
    });
    const firstErr = (failed[0] as PromiseRejectedResult).reason;
    throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
  }

  // Step 4 — Activate the revision record
  await pool.query(
    `UPDATE offer_archive_revisions SET status = 'active', completed_at = NOW() WHERE id = $1`,
    [archiveRevisionId],
  );

  return {
    archiveRevisionId,
    revision,
    artifacts: succeeded.map((r) => ({
      mode:           r.mode,
      artifactId:     r.artifactId,
      gcsObjectPath:  r.gcsObjectPath,
      mirrorJobId:    r.mirrorJobId,
    })),
  };
}

// ── Compensation ──────────────────────────────────────────────────────────────

/**
 * Single reusable rollback function.
 * Every failure path in the offer-archive workflow calls this.
 * Best-effort: logs individual failures but never throws, so callers can
 * continue with their own error handling.
 */
export async function rollbackDocumentArchive(params: RollbackParams): Promise<void> {
  const { archiveRevisionId, artifactIds, gcsObjectPaths, mirrorJobIds } = params;

  // 1. Delete mirror jobs
  if (mirrorJobIds.length > 0) {
    try {
      await pool.query(`DELETE FROM document_agent_jobs WHERE id = ANY($1)`, [mirrorJobIds]);
    } catch (e) {
      console.error('[archive-engine] Rollback: mirror job deletion failed:', e);
    }
  }

  // 2. Delete artifact rows
  if (artifactIds.length > 0) {
    try {
      await pool.query(`DELETE FROM quotation_pdf_artifacts WHERE id = ANY($1)`, [artifactIds]);
    } catch (e) {
      console.error('[archive-engine] Rollback: artifact row deletion failed:', e);
    }
  }

  // 3. Delete GCS objects (parallel, log-only on failure)
  if (gcsObjectPaths.length > 0) {
    const bucket = storageClient.bucket(bucketName);
    await Promise.allSettled(
      gcsObjectPaths.map((p) =>
        bucket.file(p).delete().catch((e) =>
          console.error(`[archive-engine] Rollback: GCS delete failed for ${p}:`, e),
        ),
      ),
    );
  }

  // 4. Mark archive revision as failed (or delete if still 'archiving' with no children)
  if (archiveRevisionId) {
    try {
      await pool.query(
        `UPDATE offer_archive_revisions SET status = 'failed', error_detail = 'Rolled back'
         WHERE id = $1`,
        [archiveRevisionId],
      );
    } catch (e) {
      console.error('[archive-engine] Rollback: archive_revision update failed:', e);
    }
  }
}
