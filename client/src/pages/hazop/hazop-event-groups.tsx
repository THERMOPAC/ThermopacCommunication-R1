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
  Plus, Trash2, Edit2, ArrowLeft, Zap, RefreshCw, Loader2,
  UserX, Link2, AlertTriangle, ChevronDown, ChevronRight,
} from "lucide-react";

// ── Vocabulary constants ──────────────────────────────────────────────────────

const EVENT_TYPES = [
  { value: 'process_deviation', label: 'Process Deviation' },
  { value: 'equipment_failure', label: 'Equipment Failure' },
  { value: 'utility_failure', label: 'Utility Failure' },
  { value: 'vacuum_failure', label: 'Vacuum Failure' },
  { value: 'phase_transition', label: 'Phase Transition' },
  { value: 'thermal_runaway', label: 'Thermal Runaway' },
  { value: 'overpressure', label: 'Overpressure' },
  { value: 'operator_error', label: 'Operator Error' },
  { value: 'instrument_failure', label: 'Instrument Failure' },
  { value: 'power_failure', label: 'Power Failure' },
] as const;

const TRANSITION_TYPES = [
  { value: 'evaporation', label: 'Evaporation' },
  { value: 'condensation', label: 'Condensation' },
  { value: 'flashing', label: 'Flashing' },
  { value: 'devolatilization', label: 'Devolatilization' },
  { value: 'film_formation', label: 'Film Formation' },
  { value: 'film_breakdown', label: 'Film Breakdown' },
  { value: 'foaming', label: 'Foaming' },
  { value: 'entrainment', label: 'Entrainment' },
  { value: 'thermal_cracking', label: 'Thermal Cracking' },
  { value: 'vacuum_break', label: 'Vacuum Break' },
];

const SEVERITY_LEVELS = ['minor', 'serious', 'major', 'critical', 'catastrophic'] as const;
const OPERATING_MODES = ['startup', 'normal', 'shutdown', 'cleaning', 'maintenance', 'upset', 'emergency'] as const;
const CCF_GROUPS = [
  'vacuum_system', 'thermal_oil', 'power', 'instrument_air',
  'cooling_water', 'utilities', 'control_system', 'shared_equipment',
] as const;

// ── Badge helpers ─────────────────────────────────────────────────────────────

function EventTypeBadge({ t }: { t: string }) {
  const cls: Record<string, string> = {
    vacuum_failure: 'bg-purple-100 text-purple-700',
    thermal_runaway: 'bg-red-100 text-red-800',
    overpressure: 'bg-orange-100 text-orange-700',
    power_failure: 'bg-yellow-100 text-yellow-700',
    instrument_failure: 'bg-sky-100 text-sky-700',
    phase_transition: 'bg-teal-100 text-teal-700',
    equipment_failure: 'bg-gray-100 text-gray-700',
    utility_failure: 'bg-amber-100 text-amber-700',
    operator_error: 'bg-pink-100 text-pink-700',
    process_deviation: 'bg-blue-100 text-blue-700',
  };
  const label = EVENT_TYPES.find(e => e.value === t)?.label ?? t;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls[t] ?? 'bg-gray-100 text-gray-700'}`}>{label}</span>;
}

function SeverityBadge({ s }: { s: string | null }) {
  if (!s) return null;
  const cls: Record<string, string> = {
    minor: 'bg-green-100 text-green-700',
    serious: 'bg-yellow-100 text-yellow-700',
    major: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
    catastrophic: 'bg-red-200 text-red-900 font-semibold',
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${cls[s] ?? 'bg-gray-100 text-gray-700'}`}>{s}</span>;
}

function SourceBadge({ src }: { src: string }) {
  return src === 'auto_extracted'
    ? <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Auto</span>
    : <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Manual</span>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventGroup {
  id: number;
  group_number: string;
  group_name: string;
  event_type: string;
  process_transition_type: string | null;
  consequence_severity: string | null;
  operating_mode: string | null;
  common_cause_group: string | null;
  description: string | null;
  operating_regime: string | null;
  phase_state: string | null;
  process_function: string | null;
  source: string;
  created_by_name: string | null;
  member_count: string;
}

interface GroupDetail extends EventGroup {
  members: Array<{
    id: number; deviation_id: number; deviation_number: string;
    guideword: string; parameter: string; deviation_description: string;
    node_reference: string; node_name: string;
  }>;
}

interface Study { id: number; status: string; title: string; }

// ── Group form ────────────────────────────────────────────────────────────────

function GroupForm({
  initial, onSubmit, onClose, loading,
}: {
  initial?: Partial<EventGroup>;
  onSubmit: (data: any) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    group_name: initial?.group_name ?? '',
    event_type: initial?.event_type ?? '',
    process_transition_type: initial?.process_transition_type ?? '',
    consequence_severity: initial?.consequence_severity ?? '',
    operating_mode: initial?.operating_mode ?? '',
    common_cause_group: initial?.common_cause_group ?? '',
    description: initial?.description ?? '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div>
        <Label>Group Name *</Label>
        <Input value={form.group_name} onChange={e => set('group_name', e.target.value)} placeholder="e.g. Vacuum Failure — Film Breakdown" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Event Type *</Label>
          <Select value={form.event_type} onValueChange={v => set('event_type', v)}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{EVENT_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Process Transition</Label>
          <Select value={form.process_transition_type} onValueChange={v => set('process_transition_type', v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {TRANSITION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Consequence Severity</Label>
          <Select value={form.consequence_severity} onValueChange={v => set('consequence_severity', v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">— None —</SelectItem>
              {SEVERITY_LEVELS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
            {CCF_GROUPS.map(g => <SelectItem key={g} value={g}>{g.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button onClick={() => onSubmit(form)} disabled={loading || !form.group_name.trim() || !form.event_type}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          {initial ? 'Update' : 'Create'}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Add member dialog ─────────────────────────────────────────────────────────

function AddMemberDialog({
  groupId, studyId, onClose,
}: { groupId: number; studyId: number; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deviationId, setDeviationId] = useState('');

  const { data: allDeviations } = useQuery<Array<{
    id: number; deviation_number: string; guideword: string; parameter: string;
    deviation_description: string; node_reference: string;
  }>>({
    queryKey: ['/api/hazop/studies', studyId, 'deviations-flat'],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/deviations-flat`).then(r => r.json()),
  });

  const mutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/event-groups/${groupId}/members`, { deviation_id: parseInt(deviationId) }),
    onSuccess: () => {
      toast({ title: 'Deviation linked' });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/event-groups', groupId] });
      onClose();
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Deviation</Label>
        <Select value={deviationId} onValueChange={setDeviationId}>
          <SelectTrigger><SelectValue placeholder="Select deviation…" /></SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            {(allDeviations ?? []).map(d => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.deviation_number} — [{d.guideword}/{d.parameter}] {d.deviation_description.substring(0, 50)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={!deviationId || mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Link
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Group detail panel ────────────────────────────────────────────────────────

function GroupDetail({
  groupId, studyId, onEdit, onDelete,
}: { groupId: number; studyId: number; onEdit: () => void; onDelete: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addMember, setAddMember] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const { data, isLoading } = useQuery<GroupDetail>({
    queryKey: ['/api/hazop/event-groups', groupId],
    queryFn: () => fetch(`/api/hazop/event-groups/${groupId}`).then(r => r.json()),
  });

  const removeMember = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/hazop/event-group-members/${id}`),
    onSuccess: () => {
      toast({ title: 'Member removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/event-groups', groupId] });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'event-groups'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="flex items-center gap-2 text-slate-500 text-sm p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
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
          <EventTypeBadge t={data.event_type} />
          {data.process_transition_type && (
            <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded">
              {TRANSITION_TYPES.find(t => t.value === data.process_transition_type)?.label ?? data.process_transition_type}
            </span>
          )}
          <SeverityBadge s={data.consequence_severity} />
          <SourceBadge src={data.source} />
          <span className="text-xs text-slate-400">{data.members.length} deviations</span>
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
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Linked Deviations</span>
            <Button size="sm" variant="outline" onClick={() => setAddMember(true)}>
              <Link2 className="h-3.5 w-3.5 mr-1" />Add
            </Button>
          </div>
          {data.members.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No deviations linked yet.</p>
          ) : (
            <div className="space-y-1">
              {data.members.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-slate-50 rounded px-3 py-1.5 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-slate-500 shrink-0">{m.deviation_number}</span>
                    <span className="text-xs bg-gray-100 px-1 rounded shrink-0">{m.guideword}/{m.parameter}</span>
                    <span className="text-slate-700 truncate">{m.deviation_description}</span>
                    <span className="text-xs text-slate-400 shrink-0">({m.node_reference})</span>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    className="text-red-400 hover:text-red-600 shrink-0"
                    onClick={() => removeMember.mutate(m.id)}
                    disabled={removeMember.isPending}
                  >
                    <UserX className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={addMember} onOpenChange={setAddMember}>
        <DialogContent>
          <DialogHeader><DialogTitle>Link Deviation to Group</DialogTitle></DialogHeader>
          <AddMemberDialog groupId={groupId} studyId={studyId} onClose={() => setAddMember(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HazopEventGroupsPage() {
  const { id } = useParams<{ id: string }>();
  const studyId = parseInt(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<EventGroup | null>(null);
  const [filterType, setFilterType] = useState('');

  const { data: study } = useQuery<Study>({
    queryKey: ['/api/hazop/studies', studyId],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}`).then(r => r.json()),
  });

  const queryKey = filterType
    ? ['/api/hazop/studies', studyId, 'event-groups', filterType]
    : ['/api/hazop/studies', studyId, 'event-groups'];

  const { data: groups, isLoading } = useQuery<EventGroup[]>({
    queryKey,
    queryFn: () => {
      const url = filterType
        ? `/api/hazop/studies/${studyId}/event-groups?event_type=${filterType}`
        : `/api/hazop/studies/${studyId}/event-groups`;
      return fetch(url).then(r => r.json());
    },
    enabled: !isNaN(studyId),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest('POST', `/api/hazop/studies/${studyId}/event-groups`, body),
    onSuccess: () => {
      toast({ title: 'Event group created' });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'event-groups'] });
      setCreateOpen(false);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiRequest('PATCH', `/api/hazop/event-groups/${id}`, body),
    onSuccess: () => {
      toast({ title: 'Event group updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'event-groups'] });
      setEditGroup(null);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/hazop/event-groups/${id}`),
    onSuccess: () => {
      toast({ title: 'Event group deleted' });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'event-groups'] });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const extractMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/studies/${studyId}/event-groups/extract`, {}),
    onSuccess: (data: any) => {
      toast({ title: `Extraction complete`, description: `${data.created_groups} groups, ${data.linked_members} deviations linked` });
      queryClient.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'event-groups'] });
    },
    onError: (e: any) => toast({ title: 'Extraction failed', description: e.message, variant: 'destructive' }),
  });

  const isDraft = study?.status === 'draft';
  const groupList = groups ?? [];
  const typeCounts = groupList.reduce<Record<string, number>>((acc, g) => {
    acc[g.event_type] = (acc[g.event_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/worksheet`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Event Groups
            </h1>
            {study && <p className="text-sm text-slate-500">{study.title}</p>}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All event types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All event types</SelectItem>
              {EVENT_TYPES.map(e => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label} {typeCounts[e.value] ? `(${typeCounts[e.value]})` : ''}
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

        {/* Stats row */}
        {groupList.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {Object.entries(typeCounts).map(([type, count]) => (
              <div key={type} className="flex items-center gap-1">
                <EventTypeBadge t={type} />
                <span className="text-xs text-slate-500">×{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Group list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading event groups…
          </div>
        ) : groupList.length === 0 ? (
          <div className="text-center py-16 text-slate-400 border-2 border-dashed rounded-xl">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="font-medium">No event groups yet</p>
            <p className="text-sm mt-1">Use Auto-Extract to generate groups from worksheet deviations, or create one manually.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupList.map(g => (
              <GroupDetail
                key={g.id}
                groupId={g.id}
                studyId={studyId}
                onEdit={() => setEditGroup(g)}
                onDelete={() => {
                  if (confirm(`Delete event group ${g.group_number}?`)) deleteMutation.mutate(g.id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New Event Group</DialogTitle></DialogHeader>
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
          <DialogHeader><DialogTitle>Edit Event Group — {editGroup?.group_number}</DialogTitle></DialogHeader>
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
