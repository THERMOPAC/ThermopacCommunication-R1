import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, FlaskConical, Loader2, Play, RefreshCw, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type RecordValue = Record<string, unknown>;
type JobAResponse = RecordValue & { result?: RecordValue; data?: RecordValue };

const STAGE_3_PATH = "/design-software/ecr-pre-pilot-design/stage-3";
const fixedOrderNotice = "The server returns the governed seven-component order. No client-side component order or coefficient is inferred.";

function object(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function read(value: RecordValue, ...keys: string[]): unknown {
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key];
  }
  return undefined;
}

function stringValue(value: unknown, fallback = "—"): string {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function numberValue(value: unknown, digits = 3): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toExponential(Math.max(0, digits - 1)) : "—";
}

function scalarValue(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 4 }) : stringValue(value);
}

function resultOf(response: JobAResponse | null): RecordValue {
  if (!response) return {};
  return object(response.result ?? response.data ?? response);
}

function phaseRows(result: RecordValue): RecordValue[] {
  const direct = read(result, "cells", "rows", "records", "coefficients", "componentPhaseRows");
  if (Array.isArray(direct)) return direct.map(object);
  const phases = read(result, "phases", "phaseResults");
  if (!Array.isArray(phases)) return [];
  return phases.flatMap((phase) => {
    const phaseRecord = object(phase);
    const rows = read(phaseRecord, "rows", "records", "components", "values");
    if (!Array.isArray(rows)) return [phaseRecord];
    return rows.map((row) => ({ ...object(row), phase: read(object(row), "phase", "phaseName") ?? read(phaseRecord, "phase", "name", "phaseName") }));
  });
}

function componentName(row: RecordValue): string {
  return stringValue(read(row, "componentId", "component", "componentName", "name", "species", "solute"), "Unlabelled component");
}

function phaseName(row: RecordValue): string {
  return stringValue(read(row, "phase", "phaseName", "phaseLabel", "side"), "Unlabelled phase");
}

function flagsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item));
  if (value && typeof value === "object") return Object.entries(value as RecordValue).filter(([, item]) => item === true || typeof item === "string").map(([key, item]) => `${key}: ${String(item)}`);
  return value ? [String(value)] : [];
}

function HashLine({ label, value }: { label: string; value: unknown }) {
  return <div className="min-w-0 border-l border-cyan-900/20 pl-3"><dt className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</dt><dd className="mt-0.5 break-all font-mono text-[10px] text-slate-700">{stringValue(value)}</dd></div>;
}

function JobBStateAudit({ inputAudit }: { inputAudit: RecordValue }) {
  const stage2Provenance = read(inputAudit, "stage2Provenance");
  const sourceStageCount = read(inputAudit, "sourceStageCount");
  const requestedNT = read(inputAudit, "requestedNT");
  const auditFields: Array<[string, unknown]> = [
    ["x_bulk_continuous", read(inputAudit, "x_bulk_continuous")],
    ["x_bulk_dispersed", read(inputAudit, "x_bulk_dispersed")],
    ["bulkContinuousProvenance", read(inputAudit, "bulkContinuousProvenance")],
    ["bulkDispersedProvenance", read(inputAudit, "bulkDispersedProvenance")],
    ["stage2Provenance", stage2Provenance],
    ["sourceStageCount", sourceStageCount],
    ["requestedNT", requestedNT],
    ["phi_d_operating", read(inputAudit, "phi_d_operating")],
    ["d32_m", read(inputAudit, "d32_m")],
    ["kc [m/s]", read(inputAudit, "kc")],
    ["kd [m/s]", read(inputAudit, "kd")],
    ["exactInterfaceEquilibriumRequest", read(inputAudit, "exactInterfaceEquilibriumRequest")],
    ["holdupDefinesThermodynamicComposition", read(inputAudit, "holdupDefinesThermodynamicComposition")],
  ];
  return <section className="border-t border-indigo-200 bg-indigo-50/40 p-3">
    <h3 className="text-xs font-semibold text-slate-900">Exact Job-B state audit</h3>
    <p className="mt-1 text-[10px] leading-4 text-slate-600">The values below are the server-returned boundary state and coefficient inputs; the browser does not reconstruct them.</p>
    <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {auditFields.map(([label, value]) => <div key={label} className="min-w-0 rounded border border-indigo-200 bg-white p-2"><dt className="text-[9px] font-semibold text-slate-500">{label}</dt><dd className="mt-1 break-words font-mono text-[10px] text-slate-900">{typeof value === "object" ? JSON.stringify(value) : stringValue(value)}</dd></div>)}
    </dl>
    <div className="mt-3 space-y-1 text-[10px] leading-4 text-slate-700">
      <p>Stage-2 stage/trial records establish inlet-state provenance only. An accepted:false trial is retained as provenance; rejected Stage-2 outlets are not used as Job-B bulk boundaries.</p>
      <p>Source N<sub>T</sub>={scalarValue(sourceStageCount)} and requested N<sub>T</sub>={scalarValue(requestedNT)} are reported separately. The source stage count identifies the source record; it does not override the requested N<sub>T</sub>.</p>
      <p>Operating holdup does not define thermodynamic composition: holdupDefinesThermodynamicComposition = {stringValue(read(inputAudit, "holdupDefinesThermodynamicComposition"))}.</p>
    </div>
  </section>;
}

export default function EcrPrePilotDesignStage4Page() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [design, setDesign] = useState<RecordValue | null>(null);
  const [evaluation, setEvaluation] = useState<JobAResponse | null>(null);
  const [jobBEvaluation, setJobBEvaluation] = useState<JobAResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<"A" | "B" | null>(null);
  const running = activeJob !== null;
  const [error, setError] = useState<string | null>(null);
  const [jobBDiagnostic, setJobBDiagnostic] = useState<RecordValue | null>(null);

  const loadDesign = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEvaluation(null);
    setJobBEvaluation(null);
    setJobBDiagnostic(null);
    try {
      const response = await fetch("/api/ecr-pre-pilot/designs/latest-saved", { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 404) throw new Error("Save Stage 1 inputs before opening Job-A coefficient testing.");
      if (!response.ok) throw new Error(stringValue(read(object(payload), "message", "error"), "The latest saved design could not be loaded."));
      setDesign(object(payload));
    } catch (cause: unknown) {
      setDesign(null);
      setError(cause instanceof Error ? cause.message : "The latest saved design could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDesign(); }, [loadDesign]);

  const runEvaluation = async () => {
    const id = Number(design?.id);
    if (!Number.isFinite(id)) return;
    setActiveJob("A");
    setError(null);
    setEvaluation(null);
    setJobBEvaluation(null);
    setJobBDiagnostic(null);
    try {
      const response = await fetch(`/api/ecr-pre-pilot/designs/${id}/job-a/evaluate`, { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(stringValue(read(object(payload), "message", "error"), "Job-A evaluation did not complete."));
      setEvaluation(object(payload));
      toast({ title: "Job-A evaluation completed", description: "The returned coefficients are shown below without client-side reconstruction." });
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "Job-A evaluation did not complete.";
      setError(message);
      toast({ title: "Job-A evaluation blocked", description: message, variant: "destructive" });
    } finally {
      setActiveJob(null);
    }
  };

  const runJobBEvaluation = async () => {
    const id = Number(design?.id);
    if (!Number.isFinite(id)) return;
    setActiveJob("B");
    setError(null);
    setJobBEvaluation(null);
    setJobBDiagnostic(null);
    try {
      const response = await fetch(`/api/ecr-pre-pilot/designs/${id}/job-b/evaluate`, { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.details) setJobBDiagnostic(object(payload.details));
        throw new Error(stringValue(read(object(payload), "message", "error"), "Job-B local flux test did not complete."));
      }
      setJobBEvaluation(object(payload));
      toast({ title: "Job-B local test completed", description: "Seven-component fluxes and local Stage-3 coupling are shown below. No column sizing was performed." });
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "Job-B local flux test did not complete.";
      setError(message);
      toast({ title: "Job-B local test blocked", description: message, variant: "destructive" });
    } finally {
      setActiveJob(null);
    }
  };

  const result = useMemo(() => resultOf(evaluation), [evaluation]);
  const rows = useMemo(() => phaseRows(result), [result]);
  const order = useMemo(() => {
    const declared = read(result, "componentOrder", "components");
    return Array.isArray(declared) ? declared.map((item) => typeof item === "string" ? item : componentName(object(item))) : Array.from(new Set(rows.map(componentName)));
  }, [result, rows]);
  const phases = useMemo(() => Array.from(new Set(rows.map(phaseName))).slice(0, 2), [rows]);
  const flags = useMemo(() => [...flagsOf(read(result, "flags", "applicabilityFlags", "warnings")), ...rows.flatMap((row) => flagsOf(read(row, "flags", "applicabilityFlags", "warnings")))], [result, rows]);
  const legacyPass = Boolean(read(result, "legacyPathInvoked", "legacyIsolationPass", "legacyIsolationPassed") === false || /pass/i.test(stringValue(read(result, "legacyIsolationStatus", "legacyPathStatus"), "")));
  const releaseEligible = Boolean(read(result, "releaseEligible"));
  const pilotValidated = Boolean(read(result, "pilotValidated"));
  const dimensionalAudit = read(result, "dimensionalAudit", "dimensionAudit")
    ?? rows.map((row) => ({
      componentId: componentName(row),
      phase: phaseName(row),
      audit: read(row, "dimensionalAudit", "dimensionAudit"),
    }));
  const hydraulics = object(read(result, "localHydraulics"));
  const authority = object(read(result, "thermodynamicAuthority"));
  const jobBResult = useMemo(() => resultOf(jobBEvaluation), [jobBEvaluation]);
  const jobBRows = Array.isArray(read(jobBResult, "rows")) ? (read(jobBResult, "rows") as unknown[]).map(object) : [];
  const jobBHydraulics = object(read(jobBResult, "frozenLocalHydraulics"));
  const jobBInputAudit = object(read(jobBResult, "inputAudit"));
  const failedJobBInputAudit = object(read(jobBDiagnostic ?? {}, "inputAudit"));
  const diagnosticStatus = stringValue(read(jobBDiagnostic ?? {}, "adapterStatus", "status"));
  const genericAdapterBlock = /MODULE|DEPENDENCY|UNAVAILABLE|ERROR/i.test(diagnosticStatus);
  const interfaceStateNotAccepted = !genericAdapterBlock && (
    /INTERFACE.*NOT_ACCEPTED|NOT_ACCEPTED.*INTERFACE/i.test(diagnosticStatus)
    || read(object(read(jobBDiagnostic ?? {}, "interfaceDiagnostics")), "accepted") === false
  );

  return (
    <Layout>
      <main className="mx-auto min-h-full w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b-2 border-slate-800 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-md border border-cyan-900/30 bg-cyan-950 p-2.5 text-cyan-100"><FlaskConical className="h-5 w-5" /></div>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-800">ECR / pre-pilot / stage 04</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Mass-transfer testing · Jobs A &amp; B</h1>
              <p className="mt-1 text-xs text-slate-600">Governed calculation review {design?.projectNumber ? `· ${String(design.projectNumber)}` : "· latest saved design"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(STAGE_3_PATH)} className="h-8 gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" /> Stage 3 hydrodynamics</Button>
            <Button type="button" variant="outline" onClick={() => void loadDesign()} disabled={loading || running} className="h-8 gap-1.5 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh design</Button>
            <Button type="button" onClick={() => void runEvaluation()} disabled={!design || loading || running} className="h-8 gap-1.5 bg-cyan-950 text-xs hover:bg-cyan-900"><Play className="h-3.5 w-3.5" />{activeJob === "A" ? "Evaluating Job-A…" : evaluation ? "Re-run Job-A" : "Evaluate Job-A"}</Button>
            <Button type="button" onClick={() => void runJobBEvaluation()} disabled={!design || loading || running} className="h-8 gap-1.5 bg-indigo-950 text-xs hover:bg-indigo-900"><Play className="h-3.5 w-3.5" />{activeJob === "B" ? "Evaluating Job-B…" : jobBEvaluation ? "Re-run Job-B" : "Test Job-B flux"}</Button>
          </div>
        </header>

        {loading ? <div className="space-y-3"><div className="h-24 animate-pulse rounded-md bg-slate-200" /><div className="h-64 animate-pulse rounded-md bg-slate-100" /></div> : error && !design ? (
          <section className="rounded-md border border-red-200 bg-red-50 p-5"><div className="flex gap-3 text-red-900"><ShieldAlert className="h-5 w-5 shrink-0" /><div><h2 className="text-sm font-semibold">Design prerequisite unavailable</h2><p className="mt-1 text-xs">{error}</p><Button type="button" variant="outline" onClick={() => void loadDesign()} className="mt-3 h-8 text-xs">Retry design load</Button></div></div></section>
        ) : (
          <div className="space-y-4">
            {activeJob === "B" && <div role="status" className="flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-950"><Loader2 className="h-4 w-4 shrink-0 animate-spin" /><p>Evaluating Job-A dependencies and solving the simultaneous interface chemical-potential and two-film equations before calculating fluxes. This may take several minutes. No sizing is performed.</p></div>}
            {error && <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
            {jobBDiagnostic && <section role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <h2 className="text-sm font-semibold">{interfaceStateNotAccepted ? "Job-B interface state not accepted" : "Job-B calculation blocked"}</h2>
              <p className="mt-1 text-xs leading-5">{interfaceStateNotAccepted ? <>The simultaneous solver did not return an accepted interface state.</> : <>A required Job-B module or dependency blocked the calculation.</>} Adapter status: {diagnosticStatus}. No interfacial fluxes are shown. This does not change the Job-A verdict.</p>
              <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">Interface and adapter diagnostics</summary><pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-3 text-[10px]">{JSON.stringify({ interfaceDiagnostics: read(jobBDiagnostic, "interfaceDiagnostics"), adapterStatus: read(jobBDiagnostic, "adapterStatus") }, null, 2)}</pre></details>
              <div className="-mx-4 -mb-4 mt-4 text-slate-900"><JobBStateAudit inputAudit={failedJobBInputAudit} /></div>
            </section>}
            <section className="grid gap-3 lg:grid-cols-[1.35fr_.65fr]">
              <Card className="border-slate-300 shadow-none"><CardContent className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Release disposition</p><h2 className="mt-1 text-sm font-semibold text-slate-950">Pre-pilot calculation only</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">This screen provides predictive coefficient evidence for review. It is not release-qualified and does not establish a vendor, pilot, or construction acceptance basis.</p></div><span className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 font-mono text-[10px] font-semibold text-amber-900">NOT RELEASE-QUALIFIED</span></div></CardContent></Card>
              <Card className={`border-2 shadow-none ${legacyPass ? "border-emerald-500 bg-emerald-50/50" : "border-red-400 bg-red-50/50"}`}><CardContent className="flex h-full items-center gap-3 p-4">{legacyPass ? <CheckCircle2 className="h-7 w-7 text-emerald-700" /> : <ShieldAlert className="h-7 w-7 text-red-700" />}<div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Legacy-isolation control</p><p className={`font-mono text-base font-bold ${legacyPass ? "text-emerald-800" : "text-red-800"}`}>{evaluation ? legacyPass ? "PASS" : "FAIL / NOT CONFIRMED" : "AWAITING EVALUATION"}</p><p className="text-[10px] text-slate-600">legacyPathInvoked: {stringValue(read(result, "legacyPathInvoked"))}</p></div></CardContent></Card>
            </section>

            {!evaluation ? <section className="rounded-md border border-dashed border-cyan-900/30 bg-cyan-50/40 p-6 text-center"><h2 className="text-sm font-semibold text-slate-900">No Job-A record loaded in this review</h2><p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-600">Run the server-owned evaluation to retrieve the governed 7 × 2 coefficient matrix, evidence, flags, and dimensional audit. {fixedOrderNotice}</p></section> : <>
              <section className="grid gap-2 rounded-md border border-cyan-900/20 bg-cyan-50/30 p-3 sm:grid-cols-2 lg:grid-cols-6">
                {[
                  ["Stage-2 authority", `${stringValue(read(authority, "engineVersion"))} · ${stringValue(read(authority, "engineId"))}`],
                  ["Temperature", `${scalarValue(read(hydraulics, "temperatureK"))} K`],
                  ["d32", `${numberValue(read(hydraulics, "d32M"))} m`],
                  ["Slip velocity", `${numberValue(read(hydraulics, "slipVelocityMS"))} m/s`],
                  ["Drop Reynolds", scalarValue(read(hydraulics, "reynolds"))],
                  ["Stage-3 reuse", read(hydraulics, "recomputedPower") === false ? "PASS · no recomputation" : "FAIL / unconfirmed"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded border border-cyan-900/10 bg-white p-2">
                    <p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-0.5 break-words font-mono text-[10px] font-semibold text-slate-900">{value}</p>
                  </div>
                ))}
              </section>
              <section className="overflow-hidden rounded-md border border-slate-300 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2"><div><h2 className="text-sm font-semibold text-slate-900">Coefficient matrix</h2><p className="text-[10px] text-slate-500">Fixed component order from returned immutable result · two liquid-phase sides</p></div><span className="font-mono text-[10px] text-slate-600">Status: {stringValue(read(result, "status", "executionStatus"))}</span></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-[10px]"><thead className="bg-cyan-950 text-cyan-50"><tr><th className="px-3 py-2 font-semibold">Component / phase</th><th className="px-3 py-2 font-semibold">D [m²/s]</th><th className="px-3 py-2 font-semibold">Re</th><th className="px-3 py-2 font-semibold">Sc</th><th className="px-3 py-2 font-semibold">Pe</th><th className="px-3 py-2 font-semibold">Sh</th><th className="px-3 py-2 font-semibold">k [m/s]</th><th className="px-3 py-2 font-semibold">M / V inputs</th><th className="px-3 py-2 font-semibold">Applicability</th></tr></thead>
                  <tbody className="divide-y divide-slate-200">
                    {order.flatMap((component) => phases.map((phase) => {
                      const row = rows.find((candidate) =>
                        componentName(candidate) === component && phaseName(candidate) === phase
                      );
                      if (!row) {
                        return (
                          <tr key={`${component}-${phase}`} className="align-top">
                            <td colSpan={9} className="px-3 py-2 italic text-slate-400">
                              No returned row for {component} / {phase}.
                            </td>
                          </tr>
                        );
                      }
                      const molecular = object(read(row, "molecularInputs", "molecular"));
                      return (
                        <tr key={`${component}-${phase}`} className="align-top hover:bg-cyan-50/30">
                          <td className="px-3 py-2 font-semibold text-slate-900">
                            {componentName(row)}<br />
                            <span className="font-normal text-slate-500">{phaseName(row)}</span>
                          </td>
                          <td className="px-3 py-2 font-mono">{numberValue(read(row, "diffusivityM2S", "diffusivity", "D_m2_s", "D"))}</td>
                          <td className="px-3 py-2 font-mono">{scalarValue(read(row, "reynolds", "Re"))}</td>
                          <td className="px-3 py-2 font-mono">{scalarValue(read(row, "schmidt", "Sc"))}</td>
                          <td className="px-3 py-2 font-mono">{scalarValue(read(row, "peclet", "Pe"))}</td>
                          <td className="px-3 py-2 font-mono">{scalarValue(read(row, "sherwood", "Sh"))}</td>
                          <td className="px-3 py-2 font-mono font-semibold">{numberValue(read(row, "filmCoefficientMS", "filmCoefficient", "k_m_s", "k"))}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            M {scalarValue(read(molecular, "molecularWeightGmol", "molecularWeight"))}<br />
                            V {scalarValue(read(molecular, "wilkeChangBoilingVolumeCm3Mol", "boilingVolumeCm3Mol"))}
                          </td>
                          <td className="px-3 py-2 text-amber-800">{flagsOf(read(row, "flags", "applicabilityFlags", "warnings")).join(" · ") || "None returned"}</td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table></div>
              </section>
              <section className="grid gap-4 lg:grid-cols-[.95fr_1.05fr]">
                <Card className="border-slate-300 shadow-none"><CardContent className="p-4"><h2 className="text-sm font-semibold text-slate-900">Applicability &amp; readiness</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded border border-amber-200 bg-amber-50 p-2"><span className="text-[9px] uppercase tracking-wide text-amber-800">Release eligible</span><p className="font-mono text-xs font-semibold text-amber-950">{releaseEligible ? "TRUE" : "FALSE"}</p></div><div className="rounded border border-amber-200 bg-amber-50 p-2"><span className="text-[9px] uppercase tracking-wide text-amber-800">Pilot validated</span><p className="font-mono text-xs font-semibold text-amber-950">{pilotValidated ? "TRUE" : "FALSE"}</p></div></div><ul className="mt-3 space-y-1 text-[11px] text-slate-700">{flags.length ? flags.map((flag, index) => <li key={`${flag}-${index}`} className="border-l-2 border-amber-400 pl-2">{flag}</li>) : <li className="text-slate-500">No applicability flags returned by this evaluation.</li>}</ul></CardContent></Card>
                <Card className="border-slate-300 shadow-none"><CardContent className="p-4"><h2 className="text-sm font-semibold text-slate-900">Dimensional audit</h2><pre className="mt-3 max-h-44 overflow-auto rounded border border-slate-200 bg-slate-950 p-3 font-mono text-[10px] leading-4 text-cyan-50">{JSON.stringify(dimensionalAudit ?? "No dimensional audit returned.", null, 2)}</pre></CardContent></Card>
              </section>
              <details className="rounded-md border border-slate-300 bg-slate-50 p-4"><summary className="cursor-pointer text-xs font-semibold text-slate-800">Deterministic provenance &amp; evidence record</summary><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><HashLine label="Result SHA-256" value={read(result, "resultSha256", "calculationHash", "resultHash", "hash")} /><HashLine label="Input SHA-256" value={read(result, "inputSha256", "immutableHash")} /><HashLine label="Implementation SHA-256" value={read(result, "implementationSha256")} /><HashLine label="Evidence SHA-256" value={read(result, "evidenceSha256")} /></dl><pre className="mt-4 max-h-64 overflow-auto rounded border border-slate-200 bg-white p-3 font-mono text-[10px] leading-4 text-slate-700">{JSON.stringify({ dependencies: read(result, "dependencies"), evidenceIds: read(result, "evidenceIds"), hashes: { resultSha256: read(result, "resultSha256"), inputSha256: read(result, "inputSha256"), implementationSha256: read(result, "implementationSha256"), evidenceSha256: read(result, "evidenceSha256") } }, null, 2)}</pre></details>
            </>}
            {jobBEvaluation && <section className="overflow-hidden rounded-md border-2 border-indigo-300 bg-white">
              <div className="border-b border-indigo-200 bg-indigo-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700">Job B · bounded local coupling only</p>
                <h2 className="mt-1 text-sm font-semibold text-slate-950">Seven-component interfacial flux closure test</h2>
                <p className="mt-1 font-mono text-[10px] text-slate-700">{stringValue(read(jobBResult, "status"))}</p>
              </div>
              <div className="grid gap-2 border-b border-slate-200 p-3 sm:grid-cols-4">
                <div className="rounded border p-2"><p className="text-[9px] uppercase text-slate-500">Operating holdup</p><p className="font-mono text-xs">{scalarValue(read(jobBHydraulics, "operatingHoldup"))}</p></div>
                <div className="rounded border p-2"><p className="text-[9px] uppercase text-slate-500">d32 [m]</p><p className="font-mono text-xs">{numberValue(read(jobBHydraulics, "d32M"))}</p></div>
                <div className="rounded border p-2"><p className="text-[9px] uppercase text-slate-500">a [m²/m³]</p><p className="font-mono text-xs">{scalarValue(read(jobBHydraulics, "interfacialAreaM2M3"))}</p></div>
                <div className="rounded border p-2"><p className="text-[9px] uppercase text-slate-500">Hydrodynamic recompute</p><p className="font-mono text-xs">{read(jobBHydraulics, "hydrodynamicsRecomputed") === false ? "NO · PASS" : "INVALID"}</p></div>
              </div>
              <div className="m-3 rounded border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-950">Simultaneous separate-bulk-boundary chemical-potential/film solve: interface mole fractions and flux are solved together. The mixture-averaged molar-density closure is preliminary and the result is not release-qualified.</div>
              <div className="mx-3 mb-3 text-xs leading-5 text-slate-700">
                <p>Positive flux: continuous → dispersed; component source terms are equal and opposite.</p>
                <p>Local test only. No sizing is performed. Results are held in this review, not saved as a final design.</p>
              </div>
              <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-[10px]"><thead className="bg-indigo-950 text-white"><tr><th className="px-3 py-2">Component</th><th className="px-3 py-2">kc [m/s]</th><th className="px-3 py-2">kd [m/s]</th><th className="px-3 py-2">x interface, continuous [mol/mol]</th><th className="px-3 py-2">x interface, dispersed [mol/mol]</th><th className="px-3 py-2">N [mol/m²/s]</th><th className="px-3 py-2">aN [mol/m³/s]</th><th className="px-3 py-2">Continuous-film residual [mol/m²/s]</th><th className="px-3 py-2">Dispersed-film residual [mol/m²/s]</th></tr></thead><tbody className="divide-y">{jobBRows.map(row => <tr key={stringValue(read(row, "componentId"))}><td className="px-3 py-2 font-semibold">{stringValue(read(row, "componentId"))}</td><td className="px-3 py-2 font-mono">{numberValue(read(row, "kcMS"))}</td><td className="px-3 py-2 font-mono">{numberValue(read(row, "kdMS"))}</td><td className="px-3 py-2 font-mono">{numberValue(read(row, "interfaceContinuousMoleFraction"))}</td><td className="px-3 py-2 font-mono">{numberValue(read(row, "interfaceDispersedMoleFraction"))}</td><td className="px-3 py-2 font-mono font-semibold">{numberValue(read(row, "fluxMolM2S"))}</td><td className="px-3 py-2 font-mono font-semibold">{numberValue(read(row, "volumetricTransferMolM3S"))}</td><td className="px-3 py-2 font-mono">{numberValue(read(row, "continuousFilmResidualMolM2S"))}</td><td className="px-3 py-2 font-mono">{numberValue(read(row, "dispersedFilmResidualMolM2S"))}</td></tr>)}</tbody></table></div>
              <JobBStateAudit inputAudit={jobBInputAudit} />
              <dl className="grid gap-3 border-t bg-slate-50 p-3 sm:grid-cols-3"><HashLine label="Job-B result SHA-256" value={read(jobBResult, "resultSha256")} /><HashLine label="Implementation SHA-256" value={read(jobBResult, "implementationSha256")} /><HashLine label="Retained dependency hashes" value={JSON.stringify(read(jobBResult, "dependencies"))} /></dl>
              <details className="border-t p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-800">Job-B numerical audit, phase sources &amp; provenance</summary><pre className="mt-3 max-h-80 overflow-auto rounded bg-slate-950 p-3 text-[10px] text-cyan-50">{JSON.stringify(jobBResult, null, 2)}</pre></details>
            </section>}
          </div>
        )}
      </main>
    </Layout>
  );
}