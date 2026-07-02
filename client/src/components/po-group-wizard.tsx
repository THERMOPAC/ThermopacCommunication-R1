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
import { AlertTriangle, X, Loader2, Package, RefreshCw, Wifi } from "lucide-react";
import { PAYMENT_TERMS_OPTIONS, DELIVERY_TERMS_OPTIONS } from "@/pages/po-group-detail-page";
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

interface AvlIssue { subgroupCode: string; status: string; }

interface WizardProps {
  projectId: number;
  preselectedLineIds: number[];
  onClose: () => void;
  onSuccess: (pogId: number) => void;
}

const POG_ELIGIBLE_STATUSES = ["pr_raised", "vendor_selected"];

const formSchema = z.object({
  deliveryTerms: z.string().optional(),
  paymentTerms:  z.string().optional(),
  groupNotes:    z.string().optional(),
});

// ─── Component ───────────────────────────────────────────────────────────────

export function PoGroupWizard({ projectId, preselectedLineIds, onClose, onSuccess }: WizardProps) {
  const qc = useQueryClient();

  const [selectedVendorId,   setSelectedVendorId]   = useState<number | null>(null);
  const [selectedVendorName, setSelectedVendorName] = useState<string>("");
  const [activeLineIds,      setActiveLineIds]      = useState<number[]>(preselectedLineIds);
  const [lineRates,          setLineRates]          = useState<Record<number, { qty: string; unitRate: string }>>({});
  const [avlIssues,          setAvlIssues]          = useState<AvlIssue[]>([]);
  const [avlChecking,        setAvlChecking]        = useState(false);
  const [avlBypassAck,       setAvlBypassAck]       = useState<Record<string, boolean>>({});
  const [submitting,         setSubmitting]         = useState(false);
  const [syncMessage,        setSyncMessage]        = useState<string | null>(null);
  const [vendorSearch,       setVendorSearch]       = useState("");
  const [vendorOpen,         setVendorOpen]         = useState(false);
  const vendorRef = useRef<HTMLDivElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { deliveryTerms: "", paymentTerms: "", groupNotes: "" },
  });

  // ── SAP mutations ─────────────────────────────────────────────────────────
  const connTestMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vendors/sap/test-connection"),
    onSuccess: (data: any) => {
      setSyncMessage(`✓ ${data?.message ?? "SAP connection verified."}`);
      setTimeout(() => setSyncMessage(null), 5000);
    },
    onError: (err: any) => {
      setSyncMessage(`✗ ${err?.message ?? "unknown error"}`);
      setTimeout(() => setSyncMessage(null), 12000);
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vendors/sync"),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/vendors"] });
      setSyncMessage(`✓ ${data?.message ?? `Synced ${data?.synced ?? 0} vendors`}`);
      setTimeout(() => setSyncMessage(null), 5000);
    },
    onError: (err: any) => {
      setSyncMessage(`✗ ${err?.message ?? "unknown error"}`);
      setTimeout(() => setSyncMessage(null), 12000);
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

  // Pre-populate qty from PLC on first load
  useEffect(() => {
    if (lines.length === 0) return;
    setLineRates((prev) => {
      const next = { ...prev };
      for (const l of lines) {
        if (preselectedLineIds.includes(l.id) && !next[l.id]) {
          next[l.id] = { qty: l.qtyRequired, unitRate: "0" };
        }
      }
      return next;
    });
  }, [lines]);

  // Auto-select vendor when all pre-selected lines share the same CBE vendor
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

  // Run AVL check whenever vendor changes
  useEffect(() => {
    if (!selectedVendorId || lines.length === 0) { setAvlIssues([]); return; }
    let cancelled = false;
    setAvlChecking(true);
    const activeLines = lines.filter((l) => activeLineIds.includes(l.id));
    const subgroups = [...new Set(activeLines.map((l) => l.subgroupCode).filter(Boolean) as string[])];
    (async () => {
      const issues: AvlIssue[] = [];
      for (const sg of subgroups) {
        const data: any = await apiRequest(
          "GET",
          `/api/vendor-subgroup-qualification/check?vendorId=${selectedVendorId}&subgroupCode=${sg}`,
        );
        if (!data.qualified) issues.push({ subgroupCode: sg, status: data.status ?? "not_checked" });
      }
      if (!cancelled) { setAvlIssues(issues); setAvlBypassAck({}); setAvlChecking(false); }
    })().catch(() => { if (!cancelled) setAvlChecking(false); });
    return () => { cancelled = true; };
  }, [selectedVendorId, lines]);

  // Close vendor dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (vendorRef.current && !vendorRef.current.contains(e.target as Node)) setVendorOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
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

  const activeLines = lines.filter((l) => activeLineIds.includes(l.id));

  function isEligible(l: PlcLine) {
    return POG_ELIGIBLE_STATUSES.includes(l.status) && !l.activePoGroupId;
  }

  const ineligibleLines = activeLines.filter((l) => !isEligible(l));
  const unacknowledgedIssues = avlIssues.filter((i) => !avlBypassAck[i.subgroupCode]);

  const totalAmount = activeLines.reduce((sum, l) => {
    const qty  = parseFloat(lineRates[l.id]?.qty      ?? l.qtyRequired) || 0;
    const rate = parseFloat(lineRates[l.id]?.unitRate ?? "0")           || 0;
    return sum + qty * rate;
  }, 0);

  const canCreate =
    !!selectedVendorId &&
    activeLineIds.length > 0 &&
    ineligibleLines.length === 0 &&
    unacknowledgedIssues.length === 0 &&
    !avlChecking;

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canCreate) return;
    setSubmitting(true);
    try {
      const vals = form.getValues();
      const created = await apiRequest<{ id: number }>("POST", "/api/epc-po-groups", {
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
      onSuccess((created as any).id);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Create PO Group
            {linesLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-1" />}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <div className="space-y-5">

            {/* ── Header fields ───────────────────────────────────────────── */}
            <div className="rounded-lg border bg-slate-50/60 p-4 space-y-3">

              {/* Vendor row */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">Vendor *</label>
                <div className="flex gap-2 items-start">

                  {/* Searchable vendor combobox */}
                  <div ref={vendorRef} className="relative flex-1">
                    <div
                      className={cn(
                        "flex items-center w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-text",
                        vendorOpen && "outline-none ring-2 ring-ring ring-offset-2",
                      )}
                      onClick={() => setVendorOpen(true)}
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
                      <svg className="h-4 w-4 text-muted-foreground shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    {vendorOpen && (
                      <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-lg max-h-52 overflow-y-auto">
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

                  {/* SAP buttons */}
                  <Button
                    type="button" variant="outline" size="sm"
                    className="gap-1.5 text-xs h-9 border-amber-300 text-amber-800 hover:bg-amber-50 shrink-0"
                    disabled={connTestMutation.isPending || syncMutation.isPending}
                    onClick={() => connTestMutation.mutate()}
                    title="Verify SAP connectivity"
                  >
                    {connTestMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                    Test
                  </Button>
                  <Button
                    type="button" variant="outline" size="sm"
                    className="gap-1.5 text-xs h-9 shrink-0"
                    disabled={syncMutation.isPending || connTestMutation.isPending}
                    onClick={() => syncMutation.mutate()}
                    title="Pull full vendor list from SAP"
                  >
                    {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Sync
                  </Button>
                </div>

                {syncMessage && (
                  <p className={cn("text-xs font-medium", syncMessage.startsWith("✓") ? "text-green-700" : "text-destructive")}>
                    {syncMessage}
                  </p>
                )}
                {vendors.length > 0 && !syncMessage && (
                  <p className="text-xs text-muted-foreground">
                    {vendors.length} vendor{vendors.length !== 1 ? "s" : ""} — sync if vendor not listed
                  </p>
                )}
              </div>

              {/* Terms row */}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="deliveryTerms" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Delivery Terms</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-xs bg-background">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DELIVERY_TERMS_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Payment Terms</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-xs bg-background">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_TERMS_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Notes */}
              <FormField control={form.control} name="groupNotes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Group Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} className="text-xs bg-background" placeholder="Any notes for this PO Group…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── Lines table ─────────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">
                  Lines
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">({activeLineIds.length} selected)</span>
                </span>
                {avlChecking && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking AVL…
                  </span>
                )}
              </div>

              {ineligibleLines.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mb-2 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    <strong>{ineligibleLines.length}</strong> line(s) are not in PR Raised / Vendor Selected status
                    or already belong to a PO Group. Remove them to proceed.
                  </span>
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left font-semibold">PLC No</th>
                      <th className="p-2 text-left font-semibold">Tag / Description</th>
                      <th className="p-2 text-left font-semibold w-16">UOM</th>
                      <th className="p-2 text-right font-semibold w-20">Qty</th>
                      <th className="p-2 text-right font-semibold w-28">Unit Rate (₹)</th>
                      <th className="p-2 text-right font-semibold w-28">Amount (₹)</th>
                      <th className="p-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeLines.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-muted-foreground">
                          No lines — all were removed
                        </td>
                      </tr>
                    ) : activeLines.map((l) => {
                      const eligible = isEligible(l);
                      const qty  = parseFloat(lineRates[l.id]?.qty      ?? l.qtyRequired) || 0;
                      const rate = parseFloat(lineRates[l.id]?.unitRate ?? "0")           || 0;
                      return (
                        <tr key={l.id} className={cn("border-t", !eligible && "bg-amber-50/60")}>
                          <td className="p-2 font-mono text-indigo-700 whitespace-nowrap">
                            {l.plcNumber}
                            {!eligible && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
                          </td>
                          <td className="p-2 max-w-[180px] truncate">
                            {l.tagNo ? <><strong>{l.tagNo}</strong> — </> : null}
                            {l.serviceDescription ?? l.itemDescription ?? "—"}
                          </td>
                          <td className="p-2 text-muted-foreground">{l.uom ?? "—"}</td>
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
                  {activeLines.length > 0 && (
                    <tfoot className="bg-gray-50 border-t font-semibold">
                      <tr>
                        <td colSpan={5} className="p-2 text-right text-xs">Total Amount</td>
                        <td className="p-2 text-right tabular-nums text-xs">
                          ₹ {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* ── AVL issues ──────────────────────────────────────────────── */}
            {avlIssues.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  AVL Qualification Issues — acknowledge to proceed
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
                      <strong>{issue.subgroupCode}</strong>. I acknowledge this and confirm management approval.
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div className="flex justify-end gap-2 pt-1 border-t">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canCreate || submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Create PO Group
              </Button>
            </div>

          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
