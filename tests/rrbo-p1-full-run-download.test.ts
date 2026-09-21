import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { build } from "esbuild";
import puppeteer from "puppeteer-core";
import { assertCompleteRun, buildHydraulicCsv, hydraulicCsvCell, hydraulicRows } from "../client/src/components/ecr-pre-pilot/p1-full-run-download";

const fixture = () => ({
  id: "saved", sourceSnapshotHash: "basis", phaseConfiguration: "a",
  result: { orientationComparison: [
    { orientation: "a", geometryGrid: [{ geometry: { columnDiameterM: .7, freeArea: .3 },
      trials: [{ rpm: 30, status: "FEASIBLE", hydraulicMethod: { scenarios: Array.from({ length: 6 }, (_, i) =>
        ({ coefficient: .36, loading: i / 10, d32M: .00123456789123, operatingRoots: [.01, .2],
          continuation: [{ flowFraction: .0625, holdup: .001 }], operatingBalanceResidualMS: -1e-17 })) } },
      { rpm: 35, status: "INVALID", reasons: ["=unsafe,\"quoted\"\nreason"], hydraulicMethod: { scenarios: [] } }] }] },
    { orientation: "b", geometryGrid: [{ geometry: { columnDiameterM: 1.5 }, trials: [
      { rpm: 200, status: "REJECTED", hydraulicMethod: { scenarios: [{ loading: null, branchStatus: "NO_DILUTE_CONNECTED_ROOT" }] } },
    ] }] },
  ] },
});

describe("complete saved hydraulic export", () => {
  it("includes all orientations, rejected/invalid/zero-scenario trials and exact units/values", async () => {
    const run = fixture();
    const rows = [...hydraulicRows(run)];
    expect(rows).toHaveLength(8);
    expect(rows[0]["geometry.columnDiameterM"]).toBe(.7);
    expect(rows[0]["scenario.d32M"]).toBe(.00123456789123);
    expect(rows[0]["scenario.operatingBalanceResidualMS"]).toBe(-1e-17);
    expect(rows[6]["scenario.present"]).toBe(false);
    expect(rows[6]["scenario.index"]).toBeNull();
    expect(rows[7].orientation).toBe("b");
    expect(rows[7]["trial.rpm"]).toBe(200);
    const csv = buildHydraulicCsv(run);
    expect(csv.trialCount).toBe(3);
    expect(csv.rowCount).toBe(8);
    const text = await csv.blob.text();
    expect(text).toContain('"scenario.operatingRoots"');
    expect(text).toContain('"[0.01,0.2]"');
    expect(text).toContain('"0.00123456789123"');
    expect(text).toContain('"-1e-17"');
    expect(text).not.toContain("Not available");
  });
  it("protects spreadsheet text without changing scientific numbers", () => {
    for (const text of ["=x", "+x", "-x", "@x", "\t=x", "\r=x"]) expect(hydraulicCsvCell(text)).toContain("'");
    expect(hydraulicCsvCell(-.123)).toBe('"-0.123"');
    expect(hydraulicCsvCell(null)).toBe('""');
    expect(hydraulicCsvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
  it("fails closed on missing/mismatched identity, stale evidence or summary-only payload", () => {
    const run = fixture();
    expect(() => assertCompleteRun(run, run)).not.toThrow();
    for (const wrong of [{ ...run, id: undefined }, { ...run, sourceSnapshotHash: undefined },
      { ...run, id: "other" }, { ...run, stale: true }, { ...run, summaryOnly: true },
      { ...run, result: {} }]) expect(() => assertCompleteRun(wrong, run)).toThrow();
  });
  it("counts every raw trial and scenario in the authentic saved full-grid artifact", () => {
    const saved = JSON.parse(readFileSync("deliverables/p1-research-regression/integrated-saved-artifact.json", "utf8"));
    const run = { ...saved.metadata, result: saved.result };
    const groups = run.result.orientationComparison.flatMap((o: any) => o.geometryGrid);
    const trials = groups.flatMap((g: any) => g.trials);
    const expectedRows = trials.reduce((n: number, t: any) => n + Math.max(1, t.hydraulicMethod?.scenarios?.length ?? 0), 0);
    let rows = 0;
    let first: any, last: any;
    for (const row of hydraulicRows(run)) { first ??= row; last = row; rows++; }
    expect(rows).toBe(expectedRows);
    expect(first["trial.rpm"]).toBe(trials[0].rpm);
    expect(last["trial.rpm"]).toBe(trials.at(-1).rpm);
    expect(trials.some((t: any) => t.status !== "FEASIBLE")).toBe(true);
    console.info(`Authentic saved grid: ${trials.length} trials; ${rows} exported trial/scenario rows.`);
  }, 30_000);
});

it("visible complete-run buttons load lazily, share inspection request, retry errors and never POST", async () => {
  const compiled = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { P1CandidateResults } from './client/src/components/ecr-pre-pilot/p1-candidate-panel';
      window.mount = run => createRoot(document.getElementById('root')).render(React.createElement(P1CandidateResults, {run, fullUrl:'/detail'}));
      window.downloads = [];
      URL.createObjectURL = blob => { window.downloads.push(blob); return 'blob:test'; };
      HTMLAnchorElement.prototype.click = () => {};
    `, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", jsx: "automatic", alias: { "@": resolve("client/src") },
  });
  const browser = await puppeteer.launch({
    executablePath: execSync("command -v chromium || command -v chromium-browser", { encoding: "utf8" }).trim(),
    headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    const requests: string[] = [];
    let failure = true;
    await page.setRequestInterception(true);
    page.on("request", req => {
      if (req.isNavigationRequest()) { void req.respond({ status: 200, contentType: "text/html", body: '<div id="root"></div>' }); return; }
      if (!req.url().endsWith("/detail")) { void req.abort(); return; }
      requests.push(req.method());
      setTimeout(() => void req.respond({ status: failure ? 500 : 200, contentType: "application/json",
        body: JSON.stringify(failure ? { error: "Evidence unavailable" } : fixture()) }), 150);
    });
    await page.goto("http://export.test");
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
    await page.evaluate(run => (window as any).mount(run), { ...fixture(), summaryOnly: true, result: { status: "COMPLETE" } });
    await page.waitForSelector('[data-testid="complete-hydraulic-download"] button');
    expect(requests).toEqual([]);
    await page.click('[data-testid="complete-hydraulic-download"] button');
    await page.waitForFunction(() => document.body.textContent?.includes("Evidence unavailable"));
    failure = false;
    await page.click('[data-testid="complete-hydraulic-download"] button');
    await page.click("details > summary");
    await page.waitForFunction(() => document.body.textContent?.includes("Downloaded 3 trials, 8"));
    expect(requests).toEqual(["GET", "GET"]);
    await page.click('[data-testid="complete-hydraulic-download"] button:nth-child(2)');
    await page.waitForFunction(() => (window as any).downloads.length === 2);
    expect(requests).toEqual(["GET", "GET"]);
    const downloaded = await page.evaluate(async () => JSON.parse(await (window as any).downloads[1].text()));
    expect(downloaded).toEqual(fixture());
  } finally { await browser.close(); }
}, 30_000);