import React from "react";
import { predictiveNtProgress, type PredictiveProgressJob } from "@/lib/predictive-nt-progress";
import "./predictive-nt-progress.css";

export function PredictiveNtProgress({
  job,
  monitoringPaused = false,
}: {
  job: PredictiveProgressJob;
  monitoringPaused?: boolean;
}) {
  const state = predictiveNtProgress(job, monitoringPaused);
  const measured = !state.indeterminate && state.completed !== null;
  return (
    <div aria-live="polite" aria-atomic="true" data-testid="predictive-nt-progress">
      <div
        role="progressbar"
        aria-label="Predictive N_T calculation progress"
        aria-valuetext={state.label}
        aria-valuemin={0}
        aria-valuemax={state.maximum}
        aria-valuenow={measured ? state.completed! : undefined}
        className="h-2 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={`h-full rounded-full ${state.active ? "bg-blue-600" : "bg-slate-500"} ${
            state.indeterminate ? "predictive-nt-indeterminate" : "transition-[width] motion-reduce:transition-none"
          }`}
          style={state.indeterminate ? undefined : {
            width: `${measured && state.maximum > 0 ? state.completed! / state.maximum * 100 : 0}%`,
          }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-slate-700">{state.label}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{state.detail}</p>
    </div>
  );
}