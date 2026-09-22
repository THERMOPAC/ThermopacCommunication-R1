import { useEffect, useState } from "react";
import { AUTOMATIC_END_RULESET, endEngineeringRows, type Stage5EndProjection } from "@shared/ecr-stage5-end-sections";
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
        if (body.ruleset !== AUTOMATIC_END_RULESET || body.selectionAuthority !== "SERVER_BUILTIN_PER_END_MODELS"
          || !body.assemblies?.top?.overallEngineeringStatus || !body.assemblies?.bottom?.overallEngineeringStatus)
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
          <strong>Source ready · independent system end calculations</strong>
          <p>The active section is unchanged. The system, not the user, determines droplet basis, terminal velocity, margin, diameter and height. HOLD identifies genuine source/property or built-in model gaps; it is not a request for user sizing values.</p>
          {(["top", "bottom"] as const).map(end => <p key={end} data-testid={`end-${end}-status`}><strong>{end.toUpperCase()}:</strong> {result.assemblies[end].overallEngineeringStatus}</p>)}
        </div>
        <details>
          <summary className="cursor-pointer font-semibold text-cyan-900">Design basis and pending engineering inputs</summary>
          <div className="mt-3 space-y-3">
            {(["top", "bottom"] as const).map(end => <section key={end} data-testid={`end-${end}-engineering`}>
              <h3 className="font-semibold">{end.toUpperCase()} — system calculation and source trace</h3>
              <dl className="divide-y">{endEngineeringRows(result.assemblies[end]).map(([label, value]) =>
                <div key={label} className="grid gap-1 py-1 sm:grid-cols-[220px_1fr]"><dt className="font-medium">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>
              {result.assemblies[end].modelAudit.map(a => <p key={a.modelId}><strong>{a.modelId}: {a.eligibility}</strong> — {a.reason} Source: {a.citation}</p>)}
            </section>)}
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
            <p>Additional feed necks inherit Ø{result.active.diameterM * 1000} mm and lie outside active height. Dcalc = √[4(Qnormal/3600)/(π Udesign)]. H10 = Qnormal/(6 × 0.90 × π Dshell²/4). Hstraight = 0.150 + H10 + eNear + eFar + max(0.200, 0.40 Dshell). Thirty-degree sharp-cone references are not fabricated transitions; angle convention and formed junctions remain unqualified. Interfaces are mirrored ±0.150 m. Heads give zero residence credit.</p>
            <p className="break-all font-mono text-[10px]">Current source: {result.sourceHash}<br />Frozen revision {result.active.revisionId}: Ø{result.active.diameterM * 1000} mm × {result.active.compartmentCount} compartments; active height {f(result.active.installedActiveHeightM)} m.</p>
            <p>Historical comparison preferences are not current design authority. No manual diameter selection or save is required.</p>
          </div>
        </details>
      </>}
    </div>
  </section>;
}