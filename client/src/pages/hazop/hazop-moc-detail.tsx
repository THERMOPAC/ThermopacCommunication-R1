import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, FilePen, CheckCircle2, XCircle, Lock, AlertTriangle, ChevronRight } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/date-format";

// ── Status Badge ──────────────────────────────────────────────────────────────

function MocStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open:     'bg-amber-100 text-amber-800 border border-amber-200',
    approved: 'bg-blue-100 text-blue-800 border border-blue-200',
    rejected: 'bg-red-100 text-red-800 border border-red-200',
    closed:   'bg-green-100 text-green-800 border border-green-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Reject Dialog ─────────────────────────────────────────────────────────────

function RejectDialog({ mocId, onClose }: { mocId: string; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  const mut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/moc/${mocId}/reject`, { rejection_reason: reason }),
    onSuccess: () => {
      toast({ title: 'MOC rejected' });
      qc.invalidateQueries({ queryKey: ['/api/hazop/moc', mocId] });
      onClose();
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => null);
      toast({ title: 'Rejection failed', description: body?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reject MOC</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Label className="text-xs">Rejection Reason <span className="text-red-500">*</span></Label>
          <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Explain why this MOC is being rejected…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={!reason.trim() || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Rejecting…' : 'Reject MOC'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HazopMocDetailPage() {
  const { id: studyId, mocId } = useParams<{ id: string; mocId: string }>();
  const [, navigate]            = useLocation();
  const { toast }               = useToast();
  const qc                      = useQueryClient();
  const { user }                = useAuth();

  const [editMode, setEditMode]       = useState(false);
  const [showReject, setShowReject]   = useState(false);

  const [form, setForm] = useState<Record<string, any>>({});
  const [formInit, setFormInit] = useState(false);

  const { data: moc, isLoading } = useQuery<any>({
    queryKey: ['/api/hazop/moc', mocId],
    queryFn: () => fetch(`/api/hazop/moc/${mocId}`, { credentials: 'include' }).then(r => r.json()),
  });

  if (moc && !formInit) {
    setForm({
      change_type:             moc.change_type ?? 'modify',
      change_reason:           moc.change_reason ?? '',
      change_description:      moc.change_description ?? '',
      safety_impact_assessment: moc.safety_impact_assessment ?? '',
      notes:                   moc.notes ?? '',
    });
    setFormInit(true);
  }

  const f = (k: string) => (v: any) => setForm(p => ({ ...p, [k]: v }));

  const patchMut = useMutation({
    mutationFn: () => apiRequest('PATCH', `/api/hazop/moc/${mocId}`, form),
    onSuccess: () => {
      toast({ title: 'MOC updated' });
      setEditMode(false);
      qc.invalidateQueries({ queryKey: ['/api/hazop/moc', mocId] });
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => null);
      toast({ title: 'Update failed', description: body?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const approveMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/moc/${mocId}/approve`),
    onSuccess: () => {
      toast({ title: 'MOC approved' });
      qc.invalidateQueries({ queryKey: ['/api/hazop/moc', mocId] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'moc'] });
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => null);
      toast({ title: 'Approval failed', description: body?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const closeMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/hazop/moc/${mocId}/close`),
    onSuccess: () => {
      toast({ title: 'MOC closed' });
      qc.invalidateQueries({ queryKey: ['/api/hazop/moc', mocId] });
      qc.invalidateQueries({ queryKey: ['/api/hazop/studies', studyId, 'moc'] });
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => null);
      toast({ title: 'Close failed', description: body?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const isApprover = ['Superuser', 'General Manager', 'Senior Manager'].includes(user?.role ?? '');
  const isSelf     = moc?.requested_by === user?.id;

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground text-sm">Loading MOC…</div>;
  }
  if (!moc || moc.error) {
    return <div className="p-6 text-center text-muted-foreground text-sm">MOC record not found.</div>;
  }

  const artefactHref = moc.lopa_id
    ? `/hazop/studies/${studyId}/lopa/${moc.lopa_id}`
    : moc.srs_id
      ? `/hazop/studies/${studyId}/srs/${moc.srs_id}`
      : null;

  const artefactLabel = moc.lopa_number
    ? `LOPA ${moc.lopa_number}`
    : moc.srs_number
      ? `SRS ${moc.srs_number}`
      : '—';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate(`/hazop/studies/${studyId}/moc`)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to MOC Register
      </button>

      {/* Header strip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FilePen className="h-5 w-5 text-amber-600" />
          <h1 className="text-xl font-semibold">{moc.moc_number}</h1>
          <MocStatusBadge status={moc.moc_status} />
        </div>
        {moc.moc_status === 'open' && (
          <Button
            variant="outline" size="sm"
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? 'Cancel Edit' : 'Edit'}
          </Button>
        )}
      </div>

      {/* Artefact reference chip */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Linked artefact:</span>
        {artefactHref ? (
          <button
            onClick={() => navigate(artefactHref)}
            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            {artefactLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="text-muted-foreground">{artefactLabel}</span>
        )}
        {moc.baseline_before && (
          <span className="text-xs text-muted-foreground">
            (baseline at raise: <span className="font-mono">{moc.baseline_before}</span>)
          </span>
        )}
      </div>

      {/* Section 1 — Change Details */}
      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Change Details</h2>

        {editMode ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Change Type</Label>
              <Select value={form.change_type} onValueChange={f('change_type')}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
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
              <Input value={form.change_reason} onChange={e => f('change_reason')(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Change Description <span className="text-red-500">*</span></Label>
              <Textarea rows={4} value={form.change_description} onChange={e => f('change_description')(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Safety Impact Assessment</Label>
              <Textarea rows={3} value={form.safety_impact_assessment}
                onChange={e => f('safety_impact_assessment')(e.target.value)}
                placeholder="Required before approval…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={e => f('notes')(e.target.value)} />
            </div>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => patchMut.mutate()}
              disabled={patchMut.isPending}
            >
              {patchMut.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Change Type</p>
                <p className="font-medium capitalize">{moc.change_type}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Baseline Before</p>
                <p className="font-mono font-medium">{moc.baseline_before ?? '—'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Change Reason</p>
              <p>{moc.change_reason}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Change Description</p>
              <p className="whitespace-pre-wrap">{moc.change_description}</p>
            </div>
            {moc.safety_impact_assessment && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Safety Impact Assessment</p>
                <p className="whitespace-pre-wrap">{moc.safety_impact_assessment}</p>
              </div>
            )}
            {!moc.safety_impact_assessment && (
              <div className="flex items-start gap-2 p-2.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Safety impact assessment is required before this MOC can be approved.
              </div>
            )}
            {moc.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                <p className="text-sm text-muted-foreground">{moc.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2 — Artefact Snapshot */}
      {(moc.lopa_number || moc.srs_number) && (
        <div className="rounded-xl border p-5 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Artefact Snapshot</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {moc.lopa_number && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">LOPA Number</p>
                  <p className="font-medium font-mono">{moc.lopa_number}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">LOPA Status</p>
                  <p className="font-medium capitalize">{moc.lopa_status ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Current Baseline</p>
                  <p className="font-mono font-medium">{moc.lopa_current_baseline ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Required SIL</p>
                  <p className="font-medium">{moc.lopa_required_sil != null ? `SIL ${moc.lopa_required_sil}` : '—'}</p>
                </div>
              </>
            )}
            {moc.srs_number && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">SRS Number</p>
                  <p className="font-medium font-mono">{moc.srs_number}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">SRS Status</p>
                  <p className="font-medium capitalize">{moc.srs_status ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Current Baseline</p>
                  <p className="font-mono font-medium">{moc.srs_current_baseline ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">SIL Required</p>
                  <p className="font-medium">{moc.srs_sil_required != null ? `SIL ${moc.srs_sil_required}` : '—'}</p>
                </div>
              </>
            )}
          </div>
          {moc.baseline_after && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Closed — baseline after change: <span className="font-mono font-semibold">{moc.baseline_after}</span>
            </div>
          )}
        </div>
      )}

      {/* Section 3 — Approval Panel */}
      {isApprover && (
        <div className="rounded-xl border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Approval Panel
          </h2>

          {moc.moc_status === 'open' && (
            <>
              {!moc.safety_impact_assessment && (
                <div className="flex items-start gap-2 p-2.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Complete the safety impact assessment before approving.
                </div>
              )}
              {isSelf && (
                <div className="flex items-start gap-2 p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Self-approval is not permitted. A different approver must countersign.
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => approveMut.mutate()}
                  disabled={approveMut.isPending || isSelf || !moc.safety_impact_assessment}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {approveMut.isPending ? 'Approving…' : 'Approve MOC'}
                </Button>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => setShowReject(true)}
                  disabled={isSelf}
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Reject MOC
                </Button>
              </div>
            </>
          )}

          {moc.moc_status === 'approved' && (
            <div className="space-y-3">
              <p className="text-sm text-green-700">
                Approved by <strong>{moc.approved_by_name}</strong> on {fmtDate(moc.approved_at)}.
                The linked artefact may now be edited with this MOC linked.
              </p>
              <div className="p-3 rounded bg-blue-50 border border-blue-200 text-xs text-blue-800 space-y-1">
                <p className="font-semibold">How to use this MOC:</p>
                <p>
                  Navigate to the <button
                    onClick={() => artefactHref && navigate(artefactHref)}
                    className="underline font-medium"
                  >{artefactLabel}</button> record and save your changes.
                  The editor will ask for MOC ID <strong className="font-mono">{moc.id}</strong> to authorise the edit.
                </p>
              </div>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => closeMut.mutate()}
                disabled={closeMut.isPending}
              >
                {closeMut.isPending ? 'Closing…' : 'Close MOC'}
              </Button>
            </div>
          )}

          {moc.moc_status === 'rejected' && (
            <div className="space-y-2">
              <p className="text-sm text-red-700">
                Rejected by <strong>{moc.rejected_by_name}</strong> on {fmtDate(moc.rejected_at)}.
              </p>
              <div className="p-3 rounded bg-red-50 border border-red-200 text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">Rejection Reason</p>
                <p className="text-red-800">{moc.rejection_reason}</p>
              </div>
            </div>
          )}

          {moc.moc_status === 'closed' && (
            <p className="text-sm text-green-700">
              MOC closed. Baseline after change: <span className="font-mono font-semibold">{moc.baseline_after ?? 'not captured'}</span>.
            </p>
          )}
        </div>
      )}

      {/* Section 4 — Audit Trail */}
      <div className="rounded-xl border p-5 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Audit Trail</h2>
        <div className="flex items-start gap-3 text-sm">
          <div className="flex flex-col items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 mt-1" />
            <div className="w-px h-full min-h-[1.5rem] bg-border" />
          </div>
          <div>
            <p className="font-medium">Raised by {moc.requested_by_name ?? 'Unknown'}</p>
            <p className="text-xs text-muted-foreground">{moc.requested_at ? fmtDateTime(moc.requested_at) : '—'}</p>
          </div>
        </div>

        {(moc.moc_status === 'approved' || moc.moc_status === 'closed') && (
          <div className="flex items-start gap-3 text-sm">
            <div className="flex flex-col items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1" />
              {moc.moc_status === 'closed' && <div className="w-px h-full min-h-[1.5rem] bg-border" />}
            </div>
            <div>
              <p className="font-medium">Approved by {moc.approved_by_name ?? 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">{moc.approved_at ? fmtDateTime(moc.approved_at) : '—'}</p>
            </div>
          </div>
        )}

        {moc.moc_status === 'rejected' && (
          <div className="flex items-start gap-3 text-sm">
            <div className="flex flex-col items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 mt-1" />
            </div>
            <div>
              <p className="font-medium">Rejected by {moc.rejected_by_name ?? 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">{moc.rejected_at ? fmtDateTime(moc.rejected_at) : '—'}</p>
              <p className="text-xs mt-0.5 text-red-600">{moc.rejection_reason}</p>
            </div>
          </div>
        )}

        {moc.moc_status === 'closed' && (
          <div className="flex items-start gap-3 text-sm">
            <div className="flex flex-col items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 mt-1" />
            </div>
            <div>
              <p className="font-medium">Closed</p>
              <p className="text-xs text-muted-foreground">
                Baseline after: <span className="font-mono">{moc.baseline_after ?? '—'}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {showReject && (
        <RejectDialog mocId={mocId} onClose={() => setShowReject(false)} />
      )}
    </div>
  );
}
