import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, ArrowRightFromLine } from "lucide-react";

interface GrnRecord {
  id: number; grn_number: string; accepted_qty: string; status: string;
}

interface MaterialIssueDialogProps {
  projectId: number;
  plcLine: any;
  grns: GrnRecord[];
  onClose: () => void;
  onSuccess: () => void;
}

export function MaterialIssueDialog({ projectId, plcLine, grns, onClose, onSuccess }: MaterialIssueDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [issuedQty, setIssuedQty] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [purposeNotes, setPurposeNotes] = useState("");
  const [grnRecordId, setGrnRecordId] = useState<string>("");

  const acceptedGrns = grns.filter((g) => g.status === "accepted");

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/plc-mir", data).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Material Issued", description: `${data.mir?.mir_number} recorded successfully` });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "plc-mir"] });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!issuedQty || parseFloat(issuedQty) <= 0) { toast({ title: "Enter a valid issue quantity", variant: "destructive" }); return; }
    if (!issuedTo.trim()) { toast({ title: "Issued-to is required", variant: "destructive" }); return; }
    mutation.mutate({
      plcLineId: plcLine.id,
      projectId,
      grnRecordId: grnRecordId ? parseInt(grnRecordId) : undefined,
      issuedQty: parseFloat(issuedQty),
      issuedTo: issuedTo.trim(),
      purposeNotes: purposeNotes || undefined,
    });
  }

  const qtyReceived = parseFloat(plcLine.qtyReceived || plcLine.qty_received) || 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightFromLine className="h-5 w-5 text-emerald-600" />
            Material Issue (MIR)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-slate-50 rounded p-3 text-sm grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">PLC Line:</span>
            <span className="font-semibold">{plcLine.plcNumber ?? plcLine.plc_number}</span>
            <span className="text-muted-foreground">Tag No:</span>
            <span className="font-semibold">{plcLine.tagNo ?? plcLine.tag_no ?? "—"}</span>
            <span className="text-muted-foreground">Description:</span>
            <span className="font-semibold text-xs">{(plcLine.serviceDescription ?? plcLine.service_description ?? "").slice(0, 50)}</span>
            <span className="text-muted-foreground">Qty Received:</span>
            <span className="font-semibold text-emerald-700">{qtyReceived}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Issued Quantity * (max: {qtyReceived})</Label>
              <Input
                type="number" min="0.01" step="0.01" max={qtyReceived}
                placeholder="Units to issue"
                value={issuedQty} onChange={(e) => setIssuedQty(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Issue from GRN (optional)</Label>
              <Select value={grnRecordId} onValueChange={setGrnRecordId}>
                <SelectTrigger>
                  <SelectValue placeholder="Any accepted GRN" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any accepted GRN</SelectItem>
                  {acceptedGrns.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.grn_number} ({g.accepted_qty} accepted)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Issued To *</Label>
            <Input
              placeholder="Production / Site / Dept / Person"
              value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Purpose / Notes</Label>
            <Textarea
              placeholder="Installation purpose, work order reference…"
              value={purposeNotes} onChange={(e) => setPurposeNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Issuing…</> : "Issue Material"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
