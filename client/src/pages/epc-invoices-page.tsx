import { useState, useMemo } from "react";
import { fmtDate } from "@/lib/date-format";
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
  Loader2, Search, Filter, Receipt, CheckCircle2, ShieldCheck,
  XCircle, ChevronDown, ChevronRight,
  RefreshCw, AlertTriangle, FileText, DollarSign, CreditCard, Ban,
} from "lucide-react";

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};

function userRoleLevel(role: string): number {
  return roleHierarchy[role] ?? 5;
}

type StatusType = "draft" | "approved" | "issued" | "partially_paid" | "paid" | "canceled" | "superseded";

const STATUS_COLORS: Record<StatusType, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-800",
  issued: "bg-indigo-100 text-indigo-800",
  partially_paid: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-800",
};

const STATUS_LABELS: Record<StatusType, string> = {
  draft: "Draft", approved: "Approved", issued: "Issued",
  partially_paid: "Partially Paid", paid: "Paid",
  cancelled: "Cancelled", superseded: "Superseded",
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
  needsAmount?: boolean;
};

const LIFECYCLE_ACTIONS: ActionDef[] = [
  { key: "approve", label: "Approve", icon: CheckCircle2, variant: "default", minRoleLevel: 2, statusRequired: ["draft"], needsNote: true, noteLabel: "Approval Note", noteKey: "approvalNote" },
  { key: "issue", label: "Issue Invoice", icon: ShieldCheck, variant: "default", minRoleLevel: 2, statusRequired: ["approved"], needsNote: true, noteLabel: "Issue Note", noteKey: "issueNote" },
  { key: "record-payment", label: "Record Payment", icon: CreditCard, variant: "default", minRoleLevel: 3, statusRequired: ["issued", "partially_paid"], needsNote: true, noteLabel: "Payment Note", noteKey: "paymentNote", needsAmount: true },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 3, statusRequired: ["draft", "approved", "issued"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason" },
];

function DetailRow({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className={`font-medium break-all ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

export default function EpcInvoicesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userRole = (user as any)?.role || "Employee";
  const userLevel = userRoleLevel(userRole);

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ rec: any; action: ActionDef } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { showAllProjects, setShowAllProjects, filteredProjects } = useProjectFilter(projects, selectedProjectId);
  const { data: invoices = [], isLoading, error: recordsError } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "epc-invoices"],
    queryFn: () => selectedProjectId ? fetchWithProjectAccess(`/api/projects/${selectedProjectId}/epc-invoices`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const { data: expandedDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/epc-invoices", expandedRow],
    queryFn: () => expandedRow ? fetch(`/api/epc-invoices/${expandedRow}`, { credentials: "include" }).then(r => r.json()) : Promise.resolve(null),
    enabled: !!expandedRow,
  });

  const filtered = useMemo(() => {
    let list = invoices;
    if (statusFilter !== "all") list = list.filter((inv: any) => inv.status === statusFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((inv: any) =>
        (inv.invoice_number || "").toLowerCase().includes(s) ||
        (inv.customer_name || "").toLowerCase().includes(s) ||
        (inv.br_number || "").toLowerCase().includes(s) ||
        (inv.billing_basis || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [invoices, statusFilter, searchTerm]);

  const stats = useMemo(() => {
    const totalGross = invoices.filter((i: any) => !["canceled", "superseded"].includes(i.status)).reduce((sum: number, i: any) => sum + parseFloat(i.gross_amount || "0"), 0);
    const totalPaid = invoices.reduce((sum: number, i: any) => sum + parseFloat(i.amount_paid || "0"), 0);
    const totalOutstanding = invoices.filter((i: any) => ["issued", "partially_paid"].includes(i.status)).reduce((sum: number, i: any) => sum + parseFloat(i.amount_outstanding || "0"), 0);
    return {
      total: invoices.length,
      draft: invoices.filter((i: any) => i.status === "draft").length,
      approved: invoices.filter((i: any) => i.status === "approved").length,
      issued: invoices.filter((i: any) => i.status === "issued").length,
      partiallyPaid: invoices.filter((i: any) => i.status === "partially_paid").length,
      paid: invoices.filter((i: any) => i.status === "paid").length,
      cancelled: invoices.filter((i: any) => i.status === "canceled").length,
      totalGross, totalPaid, totalOutstanding,
    };
  }, [invoices]);

  const lifecycleMutation = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: string; body: any }) => {
      const res = await apiRequest("POST", `/api/epc-invoices/${id}/${action}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "epc-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/epc-invoices", expandedRow] });
      setActionDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Action failed", variant: "destructive" });
    },
  });

  function getAvailableActions(rec: any): ActionDef[] {
    return LIFECYCLE_ACTIONS.filter((a) => {
      if (userLevel > a.minRoleLevel) return false;
      if (!a.statusRequired.includes(rec.status)) return false;
      return true;
    });
  }

  function openAction(rec: any, action: ActionDef) {
    setActionTarget({ rec, action });
    setActionNote("");
    setPaymentAmount("");
    setActionDialogOpen(true);
  }

  function executeAction() {
    if (!actionTarget) return;
    const { rec, action } = actionTarget;
    const body: any = {};
    if (action.noteKey && actionNote) body[action.noteKey] = actionNote;
    if (action.needsAmount && paymentAmount) body.paymentAmount = paymentAmount;
    lifecycleMutation.mutate({ id: rec.id, action: action.key, body });
  }

  function formatDate(d: any) {
    return fmtDate(d);
  }

  function formatAmount(amt: any, cur: string = "INR") {
    if (!amt || parseFloat(amt) === 0) return "—";
    return `${cur} ${parseFloat(amt).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  }

  function formatAmountShort(amt: any) {
    if (!amt) return "0";
    return parseFloat(amt).toLocaleString("en-IN", { minimumFractionDigits: 0 });
  }

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              EPC Invoices
            </h1>
            <p className="text-xs text-muted-foreground">Invoice lifecycle — Draft → Approved → Issued → Paid</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { if (selectedProjectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "epc-invoices"] }); }}>
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
            <Input className="h-8 text-xs pl-7" placeholder="Invoice #, customer, BR#…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="w-40">
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

        {selectedProjectId && invoices.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold">{stats.total}</p><p className="text-[9px] text-muted-foreground">Total</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-slate-600">{stats.draft}</p><p className="text-[9px] text-muted-foreground">Draft</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-blue-600">{stats.approved}</p><p className="text-[9px] text-muted-foreground">Approved</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-indigo-600">{stats.issued}</p><p className="text-[9px] text-muted-foreground">Issued</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-amber-600">{stats.partiallyPaid}</p><p className="text-[9px] text-muted-foreground">Partial</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-emerald-600">{stats.paid}</p><p className="text-[9px] text-muted-foreground">Paid</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-red-600">{stats.cancelled}</p><p className="text-[9px] text-muted-foreground">Cancelled</p></CardContent></Card>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Card className="p-2 border-blue-200 bg-blue-50/30"><CardContent className="p-0 text-center"><p className="text-sm font-bold font-mono text-blue-700">{formatAmountShort(stats.totalGross)}</p><p className="text-[9px] text-muted-foreground">Total Invoiced (Active)</p></CardContent></Card>
              <Card className="p-2 border-emerald-200 bg-emerald-50/30"><CardContent className="p-0 text-center"><p className="text-sm font-bold font-mono text-emerald-700">{formatAmountShort(stats.totalPaid)}</p><p className="text-[9px] text-muted-foreground">Total Collected</p></CardContent></Card>
              <Card className="p-2 border-amber-200 bg-amber-50/30"><CardContent className="p-0 text-center"><p className="text-sm font-bold font-mono text-amber-700">{formatAmountShort(stats.totalOutstanding)}</p><p className="text-[9px] text-muted-foreground">Outstanding</p></CardContent></Card>
            </div>
          </div>
        )}

        {!selectedProjectId ? (
          <Card className="p-8 text-center">
            <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Select a project to view EPC Invoices</p>
          </Card>
        ) : isProjectAccessDenied(recordsError) ? (
          <ProjectAccessDenied />
        ) : isLoading ? (
          <div className="py-12 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{invoices.length === 0 ? "No invoices created for this project yet." : "No invoices match the current filters."}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Invoices are created from the Billing Readiness layer in the Execution Control Dashboard.</p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] w-8"></TableHead>
                  <TableHead className="text-[10px]">Invoice #</TableHead>
                  <TableHead className="text-[10px]">Customer</TableHead>
                  <TableHead className="text-[10px]">Basis</TableHead>
                  <TableHead className="text-[10px] text-right">Gross</TableHead>
                  <TableHead className="text-[10px] text-right">Paid</TableHead>
                  <TableHead className="text-[10px] text-right">Outstanding</TableHead>
                  <TableHead className="text-[10px] text-center">Status</TableHead>
                  <TableHead className="text-[10px]">Date</TableHead>
                  <TableHead className="text-[10px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv: any) => {
                  const isExpanded = expandedRow === inv.id;
                  const actions = getAvailableActions(inv);
                  return (
                    <>
                      <TableRow key={inv.id} className={`cursor-pointer hover:bg-muted/40 ${isExpanded ? "bg-muted/30" : ""}`} onClick={() => setExpandedRow(isExpanded ? null : inv.id)}>
                        <TableCell className="py-1.5">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </TableCell>
                        <TableCell className="py-1.5 font-mono text-[10px] font-medium">{inv.invoice_number}</TableCell>
                        <TableCell className="py-1.5 text-[10px] max-w-[140px] truncate">{inv.customer_name || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[10px]">{inv.billing_basis || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[10px] text-right font-mono">{formatAmount(inv.gross_amount, inv.currency)}</TableCell>
                        <TableCell className="py-1.5 text-[10px] text-right font-mono text-emerald-700">{parseFloat(inv.amount_paid || "0") > 0 ? formatAmount(inv.amount_paid, inv.currency) : "—"}</TableCell>
                        <TableCell className="py-1.5 text-[10px] text-right font-mono text-amber-700">{parseFloat(inv.amount_outstanding || "0") > 0 ? formatAmount(inv.amount_outstanding, inv.currency) : "—"}</TableCell>
                        <TableCell className="py-1.5 text-center">
                          <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${STATUS_COLORS[inv.status as StatusType] || ""}`}>
                            {STATUS_LABELS[inv.status as StatusType] || inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 text-[10px] text-muted-foreground">{formatDate(inv.invoice_date)}</TableCell>
                        <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {actions.slice(0, 2).map((a) => (
                              <Button key={a.key} size="sm" variant={a.variant} className="h-6 px-1.5 text-[9px]" onClick={() => openAction(inv, a)}>
                                <a.icon className="h-3 w-3 mr-0.5" /> {a.label}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${inv.id}-detail`}>
                          <TableCell colSpan={10} className="p-0 bg-muted/10">
                            <div className="p-3 space-y-3">
                              {detailLoading ? (
                                <div className="py-4 text-center"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>
                              ) : expandedDetail ? (
                                <>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card className="p-2.5">
                                      <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                        <FileText className="h-3 w-3" /> Invoice Details
                                      </h4>
                                      <div className="space-y-1">
                                        <DetailRow label="Invoice Number" value={expandedDetail.invoice_number} mono />
                                        <DetailRow label="Status" value={STATUS_LABELS[expandedDetail.status as StatusType] || expandedDetail.status} />
                                        <DetailRow label="Invoice Date" value={formatDate(expandedDetail.invoice_date)} />
                                        <DetailRow label="Due Date" value={formatDate(expandedDetail.due_date)} />
                                        <DetailRow label="Billing Basis" value={expandedDetail.billing_basis} />
                                        <DetailRow label="Milestone" value={expandedDetail.milestone_name} />
                                        <DetailRow label="Source Type" value={expandedDetail.source_type} />
                                        <DetailRow label="Payment Terms" value={expandedDetail.payment_terms} />
                                        <DetailRow label="Notes" value={expandedDetail.invoice_notes} />
                                      </div>
                                    </Card>

                                    <Card className="p-2.5">
                                      <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                        <DollarSign className="h-3 w-3" /> Financial Summary
                                      </h4>
                                      <div className="space-y-1">
                                        <DetailRow label="Item" value={<span className="text-blue-600">{expandedDetail.item_code || expandedDetail.item_description}</span>} />
                                        <DetailRow label="Quantity" value={expandedDetail.quantity ? `${expandedDetail.quantity} ${expandedDetail.uom || ""}` : null} />
                                        <DetailRow label="Unit Price" value={formatAmount(expandedDetail.unit_price)} />
                                        <DetailRow label="Total Amount" value={formatAmount(expandedDetail.total_amount)} />
                                        {expandedDetail.discount_amount && parseFloat(expandedDetail.discount_amount) > 0 && (
                                          <DetailRow label="Discount" value={`-${formatAmount(expandedDetail.discount_amount)}`} />
                                        )}
                                        {expandedDetail.tax_applicable && (
                                          <>
                                            <DetailRow label="Tax %" value={expandedDetail.tax_percentage ? `${expandedDetail.tax_percentage}%` : null} />
                                            <DetailRow label="Tax Amount" value={formatAmount(expandedDetail.tax_amount)} />
                                          </>
                                        )}
                                        <Separator className="my-1" />
                                        <DetailRow label="Gross Amount" value={formatAmount(expandedDetail.gross_amount)} />
                                        <DetailRow label="Amount Paid" value={formatAmount(expandedDetail.amount_paid)} />
                                        <DetailRow label="Outstanding" value={formatAmount(expandedDetail.amount_outstanding)} />
                                      </div>
                                    </Card>

                                    <Card className="p-2.5">
                                      <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                        <CreditCard className="h-3 w-3" /> Customer & Lifecycle
                                      </h4>
                                      <div className="space-y-1">
                                        <DetailRow label="Customer" value={expandedDetail.customer_name} />
                                        <DetailRow label="Customer GST" value={expandedDetail.customer_gst} mono />
                                        <DetailRow label="Customer PO" value={expandedDetail.customer_po_number} mono />
                                        <DetailRow label="BR Number" value={expandedDetail.br_number} mono />
                                        <DetailRow label="PO Number" value={expandedDetail.po_number} mono />
                                        <DetailRow label="WO Number" value={expandedDetail.wo_number} mono />
                                        <Separator className="my-1" />
                                        <DetailRow label="Created By" value={expandedDetail.created_by_name} />
                                        <DetailRow label="Created" value={formatDate(expandedDetail.created_at)} />
                                        {expandedDetail.approved_by_name && (
                                          <DetailRow label="Approved By" value={expandedDetail.approved_by_name} />
                                        )}
                                        {expandedDetail.issued_by_name && (
                                          <DetailRow label="Issued By" value={expandedDetail.issued_by_name} />
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

                                  <Separator />
                                  <div>
                                    <h4 className="text-[10px] font-semibold mb-1.5">Document Attachments</h4>
                                    <EpcDocumentPanel
                                      projectId={selectedProjectId!}
                                      docType="INV"
                                      parentEntityId={inv.id}
                                      documentNumber={inv.invoice_number}
                                      userRole={userRole}
                                      compact={false}
                                    />
                                  </div>

                                  {actions.length > 0 && (
                                    <>
                                      <Separator />
                                      <div className="flex flex-wrap gap-1.5">
                                        {actions.map((a) => (
                                          <Button key={a.key} size="sm" variant={a.variant} className="h-7 text-xs" onClick={() => openAction(inv, a)}>
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

        <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actionTarget?.action.label} — {actionTarget?.rec.invoice_number}</DialogTitle>
              <DialogDescription>
                {actionTarget?.action.key === "record-payment" ? (
                  <>Record a payment against this invoice. Outstanding: {formatAmount(actionTarget?.rec.amount_outstanding)}</>
                ) : (
                  "Confirm lifecycle action on this invoice."
                )}
              </DialogDescription>
            </DialogHeader>
            {actionTarget?.action.needsAmount && (
              <div>
                <Label className="text-xs">Payment Amount (INR)</Label>
                <Input className="h-8 text-xs font-mono" type="number" step="0.01" min="0.01" max={actionTarget?.rec.amount_outstanding || undefined} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Enter payment amount" />
                {actionTarget?.rec.amount_outstanding && (
                  <p className="text-[9px] text-muted-foreground mt-1">
                    Outstanding: {formatAmount(actionTarget.rec.amount_outstanding)} | Paid: {formatAmount(actionTarget.rec.amount_paid)}
                  </p>
                )}
              </div>
            )}
            {actionTarget?.action.needsNote && (
              <div>
                <Label className="text-xs">{actionTarget.action.noteLabel}</Label>
                <Textarea className="text-xs min-h-[80px]" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder={actionTarget.action.key === "cancel" ? "Required — explain why this invoice is being cancelled" : "Optional note…"} />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                variant={actionTarget?.action.variant || "default"}
                onClick={executeAction}
                disabled={
                  lifecycleMutation.isPending ||
                  (actionTarget?.action.key === "cancel" && !actionNote) ||
                  (actionTarget?.action.needsAmount && (!paymentAmount || parseFloat(paymentAmount) <= 0))
                }
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
