import { useState, useMemo } from "react";
import { getProjectDisplayName } from "@/lib/project-utils";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ItemCodeBadge } from "@/components/item-code-badge";
import { ProjectAccessDenied, isProjectAccessDenied } from "@/components/project-access-denied";
import {
  Loader2, Search, Filter, FileText, CheckCircle2, ShieldCheck,
  XCircle, ChevronDown, ChevronRight, RefreshCw, AlertTriangle,
  ClipboardList, Send, UserCheck, Rocket, Package, Factory, Ban,
} from "lucide-react";

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};

type StatusType = "draft" | "under_review" | "released" | "canceled" | "superseded";

const STATUS_COLORS: Record<StatusType, string> = {
  draft: "bg-slate-100 text-slate-700",
  under_review: "bg-amber-100 text-amber-800",
  released: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-800",
};

const STATUS_LABELS: Record<StatusType, string> = {
  draft: "Draft", under_review: "Under Review", released: "Released",
  cancelled: "Cancelled", superseded: "Superseded",
};

const PLANNING_TYPE_COLORS: Record<string, string> = {
  procurement: "bg-blue-100 text-blue-800",
  production: "bg-purple-100 text-purple-800",
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
  noteRequired?: boolean;
};

const LIFECYCLE_ACTIONS: ActionDef[] = [
  { key: "submit-for-review", label: "Submit for Review", icon: Send, variant: "default", minRoleLevel: 3, statusRequired: ["draft"] },
  { key: "review", label: "Mark Reviewed", icon: UserCheck, variant: "default", minRoleLevel: 3, statusRequired: ["under_review"], needsNote: true, noteLabel: "Review Note", noteKey: "reviewNote" },
  { key: "release", label: "Release", icon: Rocket, variant: "default", minRoleLevel: 2, statusRequired: ["under_review"], needsNote: true, noteLabel: "Release Note", noteKey: "releaseNote" },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 3, statusRequired: ["draft", "under_review"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason", noteRequired: true },
];

function DetailRow({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className={`font-medium break-all ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

export default function EpcPlanningControlPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userRole = (user as any)?.role || "Employee";
  const userLevel = roleHierarchy[userRole] ?? 5;
  const userId = (user as any)?.id;

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ rec: any; action: ActionDef } | null>(null);
  const [actionNote, setActionNote] = useState("");

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { showAllProjects, setShowAllProjects, filteredProjects } = useProjectFilter(projects, selectedProjectId);
  const { data: records = [], isLoading, error: recordsError } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "planning-records"],
    queryFn: () => selectedProjectId ? fetchWithProjectAccess(`/api/projects/${selectedProjectId}/planning-records`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const { data: expandedDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/planning-records", expandedRow],
    queryFn: () => expandedRow ? fetch(`/api/planning-records/${expandedRow}`, { credentials: "include" }).then(r => r.json()) : Promise.resolve(null),
    enabled: !!expandedRow,
  });

  const filtered = useMemo(() => {
    let list = records;
    if (statusFilter !== "all") list = list.filter((r: any) => r.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((r: any) => r.planning_type === typeFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((r: any) =>
        (r.planning_number || "").toLowerCase().includes(s) ||
        (r.item_code || "").toLowerCase().includes(s) ||
        (r.item_description || "").toLowerCase().includes(s) ||
        (r.notes || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [records, statusFilter, typeFilter, searchTerm]);

  const stats = useMemo(() => ({
    total: records.length,
    draft: records.filter((r: any) => r.status === "draft").length,
    underReview: records.filter((r: any) => r.status === "under_review").length,
    released: records.filter((r: any) => r.status === "released").length,
    cancelled: records.filter((r: any) => r.status === "canceled").length,
    procurement: records.filter((r: any) => r.planning_type === "procurement" && r.status !== "canceled" && r.status !== "superseded").length,
    production: records.filter((r: any) => r.planning_type === "production" && r.status !== "canceled" && r.status !== "superseded").length,
  }), [records]);

  const lifecycleMutation = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: string; body: any }) => {
      const res = await apiRequest("POST", `/api/planning-records/${id}/${action}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "planning-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planning-records", expandedRow] });
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
      if (a.key === "review" && rec.created_by === userId) return false;
      if (a.key === "release" && (rec.reviewed_by === userId || rec.created_by === userId)) return false;
      if (a.key === "release" && !rec.reviewed_by) return false;
      return true;
    });
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

  function formatDate(d: any) {
    return fmtDate(d);
  }

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              EPC Planning Control
            </h1>
            <p className="text-xs text-muted-foreground">Item planning lifecycle — Draft → Under Review → Released</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { if (selectedProjectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "planning-records"] }); }}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-52">
            <Label className="text-[10px]">Project</Label>
            <Select value={selectedProjectId ? String(selectedProjectId) : ""} onValueChange={(v) => { setSelectedProjectId(parseInt(v)); setExpandedRow(null); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select project…" /></SelectTrigger>
              <SelectContent>
                {filteredProjects.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)} className="text-xs">{getProjectDisplayName(p)}</SelectItem>
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
            <Input className="h-8 text-xs pl-7" placeholder="Planning #, item code…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="w-36">
            <Label className="text-[10px]">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <Label className="text-[10px]">Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Types</SelectItem>
                <SelectItem value="procurement" className="text-xs">Procurement</SelectItem>
                <SelectItem value="production" className="text-xs">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedProjectId && records.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold">{stats.total}</p><p className="text-[9px] text-muted-foreground">Total</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-slate-600">{stats.draft}</p><p className="text-[9px] text-muted-foreground">Draft</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-amber-600">{stats.underReview}</p><p className="text-[9px] text-muted-foreground">Under Review</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-emerald-600">{stats.released}</p><p className="text-[9px] text-muted-foreground">Released</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-red-600">{stats.cancelled}</p><p className="text-[9px] text-muted-foreground">Cancelled</p></CardContent></Card>
            <Card className="p-2 border-blue-200 bg-blue-50/30"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-blue-600">{stats.procurement}</p><p className="text-[9px] text-muted-foreground">Buy Items</p></CardContent></Card>
            <Card className="p-2 border-purple-200 bg-purple-50/30"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-purple-600">{stats.production}</p><p className="text-[9px] text-muted-foreground">Make Items</p></CardContent></Card>
          </div>
        )}

        {!selectedProjectId ? (
          <Card className="p-8 text-center">
            <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Select a project to view planning records</p>
          </Card>
        ) : isProjectAccessDenied(recordsError) ? (
          <ProjectAccessDenied />
        ) : isLoading ? (
          <div className="py-12 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{records.length === 0 ? "No planning records exist for this project." : "No records match current filters."}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Planning records are auto-created when items are added to a project.</p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] w-8"></TableHead>
                  <TableHead className="text-[10px]">Planning #</TableHead>
                  <TableHead className="text-[10px]">Item Code</TableHead>
                  <TableHead className="text-[10px]">Description</TableHead>
                  <TableHead className="text-[10px] text-center">Type</TableHead>
                  <TableHead className="text-[10px] text-center">Status</TableHead>
                  <TableHead className="text-[10px]">Assigned To</TableHead>
                  <TableHead className="text-[10px]">Created</TableHead>
                  <TableHead className="text-[10px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((rec: any) => {
                  const isExpanded = expandedRow === rec.id;
                  const actions = getAvailableActions(rec);
                  return (
                    <>
                      <TableRow key={rec.id} className={`cursor-pointer hover:bg-muted/40 ${isExpanded ? "bg-muted/30" : ""}`} onClick={() => setExpandedRow(isExpanded ? null : rec.id)}>
                        <TableCell className="py-1.5">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </TableCell>
                        <TableCell className="py-1.5 font-mono text-[10px] font-medium">{rec.planning_number || `PLN-${rec.id}`}</TableCell>
                        <TableCell className="py-1.5"><ItemCodeBadge code={rec.item_code} prop1Label={rec.item_property_1_label} /></TableCell>
                        <TableCell className="py-1.5 text-[10px] max-w-[180px] truncate text-blue-600 font-medium">{rec.item_description || "—"}</TableCell>
                        <TableCell className="py-1.5 text-center">
                          <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${PLANNING_TYPE_COLORS[rec.planning_type] || ""}`}>
                            {rec.planning_type === "procurement" ? "Buy" : "Make"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 text-center">
                          <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${STATUS_COLORS[rec.status as StatusType] || ""}`}>
                            {STATUS_LABELS[rec.status as StatusType] || rec.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 text-[10px]">{rec.assigned_to_name || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[10px] text-muted-foreground">{formatDate(rec.created_at)}</TableCell>
                        <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {actions.slice(0, 2).map((a) => (
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
                                        <FileText className="h-3 w-3" /> Planning Details
                                      </h4>
                                      <div className="space-y-1">
                                        <DetailRow label="Planning Number" value={expandedDetail.planning_number} mono />
                                        <DetailRow label="Status" value={STATUS_LABELS[expandedDetail.status as StatusType] || expandedDetail.status} />
                                        <DetailRow label="Planning Type" value={expandedDetail.planning_type === "procurement" ? "Procurement (Buy)" : "Production (Make)"} />
                                        <DetailRow label="Classification" value={expandedDetail.classification_snapshot} />
                                        <DetailRow label="Quantity" value={expandedDetail.quantity} />
                                        <DetailRow label="Source" value={expandedDetail.source} />
                                        <DetailRow label="Notes" value={expandedDetail.notes} />
                                      </div>
                                    </Card>

                                    <Card className="p-2.5">
                                      <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                        <Package className="h-3 w-3" /> Item Information
                                      </h4>
                                      <div className="space-y-1">
                                        <DetailRow label="Item Code" value={<ItemCodeBadge code={expandedDetail.item_code} prop1Label={expandedDetail.item_property_1_label} />} />
                                        <DetailRow label="Description" value={<span className="text-blue-600">{expandedDetail.item_description}</span>} />
                                        {(expandedDetail.product_p1_label || expandedDetail.product_p2_label || expandedDetail.product_p3) && (
                                          <div className="flex items-start gap-2 text-[10px]">
                                            <span className="text-muted-foreground w-32 shrink-0"></span>
                                            <div
                                              className="text-[12px] text-blue-600 font-bold leading-snug truncate"
                                              title={[expandedDetail.product_p1_label, expandedDetail.product_p2_label, expandedDetail.product_p3].filter(Boolean).join(' ')}
                                            >
                                              {[expandedDetail.product_p1_label, expandedDetail.product_p2_label, expandedDetail.product_p3].filter(Boolean).join(' ')}
                                            </div>
                                          </div>
                                        )}
                                        <DetailRow label="UOM" value={expandedDetail.item_uom} />
                                        <DetailRow label="Make / Buy" value={expandedDetail.item_make_or_buy} />
                                        {expandedDetail.item_specification && (
                                          <DetailRow label="Specification" value={expandedDetail.item_specification} />
                                        )}
                                        {expandedDetail.item_drawing_no && (
                                          <DetailRow label="Drawing No" value={expandedDetail.item_drawing_no} mono />
                                        )}
                                        {expandedDetail.item_standard_cost && (
                                          <DetailRow label="Std Cost" value={`₹ ${parseFloat(expandedDetail.item_standard_cost).toLocaleString()}`} />
                                        )}
                                        {expandedDetail.source_bom_header_id && (
                                          <>
                                            <Separator className="my-1" />
                                            <DetailRow label="Source BOM ID" value={expandedDetail.source_bom_header_id} />
                                          </>
                                        )}
                                        {expandedDetail.source_bom_line_id && (
                                          <DetailRow label="Source BOM Line" value={expandedDetail.source_bom_line_id} />
                                        )}
                                        {expandedDetail.parent_project_item_id && (
                                          <DetailRow label="Parent Item ID" value={expandedDetail.parent_project_item_id} />
                                        )}
                                      </div>
                                    </Card>

                                    <Card className="p-2.5">
                                      <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                                        <UserCheck className="h-3 w-3" /> Lifecycle & Audit
                                      </h4>
                                      <div className="space-y-1">
                                        <DetailRow label="Created By" value={expandedDetail.created_by_name} />
                                        <DetailRow label="Created" value={formatDate(expandedDetail.created_at)} />
                                        <DetailRow label="Assigned To" value={expandedDetail.assigned_to_name} />
                                        {expandedDetail.reviewed_by_name && (
                                          <>
                                            <Separator className="my-1" />
                                            <DetailRow label="Reviewed By" value={expandedDetail.reviewed_by_name} />
                                            <DetailRow label="Reviewed" value={formatDate(expandedDetail.reviewed_at)} />
                                            {expandedDetail.review_note && <DetailRow label="Review Note" value={expandedDetail.review_note} />}
                                          </>
                                        )}
                                        {expandedDetail.released_by_name && (
                                          <>
                                            <Separator className="my-1" />
                                            <DetailRow label="Released By" value={expandedDetail.released_by_name} />
                                            <DetailRow label="Released" value={formatDate(expandedDetail.released_at)} />
                                            {expandedDetail.release_note && <DetailRow label="Release Note" value={expandedDetail.release_note} />}
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

                                  {expandedDetail.status === "released" && (
                                    <div className="flex items-start gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-[10px]">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
                                      <div>
                                        <span className="font-medium text-emerald-700">Released —</span>{" "}
                                        <span className="text-emerald-600">
                                          {expandedDetail.planning_type === "procurement"
                                            ? "A Procurement Execution record has been auto-created for this item."
                                            : "A Production Execution record has been auto-created for this item."}
                                        </span>
                                      </div>
                                    </div>
                                  )}

                                  <Separator />
                                  <div>
                                    <h4 className="text-[10px] font-semibold mb-1.5">Document Attachments</h4>
                                    <EpcDocumentPanel
                                      projectId={selectedProjectId!}
                                      docType="PLN"
                                      parentEntityId={rec.id}
                                      documentNumber={rec.planning_number || `PLN-${rec.id}`}
                                      userRole={userRole}
                                      compact={false}
                                    />
                                  </div>

                                  {actions.length > 0 && (
                                    <>
                                      <Separator />
                                      <div className="flex flex-wrap gap-1.5">
                                        {actions.map((a) => (
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
        )}

        <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actionTarget?.action.label} — {actionTarget?.rec.planning_number || `PLN-${actionTarget?.rec.id}`}</DialogTitle>
              <DialogDescription>
                {actionTarget?.action.key === "release"
                  ? "Releasing this planning record will auto-create the downstream execution record (Procurement or Production)."
                  : "Confirm lifecycle action on this planning record."}
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
