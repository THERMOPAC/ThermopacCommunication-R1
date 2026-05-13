/**
 * RFQ Dispatch Panel — Baseline v1.0
 * Governance: docs/rfq-email-dispatch-baseline-v1.0.md §7 (UI Spec)
 *
 * Shows:
 *  - Pre-flight warnings (vendorsNoEmail, linesNoDatasheet, size warning)
 *  - Vendor dispatch status table with Resend / Acknowledge actions
 *  - Frozen attachments list
 *  - Full dispatch audit log
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, CheckCircle2, Clock, Mail, MailX, RefreshCw, Paperclip,
  ChevronDown, ChevronUp, RotateCcw, Check, Info, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fmtDate, fmtDateTime } from "@/lib/date-format";

// ─── Status badge config ─────────────────────────────────────────────────────
const DISPATCH_STATUS: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:      { label: "Pending",      cls: "bg-gray-100 text-gray-700 border-gray-200",  icon: <Clock className="h-3 w-3" /> },
  sent:         { label: "Sent",         cls: "bg-blue-100 text-blue-800 border-blue-200",  icon: <Mail className="h-3 w-3" /> },
  failed:       { label: "Failed",       cls: "bg-red-100 text-red-800 border-red-200",     icon: <XCircle className="h-3 w-3" /> },
  no_email:     { label: "No Email",     cls: "bg-orange-100 text-orange-800 border-orange-200", icon: <MailX className="h-3 w-3" /> },
  acknowledged: { label: "Acknowledged", cls: "bg-green-100 text-green-800 border-green-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  resent:       { label: "Resent",       cls: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: <RefreshCw className="h-3 w-3" /> },
};

function DispatchStatusBadge({ status }: { status: string }) {
  const s = DISPATCH_STATUS[status] ?? { label: status, cls: "bg-gray-100 text-gray-700", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
}

// ─── Resend dialog ────────────────────────────────────────────────────────────
function ResendDialog({
  open, onClose, rfqId, vendor, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  rfqId: number;
  vendor: any;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [emailOverride, setEmailOverride] = useState(vendor?.email_override || vendor?.vendor_email || "");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/plc-rfq/${rfqId}/vendors/${vendor.vendor_id}/resend`, { emailOverride: emailOverride || null }),
    onSuccess: () => {
      toast({ title: "Email resent successfully" });
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", rfqId, "dispatch-log"] });
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", rfqId, "vendor-dispatch"] });
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast({ title: "Resend failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resend RFQ to {vendor?.vendor_display_name || vendor?.vendor_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            A new email will be sent and a new dispatch log entry will be created.
            Every resend is tracked separately.
          </p>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">
              Email address <span className="text-gray-400">(leave blank to use registered email)</span>
            </Label>
            <Input
              value={emailOverride}
              onChange={e => setEmailOverride(e.target.value)}
              placeholder={vendor?.vendor_email || "vendor@example.com"}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Sending…" : "Resend Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Acknowledge dialog ───────────────────────────────────────────────────────
function AcknowledgeDialog({
  open, onClose, rfqId, vendor, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  rfqId: number;
  vendor: any;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/plc-rfq/${rfqId}/vendors/${vendor.vendor_id}/acknowledge`, { note }),
    onSuccess: () => {
      toast({ title: "Acknowledgement recorded" });
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", rfqId, "vendor-dispatch"] });
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", rfqId] });
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Acknowledgement — {vendor?.vendor_display_name || vendor?.vendor_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">Record that this vendor has acknowledged receipt of the RFQ.</p>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Note (optional)</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Confirmed via email / phone call…"
              rows={3}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Confirm Acknowledgement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Dispatch Panel ──────────────────────────────────────────────────────
interface RfqDispatchPanelProps {
  rfqId: number;
  rfqStatus: string;
  rfqNumber: string;
  onRefreshRfq: () => void;
}

export function RfqDispatchPanel({ rfqId, rfqStatus, rfqNumber, onRefreshRfq }: RfqDispatchPanelProps) {
  const qc = useQueryClient();
  const [resendVendor, setResendVendor] = useState<any>(null);
  const [ackVendor, setAckVendor] = useState<any>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [attOpen, setAttOpen] = useState(false);

  const isActive = ["issued", "closed"].includes(rfqStatus);

  // Vendor dispatch summary
  const { data: vendorDispatch = [], isLoading: vdLoading, refetch: refetchVd } = useQuery<any[]>({
    queryKey: ["/api/plc-rfq", rfqId, "vendor-dispatch"],
    queryFn: () => apiRequest("GET", `/api/plc-rfq/${rfqId}/vendor-dispatch`),
    enabled: isActive,
  });

  // Dispatch log
  const { data: dispatchLog = [], isLoading: logLoading } = useQuery<any[]>({
    queryKey: ["/api/plc-rfq", rfqId, "dispatch-log"],
    queryFn: () => apiRequest("GET", `/api/plc-rfq/${rfqId}/dispatch-log`),
    enabled: isActive && logOpen,
  });

  // Frozen attachments
  const { data: attachments = [] } = useQuery<any[]>({
    queryKey: ["/api/plc-rfq", rfqId, "attachments"],
    queryFn: () => apiRequest("GET", `/api/plc-rfq/${rfqId}/attachments`),
    enabled: isActive && attOpen,
  });

  if (!isActive) return null;

  const sentCount   = vendorDispatch.filter(v => ["sent", "resent"].includes(v.dispatch_status)).length;
  const ackCount    = vendorDispatch.filter(v => v.dispatch_status === "acknowledged").length;
  const failCount   = vendorDispatch.filter(v => v.dispatch_status === "failed").length;
  const noEmailCount = vendorDispatch.filter(v => v.dispatch_status === "no_email").length;
  const pendingCount = vendorDispatch.filter(v => v.dispatch_status === "pending").length;

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-cyan-50">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-cyan-700" />
          <h4 className="text-sm font-semibold text-cyan-900">Email Dispatch — {rfqNumber}</h4>
          <div className="flex items-center gap-1.5 ml-2">
            {ackCount > 0 && (
              <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded border border-green-200">
                {ackCount} acked
              </span>
            )}
            {sentCount > 0 && (
              <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200">
                {sentCount} sent
              </span>
            )}
            {failCount > 0 && (
              <span className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded border border-red-200">
                {failCount} failed
              </span>
            )}
            {pendingCount > 0 && (
              <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-cyan-700"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["/api/plc-rfq", rfqId, "vendor-dispatch"] });
            refetchVd();
          }}
        >
          <RotateCcw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Vendor dispatch table */}
      {vdLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading dispatch status…</div>
      ) : vendorDispatch.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">No vendor dispatch data yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-2 font-semibold text-gray-600">Vendor</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-600">Email</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-600">Last Sent</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-600">Resends</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-600">Ack. At</th>
                <th className="w-40 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {vendorDispatch.map((v: any) => (
                <tr key={v.vendor_id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    {v.vendor_display_name || v.vendor_name}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[160px]">
                    {v.email_override || v.vendor_email || (
                      <span className="text-orange-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> No email
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <DispatchStatusBadge status={v.dispatch_status || "pending"} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {v.last_dispatched_at ? fmtDateTime(v.last_dispatched_at) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center text-muted-foreground">
                    {v.resend_count > 0 ? (
                      <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                        ×{v.resend_count}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {v.acknowledged_at ? (
                      <span className="flex items-center gap-1 text-green-700">
                        <Check className="h-3 w-3" />
                        {fmtDate(v.acknowledged_at)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={() => setResendVendor(v)}
                        title="Resend email"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" /> Resend
                      </Button>
                      {v.dispatch_status !== "acknowledged" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs text-green-700 hover:bg-green-50 hover:text-green-800"
                          onClick={() => setAckVendor(v)}
                          title="Record acknowledgement"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Ack
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Acknowledgement notes */}
      {vendorDispatch.some((v: any) => v.acknowledgment_note) && (
        <div className="px-4 pb-3 pt-1 space-y-1.5 border-t bg-gray-50">
          <div className="text-xs font-semibold text-gray-600 mb-1">Acknowledgement Notes</div>
          {vendorDispatch.filter((v: any) => v.acknowledgment_note).map((v: any) => (
            <div key={v.vendor_id} className="flex gap-2 text-xs">
              <span className="font-medium text-gray-700 shrink-0">{v.vendor_display_name || v.vendor_name}:</span>
              <span className="text-muted-foreground">{v.acknowledgment_note}</span>
            </div>
          ))}
        </div>
      )}

      {/* Frozen attachments collapsible */}
      <Collapsible open={attOpen} onOpenChange={setAttOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-600 hover:bg-gray-50 border-t font-medium">
            <span className="flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5 text-gray-400" />
              Frozen Attachments
            </span>
            {attOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {attachments.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">No attachments frozen for this RFQ.</div>
          ) : (
            <div className="divide-y px-4 py-2 bg-gray-50">
              {attachments.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-3 w-3 text-gray-400 shrink-0" />
                    <div>
                      <div className="text-xs font-medium text-gray-800">{a.original_filename || a.gcs_path.split("/").pop()}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.attachment_type} &bull; {a.file_size_bytes ? `${(a.file_size_bytes / 1024).toFixed(0)} KB` : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Frozen {fmtDate(a.frozen_at)}</div>
                    {a.frozen_by_name && <div className="text-xs text-gray-400">by {a.frozen_by_name}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Dispatch log collapsible */}
      <Collapsible open={logOpen} onOpenChange={setLogOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-600 hover:bg-gray-50 border-t font-medium">
            <span className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-gray-400" />
              Dispatch Audit Log
            </span>
            {logOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {logLoading ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">Loading log…</div>
          ) : dispatchLog.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">No dispatch log entries yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Vendor</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Email To</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Attachments</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Dispatched At</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">By</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatchLog.map((row: any) => (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">
                        {row.vendor_display_name || row.vendor_name}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground truncate max-w-[160px]">
                        {row.email_to}
                      </td>
                      <td className="px-4 py-2">
                        <DispatchStatusBadge status={row.dispatch_status} />
                        {row.failure_reason && (
                          <div className="text-red-600 mt-0.5 text-xs">{row.failure_reason}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">{row.attachment_count ?? 0}</td>
                      <td className="px-4 py-2 text-muted-foreground">{fmtDateTime(row.dispatched_at)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{row.dispatched_by_name || "—"}</td>
                      <td className="px-4 py-2">
                        {row.is_resend ? (
                          <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs">Resend #{row.resend_number}</span>
                        ) : (
                          <span className="bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded text-xs">Initial</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Dialogs */}
      {resendVendor && (
        <ResendDialog
          open={!!resendVendor}
          onClose={() => setResendVendor(null)}
          rfqId={rfqId}
          vendor={resendVendor}
          onSuccess={onRefreshRfq}
        />
      )}
      {ackVendor && (
        <AcknowledgeDialog
          open={!!ackVendor}
          onClose={() => setAckVendor(null)}
          rfqId={rfqId}
          vendor={ackVendor}
          onSuccess={onRefreshRfq}
        />
      )}
    </div>
  );
}

// ─── Pre-flight Warning Banner ─────────────────────────────────────────────────
interface RfqPreflightBannerProps {
  rfqId: number;
  enabled: boolean;
}

export function RfqPreflightBanner({ rfqId, enabled }: RfqPreflightBannerProps) {
  const { data: preflight, isLoading } = useQuery<any>({
    queryKey: ["/api/plc-rfq", rfqId, "preflight"],
    queryFn: () => apiRequest("GET", `/api/plc-rfq/${rfqId}/preflight`),
    enabled,
    staleTime: 30000,
  });

  if (!enabled || isLoading || !preflight) return null;

  const hasWarnings =
    preflight.vendorsNoEmail?.length > 0 ||
    preflight.linesNoDatasheet?.length > 0 ||
    preflight.sizeWarning;

  if (!hasWarnings) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" />
        Pre-flight Warnings — review before issuing
      </div>
      {preflight.vendorsNoEmail?.map((v: any) => (
        <div key={v.vendorId} className="text-xs text-amber-700 pl-5">
          • Vendor <strong>{v.vendorName}</strong> has no email address — they will not receive the RFQ.
        </div>
      ))}
      {preflight.linesNoDatasheet?.map((l: any) => (
        <div key={l.plcLineId} className="text-xs text-amber-700 pl-5">
          • Line <strong>{l.plcNumber}</strong> {l.tagNo ? `(${l.tagNo})` : ""} has no datasheet uploaded.
        </div>
      ))}
      {preflight.sizeWarning && (
        <div className="text-xs text-amber-700 pl-5">
          • Estimated attachment size is ~{preflight.estimatedSizeMb} MB — oversized files will be sent as download links.
        </div>
      )}
    </div>
  );
}
