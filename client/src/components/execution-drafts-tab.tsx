import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2, XCircle, PauseCircle, Play, Zap,
  RefreshCw, FileText, AlertTriangle, Clock, Ban,
  Link2, RotateCcw, PackagePlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExecutionDraftsTabProps {
  projectId: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  pending_approval: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  on_hold: "bg-blue-100 text-blue-700 border-blue-200",
  not_applicable: "bg-slate-100 text-slate-500 border-slate-200",
  canceled: "bg-gray-100 text-gray-400 border-gray-200",
};

const ACTIVATION_COLORS: Record<string, string> = {
  not_activated: "bg-gray-50 text-gray-500",
  pending_activation: "bg-yellow-50 text-yellow-700",
  activated: "bg-emerald-50 text-emerald-700",
  activation_failed: "bg-red-50 text-red-700",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  DO: "Drawing Order",
  WO: "Work Order",
  PO: "Purchase Order",
  IO: "Inspection Order",
};

const DOC_TYPE_ICONS: Record<string, string> = {
  DO: "🔧",
  WO: "⚙️",
  PO: "📦",
  IO: "🔍",
};

export default function ExecutionDraftsTab({ projectId }: ExecutionDraftsTabProps) {
  const { toast } = useToast();
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; draftId: number | null }>({ open: false, draftId: null });
  const [holdDialog, setHoldDialog] = useState<{ open: boolean; draftId: number | null }>({ open: false, draftId: null });
  const [remarks, setRemarks] = useState("");

  const { data: drafts, isLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "execution-drafts"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/execution-drafts`),
  });

  const { data: summary } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "execution-drafts", "summary"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/execution-drafts/summary`),
  });

  const invalidateDrafts = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "execution-drafts"] });
  };

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/projects/${projectId}/execution-drafts/generate`),
    onSuccess: (data: any) => {
      if (data.itemsAdded === 0 && data.created === 0) {
        toast({ title: "EPC Workflow Up to Date", description: "No new items found in the product catalog. All existing items already have execution drafts." });
      } else if (data.itemsAdded > 0 && data.created === 0) {
        toast({ title: "Items Synced", description: `${data.itemsAdded} new item(s) added from the product catalog, but all already had drafts.` });
      } else {
        toast({ title: "EPC Workflow Updated", description: `${data.itemsAdded > 0 ? `${data.itemsAdded} item(s) synced from catalog. ` : ""}Generated drafts for ${data.created} item(s).` });
      }
      invalidateDrafts();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to generate drafts", variant: "destructive" });
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ draftId, action, body }: { draftId: number; action: string; body?: any }) =>
      apiRequest("POST", `/api/execution-drafts/${draftId}/${action}`, body),
    onSuccess: (data: any) => {
      toast({ title: "Success", description: data.message || "Action completed" });
      invalidateDrafts();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Action failed", variant: "destructive" });
    },
  });

  const handleReject = () => {
    if (!rejectDialog.draftId || !remarks.trim()) return;
    actionMutation.mutate({ draftId: rejectDialog.draftId, action: "reject", body: { remarks: remarks.trim() } });
    setRejectDialog({ open: false, draftId: null });
    setRemarks("");
  };

  const handleHold = () => {
    if (!holdDialog.draftId) return;
    actionMutation.mutate({ draftId: holdDialog.draftId, action: "hold", body: { remarks: remarks.trim() || undefined } });
    setHoldDialog({ open: false, draftId: null });
    setRemarks("");
  };

  const grouped = groupByItem(drafts || []);
  const hasDrafts = (drafts?.length || 0) > 0;

  const totalCount = summary?.total || 0;
  const approvedCount = drafts?.filter((d: any) => d.approval_status === "approved").length || 0;
  const pendingCount = drafts?.filter((d: any) => d.approval_status === "pending_approval").length || 0;
  const activatedCount = drafts?.filter((d: any) => d.activation_status === "activated").length || 0;
  const blockedCount = drafts?.filter((d: any) => d.dependency_status === "blocked").length || 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-pulse text-sm text-muted-foreground">Loading execution drafts...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">EPC Execution Workflow</h3>
          <p className="text-sm text-muted-foreground">
            {hasDrafts
              ? "DO / WO / PO / IO drafts for all project items. Use the button to pick up any newly added items."
              : "Auto-generate DO / WO / PO / IO drafts for all project items."}
          </p>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          variant={hasDrafts ? "outline" : "default"}
          size="sm"
        >
          {generateMutation.isPending ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : hasDrafts ? (
            <PackagePlus className="h-4 w-4 mr-2" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          {hasDrafts ? "Update EPC Workflow" : "Generate EPC Workflow"}
        </Button>
      </div>

      {hasDrafts && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MiniStat label="Total" value={totalCount} />
          <MiniStat label="Pending" value={pendingCount} color="amber" />
          <MiniStat label="Approved" value={approvedCount} color="green" />
          <MiniStat label="Activated" value={activatedCount} color="emerald" />
          <MiniStat label="Blocked" value={blockedCount} color="orange" />
        </div>
      )}

      {!hasDrafts ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No EPC workflow drafts yet. Click "Generate EPC Workflow" to auto-create DO / WO / PO / IO drafts for all project items.
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([itemKey, itemDrafts]) => {
          const first = itemDrafts[0];
          const itemLabel = first.item_code || "";
          const itemCodeMissing = !first.item_code;
          const itemDesc = first.item_description || first.master_item_description || "";
          const makeOrBuy = first.make_or_buy || "N/A";

          return (
            <Card key={itemKey} className="overflow-hidden">
              <CardHeader className="py-3 px-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">
                      {itemCodeMissing
                        ? <span className="text-amber-600 flex items-center gap-1">⚠ Project Item Code missing</span>
                        : itemLabel}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {itemDesc} — <span className="font-medium">{makeOrBuy}</span>
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {itemDrafts.filter((d: any) => d.applicable && d.approval_status !== "not_applicable").length} applicable
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead>Doc Number</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead>Activation</TableHead>
                      <TableHead>Dependency</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemDrafts.map((draft: any) => (
                      <TableRow key={draft.id} className={!draft.applicable ? "opacity-50" : ""}>
                        <TableCell className="font-medium text-xs">
                          <span className="mr-1">{DOC_TYPE_ICONS[draft.doc_type] || "📄"}</span>
                          {draft.doc_type}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {draft.doc_number || "—"}
                          {draft.actual_doc_number && (
                            <span className="block text-[10px] text-muted-foreground">
                              Actual: {draft.actual_doc_number}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[draft.approval_status] || ""}`}>
                            {formatStatus(draft.approval_status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${ACTIVATION_COLORS[draft.activation_status] || ""}`}>
                            {formatStatus(draft.activation_status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {draft.dependency_status === "blocked" && (
                            <span className="text-orange-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> {draft.dependency_doc_type}
                            </span>
                          )}
                          {draft.dependency_status === "met" && (
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Met
                            </span>
                          )}
                          {draft.dependency_status === "not_required" && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            {draft.approval_status === "pending_approval" && (
                              <>
                                <Button
                                  size="sm" variant="ghost" className="h-7 px-2 text-green-600 hover:text-green-700"
                                  onClick={() => actionMutation.mutate({ draftId: draft.id, action: "approve" })}
                                  disabled={actionMutation.isPending}
                                  title="Approve"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-700"
                                  onClick={() => { setRejectDialog({ open: true, draftId: draft.id }); setRemarks(""); }}
                                  disabled={actionMutation.isPending}
                                  title="Reject"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:text-blue-700"
                                  onClick={() => { setHoldDialog({ open: true, draftId: draft.id }); setRemarks(""); }}
                                  disabled={actionMutation.isPending}
                                  title="Hold"
                                >
                                  <PauseCircle className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {draft.approval_status === "on_hold" && (
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-blue-600"
                                onClick={() => actionMutation.mutate({ draftId: draft.id, action: "resume" })}
                                disabled={actionMutation.isPending}
                                title="Resume"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {draft.approval_status === "approved" && draft.activation_status === "not_activated" && draft.doc_type !== "IO" && (
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-emerald-600 hover:text-emerald-700"
                                onClick={() => actionMutation.mutate({ draftId: draft.id, action: "activate" })}
                                disabled={actionMutation.isPending}
                                title="Activate"
                              >
                                <Zap className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {draft.approval_status === "rejected" && (
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-orange-600"
                                onClick={() => actionMutation.mutate({ draftId: draft.id, action: "redraft" })}
                                disabled={actionMutation.isPending}
                                title="Re-draft"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {draft.approval_status === "approved" && draft.activation_status === "not_activated" && draft.doc_type === "IO" && (
                              <span className="text-[10px] text-muted-foreground italic">Auto-triggered</span>
                            )}
                            {draft.activation_status === "activated" && (
                              <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                                <Link2 className="h-3 w-3" />
                                #{draft.activated_entity_id}
                              </span>
                            )}
                            {draft.activation_status === "activation_failed" && (
                              <span className="text-[10px] text-red-500" title={draft.error_message}>
                                <AlertTriangle className="h-3 w-3 inline mr-0.5" /> Failed
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={rejectDialog.open} onOpenChange={(open) => { if (!open) setRejectDialog({ open: false, draftId: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Draft</DialogTitle>
            <DialogDescription>Provide a reason for rejection. This is required.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection remarks..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, draftId: null })}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!remarks.trim()}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={holdDialog.open} onOpenChange={(open) => { if (!open) setHoldDialog({ open: false, draftId: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Put Draft on Hold</DialogTitle>
            <DialogDescription>Optionally provide remarks for the hold.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter hold remarks (optional)..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldDialog({ open: false, draftId: null })}>Cancel</Button>
            <Button onClick={handleHold}>Put on Hold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color?: string }) {
  const bg = color ? `bg-${color}-50` : "bg-gray-50";
  const text = color ? `text-${color}-700` : "text-gray-700";
  return (
    <div className={`rounded-lg border p-3 text-center ${bg}`}>
      <p className={`text-xl font-bold ${text}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupByItem(drafts: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const d of drafts) {
    const key = `item-${d.project_item_id}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(d);
  }
  return groups;
}
