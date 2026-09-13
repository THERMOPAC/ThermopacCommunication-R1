export type PredictiveStageDisplayStatus =
  | "RECORDED"
  | "AUDIT_OBSERVED_NO_PAYLOAD"
  | "AWAITING_AUDIT"
  | "NO_RESULT_SNAPSHOT";

/** The worker owns acceptance; numeric payload presence is not a pass. */
export function predictiveStageVerdict(stage: Record<string, unknown> | null | undefined): "PASS" | "FAIL" | "PENDING" | "NOT RECORDED" {
  if (!stage) return "PENDING";
  if (stage.accepted === true) return "PASS";
  if (stage.accepted === false) return "FAIL";
  return "NOT RECORDED";
}

export type PredictiveStageDisplayRow = {
  stageFromFeedEnd: number;
  status: PredictiveStageDisplayStatus;
  stage: Record<string, unknown> | null;
};

export type PredictiveStageDisplay = {
  maximum: number;
  rows: PredictiveStageDisplayRow[];
  recordedCount: number;
  observedAuditCount: number;
  reason: string;
};

export type PredictiveStageDisplayJob = {
  id?: string;
  status: "pending" | "running" | "completed" | "failed";
  input?: { ntTest?: unknown; engineContractVersion?: unknown };
  progress?: { maximumStages?: unknown };
  internalProgress?: {
    completedInternalStages?: unknown;
    maximumInternalStages?: unknown;
  } | null;
  result?: {
    jobId?: unknown;
    sourceJobId?: unknown;
    internalProgress?: unknown;
    trials?: unknown;
  } | null;
};

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stageCountForJob(job: PredictiveStageDisplayJob): number {
  const ntTest = job.input?.ntTest;
  const maximumStages = job.progress?.maximumStages;
  if (
    integerInRange(ntTest, 1, 10)
    && maximumStages === 1
  ) {
    return ntTest;
  }
  return integerInRange(maximumStages, 1, 10) ? maximumStages : 10;
}

function hasCurrentResult(job: PredictiveStageDisplayJob): boolean {
  const result = asRecord(job.result);
  if (!result || !job.id) return Boolean(result);
  const resultJobId = result.jobId ?? result.sourceJobId;
  return typeof resultJobId !== "string" || resultJobId === job.id;
}

/**
 * Projects only stage evidence persisted for this job. Internal progress is an
 * audit counter, not a source of numeric stage data. In particular, this
 * never treats a missing stage object as a zero-filled or passing stage.
 */
export function predictiveNtStageDisplay(job: PredictiveStageDisplayJob): PredictiveStageDisplay {
  const maximum = stageCountForJob(job);
  const result = hasCurrentResult(job) ? asRecord(job.result) : null;
  const trials = result && Array.isArray(result.trials) ? result.trials : [];
  const exactNt = integerInRange(job.input?.ntTest, 1, 10)
    && job.progress?.maximumStages === 1;
  const trialRecords = trials.map(asRecord).filter(
    (trial): trial is Record<string, unknown> => Boolean(trial),
  );
  const matchingTrial = job.input?.engineContractVersion === "7C-1.6.0"
    ? trialRecords
      .filter((trial) => integerInRange(trial.stageCount, 1, maximum))
      .sort((left, right) => Number(right.stageCount) - Number(left.stageCount))[0]
    : trialRecords.find((trial) => (
      exactNt
        ? trial.stageCount === job.input?.ntTest
        : trial.stageCount === maximum
    ));
  const stagePayload = matchingTrial && Array.isArray(matchingTrial.stages)
    ? matchingTrial.stages
    : [];
  const recordedStages = new Map<number, Record<string, unknown>>();
  for (const value of stagePayload) {
    const stage = asRecord(value);
    const stageFromFeedEnd = stage?.stageFromFeedEnd;
    if (
      stage
      && integerInRange(stageFromFeedEnd, 1, maximum)
      && !recordedStages.has(stageFromFeedEnd)
    ) {
      recordedStages.set(stageFromFeedEnd, stage);
    }
  }

  const internalMaximum = job.internalProgress?.maximumInternalStages;
  const internalCompleted = job.internalProgress?.completedInternalStages;
  const observedAuditCount = integerInRange(internalMaximum, maximum, maximum)
    && integerInRange(internalCompleted, 0, maximum)
    ? internalCompleted
    : 0;
  const rows = Array.from({ length: maximum }, (_, index) => {
    const stageFromFeedEnd = index + 1;
    const stage = recordedStages.get(stageFromFeedEnd) ?? null;
    const status: PredictiveStageDisplayStatus = stage
      ? "RECORDED"
      : !result
        ? "NO_RESULT_SNAPSHOT"
        : stageFromFeedEnd <= observedAuditCount
          ? "AUDIT_OBSERVED_NO_PAYLOAD"
          : "AWAITING_AUDIT";
    return { stageFromFeedEnd, status, stage };
  });

  let reason: string;
  if (!result) {
    reason = "No result snapshot is available for this job yet.";
  } else if (!matchingTrial) {
    reason = observedAuditCount > 0
      ? "The worker has reported audit progress, but the per-stage numeric payload is not persisted until the full trial checkpoint is acknowledged."
      : "The coupled solver has not acknowledged a full trial checkpoint, so no per-stage numeric payload is available yet.";
  } else if (recordedStages.size < maximum) {
    reason = job.input?.engineContractVersion === "7C-1.6.0"
      ? "Only the persisted stage records from the latest persisted N_T trial checkpoint are shown. Remaining stage values are not available until the full trial checkpoint is acknowledged."
      : "Only the persisted stage records are shown. Remaining stage values are not available until the full trial checkpoint is acknowledged.";
  } else {
      reason = job.input?.engineContractVersion === "7C-1.6.0"
        ? "Numeric values are from the latest persisted N_T trial checkpoint for this job."
        : "Numeric values are from the persisted trial checkpoint for this job.";
  }

  return {
    maximum,
    rows,
    recordedCount: recordedStages.size,
    observedAuditCount,
    reason,
  };
}