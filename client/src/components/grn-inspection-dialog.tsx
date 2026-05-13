import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ClipboardCheck, AlertTriangle } from "lucide-react";

interface GrnInspectionDialogProps {
  grn: any;
  projectId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function GrnInspectionDialog({ grn, projectId, onClose, onSuccess }: GrnInspectionDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [acceptedQty, setAcceptedQty] = useState(String(grn.grn_qty ?? ""));
  const [rejectedQty, setRejectedQty] = useState("0");
  const [notes, setNotes] = useState("");
  const [waiveMode, setWaiveMode] = useState(false);
  const [waiveReason, setWaiveReason] = useState("");

  const totalGrn = parseFloat(grn.grn_qty) || 0;
  const accepted = parseFloat(acceptedQty) || 0;
  const rejected = parseFloat(rejectedQty) || 0;
  const overcount = accepted + rejected > totalGrn;

  const inspMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("PATCH", `/api/plc-grn/${grn.id}/inspection-result`, data),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      const ncrMsg = data.ncr ? ` NCR ${data.ncr.ncr_number} auto-raised.` : "";
      toast({ title: "Inspection Recorded", description: `GRN ${grn.grn_number} inspection complete.${ncrMsg}` });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "plc-grn"] });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "procurement-list"] });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const waiveMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", `/api/plc-grn/${grn.id}/waive-inspection`, data),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Inspection Waived", description: `GRN ${grn.grn_number} — all ${totalGrn} units accepted.` });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "plc-grn"] });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "procurement-list"] });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isPending = inspMutation.isPending || waiveMutation.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-indigo-600" />
            Inspection Result — {grn.grn_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-slate-50 rounded p-3 text-sm grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">GRN Qty (delivered):</span>
            <span className="font-semibold">{totalGrn}</span>
            <span className="text-muted-foreground">PLC Line:</span>
            <span className="font-semibold">{grn.plc_number ?? "—"}</span>
          </div>

          {!waiveMode ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Accepted Qty *</Label>
                  <Input
                    type="number" min="0" step="0.01" max={totalGrn}
                    value={acceptedQty}
                    onChange={(e) => setAcceptedQty(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Rejected Qty</Label>
                  <Input
                    type="number" min="0" step="0.01" max={totalGrn}
                    value={rejectedQty}
                    onChange={(e) => setRejectedQty(e.target.value)}
                  />
                </div>
              </div>

              {overcount && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>Accepted + Rejected exceeds GRN quantity ({totalGrn})</AlertDescription>
                </Alert>
              )}

              {parseFloat(rejectedQty) > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>An NCR will be auto-raised for the {rejectedQty} rejected unit(s).</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1">
                <Label>Inspection Notes</Label>
                <Textarea
                  placeholder="Findings, test results, observations…"
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <button
                type="button"
                onClick={() => setWaiveMode(true)}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Waive inspection instead →
              </button>
            </>
          ) : (
            <>
              <Alert>
                <AlertDescription>Waiving inspection accepts all {totalGrn} units as received. A documented reason is mandatory.</AlertDescription>
              </Alert>
              <div className="space-y-1">
                <Label>Waiver Reason *</Label>
                <Textarea
                  placeholder="Reason for waiving inspection (e.g. OEM certificate, vendor history)…"
                  value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)}
                  rows={3}
                />
              </div>
              <button
                type="button"
                onClick={() => setWaiveMode(false)}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                ← Back to inspection result
              </button>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          {!waiveMode ? (
            <Button
              onClick={() => inspMutation.mutate({ acceptedQty: accepted, rejectedQty: rejected, notes })}
              disabled={isPending || overcount || accepted < 0}
            >
              {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Record Result"}
            </Button>
          ) : (
            <Button
              onClick={() => waiveMutation.mutate({ reason: waiveReason })}
              disabled={isPending || !waiveReason.trim()}
              variant="destructive"
            >
              {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Waiving…</> : "Waive Inspection"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
