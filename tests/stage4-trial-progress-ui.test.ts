import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TrialProgress, { Stage4FailureReason, Stage4SolverTelemetry } from "../client/src/components/ecr-pre-pilot/stage4-trial-progress";

describe("Stage 4 counted progress and failure reasons", () => {
  it("shows recorded iteration, one-based cell and timings without inventing completion", () => {
    const html = renderToStaticMarkup(React.createElement(Stage4SolverTelemetry, {
      telemetry: { operation: "INTERFACE_SOLVE_STARTED", iteration: 3, cellIndex: 6,
        totalCells: 10, interfaceCallsCompleted: 26, interfaceCallsAttempted: 27,
        elapsedMs: 150000, operationElapsedMs: 0, residuals: { balance: 0.002 },
        checkpointTimestamp: "2026-09-14T07:00:00.000Z" },
    }));
    expect(html).toContain("Iteration: 3");
    expect(html).toContain("Cell: 7 / 10");
    expect(html).toContain("Interface solves completed: 26");
    expect(html).toContain("150.0 s");
    expect(html).toContain("2.000e-3");
    expect(html).toContain("not an acceptance verdict");
    expect(html).not.toContain("<progress");
  });
  it("does not manufacture solver details for old snapshots", () => {
    expect(renderToStaticMarkup(React.createElement(Stage4SolverTelemetry, { telemetry: undefined }))).toBe("");
    const html = renderToStaticMarkup(React.createElement(Stage4SolverTelemetry, {
      telemetry: { operation: "INLET_FLASH_STARTED", iteration: null, cellIndex: null },
    }));
    expect(html).not.toContain("Cell:");
    expect(html).not.toContain("Iteration:");
    expect(html).toContain("Not recorded");
  });
  it("counts completed trials, not the current count number or the upper search bound", () => {
    const html = renderToStaticMarkup(React.createElement(TrialProgress, {
      minimum: 5, maximum: 80, notRun: false,
      progress: {
        primary: { completedPhysicalTrials: 1, resolvedPhysicalTrials: 0,
          unresolvedPhysicalTrials: 1, lastCompletedPhysicalCount: 5 },
        sensitivity: { completedPhysicalTrials: 0, resolvedPhysicalTrials: 0,
          unresolvedPhysicalTrials: 0 },
      },
    }));
    expect(html).toContain("Completed trials: 1 / 76");
    expect(html).toContain("Completed trials: 0 / 76");
    expect(html).toContain('value="1" max="76"');
    expect(html).toContain("Maximum physical count: 80");
    expect(html).toContain("Last completed physical count: 5");
    expect(html).toContain("Resolved: 0");
    expect(html).toContain("Numerically unresolved: 1");
  });
  it("does not invent counters for historical runs that did not record them", () => {
    const html = renderToStaticMarkup(React.createElement(TrialProgress, {
      minimum: 5, maximum: 80, notRun: false, progress: {},
    }));
    expect(html).toContain("Completed trials: Not recorded / 76");
    expect(html).not.toContain("<progress");
  });
  it("shows zero for a genuinely unrun version and distinguishes historical timeout", () => {
    const html = renderToStaticMarkup(React.createElement(TrialProgress, {
      minimum: 5, maximum: 80, notRun: true, progress: {},
    }));
    expect(html).toContain("Completed trials: 0 / 76");
    const failure = renderToStaticMarkup(React.createElement(Stage4FailureReason, {
      code: "GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED", historical: true,
    }));
    expect(failure).toContain("Time limit reached");
    expect(failure).toContain("not a physical-infeasibility verdict");
    expect(failure).toContain("older calculation version");
    expect(failure).toContain("No automatic retry");
  });
});