import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { fmtDateTime } from "@/lib/date-format";
import {
  ArrowLeft, FileText, Loader2, Save, Lock, Download,
  AlertTriangle, CheckCircle2, ShieldCheck, Info, GitBranch,
  Zap, BarChart3, Activity, Star, BadgeCheck, Award,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSci(v: string | number | null): string {
  if (v == null || v === '') return '—';
  const n = parseFloat(String(v));
  if (isNaN(n)) return '—';
  return n.toExponential(3);
}

const SIL_CLS: Record<number, string> = {
  1: 'bg-green-100 text-green-800 border-green-200',
  2: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  3: 'bg-red-100 text-red-700 border-red-200',
  4: 'bg-red-200 text-red-900 border-red-400 font-bold',
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

function FieldRow({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ── Traceability Strip ────────────────────────────────────────────────────────

function TraceabilityStrip({ trace }: { trace: any }) {
  if (!trace) return null;

  const nodes = [
    trace.scenario && {
      icon: <Zap className="h-3.5 w-3.5 text-amber-500" />,
      label: 'Scenario',
      value: trace.scenario.number,
      sub:   trace.scenario.title,
      tip:   trace.scenario.source === 'ipl_stack' ? 'via IPL stack' : 'via linked LOPA',
      cls:   'border-amber-200 bg-amber-50',
    },
    trace.event_group && {
      icon: <Activity className="h-3.5 w-3.5 text-purple-500" />,
      label: 'Event Group',
      value: `EG-${trace.event_group.number}`,
      sub:   trace.event_group.name,
      cls:   'border-purple-200 bg-purple-50',
    },
    {
      icon: <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />,
      label: 'SIF',
      value: trace.sif.number,
      sub:   trace.sif.description ?? trace.sif.protection_layer,
      badge: trace.sif.sil_target ? `SIL ${trace.sif.sil_target}` : undefined,
      cls:   'border-indigo-200 bg-indigo-50',
    },
    trace.lopa && {
      icon: <BarChart3 className="h-3.5 w-3.5 text-blue-500" />,
      label: 'LOPA',
      value: trace.lopa.number,
      sub:   trace.lopa.outcome?.replace(/_/g, ' '),
      badge: trace.lopa.required_sil ? `SIL ${trace.lopa.required_sil}` : undefined,
      cls:   'border-blue-200 bg-blue-50',
    },
    trace.interlock && {
      icon: <GitBranch className="h-3.5 w-3.5 text-rose-500" />,
      label: 'Interlock',
      value: trace.interlock.number,
      sub:   trace.interlock.type ?? trace.interlock.description,
      badge: trace.interlock.sil ? `SIL ${trace.interlock.sil}` : undefined,
      cls:   'border-rose-200 bg-rose-50',
    },
  ].filter(Boolean);

  if (nodes.length === 0) return null;

  return (
    <div className="bg-white border rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <GitBranch className="h-3.5 w-3.5" />
        Lifecycle Traceability Chain
      </div>
      <div className="flex flex-wrap items-stretch gap-0">
        {nodes.map((node: any, i: number) => (
          <div key={node.label} className="flex items-stretch">
            <div className={`border rounded-lg px-3 py-2 min-w-[120px] space-y-0.5 ${node.cls}`}>
              <div className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 uppercase">
                {node.icon} {node.label}
              </div>
              <div className="font-bold text-gray-900 text-xs">{node.value}</div>
              {node.sub && (
                <div className="text-[10px] text-gray-500 line-clamp-1">{node.sub}</div>
              )}
              {node.badge && (
                <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-white border border-gray-300 text-gray-700">
                  {node.badge}
                </span>
              )}
              {node.tip && (
                <div className="text-[9px] text-gray-400 italic">{node.tip}</div>
              )}
            </div>
            {i < nodes.length - 1 && (
              <div className="flex items-center px-1 text-gray-300 text-xs font-bold select-none">→</div>
            )}
          </div>
        ))}
      </div>
      {trace.response_group && (
        <div className="text-[10px] text-gray-400 pt-0.5">
          Response Group: <span className="font-semibold text-gray-600">RG-{trace.response_group.number} {trace.response_group.name}</span>
          {trace.response_group.layer && <span className="ml-2 text-gray-400">({trace.response_group.layer})</span>}
        </div>
      )}
    </div>
  );
}

// ── LOPA Candidate Suggestion Panel ──────────────────────────────────────────

function LopaCandidatePanel({ candidates, currentLopaId, onSelect, disabled }: {
  candidates: any[];
  currentLopaId: number | null;
  onSelect: (id: number | null) => void;
  disabled: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const suggested = candidates.filter((c: any) => c.is_suggested && !c.is_current);
  const others    = candidates.filter((c: any) => !c.is_suggested && !c.is_current);
  const current   = candidates.find((c: any) => c.is_current);

  if (candidates.length === 0) return null;

  const visibleSuggested = suggested.slice(0, 3);

  return (
    <div className="space-y-2">
      {/* Suggested candidates */}
      {suggested.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-700 uppercase tracking-wide">
            <Star className="h-3 w-3" /> Auto-suggested LOPA candidates
          </div>
          {visibleSuggested.map((c: any) => (
            <button
              key={c.id}
              disabled={disabled}
              onClick={() => onSelect(c.id === currentLopaId ? null : c.id)}
              className={`w-full text-left border rounded-lg px-3 py-2 text-xs transition-colors
                ${c.id === currentLopaId
                  ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                  : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'}
                ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-800">{c.lopa_number}</span>
                <div className="flex items-center gap-1.5">
                  {/* Score dots */}
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= c.match_score ? 'bg-blue-500' : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  {c.required_sil && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">
                      SIL {c.required_sil}
                    </span>
                  )}
                  {c.lopa_outcome && (
                    <span className={`text-[9px] ${OUTCOME_CLS[c.lopa_outcome] ?? 'text-gray-500'}`}>
                      {c.lopa_outcome.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-gray-500 mt-0.5">{c.scenario_number} — {c.scenario_title}</div>
              {c.match_reasons?.length > 0 && (
                <div className="text-[10px] text-blue-600 mt-0.5 flex flex-wrap gap-1">
                  {c.match_reasons.map((r: string) => (
                    <span key={r} className="bg-blue-100 px-1.5 py-0.5 rounded">{r}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
          {suggested.length > 3 && !showAll && (
            <button onClick={() => setShowAll(true)}
              className="text-[10px] text-blue-600 underline hover:text-blue-800">
              + {suggested.length - 3} more suggestions
            </button>
          )}
          {showAll && suggested.slice(3).map((c: any) => (
            <button key={c.id} disabled={disabled}
              onClick={() => onSelect(c.id)}
              className="w-full text-left border rounded-lg px-3 py-2 text-xs border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 cursor-pointer">
              <div className="font-bold text-gray-800">{c.lopa_number} — {c.scenario_number}</div>
            </button>
          ))}
        </div>
      )}

      {/* Manual override dropdown */}
      <div>
        <div className="text-[10px] text-gray-500 mb-1">Or manually select any LOPA:</div>
        <Select
          value={currentLopaId ? String(currentLopaId) : '__none__'}
          onValueChange={(v) => onSelect(v === '__none__' ? null : parseInt(v))}
          disabled={disabled}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Not linked" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Not linked</SelectItem>
            {candidates.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.lopa_number} — {c.scenario_number}
                {c.is_suggested ? ' ★' : ''}
                {c.lopa_outcome ? ` (${c.lopa_outcome.replace(/_/g, ' ')})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* None option */}
      {currentLopaId && (
        <button disabled={disabled} onClick={() => onSelect(null)}
          className="text-[10px] text-gray-400 underline hover:text-red-500">
          Clear LOPA link
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HazopSrsDetailPage() {
  const { id: studyId, srsId } = useParams<{ id: string; srsId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [isDirty, setIsDirty] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mocId, setMocId] = useState<string>('');
  const [showCountersign, setShowCountersign] = useState(false);
  const [csDiscipline, setCsDiscipline] = useState('');
  const [csNotes, setCsNotes] = useState('');

  const { data: srs, isLoading } = useQuery<any>({
    queryKey: ['/api/hazop/srs', srsId],
    queryFn: () => fetch(`/api/hazop/srs/${srsId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const { data: traceData } = useQuery<any>({
    queryKey: ['/api/hazop/srs', srsId, 'traceability'],
    queryFn: () => fetch(`/api/hazop/srs/${srsId}/traceability`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!srsId,
  });

  const { data: candidatesData } = useQuery<any>({
    queryKey: ['/api/hazop/srs', srsId, 'lopa-candidates'],
    queryFn: () => fetch(`/api/hazop/srs/${srsId}/lopa-candidates`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!srsId,
  });

  const candidates: any[] = candidatesData?.candidates ?? [];

  // Local form state
  const [form, setForm] = useState<Record<string, any>>({});
  const [formInit, setFormInit] = useState(false);

  if (srs && !formInit) {
    setForm({
      lopa_id:                    srs.lopa_id ?? null,
      sil_required:               srs.sil_required ?? 2,
      sil_proposed:               srs.sil_proposed ?? '',
      pfd_required:               srs.pfd_required ?? '',
      pfd_target:                 srs.pfd_target ?? '',
      process_demand_description: srs.process_demand_description ?? '',
      safe_state_description:     srs.safe_state_description ?? '',
      process_input_tag:          srs.process_input_tag ?? '',
      final_element_tag:          srs.final_element_tag ?? '',
      final_element_action:       srs.final_element_action ?? '',
      fail_state:                 srs.fail_state ?? '',
      process_safety_time_sec:    srs.process_safety_time_sec ?? '',
      response_time_required_sec: srs.response_time_required_sec ?? '',
      manual_reset_required:      srs.manual_reset_required ?? true,
      proof_test_interval_days:   srs.proof_test_interval_days ?? '',
      proof_test_coverage:        srs.proof_test_coverage ?? '',
      proof_test_procedure_ref:   srs.proof_test_procedure_ref ?? '',
      architecture_type:          srs.architecture_type ?? '',
      hardware_fault_tolerance:   srs.hardware_fault_tolerance ?? 0,
      srs_status:                 srs.srs_status ?? 'draft',
      notes:                      srs.notes ?? '',
    });
    setFormInit(true);
  }

  const f = (k: string) => (v: any) => {
    setForm((p: any) => ({ ...p, [k]: v }));
    setIsDirty(true);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const body: any = { ...form };
      if (body.lopa_id === '' || body.lopa_id === 0) body.lopa_id = null;
      ['sil_required', 'sil_proposed', 'process_safety_time_sec',
       'response_time_required_sec', 'proof_test_interval_days',
       'hardware_fault_tolerance'].forEach(k => {
        if (body[k] !== '' && body[k] != null) body[k] = parseInt(body[k]);
        else if (body[k] === '') body[k] = null;
      });
      ['pfd_required', 'pfd_target', 'proof_test_coverage'].forEach(k => {
        if (body[k] !== '' && body[k] != null) body[k] = parseFloat(body[k]);
        else if (body[k] === '') body[k] = null;
      });
      ['fail_state', 'architecture_type', 'sil_proposed', 'srs_status'].forEach(k => {
        if (body[k] === '') body[k] = null;
      });
      return apiRequest('PATCH', `/api/hazop/srs/${srsId}${mocId ? `?moc_id=${mocId}` : ''}`, body);
    },
    onSuccess: async (res) => {
      const d = await res.json();
      if (d.warnings?.length) {
        toast({ title: 'Saved with warnings', description: d.warnings[0] });
      } else {
        toast({ title: 'SRS saved' });
      }
      setIsDirty(false);
      qc.invalidateQueries({ queryKey: ['/api/hazop/srs', srsId] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/srs', srsId, 'traceability'] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/srs', srsId, 'lopa-candidates'] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'srs'] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'srs-summary'] });
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => null);
      if (body?.moc_required) {
        toast({
          title: 'MOC required',
          description: 'This SRS record is baselined or approved. Raise an approved MOC in the MOC Register, then enter its numeric ID in the MOC field before saving.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Save failed', description: body?.message ?? 'Unknown error', variant: 'destructive' });
      }
    },
  });

  const baselineMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/srs/${srsId}/set-baseline`),
    onSuccess: async (res) => {
      const d = await res.json();
      toast({ title: 'SRS baselined', description: `Frozen at ${d.baseline_revision}` });
      qc.invalidateQueries({ queryKey: ['/api/hazop/srs', srsId] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/srs', srsId, 'traceability'] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'srs'] });
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => null);
      toast({ title: 'Baseline failed', description: body?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const reviewMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/srs/${srsId}/mark-reviewed`),
    onSuccess: () => {
      toast({ title: 'SRS marked as reviewed' });
      qc.invalidateQueries({ queryKey: ['/api/hazop/srs', srsId] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'srs'] });
    },
    onError: () => toast({ title: 'Mark reviewed failed', variant: 'destructive' }),
  });

  const countersignMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/srs/${srsId}/countersign`, {
      approval_discipline: csDiscipline,
      notes: csNotes || undefined,
    }),
    onSuccess: async (res) => {
      const d = await res.json();
      toast({ title: 'Countersigned', description: `Approval recorded for ${d.approval?.baseline_revision}` });
      setShowCountersign(false);
      setCsDiscipline('');
      setCsNotes('');
      qc.invalidateQueries({ queryKey: ['/api/hazop/srs', srsId] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'srs'] });
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => null);
      toast({ title: 'Countersign failed', description: body?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/hazop/srs/${srsId}/export-pdf`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'PDF export failed', description: err.message, variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${srs?.srs_number ?? 'SRS'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'PDF downloaded' });
    } catch {
      toast({ title: 'PDF export failed', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  if (isLoading || !srs) return (
    <Layout>
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    </Layout>
  );

  const isApproved = srs.srs_status === 'approved';
  const hasSilMismatch = srs.sil_mismatch;
  const isCountersigned = !!srs.baseline_approval?.id;
  const canCountersign = ['Superuser', 'General Manager', 'Senior Manager'].includes(user?.role ?? '');

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/srs`)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> SRS Register
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                {srs.srs_number}
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_CLS[srs.srs_status]}`}>
                  {srs.srs_status}
                </span>
                {srs.baseline_revision && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                    {srs.baseline_revision}
                  </span>
                )}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">{srs.sif_number} — {srs.sif_description}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {srs.requires_review && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2.5 py-1 rounded-full font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />⚠ Requires Review
              </span>
            )}
            {srs.requires_review && (
              <Button size="sm" variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => reviewMut.mutate()} disabled={reviewMut.isPending}>
                {reviewMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                Mark Reviewed
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={exporting}>
              {exporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
              Export PDF
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !isDirty || isApproved}>
              {saveMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
              Save
            </Button>
            <Button size="sm"
              onClick={() => baselineMut.mutate()}
              disabled={baselineMut.isPending || isApproved || hasSilMismatch}
              className="bg-blue-600 hover:bg-blue-700 text-white">
              {baselineMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Lock className="h-3 w-3 mr-1" />}
              {isApproved ? `Approved: ${srs.baseline_revision}` : 'Set Baseline / Approve'}
            </Button>
            {isApproved && !isCountersigned && canCountersign && (
              <Button size="sm"
                onClick={() => setShowCountersign(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <BadgeCheck className="h-3 w-3 mr-1" /> Countersign
              </Button>
            )}
            {isCountersigned && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-100 text-emerald-700 border border-emerald-300 px-2.5 py-1 rounded-full font-semibold">
                <BadgeCheck className="h-3.5 w-3.5" /> Countersigned
              </span>
            )}
          </div>
        </div>

        {/* ── Traceability Strip ── */}
        <TraceabilityStrip trace={traceData} />

        {/* Locked banner */}
        {isApproved && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-sm text-emerald-800">
            <Lock className="h-4 w-4 shrink-0" />
            Approved and baselined at <strong className="ml-1">{srs.baseline_revision}</strong>
            <span className="ml-2 text-emerald-600">by {srs.approved_by_name} — locked for editing</span>
          </div>
        )}

        {/* Countersigned approval block */}
        {srs.baseline_approval && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
              <Award className="h-4 w-4 text-emerald-600" />
              Countersigned Baseline Approval
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Revision',      value: srs.baseline_approval.baseline_revision },
                { label: 'Discipline',    value: srs.baseline_approval.approval_discipline },
                { label: 'Countersigner', value: srs.baseline_approval.countersigned_by_name ?? '—' },
                { label: 'Role',          value: srs.baseline_approval.countersigner_role },
              ].map(f => (
                <div key={f.label} className="bg-white rounded-lg border border-emerald-100 px-3 py-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{f.label}</p>
                  <p className="text-xs font-semibold text-gray-800 capitalize">{f.value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 text-[11px] text-emerald-700">
              <span>Signed: <strong>{fmtDateTime(srs.baseline_approval.countersigned_at)}</strong></span>
              <span className="font-mono text-[10px] text-gray-400">
                HMAC: {srs.baseline_approval.approval_token?.slice(0, 16)}…
              </span>
            </div>
            {srs.baseline_approval.notes && (
              <p className="text-xs text-gray-600 italic">Note: {srs.baseline_approval.notes}</p>
            )}
          </div>
        )}

        {/* SIL mismatch warning */}
        {hasSilMismatch && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">SIL Mismatch</p>
              <p className="text-xs mt-0.5">
                SRS requires SIL {srs.sil_required}, but linked LOPA ({srs.lopa_number}) requires SIL {srs.lopa_required_sil}.
                Resolve before approval. Baseline is blocked while mismatch exists.
              </p>
            </div>
          </div>
        )}

        {/* ── Section 1: Identification + LOPA Link ── */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-blue-500" /> 1 — Identification &amp; LOPA Link
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

            {/* LOPA candidate panel — left column */}
            <div className="space-y-2">
              <Label className="text-xs text-gray-600">Linked LOPA</Label>
              {candidates.length > 0 ? (
                <LopaCandidatePanel
                  candidates={candidates}
                  currentLopaId={form.lopa_id ?? null}
                  onSelect={(id) => { f('lopa_id')(id); }}
                  disabled={isApproved}
                />
              ) : (
                <Select
                  value={form.lopa_id ? String(form.lopa_id) : '__none__'}
                  onValueChange={(v) => f('lopa_id')(v === '__none__' ? null : parseInt(v))}
                  disabled={isApproved}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Not linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not linked</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Status + notes — right column */}
            <div className="space-y-4">
              <FieldRow label="Status">
                <Select value={form.srs_status} onValueChange={f('srs_status')} disabled={isApproved}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['draft','in_review','superseded'].map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Notes">
                <Textarea rows={3} value={form.notes} onChange={e => f('notes')(e.target.value)} disabled={isApproved} />
              </FieldRow>
            </div>
          </div>
        </div>

        {/* ── Section 2: SIL Determination ── */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-indigo-500" /> 2 — SIL Determination
          </h2>

          {srs.lopa_number && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2 text-xs text-indigo-800 flex flex-wrap gap-4">
              <span><strong>Linked LOPA:</strong> {srs.lopa_number}</span>
              <span><strong>LOPA Outcome:</strong> {srs.lopa_outcome?.replace(/_/g, ' ') ?? '—'}</span>
              <span><strong>LOPA Required SIL:</strong> {srs.lopa_required_sil ?? '—'}</span>
              <span><strong>Required PFD:</strong> {fmtSci(srs.required_additional_pfd)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <FieldRow label="SIL Required" required>
              <Select value={String(form.sil_required)} onValueChange={v => f('sil_required')(parseInt(v))} disabled={isApproved}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4].map(v => (
                    <SelectItem key={v} value={String(v)}>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${SIL_CLS[v]}`}>SIL {v}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="SIL Proposed">
              <Select value={form.sil_proposed ? String(form.sil_proposed) : '__none__'} onValueChange={v => f('sil_proposed')(v === '__none__' ? null : parseInt(v))} disabled={isApproved}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not set</SelectItem>
                  {[1,2,3,4].map(v => <SelectItem key={v} value={String(v)}>SIL {v}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="PFD Required" required>
              <Input type="number" step="any" min="0" max="1" className="h-8 text-sm font-mono"
                value={form.pfd_required} onChange={e => f('pfd_required')(e.target.value)} disabled={isApproved} />
            </FieldRow>
            <FieldRow label="PFD Target">
              <Input type="number" step="any" min="0" max="1" className="h-8 text-sm font-mono"
                value={form.pfd_target} onChange={e => f('pfd_target')(e.target.value)} disabled={isApproved} />
              {form.pfd_target && form.pfd_required &&
               parseFloat(String(form.pfd_target)) > parseFloat(String(form.pfd_required)) && (
                <p className="text-[10px] text-red-600 mt-0.5">Must be ≤ pfd_required</p>
              )}
            </FieldRow>
          </div>
        </div>

        {/* ── Section 3: Functional Requirements ── */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500" /> 3 — Functional Requirements
          </h2>
          <div className="space-y-3">
            <FieldRow label="Process Demand Description" required>
              <Textarea rows={2} value={form.process_demand_description}
                onChange={e => f('process_demand_description')(e.target.value)} disabled={isApproved} />
            </FieldRow>
            <FieldRow label="Safe State Description" required>
              <Textarea rows={2} value={form.safe_state_description}
                onChange={e => f('safe_state_description')(e.target.value)} disabled={isApproved} />
            </FieldRow>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FieldRow label="Process Input Tag">
                <Input className="h-8 text-sm" value={form.process_input_tag}
                  onChange={e => f('process_input_tag')(e.target.value)} disabled={isApproved} />
              </FieldRow>
              <FieldRow label="Final Element Tag">
                <Input className="h-8 text-sm" value={form.final_element_tag}
                  onChange={e => f('final_element_tag')(e.target.value)} disabled={isApproved} />
              </FieldRow>
              <FieldRow label="Final Element Action">
                <Input className="h-8 text-sm" value={form.final_element_action}
                  onChange={e => f('final_element_action')(e.target.value)} disabled={isApproved} />
              </FieldRow>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FieldRow label="Fail State">
                <Select value={form.fail_state || '__none__'} onValueChange={v => f('fail_state')(v === '__none__' ? null : v)} disabled={isApproved}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not set</SelectItem>
                    {['fail_open','fail_closed','fail_last','deenergize_to_trip','energize_to_trip'].map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Process Safety Time (s)">
                <Input type="number" min="0" className="h-8 text-sm" value={form.process_safety_time_sec}
                  onChange={e => f('process_safety_time_sec')(e.target.value)} disabled={isApproved} />
              </FieldRow>
              <FieldRow label="Response Time Required (s)">
                <Input type="number" min="0" className="h-8 text-sm" value={form.response_time_required_sec}
                  onChange={e => f('response_time_required_sec')(e.target.value)} disabled={isApproved} />
                {form.response_time_required_sec && form.process_safety_time_sec &&
                 parseInt(String(form.response_time_required_sec)) > parseInt(String(form.process_safety_time_sec)) && (
                  <p className="text-[10px] text-red-600 mt-0.5">Must be ≤ process safety time</p>
                )}
              </FieldRow>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="manual_reset" checked={!!form.manual_reset_required}
                onChange={e => f('manual_reset_required')(e.target.checked)} disabled={isApproved}
                className="rounded" />
              <Label htmlFor="manual_reset" className="text-xs cursor-pointer">Manual Reset Required after SIF activation</Label>
            </div>
          </div>
        </div>

        {/* ── Section 4: Proof Test & Architecture ── */}
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-gray-500" /> 4 — Proof Test &amp; Architecture
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FieldRow label="Proof Test Interval (days)">
              <Input type="number" min="0" className="h-8 text-sm" value={form.proof_test_interval_days}
                onChange={e => f('proof_test_interval_days')(e.target.value)} disabled={isApproved} />
            </FieldRow>
            <FieldRow label="Diagnostic Coverage (%)">
              <Input type="number" min="0" max="100" step="0.1" className="h-8 text-sm" value={form.proof_test_coverage}
                onChange={e => f('proof_test_coverage')(e.target.value)} disabled={isApproved} />
            </FieldRow>
            <FieldRow label="Procedure Reference">
              <Input className="h-8 text-sm" placeholder="e.g. TEST-SIS-001-Rev3" value={form.proof_test_procedure_ref}
                onChange={e => f('proof_test_procedure_ref')(e.target.value)} disabled={isApproved} />
            </FieldRow>
            <FieldRow label="Architecture Type">
              <Select value={form.architecture_type || '__none__'} onValueChange={v => f('architecture_type')(v === '__none__' ? null : v)} disabled={isApproved}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Not set" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not set</SelectItem>
                  {['1oo1','1oo2','2oo3','2oo2','1oo1D'].map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Hardware Fault Tolerance (HFT)">
              <Select value={String(form.hardware_fault_tolerance ?? 0)} onValueChange={v => f('hardware_fault_tolerance')(parseInt(v))} disabled={isApproved}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0,1,2].map(v => <SelectItem key={v} value={String(v)}>HFT = {v}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
        </div>

        {/* Constraint note */}
        <div className="bg-gray-50 border rounded-lg p-3 text-[11px] text-gray-500 flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
          <span>
            <strong>Constraints enforced:</strong> pfd_target ≤ pfd_required · response_time ≤ process_safety_time · self-approval blocked · approved SRS is locked.
            Baseline button is disabled while a SIL mismatch with the linked LOPA exists.
          </span>
        </div>

      </div>

      {/* Countersign Dialog */}
      <Dialog open={showCountersign} onOpenChange={setShowCountersign}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-emerald-600" />
              Countersign Baseline Approval
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">SRS: {srs.srs_number}</p>
              <p>Baseline: <strong>{srs.baseline_revision}</strong></p>
              <p>Approved by: {srs.approved_by_name ?? 'Unknown'}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Approval Discipline <span className="text-red-500">*</span></Label>
              <Select value={csDiscipline} onValueChange={setCsDiscipline}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select discipline…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="process">Process</SelectItem>
                  <SelectItem value="instrumentation">Instrumentation</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={csNotes}
                onChange={e => setCsNotes(e.target.value)}
                placeholder="Any remarks for the approval record…"
                rows={3}
                className="text-sm"
              />
            </div>
            <p className="text-[11px] text-gray-500">
              Your name, role, and a cryptographic HMAC will be recorded with this approval. Self-countersigning is not permitted.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCountersign(false)}>Cancel</Button>
            <Button
              onClick={() => countersignMut.mutate()}
              disabled={countersignMut.isPending || !csDiscipline}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {countersignMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <BadgeCheck className="h-3 w-3 mr-1" />}
              Confirm Countersign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
