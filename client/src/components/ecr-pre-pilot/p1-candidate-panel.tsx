import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

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
    if (controller.signal.aborted) throw new Error("Stage 3 request timed out. Retry loading saved Stage 1.");
    throw error;
  } finally { clearTimeout(timer); }
}

export function P1CandidateResults({ run }: { run: any }) {
  const [diameter, setDiameter] = useState("");
  const [geometryIndex, setGeometryIndex] = useState(0);
  const [rpm, setRpm] = useState("");
  const result = run?.result;
   const orientation = result?.orientationComparison?.find((item: any) => item.orientation === run.phaseConfiguration);
  const grid: any[] = orientation?.geometryGrid ?? [];
  const diameters = [...new Set(grid.map(item => item.geometry.columnDiameterM))].sort((a, b) => a - b);
  const currentDiameter = diameters.includes(Number(diameter)) ? Number(diameter) : diameters[0];
  const geometries = grid.filter(item => item.geometry.columnDiameterM === currentDiameter);
  const geometry = geometries[geometryIndex] ?? geometries[0];
  const trial = geometry?.trials?.find((item: any) => String(item.rpm) === rpm) ?? geometry?.trials?.find((item: any) => item.status === "FEASIBLE") ?? geometry?.trials?.[0];
  if (!result) return null;
  return <div className="mt-3 min-w-0 space-y-3 break-words text-xs">
    <p><strong>Candidate calculation: {result.status}</strong> — {result.selectedGeometry ? "Selected within candidate only" : "No geometry selected; feasible trials below remain visible."}</p>
    <p>Unchanged selection preference: 20 rpm contiguous fixed-geometry window and second-smallest adequate diameter. Hydraulic feasibility is not selection. {(result.blockers ?? []).join("; ")}</p>
     <p>Engine: {result.engine?.version}; phase: {run.phaseConfiguration}. Source snapshot {run.sourceSnapshotHash}; property temperature {run.propertyTemperatureC} °C. {run.stale && <strong className="text-amber-800">Historical input: current Stage 1 has changed.</strong>}</p>
    <div className="overflow-x-auto"><table className="w-full text-left"><caption className="text-left font-semibold">All evaluated diameters (no union of different geometries into an operating window)</caption>
      <thead><tr>{["D (m)", "Feasible trials", "Best fixed-geometry span (rpm)", "Rejection reasons"].map(title => <th className="p-1" key={title}>{title}</th>)}</tr></thead>
      <tbody>{diameters.map(d => {
        const groups = grid.filter(item => item.geometry.columnDiameterM === d);
        const trials = groups.flatMap(item => item.trials);
        const reasons = [...new Set(trials.flatMap(item => item.reasons ?? []))];
        return <tr key={d} className="border-t"><td className="p-1">{number(d)}</td><td>{trials.filter(item => item.status === "FEASIBLE").length}</td><td>{number(Math.max(0, ...groups.map(item => item.operatingWindow?.widthRpm ?? 0)))}</td><td>{reasons.join("; ") || "None"}</td></tr>;
      })}</tbody></table></div>
    <label className="block">Inspect diameter <select className="ml-2 border p-1" value={currentDiameter ?? ""} onChange={e => { setDiameter(e.target.value); setGeometryIndex(0); setRpm(""); }}>{diameters.map(d => <option key={d} value={d}>{d} m</option>)}</select></label>
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
      const url = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `stage3-p1-candidate-${run.id}.json`; link.click(); URL.revokeObjectURL(url);
    }}>Export complete candidate JSON</Button>
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
    if (current?.status === "completed") void request(`${base}/${current.id}`).then(value => { if (!cancelled) setCurrentRun(value); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [base, current?.id, current?.status]);
  useEffect(() => {
    let cancelled = false;
    setArchiveRun(null);
    if (archived?.status === "completed") void request(`${base}/${archived.id}`).then(value => { if (!cancelled) setArchiveRun(value); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [base, archived?.id, archived?.status]);
  return <section className="mb-4 rounded border border-amber-300 bg-amber-50 p-3">
     <h4 className="font-semibold">Stage 3 calculation — candidate / pending review</h4>
     <p className="mt-1 text-xs">Method selected automatically from saved Stage 1: {basis ? `${basis.methodVersion} — ${basis.basis.phaseConfiguration === "rrbo-continuous-nmp-dispersed" ? "corrected P1 RRBO-continuous method" : "existing NMP-continuous method"}` : "waiting for an explicit, valid saved phase"}. No manual method selection.</p>
     {basis?.basis.phaseConfiguration === "rrbo-continuous-nmp-dispersed" && <p className="mt-1 text-xs">Conditional pre-pilot method: Np=1.2; C32=0.36 / 0.42 / 0.43; Barry–Parlange mobile and Schiller–Naumann immobile interfaces; corrected Garthe superficial swarm/slip and lower-branch operating holdup. Maximum modeled-capacity loading 0.70 in every scenario.</p>}
    <p className="mt-1 text-xs">Interface mobility, inversion, entrainment, disengagement, turbulence, Schiller–Naumann range and spherical-drop qualification remain UNKNOWN. Lower-branch continuation is quasi-steady admissibility, not dynamic stability. Extrapolated screening only, not observed flooding or commercial qualification. Running this candidate never adopts geometry, changes saved Stage 1, or replaces Stage 3/4 authority.</p>
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
    {(basisError || historyError || error) && <Button size="sm" variant="outline" onClick={() => setReload(value => value + 1)}>Retry loading</Button>}
    {error && <p role="alert" className="mt-2 text-xs text-red-800">{error}</p>}
     {current
       ? <div className="mt-3 text-xs">
         <p><strong>Latest calculation for current saved Stage 1:</strong> {current.status}{current.error ? `: ${current.error}` : ""}</p>
         {current.status === "running" && <p>Calculating in background; safe to leave and reload. No authority will be replaced. A lost server process is reported interrupted after 16 minutes.</p>}
       </div>
       : historyLoaded && basis && <p className="mt-3 text-xs"><strong>No Stage 3 calculation for latest saved Stage 1. Run Stage 3.</strong></p>}
     <P1CandidateResults key={currentRun?.id ?? "none"} run={currentRun} />
     {!!archive.length && <details className="mt-4 border-t border-amber-300 pt-3">
       <summary className="cursor-pointer text-xs font-semibold">Previous calculations (read-only)</summary>
       <div className="mt-2 text-xs">
         <label>Historical snapshot <select className="ml-2 max-w-full border bg-white p-1" value={archived?.id ?? ""} onChange={e => setArchiveId(e.target.value)}>{archive.map(item => <option value={item.id} key={item.id}>{item.requestedAt} — {item.status} — source {item.sourceSnapshotHash}</option>)}</select></label>
         {archived && <>
           <p className="mt-2"><strong>Read-only historical calculation.</strong> Source snapshot {archived.sourceSnapshotHash}; phase {archived.phaseConfiguration}; method {archived.version}; requested {archived.requestedAt}. This does not change the current result or Run Stage 3 input.</p>
           <p className="mt-2">{archived.status === "running" ? "This historical basis is still calculating in the background." : archived.status}{archived.error ? `: ${archived.error}` : ""}</p>
           {archived.originalPhaseConfiguration && archived.originalPhaseConfiguration !== archived.phaseConfiguration && <p className="mt-2">Historical candidate used an explicit phase override: saved {archived.originalPhaseConfiguration} → candidate {archived.phaseConfiguration}. Original evidence is preserved; this is not the current saved Stage 1 phase.</p>}
         </>}
         <P1CandidateResults key={archiveRun?.id ?? "archive-none"} run={archiveRun} />
       </div>
     </details>}
      {historyLoaded && !history.length && <p className="mt-2 text-xs">No saved Stage 3 candidates. Existing authority remains unchanged.</p>}
  </section>;
}