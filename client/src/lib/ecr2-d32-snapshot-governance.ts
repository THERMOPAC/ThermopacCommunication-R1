export interface Ecr2D32SnapshotGovernance {
  transcriptionInvalid: boolean;
  label: string | null;
}

/**
 * Derives a display-only governance overlay for frozen simulator snapshots.
 * It never rewrites the persisted result JSON or recalculates d32.
 */
export function getEcr2D32SnapshotGovernance(
  snapshot: Record<string, any> | null | undefined,
): Ecr2D32SnapshotGovernance {
  const d32 = snapshot?.d32;
  const legacyPreliminary = d32?.status === "preliminary_engineering_reconstruction"
    || d32?.correlationStatus === "preliminary_engineering_reconstruction";
  const transcriptionInvalid = legacyPreliminary || d32?.status === "transcription_invalid"
    || d32?.correlationStatus === "transcription_invalid";

  return {
    transcriptionInvalid,
    label: transcriptionInvalid
      ? "TRANSCRIPTION-INVALID — this frozen d₃₂ result is retained for audit only and cannot support Stage 8 acceptance."
      : null,
  };
}