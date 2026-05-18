import * as crypto from 'crypto';
import storage, { bucketName } from './storage-config';
import { pool } from '../db';
import { buildQuotationGcsPath, buildEpcQtnGcsPath, CONTINENT_NAME_TO_CODE, COUNTRY_NAME_TO_CODE } from '../epc-coding';


function slugifySubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40)
    .replace(/-+$/g, '') || 'offer';
}

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

/**
 * Resolves the GCS object path for a quotation PDF by reading the path template
 * from the gcs_governance_rules table. Falls back to the hardcoded builder if no
 * active rule is found (safety net for fresh installs before seed runs).
 *
 * Token mapping (template → runtime value):
 *   {CC}      → continentCode
 *   {CO}      → countryCode
 *   {Cust}    → customerShortCode
 *   {FY}      → fyCode
 *   {OfferNo} → offerNumber (slashes replaced with dashes)
 *   {Seq}     → attachmentSeq zero-padded to 3 digits
 *   {Label}   → subjectSlug
 *   {rev}     → revision zero-padded to 2 digits (template already contains literal "-rev-")
 */
async function resolveQuotationGcsPathFromDb(
  documentType: 'QUOTATION' | 'EPC_QUOTATION',
  continentCode: string,
  countryCode: string,
  customerShortCode: string,
  fyCode: string,
  offerNumber: string,
  revision: number,
  attachmentSeq: number,
  subjectSlug: string,
): Promise<string> {
  const ruleRow = await pool.query(
    `SELECT path_template FROM gcs_governance_rules
     WHERE document_type = $1 AND (active IS NULL OR active = true)
     ORDER BY id ASC LIMIT 1`,
    [documentType]
  );
  const template: string | null = ruleRow.rows[0]?.path_template ?? null;

  if (!template) {
    // Safety fallback — should never happen after seed runs
    console.warn(`[quotation-pdf] No active DB rule for ${documentType} — falling back to hardcoded builder`);
    return documentType === 'EPC_QUOTATION'
      ? buildEpcQtnGcsPath(continentCode, countryCode, customerShortCode, fyCode, offerNumber, revision, attachmentSeq, subjectSlug)
      : buildQuotationGcsPath(continentCode, countryCode, customerShortCode, fyCode, offerNumber, revision, attachmentSeq, subjectSlug);
  }

  const seq = String(attachmentSeq).padStart(3, '0');
  const rev = String(revision).padStart(2, '0');
  const safeOfferNo = offerNumber.replace(/\//g, '-');
  const label = subjectSlug || 'offer';

  return template
    .replace('{CC}',      continentCode)
    .replace('{CO}',      countryCode)
    .replace('{Cust}',    customerShortCode)
    .replace('{FY}',      fyCode)
    .replace('{OfferNo}', safeOfferNo)
    .replace('{Seq}',     seq)
    .replace('{Label}',   label)
    .replace('{rev}',     rev);
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
    `SELECT customer_id, subject FROM offers WHERE id = $1`,
    [offerId]
  );
  if (offerResult.rows.length === 0) {
    throw new Error(`Offer not found: ${offerId}`);
  }
  const customerId = offerResult.rows[0].customer_id;
  const subjectSlug = slugifySubject(offerResult.rows[0].subject || '');
  const geo = await resolveCustomerGeoCodes(customerId);

  // ── Atomic seq allocation ──────────────────────────────────────────────
  // Acquire per-offer advisory lock inside a transaction so that concurrent
  // PDF generations for the same offer never race on the seq counter.
  const client = await pool.connect();
  let artifactId: number;
  let gcsObjectPath: string;
  let attachmentSeq: number;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [offerId]);

    const seqResult = await client.query(
      `SELECT COALESCE(MAX(attachment_seq), 0) + 1 AS next_seq
       FROM quotation_pdf_artifacts
       WHERE offer_id = $1 AND artifact_status != 'superseded'`,
      [offerId]
    );
    attachmentSeq = (seqResult.rows[0] as any).next_seq;

    await client.query(
      `UPDATE quotation_pdf_artifacts
       SET artifact_status = 'superseded'
       WHERE offer_id = $1 AND revision = $2 AND price_mode = $3 AND artifact_status = 'active'`,
      [offerId, revision, priceMode]
    );

    gcsObjectPath = await resolveQuotationGcsPathFromDb(
      'QUOTATION',
      geo.continentCode, geo.countryCode, geo.shortCode,
      fy, offerNumber, revision, attachmentSeq, subjectSlug
    );

    const insertResult = await client.query(
      `INSERT INTO quotation_pdf_artifacts
       (offer_id, revision, price_mode, gcs_bucket, gcs_object_path, checksum_sha256, file_size_bytes,
        artifact_status, generated_by, attachment_seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9)
       RETURNING id`,
      [offerId, revision, priceMode, bucketName, gcsObjectPath, checksum, fileSize, userId, attachmentSeq]
    );
    artifactId = insertResult.rows[0].id;
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

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

/**
 * Two-phase atomic store:
 *   Phase 1 (inside transaction + advisory lock): allocate seq, supersede old, INSERT status='uploading'
 *   Phase 2 (outside transaction): upload to GCS
 *   On GCS success: UPDATE status='active'
 *   On GCS failure: compensating rollback — DELETE new record + reactivate old superseded
 * This guarantees: failed GCS upload never leaves a permanent DB artifact record.
 */
export async function storeQuotationPdfArtifactTwoPhase(
  pdfBuffer: Buffer,
  offerId: number,
  offerNumber: string,
  revision: number,
  priceMode: string,
  userId: number,
): Promise<{ artifactId: number; gcsObjectPath: string; attachmentSeq: number; checksum: string }> {
  const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const fileSize = pdfBuffer.length;
  const fy = deriveFyCode();

  const offerResult = await pool.query(
    `SELECT customer_id, subject FROM offers WHERE id = $1`,
    [offerId]
  );
  if (offerResult.rows.length === 0) throw new Error(`Offer not found: ${offerId}`);
  const customerId = offerResult.rows[0].customer_id;
  const subjectSlug = slugifySubject(offerResult.rows[0].subject || '');
  const geo = await resolveCustomerGeoCodes(customerId);

  // ── Phase 1: Atomic DB reservation ──────────────────────────────────────
  const client = await pool.connect();
  let artifactId: number;
  let gcsObjectPath: string;
  let attachmentSeq: number;
  let supersededId: number | null = null;

  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [offerId]);

    const seqResult = await client.query(
      `SELECT COALESCE(MAX(attachment_seq), 0) + 1 AS next_seq
       FROM quotation_pdf_artifacts
       WHERE offer_id = $1 AND artifact_status != 'superseded'`,
      [offerId]
    );
    attachmentSeq = (seqResult.rows[0] as any).next_seq;

    const existingResult = await client.query(
      `SELECT id FROM quotation_pdf_artifacts
       WHERE offer_id = $1 AND revision = $2 AND price_mode = $3 AND artifact_status = 'active'
       LIMIT 1`,
      [offerId, revision, priceMode]
    );
    if (existingResult.rows.length > 0) {
      supersededId = existingResult.rows[0].id;
    }

    await client.query(
      `UPDATE quotation_pdf_artifacts SET artifact_status = 'superseded'
       WHERE offer_id = $1 AND revision = $2 AND price_mode = $3 AND artifact_status = 'active'`,
      [offerId, revision, priceMode]
    );

    gcsObjectPath = await resolveQuotationGcsPathFromDb(
      'QUOTATION',
      geo.continentCode, geo.countryCode, geo.shortCode,
      fy, offerNumber, revision, attachmentSeq, subjectSlug
    );

    const insertResult = await client.query(
      `INSERT INTO quotation_pdf_artifacts
       (offer_id, revision, price_mode, gcs_bucket, gcs_object_path, checksum_sha256, file_size_bytes,
        artifact_status, generated_by, attachment_seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'uploading', $8, $9)
       RETURNING id`,
      [offerId, revision, priceMode, bucketName, gcsObjectPath, checksum, fileSize, userId, attachmentSeq]
    );
    artifactId = insertResult.rows[0].id;
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }
  client.release();

  // ── Phase 2: GCS upload (outside transaction) ───────────────────────────
  try {
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
  } catch (gcsErr) {
    // ── Compensating rollback — delete reservation + restore superseded ──
    const comp = await pool.connect();
    try {
      await comp.query('BEGIN');
      await comp.query(`DELETE FROM quotation_pdf_artifacts WHERE id = $1 AND artifact_status = 'uploading'`, [artifactId]);
      if (supersededId !== null) {
        await comp.query(`UPDATE quotation_pdf_artifacts SET artifact_status = 'active' WHERE id = $1`, [supersededId]);
      }
      await comp.query('COMMIT');
    } catch (compErr) {
      await comp.query('ROLLBACK');
      console.error('[quotation-pdf] Compensating rollback failed after GCS error:', compErr);
    } finally {
      comp.release();
    }
    throw gcsErr;
  }

  // ── Phase 3: Activate record ────────────────────────────────────────────
  await pool.query(
    `UPDATE quotation_pdf_artifacts SET artifact_status = 'active' WHERE id = $1`,
    [artifactId]
  );

  console.log(`[quotation-pdf] [2-phase] Artifact ${artifactId} active at ${gcsObjectPath} (seq=${attachmentSeq})`);
  return { artifactId, gcsObjectPath, attachmentSeq, checksum };
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
    if (!proj.project_seq) {
      return { success: false, error: `G3 violation: project ${projectId} has no project_seq. Assign a 3-digit sequence code before attaching EPC quotation artifacts.` };
    }
    const projectSeq = proj.project_seq;

    const seqResult = await pool.query(
      `SELECT COALESCE(MAX(attachment_seq), 0) + 1 AS next_seq
       FROM epc_document_attachments
       WHERE project_id = $1 AND doc_type = 'QTN' AND document_number = $2`,
      [projectId, offerNumber]
    );
    const attachmentSeq = (seqResult.rows[0] as any).next_seq;

    const offerSubjectResult = await pool.query(
      `SELECT subject FROM offers WHERE id = $1`,
      [offerId]
    );
    const offerSubject = offerSubjectResult.rows[0]?.subject || '';
    const epcSubjectSlug = slugifySubject(offerSubject);

    const epcGcsPath = await resolveQuotationGcsPathFromDb(
      'EPC_QUOTATION',
      continentCode, countryCode, proj.short_code,
      proj.fy_code, offerNumber,
      artifact.revision,
      attachmentSeq, epcSubjectSlug
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

/**
 * Saves an immutable "Final Offer" snapshot to GCS when an offer is converted
 * to an order. Reads the path template from the FINAL_OFFER governance rule in DB.
 *
 * Token mapping:
 *   {CC}      → continentCode
 *   {CO}      → countryCode
 *   {Cust}    → customerShortCode
 *   {FY}      → fyCode (from the project record)
 *   {Code}    → projectCode (e.g. 2627-019)
 *   {OfferNo} → offerNumber with slashes replaced by dashes
 *   {rev}     → revision zero-padded to 2 digits
 *
 * Non-blocking at the call-site — errors are logged but do not fail conversion.
 */
export async function storeFinalOfferPdfToGcs(
  artifactId: number,
  projectId: number,
  projectCode: string,
  offerId: number,
  offerNumber: string,
  revision: number,
  userId: number,
): Promise<{ success: boolean; gcsPath?: string; error?: string }> {
  try {
    const artifact = await getArtifactById(artifactId);
    if (!artifact) return { success: false, error: `Artifact ${artifactId} not found` };

    const sourceBuffer = await downloadArtifactBuffer(artifact.gcs_object_path);

    const projResult = await pool.query(
      `SELECT p.fy_code, c.continent_code, c.country_code, c.short_code, c.continent, c.country_name
       FROM projects p JOIN customers c ON c.id = p.customer_id WHERE p.id = $1`,
      [projectId]
    );
    if (projResult.rows.length === 0) return { success: false, error: `Project ${projectId} not found` };
    const proj = projResult.rows[0];

    let continentCode = proj.continent_code;
    let countryCode   = proj.country_code;
    if (!continentCode && proj.continent)    continentCode = CONTINENT_NAME_TO_CODE[proj.continent];
    if (!countryCode   && proj.country_name) countryCode   = COUNTRY_NAME_TO_CODE[proj.country_name];
    if (!continentCode || !countryCode || !proj.short_code) {
      return { success: false, error: 'Customer geography codes missing for FINAL_OFFER path resolution' };
    }

    const ruleRow = await pool.query(
      `SELECT path_template FROM gcs_governance_rules
       WHERE document_type = 'FINAL_OFFER' AND (active IS NULL OR active = true)
       ORDER BY id ASC LIMIT 1`
    );
    const template: string | null = ruleRow.rows[0]?.path_template ?? null;
    if (!template) return { success: false, error: 'No active FINAL_OFFER governance rule found in DB' };

    const rev         = String(revision).padStart(2, '0');
    const safeOfferNo = offerNumber.replace(/\//g, '-');

    const gcsPath = template
      .replace('{CC}',      continentCode)
      .replace('{CO}',      countryCode)
      .replace('{Cust}',    proj.short_code)
      .replace('{FY}',      proj.fy_code)
      .replace('{Code}',    projectCode)
      .replace('{OfferNo}', safeOfferNo)
      .replace('{rev}',     rev);

    const bucket = storage.bucket(bucketName);
    await bucket.file(gcsPath).save(sourceBuffer, {
      contentType: 'application/pdf',
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          sourceArtifactId: String(artifactId),
          offerId:          String(offerId),
          offerNumber,
          projectId:        String(projectId),
          projectCode,
          governanceType:   'FINAL_OFFER',
          generatedBy:      String(userId),
        },
      },
    });

    console.log(`[final-offer-pdf] Snapshot saved → ${gcsPath}`);
    return { success: true, gcsPath };
  } catch (err: any) {
    console.error('[final-offer-pdf] Failed to save Final Offer snapshot:', err);
    return { success: false, error: err.message };
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
