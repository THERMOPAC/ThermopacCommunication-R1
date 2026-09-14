type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const integer = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;

export function Stage4SolverTelemetry({ telemetry }: { telemetry: unknown }) {
  const data = record(telemetry);
  if (typeof data.operation !== "string" || !data.operation) return null;
  const duration = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? `${(value / 1000).toFixed(1)} s` : "Not recorded";
  const cell = integer(data.cellIndex);
  const iteration = integer(data.iteration);
  const residuals = Object.entries(record(data.residuals))
    .filter((entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]));
  const stamp = typeof data.checkpointTimestamp === "string" || typeof data.checkpointTimestamp === "number"
    ? new Date(data.checkpointTimestamp) : null;
  return (
    <section className="mt-3 rounded border border-sky-300 bg-white p-3"
      data-testid="stage4-solver-telemetry">
      <h4 className="font-semibold">Solver work — last saved update</h4>
      <p className="mt-1 font-semibold capitalize">{data.operation.replaceAll("_", " ").toLowerCase()}</p>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {iteration !== null && iteration > 0 && <p>Iteration: {iteration}</p>}
        {cell !== null && <p>Cell: {cell + 1} / {integer(data.totalCells) ?? "—"}</p>}
        <p>Interface solves completed: {integer(data.interfaceCallsCompleted) ?? "Not recorded"}</p>
        <p>Interface solves attempted: {integer(data.interfaceCallsAttempted) ?? "Not recorded"}</p>
        <p>Elapsed at last update: {duration(data.elapsedMs)}</p>
        <p>Operation elapsed at last update: {duration(data.operationElapsedMs)}</p>
      </div>
      {stamp && Number.isFinite(stamp.getTime()) && (
        <p className="mt-2 text-slate-600">Updated: <time dateTime={stamp.toISOString()}>{stamp.toISOString()}</time></p>
      )}
      {residuals.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer">Recorded residuals — not an acceptance verdict</summary>
          <dl className="mt-1 grid grid-cols-2 gap-1 font-mono">
            {residuals.map(([name, value]) => <div key={name}>
              <dt>{name}</dt><dd>{value.toExponential(3)}</dd>
            </div>)}
          </dl>
        </details>
      )}
      <p className="mt-2 text-slate-600">
        Updates show measured work inside a trial, not percentage complete or proof of convergence.
        Timing values remain at the last saved update.
      </p>
    </section>
  );
}

export default function Stage4TrialProgress({ progress, minimum, maximum, notRun }: {
  progress: unknown;
  minimum: unknown;
  maximum: unknown;
  notRun: boolean;
}) {
  const cases = record(progress);
  return (
    <section className="mt-3 space-y-2" data-testid="stage4-physical-trial-progress">
      <h4 className="font-semibold">Physical-count trial completion</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["primary", "sensitivity"] as const).map(key => {
          const data = record(cases[key]);
          const first = integer(data.minimumPhysicalCount) ?? integer(minimum);
          const last = integer(data.maximumPhysicalCount) ?? integer(maximum);
          const total = integer(data.totalPhysicalTrials)
            ?? (first !== null && last !== null && first > 0 && last >= first ? last - first + 1 : null);
          const completed = integer(data.completedPhysicalTrials) ?? (notRun ? 0 : null);
          const resolved = integer(data.resolvedPhysicalTrials) ?? (notRun ? 0 : null);
          const unresolved = integer(data.unresolvedPhysicalTrials) ?? (notRun ? 0 : null);
          return (
            <div key={key} className="rounded border border-cyan-200 bg-white p-2"
              data-testid={`stage4-${key}-trial-count`}>
              <p className="font-semibold">{key === "primary" ? "Primary — 0.0126" : "Sensitivity — 0.0105"}</p>
              <p className="mt-1 font-mono">
                Completed trials: {completed ?? "Not recorded"} / {total ?? "—"}
              </p>
              {completed !== null && total !== null && total > 0 && completed <= total && (
                <progress className="stage4-trial-meter mt-1"
                  value={completed} max={total}
                  aria-label={`${key} physical-count trials completed`}
                  aria-valuetext={`${completed} of ${total} candidate trials completed`} />
              )}
              <p className="mt-1">Resolved: {resolved ?? "Not recorded"} · Numerically unresolved: {unresolved ?? "Not recorded"}</p>
              <p className="mt-1">Last completed physical count: {integer(data.lastCompletedPhysicalCount) ?? "—"}</p>
              <p className="mt-1">Search range: {first ?? "—"}–{last ?? "—"} · Maximum physical count: {last ?? "—"}</p>
            </div>
          );
        })}
      </div>
      <p className="text-slate-600">
        A trial is counted after both mesh attempts finish and its outcome is recorded.
        Completed does not mean accepted. The maximum physical count is a search bound,
        not the number of trials; the search can stop before reaching it.
      </p>
    </section>
  );
}

export function Stage4FailureReason({ code, historical = false }: {
  code: unknown;
  historical?: boolean;
}) {
  if (typeof code !== "string" || !code) return null;
  const timeLimit = code.includes("BUDGET_EXHAUSTED") || code.includes("TIMEOUT");
  return (
    <section className="m-3 rounded border border-amber-400 bg-amber-50 p-3 text-xs"
      data-testid={historical ? "stage4-previous-failure" : "stage4-failure-reason"}>
      <p className="font-semibold">
        {historical ? "Previous run (older calculation version): " : "Calculation stopped: "}
        {timeLimit ? "Time limit reached" : "Recorded error"}
      </p>
      <p className="mt-1">{timeLimit
        ? "The run reached its execution time limit before a complete sizing result was available. This is not a physical-infeasibility verdict."
        : "No accepted sizing result is established by this error. Review the recorded diagnostics before retrying."}</p>
      <p className="mt-1 break-all font-mono">{code}</p>
      {historical && <p className="mt-1">This historical failure is not a result for the current calculation version. No automatic retry was started.</p>}
    </section>
  );
}