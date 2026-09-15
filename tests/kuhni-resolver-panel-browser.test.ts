import { execSync } from "node:child_process";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer as createViteServer, type ViteDevServer } from "vite";

const fixturePath = "/task297-kuhni-resolver-panel-fixture";

function chromiumPath(): string {
  return execSync("command -v chromium || command -v chromium-browser", { encoding: "utf8" }).trim();
}

function fixtureHtml() {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><title>Task 297 Kühni panel fixture</title></head>
  <body>
    <main id="root"></main>
    <script type="module">
      import React from "react";
      import { createRoot } from "react-dom/client";
      import "/src/index.css";
      import { KuhniResolverPanel } from "/src/components/ecr-pre-pilot/kuhni-hydrodynamics-card.tsx";

      const run = {
        status: "NOT_CALCULABLE",
        engine: {
          id: "kuhni_geometry_resolver",
          version: "KUHNI_GEOMETRY_RESOLVER_V1.0.1",
          implementationHash: "task297-engine-hash"
        },
        theoreticalStagesUsed: {
          value: 5,
          provenance: "STAGE_2_CALCULATED_NT",
          label: "Stage 2 accepted N_T",
          stage2JobId: "stage-2-accepted",
          stage2ResultHash: "stage-2-result-hash"
        },
        processBasis: {
          phaseConfiguration: "rrbo-continuous-nmp-dispersed",
          rrboFeed: { identity: "RRBO_FEED", densityKgM3: 869 },
          wetSolventPhase: { identity: "WET_NMP_SOLVENT_PHASE", densityKgM3: 1015 }
        },
        hydraulicRpmEnvelope: [],
        rejectedRpmTrials: [
          { rpm: 5, reason: "NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS" },
          { rpm: 10, reason: "NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS" }
        ],
        rootFailureReason: {
          code: "CONTINUOUS_PHASE_MUST_BE_HEAVIER",
          message: "No in-range diameter root was retained after the frozen hydraulic prerequisite failed."
        },
        hydraulicResolvedColumnDiameterM: 9.876,
        hydraulicDiagnosticPoint: { status: "CALCULATED_IN_RANGE", columnDiameterM: 9.876 },
        coupledSelection: { status: "DEPENDENCY_BLOCKED", blocker: "Mass transfer pending." }
      };
      createRoot(document.getElementById("root")).render(
        React.createElement(KuhniResolverPanel, { run, runCount: 1 })
      );
    </script>
  </body>
</html>`;
}

describe.sequential("Task 297 Kühni resolver panel browser fixture", () => {
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

  it("renders rejected reasons and inferred prerequisite without an old diameter fallback", async () => {
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    try {
      await page.goto(`${origin}${fixturePath}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForSelector('[data-testid="kuhni-hydraulic-prerequisite"]', {
          visible: true,
          timeout: 30_000,
        });
      } catch (error) {
        throw new Error([
          error instanceof Error ? error.message : String(error),
          pageErrors.length ? `pageerror: ${pageErrors.join(" | ")}` : "",
          consoleErrors.length ? `console.error: ${consoleErrors.join(" | ")}` : "",
        ].filter(Boolean).join("\n"));
      }
      const text = await page.$eval("main", (element) => (element as HTMLElement).innerText.replace(/\s+/g, " ").trim());
      const normalizedText = text.toLocaleLowerCase();
      expect(normalizedText).toContain("stage 2 authority");
      expect(normalizedText).toContain("accepted n_t 5");
      expect(normalizedText).toContain("stage 3 hydraulic disposition");
      expect(normalizedText).toContain("unsupported");
      expect(normalizedText).toContain("continuous_phase_must_be_heavier");
      expect(normalizedText).toContain("no_diameter_root_within_physical_bounds");
      expect(normalizedText).toContain("hydraulic root admission result");
      expect(normalizedText).not.toContain("9.876");
      await page.screenshot({
        path: "test-artifacts/task297-kuhni-resolver-panel.png",
        fullPage: true,
      });
    } finally {
      await page.close();
    }
  }, 60_000);
});