import { execSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser, type HTTPRequest } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";

const stage4Path = "/design-software/ecr-pre-pilot-design/stage-4";

type JobFixture = {
  jobId: string;
  status: "running" | "blocked";
  progress: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
};

const commonProgress = {
  phase: "BRANCH_CONTINUATION",
  message: "Qualifying candidate",
  completed: 4,
  total: 10,
  iteration: 18,
  residual: 2.5e-6,
  residualKind: "L2",
  elapsedSeconds: 42,
  heightCandidateM: 2.4,
  continuationLambda: 1e-8,
  continuationTrial: 7,
  acceptedLowerLambda: 1e-8,
  rejectedUpperLambda: 1.25e-8,
  rawFvResidualMolS: 2e-8,
  scaledFvResidual: 8e-8,
  maximumOriginalJobBGateResidual: 4e-8,
  minimumFlowMolS: -3e-10,
  rawFvGatePassed: true,
  scaledFvGatePassed: true,
  originalJobBGatePassed: true,
  strictPositivityPassed: false,
  accepted: false,
};

const runningFixture: JobFixture = {
  jobId: "job-c-browser-running",
  status: "running",
  progress: commonProgress,
  result: null,
  error: null,
};

const blockedFixture: JobFixture = {
  jobId: "job-c-browser-blocked",
  status: "blocked",
  progress: {
    ...commonProgress,
    phase: "TERMINAL",
    message: "Candidate rejected by strict positivity",
    completed: 10,
  },
  result: {
    status: "BLOCKED_PRELIMINARY_JOB_C",
    blockers: ["STRICT_POSITIVITY_NOT_SATISFIED"],
  },
  error: "JOB_C_CANDIDATE_REJECTED",
};

let vite: ViteDevServer;
let browser: Browser;
let origin: string;
let previousReplId: string | undefined;

function chromiumPath(): string {
  return execSync("command -v chromium || command -v chromium-browser", { encoding: "utf8" }).trim();
}

async function openAuthenticatedStage4(fixture: JobFixture) {
  const page = await browser.newPage();
  page.on("pageerror", error => console.error(`[browser pageerror] ${error.message}`));
  page.on("requestfailed", request => console.error(`[browser request failed] ${request.url()} ${request.failure()?.errorText ?? ""}`));
  await page.setRequestInterception(true);
  page.on("request", (request: HTTPRequest) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/user") {
      void request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 9001,
          username: "browser-regression-reviewer",
          name: "Browser Regression Reviewer",
          role: "Superuser",
          passwordNeedsUpdate: false,
          requiresPasswordUpdate: false,
        }),
      });
      return;
    }
    if (url.pathname === "/api/2fa/status") {
      void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true }) });
      return;
    }
    if (url.pathname === "/api/attendance/status") {
      void request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hasRecord: true,
          record: { checkInTime: "2026-09-09T08:00:00.000Z" },
          canCheckIn: false,
          canCheckOut: true,
        }),
      });
      return;
    }
    if (url.pathname === "/api/ecr-pre-pilot/designs/latest-saved") {
      void request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: 47, projectNumber: "ECR-BROWSER-47" }),
      });
      return;
    }
    if (url.pathname === "/api/usage-tracker/summary") {
      void request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          monthlyTotal: 0,
          monthlyLimit: 100,
          monthlyPercent: 0,
          dailyTotal: 0,
          dailyLimit: 10,
          dailyPercent: 0,
          remainingDaily: 10,
          lastCumulativeTotal: 0,
          warningLevel: "none",
          softBlockEnabled: false,
          daysInMonth: 30,
          dayOfMonth: 1,
        }),
      });
      return;
    }
    if (url.pathname === "/api/ecr-pre-pilot/designs/47/job-c/jobs/latest"
      || url.pathname === `/api/ecr-pre-pilot/designs/47/job-c/jobs/${fixture.jobId}`) {
      void request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture),
      });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      void request.respond({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    void request.continue();
  });
  await page.goto(`${origin}${stage4Path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="job-c-governing-gates"]', { visible: true, timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe(stage4Path);
  return page;
}

async function visibleText(page: Awaited<ReturnType<typeof openAuthenticatedStage4>>, selector: string) {
  return page.$eval(selector, element => {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || element.getBoundingClientRect().height === 0) {
      throw new Error(`${selector} is not visible`);
    }
    return (element as HTMLElement).innerText.replace(/\s+/g, " ").trim();
  });
}

// Job C is retained as historical scientific UI code but is no longer mounted
// by the active Stage 4 route. Its former active-route browser regressions are
// intentionally retired with that workflow.
describe.skip("retired ECR pre-pilot authenticated Job C gate browser regressions", () => {
  beforeAll(async () => {
    previousReplId = process.env.REPL_ID;
    delete process.env.REPL_ID;
    vite = await createServer({
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "error",
    });
    await vite.listen();
    const address = vite.httpServer?.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
    browser = await puppeteer.launch({
      executablePath: chromiumPath(),
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await vite?.close();
    if (previousReplId === undefined) delete process.env.REPL_ID;
    else process.env.REPL_ID = previousReplId;
  });

  it("renders all live gates, percentages, limiting gate, and bracket", async () => {
    const page = await openAuthenticatedStage4(runningFixture);
    try {
      const panel = await visibleText(page, '[data-testid="job-c-governing-gates"]');
      expect(panel).toContain("Maximum raw FV residual 2.00e-8 · 20% of 1.000e-7 · PASS");
      expect(panel).toContain("Scaled FV residual 8.00e-8 · 80% of 1.000e-7 · PASS");
      expect(panel).toContain("Original Job B interface residual 4.00e-8 · 40% of 1.000e-7 · PASS");
      expect(panel).toContain("Strict positivity minimum flow -3.00e-10 mol/s · FAIL");
      expect(panel).toContain("Current limiting gate: Strict positivity");
      expect(panel).toContain("Accepted/rejected λ bracket: [1.000e-8, 1.250e-8]");

      const pageText = await visibleText(page, "main");
      expect(pageText).toContain("L2 diagnostic (not an acceptance gate):");
      expect(pageText).toContain("A rejected numerical candidate does not establish physical infeasibility.");
    } finally {
      await page.close();
    }
  }, 60_000);

  it("keeps terminal blocked telemetry visible without claiming physical infeasibility", async () => {
    const page = await openAuthenticatedStage4(blockedFixture);
    try {
      const pageText = await visibleText(page, "main");
      const panel = await visibleText(page, '[data-testid="job-c-governing-gates"]');
      expect(pageText).toContain("Job C: blocked");
      expect(panel).toMatch(/governing job c gates/i);
      expect(panel).toContain("20% of 1.000e-7");
      expect(panel).toContain("80% of 1.000e-7");
      expect(panel).toContain("40% of 1.000e-7");
      expect(panel).toContain("Current limiting gate: Strict positivity");
      expect(panel).toContain("Accepted/rejected λ bracket: [1.000e-8, 1.250e-8]");
      expect(pageText).toContain("L2 diagnostic (not an acceptance gate):");
      expect(pageText).toContain("does not establish physical infeasibility");
      expect(pageText).not.toMatch(/physically infeasible|physical infeasibility established/i);
    } finally {
      await page.close();
    }
  }, 60_000);
});