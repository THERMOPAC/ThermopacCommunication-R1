import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const number = (value: unknown) => typeof value === "number" ? Number(value.toPrecision(6)).toString() : "—";
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "include", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "P1 request failed");
  return body;
}

export function P1CandidateResults({ run }: { run: any }) {
  const [diameter, setDiameter] = useState("");
  const [geometryIndex, setGeometryIndex] = useState(0);
  const [rpm, setRpm] = useState("");
  const result = run?.result;
  const orientation = result?.orientationComparison?.find((item: any) => item.orientation === "rrbo-continuous-nmp-dispersed");
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
    <p>Source snapshot {run.sourceSnapshotHash}; property temperature {run.propertyTemperatureC} °C. {run.stale && <strong className="text-amber-800">Historical input: current Stage 1 has changed.</strong>}</p>
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
      {!trial.hydraulicMethod && <p>No scenario result: this trial was rejected before the P1 scenario calculation.</p>}
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
  const [basis, setBasis] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [run, setRun] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const base = `/api/ecr-pre-pilot/designs/${designId}/stage3-p1-candidates`;
  useEffect(() => {
    let cancelled = false;
    let polling = true;
    setBasis(null); setHistory([]); setSelectedId(""); setRun(null); setError("");
    if (!designId) return;
    const load = async () => {
      try {
        const [nextBasis, rows] = await Promise.all([request(`${base}/basis`), request(base)]);
        if (!cancelled) { setBasis(nextBasis); setHistory(rows); setError(""); polling = rows.some((item: any) => item.status === "running"); }
      } catch (e) { if (!cancelled) { setBasis(null); setError((e as Error).message); } }
    };
    void load();
    const timer = setInterval(() => { if (polling) void load(); }, 5000);
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
  const selected = history.find(item => item.id === selectedId) ?? history[0];
  useEffect(() => {
    let cancelled = false;
    setRun(null);
    if (selected?.status === "completed") void request(`${base}/${selected.id}`).then(value => { if (!cancelled) setRun(value); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [base, selected?.id, selected?.status, selected?.stale]);
  return <section className="mb-4 rounded border border-amber-300 bg-amber-50 p-3">
    <h4 className="font-semibold">Corrected P1 — independent Stage 3 candidate</h4>
    <p className="mt-1 text-xs">Conditional pre-pilot method: Np=1.2; C32=0.36 / 0.42 / 0.43; Barry–Parlange mobile and Schiller–Naumann immobile interfaces; corrected Garthe superficial swarm/slip and lower-branch operating holdup. Maximum modeled-capacity loading 0.70 in every scenario.</p>
    <p className="mt-1 text-xs">Interface mobility, inversion, entrainment, disengagement, turbulence, Schiller–Naumann range and spherical-drop qualification remain UNKNOWN. Lower-branch continuation is quasi-steady admissibility, not dynamic stability. Extrapolated screening only, not observed flooding or commercial qualification. Running this candidate never adopts geometry, changes saved Stage 1, or replaces Stage 3/4 authority.</p>
    <p className="mt-2 text-xs">Saved property temperature: {basis ? `${basis.basis.operatingTemperatureC} °C` : "not loaded"}; saved phase: {basis?.basis.phaseConfiguration ?? "not loaded"}. P1 requires saved 40 °C properties.</p>
    <p className="my-2 text-xs">Phase and properties come only from Saved Stage 1{basis?.sourceSavedAt ? ` (${basis.sourceSavedAt})` : ""}. No candidate phase override.</p>
    {basis && basis.basis.phaseConfiguration !== "rrbo-continuous-nmp-dispersed" && <p role="alert" className="my-2 text-xs">Change phase to RRBO continuous / NMP dispersed in Stage 1 and save Stage 1 before calculating P1.</p>}
    <Button size="sm" disabled={!designId || !basis || basis.basis.phaseConfiguration !== "rrbo-continuous-nmp-dispersed" || busy || basis.basis.operatingTemperatureC !== 40 || history.some(item => item.status === "running")} onClick={async () => {
      setBusy(true); setError("");
      try {
        await request(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceSnapshotHash: basis.sourceSnapshotHash }) });
        setReload(value => value + 1);
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>{busy ? "Submitting…" : "Calculate P1 candidate (no adoption)"}</Button>
    {error && <p role="alert" className="mt-2 text-xs text-red-800">{error}</p>}
    {!!history.length && <label className="mt-3 block text-xs">Candidate history <select className="ml-2 max-w-full border bg-white p-1" value={selected?.id ?? ""} onChange={e => setSelectedId(e.target.value)}>{history.map(item => <option value={item.id} key={item.id}>{item.requestedAt} — {item.status}{item.stale ? " — historical Stage 1" : ""}</option>)}</select></label>}
    {selected && <p className="mt-2 text-xs">{selected.status === "running" ? "Calculating in background; safe to leave and reload. No authority will be replaced. A lost server process is reported interrupted after 16 minutes." : selected.status}{selected.error ? `: ${selected.error}` : ""}</p>}
    {selected?.originalPhaseConfiguration && selected.originalPhaseConfiguration !== selected.phaseConfiguration && <p className="mt-2 text-xs">Historical candidate used an explicit phase override: saved {selected.originalPhaseConfiguration} → candidate {selected.phaseConfiguration}. Original evidence is preserved; this is not the current saved Stage 1 phase.</p>}
    {!history.length && <p className="mt-2 text-xs">No saved P1 candidates. The earlier isolated report is not an adopted app result.</p>}
    <P1CandidateResults key={run?.id ?? "none"} run={run} />
  </section>;
}