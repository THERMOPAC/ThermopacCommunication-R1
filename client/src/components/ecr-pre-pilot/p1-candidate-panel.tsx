import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadSelection } from "./p1-selection-download";

const number = (value: unknown) => typeof value === "number" ? Number(value.toPrecision(6)).toString() : "—";
async function request(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { credentials: "include", ...init, signal: controller.signal });
    const body = await response.json().catch(() => { throw new Error(`Stage 3 returned an invalid response (HTTP ${response.status}).`); });
    if (!response.ok) throw new Error(body.error ?? `Stage 3 request failed (HTTP ${response.status})`);
    return body;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Stage 3 request timed out. Retry loading saved evidence.");
    throw error;
  } finally { clearTimeout(timer); }
}

export function P1CandidateResults({ run, fullUrl }: { run: any; fullUrl?: string }) {
  const [diameter, setDiameter] = useState("");
  const [geometryIndex, setGeometryIndex] = useState(0);
  const [rpm, setRpm] = useState("");
  const [fullRun, setFullRun] = useState<any>(null);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionError, setInspectionError] = useState("");
  const [inspectionRetry, setInspectionRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!inspectionOpen || !run?.summaryOnly || !fullUrl || fullRun) return;
    setInspectionError("");
    void request(fullUrl).then(value => {
      if (value.id !== run.id || value.sourceSnapshotHash !== run.sourceSnapshotHash) throw new Error("Candidate detail identity changed. Reload history.");
      if (!cancelled) setFullRun(value);
    }).catch(e => { if (!cancelled) setInspectionError(e.message); });
    return () => { cancelled = true; };
  }, [inspectionOpen, fullUrl, run?.id, run?.sourceSnapshotHash, run?.summaryOnly, inspectionRetry, fullRun]);
  const evidence = run ? fullRun ?? run : null;
  const result = evidence?.result;
   const orientation = result?.orientationComparison?.find((item: any) => item.orientation === run.phaseConfiguration);
  const grid: any[] = orientation?.geometryGrid ?? [];
  const diameters = [...new Set(grid.map(item => item.geometry.columnDiameterM))].sort((a, b) => a - b);
  const currentDiameter = diameters.includes(Number(diameter)) ? Number(diameter) : diameters[0];
  const geometries = grid.filter(item => item.geometry.columnDiameterM === currentDiameter);
  const geometry = geometries[geometryIndex] ?? geometries[0];
  const trial = geometry?.trials?.find((item: any) => String(item.rpm) === rpm) ?? geometry?.trials?.find((item: any) => item.status === "FEASIBLE") ?? geometry?.trials?.[0];
  if (!result) return null;
  const automatic = run.automaticSelection;
  const selected = automatic?.selected;
  return <div className="mt-3 min-w-0 space-y-3 break-words text-xs">
    {automatic && <section className="rounded border border-blue-300 bg-blue-50 p-3" data-testid="automatic-stage3-selection">
      <h3 className="font-semibold">Current automatic Stage 3 result — preliminary hydraulic screening</h3>
      <p>{automatic.status}</p>
      {selected ? <>
        <p className="font-semibold">Column D {number(selected.geometry.columnDiameterM)} m · rotor {number(selected.geometry.rotorDiameterM)} m · pitch {number(selected.geometry.compartmentHeightM)} m · free area {number(selected.geometry.freeArea)} · {number(selected.trial.rpm)} rpm</p>
        <p>Worst-six loading {number(selected.loading)} · margin to 0.70 {number(.70 - selected.loading)} · minimum holdup gap {number(selected.minimumHoldupGap)} · minimum interfacial area {number(selected.minimumInterfacialAreaM2M3)} m²/m³</p>
        <p>Governing φ {number(selected.trial.hydraulicMethod?.governing?.operatingHoldup)} · d32 {number(selected.trial.hydraulicMethod?.governing?.d32M)} m · capacity {number(selected.trial.hydraulicMethod?.governing?.capacityMS)} m/s</p>
        <p>Stage 4 HETS uses this exact automatic geometry. No manual selection or approval is required. Extrapolated preliminary screening is not model governance or separation qualification.</p>
      </> : <p role="alert">No eligible configuration. Stage 4 is blocked; there is no historical or manual fallback.</p>}
      <p>{automatic.status === "SMALLEST_FEASIBLE_NO_RESOLVED_KNEE" ? "No resolved interior diminishing-returns evidence; automatically using smallest eligible diameter." : "Maximum positive discrete global chord departure over the full configured envelope."}</p>
      <h4 className="mt-2 font-semibold">Why this diameter</h4>
      <p>{automatic.rationale} {automatic.sensitivity}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={!!run.stale} onClick={() => downloadSelection(run, "html")}>Download results (HTML)</Button>
        <Button size="sm" variant="outline" disabled={!!run.stale || !automatic.references?.length} onClick={() => downloadSelection(run, "csv")}>Download comparison (CSV)</Button>
      </div>
      <p className="mt-1">HTML report opens in your browser and can be printed to PDF. Downloads use only this loaded automatic result; no new calculation.</p>
      <details className="mt-2">
        <summary className="cursor-pointer font-semibold">System shortlist and diameter-to-diameter comparison</summary>
        <p>{automatic.rationale} {automatic.sensitivity}. Normalized score is not scientific confidence. Bounds and grid can change the result.</p>
        <p>Full configured diameter grid (m): {automatic.configuredSearch?.find((g: any) => g.orientation === run.phaseConfiguration)?.diameterM?.join(", ")}. Eligible envelope (m): {automatic.eligibleDiameterBoundsM?.join("–") ?? "none"}.</p>
        <p>Policy {automatic.policy?.version} · selection hash {automatic.immutableHash}</p>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{["D m", "Count", "RPM / hc / rotor / free", "Worst loading", "A m²", "ΔA %", "Loading gain %", "E", "y−x", "Disposition"].map(h => <th key={h} className="p-1">{h}</th>)}</tr></thead>
          <tbody>{automatic.references.map((p: any) => <tr key={p.geometry.columnDiameterM} className="border-t">
            <td>{number(p.geometry.columnDiameterM)}</td><td>{p.feasibleConfigurationCount}</td>
            <td>{[p.trial.rpm, p.geometry.compartmentHeightM, p.geometry.rotorDiameterM, p.geometry.freeArea].map(number).join(" / ")}</td>
            <td>{number(p.loading)}</td><td>{number(p.areaM2)}</td><td>{number(p.areaIncreasePercent)}</td>
            <td>{number(p.loadingImprovementPercent)}</td><td>{number(p.elasticity)}</td><td>{number(p.normalizedScore)}</td>
            <td>{p.geometry.columnDiameterM === selected?.geometry.columnDiameterM ? "Automatically selected" : p.dominated ? "Size dominated" : "Nondominated reference"}</td>
          </tr>)}</tbody></table></div>
      </details>
    </section>}
    <details onToggle={e => setInspectionOpen(e.currentTarget.open)}><summary className="cursor-pointer font-semibold">Historical engine selection provenance and raw trial inspection (not downstream selection)</summary>
    {run.summaryOnly && !fullRun ? inspectionError
      ? <div role="alert">{inspectionError} <Button size="sm" variant="outline" onClick={() => setInspectionRetry(value => value + 1)}>Retry scientific detail</Button></div>
      : <p role="status">Loading complete scientific evidence…</p>
      : <>
    <p><strong>Historical engine result: {result.status}</strong> — {result.selectedGeometry ? "Legacy engine selection" : "Legacy engine selected no geometry."}</p>
    <p>The legacy 20 rpm window preference and second-smallest adequate diameter do not gate automatic P1 selection or downstream HETS. {(result.blockers ?? []).join("; ")}</p>
     <p>Engine: {result.engine?.version}; phase: {run.phaseConfiguration}. Source snapshot {run.sourceSnapshotHash}; property temperature {run.propertyTemperatureC} °C. {run.stale && <strong className="text-amber-800">Historical input: current Stage 1 has changed.</strong>}</p>
    <div className="overflow-x-auto"><table className="w-full text-left"><caption className="text-left font-semibold">All evaluated diameters (no union of different geometries into an operating window)</caption>
      <thead><tr>{["D (m)", "Feasible trials", "Best fixed-geometry span (rpm)", "Rejection reasons"].map(title => <th className="p-1" key={title}>{title}</th>)}</tr></thead>
      <tbody>{diameters.map(d => {
        const groups = grid.filter(item => item.geometry.columnDiameterM === d);
        const trials = groups.flatMap(item => item.trials);
        const reasons = [...new Set(trials.flatMap(item => item.reasons ?? []))];
        return <tr key={d} className="border-t"><td className="p-1">{number(d)}</td><td>{trials.filter(item => item.status === "FEASIBLE").length}</td><td>{number(Math.max(0, ...groups.map(item => item.operatingWindow?.widthRpm ?? 0)))}</td><td>{reasons.join("; ") || "None"}</td></tr>;
      })}</tbody></table></div>
    <label className="block">Inspect raw diameter evidence (not a selection) <select className="ml-2 border p-1" value={currentDiameter ?? ""} onChange={e => { setDiameter(e.target.value); setGeometryIndex(0); setRpm(""); }}>{diameters.map(d => <option key={d} value={d}>{d} m</option>)}</select></label>
    <div className="max-h-72 overflow-auto"><table className="w-full text-left"><thead><tr>{["Geometry", "hc / rotor (m)", "hc/D / rotor/D", "Free area", "Feasible discrete RPM", "Window"].map(title => <th className="p-1" key={title}>{title}</th>)}</tr></thead>
      <tbody>{geometries.map((item, index) => <tr className="border-t" key={index}>
        <td><button className="underline" onClick={() => { setGeometryIndex(index); setRpm(""); }}>Inspect {index + 1}{item === geometry ? " ✓" : ""}</button></td>
        <td>{number(item.geometry.compartmentHeightM)} / {number(item.geometry.rotorDiameterM)}</td>
        <td>{number(item.geometry.hcToColumn)} / {number(item.geometry.rotorToColumn)}</td><td>{number(item.geometry.freeArea)}</td>
        <td>{item.trials.filter((t: any) => t.status === "FEASIBLE").map((t: any) => t.rpm).join(", ") || "None"}</td>
        <td>{item.operatingWindow ? `${item.operatingWindow.rpmMin}–${item.operatingWindow.rpmMax}` : "None"}</td>
      </tr>)}</tbody></table></div>
    <label className="block">Trial RPM <select className="ml-2 border p-1" value={trial?.rpm ?? ""} onChange={e => setRpm(e.target.value)}>{geometry?.trials?.map((t: any) => <option key={t.rpm} value={t.rpm}>{t.rpm} — {t.status}</option>)}</select></label>
    {trial && <><p>{trial.status}: {(trial.reasons ?? []).join("; ") || "Hydraulic constraints pass"}. Rotor Re {number(trial.rotorReynolds)}; tip {number(trial.tipSpeedMS)} m/s; P/V {number(trial.powerVolumeWM3)} W/m³.</p>
      <div className="overflow-x-auto"><table className="w-full text-left"><caption className="text-left font-semibold">Six sensitivity scenarios — operating holdup is not modeled flood holdup</caption><thead><tr>{["Interface", "C32", "d32 m", "φ operating", "φ flood", "Capacity m/s", "Loading", "Area m²/m³", "Re terminal", "Re characteristic", "We", "Eo", "Oh c", "Oh d"].map(title => <th className="p-1" key={title}>{title}</th>)}</tr></thead>
        <tbody>{trial.hydraulicMethod?.scenarios?.map((s: any, index: number) => <tr className="border-t" key={index}>{[s.interfaceScenario, s.coefficient, s.d32M, s.operatingHoldup, s.floodHoldup, s.capacityMS, s.loading, s.interfacialAreaM2M3, s.terminalRe, s.characteristicRe, s.diagnostics?.weberTerminal, s.diagnostics?.eotvos, s.diagnostics?.ohnesorgeContinuous, s.diagnostics?.ohnesorgeDispersed].map((v, i) => <td className="p-1" key={i}>{typeof v === "string" ? v : number(v)}</td>)}</tr>)}</tbody></table></div>
       {!trial.hydraulicMethod && <p>Six-scenario P1 diagnostics are not available for this trial. See the complete engine-specific diagnostics below.</p>}
      <details><summary>Complete trial diagnostics, continuation, residuals and qualification</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap">{JSON.stringify(trial, null, 2)}</pre></details>
    </>}
    <details><summary>Saved input properties and candidate provenance</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap">{JSON.stringify({ basis: run.basis, originalPhase: run.originalPhaseConfiguration, candidatePhase: run.phaseConfiguration, engine: result.engine, controls: result.controls }, null, 2)}</pre></details>
    <Button size="sm" variant="outline" onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `stage3-p1-candidate-${run.id}.json`; link.click(); URL.revokeObjectURL(url);
    }}>Export complete candidate JSON</Button>
    </>}
    </details>
  </div>;
}

export function P1CandidatePanel({ designId, refreshToken }: { designId: number | null; refreshToken: number }) {
  return <CandidatePanel key={designId ?? "none"} designId={designId} refreshToken={refreshToken} />;
}

function CandidatePanel({ designId, refreshToken }: { designId: number | null; refreshToken: number }) {
  const [basis, setBasis] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [archiveId, setArchiveId] = useState("");
  const [currentRun, setCurrentRun] = useState<any>(null);
  const [archiveRun, setArchiveRun] = useState<any>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [basisError, setBasisError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
   const base = `/api/ecr-pre-pilot/designs/${designId}/stage3-candidates`;
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    if (!designId) return;
    const load = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      setLoading(true);
      // Independent resources: slow or corrupt history must not hide saved basis.
      // Never supersede an in-flight poll or erase valid data to show refreshing.
      await Promise.all([
        request(`${base}/basis`).then(nextBasis => {
          if (!nextBasis?.basis || !nextBasis.sourceSnapshotHash) throw new Error("Saved Stage 1 basis response is incomplete.");
          if (!cancelled) { setBasis(nextBasis); setBasisError(""); }
        }).catch(e => { if (!cancelled) setBasisError(`Saved Stage 1: ${e.message}`); }),
        request(base).then(rows => {
          if (!Array.isArray(rows)) throw new Error("Candidate history response is invalid.");
          if (!cancelled) { setHistory(rows); setHistoryLoaded(true); setHistoryError(""); }
        }).catch(e => { if (!cancelled) setHistoryError(`Candidate history: ${e.message}`); }),
      ]);
      inFlight = false;
      if (!cancelled) setLoading(false);
    };
    void load();
     const timer = setInterval(() => { void load(); }, 5000);
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("ecr-stage1-saved", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true; clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("ecr-stage1-saved", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [base, designId, refreshToken, reload]);
  const newestFirst = [...history].sort((a, b) =>
    Date.parse(b.requestedAt ?? b.createdAt ?? "") - Date.parse(a.requestedAt ?? a.createdAt ?? ""));
  const running = newestFirst.find(item => item.status === "running");
  const blockedReason = !designId ? "Save Stage 1 and select a design before running Stage 3."
    : basisError || historyError || (!basis ? "Loading saved Stage 1 basis…"
    : !["rrbo-continuous-nmp-dispersed", "nmp-continuous-rrbo-dispersed"].includes(basis.basis.phaseConfiguration) ? "Stage 3 requires an explicit, valid saved phase."
    : basis.basis.phaseConfiguration === "rrbo-continuous-nmp-dispersed" && basis.basis.operatingTemperatureC !== 40 ? "P1 requires saved 40 °C properties."
    : !historyLoaded ? "Loading candidate history…"
    : running ? running.sourceSnapshotHash === basis.sourceSnapshotHash
      ? "A Stage 3 candidate for the latest saved Stage 1 is already running."
      : "A Stage 3 calculation for an older saved Stage 1 basis is still running. Wait for it to finish before running the latest basis."
    : "");
  const current = basis ? newestFirst.find(item =>
    item.sourceSnapshotHash === basis.sourceSnapshotHash
    && item.phaseConfiguration === basis.basis.phaseConfiguration
    && item.version === basis.methodVersion) : undefined;
  const archive = newestFirst.filter(item => item.id !== current?.id);
  const archived = archive.find(item => item.id === archiveId) ?? archive[0];
  useEffect(() => {
    let cancelled = false;
    setCurrentRun(null);
    setDetailError("");
    if (current?.status === "completed") void request(`${base}/${current.id}/summary`).then(value => {
      if (value.id !== current.id || value.stale || value.sourceSnapshotHash !== basis?.sourceSnapshotHash
        || value.phaseConfiguration !== basis?.basis.phaseConfiguration || value.version !== basis?.methodVersion) throw new Error("Saved Stage 1 changed or candidate detail is stale. Retry loading.");
      if (!cancelled) setCurrentRun(value);
    }).catch(e => { if (!cancelled) setDetailError(e.message); });
    return () => { cancelled = true; };
  }, [base, current?.id, current?.status, current?.ledgerId, basis?.sourceSnapshotHash, basis?.basis.phaseConfiguration, basis?.methodVersion, reload]);
  useEffect(() => {
    let cancelled = false;
    setArchiveRun(null);
    setArchiveError("");
    if (archiveOpen && archived?.status === "completed") void request(`${base}/${archived.id}`).then(value => { if (!cancelled) setArchiveRun(value); }).catch(e => { if (!cancelled) setArchiveError(e.message); });
    return () => { cancelled = true; };
  }, [base, archiveOpen, archived?.id, archived?.status, archived?.ledgerId, reload]);
  return <section className="mb-4 rounded border border-amber-300 bg-amber-50 p-3">
     <h4 className="font-semibold">Stage 3 — automatic preliminary hydraulic selection</h4>
     <p className="mt-1 text-xs">Method selected automatically from saved Stage 1: {basis ? `${basis.methodVersion} — ${basis.basis.phaseConfiguration === "rrbo-continuous-nmp-dispersed" ? "corrected P1 RRBO-continuous method" : "existing NMP-continuous method"}` : "waiting for an explicit, valid saved phase"}. No manual method selection.</p>
     {basis?.basis.phaseConfiguration === "rrbo-continuous-nmp-dispersed" && <p className="mt-1 text-xs">Conditional pre-pilot method: Np=1.2; C32=0.36 / 0.42 / 0.43; Barry–Parlange mobile and Schiller–Naumann immobile interfaces; corrected Garthe superficial swarm/slip and lower-branch operating holdup. Maximum modeled-capacity loading 0.70 in every scenario.</p>}
    <p className="mt-1 text-xs">Interface mobility, inversion, entrainment, disengagement, turbulence, Schiller–Naumann range and spherical-drop qualification remain UNKNOWN. Lower-branch continuation is quasi-steady admissibility, not dynamic stability. The separate automatic P1 selection supplies preliminary Stage 4 HETS geometry without changing saved Stage 1 or frozen historical authority. No manual approval is required.</p>
    <p className="mt-2 text-xs">Saved property temperature: {basis ? `${basis.basis.operatingTemperatureC} °C` : "not loaded"}; saved phase: {basis?.basis.phaseConfiguration ?? "not loaded"}. P1 requires saved 40 °C properties.</p>
    <p className="my-2 text-xs">Phase and properties come only from Saved Stage 1{basis?.sourceSavedAt ? ` (${basis.sourceSavedAt})` : ""}. No candidate phase override.</p>
     <Button size="sm" disabled={!!blockedReason || busy} onClick={async () => {
      setBusy(true); setError("");
      try {
        await request(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceSnapshotHash: basis.sourceSnapshotHash }) });
        setReload(value => value + 1);
       } catch (e) { setBasis(null); setError((e as Error).message); } finally { setBusy(false); }
     }}>{busy ? "Submitting…" : "Run Stage 3"}</Button>
    {loading && <p role="status" className="mt-2 text-xs">Loading saved Stage 1 and candidate history… Existing loaded data stays visible.</p>}
    {blockedReason && <p className="mt-2 text-xs">{blockedReason}</p>}
    {(basisError || historyError) && <p role="alert" className="mt-2 text-xs text-red-800">{[basisError, historyError].filter(Boolean).join(" ")}</p>}
    {(basisError || historyError || error || detailError || archiveError) && <Button size="sm" variant="outline" onClick={() => setReload(value => value + 1)}>Retry loading</Button>}
    {error && <p role="alert" className="mt-2 text-xs text-red-800">{error}</p>}
    {detailError && <p role="alert" className="mt-2 text-xs text-red-800">Current candidate: {detailError}</p>}
    {current?.status === "completed" && !currentRun && !detailError && <p role="status" className="mt-2 text-xs">Verifying saved candidate and loading automatic selection…</p>}
     {current
       ? <div className="mt-3 text-xs">
         <p><strong>Latest calculation for current saved Stage 1:</strong> {current.status}{current.error ? `: ${current.error}` : ""}</p>
         {current.status === "running" && <p>Calculating in background; safe to leave and reload. No authority will be replaced. A lost server process is reported interrupted after 16 minutes.</p>}
       </div>
        : historyLoaded && basis && !historyError && !basisError && <p className="mt-3 text-xs"><strong>No Stage 3 calculation for latest saved Stage 1. Run Stage 3.</strong></p>}
      <P1CandidateResults key={`${currentRun?.id ?? "none"}:${currentRun?.ledgerId ?? ""}`} fullUrl={currentRun ? `${base}/${currentRun.id}` : undefined} run={!basisError && !historyError && currentRun?.id === current?.id && current?.status === "completed" && currentRun?.sourceSnapshotHash === basis?.sourceSnapshotHash ? currentRun : null} />
      {!!archive.length && <details onToggle={e => setArchiveOpen(e.currentTarget.open)} className="mt-4 border-t border-amber-300 pt-3">
       <summary className="cursor-pointer text-xs font-semibold">Previous calculations (read-only)</summary>
       <div className="mt-2 text-xs">
         <label>Historical snapshot <select aria-label="Historical snapshot" className="ml-2 max-w-full border bg-white p-1" value={archived?.id ?? ""} onChange={e => setArchiveId(e.target.value)}>{archive.map(item => <option value={item.id} key={item.id}>{item.requestedAt} — {item.status} — source {item.sourceSnapshotHash}</option>)}</select></label>
         {archived && <>
           <p className="mt-2"><strong>Read-only historical calculation.</strong> Source snapshot {archived.sourceSnapshotHash}; phase {archived.phaseConfiguration}; method {archived.version}; requested {archived.requestedAt}. This does not change the current result or Run Stage 3 input.</p>
           <p className="mt-2">{archived.status === "running" ? "This historical basis is still calculating in the background." : archived.status}{archived.error ? `: ${archived.error}` : ""}</p>
           {archived.originalPhaseConfiguration && archived.originalPhaseConfiguration !== archived.phaseConfiguration && <p className="mt-2">Historical candidate used an explicit phase override: saved {archived.originalPhaseConfiguration} → candidate {archived.phaseConfiguration}. Original evidence is preserved; this is not the current saved Stage 1 phase.</p>}
         </>}
          {archiveError && <p role="alert">{archiveError}</p>}
          {archiveOpen && archived?.status === "completed" && !archiveRun && !archiveError && <p role="status">Loading historical scientific evidence…</p>}
         <P1CandidateResults key={archiveRun?.id ?? "archive-none"} run={archiveRun ? { ...archiveRun, automaticSelection: null } : null} />
       </div>
     </details>}
       {historyLoaded && !historyError && !history.length && <p className="mt-2 text-xs">No saved Stage 3 candidates. Existing authority remains unchanged.</p>}
  </section>;
}