import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/layout";
import { Helmet } from "react-helmet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Search, Filter, AlertTriangle, Clock, CheckCircle2, XCircle, ChevronDown, ChevronRight, RefreshCw, FileText, Package, ClipboardCheck, ShoppingCart, Factory, Eye } from "lucide-react";

type PipelineRecord = {
  id: number;
  status: string;
  planning_type?: string;
  source_context?: string;
  inspection_type?: string;
  classification_snapshot?: string;
  item_code?: string;
  item_description?: string;
  quality_requirement_type?: string;
  [key: string]: any;
};

type ProjectItem = {
  id: number;
  project_id: number;
  item_id: number;
  quantity: string;
  status: string;
  notes: string;
  masterItem?: { item_code: string; description: string; make_or_buy: string; uom: string };
};

type ActionDialogState = {
  open: boolean;
  action: string;
  layer: string;
  recordId: number;
  recordStatus: string;
  itemDesc: string;
  needsNote: boolean;
  noteLabel: string;
  endpoint: string;
  bodyKey: string;
};

const LAYER_CONFIG = {
  planning: { label: "Planning", icon: FileText, color: "blue" },
  execution: { label: "Execution", icon: Package, color: "violet" },
  quality: { label: "Quality Plan", icon: ClipboardCheck, color: "emerald" },
  preparation: { label: "PO/WO Prep", icon: ShoppingCart, color: "amber" },
  inspection: { label: "Inspection", icon: Eye, color: "rose" },
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-300",
  under_review: "bg-blue-100 text-blue-700 border-blue-300",
  released: "bg-green-100 text-green-700 border-green-300",
  under_preparation: "bg-yellow-100 text-yellow-700 border-yellow-300",
  ready_for_po: "bg-emerald-100 text-emerald-700 border-emerald-300",
  ready_for_wo: "bg-emerald-100 text-emerald-700 border-emerald-300",
  ready_for_inspection_setup: "bg-teal-100 text-teal-700 border-teal-300",
  ready_for_po_creation: "bg-lime-100 text-lime-700 border-lime-300",
  ready_for_wo_creation: "bg-lime-100 text-lime-700 border-lime-300",
  scheduled: "bg-indigo-100 text-indigo-700 border-indigo-300",
  in_progress: "bg-purple-100 text-purple-700 border-purple-300",
  completed: "bg-green-100 text-green-700 border-green-300",
  failed: "bg-red-100 text-red-700 border-red-300",
  superseded: "bg-orange-100 text-orange-600 border-orange-300",
  cancelled: "bg-red-50 text-red-500 border-red-200",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground italic">—</span>;
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <Badge variant="outline" className={`${style} text-[10px] font-medium px-1.5 py-0.5 whitespace-nowrap border`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function ExceptionBadge({ type, label }: { type: "stuck" | "pending" | "blocked"; label: string }) {
  const styles = {
    stuck: "bg-red-50 text-red-600 border-red-200",
    pending: "bg-amber-50 text-amber-600 border-amber-200",
    blocked: "bg-orange-50 text-orange-600 border-orange-200",
  };
  const icons = { stuck: Clock, pending: AlertTriangle, blocked: XCircle };
  const Icon = icons[type];
  return (
    <Badge variant="outline" className={`${styles[type]} text-[9px] px-1 py-0 border gap-0.5`}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </Badge>
  );
}

function getExceptions(
  planning: PipelineRecord | null,
  execution: PipelineRecord | null,
  classification: string | null
) {
  const exceptions: { type: "stuck" | "pending" | "blocked"; label: string; layer: string }[] = [];
  if (!classification || classification === "unclassified") {
    exceptions.push({ type: "blocked", label: "No classification", layer: "planning" });
  }
  if (planning?.status === "draft") {
    const created = planning.created_at ? new Date(planning.created_at) : null;
    if (created && (Date.now() - created.getTime()) > 3 * 24 * 60 * 60 * 1000) {
      exceptions.push({ type: "stuck", label: "Stuck in draft", layer: "planning" });
    }
  }
  if (planning?.status === "under_review" && !planning.reviewed_by) {
    exceptions.push({ type: "pending", label: "Awaiting review", layer: "planning" });
  }
  return exceptions;
}

function getAvailableActions(layer: string, status: string | null, record: PipelineRecord | null): { label: string; action: string; variant: "default" | "outline" | "destructive"; endpoint: string; needsNote: boolean; noteLabel: string; bodyKey: string }[] {
  if (!status || !record) return [];
  const id = record.id;

  if (layer === "planning") {
    if (status === "draft") return [
      { label: "Submit for Review", action: "submit", variant: "default", endpoint: `/api/planning-records/${id}/submit-for-review`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "under_review" && !record.reviewed_by) return [
      { label: "Review", action: "review", variant: "default", endpoint: `/api/planning-records/${id}/review`, needsNote: true, noteLabel: "Review Note", bodyKey: "reviewNote" },
    ];
    if (status === "under_review" && record.reviewed_by) return [
      { label: "Release", action: "release", variant: "default", endpoint: `/api/planning-records/${id}/release`, needsNote: true, noteLabel: "Release Note", bodyKey: "releaseNote" },
    ];
    if (!["superseded", "cancelled"].includes(status)) return [
      { label: "Cancel", action: "cancel", variant: "destructive", endpoint: `/api/planning-records/${id}/cancel`, needsNote: true, noteLabel: "Cancel Reason", bodyKey: "cancelReason" },
    ];
  }

  if (layer === "execution") {
    const isProc = record.planning_type === "procurement" || record.source_context === "procurement" || !record.drawing_revision;
    const prefix = isProc ? "procurement-executions" : "production-executions";
    if (status === "draft") return [
      { label: "Start Preparation", action: "prepare", variant: "default", endpoint: `/api/${prefix}/${id}/start-preparation`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "under_preparation") return [
      { label: "Mark Ready", action: "mark-ready", variant: "default", endpoint: `/api/${prefix}/${id}/mark-ready`, needsNote: true, noteLabel: "Preparation Note", bodyKey: "preparationNote" },
      { label: "Cancel", action: "cancel", variant: "destructive", endpoint: `/api/${prefix}/${id}/cancel`, needsNote: true, noteLabel: "Cancel Reason", bodyKey: "cancelReason" },
    ];
    if (status === "ready_for_po" || status === "ready_for_wo") return [
      { label: "Revert", action: "revert", variant: "outline", endpoint: `/api/${prefix}/${id}/revert-to-preparation`, needsNote: false, noteLabel: "", bodyKey: "" },
      { label: "Cancel", action: "cancel", variant: "destructive", endpoint: `/api/${prefix}/${id}/cancel`, needsNote: true, noteLabel: "Cancel Reason", bodyKey: "cancelReason" },
    ];
  }

  if (layer === "quality") {
    if (status === "draft") return [
      { label: "Start Preparation", action: "start-prep", variant: "default", endpoint: `/api/quality-plans/${id}/start-preparation`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "under_preparation") return [
      { label: "Mark Ready", action: "mark-ready", variant: "default", endpoint: `/api/quality-plans/${id}/mark-ready`, needsNote: true, noteLabel: "Preparation Note", bodyKey: "preparationNote" },
      { label: "Cancel", action: "cancel", variant: "destructive", endpoint: `/api/quality-plans/${id}/cancel`, needsNote: true, noteLabel: "Cancel Reason", bodyKey: "cancelReason" },
    ];
    if (status === "ready_for_inspection_setup") return [
      { label: "Revert", action: "revert", variant: "outline", endpoint: `/api/quality-plans/${id}/revert-to-preparation`, needsNote: false, noteLabel: "", bodyKey: "" },
      { label: "Cancel", action: "cancel", variant: "destructive", endpoint: `/api/quality-plans/${id}/cancel`, needsNote: true, noteLabel: "Cancel Reason", bodyKey: "cancelReason" },
    ];
  }

  if (layer === "po_preparation" || layer === "wo_preparation") {
    const prefix = layer === "po_preparation" ? "po-preparations" : "wo-preparations";
    if (status === "draft") return [
      { label: "Submit for Review", action: "submit", variant: "default", endpoint: `/api/${prefix}/${id}/submit-for-review`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "under_review") return [
      { label: "Approve", action: "approve", variant: "default", endpoint: `/api/${prefix}/${id}/approve`, needsNote: false, noteLabel: "", bodyKey: "" },
      { label: "Revert to Draft", action: "revert", variant: "outline", endpoint: `/api/${prefix}/${id}/revert-to-draft`, needsNote: false, noteLabel: "", bodyKey: "" },
      { label: "Cancel", action: "cancel", variant: "destructive", endpoint: `/api/${prefix}/${id}/cancel`, needsNote: true, noteLabel: "Cancel Reason", bodyKey: "cancelReason" },
    ];
    if (status === "ready_for_po_creation" || status === "ready_for_wo_creation") return [
      { label: "Revert to Review", action: "revert-review", variant: "outline", endpoint: `/api/${prefix}/${id}/revert-to-review`, needsNote: false, noteLabel: "", bodyKey: "" },
      { label: "Cancel", action: "cancel", variant: "destructive", endpoint: `/api/${prefix}/${id}/cancel`, needsNote: true, noteLabel: "Cancel Reason", bodyKey: "cancelReason" },
    ];
    if (!["cancelled", "superseded"].includes(status)) return [
      { label: "Cancel", action: "cancel", variant: "destructive", endpoint: `/api/${prefix}/${id}/cancel`, needsNote: true, noteLabel: "Cancel Reason", bodyKey: "cancelReason" },
    ];
  }

  if (layer === "inspection") {
    if (status === "draft") return [
      { label: "Schedule", action: "schedule", variant: "default", endpoint: `/api/inspection-executions/${id}/schedule`, needsNote: true, noteLabel: "Scheduled Date (YYYY-MM-DD)", bodyKey: "scheduledDate" },
    ];
    if (status === "scheduled") return [
      { label: "Start", action: "start", variant: "default", endpoint: `/api/inspection-executions/${id}/start`, needsNote: false, noteLabel: "", bodyKey: "" },
      { label: "Cancel", action: "cancel", variant: "destructive", endpoint: `/api/inspection-executions/${id}/cancel`, needsNote: true, noteLabel: "Cancel Reason", bodyKey: "cancelReason" },
    ];
    if (status === "in_progress") return [
      { label: "Complete (Pass)", action: "complete-pass", variant: "default", endpoint: `/api/inspection-executions/${id}/complete`, needsNote: false, noteLabel: "", bodyKey: "" },
      { label: "Fail", action: "fail", variant: "destructive", endpoint: `/api/inspection-executions/${id}/fail`, needsNote: true, noteLabel: "Failure Reason", bodyKey: "failureReason" },
    ];
  }

  return [];
}

export default function ExecutionControlDashboard() {
  const { toast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<string>("all");
  const [layerStatusFilter, setLayerStatusFilter] = useState<string>("all");
  const [exceptionFilter, setExceptionFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [actionDialog, setActionDialog] = useState<ActionDialogState>({
    open: false, action: "", layer: "", recordId: 0, recordStatus: "",
    itemDesc: "", needsNote: false, noteLabel: "", endpoint: "", bodyKey: "",
  });
  const [actionNote, setActionNote] = useState("");

  const { data: projects = [], isLoading: loadingProjects } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const activeProjects = useMemo(() => projects.filter((p: any) => p.status === "active" || p.status === "planning"), [projects]);

  const projectId = selectedProjectId ? parseInt(selectedProjectId) : null;

  const { data: projectItems = [], isLoading: loadingItems } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "items"],
    queryFn: () => fetch(`/api/projects/${projectId}/items`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: planningRecords = [], isLoading: loadingPlanning } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "planning-records"],
    queryFn: () => fetch(`/api/projects/${projectId}/planning-records`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: procExecs = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "procurement-executions"],
    queryFn: () => fetch(`/api/projects/${projectId}/procurement-executions`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: prodExecs = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "production-executions"],
    queryFn: () => fetch(`/api/projects/${projectId}/production-executions`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: qualityPlans = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "quality-plans"],
    queryFn: () => fetch(`/api/projects/${projectId}/quality-plans`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: poPreps = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "po-preparations"],
    queryFn: () => fetch(`/api/projects/${projectId}/po-preparations`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: woPreps = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "wo-preparations"],
    queryFn: () => fetch(`/api/projects/${projectId}/wo-preparations`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: inspExecs = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "inspection-executions"],
    queryFn: () => fetch(`/api/projects/${projectId}/inspection-executions`).then(r => r.json()),
    enabled: !!projectId,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ endpoint, body }: { endpoint: string; body: any }) => {
      return apiRequest("POST", endpoint, body);
    },
    onSuccess: () => {
      toast({ title: "Action completed", description: "Pipeline record updated successfully." });
      invalidateAll();
      setActionDialog(prev => ({ ...prev, open: false }));
      setActionNote("");
    },
    onError: (error: any) => {
      toast({ title: "Action failed", description: error.message || "Something went wrong", variant: "destructive" });
    },
  });

  function invalidateAll() {
    if (!projectId) return;
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "planning-records"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "procurement-executions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "production-executions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "quality-plans"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "po-preparations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "wo-preparations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "inspection-executions"] });
  }

  const pipelineRows = useMemo(() => {
    if (!projectItems.length) return [];

    return projectItems.map((item: any) => {
      const itemId = item.id;
      const plan = planningRecords.find((r) => r.project_item_id === itemId && !["superseded", "cancelled"].includes(r.status))
        || planningRecords.find((r) => r.project_item_id === itemId);
      const classification = plan?.classification_snapshot || item.masterItem?.make_or_buy || null;
      const isBuy = classification === "Buy";

      const exec = isBuy
        ? procExecs.find((r) => r.project_item_id === itemId && !["superseded", "cancelled"].includes(r.status))
          || procExecs.find((r) => r.project_item_id === itemId)
        : prodExecs.find((r) => r.project_item_id === itemId && !["superseded", "cancelled"].includes(r.status))
          || prodExecs.find((r) => r.project_item_id === itemId);

      const qp = qualityPlans.find((r) => r.project_item_id === itemId && !["superseded", "cancelled"].includes(r.status))
        || qualityPlans.find((r) => r.project_item_id === itemId);

      const prep = isBuy
        ? poPreps.find((r) => r.project_item_id === itemId && !["superseded", "cancelled"].includes(r.status))
          || poPreps.find((r) => r.project_item_id === itemId)
        : woPreps.find((r) => r.project_item_id === itemId && !["superseded", "cancelled"].includes(r.status))
          || woPreps.find((r) => r.project_item_id === itemId);

      const insp = inspExecs.find((r) => r.project_item_id === itemId && !["superseded", "cancelled"].includes(r.status))
        || inspExecs.find((r) => r.project_item_id === itemId);

      const exceptions = getExceptions(plan || null, exec || null, classification);
      const itemCode = plan?.item_code || exec?.item_code || item.masterItem?.item_code || `Item #${itemId}`;
      const itemDesc = plan?.item_description || exec?.item_description || item.masterItem?.description || "";

      return {
        itemId, item, plan: plan || null, exec: exec || null, qp: qp || null,
        prep: prep || null, insp: insp || null,
        classification, isBuy, exceptions, itemCode, itemDesc,
      };
    });
  }, [projectItems, planningRecords, procExecs, prodExecs, qualityPlans, poPreps, woPreps, inspExecs]);

  const filteredRows = useMemo(() => {
    return pipelineRows.filter((row) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!row.itemCode.toLowerCase().includes(q) && !row.itemDesc.toLowerCase().includes(q)) return false;
      }
      if (classificationFilter !== "all" && row.classification !== classificationFilter) return false;
      if (exceptionFilter !== "all") {
        if (exceptionFilter === "stuck" && !row.exceptions.some(e => e.type === "stuck")) return false;
        if (exceptionFilter === "pending" && !row.exceptions.some(e => e.type === "pending")) return false;
        if (exceptionFilter === "blocked" && !row.exceptions.some(e => e.type === "blocked")) return false;
        if (exceptionFilter === "none" && row.exceptions.length > 0) return false;
      }
      if (layerStatusFilter !== "all") {
        const allStatuses = [row.plan?.status, row.exec?.status, row.qp?.status, row.prep?.status, row.insp?.status].filter(Boolean);
        if (!allStatuses.includes(layerStatusFilter)) return false;
      }
      return true;
    });
  }, [pipelineRows, searchQuery, classificationFilter, layerStatusFilter, exceptionFilter]);

  const summaryStats = useMemo(() => {
    const total = pipelineRows.length;
    const withExceptions = pipelineRows.filter(r => r.exceptions.length > 0).length;
    const buyCount = pipelineRows.filter(r => r.classification === "Buy").length;
    const makeCount = pipelineRows.filter(r => r.classification === "Make").length;
    const completedInsp = pipelineRows.filter(r => r.insp?.status === "completed").length;
    return { total, withExceptions, buyCount, makeCount, completedInsp };
  }, [pipelineRows]);

  function openActionDialog(action: { label: string; action: string; endpoint: string; needsNote: boolean; noteLabel: string; bodyKey: string }, layer: string, record: PipelineRecord, itemDesc: string) {
    setActionDialog({
      open: true, action: action.label, layer, recordId: record.id,
      recordStatus: record.status, itemDesc, needsNote: action.needsNote,
      noteLabel: action.noteLabel, endpoint: action.endpoint, bodyKey: action.bodyKey,
    });
    setActionNote("");
  }

  function executeAction() {
    const body: any = {};
    if (actionDialog.bodyKey && actionNote) {
      body[actionDialog.bodyKey] = actionNote;
    }
    if (actionDialog.action === "Complete (Pass)") {
      body.result = "pass";
    }
    actionMutation.mutate({ endpoint: actionDialog.endpoint, body });
  }

  const isLoading = loadingProjects || (projectId && loadingItems) || (projectId && loadingPlanning);

  function toggleRow(itemId: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  function renderLayerCell(layer: string, record: PipelineRecord | null, itemDesc: string) {
    if (!record) return <span className="text-xs text-muted-foreground italic">—</span>;

    const actions = getAvailableActions(layer, record.status, record);

    return (
      <div className="flex flex-col gap-1">
        <StatusBadge status={record.status} />
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {actions.map((a) => (
              <Button
                key={a.action}
                size="sm"
                variant={a.variant}
                className="h-5 text-[9px] px-1.5 py-0"
                onClick={(e) => { e.stopPropagation(); openActionDialog(a, layer, record, itemDesc); }}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderExpandedDetails(row: typeof pipelineRows[0]) {
    const layers = [
      { key: "planning", record: row.plan, label: "Planning Record" },
      { key: "execution", record: row.exec, label: row.isBuy ? "Procurement Execution" : "Production Execution" },
      { key: "quality", record: row.qp, label: "Quality Plan" },
      { key: row.isBuy ? "po_preparation" : "wo_preparation", record: row.prep, label: row.isBuy ? "PO Preparation" : "WO Preparation" },
      { key: "inspection", record: row.insp, label: "Inspection Execution" },
    ];

    return (
      <TableRow className="bg-muted/30">
        <TableCell colSpan={8} className="p-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {layers.map(({ key, record, label }) => (
              <Card key={key} className="shadow-sm">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs font-medium">{label}</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-2 space-y-1">
                  {!record ? (
                    <p className="text-xs text-muted-foreground italic">Not created yet</p>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-muted-foreground">ID</span>
                        <span className="text-[10px] font-mono">{record.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-muted-foreground">Status</span>
                        <StatusBadge status={record.status} />
                      </div>
                      {record.item_code && (
                        <div className="flex justify-between">
                          <span className="text-[10px] text-muted-foreground">Item</span>
                          <span className="text-[10px] font-mono truncate ml-2">{record.item_code}</span>
                        </div>
                      )}
                      {record.quantity && (
                        <div className="flex justify-between">
                          <span className="text-[10px] text-muted-foreground">Qty</span>
                          <span className="text-[10px]">{record.quantity} {record.uom || ""}</span>
                        </div>
                      )}
                      {record.assigned_to_name && (
                        <div className="flex justify-between">
                          <span className="text-[10px] text-muted-foreground">Assigned</span>
                          <span className="text-[10px]">{record.assigned_to_name}</span>
                        </div>
                      )}
                      {record.inspection_type && (
                        <div className="flex justify-between">
                          <span className="text-[10px] text-muted-foreground">Type</span>
                          <span className="text-[10px]">{record.inspection_type.replace(/_/g, " ")}</span>
                        </div>
                      )}
                      {key === "planning" && record.reviewed_by && (
                        <div className="flex justify-between">
                          <span className="text-[10px] text-muted-foreground">Reviewed</span>
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <Layout>
      <Helmet><title>Execution Control Dashboard | THERMOPAC QMS</title></Helmet>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Execution Control Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monitor and control the full EPC pipeline for each project item</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-1" /> Filters
            </Button>
            <Button variant="outline" size="sm" onClick={invalidateAll} disabled={!projectId}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4 pb-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Project</label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProjects.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name || p.code} ({p.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Search Items</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by item code or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Classification</label>
                  <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classifications</SelectItem>
                      <SelectItem value="Buy">Buy</SelectItem>
                      <SelectItem value="Make">Make</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Layer Status</label>
                  <Select value={layerStatusFilter} onValueChange={setLayerStatusFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="under_review">Under Review</SelectItem>
                      <SelectItem value="released">Released</SelectItem>
                      <SelectItem value="under_preparation">Under Preparation</SelectItem>
                      <SelectItem value="ready_for_po">Ready for PO</SelectItem>
                      <SelectItem value="ready_for_wo">Ready for WO</SelectItem>
                      <SelectItem value="ready_for_inspection_setup">Ready for Inspection</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Exceptions</label>
                  <Select value={exceptionFilter} onValueChange={setExceptionFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Items</SelectItem>
                      <SelectItem value="stuck">Stuck in Draft</SelectItem>
                      <SelectItem value="pending">Pending Review</SelectItem>
                      <SelectItem value="blocked">Missing Classification</SelectItem>
                      <SelectItem value="none">No Exceptions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {projectId && pipelineRows.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="shadow-sm">
              <CardContent className="pt-3 pb-2 px-3 text-center">
                <div className="text-2xl font-bold">{summaryStats.total}</div>
                <div className="text-[10px] text-muted-foreground">Total Items</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-3 pb-2 px-3 text-center">
                <div className="text-2xl font-bold text-blue-600">{summaryStats.buyCount}</div>
                <div className="text-[10px] text-muted-foreground">Buy Items</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-3 pb-2 px-3 text-center">
                <div className="text-2xl font-bold text-violet-600">{summaryStats.makeCount}</div>
                <div className="text-[10px] text-muted-foreground">Make Items</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-3 pb-2 px-3 text-center">
                <div className="text-2xl font-bold text-green-600">{summaryStats.completedInsp}</div>
                <div className="text-[10px] text-muted-foreground">Inspections Done</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-3 pb-2 px-3 text-center">
                <div className="text-2xl font-bold text-amber-600">{summaryStats.withExceptions}</div>
                <div className="text-[10px] text-muted-foreground">With Exceptions</div>
              </CardContent>
            </Card>
          </div>
        )}

        {!projectId ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium">Select a Project</h3>
              <p className="text-sm text-muted-foreground mt-1">Choose a project above to view its execution control pipeline</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Loading pipeline data...</p>
            </CardContent>
          </Card>
        ) : filteredRows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium">No Items Found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {pipelineRows.length === 0 ? "This project has no items yet." : "No items match the current filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="text-xs font-semibold min-w-[180px]">Item</TableHead>
                      <TableHead className="text-xs font-semibold text-center w-[70px]">Class</TableHead>
                      <TableHead className="text-xs font-semibold text-center min-w-[110px]">
                        <div className="flex items-center justify-center gap-1"><FileText className="h-3 w-3" /> Planning</div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-center min-w-[110px]">
                        <div className="flex items-center justify-center gap-1"><Package className="h-3 w-3" /> Execution</div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-center min-w-[110px]">
                        <div className="flex items-center justify-center gap-1"><ClipboardCheck className="h-3 w-3" /> Quality</div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-center min-w-[110px]">
                        <div className="flex items-center justify-center gap-1"><ShoppingCart className="h-3 w-3" /> PO/WO Prep</div>
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-center min-w-[110px]">
                        <div className="flex items-center justify-center gap-1"><Eye className="h-3 w-3" /> Inspection</div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => {
                      const isExpanded = expandedRows.has(row.itemId);
                      return (
                        <TooltipProvider key={row.itemId}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => toggleRow(row.itemId)}
                          >
                            <TableCell className="w-8 pr-0">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-0.5">
                                <div className="text-xs font-medium truncate max-w-[200px]">{row.itemCode}</div>
                                <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{row.itemDesc}</div>
                                {row.exceptions.length > 0 && (
                                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                                    {row.exceptions.map((ex, i) => (
                                      <ExceptionBadge key={i} type={ex.type} label={ex.label} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={`text-[10px] px-1.5 ${row.classification === "Buy" ? "bg-blue-50 text-blue-700 border-blue-200" : row.classification === "Make" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                                {row.classification || "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              {renderLayerCell("planning", row.plan, row.itemCode)}
                            </TableCell>
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              {renderLayerCell("execution", row.exec, row.itemCode)}
                            </TableCell>
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              {renderLayerCell("quality", row.qp, row.itemCode)}
                            </TableCell>
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              {renderLayerCell(row.isBuy ? "po_preparation" : "wo_preparation", row.prep, row.itemCode)}
                            </TableCell>
                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                              {renderLayerCell("inspection", row.insp, row.itemCode)}
                            </TableCell>
                          </TableRow>
                          {isExpanded && renderExpandedDetails(row)}
                        </TooltipProvider>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog(prev => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actionDialog.action}</DialogTitle>
              <DialogDescription>
                {actionDialog.layer} record for: {actionDialog.itemDesc}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Current Status:</span>
                <StatusBadge status={actionDialog.recordStatus} />
              </div>
              {actionDialog.needsNote && (
                <div>
                  <label className="text-sm font-medium block mb-1">{actionDialog.noteLabel}</label>
                  <Textarea
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder={`Enter ${actionDialog.noteLabel.toLowerCase()}...`}
                    rows={3}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog(prev => ({ ...prev, open: false }))}>
                Cancel
              </Button>
              <Button
                onClick={executeAction}
                disabled={actionMutation.isPending || (actionDialog.needsNote && !actionNote.trim())}
                variant={actionDialog.action === "Cancel" || actionDialog.action.includes("Fail") ? "destructive" : "default"}
              >
                {actionMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
