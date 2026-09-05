import { useEffect, useState } from "react";
import { ChevronDown, Info, Loader2, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type KuhniRun = {
  id?: string | number;
  status?: string;
  createdAt?: string;
  processBasis?: Record<string, unknown>;
  records?: Array<Record<string, unknown>>;
  empiricalRecords?: Array<Record<string, unknown>>;
  source?: Record<string, unknown>;
  blockers?: string[];
  provenance?: Record<string, unknown>;
  [key: string]: unknown;
};

export type Stage2ThermodynamicDependencySummary = {
  jobId: string;
  jobStatus: string;
  resultStatus?: string;
  executionStatus?: string;
  predictiveNt?: number | null;
  establishedTheoreticalStages?: number | null;
  engineContractVersion?: string;
  stage1SnapshotHash?: string;
  currentStage1SnapshotHash?: string;
  modelHash?: string;
  engineHash?: string;
};

const KUHNI_DEFAULTS = {
  columnDiameterM: 0.15,
  rotorToColumnRatio: 0.50,
  compartmentHeightM: 0.075,
  statorFreeAreaFraction: 0.35,
  rotorSpeedRpmMin: 60,
  rotorSpeedRpmMax: 300,
  rotorSpeedRpmStep: 60,
  powerNumber: 1.20,
  directTurbulenceC: 0.42,
};

function kuNumber(value: unknown, digits = 3) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

function flattenProcessBasis(value: unknown, prefix = ""): Array<[string, string]> {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") return [[prefix || "value", String(value)]];
  if (Array.isArray(value)) return [[prefix, value.map((item) => String(item)).join(" · ")]];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenProcessBasis(child, prefix ? `${prefix}.${key}` : key),
  );
}

function KuhniResultPanel({ run, runCount }: { run: KuhniRun; runCount: number }) {
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false);
  const [blockerDetailsOpen, setBlockerDetailsOpen] = useState(false);
  const trials = run.records ?? [];
  const empiricalRecords = run.empiricalRecords ?? [];
  const applicabilityDiagnostics = Array.isArray(run.applicabilityDiagnostics) ? run.applicabilityDiagnostics : [];
  const primaryCorrelation = empiricalRecords[0];
  const blockers = run.blockers ?? [];
  const blockerCategories = Array.from(new Set(blockers.map((blocker) => {
    const withoutTrialPrefix = blocker.replace(/^RPM[_\s-]*\d+(?:\.\d+)?[:_\s-]*/i, "");
    return withoutTrialPrefix.match(/^([A-Z0-9_]+)/)?.[1] ?? withoutTrialPrefix;
  })));
  const persistedGeometry = trials[0]?.geometry as Record<string, unknown> | undefined;
  const persistedRatios = persistedGeometry?.ratios as Record<string, unknown> | undefined;
  const read = (row: Record<string, unknown>, ...keys: string[]) => {
    for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
    return undefined;
  };
  const cell = (row: Record<string, unknown>, ...keys: string[]) => kuNumber(read(row, ...keys));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Latest persisted run</h3>
          <p className="mt-0.5 text-[10px] text-slate-500">{run.createdAt ? new Date(run.createdAt).toLocaleString() : "Timestamp unavailable"} · {runCount} persisted run{runCount === 1 ? "" : "s"}</p>
        </div>
        <span className="rounded-full border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] text-slate-600">{run.status ?? "SCREENING_RESULT"}</span>
      </div>
      {persistedGeometry && (
        <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Column diameter", `${kuNumber(persistedGeometry.columnDiameterM)} m`],
            ["Rotor diameter", `${kuNumber(persistedGeometry.rotorDiameterM)} m`],
            ["Rotor / column", kuNumber(persistedRatios?.rotorToColumn)],
            ["Compartment height", `${kuNumber(persistedGeometry.compartmentHeightM)} m`],
          ].map(([label, value]) => (
            <div key={label}>
              <span className="text-slate-500">{label}</span><br />
              <strong className="font-mono text-slate-900">{value}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[1120px] text-left text-[10px]">
          <thead className="bg-slate-100 text-[9px] uppercase tracking-wide text-slate-600"><tr>
            {["RPM", "Tip speed / margin", "Uc / Ud", "P/V", "d32", "φD", "Slip", "Vk", "Flooding", "Interfacial area", "Re", "State"].map((label) => <th key={label} className="whitespace-nowrap px-2.5 py-2 font-semibold">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {trials.length === 0 ? <tr><td colSpan={12} className="px-3 py-5 text-center text-slate-500">The persisted response contains no screening records.</td></tr> : trials.map((row, index) => {
              const flooding = row.flooding as Record<string, unknown> | undefined;
              const tip = row.tipSpeed as Record<string, unknown> | undefined;
              const velocities = row.superficialVelocitiesMS as Record<string, unknown> | undefined;
              const d32 = row.d32 as Record<string, unknown> | undefined;
              const holdup = row.holdup as Record<string, unknown> | undefined;
              const slip = row.slip as Record<string, unknown> | undefined;
              const area = row.interfacialArea as Record<string, unknown> | undefined;
              return <tr key={String(read(row, "rpm", "rotorSpeedRpm") ?? index)} className="align-middle hover:bg-slate-50">
                <td className="px-2.5 py-2 font-mono font-semibold text-slate-900">{cell(row, "rpm")}</td>
                <td className="px-2.5 py-2 font-mono">{kuNumber(read(row, "tipSpeedMS"))} <span className="text-slate-400">/</span> {kuNumber(read(tip ?? {}, "marginMS"))}<br /><span className="text-slate-400">{String(read(tip ?? {}, "status") ?? "—")}</span></td>
                <td className="px-2.5 py-2 font-mono">{kuNumber(read(velocities ?? {}, "Uc"))} <span className="text-slate-400">/</span> {kuNumber(read(velocities ?? {}, "Ud"))}<br /><span className="text-slate-400">{String(read(velocities ?? {}, "UcIdentity") ?? "")}</span></td>
                <td className="px-2.5 py-2 font-mono">{cell(row, "powerVolumeWM3")}</td>
                <td className="px-2.5 py-2 font-mono">{cell(row, "d32M")} <span className="text-slate-400">m</span><br /><span className="text-slate-400">{String(read(d32 ?? {}, "status") ?? "—")}</span></td>
                <td className="px-2.5 py-2 font-mono">{cell(row, "phiD")}<br /><span className="text-slate-400">{String(read(holdup ?? {}, "status") ?? "—")}</span></td>
                <td className="px-2.5 py-2 font-mono">{cell(row, "slipMS")}<br /><span className="text-slate-400">{String(read(slip ?? {}, "status", "dependency") ?? "—")}</span></td>
                <td className="px-2.5 py-2 font-mono">{cell(row, "vkMS")}<br /><span className="text-slate-400">{String(read(slip ?? {}, "dependency") ?? "—")}</span></td>
                <td className={`px-2.5 py-2 font-semibold ${/pass|safe|clear/i.test(String(read(flooding ?? {}, "status") ?? "")) ? "text-emerald-700" : "text-amber-700"}`}>{String(read(flooding ?? {}, "status") ?? "—")}<br /><span className="font-normal text-slate-500">{String(read(flooding ?? {}, "message") ?? "")}</span></td>
                <td className="px-2.5 py-2 font-mono">{cell(row, "interfacialAreaM2M3")}<br /><span className="text-slate-400">{String(read(area ?? {}, "status", "dependency") ?? "—")}</span></td>
                <td className="px-2.5 py-2 font-mono">{cell(row, "rotorReynolds")}</td>
                <td className="px-2.5 py-2 font-semibold">{String(read(row, "status") ?? "—")}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <h4 className="text-[11px] font-semibold text-slate-800">Screening disposition</h4>
          <p className="mt-1 text-[11px] text-slate-600"><strong>No final selection.</strong> All persisted trial states are shown for engineering review.</p>
          <p className="text-[10px] leading-4 text-slate-500">This Stage 3 result does not nominate a physical stage, height, efficiency, or mechanical design.</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <h4 className="text-[11px] font-semibold text-slate-800">Source</h4>
          {primaryCorrelation ? (
            <div className="mt-1 text-[10px] leading-4 text-slate-600">
              <p><strong className="text-slate-800">{String(read(primaryCorrelation, "id") ?? "Correlation")}</strong> · v{String(read(primaryCorrelation, "version") ?? "—")}</p>
              <p>{String(read(primaryCorrelation, "source") ?? "Source not stated")}</p>
              <p className={applicabilityDiagnostics.length ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>
                Applicability: {applicabilityDiagnostics.length ? `Review required · ${applicabilityDiagnostics.length} diagnostic${applicabilityDiagnostics.length === 1 ? "" : "s"}` : "No global diagnostic returned"}
              </p>
              {empiricalRecords.length > 1 && <p className="text-slate-500">{empiricalRecords.length} correlation records retained.</p>}
            </div>
          ) : <p className="mt-1 text-[10px] text-slate-500">No empirical correlation records were returned by this run.</p>}
          <button
            type="button"
            onClick={() => setSourceDetailsOpen((open) => !open)}
            aria-expanded={sourceDetailsOpen}
            aria-controls="kuhni-source-details"
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 underline underline-offset-2"
          >
            View source details
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sourceDetailsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50/50 p-3">
          <h4 className="text-[11px] font-semibold text-red-900">Blockers and limitations</h4>
          {blockers.length ? (
            <>
              <p className="mt-1 text-[10px] leading-4 text-red-800">
                <strong>{blockers.length}</strong> blocker record{blockers.length === 1 ? "" : "s"} across <strong>{blockerCategories.length}</strong> categor{blockerCategories.length === 1 ? "y" : "ies"}.
              </p>
              <p className="mt-0.5 line-clamp-2 text-[9px] leading-4 text-red-700">
                {blockerCategories.slice(0, 3).join(" · ")}{blockerCategories.length > 3 ? ` · +${blockerCategories.length - 3} more` : ""}
              </p>
              <button
                type="button"
                onClick={() => setBlockerDetailsOpen((open) => !open)}
                aria-expanded={blockerDetailsOpen}
                aria-controls="kuhni-blocker-details"
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-red-800 underline underline-offset-2"
              >
                View blocker details
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${blockerDetailsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            </>
          ) : <p className="mt-1 text-[10px] text-red-800">No numerical blockers were returned.</p>}
        </div>
      </div>
      <div id="kuhni-blocker-details" className={blockerDetailsOpen && blockers.length ? "rounded-md border border-red-200 bg-red-50/50 p-3" : "hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold text-red-900">Complete per-trial blocker record</h4>
          <span className="text-[9px] font-medium uppercase tracking-wide text-red-700">{blockers.length} records</span>
        </div>
        <ul className="mt-2 grid gap-x-6 gap-y-1 pl-4 text-[10px] text-red-800 md:grid-cols-2">
          {blockers.map((blocker, index) => <li key={index} className="list-disc break-words">{blocker}</li>)}
        </ul>
      </div>
      <div id="kuhni-source-details" className={sourceDetailsOpen ? "grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-[10px]" : "hidden"}>
        <div>
          <strong className="text-slate-700">Empirical correlation provenance / applicability</strong>
          {empiricalRecords.length ? <div className="mt-1 space-y-2">{empiricalRecords.map((item, index) => <div key={index} className="border-l-2 border-slate-300 pl-2"><strong>{String(read(item, "id") ?? "Correlation")}</strong> · v{String(read(item, "version") ?? "—")} · {String(read(item, "source") ?? "source not stated")}<br /><span className="text-slate-500">Equation: {String(read(item, "equation") ?? "—")} · Units: {String(read(item, "units") ?? "—")}</span><pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[9px] text-slate-500">{JSON.stringify({ ranges: item.ranges, assumptions: item.assumptions, applicabilityDiagnostics: item.applicabilityDiagnostics, implementationHash: item.implementationHash }, null, 2)}</pre></div>)}</div> : <p className="mt-1 text-slate-500">No empirical correlation records were returned by this run.</p>}
        </div>
        <div><strong className="text-slate-700">Source record</strong><pre className="mt-1 whitespace-pre-wrap break-words font-mono text-slate-500">{JSON.stringify(run.source ?? {}, null, 2)}</pre></div>
        <div><strong className="text-slate-700">Global applicability diagnostics</strong><pre className="mt-1 whitespace-pre-wrap break-words font-mono text-slate-500">{JSON.stringify(applicabilityDiagnostics, null, 2)}</pre></div>
        <div><strong className="text-slate-700">Chemical-system qualification</strong><pre className="mt-1 whitespace-pre-wrap break-words font-mono text-slate-500">{JSON.stringify((run.source?.chemicalSystemQualification as Record<string, unknown> | undefined) ?? {}, null, 2)}</pre></div>
        {run.provenance && <p className="break-all font-mono text-[9px] text-slate-400">Provenance: {JSON.stringify(run.provenance)}</p>}
      </div>
    </div>
  );
}

export function KuhniHydrodynamicsCard({
  designId,
  thermodynamicDependency,
  thermodynamicDependencyReady,
  thermodynamicDependencyError,
}: {
  designId: number | null;
  thermodynamicDependency: Stage2ThermodynamicDependencySummary | null;
  thermodynamicDependencyReady: boolean;
  thermodynamicDependencyError?: string | null;
}) {
  const { toast } = useToast();
  const [inputs, setInputs] = useState<Record<keyof typeof KUHNI_DEFAULTS, string>>(
    () => Object.fromEntries(Object.entries(KUHNI_DEFAULTS).map(([key, value]) => [key, String(value)])) as Record<keyof typeof KUHNI_DEFAULTS, string>,
  );
  const [latest, setLatest] = useState<KuhniRun | null>(null);
  const [runs, setRuns] = useState<KuhniRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadRuns = async () => {
    if (!designId) return;
    setLoading(true);
    setLoadingError(null);
    try {
      const [latestResponse, runsResponse] = await Promise.all([
        fetch(`/api/ecr-pre-pilot/designs/${designId}/kuhni-hydrodynamics/latest`, { credentials: "include" }),
        fetch(`/api/ecr-pre-pilot/designs/${designId}/kuhni-hydrodynamics/runs`, { credentials: "include" }),
      ]);
      if (!latestResponse.ok && latestResponse.status !== 404) throw new Error("Latest hydrodynamic run could not be loaded.");
      if (!runsResponse.ok) throw new Error("Hydrodynamic run history could not be loaded.");
      const latestPayload = latestResponse.status === 404 ? null : await latestResponse.json();
      const runsPayload = await runsResponse.json();
      const latestResult = latestPayload?.result
        ? { ...latestPayload.result, id: latestPayload.id, createdAt: latestPayload.createdAt, immutableHash: latestPayload.immutableHash }
        : null;
      setLatest(latestResult as KuhniRun | null);
      setRuns((runsPayload?.runs ?? runsPayload ?? []) as KuhniRun[]);
    } catch (error: unknown) {
      setLoadingError(error instanceof Error ? error.message : "Hydrodynamic results could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRuns();
  }, [designId]);

  const handleRun = async () => {
    if (!designId || !thermodynamicDependencyReady) {
      toast({
        title: "Stage 3 run blocked",
        description: thermodynamicDependencyError
          ?? "A completed persisted Stage 2 thermodynamic result is required.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    setLoadingError(null);
    try {
      const body = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, Number(value)]));
      const response = await fetch(`/api/ecr-pre-pilot/designs/${designId}/kuhni-hydrodynamics/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Hydrodynamic screening could not start.");
      setLatest(payload as KuhniRun);
      await loadRuns();
      toast({ title: "Kuhni screening complete", description: "Trial matrix persisted as a Stage 3 screening result." });
    } catch (error: unknown) {
      setLoadingError(error instanceof Error ? error.message : "Hydrodynamic screening could not start.");
      toast({ title: "Kuhni screening failed", description: error instanceof Error ? error.message : "The run could not be completed.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="overflow-hidden border-slate-300 shadow-sm">
      <CardHeader className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2.5">
            <div className="rounded-md bg-slate-900 p-2 text-white"><ShieldCheck className="h-4 w-4" /></div>
            <div>
              <CardTitle className="text-[15px] text-slate-900">Stage 3 · Kuhni hydrodynamic screening</CardTitle>
              <CardDescription className="mt-0.5 max-w-2xl text-[11px] leading-4">
                A governed trial matrix using a system-resolved geometry and rotor-speed basis. Only controlled correlation parameters remain editable.
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            onClick={handleRun}
            disabled={!designId || !thermodynamicDependencyReady || submitting || loading}
            title={thermodynamicDependencyReady ? undefined : "A completed persisted Stage 2 thermodynamic result is required."}
            className="h-8 gap-1.5 bg-slate-900 px-3 text-xs hover:bg-slate-700"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {submitting ? "Running matrix…" : "Run Stage 3 matrix"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4">
        <div className={`rounded-md border p-3 ${thermodynamicDependencyReady ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/70"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={`text-xs font-semibold ${thermodynamicDependencyReady ? "text-emerald-950" : "text-amber-950"}`}>
              Read-only Stage 2 thermodynamic dependency
            </h3>
            <span className={`text-[10px] font-semibold ${thermodynamicDependencyReady ? "text-emerald-700" : "text-amber-800"}`}>
              {thermodynamicDependencyReady ? "Stage 3 run enabled" : "Stage 3 run blocked"}
            </span>
          </div>
          {thermodynamicDependencyError ? (
            <p className="mt-2 text-[11px] text-red-800">{thermodynamicDependencyError}</p>
          ) : thermodynamicDependency ? (
            <div className="mt-2 grid gap-x-5 gap-y-2 text-[10px] text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Job", thermodynamicDependency.jobId],
                ["Job status", thermodynamicDependency.jobStatus],
                ["Result status", thermodynamicDependency.resultStatus],
                ["Execution status", thermodynamicDependency.executionStatus],
                ["Predictive N_T", thermodynamicDependency.predictiveNt],
                ["Established stages", thermodynamicDependency.establishedTheoreticalStages],
                ["Engine contract", thermodynamicDependency.engineContractVersion],
                ["Job Stage 1 snapshot hash", thermodynamicDependency.stage1SnapshotHash],
                ["Current Stage 1 snapshot hash", thermodynamicDependency.currentStage1SnapshotHash],
                ["Model hash", thermodynamicDependency.modelHash],
                ["Engine hash", thermodynamicDependency.engineHash],
              ].map(([label, value]) => (
                <div key={String(label)} className="min-w-0 break-words">
                  <span className="text-slate-500">{label}</span><br />
                  <strong className="font-mono">{value === null || value === undefined || value === "" ? "—" : String(value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-amber-900">No persisted Stage 2 Predictive N_T job exists for this saved design.</p>
          )}
          <p className="mt-2 border-t border-current/10 pt-2 text-[10px] text-slate-600">
            Read-only persisted job data. Stage 3 does not reconstruct, edit, or duplicate Stage 2 inputs or results.
          </p>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-[11px] leading-4 text-amber-950">
          <strong>Screening boundary.</strong> This stage terminates before mass transfer, efficiency, physical stages, height, and final mechanical sizing. Mass transfer remains outside this workflow for future Stage 4. No candidate below is a final design decision.
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Stage 3 screening inputs</h3>
            <span className="font-mono text-[10px] text-slate-400">POST /kuhni-hydrodynamics/runs</span>
          </div>
          <section className="rounded-md border border-slate-200 bg-white p-3" aria-labelledby="kuhni-equipment-inputs">
            <div className="mb-3">
              <h4 id="kuhni-equipment-inputs" className="text-[11px] font-semibold text-slate-900">System-resolved geometry and operating basis</h4>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">Read-only Stage‑3 trial geometry and rotor-speed matrix. The system supplies and persists these values with each run; the user does not enter them.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {([
                ["columnDiameterM", "Column diameter", "m"],
                ["rotorToColumnRatio", "Rotor / column diameter", "—"],
                ["compartmentHeightM", "Compartment height", "m"],
                ["statorFreeAreaFraction", "Stator free-area fraction", "—"],
                ["rotorSpeedRpmMin", "Rotor speed minimum", "rpm"],
                ["rotorSpeedRpmMax", "Rotor speed maximum", "rpm"],
                ["rotorSpeedRpmStep", "Rotor speed step", "rpm"],
              ] as Array<[keyof typeof KUHNI_DEFAULTS, string, string]>).map(([key, label, unit]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`kuhni-${key}`} className="text-[11px] font-medium text-slate-700">{label}</Label>
                  <div className="flex items-center gap-1.5">
                    <Input id={`kuhni-${key}`} type="number" step="any" value={inputs[key]} readOnly aria-readonly="true" className="h-8 cursor-default border-slate-200 bg-slate-100 font-mono text-xs text-slate-700" />
                    <span className="w-10 shrink-0 text-[10px] text-slate-500">{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3" aria-labelledby="kuhni-correlation-inputs">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 id="kuhni-correlation-inputs" className="text-[11px] font-semibold text-indigo-950">Controlled correlation parameters</h4>
                <p className="mt-0.5 text-[10px] leading-4 text-indigo-800">Provenance-sensitive model parameters retained as expert inputs; they are not calculated from the Stage‑1 process basis.</p>
              </div>
              <span className="rounded border border-indigo-200 bg-white px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-indigo-700">Expert input</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["powerNumber", "Power number", "—"],
                ["directTurbulenceC", "Direct turbulence coefficient", "—"],
              ] as Array<[keyof typeof KUHNI_DEFAULTS, string, string]>).map(([key, label, unit]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`kuhni-${key}`} className="text-[11px] font-medium text-indigo-950">{label}</Label>
                  <div className="flex items-center gap-1.5">
                    <Input id={`kuhni-${key}`} type="number" step="any" value={inputs[key]} onChange={(event) => setInputs((current) => ({ ...current, [key]: event.target.value }))} className="h-8 border-indigo-200 bg-white font-mono text-xs" />
                    <span className="w-10 shrink-0 text-[10px] text-indigo-700">{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <p className="max-w-4xl text-[10px] leading-4 text-slate-500">
            The seeded geometry is inside the K&amp;H Table-1 geometric envelope only. Governed Stage 1 throughput and RRBO/NMP properties are evaluated independently and may place holdup, slip, V<sub>k</sub>, and area on diagnostic HOLD; the kernel never extrapolates through those violations.
          </p>
        </div>
        <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-950"><Info className="h-3.5 w-3.5" />Authoritative Stage-1 process basis in the saved run</div>
          {latest?.processBasis ? (
            <div className="grid gap-x-5 gap-y-1 text-[10px] text-blue-950 sm:grid-cols-2 lg:grid-cols-4">
              {flattenProcessBasis(latest.processBasis).map(([key, value]) => (
                <div key={key} className="min-w-0 break-words"><span className="text-blue-700">{key}</span><br /><strong className="font-mono">{value}</strong></div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] leading-4 text-blue-800">No persisted run process basis is available yet. Run the matrix after saving Stage 1; this panel will then show the exact temperature-resolved RRBO / wet-solvent properties captured with that run.</p>
          )}
          <p className="mt-2 border-t border-blue-200 pt-2 text-[10px] text-blue-800">Read-only snapshot. This screen does not temperature-correct, look up, reconstruct, default, or accept re-entry of any Stage-1 property.</p>
        </div>
        <div className="border-t border-slate-200 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">System-calculated hydraulic outputs</h3>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">The trial matrix derives rotor diameter, RPM trials, tip speed, P/V, phase velocities, Reynolds number, d32, slip, holdup, interfacial area, flooding status, applicability diagnostics, and blockers where the governed dependencies permit calculation.</p>
        </div>
        {loading && !latest ? (
          <div className="space-y-2"><div className="h-8 animate-pulse rounded bg-slate-100" /><div className="h-20 animate-pulse rounded bg-slate-100" /></div>
        ) : loadingError ? (
          <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 text-[11px] text-red-800"><span>{loadingError}</span><Button type="button" variant="outline" onClick={() => void loadRuns()} className="h-7 gap-1 px-2 text-[11px]"><RefreshCw className="h-3 w-3" /> Retry</Button></div>
        ) : !latest ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-[11px] text-slate-500">No persisted Kuhni run yet. Set the screening inputs and run the Stage 3 matrix.</div>
        ) : (
          <KuhniResultPanel run={latest} runCount={runs.length} />
        )}
      </CardContent>
    </Card>
  );
}