import { execSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { describe, expect, it } from "vitest";
import { buildStage5R1Geometry, R1_COMPLETE } from "../shared/ecr-stage5-r1";
import { renderStage5Svg, type Stage5DrawingView } from "../shared/ecr-stage5-drawings";
import { calculateEndSections } from "../shared/ecr-stage5-end-sections";
import { renderEndSchematic } from "../shared/ecr-stage5-end-schematic";

// Browser-only isolated fixtures: no API request can reach the real database.
// Explicit opt-in uses an already-running preview; never starts a workflow.
describe.skipIf(!process.env.END_BROWSER_ORIGIN)("integrated end-section browser fixture", () => {
  it("edits, recalculates, saves, reloads and downloads; revokes stale authority", async () => {
    const api = "/api/ecr-pre-pilot/designs/47/stage5";
    const basis = {
      stage3ResultId: "3", stage4ResultId: "4", sourcesCurrent: true, sourcesCompatible: true,
      columnDiameterM: .7, rotorDiameterM: .35, rotorDiameterRatio: .5, compartmentHeightM: .21,
      compartmentCount: 20, requiredActiveHeightM: 4.2, installedActiveHeightM: 4.2,
      designNt: 4.2, hetsM: 1, statorFreeAreaRatio: .4, selectedRpm: 50, rpmMin: 30, rpmMax: 70,
      phaseConfiguration: "NMP continuous / RRBO dispersed",
    };
    const geometry = buildStage5R1Geometry(basis);
    const revision = { id: "501", revision: 2, createdAt: "2026-09-10T12:00:00Z",
      inputs: geometry.inputs, geometry, sourceHash: "fixture-active", currentness: "CURRENT", status: R1_COMPLETE,
      drawings: Object.fromEntries((["ga", "section", "compartment", "rotor", "stator"] as Stage5DrawingView[])
        .map(view => [view, renderStage5Svg(geometry, view)])) };
    let saved: any = null, reject = false;
    const calculations: string[] = [], writes: any[] = [], errors: string[] = [];
    const dir = resolve("screenshots");
    mkdirSync(dir, { recursive: true });
    const download = resolve(dir, "stage5-conditional-end-assemblies.svg");
    const gaDownload = resolve(dir, "stage5-current-conditional-ga.svg");
    if (existsSync(download)) rmSync(download);
    if (existsSync(gaDownload)) rmSync(gaDownload);
    const browser = await puppeteer.launch({
      executablePath: execSync("command -v chromium", { encoding: "utf8" }).trim(),
      headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1000 });
      await (await page.createCDPSession()).send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
      page.on("pageerror", e => errors.push(String(e)));
      await page.setRequestInterception(true);
      page.on("request", q => {
        const u = new URL(q.url()), p = u.pathname;
        const send = (body: unknown, status = 200) => void q.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (p === "/api/user") return send({ id: 9001, username: "end-browser-fixture", role: "Superuser", passwordNeedsUpdate: false, requiresPasswordUpdate: false });
        if (p === "/api/2fa/status") return send({ enabled: true });
        if (p === "/api/attendance/status") return send({ hasRecord: true, record: { checkInTime: "2026-09-09T08:00:00Z" }, canCheckIn: false, canCheckOut: true });
        if (p === "/api/usage-tracker/summary") return send({ monthlyTotal: 0, monthlyLimit: 100, monthlyPercent: 0, dailyTotal: 0, dailyLimit: 10, dailyPercent: 0, remainingDaily: 10, warningLevel: "none", softBlockEnabled: false });
        if (p === "/api/ecr-pre-pilot/designs/latest-saved") return send({ id: 47 });
        if (p === `${api}/basis`) return send({ basis, sourceHash: "fixture-active" });
        if (p === `${api}/preview`) return send(geometry);
        if (p === `${api}/revisions`) return send([revision]);
        if (p === `${api}/revisions/501`) return send(revision);
        if (p === `${api}/end-sections/selections`) return send(saved);
        if (p.startsWith(`${api}/revisions/501/end-sections`)) {
          if (reject) return send({ error: "STAGE5_END_SOURCE_CHANGED" }, 409);
          if (q.method() === "POST") {
            const body = JSON.parse(q.postData()!); writes.push(body);
            saved = { sourceHash: body.expectedSourceHash, selection: { topDiameterM: body.topDiameterM, bottomDiameterM: body.bottomDiameterM } };
            return send(saved);
          }
          calculations.push(u.search);
          const result = { ...calculateEndSections({
            designFeedRateLph: 4000, rrboDensityKgM3: 869, nmpDensityKgM3: 1015, solventOilRatio: .6,
            oilComponentWt: [60, 15, 10, 8, 6, 1], nmpPurityWt: 98, nmpWaterWt: 2,
          }, { topDiameterM: Number(u.searchParams.get("topDiameterM")), bottomDiameterM: Number(u.searchParams.get("bottomDiameterM")) }),
          sourceHash: "fixture-end-current", stage1Hash: "fixture-stage1",
          active: { revisionId: "501", diameterM: .7, compartmentCount: 20, installedActiveHeightM: 4.2 } };
          if (p.endsWith("export.svg")) return void q.respond({ status: 200, contentType: "image/svg+xml", body: renderEndSchematic(result) });
          if (p.endsWith("ga.svg")) return void q.respond({ status: 200, contentType: "image/svg+xml", body: renderEndSchematic(result, "ga") });
          return send(result);
        }
        if (p.startsWith("/api/")) return send([]);
        void q.continue();
      });
      const click = (text: string) => page.$$eval("button", (buttons, label) => buttons.find(b => b.textContent?.trim() === label)?.click(), text);
      const openSaved = async () => {
        await page.waitForSelector('[data-testid="stage5-page"]');
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent?.includes("REV 2")));
        await page.$$eval("button", bs => bs.find(b => b.textContent?.includes("REV 2"))?.click());
        await page.waitForSelector('[data-testid="end-assembly-schematic"] svg');
        await page.waitForSelector('[data-testid="stage5-current-ga"] [data-part="integrated-frozen-active"]');
      };
      await page.goto(`${process.env.END_BROWSER_ORIGIN}/design-software/ecr-pre-pilot-design/stage-5`, { waitUntil: "domcontentloaded" });
      await openSaved();
      const activeBefore = await page.$eval('[data-testid="stage5-current-ga"] [data-part="integrated-frozen-active"]', el => el.outerHTML);
      const historicalBefore = JSON.stringify(revision);
      expect(new URL(page.url()).pathname).toBe("/design-software/ecr-pre-pilot-design/stage-5");
      await page.select('select[aria-label="top comparison diameter"]', "1");
      await page.select('select[aria-label="bottom comparison diameter"]', "1.2");
      await page.waitForFunction(() => document.querySelector('[data-testid="stage5-end-sections"]')?.textContent?.includes("bottom assembly · Ø1200 mm"));
      expect(calculations.at(-1)).toContain("topDiameterM=1&bottomDiameterM=1.2");
      await page.waitForFunction(() => document.querySelector('[data-testid="stage5-current-ga"] [data-end-profile="top"]')?.getAttribute("data-shell-width") === "210"
        && document.querySelector('[data-testid="stage5-current-ga"] [data-end-profile="bottom"]')?.getAttribute("data-shell-width") === "252");
      expect(await page.$eval('[data-testid="stage5-current-ga"] [data-part="integrated-frozen-active"]', el => el.outerHTML)).toBe(activeBefore);
      expect(JSON.stringify(revision)).toBe(historicalBefore);
      expect(await page.$$eval("button", bs => bs.some(b => b.textContent?.trim() === "Historical PDF package"))).toBe(true);
      expect(await page.$$eval("button", bs => bs.some(b => b.textContent?.trim() === "Historical SVG view"))).toBe(true);
      await click("Save end selections");
      await page.waitForFunction(() => document.querySelector('[data-testid="end-selection-currentness"]')?.textContent?.includes("SAVED COMPARISONS"));
      expect(writes).toEqual([{ topDiameterM: 1, bottomDiameterM: 1.2, expectedSourceHash: "fixture-end-current" }]);
      await page.reload({ waitUntil: "domcontentloaded" }); await openSaved();
      expect(await page.$eval('select[aria-label="top comparison diameter"]', e => (e as HTMLSelectElement).value)).toBe("1");
      expect(await page.$eval('select[aria-label="bottom comparison diameter"]', e => (e as HTMLSelectElement).value)).toBe("1.2");
      expect(await page.$eval('[data-testid="end-selection-currentness"]', e => e.textContent)).toContain("NORMAL_PRODUCT_AUTHORITY_PENDING");
      const normalText = await page.$eval('[data-testid="end-normal-process-basis"]', e => e.textContent);
      expect(normalText).toContain("Normal wet solvent: 0.6");
      expect(normalText).toContain("Combined NORMAL feed: 5561.600");
      expect(normalText).not.toContain("8690.000");
      expect(await page.$eval('[data-testid="end-nozzle-only-basis"]', e => e.textContent)).toContain("5214.000");
      await click("Export conditional SVG");
      await expect.poll(() => existsSync(download), { timeout: 10000 }).toBe(true);
      expect(readFileSync(download, "utf8")).toContain("PENDING NORMAL PRODUCT AUTHORITY");
      expect(readFileSync(download, "utf8")).toContain("S/O=1.5 MASS FOR NOZZLES ONLY");
      expect(readFileSync(download, "utf8")).toContain("NOT TO SCALE");
      const displayedGa = await page.$eval('[data-testid="stage5-current-ga"] svg[data-projection="current-conditional-ga"]', el => el.outerHTML);
      await click("Current conditional GA SVG");
      await expect.poll(() => existsSync(gaDownload), { timeout: 10000 }).toBe(true);
      const exportedGa = readFileSync(gaDownload, "utf8");
      expect(exportedGa).toContain('data-projection="current-conditional-ga"');
      expect(exportedGa).toContain('data-shell-width="210"');
      expect(exportedGa).toContain('data-shell-width="252"');
      expect(exportedGa).toContain('data-active-height-m="4.2"');
      expect(displayedGa).toContain('data-active-height-m="4.2"');
      const panel = await page.$('[data-testid="stage5-end-sections"]');
      await panel!.evaluate(el => el.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: resolve(dir, "end-sections.png"), fullPage: false });
      // The app has an inner scrolling layout. Give the full GA sufficient
      // viewport height and scroll that element explicitly, avoiding a clipped
      // element screenshot that would hide the top header or bottom dish.
      await page.setViewport({ width: 1440, height: 2200 });
      const gaPanel = await page.$('[data-testid="stage5-current-ga"]');
      await gaPanel!.evaluate(el => el.scrollIntoView({ block: "start" }));
      await gaPanel!.screenshot({ path: resolve(dir, "stage5-current-ga.png") });
      reject = true; await click("Refresh authority");
      await page.waitForFunction(() => document.querySelector('[data-testid="stage5-end-sections"]')?.textContent?.includes("STAGE5_END_SOURCE_CHANGED"));
      expect(await page.$('[data-testid="end-assembly-schematic"]')).toBeNull();
      expect(await page.$('[data-testid="stage5-current-ga"]')).toBeNull();
      expect(await page.$('[data-testid="stage5-current-ga-unavailable"]')).not.toBeNull();
      expect(await page.$eval('[data-testid="export-current-ga"]', el => (el as HTMLButtonElement).disabled)).toBe(true);
      expect(await page.$$eval("button", bs => bs.find(b => b.textContent?.trim() === "Save end selections")?.disabled)).toBe(true);
      expect(errors).toEqual([]);
    } finally { await browser.close(); }
  }, 120000);
});