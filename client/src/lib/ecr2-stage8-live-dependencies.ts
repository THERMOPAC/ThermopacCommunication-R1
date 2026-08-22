import {
  ECR2_STAGE8_COMPONENTS,
  ECR2_STAGE8_SOURCE_TYPES,
} from "./ecr2-stage8-validation";
import {
  findEcr2Stage8Evidence,
  type ECR2Stage8NumericalParameterId,
} from "@shared/ecr2-stage8-evidence";

type ResolverRecord = {
  status?: unknown;
  value?: unknown;
  method?: unknown;
  inputSnapshot?: Record<string, unknown>;
};

export type Ecr2Stage8LiveDependencyGroup =
  | "auto"
  | "engineering"
  | "approval";

export interface Ecr2Stage8LiveDependency {
  id: string;
  group: Ecr2Stage8LiveDependencyGroup;
  label: string;
  ready: boolean;
  sourceClass: string;
  downstreamUse: string;
  blockingReason: string;
}

export interface Ecr2Stage8LiveDependencyInput {
  sim: Record<string, string>;
  hasAcceptedEcrRun: boolean;
  resolverRecords?: Record<string, ResolverRecord>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function positive(value: unknown): boolean {
  const numeric = Number(text(value));
  return text(value) !== "" && Number.isFinite(numeric) && numeric > 0;
}

function legacyObject(sim: Record<string, string>, key: string): Record<string, any> {
  try {
    const parsed = JSON.parse(sim[key] ?? "");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function evidenceIdForPrefix(prefix: string): ECR2Stage8NumericalParameterId {
  return prefix.startsWith("molecular_weight_")
    ? `physical_mw_${prefix.replace("molecular_weight_", "")}` as ECR2Stage8NumericalParameterId
    : prefix as ECR2Stage8NumericalParameterId;
}

function systemResolved(record: ResolverRecord | undefined): boolean {
  return [
    "AUTO_RESOLVED_PENDING_ACCEPTANCE",
    "CALCULATED_PRELIMINARY",
    "ACCEPTED_AUTO_BASIS",
  ].includes(text(record?.status)) && positive(record?.value);
}

function acceptedSystemRecord(
  sim: Record<string, string>,
  record: ResolverRecord | undefined,
): boolean {
  if (!systemResolved(record)) return false;
  return text(record?.status) === "ACCEPTED_AUTO_BASIS"
    || text(sim.stage8_system_values_acceptance_status) === "ACCEPTED";
}

function hasCompleteOverride(
  sim: Record<string, string>,
  prefix: string,
  legacy: any,
  needsDiffusivityMetadata = false,
): boolean {
  if (text(sim[`${prefix}_evidence_status`]) !== "ENGINEER_OVERRIDE") return false;
  const complete = positive(sim[`${prefix}_value`] ?? legacy?.value ?? legacy?.value_m2_s)
    && ECR2_STAGE8_SOURCE_TYPES.includes(
      text(sim[`${prefix}_source_type`] ?? legacy?.sourceType) as typeof ECR2_STAGE8_SOURCE_TYPES[number],
    )
    && text(sim[`${prefix}_source_reference`] ?? legacy?.sourceReference) !== "";
  if (!complete || !needsDiffusivityMetadata) return complete;
  return positive(sim[`${prefix}_reference_temperature_c`] ?? legacy?.referenceTemperature_C)
    && text(sim[`${prefix}_method`] ?? legacy?.method) !== "";
}

function numericalDependencyReady(params: {
  sim: Record<string, string>;
  resolverRecords?: Record<string, ResolverRecord>;
  prefix: string;
  legacy: any;
  needsDiffusivityMetadata?: boolean;
}): boolean {
  const id = evidenceIdForPrefix(params.prefix);
  const record = params.resolverRecords?.[id] ?? findEcr2Stage8Evidence(id);
  if (hasCompleteOverride(
    params.sim,
    params.prefix,
    params.legacy,
    params.needsDiffusivityMetadata,
  )) return true;
  if (!acceptedSystemRecord(params.sim, record)) return false;
  if (!params.needsDiffusivityMetadata) return true;
  return positive(
    params.sim[`${params.prefix}_reference_temperature_c`]
      ?? record.inputSnapshot?.temperature_C
      ?? params.legacy?.referenceTemperature_C,
  ) && text(
    params.sim[`${params.prefix}_method`]
      ?? record.method
      ?? params.legacy?.method,
  ) !== "";
}

/**
 * The Stage 8 UI's sole live dependency model. Readiness, the unresolved
 * checklist, run-button state, and row badges must all consume this model so a
 * current system-resolved record cannot also be shown as missing.
 */
export function getEcr2Stage8LiveDependencies({
  sim,
  hasAcceptedEcrRun,
  resolverRecords,
}: Ecr2Stage8LiveDependencyInput): Ecr2Stage8LiveDependency[] {
  const legacyMw = legacyObject(sim, "molecularWeights");
  const legacyBvp = legacyObject(sim, "bvp");
  const d32Mode = text(sim.d32_mode);
  const d32Ready = d32Mode === "engineer_supplied"
    && (positive(sim.d32_value_mm)
      && text(sim.d32_source_type) !== ""
      && text(sim.d32_source_reference) !== "");
  const kdReady = text(sim.partition_basis_approval_status ?? legacyBvp.partitionBasis?.approvalStatus)
    === "engineer_approved_governed"
    && text(sim.partition_basis_source_reference ?? legacyBvp.partitionBasis?.sourceReference) !== ""
    && text(sim.partition_basis_approved_by ?? legacyBvp.partitionBasis?.approvedBy) !== ""
    && text(sim.partition_basis_approved_at ?? legacyBvp.partitionBasis?.approvedAt) !== "";

  return [
    {
      id: "stage7_ecr_result",
      group: "auto",
      label: "Stage 7 ECR equipment result",
      ready: hasAcceptedEcrRun,
      sourceClass: "INHERITED",
      downstreamUse: "Provides accepted active agitated height and ECR geometry to the BVP.",
      blockingReason: "Accepted Stage 7 ECR Equipment Design result is required; no manual Stage 8 geometry substitute is permitted.",
    },
    {
      id: "d32",
      group: "auto",
      label: "d₃₂",
      ready: d32Ready,
      sourceClass: d32Mode === "engineer_supplied" ? "ENGINEER_INPUT" : "TRANSCRIPTION_INVALID",
      downstreamUse: "Feeds the governed d32 route and interfacial area a = 6φd/d32 for local transfer.",
      blockingReason: d32Mode === "engineer_supplied"
        ? "Engineer-supplied d₃₂ needs a positive value, source class, and source reference."
        : "The K&H 1996 published d₃₂ reconstruction is transcription-invalid and cannot resolve a value. Use an explicit engineer-supplied sensitivity value or wait for independently verified source notation.",
    },
    ...ECR2_STAGE8_COMPONENTS.slice(0, 4).map((component) => {
      const prefix = `molecular_weight_${component.key}`;
      const legacyKey = component.key === "sat" ? "saturates_g_mol" : `${component.key}_g_mol`;
      const ready = numericalDependencyReady({
        sim, resolverRecords, prefix, legacy: legacyMw[legacyKey],
      });
      return {
        id: prefix,
        group: "engineering" as const,
        label: `Physical MW — ${component.label}`,
        ready,
        sourceClass: ready ? "SYSTEM_RESOLVER" : "SYSTEM_EVIDENCE_GAP",
        downstreamUse: "Builds physical mass fractions/concentrations, equilibrium concentrations, Kd, driving force, and transfer rate after NRTL.",
        blockingReason: "System physical-characterization resolver has no accepted RRBO pseudo-component molecular-weight basis.",
      };
    }),
    ...ECR2_STAGE8_COMPONENTS.flatMap((component) => (["c", "d"] as const).map((phase) => {
      const prefix = `diffusivity_${component.key}_${phase}`;
      const legacy = legacyBvp.diffusivity?.[component.label]?.[phase === "c" ? "De_c" : "De_d"];
      const ready = numericalDependencyReady({
        sim, resolverRecords, prefix, legacy, needsDiffusivityMetadata: true,
      });
      return {
        id: prefix,
        group: "engineering" as const,
        label: `${phase === "c" ? "Dc" : "Dd"} ${component.label}`,
        ready,
        sourceClass: ready ? "SYSTEM_RESOLVER" : "SYSTEM_EVIDENCE_GAP",
        downstreamUse: `Supplies the ${phase === "c" ? "continuous" : "dispersed"}-phase diffusivity for the ${component.label} Kühni local transfer/Schmidt calculation.`,
        blockingReason: "System resolver lacks an accepted, traceable diffusivity basis with operating-temperature and method metadata.",
      };
    })),
    {
      id: "partition_basis",
      group: "approval",
      label: "Kd concentration-basis approval",
      ready: kdReady,
      sourceClass: "ENGINEER_APPROVAL",
      downstreamUse: "Authorizes Koverall = kc·kd/(Kd·kd + kc) and the dispersed concentration driving force; numerical Kd remains locally calculated.",
      blockingReason: "Engineer approval of the governed concentration-basis relation and a source reference are required; numerical Kd entry is not requested.",
    },
  ];
}