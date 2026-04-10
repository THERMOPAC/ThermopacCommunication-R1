import { useState, useMemo } from "react";
import { useProjectFilter } from "@/hooks/use-project-filter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, fetchWithProjectAccess } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import EpcDocumentPanel from "@/components/epc-document-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectAccessDenied, isProjectAccessDenied } from "@/components/project-access-denied";
import {
  Loader2, Search, Filter, ClipboardCheck, ShieldCheck, CheckCircle2,
  XCircle, ChevronDown, ChevronRight, RefreshCw, AlertTriangle,
  Play, CircleCheck, Undo2, Calendar, Eye, Wrench, Lock,
} from "lucide-react";

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};

const QP_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  under_preparation: "bg-amber-100 text-amber-800",
  ready_for_inspection_setup: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-800",
};
const QP_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", under_preparation: "Under Preparation", ready_for_inspection_setup: "Ready for Inspection",
  cancelled: "Cancelled", superseded: "Superseded",
};

const IE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
  rework_required: "bg-orange-100 text-orange-800",
  closed: "bg-violet-100 text-violet-800",
  cancelled: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-800",
};
const IE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", scheduled: "Scheduled", in_progress: "In Progress",
  completed: "Passed", failed: "Failed", rework_required: "Rework Required",
  closed: "Closed", cancelled: "Cancelled", superseded: "Superseded",
};

type ActionDef = {
  key: string; label: string; icon: any;
  variant: "default" | "destructive" | "outline" | "secondary";
  minRoleLevel: number; statusRequired: string[];
  needsNote?: boolean; noteLabel?: string; noteKey?: string; noteRequired?: boolean;
  needsResult?: boolean; needsDate?: boolean;
};

const QP_ACTIONS: ActionDef[] = [
  { key: "start-preparation", label: "Start Preparation", icon: Play, variant: "default", minRoleLevel: 3, statusRequired: ["draft"] },
  { key: "mark-ready", label: "Mark Ready for Inspection", icon: CircleCheck, variant: "default", minRoleLevel: 3, statusRequired: ["under_preparation"], needsNote: true, noteLabel: "Preparation Note", noteKey: "preparationNote" },
  { key: "revert-to-preparation", label: "Revert to Preparation", icon: Undo2, variant: "outline", minRoleLevel: 3, statusRequired: ["ready_for_inspection_setup"] },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 3, statusRequired: ["draft", "under_preparation", "ready_for_inspection_setup"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason", noteRequired: true },
];

const IE_ACTIONS: ActionDef[] = [
  { key: "schedule", label: "Schedule", icon: Calendar, variant: "default", minRoleLevel: 3, statusRequired: ["draft"], needsDate: true },
  { key: "start", label: "Start Inspection", icon: Play, variant: "default", minRoleLevel: 3, statusRequired: ["scheduled"] },
  { key: "complete", label: "Record Result", icon: CircleCheck, variant: "default", minRoleLevel: 3, statusRequired: ["in_progress"], needsResult: true, needsNote: true, noteLabel: "Findings", noteKey: "findings" },
  { key: "fail", label: "Mark Failed", icon: XCircle, variant: "destructive", minRoleLevel: 3, statusRequired: ["in_progress"], needsNote: true, noteLabel: "Failure Reason", noteKey: "failureReason", noteRequired: true },
  { key: "mark-rework-required", label: "Require Rework", icon: Wrench, variant: "outline", minRoleLevel: 3, statusRequired: ["failed"], needsNote: true, noteLabel: "Rework Notes", noteKey: "reworkNotes" },
  { key: "close", label: "Close", icon: Lock, variant: "secondary", minRoleLevel: 2, statusRequired: ["completed", "rework_required"], needsNote: true, noteLabel: "Closing Notes", noteKey: "closingNotes" },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 3, statusRequired: ["draft", "scheduled", "in_progress"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason", noteRequired: true },
];

function DetailRow({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className={`font-medium break-all ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

function formatDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EpcQualityInspectionPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userRole = (user as any)?.role || "Employee";
  const userLevel = roleHierarchy[userRole] ?? 5;

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"quality" | "inspection">("quality");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ rec: any; action: ActionDef; tab: "quality" | "inspection" } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionResult, setActionResult] = useState<string>("pass");
  const [scheduledDate, setScheduledDate] = useState("");
  const [assignedInspector, setAssignedInspector] = useState<string>("");

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { data: allUsers = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { showAllProjects, setShowAllProjects, filteredProjects } = useProjectFilter(projects, selectedProjectId);

  const { data: qpRecords = [], isLoading: qpLoading, error: qpError } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "quality-plans"],
    queryFn: () => selectedProjectId ? fetchWithProjectAccess(`/api/projects/${selectedProjectId}/quality-plans`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const { data: ieRecords = [], isLoading: ieLoading, error: ieError } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "inspection-executions"],
    queryFn: () => selectedProjectId ? fetchWithProjectAccess(`/api/projects/${selectedProjectId}/inspection-executions`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const apiPrefix = activeTab === "quality" ? "quality-plans" : "inspection-executions";
  const { data: expandedDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: [`/api/${apiPrefix}`, expandedRow],
    queryFn: () => expandedRow ? fetch(`/api/${apiPrefix}/${expandedRow}`, { credentials: "include" }).then(r => r.json()) : Promise.resolve(null),
    enabled: !!expandedRow,
  });

  const currentRecords = activeTab === "quality" ? qpRecords : ieRecords;
  const isLoading = activeTab === "quality" ? qpLoading : ieLoading;
  const statusColors = activeTab === "quality" ? QP_STATUS_COLORS : IE_STATUS_COLORS;
  const statusLabels = activeTab === "quality" ? QP_STATUS_LABELS : IE_STATUS_LABELS;
  const actions = activeTab === "quality" ? QP_ACTIONS : IE_ACTIONS;
  const docType = activeTab === "quality" ? "QPL" : "INS";

  const filtered = useMemo(() => {
    let list = currentRecords;
    if (statusFilter !== "all") list = list.filter((r: any) => r.status === statusFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((r: any) =>
        (r.quality_plan_number || r.inspection_number || "").toLowerCase().includes(s) ||
        (r.item_code || "").toLowerCase().includes(s) ||
        (r.item_description || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [currentRecords, statusFilter, searchTerm]);

  const qpStats = useMemo(() => ({
    total: qpRecords.length,
    draft: qpRecords.filter((r: any) => r.status === "draft").length,
    underPrep: qpRecords.filter((r: any) => r.status === "under_preparation").length,
    ready: qpRecords.filter((r: any) => r.status === "ready_for_inspection_setup").length,
    cancelled: qpRecords.filter((r: any) => r.status === "canceled").length,
  }), [qpRecords]);

  const ieStats = useMemo(() => ({
    total: ieRecords.length,
    scheduled: ieRecords.filter((r: any) => r.status === "scheduled").length,
    inProgress: ieRecords.filter((r: any) => r.status === "in_progress").length,
    passed: ieRecords.filter((r: any) => r.status === "completed").length,
    failed: ieRecords.filter((r: any) => r.status === "failed").length,
    rework: ieRecords.filter((r: any) => r.status === "rework_required").length,
    closed: ieRecords.filter((r: any) => r.status === "closed").length,
  }), [ieRecords]);

  const lifecycleMutation = useMutation({
    mutationFn: async ({ id, action, prefix, body }: { id: number; action: string; prefix: string; body: any }) => {
      return await apiRequest("POST", `/api/${prefix}/${id}/${action}`, body);
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, activeTab === "quality" ? "quality-plans" : "inspection-executions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/${apiPrefix}`, expandedRow] });
      if (activeTab === "quality") {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "inspection-executions"] });
      }
      setActionDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Action failed", variant: "destructive" });
    },
  });

  function getAvailableActions(rec: any): ActionDef[] {
    return actions.filter((a) => {
      if (userLevel > a.minRoleLevel) return false;
      if (!a.statusRequired.includes(rec.status)) return false;
      return true;
    });
  }

  function openAction(rec: any, action: ActionDef) {
    setActionTarget({ rec, action, tab: activeTab });
    setActionNote("");
    setActionResult("pass");
    setScheduledDate("");
    setAssignedInspector("");
    setActionDialogOpen(true);
  }

  function executeAction() {
    if (!actionTarget) return;
    const { rec, action, tab } = actionTarget;
    const prefix = tab === "quality" ? "quality-plans" : "inspection-executions";
    const body: any = {};
    if (action.noteKey && actionNote) body[action.noteKey] = actionNote;
    if (action.needsResult) body.result = actionResult;
    if (action.needsDate && scheduledDate) body.scheduledDate = scheduledDate;
    if (action.key === "schedule" && assignedInspector) body.inspectorId = parseInt(assignedInspector);
    lifecycleMutation.mutate({ id: rec.id, action: action.key, prefix, body });
  }

  function getRecordNumber(rec: any) {
    return rec.quality_plan_number || rec.inspection_number || `REC-${rec.id}`;
  }

  function renderQpDetail(d: any, rec: any) {
    const rowActions = getAvailableActions(rec);
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <ClipboardCheck className="h-3 w-3" /> Quality Plan Details
            </h4>
            <div className="space-y-1">
              <DetailRow label="Plan #" value={d.quality_plan_number} mono />
              <DetailRow label="Status" value={QP_STATUS_LABELS[d.status] || d.status} />
              <DetailRow label="Source Context" value={d.source_context} />
              <DetailRow label="Requirement Type" value={d.quality_requirement_type} />
              <DetailRow label="Quality Notes" value={d.quality_notes} />
              {d.procurement_exec_id && <DetailRow label="Procurement Exec" value={`#${d.procurement_exec_id}`} mono />}
              {d.production_exec_id && <DetailRow label="Production Exec" value={`#${d.production_exec_id}`} mono />}
            </div>
          </Card>
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Item Details
            </h4>
            <div className="space-y-1">
              <DetailRow label="Item Code" value={d.item_code} mono />
              <DetailRow label="Description" value={d.item_description} />
              <DetailRow label="Specification" value={d.item_specification} />
              <DetailRow label="UOM" value={d.uom} />
              <DetailRow label="Quantity" value={d.quantity} />
              <DetailRow label="Drawing No" value={d.drawing_no} mono />
            </div>
          </Card>
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Lifecycle & Audit
            </h4>
            <div className="space-y-1">
              <DetailRow label="Created By" value={d.created_by_name} />
              <DetailRow label="Created" value={formatDate(d.created_at)} />
              <DetailRow label="Assigned To" value={d.assigned_to_name} />
              {d.prepared_by_name && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Prepared By" value={d.prepared_by_name} />
                  <DetailRow label="Prepared" value={formatDate(d.prepared_at)} />
                  {d.preparation_note && <DetailRow label="Preparation Note" value={d.preparation_note} />}
                </>
              )}
            </div>
          </Card>
        </div>
        {d.cancel_reason && (
          <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-[10px]">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5" />
            <div><span className="font-medium text-red-700">Cancel Reason:</span> <span className="text-red-600">{d.cancel_reason}</span></div>
          </div>
        )}
        <Separator />
        <div>
          <h4 className="text-[10px] font-semibold mb-1.5">Document Attachments</h4>
          <EpcDocumentPanel projectId={selectedProjectId!} docType="QPL" parentEntityId={rec.id} documentNumber={getRecordNumber(d)} userRole={userRole} compact={false} />
        </div>
        {rowActions.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-1.5">
              {rowActions.map((a) => (
                <Button key={a.key} size="sm" variant={a.variant} className="h-7 text-xs" onClick={() => openAction(rec, a)}>
                  <a.icon className="h-3.5 w-3.5 mr-1" /> {a.label}
                </Button>
              ))}
            </div>
          </>
        )}
      </>
    );
  }

  function renderIeDetail(d: any, rec: any) {
    const rowActions = getAvailableActions(rec);
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <Eye className="h-3 w-3" /> Inspection Details
            </h4>
            <div className="space-y-1">
              <DetailRow label="Inspection #" value={d.inspection_number} mono />
              <DetailRow label="Status" value={IE_STATUS_LABELS[d.status] || d.status} />
              <DetailRow label="Source Context" value={d.source_context} />
              <DetailRow label="Inspection Type" value={d.inspection_type} />
              <DetailRow label="Quality Plan" value={d.quality_plan_id ? `#${d.quality_plan_id}` : null} mono />
              {d.execution_record_id && <DetailRow label="Execution Record" value={`#${d.execution_record_id}`} mono />}
              <DetailRow label="Inspection Notes" value={d.inspection_notes} />
            </div>
          </Card>
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Item & Inspection Data
            </h4>
            <div className="space-y-1">
              <DetailRow label="Item Code" value={d.item_code} mono />
              <DetailRow label="Description" value={d.item_description} />
              <DetailRow label="Specification" value={d.item_specification} />
              <DetailRow label="UOM" value={d.uom} />
              <DetailRow label="Quantity" value={d.quantity} />
              <DetailRow label="Drawing No" value={d.drawing_no} mono />
              {d.result && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Result" value={
                    <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${d.result === "pass" ? "bg-emerald-100 text-emerald-800" : d.result === "conditional_pass" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
                      {d.result === "pass" ? "Pass" : d.result === "conditional_pass" ? "Conditional Pass" : "Fail"}
                    </Badge>
                  } />
                  {d.findings && <DetailRow label="Findings" value={d.findings} />}
                  {d.result_notes && <DetailRow label="Result Notes" value={d.result_notes} />}
                </>
              )}
            </div>
          </Card>
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Lifecycle & Audit
            </h4>
            <div className="space-y-1">
              <DetailRow label="Created By" value={d.created_by_name} />
              <DetailRow label="Created" value={formatDate(d.created_at)} />
              <DetailRow label="Assigned To" value={d.assigned_to_name} />
              {d.scheduled_date && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Scheduled Date" value={d.scheduled_date} />
                  <DetailRow label="Scheduled By" value={d.scheduled_by_name} />
                </>
              )}
              {d.started_at && <DetailRow label="Started" value={formatDate(d.started_at)} />}
              {d.completed_by_name && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Completed By" value={d.completed_by_name} />
                  <DetailRow label="Completed" value={formatDate(d.completed_at)} />
                </>
              )}
            </div>
          </Card>
        </div>
        {d.failure_reason && (
          <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-[10px]">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5" />
            <div><span className="font-medium text-red-700">Failure Reason:</span> <span className="text-red-600">{d.failure_reason}</span></div>
          </div>
        )}
        {d.cancel_reason && (
          <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-[10px]">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5" />
            <div><span className="font-medium text-red-700">Cancel Reason:</span> <span className="text-red-600">{d.cancel_reason}</span></div>
          </div>
        )}
        {d.status === "completed" && (
          <div className="flex items-start gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-[10px]">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
            <span className="text-emerald-700 font-medium">Inspection passed. Linked PO/WO quality status updated.</span>
          </div>
        )}
        {d.status === "rework_required" && (
          <div className="flex items-start gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-[10px]">
            <Wrench className="h-3.5 w-3.5 text-orange-500 mt-0.5" />
            <span className="text-orange-700 font-medium">Rework required before re-inspection or closure.</span>
          </div>
        )}
        {d.status === "closed" && (
          <div className="flex items-start gap-2 p-2 bg-violet-50 border border-violet-200 rounded text-[10px]">
            <Lock className="h-3.5 w-3.5 text-violet-500 mt-0.5" />
            <span className="text-violet-700 font-medium">Inspection record closed. No further actions.</span>
          </div>
        )}
        <Separator />
        <div>
          <h4 className="text-[10px] font-semibold mb-1.5">Document Attachments</h4>
          <EpcDocumentPanel projectId={selectedProjectId!} docType="INS" parentEntityId={rec.id} documentNumber={getRecordNumber(d)} userRole={userRole} compact={false} />
        </div>
        {rowActions.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-1.5">
              {rowActions.map((a) => (
                <Button key={a.key} size="sm" variant={a.variant} className="h-7 text-xs" onClick={() => openAction(rec, a)}>
                  <a.icon className="h-3.5 w-3.5 mr-1" /> {a.label}
                </Button>
              ))}
            </div>
          </>
        )}
      </>
    );
  }

  function renderTable() {
    if (!selectedProjectId) {
      return (
        <Card className="p-8 text-center">
          <ClipboardCheck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Select a project to view quality & inspection records</p>
        </Card>
      );
    }

    if (isProjectAccessDenied(qpError) || isProjectAccessDenied(ieError)) {
      return <ProjectAccessDenied />;
    }

    if (isLoading) {
      return <div className="py-12 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>;
    }

    if (filtered.length === 0) {
      return (
        <Card className="p-8 text-center">
          {activeTab === "quality" ? <ClipboardCheck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" /> : <Eye className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />}
          <p className="text-sm text-muted-foreground">{currentRecords.length === 0 ? `No ${activeTab === "quality" ? "quality planning" : "inspection"} records for this project.` : "No records match current filters."}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{activeTab === "quality" ? "Quality plans are auto-created when procurement/production execution records become ready." : "Inspection records are auto-created when quality plans become ready for inspection setup."}</p>
        </Card>
      );
    }

    const isQuality = activeTab === "quality";

    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] w-8"></TableHead>
              <TableHead className="text-[10px]">{isQuality ? "Quality Plan #" : "Inspection #"}</TableHead>
              <TableHead className="text-[10px]">Item Code</TableHead>
              <TableHead className="text-[10px]">Description</TableHead>
              {isQuality && <TableHead className="text-[10px]">Source</TableHead>}
              {!isQuality && <TableHead className="text-[10px]">Type</TableHead>}
              {!isQuality && <TableHead className="text-[10px]">Result</TableHead>}
              <TableHead className="text-[10px] text-center">Status</TableHead>
              <TableHead className="text-[10px]">Assigned To</TableHead>
              <TableHead className="text-[10px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((rec: any) => {
              const isExpanded = expandedRow === rec.id;
              const rowActions = getAvailableActions(rec);
              const recNum = getRecordNumber(rec);
              return (
                <>
                  <TableRow key={rec.id} className={`cursor-pointer hover:bg-muted/40 ${isExpanded ? "bg-muted/30" : ""}`} onClick={() => setExpandedRow(isExpanded ? null : rec.id)}>
                    <TableCell className="py-1.5">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </TableCell>
                    <TableCell className="py-1.5 font-mono text-[10px] font-medium">{recNum}</TableCell>
                    <TableCell className="py-1.5 text-[10px] font-mono">{rec.item_code || "—"}</TableCell>
                    <TableCell className="py-1.5 text-[10px] max-w-[160px] truncate">{rec.item_description || "—"}</TableCell>
                    {isQuality && <TableCell className="py-1.5 text-[10px]">{rec.source_context || "—"}</TableCell>}
                    {!isQuality && <TableCell className="py-1.5 text-[10px]">{rec.inspection_type || "—"}</TableCell>}
                    {!isQuality && (
                      <TableCell className="py-1.5 text-[10px]">
                        {rec.result ? (
                          <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${rec.result === "pass" ? "bg-emerald-100 text-emerald-800" : rec.result === "conditional_pass" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
                            {rec.result === "pass" ? "Pass" : rec.result === "conditional_pass" ? "Cond. Pass" : "Fail"}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                    )}
                    <TableCell className="py-1.5 text-center">
                      <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${statusColors[rec.status] || ""}`}>
                        {statusLabels[rec.status] || rec.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5 text-[10px]">{rec.assigned_to_name || "—"}</TableCell>
                    <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {rowActions.slice(0, 2).map((a) => (
                          <Button key={a.key} size="sm" variant={a.variant} className="h-6 px-1.5 text-[9px]" onClick={() => openAction(rec, a)}>
                            <a.icon className="h-3 w-3 mr-0.5" /> {a.label}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${rec.id}-detail`}>
                      <TableCell colSpan={isQuality ? 8 : 9} className="p-0 bg-muted/10">
                        <div className="p-3 space-y-3">
                          {detailLoading ? (
                            <div className="py-4 text-center"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>
                          ) : expandedDetail ? (
                            isQuality ? renderQpDetail(expandedDetail, rec) : renderIeDetail(expandedDetail, rec)
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    );
  }

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              EPC Quality & Inspection Control
            </h1>
            <p className="text-xs text-muted-foreground">Quality planning and inspection execution lifecycle management</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => {
            if (selectedProjectId) {
              queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "quality-plans"] });
              queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "inspection-executions"] });
            }
          }}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-52">
            <Label className="text-[10px]">Project</Label>
            <Select value={selectedProjectId ? String(selectedProjectId) : ""} onValueChange={(v) => { setSelectedProjectId(parseInt(v)); setExpandedRow(null); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select project…" /></SelectTrigger>
              <SelectContent>
                {filteredProjects.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)} className="text-xs">{p.code} — {p.clientName || p.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 pb-1">
            <Checkbox id="showAllProjects" checked={showAllProjects} onCheckedChange={(v) => setShowAllProjects(!!v)} className="h-3.5 w-3.5" />
            <label htmlFor="showAllProjects" className="text-[10px] text-muted-foreground cursor-pointer select-none">Show All</label>
          </div>
          <div className="w-52 relative">
            <Label className="text-[10px]">Search</Label>
            <Search className="absolute left-2 top-[22px] h-3.5 w-3.5 text-muted-foreground" />
            <Input className="h-8 text-xs pl-7" placeholder="Plan #, inspection #, item…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="w-40">
            <Label className="text-[10px]">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setExpandedRow(null); setStatusFilter("all"); }}>
          <TabsList>
            <TabsTrigger value="quality" className="text-xs gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" /> Quality Plans ({qpRecords.length})
            </TabsTrigger>
            <TabsTrigger value="inspection" className="text-xs gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Inspections ({ieRecords.length})
            </TabsTrigger>
          </TabsList>

          {selectedProjectId && activeTab === "quality" && qpRecords.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold">{qpStats.total}</p><p className="text-[9px] text-muted-foreground">Total Plans</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-slate-600">{qpStats.draft}</p><p className="text-[9px] text-muted-foreground">Draft</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-amber-600">{qpStats.underPrep}</p><p className="text-[9px] text-muted-foreground">Under Prep</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-emerald-600">{qpStats.ready}</p><p className="text-[9px] text-muted-foreground">Ready</p></CardContent></Card>
            </div>
          )}

          {selectedProjectId && activeTab === "inspection" && ieRecords.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mt-3">
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold">{ieStats.total}</p><p className="text-[9px] text-muted-foreground">Total</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-blue-600">{ieStats.scheduled}</p><p className="text-[9px] text-muted-foreground">Scheduled</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-amber-600">{ieStats.inProgress}</p><p className="text-[9px] text-muted-foreground">In Progress</p></CardContent></Card>
              <Card className="p-2 border-emerald-200 bg-emerald-50/30"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-emerald-600">{ieStats.passed}</p><p className="text-[9px] text-muted-foreground">Passed</p></CardContent></Card>
              <Card className="p-2 border-red-200 bg-red-50/30"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-red-600">{ieStats.failed}</p><p className="text-[9px] text-muted-foreground">Failed</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-orange-600">{ieStats.rework}</p><p className="text-[9px] text-muted-foreground">Rework</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-violet-600">{ieStats.closed}</p><p className="text-[9px] text-muted-foreground">Closed</p></CardContent></Card>
            </div>
          )}

          <TabsContent value="quality" className="mt-3">{renderTable()}</TabsContent>
          <TabsContent value="inspection" className="mt-3">{renderTable()}</TabsContent>
        </Tabs>

        <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actionTarget?.action.label} — {actionTarget?.rec && getRecordNumber(actionTarget.rec)}</DialogTitle>
              <DialogDescription>
                {actionTarget?.action.key === "schedule" ? "Schedule this inspection with a date. An inspector can optionally be assigned."
                  : actionTarget?.action.key === "complete" ? "Record the inspection result. This will update linked PO/WO quality status."
                  : actionTarget?.action.key === "fail" ? "Mark this inspection as failed. An NCR task will be created automatically and linked PO/WO will be blocked."
                  : actionTarget?.action.key === "mark-rework-required" ? "Mark this failed inspection for rework. The item must be reworked before re-inspection or closure."
                  : actionTarget?.action.key === "close" ? "Close this inspection record. This is a final action — Senior Manager+ required."
                  : actionTarget?.action.key === "mark-ready" ? "Mark this quality plan ready for inspection setup. An inspection execution record will be auto-created."
                  : actionTarget?.action.key === "revert-to-preparation" ? "Revert to preparation. Only possible if no active inspection records exist."
                  : "Confirm lifecycle action."}
              </DialogDescription>
            </DialogHeader>
            {actionTarget?.action.needsDate && (
              <div>
                <Label className="text-xs">Scheduled Date *</Label>
                <Input type="date" className="text-xs" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
            )}
            {actionTarget?.action.key === "schedule" && (
              <div>
                <Label className="text-xs">Assign Inspector *</Label>
                <Select value={assignedInspector} onValueChange={setAssignedInspector}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="Select inspector…" /></SelectTrigger>
                  <SelectContent>
                    {allUsers.filter((u: any) => u.isActive).map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)} className="text-xs">{u.username} {u.role ? `(${u.role})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {actionTarget?.action.needsResult && (
              <div>
                <Label className="text-xs">Inspection Result *</Label>
                <Select value={actionResult} onValueChange={setActionResult}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass" className="text-xs">Pass</SelectItem>
                    <SelectItem value="conditional_pass" className="text-xs">Conditional Pass</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {actionTarget?.action.needsNote && (
              <div>
                <Label className="text-xs">{actionTarget.action.noteLabel}</Label>
                <Textarea className="text-xs min-h-[80px]" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder={actionTarget.action.noteRequired ? "Required…" : "Optional…"} />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                variant={actionTarget?.action.variant || "default"}
                onClick={executeAction}
                disabled={lifecycleMutation.isPending || (actionTarget?.action.noteRequired && !actionNote) || (actionTarget?.action.needsDate && !scheduledDate) || (actionTarget?.action.key === "schedule" && !assignedInspector)}
              >
                {lifecycleMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {actionTarget?.action.label}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
