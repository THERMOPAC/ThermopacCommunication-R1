import { useEffect, useState } from "react";
import { ArrowLeft, FlaskConical, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { KuhniHydrodynamicsCard } from "@/components/ecr-pre-pilot/kuhni-hydrodynamics-card";
import { Button } from "@/components/ui/button";

export default function EcrPrePilotDesignStage2Page() {
  const [, navigate] = useLocation();
  const [designId, setDesignId] = useState<number | null>(null);
  const [projectNumber, setProjectNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initializeDesign = async () => {
      try {
        let response = await fetch("/api/ecr-pre-pilot/designs/latest-saved", {
          credentials: "include",
        });
        let payload = await response.json().catch(() => ({}));
        if (response.status === 404) {
          const storageKey = "ecr-pre-pilot-allocation-key";
          const existingKey = window.sessionStorage.getItem(storageKey);
          const allocationKey = existingKey ?? window.crypto.randomUUID();
          if (!existingKey) {
            window.sessionStorage.setItem(storageKey, allocationKey);
          }
          response = await fetch("/api/ecr-pre-pilot/designs", {
            method: "POST",
            headers: { "Idempotency-Key": allocationKey },
            credentials: "include",
          });
          payload = await response.json().catch(() => ({}));
        }
        if (!response.ok) {
          throw new Error(payload.message ?? "Project number could not be loaded.");
        }
        if (cancelled) return;
        setDesignId(Number(payload.id));
        setProjectNumber(String(payload.projectNumber ?? ""));
        setLoadError(null);
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
                Stage 2 hydrodynamic screening{projectNumber ? ` · ${projectNumber}` : ""}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/design-software/ecr-pre-pilot-design")}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Stage 1
          </Button>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading design…
          </div>
        ) : loadError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</div>
        ) : (
          <KuhniHydrodynamicsCard designId={designId} />
        )}
      </main>
    </Layout>
  );
}