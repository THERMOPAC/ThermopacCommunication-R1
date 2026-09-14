import { execSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser, type HTTPRequest } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";

const stage4Path = "/design-software/ecr-pre-pilot-design/stage-4";
const stage4Endpoint = "/api/ecr-pre-pilot/designs/47/stage4/pre-pilot-sizing/latest";
const stage4CalculateEndpoint = "/api/ecr-pre-pilot/designs/47/stage4/pre-pilot-sizing/calculate";
const stage4RetryEndpoint = "/api/ecr-pre-pilot/designs/47/stage4/pre-pilot-sizing/retry";
const stage4StopEndpoint = "/api/ecr-pre-pilot/designs/47/stage4/pre-pilot-sizing/stop";
const notice =
  "PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN";

type ResponseFixture = { status: number; body: Record<string, unknown> };

function selectedCase(c: number, values: {
  ec: number;
  pec: number;
  count: number | null;
  height: number | null;
  efficiency: number | null;
  outlet?: number[];
  termination: string;
}) {
  return {
    c,
    dispersion: {
      valueM2S: values.ec,
      compartmentPitchM: 0.4,
      c,
      equation: "Ec/(Vc hc)=screening",
    },
    continuousPecletPerPhysicalCompartment: values.pec,
    dispersedPecletPerPhysicalCompartment: {
      value: null,
      status: "INFINITE_ZERO_DISPERSION_LIMIT_ED_ZERO",
    },
    selected: values.count == null ? null : {
      physicalCompartments: values.count,
      activeHeightM: values.height,
      overallEfficiency: values.efficiency,
      oilRaffinateOutletMolarFlowMolS: values.outlet ?? null,
      targetCompliance: {
        allEvaluatedTargetsPassed: true,
        metrics: [{ name: "RECOVERY", actual: 97.5, target: 90, status: "PASS" }],
      },
    },
    attemptedPhysicalCompartments: [1, 2, 3, 4],
    nonconvergedPhysicalCounts: [],
    searchTermination: values.termination,
  };
}

function resultFixture(): Record<string, unknown> {
  return {
    status: "CALCULATED_PRE_PILOT_PREDICTIVE_SCREENING",
    classification: notice,
    screeningNotice: notice,
    mainOutputs: {
      diameterM: 0.8,
      overallEfficiency: 0.75,
      physicalCompartments: 4,
      activeHeightM: 1.6,
    },
    calculatedNt: {
      value: 3,
      provenance: "STAGE_2_CALCULATED_NT_SAME_LINEAGE",
      stage2JobId: "stage-2-accepted",
    },
    selectedStage3Hydraulics: {
      source: "PERSISTED_STAGE3_HYDRAULIC_DIAGNOSTIC_POINT_NO_STAGE4_RESELECTION",
      diameterM: 0.8,
      rotorDiameterM: 0.4,
      rpm: 42,
      d32M: 0.001,
      operatingHoldup: 0.2,
      floodHoldup: 0.35,
      holdupMargin: 0.15,
      continuousSuperficialVelocityMS: 0.002,
      dispersedSuperficialVelocityMS: 0.003,
    },
    overallEfficiency: {
      value: 0.75,
      status: "CALCULATED_FROM_CONSERVED_TRANSFER_AND_AXIAL_DISPERSION_SCREENING",
      dependency: null,
    },
    physicalGeometry: {
      pitchM: 0.4,
      pitchAssumption: "PRE_PILOT_GEOMETRY_ASSUMPTION: physical compartment pitch = 0.5 × persisted Stage-3 column diameter",
    },
    physicalSizing: {
      primary: selectedCase(0.0126, {
        ec: 0.0015,
        pec: 0.53,
        count: 4,
        height: 1.6,
        efficiency: 0.75,
        outlet: [1, 2, 3, 4, 5, 6, 7],
        termination: "FIRST_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT",
      }),
      sensitivity: selectedCase(0.0105, {
        ec: 0.0013,
        pec: 0.61,
        count: 5,
        height: 2,
        efficiency: 0.6,
        termination: "FIRST_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT",
      }),
      materiality: {
        threshold: "same integer physical compartments and <=5% relative active-height and overall-efficiency difference",
        comparable: true,
        heightRelativeDifference: 0.2,
        efficiencyRelativeDifference: 0.2,
        robustToKhCoefficientSensitivity: false,
        classification: "NOT_ROBUST_OR_NOT_COMPARABLE",
        note: "Ec proximity alone is not a robustness criterion.",
      },
      assumptions: ["Ec uses the authorized screening expression; Ed=0."],
    },
    mixingAudit: {
      interfacialArea: { value: 1200, source: "screening", basis: "operating" },
      inputs: {
        rotorDiameterM: 0.4,
        continuousSuperficialVelocityMS: 0.002,
        dispersedSuperficialVelocityMS: 0.003,
      },
      continuousMixing: {
        value: 0.0015,
        selectedCorrelation: "KUMAR_HARTLAND_EC_SCREENING",
        candidate: "Kumar–Hartland continuous-phase axial-dispersion expression",
        equation: "Ec/(Vc hc)=screening",
      },
      dispersedMixing: { value: 0, warning: "Ed=0 screening assumption", source: "screening" },
      peclet: {
        continuous: { value: null },
        dispersed: { value: null, status: "ZERO_DISPERSION_LIMIT_INFINITE_FOR_POSITIVE_HEIGHT_AND_FLOW" },
      },
      applicability: {
        extrapolationAssessment: "screening",
        referenceStudy: "Asadollahzadeh (2017) supporting context only",
        warnings: [],
      },
      transferSolution: { detail: "Backend conserved physical-compartment screening result." },
      blockers: [],
    },
    assumptions: ["Stage 4 carries the persisted Stage-3 selected hydraulic point forward."],
  };
}

function noSolutionFixture(): Record<string, unknown> {
  const result = resultFixture();
  result.status = "NO_TARGET_COMPLIANT_PHYSICAL_SOLUTION";
  result.mainOutputs = {
    diameterM: 0.8,
    overallEfficiency: null,
    physicalCompartments: null,
    activeHeightM: null,
  };
  result.overallEfficiency = {
    value: null,
    status: "NOT_EXECUTED_REQUIRED_CLOSURE_MISSING",
    dependency: "NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND",
  };
  const physicalSizing = result.physicalSizing as Record<string, any>;
  physicalSizing.primary = selectedCase(0.0126, {
    ec: 0.0015,
    pec: 0.53,
    count: null,
    height: null,
    efficiency: null,
    termination: "NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND",
  });
  physicalSizing.sensitivity = selectedCase(0.0105, {
    ec: 0.0013,
    pec: 0.61,
    count: null,
    height: null,
    efficiency: null,
    termination: "NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND",
  });
  physicalSizing.materiality = {
    comparable: false,
    robustToKhCoefficientSensitivity: false,
    classification: "NOT_ROBUST_OR_NOT_COMPARABLE",
    note: "Ec proximity alone is not a robustness criterion.",
  };
  return result;
}

function dependencyBlockedFixture(): Record<string, unknown> {
  const result = resultFixture() as any;
  result.status = "DEPENDENCY_BLOCKED";
  result.mainOutputs = {
    diameterM: 0.8,
    overallEfficiency: null,
    physicalCompartments: null,
    activeHeightM: null,
  };
  result.overallEfficiency = {
    value: null,
    status: "NO_TARGET_COMPLIANT_PHYSICAL_SOLUTION",
    dependency: "NOT_STARTED_REQUIRED_PHYSICAL_CLOSURE_MISSING",
  };
  result.physicalSizing = {
    implementation: null,
    status: "DEPENDENCY_BLOCKED",
    primary: {
      ...selectedCase(0.0126, {
        ec: 0.0015,
        pec: 0.53,
        count: null,
        height: null,
        efficiency: null,
        termination: "NOT_STARTED_REQUIRED_PHYSICAL_CLOSURE_MISSING",
      }),
      attemptedPhysicalCompartments: [],
      nonconvergedPhysicalCounts: [],
    },
    sensitivity: {
      ...selectedCase(0.0105, {
        ec: 0.0013,
        pec: 0.61,
        count: null,
        height: null,
        efficiency: null,
        termination: "NOT_STARTED_REQUIRED_PHYSICAL_CLOSURE_MISSING",
      }),
      attemptedPhysicalCompartments: [],
      nonconvergedPhysicalCounts: [],
    },
    blockers: [
      "STAGE4_DYNAMIC_LOCAL_7C_EQUILIBRIUM_CLOSURE_REQUIRED",
      "STAGE4_NON_EQUIMOLAR_MULTICOMPONENT_TWO_FILM_INTERFACE_CLOSURE_REQUIRED",
      "STAGE4_INDEPENDENT_AXIAL_MESH_REFINEMENT_EVIDENCE_REQUIRED",
    ],
    materiality: {
      threshold: "same integer physical compartments and <=5% relative active-height and overall-efficiency difference",
      comparable: false,
      heightRelativeDifference: null,
      efficiencyRelativeDifference: null,
      robustToKhCoefficientSensitivity: false,
      classification: "NOT_COMPARABLE_PHYSICAL_SOLVES_NOT_AVAILABLE",
      note: "Ec proximity alone is not a robustness criterion.",
    },
    assumptions: [
      "K&H Ec and Ed=0 are screening inputs only; they do not close the missing local multicomponent physical-column model.",
    ],
  };
  return result;
}

let vite: ViteDevServer;
let browser: Browser;
let origin: string;
let stage4Response: ResponseFixture;
let stage4ActionRequests: Array<{ path: string; body: string }> = [];
let previousReplId: string | undefined;

function chromiumPath(): string {
  return execSync("command -v chromium || command -v chromium-browser", { encoding: "utf8" }).trim();
}

async function openStage4() {
  const page = await browser.newPage();
  const browserDiagnostics: string[] = [];
  page.on("console", message => browserDiagnostics.push(`[console:${message.type()}] ${message.text()}`));
  page.on("pageerror", error => browserDiagnostics.push(`[pageerror] ${error.message}`));
  page.on("requestfailed", request => browserDiagnostics.push(
    `[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ""}`,
  ));
  await page.setRequestInterception(true);
  page.on("request", (request: HTTPRequest) => {
    const url = new URL(request.url());
    const json = (status: number, body: unknown) => void request.respond({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    if (url.pathname === "/api/user") {
      json(200, {
        id: 9001,
        username: "stage4-browser-reviewer",
        name: "Stage 4 Browser Reviewer",
        role: "Superuser",
        passwordNeedsUpdate: false,
        requiresPasswordUpdate: false,
      });
      return;
    }
    if (url.pathname === "/api/2fa/status") {
      json(200, { enabled: true });
      return;
    }
    if (url.pathname === "/api/attendance/status") {
      json(200, { hasRecord: true, record: { checkInTime: "2026-09-09T08:00:00.000Z" }, canCheckIn: false, canCheckOut: true });
      return;
    }
    if (url.pathname === "/api/usage-tracker/summary") {
      json(200, {
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
      });
      return;
    }
    if (url.pathname === "/api/ecr-pre-pilot/designs/latest-saved") {
      json(200, { id: 47, projectNumber: "ECR-BROWSER-47" });
      return;
    }
    if ([stage4CalculateEndpoint, stage4RetryEndpoint, stage4StopEndpoint].includes(url.pathname)
      && request.method() === "POST") {
      stage4ActionRequests.push({ path: url.pathname, body: request.postData() ?? "" });
      const actionStatus = url.pathname === stage4StopEndpoint ? "INTERRUPTED" : "RUNNING";
      const actionPayload = url.pathname === stage4StopEndpoint
        ? {
          ...stage4Response.body,
          status: actionStatus,
          calculation: {
            status: actionStatus,
            progress: { phase: "FINITE_RATE_SOLVER_INTERRUPTED_EXPLICIT_RETRY_REQUIRED", completedCases: 0, totalCases: 2 },
          },
        }
        : {
        status: actionStatus,
        calculation: {
          status: actionStatus,
          progress: { phase: "PRIMARY_RUNNING", completedCases: 0, totalCases: 2 },
        },
        message: "Stage 4 calculation queued",
      };
      json(url.pathname === stage4StopEndpoint ? 200 : 202, actionPayload);
      return;
    }
    if (url.pathname === stage4Endpoint && request.method() === "GET") {
      json(stage4Response.status, stage4Response.body);
      return;
    }
    // These endpoints belong to the collapsed historical review area. Their
    // absence proves the integrated Stage 4 panel does not depend on them.
    if (url.pathname.startsWith("/api/ecr-pre-pilot/")
      && (url.pathname.includes("/job-c/")
        || url.pathname.includes("/partial-transfer-")
        || url.pathname.includes("/partial-transfer/"))) {
      json(404, { error: "LEGACY_ENDPOINT_NOT_USED_BY_INTEGRATED_STAGE4" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      json(200, []);
      return;
    }
    void request.continue();
  });
  await page.goto(`${origin}${stage4Path}`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector('[data-testid="stage4-pre-pilot-sizing"]', { visible: true, timeout: 30_000 });
  } catch (cause) {
    const body = await page.content().catch(() => "<body unavailable>");
    console.error(
      `[stage4 browser debug] url=${page.url()} title=${await page.title().catch(() => "")}\n`
      + `body=${body.slice(0, 4000)}\n${browserDiagnostics.join("\n")}`,
    );
    throw cause;
  }
  return page;
}

async function panelText(page: Awaited<ReturnType<typeof openStage4>>) {
  return page.$eval('[data-testid="stage4-pre-pilot-sizing"]', element =>
    (element as HTMLElement).innerText.replace(/\s+/g, " ").trim());
}

describe.sequential("ECR pre-pilot integrated Stage 4 browser regressions", () => {
  beforeAll(async () => {
    previousReplId = process.env.REPL_ID;
    delete process.env.REPL_ID;
    vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
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

  it("renders the dependency-blocked primary/sensitivity table without claiming physical sizing", async () => {
    stage4ActionRequests = [];
    stage4Response = { status: 200, body: dependencyBlockedFixture() };
    const page = await openStage4();
    try {
      await page.waitForFunction(
        () => document.querySelector('[data-testid="stage4-pre-pilot-sizing"]')?.textContent?.includes("c=0.0126") === true,
        { timeout: 30_000 },
      );
      const text = await panelText(page);
      expect(text).toContain(notice);
      expect(text).toContain("c=0.0126");
      expect(text).toContain("c=0.0105");
      expect(text).toContain("0.0015 m²/s");
      expect(text).toContain("0.0013 m²/s");
      expect(text).toContain("0.53");
      expect(text).toContain("0.61");
      expect(text).toContain("NOT ASSESSED — SOLVE NOT STARTED");
      expect(text).toContain("STAGE4_DYNAMIC_LOCAL_7C_EQUILIBRIUM_CLOSURE_REQUIRED");
      expect(text).toContain("STAGE4_NON_EQUIMOLAR_MULTICOMPONENT_TWO_FILM_INTERFACE_CLOSURE_REQUIRED");
      expect(text).toContain("STAGE4_INDEPENDENT_AXIAL_MESH_REFINEMENT_EVIDENCE_REQUIRED");
      expect(text).not.toContain("SAT [mol/s] 1");
      expect(text).not.toContain("Physical count 4");
    } finally {
      await page.close();
    }
  }, 60_000);

  it("renders no-solution termination without inventing count, height, efficiency, or outlet", async () => {
    stage4ActionRequests = [];
    stage4Response = { status: 200, body: noSolutionFixture() };
    const page = await openStage4();
    try {
      await page.waitForFunction(
        () => document.querySelector('[data-testid="stage4-pre-pilot-sizing"]')?.textContent?.includes("NO_TARGET_COMPLIANT_PHYSICAL_SOLUTION") === true,
        { timeout: 30_000 },
      );
      const text = await panelText(page);
      expect(text).toContain("NO_TARGET_COMPLIANT_PHYSICAL_SOLUTION");
      expect(text).toContain("NO_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT_WITHIN_EXPLICIT_SEARCH_BOUND");
      expect(text).toContain("No predicted outlet is available");
      expect(text).not.toContain("Physical count 0");
      expect(text).not.toContain("Active H [m] 0");
    } finally {
      await page.close();
    }
  }, 60_000);

  it("renders a protected API failure as blocked and leaves no stale sizing result", async () => {
    stage4ActionRequests = [];
    stage4Response = {
      status: 409,
      body: { error: "STAGE4_PINNED_7C_LOCAL_EQUILIBRIUM_UNAVAILABLE:FAILED" },
    };
    const page = await openStage4();
    try {
      await page.waitForFunction(
        () => document.querySelector('[data-testid="stage4-pre-pilot-sizing"] [role="alert"]') != null,
        { timeout: 30_000 },
      );
      const text = await panelText(page);
      expect(text).toContain("blocked or failed");
      expect(text).toContain("STAGE4_PINNED_7C_LOCAL_EQUILIBRIUM_UNAVAILABLE:FAILED");
      expect(text).not.toContain("Predicted primary raffinate outlet");
    } finally {
      await page.close();
    }
  }, 60_000);

  it("does not start a solver on initial render and sends one empty calculate request", async () => {
    stage4ActionRequests = [];
    stage4Response = { status: 200, body: resultFixture() };
    const page = await openStage4();
    try {
      await page.waitForFunction(
        () => document.querySelector('[data-testid="stage4-pre-pilot-sizing"]')?.textContent?.includes("c=0.0126") === true,
        { timeout: 30_000 },
      );
      expect(stage4ActionRequests).toHaveLength(0);
      const calculate = await page.$('[data-testid="stage4-calculate"]');
      expect(calculate).not.toBeNull();
      await calculate?.click();
      await page.waitForFunction(() => document.querySelector('[data-testid="stage4-calculate"]')?.textContent?.includes("Stage 4 running") === true, { timeout: 5_000 });
      // The disabled button and the client-side in-flight guard prevent a
      // double click from creating duplicate solver requests.
      await calculate?.click().catch(() => undefined);
      expect(stage4ActionRequests).toEqual([{ path: stage4CalculateEndpoint, body: "{}" }]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("uses explicit retry for a numerical failure instead of silently POSTing calculate", async () => {
    stage4ActionRequests = [];
    const failure = resultFixture();
    failure.status = "NUMERICAL_FAILURE";
    const physicalSizing = failure.physicalSizing as Record<string, any>;
    physicalSizing.status = "NUMERICAL_FAILURE";
    physicalSizing.primary = selectedCase(0.0126, {
      ec: 0.0015,
      pec: 0.53,
      count: null,
      height: null,
      efficiency: null,
      termination: "FINITE_RATE_SOLVER_NUMERICAL_FAILURE",
    });
    physicalSizing.sensitivity = selectedCase(0.0105, {
      ec: 0.0013,
      pec: 0.61,
      count: null,
      height: null,
      efficiency: null,
      termination: "FINITE_RATE_SOLVER_NUMERICAL_FAILURE",
    });
    failure.mainOutputs = { diameterM: 0.8, overallEfficiency: null, physicalCompartments: null, activeHeightM: null };
    stage4Response = { status: 200, body: failure };
    const page = await openStage4();
    try {
      await page.waitForFunction(
        () => document.querySelector('[data-testid="stage4-calculate"]')?.textContent?.includes("Retry Stage 4") === true,
        { timeout: 30_000 },
      );
      await page.click('[data-testid="stage4-calculate"]');
      await page.waitForFunction(() => document.querySelector('[data-testid="stage4-calculate"]')?.textContent?.includes("Stage 4 running") === true, { timeout: 5_000 });
      expect(stage4ActionRequests).toEqual([{ path: stage4RetryEndpoint, body: "{}" }]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("exposes Stop during a running calculation and sends the guarded empty stop request", async () => {
    stage4ActionRequests = [];
    const running = resultFixture();
    running.status = "RUNNING";
    running.mainOutputs = { diameterM: 0.8, overallEfficiency: null, physicalCompartments: null, activeHeightM: null };
    running.calculation = {
      status: "RUNNING",
      progress: {
        phase: "PRIMARY_RUNNING",
        completedCases: 0,
        totalCases: 2,
        physicalCompartments: 3,
        finiteVolumeCellsPerPhysicalCompartment: 2,
        state: "STARTED",
        localFlashCalls: 12,
      },
    };
    stage4Response = { status: 200, body: running };
    const page = await openStage4();
    try {
      await page.waitForSelector('[data-testid="stage4-stop"]', { visible: true, timeout: 30_000 });
      expect(await page.$eval('[data-testid="stage4-run-progress"]', element => (element as HTMLElement).innerText))
        .toContain("Recorded local flash calls");
      expect(await page.$eval('[data-testid="stage4-active-progress"] [role="progressbar"]', el => el.hasAttribute("aria-valuenow")))
        .toBe(false);
      expect(await page.$eval('.stage4-activity-segment', el => getComputedStyle(el).animationName))
        .toBe("stage4-active-sweep");
      expect(await page.$eval('.stage4-activity-track', el => el.getBoundingClientRect().height))
        .toBeGreaterThanOrEqual(14);
      await page.click('[data-testid="stage4-stop"]');
      await page.waitForFunction(() => document.querySelector('[data-testid="stage4-stop"]') == null, { timeout: 5_000 });
      expect(stage4ActionRequests).toEqual([{ path: stage4StopEndpoint, body: "{}" }]);
    } finally {
      await page.close();
    }
  }, 60_000);
});