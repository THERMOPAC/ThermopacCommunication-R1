import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ShieldAlert, Zap, ChevronDown, ChevronRight, Loader2, ArrowLeft,
  RefreshCw, CheckCircle2, AlertTriangle, Plus, Trash2, Edit2, List,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface NodeSummary {
  node_id: number; node_number: number; node_name: string; node_reference: string;
  deviation_count: number; action_count: number; step_count: string;
  generated_at: string | null; topology_changed_after_review: boolean;
  process_function: string | null; operating_regime: string; phase_state: string;
}
interface LoopSummary { loop_id: number; loop_number: number; loop_name: string; nodes: NodeSummary[]; }

interface Cause { id: number; cause_number: number; cause_description: string; source: string; }
interface Consequence { id: number; consequence_number: number; consequence_description: string; source: string; }
interface Safeguard { id: number; safeguard_number: number; safeguard_description: string; safeguard_type: string | null; tag_ref: string | null; source: string; }
interface ActionRow { id: number; action_number: number; action_description: string; action_type: string | null; status: string; source: string; assigned_to: number | null; due_date: string | null; }

interface Deviation {
  id: number; deviation_number: string; guideword: string; parameter: string;
  deviation_description: string; is_credible: boolean; reviewed: boolean;
  causes: Cause[]; consequences: Consequence[]; safeguards: Safeguard[]; actions: ActionRow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function RegimeBadge({ regime, phase }: { regime: string; phase: string }) {
  return (
    <span className="flex gap-1">
      {regime === 'vacuum' && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Vacuum</span>}
      {regime === 'pressure' && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Pressure</span>}
      {phase === 'two_phase' && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">2-Phase</span>}
      {phase === 'vapor' && <span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">Vapor</span>}
    </span>
  );
}

function GuidewordBadge({ gw }: { gw: string }) {
  const cls: Record<string, string> = {
    'No': 'bg-red-100 text-red-700', 'More': 'bg-orange-100 text-orange-700',
    'Less': 'bg-yellow-100 text-yellow-700', 'Reverse': 'bg-purple-100 text-purple-700',
    'Other Than': 'bg-blue-100 text-blue-700', 'Part of': 'bg-teal-100 text-teal-700',
  };
  return <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cls[gw] ?? 'bg-gray-100 text-gray-700'}`}>{gw}</span>;
}

// ── Add child item dialog ──────────────────────────────────────────────────────

function AddChildDialog({
  open, onClose, deviationId, childType, studyId, nodeId,
}: { open: boolean; onClose: () => void; deviationId: number; childType: string; studyId: number; nodeId: number; }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [actionType, setActionType] = useState("");

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/hazop/deviations/${deviationId}/${childType}`, body),
    onSuccess: () => {
      toast({ title: "Added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/nodes", nodeId, "deviations"] });
      setText(""); setActionType("");
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const labelMap: Record<string, string> = { causes: "Cause", consequences: "Consequence", safeguards: "Safeguard", actions: "Action" };
  const descFieldMap: Record<string, string> = { causes: "cause_description", consequences: "consequence_description", safeguards: "safeguard_description", actions: "action_description" };

  function handleSubmit() {
    if (!text.trim()) return;
    const body: any = { [descFieldMap[childType]]: text.trim() };
    if (childType === "actions" && actionType) body.action_type = actionType;
    mutation.mutate(body);
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add {labelMap[childType] ?? childType}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>{labelMap[childType]} Description <span className="text-red-500">*</span></Label>
            <Textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Enter description…" />
          </div>
          {childType === "actions" && (
            <div>
              <Label>Action Type</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Design">Design</SelectItem>
                  <SelectItem value="Instrumentation">Instrumentation</SelectItem>
                  <SelectItem value="Procedure">Procedure</SelectItem>
                  <SelectItem value="Safety">Safety</SelectItem>
                  <SelectItem value="Further Study">Further Study</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || !text.trim()}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Child row (editable) ───────────────────────────────────────────────────────

function ChildRow({ item, childType, descField, studyId, nodeId, isDraft }: {
  item: any; childType: string; descField: string; studyId: number; nodeId: number; isDraft: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item[descField]);

  const patchMut = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", `/api/hazop/${childType}/${item.id}`, body),
    onSuccess: () => {
      toast({ title: "Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/nodes", nodeId, "deviations"] });
      setEditing(false);
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/hazop/${childType}/${item.id}`),
    onSuccess: () => {
      toast({ title: "Removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/nodes", nodeId, "deviations"] });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const numField = { causes: 'cause_number', consequences: 'consequence_number', safeguards: 'safeguard_number', actions: 'action_number' }[childType] ?? 'id';

  return (
    <div className="flex items-start gap-2 py-1 group">
      <span className="text-xs text-gray-400 w-5 shrink-0 mt-0.5">{item[numField]}.</span>
      {editing ? (
        <div className="flex-1 flex gap-2 items-start">
          <Textarea value={text} onChange={e => setText(e.target.value)} rows={2} className="text-xs flex-1" />
          <div className="flex flex-col gap-1">
            <Button size="sm" className="h-6 text-xs px-2" onClick={() => patchMut.mutate({ [descField]: text })} disabled={patchMut.isPending}>Save</Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setEditing(false); setText(item[descField]); }}>✕</Button>
          </div>
        </div>
      ) : (
        <span className="flex-1 text-xs text-gray-700 leading-relaxed">{item[descField]}</span>
      )}
      {isDraft && !editing && (
        <div className="hidden group-hover:flex gap-1 shrink-0">
          <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-blue-600"><Edit2 className="h-3 w-3" /></button>
          <button onClick={() => delMut.mutate()} className="text-gray-400 hover:text-red-600" disabled={delMut.isPending}><Trash2 className="h-3 w-3" /></button>
        </div>
      )}
      {item.source === 'library' && <span className="text-xs text-gray-400 shrink-0">lib</span>}
    </div>
  );
}

// ── Deviation row ──────────────────────────────────────────────────────────────

function DeviationRow({ dev, studyId, nodeId, isDraft }: { dev: Deviation; studyId: number; nodeId: number; isDraft: boolean; }) {
  const [open, setOpen] = useState(false);
  const [addChild, setAddChild] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reviewMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/hazop/deviations/${dev.id}`, { reviewed: !dev.reviewed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/nodes", nodeId, "deviations"] });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const credibleMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/hazop/deviations/${dev.id}`, { is_credible: !dev.is_credible }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/nodes", nodeId, "deviations"] });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const actionOpen = dev.actions.filter(a => a.status === 'open').length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 border-b transition-colors ${dev.reviewed ? 'bg-green-50/40' : ''}`}>
          {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
          <span className="text-xs font-mono text-gray-500 w-20 shrink-0">{dev.deviation_number}</span>
          <GuidewordBadge gw={dev.guideword} />
          <span className="text-xs text-gray-600 w-20 shrink-0">{dev.parameter}</span>
          <span className="flex-1 text-xs text-gray-800 truncate">{dev.deviation_description}</span>
          <div className="flex items-center gap-2 shrink-0">
            {!dev.is_credible && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Not credible</span>}
            {actionOpen > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{actionOpen} action{actionOpen > 1 ? 's' : ''}</span>}
            {dev.reviewed && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="bg-gray-50 px-4 pb-3 border-b">
          <div className="grid grid-cols-4 gap-4 pt-3">
            {/* Causes */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Causes</span>
                {isDraft && <button onClick={() => setAddChild('causes')} className="text-gray-400 hover:text-green-600"><Plus className="h-3 w-3" /></button>}
              </div>
              {dev.causes.map(c => <ChildRow key={c.id} item={c} childType="causes" descField="cause_description" studyId={studyId} nodeId={nodeId} isDraft={isDraft} />)}
              {dev.causes.length === 0 && <span className="text-xs text-gray-400 italic">None</span>}
            </div>
            {/* Consequences */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Consequences</span>
                {isDraft && <button onClick={() => setAddChild('consequences')} className="text-gray-400 hover:text-green-600"><Plus className="h-3 w-3" /></button>}
              </div>
              {dev.consequences.map(c => <ChildRow key={c.id} item={c} childType="consequences" descField="consequence_description" studyId={studyId} nodeId={nodeId} isDraft={isDraft} />)}
              {dev.consequences.length === 0 && <span className="text-xs text-gray-400 italic">None</span>}
            </div>
            {/* Safeguards */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Safeguards</span>
                {isDraft && <button onClick={() => setAddChild('safeguards')} className="text-gray-400 hover:text-green-600"><Plus className="h-3 w-3" /></button>}
              </div>
              {dev.safeguards.map(s => <ChildRow key={s.id} item={s} childType="safeguards" descField="safeguard_description" studyId={studyId} nodeId={nodeId} isDraft={isDraft} />)}
              {dev.safeguards.length === 0 && <span className="text-xs text-gray-400 italic">None</span>}
            </div>
            {/* Actions */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</span>
                {isDraft && <button onClick={() => setAddChild('actions')} className="text-gray-400 hover:text-green-600"><Plus className="h-3 w-3" /></button>}
              </div>
              {dev.actions.map(a => <ChildRow key={a.id} item={a} childType="actions" descField="action_description" studyId={studyId} nodeId={nodeId} isDraft={isDraft} />)}
              {dev.actions.length === 0 && <span className="text-xs text-gray-400 italic">None</span>}
            </div>
          </div>
          {isDraft && (
            <div className="flex gap-2 mt-3 pt-2 border-t border-gray-200">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => credibleMut.mutate()} disabled={credibleMut.isPending}>
                {dev.is_credible ? "Mark Not Credible" : "Mark Credible"}
              </Button>
              <Button size="sm" variant={dev.reviewed ? "outline" : "default"} className="h-7 text-xs" onClick={() => reviewMut.mutate()} disabled={reviewMut.isPending}>
                {reviewMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                {dev.reviewed ? "Unmark Review" : "Mark Reviewed"}
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
      {addChild && (
        <AddChildDialog open={true} onClose={() => setAddChild(null)} deviationId={dev.id} childType={addChild} studyId={studyId} nodeId={nodeId} />
      )}
    </Collapsible>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HazopWorksheetPage() {
  const params = useParams<{ id: string }>();
  const studyId = parseInt(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [expandedLoops, setExpandedLoops] = useState<Set<number>>(new Set());

  const studyQuery = useQuery<any>({ queryKey: ["/api/hazop/studies", studyId] });
  const summaryQuery = useQuery<{ study_id: number; loops: LoopSummary[] }>({
    queryKey: ["/api/hazop/studies", studyId, "worksheet-summary"],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/worksheet-summary`, { credentials: "include" }).then(r => r.json()),
    enabled: !isNaN(studyId),
  });

  const deviationsQuery = useQuery<Deviation[]>({
    queryKey: ["/api/hazop/nodes", selectedNodeId, "deviations"],
    queryFn: () => fetch(`/api/hazop/nodes/${selectedNodeId}/deviations`, { credentials: "include" }).then(r => r.json()),
    enabled: selectedNodeId !== null,
  });

  const generateNodeMut = useMutation({
    mutationFn: (nodeId: number) => apiRequest("POST", `/api/hazop/nodes/${nodeId}/generate`, {}),
    onSuccess: (data: any) => {
      toast({ title: `Generated ${data.generated} deviation(s)` });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "worksheet-summary"] });
      if (selectedNodeId) queryClient.invalidateQueries({ queryKey: ["/api/hazop/nodes", selectedNodeId, "deviations"] });
    },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const generateAllMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/hazop/studies/${studyId}/generate`, {}),
    onSuccess: (data: any) => {
      toast({ title: `Bulk generation complete — ${data.total_generated} new deviations` });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "worksheet-summary"] });
      if (selectedNodeId) queryClient.invalidateQueries({ queryKey: ["/api/hazop/nodes", selectedNodeId, "deviations"] });
    },
    onError: (err: any) => toast({ title: "Bulk generation failed", description: err.message, variant: "destructive" }),
  });

  const study = studyQuery.data;
  const isDraft = study?.status === 'draft';
  const summary = summaryQuery.data;

  const selectedNode = summary?.loops
    .flatMap(l => l.nodes)
    .find(n => n.node_id === selectedNodeId) ?? null;

  function toggleLoop(loopId: number) {
    setExpandedLoops(prev => {
      const n = new Set(prev);
      n.has(loopId) ? n.delete(loopId) : n.add(loopId);
      return n;
    });
  }

  const totalDeviations = summary?.loops.flatMap(l => l.nodes).reduce((s, n) => s + (n.deviation_count ?? 0), 0) ?? 0;
  const totalActions = summary?.loops.flatMap(l => l.nodes).reduce((s, n) => s + (n.action_count ?? 0), 0) ?? 0;

  return (
    <Layout>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="border-b bg-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/process-builder`)}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
            <ShieldAlert className="h-5 w-5 text-red-600" />
            <div>
              <div className="font-semibold text-sm">{study?.study_number ?? '…'} — HAZOP Worksheet</div>
              <div className="text-xs text-gray-500">{study?.title}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-3 text-xs text-gray-500">
              <span>{totalDeviations} deviations</span>
              <span>•</span>
              <span>{totalActions} open actions</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/actions`)}>
              <List className="h-4 w-4 mr-1" />Action Register
            </Button>
            {isDraft && (
              <Button size="sm" onClick={() => generateAllMut.mutate()} disabled={generateAllMut.isPending}>
                {generateAllMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
                Generate All Nodes
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar — node tree */}
          <div className="w-64 border-r bg-gray-50 overflow-y-auto shrink-0">
            {summaryQuery.isLoading && <div className="p-4 text-xs text-gray-400">Loading…</div>}
            {summary?.loops.map(loop => (
              <div key={loop.loop_id}>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 border-b"
                  onClick={() => toggleLoop(loop.loop_id)}
                >
                  {expandedLoops.has(loop.loop_id) ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                  <span className="text-xs font-semibold text-gray-700 truncate">Loop {loop.loop_number}: {loop.loop_name}</span>
                </button>
                {expandedLoops.has(loop.loop_id) && loop.nodes.map(node => {
                  const isSelected = selectedNodeId === node.node_id;
                  const generated = !!node.generated_at;
                  const stale = node.topology_changed_after_review;
                  return (
                    <button
                      key={node.node_id}
                      className={`w-full flex flex-col gap-0.5 px-4 py-2 text-left border-b text-xs transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-100'}`}
                      onClick={() => setSelectedNodeId(node.node_id)}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-gray-500 shrink-0">{node.node_reference}</span>
                        <span className="font-medium text-gray-800 truncate">{node.node_name}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {generated && !stale && <span className="bg-green-100 text-green-700 px-1 rounded">✓ {node.deviation_count}D</span>}
                        {generated && stale && <span className="bg-orange-100 text-orange-700 px-1 rounded flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />Stale</span>}
                        {!generated && parseInt(node.step_count) > 0 && <span className="bg-gray-100 text-gray-500 px-1 rounded">Not generated</span>}
                        {parseInt(node.step_count) === 0 && <span className="bg-red-100 text-red-500 px-1 rounded">No steps</span>}
                        <RegimeBadge regime={node.operating_regime} phase={node.phase_state} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-y-auto">
            {selectedNodeId === null ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <ShieldAlert className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">Select a node from the sidebar to view its HAZOP worksheet</p>
              </div>
            ) : (
              <div>
                {/* Node header */}
                {selectedNode && (
                  <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">{selectedNode.node_reference}</span>
                        <span className="font-semibold text-sm">{selectedNode.node_name}</span>
                        <RegimeBadge regime={selectedNode.operating_regime} phase={selectedNode.phase_state} />
                        {selectedNode.topology_changed_after_review && (
                          <Badge variant="outline" className="border-orange-400 text-orange-600 text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />Topology Changed — Regenerate
                          </Badge>
                        )}
                      </div>
                      {selectedNode.process_function && (
                        <div className="text-xs text-gray-400 mt-0.5">Function: {selectedNode.process_function}</div>
                      )}
                    </div>
                    {isDraft && (
                      <div className="flex gap-2">
                        {selectedNode.generated_at && (
                          <Button size="sm" variant="outline" onClick={() => generateNodeMut.mutate(selectedNodeId)} disabled={generateNodeMut.isPending}>
                            {generateNodeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                            Re-generate
                          </Button>
                        )}
                        {!selectedNode.generated_at && parseInt(selectedNode.step_count) > 0 && (
                          <Button size="sm" onClick={() => generateNodeMut.mutate(selectedNodeId)} disabled={generateNodeMut.isPending}>
                            {generateNodeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
                            Generate Deviations
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Deviations table */}
                {deviationsQuery.isLoading && (
                  <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                )}
                {!deviationsQuery.isLoading && deviationsQuery.data && (
                  <div>
                    {/* Column headers */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 border-b text-xs font-semibold text-gray-500 sticky top-[60px] z-10">
                      <span className="w-4 shrink-0"></span>
                      <span className="w-20 shrink-0">Ref</span>
                      <span className="w-20 shrink-0">Guide</span>
                      <span className="w-20 shrink-0">Parameter</span>
                      <span className="flex-1">Deviation</span>
                      <span className="w-24 shrink-0 text-right">Status</span>
                    </div>
                    {deviationsQuery.data.map(dev => (
                      <DeviationRow key={dev.id} dev={dev} studyId={studyId} nodeId={selectedNodeId} isDraft={isDraft} />
                    ))}
                    {deviationsQuery.data.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <ShieldAlert className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-sm">No deviations yet</p>
                        {isDraft && parseInt(selectedNode?.step_count ?? "0") > 0 && (
                          <p className="text-xs mt-1">Use "Generate Deviations" to create them from the library</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
