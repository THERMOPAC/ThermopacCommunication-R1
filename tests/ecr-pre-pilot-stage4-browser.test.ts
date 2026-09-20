import { execSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import puppeteer, { type Browser, type HTTPRequest } from 'puppeteer-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

const stage4Path = '/design-software/ecr-pre-pilot-design/stage-4';
const latestEndpoint = '/api/ecr-pre-pilot/designs/47/stage4/pre-pilot-sizing/latest';
const calculateEndpoint = '/api/ecr-pre-pilot/designs/47/stage4/pre-pilot-sizing/calculate';

function hetsResult() {
  return {
    status: 'CALCULATED_COMPARTMENT_EFFICIENCY_PRE_PILOT_SIZING',
    classification: 'PRE-PILOT PREDICTIVE / SCREENING DESIGN',
    screeningNotice: 'PRE-PILOT SCREENING',
    calculationModel: 'ECR_STAGE4_ADOPTED_COMPARTMENT_EFFICIENCY_V1_FIXED_DESIGN_NT7_ETA0.40',
    implementation: {
      version: 'ECR_STAGE4_ADOPTED_COMPARTMENT_EFFICIENCY_V1_FIXED_DESIGN_NT7_ETA0.40',
    },
    designNt: { value: 7, provenance: 'STAGE4_FIXED_HETS_PRE_PILOT_DESIGN_NT' },
    actualStage2NtReference: { value: 5, status: 'AVAILABLE_REFERENCE_ONLY' },
    selectedStage3Hydraulics: {
      diameterM: .72,
      compartmentHeightM: .18,
      hcToColumn: .25,
      source: 'PERSISTED_STAGE3_OPTIMIZER_GEOMETRY_NO_STAGE4_RESELECTION',
    },
    mainOutputs: {
      diameterM: .72,
      overallEfficiency: .4,
      physicalCompartments: 18,
      activeHeightM: 3.24,
      requiredActiveHeightM: 3.24,
      installedActiveHeightM: 3.24,
    },
    hetsSizing: {
      sizingMethod: 'ADOPTED_COMPARTMENT_EFFICIENCY',
      designCompartmentEfficiency: .4,
      fixedDesignTheoreticalStages: 7,
      actualStage2TheoreticalStagesReference: 5,
      stage3HydraulicColumnDiameterM: .72,
      compartmentHeightRule: 'PERSISTED_STAGE3_SELECTED_hc',
      physicalCompartmentHeightM: .18,
      impliedInstalledHetsMPerTheoreticalStage: 3.24 / 7,
      requiredActiveHeightM: 3.24,
      requiredPhysicalCompartments: 18,
      installedActiveHeightM: 3.24,
      designStatus: 'PRE-PILOT SCREENING',
    },
    assumptions: [
      'Design average physical-compartment efficiency = 40% is an adopted pre-pilot engineering assumption.',
    ],
    calculation: { status: 'CALCULATED', progress: { phase: 'COMPLETE' }, lineageHash: 'hets-lineage' },
  };
}

function unrun() {
  return {
    status: 'UNRUN',
    classification: 'PRE-PILOT PREDICTIVE / SCREENING DESIGN',
    screeningNotice: 'PRE-PILOT SCREENING',
    mainOutputs: {
      diameterM: .974213, overallEfficiency: null, physicalCompartments: null, activeHeightM: null,
    },
    designNt: { value: 7, provenance: 'STAGE4_FIXED_HETS_PRE_PILOT_DESIGN_NT' },
    actualStage2NtReference: { value: 5, status: 'AVAILABLE_REFERENCE_ONLY' },
    selectedStage3Hydraulics: { diameterM: .974213 },
    calculation: { status: 'UNRUN', progress: { phase: 'NOT_RUN_EXPLICIT_CALCULATION_REQUIRED' } },
  };
}

let vite: ViteDevServer;
let browser: Browser;
let origin: string;
let currentStage4: Record<string, unknown>;
let actionRequests: Array<{ path: string; body: string }> = [];
let ecrMutationRequests: Array<{ method: string; path: string }> = [];
let previousReplId: string | undefined;

function chromiumPath(): string {
  return execSync('command -v chromium || command -v chromium-browser', { encoding: 'utf8' }).trim();
}

async function openStage4() {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request: HTTPRequest) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/ecr-pre-pilot/') && request.method() !== 'GET') {
      ecrMutationRequests.push({ method: request.method(), path: url.pathname });
    }
    const json = (status: number, body: unknown) => void request.respond({
      status, contentType: 'application/json', body: JSON.stringify(body),
    });
    if (url.pathname === '/api/user') {
      json(200, {
        id: 9001, username: 'stage4-browser-reviewer', name: 'Stage 4 Browser Reviewer',
        role: 'Superuser', passwordNeedsUpdate: false, requiresPasswordUpdate: false,
      });
      return;
    }
    if (url.pathname === '/api/2fa/status') {
      json(200, { enabled: true });
      return;
    }
    if (url.pathname === '/api/attendance/status') {
      json(200, {
        hasRecord: true, record: { checkInTime: '2026-09-09T08:00:00.000Z' },
        canCheckIn: false, canCheckOut: true,
      });
      return;
    }
    if (url.pathname === '/api/usage-tracker/summary') {
      json(200, {
        monthlyTotal: 0, monthlyLimit: 100, monthlyPercent: 0,
        dailyTotal: 0, dailyLimit: 10, dailyPercent: 0, remainingDaily: 10,
        lastCumulativeTotal: 0, warningLevel: 'none', softBlockEnabled: false,
        daysInMonth: 30, dayOfMonth: 1,
      });
      return;
    }
    if (url.pathname === '/api/ecr-pre-pilot/designs/latest-saved') {
      json(200, { id: 47, projectNumber: 'ECR-BROWSER-47' });
      return;
    }
    if (url.pathname === latestEndpoint && request.method() === 'GET') {
      json(200, currentStage4);
      return;
    }
    if (url.pathname === calculateEndpoint && request.method() === 'POST') {
      actionRequests.push({ path: url.pathname, body: request.postData() ?? '' });
      currentStage4 = hetsResult();
      json(200, currentStage4);
      return;
    }
    if (url.pathname.startsWith('/api/ecr-pre-pilot/')) {
      json(200, []);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      json(200, []);
      return;
    }
    void request.continue();
  });
  await page.goto(`${origin}${stage4Path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="stage4-pre-pilot-sizing"]', { visible: true, timeout: 30_000 });
  return page;
}

async function panelText(page: Awaited<ReturnType<typeof openStage4>>) {
  return page.$eval('[data-testid="stage4-pre-pilot-sizing"]', element =>
    (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
}

describe.sequential('ECR pre-pilot HETS Stage 4 browser integration', () => {
  beforeAll(async () => {
    previousReplId = process.env.REPL_ID;
    delete process.env.REPL_ID;
    vite = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    await vite.listen();
    const address = vite.httpServer?.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
    browser = await puppeteer.launch({
      executablePath: chromiumPath(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await vite?.close();
    if (previousReplId === undefined) delete process.env.REPL_ID;
    else process.env.REPL_ID = previousReplId;
  });

  it('renders the approved adopted-efficiency result card', async () => {
    actionRequests = [];
    ecrMutationRequests = [];
    currentStage4 = hetsResult();
    const page = await openStage4();
    try {
      await page.waitForSelector('[data-testid="stage4-hets-result"]', { visible: true, timeout: 30_000 });
      const text = await panelText(page);
      expect(text).toContain('Stage 4 Adopted-Efficiency Pre-Pilot Sizing');
      expect(text).toContain('Stage 4 fixed design Nₜ (physical sizing basis) 7');
      expect(text).toContain('Actual accepted Stage-2 Nₜ (reference only) 5');
      expect(text).toContain('Stage 3 hydraulic column diameter 0.720 m');
      expect(text).toContain('Physical compartment height 0.180 m');
      expect(text).toContain('Design average physical-compartment efficiency 40%');
      expect(text).toContain('Implied installed HETS (derived diagnostic only) 0.46286 m/theoretical stage');
      expect(text).toContain('Required active height 3.24 m');
      expect(text).toContain('Required physical compartments 18');
      expect(text).toContain('Installed active height 3.24 m');
      expect(text).toContain('adopted pre-pilot engineering assumption');
      expect(text).toContain('No outlet, recovery, target-compliance, or final-design claim is made');
      expect(text).not.toContain('Predicted primary raffinate outlet');
      expect(actionRequests).toHaveLength(0);
      expect(ecrMutationRequests).toHaveLength(0);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('keeps retired Job A/B/C history collapsed and read-only without background mutations', async () => {
    actionRequests = [];
    ecrMutationRequests = [];
    currentStage4 = hetsResult();
    const page = await openStage4();
    try {
      const history = await page.$('[data-testid="retired-stage4-history"]');
      expect(history).not.toBeNull();
      expect(await page.$eval(
        '[data-testid="retired-stage4-history"]',
        element => (element as HTMLDetailsElement).open,
      )).toBe(false);
      expect(await page.$eval('body', element => (element as HTMLElement).innerText))
        .toContain('Retired Job A/B/C and finite-rate history · read-only');

      const retiredExecuteControls = await page.$$eval('button', buttons =>
        buttons
          .map(button => button.textContent?.replace(/\s+/g, ' ').trim() ?? '')
          .filter(text => /Job[- ]?[ABC]|diagnostic|continuation|finite-rate|partial-transfer/i.test(text)),
      );
      expect(retiredExecuteControls).toEqual([]);
      expect(ecrMutationRequests).toEqual([]);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="stage4-pre-pilot-sizing"]', { visible: true, timeout: 30_000 });
      expect(ecrMutationRequests).toEqual([]);

      await page.click('[data-testid="retired-stage4-history"] > summary');
      await page.waitForSelector('[data-testid="retired-history-record"]', { visible: true, timeout: 5_000 });
      const expandedText = await page.$eval(
        '[data-testid="retired-stage4-history"]',
        element => (element as HTMLElement).innerText,
      );
      expect(expandedText).toContain('Retired — historical evidence only');
      expect(expandedText).toContain('can no longer be run, retried, resumed, stopped');
      expect(ecrMutationRequests).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('posts one empty synchronous Calculate request and shows the persisted card after reload', async () => {
    actionRequests = [];
    ecrMutationRequests = [];
    currentStage4 = unrun();
    const page = await openStage4();
    try {
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="stage4-pre-pilot-sizing"]')?.textContent?.includes(
          'No Stage 4 adopted-efficiency sizing has been run',
        ) === true, { timeout: 30_000 });
      await page.click('[data-testid="stage4-calculate"]');
      await page.waitForSelector('[data-testid="stage4-hets-result"]', { visible: true, timeout: 5_000 });
      expect(actionRequests).toEqual([{ path: calculateEndpoint, body: '{}' }]);
      expect(ecrMutationRequests).toEqual([{ method: 'POST', path: calculateEndpoint }]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="stage4-hets-result"]', { visible: true, timeout: 30_000 });
      expect(await panelText(page)).toContain('Installed active height 3.24 m');
    } finally {
      await page.close();
    }
  }, 60_000);
});