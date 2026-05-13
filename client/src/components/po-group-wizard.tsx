import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ChevronRight, ChevronLeft, Check, Loader2, Package } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlcLine {
  id: number; plcNumber: string; tagNo: string | null;
  serviceDescription: string | null; subgroupCode: string | null;
  subgroupLabel: string | null; qtyRequired: string;
  vendorId: number | null; vendorName: string | null;
  avlStatus: string; status: string; activePoGroupId: number | null;
  masterItemId: number | null; itemCode: string | null; itemDescription: string | null;
  uom: string | null;
}

interface Vendor { id: number; name: string; code?: string; }

interface AvlCheck { qualified: boolean; status: string | null; record: any; }

interface WizardProps {
  projectId: number;
  preselectedLineIds: number[];
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Step configuration ───────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Vendor & AVL" },
  { id: 2, label: "Line Selection" },
  { id: 3, label: "Rates & Details" },
  { id: 4, label: "Review & Create" },
];

const step3Schema = z.object({
  deliveryTerms: z.string().optional(),
  paymentTerms: z.string().optional(),
  groupNotes: z.string().optional(),
});

// ─── Component ───────────────────────────────────────────────────────────────

export function PoGroupWizard({ projectId, preselectedLineIds, onClose, onSuccess }: WizardProps) {
  const [step, setStep] = useState(1);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [selectedVendorName, setSelectedVendorName] = useState<string>("");
  const [selectedLineIds, setSelectedLineIds] = useState<number[]>(preselectedLineIds);
  const [lineRates, setLineRates] = useState<Record<number, { qty: string; unitRate: string }>>({});
  const [avlBypassAck, setAvlBypassAck] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [avlIssues, setAvlIssues] = useState<{ subgroupCode: string; status: string }[]>([]);

  const form = useForm<z.infer<typeof step3Schema>>({
    resolver: zodResolver(step3Schema),
    defaultValues: { deliveryTerms: "", paymentTerms: "", groupNotes: "" },
  });

  // Data queries
  const { data: lines = [], isLoading: linesLoading } = useQuery<PlcLine[]>({
    queryKey: ["/api/projects", projectId, "procurement-list"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/procurement-list`).then((r) => r.json()),
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    queryFn: () => apiRequest("GET", "/api/vendors").then((r) => r.json()),
  });

  const POG_ELIGIBLE_STATUSES = ["pr_raised", "vendor_selected"];
  const eligibleLines = lines.filter(
    (l) => POG_ELIGIBLE_STATUSES.includes(l.status) && !l.activePoGroupId,
  );

  // Auto-populate vendor when all pre-selected lines share the same CBE-selected vendor
  useEffect(() => {
    if (lines.length === 0 || preselectedLineIds.length === 0) return;
    if (selectedVendorId) return;
    const preselected = lines.filter((l) => preselectedLineIds.includes(l.id));
    const uniqueVendorIds = [...new Set(preselected.map((l) => l.vendorId).filter(Boolean))];
    if (uniqueVendorIds.length === 1 && uniqueVendorIds[0]) {
      const ref = preselected.find((l) => l.vendorId === uniqueVendorIds[0]);
      setSelectedVendorId(uniqueVendorIds[0] as number);
      setSelectedVendorName(ref?.vendorName ?? "");
    }
  }, [lines, preselectedLineIds]);

  const selectedLines = lines.filter((l) => selectedLineIds.includes(l.id));

  // Check AVL for selected vendor + subgroups
  async function checkAvl(): Promise<{ subgroupCode: string; status: string }[]> {
    if (!selectedVendorId) return [];
    const subgroups = [...new Set(selectedLines.map((l) => l.subgroupCode).filter(Boolean) as string[])];
    const issues: { subgroupCode: string; status: string }[] = [];
    for (const sg of subgroups) {
      const r = await apiRequest("GET", `/api/vendor-subgroup-qualification/check?vendorId=${selectedVendorId}&subgroupCode=${sg}`);
      const data: AvlCheck = await r.json();
      if (!data.qualified) {
        issues.push({ subgroupCode: sg, status: data.status ?? "not_checked" });
      }
    }
    return issues;
  }

  async function handleNextFromStep1() {
    if (!selectedVendorId) return;
    const issues = await checkAvl();
    setAvlIssues(issues);
    setStep(2);
  }

  function handleNextFromStep2() {
    if (selectedLineIds.length === 0) return;
    // Initialise rates from PLC qty
    const initRates: Record<number, { qty: string; unitRate: string }> = {};
    for (const l of selectedLines) {
      initRates[l.id] = lineRates[l.id] ?? { qty: l.qtyRequired, unitRate: "0" };
    }
    setLineRates(initRates);
    setStep(3);
  }

  async function handleSubmit() {
    if (!selectedVendorId) return;
    setSubmitting(true);
    try {
      const vals = form.getValues();
      const lineDetails = selectedLineIds.map((id) => ({
        plcLineId: id,
        qty: lineRates[id]?.qty ?? "0",
        unitRate: lineRates[id]?.unitRate ?? "0",
      }));
      const body = {
        projectId,
        vendorId: selectedVendorId,
        vendorName: selectedVendorName,
        plcLineIds: selectedLineIds,
        lineDetails,
        deliveryTerms: vals.deliveryTerms,
        paymentTerms: vals.paymentTerms,
        groupNotes: vals.groupNotes,
      };
      const r = await apiRequest("POST", "/api/epc-po-groups", body);
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error ?? "Failed to create PO Group");
      }
      onSuccess();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const unacknowledgedIssues = avlIssues.filter((i) => !avlBypassAck[i.subgroupCode]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Create PO Group
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border-2 transition-colors",
                  step > s.id
                    ? "bg-green-500 border-green-500 text-white"
                    : step === s.id
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-300 text-gray-400",
                )}
              >
                {step > s.id ? <Check className="h-3.5 w-3.5" /> : s.id}
              </div>
              <span
                className={cn(
                  "ml-1.5 text-xs font-medium mr-3",
                  step === s.id ? "text-blue-700" : step > s.id ? "text-green-700" : "text-gray-400",
                )}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-gray-300 mr-2" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Vendor & AVL ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Select Vendor *</label>
              <Select
                value={selectedVendorId?.toString() ?? ""}
                onValueChange={(v) => {
                  const vend = vendors.find((x) => x.id === parseInt(v));
                  setSelectedVendorId(parseInt(v));
                  setSelectedVendorName(vend?.name ?? "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose vendor…" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {avlIssues.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  AVL Qualification Issues — please acknowledge before proceeding
                </div>
                {avlIssues.map((issue) => (
                  <label key={issue.subgroupCode} className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={!!avlBypassAck[issue.subgroupCode]}
                      onCheckedChange={(v) =>
                        setAvlBypassAck((prev) => ({ ...prev, [issue.subgroupCode]: !!v }))
                      }
                      className="mt-0.5"
                    />
                    <span className="text-sm text-amber-900">
                      Vendor is <strong>{issue.status ?? "not qualified"}</strong> for subgroup <strong>{issue.subgroupCode}</strong>.
                      I acknowledge this and confirm this vendor has been approved for use by management.
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleNextFromStep1}
                disabled={!selectedVendorId || unacknowledgedIssues.length > 0}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Line Selection ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select the PLC lines to include in this PO Group. Lines in <strong>PR Raised</strong> or <strong>Vendor Selected</strong> status without an existing PO Group are shown.
            </p>
            {linesLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading lines…
              </div>
            ) : eligibleLines.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No eligible lines available.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 w-8">
                        <Checkbox
                          checked={selectedLineIds.length === eligibleLines.length}
                          onCheckedChange={(v) => setSelectedLineIds(v ? eligibleLines.map((l) => l.id) : [])}
                        />
                      </th>
                      <th className="p-2 text-left font-semibold">PLC No</th>
                      <th className="p-2 text-left font-semibold">Tag No</th>
                      <th className="p-2 text-left font-semibold">Subgroup</th>
                      <th className="p-2 text-right font-semibold">Qty Reqd</th>
                      <th className="p-2 text-left font-semibold">UOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleLines.map((l) => (
                      <tr
                        key={l.id}
                        className={cn("border-t cursor-pointer hover:bg-gray-50", selectedLineIds.includes(l.id) ? "bg-blue-50/60" : "")}
                        onClick={() =>
                          setSelectedLineIds((prev) =>
                            prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id],
                          )
                        }
                      >
                        <td className="p-2">
                          <Checkbox checked={selectedLineIds.includes(l.id)} />
                        </td>
                        <td className="p-2 font-mono text-indigo-700 font-medium">{l.plcNumber}</td>
                        <td className="p-2">{l.tagNo ?? "—"}</td>
                        <td className="p-2">{l.subgroupLabel ?? l.subgroupCode ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{parseFloat(l.qtyRequired).toFixed(2)}</td>
                        <td className="p-2 text-gray-500">{l.uom ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{selectedLineIds.length} line(s) selected.</p>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={handleNextFromStep2} disabled={selectedLineIds.length === 0}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Rates & Terms ────────────────────────────────────────── */}
        {step === 3 && (
          <Form {...form}>
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left font-semibold">PLC No</th>
                      <th className="p-2 text-left font-semibold">Tag / Description</th>
                      <th className="p-2 text-right font-semibold w-24">Qty</th>
                      <th className="p-2 text-right font-semibold w-32">Unit Rate (₹)</th>
                      <th className="p-2 text-right font-semibold w-32">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLines.map((l) => {
                      const qty = parseFloat(lineRates[l.id]?.qty ?? l.qtyRequired) || 0;
                      const rate = parseFloat(lineRates[l.id]?.unitRate ?? "0") || 0;
                      return (
                        <tr key={l.id} className="border-t">
                          <td className="p-2 font-mono text-indigo-700">{l.plcNumber}</td>
                          <td className="p-2 max-w-[160px] truncate">
                            {l.tagNo ? <><strong>{l.tagNo}</strong> — </> : null}
                            {l.serviceDescription ?? l.itemDescription ?? "—"}
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-7 text-right text-xs"
                              value={lineRates[l.id]?.qty ?? l.qtyRequired}
                              onChange={(e) =>
                                setLineRates((prev) => ({
                                  ...prev,
                                  [l.id]: { ...prev[l.id], qty: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-7 text-right text-xs"
                              value={lineRates[l.id]?.unitRate ?? "0"}
                              onChange={(e) =>
                                setLineRates((prev) => ({
                                  ...prev,
                                  [l.id]: { ...prev[l.id], unitRate: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2 text-right tabular-nums font-medium">
                            {(qty * rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t font-semibold">
                    <tr>
                      <td colSpan={4} className="p-2 text-right">Total Amount</td>
                      <td className="p-2 text-right tabular-nums">
                        ₹ {selectedLines
                          .reduce((sum, l) => {
                            const qty = parseFloat(lineRates[l.id]?.qty ?? l.qtyRequired) || 0;
                            const rate = parseFloat(lineRates[l.id]?.unitRate ?? "0") || 0;
                            return sum + qty * rate;
                          }, 0)
                          .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="deliveryTerms" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Delivery Terms</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Ex-Works, CIF" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Payment Terms</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. 30 days from invoice" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="groupNotes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Group Notes</FormLabel>
                  <FormControl><Textarea {...field} rows={2} placeholder="Any notes for this PO Group…" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-between gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button onClick={() => setStep(4)}>
                  Review <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </Form>
        )}

        {/* ── Step 4: Review & Create ──────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-gray-50 p-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground text-xs">Vendor</span><p className="font-medium">{selectedVendorName}</p></div>
                <div><span className="text-muted-foreground text-xs">Lines</span><p className="font-medium">{selectedLineIds.length}</p></div>
                <div><span className="text-muted-foreground text-xs">Delivery Terms</span><p>{form.getValues("deliveryTerms") || "—"}</p></div>
                <div><span className="text-muted-foreground text-xs">Payment Terms</span><p>{form.getValues("paymentTerms") || "—"}</p></div>
              </div>
              {form.getValues("groupNotes") && (
                <div><span className="text-muted-foreground text-xs">Notes</span><p className="text-sm">{form.getValues("groupNotes")}</p></div>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left font-semibold">PLC No</th>
                    <th className="p-2 text-left font-semibold">Tag</th>
                    <th className="p-2 text-right font-semibold">Qty</th>
                    <th className="p-2 text-right font-semibold">Rate</th>
                    <th className="p-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLines.map((l) => {
                    const qty = parseFloat(lineRates[l.id]?.qty ?? l.qtyRequired) || 0;
                    const rate = parseFloat(lineRates[l.id]?.unitRate ?? "0") || 0;
                    return (
                      <tr key={l.id} className="border-t">
                        <td className="p-2 font-mono text-indigo-700">{l.plcNumber}</td>
                        <td className="p-2">{l.tagNo ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{qty.toFixed(2)}</td>
                        <td className="p-2 text-right tabular-nums">{rate.toFixed(2)}</td>
                        <td className="p-2 text-right tabular-nums font-medium">{(qty * rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              The PO Group will be saved as <strong>Draft</strong>. You can add rates and submit for approval after creation.
            </p>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating…</> : "Create PO Group"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
