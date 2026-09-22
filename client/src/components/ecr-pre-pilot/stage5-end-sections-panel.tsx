import { useEffect, useState } from "react";
import { AUTOMATIC_END_RULESET, type Stage5EndProjection } from "@shared/ecr-stage5-end-sections";
import { Button } from "@/components/ui/button";

const f = (n: number) => n.toFixed(3);

export function Stage5EndSectionsPanel({ designId, revisionId, sourceHash, onProjectionChange, refreshToken = 0 }: {
  designId: string | number; revisionId?: string | number; sourceHash?: string;
  onProjectionChange?: (projection: Stage5EndProjection | null, issue?: string | null) => void;
  refreshToken?: number;
}) {
  const [result, storeResult] = useState<Stage5EndProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const publish = (value: Stage5EndProjection | null, issue: string | null = null) => {
    storeResult(value); onProjectionChange?.(value, issue);
  };
  useEffect(() => {
    const controller = new AbortController();
    publish(null); setError(null); setLoading(Boolean(revisionId));
    if (!revisionId) return () => controller.abort();
    void (async () => {
      try {
        const response = await fetch(`/api/ecr-pre-pilot/designs/${designId}/stage5/revisions/${revisionId}/end-sections`,
          { credentials: "include", signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) {
          const code = typeof body.error === "string" && /^[A-Z0-9_]+$/.test(body.error) ? body.error : "STAGE5_END_REQUEST_FAILED";
          const ref = typeof body.reference === "string" && /^[a-f0-9-]{36}$/.test(body.reference) ? ` Reference ${body.reference}.` : "";
          throw new Error(`${code} (HTTP ${response.status}). ${response.status >= 500 ? "Server authority read failed; retry. This is not a geometry selection error." : "Current source authority could not be admitted."}${ref}`);
        }
        if (body.ruleset !== AUTOMATIC_END_RULESET || body.selectionAuthority !== "NO_ADMITTED_SYSTEM_DIAMETER_RULE"
          || body.assemblies?.top?.diameterM !== null || body.assemblies?.bottom?.diameterM !== null)
          throw new Error("STAGE5_END_SYSTEM_AUTHORITY_RESPONSE_REQUIRED");
        if (!controller.signal.aborted) publish(body);
      } catch (cause) {
        if (!controller.signal.aborted) {
          const issue = cause instanceof Error ? cause.message : "STAGE5_END_REQUEST_FAILED";
          setError(issue); publish(null, issue);
        }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [designId, revisionId, sourceHash, refresh, refreshToken]);
  // No background polling of large immutable scientific snapshots.
  const retry = () => { publish(null); setRefresh(n => n + 1); };
  return <section data-testid="stage5-end-sections" className="mt-4 rounded border border-cyan-200 bg-white">
    <header className="flex items-center justify-between gap-3 border-b bg-cyan-50 p-3">
      <h2 className="text-sm font-semibold">System-generated end arrangement</h2>
      <Button size="sm" variant="outline" disabled={loading || !revisionId} onClick={retry}>Refresh authority</Button>
    </header>
    <div className="space-y-3 p-3 text-xs leading-5">
      {!revisionId && <p role="status">Awaiting the current frozen active revision. End geometry is read from system authority, not user diameter choices.</p>}
      {loading && <p role="status">Reading saved feed and verifying the frozen active source. Large saved scientific records can take tens of seconds; no sizing job is being started.</p>}
      {error && <p role="alert" className="rounded bg-red-50 p-2 text-red-800">{error} No previous GA is being reused.</p>}
      {result && <>
        <div data-testid="end-system-status" className="rounded bg-amber-50 p-3">
          <strong>Source ready · end dimensions pending</strong>
          <p>The active section is unchanged. A symbolic current GA is available below; end shell diameters and heights are not yet determined.</p>
          <p>{result.materialContract.status !== "SOURCE_QUALIFIED_NORMAL_DUTY" ? "Normal product flow/density authority is missing. " : ""}An independent approved system diameter-selection rule is missing. Ten-minute residence alone cannot uniquely choose both diameter and height.</p>
        </div>
        <details>
          <summary className="cursor-pointer font-semibold text-cyan-900">Design basis and pending engineering inputs</summary>
          <div className="mt-3 space-y-3">
            <ul className="list-disc pl-5">{result.pendingRequirements.map(s => <li key={s}>{s}</li>)}</ul>
            <section data-testid="end-normal-process-basis">
              <h3 className="font-semibold">NORMAL process — saved Stage 1 S/O {result.feed.solventOilMassRatio} mass</h3>
              <p>Oil {f(result.feed.oilKgH)} kg/h; normal wet solvent {f(result.feed.wetSolventKgH)} kg/h. Combined NORMAL feed: {f(result.materialContract.totalFeedKgH)} kg/h.</p>
              <p>{result.normalProductAuthority?.detail ?? result.materialContract.requiredEvidence}</p>
            </section>
            <section data-testid="end-nozzle-only-basis">
              <h3 className="font-semibold">S/O 1.5 MASS — NOZZLES ONLY</h3>
              <p>Wet-solvent nozzle basis {f(result.nozzleSizingBasis.wetSolventKgH)} kg/h; 120% hydraulic check. This does not change normal material flows, product split or residence geometry.</p>
              <p>Feed nozzle preliminary screens: oil DN {result.nozzles.oilFeed.provisionalDn ?? "pending"}; wet solvent DN {result.nozzles.wetSolventFeed.provisionalDn ?? "pending"}. Product opening envelopes remain unknown.</p>
            </section>
            <p>Additional Ø700 feed necks lie outside active height. Transition conical portion 30°; transition/post-opening minima max(0.200 m, 0.4D), with D pending. Interfaces ±0.150 m from transitions. H10 uses NORMAL product flow and 0.90 usable straight volume to the near opening edge; extension starts at the far edge. Heads give zero residence credit. Mechanical lengths, knuckles, head profiles and overall elevations remain unqualified.</p>
            <p className="break-all font-mono text-[10px]">Current source: {result.sourceHash}<br />Frozen revision {result.active.revisionId}: Ø{result.active.diameterM * 1000} mm × {result.active.compartmentCount} compartments; active height {f(result.active.installedActiveHeightM)} m.</p>
            <p>Historical comparison preferences are not current design authority. No manual diameter selection or save is required.</p>
          </div>
        </details>
      </>}
    </div>
  </section>;
}