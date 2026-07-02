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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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

interface Vendor { id: number; name: string; display_name?: string; sap_card_code?: string; }

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

// ─── Field row helper (SAP B1-style label : value pair) ──────────────────────

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start">
      <span className="w-32 shrink-0 text-xs text-muted-foreground pt-2 pr-2">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

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
  const [deliveryTerms,      setDeliveryTerms]      = useState("");
  const [paymentTerms,       setPaymentTerms]       = useState("");
  const [groupNotes,         setGroupNotes]         = useState("");
  const vendorRef = useRef<HTMLDivElement>(null);

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

  // AVL check whenever vendor changes
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

  const activeLines  = lines.filter((l) => activeLineIds.includes(l.id));

  function isEligible(l: PlcLine) {
    return POG_ELIGIBLE_STATUSES.includes(l.status) && !l.activePoGroupId;
  }

  const ineligibleLines       = activeLines.filter((l) => !isEligible(l));
  const unacknowledgedIssues  = avlIssues.filter((i) => !avlBypassAck[i.subgroupCode]);

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
        deliveryTerms,
        paymentTerms,
        groupNotes,
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
      <DialogContent className="max-w-5xl max-h-[94vh] overflow-y-auto p-0 gap-0">

        {/* ── Title bar ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-800">
          <div className="flex items-center gap-2 text-white">
            <Package className="h-4 w-4" />
            <span className="text-sm font-semibold tracking-wide">Purchase Order Group [Draft]</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300 text-xs">
            {linesLoading && <><Loader2 className="h-3 w-3 animate-spin" /> Loading lines…</>}
          </div>
        </div>

        <div className="p-5 space-y-0">

          {/* ── Two-column header (SAP B1 style) ────────────────────────── */}
          <div className="grid grid-cols-2 gap-x-8 pb-4 border-b">

            {/* Left column: Vendor, Terms */}
            <div className="space-y-2.5">
              <FieldRow label="Vendor" required>
                <div ref={vendorRef} className="relative">
                  <div
                    className={cn(
                      "flex items-center w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs ring-offset-background cursor-text",
                      vendorOpen && "outline-none ring-2 ring-ring ring-offset-1",
                    )}
                    onClick={() => setVendorOpen(true)}
                  >
                    {vendorOpen ? (
                      <input
                        autoFocus
                        className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-xs"
                        placeholder="Type vendor name or SAP code…"
                        value={vendorSearch}
                        onChange={(e) => setVendorSearch(e.target.value)}
                      />
                    ) : (
                      <span className={cn("flex-1 truncate text-xs", !selectedVendorId && "text-muted-foreground")}>
                        {selectedVendorId
                          ? (vendors.find((v) => v.id === selectedVendorId)?.name ?? selectedVendorName)
                          : (vendors.length === 0 ? "Run Sync to load vendors…" : "Select vendor…")}
                      </span>
                    )}
                    <svg className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {vendorOpen && (
                    <div className="absolute z-50 w-full mt-0.5 rounded border bg-popover shadow-lg max-h-52 overflow-y-auto">
                      {vendors.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No vendors — run Sync first</div>
                      ) : filteredVendors.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No vendor found</div>
                      ) : (
                        filteredVendors.map((v) => (
                          <div
                            key={v.id}
                            className={cn(
                              "flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground",
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
                {/* SAP sync row */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Button
                    type="button" variant="outline" size="sm"
                    className="h-7 px-2.5 text-xs gap-1 border-amber-300 text-amber-800 hover:bg-amber-50"
                    disabled={connTestMutation.isPending || syncMutation.isPending}
                    onClick={() => connTestMutation.mutate()}
                  >
                    {connTestMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
                    Test SAP
                  </Button>
                  <Button
                    type="button" variant="outline" size="sm"
                    className="h-7 px-2.5 text-xs gap-1"
                    disabled={syncMutation.isPending || connTestMutation.isPending}
                    onClick={() => syncMutation.mutate()}
                  >
                    {syncMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Full Sync
                  </Button>
                  {vendors.length > 0 && !syncMessage && (
                    <span className="text-xs text-muted-foreground">{vendors.length} vendors</span>
                  )}
                </div>
                {syncMessage && (
                  <p className={cn("text-xs mt-1", syncMessage.startsWith("✓") ? "text-green-700" : "text-destructive")}>
                    {syncMessage}
                  </p>
                )}
              </FieldRow>

              <FieldRow label="Delivery Terms">
                <Select value={deliveryTerms} onValueChange={setDeliveryTerms}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_TERMS_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Payment Terms">
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            </div>

            {/* Right column: doc meta */}
            <div className="space-y-2.5">
              <FieldRow label="Status">
                <div className="flex items-center h-8">
                  <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    Draft
                  </span>
                </div>
              </FieldRow>
              <FieldRow label="Lines">
                <div className="flex items-center h-8">
                  <span className="text-xs font-semibold">{activeLineIds.length}</span>
                  <span className="text-xs text-muted-foreground ml-1">line(s) selected</span>
                </div>
              </FieldRow>
              <FieldRow label="AVL Check">
                <div className="flex items-center h-8 gap-1.5">
                  {avlChecking ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Checking…</span></>
                  ) : avlIssues.length > 0 ? (
                    <span className="text-xs font-medium text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> {avlIssues.length} issue(s)
                    </span>
                  ) : selectedVendorId ? (
                    <span className="text-xs text-green-700 font-medium">✓ Qualified</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Select vendor to check</span>
                  )}
                </div>
              </FieldRow>
            </div>
          </div>

          {/* ── Lines grid ──────────────────────────────────────────────── */}
          <div className="py-4">

            {ineligibleLines.length > 0 && (
              <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 mb-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong>{ineligibleLines.length}</strong> line(s) not in PR Raised / Vendor Selected status or already in a PO Group — remove them to proceed.
                </span>
              </div>
            )}

            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-2 py-1.5 text-center font-semibold text-muted-foreground w-8">#</th>
                    <th className="px-2 py-1.5 text-left font-semibold">PLC No</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Tag / Item Description</th>
                    <th className="px-2 py-1.5 text-left font-semibold w-14">UOM</th>
                    <th className="px-2 py-1.5 text-right font-semibold w-20">Qty</th>
                    <th className="px-2 py-1.5 text-right font-semibold w-28">Unit Price (₹)</th>
                    <th className="px-2 py-1.5 text-right font-semibold w-28">Total (₹)</th>
                    <th className="px-2 py-1.5 w-7" />
                  </tr>
                </thead>
                <tbody>
                  {activeLines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-5 text-center text-muted-foreground">
                        No lines selected
                      </td>
                    </tr>
                  ) : activeLines.map((l, idx) => {
                    const eligible = isEligible(l);
                    const qty  = parseFloat(lineRates[l.id]?.qty      ?? l.qtyRequired) || 0;
                    const rate = parseFloat(lineRates[l.id]?.unitRate ?? "0")           || 0;
                    return (
                      <tr key={l.id} className={cn("border-t hover:bg-slate-50/50", !eligible && "bg-amber-50/50")}>
                        <td className="px-2 py-1 text-center text-muted-foreground">{idx + 1}</td>
                        <td className="px-2 py-1 font-mono text-indigo-700 whitespace-nowrap">
                          {l.plcNumber}
                          {!eligible && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
                        </td>
                        <td className="px-2 py-1 max-w-[200px] truncate">
                          {l.tagNo ? <span className="font-medium">{l.tagNo} — </span> : null}
                          {l.serviceDescription ?? l.itemDescription ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">{l.uom ?? "—"}</td>
                        <td className="px-1 py-1">
                          <Input
                            type="number" min="0" step="0.01"
                            className="h-7 text-right text-xs px-1.5"
                            value={lineRates[l.id]?.qty ?? l.qtyRequired}
                            onChange={(e) =>
                              setLineRates((prev) => ({
                                ...prev,
                                [l.id]: { ...prev[l.id], qty: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            type="number" min="0" step="0.01"
                            className="h-7 text-right text-xs px-1.5"
                            value={lineRates[l.id]?.unitRate ?? "0"}
                            onChange={(e) =>
                              setLineRates((prev) => ({
                                ...prev,
                                [l.id]: { ...prev[l.id], unitRate: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums font-medium">
                          {(qty * rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button
                            type="button"
                            title="Remove line"
                            className="text-gray-300 hover:text-red-500 transition-colors"
                            onClick={() => setActiveLineIds((prev) => prev.filter((x) => x !== l.id))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── AVL issues ──────────────────────────────────────────────── */}
          {avlIssues.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 space-y-2 mb-4">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                AVL Qualification Issues — acknowledge each to proceed
              </div>
              {avlIssues.map((issue) => (
                <label key={issue.subgroupCode} className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={!!avlBypassAck[issue.subgroupCode]}
                    onCheckedChange={(v) =>
                      setAvlBypassAck((prev) => ({ ...prev, [issue.subgroupCode]: !!v }))
                    }
                    className="mt-0.5 h-3.5 w-3.5"
                  />
                  <span className="text-xs text-amber-900">
                    Vendor is <strong>{issue.status ?? "not qualified"}</strong> for subgroup{" "}
                    <strong>{issue.subgroupCode}</strong>. I confirm management has approved this vendor.
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* ── Bottom: Remarks left + Totals right ─────────────────────── */}
          <div className="grid grid-cols-2 gap-x-8 pt-3 border-t">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Remarks</label>
              <Textarea
                rows={3}
                className="text-xs resize-none"
                placeholder="Any notes for this PO Group…"
                value={groupNotes}
                onChange={(e) => setGroupNotes(e.target.value)}
              />
            </div>
            <div className="flex flex-col justify-end space-y-1 pb-1">
              <div className="flex items-center justify-between py-1.5 border-b">
                <span className="text-xs text-muted-foreground">Total Before Tax</span>
                <span className="text-xs tabular-nums font-medium">
                  ₹ {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b">
                <span className="text-xs text-muted-foreground">Tax</span>
                <span className="text-xs text-muted-foreground tabular-nums">—</span>
              </div>
              <div className="flex items-center justify-between pt-1.5">
                <span className="text-sm font-semibold">Total Amount</span>
                <span className="text-sm font-bold tabular-nums">
                  ₹ {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* ── Footer buttons (SAP B1-style bottom bar) ────────────────── */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t mt-4">
            <Button variant="outline" size="sm" onClick={onClose} disabled={submitting} className="h-8 px-5 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!canCreate || submitting}
              className="h-8 px-5 text-xs"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add Draft &amp; Open
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
