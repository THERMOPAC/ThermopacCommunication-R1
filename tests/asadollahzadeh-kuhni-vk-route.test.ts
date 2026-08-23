import { describe, expect, it } from "vitest";
import { LLXHydraulicsEngine } from "../server/engines/llx/llx-hydraulics-engine";
import { mapWorkspaceProcessDesignInputs } from "../server/llx-process-design-input-mapper";
import type { CalculationContext } from "../server/engine-framework/types";

const engine = new LLXHydraulicsEngine();
const context: CalculationContext = { revisionId: 8, designId: 9, moduleType: "llx", userId: 1 };
const tag = (value: number, sourceType = "Literature", sourceReference = "Controlled route test") => ({
  value, sourceType, sourceReference,
});

function routeInputs(): Record<string, unknown> {
  return {
    operatingTemperature: 70,
    feedFlow: { value: 4, basis: "volumetric" },
    feedDensity: { value: 849, referenceTemperatureC: 70, sourceType: "Assumed", sourceReference: "RRBO run basis" },
    feedViscosity: { value: 0.0598, referenceTemperatureC: 70, sourceType: "Assumed", sourceReference: "RRBO run basis" },
    solventToOilRatio: 988 / 849,
    maxCirculationFactor: 1.2,
    phaseConfiguration: "nmp_continuous_rrbo_dispersed",
    interfacialTension: { value: 0.01, referenceTemperatureC: 70, sourceType: "Vendor", sourceReference: "RRBO/NMP IFT at 70 C" },
    characteristicVelocityRoute: "ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY",
    rotorToColumnDiameterRatio: tag(0.5, "Assumed", "Stage 7 rotor ratio"),
    rotorSpeed: tag(60, "Assumed", "Stage 7 rotor speed"),
    kuhniVkTransferDirection: "d_to_c",
    diameterValues: [0.3, 0.75],
  };
}

describe("ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY", () => {
  it("maps a separately sourced route-specific m without mapping the terminal-route n", () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      hydraulic_model: "asadollahzadeh_2017_kuhni_vk_preliminary",
      phase_configuration: "nmp_continuous_rrbo_dispersed",
      solute_recovery_extract: "90",
      kuhni_vk_hindrance_exponent: "1.35",
      kuhni_vk_hindrance_exponent_source: "Literature",
      kuhni_vk_hindrance_exponent_source_ref: "Route-specific source",
      hindrance_exponent: "1",
      hindrance_exponent_source: "Assumed",
      hindrance_exponent_source_ref: "Rigid-sphere route default",
    }, "hydraulics_common") as any;

    expect(mapped.kuhniVkHindranceExponent).toEqual(tag(1.35, "Literature", "Route-specific source"));
    expect(mapped.hindranceExponent).toBeUndefined();
    expect(mapped.kuhniVkEvidenceStatus).toBe("engineer_rejected_design_use");
  });

  it("does not trust a workspace claim that capacity use was approved", async () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      hydraulic_model: "asadollahzadeh_2017_kuhni_vk_preliminary",
      phase_configuration: "nmp_continuous_rrbo_dispersed",
      solute_recovery_extract: "90",
      kuhniVkEvidenceStatus: "engineer_approved_design_use",
      capacitySweepAllowed: true,
      kuhni_vk_hindrance_exponent: "1.35",
      kuhni_vk_hindrance_exponent_source: "Literature",
      kuhni_vk_hindrance_exponent_source_ref: "Claimed approved route-specific m",
    }, "hydraulics_common") as any;

    expect(mapped.kuhniVkEvidenceStatus).toBe("engineer_rejected_design_use");

    const result = await engine.calculate({
      ...routeInputs(),
      kuhniVkEvidenceStatus: mapped.kuhniVkEvidenceStatus,
      capacitySweepAllowed: true,
      kuhniVkHindranceExponent: tag(1.35, "Literature", "Claimed approved route-specific m"),
    }, context);
    const data = result.data as any;
    expect(data.designBasis.characteristicVelocityRoute.sourceEvidence.engineerReview.decision).toBe("rejected");
    expect(data.normalCase.diameters[0].characteristicVelocity.capacitySweepAllowed).toBe(false);
    expect(data.normalCase.diameters[0].holdup.classification).toBe("Not Calculable");
    expect(data.normalCase.summary.minimumFeasibleDiameter_m).toBeNull();
  });

  it("ignores stale d32-terminal workspace fields and still returns the audit-only V_k result", async () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      hydraulic_model: "asadollahzadeh_2017_kuhni_vk_preliminary",
      phase_configuration: "nmp_continuous_rrbo_dispersed",
      solute_recovery_extract: "90",
      sauter_mean_d32: "3",
      sauter_mean_d32_source: "Assumed",
      sauter_mean_d32_source_ref: "Rigid-sphere screening default",
      hindrance_exponent: "1",
      hindrance_exponent_source: "Assumed",
      hindrance_exponent_source_ref: "Rigid-sphere route default",
      // Engine-shaped values can persist from a prior workspace model. The
      // mapper must strip them as well as the current flat form fields.
      sauterMeanDiameter: tag(0.003, "Assumed", "Stale terminal-route d32"),
      useTerminalVelocityAsCharacteristic: true,
      characteristicVelocity: tag(0.2, "Assumed", "Stale terminal-route uK"),
      hindranceExponent: tag(1, "Assumed", "Stale terminal-route n"),
    }, "hydraulics_common") as any;

    expect(mapped.sauterMeanDiameter).toBeUndefined();
    expect(mapped.useTerminalVelocityAsCharacteristic).toBeUndefined();
    expect(mapped.characteristicVelocity).toBeUndefined();
    expect(mapped.hindranceExponent).toBeUndefined();

    const { diameterValues: _fixtureDiameters, ...enginePrerequisites } = routeInputs();
    const result = await engine.calculate({ ...enginePrerequisites, ...mapped }, context);
    expect(result.status).toBe("warning");
    const first = (result.data as any).normalCase.diameters[0];

    expect(first.characteristicVelocity.nativeOutputValue).toBeGreaterThan(0);
    expect(first.holdup.classification).toBe("Not Calculable");
    expect((result.data as any).normalCase.summary.minimumFeasibleDiameter_m).toBeNull();
  });

  it("calculates the per-diameter V_k basis without borrowing the terminal route exponent", async () => {
    const input = routeInputs();
    input.hindranceExponent = tag(1, "Assumed", "Rigid-sphere route n = 1");

    const result = await engine.calculate(input, context);
    const data = result.data as any;
    const first = data.normalCase.diameters[0];
    const second = data.normalCase.diameters[1];

    expect(result.status).toBe("warning");
    expect(first.characteristicVelocity.routeId).toBe("ASADOLLAHZADEH_2017_KUHNI_VK_PRELIMINARY");
    expect(first.characteristicVelocity.alphaMT).toBe(1);
    expect(first.characteristicVelocity.froudeNumber).toBeGreaterThan(0);
    expect(first.characteristicVelocity.mortonNumber).toBeGreaterThan(0);
    expect(first.characteristicVelocity.nativeOutputValue).toBeGreaterThan(0);
    expect(second.characteristicVelocity.nativeOutputValue).toBeLessThan(first.characteristicVelocity.nativeOutputValue);
    expect(first.characteristicVelocity.nativeOutputUnit).toBeNull();
    expect(first.characteristicVelocity.capacitySweepAllowed).toBe(false);
    expect(first.characteristicVelocity.evidenceStatus).toBe("engineer_rejected_design_use");
    expect(first.holdup.classification).toBe("Not Calculable");
    expect(first.genericHydraulicThroughputMaximum.classification).toBe("Not Calculable");
    expect(first.percentageOfGenericHydraulicThroughputMaximum).toBeNull();
    expect(first.genericHydraulicFeasibility).toBe("not_calculable");
    expect(data.normalCase.summary.minimumFeasibleDiameter_m).toBeNull();
  });

  it("retains an independently sourced route-specific m without enabling sizing", async () => {
    const input = routeInputs();
    input.kuhniVkHindranceExponent = tag(1.35, "Literature", "Asadollahzadeh route applicability study");

    const result = await engine.calculate(input, context);
    const first = (result.data as any).normalCase.diameters[0];

    expect(result.status).toBe("warning");
    // A separately sourced m is necessary evidence but cannot compensate for an
    // unverified native V_k output unit, applicability envelope, or geometry.
    expect(first.holdup.classification).toBe("Not Calculable");
    expect(first.genericHydraulicThroughputMaximum.classification).toBe("Not Calculable");
    expect(first.percentageOfGenericHydraulicThroughputMaximum).toBeNull();
    expect(first.genericHydraulicFeasibility).toBe("not_calculable");
    expect((result.data as any).normalCase.summary.minimumFeasibleDiameter_m).toBeNull();
    expect((result.data as any).designBasis.characteristicVelocityRoute.routeSpecificHindranceExponent.value).toBe(1.35);
    const sourceEvidence = (result.data as any).designBasis.characteristicVelocityRoute.sourceEvidence;
    expect(sourceEvidence.capacitySweepAllowed).toBe(false);
    expect(sourceEvidence.sourceControl.equationPageStatus).toBe("not_retained_primary_material_unavailable");
    expect(sourceEvidence.equation.nativeOutputUnit).toBeNull();
    expect(sourceEvidence.applicability.validRanges).toBeNull();
    expect(sourceEvidence.applicability.testedGeometry).toBeNull();
    expect(sourceEvidence.routeSpecificHindranceExponent.reviewStatus).toBe("not_accepted_for_design_use");
    expect(sourceEvidence.engineerReview.decision).toBe("rejected");
    expect(sourceEvidence.engineerReview.capacityUseApproved).toBe(false);
    expect(sourceEvidence.engineerReview.diameterUseApproved).toBe(false);
    expect(result.warnings.some((warning) => warning.code === "KUHNI_VK_DESIGN_USE_REJECTED")).toBe(true);
  });

  it("rejects an assumed m = 1 carry-over", () => {
    const input = routeInputs();
    input.kuhniVkHindranceExponent = tag(1, "Assumed", "Legacy terminal route default");

    const validation = engine.validate(input);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((issue) => issue.field === "kuhniVkHindranceExponent")).toBe(true);
  });
});