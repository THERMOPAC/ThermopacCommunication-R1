import { execSync } from "node:child_process";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer as createViteServer, type ViteDevServer } from "vite";

const fixturePath = "/ecr-stage3-geometry-report-fixture";
const screenshotPrefix = "/tmp/ecr-stage3-geometry-report";

function chromiumPath(): string {
  return execSync("command -v chromium || command -v chromium-browser", { encoding: "utf8" }).trim();
}

function fixtureHtml() {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><title>Stage 3 geometry report fixture</title></head>
  <body>
    <main id="root"></main>
    <script type="module">
      import React from "react";
      import { createRoot } from "react-dom/client";
      import "/src/index.css";
      import { Stage3Stage4OptimizerPanel } from "/src/components/ecr-pre-pilot/stage3-stage4-optimizer-panel.tsx";
      import { Stage3GeometryBasisReport } from "/src/components/ecr-pre-pilot/stage3-geometry-basis-report.tsx";

      const selectedRun = {
        id: "browser-fixture",
        status: "CALCULATED",
        selectedGeometry: {
          columnDiameterM: 0.8,
          compartmentHeightM: 0.2,
          hcToColumn: 0.25,
          rotorDiameterM: 0.4,
          rotorToColumn: 0.5,
          freeArea: 0.4
        },
        controls: {
          hcToColumn: [0.2, 0.25, 0.3],
          rotorToColumn: [0.33, 0.4, 0.5],
          freeArea: [0.2, 0.3, 0.4],
          minimumUsefulWindowRpm: 20
        },
        selectedOperatingWindow: { rpmMin: 30, rpmMax: 60, widthRpm: 30 },
        selectedRpm: 45,
        orientationComparison: []
      };
      window.fetch = async () => new Response(JSON.stringify({ result: selectedRun }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

      createRoot(document.getElementById("root")).render(
        React.createElement(React.Fragment, null,
          React.createElement("div", { "data-testid": "integrated-panel" },
            React.createElement(Stage3Stage4OptimizerPanel, { designId: 42 })
          ),
          React.createElement("div", { "data-testid": "empty-report" },
            React.createElement(Stage3GeometryBasisReport, { run: null })
          )
        )
      );
    </script>
  </body>
</html>`;
}

async function openFixture(browser: Browser, origin: string, width: number, height: number): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`${origin}${fixturePath}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="integrated-panel"]')?.textContent?.includes("0.25"),
    { timeout: 30_000 },
  );
  return page;
}

describe.sequential("Stage 3 geometry report browser fixture", () => {
  let vite: ViteDevServer;
  let http: Server;
  let browser: Browser;
  let origin: string;
  let previousReplId: string | undefined;

  beforeAll(async () => {
    previousReplId = process.env.REPL_ID;
    delete process.env.REPL_ID;
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    http = createHttpServer(async (request, response) => {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (pathname === fixturePath) {
        const html = await vite.transformIndexHtml(request.url ?? fixturePath, fixtureHtml());
        response.statusCode = 200;
        response.setHeader("content-type", "text/html");
        response.end(html);
        return;
      }
      vite.middlewares(request, response, () => {
        response.statusCode = 404;
        response.end("Not found");
      });
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    browser = await puppeteer.launch({
      executablePath: chromiumPath(),
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => http?.close(() => resolve()));
    await vite?.close();
    if (previousReplId === undefined) delete process.env.REPL_ID;
    else process.env.REPL_ID = previousReplId;
  });

  it.each([
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ])("renders truthful, read-only evidence without page overflow at %s", async (name, width, height) => {
    const page = await openFixture(browser, origin, width, height);
    try {
      const result = await page.evaluate(() => {
        const integrated = document.querySelector('[data-testid="integrated-panel"]') as HTMLElement;
        const empty = document.querySelector('[data-testid="empty-report"]') as HTMLElement;
        const report = integrated.querySelector(
          'section[aria-label="Stage 3 geometry basis and correlation applicability"]',
        ) as HTMLElement;
        const scrollContainer = report.querySelector(".overflow-x-auto") as HTMLElement;
        const normalize = (text: string | null | undefined) => text?.replace(/\\s+/g, " ").trim() ?? "";
        return {
          integratedText: normalize(report.textContent),
          emptyText: normalize(empty.textContent),
          sourceRoles: Array.from(report.querySelectorAll("h5")).map(element => normalize(element.textContent)),
          editableCount: report.querySelectorAll("input, select, textarea, button, [contenteditable=true]").length,
          pageClientWidth: document.documentElement.clientWidth,
          pageScrollWidth: document.documentElement.scrollWidth,
          reportClientWidth: report.clientWidth,
          reportScrollWidth: report.scrollWidth,
          containerClientWidth: scrollContainer.clientWidth,
          containerScrollWidth: scrollContainer.scrollWidth,
          containerOverflowX: getComputedStyle(scrollContainer).overflowX,
        };
      });

      expect(result.sourceRoles).toEqual([
        "1. Design/search envelope — Perry / Pratt–Stevens",
        "2. Correlation applicability/extrapolation — K&H / Garthe",
        "3. Physical construction reference — Garthe / Weber–Jupke",
      ]);
      expect(result.integratedText).toContain("0.25");
      expect(result.integratedText).toContain("Below K&H marginal range — geometry extrapolation");
      expect(result.integratedText).toContain("Within K&H marginal range — joint applicability not established");
      expect(result.integratedText).toContain("Within K&H numerical range — area mapping unresolved");
      expect(result.emptyText).toContain("Unavailable");
      expect(result.emptyText).toContain("Not assessed — no finite selected value");
      expect(result.emptyText).not.toMatch(/Selected 0(?:\\.0+)?(?:\\s|K&H)/);
      expect(result.editableCount).toBe(0);
      expect(result.pageScrollWidth).toBeLessThanOrEqual(result.pageClientWidth);
      expect(result.reportScrollWidth).toBeLessThanOrEqual(result.reportClientWidth);
      expect(result.containerOverflowX).toBe("auto");
      if (name === "mobile") {
        expect(result.containerScrollWidth).toBeGreaterThan(result.containerClientWidth);
      }

      await page.screenshot({
        path: `${screenshotPrefix}-${name}.png`,
        fullPage: true,
      });
    } finally {
      await page.close();
    }
  }, 60_000);
});