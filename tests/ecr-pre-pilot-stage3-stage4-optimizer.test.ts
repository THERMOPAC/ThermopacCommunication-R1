import { describe, expect, it } from "vitest";
import {
  canonicalizeStage3Stage4OptimizerControls,
  compactStage3Stage4OptimizerResult,
  evaluateKuhniReverseTrial,
  findAllBoundedRootBrackets,
  optimizeStage3Stage4,
} from "../server/ecr-pre-pilot/stage3-stage4-optimizer";
import { deriveStage4PrePilotSizing } from "../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service";

const stage1Hash = "a".repeat(64);

function basis(
  phaseConfiguration: string,
  rrboDensity = 850,
  solventDensity = 1000,
  rrboViscosityPaS = 0.002,
  solventViscosityPaS = 0.001,
): any {
  return {
    schemaVersion: "ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1",
    stage1SnapshotHash: stage1Hash,
    operatingTemperatureC: 25,
    temperatureK: 298.15,
    operatingPressure: "atmospheric",
    phaseConfiguration,
    composition: {
      rrboGrade: "SN150",
      rrboFeedWt: {
        saturates: 0.2,
        monoAromatics: 0.2,
        diAromatics: 0.2,
        polyAromatics: 0.2,
        polarAromatics: 0.1,
        nmp: 0.1,
      },
      wetSolventWt: { nmp: 0.95, water: 0.05 },
    },
    rrboFeed: {
      identity: "RRBO_FEED",
      valueLph: 4000,
      conversion: "L/h * 1e-3 m3/L / 3600 s/h",
      flowM3S: 0.001111,
      densityKgM3: rrboDensity,
      dynamicViscosityPaS: rrboViscosityPaS,
    },
    wetSolventPhase: {
      identity: "WET_NMP_SOLVENT_PHASE",
      solventOilMassRatio: 3,
      conversion: "(RRBO m3/s * RRBO kg/m3 * S/O) / wet-solvent kg/m3",
      flowM3S: 0.0008,
      densityKgM3: solventDensity,
      dynamicViscosityPaS: solventViscosityPaS,
    },
    interfacialTensionNM: 0.01,
  };
}

describe("Stage 3/4 fixed-geometry optimizer", () => {
  it("keeps the new hc/D grid bounded and retains all bounded roots", () => {
    const controls = canonicalizeStage3Stage4OptimizerControls({
      diameterMinM: 0.2,
      diameterMaxM: 0.4,
      diameterStepM: 0.2,
    });
    expect(controls.hcToColumn).toEqual([0.2, 0.25, 0.3]);
    expect(() => canonicalizeStage3Stage4OptimizerControls({ hcToColumn: [0.5] }))
      .toThrow("INVALID_STAGE3_STAGE4_OPTIMIZER_HC_TO_COLUMN_GRID");
    expect(findAllBoundedRootBrackets([
      { x: 0, residual: -1 },
      { x: 1, residual: 1 },
      { x: 2, residual: -1 },
    ])).toHaveLength(2);
  });

  it("retains accepted geometry ranges without creating a legacy hc/D candidate", () => {
    const result = optimizeStage3Stage4(
      basis("nmp-continuous-rrbo-dispersed"),
      stage1Hash,
      {
        diameterMinM: 0.2,
        diameterMaxM: 0.4,
        diameterStepM: 0.2,
        rpmMin: 30,
        rpmMax: 70,
        rpmStep: 10,
      },
    );
    expect(result.controls.hcToColumn).toEqual([0.2, 0.25, 0.3]);
    expect(result.controls.rotorToColumn).toEqual([0.33, 0.4, 0.5]);
    expect(result.controls.freeArea).toEqual([0.2, 0.3, 0.4]);
    expect(result.controls.rpmMin).toBe(30);
    expect(result.controls.rpmMax).toBe(70);
    for (const orientation of result.orientationComparison) {
      for (const group of orientation.geometryGrid) {
        expect(group.geometry.hcToColumn).toBeGreaterThanOrEqual(0.2);
        expect(group.geometry.hcToColumn).toBeLessThanOrEqual(0.3);
        expect(group.geometry.hcToColumn).not.toBe(0.5);
      }
    }
    expect(result.candidateGrid.every((grid) =>
      grid.hcToColumn.every((ratio) => ratio >= 0.2 && ratio <= 0.3)
      && !grid.hcToColumn.includes(0.5))).toBe(true);
    const compact = compactStage3Stage4OptimizerResult(result);
    expect(compact.orientationComparison.every((item) => item.geometryGrid.length === 0)).toBe(true);
    expect(compact.freeAreaSensitivity?.status).toBe(result.selectedOrientationDiagnostics.freeAreaSensitivity?.status);
  });

  it("uses Stage-1 basis for both orientations and passes selected hc to Stage 4", () => {
    const nmpContinuous = optimizeStage3Stage4(
      basis("nmp-continuous-rrbo-dispersed"),
      stage1Hash,
      { diameterMinM: 0.2, diameterMaxM: 0.8, diameterStepM: 0.2 },
    );
    expect(nmpContinuous.status).toBe("OPTIMIZED_FIXED_GEOMETRY_WINDOW");
    expect(nmpContinuous.selectedOrientation).toBe("nmp-continuous-rrbo-dispersed");
    expect(nmpContinuous.selectedGeometry?.hcToColumn).toBeGreaterThanOrEqual(0.2);
    expect(nmpContinuous.selectedGeometry?.hcToColumn).toBeLessThanOrEqual(0.3);
    expect(nmpContinuous.selectedOperatingWindow?.rpmMin).toBe(30);
    expect(nmpContinuous.selectedOperatingWindow?.rpmMax).toBe(70);
    expect(nmpContinuous.orientationComparison).toHaveLength(2);
    expect(nmpContinuous.orientationComparison.every((item) =>
      item.geometryGrid.every((group) => group.geometry.hcToColumn <= 0.3))).toBe(true);

    const reverse = optimizeStage3Stage4(
      basis("rrbo-continuous-nmp-dispersed", 869, 1015, 0.0598, 0.001416),
      stage1Hash,
      { diameterMinM: 0.2, diameterMaxM: 0.8, diameterStepM: 0.2 },
    );
    const reverseSelection = reverse.orientationComparison.find((item) =>
      item.orientation === "rrbo-continuous-nmp-dispersed");
    expect(reverseSelection?.phaseSelection).toMatchObject({
      continuousIdentity: "RRBO_FEED",
      dispersedIdentity: "WET_NMP_SOLVENT_PHASE",
      continuousFlowM3S: 0.001111,
      dispersedFlowM3S: 0.0008,
    });
    // Realistic reverse properties may have no bounded extrapolated root.
    // Either outcome must remain attached to the Stage-1 reverse orientation;
    // the optimizer must never silently select the normal orientation.
    expect(reverse.selectedOrientation).not.toBe("nmp-continuous-rrbo-dispersed");
    if (reverse.selectedOrientation === "rrbo-continuous-nmp-dispersed") {
      expect(reverseSelection?.status).toBe("SELECTED");
      expect(reverse.selectedGeometry?.columnDiameterM).toBeGreaterThan(0.2);
      expect(reverse.selectedTrial?.buoyancyDirection).toBe("DISPERSED_DOWNWARD");
      expect(Math.abs(reverse.selectedTrial?.signedForceBalanceResidualN ?? Infinity)).toBeLessThan(1e-8);
    } else {
      expect(reverse.status).toBe("NO_FEASIBLE_ORIENTATION");
      expect(reverseSelection?.status).toBe("NO_FEASIBLE_WINDOW");
      expect(reverseSelection?.rejectionReasons.length).toBeGreaterThan(0);
    }
    const normalSelection = nmpContinuous.orientationComparison.find((item) =>
      item.orientation === "nmp-continuous-rrbo-dispersed");
    expect(normalSelection?.phaseSelection).toMatchObject({
      continuousIdentity: "WET_NMP_SOLVENT_PHASE",
      dispersedIdentity: "RRBO_FEED",
      continuousFlowM3S: 0.0008,
      dispersedFlowM3S: 0.001111,
    });
    const smallReverseGeometry = reverseSelection?.geometryGrid.find((group) =>
      group.geometry.columnDiameterM === 0.2);
    expect(smallReverseGeometry?.trials.every((trial) =>
      trial.hydraulicPass !== true
      && trial.reasons.includes("ACTUAL_LOADING_EXCEEDS_DESIGN_FLOOD_FRACTION"))).toBe(true);
    for (const orientation of [...nmpContinuous.orientationComparison, ...reverse.orientationComparison]) {
      for (const group of orientation.geometryGrid) {
        for (const trial of group.trials.filter((candidate) => candidate.status === "FEASIBLE")) {
          expect(trial.hydraulicPass).toBe(true);
          expect(trial.actualLoading).toBeLessThanOrEqual(0.7);
          expect(trial.designFloodFraction).toBe(0.7);
        }
      }
    }

    const stage4 = deriveStage4PrePilotSizing({
      stage3: {
        id: "optimizer-run",
        immutableHash: "b".repeat(64),
        stage1SnapshotHash: stage1Hash,
        result: nmpContinuous,
      },
    });
    expect(stage4.hetsSizing.compartmentHeightRule).toBe("PERSISTED_STAGE3_SELECTED_hc");
    expect(stage4.selectedStage3Hydraulics.compartmentHeightM)
      .toBe(nmpContinuous.stage4GeometryInput.compartmentHeightM);
    expect(stage4.mainOutputs.physicalCompartments).toBe(
      Math.ceil(7 / nmpContinuous.stage4GeometryInput.compartmentHeightM!),
    );
  });

  it("rejects stale Stage-1 authority and remains deterministic for identical inputs", () => {
    const controls = { diameterMinM: 0.2, diameterMaxM: 0.4, diameterStepM: 0.2 };
    expect(() => optimizeStage3Stage4(
      basis("nmp-continuous-rrbo-dispersed"),
      "b".repeat(64),
      controls,
    )).toThrow("STAGE3_STAGE4_OPTIMIZER_STAGE1_AUTHORITY_INVALID");

    const first = optimizeStage3Stage4(
      basis("nmp-continuous-rrbo-dispersed"),
      stage1Hash,
      controls,
    );
    const second = optimizeStage3Stage4(
      basis("nmp-continuous-rrbo-dispersed"),
      stage1Hash,
      controls,
    );
    expect(second.calculationHash).toBe(first.calculationHash);
    expect(second.selectedGeometry).toEqual(first.selectedGeometry);
    expect(second.selectedOperatingWindow).toEqual(first.selectedOperatingWindow);
    expect(second.selectionRationale).toEqual(first.selectionRationale);

    const staleResult = {
      ...first,
      stage1Authority: { ...first.stage1Authority, snapshotHash: "b".repeat(64) },
    };
    expect(() => deriveStage4PrePilotSizing({
      stage3: {
        id: "stale-optimizer-run",
        immutableHash: "c".repeat(64),
        stage1SnapshotHash: stage1Hash,
        result: staleResult,
      },
    })).toThrow("STAGE4_OPTIMIZER_STAGE1_LINEAGE_STALE");
  });
});
