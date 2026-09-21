import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { expect, it } from 'vitest';
import { P1CandidatePanel, P1CandidateResults } from '../client/src/components/ecr-pre-pilot/p1-candidate-panel';
import { build } from 'esbuild';
import { resolve } from 'node:path';

it('mounts the real panel: slow polling, both phases, blocked input, retry and design isolation (GET-only intercepted API)', async () => {
  const compiled = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { P1CandidatePanel } from './client/src/components/ecr-pre-pilot/p1-candidate-panel';
      const root = createRoot(document.getElementById('root'));
      window.mount = id => root.render(React.createElement(P1CandidatePanel, {designId:id, refreshToken:0}));
      window.mount(236);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    alias: { '@': resolve('client/src') },
  });
  const browser = await puppeteer.launch({
    executablePath: execSync('command -v chromium || command -v chromium-browser', { encoding: 'utf8' }).trim(),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    let phase = 'rrbo-continuous-nmp-dispersed';
    let temperature = 40;
    let failure = false;
    let historyFailure = false;
    let delay = 5600; // Longer than polling interval: previously every response was discarded.
    let posts = 0;
    const pending: Promise<void>[] = [];
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.isNavigationRequest()) { void req.respond({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }); return; }
      if (!req.url().includes('/api/ecr-pre-pilot/designs/')) { void req.abort(); return; }
      if (req.method() !== 'GET') { posts++; void req.abort(); return; }
      const isBasis = req.url().endsWith('/basis');
      const body = isBasis
        ? { sourceSnapshotHash: 'controlled-saved-snapshot', methodVersion: 'controlled-method', basis: { phaseConfiguration: phase, operatingTemperatureC: temperature } }
        : [];
      const fails = isBasis ? failure : historyFailure;
      pending.push((async () => {
        await new Promise(done => setTimeout(done, delay));
        await req.respond({ status: fails ? 422 : 200, contentType: 'application/json', body: JSON.stringify(fails ? { error: 'CONTROLLED_LOAD_FAILURE' } : body) }).catch(() => {});
      })());
    });
    await page.goto('http://panel-fixture.test/');
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
    const enabled = () => page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Run Stage 3' && !b.disabled));
    const blocked = () => page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Run Stage 3' && b.disabled));
    const mount = (id: number) => page.evaluate(id => (window as any).mount(id), id);
    await page.waitForSelector('[role=status]');
    await enabled();
    expect(await page.$eval('body', e => e.textContent)).toContain('40 °C');
    // Polling retains the already validated basis and does not disable the action.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForSelector('[role=status]');
    await enabled();
    await page.waitForFunction(() => !document.querySelector('[role=status]'));
    delay = 0;
    phase = 'nmp-continuous-rrbo-dispersed'; temperature = 50;
    await mount(237); await enabled();
    expect(await page.$eval('body', e => e.textContent)).toContain('existing NMP-continuous method');
    phase = 'invalid-phase';
    await mount(238);
    await page.waitForFunction(() => document.body.textContent?.includes('Stage 3 requires an explicit, valid saved phase.'));
    await blocked();
    phase = 'rrbo-continuous-nmp-dispersed'; temperature = 35;
    await mount(239);
    await page.waitForFunction(() => document.body.textContent?.includes('35 °C'));
    await blocked();
    temperature = 40; failure = true;
    await mount(240); await page.waitForSelector('[role=alert]'); await blocked();
    failure = false;
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Retry loading')!.click());
    await enabled();
    historyFailure = true;
    await mount(241); await page.waitForSelector('[role=alert]');
    expect(await page.$eval('body', e => e.textContent)).toContain('40 °C');
    await blocked(); // History failure is explicit, not silently treated as no running jobs.
    historyFailure = false;
    delay = 500;
    phase = 'rrbo-continuous-nmp-dispersed';
    await mount(242);
    await page.waitForSelector('[role=status]');
    await new Promise(done => setTimeout(done, 50));
    delay = 0; phase = 'nmp-continuous-rrbo-dispersed'; temperature = 55;
    await mount(243); await enabled();
    await new Promise(done => setTimeout(done, 600));
    expect(await page.$eval('body', e => e.textContent)).toContain('55 °C');
    expect(await page.$eval('body', e => e.textContent)).not.toContain('corrected P1 RRBO-continuous method');
    expect(posts).toBe(0);
    await Promise.all(pending);
  } finally { await browser.close(); }
}, 60_000);

it('screenshots read-only SSR P1 components with the existing isolated report, without HTTP or calculation', async () => {
  const input = JSON.parse(readFileSync('deliverables/rrbo-stage3-candidate/input.json', 'utf8'));
  const result = JSON.parse(readFileSync('deliverables/rrbo-stage3-candidate/result.json', 'utf8'));
  const run = { id: 'read-only-existing-report-fixture', result, basis: input.basis, phaseConfiguration: input.basis.phaseConfiguration,
    sourceSnapshotHash: input.provenance.sourceSnapshotHash, propertyTemperatureC: input.basis.operatingTemperatureC };
  const markup = renderToStaticMarkup(React.createElement('main', { className: 'mx-auto max-w-7xl p-4' },
    React.createElement('h1', { className: 'mb-3 font-semibold' }, 'Read-only visual fixture — existing isolated report, not a new app run'),
    React.createElement(P1CandidatePanel, { designId: null, refreshToken: 0 }),
    React.createElement(P1CandidateResults, { run })));
  const directory = mkdtempSync(join(tmpdir(), 'p1-browser-'));
  const cssPath = join(directory, 'fixture.css');
  execFileSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-i', 'client/src/index.css', '-o', cssPath,
    '--content', 'client/src/components/ecr-pre-pilot/p1-candidate-panel.tsx,client/src/components/ui/button.tsx,tests/rrbo-p1-candidate-browser.test.ts'], { stdio: 'pipe' });
  const browser = await puppeteer.launch({
    executablePath: execSync('command -v chromium || command -v chromium-browser', { encoding: 'utf8' }).trim(),
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => void request.abort()); // No app/API/network access.
    await page.setViewport({ width: 1440, height: 1100 });
    await page.setContent(`<!doctype html><html><head><style>${readFileSync(cssPath, 'utf8')}</style></head><body>${markup}</body></html>`);
    expect(await page.$eval('body', element => element.textContent)).toContain('No geometry selected');
    expect(await page.$$eval('table:first-of-type tbody tr', elements => elements.length)).toBeGreaterThan(13);
    await page.screenshot({ path: '/tmp/rrbo-p1-candidate-desktop.png', fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/rrbo-p1-candidate-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await browser.close(); }
}, 60_000);