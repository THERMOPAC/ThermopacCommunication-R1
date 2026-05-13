import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Package } from "lucide-react";
import { fmtDate } from "@/lib/date-format";

interface PlcLine {
  id: number; plcNumber: string; tagNo: string; serviceDescription: string;
  status: string; vendorId: number | null; vendorName: string | null;
  qtyRequired: string; qtyOrdered: string; qtyReceived: string; qtyBalance: string;
  activeEpcPoId: number | null; epcPoNumber: string | null;
  activePoGroupId: number | null;
}

interface GrnRecordDialogProps {
  projectId: number;
  lines: PlcLine[];
  preselectedLineId?: number;
  onClose: () => void;
  onSuccess: () => void;
}

const RECEIVABLE_STATUSES = [
  "po_issued", "partially_received", "vendor_selected",
  "in_po_group", "po_submitted", "po_approved",
];

export function GrnRecordDialog({ projectId, lines, preselectedLineId, onClose, onSuccess }: GrnRecordDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const receivableLines = lines.filter((l) => RECEIVABLE_STATUSES.includes(l.status));

  const [plcLineId, setPlcLineId] = useState<string>(preselectedLineId ? String(preselectedLineId) : "");
  const [grnQty, setGrnQty] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split("T")[0]);
  const [challanNumber, setChallanNumber] = useState("");
  const [challanDate, setChallanDate] = useState("");
  const [notes, setNotes] = useState("");
  const [vendorId, setVendorId] = useState<string>("");

  // Load vendors for dropdown
  const { data: vendors = [] } = useQuery<{ id: number; name: string; display_name: string | null }[]>({
    queryKey: ["/api/vendors"],
    queryFn: () => apiRequest("GET", "/api/vendors"),
  });

  const selectedLine = receivableLines.find((l) => l.id === parseInt(plcLineId));

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/plc-grn", data),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "GRN Recorded", description: `${data.grn?.grn_number} created successfully` });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "plc-grn"] });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "procurement-list"] });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "procurement-list", "summary"] });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!plcLineId) { toast({ title: "Select a PLC line", variant: "destructive" }); return; }
    if (!grnQty || parseFloat(grnQty) <= 0) { toast({ title: "Enter a valid GRN quantity", variant: "destructive" }); return; }
    if (!receivedDate) { toast({ title: "Received date required", variant: "destructive" }); return; }
    mutation.mutate({
      plcLineId: parseInt(plcLineId),
      projectId,
      grnQty: parseFloat(grnQty),
      receivedDate,
      challanNumber: challanNumber || undefined,
      challanDate: challanDate || undefined,
      vendorId: vendorId ? parseInt(vendorId) : (selectedLine?.vendorId ?? undefined),
      notes: notes || undefined,
      epcPoId: selectedLine?.activeEpcPoId ?? undefined,
      poGroupId: selectedLine?.activePoGroupId ?? undefined,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-indigo-600" />
            Record Goods Receipt (GRN)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* PLC Line selector */}
          <div className="space-y-1">
            <Label>PLC Line *</Label>
            <Select value={plcLineId} onValueChange={setPlcLineId}>
              <SelectTrigger>
                <SelectValue placeholder="Select line to receive goods for…" />
              </SelectTrigger>
              <SelectContent>
                {receivableLines.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.plcNumber} — {l.tagNo ?? "—"} | {l.serviceDescription?.slice(0, 40)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedLine && (
              <p className="text-xs text-muted-foreground mt-1">
                Required: {selectedLine.qtyRequired} | Ordered: {selectedLine.qtyOrdered} | Received: {selectedLine.qtyReceived} | Balance: {selectedLine.qtyBalance}
                {selectedLine.epcPoNumber && ` | PO: ${selectedLine.epcPoNumber}`}
              </p>
            )}
          </div>

          {/* Quantities */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>GRN Quantity *</Label>
              <Input
                type="number" min="0.01" step="0.01"
                placeholder="Units received"
                value={grnQty} onChange={(e) => setGrnQty(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Received Date *</Label>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
          </div>

          {/* Challan details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Challan / DC Number</Label>
              <Input placeholder="DC-12345" value={challanNumber} onChange={(e) => setChallanNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Challan Date</Label>
              <Input type="date" value={challanDate} onChange={(e) => setChallanDate(e.target.value)} />
            </div>
          </div>

          {/* Vendor override */}
          <div className="space-y-1">
            <Label>Vendor {selectedLine?.vendorName ? `(auto: ${selectedLine.vendorName})` : ""}</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger>
                <SelectValue placeholder={selectedLine?.vendorName ?? "Select vendor…"} />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.display_name ?? v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              placeholder="Condition on receipt, packing notes…"
              value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recording…</> : "Record GRN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
