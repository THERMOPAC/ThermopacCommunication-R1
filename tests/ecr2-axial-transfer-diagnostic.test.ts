import { describe, expect, it } from "vitest";

import {
  buildEcr2AxialTransferDiagnostic,
  findEcr2AcceptedAxialDiagnosticTrial,
} from "../client/src/lib/ecr2-axial-transfer-diagnostic";

const acceptedTrial = {
  diameter_m: 0.6,
  status: "feasible_preliminary",
  requiredActiveHeight_m: 0.279375,
  productAromaticsMoleFraction: 0.09999,
  heightSizing: { selectedNumberOfCells: 2, selectedDeltaZ_m: 0.1396875 },
  bvp: {
    status: "converged",
    massBalanceStatus: "passed",
    outlets: {
      raffinate: { componentFlows_kg_h: [80, 5, 6, 7, 1] },
      extract: { componentFlows_kg_h: [20, 5, 4, 3, 99] },
    },
    axialProfile: [
      {
        Koa_per_s: [1, 2, 3, 4, 0],
        drivingForce_kg_m3: [10, 20, 30, 40, 0],
        transferRate_kg_m3_s: [0.1, 0.2, 0.3, 0.4, 0],
      },
      {
        Koa_per_s: [5, 6, 7, 8, 0],
        drivingForce_kg_m3: [50, 60, 70, 80, 0],
        transferRate_kg_m3_s: [0.5, 0.6, 0.7, 0.8, 0],
      },
    ],
    compartments: [
      {
        compartmentIndex: 1,
        z_bottom_m: 0,
        z_top_m: 0.14,
        z_centre_m: 0.07,
        dispersedIncoming_kg_h: [100, 10, 10, 10, 0],
        continuousIncoming_kg_h: [10, 2, 2, 2, 99],
        transferAmount_kg_h: [12, 3, 2, 1, 0],
        holdup: { phi: 0.2 },
        d32: { d32_m: 0.001 },
        interfacialArea: { a_m2_m3: 1200 },
      },
      {
        compartmentIndex: 2,
        z_bottom_m: 0.14,
        z_top_m: 0.28,
        z_centre_m: 0.21,
        dispersedIncoming_kg_h: [88, 7, 8, 9, 0],
        continuousIncoming_kg_h: [0, 0, 0, 0, 99],
        transferAmount_kg_h: [8, 2, 2, 2, 0],
        holdup: { phi: 0.25 },
        d32: { d32_m: 0.0009 },
        interfacialArea: { a_m2_m3: 1666.6667 },
      },
    ],
  },
};

describe("ECR-2 axial transfer diagnostic", () => {
  it("selects the lowest accepted preliminary diameter trial", () => {
    const selected = findEcr2AcceptedAxialDiagnosticTrial({
      trials: [
        { diameter_m: 0.3, status: "dependency_blocked", bvp: { status: "blocked", massBalanceStatus: "not_evaluated" } },
        { ...acceptedTrial, diameter_m: 0.8 },
        acceptedTrial,
      ],
    });

    expect(selected?.diameter_m).toBe(0.6);
  });

  it("keeps axial increments ordered and reconciles saturate and aromatic transfer", () => {
    const diagnostic = buildEcr2AxialTransferDiagnostic(acceptedTrial);

    expect(diagnostic).not.toBeNull();
    expect(diagnostic?.increments.map((increment) => increment.zBottom_m)).toEqual([0, 0.14]);
    expect(diagnostic?.increments[0].components[0]).toMatchObject({
      transferAmount_kg_h: 12,
      cumulativeTransfer_kg_h: 12,
      Koa_per_s: 1,
      drivingForce_kg_m3: 10,
    });
    expect(diagnostic?.increments[1].components[0].cumulativeTransfer_kg_h).toBe(20);

    const saturates = diagnostic?.reconciliation.find((component) => component.key === "saturates");
    expect(saturates).toMatchObject({
      feed_kg_h: 100,
      raffinate_kg_h: 80,
      extract_kg_h: 20,
      transfer_kg_h: 20,
      raffinateLoss_kg_h: 20,
      extractGain_kg_h: 20,
      componentBalance_kg_h: 0,
    });
    expect(diagnostic?.aromaticReconciliation).toMatchObject({
      feed_kg_h: 30,
      raffinate_kg_h: 18,
      extract_kg_h: 12,
      transfer_kg_h: 12,
      raffinateLoss_kg_h: 12,
      extractGain_kg_h: 12,
      componentBalance_kg_h: 0,
    });
  });

  it("does not expose unaccepted BVP arrays as an axial diagnostic", () => {
    expect(buildEcr2AxialTransferDiagnostic({
      ...acceptedTrial,
      status: "dependency_blocked",
      bvp: { ...acceptedTrial.bvp, status: "blocked", massBalanceStatus: "not_evaluated" },
    })).toBeNull();
  });
});