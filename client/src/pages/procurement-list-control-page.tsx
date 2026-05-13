import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PoGroupWizard } from "@/components/po-group-wizard";
import { PoGroupDetail } from "@/components/po-group-detail";
import { PlcLineDetailDrawer } from "@/components/plc-line-detail-drawer";

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
  in_po_group:      "bg-blue-100 text-blue-800 border-blue-200",
  po_issued:        "bg-indigo-100 text-indigo-800 border-indigo-200",
  partial_received: "bg-orange-100 text-orange-800 border-orange-200",
  fully_received:   "bg-green-100 text-green-800 border-green-200",
  closed:           "bg-gray-100 text-gray-700 border-gray-200",
  cancelled:        "bg-red-100 text-red-700 border-red-200",
};
const PLC_STATUS_LABELS: Record<string, string> = {
  pr_raised: "PR Raised", in_po_group: "In PO Group", po_issued: "PO Issued",
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
  const [activeTab, setActiveTab] = useState("lines");
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [selectedPogId, setSelectedPogId] = useState<number | null>(null);
  const [showPogWizard, setShowPogWizard] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<number[]>([]);

  // Projects list
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    select: (data) => (data as Project[]).filter((p) => !["Cancelled", "Closed", "Archived"].includes(p.status)),
  });

  // Summary strip
  const { data: summary, isLoading: summaryLoading } = useQuery<PlcSummary>({
    queryKey: ["/api/projects", selectedProjectId, "procurement-list", "summary"],
    queryFn: () => apiRequest("GET", `/api/projects/${selectedProjectId}/procurement-list/summary`).then((r) => r.json()),
    enabled: !!selectedProjectId,
  });

  // PLC Lines
  const { data: lines = [], isLoading: linesLoading, refetch: refetchLines } = useQuery<PlcLine[]>({
    queryKey: ["/api/projects", selectedProjectId, "procurement-list", { search, statusFilter, priorityFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      return apiRequest("GET", `/api/projects/${selectedProjectId}/procurement-list?${params}`).then((r) => r.json());
    },
    enabled: !!selectedProjectId,
  });

  // PO Groups
  const { data: poGroups = [], isLoading: pogLoading, refetch: refetchPogs } = useQuery<PoGroup[]>({
    queryKey: ["/api/projects", selectedProjectId, "epc-po-groups"],
    queryFn: () => apiRequest("GET", `/api/projects/${selectedProjectId}/epc-po-groups`).then((r) => r.json()),
    enabled: !!selectedProjectId,
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId] });
  }

  const toggleLineSelect = (id: number) => {
    setSelectedLineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const selectAllVisible = () => {
    const eligible = lines.filter((l) => l.status === "pr_raised" && !l.activePoGroupId);
    setSelectedLineIds(eligible.map((l) => l.id));
  };
  const clearSelection = () => setSelectedLineIds([]);

  return (
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
              <TabsTrigger value="bid-eval" disabled className="rounded-none border-b-2 border-transparent pb-2 text-muted-foreground">
                Bid Evaluation (Phase 2)
              </TabsTrigger>
              <TabsTrigger value="grn" disabled className="rounded-none border-b-2 border-transparent pb-2 text-muted-foreground">
                GRN Tracking (Phase 3)
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
                <div className="flex-1" />
                {selectedLineIds.length > 0 && (
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded px-3 py-1.5">
                    <span className="text-sm text-indigo-700 font-medium">{selectedLineIds.length} selected</span>
                    <Button size="sm" onClick={() => { setShowPogWizard(true); }}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Create PO Group
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
                  </div>
                )}
                {selectedLineIds.length === 0 && (
                  <Button variant="outline" size="sm" onClick={selectAllVisible}>
                    <Filter className="h-3.5 w-3.5 mr-1" /> Select Eligible
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
                            checked={selectedLineIds.length > 0 && selectedLineIds.length === lines.filter((l) => l.status === "pr_raised" && !l.activePoGroupId).length}
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
                              disabled={line.status !== "pr_raised" || !!line.activePoGroupId}
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
                          <TableCell className="text-xs">{fmtDate(pog.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="bid-eval">
              <div className="text-center py-20 text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">Bid Evaluation — Phase 2</p>
                <p className="text-xs mt-1">RFQ creation, vendor quotes, TBE and CBE workflows will be available in Phase 2.</p>
              </div>
            </TabsContent>

            <TabsContent value="grn">
              <div className="text-center py-20 text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">GRN Tracking — Phase 3</p>
                <p className="text-xs mt-1">Goods Receipt Notes, inspection queue, and stores acceptance will be available in Phase 3.</p>
              </div>
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
    </div>
  );
}
