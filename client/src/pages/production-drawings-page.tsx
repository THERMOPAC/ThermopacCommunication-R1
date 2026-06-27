import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getProjectDisplayName } from "@/lib/project-utils";
import { fmtDate } from "@/lib/date-format";
import { useQuery } from "@tanstack/react-query";
import { fetchWithProjectAccess, apiRequest } from "@/lib/queryClient";
import { useProjectFilter } from "@/hooks/use-project-filter";
import { Checkbox } from "@/components/ui/checkbox";
import Layout from "@/components/layout";
import EpcDocumentPanel from "@/components/epc-document-panel";
import DrawingEngineeringChanges from "@/components/drawing-engineering-changes";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProjectAccessDenied, isProjectAccessDenied } from "@/components/project-access-denied";
import {
  Loader2, Search, Filter, ChevronDown, ChevronRight,
  RefreshCw, FileText, UploadCloud, FileX, HardHat,
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  draft:           "bg-slate-100 text-slate-700 border-slate-300",
  under_review:    "bg-blue-100 text-blue-700 border-blue-300",
  approved:        "bg-emerald-100 text-emerald-700 border-emerald-300",
  released:        "bg-green-100 text-green-700 border-green-300",
  superseded:      "bg-orange-100 text-orange-600 border-orange-300",
  cancelled:       "bg-red-50 text-red-500 border-red-200",
  canceled:        "bg-red-50 text-red-500 border-red-200",
  on_hold_pending_cancellation_review: "bg-amber-100 text-amber-800 border-amber-400",
  pending_upload:  "bg-amber-100 text-amber-700 border-amber-400",
  file_not_available: "bg-gray-100 text-gray-500 border-gray-300",
};

const STATUS_LABELS: Record<string, string> = {
  pending_upload:  "Awaiting Upload",
  file_not_available: "No File",
  on_hold_pending_cancellation_review: "On Hold (Cancellation)",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] || status?.replace(/_/g, " ");
  const Icon = status === "pending_upload" ? UploadCloud : status === "file_not_available" ? FileX : null;
  return (
    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600 border-gray-300"}`}>
      {Icon && <Icon className="h-2.5 w-2.5 mr-0.5 inline" />}
      {label}
    </Badge>
  );
}

function GateBadge({ label, active, required }: { label: string; active: boolean; required: boolean }) {
  if (!required) return <span className="text-[8px] text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={`text-[8px] px-1 py-0 border ${active ? "bg-green-50 text-green-600 border-green-200" : "bg-yellow-50 text-yellow-600 border-yellow-200"}`}>
      {label} {active ? "✓" : "○"}
    </Badge>
  );
}

type DrawingControl = {
  id: number;
  dwg_control_number: string;
  revision_code: string;
  is_current: boolean;
  status: string;
  project_id: number;
  drawing_number: string | null;
  drawing_title: string | null;
  drawing_category: string | null;
  discipline_code: string | null;
  item_code: string | null;
  item_description: string | null;
  classification_snapshot: string | null;
  drawing_purpose: string | null;
  procurement_release_required: boolean;
  manufacturing_release_required: boolean;
  released_for_procurement: boolean;
  released_for_manufacturing: boolean;
  released_for_procurement_at: string | null;
  released_for_manufacturing_at: string | null;
  client_approval_required: boolean;
  client_approval_status: string | null;
  client_approved_at: string | null;
  notes: string | null;
  created_at: string;
  submitted_at: string | null;
  supersedes_id: number | null;
  attachment_count: number;
  product_p1_label?: string | null;
  product_p2_label?: string | null;
  product_p3?: string | null;
  assigned_to_name?: string | null;
};

function useActiveAttachment(projectId: number | null, parentEntityId: number | null) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/projects", projectId, "epc-documents", "DWG", parentEntityId, "attachments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/epc-documents/DWG/${parentEntityId}/attachments`);
      return res as any;
    },
    enabled: !!projectId && !!parentEntityId,
  });
  const revisions: any[] = data?.revisions || [];
  const currentRev = revisions.find((r: any) => r.isCurrent);
  const revisionCode: string | null = currentRev?.revisionCode ?? null;
  return { revisionCode, isLoading };
}

function RevBadge({ projectId, parentEntityId, isCurrent, fallback }: {
  projectId: number; parentEntityId: number; isCurrent: boolean; fallback?: string;
}) {
  const { revisionCode, isLoading } = useActiveAttachment(projectId, parentEntityId);
  const display = isLoading ? "…" : (revisionCode || fallback || "—");
  return (
    <div className="flex items-center justify-center gap-1">
      <Badge variant="outline" className="text-[8px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">{display}</Badge>
      {isCurrent
        ? <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" title="Current" />
        : <span className="h-1.5 w-1.5 rounded-full bg-orange-400 inline-block" title="Superseded" />}
    </div>
  );
}

function RevInlineBadge({ projectId, parentEntityId, isCurrent, fallback }: {
  projectId: number; parentEntityId: number; isCurrent: boolean; fallback?: string;
}) {
  const { revisionCode, isLoading } = useActiveAttachment(projectId, parentEntityId);
  const display = isLoading ? "…" : (revisionCode || fallback || "—");
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-[9px]">{display}</span>
      {isCurrent
        ? <span className="text-green-600 text-[9px] font-semibold">· current</span>
        : <span className="text-orange-500 text-[9px]">· superseded</span>}
    </div>
  );
}

// Roles permitted to raise an ECR from the Production Drawings page
const PRODUCTION_ECR_ROLES = new Set(['Superuser', 'General Manager', 'Senior Manager', 'Manager']);

export default function ProductionDrawingsPage() {
  const { user } = useAuth();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllRevisions, setShowAllRevisions] = useState(false);
  const [filterMfgReleased, setFilterMfgReleased] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<Set<number>>(new Set());

  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { showAllProjects, setShowAllProjects, filteredProjects } = useProjectFilter(projects, projectId);

  const { data: drawingControls = [], isLoading, error: recordsError, refetch } = useQuery<DrawingControl[]>({
    queryKey: ["/api/projects", projectId, "drawing-controls"],
    queryFn: () => fetchWithProjectAccess(`/api/projects/${projectId}/drawing-controls`),
    enabled: !!projectId,
  });

  const filtered = useMemo(() => {
    let list = drawingControls;
    if (!showAllRevisions) list = list.filter(d => d.is_current);
    if (statusFilter !== "all") list = list.filter(d => d.status === statusFilter);
    if (filterMfgReleased === "yes") list = list.filter(d => d.released_for_manufacturing);
    if (filterMfgReleased === "no") list = list.filter(d => d.manufacturing_release_required && !d.released_for_manufacturing);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(d =>
        d.dwg_control_number?.toLowerCase().includes(term) ||
        d.drawing_number?.toLowerCase().includes(term) ||
        d.item_code?.toLowerCase().includes(term) ||
        d.item_description?.toLowerCase().includes(term) ||
        d.drawing_title?.toLowerCase().includes(term)
      );
    }
    return list;
  }, [drawingControls, showAllRevisions, statusFilter, filterMfgReleased, searchTerm]);

  const stats = useMemo(() => {
    const all = showAllRevisions ? drawingControls : drawingControls.filter(d => d.is_current);
    return {
      total:       all.length,
      released:    all.filter(d => d.status === "released").length,
      approved:    all.filter(d => d.status === "approved").length,
      under_review: all.filter(d => d.status === "under_review").length,
      draft:       all.filter(d => d.status === "draft").length,
      superseded:  all.filter(d => d.status === "superseded").length,
    };
  }, [drawingControls, showAllRevisions]);

  return (
    <Layout>
      <TooltipProvider>
        <div className="p-4 space-y-4">

          {/* ── Header ── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <HardHat className="h-5 w-5" /> Production Drawings
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Released and available drawings for the production team — read-only view
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={projectId?.toString() || ""} onValueChange={(v) => { setProjectId(parseInt(v)); setExpandedId(null); }}>
                <SelectTrigger className="w-[600px] h-8 text-xs">
                  <SelectValue placeholder="Select project..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()} className="text-xs">
                      {getProjectDisplayName(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <Checkbox id="showAllProjects" checked={showAllProjects} onCheckedChange={(v) => setShowAllProjects(!!v)} className="h-3.5 w-3.5" />
                <label htmlFor="showAllProjects" className="text-[10px] text-muted-foreground cursor-pointer select-none">Show All</label>
              </div>
              <Button size="sm" variant="outline" className="h-8" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {!projectId ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Select a project to view drawings.</CardContent></Card>
          ) : isProjectAccessDenied(recordsError) ? (
            <ProjectAccessDenied />
          ) : isLoading ? (
            <div className="py-12 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* ── Stats ── */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {([
                  { label: "Total",        value: stats.total,        color: "text-foreground" },
                  { label: "Released",     value: stats.released,     color: "text-green-600" },
                  { label: "Approved",     value: stats.approved,     color: "text-emerald-600" },
                  { label: "Under Review", value: stats.under_review, color: "text-blue-600" },
                  { label: "Draft",        value: stats.draft,        color: "text-slate-500" },
                  { label: "Superseded",   value: stats.superseded,   color: "text-orange-500" },
                ] as const).map((s) => (
                  <Card key={s.label} className="shadow-sm cursor-pointer hover:bg-muted/20"
                    onClick={() => setStatusFilter(s.label === "Total" ? "all" : s.label.toLowerCase().replace(" ", "_"))}>
                    <CardContent className="py-2 px-3 text-center">
                      <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-[9px] text-muted-foreground">{s.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ── Filters ── */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="pl-7 h-8 text-xs w-[220px]" placeholder="Search DWG#, drawing#, item..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs w-[140px]"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                    {["draft", "under_review", "approved", "released", "superseded", "canceled"].map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterMfgReleased} onValueChange={setFilterMfgReleased}>
                  <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Mfg. Release: All</SelectItem>
                    <SelectItem value="yes" className="text-xs">Mfg. Release: Released ✓</SelectItem>
                    <SelectItem value="no" className="text-xs">Mfg. Release: Pending</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 ml-2">
                  <Switch id="allRevs" checked={showAllRevisions} onCheckedChange={setShowAllRevisions} className="scale-75" />
                  <Label htmlFor="allRevs" className="text-[10px] text-muted-foreground cursor-pointer">All Revisions</Label>
                </div>
              </div>

              {/* ── Table ── */}
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] w-6 px-1"></TableHead>
                        <TableHead className="text-[10px] px-2 whitespace-nowrap">DWG Control #</TableHead>
                        <TableHead className="text-[10px] px-2 whitespace-nowrap">Drawing No</TableHead>
                        <TableHead className="text-[10px] text-center w-10 px-1 whitespace-nowrap">Rev</TableHead>
                        <TableHead className="text-[10px] px-2 whitespace-nowrap">Item</TableHead>
                        <TableHead className="text-[10px] px-2 whitespace-nowrap">Product Identity</TableHead>
                        <TableHead className="text-[10px] text-center w-[72px] px-1">Status</TableHead>
                        <TableHead className="text-[10px] text-center w-[62px] px-1">Mfg.</TableHead>
                        <TableHead className="text-[10px] w-[58px] px-2">Purpose</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">No drawings found.</TableCell></TableRow>
                      ) : filtered.map((rec) => {
                        const isExpanded = expandedId === rec.id;
                        return (
                          <TooltipProvider key={rec.id}>
                            <TableRow
                              className={`cursor-pointer hover:bg-muted/30 ${isExpanded ? "bg-muted/20" : ""} ${!rec.is_current ? "opacity-60" : ""}`}
                              onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                            >
                              <TableCell className="py-1 px-1">
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </TableCell>
                              <TableCell className="text-[10px] font-mono font-medium py-1 px-2 whitespace-nowrap">{rec.dwg_control_number}</TableCell>
                              <TableCell className="text-[10px] font-semibold py-1 px-2 whitespace-nowrap">
                                {rec.drawing_number || <span className="text-muted-foreground italic font-normal">—</span>}
                              </TableCell>
                              <TableCell className="text-center py-1 px-1">
                                <RevBadge projectId={projectId!} parentEntityId={rec.id} isCurrent={rec.is_current} fallback={rec.revision_code} />
                              </TableCell>
                              <TableCell className="text-[10px] py-1 px-2 whitespace-nowrap">
                                <div title={rec.item_description || ""}>{rec.item_code}</div>
                              </TableCell>
                              <TableCell className="text-[10px] py-1 px-2 whitespace-nowrap">
                                {(() => {
                                  const identity = [rec.product_p1_label, rec.product_p2_label, rec.product_p3].filter(Boolean).join(' ');
                                  return identity
                                    ? <div className="text-blue-600 font-semibold">{identity}</div>
                                    : <span className="text-muted-foreground italic">—</span>;
                                })()}
                              </TableCell>
                              <TableCell className="text-center py-1 px-1"><StatusBadge status={rec.status} /></TableCell>
                              <TableCell className="text-center py-1 px-1">
                                <GateBadge label="M" active={rec.released_for_manufacturing} required={rec.manufacturing_release_required} />
                              </TableCell>
                              <TableCell className="text-[10px] py-1 px-2 capitalize">{rec.drawing_purpose || "—"}</TableCell>
                            </TableRow>

                            {/* ── Expanded row ── */}
                            {isExpanded && (
                              <TableRow className="bg-muted/10">
                                <TableCell colSpan={9} className="p-3">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">

                                    {/* ════ LEFT ════ */}
                                    <div className="space-y-3">

                                      {/* Drawing Summary */}
                                      <Card className="shadow-sm">
                                        <CardContent className="px-3 pt-2.5 pb-2.5 space-y-2">
                                          <div className="flex items-start gap-1.5">
                                            <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-mono text-[11px] font-bold text-foreground">{rec.drawing_number || rec.dwg_control_number}</span>
                                                <Badge variant="outline" className="text-[8px] h-4 px-1 font-normal">{rec.status.replace(/_/g, " ")}</Badge>
                                              </div>
                                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                {rec.item_code && <span className="text-[9px] text-muted-foreground font-mono">{rec.item_code}</span>}
                                                <RevInlineBadge projectId={projectId!} parentEntityId={rec.id} isCurrent={rec.is_current} fallback={rec.revision_code} />
                                              </div>
                                              {rec.drawing_title && (
                                                <div className="text-[10px] font-medium leading-snug mt-0.5 text-foreground/80 truncate" title={rec.drawing_title}>{rec.drawing_title}</div>
                                              )}
                                              {(rec.product_p1_label || rec.product_p2_label || rec.product_p3) && (
                                                <div className="text-[12px] text-blue-600 font-bold mt-0.5 leading-snug truncate"
                                                  title={[rec.product_p1_label, rec.product_p2_label, rec.product_p3].filter(Boolean).join(' ')}>
                                                  {[rec.product_p1_label, rec.product_p2_label, rec.product_p3].filter(Boolean).join(' ')}
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
                                            {rec.drawing_purpose && <><div className="text-muted-foreground">Purpose</div><div className="truncate capitalize">{rec.drawing_purpose}</div></>}
                                            {rec.classification_snapshot && <><div className="text-muted-foreground">Classification</div><div className="truncate">{rec.classification_snapshot}</div></>}
                                            {rec.discipline_code && <><div className="text-muted-foreground">Discipline</div><div>{rec.discipline_code}</div></>}
                                            {rec.drawing_category && <><div className="text-muted-foreground">Category</div><div>{rec.drawing_category}</div></>}
                                            <div className="text-muted-foreground">Created</div>
                                            <div>{fmtDate(rec.created_at)}</div>
                                            {rec.submitted_at && <><div className="text-muted-foreground">Submitted</div><div>{fmtDate(rec.submitted_at)}</div></>}
                                          </div>

                                          {/* Release gates summary */}
                                          <div>
                                            <div className="text-[9px] text-muted-foreground font-medium mb-0.5">Release Gates</div>
                                            <div className="flex flex-wrap gap-1">
                                              {rec.manufacturing_release_required ? (
                                                <span className={`text-[8px] px-1.5 py-0.5 rounded border font-medium ${rec.released_for_manufacturing ? "bg-green-50 text-green-700 border-green-300" : "bg-orange-50 text-orange-600 border-orange-300"}`}>
                                                  Mfg. · {rec.released_for_manufacturing ? `✓ ${rec.released_for_manufacturing_at ? fmtDate(rec.released_for_manufacturing_at) : "released"}` : "pending"}
                                                </span>
                                              ) : (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-400 border-gray-200">Mfg. · n/a</span>
                                              )}
                                              {rec.procurement_release_required ? (
                                                <span className={`text-[8px] px-1.5 py-0.5 rounded border font-medium ${rec.released_for_procurement ? "bg-green-50 text-green-700 border-green-300" : "bg-orange-50 text-orange-600 border-orange-300"}`}>
                                                  Proc. · {rec.released_for_procurement ? `✓ ${rec.released_for_procurement_at ? fmtDate(rec.released_for_procurement_at) : "released"}` : "pending"}
                                                </span>
                                              ) : (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-400 border-gray-200">Proc. · n/a</span>
                                              )}
                                            </div>
                                          </div>

                                          {/* Show audit detail toggle */}
                                          <div>
                                            <button
                                              type="button"
                                              className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors w-full"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDetailsOpen(prev => {
                                                  const next = new Set(prev);
                                                  if (next.has(rec.id)) next.delete(rec.id); else next.add(rec.id);
                                                  return next;
                                                });
                                              }}
                                            >
                                              {detailsOpen.has(rec.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                              <span>{detailsOpen.has(rec.id) ? "Hide" : "Show"} notes · GCS</span>
                                            </button>
                                            {detailsOpen.has(rec.id) && (
                                              <div className="mt-1.5 space-y-1 pl-1 text-[9px] text-muted-foreground">
                                                {rec.notes && !rec.notes.startsWith("Supersedes Rev") && (
                                                  <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-amber-800">{rec.notes}</div>
                                                )}
                                                {rec.supersedes_id && (
                                                  <div className="bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-800">
                                                    {rec.notes?.startsWith("Supersedes Rev") ? rec.notes : `Supersedes drawing #${rec.supersedes_id}`}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </CardContent>
                                      </Card>

                                      {/* DWG Attachments — download-only (userRole="readonly" suppresses upload) */}
                                      <EpcDocumentPanel
                                        projectId={projectId!}
                                        docType="DWG"
                                        parentEntityId={rec.id}
                                        documentNumber={rec.dwg_control_number}
                                        parentStatus={rec.status}
                                        userRole="readonly"
                                      />
                                    </div>

                                    {/* ════ RIGHT ════ */}
                                    <div className="space-y-3">
                                      {/* Engineering Changes — ECR creation allowed for permitted Production roles */}
                                      <DrawingEngineeringChanges
                                        drawingControlId={rec.id}
                                        dwgControlNumber={rec.dwg_control_number}
                                        revisionCode={rec.revision_code}
                                        userRole={PRODUCTION_ECR_ROLES.has(user?.role ?? '') ? (user?.role ?? 'readonly') : 'readonly'}
                                        drawingStatus={rec.status}
                                      />
                                    </div>

                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </TooltipProvider>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </TooltipProvider>
    </Layout>
  );
}
