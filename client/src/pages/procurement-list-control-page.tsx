import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { fmtDate } from "@/lib/date-format";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ClipboardList, Package, AlertTriangle, CheckCircle2, Clock, XCircle,
  Search, RefreshCw, Plus, Filter, MoreHorizontal, Loader2,
  Truck, ArrowRightFromLine, BarChart2, CalendarDays, ShieldAlert,
  CheckCheck, Layers, TrendingDown, Download, Lock, Unlock,
  Database, Activity, TrendingUp, Building2, FileWarning, X,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PoGroupWizard } from "@/components/po-group-wizard";
import { PoGroupDetail } from "@/components/po-group-detail";
import { PlcLineDetailDrawer } from "@/components/plc-line-detail-drawer";
import { RfqCreateDialog } from "@/components/rfq-create-dialog";
import { VendorQuoteDialog } from "@/components/vendor-quote-dialog";
import { TbeDialog } from "@/components/tbe-dialog";
import { CbeDialog } from "@/components/cbe-dialog";
import { GrnRecordDialog } from "@/components/grn-record-dialog";
import { GrnInspectionDialog } from "@/components/grn-inspection-dialog";
import { MaterialIssueDialog } from "@/components/material-issue-dialog";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Project { id: number; code: string; name: string; status: string; }

interface PlcSummary {
  total: string; pending: string; in_progress: string; po_issued: string;
  received: string; fully_received: string; closed: string; cancelled: string;
  over_procured: string; overdue: string; avl_bypassed: string; revision_required: string;
  total_qty_required: string; total_qty_ordered: string; total_qty_received: string;
}

interface PlcLine {
  id: number; plcNumber: string; tagNo: string; serviceDescription: string;
  subgroupCode: string; subgroupLabel: string; qtyRequired: string;
  qtyOrdered: string; qtyReceived: string; qtyBalance: string;
  qtyOverProcured: string; status: string; vendorId: number | null;
  vendorName: string | null; vendorDisplayName: string | null;
  priority: string; requiredByDate: string | null; avlStatus: string;
  revisionActionRequired: string; activePoGroupId: number | null;
  activePoGroupNumber: string | null; poGroupStatus: string | null;
  activeEpcPoId: number | null; epcPoNumber: string | null;
  itemCode: string | null; itemDescription: string | null; uom: string | null;
  createdAt: string;
  buyGroupId: number | null; buyGroupLabel: string | null;
  buySubgroupId: number | null; buySubgroupLabel: string | null;
}

interface PoGroup {
  id: number; pogNumber: string; status: string; vendorId: number | null;
  vendorName: string | null; vendorDisplayName: string | null;
  totalLines: number; totalAmount: string | null; currency: string;
  submittedByName: string | null; approvedByName: string | null;
  epcPoNumber: string | null; epcPoNumberActual: string | null;
  createdAt: string; lineCount: string;
}

// ─── Status helpers ──────────────────────────────────────────────────────────

const PLC_STATUS_COLORS: Record<string, string> = {
  pr_raised:        "bg-yellow-100 text-yellow-800 border-yellow-200",
  pending_rfq:      "bg-amber-100 text-amber-800 border-amber-200",
  rfq_issued:       "bg-cyan-100 text-cyan-800 border-cyan-200",
  rfq_closed:       "bg-teal-100 text-teal-800 border-teal-200",
  tbe_in_progress:  "bg-violet-100 text-violet-800 border-violet-200",
  tbe_complete:     "bg-purple-100 text-purple-800 border-purple-200",
  cbe_in_progress:  "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  vendor_selected:  "bg-emerald-100 text-emerald-800 border-emerald-200",
  in_po_group:      "bg-blue-100 text-blue-800 border-blue-200",
  po_issued:        "bg-indigo-100 text-indigo-800 border-indigo-200",
  partial_received: "bg-orange-100 text-orange-800 border-orange-200",
  fully_received:   "bg-green-100 text-green-800 border-green-200",
  closed:           "bg-gray-100 text-gray-700 border-gray-200",
  cancelled:        "bg-red-100 text-red-700 border-red-200",
};
const PLC_STATUS_LABELS: Record<string, string> = {
  pr_raised: "PR Raised",
  pending_rfq: "Pending RFQ",
  rfq_issued: "RFQ Issued",
  rfq_closed: "RFQ Closed",
  tbe_in_progress: "TBE In Progress",
  tbe_complete: "TBE Complete",
  cbe_in_progress: "CBE In Progress",
  vendor_selected: "Vendor Selected",
  in_po_group: "In PO Group", po_issued: "PO Issued",
  partial_received: "Partial Rcvd", fully_received: "Fully Rcvd",
  closed: "Closed", cancelled: "Cancelled",
};
const POG_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700", submitted: "bg-yellow-100 text-yellow-800",
  approved: "bg-emerald-100 text-emerald-800", po_issued: "bg-indigo-100 text-indigo-800",
  rejected: "bg-red-100 text-red-700", cancelled: "bg-gray-100 text-gray-600",
};
const PRIORITY_COLORS: Record<string, string> = {
  standard: "bg-gray-100 text-gray-600",
  expedite: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};

function StatusBadge({ status, map, labelMap }: { status: string; map: Record<string, string>; labelMap?: Record<string, string> }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {labelMap?.[status] ?? status}
    </span>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
          <Icon className={`h-8 w-8 opacity-20 ${color}`} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ProcurementListControlPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<number | "all">("all");
  const [subgroupFilter, setSubgroupFilter] = useState<number | "all">("all");
  const [activeTab, setActiveTab] = useState("lines");
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [selectedPogId, setSelectedPogId] = useState<number | null>(null);
  const [showPogWizard, setShowPogWizard] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<number[]>([]);

  // Phase 3 GRN state
  const [showGrnDialog, setShowGrnDialog] = useState(false);
  const [showInspDialog, setShowInspDialog] = useState(false);
  const [showMirDialog, setShowMirDialog] = useState(false);
  const [selectedGrn, setSelectedGrn] = useState<any>(null);
  const [grnLineFilter, setGrnLineFilter] = useState<string>("all");
  const [grnStatusFilter, setGrnStatusFilter] = useState<string>("all");
  const [mirPlcLine, setMirPlcLine] = useState<any>(null);

  // Phase 4 SAP + governance state
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [reconcilePoId, setReconcilePoId] = useState<number | null>(null);
  const [reconcileResult, setReconcileResult] = useState<any>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [showLineCloseConfirm, setShowLineCloseConfirm] = useState(false);
  const [lineCloseTarget, setLineCloseTarget] = useState<any>(null);

  // Phase 2 RFQ state
  const [showRfqCreate, setShowRfqCreate] = useState(false);
  const [selectedRfqId, setSelectedRfqId] = useState<number | null>(null);
  const [addVendorId, setAddVendorId] = useState<string>("");
  const [addLineId, setAddLineId] = useState<string>("");
  const [rfqStatusFilter, setRfqStatusFilter] = useState("all");
  const [showVendorQuote, setShowVendorQuote] = useState(false);
  const [editingQuote, setEditingQuote] = useState<any>(null);
  const [showTbe, setShowTbe] = useState(false);
  const [editingTbe, setEditingTbe] = useState<any>(null);
  const [showCbe, setShowCbe] = useState(false);
  const [editingCbe, setEditingCbe] = useState<any>(null);

  // Projects list
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    select: (data) => (data as Project[]).filter((p) => !["Cancelled", "Closed", "Archived"].includes(p.status)),
  });

  // Buy groups (for Group filter dropdown)
  const { data: buyGroups = [] } = useQuery<{ id: number; label: string; code: string }[]>({
    queryKey: ["/api/buy-groups"],
    queryFn: () => apiRequest("GET", "/api/buy-groups"),
  });

  // Summary strip
  const { data: summary, isLoading: summaryLoading } = useQuery<PlcSummary>({
    queryKey: ["/api/projects", selectedProjectId, "procurement-list", "summary"],
    queryFn: () => apiRequest("GET", `/api/projects/${selectedProjectId}/procurement-list/summary`),
    enabled: !!selectedProjectId,
  });

  // PLC Lines
  const { data: lines = [], isLoading: linesLoading, refetch: refetchLines } = useQuery<PlcLine[]>({
    queryKey: ["/api/projects", selectedProjectId, "procurement-list", { search, statusFilter, priorityFilter, groupFilter, subgroupFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (groupFilter !== "all") params.set("groupId", String(groupFilter));
      if (subgroupFilter !== "all") params.set("subgroupId", String(subgroupFilter));
      return apiRequest("GET", `/api/projects/${selectedProjectId}/procurement-list?${params}`);
    },
    enabled: !!selectedProjectId,
  });

  // Derive unique subgroups from loaded lines for the selected group
  const availableSubgroups = (() => {
    const seen = new Map<number, string>();
    for (const l of lines) {
      if (l.buySubgroupId && l.buySubgroupLabel) {
        if (groupFilter === "all" || l.buyGroupId === groupFilter) {
          seen.set(l.buySubgroupId, l.buySubgroupLabel);
        }
      }
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  })();

  // PO Groups
  const { data: poGroups = [], isLoading: pogLoading, refetch: refetchPogs } = useQuery<PoGroup[]>({
    queryKey: ["/api/projects", selectedProjectId, "epc-po-groups"],
    queryFn: () => apiRequest("GET", `/api/projects/${selectedProjectId}/epc-po-groups`),
    enabled: !!selectedProjectId,
  });

  // Phase 3 — GRN list
  const { data: grnList = [], isLoading: grnListLoading, refetch: refetchGrn } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "plc-grn"],
    queryFn: () => apiRequest("GET", `/api/projects/${selectedProjectId}/plc-grn`),
    enabled: !!selectedProjectId && activeTab === "grn",
  });

  // Phase 3 — MIR list
  const { data: mirList = [], isLoading: mirListLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "plc-mir"],
    queryFn: () => apiRequest("GET", `/api/projects/${selectedProjectId}/plc-mir`),
    enabled: !!selectedProjectId && activeTab === "grn",
  });

  // Phase 3 — Stores accept mutation
  const storesAcceptMut = useMutation({
    mutationFn: ({ id, storesNotes }: { id: number; storesNotes?: string }) =>
      apiRequest("POST", `/api/plc-grn/${id}/accept-stores`, { storesNotes }),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Stores acceptance recorded" });
      qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "plc-grn"] });
      qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "procurement-list"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Phase 2 — RFQ list
  const { data: rfqList = [], isLoading: rfqListLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "plc-rfq", rfqStatusFilter],
    queryFn: () => {
      const params = rfqStatusFilter !== "all" ? `?status=${rfqStatusFilter}` : "";
      return apiRequest("GET", `/api/projects/${selectedProjectId}/plc-rfq${params}`);
    },
    enabled: !!selectedProjectId && activeTab === "bid-eval",
  });

  // Phase 2 — Selected RFQ detail (lines + vendors + quotes + tbe + cbe)
  const { data: selectedRfq, isLoading: rfqDetailLoading } = useQuery<any>({
    queryKey: ["/api/plc-rfq", selectedRfqId],
    queryFn: () => apiRequest("GET", `/api/plc-rfq/${selectedRfqId}`),
    enabled: !!selectedRfqId,
  });
  const { data: rfqTbeList = [] } = useQuery<any[]>({
    queryKey: ["/api/plc-rfq", selectedRfqId, "tbe"],
    queryFn: () => apiRequest("GET", `/api/plc-rfq/${selectedRfqId}/tbe`),
    enabled: !!selectedRfqId,
  });
  const { data: rfqCbeList = [] } = useQuery<any[]>({
    queryKey: ["/api/plc-rfq", selectedRfqId, "cbe"],
    queryFn: () => apiRequest("GET", `/api/plc-rfq/${selectedRfqId}/cbe`),
    enabled: !!selectedRfqId,
  });

  // RFQ mutations
  const rfqIssueMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/plc-rfq/${id}/issue`, {}),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", selectedRfqId] });
      qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "plc-rfq"] });
      toast({ title: "RFQ issued to vendors" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const rfqCloseMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/plc-rfq/${id}/close`, {}),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", selectedRfqId] });
      qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "plc-rfq"] });
      toast({ title: "RFQ closed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const rfqCancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      apiRequest("POST", `/api/plc-rfq/${id}/cancel`, { reason }),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", selectedRfqId] });
      qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "plc-rfq"] });
      setSelectedRfqId(null);
      toast({ title: "RFQ cancelled" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Phase 2 — Vendor list for add-vendor functionality
  const { data: allVendors = [] } = useQuery<any[]>({
    queryKey: ["/api/vendors"],
    queryFn: () => apiRequest("GET", "/api/vendors"),
    enabled: activeTab === "bid-eval",
  });

  // Phase 2 — Add/remove vendor to RFQ
  const rfqAddVendorMut = useMutation({
    mutationFn: ({ rfqId, vendorId }: { rfqId: number; vendorId: number }) =>
      apiRequest("POST", `/api/plc-rfq/${rfqId}/vendors`, { vendorId }),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", selectedRfqId] });
      setAddVendorId("");
      toast({ title: "Vendor added to RFQ" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const rfqRemoveVendorMut = useMutation({
    mutationFn: ({ rfqId, vendorId }: { rfqId: number; vendorId: number }) =>
      apiRequest("DELETE", `/api/plc-rfq/${rfqId}/vendors/${vendorId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", selectedRfqId] });
      toast({ title: "Vendor removed from RFQ" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Phase 2 — Add/remove PLC line to RFQ
  const rfqAddLineMut = useMutation({
    mutationFn: ({ rfqId, plcLineId }: { rfqId: number; plcLineId: number }) =>
      apiRequest("POST", `/api/plc-rfq/${rfqId}/lines`, { plcLineId }),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", selectedRfqId] });
      qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "procurement-list"] });
      setAddLineId("");
      toast({ title: "Line added to RFQ" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const rfqRemoveLineMut = useMutation({
    mutationFn: ({ rfqId, plcLineId }: { rfqId: number; plcLineId: number }) =>
      apiRequest("DELETE", `/api/plc-rfq/${rfqId}/lines/${plcLineId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", selectedRfqId] });
      qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "procurement-list"] });
      toast({ title: "Line removed from RFQ" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Phase 4 — Cockpit summary (materialized view)
  const { data: cockpitSummary } = useQuery<any>({
    queryKey: ["/api/projects", selectedProjectId, "cockpit-summary"],
    queryFn: () => apiRequest("GET", `/api/projects/${selectedProjectId}/cockpit-summary`),
    enabled: !!selectedProjectId && activeTab === "kpi",
    refetchInterval: 5 * 60 * 1000,
  });

  // Phase 4 — Rate contracts
  const { data: rateContracts = [] } = useQuery<any[]>({
    queryKey: ["/api/plc-rate-contracts", selectedProjectId],
    queryFn: () => apiRequest("GET", `/api/plc-rate-contracts?projectId=${selectedProjectId}`),
    enabled: !!selectedProjectId && activeTab === "kpi",
  });

  // Phase 4 — Line close mutation
  const closeLineMut = useMutation({
    mutationFn: ({ id, forceClose, cancelReason }: { id: number; forceClose?: boolean; cancelReason?: string }) =>
      apiRequest("POST", `/api/procurement-list-lines/${id}/close`, { forceClose, cancelReason }),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Line closed", description: `Line successfully closed.` });
      setShowLineCloseConfirm(false);
      setLineCloseTarget(null);
      invalidateAll();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId] });
  }

  const toggleLineSelect = (id: number) => {
    setSelectedLineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const POG_ELIGIBLE_STATUSES = ["pr_raised", "vendor_selected"];
  const selectAllVisible = () => {
    const eligible = lines.filter((l) => POG_ELIGIBLE_STATUSES.includes(l.status) && !l.activePoGroupId);
    setSelectedLineIds(eligible.map((l) => l.id));
  };
  const clearSelection = () => setSelectedLineIds([]);

  return (
    <Layout>
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <ClipboardList className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Procurement List Control</h1>
              <p className="text-xs text-muted-foreground">PLC — Purchase Order lifecycle management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={selectedProjectId?.toString() ?? ""}
              onValueChange={(v) => {
                setSelectedProjectId(parseInt(v));
                setSelectedLineIds([]);
              }}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select project…" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.code} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={invalidateAll} title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {!selectedProjectId ? (
        <div className="flex flex-col items-center justify-center h-80 text-muted-foreground">
          <Package className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-medium">Select a project to view its Procurement List</p>
        </div>
      ) : (
        <div className="p-6 space-y-5">
          {/* Summary Strip */}
          {summaryLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading summary…
            </div>
          ) : summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <StatCard label="Total"         value={summary.total}          icon={ClipboardList}  color="text-gray-700" />
              <StatCard label="PR Raised"     value={summary.pending}        icon={Clock}          color="text-yellow-700" />
              <StatCard label="In Progress"   value={summary.in_progress}    icon={Package}        color="text-blue-700" />
              <StatCard label="PO Issued"     value={summary.po_issued}      icon={CheckCircle2}   color="text-indigo-700" />
              <StatCard label="Received"      value={summary.received}       icon={CheckCircle2}   color="text-green-700" />
              <StatCard label="Overdue"       value={summary.overdue}        icon={AlertTriangle}  color="text-red-700" />
              <StatCard label="Over-Procured" value={summary.over_procured}  icon={AlertTriangle}  color="text-amber-700" />
            </div>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="border-b bg-transparent w-full justify-start rounded-none h-auto p-0 gap-1">
              <TabsTrigger value="lines"     className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 pb-2">
                Procurement Lines {lines.length > 0 && <span className="ml-1 text-xs bg-gray-100 rounded px-1">{lines.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="po-groups" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 pb-2">
                PO Groups {poGroups.length > 0 && <span className="ml-1 text-xs bg-gray-100 rounded px-1">{poGroups.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="bid-eval" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 pb-2">
                Bid Evaluation {rfqList.length > 0 && <span className="ml-1 text-xs bg-gray-100 rounded px-1">{rfqList.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="grn" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 pb-2">
                GRN Tracking {grnList.length > 0 && <span className="ml-1 text-xs bg-gray-100 rounded px-1">{grnList.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="kpi" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 pb-2">
                <BarChart2 className="h-4 w-4 mr-1" />KPI
              </TabsTrigger>
            </TabsList>

            {/* ── Procurement Lines Tab ── */}
            <TabsContent value="lines" className="mt-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search PLC No, Tag, Description…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {Object.entries(PLC_STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="expedite">Expedite</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={groupFilter === "all" ? "all" : String(groupFilter)}
                  onValueChange={(v) => {
                    setGroupFilter(v === "all" ? "all" : Number(v));
                    setSubgroupFilter("all");
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="All Groups" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Groups</SelectItem>
                    {buyGroups.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={subgroupFilter === "all" ? "all" : String(subgroupFilter)}
                  onValueChange={(v) => setSubgroupFilter(v === "all" ? "all" : Number(v))}
                  disabled={groupFilter === "all"}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder={groupFilter === "all" ? "Select group first" : "All Subgroups"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subgroups</SelectItem>
                    {availableSubgroups.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex-1" />
                {selectedLineIds.length > 0 && (
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded px-3 py-1.5">
                    <span className="text-sm text-indigo-700 font-medium">{selectedLineIds.length} selected</span>
                    <Button size="sm" onClick={() => { setShowPogWizard(true); }}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Create PO Group
                    </Button>
                    {selectedLineIds.some((id) => {
                      const l = lines.find((ln) => ln.id === id);
                      return l && ["pr_raised", "pending_rfq"].includes(l.status);
                    }) && (
                      <Button size="sm" variant="outline" onClick={() => { setShowRfqCreate(true); }}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Create RFQ
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
                  </div>
                )}
                {selectedLineIds.length === 0 && (
                  <Button variant="outline" size="sm" onClick={selectAllVisible}>
                    <Filter className="h-3.5 w-3.5 mr-1" /> Select Eligible
                  </Button>
                )}
                {selectedProjectId && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a
                      href={`/api/projects/${selectedProjectId}/procurement-list/export-csv${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`}
                      download
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                    </a>
                  </Button>
                )}
              </div>

              {/* Table */}
              {linesLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading lines…
                </div>
              ) : lines.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p>No procurement lines found.</p>
                  <p className="text-xs mt-1">Lines are created automatically when a BUY List PR is raised.</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-8">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedLineIds.length > 0 && selectedLineIds.length === lines.filter((l) => POG_ELIGIBLE_STATUSES.includes(l.status) && !l.activePoGroupId).length}
                            onChange={(e) => e.target.checked ? selectAllVisible() : clearSelection()}
                          />
                        </TableHead>
                        <TableHead className="font-semibold text-xs">PLC No</TableHead>
                        <TableHead className="font-semibold text-xs">Tag No</TableHead>
                        <TableHead className="font-semibold text-xs">Subgroup</TableHead>
                        <TableHead className="font-semibold text-xs text-right">Reqd</TableHead>
                        <TableHead className="font-semibold text-xs text-right">Ordered</TableHead>
                        <TableHead className="font-semibold text-xs text-right">Rcvd</TableHead>
                        <TableHead className="font-semibold text-xs text-right">Balance</TableHead>
                        <TableHead className="font-semibold text-xs">Status</TableHead>
                        <TableHead className="font-semibold text-xs">Priority</TableHead>
                        <TableHead className="font-semibold text-xs">Vendor</TableHead>
                        <TableHead className="font-semibold text-xs">POG No</TableHead>
                        <TableHead className="font-semibold text-xs">Req. By</TableHead>
                        <TableHead className="font-semibold text-xs">AVL</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow
                          key={line.id}
                          className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                            line.revisionActionRequired !== "none" ? "bg-amber-50/50" : ""
                          } ${selectedLineIds.includes(line.id) ? "bg-indigo-50/60" : ""}`}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rounded"
                              disabled={!POG_ELIGIBLE_STATUSES.includes(line.status) || !!line.activePoGroupId}
                              checked={selectedLineIds.includes(line.id)}
                              onChange={() => toggleLineSelect(line.id)}
                            />
                          </TableCell>
                          <TableCell
                            className="font-mono text-xs text-indigo-700 font-medium cursor-pointer"
                            onClick={() => setSelectedLineId(line.id)}
                          >
                            {line.plcNumber}
                          </TableCell>
                          <TableCell className="text-xs font-medium" onClick={() => setSelectedLineId(line.id)}>
                            {line.tagNo || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-xs" onClick={() => setSelectedLineId(line.id)}>
                            {line.subgroupLabel ?? line.subgroupCode ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums" onClick={() => setSelectedLineId(line.id)}>
                            {parseFloat(line.qtyRequired).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums" onClick={() => setSelectedLineId(line.id)}>
                            {parseFloat(line.qtyOrdered).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums" onClick={() => setSelectedLineId(line.id)}>
                            {parseFloat(line.qtyReceived).toFixed(2)}
                          </TableCell>
                          <TableCell
                            className={`text-xs text-right tabular-nums font-medium ${parseFloat(line.qtyBalance) === 0 && parseFloat(line.qtyRequired) > 0 ? "text-green-600" : parseFloat(line.qtyOverProcured) > 0 ? "text-red-600" : ""}`}
                            onClick={() => setSelectedLineId(line.id)}
                          >
                            {parseFloat(line.qtyBalance).toFixed(2)}
                            {parseFloat(line.qtyOverProcured) > 0 && (
                              <span className="ml-1 text-red-500" title="Over-procured">⚠</span>
                            )}
                          </TableCell>
                          <TableCell onClick={() => setSelectedLineId(line.id)}>
                            <StatusBadge status={line.status} map={PLC_STATUS_COLORS} labelMap={PLC_STATUS_LABELS} />
                          </TableCell>
                          <TableCell onClick={() => setSelectedLineId(line.id)}>
                            <StatusBadge status={line.priority} map={PRIORITY_COLORS} />
                          </TableCell>
                          <TableCell className="text-xs max-w-[140px] truncate" onClick={() => setSelectedLineId(line.id)}>
                            {line.vendorDisplayName ?? line.vendorName ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell
                            className="text-xs font-mono text-blue-700 cursor-pointer"
                            onClick={() => line.activePoGroupId && setSelectedPogId(line.activePoGroupId)}
                          >
                            {line.activePoGroupNumber ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-xs" onClick={() => setSelectedLineId(line.id)}>
                            {line.requiredByDate ? fmtDate(line.requiredByDate) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell onClick={() => setSelectedLineId(line.id)}>
                            <span
                              className={`inline-block w-2 h-2 rounded-full ${
                                line.avlStatus === "qualified" ? "bg-green-500" :
                                line.avlStatus === "bypassed" ? "bg-amber-400" :
                                line.avlStatus === "not_qualified" ? "bg-red-500" :
                                "bg-gray-300"
                              }`}
                              title={line.avlStatus}
                            />
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setSelectedLineId(line.id)}>
                                  View Details
                                </DropdownMenuItem>
                                {["pr_raised", "pending_rfq"].includes(line.status) && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedLineIds([line.id]);
                                      setShowRfqCreate(true);
                                    }}
                                  >
                                    Create RFQ for this line
                                  </DropdownMenuItem>
                                )}
                                {line.status === "pr_raised" && !line.activePoGroupId && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedLineIds([line.id]);
                                      setShowPogWizard(true);
                                    }}
                                  >
                                    Create PO Group
                                  </DropdownMenuItem>
                                )}
                                {["pending_rfq", "rfq_issued", "rfq_closed", "tbe_in_progress", "tbe_complete", "cbe_in_progress"].includes(line.status) && (
                                  <DropdownMenuItem
                                    onClick={() => setActiveTab("bid-eval")}
                                  >
                                    View in Bid Evaluation
                                  </DropdownMenuItem>
                                )}
                                {["fully_received", "received", "po_issued"].includes(line.status) && (
                                  <DropdownMenuItem
                                    className="text-red-700"
                                    onClick={() => {
                                      setLineCloseTarget(line);
                                      setShowLineCloseConfirm(true);
                                    }}
                                  >
                                    <Lock className="h-3.5 w-3.5 mr-1.5" /> Close Line
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ── PO Groups Tab ── */}
            <TabsContent value="po-groups" className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  All Purchase Order Groups for this project.
                </p>
                <Button size="sm" onClick={() => { clearSelection(); setShowPogWizard(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> New PO Group
                </Button>
              </div>

              {pogLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading PO Groups…
                </div>
              ) : poGroups.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p>No PO Groups yet. Create one by selecting lines in the Procurement Lines tab.</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold text-xs">POG No</TableHead>
                        <TableHead className="font-semibold text-xs">Vendor</TableHead>
                        <TableHead className="font-semibold text-xs text-right">Lines</TableHead>
                        <TableHead className="font-semibold text-xs text-right">Amount</TableHead>
                        <TableHead className="font-semibold text-xs">Status</TableHead>
                        <TableHead className="font-semibold text-xs">Submitted By</TableHead>
                        <TableHead className="font-semibold text-xs">Approved By</TableHead>
                        <TableHead className="font-semibold text-xs">EPC PO No</TableHead>
                        <TableHead className="font-semibold text-xs">SAP Sync</TableHead>
                        <TableHead className="font-semibold text-xs">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {poGroups.map((pog) => (
                        <TableRow
                          key={pog.id}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => setSelectedPogId(pog.id)}
                        >
                          <TableCell className="font-mono text-xs text-blue-700 font-medium">
                            {pog.pogNumber}
                          </TableCell>
                          <TableCell className="text-xs">
                            {pog.vendorDisplayName ?? pog.vendorName ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-xs text-right">{pog.lineCount}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {pog.totalAmount ? `₹ ${parseFloat(pog.totalAmount).toLocaleString("en-IN")}` : "—"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={pog.status} map={POG_STATUS_COLORS} />
                          </TableCell>
                          <TableCell className="text-xs">{pog.submittedByName ?? "—"}</TableCell>
                          <TableCell className="text-xs">{pog.approvedByName ?? "—"}</TableCell>
                          <TableCell className="text-xs font-mono">
                            {pog.epcPoNumberActual ?? "—"}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const ss = (pog as any).sapSyncStatus;
                              if (!ss || ss === 'pending') return <span className="text-xs text-muted-foreground">—</span>;
                              const sapColors: Record<string, string> = {
                                synced: "bg-emerald-100 text-emerald-800",
                                error: "bg-red-100 text-red-800",
                                mismatch: "bg-amber-100 text-amber-800",
                              };
                              return (
                                <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${sapColors[ss] ?? "bg-gray-100 text-gray-600"}`}>
                                  <Database className="h-3 w-3" />{ss}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-xs">{fmtDate(pog.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="bid-eval" className="mt-4">
              <div className="flex gap-5">
                {/* ── Left: RFQ list ── */}
                <div className="w-72 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-800">RFQ Register</h3>
                    <Button size="sm" onClick={() => setShowRfqCreate(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> New RFQ
                    </Button>
                  </div>
                  <Select value={rfqStatusFilter} onValueChange={(v) => { setRfqStatusFilter(v); setSelectedRfqId(null); }}>
                    <SelectTrigger className="mb-2 text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="issued">Issued</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>

                  {rfqListLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center text-xs">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                  ) : rfqList.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      <p>No RFQs yet.</p>
                      <p className="mt-1">Create one from lines in pr_raised status.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {rfqList.map((rfq: any) => {
                        const rfqStatusColors: Record<string,string> = {
                          draft: "bg-gray-100 text-gray-700",
                          issued: "bg-cyan-100 text-cyan-800",
                          closed: "bg-teal-100 text-teal-800",
                          cancelled: "bg-red-100 text-red-700",
                        };
                        return (
                          <div
                            key={rfq.id}
                            className={`border rounded-lg px-3 py-2.5 cursor-pointer transition-all ${
                              selectedRfqId === rfq.id
                                ? "border-indigo-400 bg-indigo-50 shadow-sm"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                            onClick={() => setSelectedRfqId(rfq.id)}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-mono font-medium text-indigo-700">{rfq.rfq_number}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${rfqStatusColors[rfq.status] ?? "bg-gray-100 text-gray-600"}`}>
                                {rfq.status}
                              </span>
                            </div>
                            {rfq.subject && (
                              <p className="text-xs text-gray-600 truncate mt-0.5">{rfq.subject}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-muted-foreground">{rfq.line_count} lines</span>
                              <span className="text-xs text-muted-foreground">{rfq.vendor_count} vendors</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Right: RFQ detail panel ── */}
                <div className="flex-1 min-w-0">
                  {!selectedRfqId ? (
                    <div className="flex flex-col items-center justify-center h-60 text-muted-foreground border rounded-lg bg-white">
                      <Package className="h-8 w-8 mb-2 opacity-20" />
                      <p className="text-sm">Select an RFQ to view details</p>
                    </div>
                  ) : rfqDetailLoading ? (
                    <div className="flex items-center justify-center h-60">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : selectedRfq ? (
                    <div className="space-y-4">
                      {/* RFQ header */}
                      <div className="border rounded-lg bg-white p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-indigo-700">{selectedRfq.rfq_number}</span>
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                selectedRfq.status === "issued" ? "bg-cyan-100 text-cyan-800" :
                                selectedRfq.status === "closed" ? "bg-teal-100 text-teal-800" :
                                selectedRfq.status === "cancelled" ? "bg-red-100 text-red-700" :
                                "bg-gray-100 text-gray-700"
                              }`}>
                                {selectedRfq.status.toUpperCase()}
                              </span>
                            </div>
                            {selectedRfq.subject && <p className="text-sm text-gray-700 mt-1">{selectedRfq.subject}</p>}
                            <div className="flex items-center gap-4 mt-2">
                              {selectedRfq.rfq_date && (
                                <span className="text-xs text-muted-foreground">RFQ Date: <strong>{fmtDate(selectedRfq.rfq_date)}</strong></span>
                              )}
                              {selectedRfq.submission_deadline && (
                                <span className="text-xs text-muted-foreground">Deadline: <strong>{fmtDate(selectedRfq.submission_deadline)}</strong></span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {selectedRfq.status === "draft" && (
                              <Button
                                size="sm"
                                onClick={() => rfqIssueMut.mutate(selectedRfq.id)}
                                disabled={rfqIssueMut.isPending}
                              >
                                {rfqIssueMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                                Issue to Vendors
                              </Button>
                            )}
                            {selectedRfq.status === "issued" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => rfqCloseMut.mutate(selectedRfq.id)}
                                disabled={rfqCloseMut.isPending}
                              >
                                {rfqCloseMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                                Close RFQ
                              </Button>
                            )}
                            {!["cancelled", "closed"].includes(selectedRfq.status) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  if (window.confirm("Cancel this RFQ?")) {
                                    rfqCancelMut.mutate({ id: selectedRfq.id });
                                  }
                                }}
                                disabled={rfqCancelMut.isPending}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Vendors & Lines summary */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Vendors card */}
                        <div className="border rounded-lg bg-white p-3">
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">Invited Vendors ({selectedRfq.vendors?.length ?? 0})</h4>
                          {(selectedRfq.vendors ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground mb-2">No vendors added</p>
                          ) : (
                            <ul className="space-y-1 mb-2">
                              {(selectedRfq.vendors ?? []).map((v: any) => (
                                <li key={v.vendor_id} className="flex items-center justify-between text-xs text-gray-700">
                                  <span>{v.vendor_display_name || v.vendor_name}</span>
                                  {selectedRfq.status === "draft" && (
                                    <button
                                      className="text-red-400 hover:text-red-600 ml-2 shrink-0"
                                      title="Remove vendor"
                                      onClick={() => rfqRemoveVendorMut.mutate({ rfqId: selectedRfq.id, vendorId: v.vendor_id })}
                                      disabled={rfqRemoveVendorMut.isPending}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {selectedRfq.status === "draft" && (
                            <div className="flex gap-1 mt-1">
                              <Select value={addVendorId} onValueChange={setAddVendorId}>
                                <SelectTrigger className="h-7 text-xs flex-1">
                                  <SelectValue placeholder="Add vendor…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {allVendors
                                    .filter((v: any) => !selectedRfq.vendors?.some((rv: any) => rv.vendor_id === v.id))
                                    .map((v: any) => (
                                      <SelectItem key={v.id} value={String(v.id)}>
                                        {v.display_name || v.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                className="h-7 px-2"
                                disabled={!addVendorId || rfqAddVendorMut.isPending}
                                onClick={() => rfqAddVendorMut.mutate({ rfqId: selectedRfq.id, vendorId: parseInt(addVendorId) })}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Lines card */}
                        <div className="border rounded-lg bg-white p-3">
                          <h4 className="text-xs font-semibold text-gray-700 mb-2">Lines in RFQ ({selectedRfq.lines?.length ?? 0})</h4>
                          {(selectedRfq.lines ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground mb-2">No lines added</p>
                          ) : (
                            <ul className="space-y-1 mb-2">
                              {(selectedRfq.lines ?? []).map((l: any) => (
                                <li key={l.plc_line_id} className="flex items-center justify-between text-xs">
                                  <span className="font-mono text-indigo-700 shrink-0">{l.plc_number}</span>
                                  <span className="text-gray-600 truncate mx-1">— {l.tag_no || l.service_description}</span>
                                  {selectedRfq.status === "draft" && (
                                    <button
                                      className="text-red-400 hover:text-red-600 shrink-0"
                                      title="Remove line"
                                      onClick={() => rfqRemoveLineMut.mutate({ rfqId: selectedRfq.id, plcLineId: l.plc_line_id })}
                                      disabled={rfqRemoveLineMut.isPending}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {selectedRfq.status === "draft" && (() => {
                            const addableLines = lines.filter(
                              (ln) =>
                                ["pr_raised", "pending_rfq"].includes(ln.status) &&
                                !selectedRfq.lines?.some((rl: any) => rl.plc_line_id === ln.id),
                            );
                            if (addableLines.length === 0) return null;
                            return (
                              <div className="flex gap-1 mt-1">
                                <Select value={addLineId} onValueChange={setAddLineId}>
                                  <SelectTrigger className="h-7 text-xs flex-1">
                                    <SelectValue placeholder="Add line…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {addableLines.map((ln) => (
                                      <SelectItem key={ln.id} value={String(ln.id)}>
                                        {ln.plcNumber} — {ln.tagNo || ln.serviceDescription}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  className="h-7 px-2"
                                  disabled={!addLineId || rfqAddLineMut.isPending}
                                  onClick={() => rfqAddLineMut.mutate({ rfqId: selectedRfq.id, plcLineId: parseInt(addLineId) })}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Quotes table */}
                      <div className="border rounded-lg bg-white overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                          <h4 className="text-sm font-semibold text-gray-800">Vendor Quotes</h4>
                          {["issued","closed"].includes(selectedRfq.status) && (
                            <Button size="sm" onClick={() => { setEditingQuote(null); setShowVendorQuote(true); }}>
                              <Plus className="h-3.5 w-3.5 mr-1" /> Record Quote
                            </Button>
                          )}
                        </div>
                        {(selectedRfq.quotes ?? []).length === 0 ? (
                          <p className="text-center text-xs text-muted-foreground py-6">No quotes recorded yet.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-50">
                                <TableHead className="text-xs font-semibold">PLC No</TableHead>
                                <TableHead className="text-xs font-semibold">Vendor</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Unit Price</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Delivery (wks)</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Tech Score</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Comm Score</TableHead>
                                <TableHead className="text-xs font-semibold">Rec.</TableHead>
                                <TableHead className="w-8" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(selectedRfq.quotes ?? []).map((q: any) => (
                                <TableRow key={q.id} className="hover:bg-gray-50">
                                  <TableCell className="text-xs font-mono text-indigo-700">{q.plc_number}</TableCell>
                                  <TableCell className="text-xs">{q.vendor_display_name || q.vendor_name}</TableCell>
                                  <TableCell className="text-xs text-right tabular-nums">
                                    {q.unit_price ? `₹ ${parseFloat(q.unit_price).toLocaleString("en-IN")}` : "—"}
                                  </TableCell>
                                  <TableCell className="text-xs text-right">{q.delivery_weeks ?? "—"}</TableCell>
                                  <TableCell className="text-xs text-right">{q.technical_score ?? "—"}</TableCell>
                                  <TableCell className="text-xs text-right">{q.commercial_score ?? "—"}</TableCell>
                                  <TableCell>
                                    {q.is_recommended && (
                                      <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">Yes</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost" size="icon" className="h-7 w-7"
                                      onClick={() => { setEditingQuote(q); setShowVendorQuote(true); }}
                                    >
                                      <MoreHorizontal className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>

                      {/* TBE / CBE panels — only after RFQ closed */}
                      {["closed"].includes(selectedRfq.status) && (
                        <div className="grid grid-cols-2 gap-4">
                          {/* TBE */}
                          <div className="border rounded-lg bg-white overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b bg-violet-50">
                              <h4 className="text-sm font-semibold text-violet-800">TBE</h4>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditingTbe(null); setShowTbe(true); }}>
                                <Plus className="h-3 w-3 mr-1" /> Record
                              </Button>
                            </div>
                            {rfqTbeList.length === 0 ? (
                              <p className="text-center text-xs text-muted-foreground py-5">No TBE records yet.</p>
                            ) : (
                              <div className="divide-y">
                                {rfqTbeList.map((t: any) => (
                                  <div
                                    key={t.id}
                                    className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-violet-50/40"
                                    onClick={() => { setEditingTbe(t); setShowTbe(true); }}
                                  >
                                    <div>
                                      <span className="text-xs font-mono text-indigo-700">{t.plc_number}</span>
                                      <span className="text-xs text-gray-500 ml-2">— {t.tag_no}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {t.recommended_vendor_name && (
                                        <span className="text-xs text-gray-600 truncate max-w-[120px]">{t.recommended_vendor_display_name || t.recommended_vendor_name}</span>
                                      )}
                                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                        t.status === "complete" ? "bg-purple-100 text-purple-800" : "bg-violet-100 text-violet-800"
                                      }`}>{t.status}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* CBE */}
                          <div className="border rounded-lg bg-white overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b bg-fuchsia-50">
                              <h4 className="text-sm font-semibold text-fuchsia-800">CBE</h4>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditingCbe(null); setShowCbe(true); }}>
                                <Plus className="h-3 w-3 mr-1" /> Record
                              </Button>
                            </div>
                            {rfqCbeList.length === 0 ? (
                              <p className="text-center text-xs text-muted-foreground py-5">No CBE records yet.</p>
                            ) : (
                              <div className="divide-y">
                                {rfqCbeList.map((c: any) => (
                                  <div
                                    key={c.id}
                                    className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-fuchsia-50/40"
                                    onClick={() => { setEditingCbe(c); setShowCbe(true); }}
                                  >
                                    <div>
                                      <span className="text-xs font-mono text-indigo-700">{c.plc_number}</span>
                                      <span className="text-xs text-gray-500 ml-2">— {c.tag_no}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {c.final_vendor_name && (
                                        <span className="text-xs text-gray-600 truncate max-w-[120px]">{c.final_vendor_display_name || c.final_vendor_name}</span>
                                      )}
                                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                        c.status === "complete" ? "bg-emerald-100 text-emerald-800" : "bg-fuchsia-100 text-fuchsia-800"
                                      }`}>{c.status}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </TabsContent>

            {/* ── GRN Tracking Tab ── */}
            <TabsContent value="grn" className="mt-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Select value={grnStatusFilter} onValueChange={setGrnStatusFilter}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="GRN Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All GRN Statuses</SelectItem>
                    <SelectItem value="received">Received (Pending Inspection)</SelectItem>
                    <SelectItem value="accepted">Inspection Accepted</SelectItem>
                    <SelectItem value="rejected">Inspection Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={grnLineFilter} onValueChange={setGrnLineFilter}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Filter by PLC Line" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Lines</SelectItem>
                    {lines.filter((l) => ["po_issued","partially_received","fully_received","closed"].includes(l.status)).map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.plcNumber} — {l.tagNo ?? l.serviceDescription?.slice(0,30)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={refetchGrn}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
                </Button>
                <Button size="sm" onClick={() => setShowGrnDialog(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Record GRN
                </Button>
              </div>

              {/* GRN KPI strip */}
              {!grnListLoading && grnList.length > 0 && (() => {
                const total = grnList.length;
                const pendingInsp = grnList.filter((g: any) => g.inspection_status === "pending").length;
                const accepted = grnList.filter((g: any) => g.status === "accepted").length;
                const rejected = grnList.filter((g: any) => g.status === "rejected").length;
                const storesAccepted = grnList.filter((g: any) => g.stores_accepted_at).length;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                    <StatCard label="Total GRNs"       value={total}       icon={Truck}          color="text-gray-700" />
                    <StatCard label="Pending Inspection" value={pendingInsp}  icon={Clock}          color="text-amber-700" />
                    <StatCard label="Accepted"          value={accepted}    icon={CheckCircle2}   color="text-emerald-700" />
                    <StatCard label="Rejected"          value={rejected}    icon={ShieldAlert}    color="text-red-700" />
                    <StatCard label="Stores Accepted"   value={storesAccepted} icon={CheckCheck}  color="text-indigo-700" />
                  </div>
                );
              })()}

              {/* GRN Table */}
              {grnListLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading GRN records…
                </div>
              ) : (() => {
                const filtered = grnList.filter((g: any) => {
                  if (grnStatusFilter !== "all" && g.status !== grnStatusFilter) return false;
                  if (grnLineFilter !== "all" && String(g.plc_line_id) !== grnLineFilter) return false;
                  return true;
                });
                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-16 text-muted-foreground">
                      <Truck className="h-10 w-10 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No GRN records yet</p>
                      <p className="text-xs mt-1">Record your first Goods Receipt to begin tracking.</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-4">
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 text-xs">
                            <TableHead>GRN No.</TableHead>
                            <TableHead>PLC Line</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead>Received</TableHead>
                            <TableHead className="text-right">GRN Qty</TableHead>
                            <TableHead className="text-right">Accepted</TableHead>
                            <TableHead className="text-right">Rejected</TableHead>
                            <TableHead>Inspection</TableHead>
                            <TableHead>Stores</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.map((g: any) => {
                            const inspColor: Record<string, string> = {
                              pending: "bg-amber-100 text-amber-800",
                              passed:  "bg-emerald-100 text-emerald-800",
                              partial: "bg-orange-100 text-orange-800",
                              failed:  "bg-red-100 text-red-800",
                              waived:  "bg-slate-100 text-slate-700",
                            };
                            const grnStatusColor: Record<string, string> = {
                              received: "bg-yellow-100 text-yellow-800",
                              accepted: "bg-emerald-100 text-emerald-800",
                              rejected: "bg-red-100 text-red-800",
                            };
                            return (
                              <TableRow key={g.id} className="hover:bg-slate-50 text-sm">
                                <TableCell className="font-mono text-xs">{g.grn_number}</TableCell>
                                <TableCell>
                                  <div className="text-xs font-medium">{g.plc_number ?? "—"}</div>
                                  <div className="text-xs text-muted-foreground">{g.tag_no ?? ""}</div>
                                </TableCell>
                                <TableCell className="text-xs max-w-[120px] truncate">
                                  {g.vendor_name_resolved ?? g.vendor_name ?? "—"}
                                </TableCell>
                                <TableCell className="text-xs whitespace-nowrap">{fmtDate(g.received_date)}</TableCell>
                                <TableCell className="text-right text-xs font-medium">{parseFloat(g.grn_qty || 0)}</TableCell>
                                <TableCell className="text-right text-xs text-emerald-700 font-semibold">{parseFloat(g.accepted_qty || 0)}</TableCell>
                                <TableCell className="text-right text-xs text-red-600 font-semibold">{parseFloat(g.rejected_qty || 0)}</TableCell>
                                <TableCell>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${inspColor[g.inspection_status] ?? "bg-gray-100 text-gray-600"}`}>
                                    {g.inspection_status}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {g.stores_accepted_at
                                    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCheck className="h-3 w-3" />Accepted</span>
                                    : <span className="text-xs text-muted-foreground">Pending</span>
                                  }
                                </TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {g.inspection_status === "pending" && (
                                        <DropdownMenuItem onClick={() => { setSelectedGrn(g); setShowInspDialog(true); }}>
                                          <ClipboardList className="h-4 w-4 mr-2" />Record Inspection
                                        </DropdownMenuItem>
                                      )}
                                      {g.status === "accepted" && !g.stores_accepted_at && (
                                        <DropdownMenuItem onClick={() => storesAcceptMut.mutate({ id: g.id })}>
                                          <CheckCheck className="h-4 w-4 mr-2" />Accept to Stores
                                        </DropdownMenuItem>
                                      )}
                                      {g.status === "accepted" && (() => {
                                        const plcLine = lines.find((l) => l.id === g.plc_line_id);
                                        return plcLine ? (
                                          <DropdownMenuItem onClick={() => { setMirPlcLine(plcLine); setShowMirDialog(true); }}>
                                            <ArrowRightFromLine className="h-4 w-4 mr-2" />Issue Material (MIR)
                                          </DropdownMenuItem>
                                        ) : null;
                                      })()}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* MIR Section */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <ArrowRightFromLine className="h-4 w-4 text-emerald-600" />
                        Material Issue Records (MIR)
                        {mirList.length > 0 && <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5">{mirList.length}</span>}
                      </h3>
                      {mirListLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />Loading MIRs…
                        </div>
                      ) : mirList.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-4">No material issues recorded yet.</p>
                      ) : (
                        <div className="rounded-lg border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-slate-50 text-xs">
                                <TableHead>MIR No.</TableHead>
                                <TableHead>PLC Line</TableHead>
                                <TableHead className="text-right">Issued Qty</TableHead>
                                <TableHead>Issued To</TableHead>
                                <TableHead>Issued By</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Notes</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {mirList.map((m: any) => (
                                <TableRow key={m.id} className="text-sm">
                                  <TableCell className="font-mono text-xs">{m.mir_number}</TableCell>
                                  <TableCell>
                                    <div className="text-xs font-medium">{m.plc_number ?? "—"}</div>
                                    <div className="text-xs text-muted-foreground">{m.tag_no ?? ""}</div>
                                  </TableCell>
                                  <TableCell className="text-right font-semibold text-emerald-700 text-xs">{parseFloat(m.issued_qty || 0)}</TableCell>
                                  <TableCell className="text-xs">{m.issued_to}</TableCell>
                                  <TableCell className="text-xs">{m.issued_by_name ?? "—"}</TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(m.issued_at)}</TableCell>
                                  <TableCell className="text-xs max-w-[180px] truncate text-muted-foreground">{m.purpose_notes ?? "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </TabsContent>

            {/* ── KPI Dashboard Tab ── */}
            <TabsContent value="kpi" className="mt-4">
              {!summary ? (
                <div className="text-center py-16 text-muted-foreground">
                  <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Select a project to view KPIs</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Procurement Lifecycle Summary */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Layers className="h-4 w-4 text-indigo-600" />
                        Procurement Lifecycle
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                        <StatCard label="Total Lines"     value={summary.total}           icon={ClipboardList}  color="text-gray-700" />
                        <StatCard label="PR Raised"       value={summary.pending}         icon={Clock}          color="text-yellow-700" />
                        <StatCard label="In Progress"     value={summary.in_progress}     icon={Package}        color="text-blue-700" />
                        <StatCard label="PO Issued"       value={summary.po_issued}       icon={CheckCircle2}   color="text-indigo-700" />
                        <StatCard label="Partially Rcvd"  value={summary.received}        icon={Truck}          color="text-orange-700" />
                        <StatCard label="Fully Received"  value={summary.fully_received}  icon={CheckCheck}     color="text-emerald-700" />
                        <StatCard label="Closed"          value={summary.closed}          icon={XCircle}        color="text-gray-500" />
                      </div>

                      {/* Progress bar */}
                      {parseInt(summary.total) > 0 && (() => {
                        const total = parseInt(summary.total) || 1;
                        const received = parseInt(summary.fully_received || "0") + parseInt(summary.received || "0");
                        const closed = parseInt(summary.closed || "0");
                        const pctReceived = Math.round((received / total) * 100);
                        const pctClosed = Math.round((closed / total) * 100);
                        return (
                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Receipt progress</span>
                              <span>{received}/{total} lines ({pctReceived}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                              <div className="bg-emerald-500 h-2.5 rounded-full transition-all" style={{ width: `${pctReceived}%` }} />
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Closure progress</span>
                              <span>{closed}/{total} lines ({pctClosed}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                              <div className="bg-indigo-500 h-2.5 rounded-full transition-all" style={{ width: `${pctClosed}%` }} />
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* Qty Tracking */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-indigo-600" />
                        Quantity Tracking
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                          { label: "Total Qty Required", value: parseFloat(summary.total_qty_required || "0").toFixed(0), color: "text-gray-700", icon: ClipboardList },
                          { label: "Total Qty Ordered",  value: parseFloat(summary.total_qty_ordered || "0").toFixed(0), color: "text-blue-700",  icon: Package },
                          { label: "Total Qty Received", value: parseFloat(summary.total_qty_received || "0").toFixed(0), color: "text-emerald-700", icon: Truck },
                          { label: "Over-Procured Lines", value: summary.over_procured, color: "text-amber-700", icon: TrendingDown },
                        ].map(({ label, value, color, icon: Icon }) => (
                          <div key={label} className="bg-slate-50 rounded-lg p-4 flex items-center gap-3">
                            <Icon className={`h-8 w-8 opacity-30 ${color}`} />
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                              <p className={`text-2xl font-bold ${color}`}>{value}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* GRN Stats */}
                  {grnList.length > 0 && (() => {
                    const totalGrns = grnList.length;
                    const totalAccepted = grnList.reduce((s: number, g: any) => s + (parseFloat(g.accepted_qty) || 0), 0);
                    const totalRejected = grnList.reduce((s: number, g: any) => s + (parseFloat(g.rejected_qty) || 0), 0);
                    const totalMirQty = mirList.reduce((s: number, m: any) => s + (parseFloat(m.issued_qty) || 0), 0);
                    const rejRate = totalAccepted + totalRejected > 0
                      ? Math.round((totalRejected / (totalAccepted + totalRejected)) * 100) : 0;
                    return (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Truck className="h-4 w-4 text-indigo-600" />
                            GRN & Inspection KPIs
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                              { label: "Total GRN Records", value: totalGrns,              color: "text-gray-700",    icon: Truck },
                              { label: "Accepted Units",    value: totalAccepted.toFixed(0), color: "text-emerald-700", icon: CheckCircle2 },
                              { label: "Rejected Units",    value: totalRejected.toFixed(0), color: "text-red-700",    icon: ShieldAlert },
                              { label: "Units Issued (MIR)",value: totalMirQty.toFixed(0),  color: "text-indigo-700", icon: ArrowRightFromLine },
                            ].map(({ label, value, color, icon: Icon }) => (
                              <div key={label} className="bg-slate-50 rounded-lg p-4 flex items-center gap-3">
                                <Icon className={`h-8 w-8 opacity-30 ${color}`} />
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                          {rejRate > 0 && (
                            <div className="mt-4 bg-red-50 border border-red-100 rounded p-3 flex items-center gap-2 text-sm text-red-700">
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              Rejection rate: <strong>{rejRate}%</strong> of inspected units rejected. Review NCRs.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })()}

                  {/* Overdue / Alert Panel */}
                  {(parseInt(summary.overdue || "0") > 0 || parseInt(summary.over_procured || "0") > 0) && (
                    <Card className="border-amber-200 bg-amber-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                          <AlertTriangle className="h-4 w-4" />
                          Alerts
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm text-amber-800">
                        {parseInt(summary.overdue || "0") > 0 && (
                          <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 shrink-0" />
                            <strong>{summary.overdue}</strong> line(s) past required-by date — expedite required.
                          </div>
                        )}
                        {parseInt(summary.over_procured || "0") > 0 && (
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 shrink-0" />
                            <strong>{summary.over_procured}</strong> line(s) over-procured — reconciliation needed.
                          </div>
                        )}
                        {parseInt(summary.avl_bypassed || "0") > 0 && (
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 shrink-0" />
                            <strong>{summary.avl_bypassed}</strong> line(s) with AVL bypass — quality review required.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Phase 4 — Cockpit Summary (Materialized View) */}
                  {cockpitSummary && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Activity className="h-4 w-4 text-indigo-600" />
                          Procurement Cockpit — Computed KPIs
                          <span className="text-xs font-normal text-muted-foreground ml-auto">Refreshed every 5 min</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {[
                            {
                              label: "Procurement Completion",
                              value: `${parseFloat(cockpitSummary.procurement_completion_pct || "0").toFixed(1)}%`,
                              color: "text-emerald-700",
                              icon: TrendingUp,
                            },
                            {
                              label: "On-Time Delivery Rate",
                              value: `${parseFloat(cockpitSummary.on_time_delivery_pct || "0").toFixed(1)}%`,
                              color: "text-blue-700",
                              icon: CheckCircle2,
                            },
                            {
                              label: "Lines Requiring Reconcil.",
                              value: String(cockpitSummary.lines_requiring_reconciliation || 0),
                              color: "text-amber-700",
                              icon: RefreshCw,
                            },
                            {
                              label: "Open NCRs",
                              value: String(cockpitSummary.open_ncr_count || 0),
                              color: cockpitSummary.open_ncr_count > 0 ? "text-red-700" : "text-gray-500",
                              icon: FileWarning,
                            },
                          ].map(({ label, value, color, icon: Icon }) => (
                            <div key={label} className="bg-slate-50 rounded-lg p-4 flex items-center gap-3">
                              <Icon className={`h-8 w-8 opacity-30 ${color}`} />
                              <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* SAP sync summary */}
                        {(cockpitSummary.sap_synced_po_count > 0 || cockpitSummary.sap_error_count > 0) && (
                          <div className="mt-4 flex flex-wrap gap-3">
                            <div className="flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2.5 py-1.5">
                              <Database className="h-3.5 w-3.5" />
                              <strong>{cockpitSummary.sap_synced_po_count}</strong> POs synced to SAP
                            </div>
                            {cockpitSummary.sap_error_count > 0 && (
                              <div className="flex items-center gap-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded px-2.5 py-1.5">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <strong>{cockpitSummary.sap_error_count}</strong> SAP sync error(s) — action required
                              </div>
                            )}
                            {cockpitSummary.sap_mismatch_count > 0 && (
                              <div className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-2.5 py-1.5">
                                <RefreshCw className="h-3.5 w-3.5" />
                                <strong>{cockpitSummary.sap_mismatch_count}</strong> PO(s) with quantity mismatch
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Phase 4 — Rate Contract Refs */}
                  {rateContracts.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-indigo-600" />
                          Rate Contract References ({rateContracts.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-50">
                                <TableHead className="text-xs font-semibold">PLC No</TableHead>
                                <TableHead className="text-xs font-semibold">Vendor</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Rate / Unit</TableHead>
                                <TableHead className="text-xs font-semibold">Currency</TableHead>
                                <TableHead className="text-xs font-semibold">Valid From</TableHead>
                                <TableHead className="text-xs font-semibold">Valid To</TableHead>
                                <TableHead className="text-xs font-semibold">Contract Ref</TableHead>
                                <TableHead className="text-xs font-semibold text-center">Locked</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rateContracts.map((rc: any) => (
                                <TableRow key={rc.id} className="hover:bg-gray-50">
                                  <TableCell className="text-xs font-mono text-indigo-700">{rc.plc_number}</TableCell>
                                  <TableCell className="text-xs">{rc.vendor_name || "—"}</TableCell>
                                  <TableCell className="text-xs text-right tabular-nums font-medium">
                                    {parseFloat(rc.rate_per_unit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-xs">{rc.currency}</TableCell>
                                  <TableCell className="text-xs">{fmtDate(rc.valid_from)}</TableCell>
                                  <TableCell className="text-xs">{rc.valid_to ? fmtDate(rc.valid_to) : <span className="text-muted-foreground">Open</span>}</TableCell>
                                  <TableCell className="text-xs font-mono text-muted-foreground">{rc.contract_ref || "—"}</TableCell>
                                  <TableCell className="text-center">
                                    {rc.is_locked
                                      ? <Lock className="h-3.5 w-3.5 text-red-500 mx-auto" />
                                      : <Unlock className="h-3.5 w-3.5 text-gray-300 mx-auto" />}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Dialogs / Drawers */}
      {showPogWizard && selectedProjectId && (
        <PoGroupWizard
          projectId={selectedProjectId}
          preselectedLineIds={selectedLineIds}
          onClose={() => { setShowPogWizard(false); clearSelection(); }}
          onSuccess={() => {
            setShowPogWizard(false);
            clearSelection();
            invalidateAll();
            toast({ title: "PO Group created", description: "The PO Group has been saved as a draft." });
          }}
        />
      )}

      {selectedPogId && (
        <PoGroupDetail
          pogId={selectedPogId}
          onClose={() => setSelectedPogId(null)}
          onMutated={invalidateAll}
        />
      )}

      {selectedLineId && (
        <PlcLineDetailDrawer
          lineId={selectedLineId}
          onClose={() => setSelectedLineId(null)}
          onMutated={invalidateAll}
        />
      )}

      {/* ── Phase 4 Dialogs ── */}

      {/* Line Close Confirmation */}
      {showLineCloseConfirm && lineCloseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-50 rounded-lg">
                <Lock className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Close Procurement Line</h2>
                <p className="text-xs text-muted-foreground">This action is permanent and audited.</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">PLC No</span>
                <span className="font-mono font-medium text-indigo-700">{lineCloseTarget.plcNumber}</span>
              </div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Tag No</span>
                <span className="font-medium">{lineCloseTarget.tagNo || "—"}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Current Status</span>
                <span className="font-medium capitalize">{lineCloseTarget.status?.replace(/_/g, " ")}</span>
              </div>
            </div>
            {lineCloseTarget.status !== "fully_received" && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
                Line is not fully received. This is a <strong>force close</strong> (Manager override). Reason required.
              </div>
            )}
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-700 block mb-1">
                Reason / Notes {lineCloseTarget.status !== "fully_received" && <span className="text-red-600">*</span>}
              </label>
              <textarea
                id="lineCloseReason"
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                rows={3}
                placeholder="Enter reason for closure…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowLineCloseConfirm(false); setLineCloseTarget(null); }}
                disabled={closeLineMut.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={closeLineMut.isPending}
                onClick={() => {
                  const reason = (document.getElementById("lineCloseReason") as HTMLTextAreaElement)?.value || "";
                  const forceClose = lineCloseTarget.status !== "fully_received";
                  if (forceClose && !reason.trim()) {
                    toast({ title: "Reason required for force-close", variant: "destructive" });
                    return;
                  }
                  closeLineMut.mutate({ id: lineCloseTarget.id, forceClose, cancelReason: reason || undefined });
                }}
              >
                {closeLineMut.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Closing…</> : <><Lock className="h-3.5 w-3.5 mr-1" />Confirm Close</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SAP Reconciliation Dialog */}
      {showReconcileDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Database className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">SAP B1 Reconciliation Report</h2>
                  <p className="text-xs text-muted-foreground">THERMOPAC vs SAP B1 quantity comparison</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setShowReconcileDialog(false); setReconcileResult(null); }}>
                <XCircle className="h-5 w-5 text-gray-400" />
              </Button>
            </div>

            {reconcileLoading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" /> Running reconciliation against SAP B1…
              </div>
            ) : !reconcileResult ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>Select an EPC PO and run reconciliation to see the diff report.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium">PO: <span className="font-mono text-indigo-700">{reconcileResult.poNumber}</span></span>
                  <span className="text-sm text-muted-foreground">SAP DocEntry: <span className="font-mono">{reconcileResult.sapDocEntry}</span></span>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-medium ${
                    reconcileResult.hasDiscrepancy ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {reconcileResult.hasDiscrepancy ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {reconcileResult.hasDiscrepancy ? "Discrepancies Found" : "Quantities Match"}
                  </span>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs font-semibold">Line</TableHead>
                        <TableHead className="text-xs font-semibold">PLC No</TableHead>
                        <TableHead className="text-xs font-semibold">Tag No</TableHead>
                        <TableHead className="text-xs font-semibold text-right">TP Ordered</TableHead>
                        <TableHead className="text-xs font-semibold text-right">SAP Ordered</TableHead>
                        <TableHead className="text-xs font-semibold text-right">TP Received</TableHead>
                        <TableHead className="text-xs font-semibold text-right">SAP Received</TableHead>
                        <TableHead className="text-xs font-semibold text-center">Match</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(reconcileResult.diffs || []).map((diff: any) => (
                        <TableRow key={diff.lineNumber} className={diff.status === "mismatch" ? "bg-red-50" : ""}>
                          <TableCell className="text-xs font-mono">{diff.lineNumber}</TableCell>
                          <TableCell className="text-xs font-mono text-indigo-700">{diff.plcNumber || "—"}</TableCell>
                          <TableCell className="text-xs">{diff.tagNo || "—"}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{diff.thermopac.qtyOrdered}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {diff.sap.lineFound ? diff.sap.qtyOrdered ?? "—" : <span className="text-red-600 font-medium">NOT IN SAP</span>}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{diff.thermopac.qtyReceived}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {diff.sap.lineFound ? (diff.sap.qtyReceived ?? "—") : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {diff.status === "ok"
                              ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                              : <AlertTriangle className="h-4 w-4 text-red-500 mx-auto" />}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {reconcileResult.hasDiscrepancy && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
                    <AlertTriangle className="inline h-4 w-4 mr-1" />
                    Discrepancies detected — raise a SAP B1 journal correction or re-push the affected PO items. Audit log entry written.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Phase 3 Dialogs ── */}
      {showGrnDialog && selectedProjectId && (
        <GrnRecordDialog
          projectId={selectedProjectId}
          lines={lines}
          onClose={() => setShowGrnDialog(false)}
          onSuccess={() => {
            setShowGrnDialog(false);
            qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "plc-grn"] });
            qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "procurement-list"] });
            qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "procurement-list", "summary"] });
          }}
        />
      )}

      {showInspDialog && selectedGrn && selectedProjectId && (
        <GrnInspectionDialog
          grn={selectedGrn}
          projectId={selectedProjectId}
          onClose={() => { setShowInspDialog(false); setSelectedGrn(null); }}
          onSuccess={() => {
            setShowInspDialog(false);
            setSelectedGrn(null);
            qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "plc-grn"] });
            qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "procurement-list"] });
          }}
        />
      )}

      {showMirDialog && mirPlcLine && selectedProjectId && (
        <MaterialIssueDialog
          projectId={selectedProjectId}
          plcLine={mirPlcLine}
          grns={grnList.filter((g: any) => g.plc_line_id === mirPlcLine.id)}
          onClose={() => { setShowMirDialog(false); setMirPlcLine(null); }}
          onSuccess={() => {
            setShowMirDialog(false);
            setMirPlcLine(null);
            qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "plc-mir"] });
          }}
        />
      )}

      {/* ── Phase 2 Dialogs ── */}
      {showRfqCreate && selectedProjectId && (
        <RfqCreateDialog
          projectId={selectedProjectId}
          lines={lines}
          onClose={() => setShowRfqCreate(false)}
          onSuccess={() => {
            setShowRfqCreate(false);
            qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "plc-rfq"] });
          }}
        />
      )}

      {showVendorQuote && selectedRfq && (
        <VendorQuoteDialog
          rfqId={selectedRfq.id}
          rfqLines={selectedRfq.lines ?? []}
          rfqVendors={selectedRfq.vendors ?? []}
          existingQuote={editingQuote}
          onClose={() => { setShowVendorQuote(false); setEditingQuote(null); }}
          onSuccess={() => {
            setShowVendorQuote(false);
            setEditingQuote(null);
            qc.invalidateQueries({ queryKey: ["/api/plc-rfq", selectedRfqId] });
          }}
        />
      )}

      {showTbe && selectedRfq && (
        <TbeDialog
          rfqId={selectedRfq.id}
          rfqLines={selectedRfq.lines ?? []}
          rfqVendors={selectedRfq.vendors ?? []}
          existingTbe={editingTbe}
          onClose={() => { setShowTbe(false); setEditingTbe(null); }}
          onSuccess={() => {
            setShowTbe(false);
            setEditingTbe(null);
            qc.invalidateQueries({ queryKey: ["/api/plc-rfq", selectedRfqId, "tbe"] });
            qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "procurement-list"] });
          }}
        />
      )}

      {showCbe && selectedRfq && (
        <CbeDialog
          rfqId={selectedRfq.id}
          rfqLines={selectedRfq.lines ?? []}
          rfqVendors={selectedRfq.vendors ?? []}
          existingCbe={editingCbe}
          onClose={() => { setShowCbe(false); setEditingCbe(null); }}
          onSuccess={() => {
            setShowCbe(false);
            setEditingCbe(null);
            qc.invalidateQueries({ queryKey: ["/api/plc-rfq", selectedRfqId, "cbe"] });
            qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "procurement-list"] });
          }}
        />
      )}
    </div>
    </Layout>
  );
}
