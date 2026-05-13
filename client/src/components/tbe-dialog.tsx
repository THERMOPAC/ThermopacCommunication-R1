import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  existingTbe?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function TbeDialog({ rfqId, rfqLines, rfqVendors, existingTbe, onClose, onSuccess }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [plcLineId, setPlcLineId] = useState<string>(existingTbe?.plc_line_id?.toString() ?? "");
  const [recommendedVendorId, setRecommendedVendorId] = useState<string>(
    existingTbe?.recommended_vendor_id?.toString() ?? ""
  );
  const [status, setStatus] = useState(existingTbe?.status ?? "in_progress");
  const [notes, setNotes] = useState(existingTbe?.notes ?? "");

  const saveMut = useMutation({
    mutationFn: (body: any) =>
      apiRequest("PUT", `/api/plc-rfq/${rfqId}/tbe`, body),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["/api/plc-rfq", rfqId] });
      toast({ title: "TBE record saved" });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function submit() {
    if (!plcLineId) { toast({ title: "Select a PLC line", variant: "destructive" }); return; }
    saveMut.mutate({
      plcLineId: parseInt(plcLineId),
      recommendedVendorId: recommendedVendorId ? parseInt(recommendedVendorId) : null,
      status,
      notes: notes || null,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>TBE — Technical Bid Evaluation</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">PLC Line</Label>
            <Select value={plcLineId} onValueChange={setPlcLineId} disabled={!!existingTbe}>
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
            <Label className="text-xs">Technically Recommended Vendor</Label>
            <Select value={recommendedVendorId} onValueChange={setRecommendedVendorId}>
              <SelectTrigger className="mt-1 text-xs">
                <SelectValue placeholder="Select vendor…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Not yet decided —</SelectItem>
                {rfqVendors.map((v) => (
                  <SelectItem key={v.vendor_id} value={v.vendor_id.toString()}>
                    {v.vendor_display_name || v.vendor_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Evaluation Notes</Label>
            <Textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              className="mt-1 text-xs" rows={4}
              placeholder="Technical evaluation findings, scores, rationale…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saveMut.isPending}>
            {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save TBE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
