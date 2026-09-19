import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { stage5DrawingPresentation } from "../server/ecr-pre-pilot/stage5-drawing-presentation";
import { createStage5Pdf } from "../server/ecr-pre-pilot/stage5-geometry-report";
import { stage5Hash } from "../server/ecr-pre-pilot/stage5-geometry-service";
import { buildStage5R1Geometry } from "../shared/ecr-stage5-r1";

const geometry = buildStage5R1Geometry({
  stage3ResultId: "3", stage4ResultId: "4", sourcesCurrent: true, sourcesCompatible: true,
  columnDiameterM: .6, rotorDiameterM: .3, rotorDiameterRatio: .5, compartmentHeightM: .18,
  compartmentCount: 39, requiredActiveHeightM: 7, installedActiveHeightM: 7.02,
  designNt: 7, hetsM: 1, statorFreeAreaRatio: .4, selectedRpm: 50, rpmMin: 30, rpmMax: 70,
  phaseConfiguration: "NMP continuous / RRBO dispersed",
});
const record = {
  id: "fixture-501", revision: 2, createdAt: "2026-09-19T12:00:00Z", sourceHash: "fixture-source-not-a-live-design",
  currentness: "FIXTURE", status: geometry.completionStatement!, notes: "Verification fixture, not a live design",
  geometry, geometryHash: stage5Hash(geometry), drawings: { ga: "<svg>ORIGINAL ARTIFACT</svg>" },
};

describe("Stage5 drawing-only presentation exports", () => {
  it("preserves original artifacts and frozen geometry while producing contextual dimensioned sheets", () => {
    const before = JSON.stringify(record);
    const result = stage5DrawingPresentation(record, 47, "dimensioned-v2");
    expect(JSON.stringify(record)).toBe(before);
    expect(result.geometryHash).toBe(record.geometryHash);
    expect(stage5DrawingPresentation(record, 47)).toBe(record);
    expect(stage5DrawingPresentation(record, 47, "original")).toBe(record);
    expect(Object.keys(result.drawings)).toEqual(["ga", "section", "compartment", "rotor", "stator"]);
    for (const svg of Object.values(result.drawings) as string[]) {
      expect(svg).toContain("dimensioned-v2");
      expect(svg).toContain("2026-09-19");
      expect(svg).toContain("NOT FOR FABRICATION");
      expect(svg).toContain('viewBox="0 0 1200 1000"');
    }
  });
  it("rejects incompatible legacy snapshots, unknown presentation and corrupt geometry", () => {
    expect(() => stage5DrawingPresentation({ ...record, geometry: {} }, 47, "dimensioned-v2")).toThrow("REQUIRES_SAVED_R1");
    expect(() => stage5DrawingPresentation(record, 47, "unknown")).toThrow("UNKNOWN_DRAWING_PRESENTATION");
    expect(() => stage5DrawingPresentation({ ...record, geometryHash: "bad" }, 47, "dimensioned-v2")).toThrow("INTEGRITY");
  });
  it("exports a vector PDF and all five SVG examples without dataset changes", async () => {
    const before = stage5Hash(geometry);
    const presentation = stage5DrawingPresentation(record, 47, "dimensioned-v2");
    const pdf = await createStage5Pdf(presentation);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).not.toContain("/Subtype /Image");
    expect(stage5Hash(geometry)).toBe(before);
    const path = "deliverables/r1-drawings";
    mkdirSync(path, { recursive: true });
    writeFileSync(`${path}/fixture-dimensioned-five-view-package.pdf`, pdf);
    for (const [view, svg] of Object.entries(presentation.drawings))
      writeFileSync(`${path}/fixture-${view}.svg`, svg as string);
  });
});