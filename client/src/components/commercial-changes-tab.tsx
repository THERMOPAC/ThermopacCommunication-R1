import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Plus, FileText, CheckCircle, XCircle, Clock, ArrowUpRight, ArrowDownRight, AlertTriangle, GitBranch, Star, ArrowRight } from "lucide-react";

interface CommercialChangesTabProps {
  projectId: number;
}

const CHANGE_TYPES = [
  { value: "scope_addition", label: "Scope Addition" },
  { value: "scope_reduction", label: "Scope Reduction" },
  { value: "price_revision", label: "Price Revision" },
  { value: "specification_change", label: "Specification Change" },
  { value: "schedule_change", label: "Schedule Change" },
];

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  submitted: { label: "Submitted", variant: "outline" },
  under_review: { label: "Under Review", variant: "default" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatChangeType(type: string): string {
  return CHANGE_TYPES.find(t => t.value === type)?.label || type;
}

export default function CommercialChangesTab({ projectId }: CommercialChangesTabProps) {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCco, setSelectedCco] = useState<any>(null);

  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/sales-marketing/change-orders/project", projectId, "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/sales-marketing/change-orders/project/${projectId}/summary`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const { data: ccos, isLoading: ccosLoading } = useQuery<any[]>({
    queryKey: ["/api/sales-marketing/change-orders", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/sales-marketing/change-orders?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/sales-marketing/change-orders", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-marketing/change-orders", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-marketing/change-orders/project", projectId, "summary"] });
      setShowCreateDialog(false);
      toast({ title: "Change order created" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/sales-marketing/change-orders/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-marketing/change-orders", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-marketing/change-orders/project", projectId, "summary"] });
      setSelectedCco(null);
      toast({ title: "Change order updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isLoading = summaryLoading || ccosLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-pulse text-sm text-muted-foreground">Loading commercial data...</div>
        </CardContent>
      </Card>
    );
  }

  const hasOpenCco = ccos?.some((c: any) => !["approved", "rejected"].includes(c.status));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-blue-50"><FileText className="h-3.5 w-3.5 text-blue-600" /></div>
              <div>
                <div className="text-[10px] text-muted-foreground">Original Order Value</div>
                <div className="text-sm font-bold">{formatCurrency(summary?.originalOrderValue || 0)}</div>
                <div className="text-[9px] text-muted-foreground">{summary?.originalOrderNumber || "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded ${(summary?.totalApprovedDelta || 0) >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                {(summary?.totalApprovedDelta || 0) >= 0
                  ? <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />
                  : <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />}
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Approved Variations</div>
                <div className="text-sm font-bold">{formatCurrency(summary?.totalApprovedDelta || 0)}</div>
                <div className="text-[9px] text-muted-foreground">{summary?.approvedChanges?.length || 0} change order(s)</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded bg-purple-50"><DollarSign className="h-3.5 w-3.5 text-purple-600" /></div>
              <div>
                <div className="text-[10px] text-muted-foreground">Current Revised Value</div>
                <div className="text-sm font-bold">{formatCurrency(summary?.currentRevisedValue || 0)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded ${summary?.governingReferenceType === "original_baseline" ? "bg-blue-50" : "bg-amber-50"}`}>
                {summary?.governingReferenceType === "original_baseline"
                  ? <CheckCircle className="h-3.5 w-3.5 text-blue-600" />
                  : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Governing Reference</div>
                <div className="text-sm font-bold truncate max-w-[140px]">{summary?.governingReference || "—"}</div>
                <div className="text-[9px] text-muted-foreground">
                  {summary?.governingReferenceType === "original_baseline" ? "Original Baseline" : "Change Order"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {summary?.chainTimeline && summary.chainTimeline.length > 0 && (
        <ChainTimeline nodes={summary.chainTimeline} />
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Change Orders</h3>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowCreateDialog(true)}
          disabled={hasOpenCco}
        >
          <Plus className="h-3 w-3 mr-1" />
          New Change Order
        </Button>
      </div>

      {hasOpenCco && (
        <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          A change order is currently open. Complete or reject it before creating a new one.
        </div>
      )}

      {(!ccos || ccos.length === 0) ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No commercial change orders yet. The original baseline is governing.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">CO Number</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs text-right">Change Value</TableHead>
                  <TableHead className="text-xs">Revised Offer</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ccos.map((cco: any) => {
                  const badge = STATUS_BADGES[cco.status] || { label: cco.status, variant: "secondary" as const };
                  const val = parseFloat(cco.change_value || "0");
                  return (
                    <TableRow key={cco.id}>
                      <TableCell className="text-xs font-mono">{cco.change_order_number}</TableCell>
                      <TableCell className="text-xs">{formatChangeType(cco.change_type)}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{cco.description}</TableCell>
                      <TableCell className={`text-xs text-right font-mono ${val >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {val >= 0 ? "+" : ""}{formatCurrency(val)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {cco.revised_offer_number ? (
                          <span className="font-mono text-[10px]">{cco.revised_offer_number}</span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">Not linked</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant} className="text-[9px] px-1.5 py-0">
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!["approved", "rejected"].includes(cco.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => setSelectedCco(cco)}
                          >
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CreateCcoDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSubmit={(data: any) => createMutation.mutate({ ...data, projectId })}
        isPending={createMutation.isPending}
      />

      {selectedCco && (
        <EditCcoDialog
          cco={selectedCco}
          open={!!selectedCco}
          onClose={() => setSelectedCco(null)}
          onSubmit={(data: any) => updateMutation.mutate({ id: selectedCco.id, ...data })}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateCcoDialog({ open, onClose, onSubmit, isPending }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [changeType, setChangeType] = useState("");
  const [description, setDescription] = useState("");
  const [changeValue, setChangeValue] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    if (!changeType || !description || !changeValue) return;
    onSubmit({ changeType, description, changeValue: parseFloat(changeValue), notes: notes || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Commercial Change Order</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Change Type</label>
            <Select value={changeType} onValueChange={setChangeType}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {CHANGE_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Description</label>
            <Textarea
              className="text-xs mt-1"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What changed and why..."
            />
          </div>
          <div>
            <label className="text-xs font-medium">Change Value (INR)</label>
            <Input
              type="number"
              className="h-8 text-xs mt-1"
              value={changeValue}
              onChange={e => setChangeValue(e.target.value)}
              placeholder="Positive for addition, negative for reduction"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Notes (optional)</label>
            <Textarea
              className="text-xs mt-1"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={isPending || !changeType || !description || !changeValue}>
            {isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ChainTimelineNode {
  offerId: number;
  offerNumber: string;
  totalAmount: number;
  status: string;
  role: string;
  isGoverning: boolean;
  ccoNumber: string | null;
  ccoSequence: number | null;
  changeType?: string;
  changeTypeLabel?: string;
  changeValue?: number;
  approvedAt?: string;
}

function ChainTimeline(props: { nodes: ChainTimelineNode[] }) {
  const { nodes } = props;
  if (!nodes || nodes.length === 0) return null;

  return (
    <Card>
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          Commercial Chain
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
          {nodes.map((node, idx) => {
            const isLast = idx === nodes.length - 1;
            return (
              <div key={node.offerId || idx} className="flex items-center">
                <div
                  className={`
                    relative rounded border px-3 py-2 min-w-[140px] max-w-[180px]
                    ${node.isGoverning
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card"
                    }
                  `}
                >
                  {node.isGoverning && (
                    <div className="absolute -top-2 right-2">
                      <Badge variant="default" className="text-[8px] px-1 py-0 h-4 leading-none">
                        <Star className="h-2 w-2 mr-0.5" />
                        Governing
                      </Badge>
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground mb-0.5">
                    {node.role === "root" ? "Baseline" : `CO${String(node.ccoSequence).padStart(2, "0")}`}
                  </div>
                  <div className="text-xs font-mono font-semibold truncate">
                    {node.offerNumber || "—"}
                  </div>
                  <div className="text-[10px] font-medium mt-0.5">
                    {formatCurrency(node.totalAmount)}
                  </div>
                  {node.changeTypeLabel && (
                    <div className="text-[9px] text-muted-foreground mt-0.5 truncate">
                      {node.changeTypeLabel}
                      {node.changeValue !== undefined && (
                        <span className={node.changeValue >= 0 ? "text-green-600" : "text-red-600"}>
                          {" "}{node.changeValue >= 0 ? "+" : ""}{formatCurrency(node.changeValue)}
                        </span>
                      )}
                    </div>
                  )}
                  {node.ccoNumber && (
                    <div className="text-[8px] text-muted-foreground mt-1 font-mono">{node.ccoNumber}</div>
                  )}
                </div>
                {!isLast && (
                  <div className="flex items-center px-1">
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function EditCcoDialog({ cco, open, onClose, onSubmit, isPending }: {
  cco: any;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [status, setStatus] = useState(cco.status);
  const [revisedOfferId, setRevisedOfferId] = useState(cco.revised_offer_id?.toString() || "");
  const [ecrId, setEcrId] = useState(cco.ecr_id?.toString() || "");
  const [changeValue, setChangeValue] = useState(cco.change_value?.toString() || "");
  const [description, setDescription] = useState(cco.description || "");
  const [notes, setNotes] = useState(cco.notes || "");

  const validNextStatuses: Record<string, { value: string; label: string }[]> = {
    draft: [{ value: "draft", label: "Draft" }, { value: "submitted", label: "Submit" }],
    submitted: [{ value: "submitted", label: "Submitted" }, { value: "under_review", label: "Under Review" }, { value: "rejected", label: "Reject" }],
    under_review: [{ value: "under_review", label: "Under Review" }, { value: "approved", label: "Approve" }, { value: "rejected", label: "Reject" }],
  };

  const statusOptions = validNextStatuses[cco.status] || [];

  const handleSubmit = () => {
    const data: any = {};
    if (status !== cco.status) data.status = status;
    if (revisedOfferId && revisedOfferId !== (cco.revised_offer_id?.toString() || "")) {
      data.revisedOfferId = parseInt(revisedOfferId);
    }
    if (ecrId && ecrId !== (cco.ecr_id?.toString() || "")) {
      data.ecrId = parseInt(ecrId);
    }
    if (changeValue !== (cco.change_value?.toString() || "")) {
      data.changeValue = parseFloat(changeValue);
    }
    if (description !== cco.description) data.description = description;
    if (notes !== (cco.notes || "")) data.notes = notes;

    if (Object.keys(data).length === 0) {
      onClose();
      return;
    }
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {cco.change_order_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(s => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Revised Offer ID</label>
            <Input
              type="number"
              className="h-8 text-xs mt-1"
              value={revisedOfferId}
              onChange={e => setRevisedOfferId(e.target.value)}
              placeholder="Link to confirmed revised quotation"
            />
            <p className="text-[9px] text-muted-foreground mt-0.5">Required before approval. Must be a confirmed offer for the same customer.</p>
          </div>
          <div>
            <label className="text-xs font-medium">ECR ID (optional)</label>
            <Input
              type="number"
              className="h-8 text-xs mt-1"
              value={ecrId}
              onChange={e => setEcrId(e.target.value)}
              placeholder="Engineering Change Request ID (auto-created if empty)"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Change Value (INR)</label>
            <Input
              type="number"
              className="h-8 text-xs mt-1"
              value={changeValue}
              onChange={e => setChangeValue(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium">Description</label>
            <Textarea className="text-xs mt-1" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium">Notes</label>
            <Textarea className="text-xs mt-1" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {status === "approved" && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[10px] text-amber-800">
              Approval requires: confirmed revised quotation with a PDF artifact, same customer as original, and not already used by another CCO. An ECR will be auto-created if not provided.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending}
            variant={status === "rejected" ? "destructive" : "default"}
          >
            {isPending ? "Saving..." : status === "approved" ? "Approve" : status === "rejected" ? "Reject" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
