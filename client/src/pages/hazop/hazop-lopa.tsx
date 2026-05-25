import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart3, Loader2, ArrowLeft, Play, AlertTriangle,
  CheckCircle2, XCircle, RefreshCw, Eye, FlaskConical,
  ShieldCheck, Zap, Info,
} from "lucide-react";

// ── Vocabulary ────────────────────────────────────────────────────────────────

const SEVERITY_CLS: Record<string, string> = {
  minor:        'bg-green-100 text-green-700',
  serious:      'bg-yellow-100 text-yellow-700',
  major:        'bg-orange-100 text-orange-700',
  critical:     'bg-red-100 text-red-700',
  catastrophic: 'bg-red-200 text-red-900 font-bold',
};

const OUTCOME_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  tolerable:            { label: 'Tolerable',        cls: 'bg-green-100 text-green-700',   icon: <CheckCircle2 className="h-4 w-4 text-green-600" /> },
  gap_exists:           { label: 'Gap Exists',       cls: 'bg-orange-100 text-orange-700', icon: <AlertTriangle className="h-4 w-4 text-orange-500" /> },
  requires_sif:         { label: 'SIF Required',     cls: 'bg-red-100 text-red-700',       icon: <XCircle className="h-4 w-4 text-red-500" /> },
  requires_sif_upgrade: { label: 'SIF Upgrade Req.', cls: 'bg-red-200 text-red-900',       icon: <XCircle className="h-4 w-4 text-red-700" /> },
};

const STATUS_CLS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-700',
  in_review: 'bg-blue-100 text-blue-700',
  approved:  'bg-emerald-100 text-emerald-700',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSci(v: string | number | null): string {
  if (v == null || v === '') return '—';
  const n = parseFloat(String(v));
  if (isNaN(n)) return '—';
  if (n === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const coeff = (n / Math.pow(10, exp)).toFixed(2);
  return coeff === '1.00' ? `10⁻${Math.abs(exp)}` : `${coeff}×10${exp < 0 ? '⁻' : ''}${Math.abs(exp)}`;
}

function RiskGaugeMini({ ratio }: { ratio: string | null }) {
  if (!ratio) return <span className="text-xs text-gray-400">Not calculated</span>;
  const r = parseFloat(ratio);
  const pct = Math.min(100, r * 50);
  const color = r <= 1 ? 'bg-green-400' : r <= 2 ? 'bg-orange-400' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <span className={`text-xs font-mono font-semibold ${r <= 1 ? 'text-green-700' : r <= 2 ? 'text-orange-600' : 'text-red-600'}`}>
          ×{r.toFixed(2)}
        </span>
      </div>
      <p className="text-[10px] text-gray-400">MEF / RTTF ratio</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HazopLopaPage() {
  const { id: studyId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: lopas = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/hazop/studies', studyId, 'lopa'],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/lopa`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: summary } = useQuery<any>({
    queryKey: ['/api/hazop/studies', studyId, 'phase5a-summary'],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/phase5a-summary`, { credentials: 'include' }).then(r => r.json()),
  });

  const generateMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/studies/${studyId}/lopa/generate`),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: 'LOPA records generated', description: data.message });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'lopa'] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'phase5a-summary'] });
    },
    onError: () => toast({ title: 'Generation failed', variant: 'destructive' }),
  });

  const ungeneratedCount = (summary?.scenario_count ?? 0) - (summary?.lopa_count ?? 0);

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/hazop/dashboard`)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-indigo-600" />
                LOPA — Layer of Protection Analysis
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">Study {studyId} · Phase 5A · Engine v1.1</p>
            </div>
          </div>
          <Button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending || ungeneratedCount === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {generateMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Generate LOPA{ungeneratedCount > 0 ? ` (${ungeneratedCount})` : ''}
          </Button>
        </div>

        {/* Summary KPI strip */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'LOPA Coverage',  value: `${summary.lopa_coverage_pct}%`,    icon: <FlaskConical className="h-4 w-4 text-indigo-500" />, bold: true },
              { label: 'Tolerable',      value: summary.tolerable_count,             icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> },
              { label: 'SIF Required',   value: summary.requires_sif_count,          icon: <ShieldCheck className="h-4 w-4 text-red-500" /> },
              { label: 'Gap Exists',     value: summary.lopa_gap_count,              icon: <AlertTriangle className="h-4 w-4 text-orange-500" /> },
              { label: 'Not Calculated', value: summary.uncalculated_count,          icon: <Zap className="h-4 w-4 text-gray-400" /> },
              { label: 'Approved',       value: summary.lopa_approved_count,         icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> },
            ].map(k => (
              <div key={k.label} className="bg-white border rounded-lg p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-gray-500">
                  {k.icon}
                  <span className="text-[11px] uppercase tracking-wide">{k.label}</span>
                </div>
                <span className={`text-xl font-bold text-gray-900 ${k.bold ? 'text-indigo-700' : ''}`}>{k.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* LOPA cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          </div>
        ) : lopas.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No LOPA records yet</p>
            <p className="text-sm mt-1">Click "Generate LOPA" to create records for all scenarios</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {lopas.map((lopa: any) => {
              const outcomeM = lopa.lopa_outcome ? OUTCOME_META[lopa.lopa_outcome] : null;
              const warnings: string[] = lopa.warnings ?? [];
              const hasWarnings = warnings.length > 0;

              return (
                <div key={lopa.id} className={`bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow space-y-3 ${hasWarnings ? 'border-amber-300' : ''}`}>
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-800 text-sm">{lopa.lopa_number}</p>
                        {hasWarnings && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            <AlertTriangle className="h-3 w-3" />{warnings.length}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{lopa.scenario_number} — {lopa.scenario_title}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_CLS[lopa.lopa_status]}`}>
                        {lopa.lopa_status}
                      </span>
                      {lopa.arithmetic_version && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-mono">
                          v{lopa.arithmetic_version}
                        </span>
                      )}
                      {lopa.baseline_revision && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                          {lopa.baseline_revision}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Warnings inline */}
                  {hasWarnings && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                      {warnings.map((w, i) => (
                        <p key={i} className="text-[10px] text-amber-800 flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{w}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Severity + IPL audit */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${SEVERITY_CLS[lopa.consequence_severity] ?? 'bg-gray-100 text-gray-600'}`}>
                      {lopa.consequence_severity}
                    </span>
                    {lopa.credited_ipl_count != null ? (
                      <>
                        <span className="text-[10px] text-green-700 border border-green-200 rounded-full px-2 py-0.5 bg-green-50 font-semibold">
                          {lopa.credited_ipl_count} credited
                        </span>
                        {(lopa.excluded_ipl_count ?? 0) > 0 && (
                          <span className="text-[10px] text-red-700 border border-red-200 rounded-full px-2 py-0.5 bg-red-50">
                            {lopa.excluded_ipl_count} excl.
                          </span>
                        )}
                        {(lopa.ccf_derated_count ?? 0) > 0 && (
                          <span className="text-[10px] text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 bg-amber-50">
                            {lopa.ccf_derated_count} CCF derated
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] text-gray-500 border rounded-full px-2 py-0.5">
                        {lopa.credited_count ?? 0}/{lopa.ipl_count ?? 0} IPL (run recalc for audit)
                      </span>
                    )}
                  </div>

                  {/* Frequency row */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">IEF (per year)</p>
                      <p className="font-mono font-semibold">{fmtSci(lopa.ie_frequency_per_year)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">RTTF (per year)</p>
                      <p className="font-mono font-semibold">{fmtSci(lopa.rttf_per_year)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">MEF (per year)</p>
                      <p className="font-mono font-semibold">{fmtSci(lopa.achieved_mef_per_year)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">PFD Product</p>
                      <p className="font-mono font-semibold">{fmtSci(lopa.pfd_product)}</p>
                    </div>
                  </div>

                  {/* Risk gauge */}
                  <RiskGaugeMini ratio={lopa.risk_gap_ratio} />

                  {/* Outcome + SIL */}
                  <div className="flex items-center justify-between">
                    {outcomeM ? (
                      <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${outcomeM.cls}`}>
                        {outcomeM.icon}{outcomeM.label}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 italic">Not calculated yet</span>
                    )}
                    {lopa.required_sil && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-700">
                        SIL {lopa.required_sil} required
                      </span>
                    )}
                  </div>

                  {/* Open button */}
                  <Button
                    size="sm" variant="outline" className="w-full text-xs"
                    onClick={() => navigate(`/hazop/studies/${studyId}/lopa/${lopa.id}`)}>
                    <Eye className="h-3 w-3 mr-1" /> Open
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Methodology note */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-xs text-indigo-800 space-y-1">
          <p className="font-semibold">LOPA Engine v1.1 — IEC 61511 Option A (Stored Immutable Snapshots)</p>
          <p>Only IPLs with <code>is_independent=true</code> and <code>credit_applied=true</code> are credited. CCF derating: per common-cause group, only the most conservative (lowest PFD) member is credited.</p>
          <p>MEF = IEF × ∏PFD<sub>i</sub>. Gap ratio = MEF / RTTF. Required SIL = ⌈−log₁₀(RTTF/MEF)⌉. Warnings generated for &gt;3 credited IPLs or MEF &lt; 1×10⁻¹².</p>
        </div>
      </div>
    </Layout>
  );
}
