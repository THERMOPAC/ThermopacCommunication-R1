import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, X } from "lucide-react";
import { fmtDate } from "@/lib/date-format";

interface PlcLine {
  id: number; plcNumber: string; tagNo: string; serviceDescription: string;
  subgroupCode: string; status: string;
}
interface Vendor { id: number; name: string; display_name?: string; }

interface Props {
  projectId: number;
  lines: PlcLine[];
  onClose: () => void;
  onSuccess: () => void;
}

export function RfqCreateDialog({ projectId, lines, onClose, onSuccess }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [rfqDate, setRfqDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedLineIds, setSelectedLineIds] = useState<number[]>([]);
  const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>([]);

  const eligibleLines = lines.filter((l) =>
    ["pr_raised", "pending_rfq"].includes(l.status)
  );

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    queryFn: () => apiRequest("GET", "/api/vendors").then((r) => r.json()),
  });

  const createMut = useMutation({
    mutationFn: (body: any) =>
      apiRequest("POST", `/api/projects/${projectId}/plc-rfq`, body).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({ title: "RFQ created", description: `${data.rfq?.rfq_number} created as draft.` });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function toggleLine(id: number) {
    setSelectedLineIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleVendor(id: number) {
    setSelectedVendorIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function submit() {
    if (selectedLineIds.length === 0) { toast({ title: "Select at least one line", variant: "destructive" }); return; }
    if (selectedVendorIds.length === 0) { toast({ title: "Select at least one vendor", variant: "destructive" }); return; }
    createMut.mutate({
      rfqDate: rfqDate || undefined,
      submissionDeadline: deadline || undefined,
      subject: subject || undefined,
      notes: notes || undefined,
      lineIds: selectedLineIds,
      vendorIds: selectedVendorIds,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create RFQ</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">RFQ Date</Label>
              <Input type="date" value={rfqDate} onChange={(e) => setRfqDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Submission Deadline</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Subject / RFQ Title</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" placeholder="e.g., Pressure Transmitters Supply" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 text-xs" rows={2} />
          </div>

          {/* Line selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs font-semibold">PLC Lines to include</Label>
              <button
                className="text-xs text-indigo-600 underline"
                onClick={() => setSelectedLineIds(eligibleLines.map((l) => l.id))}
              >
                Select all eligible
              </button>
            </div>
            {eligibleLines.length === 0 ? (
              <p className="text-xs text-muted-foreground">No eligible lines (status: pr_raised or pending_rfq)</p>
            ) : (
              <div className="border rounded max-h-44 overflow-y-auto">
                {eligibleLines.map((line) => (
                  <label
                    key={line.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-0"
                  >
                    <Checkbox
                      checked={selectedLineIds.includes(line.id)}
                      onCheckedChange={() => toggleLine(line.id)}
                    />
                    <span className="text-xs font-mono text-indigo-700 w-32 shrink-0">{line.plcNumber}</span>
                    <span className="text-xs text-muted-foreground truncate">{line.tagNo} — {line.serviceDescription}</span>
                    <span className="text-xs text-gray-400 shrink-0">{line.subgroupCode}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Vendor selection */}
          <div>
            <Label className="text-xs font-semibold mb-1 block">Vendors to invite</Label>
            <div className="border rounded max-h-44 overflow-y-auto">
              {vendors.map((v) => (
                <label
                  key={v.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-0"
                >
                  <Checkbox
                    checked={selectedVendorIds.includes(v.id)}
                    onCheckedChange={() => toggleVendor(v.id)}
                  />
                  <span className="text-xs">{v.display_name || v.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={createMut.isPending}>
            {createMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Create RFQ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
