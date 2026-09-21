import { describe, expect, it } from "vitest";
import {
  APPROVED_COMPONENT_MANIFEST_CANONICAL_SHA256, APPROVED_COMPONENT_RULESET,
  HISTORICAL_APPROVED_COMPONENT_RULESET,
  buildStage5ApprovedComponentGeometry,
  buildStage5PreliminaryComponentGeometry, PRELIMINARY_COMPONENT_RULESET,
} from "../shared/ecr-stage5-approved-components";
import { renderStage5Svg, type Stage5DrawingView } from "../shared/ecr-stage5-drawings";
import type { Stage5Basis } from "../shared/ecr-stage5-geometry";
import { buildCurrentStage5Geometry } from "../server/ecr-pre-pilot/stage5-geometry-service";
import { stage5DrawingPresentation } from "../server/ecr-pre-pilot/stage5-drawing-presentation";
import { stage5Hash } from "../server/ecr-pre-pilot/stage5-geometry-service";
import { createStage5DesignDataPdf } from "../server/ecr-pre-pilot/stage5-design-data-report";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const basis: Stage5Basis = {
  stage3ResultId: "64", stage4ResultId: "13", sourcesCurrent: true, sourcesCompatible: true,
  columnDiameterM: .6, rotorDiameterM: .198, rotorDiameterRatio: .33,
  compartmentHeightM: .18, statorFreeAreaRatio: .4, selectedRpm: 45, rpmMin: 30, rpmMax: 60,
  phaseConfiguration: "NMP continuous / RRBO dispersed", compartmentCount: Math.ceil(7 / .35),
  requiredActiveHeightM: Math.ceil(7 / .35) * .18,
  installedActiveHeightM: Math.ceil(7 / .35) * .18, designNt: 7, hetsM: null,
  sizingMethod: "ADOPTED_COMPARTMENT_EFFICIENCY", designCompartmentEfficiency: .35,
  impliedInstalledHetsMPerTheoreticalStage: Math.ceil(7 / .35) * .18 / 7,
};

describe("approved Stage5 turbine and perforated stator production geometry", () => {
  it("adapts current D700 without changing upstream or fixed component interfaces", () => {
    const current = { ...basis, columnDiameterM: .7, rotorDiameterM: .231,
      compartmentHeightM: .21, selectedRpm: 30, rpmMin: 30, rpmMax: 30,
      requiredActiveHeightM: 4.2, installedActiveHeightM: 4.2,
      impliedInstalledHetsMPerTheoreticalStage: .6 };
    const before = JSON.stringify(current);
    const g = buildStage5PreliminaryComponentGeometry(current);
    expect(JSON.stringify(current)).toBe(before);
    expect(g.ruleset).toBe(PRELIMINARY_COMPONENT_RULESET);
    expect(g.complete).toBe(true);
    expect(g.compartments).toHaveLength(20);
    expect(g.dimensions.grossFreeAreaRatio).toBeCloseTo(.4, 14);
    expect(g.dimensions.rotorAxialEnvelopeM).toBe(.032);
    expect(g.dimensions.rotorLowerClearanceM).toBeCloseTo(.087);
    expect(g.dimensions.shroudInnerDiameterM).toBe(.13);
    expect(g.dimensions.statorOpeningDiameterM).toBe(.112);
    const a = g.r1Model!.approvedComponent!;
    expect(a.stator.holeDiameterM).toBeCloseTo(.046733285782191686, 14);
    expect(a.stator.rows[0].radiusM).toBeGreaterThan(.1);
    expect(a.stator.rows[1].radiusM).toBeGreaterThan(.155);
    for (const row of a.stator.rows.slice(0, 2))
      expect(row.radiusM * Math.sin(row.firstAngleDeg * Math.PI / 180) - a.stator.holeDiameterM / 2).toBeCloseTo(.004, 12);
    expect(a.stator.rows[2].radiusM).toBe(.21);
    expect(a.stator.rows[3].radiusM).toBe(.265);
    expect(g.assumptions.join(" ")).toContain("zero-width");
    const roundTrip = JSON.parse(JSON.stringify(g));
    for (const view of ["ga", "section", "compartment", "rotor", "stator"] as Stage5DrawingView[]) {
      expect(renderStage5Svg(roundTrip, view)).toBe(renderStage5Svg(g, view));
      expect(renderStage5Svg(g, view)).toContain("NOT FOR FABRICATION");
    }
    expect(buildCurrentStage5Geometry(123, current).ruleset).toBe(PRELIMINARY_COMPONENT_RULESET);
    expect(() => buildStage5ApprovedComponentGeometry(current)).toThrow("approved-template-");
    expect(() => buildStage5PreliminaryComponentGeometry({
      ...current, columnDiameterM: .5, rotorDiameterM: .165, compartmentHeightM: .15,
      installedActiveHeightM: 3, requiredActiveHeightM: 3,
      impliedInstalledHetsMPerTheoreticalStage: 3 / 7,
    })).toThrow("preliminary-component-interference");
  });
  it("freezes the exact approved dimensions, coordinates, free area and topology", () => {
    const g = buildStage5ApprovedComponentGeometry(basis);
    const a = g.r1Model!.approvedComponent!, d = g.dimensions;
    expect(g.ruleset).toBe(APPROVED_COMPONENT_RULESET);
    expect(g.inputs.rotorConstruction).toBe("approved-double-entry-shrouded-turbine");
    expect(g.inputs.statorConstruction).toBe("approved-perforated-stator");
    expect(g.compartments).toHaveLength(Math.ceil(7 / .35));
    expect(g.internals.find(i => i.id === "S")).toMatchObject({
      count: Math.ceil(7 / .35) + 1, thicknessM: .004,
    });
    expect(g.dimensions.activeEndM! - g.dimensions.activeStartM!).toBeCloseTo(3.6);
    expect(g.dimensions.bottomDisengagementM).toBe(.6);
    expect(g.dimensions.topDisengagementM).toBe(.6);
    expect(d).toMatchObject({
      columnDiameterM: .6, rotorDiameterM: .198, shaftDiameterM: .044,
      hubDiameterM: .07, hubHeightM: .024, bladeCount: 6, bladeThicknessM: .003,
      bladeInnerSegmentHeightM: .016, bladeOuterSegmentHeightM: .028,
      shroudThicknessM: .002, rotorAxialEnvelopeM: .032,
      statorOpeningDiameterM: .112, statorHoleCount: 84,
      statorHoleDiameterM: .039559479027818114, statorThicknessM: .004,
    });
    expect(a.manifestCanonicalSha256).toBe(APPROVED_COMPONENT_MANIFEST_CANONICAL_SHA256);
    expect(a.stator.rows.map(r => [r.pcdM, r.count])).toEqual([[.2,12],[.31,18],[.42,24],[.53,30]]);
    expect(a.stator.holes).toHaveLength(84);
    expect(a.stator.holes[0]).toMatchObject({
      xM: .09659258262890683, yM: .025881904510252074,
    });
    expect((.112 ** 2 + 84 * d.statorHoleDiameterM! ** 2) / .6 ** 2).toBeCloseTo(.4, 14);
    expect(d.grossFreeAreaRatio).toBeCloseTo(d.statorGrossOpenAreaM2! / d.columnAreaM2!, 14);
    expect(g.checks.find(c => c.id === "approved-hole-topology")?.status).toBe("pass");
    for (const stale of ["shaft-opening", "hub-fit", "blade-spacing", "swept-diameter", "axial-clearance", "gross-area"])
      expect(g.checks.find(c => c.id === stale)).toBeUndefined();
    expect(g.assumptions.join(" ")).not.toMatch(/stepped approximation|single gross central/i);
    expect(g.assumptions.join(" ")).toContain("PRELIMINARY INTERFACE HOLD");
    expect(a.rotor.shrouds.map(s => [s.bottomM,s.topM])).toEqual([[-.016,-.014],[.014,.016]]);
    for (const blade of g.r1Model!.rotor.blades) for (const [x, y] of blade.verticesM)
      expect([.035, .065, .099].some(r => Math.abs(Math.hypot(x, y) - r) < 1e-12)).toBe(true);
  });

  it.each<Stage5DrawingView>(["ga", "section", "compartment", "rotor", "stator"])(
    "renders approved internals and provenance in %s", view => {
      const svg = renderStage5Svg(buildStage5ApprovedComponentGeometry(basis), view);
      expect(svg).toContain(APPROVED_COMPONENT_RULESET);
      expect(svg).toContain("APPROVED");
      expect(svg).toContain("84");
      expect(svg).toContain("39.559");
      if (view === "stator") {
        expect((svg.match(/data-stator-hole=/g) ?? [])).toHaveLength(84);
        expect(svg).toContain(APPROVED_COMPONENT_MANIFEST_CANONICAL_SHA256);
      }
      if (view === "rotor") {
        expect(svg).toContain('data-component="upper-shroud"');
        expect(svg).toContain('data-component="lower-shroud"');
        expect((svg.match(/data-blade=/g) ?? [])).toHaveLength(6);
      }
    });

  it("fails instead of resizing any incompatible approved-template input", () => {
    for (const change of [{ columnDiameterM: .61 }, { rotorDiameterM: .2 }, { selectedRpm: 46 }])
      expect(() => buildStage5ApprovedComponentGeometry({ ...basis, ...change }))
        .toThrow("approved-template-");
    for (const change of [{ compartmentCount: 19 }, { installedActiveHeightM: 3.42 }])
      expect(() => buildStage5ApprovedComponentGeometry({ ...basis, ...change })).toThrow();
  });

  it("selects the exact successor by contract rather than design ID and exports exact CAD design data", async () => {
    expect(buildCurrentStage5Geometry(269, basis).ruleset).toBe(APPROVED_COMPONENT_RULESET);
    const historical = buildCurrentStage5Geometry(268, basis);
    expect(historical.ruleset).toBe(APPROVED_COMPONENT_RULESET);
    const geometry = buildStage5ApprovedComponentGeometry(basis);
    const pdf = await createStage5DesignDataPdf({
      id: "fixture", revision: 3, createdAt: "2026-09-20T00:00:00Z",
      sourceHash: "a".repeat(64), currentness: "FIXTURE", geometry,
      ruleset: geometry.ruleset,
    }, 269);
    const path = `/tmp/stage5-approved-${process.pid}.pdf`;
    writeFileSync(path, pdf);
    try {
      const text = execFileSync("python3", ["-c",
        "import fitz,sys; d=fitz.open(sys.argv[1]); print('\\n'.join(p.get_text() for p in d))", path],
        { maxBuffer: 8e6 }).toString();
      for (const value of ["approved double-entry shrouded", "84", "39.559479",
        "200", "310", "420", "530", APPROVED_COMPONENT_MANIFEST_CANONICAL_SHA256])
        expect(text).toContain(value);
    } finally { unlinkSync(path); }
  }, 30000);

  it("continues to present a verified historical approved R3 snapshot without regeneration", () => {
    const geometry = {
      ...buildStage5ApprovedComponentGeometry(basis),
      ruleset: HISTORICAL_APPROVED_COMPONENT_RULESET,
    };
    const record = {
      revision: 3, createdAt: "2026-09-20T00:00:00Z", sourceHash: "a".repeat(64),
      geometry, geometryHash: stage5Hash(geometry), drawings: { original: "frozen" },
    };
    const presented = stage5DrawingPresentation(record, 269, "dimensioned-v2");
    expect(presented.geometry).toBe(geometry);
    expect(presented.presentationVersion).toBe("dimensioned-v2");
    expect(record.drawings).toEqual({ original: "frozen" });
  });
});