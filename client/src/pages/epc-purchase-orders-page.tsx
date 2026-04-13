import { useState, useMemo } from "react";
import { useProjectFilter } from "@/hooks/use-project-filter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, fetchWithProjectAccess } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import EpcDocumentPanel from "@/components/epc-document-panel";
import { ItemCodeBadge } from "@/components/item-code-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Loader2, Search, Filter, ShoppingCart, Edit, CheckCircle2, ShieldCheck,
  XCircle, RotateCcw, ChevronDown, ChevronRight,
  RefreshCw, AlertTriangle, FileText, Package, Truck,
} from "lucide-react";

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};

function userRoleLevel(role: string): number {
  return roleHierarchy[role] ?? 5;
}

type StatusType = "draft" | "approved" | "issued" | "canceled" | "superseded";

const STATUS_COLORS: Record<StatusType, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-800",
  issued: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-800",
};

const STATUS_LABELS: Record<StatusType, string> = {
  draft: "Draft", approved: "Approved", issued: "Issued",
  cancelled: "Cancelled", superseded: "Superseded",
};

const QUALITY_STATUS_COLORS: Record<string, string> = {
  pending_inspection: "bg-amber-50 text-amber-700 border-amber-200",
  inspection_passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inspection_failed: "bg-red-50 text-red-700 border-red-200",
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
  { key: "approve", label: "Approve", icon: CheckCircle2, variant: "default", minRoleLevel: 3, statusRequired: ["draft"], needsNote: true, noteLabel: "Approval Note", noteKey: "approvalNote" },
  { key: "issue", label: "Issue PO", icon: ShieldCheck, variant: "default", minRoleLevel: 2, statusRequired: ["approved"], needsNote: true, noteLabel: "Issue Note", noteKey: "issueNote" },
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

export default function EpcPurchaseOrdersPage() {
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

  const [editForm, setEditForm] = useState({ vendorName: "", paymentTerms: "", deliveryTerms: "", poNotes: "", totalAmount: "" });

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { showAllProjects, setShowAllProjects, filteredProjects } = useProjectFilter(projects, selectedProjectId);
  const { data: purchaseOrders = [], isLoading, error: recordsError } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "epc-purchase-orders"],
    queryFn: () => selectedProjectId ? fetchWithProjectAccess(`/api/projects/${selectedProjectId}/epc-purchase-orders`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const { data: expandedDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/epc-purchase-orders", expandedRow],
    queryFn: () => expandedRow ? fetch(`/api/epc-purchase-orders/${expandedRow}`, { credentials: "include" }).then(r => r.json()) : Promise.resolve(null),
    enabled: !!expandedRow,
  });

  const filtered = useMemo(() => {
    let list = purchaseOrders;
    if (statusFilter !== "all") list = list.filter((po: any) => po.status === statusFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((po: any) =>
        (po.po_number || "").toLowerCase().includes(s) ||
        (po.vendor_name || "").toLowerCase().includes(s) ||
        (po.vendor_display_name || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [purchaseOrders, statusFilter, searchTerm]);

  const stats = useMemo(() => {
    return {
      total: purchaseOrders.length,
      draft: purchaseOrders.filter((po: any) => po.status === "draft").length,
      approved: purchaseOrders.filter((po: any) => po.status === "approved").length,
      issued: purchaseOrders.filter((po: any) => po.status === "issued").length,
      cancelled: purchaseOrders.filter((po: any) => po.status === "canceled").length,
    };
  }, [purchaseOrders]);

  const lifecycleMutation = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: string; body: any }) => {
      const res = await apiRequest("POST", `/api/epc-purchase-orders/${id}/${action}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "epc-purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-purchase-orders", expandedRow] });
      setActionDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Action failed", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const res = await apiRequest("PATCH", `/api/epc-purchase-orders/${id}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Updated", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "epc-purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-purchase-orders", expandedRow] });
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
      if (a.extraCheck && !a.extraCheck(rec)) return false;
      return true;
    });
  }

  function openEdit(rec: any) {
    setEditTarget(rec);
    setEditForm({
      vendorName: rec.vendor_name || "",
      paymentTerms: rec.payment_terms || "",
      deliveryTerms: rec.delivery_terms || "",
      poNotes: rec.po_notes || "",
      totalAmount: rec.total_amount || "",
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
    editMutation.mutate({ id: editTarget.id, body: editForm });
  }

  function formatDate(d: any) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatAmount(amt: any, cur: string = "INR") {
    if (!amt) return "—";
    return `${cur} ${parseFloat(amt).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  }

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              EPC Purchase Orders
            </h1>
            <p className="text-xs text-muted-foreground">BOM-driven purchase order lifecycle — Draft → Approved → Issued</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { if (selectedProjectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "epc-purchase-orders"] }); }}>
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
            <Input className="h-8 text-xs pl-7" placeholder="PO number, vendor…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
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

        {selectedProjectId && purchaseOrders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold">{stats.total}</p><p className="text-[9px] text-muted-foreground">Total POs</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-slate-600">{stats.draft}</p><p className="text-[9px] text-muted-foreground">Draft</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-blue-600">{stats.approved}</p><p className="text-[9px] text-muted-foreground">Approved</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-emerald-600">{stats.issued}</p><p className="text-[9px] text-muted-foreground">Issued</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-red-600">{stats.cancelled}</p><p className="text-[9px] text-muted-foreground">Cancelled</p></CardContent></Card>
          </div>
        )}

        {!selectedProjectId ? (
          <Card className="p-8 text-center">
            <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Select a project to view EPC Purchase Orders</p>
          </Card>
        ) : isProjectAccessDenied(recordsError) ? (
          <ProjectAccessDenied />
        ) : isLoading ? (
          <div className="py-12 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{purchaseOrders.length === 0 ? "No purchase orders created for this project yet." : "No purchase orders match the current filters."}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Purchase orders are created from the Execution Control Dashboard pipeline.</p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] w-8"></TableHead>
                  <TableHead className="text-[10px]">PO Number</TableHead>
                  <TableHead className="text-[10px]">Vendor</TableHead>
                  <TableHead className="text-[10px] text-right">Amount</TableHead>
                  <TableHead className="text-[10px] text-center">Status</TableHead>
                  <TableHead className="text-[10px] text-center">Quality</TableHead>
                  <TableHead className="text-[10px]">Created By</TableHead>
                  <TableHead className="text-[10px]">Created</TableHead>
                  <TableHead className="text-[10px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((po: any) => {
                  const isExpanded = expandedRow === po.id;
                  const actions = getAvailableActions(po);
                  const canEdit = userLevel <= 3 && !["canceled", "superseded", "issued"].includes(po.status);
                  return (
                    <>
                      <TableRow key={po.id} className={`cursor-pointer hover:bg-muted/40 ${isExpanded ? "bg-muted/30" : ""}`} onClick={() => setExpandedRow(isExpanded ? null : po.id)}>
                        <TableCell className="py-1.5">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </TableCell>
                        <TableCell className="py-1.5 font-mono text-[10px] font-medium">{po.po_number}</TableCell>
                        <TableCell className="py-1.5 text-[10px]">{po.vendor_display_name || po.vendor_name || "TBD"}</TableCell>
                        <TableCell className="py-1.5 text-[10px] text-right font-mono">{formatAmount(po.total_amount, po.currency)}</TableCell>
                        <TableCell className="py-1.5 text-center">
                          <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${STATUS_COLORS[po.status as StatusType] || ""}`}>
                            {STATUS_LABELS[po.status as StatusType] || po.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 text-center">
                          {po.quality_status && (
                            <Badge variant="outline" className={`text-[8px] px-1 py-0 border ${QUALITY_STATUS_COLORS[po.quality_status] || ""}`}>
                              {(po.quality_status || "").replace(/_/g, " ")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 text-[10px] text-muted-foreground">{po.created_by_name || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[10px] text-muted-foreground">{formatDate(po.created_at)}</TableCell>
                        <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (
                              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[9px]" onClick={() => openEdit(po)}>
                                <Edit className="h-3 w-3 mr-0.5" /> Edit
                              </Button>
                            )}
                            {actions.slice(0, 2).map((a) => (
                              <Button key={a.key} size="sm" variant={a.variant} className="h-6 px-1.5 text-[9px]" onClick={() => openAction(po, a)}>
                                <a.icon className="h-3 w-3 mr-0.5" /> {a.label}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${po.id}-detail`}>
                          <TableCell colSpan={9} className="p-0 bg-muted/10">
                            <div className="p-3 space-y-3">
                              {detailLoading ? (
                                <div className="py-4 text-center"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>
                              ) : expandedDetail ? (
                                <>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card className="p-2.5">
                                      <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                        <FileText className="h-3 w-3" /> PO Details
                                      </h4>
                                      <div className="space-y-1">
                                        <DetailRow label="PO Number" value={expandedDetail.po_number} mono />
                                        <DetailRow label="Status" value={STATUS_LABELS[expandedDetail.status as StatusType] || expandedDetail.status} />
                                        <Separator className="my-1" />
                                        <DetailRow label="Item Code" value={<ItemCodeBadge code={expandedDetail.item_code} />} />
                                        <DetailRow label="Description" value={<span className="text-blue-600">{expandedDetail.item_description}</span>} />
                                        <DetailRow label="UOM" value={expandedDetail.item_uom} />
                                        <DetailRow label="Make / Buy" value={expandedDetail.item_make_or_buy} />
                                        {expandedDetail.item_specification && <DetailRow label="Specification" value={expandedDetail.item_specification} />}
                                        {expandedDetail.item_drawing_no && <DetailRow label="Drawing No" value={expandedDetail.item_drawing_no} mono />}
                                        <Separator className="my-1" />
                                        <DetailRow label="Currency" value={expandedDetail.currency} />
                                        <DetailRow label="Total Amount" value={formatAmount(expandedDetail.total_amount, expandedDetail.currency)} />
                                        <DetailRow label="Payment Terms" value={expandedDetail.payment_terms} />
                                        <DetailRow label="Delivery Terms" value={expandedDetail.delivery_terms} />
                                        <DetailRow label="Notes" value={expandedDetail.po_notes} />
                                      </div>
                                    </Card>

                                    <Card className="p-2.5">
                                      <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                        <Truck className="h-3 w-3" /> Vendor & Source
                                      </h4>
                                      <div className="space-y-1">
                                        <DetailRow label="Vendor" value={expandedDetail.vendor_display_name || expandedDetail.vendor_name} />
                                        <DetailRow label="Quality Status" value={(expandedDetail.quality_status || "").replace(/_/g, " ")} />
                                        <DetailRow label="Created By" value={expandedDetail.created_by_name} />
                                        <DetailRow label="Created" value={formatDate(expandedDetail.created_at)} />
                                        {expandedDetail.approved_by_name && (
                                          <>
                                            <DetailRow label="Approved By" value={expandedDetail.approved_by_name} />
                                            <DetailRow label="Approved" value={formatDate(expandedDetail.approved_at)} />
                                          </>
                                        )}
                                        {expandedDetail.issued_by_name && (
                                          <>
                                            <DetailRow label="Issued By" value={expandedDetail.issued_by_name} />
                                            <DetailRow label="Issued" value={formatDate(expandedDetail.issued_at)} />
                                          </>
                                        )}
                                        {expandedDetail.cancelled_by_name && (
                                          <>
                                            <Separator className="my-1" />
                                            <DetailRow label="Cancelled By" value={<span className="text-red-600">{expandedDetail.cancelled_by_name}</span>} />
                                            <DetailRow label="Cancelled" value={formatDate(expandedDetail.cancelled_at)} />
                                          </>
                                        )}
                                      </div>
                                    </Card>

                                    <Card className="p-2.5">
                                      <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                        <Package className="h-3 w-3" /> Line Items ({expandedDetail.items?.length || 0})
                                      </h4>
                                      {expandedDetail.items?.length > 0 ? (
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                          {expandedDetail.items.map((item: any, idx: number) => (
                                            <div key={item.id} className="border rounded p-1.5 bg-white/50 text-[9px]">
                                              <div className="flex justify-between items-start">
                                                <div className="font-medium">#{item.line_number}: {item.item_code || item.item_description || "Item"}</div>
                                                <span className="font-mono text-muted-foreground">{formatAmount(item.total_cost)}</span>
                                              </div>
                                              {item.item_description && <p className="text-blue-600 font-medium mt-0.5 truncate">{item.item_description}</p>}
                                              <div className="flex gap-3 mt-0.5 text-muted-foreground">
                                                <span>Qty: {item.quantity} {item.uom || ""}</span>
                                                {item.unit_cost && <span>Unit: {formatAmount(item.unit_cost)}</span>}
                                                {item.drawing_no && <span>Dwg: {item.drawing_no}</span>}
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
                                      docType="PO"
                                      parentEntityId={po.id}
                                      documentNumber={po.po_number}
                                      userRole={userRole}
                                      compact={false}
                                    />
                                  </div>

                                  {actions.length > 0 && (
                                    <>
                                      <Separator />
                                      <div className="flex flex-wrap gap-1.5">
                                        {actions.map((a) => (
                                          <Button key={a.key} size="sm" variant={a.variant} className="h-7 text-xs" onClick={() => openAction(po, a)}>
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
        )}

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Purchase Order</DialogTitle>
              <DialogDescription>Update PO details. Only draft/approved POs can be edited.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Vendor Name</Label>
                <Input className="h-8 text-xs" value={editForm.vendorName} onChange={(e) => setEditForm({ ...editForm, vendorName: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Total Amount</Label>
                <Input className="h-8 text-xs" type="number" step="0.01" value={editForm.totalAmount} onChange={(e) => setEditForm({ ...editForm, totalAmount: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Payment Terms</Label>
                <Textarea className="text-xs min-h-[60px]" value={editForm.paymentTerms} onChange={(e) => setEditForm({ ...editForm, paymentTerms: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Delivery Terms</Label>
                <Textarea className="text-xs min-h-[60px]" value={editForm.deliveryTerms} onChange={(e) => setEditForm({ ...editForm, deliveryTerms: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea className="text-xs min-h-[60px]" value={editForm.poNotes} onChange={(e) => setEditForm({ ...editForm, poNotes: e.target.value })} />
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
              <DialogTitle>{actionTarget?.action.label} — {actionTarget?.rec.po_number}</DialogTitle>
              <DialogDescription>Confirm lifecycle action on this purchase order.</DialogDescription>
            </DialogHeader>
            {actionTarget?.action.needsNote && (
              <div>
                <Label className="text-xs">{actionTarget.action.noteLabel}</Label>
                <Textarea className="text-xs min-h-[80px]" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder={actionTarget.action.key === "cancel" ? "Required — explain why this PO is being cancelled" : "Optional note…"} />
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
