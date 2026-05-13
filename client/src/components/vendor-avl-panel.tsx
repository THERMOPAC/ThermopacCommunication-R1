import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { fmtDate } from "@/lib/date-format";
import { useToast } from "@/hooks/use-toast";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VendorAvlRecord {
  id: number; subgroupCode: string; subgroupLabel: string | null; status: string;
  qualifiedByName: string | null; qualifiedAt: string | null;
  validUntil: string | null; performanceScore: string | null;
  notes: string | null; conditions: string | null;
  annualReviewDue: string | null; lastReviewedByName: string | null;
  lastReviewedAt: string | null;
}

const addSchema = z.object({
  subgroupCode: z.string().min(1, "Subgroup code is required"),
  subgroupLabel: z.string().optional(),
  status: z.enum(["qualified", "conditionally_qualified", "not_qualified", "under_review"]),
  notes: z.string().optional(),
  conditions: z.string().optional(),
  validUntil: z.string().optional(),
  annualReviewDue: z.string().optional(),
});

const STATUS_BADGE: Record<string, string> = {
  qualified: "bg-green-100 text-green-800",
  conditionally_qualified: "bg-yellow-100 text-yellow-800",
  not_qualified: "bg-red-100 text-red-700",
  under_review: "bg-blue-100 text-blue-700",
};
const STATUS_ICON: Record<string, React.ElementType> = {
  qualified: CheckCircle2,
  conditionally_qualified: Clock,
  not_qualified: XCircle,
  under_review: Clock,
};

// ─── Component ───────────────────────────────────────────────────────────────

export function VendorAvlPanel({ vendorId }: { vendorId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: records = [], isLoading } = useQuery<VendorAvlRecord[]>({
    queryKey: ["/api/vendors", vendorId, "subgroup-qualifications"],
    queryFn: () => apiRequest("GET", `/api/vendors/${vendorId}/subgroup-qualifications`),
  });

  const form = useForm<z.infer<typeof addSchema>>({
    resolver: zodResolver(addSchema),
    defaultValues: { subgroupCode: "", subgroupLabel: "", status: "under_review", notes: "", conditions: "", validUntil: "", annualReviewDue: "" },
  });

  const addMutation = useMutation({
    mutationFn: async (data: z.infer<typeof addSchema>) => {
      const r = await apiRequest("POST", "/api/vendor-subgroup-qualification", { vendorId, ...data });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vendors", vendorId, "subgroup-qualifications"] });
      toast({ title: "AVL record added" });
      setShowAdd(false);
      form.reset();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatus = async (id: number, status: string) => {
    try {
      const r = await apiRequest("PATCH", `/api/vendor-subgroup-qualification/${id}`, { status });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Update failed"); }
      qc.invalidateQueries({ queryKey: ["/api/vendors", vendorId, "subgroup-qualifications"] });
      toast({ title: "Status updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">AVL Subgroup Qualifications</h3>
          <p className="text-xs text-muted-foreground">Controls which subgroups this vendor is approved to supply.</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">No qualification records yet.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">Subgroup</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Score</TableHead>
                <TableHead className="text-xs">Valid Until</TableHead>
                <TableHead className="text-xs">Review Due</TableHead>
                <TableHead className="text-xs">Qualified By</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((rec) => {
                const Icon = STATUS_ICON[rec.status] ?? Clock;
                return (
                  <TableRow key={rec.id}>
                    <TableCell className="text-xs">
                      <p className="font-medium">{rec.subgroupCode}</p>
                      {rec.subgroupLabel && <p className="text-muted-foreground">{rec.subgroupLabel}</p>}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[rec.status] ?? "bg-gray-100 text-gray-600"}`}>
                        <Icon className="h-3 w-3" />
                        {rec.status.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {rec.performanceScore ? `${parseFloat(rec.performanceScore).toFixed(1)}/100` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{rec.validUntil ? fmtDate(rec.validUntil) : "—"}</TableCell>
                    <TableCell className="text-xs">{rec.annualReviewDue ? fmtDate(rec.annualReviewDue) : "—"}</TableCell>
                    <TableCell className="text-xs">{rec.qualifiedByName ?? "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={rec.status}
                        onValueChange={(v) => updateStatus(rec.id, v)}
                      >
                        <SelectTrigger className="h-6 text-xs w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="qualified">Qualified</SelectItem>
                          <SelectItem value="conditionally_qualified">Conditional</SelectItem>
                          <SelectItem value="not_qualified">Not Qualified</SelectItem>
                          <SelectItem value="under_review">Under Review</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add dialog */}
      {showAdd && (
        <Dialog open onOpenChange={() => { setShowAdd(false); form.reset(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add AVL Qualification</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((d) => addMutation.mutate(d))} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="subgroupCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Subgroup Code *</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. VALVE" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="subgroupLabel" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Label</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. Industrial Valves" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Status *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="qualified">Qualified</SelectItem>
                        <SelectItem value="conditionally_qualified">Conditionally Qualified</SelectItem>
                        <SelectItem value="not_qualified">Not Qualified</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="validUntil" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Valid Until</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="annualReviewDue" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Annual Review Due</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Notes</FormLabel>
                    <FormControl><Textarea {...field} rows={2} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="conditions" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Conditions (for conditional qualification)</FormLabel>
                    <FormControl><Textarea {...field} rows={2} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button type="submit" disabled={addMutation.isPending}>
                    {addMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    Add Record
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
