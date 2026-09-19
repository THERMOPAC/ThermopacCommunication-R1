import { AlertTriangle, ArrowLeft, Download, FilePlus2, Loader2, RefreshCw, Save, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Stage5DrawingViewer, stage5ViewNames, type Stage5View } from "@/components/ecr-pre-pilot/stage5-drawing-viewer";
import { Stage5InputEditor } from "@/components/ecr-pre-pilot/stage5-input-editor";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Stage5Inputs } from "@shared/ecr-stage5-geometry";
import { emptyStage5Inputs } from "@shared/ecr-stage5-geometry";

type RecordValue = Record<string, unknown>;
type Revision = RecordValue & { id: string | number; revision: string | number; createdAt: string; inputs: RecordValue; geometry: unknown; drawings?: Partial<Record<Stage5View, string>>; sourceHash: string; status?: string; currentness?: string; notes?: string | null };
const base = (id: string | number) => `/api/ecr-pre-pilot/designs/${id}/stage5`;
const messageOf = (value: unknown) => value instanceof Error ? value.message : "The requested Stage 5 record could not be read.";
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};

function ValueGrid({ title, data }: { title: string; data: unknown }) {
  const rows = Object.entries(object(data));
  return <section className="rounded border border-slate-200 bg-white"><h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900">{title}</h3>{rows.length ? <dl className="grid gap-px bg-slate-200 sm:grid-cols-2">{rows.map(([key, value]) => <div key={key} className="bg-white px-3 py-2"><dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{key}</dt><dd className="mt-1 break-words font-mono text-[11px] text-slate-800">{value === undefined || value === null || value === "" ? "TBD" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl> : <p className="p-3 text-xs text-slate-500">No governed values were returned. Return to the upstream stage to complete this basis.</p>}</section>;
}

function GeometrySchedules({ geometry }: { geometry: unknown }) {
  const model = object(geometry);
  const rows = (value: unknown) => Array.isArray(value) ? value.map(object) : [];
  const checkRank = (status: unknown) => status === "fail" ? 0 : status === "tbd" ? 1 : status === "pass" ? 2 : 3;
  const checks = rows(model.checks).sort((a, b) => checkRank(a.status) - checkRank(b.status));
  const parameters = rows(model.parameters);
  const internals = rows(model.internals);
  const nozzles = rows(model.nozzles);
  const assumptions = Array.isArray(model.assumptions) ? model.assumptions : [];
  const tbd = Array.isArray(model.tbd) ? model.tbd : [];
  const display = (value: unknown) => value === null || value === undefined || value === "" ? "TBD" : String(value);
  return <div className="mt-3 space-y-3">
    <section className="rounded border border-slate-200"><h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900">Validation checks <span className="font-mono text-[10px] font-normal text-slate-500">{display(model.complete) === "true" ? "COMPLETE" : "INCOMPLETE / REVIEW REQUIRED"}</span></h3><div className="divide-y divide-slate-100">{checks.length ? checks.map((check, index) => <div key={`${String(check.id)}-${index}`} className="flex gap-2 px-3 py-2 text-[11px]"><span className={`h-fit rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${check.status === "pass" ? "bg-emerald-100 text-emerald-900" : check.status === "fail" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>{String(check.status ?? "tbd").toUpperCase()}</span><div><span className="font-mono text-[10px] text-slate-500">{String(check.id ?? "check")}</span><p className="text-slate-800">{display(check.message)}</p></div></div>) : <p className="p-3 text-xs text-slate-500">No validation results returned.</p>}</div></section>
    <section className="rounded border border-slate-200"><h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900">Dimension & provenance register</h3><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-[10px]"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="px-3 py-2">Parameter</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Classification</th><th className="px-3 py-2">Basis / note</th></tr></thead><tbody className="divide-y divide-slate-100">{parameters.map((parameter, index) => <tr key={`${String(parameter.key)}-${index}`}><td className="px-3 py-2 font-semibold text-slate-800">{display(parameter.label)}</td><td className="px-3 py-2 font-mono">{display(parameter.value)}</td><td className="px-3 py-2">{display(parameter.unit)}</td><td className="px-3 py-2"><span className="rounded bg-slate-100 px-1.5 py-0.5">{display(parameter.classification)}</span></td><td className="px-3 py-2 text-slate-600">{display(parameter.note)}</td></tr>)}</tbody></table></div></section>
    <div className="grid gap-3 lg:grid-cols-2"><section className="rounded border border-slate-200"><h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900">Internals schedule</h3><div className="overflow-x-auto"><table className="w-full min-w-[470px] text-left text-[10px]"><thead><tr className="text-slate-500"><th className="px-3 py-2">ID</th><th>Definition</th><th>Qty</th><th>OD / thk [m]</th></tr></thead><tbody className="divide-y divide-slate-100">{internals.map((item, index) => <tr key={`${String(item.id)}-${index}`}><td className="px-3 py-2 font-mono">{display(item.id)}</td><td className="py-2">{display(item.type)}</td><td className="py-2 font-mono">{display(item.count)}</td><td className="py-2 font-mono">{display(item.diameterM)} / {display(item.thicknessM)}</td></tr>)}</tbody></table></div></section><section className="rounded border border-slate-200"><h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900">Preliminary nozzle / connection schedule</h3><div className="overflow-x-auto"><table className="w-full min-w-[470px] text-left text-[10px]"><thead><tr className="text-slate-500"><th className="px-3 py-2">Tag</th><th>Service / region</th><th>EL [m]</th><th>Bore [m]</th><th>Provenance</th></tr></thead><tbody className="divide-y divide-slate-100">{nozzles.length ? nozzles.map((item, index) => <tr key={`${String(item.id)}-${index}`}><td className="px-3 py-2 font-mono">{display(item.id)}</td><td className="py-2">{display(item.service)} / {display(item.region)}</td><td className="py-2 font-mono">{display(item.elevationM)}</td><td className="py-2 font-mono">{display(item.boreM)}</td><td className="py-2">{display(item.classification)}</td></tr>) : <tr><td colSpan={5} className="px-3 py-3 text-slate-500">TBD — no connection schedule entered.</td></tr>}</tbody></table></div></section></div>
    <div className="grid gap-3 md:grid-cols-2"><section className="rounded border border-amber-200 bg-amber-50/50 p-3 text-[11px] text-amber-950"><h3 className="font-semibold">Assumptions</h3>{assumptions.length ? <ul className="mt-2 list-disc space-y-1 pl-4">{assumptions.map((item, index) => <li key={index}>{String(item)}</li>)}</ul> : <p className="mt-1">None recorded.</p>}</section><section className="rounded border border-amber-200 bg-amber-50/50 p-3 text-[11px] text-amber-950"><h3 className="font-semibold">Unresolved / TBD</h3>{tbd.length ? <ul className="mt-2 list-disc space-y-1 pl-4">{tbd.map((item, index) => <li key={index}>{String(item)}</li>)}</ul> : <p className="mt-1">No unresolved items returned.</p>}</section></div>
  </div>;
}

export default function EcrPrePilotDesignStage5Page() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [design, setDesign] = useState<RecordValue | null>(null);
  const [basis, setBasis] = useState<RecordValue | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selected, setSelected] = useState<Revision | null>(null);
  const [inputs, setInputs] = useState<Stage5Inputs>(() => emptyStage5Inputs());
  const [preview, setPreview] = useState<unknown>(null);
  const [view, setView] = useState<Stage5View>("ga");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [basisError, setBasisError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const read = useCallback(async () => {
    setLoading(true); setError(null); setBasisError(null);
    try {
      const saved = await fetch("/api/ecr-pre-pilot/designs/latest-saved", { credentials: "include" });
      if (!saved.ok) throw new Error("A saved ECR pre-pilot design is required before Stage 5 can begin.");
      const nextDesign = object(await saved.json()); setDesign(nextDesign);
      const id = nextDesign.id;
      if (id === undefined || id === null) throw new Error("The saved design did not include an identifier.");
      const [basisResult, revisionsResult] = await Promise.allSettled([
        fetch(`${base(id)}/basis`, { credentials: "include" }),
        fetch(`${base(id)}/revisions`, { credentials: "include" }),
      ]);
      if (revisionsResult.status === "rejected" || !revisionsResult.value.ok) throw new Error("Stage 5 revision history is unavailable.");
      setRevisions((await revisionsResult.value.json()) as Revision[]);
      if (basisResult.status === "rejected" || !basisResult.value.ok) {
        setBasis(null);
        setBasisError("Current Stage 3/4 governing basis is unavailable. Historical Stage 5 revisions remain readable and exportable, but no preview or new revision can be created.");
      } else setBasis(object(await basisResult.value.json()));
    } catch (cause) { setError(messageOf(cause)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void read(); }, [read]);
  const frozen = Boolean(selected);
  const currentGeometry = frozen ? selected?.geometry : preview;
  const sourceHash = basis?.sourceHash;
  const displayedSourceHash = frozen ? selected?.sourceHash : sourceHash;
  const governing = object(selected ? object(selected.geometry).basis : basis?.basis);
  const governingStage3 = {
    "Source result": governing.stage3ResultId,
    "Column internal diameter (m)": governing.columnDiameterM,
    "Compartment pitch (m)": governing.compartmentHeightM,
    "Rotor diameter (m)": governing.rotorDiameterM,
    "Rotor / column ratio": governing.rotorDiameterRatio,
    "Stator free-area ratio": governing.statorFreeAreaRatio,
    "Selected speed (RPM)": governing.selectedRpm,
    "Minimum window speed (RPM)": governing.rpmMin,
    "Maximum window speed (RPM)": governing.rpmMax,
    "Phase configuration": governing.phaseConfiguration,
  };
  const governingStage4 = {
    "Source result": governing.stage4ResultId,
    "Physical compartments": governing.compartmentCount,
    "Required active height (m)": governing.requiredActiveHeightM,
    "Installed active height (m)": governing.installedActiveHeightM,
    "Fixed design Nₜ": governing.designNt,
    "Assumed HETS (m/stage)": governing.hetsM,
  };
  const exportRevision = (format: "svg" | "pdf") => {
    if (!selected || !design?.id) return;
    const suffix = format === "pdf" ? "export.pdf" : `export.svg?view=${view}`;
    window.open(`${base(design.id)}/revisions/${selected.id}/${suffix}`, "_blank", "noopener,noreferrer");
  };
  const selectRevision = async (summary: Revision) => {
    if (!design?.id) return;
    try {
      const response = await fetch(`${base(design.id)}/revisions/${summary.id}`, { credentials: "include" });
      if (!response.ok) throw new Error(`Revision ${summary.revision} could not be opened.`);
      setSelected(await response.json() as Revision);
      setPreview(null);
    } catch (cause) {
      toast({ title: "Revision unavailable", description: messageOf(cause), variant: "destructive" });
    }
  };
  const previewGeometry = async () => {
    if (!design?.id || frozen) return;
    setBusy("preview");
    try {
      const response = await fetch(`${base(design.id)}/preview`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) });
      if (!response.ok) throw new Error("Preview could not be generated. Review the engineering inputs and source basis.");
      const result = object(await response.json()); setPreview(result.geometry ?? result);
    } catch (cause) { toast({ title: "Preview unavailable", description: messageOf(cause), variant: "destructive" }); } finally { setBusy(null); }
  };
  const saveRevision = async () => {
    if (!design?.id || frozen || !sourceHash) return;
    setBusy("save");
    try {
      const response = await fetch(`${base(design.id)}/revisions`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs, expectedSourceHash: sourceHash, notes: inputs.notes ?? null }) });
      if (!response.ok) throw new Error("Revision was not saved. The upstream basis may have changed; refresh it before issuing.");
      const record = await response.json() as Revision;
      setRevisions(list => [record, ...list]); setSelected(record); setPreview(null);
      toast({ title: `Revision ${record.revision} saved`, description: "Frozen geometry and drawing package are now traceable to the current upstream source." });
    } catch (cause) { toast({ title: "Save blocked", description: messageOf(cause), variant: "destructive" }); } finally { setBusy(null); }
  };
  const newRevision = () => { if (selected) { setInputs(selected.inputs as Stage5Inputs); setSelected(null); setPreview(null); } };
  const frozenSvg = selected?.drawings?.[view];

  return <Layout><style>{`@media (max-width: 767px) { body:has([data-testid="stage5-page"]) aside:not([data-stage5-history]) { display: none; } body:has([data-testid="stage5-page"]) main { min-width: 0; width: 100%; } body:has([data-testid="stage5-page"]) main[class*="flex-1"] > div { max-width: 100% !important; width: 100%; } }`}</style><main className="mx-auto min-h-[100dvh] w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8" data-testid="stage5-page">
    <header className="border-b-2 border-slate-800 pb-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div className="flex gap-3"><div className="rounded-md border border-cyan-900/30 bg-cyan-950 p-2.5 text-cyan-100"><FilePlus2 className="h-5 w-5" /></div><div><p className="font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-800">Hydraulic optimisation → HETS sizing → geometry definition</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Kühni geometry & drawings <span className="font-mono text-sm text-cyan-800">/ Stage 5</span></h1><p className="mt-1 text-xs text-slate-600">Engineering definition workspace — inherited facts remain distinct from incomplete physical inputs.</p></div></div><Button type="button" variant="outline" onClick={() => navigate("/design-software/ecr-pre-pilot-design/stage-4")} className="h-8 gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" /> HETS physical sizing</Button></div>
      <div className="mt-4 border border-amber-500 bg-amber-50 px-3 py-2 font-mono text-[10px] font-bold tracking-wide text-amber-950">PRELIMINARY PRE-PILOT GEOMETRY & DRAWINGS — NOT FOR FABRICATION</div>
    </header>
    {loading ? <div data-testid="stage5-loading" className="flex items-center justify-center py-20 text-sm text-slate-600"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading saved governing basis…</div> : error ? <section data-testid="stage5-error" className="mt-6 rounded border border-red-300 bg-red-50 p-5 text-sm text-red-950"><h2 className="font-semibold">Stage 5 basis unavailable</h2><p className="mt-1">{error}</p><Button type="button" variant="outline" onClick={() => void read()} className="mt-4 gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Retry</Button></section> : <>
      <section className="mt-5 rounded border border-red-300 bg-red-50 p-3 text-[11px] leading-5 text-red-950"><div className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Mechanical exclusions:</strong> this package does not establish pressure-vessel wall/head thickness, shaft strength or deflection, critical speed, bearings or seals, motor/gearbox adequacy, or structural/support calculations.</div></div></section>
      {basisError && <section data-testid="stage5-source-error" className="mt-4 rounded border border-amber-400 bg-amber-50 p-3 text-xs text-amber-950"><strong>Current source basis unavailable.</strong> {basisError}</section>}
      {selected && selected.currentness && !/current/i.test(selected.currentness) && <section data-testid="stage5-stale-banner" className="mt-4 flex gap-2 rounded border border-amber-400 bg-amber-50 p-3 text-xs text-amber-950"><AlertTriangle className="h-4 w-4 shrink-0" /><div><strong>Historical / superseded revision.</strong> This frozen package uses its saved source hash and cannot be overwritten. Create a new revision from its saved inputs after reviewing the current upstream basis.</div></section>}
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5"><section><div className="mb-2 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-cyan-800">Authoritative upstream handoff</p><h2 className="text-sm font-semibold text-slate-950">Read-only inherited facts</h2></div><span className="font-mono text-[10px] text-slate-500">Source hash: {String(displayedSourceHash ?? "unavailable")}</span></div><div className="grid gap-3 lg:grid-cols-2"><ValueGrid title="Stage 3 hydraulic & geometry basis" data={governingStage3} /><ValueGrid title="Stage 4 physical sizing basis" data={governingStage4} /></div></section>
          <section className="rounded border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-cyan-800">Geometry workspace</p><h2 className="text-sm font-semibold text-slate-950">{frozen ? `Frozen revision ${selected?.revision}` : "Working engineering inputs"}</h2></div><div className="flex gap-2">{frozen ? <Button type="button" onClick={newRevision} disabled={!basis} className="h-8 gap-1.5 text-xs"><FilePlus2 className="h-3.5 w-3.5" /> New revision from saved inputs</Button> : <><Button type="button" variant="outline" onClick={() => void previewGeometry()} disabled={busy !== null || !basis} className="h-8 gap-1.5 text-xs">{busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Preview geometry</Button><Button type="button" onClick={() => void saveRevision()} disabled={busy !== null || !preview || !sourceHash} className="h-8 gap-1.5 text-xs"><Save className="h-3.5 w-3.5" /> {busy === "save" ? "Saving…" : "Save revision"}</Button></>}</div></div><div className="p-3"><Stage5InputEditor inputs={frozen ? selected!.inputs as Stage5Inputs : inputs} disabled={frozen || !basis} onChange={next => { setInputs(next); setPreview(null); }} /></div></section>
          <section className="rounded border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 p-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-cyan-800">Derived single geometry model</p><h2 className="text-sm font-semibold text-slate-950">Preliminary drawing package</h2></div>{selected && <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => exportRevision("svg")} className="h-8 gap-1 text-xs"><Download className="h-3.5 w-3.5" /> SVG view</Button><Button type="button" variant="outline" onClick={() => exportRevision("pdf")} className="h-8 gap-1 text-xs"><Download className="h-3.5 w-3.5" /> PDF package</Button></div>}</div>{selected && <p data-testid="stage5-source-status" className="border-b border-slate-200 bg-cyan-50 px-3 py-2 font-mono text-[10px] text-cyan-950">FROZEN SOURCE · {selected.sourceHash} · {selected.currentness ?? selected.status ?? "saved"}</p>}{currentGeometry ? <div className="p-3"><div className="mb-3 flex flex-wrap gap-1">{(Object.keys(stage5ViewNames) as Stage5View[]).map(name => <Button key={name} type="button" size="sm" variant={view === name ? "default" : "outline"} onClick={() => setView(name)} className="h-7 text-[10px]">{stage5ViewNames[name]}</Button>)}</div><Stage5DrawingViewer geometry={currentGeometry} view={view} active onSelect={setView} frozenSvg={frozenSvg} /><GeometrySchedules geometry={currentGeometry} /></div> : <div data-testid="stage5-empty-drawing" className="p-8 text-center text-sm text-slate-600"><p className="font-semibold text-slate-800">No generated geometry in this working revision.</p><p className="mt-1 text-xs">Enter only known engineering inputs, then explicitly preview the server-built geometry. Export remains disabled until a revision is saved.</p></div>}</section>
        </div>
        <aside data-stage5-history className="space-y-4"><section className="rounded border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-cyan-800">Revision control</p><h2 className="text-sm font-semibold text-slate-950">Saved drawing records</h2></div>{revisions.length ? <div className="divide-y divide-slate-100">{revisions.map(revision => <button type="button" key={revision.id} onClick={() => void selectRevision(revision)} className={`w-full p-3 text-left text-xs hover:bg-slate-50 ${selected?.id === revision.id ? "bg-cyan-50" : ""}`}><div className="flex justify-between gap-2"><strong>REV {revision.revision}</strong><span className="font-mono text-[9px] text-slate-500">{revision.currentness ?? revision.status ?? "saved"}</span></div><p className="mt-1 text-[10px] text-slate-600">{new Date(revision.createdAt).toLocaleString()}</p><p className="mt-1 break-all font-mono text-[9px] text-slate-500">{revision.sourceHash}</p></button>)}</div> : <div data-testid="stage5-empty-revisions" className="p-4 text-xs text-slate-600">No Stage 5 revision exists. A preview is not an issued drawing; save the current geometry to establish traceability.</div>}</section>
          <section className="rounded border border-slate-200 bg-slate-50 p-3 text-[10px] leading-5 text-slate-700"><strong className="text-slate-900">Provenance legend</strong><p className="mt-1"><span className="font-semibold text-slate-900">Inherited</span>: Stage 3/4 governing value. <span className="font-semibold text-cyan-800">Engineer-entered</span>: documented Stage 5 decision. <span className="font-semibold text-amber-800">Assumed / TBD</span>: visible uncertainty, never a hidden zero.</p></section>
        </aside>
      </div>
    </>}
  </main></Layout>;
}