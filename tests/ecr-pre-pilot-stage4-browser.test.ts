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
    status: 'CALCULATED_HETS_PRE_PILOT_SCREENING',
    classification: 'PRE-PILOT PREDICTIVE / SCREENING DESIGN',
    screeningNotice: 'PRE-PILOT SCREENING',
    calculationModel: 'ECR_STAGE4_HETS_SCREENING_V2',
    calculatedNt: { value: 5, provenance: 'STAGE_2_CALCULATED_NT_SAME_LINEAGE' },
    selectedStage3Hydraulics: {
      diameterM: .974213,
      source: 'PERSISTED_STAGE3_HYDRAULIC_DIAGNOSTIC_POINT_NO_STAGE4_RESELECTION',
    },
    mainOutputs: {
      diameterM: .974213,
      overallEfficiency: .4871065,
      physicalCompartments: 11,
      activeHeightM: 5,
      requiredActiveHeightM: 5,
      installedActiveHeightM: 5.3581715,
    },
    hetsSizing: {
      stage2TheoreticalStages: 5,
      stage3HydraulicColumnDiameterM: .974213,
      compartmentHeightRule: '0.5D',
      physicalCompartmentHeightM: .4871065,
      screeningHetsMPerTheoreticalStage: 1,
      calculatedScreeningCompartmentEfficiency: .4871065,
      requiredActiveHeightM: 5,
      requiredPhysicalCompartments: 11,
      installedActiveHeightM: 5.3581715,
      designStatus: 'PRE-PILOT SCREENING',
    },
    assumptions: [
      'HETS = 1.0 m/theoretical stage is an explicit engineering screening assumption; its conservatism for the RRBO/NMP system is not established.',
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
    calculatedNt: { value: 5, provenance: 'STAGE_2_CALCULATED_NT_SAME_LINEAGE' },
    selectedStage3Hydraulics: { diameterM: .974213 },
    calculation: { status: 'UNRUN', progress: { phase: 'NOT_RUN_EXPLICIT_CALCULATION_REQUIRED' } },
  };
}

let vite: ViteDevServer;
let browser: Browser;
let origin: string;
let currentStage4: Record<string, unknown>;
let actionRequests: Array<{ path: string; body: string }> = [];
let previousReplId: string | undefined;

function chromiumPath(): string {
  return execSync('command -v chromium || command -v chromium-browser', { encoding: 'utf8' }).trim();
}

async function openStage4() {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request: HTTPRequest) => {
    const url = new URL(request.url());
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

  it('renders the approved HETS result card with required and installed heights distinct', async () => {
    actionRequests = [];
    currentStage4 = hetsResult();
    const page = await openStage4();
    try {
      await page.waitForSelector('[data-testid="stage4-hets-result"]', { visible: true, timeout: 30_000 });
      const text = await panelText(page);
      expect(text).toContain('Stage 4 HETS-Based Pre-Pilot Sizing');
      expect(text).toContain('Stage 2 theoretical stages 5');
      expect(text).toContain('Stage 3 hydraulic column diameter 0.974 m');
      expect(text).toContain('Physical compartment height 0.487 m');
      expect(text).toContain('Screening HETS 1.000 m/theoretical stage');
      expect(text).toContain('Calculated screening efficiency 48.7%');
      expect(text).toContain('Required active height 5.00 m');
      expect(text).toContain('Required physical compartments 11');
      expect(text).toContain('Installed active height 5.36 m');
      expect(text).toContain('conservatism for RRBO/NMP is not established');
      expect(text).toContain('No outlet, recovery, target-compliance, or final-design claim is made');
      expect(text).not.toContain('Predicted primary raffinate outlet');
      expect(actionRequests).toHaveLength(0);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('posts one empty synchronous Calculate request and shows the persisted card after reload', async () => {
    actionRequests = [];
    currentStage4 = unrun();
    const page = await openStage4();
    try {
      await page.waitForFunction(() =>
        document.querySelector('[data-testid="stage4-pre-pilot-sizing"]')?.textContent?.includes(
          'No Stage 4 HETS screening has been run',
        ) === true, { timeout: 30_000 });
      await page.click('[data-testid="stage4-calculate"]');
      await page.waitForSelector('[data-testid="stage4-hets-result"]', { visible: true, timeout: 5_000 });
      expect(actionRequests).toEqual([{ path: calculateEndpoint, body: '{}' }]);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="stage4-hets-result"]', { visible: true, timeout: 30_000 });
      expect(await panelText(page)).toContain('Installed active height 5.36 m');
    } finally {
      await page.close();
    }
  }, 60_000);
});