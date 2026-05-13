import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface RfqVendor { vendor_id: number; vendor_name: string; vendor_display_name?: string; }
interface RfqLine { plc_line_id: number; plc_number: string; tag_no: string; service_description: string; }

interface Props {
  rfqId: number;
  rfqLines: RfqLine[];
  rfqVendors: RfqVendor[];
  existingCbe?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function CbeDialog({ rfqId, rfqLines, rfqVendors, existingCbe, onClose, onSuccess }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [plcLineId, setPlcLineId] = useState<string>(existingCbe?.plc_line_id?.toString() ?? "");
  const [recommendedVendorId, setRecommendedVendorId] = useState<string>(
    existingCbe?.recommended_vendor_id?.toString() ?? ""
  );
  const [finalVendorId, setFinalVendorId] = useState<string>(
    existingCbe?.final_vendor_id?.toString() ?? ""
  );
  const [finalUnitPrice, setFinalUnitPrice] = useState(existingCbe?.final_unit_price ?? "");
  const [status, setStatus] = useState(existingCbe?.status ?? "in_progress");
  const [notes, setNotes] = useState(existingCbe?.notes ?? "");

  const saveMut = useMutation({
    mutationFn: (body: any) =>
      apiRequest("PUT", `/api/plc-rfq/${rfqId}/cbe`, body).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", rfqId] });
      toast({ title: "CBE record saved" });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function submit() {
    if (!plcLineId) { toast({ title: "Select a PLC line", variant: "destructive" }); return; }
    if (status === "complete" && !finalVendorId) {
      toast({ title: "Select final vendor before marking complete", variant: "destructive" }); return;
    }
    saveMut.mutate({
      plcLineId: parseInt(plcLineId),
      recommendedVendorId: recommendedVendorId ? parseInt(recommendedVendorId) : null,
      finalVendorId: finalVendorId ? parseInt(finalVendorId) : null,
      finalUnitPrice: finalUnitPrice ? parseFloat(String(finalUnitPrice)) : null,
      status,
      notes: notes || null,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>CBE — Commercial Bid Evaluation</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">PLC Line</Label>
            <Select value={plcLineId} onValueChange={setPlcLineId} disabled={!!existingCbe}>
              <SelectTrigger className="mt-1 text-xs">
                <SelectValue placeholder="Select line…" />
              </SelectTrigger>
              <SelectContent>
                {rfqLines.map((l) => (
                  <SelectItem key={l.plc_line_id} value={l.plc_line_id.toString()}>
                    {l.plc_number} — {l.tag_no || l.service_description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Commercially Preferred Vendor</Label>
              <Select value={recommendedVendorId} onValueChange={setRecommendedVendorId}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Not decided —</SelectItem>
                  {rfqVendors.map((v) => (
                    <SelectItem key={v.vendor_id} value={v.vendor_id.toString()}>
                      {v.vendor_display_name || v.vendor_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Final Selected Vendor</Label>
              <Select value={finalVendorId} onValueChange={setFinalVendorId}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Not yet —</SelectItem>
                  {rfqVendors.map((v) => (
                    <SelectItem key={v.vendor_id} value={v.vendor_id.toString()}>
                      {v.vendor_display_name || v.vendor_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Negotiated Unit Price (INR)</Label>
              <Input
                type="number" step="0.01" value={finalUnitPrice}
                onChange={(e) => setFinalUnitPrice(e.target.value)}
                className="mt-1 text-xs" inputMode="decimal"
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="complete">Complete — Vendor Selected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {status === "complete" && (
            <div className="bg-green-50 border border-green-200 rounded p-3 text-xs text-green-800">
              Completing CBE will set the PLC line status to <strong>Vendor Selected</strong> and assign the final vendor.
            </div>
          )}

          <div>
            <Label className="text-xs">Notes / Negotiation Summary</Label>
            <Textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              className="mt-1 text-xs" rows={3}
              placeholder="Price negotiation outcome, final terms…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saveMut.isPending}>
            {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save CBE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
