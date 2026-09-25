import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { predictiveNtProgress, type PredictiveProgressJob } from "../client/src/lib/predictive-nt-progress";
import { PredictiveNtProgress } from "../client/src/components/ecr-pre-pilot/predictive-nt-progress";

const running = (): PredictiveProgressJob => ({
  status: "running",
  input: { ntTest: 10 },
  progress: { completedStageTrials: 0, maximumStages: 1 },
  internalProgress: { completedInternalStages: 0, maximumInternalStages: 10 },
  result: null,
});
const stages = (count: number) => Array.from({ length: count }, (_, index) => ({ stageFromFeedEnd: index + 1 }));
const markup = (job: PredictiveProgressJob, monitoringPaused = false) =>
  renderToStaticMarkup(React.createElement(PredictiveNtProgress, { job, monitoringPaused }));

describe("Predictive N_T progress reporting", () => {
  it("shows indeterminate coupled work, not a fabricated zero percent", () => {
    const state = predictiveNtProgress(running());
    expect(state.indeterminate).toBe(true);
    expect(state.label).toContain("Running coupled N_T=10");
    expect(state.label).not.toContain("0/10");
    expect(state.detail).toContain("Percentage complete is not available");
    const html = markup(running());
    expect(html).toContain('role="progressbar"');
    expect(html).not.toContain("aria-valuenow");
    expect(html).toContain("predictive-nt-indeterminate");
  });

  it("reports actual audits separately from the single trial", () => {
    const job = running();
    job.internalProgress!.completedInternalStages = 6;
    expect(predictiveNtProgress(job)).toMatchObject({ completed: 6, maximum: 10, indeterminate: false });
    expect(markup(job)).toContain('aria-valuenow="6"');
    expect(markup(job)).toContain("6/10 stage audits recorded");
    expect(job.progress.completedStageTrials).toBe(0);
  });

  it("keeps finalization active after all audits, without claiming calculation completion", () => {
    const job = running();
    job.internalProgress!.completedInternalStages = 10;
    const state = predictiveNtProgress(job);
    expect(state.indeterminate).toBe(true);
    expect(state.label).toContain("Finalizing calculation");
    expect(markup(job)).not.toContain("aria-valuenow");
  });

  it("repairs stale completed 0/N only from the matching recorded stages", () => {
    const job = running();
    job.status = "completed";
    job.progress.completedStageTrials = 1;
    job.result = { trials: [{ stageCount: 10, stages: stages(10) }] };
    const before = JSON.stringify(job);
    expect(predictiveNtProgress(job)).toMatchObject({ completed: 10, maximum: 10, indeterminate: false });
    expect(markup(job)).toContain("Calculation completed — 10/10 stage audits recorded");
    expect(markup(job)).not.toContain("predictive-nt-indeterminate");
    expect(JSON.stringify(job)).toBe(before);
  });

  it("does not infer stage completion from status, trial count, or a different stage-count result", () => {
    const job = running();
    job.status = "completed";
    job.progress.completedStageTrials = 1;
    expect(predictiveNtProgress(job).completed).toBe(0);
    job.result = { trials: [{ stageCount: 1, stages: stages(1) }] };
    expect(predictiveNtProgress(job).completed).toBe(0);
  });

  it.each([
    [{ stageFromFeedEnd: 1 }, { stageFromFeedEnd: 1 }],
    [{ stageFromFeedEnd: 11 }],
    [{ stageFromFeedEnd: 0 }],
    [{ stageFromFeedEnd: 1.5 }],
  ])("does not turn invalid or duplicated stage records into completed audits: %j", (...invalidStages) => {
    const job = running();
    job.status = "completed";
    job.result = { trials: [{ stageCount: 10, stages: invalidStages }] };
    expect(predictiveNtProgress(job).completed).toBe(0);
  });

  it("rejects malformed counters and does not confuse null internal progress with 0/1 trials", () => {
    const job = running();
    job.internalProgress = null;
    expect(predictiveNtProgress(job)).toMatchObject({ completed: null, maximum: 10, indeterminate: true });
    job.internalProgress = { completedInternalStages: 11, maximumInternalStages: 10 };
    expect(predictiveNtProgress(job).completed).toBeNull();
    job.internalProgress = { completedInternalStages: 6, maximumInternalStages: 7 };
    expect(predictiveNtProgress(job).completed).toBeNull();
  });

  it("shows pending without a completion percentage", () => {
    const job = running();
    job.status = "pending";
    expect(predictiveNtProgress(job).label).toContain("Waiting for an available solver");
    expect(markup(job)).not.toContain("aria-valuenow");
  });

  it("stops activity animation on failure or cancellation and retains only observed audits", () => {
    const job = running();
    job.status = "failed";
    job.internalProgress!.completedInternalStages = 3;
    expect(predictiveNtProgress(job)).toMatchObject({ active: false, completed: 3, indeterminate: false });
    expect(markup(job)).toContain("Calculation stopped or failed");
    expect(markup(job)).not.toContain("predictive-nt-indeterminate");
  });

  it("does not imply live monitoring when polling is paused", () => {
    expect(predictiveNtProgress(running(), true)).toMatchObject({ active: false, indeterminate: false });
    expect(markup(running(), true)).toContain("Monitoring paused");
    expect(markup(running(), true)).not.toContain("predictive-nt-indeterminate");
  });

  it("keeps historical multi-trial runs on their own denominator", () => {
    const job = running();
    job.input = {};
    job.progress = { completedStageTrials: 3, maximumStages: 10 };
    expect(predictiveNtProgress(job)).toMatchObject({ completed: 3, maximum: 10, indeterminate: false });
    expect(predictiveNtProgress(job).label).toContain("3/10 stage trials recorded");
  });

  it("reports the immutable 1..10 sweep as acknowledged trial checkpoints", () => {
    const job = running();
    job.input = { engineContractVersion: "7C-1.6.0" };
    job.internalProgress = null;
    job.progress = { completedStageTrials: 4, maximumStages: 10 };
    expect(predictiveNtProgress(job)).toMatchObject({ completed: 4, maximum: 10, indeterminate: false });
    expect(predictiveNtProgress(job).label).toContain("Evaluating N_T=1…10 sweep");
    expect(markup(job)).toContain("4/10 N_T trial checkpoints recorded");
  });

  it("recognizes one-stage completion without changing acceptance data", () => {
    const job = running();
    job.status = "completed";
    job.input = { ntTest: 1 };
    job.internalProgress = { completedInternalStages: 0, maximumInternalStages: 1 };
    const rejectedTrial = { stageCount: 1, stages: stages(1), accepted: false };
    job.result = { trials: [rejectedTrial] };
    expect(predictiveNtProgress(job).completed).toBe(1);
    expect(markup(job)).toContain("separate from product-target acceptance");
  });
});