import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Play, RefreshCw } from "lucide-react";
import Stage4InterfaceFailureDiagnostics, {
  type Stage4InterfaceFailureCase,
} from "./stage4-interface-failure-diagnostics";
import Stage4TrialProgress, { Stage4FailureReason, Stage4SolverTelemetry } from "./stage4-trial-progress";
import "./stage4-progress.css";

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

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const STAGE4_RUN_STATES = new Set(["queued", "pending", "running", "in_progress", "in-progress"]);
const STAGE4_RETRY_STATES = new Set(["NUMERICAL_FAILURE", "INTERRUPTED"]);
const STAGE4_TERMINAL_STATES = new Set([
  "CALCULATED",
  "CALCULATED_HETS_PRE_PILOT_SCREENING",
  "CALCULATED_COMPARTMENT_EFFICIENCY_PRE_PILOT_SIZING",
  "TARGET_FAILURE",
  "NUMERICAL_FAILURE",
  "INTERRUPTED",
]);

function runState(value: unknown): string {
  const candidate = value && typeof value === "object"
    ? record(value).state ?? record(value).status
    : value;
  if (candidate && typeof candidate === "object") return runState(candidate);
  return typeof candidate === "string" ? candidate.toLowerCase() : "";
}

function isRunActive(value: unknown): boolean {
  return STAGE4_RUN_STATES.has(runState(value));
}

function statusText(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase() : "";
}

function responseStatus(value: unknown): string {
  const source = record(value);
  const candidate = source.status ?? source.state;
  if (candidate && typeof candidate === "object") return responseStatus(candidate);
  return statusText(candidate);
}

function hasStaleLineage(value: unknown): boolean {
  const source = record(value);
  if (source.stale === true || source.isStale === true
    || source.lineageValid === false || source.lineageMatchesCurrent === false
    || record(source.lineage).stale === true || record(source.lineage).valid === false) {
    return true;
  }
  const candidates = [
    source.status,
    source.state,
    source.lineageStatus,
    source.lineageState,
    record(source.lineage).status,
    record(source.lineage).state,
    source.error,
  ]
    .filter(value => value !== undefined && value !== null)
    .map(value => String(value).toUpperCase());
  return candidates.some(value =>
    value.includes("STALE_LINEAGE")
    || value.includes("STALE_OR_INVALID_LINEAGE")
    || value.includes("LINEAGE_MISMATCH")
    || value.includes("LINEAGE_INVALID"),
  );
}

function numericalOutcome(
  result: RecordValue | null,
  physicalSizing: RecordValue,
  physicalSizingBlocked: boolean,
): "NOT RUN" | "CALCULATING" | "NUMERICAL UNRESOLVED" | "TARGET NOT MET" | "CALCULATED" {
  if (!result) return "NOT RUN";
  const status = statusText(result.status ?? physicalSizing.status);
  if (status === "UNRUN") return "NOT RUN";
  if (status === "RUNNING") return "CALCULATING";
  if (physicalSizingBlocked || status.includes("UNRESOLVED") || status.includes("DEPENDENCY_BLOCKED")
    || status.includes("NOT_STARTED") || status.includes("BLOCKED")
    || status === "NUMERICAL_FAILURE" || status === "INTERRUPTED") {
    return "NUMERICAL UNRESOLVED";
  }
  if (status.includes("NO_TARGET") || status.includes("TARGET_NOT_MET")
    || status.includes("TARGET_FAILURE")) return "TARGET NOT MET";
  const primary = record(record(physicalSizing.primary).selected);
  return isFiniteNumber(primary.physicalCompartments) || status.includes("CALCULATED")
    ? "CALCULATED"
    : "NUMERICAL UNRESOLVED";
}

function activeHeightPec(caseValue: RecordValue): unknown {
  const selected = record(caseValue.selected);
  return caseValue.activeHeightPeclet
    ?? caseValue.continuousPecletAtActiveHeight
    ?? caseValue.continuousPecletForActiveHeight
    ?? selected.activeHeightPeclet
    ?? selected.continuousPecletAtActiveHeight
    ?? selected.continuousColumnPeclet
    ?? caseValue.peclet
    ?? caseValue.continuousPecletPerPhysicalCompartment;
}

function progressRows(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.map(record);
  const progress = record(value);
  const counts = progress.perCount ?? progress.byCount ?? progress.counts
    ?? progress.trials ?? progress.physicalCountOutcomes;
  if (Array.isArray(counts)) return counts.map(record);
  return [];
}

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
  const [submitting, setSubmitting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [run, setRun] = useState<RecordValue | null>(null);
  const requestInFlight = useRef(false);
  const pollingTimer = useRef<number | null>(null);
  const mounted = useRef(true);

  const basePath = designId
    ? `/api/ecr-pre-pilot/designs/${designId}/stage4/pre-pilot-sizing`
    : null;

  const clearPolling = useCallback(() => {
    if (pollingTimer.current !== null) {
      window.clearTimeout(pollingTimer.current);
      pollingTimer.current = null;
    }
  }, []);

  const applyPayload = useCallback((next: RecordValue) => {
    // A current lineage with no persisted HETS result is intentionally a
    // pre-calculation state, not an incomplete finite-rate screen.
    // Keep the explicit optimizer-required state visible: it carries the
    // historical-record warning and leaves Calculate Stage 4 actionable.
    if (
      responseStatus(next) === "UNRUN"
      && next.currentOptimizerRequired !== true
      && next.historicalCalculationOnly !== true
    ) {
      setRun(null);
      setResult(null);
      return;
    }
    const nextRun = record(next.run ?? next.state ?? next.job);
    setRun(Object.keys(nextRun).length ? nextRun : next);
    if (next.result && typeof next.result === "object") setResult(record(next.result));
    else if (next.mainOutputs || next.physicalSizing) setResult(next);
  }, []);

  const loadLatest = useCallback(async (poll = false): Promise<RecordValue | null> => {
    if (!basePath) return null;
    const response = await fetch(`${basePath}/latest`, {
      credentials: "include",
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // A design with no persisted result is an ordinary pre-run state. Other
      // failures remain visible so a review cannot mistake an API failure for
      // an unresolved numerical solve.
      if (response.status === 404 && !poll) return null;
      const message = text(record(payload).error ?? record(payload).message);
      throw new Error(
        message === "—"
          ? `Stage 4 predictive screening request failed (${response.status}).`
          : message,
      );
    }
    const next = record(payload);
    if (mounted.current) {
      applyPayload(next);
      setError(null);
    }
    return next;
  }, [applyPayload, basePath]);

  useEffect(() => {
    mounted.current = true;
    clearPolling();
    if (!designId) {
      setResult(null);
      setError(null);
      setLoading(false);
      setRun(null);
      setSubmitting(false);
      setStopping(false);
      return;
    }
    let active = true;
    setResult(null);
    setError(null);
    setLoading(true);
    void loadLatest()
      .then(next => {
        if (!active || !next || !isRunActive(next)) return;
        const poll = () => {
          if (!active) return;
          void loadLatest(true)
            .then(latest => {
              if (!active || !latest || !isRunActive(latest)) {
                clearPolling();
                return;
              }
              pollingTimer.current = window.setTimeout(poll, 1_500);
            })
            .catch(cause => {
              if (!active) return;
              clearPolling();
              setError(cause instanceof Error ? cause.message : "Stage 4 state could not be loaded.");
            });
        };
        pollingTimer.current = window.setTimeout(poll, 1_500);
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
      mounted.current = false;
      clearPolling();
    };
  }, [clearPolling, designId, loadLatest]);

  useEffect(() => () => {
    mounted.current = false;
    clearPolling();
  }, [clearPolling]);

  const calculate = useCallback(async () => {
    if (!basePath || requestInFlight.current || isRunActive(run)) return;
    requestInFlight.current = true;
    setSubmitting(true);
    setError(null);
    // Never leave a prior lineage's numbers beside a new run. The server
    // remains the only source of calculated values.
    setResult(null);
    try {
      const response = await fetch(`${basePath}/calculate`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = text(record(payload).error ?? record(payload).message);
        throw new Error(
          message === "—"
            ? `Stage 4 calculation could not be started (${response.status}).`
            : message,
        );
      }
      const next = record(payload);
      applyPayload(next);
      if (isRunActive(next)) {
        const poll = () => {
          void loadLatest(true)
            .then(latest => {
              if (!latest || !isRunActive(latest)) {
                clearPolling();
                return;
              }
              pollingTimer.current = window.setTimeout(poll, 1_500);
            })
            .catch(cause => {
              clearPolling();
              if (mounted.current) {
                setError(cause instanceof Error ? cause.message : "Stage 4 state could not be loaded.");
              }
            });
        };
        clearPolling();
        pollingTimer.current = window.setTimeout(poll, 1_500);
      }
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : "Stage 4 calculation could not be started.");
      }
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }, [applyPayload, basePath, clearPolling, loadLatest, run]);

  const retry = useCallback(async () => {
    if (!basePath || requestInFlight.current || isRunActive(run)) return;
    requestInFlight.current = true;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`${basePath}/retry`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = text(record(payload).error ?? record(payload).message);
        throw new Error(
          message === "—"
            ? `Stage 4 retry could not be started (${response.status}).`
            : message,
        );
      }
      const next = record(payload);
      applyPayload(next);
      if (isRunActive(next)) {
        clearPolling();
        const poll = () => {
          void loadLatest(true)
            .then(latest => {
              if (!latest || !isRunActive(latest)) {
                clearPolling();
                return;
              }
              pollingTimer.current = window.setTimeout(poll, 1_500);
            })
            .catch(cause => {
              clearPolling();
              if (mounted.current) {
                setError(cause instanceof Error ? cause.message : "Stage 4 state could not be loaded.");
              }
            });
        };
        pollingTimer.current = window.setTimeout(poll, 1_500);
      }
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : "Stage 4 retry could not be started.");
      }
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }, [applyPayload, basePath, clearPolling, loadLatest, run]);

  const stop = useCallback(async () => {
    if (!basePath || requestInFlight.current || !isRunActive(run)) return;
    requestInFlight.current = true;
    setStopping(true);
    setError(null);
    try {
      const response = await fetch(`${basePath}/stop`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = text(record(payload).error ?? record(payload).message);
        throw new Error(
          message === "—"
            ? `Stage 4 stop could not be completed (${response.status}).`
            : message,
        );
      }
      clearPolling();
      if (mounted.current) applyPayload(record(payload));
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : "Stage 4 stop could not be completed.");
      }
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setStopping(false);
    }
  }, [applyPayload, basePath, clearPolling, run]);

  const staleLineage = hasStaleLineage(result) || hasStaleLineage(run);
  const historicalPayload = result?.historicalCalculationOnly === true
    || result?.currentOptimizerRequired === true
    || run?.currentOptimizerRequired === true;
  // A stale response may still be useful as a diagnostic, but none of its
  // numerical fields are authoritative for the current design.
  const displayResult = staleLineage || historicalPayload ? null : result;
  const outputs = record(displayResult?.mainOutputs);
  const designNt = record(displayResult?.designNt);
  const actualStage2NtReference = record(displayResult?.actualStage2NtReference);
  // Retained for the non-HETS historical/result branches below; current HETS
  // cards use the explicit design/reference fields above.
  const nt = record(displayResult?.calculatedNt ?? displayResult?.actualStage2NtReference);
  const hydraulic = record(displayResult?.selectedStage3Hydraulics);
  const efficiency = record(displayResult?.overallEfficiency);
  const stage2Stage1Compatibility = record(displayResult?.stage2Stage1Compatibility);
  const stage3HetsAdmission = record(displayResult?.stage3HetsAdmission);
  const optimizedStage3Geometry =
    hydraulic.source === "PERSISTED_STAGE3_OPTIMIZER_GEOMETRY_NO_STAGE4_RESELECTION"
    || Object.keys(record(displayResult?.currentOptimizer)).length > 0;
  const optimizerRanking = record(hydraulic.ranking);
  const optimizerAlternatives = list(optimizerRanking.alternatives)
    .map(record)
    .filter((alternative, index, all) => {
      const geometry = record(alternative.geometry);
      const key = [
        geometry.columnDiameterM,
        geometry.hcToColumn,
        geometry.rotorToColumn,
        geometry.freeArea,
      ].join(":");
      return all.findIndex(candidate => {
        const candidateGeometry = record(candidate.geometry);
        return [
          candidateGeometry.columnDiameterM,
          candidateGeometry.hcToColumn,
          candidateGeometry.rotorToColumn,
          candidateGeometry.freeArea,
        ].join(":") === key;
      }) === index;
    });
  const optimizerSelectedWindow = record(optimizerRanking.selectedWindow);
  const stage3HetsLimitations = list(stage3HetsAdmission.limitations).map(record);
  const geometry = record(displayResult?.physicalGeometry);
  const audit = record(displayResult?.mixingAudit);
  const physicalSizing = record(displayResult?.physicalSizing);
  const diagnosticPhysicalSizing = record(result?.physicalSizing);
  const diagnosticPrimary = record(diagnosticPhysicalSizing.primary);
  const diagnosticSensitivity = record(diagnosticPhysicalSizing.sensitivity);
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
  const robustnessAssessment = materiality.comparable === false
    || materiality.classification === "NOT_COMPARABLE_PHYSICAL_SOLVES_NOT_AVAILABLE"
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
  const outcome = numericalOutcome(result, physicalSizing, physicalSizingBlocked || staleLineage);
  const explicitProgress = progressRows(
    result?.perCountProgress
      ?? result?.countProgress
      ?? record(result?.physicalSizing).perCountProgress
      ?? record(result?.physicalSizing).countProgress,
  );
  const progress = explicitProgress.length
    ? explicitProgress
    : [
      ...progressRows(primary.physicalCountOutcomes).map(item => ({ ...item, caseCoefficient: "0.0126" })),
      ...progressRows(sensitivity.physicalCountOutcomes).map(item => ({ ...item, caseCoefficient: "0.0105" })),
    ];
  const activeHeightMesh = record(
    result?.meshVerification
      ?? result?.mesh
      ?? physicalSizing.meshVerification
      ?? physicalSizing.mesh
      ?? primary.meshRefinement,
  );
  const runDetails = record(run?.state ?? run);
  const runProgress = record(runDetails.progress ?? run?.progress);
  const calculation = record(result?.calculation);
  const calculationProgress = record(calculation.progress ?? runProgress);
  const hasCalculationProgress = Object.keys(calculationProgress).length > 0;
  const stage4Status = historicalPayload ? "UNRUN" : responseStatus(result ?? run);
  const stage4Running = stage4Status === "RUNNING" || isRunActive(run);
  const stage4Retryable = STAGE4_RETRY_STATES.has(stage4Status);
  const stage4Terminal = STAGE4_TERMINAL_STATES.has(stage4Status);
  const stage4Action = stage4Retryable ? retry : calculate;
  const currentOptimizerRequired = result?.currentOptimizerRequired === true
    || run?.currentOptimizerRequired === true;
  const historicalCalculationOnly = historicalPayload;
  const hetsSizing = record(displayResult?.hetsSizing);
  const isHetsResult = (
    record(displayResult?.hetsSizing).sizingMethod === "ADOPTED_COMPARTMENT_EFFICIENCY"
  )
    && Object.keys(hetsSizing).length > 0;
  const fixed = (value: unknown, digits: number) =>
    isFiniteNumber(value) ? value.toFixed(digits) : "—";

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
      lastConservedPhysicalTrial: diagnosticPrimary.lastConservedPhysicalTrial,
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
      lastConservedPhysicalTrial: diagnosticSensitivity.lastConservedPhysicalTrial,
    },
  ];

  const interfaceFailureCases: Stage4InterfaceFailureCase[] = cases.map(item => ({
    key: item.key,
    label: item.label,
    coefficient: item.coefficient,
    trial: item.lastConservedPhysicalTrial,
  }));

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-900">
              {SCREENING_NOTICE}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-slate-950">
              Stage 4 Adopted-Efficiency Pre-Pilot Sizing
            </h2>
            <p className="mt-1 text-[10px] leading-4 text-slate-700">
              Deterministic fixed-Nₜ=7 physical sizing using the adopted 35% average
              physical-compartment efficiency and persisted Stage-3 geometry. The
              actual accepted Stage-2 Nₜ is reference-only. Stage 4 never creates,
              reruns, or reselects Stage 3.
            </p>
          </div>
          <button
            type="button"
            data-testid="stage4-calculate"
            onClick={() => void stage4Action()}
            disabled={!designId || loading || submitting || stopping || stage4Running
              || (stage4Terminal && !stage4Retryable)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded bg-cyan-950 px-3 text-[11px] font-semibold text-white hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting || stage4Running
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Play className="h-3.5 w-3.5" />}
            {submitting || stage4Running
              ? "Stage 4 running…"
              : stage4Retryable
                ? "Retry Stage 4"
                  : stage4Status === "CALCULATED"
                    || stage4Status === "CALCULATED_HETS_PRE_PILOT_SCREENING"
                    || stage4Status === "CALCULATED_COMPARTMENT_EFFICIENCY_PRE_PILOT_SIZING"
                  ? "Stage 4 calculated"
                  : stage4Status === "TARGET_FAILURE"
                    ? "Target not met"
                    : "Calculate Stage 4"}
          </button>
          {stage4Running && (
            <button
              type="button"
              data-testid="stage4-stop"
              onClick={() => void stop()}
              disabled={stopping || submitting}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-rose-700 px-3 text-[11px] font-semibold text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stopping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span aria-hidden="true">■</span>}
              {stopping ? "Stopping…" : "Stop"}
            </button>
          )}
        </div>
      </header>

      {loading && (
        <p className="flex items-center gap-2 p-3 text-[10px] text-slate-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading governed predictive physical sizing…
        </p>
      )}
      {!loading && !error && !result && !run && designId && (
        <p className="p-3 text-[10px] text-slate-600">
           No Stage 4 adopted-efficiency sizing has been run for this lineage.
           Calculate Stage 4 to persist the server-owned deterministic result.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="m-3 flex gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-950"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
            <span>
              Stage 4 predictive screening is blocked or failed; no physical
              count, height, or efficiency is presented. {error}
            </span>
            <button
              type="button"
              data-testid="stage4-retry"
              onClick={() => void stage4Action()}
              disabled={submitting || stopping || stage4Running
                || (stage4Terminal && !stage4Retryable)}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-500 px-2 py-1 font-semibold hover:bg-amber-100 disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" /> {stage4Retryable ? "Retry" : "Recalculate"}
            </button>
          </div>
        </div>
      )}
      {historicalCalculationOnly && (
        <div
          data-testid="stage4-historical-result-warning"
          role="alert"
          className="m-3 rounded border border-amber-400 bg-amber-50 p-3 text-[10px] text-amber-950"
        >
          <p className="font-semibold">
            Historical Stage 4 record — not optimized for the current{" "}
            {currentOptimizerRequired ? "Stage 1 snapshot" : "Stage 3 optimizer geometry"}.
          </p>
          <p className="mt-1">
            The prior legacy geometry is retained as immutable history and is not current Stage 4 authority.{" "}
            {currentOptimizerRequired
              ? "Complete and persist the required Stage-3 authority first; Stage 4 Calculate will not create or rerun it."
              : "Calculate Stage 4 to persist sizing from the current optimizer's selected hc/D = 0.20–0.30 geometry."}{" "}
            No legacy hc = 0.5D value is used for the new calculation.
          </p>
          {result?.previousCalculation && (
            <p className="mt-1 font-mono">
              Historical status: {text(record(result.previousCalculation).status)} · implementation:{" "}
              {text(result.historicalCalculationImplementationVersion
                ?? record(result.previousCalculation).implementationVersion)}
            </p>
          )}
        </div>
      )}

      {isHetsResult ? (
        <div className="space-y-3 p-3" data-testid="stage4-hets-result">
          <div className="rounded border-2 border-amber-400 bg-amber-50 p-3 text-[10px] font-semibold text-amber-950">
            PRE-PILOT PREDICTIVE / SCREENING DESIGN
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950">Stage 4 Adopted-Efficiency Pre-Pilot Sizing</h3>
            <span className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-950">
              PRE-PILOT SCREENING
            </span>
          </div>
          <section className="rounded border border-cyan-200 p-3">
            <h4 className="text-xs font-semibold">Sizing result card</h4>
            <table className="mt-2 w-full max-w-2xl text-left text-[11px]">
              <thead><tr className="border-b"><th className="p-2">Parameter</th><th className="p-2">Result</th></tr></thead>
              <tbody>
                {[
                  ["Stage 4 fixed design Nₜ (physical sizing basis)", fixed(hetsSizing.fixedDesignTheoreticalStages, 0)],
                  ["Actual accepted Stage-2 Nₜ (reference only)", fixed(hetsSizing.actualStage2TheoreticalStagesReference, 0)],
                  ["Sizing method", text(hetsSizing.sizingMethod)],
                  ["Design average physical-compartment efficiency", isFiniteNumber(hetsSizing.designCompartmentEfficiency)
                    ? `${(hetsSizing.designCompartmentEfficiency * 100).toFixed(0)}%` : "—"],
                  ["Stage 3 hydraulic column diameter", `${fixed(hetsSizing.stage3HydraulicColumnDiameterM, 3)} m`],
                  ["Compartment height rule", text(hetsSizing.compartmentHeightRule)],
                  ...(optimizedStage3Geometry
                    ? [
                      ["Selected Stage-3 orientation", text(hydraulic.orientation ?? displayResult?.selectedOrientation)],
                      ["Selected Stage-3 hc/D", fixed(hydraulic.hcToColumn, 2)],
                      ["Selected Stage-3 rotor diameter", `${fixed(hydraulic.rotorDiameterM, 3)} m`],
                      ["Selected Stage-3 rotor/D", fixed(hydraulic.rotorToColumn, 2)],
                      ["Selected Stage-3 free area", fixed(hydraulic.freeArea, 2)],
                      ["Selected Stage-3 RPM", fixed(hydraulic.selectedRpm, 1)],
                    ]
                    : []),
                  ["Physical compartment height", `${fixed(hetsSizing.physicalCompartmentHeightM, 3)} m`],
                  ["Implied installed HETS (derived diagnostic only)", `${fixed(hetsSizing.impliedInstalledHetsMPerTheoreticalStage, 5)} m/theoretical stage`],
                  ["Required active height", `${fixed(hetsSizing.requiredActiveHeightM, 2)} m`],
                  ["Required physical compartments", fixed(hetsSizing.requiredPhysicalCompartments, 0)],
                  ["Installed active height", `${fixed(hetsSizing.installedActiveHeightM, 2)} m`],
                  ["Design status", text(hetsSizing.designStatus)],
                ].map(([label, value]) => (
                  <tr key={label} className="border-b border-slate-100">
                    <th className="p-2 font-medium">{label}</th><td className="p-2 font-mono">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="rounded border border-amber-300 bg-amber-50 p-3 text-[10px] text-amber-950">
            <h4 className="text-xs font-semibold">Assumption governance</h4>
            <p className="mt-1">
              Design average physical-compartment efficiency = 35% is an adopted
              pre-pilot engineering assumption, subject to validation/calibration
              from pilot performance or a validated mass-transfer/backmixing model.
              It is not a published Kühni constant or a calculated NMP/RRBO efficiency.
              The selected Stage-3 diameter and compartment height are carried forward
              unchanged as persisted authoritative geometry.
            </p>
            <p className="mt-1">
              Implied installed HETS is active height divided by fixed Nₜ=7 and is a
              derived diagnostic only, not a design input. Installed active height is not total vessel height. No outlet,
              recovery, target-compliance, or final-design claim is made.
            </p>
          </section>
          <section className="rounded border border-slate-200 p-3 text-[10px]">
            <h4 className="text-xs font-semibold">Current accepted upstream lineage</h4>
            <p className="mt-1">
               Fixed Stage-4 design Nₜ: {number(designNt.value)} · Actual accepted Stage-2 Nₜ
              reference only: {number(actualStage2NtReference.value)} · Stage-3 hydraulic screening diameter:
              {" "}{number(hydraulic.diameterM, "m")}. No Stage-3 hydraulic diameter or selected
              compartment height was recalculated.
            </p>
            {stage3HetsAdmission.status === "INDEPENDENTLY_CHECKED_PREPILOT_HETS_CANDIDATE" && (
              <p className="mt-1">
                <strong>Stage-3 HETS-only admission:</strong> independently checked{" "}
                {text(stage3HetsAdmission.source)}. This is not governed hydraulics, finite-rate
                Stage 4, mass-transfer readiness, or commercial release authority.
              </p>
            )}
            {optimizedStage3Geometry && (
              <section
                data-testid="stage4-current-ranking"
                className="mt-3 rounded border border-emerald-200 bg-emerald-50/50 p-3"
              >
                <h4 className="text-xs font-semibold text-emerald-950">
                  Current persisted optimizer ranking
                </h4>
                <p className="mt-1">
                  Stage 4 uses the verified selected Stage-3 optimizer point; it
                  does not rerun or re-rank the hydraulic candidates on GET.
                  {text(optimizerRanking.objective) !== "—"
                    ? ` ${text(optimizerRanking.objective)}`
                    : ""}
                </p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Selected D", number(hydraulic.diameterM, "m")],
                    ["Smallest accepted adequate D",
                      number(record(optimizerRanking.diameterSelection).SMALLEST_ACCEPTED_ADEQUATE_DIAMETER, "m")],
                    ["Selected next-smallest accepted D",
                      number(record(optimizerRanking.diameterSelection).SELECTED_NEXT_SMALLEST_ACCEPTED_DIAMETER, "m")],
                    ["Selected hc/D", number(hydraulic.hcToColumn)],
                    ["Selected RPM", number(hydraulic.selectedRpm)],
                    ["Selected useful window",
                      optimizerSelectedWindow.rpmMin !== undefined
                        ? `${number(optimizerSelectedWindow.rpmMin)}–${number(optimizerSelectedWindow.rpmMax)} rpm (${number(optimizerSelectedWindow.widthRpm)} rpm wide)`
                        : "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded border border-emerald-100 bg-white p-2">
                      <dt className="text-slate-600">{label}</dt>
                      <dd className="mt-1 font-mono">{value}</dd>
                    </div>
                  ))}
                </dl>
                {optimizerAlternatives.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left">
                      <thead>
                        <tr className="border-b border-emerald-200">
                          {["Role", "D [m]", "hc/D", "RPM window", "Width", "Why retained"].map(label => (
                            <th key={label} className="p-1 font-semibold">{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {optimizerAlternatives.slice(0, 5).map((alternative, index) => {
                          const geometry = record(alternative.geometry);
                          const window = record(alternative.operatingWindow);
                          return (
                            <tr key={`${String(geometry.columnDiameterM)}-${String(geometry.hcToColumn)}-${index}`} className="border-b border-emerald-100 align-top">
                              <td className="p-1">{text(alternative.role)}</td>
                              <td className="p-1 font-mono">{number(geometry.columnDiameterM)}</td>
                              <td className="p-1 font-mono">{number(geometry.hcToColumn)}</td>
                              <td className="p-1 font-mono">
                                {window.rpmMin === undefined
                                  ? "—"
                                  : `${number(window.rpmMin)}–${number(window.rpmMax)} rpm`}
                              </td>
                              <td className="p-1 font-mono">{number(window.widthRpm)} rpm</td>
                              <td className="p-1">{text(alternative.rationale)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 break-all font-mono text-[9px]">
                  Optimizer engine: {text(hydraulic.optimizerVersion)} · implementation hash:{" "}
                  {text(hydraulic.optimizerImplementationHash)}
                </p>
              </section>
            )}
            {stage2Stage1Compatibility.status
              === "EXACT_EQUILIBRIUM_INPUT_MATCH_EXCLUDING_HYDRAULIC_PHASE_ORIENTATION" && (
              <p className="mt-1">
                <strong>Stage-2 compatibility audit:</strong> exact equilibrium scientific inputs
                match the current Stage-1 snapshot; only {text(stage2Stage1Compatibility.excludedScientificInputField)}
                {" "}is excluded. The actual accepted Stage-2 Nₜ above remains a reference and is not relabelled
                as the fixed Stage-4 Nₜ=7 physical-sizing design basis.
              </p>
            )}
            {stage3HetsLimitations.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">
                  Persisted Stage-3 pre-pilot limitations ({stage3HetsLimitations.length})
                </summary>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {stage3HetsLimitations.flatMap((limitation, index) =>
                    list(limitation.details).map(detail => (
                      <li key={`${String(limitation.group)}-${index}-${String(detail)}`}>{text(detail)}</li>
                    )),
                  )}
                </ul>
              </details>
            )}
            <p className="mt-1 font-mono">
              Nphysical = ceil(Ndesign(7) / ηcomp,design) · Hrequired = Hinstalled = Nphysical × hc
            </p>
          </section>
        </div>
      ) : <>
      <Stage4FailureReason code={calculation.errorCode ?? result?.errorCode} />
      <Stage4FailureReason code={record(result?.previousCalculation).errorCode} historical />
      {!loading && (stage4Running || (!result && run) || hasCalculationProgress || stage4Status === "UNRUN") && (
        <section
          data-testid="stage4-run-progress"
          className="m-3 rounded border border-cyan-200 bg-cyan-50/50 p-3 text-[10px]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Stage 4 calculation progress</h3>
            <span className="rounded border border-cyan-300 bg-white px-2 py-1 font-semibold">
              {text(stage4Status || runDetails.status || runDetails.state || runState(run))}
            </span>
          </div>
          {stage4Running && (
            <div className="mt-3" data-testid="stage4-active-progress">
              <div
                role="progressbar"
                aria-label="Stage 4 calculation in progress"
                aria-valuetext="Calculating; percentage complete is unavailable"
                className="stage4-activity-track"
              >
                <div className="stage4-activity-segment" aria-hidden="true" />
              </div>
              <p className="mt-2 font-semibold" role="status">
                Calculating — no result yet.
              </p>
              <p className="mt-1 text-slate-600">
                The bar indicates activity, not a percentage. Trial details update at saved checkpoints.
              </p>
            </div>
          )}
          <p className="mt-1">
            {stage4Running ? "Calculation active" : text(calculationProgress.phase ?? runDetails.message ?? runProgress.message)}
          </p>
          <Stage4SolverTelemetry telemetry={calculationProgress.telemetry} />
          <Stage4TrialProgress
            progress={calculationProgress.physicalTrialProgress}
            minimum={calculationProgress.minimumPhysicalCount ?? nt.value}
            maximum={calculationProgress.maximumPhysicalCount ?? calculationProgress.maximumPhysicalCompartments}
            notRun={stage4Status === "UNRUN"}
          />
          {isFiniteNumber(calculationProgress.completedCases ?? calculationProgress.completed) && (
            <p className="mt-1 font-mono">
              Cases: {number(calculationProgress.completedCases ?? calculationProgress.completed)} /{" "}
              {number(calculationProgress.totalCases ?? calculationProgress.total)}
            </p>
          )}
          {[
            ["Current physical count", calculationProgress.physicalCompartments],
            ["Finite-volume cells / count", calculationProgress.finiteVolumeCellsPerPhysicalCompartment],
            ["Recorded local flash calls", calculationProgress.localFlashCalls],
            ["Callback state", calculationProgress.state],
            ["Reason", calculationProgress.reason],
            ["Maximum physical count", calculationProgress.maximumPhysicalCompartments],
          ]
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([label, value]) => (
              <p key={String(label)} className="mt-1">
                <strong>{String(label)}:</strong>{" "}
                {typeof value === "number" ? number(value) : text(value)}
              </p>
            ))}
          {staleLineage && (
            <p className="mt-2 font-semibold text-amber-900">
              This run does not match the current Stage-1/2/3 lineage. No performance values are shown.
            </p>
          )}
        </section>
      )}

      {result && (
        <div className="space-y-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold">Live server-owned screening result</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-950">
                {text(result.status)}
              </span>
              <span
                data-testid="stage4-numerical-outcome"
                className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-800"
              >
                {outcome}
              </span>
            </div>
          </div>

          <div className="rounded border-2 border-amber-400 bg-amber-50 p-3 text-[10px] font-semibold text-amber-950">
            {text(result.screeningNotice) === "—" ? SCREENING_NOTICE : text(result.screeningNotice)}
          </div>

          {staleLineage && (
            <div
              data-testid="stage4-stale-lineage"
              className="rounded border-2 border-amber-400 bg-amber-50 p-3 text-[10px] text-amber-950"
            >
              <p className="font-semibold">Stale Stage 4 lineage — numerical performance withheld</p>
              <p className="mt-1">
                This server response is not from the current Stage-1/2/3 evidence lineage.
                Recalculate Stage 4 to obtain an authoritative result. No count, height,
                efficiency, or outlet from this response is presented.
              </p>
            </div>
          )}

           <Stage4InterfaceFailureDiagnostics cases={interfaceFailureCases} />

          {!staleLineage && <>
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
                    {["Case", "Ec [m²/s]", "Pe_c / active height", "Physical count", "Active H [m]", "ηoverall", "Target compliance", "Search termination"].map(label => (
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
                      <td className="p-2 font-mono">{number(activeHeightPec(item))}</td>
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

          {(Object.keys(activeHeightMesh).length > 0 || progress.length > 0) && (
            <section
              data-testid="stage4-numerical-verification"
              className="rounded border border-sky-200 bg-sky-50/40 p-3 text-[10px]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold">Numerical verification and count progress</h3>
                <span className="text-slate-600">Backend evidence only</span>
              </div>
              {Object.keys(activeHeightMesh).length > 0 && (
                <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Mesh status", activeHeightMesh.status ?? activeHeightMesh.classification],
                    ["Mesh levels", activeHeightMesh.levels ?? activeHeightMesh.meshLevels
                      ?? activeHeightMesh.refinedFiniteVolumeCellsPerPhysicalCompartment],
                    ["Refinement", activeHeightMesh.refinement ?? activeHeightMesh.refinementStatus],
                    ["Verified", activeHeightMesh.verified ?? activeHeightMesh.passed],
                    ["Coarse cells / count", activeHeightMesh.coarseFiniteVolumeCellsPerPhysicalCompartment],
                    ["Active-height Pec", activeHeightMesh.activeHeightPeclet ?? activeHeightMesh.peclet
                      ?? primarySelected.continuousColumnPeclet],
                    ["Mesh outlet difference", activeHeightMesh.relativeOutletDifference
                      ?? primarySelected.finiteVolumeRefinementRelativeOutletDifference],
                    ["Acceptance difference", activeHeightMesh.acceptanceRelativeOutletDifference],
                    ["Residual", activeHeightMesh.residual ?? activeHeightMesh.maxResidual],
                  ]
                    .filter(([, value]) => value !== undefined && value !== null)
                    .map(([label, value]) => (
                      <div key={String(label)} className="rounded border border-sky-100 bg-white p-2">
                        <dt className="text-slate-600">{String(label)}</dt>
                        <dd className="mt-1 font-mono">
                          {typeof value === "number" ? number(value) : text(value)}
                        </dd>
                      </div>
                    ))}
                </dl>
              )}
              {progress.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left">
                    <thead>
                      <tr className="border-b border-sky-200">
                        {["Case", "Count", "Status", "Active H [m]", "Pe_c", "Target", "Detail"].map(label => (
                          <th key={label} className="p-1 font-semibold">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {progress.map((item, index) => (
                        <tr key={`${text(item.count ?? item.physicalCompartments)}-${index}`} className="border-b border-sky-100">
                          <td className="p-1 font-mono">{text(item.caseCoefficient)}</td>
                          <td className="p-1 font-mono">{text(item.count ?? item.physicalCompartments ?? item.n)}</td>
                          <td className="p-1">{text(item.status ?? item.state)}</td>
                          <td className="p-1 font-mono">{number(item.activeHeightM ?? item.heightM, "m")}</td>
                          <td className="p-1 font-mono">{number(item.activeHeightPeclet ?? item.peclet ?? item.continuousPeclet)}</td>
                          <td className="p-1">{text(item.targetCompliance ?? item.targetStatus)}</td>
                          <td className="p-1">{text(item.detail ?? item.message ?? item.reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

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
                ["Comparable cases", materialityBoolean(materiality.comparable, "NOT ASSESSED")],
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
                  : outcome === "NUMERICAL UNRESOLVED"
                    ? "The numerical solve is unresolved; no physical count or performance is asserted."
                    : outcome === "TARGET NOT MET"
                      ? "Primary physical sizing did not return a target-compliant count; no target-compliant physical count was returned within the governed search bound."
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
          </>}
        </div>
      )}
      </>}
    </section>
  );
}