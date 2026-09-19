import { describe, it, expect } from "vitest";
import { buildStage5Geometry, emptyStage5Inputs, STAGE5_INPUT_FIELDS, STAGE5_WATERMARK, type Stage5Basis } from "../shared/ecr-stage5-geometry";
import { renderStage5Svg, type Stage5DrawingView } from "../shared/ecr-stage5-drawings";

const basis = (): Stage5Basis => ({
  stage3ResultId: 3, stage4ResultId: 4, sourcesCurrent: true, sourcesCompatible: true,
  columnDiameterM: 1, compartmentHeightM: .5, rotorDiameterRatio: .6, rotorDiameterM: .6,
  statorFreeAreaRatio: .3, selectedRpm: 60, rpmMin: 50, rpmMax: 90,
  phaseConfiguration: "NMP continuous / RRBO dispersed", compartmentCount: 14,
  requiredActiveHeightM: 7, installedActiveHeightM: 7, designNt: 7, hetsM: 1,
});
function inputs() {
  const i = emptyStage5Inputs();
  i.rotorConstruction = "flat-disc"; i.statorConstruction = "annular-single-opening";
  i.topHeadProfile = "elliptical-envelope"; i.bottomHeadProfile = "elliptical-envelope";
  i.flowArrangement = "nmp-down-rrbo-up"; i.flowClassification = "Engineer-entered"; i.flowNote = "Engineer confirms NMP downward and RRBO upward preliminary routing.";
  const vals = { shaftDiameterM: .05, rotorThicknessM: .02, statorThicknessM: .01, rotorOffsetM: .25, bottomDisengagementM: 1, topDisengagementM: 1, bottomHeadDepthM: .25, topHeadDepthM: .25, supportHeightM: .5, driveHeightM: .5, lowerShaftSupportM: .5, upperShaftSupportM: 9 };
  for (const [k, v] of Object.entries(vals)) i.values[k as keyof typeof vals].value = v;
  i.nozzles = ["feed", "outlet", "drain", "vent", "sample", "instrument"].map((service, n) => ({ id: `N${n}`, service, region: "bottom", elevationM: .7, boreM: .05, azimuthDeg: n * 60, classification: "Engineer-entered", note: "" }));
  return i;
}
describe("Stage 5 shared definition", () => {
  it("keeps every unentered dimension and construction TBD without mutating inputs", () => {
    const b = basis(), i = emptyStage5Inputs(), before = JSON.stringify({ b, i });
    const g = buildStage5Geometry(b, i);
    expect(g.dimensions.activeStartM).toBeNull();
    expect(g.dimensions.statorOpeningDiameterM).toBeNull();
    expect(g.complete).toBe(false);
    expect(JSON.stringify({ b, i })).toBe(before);
    expect(STAGE5_INPUT_FIELDS.every(f => i.values[f.key].value === null)).toBe(true);
  });
  it("builds shared pitch stack and shaft-corrected annular opening", () => {
    const g = buildStage5Geometry(basis(), inputs());
    expect(g.checks.filter(c => c.status !== "pass")).toEqual([]);
    expect(g.dimensions.statorOpeningDiameterM).toBeCloseTo(Math.sqrt(.3025));
    expect(g.dimensions.calculatedFreeAreaRatio).toBeCloseTo(.3);
    expect(g.compartments).toHaveLength(14);
    expect(g.compartments[13].topM).toBe(8.25);
    expect(g.internals[1].count).toBe(15);
    expect(g.complete).toBe(true); // geometry completeness is not fabrication/mechanical approval
    expect(g.engineeringExclusions.length).toBeGreaterThan(0);
  });
  it("rejects stale sources, pitch disagreement, fit failures and nozzles", () => {
    const b = basis(); b.sourcesCurrent = false; b.installedActiveHeightM = 6;
    const i = inputs(); i.values.rotorOffsetM.value = .001;
    i.nozzles[1] = { ...i.nozzles[0], id: "collision" };
    i.nozzles[2].elevationM = 20;
    const ids = buildStage5Geometry(b, i).checks.filter(c => c.status === "fail").map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining(["sources", "stack", "required", "rotorLowerClearanceM", "nozzle-clash-N0-collision", "nozzle-N2-fit"]));
  });
  it("validates explicitly selected blades and their corner swept diameter", () => {
    const i = inputs(); i.rotorConstruction = "flat-blade-turbine";
    for (const [key, value] of Object.entries({ bladeCount: 6, bladeHeightM: .08, bladeRadialLengthM: (Math.sqrt(.6 ** 2 - .005 ** 2) - .1) / 2, bladeThicknessM: .005, hubDiameterM: .1, hubHeightM: .1 })) i.values[key as keyof typeof i.values].value = value;
    const g = buildStage5Geometry(basis(), i);
    expect(g.checks.filter(c => c.status !== "pass")).toEqual([]);
    expect(g.dimensions.rotorLowerClearanceM).toBeCloseTo(.195);
    expect(renderStage5Svg(g, "rotor")).toContain('rotate(300 270 310)');
    i.values.bladeRadialLengthM.value = 1;
    expect(buildStage5Geometry(basis(), i).checks.find(c => c.id === "blade-reach")?.status).toBe("fail");
  });
  it("requires explicit assumption notes and accounts for excessive shaft obstruction", () => {
    const i = inputs(); i.values.shaftDiameterM = { value: .9, classification: "Assumed", note: "" };
    const g = buildStage5Geometry(basis(), i);
    expect(g.checks.find(c => c.id === "free-area")?.status).toBe("fail");
    expect(g.checks.find(c => c.id === "assumption-shaftDiameterM")?.status).toBe("fail");
  });
  it("does not silently select head profiles or flow and requires a flow rationale", () => {
    const i = inputs(); i.topHeadProfile = null; i.flowArrangement = null;
    const g = buildStage5Geometry(basis(), i);
    expect(g.complete).toBe(false);
    expect(g.tbd).toContain("top head envelope profile");
    expect(g.tbd).toContain("Phase flow arrangement");
    const svg = renderStage5Svg(g, "ga");
    expect(svg).not.toContain('data-head="top-elliptical-envelope"');
    expect(svg).not.toContain('data-flow=');
    i.topHeadProfile = "elliptical-envelope"; i.flowArrangement = "nmp-down-rrbo-up";
    i.flowClassification = "Assumed"; i.flowNote = "";
    expect(buildStage5Geometry(basis(), i).checks.find(c => c.id === "flow-note")?.status).toBe("fail");
  });
  it("renders explicit flow direction and entered elliptical or zero-depth flat heads", () => {
    const i = inputs();
    let g = buildStage5Geometry(basis(), i);
    let svg = renderStage5Svg(g, "section");
    expect(svg).toContain('data-flow="NMP" data-direction="down"');
    expect(svg).toContain('data-flow="RRBO" data-direction="up"');
    expect(svg).toContain('data-head="top-elliptical-envelope"');
    i.flowArrangement = "nmp-up-rrbo-down";
    i.topHeadProfile = "flat-envelope"; i.values.topHeadDepthM.value = 0;
    g = buildStage5Geometry(basis(), i); svg = renderStage5Svg(g, "ga");
    expect(g.complete).toBe(true);
    expect(svg).toContain('data-flow="NMP" data-direction="up"');
    expect(svg).toContain('data-flow="RRBO" data-direction="down"');
    expect(svg).not.toContain('data-head="top-elliptical-envelope"');
    i.values.topHeadDepthM.value = .25;
    expect(buildStage5Geometry(basis(), i).checks.find(c => c.id === "input-topHeadDepthM")?.status).toBe("fail");
  });
  it("groups same-elevation nozzle callouts without moving actual elevations", () => {
    const g = buildStage5Geometry(basis(), inputs());
    const before = JSON.stringify(g);
    const svg = renderStage5Svg(g, "ga");
    expect(svg.match(/data-nozzle-callout-elevation="0.7"/g)).toHaveLength(1);
    expect(svg).toContain("N0, N1, N2, N3, N4, N5");
    expect(svg).toContain("EL 0.7 m");
    expect(svg).toContain('x="560" y="112"');
    expect(svg).toContain('x="560" y="132"');
    expect(svg).toContain("leaders retain actual EL");
    expect(JSON.stringify(g)).toBe(before);
  });
  it.each(["ga", "section", "compartment", "rotor", "stator"] as Stage5DrawingView[])("exports escaped consistent %s SVG", view => {
    const i = inputs(); i.notes = '<script>alert("x")</script>';
    const g = buildStage5Geometry(basis(), i), svg = renderStage5Svg(g, view);
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain(STAGE5_WATERMARK.replace("&", "&amp;"));
    expect(svg).toContain("8.25");
    expect(svg).not.toMatch(/NaN|Infinity/);
    const incomplete = renderStage5Svg(buildStage5Geometry(basis(), emptyStage5Inputs()), view);
    expect(incomplete).toContain("TBD");
    expect(incomplete).not.toMatch(/NaN|Infinity/);
  });
});