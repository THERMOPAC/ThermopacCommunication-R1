import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { OI_DEPARTMENTS } from "./oi-lesson-constants";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, AlertTriangle, Zap, ChevronsUpDown, Check } from "lucide-react";
import { Link } from "wouter";

export const ISSUE_CATEGORIES = [
  { value: "QC",      label: "Quality Control" },
  { value: "QA",      label: "Quality Assurance" },
  { value: "DWG",     label: "Design / Drawings" },
  { value: "PROC",    label: "Procurement" },
  { value: "MFG",     label: "Production / Manufacturing" },
  { value: "PROJECT", label: "Project Management" },
  { value: "MAINT",   label: "Maintenance" },
  { value: "STORE",   label: "Stores / Inventory" },
  { value: "SITE",    label: "Site" },
  { value: "COMM",    label: "Commissioning / Startup" },
  { value: "LOG",     label: "Logistics" },
  { value: "SALES",   label: "Sales / Proposal" },
  { value: "DOC",     label: "Documentation" },
  { value: "SAP",     label: "SAP / ERP" },
  { value: "COMP",    label: "Compliance" },
  { value: "SAFETY",  label: "Safety" },
  { value: "FIN",     label: "Finance" },
  { value: "LEGAL",   label: "Legal" },
  { value: "HR",      label: "HR" },
  { value: "CUST",    label: "Customer" },
  { value: "SYS",     label: "Systems / IT Infrastructure" },
  { value: "INT",     label: "Software / Integration" },
];

export const ISSUE_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  [...ISSUE_CATEGORIES, { value: "OTHER", label: "Other" }].map(c => [c.value, c.label])
);

const CATEGORIES = ISSUE_CATEGORIES;

export const PHASES = [
  { value: "SALES",  label: "SALES — Sales" },
  { value: "ENG",    label: "ENG — Engineering" },
  { value: "DVS",    label: "DVS — Design Verification" },
  { value: "PROC",   label: "PROC — Procurement" },
  { value: "MFG",    label: "MFG — Manufacturing" },
  { value: "QC",     label: "QC — Quality Control" },
  { value: "FAT",    label: "FAT — Factory Acceptance Test" },
  { value: "DISP",   label: "DISP — Dispatch" },
  { value: "LOG",    label: "LOG — Logistics" },
  { value: "SITE",   label: "SITE — Site" },
  { value: "ERECT",  label: "ERECT — Erection" },
  { value: "SAT",    label: "SAT — Site Acceptance Test" },
  { value: "COMM",   label: "COMM — Commissioning" },
  { value: "PERF",   label: "PERF — Performance" },
  { value: "WARR",   label: "WARR — Warranty" },
  { value: "AFTS",   label: "AFTS — After Sales" },
];

export const PHASE_LABEL: Record<string, string> = Object.fromEntries(
  PHASES.map(p => [p.value, p.label])
);

const SEVERITIES = [
  { value: "S1", label: "S1 — Critical (immediate escalation)", color: "text-red-600" },
  { value: "S2", label: "S2 — Major (72hr response)", color: "text-orange-600" },
  { value: "S3", label: "S3 — Moderate (1 week response)", color: "text-yellow-700" },
  { value: "S4", label: "S4 — Minor (1 month response)", color: "text-blue-600" },
];

// Categories for which vendor linkage is relevant
const VENDOR_RELEVANT_CATEGORIES = ["PROC", "MFG", "LOG"];

const captureSchema = z.object({
  title:              z.string().min(5, "Title must be at least 5 characters").max(500),
  description:        z.string().min(10, "Describe the issue in at least 10 characters"),
  department:         z.string().min(1, "Department is required"),
  category:           z.string().min(1, "Category is required"),
  projectPhase:       z.string().min(1, "Project phase is required"),
  severity:           z.string().min(1, "Severity is required"),
  projectId:          z.string().optional(),
  customerId:         z.string().optional(),
  vendorId:           z.string().optional(),
  equipmentFamily:    z.string().optional(),
  equipmentType:      z.string().optional(),
  criticalEquipmentFlag: z.boolean().optional(),
  criticalPathFlag:   z.boolean().optional(),
});

type CaptureForm = z.infer<typeof captureSchema>;

export default function OiIssueCaptureePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: projects } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { data: customers } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: vendors } = useQuery<any[]>({ queryKey: ["/api/vendors"] });

  const form = useForm<CaptureForm>({
    resolver: zodResolver(captureSchema),
    defaultValues: {
      title: "", description: "", department: "", category: "", projectPhase: "", severity: "",
      criticalEquipmentFlag: false, criticalPathFlag: false,
    },
  });

  const [titlePopoverOpen, setTitlePopoverOpen] = useState(false);

  const { data: titleMaster = [] } = useQuery<any[]>({ queryKey: ["/api/oi/issue-title-master"] });

  const selectedSeverity   = form.watch("severity");
  const selectedCategory   = form.watch("category");
  const selectedPhase      = form.watch("projectPhase");
  const selectedCustomerId = form.watch("customerId");

  // Filter suggestions: when a filter is selected only show matching (or uncategorised) titles;
  // when nothing is selected yet show everything.
  const suggestedTitles = titleMaster.filter((t: any) => {
    const catOk   = !selectedCategory || !t.category     || t.category     === selectedCategory;
    const phaseOk = !selectedPhase    || !t.projectPhase || t.projectPhase === selectedPhase;
    return catOk && phaseOk;
  });

  // Filter projects to only those belonging to the selected customer
  const filteredProjects = selectedCustomerId && selectedCustomerId !== "__none__"
    ? (projects ?? []).filter((p: any) =>
        String(p.customerId ?? p.customer_id) === selectedCustomerId
      )
    : (projects ?? []);

  // When customer changes, clear project selection
  const handleCustomerChange = (val: string) => {
    const resolved = val === "__none__" ? undefined : val;
    form.setValue("customerId", resolved);
    form.setValue("projectId", undefined);
  };

  const showVendorField = VENDOR_RELEVANT_CATEGORIES.includes(selectedCategory);

  const mutation = useMutation({
    mutationFn: async (data: CaptureForm) => {
      const toId = (v?: string) => (v && v !== "__none__") ? parseInt(v) : null;
      const payload: any = {
        ...data,
        projectId:  toId(data.projectId),
        customerId: toId(data.customerId),
        vendorId:   toId(data.vendorId),
      };
      return apiRequest("POST", "/api/oi/issues", payload);
    },
    onSuccess: async (res) => {
      const issue = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/oi/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/oi/dashboard/summary"] });
      toast({ title: "Issue captured", description: `${issue.issueNumber} created successfully.` });
      navigate(`/oi/issues/${issue.id}`);
    },
    onError: () => toast({ title: "Error", description: "Failed to capture issue.", variant: "destructive" }),
  });

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/oi/issues">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Report an Issue</h1>
            <p className="text-sm text-gray-500">Operational Intelligence — Issue Capture</p>
          </div>
        </div>

        {selectedSeverity === "S1" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-800 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <strong>S1 Critical:</strong>&nbsp;Immediate escalation to General Manager and Senior Management will be triggered on submission.
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700">Issue Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Issue Title <span className="text-red-500">*</span></FormLabel>
                    <div className="relative">
                      <Input
                        placeholder="Type or select an anticipated issue title…"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        onFocus={() => setTitlePopoverOpen(true)}
                        onBlur={() => setTimeout(() => setTitlePopoverOpen(false), 150)}
                        className="pr-8"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                        onMouseDown={(e) => { e.preventDefault(); setTitlePopoverOpen((v) => !v); }}
                      >
                        <ChevronsUpDown className="h-4 w-4" />
                      </button>
                      {titlePopoverOpen && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
                          {(() => {
                            const typed = (field.value ?? "").toLowerCase().trim();
                            const visible = suggestedTitles.filter((t: any) =>
                              !typed || t.title.toLowerCase().includes(typed)
                            );
                            if (visible.length === 0) return (
                              <div className="px-3 py-2 text-sm text-gray-400 italic">No matching suggestions — your typed title will be used.</div>
                            );
                            return (
                              <>
                                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b bg-gray-50">
                                  {selectedCategory || selectedPhase
                                    ? `Suggested for ${[selectedCategory, selectedPhase].filter(Boolean).join(" · ")}`
                                    : "All suggestions"}
                                </div>
                                {visible.map((t: any) => (
                                  <div
                                    key={t.id}
                                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-blue-50"
                                    onMouseDown={(e) => { e.preventDefault(); field.onChange(t.title); setTitlePopoverOpen(false); }}
                                  >
                                    <Check className={`h-3.5 w-3.5 shrink-0 ${field.value === t.title ? "text-blue-600" : "text-transparent"}`} />
                                    {t.title}
                                  </div>
                                ))}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description <span className="text-red-500">*</span></FormLabel>
                    <FormControl><Textarea placeholder="Detailed description — what happened, where, when, what was the impact?" rows={4} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="department" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department <span className="text-red-500">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {OI_DEPARTMENTS.map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="severity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Severity <span className="text-red-500">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select severity" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {SEVERITIES.map(s => (
                            <SelectItem key={s.value} value={s.value}>
                              <span className={s.color}>{s.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category <span className="text-red-500">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {CATEGORIES.map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="projectPhase" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Phase <span className="text-red-500">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select phase" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {PHASES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Customer → Project linkage */}
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="customerId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer (optional)</FormLabel>
                      <Select onValueChange={handleCustomerChange} value={field.value ?? "__none__"}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">— No customer —</SelectItem>
                          {(customers ?? []).map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {(c.sapCardCode ?? c.sap_card_code) ? `${c.sapCardCode ?? c.sap_card_code} — ` : ""}{c.bpName ?? c.bp_name ?? c.name ?? ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="projectId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Related Project (optional)</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)}
                        value={field.value ?? "__none__"}
                        disabled={!selectedCustomerId || selectedCustomerId === "__none__"}
                      >
                        <FormControl><SelectTrigger><SelectValue placeholder={selectedCustomerId ? "Select project" : "Select a customer first"} /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">— No project —</SelectItem>
                          {filteredProjects.map((p: any) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.code} — {p.customerName ?? p.customer_name ?? ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Vendor linkage — shown only for relevant categories */}
                {showVendorField && (
                  <FormField control={form.control} name="vendorId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Related Vendor (optional)</FormLabel>
                      <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">— No vendor —</SelectItem>
                          {(vendors ?? []).map((v: any) => (
                            <SelectItem key={v.id} value={String(v.id)}>
                              {v.sapCardCode ? `${v.sapCardCode} — ` : ""}{v.displayName ?? v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700">Equipment Context (optional)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="equipmentFamily" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Family</FormLabel>
                      <FormControl><Input placeholder="e.g. Heat Exchanger, Pump Package" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="equipmentType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Type</FormLabel>
                      <FormControl><Input placeholder="e.g. Shell & Tube, Centrifugal" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <div className="flex gap-6">
                  <FormField control={form.control} name="criticalEquipmentFlag" render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <FormLabel className="m-0 cursor-pointer">Critical Equipment</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="criticalPathFlag" render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <FormLabel className="m-0 cursor-pointer">Critical Path Item</FormLabel>
                    </FormItem>
                  )} />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Link href="/oi/issues">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" disabled={mutation.isPending} className="gap-2">
                {mutation.isPending ? "Submitting..." : <><Zap className="h-4 w-4" /> Submit Issue</>}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
