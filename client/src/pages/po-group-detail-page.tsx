import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronLeft, ChevronDown, ChevronRight, Loader2, Plus, Trash2,
  CheckCircle2, XCircle, Send, FileText, AlertTriangle, History, Save,
  Info,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

export const PAYMENT_TERMS_OPTIONS = [
  "Net 30 Days",
  "Net 45 Days",
  "Net 60 Days",
  "Net 90 Days",
  "Advance (100%)",
  "30% Advance, 70% on Delivery",
  "50% Advance, 50% on Delivery",
  "Cash on Delivery",
  "Letter of Credit",
  "Bank Guarantee",
];

export const DELIVERY_TERMS_OPTIONS = [
  "Ex-Works (EXW)",
  "Free on Board (FOB)",
  "CIF — Cost, Insurance & Freight",
  "Door Delivery",
  "FOR — Free on Rail",
  "DDP — Delivered Duty Paid",
  "FCA — Free Carrier",
  "Franco",
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:     { label: "Draft",      className: "border-gray-300 bg-gray-50 text-gray-700" },
  submitted: { label: "Submitted",  className: "border-blue-300 bg-blue-50 text-blue-700" },
  approved:  { label: "Approved",   className: "border-green-300 bg-green-50 text-green-700" },
  rejected:  { label: "Rejected",   className: "border-red-300 bg-red-50 text-red-700" },
  po_issued: { label: "PO Issued",  className: "border-purple-300 bg-purple-50 text-purple-700" },
  cancelled: { label: "Cancelled",  className: "border-orange-300 bg-orange-50 text-orange-700" },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface PogLine {
  id: number;
  po_group_id: number;
  plc_line_id: number;
  line_number: number;
  line_qty: string;
  line_unit_rate: string | null;
  line_amount: string | null;
  line_notes: string | null;
  plc_number: string;
  tag_no: string | null;
  service_description: string | null;
  item_code: string | null;
  item_description: string | null;
  uom: string | null;
}

interface PogDetail {
  id: number;
  pog_number: string;
  project_id: number;
  project_code: string | null;
  project_name: string | null;
  vendor_id: number | null;
  vendor_name: string | null;
  vendor_display_name: string | null;
  total_lines: number;
  total_amount: string | null;
  currency: string;
  status: string;
  epc_po_id: number | null;
  epc_po_number_actual: string | null;
  delivery_terms: string | null;
  payment_terms: string | null;
  group_notes: string | null;
  submitted_by_name: string | null;
  submitted_at: string | null;
  submission_notes: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  issued_by_name: string | null;
  issued_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_by_name: string | null;
  created_at: string;
  lines: PogLine[];
}

interface AvailLine {
  id: number;
  plc_number: string;
  tag_no: string | null;
  service_description: string | null;
  item_code: string | null;
  item_description: string | null;
  uom: string | null;
  qty_required: string;
  status: string;
}

interface AuditEntry {
  id: number;
  event_type: string;
  old_status: string | null;
  new_status: string | null;
  changed_at: string;
  changed_by_name: string | null;
  notes: string | null;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "border-gray-300 bg-gray-50 text-gray-700" };
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">{children}</p>;
}

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="text-sm text-gray-900">{value || <span className="text-gray-400 italic">—</span>}</p>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PoGroupDetailPage() {
  const { pogId } = useParams<{ pogId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const id = parseInt(pogId ?? "0");

  // ── UI state ──
  const [headerDraft, setHeaderDraft] = useState<{
    paymentTerms: string; deliveryTerms: string; groupNotes: string;
  } | null>(null);
  const [lineEdits, setLineEdits] = useState<
    Record<number, { qty: string; unitRate: string; lineNotes: string }>
  >({});
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addPending, setAddPending] = useState<{
    lineId: number; qty: string; unitRate: string;
  } | null>(null);
  const [actionDialog, setActionDialog] = useState<
    "submit" | "approve" | "reject" | "cancel" | null
  >(null);
  const [dialogReason, setDialogReason] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);

  const isSenior = ["Superuser", "General Manager", "Senior Manager"].includes(
    (user as any)?.role ?? ""
  );

  // ── Queries ──
  const pogQ = useQuery<PogDetail>({
    queryKey: ["/api/epc-po-groups", id],
    queryFn: async () => {
      const r = await fetch(`/api/epc-po-groups/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load PO Group");
      return r.json();
    },
    enabled: !!id,
    staleTime: 0,
  });
  const pog = pogQ.data;
  const isDraft = pog?.status === "draft";

  const availQ = useQuery<AvailLine[]>({
    queryKey: ["/api/epc-po-groups", id, "available-lines"],
    queryFn: async () => {
      const r = await fetch(`/api/epc-po-groups/${id}/available-lines`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: addLineOpen && isDraft,
    staleTime: 0,
  });

  const auditQ = useQuery<AuditEntry[]>({
    queryKey: ["/api/epc-po-groups", id, "audit"],
    queryFn: async () => {
      const r = await fetch(`/api/epc-po-groups/${id}/audit`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: auditOpen,
    staleTime: 0,
  });

  // ── Computed ──
  const lines = pog?.lines ?? [];

  const effectiveLines = lines.map((l) => {
    const e = lineEdits[l.id];
    return {
      ...l,
      qty: parseFloat(e?.qty ?? l.line_qty) || 0,
      rate: parseFloat(e?.unitRate ?? l.line_unit_rate ?? "0") || 0,
    };
  });

  const grandTotal = effectiveLines.reduce((s, l) => s + l.qty * l.rate, 0);

  const hasLineEdits = Object.keys(lineEdits).length > 0;
  const hasHeaderEdits = headerDraft !== null && (
    headerDraft.paymentTerms !== (pog?.payment_terms ?? "") ||
    headerDraft.deliveryTerms !== (pog?.delivery_terms ?? "") ||
    headerDraft.groupNotes !== (pog?.group_notes ?? "")
  );

  const filteredAvail = useMemo(() => {
    if (!availQ.data) return [];
    const q = addSearch.toLowerCase();
    return availQ.data.filter(
      (l) =>
        l.plc_number.toLowerCase().includes(q) ||
        (l.tag_no ?? "").toLowerCase().includes(q) ||
        (l.item_description ?? "").toLowerCase().includes(q) ||
        (l.service_description ?? "").toLowerCase().includes(q)
    );
  }, [availQ.data, addSearch]);

  function initHeaderDraft() {
    if (!pog || headerDraft) return;
    setHeaderDraft({
      paymentTerms: pog.payment_terms ?? "",
      deliveryTerms: pog.delivery_terms ?? "",
      groupNotes: pog.group_notes ?? "",
    });
  }

  function getLineEdit(line: PogLine) {
    return lineEdits[line.id] ?? {
      qty: line.line_qty,
      unitRate: line.line_unit_rate ?? "0",
      lineNotes: line.line_notes ?? "",
    };
  }

  function setLineEdit(lineId: number, field: string, value: string) {
    setLineEdits((prev) => ({
      ...prev,
      [lineId]: { ...getLineEdit(lines.find((l) => l.id === lineId)!), ...prev[lineId], [field]: value },
    }));
  }

  // ── Invalidation helper ──
  function invalidate() {
    qc.invalidateQueries({ queryKey: ["/api/epc-po-groups", id] });
    qc.invalidateQueries({ queryKey: ["/api/epc-po-groups", id, "audit"] });
    qc.invalidateQueries({ queryKey: ["/api/epc-po-groups", id, "available-lines"] });
  }

  // ── Mutations ──
  const patchHeader = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiRequest("PATCH", `/api/epc-po-groups/${id}`, body),
    onSuccess: () => {
      setHeaderDraft(null);
      invalidate();
      toast({ title: "Header saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const patchLines = useMutation({
    mutationFn: (lineDetails: object[]) =>
      apiRequest("PATCH", `/api/epc-po-groups/${id}`, { lineDetails }),
    onSuccess: () => {
      setLineEdits({});
      invalidate();
      toast({ title: "Lines saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const removeLine = useMutation({
    mutationFn: (lineId: number) =>
      apiRequest("DELETE", `/api/epc-po-groups/${id}/lines/${lineId}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Line removed" });
    },
    onError: (e: any) => toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });

  const addLine = useMutation({
    mutationFn: (body: { plcLineId: number; qty: string; unitRate: string }) =>
      apiRequest("POST", `/api/epc-po-groups/${id}/lines`, body),
    onSuccess: () => {
      setAddPending(null);
      setAddSearch("");
      setAddLineOpen(false);
      invalidate();
      toast({ title: "Line added" });
    },
    onError: (e: any) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  const lifecycle = useMutation({
    mutationFn: ({ action, body }: { action: string; body: object }) =>
      apiRequest("POST", `/api/epc-po-groups/${id}/${action}`, body),
    onSuccess: () => {
      setActionDialog(null);
      setDialogReason("");
      invalidate();
      toast({ title: "Action completed" });
    },
    onError: (e: any) => toast({ title: "Action failed", description: e.message, variant: "destructive" }),
  });

  function saveHeader() {
    if (!headerDraft) return;
    patchHeader.mutate({
      paymentTerms: headerDraft.paymentTerms,
      deliveryTerms: headerDraft.deliveryTerms,
      groupNotes: headerDraft.groupNotes,
    });
  }

  function saveLines() {
    const lineDetails = Object.entries(lineEdits).map(([lineIdStr, edits]) => {
      const lineId = parseInt(lineIdStr);
      const line = lines.find((l) => l.id === lineId)!;
      return { plcLineId: line.plc_line_id, qty: edits.qty, unitRate: edits.unitRate, lineNotes: edits.lineNotes };
    });
    patchLines.mutate(lineDetails);
  }

  function doAction(action: "submit" | "approve" | "reject" | "cancel") {
    const bodyMap: Record<string, object> = {
      submit: { submissionNotes: dialogReason },
      approve: { approvalNotes: dialogReason },
      reject: { rejectionReason: dialogReason },
      cancel: { cancellationReason: dialogReason },
    };
    lifecycle.mutate({ action, body: bodyMap[action] });
  }

  // ── Loading / error ──
  if (pogQ.isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      </Layout>
    );
  }
  if (!pog) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-96 gap-3">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <p className="text-lg font-medium text-gray-700">PO Group not found</p>
          <Button variant="outline" onClick={() => navigate("/epc/procurement-list-control")}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>
      </Layout>
    );
  }

  // ── Render ──
  return (
    <Layout>
      <div className="flex flex-col h-full">

        {/* ─── Sticky Top Bar ──────────────────────────────────────────── */}
        <div className="border-b bg-white px-5 py-2.5 flex items-center gap-3 sticky top-0 z-20 shadow-sm">
          <Button
            variant="ghost" size="sm"
            className="text-gray-500 hover:text-gray-800 -ml-1"
            onClick={() => navigate("/epc/procurement-list-control")}
          >
            <ChevronLeft className="h-4 w-4 mr-0.5" /> Procurement
          </Button>
          <div className="w-px h-5 bg-gray-200" />
          <span className="font-mono text-base font-bold text-indigo-700 tracking-tight">
            {pog.pog_number}
          </span>
          <StatusBadge status={pog.status} />

          <div className="ml-auto flex items-center gap-2">
            {/* Draft actions */}
            {pog.status === "draft" && (
              <>
                <Button size="sm" onClick={() => { setDialogReason(""); setActionDialog("submit"); }}>
                  <Send className="h-3.5 w-3.5 mr-1.5" /> Submit for Approval
                </Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => { setDialogReason(""); setActionDialog("cancel"); }}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel
                </Button>
              </>
            )}
            {/* Submitted actions (senior only) */}
            {pog.status === "submitted" && isSenior && (
              <>
                <Button size="sm" className="bg-green-600 hover:bg-green-700"
                  onClick={() => { setDialogReason(""); setActionDialog("approve"); }}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve
                </Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => { setDialogReason(""); setActionDialog("reject"); }}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
                </Button>
              </>
            )}
            {pog.status === "submitted" && (
              <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50"
                onClick={() => { setDialogReason(""); setActionDialog("cancel"); }}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel
              </Button>
            )}
            {/* Approved — Issue PO (senior only, placeholder) */}
            {pog.status === "approved" && (
              <>
                {isSenior && (
                  <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                    <FileText className="h-3.5 w-3.5 mr-1.5" /> Issue PO
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50"
                  onClick={() => { setDialogReason(""); setActionDialog("cancel"); }}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel
                </Button>
              </>
            )}
            {pog.status === "po_issued" && pog.epc_po_number_actual && (
              <span className="text-xs font-mono text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-1">
                PO: {pog.epc_po_number_actual}
              </span>
            )}
          </div>
        </div>

        {/* ─── Body ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 max-w-screen-xl mx-auto space-y-5">

            {/* ─── Header Card ─────────────────────────────────────────── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Info className="h-4 w-4 text-indigo-400" /> General Information
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-4">
                {/* Row 1: reference fields */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                  <InfoField label="POG Number" value={<span className="font-mono font-semibold">{pog.pog_number}</span>} />
                  <InfoField label="Project" value={pog.project_code ?? "—"} />
                  <InfoField label="Currency" value={pog.currency} />
                  <InfoField label="Created" value={fmtDate(pog.created_at)} />
                </div>

                {/* Row 2: vendor */}
                <div className="grid grid-cols-1 gap-3">
                  <InfoField
                    label="Vendor"
                    value={pog.vendor_display_name || pog.vendor_name || "—"}
                  />
                </div>

                {/* Divider */}
                <div className="border-t pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">
                    Commercial Terms {isDraft && <span className="text-indigo-500 normal-case font-normal">(editable)</span>}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Payment Terms */}
                    <div>
                      <FieldLabel>Payment Terms</FieldLabel>
                      {isDraft ? (
                        <Select
                          value={headerDraft?.paymentTerms ?? (pog.payment_terms ?? "__none__")}
                          onValueChange={(v) => {
                            initHeaderDraft();
                            setHeaderDraft((prev) => ({
                              ...(prev ?? {
                                paymentTerms: pog.payment_terms ?? "",
                                deliveryTerms: pog.delivery_terms ?? "",
                                groupNotes: pog.group_notes ?? "",
                              }),
                              paymentTerms: v === "__none__" ? "" : v,
                            }));
                          }}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select payment terms…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Not set —</SelectItem>
                            {PAYMENT_TERMS_OPTIONS.map((o) => (
                              <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-gray-900">{pog.payment_terms || <span className="text-gray-400 italic">—</span>}</p>
                      )}
                    </div>

                    {/* Delivery Terms */}
                    <div>
                      <FieldLabel>Delivery Terms</FieldLabel>
                      {isDraft ? (
                        <Select
                          value={headerDraft?.deliveryTerms ?? (pog.delivery_terms ?? "__none__")}
                          onValueChange={(v) => {
                            initHeaderDraft();
                            setHeaderDraft((prev) => ({
                              ...(prev ?? {
                                paymentTerms: pog.payment_terms ?? "",
                                deliveryTerms: pog.delivery_terms ?? "",
                                groupNotes: pog.group_notes ?? "",
                              }),
                              deliveryTerms: v === "__none__" ? "" : v,
                            }));
                          }}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select delivery terms…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Not set —</SelectItem>
                            {DELIVERY_TERMS_OPTIONS.map((o) => (
                              <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-gray-900">{pog.delivery_terms || <span className="text-gray-400 italic">—</span>}</p>
                      )}
                    </div>
                  </div>

                  {/* Group Notes */}
                  <div className="mt-4">
                    <FieldLabel>Remarks / Group Notes</FieldLabel>
                    {isDraft ? (
                      <Textarea
                        rows={2}
                        className="text-sm resize-none"
                        placeholder="Any remarks or notes for this PO Group…"
                        value={headerDraft?.groupNotes ?? (pog.group_notes ?? "")}
                        onChange={(e) => {
                          initHeaderDraft();
                          setHeaderDraft((prev) => ({
                            ...(prev ?? {
                              paymentTerms: pog.payment_terms ?? "",
                              deliveryTerms: pog.delivery_terms ?? "",
                              groupNotes: pog.group_notes ?? "",
                            }),
                            groupNotes: e.target.value,
                          }));
                        }}
                      />
                    ) : (
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {pog.group_notes || <span className="text-gray-400 italic">—</span>}
                      </p>
                    )}
                  </div>

                  {isDraft && hasHeaderEdits && (
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" onClick={saveHeader} disabled={patchHeader.isPending}>
                        {patchHeader.isPending
                          ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          : <Save className="h-3.5 w-3.5 mr-1.5" />}
                        Save Header Changes
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ─── Line Items ──────────────────────────────────────────── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-700">
                  Line Items
                  <span className="ml-2 text-xs font-normal text-gray-400">({lines.length} line{lines.length !== 1 ? "s" : ""})</span>
                </CardTitle>
                {isDraft && (
                  <Button size="sm" variant="outline" onClick={() => { setAddSearch(""); setAddPending(null); setAddLineOpen(true); }}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Line
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-y text-left">
                        <th className="px-4 py-2 text-xs font-semibold text-gray-500 w-8">#</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500">PLC No</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500">Item Code</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 min-w-[180px]">Description</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 w-24">UOM</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right w-24">Qty</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right w-32">Unit Rate (₹)</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-right w-32">Line Total (₹)</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 min-w-[140px]">Remarks</th>
                        {isDraft && <th className="px-3 py-2 w-8" />}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={isDraft ? 10 : 9} className="text-center py-8 text-gray-400 text-sm italic">
                            No lines. {isDraft && "Click \"Add Line\" to add items."}
                          </td>
                        </tr>
                      )}
                      {lines.map((line) => {
                        const edit = lineEdits[line.id] ?? {
                          qty: line.line_qty,
                          unitRate: line.line_unit_rate ?? "0",
                          lineNotes: line.line_notes ?? "",
                        };
                        const qty = parseFloat(edit.qty) || 0;
                        const rate = parseFloat(edit.unitRate) || 0;
                        const lineTotal = qty * rate;
                        return (
                          <tr key={line.id} className="border-b hover:bg-gray-50/60 transition-colors">
                            <td className="px-4 py-2 text-xs text-gray-400 tabular-nums">{line.line_number}</td>
                            <td className="px-3 py-2 font-mono text-xs text-indigo-700 whitespace-nowrap">
                              {line.plc_number}
                              {line.tag_no && (
                                <span className="ml-1 text-gray-500">· {line.tag_no}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-700">
                              {line.item_code || <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-800">
                              {line.item_description || line.service_description || (
                                <span className="text-gray-400 italic">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600">
                              {line.uom || "—"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {isDraft ? (
                                <Input
                                  type="number" min="0" step="0.01"
                                  className="h-7 text-right text-xs w-20 ml-auto"
                                  value={edit.qty}
                                  onChange={(e) => setLineEdit(line.id, "qty", e.target.value)}
                                />
                              ) : (
                                <span className="text-xs tabular-nums">{parseFloat(line.line_qty).toLocaleString("en-IN")}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {isDraft ? (
                                <Input
                                  type="number" min="0" step="0.01"
                                  className="h-7 text-right text-xs w-28 ml-auto"
                                  value={edit.unitRate}
                                  onChange={(e) => setLineEdit(line.id, "unitRate", e.target.value)}
                                />
                              ) : (
                                <span className="text-xs tabular-nums">
                                  {line.line_unit_rate ? fmt(parseFloat(line.line_unit_rate)) : "—"}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">
                              {lineTotal > 0 ? fmt(lineTotal) : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {isDraft ? (
                                <Input
                                  className="h-7 text-xs"
                                  placeholder="Notes…"
                                  value={edit.lineNotes}
                                  onChange={(e) => setLineEdit(line.id, "lineNotes", e.target.value)}
                                />
                              ) : (
                                <span className="text-xs text-gray-600">{line.line_notes || "—"}</span>
                              )}
                            </td>
                            {isDraft && (
                              <td className="px-3 py-2">
                                <button
                                  title="Remove line"
                                  disabled={removeLine.isPending}
                                  className="text-gray-300 hover:text-red-500 transition-colors"
                                  onClick={() => removeLine.mutate(line.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t">
                        <td colSpan={isDraft ? 7 : 7} className="px-4 py-2 text-right text-xs font-semibold text-gray-600">
                          Grand Total
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 tabular-nums">
                          ₹ {fmt(grandTotal)}
                        </td>
                        <td colSpan={isDraft ? 2 : 1} />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Save Lines bar */}
                {isDraft && hasLineEdits && (
                  <div className="flex justify-end gap-3 px-5 py-3 border-t bg-amber-50/60">
                    <Button size="sm" variant="outline" onClick={() => setLineEdits({})}>
                      Discard
                    </Button>
                    <Button size="sm" onClick={saveLines} disabled={patchLines.isPending}>
                      {patchLines.isPending
                        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        : <Save className="h-3.5 w-3.5 mr-1.5" />}
                      Save Line Changes
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ─── Approval Chain ──────────────────────────────────────── */}
            <Collapsible open={approvalOpen} onOpenChange={setApprovalOpen}>
              <Card className="shadow-sm">
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-3 pt-4 px-5 cursor-pointer hover:bg-gray-50/60 rounded-t-lg transition-colors">
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      Approval Chain
                      {approvalOpen ? <ChevronDown className="h-4 w-4 ml-auto text-gray-400" /> : <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />}
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="px-5 pb-5 pt-0">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                      <InfoField label="Submitted By" value={pog.submitted_by_name} />
                      <InfoField label="Submitted At" value={pog.submitted_at ? fmtDateTime(pog.submitted_at) : undefined} />
                      <InfoField label="Submission Notes" value={pog.submission_notes} />
                      <InfoField label="Approved / Rejected By" value={pog.approved_by_name || pog.rejected_by_name} />
                      <InfoField label="Approved At" value={pog.approved_at ? fmtDateTime(pog.approved_at) : undefined} />
                      <InfoField label="Approval Notes" value={pog.approval_notes} />
                      {pog.rejection_reason && (
                        <div className="col-span-3">
                          <FieldLabel>Rejection Reason</FieldLabel>
                          <p className="text-sm text-red-700 bg-red-50 rounded px-3 py-2 border border-red-200">
                            {pog.rejection_reason}
                          </p>
                        </div>
                      )}
                      {pog.cancellation_reason && (
                        <div className="col-span-3">
                          <FieldLabel>Cancellation Reason</FieldLabel>
                          <p className="text-sm text-orange-700 bg-orange-50 rounded px-3 py-2 border border-orange-200">
                            {pog.cancellation_reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* ─── Activity Log ────────────────────────────────────────── */}
            <Collapsible open={auditOpen} onOpenChange={setAuditOpen}>
              <Card className="shadow-sm">
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-3 pt-4 px-5 cursor-pointer hover:bg-gray-50/60 rounded-t-lg transition-colors">
                    <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <History className="h-4 w-4 text-indigo-400" />
                      Activity Log
                      {auditOpen ? <ChevronDown className="h-4 w-4 ml-auto text-gray-400" /> : <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />}
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="px-5 pb-4 pt-0">
                    {auditQ.isLoading && (
                      <div className="flex items-center gap-2 py-4 text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                      </div>
                    )}
                    {!auditQ.isLoading && (!auditQ.data || auditQ.data.length === 0) && (
                      <p className="text-sm text-gray-400 italic py-2">No activity recorded.</p>
                    )}
                    {auditQ.data && auditQ.data.length > 0 && (
                      <div className="space-y-2">
                        {auditQ.data.map((a) => (
                          <div key={a.id} className="flex items-start gap-3 text-xs border-b pb-2 last:border-0">
                            <span className="text-gray-400 tabular-nums whitespace-nowrap mt-0.5">
                              {fmtDateTime(a.changed_at)}
                            </span>
                            <div>
                              <span className="font-medium text-gray-700">{a.event_type.replace(/_/g, " ")}</span>
                              {a.changed_by_name && <span className="text-gray-500"> · {a.changed_by_name}</span>}
                              {a.notes && <p className="text-gray-500 mt-0.5 italic">{a.notes}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

          </div>
        </div>
      </div>

      {/* ─── Action Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!actionDialog} onOpenChange={(o) => { if (!o) setActionDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionDialog === "submit" && "Submit PO Group for Approval"}
              {actionDialog === "approve" && "Approve PO Group"}
              {actionDialog === "reject" && "Reject PO Group"}
              {actionDialog === "cancel" && "Cancel PO Group"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {actionDialog === "reject" || actionDialog === "cancel" ? (
              <>
                <p className="text-sm text-gray-500">
                  {actionDialog === "reject"
                    ? "Please provide a reason for rejection."
                    : "Please provide a reason for cancellation."}
                </p>
                <Textarea
                  rows={3}
                  placeholder="Enter reason…"
                  value={dialogReason}
                  onChange={(e) => setDialogReason(e.target.value)}
                />
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  {actionDialog === "submit"
                    ? "Add any submission notes (optional)."
                    : "Add any approval notes (optional)."}
                </p>
                <Textarea
                  rows={2}
                  placeholder="Notes (optional)…"
                  value={dialogReason}
                  onChange={(e) => setDialogReason(e.target.value)}
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              disabled={lifecycle.isPending || (
                (actionDialog === "reject" || actionDialog === "cancel") && !dialogReason.trim()
              )}
              variant={actionDialog === "reject" || actionDialog === "cancel" ? "destructive" : "default"}
              onClick={() => actionDialog && doAction(actionDialog)}
            >
              {lifecycle.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {actionDialog === "submit" && "Submit"}
              {actionDialog === "approve" && "Approve"}
              {actionDialog === "reject" && "Reject"}
              {actionDialog === "cancel" && "Cancel POG"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add Line Dialog ───────────────────────────────────────────── */}
      <Dialog open={addLineOpen} onOpenChange={(o) => { if (!o) { setAddLineOpen(false); setAddPending(null); setAddSearch(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Line to PO Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search by PLC No, Tag, or Description…"
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              className="h-9"
            />
            <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
              {availQ.isLoading && (
                <div className="flex items-center gap-2 p-4 text-gray-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading available lines…
                </div>
              )}
              {!availQ.isLoading && filteredAvail.length === 0 && (
                <p className="text-sm text-gray-400 italic p-4 text-center">
                  {availQ.data?.length === 0
                    ? "No eligible lines available for this project."
                    : "No lines match your search."}
                </p>
              )}
              {filteredAvail.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">PLC No</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Item / Description</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 w-16">UOM</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-500 w-16">Qty Req.</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAvail.map((l) => {
                      const isSelected = addPending?.lineId === l.id;
                      return (
                        <tr
                          key={l.id}
                          className={`border-b cursor-pointer hover:bg-indigo-50/60 transition-colors ${isSelected ? "bg-indigo-50" : ""}`}
                          onClick={() => setAddPending({ lineId: l.id, qty: l.qty_required, unitRate: "0" })}
                        >
                          <td className="px-3 py-2 font-mono text-indigo-700">{l.plc_number}</td>
                          <td className="px-3 py-2 text-gray-700 max-w-[220px]">
                            {l.tag_no && <strong>{l.tag_no} — </strong>}
                            {l.item_description || l.service_description || "—"}
                            {l.item_code && <span className="ml-1 text-gray-400">({l.item_code})</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{l.uom || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {parseFloat(l.qty_required).toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-2">
                            {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Rate inputs for selected line */}
            {addPending && (
              <div className="border rounded-lg p-3 bg-indigo-50/40 space-y-3">
                <p className="text-xs font-semibold text-indigo-700">Enter quantities for selected line</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Qty</FieldLabel>
                    <Input
                      type="number" min="0" step="0.01"
                      className="h-8 text-sm"
                      value={addPending.qty}
                      onChange={(e) => setAddPending((p) => p ? { ...p, qty: e.target.value } : p)}
                    />
                  </div>
                  <div>
                    <FieldLabel>Unit Rate (₹)</FieldLabel>
                    <Input
                      type="number" min="0" step="0.01"
                      className="h-8 text-sm"
                      value={addPending.unitRate}
                      onChange={(e) => setAddPending((p) => p ? { ...p, unitRate: e.target.value } : p)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddLineOpen(false); setAddPending(null); setAddSearch(""); }}>
              Close
            </Button>
            <Button
              disabled={!addPending || addLine.isPending}
              onClick={() => addPending && addLine.mutate({ plcLineId: addPending.lineId, qty: addPending.qty, unitRate: addPending.unitRate })}
            >
              {addLine.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Add Line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
