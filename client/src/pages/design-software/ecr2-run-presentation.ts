export type Ecr2ExecutionMode = 'PRE_PILOT_PREDICTIVE' | 'GOVERNED_RELEASE';

export interface Ecr2PresentationRun {
  calculation_status?: string;
  input_snapshot?: unknown;
  result_snapshot?: unknown;
}

export function parseEcr2Snapshot(value: unknown): any | null {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function selectEcr2RunPresentation(input: {
  latestRun: Ecr2PresentationRun | null | undefined;
  acceptedGovernedSnapshot: unknown;
}) {
  const runSnapshot = parseEcr2Snapshot(input.latestRun?.result_snapshot);
  const runInputSnapshot = parseEcr2Snapshot(input.latestRun?.input_snapshot);
  const acceptedGovernedSnapshot = parseEcr2Snapshot(input.acceptedGovernedSnapshot);
  const executionMode = (runSnapshot?.executionMode
    ?? runInputSnapshot?.__ecr2_execution_mode
    ?? null) as Ecr2ExecutionMode | null;
  const hasCurrentRunSnapshot = runSnapshot != null;
  const displayedSnapshot = hasCurrentRunSnapshot
    ? runSnapshot
    : input.latestRun
      ? null
      : acceptedGovernedSnapshot;

  return {
    displayedSnapshot,
    runSnapshot,
    acceptedGovernedSnapshot,
    executionMode,
    isPredictive: executionMode === 'PRE_PILOT_PREDICTIVE',
    displaySource: hasCurrentRunSnapshot
      ? 'CURRENT_RUN'
      : input.latestRun
        ? 'CURRENT_RUN_SNAPSHOT_UNAVAILABLE'
        : acceptedGovernedSnapshot
          ? 'ACCEPTED_GOVERNED_RESULT'
          : 'NONE',
  } as const;
}