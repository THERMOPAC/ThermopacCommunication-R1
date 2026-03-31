import { useState, useMemo } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
import { ProjectAccessDenied, isProjectAccessDenied } from "@/components/project-access-denied";
  Loader2, Search, Filter, Truck, Package, CheckCircle2,
  XCircle, ChevronDown, ChevronRight, RefreshCw, AlertTriangle,
  Play, CircleCheck, MapPin, Clock, Ship, Archive,
} from "lucide-react";

const roleHierarchy: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, Employee: 4,
};

const DR_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  under_preparation: "bg-amber-100 text-amber-800",
  ready_for_dispatch: "bg-cyan-100 text-cyan-800",
  dispatched: "bg-teal-100 text-teal-800",
  cancelled: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-800",
};
const DR_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", under_preparation: "Under Preparation", ready_for_dispatch: "Ready for Dispatch",
  dispatched: "Dispatched", cancelled: "Cancelled", superseded: "Superseded",
};

const DSP_STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  confirmed: "bg-blue-100 text-blue-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  superseded: "bg-orange-100 text-orange-800",
};
const DSP_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", confirmed: "Confirmed", shipped: "Shipped",
  delivered: "Delivered", cancelled: "Cancelled", superseded: "Superseded",
};

type ActionDef = {
  key: string; label: string; icon: any;
  variant: "default" | "destructive" | "outline" | "secondary";
  minRoleLevel: number; statusRequired: string[];
  needsNote?: boolean; noteLabel?: string; noteKey?: string; noteRequired?: boolean;
  needsTransport?: boolean; needsDeliveryDate?: boolean;
};

const DR_ACTIONS: ActionDef[] = [
  { key: "start-preparation", label: "Start Preparation", icon: Play, variant: "default", minRoleLevel: 3, statusRequired: ["draft"], needsNote: true, noteLabel: "Preparation Note", noteKey: "preparationNote" },
  { key: "mark-ready", label: "Mark Ready", icon: CircleCheck, variant: "default", minRoleLevel: 3, statusRequired: ["under_preparation"], needsNote: true, noteLabel: "Ready Note", noteKey: "readyNote" },
  { key: "dispatch", label: "Mark Dispatched", icon: Truck, variant: "default", minRoleLevel: 3, statusRequired: ["ready_for_dispatch"], needsNote: true, noteLabel: "Dispatch Reference", noteKey: "dispatchReference" },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 3, statusRequired: ["draft", "under_preparation", "ready_for_dispatch"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason", noteRequired: true },
];

const DSP_ACTIONS: ActionDef[] = [
  { key: "confirm", label: "Confirm", icon: CheckCircle2, variant: "default", minRoleLevel: 3, statusRequired: ["draft"], needsNote: true, noteLabel: "Confirmation Note", noteKey: "confirmationNote" },
  { key: "ship", label: "Mark Shipped", icon: Ship, variant: "default", minRoleLevel: 3, statusRequired: ["confirmed"], needsNote: true, noteLabel: "Shipment Note", noteKey: "shipmentNote", needsTransport: true },
  { key: "deliver", label: "Confirm Delivery", icon: MapPin, variant: "default", minRoleLevel: 3, statusRequired: ["shipped"], needsNote: true, noteLabel: "Delivery Note", noteKey: "deliveryNote", needsDeliveryDate: true },
  { key: "cancel", label: "Cancel", icon: XCircle, variant: "destructive", minRoleLevel: 3, statusRequired: ["draft", "confirmed", "shipped"], needsNote: true, noteLabel: "Cancel Reason", noteKey: "cancelReason", noteRequired: true },
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

export default function EpcDispatchLogisticsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userRole = (user as any)?.role || "Employee";
  const userLevel = roleHierarchy[userRole] ?? 4;

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"readiness" | "records">("readiness");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ rec: any; action: ActionDef; tab: "readiness" | "records" } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [lrNumber, setLrNumber] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });

  const { data: drRecords = [], isLoading: drLoading, error: drError } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "dispatch-readiness"],
    queryFn: () => selectedProjectId ? fetchWithProjectAccess(`/api/projects/${selectedProjectId}/dispatch-readiness`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const { data: dspRecords = [], isLoading: dspLoading, error: dspError } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "dispatch-records"],
    queryFn: () => selectedProjectId ? fetchWithProjectAccess(`/api/projects/${selectedProjectId}/dispatch-records`) : Promise.resolve([]),
    enabled: !!selectedProjectId,
  });

  const apiPrefix = activeTab === "readiness" ? "dispatch-readiness" : "dispatch-records";
  const { data: expandedDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: [`/api/${apiPrefix}`, expandedRow],
    queryFn: () => expandedRow ? fetch(`/api/${apiPrefix}/${expandedRow}`, { credentials: "include" }).then(r => r.json()) : Promise.resolve(null),
    enabled: !!expandedRow,
  });

  const currentRecords = activeTab === "readiness" ? drRecords : dspRecords;
  const isLoading = activeTab === "readiness" ? drLoading : dspLoading;
  const statusColors = activeTab === "readiness" ? DR_STATUS_COLORS : DSP_STATUS_COLORS;
  const statusLabels = activeTab === "readiness" ? DR_STATUS_LABELS : DSP_STATUS_LABELS;
  const actions = activeTab === "readiness" ? DR_ACTIONS : DSP_ACTIONS;
  const docType = activeTab === "readiness" ? "DR" : "DSP";

  const filtered = useMemo(() => {
    let list = currentRecords;
    if (statusFilter !== "all") list = list.filter((r: any) => r.status === statusFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((r: any) =>
        (r.dr_number || r.dispatch_number || "").toLowerCase().includes(s) ||
        (r.item_code || "").toLowerCase().includes(s) ||
        (r.item_description || "").toLowerCase().includes(s) ||
        (r.transporter_name || "").toLowerCase().includes(s) ||
        (r.destination_address || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [currentRecords, statusFilter, searchTerm]);

  const drStats = useMemo(() => ({
    total: drRecords.length,
    draft: drRecords.filter((r: any) => r.status === "draft").length,
    underPrep: drRecords.filter((r: any) => r.status === "under_preparation").length,
    ready: drRecords.filter((r: any) => r.status === "ready_for_dispatch").length,
    dispatched: drRecords.filter((r: any) => r.status === "dispatched").length,
  }), [drRecords]);

  const dspStats = useMemo(() => ({
    total: dspRecords.length,
    draft: dspRecords.filter((r: any) => r.status === "draft").length,
    confirmed: dspRecords.filter((r: any) => r.status === "confirmed").length,
    shipped: dspRecords.filter((r: any) => r.status === "shipped").length,
    delivered: dspRecords.filter((r: any) => r.status === "delivered").length,
  }), [dspRecords]);

  const lifecycleMutation = useMutation({
    mutationFn: async ({ id, action, prefix, body }: { id: number; action: string; prefix: string; body: any }) => {
      const res = await apiRequest("POST", `/api/${prefix}/${id}/${action}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "dispatch-readiness"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "dispatch-records"] });
      queryClient.invalidateQueries({ queryKey: [`/api/${apiPrefix}`, expandedRow] });
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
    setActionTarget({ rec, action, tab: activeTab });
    setActionNote("");
    setTransporterName("");
    setVehicleNumber("");
    setTrackingNumber("");
    setLrNumber("");
    setDeliveryDate("");
    setActionDialogOpen(true);
  }

  function executeAction() {
    if (!actionTarget) return;
    const { rec, action, tab } = actionTarget;
    const prefix = tab === "readiness" ? "dispatch-readiness" : "dispatch-records";
    const body: any = {};
    if (action.noteKey && actionNote) body[action.noteKey] = actionNote;
    if (action.needsTransport) {
      if (transporterName) body.transporterName = transporterName;
      if (vehicleNumber) body.vehicleNumber = vehicleNumber;
      if (trackingNumber) body.trackingNumber = trackingNumber;
      if (lrNumber) body.lrNumber = lrNumber;
    }
    if (action.needsDeliveryDate && deliveryDate) body.actualDeliveryDate = deliveryDate;
    lifecycleMutation.mutate({ id: rec.id, action: action.key, prefix, body });
  }

  function getRecordNumber(rec: any) {
    return rec.dr_number || rec.dispatch_number || `REC-${rec.id}`;
  }

  function renderDrDetail(d: any, rec: any) {
    const rowActions = getAvailableActions(rec);
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <Package className="h-3 w-3" /> Dispatch Readiness Details
            </h4>
            <div className="space-y-1">
              <DetailRow label="DR #" value={d.dr_number} mono />
              <DetailRow label="Status" value={DR_STATUS_LABELS[d.status] || d.status} />
              <DetailRow label="Source Type" value={d.source_type} />
              <DetailRow label="PO #" value={d.po_number} mono />
              <DetailRow label="WO #" value={d.wo_number} mono />
              <DetailRow label="Quantity" value={d.quantity} />
              <DetailRow label="Dispatch Qty" value={d.dispatch_quantity} />
              {d.estimated_dispatch_date && <DetailRow label="Est. Dispatch" value={formatDate(d.estimated_dispatch_date)} />}
              <DetailRow label="Quality Clearance" value={d.quality_clearance_reference} />
            </div>
          </Card>
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <Truck className="h-3 w-3" /> Item & Logistics
            </h4>
            <div className="space-y-1">
              <DetailRow label="Item Code" value={d.item_code} mono />
              <DetailRow label="Description" value={d.item_description} />
              <DetailRow label="Specification" value={d.item_specification} />
              <DetailRow label="UOM" value={d.uom} />
              <Separator className="my-1" />
              <DetailRow label="Packaging" value={d.packaging_type} />
              <DetailRow label="Packaging Notes" value={d.packaging_notes} />
              <DetailRow label="Shipping Method" value={d.shipping_method} />
              <DetailRow label="Special Handling" value={d.special_handling} />
              <DetailRow label="Destination" value={d.destination_address} />
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
                  {d.ready_note && <DetailRow label="Ready Note" value={d.ready_note} />}
                </>
              )}
              {d.dispatched_by_name && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Dispatched By" value={d.dispatched_by_name} />
                  <DetailRow label="Dispatched" value={formatDate(d.dispatched_at)} />
                  {d.dispatch_reference && <DetailRow label="Dispatch Ref" value={d.dispatch_reference} />}
                </>
              )}
            </div>
          </Card>
        </div>
        {d.cancel_reason && (
          <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-[10px]">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5" />
            <div><span className="font-medium text-red-700">Cancel Reason:</span> <span className="text-red-600">{d.cancel_reason}</span></div>
          </div>
        )}
        {d.status === "ready_for_dispatch" && (
          <div className="flex items-start gap-2 p-2 bg-cyan-50 border border-cyan-200 rounded text-[10px]">
            <CircleCheck className="h-3.5 w-3.5 text-cyan-500 mt-0.5" />
            <span className="text-cyan-700 font-medium">Ready for dispatch. A dispatch record can be created from this readiness record.</span>
          </div>
        )}
        {d.status === "dispatched" && (
          <div className="flex items-start gap-2 p-2 bg-teal-50 border border-teal-200 rounded text-[10px]">
            <Truck className="h-3.5 w-3.5 text-teal-500 mt-0.5" />
            <span className="text-teal-700 font-medium">Item dispatched. Track the dispatch record for shipment and delivery status.</span>
          </div>
        )}
        <Separator />
        <div>
          <h4 className="text-[10px] font-semibold mb-1.5">Document Attachments</h4>
          <EpcDocumentPanel projectId={selectedProjectId!} docType="DR" parentEntityId={rec.id} documentNumber={getRecordNumber(d)} userRole={userRole} compact={false} />
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

  function renderDspDetail(d: any, rec: any) {
    const rowActions = getAvailableActions(rec);
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <Ship className="h-3 w-3" /> Dispatch Record Details
            </h4>
            <div className="space-y-1">
              <DetailRow label="Dispatch #" value={d.dispatch_number} mono />
              <DetailRow label="Status" value={DSP_STATUS_LABELS[d.status] || d.status} />
              <DetailRow label="DR #" value={d.dr_number} mono />
              <DetailRow label="Source Type" value={d.source_type} />
              <DetailRow label="PO #" value={d.po_number} mono />
              <DetailRow label="WO #" value={d.wo_number} mono />
              <DetailRow label="Quantity" value={d.quantity} />
              <DetailRow label="Dispatch Qty" value={d.dispatch_quantity} />
              <DetailRow label="Dispatch Date" value={formatDate(d.dispatch_date)} />
            </div>
          </Card>
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <Truck className="h-3 w-3" /> Logistics & Transport
            </h4>
            <div className="space-y-1">
              <DetailRow label="Item Code" value={d.item_code} mono />
              <DetailRow label="Description" value={d.item_description} />
              <DetailRow label="UOM" value={d.uom} />
              <Separator className="my-1" />
              <DetailRow label="Transporter" value={d.transporter_name} />
              <DetailRow label="Contact" value={d.transporter_contact} />
              <DetailRow label="Vehicle #" value={d.vehicle_number} mono />
              <DetailRow label="Tracking #" value={d.tracking_number} mono />
              <DetailRow label="LR #" value={d.lr_number} mono />
              <DetailRow label="LR Date" value={formatDate(d.lr_date)} />
              <Separator className="my-1" />
              <DetailRow label="Delivery Address" value={d.delivery_address} />
              <DetailRow label="Expected Delivery" value={formatDate(d.expected_delivery_date)} />
              <DetailRow label="Actual Delivery" value={formatDate(d.actual_delivery_date)} />
            </div>
          </Card>
          <Card className="p-2.5">
            <h4 className="text-[10px] font-semibold mb-1.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Lifecycle & Audit
            </h4>
            <div className="space-y-1">
              <DetailRow label="Created By" value={d.created_by_name} />
              <DetailRow label="Created" value={formatDate(d.created_at)} />
              {d.confirmed_by_name && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Confirmed By" value={d.confirmed_by_name} />
                  <DetailRow label="Confirmed" value={formatDate(d.confirmed_at)} />
                  {d.confirmation_note && <DetailRow label="Confirmation Note" value={d.confirmation_note} />}
                </>
              )}
              {d.shipped_by_name && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Shipped By" value={d.shipped_by_name} />
                  <DetailRow label="Shipped" value={formatDate(d.shipped_at)} />
                  {d.shipment_note && <DetailRow label="Shipment Note" value={d.shipment_note} />}
                </>
              )}
              {d.delivered_by_name && (
                <>
                  <Separator className="my-1" />
                  <DetailRow label="Delivered By" value={d.delivered_by_name} />
                  <DetailRow label="Delivered" value={formatDate(d.delivered_at)} />
                  {d.delivery_note && <DetailRow label="Delivery Note" value={d.delivery_note} />}
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
        {d.cancel_reason && (
          <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-[10px]">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5" />
            <div><span className="font-medium text-red-700">Cancel Reason:</span> <span className="text-red-600">{d.cancel_reason}</span></div>
          </div>
        )}
        {d.status === "confirmed" && (
          <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-[10px]">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 mt-0.5" />
            <span className="text-blue-700 font-medium">Dispatch confirmed. Ready for shipment with transport details.</span>
          </div>
        )}
        {d.status === "shipped" && (
          <div className="flex items-start gap-2 p-2 bg-indigo-50 border border-indigo-200 rounded text-[10px]">
            <Ship className="h-3.5 w-3.5 text-indigo-500 mt-0.5" />
            <span className="text-indigo-700 font-medium">In transit. Awaiting delivery confirmation.</span>
          </div>
        )}
        {d.status === "delivered" && (
          <div className="flex items-start gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-[10px]">
            <MapPin className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
            <span className="text-emerald-700 font-medium">Delivered successfully. Ready for commissioning.</span>
          </div>
        )}
        <Separator />
        <div>
          <h4 className="text-[10px] font-semibold mb-1.5">Document Attachments</h4>
          <EpcDocumentPanel projectId={selectedProjectId!} docType="DSP" parentEntityId={rec.id} documentNumber={getRecordNumber(d)} userRole={userRole} compact={false} />
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

  function renderTable() {
    if (!selectedProjectId) {
      return (
        <Card className="p-8 text-center">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Select a project to view dispatch & logistics records</p>
        </Card>
      );
    }

    if (isProjectAccessDenied(drError) || isProjectAccessDenied(dspError)) {
      return <ProjectAccessDenied />;
    }

    if (isLoading) {
      return <div className="py-12 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>;
    }

    if (filtered.length === 0) {
      return (
        <Card className="p-8 text-center">
          {activeTab === "readiness" ? <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" /> : <Ship className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />}
          <p className="text-sm text-muted-foreground">{currentRecords.length === 0 ? `No ${activeTab === "readiness" ? "dispatch readiness" : "dispatch"} records for this project.` : "No records match current filters."}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{activeTab === "readiness" ? "Dispatch readiness records are created after inspection clearance of linked PO/WO." : "Dispatch records are created from dispatch readiness records marked as ready."}</p>
        </Card>
      );
    }

    const isReadiness = activeTab === "readiness";

    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] w-8"></TableHead>
              <TableHead className="text-[10px]">{isReadiness ? "DR #" : "Dispatch #"}</TableHead>
              <TableHead className="text-[10px]">Item Code</TableHead>
              <TableHead className="text-[10px]">Description</TableHead>
              <TableHead className="text-[10px]">{isReadiness ? "Source" : "DR Ref"}</TableHead>
              {!isReadiness && <TableHead className="text-[10px]">Transporter</TableHead>}
              <TableHead className="text-[10px]">Destination</TableHead>
              <TableHead className="text-[10px] text-center">Status</TableHead>
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
                    <TableCell className="py-1.5 text-[10px] max-w-[140px] truncate">{rec.item_description || "—"}</TableCell>
                    <TableCell className="py-1.5 text-[10px]">
                      {isReadiness ? (rec.source_type || "—") : (rec.dr_number || "—")}
                    </TableCell>
                    {!isReadiness && <TableCell className="py-1.5 text-[10px] max-w-[100px] truncate">{rec.transporter_name || "—"}</TableCell>}
                    <TableCell className="py-1.5 text-[10px] max-w-[120px] truncate">{rec.destination_address || rec.delivery_address || "—"}</TableCell>
                    <TableCell className="py-1.5 text-center">
                      <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${statusColors[rec.status] || ""}`}>
                        {statusLabels[rec.status] || rec.status}
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
                      <TableCell colSpan={isReadiness ? 9 : 10} className="p-0 bg-muted/10">
                        <div className="p-3 space-y-3">
                          {detailLoading ? (
                            <div className="py-4 text-center"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>
                          ) : expandedDetail ? (
                            isReadiness ? renderDrDetail(expandedDetail, rec) : renderDspDetail(expandedDetail, rec)
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
              <Truck className="h-5 w-5 text-primary" />
              EPC Dispatch & Logistics Control
            </h1>
            <p className="text-xs text-muted-foreground">Dispatch readiness verification, shipment tracking, and delivery confirmation</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => {
            if (selectedProjectId) {
              queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "dispatch-readiness"] });
              queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "dispatch-records"] });
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
            <Input className="h-8 text-xs pl-7" placeholder="DR #, dispatch #, item, transporter…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
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
            <TabsTrigger value="readiness" className="text-xs gap-1.5">
              <Package className="h-3.5 w-3.5" /> Dispatch Readiness ({drRecords.length})
            </TabsTrigger>
            <TabsTrigger value="records" className="text-xs gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Dispatch Records ({dspRecords.length})
            </TabsTrigger>
          </TabsList>

          {selectedProjectId && activeTab === "readiness" && drRecords.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold">{drStats.total}</p><p className="text-[9px] text-muted-foreground">Total</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-slate-600">{drStats.draft}</p><p className="text-[9px] text-muted-foreground">Draft</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-amber-600">{drStats.underPrep}</p><p className="text-[9px] text-muted-foreground">Under Prep</p></CardContent></Card>
              <Card className="p-2 border-cyan-200 bg-cyan-50/30"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-cyan-600">{drStats.ready}</p><p className="text-[9px] text-muted-foreground">Ready</p></CardContent></Card>
              <Card className="p-2 border-teal-200 bg-teal-50/30"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-teal-600">{drStats.dispatched}</p><p className="text-[9px] text-muted-foreground">Dispatched</p></CardContent></Card>
            </div>
          )}

          {selectedProjectId && activeTab === "records" && dspRecords.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold">{dspStats.total}</p><p className="text-[9px] text-muted-foreground">Total</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-slate-600">{dspStats.draft}</p><p className="text-[9px] text-muted-foreground">Draft</p></CardContent></Card>
              <Card className="p-2"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-blue-600">{dspStats.confirmed}</p><p className="text-[9px] text-muted-foreground">Confirmed</p></CardContent></Card>
              <Card className="p-2 border-indigo-200 bg-indigo-50/30"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-indigo-600">{dspStats.shipped}</p><p className="text-[9px] text-muted-foreground">Shipped</p></CardContent></Card>
              <Card className="p-2 border-emerald-200 bg-emerald-50/30"><CardContent className="p-0 text-center"><p className="text-xl font-bold text-emerald-600">{dspStats.delivered}</p><p className="text-[9px] text-muted-foreground">Delivered</p></CardContent></Card>
            </div>
          )}

          <TabsContent value="readiness" className="mt-3">{renderTable()}</TabsContent>
          <TabsContent value="records" className="mt-3">{renderTable()}</TabsContent>
        </Tabs>

        <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actionTarget?.action.label} — {actionTarget?.rec && getRecordNumber(actionTarget.rec)}</DialogTitle>
              <DialogDescription>
                {actionTarget?.action.key === "start-preparation" ? "Begin preparation for dispatch. Verify packaging, labeling, and documentation."
                  : actionTarget?.action.key === "mark-ready" ? "Mark this item ready for dispatch. Quality clearance will be re-verified server-side."
                  : actionTarget?.action.key === "dispatch" ? "Mark as dispatched. A dispatch record will be created for tracking shipment and delivery."
                  : actionTarget?.action.key === "confirm" ? "Confirm this dispatch record. Creator cannot self-confirm (enforced server-side)."
                  : actionTarget?.action.key === "ship" ? "Record shipment details. Add transporter and vehicle information."
                  : actionTarget?.action.key === "deliver" ? "Confirm delivery at destination. Record actual delivery date."
                  : actionTarget?.action.key === "cancel" ? "Cancel this record. This action will be audited."
                  : "Confirm lifecycle action."}
              </DialogDescription>
            </DialogHeader>
            {actionTarget?.action.needsTransport && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Transporter Name</Label>
                  <Input className="text-xs" value={transporterName} onChange={(e) => setTransporterName(e.target.value)} placeholder="Optional" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Vehicle #</Label>
                    <Input className="text-xs" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="Optional" />
                  </div>
                  <div>
                    <Label className="text-xs">Tracking #</Label>
                    <Input className="text-xs" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Optional" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">LR Number</Label>
                  <Input className="text-xs" value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} placeholder="Optional" />
                </div>
              </div>
            )}
            {actionTarget?.action.needsDeliveryDate && (
              <div>
                <Label className="text-xs">Actual Delivery Date</Label>
                <Input type="date" className="text-xs" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
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
