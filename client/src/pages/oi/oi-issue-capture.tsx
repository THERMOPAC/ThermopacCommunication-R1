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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, AlertTriangle, Zap } from "lucide-react";
import { Link } from "wouter";

const CATEGORIES = [
  { value: "QC",     label: "Quality Control" },
  { value: "DWG",    label: "Drawing / Design" },
  { value: "PROC",   label: "Procurement" },
  { value: "MFG",    label: "Manufacturing" },
  { value: "SITE",   label: "Site" },
  { value: "COMM",   label: "Commissioning" },
  { value: "LOG",    label: "Logistics" },
  { value: "DOC",    label: "Documentation" },
  { value: "SAP",    label: "SAP / ERP" },
  { value: "COMP",   label: "Compliance" },
  { value: "SAFETY", label: "Safety" },
  { value: "FIN",    label: "Finance" },
  { value: "LEGAL",  label: "Legal" },
  { value: "HR",     label: "HR" },
  { value: "CUST",   label: "Customer" },
  { value: "SYS",    label: "Systems / IT" },
  { value: "INT",    label: "Integration" },
  { value: "OTHER",  label: "Other" },
];

const PHASES = [
  "SALES","ENG","DVS","PROC","MFG","QC","FAT","DISP","LOG","SITE","ERECT","SAT","COMM","PERF","WARR","AFTS"
];

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
      title: "", description: "", category: "", projectPhase: "", severity: "",
      criticalEquipmentFlag: false, criticalPathFlag: false,
    },
  });

  const selectedSeverity = form.watch("severity");
  const selectedCategory = form.watch("category");
  const selectedProjectId = form.watch("projectId");

  // Auto-populate customer when project is selected
  const handleProjectChange = (val: string) => {
    form.setValue("projectId", val);
    if (val) {
      const proj = (projects ?? []).find((p: any) => String(p.id) === val);
      if (proj && (proj.customerId || proj.customer_id)) {
        form.setValue("customerId", String(proj.customerId ?? proj.customer_id));
      }
    }
  };

  const showVendorField = VENDOR_RELEVANT_CATEGORIES.includes(selectedCategory);

  const mutation = useMutation({
    mutationFn: async (data: CaptureForm) => {
      const payload: any = {
        ...data,
        projectId:  data.projectId  ? parseInt(data.projectId)  : null,
        customerId: data.customerId ? parseInt(data.customerId) : null,
        vendorId:   data.vendorId   ? parseInt(data.vendorId)   : null,
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
                    <FormControl><Input placeholder="Brief, clear description of the issue" {...field} /></FormControl>
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
                          {PHASES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Project + Customer linkage */}
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="projectId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Related Project (optional)</FormLabel>
                      <Select onValueChange={handleProjectChange} value={field.value ?? ""}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="">— No project —</SelectItem>
                          {(projects ?? []).map((p: any) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.code} — {p.customerName ?? p.customer_name ?? ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="customerId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer (optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="">— No customer —</SelectItem>
                          {(customers ?? []).map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.sapCardCode ? `${c.sapCardCode} — ` : ""}{c.name ?? c.bp_name}
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
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="">— No vendor —</SelectItem>
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
