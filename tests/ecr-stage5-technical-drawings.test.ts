import { describe, expect, it } from "vitest";
import { buildStage5R1Geometry } from "../shared/ecr-stage5-r1";
import { renderStage5R1Svg } from "../shared/ecr-stage5-r1-drawings";
import type { Stage5Basis } from "../shared/ecr-stage5-geometry";
const basis: Stage5Basis = {
  stage3ResultId: "frozen-3", stage4ResultId: "frozen-4", sourcesCurrent: true, sourcesCompatible: true,
  columnDiameterM: .6, rotorDiameterM: .3, rotorDiameterRatio: .5, compartmentHeightM: .18,
  compartmentCount: 39, installedActiveHeightM: 7.02, requiredActiveHeightM: 7,
  designNt: 7, hetsM: 1, statorFreeAreaRatio: .4, selectedRpm: 50, rpmMin: 30, rpmMax: 70,
  phaseConfiguration: "nmp-continuous-rrbo-dispersed",
};
const freeze = (v: any): any => { if(v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
describe("R1 dimensioned presentation, no geometry changes", () => {
  it.each(["ga","section","compartment","rotor","stator"] as const)("renders dimensioned %s from immutable SI geometry", view => {
    const g=freeze(buildStage5R1Geometry(basis)),before=JSON.stringify(g);
    const svg=renderStage5R1Svg(g,view,{projectName:"Project <A>",designId:42,revision:3,date:"2026-09-19"});
    expect(JSON.stringify(g)).toBe(before);
    expect(svg).toContain('data-dimension=');
    expect(svg).toContain('marker-start="url(#dim-arrow)"');
    expect(svg).toContain("ALL DIMENSIONS mm");
    expect(svg).toContain('data-component="title-block"');
    expect(svg).toContain("Project &lt;A&gt;");
    expect(svg).toContain("frozen-3");
    expect(svg).toContain("frozen-4");
    expect(svg).toContain("2026-09-19");
    expect(svg).toContain("PRELIMINARY PRE-PILOT GEOMETRY — NOT FOR FABRICATION");
    expect(svg).not.toMatch(/\b(NaN|Infinity|undefined)\b/);
    expect(svg).toBe(renderStage5R1Svg(g,view,{projectName:"Project <A>",designId:42,revision:3,date:"2026-09-19"}));
  });
  it("uses a dynamic compartment count and breaks only the repeated central section",()=>{
    const g=buildStage5R1Geometry(basis),svg=renderStage5R1Svg(g,"section");
    expect(svg).toContain("39 × 180 = 7020 mm");
    expect(svg).toContain("35 identical compartments omitted");
    expect(svg.match(/data-component="r1-stepped-blade"/g)).toHaveLength(8);
    const other=buildStage5R1Geometry({...basis,compartmentCount:40,installedActiveHeightM:7.2});
    expect(renderStage5R1Svg(other,"section")).toContain("40 × 180 = 7200 mm");
  });
  it("includes every connection at its saved position and keeps physical areas separate",()=>{
    const g=buildStage5R1Geometry(basis),ga=renderStage5R1Svg(g,"ga");
    for(const n of g.r1Model!.connections) {
      expect(ga).toContain(`data-nozzle="${n.id}"`);
      expect(ga).toContain(`data-elevation="${n.centreM[2]}"`);
    }
    expect(ga).toContain("ACTIVE EXTRACTION ZONE");
    const stator=renderStage5R1Svg(g,"stator");
    expect(stator).toContain("379.473");
    expect(stator).toContain("Gross opening fraction: 0.400000");
    expect(stator).toContain("Shaft-blocked net fraction:");
  });
});