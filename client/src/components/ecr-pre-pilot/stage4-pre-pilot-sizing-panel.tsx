import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

type UnknownRecord = Record<string, unknown>;
type Props = { designId: number | null };

const sourceKinds = ["MEASURED", "PUBLISHED", "PILOT", "ENGINEER_ASSUMPTION"] as const;
const rangeFields = [
  ["ntMin", "Nₜ minimum"], ["ntMax", "Nₜ maximum"],
  ["diameterMinM", "Diameter minimum [m]"], ["diameterMaxM", "Diameter maximum [m]"],
  ["rpmMin", "RPM minimum"], ["rpmMax", "RPM maximum"],
  ["pitchMinM", "Pitch minimum [m/compartment]"], ["pitchMaxM", "Pitch maximum [m/compartment]"],
] as const;

function object(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}
function text(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}
function number(value: unknown, unit = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}${unit ? ` ${unit}` : ""}` : "—";
}

function EmptyEvidence({ prefix, title }: { prefix: "performance" | "pitch"; title: string }) {
  return (
    <fieldset className="rounded border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-900">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[10px] font-medium">Evidence category
          <select name={`${prefix}.sourceKind`} defaultValue="" className="mt-1 block w-full rounded border p-1.5 text-xs" required>
            <option value="" disabled>Select evidence category</option>
            {sourceKinds.map(kind => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        {prefix === "performance" ? <>
          <label className="text-[10px] font-medium">Performance basis
            <select name="performance.basis" defaultValue="" className="mt-1 block w-full rounded border p-1.5 text-xs" required>
              <option value="" disabled>Select Eo or HETS</option>
              <option value="OVERALL_EFFICIENCY">Overall efficiency, Eo [fraction]</option>
              <option value="HETS">HETS [m/theoretical stage]</option>
            </select>
          </label>
          <label className="text-[10px] font-medium">Specified Eo or HETS value
            <input name="performance.value" inputMode="decimal" className="mt-1 block w-full rounded border p-1.5 text-xs" required />
          </label>
        </> : <label className="text-[10px] font-medium">Physical pitch [m/compartment]
          <input name="pitch.value" inputMode="decimal" className="mt-1 block w-full rounded border p-1.5 text-xs" required />
        </label>}
        <label className="text-[10px] font-medium">Source reference
          <input name={`${prefix}.sourceReference`} className="mt-1 block w-full rounded border p-1.5 text-xs" required />
        </label>
        <label className="text-[10px] font-medium">Citation / document locator
          <input name={`${prefix}.citation`} className="mt-1 block w-full rounded border p-1.5 text-xs" required />
        </label>
        <label className="text-[10px] font-medium sm:col-span-2">Provenance (where this value was obtained)
          <input name={`${prefix}.provenance`} className="mt-1 block w-full rounded border p-1.5 text-xs" required />
        </label>
        <label className="text-[10px] font-medium sm:col-span-2">Validity conditions / system applicability
          <input name={`${prefix}.validityConditions`} className="mt-1 block w-full rounded border p-1.5 text-xs" required />
        </label>
      </div>
      <p className="mt-3 text-[10px] font-semibold text-slate-700">Explicit applicability range — no default range is assumed</p>
      <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rangeFields.map(([field, label]) => <label key={field} className="text-[9px] text-slate-600">{label}
          <input name={`${prefix}.applicability.${field}`} inputMode="decimal" className="mt-1 block w-full rounded border p-1.5 text-xs" required />
        </label>)}
      </div>
    </fieldset>
  );
}

function formEvidence(form: HTMLFormElement) {
  const data = new FormData(form);
  const item = (prefix: "performance" | "pitch") => ({
    sourceKind: data.get(`${prefix}.sourceKind`),
    sourceReference: data.get(`${prefix}.sourceReference`),
    citation: data.get(`${prefix}.citation`),
    provenance: data.get(`${prefix}.provenance`),
    validityConditions: data.get(`${prefix}.validityConditions`),
    applicability: Object.fromEntries(rangeFields.map(([field]) => [
      field, Number(data.get(`${prefix}.applicability.${field}`)),
    ])),
  });
  const basis = String(data.get("performance.basis"));
  return {
    performance: {
      ...item("performance"), basis, value: Number(data.get("performance.value")),
      unit: basis === "OVERALL_EFFICIENCY" ? "FRACTION" : "M_PER_THEORETICAL_STAGE",
    },
    pitch: { ...item("pitch"), value: Number(data.get("pitch.value")), unit: "M_PER_COMPARTMENT" },
    review: {
      attested: data.get("review.attested") === "on",
      reviewer: data.get("review.reviewer"),
      attestation: data.get("review.attestation"),
    },
  };
}

function Result({ value }: { value: UnknownRecord }) {
  const nt = object(value.calculatedNt);
  const selected = object(value.selectedHydraulics);
  const sizing = object(value.physicalSizing);
  const evidence = object(value.evidence);
  const candidates = Array.isArray(value.hydraulicCandidates) ? value.hydraulicCandidates.map(object) : [];
  const equations = Array.isArray(sizing.equations) ? sizing.equations : [];
  const assumptions = Array.isArray(value.assumptions) ? value.assumptions : [];
  return <div className="space-y-3 border-t border-slate-200 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold text-slate-950">Server-owned sizing result</p>
      <span className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-950">{text(value.status)}</span>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {[
        ["Calculated Nₜ", `${number(nt.value)} theoretical stages`],
        ["Nₜ provenance", text(nt.provenance)],
        ["Physical compartments", number(sizing.physicalCompartments)],
        ["Installed active height", number(sizing.installedHeightM, "m")],
        ["Physical pitch", number(sizing.pitchM, "m/compartment")],
      ].map(([label, content]) => <div key={label} className="rounded border bg-slate-50 p-2"><p className="text-[9px] text-slate-500">{label}</p><p className="mt-1 break-words font-mono text-[10px]">{content}</p></div>)}
    </div>
    <section className="rounded border border-cyan-200 bg-cyan-50/40 p-3">
      <h3 className="text-xs font-semibold">Selected hydraulic point — hydraulic-only deterministic rule</h3>
      <p className="mt-1 text-[10px]">{text(selected.selectionRule)}</p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-6 text-[10px]">
        {[
          ["D", number(selected.diameterM, "m")], ["RPM", number(selected.rpm)],
          ["d32", number(selected.d32M, "m")], ["Operating φ", number(selected.operatingHoldup)],
          ["Flood φ", number(selected.floodHoldup)], ["φ margin", number(selected.holdupMargin)],
        ].map(([label, content]) => <div key={label} className="rounded border border-cyan-100 bg-white p-2"><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-mono">{content}</dd></div>)}
      </dl>
    </section>
    <section>
      <h3 className="text-xs font-semibold">Complete Stage-3 envelope recomputation</h3>
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[10px]"><thead className="bg-slate-800 text-white"><tr><th className="p-2">Ordinal</th><th className="p-2">Status</th><th className="p-2">D [m]</th><th className="p-2">RPM</th><th className="p-2">d32 [m]</th><th className="p-2">Operating / flood φ</th><th className="p-2">Constraint / reason</th></tr></thead><tbody>
        {candidates.map(candidate => <tr key={text(candidate.ordinal)} className="border-b"><td className="p-2">{text(candidate.ordinal)}</td><td className="p-2">{text(candidate.status)}</td><td className="p-2 font-mono">{number(candidate.diameterM)}</td><td className="p-2 font-mono">{number(candidate.rpm)}</td><td className="p-2 font-mono">{number(candidate.d32M)}</td><td className="p-2 font-mono">{number(candidate.operatingHoldup)} / {number(candidate.floodHoldup)}</td><td className="p-2">{text(candidate.reason, text(candidate.sourceApplicability, "—"))}</td></tr>)}
      </tbody></table></div>
    </section>
    <section className="grid gap-3 lg:grid-cols-2">
      <div className="rounded border p-3"><h3 className="text-xs font-semibold">Evidence and review retained</h3><pre className="mt-2 max-h-52 overflow-auto rounded bg-slate-950 p-2 text-[9px] text-slate-100">{JSON.stringify(evidence, null, 2)}</pre></div>
      <div className="rounded border p-3"><h3 className="text-xs font-semibold">Equations, units, and interpretation</h3><ul className="mt-2 list-disc space-y-1 pl-4 text-[10px]">{equations.map(item => <li key={String(item)}>{String(item)}</li>)}</ul><p className="mt-2 text-[10px]">Specified efficiency: {number(sizing.specifiedOverallEfficiency)}. Specified HETS: {number(sizing.specifiedHetsM, "m/theoretical stage")}.</p><p className="mt-1 text-[10px]">{text(sizing.installedOverallStageCountRatioLabel)}</p></div>
    </section>
    <ul className="list-disc space-y-1 pl-4 text-[10px] text-slate-700">{assumptions.map(item => <li key={String(item)}>{String(item)}</li>)}</ul>
  </div>;
}

export default function Stage4PrePilotSizingPanel({ designId }: Props) {
  const [result, setResult] = useState<UnknownRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (!designId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/ecr-pre-pilot/designs/${designId}/stage4/pre-pilot-sizing/latest`, { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 404) { setResult(null); setMessage(null); return; }
      if (!response.ok) throw new Error(text(object(payload).error, "Sizing result could not be loaded."));
      setResult(object(payload)); setMessage(null);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Sizing result could not be loaded."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [designId]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!designId) return;
    setLoading(true); setMessage(null);
    try {
      const response = await fetch(`/api/ecr-pre-pilot/designs/${designId}/stage4/pre-pilot-sizing/evaluate`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formEvidence(event.currentTarget)),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(text(object(payload).error, "Pre-pilot sizing could not be calculated."));
      setResult(object(payload));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Pre-pilot sizing could not be calculated."); }
    finally { setLoading(false); }
  };
  return <section data-testid="stage4-pre-pilot-sizing" className="overflow-hidden rounded-md border-2 border-cyan-800 bg-white">
    <header className="border-b border-cyan-200 bg-cyan-50 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-900">PRE-PILOT PREDICTIVE — NOT FINAL DESIGN</p>
      <h2 className="mt-1 text-sm font-semibold text-slate-950">Stage 4 physical sizing from reviewed Eo/HETS and pitch evidence</h2>
      <p className="mt-1 text-[10px] leading-4 text-slate-700">Flow: calculated same-lineage Stage-2 Nₜ → full Stage-3 hydraulic-envelope recomputation/selection → supplied evidence → physical sizing. Job C and future λ=1 work are separate diagnostics, not a prerequisite and never run here.</p>
    </header>
    {message && <div role="alert" className="m-3 flex gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-950"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{message}</span></div>}
    {result ? <Result value={result} /> : <form onSubmit={submit} className="space-y-3 p-3">
      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-[10px] text-amber-950"><p className="font-semibold">Action required — no supported Eo/HETS model or physical pitch is stored in the current inventory.</p><p className="mt-1">Enter traceable evidence below. An arbitrary number does not create a supported model. Measured, published/pilot, and engineer-assumption bases remain explicitly distinct.</p></div>
      <EmptyEvidence prefix="performance" title="Supported overall efficiency (Eo) OR HETS evidence" />
      <EmptyEvidence prefix="pitch" title="Physical compartment-pitch evidence" />
      <fieldset className="rounded border border-slate-200 p-3"><legend className="px-1 text-xs font-semibold">Explicit review attestation</legend><div className="grid gap-2 sm:grid-cols-2"><label className="text-[10px]">Reviewer / accountable engineer<input name="review.reviewer" className="mt-1 block w-full rounded border p-1.5 text-xs" required /></label><label className="text-[10px]">Attestation of adopted source and validity conditions<input name="review.attestation" className="mt-1 block w-full rounded border p-1.5 text-xs" required /></label></div><label className="mt-2 flex items-start gap-2 text-[10px]"><input name="review.attested" type="checkbox" required className="mt-0.5" />I attest that the cited measured, published/pilot, or explicitly labelled engineering-assumption basis has been reviewed for the stated system and applicability ranges.</label></fieldset>
      <button type="submit" disabled={!designId || loading} className="inline-flex items-center gap-2 rounded bg-cyan-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{loading ? "Server calculating…" : "Calculate pre-pilot physical sizing"}</button>
    </form>}
  </section>;
}