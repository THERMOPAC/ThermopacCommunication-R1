import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ChevronRight, ChevronLeft, Check, X, Loader2, Package, RefreshCw, Wifi } from "lucide-react";
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

interface Vendor { id: number; name: string; display_name?: string; sap_card_code?: string; code?: string; }

interface AvlCheck { qualified: boolean; status: string | null; record: any; }

interface WizardProps {
  projectId: number;
  preselectedLineIds: number[];
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Steps: 3-step flow ──────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Vendor & AVL" },
  { id: 2, label: "Rates & Details" },
  { id: 3, label: "Review & Create" },
];

const POG_ELIGIBLE_STATUSES = ["pr_raised", "vendor_selected"];

const termsSchema = z.object({
  deliveryTerms: z.string().optional(),
  paymentTerms:  z.string().optional(),
  groupNotes:    z.string().optional(),
});

// ─── Component ───────────────────────────────────────────────────────────────

export function PoGroupWizard({ projectId, preselectedLineIds, onClose, onSuccess }: WizardProps) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [selectedVendorId,   setSelectedVendorId]   = useState<number | null>(null);
  const [selectedVendorName, setSelectedVendorName] = useState<string>("");
  // activeLineIds starts as the pre-selected set; user may only remove, never add
  const [activeLineIds,  setActiveLineIds]  = useState<number[]>(preselectedLineIds);
  const [lineRates,      setLineRates]      = useState<Record<number, { qty: string; unitRate: string }>>({});
  const [avlBypassAck,   setAvlBypassAck]   = useState<Record<string, boolean>>({});
  const [avlIssues,      setAvlIssues]      = useState<{ subgroupCode: string; status: string }[]>([]);
  const [submitting,     setSubmitting]     = useState(false);
  const [syncMessage,    setSyncMessage]    = useState<string | null>(null);
  const [vendorSearch,   setVendorSearch]   = useState("");
  const [vendorOpen,     setVendorOpen]     = useState(false);
  const vendorRef = useRef<HTMLDivElement>(null);

  const form = useForm<z.infer<typeof termsSchema>>({
    resolver: zodResolver(termsSchema),
    defaultValues: { deliveryTerms: "", paymentTerms: "", groupNotes: "" },
  });

  // ── SAP Test Connection (read-only, no DB writes) ────────────────────────
  const connTestMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vendors/sap/test-connection"),
    onSuccess: (data: any) => {
      setSyncMessage(`✓ ${data?.message ?? "SAP connection verified."}`);
      setTimeout(() => setSyncMessage(null), 5000);
    },
    onError: (err: any) => {
      const raw: string = err?.message ?? "unknown error";
      setSyncMessage(`✗ ${raw}`);
      setTimeout(() => setSyncMessage(null), 12000);
    },
  });

  // ── SAP Full Vendor Sync ──────────────────────────────────────────────────
  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vendors/sync"),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/vendors"] });
      setSyncMessage(`✓ ${data?.message ?? `Synced ${data?.synced ?? 0} vendors`}`);
      setTimeout(() => setSyncMessage(null), 5000);
    },
    onError: (err: any) => {
      const raw: string = err?.message ?? "unknown error";
      const isConflict = err?.status === 503 || err?.status === 409 || raw.includes("session") || raw.includes("Wait");
      setSyncMessage(`✗ ${raw}`);
      setTimeout(() => setSyncMessage(null), isConflict ? 20000 : 8000);
    },
  });

  // ── SAP Sync Reset (clear stuck lock) ────────────────────────────────────
  const resetMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vendors/sync/reset"),
    onSuccess: () => {
      setSyncMessage("✓ Sync lock cleared — you can retry now.");
      setTimeout(() => setSyncMessage(null), 6000);
    },
    onError: () => {
      setSyncMessage("✗ Reset failed — try reloading the page.");
      setTimeout(() => setSyncMessage(null), 6000);
    },
  });

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: lines = [], isLoading: linesLoading } = useQuery<PlcLine[]>({
    queryKey: ["/api/projects", projectId, "procurement-list"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/procurement-list`),
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    queryFn: () => apiRequest("GET", "/api/vendors"),
  });

  // Auto-populate vendor when all pre-selected lines share the same CBE vendor
  useEffect(() => {
    if (lines.length === 0 || preselectedLineIds.length === 0 || selectedVendorId) return;
    const pre = lines.filter((l) => preselectedLineIds.includes(l.id));
    const uids = [...new Set(pre.map((l) => l.vendorId).filter(Boolean))];
    if (uids.length === 1 && uids[0]) {
      const ref = pre.find((l) => l.vendorId === uids[0]);
      setSelectedVendorId(uids[0] as number);
      setSelectedVendorName(ref?.vendorName ?? "");
    }
  }, [lines, preselectedLineIds]);

  // ── Vendor search: close dropdown on outside click ────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (vendorRef.current && !vendorRef.current.contains(e.target as Node)) {
        setVendorOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Vendor search filter ──────────────────────────────────────────────────
  const filteredVendors = vendorSearch.trim() === ""
    ? vendors
    : vendors.filter((v) => {
        const q = vendorSearch.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          (v.display_name ?? "").toLowerCase().includes(q) ||
          (v.sap_card_code ?? "").toLowerCase().includes(q)
        );
      });

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeLines = lines.filter((l) => activeLineIds.includes(l.id));

  function isEligible(l: PlcLine) {
    return POG_ELIGIBLE_STATUSES.includes(l.status) && !l.activePoGroupId;
  }
  const ineligibleLines = activeLines.filter((l) => !isEligible(l));

  // ── AVL check ─────────────────────────────────────────────────────────────
  async function checkAvl(): Promise<{ subgroupCode: string; status: string }[]> {
    if (!selectedVendorId) return [];
    const subgroups = [...new Set(activeLines.map((l) => l.subgroupCode).filter(Boolean) as string[])];
    const issues: { subgroupCode: string; status: string }[] = [];
    for (const sg of subgroups) {
      const data: AvlCheck = await apiRequest(
        "GET",
        `/api/vendor-subgroup-qualification/check?vendorId=${selectedVendorId}&subgroupCode=${sg}`,
      );
      if (!data.qualified) issues.push({ subgroupCode: sg, status: data.status ?? "not_checked" });
    }
    return issues;
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  async function handleStep1Next() {
    if (!selectedVendorId) return;
    const issues = await checkAvl();
    setAvlIssues(issues);
    // Pre-populate rates from PLC qty on first entry
    setLineRates((prev) => {
      const next = { ...prev };
      for (const l of activeLines) {
        if (!next[l.id]) next[l.id] = { qty: l.qtyRequired, unitRate: "0" };
      }
      return next;
    });
    setStep(2);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!selectedVendorId || activeLineIds.length === 0) return;
    setSubmitting(true);
    try {
      const vals = form.getValues();
      await apiRequest("POST", "/api/epc-po-groups", {
        projectId,
        vendorId: selectedVendorId,
        vendorName: selectedVendorName,
        plcLineIds: activeLineIds,
        lineDetails: activeLineIds.map((id) => ({
          plcLineId: id,
          qty:      lineRates[id]?.qty      ?? "0",
          unitRate: lineRates[id]?.unitRate ?? "0",
        })),
        deliveryTerms: vals.deliveryTerms,
        paymentTerms:  vals.paymentTerms,
        groupNotes:    vals.groupNotes,
      });
      onSuccess();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const unacknowledgedIssues = avlIssues.filter((i) => !avlBypassAck[i.subgroupCode]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Create PO Group
          </DialogTitle>
        </DialogHeader>

        {/* ── Step indicator ─────────────────────────────────────────────── */}
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

        {/* ── Step 1: Vendor & AVL ───────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">

            {/* Locked line summary */}
            <div className="rounded-lg border bg-slate-50 px-3 py-2.5 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">
                <strong className="text-foreground">{activeLineIds.length}</strong> line(s) selected for this PO Group
              </span>
              {linesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>

            {/* Vendor selector + SAP sync */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">Select Vendor *</label>

              {/* Row 1: searchable vendor combobox */}
              <div ref={vendorRef} className="relative">
                <div
                  className={cn(
                    "flex items-center w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-text",
                    vendorOpen && "outline-none ring-2 ring-ring ring-offset-2",
                  )}
                  onClick={() => { setVendorOpen(true); }}
                >
                  {vendorOpen ? (
                    <input
                      autoFocus
                      className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                      placeholder="Type vendor name or SAP code…"
                      value={vendorSearch}
                      onChange={(e) => setVendorSearch(e.target.value)}
                    />
                  ) : (
                    <span className={cn("flex-1 truncate", !selectedVendorId && "text-muted-foreground")}>
                      {selectedVendorId
                        ? (vendors.find((v) => v.id === selectedVendorId)?.name ?? selectedVendorName)
                        : (vendors.length === 0 ? "Run Full Sync to load vendors…" : "Choose vendor…")}
                    </span>
                  )}
                  <svg className="h-4 w-4 text-muted-foreground shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>

                {vendorOpen && (
                  <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto">
                    {vendors.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No vendors — run Full Sync to import from SAP</div>
                    ) : filteredVendors.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No vendor found</div>
                    ) : (
                      filteredVendors.map((v) => (
                        <div
                          key={v.id}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                            selectedVendorId === v.id && "bg-accent font-medium",
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSelectedVendorId(v.id);
                            setSelectedVendorName(v.name);
                            setVendorSearch("");
                            setVendorOpen(false);
                            setAvlIssues([]);
                            setAvlBypassAck({});
                          }}
                        >
                          <span className="truncate">{v.name}</span>
                          {v.sap_card_code && (
                            <span className="ml-2 text-xs text-muted-foreground shrink-0">{v.sap_card_code}</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Row 2: Test Connection + Full Sync buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-9 border-amber-300 text-amber-800 hover:bg-amber-50"
                  disabled={connTestMutation.isPending || syncMutation.isPending}
                  onClick={() => connTestMutation.mutate()}
                  title="Verify SAP Service Layer connectivity — no DB changes"
                >
                  {connTestMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Wifi className="h-3.5 w-3.5" />}
                  {connTestMutation.isPending ? "Testing…" : "Test Connection"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-9"
                  disabled={syncMutation.isPending || connTestMutation.isPending}
                  onClick={() => syncMutation.mutate()}
                  title="Pull full vendor list from SAP and update DB"
                >
                  {syncMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5" />}
                  {syncMutation.isPending ? "Syncing…" : "Full Sync"}
                </Button>
              </div>

              {/* Sync / error message */}
              {syncMessage && (
                <p className={cn(
                  "text-xs font-medium",
                  syncMessage.startsWith("✓") ? "text-green-700" : "text-destructive"
                )}>
                  {syncMessage}
                </p>
              )}

              {/* Vendor count hint */}
              {vendors.length > 0 && !syncMessage && (
                <p className="text-xs text-muted-foreground">
                  {vendors.length} vendor{vendors.length !== 1 ? "s" : ""} available — sync if vendor not listed
                </p>
              )}

            </div>

            {/* AVL issues */}
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
                      Vendor is <strong>{issue.status ?? "not qualified"}</strong> for subgroup{" "}
                      <strong>{issue.subgroupCode}</strong>. I acknowledge this and confirm this vendor
                      has been approved for use by management.
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              {vendors.length > 0 && (
                <Button
                  onClick={handleStep1Next}
                  disabled={!selectedVendorId || unacknowledgedIssues.length > 0}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Rates & Details ────────────────────────────────────── */}
        {step === 2 && (
          <Form {...form}>
            <div className="space-y-4">

              {/* Ineligibility warning */}
              {ineligibleLines.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>{ineligibleLines.length}</strong> line(s) below are not in{" "}
                    <strong>PR Raised</strong> or <strong>Vendor Selected</strong> status, or already
                    belong to a PO Group. Remove them before submitting.
                  </span>
                </div>
              )}

              {/* Lines table — locked input, Remove only */}
              <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left font-semibold">PLC No</th>
                      <th className="p-2 text-left font-semibold">Tag / Description</th>
                      <th className="p-2 text-right font-semibold w-20">Qty</th>
                      <th className="p-2 text-right font-semibold w-28">Unit Rate (₹)</th>
                      <th className="p-2 text-right font-semibold w-28">Amount (₹)</th>
                      <th className="p-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeLines.map((l) => {
                      const eligible = isEligible(l);
                      const qty  = parseFloat(lineRates[l.id]?.qty      ?? l.qtyRequired) || 0;
                      const rate = parseFloat(lineRates[l.id]?.unitRate ?? "0")           || 0;
                      return (
                        <tr key={l.id} className={cn("border-t", !eligible && "bg-amber-50/60")}>
                          <td className="p-2 font-mono text-indigo-700 whitespace-nowrap">
                            {l.plcNumber}
                            {!eligible && (
                              <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />
                            )}
                          </td>
                          <td className="p-2 max-w-[150px] truncate">
                            {l.tagNo ? <><strong>{l.tagNo}</strong> — </> : null}
                            {l.serviceDescription ?? l.itemDescription ?? "—"}
                          </td>
                          <td className="p-2">
                            <Input
                              type="number" min="0" step="0.01"
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
                              type="number" min="0" step="0.01"
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
                          <td className="p-2">
                            <button
                              type="button"
                              title="Remove line"
                              className="text-gray-400 hover:text-red-500 transition-colors"
                              onClick={() => setActiveLineIds((prev) => prev.filter((x) => x !== l.id))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t font-semibold">
                    <tr>
                      <td colSpan={4} className="p-2 text-right text-xs">Total Amount</td>
                      <td className="p-2 text-right tabular-nums text-xs">
                        ₹{" "}
                        {activeLines
                          .reduce((sum, l) => {
                            const qty  = parseFloat(lineRates[l.id]?.qty      ?? l.qtyRequired) || 0;
                            const rate = parseFloat(lineRates[l.id]?.unitRate ?? "0")           || 0;
                            return sum + qty * rate;
                          }, 0)
                          .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {activeLineIds.length === 0 && (
                <p className="text-xs text-destructive text-center py-1">
                  All lines removed — go back and re-open the wizard with lines selected.
                </p>
              )}

              {/* Terms */}
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
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Any notes for this PO Group…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-between gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={activeLineIds.length === 0 || ineligibleLines.length > 0}
                >
                  Review <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </Form>
        )}

        {/* ── Step 3: Review & Create ────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Summary card */}
            <div className="rounded-lg border bg-gray-50 p-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground text-xs">Vendor</span>
                  <p className="font-medium">{selectedVendorName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Lines</span>
                  <p className="font-medium">{activeLineIds.length}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Delivery Terms</span>
                  <p>{form.getValues("deliveryTerms") || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Payment Terms</span>
                  <p>{form.getValues("paymentTerms") || "—"}</p>
                </div>
              </div>
              {form.getValues("groupNotes") && (
                <div>
                  <span className="text-muted-foreground text-xs">Notes</span>
                  <p className="text-sm">{form.getValues("groupNotes")}</p>
                </div>
              )}
            </div>

            {/* Lines review table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left font-semibold">PLC No</th>
                    <th className="p-2 text-left font-semibold">Tag</th>
                    <th className="p-2 text-right font-semibold">Qty</th>
                    <th className="p-2 text-right font-semibold">Rate (₹)</th>
                    <th className="p-2 text-right font-semibold">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLines.map((l) => {
                    const qty  = parseFloat(lineRates[l.id]?.qty      ?? l.qtyRequired) || 0;
                    const rate = parseFloat(lineRates[l.id]?.unitRate ?? "0")           || 0;
                    return (
                      <tr key={l.id} className="border-t">
                        <td className="p-2 font-mono text-indigo-700">{l.plcNumber}</td>
                        <td className="p-2">{l.tagNo ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{qty.toFixed(2)}</td>
                        <td className="p-2 text-right tabular-nums">{rate.toFixed(2)}</td>
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
                      ₹{" "}
                      {activeLines
                        .reduce((sum, l) => {
                          const qty  = parseFloat(lineRates[l.id]?.qty      ?? l.qtyRequired) || 0;
                          const rate = parseFloat(lineRates[l.id]?.unitRate ?? "0")           || 0;
                          return sum + qty * rate;
                        }, 0)
                        .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Create PO Group
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    </>
  );
}
