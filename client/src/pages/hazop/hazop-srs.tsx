import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  FileText, ArrowLeft, Play, Loader2, Eye, Download,
  AlertTriangle, CheckCircle2, ShieldCheck, Info, XCircle, BadgeCheck,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSci(v: string | number | null): string {
  if (v == null || v === '') return '—';
  const n = parseFloat(String(v));
  if (isNaN(n)) return '—';
  return n.toExponential(3);
}

const SIL_CLS: Record<number, string> = {
  1: 'bg-green-100 text-green-800',
  2: 'bg-yellow-100 text-yellow-800',
  3: 'bg-red-100 text-red-700',
  4: 'bg-red-200 text-red-900 font-bold',
};

const STATUS_CLS: Record<string, string> = {
  draft:      'bg-gray-100 text-gray-600',
  in_review:  'bg-blue-100 text-blue-700',
  approved:   'bg-emerald-100 text-emerald-700',
  superseded: 'bg-amber-100 text-amber-700',
};

const OUTCOME_CLS: Record<string, string> = {
  tolerable:            'text-green-700',
  gap_exists:           'text-orange-600',
  requires_sif:         'text-red-600',
  requires_sif_upgrade: 'text-red-800 font-bold',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HazopSrsPage() {
  const { id: studyId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [exportingId, setExportingId] = useState<number | null>(null);

  const { data: records = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/hazop/studies', studyId, 'srs'],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/srs`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: summary } = useQuery<any>({
    queryKey: ['/api/hazop/studies', studyId, 'srs-summary'],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/srs-summary`, { credentials: 'include' }).then(r => r.json()),
  });

  const extractMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/studies/${studyId}/srs/extract`),
    onSuccess: async (res) => {
      const d = await res.json();
      toast({ title: 'SRS records extracted', description: d.message });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'srs'] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'srs-summary'] });
    },
    onError: () => toast({ title: 'Extraction failed', variant: 'destructive' }),
  });

  const handleExportPdf = async (id: number, srsNum: string) => {
    setExportingId(id);
    try {
      const res = await fetch(`/api/hazop/srs/${id}/export-pdf`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'PDF export failed', description: err.message ?? res.statusText, variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${srsNum}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'PDF export failed', variant: 'destructive' });
    } finally {
      setExportingId(null);
    }
  };

  const unextractedCount = (summary?.sif_count ?? 0) - (summary?.srs_count ?? 0);

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
                <FileText className="h-6 w-6 text-blue-600" />
                SRS Register — Safety Requirements Specifications
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">Study {studyId} · Phase 5B · IEC 61511</p>
            </div>
          </div>
          <Button
            onClick={() => extractMut.mutate()}
            disabled={extractMut.isPending || unextractedCount === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {extractMut.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Play className="h-4 w-4 mr-2" />}
            Extract from SIFs{unextractedCount > 0 ? ` (${unextractedCount})` : ''}
          </Button>
        </div>

        {/* Summary KPIs */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'SRS Coverage', value: `${summary.srs_coverage_pct}%`, icon: <FileText className="h-4 w-4 text-blue-500" />, bold: true },
              { label: 'Approved',     value: summary.srs_approved_count,     icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> },
              { label: 'SIL Mismatch', value: summary.sil_mismatch_count,     icon: <AlertTriangle className="h-4 w-4 text-amber-500" /> },
              { label: 'SIFs Total',   value: summary.sif_count,              icon: <ShieldCheck className="h-4 w-4 text-indigo-500" /> },
            ].map(k => (
              <div key={k.label} className="bg-white border rounded-lg p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-gray-500">
                  {k.icon}
                  <span className="text-[11px] uppercase tracking-wide">{k.label}</span>
                </div>
                <span className={`text-xl font-bold text-gray-900 ${k.bold ? 'text-blue-700' : ''}`}>{k.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Records */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No SRS records yet</p>
            <p className="text-sm mt-1">Click "Extract from SIFs" to auto-generate SRS records for all Safety Instrumented Functions</p>
          </div>
        ) : (
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['SRS No.', 'SIF', 'SIL Req.', 'PFD Required', 'LOPA Link', 'Status', 'Baseline', 'Countersigned', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((rec: any) => (
                  <tr key={rec.id} className={`hover:bg-gray-50 ${rec.sil_mismatch ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-3 font-bold text-blue-700">{rec.srs_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800">{rec.sif_number}</div>
                      <div className="text-xs text-gray-500 line-clamp-1 mt-0.5">{rec.sif_description}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SIL_CLS[rec.sil_required] ?? 'bg-gray-100 text-gray-600'}`}>
                        SIL {rec.sil_required}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{fmtSci(rec.pfd_required)}</td>
                    <td className="px-4 py-3">
                      {rec.lopa_number ? (
                        <div>
                          <span className="text-xs font-semibold text-indigo-700">{rec.lopa_number}</span>
                          {rec.lopa_outcome && (
                            <span className={`ml-2 text-[10px] ${OUTCOME_CLS[rec.lopa_outcome] ?? 'text-gray-500'}`}>
                              {rec.lopa_outcome.replace(/_/g, ' ')}
                            </span>
                          )}
                          {rec.sil_mismatch && (
                            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> SIL mismatch vs LOPA (SIL {rec.lopa_required_sil})
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Not linked</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_CLS[rec.srs_status]}`}>
                        {rec.srs_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {rec.baseline_revision
                        ? <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{rec.baseline_revision}</span>
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {rec.is_countersigned
                        ? <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1 w-fit"><BadgeCheck className="h-3 w-3" /> Signed</span>
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                          onClick={() => navigate(`/hazop/studies/${studyId}/srs/${rec.id}`)}>
                          <Eye className="h-3 w-3 mr-1" /> Open
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          title="Export PDF"
                          disabled={exportingId === rec.id}
                          onClick={() => handleExportPdf(rec.id, rec.srs_number)}>
                          {exportingId === rec.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Download className="h-3 w-3" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Methodology note */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs text-blue-800 space-y-1">
          <p className="font-semibold">SRS — IEC 61511 Part 1 §12 Functional Safety Requirements</p>
          <p>Each SRS covers one Safety Instrumented Function. SIL and PFD are sourced from the linked LOPA record. <code>pfd_target ≤ pfd_required</code> is enforced. Self-approval is blocked. Approved SRS records are locked.</p>
        </div>

      </div>
    </Layout>
  );
}
