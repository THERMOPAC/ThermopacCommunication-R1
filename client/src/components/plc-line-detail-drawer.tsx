import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Loader2, Clock, AlertTriangle, Save, RotateCcw } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlcLineDetail {
  id: number; plcNumber: string; tagNo: string | null; serviceDescription: string | null;
  equipmentReference: string | null; subgroupCode: string | null; subgroupLabel: string | null;
  qtyRequired: string; qtyOrdered: string; qtyReceived: string; qtyBalance: string;
  qtyOverProcured: string; status: string; priority: string; requiredByDate: string | null;
  avlStatus: string; avlBypassReason: string | null; avlBypassedByName: string | null;
  avlBypassedAt: string | null; revisionActionRequired: string;
  specificationNotes: string | null; internalNotes: string | null;
  vendorId: number | null; vendorName: string | null; vendorDisplayName: string | null;
  activePoGroupId: number | null; activePoGroupNumber: string | null;
  activeEpcPoId: number | null; epcPoNumber: string | null;
  planningNumber: string | null; masterItemId: number | null;
  itemCode: string | null; itemDescription: string | null; uom: string | null;
  createdByName: string | null; createdAt: string; updatedAt: string;
}

interface AuditEntry {
  id: number; eventType: string; oldStatus: string | null; newStatus: string | null;
  changedByName: string | null; changedAt: string; notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pr_raised: "bg-yellow-100 text-yellow-800",
  in_po_group: "bg-blue-100 text-blue-800",
  po_issued: "bg-indigo-100 text-indigo-800",
  partial_received: "bg-orange-100 text-orange-800",
  fully_received: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};
const STATUS_LABELS: Record<string, string> = {
  pr_raised: "PR Raised", in_po_group: "In PO Group", po_issued: "PO Issued",
  partial_received: "Partial Received", fully_received: "Fully Received",
  closed: "Closed", cancelled: "Cancelled",
};
const AVL_COLORS: Record<string, string> = {
  qualified: "bg-green-100 text-green-800",
  conditionally_qualified: "bg-yellow-100 text-yellow-800",
  not_qualified: "bg-red-100 text-red-700",
  not_checked: "bg-gray-100 text-gray-600",
  bypassed: "bg-amber-100 text-amber-800",
};

export function PlcLineDetailDrawer({
  lineId,
  onClose,
  onMutated,
}: {
  lineId: number;
  onClose: () => void;
  onMutated: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editPriority, setEditPriority] = useState<string>("");
  const [editRequiredBy, setEditRequiredBy] = useState<string>("");
  const [editSpecNotes, setEditSpecNotes] = useState<string>("");
  const [editInternalNotes, setEditInternalNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const { data: line, isLoading } = useQuery<PlcLineDetail>({
    queryKey: ["/api/procurement-list-lines", lineId],
    queryFn: () => apiRequest("GET", `/api/procurement-list-lines/${lineId}`).then((r) => r.json()),
  });

  const { data: history = [] } = useQuery<AuditEntry[]>({
    queryKey: ["/api/procurement-list-lines", lineId, "history"],
    queryFn: () => apiRequest("GET", `/api/procurement-list-lines/${lineId}/history`).then((r) => r.json()),
    enabled: !!line,
  });

  function startEditing() {
    if (!line) return;
    setEditPriority(line.priority);
    setEditRequiredBy(line.requiredByDate ?? "");
    setEditSpecNotes(line.specificationNotes ?? "");
    setEditInternalNotes(line.internalNotes ?? "");
    setEditing(true);
  }

  async function saveEdits() {
    setSaving(true);
    try {
      const r = await apiRequest("PATCH", `/api/procurement-list-lines/${lineId}`, {
        priority: editPriority,
        requiredByDate: editRequiredBy || null,
        specificationNotes: editSpecNotes || null,
        internalNotes: editInternalNotes || null,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Save failed"); }
      toast({ title: "Saved", description: "PLC line updated." });
      qc.invalidateQueries({ queryKey: ["/api/procurement-list-lines", lineId] });
      onMutated();
      setEditing(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function recompute() {
    setRecomputing(true);
    try {
      await apiRequest("POST", `/api/procurement-list-lines/${lineId}/recompute`);
      qc.invalidateQueries({ queryKey: ["/api/procurement-list-lines", lineId] });
      onMutated();
      toast({ title: "Recomputed", description: "Qty fields refreshed from POG and GRN records." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  }

  if (isLoading) {
    return (
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="w-full max-w-2xl overflow-y-auto">
          <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!line) return null;

  const qtyReqd = parseFloat(line.qtyRequired) || 0;
  const qtyOrd  = parseFloat(line.qtyOrdered) || 0;
  const qtyRcvd = parseFloat(line.qtyReceived) || 0;
  const qtyBal  = parseFloat(line.qtyBalance) || 0;
  const qtyOver = parseFloat(line.qtyOverProcured) || 0;

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-3 border-b">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SheetTitle className="font-mono text-indigo-700">{line.plcNumber}</SheetTitle>
            <div className="flex items-center gap-2">
              {line.revisionActionRequired !== "none" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                  <AlertTriangle className="h-3 w-3" />
                  {line.revisionActionRequired.replace(/_/g, " ")}
                </span>
              )}
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[line.status] ?? "bg-gray-100"}`}>
                {STATUS_LABELS[line.status] ?? line.status}
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {line.tagNo && <><strong>{line.tagNo}</strong> — </>}
            {line.serviceDescription ?? line.itemDescription ?? line.itemCode ?? "No description"}
          </p>
        </SheetHeader>

        <div className="mt-4">
          <Tabs defaultValue="details">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="qty">Qty Tracking</TabsTrigger>
              <TabsTrigger value="history">History ({history.length})</TabsTrigger>
            </TabsList>

            {/* ── Details ── */}
            <TabsContent value="details" className="mt-4 space-y-4">
              {/* Identifiers */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-muted-foreground block">PLC Number</span><p className="font-mono font-medium text-indigo-700">{line.plcNumber}</p></div>
                <div><span className="text-xs text-muted-foreground block">Planning No</span><p className="font-mono">{line.planningNumber ?? "—"}</p></div>
                <div><span className="text-xs text-muted-foreground block">Subgroup</span><p>{line.subgroupLabel ?? line.subgroupCode ?? "—"}</p></div>
                <div><span className="text-xs text-muted-foreground block">Item Code</span><p className="font-mono">{line.itemCode ?? "—"}</p></div>
                <div><span className="text-xs text-muted-foreground block">Vendor</span><p>{line.vendorDisplayName ?? line.vendorName ?? "—"}</p></div>
                <div>
                  <span className="text-xs text-muted-foreground block">AVL Status</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${AVL_COLORS[line.avlStatus] ?? "bg-gray-100 text-gray-600"}`}>
                    {line.avlStatus.replace(/_/g, " ")}
                  </span>
                  {line.avlStatus === "bypassed" && line.avlBypassReason && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">"{line.avlBypassReason}"</p>
                  )}
                </div>
                {line.activePoGroupNumber && (
                  <div><span className="text-xs text-muted-foreground block">PO Group</span><p className="font-mono text-blue-700">{line.activePoGroupNumber}</p></div>
                )}
                {line.epcPoNumber && (
                  <div><span className="text-xs text-muted-foreground block">EPC PO No</span><p className="font-mono text-indigo-700">{line.epcPoNumber}</p></div>
                )}
              </div>

              {/* Editable fields */}
              {editing ? (
                <div className="rounded-lg border bg-blue-50/30 p-4 space-y-3">
                  <p className="text-sm font-medium text-blue-700">Editing</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Priority</label>
                      <Select value={editPriority} onValueChange={setEditPriority}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="expedite">Expedite</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Required By</label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={editRequiredBy}
                        onChange={(e) => setEditRequiredBy(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Specification Notes</label>
                    <Textarea rows={2} value={editSpecNotes} onChange={(e) => setEditSpecNotes(e.target.value)} className="text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Internal Notes</label>
                    <Textarea rows={2} value={editInternalNotes} onChange={(e) => setEditInternalNotes(e.target.value)} className="text-xs" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdits} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Priority</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs capitalize ${line.priority === "critical" ? "bg-red-100 text-red-700" : line.priority === "expedite" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                      {line.priority}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Required By</span>
                    <p>{line.requiredByDate ? fmtDate(line.requiredByDate) : "—"}</p>
                  </div>
                  {line.specificationNotes && (
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground block">Specification Notes</span>
                      <p className="text-xs mt-0.5">{line.specificationNotes}</p>
                    </div>
                  )}
                  {line.internalNotes && (
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground block">Internal Notes</span>
                      <p className="text-xs mt-0.5">{line.internalNotes}</p>
                    </div>
                  )}
                  {!["cancelled", "fully_received", "closed"].includes(line.status) && (
                    <div className="col-span-2">
                      <Button size="sm" variant="outline" onClick={startEditing}>Edit Details</Button>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Created by {line.createdByName ?? "unknown"} on {fmtDateTime(line.createdAt)}
              </p>
            </TabsContent>

            {/* ── Qty Tracking ── */}
            <TabsContent value="qty" className="mt-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Qty Required", value: qtyReqd, color: "text-gray-900" },
                  { label: "Qty Ordered",  value: qtyOrd,  color: "text-blue-700" },
                  { label: "Qty Received", value: qtyRcvd, color: "text-green-700" },
                  { label: "Qty Balance",  value: qtyBal,  color: qtyBal === 0 ? "text-green-700" : "text-orange-700" },
                  { label: "Over-Procured", value: qtyOver, color: qtyOver > 0 ? "text-red-700" : "text-gray-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className={`text-2xl font-bold tabular-nums ${color}`}>
                      {value.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">{line.uom ?? "units"}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <Button size="sm" variant="outline" onClick={recompute} disabled={recomputing}>
                  {recomputing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />}
                  Recompute from POG & GRN
                </Button>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Recalculates qty_ordered from active PO Groups and qty_received from accepted GRN records.
                </p>
              </div>

              {qtyOver > 0 && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Over-procurement of <strong>{qtyOver.toFixed(2)} {line.uom ?? "units"}</strong>. Ordered quantity exceeds required quantity. Review the PO Group and raise an amendment if needed.</span>
                </div>
              )}
            </TabsContent>

            {/* ── History ── */}
            <TabsContent value="history" className="mt-4">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No history recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-start gap-2.5 text-xs text-gray-600 border-b pb-2">
                      <Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                      <div>
                        <span className="text-gray-400 mr-1.5">{fmtDateTime(h.changedAt)}</span>
                        <span className="font-medium mr-1">{h.changedByName ?? "System"}</span>
                        <span className="text-gray-700">{h.eventType.replace(/_/g, " ")}</span>
                        {h.oldStatus && h.newStatus && h.oldStatus !== h.newStatus && (
                          <span className="ml-1 text-gray-500">
                            ({h.oldStatus} → {h.newStatus})
                          </span>
                        )}
                        {h.notes && <p className="text-gray-400 mt-0.5 italic">"{h.notes}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
