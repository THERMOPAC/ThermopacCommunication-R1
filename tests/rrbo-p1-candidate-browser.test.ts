import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { expect, it } from 'vitest';
import { P1CandidatePanel, P1CandidateResults } from '../client/src/components/ecr-pre-pilot/p1-candidate-panel';

it('screenshots read-only SSR P1 components with the existing isolated report, without HTTP or calculation', async () => {
  const input = JSON.parse(readFileSync('deliverables/rrbo-stage3-candidate/input.json', 'utf8'));
  const result = JSON.parse(readFileSync('deliverables/rrbo-stage3-candidate/result.json', 'utf8'));
  const run = { id: 'read-only-existing-report-fixture', result, basis: input.basis,
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