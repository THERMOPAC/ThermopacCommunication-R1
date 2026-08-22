import { describe, expect, it } from "vitest";
import { LLXHydraulicsEngine } from "../server/engines/llx/llx-hydraulics-engine";
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
    expect(first.characteristicVelocity.value_m_s).toBeGreaterThan(0);
    expect(second.characteristicVelocity.value_m_s).toBeLessThan(first.characteristicVelocity.value_m_s);
    expect(first.holdup.classification).toBe("Not Calculable");
    expect(first.genericHydraulicThroughputMaximum.classification).toBe("Not Calculable");
    expect(first.percentageOfGenericHydraulicThroughputMaximum).toBeNull();
    expect(first.genericHydraulicFeasibility).toBe("not_calculable");
    expect(data.normalCase.summary.minimumFeasibleDiameter_m).toBeNull();
  });

  it("uses an independently sourced route-specific m only when supplied", async () => {
    const input = routeInputs();
    input.kuhniVkHindranceExponent = tag(1.35, "Literature", "Asadollahzadeh route applicability study");

    const result = await engine.calculate(input, context);
    const first = (result.data as any).normalCase.diameters[0];

    expect(result.status).toBe("warning");
    // The supplied V_k coefficient places the low-flow holdup root above the
    // configured generic screening interval for this synthetic case. That is a
    // valid infeasibility outcome, not a reason to silently substitute another m.
    expect(first.holdup.classification).toBe("Not Calculable");
    expect(first.genericHydraulicThroughputMaximum.classification).toBe("Pending Validation");
    expect(typeof first.percentageOfGenericHydraulicThroughputMaximum).toBe("number");
  });

  it("rejects an assumed m = 1 carry-over", () => {
    const input = routeInputs();
    input.kuhniVkHindranceExponent = tag(1, "Assumed", "Legacy terminal route default");

    const validation = engine.validate(input);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some((issue) => issue.field === "kuhniVkHindranceExponent")).toBe(true);
  });
});