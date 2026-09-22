import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser, type HTTPRequest, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { buildStage5R1Geometry, R1_COMPLETE, R1_WATERMARK } from "../shared/ecr-stage5-r1";
import { buildStage5Geometry, emptyStage5Inputs, type Stage5Basis } from "../shared/ecr-stage5-geometry";
import { renderStage5Svg, type Stage5DrawingView } from "../shared/ecr-stage5-drawings";
import { createStage5Pdf } from "../server/ecr-pre-pilot/stage5-geometry-report";
import { createStage5DesignDataPdf } from "../server/ecr-pre-pilot/stage5-design-data-report";

const api = "/api/ecr-pre-pilot/designs/47/stage5";
const basis: Stage5Basis = {
  stage3ResultId: "3", stage4ResultId: "4", sourcesCurrent: true, sourcesCompatible: true,
  columnDiameterM: .6, rotorDiameterM: .3, rotorDiameterRatio: .5, compartmentHeightM: .18,
  compartmentCount: 39, requiredActiveHeightM: 7, installedActiveHeightM: 7.02,
  designNt: 7, hetsM: 1, statorFreeAreaRatio: .4, selectedRpm: 50, rpmMin: 30, rpmMax: 70,
  phaseConfiguration: "NMP continuous / RRBO dispersed",
};
const geometry = buildStage5R1Geometry(basis);
const views: Stage5DrawingView[] = ["ga", "section", "compartment", "rotor", "stator"];
const drawings = Object.fromEntries(views.map(view => [view, renderStage5Svg(geometry, view, { designId: 47, revision: 2, date: "2026-09-19", projectName: "VERIFICATION FIXTURE — NOT A LIVE DESIGN" })]));
const revision = {
  id: "501", revision: 2, createdAt: "2026-09-10T12:00:00.000Z", inputs: geometry.inputs,
  geometry, drawings, sourceHash: "hash-current", currentness: "CURRENT", status: R1_COMPLETE,
};
const historicalGeometry = buildStage5Geometry(basis, emptyStage5Inputs());
const historical = {
  ...revision, id: "500", revision: 1, currentness: "OUTDATED", sourceHash: "hash-old",
  geometry: historicalGeometry, inputs: historicalGeometry.inputs,
  drawings: Object.fromEntries(views.map(view => [view, renderStage5Svg(historicalGeometry, view)])),
  status: "INCOMPLETE",
};
let vite: ViteDevServer, browser: Browser, origin: string, previousReplId: string | undefined;
let mode: "normal" | "issues" | "incompatible" | "missing" | "history-failed" = "normal";
let requests: { path: string; body: any }[] = [];
let getRequests: string[] = [];
const artifactDir = resolve("deliverables/r1-drawings");
let fixturePdf: Buffer;
let designDataPdf: Buffer;
let failDownload = false;
const respond = (q: HTTPRequest, status: number, body: unknown) =>
  void q.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
async function open(width = 1440): Promise<Page> {
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: artifactDir });
  await page.setViewport({ width, height: 1000 });
  await page.evaluateOnNewDocument(() => {
    (window as any).__opened = [];
    window.open = ((url: unknown) => { (window as any).__opened.push(String(url)); return null; }) as any;
  });
  await page.setRequestInterception(true);
  page.on("request", q => {
    const path = new URL(q.url()).pathname, method = q.method();
    const body = q.postData() ? JSON.parse(q.postData()!) : {};
    if (path.startsWith(api) && method === "POST") requests.push({ path, body });
    if (path.startsWith(api) && method === "GET") getRequests.push(path);
    if (path === "/api/user") return respond(q, 200, { id: 9001, username: "r1-review", name: "R1 Reviewer", role: "Superuser", passwordNeedsUpdate: false, requiresPasswordUpdate: false });
    if (path === "/api/2fa/status") return respond(q, 200, { enabled: true });
    if (path === "/api/attendance/status") return respond(q, 200, { hasRecord: true, record: { checkInTime: "2026-09-09T08:00:00.000Z" }, canCheckIn: false, canCheckOut: true });
    if (path === "/api/usage-tracker/summary") return respond(q, 200, { monthlyTotal: 0, monthlyLimit: 100, monthlyPercent: 0, dailyTotal: 0, dailyLimit: 10, dailyPercent: 0, remainingDaily: 10, lastCumulativeTotal: 0, warningLevel: "none", softBlockEnabled: false, daysInMonth: 30, dayOfMonth: 1 });
    if (path === "/api/ecr-pre-pilot/designs/latest-saved") return respond(q, 200, { id: 47 });
    if (path === `${api}/basis`) return mode === "missing" ? respond(q, 409, { error: "STAGE5_SAVED_CURRENT_STAGE4_REQUIRED" }) : respond(q, 200, { basis, sourceHash: "hash-current" });
    if (path === `${api}/preview`) {
      if (mode === "incompatible") return respond(q, 409, { error: "R1_GEOMETRY_INCOMPATIBLE: stack: frozen height conflict" });
      if (mode === "issues") return respond(q, 200, {
        ...geometry, complete: false,
        checks: [
          ...geometry.checks.filter(check => check.status === "pass").slice(0, 2),
          { id: "fixture-failure", status: "fail", message: "Fixture clearance failed." },
          { id: "fixture-unresolved", status: "tbd", message: "Fixture support remains unresolved." },
        ],
        tbd: ["Fixture support detail is unresolved."],
      });
      return respond(q, 200, geometry);
    }
    if (path === `${api}/revisions`) return method === "GET" ? mode === "history-failed" ? respond(q, 500, { error: "STAGE5_REQUEST_FAILED" }) : respond(q, 200, [revision, historical]) : respond(q, 201, { ...revision, id: "502", revision: 3 });
    if (path === `${api}/revisions/500`) return respond(q, 200, historical);
    if (path === `${api}/revisions/501`) return respond(q, 200, revision);
    if (path === `${api}/revisions/502`) return respond(q, 200, { ...revision, id: "502", revision: 3 });
    if (path.endsWith("/export.svg")) {
      if (failDownload) return respond(q, 409, { error: "STAGE5_FIXTURE_EXPORT_DENIED" });
      const view = new URL(q.url()).searchParams.get("view") ?? "ga";
      return void q.respond({ status: 200, contentType: "image/svg+xml", body: drawings[view] });
    }
    if (path.endsWith("/export.pdf")) return void q.respond({ status: 200, contentType: "application/pdf", body: fixturePdf });
    if (path.endsWith("/design-data.pdf") || path.endsWith("/audit-archive.pdf")) return void q.respond({ status: 200, contentType: "application/pdf", body: designDataPdf });
    if (path.startsWith("/api/")) return respond(q, 200, []);
    void q.continue();
  });
  await page.goto(`${origin}/design-software/ecr-pre-pilot-design/stage-5`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="stage5-page"]', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="stage5-loading"]'), { timeout: 30000 });
  // The primary page now opens the current frozen revision automatically.
  // These older construction-workflow tests explicitly enter new-revision mode.
  if (mode !== "missing" && mode !== "history-failed") {
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent?.trim() === "New R1 revision from current basis"));
    await page.$$eval("button", bs => bs.find(b => b.textContent?.trim() === "New R1 revision from current basis")?.click());
    await page.waitForFunction(() => !document.querySelector('[data-testid="stage5-loading"]'));
  }
  return page;
}
const click = async (page: Page, label: string) => page.$$eval("button", (buttons, text) => buttons.find(b => b.textContent?.trim() === text)?.click(), label);
describe.sequential("automatic R1 Stage5 browser workflow", () => {
  beforeAll(async () => {
    mkdirSync(artifactDir, { recursive: true });
    fixturePdf = await createStage5Pdf({ ...revision, notes: "Browser verification fixture" });
    designDataPdf = await createStage5DesignDataPdf({ ...revision, notes: "VERIFICATION FIXTURE — NOT A LIVE DESIGN" }, 47);
    previousReplId = process.env.REPL_ID;
    delete process.env.REPL_ID;
    if (process.env.STAGE5_BROWSER_ORIGIN) origin = process.env.STAGE5_BROWSER_ORIGIN;
    else {
      vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
      await vite.listen();
      origin = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`;
    }
    browser = await puppeteer.launch({
      executablePath: execSync("command -v chromium || command -v chromium-browser", { encoding: "utf8" }).trim(),
      headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }, 60000);
  afterAll(async () => {
    await browser?.close(); await vite?.close();
    if (previousReplId === undefined) delete process.env.REPL_ID; else process.env.REPL_ID = previousReplId;
  });
  it.each([1440, 390])("automatically generates with no construction controls at width %s", async width => {
    mode = "normal"; requests = [];
    const page = await open(width);
    try {
      const root = '[data-testid="stage5-page"]';
      expect(await page.$$eval(`${root} input, ${root} select, ${root} textarea`, nodes => nodes.filter(n => !n.closest('[data-testid="stage5-end-sections"]')).length)).toBe(0);
      expect(await page.$eval(root, el => el.textContent)).toContain(R1_COMPLETE);
      expect(await page.$eval(root, el => el.textContent)).toContain(R1_WATERMARK);
      const validation = await page.$eval('[data-testid="stage5-validation-summary"]', el => el.textContent ?? "");
      expect(validation).toContain(`All ${geometry.checks.length} validation checks passed`);
      expect(validation).not.toContain("PASS");
      expect(await page.$$eval('[data-testid="stage5-unresolved-items"]', nodes => nodes.length)).toBe(0);
      const register = await page.$eval('[data-testid="stage5-parameter-register"]', el => el.textContent ?? "");
      expect(register).toContain("Engineering Calculation & Audit Archive");
      expect(register).toContain("Save an immutable revision first");
      expect(register).not.toContain("Gross free-area fraction");
      expect(requests).toEqual([{ path: `${api}/preview`, body: {} }, { path: `${api}/preview`, body: {} }]);
      for (const [label, view] of [
        ["General arrangement", "ga"], ["Longitudinal section", "section"], ["Typical compartment", "compartment"],
        ["Rotor detail", "rotor"], ["Stator detail", "stator"],
      ]) {
        await click(page, label);
        if (view === "ga") {
          await page.waitForSelector('[data-testid="stage5-current-ga-unavailable"]');
          continue; // Unsaved active preview is not current end-GA authority.
        }
        await page.waitForSelector(`[data-testid="stage5-drawing-${view}"] svg`, { timeout: 5000 });
        const drawing = await page.$(`[data-testid="stage5-drawing-${view}"]`);
        expect(await drawing!.evaluate(el => el.textContent)).toContain(R1_WATERMARK);
        await drawing!.screenshot({ path: `${artifactDir}/fixture-browser-${view}-${width}.png` });
      }
      await page.click('button[aria-label="Zoom in"]');
      expect(await page.$eval('[data-testid="stage5-drawing-stator"]', e => e.textContent)).toContain("120%");
      await page.click('button[aria-label="Reset drawing view"]');
      expect(await page.$eval('[data-testid="stage5-drawing-stator"]', e => e.textContent)).toContain("100%");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/r1-stage5-${width}.png`, fullPage: false });
      await page.$eval('[data-testid="stage5-compact-report"]', element => {
        const top = element.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ left: 0, top: Math.max(0, top - 180), behavior: "instant" });
      });
      const compactPath = `/tmp/stage5-compact-report-${width === 1440 ? "desktop" : "mobile"}.png`;
      if (width === 1440) {
        const compact = await page.$('[data-testid="stage5-compact-report"]');
        await compact!.screenshot({ path: compactPath });
      } else {
        await page.$eval('[data-testid="stage5-compact-report"]', element => {
          const copy = element.cloneNode(true) as HTMLElement;
          copy.id = "stage5-compact-screenshot";
          copy.style.cssText = "position:fixed;inset:0 auto auto 0;z-index:2147483647;width:100%;background:white;padding:8px";
          document.body.appendChild(copy);
        });
        await page.screenshot({ path: compactPath, fullPage: false });
        await page.$eval("#stage5-compact-screenshot", element => element.remove());
      }
      expect(await page.$$eval("button", buttons => buttons.find(b => b.textContent?.trim() === "Download Audit Archive")?.disabled)).toBe(true);
    } finally { await page.close(); }
  }, 60000);
  it("saves only the expected source hash and opens immutable drawings", async () => {
    mode = "normal"; requests = [];
    const page = await open();
    try {
      await click(page, "Save immutable revision");
      await page.waitForFunction(() => document.body.innerText.includes("Frozen revision 3"));
      expect(requests.at(-1)).toEqual({ path: `${api}/revisions`, body: { expectedSourceHash: "hash-current" } });
      for (const [label, view] of [["General arrangement","ga"],["Longitudinal section","section"],["Typical compartment","compartment"],["Rotor detail","rotor"],["Stator detail","stator"]]) {
        const file = `${artifactDir}/stage5-r3-dimensioned-v2-${view}.svg`;
        if (existsSync(file)) rmSync(file);
        await click(page, label); await click(page, "Historical SVG view");
        await expect.poll(() => existsSync(file), { timeout: 10000 }).toBe(true);
        expect(readFileSync(file, "utf8")).toContain("NOT FOR FABRICATION");
        const drawing = await page.$(view === "ga" ? '[data-testid="stage5-current-ga-unavailable"]' : `[data-testid="stage5-drawing-${view}"]`);
        await drawing!.screenshot({ path: `${artifactDir}/fixture-browser-${view}-saved-desktop.png` });
      }
      const pdf = `${artifactDir}/stage5-r3-dimensioned-v2.pdf`;
      if (existsSync(pdf)) rmSync(pdf);
      await click(page, "Historical PDF package");
      await expect.poll(() => existsSync(pdf), { timeout: 10000 }).toBe(true);
      expect(readFileSync(pdf).subarray(0, 5).toString()).toBe("%PDF-");
      const dataPdf = `${artifactDir}/stage5-r3-audit-archive.pdf`;
      if (existsSync(dataPdf)) rmSync(dataPdf);
      await click(page, "Download Audit Archive");
      await expect.poll(() => existsSync(dataPdf), { timeout: 10000 }).toBe(true);
      expect(readFileSync(dataPdf)).toEqual(designDataPdf);
      mkdirSync(resolve("deliverables/r1-design-data"), { recursive: true });
      const downloadPanel = await page.$('[data-testid="stage5-parameter-register"]');
      await downloadPanel!.screenshot({ path: resolve("deliverables/r1-design-data/fixture-saved-design-data-download.png") });
    } finally { await page.close(); }
  }, 60000);
  it("shows an explicit download error rather than downloading an error page", async () => {
    mode = "normal"; failDownload = true;
    const page = await open();
    try {
      await page.$$eval("button", buttons => buttons.find(b => b.textContent?.includes("REV 2"))?.click());
      await page.waitForFunction(() => document.body.innerText.includes("Frozen revision 2"));
      await click(page, "Historical SVG view");
      await page.waitForFunction(() => document.body.innerText.includes("STAGE5_FIXTURE_EXPORT_DENIED"));
    } finally { failDownload = false; await page.close(); }
  });
  it("opens pre-R1 historical snapshot without regeneration and no editing", async () => {
    mode = "normal"; requests = [];
    const page = await open();
    try {
      const before = requests.length;
      await page.$$eval("button", buttons => buttons.find(b => b.textContent?.includes("REV 1"))?.click());
      await page.waitForFunction(() => document.body.innerText.includes("Historical pre-R1 snapshot"));
      expect(requests).toHaveLength(before);
      expect(await page.$$eval('[data-testid="stage5-page"] input, [data-testid="stage5-page"] select', nodes => nodes.filter(n => !n.closest('[data-testid="stage5-end-sections"]')).length)).toBe(0);
      expect(await page.$('[data-testid="stage5-current-ga-unavailable"]')).not.toBeNull();
      await click(page, "Longitudinal section");
      expect(await page.$('[data-testid="stage5-drawing-section"] svg')).not.toBeNull();
    } finally { await page.close(); }
  });
  it("shows only failed and unresolved validation rows and never hides TBD items", async () => {
    mode = "issues";
    const page = await open();
    try {
      const validation = await page.$eval('[data-testid="stage5-validation-summary"]', el => el.textContent ?? "");
      expect(validation).toContain("Fixture clearance failed.");
      expect(validation).toContain("Fixture support remains unresolved.");
      expect(validation).not.toContain("Frozen sources must be identified");
      expect(await page.$eval('[data-testid="stage5-unresolved-items"]', el => el.textContent)).toContain("Fixture support detail is unresolved.");
      expect(await page.$$eval("button", buttons => (buttons.find(b => b.textContent?.includes("Save immutable revision")) as HTMLButtonElement).disabled)).toBe(true);
    } finally { await page.close(); }
  });
  it("keeps current basis and preview visible when history fails, with independent retry", async () => {
    mode = "history-failed"; requests = []; getRequests = [];
    const page = await open();
    await page.waitForSelector('[data-testid="stage5-history-error"]');
    expect(await page.$('[data-testid="stage5-error"]')).toBeNull();
    expect(await page.$('[data-testid="stage5-geometry-report"]')).not.toBeNull();
    expect(await page.$eval('[data-testid="stage5-history-error"]', node => node.textContent)).toContain("STAGE5_REQUEST_FAILED (HTTP 500)");
    await page.screenshot({ path: "/tmp/stage5-history-failure-preview.png", fullPage: true });
    const basisCalls = getRequests.filter(path => path === `${api}/basis`).length;
    expect(basisCalls).toBe(1);
    mode = "normal";
    await click(page, "Retry history");
    await page.waitForFunction(() => !document.querySelector('[data-testid="stage5-history-error"]'));
    expect(getRequests.filter(path => path === `${api}/basis`)).toHaveLength(basisCalls);
    expect(getRequests.filter(path => path === `${api}/revisions`)).toHaveLength(2);
    expect(await page.$('[data-testid="stage5-geometry-report"]')).not.toBeNull();
    await page.screenshot({ path: "/tmp/stage5-history-retry-preview.png", fullPage: true });
    await page.close();
  });
  it.each(["incompatible", "missing"] as const)("fails explicitly for %s upstream geometry, keeps history readable", async problem => {
    mode = problem; requests = [];
    const page = await open();
    try {
      const errorSelector = problem === "incompatible" ? '[data-testid="stage5-construction-error"]' : '[data-testid="stage5-source-error"]';
      await page.waitForSelector(errorSelector);
      if (problem === "incompatible") expect(await page.$eval(errorSelector, e => e.textContent)).toContain("R1_GEOMETRY_INCOMPATIBLE: stack");
      expect(await page.$$eval("button", buttons => (buttons.find(b => b.textContent?.includes("Save immutable revision")) as HTMLButtonElement).disabled)).toBe(true);
      expect(requests.some(r => r.path.endsWith("/revisions"))).toBe(false);
      await page.$$eval("button", buttons => buttons.find(b => b.textContent?.includes("REV 1"))?.click());
      await page.waitForSelector('[data-testid="stage5-current-ga-unavailable"]');
    } finally { await page.close(); }
  });
});