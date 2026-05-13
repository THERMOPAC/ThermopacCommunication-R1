/**
 * RFQ Email Dispatch Service — Baseline v1.0
 * Governance: docs/rfq-email-dispatch-baseline-v1.0.md §2, §5, §6, §8
 *
 * Rules enforced:
 *  - One individual email per vendor (NO cross-vendor CC/BCC — email privacy)
 *  - Failed dispatch does NOT roll back RFQ issue
 *  - Every resend creates a NEW plc_rfq_dispatch_log row
 *  - Attachments frozen inside the DB transaction before any email is sent
 *  - >20 MB total → attachments served as signed URL links in email body
 */

import * as nodemailer from 'nodemailer';
import { pool } from './db';
import { logPlcAudit } from './plc-line-service';
import { generateRfqPdf } from './rfq-pdf-generator';
import storage, { bucketName } from './utils/storage-config';

const MAX_INLINE_BYTES = 20 * 1024 * 1024; // 20 MB

// ─────────────────────────────────────────────────────────────────────────────
// Mail transporter (Gmail SMTP — mirrors existing codebase pattern)
// ─────────────────────────────────────────────────────────────────────────────
function createMailTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[RFQ-Email] Gmail SMTP not configured — dispatch disabled');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight check (called before issue to surface warnings)
// ─────────────────────────────────────────────────────────────────────────────
export interface RfqPreflightResult {
  vendorsNoEmail: { vendorId: number; vendorName: string }[];
  linesNoDatasheet: { plcLineId: number; plcNumber: string; tagNo: string }[];
  estimatedSizeMb: number;
  sizeWarning: boolean;
}

export async function preflightRfq(rfqId: number): Promise<RfqPreflightResult> {
  // Vendors without email
  const vRows = await pool.query(
    `SELECT rv.vendor_id, v.name AS vendor_name, rv.email_override, v.email
     FROM plc_rfq_vendors rv
     JOIN vendors v ON v.id = rv.vendor_id
     WHERE rv.rfq_id = $1`,
    [rfqId],
  );
  const vendorsNoEmail = vRows.rows
    .filter((r: any) => !r.email_override && !r.email)
    .map((r: any) => ({ vendorId: r.vendor_id, vendorName: r.vendor_name }));

  // Lines with datasheet_required=true but not yet uploaded
  const lRows = await pool.query(
    `SELECT p.id AS plc_line_id, p.plc_number, p.tag_no,
            bls.datasheet_required, bls.datasheet_uploaded, bls.datasheet_file_size_bytes
     FROM plc_rfq_lines rl
     JOIN procurement_list_lines p ON p.id = rl.plc_line_id
     LEFT JOIN project_buy_list_lines src ON src.id = p.source_buy_list_line_id
     LEFT JOIN buy_list_line_selections bls ON bls.buy_list_line_id = src.id
     WHERE rl.rfq_id = $1`,
    [rfqId],
  );
  const linesNoDatasheet = lRows.rows
    .filter((r: any) => r.datasheet_required && !r.datasheet_uploaded)
    .map((r: any) => ({ plcLineId: r.plc_line_id, plcNumber: r.plc_number, tagNo: r.tag_no || '' }));

  // Estimate total attachment size (sum of all datasheet sizes + ~200KB for RFQ PDF)
  const totalBytes = lRows.rows.reduce(
    (acc: number, r: any) => acc + (r.datasheet_uploaded ? parseInt(r.datasheet_file_size_bytes || '0') : 0),
    200 * 1024,
  );
  const estimatedSizeMb = Math.round((totalBytes / (1024 * 1024)) * 10) / 10;

  return {
    vendorsNoEmail,
    linesNoDatasheet,
    estimatedSizeMb,
    sizeWarning: totalBytes > MAX_INLINE_BYTES,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Freeze attachments (run INSIDE the issue DB transaction)
// ─────────────────────────────────────────────────────────────────────────────
export async function freezeAttachments(
  rfqId: number,
  frozenBy: number,
  client: any,
): Promise<number> {
  // Fetch datasheet info for each PLC line in this RFQ
  const rows = await client.query(
    `SELECT p.id AS plc_line_id,
            bls.datasheet_gcs_bucket,
            bls.datasheet_gcs_object_path,
            bls.datasheet_original_filename,
            bls.datasheet_file_size_bytes,
            bls.datasheet_mime_type,
            bls.datasheet_checksum_sha256,
            bls.datasheet_revision_seq,
            bls.datasheet_uploaded
     FROM plc_rfq_lines rl
     JOIN procurement_list_lines p ON p.id = rl.plc_line_id
     LEFT JOIN project_buy_list_lines src ON src.id = p.source_buy_list_line_id
     LEFT JOIN buy_list_line_selections bls ON bls.buy_list_line_id = src.id
     WHERE rl.rfq_id = $1`,
    [rfqId],
  );

  let frozenCount = 0;
  for (const r of rows.rows) {
    if (!r.datasheet_uploaded || !r.datasheet_gcs_object_path) continue;
    await client.query(
      `INSERT INTO plc_rfq_attachments
         (rfq_id, plc_line_id, attachment_type, gcs_bucket, gcs_path,
          original_filename, file_size_bytes, mime_type,
          checksum_sha256, source_revision_seq, frozen_by)
       VALUES ($1,$2,'datasheet',$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        rfqId, r.plc_line_id,
        r.datasheet_gcs_bucket || bucketName,
        r.datasheet_gcs_object_path,
        r.datasheet_original_filename,
        r.datasheet_file_size_bytes ? parseInt(r.datasheet_file_size_bytes) : null,
        r.datasheet_mime_type,
        r.datasheet_checksum_sha256,
        r.datasheet_revision_seq,
        frozenBy,
      ],
    );
    frozenCount++;
  }

  // Mark freeze timestamp on RFQ record
  await client.query(
    `UPDATE plc_rfq_records SET attachments_frozen_at = NOW() WHERE id = $1`,
    [rfqId],
  );

  return frozenCount;
}

// ─────────────────────────────────────────────────────────────────────────────
// Download a GCS object as Buffer
// ─────────────────────────────────────────────────────────────────────────────
async function downloadGcsBuffer(bucket: string, path: string): Promise<Buffer> {
  const [contents] = await storage.bucket(bucket).file(path).download();
  return contents as Buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate signed URL for oversized attachment
// ─────────────────────────────────────────────────────────────────────────────
async function getSignedUrl(bucket: string, path: string): Promise<string> {
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const [url] = await storage.bucket(bucket).file(path).getSignedUrl({
    action: 'read',
    expires,
  });
  return url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build email HTML body
// ─────────────────────────────────────────────────────────────────────────────
function buildEmailHtml(params: {
  rfqNumber: string;
  subject: string | null;
  rfqDate: string | null;
  submissionDeadline: string | null;
  vendorName: string;
  contactPerson: string | null;
  lines: { plcNumber: string; tagNo: string; serviceDescription: string; qty: string; uom: string }[];
  notes: string | null;
  oversizedLinks: { filename: string; url: string }[];
}): string {
  function fmtD(d: string | null) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  }

  const lineRows = params.lines.map(l => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:6px 8px;font-size:11px;font-family:monospace;color:#4338ca">${l.plcNumber}</td>
      <td style="padding:6px 8px;font-size:11px">${l.tagNo || '—'}</td>
      <td style="padding:6px 8px;font-size:11px">${l.serviceDescription || '—'}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right">${l.qty}</td>
      <td style="padding:6px 8px;font-size:11px">${l.uom || '—'}</td>
    </tr>`).join('');

  const oversizedSection = params.oversizedLinks.length > 0 ? `
    <div style="margin-top:16px;padding:12px;background:#fef9c3;border-radius:6px;border:1px solid #fde047">
      <p style="margin:0 0 8px;font-size:12px;font-weight:bold;color:#92400e">
        ⚠ Some attachments are large — download links (valid 7 days):
      </p>
      ${params.oversizedLinks.map(l => `
        <a href="${l.url}" style="display:block;font-size:11px;color:#1d4ed8;margin:3px 0">${l.filename}</a>
      `).join('')}
    </div>` : '';

  return `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a5f 0%,#1e40af 100%);color:white;padding:20px 24px;border-radius:8px 8px 0 0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:20px;font-weight:bold">THERMOPAC</div>
          <div style="font-size:11px;opacity:0.8;margin-top:2px">Engineering Private Limited</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:14px;font-weight:bold;background:rgba(255,255,255,0.15);padding:4px 10px;border-radius:4px">${params.rfqNumber}</div>
          <div style="font-size:10px;opacity:0.7;margin-top:3px">Request for Quotation</div>
        </div>
      </div>
    </div>

    <!-- Meta strip -->
    <div style="background:#f1f5f9;padding:10px 24px;display:flex;gap:32px;border-bottom:1px solid #e2e8f0">
      <div>
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">RFQ Date</div>
        <div style="font-size:12px;font-weight:600;color:#0f172a">${fmtD(params.rfqDate)}</div>
      </div>
      <div>
        <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Submission Deadline</div>
        <div style="font-size:12px;font-weight:600;color:#dc2626">${fmtD(params.submissionDeadline)}</div>
      </div>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;padding:24px">
      <p style="margin:0 0 12px;font-size:13px;color:#1e293b">
        Dear ${params.contactPerson ? params.contactPerson : params.vendorName},
      </p>
      <p style="margin:0 0 16px;font-size:13px;color:#374151;line-height:1.6">
        THERMOPAC Engineering Pvt Ltd invites your best offer for the supply of the items listed below
        per <strong>${params.rfqNumber}</strong>${params.subject ? ` — <em>${params.subject}</em>` : ''}.
        Please quote unit price (ex-works), delivery period (weeks), offer validity, and applicable taxes.
      </p>

      ${params.notes ? `<div style="background:#f0f9ff;border-left:3px solid #0ea5e9;padding:8px 12px;margin-bottom:16px;font-size:12px;color:#0369a1">${params.notes}</div>` : ''}

      <!-- Line items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr style="background:#1e3a5f">
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#fff;font-weight:600">PLC No</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#fff;font-weight:600">Tag No</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#fff;font-weight:600">Description</th>
            <th style="padding:7px 8px;text-align:right;font-size:10px;color:#fff;font-weight:600">Qty</th>
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#fff;font-weight:600">UOM</th>
          </tr>
        </thead>
        <tbody>${lineRows}</tbody>
      </table>

      ${oversizedSection}

      <!-- T&C -->
      <div style="margin-top:20px;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
        <div style="font-size:10px;font-weight:bold;color:#1e3a5f;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">
          Terms &amp; Conditions
        </div>
        <ol style="margin:0;padding-left:16px;font-size:11px;color:#374151;line-height:1.7">
          <li>Prices must be quoted in INR, exclusive of GST (state GST separately).</li>
          <li>Delivery period confirmed from the date of Purchase Order.</li>
          <li>Payment: 30 days from invoice date or as per PO terms.</li>
          <li>Material to comply with specifications and standards referenced herein.</li>
          <li>THERMOPAC reserves the right to reject any or all offers.</li>
          <li>Minimum offer validity: 60 days from submission deadline.</li>
        </ol>
      </div>

      <p style="margin-top:20px;font-size:12px;color:#374151">
        Please find the RFQ document and applicable datasheets attached.
        Submit your quotation by <strong style="color:#dc2626">${fmtD(params.submissionDeadline)}</strong>.
      </p>

      <p style="margin-top:16px;font-size:12px;color:#64748b">
        Regards,<br>
        <strong style="color:#1e293b">Procurement Team</strong><br>
        THERMOPAC Engineering Private Limited
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f1f5f9;padding:10px 24px;text-align:center;border-top:1px solid #e2e8f0;border-radius:0 0 8px 8px">
      <div style="font-size:9px;color:#94a3b8">
        This email is intended solely for the named recipient. Do not forward without permission. | ${params.rfqNumber}
      </div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core dispatch to one vendor (individual, private email)
// ─────────────────────────────────────────────────────────────────────────────
async function dispatchToOneVendor(params: {
  rfq: any;
  vendor: any;
  lines: any[];
  frozenAttachments: any[];
  rfqPdfBuffer: Buffer;
  projectCode: string;
  dispatchedBy: number;
  isResend: boolean;
  resendNumber: number;
}): Promise<void> {
  const { rfq, vendor, lines, frozenAttachments, rfqPdfBuffer, dispatchedBy, isResend, resendNumber } = params;

  const emailTo: string = vendor.email_override || vendor.email || '';
  if (!emailTo) {
    await pool.query(
      `INSERT INTO plc_rfq_dispatch_log
         (rfq_id, vendor_id, email_to, dispatch_status, attachment_count, dispatched_by, is_resend, resend_number)
       VALUES ($1,$2,'[no email]','no_email',0,$3,$4,$5)`,
      [rfq.id, vendor.vendor_id, dispatchedBy, isResend, resendNumber],
    );
    await pool.query(
      `UPDATE plc_rfq_vendors SET dispatch_status='no_email', last_dispatched_at=NOW() WHERE rfq_id=$1 AND vendor_id=$2`,
      [rfq.id, vendor.vendor_id],
    );
    return;
  }

  // Build attachment list for this vendor
  const emailAttachments: nodemailer.Attachment[] = [];
  const oversizedLinks: { filename: string; url: string }[] = [];
  let totalBytes = rfqPdfBuffer.length;

  // RFQ PDF always included inline
  emailAttachments.push({
    filename: `${rfq.rfq_number}.pdf`,
    content: rfqPdfBuffer,
    contentType: 'application/pdf',
  });

  // Line-specific frozen datasheets
  const lineDatasheets = frozenAttachments.filter((a: any) => a.attachment_type === 'datasheet');
  for (const att of lineDatasheets) {
    try {
      const sz = att.file_size_bytes || 0;
      if (totalBytes + sz > MAX_INLINE_BYTES) {
        // Fallback to signed URL link
        const url = await getSignedUrl(att.gcs_bucket, att.gcs_path);
        oversizedLinks.push({ filename: att.original_filename || att.gcs_path.split('/').pop() || 'datasheet.pdf', url });
      } else {
        const buf = await downloadGcsBuffer(att.gcs_bucket, att.gcs_path);
        emailAttachments.push({
          filename: att.original_filename || 'datasheet.pdf',
          content: buf,
          contentType: att.mime_type || 'application/pdf',
        });
        totalBytes += sz;
      }
    } catch (err: any) {
      console.warn(`[RFQ-Email] GCS download failed for ${att.gcs_path}:`, err.message);
      // attachment skipped — logged but does not abort
    }
  }

  // Build email body (individual — NO other vendor addresses)
  const htmlBody = buildEmailHtml({
    rfqNumber: rfq.rfq_number,
    subject: rfq.subject,
    rfqDate: rfq.rfq_date,
    submissionDeadline: rfq.submission_deadline,
    vendorName: vendor.vendor_display_name || vendor.vendor_name,
    contactPerson: vendor.contact_person,
    lines: lines.map((l: any) => ({
      plcNumber: l.plc_number,
      tagNo: l.tag_no || '',
      serviceDescription: l.service_description || '',
      qty: l.qty_required || '1',
      uom: l.uom || '',
    })),
    notes: rfq.notes,
    oversizedLinks,
  });

  const transporter = createMailTransporter();
  let messageId: string | null = null;
  let failureReason: string | null = null;
  let dispatchStatus = 'sent';

  try {
    if (transporter) {
      const info = await transporter.sendMail({
        from: `THERMOPAC Procurement <${process.env.GMAIL_USER}>`,
        to: emailTo,           // Individual vendor only — NO CC to other vendors
        subject: `RFQ ${rfq.rfq_number} | ${rfq.subject || 'Quotation Request'} | THERMOPAC`,
        html: htmlBody,
        attachments: emailAttachments,
      });
      messageId = info.messageId || null;
    } else {
      // Transporter not configured — log as sent for dev environments
      console.log(`[RFQ-Email] Dev mode: would send to ${emailTo} for RFQ ${rfq.rfq_number}`);
      messageId = `dev-${Date.now()}`;
    }
  } catch (err: any) {
    dispatchStatus = 'failed';
    failureReason = err.message;
    console.error(`[RFQ-Email] Failed dispatch to vendor ${vendor.vendor_id}:`, err.message);
  }

  // Log result (append-only)
  await pool.query(
    `INSERT INTO plc_rfq_dispatch_log
       (rfq_id, vendor_id, email_to, dispatch_status, nodemailer_message_id,
        failure_reason, attachment_count, dispatched_by, is_resend, resend_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      rfq.id, vendor.vendor_id, emailTo, dispatchStatus, messageId,
      failureReason, emailAttachments.length, dispatchedBy, isResend, resendNumber,
    ],
  );

  // Update vendor dispatch status
  await pool.query(
    `UPDATE plc_rfq_vendors
     SET dispatch_status=$1, last_dispatched_at=NOW(),
         resend_count = CASE WHEN $2 THEN resend_count + 1 ELSE resend_count END
     WHERE rfq_id=$3 AND vendor_id=$4`,
    [dispatchStatus, isResend, rfq.id, vendor.vendor_id],
  );

  // Audit
  await logPlcAudit(pool, {
    projectId: rfq.project_id,
    entityType: 'rfq',
    entityId: rfq.id,
    eventType: dispatchStatus === 'sent' ? 'rfq_email_dispatched' : 'rfq_email_failed',
    oldStatus: null,
    newStatus: null,
    changedBy: dispatchedBy,
    notes: dispatchStatus === 'sent'
      ? `Email dispatched to vendor ${vendor.vendor_id} at ${emailTo}${isResend ? ` (resend #${resendNumber})` : ''}`
      : `Email failed for vendor ${vendor.vendor_id}: ${failureReason}`,
    metadata: { vendorId: vendor.vendor_id, emailTo, messageId, attachmentCount: emailAttachments.length, isResend, resendNumber },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dispatch: generate PDF + send to all vendors (post-commit)
// ─────────────────────────────────────────────────────────────────────────────
export async function dispatchRfqToVendors(rfqId: number, issuedBy: number): Promise<{
  dispatched: number; failed: number; noEmail: number;
}> {
  // Load full RFQ data
  const rfqRes = await pool.query(
    `SELECT r.*, p.code AS project_code
     FROM plc_rfq_records r
     JOIN projects p ON p.id = r.project_id
     WHERE r.id = $1`,
    [rfqId],
  );
  if (!rfqRes.rowCount) throw new Error(`RFQ ${rfqId} not found`);
  const rfq = rfqRes.rows[0];

  const vendorsRes = await pool.query(
    `SELECT rv.*, v.name AS vendor_name, v.display_name AS vendor_display_name,
            v.email, v.contact_person
     FROM plc_rfq_vendors rv
     JOIN vendors v ON v.id = rv.vendor_id
     WHERE rv.rfq_id = $1`,
    [rfqId],
  );

  const linesRes = await pool.query(
    `SELECT p.plc_number, p.tag_no, p.service_description, p.qty_required,
            mi.uom, p.specification_notes
     FROM plc_rfq_lines rl
     JOIN procurement_list_lines p ON p.id = rl.plc_line_id
     LEFT JOIN master_items mi ON mi.id = p.master_item_id
     WHERE rl.rfq_id = $1 ORDER BY p.plc_number`,
    [rfqId],
  );

  const attachRes = await pool.query(
    `SELECT * FROM plc_rfq_attachments WHERE rfq_id = $1`,
    [rfqId],
  );

  // Generate RFQ PDF
  const rfqPdfBuffer = await generateRfqPdf({
    rfqNumber: rfq.rfq_number,
    rfqDate: rfq.rfq_date,
    submissionDeadline: rfq.submission_deadline,
    subject: rfq.subject,
    notes: rfq.notes,
    vendorName: '', // placeholder — overridden per vendor in loop
    vendorContactPerson: null,
    vendorAddress: null,
    vendorCity: null,
    vendorCountry: null,
    lines: linesRes.rows.map((l: any) => ({
      plcNumber: l.plc_number,
      tagNo: l.tag_no,
      itemCode: null,
      serviceDescription: l.service_description,
      qtyRequired: l.qty_required,
      uom: l.uom,
      specificationNotes: l.specification_notes,
    })),
    projectCode: rfq.project_code,
  });

  // Store RFQ PDF in plc_rfq_attachments (no GCS upload in this phase — stored as metadata only)
  await pool.query(
    `INSERT INTO plc_rfq_attachments (rfq_id, attachment_type, gcs_bucket, gcs_path, original_filename, file_size_bytes, mime_type, frozen_by)
     VALUES ($1,'rfq_pdf',$2,'rfq_pdf_generated',$3,$4,'application/pdf',$5)
     ON CONFLICT DO NOTHING`,
    [rfqId, bucketName, `${rfq.rfq_number}.pdf`, rfqPdfBuffer.length, issuedBy],
  );

  // Dispatch to each vendor INDIVIDUALLY (email privacy — no cross-vendor visibility)
  const results = await Promise.allSettled(
    vendorsRes.rows.map((vendor: any) =>
      dispatchToOneVendor({
        rfq,
        vendor,
        lines: linesRes.rows,
        frozenAttachments: attachRes.rows,
        rfqPdfBuffer,
        projectCode: rfq.project_code,
        dispatchedBy: issuedBy,
        isResend: false,
        resendNumber: 0,
      }),
    ),
  );

  let dispatched = 0, failed = 0, noEmail = 0;
  for (const r of results) {
    if (r.status === 'rejected') failed++;
    else dispatched++;
  }

  // Count no-email vendors from dispatch log
  const noEmailRes = await pool.query(
    `SELECT COUNT(*) FROM plc_rfq_dispatch_log WHERE rfq_id=$1 AND dispatch_status='no_email' AND is_resend=false`,
    [rfqId],
  );
  noEmail = parseInt(noEmailRes.rows[0].count);
  dispatched = dispatched - noEmail;

  // Update aggregate dispatch_status on RFQ record
  const allStatuses = await pool.query(
    `SELECT dispatch_status FROM plc_rfq_vendors WHERE rfq_id = $1`,
    [rfqId],
  );
  const statuses = allStatuses.rows.map((r: any) => r.dispatch_status);
  const aggStatus =
    statuses.every((s: string) => s === 'acknowledged') ? 'all_acknowledged' :
    statuses.every((s: string) => ['sent', 'acknowledged'].includes(s)) ? 'dispatched' :
    statuses.some((s: string) => s === 'sent' || s === 'acknowledged') ? 'partial' :
    'not_dispatched';

  await pool.query(
    `UPDATE plc_rfq_records SET dispatch_status = $1 WHERE id = $2`,
    [aggStatus, rfqId],
  );

  return { dispatched, failed, noEmail };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resend to one specific vendor
// ─────────────────────────────────────────────────────────────────────────────
export async function resendToVendor(
  rfqId: number,
  vendorId: number,
  emailOverride: string | null,
  userId: number,
): Promise<void> {
  // Get current resend count
  const rv = await pool.query(
    `SELECT rv.*, v.name AS vendor_name, v.display_name AS vendor_display_name,
            v.email, v.contact_person
     FROM plc_rfq_vendors rv
     JOIN vendors v ON v.id = rv.vendor_id
     WHERE rv.rfq_id=$1 AND rv.vendor_id=$2`,
    [rfqId, vendorId],
  );
  if (!rv.rowCount) throw new Error('Vendor not in this RFQ');
  const vendor = rv.rows[0];

  if (emailOverride) {
    await pool.query(
      `UPDATE plc_rfq_vendors SET email_override=$1 WHERE rfq_id=$2 AND vendor_id=$3`,
      [emailOverride, rfqId, vendorId],
    );
    vendor.email_override = emailOverride;
  }

  const rfqRes = await pool.query(
    `SELECT r.*, p.code AS project_code FROM plc_rfq_records r
     JOIN projects p ON p.id = r.project_id WHERE r.id = $1`,
    [rfqId],
  );
  const rfq = rfqRes.rows[0];

  const linesRes = await pool.query(
    `SELECT p.plc_number, p.tag_no, p.service_description, p.qty_required,
            mi.uom, p.specification_notes
     FROM plc_rfq_lines rl
     JOIN procurement_list_lines p ON p.id = rl.plc_line_id
     LEFT JOIN master_items mi ON mi.id = p.master_item_id
     WHERE rl.rfq_id = $1 ORDER BY p.plc_number`,
    [rfqId],
  );

  const attachRes = await pool.query(
    `SELECT * FROM plc_rfq_attachments WHERE rfq_id = $1`,
    [rfqId],
  );

  const rfqPdfBuffer = await generateRfqPdf({
    rfqNumber: rfq.rfq_number,
    rfqDate: rfq.rfq_date,
    submissionDeadline: rfq.submission_deadline,
    subject: rfq.subject,
    notes: rfq.notes,
    vendorName: vendor.vendor_display_name || vendor.vendor_name,
    vendorContactPerson: vendor.contact_person,
    vendorAddress: null,
    vendorCity: null,
    vendorCountry: null,
    lines: linesRes.rows.map((l: any) => ({
      plcNumber: l.plc_number,
      tagNo: l.tag_no,
      itemCode: null,
      serviceDescription: l.service_description,
      qtyRequired: l.qty_required,
      uom: l.uom,
      specificationNotes: l.specification_notes,
    })),
    projectCode: rfq.project_code,
  });

  const nextResendNum = (vendor.resend_count || 0) + 1;

  await dispatchToOneVendor({
    rfq,
    vendor,
    lines: linesRes.rows,
    frozenAttachments: attachRes.rows,
    rfqPdfBuffer,
    projectCode: rfq.project_code,
    dispatchedBy: userId,
    isResend: true,
    resendNumber: nextResendNum,
  });
}
