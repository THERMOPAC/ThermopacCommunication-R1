import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig';

// Isolated component verification, NOT a live-app authentication bypass.
// Mount the production Stage5 component and drawing viewer with the actual
// read-only exported model. Only Layout is replaced; no application server runs.
async function main() {
  const tailwindConfig = loadConfig(`${process.cwd()}/tailwind.config.ts`);
  const dir = 'deliverables/stage5-current-269';
  const record = JSON.parse(await readFile(`${dir}/current-preview.json`, 'utf8'));
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import Stage5 from './client/src/pages/design-software/ecr-pre-pilot-design-stage-5-page';
      createRoot(document.getElementById('root')).render(<Stage5/>);`,
      loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'isolated-component-layout',
      setup(b) {
        b.onResolve({ filter: /^@\/components\/layout$/ }, () => ({ path: 'layout', namespace: 'isolated' }));
        b.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({
          contents: 'export default function Layout({children}) { return children; }', loader: 'jsx',
        }));
      },
    }],
  });
  const css = await postcss([tailwind({ ...tailwindConfig, content: [
    './client/src/pages/design-software/ecr-pre-pilot-design-stage-5-page.tsx',
    './client/src/components/ecr-pre-pilot/stage5-drawing-viewer.tsx',
    './client/src/components/ui/button.tsx',
  ] })]).process(await readFile('client/src/index.css', 'utf8'), { from: 'client/src/index.css' });
  const executablePath = execFileSync('sh', ['-c', 'command -v chromium || command -v chromium-browser'], { encoding: 'utf8' }).trim();
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
    await page.setContent('<!doctype html><html><head></head><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: css.css });
    // tsx preserves function names inside serialized Puppeteer callbacks.
    await page.addScriptTag({ content: 'window.__name = (fn) => fn;' });
    await page.evaluate((r) => {
      const w = window as any;
      w.__requests = []; w.__saved = false; w.__downloads = [];
      w.fetch = async (url: string, init: any = {}) => {
        const path = String(url), method = init.method ?? 'GET';
        w.__requests.push({ path, method, body: init.body });
        const reply = (body: unknown, type = 'application/json') =>
          new Response(type === 'application/json' ? JSON.stringify(body) : String(body), { status: 200, headers: { 'Content-Type': type } });
        if (path.endsWith('/latest-saved')) return reply({ id: 269 });
        if (path.includes('/basis?payload=summary')) return reply({ basis: r.basis, sourceHash: r.sourceHash });
        if (path.endsWith('/preview')) return w.__constructionError
          ? new Response(JSON.stringify({ error: 'R1_GEOMETRY_INCOMPATIBLE: isolated transport failure check' }),
            { status: 409, headers: { 'Content-Type': 'application/json' } })
          : reply(r.geometry);
        if (path.includes('/export.')) {
          w.__downloads.push(path);
          return reply(path.includes('.svg') ? r.drawings.ga : '%PDF-verification-transport-only', path.includes('.svg') ? 'image/svg+xml' : 'application/pdf');
        }
        if (path.includes('/revisions')) {
          if (method === 'POST') { w.__saved = true; return reply({ ...r, id: '900001', revision: 1 }); }
          if (/\/revisions\/900001/.test(path)) return reply({ ...r, id: '900001', revision: 1 });
          return reply([]);
        }
        throw new Error(`Unexpected isolated request: ${path}`);
      };
    }, record);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForSelector('[data-testid="stage5-drawing-ga"]', { timeout: 30000 }).catch(async error => {
      throw new Error(`${error.message}; body=${await page.evaluate(() => document.body.innerText)}`);
    });
    const readiness = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Save immutable revision'));
      return { saveEnabled: Boolean(button && !button.disabled), text: document.body.innerText,
        requests: (window as any).__requests };
    });
    if (!readiness.saveEnabled || !readiness.text.includes('4200') || !readiness.text.includes('Selected point only'))
      throw new Error('Actual current model did not reach preview/save-ready state.');
    await page.screenshot({ path: `${dir}/actual-component-preview.png`, fullPage: true });
    await page.screenshot({ path: `${dir}/actual-component-basis.png` });
    await (await page.$('[data-testid="stage5-drawing-ga"]'))!.screenshot({ path: `${dir}/actual-component-drawing.png` });
    await page.evaluate(() => {
      (window as any).__constructionError = true;
      Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Regenerate R1 preview'))!.click();
    });
    await page.waitForSelector('[data-testid="stage5-construction-error"]');
    const blocked = await page.evaluate(() => ({
      text: document.body.innerText,
      sourceFailure: Boolean(document.querySelector('[data-testid="stage5-source-error"]')),
      saveDisabled: Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Save immutable revision'))?.disabled,
    }));
    if (!blocked.text.includes('isolated transport failure check') || !blocked.text.includes('0.7')
      || blocked.sourceFailure || !blocked.saveDisabled)
      throw new Error('Construction failure did not preserve inherited basis and disable save separately.');
    await page.evaluate(() => {
      (window as any).__constructionError = false;
      Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Regenerate R1 preview'))!.click();
    });
    await page.waitForSelector('[data-testid="stage5-drawing-ga"]');
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Save immutable revision'))!.click());
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('PDF package')));
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('PDF package'))!.click());
    await page.waitForFunction(() => (window as any).__downloads.length === 1);
    await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('SVG view'))!.click());
    await page.waitForFunction(() => (window as any).__downloads.length === 2);
    const requests = await page.evaluate(() => (window as any).__requests);
    const save = requests.find((r: any) => r.method === 'POST' && r.path.includes('/revisions'));
    if (save.body !== JSON.stringify({ expectedSourceHash: record.sourceHash }))
      throw new Error('Save sent anything other than current expectedSourceHash.');
    await writeFile(`${dir}/browser-verification.json`, JSON.stringify({
      mode: 'ISOLATED_PRODUCTION_COMPONENT_REAL_CURRENT_MODEL_NO_BUSINESS_WRITES',
      saveAndExportTransport: 'SIMULATED ONLY; actual PDF generated separately by normal server exporter',
      sourceHash: record.sourceHash, previewBytes: Buffer.byteLength(JSON.stringify(record.geometry)),
      basisBytes: Buffer.byteLength(JSON.stringify({ basis: record.basis, sourceHash: record.sourceHash })),
      saveEnabled: readiness.saveEnabled, requests,
    }, null, 2));
    console.log('Production component mounted with actual current geometry; preview/save-ready and isolated save/export interactions passed.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });