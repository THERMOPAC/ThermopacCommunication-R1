import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, BookMarked, Globe, CheckCircle, XCircle, Archive,
  GitBranch, UserPlus, ThumbsUp, ThumbsDown, Link2, Unlink,
  RefreshCw, AlertTriangle, ClipboardCheck, Star, History,
  Send, Tag, Layers, Eye, FileText, Shield,
} from "lucide-react";
import {
  LESSON_STATUS_LABELS, LESSON_STATUS_COLORS,
  LESSON_CATEGORY_LABELS, LESSON_CATEGORY_COLORS,
  LESSON_TYPE_LABELS, LESSON_SCOPE_LABELS,
  LESSON_PRIORITY_LABELS, LESSON_PRIORITY_COLORS,
  LESSON_REC_RISK_LABELS,
  LINK_TYPE_LABELS, REVIEWER_STATUS_LABELS, REVIEWER_STATUS_COLORS,
  EFFECTIVENESS_RATINGS, EFFECTIVENESS_RATING_LABELS, EFFECTIVENESS_RATING_COLORS,
  OI_DEPARTMENTS,
} from "./oi-lesson-constants";

const MANAGER_ROLES = ["Manager","Senior Manager","General Manager","Superuser"];
const SM_ROLES      = ["Senior Manager","General Manager","Superuser"];

function StatusBadge({ status }: { status: string }) {
  const label = LESSON_STATUS_LABELS[status as keyof typeof LESSON_STATUS_LABELS] ?? status;
  const cls   = LESSON_STATUS_COLORS[status as keyof typeof LESSON_STATUS_COLORS] ?? "bg-slate-100 text-slate-700";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function CategoryBadge({ category }: { category: string }) {
  const label = LESSON_CATEGORY_LABELS[category as keyof typeof LESSON_CATEGORY_LABELS] ?? category;
  const cls   = LESSON_CATEGORY_COLORS[category as keyof typeof LESSON_CATEGORY_COLORS] ?? "bg-slate-100 text-slate-700";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function ReviewerStatusBadge({ status }: { status: string }) {
  const label = REVIEWER_STATUS_LABELS[status] ?? status;
  const cls   = REVIEWER_STATUS_COLORS[status] ?? "bg-slate-100 text-slate-500";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function EffBadge({ rating }: { rating?: string | null }) {
  if (!rating) return null;
  const label = EFFECTIVENESS_RATING_LABELS[rating as keyof typeof EFFECTIVENESS_RATING_LABELS] ?? rating;
  const cls   = EFFECTIVENESS_RATING_COLORS[rating as keyof typeof EFFECTIVENESS_RATING_COLORS] ?? "bg-slate-100 text-slate-700";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

// ── Lifecycle Action Buttons ──────────────────────────────────────────────────

function SubmitButton({ lessonId, status, refetch }: { lessonId: number; status: string; refetch: () => void }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/oi/lessons/${lessonId}/submit`, {}),
    onSuccess: () => { toast({ title: "Submitted for review" }); refetch(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  if (!["draft","rejected"].includes(status)) return null;
  return (
    <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
      <Send className="h-3.5 w-3.5" /> {mutation.isPending ? "Submitting…" : "Submit for Review"}
    </Button>
  );
}

function ApproveButton({ lessonId, status, refetch }: { lessonId: number; status: string; refetch: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/oi/lessons/${lessonId}/approve`, {}),
    onSuccess: () => { toast({ title: "Lesson approved" }); refetch(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  if (status !== "under_review" || !SM_ROLES.includes(user?.role ?? "")) return null;
  return (
    <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-1.5 bg-green-600 hover:bg-green-700">
      <CheckCircle className="h-3.5 w-3.5" /> {mutation.isPending ? "Approving…" : "Approve"}
    </Button>
  );
}

function RejectButton({ lessonId, status, refetch }: { lessonId: number; status: string; refetch: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/oi/lessons/${lessonId}/reject`, { rejectionReason: reason }),
    onSuccess: () => { toast({ title: "Lesson rejected" }); refetch(); setOpen(false); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  if (!["submitted_for_review","under_review"].includes(status) || !SM_ROLES.includes(user?.role ?? "")) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50">
          <XCircle className="h-3.5 w-3.5" /> Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Reject Lesson</DialogTitle></DialogHeader>
        <Textarea rows={4} placeholder="Rejection reason (min 20 chars)" value={reason} onChange={e => setReason(e.target.value)} />
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={reason.length < 20 || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Rejecting…" : "Confirm Reject"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PublishButton({ lessonId, status, refetch }: { lessonId: number; status: string; refetch: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/oi/lessons/${lessonId}/publish`, {}),
    onSuccess: () => { toast({ title: "Lesson published" }); refetch(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  if (status !== "approved" || !SM_ROLES.includes(user?.role ?? "")) return null;
  return (
    <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
      <Globe className="h-3.5 w-3.5" /> {mutation.isPending ? "Publishing…" : "Publish"}
    </Button>
  );
}

function ArchiveButton({ lessonId, status, refetch }: { lessonId: number; status: string; refetch: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/oi/lessons/${lessonId}/archive`, { archiveReason: reason }),
    onSuccess: () => { toast({ title: "Lesson archived" }); refetch(); setOpen(false); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  if (status !== "published" || !SM_ROLES.includes(user?.role ?? "")) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 border-slate-300 text-slate-600 hover:bg-slate-50">
          <Archive className="h-3.5 w-3.5" /> Archive
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Archive Lesson</DialogTitle></DialogHeader>
        <Textarea rows={3} placeholder="Archive reason (min 10 chars)" value={reason} onChange={e => setReason(e.target.value)} />
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={reason.length < 10 || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Archiving…" : "Archive"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviseButton({ lessonId, status, refetch }: { lessonId: number; status: string; refetch: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/oi/lessons/${lessonId}/revise`, {}),
    onSuccess: (res: any) => { toast({ title: `Revision created: ${res.lesson_number}` }); navigate(`/oi/lessons/${res.id}`); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  if (status !== "published" || !SM_ROLES.includes(user?.role ?? "")) return null;
  return (
    <Button size="sm" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-1.5">
      <GitBranch className="h-3.5 w-3.5" /> {mutation.isPending ? "Creating…" : "Create Revision"}
    </Button>
  );
}

function CrossProjectApproveButton({ lessonId, lesson, refetch }: { lessonId: number; lesson: any; refetch: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/oi/lessons/${lessonId}/approve-cross-project`, {}),
    onSuccess: () => { toast({ title: "Cross-project approval granted" }); refetch(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  if (!SM_ROLES.includes(user?.role ?? "")) return null;
  if (lesson.status !== "published") return null;
  if (!lesson.cross_project_applicable) return null;
  if (lesson.cross_project_approved_at) return null;
  return (
    <Button size="sm" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-1.5 border-violet-300 text-violet-600 hover:bg-violet-50">
      <Globe className="h-3.5 w-3.5" /> {mutation.isPending ? "Approving…" : "Approve Cross-Project"}
    </Button>
  );
}

// ── Tab: Linkages ─────────────────────────────────────────────────────────────

const LINK_TYPES = ["issue","rca","capa","sop","enforcement_control","enforcement_hold"] as const;

function LinkagesTab({ lessonId, lesson }: { lessonId: number; lesson: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isLocked = ["published","archived"].includes(lesson.status);

  const { data: linkages = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/oi/lessons", lessonId, "linkages"],
    queryFn: () => apiRequest("GET", `/api/oi/lessons/${lessonId}/linkages`),
  });

  const [linkType, setLinkType] = useState<string>("issue");
  const [entityId, setEntityId] = useState("");
  const [linkNote, setLinkNote] = useState("");

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/oi/lessons/${lessonId}/linkages`, {
      linkType, linkedEntityId: parseInt(entityId), linkNote: linkNote || null,
    }),
    onSuccess: () => { toast({ title: "Linkage added" }); refetch(); setEntityId(""); setLinkNote(""); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (linkId: number) => apiRequest("DELETE", `/api/oi/lessons/${lessonId}/linkages/${linkId}`),
    onSuccess: () => { toast({ title: "Linkage removed" }); refetch(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {!isLocked && MANAGER_ROLES.includes(user?.role ?? "") && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Add Linkage</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Select value={linkType} onValueChange={setLinkType}>
              <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LINK_TYPES.map(t => <SelectItem key={t} value={t}>{LINK_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              className="w-32 h-8 text-sm"
              placeholder="Entity ID"
              type="number"
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
            />
            <Input
              className="flex-1 min-w-[160px] h-8 text-sm"
              placeholder="Link note (optional)"
              value={linkNote}
              onChange={e => setLinkNote(e.target.value)}
            />
            <Button size="sm" disabled={!entityId || addMutation.isPending} onClick={() => addMutation.mutate()}>
              <Link2 className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </CardContent>
        </Card>
      )}

      {linkages.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Link2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No linkages yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {linkages.map((lk: any) => (
            <div key={lk.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 flex-shrink-0">
                  {LINK_TYPE_LABELS[lk.link_type] ?? lk.link_type}
                </span>
                <span className="text-sm font-mono text-slate-800">{lk.linked_entity_ref ?? lk.linked_entity_id}</span>
                {lk.link_note && <span className="text-xs text-slate-400 truncate">{lk.link_note}</span>}
              </div>
              {!isLocked && MANAGER_ROLES.includes(user?.role ?? "") && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(lk.id)}>
                  <Unlink className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Reviewers ────────────────────────────────────────────────────────────

function ReviewersTab({ lessonId, lesson }: { lessonId: number; lesson: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canAssign = SM_ROLES.includes(user?.role ?? "") && ["submitted_for_review","under_review"].includes(lesson.status);

  const { data: reviewers = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/oi/lessons", lessonId, "reviewers"],
    queryFn: () => apiRequest("GET", `/api/oi/lessons/${lessonId}/reviewers`),
  });

  const [reviewerId, setReviewerId] = useState("");

  const assignMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/oi/lessons/${lessonId}/reviewers`, { reviewerId: parseInt(reviewerId) }),
    onSuccess: () => { toast({ title: "Reviewer assigned" }); refetch(); setReviewerId(""); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const voteMutation = useMutation({
    mutationFn: ({ vote, note }: { vote: string; note?: string }) =>
      apiRequest("POST", `/api/oi/lessons/${lessonId}/reviewers/${user?.id}/vote`, { vote, reviewNote: note }),
    onSuccess: () => { toast({ title: "Vote recorded" }); refetch(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const recuseMutation = useMutation({
    mutationFn: (rvId: number) => apiRequest("POST", `/api/oi/lessons/${lessonId}/reviewers/${rvId}/recuse`, {}),
    onSuccess: () => { toast({ title: "Recused" }); refetch(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const myReview = reviewers.find(r => r.reviewer_id === user?.id);

  return (
    <div className="space-y-4">
      {canAssign && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Assign Reviewer</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input
              className="w-36 h-8 text-sm"
              placeholder="User ID"
              type="number"
              value={reviewerId}
              onChange={e => setReviewerId(e.target.value)}
            />
            <Button size="sm" disabled={!reviewerId || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Assign
            </Button>
          </CardContent>
        </Card>
      )}

      {myReview?.review_status === "pending" && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-amber-800 mb-3">Your review is pending</p>
            <div className="flex gap-2">
              <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => voteMutation.mutate({ vote: "approved" })} disabled={voteMutation.isPending}>
                <ThumbsUp className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50" onClick={() => voteMutation.mutate({ vote: "rejected" })} disabled={voteMutation.isPending}>
                <ThumbsDown className="h-3.5 w-3.5" /> Reject
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-slate-500" onClick={() => recuseMutation.mutate(user!.id)} disabled={recuseMutation.isPending}>
                Recuse
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {reviewers.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No reviewers assigned</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reviewers.map((rv: any) => (
            <div key={rv.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800">User #{rv.reviewer_id}</span>
                <ReviewerStatusBadge status={rv.review_status} />
                {rv.review_note && <span className="text-xs text-slate-400 italic truncate max-w-[200px]">{rv.review_note}</span>}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {rv.reviewed_at && <span>{fmtDate(rv.reviewed_at)}</span>}
                {rv.review_status === "pending" && SM_ROLES.includes(user?.role ?? "") && rv.reviewer_id !== user?.id && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-slate-400 hover:text-slate-600" onClick={() => recuseMutation.mutate(rv.reviewer_id)}>
                    Recuse
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Acknowledgments ──────────────────────────────────────────────────────

function AcknowledgmentsTab({ lessonId, lesson }: { lessonId: number; lesson: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canAssign = SM_ROLES.includes(user?.role ?? "") && lesson.status === "published" && lesson.cross_project_approved_at;

  const { data: acks = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/oi/lessons", lessonId, "acknowledgments"],
    queryFn: () => apiRequest("GET", `/api/oi/lessons/${lessonId}/acknowledgments`),
  });

  const [ackType, setAckType] = useState("department");
  const [targetDept, setTargetDept] = useState("");
  const [targetProjectId, setTargetProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const assignMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/oi/lessons/${lessonId}/acknowledgments`, {
      acknowledgmentType: ackType,
      targetDepartment: ackType === "department" ? targetDept : null,
      targetProjectId: ackType === "project" ? parseInt(targetProjectId) : null,
      dueDate: dueDate || null,
    }),
    onSuccess: () => { toast({ title: "Acknowledgment assigned" }); refetch(); setTargetDept(""); setTargetProjectId(""); setDueDate(""); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const ackMutation = useMutation({
    mutationFn: (ackId: number) => apiRequest("POST", `/api/oi/lessons/${lessonId}/acknowledgments/${ackId}/acknowledge`, { acknowledgmentNote: null }),
    onSuccess: () => { toast({ title: "Acknowledged" }); refetch(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {!canAssign && lesson.status === "published" && !lesson.cross_project_approved_at && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Cross-project approval is required before assigning acknowledgments.
        </div>
      )}

      {canAssign && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Require Acknowledgment</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2 items-end">
            <div>
              <Label className="text-xs mb-1 block">Type</Label>
              <Select value={ackType} onValueChange={setAckType}>
                <SelectTrigger className="w-[130px] h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {ackType === "department" ? (
              <div>
                <Label className="text-xs mb-1 block">Department</Label>
                <Select value={targetDept} onValueChange={setTargetDept}>
                  <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue placeholder="Select dept" /></SelectTrigger>
                  <SelectContent>
                    {OI_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className="text-xs mb-1 block">Project ID</Label>
                <Input className="w-32 h-8 text-sm" type="number" placeholder="Project ID" value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} />
              </div>
            )}
            <div>
              <Label className="text-xs mb-1 block">Due Date</Label>
              <Input className="w-36 h-8 text-sm" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <Button size="sm" disabled={assignMutation.isPending || (ackType === "department" && !targetDept) || (ackType === "project" && !targetProjectId)} onClick={() => assignMutation.mutate()}>
              Assign
            </Button>
          </CardContent>
        </Card>
      )}

      {acks.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No acknowledgments required</p>
        </div>
      ) : (
        <div className="space-y-2">
          {acks.map((ack: any) => (
            <div key={ack.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${ack.isOverdue ? "border-red-200 bg-red-50" : "border-slate-200"}`}>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-slate-600 capitalize">{ack.acknowledgment_type}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    ack.status === "acknowledged" ? "bg-green-100 text-green-700" :
                    ack.isOverdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {ack.status === "acknowledged" ? "Acknowledged" : ack.isOverdue ? "Overdue" : "Pending"}
                  </span>
                </div>
                <p className="text-sm text-slate-800">
                  {ack.target_department ?? `Project #${ack.target_project_id}`}
                  {ack.due_date && <span className="text-xs text-slate-400 ml-2">Due: {fmtDate(ack.due_date)}</span>}
                </p>
                {ack.acknowledged_at && (
                  <p className="text-xs text-slate-400">Acknowledged {fmtDateTime(ack.acknowledged_at)}</p>
                )}
              </div>
              {ack.status === "pending" && MANAGER_ROLES.includes(user?.role ?? "") && (
                <Button size="sm" onClick={() => ackMutation.mutate(ack.id)} disabled={ackMutation.isPending} className="gap-1.5 bg-green-600 hover:bg-green-700">
                  <CheckCircle className="h-3.5 w-3.5" /> Acknowledge
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Recurrence Checks ────────────────────────────────────────────────────

function RecurrenceTab({ lessonId, lesson }: { lessonId: number; lesson: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: checks = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/oi/lessons", lessonId, "recurrence-checks"],
    queryFn: () => apiRequest("GET", `/api/oi/lessons/${lessonId}/recurrence-checks`),
  });

  const schema = z.object({
    checkDate:        z.string().min(1),
    recurrenceFound:  z.boolean().default(false),
    recurrenceDetail: z.string().optional(),
    linkedIssueId:    z.string().optional(),
    linkedRcaId:      z.string().optional(),
    recommendation:   z.string().optional(),
  });
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { recurrenceFound: false } });
  const recFound = form.watch("recurrenceFound");

  const mutation = useMutation({
    mutationFn: (d: z.infer<typeof schema>) => apiRequest("POST", `/api/oi/lessons/${lessonId}/recurrence-checks`, {
      checkDate: d.checkDate,
      recurrenceFound: d.recurrenceFound,
      recurrenceDetail: d.recurrenceDetail || null,
      linkedIssueId: d.linkedIssueId ? parseInt(d.linkedIssueId) : null,
      linkedRcaId: d.linkedRcaId ? parseInt(d.linkedRcaId) : null,
      recommendation: d.recommendation || null,
    }),
    onSuccess: () => { toast({ title: "Recurrence check recorded" }); refetch(); form.reset({ recurrenceFound: false }); setOpen(false); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (checkId: number) => apiRequest("DELETE", `/api/oi/lessons/${lessonId}/recurrence-checks/${checkId}`),
    onSuccess: () => { toast({ title: "Check deleted" }); refetch(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {lesson.status === "published" && MANAGER_ROLES.includes(user?.role ?? "") && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Record Recurrence Check</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Recurrence Check</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-3">
                <FormField control={form.control} name="checkDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="recurrenceFound" render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="!mt-0">Recurrence Found</FormLabel>
                  </FormItem>
                )} />
                {recFound && (
                  <>
                    <FormField control={form.control} name="recurrenceDetail" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recurrence Detail <span className="text-red-500">*</span></FormLabel>
                        <FormControl><Textarea rows={3} placeholder="Describe the recurrence (min 20 chars)" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-2">
                      <FormField control={form.control} name="linkedIssueId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Linked Issue ID</FormLabel>
                          <FormControl><Input type="number" placeholder="Issue ID" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="linkedRcaId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Linked RCA ID</FormLabel>
                          <FormControl><Input type="number" placeholder="RCA ID" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </>
                )}
                <FormField control={form.control} name="recommendation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recommendation</FormLabel>
                    <FormControl><Textarea rows={2} placeholder="Optional" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save"}</Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {checks.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No recurrence checks recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {checks.map((c: any) => (
            <div key={c.id} className={`rounded-lg border px-3 py-3 ${c.recurrence_found ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {c.recurrence_found
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"><AlertTriangle className="h-3.5 w-3.5" />Recurrence Found</span>
                      : <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><CheckCircle className="h-3.5 w-3.5" />No Recurrence</span>
                    }
                    <span className="text-xs text-slate-400">{fmtDate(c.check_date)}</span>
                  </div>
                  {c.recurrence_detail && <p className="text-sm text-slate-700 mb-1">{c.recurrence_detail}</p>}
                  {c.recommendation && <p className="text-xs text-slate-500 italic">{c.recommendation}</p>}
                  {(c.linked_issue_id || c.linked_rca_id) && (
                    <p className="text-xs text-slate-400 mt-1">
                      {c.linked_issue_id && `Issue #${c.linked_issue_id}`}
                      {c.linked_rca_id && ` RCA #${c.linked_rca_id}`}
                    </p>
                  )}
                </div>
                {SM_ROLES.includes(user?.role ?? "") && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(c.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Effectiveness ────────────────────────────────────────────────────────

function EffectivenessTab({ lessonId, lesson }: { lessonId: number; lesson: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: reviews = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/oi/lessons", lessonId, "effectiveness-reviews"],
    queryFn: () => apiRequest("GET", `/api/oi/lessons/${lessonId}/effectiveness-reviews`),
  });

  const schema = z.object({
    reviewDate:          z.string().min(1),
    reviewStatus:        z.enum(["pending","completed","deferred"]),
    effectivenessRating: z.string().optional(),
    observations:        z.string().optional(),
    recommendation:      z.string().optional(),
    nextReviewDue:       z.string().optional(),
  });
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { reviewStatus: "completed" as const } });
  const reviewStatus = form.watch("reviewStatus");

  const mutation = useMutation({
    mutationFn: (d: z.infer<typeof schema>) => apiRequest("POST", `/api/oi/lessons/${lessonId}/effectiveness-reviews`, {
      reviewDate: d.reviewDate,
      reviewStatus: d.reviewStatus,
      effectivenessRating: d.effectivenessRating || null,
      observations: d.observations || null,
      recommendation: d.recommendation || null,
      nextReviewDue: d.nextReviewDue || null,
    }),
    onSuccess: () => { toast({ title: "Effectiveness review recorded" }); refetch(); form.reset({ reviewStatus: "completed" }); setOpen(false); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {lesson.status === "published" && MANAGER_ROLES.includes(user?.role ?? "") && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Star className="h-3.5 w-3.5" /> Record Effectiveness Review</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Effectiveness Review</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="reviewDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Review Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="reviewStatus" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="deferred">Deferred</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                {reviewStatus === "completed" && (
                  <FormField control={form.control} name="effectivenessRating" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Effectiveness Rating <span className="text-red-500">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {EFFECTIVENESS_RATINGS.map(r => <SelectItem key={r} value={r}>{EFFECTIVENESS_RATING_LABELS[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
                <FormField control={form.control} name="observations" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observations {reviewStatus === "completed" && <span className="text-red-500">*</span>}</FormLabel>
                    <FormControl><Textarea rows={3} placeholder="What did you observe? (min 20 chars)" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="recommendation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recommendation</FormLabel>
                    <FormControl><Textarea rows={2} placeholder="Optional" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nextReviewDue" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Next Review Due</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save"}</Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {reviews.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Star className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No effectiveness reviews yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reviews.map((r: any) => (
            <div key={r.id} className="rounded-lg border border-slate-200 px-3 py-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{fmtDate(r.review_date)}</span>
                  <EffBadge rating={r.effectiveness_rating} />
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.review_status === "completed" ? "bg-green-100 text-green-700" :
                    r.review_status === "deferred" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"
                  }`}>{r.review_status}</span>
                </div>
              </div>
              {r.observations && <p className="text-sm text-slate-700 mt-1">{r.observations}</p>}
              {r.recommendation && <p className="text-xs text-slate-500 mt-1 italic">{r.recommendation}</p>}
              {r.next_review_due && <p className="text-xs text-slate-400 mt-1">Next due: {fmtDate(r.next_review_due)}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Audit Log ────────────────────────────────────────────────────────────

function AuditTab({ lessonId }: { lessonId: number }) {
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/lessons", lessonId, "audit-log"],
    queryFn: () => apiRequest("GET", `/api/oi/lessons/${lessonId}/audit-log`),
  });

  return (
    <div className="space-y-2">
      {isLoading ? (
        <div className="h-32 rounded-lg bg-slate-100 animate-pulse" />
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No audit entries</p>
        </div>
      ) : (
        logs.map((log: any) => (
          <div key={log.id} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-700">{log.actor_name}</span>
                <span className="text-xs text-slate-400">{log.actor_role}</span>
                <span className="inline-flex items-center rounded bg-slate-200 px-1.5 py-0.5 text-xs font-mono text-slate-600">
                  {log.action.replace(/_/g, " ")}
                </span>
                {log.field_name && (
                  <span className="text-xs text-slate-400">
                    {log.field_name}: <span className="line-through">{log.old_value ?? "—"}</span> → {log.new_value ?? "—"}
                  </span>
                )}
              </div>
              {log.context && <p className="text-xs text-slate-400 mt-0.5 italic">{log.context}</p>}
            </div>
            <span className="text-xs text-slate-400 flex-shrink-0">{fmtDateTime(log.created_at)}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ── Main Detail Page ──────────────────────────────────────────────────────────

export default function OiLessonDetailPage() {
  const [, params] = useRoute("/oi/lessons/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const lessonId = parseInt(params?.id ?? "0");

  const { data: lesson, isLoading, refetch, error } = useQuery<any>({
    queryKey: ["/api/oi/lessons", lessonId],
    queryFn: () => apiRequest("GET", `/api/oi/lessons/${lessonId}`),
    enabled: lessonId > 0,
  });

  if (isLoading) return (
    <div className="space-y-4 p-6">
      <div className="h-10 bg-slate-100 rounded animate-pulse w-64" />
      <div className="h-48 bg-slate-100 rounded animate-pulse" />
    </div>
  );

  if (error || !lesson) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertTriangle className="h-12 w-12 text-red-400 mb-3" />
      <p className="text-slate-600">Lesson not found</p>
      <Button variant="link" onClick={() => navigate("/oi/lessons")}>Back to Register</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("/oi/lessons")} className="gap-1 -ml-2 h-7">
              <ArrowLeft className="h-3.5 w-3.5" /> Register
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-sm text-slate-500">{lesson.lesson_number}</span>
            <StatusBadge status={lesson.status} />
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              LESSON_PRIORITY_COLORS[lesson.priority as keyof typeof LESSON_PRIORITY_COLORS] ?? "bg-slate-100 text-slate-600"
            }`}>{LESSON_PRIORITY_LABELS[lesson.priority as keyof typeof LESSON_PRIORITY_LABELS] ?? lesson.priority}</span>
            {lesson.revision_number > 1 && (
              <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-600 px-2 py-0.5 text-xs font-medium">
                <GitBranch className="h-3 w-3 mr-0.5" />Rev {lesson.revision_number}
              </span>
            )}
            {lesson.cross_project_applicable && lesson.cross_project_approved_at && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-xs font-medium">
                <Globe className="h-3 w-3" />Cross-Project
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900">{lesson.title}</h1>
          <CategoryBadge category={lesson.lesson_category} />
          {lesson.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {lesson.tags.map((t: string) => (
                <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  <Tag className="h-2.5 w-2.5" />{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <SubmitButton lessonId={lessonId} status={lesson.status} refetch={refetch} />
          <ApproveButton lessonId={lessonId} status={lesson.status} refetch={refetch} />
          <RejectButton lessonId={lessonId} status={lesson.status} refetch={refetch} />
          <PublishButton lessonId={lessonId} status={lesson.status} refetch={refetch} />
          <CrossProjectApproveButton lessonId={lessonId} lesson={lesson} refetch={refetch} />
          <ArchiveButton lessonId={lessonId} status={lesson.status} refetch={refetch} />
          <ReviseButton lessonId={lessonId} status={lesson.status} refetch={refetch} />
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 w-8 p-0">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Revision lineage notice */}
      {lesson.parentLesson && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 flex items-center gap-2 text-sm text-blue-700">
          <GitBranch className="h-4 w-4 flex-shrink-0" />
          Revised from <button onClick={() => navigate(`/oi/lessons/${lesson.parentLesson.id}`)} className="underline font-medium">{lesson.parentLesson.lesson_number}</button>
        </div>
      )}
      {lesson.status === "archived" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 flex items-center gap-2 text-sm text-slate-500">
          <Archive className="h-4 w-4 flex-shrink-0" />
          Archived: {lesson.archive_reason}
        </div>
      )}
      {lesson.status === "rejected" && lesson.rejection_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 flex items-center gap-2 text-sm text-red-600">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          Rejected: {lesson.rejection_reason}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-1.5"><Eye className="h-3.5 w-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="linkages" className="gap-1.5"><Link2 className="h-3.5 w-3.5" />Linkages ({lesson.linkages?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="reviewers" className="gap-1.5"><UserPlus className="h-3.5 w-3.5" />Reviewers ({lesson.reviewers?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="acknowledgments" className="gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" />Acknowledgments ({lesson.acknowledgments?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="recurrence" className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Recurrence ({lesson.recurrenceCheckCount ?? 0})</TabsTrigger>
          <TabsTrigger value="effectiveness" className="gap-1.5"><Star className="h-3.5 w-3.5" />Effectiveness ({lesson.effectivenessReviewCount ?? 0})</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><History className="h-3.5 w-3.5" />Audit Log</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><FileText className="h-4 w-4" />Content</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <InfoRow label="Description">
                    <p className="whitespace-pre-wrap">{lesson.description}</p>
                  </InfoRow>
                  <Separator />
                  <InfoRow label="Recommendation">
                    <p className="whitespace-pre-wrap">{lesson.recommendation}</p>
                  </InfoRow>
                  {lesson.implementation_guidance && (
                    <>
                      <Separator />
                      <InfoRow label="Implementation Guidance">
                        <p className="whitespace-pre-wrap">{lesson.implementation_guidance}</p>
                      </InfoRow>
                    </>
                  )}
                  {lesson.root_cause_summary && (
                    <>
                      <Separator />
                      <InfoRow label="Root Cause Summary">
                        <p className="whitespace-pre-wrap">{lesson.root_cause_summary}</p>
                      </InfoRow>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Layers className="h-4 w-4" />Classification</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <dl className="grid grid-cols-2 gap-3">
                    <InfoRow label="Type">{LESSON_TYPE_LABELS[lesson.lesson_type as keyof typeof LESSON_TYPE_LABELS] ?? lesson.lesson_type}</InfoRow>
                    <InfoRow label="Scope">{LESSON_SCOPE_LABELS[lesson.applicability_scope as keyof typeof LESSON_SCOPE_LABELS] ?? lesson.applicability_scope}</InfoRow>
                    {lesson.scope_department && <InfoRow label="Department">{lesson.scope_department}</InfoRow>}
                    {lesson.scope_project_id && <InfoRow label="Project ID">{lesson.scope_project_id}</InfoRow>}
                    {lesson.scope_equipment_type && <InfoRow label="Equipment Type">{lesson.scope_equipment_type}</InfoRow>}
                    {lesson.process_area && <InfoRow label="Process Area">{lesson.process_area}</InfoRow>}
                    {lesson.recurrence_risk && <InfoRow label="Recurrence Risk">{LESSON_REC_RISK_LABELS[lesson.recurrence_risk as keyof typeof LESSON_REC_RISK_LABELS] ?? lesson.recurrence_risk}</InfoRow>}
                    <InfoRow label="Effectiveness Review">{lesson.effectiveness_review_due_months ? `${lesson.effectiveness_review_due_months} months` : "—"}</InfoRow>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Shield className="h-4 w-4" />Lifecycle</CardTitle></CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-3">
                    <InfoRow label="Author">#{lesson.author_id}</InfoRow>
                    <InfoRow label="Created">{fmtDate(lesson.created_at)}</InfoRow>
                    {lesson.submitted_at && <InfoRow label="Submitted">{fmtDate(lesson.submitted_at)}</InfoRow>}
                    {lesson.review_due_at && <InfoRow label="Review Due">{fmtDate(lesson.review_due_at)}</InfoRow>}
                    {lesson.approved_at && <InfoRow label="Approved">{fmtDate(lesson.approved_at)}</InfoRow>}
                    {lesson.published_at && <InfoRow label="Published">{fmtDate(lesson.published_at)}</InfoRow>}
                    {lesson.archived_at && <InfoRow label="Archived">{fmtDate(lesson.archived_at)}</InfoRow>}
                    {lesson.cross_project_approved_at && <InfoRow label="Cross-Project Approved">{fmtDate(lesson.cross_project_approved_at)}</InfoRow>}
                  </dl>
                </CardContent>
              </Card>

              {lesson.childRevisions?.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><GitBranch className="h-4 w-4" />Revisions</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {lesson.childRevisions.map((r: any) => (
                      <button key={r.id} onClick={() => navigate(`/oi/lessons/${r.id}`)}
                        className="w-full flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50 text-sm text-left">
                        <span className="font-mono text-xs text-slate-500">{r.lesson_number}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">Rev {r.revision_number}</span>
                          <StatusBadge status={r.status} />
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="linkages" className="mt-4">
          <LinkagesTab lessonId={lessonId} lesson={lesson} />
        </TabsContent>

        <TabsContent value="reviewers" className="mt-4">
          <ReviewersTab lessonId={lessonId} lesson={lesson} />
        </TabsContent>

        <TabsContent value="acknowledgments" className="mt-4">
          <AcknowledgmentsTab lessonId={lessonId} lesson={lesson} />
        </TabsContent>

        <TabsContent value="recurrence" className="mt-4">
          <RecurrenceTab lessonId={lessonId} lesson={lesson} />
        </TabsContent>

        <TabsContent value="effectiveness" className="mt-4">
          <EffectivenessTab lessonId={lessonId} lesson={lesson} />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditTab lessonId={lessonId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
