import { useState, useMemo } from "react";
import { getProjectDisplayName } from "@/lib/project-utils";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, fetchWithProjectAccess } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useProjectFilter } from "@/hooks/use-project-filter";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import EpcDocumentPanel from "@/components/epc-document-panel";
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
import { Separator } from "@/components/ui/separator";
import { ProjectAccessDenied, isProjectAccessDenied } from "@/components/project-access-denied";
import { ItemCodeBadge } from "@/components/item-code-badge";
import {
  Loader2, Search, Filter, Layers, Plus, Edit, Send, CheckCircle2, ShieldCheck,
  XCircle, RotateCcw, ArrowUpDown, ChevronDown, ChevronRight,
  RefreshCw, AlertTriangle, FileText, Eye, Lock, Trash2, History,
  Zap, PackageCheck, Info, ChevronUp, SkipForward,
} from "lucide-react";

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};

function userRoleLevel(role: string): number {
  return roleHierarchy[role] ?? 5;
}

type StatusType = "draft" | "under_review" | "approved" | "released" | "locked" | "superseded" | "canceled";

const STATUS_COLORS: Record<StatusType, string> = {
  draft: "bg-slate-100 text-slate-700",
  under_review: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  released: "bg-emerald-100 text-emerald-800",
  locked: "bg-purple-100 text-purple-800",
  superseded: "bg-orange-100 text-orange-800",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<StatusType, string> = {
  draft: "Draft", under_review: "Under Review", approved: "Approved",
  released: "Released", locked: "Locked", superseded: "Superseded", cancelled: "Cancelled",
};

const BOM_TYPE_COLORS: Record<string, string> = {
  procurement: "bg-sky-100 text-sky-800",
  manufacturing: "bg-violet-100 text-violet-800",
  assembly: "bg-teal-100 text-teal-800",
};

type ActionDef = {
  key: string;
  label: string;
  icon: any;
  variant: "default" | "destructive" | "outline" | "secondary";
  minRoleLevel: number;
  statusRequired: string[];
  extraCheck?: (r: any) => boolean;
  needsNote?: boolean;
  noteLabel?: string;
  noteKey?: string;
};

const LIFECYCLE_ACTIONS: ActionDef[] = [
  { key: "submit-for-review", label: "Submit for Review", icon: Send, variant: "default", minRoleLevel: 3, statusRequired: ["draft"], needsNote: true, noteLabel: "Submission Note", noteKey: "submissionNote" },
  { key: "review", label: "Review", icon: Eye, variant: "default", minRoleLevel: 3, statusRequired: ["under_review"], needsNote: true, noteLabel: "Review Note", noteKey: "reviewNote" },
  { key: "approve", label: "Approve", icon: CheckCircle2, variant: "default", minRoleLevel: 2, statusRequired: ["under_review"], extraCheck: (r) => !!r.reviewed_by },
  { key: "release", label: "Release", icon: ShieldCheck, variant: "default", minRoleLevel: 2, statusRequired: ["approved"], needsNote: true, noteLabel: "Release Note", noteKey: "releaseNote" },
  { key: "lock", label: "Lock BOM", icon: Lock, variant: "default", minRoleLevel: 2, statusRequired: ["released"] },
  { key: "revert-to-draft", label: "Revert to Draft", icon: RotateCcw, variant: "secondary", minRoleLevel: 3, statusRequired: ["under_review"] },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 2, statusRequired: ["draft", "under_review", "approved"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason" },
];

function DetailRow({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className={`font-medium break-all ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

export default function EpcBomControlPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userRole = (user as any)?.role || "Employee";
  const userLevel = userRoleLevel(userRole);

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showAllRevisions, setShowAllRevisions] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ rec: any; action: ActionDef } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [reviewRecommendation, setReviewRecommendation] = useState("approve");
  const [supersedeDialogOpen, setSupersedeDialogOpen] = useState(false);
  const [supersedeTarget, setSupersedeTarget] = useState<any>(null);
  const [supersedeReason, setSupersedeReason] = useState("");
  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [lineEditTarget, setLineEditTarget] = useState<any>(null);
  const [explosionDialogOpen, setExplosionDialogOpen] = useState(false);
  const [explosionTarget, setExplosionTarget] = useState<any>(null);
  const [explosionPreview, setExplosionPreview] = useState<any>(null);
  const [explosionPreviewLoading, setExplosionPreviewLoading] = useState(false);
  const [selectedExplosionLineIds, setSelectedExplosionLineIds] = useState<number[]>([]);
  const [showInfoPanel, setShowInfoPanel] = useState(false);

  const [createForm, setCreateForm] = useState({ projectItemId: "", masterItemId: "", drawingControlId: "", bomType: "assembly", bomTitle: "", bomDescription: "", notes: "" });
  const [editForm, setEditForm] = useState({ bomTitle: "", bomDescription: "", notes: "" });
  const [lineForm, setLineForm] = useState({ componentItemId: "", quantityPerUnit: "1", componentSpecification: "", estimatedUnitCost: "", procurementLeadTimeDays: "", preferredVendor: "", notes: "" });

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { showAllProjects, setShowAllProjects, filteredProjects } = useProjectFilter(projects, selectedProjectId);
  const { data: bomHeaders = [], isLoading, error: recordsError } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "bom-headers"],
    queryFn: () => selectedProjectId ? fetchWithProjectAccess(`/api/projects/${selectedProjectId}/bom-headers`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const { data: projectItems = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "items"],
    queryFn: () => selectedProjectId ? fetchWithProjectAccess(`/api/projects/${selectedProjectId}/items`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const { data: masterItems = [] } = useQuery<any[]>({
    queryKey: ["/api/master-items"],
    queryFn: () => fetch("/api/master-items").then(r => r.json()),
  });

  const loadLines = (bomHeaderId: number) => {
    return fetch(`/api/bom-headers/${bomHeaderId}/lines`).then(r => r.json());
  };

  const { data: expandedLines = [], isLoading: linesLoading } = useQuery<any[]>({
    queryKey: ["/api/bom-headers", expandedRow, "lines"],
    queryFn: () => expandedRow ? loadLines(expandedRow) : Promise.resolve([]),
    enabled: !!expandedRow,
  });

  const revisionHistory = useMemo(() => {
    if (!expandedRow) return [];
    const expandedRec = bomHeaders.find((h: any) => h.id === expandedRow);
    if (!expandedRec) return [];
    return bomHeaders
      .filter((h: any) => h.bom_number === expandedRec.bom_number)
      .sort((a: any, b: any) => {
        const ra = parseInt(a.revision_code) || 0;
        const rb = parseInt(b.revision_code) || 0;
        return rb - ra;
      });
  }, [expandedRow, bomHeaders]);

  const filtered = useMemo(() => {
    let list = bomHeaders;
    if (!showAllRevisions) list = list.filter((h: any) => h.is_current);
    if (statusFilter !== "all") list = list.filter((h: any) => h.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((h: any) => h.bom_type === typeFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((h: any) =>
        (h.bom_number || "").toLowerCase().includes(s) ||
        (h.item_code || "").toLowerCase().includes(s) ||
        (h.item_description || "").toLowerCase().includes(s) ||
        (h.bom_title || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [bomHeaders, showAllRevisions, statusFilter, typeFilter, searchTerm]);

  const stats = useMemo(() => {
    const current = bomHeaders.filter((h: any) => h.is_current);
    return {
      total: current.length,
      draft: current.filter((h: any) => h.status === "draft").length,
      under_review: current.filter((h: any) => h.status === "under_review").length,
      approved: current.filter((h: any) => h.status === "approved").length,
      released: current.filter((h: any) => h.status === "released").length,
      locked: current.filter((h: any) => h.status === "locked").length,
      cancelled: current.filter((h: any) => h.status === "canceled").length,
    };
  }, [bomHeaders]);

  const lifecycleMutation = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: string; body: any }) => {
      const res = await apiRequest("POST", `/api/bom-headers/${id}/${action}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "bom-headers"] });
      setActionDialogOpen(false);
      setSupersedeDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", `/api/projects/${selectedProjectId}/bom-headers`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "BOM Created", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "bom-headers"] });
      setCreateDialogOpen(false);
      resetCreateForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const res = await apiRequest("PATCH", `/api/bom-headers/${id}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Updated", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "bom-headers"] });
      setEditDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addLineMutation = useMutation({
    mutationFn: async ({ bomHeaderId, body }: { bomHeaderId: number; body: any }) => {
      const res = await apiRequest("POST", `/api/bom-headers/${bomHeaderId}/lines`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Line Added", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/bom-headers", expandedRow, "lines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "bom-headers"] });
      setLineDialogOpen(false);
      resetLineForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editLineMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const res = await apiRequest("PATCH", `/api/bom-lines/${id}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Line Updated", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/bom-headers", expandedRow, "lines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "bom-headers"] });
      setLineDialogOpen(false);
      setLineEditTarget(null);
      resetLineForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/bom-lines/${id}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Line Deleted", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/bom-headers", expandedRow, "lines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "bom-headers"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const explodeMutation = useMutation({
    mutationFn: async ({ id, lineIds }: { id: number; lineIds: number[] }) => {
      const res = await apiRequest("POST", `/api/bom-headers/${id}/explode`, { confirm: true, lineIds });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "BOM Exploded", description: data.message || `${data.explodedCount ?? 0} lines exploded into project items.` });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "bom-headers"] });
      setExplosionDialogOpen(false);
      setExplosionPreview(null);
    },
    onError: (err: any) => {
      toast({ title: "Explosion Error", description: err.message, variant: "destructive" });
    },
  });

  async function openExplosionDialog(rec: any) {
    setExplosionTarget(rec);
    setExplosionPreview(null);
    setSelectedExplosionLineIds([]);
    setExplosionPreviewLoading(true);
    setExplosionDialogOpen(true);
    try {
      const res = await fetch(`/api/bom-headers/${rec.id}/explosion-preview`);
      const data = await res.json();
      setExplosionPreview(data);
      const explodable = (data.lines || []).filter((l: any) => l.action === "create").map((l: any) => l.bomLineId);
      setSelectedExplosionLineIds(explodable);
    } catch (e: any) {
      toast({ title: "Preview Error", description: e.message, variant: "destructive" });
      setExplosionDialogOpen(false);
    } finally {
      setExplosionPreviewLoading(false);
    }
  }

  function resetCreateForm() {
    setCreateForm({ projectItemId: "", masterItemId: "", drawingControlId: "", bomType: "assembly", bomTitle: "", bomDescription: "", notes: "" });
  }
  function resetLineForm() {
    setLineForm({ componentItemId: "", quantityPerUnit: "1", componentSpecification: "", estimatedUnitCost: "", procurementLeadTimeDays: "", preferredVendor: "", notes: "" });
  }

  function openEditDialog(rec: any) {
    setEditTarget(rec);
    setEditForm({ bomTitle: rec.bom_title || "", bomDescription: rec.bom_description || "", notes: rec.notes || "" });
    setEditDialogOpen(true);
  }

  function openActionDialog(rec: any, action: ActionDef) {
    setActionTarget({ rec, action });
    setActionNote("");
    setReviewRecommendation("approve");
    setActionDialogOpen(true);
  }

  function openLineDialog(line?: any) {
    if (line) {
      setLineEditTarget(line);
      setLineForm({
        componentItemId: String(line.component_item_id || ""),
        quantityPerUnit: String(line.quantity_per_unit || "1"),
        componentSpecification: line.component_specification || "",
        estimatedUnitCost: line.estimated_unit_cost || "",
        procurementLeadTimeDays: line.procurement_lead_time_days ? String(line.procurement_lead_time_days) : "",
        preferredVendor: line.preferred_vendor || "",
        notes: line.notes || "",
      });
    } else {
      setLineEditTarget(null);
      resetLineForm();
    }
    setLineDialogOpen(true);
  }

  function handleActionSubmit() {
    if (!actionTarget) return;
    const { rec, action } = actionTarget;
    const body: any = {};
    if (action.needsNote && action.noteKey) body[action.noteKey] = actionNote;
    if (action.key === "review") body.recommendation = reviewRecommendation;
    lifecycleMutation.mutate({ id: rec.id, action: action.key, body });
  }

  function getAvailableActions(rec: any): ActionDef[] {
    return LIFECYCLE_ACTIONS.filter((a) => {
      if (userLevel > a.minRoleLevel) return false;
      if (!a.statusRequired.includes(rec.status)) return false;
      if (a.extraCheck && !a.extraCheck(rec)) return false;
      return true;
    });
  }

  function handleCreateSubmit() {
    const body: any = {
      projectItemId: parseInt(createForm.projectItemId),
      masterItemId: parseInt(createForm.masterItemId),
      bomType: createForm.bomType,
      bomTitle: createForm.bomTitle || undefined,
      bomDescription: createForm.bomDescription || undefined,
      notes: createForm.notes || undefined,
      bomRevision: "0",
    };
    if (createForm.drawingControlId) body.drawingControlId = parseInt(createForm.drawingControlId);
    createMutation.mutate(body);
  }

  function handleEditSubmit() {
    if (!editTarget) return;
    editMutation.mutate({ id: editTarget.id, body: editForm });
  }

  function handleLineSubmit() {
    if (lineEditTarget) {
      const body: any = {
        quantityPerUnit: lineForm.quantityPerUnit,
        componentSpecification: lineForm.componentSpecification || null,
        estimatedUnitCost: lineForm.estimatedUnitCost || null,
        procurementLeadTimeDays: lineForm.procurementLeadTimeDays ? parseInt(lineForm.procurementLeadTimeDays) : null,
        preferredVendor: lineForm.preferredVendor || null,
        notes: lineForm.notes || null,
      };
      editLineMutation.mutate({ id: lineEditTarget.id, body });
    } else {
      if (!expandedRow || !lineForm.componentItemId) return;
      const body: any = {
        componentItemId: parseInt(lineForm.componentItemId),
        quantityPerUnit: lineForm.quantityPerUnit,
        componentSpecification: lineForm.componentSpecification || undefined,
        estimatedUnitCost: lineForm.estimatedUnitCost || undefined,
        procurementLeadTimeDays: lineForm.procurementLeadTimeDays ? parseInt(lineForm.procurementLeadTimeDays) : undefined,
        preferredVendor: lineForm.preferredVendor || undefined,
        notes: lineForm.notes || undefined,
      };
      addLineMutation.mutate({ bomHeaderId: expandedRow, body });
    }
  }

  function handleSupersedeSubmit() {
    if (!supersedeTarget || !supersedeReason.trim()) return;
    lifecycleMutation.mutate({
      id: supersedeTarget.id,
      action: "supersede",
      body: { supersessionReason: supersedeReason },
    });
  }

  const formatDate = (d: string | null) => fmtDate(d);
  const formatDateTime = (d: string | null) => fmtDateTime(d);

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => window.history.back()}>
            ← Back
          </Button>
          <Layers className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">EPC BOM Control</h1>
          <Badge variant="outline" className="text-[9px] h-4">Bill of Materials Management</Badge>
          <Button variant="ghost" size="sm" className="h-6 px-1.5 ml-auto" onClick={() => setShowInfoPanel(v => !v)}>
            <Info className="h-3.5 w-3.5 mr-1" />
            <span className="text-[10px]">How it works</span>
            {showInfoPanel ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
        </div>

        {showInfoPanel && (
          <Card className="shadow-sm border-blue-200 bg-blue-50/50">
            <CardContent className="p-3 space-y-2">
              <div className="text-[11px] font-semibold text-blue-800">How EPC Project BOM is Managed</div>
              <p className="text-[10px] text-blue-700 leading-relaxed">
                Each project item that is manufactured or assembled gets its own Bill of Materials (BOM). The BOM lists every
                component required, with quantities, specifications, and procurement details. BOM management follows a strict
                lifecycle to ensure engineering accuracy before any procurement or production begins.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-blue-800">Lifecycle Stages</div>
                  {[
                    ["Draft", "BOM is being built. Lines can be added, edited, or deleted. Needs at least one line to proceed."],
                    ["Under Review", "Submitted for technical review. Submitter cannot self-review. A review task is auto-assigned."],
                    ["Approved", "Senior Manager has approved. BOM is ready to be Released."],
                    ["Released", "BOM is active. BOM Explosion can now push component lines into project items and planning records."],
                    ["Locked", "Fully frozen. No further changes. Explosion still allowed if not yet done."],
                    ["Superseded", "Replaced by a newer revision. Old revision preserved for audit. Reconciliation runs automatically."],
                  ].map(([stage, desc]) => (
                    <div key={stage} className="flex gap-1.5 text-[10px]">
                      <span className="font-medium w-24 shrink-0 text-blue-800">{stage}</span>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-blue-800">BOM Explosion</div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Once a BOM reaches <strong>Released</strong> or <strong>Locked</strong> status, you can run <strong>BOM Explosion</strong>.
                    This converts each BOM line into a child project item under the parent assembly, and automatically creates
                    planning records for procurement or manufacturing. Components already exploded are skipped to prevent duplicates.
                    Components marked "Not Required" (e.g. standard hardware not tracked individually) are also skipped.
                  </p>
                  <div className="text-[10px] font-semibold text-blue-800 mt-1.5">Supersession & Reconciliation</div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    When a BOM is superseded, the system automatically compares old and new lines. Removed components with no
                    downstream POs/WOs get their planning records cancelled. Changed quantities update project item quantities.
                    Any changes with active downstream records trigger review tasks for the project team.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[600px]">
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Project</label>
            <Select value={selectedProjectId ? String(selectedProjectId) : ""} onValueChange={(v) => { setSelectedProjectId(parseInt(v)); setExpandedRow(null); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select Project" /></SelectTrigger>
              <SelectContent>
                {filteredProjects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)} className="text-xs">{getProjectDisplayName(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 self-end pb-1">
            <Checkbox id="showAllProjects" checked={showAllProjects} onCheckedChange={(v) => setShowAllProjects(!!v)} className="h-3.5 w-3.5" />
            <label htmlFor="showAllProjects" className="text-[10px] text-muted-foreground cursor-pointer select-none">Show All</label>
          </div>

          <div className="relative w-[350px]">
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Search</label>
            <Search className="absolute left-2 top-[26px] h-3 w-3 text-muted-foreground" />
            <Input className="pl-7 h-8 text-xs" placeholder="Search BOM#, item..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Types</SelectItem>
              <SelectItem value="procurement" className="text-xs">Procurement</SelectItem>
              <SelectItem value="manufacturing" className="text-xs">Manufacturing</SelectItem>
              <SelectItem value="assembly" className="text-xs">Assembly</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 ml-2">
            <Switch id="allRevsBom" checked={showAllRevisions} onCheckedChange={setShowAllRevisions} className="scale-75" />
            <Label htmlFor="allRevsBom" className="text-[10px] text-muted-foreground cursor-pointer">All Revisions</Label>
          </div>

          {userLevel <= 3 && selectedProjectId && (
            <div className="ml-auto">
              <Button size="sm" className="h-8 text-xs" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New BOM
              </Button>
            </div>
          )}
        </div>

        {selectedProjectId && (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {([
              ["Total", stats.total, "bg-slate-50"],
              ["Draft", stats.draft, "bg-slate-50"],
              ["Under Review", stats.under_review, "bg-amber-50"],
              ["Approved", stats.approved, "bg-blue-50"],
              ["Released", stats.released, "bg-emerald-50"],
              ["Locked", stats.locked, "bg-purple-50"],
              ["Cancelled", stats.cancelled, "bg-red-50"],
            ] as [string, number, string][]).map(([label, count, bg]) => (
              <Card key={label} className={`${bg} shadow-sm`}>
                <CardContent className="p-2 text-center">
                  <div className="text-lg font-bold">{count}</div>
                  <div className="text-[9px] text-muted-foreground">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!selectedProjectId ? (
          <Card className="shadow-sm"><CardContent className="p-8 text-center text-muted-foreground text-sm">Select a project to view its BOM controls.</CardContent></Card>
        ) : isProjectAccessDenied(recordsError) ? (
          <ProjectAccessDenied />
        ) : isLoading ? (
          <Card className="shadow-sm"><CardContent className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>
        ) : (
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px]">
                    <TableHead className="w-6"></TableHead>
                    <TableHead className="text-[10px]">BOM #</TableHead>
                    <TableHead className="text-[10px]">Rev</TableHead>
                    <TableHead className="text-[10px]">Type</TableHead>
                    <TableHead className="text-[10px]">Item Code</TableHead>
                    <TableHead className="text-[10px]">Title</TableHead>
                    <TableHead className="text-[10px] text-center">Lines</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                    <TableHead className="text-[10px]">Current</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">No BOM records found.</TableCell></TableRow>
                  ) : filtered.map((rec: any) => (
                    <>
                      <TableRow key={rec.id} className="cursor-pointer hover:bg-muted/50 text-[10px]" onClick={() => setExpandedRow(expandedRow === rec.id ? null : rec.id)}>
                        <TableCell className="w-6 px-2">
                          {expandedRow === rec.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] font-medium">{rec.bom_number}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[9px] h-4 font-mono">
                            Rev {rec.bom_revision || rec.revision_code}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[8px] h-4 ${BOM_TYPE_COLORS[rec.bom_type] || "bg-gray-100"}`}>{rec.bom_type}</Badge>
                        </TableCell>
                        <TableCell><ItemCodeBadge code={rec.item_code} prop1Label={rec.item_property_1_label} /></TableCell>
                        <TableCell className="text-[10px] max-w-[200px] truncate text-blue-600 font-medium">{rec.bom_title || rec.item_description || "—"}</TableCell>
                        <TableCell className="text-center text-[10px]">{rec.total_line_count || 0}</TableCell>
                        <TableCell>
                          <Badge className={`text-[8px] h-4 ${STATUS_COLORS[rec.status as StatusType] || ""}`}>
                            {STATUS_LABELS[rec.status as StatusType] || rec.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {rec.is_current ? (
                            <Badge className="text-[8px] h-4 bg-green-100 text-green-800">Active</Badge>
                          ) : (
                            <span className="text-[9px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>

                      {expandedRow === rec.id && (
                        <TableRow key={`${rec.id}-detail`}>
                          <TableCell colSpan={9} className="p-2 bg-muted/30">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                              <Card className="shadow-sm">
                                <CardHeader className="py-2 px-3">
                                  <CardTitle className="text-[11px] font-medium flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5" /> Details
                                    {rec.status === "draft" && userLevel <= 3 && (
                                      <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[8px] ml-auto" onClick={(e) => { e.stopPropagation(); openEditDialog(rec); }}>
                                        <Edit className="h-2.5 w-2.5 mr-0.5" /> Edit
                                      </Button>
                                    )}
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-2 space-y-1">
                                  <DetailRow label="BOM #" value={rec.bom_number} mono />
                                  <DetailRow label="Revision" value={`Rev ${rec.bom_revision || rec.revision_code}`} mono />
                                  <DetailRow label="Type" value={rec.bom_type} />
                                  <DetailRow label="Item Code" value={<ItemCodeBadge code={rec.item_code} prop1Label={rec.item_property_1_label} />} />
                                  <DetailRow label="Item Description" value={<span className="text-blue-600">{rec.item_description}</span>} />
                                  <DetailRow label="Classification" value={rec.classification_snapshot} />
                                  <DetailRow label="Drawing #" value={rec.drawing_number} mono />
                                  <DetailRow label="Drawing Rev" value={rec.drawing_revision} />
                                  <DetailRow label="Title" value={rec.bom_title} />
                                  <DetailRow label="Description" value={rec.bom_description} />
                                  <DetailRow label="Lines" value={rec.total_line_count} />
                                  {rec.total_estimated_cost && <DetailRow label="Est. Cost" value={`₹ ${parseFloat(rec.total_estimated_cost).toLocaleString("en-IN")}`} />}
                                  <Separator className="my-1" />
                                  <DetailRow label="Created" value={`${rec.created_by_name || "—"} on ${formatDateTime(rec.created_at)}`} />
                                  {rec.submitted_at && <DetailRow label="Submitted" value={`${rec.submitted_by_name || "—"} on ${formatDateTime(rec.submitted_at)}`} />}
                                  {rec.reviewed_at && <DetailRow label="Reviewed" value={`${rec.reviewed_by_name || "—"} on ${formatDateTime(rec.reviewed_at)} (${rec.review_recommendation})`} />}
                                  {rec.approved_at && <DetailRow label="Approved" value={`${rec.approved_by_name || "—"} on ${formatDateTime(rec.approved_at)}`} />}
                                  {rec.released_at && <DetailRow label="Released" value={`${rec.released_by_name || "—"} on ${formatDateTime(rec.released_at)}`} />}
                                  {rec.notes && <DetailRow label="Notes" value={rec.notes} />}
                                </CardContent>
                              </Card>

                              <Card className="shadow-sm">
                                <CardHeader className="py-2 px-3">
                                  <CardTitle className="text-[11px] font-medium flex items-center gap-1.5">
                                    <Layers className="h-3.5 w-3.5" /> Actions
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {getAvailableActions(rec).map((action) => (
                                      <Button
                                        key={action.key}
                                        size="sm"
                                        variant={action.variant as any}
                                        className="h-6 text-[9px] px-2"
                                        onClick={(e) => { e.stopPropagation(); openActionDialog(rec, action); }}
                                      >
                                        <action.icon className="h-3 w-3 mr-1" />
                                        {action.label}
                                      </Button>
                                    ))}
                                    {getAvailableActions(rec).length === 0 && (
                                      <span className="text-[10px] text-muted-foreground">No actions available for current status/role.</span>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>

                              <Card className="shadow-sm lg:col-span-2">
                                <CardHeader className="py-2 px-3">
                                  <CardTitle className="text-[11px] font-medium flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5" /> BOM Lines ({expandedLines.length})
                                    {rec.status === "draft" && userLevel <= 3 && (
                                      <Button size="sm" variant="outline" className="h-5 px-1.5 text-[8px] ml-auto" onClick={(e) => { e.stopPropagation(); openLineDialog(); }}>
                                        <Plus className="h-2.5 w-2.5 mr-0.5" /> Add Line
                                      </Button>
                                    )}
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-2">
                                  {linesLoading ? (
                                    <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                                  ) : expandedLines.length === 0 ? (
                                    <div className="text-center text-[10px] text-muted-foreground py-4">No BOM lines yet.</div>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <Table>
                                        <TableHeader>
                                          <TableRow className="text-[9px]">
                                            <TableHead className="text-[9px] w-8">#</TableHead>
                                            <TableHead className="text-[9px]">Item Code</TableHead>
                                            <TableHead className="text-[9px]">Description</TableHead>
                                            <TableHead className="text-[9px]">Make/Buy</TableHead>
                                            <TableHead className="text-[9px] text-right">Qty</TableHead>
                                            <TableHead className="text-[9px]">UOM</TableHead>
                                            <TableHead className="text-[9px]">Remarks</TableHead>
                                            {rec.status === "draft" && userLevel <= 3 && <TableHead className="text-[9px] w-16">Actions</TableHead>}
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {expandedLines.map((line: any) => (
                                            <TableRow key={line.id} className="text-[10px]">
                                              <TableCell className="text-[10px]">{line.line_number}</TableCell>
                                              <TableCell className="font-mono text-[10px]">{line.component_item_code || "—"}</TableCell>
                                              <TableCell className="text-[10px] max-w-[200px] truncate">{line.component_description || "—"}</TableCell>
                                              <TableCell>
                                                <Badge variant="outline" className="text-[8px] h-4">{line.component_make_or_buy || "—"}</Badge>
                                              </TableCell>
                                              <TableCell className="text-right font-mono text-[10px]">{line.quantity_per_unit}</TableCell>
                                              <TableCell className="text-[10px]">{line.component_uom || "—"}</TableCell>
                                              <TableCell className="text-[10px] max-w-[150px] truncate">{line.notes || line.component_specification || "—"}</TableCell>
                                              {rec.status === "draft" && userLevel <= 3 && (
                                                <TableCell>
                                                  <div className="flex gap-1">
                                                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={(e) => { e.stopPropagation(); openLineDialog(line); }}>
                                                      <Edit className="h-2.5 w-2.5" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-500" onClick={(e) => { e.stopPropagation(); deleteLineMutation.mutate(line.id); }}>
                                                      <Trash2 className="h-2.5 w-2.5" />
                                                    </Button>
                                                  </div>
                                                </TableCell>
                                              )}
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>

                              {["released", "locked"].includes(rec.status) && (
                                <Card className="shadow-sm lg:col-span-2 border-amber-200">
                                  <CardHeader className="py-2 px-3">
                                    <CardTitle className="text-[11px] font-medium flex items-center gap-1.5">
                                      <Zap className="h-3.5 w-3.5 text-amber-600" />
                                      <span className="text-amber-800">BOM Explosion</span>
                                      {rec.explosion_state === "fully_exploded" && (
                                        <Badge className="text-[8px] h-4 bg-emerald-100 text-emerald-800 ml-1"><PackageCheck className="h-2.5 w-2.5 mr-0.5 inline" />Fully Exploded</Badge>
                                      )}
                                      {rec.explosion_state === "partially_exploded" && (
                                        <Badge className="text-[8px] h-4 bg-amber-100 text-amber-800 ml-1">Partially Exploded</Badge>
                                      )}
                                      {(!rec.explosion_state || rec.explosion_state === "not_exploded") && (
                                        <Badge className="text-[8px] h-4 bg-slate-100 text-slate-600 ml-1">Not Exploded</Badge>
                                      )}
                                      <Button
                                        size="sm"
                                        className="h-5 px-2 text-[9px] ml-auto bg-amber-600 hover:bg-amber-700 text-white"
                                        onClick={(e) => { e.stopPropagation(); openExplosionDialog(rec); }}
                                      >
                                        <Zap className="h-2.5 w-2.5 mr-0.5" />
                                        {rec.explosion_state === "fully_exploded" ? "Re-check Explosion" : "Explode BOM"}
                                      </Button>
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="px-3 pb-2">
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                      BOM Explosion converts each BOM line into a child project item and generates planning records for
                                      procurement or manufacturing. Components already exploded are skipped automatically.
                                      Run explosion after the BOM is confirmed correct.
                                    </p>
                                  </CardContent>
                                </Card>
                              )}

                              <Card className="shadow-sm lg:col-span-2">
                                <CardHeader className="py-2 px-3">
                                  <CardTitle className="text-[11px] font-medium flex items-center gap-1.5">
                                    <History className="h-3.5 w-3.5" /> Revision History
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-2">
                                  {revisionHistory.length <= 1 ? (
                                    <div className="text-center text-[10px] text-muted-foreground py-2">No prior revisions.</div>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {revisionHistory.map((rev: any) => (
                                        <div key={rev.id} className={`flex items-center gap-2 p-1.5 rounded text-[10px] ${rev.id === rec.id ? "bg-primary/10 border border-primary/20" : "bg-muted/50"}`}>
                                          <Badge variant="outline" className="text-[9px] h-4 font-mono shrink-0">
                                            Rev {rev.bom_revision || rev.revision_code}
                                          </Badge>
                                          {rev.is_current && <Badge className="text-[8px] h-4 bg-green-100 text-green-800 shrink-0">Active</Badge>}
                                          <Badge className={`text-[8px] h-4 shrink-0 ${STATUS_COLORS[rev.status as StatusType] || ""}`}>
                                            {STATUS_LABELS[rev.status as StatusType] || rev.status}
                                          </Badge>
                                          <span className="text-muted-foreground truncate">{rev.bom_title || rev.item_description || ""}</span>
                                          <span className="text-muted-foreground ml-auto shrink-0">{formatDate(rev.created_at)}</span>
                                          {rev.supersession_reason && (
                                            <span className="text-orange-600 text-[9px] truncate max-w-[200px]" title={rev.supersession_reason}>
                                              Reason: {rev.supersession_reason}
                                            </span>
                                          )}
                                          {rev.is_current && userLevel <= 2 && !["superseded", "canceled"].includes(rev.status) && rev.id === rec.id && (
                                            <Button
                                              size="sm"
                                              variant="destructive"
                                              className="h-5 px-1.5 text-[8px] shrink-0"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSupersedeTarget(rev);
                                                setSupersedeReason("");
                                                setSupersedeDialogOpen(true);
                                              }}
                                            >
                                              <ArrowUpDown className="h-2.5 w-2.5 mr-0.5" /> Supersede
                                            </Button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>

                              <div className="lg:col-span-2">
                                <EpcDocumentPanel
                                  documentNumber={rec.bom_number}
                                  revisionCode={rec.revision_code}
                                  isCurrent={rec.is_current}
                                  projectId={rec.project_id}
                                  entityType="bom_header"
                                  recordId={rec.id}
                                  docType="BOM"
                                  userRole={userRole}
                                  compact={false}
                                />
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm">Create New BOM</DialogTitle>
              <DialogDescription className="text-xs">Create a Bill of Materials for a project item. Drawing link is optional.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Project Item *</Label>
                <Select
                  value={createForm.projectItemId}
                  onValueChange={(v) => {
                    const pi = projectItems.find((p: any) => String(p.id) === v);
                    setCreateForm({ ...createForm, projectItemId: v, masterItemId: pi?.item_id ? String(pi.item_id) : createForm.masterItemId });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select item" /></SelectTrigger>
                  <SelectContent>
                    {projectItems.map((pi: any) => (
                      <SelectItem key={pi.id} value={String(pi.id)} className="text-xs">
                        {pi.item_code || `Item #${pi.id}`} — {pi.description || pi.item_description || "No description"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {createForm.masterItemId ? (
                <div className="flex items-center gap-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-[10px]">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700">
                    Master item auto-linked from project item:{" "}
                    <span className="font-mono font-medium">
                      {masterItems.find((m: any) => String(m.id) === createForm.masterItemId)?.item_code || `#${createForm.masterItemId}`}
                    </span>
                  </span>
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Master Item * <span className="text-muted-foreground">(select project item above to auto-fill)</span></Label>
                  <Select value={createForm.masterItemId} onValueChange={(v) => setCreateForm({ ...createForm, masterItemId: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select master item" /></SelectTrigger>
                    <SelectContent>
                      {masterItems.map((mi: any) => (
                        <SelectItem key={mi.id} value={String(mi.id)} className="text-xs">
                          {mi.item_code} — {mi.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs">BOM Type</Label>
                <Select value={createForm.bomType} onValueChange={(v) => setCreateForm({ ...createForm, bomType: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assembly" className="text-xs">Assembly</SelectItem>
                    <SelectItem value="procurement" className="text-xs">Procurement</SelectItem>
                    <SelectItem value="manufacturing" className="text-xs">Manufacturing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">BOM Title</Label>
                <Input className="h-8 text-xs" value={createForm.bomTitle} onChange={(e) => setCreateForm({ ...createForm, bomTitle: e.target.value })} placeholder="Optional title" />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea className="text-xs min-h-[40px]" value={createForm.bomDescription} onChange={(e) => setCreateForm({ ...createForm, bomDescription: e.target.value })} placeholder="Optional description" />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea className="text-xs min-h-[40px]" value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} placeholder="Optional notes" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreateSubmit} disabled={!createForm.projectItemId || !createForm.masterItemId || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Create BOM
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">Edit BOM — {editTarget?.bom_number}</DialogTitle>
              <DialogDescription className="text-xs">Edit title, description, and notes (draft only).</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">BOM Title</Label>
                <Input className="h-8 text-xs" value={editForm.bomTitle} onChange={(e) => setEditForm({ ...editForm, bomTitle: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea className="text-xs min-h-[40px]" value={editForm.bomDescription} onChange={(e) => setEditForm({ ...editForm, bomDescription: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea className="text-xs min-h-[40px]" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleEditSubmit} disabled={editMutation.isPending}>
                {editMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">{actionTarget?.action.label} — {actionTarget?.rec.bom_number}</DialogTitle>
              <DialogDescription className="text-xs">
                {actionTarget?.action.key === "review" ? "Provide your review recommendation." :
                 actionTarget?.action.key === "lock" ? "Lock this BOM to prevent further changes." :
                 `Proceed with ${actionTarget?.action.label.toLowerCase()}?`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {actionTarget?.action.key === "review" && (
                <div>
                  <Label className="text-xs">Recommendation *</Label>
                  <Select value={reviewRecommendation} onValueChange={setReviewRecommendation}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approve" className="text-xs">Approve</SelectItem>
                      <SelectItem value="approve_with_comments" className="text-xs">Approve with Comments</SelectItem>
                      <SelectItem value="reject" className="text-xs">Reject</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {actionTarget?.action.needsNote && (
                <div>
                  <Label className="text-xs">{actionTarget.action.noteLabel}</Label>
                  <Textarea className="text-xs min-h-[60px]" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder={`Enter ${actionTarget.action.noteLabel?.toLowerCase()}...`} />
                </div>
              )}
              {actionTarget?.action.key === "lock" && (
                <div className="flex items-center gap-2 p-2 rounded bg-purple-50 text-purple-800 text-[10px]">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Locking this BOM makes it permanently read-only. To make changes, you'll need to create a new revision (Supersede).</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                variant={actionTarget?.action.variant as any}
                onClick={handleActionSubmit}
                disabled={lifecycleMutation.isPending}
              >
                {lifecycleMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                {actionTarget?.action.label}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={supersedeDialogOpen} onOpenChange={setSupersedeDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">Supersede BOM — {supersedeTarget?.bom_number} Rev {supersedeTarget?.bom_revision || supersedeTarget?.revision_code}</DialogTitle>
              <DialogDescription className="text-xs">This will mark the current revision as superseded and create a new draft revision. All lines will be copied to the new revision.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 rounded bg-orange-50 text-orange-800 text-[10px]">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>The current revision will become immutable. A new Rev {supersedeTarget ? parseInt(supersedeTarget.bom_revision || "0") + 1 : "?"} will be created in Draft status.</span>
              </div>
              <div>
                <Label className="text-xs">Revision Reason *</Label>
                <Textarea className="text-xs min-h-[60px]" value={supersedeReason} onChange={(e) => setSupersedeReason(e.target.value)} placeholder="Why is this revision being superseded?" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSupersedeDialogOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleSupersedeSubmit}
                disabled={!supersedeReason.trim() || lifecycleMutation.isPending}
              >
                {lifecycleMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Supersede & Create New Rev
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={explosionDialogOpen} onOpenChange={(o) => { if (!o) { setExplosionDialogOpen(false); setExplosionPreview(null); } }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-600" />
                BOM Explosion — {explosionTarget?.bom_number}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Preview which BOM lines will be converted into project items and planning records.
                Select the lines to explode and confirm.
              </DialogDescription>
            </DialogHeader>

            {explosionPreviewLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div>
            ) : explosionPreview ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ["Total Lines", explosionPreview.summary?.totalLines ?? 0, "bg-slate-50"],
                    ["To Explode", explosionPreview.summary?.explodableLines ?? 0, "bg-amber-50"],
                    ["Already Done", explosionPreview.summary?.skipExisting ?? 0, "bg-emerald-50"],
                    ["Skipped", explosionPreview.summary?.skippedNotRequired ?? 0, "bg-gray-50"],
                  ].map(([label, count, bg]) => (
                    <div key={label as string} className={`${bg} rounded p-2 text-center`}>
                      <div className="text-sm font-bold">{count as number}</div>
                      <div className="text-[9px] text-muted-foreground">{label as string}</div>
                    </div>
                  ))}
                </div>

                {explosionPreview.summary?.explodableLines === 0 && (
                  <div className="flex items-center gap-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-700">
                    <PackageCheck className="h-3.5 w-3.5 shrink-0" />
                    All explodable lines have already been processed. Nothing new to explode.
                  </div>
                )}

                <div className="overflow-x-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-[9px]">
                        <TableHead className="w-8 text-[9px]">
                          <Checkbox
                            checked={selectedExplosionLineIds.length > 0 && selectedExplosionLineIds.length === (explosionPreview.lines || []).filter((l: any) => l.action === "create").length}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedExplosionLineIds((explosionPreview.lines || []).filter((l: any) => l.action === "create").map((l: any) => l.bomLineId));
                              } else {
                                setSelectedExplosionLineIds([]);
                              }
                            }}
                            className="h-3 w-3"
                          />
                        </TableHead>
                        <TableHead className="text-[9px]">Item Code</TableHead>
                        <TableHead className="text-[9px]">Description</TableHead>
                        <TableHead className="text-[9px]">Make/Buy</TableHead>
                        <TableHead className="text-[9px] text-right">Qty/Unit</TableHead>
                        <TableHead className="text-[9px] text-right">Total Qty</TableHead>
                        <TableHead className="text-[9px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(explosionPreview.lines || []).map((line: any) => {
                        const isExplodable = line.action === "create";
                        const isChecked = selectedExplosionLineIds.includes(line.bomLineId);
                        return (
                          <TableRow key={line.bomLineId} className={`text-[10px] ${!isExplodable ? "opacity-50" : ""}`}>
                            <TableCell className="w-8">
                              {isExplodable ? (
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={(checked) => {
                                    setSelectedExplosionLineIds(prev =>
                                      checked ? [...prev, line.bomLineId] : prev.filter(id => id !== line.bomLineId)
                                    );
                                  }}
                                  className="h-3 w-3"
                                />
                              ) : null}
                            </TableCell>
                            <TableCell className="font-mono text-[10px]">{line.componentItemCode || "—"}</TableCell>
                            <TableCell className="text-[10px] max-w-[200px] truncate">{line.componentDescription || "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[8px] h-4">{line.makeOrBuy || "—"}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-[10px]">{line.quantityPerUnit}</TableCell>
                            <TableCell className="text-right font-mono text-[10px] font-medium">{line.computedQuantity}</TableCell>
                            <TableCell>
                              {line.action === "create" && (
                                <Badge className="text-[8px] h-4 bg-amber-100 text-amber-800">Will Create</Badge>
                              )}
                              {line.action === "skip_existing" && (
                                <Badge className="text-[8px] h-4 bg-emerald-100 text-emerald-800"><PackageCheck className="h-2.5 w-2.5 mr-0.5 inline" />Already Done</Badge>
                              )}
                              {line.action === "skipped_not_required" && (
                                <Badge className="text-[8px] h-4 bg-slate-100 text-slate-600"><SkipForward className="h-2.5 w-2.5 mr-0.5 inline" />Not Required</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {explosionPreview.summary?.explodableLines > 0 && (
                  <div className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      This will create <strong>{selectedExplosionLineIds.length}</strong> child project item(s) under <strong>{explosionTarget?.item_code || explosionTarget?.bom_number}</strong> and
                      generate planning records for each. Existing items will not be duplicated.
                    </span>
                  </div>
                )}
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { setExplosionDialogOpen(false); setExplosionPreview(null); }}>Close</Button>
              {explosionPreview?.summary?.explodableLines > 0 && (
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={selectedExplosionLineIds.length === 0 || explodeMutation.isPending}
                  onClick={() => explosionTarget && explodeMutation.mutate({ id: explosionTarget.id, lineIds: selectedExplosionLineIds })}
                >
                  {explodeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                  Explode {selectedExplosionLineIds.length} Line{selectedExplosionLineIds.length !== 1 ? "s" : ""}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={lineDialogOpen} onOpenChange={setLineDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm">{lineEditTarget ? "Edit BOM Line" : "Add BOM Line"}</DialogTitle>
              <DialogDescription className="text-xs">
                {lineEditTarget ? "Update line details." : "Add a component to this BOM."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {!lineEditTarget && (
                <div>
                  <Label className="text-xs">Component Item *</Label>
                  <Select value={lineForm.componentItemId} onValueChange={(v) => setLineForm({ ...lineForm, componentItemId: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select component" /></SelectTrigger>
                    <SelectContent>
                      {masterItems.map((mi: any) => (
                        <SelectItem key={mi.id} value={String(mi.id)} className="text-xs">
                          {mi.item_code} — {mi.description} ({mi.make_or_buy || "?"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Quantity per Unit *</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" min="0" value={lineForm.quantityPerUnit} onChange={(e) => setLineForm({ ...lineForm, quantityPerUnit: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Specification</Label>
                  <Input className="h-8 text-xs" value={lineForm.componentSpecification} onChange={(e) => setLineForm({ ...lineForm, componentSpecification: e.target.value })} placeholder="Optional spec" />
                </div>
              </div>
              <Separator />
              <div className="text-[10px] text-muted-foreground font-medium">Optional Fields</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Est. Unit Cost (₹)</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" min="0" value={lineForm.estimatedUnitCost} onChange={(e) => setLineForm({ ...lineForm, estimatedUnitCost: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Lead Time (days)</Label>
                  <Input className="h-8 text-xs" type="number" min="0" value={lineForm.procurementLeadTimeDays} onChange={(e) => setLineForm({ ...lineForm, procurementLeadTimeDays: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Preferred Vendor</Label>
                <Input className="h-8 text-xs" value={lineForm.preferredVendor} onChange={(e) => setLineForm({ ...lineForm, preferredVendor: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Remarks</Label>
                <Textarea className="text-xs min-h-[40px]" value={lineForm.notes} onChange={(e) => setLineForm({ ...lineForm, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setLineDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleLineSubmit} disabled={addLineMutation.isPending || editLineMutation.isPending || (!lineEditTarget && !lineForm.componentItemId)}>
                {(addLineMutation.isPending || editLineMutation.isPending) ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                {lineEditTarget ? "Save Changes" : "Add Line"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
