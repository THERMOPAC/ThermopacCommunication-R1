import * as crypto from 'crypto';
import storage, { bucketName } from './storage-config';
import { pool } from '../db';
import { buildQuotationGcsPath, buildEpcQtnGcsPath, CONTINENT_NAME_TO_CODE, COUNTRY_NAME_TO_CODE } from '../epc-coding';

function deriveFyCode(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear() % 100;
  if (month >= 4) {
    return `${String(year).padStart(2, '0')}${String((year + 1) % 100).padStart(2, '0')}`;
  }
  return `${String((year - 1 + 100) % 100).padStart(2, '0')}${String(year).padStart(2, '0')}`;
}

async function resolveCustomerGeoCodes(customerId: number): Promise<{
  continentCode: string; countryCode: string; shortCode: string;
}> {
  const result = await pool.query(
    `SELECT continent_code, country_code, short_code, continent, country_name
     FROM customers WHERE id = $1`,
    [customerId]
  );
  if (result.rows.length === 0) {
    throw new Error(`Customer not found: ${customerId}`);
  }
  const row = result.rows[0];
  let continentCode = row.continent_code;
  let countryCode = row.country_code;
  if (!continentCode && row.continent) {
    continentCode = CONTINENT_NAME_TO_CODE[row.continent];
  }
  if (!countryCode && row.country_name) {
    countryCode = COUNTRY_NAME_TO_CODE[row.country_name];
  }
  if (!continentCode || !countryCode) {
    throw new Error(`Customer ${customerId} missing geography codes (continent_code=${continentCode}, country_code=${countryCode})`);
  }
  return { continentCode, countryCode, shortCode: row.short_code };
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

  const offerResult = await pool.query(
    `SELECT customer_id FROM offers WHERE id = $1`,
    [offerId]
  );
  if (offerResult.rows.length === 0) {
    throw new Error(`Offer not found: ${offerId}`);
  }
  const customerId = offerResult.rows[0].customer_id;
  const geo = await resolveCustomerGeoCodes(customerId);

  const seqResult = await pool.query(
    `SELECT COALESCE(MAX(attachment_seq), 0) + 1 AS next_seq
     FROM quotation_pdf_artifacts
     WHERE offer_id = $1 AND revision = $2 AND artifact_status != 'superseded'`,
    [offerId, revision]
  );
  const attachmentSeq = (seqResult.rows[0] as any).next_seq;

  await pool.query(
    `UPDATE quotation_pdf_artifacts
     SET artifact_status = 'superseded'
     WHERE offer_id = $1 AND revision = $2 AND price_mode = $3 AND artifact_status = 'active'`,
    [offerId, revision, priceMode]
  );

  const gcsObjectPath = buildQuotationGcsPath(
    geo.continentCode, geo.countryCode, geo.shortCode,
    fy, offerNumber, revision, attachmentSeq, priceMode
  );

  const insertResult = await pool.query(
    `INSERT INTO quotation_pdf_artifacts
     (offer_id, revision, price_mode, gcs_bucket, gcs_object_path, checksum_sha256, file_size_bytes,
      artifact_status, generated_by, attachment_seq)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9)
     RETURNING id`,
    [offerId, revision, priceMode, bucketName, gcsObjectPath, checksum, fileSize, userId, attachmentSeq]
  );
  const artifactId = insertResult.rows[0].id;

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
      const err = `Pre-copy checksum mismatch: source=${artifact.checksum_sha256}, downloaded=${downloadChecksum}`;
      await pool.query(
        `UPDATE quotation_pdf_artifacts SET epc_attachment_status = 'failed', epc_attachment_error = $1 WHERE id = $2`,
        [err, artifactId]
      );
      return { success: false, error: err };
    }

    const projResult = await pool.query(
      `SELECT p.customer_id, p.fy_code, p.project_seq, c.continent_code, c.country_code, c.short_code, c.continent, c.country_name
       FROM projects p JOIN customers c ON c.id = p.customer_id
       WHERE p.id = $1`,
      [projectId]
    );
    if (projResult.rows.length === 0) {
      return { success: false, error: `Project ${projectId} not found or has no customer` };
    }
    const proj = projResult.rows[0];
    let continentCode = proj.continent_code;
    let countryCode = proj.country_code;
    if (!continentCode && proj.continent) {
      continentCode = CONTINENT_NAME_TO_CODE[proj.continent];
    }
    if (!countryCode && proj.country_name) {
      countryCode = COUNTRY_NAME_TO_CODE[proj.country_name];
    }
    if (!continentCode || !countryCode || !proj.short_code) {
      return { success: false, error: `Customer geography codes missing for project ${projectId}` };
    }
    const projectSeq = proj.project_seq || projectCode;

    const seqResult = await pool.query(
      `SELECT COALESCE(MAX(attachment_seq), 0) + 1 AS next_seq
       FROM epc_document_attachments
       WHERE project_id = $1 AND doc_type = 'QTN' AND document_number = $2`,
      [projectId, offerNumber]
    );
    const attachmentSeq = (seqResult.rows[0] as any).next_seq;

    const epcLabel = attachmentLabel || 'Baseline Order Quotation';
    const epcGcsPath = buildEpcQtnGcsPath(
      continentCode, countryCode, proj.short_code,
      proj.fy_code, projectSeq, offerNumber,
      attachmentSeq, epcLabel
    );

    const bucket = storage.bucket(bucketName);
    const epcFile = bucket.file(epcGcsPath);
    await epcFile.save(sourceBuffer, {
      contentType: 'application/pdf',
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          sourceArtifactId: String(artifactId),
          sourceGcsPath: artifact.gcs_object_path,
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

    const attachResult = await pool.query(
      `INSERT INTO epc_document_attachments
       (parent_entity_type, parent_entity_id, project_id, doc_type, document_number,
        is_revision_controlled, revision_code, attachment_label, attachment_seq,
        gcs_bucket, gcs_object_path, original_file_name, mime_type, file_size_bytes,
        checksum_sha256, status, is_current, uploaded_by)
       VALUES ('offers', $1, $2, 'QTN', $3, false, NULL, $4, $5, $6, $7, $8, 'application/pdf', $9, $10, 'active', true, $11)
       RETURNING id`,
      [
        offerId, projectId, offerNumber,
        epcLabel,
        attachmentSeq,
        bucketName, epcGcsPath,
        `${offerNumber.replace(/\//g, '-')}_Quotation.pdf`,
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
