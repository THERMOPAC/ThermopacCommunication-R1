import { describe, expect, it } from "vitest";
import { predictiveStageVerdict } from "../client/src/lib/predictive-nt-stage-display";

describe("persisted predictive stage verdict", () => {
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