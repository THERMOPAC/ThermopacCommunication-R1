import { useState, useMemo, Fragment } from "react";
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
import { ProjectAccessDenied, isProjectAccessDenied } from "@/components/project-access-denied";
import {
  Loader2, Search, Filter, Wrench, Edit, CheckCircle2, ShieldCheck,
  XCircle, RotateCcw, ChevronDown, ChevronRight,
  RefreshCw, AlertTriangle, FileText, Package, Hammer, Ruler,
} from "lucide-react";

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};

function userRoleLevel(role: string): number {
  return roleHierarchy[role] ?? 5;
}

type StatusType = "draft" | "approved" | "released" | "canceled" | "superseded";

const STATUS_COLORS: Record<StatusType, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-800",
  released: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-800",
};

const STATUS_LABELS: Record<StatusType, string> = {
  draft: "Draft", approved: "Approved", released: "Released",
  cancelled: "Cancelled", superseded: "Superseded",
};

const QUALITY_STATUS_COLORS: Record<string, string> = {
  pending_inspection: "bg-amber-50 text-amber-700 border-amber-200",
  inspection_passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inspection_failed: "bg-red-50 text-red-700 border-red-200",
};

const MAKE_CLASSIFICATION_COLORS: Record<string, string> = {
  fabrication: "bg-violet-100 text-violet-800",
  machining: "bg-sky-100 text-sky-800",
  assembly: "bg-teal-100 text-teal-800",
  welding: "bg-orange-100 text-orange-800",
};

type ActionDef = {
  key: string;
  label: string;
  icon: any;
  variant: "default" | "destructive" | "outline" | "secondary";
  minRoleLevel: number;
  statusRequired: string[];
  needsNote?: boolean;
  noteLabel?: string;
  noteKey?: string;
};

const LIFECYCLE_ACTIONS: ActionDef[] = [
  { key: "approve", label: "Approve", icon: CheckCircle2, variant: "default", minRoleLevel: 3, statusRequired: ["draft"], needsNote: true, noteLabel: "Approval Note", noteKey: "approvalNote" },
  { key: "release", label: "Release WO", icon: ShieldCheck, variant: "default", minRoleLevel: 2, statusRequired: ["approved"], needsNote: true, noteLabel: "Release Note", noteKey: "releaseNote" },
  { key: "revert-to-draft", label: "Revert to Draft", icon: RotateCcw, variant: "secondary", minRoleLevel: 3, statusRequired: ["approved"] },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 3, statusRequired: ["draft", "approved"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason" },
];

function DetailRow({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className={`font-medium break-all ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

export default function EpcWorkOrdersPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userRole = (user as any)?.role || "Employee";
  const userLevel = userRoleLevel(userRole);

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ rec: any; action: ActionDef } | null>(null);
  const [actionNote, setActionNote] = useState("");

  const [editForm, setEditForm] = useState({ manufacturingNotes: "", woNotes: "", estimatedUnitCost: "", estimatedTotalCost: "", drawingNo: "", drawingRevision: "" });

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { showAllProjects, setShowAllProjects, filteredProjects } = useProjectFilter(projects, selectedProjectId);
  const { data: workOrders = [], isLoading, error: recordsError } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "epc-work-orders"],
    queryFn: () => selectedProjectId ? fetchWithProjectAccess(`/api/projects/${selectedProjectId}/epc-work-orders`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const { data: expandedDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/epc-work-orders", expandedRow],
    queryFn: () => expandedRow ? fetch(`/api/epc-work-orders/${expandedRow}`, { credentials: "include" }).then(r => r.json()) : Promise.resolve(null),
    enabled: !!expandedRow,
  });

  const filtered = useMemo(() => {
    let list = workOrders;
    if (statusFilter !== "all") list = list.filter((wo: any) => wo.status === statusFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((wo: any) =>
        (wo.wo_number || "").toLowerCase().includes(s) ||
        (wo.item_code || "").toLowerCase().includes(s) ||
        (wo.item_description || "").toLowerCase().includes(s) ||
        (wo.make_classification || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [workOrders, statusFilter, searchTerm]);

  const stats = useMemo(() => ({
    total: workOrders.length,
    draft: workOrders.filter((wo: any) => wo.status === "draft").length,
    approved: workOrders.filter((wo: any) => wo.status === "approved").length,
    released: workOrders.filter((wo: any) => wo.status === "released").length,
    cancelled: workOrders.filter((wo: any) => wo.status === "canceled").length,
  }), [workOrders]);

  const lifecycleMutation = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: string; body: any }) => {
      const res = await apiRequest("POST", `/api/epc-work-orders/${id}/${action}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "epc-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-work-orders", expandedRow] });
      setActionDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Action failed", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const res = await apiRequest("PATCH", `/api/epc-work-orders/${id}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Updated", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "epc-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-work-orders", expandedRow] });
      setEditDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Update failed", variant: "destructive" });
    },
  });

  function getAvailableActions(rec: any): ActionDef[] {
    return LIFECYCLE_ACTIONS.filter((a) => {
      if (userLevel > a.minRoleLevel) return false;
      if (!a.statusRequired.includes(rec.status)) return false;
      return true;
    });
  }

  function openEdit(rec: any) {
    setEditTarget(rec);
    setEditForm({
      manufacturingNotes: rec.manufacturing_notes || "",
      woNotes: rec.wo_notes || "",
      estimatedUnitCost: rec.estimated_unit_cost || "",
      estimatedTotalCost: rec.estimated_total_cost || "",
      drawingNo: rec.drawing_no || "",
      drawingRevision: rec.drawing_revision != null ? String(rec.drawing_revision) : "",
    });
    setEditDialogOpen(true);
  }

  function openAction(rec: any, action: ActionDef) {
    setActionTarget({ rec, action });
    setActionNote("");
    setActionDialogOpen(true);
  }

  function executeAction() {
    if (!actionTarget) return;
    const { rec, action } = actionTarget;
    const body: any = {};
    if (action.noteKey && actionNote) body[action.noteKey] = actionNote;
    lifecycleMutation.mutate({ id: rec.id, action: action.key, body });
  }

  function submitEdit() {
    if (!editTarget) return;
    const body: any = { ...editForm };
    if (body.drawingRevision) body.drawingRevision = parseInt(body.drawingRevision) || null;
    else body.drawingRevision = null;
    editMutation.mutate({ id: editTarget.id, body });
  }

  function formatDate(d: any) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatAmount(amt: any) {
    if (!amt) return "—";
    return `INR ${parseFloat(amt).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  }

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              EPC Work Orders
            </h1>
            <p className="text-xs text-muted-foreground">BOM-driven manufacturing work orders — Draft → Approved → Released</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { if (selectedProjectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "epc-work-orders"] }); }}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-52">
            <Label className="text-[10px]">Project</Label>
            <Select value={selectedProjectId ? String(selectedProjectId) : ""} onValueChange={(v) => { setSelectedProjectId(parseInt(v)); setExpandedRow(null); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select project…" />
              </SelectTrigger>
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
            <Input className="h-8 text-xs pl-7" placeholder="WO number, item, classification…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="w-36">
            <Label className="text-[10px]">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs">
                <Filter className="h-3 w-3 mr-1" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedProjectId && workOrders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold">{stats.total}</p><p className="text-[9px] text-muted-foreground">Total WOs</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-slate-600">{stats.draft}</p><p className="text-[9px] text-muted-foreground">Draft</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-blue-600">{stats.approved}</p><p className="text-[9px] text-muted-foreground">Approved</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-emerald-600">{stats.released}</p><p className="text-[9px] text-muted-foreground">Released</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-red-600">{stats.cancelled}</p><p className="text-[9px] text-muted-foreground">Cancelled</p></CardContent></Card>
          </div>
        )}

        {!selectedProjectId ? (
          <Card className="p-8 text-center">
            <Wrench className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Select a project to view EPC Work Orders</p>
          </Card>
        ) : isProjectAccessDenied(recordsError) ? (
          <ProjectAccessDenied />
        ) : isLoading ? (
          <div className="py-12 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <Hammer className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{workOrders.length === 0 ? "No work orders created for this project yet." : "No work orders match the current filters."}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Work orders are created from the Execution Control Dashboard pipeline.</p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] w-8"></TableHead>
                  <TableHead className="text-[10px]">WO Number</TableHead>
                  <TableHead className="text-[10px]">Item</TableHead>
                  <TableHead className="text-[10px] text-center">Classification</TableHead>
                  <TableHead className="text-[10px] text-right">Qty</TableHead>
                  <TableHead className="text-[10px] text-center">Status</TableHead>
                  <TableHead className="text-[10px] text-center">Quality</TableHead>
                  <TableHead className="text-[10px]">Created By</TableHead>
                  <TableHead className="text-[10px]">Created</TableHead>
                  <TableHead className="text-[10px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((wo: any) => {
                  const isExpanded = expandedRow === wo.id;
                  const actions = getAvailableActions(wo);
                  const canEdit = userLevel <= 3 && !["canceled", "superseded", "released"].includes(wo.status);
                  return (
                    <Fragment key={wo.id}>
                      <TableRow className={`cursor-pointer hover:bg-muted/40 ${isExpanded ? "bg-muted/30" : ""}`} onClick={() => setExpandedRow(isExpanded ? null : wo.id)}>
                        <TableCell className="py-1.5">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </TableCell>
                        <TableCell className="py-1.5 font-mono text-[10px] font-medium">{wo.wo_number}</TableCell>
                        <TableCell className="py-1.5 text-[10px] max-w-[180px] truncate">{wo.item_code || wo.item_description || "—"}</TableCell>
                        <TableCell className="py-1.5 text-center">
                          {wo.make_classification && (
                            <Badge variant="secondary" className={`text-[8px] px-1 py-0 ${MAKE_CLASSIFICATION_COLORS[wo.make_classification] || "bg-gray-100 text-gray-700"}`}>
                              {wo.make_classification}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 text-[10px] text-right font-mono">{wo.quantity || "—"} {wo.uom || ""}</TableCell>
                        <TableCell className="py-1.5 text-center">
                          <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${STATUS_COLORS[wo.status as StatusType] || ""}`}>
                            {STATUS_LABELS[wo.status as StatusType] || wo.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 text-center">
                          {wo.quality_status && (
                            <Badge variant="outline" className={`text-[8px] px-1 py-0 border ${QUALITY_STATUS_COLORS[wo.quality_status] || ""}`}>
                              {(wo.quality_status || "").replace(/_/g, " ")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 text-[10px] text-muted-foreground">{wo.created_by_name || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[10px] text-muted-foreground">{formatDate(wo.created_at)}</TableCell>
                        <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[9px]" onClick={() => openEdit(wo)}>
                                <Edit className="h-3 w-3 mr-0.5" /> Edit
                              </Button>
                            )}
                            {actions.slice(0, 2).map((a) => (
                              <Button key={a.key} size="sm" variant={a.variant} className="h-6 px-1.5 text-[9px]" onClick={() => openAction(wo, a)}>
                                <a.icon className="h-3 w-3 mr-0.5" /> {a.label}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${wo.id}-detail`}>
                          <TableCell colSpan={10} className="p-0 bg-muted/10">
                            <div className="p-3 space-y-3">
                              {detailLoading ? (
                                <div className="py-4 text-center"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>
                              ) : expandedDetail ? (
                                <>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card className="p-2.5">
                                      <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                        <FileText className="h-3 w-3" /> Work Order Details
                                      </h4>
                                      <div className="space-y-1">
                                        <DetailRow label="WO Number" value={expandedDetail.wo_number} mono />
                                        <DetailRow label="Status" value={STATUS_LABELS[expandedDetail.status as StatusType] || expandedDetail.status} />
                                        <DetailRow label="Item Code" value={expandedDetail.item_code} mono />
                                        <DetailRow label="Description" value={expandedDetail.item_description} />
                                        <DetailRow label="Specification" value={expandedDetail.item_specification} />
                                        <DetailRow label="Quantity" value={`${expandedDetail.quantity || "—"} ${expandedDetail.uom || ""}`} />
                                        <DetailRow label="Notes" value={expandedDetail.wo_notes} />
                                      </div>
                                    </Card>

                                    <Card className="p-2.5">
                                      <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                        <Ruler className="h-3 w-3" /> Manufacturing Info
                                      </h4>
                                      <div className="space-y-1">
                                        <DetailRow label="Classification" value={expandedDetail.make_classification} />
                                        <DetailRow label="Drawing No" value={expandedDetail.drawing_no} mono />
                                        <DetailRow label="Drawing Rev" value={expandedDetail.drawing_revision} />
                                        <DetailRow label="Est. Unit Cost" value={formatAmount(expandedDetail.estimated_unit_cost)} />
                                        <DetailRow label="Est. Total Cost" value={formatAmount(expandedDetail.estimated_total_cost)} />
                                        <DetailRow label="Mfg Notes" value={expandedDetail.manufacturing_notes} />
                                        <DetailRow label="Quality Status" value={(expandedDetail.quality_status || "").replace(/_/g, " ")} />
                                      </div>
                                    </Card>

                                    <Card className="p-2.5">
                                      <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                        <Package className="h-3 w-3" /> Lifecycle & Line Items
                                      </h4>
                                      <div className="space-y-1 mb-2">
                                        <DetailRow label="Created By" value={expandedDetail.created_by_name} />
                                        <DetailRow label="Created" value={formatDate(expandedDetail.created_at)} />
                                        {expandedDetail.approved_by_name && (
                                          <>
                                            <DetailRow label="Approved By" value={expandedDetail.approved_by_name} />
                                            <DetailRow label="Approved" value={formatDate(expandedDetail.approved_at)} />
                                          </>
                                        )}
                                        {expandedDetail.released_by_name && (
                                          <>
                                            <DetailRow label="Released By" value={expandedDetail.released_by_name} />
                                            <DetailRow label="Released" value={formatDate(expandedDetail.released_at)} />
                                          </>
                                        )}
                                      </div>
                                      <Separator className="my-1.5" />
                                      <p className="text-[9px] font-semibold mb-1">Line Items ({expandedDetail.items?.length || 0})</p>
                                      {expandedDetail.items?.length > 0 ? (
                                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                                          {expandedDetail.items.map((item: any) => (
                                            <div key={item.id} className="border rounded p-1.5 bg-white/50 text-[9px]">
                                              <div className="flex justify-between items-start">
                                                <div className="font-medium">#{item.line_number}: {item.item_code || "Item"}</div>
                                                <span className="font-mono text-muted-foreground">{formatAmount(item.total_cost)}</span>
                                              </div>
                                              {item.item_description && <p className="text-muted-foreground truncate">{item.item_description}</p>}
                                              <div className="flex gap-3 mt-0.5 text-muted-foreground">
                                                <span>Qty: {item.quantity} {item.uom || ""}</span>
                                                {item.drawing_no && <span>Dwg: {item.drawing_no} R{item.drawing_revision || 0}</span>}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-[9px] text-muted-foreground">No line items</p>
                                      )}
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

                                  <Separator />
                                  <div>
                                    <h4 className="text-[10px] font-semibold mb-1.5">Document Attachments</h4>
                                    <EpcDocumentPanel
                                      projectId={selectedProjectId!}
                                      docType="WO"
                                      parentEntityId={wo.id}
                                      documentNumber={wo.wo_number}
                                      userRole={userRole}
                                      compact={false}
                                    />
                                  </div>

                                  {actions.length > 0 && (
                                    <>
                                      <Separator />
                                      <div className="flex flex-wrap gap-1.5">
                                        {actions.map((a) => (
                                          <Button key={a.key} size="sm" variant={a.variant} className="h-7 text-xs" onClick={() => openAction(wo, a)}>
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
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Work Order</DialogTitle>
              <DialogDescription>Update WO details. Only draft/approved WOs can be edited.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Drawing No</Label>
                  <Input className="h-8 text-xs" value={editForm.drawingNo} onChange={(e) => setEditForm({ ...editForm, drawingNo: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Drawing Revision</Label>
                  <Input className="h-8 text-xs" type="number" value={editForm.drawingRevision} onChange={(e) => setEditForm({ ...editForm, drawingRevision: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Estimated Unit Cost</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={editForm.estimatedUnitCost} onChange={(e) => setEditForm({ ...editForm, estimatedUnitCost: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Estimated Total Cost</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={editForm.estimatedTotalCost} onChange={(e) => setEditForm({ ...editForm, estimatedTotalCost: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Manufacturing Notes</Label>
                <Textarea className="text-xs min-h-[60px]" value={editForm.manufacturingNotes} onChange={(e) => setEditForm({ ...editForm, manufacturingNotes: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">WO Notes</Label>
                <Textarea className="text-xs min-h-[60px]" value={editForm.woNotes} onChange={(e) => setEditForm({ ...editForm, woNotes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={submitEdit} disabled={editMutation.isPending}>
                {editMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actionTarget?.action.label} — {actionTarget?.rec.wo_number}</DialogTitle>
              <DialogDescription>Confirm lifecycle action on this work order.</DialogDescription>
            </DialogHeader>
            {actionTarget?.action.needsNote && (
              <div>
                <Label className="text-xs">{actionTarget.action.noteLabel}</Label>
                <Textarea className="text-xs min-h-[80px]" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder={actionTarget.action.key === "cancel" ? "Required — explain why this WO is being cancelled" : "Optional note…"} />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
              <Button size="sm" variant={actionTarget?.action.variant || "default"} onClick={executeAction} disabled={lifecycleMutation.isPending || (actionTarget?.action.key === "cancel" && !actionNote)}>
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
