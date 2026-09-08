export type PredictiveProgressJob = {
  status: "pending" | "running" | "completed" | "failed";
  input?: { ntTest?: number };
  progress: { completedStageTrials: number; maximumStages: number };
  internalProgress?: {
    completedInternalStages: number;
    maximumInternalStages: number;
  } | null;
  result?: {
    trials?: Array<{ stageCount: number; stages?: Array<{ stageFromFeedEnd: number }> }>;
  } | null;
};

function validCount(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum;
}

/** Counts recorded audits, not accepted stages, physical compartments, or elapsed work. */
export function predictiveNtProgress(job: PredictiveProgressJob, monitoringPaused = false) {
  const nt = job.input?.ntTest;
  const exact = typeof nt === "number" && Number.isInteger(nt) && nt >= 1 && nt <= 10
    && job.progress.maximumStages === 1;
  const maximum = exact ? nt : job.progress.maximumStages;
  const internal = job.internalProgress;
  let completed: number | null = exact
    ? internal?.maximumInternalStages === maximum
      && validCount(internal.completedInternalStages, maximum)
        ? internal.completedInternalStages : null
    : validCount(job.progress.completedStageTrials, maximum)
      ? job.progress.completedStageTrials : null;

  // Old workers can finish with persisted 0/N. Use the actual matching result,
  // never job status alone, to recognize the audits recorded in that result.
  if (exact && job.status === "completed") {
    const trial = job.result?.trials?.find(value => value.stageCount === nt);
    const stages = trial?.stages;
    if (stages?.length && stages.length <= maximum) {
      const positions = stages.map(stage => stage.stageFromFeedEnd);
      if (positions.every(position => Number.isInteger(position) && position >= 1 && position <= maximum)
        && new Set(positions).size === positions.length) {
        completed = stages.length;
      }
    }
  }

  const active = job.status === "pending" || job.status === "running";
  const unit = exact ? "stage audits recorded" : "stage trials recorded";
  const count = completed === null ? "Progress count unavailable" : `${completed}/${maximum} ${unit}`;
  let label: string;
  let detail: string;
  if (monitoringPaused && active) {
    label = "Monitoring paused — showing the last received progress";
    detail = "The solver may still be running. Resume monitoring to receive updates.";
  } else if (job.status === "pending") {
    label = "Waiting for an available solver worker…";
    detail = "No calculation progress has been reported yet.";
  } else if (job.status === "running" && exact && !completed) {
    label = `Running coupled N_T=${nt} calculation…`;
    detail = "All stages are solved together before stage audits are recorded. Percentage complete is not available during this phase.";
  } else if (job.status === "running") {
    label = completed === maximum
      ? `Finalizing calculation — ${count}`
      : exact ? `Recording N_T=${nt} stage audits — ${count}` : `Evaluating configured trials — ${count}`;
    detail = "These counts describe recorded work, not elapsed-time progress or scientific acceptance.";
  } else {
    label = `${job.status === "completed" ? "Calculation completed" : "Calculation stopped or failed"} — ${count}`;
    detail = "Calculation progress is separate from product-target acceptance and design eligibility.";
  }
  const indeterminate = active && !monitoringPaused
    && (job.status === "pending" || !completed || completed === maximum);
  return { label, detail, completed, maximum, indeterminate, active: active && !monitoringPaused };
}