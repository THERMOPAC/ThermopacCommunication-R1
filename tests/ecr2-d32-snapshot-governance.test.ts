import { describe, expect, it } from "vitest";

import { getEcr2D32SnapshotGovernance } from "../client/src/lib/ecr2-d32-snapshot-governance";

describe("ECR-2 frozen d32 snapshot governance overlay", () => {
  it("labels legacy preliminary snapshots without mutating their stored content", () => {
    const snapshot = {
      d32: {
        status: "preliminary_engineering_reconstruction",
        correlationStatus: "preliminary_engineering_reconstruction",
        d32_m: 10.299360276,
      },
    };
    const frozenBefore = JSON.stringify(snapshot);

    const overlay = getEcr2D32SnapshotGovernance(snapshot);

    expect(overlay.transcriptionInvalid).toBe(true);
    expect(overlay.label).toContain("TRANSCRIPTION-INVALID");
    expect(JSON.stringify(snapshot)).toBe(frozenBefore);
  });

  it("does not label unrelated snapshots as transcription-invalid", () => {
    expect(getEcr2D32SnapshotGovernance({
      d32: { status: "engineer_supplied", d32_m: 0.002 },
    })).toEqual({ transcriptionInvalid: false, label: null });
  });
});