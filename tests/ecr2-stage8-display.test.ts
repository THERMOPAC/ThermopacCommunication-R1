import { describe, expect, it } from "vitest";

import {
  ECR2_STAGE8_VISIBLE_STATE_LABELS,
  getEcr2Stage8VisibleResolutionState,
} from "../client/src/lib/ecr2-stage8-display";

describe("ECR-2 Stage 8 visible resolution states", () => {
  it("shows a system-resolved candidate as requiring acceptance", () => {
    const state = getEcr2Stage8VisibleResolutionState({
      status: "CALCULATED_PRELIMINARY",
      hasResolvedValue: true,
      ready: false,
    });

    expect(ECR2_STAGE8_VISIBLE_STATE_LABELS[state]).toBe(
      "SYSTEM RESOLVED — ACCEPTANCE REQUIRED",
    );
  });

  it("shows an accepted, valid server candidate as ready", () => {
    const state = getEcr2Stage8VisibleResolutionState({
      status: "ACCEPTED_AUTO_BASIS",
      hasResolvedValue: true,
      ready: true,
    });

    expect(ECR2_STAGE8_VISIBLE_STATE_LABELS[state]).toBe("SYSTEM RESOLVED — READY");
  });

  it("requires renewed acceptance when a saved acceptance is no longer ready", () => {
    const state = getEcr2Stage8VisibleResolutionState({
      status: "ACCEPTED_AUTO_BASIS",
      hasResolvedValue: true,
      ready: false,
    });

    expect(ECR2_STAGE8_VISIBLE_STATE_LABELS[state]).toBe(
      "SYSTEM RESOLVED — ACCEPTANCE REQUIRED",
    );
  });

  it("keeps a complete engineer override visibly distinct from a system basis", () => {
    const state = getEcr2Stage8VisibleResolutionState({
      status: "ENGINEER_OVERRIDE",
      hasResolvedValue: false,
      ready: true,
    });

    expect(ECR2_STAGE8_VISIBLE_STATE_LABELS[state]).toBe("ENGINEER ACCEPTED — READY");
  });

  it("shows a missing numerical basis as an evidence gap", () => {
    const state = getEcr2Stage8VisibleResolutionState({
      status: "BLOCKED_MISSING_REQUIRED_EVIDENCE",
      hasResolvedValue: false,
      ready: false,
    });

    expect(ECR2_STAGE8_VISIBLE_STATE_LABELS[state]).toBe("EVIDENCE GAP");
  });
});