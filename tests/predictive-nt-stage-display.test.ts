import { describe, expect, it } from "vitest";
import {
  predictiveNtStageDisplay,
  type PredictiveStageDisplayJob,
} from "../client/src/lib/predictive-nt-stage-display";

const runningJob = (): PredictiveStageDisplayJob => ({
  id: "current-job",
  status: "running",
  input: { ntTest: 10 },
  progress: { maximumStages: 1 },
  internalProgress: {
    completedInternalStages: 0,
    maximumInternalStages: 10,
  },
  result: null,
});

const stage = (stageFromFeedEnd: number, residual = stageFromFeedEnd * 1e-10) => ({
  stageFromFeedEnd,
  maximumComponentBalanceResidualMol: residual,
  isoactivityLogResidual: residual,
});

describe("Predictive N_T live stage display projection", () => {
  it("renders all ten audit rows when the result snapshot contains only internal progress", () => {
    const job = runningJob();
    job.internalProgress!.completedInternalStages = 3;
    job.result = { internalProgress: job.internalProgress };

    const display = predictiveNtStageDisplay(job);

    expect(display.maximum).toBe(10);
    expect(display.rows).toHaveLength(10);
    expect(display.recordedCount).toBe(0);
    expect(display.observedAuditCount).toBe(3);
    expect(display.rows.slice(0, 3).map((row) => row.status)).toEqual([
      "AUDIT_OBSERVED_NO_PAYLOAD",
      "AUDIT_OBSERVED_NO_PAYLOAD",
      "AUDIT_OBSERVED_NO_PAYLOAD",
    ]);
    expect(display.rows.slice(3).every((row) => row.status === "AWAITING_AUDIT")).toBe(true);
    expect(display.reason).toContain("full trial checkpoint");
  });

  it("does not invent rows or values when no result snapshot exists", () => {
    const display = predictiveNtStageDisplay(runningJob());

    expect(display.rows.every((row) => row.status === "NO_RESULT_SNAPSHOT")).toBe(true);
    expect(display.rows.every((row) => row.stage === null)).toBe(true);
    expect(display.reason).toContain("No result snapshot");
  });

  it("uses every genuine stage record from a complete current-job checkpoint", () => {
    const job = runningJob();
    job.status = "completed";
    job.result = {
      trials: [{
        stageCount: 10,
        stages: Array.from({ length: 10 }, (_, index) => stage(index + 1)),
      }],
    };

    const display = predictiveNtStageDisplay(job);

    expect(display.recordedCount).toBe(10);
    expect(display.rows.every((row) => row.status === "RECORDED")).toBe(true);
    expect(display.rows[9].stage?.maximumComponentBalanceResidualMol).toBe(1e-9);
    expect(display.reason).toContain("persisted trial checkpoint");
  });

  it("keeps partial stage arrays partial without treating absent values as zero or pass", () => {
    const job = runningJob();
    job.internalProgress!.completedInternalStages = 3;
    job.result = {
      trials: [{
        stageCount: 10,
        stages: [stage(1), stage(3, 3e-10)],
      }],
    };

    const display = predictiveNtStageDisplay(job);

    expect(display.recordedCount).toBe(2);
    expect(display.rows[0].status).toBe("RECORDED");
    expect(display.rows[1].status).toBe("AUDIT_OBSERVED_NO_PAYLOAD");
    expect(display.rows[1].stage).toBeNull();
    expect(display.rows[2].status).toBe("RECORDED");
    expect(display.rows.slice(3).every((row) => row.status === "AWAITING_AUDIT")).toBe(true);
  });

  it("rejects a result explicitly identified as belonging to a previous run", () => {
    const job = runningJob();
    job.result = {
      sourceJobId: "previous-job",
      trials: [{ stageCount: 10, stages: [stage(1)] }],
    };

    const display = predictiveNtStageDisplay(job);

    expect(display.recordedCount).toBe(0);
    expect(display.rows.every((row) => row.status === "NO_RESULT_SNAPSHOT")).toBe(true);
  });
});