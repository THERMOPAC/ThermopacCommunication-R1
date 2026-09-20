import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildStage5R1Geometry, R1_COMPLETE, R1_RULESET, R1_WATERMARK, R2_RULESET } from "../shared/ecr-stage5-r1";
import { renderStage5Svg, type Stage5DrawingView } from "../shared/ecr-stage5-drawings";
import { buildStage5Geometry, emptyStage5Inputs, type Stage5Basis } from "../shared/ecr-stage5-geometry";

const basis: Stage5Basis = {
  stage3ResultId: "3", stage4ResultId: "4", sourcesCurrent: true, sourcesCompatible: true,
  columnDiameterM: .8, rotorDiameterM: .4, rotorDiameterRatio: .5, compartmentHeightM: .24,
  compartmentCount: 30, requiredActiveHeightM: 7, installedActiveHeightM: 7.2,
  designNt: 7, hetsM: 1, statorFreeAreaRatio: .4, selectedRpm: 50, rpmMin: 30, rpmMax: 70,
  phaseConfiguration: "nmp-continuous-rrbo-dispersed",
};
const views: Stage5DrawingView[] = ["ga", "section", "compartment", "rotor", "stator"];
describe("approved automatic R1 geometry", () => {
  it("generates the entire approved table without any engineering inputs", () => {
    const before = JSON.stringify(basis);
    const g = buildStage5R1Geometry(Object.freeze({ ...basis }));
    expect(JSON.stringify(basis)).toBe(before);
    expect(g.ruleset).toBe(R1_RULESET);
    expect(g.completionStatement).toBe(R1_COMPLETE);
    expect(g.watermark).toBe(R1_WATERMARK);
    expect(g.complete).toBe(true);
    expect(g.tbd).toEqual([]);
    expect(g.checks.every(c => c.status === "pass")).toBe(true);
    expect(g.nozzles).toHaveLength(12);
    expect(g.compartments).toHaveLength(30);
    expect(g.internals.find(x => x.id === "S")?.count).toBe(31);
    for (const [key, value] of Object.entries(g.inputs.values)) {
      expect(value.classification).toBe("System-generated");
      if (key !== "rotorThicknessM") expect(value.value).toBeGreaterThan(0);
    }
    expect(g.parameters.find(p => p.key === "rotorThicknessM")?.value).toContain("Not applicable");
    expect(g.parameters.every(p => ["A", "B", "C"].includes(p.evidenceClass!))).toBe(true);
    const d = g.dimensions;
    expect(d.statorOpeningDiameterM).toBeCloseTo(.8 * Math.sqrt(.4), 14);
    expect(d.grossFreeAreaRatio).toBeCloseTo(.4, 14);
    expect(d.shaftBlockedFreeAreaRatio).toBeCloseTo(.4 - (d.shaftDiameterM! / .8) ** 2, 14);
    expect(d.shaftBlockedFreeAreaRatio).not.toBe(d.statorFreeAreaRatio);
    expect(d.shaftDiameterM).toBeCloseTo(10 / 45 * .4);
    expect(d.statorThicknessM).toBe(.005);
    expect(d.bladeHeightM).toBeCloseTo(7 / 45 * .4);
    expect(d.overallHeightM).toBeCloseTo(7.2 + 4 * .8);
    expect(d.shaftUpperTerminationM).toBeCloseTo(d.vesselHeightM! + .8 / 4);
    expect(d.bladeInnerSegmentHeightM).toBe(d.bladeHeightM! / 2);
  });

  it.each([.2, .8, 2])("satisfies envelopes across approved proportions at D=%s", D => {
    for (const ratio of [.33, .4, .5]) for (const pitch of [.2, .25, .3]) for (const phi of [.2, .3, .4]) {
      const hc = pitch * D, N = Math.ceil(7 / hc);
      const g = buildStage5R1Geometry({ ...basis, columnDiameterM: D, rotorDiameterM: D * ratio,
        rotorDiameterRatio: ratio, compartmentHeightM: hc, compartmentCount: N,
        installedActiveHeightM: N * hc, statorFreeAreaRatio: phi });
      expect(g.complete).toBe(true);
      expect(g.checks.some(c => c.id === "vent-drive-seal-envelope")).toBe(true);
      expect(g.checks.filter(c => c.id.endsWith("-stub-envelope"))).toHaveLength(45);
    }
  });

  it("hands off adopted 40% efficiency as 18 compartments and 19 plates without changing components", () => {
    const next = buildStage5R1Geometry({
      ...basis,
      compartmentHeightM: .18,
      compartmentCount: 18,
      requiredActiveHeightM: 3.24,
      installedActiveHeightM: 3.24,
      hetsM: null,
      sizingMethod: "ADOPTED_COMPARTMENT_EFFICIENCY",
      designCompartmentEfficiency: .4,
      impliedInstalledHetsMPerTheoreticalStage: 3.24 / 7,
    });
    const historical = buildStage5R1Geometry(basis);
    expect(next.ruleset).toBe(R2_RULESET);
    expect(next.compartments).toHaveLength(18);
    expect(next.internals.find(x => x.id === "S")).toMatchObject({ count: 19 });
    expect(next.compartments.at(-1)?.topM! - next.compartments[0].bottomM!).toBeCloseTo(3.24);
    for (const key of ["shaftDiameterM", "statorThicknessM", "bladeHeightM", "hubDiameterM",
      "bladeThicknessM", "bladeRadialLengthM"]) {
      expect(next.dimensions[key]).toBe(historical.dimensions[key]);
    }
  });

  it.each([[39, .18], [16, .45]])("retains historical legacy HETS stack %s without reinterpretation", (count, pitch) => {
    const legacy = buildStage5R1Geometry({
      ...basis,
      compartmentHeightM: pitch,
      compartmentCount: count,
      requiredActiveHeightM: 7,
      installedActiveHeightM: count * pitch,
    });
    expect(legacy.ruleset).toBe(R1_RULESET);
    expect(legacy.compartments).toHaveLength(count);
    expect(legacy.internals.find(x => x.id === "S")?.count).toBe(count + 1);
  });

  it.each([
    [{ installedActiveHeightM: 7.3 }, "stack"],
    [{ rotorDiameterM: .5 }, "rotor-ratio"],
    [{ compartmentCount: 2.5 }, "count"],
    [{ statorFreeAreaRatio: .0001 }, "shaft-opening"],
    [{ statorFreeAreaRatio: 1 }, "phi-domain"],
    [{ selectedRpm: 80 }, "rpm"],
    [{ sourcesCurrent: false }, "authority"],
    [{ columnDiameterM: Infinity }, "columnDiameterM"],
    [{ compartmentHeightM: null }, "compartmentHeightM"],
    [{ requiredActiveHeightM: 8 }, "height"],
  ])("fails explicitly without repairing incompatible basis %j", (change, code) => {
    const input = Object.freeze({ ...basis, ...change }) as Stage5Basis;
    const before = JSON.stringify(input);
    expect(() => buildStage5R1Geometry(input)).toThrow(`R1_GEOMETRY_INCOMPATIBLE: ${code}`);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("uses actual ellipsoid head connection intersections and separate axes", () => {
    const g = buildStage5R1Geometry(basis);
    const drain = g.nozzles.find(n => n.id === "D01")!, vent = g.nozzles.find(n => n.id === "V01")!;
    expect(drain).toMatchObject({ axis: "down", azimuthDeg: null, radialOffsetM: 0, elevationM: 0 });
    expect(vent.axis).toBe("up");
    expect(vent.surfaceEdgeElevationMinM).toBeLessThan(vent.elevationM!);
    expect(vent.surfaceEdgeElevationMaxM).toBeGreaterThan(vent.elevationM!);
    expect(drain.surfaceEdgeElevationMaxM).toBeGreaterThan(0);
    expect(vent.radialOffsetM! - vent.outsideDiameterM! / 2).toBeGreaterThan(g.dimensions.drivePedestalDiameterM! / 2);
  });
  it("mandatory example: D=.600 phi=.40 gives opening .3794733192202055 and gross .400000", () => {
    const g=buildStage5R1Geometry({ ...basis,columnDiameterM:.6,rotorDiameterM:.3,
      compartmentHeightM:.2,compartmentCount:35,installedActiveHeightM:7 });
    expect(g.dimensions.statorOpeningDiameterM).toBeCloseTo(.3794733192202055,14);
    expect(g.dimensions.grossFreeAreaRatio).toBeCloseTo(.400000,14);
    expect(g.dimensions.shaftBlockedFreeAreaRatio).toBeCloseTo(
      (g.dimensions.statorOpeningDiameterM! ** 2-g.dimensions.shaftDiameterM! ** 2)/(.6**2),14);
    expect(g.basis.statorFreeAreaRatio).toBe(.4);
  });
  it("freezes full stepped vertices, component envelopes and clocking for render-only consumers", () => {
    const g=buildStage5R1Geometry(basis);
    const m=g.r1Model!;
    expect(m.rotor.blades).toHaveLength(6);
    expect(m.rotor.blades.every(b=>b.verticesM.length===16)).toBe(true);
    expect(m.supports.every(s=>s.arms.length===3)).toBe(true);
    expect(m.heads).toHaveLength(2);
    expect(m.connections.find(n=>n.id==="V01")?.surfaceBoundaryM).toHaveLength(64);
    const renderer=readFileSync("shared/ecr-stage5-r1-drawings.ts","utf8");
    expect(renderer).not.toContain("i*60");
    expect(renderer).not.toContain("Math.cos");
    expect(renderer).not.toContain("Math.sin");
    expect(renderer).toContain("model.rotor.profileM");
    expect(renderer).toContain("model.connections");
  });

  it("renders all views deterministically from a single frozen dataset without mutation", () => {
    const freeze = (v: any): any => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
    const g = freeze(buildStage5R1Geometry(basis)), before = JSON.stringify(g);
    for (const view of views) {
      const svg = renderStage5Svg(g, view);
      expect(svg).toBe(renderStage5Svg(buildStage5R1Geometry(basis), view));
      expect(svg).toContain(R1_WATERMARK);
      expect(svg).toContain(R1_COMPLETE);
      expect(svg).not.toMatch(/\b(NaN|Infinity|TBD)\b/);
      expect(svg).toContain(`data-view="${view}"`);
      if (["section", "rotor", "compartment"].includes(view)) expect(svg).toContain('data-component="r1-stepped-blade"');
    }
    expect(JSON.stringify(g)).toBe(before);
  });

  it("retains legacy geometry and net-area definition without automatic upgrading", () => {
    const legacy = buildStage5Geometry(basis, emptyStage5Inputs());
    expect(legacy.ruleset).toBeUndefined();
    expect(legacy.freeAreaDefinition).toContain("Net free area");
    expect(renderStage5Svg(legacy, "stator")).toContain("TBD");
    expect(legacy.complete).toBe(false);
  });

  it("normal workflow has no construction editor or inputs in requests", () => {
    const page = readFileSync("client/src/pages/design-software/ecr-pre-pilot-design-stage-5-page.tsx", "utf8");
    expect(page).not.toContain("Stage5InputEditor");
    expect(page).not.toContain("setInputs");
    expect(page).not.toContain("JSON.stringify({ inputs");
    expect(page).toContain('body: "{}"');
    expect(page).toContain("expectedSourceHash: sourceHash");
  });

  it("Stage3 source hash equals the captured pre-edit baseline", () => {
    // Stage 4 now owns the approved efficiency handoff. Stage 3 remains frozen.
    expect(createHash("sha256").update(readFileSync(
      "server/ecr-pre-pilot/stage3-stage4-optimizer.ts",
    )).digest("hex")).toBe("449ec8a1d32f1ef9ddce9df00268bdcc8d9ba616d627ecc26207dc709370e5d7");
  });
});