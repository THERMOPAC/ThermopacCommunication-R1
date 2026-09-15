import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type KuhniRun = {
  id?: string | number;
  status?: string;
  integrityStatus?: string;
  stage1SnapshotHash?: string;
  implementationHash?: string;
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

function kuNumber(value: unknown, digits = 3) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

type RejectedHydraulicTrial = {
  rpm: string;
  reason: string;
};

type KuhniPresentationCandidate = {
  available?: boolean;
  status?: string;
  label?: string;
  qualification?: string;
  source?: string;
  governed?: boolean;
  stage4Input?: boolean;
  stage4HetsScreeningInput?: boolean;
  columnDiameterM?: number;
  rotorDiameterM?: number | null;
  compartmentHeightM?: number | null;
  rpm?: number;
  d32M?: number | null;
  floodHoldup?: number | null;
  actualLoading?: number | null;
  tipSpeedMS?: number | null;
  powerVolumeWM3?: number | null;
  massFluxKgM2S?: number | null;
  trialStatus?: string;
  independentCheck?: string;
};

type KuhniPresentationQualification = {
  schemaVersion?: string;
  status?: string;
  label?: string;
  candidate?: KuhniPresentationCandidate | null;
  governedOutput?: Record<string, unknown>;
  lineage?: Record<string, unknown>;
  limitations?: Array<{
    group?: string;
    title?: string;
    details?: unknown[];
  }>;
  failure?: {
    code?: string;
    message?: string;
  };
};

const STAGE3_PRESENTATION_CLASSIFICATION =
  "CALCULATED_PRE_PILOT_WITH_MAJOR_SCALE_UP_EXTRAPOLATION";
const STAGE3_PRESENTATION_LABEL =
  "CALCULATED PRE-PILOT WITH MAJOR SCALE-UP EXTRAPOLATION";

function presentationLabel(value: unknown): string {
  const text = textValue(value);
  if (!text || text === STAGE3_PRESENTATION_CLASSIFICATION) {
    return STAGE3_PRESENTATION_LABEL;
  }
  return text;
}

function rejectedHydraulicTrials(value: unknown): RejectedHydraulicTrial[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const trial = asRecord(item);
    if (!trial) {
      return { rpm: "—", reason: textValue(item) ?? "No reason recorded." };
    }
    const rpm = Number(trial.rpm);
    const code = textValue(trial.code);
    const reasonCode = textValue(trial.reason) ?? code ?? textValue(trial.error);
    const reason = [reasonCode, textValue(trial.message)].filter(Boolean).join(": ")
      || "No reason recorded.";
    return {
      rpm: Number.isFinite(rpm) ? kuNumber(rpm, 1) : "—",
      reason,
    };
  });
}

/**
 * Older immutable resolver records only persisted the outer
 * NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS error.  When the additive
 * hydraulicPrerequisite field is absent, this derives the narrower historical
 * explanation only from the frozen phase orientation and density metadata.
 *
 * Unknown phase configurations or incomplete properties deliberately produce no
 * inference.  In particular, this must not reconstruct a phase orientation or
 * diameter from a client-side default.
 */
export function inferHistoricalHydraulicPrerequisite(
  processBasis: Record<string, unknown> | undefined,
  rejectedTrials: readonly unknown[] = [],
): { code: string; message: string } | null {
  if (!processBasis) return null;
  const phaseConfiguration = textValue(processBasis.phaseConfiguration);
  const rrbo = asRecord(processBasis.rrboFeed);
  const solvent = asRecord(processBasis.wetSolventPhase);
  let continuous: Record<string, unknown> | undefined;
  let dispersed: Record<string, unknown> | undefined;
  if (phaseConfiguration === "nmp-continuous-rrbo-dispersed") {
    continuous = solvent;
    dispersed = rrbo;
  } else if (phaseConfiguration === "rrbo-continuous-nmp-dispersed") {
    continuous = rrbo;
    dispersed = solvent;
  } else {
    return null;
  }
  if (!continuous || !dispersed) return null;
  const continuousDensity = Number(continuous.densityKgM3);
  const dispersedDensity = Number(dispersed.densityKgM3);
  if (!Number.isFinite(continuousDensity) || !Number.isFinite(dispersedDensity)) return null;
  if (!(continuousDensity > 0 && dispersedDensity > 0)) return null;
  if (continuousDensity > dispersedDensity) return null;

  const continuousIdentity = textValue(continuous.identity) ?? "the selected continuous phase";
  const dispersedIdentity = textValue(dispersed.identity) ?? "the selected dispersed phase";
  const deltaRho = continuousDensity - dispersedDensity;
  const hasGenericNoRootReason = rejectedTrials.some((item) => {
    const trial = asRecord(item);
    const reason = trial
      ? [trial.reason, trial.message, trial.code, trial.error].map(textValue).filter(Boolean).join(" ")
      : textValue(item) ?? "";
    return reason.includes("NO_DIAMETER_ROOT_WITHIN_PHYSICAL_BOUNDS");
  });
  const historicalContext = hasGenericNoRootReason
    ? "The saved per-RPM no-root records are the outer error; they do not replace this prerequisite diagnosis."
    : "No diameter is recovered from this rejected envelope.";
  return {
    code: "CONTINUOUS_PHASE_MUST_BE_HEAVIER",
    message: `Frozen Stage-1 phase metadata identifies ${continuousIdentity} as continuous (${kuNumber(continuousDensity)} kg/m³) and ${dispersedIdentity} as dispersed (${kuNumber(dispersedDensity)} kg/m³). The frozen hydraulic closure requires positive Δρ = ρcontinuous − ρdispersed, but Δρ = ${kuNumber(deltaRho)} kg/m³ (the continuous phase is not heavier). ${historicalContext}`,
  };
}

export function KuhniResolverPanel({ run, runCount }: { run: KuhniRun; runCount: number }) {
  const authority = run.theoreticalStagesUsed as Record<string, unknown> | undefined;
  const engine = run.engine as Record<string, unknown> | undefined;
  const isV150 = String(engine?.version ?? "").includes("V1.5.0");
  const coupled = run.coupledSelection as Record<string, unknown> | undefined;
  const recordedTrials = Array.isArray(run.hydraulicRpmEnvelope)
    ? run.hydraulicRpmEnvelope
      .map(asRecord)
      .filter((trial): trial is Record<string, unknown> => Boolean(trial))
    : [];
  const trials = recordedTrials.filter((trial) => trial.status === "CALCULATED_IN_RANGE");
  const rejectedTrials = rejectedHydraulicTrials(run.rejectedRpmTrials);
  const explicitPrerequisite = asRecord(run.hydraulicPrerequisite);
  const explicitPrerequisiteCode = textValue(explicitPrerequisite?.code);
  const explicitPrerequisiteMessage = textValue(explicitPrerequisite?.message);
  const explicitPrerequisiteIsSupported = explicitPrerequisiteCode === "SUPPORTED_DENSITY_ORIENTATION";
  const hasExplicitPrerequisite = Boolean(explicitPrerequisiteCode || explicitPrerequisiteMessage);
  const persistedRootFailure = asRecord(run.rootFailureReason);
  const persistedRootFailureCode = textValue(persistedRootFailure?.code);
  const persistedRootFailureMessage = textValue(persistedRootFailure?.message);
  const hasPersistedRootFailure = Boolean(persistedRootFailureCode || persistedRootFailureMessage);
  const inferredPrerequisite = hasExplicitPrerequisite || trials.length > 0
    ? null
    : inferHistoricalHydraulicPrerequisite(run.processBasis, Array.isArray(run.rejectedRpmTrials) ? run.rejectedRpmTrials : []);
  const prerequisiteCode = explicitPrerequisiteCode ?? inferredPrerequisite?.code
    ?? (explicitPrerequisiteMessage ? "HYDRAULIC_PREREQUISITE_FAILED" : undefined);
  const prerequisiteMessage = explicitPrerequisiteMessage ?? inferredPrerequisite?.message;
  const failedPrerequisiteCode = explicitPrerequisiteIsSupported ? undefined : prerequisiteCode;
  const failedPrerequisiteMessage = explicitPrerequisiteIsSupported ? undefined : prerequisiteMessage;
  const extrapolatedTrialCount = recordedTrials.filter((trial) => trial.status === "CALCULATED_EXTRAPOLATED").length;
  const point = [...trials].sort((a, b) =>
    Number(a.columnDiameterM) - Number(b.columnDiameterM) || Number(a.rpm) - Number(b.rpm)
  )[0];
  const hiddenExtrapolatedCount = extrapolatedTrialCount
    + Number(run.excludedExtrapolatedTrialCount ?? 0);
  const reverseDiagnostics = asRecord(run.reverseOrientationDiagnostics);
  const reverseTrials = Array.isArray(reverseDiagnostics?.trials)
    ? reverseDiagnostics.trials
      .map(asRecord)
      .filter((trial): trial is Record<string, unknown> => Boolean(trial))
    : [];
  const reverseRejectedTrials = Array.isArray(reverseDiagnostics?.rejectedTrials)
    ? reverseDiagnostics.rejectedTrials
      .map(asRecord)
      .filter((trial): trial is Record<string, unknown> => Boolean(trial))
    : [];
  const reverseSelectedProperties = asRecord(reverseDiagnostics?.selectedPhaseProperties);
  const reverseContinuous = asRecord(reverseSelectedProperties?.continuous);
  const reverseDispersed = asRecord(reverseSelectedProperties?.dispersed);
  const reverseSignedBuoyancy = asRecord(reverseDiagnostics?.signedBuoyancy);
  const reverseMapping = asRecord(reverseDiagnostics?.countercurrentMapping);
  const illustrativeModelRoot = asRecord(run.illustrativeExtrapolatedModelRoot);
  const illustrativeModelRootSelection = asRecord(
    run.illustrativeModelRootSelection ?? reverseDiagnostics?.illustrativeModelRootSelection,
  );
  const presentationQualification = asRecord(run.presentationQualification) as KuhniPresentationQualification | undefined;
  const presentationCandidate = asRecord(presentationQualification?.candidate) as KuhniPresentationCandidate | undefined;
  const governedOutput = asRecord(presentationQualification?.governedOutput);
  const hasPrePilotCandidate = presentationQualification?.status === STAGE3_PRESENTATION_CLASSIFICATION
    && run.integrityStatus === "VERIFIED"
    && presentationCandidate?.available === true
    && presentationCandidate.governed === false
    && presentationCandidate.stage4Input === false
    && presentationCandidate.stage4HetsScreeningInput === true
    && governedOutput?.candidateIsNotGoverned === true
    && governedOutput?.stage4Input === false
    && governedOutput?.stage4HetsScreeningInput === true
    && Number.isFinite(Number(presentationCandidate.columnDiameterM))
    && Number.isFinite(Number(presentationCandidate.rpm));
  const presentationLimitations = Array.isArray(presentationQualification?.limitations)
    ? presentationQualification.limitations
    : [];
  const displayedFailedPrerequisiteCode = hasPrePilotCandidate ? undefined : failedPrerequisiteCode;
  const displayedFailedPrerequisiteMessage = hasPrePilotCandidate ? undefined : failedPrerequisiteMessage;
  const displayedRootFailure = hasPrePilotCandidate ? false : hasPersistedRootFailure;
  const prePilotDispositionLabel = presentationLabel(
    presentationQualification?.label ?? presentationQualification?.status,
  );
  const illustrativeAssumptions = Array.isArray(illustrativeModelRootSelection?.assumptions)
    ? illustrativeModelRootSelection.assumptions.map(String)
    : [];
  const illustrativeSourceWarnings = Array.isArray(illustrativeModelRootSelection?.sourceRangeWarnings)
    ? illustrativeModelRootSelection.sourceRangeWarnings.map(String)
    : [];
  const hasIllustrativeModelRoot = Boolean(
    illustrativeModelRoot
    && textValue(illustrativeModelRootSelection?.status)?.includes("EXTRAPOLATED_MODEL_ROOT_SELECTED"),
  );
  const rpmValues = trials.map((trial) => Number(trial.rpm)).filter(Number.isFinite);
  const rpmRange = rpmValues.length ? `${Math.min(...rpmValues)}–${Math.max(...rpmValues)} rpm` : "—";
  const finalRpm = run.finalOperatingRpm;
  const fixedGeometryAuthority = authority?.provenance === "STAGE3_GEOMETRY_DESIGN_NT";
  const stage2Accepted = fixedGeometryAuthority
    ? authority?.stage2AcceptedPredictiveNtProvenance === "STAGE_2_CALCULATED_NT"
      && Number.isInteger(authority.stage2AcceptedPredictiveNt)
    : authority?.provenance === "STAGE_2_CALCULATED_NT";
  const stage2AcceptedNt = fixedGeometryAuthority
    ? authority?.stage2AcceptedPredictiveNt
    : authority?.provenance === "STAGE_2_CALCULATED_NT" ? authority?.value : null;
  const stage2Label = fixedGeometryAuthority
    ? String(authority?.stage2AcceptedPredictiveNtLabel
      ?? (stage2Accepted ? "STAGE-2 ACCEPTED PREDICTIVE N_T" : "STAGE-2 ACCEPTED PREDICTIVE N_T UNAVAILABLE"))
    : authority?.provenance === "PRE_PILOT_DESIGN_DEFAULT"
    ? "PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)"
    : String(authority?.label ?? "—");
  const geometryLabel = fixedGeometryAuthority
    ? String(authority?.label ?? "FIXED PRE-PILOT KUHNI GEOMETRY DESIGN BASIS (STAGE3_GEOMETRY_DESIGN_NT=7)")
    : "Historical resolver authority";
  const stage3Disposition = trials.length
    ? hasPrePilotCandidate
      ? prePilotDispositionLabel
      : "Accepted calculated-in-range hydraulic envelope"
    : hasPrePilotCandidate
      ? prePilotDispositionLabel
    : explicitPrerequisiteIsSupported
      ? "Supported orientation — no admitted hydraulic root"
      : failedPrerequisiteCode
        ? "Unsupported orientation — no calculated-in-range hydraulic trial"
        : hasPersistedRootFailure
          ? "No admitted hydraulic root"
          : "No calculated-in-range hydraulic trial";
  const summary: Array<[string, string]> = [
    ["Pre-pilot candidate diameter", hasPrePilotCandidate ? `${kuNumber(presentationCandidate?.columnDiameterM)} m` : point ? `${kuNumber(point.columnDiameterM)} m` : "No in-range result"],
    ["Rotor diameter", `${kuNumber(hasPrePilotCandidate ? presentationCandidate?.rotorDiameterM : point?.rotorDiameterM)} m`],
    ["Rotor / column", hasPrePilotCandidate
      ? kuNumber(Number(presentationCandidate?.rotorDiameterM) / Number(presentationCandidate?.columnDiameterM))
      : point ? kuNumber(Number(point.rotorDiameterM) / Number(point.columnDiameterM)) : "—"],
    ["Final operating RPM", !point || finalRpm == null ? "Pending coupled mass-transfer duty" : `${kuNumber(finalRpm, 1)} rpm`],
    ["Candidate RPM", hasPrePilotCandidate ? `${kuNumber(presentationCandidate?.rpm, 1)} rpm` : point ? `${kuNumber(point.rpm, 1)} rpm` : "—"],
    ["Hydraulic RPM range", rpmRange],
    ["d32 at diagnostic", `${kuNumber(Number(hasPrePilotCandidate ? presentationCandidate?.d32M : point?.d32M) * 1000)} mm`],
    ["Flood-point holdup", kuNumber(hasPrePilotCandidate ? presentationCandidate?.floodHoldup : point?.floodHoldup)],
    ["Calculated flooding load", `${kuNumber(Number(hasPrePilotCandidate ? presentationCandidate?.actualLoading : point?.actualLoading) * 100, 1)}%`],
    ["Tip speed", `${kuNumber(hasPrePilotCandidate ? presentationCandidate?.tipSpeedMS : point?.tipSpeedMS)} m/s`],
    ["P/V", `${kuNumber(hasPrePilotCandidate ? presentationCandidate?.powerVolumeWM3 : point?.powerVolumeWM3, 1)} W/m³`],
    [fixedGeometryAuthority ? "Stage 3 geometry design N_T" : "Theoretical stages used", `${authority?.value ?? "—"} — ${geometryLabel}`],
    ["Stage 2 accepted Predictive N_T", stage2AcceptedNt == null ? "Unavailable" : `${stage2AcceptedNt} — ${stage2Label}`],
    ["Physical compartments", !point || run.physicalCompartments == null ? "Pending compartment-efficiency model" : String(run.physicalCompartments)],
    ["Active column height", !point || run.activeHeightM == null ? "Pending compartment-efficiency model" : `${kuNumber(run.activeHeightM)} m`],
  ];
  return (
    <section className="space-y-3 rounded-md border border-blue-200 bg-blue-50/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-950">Automatic geometry resolver</h3>
          <p className="mt-0.5 text-[10px] text-blue-800">
            {String(engine?.version ?? "KUHNI_GEOMETRY_RESOLVER")} · {runCount} immutable resolver run{runCount === 1 ? "" : "s"} · {hasPrePilotCandidate ? "server-qualified pre-pilot candidate shown; governed output remains separate" : reverseDiagnostics ? `only calculated-in-range results selected; ${isV150 ? "extrapolated model-root diagnostics" : "preliminary reverse diagnostics"} remain visible` : "only calculated-in-range results shown"}
          </p>
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-amber-900">
          Pre-pilot predictive · not vendor guaranteed
        </span>
      </div>
      {hiddenExtrapolatedCount > 0 && (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[10px] font-medium text-amber-900">
          {hiddenExtrapolatedCount} extrapolated hydraulic trial{hiddenExtrapolatedCount === 1 ? "" : "s"} excluded from the hydraulic envelope and diagnostic selection{reverseDiagnostics ? `; ${isV150 ? "extrapolated model-root diagnostics" : "preliminary reverse diagnostics"} remain visible below in the audit details.` : "."}
        </p>
      )}
      {hasPrePilotCandidate && (
        <div
          data-testid="kuhni-prepilot-candidate"
          className="space-y-2 rounded border border-amber-300 bg-amber-50/90 p-3 text-[10px] text-amber-950"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <strong className="text-[11px]">{prePilotDispositionLabel}</strong>
              <p className="mt-1 leading-4">
                This finite, independently checked candidate is available for pre-pilot review only.
                It is not a governed hydraulic acceptance, commercial diameter, finite-rate Stage 4 input,
                or mass-transfer readiness signal. It is admitted only to deterministic HETS pre-pilot screening.
              </p>
            </div>
            <span className="rounded-full border border-amber-400 bg-amber-100 px-2 py-1 font-semibold uppercase tracking-wide">
              {String(presentationCandidate?.source ?? "SERVER_QUALIFIED")}
            </span>
          </div>
          <div className="grid gap-2 rounded border border-amber-200 bg-white/70 p-2 sm:grid-cols-2 lg:grid-cols-5">
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">Candidate D</span><br /><strong className="font-mono">{kuNumber(presentationCandidate?.columnDiameterM)} m</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">RPM</span><br /><strong className="font-mono">{kuNumber(presentationCandidate?.rpm, 1)}</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">Rotor D</span><br /><strong className="font-mono">{kuNumber(presentationCandidate?.rotorDiameterM)} m</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">Compartment H</span><br /><strong className="font-mono">{kuNumber(presentationCandidate?.compartmentHeightM)} m</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">d32</span><br /><strong className="font-mono">{kuNumber(Number(presentationCandidate?.d32M) * 1000)} mm</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">Independent check</span><br /><strong>{String(presentationCandidate?.independentCheck ?? "PASSED")}</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">Flooding load</span><br /><strong className="font-mono">{kuNumber(Number(presentationCandidate?.actualLoading) * 100, 1)}%</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">Tip speed</span><br /><strong className="font-mono">{kuNumber(presentationCandidate?.tipSpeedMS)} m/s</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">P/V</span><br /><strong className="font-mono">{kuNumber(presentationCandidate?.powerVolumeWM3, 1)} W/m³</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">Mass flux</span><br /><strong className="font-mono">{kuNumber(presentationCandidate?.massFluxKgM2S)} kg/m²·s</strong></div>
          </div>
          {(textValue(presentationQualification?.lineage?.status) || textValue(run.integrityStatus)) && (
            <p className="rounded border border-amber-200 bg-white/70 p-2 font-mono text-[9px]">
              Snapshot lineage: {String(presentationQualification?.lineage?.status ?? "—")} ·
              integrity: {String(run.integrityStatus ?? "—")}
            </p>
          )}
          {presentationLimitations.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {presentationLimitations.map((limitation, index) => (
                <div key={`${String(limitation.group ?? "limitation")}-${index}`} className="rounded border border-amber-200 bg-white/70 p-2">
                  <strong>{String(limitation.title ?? limitation.group ?? "Limitation")}</strong>
                  {Array.isArray(limitation.details) && (
                    <ul className="mt-1 list-disc space-y-1 pl-4 leading-4">
                      {limitation.details.map((detail, detailIndex) => <li key={detailIndex}>{String(detail)}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {reverseDiagnostics && (
        <div
          data-testid="kuhni-reverse-orientation-diagnostics"
          className="space-y-2 rounded border border-amber-300 bg-amber-50/80 p-3 text-[10px] text-amber-950"
        >
          <div>
            <strong>RRBO-continuous reverse-orientation {isV150 ? "extrapolated model-root" : "preliminary"} diagnostics</strong>
            <p className="mt-1 leading-4">
              These trials use the selected RRBO continuous / wet-NMP dispersed properties and retain the signed
              force-balance direction. They are <strong>CALCULATED_EXTRAPOLATED</strong> diagnostics only:
              no reverse trial, diameter, RPM, or Stage-3 geometry is admitted or presented as governed.
              V1.5.0 may expose one separately labelled extrapolated model root for illustration after
              invariant checks; it does not establish physical feasibility or a design diameter and
              remains outside the hydraulic envelope and Stage-4 governed input.
            </p>
          </div>
          <div className="grid gap-2 rounded border border-amber-200 bg-white/70 p-2 sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">Signed Δρ = ρC − ρD</span><br /><strong className="font-mono">{kuNumber(reverseSignedBuoyancy?.deltaRhoKgM3)} kg/m³</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">Buoyancy direction</span><br /><strong>{String(reverseSignedBuoyancy?.direction ?? "—")}</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">Trial count / excluded</span><br /><strong className="font-mono">{String(reverseDiagnostics.trialCount ?? reverseTrials.length)} / {reverseDiagnostics.excludedFromHydraulicEnvelope ? "YES" : "—"}</strong></div>
            <div><span className="text-[9px] uppercase tracking-wide text-amber-700">Governed diameter</span><br /><strong>NONE</strong></div>
          </div>
          {hasIllustrativeModelRoot && (
            <div
              data-testid="kuhni-illustrative-model-root"
              className="rounded border border-orange-300 bg-orange-100/80 p-2 text-orange-950"
            >
              <strong>Illustrative extrapolated model root · not a design diameter</strong>
              <p className="mt-1 leading-4">
                {String(illustrativeModelRootSelection?.sourceQualification ?? "CALCULATED_EXTRAPOLATED")} only;
                source-range and reverse-orientation warnings remain visible. This model root does not
                establish physical feasibility, is not a CALCULATED_IN_RANGE result, and cannot be used by Stage 4.
              </p>
              {illustrativeSourceWarnings.length > 0 && (
                <p className="mt-1 font-mono text-[9px] leading-4 text-orange-900">
                  Source/applicability warnings: {illustrativeSourceWarnings.join(" · ")}
                </p>
              )}
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div><span className="text-[9px] uppercase tracking-wide text-orange-700">RPM</span><br /><strong className="font-mono">{kuNumber(illustrativeModelRoot?.rpm, 1)}</strong></div>
                <div><span className="text-[9px] uppercase tracking-wide text-orange-700">Model root D</span><br /><strong className="font-mono">{kuNumber(illustrativeModelRoot?.columnDiameterM)} m</strong></div>
                <div><span className="text-[9px] uppercase tracking-wide text-orange-700">d32</span><br /><strong className="font-mono">{kuNumber(Number(illustrativeModelRoot?.d32M) * 1000)} mm</strong></div>
                <div><span className="text-[9px] uppercase tracking-wide text-orange-700">Flood φ</span><br /><strong className="font-mono">{kuNumber(illustrativeModelRoot?.floodHoldup)}</strong></div>
                <div><span className="text-[9px] uppercase tracking-wide text-orange-700">Mass flux</span><br /><strong className="font-mono">{kuNumber(illustrativeModelRoot?.massFluxKgM2S)} kg/m²·s</strong></div>
              </div>
              {illustrativeAssumptions.length > 0 && (
                <details className="mt-2 rounded border border-orange-200 bg-white/70 p-2">
                  <summary className="cursor-pointer font-semibold">Explicit extrapolation assumptions</summary>
                  <ul className="mt-1 list-disc space-y-1 pl-4 leading-4">
                    {illustrativeAssumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
          {(reverseContinuous || reverseDispersed) && (
            <div className="grid gap-2 rounded border border-amber-200 bg-white/70 p-2 sm:grid-cols-2">
              <div>
                <span className="text-[9px] uppercase tracking-wide text-amber-700">Selected continuous phase</span>
                <p className="mt-0.5 font-semibold">{String(reverseContinuous?.identity ?? "—")}</p>
                <p className="font-mono text-[9px]">Q {kuNumber(reverseContinuous?.flowM3S, 6)} m³/s · ρ {kuNumber(reverseContinuous?.densityKgM3)} kg/m³ · μ {kuNumber(reverseContinuous?.dynamicViscosityPaS, 6)} Pa·s</p>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wide text-amber-700">Selected dispersed phase</span>
                <p className="mt-0.5 font-semibold">{String(reverseDispersed?.identity ?? "—")}</p>
                <p className="font-mono text-[9px]">Q {kuNumber(reverseDispersed?.flowM3S, 6)} m³/s · ρ {kuNumber(reverseDispersed?.densityKgM3)} kg/m³ · μ {kuNumber(reverseDispersed?.dynamicViscosityPaS, 6)} Pa·s</p>
              </div>
            </div>
          )}
          <p className="rounded border border-amber-200 bg-white/70 p-2 font-mono leading-4">
            {String(reverseSignedBuoyancy?.equation ?? "0=(ρC−ρD)Vg−0.5ρC Cd Ap |w|w; sign(w)=sign(ρC−ρD)")}
          </p>
          {reverseMapping && (
            <p className="rounded border border-amber-200 bg-white/70 p-2 leading-4">
              Proposed countercurrent mapping only: {String(reverseMapping.continuousPhase ?? "RRBO")} continuous
              {" "}{String(reverseMapping.continuousDirection ?? "UPWARD")} ({String(reverseMapping.continuousInlet ?? "BOTTOM")} → {String(reverseMapping.continuousOutlet ?? "TOP")});
              {" "}{String(reverseMapping.dispersedPhase ?? "NMP")} dispersed
              {" "}{String(reverseMapping.dispersedDirection ?? "DOWNWARD")} ({String(reverseMapping.dispersedInlet ?? "TOP")} → {String(reverseMapping.dispersedOutlet ?? "BOTTOM")}).
            </p>
          )}
          {reverseTrials.length > 0 && (
            <details className="rounded border border-amber-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 font-semibold text-amber-900">
                Audit trial details ({reverseTrials.length} numerical trial{reverseTrials.length === 1 ? "" : "s"})
              </summary>
              <div className="overflow-x-auto border-t border-amber-100">
                <table className="w-full min-w-[920px] text-left text-[10px]">
                  <thead className="bg-amber-100/70 text-[9px] uppercase tracking-wide text-amber-800">
                    <tr>{["RPM", "Diagnostic D", "d32", "Δρ", "Signed w", "Flood φ", "Loading", "Applicability", "Admission"].map((label) => <th key={label} className="px-2 py-2">{label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {reverseTrials.map((trial, index) => {
                      const terminal = asRecord(trial.terminal);
                      const applicability = asRecord(trial.applicability);
                      const modelRootAssessment = asRecord(trial.modelRootAssessment);
                      const modelRootStatus = textValue(modelRootAssessment?.status);
                      return (
                        <tr key={`${String(trial.rpm)}-${index}`}>
                          <td className="px-2 py-2 font-mono font-semibold">{kuNumber(trial.rpm, 1)}</td>
                          <td className="px-2 py-2 font-mono">{kuNumber(trial.columnDiameterM)} m</td>
                          <td className="px-2 py-2 font-mono">{kuNumber(Number(trial.d32M) * 1000)} mm</td>
                          <td className="px-2 py-2 font-mono">{kuNumber(terminal?.deltaRhoKgM3)} kg/m³</td>
                          <td className="px-2 py-2 font-mono">{kuNumber(terminal?.relativeVelocityMS)} m/s</td>
                          <td className="px-2 py-2 font-mono">{kuNumber(trial.floodHoldup)}</td>
                          <td className="px-2 py-2 font-mono">{kuNumber(Number(trial.actualLoading) * 100, 1)}%</td>
                          <td className="max-w-[280px] px-2 py-2 font-mono text-[9px] leading-3">
                            {Array.isArray(applicability?.codes)
                              ? (applicability.codes as unknown[]).slice(0, 3).map(String).join(" · ")
                              : String(applicability?.status ?? "CALCULATED_EXTRAPOLATED")}
                          </td>
                          <td className={`px-2 py-2 font-semibold ${modelRootStatus === "EXTRAPOLATED_MODEL_ROOT" ? "text-orange-800" : "text-red-800"}`}>
                            {modelRootStatus === "EXTRAPOLATED_MODEL_ROOT" ? "ILLUSTRATIVE ROOT" : "EXCLUDED"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {reverseTrials.length === 0 && (
            <p className="rounded border border-red-200 bg-red-50 p-2 text-red-900">
              No reverse numerical trial was evaluable; no fallback or stale diameter was retained.
            </p>
          )}
          {reverseRejectedTrials.length > 0 && (
            <details className="rounded border border-amber-200 bg-amber-50/70 p-2 text-amber-950">
              <summary className="cursor-pointer font-semibold">
                {reverseRejectedTrials.length} reverse RPM trial{reverseRejectedTrials.length === 1 ? "" : "s"} had no numerical diagnostic
              </summary>
              <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                {reverseRejectedTrials.map((trial, index) => (
                  <li key={`${String(trial.rpm)}-${index}`} className="font-mono">
                    {kuNumber(trial.rpm, 1)} rpm · {String(trial.reason ?? "UNRESOLVED")} · {String(trial.message ?? "No fallback retained.")}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="leading-4 text-amber-900">
            Unsupported empirical closure evidence is retained in the immutable diagnostic record. A signed force
            balance does not qualify Myint drag/shape, Garthe characteristic velocity, swarm holdup, flooding, or
            phase-control behavior for RRBO/NMP reverse service.
          </p>
        </div>
      )}
      <div
        data-testid="kuhni-stage-disposition"
        className="grid gap-2 rounded border border-slate-200 bg-white p-3 text-[10px] sm:grid-cols-2"
      >
        <div>
          <span className="text-[9px] uppercase tracking-wide text-slate-500">Stage 3 geometry design basis</span>
          <p className="mt-0.5 font-semibold text-blue-900">
            {fixedGeometryAuthority
              ? `Fixed N_T ${String(authority?.value ?? "—")} · ${geometryLabel}`
              : `Historical N_T ${String(authority?.value ?? "—")} · ${geometryLabel}`}
          </p>
          <p className="mt-1 text-slate-600">
            {fixedGeometryAuthority
              ? "Stage 3 automatic Kühni geometry always uses the fixed pre-pilot design basis N_T=7."
              : "Historical immutable resolver record; the persisted geometry authority is shown without reinterpretation."}
          </p>
        </div>
        <div>
          <span className="text-[9px] uppercase tracking-wide text-slate-500">
            {fixedGeometryAuthority ? "Stage 2 scientific authority" : "Stage 2 authority"}
          </span>
          <p className={`mt-0.5 font-semibold ${stage2Accepted ? "text-emerald-800" : "text-amber-800"}`}>
            {stage2Accepted
              ? fixedGeometryAuthority
                ? `Accepted Predictive N_T ${String(stage2AcceptedNt)}`
                : `Accepted N_T ${String(stage2AcceptedNt)}`
              : fixedGeometryAuthority ? "Accepted Predictive N_T unavailable" : "Accepted N_T unavailable"}
          </p>
          <p className="mt-1 text-slate-600">
            {fixedGeometryAuthority
              ? "Retained separately for scientific reporting and downstream Stage 4; it never changes the Stage 3 geometry basis."
              : "Read-only thermodynamic authority is separate from the Stage 3 hydraulic admission decision."}
          </p>
        </div>
        <div className="sm:col-span-2">
          <span className="text-[9px] uppercase tracking-wide text-slate-500">Stage 3 hydraulic disposition</span>
          <p className={`mt-0.5 font-semibold ${
            hasPrePilotCandidate
              ? "text-amber-800"
              : trials.length
                ? "text-emerald-800"
              : explicitPrerequisiteIsSupported
                ? "text-amber-800"
                : "text-red-800"
          }`}>
            {stage3Disposition}
          </p>
          <p className="mt-1 text-slate-600">
            {hasPrePilotCandidate
              ? "The displayed candidate is HETS-screening-only; governed Stage-3, finite-rate Stage-4, and mass-transfer outputs remain unchanged."
              : "Rejected or empty envelopes do not nominate a diameter, RPM, or Stage 3 geometry."}
          </p>
        </div>
      </div>
      {displayedFailedPrerequisiteCode && (
        <div
          data-testid="kuhni-hydraulic-prerequisite"
          className="rounded border border-red-200 bg-red-50 p-3 text-[10px] text-red-950"
        >
          <strong>Hydraulic prerequisite not satisfied</strong>
          <p className="mt-1 font-mono font-semibold">{displayedFailedPrerequisiteCode}</p>
          {displayedFailedPrerequisiteMessage && <p className="mt-1 leading-4">{displayedFailedPrerequisiteMessage}</p>}
        </div>
      )}
      {!trials.length && displayedRootFailure && (
        <div
          data-testid="kuhni-root-failure-reason"
          className={`rounded border p-3 text-[10px] ${
            explicitPrerequisiteIsSupported
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-red-200 bg-red-50 text-red-950"
          }`}
        >
          <strong>Hydraulic root admission result</strong>
          {persistedRootFailureCode && <p className="mt-1 font-mono font-semibold">{persistedRootFailureCode}</p>}
          {persistedRootFailureMessage && <p className="mt-1 leading-4">{persistedRootFailureMessage}</p>}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map(([label, value]) => (
          <div key={label} className="rounded border border-blue-100 bg-white p-2">
            <span className="text-[9px] uppercase tracking-wide text-slate-500">{label}</span>
            <p className="mt-0.5 break-words font-mono text-[11px] font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded border border-blue-100 bg-white">
        <table className="w-full min-w-[840px] text-left text-[10px]">
          <thead className="bg-slate-100 text-[9px] uppercase tracking-wide text-slate-600">
            <tr>{["RPM", "Required D", "Rotor D", "d32", "Flood holdup", "Flooding load", "Tip speed", "P/V", "Myint states", "Status"].map((label) => <th key={label} className="px-2 py-2">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trials.map((trial) => (
              <tr key={String(trial.rpm)}>
                <td className="px-2 py-2 font-mono font-semibold">{kuNumber(trial.rpm, 1)}</td>
                <td className="px-2 py-2 font-mono">{kuNumber(trial.columnDiameterM)} m</td>
                <td className="px-2 py-2 font-mono">{kuNumber(trial.rotorDiameterM)} m</td>
                <td className="px-2 py-2 font-mono">{kuNumber(Number(trial.d32M) * 1000)} mm</td>
                <td className="px-2 py-2 font-mono">{kuNumber(trial.floodHoldup)}</td>
                <td className="px-2 py-2 font-mono">{kuNumber(Number(trial.actualLoading) * 100, 1)}%</td>
                <td className="px-2 py-2 font-mono">{kuNumber(trial.tipSpeedMS)} m/s</td>
                <td className="px-2 py-2 font-mono">{kuNumber(trial.powerVolumeWM3, 1)} W/m³</td>
                <td className="px-2 py-2 font-mono">{kuNumber((trial.terminal as any)?.re, 1)} / {kuNumber(trial.characteristicRe, 1)} / {kuNumber(trial.swarmRe, 1)}</td>
                <td className="px-2 py-2 font-semibold text-amber-800">{String(trial.status ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trials.length === 0 && !hasPrePilotCandidate && (
        <p className="rounded border border-red-200 bg-red-50/60 p-2 text-[10px] text-red-900">
          No calculated-in-range hydraulic trial was accepted. The table above intentionally contains no fallback diameter.
        </p>
      )}
      {rejectedTrials.length > 0 && (
        <details
          data-testid="kuhni-rejected-rpm-trials"
          className="overflow-x-auto rounded border border-red-200 bg-red-50/40"
        >
          <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold text-red-950">
            Rejected hydraulic RPM trials ({rejectedTrials.length}) · audit details
          </summary>
          <div className="border-t border-red-200 px-3 py-2 text-[10px] text-red-950">
            <p className="text-red-800">Saved resolver reasons are shown verbatim and are not admitted as hydraulic-envelope results.</p>
            <table className="mt-2 w-full min-w-[460px] text-left text-[10px]">
              <thead className="bg-red-50 text-[9px] uppercase tracking-wide text-red-800">
                <tr><th className="px-2 py-2">RPM</th><th className="px-2 py-2">Saved rejection reason</th></tr>
              </thead>
              <tbody className="divide-y divide-red-100">
                {rejectedTrials.map((trial, index) => (
                  <tr key={`${trial.rpm}-${index}`}>
                    <td className="px-2 py-2 font-mono font-semibold">{trial.rpm}</td>
                    <td className="px-2 py-2 font-mono break-words text-red-900">{trial.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <div className="grid gap-2 lg:grid-cols-2">
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-[10px] text-emerald-950">
          <strong>System-owned authority</strong>
          <p className="mt-1">Column/rotor geometry, RPM trials, \(N_T\), d32, flooding, tip speed and P/V are calculated server-side. The request carries no geometry, RPM, or theoretical-stage input.</p>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-950">
          <strong>Coupled duty status: {String(coupled?.status ?? "DEPENDENCY_BLOCKED")}</strong>
          <p className="mt-1">{String(coupled?.blocker ?? "Final RPM, physical compartments and active height require the approved mass-transfer/efficiency model.")}</p>
        </div>
      </div>
      <details className="rounded-md border border-blue-200 bg-blue-50/50 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold text-blue-950">
          Calculation basis &amp; provenance
        </summary>
        <div className="mt-3">
          {run.processBasis ? (
            <div className="grid gap-x-5 gap-y-2 text-[10px] text-blue-950 sm:grid-cols-2 lg:grid-cols-4">
              {flattenProcessBasis(run.processBasis).map(([key, value]) => (
                <div key={key} className="min-w-0 break-words">
                  <span className="text-blue-700">{key}</span><br />
                  <strong className="font-mono">{value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-blue-800">No immutable Stage-1 process basis is available for this resolver run.</p>
          )}
          <p className="mt-3 border-t border-blue-200 pt-2 text-[10px] text-blue-800">
            Read-only immutable Stage-1 snapshot used by this resolver run. Values are not reconstructed, defaulted, or editable here.
          </p>
        </div>
      </details>
      <p className="break-all font-mono text-[9px] text-slate-500">
        Result hash: {String(run.calculationHash ?? "—")} · Immutable record: {String(run.immutableHash ?? "—")}
      </p>
    </section>
  );
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
  const [latest, setLatest] = useState<KuhniRun | null>(null);
  const [runs, setRuns] = useState<KuhniRun[]>([]);
  const [resolverLatest, setResolverLatest] = useState<KuhniRun | null>(null);
  const [resolverRuns, setResolverRuns] = useState<KuhniRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadRuns = async () => {
    if (!designId) return;
    setLoading(true);
    setLoadingError(null);
    try {
      const [latestResponse, runsResponse, resolverLatestResponse, resolverRunsResponse] = await Promise.all([
        fetch(`/api/ecr-pre-pilot/designs/${designId}/kuhni-hydrodynamics/latest`, { credentials: "include" }),
        fetch(`/api/ecr-pre-pilot/designs/${designId}/kuhni-hydrodynamics/runs`, { credentials: "include" }),
        fetch(`/api/ecr-pre-pilot/designs/${designId}/kuhni-geometry-resolver/latest`, { credentials: "include" }),
        fetch(`/api/ecr-pre-pilot/designs/${designId}/kuhni-geometry-resolver/runs`, { credentials: "include" }),
      ]);
      if (!latestResponse.ok && latestResponse.status !== 404) throw new Error("Latest hydrodynamic run could not be loaded.");
      if (!runsResponse.ok) throw new Error("Hydrodynamic run history could not be loaded.");
      if (!resolverLatestResponse.ok && resolverLatestResponse.status !== 404) throw new Error("Latest geometry resolver run could not be loaded.");
      if (!resolverRunsResponse.ok) throw new Error("Geometry resolver history could not be loaded.");
      const latestPayload = latestResponse.status === 404 ? null : await latestResponse.json();
      const runsPayload = await runsResponse.json();
      const resolverLatestPayload = resolverLatestResponse.status === 404 ? null : await resolverLatestResponse.json();
      const resolverRunsPayload = await resolverRunsResponse.json();
      const latestResult = latestPayload?.result
        ? { ...latestPayload.result, id: latestPayload.id, createdAt: latestPayload.createdAt, immutableHash: latestPayload.immutableHash }
        : null;
      setLatest(latestResult as KuhniRun | null);
      setRuns((runsPayload?.runs ?? runsPayload ?? []) as KuhniRun[]);
      setResolverLatest(resolverLatestPayload?.result
         ? {
           ...resolverLatestPayload.result,
           id: resolverLatestPayload.id,
           createdAt: resolverLatestPayload.createdAt,
           immutableHash: resolverLatestPayload.immutableHash,
           integrityStatus: resolverLatestPayload.integrityStatus,
           stage1SnapshotHash: resolverLatestPayload.stage1SnapshotHash,
           implementationHash: resolverLatestPayload.implementationHash,
           presentationQualification: resolverLatestPayload.presentationQualification,
         }
        : null);
       setResolverRuns((resolverRunsPayload?.runs ?? resolverRunsPayload ?? []).map((item: KuhniRun & { result?: Record<string, unknown>; presentationQualification?: unknown }) => ({
         ...(item.result ?? item),
         id: item.id,
         createdAt: item.createdAt,
         immutableHash: item.immutableHash,
         integrityStatus: item.integrityStatus,
         stage1SnapshotHash: item.stage1SnapshotHash,
         implementationHash: item.implementationHash,
         presentationQualification: item.presentationQualification,
       })) as KuhniRun[]);
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
    if (!designId) {
      toast({
        title: "Stage 3 run blocked",
        description: "Save Stage 1 before running the geometry resolver.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    setLoadingError(null);
    try {
      const response = await fetch(`/api/ecr-pre-pilot/designs/${designId}/kuhni-geometry-resolver/runs`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? payload.message ?? "Hydrodynamic screening could not start.");
      setResolverLatest(payload as KuhniRun);
      await loadRuns();
      toast({ title: "Kuhni resolver complete", description: "The automatic hydraulic envelope and theoretical-stage provenance were persisted immutably." });
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
              <CardTitle className="text-[15px] text-slate-900">Stage 3 · Automatic Kuhni geometry resolution</CardTitle>
              <CardDescription className="mt-0.5 max-w-2xl text-[11px] leading-4">
                 Server-owned geometry and RPM resolution from immutable Stage 1 using the fixed Stage-3 pre-pilot design basis N_T=7. Any accepted Stage-2 Predictive N_T remains separate scientific evidence.
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            onClick={handleRun}
            disabled={!designId || submitting || loading}
            className="h-8 gap-1.5 bg-slate-900 px-3 text-xs hover:bg-slate-700"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {submitting ? "Resolving geometry…" : "Run automatic resolver"}
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
              {thermodynamicDependencyReady ? "Stage 2 accepted N_T retained separately" : "Stage 2 accepted N_T unavailable · geometry remains N_T = 7"}
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
             Read-only persisted job data. Stage 3 always records STAGE3_GEOMETRY_DESIGN_NT=7 as its fixed geometry basis; a valid Stage-2 accepted Predictive N_T is retained separately and is never relabelled as 7.
          </p>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-[11px] leading-4 text-amber-950">
          <strong>Resolver boundary.</strong> Stage 3 now calculates the hydraulic diameter/RPM envelope. Final operating RPM, physical compartments and active height remain visibly dependency-blocked until the approved mass-transfer and compartment-efficiency model is available.
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Server-owned calculation authority</h3>
            <span className="font-mono text-[10px] text-slate-400">POST /kuhni-geometry-resolver/runs · empty body</span>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-600">
             Geometry, RPM and flooding design fraction are not user inputs. Every run snapshots the current Stage‑1 process basis and uses the immutable STAGE3_GEOMETRY_DESIGN_NT=7 basis while retaining any newest valid Stage‑2 accepted Predictive N_T as separate scientific reporting.
          </p>
        </div>
        <div className="border-t border-slate-200 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">System-calculated Stage-3 outputs</h3>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">Myint/Garthe local states, turning-point capacity and physical search bounds are replayed server-side and persisted in the immutable resolver record.</p>
        </div>
        {loading && !resolverLatest ? (
          <div className="space-y-2"><div className="h-8 animate-pulse rounded bg-slate-100" /><div className="h-20 animate-pulse rounded bg-slate-100" /></div>
        ) : loadingError ? (
          <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 text-[11px] text-red-800"><span>{loadingError}</span><Button type="button" variant="outline" onClick={() => void loadRuns()} className="h-7 gap-1 px-2 text-[11px]"><RefreshCw className="h-3 w-3" /> Retry</Button></div>
        ) : !resolverLatest ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-[11px] text-slate-500">No immutable geometry resolver run yet. Run the automatic resolver to calculate the hydraulic envelope.</div>
        ) : (
          <KuhniResolverPanel run={resolverLatest} runCount={resolverRuns.length} />
        )}
        {latest && (
          <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">Historical KUHNI_PHASE1_V1.0.3 runs ({runs.length})</summary>
            <div className="mt-3"><KuhniResultPanel run={latest} runCount={runs.length} /></div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}