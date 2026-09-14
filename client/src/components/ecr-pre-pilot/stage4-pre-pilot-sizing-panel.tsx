import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

type RecordValue = Record<string, unknown>;
type Props = { designId: number | null };
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => value === null || value === undefined || value === "" ? "—" : String(value);
const number = (value: unknown, unit = "") =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}${unit ? ` ${unit}` : ""}` : "—";

export default function Stage4PrePilotSizingPanel({ designId }: Props) {
  const [result, setResult] = useState<RecordValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!designId) return;
    let active = true;
    setResult(null);
    setError(null);
    setLoading(true);
    void fetch(`/api/ecr-pre-pilot/designs/${designId}/stage4/pre-pilot-sizing/latest`, { credentials: "include" })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(text(record(payload).error));
        if (active) { setResult(record(payload)); setError(null); }
      })
      .catch(cause => active && setError(cause instanceof Error ? cause.message : "Stage 4 projection could not be loaded."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [designId]);

  const outputs = record(result?.mainOutputs);
  const nt = record(result?.calculatedNt);
  const hydraulic = record(result?.selectedStage3Hydraulics);
  const efficiency = record(result?.overallEfficiency);
  const geometry = record(result?.physicalGeometry);
  const jobA = record(result?.jobAProvenance);
  const audit = record(result?.mixingAudit);
  const area = record(audit.interfacialArea);
  const mixingInputs = record(audit.inputs);
  const continuous = record(audit.continuousMixing);
  const dispersed = record(audit.dispersedMixing);
  const peclet = record(audit.peclet);
  const applicability = record(audit.applicability);
  const sensitivity = record(audit.sensitivity);
  const blockers = Array.isArray(audit.blockers) ? audit.blockers.map(record) : [];
  const assumptions = Array.isArray(result?.assumptions) ? result.assumptions : [];
  return <section data-testid="stage4-pre-pilot-sizing" className="overflow-hidden rounded-md border-2 border-cyan-800 bg-white">
    <header className="border-b border-cyan-200 bg-cyan-50 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-900">PRE-PILOT PREDICTIVE / SCREENING — NOT FINAL DESIGN</p>
      <h2 className="mt-1 text-sm font-semibold text-slate-950">Stage 4 physical-sizing projection</h2>
      <p className="mt-1 text-[10px] leading-4 text-slate-700">Carries forward the persisted Stage-3 hydraulic point. It does not reselect hydraulic candidates, accept manual Eo/HETS, treat FV cells as physical compartments, or launch Job A/B/C.</p>
    </header>
    {loading && <p className="flex items-center gap-2 p-3 text-[10px] text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading governed Stage-2/Stage-3 projection…</p>}
    {error && <div role="alert" className="m-3 flex gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-950"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{error}</span></div>}
    {result && <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">Live server-owned result</p><span className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-950">{text(result.status)}</span></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Selected Stage-3 diameter", number(outputs.diameterM, "m")],
          ["Calculated overall efficiency", number(outputs.overallEfficiency)],
          ["Physical compartments", number(outputs.physicalCompartments)],
          ["Active height", number(outputs.activeHeightM, "m")],
        ].map(([label, value]) => <div key={label} className="rounded border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 font-mono text-sm font-semibold text-slate-950">{value}</p></div>)}
      </div>
      <section className="rounded border border-cyan-200 bg-cyan-50/40 p-3">
        <h3 className="text-xs font-semibold">Carried-forward Stage-3 hydraulic point</h3>
        <p className="mt-1 text-[10px]">{text(hydraulic.source)}</p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-[10px]">
          {[["RPM", number(hydraulic.rpm)], ["d32", number(hydraulic.d32M, "m")], ["Operating φ", number(hydraulic.operatingHoldup)], ["Flood φ", number(hydraulic.floodHoldup)], ["φ margin", number(hydraulic.holdupMargin)]].map(([label, value]) => <div key={label} className="rounded border border-cyan-100 bg-white p-2"><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-mono">{value}</dd></div>)}
        </dl>
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded border p-3"><h3 className="text-xs font-semibold">Calculated Nₜ authority</h3><p className="mt-2 text-[10px]">{number(nt.value)} theoretical stages · {text(nt.provenance)}</p><p className="mt-1 break-all font-mono text-[9px] text-slate-600">Stage-2 job: {text(nt.stage2JobId)}</p></div>
        <div className="rounded border p-3"><h3 className="text-xs font-semibold">Physical geometry</h3><p className="mt-2 text-[10px]">Pitch: {number(geometry.pitchM, "m/compartment")}</p><p className="mt-1 text-[10px]">{text(geometry.pitchAssumption)}</p></div>
      </section>
      {result.mixingAudit != null && <section data-testid="stage4-mixing-audit" className="space-y-3 rounded border border-cyan-200 p-3 text-[10px]">
        <h3 className="text-xs font-semibold">Calculation audit — supported values and remaining inputs</h3>
        <p>Partial calculation only. No transfer solution or physical sizing is claimed.</p>
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Interfacial area a = 6φ/d₃₂", number(area.value, "m²/m³")],
            ["Rotor diameter", number(mixingInputs.rotorDiameterM, "m")],
            ["Continuous superficial velocity", number(mixingInputs.continuousSuperficialVelocityMS, "m/s")],
            ["Dispersed superficial velocity", number(mixingInputs.dispersedSuperficialVelocityMS, "m/s")],
            ["Continuous E_c", number(continuous.value, "m²/s")],
            ["Dispersed E_d (screening assumption)", number(dispersed.value, "m²/s")],
            ["Pe_c (superficial basis)", number(record(peclet.continuous).value)],
            ["Pe_d, E_d = 0 limit", "∞ for positive height and flow; height not solved"],
          ].map(([label, value]) => <div key={label} className="rounded bg-slate-50 p-2"><dt className="text-slate-600">{label}</dt><dd className="mt-1 font-mono">{value}</dd></div>)}
        </dl>
        <p>{text(area.source)} · {text(area.basis)}</p>
        <p><strong>Selected axial-mixing correlation:</strong> {continuous.selectedCorrelation ? text(continuous.selectedCorrelation) : "None admitted yet"}. Candidate: {text(continuous.candidate)}.</p>
        <p>{text(dispersed.warning)} Source: {text(dispersed.source)}.</p>
        <p><strong>Steiner cross-check:</strong> {text(record(audit.steinerCrossCheck).status)} — {text(record(audit.steinerCrossCheck).detail)}</p>
        <p><strong>With/without dispersed backmixing:</strong> {text(sensitivity.status)}. {text(sensitivity.detail)}</p>
        <p><strong>Applicability:</strong> {text(applicability.extrapolationAssessment)}. {text(applicability.referenceStudy)}</p>
        <ul className="list-disc pl-4">{(Array.isArray(applicability.warnings) ? applicability.warnings : []).map(warning => <li key={String(warning)}>{text(warning)}</li>)}</ul>
        <details><summary className="cursor-pointer font-semibold">Equations and units</summary>
          <p className="mt-2">a = 6φ/d₃₂; φ is operating dispersed-volume fraction; d₃₂ is in m. N = RPM/60 in s⁻¹ (unit conversion only; the candidate correlation’s N convention is unverified). V̄_c = V_c/(1−φ) is reported separately, not substituted into the Peclet formula.</p>
          <p>Pe_c = H V_c/E_c; Pe_d = H V_d/E_d. H in m; superficial V in m/s; E in m²/s. Source: {text(peclet.source)}.</p>
          <p>h_c = 0.5D (preliminary); H = N_physical × h_c. N_physical must come from the transfer-model search, then η_overall = Nₜ/N_physical. No assumed efficiency is used.</p>
        </details>
      </section>}
      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-[10px] text-amber-950">
        <p className="font-semibold">Physical-sizing dependencies: {text(efficiency.status)}</p>
        {blockers.length ? <ul className="mt-2 space-y-2">{blockers.map(blocker => <li key={text(blocker.code)}><strong>{text(blocker.code)}</strong><p>{Array.isArray(blocker.parameters) ? blocker.parameters.join(", ") : ""}</p><p>{text(blocker.detail)}</p></li>)}</ul> : <p className="mt-1">{text(efficiency.dependency)}</p>}
        <p className="mt-2">{text(record(audit.transferSolution).detail)}</p>
      </div>
      <p className="text-[10px] text-slate-600">Job-A provenance: {text(jobA.status)} — {text(jobA.reason)}</p>
      <ul className="list-disc space-y-1 pl-4 text-[10px] text-slate-700">{assumptions.map(item => <li key={String(item)}>{String(item)}</li>)}</ul>
    </div>}
  </section>;
}