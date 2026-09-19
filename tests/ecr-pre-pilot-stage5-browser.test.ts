import { execSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser, type HTTPRequest, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import {
  buildStage5Geometry,
  emptyStage5Inputs,
  type Stage5Basis,
  type Stage5Inputs,
} from "../shared/ecr-stage5-geometry";

const stage5Path = "/design-software/ecr-pre-pilot-design/stage-5";
const api = "/api/ecr-pre-pilot/designs/47/stage5";

const basis: Stage5Basis = {
  stage3ResultId: "stage3-301",
  stage4ResultId: "stage4-401",
  sourcesCurrent: true,
  sourcesCompatible: true,
  columnDiameterM: 1,
  compartmentHeightM: .5,
  rotorDiameterRatio: .6,
  rotorDiameterM: .6,
  statorFreeAreaRatio: .3,
  selectedRpm: 60,
  rpmMin: 50,
  rpmMax: 90,
  phaseConfiguration: "NMP continuous / RRBO dispersed",
  compartmentCount: 14,
  requiredActiveHeightM: 7,
  installedActiveHeightM: 7,
  designNt: 7,
  hetsM: 1,
};

function completeInputs(): Stage5Inputs {
  const inputs = emptyStage5Inputs();
  inputs.rotorConstruction = "flat-disc";
  inputs.statorConstruction = "annular-single-opening";
  const values: Partial<Record<keyof Stage5Inputs["values"], number>> = {
    shaftDiameterM: .05,
    rotorThicknessM: .02,
    statorThicknessM: .01,
    rotorOffsetM: .25,
    bottomDisengagementM: 1,
    topDisengagementM: 1,
    bottomHeadDepthM: .25,
    topHeadDepthM: .25,
    supportHeightM: .5,
    driveHeightM: .5,
    lowerShaftSupportM: .5,
    upperShaftSupportM: 9,
  };
  for (const [key, value] of Object.entries(values)) {
    inputs.values[key as keyof Stage5Inputs["values"]].value = value;
  }
  inputs.nozzles = [
    ["N1", "feed", "bottom", .75, 0],
    ["N2", "outlet", "top", 8.75, 60],
    ["N3", "drain", "bottom", .55, 120],
    ["N4", "vent", "top", 8.95, 180],
    ["N5", "sample", "active", 1.75, 240],
    ["N6", "instrument", "active", 2.25, 300],
  ].map(([id, service, region, elevationM, azimuthDeg]) => ({
    id: String(id),
    service: String(service),
    region: region as "bottom" | "active" | "top",
    elevationM: Number(elevationM),
    boreM: .05,
    azimuthDeg: Number(azimuthDeg),
    classification: "Engineer-entered",
    note: "Preliminary process connection",
  }));
  inputs.notes = "Browser integration geometry fixture";
  return inputs;
}

const geometry = buildStage5Geometry(basis, completeInputs());
const basisPayload = {
  basis: { ...basis, rpmMax: undefined, sourceHash: "hash-current" },
  sourceHash: "hash-current",
  sourceStage3: {
    id: "stage3-301",
    immutableHash: "stage3-immutable",
    result: { diameterM: 1, rotorDiameterM: .6, selectedRpm: 60, orientation: basis.phaseConfiguration },
  },
  sourceStage4: {
    id: "stage4-401",
    lineageHash: "stage4-lineage",
    result: { fixedDesignTheoreticalStages: 7, requiredPhysicalCompartments: 14, installedActiveHeightM: 7 },
  },
};
const currentRevision = {
  id: "501",
  revision: 2,
  createdAt: "2026-09-10T12:00:00.000Z",
  inputs: completeInputs(),
  geometry,
  sourceHash: "hash-current",
  currentness: "CURRENT",
  status: "INCOMPLETE",
  notes: "Current frozen package",
};
const oldRevision = {
  ...currentRevision,
  id: "500",
  revision: 1,
  createdAt: "2026-09-09T12:00:00.000Z",
  sourceHash: "hash-old",
  currentness: "OUTDATED",
  notes: "Historical frozen package",
};

type ApiMode = "normal" | "basis-missing" | "history-error" | "preview-error";
let mode: ApiMode = "normal";
let history = [currentRevision, oldRevision];
let mutationRequests: Array<{ method: string; path: string; body: unknown }> = [];
let detailRequests: string[] = [];
let vite: ViteDevServer;
let browser: Browser;
let origin: string;
let previousReplId: string | undefined;

function chromiumPath() {
  return execSync("command -v chromium || command -v chromium-browser", { encoding: "utf8" }).trim();
}

function respond(request: HTTPRequest, status: number, body: unknown) {
  void request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function openStage5(viewport = { width: 1440, height: 1000 }): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(() => {
    (window as unknown as { __openedUrls: string[] }).__openedUrls = [];
    window.open = ((url?: string | URL) => {
      (window as unknown as { __openedUrls: string[] }).__openedUrls.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await page.setRequestInterception(true);
  page.on("request", request => {
    const url = new URL(request.url());
    const method = request.method();
    const parsedBody = request.postData() ? JSON.parse(request.postData()!) : undefined;
    if (url.pathname.startsWith(api) && method !== "GET") {
      mutationRequests.push({ method, path: url.pathname, body: parsedBody });
    }
    if (url.pathname === "/api/user") return respond(request, 200, {
      id: 9001,
      username: "stage5-browser-reviewer",
      name: "Stage 5 Browser Reviewer",
      role: "Superuser",
      passwordNeedsUpdate: false,
      requiresPasswordUpdate: false,
    });
    if (url.pathname === "/api/2fa/status") return respond(request, 200, { enabled: true });
    if (url.pathname === "/api/attendance/status") return respond(request, 200, {
      hasRecord: true,
      record: { checkInTime: "2026-09-09T08:00:00.000Z" },
      canCheckIn: false,
      canCheckOut: true,
    });
    if (url.pathname === "/api/usage-tracker/summary") return respond(request, 200, {
      monthlyTotal: 0, monthlyLimit: 100, monthlyPercent: 0,
      dailyTotal: 0, dailyLimit: 10, dailyPercent: 0, remainingDaily: 10,
      lastCumulativeTotal: 0, warningLevel: "none", softBlockEnabled: false,
      daysInMonth: 30, dayOfMonth: 1,
    });
    if (url.pathname === "/api/ecr-pre-pilot/designs/latest-saved") {
      return respond(request, 200, { id: 47, projectNumber: "ECR-BROWSER-47" });
    }
    if (url.pathname === `${api}/basis` && method === "GET") {
      return mode === "basis-missing"
        ? respond(request, 409, { code: "STAGE5_SAVED_CURRENT_STAGE4_REQUIRED" })
        : respond(request, 200, basisPayload);
    }
    if (url.pathname === `${api}/revisions` && method === "GET") {
      return mode === "history-error"
        ? respond(request, 503, { message: "Revision store unavailable" })
        : respond(request, 200, history.map(({ geometry: _geometry, inputs: _inputs, ...summary }) => summary));
    }
    if (url.pathname === `${api}/preview` && method === "POST") {
      return mode === "preview-error"
        ? respond(request, 422, { code: "STAGE5_INVALID_INPUTS" })
        : respond(request, 200, { geometry });
    }
    if (url.pathname === `${api}/revisions` && method === "POST") {
      const record = { ...currentRevision, id: "502", revision: 3, inputs: parsedBody.inputs };
      history = [record, ...history];
      return respond(request, 201, record);
    }
    const detail = url.pathname.match(new RegExp(`^${api}/revisions/([^/]+)$`));
    if (detail && method === "GET") {
      detailRequests.push(detail[1]);
      const record = history.find(item => item.id === detail[1]);
      return record ? respond(request, 200, record) : respond(request, 404, { message: "Not found" });
    }
    if (url.pathname.startsWith("/api/")) return respond(request, 200, []);
    void request.continue();
  });
  await page.goto(`${origin}${stage5Path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="stage5-page"]', { visible: true, timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="stage5-loading"]'), { timeout: 30_000 });
  return page;
}

const text = (page: Page) => page.$eval('[data-testid="stage5-page"]', element =>
  (element as HTMLElement).innerText.replace(/\s+/g, " ").trim());

async function replaceInput(page: Page, selector: string, value: string) {
  await page.$eval(selector, (element, nextValue) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

describe.sequential("ECR pre-pilot Stage 5 browser integration", () => {
  beforeAll(async () => {
    previousReplId = process.env.REPL_ID;
    delete process.env.REPL_ID;
    vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
    await vite.listen();
    origin = `http://127.0.0.1:${(vite.httpServer?.address() as AddressInfo).port}`;
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

  it("loads inherited facts and revision summaries read-only without hidden writes", async () => {
    mode = "normal";
    mutationRequests = [];
    detailRequests = [];
    history = [currentRevision, oldRevision];
    const page = await openStage5();
    try {
      const body = await text(page);
      expect(body).toContain("Read-only inherited facts");
      expect(body).toContain("Source hash: hash-current");
      expect(body).toContain("stage3-301");
      expect(body).toContain("stage4-401");
      expect(body).toMatch(/Maximum window speed \(RPM\)\s+TBD/i);
      expect(body).toContain("REV 2");
      expect(body).toContain("REV 1");
      expect(body).toContain("PRELIMINARY PRE-PILOT GEOMETRY & DRAWINGS — NOT FOR FABRICATION");
      expect(body).toContain("pressure-vessel wall/head thickness");
      expect(await page.$eval('[data-testid="stage5-input-shaftDiameterM"]', input => (input as HTMLInputElement).value)).toBe("");
      expect(mutationRequests).toEqual([]);
      expect(detailRequests).toEqual([]);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !document.querySelector('[data-testid="stage5-loading"]'), { timeout: 30_000 });
      expect(mutationRequests).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("offers explicit construction choices and posts exact preview/save contracts", async () => {
    mode = "normal";
    mutationRequests = [];
    history = [];
    const page = await openStage5();
    try {
      expect(await page.$$eval('button', buttons => buttons.some(button => /SVG view|PDF package/.test(button.innerText)))).toBe(false);
      await page.select('[data-testid="stage5-rotor-construction"]', "flat-disc");
      await page.select('[data-testid="stage5-stator-construction"]', "annular-single-opening");
      await replaceInput(page, '[data-testid="stage5-input-shaftDiameterM"]', "0.05");
      await replaceInput(page, '[data-testid="stage5-input-rotorThicknessM"]', "0.02");
      await replaceInput(page, '[data-testid="stage5-input-statorThicknessM"]', "0.01");
      await replaceInput(page, '[data-testid="stage5-input-rotorOffsetM"]', "0.25");
      expect(await page.$('[data-testid="stage5-input-bladeCount"]')).toBeNull();
      expect(await page.$('[data-testid="stage5-input-rotorThicknessM"]')).not.toBeNull();
      const saveDisabled = await page.$$eval("button", buttons =>
        (buttons.find(button => button.textContent?.includes("Save revision")) as HTMLButtonElement).disabled);
      expect(saveDisabled).toBe(true);

      await page.$$eval("button", buttons => buttons.find(button => button.textContent?.includes("Preview geometry"))?.click());
      await page.waitForSelector('[data-testid="stage5-drawing-ga"]', { visible: true, timeout: 10_000 });
      expect(mutationRequests).toHaveLength(1);
      expect(mutationRequests[0]).toMatchObject({
        method: "POST",
        path: `${api}/preview`,
        body: {
          inputs: {
            rotorConstruction: "flat-disc",
            statorConstruction: "annular-single-opening",
            notes: "",
            nozzles: [],
          },
        },
      });
      expect((mutationRequests[0].body as any).inputs.values.shaftDiameterM.value).toBe(.05);
      expect((mutationRequests[0].body as any).inputs.values.rotorThicknessM.value).toBe(.02);
      expect(await page.$$eval("button", buttons => buttons.some(button => /SVG view|PDF package/.test(button.innerText)))).toBe(false);

      await replaceInput(page, '[data-testid="stage5-input-shaftDiameterM"]', "0.06");
      expect(await page.$('[data-testid="stage5-empty-drawing"]')).not.toBeNull();
      expect(await page.$$eval("button", buttons =>
        (buttons.find(button => button.textContent?.includes("Save revision")) as HTMLButtonElement).disabled)).toBe(true);
      expect(mutationRequests).toHaveLength(1);
      await replaceInput(page, '[data-testid="stage5-input-shaftDiameterM"]', "0.05");
      await page.$$eval("button", buttons => buttons.find(button => button.textContent?.includes("Preview geometry"))?.click());
      await page.waitForSelector('[data-testid="stage5-drawing-ga"]', { visible: true, timeout: 10_000 });

      await page.$$eval("button", buttons => buttons.find(button => button.textContent?.includes("Save revision"))?.click());
      await page.waitForFunction(() => document.body.innerText.includes("Frozen revision 3"), { timeout: 10_000 });
      expect(mutationRequests).toHaveLength(3);
      expect(mutationRequests[1]).toMatchObject({ method: "POST", path: `${api}/preview` });
      expect(mutationRequests[2]).toMatchObject({
        method: "POST",
        path: `${api}/revisions`,
        body: { expectedSourceHash: "hash-current", notes: "" },
      });
      expect((mutationRequests[2].body as any).inputs).toEqual((mutationRequests[0].body as any).inputs);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("opens immutable snapshots, warns when stale, clones inputs, and only exports saved URLs", async () => {
    mode = "normal";
    mutationRequests = [];
    history = [currentRevision, oldRevision];
    const page = await openStage5();
    try {
      await page.$$eval("button", buttons => buttons.find(button => button.textContent?.includes("REV 1"))?.click());
      await page.waitForSelector('[data-testid="stage5-stale-banner"]', { visible: true, timeout: 10_000 });
      expect(await text(page)).toContain("Historical / superseded revision");
      expect(await page.$eval('[data-testid="stage5-input-shaftDiameterM"]', input =>
        (input as HTMLInputElement).disabled)).toBe(true);
      expect(await page.$eval('[data-testid="stage5-input-shaftDiameterM"]', input =>
        (input as HTMLInputElement).value)).toBe("0.05");
      expect(await page.$eval('[data-testid="stage5-drawing-ga"]', element => element.textContent))
        .toContain("Column ID 1 m");

      await page.$$eval("button", buttons => buttons.find(button => button.textContent?.includes("SVG view"))?.click());
      await page.$$eval("button", buttons => buttons.find(button => button.textContent?.includes("PDF package"))?.click());
      expect(await page.evaluate(() => (window as unknown as { __openedUrls: string[] }).__openedUrls)).toEqual([
        `${api}/revisions/500/export.svg?view=ga`,
        `${api}/revisions/500/export.pdf`,
      ]);
      expect(mutationRequests).toEqual([]);

      await page.$$eval("button", buttons => buttons.find(button => button.textContent?.includes("New revision from saved inputs"))?.click());
      expect(await page.$('[data-testid="stage5-stale-banner"]')).toBeNull();
      expect(await page.$eval('[data-testid="stage5-input-shaftDiameterM"]', input => ({
        disabled: (input as HTMLInputElement).disabled,
        value: (input as HTMLInputElement).value,
      }))).toEqual({ disabled: false, value: "0.05" });
      expect(await page.$$eval("button", buttons => buttons.some(button => /SVG view|PDF package/.test(button.innerText)))).toBe(false);
      expect(mutationRequests).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("renders all five shared views with working zoom and captures desktop", async () => {
    mode = "normal";
    history = [currentRevision, oldRevision];
    const page = await openStage5();
    try {
      await page.$$eval("button", buttons => buttons.find(button => button.textContent?.includes("REV 2"))?.click());
      await page.waitForSelector('[data-testid="stage5-drawing-ga"]', { visible: true, timeout: 10_000 });
      const views = [
        ["General arrangement", "ga"],
        ["Longitudinal section", "section"],
        ["Typical compartment", "compartment"],
        ["Rotor detail", "rotor"],
        ["Stator detail", "stator"],
      ];
      for (const [label, id] of views) {
        await page.$$eval("button", (buttons, buttonLabel) =>
          buttons.find(button => button.textContent?.trim() === buttonLabel)?.click(), label);
        await page.waitForSelector(`[data-testid="stage5-drawing-${id}"] svg`, { visible: true, timeout: 5_000 });
      }
      const before = await page.$eval('[data-testid="stage5-drawing-stator"]', element => element.textContent);
      expect(before).toContain("100%");
      await page.click('button[aria-label="Zoom in"]');
      expect(await page.$eval('[data-testid="stage5-drawing-stator"]', element => element.textContent)).toContain("120%");
      await page.click('button[aria-label="Reset drawing view"]');
      expect(await page.$eval('[data-testid="stage5-drawing-stator"]', element => element.textContent)).toContain("100%");
      await page.$eval('[data-testid="stage5-drawing-stator"]', element =>
        element.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: "/tmp/stage5-browser-drawing.png", fullPage: false });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: "/tmp/stage5-browser-desktop.png", fullPage: false });
    } finally {
      await page.close();
    }
  }, 60_000);

  it("surfaces API failures and preserves old history when the current basis is unavailable", async () => {
    mode = "preview-error";
    history = [];
    const errorPage = await openStage5();
    try {
      await errorPage.$$eval("button", buttons => buttons.find(button => button.textContent?.includes("Preview geometry"))?.click());
      await errorPage.waitForFunction(() => document.body.innerText.includes("Preview unavailable"), { timeout: 10_000 });
      expect(await errorPage.$eval("body", element => (element as HTMLElement).innerText)).toContain("Preview could not be generated");
      expect(await errorPage.$('[data-testid="stage5-empty-drawing"]')).not.toBeNull();
    } finally {
      await errorPage.close();
    }

    mode = "basis-missing";
    history = [oldRevision];
    mutationRequests = [];
    const historyPage = await openStage5();
    try {
      const body = await text(historyPage);
      expect(body).toContain("Stage 3/4 governing basis is unavailable");
      expect(body).toContain("REV 1");
      await historyPage.$$eval("button", buttons => buttons.find(button => button.textContent?.includes("REV 1"))?.click());
      await historyPage.waitForSelector('[data-testid="stage5-drawing-ga"]', { visible: true, timeout: 10_000 });
      expect(await historyPage.$('[data-testid="stage5-stale-banner"]')).not.toBeNull();
      expect(await historyPage.$$eval("button", buttons =>
        buttons.filter(button => button.textContent?.includes("Save revision")).every(button => (button as HTMLButtonElement).disabled))).toBe(true);
      expect(mutationRequests).toEqual([]);
    } finally {
      await historyPage.close();
    }
  }, 60_000);

  it("has no horizontal page overflow on a mobile viewport and captures mobile", async () => {
    mode = "normal";
    history = [currentRevision, oldRevision];
    const page = await openStage5({ width: 390, height: 844 });
    try {
      const historyVisibility = await page.$eval("[data-stage5-history]", element => {
        const rect = element.getBoundingClientRect();
        return {
          display: getComputedStyle(element).display,
          width: rect.width,
          revisionButtons: [...element.querySelectorAll("button")]
            .filter(button => /REV [12]/.test(button.innerText))
            .map(button => {
              const buttonRect = button.getBoundingClientRect();
              return { text: button.innerText, width: buttonRect.width, height: buttonRect.height };
            }),
        };
      });
      expect(historyVisibility.display).not.toBe("none");
      expect(historyVisibility.width).toBeGreaterThan(0);
      expect(historyVisibility.revisionButtons).toHaveLength(2);
      expect(historyVisibility.revisionButtons.every(button => button.width > 0 && button.height > 0)).toBe(true);
      await page.$$eval("button", buttons => buttons.find(button => button.textContent?.includes("REV 2"))?.click());
      await page.waitForSelector('[data-testid="stage5-drawing-ga"] svg', { timeout: 10_000 });
      expect(await page.$eval('[data-testid="stage5-input-shaftDiameterM"]', input => ({
        disabled: (input as HTMLInputElement).disabled,
        value: (input as HTMLInputElement).value,
      }))).toEqual({ disabled: true, value: "0.05" });
      await page.evaluate(() => window.scrollTo(0, 0));
      const dimensions = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        bodyWidth: document.body.scrollWidth,
        main: (() => {
          const rect = document.querySelector('[data-testid="stage5-page"]')!.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width };
        })(),
        heading: (() => {
          const rect = document.querySelector('[data-testid="stage5-page"] h1')!.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        })(),
        backAction: (() => {
          const button = [...document.querySelectorAll("button")]
            .find(item => item.textContent?.includes("HETS physical sizing"))!;
          const rect = button.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        })(),
      }));
      expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
      expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
      expect(dimensions.main.width).toBeGreaterThanOrEqual(dimensions.viewportWidth - 40);
      expect(dimensions.main.left).toBeGreaterThanOrEqual(0);
      expect(dimensions.main.right).toBeLessThanOrEqual(dimensions.viewportWidth);
      for (const element of [dimensions.heading, dimensions.backAction]) {
        expect(element.left).toBeGreaterThanOrEqual(0);
        expect(element.right).toBeLessThanOrEqual(dimensions.viewportWidth);
        expect(element.top).toBeGreaterThanOrEqual(0);
        expect(element.bottom).toBeLessThanOrEqual(844);
      }
      await page.screenshot({ path: "/tmp/stage5-browser-mobile.png", fullPage: false });
    } finally {
      await page.close();
    }
  }, 60_000);
});