import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

interface PlcLine { id: number; plcNumber: string; tagNo: string; serviceDescription: string; uom?: string; }
interface Vendor { id: number; name: string; display_name?: string; }
interface RfqVendor { vendor_id: number; vendor_name: string; vendor_display_name?: string; }
interface RfqLine { plc_line_id: number; plc_number: string; tag_no: string; service_description: string; qty_required: string; uom?: string; }

interface Props {
  rfqId: number;
  rfqLines: RfqLine[];
  rfqVendors: RfqVendor[];
  existingQuote?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function VendorQuoteDialog({ rfqId, rfqLines, rfqVendors, existingQuote, onClose, onSuccess }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [plcLineId, setPlcLineId] = useState<string>(existingQuote?.plc_line_id?.toString() ?? "");
  const [vendorId, setVendorId] = useState<string>(existingQuote?.vendor_id?.toString() ?? "");
  const [unitPrice, setUnitPrice] = useState(existingQuote?.unit_price ?? "");
  const [deliveryWeeks, setDeliveryWeeks] = useState(existingQuote?.delivery_weeks ?? "");
  const [validityDate, setValidityDate] = useState(existingQuote?.validity_date?.slice(0,10) ?? "");
  const [technicalScore, setTechnicalScore] = useState(existingQuote?.technical_score ?? "");
  const [commercialScore, setCommercialScore] = useState(existingQuote?.commercial_score ?? "");
  const [isRecommended, setIsRecommended] = useState(existingQuote?.is_recommended ?? false);
  const [notes, setNotes] = useState(existingQuote?.notes ?? "");

  // Compute total
  const selectedLine = rfqLines.find((l) => l.plc_line_id.toString() === plcLineId);
  const qty = selectedLine ? parseFloat(selectedLine.qty_required) : 0;
  const totalPrice = unitPrice && qty ? (parseFloat(String(unitPrice)) * qty).toFixed(2) : "";

  const saveMut = useMutation({
    mutationFn: (body: any) =>
      apiRequest("PUT", `/api/plc-rfq/${rfqId}/quotes`, body),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", rfqId] });
      toast({ title: "Quote saved" });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function submit() {
    if (!plcLineId || !vendorId) { toast({ title: "Select line and vendor", variant: "destructive" }); return; }
    saveMut.mutate({
      plcLineId: parseInt(plcLineId),
      vendorId: parseInt(vendorId),
      unitPrice: unitPrice ? parseFloat(String(unitPrice)) : null,
      totalPrice: totalPrice ? parseFloat(totalPrice) : null,
      currency: "INR",
      deliveryWeeks: deliveryWeeks ? parseInt(String(deliveryWeeks)) : null,
      validityDate: validityDate || null,
      technicalScore: technicalScore ? parseFloat(String(technicalScore)) : null,
      commercialScore: commercialScore ? parseFloat(String(commercialScore)) : null,
      isRecommended,
      notes: notes || null,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existingQuote ? "Edit Quote" : "Record Vendor Quote"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">PLC Line</Label>
              <Select value={plcLineId} onValueChange={setPlcLineId} disabled={!!existingQuote}>
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
            <div>
              <Label className="text-xs">Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId} disabled={!!existingQuote}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Select vendor…" />
                </SelectTrigger>
                <SelectContent>
                  {rfqVendors.map((v) => (
                    <SelectItem key={v.vendor_id} value={v.vendor_id.toString()}>
                      {v.vendor_display_name || v.vendor_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Unit Price (INR)</Label>
              <Input
                type="number" step="0.01" value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="mt-1 text-xs" inputMode="decimal"
              />
            </div>
            <div>
              <Label className="text-xs">Total Price</Label>
              <Input
                value={totalPrice ? `₹ ${parseFloat(totalPrice).toLocaleString("en-IN")}` : "—"}
                readOnly className="mt-1 text-xs bg-gray-50"
              />
            </div>
            <div>
              <Label className="text-xs">Delivery (weeks)</Label>
              <Input
                type="number" value={deliveryWeeks}
                onChange={(e) => setDeliveryWeeks(e.target.value)}
                className="mt-1 text-xs" inputMode="decimal"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Validity Date</Label>
              <Input type="date" value={validityDate} onChange={(e) => setValidityDate(e.target.value)} className="mt-1 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Technical Score (/100)</Label>
              <Input
                type="number" min="0" max="100" step="0.5" value={technicalScore}
                onChange={(e) => setTechnicalScore(e.target.value)}
                className="mt-1 text-xs" inputMode="decimal"
              />
            </div>
            <div>
              <Label className="text-xs">Commercial Score (/100)</Label>
              <Input
                type="number" min="0" max="100" step="0.5" value={commercialScore}
                onChange={(e) => setCommercialScore(e.target.value)}
                className="mt-1 text-xs" inputMode="decimal"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="recommended"
              checked={isRecommended}
              onCheckedChange={(v) => setIsRecommended(!!v)}
            />
            <Label htmlFor="recommended" className="text-xs cursor-pointer">Mark as recommended vendor for this line</Label>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 text-xs" rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saveMut.isPending}>
            {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save Quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
