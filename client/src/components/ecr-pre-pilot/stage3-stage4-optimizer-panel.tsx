import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stage3GeometryBasisReport } from "./stage3-geometry-basis-report";
import { P1CandidatePanel } from "./p1-candidate-panel";

type OptimizerRun = {
  id?: string | number;
  status?: string;
  integrityStatus?: string;
  stage1SnapshotHash?: string;
  selectedOrientation?: string | null;
  selectedRpm?: number | null;
  selectedGeometry?: {
    columnDiameterM?: number | null;
    compartmentHeightM?: number | null;
    hcToColumn?: number | null;
    rotorDiameterM?: number | null;
    rotorToColumn?: number | null;
    freeArea?: number | null;
  } | null;
  selectedOperatingWindow?: {
    rpmMin?: number | null;
    rpmMax?: number | null;
    widthRpm?: number | null;
    validTrialCount?: number | null;
  } | null;
  orientationComparison?: Array<{
    orientation?: string;
    status?: string;
    selectedGeometry?: { hcToColumn?: number; columnDiameterM?: number } | null;
    operatingWindow?: { rpmMin?: number; rpmMax?: number } | null;
  }>;
  assumptions?: string[];
  blockers?: string[];
  controls?: {
    diameterMinM?: number;
    diameterMaxM?: number;
    diameterStepM?: number;
    rpmMin?: number;
    rpmMax?: number;
    hcToColumn?: number[];
    rotorToColumn?: number[];
    freeArea?: number[];
    minimumUsefulWindowRpm?: number;
  };
  selectedTrial?: {
    rpm?: number | null;
    tipSpeedMS?: number | null;
    actualLoading?: number | null;
    designFloodFraction?: number | null;
    d32M?: number | null;
    holdup?: number | null;
    floodHoldup?: number | null;
    hydraulicMethod?: { methodId?: string; status?: string };
    powerVolumeWM3?: number | null;
  } | null;
  selectionRationale?: {
    diameterSelection?: {
      acceptedAdequateDiametersM?: number[];
      SMALLEST_ACCEPTED_ADEQUATE_DIAMETER?: number | null;
      SELECTED_NEXT_SMALLEST_ACCEPTED_DIAMETER?: number | null;
      status?: string;
    };
    objective?: string;
    ordering?: string[];
    usefulWindowPreference?: {
      minimumWindowWidthRpm?: number;
      meaning?: string;
      adequateGeometryCount?: number;
      selectedMeetsPreference?: boolean;
    };
    sizeWindowComparisons?: Array<{
      role?: string;
      geometry?: {
        columnDiameterM?: number;
        compartmentHeightM?: number;
        hcToColumn?: number;
        rotorDiameterM?: number;
        rotorToColumn?: number;
        freeArea?: number;
      };
      operatingWindow?: {
        rpmMin?: number;
        rpmMax?: number;
        widthRpm?: number;
      };
      meetsUsefulWindowPreference?: boolean;
      representativeTrial?: {
        rpm?: number;
        tipSpeedMS?: number;
        actualLoading?: number | null;
        designFloodFraction?: number | null;
        d32M?: number | null;
        holdup?: number | null;
        powerVolumeWM3?: number | null;
      } | null;
      rationale?: string;
    }>;
    alternatives?: Array<{
      role?: string;
      geometry?: {
        columnDiameterM?: number;
        compartmentHeightM?: number;
        hcToColumn?: number;
        rotorDiameterM?: number;
        rotorToColumn?: number;
        freeArea?: number;
      };
      operatingWindow?: {
        rpmMin?: number;
        rpmMax?: number;
        widthRpm?: number;
      };
      meetsUsefulWindowPreference?: boolean;
      representativeTrial?: {
        rpm?: number;
        tipSpeedMS?: number;
        actualLoading?: number | null;
        designFloodFraction?: number | null;
        d32M?: number | null;
        holdup?: number | null;
        powerVolumeWM3?: number | null;
      } | null;
      rationale?: string;
    }>;
  };
  freeAreaSensitivity?: {
    status?: string;
    statement?: string;
  };
  selectedOrientationDiagnostics?: {
    freeAreaSensitivity?: {
      status?: string;
      statement?: string;
    } | null;
  };
  [key: string]: unknown;
};

function value(value: unknown, digits = 3) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : "—";
}

function labelOrientation(value: unknown) {
  return String(value ?? "—").replaceAll("-", " ");
}

export function Stage3Stage4OptimizerPanel({
  designId,
  refreshToken = 0,
}: {
  designId: number | null;
  refreshToken?: number;
}) {
  const [run, setRun] = useState<OptimizerRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedFreeAreaSensitivity =
    run?.selectedOrientationDiagnostics?.freeAreaSensitivity ?? run?.freeAreaSensitivity;

  const load = useCallback(async () => {
    if (!designId) {
      setRun(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/ecr-pre-pilot/designs/${designId}/stage3-stage4-optimizer/latest`,
        { credentials: "include" },
      );
      if (response.status === 404) {
        setRun(null);
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Optimizer result could not be loaded.");
      const loadedRun = (payload?.result
        ? {
          ...payload.result,
          id: payload.id,
          createdAt: payload.createdAt,
          immutableHash: payload.immutableHash,
          integrityStatus: payload.integrityStatus,
          stage1SnapshotHash: payload.stage1SnapshotHash,
        }
        : payload) as OptimizerRun;
      setRun(loadedRun);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Optimizer result could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [designId, refreshToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const execute = async () => {
    if (!designId) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/ecr-pre-pilot/designs/${designId}/stage3-stage4-optimizer/runs`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Stage 3/4 optimizer could not complete.");
      setRun(payload as OptimizerRun);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Stage 3/4 optimizer could not complete.");
    } finally {
      setSubmitting(false);
    }
  };

  const geometry = run?.selectedGeometry;
  const window = run?.selectedOperatingWindow;
  return (
    <section className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
      <P1CandidatePanel designId={designId} refreshToken={refreshToken} />
      <p className="mb-2 text-xs font-semibold">Existing authority method (legacy hydraulic model) — separate from corrected P1 candidates</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-950">
            Stage 3/4 fixed-geometry optimizer
          </h3>
          <p className="mt-1 max-w-3xl text-[10px] leading-4 text-indigo-900">
            Published design/search envelope uses only hc/D = 0.20–0.30, rotor/D = 0.33–0.50,
            free area = 0.20–0.40 and 30–70 rpm. The visible RPM value is a
            ranking preference (not a hydraulic limit): the second-smallest distinct
            accepted adequate diameter is selected for a one-grid-step pre-pilot design margin.
          </p>
        </div>
        <div className="flex shrink-0 items-end gap-2">
          <div className="text-[9px] text-indigo-950">
            <span className="block font-semibold">Useful window preference</span>
            <span className="flex h-8 items-center font-mono text-[10px]">
              20.0 rpm minimum (fixed)
            </span>
          </div>
          <Button
            type="button"
            onClick={() => void execute()}
            disabled={!designId || submitting || loading}
            className="h-8 shrink-0 gap-1.5 bg-indigo-900 px-3 text-xs hover:bg-indigo-800"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {submitting ? "Optimizing…" : "Run Stage 3/4 optimizer"}
          </Button>
        </div>
      </div>
      <Stage3GeometryBasisReport run={run} />
      {error && (
        <div className="mt-3 flex items-center justify-between rounded border border-red-200 bg-red-50 p-2 text-[10px] text-red-800">
          <span>{error}</span>
          <Button type="button" variant="outline" onClick={() => void load()} className="h-6 gap-1 px-2 text-[10px]">
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      )}
      {loading && !run ? (
        <div className="mt-3 h-16 animate-pulse rounded bg-indigo-100/60" />
      ) : !run ? (
        <p className="mt-3 rounded border border-dashed border-indigo-300 bg-white/60 p-3 text-[10px] text-indigo-900">
          No persisted optimizer result exists for this Stage 1 snapshot.
        </p>
      ) : (
        <div className="mt-3 space-y-3 text-[10px] text-slate-700">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Status", run.status],
              ["Orientation", labelOrientation(run.selectedOrientation)],
              ["Column D", `${value(geometry?.columnDiameterM)} m`],
              ["Selected hc/D", value(geometry?.hcToColumn, 2)],
              ["Selected RPM", `${value(run.selectedRpm, 1)} rpm`],
            ].map(([title, result]) => (
              <div key={String(title)} className="rounded border border-indigo-100 bg-white p-2">
                <span className="text-slate-500">{title}</span>
                <strong className="mt-0.5 block font-mono text-slate-950">{result}</strong>
              </div>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="text-slate-500">Selected compartment hc</span><br /><strong className="font-mono">{value(geometry?.compartmentHeightM)} m</strong></div>
            <div><span className="text-slate-500">Selected rotor diameter</span><br /><strong className="font-mono">{value(geometry?.rotorDiameterM)} m</strong></div>
            <div><span className="text-slate-500">Rotor / D</span><br /><strong className="font-mono">{value(geometry?.rotorToColumn, 2)}</strong></div>
            <div><span className="text-slate-500">Free area</span><br /><strong className="font-mono">{value(geometry?.freeArea, 2)}</strong></div>
            <div><span className="text-slate-500">Useful RPM window</span><br /><strong className="font-mono">{value(window?.rpmMin, 1)}–{value(window?.rpmMax, 1)} rpm ({value(window?.widthRpm, 1)} rpm)</strong></div>
          </div>
          <p className="border-t border-indigo-100 pt-2 text-slate-600">
            loading = {value(run.selectedTrial?.actualLoading, 3)} · tip speed = {value(run.selectedTrial?.tipSpeedMS, 3)} m/s ·
            d32 = {value(run.selectedTrial?.d32M, 5)} m · {run.selectedTrial?.hydraulicMethod ? "Operating holdup" : "Holdup (stored model basis)"} = {value(run.selectedTrial?.holdup, 4)} ·
            {run.selectedTrial?.hydraulicMethod && <>Modeled flood holdup = {value(run.selectedTrial?.floodHoldup, 4)} · Conservative C/interface case · Inversion / entrainment: UNKNOWN · pre-pilot extrapolation, not qualification · </>}
            P/V = {value(run.selectedTrial?.powerVolumeWM3, 2)} W/m³ · fixed design N<sub>T</sub> = 7.
            Stage-2 accepted N<sub>T</sub> remains reference-only.
          </p>
          <div className="rounded border border-indigo-200 bg-indigo-50/70 p-2">
            <strong className="text-indigo-950">Transparent size/window ranking</strong>
            <p className="mt-1 leading-4 text-indigo-900">
              Useful-window preference:{" "}
              <span className="font-mono">
                {value(
                  run.selectionRationale?.usefulWindowPreference?.minimumWindowWidthRpm
                    ?? run.controls?.minimumUsefulWindowRpm,
                  1,
                )} rpm minimum
              </span>
              {" "}— ranking preference only, not a hydraulic limit. Adequate geometries:{" "}
              <span className="font-mono">
                {run.selectionRationale?.usefulWindowPreference?.adequateGeometryCount ?? "—"}
              </span>
              {" "}·{" "}
              {run.selectionRationale?.diameterSelection?.status === "INSUFFICIENT_ACCEPTED_ADEQUATE_DIAMETERS"
                ? "No selection: fewer than two distinct accepted adequate diameters. No fallback to the smallest diameter."
                : "The second-smallest distinct accepted adequate diameter is selected for the pre-pilot margin."}
            </p>
            {run.selectionRationale?.diameterSelection && (
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded bg-white p-2">
                  <dt>Smallest accepted adequate diameter</dt>
                  <dd className="font-mono font-semibold">
                    {value(run.selectionRationale.diameterSelection.SMALLEST_ACCEPTED_ADEQUATE_DIAMETER, 3)} m
                  </dd>
                </div>
                <div className="rounded bg-white p-2">
                  <dt>Selected next-smallest accepted diameter</dt>
                  <dd className="font-mono font-semibold">
                    {value(run.selectionRationale.diameterSelection.SELECTED_NEXT_SMALLEST_ACCEPTED_DIAMETER, 3)} m
                  </dd>
                </div>
              </dl>
            )}
            {Array.isArray(run.selectionRationale?.alternatives)
              && run.selectionRationale!.alternatives!.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-indigo-200 pt-2">
                <span className="text-slate-600">Retained occupied-grid size/window comparisons and frontier alternatives</span>
                {run.selectionRationale!.alternatives!.slice(0, 6).map((alternative, index) => (
                  <div key={`${alternative.role ?? "alternative"}-${index}`} className="rounded bg-white/80 p-1.5">
                    <div className="font-mono text-[9px] text-slate-800">
                      {alternative.role ?? "FRONTIER_ALTERNATIVE"} · D{" "}
                      {value(alternative.geometry?.columnDiameterM, 3)} m · hc{" "}
                      {value(alternative.geometry?.compartmentHeightM, 3)} m · hc/D{" "}
                      {value(alternative.geometry?.hcToColumn, 2)} ·{" "}
                      rotor {value(alternative.geometry?.rotorDiameterM, 3)} m (rotor/D{" "}
                      {value(alternative.geometry?.rotorToColumn, 2)}) · free area{" "}
                      {value(alternative.geometry?.freeArea, 2)} · window{" "}
                      {value(alternative.operatingWindow?.rpmMin, 1)}–{value(alternative.operatingWindow?.rpmMax, 1)} rpm
                      {" "}({value(alternative.operatingWindow?.widthRpm, 1)} rpm)
                      {" "}· {alternative.meetsUsefulWindowPreference ? "meets preference" : "below preference"}
                    </div>
                    <div className="font-mono text-[9px] text-slate-600">
                      representative RPM {value(alternative.representativeTrial?.rpm, 1)} · tip speed{" "}
                      {value(alternative.representativeTrial?.tipSpeedMS, 3)} m/s · loading{" "}
                      {value(alternative.representativeTrial?.actualLoading, 3)} · flood{" "}
                      {value(alternative.representativeTrial?.designFloodFraction, 2)} · d32{" "}
                      {value(alternative.representativeTrial?.d32M, 5)} m · {run.selectedTrial?.hydraulicMethod ? "operating holdup" : "holdup (stored model basis)"}{" "}
                      {value(alternative.representativeTrial?.holdup, 4)} · P/V{" "}
                      {value(alternative.representativeTrial?.powerVolumeWM3, 2)} W/m³
                    </div>
                    <p className="mt-0.5 text-[9px] text-slate-500">{alternative.rationale ?? "Retained for transparent size/window comparison."}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[9px] leading-4 text-slate-500">
            Free-area sensitivity: {selectedFreeAreaSensitivity?.status ?? "—"} ·{" "}
            {selectedFreeAreaSensitivity?.statement ?? "No sensitivity statement returned."}
          </p>
          <div className="rounded border border-slate-200 bg-white p-2">
            <strong className="text-slate-800">Orientation comparison</strong>
            <p className="mt-1 text-[9px] text-slate-500">
              Stage 1 phase orientation is authoritative. The alternate row is comparison evidence only and can never replace it.
            </p>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {(run.orientationComparison ?? []).map((item, index) => (
                <div key={`${String(item?.orientation)}-${index}`} className="font-mono text-[9px]">
                  {labelOrientation(item?.orientation)} · {item?.status ?? "—"} · window{" "}
                  {value(item?.operatingWindow?.rpmMin, 1)}–{value(item?.operatingWindow?.rpmMax, 1)} rpm
                </div>
              ))}
            </div>
          </div>
          <p className="text-[9px] leading-4 text-slate-500">
            The selected D and hc are immutable Stage-3 optimizer inputs to Stage 4.
            Source-range warnings and root residuals remain diagnostics; they are not silently
            converted into a flooding or separation guarantee. Historical records remain
            replayable and are not regenerated by this optimizer.
          </p>
          <p className="text-[9px] leading-4 text-slate-500">
            Selection rationale: {run.selectionRationale?.objective ?? "deterministic fixed-geometry operating-window tradeoff."}
          </p>
        </div>
      )}
    </section>
  );
}
