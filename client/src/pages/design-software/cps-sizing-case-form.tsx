// ── CPS Sizing Tool — Customer Input form (approved register; NO sizing logic) ──
// Shared between the "New Sizing Case" page and the edit dialog on the
// Existing Sizing Cases page. Single-column layout; customer selection from
// the Customer Database only (no free text); location auto-fills and stays
// editable; conditional sulphur fields per treatment scope. Server-side
// validation remains authoritative.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown } from "lucide-react";
import { SizingCase, Customer, SCOPES, RRBO_GRADES, RRBO_VISC_RANGES, fmtNum, customerLocation } from "./cps-sizing-shared";

// Required CPS Capacity options — L/Day, three ranges with different increments.
//   Range 1: 5,000 – 1,00,000   step  5,000  (20 values)
//   Range 2: 1,10,000 – 2,00,000 step 10,000  (10 values)
//   Range 3: 2,20,000 – 3,00,000 step 20,000  ( 5 values)
// Boundary values (1,00,000 and 2,00,000) appear exactly once — end of each range.
const CPS_CAPACITY_OPTIONS: number[] = [
  ...Array.from({ length: 20 }, (_, i) => (i + 1) * 5_000),   // 5 000 … 1 00 000
  ...Array.from({ length: 10 }, (_, i) => (i + 11) * 10_000), // 1 10 000 … 2 00 000
  ...Array.from({ length: 5  }, (_, i) => (i + 11) * 20_000), // 2 20 000 … 3 00 000
];

const BLANK = {
  customerId: "", customerName: "", plantLocation: "", cpsFeedCapacity: "", rrboGrade: "",
  feedOilVisc40c: "", treatmentScope: "COLOUR_ODOR",
  inletColour: "", targetColour: "", inletSulphur: "", targetSulphur: "",
};

function fromCase(c: SizingCase): typeof BLANK {
  return {
    customerId: c.customer_id != null ? String(c.customer_id) : "",
    customerName: c.customer_name, plantLocation: c.plant_location,
    cpsFeedCapacity: fmtNum(c.cps_feed_capacity), rrboGrade: c.rrbo_grade,
    feedOilVisc40c: fmtNum(c.feed_oil_visc_40c), treatmentScope: c.treatment_scope,
    inletColour: fmtNum(c.inlet_colour), targetColour: fmtNum(c.target_colour),
    inletSulphur: fmtNum(c.inlet_sulphur), targetSulphur: fmtNum(c.target_sulphur),
  };
}

export default function CpsSizingCaseForm({ editing, onSaved, onCancel }: {
  editing: SizingCase | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const customersQ = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers") as Promise<Customer[]>,
  });
  const customers = customersQ.data ?? [];

  const [form, setForm] = useState<typeof BLANK>(editing ? fromCase(editing) : BLANK);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  // Scope-switch confirmation dialog state
  const [pendingScope, setPendingScope] = useState<string | null>(null);
  const set = (k: keyof typeof BLANK) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const isSulphurScope = form.treatmentScope === "COLOUR_ODOR_SULPHUR";

  // Scope switch to colour-only clears sulphur fields explicitly (with confirmation
  // dialog when values exist) so stale sulphur can never ride along silently.
  const changeScope = (scope: string) => {
    if (scope === "COLOUR_ODOR" && (form.inletSulphur !== "" || form.targetSulphur !== "")) {
      // Show confirmation dialog instead of native window.confirm
      setPendingScope(scope);
      return;
    }
    setForm(f => ({ ...f, treatmentScope: scope }));
  };

  const confirmScopeSwitch = () => {
    if (pendingScope) {
      setForm(f => ({ ...f, treatmentScope: pendingScope, inletSulphur: "", targetSulphur: "" }));
      setPendingScope(null);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        customerId: form.customerId !== "" ? Number(form.customerId) : null,
        customerName: form.customerName, plantLocation: form.plantLocation,
        cpsFeedCapacity: form.cpsFeedCapacity, rrboGrade: form.rrboGrade,
        feedOilVisc40c: form.feedOilVisc40c, treatmentScope: form.treatmentScope,
        inletColour: form.inletColour, targetColour: form.targetColour,
        inletSulphur: isSulphurScope && form.inletSulphur.trim() !== "" ? form.inletSulphur : null,
        targetSulphur: isSulphurScope && form.targetSulphur.trim() !== "" ? form.targetSulphur : null,
      };
      if (editing) return apiRequest("PATCH", `/api/design-software/cps/sizing-cases/${editing.id}`, payload);
      return apiRequest("POST", "/api/design-software/cps/sizing-cases", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/design-software/cps/sizing-cases"] });
      toast({ title: editing ? "Sizing case updated" : "Sizing case created" });
      onSaved();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "Validation error", variant: "destructive" }),
  });

  return (
    <>
    <AlertDialog open={pendingScope !== null} onOpenChange={open => { if (!open) setPendingScope(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Switch Treatment Scope?</AlertDialogTitle>
          <AlertDialogDescription>
            You have entered <strong>Inlet Sulphur</strong> and <strong>Target Sulphur</strong> values.
            <br /><br />
            Switching to <strong>Colour &amp; Odor Improvement</strong> will clear these fields — sulphur
            parameters are not used in that scope and cannot be carried over.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Sulphur Scope</AlertDialogCancel>
          <AlertDialogAction onClick={confirmScopeSwitch} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Switch &amp; Clear Sulphur Values
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="space-y-3">

      {/* ── Card 1 — Customer & Feed Oil ───────────────────────────────────── */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Customer &amp; Feed Oil</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {/* Customer Name */}
            <div className="space-y-1.5">
              <Label>Customer Name *</Label>
              <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={customerPickerOpen}
                    className="w-full justify-between font-normal" data-testid="button-customer-picker">
                    <span className={form.customerName ? "" : "text-muted-foreground"}>
                      {form.customerName || (customersQ.isLoading ? "Loading customers…" : "Select customer…")}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search customer…" data-testid="input-customer-search" />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {customers.map(c => (
                          <CommandItem
                            key={c.id}
                            value={`${c.bpName} ${c.bpCode}`}
                            onSelect={() => {
                              setForm(f => ({
                                ...f,
                                customerId: String(c.id),
                                customerName: c.bpName,
                                plantLocation: customerLocation(c),
                              }));
                              setCustomerPickerOpen(false);
                            }}
                            data-testid={`option-customer-${c.id}`}
                          >
                            <Check className={`mr-2 h-4 w-4 ${form.customerId === String(c.id) ? "opacity-100" : "opacity-0"}`} />
                            <span>{c.bpName}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{c.bpCode}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {/* Plant Location */}
            <div className="space-y-1.5">
              <Label>Project / Plant Location *</Label>
              <Input value={form.plantLocation} onChange={e => set("plantLocation")(e.target.value)}
                placeholder="Auto-filled from customer — edit if needed" data-testid="input-plant-location" />
            </div>
            {/* RRBO Grade */}
            <div className="space-y-1.5">
              <Label>RRBO Grade (SN 80 – SN 500) *</Label>
              <Select
                value={form.rrboGrade}
                onValueChange={(grade) => {
                  const r = RRBO_VISC_RANGES[grade];
                  setForm(f => ({
                    ...f,
                    rrboGrade: grade,
                    feedOilVisc40c: r ? String((r.min + r.max) / 2) : f.feedOilVisc40c,
                  }));
                }}
              >
                <SelectTrigger data-testid="select-rrbo-grade"><SelectValue placeholder="Select RRBO grade…" /></SelectTrigger>
                <SelectContent>
                  {RRBO_GRADES.map(g => (
                    <SelectItem key={g} value={g}>
                      {g} ({RRBO_VISC_RANGES[g].min}–{RRBO_VISC_RANGES[g].max} cSt @ 40°C)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Feed Viscosity */}
            <div className="space-y-1.5">
              <Label>Feed Oil Viscosity @ 40°C (cSt) *</Label>
              <Input type="number" min="0" step="any" value={form.feedOilVisc40c}
                onChange={e => set("feedOilVisc40c")(e.target.value)} data-testid="input-viscosity" />
              {form.rrboGrade && RRBO_VISC_RANGES[form.rrboGrade] && (
                <p className="text-xs text-muted-foreground" data-testid="text-viscosity-range">
                  Typical: {RRBO_VISC_RANGES[form.rrboGrade].min}–{RRBO_VISC_RANGES[form.rrboGrade].max} cSt
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 2 — Process Requirements & Colour ─────────────────────────── */}
      <Card className="bg-emerald-50 border-emerald-200">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Process Requirements &amp; Colour</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {/* CPS Capacity */}
            <div className="space-y-1.5">
              <Label>Required CPS Capacity (L/Day) *</Label>
              <Select value={form.cpsFeedCapacity} onValueChange={set("cpsFeedCapacity")}>
                <SelectTrigger data-testid="select-feed-capacity"><SelectValue placeholder="Select capacity…" /></SelectTrigger>
                <SelectContent>
                  {CPS_CAPACITY_OPTIONS.map(v => (
                    <SelectItem key={v} value={String(v)}>{v.toLocaleString("en-IN")} L/Day</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Required Treatment */}
            <div className="space-y-1.5">
              <Label>Required Treatment *</Label>
              <Select value={form.treatmentScope} onValueChange={changeScope}>
                <SelectTrigger data-testid="select-treatment-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Inlet Colour */}
            <div className="space-y-1.5">
              <Label>Inlet ASTM Colour *</Label>
              <Select value={form.inletColour} onValueChange={set("inletColour")}>
                <SelectTrigger data-testid="select-inlet-colour"><SelectValue placeholder="Select inlet colour…" /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 15 }, (_, i) => (i + 2) / 2).map(v => (
                    <SelectItem key={v} value={String(v)}>{v} ASTM</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Target Colour */}
            <div className="space-y-1.5">
              <Label>Expected Outlet ASTM Colour *</Label>
              <Select value={form.targetColour} onValueChange={set("targetColour")}>
                <SelectTrigger data-testid="select-target-colour"><SelectValue placeholder="Select outlet colour…" /></SelectTrigger>
                <SelectContent>
                  {[1, 1.5, 2, 2.5, 3].map(v => (
                    <SelectItem key={v} value={String(v)}>{v} ASTM</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 3 — Sulphur Targets (conditional) ────────────────────────── */}
      {isSulphurScope && (
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sulphur Targets</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label>Inlet Sulphur (ppm) *</Label>
                <Select value={form.inletSulphur} onValueChange={set("inletSulphur")}>
                  <SelectTrigger data-testid="select-inlet-sulphur"><SelectValue placeholder="Select inlet sulphur…" /></SelectTrigger>
                  <SelectContent>
                    {[1500, 1250, 1000, 750].map(v => (
                      <SelectItem key={v} value={String(v)}>{v} ppm</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Expected Outlet Sulphur (ppm) *</Label>
                <Select value={form.targetSulphur} onValueChange={set("targetSulphur")}>
                  <SelectTrigger data-testid="select-target-sulphur"><SelectValue placeholder="Select outlet sulphur…" /></SelectTrigger>
                  <SelectContent>
                    {[500, 200].map(v => (
                      <SelectItem key={v} value={String(v)}>{v} ppm</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} data-testid="button-cancel">Cancel</Button>
        )}
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save">
          {saveMutation.isPending ? "Saving…" : "Save Sizing Case"}
        </Button>
      </div>
    </div>
    </>
  );
}
