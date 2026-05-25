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
import {
  ArrowLeft, BarChart3, Loader2, RefreshCw, Lock, Plus,
  Trash2, Edit2, ShieldCheck, AlertTriangle, CheckCircle2,
  XCircle, FlaskConical, TrendingDown, Info, ShieldX,
} from "lucide-react";

// ── Vocabulary ────────────────────────────────────────────────────────────────

const PROTECTION_LAYERS = ['BPCS', 'SIS', 'Mechanical', 'Procedural', 'Operator', 'Relief'] as const;
const IPL_TYPES        = ['response_group', 'safety_function', 'interlock', 'manual'] as const;
const EFFECTIVENESS    = ['low', 'medium', 'high', 'verified'] as const;

const SEVERITY_CLS: Record<string, string> = {
  minor:        'bg-green-100 text-green-700',
  serious:      'bg-yellow-100 text-yellow-700',
  major:        'bg-orange-100 text-orange-700',
  critical:     'bg-red-100 text-red-700',
  catastrophic: 'bg-red-200 text-red-900 font-bold',
};

const OUTCOME_META: Record<string, { label: string; cls: string }> = {
  tolerable:            { label: 'Tolerable',        cls: 'text-green-700 bg-green-100' },
  gap_exists:           { label: 'Gap Exists',       cls: 'text-orange-700 bg-orange-100' },
  requires_sif:         { label: 'SIF Required',     cls: 'text-red-700 bg-red-100' },
  requires_sif_upgrade: { label: 'SIF Upgrade Req.', cls: 'text-red-900 bg-red-200' },
};

const LAYER_COLOR: Record<string, string> = {
  SIS:        'border-l-blue-500 bg-blue-50',
  BPCS:       'border-l-yellow-400 bg-yellow-50',
  Mechanical: 'border-l-green-500 bg-green-50',
  Relief:     'border-l-green-600 bg-green-50',
  Procedural: 'border-l-orange-400 bg-orange-50',
  Operator:   'border-l-red-400 bg-red-50',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSci(v: string | number | null): string {
  if (v == null || v === '') return '—';
  const n = parseFloat(String(v));
  if (isNaN(n)) return '—';
  if (n === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const coeff = (n / Math.pow(10, exp)).toFixed(3);
  return `${coeff} × 10^${exp}`;
}

function fmtPfd(v: string | number | null): string {
  if (v == null || v === '') return '—';
  const n = parseFloat(String(v));
  if (isNaN(n)) return '—';
  return n.toFixed(6);
}

// ── Creditable Status Badge ───────────────────────────────────────────────────

function CreditStatusBadge({ item }: { item: any }) {
  if (!item.credit_applied) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Not requested</span>;
  }
  if (item.creditable === true) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold border border-green-200">✓ Credited</span>;
  }
  if (item.creditable === false) {
    // Determine why excluded
    if (!item.is_independent) {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-semibold border border-red-200 flex items-center gap-1">
          <ShieldX className="h-3 w-3" />Not Independent
        </span>
      );
    }
    if (item.ccf_group) {
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-200">CCF Derated</span>;
    }
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-semibold border border-orange-200">Excluded</span>;
  }
  // creditable = null → not yet calculated
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Requested (recalc needed)</span>;
}

// ── Edit LOPA Metadata Dialog ─────────────────────────────────────────────────

function EditLopaDialog({ lopa, studyId, onClose }: { lopa: any; studyId: string; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    ie_frequency_per_year: lopa.ie_frequency_per_year ?? '',
    ie_frequency_basis:    lopa.ie_frequency_basis ?? '',
    rttf_per_year:         lopa.rttf_per_year ?? '',
    rttf_basis:            lopa.rttf_basis ?? '',
    consequence_category:  lopa.consequence_category ?? 'major',
    lopa_status:           lopa.lopa_status ?? 'draft',
    notes:                 lopa.notes ?? '',
  });

  const [mocId, setMocId] = useState<string>('');

  const mut = useMutation({
    mutationFn: () => apiRequest('PATCH', `/api/hazop/lopa/${lopa.id}${mocId ? `?moc_id=${mocId}` : ''}`, form),
    onSuccess: () => {
      toast({ title: 'LOPA updated' });
      qc.invalidateQueries({ queryKey: ['/api/hazop/lopa', String(lopa.id)] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'lopa'] });
      onClose();
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => null);
      if (body?.moc_required) {
        toast({
          title: 'MOC required',
          description: 'This LOPA record is baselined. Raise an approved MOC in the MOC Register and enter its ID below.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Update failed', description: body?.message ?? 'Unknown error', variant: 'destructive' });
      }
    },
  });

  const f = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit LOPA Parameters — {lopa.lopa_number}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">IEF (per year)</Label>
              <Input type="number" step="any" value={form.ie_frequency_per_year} onChange={e => f('ie_frequency_per_year')(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">RTTF (per year)</Label>
              <Input type="number" step="any" value={form.rttf_per_year} onChange={e => f('rttf_per_year')(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">IEF Basis</Label>
            <Input value={form.ie_frequency_basis} onChange={e => f('ie_frequency_basis')(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">RTTF Basis</Label>
            <Input value={form.rttf_basis} onChange={e => f('rttf_basis')(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Consequence Category</Label>
              <Select value={form.consequence_category} onValueChange={f('consequence_category')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['minor','serious','major','critical','catastrophic'].map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={form.lopa_status} onValueChange={f('lopa_status')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['draft','in_review','approved'].map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={e => f('notes')(e.target.value)} />
          </div>
          {lopa.baseline_revision && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-800 font-medium">⚠ This LOPA is baselined ({lopa.baseline_revision}). An approved MOC is required to save changes.</p>
              <div className="space-y-1">
                <Label className="text-xs text-amber-700">Approved MOC ID</Label>
                <Input
                  type="number"
                  placeholder="Enter numeric MOC ID…"
                  value={mocId}
                  onChange={e => setMocId(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add IPL Dialog ─────────────────────────────────────────────────────────────

function AddIplDialog({ studyId, scenarioId, onClose, lopaId }: { studyId: string; scenarioId: number; onClose: () => void; lopaId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    ipl_type:           'manual',
    ipl_label:          '',
    protection_layer:   'BPCS',
    effectiveness_rating: 'medium',
    is_independent:     true,
    ccf_group:          '',
    pfd_value:          '',
    pfd_source:         'user_entered',
    pfd_basis:          '',
    credit_applied:     true,
    notes:              '',
  });

  const mut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/ipl-stack/items`, {
      study_id: parseInt(studyId),
      scenario_id: scenarioId,
      ...form,
      pfd_value:     form.pfd_value ? parseFloat(form.pfd_value) : undefined,
      ccf_group:     form.ccf_group || null,
      is_independent: form.is_independent,
      credit_applied: form.credit_applied,
    }),
    onSuccess: () => {
      toast({ title: 'IPL added' });
      qc.invalidateQueries({ queryKey: ['/api/hazop/lopa', lopaId] });
      onClose();
    },
    onError: () => toast({ title: 'Failed to add IPL', variant: 'destructive' }),
  });

  const f = (k: string) => (v: any) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Manual IPL to Stack</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">IPL Label *</Label>
            <Input value={form.ipl_label} onChange={e => f('ipl_label')(e.target.value)}
              placeholder="e.g. Manual operator action — close XV-101" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">IPL Type</Label>
              <Select value={form.ipl_type} onValueChange={f('ipl_type')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IPL_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Protection Layer</Label>
              <Select value={form.protection_layer} onValueChange={f('protection_layer')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROTECTION_LAYERS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Effectiveness</Label>
              <Select value={form.effectiveness_rating} onValueChange={f('effectiveness_rating')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EFFECTIVENESS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">PFD Value (blank = auto)</Label>
              <Input type="number" step="any" min="0" max="1" value={form.pfd_value}
                onChange={e => f('pfd_value')(e.target.value)} placeholder="0.01" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CCF Group (blank = no CCF link)</Label>
            <Input value={form.ccf_group} onChange={e => f('ccf_group')(e.target.value)}
              placeholder="e.g. SIS-POWER-SUPPLY-A" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">PFD Basis / Justification</Label>
            <Input value={form.pfd_basis} onChange={e => f('pfd_basis')(e.target.value)}
              placeholder="e.g. IEC 61508 SIL 2 certified, TÜV ref." />
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_indep" checked={form.is_independent}
                onChange={e => f('is_independent')(e.target.checked)} className="rounded" />
              <Label htmlFor="is_indep" className="text-xs cursor-pointer">Is Independent (IPL)</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="credit_applied" checked={form.credit_applied}
                onChange={e => f('credit_applied')(e.target.checked)} className="rounded" />
              <Label htmlFor="credit_applied" className="text-xs cursor-pointer">Request Credit</Label>
            </div>
          </div>
          {form.credit_applied && !form.is_independent && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2 text-[10px] text-red-700">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              Credit requested but Independence not set — engine v1.1 will exclude this IPL from the PFD product.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.ipl_label}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Add IPL
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── IPL Row ───────────────────────────────────────────────────────────────────

function IplRow({ item, studyId, scenarioId, lopaId }: { item: any; studyId: string; scenarioId: number; lopaId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [pfdVal, setPfdVal] = useState(item.pfd_value ?? '');
  const [credited, setCredited] = useState(item.credit_applied);
  const [independent, setIndependent] = useState(item.is_independent);

  const patchMut = useMutation({
    mutationFn: (body: any) => apiRequest('PATCH', `/api/hazop/ipl-stack/items/${item.id}`, body),
    onSuccess: () => {
      toast({ title: 'IPL updated — run Recalculate to refresh arithmetic' });
      qc.invalidateQueries({ queryKey: ['/api/hazop/lopa', lopaId] });
      setEditing(false);
    },
    onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/hazop/ipl-stack/items/${item.id}`),
    onSuccess: () => {
      toast({ title: 'IPL removed' });
      qc.invalidateQueries({ queryKey: ['/api/hazop/lopa', lopaId] });
    },
    onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
  });

  const colCls = LAYER_COLOR[item.protection_layer] ?? 'border-l-gray-300 bg-gray-50';

  // Compute opacity: if credit requested but excluded → dim
  const dimmed = item.credit_applied && item.creditable === false;

  return (
    <div className={`border-l-4 rounded-r-lg p-3 ${colCls} ${dimmed ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-gray-500">#{item.stack_position}</span>
            <span className="text-xs font-semibold text-gray-800 truncate">{item.ipl_label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border text-gray-600">{item.protection_layer}</span>
            {item.is_independent && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">IPL</span>
            )}
            {item.ccf_group && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                CCF: {item.ccf_group}
              </span>
            )}
            <CreditStatusBadge item={item} />
          </div>

          {editing ? (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Label className="text-[10px] whitespace-nowrap">PFD:</Label>
                <Input className="h-6 text-xs w-28 font-mono" type="number" step="any" min="0" max="1"
                  value={pfdVal} onChange={e => setPfdVal(e.target.value)} />
              </div>
              <div className="flex items-center gap-1">
                <input type="checkbox" id={`ind-${item.id}`} checked={independent}
                  onChange={e => setIndependent(e.target.checked)} className="rounded" />
                <Label htmlFor={`ind-${item.id}`} className="text-[10px] cursor-pointer">Independent</Label>
              </div>
              <div className="flex items-center gap-1">
                <input type="checkbox" id={`cr-${item.id}`} checked={credited}
                  onChange={e => setCredited(e.target.checked)} className="rounded" />
                <Label htmlFor={`cr-${item.id}`} className="text-[10px] cursor-pointer">Request Credit</Label>
              </div>
              <Button size="sm" className="h-6 text-xs px-2"
                onClick={() => patchMut.mutate({
                  pfd_value: parseFloat(pfdVal), credit_applied: credited,
                  is_independent: independent, pfd_source: 'user_entered',
                })}
                disabled={patchMut.isPending}>
                {patchMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditing(false)}>✕</Button>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
              <span>PFD: <span className="font-mono font-semibold text-gray-700">{fmtPfd(item.pfd_value)}</span></span>
              <span className="px-1.5 py-0.5 rounded bg-white border">{item.pfd_source ?? 'default'}</span>
              {item.effectiveness_rating && <span>Eff: {item.effectiveness_rating}</span>}
              {!item.is_independent && (
                <span className="text-red-600 font-semibold">Not independent</span>
              )}
            </div>
          )}
        </div>

        {!editing && (
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}>
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
              onClick={() => { if (confirm('Remove this IPL?')) deleteMut.mutate(); }}
              disabled={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HazopLopaDetailPage() {
  const { id: studyId, lopaId } = useParams<{ id: string; lopaId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showEditLopa, setShowEditLopa] = useState(false);
  const [showAddIpl, setShowAddIpl] = useState(false);

  const { data: lopa, isLoading } = useQuery<any>({
    queryKey: ['/api/hazop/lopa', lopaId],
    queryFn: () => fetch(`/api/hazop/lopa/${lopaId}`, { credentials: 'include' }).then(r => r.json()),
  });

  const buildMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/studies/${studyId}/ipl-stack/${lopa?.scenario_id}/build`),
    onSuccess: async (res) => {
      const d = await res.json();
      toast({ title: 'IPL stack built', description: d.message });
      qc.invalidateQueries({ queryKey: ['/api/hazop/lopa', lopaId] });
    },
    onError: () => toast({ title: 'Build failed', variant: 'destructive' }),
  });

  const recalcMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/lopa/${lopaId}/recalculate`),
    onSuccess: async (res) => {
      const d = await res.json();
      const warnCount = (d.warnings ?? []).length;
      toast({
        title: 'Recalculated (v1.1)',
        description: `${d.credited_ipl_count} credited · ${d.excluded_ipl_count ?? 0} excl · ${d.ccf_derated_count ?? 0} CCF derated · Outcome: ${d.lopa_outcome}${warnCount > 0 ? ` · ${warnCount} warning(s)` : ''}`,
      });
      qc.invalidateQueries({ queryKey: ['/api/hazop/lopa', lopaId] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'lopa'] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'phase5a-summary'] });
    },
    onError: () => toast({ title: 'Recalculation failed', variant: 'destructive' }),
  });

  const baselineMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/lopa/${lopaId}/set-baseline`),
    onSuccess: async (res) => {
      const d = await res.json();
      toast({ title: 'Baseline set', description: `LOPA frozen at ${d.baseline_revision}` });
      qc.invalidateQueries({ queryKey: ['/api/hazop/lopa', lopaId] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'lopa'] });
    },
    onError: () => toast({ title: 'Baseline failed', variant: 'destructive' }),
  });

  const reviewMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/lopa/${lopaId}/mark-reviewed`),
    onSuccess: () => {
      toast({ title: 'LOPA marked as reviewed' });
      qc.invalidateQueries({ queryKey: ['/api/hazop/lopa', lopaId] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'lopa'] });
    },
    onError: () => toast({ title: 'Mark reviewed failed', variant: 'destructive' }),
  });

  if (isLoading) return (
    <Layout><div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-indigo-400" /></div></Layout>
  );
  if (!lopa) return (
    <Layout><div className="p-6 text-gray-500">LOPA record not found.</div></Layout>
  );

  const outcomeM = lopa.lopa_outcome ? OUTCOME_META[lopa.lopa_outcome] : null;
  const stack: any[] = lopa.ipl_stack ?? [];
  const creditedItems = stack.filter((i: any) => i.creditable === true);
  const warnings: string[] = lopa.warnings ?? [];
  const hasWarnings = warnings.length > 0;
  const isBaselined = !!lopa.baseline_revision;

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/lopa`)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> LOPA List
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-600" />
                {lopa.lopa_number}
                {lopa.arithmetic_version && (
                  <span className="text-xs font-normal text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full font-mono">
                    engine v{lopa.arithmetic_version}
                  </span>
                )}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">{lopa.scenario_number} — {lopa.scenario_title}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {lopa.requires_review && (
              <span className="inline-flex items-center gap-1.5 text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2.5 py-1 rounded-full font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />⚠ Requires Review
              </span>
            )}
            {lopa.requires_review && (
              <Button size="sm" variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => reviewMut.mutate()} disabled={reviewMut.isPending}>
                {reviewMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                Mark Reviewed
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowEditLopa(true)} disabled={isBaselined}>
              <Edit2 className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => recalcMut.mutate()} disabled={recalcMut.isPending}>
              {recalcMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Recalculate
            </Button>
            <Button size="sm"
              onClick={() => baselineMut.mutate()}
              disabled={baselineMut.isPending || isBaselined || !lopa.lopa_outcome || hasWarnings}
              className="bg-blue-600 hover:bg-blue-700 text-white">
              {baselineMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Lock className="h-3 w-3 mr-1" />}
              {isBaselined ? `Baselined: ${lopa.baseline_revision}` : 'Set Baseline'}
            </Button>
          </div>
        </div>

        {/* Baseline lock notice */}
        {isBaselined && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800">
            <Lock className="h-4 w-4 text-blue-600 shrink-0" />
            Baselined at <strong>{lopa.baseline_revision}</strong> — locked for editing. Raise a MOC to make changes.
          </div>
        )}

        {/* Warnings panel */}
        {hasWarnings && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-amber-800 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {warnings.length} Engine Warning{warnings.length > 1 ? 's' : ''}
            </p>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-800 flex items-start gap-2">
                <span className="font-bold shrink-0">{i + 1}.</span>{w}
              </p>
            ))}
            <p className="text-[10px] text-amber-600 italic">Baseline is blocked while warnings are present. Resolve before approval.</p>
          </div>
        )}

        {/* Parameters + Results */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Parameters */}
          <div className="bg-white border rounded-xl p-4 space-y-4">
            <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-indigo-500" /> LOPA Parameters
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Consequence Category', value: lopa.consequence_category, cls: SEVERITY_CLS[lopa.consequence_category] },
                { label: 'Scenario Severity',    value: lopa.consequence_severity, cls: SEVERITY_CLS[lopa.consequence_severity] },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{f.label}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${f.cls ?? 'bg-gray-100 text-gray-700'}`}>{f.value ?? '—'}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'IEF (per year)',  value: lopa.ie_frequency_per_year, basis: lopa.ie_frequency_basis },
                { label: 'RTTF (per year)', value: lopa.rttf_per_year,         basis: lopa.rttf_basis },
              ].map(f => (
                <div key={f.label} className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{f.label}</p>
                  <p className="font-mono font-bold text-gray-800 text-sm">{fmtSci(f.value)}</p>
                  {f.basis && <p className="text-[10px] text-gray-400 italic mt-0.5">{f.basis}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Result */}
          <div className="bg-white border rounded-xl p-4 space-y-4">
            <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-indigo-500" /> Calculation Result
            </h2>
            {!lopa.lopa_outcome ? (
              <div className="flex flex-col items-center justify-center h-28 text-gray-400 gap-2">
                <RefreshCw className="h-8 w-8 opacity-30" />
                <p className="text-sm">Not calculated yet</p>
                <Button size="sm" variant="outline" onClick={() => recalcMut.mutate()} disabled={recalcMut.isPending}>
                  {recalcMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Recalculate now
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Audit strip */}
                {lopa.credited_ipl_count != null && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'Credited', value: lopa.credited_ipl_count,  cls: 'bg-green-50 text-green-800 border-green-200' },
                      { label: 'Excluded', value: lopa.excluded_ipl_count ?? 0, cls: 'bg-red-50 text-red-800 border-red-200' },
                      { label: 'CCF Derated', value: lopa.ccf_derated_count ?? 0, cls: 'bg-amber-50 text-amber-800 border-amber-200' },
                    ].map(a => (
                      <div key={a.label} className={`border rounded-lg px-2 py-1.5 ${a.cls}`}>
                        <p className="text-[10px] uppercase tracking-wide">{a.label}</p>
                        <p className="font-bold text-lg leading-none mt-0.5">{a.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'PFD Product (∏)',        value: fmtSci(lopa.pfd_product) },
                    { label: 'Achieved MEF',            value: fmtSci(lopa.achieved_mef_per_year) },
                    { label: 'Risk Gap (MEF/RTTF)',     value: lopa.risk_gap_ratio ? `×${parseFloat(lopa.risk_gap_ratio).toFixed(4)}` : '—' },
                    { label: 'Engine Version',          value: lopa.arithmetic_version ? `v${lopa.arithmetic_version}` : '—' },
                  ].map(f => (
                    <div key={f.label} className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{f.label}</p>
                      <p className="font-mono font-bold text-gray-800 text-sm">{f.value}</p>
                    </div>
                  ))}
                </div>

                {/* Risk gauge */}
                {lopa.risk_gap_ratio && (() => {
                  const r = parseFloat(lopa.risk_gap_ratio);
                  const pct = Math.min(100, r * 50);
                  const color = r <= 1 ? 'bg-green-400' : r <= 2 ? 'bg-orange-400' : 'bg-red-500';
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.max(4, pct)}%` }} />
                        </div>
                        <span className="text-xs font-mono font-bold">×{r.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400">
                        <span>0 (target)</span><span>Tolerable limit →</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Outcome + SIL */}
                <div className="flex items-center gap-3 flex-wrap">
                  {outcomeM && (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${outcomeM.cls}`}>{outcomeM.label}</span>
                  )}
                  {lopa.required_sil && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
                      SIL {lopa.required_sil} Required
                    </span>
                  )}
                  {lopa.required_additional_pfd && (
                    <span className="text-xs text-gray-500 font-mono">
                      Req. add. PFD: {fmtSci(lopa.required_additional_pfd)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* IPL Stack */}
        <div className="bg-white border rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-500" />
                IPL Stack — {stack.length} layer{stack.length !== 1 ? 's' : ''}
              </h2>
              {lopa.credited_ipl_count != null && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {lopa.credited_ipl_count} credited · {lopa.excluded_ipl_count ?? 0} excluded (not independent) · {lopa.ccf_derated_count ?? 0} CCF derated
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => buildMut.mutate()} disabled={buildMut.isPending || isBaselined}>
                {buildMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Auto-Build
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddIpl(true)} disabled={isBaselined}>
                <Plus className="h-3 w-3 mr-1" /> Add Manual IPL
              </Button>
            </div>
          </div>

          {stack.length === 0 ? (
            <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-lg">
              <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No IPLs in stack</p>
              <p className="text-xs mt-1">Click "Auto-Build" to populate from IPL-flagged response groups and SIFs</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stack.map((item: any) => (
                <IplRow key={item.id} item={item} studyId={studyId} scenarioId={lopa.scenario_id} lopaId={lopaId} />
              ))}
            </div>
          )}

          {/* PFD chain — credited items only */}
          {creditedItems.length > 0 && (
            <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-800 space-y-1">
              <p className="font-semibold">PFD Chain — credited layers only ({creditedItems.length} of {stack.length})</p>
              <p className="font-mono text-[11px] flex flex-wrap items-center gap-1">
                {creditedItems.map((item: any, i: number) => (
                  <span key={item.id}>
                    <span className="bg-white border border-indigo-200 px-1.5 py-0.5 rounded">
                      {fmtPfd(item.pfd_value)}
                    </span>
                    {i < creditedItems.length - 1 && <span className="text-indigo-400 mx-0.5">×</span>}
                  </span>
                ))}
                <span className="text-indigo-600 mx-1">=</span>
                <span className="bg-indigo-100 font-bold px-2 py-0.5 rounded">{fmtSci(lopa.pfd_product)}</span>
              </p>
            </div>
          )}
        </div>

        {/* Arithmetic note */}
        <div className="bg-gray-50 border rounded-lg p-3 text-[11px] text-gray-500 flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
          <span>
            <strong>Engine v1.1 formula:</strong> Only IPLs with <em>is_independent=true</em> and <em>credit_applied=true</em> enter the product. Per CCF group, only the member with the lowest PFD is credited. MEF = IEF × ∏PFD<sub>i</sub>. SIL = ⌈−log₁₀(RTTF/MEF)⌉. Baseline is blocked while warnings are present.
          </span>
        </div>
      </div>

      {showEditLopa && <EditLopaDialog lopa={lopa} studyId={studyId} onClose={() => setShowEditLopa(false)} />}
      {showAddIpl && <AddIplDialog studyId={studyId} scenarioId={lopa.scenario_id} lopaId={lopaId} onClose={() => setShowAddIpl(false)} />}
    </Layout>
  );
}
