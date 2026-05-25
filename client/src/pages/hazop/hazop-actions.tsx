import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { fmtDate } from "@/lib/date-format";
import {
  ShieldAlert, ArrowLeft, Loader2, CheckCircle2, Clock, Search, FileText,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ActionItem {
  action_id: number;
  action_number: number;
  action_description: string;
  action_type: string | null;
  status: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  due_date: string | null;
  close_comments: string | null;
  closed_at: string | null;
  source: string;
  deviation_id: number;
  deviation_number: string;
  guideword: string;
  parameter: string;
  node_id: number;
  node_reference: string;
  node_name: string;
  loop_number: number;
  loop_name: string;
}

// ── Close action dialog ────────────────────────────────────────────────────────

function CloseActionDialog({ open, onClose, action, studyId }: { open: boolean; onClose: () => void; action: ActionItem; studyId: number; }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [comments, setComments] = useState(action.close_comments ?? "");

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", `/api/hazop/actions/${action.action_id}`, body),
    onSuccess: () => {
      toast({ title: "Action closed" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "actions"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Close Action</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="bg-gray-50 rounded p-3 text-xs text-gray-700">{action.action_description}</div>
          <div>
            <Label>Close Comments</Label>
            <Textarea value={comments} onChange={e => setComments(e.target.value)} rows={3} placeholder="Describe how this action was resolved…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate({ status: 'closed', close_comments: comments || null })} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Close Action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'closed') return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100"><CheckCircle2 className="h-3 w-3 mr-1" />Closed</Badge>;
  if (status === 'in_progress') return <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100"><Clock className="h-3 w-3 mr-1" />Open</Badge>;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HazopActionsPage() {
  const params = useParams<{ id: string }>();
  const studyId = parseInt(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [closingAction, setClosingAction] = useState<ActionItem | null>(null);

  const studyQuery = useQuery<any>({ queryKey: ["/api/hazop/studies", studyId] });

  const actionsQuery = useQuery<ActionItem[]>({
    queryKey: ["/api/hazop/studies", studyId, "actions", statusFilter],
    queryFn: () => {
      const url = statusFilter === "all"
        ? `/api/hazop/studies/${studyId}/actions`
        : `/api/hazop/studies/${studyId}/actions?status=${statusFilter}`;
      return fetch(url, { credentials: "include" }).then(r => r.json());
    },
    enabled: !isNaN(studyId),
  });

  const reopenMut = useMutation({
    mutationFn: (actionId: number) => apiRequest("PATCH", `/api/hazop/actions/${actionId}`, { status: 'open', close_comments: null }),
    onSuccess: () => {
      toast({ title: "Action reopened" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "actions"] });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const study = studyQuery.data;
  const isDraft = study?.status === 'draft';

  const filtered = (actionsQuery.data ?? []).filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.action_description.toLowerCase().includes(q)
      || a.deviation_number.toLowerCase().includes(q)
      || a.node_name.toLowerCase().includes(q)
      || (a.action_type ?? '').toLowerCase().includes(q);
  });

  const openCount = (actionsQuery.data ?? []).filter(a => a.status === 'open').length;
  const closedCount = (actionsQuery.data ?? []).filter(a => a.status === 'closed').length;

  return (
    <Layout>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="border-b bg-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/worksheet`)}>
              <ArrowLeft className="h-4 w-4 mr-1" />Worksheet
            </Button>
            <ShieldAlert className="h-5 w-5 text-red-600" />
            <div>
              <div className="font-semibold text-sm">{study?.study_number ?? '…'} — Action Register</div>
              <div className="text-xs text-gray-500">{study?.title}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded">{openCount} open</span>
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">{closedCount} closed</span>
          </div>
        </div>

        {/* Filters */}
        <div className="border-b bg-white px-4 py-2 flex items-center gap-3 shrink-0">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input className="pl-8 h-8 text-xs" placeholder="Search actions…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-gray-400">{filtered.length} actions</span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {actionsQuery.isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-100 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b">Node / Deviation</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b">Action</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b w-24">Type</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b w-28">Assigned To</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b w-24">Due</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 border-b w-28">Status</th>
                  {isDraft && <th className="text-right px-3 py-2 font-semibold text-gray-600 border-b w-24"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(action => (
                  <tr key={action.action_id} className="border-b hover:bg-gray-50 align-top">
                    <td className="px-3 py-2">
                      <div className="font-mono text-gray-500">{action.node_reference}</div>
                      <div className="text-gray-700">{action.node_name}</div>
                      <div className="text-gray-400 mt-0.5">
                        <span className="font-mono">{action.deviation_number}</span>
                        {' · '}
                        <span className="font-semibold">{action.guideword}</span>
                        {' '}
                        {action.parameter}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-gray-800 leading-relaxed max-w-sm">{action.action_description}</div>
                      {action.close_comments && (
                        <div className="mt-1 text-gray-500 italic leading-relaxed">Close: {action.close_comments}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{action.action_type ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{action.assigned_to_name ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{action.due_date ? fmtDate(action.due_date) : '—'}</td>
                    <td className="px-3 py-2"><StatusBadge status={action.status} /></td>
                    {isDraft && (
                      <td className="px-3 py-2 text-right">
                        {action.status !== 'closed' ? (
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setClosingAction(action)}>
                            Close
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-gray-400" onClick={() => reopenMut.mutate(action.action_id)} disabled={reopenMut.isPending}>
                            Reopen
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No actions found{search ? ` matching "${search}"` : ''}</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {closingAction && (
        <CloseActionDialog open={true} onClose={() => setClosingAction(null)} action={closingAction} studyId={studyId} />
      )}
    </Layout>
  );
}
