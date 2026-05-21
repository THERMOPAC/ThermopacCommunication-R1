import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { ArrowLeft, Clock, AlertTriangle, User, ChevronRight, ShieldAlert, Activity } from "lucide-react";

const SEV_COLORS: Record<string, string> = {
  S1: "bg-red-600 text-white", S2: "bg-orange-500 text-white",
  S3: "bg-yellow-400 text-gray-900", S4: "bg-blue-400 text-white",
};
const STATUS_COLORS: Record<string, string> = {
  captured: "bg-gray-100 text-gray-800", classified: "bg-blue-100 text-blue-800",
  investigating: "bg-yellow-100 text-yellow-800", verified: "bg-purple-100 text-purple-800",
  closed: "bg-green-100 text-green-800", reopened: "bg-orange-100 text-orange-800",
  withdrawn: "bg-slate-100 text-slate-500",
};
const TRANSITION_LABELS: Record<string, string> = {
  classified: "Classify",
  investigating: "Start Investigation",
  verified: "Mark Verified",
  closed: "Close Issue",
  reopened: "Reopen",
  withdrawn: "Withdraw",
};

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}

export default function OiIssueDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [transitionTo, setTransitionTo] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const issueId = params.id;

  const { data: issue, isLoading } = useQuery<any>({
    queryKey: ["/api/oi/issues", issueId],
    queryFn: async () => {
      const res = await fetch(`/api/oi/issues/${issueId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!issueId,
  });

  const { data: auditLogs } = useQuery<any[]>({
    queryKey: ["/api/oi/issues", issueId, "audit"],
    queryFn: async () => {
      const res = await fetch(`/api/oi/issues/${issueId}/audit`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!issueId,
  });

  const transitionMutation = useMutation({
    mutationFn: async ({ to, reason }: { to: string; reason?: string }) => {
      return apiRequest("POST", `/api/oi/issues/${issueId}/transition`, { to, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oi/issues", issueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/oi/issues", issueId, "audit"] });
      queryClient.invalidateQueries({ queryKey: ["/api/oi/dashboard/summary"] });
      setTransitionTo(null); setReason("");
      toast({ title: "Status updated" });
    },
    onError: async (err: any) => {
      const body = err?.response ? await err.response.json().catch(() => ({})) : {};
      const msg = body?.error === "phase_not_implemented"
        ? "S1/S2 issues cannot advance past Investigating in Phase 1A."
        : body?.error === "transition_not_allowed"
        ? "This transition is not permitted from the current status."
        : body?.error === "forbidden"
        ? "Your role does not permit this transition."
        : "Failed to update status.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const needsReason = transitionTo === "withdrawn" || transitionTo === "reopened";

  if (isLoading) {
    return (
      <Layout>
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Layout>
    );
  }

  if (!issue) {
    return (
      <Layout>
        <div className="p-4">
          <p className="text-gray-500">Issue not found.</p>
          <Link href="/oi/issues"><Button variant="link">Back to register</Button></Link>
        </div>
      </Layout>
    );
  }

  const allowedTransitions: string[] = issue.allowedTransitions ?? [];

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Link href="/oi/issues">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-gray-500">{issue.issueNumber}</span>
              <Badge className={`text-xs ${SEV_COLORS[issue.severity]}`}>{issue.severity}</Badge>
              <Badge variant="outline" className={`text-xs ${STATUS_COLORS[issue.status] ?? ""}`}>
                {issue.status.replace(/_/g, " ")}
              </Badge>
              {issue.responseSlaBreached && (
                <Badge variant="outline" className="text-xs border-red-400 text-red-700 bg-red-50">
                  <Clock className="h-3 w-3 mr-1" /> Response SLA Breached
                </Badge>
              )}
              {issue.closureSlaBreached && (
                <Badge variant="outline" className="text-xs border-orange-400 text-orange-700 bg-orange-50">
                  <Clock className="h-3 w-3 mr-1" /> Closure SLA Breached
                </Badge>
              )}
            </div>
            <h1 className="text-lg font-bold text-gray-900 mt-1">{issue.title}</h1>
          </div>
        </div>

        {/* Transition buttons */}
        {allowedTransitions.length > 0 && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">Available Actions</p>
              <div className="flex flex-wrap gap-2">
                {allowedTransitions.map((t: string) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={t === "withdrawn" ? "destructive" : t === "closed" ? "default" : "outline"}
                    onClick={() => { setTransitionTo(t); setReason(""); }}
                    className="gap-1 text-xs"
                  >
                    <ChevronRight className="h-3 w-3" />
                    {TRANSITION_LABELS[t] ?? t}
                  </Button>
                ))}
                <Link href={`/oi/issues/${issueId}/classify`}>
                  {issue.status === "captured" && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs">
                      <Activity className="h-3 w-3" /> Classify & Assign
                    </Button>
                  )}
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {/* Main details */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">Issue Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">Description</p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{issue.description}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Category"      value={issue.category} />
                <Field label="Project Phase" value={issue.projectPhase} />
                <Field label="Sub-Category"  value={issue.subCategory} />
                <Field label="Equipment Family" value={issue.equipmentFamily} />
                <Field label="Equipment Type"   value={issue.equipmentType} />
                <Field label="Package Type"     value={issue.packageType} />
                <Field label="Process System"   value={issue.processSystem} />
                <Field label="Utility System"   value={issue.utilitySystem} />
                <Field label="Customer Industry" value={issue.customerIndustry} />
              </div>
              {(issue.criticalEquipmentFlag || issue.criticalPathFlag) && (
                <div className="flex gap-2">
                  {issue.criticalEquipmentFlag && <Badge variant="outline" className="text-xs border-red-400 text-red-700">Critical Equipment</Badge>}
                  {issue.criticalPathFlag && <Badge variant="outline" className="text-xs border-orange-400 text-orange-700">Critical Path</Badge>}
                </div>
              )}
              {issue.withdrawalReason && (
                <div className="bg-slate-50 border border-slate-200 rounded p-2 text-sm text-slate-700">
                  <strong>Withdrawal reason:</strong> {issue.withdrawalReason}
                </div>
              )}
              {issue.reopenReason && (
                <div className="bg-orange-50 border border-orange-200 rounded p-2 text-sm text-orange-800">
                  <strong>Reopen reason:</strong> {issue.reopenReason}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* SLA */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> SLA Dates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Field label="Response due"  value={issue.responseDueAt ? fmtDate(issue.responseDueAt) : "Not set"} />
                <Field label="Closure due"   value={issue.closureDueAt  ? fmtDate(issue.closureDueAt)  : "Not set"} />
                <Field label="Occurred"      value={issue.occurredAt    ? fmtDate(issue.occurredAt)    : null} />
                <Field label="Detected"      value={issue.detectedAt    ? fmtDate(issue.detectedAt)    : null} />
                <Field label="Reported"      value={fmtDateTime(issue.createdAt)} />
              </CardContent>
            </Card>

            {/* Risk */}
            {(issue.riskRating || issue.probabilityLevel || issue.impactLevel) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" /> Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Field label="Risk Rating"    value={issue.riskRating} />
                  <Field label="Risk Score"     value={issue.riskScore ? String(issue.riskScore) : null} />
                  <Field label="Probability"    value={issue.probabilityLevel} />
                  <Field label="Impact"         value={issue.impactLevel} />
                  <Field label="Recurrence"     value={issue.recurrenceRisk} />
                </CardContent>
              </Card>
            )}

            {/* Ownership */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> Ownership
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Field label="Reported by"    value={issue.reportedBy ? `#${issue.reportedBy}` : null} />
                <Field label="Assigned to"    value={issue.assignedTo ? `#${issue.assignedTo}` : "Unassigned"} />
                <Field label="Risk owner"     value={issue.riskOwner ? `#${issue.riskOwner}` : null} />
                <Field label="Escalation owner" value={issue.escalationOwner ? `#${issue.escalationOwner}` : null} />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Audit log */}
        {(auditLogs ?? []).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">Activity Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(auditLogs ?? []).map((log: any) => (
                  <div key={log.id} className="flex items-start gap-2 text-xs border-b border-gray-50 pb-2">
                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono shrink-0">{log.action.replace(/_/g," ")}</span>
                    <div className="flex-1">
                      <span className="font-medium">{log.actorName}</span>
                      {log.fieldName && <span className="text-gray-500"> · {log.fieldName}: <span className="line-through text-gray-400">{log.oldValue}</span> → <span className="text-gray-700">{log.newValue}</span></span>}
                      {log.context && <span className="text-gray-500"> · {log.context}</span>}
                    </div>
                    <span className="text-gray-400 shrink-0">{fmtDateTime(log.createdAt)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Transition dialog */}
      <Dialog open={!!transitionTo} onOpenChange={() => { setTransitionTo(null); setReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transitionTo ? TRANSITION_LABELS[transitionTo] ?? `Move to: ${transitionTo}` : ""}
            </DialogTitle>
          </DialogHeader>
          {needsReason && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                {transitionTo === "withdrawn" ? "Provide a withdrawal reason (mandatory):" : "Provide a reopen reason (mandatory):"}
              </p>
              <Textarea
                placeholder="Enter reason..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
              />
            </div>
          )}
          {!needsReason && (
            <p className="text-sm text-gray-600">Confirm moving issue to <strong>{transitionTo?.replace(/_/g, " ")}</strong>?</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTransitionTo(null); setReason(""); }}>Cancel</Button>
            <Button
              onClick={() => transitionMutation.mutate({ to: transitionTo!, reason: reason || undefined })}
              disabled={transitionMutation.isPending || (needsReason && !reason.trim())}
            >
              {transitionMutation.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
