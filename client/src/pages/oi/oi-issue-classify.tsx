import { useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, CheckCircle } from "lucide-react";

const CRITICALITY_LEVELS = ["none","low","medium","high","critical"];
const PROBABILITY_LEVELS  = ["very_low","low","medium","high","very_high"];
const IMPACT_LEVELS       = ["negligible","minor","moderate","major","catastrophic"];

const classifySchema = z.object({
  assignedTo:           z.string().optional(),
  riskOwner:            z.string().optional(),
  escalationOwner:      z.string().optional(),
  probabilityLevel:     z.string().optional(),
  impactLevel:          z.string().optional(),
  businessCriticality:  z.string().optional(),
  safetyCriticality:    z.string().optional(),
  financialCriticality: z.string().optional(),
  statutoryCriticality: z.string().optional(),
  recurrenceRisk:       z.string().optional(),
  estimatedLossAmount:  z.string().optional(),
  consequentialDamageFlag: z.boolean().optional(),
  legalReviewRequired:  z.boolean().optional(),
});

type ClassifyForm = z.infer<typeof classifySchema>;

export default function OiIssueClassifyPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const issueId = params.id;

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

  const form = useForm<ClassifyForm>({
    resolver: zodResolver(classifySchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (issue) {
      form.reset({
        assignedTo:           issue.assignedTo ? String(issue.assignedTo) : "",
        riskOwner:            issue.riskOwner ? String(issue.riskOwner) : "",
        escalationOwner:      issue.escalationOwner ? String(issue.escalationOwner) : "",
        probabilityLevel:     issue.probabilityLevel ?? "",
        impactLevel:          issue.impactLevel ?? "",
        businessCriticality:  issue.businessCriticality ?? "",
        safetyCriticality:    issue.safetyCriticality ?? "",
        financialCriticality: issue.financialCriticality ?? "",
        statutoryCriticality: issue.statutoryCriticality ?? "",
        recurrenceRisk:       issue.recurrenceRisk ?? "",
        estimatedLossAmount:  issue.estimatedLossAmount ?? "",
      });
    }
  }, [issue]);

  const patchMutation = useMutation({
    mutationFn: async (data: ClassifyForm) => {
      const payload: any = {};
      if (data.assignedTo)           payload.assignedTo = parseInt(data.assignedTo);
      if (data.riskOwner)            payload.riskOwner = parseInt(data.riskOwner);
      if (data.escalationOwner)      payload.escalationOwner = parseInt(data.escalationOwner);
      if (data.probabilityLevel)     payload.probabilityLevel = data.probabilityLevel;
      if (data.impactLevel)          payload.impactLevel = data.impactLevel;
      if (data.businessCriticality)  payload.businessCriticality = data.businessCriticality;
      if (data.safetyCriticality)    payload.safetyCriticality = data.safetyCriticality;
      if (data.financialCriticality) payload.financialCriticality = data.financialCriticality;
      if (data.statutoryCriticality) payload.statutoryCriticality = data.statutoryCriticality;
      if (data.recurrenceRisk)       payload.recurrenceRisk = data.recurrenceRisk;
      if (data.estimatedLossAmount)  payload.estimatedLossAmount = data.estimatedLossAmount;
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
      toast({ title: "Issue classified", description: "Issue has been classified and SLA timers started." });
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
                      <Select onValueChange={field.onChange as any} value={field.value as string ?? ""}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="">— None —</SelectItem>
                          {userOptions.map((u: any) => (
                            <SelectItem key={u.id} value={String(u.id)}>
                              {u.name} ({u.role})
                            </SelectItem>
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
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select probability" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="">— Not assessed —</SelectItem>
                        {PROBABILITY_LEVELS.map(p => <SelectItem key={p} value={p}>{p.replace(/_/g," ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="impactLevel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Impact</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select impact" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="">— Not assessed —</SelectItem>
                        {IMPACT_LEVELS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="recurrenceRisk" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recurrence Risk</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select risk level" /></SelectTrigger></FormControl>
                      <SelectContent>
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
                      <Select onValueChange={field.onChange as any} value={field.value as string ?? ""}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Level" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="">— None —</SelectItem>
                          {CRITICALITY_LEVELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Link href={`/oi/issues/${issueId}`}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
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
