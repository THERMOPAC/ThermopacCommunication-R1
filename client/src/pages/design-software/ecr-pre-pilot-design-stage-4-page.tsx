import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, FlaskConical, Loader2, Play, RefreshCw, ShieldAlert, Square } from "lucide-react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  isNewerPartialTransferResult,
  partialTransferResultIdentity,
  PartialTransferResultController,
  type PartialTransferControllerPhase,
  type PartialTransferResultIdentity,
} from "@/lib/partial-transfer-result-controller";
export {
  isNewerPartialTransferResult,
  partialTransferResultIdentity,
} from "@/lib/partial-transfer-result-controller";
export type {
  PartialTransferControllerPhase,
  PartialTransferResultIdentity,
  PartialTransferRunStatus,
} from "@/lib/partial-transfer-result-controller";

type RecordValue = Record<string, unknown>;
type JobAResponse = RecordValue & { result?: RecordValue; data?: RecordValue };
type JobCStatus = "pending" | "running" | "completed" | "blocked" | "failed" | "cancelled";
type JobCJob = {
  jobId: string;
  status: JobCStatus;
  progress: {
    phase: string | null;
    message: string | null;
    completed: number | null;
    total: number | null;
    iteration: number | null;
    residual: number | null;
    residualKind: string | null;
    elapsedSeconds: number | null;
    heightCandidateM: number | null;
    continuationLambda: number | null;
    continuationTrial: number | null;
    acceptedLowerLambda: number | null;
    rejectedUpperLambda: number | null;
    rawFvResidualMolS: number | null;
    scaledFvResidual: number | null;
    maximumOriginalJobBGateResidual: number | null;
    minimumFlowMolS: number | null;
    rawFvGatePassed: boolean | null;
    scaledFvGatePassed: boolean | null;
    originalJobBGatePassed: boolean | null;
    strictPositivityPassed: boolean | null;
    accepted: boolean | null;
  };
  result: RecordValue | null;
  scientificCompleted: boolean;
  partialResult: RecordValue | null;
  partialResultHash: string | null;
  diagnostics?: RecordValue | null;
  diagnosticOnly: boolean;
  workflowTestOnly: boolean;
  error: string | null;
};

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
  if (value === undefined || value === null || value === "") return "Unavailable";
  const number = Number(value);
  return Number.isFinite(number) ? number.toExponential(Math.max(0, digits - 1)) : "Unavailable";
}

function daxValue(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toFixed(Math.abs(number) < 0.001 ? 4 : 3);
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

function records(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(object) : [];
}

function metricValue(value: unknown, unit: string): string {
  if (value === undefined || value === null || value === "") return "Unavailable";
  const number = Number(value);
  return Number.isFinite(number) ? `${numberValue(number)} ${unit}` : stringValue(value, "Unavailable");
}

function scalarOrUnavailable(value: unknown): string {
  return value === undefined || value === null || value === "" ? "Unavailable" : scalarValue(value);
}

function booleanVerdict(value: unknown): string {
  return typeof value === "boolean" ? (value ? "PASS" : "BLOCKED") : stringValue(value, "Unavailable");
}

function explicitDependencyValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => typeof item === "string" ? item : JSON.stringify(item));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as RecordValue).map(([key, item]) =>
      `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`);
  }
  return [];
}

function numericArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function calculatedStatus(value: unknown): boolean {
  const status = stringValue(value, "").toUpperCase();
  return !status.includes("NOT_CALCULATED")
    && (status === "CALCULATED" || status.startsWith("CALCULATED_") || status.endsWith("_CALCULATED"));
}

function parseObject(value: unknown): RecordValue {
  if (typeof value === "string") {
    try {
      return object(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return object(value);
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function elapsedValue(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "Unavailable";
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m ${String(remainingSeconds).padStart(2, "0")}s`
    : `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

function residualValue(residual: number | null | undefined, kind: string | null | undefined): string {
  if (residual == null || !Number.isFinite(residual)) return "Unavailable";
  return `${residual.toExponential(3)}${kind ? ` (${kind})` : ""}`;
}

const JOB_C_RESIDUAL_LIMIT = 1e-7;

type PhysicalSizingPanelProps = {
  value: RecordValue | null;
  loading: boolean;
  error: string | null;
  onEvaluate?: () => void;
  evaluating?: boolean;
  canEvaluate?: boolean;
};

/**
 * Physical sizing is intentionally a display-only boundary.  The browser
 * consumes the direct server result and does not turn Job-C numerical cells
 * into physical compartments, recalculate efficiency, or start Job C.
 */
export function PhysicalSizingPanel({
  value, loading, error, onEvaluate, evaluating = false, canEvaluate = false,
}: PhysicalSizingPanelProps) {
  const admission = object(read(value ?? {}, "admission", "physicalSizingAdmission"));
  const evidence = object(read(admission, "evidence", "gateEvidence"));
  const mapping = object(read(value ?? {}, "compartmentMapping", "mapping"));
  const finalGeometry = object(read(value ?? {}, "finalGeometry", "final"));
  const mechanicalBasis = object(read(value ?? {}, "mechanicalBasis", "mechanicalCompartmentBasis"));
  const reasons = flagsOf(read(admission, "reasons", "blockingReasons"));
  const dependencyList = explicitDependencyValues(read(
    value ?? {},
    "requiredDependencies",
    "explicitDependencies",
    "dependenciesRequired",
  ));
  const dependencyHashes = explicitDependencyValues(read(value ?? {}, "dependencies"));
  const transport = object(read(value ?? {}, "transport"));
  const transportLineage = explicitDependencyValues(read(transport, "lineage"));
  const dependencies = [...dependencyList, ...dependencyHashes, ...transportLineage];
  const trialAuthority = object(read(value ?? {}, "physicalSizingCandidateAuthority"));
  const trials = records(read(value ?? {}, "trialEvidence", "provenanceTrials", "trials")).length
    ? records(read(value ?? {}, "trialEvidence", "provenanceTrials", "trials"))
    : records(read(trialAuthority, "candidates", "trialEvidence"));
  const requiredHeight = read(value ?? {}, "requiredHeightM", "requiredHeight")
    ?? read(admission, "requiredHeightM", "requiredHeight");
  const installedHeight = read(value ?? {}, "installedHeightM", "activeHeightM", "installedHeight");
  const physicalCompartments = read(value ?? {}, "physicalCompartments", "physicalCompartmentCount");
  const numericalCompartments = read(value ?? {}, "numericalCompartments", "numericalCompartmentCount")
    ?? read(admission, "numericalCells");
  const efficiencyBasis = read(mapping, "efficiencyBasis")
    ?? read(value ?? {}, "efficiencyBasis");
  const overallEfficiency = read(mapping, "overallEfficiency")
    ?? read(value ?? {}, "efficiency");
  const finalD32 = read(finalGeometry, "d32M", "d32")
    ?? read(value ?? {}, "finalD32M", "d32M");
  const finalOperatingHoldup = read(finalGeometry, "operatingHoldup", "operatingHoldupFraction")
    ?? read(value ?? {}, "finalOperatingHoldup", "operatingHoldup");
  const finalFloodHoldup = read(finalGeometry, "floodHoldup", "floodingHoldup", "floodHoldupFraction")
    ?? read(value ?? {}, "finalFloodHoldup", "floodHoldup");
  const finalRpm = read(finalGeometry, "rpm", "operatingRpm")
    ?? read(value ?? {}, "finalOperatingRpm");
  const finalDiameter = read(finalGeometry, "diameterM", "columnDiameterM")
    ?? read(value ?? {}, "finalColumnDiameterM", "columnDiameterM");
  const finalProvenance = read(finalGeometry, "provenance", "geometryProvenance")
    ?? read(value ?? {}, "finalGeometryProvenance", "provenance");
  const status = read(value ?? {}, "status", "calculationStatus");
  const classification = read(value ?? {}, "classification", "releaseClassification");

  return (
    <section
      data-testid="physical-sizing-panel"
      className="overflow-hidden rounded-md border-2 border-emerald-700/50 bg-white"
    >
      <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
          Stage 4 · physical Kühni sizing
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-950">Server-owned physical sizing assessment</h2>
          <span className="rounded border border-emerald-300 bg-white px-2 py-1 font-mono text-[10px] font-semibold">
            Status: {stringValue(status, loading ? "LOADING" : "NOT_AVAILABLE")}
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-slate-700">
          This is a separate post-Job-C sizing result. The client performs no numerical reconstruction,
          treats Job-C numerical cells as numerical compartments only, and does not start Job C automatically.
        </p>
        {onEvaluate ? (
          <button
            type="button"
            data-testid="evaluate-physical-sizing"
            onClick={onEvaluate}
            disabled={!canEvaluate || evaluating}
            className="mt-2 rounded border border-emerald-700 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {evaluating ? "Evaluating physical sizing…" : "Evaluate physical sizing"}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div role="status" className="p-4 text-xs text-slate-600">Loading the latest physical sizing assessment…</div>
      ) : !value ? (
        <div className="p-4 text-xs text-slate-700">
          <p className="font-semibold">No completed physical sizing assessment is available.</p>
          {error && <p className="mt-1 font-mono text-[10px] text-amber-800">{error}</p>}
          <p className="mt-2 text-[10px] text-slate-600">
            No physical compartments, installed height, efficiency, or final geometry are inferred from Job-C output.
          </p>
        </div>
      ) : (
        <>
          <section data-testid="physical-sizing-admission" className="border-b border-emerald-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-900">Admission</h3>
                <p className="mt-1 text-[10px] text-slate-600">
                  Accepted for physical sizing: <span className="font-mono font-semibold">{booleanVerdict(read(admission, "accepted"))}</span>
                </p>
              </div>
              {classification && <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900">{String(classification)}</span>}
            </div>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Full λ accepted", read(evidence, "fullLambda", "fullLambdaAccepted")],
                ["Immutable lineage", read(evidence, "immutableLineage")],
                ["Exact qualification", read(evidence, "exactQualification")],
                ["Reproduced and stable", read(evidence, "independentlyReproducedAndStable", "reproducedAndStable")],
                ["Governing gates", read(evidence, "governingGates")],
              ].map(([label, item]) => (
                <div key={String(label)} className="rounded border border-emerald-200 bg-emerald-50/40 p-2">
                  <dt className="text-[9px] text-slate-500">{label}</dt>
                  <dd className="mt-1 font-mono text-[10px]">{booleanVerdict(item)}</dd>
                </div>
              ))}
            </dl>
            {reasons.length > 0 && (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-950">
                <p className="font-semibold">Admission reasons</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
              </div>
            )}
          </section>

          <section data-testid="physical-sizing-dependencies" className="border-b border-emerald-200 bg-slate-50/70 p-3">
            <h3 className="text-xs font-semibold text-slate-900">Explicit physical-sizing dependencies</h3>
            {dependencies.length > 0 ? (
              <ul className="mt-2 grid gap-1 text-[10px] leading-4 text-slate-700 sm:grid-cols-2">
                {dependencies.map(dependency => <li key={dependency} className="rounded border border-slate-200 bg-white px-2 py-1 font-mono">{dependency}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-[10px] text-slate-600">No separate required-dependency list was returned.</p>
            )}
            {(Object.keys(mechanicalBasis).length > 0 || read(trialAuthority, "qualification")) && (
              <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <HashLine label="Mechanical basis source" value={read(mechanicalBasis, "source", "reason")} />
                <HashLine label="Mechanical basis hash" value={read(mechanicalBasis, "hash")} />
                <HashLine label="Mechanical basis status" value={read(mechanicalBasis, "status")} />
                <HashLine label="Spacing rule" value={read(mechanicalBasis, "spacingRule", "qualification")} />
              </dl>
            )}
          </section>

          <section data-testid="physical-sizing-summary" className="border-b border-emerald-200 p-3">
            <h3 className="text-xs font-semibold text-slate-900">Physical versus numerical sizing</h3>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Required active height", metricValue(requiredHeight, "m")],
                ["Installed active height", metricValue(installedHeight, "m")],
                ["Physical compartments", scalarOrUnavailable(physicalCompartments)],
                ["Numerical compartments", scalarOrUnavailable(numericalCompartments)],
                ["Efficiency basis", stringValue(efficiencyBasis, "Unavailable")],
                ["Overall efficiency", scalarOrUnavailable(overallEfficiency)],
                ["HETS", metricValue(read(mapping, "hetsM", "heightEquivalentTheoreticalStageM"), "m")],
              ].map(([label, item]) => (
                <div key={String(label)} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <dt className="text-[9px] text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words font-mono text-[10px] text-slate-900">{item}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[10px] leading-4 text-slate-600">
              Physical compartments come only from the server&rsquo;s governed mechanical spacing basis.
              Numerical compartments are the Job-C FV discretization and are not treated as physical stage count.
            </p>
          </section>

          <section data-testid="physical-sizing-final-geometry" className="border-b border-emerald-200 p-3">
            <h3 className="text-xs font-semibold text-slate-900">Final geometry and hydraulic provenance</h3>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["d32 [m]", metricValue(finalD32, "m")],
                ["Operating holdup", scalarOrUnavailable(finalOperatingHoldup)],
                ["Flood holdup", scalarOrUnavailable(finalFloodHoldup)],
                ["Operating RPM", scalarOrUnavailable(finalRpm)],
                ["Column diameter [m]", metricValue(finalDiameter, "m")],
              ].map(([label, item]) => (
                <div key={String(label)} className="rounded border border-emerald-200 bg-emerald-50/40 p-2">
                  <dt className="text-[9px] text-slate-600">{label}</dt>
                  <dd className="mt-1 font-mono text-[10px] font-semibold text-slate-900">{item}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 break-words text-[10px] leading-4 text-slate-700">
              Geometry provenance: <span className="font-mono">{stringValue(finalProvenance, "Unavailable")}</span>
            </p>
          </section>

          <section data-testid="physical-sizing-trials" className="p-3">
            <h3 className="text-xs font-semibold text-slate-900">Server-returned provenance trials</h3>
            {trials.length > 0 ? (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-[10px]">
                  <thead className="bg-emerald-950 text-white">
                    <tr>
                      <th className="px-2 py-2">Trial</th>
                      <th className="px-2 py-2">Status / reason</th>
                      <th className="px-2 py-2">RPM</th>
                      <th className="px-2 py-2">Diameter [m]</th>
                      <th className="px-2 py-2">Attempted physical compartments</th>
                      <th className="px-2 py-2">Installed height [m]</th>
                      <th className="px-2 py-2">Efficiency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {trials.map((trial, index) => {
                      const designTrial = object(read(trial, "design", "selectedDesign"));
                      const hydraulicsTrial = object(read(trial, "stage3Evidence", "hydraulics", "operatingHydraulics"));
                      const attempted = read(trial, "attemptedCompartments", "physicalCompartmentsTried");
                      return (
                        <tr key={`${stringValue(read(trial, "trialId", "ordinal"), index)}`} className="align-top">
                          <td className="px-2 py-2 font-mono">{stringValue(read(trial, "trialId", "ordinal"), String(index + 1))}</td>
                          <td className="px-2 py-2">
                            <span className="font-semibold">{stringValue(read(trial, "status", "hydraulicStatus"))}</span>
                            {read(trial, "reason") && <><br /><span className="text-slate-600">{String(read(trial, "reason"))}</span></>}
                          </td>
                          <td className="px-2 py-2 font-mono">{scalarOrUnavailable(read(trial, "rpm") ?? read(designTrial, "rpm"))}</td>
                          <td className="px-2 py-2 font-mono">{metricValue(read(trial, "columnDiameterM", "diameterM") ?? read(hydraulicsTrial, "columnDiameterM", "diameterM"), "m")}</td>
                          <td className="px-2 py-2 font-mono">{Array.isArray(attempted) ? attempted.join(", ") : scalarOrUnavailable(read(trial, "physicalCompartments") ?? read(designTrial, "physicalCompartments"))}</td>
                          <td className="px-2 py-2 font-mono">{metricValue(read(trial, "activeHeightM") ?? read(designTrial, "activeHeightM"), "m")}</td>
                          <td className="px-2 py-2 font-mono">{scalarOrUnavailable(read(trial, "overallEfficiency") ?? read(designTrial, "overallEfficiency"))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-[10px] text-slate-600">No provenance trials were returned with this assessment.</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}

/** A separate server-owned nonlinear candidate operation; it never shares Job-C queue state. */
export function PartialTransferPhysicalSizingPanel({
  value,
  loading,
  error,
  onEvaluate,
  evaluating,
  canEvaluate,
  onRefresh,
  refreshing = false,
  disabled = false,
  runStatus = "idle",
  runError = null,
  baseline = null,
}: PhysicalSizingPanelProps & {
  onRefresh?: () => void;
  refreshing?: boolean;
  disabled?: boolean;
  runStatus?: PartialTransferControllerPhase;
  runError?: string | null;
  baseline?: PartialTransferResultIdentity | null;
}) {
  const runInProgress = runStatus === "baseline" || runStatus === "running" || runStatus === "reconciling";
  const runHasUnreconciledOutcome = runStatus !== "idle" && runStatus !== "completed";
  const status = runStatus === "baseline"
    ? "READING SAVED RESULT"
    : runStatus === "running"
      ? "RUNNING"
      : runStatus === "reconciling" || runStatus === "timed_out"
        ? "OUTCOME_UNKNOWN"
        : runStatus === "blocked"
          ? "BLOCKED"
          : stringValue(read(value ?? {}, "status"), loading ? "LOADING" : "NOT_AVAILABLE");
  const geometry = object(read(value ?? {}, "stage3Geometry"));
  const target = object(read(value ?? {}, "target"));
  const solve = object(read(value ?? {}, "solve"));
  const residualDiagnostics = object(read(solve, "residualDiagnostics"));
  const anchor = object(read(value ?? {}, "anchor"));
  const efficiencyReason = read(value ?? {}, "efficiencyNullReason");
  const targetCriteria = Array.isArray(read(target, "criteria")) ? read(target, "criteria") as unknown[] : [];
  const assumptions = flagsOf(read(value ?? {}, "assumptions"));
  const trials = records(read(value ?? {}, "trialEvidence", "provenanceTrials", "trials"));
  const identity = partialTransferResultIdentity(value);
  // A missing baseline means the authoritative pre-run GET failed; the
  // displayed row must never be treated as the current run's outcome.
  const valueIsNewerThanBaseline = baseline
    ? isNewerPartialTransferResult(value, baseline)
    : false;
  const savedResultLabel = identity.id == null && identity.createdAt == null
    ? "saved result"
    : `saved result ${identity.id == null ? "" : `#${identity.id}`} ${identity.createdAt == null ? "" : `from ${new Date(identity.createdAt).toLocaleString()}`}`.trim();
  return <section data-testid="partial-transfer-physical-sizing-panel" className="overflow-hidden rounded-md border-2 border-cyan-700/50 bg-white">
    <div className="border-b border-cyan-200 bg-cyan-50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-800">Stage 4 · separate partial-transfer pre-pilot estimate</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-950">Direct nonlinear partial-transfer candidate sizing</h2>
        <span className="rounded border border-cyan-300 bg-white px-2 py-1 font-mono text-[10px] font-semibold">Status: {status}</span>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-700">User-triggered, isolated D/H candidate search seeded by the owned verified strict λ=8e-9, 2 m anchor. Every candidate re-solves the coupled 189 equations at λ=8e-9; it does not queue, resume, or run λ=1 Job C.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" data-testid="evaluate-partial-transfer-physical-sizing" onClick={onEvaluate}
           disabled={!canEvaluate || disabled || evaluating || runInProgress} className="rounded border border-cyan-700 bg-white px-2 py-1 text-[10px] font-semibold text-cyan-900 disabled:cursor-not-allowed disabled:opacity-50">
          {evaluating || runInProgress ? "Solving bounded candidates…" : "Run partial-transfer candidate sizing"}
        </button>
        {onRefresh ? <button type="button" data-testid="refresh-partial-transfer-saved-result" onClick={onRefresh}
           disabled={!canEvaluate || disabled || refreshing} className="rounded border border-slate-500 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
          {refreshing ? "Refreshing saved result…" : "Refresh saved result"}
        </button> : null}
      </div>
      {runInProgress ? <div role="status" aria-live="polite" className="mt-2 rounded border border-cyan-400 bg-white p-2 text-[10px] text-cyan-950">
        <p className="font-semibold">{runStatus === "baseline" ? "READING SAVED RESULT — establishing an authoritative baseline." : runStatus === "running" ? "RUNNING — waiting for a newer saved child result." : "OUTCOME UNKNOWN — the POST response did not establish the saved child outcome."}</p>
        <p className="mt-1">{runStatus === "baseline" ? "The explicit solver request has not started. A failed baseline GET will not start a solver." : "Monitoring uses read-only GET requests only; it never starts another solver."} {value ? `The ${savedResultLabel} below is retained as historical evidence until a newer id/time is observed.` : "No saved result is available yet."}</p>
      </div> : null}
      {runStatus === "blocked" ? <div role="alert" className="mt-2 rounded border border-red-400 bg-red-50 p-2 text-[10px] text-red-950">
        <p className="font-semibold">BLOCKED — definitive dependency result; no solver remains in flight.</p>
        <p className="mt-1">{runError ?? "The server rejected this request before a saved result was created."}</p>
      </div> : null}
      {runStatus === "timed_out" ? <div role="alert" className="mt-2 rounded border border-amber-400 bg-amber-50 p-2 text-[10px] text-amber-950">
        <p className="font-semibold">POST response unavailable; bounded reconciliation stopped.</p>
        <p className="mt-1">{runError ?? "No newer saved result was observed before the reconciliation deadline."}</p>
        {value ? <p className="mt-1">The displayed record remains the last saved result and is not presented as this run.</p> : null}
      </div> : null}
      {runStatus === "completed" ? <p role="status" className="mt-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-[10px] font-semibold text-emerald-950">Latest saved child reconciled from the read-only endpoint.</p> : null}
      {runError && runInProgress ? <p role="alert" className="mt-2 font-mono text-[10px] text-amber-800">{runError}</p> : null}
    </div>
    {loading ? <div role="status" className="p-4 text-xs text-slate-600">Loading separate partial-transfer estimate…</div>
      : !value ? <div className="p-4 text-xs text-slate-700"><p>{runInProgress ? "No saved result is available while this run is in progress." : "No separate estimate is available."}</p>{error ? <p className="mt-1 font-mono text-[10px] text-amber-800">{error}</p> : null}</div>
      : <div className="space-y-3 p-3">
        {error ? <p className="font-mono text-[10px] text-amber-800">{error}</p> : null}
        {read(value, "staleStatus") ? <p className="rounded border border-amber-300 bg-amber-50 p-2 text-[10px] font-semibold text-amber-950">STALE: {stringValue(read(value, "reason"))}</p> : null}
        {runHasUnreconciledOutcome && !valueIsNewerThanBaseline ? <p data-testid="partial-transfer-historical-result" className="rounded border border-amber-300 bg-amber-50 p-2 text-[10px] font-semibold text-amber-950">
          HISTORICAL SAVED RESULT — {savedResultLabel}. This record predates the run under review and is not its outcome.
        </p> : null}
        {read(value, "reason", "statusReason", "blockingReason") ? <p data-testid="partial-transfer-result-reason" className="rounded border border-cyan-200 bg-cyan-50/30 p-2 text-[10px] text-slate-800">
          <span className="font-semibold">Saved result reason:</span> {stringValue(read(value, "reason", "statusReason", "blockingReason"))}
        </p> : null}
        <section data-testid="partial-transfer-result-provenance" className="rounded border border-cyan-200 bg-cyan-50/30 p-2 text-[10px]">
          <h3 className="font-semibold text-slate-900">Saved result provenance</h3>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-slate-500">Saved result ID</dt><dd className="font-mono">{stringValue(read(value, "id", "resultId", "savedId"), "Unavailable")}</dd></div>
            <div><dt className="text-slate-500">Saved result time</dt><dd className="font-mono">{stringValue(read(value, "createdAt", "created_at", "savedAt"), "Unavailable")}</dd></div>
            <div><dt className="text-slate-500">Source run ID</dt><dd className="break-all font-mono">{stringValue(read(value, "sourceRunId", "sourceJobId", "anchorJobId") ?? read(anchor, "sourceRunId", "sourceJobId", "anchorJobId"), "Unavailable")}</dd></div>
            <div><dt className="text-slate-500">Source run time</dt><dd className="font-mono">{stringValue(read(value, "sourceRunTime", "sourceRunCreatedAt", "sourceRunCompletedAt", "sourceCreatedAt", "sourceCompletedAt") ?? read(anchor, "sourceRunTime", "sourceRunCreatedAt", "sourceRunCompletedAt", "createdAt", "completedAt"), "Unavailable")}</dd></div>
          </dl>
        </section>
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Required active height", metricValue(read(value, "requiredActiveHeightM"), "m")],
            ["Selected candidate diameter", metricValue(read(geometry, "columnDiameterM"), "m")],
            ["Selected candidate RPM", scalarOrUnavailable(read(geometry, "rpm"))],
            ["Physical compartments", "Not inferred from numerical FV cells"],
            ["Stage efficiency", "Not calculated — physical model evidence required"],
            ["Stage 1 recovery target", metricValue(read(target, "recoveryPct"), "%")],
            ["Solved recovery", metricValue(read(solve, "recoveryPctNmpFreeRrboHydrocarbonMassBasis"), "%")],
            ["Balance residual", scalarOrUnavailable(read(residualDiagnostics, "maxGlobalComponentBalanceResidualMolS"))],
            ["Minimum flow", scalarOrUnavailable(read(residualDiagnostics, "minimumLocalComponentFlowMolS"))],
            ["Strict anchor state", stringValue(read(anchor, "profileStateSha256"), "Unavailable")],
          ].map(([label, item]) => <div key={String(label)} className="rounded border border-cyan-200 bg-cyan-50/40 p-2"><dt className="text-[9px] text-slate-600">{label}</dt><dd className="mt-1 break-words font-mono text-[10px] text-slate-900">{item}</dd></div>)}
        </dl>
        {targetCriteria.length ? <div className="rounded border border-cyan-200 bg-cyan-50/30 p-2 text-[10px] text-slate-700">
          <p className="font-semibold text-slate-900">Saved Stage 1 target checks</p>
          <ul className="mt-1 space-y-0.5 font-mono">{targetCriteria.map((entry, index) => {
            const criterion = object(entry);
            return <li key={`${stringValue(read(criterion, "name"), "criterion")}-${index}`}>
              {stringValue(read(criterion, "name"))}: {stringValue(read(criterion, "status"), "NOT_EVALUATED")}
              {" "}({scalarOrUnavailable(read(criterion, "actual"))} {stringValue(read(criterion, "comparator"))} {scalarOrUnavailable(read(criterion, "target"))})
            </li>;
          })}</ul>
          <p className="mt-1 text-amber-900">Sulfur is explicitly not evaluated by this seven-component model; it is not treated as a passed separation criterion.</p>
        </div> : null}
        <p className="text-[10px] text-slate-700">Stage efficiency is intentionally not inferred from N<sub>T</sub>, numerical cells, or height. Missing prerequisite: <span className="font-mono">{stringValue(efficiencyReason, "SUPPORTED_PHYSICAL_COMPARTMENT_EFFICIENCY_MODEL_REQUIRED")}</span>.</p>
        <p className="text-[10px] text-slate-700">Equations: <span className="font-mono break-all">{flagsOf(read(value, "equations")).join(" | ")}</span></p>
        {assumptions.length ? <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-slate-600">{assumptions.map(item => <li key={item}>{item}</li>)}</ul> : null}
        <section data-testid="partial-transfer-trial-diagnostics" className="rounded border border-cyan-200 bg-white p-2">
          <h3 className="text-[10px] font-semibold text-slate-900">Full candidate trial diagnostics</h3>
          {trials.length ? <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[980px] text-left text-[10px]">
            <thead className="bg-cyan-950 text-white"><tr><th className="px-2 py-2">Trial</th><th className="px-2 py-2">Status / reason</th><th className="px-2 py-2">Candidate D [m]</th><th className="px-2 py-2">Candidate H [m]</th><th className="px-2 py-2">Solver / timeout evidence</th><th className="px-2 py-2">Returned diagnostic record</th></tr></thead>
            <tbody className="divide-y divide-slate-200">{trials.map((trial, index) => {
              const candidate = object(read(trial, "candidate", "selectedCandidate", "design"));
              const candidateDiameter = read(candidate, "columnDiameterM", "diameterM")
                ?? read(trial, "columnDiameterM", "diameterM")
                ?? read(geometry, "columnDiameterM");
              const candidateHeight = read(candidate, "compartmentHeightM", "heightM")
                ?? read(trial, "heightM", "compartmentHeightM")
                ?? read(object(read(trial, "selected")), "heightM");
              const checkpoints = ["lowerBracket", "upperBracket", "seed", "maximum", "middle", "selected"]
                .map(key => [key, object(read(trial, key))] as const)
                .filter(([, checkpoint]) => Object.keys(checkpoint).length > 0);
              const solverEvidence = [
                read(trial, "solverReason", "terminationReason", "timeoutReason", "failureReason", "reason"),
                ...checkpoints.map(([key, checkpoint]) => {
                  const reason = read(checkpoint, "solverReason", "terminationReason", "timeoutReason", "failureReason", "reason", "message", "error");
                  const statusValue = read(checkpoint, "solverStatus", "terminationStatus", "status");
                  return reason ?? (statusValue == null ? null : `${key}: ${String(statusValue)}`);
                }),
              ].filter(item => item != null).map(String);
              return <tr key={`${stringValue(read(trial, "trialId", "ordinal"), index)}-${index}`} className="align-top">
                <td className="px-2 py-2 font-mono">{stringValue(read(trial, "trialId", "ordinal"), String(index + 1))}</td>
                <td className="px-2 py-2"><span className="font-semibold">{stringValue(read(trial, "status", "hydraulicStatus"))}</span>{read(trial, "reason") ? <><br /><span className="text-slate-600">{String(read(trial, "reason"))}</span></> : null}</td>
                <td className="px-2 py-2 font-mono">{metricValue(candidateDiameter, "m")}</td>
                <td className="px-2 py-2 font-mono">{metricValue(candidateHeight, "m")}</td>
                <td className="px-2 py-2 font-mono break-words">{solverEvidence.length ? solverEvidence.join(" · ") : "No solver/timeout reason returned"}</td>
                <td className="px-2 py-2"><details><summary className="cursor-pointer font-semibold">Show actual fields</summary><pre className="mt-1 max-h-48 max-w-[460px] overflow-auto whitespace-pre-wrap">{JSON.stringify(trial, null, 2)}</pre></details></td>
              </tr>;
            })}</tbody>
          </table></div> : <p className="mt-2 text-[10px] text-slate-600">No trial evidence was returned.</p>}
        </section>
      </div>}
  </section>;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function gatePercent(value: number | null): string {
  return value == null || !Number.isFinite(value)
    ? "Unavailable"
    : `${((value / JOB_C_RESIDUAL_LIMIT) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function gateVerdict(value: boolean | null): string {
  return value == null ? "PENDING" : value ? "PASS" : "FAIL";
}

function heightCandidateValue(heightCandidateM: number | null | undefined): string {
  return heightCandidateM == null || !Number.isFinite(heightCandidateM)
    ? "Unavailable"
    : `${heightCandidateM.toLocaleString(undefined, { maximumFractionDigits: 4 })} m`;
}

function normalizeJobCJob(value: unknown): JobCJob {
  const payload = object(value);
  const progress = object(read(payload, "progress"));
  const rawStatus = stringValue(read(payload, "status"), "failed").toLowerCase();
  const status: JobCStatus = ["pending", "running", "completed", "blocked", "failed", "cancelled"].includes(rawStatus)
    ? rawStatus as JobCStatus
    : "failed";
  const completed = optionalNumber(read(progress, "completed") ?? read(payload, "progressCompleted"));
  const total = optionalNumber(read(progress, "total") ?? read(payload, "progressTotal"));
  const result = parseObject(read(payload, "result_snapshot", "result"));
  const partialResult = parseObject(read(payload, "partialResult", "partial_result", "partialResultSnapshot"));
  const scientificCompletedValue = read(payload, "scientificCompleted", "scientific_completed");
  const residualKind = read(progress, "residualKind") ?? read(payload, "residualKind");
  const queuedPrepared = object(read(object(read(payload, "input")), "prepared"));
  const queuedResponseBasis = object(read(queuedPrepared, "responseBasis"));
  const diagnosticOnly = Boolean(read(result, "diagnosticOnly")
    ?? read(queuedResponseBasis, "diagnosticMode"));
  const workflowTestOnly = Boolean(read(payload, "workflowTestOnly")
    ?? read(result, "workflowTestOnly")
    ?? read(object(read(queuedResponseBasis, "diagnosticMode")), "workflowTestOnly"));
  return {
    jobId: stringValue(read(payload, "jobId", "id"), ""),
    status,
    progress: {
      phase: read(progress, "phase") == null ? null : String(read(progress, "phase")),
      message: read(progress, "message") == null ? null : String(read(progress, "message")),
      completed,
      total,
      iteration: optionalNumber(read(progress, "iteration") ?? read(payload, "iteration")),
      residual: optionalNumber(read(progress, "residual") ?? read(payload, "residual")),
      residualKind: residualKind == null ? null : String(residualKind),
      elapsedSeconds: optionalNumber(read(progress, "elapsedSeconds") ?? read(payload, "elapsedSeconds")),
      heightCandidateM: optionalNumber(read(progress, "heightCandidateM") ?? read(payload, "heightCandidateM")),
      continuationLambda: optionalNumber(read(progress, "continuationLambda") ?? read(payload, "continuationLambda")),
      continuationTrial: optionalNumber(read(progress, "continuationTrial") ?? read(payload, "continuationTrial")),
      acceptedLowerLambda: optionalNumber(read(progress, "acceptedLowerLambda") ?? read(payload, "acceptedLowerLambda")),
      rejectedUpperLambda: optionalNumber(read(progress, "rejectedUpperLambda") ?? read(payload, "rejectedUpperLambda")),
      rawFvResidualMolS: optionalNumber(read(progress, "rawFvResidualMolS")),
      scaledFvResidual: optionalNumber(read(progress, "scaledFvResidual")),
      maximumOriginalJobBGateResidual: optionalNumber(read(progress, "maximumOriginalJobBGateResidual")),
      minimumFlowMolS: optionalNumber(read(progress, "minimumFlowMolS")),
      rawFvGatePassed: booleanValue(read(progress, "rawFvGatePassed")),
      scaledFvGatePassed: booleanValue(read(progress, "scaledFvGatePassed")),
      originalJobBGatePassed: booleanValue(read(progress, "originalJobBGatePassed")),
      strictPositivityPassed: booleanValue(read(progress, "strictPositivityPassed")),
      accepted: booleanValue(read(progress, "accepted")),
    },
    result: Object.keys(result).length ? result : null,
    // Older jobs did not expose this field; their completed result remains
    // displayable while new jobs require the explicit scientific completion.
    scientificCompleted: !diagnosticOnly && (
      typeof scientificCompletedValue === "boolean" ? scientificCompletedValue : status === "completed"
    ),
    partialResult: Object.keys(partialResult).length ? partialResult : null,
    partialResultHash: read(payload, "partialResultHash", "partial_result_hash") == null ? null : String(read(payload, "partialResultHash", "partial_result_hash")),
    diagnostics: (() => {
      const diagnostics = parseObject(read(payload, "scientificDiagnostics", "diagnostics", "details"));
      return Object.keys(diagnostics).length ? diagnostics : null;
    })(),
    diagnosticOnly,
    workflowTestOnly,
    error: read(payload, "error", "message") == null ? null : String(read(payload, "error", "message")),
  };
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
  const [activeJob, setActiveJob] = useState<"A" | "B" | "C" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobBDiagnostic, setJobBDiagnostic] = useState<RecordValue | null>(null);
  const [jobCEvaluation, setJobCEvaluation] = useState<JobAResponse | null>(null);
  const [jobCDiagnostic, setJobCDiagnostic] = useState<RecordValue | null>(null);
  const [jobCJob, setJobCJob] = useState<JobCJob | null>(null);
  const [jobCPollError, setJobCPollError] = useState<string | null>(null);
  const [jobCSubmitting, setJobCSubmitting] = useState(false);
  const [jobCStopping, setJobCStopping] = useState(false);
  // Physical sizing is loaded from its own read-only endpoint. Keep these
  // hooks after the existing Job-C hooks so diagnostic review state remains
  // independent from the sizing panel.
  const [physicalSizing, setPhysicalSizing] = useState<RecordValue | null>(null);
  const [physicalSizingLoading, setPhysicalSizingLoading] = useState(false);
  const [physicalSizingError, setPhysicalSizingError] = useState<string | null>(null);
  const [physicalSizingSubmitting, setPhysicalSizingSubmitting] = useState(false);
  const [partialTransferSizing, setPartialTransferSizing] = useState<RecordValue | null>(null);
  const [partialTransferSizingLoading, setPartialTransferSizingLoading] = useState(false);
  const [partialTransferSizingError, setPartialTransferSizingError] = useState<string | null>(null);
  const [partialTransferSizingSubmitting, setPartialTransferSizingSubmitting] = useState(false);
  // These hooks intentionally follow the existing state list: a few static
  // server-rendered regression tests provide positional state values.
  const [partialTransferRunStatus, setPartialTransferRunStatus] = useState<PartialTransferControllerPhase>("idle");
  const [partialTransferRunError, setPartialTransferRunError] = useState<string | null>(null);
  const [partialTransferRunBaseline, setPartialTransferRunBaseline] = useState<PartialTransferResultIdentity | null>(null);
  const priorJobCStatus = useRef<JobCStatus | null>(null);
  const partialTransferDesignId = useRef<number | null>(null);
  partialTransferDesignId.current = Number.isFinite(Number(design?.id)) ? Number(design?.id) : null;
  const partialTransferController = useRef<PartialTransferResultController | null>(null);
  if (!partialTransferController.current) {
    partialTransferController.current = new PartialTransferResultController({
      callbacks: {
        onPhase: (phase) => {
          setPartialTransferRunStatus(phase);
          if (phase === "baseline") setPartialTransferRunBaseline(null);
          if (["completed", "blocked", "timed_out"].includes(phase)) {
            setPartialTransferSizingSubmitting(false);
          }
        },
        onResult: (value, source) => {
          setPartialTransferSizing(value);
          setPartialTransferSizingError(null);
          if (source === "baseline") {
            setPartialTransferRunBaseline(partialTransferResultIdentity(value));
          }
        },
        onGetError: (message, source) => {
          // Keep any saved row visible alongside a meaningful read error.
          setPartialTransferSizingError(message);
          if (source === "baseline") setPartialTransferRunError(message);
        },
        onPostError: (message) => setPartialTransferRunError(message),
        onLoading: setPartialTransferSizingLoading,
      },
      isDesignCurrent: (designId) => partialTransferDesignId.current === designId,
    });
  }
  const jobCRunning = jobCSubmitting || jobCJob?.status === "pending" || jobCJob?.status === "running";
  // The server owns all Job B lineage and prerequisite validation. Requiring
  // Job B React state here incorrectly disables Job C after a page reload.
  const canStartJobC = Boolean(design);
  const running = activeJob !== null || jobCRunning || jobCStopping;

  const applyJobCJob = useCallback((value: unknown) => {
    const job = normalizeJobCJob(value);
    setJobCJob(job);
    if (!["pending", "running"].includes(job.status)) setJobCStopping(false);
    if (job.diagnosticOnly && job.result) {
      // A qualified partial-transfer endpoint is intentionally not fed into
      // the normal calculated-height panel or scientific acceptance state.
      setJobCEvaluation(null);
      setJobCDiagnostic(job.result);
    } else if (job.status === "completed" && job.scientificCompleted && job.result) {
      setJobCEvaluation(job.result);
      setJobCDiagnostic(null);
    } else if (job.status === "cancelled") {
      // A checkpoint is useful for analysis/restart, but it is never a
      // completed calculation or an accepted height result.
      setJobCEvaluation(null);
      setJobCDiagnostic(null);
    } else if (job.status === "blocked") {
      setJobCEvaluation(null);
      setJobCDiagnostic({
        ...(job.result ?? {}),
        ...(job.diagnostics ? { details: job.diagnostics } : {}),
        error: job.error ?? read(job.result ?? {}, "error", "message", "status"),
      });
    }
    return job;
  }, []);

  const loadPhysicalSizing = useCallback(async (designId: number) => {
    setPhysicalSizingLoading(true);
    setPhysicalSizingError(null);
    try {
      const response = await fetch(`/api/ecr-pre-pilot/designs/${designId}/job-c/physical-sizing/latest`, { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPhysicalSizing(null);
        setPhysicalSizingError(stringValue(read(object(payload), "reason", "message", "error"), "The latest physical sizing assessment is unavailable."));
        return;
      }
      const directResult = object(read(object(payload), "physicalSizing", "result", "data") ?? payload);
      setPhysicalSizing(Object.keys(directResult).length ? directResult : null);
      if (!Object.keys(directResult).length) {
        setPhysicalSizingError("The physical sizing endpoint returned no direct result.");
      }
    } catch (cause: unknown) {
      setPhysicalSizing(null);
      setPhysicalSizingError(cause instanceof Error ? cause.message : "The latest physical sizing assessment could not be loaded.");
    } finally {
      setPhysicalSizingLoading(false);
    }
  }, []);

  const evaluatePhysicalSizing = useCallback(async () => {
    const designId = Number(design?.id);
    if (!Number.isFinite(designId)) return;
    const isCurrent = () => partialTransferDesignId.current === designId;
    setPhysicalSizingSubmitting(true);
    // POST is only an evaluation request. Its response can become stale before
    // it reaches the browser, so only GET's current-lineage representation may
    // populate the physical-geometry panel.
    setPhysicalSizing(null);
    setPhysicalSizingError(null);
    try {
      const response = await fetch(
        `/api/ecr-pre-pilot/designs/${designId}/job-c/physical-sizing/evaluate`,
        { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      const payload = await response.json().catch(() => ({}));
      const evaluationError = !response.ok
        ? stringValue(read(object(payload), "reason", "message", "error"),
          "Physical sizing could not be evaluated.")
        : null;
      if (!isCurrent()) return;
      await loadPhysicalSizing(designId);
      if (!isCurrent()) return;
      if (!response.ok) {
        setPhysicalSizingError(evaluationError);
      }
    } catch (cause: unknown) {
      if (!isCurrent()) return;
      // A timeout can occur after the server has persisted a child result;
      // reload current authority rather than leaving a direct POST value.
      await loadPhysicalSizing(designId);
      setPhysicalSizingError(cause instanceof Error ? cause.message : "Physical sizing could not be evaluated.");
    } finally {
      if (!isCurrent()) return;
      setPhysicalSizingSubmitting(false);
    }
  }, [design?.id, loadPhysicalSizing]);

  const loadPartialTransferSizing = useCallback(async (designId: number) => {
    return partialTransferController.current?.refresh(designId);
  }, []);

  const evaluatePartialTransferSizing = useCallback(() => {
    const designId = Number(design?.id);
    if (!Number.isFinite(designId) || loading || partialTransferSizingLoading
      || ["baseline", "running", "reconciling"].includes(partialTransferRunStatus)) return;
    setPartialTransferRunError(null);
    setPartialTransferSizingSubmitting(true);
    setPartialTransferSizingError(null);
    // The explicit POST route /partial-transfer-physical-sizing/evaluate is
    // intentionally kept in the controller; this call starts no solver until
    // the authoritative baseline GET succeeds.
    void partialTransferController.current?.evaluate(designId);
  }, [design?.id, loading, partialTransferRunStatus, partialTransferSizingLoading]);

  useEffect(() => {
    const status = jobCJob?.status ?? null;
    const prior = priorJobCStatus.current;
    priorJobCStatus.current = status;
    const becameTerminal = status !== null
      && ["completed", "blocked", "failed", "cancelled"].includes(status)
      && prior !== status;
    const designId = Number(design?.id);
    if (becameTerminal && Number.isFinite(designId)) {
      // A newly terminal Job C can supersede the parent of an existing sizing
      // child. Clear it immediately, then render only the refreshed GET view.
      setPhysicalSizing(null);
      setPhysicalSizingError(null);
      void loadPhysicalSizing(designId);
    }
  }, [design?.id, jobCJob?.status, loadPhysicalSizing]);

  const loadDesign = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActiveJob(null);
    setEvaluation(null);
    setJobBEvaluation(null);
    setJobBDiagnostic(null);
    setJobCEvaluation(null);
    setJobCDiagnostic(null);
    setJobCJob(null);
    setJobCPollError(null);
    setJobCSubmitting(false);
    setJobCStopping(false);
    setPhysicalSizing(null);
    setPhysicalSizingError(null);
    setPartialTransferSizingLoading(true);
    setPartialTransferSizing(null);
    setPartialTransferSizingError(null);
    try {
      const response = await fetch("/api/ecr-pre-pilot/designs/latest-saved", { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 404) throw new Error("Save Stage 1 inputs before opening Job-A coefficient testing.");
      if (!response.ok) throw new Error(stringValue(read(object(payload), "message", "error"), "The latest saved design could not be loaded."));
      const loadedDesign = object(payload);
      // Keep evaluate disabled during the hand-off to the authoritative
      // latest-result GET started by the design-id effect.
      setPartialTransferSizingLoading(true);
      setDesign(loadedDesign);
      const designId = Number(loadedDesign.id);
      if (Number.isFinite(designId)) {
        // The state update renders on the next turn; establish the lineage
        // guard before starting these read-only child requests.
        partialTransferDesignId.current = designId;
        void loadPhysicalSizing(designId);
      }
    } catch (cause: unknown) {
      setDesign(null);
      setPartialTransferSizingLoading(false);
      setError(cause instanceof Error ? cause.message : "The latest saved design could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [loadPhysicalSizing, loadPartialTransferSizing]);

  useEffect(() => { void loadDesign(); }, [loadDesign]);

  useEffect(() => {
    // A design change invalidates every in-flight child GET and every
    // reconciliation timer. Polling is deliberately never a solver trigger.
    partialTransferController.current?.stop();
    setPartialTransferRunStatus("idle");
    setPartialTransferRunError(null);
    setPartialTransferRunBaseline(null);
    setPartialTransferSizingSubmitting(false);
    setPartialTransferSizingLoading(false);
    setActiveJob(null);
    setPhysicalSizingSubmitting(false);
    setJobCSubmitting(false);
    setJobCStopping(false);
    const id = Number(design?.id);
    if (Number.isFinite(id)) void loadPartialTransferSizing(id);
    return () => {
      partialTransferController.current?.stop();
    };
  }, [design?.id, loadPartialTransferSizing]);

  useEffect(() => {
    const id = Number(design?.id);
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    const restoreLatestJobC = async () => {
      try {
        const response = await fetch(`/api/ecr-pre-pilot/designs/${id}/job-c/jobs/latest`, { credentials: "include" });
        if (response.status === 404) return;
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(stringValue(read(object(payload), "error", "message"), "Latest Job C job could not be loaded."));
        if (!cancelled) {
          applyJobCJob(payload);
          setJobCPollError(null);
        }
      } catch (cause: unknown) {
        if (!cancelled) setJobCPollError(cause instanceof Error ? cause.message : "Latest Job C job could not be loaded.");
      }
    };
    void restoreLatestJobC();
    return () => { cancelled = true; };
  }, [design?.id, applyJobCJob]);

  useEffect(() => {
    const id = Number(design?.id);
    if (!Number.isFinite(id) || !jobCJob?.jobId || !["pending", "running"].includes(jobCJob.status)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/ecr-pre-pilot/designs/${id}/job-c/jobs/${jobCJob.jobId}`, { credentials: "include" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(stringValue(read(object(payload), "error", "message"), "Job C status could not be loaded."));
        if (!cancelled) {
          applyJobCJob(payload);
          setJobCPollError(null);
        }
      } catch (cause: unknown) {
        if (!cancelled) {
          // Keep the last pending/running record and continue polling. A
          // temporary transport failure is not a terminal scientific result.
          setJobCPollError(cause instanceof Error ? cause.message : "Job C status could not be loaded.");
        }
      }
    };
    const timer = window.setInterval(() => void poll(), 1_500);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [design?.id, jobCJob?.jobId, jobCJob?.status, applyJobCJob]);

  const runEvaluation = async () => {
    const id = Number(design?.id);
    if (!Number.isFinite(id)) return;
    const isCurrent = () => partialTransferDesignId.current === id;
    setActiveJob("A");
    setError(null);
    setEvaluation(null);
    setJobBEvaluation(null);
    setJobBDiagnostic(null);
    setJobCEvaluation(null);
    setJobCDiagnostic(null);
    setJobCJob(null);
    setJobCPollError(null);
    try {
      const response = await fetch(`/api/ecr-pre-pilot/designs/${id}/job-a/evaluate`, { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(stringValue(read(object(payload), "message", "error"), "Job-A evaluation did not complete."));
      setEvaluation(object(payload));
      toast({ title: "Job-A evaluation completed", description: "The returned coefficients are shown below without client-side reconstruction." });
    } catch (cause: unknown) {
      if (!isCurrent()) return;
      const message = cause instanceof Error ? cause.message : "Job-A evaluation did not complete.";
      setError(message);
      toast({ title: "Job-A evaluation blocked", description: message, variant: "destructive" });
    } finally {
      if (!isCurrent()) return;
      setActiveJob(null);
    }
  };

  const runJobBEvaluation = async () => {
    const id = Number(design?.id);
    if (!Number.isFinite(id)) return;
    const isCurrent = () => partialTransferDesignId.current === id;
    setActiveJob("B");
    setError(null);
    setJobBEvaluation(null);
    setJobBDiagnostic(null);
    setJobCEvaluation(null);
    setJobCDiagnostic(null);
    setJobCJob(null);
    setJobCPollError(null);
    try {
      const response = await fetch(`/api/ecr-pre-pilot/designs/${id}/job-b/evaluate`, { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!response.ok) {
        if (payload.details) setJobBDiagnostic(object(payload.details));
        throw new Error(stringValue(read(object(payload), "message", "error"), "Job-B local flux test did not complete."));
      }
      setJobBEvaluation(object(payload));
      toast({ title: "Job-B local test completed", description: "Seven-component fluxes and local Stage-3 coupling are shown below. No column sizing was performed." });
    } catch (cause: unknown) {
      if (!isCurrent()) return;
      const message = cause instanceof Error ? cause.message : "Job-B local flux test did not complete.";
      setError(message);
      toast({ title: "Job-B local test blocked", description: message, variant: "destructive" });
    } finally {
      if (!isCurrent()) return;
      setActiveJob(null);
    }
  };

  const runJobCEvaluation = async () => {
    const id = Number(design?.id);
    if (!Number.isFinite(id) || !canStartJobC || jobCRunning || jobCStopping) return;
    const isCurrent = () => partialTransferDesignId.current === id;
    setJobCSubmitting(true);
    setError(null);
    setJobCEvaluation(null);
    setJobCDiagnostic(null);
    setJobCPollError(null);
    try {
      const response = await fetch(`/api/ecr-pre-pilot/designs/${id}/job-c/diagnostic/strict/jobs`, { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!response.ok) {
        const blockedPayload = object(payload);
        const message = stringValue(read(blockedPayload, "message", "error"), "Job C could not be started.");
        if (read(blockedPayload, "details")) {
          setJobCDiagnostic({ error: message, details: object(read(blockedPayload, "details")) });
        }
        throw new Error(message);
      }
      applyJobCJob(payload);
      toast({ title: "Job C strict diagnostic queued", description: "Strict partial-transfer target λ = 8.000e-9. The solver attempts convergence with all scientific gates enforced. An earlier blocker may prevent reaching the target; this cannot accept a column design." });
    } catch (cause: unknown) {
      if (!isCurrent()) return;
      const message = cause instanceof Error ? cause.message : "Job C could not be started.";
      setError(message);
      toast({ title: "Job C could not start", description: message, variant: "destructive" });
    } finally {
      if (!isCurrent()) return;
      setJobCSubmitting(false);
    }
  };

  // This action intentionally contains no source job id, checkpoint, lambda,
  // or physical input. The authenticated server chooses an owned immutable
  // strict-diagnostic record and rejects it unless it remains compatible.
  const runFullJobCFromStrictAnchor = async () => {
    const id = Number(design?.id);
    if (!Number.isFinite(id) || !canStartJobC || jobCRunning || jobCStopping) return;
    const isCurrent = () => partialTransferDesignId.current === id;
    setJobCSubmitting(true);
    setError(null);
    setJobCEvaluation(null);
    setJobCDiagnostic(null);
    setJobCPollError(null);
    try {
      const response = await fetch(
        `/api/ecr-pre-pilot/designs/${id}/job-c/continuation/strict-anchor/jobs`,
        { method: "POST", credentials: "include" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!response.ok) {
        const blockedPayload = object(payload);
        const message = stringValue(read(blockedPayload, "message", "error"),
          "Full Job C continuation could not be started.");
        if (read(blockedPayload, "details")) {
          setJobCDiagnostic({ error: message, details: object(read(blockedPayload, "details")) });
        }
        throw new Error(message);
      }
      applyJobCJob(payload);
      toast({
        title: "Full Job C continuation queued",
        description: "The server selected a verified strict λ = 8.000e-9 / 2 m diagnostic anchor. The worker must re-evaluate that anchor before continuing the normal λ = 1 sequence. This action does not establish sizing eligibility.",
      });
    } catch (cause: unknown) {
      if (!isCurrent()) return;
      const message = cause instanceof Error ? cause.message : "Full Job C continuation could not be started.";
      setError(message);
      toast({ title: "Full Job C continuation blocked", description: message, variant: "destructive" });
    } finally {
      if (!isCurrent()) return;
      setJobCSubmitting(false);
    }
  };

  const cancelJobC = async () => {
    const id = Number(design?.id);
    if (!Number.isFinite(id) || !jobCJob?.jobId || !["pending", "running"].includes(jobCJob.status) || jobCStopping) return;
    const isCurrent = () => partialTransferDesignId.current === id;
    setJobCStopping(true);
    try {
      const response = await fetch(
        `/api/ecr-pre-pilot/designs/${id}/job-c/jobs/${jobCJob.jobId}/cancel`,
        { method: "POST", credentials: "include" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(stringValue(read(object(payload), "error", "message"), "Job C could not be cancelled."));
      // Some compatible cancel endpoints acknowledge only the request. Keep
      // the live record in that case so the status poll can observe cancelled.
      if (read(object(payload), "status") !== undefined) applyJobCJob(payload);
      setJobCPollError(null);
      toast({ title: "Job C stop requested", description: "Polling continues until the calculation reports its terminal status." });
    } catch (cause: unknown) {
      if (!isCurrent()) return;
      setJobCStopping(false);
      toast({
        title: "Job C could not be cancelled",
        description: cause instanceof Error ? cause.message : "The cancel request failed.",
        variant: "destructive",
      });
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
  const jobCResult = useMemo(() => resultOf(jobCEvaluation), [jobCEvaluation]);
  const jobCStatus = read(jobCResult, "status", "executionStatus", "calculationStatus");
  const jobCCalculated = calculatedStatus(jobCStatus);
  const jobCInputAudit = object(read(jobCResult, "inputAudit"));
  const jobCDax = object(read(jobCResult, "projectControlledDax", "preliminarySensitivityBasis", "axialDispersion", "dax", "daxBasis"));
  const jobCHeightBounds = object(read(jobCResult, "heightSearchBounds", "searchBounds", "activeHeightSearchBounds")
    ?? read(jobCDax, "activeHeightSearchM"));
  const jobCNT = object(read(jobCResult, "theoreticalCompartmentAuthority", "theoreticalStageAuthority", "ntBasis", "compartmentBasis", "numericalCompartmentBasis"));
  const selectedJobCDesign = object(read(jobCResult, "selectedDesign", "calculatedDesign"));
  const jobCWorker = object(read(jobCResult, "workerResult"));
  const queuedJobCWorker = object(read(object(jobCJob?.result), "workerResult"));
  const jobCBranchContinuation = object(
    read(object(read(queuedJobCWorker, "diagnostics")), "branchContinuation")
      ?? read(object(read(jobCWorker, "diagnostics")), "branchContinuation"),
  );
  const branchTerminalBracket = object(read(jobCBranchContinuation, "terminalBracket"));
  const branchLimiting = object(read(jobCBranchContinuation, "limiting"));
  const branchCell1Balance = object(read(jobCBranchContinuation, "lastAcceptedCell1NmpBalance", "startingCell1NmpBalance", "cell1NmpBalance"));
  const branchCell1Uncertainty = object(read(branchCell1Balance, "numericalUncertainty"));
  const branchRejectedBalance = object(read(jobCBranchContinuation, "firstRejectedCell1NmpBalance"));
  const branchRejectedUncertainty = object(read(branchRejectedBalance, "numericalUncertainty"));
  const branchPhysicalBoundary = object(read(jobCBranchContinuation, "physicalBoundary"));
  const branchPhysicalBalance = object(read(branchPhysicalBoundary, "cell1NmpBalance"));
  const branchPhysicalUncertainty = {
    ...object(read(branchPhysicalBalance, "numericalUncertainty")),
    ...object(read(branchPhysicalBoundary, "numericalUncertainty")),
  };
  const jobCNominalCase = records(read(jobCWorker, "sensitivityCases"))
    .find((item) => stringValue(read(item, "name"), "").toUpperCase() === "NOMINAL") ?? {};
  const jobCNominalSelection = object(read(jobCNominalCase, "selected"));
  const jobCCompartments = records(read(selectedJobCDesign, "cells", "compartments", "phaseProfile")).length
    ? records(read(selectedJobCDesign, "cells", "compartments", "phaseProfile"))
    : records(read(jobCResult, "cells", "compartments", "phaseProfile", "compartmentProfiles")).length
      ? records(read(jobCResult, "cells", "compartments", "phaseProfile", "compartmentProfiles"))
      : records(read(jobCNominalSelection, "cells", "compartments", "phaseProfile", "compartmentProfiles"));
  const returnedJobCComponents = read(jobCResult, "componentIds", "componentOrder", "components")
    ?? read(selectedJobCDesign, "componentIds", "componentOrder");
  const jobCComponentIds = Array.isArray(returnedJobCComponents)
    ? returnedJobCComponents.map((item) => typeof item === "string" ? item : componentName(object(item)))
    : [];
  const jobCBlockers = flagsOf(read(jobCResult, "blockers", "blockingReasons", "reasons"));
  const jobCActiveHeight = read(jobCResult, "activeHeightM", "calculatedActiveHeightM")
    ?? read(selectedJobCDesign, "activeHeightM")
    ?? read(jobCNominalSelection, "heightM", "activeHeightM");
  const jobCResidualDiagnostics = object(read(jobCNominalSelection, "residualDiagnostics"));
  const jobCGlobalBalanceResiduals = numericArray(read(jobCNominalSelection, "globalComponentBalanceResidualMolS"));
  const jobCPhaseDax = [
    ["Continuous phase", object(read(jobCDax, "axialDispersionContinuousM2S"))],
    ["Dispersed phase", object(read(jobCDax, "axialDispersionDispersedM2S"))],
  ] as Array<[string, RecordValue]>;
  const jobCProgressPercent = jobCJob
    && jobCJob.progress.completed !== null
    && jobCJob.progress.total !== null
    && jobCJob.progress.total > 0
    ? Math.max(0, Math.min(100, (jobCJob.progress.completed / jobCJob.progress.total) * 100))
    : null;
  const jobCGates = jobCJob?.progress;
  const limitingResidualGate = !jobCGates ? null : [
    { label: "Maximum raw FV residual", ratio: jobCGates.rawFvResidualMolS == null ? null : jobCGates.rawFvResidualMolS / JOB_C_RESIDUAL_LIMIT },
    { label: "Scaled FV residual", ratio: jobCGates.scaledFvResidual == null ? null : jobCGates.scaledFvResidual / JOB_C_RESIDUAL_LIMIT },
    { label: "Original Job B interface residual", ratio: jobCGates.maximumOriginalJobBGateResidual == null ? null : jobCGates.maximumOriginalJobBGateResidual / JOB_C_RESIDUAL_LIMIT },
  ].reduce<{ label: string; ratio: number } | null>((current, candidate) => (
    candidate.ratio != null && (!current || candidate.ratio > current.ratio)
      ? { label: candidate.label, ratio: candidate.ratio } : current
  ), null)?.label ?? null;
  const limitingJobCGate = jobCGates?.strictPositivityPassed === false
    ? "Strict positivity"
    : limitingResidualGate ?? "Pending first gate evaluation";
  const hasPriorJobC = Boolean(jobCJob || jobCEvaluation || jobCDiagnostic);
  const jobCDownstreamDiagnostic = object(read(jobCDiagnostic ?? {}, "diagnosticDownstreamSizing"));
  const jobCDownstreamFields = object(read(jobCDownstreamDiagnostic, "fields"));
  const jobCDownstreamUnavailableReason = read(jobCDownstreamDiagnostic, "unavailableReason");
  const jobCDiagnosticDetails = object(read(jobCDiagnostic ?? {}, "details"));
  const jobCScientificDiagnostics = object(read(jobCDiagnostic ?? {}, "scientificDiagnostics", "diagnostics"));
  const nestedJobCCauseDetails = object(
    read(jobCScientificDiagnostics, "causeDetails")
      ?? read(jobCDiagnosticDetails, "causeDetails"),
  );
  const jobCAxialPositionDetails = Object.keys(nestedJobCCauseDetails).length
    ? nestedJobCCauseDetails
    : jobCDiagnosticDetails;
  const diagnosticPositionList = (field: string) => {
    const value = read(jobCAxialPositionDetails, field);
    return Array.isArray(value)
      ? value.filter(item => typeof item === "number" && Number.isInteger(item)) as number[]
      : [];
  };
  const duplicateJobCAxialPositions = diagnosticPositionList("duplicateStageFromFeedEndPositions");
  const missingJobCAxialPositions = diagnosticPositionList("missingStageFromFeedEndPositions");
  const unexpectedJobCAxialPositions = diagnosticPositionList("unexpectedStageFromFeedEndPositions");
  const invalidJobCAxialContactIndexes = diagnosticPositionList("invalidStageFromFeedEndContactIndexes");
  const hasJobCAxialPositionDiagnostics = [
    duplicateJobCAxialPositions,
    missingJobCAxialPositions,
    unexpectedJobCAxialPositions,
    invalidJobCAxialContactIndexes,
  ].some(values => values.length > 0);

  return (
    <Layout>
      <main className="mx-auto min-h-full w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b-2 border-slate-800 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-md border border-cyan-900/30 bg-cyan-950 p-2.5 text-cyan-100"><FlaskConical className="h-5 w-5" /></div>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-800">ECR / pre-pilot / stage 04</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Mass-transfer testing · Jobs A, B &amp; C</h1>
              <p className="mt-1 text-xs text-slate-600">Governed calculation review {design?.projectNumber ? `· ${String(design.projectNumber)}` : "· latest saved design"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(STAGE_3_PATH)} className="h-8 gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" /> Stage 3 hydrodynamics</Button>
            <Button type="button" variant="outline" onClick={() => void loadDesign()} disabled={loading || running} className="h-8 gap-1.5 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh design</Button>
            <Button type="button" onClick={() => void runEvaluation()} disabled={!design || loading || running} className="h-8 gap-1.5 bg-cyan-950 text-xs hover:bg-cyan-900"><Play className="h-3.5 w-3.5" />{activeJob === "A" ? "Evaluating Job-A…" : evaluation ? "Re-run Job-A" : "Evaluate Job-A"}</Button>
            <Button type="button" onClick={() => void runJobBEvaluation()} disabled={!design || loading || running} className="h-8 gap-1.5 bg-indigo-950 text-xs hover:bg-indigo-900"><Play className="h-3.5 w-3.5" />{activeJob === "B" ? "Evaluating Job-B…" : jobBEvaluation ? "Re-run Job-B" : "Test Job-B flux"}</Button>
            <Button type="button" onClick={() => void runJobCEvaluation()} disabled={!design || !canStartJobC || loading || running} className="h-8 gap-1.5 bg-violet-950 text-xs hover:bg-violet-900">{jobCRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}{jobCJob?.status === "cancelled" ? "Restart Job C strict diagnostic" : hasPriorJobC ? "Re-run Job C strict diagnostic" : "Run Job C strict diagnostic"}</Button>
             <Button type="button" data-testid="run-full-job-c-from-strict-anchor" onClick={() => void runFullJobCFromStrictAnchor()} disabled={!design || !canStartJobC || loading || running} className="h-8 gap-1.5 bg-fuchsia-950 text-xs hover:bg-fuchsia-900"><Play className="h-3.5 w-3.5" />Run full Job C from verified strict anchor</Button>
            {jobCRunning && <Button type="button" variant="destructive" onClick={() => void cancelJobC()} disabled={jobCStopping} className="h-8 gap-1.5 text-xs">{jobCStopping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}{jobCStopping ? "Stopping" : "Stop"}</Button>}
          </div>
        </header>

        {loading ? <div className="space-y-3"><div className="h-24 animate-pulse rounded-md bg-slate-200" /><div className="h-64 animate-pulse rounded-md bg-slate-100" /></div> : error && !design ? (
          <section className="rounded-md border border-red-200 bg-red-50 p-5"><div className="flex gap-3 text-red-900"><ShieldAlert className="h-5 w-5 shrink-0" /><div><h2 className="text-sm font-semibold">Design prerequisite unavailable</h2><p className="mt-1 text-xs">{error}</p><Button type="button" variant="outline" onClick={() => void loadDesign()} className="mt-3 h-8 text-xs">Retry design load</Button></div></div></section>
        ) : (
          <div className="space-y-4">
            <PhysicalSizingPanel
              value={physicalSizing}
              loading={physicalSizingLoading}
              error={physicalSizingError}
              onEvaluate={() => void evaluatePhysicalSizing()}
              evaluating={physicalSizingSubmitting}
              canEvaluate={Boolean(design?.id)}
              disabled={loading || partialTransferSizingLoading}
            />
            <PartialTransferPhysicalSizingPanel
              value={partialTransferSizing}
              loading={partialTransferSizingLoading}
              error={partialTransferSizingError}
              onEvaluate={() => void evaluatePartialTransferSizing()}
              evaluating={partialTransferSizingSubmitting}
              canEvaluate={Boolean(design?.id)}
              onRefresh={() => {
                const designId = Number(design?.id);
                if (Number.isFinite(designId)) void loadPartialTransferSizing(designId);
              }}
              refreshing={partialTransferSizingLoading}
              runStatus={partialTransferRunStatus}
              runError={partialTransferRunError}
              baseline={partialTransferRunBaseline}
            />
            {activeJob === "B" && <div role="status" className="flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-950"><Loader2 className="h-4 w-4 shrink-0 animate-spin" /><p>Evaluating Job-A dependencies and solving the simultaneous interface chemical-potential and two-film equations before calculating fluxes. This may take several minutes. No sizing is performed.</p></div>}
            {jobCJob && <section role="status" className="rounded-md border border-violet-200 bg-violet-50 p-3 text-violet-950">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  {jobCRunning && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                  <p><span className="font-semibold">Job C:</span> {jobCStopping ? "stop requested" : jobCJob.status}</p>
                </div>
                <p className="font-mono text-[10px]">Job ID: {jobCJob.jobId || "—"}</p>
              </div>
              <div
                role="progressbar"
                aria-label="Job C scientific calculation progress"
                aria-valuemin={0}
                aria-valuemax={jobCJob.progress.total ?? undefined}
                aria-valuenow={jobCProgressPercent === null ? undefined : jobCJob.progress.completed ?? undefined}
                aria-valuetext={jobCProgressPercent === null ? "Total work is not yet known" : `${jobCJob.progress.completed} of ${jobCJob.progress.total}`}
                className="mt-3 h-2 overflow-hidden rounded-full bg-violet-200"
              >
                <div className={`h-full bg-violet-700 transition-[width] ${jobCProgressPercent === null && jobCRunning ? "animate-pulse" : ""}`} style={{ width: jobCProgressPercent === null ? (jobCRunning ? "40%" : "0%") : `${jobCProgressPercent}%` }} />
              </div>
              <div className="mt-2 grid gap-x-4 gap-y-1 text-[10px] sm:grid-cols-2 lg:grid-cols-3">
                <p><span className="font-semibold">Current phase:</span> {jobCJob.progress.phase ?? "Unavailable"}{jobCJob.progress.message ? ` · ${jobCJob.progress.message}` : ""}</p>
                <p className="font-mono"><span className="font-sans font-semibold">Work:</span> {jobCJob.progress.completed ?? "Unavailable"} / {jobCJob.progress.total ?? "Unavailable"}</p>
                <p className="font-mono"><span className="font-sans font-semibold">Iteration:</span> {jobCJob.progress.iteration ?? "Unavailable"}</p>
                <p className="font-mono"><span className="font-sans font-semibold">L2 diagnostic (not an acceptance gate):</span> {residualValue(jobCJob.progress.residual, jobCJob.progress.residualKind)}</p>
                <p className="font-mono"><span className="font-sans font-semibold">Elapsed:</span> {elapsedValue(jobCJob.progress.elapsedSeconds)}</p>
                <p className="font-mono"><span className="font-sans font-semibold">Height candidate:</span> {heightCandidateValue(jobCJob.progress.heightCandidateM)}</p>
                 <p className="font-mono"><span className="font-sans font-semibold">Active λ:</span> {jobCJob.progress.continuationLambda == null ? "Unavailable" : jobCJob.progress.continuationLambda.toExponential(3)}</p>
                 <p className="font-mono"><span className="font-sans font-semibold">Continuation trial:</span> {jobCJob.progress.continuationTrial ?? "Unavailable"}</p>
                 <p className="font-mono"><span className="font-sans font-semibold">Accepted lower λ:</span> {jobCJob.progress.acceptedLowerLambda == null ? "Unavailable" : jobCJob.progress.acceptedLowerLambda.toExponential(3)}</p>
                 <p className="font-mono"><span className="font-sans font-semibold">Rejected upper λ:</span> {jobCJob.progress.rejectedUpperLambda == null ? "Unavailable" : jobCJob.progress.rejectedUpperLambda.toExponential(3)}</p>
              </div>
              <div data-testid="job-c-governing-gates" className="mt-3 rounded border border-violet-300 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">{jobCJob.workflowTestOnly ? "Scientific Job C gates — not relaxed for workflow test" : "Governing Job C gates"}</p>
                  <p className="font-mono text-[10px]">{jobCJob.workflowTestOnly ? "Scientific gate state (not acceptance)" : "Current candidate"}: {gateVerdict(jobCJob.progress.accepted)}</p>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Maximum raw FV residual", jobCJob.progress.rawFvResidualMolS, jobCJob.progress.rawFvGatePassed],
                    ["Scaled FV residual", jobCJob.progress.scaledFvResidual, jobCJob.progress.scaledFvGatePassed],
                    ["Original Job B interface residual", jobCJob.progress.maximumOriginalJobBGateResidual, jobCJob.progress.originalJobBGatePassed],
                  ].map(([label, value, passed]) => <div key={label as string} className="rounded border border-violet-200 bg-violet-50/50 p-2">
                    <p className="text-[9px] font-semibold text-slate-600">{label as string}</p>
                    <p className="mt-1 font-mono text-[10px]">{numberValue(value)} · {gatePercent(value as number | null)} of 1.000e-7 · {gateVerdict(passed as boolean | null)}</p>
                  </div>)}
                  <div className="rounded border border-violet-200 bg-violet-50/50 p-2">
                    <p className="text-[9px] font-semibold text-slate-600">Strict positivity</p>
                    <p className="mt-1 font-mono text-[10px]">minimum flow {numberValue(jobCJob.progress.minimumFlowMolS)} mol/s · {gateVerdict(jobCJob.progress.strictPositivityPassed)}</p>
                  </div>
                </div>
                <p className="mt-2 text-[10px]"><span className="font-semibold">Current limiting gate:</span> {limitingJobCGate}</p>
                <p className="mt-1 font-mono text-[10px]"><span className="font-sans font-semibold">Accepted/rejected λ bracket:</span> [{jobCJob.progress.acceptedLowerLambda == null ? "Unavailable" : jobCJob.progress.acceptedLowerLambda.toExponential(3)}, {jobCJob.progress.rejectedUpperLambda == null ? "Unavailable" : jobCJob.progress.rejectedUpperLambda.toExponential(3)}]</p>
                <p className="mt-1 text-[9px] text-slate-500">Residual percentages use the unchanged 1e-7 limits. Strict positivity independently requires minimum flow &gt; 0. A rejected numerical candidate does not establish physical infeasibility.</p>
              </div>
              {jobCJob.error && <p className="mt-2 font-mono text-[10px] text-red-800">{jobCJob.error}</p>}
              {jobCJob.progress.heightCandidateM !== null && !jobCJob.scientificCompleted && <p className="mt-2 text-[10px] font-semibold text-violet-900">The height candidate is live calculation telemetry, not an accepted or final result.</p>}
              <p className="mt-2 text-[10px] font-semibold">Candidate qualification → Height qualification → Exact qualification</p>
              <p className="mt-1 text-[10px]">These labels report scientific calculation progress only; they do not indicate Stage 4 or downstream acceptance.</p>
               {jobCJob.workflowTestOnly && <p className="mt-2 rounded border border-amber-400 bg-amber-50 p-2 text-[10px] font-semibold text-amber-950">WORKFLOW TEST ONLY — NOT AN ACCEPTED DESIGN. A completed workflow record does not make failed scientific residual gates accepted and does not perform downstream optimization.</p>}
            </section>}
            {jobCJob?.status === "cancelled" && <section role="status" aria-live="polite" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">Job C · interrupted</p>
              <h2 className="mt-1 text-sm font-semibold">Interrupted — partial results saved; calculation not completed</h2>
              <p className="mt-1 text-xs">Any partial record is retained for analysis and a subsequent Restart Job C request. It is not a completed scientific result and no partial height is rendered as accepted or final.</p>
              <dl className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2">
                <div><dt className="font-semibold text-slate-600">Partial result</dt><dd className="font-mono">{jobCJob.partialResult ? "Saved" : "Unavailable"}</dd></div>
                <div><dt className="font-semibold text-slate-600">Partial result hash</dt><dd className="break-all font-mono">{jobCJob.partialResultHash ?? "Unavailable"}</dd></div>
              </dl>
              {jobCJob.partialResult && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold">Partial-result analysis record</summary><pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-3 text-[10px] text-slate-900">{JSON.stringify(jobCJob.partialResult, null, 2)}</pre></details>}
            </section>}
            {Object.keys(jobCBranchContinuation).length > 0 && <section className="rounded-md border border-violet-300 bg-white p-3 text-violet-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-semibold">Branch-continuation numerical diagnostics</h2>
                <span className="rounded border border-violet-200 bg-violet-50 px-2 py-1 font-mono text-[10px]">{stringValue(read(jobCBranchContinuation, "status"))}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-slate-500">Last accepted λ</dt><dd className="font-mono">{numberValue(read(jobCBranchContinuation, "lastAcceptedLambda"))}</dd></div>
                <div><dt className="text-slate-500">First failed two-start λ</dt><dd className="font-mono">{numberValue(read(jobCBranchContinuation, "firstRejectedLambda"))}</dd></div>
                <div><dt className="text-slate-500">Terminal bracket [lower, upper]</dt><dd className="font-mono">[{numberValue(read(branchTerminalBracket, "lower"))}, {numberValue(read(branchTerminalBracket, "upper"))}]</dd></div>
                <div><dt className="text-slate-500">Bracket width</dt><dd className="font-mono">{numberValue(read(branchTerminalBracket, "width"))}</dd></div>
                <div><dt className="text-slate-500">Bracket resolved?</dt><dd className="font-mono">{stringValue(read(branchTerminalBracket, "resolved"))}</dd></div>
                <div><dt className="text-slate-500">Limiting phase / component</dt><dd className="font-mono">{stringValue(read(branchLimiting, "phase"))} / {stringValue(read(branchLimiting, "component"))}</dd></div>
                <div><dt className="text-slate-500">Limiting numerical cell</dt><dd className="font-mono">{scalarValue(read(branchLimiting, "numericalCell"))}</dd></div>
                <div><dt className="text-slate-500">Zero-active diagnostic λ</dt><dd className="font-mono">{numberValue(read(branchPhysicalBoundary, "lambda"))}</dd></div>
                <div><dt className="text-slate-500">Diagnostic λ uncertainty (not certified)</dt><dd className="font-mono">{numberValue(read(branchPhysicalUncertainty, "lambdaAbsoluteEstimate"))}</dd></div>
              </dl>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {[
                  ["Last gate-accepted cell 1 NMP balance", branchCell1Balance, branchCell1Uncertainty],
                  ["First rejected cell 1 NMP balance", branchRejectedBalance, branchRejectedUncertainty],
                  ["Zero-active diagnostic cell 1 NMP balance", branchPhysicalBalance, branchPhysicalUncertainty],
                ].map(([label, balanceValue, uncertaintyValue]) => {
                  const balance = balanceValue as RecordValue;
                  const uncertainty = uncertaintyValue as RecordValue;
                  return <div key={label as string} className="rounded border border-violet-200 bg-violet-50/50 p-2">
                    <h3 className="text-[10px] font-semibold">{label as string}</h3>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
                      <div><dt className="text-slate-500">Convection [mol/s]</dt><dd className="font-mono">{numberValue(read(balance, "convectionMolS"))}</dd></div>
                      <div><dt className="text-slate-500">Axial backmixing [mol/s]</dt><dd className="font-mono">{numberValue(read(balance, "axialBackmixingMolS"))}</dd></div>
                      <div><dt className="text-slate-500">Interphase transfer [mol/s]</dt><dd className="font-mono">{numberValue(read(balance, "interphaseTransferMolS"))}</dd></div>
                      <div><dt className="text-slate-500">Residual [mol/s]</dt><dd className="font-mono">{numberValue(read(balance, "residualMolS"))}</dd></div>
                      <div><dt className="text-slate-500">Flow [mol/s]</dt><dd className="font-mono">{numberValue(read(balance, "flowMolS"))}</dd></div>
                      <div><dt className="text-slate-500">Flow absolute estimate [mol/s]</dt><dd className="font-mono">{numberValue(read(uncertainty, "flowAbsoluteEstimateMolS"))}</dd></div>
                      <div><dt className="text-slate-500">Residual roundoff estimate [mol/s]</dt><dd className="font-mono">{numberValue(read(uncertainty, "residualRoundoffEstimateMolS"))}</dd></div>
                      <div><dt className="text-slate-500">Sign resolved / method</dt><dd className="font-mono">{stringValue(read(uncertainty, "signResolved"))} / {stringValue(read(uncertainty, "method"))}</dd></div>
                    </dl>
                  </div>;
                })}
              </div>
              <p className="mt-2 text-[9px] text-slate-500">A tolerance-accepted tiny positive flow does not establish a resolved positive inventory. Signed roots are diagnostic only, not operating states or proof of global infeasibility. Values are rendered directly from the server worker diagnostics; the client performs no numerical reconstruction.</p>
            </section>}
            {jobCPollError && <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Job C monitoring temporarily interrupted</p><p>{jobCPollError}</p>{jobCRunning && <p>The last {jobCJob?.status} state is retained and polling will continue.</p>}</div></div>}
            {error && <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
            {jobBDiagnostic && <section role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <h2 className="text-sm font-semibold">{interfaceStateNotAccepted ? "Job-B interface state not accepted" : "Job-B calculation blocked"}</h2>
              <p className="mt-1 text-xs leading-5">{interfaceStateNotAccepted ? <>The simultaneous solver did not return an accepted interface state.</> : <>A required Job-B module or dependency blocked the calculation.</>} Adapter status: {diagnosticStatus}. No interfacial fluxes are shown. This does not change the Job-A verdict.</p>
              <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">Interface and adapter diagnostics</summary><pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-3 text-[10px]">{JSON.stringify({ interfaceDiagnostics: read(jobBDiagnostic, "interfaceDiagnostics"), adapterStatus: read(jobBDiagnostic, "adapterStatus") }, null, 2)}</pre></details>
              <div className="-mx-4 -mb-4 mt-4 text-slate-900"><JobBStateAudit inputAudit={failedJobBInputAudit} /></div>
            </section>}
            {Object.keys(jobCDownstreamDiagnostic).length > 0 && <section role="status" className="rounded-md border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">Job C · {jobCJob?.workflowTestOnly ? "WORKFLOW TEST ONLY" : "temporary partial-transfer diagnostic"}</p>
              <h2 className="mt-1 text-sm font-semibold">{jobCJob?.workflowTestOnly ? "WORKFLOW TEST ONLY — NOT AN ACCEPTED DESIGN" : "Provisional downstream diagnostic only"}</h2>
              <p className="mt-1 text-xs font-semibold">WARNING: λ = {numberValue(read(jobCDownstreamDiagnostic, "partialTransferLambda"))} is a partial-transfer endpoint. It is not λ = 1, does not satisfy the recovery criterion, and cannot be accepted as a column design. {jobCJob?.workflowTestOnly ? "Scientific residual failures remain failures; no actual downstream optimization is implied." : ""}</p>
              <p className="mt-1 text-[10px]">{stringValue(read(jobCDownstreamDiagnostic, "warning", "unavailableReason"))}</p>
              {jobCDownstreamUnavailableReason != null && <p className="mt-1 font-mono text-[10px] text-red-800">Scientific block reason: {stringValue(jobCDownstreamUnavailableReason)}</p>}
              {Object.keys(jobCDownstreamFields).length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["d32 [m] (frozen Stage-3 input)", "d32M"], ["Holdup (frozen Stage-3 input)", "holdup"], ["Flooding holdup (frozen Stage-3 input)", "flooding"],
                  ["RPM (frozen input; not optimized)", "rpm"], ["Diameter [m] (frozen input; not optimized)", "diameterM"],
                  ["Height trial [m]; not criterion-satisfying", "heightM"], ["Compartments (numerical FV)", "compartments"],
                ].map(([label, key]) => {
                  const field = object(read(jobCDownstreamFields, key));
                  return <div key={key} className="rounded border border-amber-300 bg-white p-2">
                    <p className="text-[9px] font-semibold text-slate-600">{label}</p>
                    <p className="mt-1 font-mono text-[10px]">{numberValue(read(field, "value"))}</p>
                    {read(field, "unavailableReason") != null
                      ? <p className="mt-1 break-words text-[9px] text-amber-800">Unavailable: {stringValue(read(field, "unavailableReason"))}</p>
                      : <p className="mt-1 break-words text-[9px] text-slate-600">{stringValue(read(field, "provenance"))}</p>}
                  </div>;
                })}
              </div> : <p className="mt-3 text-xs font-semibold">Unavailable — endpoint failure retains worker diagnostics; no downstream values were derived.</p>}
              <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold">Partial endpoint evidence and provenance</summary><pre className="mt-2 max-h-72 overflow-auto rounded bg-white p-3 text-[10px] text-slate-900">{JSON.stringify(jobCDiagnostic, null, 2)}</pre></details>
            </section>}
            {jobCDiagnostic && Object.keys(jobCDownstreamDiagnostic).length === 0 && <section role="alert" className="rounded-md border border-violet-300 bg-violet-50 p-4 text-violet-950">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">Job C · blocked result</p>
              <h2 className="mt-1 text-sm font-semibold">Job-C calculation blocked</h2>
              <p className="mt-1 font-mono text-[10px]">{stringValue(read(jobCDiagnostic, "error", "message", "status"))}</p>
              <p className="mt-1 text-xs">The server did not return a calculated compartment result. No active height is shown.</p>
              {hasJobCAxialPositionDiagnostics && <div className="mt-3 rounded border border-violet-300 bg-white p-3 text-xs leading-5">
                <p className="font-semibold">Stage-2 axial contact positions requiring attention</p>
                {duplicateJobCAxialPositions.length > 0 && <p>Duplicate positions: <span className="font-mono">{duplicateJobCAxialPositions.join(", ")}</span></p>}
                {missingJobCAxialPositions.length > 0 && <p>Missing positions: <span className="font-mono">{missingJobCAxialPositions.join(", ")}</span></p>}
                {unexpectedJobCAxialPositions.length > 0 && <p>Unexpected positions: <span className="font-mono">{unexpectedJobCAxialPositions.join(", ")}</span></p>}
                {invalidJobCAxialContactIndexes.length > 0 && <p>Invalid position values at contact rows: <span className="font-mono">{invalidJobCAxialContactIndexes.join(", ")}</span></p>}
                <p className="mt-1 text-[10px] text-violet-800">Repair or investigate the pinned Stage-2 source record. Job C will not invent or repeat contacts.</p>
              </div>}
              <details className="mt-2" open><summary className="cursor-pointer text-xs font-semibold">Job-C error details and input audit · scientific diagnostics</summary><pre className="mt-2 max-h-72 overflow-auto rounded bg-white p-3 text-[10px]">{JSON.stringify({ error: read(jobCDiagnostic, "error", "message"), scientificDiagnostics: read(jobCDiagnostic, "scientificDiagnostics", "diagnostics"), details: read(jobCDiagnostic, "details"), inputAudit: read(object(read(jobCDiagnostic, "details")), "inputAudit") ?? read(jobCDiagnostic, "inputAudit"), result: jobCDiagnostic }, null, 2)}</pre></details>
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
            {jobCEvaluation && <section className="overflow-hidden rounded-md border-2 border-violet-400 bg-white">
              <div className="border-b border-violet-200 bg-violet-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-800">Job C · preliminary project-controlled compartment calculation</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-950">Axial-dispersion height search and phase profile</h2>
                  <span className="rounded border border-violet-300 bg-white px-2 py-1 font-mono text-[10px] font-semibold">Status: {stringValue(jobCStatus)}</span>
                </div>
              </div>

              <div className="border-b-2 border-red-400 bg-red-50 p-4 text-red-950">
                <p className="text-xs font-bold uppercase tracking-wide">Strict preliminary scope — not a downstream design authority</p>
                <ul className="mt-2 grid gap-1 text-xs font-semibold sm:grid-cols-2 lg:grid-cols-3">
                  <li>No efficiency calculation.</li><li>No global m.</li><li>No sulfur prediction or sulfur-removal claim.</li>
                  <li>No release decision.</li><li>No final RPM selection.</li><li>No Job D.</li>
                </ul>
              </div>

              <div className="grid gap-3 border-b border-slate-200 p-3 lg:grid-cols-3">
                <div className="rounded border border-violet-200 p-3">
                  <h3 className="text-xs font-semibold text-slate-900">Project-controlled Dax</h3>
                  <div className="mt-2 space-y-2">{jobCPhaseDax.map(([label, phase]) => {
                    return <div key={label} className="rounded bg-violet-50 p-2 text-[10px]">
                      <p className="font-semibold">{label}</p>
                      <p className="font-mono">Dax: {daxValue(read(phase, "nominal"))} m²/s</p>
                      <p className="font-mono">Range: {daxValue(read(phase, "minimum"))} to {daxValue(read(phase, "maximum"))} m²/s</p>
                    </div>;
                  })}</div>
                  <details className="mt-2"><summary className="cursor-pointer text-[10px] font-semibold">Returned Dax record</summary><pre className="mt-1 max-h-32 overflow-auto text-[9px]">{JSON.stringify(jobCDax, null, 2)}</pre></details>
                </div>
                <div className="rounded border border-violet-200 p-3">
                  <h3 className="text-xs font-semibold text-slate-900">Active-height search bounds</h3>
                  <dl className="mt-2 space-y-1 font-mono text-[10px]">
                    <div><dt className="inline text-slate-500">Minimum: </dt><dd className="inline">{scalarValue(read(jobCHeightBounds, "minimumM", "minM", "minimum"))} m</dd></div>
                    <div><dt className="inline text-slate-500">Maximum: </dt><dd className="inline">{scalarValue(read(jobCHeightBounds, "maximumM", "maxM", "maximum"))} m</dd></div>
                    <div><dt className="inline text-slate-500">Step/tolerance: </dt><dd className="inline">{scalarValue(read(jobCHeightBounds, "stepM", "toleranceM", "step", "tolerance"))} m</dd></div>
                  </dl>
                  <p className="mt-2 text-[10px] text-slate-600">{stringValue(read(jobCHeightBounds, "basis", "provenance", "source"))}</p>
                </div>
                <div className="rounded border border-violet-200 p-3">
                  <h3 className="text-xs font-semibold text-slate-900">N<sub>T</sub> numerical compartment basis</h3>
                  <p className="mt-2 font-mono text-lg font-bold">{scalarValue(read(jobCNT, "value", "compartments", "theoreticalStages", "validatedNT", "fallbackNT", "physicalCompartments") ?? read(jobCResult, "physicalCompartments"))}</p>
                  <p className="text-[10px] font-semibold">{stringValue(read(jobCNT, "provenance", "source", "status"))}</p>
                  <p className="mt-1 text-[10px] text-slate-600">{stringValue(read(jobCNT, "reason", "fallbackReason", "basis"))}</p>
                  <p className="mt-2 text-[10px]">Validated N<sub>T</sub> is used when returned; otherwise the server-returned numerical fallback is reported. The browser chooses neither.</p>
                </div>
              </div>

              <div className="grid gap-3 border-b border-slate-200 p-3 sm:grid-cols-2">
                <div className={`rounded border p-3 ${jobCCalculated ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
                  <p className="text-[10px] font-semibold uppercase">Calculation status</p>
                  <p className="mt-1 font-mono text-xs font-bold">{stringValue(jobCStatus)}</p>
                  {jobCBlockers.length > 0 && <ul className="mt-2 space-y-1 text-[10px]">{jobCBlockers.map((blocker, index) => <li key={`${blocker}-${index}`}>• {blocker}</li>)}</ul>}
                  {!jobCCalculated && jobCBlockers.length === 0 && <p className="mt-2 text-[10px]">No blocker list was returned.</p>}
                </div>
                <div className="rounded border border-slate-300 p-3">
                  <p className="text-[10px] font-semibold uppercase">Calculated active height</p>
                  {jobCCalculated && Number.isFinite(Number(jobCActiveHeight))
                    ? <p className="mt-1 font-mono text-lg font-bold">{scalarValue(jobCActiveHeight)} m</p>
                    : <p className="mt-1 text-xs font-semibold text-slate-600">Not displayed — the backend did not return both calculated status and a numeric active height.</p>}
                </div>
              </div>

              {jobCCompartments.length > 0 && <div className="space-y-3 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Per-compartment seven-component phase profile</h3>
                {jobCCompartments.map((cell, cellIndex) => {
                  const nestedRows = records(read(cell, "components", "rows", "componentProfile", "phaseRows"));
                  const continuousIn = numericArray(read(cell, "continuousInMolS", "continuousInMolarFlowMolS", "continuousIn", "continuousPhaseIn"));
                  const continuousOut = numericArray(read(cell, "continuousOutMolS", "continuousOutMolarFlowMolS", "continuousOut", "continuousPhaseOut"));
                  const dispersedIn = numericArray(read(cell, "dispersedInMolS", "dispersedInMolarFlowMolS", "dispersedIn", "dispersedPhaseIn"));
                  const dispersedOut = numericArray(read(cell, "dispersedOutMolS", "dispersedOutMolarFlowMolS", "dispersedOut", "dispersedPhaseOut"));
                  const transfer = numericArray(read(cell, "transferContinuousToDispersedMolS", "transferMolS", "componentTransferMolS"));
                  const continuousResidual = numericArray(read(cell, "continuousResidualMolS"));
                  const dispersedResidual = numericArray(read(cell, "dispersedResidualMolS"));
                  const componentRows = nestedRows.length ? nestedRows : jobCComponentIds.map((componentId, index) => ({
                    componentId,
                    continuousIn: continuousIn[index], continuousOut: continuousOut[index],
                    dispersedIn: dispersedIn[index], dispersedOut: dispersedOut[index],
                    transferMolS: transfer[index],
                    continuousResidualMolS: continuousResidual[index],
                    dispersedResidualMolS: dispersedResidual[index],
                  }));
                  return <article key={stringValue(read(cell, "compartment", "ordinal", "index"), String(cellIndex + 1))} className="overflow-hidden rounded border border-violet-200">
                    <div className="flex flex-wrap justify-between gap-2 bg-violet-50 px-3 py-2"><h4 className="text-xs font-semibold">Compartment {stringValue(read(cell, "compartment", "ordinal", "index"), String(cellIndex + 1))}</h4><span className="font-mono text-[10px]">{stringValue(read(cell, "status", "areaModelStatus"))}</span></div>
                    <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-[10px]"><thead className="bg-violet-950 text-white"><tr><th className="px-2 py-2">Component</th><th className="px-2 py-2">Continuous phase in [mol/s]</th><th className="px-2 py-2">Continuous phase out [mol/s]</th><th className="px-2 py-2">Dispersed phase in [mol/s]</th><th className="px-2 py-2">Dispersed phase out [mol/s]</th><th className="px-2 py-2">Continuous → dispersed transfer [mol/s]</th><th className="px-2 py-2">Continuous residual [mol/s]</th><th className="px-2 py-2">Dispersed residual [mol/s]</th></tr></thead>
                      <tbody className="divide-y">{componentRows.map((row, rowIndex) => {
                        const continuous = object(read(row, "continuous", "continuousPhase"));
                        const dispersed = object(read(row, "dispersed", "dispersedPhase"));
                        return <tr key={`${componentName(row)}-${rowIndex}`}><td className="px-2 py-2 font-semibold">{componentName(row)}</td><td className="px-2 py-2 font-mono">{numberValue(read(row, "continuousIn", "continuousInMolS", "continuousInMolarFlowMolS") ?? read(continuous, "in", "inlet"))}</td><td className="px-2 py-2 font-mono">{numberValue(read(row, "continuousOut", "continuousOutMolS", "continuousOutMolarFlowMolS") ?? read(continuous, "out", "outlet"))}</td><td className="px-2 py-2 font-mono">{numberValue(read(row, "dispersedIn", "dispersedInMolS", "dispersedInMolarFlowMolS") ?? read(dispersed, "in", "inlet"))}</td><td className="px-2 py-2 font-mono">{numberValue(read(row, "dispersedOut", "dispersedOutMolS", "dispersedOutMolarFlowMolS") ?? read(dispersed, "out", "outlet"))}</td><td className="px-2 py-2 font-mono">{numberValue(read(row, "transferContinuousToDispersedMolS", "transferMolS", "componentTransferMolS", "fluxMolS") ?? transfer[rowIndex])}</td><td className="px-2 py-2 font-mono">{numberValue(read(row, "continuousResidualMolS") ?? continuousResidual[rowIndex])}</td><td className="px-2 py-2 font-mono">{numberValue(read(row, "dispersedResidualMolS") ?? dispersedResidual[rowIndex])}</td></tr>;
                      })}</tbody></table></div>
                    <div className="grid gap-2 border-t bg-slate-50 p-2 sm:grid-cols-3 lg:grid-cols-6">{[
                      ["Local material balance", read(cell, "localMaterialBalanceResidualMolS")],
                      ["Constitutive residual", read(cell, "constitutiveResidualMolS")],
                      ["Frame conservation", read(cell, "frameConstraintResidualMolS")],
                      ["Continuous mixing conservation", read(cell, "continuousMixingConservationResidualMolS")],
                      ["Dispersed mixing conservation", read(cell, "dispersedMixingConservationResidualMolS")],
                      ["Interface flux disagreement", read(object(read(cell, "localInterface")), "maximumFilmFluxAbsoluteDisagreementMolM2S")],
                    ].map(([label, value]) => <div key={String(label)}><p className="text-[9px] text-slate-500">{label}</p><p className="font-mono text-[10px]">{numberValue(value)}</p></div>)}</div>
                  </article>;
                })}
              </div>}
              {(jobCGlobalBalanceResiduals.length > 0 || Object.keys(jobCResidualDiagnostics).length > 0) && <section className="border-t border-violet-200 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Selected-case component balance and conservation</h3>
                <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-[10px]"><thead className="bg-slate-800 text-white"><tr><th className="px-2 py-2">Component</th><th className="px-2 py-2">Global component balance residual [mol/s]</th></tr></thead><tbody className="divide-y">{jobCComponentIds.map((componentId, index) => <tr key={componentId}><td className="px-2 py-2 font-semibold">{componentId}</td><td className="px-2 py-2 font-mono">{numberValue(jobCGlobalBalanceResiduals[index])}</td></tr>)}</tbody></table></div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[
                  ["Maximum continuous cell residual [mol/s]", read(jobCResidualDiagnostics, "maxContinuousCellResidualMolS")],
                  ["Maximum dispersed cell residual [mol/s]", read(jobCResidualDiagnostics, "maxDispersedCellResidualMolS")],
                  ["Global max component balance residual [mol/s]", read(jobCResidualDiagnostics, "maxGlobalComponentBalanceResidualMolS")],
                  ["Minimum local component flow [mol/s]", read(jobCResidualDiagnostics, "minimumLocalComponentFlowMolS")],
                  ["Maximum interface flux disagreement [mol/m²/s]", read(jobCResidualDiagnostics, "maximumInterfaceFluxDisagreementMolM2S")],
                  ["Solver function evaluations", read(jobCResidualDiagnostics, "solverFunctionEvaluations")],
                ].map(([label, value]) => <div key={String(label)} className="rounded border border-slate-200 bg-slate-50 p-2"><dt className="text-[9px] text-slate-500">{label}</dt><dd className="mt-1 font-mono text-[10px]">{numberValue(value)}</dd></div>)}</dl>
              </section>}
              <details className="border-t p-3"><summary className="cursor-pointer text-xs font-semibold">Component balance/conservation diagnostics, input audit &amp; returned record</summary><pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-950 p-3 text-[10px] text-cyan-50">{JSON.stringify({ balanceDiagnostics: read(jobCResult, "balanceDiagnostics", "conservationDiagnostics", "diagnostics"), inputAudit: jobCInputAudit, result: jobCResult }, null, 2)}</pre></details>
            </section>}
          </div>
        )}
      </main>
    </Layout>
  );
}