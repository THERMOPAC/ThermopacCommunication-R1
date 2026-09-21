// No scientific values are calculated here. Paths retain saved field names/units;
// arrays (roots, continuation, reasons) remain JSON cells. JSON is the lossless companion.
type Row = Record<string, unknown>;
function flatten(value: any, prefix: string, row: Row) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, `${prefix}.${key}`, row);
  } else row[prefix] = value;
}

export function assertCompleteRun(value: any, expected: any) {
  if (!expected?.id || !expected?.sourceSnapshotHash || value?.id !== expected.id ||
      value?.sourceSnapshotHash !== expected.sourceSnapshotHash)
    throw new Error("Candidate detail identity is missing or changed. Reload history before downloading.");
  if (expected.stale || value.stale)
    throw new Error("The current saved basis changed. Reload current results; use historical export for archived evidence.");
  if (value.summaryOnly || !Array.isArray(value.result?.orientationComparison) ||
      !value.result.orientationComparison.every((o: any) => Array.isArray(o.geometryGrid) &&
        o.geometryGrid.every((g: any) => Array.isArray(g.trials))))
    throw new Error("Complete hydraulic trial detail is unavailable. Retry loading the saved run.");
}

export function* hydraulicRows(run: any): Generator<Row> {
  for (const [orientationIndex, orientation] of run.result.orientationComparison.entries()) {
    for (const [geometryIndex, group] of orientation.geometryGrid.entries()) {
      for (const [trialIndex, trial] of group.trials.entries()) {
        const base: Row = {
          "run.id": run.id, "run.sourceSnapshotHash": run.sourceSnapshotHash,
          "orientation.index": orientationIndex, orientation: orientation.orientation,
          "geometry.index": geometryIndex, "trial.index": trialIndex,
        };
        flatten(group.geometry, "geometry", base);
        // Do not repeat the entire six-scenario array on every scenario row.
        for (const [key, value] of Object.entries(trial)) {
          if (key === "hydraulicMethod" && value && typeof value === "object") {
            for (const [methodKey, child] of Object.entries(value)) {
              if (methodKey !== "scenarios") flatten(child, `trial.hydraulicMethod.${methodKey}`, base);
            }
          } else flatten(value, `trial.${key}`, base);
        }
        const scenarios = trial.hydraulicMethod?.scenarios;
        if (!Array.isArray(scenarios) || !scenarios.length) {
          yield { ...base, "scenario.index": null, "scenario.present": false };
        } else for (const [index, scenario] of scenarios.entries()) {
          const row = { ...base, "scenario.index": index, "scenario.present": true };
          flatten(scenario, "scenario", row);
          yield row;
        }
      }
    }
  }
}

export function hydraulicCsvCell(value: unknown): string {
  let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (typeof value !== "number" && /^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildHydraulicCsv(run: any): { blob: Blob; trialCount: number; rowCount: number } {
  assertCompleteRun(run, run);
  const columns = new Set<string>();
  let rowCount = 0;
  for (const row of hydraulicRows(run)) {
    for (const key of Object.keys(row)) columns.add(key);
    rowCount++;
  }
  const headers = [...columns];
  const chunks: BlobPart[] = ["\uFEFF", headers.map(hydraulicCsvCell).join(",") + "\r\n"];
  let chunk = "";
  for (const row of hydraulicRows(run)) {
    chunk += headers.map(key => hydraulicCsvCell(row[key])).join(",") + "\r\n";
    if (chunk.length >= 262144) { chunks.push(chunk); chunk = ""; }
  }
  if (chunk) chunks.push(chunk);
  const trialCount = run.result.orientationComparison.reduce((n: number, o: any) =>
    n + o.geometryGrid.reduce((m: number, g: any) => m + g.trials.length, 0), 0);
  return { blob: new Blob(chunks, { type: "text/csv;charset=utf-8" }), trialCount, rowCount };
}

export function prepareCompleteRun(run: any, format: "csv" | "json") {
  assertCompleteRun(run, run);
  const csv = format === "csv" ? buildHydraulicCsv(run) : null;
  const blob = csv?.blob ?? new Blob([JSON.stringify(run)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  return {
    url, format,
    filename: `stage3-complete-${String(run.id).replace(/[^a-zA-Z0-9_-]/g, "_")}.${format}`,
    bytes: blob.size,
    summary: csv ? `Ready: ${csv.trialCount} trials, ${csv.rowCount} trial/scenario rows.` :
      "Ready: complete saved run JSON, including scientific evidence and metadata.",
  };
}