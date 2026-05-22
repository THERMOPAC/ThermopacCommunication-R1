import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, ArrowLeft, AlertCircle, RefreshCw, CheckCircle2, XCircle,
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, Clock, AlertTriangle,
  Activity, ThumbsUp, ThumbsDown, RotateCcw, Check, X, ClipboardList,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import {
  CAPA_STATUS_LABELS, CAPA_STATUS_COLORS, CAPA_PRIORITY_LABELS, CAPA_PRIORITY_COLORS,
  CAPA_TYPE_LABELS, CAPA_TYPE_COLORS, CAPA_STATUS_PIPELINE,
  ACTION_STATUS_LABELS, ACTION_STATUS_COLORS, ACTION_VERIFICATION_LABELS, ACTION_VERIFICATION_COLORS,
  EFFECTIVENESS_SCORE_LABELS, CAPA_TRANSITION_LABELS,
} from "./oi-capa-constants";

const ALLOWED_ROLES = ["Manager","Senior Manager","General Manager","Superuser"];
const SM_ROLES      = ["Senior Manager","General Manager","Superuser"];

function StatusPipeline({ status }: { status: string }) {
  const idx = CAPA_STATUS_PIPELINE.indexOf(status as any);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {CAPA_STATUS_PIPELINE.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border
            ${i < idx ? "bg-green-100 text-green-700 border-green-300"
              : i === idx ? "bg-indigo-100 text-indigo-800 border-indigo-400 font-bold"
              : "bg-gray-50 text-gray-400 border-gray-200"}`}>
            {CAPA_STATUS_LABELS[s]}
          </span>
          {i < CAPA_STATUS_PIPELINE.length - 1 && (
            <span className={`text-xs ${i < idx ? "text-green-500" : "text-gray-300"}`}>→</span>
          )}
        </div>
      ))}
    </div>
  );
}

function EffectivenessScoreStars({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={`text-lg ${i <= score ? "text-amber-400" : "text-gray-200"}`}>★</span>
      ))}
      <span className="ml-1 text-xs text-gray-600">{EFFECTIVENESS_SCORE_LABELS[score]}</span>
    </div>
  );
}

// Action item row
function ActionRow({ action, capa, onRefresh }: { action: any; capa: any; onRefresh: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isSm = SM_ROLES.includes(user?.role ?? "");
  const isMgr = ALLOWED_ROLES.includes(user?.role ?? "");

  const canComplete = action.status === 'open' && ['in_progress','pending_verification'].includes(capa.status);
  const canVerify   = action.status === 'completed' && action.verificationStatus === 'pending' && ['pending_verification','effectiveness_review'].includes(capa.status);
  const canCancel   = action.status === 'open' && ['draft','open','in_progress'].includes(capa.status);

  async function doComplete() {
    const note = prompt("Completion note (optional):");
    try {
      await apiRequest("POST", `/api/oi/capa/${capa.id}/actions/${action.id}/complete`, { completionNote: note });
      toast({ title: "Action completed" }); onRefresh();
    } catch { toast({ title: "Error", description: "Failed to complete action", variant: "destructive" }); }
  }

  async function doVerify(ok: boolean) {
    if (!ok) {
      const note = prompt("Rejection note (min 10 chars):");
      if (!note || note.length < 10) { toast({ title: "Note required", variant: "destructive" }); return; }
      try {
        await apiRequest("POST", `/api/oi/capa/${capa.id}/actions/${action.id}/reject-verification`, { verificationNote: note });
        toast({ title: "Verification rejected" }); onRefresh();
      } catch { toast({ title: "Error", variant: "destructive" }); }
    } else {
      try {
        await apiRequest("POST", `/api/oi/capa/${capa.id}/actions/${action.id}/verify`, {});
        toast({ title: "Action verified" }); onRefresh();
      } catch { toast({ title: "Error", variant: "destructive" }); }
    }
  }

  async function doCancel() {
    if (!confirm("Cancel this action item?")) return;
    try {
      await apiRequest("POST", `/api/oi/capa/${capa.id}/actions/${action.id}/cancel`, {});
      toast({ title: "Action cancelled" }); onRefresh();
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2 text-xs text-gray-500 w-10">#{action.actionNo}</td>
      <td className="px-3 py-2 text-sm text-gray-900">{action.description}</td>
      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{action.assignedTo ? "—" : "—"}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STATUS_COLORS[action.status]}`}>
          {ACTION_STATUS_LABELS[action.status]}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_VERIFICATION_COLORS[action.verificationStatus]}`}>
          {ACTION_VERIFICATION_LABELS[action.verificationStatus]}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{action.dueDate ? fmtDate(action.dueDate) : "—"}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex gap-1">
          {canComplete && isMgr && (
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-green-700 hover:bg-green-50" onClick={doComplete}>
              <Check className="h-3 w-3 mr-0.5" />Done
            </Button>
          )}
          {canVerify && isMgr && (
            <>
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-green-700 hover:bg-green-50" onClick={() => doVerify(true)}>
                <ThumbsUp className="h-3 w-3 mr-0.5" />Verify
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-red-700 hover:bg-red-50" onClick={() => doVerify(false)}>
                <ThumbsDown className="h-3 w-3 mr-0.5" />Reject
              </Button>
            </>
          )}
          {canCancel && isMgr && (
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-gray-500 hover:bg-gray-100" onClick={doCancel}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// Add Action modal
const addActionSchema = z.object({
  description: z.string().min(5, "Minimum 5 characters"),
  dueDate:     z.string().optional(),
});

function AddActionDialog({ capaId, issueId, capaNumber, open, onClose, onSuccess }: any) {
  const { toast } = useToast();
  const form = useForm({ resolver: zodResolver(addActionSchema), defaultValues: { description: "", dueDate: "" } });
  async function onSubmit(values: any) {
    try {
      await apiRequest("POST", `/api/oi/capa/${capaId}/actions`, {
        description: values.description,
        dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
      });
      toast({ title: "Action item added" });
      form.reset();
      onSuccess();
      onClose();
    } catch { toast({ title: "Error", description: "Failed to add action", variant: "destructive" }); }
  }
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Action Item — {capaNumber}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description *</FormLabel>
                <FormControl><Textarea {...field} rows={3} placeholder="Describe the action to be taken…" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="dueDate" render={({ field }) => (
              <FormItem>
                <FormLabel>Due Date</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit">Add Action</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Effectiveness Review modal
const effectivenessSchema = z.object({
  effectivenessScore: z.number({ coerce: true }).int().min(1).max(5),
  isEffective:        z.boolean(),
  recurrenceObserved: z.boolean(),
  evidenceNotes:      z.string().optional(),
  recommendation:     z.string().optional(),
});

function EffectivenessDialog({ capaId, capaNumber, open, onClose, onSuccess }: any) {
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(effectivenessSchema),
    defaultValues: { effectivenessScore: 3, isEffective: true, recurrenceObserved: false, evidenceNotes: "", recommendation: "" },
  });
  const isEffective = form.watch("isEffective");

  async function onSubmit(values: any) {
    try {
      await apiRequest("POST", `/api/oi/capa/${capaId}/effectiveness`, values);
      toast({ title: "Effectiveness review recorded" });
      form.reset();
      onSuccess();
      onClose();
    } catch (e: any) {
      const detail = await e?.response?.json?.().catch(() => null);
      toast({ title: "Error", description: detail?.error === "contradiction_effective_and_recurrence" ? "Cannot be effective and have recurrence." : detail?.message || "Failed to save review", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Effectiveness Review — {capaNumber}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="effectivenessScore" render={({ field }) => (
              <FormItem>
                <FormLabel>Effectiveness Score (1–5) *</FormLabel>
                <div className="flex gap-2 mt-1">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => field.onChange(n)}
                      className={`w-10 h-10 rounded-full text-sm font-bold border-2 transition-colors
                        ${field.value === n ? "bg-amber-400 border-amber-500 text-white" : "border-gray-200 text-gray-600 hover:border-amber-300"}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">{EFFECTIVENESS_SCORE_LABELS[form.watch("effectivenessScore")] ?? ""}</p>
              </FormItem>
            )} />
            <div className="flex gap-4">
              <FormField control={form.control} name="isEffective" render={({ field }) => (
                <FormItem className="flex items-center gap-2 mt-1">
                  <FormControl>
                    <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} className="w-4 h-4 accent-green-600" />
                  </FormControl>
                  <FormLabel className="mt-0 cursor-pointer">Is Effective?</FormLabel>
                </FormItem>
              )} />
              <FormField control={form.control} name="recurrenceObserved" render={({ field }) => (
                <FormItem className="flex items-center gap-2 mt-1">
                  <FormControl>
                    <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)} className="w-4 h-4 accent-red-600" />
                  </FormControl>
                  <FormLabel className="mt-0 cursor-pointer">Recurrence Observed?</FormLabel>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="evidenceNotes" render={({ field }) => (
              <FormItem>
                <FormLabel>Evidence Notes</FormLabel>
                <FormControl><Textarea {...field} rows={2} placeholder="Evidence supporting the assessment…" /></FormControl>
              </FormItem>
            )} />
            {!isEffective && (
              <FormField control={form.control} name="recommendation" render={({ field }) => (
                <FormItem>
                  <FormLabel>Recommendation * <span className="text-xs text-gray-400">(required when not effective)</span></FormLabel>
                  <FormControl><Textarea {...field} rows={2} placeholder="What should be done next?" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit">Save Review</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Cancel CAPA dialog
function CancelDialog({ capaId, capaNumber, open, onClose, onSuccess }: any) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  async function doCancel() {
    if (reason.trim().length < 10) { toast({ title: "Reason must be at least 10 characters", variant: "destructive" }); return; }
    try {
      await apiRequest("POST", `/api/oi/capa/${capaId}/transition`, { action: "cancel", cancellationReason: reason });
      toast({ title: "CAPA cancelled" });
      onSuccess(); onClose();
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancel CAPA — {capaNumber}</DialogTitle>
          <DialogDescription>This will permanently move the CAPA to Cancelled status. Provide a reason.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Cancellation reason (min 10 characters)…" className="mt-2" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Back</Button>
          <Button variant="destructive" onClick={doCancel}>Confirm Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OiCapaDetailPage() {
  const params = useParams<{ capaId: string }>();
  const capaId = parseInt(params.capaId ?? "0");
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [addActionOpen, setAddActionOpen]             = useState(false);
  const [effectivenessOpen, setEffectivenessOpen]     = useState(false);
  const [cancelOpen, setCancelOpen]                   = useState(false);
  const [showAllEffectiveness, setShowAllEffectiveness] = useState(false);

  const isMgr = ALLOWED_ROLES.includes(user?.role ?? "");
  const isSm  = SM_ROLES.includes(user?.role ?? "");

  const { data: capa, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/oi/capa", capaId],
    queryFn: async () => {
      const res = await fetch(`/api/oi/capa/${capaId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !isNaN(capaId) && capaId > 0,
  });

  const { data: actions = [], refetch: refetchActions } = useQuery<any[]>({
    queryKey: ["/api/oi/capa", capaId, "actions"],
    queryFn: async () => {
      const res = await fetch(`/api/oi/capa/${capaId}/actions`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !isNaN(capaId) && capaId > 0,
  });

  const { data: effectivenessReviews = [], refetch: refetchEffectiveness } = useQuery<any[]>({
    queryKey: ["/api/oi/capa", capaId, "effectiveness"],
    queryFn: async () => {
      const res = await fetch(`/api/oi/capa/${capaId}/effectiveness`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !isNaN(capaId) && capaId > 0,
  });

  const refresh = () => { refetch(); refetchActions(); refetchEffectiveness(); };

  async function doTransition(action: string) {
    try {
      await apiRequest("POST", `/api/oi/capa/${capaId}/transition`, { action });
      toast({ title: `CAPA ${CAPA_TRANSITION_LABELS[action] ?? action}` });
      refresh();
    } catch (e: any) {
      const d = await e?.response?.json?.().catch(() => null);
      const msg = d?.message ?? d?.error ?? "Transition failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  }

  if (!isMgr) {
    return <div className="flex items-center justify-center h-64"><AlertCircle className="h-8 w-8 text-red-400 mr-3" /><span className="text-gray-600">Access restricted.</span></div>;
  }
  if (isLoading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-6 w-6 animate-spin text-gray-400" /></div>;
  if (!capa) return <div className="flex items-center justify-center h-64"><AlertCircle className="h-8 w-8 text-red-400 mr-3" /><span className="text-gray-600">CAPA not found.</span></div>;

  const effectiveDue = capa.extendedDueDate ?? capa.dueDate;
  const isFinal = capa.status === 'closed' || capa.status === 'cancelled';

  // Available transitions
  const transitions: string[] = [];
  if (capa.status === 'draft')                  transitions.push('open');
  if (capa.status === 'open')                   transitions.push('start');
  if (capa.status === 'in_progress')            transitions.push('submit');
  if (capa.status === 'pending_verification')   transitions.push('verify');
  if (capa.status === 'effectiveness_review')   { transitions.push('close'); transitions.push('reopen'); }
  if (!isFinal && isSm)                         transitions.push('cancel');

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Back + header */}
      <div>
        <Link href="/oi/capa">
          <Button variant="ghost" size="sm" className="gap-2 mb-3 -ml-2">
            <ArrowLeft className="h-4 w-4" /> Back to CAPA Register
          </Button>
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg"><ShieldCheck className="h-6 w-6 text-indigo-600" /></div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-indigo-700">{capa.capaNumber}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CAPA_STATUS_COLORS[capa.status]}`}>
                  {CAPA_STATUS_LABELS[capa.status]}
                </span>
                {capa.isOverdue && (
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />Overdue
                  </span>
                )}
                {capa.reOpenCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-medium">
                    Re-opened ×{capa.reOpenCount}
                  </span>
                )}
              </div>
              <p className="text-xl font-semibold text-gray-900 mt-1">{capa.title}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
        <div className="mt-3">
          <StatusPipeline status={capa.status} />
        </div>
      </div>

      {/* Meta info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Type",     value: <span className={`px-2 py-0.5 rounded text-xs font-medium ${CAPA_TYPE_COLORS[capa.capaType]}`}>{CAPA_TYPE_LABELS[capa.capaType]}</span> },
          { label: "Priority", value: <span className={`px-2 py-0.5 rounded text-xs font-medium ${CAPA_PRIORITY_COLORS[capa.priority]}`}>{CAPA_PRIORITY_LABELS[capa.priority]}</span> },
          { label: "Due Date", value: effectiveDue ? <span className={capa.isOverdue ? "text-red-700 font-medium" : "text-gray-800"}>{fmtDate(effectiveDue)}{capa.extendedDueDate && " (extended)"}</span> : "—" },
          { label: "Created",  value: <span className="text-gray-700">{fmtDate(capa.createdAt)}</span> },
          { label: "Issue",    value: capa.issueCode ? <Link href={`/oi/issues/${capa.issueId}`}><span className="font-mono text-blue-600 hover:underline cursor-pointer">{capa.issueCode}</span></Link> : "—" },
          { label: "Assignee", value: capa.assignedToName ?? "—" },
          { label: "Verifier", value: capa.verifierName ?? "—" },
          { label: "Approver", value: capa.approverName ?? "—" },
        ].map(f => (
          <div key={f.label} className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">{f.label}</p>
            <div className="text-sm font-medium">{f.value}</div>
          </div>
        ))}
      </div>

      {/* Description */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Description</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{capa.description}</p>
          {capa.rootCauseRef && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-gray-500 mb-1">Root Cause Reference (from RCA)</p>
              <p className="text-sm text-gray-700">{capa.rootCauseRef}</p>
            </div>
          )}
          {capa.rcaRootCauseCode && (
            <div className="mt-2">
              <p className="text-xs text-gray-500">RCA Root Cause</p>
              <p className="text-sm font-medium text-gray-800">{capa.rcaRootCauseCode}: {capa.rcaRootCauseLabel}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transition buttons */}
      {!isFinal && transitions.length > 0 && (
        <Card className="border-indigo-200 bg-indigo-50">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold text-indigo-700 mb-3 uppercase tracking-wide">Available Actions</p>
            <div className="flex flex-wrap gap-2">
              {transitions.filter(t => t !== 'cancel').map(t => (
                <Button key={t} size="sm" variant="default" className="bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => doTransition(t)}>
                  {CAPA_TRANSITION_LABELS[t] ?? t}
                </Button>
              ))}
              {capa.status === 'effectiveness_review' && isSm && (
                <Button size="sm" variant="outline" className="border-purple-400 text-purple-700"
                  onClick={() => setEffectivenessOpen(true)}>
                  <Activity className="h-3.5 w-3.5 mr-1.5" />Record Effectiveness Review
                </Button>
              )}
              {transitions.includes('cancel') && (
                <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />Cancel CAPA
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancelled note */}
      {capa.status === 'cancelled' && capa.cancellationReason && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold text-red-700 mb-1">Cancellation Reason</p>
            <p className="text-sm text-gray-700">{capa.cancellationReason}</p>
            {capa.cancelledAt && <p className="text-xs text-gray-400 mt-1">{fmtDateTime(capa.cancelledAt)}</p>}
          </CardContent>
        </Card>
      )}

      {/* Action Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-indigo-500" />
              Action Items
              <span className="ml-1 text-sm font-normal text-gray-500">
                ({capa.actionSummary?.completed ?? 0}/{capa.actionSummary?.total ?? 0} completed)
              </span>
            </CardTitle>
            {isMgr && ['draft','open','in_progress'].includes(capa.status) && (
              <Button size="sm" variant="outline" onClick={() => setAddActionOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Add Action
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {actions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No action items yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["#","Description","Assigned","Status","Verification","Due","Actions"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {actions.map((a: any) => (
                    <ActionRow key={a.id} action={a} capa={capa} onRefresh={refresh} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Effectiveness Reviews */}
      {(capa.status === 'effectiveness_review' || capa.status === 'closed' || effectivenessReviews.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-500" />
                Effectiveness Reviews
                <span className="text-sm font-normal text-gray-500">({effectivenessReviews.length})</span>
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setShowAllEffectiveness(p => !p)}>
                {showAllEffectiveness ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          {(showAllEffectiveness || effectivenessReviews.length === 0) && (
            <CardContent>
              {effectivenessReviews.length === 0 ? (
                <p className="text-sm text-gray-400">No effectiveness reviews recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {effectivenessReviews.map((r: any) => (
                    <div key={r.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-500">Cycle {r.reviewCycle}</span>
                          <EffectivenessScoreStars score={r.effectivenessScore} />
                        </div>
                        <div className="flex items-center gap-2">
                          {r.isEffective
                            ? <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-semibold flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Effective</span>
                            : <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-semibold flex items-center gap-1"><XCircle className="h-3 w-3" />Ineffective</span>
                          }
                          {r.recurrenceObserved && (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-semibold flex items-center gap-1">
                              <RotateCcw className="h-3 w-3" />Recurrence
                            </span>
                          )}
                        </div>
                      </div>
                      {r.evidenceNotes && <p className="text-sm text-gray-700 mb-1"><span className="font-medium text-gray-500">Evidence: </span>{r.evidenceNotes}</p>}
                      {r.recommendation && <p className="text-sm text-gray-700"><span className="font-medium text-gray-500">Recommendation: </span>{r.recommendation}</p>}
                      <p className="text-xs text-gray-400 mt-2">{fmtDateTime(r.reviewedAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
          {!showAllEffectiveness && effectivenessReviews.length > 0 && (
            <CardContent className="pt-0">
              {/* show latest review only */}
              {(() => {
                const latest = effectivenessReviews[effectivenessReviews.length - 1];
                return (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Latest (Cycle {latest.reviewCycle})</span>
                        <EffectivenessScoreStars score={latest.effectivenessScore} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {latest.isEffective
                        ? <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-semibold">Effective</span>
                        : <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-semibold">Ineffective</span>
                      }
                      {latest.recurrenceObserved && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-semibold">Recurrence</span>}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          )}
        </Card>
      )}

      {/* Timestamps timeline */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base text-gray-700">Timeline</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            {[
              { label: "Created",                    ts: capa.createdAt,               by: capa.createdByName },
              { label: "Opened",                     ts: capa.openedAt,                by: null },
              { label: "In Progress",                ts: capa.inProgressAt,            by: null },
              { label: "Pending Verification",       ts: capa.pendingVerificationAt,   by: null },
              { label: "Effectiveness Review",       ts: capa.effectivenessReviewAt,   by: null },
              { label: "Closed",                     ts: capa.closedAt,                by: null },
              { label: "Cancelled",                  ts: capa.cancelledAt,             by: null },
            ].filter(t => t.ts).map(t => (
              <div key={t.label} className="flex items-center gap-3 text-sm">
                <span className="w-36 text-gray-500 shrink-0">{t.label}</span>
                <span className="text-gray-800">{fmtDateTime(t.ts)}</span>
                {t.by && <span className="text-gray-400 text-xs">by {t.by}</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <AddActionDialog
        capaId={capaId} issueId={capa.issueId} capaNumber={capa.capaNumber}
        open={addActionOpen} onClose={() => setAddActionOpen(false)} onSuccess={refresh}
      />
      <EffectivenessDialog
        capaId={capaId} capaNumber={capa.capaNumber}
        open={effectivenessOpen} onClose={() => setEffectivenessOpen(false)} onSuccess={refresh}
      />
      <CancelDialog
        capaId={capaId} capaNumber={capa.capaNumber}
        open={cancelOpen} onClose={() => setCancelOpen(false)} onSuccess={refresh}
      />
    </div>
  );
}
