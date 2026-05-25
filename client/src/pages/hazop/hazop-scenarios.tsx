import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, Trash2, Edit2, ArrowLeft, BookOpen, Loader2,
  Zap, AlertTriangle, ShieldCheck, Lock, RefreshCw,
} from "lucide-react";

// ── Vocabulary ────────────────────────────────────────────────────────────────

const SEVERITY_LEVELS = [
  { value: 'minor',        label: 'Minor',        cls: 'bg-green-100 text-green-700' },
  { value: 'serious',      label: 'Serious',      cls: 'bg-yellow-100 text-yellow-700' },
  { value: 'major',        label: 'Major',        cls: 'bg-orange-100 text-orange-700' },
  { value: 'critical',     label: 'Critical',     cls: 'bg-red-100 text-red-700' },
  { value: 'catastrophic', label: 'Catastrophic', cls: 'bg-red-200 text-red-900 font-bold' },
] as const;

const OPERATING_MODES = [
  'startup', 'normal', 'shutdown', 'cleaning', 'maintenance', 'upset', 'emergency',
] as const;

const HUMAN_DEP_LEVELS = [
  { value: 'none',     label: 'None' },
  { value: 'low',      label: 'Low' },
  { value: 'medium',   label: 'Medium' },
  { value: 'high',     label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

const RESIDUAL_RISK = [
  { value: 'negligible',   label: 'Negligible',   cls: 'bg-green-100 text-green-700' },
  { value: 'tolerable',    label: 'Tolerable',    cls: 'bg-yellow-100 text-yellow-700' },
  { value: 'unacceptable', label: 'Unacceptable', cls: 'bg-orange-100 text-orange-700' },
  { value: 'intolerable',  label: 'Intolerable',  cls: 'bg-red-200 text-red-900 font-bold' },
] as const;

// ── Badge helpers ─────────────────────────────────────────────────────────────

function SeverityBadge({ s }: { s: string }) {
  const entry = SEVERITY_LEVELS.find(x => x.value === s);
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entry?.cls ?? 'bg-gray-100 text-gray-600'}`}>
      {entry?.label ?? s}
    </span>
  );
}

function RiskBadge({ r }: { r: string | null }) {
  if (!r) return null;
  const entry = RESIDUAL_RISK.find(x => x.value === r);
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entry?.cls ?? 'bg-gray-100 text-gray-600'}`}>
      {entry?.label ?? r}
    </span>
  );
}

function ModeBadge({ m }: { m: string | null }) {
  if (!m) return null;
  const cls: Record<string, string> = {
    startup: 'bg-blue-50 text-blue-700',
    normal: 'bg-green-50 text-green-700',
    shutdown: 'bg-slate-100 text-slate-600',
    cleaning: 'bg-cyan-50 text-cyan-700',
    maintenance: 'bg-yellow-50 text-yellow-700',
    upset: 'bg-orange-100 text-orange-700',
    emergency: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${cls[m] ?? 'bg-gray-50 text-gray-600'}`}>
      {m}
    </span>
  );
}

function BaselineBadge({ rev }: { rev: string | null }) {
  if (!rev) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
      <Lock className="h-3 w-3" /> {rev}
    </span>
  );
}

// ── Form type ─────────────────────────────────────────────────────────────────

interface ScenarioForm {
  title: string;
  initiating_event_group_id: string;
  consequence_description: string;
  consequence_severity: string;
  operating_mode: string;
  human_dependency_level: string;
  residual_risk: string;
  notes: string;
}

const EMPTY_FORM: ScenarioForm = {
  title: '',
  initiating_event_group_id: '',
  consequence_description: '',
  consequence_severity: 'major',
  operating_mode: 'normal',
  human_dependency_level: 'low',
  residual_risk: 'tolerable',
  notes: '',
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HazopScenariosPage() {
  const { id } = useParams<{ id: string }>();
  const studyId = parseInt(id!);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<ScenarioForm>(EMPTY_FORM);
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [filterRisk, setFilterRisk] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: study } = useQuery<any>({
    queryKey: ['/api/hazop/studies', studyId],
    queryFn: () => apiRequest('GET', `/api/hazop/studies/${studyId}`).then(r => r.json()),
  });

  const { data: scenarios = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/hazop/studies', studyId, 'scenarios', filterSeverity, filterMode, filterRisk],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filterSeverity) p.set('consequence_severity', filterSeverity);
      if (filterMode)     p.set('operating_mode', filterMode);
      if (filterRisk)     p.set('residual_risk', filterRisk);
      return apiRequest('GET', `/api/hazop/studies/${studyId}/scenarios?${p}`).then(r => r.json());
    },
  });

  const { data: eventGroups = [] } = useQuery<any[]>({
    queryKey: ['/api/hazop/studies', studyId, 'event-groups'],
    queryFn: () => apiRequest('GET', `/api/hazop/studies/${studyId}/event-groups`).then(r => r.json()),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'scenarios'] });

  const createMut = useMutation({
    mutationFn: (body: any) => apiRequest('POST', `/api/hazop/studies/${studyId}/scenarios`, body).then(r => r.json()),
    onSuccess: () => { invalidate(); setShowDialog(false); toast({ title: 'Scenario created' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiRequest('PATCH', `/api/hazop/scenarios/${id}`, body).then(r => r.json()),
    onSuccess: () => { invalidate(); setShowDialog(false); toast({ title: 'Scenario updated' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: (scId: number) => apiRequest('DELETE', `/api/hazop/scenarios/${scId}`),
    onSuccess: () => { invalidate(); toast({ title: 'Scenario deleted' }); },
    onError: (e: any) => toast({ title: e.message?.includes('baselined') ? 'Locked' : 'Error', description: e.message, variant: 'destructive' }),
  });

  const baselineMut = useMutation({
    mutationFn: (scId: number) => apiRequest('POST', `/api/hazop/scenarios/${scId}/set-baseline`).then(r => r.json()),
    onSuccess: (d: any) => { invalidate(); toast({ title: `Baseline set: ${d.baseline_revision}` }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const generateMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/studies/${studyId}/scenarios/generate-from-event-groups`).then(r => r.json()),
    onSuccess: (d: any) => { invalidate(); toast({ title: `Generated ${d.created} scenarios (${d.skipped} already existed)` }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  }

  function openEdit(sc: any) {
    setEditing(sc);
    setForm({
      title: sc.title ?? '',
      initiating_event_group_id: sc.initiating_event_group_id ? String(sc.initiating_event_group_id) : '',
      consequence_description: sc.consequence_description ?? '',
      consequence_severity: sc.consequence_severity ?? 'major',
      operating_mode: sc.operating_mode ?? 'normal',
      human_dependency_level: sc.human_dependency_level ?? 'low',
      residual_risk: sc.residual_risk ?? 'tolerable',
      notes: sc.notes ?? '',
    });
    setShowDialog(true);
  }

  function handleSubmit() {
    const body = {
      ...form,
      initiating_event_group_id: form.initiating_event_group_id ? parseInt(form.initiating_event_group_id) : null,
    };
    if (editing) { updateMut.mutate({ id: editing.id, body }); }
    else { createMut.mutate(body); }
  }

  const isPending = createMut.isPending || updateMut.isPending;
  const isBaselinePending = baselineMut.isPending;

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalSc = scenarios.length;
  const baselinedSc = scenarios.filter(s => s.baseline_revision).length;
  const criticalSc = scenarios.filter(s => s.consequence_severity === 'critical' || s.consequence_severity === 'catastrophic').length;
  const intolerable = scenarios.filter(s => s.residual_risk === 'intolerable' || s.residual_risk === 'unacceptable').length;

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation(`/hazop/studies/${studyId}/response-groups`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-indigo-600" />
                Scenario Register
              </h1>
              {study && (
                <p className="text-sm text-slate-500">{study.study_number} — {study.title}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => generateMut.mutate()} disabled={generateMut.isPending} size="sm">
              {generateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Auto-generate from Event Groups
            </Button>
            <Button onClick={openCreate} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="h-4 w-4 mr-1" /> New Scenario
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Scenarios',  value: totalSc,      cls: 'text-slate-700' },
            { label: 'Baselined',        value: baselinedSc,  cls: 'text-emerald-600' },
            { label: 'Critical/Catastr', value: criticalSc,   cls: 'text-red-600' },
            { label: 'Intolerable/Unacceptable', value: intolerable, cls: 'text-orange-600' },
          ].map(k => (
            <div key={k.label} className="rounded-lg border bg-white p-3 shadow-sm text-center">
              <div className={`text-2xl font-bold ${k.cls}`}>{k.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-sm text-slate-500">Filter:</span>
          <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}
            className="text-xs border rounded px-2 py-1 bg-white focus:outline-none">
            <option value="">All Severity</option>
            {SEVERITY_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterMode} onChange={e => setFilterMode(e.target.value)}
            className="text-xs border rounded px-2 py-1 bg-white focus:outline-none">
            <option value="">All Modes</option>
            {OPERATING_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
            className="text-xs border rounded px-2 py-1 bg-white focus:outline-none">
            <option value="">All Residual Risk</option>
            {RESIDUAL_RISK.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {(filterSeverity || filterMode || filterRisk) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterSeverity(''); setFilterMode(''); setFilterRisk(''); }}>
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : scenarios.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No scenarios yet</p>
            <p className="text-sm mt-1">Use "Auto-generate" to create scenarios from event groups, or add manually.</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-slate-600 text-xs uppercase tracking-wide">
                  <th className="px-3 py-2 text-left w-24">Number</th>
                  <th className="px-3 py-2 text-left">Title / Consequence</th>
                  <th className="px-3 py-2 text-left w-28">Severity</th>
                  <th className="px-3 py-2 text-left w-28">Mode</th>
                  <th className="px-3 py-2 text-left w-32">Residual Risk</th>
                  <th className="px-3 py-2 text-left w-28">Baseline</th>
                  <th className="px-3 py-2 text-right w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((sc, i) => (
                  <tr key={sc.id} className={`border-b last:border-0 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs font-semibold text-indigo-600">{sc.scenario_number}</span>
                    </td>
                    <td className="px-3 py-2 max-w-xs">
                      <div className="font-medium text-slate-800 truncate">{sc.title}</div>
                      {sc.eg_number && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Zap className="h-3 w-3 text-amber-500 shrink-0" />
                          <span className="text-xs text-amber-700 font-mono">{sc.eg_number}</span>
                          <span className="text-xs text-slate-400 truncate">{sc.eg_name}</span>
                        </div>
                      )}
                      {sc.consequence_description && (
                        <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{sc.consequence_description}</div>
                      )}
                    </td>
                    <td className="px-3 py-2"><SeverityBadge s={sc.consequence_severity} /></td>
                    <td className="px-3 py-2"><ModeBadge m={sc.operating_mode} /></td>
                    <td className="px-3 py-2"><RiskBadge r={sc.residual_risk} /></td>
                    <td className="px-3 py-2">
                      <BaselineBadge rev={sc.baseline_revision} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!sc.baseline_revision && (
                          <Button variant="ghost" size="icon" title="Set baseline"
                            onClick={() => baselineMut.mutate(sc.id)}
                            disabled={isBaselinePending}>
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(sc)}>
                          <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="icon"
                          onClick={() => deleteMut.mutate(sc.id)}
                          disabled={!!sc.baseline_revision}
                          title={sc.baseline_revision ? 'Baselined — cannot delete' : 'Delete'}>
                          <Trash2 className={`h-3.5 w-3.5 ${sc.baseline_revision ? 'text-slate-300' : 'text-red-400'}`} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              {editing ? `Edit ${editing.scenario_number}` : 'New Hazardous Scenario'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1">
              <Label>Title <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Short scenario title"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>

            {/* Initiating event group */}
            <div className="space-y-1">
              <Label>Initiating Event Group</Label>
              <Select value={form.initiating_event_group_id} onValueChange={v => setForm(p => ({ ...p, initiating_event_group_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="— None —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {(eventGroups as any[]).map(eg => (
                    <SelectItem key={eg.id} value={String(eg.id)}>
                      {eg.group_number} — {eg.group_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Consequence description */}
            <div className="space-y-1">
              <Label>Consequence Description <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Describe the full hazardous event chain and its consequences"
                value={form.consequence_description}
                onChange={e => setForm(p => ({ ...p, consequence_description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Severity */}
              <div className="space-y-1">
                <Label>Consequence Severity <span className="text-red-500">*</span></Label>
                <Select value={form.consequence_severity} onValueChange={v => setForm(p => ({ ...p, consequence_severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_LEVELS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Operating mode */}
              <div className="space-y-1">
                <Label>Operating Mode</Label>
                <Select value={form.operating_mode} onValueChange={v => setForm(p => ({ ...p, operating_mode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATING_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Human dependency */}
              <div className="space-y-1">
                <Label>Human Dependency Level</Label>
                <Select value={form.human_dependency_level} onValueChange={v => setForm(p => ({ ...p, human_dependency_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HUMAN_DEP_LEVELS.map(h => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Residual risk */}
              <div className="space-y-1">
                <Label>Residual Risk</Label>
                <Select value={form.residual_risk} onValueChange={v => setForm(p => ({ ...p, residual_risk: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESIDUAL_RISK.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes or LOPA reference"
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>

            {editing?.baseline_revision && (
              <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                This scenario is baselined ({editing.baseline_revision}). Modifications will require a new revision and MOC.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !form.title || !form.consequence_description || !form.consequence_severity}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editing ? 'Save Changes' : 'Create Scenario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
