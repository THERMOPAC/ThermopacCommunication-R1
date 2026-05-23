import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  ArrowLeft, BookOpen, CheckCircle, Clock, AlertCircle, Plus, Trash2,
  FileText, Link2, Users, Eye, ChevronRight, BarChart3, History, MessageSquarePlus, Download, Pencil,
} from "lucide-react";
import { downloadSopPdf } from "@/lib/sop-pdf";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import {
  SOP_STATUS_LABELS, SOP_STATUS_COLORS, SOP_TYPE_LABELS, SOP_TYPE_COLORS,
  SOP_REVISION_STATUS_LABELS, SOP_REVISION_STATUS_COLORS,
  EFFECTIVENESS_SCORE_LABELS, EFFECTIVENESS_SCORE_COLORS,
  LINKED_TYPE_LABELS, SOP_TRANSITION_LABELS,
  SOP_ROLE_LABELS, VALID_SOP_ROLES, SOP_TYPES,
  SUGGESTION_STATUS_LABELS, SUGGESTION_STATUS_COLORS,
} from "./oi-sop-constants";

const MANAGER_ROLES = ["Manager", "Senior Manager", "General Manager", "Superuser"];
const SM_ROLES      = ["Senior Manager", "General Manager", "Superuser"];

function hasRole(role: string, allowed: string[]) { return allowed.includes(role); }

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ sop, onRefresh, onEditOpen }: { sop: any; onRefresh: () => void; onEditOpen: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [retireOpen, setRetireOpen]         = useState(false);
  const [rejectOpen, setRejectOpen]         = useState(false);
  const [retirementReason, setRetirementReason] = useState("");
  const [rejectionReason,  setRejectionReason]  = useState("");

  const isManager = hasRole(user?.role ?? "", MANAGER_ROLES);
  const isSM      = hasRole(user?.role ?? "", SM_ROLES);
  const canEdit   = isManager && sop.status !== "retired";

  // ── Transition mutation ───────────────────────────────────────────────────
  const transitionMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/oi/sop/${sop.id}/transition`, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id] }); toast({ title: "SOP status updated" }); setTransitionOpen(false); onRefresh(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canSubmit   = sop.status === "draft"        && isManager;
  const canApprove  = sop.status === "under_review"  && isSM;
  const canReject   = sop.status === "under_review"  && isSM;
  const canActivate = sop.status === "approved"      && isSM;
  const canRetire   = ["active","approved"].includes(sop.status) && isSM;

  return (
    <div className="space-y-6">
      {/* Status + transition */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Badge className={`text-sm px-3 py-1 ${SOP_STATUS_COLORS[sop.status] ?? ""}`}>
              {SOP_STATUS_LABELS[sop.status] ?? sop.status}
            </Badge>
            <Badge className={`text-xs ${SOP_TYPE_COLORS[sop.sopType] ?? ""}`}>
              {SOP_TYPE_LABELS[sop.sopType] ?? sop.sopType}
            </Badge>
            <span className="text-sm text-gray-500">Rev v{sop.revisionNumber}</span>
            {sop.isReviewOverdue && (
              <Badge className="bg-red-100 text-red-700 text-xs">Review Overdue</Badge>
            )}
            {canEdit && (
              <div className="ml-auto">
                <Button size="sm" variant="outline" className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={onEditOpen}>
                  <Pencil className="h-3.5 w-3.5" /> Edit SOP
                </Button>
              </div>
            )}
          </div>
          <p className="text-gray-700 text-sm leading-relaxed mb-4">{sop.description}</p>

          {/* Transition buttons */}
          <div className="flex flex-wrap gap-2">
            {canSubmit && (
              <Button size="sm" onClick={() => transitionMut.mutate({ action: "submit" })} disabled={transitionMut.isPending}>
                Submit for Review
              </Button>
            )}
            {canApprove && (
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => transitionMut.mutate({ action: "approve" })} disabled={transitionMut.isPending}>
                Approve SOP
              </Button>
            )}
            {canReject && (
              <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="border-red-300 text-red-700">Reject</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Reject SOP</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <Textarea placeholder="Rejection reason (min 10 chars)…" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={4} />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
                      <Button variant="destructive" onClick={() => transitionMut.mutate({ action: "reject", rejectionReason })} disabled={rejectionReason.length < 10 || transitionMut.isPending}>
                        Confirm Reject
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {canActivate && (
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => transitionMut.mutate({ action: "activate" })} disabled={transitionMut.isPending}>
                Activate SOP
              </Button>
            )}
            {canRetire && (
              <Dialog open={retireOpen} onOpenChange={setRetireOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="border-gray-400 text-gray-600">Retire</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Retire SOP — {sop.sopNumber}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <Textarea placeholder="Retirement reason (min 10 chars)…" value={retirementReason} onChange={e => setRetirementReason(e.target.value)} rows={4} />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setRetireOpen(false)}>Cancel</Button>
                      <Button variant="destructive" onClick={() => transitionMut.mutate({ action: "retire", retirementReason })} disabled={retirementReason.length < 10 || transitionMut.isPending}>
                        Confirm Retire
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { label: "SOP Number",         value: sop.sopNumber },
          { label: "Department",         value: sop.department },
          { label: "Accessible To",      value: SOP_ROLE_LABELS[sop.applicableRole] ?? sop.applicableRole ?? "—" },
          { label: "Process Area",       value: sop.processArea },
          { label: "Document Reference", value: sop.documentReference ?? "—" },
          { label: "Owner",              value: sop.ownerName ?? "—" },
          { label: "Approver",           value: sop.approverName ?? "—" },
          { label: "Effective Date",     value: sop.effectiveDate   ? fmtDate(sop.effectiveDate)   : "—" },
          { label: "Review Due",         value: sop.reviewDueDate   ? fmtDate(sop.reviewDueDate)   : "—" },
          { label: "Next Review",        value: sop.nextReviewDate  ? fmtDate(sop.nextReviewDate)  : "—" },
          { label: "Activated At",       value: sop.activatedAt     ? fmtDateTime(sop.activatedAt) : "—" },
          { label: "Created",            value: fmtDate(sop.createdAt) },
          { label: "Revision Number",    value: `v${sop.revisionNumber}` },
        ].map(f => (
          <div key={f.label} className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 font-medium mb-1">{f.label}</p>
            <p className="text-sm font-semibold text-gray-800">{f.value}</p>
          </div>
        ))}
      </div>

      {/* Ack summary */}
      {sop.ackSummary?.total > 0 && (
        <Card className="border-l-4 border-l-orange-400">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Current Revision Acknowledgments (v{sop.revisionNumber})</p>
            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                { label: "Total",        value: sop.ackSummary.total,        cls: "text-gray-800" },
                { label: "Acknowledged", value: sop.ackSummary.acknowledged, cls: "text-green-700" },
                { label: "Pending",      value: sop.ackSummary.pending,      cls: "text-orange-600" },
                { label: "Overdue",      value: sop.ackSummary.overdue,      cls: "text-red-700" },
              ].map(s => (
                <div key={s.label}><p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Revisions Tab ────────────────────────────────────────────────────────────
function RevisionsTab({ sop, onRefresh }: { sop: any; onRefresh: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const isManager = hasRole(user?.role ?? "", MANAGER_ROLES);
  const isSM      = hasRole(user?.role ?? "", SM_ROLES);

  const { data: revisions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/sop", sop.id, "revisions"],
    queryFn: async () => { const r = await fetch(`/api/oi/sop/${sop.id}/revisions`); if (!r.ok) throw new Error("Failed"); return r.json(); },
  });

  const form = useForm({ resolver: zodResolver(z.object({ changeSummary: z.string().min(10), changeRationale: z.string().min(10) })),
    defaultValues: { changeSummary: "", changeRationale: "" } });

  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/oi/sop/${sop.id}/revisions`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "revisions"] }); toast({ title: "Revision created" }); setCreateOpen(false); form.reset(); onRefresh(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submitMut = useMutation({
    mutationFn: (revId: number) => apiRequest("POST", `/api/oi/sop/${sop.id}/revisions/${revId}/submit`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "revisions"] }); toast({ title: "Revision submitted for review" }); onRefresh(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveMut = useMutation({
    mutationFn: (revId: number) => apiRequest("POST", `/api/oi/sop/${sop.id}/revisions/${revId}/approve`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "revisions"] }); toast({ title: "Revision approved" }); onRefresh(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMut = useMutation({
    mutationFn: ({ revId, reason }: { revId: number; reason: string }) => apiRequest("POST", `/api/oi/sop/${sop.id}/revisions/${revId}/reject`, { rejectionReason: reason }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "revisions"] }); toast({ title: "Revision rejected" }); setRejectOpen(null); onRefresh(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canCreateRevision = isManager && ["active","approved"].includes(sop.status) && sop.status !== "retired"
    && !(revisions as any[]).some((r: any) => ["draft","under_review"].includes(r.status));

  return (
    <div className="space-y-4">
      {isManager && canCreateRevision && sop.revisionNumber >= 1 && (
        <div className="flex justify-end">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild><Button size="sm" className="gap-2"><Plus className="h-4 w-4" />New Revision</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Revision — v{sop.revisionNumber + 1}</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(d => createMut.mutate(d))} className="space-y-4">
                  <FormField control={form.control} name="changeSummary" render={({ field }) => (
                    <FormItem><FormLabel>Change Summary *</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="changeRationale" render={({ field }) => (
                    <FormItem><FormLabel>Change Rationale *</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createMut.isPending}>Create</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {isLoading ? <Skeleton className="h-24 w-full" /> : (revisions as any[]).length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No revisions yet. Revisions are created after the SOP is first activated.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(revisions as any[]).map((rev: any) => (
            <Card key={rev.id} className="border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-sm">Revision v{rev.revisionNumber}</span>
                      <Badge className={`text-xs ${SOP_REVISION_STATUS_COLORS[rev.status] ?? ""}`}>
                        {SOP_REVISION_STATUS_LABELS[rev.status] ?? rev.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-600 mb-1"><span className="font-medium">Change:</span> {rev.changeSummary}</p>
                    <p className="text-xs text-gray-600 mb-2"><span className="font-medium">Rationale:</span> {rev.changeRationale}</p>
                    {rev.rejectionReason && <p className="text-xs text-red-600 bg-red-50 p-2 rounded">Rejected: {rev.rejectionReason}</p>}
                    <p className="text-xs text-gray-400 mt-1">Created {fmtDate(rev.createdAt)}{rev.approvedAt ? ` · Approved ${fmtDate(rev.approvedAt)}` : ""}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {rev.status === "draft" && isManager && (
                      <Button size="sm" variant="outline" onClick={() => submitMut.mutate(rev.id)} disabled={submitMut.isPending}>
                        Submit
                      </Button>
                    )}
                    {rev.status === "under_review" && isSM && (
                      <>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => approveMut.mutate(rev.id)} disabled={approveMut.isPending}>
                          Approve
                        </Button>
                        <Dialog open={rejectOpen === rev.id} onOpenChange={o => setRejectOpen(o ? rev.id : null)}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="border-red-300 text-red-600">Reject</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>Reject Revision v{rev.revisionNumber}</DialogTitle></DialogHeader>
                            <Textarea placeholder="Rejection reason (min 10 chars)…" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={4} />
                            <div className="flex justify-end gap-2 mt-3">
                              <Button variant="outline" onClick={() => setRejectOpen(null)}>Cancel</Button>
                              <Button variant="destructive" onClick={() => rejectMut.mutate({ revId: rev.id, reason: rejectionReason })} disabled={rejectionReason.length < 10 || rejectMut.isPending}>
                                Confirm
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Linkages Tab ─────────────────────────────────────────────────────────────
function LinkagesTab({ sop }: { sop: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const isManager = hasRole(user?.role ?? "", MANAGER_ROLES);

  const { data: linkages = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/sop", sop.id, "linkages"],
    queryFn: async () => { const r = await fetch(`/api/oi/sop/${sop.id}/linkages`); if (!r.ok) throw new Error("Failed"); return r.json(); },
  });

  const addSchema = z.object({ linkedType: z.enum(["issue","rca","capa"]), linkedId: z.number().int().positive(), linkNote: z.string().min(3) });
  const form = useForm<z.infer<typeof addSchema>>({ resolver: zodResolver(addSchema), defaultValues: { linkedType: "issue", linkedId: 0, linkNote: "" } });

  const addMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/oi/sop/${sop.id}/linkages`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "linkages"] }); toast({ title: "Linkage added" }); setOpen(false); form.reset(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/oi/sop/${sop.id}/linkages/${id}`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "linkages"] }); toast({ title: "Linkage removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {isManager && sop.status !== "retired" && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" className="gap-2"><Link2 className="h-4 w-4" />Add Linkage</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Linkage</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(d => addMut.mutate({ ...d, linkedId: Number(d.linkedId) }))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="linkedType" render={({ field }) => (
                      <FormItem><FormLabel>Entity Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="issue">Issue</SelectItem>
                            <SelectItem value="rca">RCA</SelectItem>
                            <SelectItem value="capa">CAPA</SelectItem>
                          </SelectContent>
                        </Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="linkedId" render={({ field }) => (
                      <FormItem><FormLabel>ID #</FormLabel><FormControl><Input type="number" min="1" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="linkNote" render={({ field }) => (
                    <FormItem><FormLabel>Link Note *</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={addMut.isPending}>Add Linkage</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {isLoading ? <Skeleton className="h-24 w-full" /> : (linkages as any[]).length === 0 ? (
        <div className="text-center py-10 text-gray-400"><Link2 className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No linkages yet.</p></div>
      ) : (
        <div className="space-y-2">
          {(linkages as any[]).map((l: any) => (
            <div key={l.id} className="flex items-center justify-between p-3 border rounded-lg bg-white">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="text-xs bg-blue-50 text-blue-700">{LINKED_TYPE_LABELS[l.linkedType] ?? l.linkedType} #{l.linkedId}</Badge>
                  <span className="text-sm text-gray-700">{l.linkNote}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Linked {fmtDate(l.createdAt)}</p>
              </div>
              {isManager && (
                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => deleteMut.mutate(l.id)} disabled={deleteMut.isPending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Acknowledgments Tab ──────────────────────────────────────────────────────
function AcknowledgmentsTab({ sop }: { sop: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [assignOpen, setAssignOpen] = useState(false);
  const [userIdsInput, setUserIdsInput] = useState("");
  const isManager = hasRole(user?.role ?? "", MANAGER_ROLES);

  const { data: acks = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/sop", sop.id, "acknowledgments"],
    queryFn: async () => { const r = await fetch(`/api/oi/sop/${sop.id}/acknowledgments`); if (!r.ok) throw new Error("Failed"); return r.json(); },
  });

  const assignMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/oi/sop/${sop.id}/acknowledgments`, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "acknowledgments"] }); toast({ title: "Acknowledgments assigned" }); setAssignOpen(false); setUserIdsInput(""); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const ackMut = useMutation({
    mutationFn: (ackId: number) => apiRequest("POST", `/api/oi/sop/${sop.id}/acknowledgments/${ackId}/acknowledge`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "acknowledgments"] }); toast({ title: "Acknowledged" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const withdrawMut = useMutation({
    mutationFn: (ackId: number) => apiRequest("DELETE", `/api/oi/sop/${sop.id}/acknowledgments/${ackId}`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "acknowledgments"] }); toast({ title: "Assignment withdrawn" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleAssign = () => {
    const ids = userIdsInput.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (!ids.length) return;
    assignMut.mutate({ userIds: ids });
  };

  const canAssign = sop.status === "active" && sop.revisionNumber >= 1 && !sop.pendingRevision;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Showing acknowledgments for <span className="font-semibold">revision v{sop.revisionNumber}</span> (current). Prior-revision acks are historical only.</p>
        {isManager && canAssign && (
          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogTrigger asChild><Button size="sm" className="gap-2"><Users className="h-4 w-4" />Assign</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Assign Acknowledgment</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">User IDs (comma-separated)</label>
                  <Input className="mt-1" placeholder="e.g. 3,7,12" value={userIdsInput} onChange={e => setUserIdsInput(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Enter the numeric user IDs of the users who must acknowledge this SOP.</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
                  <Button onClick={handleAssign} disabled={assignMut.isPending}>Assign</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? <Skeleton className="h-24 w-full" /> : (acks as any[]).length === 0 ? (
        <div className="text-center py-10 text-gray-400"><Users className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No acknowledgments assigned.</p></div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">User</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Rev</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Due</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Acknowledged</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-600"></th>
            </tr></thead>
            <tbody className="divide-y">
              {(acks as any[]).map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{a.userName ?? `User #${a.userId}`}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">v{a.revisionNumber}</td>
                  <td className="px-4 py-2 text-xs">{a.dueDate ? fmtDate(a.dueDate) : "—"}</td>
                  <td className="px-4 py-2">
                    {a.acknowledgedAt ? (
                      <Badge className="text-xs bg-green-100 text-green-700">Acknowledged</Badge>
                    ) : a.isOverdue ? (
                      <Badge className="text-xs bg-red-100 text-red-700">Overdue</Badge>
                    ) : (
                      <Badge className="text-xs bg-yellow-100 text-yellow-800">Pending</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{a.acknowledgedAt ? fmtDateTime(a.acknowledgedAt) : "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {!a.acknowledgedAt && (a.userId === user?.id || user?.role === "Superuser") && (
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => ackMut.mutate(a.id)} disabled={ackMut.isPending}>
                          Acknowledge
                        </Button>
                      )}
                      {!a.acknowledgedAt && isManager && (
                        <Button size="sm" variant="ghost" className="text-xs h-7 text-red-500" onClick={() => withdrawMut.mutate(a.id)} disabled={withdrawMut.isPending}>
                          Withdraw
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
    </div>
  );
}

// ─── Effectiveness Tab ────────────────────────────────────────────────────────
function EffectivenessTab({ sop }: { sop: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const isSM = hasRole(user?.role ?? "", SM_ROLES);

  const { data: reviews = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/sop", sop.id, "effectiveness"],
    queryFn: async () => { const r = await fetch(`/api/oi/sop/${sop.id}/effectiveness`); if (!r.ok) throw new Error("Failed"); return r.json(); },
  });

  const reviewSchema = z.object({
    effectivenessScore: z.number().int().min(1).max(5),
    isEffective:        z.boolean(),
    deviationObserved:  z.boolean(),
    requiresRevision:   z.boolean(),
    evidenceNotes:      z.string().optional(),
    recommendation:     z.string().optional(),
  });

  const form = useForm<z.infer<typeof reviewSchema>>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { effectivenessScore: 3, isEffective: true, deviationObserved: false, requiresRevision: false, evidenceNotes: "", recommendation: "" },
  });

  const recordMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/oi/sop/${sop.id}/effectiveness`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "effectiveness"] }); toast({ title: "Effectiveness review recorded" }); setOpen(false); form.reset(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {isSM && sop.status === "active" && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" className="gap-2"><BarChart3 className="h-4 w-4" />Record Review</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Record Effectiveness Review</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(d => recordMut.mutate(d))} className="space-y-4">
                  <FormField control={form.control} name="effectivenessScore" render={({ field }) => (
                    <FormItem><FormLabel>Score (1–5) *</FormLabel>
                      <Select value={String(field.value)} onValueChange={v => field.onChange(parseInt(v))}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n} — {EFFECTIVENESS_SCORE_LABELS[n]}</SelectItem>)}</SelectContent>
                      </Select><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { name: "isEffective" as const,       label: "Effective?" },
                      { name: "deviationObserved" as const, label: "Deviation?" },
                      { name: "requiresRevision" as const,  label: "Needs Revision?" },
                    ].map(f => (
                      <FormField key={f.name} control={form.control} name={f.name} render={({ field }) => (
                        <FormItem><FormLabel>{f.label}</FormLabel>
                          <Select value={field.value ? "true" : "false"} onValueChange={v => field.onChange(v === "true")}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent>
                          </Select><FormMessage /></FormItem>
                      )} />
                    ))}
                  </div>
                  <FormField control={form.control} name="evidenceNotes" render={({ field }) => (
                    <FormItem><FormLabel>Evidence Notes</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="recommendation" render={({ field }) => (
                    <FormItem><FormLabel>Recommendation</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl></FormItem>
                  )} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={recordMut.isPending}>Record</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {isLoading ? <Skeleton className="h-24 w-full" /> : (reviews as any[]).length === 0 ? (
        <div className="text-center py-10 text-gray-400"><BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No effectiveness reviews yet.</p></div>
      ) : (
        <div className="space-y-3">
          {(reviews as any[]).map((r: any) => (
            <Card key={r.id} className="border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">Cycle {r.reviewCycle}</span>
                      <Badge className={`text-xs ${EFFECTIVENESS_SCORE_COLORS[r.effectivenessScore] ?? ""}`}>
                        {r.effectivenessScore}/5 — {EFFECTIVENESS_SCORE_LABELS[r.effectivenessScore]}
                      </Badge>
                      {r.isEffective ? <Badge className="text-xs bg-green-100 text-green-700">Effective</Badge> : <Badge className="text-xs bg-red-100 text-red-700">Ineffective</Badge>}
                      {r.deviationObserved && <Badge className="text-xs bg-orange-100 text-orange-700">Deviation</Badge>}
                      {r.requiresRevision  && <Badge className="text-xs bg-purple-100 text-purple-700">Needs Revision</Badge>}
                    </div>
                    <p className="text-xs text-gray-500">Reviewed by {r.reviewerName ?? "—"} on {fmtDate(r.reviewedAt)}</p>
                    {r.evidenceNotes  && <p className="text-xs text-gray-600 mt-2"><span className="font-medium">Evidence:</span> {r.evidenceNotes}</p>}
                    {r.recommendation && <p className="text-xs text-gray-600 mt-1"><span className="font-medium">Recommendation:</span> {r.recommendation}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Lessons Learned Tab ──────────────────────────────────────────────────────
function SopLinkedLessonsTab({ sopId }: { sopId: number }) {
  const { data: lessons = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/lessons/by-entity", "sop", sopId],
    queryFn: async () => { const r = await fetch(`/api/oi/lessons/by-entity/sop/${sopId}`); if (!r.ok) return []; return r.json(); },
  });
  if (isLoading) return <div className="text-sm text-gray-400 py-4">Loading…</div>;
  if (!lessons.length) return (
    <div className="text-sm text-gray-400 py-6 text-center">No lessons linked to this SOP yet.<br /><a href="/oi/lessons" className="text-blue-600 hover:underline">Go to Lessons Learned Register →</a></div>
  );
  return (
    <div className="space-y-2">
      {lessons.map((l: any) => (
        <div key={l.id} className="flex items-start justify-between gap-2 p-3 rounded border bg-white hover:bg-gray-50">
          <div className="min-w-0 flex-1">
            <a href={`/oi/lessons/${l.id}`} className="font-mono text-blue-600 hover:underline text-sm font-medium">{l.lesson_number}</a>
            <p className="text-sm text-gray-700 truncate">{l.title}</p>
            <p className="text-xs text-gray-400">{l.category} · {l.lesson_type} · {l.status}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Enforcement Tab ──────────────────────────────────────────────────────────
function SopEnforcementTab({ sop }: { sop: any }) {
  const { data: controls, isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/sop", sop.id, "enforcement-controls"],
    queryFn: async () => {
      const r = await fetch(`/api/oi/sop/${sop.id}/enforcement-controls`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const CTRL_STATUS_COLORS: Record<string, string> = {
    draft:     "bg-gray-100 text-gray-700",
    active:    "bg-green-100 text-green-800",
    suspended: "bg-yellow-100 text-yellow-800",
    retired:   "bg-red-100 text-red-700",
  };
  const CTRL_STATUS_LABELS: Record<string, string> = {
    draft: "Draft", active: "Active", suspended: "Suspended", retired: "Retired",
  };
  const LEVEL_COLORS: Record<string, string> = {
    advisory: "bg-sky-100 text-sky-800", mandatory: "bg-red-100 text-red-800",
  };

  if (isLoading) return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">{controls?.length ?? 0} enforcement control{controls?.length !== 1 ? "s" : ""} linked to this SOP</p>
        <a href="/oi/enforcement" className="text-xs text-blue-600 hover:underline">Go to Enforcement Register →</a>
      </div>

      {(!controls || controls.length === 0) && (
        <div className="text-center py-12 text-gray-400">
          <div className="h-8 w-8 mx-auto mb-2 opacity-30 text-2xl">🛡</div>
          <p className="text-sm">No enforcement controls linked to this SOP</p>
          <a href="/oi/enforcement" className="text-xs text-blue-600 hover:underline mt-1 block">Create a control in the Enforcement Register</a>
        </div>
      )}

      {controls?.map(ctrl => (
        <a key={ctrl.id} href={`/oi/enforcement/${ctrl.id}`} className="block">
          <div className="border rounded-lg p-3 hover:shadow-md transition-shadow border-l-4 border-l-blue-300">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-gray-500">{ctrl.controlNumber}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CTRL_STATUS_COLORS[ctrl.status] ?? "bg-gray-100 text-gray-700"}`}>{CTRL_STATUS_LABELS[ctrl.status] ?? ctrl.status}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${LEVEL_COLORS[ctrl.enforcementLevel] ?? "bg-gray-100 text-gray-700"}`}>{ctrl.enforcementLevel === "mandatory" ? "Mandatory" : "Advisory"}</span>
                </div>
                <p className="font-medium text-gray-900 text-sm mt-1 truncate">{ctrl.title}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                  <span>{ctrl.erpEntityType?.replace(/_/g, " ")}</span>
                  <span>•</span>
                  <span>{ctrl.controlType?.replace(/_/g, " ")}</span>
                  <span>•</span>
                  <span>{ctrl.department}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {(ctrl.openHoldCount ?? 0) > 0 && (
                  <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">{ctrl.openHoldCount} hold{ctrl.openHoldCount > 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── Sections Tab ─────────────────────────────────────────────────────────────
function SectionsTab({ sop }: { sop: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [addOpen, setAddOpen]         = useState(false);
  const [editSection, setEditSection] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const isManager = hasRole(user?.role ?? "", MANAGER_ROLES);
  const canEdit   = isManager && sop.status !== "retired";

  const { data: sections = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/sop", sop.id, "sections"],
    queryFn: async () => {
      const r = await fetch(`/api/oi/sop/${sop.id}/sections`);
      if (!r.ok) throw new Error("Failed to load sections");
      return r.json();
    },
  });

  const addSchema = z.object({
    sectionNo:      z.string().min(1, "Required").max(20),
    sectionTitle:   z.string().min(3, "Min 3 chars").max(300),
    sectionContent: z.string().min(1, "Required").max(50000),
  });

  const addForm = useForm<z.infer<typeof addSchema>>({
    resolver: zodResolver(addSchema),
    defaultValues: { sectionNo: "", sectionTitle: "", sectionContent: "" },
  });

  const editSchema = z.object({
    sectionTitle:   z.string().min(3).max(300),
    sectionContent: z.string().min(0).max(50000),
  });

  const editForm = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: { sectionTitle: "", sectionContent: "" },
  });

  const addMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/oi/sop/${sop.id}/sections`, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "sections"] });
      toast({ title: "Section added" });
      setAddOpen(false);
      addForm.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editMut = useMutation({
    mutationFn: ({ id, ...d }: any) => apiRequest("PATCH", `/api/oi/sop/${sop.id}/sections/${id}`, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "sections"] });
      toast({ title: "Section updated" });
      setEditSection(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/oi/sop/${sop.id}/sections/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "sections"] });
      toast({ title: "Section removed" });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (s: any) => {
    editForm.reset({ sectionTitle: s.sectionTitle, sectionContent: s.sectionContent });
    setEditSection(s);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {sections.length} section{sections.length !== 1 ? "s" : ""} — structured content of this SOP
        </p>
        {canEdit && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Add Section</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Add SOP Section</DialogTitle></DialogHeader>
              <Form {...addForm}>
                <form onSubmit={addForm.handleSubmit(d => addMut.mutate(d))} className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <FormField control={addForm.control} name="sectionNo" render={({ field }) => (
                      <FormItem><FormLabel>Section No. *</FormLabel>
                        <FormControl><Input placeholder="e.g. 1.0" {...field} /></FormControl>
                        <FormMessage /></FormItem>
                    )} />
                    <div className="col-span-3">
                      <FormField control={addForm.control} name="sectionTitle" render={({ field }) => (
                        <FormItem><FormLabel>Section Title *</FormLabel>
                          <FormControl><Input placeholder="e.g. Work Order Release" {...field} /></FormControl>
                          <FormMessage /></FormItem>
                      )} />
                    </div>
                  </div>
                  <FormField control={addForm.control} name="sectionContent" render={({ field }) => (
                    <FormItem><FormLabel>Section Content *</FormLabel>
                      <FormControl><Textarea rows={10} placeholder="Enter the full section content — procedures, steps, responsibilities, references…" {...field} /></FormControl>
                      <FormMessage /></FormItem>
                  )} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={addMut.isPending}>Add Section</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : sections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No sections yet</p>
          <p className="text-xs mt-1">
            {canEdit ? "Use \u201cAdd Section\u201d to build out this SOP\u2019s content." : "This SOP has no sections defined yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(sections as any[]).map((s: any) => (
            <Card key={s.id} className="border border-gray-200">
              <CardContent className="p-0">
                <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
                  <div className="flex items-baseline gap-3 min-w-0">
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded shrink-0">
                      {s.sectionNo}
                    </span>
                    <h3 className="font-semibold text-gray-900 text-sm">{s.sectionTitle}</h3>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                        onClick={() => openEdit(s)}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                        onClick={() => setDeleteTarget(s)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="px-4 pb-4">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border-t pt-2 mt-1">
                    {s.sectionContent || <span className="text-gray-400 italic">No content entered.</span>}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Section Dialog */}
      <Dialog open={!!editSection} onOpenChange={o => { if (!o) setEditSection(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Section {editSection?.sectionNo} — {editSection?.sectionTitle}</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(d => editMut.mutate({ id: editSection.id, ...d }))} className="space-y-4">
              <FormField control={editForm.control} name="sectionTitle" render={({ field }) => (
                <FormItem><FormLabel>Section Title *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage /></FormItem>
              )} />
              <FormField control={editForm.control} name="sectionContent" render={({ field }) => (
                <FormItem><FormLabel>Section Content *</FormLabel>
                  <FormControl><Textarea rows={12} {...field} /></FormControl>
                  <FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditSection(null)}>Cancel</Button>
                <Button type="submit" disabled={editMut.isPending}>Save Changes</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Confirm Remove Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove Section?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">
            This will soft-remove section <span className="font-semibold">{deleteTarget?.sectionNo} — {deleteTarget?.sectionTitle}</span>.
            The section will no longer appear in the SOP but is retained for audit history.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}>
              Remove Section
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Suggestions Tab ──────────────────────────────────────────────────────────
function SuggestionsTab({ sop }: { sop: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const isSM = hasRole(user?.role ?? "", SM_ROLES);

  const { data: suggestions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/sop", sop.id, "suggestions"],
    queryFn: async () => {
      if (!isSM) return [];
      const r = await fetch(`/api/oi/sop/${sop.id}/suggestions`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isSM,
  });

  const submitSchema = z.object({
    suggestedChange: z.string().min(20, "Min 20 chars").max(5000),
    rationale:       z.string().min(10, "Min 10 chars").max(2000),
  });

  const form = useForm<z.infer<typeof submitSchema>>({
    resolver: zodResolver(submitSchema),
    defaultValues: { suggestedChange: "", rationale: "" },
  });

  const submitMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", `/api/oi/sop/${sop.id}/suggestions`, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "suggestions"] });
      toast({ title: "Suggestion submitted" });
      setSubmitOpen(false);
      form.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: string; notes: string }) =>
      apiRequest("PATCH", `/api/oi/sop/${sop.id}/suggestions/${id}`, { status, reviewNotes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id, "suggestions"] });
      toast({ title: "Suggestion reviewed" });
      setReviewOpen(null);
      setReviewNotes("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canSubmit = sop.status === "active";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Suggest improvements to this SOP. Suggestions are reviewed by SM+ — they never automatically change the SOP content.
        </p>
        {canSubmit && (
          <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><MessageSquarePlus className="h-4 w-4" />Suggest Change</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Submit Revision Suggestion</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(d => submitMut.mutate(d))} className="space-y-4">
                  <FormField control={form.control} name="suggestedChange" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Suggested Change *</FormLabel>
                      <FormControl><Textarea rows={4} placeholder="Describe the specific change you are suggesting (min 20 chars)…" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="rationale" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rationale *</FormLabel>
                      <FormControl><Textarea rows={3} placeholder="Why is this change needed? (min 10 chars)…" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                    This suggestion will be reviewed by a Senior Manager. It will NOT automatically modify the SOP.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={submitMut.isPending}>Submit Suggestion</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!isSM ? (
        <div className="text-center py-10 text-gray-400">
          <MessageSquarePlus className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">You can submit suggestions above. Only SM+ can see the full suggestion list.</p>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (suggestions as any[]).length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <MessageSquarePlus className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No suggestions submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(suggestions as any[]).map((s: any) => (
            <Card key={s.id} className="border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="font-semibold text-sm">Suggestion #{s.id}</span>
                      <Badge className={`text-xs ${SUGGESTION_STATUS_COLORS[s.status] ?? "bg-gray-100"}`}>
                        {SUGGESTION_STATUS_LABELS[s.status] ?? s.status}
                      </Badge>
                      <span className="text-xs text-gray-400">{fmtDateTime(s.suggestedAt)}</span>
                    </div>
                    <p className="text-xs font-medium text-gray-700 mb-1">Suggested Change:</p>
                    <p className="text-sm text-gray-800 mb-2 whitespace-pre-wrap">{s.suggestedChange}</p>
                    <p className="text-xs font-medium text-gray-700 mb-1">Rationale:</p>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap">{s.rationale}</p>
                    {s.reviewNotes && (
                      <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded mt-2">
                        <span className="font-medium">Review notes:</span> {s.reviewNotes}
                      </p>
                    )}
                  </div>
                  {s.status === "pending" && isSM && (
                    <div className="shrink-0">
                      <Dialog open={reviewOpen === s.id} onOpenChange={o => { setReviewOpen(o ? s.id : null); if (!o) setReviewNotes(""); }}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">Review</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Review Suggestion #{s.id}</DialogTitle></DialogHeader>
                          <div className="space-y-3">
                            <div className="bg-gray-50 rounded p-3 text-xs text-gray-700 max-h-32 overflow-y-auto">{s.suggestedChange}</div>
                            <div>
                              <label className="text-sm font-medium">Review Notes (optional)</label>
                              <Textarea className="mt-1" rows={3} placeholder="Add notes for the submitter…" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} />
                            </div>
                            <div className="flex gap-2 justify-end flex-wrap">
                              <Button variant="outline" onClick={() => { setReviewOpen(null); setReviewNotes(""); }}>Cancel</Button>
                              <Button variant="outline" className="text-gray-600" onClick={() => reviewMut.mutate({ id: s.id, status: "deferred", notes: reviewNotes })} disabled={reviewMut.isPending}>Defer</Button>
                              <Button variant="outline" className="text-red-600 border-red-300" onClick={() => reviewMut.mutate({ id: s.id, status: "rejected", notes: reviewNotes })} disabled={reviewMut.isPending}>Reject</Button>
                              <Button className="bg-green-600 hover:bg-green-700" onClick={() => reviewMut.mutate({ id: s.id, status: "accepted", notes: reviewNotes })} disabled={reviewMut.isPending}>Accept</Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────
function AuditLogTab({ sop }: { sop: any }) {
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/sop", sop.id, "audit-log"],
    queryFn: async () => { const r = await fetch(`/api/oi/sop/${sop.id}/audit-log`); if (!r.ok) throw new Error("Failed"); return r.json(); },
  });

  return (
    <div className="space-y-2">
      {isLoading ? <Skeleton className="h-24 w-full" /> : (logs as any[]).length === 0 ? (
        <div className="text-center py-10 text-gray-400"><History className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No audit events yet.</p></div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Timestamp</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Action</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Actor</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Field</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Context</th>
            </tr></thead>
            <tbody className="divide-y">
              {(logs as any[]).map((l: any) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                  <td className="px-4 py-2 font-mono text-blue-700">{l.action}</td>
                  <td className="px-4 py-2">{l.actorName} <span className="text-gray-400">({l.actorRole})</span></td>
                  <td className="px-4 py-2 text-gray-500">{l.fieldName ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-500 max-w-xs truncate">{l.context ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Edit SOP Schema (shared) ──────────────────────────────────────────────────
const editSopSchema = z.object({
  title:             z.string().min(5, "Min 5 chars").max(300),
  description:       z.string().min(10, "Min 10 chars"),
  sopType:           z.string().min(1),
  department:        z.string().min(1),
  applicableRole:    z.string().min(1),
  processArea:       z.string().min(2, "Min 2 chars").max(200),
  documentReference: z.string().max(200).optional(),
  ownerId:           z.string().optional(),
  approverId:        z.string().optional(),
  effectiveDate:     z.string().optional(),
  reviewDueDate:     z.string().optional(),
  nextReviewDate:    z.string().optional(),
});

// ─── Main Detail Page ─────────────────────────────────────────────────────────
export default function OiSopDetail() {
  const { sopId } = useParams<{ sopId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [sopEditOpen, setSopEditOpen] = useState(false);

  const isSM      = hasRole(user?.role ?? "", SM_ROLES);
  const isManager = hasRole(user?.role ?? "", MANAGER_ROLES);

  const { data: sop, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/oi/sop", parseInt(sopId)],
    queryFn: async () => { const r = await fetch(`/api/oi/sop/${sopId}`); if (!r.ok) throw new Error("SOP not found"); return r.json(); },
    enabled: !!sopId,
  });
  const { data: users = [] }       = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { data: departments = [] } = useQuery<any[]>({ queryKey: ["/api/departments"] });

  const editForm = useForm<z.infer<typeof editSopSchema>>({
    resolver: zodResolver(editSopSchema),
    defaultValues: { title: "", description: "", sopType: "procedure", department: "", applicableRole: "Employee", processArea: "", documentReference: "", ownerId: "", approverId: "", effectiveDate: "", reviewDueDate: "", nextReviewDate: "" },
  });

  const editMut = useMutation({
    mutationFn: (vals: z.infer<typeof editSopSchema>) => {
      const body: any = {
        title: vals.title, description: vals.description, sopType: vals.sopType,
        department: vals.department, applicableRole: vals.applicableRole,
        processArea: vals.processArea,
        documentReference: vals.documentReference || null,
        ownerId:    (vals.ownerId    && vals.ownerId    !== "__none__") ? parseInt(vals.ownerId)    : null,
        approverId: (vals.approverId && vals.approverId !== "__none__") ? parseInt(vals.approverId) : null,
        ...(isSM && {
          effectiveDate:  vals.effectiveDate  ? new Date(vals.effectiveDate).toISOString()  : null,
          reviewDueDate:  vals.reviewDueDate  ? new Date(vals.reviewDueDate).toISOString()  : null,
          nextReviewDate: vals.nextReviewDate ? new Date(vals.nextReviewDate).toISOString() : null,
        }),
      };
      return apiRequest("PATCH", `/api/oi/sop/${sop.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oi/sop", sop.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/oi/sop"] });
      toast({ title: "SOP updated" });
      setSopEditOpen(false);
      refetch();
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const openSopEdit = () => {
    if (!sop) return;
    editForm.reset({
      title:             sop.title ?? "",
      description:       sop.description ?? "",
      sopType:           sop.sopType ?? "procedure",
      department:        sop.department ?? "",
      applicableRole:    sop.applicableRole ?? "Employee",
      processArea:       sop.processArea ?? "",
      documentReference: sop.documentReference ?? "",
      ownerId:           sop.ownerId    ? String(sop.ownerId)    : "",
      approverId:        sop.approverId ? String(sop.approverId) : "",
      effectiveDate:     sop.effectiveDate  ? sop.effectiveDate.slice(0, 10)  : "",
      reviewDueDate:     sop.reviewDueDate  ? sop.reviewDueDate.slice(0, 10)  : "",
      nextReviewDate:    sop.nextReviewDate ? sop.nextReviewDate.slice(0, 10) : "",
    });
    setSopEditOpen(true);
  };

  const handleRefresh = () => { refetch(); setRefreshKey(k => k + 1); };
  const canEdit = isManager && sop?.status !== "retired";

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!sop) return (
    <div className="p-6 text-center">
      <p className="text-gray-500">SOP not found.</p>
      <Link href="/oi/sop"><Button variant="outline" className="mt-4">Back to Register</Button></Link>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/oi/sop">
          <Button variant="ghost" size="sm" className="gap-1"><ArrowLeft className="h-4 w-4" />Register</Button>
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-400" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="p-2 bg-blue-100 rounded-lg shrink-0"><BookOpen className="h-5 w-5 text-blue-700" /></div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{sop.sopNumber}</h1>
            <p className="text-sm text-gray-500 truncate">{sop.title}</p>
          </div>
        </div>
        {canEdit && (
          <Button variant="default" size="sm" className="gap-1.5 shrink-0 bg-blue-700 hover:bg-blue-800" onClick={openSopEdit}>
            <Pencil className="h-4 w-4" /> Edit SOP
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={async () => {
            try { await downloadSopPdf(sop); }
            catch { toast({ title: "Download failed", variant: "destructive" }); }
          }}
        >
          <Download className="h-4 w-4" /> Download PDF
        </Button>
      </div>

      {/* ── Edit SOP Dialog (page-level, works from any tab) ───────────────── */}
      <Dialog open={sopEditOpen} onOpenChange={setSopEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-blue-600" /> Edit SOP — {sop.sopNumber}
            </DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(v => editMut.mutate(v))} className="space-y-4">
              <FormField control={editForm.control} name="title" render={({ field }) => (
                <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="sopType" render={({ field }) => (
                  <FormItem><FormLabel>SOP Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{SOP_TYPES.map(t => <SelectItem key={t} value={t}>{SOP_TYPE_LABELS[t] ?? t}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="applicableRole" render={({ field }) => (
                  <FormItem><FormLabel>Accessible To</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{VALID_SOP_ROLES.map(r => <SelectItem key={r} value={r}>{SOP_ROLE_LABELS[r] ?? r}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="department" render={({ field }) => (
                  <FormItem><FormLabel>Department</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{(departments as any[]).map((d: any) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="processArea" render={({ field }) => (
                  <FormItem><FormLabel>Process Area</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="ownerId" render={({ field }) => (
                  <FormItem><FormLabel>Owner</FormLabel>
                    <Select value={field.value || "__none__"} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select owner…" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">— None —</SelectItem>
                        {(users as any[]).map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.displayName ?? u.username}</SelectItem>)}
                      </SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
                {isSM && (
                  <FormField control={editForm.control} name="approverId" render={({ field }) => (
                    <FormItem><FormLabel>Approver</FormLabel>
                      <Select value={field.value ?? "__none__"} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select approver…" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">— None —</SelectItem>
                          {(users as any[]).map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.displayName ?? u.username}</SelectItem>)}
                        </SelectContent>
                      </Select><FormMessage />
                    </FormItem>
                  )} />
                )}
                <FormField control={editForm.control} name="documentReference" render={({ field }) => (
                  <FormItem><FormLabel>Document Reference</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              {isSM && (
                <div className="grid grid-cols-3 gap-4">
                  <FormField control={editForm.control} name="effectiveDate" render={({ field }) => (
                    <FormItem><FormLabel>Effective Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={editForm.control} name="reviewDueDate" render={({ field }) => (
                    <FormItem><FormLabel>Review Due</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={editForm.control} name="nextReviewDate" render={({ field }) => (
                    <FormItem><FormLabel>Next Review</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setSopEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={editMut.isPending}>{editMut.isPending ? "Saving…" : "Save Changes"}</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="revisions">Revisions</TabsTrigger>
          <TabsTrigger value="linkages">Linkages</TabsTrigger>
          <TabsTrigger value="acknowledgments">Acknowledgments</TabsTrigger>
          <TabsTrigger value="effectiveness">Effectiveness</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="enforcement">Enforcement</TabsTrigger>
          <TabsTrigger value="lessons">Lessons Learned</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"        className="mt-4"><OverviewTab sop={sop} onRefresh={handleRefresh} onEditOpen={openSopEdit} /></TabsContent>
        <TabsContent value="sections"        className="mt-4"><SectionsTab sop={sop} /></TabsContent>
        <TabsContent value="revisions"       className="mt-4"><RevisionsTab sop={sop} onRefresh={handleRefresh} /></TabsContent>
        <TabsContent value="linkages"        className="mt-4"><LinkagesTab sop={sop} /></TabsContent>
        <TabsContent value="acknowledgments" className="mt-4"><AcknowledgmentsTab sop={sop} /></TabsContent>
        <TabsContent value="effectiveness"   className="mt-4"><EffectivenessTab sop={sop} /></TabsContent>
        <TabsContent value="suggestions"     className="mt-4"><SuggestionsTab sop={sop} /></TabsContent>
        <TabsContent value="audit"           className="mt-4"><AuditLogTab sop={sop} /></TabsContent>
        <TabsContent value="enforcement"     className="mt-4"><SopEnforcementTab sop={sop} /></TabsContent>
        <TabsContent value="lessons"         className="mt-4"><SopLinkedLessonsTab sopId={sop.id} /></TabsContent>
      </Tabs>
    </div>
  );
}
