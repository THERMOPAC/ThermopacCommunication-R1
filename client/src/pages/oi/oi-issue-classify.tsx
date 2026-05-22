import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, CheckCircle, Link2, BarChart2, DollarSign, Scale, Search } from "lucide-react";

const CRITICALITY_LEVELS = ["none","low","medium","high","critical"];
const PROBABILITY_LEVELS  = ["very_low","low","medium","high","very_high"];
const IMPACT_LEVELS       = ["negligible","minor","moderate","major","catastrophic"];
const LIABILITY_TYPES     = ["warranty","indemnity","third_party","regulatory","internal","none"];
const DIMENSION_FIELDS = [
  { key: "technicalScore",   label: "Technical" },
  { key: "qualityScore",     label: "Quality" },
  { key: "safetyScore",      label: "Safety" },
  { key: "financialScore",   label: "Financial" },
  { key: "complianceScore",  label: "Compliance" },
  { key: "scheduleScore",    label: "Schedule" },
  { key: "liabilityScore",   label: "Liability" },
  { key: "customerScore",    label: "Customer" },
  { key: "operationalScore", label: "Operational" },
];

const SM_ROLES      = ["Senior Manager", "General Manager", "Superuser"];
const MANAGER_ROLES = ["Manager", "Senior Manager", "General Manager", "Superuser"];

const classifySchema = z.object({
  // Assignment
  assignedTo:           z.string().optional(),
  riskOwner:            z.string().optional(),
  escalationOwner:      z.string().optional(),
  // Risk assessment
  probabilityLevel:     z.string().optional(),
  impactLevel:          z.string().optional(),
  recurrenceRisk:       z.string().optional(),
  estimatedLossAmount:  z.string().optional(),
  // Criticality
  businessCriticality:  z.string().optional(),
  safetyCriticality:    z.string().optional(),
  financialCriticality: z.string().optional(),
  statutoryCriticality: z.string().optional(),
  // Phase 1B: EPC linkage
  customerId:             z.string().optional(),
  vendorId:               z.string().optional(),
  epcDrawingControlId:    z.string().optional(),
  epcPoId:                z.string().optional(),
  epcWoId:                z.string().optional(),
  inspectionOrderId:      z.string().optional(),
  fatInspectionOrderId:   z.string().optional(),
  satInspectionOrderId:   z.string().optional(),
  contractId:             z.string().optional(),
  fatReference:           z.string().optional(),
  satReference:           z.string().optional(),
  // Phase 1B: Dimension scores (0-10)
  technicalScore:   z.string().optional(),
  qualityScore:     z.string().optional(),
  safetyScore:      z.string().optional(),
  financialScore:   z.string().optional(),
  complianceScore:  z.string().optional(),
  scheduleScore:    z.string().optional(),
  liabilityScore:   z.string().optional(),
  customerScore:    z.string().optional(),
  operationalScore: z.string().optional(),
  // Phase 1B: Financial (SM+)
  actualLossAmount:       z.string().optional(),
  insuranceClaimFlag:     z.boolean().optional(),
  claimReference:         z.string().optional(),
  recoveryAmount:         z.string().optional(),
  // Phase 1B: Liability (SM+)
  liabilityType:          z.string().optional(),
  indemnityRequired:      z.boolean().optional(),
  warrantyClaimFlag:      z.boolean().optional(),
  warrantyClaimReference: z.string().optional(),
});

type ClassifyForm = z.infer<typeof classifySchema>;

export default function OiIssueClassifyPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const issueId = params.id;

  const isManager = MANAGER_ROLES.includes(user?.role ?? "");
  const isSM      = SM_ROLES.includes(user?.role ?? "");

  const { data: issue } = useQuery<any>({
    queryKey: ["/api/oi/issues", issueId],
    queryFn: async () => {
      const res = await fetch(`/api/oi/issues/${issueId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!issueId,
  });

  const { data: users } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { data: customers } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: vendors } = useQuery<any[]>({ queryKey: ["/api/vendors"] });
  const { data: contracts } = useQuery<any[]>({ queryKey: ["/api/legal/contracts"] });

  // Project-scoped lookup queries
  const projectId = issue?.projectId;
  const { data: drawings } = useQuery<any[]>({
    queryKey: ["/api/oi/lookup/drawings", projectId],
    queryFn: async () => {
      const p = projectId ? `?projectId=${projectId}` : "";
      const res = await fetch(`/api/oi/lookup/drawings${p}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isManager,
  });
  const { data: epcPos } = useQuery<any[]>({
    queryKey: ["/api/oi/lookup/epc-pos", projectId],
    queryFn: async () => {
      const p = projectId ? `?projectId=${projectId}` : "";
      const res = await fetch(`/api/oi/lookup/epc-pos${p}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isManager,
  });
  const { data: epcWos } = useQuery<any[]>({
    queryKey: ["/api/oi/lookup/epc-wos", projectId],
    queryFn: async () => {
      const p = projectId ? `?projectId=${projectId}` : "";
      const res = await fetch(`/api/oi/lookup/epc-wos${p}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isManager,
  });
  const { data: inspectionOrders } = useQuery<any[]>({
    queryKey: ["/api/oi/lookup/inspection-orders", projectId],
    queryFn: async () => {
      const p = projectId ? `?projectId=${projectId}` : "";
      const res = await fetch(`/api/oi/lookup/inspection-orders${p}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isManager,
  });

  const form = useForm<ClassifyForm>({
    resolver: zodResolver(classifySchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (issue) {
      form.reset({
        assignedTo:           issue.assignedTo  ? String(issue.assignedTo)  : "",
        riskOwner:            issue.riskOwner   ? String(issue.riskOwner)   : "",
        escalationOwner:      issue.escalationOwner ? String(issue.escalationOwner) : "",
        probabilityLevel:     issue.probabilityLevel  ?? "",
        impactLevel:          issue.impactLevel        ?? "",
        recurrenceRisk:       issue.recurrenceRisk     ?? "",
        estimatedLossAmount:  issue.estimatedLossAmount ?? "",
        businessCriticality:  issue.businessCriticality  ?? "",
        safetyCriticality:    issue.safetyCriticality    ?? "",
        financialCriticality: issue.financialCriticality ?? "",
        statutoryCriticality: issue.statutoryCriticality ?? "",
        // Phase 1B linkage
        customerId:           issue.customerId           ? String(issue.customerId)           : "",
        vendorId:             issue.vendorId             ? String(issue.vendorId)             : "",
        epcDrawingControlId:  issue.epcDrawingControlId  ? String(issue.epcDrawingControlId)  : "",
        epcPoId:              issue.epcPoId              ? String(issue.epcPoId)              : "",
        epcWoId:              issue.epcWoId              ? String(issue.epcWoId)              : "",
        inspectionOrderId:    issue.inspectionOrderId    ? String(issue.inspectionOrderId)    : "",
        fatInspectionOrderId: issue.fatInspectionOrderId ? String(issue.fatInspectionOrderId) : "",
        satInspectionOrderId: issue.satInspectionOrderId ? String(issue.satInspectionOrderId) : "",
        contractId:           issue.contractId           ? String(issue.contractId)           : "",
        fatReference:         issue.fatReference  ?? "",
        satReference:         issue.satReference  ?? "",
        // Phase 1B dimension scores
        technicalScore:   issue.technicalScore   != null ? String(issue.technicalScore)   : "",
        qualityScore:     issue.qualityScore     != null ? String(issue.qualityScore)     : "",
        safetyScore:      issue.safetyScore      != null ? String(issue.safetyScore)      : "",
        financialScore:   issue.financialScore   != null ? String(issue.financialScore)   : "",
        complianceScore:  issue.complianceScore  != null ? String(issue.complianceScore)  : "",
        scheduleScore:    issue.scheduleScore    != null ? String(issue.scheduleScore)    : "",
        liabilityScore:   issue.liabilityScore   != null ? String(issue.liabilityScore)   : "",
        customerScore:    issue.customerScore    != null ? String(issue.customerScore)    : "",
        operationalScore: issue.operationalScore != null ? String(issue.operationalScore) : "",
        // Phase 1B financial (SM+)
        actualLossAmount:       issue.actualLossAmount       ?? "",
        insuranceClaimFlag:     issue.insuranceClaimFlag     ?? false,
        claimReference:         issue.claimReference         ?? "",
        recoveryAmount:         issue.recoveryAmount         ?? "",
        liabilityType:          issue.liabilityType          ?? "",
        indemnityRequired:      issue.indemnityRequired      ?? false,
        warrantyClaimFlag:      issue.warrantyClaimFlag      ?? false,
        warrantyClaimReference: issue.warrantyClaimReference ?? "",
      });
    }
  }, [issue]);

  const patchMutation = useMutation({
    mutationFn: async (data: ClassifyForm) => {
      const payload: any = {};
      const ok = (v?: string) => !!v && v !== "__none__";
      const toId = (v?: string) => ok(v) ? parseInt(v!) : null;
      // Assignment
      if (ok(data.assignedTo))      payload.assignedTo      = parseInt(data.assignedTo!);
      if (ok(data.riskOwner))       payload.riskOwner       = parseInt(data.riskOwner!);
      if (ok(data.escalationOwner)) payload.escalationOwner = parseInt(data.escalationOwner!);
      // Risk
      if (ok(data.probabilityLevel))    payload.probabilityLevel    = data.probabilityLevel;
      if (ok(data.impactLevel))         payload.impactLevel         = data.impactLevel;
      if (ok(data.recurrenceRisk))      payload.recurrenceRisk      = data.recurrenceRisk;
      if (data.estimatedLossAmount)     payload.estimatedLossAmount = data.estimatedLossAmount;
      // Criticality
      if (ok(data.businessCriticality))  payload.businessCriticality  = data.businessCriticality;
      if (ok(data.safetyCriticality))    payload.safetyCriticality    = data.safetyCriticality;
      if (ok(data.financialCriticality)) payload.financialCriticality = data.financialCriticality;
      if (ok(data.statutoryCriticality)) payload.statutoryCriticality = data.statutoryCriticality;
      // Phase 1B EPC linkage (Manager+)
      if (isManager) {
        if (data.customerId !== undefined)           payload.customerId          = toId(data.customerId);
        if (data.vendorId !== undefined)             payload.vendorId            = toId(data.vendorId);
        if (data.epcDrawingControlId !== undefined)  payload.epcDrawingControlId = toId(data.epcDrawingControlId);
        if (data.epcPoId !== undefined)              payload.epcPoId             = toId(data.epcPoId);
        if (data.epcWoId !== undefined)              payload.epcWoId             = toId(data.epcWoId);
        if (data.inspectionOrderId !== undefined)    payload.inspectionOrderId   = toId(data.inspectionOrderId);
        if (data.fatInspectionOrderId !== undefined) payload.fatInspectionOrderId = toId(data.fatInspectionOrderId);
        if (data.satInspectionOrderId !== undefined) payload.satInspectionOrderId = toId(data.satInspectionOrderId);
        if (data.contractId !== undefined)           payload.contractId          = toId(data.contractId);
        if (data.fatReference)         payload.fatReference        = data.fatReference;
        if (data.satReference)         payload.satReference        = data.satReference;
        // Dimension scores
        for (const { key } of DIMENSION_FIELDS) {
          const val = (data as any)[key];
          if (val != null && val !== "" && val !== "__none__") payload[key] = parseInt(val);
        }
      }
      // Phase 1B financial / liability (SM+)
      if (isSM) {
        if (data.actualLossAmount)       payload.actualLossAmount       = data.actualLossAmount || null;
        payload.insuranceClaimFlag = data.insuranceClaimFlag ?? false;
        if (data.claimReference)         payload.claimReference         = data.claimReference || null;
        if (data.recoveryAmount)         payload.recoveryAmount         = data.recoveryAmount || null;
        if (ok(data.liabilityType))      payload.liabilityType          = data.liabilityType || null;
        payload.indemnityRequired  = data.indemnityRequired  ?? false;
        payload.warrantyClaimFlag  = data.warrantyClaimFlag  ?? false;
        if (data.warrantyClaimReference) payload.warrantyClaimReference = data.warrantyClaimReference || null;
      }
      return apiRequest("PATCH", `/api/oi/issues/${issueId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oi/issues", issueId] });
    },
  });

  const classifyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/oi/issues/${issueId}/transition`, { to: "classified" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oi/issues", issueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/oi/dashboard/summary"] });
      toast({ title: "Issue classified", description: "Issue classified — SLA timers started." });
      navigate(`/oi/issues/${issueId}`);
    },
    onError: async (err: any) => {
      const body = err?.response ? await err.response.json().catch(() => ({})) : {};
      toast({ title: "Error", description: body?.error ?? "Failed to classify issue.", variant: "destructive" });
    },
  });

  const handleSaveAndClassify = async (data: ClassifyForm) => {
    await patchMutation.mutateAsync(data);
    await classifyMutation.mutateAsync();
  };

  const userOptions = (users ?? []).filter((u: any) => u.isActive !== false);

  const SCORE_OPTIONS = Array.from({ length: 11 }, (_, i) => String(i));

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Link href={`/oi/issues/${issueId}`}>
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Classify Issue</h1>
            <p className="text-sm text-gray-500">{issue?.issueNumber} — {issue?.title}</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSaveAndClassify)} className="space-y-4">
            {/* Assignment */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700">Assignment</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4">
                {[
                  { name: "assignedTo",      label: "Assigned To (Investigator)" },
                  { name: "riskOwner",       label: "Risk Owner" },
                  { name: "escalationOwner", label: "Escalation Owner" },
                ].map(({ name, label }) => (
                  <FormField key={name} control={form.control} name={name as keyof ClassifyForm} render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <Select onValueChange={(v) => (field.onChange as any)(v === "__none__" ? undefined : v)} value={field.value as string ?? "__none__"}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">— None —</SelectItem>
                          {userOptions.map((u: any) => (
                            <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                ))}
              </CardContent>
            </Card>

            {/* Risk Assessment */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700">Risk Assessment</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <FormField control={form.control} name="probabilityLevel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Probability</FormLabel>
                    <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select probability" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">— Not assessed —</SelectItem>
                        {PROBABILITY_LEVELS.map(p => <SelectItem key={p} value={p}>{p.replace(/_/g," ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="impactLevel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Impact</FormLabel>
                    <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select impact" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">— Not assessed —</SelectItem>
                        {IMPACT_LEVELS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="recurrenceRisk" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recurrence Risk</FormLabel>
                    <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select risk level" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">— None —</SelectItem>
                        {["low","medium","high"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="estimatedLossAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estimated Loss Amount (INR)</FormLabel>
                    <FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl>
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Criticality */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-gray-700">Criticality Dimensions</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-4 gap-4">
                {[
                  { name: "businessCriticality",  label: "Business" },
                  { name: "safetyCriticality",    label: "Safety" },
                  { name: "financialCriticality", label: "Financial" },
                  { name: "statutoryCriticality", label: "Statutory" },
                ].map(({ name, label }) => (
                  <FormField key={name} control={form.control} name={name as keyof ClassifyForm} render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <Select onValueChange={(v) => (field.onChange as any)(v === "__none__" ? undefined : v)} value={field.value as string ?? "__none__"}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Level" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">— None —</SelectItem>
                          {CRITICALITY_LEVELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                ))}
              </CardContent>
            </Card>

            {/* Phase 1B: EPC Reference Linkage (Manager+) */}
            {isManager && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-teal-600" /> EPC Reference Linkage
                    {issue?.projectId && <span className="text-xs font-normal text-gray-400">(filtered to project {issue.projectCode ?? issue.projectId})</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    {/* Customer override */}
                    <FormField control={form.control} name="customerId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {(customers ?? []).map((c: any) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.sapCardCode ? `${c.sapCardCode} — ` : ""}{c.name ?? c.bp_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    {/* Vendor */}
                    <FormField control={form.control} name="vendorId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendor</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {(vendors ?? []).map((v: any) => (
                              <SelectItem key={v.id} value={String(v.id)}>
                                {v.sapCardCode ? `${v.sapCardCode} — ` : ""}{v.displayName ?? v.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    {/* Contract */}
                    <FormField control={form.control} name="contractId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contract</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {(contracts ?? []).map((c: any) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.contractNumber} — {c.title ?? ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    {/* Drawing */}
                    <FormField control={form.control} name="epcDrawingControlId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Drawing</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select drawing" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {(drawings ?? []).map((d: any) => (
                              <SelectItem key={d.id} value={String(d.id)}>
                                {d.drawingNumber}{d.drawingRevision ? ` Rev.${d.drawingRevision}` : ""}
                                {d.drawingTitle ? ` — ${d.drawingTitle}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    {/* PO */}
                    <FormField control={form.control} name="epcPoId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purchase Order</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select PO" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {(epcPos ?? []).map((p: any) => (
                              <SelectItem key={p.id} value={String(p.id)}>{p.poNumber}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    {/* WO */}
                    <FormField control={form.control} name="epcWoId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Work Order</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select WO" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {(epcWos ?? []).map((w: any) => (
                              <SelectItem key={w.id} value={String(w.id)}>{w.woNumber}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    {/* IO */}
                    <FormField control={form.control} name="inspectionOrderId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inspection Order</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select IO" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {(inspectionOrders ?? []).map((io: any) => (
                              <SelectItem key={io.id} value={String(io.id)}>
                                {io.inspectionOrderNumber}{io.title ? ` — ${io.title}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    {/* FAT IO */}
                    <FormField control={form.control} name="fatInspectionOrderId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>FAT Inspection Order</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select FAT IO" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {(inspectionOrders ?? []).map((io: any) => (
                              <SelectItem key={io.id} value={String(io.id)}>
                                {io.inspectionOrderNumber}{io.title ? ` — ${io.title}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    {/* SAT IO */}
                    <FormField control={form.control} name="satInspectionOrderId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>SAT Inspection Order</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select SAT IO" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {(inspectionOrders ?? []).map((io: any) => (
                              <SelectItem key={io.id} value={String(io.id)}>
                                {io.inspectionOrderNumber}{io.title ? ` — ${io.title}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="fatReference" render={({ field }) => (
                      <FormItem>
                        <FormLabel>FAT Reference (text)</FormLabel>
                        <FormControl><Input placeholder="e.g. FAT-001" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="satReference" render={({ field }) => (
                      <FormItem>
                        <FormLabel>SAT Reference (text)</FormLabel>
                        <FormControl><Input placeholder="e.g. SAT-001" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Phase 1B: Dimension Scores (Manager+) */}
            {isManager && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-indigo-500" /> Risk Dimension Scores (0–10)
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 md:grid-cols-9 gap-3">
                  {DIMENSION_FIELDS.map(({ key, label }) => (
                    <FormField key={key} control={form.control} name={key as keyof ClassifyForm} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{label}</FormLabel>
                        <Select onValueChange={(v) => (field.onChange as any)(v === "__none__" ? undefined : v)} value={field.value as string ?? "__none__"}>
                          <FormControl><SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {SCORE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Phase 1B: Financial Exposure (SM+) */}
            {isSM && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-orange-500" /> Financial Exposure
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="actualLossAmount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Actual Loss Amount (INR)</FormLabel>
                        <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="recoveryAmount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recovery Amount (INR)</FormLabel>
                        <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="flex gap-6">
                    <FormField control={form.control} name="insuranceClaimFlag" render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl><Checkbox checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="m-0 cursor-pointer">Insurance Claim Filed</FormLabel>
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="claimReference" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Insurance Claim Reference</FormLabel>
                      <FormControl><Input placeholder="Claim ref. number" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </CardContent>
              </Card>
            )}

            {/* Phase 1B: Liability (SM+) */}
            {isSM && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Scale className="h-4 w-4 text-purple-500" /> Liability
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="liabilityType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Liability Type</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {LIABILITY_TYPES.map(l => <SelectItem key={l} value={l}>{l.replace(/_/g," ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="warrantyClaimReference" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Warranty Claim Reference</FormLabel>
                        <FormControl><Input placeholder="WC-XXXX" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="flex gap-6">
                    <FormField control={form.control} name="indemnityRequired" render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl><Checkbox checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="m-0 cursor-pointer">Indemnity Required</FormLabel>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="warrantyClaimFlag" render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl><Checkbox checked={!!field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="m-0 cursor-pointer">Warranty Claim Filed</FormLabel>
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-3">
              <Link href={`/oi/issues/${issueId}`}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button
                type="button"
                variant="outline"
                disabled={patchMutation.isPending}
                onClick={async () => {
                  const data = form.getValues();
                  await patchMutation.mutateAsync(data);
                  toast({ title: "Saved", description: "Classification data saved (issue not yet classified)." });
                }}
              >
                {patchMutation.isPending ? "Saving..." : "Save Draft"}
              </Button>
              <Button type="submit" disabled={patchMutation.isPending || classifyMutation.isPending} className="gap-2">
                <CheckCircle className="h-4 w-4" />
                {(patchMutation.isPending || classifyMutation.isPending) ? "Saving..." : "Save & Classify"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
