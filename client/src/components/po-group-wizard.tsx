import { useState, useEffect } from "react";
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
import { AlertTriangle, ChevronRight, ChevronLeft, Check, X, Loader2, Package, RefreshCw, FlaskConical, CheckCircle2, XCircle, HelpCircle, BarChart2 } from "lucide-react";
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
  const [testResult,     setTestResult]     = useState<any | null>(null);
  const [showTestPanel,  setShowTestPanel]  = useState(false);
  const [udfDist,        setUdfDist]        = useState<any | null>(null);
  const [showUdfDialog,  setShowUdfDialog]  = useState(false);

  const form = useForm<z.infer<typeof termsSchema>>({
    resolver: zodResolver(termsSchema),
    defaultValues: { deliveryTerms: "", paymentTerms: "", groupNotes: "" },
  });

  // ── SAP Vendor Test Run ───────────────────────────────────────────────────
  const testMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vendors/sync/test?limit=20"),
    onSuccess: (data: any) => {
      setTestResult(data);
      setShowTestPanel(true);
      qc.invalidateQueries({ queryKey: ["/api/vendors"] });
    },
    onError: (err: any) => {
      const raw: string = err?.message ?? "unknown error";
      const isConflict = raw.includes("session") || raw.includes("Wait");
      setSyncMessage(`✗ ${raw}`);
      setTimeout(() => setSyncMessage(null), isConflict ? 20000 : 8000);
    },
  });

  // ── SAP Full Vendor Sync ──────────────────────────────────────────────────
  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vendors/sync"),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/vendors"] });
      setTestResult(null);
      setShowTestPanel(false);
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

  // ── SAP UDF Distribution Query ────────────────────────────────────────────
  const udfMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vendors/sap/udf-distribution"),
    onSuccess: (data: any) => {
      setUdfDist(data);
      setShowUdfDialog(true);
    },
    onError: (err: any) => {
      const raw: string = err?.message ?? "unknown error";
      const isConflict = raw.includes("session") || raw.includes("Wait");
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

              {/* Row 1: dropdown */}
              <Select
                value={selectedVendorId?.toString() ?? ""}
                onValueChange={(v) => {
                  const vend = vendors.find((x) => x.id === parseInt(v));
                  setSelectedVendorId(parseInt(v));
                  setSelectedVendorName(vend?.name ?? "");
                  setAvlIssues([]);
                  setAvlBypassAck({});
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={vendors.length === 0 ? "Run Test SAP first to load vendors…" : "Choose vendor…"} />
                </SelectTrigger>
                <SelectContent>
                  {vendors.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No vendors — run Test SAP to verify, then Full Sync
                    </div>
                  ) : (
                    vendors.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {/* Row 2: Test + UDF Check + Full Sync buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-9 border-amber-300 text-amber-800 hover:bg-amber-50"
                  disabled={testMutation.isPending || syncMutation.isPending || udfMutation.isPending}
                  onClick={() => { setShowTestPanel(false); testMutation.mutate(); }}
                  title="Fetch 20 vendors from SAP and verify UDF + exclusion logic before full sync"
                >
                  {testMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <FlaskConical className="h-3.5 w-3.5" />}
                  {testMutation.isPending ? "Testing…" : "Test SAP"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-9 border-blue-300 text-blue-800 hover:bg-blue-50"
                  disabled={testMutation.isPending || syncMutation.isPending || udfMutation.isPending}
                  onClick={() => udfMutation.mutate()}
                  title="Query SAP for U_ERP_Group distribution across all vendor codes"
                >
                  {udfMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <BarChart2 className="h-3.5 w-3.5" />}
                  {udfMutation.isPending ? "Querying…" : "UDF Check"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs h-9"
                  disabled={syncMutation.isPending || testMutation.isPending || udfMutation.isPending}
                  onClick={() => syncMutation.mutate()}
                  title="Pull full vendor list from SAP (run test first)"
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

              {/* Test results panel */}
              {showTestPanel && testResult && (
                <div className={cn(
                  "rounded-lg border p-3 space-y-2 text-xs",
                  testResult.sessionConflict
                    ? "border-orange-300 bg-orange-50"
                    : testResult.udfAvailable
                      ? "border-green-300 bg-green-50"
                      : "border-amber-300 bg-amber-50"
                )}>
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">SAP Test Run Results</span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setShowTestPanel(false)}
                    ><X className="h-3.5 w-3.5" /></button>
                  </div>

                  {/* Session conflict warning */}
                  {testResult.sessionConflict && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-orange-800 font-medium">
                        SAP session busy — another sync may be running. Wait 1–2 min or force-clear the lock.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-xs border-orange-400 text-orange-700 hover:bg-orange-100 h-7 px-2"
                        onClick={() => resetMutation.mutate()}
                        disabled={resetMutation.isPending}
                      >
                        {resetMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Force Reset"}
                      </Button>
                    </div>
                  )}

                  {!testResult.sessionConflict && (
                    <>
                      {/* Summary row */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "SAP login",        ok: testResult.login },
                          { label: "U_ERP_Group field", ok: testResult.udfAvailable },
                          { label: "Saved to DB",       ok: testResult.upserted > 0 },
                        ].map(({ label, ok }) => (
                          <div key={label} className="flex items-center gap-1">
                            {ok
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                              : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                            <span className={ok ? "text-green-800" : "text-red-700"}>{label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Counts */}
                      <div className="flex gap-4 text-muted-foreground">
                        <span>Fetched from SAP: <strong className="text-foreground">{testResult.fetched}</strong></span>
                        <span>Classified (U_ERP_Group set): <strong className="text-green-700">{testResult.eligible}</strong></span>
                        <span>Saved to DB: <strong className="text-foreground">{testResult.upserted}</strong></span>
                      </div>

                      {/* Result table — mirrors SAP SQL output */}
                      {testResult.sample.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-gray-300 bg-gray-100">
                                <th className="text-left py-1 px-2 font-semibold text-muted-foreground">BP Code</th>
                                <th className="text-left py-1 px-2 font-semibold text-muted-foreground">BP Name</th>
                                <th className="text-left py-1 px-2 font-semibold text-muted-foreground">ERP Group</th>
                                <th className="text-left py-1 px-2 font-semibold text-muted-foreground">DB Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {testResult.sample.map((row: any) => (
                                <tr key={row.cardCode} className="border-b border-gray-100 hover:bg-gray-50">
                                  <td className="py-0.5 px-2 font-mono text-blue-700">{row.cardCode}</td>
                                  <td className="py-0.5 px-2 max-w-[180px] truncate">{row.cardName}</td>
                                  <td className="py-0.5 px-2">
                                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono font-semibold">
                                      {row.udfRaw}
                                    </span>
                                  </td>
                                  <td className="py-0.5 px-2">
                                    {row.upsertedToDb
                                      ? <span className="text-green-600 font-medium">✓ saved</span>
                                      : <span className="text-muted-foreground">—</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : testResult.udfAvailable ? (
                        <p className="text-muted-foreground italic text-center py-2">
                          No vendors with U_ERP_Group set found in the first {testResult.fetched} scanned.
                        </p>
                      ) : null}

                      {/* Recommendation */}
                      {testResult.udfAvailable && testResult.eligible > 0 && (
                        <p className="text-green-800 font-medium">
                          ✓ Found {testResult.eligible} classified vendor{testResult.eligible !== 1 ? "s" : ""} — U_ERP_Group is readable. Safe to run Full Sync.
                        </p>
                      )}
                      {testResult.udfAvailable && testResult.eligible === 0 && (
                        <p className="text-amber-800 font-medium">
                          ⚠ U_ERP_Group field is present but no vendors have it set in the first {testResult.fetched} scanned.
                        </p>
                      )}
                      {!testResult.udfAvailable && (
                        <div className="space-y-1">
                          <p className="text-red-700 font-medium">
                            ✗ U_ERP_Group field missing from SAP response — no vendors were saved.
                          </p>
                          <p className="text-amber-800 text-xs">
                            This usually means the SAP session was contaminated by a prior operation that used <code>$select</code>. Click <strong>Test SAP</strong> again — the session is now reset and a 4 s cooldown has been applied so the next run should return UDF fields correctly.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
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
              <Button
                onClick={handleStep1Next}
                disabled={!selectedVendorId || unacknowledgedIssues.length > 0}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
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

    {/* ── UDF Distribution Dialog ────────────────────────────────────────── */}
    <Dialog open={showUdfDialog} onOpenChange={setShowUdfDialog}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-blue-600" />
            SAP U_ERP_Group Distribution
          </DialogTitle>
        </DialogHeader>

        {udfDist && (
          <div className="space-y-4 text-sm">

            {/* Session conflict */}
            {udfDist.sessionConflict && (
              <p className="text-orange-700 font-medium bg-orange-50 border border-orange-200 rounded p-3">
                SAP session conflict — wait 1–2 minutes and try again.
              </p>
            )}

            {/* Query error (UDF filter unsupported) */}
            {udfDist.queryError && (
              <p className="text-red-700 bg-red-50 border border-red-200 rounded p-3 text-xs font-mono break-all">
                ⚠ {udfDist.queryError}
              </p>
            )}

            {!udfDist.sessionConflict && (
              <>
                {/* Method note */}
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2.5">
                  <HelpCircle className="h-3.5 w-3.5 mt-0.5 text-blue-500 shrink-0" />
                  <span>
                    SAP OData does not support filtering by UDF fields — counts below are from the first{" "}
                    <strong>{udfDist.sampledTotal ?? 300}</strong> vendors sampled (no {"`"}$select{"`"}, UDFs included in full record).
                    Counts reflect the sample window, not the full 1,458-vendor population.
                  </span>
                </div>

                {/* Summary bar */}
                <div className="flex gap-6 bg-gray-50 border rounded p-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Sampled vendors</div>
                    <div className="text-2xl font-bold text-blue-700">{udfDist.sampledTotal ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Classified (in sample)</div>
                    <div className="text-2xl font-bold text-green-700">{udfDist.totalClassified}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Blank / unclassified</div>
                    <div className="text-2xl font-bold text-amber-600">
                      {udfDist.nullOrEmpty === -1 ? "—" : udfDist.nullOrEmpty}
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-xs text-muted-foreground">Codes found</div>
                    <div className="text-2xl font-bold text-indigo-700">
                      {(udfDist.groups ?? []).filter((g: any) => g.count > 0).length} / 7
                    </div>
                  </div>
                </div>

                {/* Per-code breakdown */}
                {(udfDist.groups ?? []).map((grp: any) => (
                  <div key={grp.code} className="border rounded-lg overflow-hidden">
                    {/* Group header */}
                    <div className={cn(
                      "flex items-center justify-between px-3 py-2",
                      grp.count === 0 ? "bg-gray-50" : "bg-blue-50"
                    )}>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "inline-flex items-center justify-center w-7 h-7 rounded font-mono font-bold text-sm",
                          grp.count > 0 ? "bg-blue-600 text-white" : "bg-gray-300 text-gray-600"
                        )}>
                          {grp.code}
                        </span>
                        <div>
                          <div className="font-medium text-sm">{grp.label}</div>
                          <div className="text-xs text-muted-foreground">U_ERP_Group = '{grp.code}'</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn("text-xl font-bold", grp.count > 0 ? "text-blue-700" : "text-gray-400")}>
                          {grp.count}{grp.capped ? "+" : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">vendors</div>
                      </div>
                    </div>

                    {/* Sample rows */}
                    {grp.samples.length > 0 ? (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-t bg-gray-50">
                            <th className="text-left px-3 py-1 font-medium text-muted-foreground w-28">CardCode</th>
                            <th className="text-left px-3 py-1 font-medium text-muted-foreground">CardName</th>
                            <th className="text-left px-3 py-1 font-medium text-muted-foreground w-24">U_ERP_Group</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grp.samples.map((s: any) => (
                            <tr key={s.cardCode} className="border-t">
                              <td className="px-3 py-1.5 font-mono text-indigo-700">{s.cardCode}</td>
                              <td className="px-3 py-1.5 truncate max-w-[300px]">{s.cardName}</td>
                              <td className="px-3 py-1.5 font-mono">
                                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">{s.udfRaw || "—"}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="px-3 py-2 text-xs text-muted-foreground italic">
                        No vendors with U_ERP_Group = '{grp.code}' found in SAP
                      </p>
                    )}
                  </div>
                ))}

                {/* Unclassified note */}
                {udfDist.nullOrEmpty > 0 && (
                  <div className="border border-amber-200 rounded-lg p-3 bg-amber-50 text-xs text-amber-800">
                    <strong>{udfDist.nullOrEmpty} vendors</strong> have a blank U_ERP_Group in SAP.
                    These will sync with <code className="bg-amber-100 px-1 rounded">vendor_type = null</code> until
                    the field is populated in the SAP Business Partner master record.
                  </div>
                )}

                {udfDist.totalClassified === 0 && !udfDist.queryError && (
                  <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                    No vendors found for any U_ERP_Group code. The UDF may not be populated in SAP yet.
                  </p>
                )}
              </>
            )}

            <div className="flex justify-end pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setShowUdfDialog(false)}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
