import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Loader2, Search, Plus, ChevronRight, ChevronDown,
  Send, Eye, ShieldCheck, Lock, RotateCcw, XCircle,
  GitBranch, Edit2, Trash2, AlertCircle, Package,
} from "lucide-react";

// ── Role helpers ──────────────────────────────────────────────────────────────
const RL: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};
const rl = (r?: string) => RL[r ?? ""] ?? 999;
const isManager       = (r?: string) => rl(r) <= 3;
const isSeniorManager = (r?: string) => rl(r) <= 2;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; cls: string }> = {
  draft:        { label: "Draft",        cls: "bg-slate-100 text-slate-700 border border-slate-200" },
  under_review: { label: "Under Review", cls: "bg-amber-100 text-amber-800 border border-amber-200" },
  released:     { label: "Released",     cls: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
  locked:       { label: "Locked",       cls: "bg-purple-100 text-purple-800 border border-purple-200" },
  superseded:   { label: "Superseded",   cls: "bg-orange-100 text-orange-800 border border-orange-200" },
  canceled:     { label: "Cancelled",    cls: "bg-red-100 text-red-700 border border-red-200" },
};

const LINE_STATUS: Record<string, { label: string; cls: string }> = {
  open:                { label: "Open",          cls: "bg-slate-100 text-slate-600" },
  selected:            { label: "Selected",      cls: "bg-blue-100 text-blue-800" },
  datasheet_submitted: { label: "DS Submitted",  cls: "bg-amber-100 text-amber-800" },
  approved:            { label: "Approved",      cls: "bg-emerald-100 text-emerald-800" },
  canceled:            { label: "Cancelled",     cls: "bg-red-100 text-red-700" },
};

const EMPTY_LINE = {
  buyGroupId: "", buySubgroupId: "", uomId: "",
  genericRequirement: "", quantity: "1",
  requiredDate: "", specification: "",
  tagNo: "", equipmentReference: "", serviceDescription: "",
  selectionRequired: true, datasheetRequired: false,
  inspectionRequired: false, certificateRequired: false, complianceRequired: false,
  notes: "",
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EpcBuyListControlPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const role = (user as any)?.role as string | undefined;
  const userId = (user as any)?.id as number | undefined;
  const canWrite  = isManager(role);
  const canAction = isSeniorManager(role);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showAllRevisions, setShowAllRevisions] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Dialogs
  const [showCreate, setShowCreate]           = useState(false);
  const [actionDialog, setActionDialog]       = useState<{ open: boolean; listId: number; action: string } | null>(null);
  const [actionNote, setActionNote]           = useState("");
  const [reviewRec, setReviewRec]             = useState("approve");
  const [lineDialog, setLineDialog]           = useState<{ open: boolean; listId: number; status: string; editLine: any | null } | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({ projectItemId: "", sourcePackageId: "" });

  // Line form
  const [lf, setLf] = useState({ ...EMPTY_LINE });

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });

  const { data: buyLists = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "buy-lists", showAllRevisions],
    queryFn: () =>
      fetch(`/api/projects/${selectedProjectId}/buy-lists?allRevisions=${showAllRevisions}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedProjectId,
  });

  const { data: projectItems = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "items"],
    queryFn: () =>
      fetch(`/api/projects/${selectedProjectId}/items`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedProjectId,
  });

  const { data: packages = [] } = useQuery<any[]>({
    queryKey: ["/api/buy-packages", "active"],
    queryFn: () =>
      fetch(`/api/buy-packages?status=active`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: groups = [] } = useQuery<any[]>({ queryKey: ["/api/buy-groups"] });

  const { data: subgroups = [] } = useQuery<any[]>({
    queryKey: ["/api/buy-groups", lf.buyGroupId, "subgroups"],
    queryFn: () =>
      fetch(`/api/buy-groups/${lf.buyGroupId}/subgroups`, { credentials: "include" }).then(r => r.json()),
    enabled: !!lf.buyGroupId,
  });

  const { data: uoms = [] } = useQuery<any[]>({ queryKey: ["/api/uom-master"] });

  const { data: expandedLines = [], isLoading: linesLoading } = useQuery<any[]>({
    queryKey: ["/api/buy-lists", expandedId, "lines"],
    queryFn: () =>
      fetch(`/api/buy-lists/${expandedId}/lines`, { credentials: "include" }).then(r => r.json()),
    enabled: expandedId !== null,
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = buyLists;
    if (statusFilter !== "all") list = list.filter(h => h.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(h =>
        (h.list_number ?? "").toLowerCase().includes(q) ||
        (h.project_item_code ?? "").toLowerCase().includes(q) ||
        (h.project_item_description ?? "").toLowerCase().includes(q) ||
        (h.source_package_code ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [buyLists, statusFilter, search]);

  const stats = useMemo(() => {
    const cur = buyLists.filter(h => h.is_current);
    return {
      total: cur.length,
      draft: cur.filter(h => h.status === "draft").length,
      under_review: cur.filter(h => h.status === "under_review").length,
      released: cur.filter(h => h.status === "released").length,
      locked: cur.filter(h => h.status === "locked").length,
    };
  }, [buyLists]);

  // ── Invalidation ─────────────────────────────────────────────────────────
  const invalidateLists = () => queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "buy-lists"] });
  const invalidateLines = (listId: number) => {
    queryClient.invalidateQueries({ queryKey: ["/api/buy-lists", listId, "lines"] });
    invalidateLists();
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createList = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/projects/${selectedProjectId}/buy-lists`, body),
    onSuccess: () => { toast({ title: "Buy list created" }); invalidateLists(); setShowCreate(false); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const doAction = useMutation({
    mutationFn: ({ listId, action, body }: { listId: number; action: string; body: any }) =>
      apiRequest("POST", `/api/buy-lists/${listId}/${action}`, body),
    onSuccess: () => { toast({ title: "Action completed" }); invalidateLists(); setActionDialog(null); setActionNote(""); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addLine = useMutation({
    mutationFn: ({ listId, body }: { listId: number; body: any }) =>
      apiRequest("POST", `/api/buy-lists/${listId}/lines`, body),
    onSuccess: () => { toast({ title: "Line added" }); if (expandedId) invalidateLines(expandedId); setLineDialog(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const patchLine = useMutation({
    mutationFn: ({ lineId, body }: { lineId: number; body: any }) =>
      apiRequest("PATCH", `/api/buy-list-lines/${lineId}`, body),
    onSuccess: () => { toast({ title: "Line updated" }); if (expandedId) invalidateLines(expandedId); setLineDialog(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLine = useMutation({
    mutationFn: (lineId: number) => apiRequest("DELETE", `/api/buy-list-lines/${lineId}`, undefined),
    onSuccess: () => { toast({ title: "Line deleted" }); if (expandedId) invalidateLines(expandedId); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  function openAction(listId: number, action: string) {
    setActionNote(""); setReviewRec("approve");
    setActionDialog({ open: true, listId, action });
  }

  function submitAction() {
    if (!actionDialog) return;
    const { listId, action } = actionDialog;
    let body: any = {};
    if (action === "submit-for-review") body = { submissionNote: actionNote };
    else if (action === "review") body = { recommendation: reviewRec, reviewNote: actionNote };
    else if (action === "release") body = { releaseNote: actionNote };
    else if (action === "cancel") body = { cancelReason: actionNote };
    else if (action === "supersede") body = { supersessionReason: actionNote };
    doAction.mutate({ listId, action, body });
  }

  function openAddLine(listId: number, status: string) {
    setLf({ ...EMPTY_LINE });
    setLineDialog({ open: true, listId, status, editLine: null });
  }

  function openEditLine(listId: number, status: string, line: any) {
    setLf({
      buyGroupId: String(line.buy_group_id), buySubgroupId: String(line.buy_subgroup_id),
      uomId: String(line.uom_id), genericRequirement: line.generic_requirement,
      quantity: String(line.quantity), requiredDate: line.required_date ?? "",
      specification: line.specification ?? "", tagNo: line.tag_no ?? "",
      equipmentReference: line.equipment_reference ?? "", serviceDescription: line.service_description ?? "",
      selectionRequired: line.selection_required, datasheetRequired: line.datasheet_required,
      inspectionRequired: line.inspection_required, certificateRequired: line.certificate_required,
      complianceRequired: line.compliance_required, notes: line.notes ?? "",
    });
    setLineDialog({ open: true, listId, status, editLine: line });
  }

  function submitLine() {
    if (!lineDialog) return;
    if (!lf.buyGroupId || !lf.buySubgroupId || !lf.uomId || !lf.genericRequirement) {
      toast({ title: "Group, subgroup, UOM and generic requirement are required", variant: "destructive" }); return;
    }
    const body = {
      buyGroupId: Number(lf.buyGroupId), buySubgroupId: Number(lf.buySubgroupId),
      uomId: Number(lf.uomId), genericRequirement: lf.genericRequirement.trim(),
      quantity: parseFloat(lf.quantity) || 1,
      requiredDate: lf.requiredDate || null, specification: lf.specification || null,
      tagNo: lf.tagNo.trim(), equipmentReference: lf.equipmentReference.trim(),
      serviceDescription: lf.serviceDescription.trim(),
      selectionRequired: lf.selectionRequired, datasheetRequired: lf.datasheetRequired,
      inspectionRequired: lf.inspectionRequired, certificateRequired: lf.certificateRequired,
      complianceRequired: lf.complianceRequired, notes: lf.notes || null,
    };
    if (lineDialog.editLine) {
      patchLine.mutate({ lineId: lineDialog.editLine.id, body });
    } else {
      addLine.mutate({ listId: lineDialog.listId, body });
    }
  }

  // ── Action label/icon map ─────────────────────────────────────────────────
  const ACTION_META: Record<string, { label: string; icon: any; needsNote: boolean; noteLabel: string; senior?: boolean }> = {
    "submit-for-review": { label: "Submit for Review", icon: Send, needsNote: false, noteLabel: "Submission Note" },
    "revert-to-draft":   { label: "Revert to Draft",   icon: RotateCcw, needsNote: false, noteLabel: "" },
    "review":            { label: "Record Review",     icon: Eye, needsNote: true, noteLabel: "Review Note" },
    "release":           { label: "Release",           icon: ShieldCheck, needsNote: false, noteLabel: "Release Note", senior: true },
    "lock":              { label: "Lock",              icon: Lock, needsNote: false, noteLabel: "", senior: true },
    "cancel":            { label: "Cancel",            icon: XCircle, needsNote: true, noteLabel: "Cancel Reason", senior: true },
    "supersede":         { label: "Supersede",         icon: GitBranch, needsNote: true, noteLabel: "Supersession Reason", senior: true },
  };

  function getAvailableActions(lst: any): string[] {
    const actions: string[] = [];
    const st = lst.status;
    if (st === "draft" && canWrite) actions.push("submit-for-review");
    if (st === "under_review" && canWrite) {
      actions.push("revert-to-draft");
      if (lst.submitted_by !== userId) actions.push("review");
    }
    if (st === "under_review" && canAction && lst.reviewed_by) actions.push("release");
    if (st === "released" && canAction) { actions.push("lock"); actions.push("supersede"); }
    if (st === "locked" && canAction) actions.push("supersede");
    if (["draft", "under_review"].includes(st) && canAction) actions.push("cancel");
    return actions;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">BUY List Control</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Project procurement buy lists — Phase 2 · PPPC</p>
          </div>
          {canWrite && selectedProjectId && (
            <Button onClick={() => { setCreateForm({ projectItemId: "", sourcePackageId: "" }); setShowCreate(true); }}>
              <Plus className="h-4 w-4 mr-2" />New Buy List
            </Button>
          )}
        </div>

        {/* Project selector */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1 w-72">
                <Label className="text-xs">Project</Label>
                <Select
                  value={selectedProjectId ? String(selectedProjectId) : ""}
                  onValueChange={(v) => { setSelectedProjectId(Number(v)); setExpandedId(null); }}
                >
                  <SelectTrigger><SelectValue placeholder="Select a project…" /></SelectTrigger>
                  <SelectContent>
                    {(projects as any[]).map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.code} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 w-40">
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {Object.entries(STATUS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 flex-1 min-w-48">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="List number, item code…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer pb-1">
                <Checkbox checked={showAllRevisions} onCheckedChange={v => setShowAllRevisions(!!v)} />
                Show all revisions
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Stats bar */}
        {selectedProjectId && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Total", value: stats.total, cls: "text-foreground" },
              { label: "Draft", value: stats.draft, cls: "text-slate-600" },
              { label: "Under Review", value: stats.under_review, cls: "text-amber-700" },
              { label: "Released", value: stats.released, cls: "text-emerald-700" },
              { label: "Locked", value: stats.locked, cls: "text-purple-700" },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-3 pb-3 text-center">
                  <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Table */}
        {!selectedProjectId ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">Select a project to view buy lists.</CardContent></Card>
        ) : isLoading ? (
          <Card><CardContent className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">No buy lists found.</CardContent></Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>List Number</TableHead>
                  <TableHead>Project Item</TableHead>
                  <TableHead>Source Package</TableHead>
                  <TableHead>Rev</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Lines</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(lst => (
                  <Fragment key={lst.id}>
                    {/* Header row */}
                    <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => setExpandedId(expandedId === lst.id ? null : lst.id)}>
                      <TableCell>
                        {expandedId === lst.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-semibold">{lst.list_number}</TableCell>
                      <TableCell>
                        <div className="text-xs font-medium">{lst.project_item_code ?? "—"}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-48">{lst.project_item_description ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{lst.source_package_code ?? <span className="italic">Manual</span>}</TableCell>
                      <TableCell className="font-mono text-xs">{lst.revision_code}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS[lst.status]?.cls ?? ""}`}>
                          {STATUS[lst.status]?.label ?? lst.status}
                        </span>
                        {!lst.is_current && (
                          <span className="ml-1 text-[10px] text-muted-foreground italic">old</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-medium">{lst.line_count}</span>
                        {lst.incomplete_lines > 0 && (
                          <AlertCircle className="inline ml-1 h-3.5 w-3.5 text-amber-500" title={`${lst.incomplete_lines} incomplete line(s)`} />
                        )}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-1">
                          {getAvailableActions(lst).map(action => {
                            const m = ACTION_META[action];
                            const Icon = m.icon;
                            return (
                              <Button key={action} size="sm" variant="outline" className="h-7 text-xs px-2"
                                onClick={() => openAction(lst.id, action)}>
                                <Icon className="h-3.5 w-3.5 mr-1" />{m.label}
                              </Button>
                            );
                          })}
                          {lst.status === "draft" && canWrite && (
                            <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                              onClick={() => openAddLine(lst.id, lst.status)}>
                              <Plus className="h-3.5 w-3.5 mr-1" />Add Line
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded lines */}
                    {expandedId === lst.id && (
                      <TableRow>
                        <TableCell colSpan={8} className="p-0 bg-muted/20">
                          {linesLoading ? (
                            <div className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
                          ) : expandedLines.length === 0 ? (
                            <div className="py-6 text-center text-muted-foreground text-sm">No lines yet.</div>
                          ) : (
                            <div className="p-4">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50">
                                    <TableHead className="text-xs">#</TableHead>
                                    <TableHead className="text-xs">Group / Subgroup</TableHead>
                                    <TableHead className="text-xs">Requirement</TableHead>
                                    <TableHead className="text-xs">Tag No</TableHead>
                                    <TableHead className="text-xs">Equip. Ref</TableHead>
                                    <TableHead className="text-xs">Service Desc</TableHead>
                                    <TableHead className="text-xs text-center">Qty</TableHead>
                                    <TableHead className="text-xs">Status</TableHead>
                                    {lst.status === "draft" && canWrite && <TableHead className="text-xs">Actions</TableHead>}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {expandedLines.map((line: any) => (
                                    <TableRow key={line.id}>
                                      <TableCell className="text-xs font-mono">{line.line_number}</TableCell>
                                      <TableCell className="text-xs">
                                        <div className="font-medium">{line.buy_group_code}</div>
                                        <div className="text-muted-foreground">{line.buy_subgroup_code}</div>
                                      </TableCell>
                                      <TableCell className="text-xs max-w-40 truncate">{line.generic_requirement}</TableCell>
                                      <TableCell className="text-xs font-mono">
                                        {line.tag_no || <span className="text-amber-600 italic">missing</span>}
                                      </TableCell>
                                      <TableCell className="text-xs truncate max-w-32">
                                        {line.equipment_reference || <span className="text-amber-600 italic">missing</span>}
                                      </TableCell>
                                      <TableCell className="text-xs truncate max-w-32">
                                        {line.service_description || <span className="text-amber-600 italic">missing</span>}
                                      </TableCell>
                                      <TableCell className="text-xs text-center">{line.quantity} {line.uom_code}</TableCell>
                                      <TableCell>
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${LINE_STATUS[line.status]?.cls ?? ""}`}>
                                          {LINE_STATUS[line.status]?.label ?? line.status}
                                        </span>
                                      </TableCell>
                                      {lst.status === "draft" && canWrite && (
                                        <TableCell>
                                          <div className="flex gap-1">
                                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                              onClick={() => openEditLine(lst.id, lst.status, line)}>
                                              <Edit2 className="h-3 w-3" />
                                            </Button>
                                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                                              onClick={() => deleteLine.mutate(line.id)}>
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* ── Create Buy List Dialog ─────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New BUY List</DialogTitle>
            <DialogDescription>Create a project procurement list, optionally from a standard package.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Project Item <span className="text-red-500">*</span></Label>
              <Select value={createForm.projectItemId} onValueChange={v => setCreateForm(f => ({ ...f, projectItemId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select project item…" /></SelectTrigger>
                <SelectContent>
                  {(projectItems as any[]).filter((pi: any) => pi.make_or_buy === "Buy" || !pi.make_or_buy).map((pi: any) => (
                    <SelectItem key={pi.id} value={String(pi.id)}>
                      {pi.item_code ?? pi.product_code} — {pi.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Copy From Package <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Select value={createForm.sourcePackageId} onValueChange={v => setCreateForm(f => ({ ...f, sourcePackageId: v }))}>
                <SelectTrigger><SelectValue placeholder="None — create blank list" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None — blank list</SelectItem>
                  {(packages as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.package_code} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">If a package is selected, all its lines will be copied into this list.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createList.mutate({
              projectItemId: Number(createForm.projectItemId),
              sourcePackageId: createForm.sourcePackageId ? Number(createForm.sourcePackageId) : undefined,
            })} disabled={!createForm.projectItemId || createList.isPending}>
              {createList.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lifecycle Action Dialog ────────────────────────────────────────── */}
      {actionDialog && (
        <Dialog open={actionDialog.open} onOpenChange={() => setActionDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{ACTION_META[actionDialog.action]?.label}</DialogTitle>
              <DialogDescription>
                {actionDialog.action === "cancel" && "This cannot be undone for released lists."}
                {actionDialog.action === "supersede" && "A new draft revision will be created with all lines copied."}
                {actionDialog.action === "review" && "Record your review recommendation."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {actionDialog.action === "review" && (
                <div className="space-y-1.5">
                  <Label>Recommendation <span className="text-red-500">*</span></Label>
                  <Select value={reviewRec} onValueChange={setReviewRec}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approve">Approve</SelectItem>
                      <SelectItem value="approve_with_comments">Approve with Comments</SelectItem>
                      <SelectItem value="reject">Reject</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {ACTION_META[actionDialog.action]?.needsNote && (
                <div className="space-y-1.5">
                  <Label>{ACTION_META[actionDialog.action].noteLabel} {["cancel", "supersede"].includes(actionDialog.action) && <span className="text-red-500">*</span>}</Label>
                  <Textarea value={actionNote} onChange={e => setActionNote(e.target.value)} rows={3} />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
              <Button onClick={submitAction} disabled={doAction.isPending ||
                (["cancel", "supersede"].includes(actionDialog.action) && !actionNote.trim())}>
                {doAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Line Dialog ────────────────────────────────────────────────────── */}
      {lineDialog && (
        <Dialog open={lineDialog.open} onOpenChange={() => setLineDialog(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{lineDialog.editLine ? "Edit Line" : "Add Line"}</DialogTitle>
              <DialogDescription>All tag, equipment, and service fields must be filled before submission.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              {/* Buy Group */}
              <div className="space-y-1.5">
                <Label>Buy Group <span className="text-red-500">*</span></Label>
                <Select value={lf.buyGroupId} onValueChange={v => setLf(f => ({ ...f, buyGroupId: v, buySubgroupId: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Select group…" /></SelectTrigger>
                  <SelectContent>
                    {(groups as any[]).map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.code} — {g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Buy Subgroup */}
              <div className="space-y-1.5">
                <Label>Buy Subgroup <span className="text-red-500">*</span></Label>
                <Select value={lf.buySubgroupId} onValueChange={v => setLf(f => ({ ...f, buySubgroupId: v }))} disabled={!lf.buyGroupId}>
                  <SelectTrigger><SelectValue placeholder="Select subgroup…" /></SelectTrigger>
                  <SelectContent>
                    {(subgroups as any[]).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.code} — {s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* UOM */}
              <div className="space-y-1.5">
                <Label>UOM <span className="text-red-500">*</span></Label>
                <Select value={lf.uomId} onValueChange={v => setLf(f => ({ ...f, uomId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select UOM…" /></SelectTrigger>
                  <SelectContent>
                    {(uoms as any[]).map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.code} — {u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Quantity */}
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" min="0.01" step="0.01" value={lf.quantity}
                  onChange={e => setLf(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              {/* Generic Requirement */}
              <div className="col-span-2 space-y-1.5">
                <Label>Generic Requirement <span className="text-red-500">*</span></Label>
                <Textarea value={lf.genericRequirement} onChange={e => setLf(f => ({ ...f, genericRequirement: e.target.value }))} rows={2} />
              </div>
              {/* Tag No */}
              <div className="space-y-1.5">
                <Label>Tag No</Label>
                <Input placeholder="e.g. P-101A" value={lf.tagNo}
                  onChange={e => setLf(f => ({ ...f, tagNo: e.target.value }))} />
              </div>
              {/* Required Date */}
              <div className="space-y-1.5">
                <Label>Required Date</Label>
                <Input type="date" value={lf.requiredDate}
                  onChange={e => setLf(f => ({ ...f, requiredDate: e.target.value }))} />
              </div>
              {/* Equipment Reference */}
              <div className="col-span-2 space-y-1.5">
                <Label>Equipment Reference</Label>
                <Input placeholder="Parent equipment or system reference" value={lf.equipmentReference}
                  onChange={e => setLf(f => ({ ...f, equipmentReference: e.target.value }))} />
              </div>
              {/* Service Description */}
              <div className="col-span-2 space-y-1.5">
                <Label>Service Description</Label>
                <Input placeholder="Process service description" value={lf.serviceDescription}
                  onChange={e => setLf(f => ({ ...f, serviceDescription: e.target.value }))} />
              </div>
              {/* Specification */}
              <div className="col-span-2 space-y-1.5">
                <Label>Specification</Label>
                <Textarea value={lf.specification} onChange={e => setLf(f => ({ ...f, specification: e.target.value }))} rows={2} />
              </div>
              {/* Flags */}
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground mb-2 block">Requirements</Label>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    ["selectionRequired", "Selection Required"],
                    ["datasheetRequired", "Datasheet Required"],
                    ["inspectionRequired", "Inspection Required"],
                    ["certificateRequired", "Certificate Required"],
                    ["complianceRequired", "Compliance Required"],
                  ] as [keyof typeof lf, string][]).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={lf[key] as boolean}
                        onCheckedChange={v => setLf(f => ({ ...f, [key]: !!v }))} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              {/* Notes */}
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={lf.notes} onChange={e => setLf(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLineDialog(null)}>Cancel</Button>
              <Button onClick={submitLine} disabled={addLine.isPending || patchLine.isPending}>
                {(addLine.isPending || patchLine.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {lineDialog.editLine ? "Save Changes" : "Add Line"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Layout>
  );
}
