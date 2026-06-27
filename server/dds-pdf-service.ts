import { execSync } from 'child_process';
import puppeteer from 'puppeteer-core';
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

/**
 * Generates a DDS PDF on demand and returns the raw Buffer.
 * No GCS upload. No mirror job. Caller streams the buffer to the response.
 * On failure returns { error: message }.
 */
export async function generateDdsPdfBuffer(
  sheetId: number,
  meta: { drawingNumber: string; revision: string },
): Promise<Buffer | { error: string }> {
  try {
    const sheetResult = await db.execute(
      sql`SELECT * FROM design_data_sheets WHERE id = ${sheetId}`,
    );
    const sheet = sheetResult.rows[0] as any;
    if (!sheet) return { error: `Sheet ${sheetId} not found` };

    // Ensure JSONB columns are parsed objects (neon driver may return as string)
    if (typeof sheet.general_data === 'string')   sheet.general_data   = JSON.parse(sheet.general_data);
    if (typeof sheet.mechanical_data === 'string') sheet.mechanical_data = JSON.parse(sheet.mechanical_data);
    if (typeof sheet.hazard_data === 'string')     sheet.hazard_data     = JSON.parse(sheet.hazard_data);

    const html = generateDdsHtml(sheet, {
      drawingNumber: meta.drawingNumber,
      revisionCode:  meta.revision,
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

    return pdfBuffer;
  } catch (err) {
    console.error('[DDS PDF] generation error:', err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
