import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

type RecordValue = Record<string, unknown>;
type Props = { designId: number | null };

const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);
const number = (value: unknown, unit = "") =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}${unit ? ` ${unit}` : ""}`
    : "—";
const booleanStatus = (value: unknown) =>
  value === true ? "PASS" : value === false ? "NOT COMPLIANT" : "NOT RETURNED";
const materialityBoolean = (value: unknown, negative: string) =>
  value === true ? "YES" : value === false ? negative : "NOT RETURNED";

const COMPONENT_ORDER = ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"];
const SCREENING_NOTICE =
  "PRE-PILOT PREDICTIVE / SCREENING — REQUIRES PILOT VALIDATION BEFORE FINAL DESIGN";

function CaseValue({
  value,
  unit,
}: {
  value: unknown;
  unit?: string;
}) {
  return <span className="font-mono">{number(value, unit)}</span>;
}

export default function Stage4PrePilotSizingPanel({ designId }: Props) {
  const [result, setResult] = useState<RecordValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!designId) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setResult(null);
    setError(null);
    setLoading(true);
    void fetch(`/api/ecr-pre-pilot/designs/${designId}/stage4/pre-pilot-sizing/latest`, {
      credentials: "include",
    })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = text(record(payload).error ?? record(payload).message);
          throw new Error(
            message === "—"
              ? `Stage 4 predictive screening request failed (${response.status}).`
              : message,
          );
        }
        if (active) {
          setResult(record(payload));
          setError(null);
        }
      })
      .catch(cause => {
        if (!active) return;
        setResult(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Stage 4 predictive screening could not be loaded.",
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [designId]);

  const outputs = record(result?.mainOutputs);
  const nt = record(result?.calculatedNt);
  const hydraulic = record(result?.selectedStage3Hydraulics);
  const efficiency = record(result?.overallEfficiency);
  const geometry = record(result?.physicalGeometry);
  const audit = record(result?.mixingAudit);
  const physicalSizing = record(result?.physicalSizing);
  const primary = record(physicalSizing.primary);
  const sensitivity = record(physicalSizing.sensitivity);
  const primaryDispersion = record(primary.dispersion);
  const sensitivityDispersion = record(sensitivity.dispersion);
  const primarySelected = record(primary.selected);
  const sensitivitySelected = record(sensitivity.selected);
  const materiality = record(physicalSizing.materiality);
  const physicalBlockers = list(physicalSizing.blockers);
  const mixingInputs = record(audit.inputs);
  const continuous = record(audit.continuousMixing);
  const dispersed = record(audit.dispersedMixing);
  const peclet = record(audit.peclet);
  const applicability = record(audit.applicability);
  const blockers = list(audit.blockers).map(record);
  const assumptions = list(result?.assumptions);
  const hasPhysicalSizing = Object.keys(physicalSizing).length > 0;
  const physicalSizingStatus = text(physicalSizing.status ?? result?.status);
  const physicalSizingBlocked = hasPhysicalSizing && (
    physicalSizingStatus.includes("BLOCKED") || physicalBlockers.length > 0
  );
  const robustnessAssessment = materiality.classification === "NOT_COMPARABLE_PHYSICAL_SOLVES_NOT_AVAILABLE"
    ? "NOT ASSESSED"
    : materiality.robustToKhCoefficientSensitivity === true
      ? "ROBUST"
      : materiality.robustToKhCoefficientSensitivity === false
        ? "NOT ROBUST"
        : "NOT RETURNED";
  const primaryMetrics = list(record(primarySelected.targetCompliance).metrics).map(record);
  const predictedOutlet = Array.isArray(primarySelected.oilRaffinateOutletMolarFlowMolS)
    ? primarySelected.oilRaffinateOutletMolarFlowMolS
    : [];

  const cases = [
    {
      key: "primary",
      label: "Primary screen",
      coefficient: "0.0126",
      role: "Coded primary",
      dispersion: primaryDispersion,
      peclet: primary.continuousPecletPerPhysicalCompartment,
      selected: primarySelected,
      searchTermination: primary.searchTermination,
      targetCompliance: record(primarySelected.targetCompliance),
    },
    {
      key: "sensitivity",
      label: "Coefficient sensitivity",
      coefficient: "0.0105",
      role: "Reported in 2017 supporting reference",
      dispersion: sensitivityDispersion,
      peclet: sensitivity.continuousPecletPerPhysicalCompartment,
      selected: sensitivitySelected,
      searchTermination: sensitivity.searchTermination,
      targetCompliance: record(sensitivitySelected.targetCompliance),
    },
  ];

  const renderAudit = () => {
    if (result?.mixingAudit == null) return null;
    const area = record(audit.interfacialArea);
    const transferSolution = record(audit.transferSolution);
    return (
      <section
        data-testid="stage4-mixing-audit"
        className="space-y-3 rounded border border-cyan-200 p-3 text-[10px]"
      >
        <h3 className="text-xs font-semibold">Screening calculation audit</h3>
        <p>
          {physicalSizingBlocked
            ? "The physical sizing solve was not started. Ec and Pe_c remain numeric screening inputs only."
            : hasPhysicalSizing
              ? text(transferSolution.detail)
              : "No transfer solution or physical sizing is claimed."}
        </p>
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Interfacial area a = 6φ/d₃₂", number(area.value, "m²/m³")],
            ["Rotor diameter", number(mixingInputs.rotorDiameterM, "m")],
            ["Continuous superficial velocity", number(mixingInputs.continuousSuperficialVelocityMS, "m/s")],
            ["Dispersed superficial velocity", number(mixingInputs.dispersedSuperficialVelocityMS, "m/s")],
            ["Continuous Ec", number(continuous.value, "m²/s")],
            ["Dispersed E_d (screening assumption)", number(dispersed.value, "m²/s")],
            ["Pe_c (superficial basis)", number(record(peclet.continuous).value)],
            ["Pe_d, Ed = 0 limit", "∞ for positive height and flow"],
          ].map(([label, value]) => (
            <div key={label} className="rounded bg-slate-50 p-2">
              <dt className="text-slate-600">{label}</dt>
              <dd className="mt-1 font-mono">{value}</dd>
            </div>
          ))}
        </dl>
        <p>{text(area.source)} · {text(area.basis)}</p>
        <p>
          <strong>Selected axial-mixing correlation:</strong>{" "}
          {continuous.selectedCorrelation
            ? text(continuous.selectedCorrelation)
            : "None admitted yet"}
          . Candidate: {text(continuous.candidate)}.
        </p>
        <p>{text(dispersed.warning)} Source: {text(dispersed.source)}.</p>
        <p>
          <strong>Steiner cross-check:</strong>{" "}
          {text(record(audit.steinerCrossCheck).status)} —{" "}
          {text(record(audit.steinerCrossCheck).detail)}
        </p>
        <p>
          <strong>Applicability:</strong>{" "}
          {text(applicability.extrapolationAssessment)}.{" "}
          {text(applicability.referenceStudy)}
        </p>
        <ul className="list-disc pl-4">
          {list(applicability.warnings).map(warning => (
            <li key={String(warning)}>{text(warning)}</li>
          ))}
        </ul>
        <details>
          <summary className="cursor-pointer font-semibold">Equations and notation boundaries</summary>
          <div className="mt-2 space-y-1">
            <p>
              Engineer-authorized Kumar–Hartland screening equation; this is not a
              claimed exact transcription of a published 2017 equation.{" "}
              {text(continuous.equation)}
            </p>
            <p>
              The coded primary coefficient is c=.0126. The c=.0105 case is a
              sensitivity reported in Asadollahzadeh (2017), which is supporting
              reference context only, not source authority.
            </p>
            <p>
              Barred V and trailing undefined e are not used. Vc and Vd remain
              the persisted superficial velocities; interstitial velocity is not
              substituted into Peclet.
            </p>
            <p>
              Pe_c = H Vc / Ec; Pe_d = H Vd / Ed. Ed = 0 is an explicit
              dispersed-phase screening assumption, so the positive-height
              dispersed Peclet is an infinite zero-dispersion limit, not a
              solved finite value.
            </p>
            <p>
              Physical compartment pitch is the backend screening assumption
              hc = 0.5D. Numerical iteration resolution is not a physical count.
            </p>
          </div>
        </details>
      </section>
    );
  };

  return (
    <section
      data-testid="stage4-pre-pilot-sizing"
      className="overflow-hidden rounded-md border-2 border-cyan-800 bg-white"
    >
      <header className="border-b border-cyan-200 bg-cyan-50 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-900">
          {SCREENING_NOTICE}
        </p>
        <h2 className="mt-1 text-sm font-semibold text-slate-950">
          Stage 4 predictive physical sizing
        </h2>
        <p className="mt-1 text-[10px] leading-4 text-slate-700">
          Server-owned Ec → Pec → conserved physical-compartment screening.
          The persisted Stage-3 hydraulic point and accepted Stage-2 Nₜ are
          carried forward; no hydraulic candidate is reselected in this panel.
        </p>
      </header>

      {loading && (
        <p className="flex items-center gap-2 p-3 text-[10px] text-slate-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading governed predictive physical sizing…
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="m-3 flex gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-950"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Stage 4 predictive screening is blocked or failed; no physical
            count, height, or efficiency is presented. {error}
          </span>
        </div>
      )}

      {result && (
        <div className="space-y-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold">Live server-owned screening result</p>
            <span className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-950">
              {text(result.status)}
            </span>
          </div>

          <div className="rounded border-2 border-amber-400 bg-amber-50 p-3 text-[10px] font-semibold text-amber-950">
            {text(result.screeningNotice) === "—" ? SCREENING_NOTICE : text(result.screeningNotice)}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Persisted diameter", <CaseValue value={outputs.diameterM} unit="m" />],
              ["Primary physical count", <CaseValue value={outputs.physicalCompartments} />],
              ["Primary active height", <CaseValue value={outputs.activeHeightM} unit="m" />],
              ["Primary overall efficiency", <CaseValue value={outputs.overallEfficiency} />],
              ["Stage-2 accepted Nₜ", <CaseValue value={nt.value} />],
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </div>

          <section className="rounded border border-cyan-200 bg-cyan-50/40 p-3">
            <h3 className="text-xs font-semibold">Persisted Stage-3 hydraulic input</h3>
            <p className="mt-1 text-[10px]">{text(hydraulic.source)}</p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[10px]">
              {[
                ["Column diameter D", number(hydraulic.diameterM ?? outputs.diameterM, "m")],
                ["Rotor diameter DR", number(hydraulic.rotorDiameterM ?? mixingInputs.rotorDiameterM, "m")],
                ["RPM", number(hydraulic.rpm)],
                ["d₃₂", number(hydraulic.d32M, "m")],
                ["Operating holdup φ", number(hydraulic.operatingHoldup)],
                ["Flood holdup", number(hydraulic.floodHoldup)],
                ["Holdup margin", number(hydraulic.holdupMargin)],
                ["Continuous superficial Vc", number(hydraulic.continuousSuperficialVelocityMS ?? mixingInputs.continuousSuperficialVelocityMS, "m/s")],
                ["Dispersed superficial Vd", number(hydraulic.dispersedSuperficialVelocityMS ?? mixingInputs.dispersedSuperficialVelocityMS, "m/s")],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-cyan-100 bg-white p-2">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="mt-1 font-mono">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded border border-slate-300 p-3">
            <h3 className="text-xs font-semibold">
              Ec → Pec → physical count / height / overall efficiency
            </h3>
            <p className="mt-1 text-[10px] text-slate-700">
              Ec and Pec are returned by the backend for each coefficient case.
              Physical count is the first target-compliant conserved solve;
              ηoverall is returned as accepted Stage-2 Nₜ / physical count.
              No client-side solve or robustness calculation is performed.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table
                data-testid="stage4-predictive-sensitivity-table"
                className="w-full min-w-[850px] border-collapse text-left text-[10px]"
              >
                <thead>
                  <tr className="border-b bg-slate-50">
                    {["Case", "Ec [m²/s]", "Pe_c / compartment", "Physical count", "Active H [m]", "ηoverall", "Target compliance", "Search termination"].map(label => (
                      <th key={label} className="p-2 font-semibold">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cases.map(item => (
                    <tr key={item.key} className="border-b align-top">
                      <td className="p-2">
                        <strong>{item.label}</strong>
                        <p>c={item.coefficient}</p>
                        <p className="text-slate-500">{item.role}</p>
                      </td>
                      <td className="p-2 font-mono">{number(item.dispersion.valueM2S, "m²/s")}</td>
                      <td className="p-2 font-mono">{number(item.peclet)}</td>
                      <td className="p-2 font-mono">{number(item.selected.physicalCompartments)}</td>
                      <td className="p-2 font-mono">{number(item.selected.activeHeightM, "m")}</td>
                      <td className="p-2 font-mono">{number(item.selected.overallEfficiency)}</td>
                      <td className="p-2">
                        {physicalSizingBlocked
                          ? "NOT ASSESSED — SOLVE NOT STARTED"
                          : booleanStatus(item.targetCompliance.allEvaluatedTargetsPassed)}
                      </td>
                      <td className="p-2">{text(item.searchTermination)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-slate-600">
              Dispersed Peclet: {text(record(primary.dispersedPecletPerPhysicalCompartment).status)}.
              Ed = 0 screening assumption; no finite dispersed Peclet is asserted.
            </p>
          </section>

          {physicalBlockers.length > 0 && (
            <section
              data-testid="stage4-physical-sizing-blockers"
              className="rounded border-2 border-amber-400 bg-amber-50 p-3 text-[10px] text-amber-950"
            >
              <h3 className="text-xs font-semibold">Physical-sizing implementation blockers</h3>
              <p className="mt-1">
                The backend has calculated the Ec sensitivity, but has not
                executed a physical-compartment solve. These are missing
                implementation closures, not missing source records, pilot
                prerequisites, or a failed target-compliance search.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {physicalBlockers.map(blocker => (
                  <li key={text(blocker)}>{text(blocker)}</li>
                ))}
              </ul>
              <p className="mt-2 font-semibold">
                Physical count, active height, overall efficiency, outlet, and
                robustness are therefore not assessed.
              </p>
            </section>
          )}

          <section className="grid gap-3 lg:grid-cols-2">
            <div
              data-testid="stage4-predicted-outlet"
              className="rounded border border-slate-200 p-3"
            >
              <h3 className="text-xs font-semibold">Predicted primary raffinate outlet</h3>
              <p className="mt-1 text-[10px] text-slate-600">
                Server-returned oilRaffinateOutletMolarFlowMolS from the primary
                target-compliant physical solve; no Stage-2 outlet is relabelled.
              </p>
              {predictedOutlet.length ? (
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                  {COMPONENT_ORDER.map((component, index) => (
                    <div key={component} className="rounded bg-slate-50 p-2">
                      <dt className="text-slate-500">{component} [mol/s]</dt>
                      <dd className="mt-1 font-mono">{number(predictedOutlet[index])}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-[10px] text-amber-900">
                  {physicalSizingBlocked
                    ? "No predicted outlet is available because the physical sizing solve was not started."
                    : "No predicted outlet is available because the primary solve did not return a target-compliant physical count."}
                </p>
              )}
              <p className="mt-2 text-[10px]">
                Primary target compliance:{" "}
                {booleanStatus(record(primarySelected.targetCompliance).allEvaluatedTargetsPassed)}
              </p>
            </div>
            <div className="rounded border border-slate-200 p-3">
              <h3 className="text-xs font-semibold">Primary target metrics</h3>
              {primaryMetrics.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-[10px]">
                    <thead>
                      <tr className="border-b">
                        <th className="p-1">Metric</th>
                        <th className="p-1">Actual</th>
                        <th className="p-1">Target</th>
                        <th className="p-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {primaryMetrics.map(metric => (
                        <tr key={text(metric.name)} className="border-b">
                          <td className="p-1">{text(metric.name)}</td>
                          <td className="p-1 font-mono">{number(metric.actual)}</td>
                          <td className="p-1 font-mono">{number(metric.target)}</td>
                          <td className="p-1">{text(metric.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-amber-900">
                  No primary target metrics were returned.
                </p>
              )}
            </div>
          </section>

          <section className="rounded border border-violet-200 bg-violet-50/40 p-3 text-[10px]">
            <h3 className="text-xs font-semibold">Kumar–Hartland coefficient sensitivity and robustness</h3>
            <p className="mt-1">
              c=.0126 is the coded primary case; c=.0105 is a sensitivity
              reported in 2017. Ec proximity alone is not a robustness
              criterion.
            </p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Materiality threshold", materiality.threshold],
                ["Ec relative change", materiality.ecRelativeDifference],
                ["Active-height relative change", materiality.heightRelativeDifference],
                ["Efficiency relative change", materiality.efficiencyRelativeDifference],
                ["Comparable cases", materialityBoolean(materiality.comparable, "NO")],
                ["Backend robustness", robustnessAssessment],
                ["Backend classification", materiality.classification],
                ["Backend note", materiality.note],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-violet-100 bg-white p-2">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="mt-1 font-mono">{typeof value === "boolean" ? booleanStatus(value) : text(value)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 font-semibold">
              Robustness is displayed only from the backend materiality result;
              it is not inferred by this UI.
            </p>
          </section>

          {renderAudit()}

          <section className="rounded border border-amber-300 bg-amber-50 p-3 text-[10px] text-amber-950">
            <p className="font-semibold">
              Physical-sizing status: {physicalSizingStatus}
            </p>
            {hasPhysicalSizing && !primarySelected.physicalCompartments && (
              <p className="mt-1">
                {physicalSizingBlocked
                  ? "Physical sizing was not started because the implementation closure is blocked."
                  : "Primary physical sizing did not return a target-compliant count."}{" "}
                {physicalSizingBlocked
                  ? ""
                  : `Search termination: ${text(primary.searchTermination)}. Attempted counts: ${number(list(primary.attemptedPhysicalCompartments).length)}. Nonconverged counts: ${number(list(primary.nonconvergedPhysicalCounts).length)}.`}
              </p>
            )}
            {blockers.length ? (
              <ul className="mt-2 space-y-2">
                {blockers.map(blocker => (
                  <li key={text(blocker.code)}>
                    <strong>{text(blocker.code)}</strong>
                    <p>{list(blocker.parameters).join(", ")}</p>
                    <p>{text(blocker.detail)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1">{text(efficiency.dependency)}</p>
            )}
          </section>

          <section className="rounded border border-slate-200 p-3 text-[10px]">
            <h3 className="text-xs font-semibold">Authority and screening assumptions</h3>
            <p className="mt-1">
              Accepted Stage-2 Nₜ: {number(nt.value)} · {text(nt.provenance)} ·
              no fallback stage count is applied.
            </p>
            <p className="mt-1">
              Physical pitch: {number(geometry.pitchM, "m/compartment")} ·{" "}
              {text(geometry.pitchAssumption)}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-700">
              {assumptions.map(item => <li key={String(item)}>{String(item)}</li>)}
            </ul>
          </section>
        </div>
      )}
    </section>
  );
}