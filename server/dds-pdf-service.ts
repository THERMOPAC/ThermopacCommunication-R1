import { execSync } from 'child_process';
import { createHash } from 'crypto';
import puppeteer from 'puppeteer-core';
import { Storage } from '@google-cloud/storage';
import { bucketName } from './utils/storage-config';
import { resolveProjectGeoCodes } from './epc-coding';
import { resolveGcsPath } from './utils/gcs-path-resolver';
import { generateDdsHtml } from './dds-html-template';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { pool } from './db';

function getSystemChromiumPath(): string {
  try {
    return execSync('which chromium', { encoding: 'utf8' }).trim();
  } catch {
    return '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  }
}

/**
 * Returns a GCS Storage client.
 * Production: use ADC (metadata server) — explicit key causes invalid_grant.
 * Dev: use explicit GOOGLE_CLOUD_CREDENTIALS from env.
 */
function getUploadStorage(): Storage {
  if (process.env.NODE_ENV === 'production') {
    return new Storage();
  }
  try {
    const creds = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}');
    return new Storage({ projectId: creds.project_id, credentials: creds });
  } catch {
    return new Storage();
  }
}

export type PdfResult = { gcsPath: string } | { error: string };

/**
 * Generate a DDS PDF via puppeteer, upload to GCS, and return the GCS path.
 * On failure returns { error: message }.
 */
export async function generateAndUploadDdsPdf(
  sheetId: number,
  dwgControl: {
    project_id: number;
    item_code?: string | null;
    dwg_control_number?: string | null;
    revision_code?: string | null;
  }
): Promise<PdfResult> {
  try {
    const sheetResult = await db.execute(
      sql`SELECT * FROM design_data_sheets WHERE id = ${sheetId}`
    );
    const sheet = sheetResult.rows[0] as any;
    if (!sheet) return { error: `Sheet ${sheetId} not found` };

    // Ensure JSONB columns are parsed objects (neon driver may return as string)
    if (typeof sheet.general_data === 'string') {
      sheet.general_data = JSON.parse(sheet.general_data);
    }
    if (typeof sheet.mechanical_data === 'string') {
      sheet.mechanical_data = JSON.parse(sheet.mechanical_data);
    }
    if (typeof sheet.hazard_data === 'string') {
      sheet.hazard_data = JSON.parse(sheet.hazard_data);
    }

    const geo = await resolveProjectGeoCodes(dwgControl.project_id);

    const itemCode = dwgControl.item_code || 'UNKNOWN';
    const drawingNumber = dwgControl.dwg_control_number || 'UNKNOWN';
    const revision = dwgControl.revision_code || '00';

    // G1: Resolve canonical path from GCS Governance Rule (document_type='DDS').
    // Throws GcsGovernanceError if rule is missing/inactive or any token is unresolved.
    const gcsPath = await resolveGcsPath('DDS', {
      CC: geo.continentCode,
      CO: geo.countryCode,
      Cust: geo.customerCustToken,
      FY: geo.fyCode,
      NNN: geo.projectSeq,
      ItemCode: itemCode,
      DrawingNo: drawingNumber,
      rev: revision,
    });

    console.log('[DDS PDF] generating for sheet', sheetId, '| weight:', sheet.general_data?.weightEmptyOperatingHydro, '| path:', gcsPath);

    const html = generateDdsHtml(sheet, {
      drawingNumber,
      revisionCode: revision,
      generatedAt: new Date().toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      }),
    });

    const executablePath = getSystemChromiumPath();
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      executablePath,
      headless: true,
    });

    let pdfBuffer: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const rawPdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
      });
      pdfBuffer = Buffer.from(rawPdf);
    } finally {
      await browser.close();
    }

    const sha256 = createHash('sha256').update(pdfBuffer).digest('hex');

    // Use ADC in production, explicit creds in dev — matches pdf-stream pattern
    const uploadStorage = getUploadStorage();
    const file = uploadStorage.bucket(bucketName).file(gcsPath);
    await file.save(pdfBuffer, {
      contentType: 'application/pdf',
      metadata: {
        contentDisposition: `attachment; filename="${drawingNumber}_dds-rev-${revision}.pdf"`,
      },
    });

    console.log('[DDS PDF] uploaded to GCS:', gcsPath);

    // G2 + G3: Dual-Storage Policy — enqueue SAVE_FILE mirror job after GCS success
    try {
      const mirrorJobRes = await pool.query(
        `INSERT INTO document_agent_jobs
           (job_type, status, relative_path, file_url, file_name, expected_sha256,
            source_module, source_record_id, created_by)
         VALUES ('SAVE_FILE', 'pending', $1, NULL, $2, $3, 'design_data_sheets', $4, NULL)
         RETURNING id`,
        [gcsPath, `${drawingNumber}_dds-rev-${revision}.pdf`, sha256, sheetId],
      );
      const mirrorJobId = mirrorJobRes.rows[0].id as number;
      // G3: mark mirror_status on source record
      await pool.query(
        `UPDATE design_data_sheets SET mirror_status = 'pending', mirror_job_id = $1 WHERE id = $2`,
        [mirrorJobId, sheetId],
      );
    } catch (mirrorErr) {
      // Mirror failure NEVER invalidates the GCS copy (Dual-Storage Policy)
      console.error(`[DDS PDF] Mirror job enqueue failed for sheet ${sheetId} — GCS copy remains valid:`, mirrorErr);
    }

    return { gcsPath };
  } catch (err) {
    console.error('[DDS PDF] generation error:', err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
