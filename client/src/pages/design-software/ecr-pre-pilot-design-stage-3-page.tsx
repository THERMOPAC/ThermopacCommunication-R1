import { useEffect, useState } from "react";
import { ArrowLeft, FlaskConical, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { KuhniHydrodynamicsCard } from "@/components/ecr-pre-pilot/kuhni-hydrodynamics-card";
import { Button } from "@/components/ui/button";

type PredictiveNtDependencyJob = {
  id: string;
  status: string;
  modelHash?: string;
  engineHash?: string;
  result?: {
    status?: string;
    executionStatus?: string;
    predictiveNt?: number | null;
    establishedTheoreticalStages?: number | null;
    engineContractVersion?: string;
    model?: { modelHash?: string };
    engine?: { engineHash?: string };
    stage1TargetGovernance?: { stage1SnapshotHash?: string };
  } | null;
};

const USABLE_THERMODYNAMIC_EXECUTION_STATUSES = new Set([
  "COMPLETED_GOVERNED_SEQUENCE",
  "COMPLETED_DIAGNOSTIC_SEQUENCE",
  "COMPLETED_PRE_PILOT_MULTISTAGE_MATRIX",
]);

export default function EcrPrePilotDesignStage3Page() {
  const [, navigate] = useLocation();
  const [designId, setDesignId] = useState<number | null>(null);
  const [projectNumber, setProjectNumber] = useState("");
  const [stage1SnapshotHash, setStage1SnapshotHash] = useState("");
  const [thermodynamicJob, setThermodynamicJob] = useState<PredictiveNtDependencyJob | null>(null);
  const [thermodynamicLoadError, setThermodynamicLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initializeDesign = async () => {
      try {
        const response = await fetch("/api/ecr-pre-pilot/designs/latest-saved", {
          credentials: "include",
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error("Save Stage 1 Inputs before opening Stage 3 Hydrodynamics.");
        }
        if (!response.ok) throw new Error(payload.message ?? "Project number could not be loaded.");
        const savedDesignId = Number(payload.id);
        if (cancelled) return;
        setDesignId(savedDesignId);
        setProjectNumber(String(payload.projectNumber ?? ""));
        setStage1SnapshotHash(String(payload.inputData?.immutableHash ?? ""));
        setLoadError(null);

        try {
          const jobResponse = await fetch(
            `/api/ecr-pre-pilot/designs/${savedDesignId}/predictive-nt/jobs/latest`,
            { credentials: "include" },
          );
          const jobPayload = await jobResponse.json().catch(() => ({}));
          if (cancelled) return;
          if (jobResponse.status === 404) {
            setThermodynamicJob(null);
            setThermodynamicLoadError(null);
          } else if (!jobResponse.ok) {
            setThermodynamicJob(null);
            setThermodynamicLoadError(jobPayload.error ?? "Latest Stage 2 thermodynamic job could not be loaded.");
          } else {
            setThermodynamicJob(jobPayload as PredictiveNtDependencyJob);
            setThermodynamicLoadError(null);
          }
        } catch (error: unknown) {
          if (cancelled) return;
          setThermodynamicJob(null);
          setThermodynamicLoadError(
            error instanceof Error ? error.message : "Latest Stage 2 thermodynamic job could not be loaded.",
          );
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Project number could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initializeDesign();
    return () => {
      cancelled = true;
    };
  }, []);

  const thermodynamicResult = thermodynamicJob?.result;
  const establishedStages = thermodynamicResult?.establishedTheoreticalStages
    ?? thermodynamicResult?.predictiveNt;
  const thermodynamicStage1SnapshotHash = thermodynamicResult?.stage1TargetGovernance?.stage1SnapshotHash;
  const thermodynamicReady = Boolean(
    thermodynamicJob?.status === "completed"
    && thermodynamicResult
    && thermodynamicResult.status !== "ENGINE_ERROR"
    && USABLE_THERMODYNAMIC_EXECUTION_STATUSES.has(thermodynamicResult.executionStatus ?? "")
    && Number.isInteger(establishedStages)
    && Number(establishedStages) > 0
    && stage1SnapshotHash
    && thermodynamicStage1SnapshotHash === stage1SnapshotHash,
  );

  return (
    <Layout>
      <main className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-50 p-2.5">
              <FlaskConical className="h-6 w-6 text-blue-600" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">ECR Pre-Pilot Design</h1>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                Stage 3 hydrodynamic screening{projectNumber ? ` · ${projectNumber}` : ""}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/design-software/ecr-pre-pilot-design/stage-2")}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Stage 2
          </Button>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading design…
          </div>
        ) : loadError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</div>
        ) : (
          <KuhniHydrodynamicsCard
            designId={designId}
            thermodynamicDependencyReady={thermodynamicReady}
            thermodynamicDependencyError={thermodynamicLoadError}
            thermodynamicDependency={thermodynamicJob ? {
              jobId: thermodynamicJob.id,
              jobStatus: thermodynamicJob.status,
              resultStatus: thermodynamicResult?.status,
              executionStatus: thermodynamicResult?.executionStatus,
              predictiveNt: thermodynamicResult?.predictiveNt,
              establishedTheoreticalStages: thermodynamicResult?.establishedTheoreticalStages,
              engineContractVersion: thermodynamicResult?.engineContractVersion,
              stage1SnapshotHash: thermodynamicStage1SnapshotHash,
              currentStage1SnapshotHash: stage1SnapshotHash,
              modelHash: thermodynamicResult?.model?.modelHash ?? thermodynamicJob.modelHash,
              engineHash: thermodynamicResult?.engine?.engineHash ?? thermodynamicJob.engineHash,
            } : null}
          />
        )}
      </main>
    </Layout>
  );
}
