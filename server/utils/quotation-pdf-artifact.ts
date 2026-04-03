import * as crypto from 'crypto';
import storage, { bucketName } from './storage-config';
import { pool } from '../db';

function deriveFyCode(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear() % 100;
  if (month >= 4) {
    return `${String(year).padStart(2, '0')}${String((year + 1) % 100).padStart(2, '0')}`;
  }
  return `${String((year - 1 + 100) % 100).padStart(2, '0')}${String(year).padStart(2, '0')}`;
}

function buildSalesGcsPath(fy: string, offerNumber: string, revision: number, priceMode: string, artifactId: number): string {
  const revStr = `Rev${String(revision).padStart(2, '0')}`;
  const safeName = offerNumber.replace(/\//g, '-');
  return `Sales/Quotations/${fy}/${safeName}_${revStr}_${priceMode}_${artifactId}.pdf`;
}

function buildEpcGcsPath(projectCode: string, offerNumber: string, revision: number, artifactId: number): string {
  const revStr = `Rev${String(revision).padStart(2, '0')}`;
  const safeName = offerNumber.replace(/\//g, '-');
  return `EPC/Projects/${projectCode}/Documents/QTN/${safeName}_${revStr}_${artifactId}.pdf`;
}

export async function storeQuotationPdfArtifact(
  pdfBuffer: Buffer,
  offerId: number,
  offerNumber: string,
  revision: number,
  priceMode: string,
  userId: number,
): Promise<{ artifactId: number; gcsObjectPath: string; checksum: string }> {
  const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const fileSize = pdfBuffer.length;
  const fy = deriveFyCode();

  await pool.query(
    `UPDATE quotation_pdf_artifacts
     SET artifact_status = 'superseded'
     WHERE offer_id = $1 AND revision = $2 AND price_mode = $3 AND artifact_status = 'active'`,
    [offerId, revision, priceMode]
  );

  const insertResult = await pool.query(
    `INSERT INTO quotation_pdf_artifacts
     (offer_id, revision, price_mode, gcs_bucket, gcs_object_path, checksum_sha256, file_size_bytes, artifact_status, generated_by)
     VALUES ($1, $2, $3, $4, '__pending__' || currval('quotation_pdf_artifacts_id_seq'), $5, $6, 'active', $7)
     RETURNING id`,
    [offerId, revision, priceMode, bucketName, checksum, fileSize, userId]
  );
  const artifactId = insertResult.rows[0].id;

  const gcsObjectPath = buildSalesGcsPath(fy, offerNumber, revision, priceMode, artifactId);

  await pool.query(
    `UPDATE quotation_pdf_artifacts SET gcs_object_path = $1 WHERE id = $2`,
    [gcsObjectPath, artifactId]
  );

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(gcsObjectPath);
  await file.save(pdfBuffer, {
    contentType: 'application/pdf',
    metadata: {
      contentType: 'application/pdf',
      cacheControl: 'public, max-age=31536000',
      metadata: {
        offerId: String(offerId),
        offerNumber,
        revision: String(revision),
        priceMode,
        artifactId: String(artifactId),
        checksumSha256: checksum,
      },
    },
  });

  console.log(`[quotation-pdf] Artifact ${artifactId} stored at ${gcsObjectPath} (${fileSize} bytes, sha256=${checksum})`);

  return { artifactId, gcsObjectPath, checksum };
}

export async function getActiveArtifact(offerId: number, revision: number, priceMode: string) {
  const result = await pool.query(
    `SELECT * FROM quotation_pdf_artifacts
     WHERE offer_id = $1 AND revision = $2 AND price_mode = $3 AND artifact_status = 'active'
     ORDER BY generated_at DESC LIMIT 1`,
    [offerId, revision, priceMode]
  );
  return result.rows[0] || null;
}

export async function getArtifactById(artifactId: number) {
  const result = await pool.query(
    `SELECT * FROM quotation_pdf_artifacts WHERE id = $1`,
    [artifactId]
  );
  return result.rows[0] || null;
}

export async function downloadArtifactBuffer(gcsObjectPath: string): Promise<Buffer> {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(gcsObjectPath);
  const [contents] = await file.download();
  return contents;
}

export async function freezeConfirmedArtifact(offerId: number, revision: number): Promise<number | null> {
  const candidates = await pool.query(
    `SELECT id FROM quotation_pdf_artifacts
     WHERE offer_id = $1 AND revision = $2 AND price_mode = 'combined' AND artifact_status = 'active' AND is_confirmed = false
     ORDER BY generated_at DESC
     LIMIT 1`,
    [offerId, revision]
  );
  if (candidates.rows.length === 0) {
    console.log(`[quotation-pdf] No active combined artifact to confirm for offer ${offerId} rev ${revision}`);
    return null;
  }
  const selectedId = candidates.rows[0].id;

  await pool.query(
    `UPDATE quotation_pdf_artifacts
     SET is_confirmed = true, confirmed_at = NOW(), epc_attachment_status = 'pending'
     WHERE id = $1`,
    [selectedId]
  );
  console.log(`[quotation-pdf] Confirmed artifact ${selectedId} for offer ${offerId} rev ${revision}`);
  return selectedId;
}

export async function attachConfirmedArtifactToEpc(
  artifactId: number,
  projectId: number,
  projectCode: string,
  offerId: number,
  offerNumber: string,
  userId: number,
  attachmentLabel?: string,
): Promise<{ success: boolean; epcAttachmentId?: number; error?: string }> {
  try {
    const artifact = await getArtifactById(artifactId);
    if (!artifact) {
      return { success: false, error: `Artifact ${artifactId} not found` };
    }
    if (!artifact.is_confirmed) {
      return { success: false, error: `Artifact ${artifactId} is not confirmed` };
    }

    const sourceBuffer = await downloadArtifactBuffer(artifact.gcs_object_path);
    const downloadChecksum = crypto.createHash('sha256').update(sourceBuffer).digest('hex');
    if (downloadChecksum !== artifact.checksum_sha256) {
      const err = `Checksum mismatch: source=${artifact.checksum_sha256}, downloaded=${downloadChecksum}`;
      await pool.query(
        `UPDATE quotation_pdf_artifacts SET epc_attachment_status = 'failed', epc_attachment_error = $1 WHERE id = $2`,
        [err, artifactId]
      );
      return { success: false, error: err };
    }

    const epcGcsPath = buildEpcGcsPath(projectCode, offerNumber, artifact.revision, artifactId);
    const bucket = storage.bucket(bucketName);
    const epcFile = bucket.file(epcGcsPath);
    await epcFile.save(sourceBuffer, {
      contentType: 'application/pdf',
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          sourceArtifactId: String(artifactId),
          offerId: String(offerId),
          projectId: String(projectId),
          checksumSha256: artifact.checksum_sha256,
        },
      },
    });

    const verifyFile = bucket.file(epcGcsPath);
    const [verifyContents] = await verifyFile.download();
    const verifyChecksum = crypto.createHash('sha256').update(verifyContents).digest('hex');
    if (verifyChecksum !== artifact.checksum_sha256) {
      const err = `Post-copy checksum mismatch: expected=${artifact.checksum_sha256}, got=${verifyChecksum}`;
      await pool.query(
        `UPDATE quotation_pdf_artifacts SET epc_attachment_status = 'failed', epc_attachment_error = $1 WHERE id = $2`,
        [err, artifactId]
      );
      return { success: false, error: err };
    }

    const revStr = `Rev${String(artifact.revision).padStart(2, '0')}`;
    const attachResult = await pool.query(
      `INSERT INTO epc_document_attachments
       (parent_entity_type, parent_entity_id, project_id, doc_type, document_number,
        is_revision_controlled, revision_code, attachment_label, attachment_seq,
        gcs_bucket, gcs_object_path, original_file_name, mime_type, file_size_bytes,
        checksum_sha256, status, is_current, uploaded_by)
       VALUES ('offers', $1, $2, 'QTN', $3, true, $4, $5, 1, $6, $7, $8, 'application/pdf', $9, $10, 'active', true, $11)
       RETURNING id`,
      [
        offerId, projectId, offerNumber, revStr,
        attachmentLabel || 'Confirmed Quotation (Combined)',
        bucketName, epcGcsPath,
        `${offerNumber.replace(/\//g, '-')}_${revStr}_Quotation.pdf`,
        sourceBuffer.length, artifact.checksum_sha256, userId,
      ]
    );
    const epcAttachmentId = attachResult.rows[0].id;

    await pool.query(
      `UPDATE quotation_pdf_artifacts SET epc_attachment_status = 'attached', epc_attachment_id = $1 WHERE id = $2`,
      [epcAttachmentId, artifactId]
    );

    console.log(`[quotation-pdf] EPC attachment ${epcAttachmentId} created for artifact ${artifactId} at ${epcGcsPath}`);
    return { success: true, epcAttachmentId };
  } catch (error: any) {
    const errMsg = error.message || String(error);
    console.error(`[quotation-pdf] EPC attachment failed for artifact ${artifactId}:`, errMsg);
    await pool.query(
      `UPDATE quotation_pdf_artifacts SET epc_attachment_status = 'failed', epc_attachment_error = $1 WHERE id = $2`,
      [errMsg, artifactId]
    );
    return { success: false, error: errMsg };
  }
}

export async function listArtifactsForOffer(offerId: number) {
  const result = await pool.query(
    `SELECT id, revision, price_mode, gcs_object_path, checksum_sha256, file_size_bytes,
            artifact_status, is_confirmed, confirmed_at, epc_attachment_status,
            epc_attachment_id, generated_by, generated_at
     FROM quotation_pdf_artifacts
     WHERE offer_id = $1
     ORDER BY generated_at DESC`,
    [offerId]
  );
  return result.rows;
}
