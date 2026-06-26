import { useState, useMemo } from "react";
import { getProjectDisplayName } from "@/lib/project-utils";
import { fmtDate } from "@/lib/date-format";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, fetchWithProjectAccess } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useProjectFilter } from "@/hooks/use-project-filter";
import { Checkbox } from "@/components/ui/checkbox";
import Layout from "@/components/layout";
import EpcDocumentPanel from "@/components/epc-document-panel";
import DrawingEngineeringChanges from "@/components/drawing-engineering-changes";
import DesignDataGenerator from "@/components/design-data-generator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ProjectAccessDenied, isProjectAccessDenied } from "@/components/project-access-denied";
import {
  Loader2, Search, Filter, PenTool, Edit, Send, CheckCircle2, ShieldCheck,
  Unlock, XCircle, RotateCcw, ArrowUpDown, ChevronDown, ChevronRight,
  RefreshCw, AlertTriangle, FileText, Eye, UserCheck, UploadCloud, FileX, Clock,
} from "lucide-react";

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};

function userRoleLevel(role: string): number {
  return roleHierarchy[role] ?? 5;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-300",
  under_review: "bg-blue-100 text-blue-700 border-blue-300",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-300",
  released: "bg-green-100 text-green-700 border-green-300",
  superseded: "bg-orange-100 text-orange-600 border-orange-300",
  cancelled: "bg-red-50 text-red-500 border-red-200",
  canceled: "bg-red-50 text-red-500 border-red-200",
  on_hold_pending_cancellation_review: "bg-amber-100 text-amber-800 border-amber-400",
  pending_upload: "bg-amber-100 text-amber-700 border-amber-400",
  file_not_available: "bg-gray-100 text-gray-500 border-gray-300",
};

const STATUS_LABELS: Record<string, string> = {
  pending_upload: "Awaiting Upload",
  file_not_available: "No File",
  on_hold_pending_cancellation_review: "On Hold (Cancellation)",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] || status?.replace(/_/g, " ");
  const Icon = status === "pending_upload" ? UploadCloud : status === "file_not_available" ? FileX : null;
  return (
    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600 border-gray-300"}`}>
      {Icon && <Icon className="h-2.5 w-2.5 mr-0.5 inline" />}
      {label}
    </Badge>
  );
}

function GateBadge({ label, active, required }: { label: string; active: boolean; required: boolean }) {
  if (!required) return <span className="text-[8px] text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={`text-[8px] px-1 py-0 border ${active ? "bg-green-50 text-green-600 border-green-200" : "bg-yellow-50 text-yellow-600 border-yellow-200"}`}>
      {label} {active ? "✓" : "○"}
    </Badge>
  );
}


type DrawingControl = {
  id: number;
  dwg_control_number: string;
  revision_code: string;
  is_current: boolean;
  status: string;
  project_id: number;
  project_item_id: number;
  master_item_id: number;
  design_drawing_id: number | null;
  drawing_number: string | null;
  drawing_title: string | null;
  drawing_revision: string | null;
  drawing_category: string | null;
  discipline_code: string | null;
  item_code: string | null;
  item_description: string | null;
  classification_snapshot: string | null;
  drawing_purpose: string | null;
  procurement_release_required: boolean;
  manufacturing_release_required: boolean;
  released_for_procurement: boolean;
  released_for_manufacturing: boolean;
  released_for_procurement_at: string | null;
  released_for_manufacturing_at: string | null;
  client_approval_required: boolean;
  client_approval_status: string | null;
  client_approved_at: string | null;
  client_approved_by: string | null;
  notes: string | null;
  created_by: number;
  created_at: string;
  submitted_by: number | null;
  submitted_at: string | null;
  submission_note: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_note: string | null;
  review_recommendation: string | null;
  approved_by: number | null;
  approved_at: string | null;
  approval_note: string | null;
  released_by: number | null;
  released_at: string | null;
  release_note: string | null;
  cancelled_by: number | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  superseded_by: number | null;
  superseded_at: string | null;
  supersession_reason: string | null;
  supersedes_id: number | null;
  attachment_count: number;
};

type ActionDef = {
  key: string;
  label: string;
  icon: any;
  variant: "default" | "destructive" | "outline" | "secondary";
  minRoleLevel: number;
  statusRequired: string[];
  extraCheck?: (rec: DrawingControl) => boolean;
  needsNote?: boolean;
  noteLabel?: string;
  noteKey?: string;
};

const LIFECYCLE_ACTIONS: ActionDef[] = [
  { key: "submit-for-review", label: "Submit for Review", icon: Send, variant: "default", minRoleLevel: 4, statusRequired: ["draft"], needsNote: true, noteLabel: "Submission Note", noteKey: "submissionNote", extraCheck: (r) => (r.attachment_count || 0) > 0 },
  { key: "review", label: "Review", icon: Eye, variant: "default", minRoleLevel: 3, statusRequired: ["under_review"], needsNote: true, noteLabel: "Review Note", noteKey: "reviewNote" },
  { key: "approve", label: "Approve", icon: CheckCircle2, variant: "default", minRoleLevel: 2, statusRequired: ["under_review"], extraCheck: (r) => !!r.reviewed_at },
  { key: "release", label: "Release", icon: ShieldCheck, variant: "default", minRoleLevel: 2, statusRequired: ["approved"], needsNote: true, noteLabel: "Release Note", noteKey: "releaseNote" },
  { key: "release-gate-procurement", label: "Mark Released for Procurement", icon: Unlock, variant: "outline", minRoleLevel: 3, statusRequired: ["released"], extraCheck: (r) => r.procurement_release_required && !r.released_for_procurement },
  { key: "release-gate-manufacturing", label: "Mark Released for Manufacturing", icon: Unlock, variant: "outline", minRoleLevel: 3, statusRequired: ["released"], extraCheck: (r) => r.manufacturing_release_required && !r.released_for_manufacturing },
  { key: "client-approval", label: "Record Client Approval", icon: UserCheck, variant: "outline", minRoleLevel: 3, statusRequired: ["draft", "under_review"], extraCheck: (r) => r.client_approval_required && r.client_approval_status !== "approved" },
  { key: "revert-to-draft", label: "Revert to Draft", icon: RotateCcw, variant: "secondary", minRoleLevel: 3, statusRequired: ["under_review"] },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 2, statusRequired: ["under_review", "approved"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason" },
];

export default function EpcDrawingControlPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userRole = user?.role || "Employee";
  const userLevel = userRoleLevel(userRole);

  const [projectId, setProjectId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllRevisions, setShowAllRevisions] = useState(false);
  const [filterProcReleased, setFilterProcReleased] = useState<string>("all");
  const [filterMfgReleased, setFilterMfgReleased] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<Set<number>>(new Set());

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DrawingControl | null>(null);

  const [actionDialog, setActionDialog] = useState<{
    open: boolean; action: ActionDef | null; record: DrawingControl | null;
  }>({ open: false, action: null, record: null });
  const [actionNote, setActionNote] = useState("");
  const [reviewRecommendation, setReviewRecommendation] = useState("approve");

  const [clientApprovalStatus, setClientApprovalStatus] = useState("approved");
  const [clientApprovedBy, setClientApprovedBy] = useState("");
  const [clientApprovalNotes, setClientApprovalNotes] = useState("");

  const [editForm, setEditForm] = useState({
    drawingNumber: "", drawingTitle: "", drawingRevision: "", drawingCategory: "",
    disciplineCode: "", drawingPurpose: "general", notes: "",
    clientApprovalRequired: false, procurementReleaseRequired: true, manufacturingReleaseRequired: true,
  });

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { showAllProjects, setShowAllProjects, filteredProjects } = useProjectFilter(projects, projectId);
  const selectedProject = (projects as any[]).find((p: any) => p.id === projectId);
  const projectDisciplineCode: string | null = selectedProject?.disciplineCode || selectedProject?.discipline_code || null;
  const { data: drawingControls = [], isLoading, isFetching, refetch, error: recordsError } = useQuery<DrawingControl[]>({
    queryKey: ["/api/projects", projectId, "drawing-controls"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/drawing-controls`),
    enabled: !!projectId,
  });
  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "drawing-controls"] });
    refetch();
  }

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => apiRequest("PATCH", `/api/drawing-controls/${id}`, body),
    onSuccess: () => {
      toast({ title: "Drawing Control Updated" });
      invalidateAll();
      setEditDialogOpen(false);
      setEditTarget(null);
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const lifecycleMutation = useMutation({
    mutationFn: async ({ endpoint, body }: { endpoint: string; body: any }) => apiRequest("POST", endpoint, body),
    onSuccess: (data: any) => {
      toast({ title: "Action completed", description: data.message || "Success" });
      invalidateAll();
      setActionDialog({ open: false, action: null, record: null });
      setSupersedeDialog({ open: false, record: null });
      setActionNote("");
      setSupersedeReason("");
      setSupersedeNewRevision("");
    },
    onError: (err: any) => toast({ title: "Action failed", description: err.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    let list = drawingControls;
    if (!showAllRevisions) list = list.filter(d => d.is_current);
    if (statusFilter !== "all") list = list.filter(d => d.status === statusFilter);
    if (filterProcReleased === "yes") list = list.filter(d => d.released_for_procurement);
    if (filterProcReleased === "no") list = list.filter(d => d.procurement_release_required && !d.released_for_procurement);
    if (filterMfgReleased === "yes") list = list.filter(d => d.released_for_manufacturing);
    if (filterMfgReleased === "no") list = list.filter(d => d.manufacturing_release_required && !d.released_for_manufacturing);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(d =>
        d.dwg_control_number?.toLowerCase().includes(term) ||
        d.drawing_number?.toLowerCase().includes(term) ||
        d.item_code?.toLowerCase().includes(term) ||
        d.item_description?.toLowerCase().includes(term) ||
        d.drawing_title?.toLowerCase().includes(term)
      );
    }
    return list;
  }, [drawingControls, showAllRevisions, statusFilter, filterProcReleased, filterMfgReleased, searchTerm]);

  const stats = useMemo(() => {
    const all = showAllRevisions ? drawingControls : drawingControls.filter(d => d.is_current);
    return {
      total: all.length,
      draft: all.filter(d => d.status === "draft").length,
      under_review: all.filter(d => d.status === "under_review").length,
      approved: all.filter(d => d.status === "approved").length,
      released: all.filter(d => d.status === "released").length,
      superseded: all.filter(d => d.status === "superseded").length,
      cancelled: all.filter(d => d.status === "canceled").length,
    };
  }, [drawingControls, showAllRevisions]);

  function getAvailableActions(rec: DrawingControl): ActionDef[] {
    return LIFECYCLE_ACTIONS.filter(a => {
      if (userLevel > a.minRoleLevel) return false;
      if (!a.statusRequired.includes(rec.status)) return false;
      if (a.extraCheck && !a.extraCheck(rec)) return false;
      return true;
    });
  }

  function executeAction(action: ActionDef, rec: DrawingControl) {
    if (action.key === "client-approval") {
      setActionDialog({ open: true, action, record: rec });
      setClientApprovalStatus("approved");
      setClientApprovedBy("");
      setClientApprovalNotes("");
      return;
    }
    setActionDialog({ open: true, action, record: rec });
    setActionNote("");
    if (action.key === "review") setReviewRecommendation("approve");
  }

  function submitAction() {
    const { action, record } = actionDialog;
    if (!action || !record) return;

    let endpoint = `/api/drawing-controls/${record.id}/${action.key}`;
    let body: any = {};

    if (action.key === "review") {
      body = { reviewNote: actionNote || null, recommendation: reviewRecommendation };
    } else if (action.key === "client-approval") {
      endpoint = `/api/drawing-controls/${record.id}/client-approval`;
      body = { status: clientApprovalStatus, clientApprovedBy: clientApprovedBy || null, notes: clientApprovalNotes || null };
    } else if (action.key === "release-gate-procurement") {
      endpoint = `/api/drawing-controls/${record.id}/release-gate`;
      body = { gateType: "procurement" };
    } else if (action.key === "release-gate-manufacturing") {
      endpoint = `/api/drawing-controls/${record.id}/release-gate`;
      body = { gateType: "manufacturing" };
    } else if (action.needsNote && action.noteKey) {
      body[action.noteKey] = actionNote || null;
    }

    lifecycleMutation.mutate({ endpoint, body });
  }

  function openEditDialog(rec: DrawingControl) {
    setEditTarget(rec);
    setEditForm({
      drawingNumber: rec.drawing_number || "", drawingTitle: rec.drawing_title || "",
      drawingRevision: rec.drawing_revision || "", drawingCategory: rec.classification_snapshot || rec.drawing_category || "",
      disciplineCode: rec.discipline_code || "", drawingPurpose: rec.drawing_purpose || "general",
      notes: rec.notes || "", clientApprovalRequired: rec.client_approval_required || false,
      procurementReleaseRequired: rec.procurement_release_required, manufacturingReleaseRequired: rec.manufacturing_release_required,
    });
    setEditDialogOpen(true);
  }

  function submitEdit() {
    if (!editTarget) return;
    editMutation.mutate({ id: editTarget.id, body: editForm });
  }

  return (
    <Layout>
      <TooltipProvider>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <PenTool className="h-5 w-5" /> EPC Drawing Controls
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Operational source of truth for released/current EPC drawing revisions
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={projectId?.toString() || ""} onValueChange={(v) => { setProjectId(parseInt(v)); setExpandedId(null); }}>
                <SelectTrigger className="w-[600px] h-8 text-xs">
                  <SelectValue placeholder="Select project..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()} className="text-xs">
                      {getProjectDisplayName(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <Checkbox id="showAllProjects" checked={showAllProjects} onCheckedChange={(v) => setShowAllProjects(!!v)} className="h-3.5 w-3.5" />
                <label htmlFor="showAllProjects" className="text-[10px] text-muted-foreground cursor-pointer select-none">Show All</label>
              </div>
              <Button size="sm" variant="outline" className="h-8" onClick={invalidateAll} disabled={isFetching}>
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {!projectId ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Select a project to view drawing controls.</CardContent></Card>
          ) : isProjectAccessDenied(recordsError) ? (
            <ProjectAccessDenied />
          ) : isLoading ? (
            <div className="py-12 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-7 gap-2">
                {([
                  { label: "Total", value: stats.total, color: "text-foreground" },
                  { label: "Draft", value: stats.draft, color: "text-slate-600" },
                  { label: "Under Review", value: stats.under_review, color: "text-blue-600" },
                  { label: "Approved", value: stats.approved, color: "text-emerald-600" },
                  { label: "Released", value: stats.released, color: "text-green-600" },
                  { label: "Superseded", value: stats.superseded, color: "text-orange-600" },
                  { label: "Cancelled", value: stats.cancelled, color: "text-red-500" },
                ] as const).map((s) => (
                  <Card key={s.label} className="shadow-sm">
                    <CardContent className="py-2 px-3 text-center">
                      <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-[9px] text-muted-foreground">{s.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="pl-7 h-8 text-xs w-[200px]" placeholder="Search DWG#, drawing#, item..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs w-[130px]"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                    {["draft", "under_review", "approved", "released", "superseded", "canceled"].map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterProcReleased} onValueChange={setFilterProcReleased}>
                  <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Procurement: All</SelectItem>
                    <SelectItem value="yes" className="text-xs">Procurement: Released</SelectItem>
                    <SelectItem value="no" className="text-xs">Procurement: Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterMfgReleased} onValueChange={setFilterMfgReleased}>
                  <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Manufacturing: All</SelectItem>
                    <SelectItem value="yes" className="text-xs">Manufacturing: Released</SelectItem>
                    <SelectItem value="no" className="text-xs">Manufacturing: Pending</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 ml-2">
                  <Switch id="allRevs" checked={showAllRevisions} onCheckedChange={setShowAllRevisions} className="scale-75" />
                  <Label htmlFor="allRevs" className="text-[10px] text-muted-foreground cursor-pointer">All Revisions</Label>
                </div>
              </div>

              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] w-6 px-1"></TableHead>
                        <TableHead className="text-[10px] px-2 whitespace-nowrap">DWG Control #</TableHead>
                        <TableHead className="text-[10px] px-2 whitespace-nowrap">Drawing No</TableHead>
                        <TableHead className="text-[10px] text-center w-10 px-1 whitespace-nowrap">Rev</TableHead>
                        <TableHead className="text-[10px] px-2 whitespace-nowrap">Item</TableHead>
                        <TableHead className="text-[10px] px-2 whitespace-nowrap">Product Identity</TableHead>
                        <TableHead className="text-[10px] text-center w-[72px] px-1">Status</TableHead>
                        <TableHead className="text-[10px] text-center w-[62px] px-1">Proc.</TableHead>
                        <TableHead className="text-[10px] text-center w-[62px] px-1">Mfg.</TableHead>
                        <TableHead className="text-[10px] text-center w-[48px] px-1">Client</TableHead>
                        <TableHead className="text-[10px] w-[58px] px-2">Purpose</TableHead>
                        <TableHead className="text-[10px] w-[68px] px-2">Assigned</TableHead>
                        <TableHead className="text-[10px] text-center px-2">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow><TableCell colSpan={13} className="text-center text-sm text-muted-foreground py-8">No drawing controls found.</TableCell></TableRow>
                      ) : filtered.map((rec) => {
                        const isExpanded = expandedId === rec.id;
                        const actions = getAvailableActions(rec);
                        return (
                          <TooltipProvider key={rec.id}>
                            <TableRow className={`cursor-pointer hover:bg-muted/30 ${isExpanded ? "bg-muted/20" : ""} ${!rec.is_current ? "opacity-60" : ""}`} onClick={() => setExpandedId(isExpanded ? null : rec.id)}>
                              <TableCell className="py-1 px-1">
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </TableCell>
                              <TableCell className="text-[10px] font-mono font-medium py-1 px-2 whitespace-nowrap overflow-visible">{rec.dwg_control_number}</TableCell>
                              <TableCell className="text-[10px] font-semibold py-1 px-2 whitespace-nowrap overflow-visible">{rec.drawing_number || <span className="text-muted-foreground italic font-normal">—</span>}</TableCell>
                              <TableCell className="text-center py-1 px-1">
                                {projectId
                                  ? <LiveRevisionCell projectId={projectId} parentEntityId={rec.id} isCurrent={rec.is_current} fallback={rec.revision_code} />
                                  : <div className="flex items-center justify-center gap-1">
                                      <Badge variant="outline" className="text-[8px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">{rec.revision_code}</Badge>
                                      {rec.is_current ? <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" /> : <span className="h-1.5 w-1.5 rounded-full bg-orange-400 inline-block" />}
                                    </div>
                                }
                              </TableCell>
                              <TableCell className="text-[10px] py-1 px-2 whitespace-nowrap">
                                <div title={rec.item_description || ""}>{rec.item_code}</div>
                              </TableCell>
                              <TableCell className="text-[10px] py-1 px-2 whitespace-nowrap">
                                {(() => {
                                  const identity = [rec.product_p1_label, rec.product_p2_label, rec.product_p3].filter(Boolean).join(' ');
                                  return identity
                                    ? <div className="text-blue-600 font-semibold">{identity}</div>
                                    : <span className="text-muted-foreground italic">—</span>;
                                })()}
                              </TableCell>
                              <TableCell className="text-center py-1 px-1"><StatusBadge status={rec.status} /></TableCell>
                              <TableCell className="text-center py-1 px-1"><GateBadge label="P" active={rec.released_for_procurement} required={rec.procurement_release_required} /></TableCell>
                              <TableCell className="text-center py-1 px-1"><GateBadge label="M" active={rec.released_for_manufacturing} required={rec.manufacturing_release_required} /></TableCell>
                              <TableCell className="text-center py-1 px-1">
                                {rec.client_approval_required ? (
                                  <Badge variant="outline" className={`text-[8px] px-1 py-0 border ${rec.client_approval_status === "approved" ? "bg-green-50 text-green-600 border-green-200" : rec.client_approval_status === "rejected" ? "bg-red-50 text-red-500 border-red-200" : "bg-yellow-50 text-yellow-600 border-yellow-200"}`}>
                                    {rec.client_approval_status || "pending"}
                                  </Badge>
                                ) : <span className="text-[8px] text-muted-foreground">N/R</span>}
                              </TableCell>
                              <TableCell className="text-[10px] py-1 px-2 capitalize">{rec.drawing_purpose || "—"}</TableCell>
                              <TableCell className="text-[10px] py-1 px-2">
                                {rec.assigned_to_name ? (
                                  <span className="text-[10px]">{rec.assigned_to_name}</span>
                                ) : <span className="text-[8px] text-muted-foreground italic">Unassigned</span>}
                              </TableCell>
                              <TableCell className="text-center py-1 px-2">
                                {actions.length > 0 ? (
                                  <div className="flex items-center justify-center gap-1">
                                    {actions.slice(0, 2).map((a) => {
                                      const Icon = a.icon;
                                      return (
                                        <Tooltip key={a.key}>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="sm"
                                              variant={a.variant}
                                              className="h-6 px-2 text-[9px]"
                                              onClick={(e) => { e.stopPropagation(); executeAction(a, rec); }}
                                            >
                                              <Icon className="h-3 w-3 mr-1" /> {a.label}
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent side="left" className="text-xs">{a.label}</TooltipContent>
                                        </Tooltip>
                                      );
                                    })}
                                    {actions.length > 2 && (
                                      <span className="text-[8px] text-muted-foreground">+{actions.length - 2}</span>
                                    )}
                                  </div>
                                ) : rec.status === "draft" && (rec.attachment_count || 0) === 0 ? (
                                  <span className="text-[8px] text-amber-600 flex items-center gap-1 justify-center"><UploadCloud className="h-3 w-3" /> Upload drawing first</span>
                                ) : (
                                  <span className="text-[8px] text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow className="bg-muted/10">
                                <TableCell colSpan={13} className="p-3">
                                  <div className="space-y-3">

                                    {/* ── 2-column responsive grid ── */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">

                                      {/* ════ LEFT COLUMN ════ */}
                                      <div className="space-y-3">

                                        {/* 1. Design Data Sheet */}
                                        <DesignDataGenerator
                                          drawingControlId={rec.id}
                                          drawingStatus={rec.status}
                                          userRole={userRole}
                                          disciplineCode={projectDisciplineCode}
                                        />

                                        {/* 2. Engineering Changes */}
                                        <DrawingEngineeringChanges
                                          drawingControlId={rec.id}
                                          dwgControlNumber={rec.dwg_control_number}
                                          revisionCode={rec.revision_code}
                                          userRole={userRole}
                                          drawingStatus={rec.status}
                                        />

                                        {/* 4. DWG Attachments (always last) */}
                                        {projectId && (
                                          <DwgDocumentPanelWithGcs
                                            projectId={projectId}
                                            rec={rec}
                                            userRole={userRole}
                                          />
                                        )}
                                      </div>

                                      {/* ════ RIGHT COLUMN ════ */}
                                      <div className="space-y-3">

                                        {/* 1. Details */}
                                        <Card className="shadow-sm">
                                          <CardContent className="px-3 pt-2.5 pb-2.5 space-y-2">

                                            {/* ── Compact header ── */}
                                            <div className="flex items-start gap-1.5">
                                              <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="font-mono text-[11px] font-bold text-foreground">{rec.drawing_number || rec.dwg_control_number}</span>
                                                  <Badge variant="outline" className="text-[8px] h-4 px-1 font-normal">{rec.status.replace(/_/g, " ")}</Badge>
                                                  {rec.status === "draft" && userLevel <= 3 && (
                                                    <Button size="sm" variant="ghost" className="h-4 px-1 text-[8px] ml-auto" onClick={(e) => { e.stopPropagation(); openEditDialog(rec); }}>
                                                      <Edit className="h-2.5 w-2.5 mr-0.5" /> Edit
                                                    </Button>
                                                  )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                  {rec.item_code && <span className="text-[9px] text-muted-foreground font-mono">{rec.item_code}</span>}
                                                  {projectId
                                                    ? <LiveRevisionBadge projectId={projectId} parentEntityId={rec.id} isCurrent={rec.is_current} fallback={rec.revision_code} />
                                                    : <span className="text-[9px] font-mono text-foreground/70">Rev {rec.revision_code}{rec.is_current ? <span className="text-green-600"> · current</span> : <span className="text-orange-500"> · superseded</span>}</span>
                                                  }
                                                </div>
                                                {rec.drawing_title && (
                                                  <div className="text-[10px] font-medium leading-snug mt-0.5 text-foreground/80 truncate" title={rec.drawing_title}>{rec.drawing_title}</div>
                                                )}
                                                {(rec.product_p1_label || rec.product_p2_label || rec.product_p3) && (
                                                  <div className="text-[12px] text-blue-600 font-bold mt-0.5 leading-snug truncate" title={[rec.product_p1_label, rec.product_p2_label, rec.product_p3].filter(Boolean).join(' ')}>
                                                    {[rec.product_p1_label, rec.product_p2_label, rec.product_p3].filter(Boolean).join(' ')}
                                                  </div>
                                                )}
                                              </div>
                                            </div>

                                            {/* ── Primary 2-col grid ── */}
                                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
                                              {rec.drawing_purpose && <><div className="text-muted-foreground">Purpose</div><div className="truncate">{rec.drawing_purpose}</div></>}
                                              {rec.classification_snapshot && <><div className="text-muted-foreground">Classification</div><div className="truncate">{rec.classification_snapshot}</div></>}
                                              {rec.discipline_code && <><div className="text-muted-foreground">Discipline</div><div>{rec.discipline_code}</div></>}
                                              {rec.drawing_category && <><div className="text-muted-foreground">Category</div><div>{rec.drawing_category}</div></>}
                                              <div className="text-muted-foreground">Created</div>
                                              <div>{fmtDate(rec.created_at)}</div>
                                              {rec.submitted_at && <><div className="text-muted-foreground">Submitted</div><div>{fmtDate(rec.submitted_at)}</div></>}
                                            </div>

                                            {/* ── Notes (inline, not collapsible) ── */}
                                            {rec.notes && !rec.notes.startsWith("Supersedes Rev") && (
                                              <div className="text-[9px] bg-amber-50 border border-amber-200 rounded px-2 py-1 text-amber-800">{rec.notes}</div>
                                            )}

                                            {/* ── Collapsible: low-priority details ── */}
                                            <div>
                                              <button
                                                type="button"
                                                className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors w-full"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setDetailsOpen(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(rec.id)) next.delete(rec.id); else next.add(rec.id);
                                                    return next;
                                                  });
                                                }}
                                              >
                                                {detailsOpen.has(rec.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                                <span>{detailsOpen.has(rec.id) ? "Hide" : "Show"} audit · gates · GCS</span>
                                              </button>

                                              {detailsOpen.has(rec.id) && (
                                                <div className="mt-1.5 space-y-1.5 pl-1">

                                                  {/* Release gates */}
                                                  <div>
                                                    <div className="text-[9px] text-muted-foreground font-medium mb-0.5">Release Gates</div>
                                                    <div className="flex flex-wrap gap-1">
                                                      {rec.procurement_release_required ? (
                                                        <span className={`text-[8px] px-1.5 py-0.5 rounded border font-medium ${rec.released_for_procurement ? "bg-green-50 text-green-700 border-green-300" : "bg-orange-50 text-orange-600 border-orange-300"}`}>
                                                          P · {rec.released_for_procurement ? `✓ ${rec.released_for_procurement_at ? fmtDate(rec.released_for_procurement_at) : "released"}` : "pending"}
                                                        </span>
                                                      ) : (
                                                        <span className="text-[8px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-400 border-gray-200">P · n/a</span>
                                                      )}
                                                      {rec.manufacturing_release_required ? (
                                                        <span className={`text-[8px] px-1.5 py-0.5 rounded border font-medium ${rec.released_for_manufacturing ? "bg-green-50 text-green-700 border-green-300" : "bg-orange-50 text-orange-600 border-orange-300"}`}>
                                                          M · {rec.released_for_manufacturing ? `✓ ${rec.released_for_manufacturing_at ? fmtDate(rec.released_for_manufacturing_at) : "released"}` : "pending"}
                                                        </span>
                                                      ) : (
                                                        <span className="text-[8px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-400 border-gray-200">M · n/a</span>
                                                      )}
                                                      {rec.client_approval_required ? (
                                                        <span className={`text-[8px] px-1.5 py-0.5 rounded border font-medium ${rec.client_approval_status === "approved" ? "bg-green-50 text-green-700 border-green-300" : rec.client_approval_status === "rejected" ? "bg-red-50 text-red-600 border-red-300" : "bg-yellow-50 text-yellow-600 border-yellow-300"}`}>
                                                          C · {rec.client_approval_status || "pending"}{rec.client_approved_at ? ` ${fmtDate(rec.client_approved_at)}` : ""}
                                                        </span>
                                                      ) : (
                                                        <span className="text-[8px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-400 border-gray-200">C · n/a</span>
                                                      )}
                                                    </div>
                                                  </div>

                                                  {/* Supersession */}
                                                  {rec.supersedes_id && (
                                                    <div className="flex items-start gap-1.5 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                                                      <ArrowUpDown className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                                                      <div>
                                                        <div className="text-[9px] font-semibold text-blue-700 uppercase tracking-wide mb-0.5">Supersession Draft</div>
                                                        <div className="text-[9px] text-blue-800">
                                                          {rec.notes && rec.notes.startsWith("Supersedes Rev")
                                                            ? rec.notes
                                                            : `Supersedes drawing #${rec.supersedes_id}`}
                                                        </div>
                                                      </div>
                                                    </div>
                                                  )}

                                                  {/* Audit trail */}
                                                  <div>
                                                    <div className="text-[9px] text-muted-foreground font-medium mb-0.5">Audit Trail</div>
                                                    <div className="space-y-0.5">
                                                      {[
                                                        { label: "Created", date: rec.created_at, note: null },
                                                        { label: "Submitted", date: rec.submitted_at, note: rec.submission_note },
                                                        { label: "Reviewed", date: rec.reviewed_at, note: rec.review_recommendation },
                                                        { label: "Approved", date: rec.approved_at, note: rec.approval_note },
                                                        { label: "Released", date: rec.released_at, note: rec.release_note },
                                                        { label: "Superseded", date: rec.superseded_at, note: rec.supersession_reason },
                                                        { label: "Cancelled", date: rec.cancelled_at, note: rec.cancel_reason },
                                                      ].filter(e => e.date).map(e => (
                                                        <div key={e.label} className="flex items-baseline gap-1.5 text-[9px]">
                                                          <span className="text-muted-foreground w-16 shrink-0">{e.label}</span>
                                                          <span className="text-[8px] text-foreground/70">{fmtDate(e.date!)}</span>
                                                          {e.note && <span className="text-muted-foreground truncate max-w-[140px]" title={e.note}>— {e.note}</span>}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>

                                                  {/* GCS Storage */}
                                                  {projectId && (
                                                    <div>
                                                      <Separator className="my-1" />
                                                      <div className="text-[9px] text-muted-foreground font-medium mb-0.5">GCS Storage</div>
                                                      <GcsPathDisplay projectId={projectId} parentEntityId={rec.id} />
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>

                                          </CardContent>
                                        </Card>

                                      <Card className="shadow-sm">
                                        <CardHeader className="py-2 px-3">
                                          <CardTitle className="text-[11px] font-medium flex items-center gap-1.5">
                                            <ShieldCheck className="h-3.5 w-3.5" /> Lifecycle Actions
                                          </CardTitle>
                                        </CardHeader>
                                        <CardContent className="px-3 pb-2">
                                          {actions.length === 0 ? (
                                            <div className="py-2">
                                              {["canceled", "superseded", "file_not_available"].includes(rec.status) ? (
                                                <p className="text-[10px] text-muted-foreground italic">No actions available — record is terminal.</p>
                                              ) : rec.status === "pending_upload" ? (
                                                <p className="text-[10px] text-muted-foreground italic">Upload a file to activate this record before lifecycle actions become available.</p>
                                              ) : rec.status === "draft" && (rec.attachment_count || 0) === 0 ? (
                                                <p className="text-[10px] text-muted-foreground italic">Upload at least one drawing file below before submitting for review.</p>
                                              ) : rec.status === "under_review" ? (
                                                <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2">
                                                  <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                                  <div>
                                                    <p className="text-[10px] font-semibold text-amber-700">Pending Approval</p>
                                                    <p className="text-[9px] text-amber-600 mt-0.5">Submitted for review — awaiting Manager / Senior Manager action.</p>
                                                  </div>
                                                </div>
                                              ) : rec.status === "approved" ? (
                                                <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-2">
                                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                  <div>
                                                    <p className="text-[10px] font-semibold text-emerald-700">Approved</p>
                                                    <p className="text-[9px] text-emerald-600 mt-0.5">Awaiting release by Senior Manager.</p>
                                                  </div>
                                                </div>
                                              ) : rec.status === "released" ? (
                                                <div className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 px-2.5 py-2">
                                                  <ShieldCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                                  <div>
                                                    <p className="text-[10px] font-semibold text-blue-700">Released</p>
                                                    <p className="text-[9px] text-blue-600 mt-0.5">Drawing is live and released for use.</p>
                                                  </div>
                                                </div>
                                              ) : (
                                                <p className="text-[10px] text-muted-foreground italic">No actions available for your role on this record.</p>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="space-y-1.5">
                                              {actions.map((a) => {
                                                const Icon = a.icon;
                                                return (
                                                  <Tooltip key={a.key}>
                                                    <TooltipTrigger asChild>
                                                      <Button
                                                        size="sm"
                                                        variant={a.variant}
                                                        className="w-full justify-start h-7 text-[10px] px-2"
                                                        onClick={(e) => { e.stopPropagation(); executeAction(a, rec); }}
                                                      >
                                                        <Icon className="h-3 w-3 mr-1.5" /> {a.label}
                                                      </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="left" className="text-xs">
                                                      {a.minRoleLevel <= 2 ? "Requires Senior Manager+" : a.minRoleLevel <= 3 ? "Requires Manager+" : "Any authenticated user"}
                                                    </TooltipContent>
                                                  </Tooltip>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </CardContent>
                                      </Card>

                                      </div>{/* end right column */}
                                    </div>{/* end 2-col grid */}

                                    <div className="flex items-center gap-2">
                                      <Button size="sm" variant="outline" className="h-6 text-[9px] px-2" asChild>
                                        <a href={`/execution-control?project=${projectId}`}>
                                          ← Back to Execution Control
                                        </a>
                                      </Button>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </TooltipProvider>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}

          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Drawing Control</DialogTitle>
                <DialogDescription>{editTarget?.dwg_control_number} — Rev {editTarget?.revision_code} (draft)</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Drawing No (Barcode) <span className="text-[9px]">(read-only)</span></Label>
                    <Input className="h-8 text-xs mt-1 bg-muted/50 cursor-not-allowed" value={editForm.drawingNumber} readOnly />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Drawing Title <span className="text-[9px]">(read-only)</span></Label>
                    <Input className="h-8 text-xs mt-1 bg-muted/50 cursor-not-allowed" value={editForm.drawingTitle} readOnly />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Drawing Revision <span className="text-[9px]">(read-only)</span></Label>
                    {projectId && editTarget
                      ? <LiveRevisionReadOnly projectId={projectId} parentEntityId={editTarget.id} />
                      : <Input className="h-8 text-xs mt-1 bg-muted/50 cursor-not-allowed" value={editForm.drawingRevision} readOnly />
                    }
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Category <span className="text-[9px]">(from classification)</span></Label>
                    <Input className="h-8 text-xs mt-1 bg-muted/50 cursor-not-allowed" value={editForm.drawingCategory} readOnly />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs font-medium">Discipline Code</Label>
                    <Select value={editForm.disciplineCode} onValueChange={(v) => setEditForm(f => ({ ...f, disciplineCode: v }))}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select discipline" /></SelectTrigger>
                      <SelectContent>
                        {[
                          { code: "ME", label: "ME — Mechanical Engineering" },
                          { code: "EL", label: "EL — Electrical" },
                          { code: "CV", label: "CV — Civil / Structural" },
                          { code: "IN", label: "IN — Instrumentation" },
                          { code: "PI", label: "PI — Piping" },
                        ].map(({ code, label }) => (
                          <SelectItem key={code} value={code} className="text-xs">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Purpose</Label>
                    <Select value={editForm.drawingPurpose} onValueChange={(v) => setEditForm(f => ({ ...f, drawingPurpose: v }))}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["general", "procurement", "manufacturing", "construction"].map(p => (
                          <SelectItem key={p} value={p} className="text-xs capitalize">{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium">Notes</Label>
                  <Textarea className="text-xs mt-1 min-h-[50px]" value={editForm.notes} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="text-xs font-medium">Release & Approval Configuration</div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px]">Procurement Release Required</Label>
                    <Switch checked={editForm.procurementReleaseRequired} onCheckedChange={(v) => setEditForm(f => ({ ...f, procurementReleaseRequired: v }))} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px]">Manufacturing Release Required</Label>
                    <Switch checked={editForm.manufacturingReleaseRequired} onCheckedChange={(v) => setEditForm(f => ({ ...f, manufacturingReleaseRequired: v }))} className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px]">Client Approval Required</Label>
                    <Switch checked={editForm.clientApprovalRequired} onCheckedChange={(v) => setEditForm(f => ({ ...f, clientApprovalRequired: v }))} className="scale-75" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={submitEdit} disabled={editMutation.isPending}>
                  {editMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={actionDialog.open} onOpenChange={(open) => { if (!open) setActionDialog({ open: false, action: null, record: null }); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{actionDialog.action?.label}</DialogTitle>
                <DialogDescription>
                  {actionDialog.record?.dwg_control_number} — Rev{" "}
                  {actionDialog.record && projectId
                    ? <LiveRevisionInline projectId={projectId} parentEntityId={actionDialog.record.id} fallback={actionDialog.record.revision_code} />
                    : actionDialog.record?.revision_code
                  } • {actionDialog.record?.item_code}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Current Status:</span>
                  <StatusBadge status={actionDialog.record?.status || ""} />
                </div>
                {actionDialog.action?.key === "review" && (
                  <div>
                    <Label className="text-xs font-medium">Recommendation *</Label>
                    <Select value={reviewRecommendation} onValueChange={setReviewRecommendation}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approve" className="text-xs">Approve</SelectItem>
                        <SelectItem value="approve_with_comments" className="text-xs">Approve with Comments</SelectItem>
                        <SelectItem value="reject" className="text-xs">Reject</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {actionDialog.action?.key === "client-approval" && (
                  <>
                    <div>
                      <Label className="text-xs font-medium">Client Approval Status *</Label>
                      <Select value={clientApprovalStatus} onValueChange={setClientApprovalStatus}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="approved" className="text-xs">Approved</SelectItem>
                          <SelectItem value="rejected" className="text-xs">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Client Contact Name</Label>
                      <Input className="h-8 text-xs mt-1" value={clientApprovedBy} onChange={(e) => setClientApprovedBy(e.target.value)} placeholder="Name of client who approved/rejected" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Notes</Label>
                      <Textarea className="text-xs mt-1 min-h-[50px]" value={clientApprovalNotes} onChange={(e) => setClientApprovalNotes(e.target.value)} placeholder="Client approval notes..." />
                    </div>
                  </>
                )}
                {actionDialog.action?.needsNote && actionDialog.action?.key !== "review" && actionDialog.action?.key !== "client-approval" && (
                  <div>
                    <Label className="text-xs font-medium">{actionDialog.action.noteLabel}{actionDialog.action.key === "cancel" ? " *" : ""}</Label>
                    <Textarea className="text-xs mt-1 min-h-[50px]" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder={`Enter ${actionDialog.action.noteLabel?.toLowerCase()}...`} />
                  </div>
                )}
                {actionDialog.action?.key === "release-gate-procurement" && (
                  <div className="p-2 bg-blue-50 rounded text-[10px] text-blue-700">
                    This will mark the drawing as released for procurement use. Procurement teams will be able to reference this revision.
                  </div>
                )}
                {actionDialog.action?.key === "release-gate-manufacturing" && (
                  <div className="p-2 bg-blue-50 rounded text-[10px] text-blue-700">
                    This will mark the drawing as released for manufacturing use. Production teams will be able to reference this revision.
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActionDialog({ open: false, action: null, record: null })}>Cancel</Button>
                <Button
                  variant={actionDialog.action?.variant || "default"}
                  onClick={submitAction}
                  disabled={lifecycleMutation.isPending || (actionDialog.action?.key === "cancel" && !actionNote.trim())}
                >
                  {lifecycleMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {actionDialog.action?.label}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </TooltipProvider>
    </Layout>
  );
}

function DetailRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-[9px] text-muted-foreground shrink-0">{label}</span>
      <span className={`text-[10px] text-right ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function useGcsPath(projectItemId: number | null) {
  return useQuery({
    queryKey: ['/api/project-items', projectItemId, 'gcs-path'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/project-items/${projectItemId}/gcs-path`);
      return res as any;
    },
    enabled: !!projectItemId,
  });
}

function useActiveAttachment(projectId: number | null, parentEntityId: number | null) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/projects", projectId, "epc-documents", "DWG", parentEntityId, "attachments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/epc-documents/DWG/${parentEntityId}/attachments`);
      return res as any;
    },
    enabled: !!projectId && !!parentEntityId,
  });
  const revisions: any[] = data?.revisions || [];
  const currentRev = revisions.find((r: any) => r.isCurrent);
  const activeAtt = currentRev?.attachments?.find((a: any) => a.status === "active");
  const revisionCode: string | null = currentRev?.revisionCode ?? null;
  return { activeAtt, revisionCode, isLoading };
}

function LiveRevisionBadge({ projectId, parentEntityId, isCurrent, fallback }: { projectId: number; parentEntityId: number; isCurrent: boolean; fallback?: string }) {
  const { revisionCode, isLoading } = useActiveAttachment(projectId, parentEntityId);
  if (isLoading) return <span className="text-muted-foreground text-[9px]">…</span>;
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono">{revisionCode || fallback || "—"}</span>
      {isCurrent
        ? <span className="text-green-600 font-semibold">· current</span>
        : <span className="text-orange-500">· superseded</span>}
    </div>
  );
}

function LiveRevisionReadOnly({ projectId, parentEntityId }: { projectId: number; parentEntityId: number }) {
  const { revisionCode, isLoading } = useActiveAttachment(projectId, parentEntityId);
  return (
    <div className="h-8 text-xs mt-1 bg-muted/50 border rounded-md px-3 flex items-center font-mono text-muted-foreground cursor-not-allowed">
      {isLoading ? "…" : (revisionCode || "—")}
    </div>
  );
}

function LiveRevisionCell({ projectId, parentEntityId, isCurrent, fallback }: { projectId: number; parentEntityId: number; isCurrent: boolean; fallback?: string }) {
  const { revisionCode, isLoading } = useActiveAttachment(projectId, parentEntityId);
  const display = isLoading ? "…" : (revisionCode || fallback || "—");
  return (
    <div className="flex items-center justify-center gap-1">
      <Badge variant="outline" className="text-[8px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">{display}</Badge>
      {isCurrent
        ? <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" title="Current revision" />
        : <span className="h-1.5 w-1.5 rounded-full bg-orange-400 inline-block" title="Superseded" />}
    </div>
  );
}

function LiveRevisionInline({ projectId, parentEntityId, fallback }: { projectId: number; parentEntityId: number; fallback?: string }) {
  const { revisionCode, isLoading } = useActiveAttachment(projectId, parentEntityId);
  return <span className="font-semibold">{isLoading ? "…" : (revisionCode ?? fallback ?? "—")}</span>;
}

function GcsPathDisplay({ projectId, parentEntityId }: { projectId: number; parentEntityId: number }) {
  const { activeAtt, isLoading } = useActiveAttachment(projectId, parentEntityId);

  if (isLoading) return <div className="text-[9px] text-muted-foreground">Loading GCS path...</div>;

  const activePath = activeAtt?.gcsPath;

  if (!activePath) {
    return <div className="text-[9px] text-muted-foreground italic">No active file uploaded yet</div>;
  }

  return (
    <div className="font-mono text-[9px] bg-slate-50 border rounded px-2 py-1.5 break-all text-slate-700">
      {activePath}
    </div>
  );
}

function DwgDocumentPanelWithGcs({ projectId, rec, userRole }: { projectId: number; rec: any; userRole: string }) {
  // gcsPathPreview is sourced from the stored gcs_object_path on the active attachment,
  // not reconstructed client-side. This ensures it always reflects the actual Rule 34
  // EPC_DRAWING governance path written at upload time.
  const { activeAtt } = useActiveAttachment(projectId, rec.id);
  const gcsPreview = activeAtt?.gcsPath ?? undefined;

  return (
    <EpcDocumentPanel
      projectId={projectId}
      docType="DWG"
      parentEntityId={rec.id}
      documentNumber={rec.dwg_control_number}
      parentStatus={rec.status}
      userRole={userRole}
      gcsPathPreview={gcsPreview}
    />
  );
}
