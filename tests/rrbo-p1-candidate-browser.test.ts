import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { expect, it } from 'vitest';
import { P1CandidatePanel, P1CandidateResults } from '../client/src/components/ecr-pre-pilot/p1-candidate-panel';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { buildSelectionHtml, buildSelectionCsv } from '../client/src/components/ecr-pre-pilot/p1-selection-download';
import { resolveAutomaticHydraulicSelection } from '../server/ecr-pre-pilot/automatic-hydraulic-selection';

it('exports actual saved 700 mm selection, full references, provenance and limitations safely without scientific execution', () => {
  const saved = JSON.parse(readFileSync('deliverables/p1-research-regression/integrated-saved-artifact.json', 'utf8'));
  const run = { ...saved.metadata, basis: saved.stage1Basis, result: saved.result, immutableHash: saved.ledgerImmutableHash };
  const automaticSelection = resolveAutomaticHydraulicSelection(run, saved.currentStage1Hash);
  const summary = { ...run, result: { engine: run.result.engine }, automaticSelection, privateUserEmail: 'do-not-export@example.test' };
  const html = buildSelectionHtml(summary);
  expect(automaticSelection.selected.geometry.columnDiameterM).toBe(.7);
  expect(html).toContain('<td>Column diameter (m)</td><td>0.7</td>');
  expect(html).toContain(automaticSelection.immutableHash);
  expect(html).toContain(automaticSelection.policy.version);
  expect(html).toContain('No RPM-window criterion');
  expect(html).toContain('not proof of convexity or a unique physical optimum');
  expect(html).toContain('mass-transfer adequacy');
  expect(html).toContain('UNKNOWN');
  expect(html).not.toContain('do-not-export@example.test');
  const csv = buildSelectionCsv(summary);
  expect(csv.trim().split('\r\n')).toHaveLength(automaticSelection.references.length + 1);
  for (const p of automaticSelection.references) {
    expect(html).toContain(`<td>${p.areaM2}</td>`);
    expect(csv).toContain(`"${p.geometry.columnDiameterM}","${p.feasibleConfigurationCount}","${p.trial.rpm}"`);
  }
  const unsafe = structuredClone(summary);
  unsafe.automaticSelection.rationale = '<script>alert("x")</script>&';
  unsafe.automaticSelection.references[0].geometry.freeArea = '=HYPERLINK("bad")';
  unsafe.automaticSelection.references[0].normalizedScore = -0.123;
  expect(buildSelectionHtml(unsafe)).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;');
  expect(buildSelectionHtml(unsafe)).not.toContain('<script>');
  expect(buildSelectionCsv(unsafe)).toContain(`"'=HYPERLINK(""bad"")"`);
  expect(buildSelectionCsv(unsafe)).toContain('"-0.123"');
  expect(buildSelectionCsv(unsafe)).not.toContain(`"'-0.123"`);
  const blocked = { ...summary, automaticSelection: { ...automaticSelection, selected: null, references: [], status: 'NO_ELIGIBLE_HYDRAULIC_CONFIGURATION' } };
  expect(buildSelectionHtml(blocked)).toContain('Stage 4 is blocked');
  expect(() => buildSelectionHtml({ ...summary, stale: true })).toThrow('current verified');
  expect(() => buildSelectionHtml({})).toThrow('current verified');
});

it('mounts the real panel: slow polling, both phases, blocked input, retry and design isolation (GET-only intercepted API)', async () => {
  const compiled = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { P1CandidatePanel } from './client/src/components/ecr-pre-pilot/p1-candidate-panel';
      import Stage4PrePilotSizingPanel from './client/src/components/ecr-pre-pilot/stage4-pre-pilot-sizing-panel';
      const root = createRoot(document.getElementById('root'));
      window.mount = id => root.render(React.createElement(P1CandidatePanel, {designId:id, refreshToken:0}));
      window.mountStage4 = id => root.render(React.createElement(Stage4PrePilotSizingPanel, {designId:id}));
      window.mount(236);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' },
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
    let summaryFailure = false;
    let summaryStale = false;
    const fullDetailRequests: string[] = [];
    let summaryRequests = 0;
    let delay = 5600; // Longer than polling interval: previously every response was discarded.
    let posts = 0;
    let postedBody: any = null;
    let basisHash = 'controlled-saved-snapshot';
    let candidateHistory: any[] = [];
    const candidateDetails = new Map<string, any>();
    const pending: Promise<void>[] = [];
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.isNavigationRequest()) { void req.respond({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }); return; }
      if (!req.url().includes('/api/ecr-pre-pilot/designs/')) { void req.abort(); return; }
      if (req.url().includes('/stage4/pre-pilot-sizing/latest')) {
        void req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({
          status: 'CALCULATED', mainOutputs: { diameterM: .7, activeHeightM: 4.2 },
          hetsSizing: { sizingMethod: 'ADOPTED_COMPARTMENT_EFFICIENCY', stage3HydraulicColumnDiameterM: .7,
            physicalCompartmentHeightM: .21, installedActiveHeightM: 4.2 },
          selectedStage3Hydraulics: { source: 'AUTOMATIC_PRELIMINARY_P1_SELECTION', diameterM: .7,
            compartmentHeightM: .21, automaticSelection: { policy: { version: 'controlled-auto-policy' },
              source: { candidateId: 'latest-match' } } },
        }) }); return;
      }
      if (req.method() === 'POST') {
        posts++; postedBody = JSON.parse(req.postData() || '{}');
        void req.respond({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'submitted', status: 'running' }) });
        return;
      }
      if (req.method() !== 'GET') { void req.abort(); return; }
      const isBasis = req.url().endsWith('/basis');
      const isSummary = req.url().endsWith('/summary');
      const detailId = req.url().match(/\/stage3-candidates\/([^/?]+)(?:\/summary)?$/)?.[1];
      if (isSummary) summaryRequests++;
      else if (detailId && !isBasis) fullDetailRequests.push(detailId);
      const body = isBasis
        ? { sourceSnapshotHash: basisHash, methodVersion: 'controlled-method', basis: { phaseConfiguration: phase, operatingTemperatureC: temperature } }
        : detailId ? { ...candidateDetails.get(detailId), ...(isSummary ? { summaryOnly: true, stale: summaryStale } : {}) } : candidateHistory;
      if (isSummary && body.result) {
        const { status, engine, blockers } = body.result;
        body.result = { status, engine, blockers };
      }
      const fails = isBasis ? failure : isSummary ? summaryFailure : historyFailure;
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
    // The main result is always the newest candidate matching the current saved hash,
    // phase and method, regardless of a newer stale row or archive selection.
    phase = 'rrbo-continuous-nmp-dispersed'; temperature = 40; basisHash = 'latest-hash';
    const row = (id: string, sourceSnapshotHash: string, requestedAt: string, status = 'completed') => ({
      id, sourceSnapshotHash, requestedAt, createdAt: requestedAt, status,
      phaseConfiguration: phase, version: 'controlled-method',
    });
    candidateHistory = [
      row('older-match', 'latest-hash', '2025-01-01T00:00:00Z'),
      row('stale-newest', 'old-hash', '2025-01-03T00:00:00Z'),
      row('latest-match', 'latest-hash', '2025-01-02T00:00:00Z'),
    ];
    for (const item of candidateHistory) candidateDetails.set(item.id, {
      ...item, result: { status: item.id.toUpperCase(), blockers: [], orientationComparison: [], engine: { version: 'controlled-method' } },
      ...(item.id === 'latest-match' ? { automaticSelection: {
        status: 'AUTOMATIC_DISCRETE_KNEE_SELECTED', policy: { version: 'controlled-auto-policy' },
        selected: { geometry: { columnDiameterM: .7, rotorDiameterM: .231, compartmentHeightM: .21, freeArea: .4 },
          trial: { rpm: 30 }, loading: .3877, minimumHoldupGap: .1, minimumInterfacialAreaM2M3: 30 },
        references: [{ geometry: { columnDiameterM: .7, rotorDiameterM: .231, compartmentHeightM: .21, freeArea: .4 },
          trial: { rpm: 30 }, loading: .3877, areaM2: .3848451000647496, feasibleConfigurationCount: 1 }],
      } } : {}),
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.body.textContent?.includes('Latest calculation for current saved Stage 1: completed'));
    await page.waitForSelector('[data-testid=automatic-stage3-selection]');
    expect(await page.$eval('[data-testid=automatic-stage3-selection]', e => e.textContent)).toContain('Column D 0.7 m');
    expect(await page.$eval('[data-testid=automatic-stage3-selection]', e => e.textContent)).toContain('Why this diameter');
    expect(fullDetailRequests).toEqual([]);
    expect(posts).toBe(0); // Viewing persisted evidence automatically selects; no user choice or approval.
    // Actual mounted buttons produce browser download files from the summary, without any API request.
    const downloads = mkdtempSync(join(tmpdir(), 'p1-downloads-'));
    const session = await page.createCDPSession();
    await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const exportRequests: string[] = [];
    const recordExportRequest = (req: any) => { if (req.url().includes('/api/')) exportRequests.push(req.url()); };
    page.on('request', recordExportRequest);
    for (const [label, extension] of [['Download results (HTML)', 'html'], ['Download comparison (CSV)', 'csv']]) {
      await page.evaluate(label => [...document.querySelectorAll('button')].find(b => b.textContent === label)!.click(), label);
      const path = join(downloads, `stage3-hydraulic-selection-latest-match.${extension}`);
      await expect.poll(() => existsSync(path), { timeout: 2000, interval: 20 }).toBe(true);
      const downloaded = readFileSync(path, 'utf8');
      if (extension === 'html') {
        expect(downloaded).toContain('<td>Column diameter (m)</td><td>0.7</td>');
        expect(downloaded).toContain('controlled-auto-policy');
        expect(downloaded).toContain('No RPM-window criterion');
      } else {
        expect(downloaded).toContain('"0.7","1","30"');
        expect(downloaded).toContain('"Automatically selected"');
      }
    }
    page.off('request', recordExportRequest);
    expect(exportRequests).toEqual([]);
    expect(fullDetailRequests).toEqual([]);
    expect(posts).toBe(0);
    // A failed same-id summary must actually reload when Retry is clicked.
    summaryFailure = true;
    await mount(244);
    await page.waitForFunction(() => document.body.textContent?.includes('Current candidate: CONTROLLED_LOAD_FAILURE'));
    expect(await page.$('[data-testid=automatic-stage3-selection]')).toBeNull();
    const failedRequests = summaryRequests;
    summaryFailure = false;
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Retry loading')!.click());
    await page.waitForSelector('[data-testid=automatic-stage3-selection]');
    expect(summaryRequests).toBeGreaterThan(failedRequests);
    expect(fullDetailRequests).toEqual([]);
    // A stale verified response never appears as the blue current selection.
    summaryStale = true;
    await mount(245);
    await page.waitForFunction(() => document.body.textContent?.includes('candidate detail is stale'));
    expect(await page.$('[data-testid=automatic-stage3-selection]')).toBeNull();
    summaryStale = false;
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Retry loading')!.click());
    await page.waitForSelector('[data-testid=automatic-stage3-selection]');
    expect(posts).toBe(0);
    // Scientific grid and complete export remain lazy, separately from the summary.
    await page.evaluate(() => [...document.querySelectorAll('summary')].find(e => e.textContent?.startsWith('Historical engine selection provenance'))!.click());
    await page.waitForFunction(() => document.body.textContent?.includes('Historical engine result: LATEST-MATCH'));
    expect(fullDetailRequests).toEqual(['latest-match']);
    await page.evaluate(() => {
      URL.createObjectURL = blob => {
        (window as any).exportedCandidate = (blob as Blob).text();
        return 'blob:controlled-export';
      };
      HTMLAnchorElement.prototype.click = () => {};
      [...document.querySelectorAll('button')].find(b => b.textContent === 'Export complete candidate JSON')!.click();
    });
    expect(JSON.parse(await page.evaluate(() => (window as any).exportedCandidate))).toEqual(candidateDetails.get('latest-match'));
    await page.evaluate(() => [...document.querySelectorAll('summary')].find(e => e.textContent === 'Previous calculations (read-only)')!.click());
    await page.waitForFunction(() => document.body.textContent?.includes('Historical engine result: STALE-NEWEST'));
    expect(fullDetailRequests).toContain('stale-newest');
    await page.select('select[aria-label="Historical snapshot"]', 'older-match');
    expect(await page.$eval('body', e => e.textContent)).toContain('Latest calculation for current saved Stage 1: completed');
    // A newly inserted matching attempt automatically becomes current and is polled by its id.
    candidateHistory = [row('pending-match', 'latest-hash', '2025-01-04T00:00:00Z', 'running'), ...candidateHistory];
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.body.textContent?.includes('Latest calculation for current saved Stage 1: running'));
    expect(await page.$('[data-testid=automatic-stage3-selection]')).toBeNull();
    // Saving Stage 1 cannot leave the archive selection pinned as the current result.
    basisHash = 'saved-again';
    const savedAgain = row('saved-again-result', basisHash, '2025-01-05T00:00:00Z');
    candidateHistory = [savedAgain, ...candidateHistory.filter(item => item.id !== 'pending-match')];
    candidateDetails.set(savedAgain.id, { ...savedAgain, result: { status: 'SAVED-AGAIN', blockers: [], orientationComparison: [], engine: { version: 'controlled-method' } } });
    await page.evaluate(() => window.dispatchEvent(new Event('ecr-stage1-saved')));
    await page.waitForFunction(() => document.body.textContent?.includes('Latest calculation for current saved Stage 1: completed'));
    await page.waitForFunction(() => !document.body.textContent?.includes('Verifying saved candidate and loading automatic selection'));
    await page.evaluate(() => [...document.querySelectorAll('summary')].find(e => e.textContent?.startsWith('Historical engine selection provenance'))!.click());
    await page.waitForFunction(() => document.body.textContent?.includes('Historical engine result: SAVED-AGAIN'));
    // Stale history remains archive-only and never fills the current area.
    basisHash = 'no-candidate-for-this-save';
    await page.evaluate(() => window.dispatchEvent(new Event('ecr-stage1-saved')));
    await page.waitForFunction(() => document.body.textContent?.includes('No Stage 3 calculation for latest saved Stage 1. Run Stage 3.'));
    const submission = page.waitForRequest(request => request.method() === 'POST');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Run Stage 3')!.click());
    await submission;
    expect(postedBody).toEqual({ sourceSnapshotHash: 'no-candidate-for-this-save' });
    await Promise.all(pending);
    await page.evaluate(() => (window as any).mountStage4(236));
    await page.waitForSelector('[data-testid=stage4-automatic-source]');
    expect(await page.$eval('[data-testid=stage4-automatic-source]', e => e.textContent)).toContain('controlled-auto-policy');
    expect(await page.$eval('[data-testid=stage4-automatic-source]', e => e.textContent)).toContain('latest-match');
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
    expect(await page.$eval('body', element => element.textContent)).toContain('Legacy engine selected no geometry');
    expect(await page.$$eval('table:first-of-type tbody tr', elements => elements.length)).toBeGreaterThan(13);
    await page.screenshot({ path: '/tmp/rrbo-p1-candidate-desktop.png', fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/rrbo-p1-candidate-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await browser.close(); }
}, 60_000);