import { execSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser, type HTTPRequest, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { buildStage5R1Geometry, R1_COMPLETE, R1_WATERMARK } from "../shared/ecr-stage5-r1";
import { buildStage5Geometry, emptyStage5Inputs, type Stage5Basis } from "../shared/ecr-stage5-geometry";
import { renderStage5Svg, type Stage5DrawingView } from "../shared/ecr-stage5-drawings";

const api = "/api/ecr-pre-pilot/designs/47/stage5";
const basis: Stage5Basis = {
  stage3ResultId: "3", stage4ResultId: "4", sourcesCurrent: true, sourcesCompatible: true,
  columnDiameterM: .8, rotorDiameterM: .4, rotorDiameterRatio: .5, compartmentHeightM: .24,
  compartmentCount: 30, requiredActiveHeightM: 7, installedActiveHeightM: 7.2,
  designNt: 7, hetsM: 1, statorFreeAreaRatio: .4, selectedRpm: 50, rpmMin: 30, rpmMax: 70,
  phaseConfiguration: "NMP continuous / RRBO dispersed",
};
const geometry = buildStage5R1Geometry(basis);
const views: Stage5DrawingView[] = ["ga", "section", "compartment", "rotor", "stator"];
const drawings = Object.fromEntries(views.map(view => [view, renderStage5Svg(geometry, view)]));
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
let mode: "normal" | "incompatible" | "missing" = "normal";
let requests: { path: string; body: any }[] = [];
const respond = (q: HTTPRequest, status: number, body: unknown) =>
  void q.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
async function open(width = 1440): Promise<Page> {
  const page = await browser.newPage();
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
    if (path === "/api/user") return respond(q, 200, { id: 9001, username: "r1-review", name: "R1 Reviewer", role: "Superuser", passwordNeedsUpdate: false, requiresPasswordUpdate: false });
    if (path === "/api/2fa/status") return respond(q, 200, { enabled: true });
    if (path === "/api/attendance/status") return respond(q, 200, { hasRecord: true, record: { checkInTime: "2026-09-09T08:00:00.000Z" }, canCheckIn: false, canCheckOut: true });
    if (path === "/api/usage-tracker/summary") return respond(q, 200, { monthlyTotal: 0, monthlyLimit: 100, monthlyPercent: 0, dailyTotal: 0, dailyLimit: 10, dailyPercent: 0, remainingDaily: 10, lastCumulativeTotal: 0, warningLevel: "none", softBlockEnabled: false, daysInMonth: 30, dayOfMonth: 1 });
    if (path === "/api/ecr-pre-pilot/designs/latest-saved") return respond(q, 200, { id: 47 });
    if (path === `${api}/basis`) return mode === "missing" ? respond(q, 409, { error: "STAGE5_SAVED_CURRENT_STAGE4_REQUIRED" }) : respond(q, 200, { basis, sourceHash: "hash-current" });
    if (path === `${api}/preview`) return mode === "incompatible" ? respond(q, 409, { error: "R1_GEOMETRY_INCOMPATIBLE: stack: frozen height conflict" }) : respond(q, 200, geometry);
    if (path === `${api}/revisions`) return method === "GET" ? respond(q, 200, [revision, historical]) : respond(q, 201, { ...revision, id: "502", revision: 3 });
    if (path === `${api}/revisions/500`) return respond(q, 200, historical);
    if (path === `${api}/revisions/501`) return respond(q, 200, revision);
    if (path.startsWith("/api/")) return respond(q, 200, []);
    void q.continue();
  });
  await page.goto(`${origin}/design-software/ecr-pre-pilot-design/stage-5`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="stage5-page"]', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="stage5-loading"]'), { timeout: 30000 });
  return page;
}
const click = async (page: Page, label: string) => page.$$eval("button", (buttons, text) => buttons.find(b => b.textContent?.trim() === text)?.click(), label);
describe.sequential("automatic R1 Stage5 browser workflow", () => {
  beforeAll(async () => {
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
      expect(await page.$$eval(`${root} input, ${root} select, ${root} textarea`, nodes => nodes.length)).toBe(0);
      expect(await page.$eval(root, el => el.textContent)).toContain(R1_COMPLETE);
      expect(await page.$eval(root, el => el.textContent)).toContain(R1_WATERMARK);
      expect(requests).toEqual([{ path: `${api}/preview`, body: {} }]);
      for (const [label, view] of [
        ["General arrangement", "ga"], ["Longitudinal section", "section"], ["Typical compartment", "compartment"],
        ["Rotor detail", "rotor"], ["Stator detail", "stator"],
      ]) {
        await click(page, label);
        await page.waitForSelector(`[data-testid="stage5-drawing-${view}"] svg`, { timeout: 5000 });
        const drawing = await page.$(`[data-testid="stage5-drawing-${view}"]`);
        expect(await drawing!.evaluate(el => el.textContent)).toContain(R1_WATERMARK);
        await drawing!.screenshot({ path: `/tmp/r1-drawing-${view}-${width}.png` });
      }
      await page.click('button[aria-label="Zoom in"]');
      expect(await page.$eval('[data-testid="stage5-drawing-stator"]', e => e.textContent)).toContain("120%");
      await page.click('button[aria-label="Reset drawing view"]');
      expect(await page.$eval('[data-testid="stage5-drawing-stator"]', e => e.textContent)).toContain("100%");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/r1-stage5-${width}.png`, fullPage: false });
    } finally { await page.close(); }
  }, 60000);
  it("saves only the expected source hash and opens immutable drawings", async () => {
    mode = "normal"; requests = [];
    const page = await open();
    try {
      await click(page, "Save immutable revision");
      await page.waitForFunction(() => document.body.innerText.includes("Frozen revision 3"));
      expect(requests.at(-1)).toEqual({ path: `${api}/revisions`, body: { expectedSourceHash: "hash-current" } });
      await click(page, "SVG view"); await click(page, "PDF package");
      expect(await page.evaluate(() => (window as any).__opened)).toEqual([
        `${api}/revisions/502/export.svg?view=ga`, `${api}/revisions/502/export.pdf`,
      ]);
    } finally { await page.close(); }
  });
  it("opens pre-R1 historical snapshot without regeneration and no editing", async () => {
    mode = "normal"; requests = [];
    const page = await open();
    try {
      const before = requests.length;
      await page.$$eval("button", buttons => buttons.find(b => b.textContent?.includes("REV 1"))?.click());
      await page.waitForFunction(() => document.body.innerText.includes("Historical pre-R1 snapshot"));
      expect(requests).toHaveLength(before);
      expect(await page.$$eval('[data-testid="stage5-page"] input, [data-testid="stage5-page"] select', nodes => nodes.length)).toBe(0);
      expect(await page.$eval('[data-testid="stage5-drawing-ga"]', el => el.textContent)).toContain("Net free area");
    } finally { await page.close(); }
  });
  it.each(["incompatible", "missing"] as const)("fails explicitly for %s upstream geometry, keeps history readable", async problem => {
    mode = problem; requests = [];
    const page = await open();
    try {
      await page.waitForSelector('[data-testid="stage5-source-error"]');
      if (problem === "incompatible") expect(await page.$eval('[data-testid="stage5-source-error"]', e => e.textContent)).toContain("R1_GEOMETRY_INCOMPATIBLE: stack");
      expect(await page.$$eval("button", buttons => (buttons.find(b => b.textContent?.includes("Save immutable revision")) as HTMLButtonElement).disabled)).toBe(true);
      expect(requests.some(r => r.path.endsWith("/revisions"))).toBe(false);
      await page.$$eval("button", buttons => buttons.find(b => b.textContent?.includes("REV 1"))?.click());
      await page.waitForSelector('[data-testid="stage5-drawing-ga"]');
    } finally { await page.close(); }
  });
});