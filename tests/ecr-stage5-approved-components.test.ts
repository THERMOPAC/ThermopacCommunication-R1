import { describe, expect, it } from "vitest";
import {
  APPROVED_COMPONENT_MANIFEST_CANONICAL_SHA256, APPROVED_COMPONENT_RULESET,
  buildStage5ApprovedComponentGeometry,
} from "../shared/ecr-stage5-approved-components";
import { renderStage5Svg, type Stage5DrawingView } from "../shared/ecr-stage5-drawings";
import type { Stage5Basis } from "../shared/ecr-stage5-geometry";
import { buildCurrentStage5Geometry } from "../server/ecr-pre-pilot/stage5-geometry-service";
import { createStage5DesignDataPdf } from "../server/ecr-pre-pilot/stage5-design-data-report";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const basis: Stage5Basis = {
  stage3ResultId: "64", stage4ResultId: "13", sourcesCurrent: true, sourcesCompatible: true,
  columnDiameterM: .6, rotorDiameterM: .198, rotorDiameterRatio: .33,
  compartmentHeightM: .18, statorFreeAreaRatio: .4, selectedRpm: 45, rpmMin: 30, rpmMax: 60,
  phaseConfiguration: "NMP continuous / RRBO dispersed", compartmentCount: 18,
  requiredActiveHeightM: 3.24, installedActiveHeightM: 3.24, designNt: 7, hetsM: null,
  sizingMethod: "ADOPTED_COMPARTMENT_EFFICIENCY", designCompartmentEfficiency: .4,
  impliedInstalledHetsMPerTheoreticalStage: 3.24 / 7,
};

describe("approved Stage5 turbine and perforated stator production geometry", () => {
  it("freezes the exact approved dimensions, coordinates, free area and topology", () => {
    const g = buildStage5ApprovedComponentGeometry(basis);
    const a = g.r1Model!.approvedComponent!, d = g.dimensions;
    expect(g.ruleset).toBe(APPROVED_COMPONENT_RULESET);
    expect(g.inputs.rotorConstruction).toBe("approved-double-entry-shrouded-turbine");
    expect(g.inputs.statorConstruction).toBe("approved-perforated-stator");
    expect(g.compartments).toHaveLength(18);
    expect(g.internals.find(i => i.id === "S")).toMatchObject({ count: 19, thicknessM: .004 });
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
    for (const change of [{ columnDiameterM: .61 }, { rotorDiameterM: .2 }, { selectedRpm: 46 },
      { compartmentCount: 19 }, { installedActiveHeightM: 3.42 }])
      expect(() => buildStage5ApprovedComponentGeometry({ ...basis, ...change }))
        .toThrow("approved-template-");
  });

  it("selects the successor only for design 269 and exports exact CAD design data", async () => {
    expect(buildCurrentStage5Geometry(269, basis).ruleset).toBe(APPROVED_COMPONENT_RULESET);
    const historical = buildCurrentStage5Geometry(268, basis);
    expect(historical.ruleset).not.toBe(APPROVED_COMPONENT_RULESET);
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
});