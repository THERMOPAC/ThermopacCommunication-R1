import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Helmet } from "react-helmet";
import EpcDocumentPanel from "@/components/epc-document-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Loader2, Search, Filter, AlertTriangle, Clock, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, RefreshCw, FileText, Package, ClipboardCheck,
  ShoppingCart, Factory, Eye, Truck, Wrench, Receipt, DollarSign,
  ArrowRight, Minus, PenTool, List,
} from "lucide-react";

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
  dr_number?: string;
  dispatch_number?: string;
  cr_number?: string;
  br_number?: string;
  invoice_number?: string;
  billing_basis?: string;
  gross_amount?: string;
  amount_paid?: string;
  amount_outstanding?: string;
  total_amount?: string;
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
  extraBody?: Record<string, any>;
};

const PHASE_GROUPS = {
  engineering: { label: "Engineering", phases: ["planning", "execution", "quality"] },
  procurement: { label: "Procurement/Production", phases: ["preparation", "inspection"] },
  logistics: { label: "Logistics", phases: ["dispatch", "commissioning"] },
  commercial: { label: "Commercial", phases: ["billing", "invoice"] },
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
  ready_for_dispatch: "bg-cyan-100 text-cyan-700 border-cyan-300",
  dispatched: "bg-teal-100 text-teal-700 border-teal-300",
  confirmed: "bg-blue-100 text-blue-700 border-blue-300",
  shipped: "bg-indigo-100 text-indigo-700 border-indigo-300",
  delivered: "bg-green-100 text-green-700 border-green-300",
  ready_for_commissioning: "bg-cyan-100 text-cyan-700 border-cyan-300",
  commissioned: "bg-emerald-100 text-emerald-700 border-emerald-300",
  handed_over: "bg-green-100 text-green-700 border-green-300",
  ready_for_invoice: "bg-lime-100 text-lime-700 border-lime-300",
  invoiced: "bg-green-100 text-green-700 border-green-300",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-300",
  issued: "bg-blue-100 text-blue-700 border-blue-300",
  partially_paid: "bg-amber-100 text-amber-700 border-amber-300",
  paid: "bg-green-100 text-green-700 border-green-300",
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

function ExceptionBadge({ type, label }: { type: "stuck" | "pending" | "blocked" | "quality_fail"; label: string }) {
  const styles: Record<string, string> = {
    stuck: "bg-red-50 text-red-600 border-red-200",
    pending: "bg-amber-50 text-amber-600 border-amber-200",
    blocked: "bg-orange-50 text-orange-600 border-orange-200",
    quality_fail: "bg-red-50 text-red-700 border-red-300",
  };
  const icons: Record<string, any> = { stuck: Clock, pending: AlertTriangle, blocked: XCircle, quality_fail: XCircle };
  const Icon = icons[type] || AlertTriangle;
  return (
    <Badge variant="outline" className={`${styles[type] || styles.blocked} text-[9px] px-1 py-0 border gap-0.5`}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </Badge>
  );
}

function PipelineProgressBar({ row }: { row: any }) {
  const execAppKey = row.isBuy ? "procurement_execution" : "production_execution";
  const prepAppKey = row.isBuy ? "po_preparation" : "wo_preparation";
  const layers = [
    { key: "plan", terminal: ["released", "completed"], appKey: "planning" },
    { key: "exec", terminal: ["ready_for_po", "ready_for_wo", "completed"], appKey: execAppKey },
    { key: "qp", terminal: ["ready_for_inspection_setup", "completed"], appKey: "quality" },
    { key: "prep", terminal: ["ready_for_po_creation", "ready_for_wo_creation", "completed"], appKey: prepAppKey },
    { key: "insp", terminal: ["completed"], appKey: "inspection" },
    { key: "disp", terminal: ["dispatched"], appKey: "dispatch" },
    { key: "comm", terminal: ["handed_over", "commissioned"], appKey: "commissioning" },
    { key: "bill", terminal: ["ready_for_invoice", "invoiced"], appKey: "billing" },
    { key: "inv", terminal: ["issued", "paid"], appKey: "invoice" },
  ];
  const applicableLayers = layers.filter(l => row.applicability?.[l.appKey]?.applicable !== false);
  const total = applicableLayers.length;
  let done = 0;
  for (const l of applicableLayers) {
    const rec = row[l.key];
    if (rec && l.terminal.includes(rec.status)) done++;
    else break;
  }
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-muted-foreground">{pct}%</span>
    </div>
  );
}

function getExceptions(row: any) {
  const exceptions: { type: "stuck" | "pending" | "blocked" | "quality_fail"; label: string; layer: string }[] = [];
  const { plan, exec, insp, classification } = row;
  if (!classification || classification === "unclassified") {
    exceptions.push({ type: "blocked", label: "No classification", layer: "planning" });
  }
  if (plan?.status === "draft") {
    const created = plan.created_at ? new Date(plan.created_at) : null;
    if (created && (Date.now() - created.getTime()) > 3 * 24 * 60 * 60 * 1000) {
      exceptions.push({ type: "stuck", label: "Stuck in draft", layer: "planning" });
    }
  }
  if (plan?.status === "under_review" && !plan.reviewed_by) {
    exceptions.push({ type: "pending", label: "Awaiting review", layer: "planning" });
  }
  if (insp?.status === "failed") {
    exceptions.push({ type: "quality_fail", label: "Inspection failed", layer: "inspection" });
  }
  return exceptions;
}

function getAvailableActions(layer: string, status: string | null, record: PipelineRecord | null): { label: string; action: string; variant: "default" | "outline" | "destructive"; endpoint: string; needsNote: boolean; noteLabel: string; bodyKey: string; extraBody?: Record<string, any> }[] {
  if (!status || !record) return [];
  const id = record.id;

  if (layer === "planning") {
    if (status === "draft") return [
      { label: "Submit", action: "submit", variant: "default", endpoint: `/api/planning-records/${id}/submit-for-review`, needsNote: false, noteLabel: "", bodyKey: "" },
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
      { label: "Start Prep", action: "prepare", variant: "default", endpoint: `/api/${prefix}/${id}/start-preparation`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "under_preparation") return [
      { label: "Ready", action: "mark-ready", variant: "default", endpoint: `/api/${prefix}/${id}/mark-ready`, needsNote: true, noteLabel: "Preparation Note", bodyKey: "preparationNote" },
    ];
  }

  if (layer === "quality") {
    if (status === "draft") return [
      { label: "Start Prep", action: "start-prep", variant: "default", endpoint: `/api/quality-plans/${id}/start-preparation`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "under_preparation") return [
      { label: "Ready", action: "mark-ready", variant: "default", endpoint: `/api/quality-plans/${id}/mark-ready`, needsNote: true, noteLabel: "Preparation Note", bodyKey: "preparationNote" },
    ];
  }

  if (layer === "po_preparation" || layer === "wo_preparation") {
    const prefix = layer === "po_preparation" ? "po-preparations" : "wo-preparations";
    if (status === "draft") return [
      { label: "Submit", action: "submit", variant: "default", endpoint: `/api/${prefix}/${id}/submit-for-review`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "under_review") return [
      { label: "Approve", action: "approve", variant: "default", endpoint: `/api/${prefix}/${id}/approve`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
  }

  if (layer === "inspection") {
    if (status === "draft") return [
      { label: "Schedule", action: "schedule", variant: "default", endpoint: `/api/inspection-executions/${id}/schedule`, needsNote: true, noteLabel: "Scheduled Date (YYYY-MM-DD)", bodyKey: "scheduledDate" },
    ];
    if (status === "scheduled") return [
      { label: "Start", action: "start", variant: "default", endpoint: `/api/inspection-executions/${id}/start`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "in_progress") return [
      { label: "Pass", action: "complete-pass", variant: "default", endpoint: `/api/inspection-executions/${id}/complete`, needsNote: false, noteLabel: "", bodyKey: "", extraBody: { result: "pass" } },
      { label: "Fail", action: "fail", variant: "destructive", endpoint: `/api/inspection-executions/${id}/fail`, needsNote: true, noteLabel: "Failure Reason", bodyKey: "failureReason" },
    ];
  }

  if (layer === "dispatch") {
    if (status === "draft") return [
      { label: "Start Prep", action: "start-prep", variant: "default", endpoint: `/api/dispatch-readiness/${id}/start-preparation`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "under_preparation") return [
      { label: "Mark Ready", action: "mark-ready", variant: "default", endpoint: `/api/dispatch-readiness/${id}/mark-ready`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "ready_for_dispatch") return [
      { label: "Dispatch", action: "dispatch", variant: "default", endpoint: `/api/dispatch-readiness/${id}/dispatch`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
  }

  if (layer === "dispatch_record") {
    if (status === "draft") return [
      { label: "Confirm", action: "confirm", variant: "default", endpoint: `/api/dispatch-records/${id}/confirm`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "confirmed") return [
      { label: "Ship", action: "ship", variant: "default", endpoint: `/api/dispatch-records/${id}/ship`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "shipped") return [
      { label: "Deliver", action: "deliver", variant: "default", endpoint: `/api/dispatch-records/${id}/deliver`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
  }

  if (layer === "commissioning") {
    if (status === "draft") return [
      { label: "Start Prep", action: "start-prep", variant: "default", endpoint: `/api/commissioning-readiness/${id}/start-preparation`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "under_preparation") return [
      { label: "Mark Ready", action: "mark-ready", variant: "default", endpoint: `/api/commissioning-readiness/${id}/mark-ready`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "ready_for_commissioning") return [
      { label: "Commission", action: "commission", variant: "default", endpoint: `/api/commissioning-readiness/${id}/commission`, needsNote: true, noteLabel: "Commissioning Note", bodyKey: "commissioningNote" },
    ];
    if (status === "commissioned") return [
      { label: "Handover", action: "handover", variant: "default", endpoint: `/api/commissioning-readiness/${id}/handover`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
  }

  if (layer === "billing") {
    if (status === "draft") return [
      { label: "Submit Review", action: "submit-review", variant: "default", endpoint: `/api/billing-readiness/${id}/submit-review`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "under_review") return [
      { label: "Approve", action: "approve", variant: "default", endpoint: `/api/billing-readiness/${id}/approve`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
  }

  if (layer === "invoice") {
    if (status === "draft") return [
      { label: "Approve", action: "approve", variant: "default", endpoint: `/api/epc-invoices/${id}/approve`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "approved") return [
      { label: "Issue", action: "issue", variant: "default", endpoint: `/api/epc-invoices/${id}/issue`, needsNote: false, noteLabel: "", bodyKey: "" },
    ];
    if (status === "issued" || status === "partially_paid") return [
      { label: "Record Payment", action: "record-payment", variant: "default", endpoint: `/api/epc-invoices/${id}/record-payment`, needsNote: true, noteLabel: "Payment Amount", bodyKey: "paymentAmount" },
    ];
  }

  return [];
}

export default function ExecutionControlDashboard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userRole = user?.role || "Viewer";
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<string>("all");
  const [layerStatusFilter, setLayerStatusFilter] = useState<string>("all");
  const [exceptionFilter, setExceptionFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [actionDialog, setActionDialog] = useState<ActionDialogState>({
    open: false, action: "", layer: "", recordId: 0, recordStatus: "",
    itemDesc: "", needsNote: false, noteLabel: "", endpoint: "", bodyKey: "",
  });
  const [actionNote, setActionNote] = useState("");
  const [explosionDialog, setExplosionDialog] = useState<{ open: boolean; bomHeaderId: number | null; bomNumber: string }>({ open: false, bomHeaderId: null, bomNumber: "" });
  const [explosionPreview, setExplosionPreview] = useState<any>(null);
  const [explosionLoading, setExplosionLoading] = useState(false);
  const [selectedExplosionLines, setSelectedExplosionLines] = useState<number[]>([]);

  const { data: projects = [], isLoading: loadingProjects } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const { data: itemCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/projects/item-counts"],
  });

  const activeProjects = useMemo(() => {
    const filtered = projects.filter((p: any) => p.status === "active" || p.status === "planning");
    filtered.sort((a: any, b: any) => ((itemCounts[b.id] || 0) - (itemCounts[a.id] || 0)));
    return filtered;
  }, [projects, itemCounts]);

  useEffect(() => {
    if (!selectedProjectId && activeProjects.length > 0) {
      const withItems = activeProjects.find((p: any) => (itemCounts[p.id] || 0) > 0);
      if (withItems) setSelectedProjectId(String(withItems.id));
    }
  }, [activeProjects, itemCounts, selectedProjectId]);

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

  const { data: dispatchReadiness = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "dispatch-readiness"],
    queryFn: () => fetch(`/api/projects/${projectId}/dispatch-readiness`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: dispatchRecords = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "dispatch-records"],
    queryFn: () => fetch(`/api/projects/${projectId}/dispatch-records`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: commissioningReadiness = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "commissioning-readiness"],
    queryFn: () => fetch(`/api/projects/${projectId}/commissioning-readiness`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: billingReadiness = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "billing-readiness"],
    queryFn: () => fetch(`/api/projects/${projectId}/billing-readiness`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: epcInvoices = [] } = useQuery<PipelineRecord[]>({
    queryKey: ["/api/projects", projectId, "epc-invoices"],
    queryFn: () => fetch(`/api/projects/${projectId}/epc-invoices`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: drawingControls = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "drawing-controls"],
    queryFn: () => fetch(`/api/projects/${projectId}/drawing-controls`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: bomHeaders = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "bom-headers"],
    queryFn: () => fetch(`/api/projects/${projectId}/bom-headers`).then(r => r.json()),
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
    const keys = [
      "planning-records", "procurement-executions", "production-executions",
      "quality-plans", "po-preparations", "wo-preparations", "inspection-executions",
      "dispatch-readiness", "dispatch-records", "commissioning-readiness",
      "billing-readiness", "epc-invoices", "drawing-controls", "bom-headers",
    ];
    keys.forEach(k => queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, k] }));
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "items"] });
  }

  async function openExplosionDialog(bomHeaderId: number, bomNumber: string) {
    setExplosionDialog({ open: true, bomHeaderId, bomNumber });
    setExplosionLoading(true);
    setExplosionPreview(null);
    setSelectedExplosionLines([]);
    try {
      const resp = await fetch(`/api/bom-headers/${bomHeaderId}/explosion-preview`);
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Preview failed", description: data.message || "Could not load explosion preview", variant: "destructive" });
        setExplosionDialog({ open: false, bomHeaderId: null, bomNumber: "" });
        return;
      }
      setExplosionPreview(data);
      const explodable = (data.lines || []).filter((l: any) => ['create', 'reuse', 'needs_review'].includes(l.action)).map((l: any) => l.lineId);
      setSelectedExplosionLines(explodable);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setExplosionDialog({ open: false, bomHeaderId: null, bomNumber: "" });
    } finally {
      setExplosionLoading(false);
    }
  }

  async function executeExplosion() {
    if (!explosionDialog.bomHeaderId || selectedExplosionLines.length === 0) return;
    setExplosionLoading(true);
    try {
      const data: any = await apiRequest("POST", `/api/bom-headers/${explosionDialog.bomHeaderId}/explode`, {
        lineIds: selectedExplosionLines, confirm: true,
      });
      toast({ title: "Explosion complete", description: data.message || `${data.summary?.created || 0} child records created` });
      setExplosionDialog({ open: false, bomHeaderId: null, bomNumber: "" });
      setExplosionPreview(null);
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Explosion failed", description: e.message, variant: "destructive" });
    } finally {
      setExplosionLoading(false);
    }
  }

  function findActive(records: PipelineRecord[], itemId: number) {
    if (!Array.isArray(records)) return null;
    return records.find((r) => r.project_item_id === itemId && !["superseded", "cancelled"].includes(r.status))
      || records.find((r) => r.project_item_id === itemId)
      || null;
  }

  function findActiveDc(records: any[], itemId: number) {
    if (!Array.isArray(records)) return null;
    return records.find((r: any) => r.project_item_id === itemId && !["superseded", "cancelled"].includes(r.status))
      || records.find((r: any) => r.project_item_id === itemId)
      || null;
  }

  function getStepApplicability(classification: string | null): Record<string, { applicable: boolean; reason?: string }> {
    const isBuy = classification === "Buy";
    const isMake = classification === "Make";
    return {
      planning: { applicable: true },
      procurement_execution: { applicable: isBuy || (!isBuy && !isMake), reason: isMake ? "Make items use Production Execution" : undefined },
      production_execution: { applicable: isMake || (!isBuy && !isMake), reason: isBuy ? "Buy items use Procurement Execution" : undefined },
      execution: { applicable: true },
      quality: { applicable: true },
      po_preparation: { applicable: isBuy || (!isBuy && !isMake), reason: isMake ? "Make items use WO Preparation" : undefined },
      wo_preparation: { applicable: isMake || (!isBuy && !isMake), reason: isBuy ? "Buy items use PO Preparation" : undefined },
      epc_po: { applicable: isBuy || (!isBuy && !isMake), reason: isMake ? "Make items use Work Orders" : undefined },
      epc_wo: { applicable: isMake || (!isBuy && !isMake), reason: isBuy ? "Buy items use Purchase Orders" : undefined },
      inspection: { applicable: true },
      dispatch: { applicable: true },
      dispatch_record: { applicable: true },
      commissioning: { applicable: true },
      billing: { applicable: true },
      invoice: { applicable: true },
    };
  }

  function getEngineeringWarnings(dc: any, bom: any, classification: string | null) {
    const warnings: { type: string; label: string }[] = [];
    const isBuy = classification === "Buy";
    const isMake = classification === "Make";

    if (!dc) {
      warnings.push({ type: "eng_missing", label: "No drawing control" });
    } else if (dc.status !== "released") {
      if (isBuy && !dc.released_for_procurement) {
        warnings.push({ type: "eng_gate", label: "DWG not released for procurement" });
      }
      if (isMake && !dc.released_for_manufacturing) {
        warnings.push({ type: "eng_gate", label: "DWG not released for manufacturing" });
      }
      if (!isBuy && !isMake && dc.status !== "released") {
        warnings.push({ type: "eng_gate", label: `DWG: ${dc.status.replace(/_/g, " ")}` });
      }
    }

    if (!bom) {
      warnings.push({ type: "eng_missing", label: "No BOM" });
    } else if (bom.status !== "released") {
      if (bom.status === "approved") {
        warnings.push({ type: "eng_gate", label: "BOM approved, not released" });
      } else {
        warnings.push({ type: "eng_gate", label: `BOM: ${bom.status.replace(/_/g, " ")}` });
      }
    }

    return warnings;
  }

  const pipelineRows = useMemo(() => {
    if (!projectItems.length) return [];

    return projectItems.map((item: any) => {
      const itemId = item.id;
      const plan = findActive(planningRecords, itemId);
      const classification = plan?.classification_snapshot || item.masterItem?.make_or_buy || null;
      const isBuy = classification === "Buy";

      const exec = isBuy ? findActive(procExecs, itemId) : findActive(prodExecs, itemId);
      const qp = findActive(qualityPlans, itemId);
      const prep = isBuy ? findActive(poPreps, itemId) : findActive(woPreps, itemId);
      const insp = findActive(inspExecs, itemId);
      const disp = findActive(dispatchReadiness, itemId);
      const dispRec = findActive(dispatchRecords, itemId);
      const comm = findActive(commissioningReadiness, itemId);
      const bill = findActive(billingReadiness, itemId);
      const inv = findActive(epcInvoices, itemId);

      const dc = findActiveDc(drawingControls, itemId);
      const bom = findActiveDc(bomHeaders, itemId);
      const engWarnings = getEngineeringWarnings(dc, bom, classification);
      const applicability = getStepApplicability(classification);

      const itemCode = plan?.item_code || exec?.item_code || item.masterItem?.item_code || `Item #${itemId}`;
      const itemDesc = plan?.item_description || exec?.item_description || item.masterItem?.description || "";

      const row = {
        itemId, item, plan, exec, qp, prep, insp, disp, dispRec, comm, bill, inv,
        dc, bom, engWarnings, applicability,
        classification, isBuy, itemCode, itemDesc,
        exceptions: [] as any[],
      };
      row.exceptions = getExceptions(row);
      return row;
    });
  }, [projectItems, planningRecords, procExecs, prodExecs, qualityPlans, poPreps, woPreps, inspExecs, dispatchReadiness, dispatchRecords, commissioningReadiness, billingReadiness, epcInvoices, drawingControls, bomHeaders]);

  const filteredRows = useMemo(() => {
    return pipelineRows.filter((row) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!row.itemCode.toLowerCase().includes(q) && !row.itemDesc.toLowerCase().includes(q)) return false;
      }
      if (classificationFilter !== "all" && row.classification !== classificationFilter) return false;
      if (exceptionFilter !== "all") {
        if (exceptionFilter === "stuck" && !row.exceptions.some((e: any) => e.type === "stuck")) return false;
        if (exceptionFilter === "pending" && !row.exceptions.some((e: any) => e.type === "pending")) return false;
        if (exceptionFilter === "blocked" && !row.exceptions.some((e: any) => e.type === "blocked")) return false;
        if (exceptionFilter === "quality_fail" && !row.exceptions.some((e: any) => e.type === "quality_fail")) return false;
        if (exceptionFilter === "eng_warning" && row.engWarnings.length === 0) return false;
        if (exceptionFilter === "none" && row.exceptions.length > 0) return false;
      }
      if (layerStatusFilter !== "all") {
        const allStatuses = [
          row.plan?.status, row.exec?.status, row.qp?.status, row.prep?.status, row.insp?.status,
          row.disp?.status, row.dispRec?.status, row.comm?.status, row.bill?.status, row.inv?.status,
        ].filter(Boolean);
        if (!allStatuses.includes(layerStatusFilter)) return false;
      }
      if (phaseFilter !== "all") {
        if (phaseFilter === "no_planning" && row.plan) return false;
        if (phaseFilter === "no_dispatch" && row.disp) return false;
        if (phaseFilter === "no_invoice" && row.inv) return false;
        if (phaseFilter === "dispatched" && row.disp?.status !== "dispatched") return false;
        if (phaseFilter === "commissioned" && !["commissioned", "handed_over"].includes(row.comm?.status || "")) return false;
        if (phaseFilter === "invoiced" && !["issued", "partially_paid", "paid"].includes(row.inv?.status || "")) return false;
      }
      return true;
    });
  }, [pipelineRows, searchQuery, classificationFilter, layerStatusFilter, exceptionFilter, phaseFilter]);

  const summaryStats = useMemo(() => {
    const total = pipelineRows.length;
    const withExceptions = pipelineRows.filter(r => r.exceptions.length > 0).length;
    const buyCount = pipelineRows.filter(r => r.classification === "Buy").length;
    const makeCount = pipelineRows.filter(r => r.classification === "Make").length;
    const completedInsp = pipelineRows.filter(r => r.insp?.status === "completed").length;
    const dispatchedCount = pipelineRows.filter(r => r.disp?.status === "dispatched" || r.dispRec).length;
    const commissionedCount = pipelineRows.filter(r => ["commissioned", "handed_over"].includes(r.comm?.status || "")).length;
    const invoicedCount = pipelineRows.filter(r => ["issued", "partially_paid", "paid"].includes(r.inv?.status || "")).length;
    const paidCount = pipelineRows.filter(r => r.inv?.status === "paid").length;
    const engWarningCount = pipelineRows.filter(r => r.engWarnings.length > 0).length;
    const dwgReleasedCount = pipelineRows.filter(r => r.dc?.status === "released").length;
    const bomReleasedCount = pipelineRows.filter(r => r.bom?.status === "released").length;
    return { total, withExceptions, buyCount, makeCount, completedInsp, dispatchedCount, commissionedCount, invoicedCount, paidCount, engWarningCount, dwgReleasedCount, bomReleasedCount };
  }, [pipelineRows]);

  function openActionDialog(action: any, layer: string, record: PipelineRecord, itemDesc: string) {
    setActionDialog({
      open: true, action: action.label, layer, recordId: record.id,
      recordStatus: record.status, itemDesc, needsNote: action.needsNote,
      noteLabel: action.noteLabel, endpoint: action.endpoint, bodyKey: action.bodyKey,
      extraBody: action.extraBody,
    });
    setActionNote("");
  }

  function executeAction() {
    const body: any = { ...(actionDialog.extraBody || {}) };
    if (actionDialog.bodyKey && actionNote) {
      body[actionDialog.bodyKey] = actionNote;
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

  function renderLayerCell(layer: string, record: PipelineRecord | null, itemDesc: string, isApplicable: boolean = true) {
    if (!isApplicable) {
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="text-[8px] px-1.5 py-0.5 bg-slate-50 text-slate-400 border-slate-200">
              N/A
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Not applicable for this item's classification</TooltipContent>
        </Tooltip>
      );
    }
    if (!record) return <span className="text-[10px] text-muted-foreground">—</span>;
    const actions = getAvailableActions(layer, record.status, record);
    return (
      <div className="flex flex-col items-center gap-0.5">
        <StatusBadge status={record.status} />
        {actions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-0.5">
            {actions.slice(0, 2).map((a) => (
              <Button
                key={a.action}
                size="sm"
                variant={a.variant}
                className="h-5 text-[8px] px-1 py-0"
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

  function renderDwgCell(dc: any, classification: string | null) {
    if (!dc) return <span className="text-[10px] text-muted-foreground">—</span>;
    const isBuy = classification === "Buy";
    const isMake = classification === "Make";

    const statusStyle = dc.status === "released" ? "bg-green-100 text-green-700 border-green-300"
      : dc.status === "approved" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : dc.status === "under_review" ? "bg-blue-100 text-blue-700 border-blue-300"
      : "bg-gray-100 text-gray-700 border-gray-300";

    const hasGateWarning = dc.status === "released" && (
      (isBuy && !dc.released_for_procurement) ||
      (isMake && !dc.released_for_manufacturing)
    );

    return (
      <Tooltip>
        <TooltipTrigger>
          <div className="flex flex-col items-center gap-0.5">
            <Badge variant="outline" className={`${statusStyle} text-[10px] font-medium px-1.5 py-0.5 whitespace-nowrap border`}>
              {dc.status.replace(/_/g, " ")}
            </Badge>
            {dc.dwg_control_number && (
              <span className="text-[8px] text-muted-foreground font-mono">{dc.dwg_control_number}</span>
            )}
            {dc.status === "released" && !hasGateWarning && (
              <div className="flex gap-0.5">
                {dc.released_for_procurement && <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-green-50 text-green-600 border-green-200">P</Badge>}
                {dc.released_for_manufacturing && <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-green-50 text-green-600 border-green-200">M</Badge>}
              </div>
            )}
            {hasGateWarning && (
              <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-orange-50 text-orange-600 border-orange-200">
                <AlertTriangle className="h-2 w-2 mr-0.5" />
                {isBuy ? "P gate" : "M gate"}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          <p className="font-medium">{dc.dwg_control_number}</p>
          <p>Status: {dc.status.replace(/_/g, " ")}</p>
          {dc.drawing_number && <p>Drawing: {dc.drawing_number} Rev {dc.drawing_revision || "—"}</p>}
          <p>Procurement: {dc.released_for_procurement ? "Released" : "Not released"}</p>
          <p>Manufacturing: {dc.released_for_manufacturing ? "Released" : "Not released"}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  function renderBomCell(bom: any) {
    if (!bom) return <span className="text-[10px] text-muted-foreground">—</span>;

    const statusStyle = bom.status === "released" ? "bg-green-100 text-green-700 border-green-300"
      : bom.status === "approved" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : bom.status === "under_review" ? "bg-blue-100 text-blue-700 border-blue-300"
      : "bg-gray-100 text-gray-700 border-gray-300";

    const typeLabel = bom.bom_type === "procurement" ? "Proc"
      : bom.bom_type === "manufacturing" ? "Mfg"
      : "Assy";

    return (
      <Tooltip>
        <TooltipTrigger>
          <div className="flex flex-col items-center gap-0.5">
            <Badge variant="outline" className={`${statusStyle} text-[10px] font-medium px-1.5 py-0.5 whitespace-nowrap border`}>
              {bom.status.replace(/_/g, " ")}
            </Badge>
            {bom.bom_number && (
              <span className="text-[8px] text-muted-foreground font-mono">{bom.bom_number}</span>
            )}
            <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-slate-50 text-slate-600 border-slate-200">
              {typeLabel}
            </Badge>
            {bom.total_line_count > 0 && (
              <span className="text-[7px] text-muted-foreground">{bom.total_line_count} lines</span>
            )}
            {bom.status === "released" && bom.total_line_count > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-4 text-[7px] px-1 py-0 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                onClick={(e) => { e.stopPropagation(); openExplosionDialog(bom.id, bom.bom_number); }}
              >
                Explode
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          <p className="font-medium">{bom.bom_number} (Rev {bom.bom_revision || "A"})</p>
          <p>Type: {bom.bom_type}</p>
          <p>Status: {bom.status.replace(/_/g, " ")}</p>
          <p>Lines: {bom.total_line_count}</p>
          {bom.total_estimated_cost && <p>Est. Cost: {parseFloat(bom.total_estimated_cost).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  function renderDispatchCell(row: any) {
    const dr = row.disp;
    const rec = row.dispRec;
    if (!dr && !rec) return <span className="text-[10px] text-muted-foreground">—</span>;
    return (
      <div className="flex flex-col items-center gap-0.5">
        {dr && (
          <Tooltip>
            <TooltipTrigger>
              <StatusBadge status={dr.status} />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>DR: {dr.dr_number || `#${dr.id}`}</p>
              <p>Status: {dr.status?.replace(/_/g, " ")}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {rec && (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="text-[8px] px-1 py-0 bg-teal-50 text-teal-700 border-teal-200">
                {rec.status?.replace(/_/g, " ")}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p>Dispatch: {rec.dispatch_number || `#${rec.id}`}</p>
              <p>Status: {rec.status?.replace(/_/g, " ")}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {dr && !rec && getAvailableActions("dispatch", dr.status, dr).slice(0, 1).map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant={a.variant}
            className="h-5 text-[8px] px-1 py-0"
            onClick={(e) => { e.stopPropagation(); openActionDialog(a, "dispatch", dr, row.itemCode); }}
          >
            {a.label}
          </Button>
        ))}
        {rec && getAvailableActions("dispatch_record", rec.status, rec).slice(0, 1).map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant={a.variant}
            className="h-5 text-[8px] px-1 py-0"
            onClick={(e) => { e.stopPropagation(); openActionDialog(a, "dispatch_record", rec, row.itemCode); }}
          >
            {a.label}
          </Button>
        ))}
      </div>
    );
  }

  function renderFinancialCell(layer: string, record: PipelineRecord | null, itemDesc: string) {
    if (!record) return <span className="text-[10px] text-muted-foreground">—</span>;
    const actions = getAvailableActions(layer, record.status, record);
    const amt = record.gross_amount || record.total_amount;
    return (
      <div className="flex flex-col items-center gap-0.5">
        <StatusBadge status={record.status} />
        {amt && (
          <span className="text-[8px] text-muted-foreground font-mono">
            {parseFloat(amt).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}
          </span>
        )}
        {layer === "invoice" && record.status === "partially_paid" && record.amount_outstanding && (
          <span className="text-[8px] text-amber-600 font-mono">
            Due: {parseFloat(record.amount_outstanding).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        )}
        {actions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-0.5">
            {actions.slice(0, 1).map((a) => (
              <Button
                key={a.action}
                size="sm"
                variant={a.variant}
                className="h-5 text-[8px] px-1 py-0"
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
    const execApplicabilityKey = row.isBuy ? "procurement_execution" : "production_execution";
    const prepApplicabilityKey = row.isBuy ? "po_preparation" : "wo_preparation";
    const LAYER_DOC_TYPE: Record<string, string> = {
      planning: "PLN", execution: "BUY", production: "MFG",
      quality: "QPL", po_preparation: "POP", wo_preparation: "WOP",
      inspection: "INS", dispatch: "DR", dispatch_record: "DSP",
      commissioning: "CR", billing: "BR", invoice: "INV",
    };
    const layers = [
      { key: "planning", record: row.plan, label: "Planning", icon: FileText, applicabilityKey: "planning", docType: "PLN" },
      { key: "execution", record: row.exec, label: row.isBuy ? "Procurement" : "Production", icon: Package, applicabilityKey: execApplicabilityKey, docType: row.isBuy ? "BUY" : "MFG" },
      { key: "quality", record: row.qp, label: "Quality Plan", icon: ClipboardCheck, applicabilityKey: "quality", docType: "QPL" },
      { key: row.isBuy ? "po_preparation" : "wo_preparation", record: row.prep, label: row.isBuy ? "PO Prep" : "WO Prep", icon: ShoppingCart, applicabilityKey: prepApplicabilityKey, docType: row.isBuy ? "POP" : "WOP" },
      { key: "inspection", record: row.insp, label: "Inspection", icon: Eye, applicabilityKey: "inspection", docType: "INS" },
      { key: "dispatch", record: row.disp, label: "Dispatch Readiness", icon: Truck, applicabilityKey: "dispatch", docType: "DR" },
      { key: "dispatch_record", record: row.dispRec, label: "Dispatch Record", icon: Truck, applicabilityKey: "dispatch_record", docType: "DSP" },
      { key: "commissioning", record: row.comm, label: "Commissioning", icon: Wrench, applicabilityKey: "commissioning", docType: "CR" },
      { key: "billing", record: row.bill, label: "Billing", icon: Receipt, applicabilityKey: "billing", docType: "BR" },
      { key: "invoice", record: row.inv, label: "Invoice", icon: DollarSign, applicabilityKey: "invoice", docType: "INV" },
    ];

    return (
      <TableRow className="bg-muted/30">
        <TableCell colSpan={14} className="p-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">Full Pipeline:</span>
              <PipelineProgressBar row={row} />
            </div>
            {row.engWarnings.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-orange-700">Engineering Warnings:</span>
                {row.engWarnings.map((w: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0 bg-orange-50 text-orange-700 border-orange-200 gap-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {w.label}
                  </Badge>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {[
                { key: "drawing_control", record: row.dc, label: "Drawing Control", icon: PenTool, isEng: true },
                { key: "bom", record: row.bom, label: "BOM", icon: List, isEng: true },
              ].map(({ key, record, label, icon: Icon, isEng }) => (
                <Card key={key} className={`shadow-sm ${!record ? "opacity-50" : ""}`}>
                  <CardHeader className="py-1.5 px-2.5">
                    <CardTitle className="text-[10px] font-medium flex items-center gap-1">
                      <Icon className="h-3 w-3" /> {label}
                      {record?.revision_code && (
                        <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-blue-50 text-blue-600 border-blue-200 ml-auto">
                          Rev {record.revision_code}
                        </Badge>
                      )}
                      {record?.is_current === false && (
                        <Badge variant="outline" className="text-[7px] px-0.5 py-0 bg-orange-50 text-orange-600 border-orange-200">
                          superseded
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2.5 pb-2 space-y-0.5">
                    {!record ? (
                      <p className="text-[10px] text-muted-foreground italic">Not created</p>
                    ) : (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-muted-foreground">Status</span>
                          <StatusBadge status={record.status} />
                        </div>
                        {(record.dwg_control_number || record.bom_number) && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Ref</span>
                            <span className="text-[9px] font-mono">{record.dwg_control_number || record.bom_number}</span>
                          </div>
                        )}
                        {record.drawing_number && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Drawing</span>
                            <span className="text-[9px] font-mono truncate ml-1">{record.drawing_number}</span>
                          </div>
                        )}
                        {record.bom_type && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Type</span>
                            <span className="text-[9px]">{record.bom_type}</span>
                          </div>
                        )}
                        {record.bom_revision && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Rev</span>
                            <span className="text-[9px]">{record.bom_revision}</span>
                          </div>
                        )}
                        {record.total_line_count > 0 && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Lines</span>
                            <span className="text-[9px]">{record.total_line_count}</span>
                          </div>
                        )}
                        {record.total_estimated_cost && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">Est. Cost</span>
                            <span className="text-[9px] font-mono">{parseFloat(record.total_estimated_cost).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        {record.released_for_procurement !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">P-Release</span>
                            <span className={`text-[9px] ${record.released_for_procurement ? "text-green-600" : "text-gray-400"}`}>{record.released_for_procurement ? "Yes" : "No"}</span>
                          </div>
                        )}
                        {record.released_for_manufacturing !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-[9px] text-muted-foreground">M-Release</span>
                            <span className={`text-[9px] ${record.released_for_manufacturing ? "text-green-600" : "text-gray-400"}`}>{record.released_for_manufacturing ? "Yes" : "No"}</span>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            {projectId && (row.dc || row.bom) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {row.dc && (
                  <EpcDocumentPanel
                    projectId={projectId}
                    docType="DWG"
                    parentEntityId={row.dc.id}
                    documentNumber={row.dc.dwg_control_number}
                    parentStatus={row.dc.status}
                    userRole={userRole}
                  />
                )}
                {row.bom && (
                  <EpcDocumentPanel
                    projectId={projectId}
                    docType="BOM"
                    parentEntityId={row.bom.id}
                    documentNumber={row.bom.bom_number}
                    parentStatus={row.bom.status}
                    userRole={userRole}
                  />
                )}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {layers.map(({ key, record, label, icon: Icon, applicabilityKey, docType }) => {
                const stepApplicable = row.applicability[applicabilityKey]?.applicable !== false;
                const actions = record && stepApplicable ? getAvailableActions(key, record.status, record) : [];
                const refNum = record?.planning_number || record?.procurement_number || record?.production_number || record?.quality_plan_number || record?.po_prep_number || record?.wo_prep_number || record?.inspection_number || record?.dr_number || record?.dispatch_number || record?.cr_number || record?.br_number || record?.invoice_number;
                return (
                  <Card key={key} className={`shadow-sm ${!stepApplicable ? "opacity-40 border-dashed" : !record ? "opacity-50" : ""}`}>
                    <CardHeader className="py-1.5 px-2.5">
                      <CardTitle className="text-[10px] font-medium flex items-center gap-1">
                        <Icon className="h-3 w-3" /> {label}
                        {!stepApplicable && <Badge variant="outline" className="text-[7px] px-1 py-0 ml-1 bg-slate-50 text-slate-400 border-slate-200">N/A</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2.5 pb-2 space-y-0.5">
                      {!stepApplicable ? (
                        <p className="text-[9px] text-slate-400 italic">{row.applicability[applicabilityKey]?.reason || "Not applicable"}</p>
                      ) : !record ? (
                        <p className="text-[10px] text-muted-foreground italic">Not created</p>
                      ) : (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-muted-foreground">Status</span>
                            <StatusBadge status={record.status} />
                          </div>
                          {(record.dr_number || record.dispatch_number || record.cr_number || record.br_number || record.invoice_number) && (
                            <div className="flex justify-between">
                              <span className="text-[9px] text-muted-foreground">Ref</span>
                              <span className="text-[9px] font-mono">{record.dr_number || record.dispatch_number || record.cr_number || record.br_number || record.invoice_number}</span>
                            </div>
                          )}
                          {record.item_code && (
                            <div className="flex justify-between">
                              <span className="text-[9px] text-muted-foreground">Item</span>
                              <span className="text-[9px] font-mono truncate ml-1">{record.item_code}</span>
                            </div>
                          )}
                          {record.quantity && (
                            <div className="flex justify-between">
                              <span className="text-[9px] text-muted-foreground">Qty</span>
                              <span className="text-[9px]">{record.quantity} {record.uom || ""}</span>
                            </div>
                          )}
                          {record.gross_amount && (
                            <div className="flex justify-between">
                              <span className="text-[9px] text-muted-foreground">Amount</span>
                              <span className="text-[9px] font-mono">{parseFloat(record.gross_amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                            </div>
                          )}
                          {record.billing_basis && (
                            <div className="flex justify-between">
                              <span className="text-[9px] text-muted-foreground">Basis</span>
                              <span className="text-[9px]">{record.billing_basis}</span>
                            </div>
                          )}
                          {actions.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-1 pt-1 border-t">
                              {actions.map((a) => (
                                <Button
                                  key={a.action}
                                  size="sm"
                                  variant={a.variant}
                                  className="h-5 text-[8px] px-1.5 py-0"
                                  onClick={() => openActionDialog(a, key, record, row.itemCode)}
                                >
                                  {a.label}
                                </Button>
                              ))}
                            </div>
                          )}
                          {projectId && record && docType && (
                            <div className="mt-1 pt-1 border-t">
                              <EpcDocumentPanel
                                projectId={projectId}
                                docType={docType}
                                parentEntityId={record.id}
                                documentNumber={refNum}
                                parentStatus={record.status}
                                userRole={userRole}
                                compact
                              />
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
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
            <p className="text-sm text-muted-foreground mt-0.5">Full EPC pipeline: Planning through Invoice for each project item</p>
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
                    {activeProjects.map((p: any) => {
                      const count = itemCounts[p.id] || 0;
                      return (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name || p.code} — {count} item{count !== 1 ? "s" : ""}
                        </SelectItem>
                      );
                    })}
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Make / Buy</label>
                  <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="Buy">Buy</SelectItem>
                      <SelectItem value="Make">Make</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                  <Select value={layerStatusFilter} onValueChange={setLayerStatusFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="under_review">Under Review</SelectItem>
                      <SelectItem value="released">Released</SelectItem>
                      <SelectItem value="under_preparation">Under Preparation</SelectItem>
                      <SelectItem value="ready_for_dispatch">Ready for Dispatch</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="commissioned">Commissioned</SelectItem>
                      <SelectItem value="handed_over">Handed Over</SelectItem>
                      <SelectItem value="ready_for_invoice">Ready for Invoice</SelectItem>
                      <SelectItem value="issued">Issued</SelectItem>
                      <SelectItem value="partially_paid">Partially Paid</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
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
                      <SelectItem value="quality_fail">Quality Failed</SelectItem>
                      <SelectItem value="eng_warning">Engineering Warnings</SelectItem>
                      <SelectItem value="none">No Exceptions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Phase</label>
                  <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Phases</SelectItem>
                      <SelectItem value="no_planning">No Planning Yet</SelectItem>
                      <SelectItem value="no_dispatch">Not Dispatched</SelectItem>
                      <SelectItem value="dispatched">Dispatched</SelectItem>
                      <SelectItem value="commissioned">Commissioned / Handed Over</SelectItem>
                      <SelectItem value="invoiced">Invoiced</SelectItem>
                      <SelectItem value="no_invoice">No Invoice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {projectId && pipelineRows.length > 0 && (
          <div className="grid grid-cols-4 md:grid-cols-12 gap-2">
            {[
              { label: "Total", value: summaryStats.total, color: "" },
              { label: "Buy", value: summaryStats.buyCount, color: "text-blue-600" },
              { label: "Make", value: summaryStats.makeCount, color: "text-violet-600" },
              { label: "DWG Released", value: summaryStats.dwgReleasedCount, color: "text-cyan-600" },
              { label: "BOM Released", value: summaryStats.bomReleasedCount, color: "text-sky-600" },
              { label: "Eng Warnings", value: summaryStats.engWarningCount, color: "text-orange-600" },
              { label: "Inspected", value: summaryStats.completedInsp, color: "text-green-600" },
              { label: "Dispatched", value: summaryStats.dispatchedCount, color: "text-teal-600" },
              { label: "Commissioned", value: summaryStats.commissionedCount, color: "text-emerald-600" },
              { label: "Invoiced", value: summaryStats.invoicedCount, color: "text-indigo-600" },
              { label: "Paid", value: summaryStats.paidCount, color: "text-green-700" },
              { label: "Exceptions", value: summaryStats.withExceptions, color: "text-amber-600" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="shadow-sm">
                <CardContent className="pt-2 pb-1.5 px-2 text-center">
                  <div className={`text-lg font-bold ${color}`}>{value}</div>
                  <div className="text-[9px] text-muted-foreground">{label}</div>
                </CardContent>
              </Card>
            ))}
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
                <TooltipProvider>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-6 px-1"></TableHead>
                        <TableHead className="text-[10px] font-semibold min-w-[140px] sticky left-0 bg-muted/50 z-10">Item</TableHead>
                        <TableHead className="text-[10px] font-semibold text-center w-[50px]">Class</TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[80px]">
                          <div className="flex items-center justify-center gap-0.5"><PenTool className="h-3 w-3" /> DWG</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[80px]">
                          <div className="flex items-center justify-center gap-0.5"><List className="h-3 w-3" /> BOM</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><FileText className="h-3 w-3" /> Plan</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><Package className="h-3 w-3" /> Exec</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><ClipboardCheck className="h-3 w-3" /> Quality</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><ShoppingCart className="h-3 w-3" /> Prep</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><Eye className="h-3 w-3" /> Inspect</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><Truck className="h-3 w-3" /> Dispatch</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><Wrench className="h-3 w-3" /> Comm</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><Receipt className="h-3 w-3" /> Billing</div>
                        </TableHead>
                        <TableHead className="text-[10px] font-semibold text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-0.5"><DollarSign className="h-3 w-3" /> Invoice</div>
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
                              <TableCell className="w-6 px-1">
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              </TableCell>
                              <TableCell className="sticky left-0 bg-background z-10">
                                <div className="space-y-0.5">
                                  <div className="text-[10px] font-medium truncate max-w-[160px]">{row.itemCode}</div>
                                  <div className="text-[9px] text-muted-foreground truncate max-w-[160px]">{row.itemDesc}</div>
                                  {row.exceptions.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5">
                                      {row.exceptions.map((ex: any, i: number) => (
                                        <ExceptionBadge key={i} type={ex.type} label={ex.label} />
                                      ))}
                                    </div>
                                  )}
                                  {row.engWarnings.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5">
                                      {row.engWarnings.slice(0, 2).map((w: any, i: number) => (
                                        <Badge key={`ew-${i}`} variant="outline" className="text-[8px] px-1 py-0 bg-orange-50 text-orange-600 border-orange-200 gap-0.5">
                                          <AlertTriangle className="h-2 w-2" />
                                          {w.label.length > 20 ? w.label.substring(0, 18) + "..." : w.label}
                                        </Badge>
                                      ))}
                                      {row.engWarnings.length > 2 && (
                                        <Badge variant="outline" className="text-[8px] px-1 py-0 bg-orange-50 text-orange-600 border-orange-200">
                                          +{row.engWarnings.length - 2}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className={`text-[9px] px-1 ${row.classification === "Buy" ? "bg-blue-50 text-blue-700 border-blue-200" : row.classification === "Make" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                                  {row.classification || "—"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {renderDwgCell(row.dc, row.classification)}
                              </TableCell>
                              <TableCell className="text-center">
                                {renderBomCell(row.bom)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell("planning", row.plan, row.itemCode, row.applicability.planning.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell("execution", row.exec, row.itemCode, row.isBuy ? row.applicability.procurement_execution.applicable : row.applicability.production_execution.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell("quality", row.qp, row.itemCode, row.applicability.quality.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell(row.isBuy ? "po_preparation" : "wo_preparation", row.prep, row.itemCode, row.isBuy ? row.applicability.po_preparation.applicable : row.applicability.wo_preparation.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell("inspection", row.insp, row.itemCode, row.applicability.inspection.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderDispatchCell(row)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderLayerCell("commissioning", row.comm, row.itemCode, row.applicability.commissioning.applicable)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderFinancialCell("billing", row.bill, row.itemCode)}
                              </TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {renderFinancialCell("invoice", row.inv, row.itemCode)}
                              </TableCell>
                            </TableRow>
                            {isExpanded && renderExpandedDetails(row)}
                          </TooltipProvider>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog(prev => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actionDialog.action}</DialogTitle>
              <DialogDescription>
                {actionDialog.layer.replace(/_/g, " ")} record for: {actionDialog.itemDesc}
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

        <Dialog open={explosionDialog.open} onOpenChange={(open) => { if (!open) { setExplosionDialog({ open: false, bomHeaderId: null, bomNumber: "" }); setExplosionPreview(null); } }}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>BOM Explosion — {explosionDialog.bomNumber}</DialogTitle>
              <DialogDescription>
                Preview and confirm child planning record creation from BOM lines.
              </DialogDescription>
            </DialogHeader>
            {explosionLoading && !explosionPreview && (
              <div className="py-8 text-center">
                <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Loading explosion preview...</p>
              </div>
            )}
            {explosionPreview && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="outline" className={
                    explosionPreview.explosionState === "fully_exploded" ? "bg-green-50 text-green-700 border-green-300"
                    : explosionPreview.explosionState === "partially_exploded" ? "bg-amber-50 text-amber-700 border-amber-300"
                    : "bg-slate-50 text-slate-600 border-slate-300"
                  }>
                    {explosionPreview.explosionState.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-muted-foreground">Parent Qty: <strong>{explosionPreview.parentQuantity}</strong></span>
                  <span className="text-muted-foreground">Lines: <strong>{explosionPreview.summary.totalLines}</strong></span>
                  <span className="text-green-600">Explodable: <strong>{explosionPreview.summary.explodableLines}</strong></span>
                  <span className="text-blue-600">Existing: <strong>{explosionPreview.summary.skipExisting}</strong></span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 text-[10px]">Sel</TableHead>
                      <TableHead className="text-[10px]">#</TableHead>
                      <TableHead className="text-[10px]">Component</TableHead>
                      <TableHead className="text-[10px] text-center">Class</TableHead>
                      <TableHead className="text-[10px] text-right">Qty/Unit</TableHead>
                      <TableHead className="text-[10px] text-right">Total Qty</TableHead>
                      <TableHead className="text-[10px] text-center">Action</TableHead>
                      <TableHead className="text-[10px]">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(explosionPreview.lines || []).map((line: any) => {
                      const isSelectable = ['create', 'reuse', 'needs_review'].includes(line.action);
                      const isSelected = selectedExplosionLines.includes(line.lineId);
                      const actionColor = line.action === 'create' ? 'bg-green-50 text-green-700 border-green-300'
                        : line.action === 'reuse' ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : line.action === 'skip_existing' ? 'bg-gray-50 text-gray-500 border-gray-300'
                        : line.action === 'skipped_not_required' ? 'bg-slate-50 text-slate-400 border-slate-200'
                        : line.action === 'needs_review' ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : 'bg-red-50 text-red-700 border-red-300';
                      return (
                        <TableRow key={line.lineId} className={!isSelectable ? "opacity-60" : ""}>
                          <TableCell className="text-center">
                            {isSelectable && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedExplosionLines(prev => [...prev, line.lineId]);
                                  } else {
                                    setSelectedExplosionLines(prev => prev.filter(id => id !== line.lineId));
                                  }
                                }}
                                className="h-3 w-3"
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-[10px] font-mono">{line.lineNumber}</TableCell>
                          <TableCell>
                            <div className="text-[10px] font-medium">{line.componentItemCode}</div>
                            <div className="text-[9px] text-muted-foreground truncate max-w-[200px]">{line.componentDescription}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[8px] px-1 py-0 ${
                              line.classification === 'Buy' ? 'bg-blue-50 text-blue-700' : line.classification === 'Make' ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {line.classification || "?"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-[10px] font-mono">{line.quantityPerUnit}</TableCell>
                          <TableCell className="text-right text-[10px] font-mono font-semibold">{line.computedQuantity} {line.uom || ""}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${actionColor}`}>
                              {line.action.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[9px] text-muted-foreground max-w-[180px] truncate">{line.reason}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setExplosionDialog({ open: false, bomHeaderId: null, bomNumber: "" }); setExplosionPreview(null); }}>
                Cancel
              </Button>
              {explosionPreview && selectedExplosionLines.length > 0 && (
                <Button onClick={executeExplosion} disabled={explosionLoading}>
                  {explosionLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Confirm Explosion ({selectedExplosionLines.length} lines)
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
