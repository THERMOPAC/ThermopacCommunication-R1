import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, CheckCircle2, XCircle, Send, Zap, X, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PoGroupDetail {
  id: number; pogNumber: string; status: string; vendorId: number | null;
  vendorName: string | null; vendorDisplayName: string | null; totalLines: number;
  totalAmount: string | null; currency: string; deliveryTerms: string | null;
  paymentTerms: string | null; groupNotes: string | null;
  submittedByName: string | null; submittedAt: string | null;
  approvedByName: string | null; approvedAt: string | null;
  rejectedByName: string | null; rejectedAt: string | null; rejectionReason: string | null;
  issuedByName: string | null; issuedAt: string | null;
  cancelledByName: string | null; cancelledAt: string | null; cancellationReason: string | null;
  epcPoNumberActual: string | null; createdByName: string | null; createdAt: string;
  lines: PoGroupLine[];
}

interface PoGroupLine {
  id: number; plcLineId: number; plcNumber: string; tagNo: string | null;
  serviceDescription: string | null; subgroupCode: string | null; lineNumber: number;
  lineQty: string; lineUnitRate: string | null; lineAmount: string | null;
  itemCode: string | null; itemDescription: string | null; uom: string | null;
  qtyRequired: string;
}

interface AuditEntry {
  id: number; eventType: string; oldStatus: string | null; newStatus: string | null;
  changedByName: string | null; changedAt: string; notes: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-yellow-100 text-yellow-800",
  approved: "bg-emerald-100 text-emerald-800",
  po_issued: "bg-indigo-100 text-indigo-800",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

const SENIOR_ROLES = ["Superuser", "General Manager", "Senior Manager"];

export function PoGroupDetail({ pogId, onClose, onMutated }: { pogId: number; onClose: () => void; onMutated: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSenior = user && SENIOR_ROLES.includes(user.role);

  const [actionDialog, setActionDialog] = useState<"submit" | "approve" | "reject" | "cancel" | "issue-po" | null>(null);
  const [actionReason, setActionReason] = useState("");

  const { data: pog, isLoading } = useQuery<PoGroupDetail>({
    queryKey: ["/api/epc-po-groups", pogId],
    queryFn: () => apiRequest("GET", `/api/epc-po-groups/${pogId}`).then((r) => r.json()),
  });

  const { data: audit = [] } = useQuery<AuditEntry[]>({
    queryKey: ["/api/epc-po-groups", pogId, "audit"],
    queryFn: () => apiRequest("GET", `/api/epc-po-groups/${pogId}/audit`).then((r) => r.json()),
    enabled: !!pog,
  });

  async function doAction(action: string, body: Record<string, string>) {
    try {
      const r = await apiRequest("POST", `/api/epc-po-groups/${pogId}/${action}`, body);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? action + " failed"); }
      toast({ title: "Done", description: `Action '${action}' applied.` });
      onMutated();
      setActionDialog(null);
      setActionReason("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="w-full max-w-3xl overflow-y-auto">
          <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!pog) return null;

  const totalAmt = pog.lines.reduce((sum, l) => sum + (parseFloat(l.lineAmount ?? "0") || 0), 0);

  return (
    <>
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="w-full max-w-3xl overflow-y-auto">
          <SheetHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-mono text-blue-700">{pog.pogNumber}</SheetTitle>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[pog.status] ?? "bg-gray-100"}`}>
                {pog.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
            </div>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-xs text-muted-foreground block">Vendor</span><p className="font-medium">{pog.vendorDisplayName ?? pog.vendorName ?? "—"}</p></div>
              <div><span className="text-xs text-muted-foreground block">Lines</span><p>{pog.totalLines}</p></div>
              <div><span className="text-xs text-muted-foreground block">Total Amount</span><p className="font-semibold">₹ {totalAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p></div>
              <div><span className="text-xs text-muted-foreground block">Currency</span><p>{pog.currency}</p></div>
              {pog.deliveryTerms && <div><span className="text-xs text-muted-foreground block">Delivery Terms</span><p>{pog.deliveryTerms}</p></div>}
              {pog.paymentTerms && <div><span className="text-xs text-muted-foreground block">Payment Terms</span><p>{pog.paymentTerms}</p></div>}
              {pog.epcPoNumberActual && <div><span className="text-xs text-muted-foreground block">EPC PO No</span><p className="font-mono text-indigo-700">{pog.epcPoNumberActual}</p></div>}
            </div>

            {pog.groupNotes && (
              <div className="rounded-lg border bg-gray-50 p-3 text-sm">
                <span className="text-xs text-muted-foreground block mb-1">Notes</span>
                {pog.groupNotes}
              </div>
            )}

            {/* Action history */}
            <div className="rounded-lg border p-3 text-xs space-y-1.5">
              <p className="font-semibold text-sm mb-2">Approval Chain</p>
              {pog.submittedByName && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Send className="h-3.5 w-3.5" />
                  Submitted by <strong>{pog.submittedByName}</strong> on {pog.submittedAt ? fmtDateTime(pog.submittedAt) : "—"}
                </div>
              )}
              {pog.approvedByName && (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approved by <strong>{pog.approvedByName}</strong> on {pog.approvedAt ? fmtDateTime(pog.approvedAt) : "—"}
                </div>
              )}
              {pog.rejectedByName && (
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="h-3.5 w-3.5" />
                  Rejected by <strong>{pog.rejectedByName}</strong> on {pog.rejectedAt ? fmtDateTime(pog.rejectedAt) : "—"}
                  {pog.rejectionReason && <span>— {pog.rejectionReason}</span>}
                </div>
              )}
              {pog.issuedByName && (
                <div className="flex items-center gap-2 text-indigo-700">
                  <Zap className="h-3.5 w-3.5" />
                  PO Issued by <strong>{pog.issuedByName}</strong> on {pog.issuedAt ? fmtDateTime(pog.issuedAt) : "—"}
                </div>
              )}
              {!pog.submittedByName && !pog.approvedByName && (
                <p className="text-muted-foreground italic">No actions taken yet.</p>
              )}
            </div>

            {/* Lines */}
            <div>
              <p className="font-semibold text-sm mb-2">PO Group Lines</p>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-xs">No</TableHead>
                      <TableHead className="text-xs">PLC No</TableHead>
                      <TableHead className="text-xs">Tag</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right">Unit Rate</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pog.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{l.lineNumber}</TableCell>
                        <TableCell className="text-xs font-mono text-indigo-700">{l.plcNumber}</TableCell>
                        <TableCell className="text-xs">{l.tagNo ?? "—"}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate">
                          {l.serviceDescription ?? l.itemDescription ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {parseFloat(l.lineQty).toFixed(2)} {l.uom ?? ""}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {l.lineUnitRate ? parseFloat(l.lineUnitRate).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-medium">
                          {l.lineAmount ? `₹ ${parseFloat(l.lineAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Audit log (compact) */}
            {audit.length > 0 && (
              <div>
                <p className="font-semibold text-sm mb-2">Activity Log</p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {audit.map((a) => (
                    <div key={a.id} className="flex items-start gap-2 text-xs text-gray-600">
                      <Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                      <span className="text-gray-400">{fmtDateTime(a.changedAt)}</span>
                      <span className="font-medium">{a.changedByName ?? "System"}</span>
                      <span>{a.eventType.replace(/_/g, " ")}</span>
                      {a.notes && <span className="text-gray-400">— {a.notes}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {pog.status === "draft" && (
                <Button size="sm" onClick={() => setActionDialog("submit")}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Submit for Approval
                </Button>
              )}
              {pog.status === "submitted" && isSenior && (
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setActionDialog("approve")}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setActionDialog("reject")}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                </>
              )}
              {pog.status === "approved" && isSenior && (
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setActionDialog("issue-po")}>
                  <Zap className="h-3.5 w-3.5 mr-1" /> Issue PO
                </Button>
              )}
              {!["cancelled", "po_issued"].includes(pog.status) && (
                <Button size="sm" variant="outline" onClick={() => setActionDialog("cancel")}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel Group
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Action dialogs */}
      {actionDialog && (
        <AlertDialog open onOpenChange={() => { setActionDialog(null); setActionReason(""); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {actionDialog === "submit" && "Submit for Approval"}
                {actionDialog === "approve" && "Approve PO Group"}
                {actionDialog === "reject" && "Reject PO Group"}
                {actionDialog === "cancel" && "Cancel PO Group"}
                {actionDialog === "issue-po" && "Issue EPC Purchase Order"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {actionDialog === "issue-po"
                  ? "This will create a new EPC Purchase Order from this PO Group. All included PLC lines will be marked as 'PO Issued'. This action cannot be undone."
                  : actionDialog === "approve"
                  ? "Are you sure you want to approve this PO Group? Qty ordered fields on all included lines will be updated."
                  : "Please confirm this action."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {(actionDialog === "reject" || actionDialog === "cancel") && (
              <Textarea
                placeholder={actionDialog === "reject" ? "Rejection reason…" : "Cancellation reason…"}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                rows={3}
              />
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={
                  (actionDialog === "reject" || actionDialog === "cancel") && !actionReason.trim()
                }
                onClick={() => {
                  const body: Record<string, string> = {};
                  if (actionDialog === "submit") body.submissionNotes = actionReason;
                  if (actionDialog === "approve") body.approvalNotes = actionReason;
                  if (actionDialog === "reject") body.rejectionReason = actionReason;
                  if (actionDialog === "cancel") body.cancellationReason = actionReason;
                  doAction(actionDialog === "issue-po" ? "issue-po" : actionDialog, body);
                }}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
