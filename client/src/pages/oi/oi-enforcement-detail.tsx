import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ShieldAlert, AlertTriangle, CheckCircle, Clock, ChevronLeft, PlayCircle, PauseCircle, Archive, Plus, Shield, FileText } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import {
  CONTROL_STATUS_LABELS, CONTROL_STATUS_COLORS, HOLD_STATUS_LABELS, HOLD_STATUS_COLORS,
  ENFORCEMENT_LEVEL_LABELS, ENFORCEMENT_LEVEL_COLORS, CONTROL_TYPE_LABELS,
  ERP_ENTITY_TYPE_LABELS, ENFORCEMENT_SCOPE_LABELS, RESPONSE_STATUS_LABELS,
} from "./oi-enforcement-constants";

function StatusBadge({ value, map, colorMap }: { value: string; map: Record<string, string>; colorMap: Record<string, string> }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorMap[value] ?? "bg-gray-100 text-gray-700"}`}>{map[value] ?? value}</span>;
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ ctrl, onRefresh }: { ctrl: any; onRefresh: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showTransition, setShowTransition] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const transitionMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/oi/enforcement/controls/${ctrl.id}/transition`, body),
    onSuccess: () => {
      toast({ title: "Control updated" });
      setShowTransition(null);
      setReason("");
      onRefresh();
      qc.invalidateQueries({ queryKey: ["/api/oi/enforcement/controls"] });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const doTransition = (action: string) => {
    const body: any = { action };
    if (action === "suspend") body.suspensionReason = reason;
    if (action === "retire") body.retirementReason = reason;
    transitionMut.mutate(body);
  };

  return (
    <div className="space-y-4">
      {/* Details card */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Shield className="h-4 w-4 text-blue-600" />Control Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {[
              ["Control Number", ctrl.controlNumber],
              ["Status", <StatusBadge key="s" value={ctrl.status} map={CONTROL_STATUS_LABELS} colorMap={CONTROL_STATUS_COLORS} />],
              ["Enforcement Level", <span key="l" className={`px-2 py-0.5 rounded text-xs font-medium ${ENFORCEMENT_LEVEL_COLORS[ctrl.enforcementLevel]}`}>{ENFORCEMENT_LEVEL_LABELS[ctrl.enforcementLevel]}</span>],
              ["Control Type", CONTROL_TYPE_LABELS[ctrl.controlType] ?? ctrl.controlType],
              ["ERP Entity Type", ERP_ENTITY_TYPE_LABELS[ctrl.erpEntityType] ?? ctrl.erpEntityType],
              ["Scope", ENFORCEMENT_SCOPE_LABELS[ctrl.enforcementScope] ?? ctrl.enforcementScope],
              ["Department", ctrl.department],
              ["Process Area", ctrl.processArea ?? "—"],
              ["Open Holds", String(ctrl.openHoldCount ?? 0)],
              ["SOP Revision", String(ctrl.sopRevisionNumber)],
              ["Created", fmtDate(ctrl.createdAt)],
              ["Last Updated", fmtDate(ctrl.updatedAt)],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex items-center gap-2 py-1 border-b border-gray-50">
                <span className="text-gray-500 w-36 shrink-0">{label}</span>
                <span className="text-gray-800 font-medium">{val as any}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">Description &amp; Rationale</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><p className="text-xs text-gray-500 mb-1">Description</p><p className="text-sm text-gray-800">{ctrl.description}</p></div>
          <div><p className="text-xs text-gray-500 mb-1">Rationale</p><p className="text-sm text-gray-800">{ctrl.rationale}</p></div>
        </CardContent>
      </Card>

      {/* Linked SOP */}
      {ctrl.sop && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><FileText className="h-4 w-4 text-green-600" />Linked SOP</CardTitle></CardHeader>
          <CardContent>
            <Link href={`/oi/sop/${ctrl.sop.id}`} className="text-blue-600 hover:underline text-sm font-medium">{ctrl.sop.sopNumber} — {ctrl.sop.title}</Link>
            <div className="flex gap-3 mt-1 text-xs text-gray-500">
              <span>Rev {ctrl.sop.revisionNumber}</span>
              <span>•</span>
              <span>{ctrl.sop.department}</span>
              <span>•</span>
              <span className="capitalize">{ctrl.sop.status}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transitions */}
      <div className="flex flex-wrap gap-2">
        {ctrl.status === "draft"     && <Button size="sm" className="gap-1" onClick={() => doTransition("activate")} disabled={transitionMut.isPending}><PlayCircle className="h-3 w-3" />Activate</Button>}
        {ctrl.status === "suspended" && <Button size="sm" className="gap-1" onClick={() => doTransition("activate")} disabled={transitionMut.isPending}><PlayCircle className="h-3 w-3" />Reactivate</Button>}
        {ctrl.status === "active"    && <Button size="sm" variant="outline" className="gap-1 border-yellow-400 text-yellow-700" onClick={() => setShowTransition("suspend")}><PauseCircle className="h-3 w-3" />Suspend</Button>}
        {(ctrl.status === "active" || ctrl.status === "suspended") && <Button size="sm" variant="outline" className="gap-1 border-red-400 text-red-700" onClick={() => setShowTransition("retire")}><Archive className="h-3 w-3" />Retire</Button>}
      </div>

      {/* Reason dialog */}
      <Dialog open={!!showTransition} onOpenChange={() => { setShowTransition(null); setReason(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{showTransition === "suspend" ? "Suspend Control" : "Retire Control"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>{showTransition === "suspend" ? "Suspension Reason" : "Retirement Reason"} <span className="text-red-500">*</span></Label>
            <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Minimum 10 characters…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransition(null)}>Cancel</Button>
            <Button onClick={() => doTransition(showTransition!)} disabled={reason.trim().length < 10 || transitionMut.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Checklist Tab ────────────────────────────────────────────────────────────
function ChecklistTab({ ctrl }: { ctrl: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEvidence, setNewEvidence] = useState(false);

  const { data: items, isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/enforcement/controls", ctrl.id, "checklist"],
    queryFn: async () => { const r = await fetch(`/api/oi/enforcement/controls/${ctrl.id}/checklist`); if (!r.ok) return []; return r.json(); },
  });

  const addMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/oi/enforcement/controls/${ctrl.id}/checklist`, body),
    onSuccess: () => {
      toast({ title: "Checklist item added" });
      setShowAdd(false); setNewTitle(""); setNewDesc(""); setNewEvidence(false);
      qc.invalidateQueries({ queryKey: ["/api/oi/enforcement/controls", ctrl.id, "checklist"] });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const delMut = useMutation({
    mutationFn: (itemId: number) => apiRequest("DELETE", `/api/oi/enforcement/controls/${ctrl.id}/checklist/${itemId}`),
    onSuccess: () => {
      toast({ title: "Item removed" });
      qc.invalidateQueries({ queryKey: ["/api/oi/enforcement/controls", ctrl.id, "checklist"] });
    },
  });

  if (isLoading) return <Skeleton className="h-40 rounded" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">{items?.length ?? 0} checklist item{items?.length !== 1 ? "s" : ""} (v{ctrl.controlChecklistVersion})</p>
        {ctrl.status === "draft" && (
          <Button size="sm" className="gap-1" onClick={() => setShowAdd(true)}><Plus className="h-3 w-3" /> Add Item</Button>
        )}
      </div>

      {(!items || items.length === 0) && (
        <div className="text-center py-10 text-gray-400"><Shield className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No checklist items yet</p></div>
      )}

      {items?.map(item => (
        <Card key={item.id} className="border-l-2 border-l-blue-200">
          <CardContent className="p-3 flex items-start gap-3">
            <span className="text-xs font-mono text-gray-400 w-8 shrink-0 mt-0.5">#{item.itemNumber}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{item.title}</p>
              {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
              <div className="flex gap-2 mt-1">
                {item.isRequired && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">Required</span>}
                {item.evidenceRequired && <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Evidence Required</span>}
              </div>
            </div>
            {ctrl.status === "draft" && (
              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 h-7 w-7 p-0 shrink-0" onClick={() => delMut.mutate(item.id)} disabled={delMut.isPending}>×</Button>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Checklist Item</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Title <span className="text-red-500">*</span></Label><Input className="mt-1" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Min 5 characters" /></div>
            <div><Label>Description</Label><Textarea className="mt-1" rows={2} value={newDesc} onChange={e => setNewDesc(e.target.value)} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="evid" checked={newEvidence} onChange={e => setNewEvidence(e.target.checked)} />
              <Label htmlFor="evid" className="cursor-pointer">Evidence Required</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMut.mutate({ title: newTitle, description: newDesc, evidenceRequired: newEvidence })} disabled={newTitle.length < 5 || addMut.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Holds Tab ────────────────────────────────────────────────────────────────
function HoldsTab({ ctrl }: { ctrl: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedHold, setExpandedHold] = useState<number | null>(null);
  const [actionModal, setActionModal] = useState<{ holdId: number; action: string } | null>(null);
  const [actionReason, setActionReason] = useState("");

  const { data: holds, isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/enforcement/controls", ctrl.id, "holds"],
    queryFn: async () => { const r = await fetch(`/api/oi/enforcement/holds?control_id=${ctrl.id}`); if (!r.ok) return []; return r.json(); },
  });

  const actionMut = useMutation({
    mutationFn: ({ holdId, action, body }: { holdId: number; action: string; body: any }) =>
      apiRequest("POST", `/api/oi/enforcement/holds/${holdId}/${action}`, body),
    onSuccess: () => {
      toast({ title: "Hold updated" });
      setActionModal(null); setActionReason("");
      qc.invalidateQueries({ queryKey: ["/api/oi/enforcement/controls", ctrl.id, "holds"] });
      qc.invalidateQueries({ queryKey: ["/api/oi/enforcement/holds"] });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const doHoldAction = () => {
    if (!actionModal) return;
    const { holdId, action } = actionModal;
    const bodyMap: Record<string, any> = {
      approve:          { note: actionReason },
      release:          { releaseNote: actionReason },
      override:         { overrideReason: actionReason },
      "emergency-bypass": { bypassReason: actionReason },
    };
    actionMut.mutate({ holdId, action, body: bodyMap[action] ?? {} });
  };

  if (isLoading) return <Skeleton className="h-40 rounded" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{(holds ?? []).filter(h => h.status === "open").length} open hold{(holds ?? []).filter(h => h.status === "open").length !== 1 ? "s" : ""} of {holds?.length ?? 0} total</p>

      {(!holds || holds.length === 0) && (
        <div className="text-center py-10 text-gray-400"><CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No holds for this control</p></div>
      )}

      {holds?.map(hold => (
        <Card key={hold.id} className={`border-l-4 ${hold.status === "open" ? (hold.enforcementLevel === "mandatory" ? "border-l-red-500" : "border-l-orange-400") : "border-l-gray-300"}`}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-gray-500">{hold.holdNumber}</span>
                  <StatusBadge value={hold.status} map={HOLD_STATUS_LABELS} colorMap={HOLD_STATUS_COLORS} />
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ENFORCEMENT_LEVEL_COLORS[hold.enforcementLevel]}`}>{ENFORCEMENT_LEVEL_LABELS[hold.enforcementLevel]}</span>
                  {hold.isPrimaryHold && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">Primary Hold</span>}
                </div>
                <p className="text-sm text-gray-700 mt-1">{hold.reason}</p>
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  <span>{ERP_ENTITY_TYPE_LABELS[hold.erpEntityType] ?? hold.erpEntityType}:{hold.erpEntityRef ?? hold.erpEntityId}</span>
                  <span>•</span><span>{hold.responsibleDepartment}</span>
                  <span>•</span><span>{fmtDate(hold.raisedAt)}</span>
                </div>
                {hold.status === "emergency_bypassed" && hold.bypassReason && (
                  <div className="mt-2 p-2 bg-purple-50 rounded text-xs text-purple-800"><span className="font-semibold">⚠ Emergency Bypass:</span> {hold.bypassReason}</div>
                )}
                {hold.status === "overridden" && hold.overrideReason && (
                  <div className="mt-2 p-2 bg-orange-50 rounded text-xs text-orange-800"><span className="font-semibold">Override:</span> {hold.overrideReason}</div>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {hold.status === "open" && hold.enforcementLevel === "mandatory" &&
                  <Button size="sm" variant="outline" className="text-xs h-6 px-2" onClick={() => { setActionModal({ holdId: hold.id, action: "approve" }); setActionReason(""); }}>Approve to Proceed</Button>}
                {(hold.status === "open" || hold.status === "approved_to_proceed") &&
                  <Button size="sm" variant="outline" className="text-xs h-6 px-2" onClick={() => { setActionModal({ holdId: hold.id, action: "release" }); setActionReason(""); }}>Release</Button>}
                {(hold.status === "open" || hold.status === "approved_to_proceed") &&
                  <Button size="sm" variant="outline" className="text-xs h-6 px-2 border-orange-400 text-orange-700" onClick={() => { setActionModal({ holdId: hold.id, action: "override" }); setActionReason(""); }}>Override</Button>}
                {(hold.status === "open" || hold.status === "approved_to_proceed") &&
                  <Button size="sm" variant="outline" className="text-xs h-6 px-2 border-purple-400 text-purple-700" onClick={() => { setActionModal({ holdId: hold.id, action: "emergency-bypass" }); setActionReason(""); }}>Emergency Bypass</Button>}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Hold action dialog */}
      <Dialog open={!!actionModal} onOpenChange={() => { setActionModal(null); setActionReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionModal?.action === "approve" && "Approve to Proceed"}
              {actionModal?.action === "release" && "Release Hold"}
              {actionModal?.action === "override" && "Override Hold"}
              {actionModal?.action === "emergency-bypass" && "⚠ Emergency Bypass"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {actionModal?.action === "emergency-bypass" && (
              <div className="p-3 bg-purple-50 rounded text-sm text-purple-800 font-medium">Emergency bypass is logged with full visibility to all management. This action is irreversible and audited.</div>
            )}
            <Label>
              {actionModal?.action === "approve" ? "Note (min 10 chars)" : "Reason (min 20 chars for override/bypass)"}
              <span className="text-red-500 ml-1">*</span>
            </Label>
            <Textarea rows={3} value={actionReason} onChange={e => setActionReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionModal(null)}>Cancel</Button>
            <Button
              onClick={doHoldAction}
              disabled={actionReason.trim().length < (actionModal?.action === "approve" ? 10 : 20) || actionMut.isPending}
              className={actionModal?.action === "emergency-bypass" ? "bg-purple-600 hover:bg-purple-700" : ""}
            >Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Checklist Responses Tab ─────────────────────────────────────────────────
function ResponsesTab({ ctrl }: { ctrl: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: holds } = useQuery<any[]>({
    queryKey: ["/api/oi/enforcement/controls", ctrl.id, "holds"],
    queryFn: async () => { const r = await fetch(`/api/oi/enforcement/holds?control_id=${ctrl.id}`); if (!r.ok) return []; return r.json(); },
  });

  const openHolds = (holds ?? []).filter(h => h.status === "open" || h.status === "approved_to_proceed");

  const [selectedHoldId, setSelectedHoldId] = useState<number | null>(null);
  const holdId = selectedHoldId ?? openHolds[0]?.id;

  const { data: responses, isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/enforcement/holds", holdId, "checklist-responses"],
    queryFn: async () => {
      if (!holdId) return [];
      const r = await fetch(`/api/oi/enforcement/holds/${holdId}/checklist-responses`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!holdId,
  });

  const { data: checklistItems } = useQuery<any[]>({
    queryKey: ["/api/oi/enforcement/controls", ctrl.id, "checklist"],
    queryFn: async () => { const r = await fetch(`/api/oi/enforcement/controls/${ctrl.id}/checklist`); if (!r.ok) return []; return r.json(); },
  });

  const [evidenceNote, setEvidenceNote] = useState<Record<number, string>>({});
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});

  const submitMut = useMutation({
    mutationFn: ({ checklistItemId, note }: { checklistItemId: number; note: string }) =>
      apiRequest("POST", `/api/oi/enforcement/holds/${holdId}/checklist-responses`, { responses: [{ checklistItemId, evidenceNote: note }] }),
    onSuccess: (_, { checklistItemId }) => {
      toast({ title: "Response submitted" });
      setEvidenceNote(prev => { const n = { ...prev }; delete n[checklistItemId]; return n; });
      qc.invalidateQueries({ queryKey: ["/api/oi/enforcement/holds", holdId, "checklist-responses"] });
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const rejectMut = useMutation({
    mutationFn: ({ responseId, reason }: { responseId: number; reason: string }) =>
      apiRequest("POST", `/api/oi/enforcement/holds/${holdId}/checklist-responses/${responseId}/reject`, { rejectionReason: reason }),
    onSuccess: () => {
      toast({ title: "Response rejected" });
      qc.invalidateQueries({ queryKey: ["/api/oi/enforcement/holds", holdId, "checklist-responses"] });
    },
  });

  const resubmitMut = useMutation({
    mutationFn: ({ responseId, note }: { responseId: number; note: string }) =>
      apiRequest("POST", `/api/oi/enforcement/holds/${holdId}/checklist-responses/${responseId}/resubmit`, { evidenceNote: note }),
    onSuccess: () => {
      toast({ title: "Response resubmitted" });
      qc.invalidateQueries({ queryKey: ["/api/oi/enforcement/holds", holdId, "checklist-responses"] });
    },
  });

  const itemMap = Object.fromEntries((checklistItems ?? []).map(i => [i.id, i]));
  const responseMap = Object.fromEntries((responses ?? []).map(r => [r.checklistItemId, r]));

  if (!holdId) return <div className="text-center py-12 text-gray-400 text-sm">No open holds — checklist responses are linked to active holds.</div>;

  return (
    <div className="space-y-3">
      {openHolds.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="text-sm">Hold:</Label>
          <select className="text-sm border rounded px-2 py-1" value={holdId} onChange={e => setSelectedHoldId(Number(e.target.value))}>
            {openHolds.map(h => <option key={h.id} value={h.id}>{h.holdNumber} ({h.status})</option>)}
          </select>
        </div>
      )}

      {isLoading ? <Skeleton className="h-40 rounded" /> : (responses ?? []).length === 0
        ? <div className="text-center py-10 text-gray-400 text-sm">No checklist responses for this hold</div>
        : (responses ?? []).map(resp => {
          const item = itemMap[resp.checklistItemId];
          const note = evidenceNote[resp.checklistItemId] ?? "";
          return (
            <Card key={resp.id} className={`border-l-2 ${resp.responseStatus === "submitted" ? "border-l-green-400" : resp.responseStatus === "rejected" ? "border-l-red-400" : "border-l-gray-300"}`}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">#{item?.itemNumber ?? resp.checklistItemId}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${resp.responseStatus === "submitted" ? "bg-green-100 text-green-800" : resp.responseStatus === "rejected" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>{RESPONSE_STATUS_LABELS[resp.responseStatus] ?? resp.responseStatus}</span>
                      {item?.evidenceRequired && <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Evidence Required</span>}
                    </div>
                    <p className="text-sm font-medium text-gray-800 mt-1">{item?.title ?? `Item #${resp.checklistItemId}`}</p>
                    {resp.evidenceNote && <p className="text-xs text-gray-600 mt-0.5 italic">{resp.evidenceNote}</p>}
                    {resp.rejectionReason && <p className="text-xs text-red-600 mt-0.5"><span className="font-semibold">Rejection:</span> {resp.rejectionReason}</p>}
                  </div>
                </div>

                {/* Submit form for pending */}
                {resp.responseStatus === "pending" && (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input className="text-xs h-7" placeholder={item?.evidenceRequired ? "Evidence note (required)…" : "Evidence note (optional)…"}
                        value={note} onChange={e => setEvidenceNote(prev => ({ ...prev, [resp.checklistItemId]: e.target.value }))} />
                    </div>
                    <Button size="sm" className="h-7 text-xs"
                      onClick={() => submitMut.mutate({ checklistItemId: resp.checklistItemId, note })}
                      disabled={(item?.evidenceRequired && !note.trim()) || submitMut.isPending}>Submit</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-red-400 text-red-700"
                      onClick={() => rejectMut.mutate({ responseId: resp.id, reason: "Rejected by reviewer" })}
                      disabled={rejectMut.isPending}>Reject</Button>
                  </div>
                )}

                {/* Resubmit form for rejected */}
                {resp.responseStatus === "rejected" && (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input className="text-xs h-7" placeholder="Updated evidence note…"
                        value={note} onChange={e => setEvidenceNote(prev => ({ ...prev, [resp.checklistItemId]: e.target.value }))} />
                    </div>
                    <Button size="sm" className="h-7 text-xs"
                      onClick={() => resubmitMut.mutate({ responseId: resp.id, note })}
                      disabled={resubmitMut.isPending}>Resubmit</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      }
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────
function AuditLogTab({ ctrl }: { ctrl: any }) {
  const { data: auditLog, isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/enforcement/controls", ctrl.id, "audit-log"],
    queryFn: async () => { const r = await fetch(`/api/oi/enforcement/controls/${ctrl.id}/audit-log`); if (!r.ok) return []; return r.json(); },
  });

  if (isLoading) return <Skeleton className="h-40 rounded" />;

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">{auditLog?.length ?? 0} audit event{auditLog?.length !== 1 ? "s" : ""}</p>
      {(!auditLog || auditLog.length === 0) && (
        <div className="text-center py-10 text-gray-400"><Clock className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No audit events</p></div>
      )}
      {auditLog?.map(entry => (
        <div key={entry.id} className={`flex gap-3 text-xs border-l-2 pl-3 py-1 ${entry.isOverrideEvent ? "border-l-orange-400 bg-orange-50 rounded" : "border-l-gray-200"}`}>
          <span className="text-gray-400 w-32 shrink-0">{fmtDateTime(entry.createdAt)}</span>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-gray-800">{entry.actorName}</span>
            <span className="text-gray-500 mx-1">({entry.actorRole})</span>
            <span className="font-mono text-gray-600">{entry.action}</span>
            {entry.fieldName && <span className="text-gray-500 ml-1">on {entry.fieldName}</span>}
            {entry.oldValue && <span className="text-gray-400 ml-1">{entry.oldValue} → {entry.newValue}</span>}
            {entry.context && <p className="text-gray-400 mt-0.5 truncate">{entry.context}</p>}
            {entry.isOverrideEvent && <span className="text-orange-600 font-semibold ml-1">⚠ Override Event</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Lessons Learned Tab ──────────────────────────────────────────────────────
function EnforcementLinkedLessonsTab({ controlId }: { controlId: number }) {
  const { data: lessons = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/lessons/by-entity", "enforcement_control", controlId],
    queryFn: async () => { const r = await fetch(`/api/oi/lessons/by-entity/enforcement_control/${controlId}`); if (!r.ok) return []; return r.json(); },
  });
  if (isLoading) return <div className="text-sm text-gray-400 py-4">Loading…</div>;
  if (!lessons.length) return (
    <div className="text-sm text-gray-400 py-6 text-center">No lessons linked to this control yet.<br /><a href="/oi/lessons" className="text-blue-600 hover:underline">Go to Lessons Learned Register →</a></div>
  );
  return (
    <div className="space-y-2">
      {lessons.map((l: any) => (
        <div key={l.id} className="flex items-start justify-between gap-2 p-3 rounded border bg-white hover:bg-gray-50">
          <div className="min-w-0 flex-1">
            <a href={`/oi/lessons/${l.id}`} className="font-mono text-blue-600 hover:underline text-sm font-medium">{l.lesson_number}</a>
            <p className="text-sm text-gray-700 truncate">{l.title}</p>
            <p className="text-xs text-gray-400">{l.category} · {l.lesson_type} · {l.status}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function OiEnforcementDetailPage() {
  const [, params] = useRoute("/oi/enforcement/:controlId");
  const controlId = parseInt(params?.controlId ?? "0");
  const qc = useQueryClient();

  const { data: ctrl, isLoading } = useQuery<any>({
    queryKey: ["/api/oi/enforcement/controls", controlId],
    queryFn: async () => {
      const r = await fetch(`/api/oi/enforcement/controls/${controlId}`);
      if (!r.ok) throw new Error("Control not found");
      return r.json();
    },
    enabled: controlId > 0,
  });

  if (isLoading) return <Layout><div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div></Layout>;
  if (!ctrl) return <Layout><div className="p-4 text-center text-gray-400">Control not found. <Link href="/oi/enforcement" className="text-blue-600">Back to register</Link></div></Layout>;

  return (
    <Layout>
      <div className="space-y-4 p-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/oi/enforcement" className="text-gray-500 hover:text-gray-700">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-gray-500">{ctrl.controlNumber}</span>
              <StatusBadge value={ctrl.status} map={CONTROL_STATUS_LABELS} colorMap={CONTROL_STATUS_COLORS} />
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ENFORCEMENT_LEVEL_COLORS[ctrl.enforcementLevel]}`}>{ENFORCEMENT_LEVEL_LABELS[ctrl.enforcementLevel]}</span>
            </div>
            <h1 className="text-base font-bold text-gray-900 truncate">{ctrl.title}</h1>
            <p className="text-xs text-gray-500">{ctrl.department} · {CONTROL_TYPE_LABELS[ctrl.controlType] ?? ctrl.controlType}</p>
          </div>
          {ctrl.openHoldCount > 0 && (
            <div className="shrink-0 text-center">
              <p className="text-2xl font-bold text-red-700">{ctrl.openHoldCount}</p>
              <p className="text-xs text-gray-500">open hold{ctrl.openHoldCount > 1 ? "s" : ""}</p>
            </div>
          )}
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="holds">Holds</TabsTrigger>
            <TabsTrigger value="responses">Checklist Responses</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
            <TabsTrigger value="lessons">Lessons Learned</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"   className="mt-4"><OverviewTab ctrl={ctrl} onRefresh={() => qc.invalidateQueries({ queryKey: ["/api/oi/enforcement/controls", controlId] })} /></TabsContent>
          <TabsContent value="checklist"  className="mt-4"><ChecklistTab ctrl={ctrl} /></TabsContent>
          <TabsContent value="holds"      className="mt-4"><HoldsTab ctrl={ctrl} /></TabsContent>
          <TabsContent value="responses"  className="mt-4"><ResponsesTab ctrl={ctrl} /></TabsContent>
          <TabsContent value="audit"      className="mt-4"><AuditLogTab ctrl={ctrl} /></TabsContent>
          <TabsContent value="lessons"    className="mt-4"><EnforcementLinkedLessonsTab controlId={ctrl.id} /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
