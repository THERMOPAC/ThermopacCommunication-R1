import { execSync } from 'child_process';
import puppeteer from 'puppeteer-core';
import gcsClient, { bucketName } from './utils/storage-config';
import { buildDdsGcsPath, resolveProjectGeoCodes } from './epc-coding';
import { generateDdsHtml } from './dds-html-template';
import { db } from './db';
import { sql } from 'drizzle-orm';

function getSystemChromiumPath(): string {
  try {
    return execSync('which chromium', { encoding: 'utf8' }).trim();
  } catch {
    return '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
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

    const geo = await resolveProjectGeoCodes(dwgControl.project_id);

    const itemCode = dwgControl.item_code || 'UNKNOWN';
    const drawingNumber = dwgControl.dwg_control_number || 'UNKNOWN';
    const revision = dwgControl.revision_code || '00';

    const gcsPath = buildDdsGcsPath(
      geo.continentCode,
      geo.countryCode,
      geo.customerShortCode,
      geo.fyCode,
      geo.projectSeq,
      itemCode,
      drawingNumber,
      revision
    );

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

    const file = gcsClient.bucket(bucketName).file(gcsPath);
    await file.save(pdfBuffer, {
      contentType: 'application/pdf',
      metadata: {
        contentDisposition: `attachment; filename="${drawingNumber}_dds-rev-${revision}.pdf"`,
      },
    });

    return { gcsPath };
  } catch (err) {
    console.error('[DDS PDF] generation error:', err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Generate a short-lived GCS signed URL (15 min) for the DDS PDF.
 */
export async function getDdsPdfSignedUrl(gcsPath: string): Promise<string> {
  const [url] = await gcsClient
    .bucket(bucketName)
    .file(gcsPath)
    .getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    });
  return url;
}
