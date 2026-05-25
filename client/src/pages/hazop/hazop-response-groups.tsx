import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, Trash2, Edit2, ArrowLeft, ShieldCheck, RefreshCw, Loader2,
  AlertTriangle, ChevronDown, ChevronRight, GripVertical,
} from "lucide-react";

// ── Vocabulary constants ──────────────────────────────────────────────────────

const PROTECTION_LAYERS = [
  { value: 'BPCS', label: 'BPCS', color: 'bg-blue-100 text-blue-700' },
  { value: 'SIS', label: 'SIS', color: 'bg-red-100 text-red-700' },
  { value: 'Mechanical', label: 'Mechanical', color: 'bg-slate-100 text-slate-700' },
  { value: 'Procedural', label: 'Procedural', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'Operator', label: 'Operator', color: 'bg-orange-100 text-orange-700' },
  { value: 'Relief', label: 'Relief', color: 'bg-green-100 text-green-700' },
] as const;

const LOGIC_TYPES = ['parallel', 'sequential', 'latched', 'permissive', 'voting', 'manual_reset'] as const;
const CRITICALITY_CLASSES = ['instant', 'fast', 'medium', 'slow', 'operator_managed'] as const;
const EFFECTIVENESS_RATINGS = ['low', 'medium', 'high', 'verified'] as const;
const HUMAN_DEP_LEVELS = ['none', 'low', 'medium', 'high', 'critical'] as const;
const OPERATING_MODES = ['startup', 'normal', 'shutdown', 'cleaning', 'maintenance', 'upset', 'emergency'] as const;
const ACTION_TYPES = ['stop', 'open', 'close', 'alarm', 'start', 'cooldown', 'isolate', 'de_energise', 'vent', 'other'] as const;
const CCF_GROUPS = [
  'vacuum_system', 'thermal_oil', 'power', 'instrument_air',
  'cooling_water', 'utilities', 'control_system', 'shared_equipment',
] as const;

// ── Badge helpers ─────────────────────────────────────────────────────────────

function PlBadge({ pl }: { pl: string }) {
  const entry = PROTECTION_LAYERS.find(p => p.value === pl);
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entry?.color ?? 'bg-gray-100 text-gray-700'}`}>
      {entry?.label ?? pl}
    </span>
  );
}

function EffBadge({ r }: { r: string | null }) {
  if (!r) return null;
  const cls: Record<string, string> = {
    low: 'bg-red-50 text-red-600', medium: 'bg-yellow-50 text-yellow-700',
    high: 'bg-green-50 text-green-700', verified: 'bg-emerald-100 text-emerald-700 font-semibold',
  };
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls[r] ?? 'bg-gray-50 text-gray-600'}`}>{r}</span>;
}

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null;
  let cls = 'bg-red-50 text-red-600';
  if (score >= 90) cls = 'bg-emerald-100 text-emerald-800 font-semibold';
  else if (score >= 75) cls = 'bg-green-50 text-green-700';
  else if (score >= 50) cls = 'bg-yellow-50 text-yellow-700';
  return <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${cls}`}>{score}%</span>;
}

function SourceBadge({ src }: { src: string }) {
  return src === 'auto_extracted'
    ? <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Auto</span>
    : <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Manual</span>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResponseGroup {
  id: number;
  group_number: string;
  group_name: string;
  protection_layer: string;
  logic_type: string | null;
  criticality_class: string | null;
  effectiveness_rating: string | null;
  human_dependency_level: string | null;
  operating_mode: string | null;
  is_independent_protection_layer: boolean;
  common_cause_group: string | null;
  description: string | null;
  source: string;
  created_by_name: string | null;
  action_count: string;
}

interface RgAction {
  id: number;
  sequence_no: number;
  action_description: string;
  action_type: string | null;
  tag_ref: string | null;
  confidence_score: number | null;
  source_safeguard_id: number | null;
  source_action_id: number | null;
}

interface GroupDetail extends ResponseGroup {
  actions: RgAction[];
}

interface Study { id: number; status: string; title: string; }

// ── Group form ────────────────────────────────────────────────────────────────

function GroupForm({
  initial, onSubmit, onClose, loading,
}: {
  initial?: Partial<ResponseGroup>;
  onSubmit: (data: any) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    group_name: initial?.group_name ?? '',
    protection_layer: initial?.protection_layer ?? '',
    logic_type: initial?.logic_type ?? '',
    criticality_class: initial?.criticality_class ?? '',
    effectiveness_rating: initial?.effectiveness_rating ?? '',
    human_dependency_level: initial?.human_dependency_level ?? '',
    operating_mode: initial?.operating_mode ?? '',
    is_independent_protection_layer: initial?.is_independent_protection_layer ?? false,
    common_cause_group: initial?.common_cause_group ?? '',
    description: initial?.description ?? '',
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div>
        <Label>Group Name *</Label>
        <Input value={form.group_name} onChange={e => set('group_name', e.target.value)} placeholder="e.g. SIS — XV-101 Trip" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Protection Layer *</Label>
          <Select value={form.protection_layer} onValueChange={v => set('protection_layer', v)}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {PROTECTION_LAYERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Logic Type</Label>
          <Select value={form.logic_type} onValueChange={v => set('logic_type', v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {LOGIC_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Criticality Class</Label>
          <Select value={form.criticality_class} onValueChange={v => set('criticality_class', v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {CRITICALITY_CLASSES.map(c => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Effectiveness</Label>
          <Select value={form.effectiveness_rating} onValueChange={v => set('effectiveness_rating', v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {EFFECTIVENESS_RATINGS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Human Dependency</Label>
          <Select value={form.human_dependency_level} onValueChange={v => set('human_dependency_level', v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {HUMAN_DEP_LEVELS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Operating Mode</Label>
          <Select value={form.operating_mode} onValueChange={v => set('operating_mode', v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {OPERATING_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Common Cause Failure Group</Label>
        <Select value={form.common_cause_group} onValueChange={v => set('common_cause_group', v)}>
          <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">— None —</SelectItem>
            {CCF_GROUPS.map(g => <SelectItem key={g} value={g}>{g.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="ipl"
          checked={form.is_independent_protection_layer}
          onCheckedChange={v => set('is_independent_protection_layer', !!v)}
        />
        <Label htmlFor="ipl" className="cursor-pointer">Independent Protection Layer (IPL)</Label>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button onClick={() => onSubmit(form)} disabled={loading || !form.group_name.trim() || !form.protection_layer}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          {initial ? 'Update' : 'Create'}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Action form ───────────────────────────────────────────────────────────────

function AddActionDialog({
  groupId, onClose,
}: { groupId: number; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ action_description: '', action_type: '', tag_ref: '' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/response-groups/${groupId}/actions`, {
      action_description: form.action_description,
      action_type: form.action_type || undefined,
      tag_ref: form.tag_ref || undefined,
    }),
    onSuccess: () => {
      toast({ title: 'Action added' });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/response-groups', groupId] });
      onClose();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Action Description *</Label>
        <Textarea rows={2} value={form.action_description} onChange={e => set('action_description', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Action Type</Label>
          <Select value={form.action_type} onValueChange={v => set('action_type', v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {ACTION_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tag Ref</Label>
          <Input value={form.tag_ref} onChange={e => set('tag_ref', e.target.value)} placeholder="e.g. XV-101" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={!form.action_description.trim() || mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Add
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Group detail panel ────────────────────────────────────────────────────────

function GroupDetail({
  groupId, onEdit, onDelete,
}: { groupId: number; onEdit: () => void; onDelete: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addAction, setAddAction] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const { data, isLoading } = useQuery<GroupDetail>({
    queryKey: ['/api/hazop/response-groups', groupId],
    queryFn: () => fetch(`/api/hazop/response-groups/${groupId}`).then(r => r.json()),
  });

  const deleteAction = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/hazop/response-group-actions/${id}`),
    onSuccess: () => {
      toast({ title: 'Action removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/response-groups', groupId] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="flex items-center gap-2 text-slate-500 text-sm p-4"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;
  if (!data) return null;

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-slate-500">{data.group_number}</span>
          <span className="font-semibold text-sm">{data.group_name}</span>
          <PlBadge pl={data.protection_layer} />
          {data.is_independent_protection_layer && (
            <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">IPL</span>
          )}
          {data.logic_type && (
            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{data.logic_type.replace('_', ' ')}</span>
          )}
          {data.criticality_class && (
            <span className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{data.criticality_class.replace('_', ' ')}</span>
          )}
          <EffBadge r={data.effectiveness_rating} />
          <SourceBadge src={data.source} />
          <span className="text-xs text-slate-400">{data.actions.length} actions</span>
        </div>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={onEdit}><Edit2 className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></Button>
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3">
          {data.description && <p className="text-sm text-slate-600 mb-3">{data.description}</p>}

          <div className="flex items-center gap-3 mb-2 flex-wrap text-xs text-slate-500">
            {data.human_dependency_level && <span>Human dep: <strong>{data.human_dependency_level}</strong></span>}
            {data.operating_mode && <span>Mode: <strong>{data.operating_mode}</strong></span>}
            {data.common_cause_group && <span>CCF: <strong>{data.common_cause_group.replace(/_/g, ' ')}</strong></span>}
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Response Actions</span>
            <Button size="sm" variant="outline" onClick={() => setAddAction(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Action
            </Button>
          </div>

          {data.actions.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No actions defined yet.</p>
          ) : (
            <div className="space-y-1">
              {data.actions.map(a => (
                <div key={a.id} className="flex items-start justify-between bg-slate-50 rounded px-3 py-2 gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <GripVertical className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
                    <span className="font-mono text-xs text-slate-400 shrink-0 mt-0.5">{String(a.sequence_no).padStart(2, '0')}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">{a.action_description}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {a.action_type && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{a.action_type.replace('_', ' ')}</span>
                        )}
                        {a.tag_ref && <span className="text-xs text-slate-500 font-mono">→ {a.tag_ref}</span>}
                        <ConfidenceBadge score={a.confidence_score} />
                        {a.source_safeguard_id && (
                          <span className="text-xs text-slate-400">SF#{a.source_safeguard_id}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    className="text-red-400 hover:text-red-600 shrink-0"
                    onClick={() => deleteAction.mutate(a.id)}
                    disabled={deleteAction.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={addAction} onOpenChange={setAddAction}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Action to {data.group_number}</DialogTitle></DialogHeader>
          <AddActionDialog groupId={groupId} onClose={() => setAddAction(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HazopResponseGroupsPage() {
  const { id } = useParams<{ id: string }>();
  const studyId = parseInt(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<ResponseGroup | null>(null);
  const [filterPl, setFilterPl] = useState('');

  const { data: study } = useQuery<Study>({
    queryKey: ['/api/hazop/studies', studyId],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}`).then(r => r.json()),
  });

  const queryKey = filterPl
    ? ['/api/hazop/studies', studyId, 'response-groups', filterPl]
    : ['/api/hazop/studies', studyId, 'response-groups'];

  const { data: groups, isLoading } = useQuery<ResponseGroup[]>({
    queryKey,
    queryFn: () => {
      const url = filterPl
        ? `/api/hazop/studies/${studyId}/response-groups?protection_layer=${filterPl}`
        : `/api/hazop/studies/${studyId}/response-groups`;
      return fetch(url).then(r => r.json());
    },
    enabled: !isNaN(studyId),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest('POST', `/api/hazop/studies/${studyId}/response-groups`, body),
    onSuccess: () => {
      toast({ title: 'Response group created' });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'response-groups'] });
      setCreateOpen(false);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiRequest('PATCH', `/api/hazop/response-groups/${id}`, body),
    onSuccess: () => {
      toast({ title: 'Response group updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'response-groups'] });
      setEditGroup(null);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/hazop/response-groups/${id}`),
    onSuccess: () => {
      toast({ title: 'Response group deleted' });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'response-groups'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const extractMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/studies/${studyId}/response-groups/extract`, {}),
    onSuccess: (data: any) => {
      toast({ title: 'Extraction complete', description: `${data.created_groups} groups, ${data.created_actions} actions` });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'response-groups'] });
    },
    onError: (e: any) => toast({ title: 'Extraction failed', description: e.message, variant: 'destructive' }),
  });

  const isDraft = study?.status === 'draft';
  const groupList = groups ?? [];

  const plCounts = groupList.reduce<Record<string, number>>((acc, g) => {
    acc[g.protection_layer] = (acc[g.protection_layer] ?? 0) + 1;
    return acc;
  }, {});

  const iplCount = groupList.filter(g => g.is_independent_protection_layer).length;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/event-groups`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />Event Groups
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Response Groups
            </h1>
            {study && <p className="text-sm text-slate-500">{study.title}</p>}
          </div>
        </div>

        {/* Stats summary */}
        {groupList.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold text-slate-800">{groupList.length}</div>
              <div className="text-xs text-slate-500">Response Groups</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-700">{iplCount}</div>
              <div className="text-xs text-slate-500">IPL Groups</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-700">{plCounts['SIS'] ?? 0}</div>
              <div className="text-xs text-slate-500">SIS Groups</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-700">{plCounts['BPCS'] ?? 0}</div>
              <div className="text-xs text-slate-500">BPCS Groups</div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterPl} onValueChange={setFilterPl}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All protection layers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All layers</SelectItem>
              {PROTECTION_LAYERS.map(p => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label} {plCounts[p.value] ? `(${plCounts[p.value]})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1" />

          {isDraft && (
            <>
              <Button
                variant="outline"
                onClick={() => extractMutation.mutate()}
                disabled={extractMutation.isPending}
              >
                {extractMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Auto-Extract
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />New Group
              </Button>
            </>
          )}
        </div>

        {/* Protection layer filter pills */}
        {groupList.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {Object.entries(plCounts).map(([pl, count]) => (
              <div key={pl} className="flex items-center gap-1">
                <PlBadge pl={pl} />
                <span className="text-xs text-slate-500">×{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Group list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading response groups…
          </div>
        ) : groupList.length === 0 ? (
          <div className="text-center py-16 text-slate-400 border-2 border-dashed rounded-xl">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="font-medium">No response groups yet</p>
            <p className="text-sm mt-1">Use Auto-Extract to generate BPCS/SIS groups from worksheet safeguards, or create one manually.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupList.map(g => (
              <GroupDetail
                key={g.id}
                groupId={g.id}
                onEdit={() => setEditGroup(g)}
                onDelete={() => {
                  if (confirm(`Delete response group ${g.group_number}?`)) deleteMutation.mutate(g.id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New Response Group</DialogTitle></DialogHeader>
          <GroupForm
            onSubmit={data => createMutation.mutate(data)}
            onClose={() => setCreateOpen(false)}
            loading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editGroup} onOpenChange={o => { if (!o) setEditGroup(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit Response Group — {editGroup?.group_number}</DialogTitle></DialogHeader>
          {editGroup && (
            <GroupForm
              initial={editGroup}
              onSubmit={data => updateMutation.mutate({ id: editGroup.id, body: data })}
              onClose={() => setEditGroup(null)}
              loading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
