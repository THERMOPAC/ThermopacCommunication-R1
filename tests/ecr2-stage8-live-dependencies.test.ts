import { describe, expect, it } from "vitest";

import { getEcr2Stage8LiveDependencies } from "../client/src/lib/ecr2-stage8-live-dependencies";
import { ECR2_STAGE8_COMPONENTS } from "../client/src/lib/ecr2-stage8-validation";
import { findEcr2Stage8Evidence } from "../shared/ecr2-stage8-evidence";

function currentResolverRecords() {
  const molecularWeights = ECR2_STAGE8_COMPONENTS.slice(0, 4).map((component, index) => [
    `physical_mw_${component.key}`,
    {
      ...findEcr2Stage8Evidence(`physical_mw_${component.key}` as any),
      status: "AUTO_RESOLVED_PENDING_ACCEPTANCE",
      value: 250 + index,
    },
  ]);
  const diffusivities = ECR2_STAGE8_COMPONENTS.flatMap((component) => ["c", "d"].map((phase) => [
    `diffusivity_${component.key}_${phase}`,
    {
      ...findEcr2Stage8Evidence(`diffusivity_${component.key}_${phase}` as any),
      status: "CALCULATED_PRELIMINARY",
      value: 1e-9,
      method: "Controlled Stage 8 preliminary route",
      inputSnapshot: { temperature_C: 60 },
    },
  ]));
  return Object.fromEntries([...molecularWeights, ...diffusivities]);
}

describe("ECR-2 Stage 8 live dependency model", () => {
  it("treats accepted resolver diffusivities as ready using their live method and temperature metadata", () => {
    const dependencies = getEcr2Stage8LiveDependencies({
      sim: { stage8_system_values_acceptance_status: "ACCEPTED" },
      hasAcceptedEcrRun: true,
      resolverRecords: currentResolverRecords(),
    });

    const unresolved = dependencies.filter((dependency) => !dependency.ready);
    expect(dependencies).toHaveLength(17);
    expect(dependencies.filter((dependency) => dependency.ready)).toHaveLength(16);
    expect(unresolved.map((dependency) => dependency.id)).toEqual([
      "partition_basis",
    ]);
    expect(
      dependencies.filter((dependency) => dependency.id.startsWith("diffusivity_") && !dependency.ready),
    ).toHaveLength(0);
  });
});