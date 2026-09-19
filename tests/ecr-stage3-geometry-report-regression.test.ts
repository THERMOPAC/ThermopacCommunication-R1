import { describe, expect, it } from "vitest";
import { buildStage3GeometryReport } from "../shared/ecr-stage3-geometry-report";
import { optimizeStage3Stage4 } from "../server/ecr-pre-pilot/stage3-stage4-optimizer";
import { deriveStage4PrePilotSizing } from "../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service";

const stage1Hash = "a".repeat(64);

function basis(): any {
  return {
    schemaVersion: "ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1",
    stage1SnapshotHash: stage1Hash,
    operatingTemperatureC: 25,
    temperatureK: 298.15,
    operatingPressure: "atmospheric",
    phaseConfiguration: "nmp-continuous-rrbo-dispersed",
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
      densityKgM3: 850,
      dynamicViscosityPaS: 0.002,
    },
    wetSolventPhase: {
      identity: "WET_NMP_SOLVENT_PHASE",
      solventOilMassRatio: 3,
      conversion: "(RRBO m3/s * RRBO kg/m3 * S/O) / wet-solvent kg/m3",
      flowM3S: 0.0008,
      densityKgM3: 1000,
      dynamicViscosityPaS: 0.001,
    },
    interfacialTensionNM: 0.01,
  };
}

function deepFreeze(value: any): any {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe("Stage 3 reporting-only geometry evidence", () => {
  it("reports missing and non-finite values without changing deeply frozen input", () => {
    const missing = deepFreeze({});
    const missingReport = buildStage3GeometryReport(missing);
    expect(missingReport.rows.map(row => ({
      key: row.key,
      selected: row.selected,
      savedSearchChoices: row.savedSearchChoices,
      applicability: row.applicability,
    }))).toEqual([
      {
        key: "hcToColumn",
        selected: null,
        savedSearchChoices: "Unavailable — no saved search choices",
        applicability: "Not assessed — no finite selected value",
      },
      {
        key: "rotorToColumn",
        selected: null,
        savedSearchChoices: "Unavailable — no saved search choices",
        applicability: "Not assessed — no finite selected value",
      },
      {
        key: "freeArea",
        selected: null,
        savedSearchChoices: "Unavailable — no saved search choices",
        applicability: "Not assessed — no finite selected value",
      },
    ]);

    const nonFinite = deepFreeze({
      selectedGeometry: {
        hcToColumn: Number.NaN,
        rotorToColumn: Number.POSITIVE_INFINITY,
        freeArea: Number.NEGATIVE_INFINITY,
      },
      controls: {
        hcToColumn: [Number.NaN],
        rotorToColumn: [Number.POSITIVE_INFINITY],
        freeArea: [Number.NEGATIVE_INFINITY],
      },
    });
    const selectedBefore = { ...nonFinite.selectedGeometry };
    const controlsBefore = {
      hcToColumn: [...nonFinite.controls.hcToColumn],
      rotorToColumn: [...nonFinite.controls.rotorToColumn],
      freeArea: [...nonFinite.controls.freeArea],
    };
    const nonFiniteReport = buildStage3GeometryReport(nonFinite);

    expect(nonFiniteReport.rows.map(row => row.selected)).toEqual([null, null, null]);
    expect(nonFiniteReport.rows.map(row => row.savedSearchChoices))
      .toEqual(["unavailable", "unavailable", "unavailable"]);
    expect(nonFiniteReport.rows.map(row => row.applicability))
      .toEqual(Array(3).fill("Not assessed — no finite selected value"));
    expect(nonFinite.selectedGeometry).toEqual(selectedBefore);
    expect(nonFinite.controls).toEqual(controlsBefore);
  });

  it("classifies below, above, and inside ranges for all three parameters", () => {
    const outside = buildStage3GeometryReport({
      selectedGeometry: {
        hcToColumn: 0.1,
        rotorToColumn: 0.8,
        freeArea: 0.1,
      },
    });
    expect(outside.rows.map(row => row.applicability)).toEqual([
      "Below K&H marginal range — geometry extrapolation",
      "Above K&H marginal range — geometry extrapolation",
      "Below K&H marginal range — geometry extrapolation",
    ]);

    const inside = buildStage3GeometryReport({
      selectedGeometry: {
        hcToColumn: 0.5,
        rotorToColumn: 0.5,
        freeArea: 0.4,
      },
    });
    expect(inside.rows.map(row => row.applicability)).toEqual([
      "Within K&H marginal range — joint applicability not established",
      "Within K&H marginal range — joint applicability not established",
      "Within K&H numerical range — area mapping unresolved",
    ]);
  });

  it("cannot mutate optimizer evidence or change exact optimizer and Stage-4 replay", () => {
    const processBasis = basis();
    const controls = {
      diameterMinM: 0.2,
      diameterMaxM: 0.8,
      diameterStepM: 0.2,
    };
    const first = optimizeStage3Stage4(processBasis, stage1Hash, controls);
    const firstStage4 = deriveStage4PrePilotSizing({
      stage3: {
        id: "geometry-report-regression",
        immutableHash: "b".repeat(64),
        stage1SnapshotHash: stage1Hash,
        result: first,
      },
    });
    const basisBeforeReport = JSON.stringify(processBasis);
    const optimizerBeforeReport = JSON.stringify(first);
    const stage4BeforeReport = JSON.stringify(firstStage4);

    deepFreeze(processBasis);
    deepFreeze(first);
    deepFreeze(firstStage4);
    const report = buildStage3GeometryReport({
      selectedGeometry: first.selectedGeometry,
      controls: first.controls,
    });

    expect(JSON.stringify(processBasis)).toBe(basisBeforeReport);
    expect(JSON.stringify(first)).toBe(optimizerBeforeReport);
    expect(JSON.stringify(firstStage4)).toBe(stage4BeforeReport);

    (report.rows[0] as any).selected = -1;
    (report.rows as any).push({ key: "presentation-only-mutation" });
    expect(first.selectedGeometry?.hcToColumn).toBe(0.3);
    expect(first.controls.hcToColumn).toEqual([0.2, 0.25, 0.3]);

    const replay = optimizeStage3Stage4(basis(), stage1Hash, controls);
    const replayStage4 = deriveStage4PrePilotSizing({
      stage3: {
        id: "geometry-report-regression",
        immutableHash: "b".repeat(64),
        stage1SnapshotHash: stage1Hash,
        result: replay,
      },
    });

    expect(replay).toEqual(first);
    expect(replayStage4).toEqual(firstStage4);
    expect(replay.calculationHash)
      .toBe("8fc82aed669a1a27297a23daa7d9f25cb2504f004a71f7bb0813083942270a35");
    expect(replay.selectedGeometry?.columnDiameterM).toBe(0.8);
    expect(replay.stage4GeometryInput.optimizerResultHash)
      .toBe("9bb60fde91874d412e01d17203e17f185e9c9a10d1824462dc0f34794e1626e1");
    expect(replayStage4.mainOutputs).toEqual({
      diameterM: 0.8,
      overallEfficiency: 0.24,
      physicalCompartments: 30,
      activeHeightM: 7,
      requiredActiveHeightM: 7,
      installedActiveHeightM: 7.199999999999999,
    });
    expect(replayStage4.selectedStage3Hydraulics).toEqual(
      firstStage4.selectedStage3Hydraulics,
    );
  });
});