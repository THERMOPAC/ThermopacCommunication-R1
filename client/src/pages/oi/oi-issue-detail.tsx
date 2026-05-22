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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { Link as WouterLink } from "wouter";
import {
  ArrowLeft, Clock, AlertTriangle, User, ChevronRight, ShieldAlert, Activity,
  Link2, DollarSign, Scale, Timer, BarChart2, SearchCode, CheckCircle,
} from "lucide-react";
import { RCA_STATUS_LABELS, RCA_STATUS_COLORS } from "./oi-rca-constants";

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
  classified:    "Classify",
  investigating: "Start Investigation",
  verified:      "Mark Verified",
  closed:        "Close Issue",
  reopened:      "Reopen",
  withdrawn:     "Withdraw",
};

const DIMENSION_LABELS: Record<string, string> = {
  technicalScore:   "Technical",
  qualityScore:     "Quality",
  safetyScore:      "Safety",
  financialScore:   "Financial",
  complianceScore:  "Compliance",
  scheduleScore:    "Schedule",
  liabilityScore:   "Liability",
  customerScore:    "Customer",
  operationalScore: "Operational",
};

function Field({ label, value }: { label: string; value?: string | null }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}

function DimensionScoreBar({ label, score }: { label: string; score: number | null }) {
  if (score == null) return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <div className="h-2 bg-gray-100 rounded-full" />
      <p className="text-xs text-gray-300 mt-0.5">—</p>
    </div>
  );
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "bg-red-500" : score >= 6 ? "bg-orange-400" : score >= 4 ? "bg-yellow-400" : "bg-green-400";
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`absolute left-0 top-0 h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs font-semibold text-gray-700 mt-0.5">{score}/10</p>
    </div>
  );
}

function formatINR(n: number | string | null | undefined): string {
  if (n == null) return "—";
  const v = Number(n);
  if (isNaN(v)) return "—";
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)}Cr`;
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(2)}L`;
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatHours(h: number | string | null | undefined): string {
  if (h == null) return "—";
  const v = Number(h);
  if (isNaN(v)) return "—";
  const hrs = Math.floor(v);
  const mins = Math.round((v - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

const MANAGER_ROLES = ["Manager", "Senior Manager", "General Manager", "Superuser"];
const SM_ROLES      = ["Senior Manager", "General Manager", "Superuser"];

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
      const msg = body?.error === "transition_not_allowed"
        ? "This transition is not permitted from the current status."
        : body?.error === "forbidden"
        ? "Your role does not permit this transition."
        : "Failed to update status.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const needsReason  = transitionTo === "withdrawn" || transitionTo === "reopened";
  const isManager    = MANAGER_ROLES.includes(user?.role ?? "");
  const isSM         = SM_ROLES.includes(user?.role ?? "");

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

  // Determine which Phase 1B panels to show
  const hasDimensionScores = Object.keys(DIMENSION_LABELS).some(k => issue[k] != null);
  const hasLinkageData = issue.customerId || issue.vendorId || issue.epcDrawingControlId ||
    issue.epcPoId || issue.epcWoId || issue.inspectionOrderId || issue.contractId;
  const hasFinancialData = issue.actualLossAmount != null || issue.estimatedLossAmount != null;
  const hasTimeData = issue.captureDelayHours != null || issue.responseTimeActualHours != null ||
    issue.investigationDurationHours != null || issue.totalResolutionHours != null;

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
              {issue.insuranceClaimFlag && (
                <Badge variant="outline" className="text-xs border-blue-400 text-blue-700 bg-blue-50">Insurance Claim</Badge>
              )}
              {issue.warrantyClaimFlag && (
                <Badge variant="outline" className="text-xs border-purple-400 text-purple-700 bg-purple-50">Warranty Claim</Badge>
              )}
              {issue.rcaRequired && !issue.rcaSummary && (
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 bg-amber-50">
                  <SearchCode className="h-3 w-3 mr-1" /> RCA Required
                </Badge>
              )}
              {issue.rcaRequired && issue.rcaSummary?.status === 'approved' && (
                <Badge variant="outline" className="text-xs border-green-500 text-green-700 bg-green-50">
                  <CheckCircle className="h-3 w-3 mr-1" /> RCA Approved
                </Badge>
              )}
              {issue.rcaDueDate && new Date(issue.rcaDueDate) < new Date() && issue.rcaSummary?.status !== 'approved' && (
                <Badge variant="outline" className="text-xs border-red-500 text-red-700 bg-red-50">
                  <Clock className="h-3 w-3 mr-1" /> RCA Overdue
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
                {issue.status === "captured" && (
                  <Link href={`/oi/issues/${issueId}/classify`}>
                    <Button size="sm" variant="outline" className="gap-1 text-xs">
                      <Activity className="h-3 w-3" /> Classify & Assign
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {/* Main details */}
          <Card className="md:col-span-2 space-y-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">Issue Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">Description</p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{issue.description}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Category"         value={issue.category} />
                <Field label="Project Phase"    value={issue.projectPhase} />
                <Field label="Sub-Category"     value={issue.subCategory} />
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
            {/* Project / Customer / Vendor — always show if linked */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> Ownership & Links
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Field label="Reported by"       value={issue.reportedBy ? `User #${issue.reportedBy}` : null} />
                <Field label="Assigned to"       value={issue.assignedTo ? `User #${issue.assignedTo}` : "Unassigned"} />
                <Field label="Risk owner"        value={issue.riskOwner ? `User #${issue.riskOwner}` : null} />
                <Field label="Escalation owner"  value={issue.escalationOwner ? `User #${issue.escalationOwner}` : null} />
                {issue.projectDisplayName && <Field label="Project" value={issue.projectDisplayName} />}
                {issue.customerName && <Field label="Customer" value={`${issue.customerName}${issue.customerBpCode ? ` (${issue.customerBpCode})` : ""}`} />}
                {issue.vendorName && <Field label="Vendor" value={`${issue.vendorName}${issue.vendorSapCode ? ` (${issue.vendorSapCode})` : ""}`} />}
              </CardContent>
            </Card>

            {/* SLA */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> SLA Dates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Field label="Response due"  value={issue.responseDueAt ? fmtDate(issue.responseDueAt) : undefined} />
                <Field label="Closure due"   value={issue.closureDueAt  ? fmtDate(issue.closureDueAt)  : undefined} />
                <Field label="Occurred"      value={issue.occurredAt    ? fmtDate(issue.occurredAt)    : undefined} />
                <Field label="Detected"      value={issue.detectedAt    ? fmtDate(issue.detectedAt)    : undefined} />
                <Field label="Reported"      value={fmtDateTime(issue.createdAt)} />
                {issue.rcaRequired && <Field label="RCA due"      value={issue.rcaDueDate ? fmtDate(issue.rcaDueDate) : "Not set"} />}
              </CardContent>
            </Card>

            {/* Risk */}
            {(issue.riskRating || issue.probabilityLevel || issue.impactLevel || issue.oiRiskScore != null) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" /> Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <Field label="P×I Risk Rating"    value={issue.riskRating} />
                  <Field label="P×I Score"          value={issue.riskScore != null ? String(issue.riskScore) : undefined} />
                  <Field label="OI Risk Score"      value={issue.oiRiskScore != null ? String(issue.oiRiskScore) : undefined} />
                  <Field label="Probability"        value={issue.probabilityLevel} />
                  <Field label="Impact"             value={issue.impactLevel} />
                  <Field label="Recurrence"         value={issue.recurrenceRisk} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Phase 1B: EPC Reference Linkage panel */}
        {hasLinkageData && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-teal-600" /> EPC Reference Linkage
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {issue.drawingNumber && (
                <div>
                  <p className="text-xs text-gray-400">Drawing</p>
                  <p className="text-sm font-medium text-gray-800">{issue.drawingNumber}</p>
                  {issue.drawingRevision && <p className="text-xs text-gray-500">Rev {issue.drawingRevision}</p>}
                  {issue.drawingTitle && <p className="text-xs text-gray-500 truncate">{issue.drawingTitle}</p>}
                </div>
              )}
              {issue.poNumber && (
                <div>
                  <p className="text-xs text-gray-400">Purchase Order</p>
                  <p className="text-sm font-medium text-gray-800">{issue.poNumber}</p>
                </div>
              )}
              {issue.woNumber && (
                <div>
                  <p className="text-xs text-gray-400">Work Order</p>
                  <p className="text-sm font-medium text-gray-800">{issue.woNumber}</p>
                </div>
              )}
              {issue.inspectionOrderNumber && (
                <div>
                  <p className="text-xs text-gray-400">Inspection Order</p>
                  <p className="text-sm font-medium text-gray-800">{issue.inspectionOrderNumber}</p>
                </div>
              )}
              {issue.fatInspectionOrderNumber && (
                <div>
                  <p className="text-xs text-gray-400">FAT Inspection Order</p>
                  <p className="text-sm font-medium text-gray-800">{issue.fatInspectionOrderNumber}</p>
                </div>
              )}
              {issue.satInspectionOrderNumber && (
                <div>
                  <p className="text-xs text-gray-400">SAT Inspection Order</p>
                  <p className="text-sm font-medium text-gray-800">{issue.satInspectionOrderNumber}</p>
                </div>
              )}
              {issue.contractNumber && (
                <div>
                  <p className="text-xs text-gray-400">Contract</p>
                  <p className="text-sm font-medium text-gray-800">{issue.contractNumber}</p>
                  {issue.contractTitle && <p className="text-xs text-gray-500 truncate">{issue.contractTitle}</p>}
                  {issue.contractValue && <p className="text-xs text-gray-500">Value: {formatINR(issue.contractValue)}</p>}
                </div>
              )}
              {issue.fatReference && <Field label="FAT Reference" value={issue.fatReference} />}
              {issue.satReference && <Field label="SAT Reference" value={issue.satReference} />}
            </CardContent>
          </Card>
        )}

        {/* Phase 1B: Dimension Scores panel (Manager+) */}
        {isManager && hasDimensionScores && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-indigo-500" /> Risk Dimension Scores
                {issue.oiRiskScore != null && (
                  <span className="ml-auto text-xs font-normal text-gray-500">
                    OI Risk Score: <strong className="text-indigo-700">{issue.oiRiskScore}</strong>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 md:grid-cols-9 gap-3">
                {Object.entries(DIMENSION_LABELS).map(([key, label]) => (
                  <DimensionScoreBar key={key} label={label} score={issue[key] ?? null} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Phase 1B: Financial Exposure (SM+) */}
        {isSM && hasFinancialData && (
          <Card className="border-l-4 border-l-orange-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-orange-500" /> Financial Exposure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Estimated Loss</p>
                  <p className="font-semibold text-gray-800">{formatINR(issue.estimatedLossAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Actual Loss</p>
                  <p className="font-semibold text-red-700">{formatINR(issue.actualLossAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Recovered</p>
                  <p className="font-semibold text-green-700">{formatINR(issue.recoveryAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Net Exposure</p>
                  <p className="font-semibold text-orange-700">{formatINR(issue.netFinancialExposure)}</p>
                </div>
              </div>
              {(issue.insuranceClaimFlag || issue.claimReference) && (
                <div className="border rounded p-2 bg-blue-50 text-sm">
                  <span className="font-medium text-blue-800">Insurance Claim</span>
                  {issue.claimReference && <span className="text-blue-600 ml-2">Ref: {issue.claimReference}</span>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Phase 1B: Liability (SM+) */}
        {isSM && (issue.liabilityType || issue.indemnityRequired || issue.warrantyClaimFlag) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Scale className="h-4 w-4 text-purple-500" /> Liability
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Field label="Liability Type"    value={issue.liabilityType} />
              <Field label="Liability Severity" value={issue.liabilitySeverity} />
              {issue.indemnityRequired && (
                <div><p className="text-xs text-gray-400">Indemnity</p><Badge variant="outline" className="text-xs border-red-400 text-red-700">Required</Badge></div>
              )}
              {issue.warrantyClaimFlag && (
                <div>
                  <p className="text-xs text-gray-400">Warranty Claim</p>
                  <Badge variant="outline" className="text-xs border-purple-400 text-purple-700">Filed</Badge>
                  {issue.warrantyClaimReference && <p className="text-xs text-gray-500 mt-0.5">{issue.warrantyClaimReference}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Phase 1B: Time Intelligence (Manager+) */}
        {isManager && hasTimeData && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Timer className="h-4 w-4 text-cyan-500" /> Time Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Capture Delay</p>
                <p className="font-semibold text-gray-800">{formatHours(issue.captureDelayHours)}</p>
                <p className="text-xs text-gray-400">Detection → Report</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Response Time</p>
                <p className="font-semibold text-gray-800">{formatHours(issue.responseTimeActualHours)}</p>
                <p className="text-xs text-gray-400">Classify → Investigate</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Investigation Duration</p>
                <p className="font-semibold text-gray-800">{formatHours(issue.investigationDurationHours)}</p>
                <p className="text-xs text-gray-400">Start → Verified</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Total Resolution</p>
                <p className="font-semibold text-blue-700">{formatHours(issue.totalResolutionHours)}</p>
                <p className="text-xs text-gray-400">Classify → Close</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Phase 1C: RCA Card */}
        {issue.rcaRequired && (
          <Card className={`border-l-4 ${issue.rcaSummary?.status === 'approved' ? 'border-l-green-500' : issue.rcaDueDate && new Date(issue.rcaDueDate) < new Date() ? 'border-l-red-500' : 'border-l-amber-400'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <SearchCode className="h-4 w-4" /> Root Cause Analysis
                {issue.rcaSummary && (
                  <span className={`ml-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${RCA_STATUS_COLORS[issue.rcaSummary.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {RCA_STATUS_LABELS[issue.rcaSummary.status] ?? issue.rcaSummary.status}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {issue.rcaSummary ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-xs text-gray-400">Root Cause</p><p className="font-medium">{issue.rcaSummary.rootCauseLabel}</p></div>
                  <div><p className="text-xs text-gray-400">Methodology</p><p className="font-medium">{issue.rcaSummary.methodology?.replace(/_/g,' ')}</p></div>
                  <div><p className="text-xs text-gray-400">Revision</p><p className="font-medium">Rev {issue.rcaSummary.revisionNumber}</p></div>
                  {issue.rcaSummary.approvedAt && <div><p className="text-xs text-gray-400">Approved</p><p className="font-medium">{fmtDate(issue.rcaSummary.approvedAt)}</p></div>}
                  {issue.rcaSummary.assignedToName && <div><p className="text-xs text-gray-400">Assigned To</p><p className="font-medium">{issue.rcaSummary.assignedToName}</p></div>}
                  <div><p className="text-xs text-gray-400">Evidence Files</p><p className="font-medium">{issue.rcaSummary.evidenceCount}</p></div>
                </div>
              ) : (
                <p className="text-sm text-amber-700">RCA has not been started yet.{issue.rcaDueDate && <span> Due: {fmtDate(issue.rcaDueDate)}.</span>}</p>
              )}
              <WouterLink href={`/oi/issues/${issueId}/rca`}>
                <button className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
                  <SearchCode className="h-3 w-3" /> {issue.rcaSummary ? 'View / Edit RCA' : 'Start RCA'} →
                </button>
              </WouterLink>
            </CardContent>
          </Card>
        )}

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
