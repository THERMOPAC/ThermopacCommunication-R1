import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle, ArrowLeft, CheckCircle, Clock, FileText, Upload,
  Trash2, Download, Plus, Minus, ChevronRight, ChevronDown,
  Star, AlertTriangle, ExternalLink, Link2,
} from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import {
  ROOT_CAUSE_CODES, ROOT_CAUSE_LABELS, METHODOLOGY_LABELS,
  FISHBONE_CATEGORY_LABELS, FAILURE_TREE_NODE_TYPE_LABELS,
  LINK_TYPE_LABELS, RCA_STATUS_LABELS, RCA_STATUS_COLORS,
} from "./oi-rca-constants";

const MANAGER_ROLES = ["Manager", "Senior Manager", "General Manager", "Superuser"];
const SM_ROLES      = ["Senior Manager", "General Manager", "Superuser"];

function hasRole(role: string, allowed: string[]): boolean {
  return allowed.includes(role);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RcaStatusBadge({ status }: { status: string }) {
  const cls = RCA_STATUS_COLORS[status] || 'bg-gray-100 text-gray-700';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{RCA_STATUS_LABELS[status] ?? status}</span>;
}

function FiveWhyTab({ rcaId, issueId, rca }: { rcaId: number; issueId: number; rca: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const editable = rca.status === 'draft' || rca.status === 'rejected';

  const { data: rows = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/oi/issues', issueId, 'rca', rcaId, 'five-why'] });

  const [localRows, setLocalRows] = useState<Array<{ whyLevel: number; whyQuestion: string; whyAnswer: string }>>([]);
  const [editing, setEditing] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/oi/issues/${issueId}/rca/${rcaId}/five-why`, localRows),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca', rcaId, 'five-why'] }); setEditing(false); toast({ title: '5 Why saved' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const startEdit = () => {
    setLocalRows((rows as any[]).map(r => ({ whyLevel: r.whyLevel, whyQuestion: r.whyQuestion, whyAnswer: r.whyAnswer })));
    if ((rows as any[]).length === 0) setLocalRows([{ whyLevel: 1, whyQuestion: '', whyAnswer: '' }]);
    setEditing(true);
  };

  const addRow = () => {
    if (localRows.length >= 5) return;
    setLocalRows([...localRows, { whyLevel: localRows.length + 1, whyQuestion: '', whyAnswer: '' }]);
  };
  const removeRow = () => {
    if (localRows.length <= 1) return;
    setLocalRows(localRows.slice(0, -1));
  };
  const updateRow = (i: number, field: 'whyQuestion' | 'whyAnswer', val: string) => {
    const next = [...localRows];
    next[i] = { ...next[i], [field]: val };
    setLocalRows(next);
  };

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  return (
    <div className="space-y-4">
      {!editing && (
        <div className="flex justify-end">
          {editable && <Button size="sm" onClick={startEdit}><Plus className="h-4 w-4 mr-1" />Edit 5 Why</Button>}
        </div>
      )}
      {!editing && (rows as any[]).length === 0 && <p className="text-muted-foreground text-sm">No 5 Why rows yet.</p>}
      {!editing && (rows as any[]).map((r: any) => (
        <Card key={r.id} className="border-l-4 border-l-blue-400">
          <CardContent className="p-3">
            <div className="text-xs font-semibold text-muted-foreground mb-1">Why {r.whyLevel}</div>
            <div className="font-medium text-sm mb-1">{r.whyQuestion}</div>
            <div className="text-sm text-muted-foreground">{r.whyAnswer}</div>
          </CardContent>
        </Card>
      ))}
      {editing && (
        <div className="space-y-3">
          {localRows.map((row, i) => (
            <div key={i} className="border rounded p-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Why {row.whyLevel}</div>
              <div>
                <Label className="text-xs">Question</Label>
                <Input value={row.whyQuestion} onChange={e => updateRow(i, 'whyQuestion', e.target.value)} placeholder="Why did this happen?" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Answer</Label>
                <Textarea value={row.whyAnswer} onChange={e => updateRow(i, 'whyAnswer', e.target.value)} placeholder="Because…" className="mt-1" rows={2} />
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addRow} disabled={localRows.length >= 5}><Plus className="h-4 w-4 mr-1" />Add Why</Button>
            <Button size="sm" variant="outline" onClick={removeRow} disabled={localRows.length <= 1}><Minus className="h-4 w-4 mr-1" />Remove</Button>
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FishboneTab({ rcaId, issueId, rca }: { rcaId: number; issueId: number; rca: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const editable = rca.status === 'draft' || rca.status === 'rejected';
  const CATS = Object.keys(FISHBONE_CATEGORY_LABELS);

  const { data: causes = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/oi/issues', issueId, 'rca', rcaId, 'fishbone'] });
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [newCause, setNewCause] = useState({ category: 'man', causeDescription: '', isPrimaryCause: false });
  const [addingCat, setAddingCat] = useState<string | null>(null);

  const addMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/oi/issues/${issueId}/rca/${rcaId}/fishbone`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca', rcaId, 'fishbone'] }); setAddingCat(null); toast({ title: 'Cause added' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const delMut = useMutation({
    mutationFn: (causeId: number) => apiRequest('DELETE', `/api/oi/issues/${issueId}/rca/${rcaId}/fishbone/${causeId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca', rcaId, 'fishbone'] }); toast({ title: 'Cause removed' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  return (
    <div className="space-y-2">
      {CATS.map(cat => {
        const catCauses = (causes as any[]).filter(c => c.category === cat);
        const expanded = openCat === cat;
        return (
          <div key={cat} className="border rounded">
            <button className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30" onClick={() => setOpenCat(expanded ? null : cat)}>
              <span className="font-medium text-sm">{FISHBONE_CATEGORY_LABELS[cat]}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{catCauses.length}</Badge>
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </button>
            {expanded && (
              <div className="border-t px-3 pb-3 space-y-2">
                {catCauses.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2 text-sm">
                      {c.isPrimaryCause && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                      <span>{c.causeDescription}</span>
                    </div>
                    {editable && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => delMut.mutate(c.id)}><Trash2 className="h-3 w-3 text-red-500" /></Button>}
                  </div>
                ))}
                {catCauses.length === 0 && <p className="text-xs text-muted-foreground py-1">No causes added yet.</p>}
                {editable && addingCat === cat && (
                  <div className="mt-2 space-y-2 border-t pt-2">
                    <Textarea value={newCause.causeDescription} onChange={e => setNewCause(p => ({ ...p, causeDescription: e.target.value }))} placeholder="Describe the cause…" rows={2} className="text-sm" />
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="primary" checked={newCause.isPrimaryCause} onChange={e => setNewCause(p => ({ ...p, isPrimaryCause: e.target.checked }))} />
                      <Label htmlFor="primary" className="text-xs">Primary Cause</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => addMut.mutate({ category: cat, causeDescription: newCause.causeDescription, isPrimaryCause: newCause.isPrimaryCause })} disabled={addMut.isPending}>Add</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingCat(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
                {editable && addingCat !== cat && (
                  <Button size="sm" variant="outline" className="mt-1" onClick={() => { setAddingCat(cat); setNewCause({ category: cat, causeDescription: '', isPrimaryCause: false }); }}><Plus className="h-3 w-3 mr-1" />Add Cause</Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FailureTreeTab({ rcaId, issueId, rca }: { rcaId: number; issueId: number; rca: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const editable = rca.status === 'draft' || rca.status === 'rejected';
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [newNode, setNewNode] = useState({ nodeType: 'basic_event', nodeLabel: '', nodeNote: '' });

  const { data: nodes = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/oi/issues', issueId, 'rca', rcaId, 'failure-tree'] });

  const addMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/oi/issues/${issueId}/rca/${rcaId}/failure-tree`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca', rcaId, 'failure-tree'] }); setAddingTo(null); toast({ title: 'Node added' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const delMut = useMutation({
    mutationFn: (nodeId: number) => apiRequest('DELETE', `/api/oi/issues/${issueId}/rca/${rcaId}/failure-tree/${nodeId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca', rcaId, 'failure-tree'] }); toast({ title: 'Node deleted' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const nodeTypeIcons: Record<string, string> = { top_event: '⬡', intermediate_event: '◈', basic_event: '●', and_gate: '⊓', or_gate: '⊔' };

  const renderNode = (node: any, depth = 0) => {
    const children = (nodes as any[]).filter(n => n.parentId === node.id).sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    const isExpanded = expanded.has(node.id);
    return (
      <div key={node.id} style={{ marginLeft: depth * 16 }} className="space-y-1">
        <div className={`flex items-center gap-2 p-2 rounded border text-sm ${node.isTopEvent ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
          {children.length > 0 && (
            <button onClick={() => setExpanded(s => { const n = new Set(s); n.has(node.id) ? n.delete(node.id) : n.add(node.id); return n; })} className="text-muted-foreground">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
          <span className="text-xs">{nodeTypeIcons[node.nodeType] ?? '?'}</span>
          <span className="flex-1 font-medium">{node.nodeLabel}</span>
          <Badge variant="outline" className="text-xs hidden sm:inline-flex">{FAILURE_TREE_NODE_TYPE_LABELS[node.nodeType] ?? node.nodeType}</Badge>
          {editable && !node.isTopEvent && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => delMut.mutate(node.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
          )}
          {editable && node.nodeType !== 'basic_event' && addingTo !== node.id && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setAddingTo(node.id); setNewNode({ nodeType: 'basic_event', nodeLabel: '', nodeNote: '' }); }}><Plus className="h-3 w-3" /></Button>
          )}
        </div>
        {addingTo === node.id && editable && (
          <div className="ml-4 border rounded p-3 space-y-2 bg-muted/30">
            <Select value={newNode.nodeType} onValueChange={v => setNewNode(p => ({ ...p, nodeType: v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(FAILURE_TREE_NODE_TYPE_LABELS).filter(([k]) => k !== 'top_event').map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={newNode.nodeLabel} onChange={e => setNewNode(p => ({ ...p, nodeLabel: e.target.value }))} placeholder="Node label…" className="h-8 text-xs" />
            <Input value={newNode.nodeNote} onChange={e => setNewNode(p => ({ ...p, nodeNote: e.target.value }))} placeholder="Note (optional)" className="h-8 text-xs" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addMut.mutate({ nodeType: newNode.nodeType, nodeLabel: newNode.nodeLabel, nodeNote: newNode.nodeNote || null, parentId: node.id })} disabled={addMut.isPending}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingTo(null)}>Cancel</Button>
            </div>
          </div>
        )}
        {isExpanded && children.map(c => renderNode(c, depth + 1))}
      </div>
    );
  };

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  const topEvent = (nodes as any[]).find(n => n.isTopEvent);
  return (
    <div className="space-y-3">
      {!topEvent && editable && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">No top event yet. Add one to start the failure tree.</p>
          {addingTo === -1 ? (
            <div className="border rounded p-3 space-y-2">
              <Input value={newNode.nodeLabel} onChange={e => setNewNode(p => ({ ...p, nodeLabel: e.target.value }))} placeholder="Top event description…" />
              <Input value={newNode.nodeNote} onChange={e => setNewNode(p => ({ ...p, nodeNote: e.target.value }))} placeholder="Note (optional)" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => addMut.mutate({ nodeType: 'top_event', nodeLabel: newNode.nodeLabel, nodeNote: newNode.nodeNote || null, parentId: null })} disabled={addMut.isPending}>Add Top Event</Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingTo(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => { setAddingTo(-1); setNewNode({ nodeType: 'top_event', nodeLabel: '', nodeNote: '' }); }}><Plus className="h-4 w-4 mr-1" />Add Top Event</Button>
          )}
        </div>
      )}
      {topEvent && renderNode(topEvent)}
      {!topEvent && !editable && <p className="text-sm text-muted-foreground">No failure tree built.</p>}
    </div>
  );
}

function EvidenceTab({ rcaId, issueId, rca, userRole }: { rcaId: number; issueId: number; rca: any; userRole: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const canUpload = rca.status !== 'approved' && rca.status !== 'rejected';

  const { data: evidence = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/oi/issues', issueId, 'rca', rcaId, 'evidence'] });
  const { user } = useAuth();

  const delMut = useMutation({
    mutationFn: (evId: number) => apiRequest('DELETE', `/api/oi/issues/${issueId}/rca/${rcaId}/evidence/${evId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca', rcaId, 'evidence'] }); toast({ title: 'Evidence removed' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const [uploading, setUploading] = useState(false);
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await fetch(`/api/oi/issues/${issueId}/rca/${rcaId}/evidence`, { method: 'POST', body: fd });
      qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca', rcaId, 'evidence'] });
      toast({ title: 'Evidence uploaded' });
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const downloadUrl = async (evId: number, fileName: string) => {
    const res = await fetch(`/api/oi/issues/${issueId}/rca/${rcaId}/evidence/${evId}/signed-url`);
    const { url } = await res.json();
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
  };

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  return (
    <div className="space-y-4">
      {canUpload && (
        <div>
          <Label htmlFor="ev-upload" className="cursor-pointer">
            <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
              <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{uploading ? 'Uploading…' : 'Click to upload evidence file (max 25MB)'}</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, Images, Word, Excel, Text</p>
            </div>
          </Label>
          <input id="ev-upload" type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.txt" onChange={handleUpload} disabled={uploading} />
        </div>
      )}
      {(evidence as any[]).length === 0 && <p className="text-sm text-muted-foreground">No evidence files uploaded yet.</p>}
      {(evidence as any[]).map((ev: any) => (
        <div key={ev.id} className="flex items-center justify-between p-3 border rounded">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{ev.fileName}</p>
              <p className="text-xs text-muted-foreground">{ev.fileSizeBytes ? `${Math.round(ev.fileSizeBytes / 1024)} KB · ` : ''}{fmtDateTime(ev.uploadedAt)}</p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadUrl(ev.id, ev.fileName)}><Download className="h-3 w-3" /></Button>
            {(ev.uploadedBy === user?.id || hasRole(userRole, SM_ROLES)) && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => delMut.mutate(ev.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SimilarIssuesTab({ issueId }: { issueId: number }) {
  const { data: similar, isLoading } = useQuery<any[]>({ queryKey: ['/api/oi/issues', issueId, 'similar'] });
  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;
  if (!similar || similar.length === 0) return <p className="text-sm text-muted-foreground">No similar issues found with the same approved root cause.</p>;
  return (
    <div className="space-y-2">
      {similar.map((iss: any) => (
        <div key={iss.id} className="flex items-start justify-between p-3 border rounded hover:bg-muted/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">{iss.issueNumber}</span>
              <Badge variant="outline" className="text-xs">{iss.severity}</Badge>
              <Badge variant="outline" className="text-xs">{iss.status}</Badge>
            </div>
            <p className="text-sm font-medium mt-0.5">{iss.title}</p>
            <p className="text-xs text-muted-foreground">{ROOT_CAUSE_LABELS[iss.rootCauseCode as keyof typeof ROOT_CAUSE_LABELS] ?? iss.rootCauseCode} · Approved {fmtDate(iss.approvedAt)}</p>
          </div>
          <a href={`/oi/issues/${iss.id}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 text-muted-foreground" /></a>
        </div>
      ))}
    </div>
  );
}

function CorrelationsTab({ issueId, userRole }: { issueId: number; userRole: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showLink, setShowLink] = useState(false);
  const [newLink, setNewLink] = useState({ partnerIssueId: '', linkType: 'same_root_cause', linkNote: '' });

  const { data: correlations = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/oi/issues', issueId, 'correlations'] });

  const addMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/oi/issues/${issueId}/correlations`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'correlations'] }); setShowLink(false); toast({ title: 'Correlation link added' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const delMut = useMutation({
    mutationFn: (linkId: number) => apiRequest('DELETE', `/api/oi/issues/${issueId}/correlations/${linkId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'correlations'] }); toast({ title: 'Link removed' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowLink(true)}><Link2 className="h-4 w-4 mr-1" />Link Issue</Button>
      </div>
      {(correlations as any[]).length === 0 && <p className="text-sm text-muted-foreground">No correlation links yet.</p>}
      {(correlations as any[]).map((link: any) => (
        <div key={link.id} className="flex items-start justify-between p-3 border rounded">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">{link.partnerIssueNumber}</span>
              <Badge variant="outline" className="text-xs">{LINK_TYPE_LABELS[link.linkType] ?? link.linkType}</Badge>
            </div>
            <p className="text-sm font-medium">{link.partnerTitle}</p>
            {link.linkNote && <p className="text-xs text-muted-foreground mt-0.5">{link.linkNote}</p>}
            <p className="text-xs text-muted-foreground">by {link.linkedByName} · {fmtDate(link.linkedAt)}</p>
          </div>
          <div className="flex gap-1">
            <a href={`/oi/issues/${link.partnerIssueId}`} target="_blank" rel="noreferrer"><Button size="icon" variant="ghost" className="h-7 w-7"><ExternalLink className="h-3 w-3" /></Button></a>
            {hasRole(userRole, SM_ROLES) && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => delMut.mutate(link.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>}
          </div>
        </div>
      ))}
      <Dialog open={showLink} onOpenChange={setShowLink}>
        <DialogContent>
          <DialogHeader><DialogTitle>Link to Related Issue</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Partner Issue ID</Label><Input type="number" value={newLink.partnerIssueId} onChange={e => setNewLink(p => ({ ...p, partnerIssueId: e.target.value }))} placeholder="Enter issue ID number" className="mt-1" /></div>
            <div><Label>Link Type</Label>
              <Select value={newLink.linkType} onValueChange={v => setNewLink(p => ({ ...p, linkType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(LINK_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Note (optional)</Label><Textarea value={newLink.linkNote} onChange={e => setNewLink(p => ({ ...p, linkNote: e.target.value }))} className="mt-1" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowLink(false)}>Cancel</Button>
            <Button onClick={() => addMut.mutate({ partnerIssueId: parseInt(newLink.partnerIssueId), linkType: newLink.linkType, linkNote: newLink.linkNote || null })} disabled={addMut.isPending}>Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OiRcaPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const issueId = parseInt(id);
  const userRole = user?.role || 'Employee';

  const { data: issue, isLoading: issueLoading } = useQuery<any>({ queryKey: ['/api/oi/issues', issueId] });
  const { data: rca, isLoading: rcaLoading, isError: rcaNotFound } = useQuery<any>({
    queryKey: ['/api/oi/issues', issueId, 'rca'],
    retry: (count, err: any) => err?.status !== 404 && count < 2,
  });

  // Create RCA form state
  const [createForm, setCreateForm] = useState({ methodology: 'five_why', rootCauseCode: 'UNKNOWN', rootCauseSummary: '', assignedTo: '' });
  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/oi/issues/${issueId}/rca`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca'] }); toast({ title: 'RCA created' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // RCA field updates
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const patchMut = useMutation({
    mutationFn: (data: any) => apiRequest('PATCH', `/api/oi/issues/${issueId}/rca/${rca?.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca'] }); setEditingField(null); toast({ title: 'RCA updated' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // Workflow transitions
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const transitionMut = (endpoint: string, extraBody?: any) => useMutation({
    mutationFn: () => apiRequest('POST', `/api/oi/issues/${issueId}/rca/${rca?.id}/${endpoint}`, extraBody ?? {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca'] }); toast({ title: 'Status updated' }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const submitMut      = useMutation({ mutationFn: () => apiRequest('POST', `/api/oi/issues/${issueId}/rca/${rca?.id}/submit`, {}), onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca'] }); toast({ title: 'RCA submitted for review' }); }, onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }) });
  const startReviewMut = useMutation({ mutationFn: () => apiRequest('POST', `/api/oi/issues/${issueId}/rca/${rca?.id}/start-review`, {}), onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca'] }); toast({ title: 'Review started' }); }, onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }) });
  const approveMut     = useMutation({ mutationFn: () => apiRequest('POST', `/api/oi/issues/${issueId}/rca/${rca?.id}/approve`, {}), onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca'] }); toast({ title: 'RCA approved' }); }, onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }) });
  const rejectMut      = useMutation({ mutationFn: () => apiRequest('POST', `/api/oi/issues/${issueId}/rca/${rca?.id}/reject`, { rejection_reason: rejectReason }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca'] }); setRejectOpen(false); toast({ title: 'RCA rejected' }); }, onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }) });
  const reopenMut      = useMutation({ mutationFn: () => apiRequest('POST', `/api/oi/issues/${issueId}/rca/${rca?.id}/reopen`, {}), onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/oi/issues', issueId, 'rca'] }); toast({ title: 'RCA reopened' }); }, onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }) });

  if (!hasRole(userRole, MANAGER_ROLES)) {
    return (
      <div className="p-6">
        <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>You don't have access to view RCA records. Manager role or above required.</AlertDescription></Alert>
      </div>
    );
  }

  if (issueLoading) return <div className="p-6 text-muted-foreground">Loading issue…</div>;
  if (!issue) return <div className="p-6"><Alert variant="destructive"><AlertDescription>Issue not found.</AlertDescription></Alert></div>;

  const noRca = rcaNotFound || (!rcaLoading && !rca);
  const isCreator = rca && user?.id === rca.createdBy;
  const isAssignee = rca && user?.id === rca.assignedTo;
  const isSM = hasRole(userRole, SM_ROLES);

  // Determine which tabs to show
  const methodology = rca?.methodology ?? createForm.methodology;
  const showFiveWhy  = methodology === 'five_why' || methodology === 'combined';
  const showFishbone = methodology === 'fishbone' || methodology === 'combined';
  const showFtree    = methodology === 'failure_tree' || methodology === 'combined';

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {/* Issue Banner */}
        <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/oi/issues/${issueId}`)}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">{issue.issueNumber}</span>
              <Badge variant="outline" className="text-xs">{issue.severity}</Badge>
              <Badge variant="outline" className="text-xs">{issue.status}</Badge>
            </div>
            <p className="text-sm font-medium truncate">{issue.title}</p>
          </div>
          <div className="text-xs text-muted-foreground">Root Cause Analysis</div>
        </div>

        {/* No RCA yet — create form */}
        {noRca && (
          <Card>
            <CardHeader><CardTitle className="text-base">Start Root Cause Analysis</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Methodology</Label>
                <Select value={createForm.methodology} onValueChange={v => setCreateForm(p => ({ ...p, methodology: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(METHODOLOGY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Root Cause Code (can be updated later)</Label>
                <Select value={createForm.rootCauseCode} onValueChange={v => setCreateForm(p => ({ ...p, rootCauseCode: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROOT_CAUSE_CODES.map(c => <SelectItem key={c} value={c}>{ROOT_CAUSE_LABELS[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Initial Summary (optional)</Label>
                <Textarea value={createForm.rootCauseSummary} onChange={e => setCreateForm(p => ({ ...p, rootCauseSummary: e.target.value }))} placeholder="Initial description of root cause…" className="mt-1" rows={3} />
              </div>
              <Button onClick={() => createMut.mutate({ methodology: createForm.methodology, rootCauseCode: createForm.rootCauseCode, rootCauseSummary: createForm.rootCauseSummary })} disabled={createMut.isPending}>
                Create RCA
              </Button>
            </CardContent>
          </Card>
        )}

        {/* RCA exists */}
        {rca && (
          <>
            {/* Status Header */}
            <div className="flex items-center justify-between flex-wrap gap-3 p-3 border rounded-lg bg-card">
              <div className="flex items-center gap-3">
                <RcaStatusBadge status={rca.status} />
                <Badge variant="outline">{METHODOLOGY_LABELS[rca.methodology] ?? rca.methodology}</Badge>
                <span className="text-xs text-muted-foreground">Rev {rca.revisionNumber}</span>
                {rca.assignedToName && <span className="text-xs text-muted-foreground">Assigned: {rca.assignedToName}</span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {/* Submit */}
                {rca.status === 'draft' && (isCreator || isAssignee || isSM) && (
                  <Button size="sm" onClick={() => submitMut.mutate()} disabled={submitMut.isPending}><CheckCircle className="h-4 w-4 mr-1" />Submit for Review</Button>
                )}
                {/* Start Review */}
                {rca.status === 'submitted' && isSM && (
                  <Button size="sm" variant="outline" onClick={() => startReviewMut.mutate()} disabled={startReviewMut.isPending}><Clock className="h-4 w-4 mr-1" />Start Review</Button>
                )}
                {/* Approve */}
                {rca.status === 'under_review' && isSM && user?.id !== rca.assignedTo && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}><CheckCircle className="h-4 w-4 mr-1" />Approve</Button>
                )}
                {/* Reject */}
                {(rca.status === 'submitted' || rca.status === 'under_review') && isSM && (
                  <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}><AlertCircle className="h-4 w-4 mr-1" />Reject</Button>
                )}
                {/* Reopen */}
                {rca.status === 'rejected' && (isCreator || isAssignee || isSM) && (
                  <Button size="sm" variant="outline" onClick={() => reopenMut.mutate()} disabled={reopenMut.isPending}>Reopen</Button>
                )}
              </div>
            </div>

            {/* Rejection Reason Alert */}
            {rca.status === 'rejected' && rca.rejectionReason && (
              <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription><strong>Rejection Reason:</strong> {rca.rejectionReason}</AlertDescription></Alert>
            )}

            {/* Approved Banner */}
            {rca.status === 'approved' && (
              <Alert className="border-green-200 bg-green-50"><CheckCircle className="h-4 w-4 text-green-600" /><AlertDescription className="text-green-700">RCA approved on {fmtDateTime(rca.approvedAt)}.</AlertDescription></Alert>
            )}

            {/* Tabs */}
            <Tabs defaultValue="overview">
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {showFiveWhy  && <TabsTrigger value="five-why">5 Why</TabsTrigger>}
                {showFishbone && <TabsTrigger value="fishbone">Fishbone</TabsTrigger>}
                {showFtree    && <TabsTrigger value="failure-tree">Failure Tree</TabsTrigger>}
                <TabsTrigger value="evidence">Evidence {rca.evidenceCount > 0 && `(${rca.evidenceCount})`}</TabsTrigger>
                <TabsTrigger value="similar">Similar Issues</TabsTrigger>
                <TabsTrigger value="correlations">Correlations</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                {/* Root Cause Code */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Root Cause Code</Label>
                    {rca.status === 'draft' || rca.status === 'rejected' ? (
                      <Select value={rca.rootCauseCode} onValueChange={v => patchMut.mutate({ rootCauseCode: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROOT_CAUSE_CODES.map(c => <SelectItem key={c} value={c}>{ROOT_CAUSE_LABELS[c]}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm font-medium mt-1">{ROOT_CAUSE_LABELS[rca.rootCauseCode as keyof typeof ROOT_CAUSE_LABELS] ?? rca.rootCauseCode}</p>
                    )}
                    {rca.rootCauseCode === 'UNKNOWN' && <p className="text-xs text-amber-600 mt-1"><AlertTriangle className="inline h-3 w-3 mr-1" />Must be set before approval</p>}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Methodology</Label>
                    <p className="text-sm font-medium mt-1">{METHODOLOGY_LABELS[rca.methodology] ?? rca.methodology} <span className="text-xs text-muted-foreground">(immutable)</span></p>
                  </div>
                </div>

                {/* Root Cause Summary */}
                <div>
                  <Label className="text-xs text-muted-foreground">Root Cause Summary <span className="text-muted-foreground">(min 20 chars for submission)</span></Label>
                  {rca.status === 'draft' || rca.status === 'rejected' ? (
                    <div className="mt-1">
                      <Textarea
                        defaultValue={rca.rootCauseSummary}
                        onBlur={e => { if (e.target.value !== rca.rootCauseSummary) patchMut.mutate({ rootCauseSummary: e.target.value }); }}
                        rows={4}
                        placeholder="Describe the root cause in detail…"
                        className={rca.rootCauseSummary?.length < 20 ? 'border-amber-400' : ''}
                      />
                      <p className="text-xs text-muted-foreground mt-1">{(rca.rootCauseSummary ?? '').length} chars</p>
                    </div>
                  ) : (
                    <p className="text-sm mt-1 whitespace-pre-wrap">{rca.rootCauseSummary || <span className="text-muted-foreground italic">Not provided</span>}</p>
                  )}
                </div>

                {/* Additional fields */}
                {(['contributingFactors','immediateCause','underlyingCause','systemicCause'] as const).map(field => {
                  const labels: Record<string, string> = { contributingFactors: 'Contributing Factors', immediateCause: 'Immediate Cause', underlyingCause: 'Underlying Cause', systemicCause: 'Systemic Cause' };
                  const val = rca[field];
                  if (rca.status !== 'draft' && rca.status !== 'rejected' && !val) return null;
                  return (
                    <div key={field}>
                      <Label className="text-xs text-muted-foreground">{labels[field]}</Label>
                      {rca.status === 'draft' || rca.status === 'rejected' ? (
                        <Textarea
                          defaultValue={val ?? ''}
                          onBlur={e => { if (e.target.value !== (val ?? '')) patchMut.mutate({ [field]: e.target.value || null }); }}
                          rows={2}
                          className="mt-1"
                          placeholder="Optional…"
                        />
                      ) : (
                        <p className="text-sm mt-1 whitespace-pre-wrap">{val || <span className="text-muted-foreground italic">Not provided</span>}</p>
                      )}
                    </div>
                  );
                })}

                {/* Assignment (SM+ only) */}
                {isSM && (
                  <>
                    <Separator />
                    <div className="grid gap-4 sm:grid-cols-3">
                      {(['assignedTo','reviewerId','approverId'] as const).map(field => {
                        const labels: Record<string, string> = { assignedTo: 'Assigned To', reviewerId: 'Reviewer', approverId: 'Approver' };
                        const nameField: Record<string, string> = { assignedTo: 'assignedToName', reviewerId: 'reviewerName', approverId: 'approverName' };
                        return (
                          <div key={field}>
                            <Label className="text-xs text-muted-foreground">{labels[field]}</Label>
                            <p className="text-sm mt-1">{rca[nameField[field]] ?? <span className="italic text-muted-foreground">Unassigned</span>}</p>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </TabsContent>

              {showFiveWhy && <TabsContent value="five-why" className="mt-4"><FiveWhyTab rcaId={rca.id} issueId={issueId} rca={rca} /></TabsContent>}
              {showFishbone && <TabsContent value="fishbone" className="mt-4"><FishboneTab rcaId={rca.id} issueId={issueId} rca={rca} /></TabsContent>}
              {showFtree && <TabsContent value="failure-tree" className="mt-4"><FailureTreeTab rcaId={rca.id} issueId={issueId} rca={rca} /></TabsContent>}
              <TabsContent value="evidence" className="mt-4"><EvidenceTab rcaId={rca.id} issueId={issueId} rca={rca} userRole={userRole} /></TabsContent>
              <TabsContent value="similar" className="mt-4"><SimilarIssuesTab issueId={issueId} /></TabsContent>
              <TabsContent value="correlations" className="mt-4"><CorrelationsTab issueId={issueId} userRole={userRole} /></TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject RCA</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Rejection Reason (min 10 chars)</Label>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4} placeholder="Explain why this RCA is being rejected…" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectMut.mutate()} disabled={rejectReason.length < 10 || rejectMut.isPending}>Reject RCA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
