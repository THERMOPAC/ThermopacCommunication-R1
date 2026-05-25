import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, FilePen, Plus, Trash2, ExternalLink } from "lucide-react";
import { fmtDate } from "@/lib/date-format";

// ── Status Badge ──────────────────────────────────────────────────────────────

function MocStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open:     'bg-amber-100 text-amber-800 border border-amber-200',
    approved: 'bg-blue-100 text-blue-800 border border-blue-200',
    rejected: 'bg-red-100 text-red-800 border border-red-200',
    closed:   'bg-green-100 text-green-800 border border-green-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function artefactLabel(moc: any): string {
  if (moc.lopa_number) return `LOPA · ${moc.lopa_number}`;
  if (moc.srs_number)  return `SRS · ${moc.srs_number}`;
  return '—';
}

// ── Raise MOC Dialog ──────────────────────────────────────────────────────────

function RaiseMocDialog({
  studyId,
  onClose,
}: {
  studyId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [artefactType, setArtefactType] = useState<'lopa' | 'srs'>('srs');
  const [artefactId, setArtefactId]     = useState<string>('');
  const [changeType, setChangeType]     = useState('modify');
  const [changeReason, setChangeReason] = useState('');
  const [changeDesc, setChangeDesc]     = useState('');
  const [safetyImpact, setSafetyImpact] = useState('');
  const [notes, setNotes]               = useState('');

  const { data: lopa } = useQuery<any[]>({
    queryKey: ['/api/hazop/studies', studyId, 'lopa'],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/lopa`, { credentials: 'include' }).then(r => r.json()),
  });
  const { data: srs } = useQuery<any[]>({
    queryKey: ['/api/hazop/studies', studyId, 'srs'],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/srs`, { credentials: 'include' }).then(r => r.json()),
  });

  const baselinedLopa = (lopa ?? []).filter((l: any) => l.baseline_revision);
  const baselinedSrs  = (srs  ?? []).filter((s: any) => s.baseline_revision);

  const mut = useMutation({
    mutationFn: () => {
      const body: any = {
        change_type: changeType,
        change_reason: changeReason,
        change_description: changeDesc,
        safety_impact_assessment: safetyImpact || undefined,
        notes: notes || undefined,
      };
      if (artefactType === 'lopa') body.lopa_id = parseInt(artefactId);
      if (artefactType === 'srs')  body.srs_id  = parseInt(artefactId);
      return apiRequest('POST', `/api/hazop/studies/${studyId}/moc`, body);
    },
    onSuccess: () => {
      toast({ title: 'MOC raised' });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'moc'] });
      onClose();
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => null);
      toast({ title: 'Failed to raise MOC', description: body?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const canSubmit = artefactId && changeReason.trim() && changeDesc.trim();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePen className="h-4 w-4 text-amber-600" />
            Raise Management of Change
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            MOC records may only be raised against <strong>baselined</strong> artefacts.
            Only approved MOCs unlock edits on baselined records.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Artefact Type</Label>
              <Select value={artefactType} onValueChange={(v) => { setArtefactType(v as any); setArtefactId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="srs">SRS Record</SelectItem>
                  <SelectItem value="lopa">LOPA Record</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Artefact</Label>
              <Select value={artefactId} onValueChange={setArtefactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {artefactType === 'srs' && baselinedSrs.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.srs_number} — BL {s.baseline_revision}
                    </SelectItem>
                  ))}
                  {artefactType === 'lopa' && baselinedLopa.map((l: any) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.lopa_number} — BL {l.baseline_revision}
                    </SelectItem>
                  ))}
                  {artefactType === 'srs' && baselinedSrs.length === 0 && (
                    <SelectItem value="_none" disabled>No baselined SRS records</SelectItem>
                  )}
                  {artefactType === 'lopa' && baselinedLopa.length === 0 && (
                    <SelectItem value="_none" disabled>No baselined LOPA records</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Change Type</Label>
            <Select value={changeType} onValueChange={setChangeType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="modify">Modify</SelectItem>
                <SelectItem value="add">Add</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="supersede">Supersede</SelectItem>
                <SelectItem value="rebaseline">Rebaseline</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Change Reason <span className="text-red-500">*</span></Label>
            <Input value={changeReason} onChange={e => setChangeReason(e.target.value)}
              placeholder="Why is this change required?" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Change Description <span className="text-red-500">*</span></Label>
            <Textarea rows={3} value={changeDesc} onChange={e => setChangeDesc(e.target.value)}
              placeholder="Describe the proposed change in detail…" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Safety Impact Assessment</Label>
            <Textarea rows={2} value={safetyImpact} onChange={e => setSafetyImpact(e.target.value)}
              placeholder="Assess any impact on functional safety (required before approval)…" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!canSubmit || mut.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {mut.isPending ? 'Raising…' : 'Raise MOC'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HazopMocPage() {
  const { id: studyId } = useParams<{ id: string }>();
  const [, navigate]    = useLocation();
  const { toast }       = useToast();
  const qc              = useQueryClient();

  const [statusTab, setStatusTab]   = useState<string>('all');
  const [showRaise, setShowRaise]   = useState(false);

  const url = statusTab === 'all'
    ? `/api/hazop/studies/${studyId}/moc`
    : `/api/hazop/studies/${studyId}/moc?status=${statusTab}`;

  const { data: mocs, isLoading } = useQuery<any[]>({
    queryKey: ['/api/hazop/studies', studyId, 'moc', statusTab],
    queryFn: () => fetch(url, { credentials: 'include' }).then(r => r.json()),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/hazop/moc/${id}`),
    onSuccess: () => {
      toast({ title: 'MOC deleted' });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'moc'] });
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => null);
      toast({ title: 'Delete failed', description: body?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const tabs = ['all', 'open', 'approved', 'rejected', 'closed'];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FilePen className="h-5 w-5 text-amber-600" />
            Management of Change Register
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All change records for baselined safety artefacts — LOPA and SRS.
          </p>
        </div>
        <Button
          onClick={() => setShowRaise(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Raise MOC
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setStatusTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusTab === t
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : !mocs?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No MOC records{statusTab !== 'all' ? ` with status "${statusTab}"` : ''} for this study.</p>
          <p className="text-xs mt-1">Raise an MOC to document a proposed change to a baselined artefact.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">MOC No.</th>
                <th className="px-3 py-2.5 text-left font-medium">Artefact</th>
                <th className="px-3 py-2.5 text-left font-medium">Change Type</th>
                <th className="px-3 py-2.5 text-left font-medium w-56">Reason</th>
                <th className="px-3 py-2.5 text-left font-medium">Status</th>
                <th className="px-3 py-2.5 text-left font-medium">Requested By</th>
                <th className="px-3 py-2.5 text-left font-medium">Raised</th>
                <th className="px-3 py-2.5 text-left font-medium">Approved By</th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {mocs.map((moc: any) => (
                <tr key={moc.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 font-mono font-semibold text-amber-700">{moc.moc_number}</td>
                  <td className="px-3 py-2.5 text-xs font-medium">{artefactLabel(moc)}</td>
                  <td className="px-3 py-2.5">
                    <span className="capitalize text-xs text-muted-foreground">{moc.change_type}</span>
                  </td>
                  <td className="px-3 py-2.5 max-w-[14rem]">
                    <span className="text-xs line-clamp-2 text-muted-foreground">{moc.change_reason}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <MocStatusBadge status={moc.moc_status} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{moc.requested_by_name ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {moc.requested_at ? fmtDate(moc.requested_at) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{moc.approved_by_name ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => navigate(`/hazop/studies/${studyId}/moc/${moc.id}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Open
                      </Button>
                      {moc.moc_status === 'open' && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            if (confirm(`Delete ${moc.moc_number}? This cannot be undone.`)) {
                              deleteMut.mutate(moc.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showRaise && (
        <RaiseMocDialog studyId={studyId} onClose={() => setShowRaise(false)} />
      )}
    </div>
  );
}
