import { describe, expect, it } from "vitest";
import { predictiveStageVerdict, lowestPassingPredictiveNt } from "../client/src/lib/predictive-nt-stage-display";

describe("persisted predictive stage verdict", () => {
  it("selects the lowest explicitly accepted N_T, regardless of order", () => {
    expect(lowestPassingPredictiveNt([
      { stageCount: 5, accepted: true },
      { stageCount: 1, accepted: false },
      { stageCount: 3, accepted: true },
    ])).toBe(3);
  });
  it("does not invent a passing N_T for pending, rejected, or malformed results", () => {
    expect(lowestPassingPredictiveNt([])).toBeNull();
    expect(lowestPassingPredictiveNt([
      { stageCount: 1, accepted: false },
      { stageCount: 2 },
      { stageCount: 3, accepted: "true" },
      { stageCount: 0, accepted: true },
      { stageCount: 11, accepted: true },
    ])).toBeNull();
  });
  it("uses the worker's explicit verdict", () => {
    expect(predictiveStageVerdict({ accepted: true })).toBe("PASS");
    expect(predictiveStageVerdict({ accepted: false })).toBe("FAIL");
  });
  it("does not infer acceptance from small residuals or positive eigenvalues", () => {
    expect(predictiveStageVerdict({
      maximumComponentBalanceResidualMol: 0,
      isoactivityLogResidual: 0,
      localPostSplitStability: { raffinate: { minimumEigenvalue: 1 } },
    })).toBe("NOT RECORDED");
    expect(predictiveStageVerdict({ accepted: "true" })).toBe("NOT RECORDED");
  });
  it("keeps absent stage payloads pending", () => {
    expect(predictiveStageVerdict(null)).toBe("PENDING");
    expect(predictiveStageVerdict(undefined)).toBe("PENDING");
  });
});