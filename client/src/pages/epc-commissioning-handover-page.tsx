import { useState, useMemo } from "react";
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
  Loader2, Search, Filter, Wrench, CheckCircle2, XCircle, ChevronDown,
  ChevronRight, RefreshCw, AlertTriangle, Play, CircleCheck, MapPin,
  ClipboardList, Lock, ListChecks, HandMetal, Settings,
} from "lucide-react";

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  under_preparation: "bg-amber-100 text-amber-800",
  ready_for_commissioning: "bg-cyan-100 text-cyan-800",
  commissioned: "bg-blue-100 text-blue-800",
  punch_list_open: "bg-orange-100 text-orange-800",
  ready_for_handover: "bg-indigo-100 text-indigo-800",
  handed_over: "bg-emerald-100 text-emerald-800",
  closed: "bg-violet-100 text-violet-800",
  cancelled: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-800",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  under_preparation: "Under Preparation",
  ready_for_commissioning: "Ready for Commissioning",
  commissioned: "Commissioned",
  punch_list_open: "Punch List Open",
  ready_for_handover: "Ready for Handover",
  handed_over: "Handed Over",
  closed: "Closed",
  cancelled: "Cancelled",
  superseded: "Superseded",
};

type ActionDef = {
  key: string; label: string; icon: any;
  variant: "default" | "destructive" | "outline" | "secondary";
  minRoleLevel: number; statusRequired: string[];
  needsNote?: boolean; noteLabel?: string; noteKey?: string; noteRequired?: boolean;
  needsDate?: boolean; dateLabel?: string; dateKey?: string;
  needsHandoverAcceptedBy?: boolean;
};

const CR_ACTIONS: ActionDef[] = [
  { key: "start-preparation", label: "Start Preparation", icon: Play, variant: "default", minRoleLevel: 3, statusRequired: ["draft"], needsNote: true, noteLabel: "Preparation Note", noteKey: "preparationNote" },
  { key: "mark-ready", label: "Mark Ready", icon: CircleCheck, variant: "default", minRoleLevel: 3, statusRequired: ["under_preparation"], needsNote: true, noteLabel: "Ready Note", noteKey: "readyNote" },
  { key: "commission", label: "Commission", icon: Settings, variant: "default", minRoleLevel: 3, statusRequired: ["ready_for_commissioning"], needsNote: true, noteLabel: "Commissioning Note", noteKey: "commissioningNote", needsDate: true, dateLabel: "Commissioning Date", dateKey: "commissioningDate" },
  { key: "open-punch-list", label: "Open Punch List", icon: ListChecks, variant: "outline", minRoleLevel: 3, statusRequired: ["commissioned"], needsNote: true, noteLabel: "Punch List Items / Snags", noteKey: "punchListNote", noteRequired: true },
  { key: "resolve-punch-list", label: "Resolve Punch List", icon: CheckCircle2, variant: "default", minRoleLevel: 3, statusRequired: ["punch_list_open"], needsNote: true, noteLabel: "Resolution Note", noteKey: "resolutionNote" },
  { key: "handover", label: "Handover", icon: HandMetal, variant: "default", minRoleLevel: 2, statusRequired: ["commissioned", "ready_for_handover"], needsNote: true, noteLabel: "Handover Notes", noteKey: "handoverNotes", needsDate: true, dateLabel: "Handover Date", dateKey: "handoverDate", needsHandoverAcceptedBy: true },
  { key: "close", label: "Close", icon: Lock, variant: "secondary", minRoleLevel: 2, statusRequired: ["handed_over"], needsNote: true, noteLabel: "Closing Notes", noteKey: "closingNote" },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 3, statusRequired: ["draft", "under_preparation", "ready_for_commissioning", "commissioned", "punch_list_open", "ready_for_handover"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason", noteRequired: true },
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

function ChecklistBadge({ label, checked }: { label: string; checked: boolean }) {
  return (
    <Badge variant="secondary" className={`text-[9px] px-1.5 py-0.5 ${checked ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
      {checked ? "✓" : "✗"} {label}
    </Badge>
  );
}

export default function EpcCommissioningHandoverPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userRole = (user as any)?.role || "Employee";
  const userLevel = roleHierarchy[userRole] ?? 5;

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ rec: any; action: ActionDef } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionDate, setActionDate] = useState("");
  const [handoverAcceptedBy, setHandoverAcceptedBy] = useState("");
  const [handoverAcceptanceNote, setHandoverAcceptanceNote] = useState("");

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { showAllProjects, setShowAllProjects, filteredProjects } = useProjectFilter(projects, selectedProjectId);

  const { data: crRecords = [], isLoading, error: recordsError } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "commissioning-readiness"],
    queryFn: () => selectedProjectId ? fetchWithProjectAccess(`/api/projects/${selectedProjectId}/commissioning-readiness`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const { data: expandedDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ["/api/commissioning-readiness", expandedRow],
    queryFn: () => expandedRow ? fetch(`/api/commissioning-readiness/${expandedRow}`, { credentials: "include" }).then(r => r.json()) : Promise.resolve(null),
    enabled: !!expandedRow,
  });

  const filtered = useMemo(() => {
    let list = crRecords;
    if (statusFilter !== "all") list = list.filter((r: any) => r.status === statusFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((r: any) =>
        (r.cr_number || "").toLowerCase().includes(s) ||
        (r.item_code || "").toLowerCase().includes(s) ||
        (r.item_description || "").toLowerCase().includes(s) ||
        (r.site_name || "").toLowerCase().includes(s) ||
        (r.linked_dispatch_number || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [crRecords, statusFilter, searchTerm]);

  const stats = useMemo(() => ({
    total: crRecords.length,
    draft: crRecords.filter((r: any) => r.status === "draft").length,
    underPrep: crRecords.filter((r: any) => r.status === "under_preparation").length,
    readyForComm: crRecords.filter((r: any) => r.status === "ready_for_commissioning").length,
    commissioned: crRecords.filter((r: any) => r.status === "commissioned").length,
    punchList: crRecords.filter((r: any) => r.status === "punch_list_open").length,
    readyHandover: crRecords.filter((r: any) => r.status === "ready_for_handover").length,
    handedOver: crRecords.filter((r: any) => r.status === "handed_over").length,
    closed: crRecords.filter((r: any) => r.status === "closed").length,
  }), [crRecords]);

  const lifecycleMutation = useMutation({
    mutationFn: async ({ id, action, body }: { id: number; action: string; body: any }) => {
      const res = await apiRequest("POST", `/api/commissioning-readiness/${id}/${action}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "commissioning-readiness"] });
      queryClient.invalidateQueries({ queryKey: ["/api/commissioning-readiness", expandedRow] });
      setActionDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Action failed", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const res = await apiRequest("PATCH", `/api/commissioning-readiness/${id}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Updated", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "commissioning-readiness"] });
      queryClient.invalidateQueries({ queryKey: ["/api/commissioning-readiness", expandedRow] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Update failed", variant: "destructive" });
    },
  });

  function getAvailableActions(rec: any): ActionDef[] {
    return CR_ACTIONS.filter((a) => {
      if (userLevel > a.minRoleLevel) return false;
      if (!a.statusRequired.includes(rec.status)) return false;
      return true;
    });
  }

  function openAction(rec: any, action: ActionDef) {
    setActionTarget({ rec, action });
    setActionNote("");
    setActionDate("");
    setHandoverAcceptedBy("");
    setHandoverAcceptanceNote("");
    setActionDialogOpen(true);
  }

  function executeAction() {
    if (!actionTarget) return;
    const { rec, action } = actionTarget;
    const body: any = {};
    if (action.noteKey && actionNote) body[action.noteKey] = actionNote;
    if (action.dateKey && actionDate) body[action.dateKey] = actionDate;
    if (action.needsHandoverAcceptedBy) {
      if (handoverAcceptedBy) body.handoverAcceptedBy = handoverAcceptedBy;
      if (handoverAcceptanceNote) body.handoverAcceptanceNote = handoverAcceptanceNote;
    }
    lifecycleMutation.mutate({ id: rec.id, action: action.key, body });
  }

  function toggleChecklist(rec: any, field: string, currentValue: boolean) {
    updateMutation.mutate({ id: rec.id, body: { [field]: !currentValue } });
  }

  function renderDetail(d: any, rec: any) {
    const rowActions = getAvailableActions(rec);
    const canEdit = !["canceled", "superseded", "handed_over", "closed"].includes(d.status);
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <Wrench className="h-3 w-3" /> Commissioning Details
            </h4>
            <div className="space-y-1">
              <DetailRow label="CR #" value={d.cr_number} mono />
              <DetailRow label="Status" value={STATUS_LABELS[d.status] || d.status} />
              <DetailRow label="Source Type" value={d.source_type} />
              <DetailRow label="Dispatch #" value={d.linked_dispatch_number || d.dispatch_number} mono />
              <DetailRow label="PO #" value={d.po_number} mono />
              <DetailRow label="WO #" value={d.wo_number} mono />
              <DetailRow label="Quantity" value={d.quantity} />
              <DetailRow label="Dispatch Date" value={formatDate(d.dispatch_date)} />
              <DetailRow label="Delivery Date" value={formatDate(d.delivery_date)} />
              {d.commissioning_date && <DetailRow label="Commissioned" value={formatDate(d.commissioning_date)} />}
              {d.handover_date && <DetailRow label="Handover Date" value={formatDate(d.handover_date)} />}
            </div>
          </Card>
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Site & Item Details
            </h4>
            <div className="space-y-1">
              <DetailRow label="Item Code" value={d.item_code} mono />
              <DetailRow label="Description" value={d.item_description} />
              <DetailRow label="Specification" value={d.item_specification} />
              <DetailRow label="UOM" value={d.uom} />
              <Separator className="my-1" />
              <DetailRow label="Site Name" value={d.site_name} />
              <DetailRow label="Site Address" value={d.site_address} />
              <DetailRow label="Contact Person" value={d.site_contact_person} />
              <DetailRow label="Contact Phone" value={d.site_contact_phone} />
              <Separator className="my-1" />
              <DetailRow label="Installation" value={d.installation_required ? "Required" : "Not Required"} />
              {d.installation_notes && <DetailRow label="Install Notes" value={d.installation_notes} />}
              <DetailRow label="Training" value={d.training_required ? "Required" : "Not Required"} />
              {d.training_notes && <DetailRow label="Training Notes" value={d.training_notes} />}
            </div>
          </Card>
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Lifecycle & Audit
            </h4>
            <div className="space-y-1">
              <DetailRow label="Created By" value={d.created_by_name} />
              <DetailRow label="Created" value={formatDate(d.created_at)} />
              {d.prepared_by_name && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Prepared By" value={d.prepared_by_name} />
                  <DetailRow label="Prepared" value={formatDate(d.prepared_at)} />
                  {d.preparation_note && <DetailRow label="Prep Note" value={d.preparation_note} />}
                </>
              )}
              {d.ready_marked_by_name && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Ready By" value={d.ready_marked_by_name} />
                  <DetailRow label="Ready At" value={formatDate(d.ready_marked_at)} />
                </>
              )}
              {d.commissioned_by_name && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Commissioned By" value={d.commissioned_by_name} />
                  <DetailRow label="Commissioned" value={formatDate(d.commissioned_at)} />
                  {d.commissioning_note && <DetailRow label="Note" value={d.commissioning_note} />}
                </>
              )}
              {d.handed_over_by_name && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Handed Over By" value={d.handed_over_by_name} />
                  <DetailRow label="Handover" value={formatDate(d.handed_over_at)} />
                  {d.handover_accepted_by && <DetailRow label="Accepted By" value={d.handover_accepted_by} />}
                  {d.handover_acceptance_note && <DetailRow label="Acceptance Note" value={d.handover_acceptance_note} />}
                </>
              )}
              {d.quality_clearance_reference && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Quality Ref" value={d.quality_clearance_reference} />
                </>
              )}
            </div>
          </Card>
        </div>

        <Card className="p-2.5">
          <h4 className="text-[10px] font-semibold mb-2 flex items-center gap-1">
            <ClipboardList className="h-3 w-3" /> Readiness Checklist
            {canEdit && <span className="text-[9px] text-muted-foreground ml-2">(click to toggle)</span>}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {[
              { field: "siteReadinessConfirmed", label: "Site Ready", value: d.site_readiness_confirmed },
              { field: "utilitiesConfirmed", label: "Utilities", value: d.utilities_confirmed },
              { field: "documentationComplete", label: "Documentation", value: d.documentation_complete },
              { field: "testCertificatesAvailable", label: "Test Certs", value: d.test_certificates_available },
              { field: "warrantyDocumentsAvailable", label: "Warranty Docs", value: d.warranty_documents_available },
              { field: "operationManualAvailable", label: "Op. Manual", value: d.operation_manual_available },
              { field: "sparePartsListAvailable", label: "Spare Parts List", value: d.spare_parts_list_available },
            ].map((item) => (
              <div
                key={item.field}
                className={canEdit && userLevel <= 3 ? "cursor-pointer" : ""}
                onClick={() => canEdit && userLevel <= 3 && toggleChecklist(rec, item.field, item.value)}
              >
                <ChecklistBadge label={item.label} checked={item.value} />
              </div>
            ))}
          </div>
          {d.site_readiness_note && <p className="text-[9px] text-muted-foreground mt-1">Site note: {d.site_readiness_note}</p>}
          {d.utilities_note && <p className="text-[9px] text-muted-foreground">Utilities note: {d.utilities_note}</p>}
          {d.documentation_note && <p className="text-[9px] text-muted-foreground">Documentation note: {d.documentation_note}</p>}
        </Card>

        {d.cancel_reason && (
          <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-[10px]">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5" />
            <div><span className="font-medium text-red-700">Cancel Reason:</span> <span className="text-red-600">{d.cancel_reason}</span></div>
          </div>
        )}
        {d.status === "ready_for_commissioning" && (
          <div className="flex items-start gap-2 p-2 bg-cyan-50 border border-cyan-200 rounded text-[10px]">
            <CircleCheck className="h-3.5 w-3.5 text-cyan-500 mt-0.5" />
            <span className="text-cyan-700 font-medium">Site and documentation ready. Proceed with commissioning.</span>
          </div>
        )}
        {d.status === "commissioned" && (
          <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-[10px]">
            <Settings className="h-3.5 w-3.5 text-blue-500 mt-0.5" />
            <span className="text-blue-700 font-medium">Commissioning complete. Proceed to handover or open a punch list if snags exist.</span>
          </div>
        )}
        {d.status === "punch_list_open" && (
          <div className="flex items-start gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-[10px]">
            <ListChecks className="h-3.5 w-3.5 text-orange-500 mt-0.5" />
            <span className="text-orange-700 font-medium">Punch list / snag items open. Resolve all items before handover.</span>
          </div>
        )}
        {d.status === "ready_for_handover" && (
          <div className="flex items-start gap-2 p-2 bg-indigo-50 border border-indigo-200 rounded text-[10px]">
            <HandMetal className="h-3.5 w-3.5 text-indigo-500 mt-0.5" />
            <span className="text-indigo-700 font-medium">All punch list items resolved. Ready for formal handover (SM+ required).</span>
          </div>
        )}
        {d.status === "handed_over" && (
          <div className="flex items-start gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-[10px]">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
            <span className="text-emerald-700 font-medium">Handed over to customer. Close to finalize.</span>
          </div>
        )}
        {d.status === "closed" && (
          <div className="flex items-start gap-2 p-2 bg-violet-50 border border-violet-200 rounded text-[10px]">
            <Lock className="h-3.5 w-3.5 text-violet-500 mt-0.5" />
            <span className="text-violet-700 font-medium">Record closed. No further actions.</span>
          </div>
        )}

        {d.commissioning_notes && (
          <div className="text-[10px]"><span className="text-muted-foreground">Commissioning Notes:</span> <span>{d.commissioning_notes}</span></div>
        )}
        {d.handover_notes && (
          <div className="text-[10px]"><span className="text-muted-foreground">Handover Notes:</span> <span>{d.handover_notes}</span></div>
        )}

        <Separator />
        <div>
          <h4 className="text-[10px] font-semibold mb-1.5">Document Attachments</h4>
          <EpcDocumentPanel projectId={selectedProjectId!} docType="CR" parentEntityId={rec.id} documentNumber={d.cr_number || `CR-${rec.id}`} userRole={userRole} compact={false} />
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
    );
  }

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              EPC Commissioning & Handover Control
            </h1>
            <p className="text-xs text-muted-foreground">Site commissioning, punch list management, and customer handover</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => {
            if (selectedProjectId) {
              queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "commissioning-readiness"] });
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
            <Input className="h-8 text-xs pl-7" placeholder="CR #, item, site, dispatch #…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="w-44">
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
        </div>

        {selectedProjectId && crRecords.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold">{stats.total}</p><p className="text-[9px] text-muted-foreground">Total</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-slate-600">{stats.draft}</p><p className="text-[9px] text-muted-foreground">Draft</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-amber-600">{stats.underPrep}</p><p className="text-[9px] text-muted-foreground">Under Prep</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-cyan-600">{stats.readyForComm}</p><p className="text-[9px] text-muted-foreground">Ready</p></CardContent></Card>
            <Card className="p-2 border-blue-200 bg-blue-50/30"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-blue-600">{stats.commissioned}</p><p className="text-[9px] text-muted-foreground">Commissioned</p></CardContent></Card>
            <Card className="p-2 border-orange-200 bg-orange-50/30"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-orange-600">{stats.punchList}</p><p className="text-[9px] text-muted-foreground">Punch List</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-indigo-600">{stats.readyHandover}</p><p className="text-[9px] text-muted-foreground">Ready H/O</p></CardContent></Card>
            <Card className="p-2 border-emerald-200 bg-emerald-50/30"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-emerald-600">{stats.handedOver}</p><p className="text-[9px] text-muted-foreground">Handed Over</p></CardContent></Card>
            <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-violet-600">{stats.closed}</p><p className="text-[9px] text-muted-foreground">Closed</p></CardContent></Card>
          </div>
        )}

        {!selectedProjectId ? (
          <Card className="p-8 text-center">
            <Wrench className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Select a project to view commissioning & handover records</p>
          </Card>
        ) : isProjectAccessDenied(recordsError) ? (
          <ProjectAccessDenied />
        ) : isLoading ? (
          <div className="py-12 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <Wrench className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{crRecords.length === 0 ? "No commissioning records for this project." : "No records match current filters."}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Commissioning records are created from dispatch records that are shipped or delivered.</p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] w-8"></TableHead>
                  <TableHead className="text-[10px]">CR #</TableHead>
                  <TableHead className="text-[10px]">Item Code</TableHead>
                  <TableHead className="text-[10px]">Description</TableHead>
                  <TableHead className="text-[10px]">Dispatch #</TableHead>
                  <TableHead className="text-[10px]">Site</TableHead>
                  <TableHead className="text-[10px] text-center">Checklist</TableHead>
                  <TableHead className="text-[10px] text-center">Status</TableHead>
                  <TableHead className="text-[10px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((rec: any) => {
                  const isExpanded = expandedRow === rec.id;
                  const rowActions = getAvailableActions(rec);
                  const checkCount = [rec.site_readiness_confirmed, rec.documentation_complete, rec.test_certificates_available, rec.utilities_confirmed].filter(Boolean).length;
                  return (
                    <>
                      <TableRow key={rec.id} className={`cursor-pointer hover:bg-muted/40 ${isExpanded ? "bg-muted/30" : ""}`} onClick={() => setExpandedRow(isExpanded ? null : rec.id)}>
                        <TableCell className="py-1.5">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </TableCell>
                        <TableCell className="py-1.5 font-mono text-[10px] font-medium">{rec.cr_number}</TableCell>
                        <TableCell className="py-1.5 text-[10px] font-mono">{rec.item_code || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[10px] max-w-[140px] truncate">{rec.item_description || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[10px] font-mono">{rec.linked_dispatch_number || rec.dispatch_number || "—"}</TableCell>
                        <TableCell className="py-1.5 text-[10px] max-w-[100px] truncate">{rec.site_name || "—"}</TableCell>
                        <TableCell className="py-1.5 text-center">
                          <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${checkCount >= 4 ? "bg-emerald-100 text-emerald-800" : checkCount >= 2 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                            {checkCount}/4
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 text-center">
                          <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${STATUS_COLORS[rec.status] || ""}`}>
                            {STATUS_LABELS[rec.status] || rec.status}
                          </Badge>
                        </TableCell>
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
                              ) : expandedDetail ? renderDetail(expandedDetail, rec) : null}
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
              <DialogTitle>{actionTarget?.action.label} — {actionTarget?.rec?.cr_number}</DialogTitle>
              <DialogDescription>
                {actionTarget?.action.key === "start-preparation" ? "Begin site preparation and documentation verification."
                  : actionTarget?.action.key === "mark-ready" ? "Mark ready for commissioning. Site readiness and documentation must be confirmed (server-side check)."
                  : actionTarget?.action.key === "commission" ? "Record commissioning completion. Self-commissioning prevention is enforced server-side."
                  : actionTarget?.action.key === "open-punch-list" ? "Open a punch list for outstanding snag items found during commissioning."
                  : actionTarget?.action.key === "resolve-punch-list" ? "Mark all punch list items as resolved. Record moves to ready for handover."
                  : actionTarget?.action.key === "handover" ? "Execute formal handover to customer. Senior Manager+ required. Test certificates and training must be confirmed."
                  : actionTarget?.action.key === "close" ? "Close the commissioning record. This is a final action. Senior Manager+ required."
                  : actionTarget?.action.key === "cancel" ? "Cancel this record. This action will be audited."
                  : "Confirm lifecycle action."}
              </DialogDescription>
            </DialogHeader>
            {actionTarget?.action.needsDate && (
              <div>
                <Label className="text-xs">{actionTarget.action.dateLabel}</Label>
                <Input type="date" className="text-xs" value={actionDate} onChange={(e) => setActionDate(e.target.value)} />
              </div>
            )}
            {actionTarget?.action.needsHandoverAcceptedBy && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Accepted By (Customer Name)</Label>
                  <Input className="text-xs" value={handoverAcceptedBy} onChange={(e) => setHandoverAcceptedBy(e.target.value)} placeholder="Customer representative name" />
                </div>
                <div>
                  <Label className="text-xs">Acceptance Note</Label>
                  <Textarea className="text-xs min-h-[60px]" value={handoverAcceptanceNote} onChange={(e) => setHandoverAcceptanceNote(e.target.value)} placeholder="Optional acceptance remarks" />
                </div>
              </div>
            )}
            {actionTarget?.action.needsNote && (
              <div>
                <Label className="text-xs">{actionTarget.action.noteLabel}</Label>
                <Textarea className="text-xs min-h-[80px]" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder={actionTarget.action.noteRequired ? "Required…" : "Optional…"} />
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
