/**
 * DVS Step 1 — UI Screenshot capture via Puppeteer
 */
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function getChromiumPath(): string {
  try { return execSync('which chromium', { encoding: 'utf-8' }).trim(); } catch {}
  try { return execSync('which chromium-browser', { encoding: 'utf-8' }).trim(); } catch {}
  return '/run/current-system/sw/bin/chromium';
}

const OUT_DIR = '/tmp/dvs-screenshots';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const chromiumPath = getChromiumPath();
  console.log('Chromium path:', chromiumPath);

  const browser = await puppeteer.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // ── LOGIN ──────────────────────────────────────────────────────────────
  console.log('Logging in...');
  await page.goto('http://localhost:5000/auth', { waitUntil: 'networkidle0' });
  await page.type('input[name="username"], input[placeholder*="sername"], input[type="text"]', 'dvs_test_user');
  await page.type('input[type="password"]', 'TestPass@DVS1');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  console.log('Logged in, current URL:', page.url());

  // ── NAVIGATE TO DRAWING VERIFICATION ──────────────────────────────────
  console.log('Navigating to drawing verification page...');
  await page.goto('http://localhost:5000/design-management/drawing-verification', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 3000));

  // ── SCREENSHOT 1: REVISIONS LIST ──────────────────────────────────────
  const listPath = path.join(OUT_DIR, '1-revisions-list.png');
  await page.screenshot({ path: listPath, fullPage: false });
  console.log('✅ Screenshot 1 — Revisions list:', listPath);

  // ── SCREENSHOT 2: UPLOAD MODAL ────────────────────────────────────────
  console.log('Opening upload modal...');
  await page.click('button:has-text("Upload Drawing"), button').catch(async () => {
    // fallback: find upload button by text
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Upload')) {
        await btn.click();
        break;
      }
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  const modalPath = path.join(OUT_DIR, '2-upload-modal.png');
  await page.screenshot({ path: modalPath, fullPage: false });
  console.log('✅ Screenshot 2 — Upload modal:', modalPath);

  // Close modal
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 1000));

  // ── SCREENSHOT 3: DETAIL DIALOG ───────────────────────────────────────
  console.log('Opening detail dialog...');
  try {
    const rows = await page.$$('tr');
    if (rows.length > 1) {
      await rows[1].click();
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch {}

  const detailPath = path.join(OUT_DIR, '3-detail-dialog.png');
  await page.screenshot({ path: detailPath, fullPage: false });
  console.log('✅ Screenshot 3 — Detail dialog:', detailPath);

  await browser.close();
  console.log('\nAll screenshots saved to', OUT_DIR);
}

main().catch(err => {
  console.error('Screenshot error:', err);
  process.exit(1);
});
