import { useState, useRef } from "react";
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
import { Loader2, X, ChevronDown, Search } from "lucide-react";

interface PlcLine {
  id: number; plcNumber: string; tagNo: string; serviceDescription: string;
  subgroupCode: string; status: string;
}
interface Vendor { id: number; name: string; display_name?: string; sap_card_code?: string; }

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

  // Vendor search dropdown state
  const [vendorSearch, setVendorSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const eligibleLines = lines.filter((l) =>
    ["pr_raised", "pending_rfq"].includes(l.status)
  );

  const { data: vendors = [], isLoading: vendorsLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    queryFn: () => apiRequest("GET", "/api/vendors"),
  });

  const createMut = useMutation({
    mutationFn: (body: any) =>
      apiRequest("POST", `/api/projects/${projectId}/plc-rfq`, body),
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

  function addVendor(vendor: Vendor) {
    if (!selectedVendorIds.includes(vendor.id)) {
      setSelectedVendorIds((prev) => [...prev, vendor.id]);
    }
    setVendorSearch("");
    setDropdownOpen(false);
  }

  function removeVendor(id: number) {
    setSelectedVendorIds((prev) => prev.filter((x) => x !== id));
  }

  const selectedVendors = vendors.filter((v) => selectedVendorIds.includes(v.id));

  const filteredVendors = vendors.filter((v) => {
    if (selectedVendorIds.includes(v.id)) return false;
    const term = vendorSearch.toLowerCase();
    if (!term) return true;
    const label = (v.display_name || v.name || "").toLowerCase();
    const code = (v.sap_card_code || "").toLowerCase();
    return label.includes(term) || code.includes(term);
  });

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

          {/* Vendor selection — searchable dropdown */}
          <div>
            <Label className="text-xs font-semibold mb-1 block">
              Vendors to invite
              {selectedVendors.length > 0 && (
                <span className="ml-2 text-indigo-600 font-normal">({selectedVendors.length} selected)</span>
              )}
            </Label>

            {/* Selected vendor chips */}
            {selectedVendors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedVendors.map((v) => (
                  <span
                    key={v.id}
                    className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs px-2 py-1 rounded-full"
                  >
                    {v.display_name || v.name}
                    <button
                      type="button"
                      onClick={() => removeVendor(v.id)}
                      className="text-indigo-400 hover:text-indigo-700 ml-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Dropdown trigger + search */}
            <div className="relative">
              <div
                className="flex items-center border rounded px-3 py-2 gap-2 cursor-text bg-white"
                onClick={() => { setDropdownOpen(true); searchRef.current?.focus(); }}
              >
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  ref={searchRef}
                  className="flex-1 text-xs outline-none bg-transparent placeholder:text-muted-foreground"
                  placeholder={vendorsLoading ? "Loading vendors from SAP…" : "Search vendor name or SAP code…"}
                  value={vendorSearch}
                  onChange={(e) => { setVendorSearch(e.target.value); setDropdownOpen(true); }}
                  onFocus={() => setDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                />
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>

              {dropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-lg max-h-52 overflow-y-auto">
                  {vendorsLoading ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading from SAP B1…
                    </div>
                  ) : filteredVendors.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">
                      {vendorSearch ? "No matching vendors" : "All vendors already selected"}
                    </div>
                  ) : (
                    filteredVendors.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 border-b last:border-0"
                        onMouseDown={() => addVendor(v)}
                      >
                        <div>
                          <div className="text-xs font-medium">{v.display_name || v.name}</div>
                          {v.sap_card_code && (
                            <div className="text-[10px] text-muted-foreground">{v.sap_card_code}</div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
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
