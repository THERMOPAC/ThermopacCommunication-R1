import { describe, expect, it } from "vitest";
import { stage5ParameterRegisterCsv } from "../client/src/lib/stage5-register-csv";
import { buildStage5R1Geometry } from "../shared/ecr-stage5-r1";

describe("Stage 5 dimension and provenance CSV", () => {
  it("preserves unicode and every register field while preventing spreadsheet formulas", () => {
    const csv = stage5ParameterRegisterCsv({
      parameters: [{
        key: "opening",
        label: "Opening φ",
        value: "=2+2",
        unit: "m²",
        classification: "C",
        note: '+do=D*sqrt(phi_s), "gross"',
      }],
    });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Opening φ"');
    expect(csv).toContain('"m²"');
    expect(csv).toContain(`"'=2+2"`);
    expect(csv).toContain(`"'+do=D*sqrt(phi_s), ""gross"""`);
  });

  it("exports a header-only register when parameters are absent", () => {
    expect(stage5ParameterRegisterCsv({}).split("\r\n")).toHaveLength(1);
  });

  it("has no unresolved or missing active R1 register values", () => {
    const geometry = buildStage5R1Geometry({
      stage3ResultId: "3", stage4ResultId: "4", sourcesCurrent: true, sourcesCompatible: true,
      columnDiameterM: .6, rotorDiameterM: .3, rotorDiameterRatio: .5, compartmentHeightM: .18,
      compartmentCount: 39, requiredActiveHeightM: 7, installedActiveHeightM: 7.02,
      designNt: 7, hetsM: 1, statorFreeAreaRatio: .4, selectedRpm: 50, rpmMin: 30, rpmMax: 70,
      phaseConfiguration: "NMP continuous / RRBO dispersed",
    });
    expect(geometry.complete).toBe(true);
    expect(geometry.tbd).toEqual([]);
    expect(geometry.checks.every(check => check.status === "pass")).toBe(true);
    expect(geometry.parameters.filter(parameter =>
      parameter.value === null || parameter.value === undefined || parameter.value === "",
    )).toEqual([]);
  });
});