// Export only the already loaded automatic selection, never the large raw run or user metadata.
const text = (value: unknown): string => value == null ? "Not available" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
const escape = (value: unknown) => text(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const table = (headers: string[], rows: unknown[][]) => `<table><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(v => `<td>${escape(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const fields = (values: Record<string, unknown>) => table(["Metric", "Saved value"], Object.entries(values));
const headers = ["Diameter (m)", "Eligible configurations (count)", "Discrete RPM", "Pitch (m)", "Rotor (m)", "Free area (fraction)", "Worst-six loading (fraction)", "Cross-section area (m²)", "Area increase (%)", "Loading improvement (%)", "Elasticity (dimensionless)", "Normalized score y−x (dimensionless)", "Disposition"];
function comparison(selection: any): unknown[][] {
  return (selection.references ?? []).map((p: any) => [
    p.geometry?.columnDiameterM, p.feasibleConfigurationCount, p.trial?.rpm, p.geometry?.compartmentHeightM,
    p.geometry?.rotorDiameterM, p.geometry?.freeArea, p.loading, p.areaM2, p.areaIncreasePercent,
    p.loadingImprovementPercent, p.elasticity, p.normalizedScore,
    p.geometry?.columnDiameterM === selection.selected?.geometry?.columnDiameterM ? "Automatically selected" : p.dominated ? "Size dominated" : "Nondominated reference",
  ]);
}
function selectionFor(run: any) {
  if (!run?.automaticSelection || run.stale) throw new Error("A current verified automatic Stage 3 selection is required for download.");
  return run.automaticSelection;
}

export function buildSelectionHtml(run: any): string {
  const a = selectionFor(run), s = a.selected, t = s?.trial, g = s?.geometry;
  const source = a.source ?? {};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stage 3 preliminary hydraulic selection</title><style>body{font:15px system-ui,sans-serif;color:#172033;max-width:1200px;margin:32px auto;padding:0 20px}h1,h2{color:#153f73}table{border-collapse:collapse;width:100%;margin:16px 0;font-size:12px}th,td{border:1px solid #ccd5df;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#eef4fb}p,pre{overflow-wrap:anywhere;white-space:pre-wrap}.notice{border:1px solid #abc5e4;background:#eef4fb;padding:16px}@media print{body{margin:0;max-width:none;padding:0;font-size:11px}table{font-size:9px}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body>
<h1>Stage 3 — automatic preliminary hydraulic selection</h1>
<p>Downloaded from the currently loaded, verified selection. No calculation, refetch, or saved input change. Open this self-contained HTML in a browser; use Print → Save as PDF.</p>
<div class="notice"><strong>${escape(a.status)}</strong><p>${s ? "Automatically selected hydraulic configuration; preliminary Stage 4 HETS geometry only." : "No eligible configuration. Stage 4 is blocked; no historical or manual fallback."}</p>
<p>Preliminary extrapolated hydraulic screening, not model governance, separation qualification, or mass-transfer adequacy. This is not proof of convexity or a unique physical optimum. Normalized score is not scientific confidence; search bounds and grid can change the result. Lower-branch continuation establishes quasi-steady admissibility, not dynamic stability.</p></div>
<h2>Selected configuration</h2>
${s ? fields({
    "Column diameter (m)": g.columnDiameterM, "Rotor diameter (m)": g.rotorDiameterM,
    "Compartment pitch (m)": g.compartmentHeightM, "Free area (fraction)": g.freeArea,
    "Pitch / column ratio": g.hcToColumn, "Rotor / column ratio": g.rotorToColumn,
    "Discrete RPM": t.rpm, "Worst-six loading (fraction)": s.loading,
    "Margin to 0.70 (fraction)": typeof s.loading === "number" ? .70 - s.loading : null,
    "Minimum flood minus operating holdup gap (fraction)": s.minimumHoldupGap,
    "Minimum interfacial area (m²/m³)": s.minimumInterfacialAreaM2M3,
    "Cross-section area (m²)": s.areaM2,
    "Governing operating holdup (fraction)": t.hydraulicMethod?.governing?.operatingHoldup,
    "Governing d32 (m)": t.hydraulicMethod?.governing?.d32M,
    "Governing capacity (m/s)": t.hydraulicMethod?.governing?.capacityMS,
    "Rotor Reynolds number": t.rotorReynolds, "Tip speed (m/s)": t.tipSpeedMS,
    "Power / volume (W/m³)": t.powerVolumeWM3, "Trial status": t.status, "Trial validity": t.validity,
  }) : "<p>No selected geometry or hydraulic metrics.</p>"}
${t ? `<h2>Six sensitivity scenarios</h2>${table(
    ["Interface", "C32", "d32 (m)", "Operating holdup", "Flood holdup", "Capacity (m/s)", "Loading", "Area (m²/m³)", "Terminal Re", "Characteristic Re", "We", "Eo", "Oh continuous", "Oh dispersed"],
    (t.hydraulicMethod?.scenarios ?? []).map((v: any) => [v.interfaceScenario, v.coefficient, v.d32M, v.operatingHoldup, v.floodHoldup, v.capacityMS, v.loading, v.interfacialAreaM2M3, v.terminalRe, v.characteristicRe, v.diagnostics?.weberTerminal, v.diagnostics?.eotvos, v.diagnostics?.ohnesorgeContinuous, v.diagnostics?.ohnesorgeDispersed]),
  )}<p>Operating holdup is not modeled flood holdup. Holdups and loading are fractions; C32, Re, We, Eo and Oh are dimensionless. Empty scenario evidence means not available, not zero.</p>` : ""}
<h2>Policy and why this diameter</h2>
<p>Consistent per-diameter basis: each reference minimizes worst-six-scenario loading among eligible configurations at that diameter, with deterministic ties by RPM, pitch, rotor diameter, then free area. Drop size and interfacial area are not independently optimized. Eligibility requires six connected lower-branch roots, loading ≤ 0.70 in every scenario, and tip speed ≤ 4.5 m/s.</p>
<p>No RPM-window criterion: neither a 20 rpm window nor the historical second-smallest-diameter preference gates this selection. A discrete RPM is not a qualified operating window.</p>
<p>On size-nondominated references, x = (A − Afirst)/(Alast − Afirst), y = (Lfirst − L)/(Lfirst − Llast). Select the maximum positive interior y−x global chord departure, with machine-precision ties toward smaller diameter. If no positive interior departure is resolved, use the smallest eligible diameter; with no eligible configuration, block Stage 4.</p>
<p>${escape(a.rationale)}</p><p>${escape(a.sensitivity)}</p>
${fields({ "Policy version": a.policy?.version, "Policy hash": a.policyHash, "Selection hash": a.immutableHash,
    "Saved policy": a.policy, "Fallback / selection status": a.status, "Knee at eligible boundary": a.kneeAtEligibleBoundary })}
<h2>Full diameter comparison</h2>
<p>All saved eligible diameter references, including dominated references. Area increase and loading improvement compare adjacent diameter references; elasticity = loading improvement % / area increase %. Missing scores or increments are not zero. Diameters without eligible trials are represented in the configured search scope, not fabricated as references.</p>
${table(headers, comparison(a))}
<h2>Search scope and qualification</h2>
${fields({ "Configured search (diameterM / compartmentHeightM / rotorDiameterM in m; rpm in rev/min; ratios and freeArea dimensionless)": a.configuredSearch,
    "Eligible diameter bounds (m)": a.eligibleDiameterBoundsM, "Eligible configuration count": a.feasibleConfigurationCount,
    "Rejected trial count": a.rejectedTrialCount, Qualification: a.qualification, "Qualification unknowns": a.qualificationUnknowns })}
<p>Interface mobility, inversion, entrainment, disengagement, turbulence, Schiller–Naumann range, spherical-drop qualification and dynamic stability remain UNKNOWN.</p>
<h2>Candidate and source provenance</h2>
${fields({ "Candidate ID": source.candidateId ?? run.id, "Candidate immutable hash": source.candidateImmutableHash,
    "Calculation hash": source.calculationHash, "Current Stage 1 hash": source.currentStage1Hash,
    "Source snapshot hash": run.sourceSnapshotHash, "Candidate method version": run.version,
    "Phase configuration": run.phaseConfiguration, "Property temperature (°C)": run.propertyTemperatureC,
    "Source engine": source.method ?? run.result?.engine })}
${t ? `<h2>Selected trial — complete saved hydraulic diagnostics</h2><p>Includes six sensitivity scenarios, operating and flood holdup, d32 (m), capacity (m/s), loading (fraction), interfacial area (m²/m³), terminal and characteristic Reynolds numbers, Weber, Eötvös and Ohnesorge diagnostics, continuation, residuals and qualification as available. Missing evidence is not inferred.</p><pre>${escape(t)}</pre>` : ""}
</body></html>`;
}

// Quote all cells, and neutralize spreadsheet formulas in text without corrupting negative numeric data.
export function buildSelectionCsv(run: any): string {
  const a = selectionFor(run);
  const cell = (value: unknown) => {
    let v = text(value);
    if (typeof value !== "number" && /^[\s]*[=+\-@]/.test(v)) v = `'${v}`;
    return `"${v.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + [headers, ...comparison(a)].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadSelection(run: any, format: "html" | "csv") {
  const content = format === "html" ? buildSelectionHtml(run) : buildSelectionCsv(run);
  const id = String(run.id ?? "candidate").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100) || "candidate";
  const url = URL.createObjectURL(new Blob([content], { type: format === "html" ? "text/html;charset=utf-8" : "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `stage3-hydraulic-selection-${id}.${format}`;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
}