export const ECR2_STAGE8_COMPONENTS = [
  { key: "sat", label: "Sat", title: "Saturates" },
  { key: "mono", label: "Mono", title: "Mono-aromatics" },
  { key: "di", label: "Di", title: "Di-aromatics" },
  { key: "poly", label: "Poly", title: "Poly-aromatics" },
  { key: "nmp", label: "NMP", title: "NMP" },
] as const;

export const ECR2_STAGE8_SOURCE_TYPES = ["Measured", "Vendor", "Literature", "Assumed"] as const;
type ResolverRecord = {
  id?: unknown;
  status?: unknown;
  value?: unknown;
  inputSnapshot?: Record<string, unknown>;
  method?: unknown;
  [key: string]: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function positive(value: unknown): boolean {
  const n = Number(text(value));
  return text(value) !== "" && Number.isFinite(n) && n > 0;
}

function taggedComplete(value: unknown, sourceType: unknown, sourceReference: unknown): boolean {
  return positive(value)
    && ECR2_STAGE8_SOURCE_TYPES.includes(text(sourceType) as typeof ECR2_STAGE8_SOURCE_TYPES[number])
    && text(sourceReference) !== "";
}

function evidenceId(prefix: string): string {
  return prefix.startsWith("molecular_weight_")
    ? `physical_mw_${prefix.replace("molecular_weight_", "")}`
    : prefix;
}

function acceptedResolverCandidate(
  sim: Record<string, string>,
  prefix: string,
  resolverRecords?: Record<string, ResolverRecord>,
): boolean {
  const record = resolverRecords?.[evidenceId(prefix)];
  if (!record || record.id !== evidenceId(prefix)
    || !["AUTO_RESOLVED_PENDING_ACCEPTANCE", "CALCULATED_PRELIMINARY"].includes(text(record.status))
    || !positive(record.value)) return false;
  return text(sim.stage8_system_values_acceptance_status) === "ACCEPTED";
}

function evidenceAccepted(
  sim: Record<string, string>,
  prefix: string,
  resolverRecords?: Record<string, ResolverRecord>,
): boolean {
  const status = text(sim[`${prefix}_evidence_status`]);
  if (status !== "ENGINEER_OVERRIDE" && acceptedResolverCandidate(sim, prefix, resolverRecords)) return true;
  return status === "ENGINEER_OVERRIDE"
    && positive(sim[`${prefix}_value`])
    && text(sim[`${prefix}_source_type`]) !== ""
    && text(sim[`${prefix}_source_reference`]) !== "";
}

function legacyObject(sim: Record<string, string>, key: string): Record<string, any> {
  try {
    const parsed = JSON.parse(sim[key] ?? "");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function legacyTagged(
  value: unknown,
  sim: Record<string, string>,
  prefix: string,
): boolean {
  const tagged = value as TaggedValue | undefined;
  return taggedComplete(
    tagged?.value,
    tagged?.sourceType,
    tagged?.sourceReference,
  ) || taggedComplete(
    sim[`${prefix}_value`],
    sim[`${prefix}_source_type`],
    sim[`${prefix}_source_reference`],
  );
}

/**
 * Stage 8's blocking graph. The legacy JSON fields are read only as a
 * backwards-compatible migration path; the current engineering contract is
 * the individual fields below.
 */
export function validateEcr2Stage8(
  sim: Record<string, string>,
  hasAcceptedEcrRun: boolean,
  resolverRecords?: Record<string, ResolverRecord>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const legacyMw = legacyObject(sim, "molecularWeights");
  const legacyBvp = legacyObject(sim, "bvp");

  if (!hasAcceptedEcrRun) {
    errors.stage7_ecr_result =
      "An accepted Stage 7 ECR Equipment Design result is required to inherit the active agitated height before the counter-current simulator can run";
  }

  for (const component of ECR2_STAGE8_COMPONENTS.slice(0, 4)) {
    const prefix = `molecular_weight_${component.key}`;
    const candidateAccepted = acceptedResolverCandidate(sim, prefix, resolverRecords);
    const legacyKey = component.key === "sat" ? "saturates_g_mol"
      : component.key === "mono" ? "mono_g_mol"
        : component.key === "di" ? "di_g_mol" : "poly_g_mol";
    if (!candidateAccepted && !legacyTagged(legacyMw[legacyKey], sim, prefix)) {
      errors[`${prefix}_value`] =
        `Physical ${component.title} molecular weight requires a positive value, source class, and source reference because downstream physical concentration and transfer-rate equations use it`;
    }
    if (!evidenceAccepted(sim, prefix, resolverRecords)) {
      errors[`${prefix}_evidence_status`] =
        `Physical ${component.title} auto-resolved basis requires explicit engineer acceptance or an override before it can be used`;
    }
  }

  const d32Mode = text(sim.d32_mode);
  if (d32Mode === "engineer_supplied") {
    if (!positive(sim.d32_value_mm))
      errors.d32_value_mm = "Engineer-supplied d₃₂ requires a positive value in mm";
    if (!text(sim.d32_source_type))
      errors.d32_source_type = "Engineer-supplied d₃₂ requires a source class";
    if (!text(sim.d32_source_reference))
      errors.d32_source_reference = "Engineer-supplied d₃₂ requires a source reference";
  } else if (d32Mode === "direct_turbulence_preliminary") {
    const nominalC = Number(text(sim.direct_turbulence_c_nominal));
    if (!Number.isFinite(nominalC) || nominalC < 0.36 || nominalC > 0.43) {
      errors.direct_turbulence_c_nominal =
        "DIRECT_TURBULENCE_D32_PRELIMINARY requires a selected nominal C within the governed sensitivity interval 0.36–0.43";
    }
    if (!ECR2_STAGE8_SOURCE_TYPES.includes(
      text(sim.direct_turbulence_c_source_type) as typeof ECR2_STAGE8_SOURCE_TYPES[number],
    )) {
      errors.direct_turbulence_c_source_type =
        "Selected direct-turbulence nominal C requires a recorded source class";
    }
    if (!text(sim.direct_turbulence_c_source_reference)) {
      errors.direct_turbulence_c_source_reference =
        "Selected direct-turbulence nominal C requires a recorded source reference";
    }
  } else if (d32Mode === "" || d32Mode === "published_correlation") {
    errors.d32_mode =
      "The K&H 1996 published d₃₂ reconstruction is transcription-invalid and cannot be used. Supply a tagged engineer value for sensitivity work or await independently verified source notation.";
  } else {
    errors.d32_mode = "d₃₂ route must be Engineer Supplied or DIRECT_TURBULENCE_D32_PRELIMINARY while the published K&H 1996 reconstruction is disabled";
  }
  // Blank d32_mode means the governed ECR-2 d32 route; it is not a missing
  // engineer value and is normalized by the workspace adapter.

  for (const component of ECR2_STAGE8_COMPONENTS) {
    for (const phase of ["c", "d"] as const) {
      const prefix = `diffusivity_${component.key}_${phase}`;
      const candidateAccepted = acceptedResolverCandidate(sim, prefix, resolverRecords);
      const legacy = legacyBvp.diffusivity?.[component.label === "Sat" ? "Sat" : component.label]?.[
        phase === "c" ? "De_c" : "De_d"
      ];
      if (!candidateAccepted && !legacyTagged(legacy, sim, prefix)) {
        errors[`${prefix}_value`] =
          `${phase === "c" ? "Dc" : "Dd"} ${component.label} requires a positive value, source class, and source reference`;
      }
      if (!candidateAccepted
        && !positive(sim[`${prefix}_reference_temperature_c`])
        && !positive((legacy as any)?.referenceTemperature_C)) {
        errors[`${prefix}_reference_temperature_c`] =
          `${phase === "c" ? "Dc" : "Dd"} ${component.label} requires its reference temperature`;
      }
      if (!candidateAccepted && !text(sim[`${prefix}_method`]) && !text((legacy as any)?.method)) {
        errors[`${prefix}_method`] =
          `${phase === "c" ? "Dc" : "Dd"} ${component.label} requires its estimation/measurement method`;
      }
      if (!evidenceAccepted(sim, prefix, resolverRecords)) {
        errors[`${prefix}_evidence_status`] =
          `${phase === "c" ? "Dc" : "Dd"} ${component.label} auto-resolved basis requires explicit engineer acceptance or an override before it can be used`;
      }
    }
  }

  const legacyBasis = legacyBvp.partitionBasis as Record<string, unknown> | undefined;
  if (
    text(sim.partition_basis_approval_status ?? legacyBasis?.approvalStatus)
      !== "engineer_approved_governed"
  ) {
    errors.partition_basis_approval_status =
      "Kd basis approval must explicitly be engineer_approved_governed";
  }
  if (!text(sim.partition_basis_source_reference ?? legacyBasis?.sourceReference)) {
    errors.partition_basis_source_reference =
      "Kd basis approval requires a source reference";
  }
  if (!text(sim.partition_basis_approved_by)) {
    errors.partition_basis_approved_by =
      "Kd basis approval requires the approving engineer";
  }
  if (!text(sim.partition_basis_approved_at)) {
    errors.partition_basis_approved_at =
      "Kd basis approval requires an approval timestamp";
  }

  return errors;
}
