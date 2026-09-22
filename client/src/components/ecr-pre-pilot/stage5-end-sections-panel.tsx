import { useEffect, useState } from "react";
import { END_DIAMETERS_M, type EndSectionResult, type EndSelections } from "@shared/ecr-stage5-end-sections";
import { Button } from "@/components/ui/button";
import { renderEndSchematic } from "@shared/ecr-stage5-end-schematic";

type Payload = EndSectionResult & { sourceHash: string; stage1Hash: string; active: {
  revisionId: string; diameterM: number; compartmentCount: number; installedActiveHeightM: number;
} };
const f = (n: number) => n.toFixed(3);
const pending = "Pending qualified product balance";

export function Stage5EndSectionsPanel({ designId, revisionId, sourceHash }: {
  designId: string | number; revisionId?: string | number; sourceHash?: string;
}) {
  const [selection, setSelection] = useState<EndSelections>({ topDiameterM: .9, bottomDiameterM: .9 });
  const [result, setResult] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ sourceHash: string; selection: EndSelections } | null>(null);
  const [action, setAction] = useState<"save" | "export" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    void (async () => {
      try {
        const response = await fetch(`/api/ecr-pre-pilot/designs/${designId}/stage5/end-sections/selections`, { credentials: "include", signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Saved selections unavailable (HTTP ${response.status}). Displayed defaults are unsaved comparisons.`);
        const body = await response.json();
        if (controller.signal.aborted) return;
        const valid = (n: number) => END_DIAMETERS_M.some(d => d === n);
        if (body && (!valid(body.selection?.topDiameterM) || !valid(body.selection?.bottomDiameterM) || typeof body.sourceHash !== "string"))
          throw new Error("Saved selection contract is invalid; no saved result admitted.");
        setSaved(body);
        if (body) setSelection({ topDiameterM: body.selection.topDiameterM, bottomDiameterM: body.selection.bottomDiameterM });
        setStorageError(null);
      } catch (e) {
        if (!controller.signal.aborted) setStorageError(e instanceof Error ? e.message : "Saved selections unavailable.");
      } finally { if (!controller.signal.aborted) setReady(true); }
    })();
    return () => controller.abort();
  }, [designId]);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    if (!ready || !revisionId) return () => controller.abort();
    const load = async () => {
      try {
        const response = await fetch(`/api/ecr-pre-pilot/designs/${designId}/stage5/revisions/${revisionId}/end-sections?topDiameterM=${selection.topDiameterM}&bottomDiameterM=${selection.bottomDiameterM}`,
          { credentials: "include", signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.error === "string" && /^[A-Z0-9_]+$/.test(body.error)
          ? body.error : `END_SECTION_REQUEST_FAILED_HTTP_${response.status}`);
        if (!controller.signal.aborted) setResult(body);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "END_SECTION_REQUEST_FAILED");
      }
    };
    void load();
    return () => controller.abort();
  }, [designId, revisionId, sourceHash, selection, refresh, ready]);
  // Revalidate authority on focus and periodically. Never retain a last-good result
  // when a new source request fails; selections are preferences, not qualification.
  useEffect(() => {
    const update = () => { setResult(null); setRefresh(n => n + 1); };
    window.addEventListener("focus", update);
    const timer = window.setInterval(update, 60000);
    return () => { window.removeEventListener("focus", update); window.clearInterval(timer); };
  }, []);
  const choose = (end: "top" | "bottom", value: number) => {
    const next = { ...selection, [`${end}DiameterM`]: value };
    setResult(null);
    setSelection(next);
    setNotice(null);
  };
  const perform = async (kind: "save" | "export") => {
    if (!result || !revisionId) return;
    setAction(kind); setNotice(null);
    const url = `/api/ecr-pre-pilot/designs/${designId}/stage5/revisions/${revisionId}/end-sections`;
    try {
      const response = kind === "save"
        ? await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...selection, expectedSourceHash: result.sourceHash }) })
        : await fetch(`${url}/export.svg?topDiameterM=${selection.topDiameterM}&bottomDiameterM=${selection.bottomDiameterM}&expectedSourceHash=${result.sourceHash}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" && /^[A-Z0-9_]+$/.test(body.error) ? body.error : `END_SECTION_ACTION_FAILED_HTTP_${response.status}`);
      }
      if (kind === "save") {
        setSaved(await response.json()); setStorageError(null); setNotice("Saved provisional diameter selections. No product balance or final dimensions qualified.");
      } else {
        const href = URL.createObjectURL(await response.blob());
        const a = document.createElement("a"); a.href = href; a.download = "stage5-conditional-end-assemblies.svg"; a.click();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
        setNotice("Exported conditional, unscaled schematic; historical drawings unchanged.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "End-section action failed."); setResult(null);
    } finally { setAction(null); }
  };
  return <section data-testid="stage5-end-sections" className="mt-4 rounded border border-cyan-300 bg-white">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-cyan-50 p-3">
      <div><p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-800">Independent end-section design · S/O 1.5 mass</p>
        <h2 className="text-sm font-semibold">Top and bottom disengagement assemblies</h2></div>
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={action !== null} onClick={() => { setResult(null); setRefresh(n => n + 1); }}>Refresh authority</Button>
        <Button size="sm" disabled={!result || action !== null} onClick={() => void perform("save")}>{action === "save" ? "Saving…" : "Save end selections"}</Button>
        <Button variant="outline" size="sm" disabled={!result || action !== null} onClick={() => void perform("export")}>{action === "export" ? "Exporting…" : "Export conditional SVG"}</Button></div>
    </header>
    <div className="space-y-4 p-3 text-xs leading-5">
      <p className="rounded border border-amber-300 bg-amber-50 p-2"><strong>Provisional framework — not fabrication release.</strong> Frozen Stage 5 active section is inherited unchanged. This independent design does not alter Stage 1/2, historical drawings, or saved active snapshots. Product flows, residence heights, outlet elevations and overall dimensions remain conditional.</p>
      {!revisionId && <p role="status">Select a saved current Stage 5 revision to attach the separate end assemblies. An unsaved preview is not frozen authority.</p>}
      {storageError && <p role="alert">{storageError}</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="rounded bg-red-50 p-2 text-red-800">{error}. No previous result is being reused.</p>}
      {revisionId && !result && !error && <p role="status">Checking current feed and frozen active-section authority…</p>}
      <div className="flex flex-wrap gap-6">{(["top", "bottom"] as const).map(end => <label key={end} className="flex items-center gap-2 capitalize">
        {end} comparison ID
        <select disabled={!ready || action !== null} aria-label={`${end} comparison diameter`} value={selection[`${end}DiameterM`]} onChange={e => choose(end, Number(e.target.value))} className="rounded border bg-white p-1">
          {END_DIAMETERS_M.map(d => <option key={d} value={d}>{d * 1000} mm{d === .7 ? " — reference / exception" : ""}</option>)}
        </select>
      </label>)}</div>
      <p className="text-slate-600">Diameter choices are provisional comparisons only, not final engineering selections. Save persists them separately from Stage 1/2 and frozen Stage 5. No balance qualification control is available.</p>
      {result && <>
        <p data-testid="end-selection-currentness">{!saved ? "UNSAVED COMPARISONS" : saved.sourceHash !== result.sourceHash
          ? "SAVED SOURCE OUTDATED — recalculated comparison only; review and save against current authority."
          : saved.selection.topDiameterM !== selection.topDiameterM || saved.selection.bottomDiameterM !== selection.bottomDiameterM
            ? "UNSAVED DIAMETER CHANGES" : "SAVED COMPARISONS · CURRENT SOURCE · PRODUCT BALANCE STILL PENDING"}</p>
        <div data-testid="end-assembly-schematic" className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderEndSchematic(result) }} />
        <p className="break-all font-mono text-[10px]">CURRENT READ · {result.sourceHash}<br />Stage 1 · {result.stage1Hash}<br />
          Frozen active revision {result.active.revisionId}: Ø{result.active.diameterM * 1000} mm × {result.active.compartmentCount} compartments; installed active height {f(result.active.installedActiveHeightM)} m.</p>
        <section><h3 className="font-semibold">Stage 1 feed authority → independent end-design feeds</h3>
          <p>Oil: {f(result.feed.designFeedRateLph)} L/h ÷ 1000 = {f(result.feed.oilM3H)} m³/h; density {f(result.feed.rrboDensityKgM3)} kg/m³ → {f(result.feed.oilKgH)} kg/h.</p>
          <p>Wet solvent: 1.5 × oil mass = {f(result.feed.wetSolventKgH)} kg/h ÷ {f(result.feed.nmpDensityKgM3)} kg/m³ = {f(result.feed.wetSolventM3H)} m³/h. NMP/water = {result.feed.nmpPurityWt}/{result.feed.nmpWaterWt} wt%.</p>
          <p>Combined feed: {f(result.materialContract.totalFeedKgH)} kg/h. No Stage 2 product stream is reused.</p>
          <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Component</th><th>Combined feed kg/h</th><th>Raffinate / extract / closure</th></tr></thead>
            <tbody>{result.materialContract.componentNames.map((name, i) => <tr className="border-t" key={name}><td>{name}</td><td>{f(result.materialContract.componentFeedKgH[i])}</td><td>Pending / pending / not established</td></tr>)}</tbody></table></div>
          <p className="mt-2 text-amber-900">{result.materialContract.requiredEvidence} Product phase densities and both simultaneous normal flows remain null.</p>
        </section>
        <div className="grid gap-3 lg:grid-cols-2">{(["top", "bottom"] as const).map(end => {
          const g = result.assemblies[end];
          return <section key={end} className="rounded border p-3"><h3 className="font-semibold capitalize">{end} assembly · Ø{g.diameterM * 1000} mm · {end === "top" ? "upwards to raffinate" : "downwards to extract"}</h3>
            <ol className="list-decimal pl-5">
              <li>Frozen active boundary → additional Ø700 feed/distribution neck. Length TBD; outside active height.</li>
              <li>Transition minimum {f(g.transitionMinimumM)} m; 30° half-angle conical portion. Sharp-cone reference {f(g.sharpConeReferenceM)} m is NOT the physical transition length. {g.transitionStatus.replaceAll("_", " ")}.</li>
              <li>Interface {end === "top" ? "above" : "below"} transition by 0.150 m.</li>
              <li>Interface → product opening <strong>near edge</strong>: H₁₀ = Qnormal × {f(g.residenceCoefficientMPerM3H)} m/(m³/h). {pending}.</li>
              <li>Opening envelope and nozzle centre: TBD. Centre offset = H₁₀ + near-edge allowance; OD/2 only a provisional simple radial-pipe envelope, not bore/2.</li>
              <li>Beyond product opening <strong>far outer edge</strong>: ≥{f(g.postOpeningExtensionM)} m straight shell.</li>
              <li>Torispherical head; depth/radii/thickness TBD. Zero head residence credit.</li>
            </ol>
            <p className="mt-2">Straight shell = 0.150 + H₁₀ + opening near/far envelope + post-extension. Total assembly also needs neck, physical transition and head depths. Both totals remain null.</p>
          </section>;
        })}</div>
        <section><h3 className="font-semibold">Diameter comparison — normal-flow residence coefficient only</h3>
          <p>H₁₀ = Qnormal / [6 × 0.90 × πD²/4]. Only straight liquid volume between interface and product opening near edge earns credit. Transition, interface allowance, nozzle band, post-extension and head earn none. 120% is never the residence basis.</p>
          <table className="w-full text-left"><thead><tr><th>ID mm</th><th>H₁₀ per m³/h (m)</th><th>Transition / post min (m)</th><th>Actual top / bottom H₁₀</th></tr></thead><tbody>{result.comparisons.map(g => <tr key={g.diameterM} className="border-t"><td>{g.diameterM * 1000}</td><td>{f(g.residenceCoefficientMPerM3H)}</td><td>{f(g.transitionMinimumM)} / {f(g.postOpeningExtensionM)}</td><td>Pending / pending</td></tr>)}</tbody></table>
        </section>
        <section><h3 className="font-semibold">Feed nozzle screening — actual bores at 120% normal flow</h3>
          <p>Provisional nominal Schedule 40 OD/wall assumptions; ID = OD − 2wall. Velocity ≤0.5 m/s is a preliminary screen, not an ASME criterion. Final schedule, corrosion/lining deductions and reinforcement TBD.</p>
          {([["Oil feed P01", result.nozzles.oilFeed], ["Wet solvent feed P03", result.nozzles.wetSolventFeed]] as const).map(([name, n]) => <div className="mt-2 overflow-x-auto" key={name}><h4 className="font-semibold">{name}: Q120 = {f(n.hydraulic120M3H)} m³/h; required bore {f(n.requiredBoreMm)} mm; minimum screened DN {n.provisionalDn ?? "none in listed candidates"}</h4>
            <table className="w-full text-left"><thead><tr><th>DN</th><th>OD / wall mm</th><th>Bore mm</th><th>v120 m/s</th><th>Screen</th></tr></thead><tbody>{n.candidates.map(c => <tr key={c.dn} className="border-t"><td>{c.dn}</td><td>{c.odMm} / {c.wallMm}</td><td>{f(c.boreMm)}</td><td>{f(c.velocity120MS)}</td><td>{c.passes ? "Pass (provisional)" : "Fail"}</td></tr>)}</tbody></table>
          </div>)}
          <p>Raffinate P04 and extract P02 nozzle flows, bores and selections: {pending.toLowerCase()}.</p>
        </section>
        <p className="rounded bg-slate-100 p-2">Mechanical holds: knuckles/formed junctions, ASME design, pressure, material, thickness, reinforcement, neck distribution details and head geometry. Process holds: qualified independent balance, droplet loading/DSDs, anti-swirl, coalescence, settling and return through the Ø700 throat. Ten-minute residence does not prove &lt;5 wt% physical NMP, dissolved-solvent removal, or hydraulic acceptance of S/O 1.5 by the unchanged active section.</p>
      </>}
    </div>
  </section>;
}