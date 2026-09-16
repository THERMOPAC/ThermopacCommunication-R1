import { describe, expect, it } from "vitest";
import {
  ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_VERSION,
  ECR_STAGE3_STAGE4_OPTIMIZER_VERSION,
  OPTIMIZER_DEFAULT_MINIMUM_USEFUL_WINDOW_RPM,
  canonicalizeStage3Stage4OptimizerControls,
  replayLegacyStage3Stage4,
  replayConfigurableStage3Stage4,
  rankGeometryGroups,
  type GeometryGroup,
} from "../server/ecr-pre-pilot/stage3-stage4-optimizer";

function group(
  diameterM: number,
  rpmMin: number,
  rpmMax: number,
  options: { edgeMarginRpm?: number; trialRpms?: number[] } = {},
): GeometryGroup {
  const trialRpms = options.trialRpms ?? [];
  return {
    geometry: {
      columnDiameterM: diameterM,
      compartmentHeightM: diameterM * 0.25,
      hcToColumn: 0.25,
      rotorDiameterM: diameterM * 0.4,
      rotorToColumn: 0.4,
      freeArea: 0.3,
    },
    trials: trialRpms.map((rpm) => ({
      rpm,
      status: "FEASIBLE",
      powerVolumeWM3: 1,
      tipSpeedMS: 1,
      actualLoading: 0.5,
      designFloodFraction: 0.7,
      d32M: 0.01,
      holdup: 0.1,
    })) as any,
    operatingWindow: {
      rpmMin,
      rpmMax,
      widthRpm: rpmMax - rpmMin,
      validTrialCount: (rpmMax - rpmMin) / 5 + 1,
      edgeMarginRpm: options.edgeMarginRpm ?? 0,
    },
    score: {
      windowWidthRpm: rpmMax - rpmMin,
      edgeMarginRpm: options.edgeMarginRpm ?? 0,
      validTrialCount: (rpmMax - rpmMin) / 5 + 1,
      centerDistanceRpm: 0,
      tieBreakPowerVolumeWM3: 1,
    },
  };
}

function basis(phaseConfiguration: string): any {
  return {
    schemaVersion: "ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1",
    stage1SnapshotHash: "a".repeat(64),
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

describe("corrected Stage 3 size/window ranking", () => {
  it("uses 20 rpm by default rather than selecting a smaller 15-rpm window", () => {
    const narrow = group(0.5, 30, 45);
    const adequate = group(0.7, 30, 50);
    expect(rankGeometryGroups([narrow, adequate]).selected).toBe(adequate);
  });

  it("preserves the configurable historical engine and its original preference", () => {
    const historical = replayConfigurableStage3Stage4(
      basis("nmp-continuous-rrbo-dispersed"), "a".repeat(64),
      { diameterMinM: 0.2, diameterMaxM: 0.4, diameterStepM: 0.2 },
    );
    expect(historical.controls.minimumUsefulWindowRpm).toBe(15);
    expect(historical.engine.version).toBe("ECR_STAGE3_STAGE4_OPTIMIZER_V1.1.0");
    expect(historical.engine.implementationHash)
      .toBe("35a2b0900aac2de58877f4699b174441da715ec5b8329232afc2beedbe77dd56");
  });

  it("chooses the true smallest adequate geometry and retains a wider frontier", () => {
    const compact = group(0.7, 30, 45);
    const wide = group(1.2, 30, 50);
    const tooNarrow = group(0.3, 30, 35);
    const ranked = rankGeometryGroups([wide, tooNarrow, compact], 15);

    expect(ranked.selected?.geometry.columnDiameterM).toBe(0.7);
    expect(ranked.adequateGeometryCount).toBe(2);
    expect(ranked.alternatives).toHaveLength(2);
    expect(ranked.alternatives.find((alternative) => alternative.role === "WIDER_FRONTIER"))
      .toMatchObject({
      role: "WIDER_FRONTIER",
      geometry: { columnDiameterM: 1.2 },
      operatingWindow: { widthRpm: 20 },
      meetsUsefulWindowPreference: true,
      });
  });

  it("fixes public controls at 20 rpm while keeping preference separate from admission", () => {
    const narrow = group(0.3, 30, 35);
    const ranked = rankGeometryGroups([narrow], 15);
    expect(ranked.selected).toBe(narrow);
    expect(ranked.adequateGeometryCount).toBe(0);
    expect(ranked.sizeWindowComparisons[0]).toMatchObject({
      role: "BEST_AVAILABLE",
      meetsUsefulWindowPreference: false,
    });
    expect(ranked.sizeWindowComparisons[0].rationale)
      .toContain("best available hydraulic window");
    expect(ranked.alternatives).toHaveLength(0);
    expect(canonicalizeStage3Stage4OptimizerControls({}).minimumUsefulWindowRpm)
      .toBe(OPTIMIZER_DEFAULT_MINIMUM_USEFUL_WINDOW_RPM);
    expect(OPTIMIZER_DEFAULT_MINIMUM_USEFUL_WINDOW_RPM).toBe(20);
    for (const key of ["usefulWindowMinRpm", "minimumWindowWidthRpm", "minimumUsefulWindowRpm"]) {
      expect(() => canonicalizeStage3Stage4OptimizerControls({ [key]: 15 }))
        .toThrow("FIXED_AT_20_RPM");
      expect(canonicalizeStage3Stage4OptimizerControls({ [key]: 20 }).minimumUsefulWindowRpm)
        .toBe(20);
    }
    expect(() => canonicalizeStage3Stage4OptimizerControls({ minimumUsefulWindowRpm: null }))
      .toThrow("INVALID_STAGE3_STAGE4_OPTIMIZER_USEFUL_WINDOW_PREFERENCE");
  });

  it("keeps corrected representative RPM inside an offset chosen window", () => {
    const offset = group(0.5, 36, 41, { trialRpms: [31, 36, 41, 46] });
    const ranked = rankGeometryGroups([offset], 5);
    expect(ranked.sizeWindowComparisons[0].representativeTrial?.rpm).toBe(41);
    expect(ranked.sizeWindowComparisons[0].representativeTrial?.rpm)
      .toBeGreaterThanOrEqual(offset.operatingWindow!.rpmMin);
    expect(ranked.sizeWindowComparisons[0].representativeTrial?.rpm)
      .toBeLessThanOrEqual(offset.operatingWindow!.rpmMax);
  });

  it("resolves equal-size equal-window ties by larger edge margin", () => {
    const lowerMargin = group(0.5, 30, 45, { edgeMarginRpm: 2 });
    const higherMargin = group(0.5, 30, 45, { edgeMarginRpm: 8 });
    const ranked = rankGeometryGroups([lowerMargin, higherMargin], 15);
    expect(ranked.selected).toBe(higherMargin);
  });

  it("retains occupied-grid .5/.6/.7 and wider-grid comparisons without changing selection", () => {
    const selected = group(0.5, 30, 45);
    const next = group(0.6, 30, 45);
    const compact = group(0.7, 30, 45);
    const wide = group(1.2, 30, 50);
    const ranked = rankGeometryGroups([wide, compact, selected, next], 15);
    expect(ranked.selected).toBe(selected);
    expect(ranked.sizeWindowComparisons.map((item) => item.geometry.columnDiameterM))
      .toEqual([0.5, 0.6, 0.7, 1.2]);
    expect(ranked.sizeWindowComparisons.find((item) => item.geometry.columnDiameterM === 0.7)?.rationale)
      .toContain("same width");
    expect(ranked.alternatives.some((item) => item.geometry.columnDiameterM === 0.7)).toBe(true);
    expect(ranked.alternatives.some((item) => item.geometry.columnDiameterM === 1.2)).toBe(true);
  });

  it("is deterministic and version-separates stale width-first snapshots", () => {
    const groups = [group(1.2, 30, 50), group(0.7, 30, 45)];
    const first = rankGeometryGroups(groups);
    const second = rankGeometryGroups([...groups].reverse());
    expect(second.selected?.geometry).toEqual(first.selected?.geometry);
    expect(second.alternatives).toEqual(first.alternatives);
    expect(ECR_STAGE3_STAGE4_OPTIMIZER_VERSION)
      .not.toBe(ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_VERSION);
  });

  it("replays the legacy selector without adding current ranking fields", () => {
    const legacy = replayLegacyStage3Stage4(
      basis("nmp-continuous-rrbo-dispersed"),
      "a".repeat(64),
      { diameterMinM: 0.2, diameterMaxM: 0.4, diameterStepM: 0.2 },
    );
    expect(legacy.engine.version).toBe(ECR_STAGE3_STAGE4_OPTIMIZER_LEGACY_VERSION);
    expect(legacy.controls).not.toHaveProperty("minimumUsefulWindowRpm");
    expect(legacy.selectionRationale).not.toHaveProperty("usefulWindowPreference");
    expect(legacy.orientationComparison.every((item) => !item.rankingEvidence)).toBe(true);
  });
});