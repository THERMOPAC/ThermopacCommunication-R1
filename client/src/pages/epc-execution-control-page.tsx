import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Search, Filter, Package, Factory, CheckCircle2,
  XCircle, ChevronDown, ChevronRight, RefreshCw, AlertTriangle,
  Play, CircleCheck, Undo2, ShoppingCart, Wrench, DollarSign,
} from "lucide-react";

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, Employee: 4,
};

type ProcStatus = "draft" | "under_preparation" | "ready_for_po" | "cancelled" | "superseded";
type ProdStatus = "draft" | "under_preparation" | "ready_for_wo" | "cancelled" | "superseded";

const PROC_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  under_preparation: "bg-amber-100 text-amber-800",
  ready_for_po: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-800",
};

const PROC_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", under_preparation: "Under Preparation", ready_for_po: "Ready for PO",
  cancelled: "Cancelled", superseded: "Superseded",
};

const PROD_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  under_preparation: "bg-amber-100 text-amber-800",
  ready_for_wo: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-800",
};

const PROD_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", under_preparation: "Under Preparation", ready_for_wo: "Ready for WO",
  cancelled: "Cancelled", superseded: "Superseded",
};

type ActionDef = {
  key: string; label: string; icon: any;
  variant: "default" | "destructive" | "outline" | "secondary";
  minRoleLevel: number; statusRequired: string[];
  needsNote?: boolean; noteLabel?: string; noteKey?: string; noteRequired?: boolean;
};

const PROC_ACTIONS: ActionDef[] = [
  { key: "start-preparation", label: "Start Preparation", icon: Play, variant: "default", minRoleLevel: 3, statusRequired: ["draft"] },
  { key: "mark-ready", label: "Mark Ready for PO", icon: CircleCheck, variant: "default", minRoleLevel: 3, statusRequired: ["under_preparation"], needsNote: true, noteLabel: "Preparation Note", noteKey: "preparationNote" },
  { key: "revert-to-preparation", label: "Revert to Preparation", icon: Undo2, variant: "outline", minRoleLevel: 3, statusRequired: ["ready_for_po"] },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 3, statusRequired: ["draft", "under_preparation", "ready_for_po"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason", noteRequired: true },
];

const PROD_ACTIONS: ActionDef[] = [
  { key: "start-preparation", label: "Start Preparation", icon: Play, variant: "default", minRoleLevel: 3, statusRequired: ["draft"] },
  { key: "mark-ready", label: "Mark Ready for WO", icon: CircleCheck, variant: "default", minRoleLevel: 3, statusRequired: ["under_preparation"], needsNote: true, noteLabel: "Preparation Note", noteKey: "preparationNote" },
  { key: "revert-to-preparation", label: "Revert to Preparation", icon: Undo2, variant: "outline", minRoleLevel: 3, statusRequired: ["ready_for_wo"] },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 3, statusRequired: ["draft", "under_preparation", "ready_for_wo"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason", noteRequired: true },
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

function formatAmount(amt: any) {
  if (!amt || parseFloat(amt) === 0) return "—";
  return `INR ${parseFloat(amt).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function EpcExecutionControlPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userRole = (user as any)?.role || "Employee";
  const userLevel = roleHierarchy[userRole] ?? 4;

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"procurement" | "production">("procurement");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ rec: any; action: ActionDef; type: "procurement" | "production" } | null>(null);
  const [actionNote, setActionNote] = useState("");

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });

  const { data: procRecords = [], isLoading: procLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "procurement-executions"],
    queryFn: () => selectedProjectId ? fetch(`/api/projects/${selectedProjectId}/procurement-executions`, { credentials: "include" }).then(r => r.json()) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const { data: prodRecords = [], isLoading: prodLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "production-executions"],
    queryFn: () => selectedProjectId ? fetch(`/api/projects/${selectedProjectId}/production-executions`, { credentials: "include" }).then(r => r.json()) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const { data: expandedDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: [`/api/${activeTab === "procurement" ? "procurement" : "production"}-executions`, expandedRow],
    queryFn: () => expandedRow ? fetch(`/api/${activeTab === "procurement" ? "procurement" : "production"}-executions/${expandedRow}`, { credentials: "include" }).then(r => r.json()) : Promise.resolve(null),
    enabled: !!expandedRow,
  });

  const currentRecords = activeTab === "procurement" ? procRecords : prodRecords;
  const isLoading = activeTab === "procurement" ? procLoading : prodLoading;
  const statusColors = activeTab === "procurement" ? PROC_STATUS_COLORS : PROD_STATUS_COLORS;
  const statusLabels = activeTab === "procurement" ? PROC_STATUS_LABELS : PROD_STATUS_LABELS;
  const actions = activeTab === "procurement" ? PROC_ACTIONS : PROD_ACTIONS;
  const docType = activeTab === "procurement" ? "BUY" : "MFG";

  const filtered = useMemo(() => {
    let list = currentRecords;
    if (statusFilter !== "all") list = list.filter((r: any) => r.status === statusFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((r: any) =>
        (r.procurement_number || r.production_number || "").toLowerCase().includes(s) ||
        (r.item_code || "").toLowerCase().includes(s) ||
        (r.item_description || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [currentRecords, statusFilter, searchTerm]);

  const procStats = useMemo(() => ({
    total: procRecords.length,
    draft: procRecords.filter((r: any) => r.status === "draft").length,
    underPrep: procRecords.filter((r: any) => r.status === "under_preparation").length,
    ready: procRecords.filter((r: any) => r.status === "ready_for_po").length,
    cancelled: procRecords.filter((r: any) => r.status === "cancelled").length,
    totalCost: procRecords.filter((r: any) => !["cancelled", "superseded"].includes(r.status)).reduce((sum: number, r: any) => sum + parseFloat(r.estimated_total_cost || "0"), 0),
  }), [procRecords]);

  const prodStats = useMemo(() => ({
    total: prodRecords.length,
    draft: prodRecords.filter((r: any) => r.status === "draft").length,
    underPrep: prodRecords.filter((r: any) => r.status === "under_preparation").length,
    ready: prodRecords.filter((r: any) => r.status === "ready_for_wo").length,
    cancelled: prodRecords.filter((r: any) => r.status === "cancelled").length,
    totalCost: prodRecords.filter((r: any) => !["cancelled", "superseded"].includes(r.status)).reduce((sum: number, r: any) => sum + parseFloat(r.estimated_total_cost || "0"), 0),
  }), [prodRecords]);

  const stats = activeTab === "procurement" ? procStats : prodStats;

  const lifecycleMutation = useMutation({
    mutationFn: async ({ id, action, type, body }: { id: number; action: string; type: string; body: any }) => {
      const res = await apiRequest("POST", `/api/${type}-executions/${id}/${action}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, `${activeTab}-executions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/${activeTab}-executions`, expandedRow] });
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
    setActionTarget({ rec, action, type: activeTab });
    setActionNote("");
    setActionDialogOpen(true);
  }

  function executeAction() {
    if (!actionTarget) return;
    const { rec, action, type } = actionTarget;
    const body: any = {};
    if (action.noteKey && actionNote) body[action.noteKey] = actionNote;
    lifecycleMutation.mutate({ id: rec.id, action: action.key, type, body });
  }

  function getRecordNumber(rec: any) {
    return rec.procurement_number || rec.production_number || `EXEC-${rec.id}`;
  }

  function renderTable() {
    if (!selectedProjectId) {
      return (
        <Card className="p-8 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Select a project to view execution records</p>
        </Card>
      );
    }

    if (isLoading) {
      return <div className="py-12 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>;
    }

    if (filtered.length === 0) {
      return (
        <Card className="p-8 text-center">
          {activeTab === "procurement" ? <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" /> : <Factory className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />}
          <p className="text-sm text-muted-foreground">{currentRecords.length === 0 ? `No ${activeTab} execution records for this project.` : "No records match current filters."}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Execution records are auto-created when a Planning Record is released.</p>
        </Card>
      );
    }

    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] w-8"></TableHead>
              <TableHead className="text-[10px]">{activeTab === "procurement" ? "Procurement #" : "Production #"}</TableHead>
              <TableHead className="text-[10px]">Item Code</TableHead>
              <TableHead className="text-[10px]">Description</TableHead>
              <TableHead className="text-[10px] text-right">Qty</TableHead>
              <TableHead className="text-[10px] text-right">Est. Cost</TableHead>
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
                    <TableCell className="py-1.5 text-[10px] max-w-[180px] truncate">{rec.item_description || "—"}</TableCell>
                    <TableCell className="py-1.5 text-[10px] text-right font-mono">{rec.quantity || "—"} {rec.uom || ""}</TableCell>
                    <TableCell className="py-1.5 text-[10px] text-right font-mono">{formatAmount(rec.estimated_total_cost)}</TableCell>
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
                      <TableCell colSpan={9} className="p-0 bg-muted/10">
                        <div className="p-3 space-y-3">
                          {detailLoading ? (
                            <div className="py-4 text-center"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>
                          ) : expandedDetail ? (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="p-2.5">
                                  <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                    {activeTab === "procurement" ? <ShoppingCart className="h-3 w-3" /> : <Factory className="h-3 w-3" />}
                                    {activeTab === "procurement" ? "Procurement Details" : "Production Details"}
                                  </h4>
                                  <div className="space-y-1">
                                    <DetailRow label={activeTab === "procurement" ? "Procurement #" : "Production #"} value={getRecordNumber(expandedDetail)} mono />
                                    <DetailRow label="Status" value={statusLabels[expandedDetail.status] || expandedDetail.status} />
                                    <DetailRow label="Planning Record" value={expandedDetail.planning_record_id ? `#${expandedDetail.planning_record_id}` : null} />
                                    {activeTab === "procurement" && (
                                      <>
                                        <DetailRow label="Preferred Vendor" value={expandedDetail.vendor_display_name || expandedDetail.preferred_vendor_name} />
                                        <DetailRow label="Procurement Notes" value={expandedDetail.procurement_notes} />
                                      </>
                                    )}
                                    {activeTab === "production" && (
                                      <>
                                        <DetailRow label="Make Classification" value={expandedDetail.make_classification} />
                                        <DetailRow label="Drawing No" value={expandedDetail.drawing_no} mono />
                                        <DetailRow label="Drawing Revision" value={expandedDetail.drawing_revision} />
                                        <DetailRow label="Manufacturing Notes" value={expandedDetail.manufacturing_notes} />
                                      </>
                                    )}
                                  </div>
                                </Card>

                                <Card className="p-2.5">
                                  <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                    <Package className="h-3 w-3" /> Item & Cost
                                  </h4>
                                  <div className="space-y-1">
                                    <DetailRow label="Item Code" value={expandedDetail.item_code} mono />
                                    <DetailRow label="Description" value={expandedDetail.item_description} />
                                    <DetailRow label="Specification" value={expandedDetail.item_specification} />
                                    <DetailRow label="UOM" value={expandedDetail.uom} />
                                    <Separator className="my-1" />
                                    <DetailRow label="Quantity" value={expandedDetail.quantity} />
                                    <DetailRow label="Unit Cost" value={formatAmount(expandedDetail.estimated_unit_cost)} />
                                    <DetailRow label="Total Cost" value={formatAmount(expandedDetail.estimated_total_cost)} />
                                  </div>
                                </Card>

                                <Card className="p-2.5">
                                  <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Lifecycle & Audit
                                  </h4>
                                  <div className="space-y-1">
                                    <DetailRow label="Created By" value={expandedDetail.created_by_name} />
                                    <DetailRow label="Created" value={formatDate(expandedDetail.created_at)} />
                                    <DetailRow label="Assigned To" value={expandedDetail.assigned_to_name} />
                                    {expandedDetail.prepared_by_name && (
                                      <>
                                        <Separator className="my-1" />
                                        <DetailRow label="Prepared By" value={expandedDetail.prepared_by_name} />
                                        <DetailRow label="Prepared" value={formatDate(expandedDetail.prepared_at)} />
                                        {expandedDetail.preparation_note && <DetailRow label="Preparation Note" value={expandedDetail.preparation_note} />}
                                      </>
                                    )}
                                  </div>
                                </Card>
                              </div>

                              {expandedDetail.cancel_reason && (
                                <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-[10px]">
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5" />
                                  <div>
                                    <span className="font-medium text-red-700">Cancel Reason:</span>{" "}
                                    <span className="text-red-600">{expandedDetail.cancel_reason}</span>
                                  </div>
                                </div>
                              )}

                              {(expandedDetail.status === "ready_for_po" || expandedDetail.status === "ready_for_wo") && (
                                <div className="flex items-start gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-[10px]">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
                                  <span className="text-emerald-700 font-medium">
                                    {expandedDetail.status === "ready_for_po" ? "Ready for Purchase Order creation." : "Ready for Work Order creation."}
                                  </span>
                                </div>
                              )}

                              <Separator />
                              <div>
                                <h4 className="text-[10px] font-semibold mb-1.5">Document Attachments</h4>
                                <EpcDocumentPanel
                                  projectId={selectedProjectId!}
                                  docType={docType}
                                  parentEntityId={rec.id}
                                  documentNumber={recNum}
                                  userRole={userRole}
                                  compact={false}
                                />
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
              <Package className="h-5 w-5 text-primary" />
              EPC Procurement & Production Control
            </h1>
            <p className="text-xs text-muted-foreground">Execution records — Draft → Under Preparation → Ready for PO/WO</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => {
            if (selectedProjectId) {
              queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "procurement-executions"] });
              queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "production-executions"] });
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
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)} className="text-xs">{p.projectName || p.project_name || `Project #${p.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52 relative">
            <Label className="text-[10px]">Search</Label>
            <Search className="absolute left-2 top-[22px] h-3.5 w-3.5 text-muted-foreground" />
            <Input className="h-8 text-xs pl-7" placeholder="Record #, item code…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
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
            <TabsTrigger value="procurement" className="text-xs gap-1.5">
              <ShoppingCart className="h-3.5 w-3.5" /> Procurement ({procRecords.length})
            </TabsTrigger>
            <TabsTrigger value="production" className="text-xs gap-1.5">
              <Factory className="h-3.5 w-3.5" /> Production ({prodRecords.length})
            </TabsTrigger>
          </TabsList>

          {selectedProjectId && currentRecords.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold">{stats.total}</p><p className="text-[9px] text-muted-foreground">Total</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-slate-600">{stats.draft}</p><p className="text-[9px] text-muted-foreground">Draft</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-amber-600">{stats.underPrep}</p><p className="text-[9px] text-muted-foreground">Under Prep</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-emerald-600">{stats.ready}</p><p className="text-[9px] text-muted-foreground">{activeTab === "procurement" ? "Ready PO" : "Ready WO"}</p></CardContent></Card>
              <Card className="p-2 border-blue-200 bg-blue-50/30"><CardContent className="p-0 text-center"><p className="text-sm font-bold font-mono text-blue-700">{stats.totalCost > 0 ? parseFloat(String(stats.totalCost)).toLocaleString("en-IN", { minimumFractionDigits: 0 }) : "—"}</p><p className="text-[9px] text-muted-foreground">Est. Total Cost</p></CardContent></Card>
            </div>
          )}

          <TabsContent value="procurement" className="mt-3">{renderTable()}</TabsContent>
          <TabsContent value="production" className="mt-3">{renderTable()}</TabsContent>
        </Tabs>

        <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actionTarget?.action.label} — {actionTarget?.rec && getRecordNumber(actionTarget.rec)}</DialogTitle>
              <DialogDescription>
                {actionTarget?.action.key === "mark-ready"
                  ? `Marking this record ready will trigger quality gate checks (drawing control, BOM). If gates fail, tasks and alerts will be created automatically.`
                  : actionTarget?.action.key === "revert-to-preparation"
                  ? "This will revert the record back to Under Preparation status. Only possible if no active downstream records exist."
                  : "Confirm lifecycle action on this execution record."}
              </DialogDescription>
            </DialogHeader>
            {actionTarget?.action.needsNote && (
              <div>
                <Label className="text-xs">{actionTarget.action.noteLabel}</Label>
                <Textarea className="text-xs min-h-[80px]" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder={actionTarget.action.noteRequired ? "Required…" : "Optional note…"} />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                variant={actionTarget?.action.variant || "default"}
                onClick={executeAction}
                disabled={lifecycleMutation.isPending || (actionTarget?.action.noteRequired && !actionNote)}
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
