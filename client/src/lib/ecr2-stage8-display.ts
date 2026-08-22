export type Ecr2Stage8VisibleResolutionState =
  | "SYSTEM_RESOLVED_ACCEPTANCE_REQUIRED"
  | "SYSTEM_RESOLVED_READY"
  | "ENGINEER_ACCEPTED_READY"
  | "ENGINEER_OVERRIDE_REVIEW_REQUIRED"
  | "EVIDENCE_GAP";

const SYSTEM_RESOLVED_STATUSES = new Set([
  "AUTO_RESOLVED_PENDING_ACCEPTANCE",
  "CALCULATED_PRELIMINARY",
]);

export function getEcr2Stage8VisibleResolutionState({
  status,
  hasResolvedValue,
  ready,
}: {
  status: unknown;
  hasResolvedValue: boolean;
  ready: boolean;
}): Ecr2Stage8VisibleResolutionState {
  const normalizedStatus = String(status ?? "").trim();

  if (normalizedStatus === "ACCEPTED_AUTO_BASIS" && hasResolvedValue && ready) {
    return "SYSTEM_RESOLVED_READY";
  }
  if (normalizedStatus === "ENGINEER_OVERRIDE" && ready) {
    return "ENGINEER_ACCEPTED_READY";
  }
  if (normalizedStatus === "ENGINEER_OVERRIDE") {
    return "ENGINEER_OVERRIDE_REVIEW_REQUIRED";
  }
  if (hasResolvedValue && (
    SYSTEM_RESOLVED_STATUSES.has(normalizedStatus)
    || normalizedStatus === "ACCEPTED_AUTO_BASIS"
  )) {
    return "SYSTEM_RESOLVED_ACCEPTANCE_REQUIRED";
  }
  return "EVIDENCE_GAP";
}

export const ECR2_STAGE8_VISIBLE_STATE_LABELS: Record<Ecr2Stage8VisibleResolutionState, string> = {
  SYSTEM_RESOLVED_ACCEPTANCE_REQUIRED: "SYSTEM RESOLVED — ACCEPTANCE REQUIRED",
  SYSTEM_RESOLVED_READY: "SYSTEM RESOLVED — READY",
  ENGINEER_ACCEPTED_READY: "ENGINEER ACCEPTED — READY",
  ENGINEER_OVERRIDE_REVIEW_REQUIRED: "ENGINEER OVERRIDE — REVIEW REQUIRED",
  EVIDENCE_GAP: "EVIDENCE GAP",
};