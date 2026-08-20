import { extractC2ThermodynamicHandoff } from './llx-ecr-simulator-engine';

export interface ECR2C2HandoffSource {
  sourceRevisionId?: string;
  sourceWorkspaceId?: string;
  c2ResultComputedAt?: Date | string | null;
  c2InputsUpdatedAt?: Date | string | null;
}

function isStaleC2Snapshot(source: ECR2C2HandoffSource): boolean {
  if (!source.c2ResultComputedAt || !source.c2InputsUpdatedAt) return false;
  const resultComputedAt = new Date(source.c2ResultComputedAt).getTime();
  const inputsUpdatedAt = new Date(source.c2InputsUpdatedAt).getTime();
  return Number.isFinite(resultComputedAt)
    && Number.isFinite(inputsUpdatedAt)
    && inputsUpdatedAt > resultComputedAt;
}

/**
 * Service-boundary adapter for the persisted C2 result snapshot.
 *
 * This module stays dependency-light so its exact production boundary can be
 * regression-tested independently of the broader Design Software service:
 * design_software_results.data → ECR-2 input snapshot. No coordinates are
 * regenerated here. The engine's governed fallback remains responsible for a
 * missing or malformed C2 snapshot.
 */
export function injectC2ThermodynamicHandoffForECR2(
  inputs: Record<string, unknown>,
  c2ResultData: unknown,
  source: ECR2C2HandoffSource = {},
): boolean {
  if (c2ResultData !== undefined && c2ResultData !== null && isStaleC2Snapshot(source)) {
    throw new Error(
      'The C2 Process Design inputs changed after the last accepted C2 run. Re-run C2 Process Design before running the ECR-2 simulator.',
    );
  }
  const handoff = extractC2ThermodynamicHandoff({
    data: c2ResultData,
    ...(source.sourceRevisionId ? { revisionId: source.sourceRevisionId } : {}),
    ...(source.sourceWorkspaceId ? { workspaceId: source.sourceWorkspaceId } : {}),
  });
  if (!handoff) return false;
  inputs.c2ThermodynamicHandoff = handoff;
  return true;
}