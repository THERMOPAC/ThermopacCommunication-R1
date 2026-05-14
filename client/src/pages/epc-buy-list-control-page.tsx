import { useState, useMemo, Fragment, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Loader2, Search, Plus, ChevronRight, ChevronDown,
  Send, Eye, ShieldCheck, Lock, RotateCcw, XCircle,
  GitBranch, Edit2, Trash2, AlertCircle, Package,
  ClipboardList, ArrowRight, CheckCircle2, FileText,
  TrendingUp, UserCheck, XOctagon, Upload, Layers,
  RefreshCw, Zap, ArrowUpCircle, MinusCircle, PlusCircle,
  AlertTriangle, ShieldAlert, Info, FileSpreadsheet, Download, ArrowUpDown,
  ArrowUp, ArrowDown,
} from "lucide-react";
import { DatasheetPreviewDialog, downloadDatasheetPdf } from "@/components/buy-datasheet-dialog";
import { SUBGROUP_TA_FIELDS, type SubgroupField } from "@/lib/buy-subgroup-fields";
import {
  PUMP_SUBGROUP_CODES,
  validatePumpAttrs,
  CentrifugalPumpAttrsForm,
  GearPumpAttrsForm,
  ScrewPumpAttrsForm,
  MultistagePumpAttrsForm,
  DosingPumpAttrsForm,
  VacuumBoosterAttrsForm,
  PumpSkidAttrsForm,
  buildCentrifugalPumpDefaults,
  buildGearPumpDefaults,
  buildScrewPumpDefaults,
  buildMultistagePumpDefaults,
  buildDosingPumpDefaults,
  buildVacuumBoosterDefaults,
  buildPumpSkidDefaults,
} from "@/components/pump-attrs-forms";
import {
  PressureAttrsForm, TemperatureAttrsForm, FlowAttrsForm, LevelAttrsForm,
  INSTRUMENT_CABLE_GLAND_DEFAULTS, applyTemperatureDefaults,
} from "@/components/instrument-attrs-forms";
import {
  MotorAttrsForm,
  NON_FLAMEPROOF_MOTOR_DEFAULTS, FLAMEPROOF_MOTOR_DEFAULTS,
  applyNonFlameproofMotorDefaults, applyFlameproofMotorDefaults,
} from "@/components/motor-attrs-forms";
import {
  PanelAttrsForm, CablingAttrsForm, JunctionBoxAttrsForm,
  CoolingTowerAttrsForm, BoughtOutAttrsForm, ComponentsAttrsForm,
} from "@/components/electrical-attrs-forms";
import {
  ControlValveAttrsForm, SafetyValveAttrsForm, OnOffValveAttrsForm, IsolationValveAttrsForm,
  NrvValveAttrsForm, NeedleValveAttrsForm,
} from "@/components/valve-attrs-forms";
import {
  PlatesAttrsForm, PipesAttrsForm, FittingsAttrsForm, FlangesAttrsForm,
  FastenersAttrsForm, GasketsAttrsForm, StructuralSteelAttrsForm,
} from "@/components/piping-attrs-forms";

// ── Taggable subgroup codes (must match server/tag-generation-service.ts) ──────
const TAGGABLE_SUBGROUP_CODES = new Set([
  'pressure', 'temperature', 'flow', 'level',
  'isolation', 'control', 'safety', 'on_off',
  'pump_skid', 'centrifugal', 'gear', 'screw', 'multistage', 'dosing_metering', 'vacuum_boosters', 'vacuum_pump',
  'cooling_tower', 'junction_box',
  'non_flameproof', 'flameproof', 'motors',
]);


// ── Technical attributes section component ────────────────────────────────────
function TechnicalAttrsSection({
  subgroupCode, attrs, onChange,
}: {
  subgroupCode: string | null;
  attrs: Record<string, unknown>;
  onChange: (a: Record<string, unknown>) => void;
}) {
  const fields = subgroupCode ? (SUBGROUP_TA_FIELDS[subgroupCode] ?? []) : [];

  // Collect any extra keys already in attrs that aren't in the field list
  const knownKeys = new Set(fields.map(f => f.key));
  const extraKeys = Object.keys(attrs).filter(k => !knownKeys.has(k) && attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== "");

  if (fields.length === 0 && extraKeys.length === 0) return null;

  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  function renderField(f: SubgroupField) {
    const raw = attrs[f.key];
    // Arrays (e.g. approved_makes) → comma-separated string
    const strVal = Array.isArray(raw) ? (raw as string[]).join(", ") : String(raw ?? "");
    const inOpts  = f.opts?.includes(strVal) ?? false;
    const isCustom = strVal !== "" && f.opts && !inOpts;

    return (
      <div key={f.key} className={`space-y-1.5${f.colSpan ? " col-span-2" : ""}`}>
        <Label className="text-xs">{f.label}</Label>
        {f.type === "select" && f.opts ? (
          <Select
            value={inOpts ? strVal : (strVal ? "__custom__" : undefined)}
            onValueChange={(v) => {
              if (v !== "__custom__") {
                const updates: Record<string, unknown> = { [f.key]: v };
                if (f.cascade?.map[v]) updates[f.cascade.targetKey] = f.cascade.map[v];
                onChange({ ...attrs, ...updates });
              }
            }}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {f.opts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              <SelectItem value="__custom__">Other (type below)…</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        {(f.type !== "select" || isCustom) && (
          <Input
            className="h-8 text-sm"
            type={f.type === "number" ? "number" : "text"}
            value={strVal}
            placeholder={f.type === "select" ? "Custom value…" : `Enter ${f.label.toLowerCase()}…`}
            onChange={e => {
              const v = e.target.value;
              // Restore array for approved_makes
              if (f.key === "approved_makes") {
                set(f.key, v.split(",").map(s => s.trim()).filter(Boolean));
              } else {
                set(f.key, v);
              }
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="col-span-2 space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Technical Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(f => renderField(f))}
        {extraKeys.map(key => {
          const raw = attrs[key];
          const strVal = Array.isArray(raw) ? (raw as string[]).join(", ") : String(raw ?? "");
          return (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs capitalize">{key.replace(/_/g, " ")}</Label>
              <Input className="h-8 text-sm" value={strVal}
                onChange={e => set(key, e.target.value)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Role helpers ───────────────────────────────────────────────────────────────
const RL: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2, Manager: 3, "Senior Executive": 4, Employee: 5,
};
const rl = (r?: string) => RL[r ?? ""] ?? 999;
const isManager       = (r?: string) => rl(r) <= 3;
const isSeniorManager = (r?: string) => rl(r) <= 2;

// ── Status configs ─────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; cls: string }> = {
  draft:        { label: "Draft",        cls: "bg-slate-100 text-slate-700 border border-slate-200" },
  under_review: { label: "Under Review", cls: "bg-amber-100 text-amber-800 border border-amber-200" },
  approved:     { label: "Approved",     cls: "bg-teal-100 text-teal-800 border border-teal-200" },
  released:     { label: "Released",     cls: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
  locked:       { label: "Locked",       cls: "bg-purple-100 text-purple-800 border border-purple-200" },
  superseded:   { label: "Superseded",   cls: "bg-orange-100 text-orange-800 border border-orange-200" },
  canceled:     { label: "Cancelled",    cls: "bg-red-100 text-red-700 border border-red-200" },
};

const LINE_STATUS: Record<string, { label: string; cls: string }> = {
  open:                { label: "Open",         cls: "bg-slate-100 text-slate-600" },
  selected:            { label: "Selected",     cls: "bg-blue-100 text-blue-800" },
  datasheet_submitted: { label: "DS Submitted", cls: "bg-amber-100 text-amber-800" },
  approved:            { label: "Approved",     cls: "bg-emerald-100 text-emerald-800" },
  canceled:            { label: "Cancelled",    cls: "bg-red-100 text-red-700" },
  obsolete:            { label: "Obsolete",     cls: "bg-slate-200 text-slate-500 line-through" },
};

const PLN_STATUS: Record<string, { label: string; cls: string }> = {
  draft:        { label: "Draft",        cls: "bg-slate-100 text-slate-600" },
  under_review: { label: "Under Review", cls: "bg-amber-100 text-amber-800" },
  released:     { label: "Released",     cls: "bg-emerald-100 text-emerald-800" },
  canceled:     { label: "Cancelled",    cls: "bg-red-100 text-red-700" },
  superseded:   { label: "Superseded",   cls: "bg-orange-100 text-orange-800" },
};

// ── Stage badge for procurement chain ─────────────────────────────────────────
function StageBadge({ label, value, cls }: { label: string; value?: string | null; cls?: string }) {
  if (!value) return (
    <div className="flex flex-col items-center gap-0.5 min-w-16">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground/50 italic">—</span>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-16">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cls ?? "bg-slate-100 text-slate-700"}`}>
        {value}
      </span>
    </div>
  );
}

const SKID_OPTIONS = ["Skid-1","Skid-2","Skid-3","Skid-4","Skid-5","Skid-6","Skid-7","Skid-8","Skid-9","Skid-10"];

const EMPTY_LINE = {
  buyGroupId: "", buySubgroupId: "", uomId: "",
  genericRequirement: "", quantity: "1",
  requiredDate: "", specification: "",
  tagNo: "", equipmentReference: "", serviceDescription: "",
  selectionRequired: true, datasheetRequired: false,
  inspectionRequired: false, certificateRequired: false, complianceRequired: false,
  notes: "",
  technicalAttributes: {} as Record<string, unknown>,
  installedOn: "", model: "TBN",
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EpcBuyListControlPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const role    = (user as any)?.role as string | undefined;
  const userId  = (user as any)?.id as number | undefined;
  const canWrite  = isManager(role);
  const canAction = isSeniorManager(role);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupFilterId, setGroupFilterId] = useState<number | "all">("all");
  const [subgroupFilterId, setSubgroupFilterId] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [showAllRevisions, setShowAllRevisions] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [linesSortOrder, setLinesSortOrder] = useState<"default" | "subgroup_asc" | "subgroup_desc">("default");

  // Dialogs — lifecycle
  const [showCreate, setShowCreate]     = useState(false);
  const [actionDialog, setActionDialog] = useState<{ open: boolean; listId: number; action: string } | null>(null);
  const [actionNote, setActionNote]     = useState("");
  const [reviewRec, setReviewRec]       = useState("approve");

  // Line add/edit dialog
  const [lineDialog, setLineDialog] = useState<{ open: boolean; listId: number; status: string; editLine: any | null } | null>(null);
  const [lf, setLf] = useState({ ...EMPTY_LINE });

  // Create form
  const [createForm, setCreateForm] = useState({ projectItemId: "", sourcePackageId: "" });

  // Tag Number control state
  const [tagDuplicateWarning, setTagDuplicateWarning] = useState<string | null>(null);
  const [tagFetching, setTagFetching]                 = useState(false);
  const [tagPreview, setTagPreview]                   = useState<string[]>([]);
  const [tagAutoFilled, setTagAutoFilled]             = useState(false);

  // Phase 4 — procurement chain panel
  const [showProcChain, setShowProcChain] = useState<number | null>(null);

  // Phase 5 — selection card
  const [openSelLineId, setOpenSelLineId] = useState<number | null>(null);
  const [selForm, setSelForm] = useState({ masterItemId: "", drawingNumber: "", drawingRevision: "" });
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; lineId: number }>({ open: false, lineId: 0 });
  const [rejectReason, setRejectReason] = useState("");

  // Phase 5 — bulk ops
  const [checkedLines, setCheckedLines] = useState<Set<number>>(new Set());
  const [bulkSelDialog, setBulkSelDialog] = useState(false);
  const [bulkMasterItemId, setBulkMasterItemId] = useState("");

  // Confirm dialogs (replaces native browser confirm())
  const [confirmRemoveSel, setConfirmRemoveSel] = useState<number | null>(null);
  const [confirmBulkApprove, setConfirmBulkApprove] = useState<{ headerId: number; lineIds: number[] } | null>(null);
  const [confirmBulkRaisePr, setConfirmBulkRaisePr] = useState<{ headerId: number; lineIds: number[] } | null>(null);
  const [confirmDirectApprove, setConfirmDirectApprove] = useState<{ headerId: number; lineIds: number[] } | null>(null);

  // Datasheet preview
  const [datasheetLine, setDatasheetLine] = useState<any | null>(null);

  // Datasheet upload ref
  const dsInputRef = useRef<HTMLInputElement>(null);

  // ── PPPC Smart Action state ───────────────────────────────────────────────────
  const [pppcStatusLoading, setPppcStatusLoading] = useState(false);
  const [pppcStatusData, setPppcStatusData]       = useState<any | null>(null);
  const [pppcCurrentBanner, setPppcCurrentBanner] = useState(false);

  // Scenario 1 — Backfill dialog
  const [showBackfillDialog, setShowBackfillDialog] = useState(false);
  const [backfillRunning, setBackfillRunning]       = useState(false);

  // Scenario 2 — Diff sheet
  const [pppcDiffListId, setPppcDiffListId]     = useState<number | null>(null);
  const [pppcDiffData, setPppcDiffData]         = useState<any | null>(null);
  const [pppcDiffLoading, setPppcDiffLoading]   = useState(false);
  const [pppcDriftIdx, setPppcDriftIdx]         = useState(0);

  // Diff actions
  const [replaceConfirmText, setReplaceConfirmText] = useState("");
  const [replaceNote, setReplaceNote]               = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });

  const { data: projectItems = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "items"],
    queryFn: () =>
      fetch(`/api/projects/${selectedProjectId}/items`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedProjectId,
  });

  const { data: packages = [] } = useQuery<any[]>({
    queryKey: ["/api/buy-packages", "active"],
    queryFn: () => fetch(`/api/buy-packages?status=active`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: groups = [] } = useQuery<any[]>({ queryKey: ["/api/buy-groups"] });

  const { data: filterSubgroups = [] } = useQuery<any[]>({
    queryKey: ["/api/buy-groups", groupFilterId, "subgroups", "filter"],
    queryFn: () => fetch(`/api/buy-groups/${groupFilterId}/subgroups`, { credentials: "include" }).then(r => r.json()),
    enabled: groupFilterId !== "all",
  });

  const { data: subgroups = [] } = useQuery<any[]>({
    queryKey: ["/api/buy-groups", lf.buyGroupId, "subgroups"],
    queryFn: () =>
      fetch(`/api/buy-groups/${lf.buyGroupId}/subgroups`, { credentials: "include" }).then(r => r.json()),
    enabled: !!lf.buyGroupId,
  });

  const { data: uoms = [] } = useQuery<any[]>({ queryKey: ["/api/uom-master"] });

  // Resolve filter codes AFTER groups/filterSubgroups are declared — avoids temporal dead zone crash
  const activeGroupCode    = groupFilterId    !== "all" ? ((groups as any[]).find((g: any) => g.id === groupFilterId)?.code    ?? null) : null;
  const activeSubgroupCode = subgroupFilterId !== "all" ? ((filterSubgroups as any[]).find((s: any) => s.id === subgroupFilterId)?.code ?? null) : null;

  const { data: buyLists = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "buy-lists", showAllRevisions, statusFilter, activeGroupCode, activeSubgroupCode],
    queryFn: async () => {
      const HEADER_STATUSES = new Set(["draft", "under_review", "released", "locked", "superseded", "canceled"]);
      const params = new URLSearchParams({ allRevisions: String(showAllRevisions) });
      if (statusFilter !== "all" && HEADER_STATUSES.has(statusFilter)) params.set("status", statusFilter);
      if (activeGroupCode)         params.set("buyGroupCode",    activeGroupCode);
      if (activeSubgroupCode)      params.set("buySubgroupCode", activeSubgroupCode);
      return fetch(`/api/projects/${selectedProjectId}/buy-lists?${params.toString()}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: !!selectedProjectId,
  });

  const { data: expandedLines = [], isLoading: linesLoading } = useQuery<any[]>({
    queryKey: ["/api/buy-lists", expandedId, "lines"],
    queryFn: () =>
      fetch(`/api/buy-lists/${expandedId}/lines`, { credentials: "include" }).then(r => r.json()),
    enabled: expandedId !== null,
  });

  const sortedLines = useMemo(() => {
    if (linesSortOrder === "default") return expandedLines;
    return [...expandedLines].sort((a, b) => {
      const ka = `${a.buy_group_code ?? ""}|${a.buy_subgroup_code ?? ""}`;
      const kb = `${b.buy_group_code ?? ""}|${b.buy_subgroup_code ?? ""}`;
      const cmp = ka.localeCompare(kb);
      return linesSortOrder === "subgroup_asc" ? cmp : -cmp;
    });
  }, [expandedLines, linesSortOrder]);

  // Filter lines within expanded header by active group / subgroup / status
  const displayLines = useMemo(() => {
    let lines = sortedLines;
    if (activeGroupCode)    lines = lines.filter((l: any) => l.buy_group_code    === activeGroupCode);
    if (activeSubgroupCode) lines = lines.filter((l: any) => l.buy_subgroup_code === activeSubgroupCode);
    // Apply status filter at row level when the selected status is a valid line status
    if (statusFilter !== "all" && statusFilter in LINE_STATUS) {
      lines = lines.filter((l: any) => l.status === statusFilter);
    }
    return lines;
  }, [sortedLines, activeGroupCode, activeSubgroupCode, statusFilter]);

  function cycleSubgroupSort() {
    setLinesSortOrder(prev =>
      prev === "default" ? "subgroup_asc" : prev === "subgroup_asc" ? "subgroup_desc" : "default"
    );
  }

  // Phase 4 — procurement chain
  const { data: procChainData, isLoading: procChainLoading } = useQuery<{ lines: any[] }>({
    queryKey: ["/api/buy-lists", showProcChain, "procurement-status"],
    queryFn: () =>
      fetch(`/api/buy-lists/${showProcChain}/procurement-status`, { credentials: "include" }).then(r => r.json()),
    enabled: showProcChain !== null,
  });

  // Phase 5 — buy items for selection picker
  const { data: buyItems = [] } = useQuery<any[]>({
    queryKey: ["/api/pppc/buy-items"],
    staleTime: 5 * 60 * 1000,
  });

  // Phase 5 — selection record for open line (null = no selection)
  const { data: openSelData, isLoading: selLoading, error: selError } = useQuery<any>({
    queryKey: ["/api/buy-list-lines", openSelLineId, "selection"],
    queryFn: async () => {
      const r = await fetch(`/api/buy-list-lines/${openSelLineId}/selection`, { credentials: "include" });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    enabled: openSelLineId !== null,
    retry: false,
  });

  // ── Derived ──────────────────────────────────────────────────────────────────
  // Status, group, subgroup are filtered server-side; only search is client-side
  const filtered = useMemo(() => {
    let list = buyLists;
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
  }, [buyLists, search]);

  const stats = useMemo(() => {
    const cur = buyLists.filter(h => h.is_current);
    return {
      total:        cur.length,
      draft:        cur.filter(h => h.status === "draft").length,
      under_review: cur.filter(h => h.status === "under_review").length,
      released:     cur.filter(h => h.status === "released").length,
      locked:       cur.filter(h => h.status === "locked").length,
    };
  }, [buyLists]);

  // Current expanded buy list header
  const currentLst = useMemo(() => filtered.find(l => l.id === expandedId), [filtered, expandedId]);

  // Whether bulk ops are available (list is released or locked)
  const bulkAvailable = currentLst && ["released", "locked"].includes(currentLst.status);

  // ── Tag-control derived values ────────────────────────────────────────────────
  const selectedProject = useMemo(() =>
    (projects as any[]).find((p: any) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]);

  const currentGroupCode    = useMemo(() =>
    (groups as any[]).find(g => String(g.id) === String(lf.buyGroupId))?.code ?? null,
    [groups, lf.buyGroupId]);
  const currentSubgroupCode = useMemo(() =>
    (subgroups as any[]).find(s => String(s.id) === String(lf.buySubgroupId))?.code ?? null,
    [subgroups, lf.buySubgroupId]);
  const isRawMaterials = currentGroupCode === 'raw_materials';
  const lineQty        = Math.max(1, Math.round(parseFloat(String(lf.quantity || 1)) || 1));
  const isTaggable     = !isRawMaterials && TAGGABLE_SUBGROUP_CODES.has(currentSubgroupCode ?? '');
  const isQtySplit     = isTaggable && lineQty > 1;

  // ── Invalidation ─────────────────────────────────────────────────────────────
  const invalidateLists = () => queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "buy-lists"] });
  const invalidateLines = (listId: number) => {
    queryClient.invalidateQueries({ queryKey: ["/api/buy-lists", listId, "lines"] });
    invalidateLists();
  };
  const invalidateSel = (lineId: number) =>
    queryClient.invalidateQueries({ queryKey: ["/api/buy-list-lines", lineId, "selection"] });
  const invalidateProcChain = (listId: number) =>
    queryClient.invalidateQueries({ queryKey: ["/api/buy-lists", listId, "procurement-status"] });

  // ── Mutations ─────────────────────────────────────────────────────────────────

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
    onSuccess: (data: any) => {
      const count = data?.linesCreated ?? 1;
      if (count === 1) {
        toast({ title: "Line added", description: data?.tag_no ? `Tag: ${data.tag_no}` : undefined });
      } else {
        toast({
          title: `${count} tagged lines created`,
          description: `Tags: ${(data?.tags ?? []).join(' · ')}`,
        });
      }
      if (expandedId) invalidateLines(expandedId);
      setLineDialog(null);
    },
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

  // Phase 4 — Raise PR (single line)
  const raisePr = useMutation({
    mutationFn: (lineId: number) => apiRequest("POST", `/api/buy-list-lines/${lineId}/raise-pr`, {}),
    onSuccess: (data: any) => {
      const msg = data.isReused
        ? `Planning record created (project item reused). PLN: ${data.planningNumber ?? data.planningRecordId}`
        : `Planning record created. PLN: ${data.planningNumber ?? data.planningRecordId}`;
      toast({ title: "PR Raised", description: msg });
      if (expandedId) { invalidateLines(expandedId); invalidateProcChain(expandedId); }
    },
    onError: (e: any) => {
      const msg = e.message?.includes("409") || e.status === 409
        ? "Planning record already active for this line."
        : e.message;
      toast({ title: "Cannot Raise PR", description: msg, variant: "destructive" });
    },
  });

  // Phase 5 — Selection mutations
  const selectItem = useMutation({
    mutationFn: ({ lineId, body }: { lineId: number; body: any }) =>
      apiRequest("POST", `/api/buy-list-lines/${lineId}/select`, body),
    onSuccess: (_, { lineId }) => {
      toast({ title: "Item selected" });
      invalidateSel(lineId);
      if (expandedId) invalidateLines(expandedId);
    },
    onError: (e: any) => toast({ title: "Selection error", description: e.message, variant: "destructive" }),
  });

  const approveSelection = useMutation({
    mutationFn: (lineId: number) => apiRequest("POST", `/api/buy-list-lines/${lineId}/selection/approve`, {}),
    onSuccess: (_, lineId) => {
      toast({ title: "Selection approved" });
      invalidateSel(lineId);
      if (expandedId) invalidateLines(expandedId);
    },
    onError: (e: any) => toast({ title: "Approve error", description: e.message, variant: "destructive" }),
  });

  const rejectSelection = useMutation({
    mutationFn: ({ lineId, reason }: { lineId: number; reason: string }) =>
      apiRequest("POST", `/api/buy-list-lines/${lineId}/selection/reject`, { rejectionReason: reason }),
    onSuccess: (_, { lineId }) => {
      toast({ title: "Selection rejected" });
      setRejectDialog({ open: false, lineId: 0 }); setRejectReason("");
      invalidateSel(lineId);
      if (expandedId) invalidateLines(expandedId);
    },
    onError: (e: any) => toast({ title: "Reject error", description: e.message, variant: "destructive" }),
  });

  const deleteSelection = useMutation({
    mutationFn: (lineId: number) => apiRequest("DELETE", `/api/buy-list-lines/${lineId}/selection`, undefined),
    onSuccess: (_, lineId) => {
      toast({ title: "Selection removed" });
      invalidateSel(lineId);
      if (expandedId) invalidateLines(expandedId);
      setOpenSelLineId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const uploadDatasheet = useMutation({
    mutationFn: async ({ lineId, file }: { lineId: number; file: File }) => {
      const fd = new FormData();
      fd.append("datasheet", file);
      const r = await fetch(`/api/buy-list-lines/${lineId}/selection/upload-datasheet`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!r.ok) { const err = await r.json().catch(() => ({ error: r.statusText })); throw new Error(err.error ?? r.statusText); }
      return r.json();
    },
    onSuccess: (_, { lineId }) => {
      toast({ title: "Datasheet uploaded" });
      invalidateSel(lineId);
      if (expandedId) invalidateLines(expandedId);
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  // Phase 5 — Bulk mutations
  const bulkSelect = useMutation({
    mutationFn: ({ headerId, lines }: { headerId: number; lines: { lineId: number; masterItemId: number }[] }) =>
      apiRequest("POST", `/api/buy-lists/${headerId}/bulk-select`, { lines }),
    onSuccess: (data: any) => {
      toast({ title: `Bulk select done`, description: `${data.succeeded} succeeded, ${data.errors?.length ?? 0} errors` });
      setBulkSelDialog(false); setBulkMasterItemId(""); setCheckedLines(new Set());
      if (expandedId) invalidateLines(expandedId);
    },
    onError: (e: any) => toast({ title: "Bulk select error", description: e.message, variant: "destructive" }),
  });

  const bulkApprove = useMutation({
    mutationFn: ({ headerId, lineIds }: { headerId: number; lineIds: number[] }) =>
      apiRequest("POST", `/api/buy-lists/${headerId}/bulk-approve`, { lineIds }),
    onSuccess: (data: any) => {
      const errCount = data.errors?.length ?? 0;
      const skipCount = data.skipped ?? 0;
      if (errCount > 0) {
        const uniqueReasons = [...new Set((data.errors as any[]).map((e: any) => e.error))];
        const reasonText = uniqueReasons.join(" | ");
        toast({
          title: `Bulk approve: ${data.succeeded} approved, ${errCount} failed${skipCount ? `, ${skipCount} skipped` : ""}`,
          description: reasonText,
          variant: "destructive",
        });
      } else {
        toast({ title: `Bulk approve done`, description: `${data.succeeded} approved${skipCount ? `, ${skipCount} already approved` : ""}` });
      }
      setCheckedLines(new Set());
      if (expandedId) invalidateLines(expandedId);
    },
    onError: (e: any) => toast({ title: "Bulk approve error", description: e.message, variant: "destructive" }),
  });

  const bulkRaisePr = useMutation({
    mutationFn: ({ headerId, lineIds }: { headerId: number; lineIds: number[] }) =>
      apiRequest("POST", `/api/buy-lists/${headerId}/bulk-raise-pr`, { lineIds }),
    onSuccess: (data: any) => {
      const errCount = data.errors?.length ?? 0;
      if (errCount > 0) {
        const uniqueReasons = [...new Set((data.errors as any[]).map((e: any) => e.error))];
        toast({
          title: `Bulk raise PR: ${data.succeeded} raised, ${errCount} failed`,
          description: uniqueReasons.join(" | "),
          variant: "destructive",
        });
      } else {
        toast({ title: `Bulk raise PR done`, description: `${data.succeeded} PR(s) raised` });
      }
      setCheckedLines(new Set());
      if (expandedId) { invalidateLines(expandedId); invalidateProcChain(expandedId); }
    },
    onError: (e: any) => toast({ title: "Bulk raise-pr error", description: e.message, variant: "destructive" }),
  });

  const bulkDirectApprove = useMutation({
    mutationFn: ({ headerId, lineIds }: { headerId: number; lineIds: number[] }) =>
      apiRequest("POST", `/api/buy-lists/${headerId}/bulk-direct-approve`, { lineIds }),
    onSuccess: (data: any) => {
      const errCount = data.errors?.length ?? 0;
      const skipCount = data.skipped ?? 0;
      if (errCount > 0) {
        const uniqueReasons = [...new Set((data.errors as any[]).map((e: any) => e.error))];
        toast({
          title: `Select & Approve: ${data.succeeded} approved, ${errCount} failed${skipCount ? `, ${skipCount} skipped` : ""}`,
          description: uniqueReasons.join(" | "),
          variant: "destructive",
        });
      } else {
        toast({ title: `Select & Approve done`, description: `${data.succeeded} line${data.succeeded !== 1 ? "s" : ""} approved${skipCount ? `, ${skipCount} already approved` : ""}` });
      }
      setCheckedLines(new Set());
      if (expandedId) invalidateLines(expandedId);
    },
    onError: (e: any) => toast({ title: "Select & Approve error", description: e.message, variant: "destructive" }),
  });

  // ── PPPC Smart Action mutations ───────────────────────────────────────────────
  const doBackfill = useMutation({
    mutationFn: () => apiRequest("POST", `/api/projects/${selectedProjectId}/buy-lists/backfill`, { dryRun: false }),
    onSuccess: (data: any) => {
      toast({ title: `Buy lists generated`, description: `${data.created} created, ${data.errors} skipped/errors` });
      setShowBackfillDialog(false); setPppcStatusData(null);
      invalidateLists();
    },
    onError: (e: any) => toast({ title: "Backfill error", description: e.message, variant: "destructive" }),
  });

  const doSyncAdditions = useMutation({
    mutationFn: (listId: number) => apiRequest("POST", `/api/buy-lists/${listId}/sync-additions`, {}),
    onSuccess: (data: any) => {
      toast({ title: "Sync complete", description: `${data.addedLines} new line(s) added from ${data.latestPackageCode}` });
      setPppcDiffData(null); setPppcDiffListId(null);
      invalidateLists();
      if (expandedId) invalidateLines(expandedId);
    },
    onError: (e: any) => toast({ title: "Sync error", description: e.message, variant: "destructive" }),
  });

  const doMarkObsolete = useMutation({
    mutationFn: (lineId: number) => apiRequest("POST", `/api/buy-list-lines/${lineId}/mark-obsolete`, {}),
    onSuccess: (_, lineId) => {
      toast({ title: "Line marked obsolete" });
      if (pppcDiffListId) {
        // Refresh diff
        loadDiff(pppcDiffListId);
      }
      if (expandedId) invalidateLines(expandedId);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const doSyncCatalogChange = useMutation({
    mutationFn: ({ lineId, newPackageLineId }: { lineId: number; newPackageLineId: number }) =>
      apiRequest("POST", `/api/buy-list-lines/${lineId}/sync-catalog-change`, { newPackageLineId }),
    onSuccess: () => {
      toast({ title: "Catalog change applied" });
      if (pppcDiffListId) loadDiff(pppcDiffListId);
      if (expandedId) invalidateLines(expandedId);
    },
    onError: (e: any) => toast({ title: "Sync error", description: e.message, variant: "destructive" }),
  });

  const doReplaceFromPackage = useMutation({
    mutationFn: (listId: number) =>
      apiRequest("POST", `/api/buy-lists/${listId}/replace-from-package`, {
        confirmationText: replaceConfirmText, note: replaceNote,
      }),
    onSuccess: (data: any) => {
      toast({ title: "Full replacement done", description: `${data.linesSeeded} lines re-seeded from latest package` });
      setPppcDiffData(null); setPppcDiffListId(null); setReplaceConfirmText(""); setReplaceNote("");
      invalidateLists();
      if (expandedId) invalidateLines(expandedId);
    },
    onError: (e: any) => toast({ title: "Replace error", description: e.message, variant: "destructive" }),
  });

  // ── PPPC Smart Action handlers ────────────────────────────────────────────────
  async function checkPppcStatus() {
    if (!selectedProjectId) return;
    setPppcStatusLoading(true);
    try {
      const r = await fetch(`/api/projects/${selectedProjectId}/pppc-status`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setPppcStatusData(data);
      if (data.scenario === "current") {
        setPppcCurrentBanner(true);
        setTimeout(() => setPppcCurrentBanner(false), 4000);
      } else if (data.scenario === "backfill") {
        setShowBackfillDialog(true);
      } else if (data.scenario === "sync" && data.driftedLists?.length > 0) {
        setPppcDriftIdx(0);
        loadDiff(data.driftedLists[0].listId);
      }
    } catch (e: any) {
      toast({ title: "PPPC check failed", description: e.message, variant: "destructive" });
    } finally {
      setPppcStatusLoading(false);
    }
  }

  async function loadDiff(listId: number) {
    setPppcDiffLoading(true);
    setPppcDiffListId(listId);
    try {
      const r = await fetch(`/api/buy-lists/${listId}/package-diff`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setPppcDiffData(data);
    } catch (e: any) {
      toast({ title: "Diff load failed", description: e.message, variant: "destructive" });
      setPppcDiffData(null);
    } finally {
      setPppcDiffLoading(false);
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────
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
    setTagDuplicateWarning(null); setTagPreview([]); setTagAutoFilled(false); setTagFetching(false);
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
      installedOn: line.installed_on ?? "", model: (line as any).model ?? "TBN",
      technicalAttributes: (() => {
        const ta = (line.technical_attributes ?? {}) as Record<string, unknown>;
        const code = line.buy_subgroup_code as string;
        if (code === "non_flameproof") return applyNonFlameproofMotorDefaults(ta);
        if (code === "flameproof") return applyFlameproofMotorDefaults(ta);
        if (line.buy_group_code === "instruments") {
          if (code === "temperature") return applyTemperatureDefaults(ta);
          return { ...INSTRUMENT_CABLE_GLAND_DEFAULTS, ...ta };
        }
        if (code === "centrifugal") {
          const pumpType = (ta.pump_type as string) || "End Suction";
          return { ...buildCentrifugalPumpDefaults(pumpType), ...ta };
        }
        if (code === "gear") {
          const gearType = (ta.gear_type as string) || "External Gear";
          return { ...buildGearPumpDefaults(gearType), ...ta };
        }
        if (code === "screw") {
          const screwType = (ta.screw_type as string) || "Single Screw";
          return { ...buildScrewPumpDefaults(screwType), ...ta };
        }
        if (code === "multistage") {
          const msType = (ta.multistage_type as string) || "Horizontal Multistage";
          return { ...buildMultistagePumpDefaults(msType), ...ta };
        }
        if (code === "dosing_metering") {
          const pumpType = (ta.pump_type as string) || "Diaphragm Pump";
          return { ...buildDosingPumpDefaults(pumpType), ...ta };
        }
        if (code === "vacuum_boosters") {
          const boosterType = (ta.booster_type as string) || "Roots Blower";
          return { ...buildVacuumBoosterDefaults(boosterType), ...ta };
        }
        if (code === "pump_skid") {
          const pkgType = (ta.package_type as string) || "Single Pump Skid";
          return { ...buildPumpSkidDefaults(pkgType), ...ta };
        }
        return ta;
      })(),
    });
    setTagDuplicateWarning(null); setTagPreview([]); setTagAutoFilled(false); setTagFetching(false);
    setLineDialog({ open: true, listId, status, editLine: line });
  }

  function submitLine() {
    if (!lineDialog) return;
    if (!lf.buyGroupId || !lf.buySubgroupId || !lf.uomId || !lf.genericRequirement) {
      toast({ title: "Group, subgroup, UOM and requirement are required", variant: "destructive" }); return;
    }
    if (currentSubgroupCode && PUMP_SUBGROUP_CODES.has(currentSubgroupCode)) {
      const pumpErr = validatePumpAttrs(currentSubgroupCode, lf.technicalAttributes);
      if (pumpErr) { toast({ title: "Pump specification incomplete", description: pumpErr, variant: "destructive" }); return; }
    }
    if (!lf.model.trim()) {
      toast({ title: "Model is required", variant: "destructive" }); return;
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
      technicalAttributes: Object.keys(lf.technicalAttributes).length > 0 ? lf.technicalAttributes : undefined,
      installedOn: lf.installedOn || null,
      model: lf.model.trim() || "TBN",
    };
    if (lineDialog.editLine) {
      patchLine.mutate({ lineId: lineDialog.editLine.id, body });
    } else {
      addLine.mutate({ listId: lineDialog.listId, body });
    }
  }

  function toggleProcChain(listId: number) {
    setShowProcChain(prev => prev === listId ? null : listId);
  }

  // ── Tag auto-fetch effect (Add mode only: fires when subgroup or qty changes) ──
  useEffect(() => {
    if (!lineDialog || lineDialog.editLine) return;    // Add mode only
    if (!lf.buySubgroupId || !selectedProjectId) return;
    if (isRawMaterials) { setLf(f => ({ ...f, tagNo: '' })); setTagPreview([]); return; }
    if (!isTaggable || !currentSubgroupCode) { setTagPreview([]); return; }

    setTagFetching(true); setTagAutoFilled(false);
    const url = `/api/projects/${selectedProjectId}/next-tag-no?subgroupCode=${encodeURIComponent(currentSubgroupCode)}&qty=${lineQty}${lf.installedOn ? `&installedOn=${encodeURIComponent(lf.installedOn)}` : ''}`;
    fetch(url, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (lineQty === 1) {
          setLf(f => ({ ...f, tagNo: data.tagNo ?? '' }));
          setTagPreview([]);
          setTagAutoFilled(true);
        } else {
          setLf(f => ({ ...f, tagNo: '' }));
          setTagPreview(data.preview ?? []);
          setTagAutoFilled(false);
        }
      })
      .catch(() => {})
      .finally(() => setTagFetching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lf.buySubgroupId, lf.quantity, lf.installedOn, lineDialog?.editLine]);

  // ── Duplicate-check effect (debounced 500ms) ──────────────────────────────────
  useEffect(() => {
    setTagDuplicateWarning(null);
    if (!lf.tagNo || !selectedProjectId || isRawMaterials || isQtySplit) return;
    const timer = setTimeout(() => {
      const excludeId = lineDialog?.editLine?.id;
      const url = `/api/projects/${selectedProjectId}/check-tag-no?tagNo=${encodeURIComponent(lf.tagNo)}${excludeId ? `&excludeLineId=${excludeId}` : ''}`;
      fetch(url, { credentials: 'include' })
        .then(r => r.json())
        .then(data => { if (!data.unique) setTagDuplicateWarning(data.message ?? 'Tag No already exists in this project'); })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lf.tagNo, selectedProjectId]);

  function toggleSelCard(lineId: number) {
    if (openSelLineId === lineId) {
      setOpenSelLineId(null);
    } else {
      setOpenSelLineId(lineId);
      setSelForm({ masterItemId: "", drawingNumber: "", drawingRevision: "" });
    }
  }

  function toggleChecked(lineId: number) {
    setCheckedLines(prev => {
      const next = new Set(prev);
      next.has(lineId) ? next.delete(lineId) : next.add(lineId);
      return next;
    });
  }

  function toggleAllLines(lines: any[]) {
    const ids = lines.map((l: any) => l.id);
    const allChecked = ids.every(id => checkedLines.has(id));
    setCheckedLines(allChecked ? new Set() : new Set(ids));
  }

  function submitSelect(lineId: number) {
    if (!selForm.masterItemId) {
      toast({ title: "Select a master item", variant: "destructive" }); return;
    }
    selectItem.mutate({ lineId, body: {
      masterItemId: Number(selForm.masterItemId),
      drawingNumber: selForm.drawingNumber || undefined,
      drawingRevision: selForm.drawingRevision || undefined,
    }});
  }

  function submitBulkSelect() {
    if (!bulkMasterItemId || !expandedId) {
      toast({ title: "Select a master item first", variant: "destructive" }); return;
    }
    const lines = Array.from(checkedLines).map(id => ({ lineId: id, masterItemId: Number(bulkMasterItemId) }));
    bulkSelect.mutate({ headerId: expandedId, lines });
  }

  // ── Action label/icon map ──────────────────────────────────────────────────
  const ACTION_META: Record<string, { label: string; icon: any; needsNote: boolean; noteLabel: string; senior?: boolean }> = {
    "submit-for-review": { label: "Submit for Review", icon: Send,        needsNote: false, noteLabel: "Submission Note" },
    "revert-to-draft":   { label: "Revert to Draft",   icon: RotateCcw,   needsNote: false, noteLabel: "" },
    "review":            { label: "Record Review",     icon: Eye,         needsNote: true,  noteLabel: "Review Note" },
    "release":           { label: "Release",           icon: ShieldCheck, needsNote: false, noteLabel: "Release Note", senior: true },
    "lock":              { label: "Lock",              icon: Lock,        needsNote: false, noteLabel: "",             senior: true },
    "cancel":            { label: "Cancel",            icon: XCircle,     needsNote: true,  noteLabel: "Cancel Reason",      senior: true },
    "supersede":         { label: "Supersede",         icon: GitBranch,   needsNote: true,  noteLabel: "Supersession Reason", senior: true },
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

  // ── Selection card render ────────────────────────────────────────────────────
  function renderSelCard(line: any, lst: any) {
    const noSel     = openSelData === null && !selLoading;
    const hasSel    = openSelData && openSelData !== null;
    const selStatus = hasSel ? (openSelData.approval_status ?? "pending") : null;

    return (
      <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/60 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-900">
              Selection — Line {line.line_number} ({line.tag_no || "no tag"})
            </span>
            {hasSel && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                selStatus === "approved" ? "bg-emerald-100 text-emerald-800" :
                selStatus === "rejected" ? "bg-red-100 text-red-700" :
                "bg-amber-100 text-amber-800"
              }`}>
                {selStatus === "approved" ? "Approved" : selStatus === "rejected" ? "Rejected" : "Pending Approval"}
              </span>
            )}
          </div>
          <button
            onClick={() => setOpenSelLineId(null)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Close selection card"
          >
            <XOctagon className="h-4 w-4" />
          </button>
        </div>

        {selLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {/* ── No selection: show picker form ── */}
        {!selLoading && noSel && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">No item selected yet. Choose a buy-type master item below.</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 space-y-1">
                <Label className="text-xs">Master Item (Buy) <span className="text-red-500">*</span></Label>
                <Select value={selForm.masterItemId} onValueChange={v => setSelForm(f => ({ ...f, masterItemId: v }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Search and select an item…" />
                  </SelectTrigger>
                  <SelectContent>
                    {buyItems.length === 0 && (
                      <SelectItem value="_none" disabled>No buy items in master list</SelectItem>
                    )}
                    {(buyItems as any[]).map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.item_code} — {m.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Drawing Number</Label>
                <Input
                  className="h-8 text-xs"
                  value={selForm.drawingNumber}
                  onChange={e => setSelForm(f => ({ ...f, drawingNumber: e.target.value }))}
                  placeholder="DRW-001"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Drawing Revision</Label>
                <Input
                  className="h-8 text-xs"
                  value={selForm.drawingRevision}
                  onChange={e => setSelForm(f => ({ ...f, drawingRevision: e.target.value }))}
                  placeholder="Rev A"
                />
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  className="h-8 text-xs w-full gap-1"
                  disabled={!selForm.masterItemId || selectItem.isPending}
                  onClick={() => submitSelect(line.id)}
                >
                  {selectItem.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Submit Selection
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Existing selection: show details ── */}
        {!selLoading && hasSel && (
          <div className="space-y-3">
            {/* Selected item info */}
            <div className="rounded-md bg-white border p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground font-mono">{openSelData.item_code}</p>
                  <p className="text-xs text-muted-foreground">{openSelData.item_description}</p>
                  {openSelData.item_specification && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 italic">{openSelData.item_specification}</p>
                  )}
                </div>
                {selStatus !== "approved" && (
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700 shrink-0"
                    disabled={deleteSelection.isPending}
                    title="Remove selection"
                    onClick={() => setConfirmRemoveSel(line.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {(openSelData.drawing_number || openSelData.drawing_revision) && (
                <div className="flex gap-3 text-[11px] text-muted-foreground mt-1">
                  {openSelData.drawing_number && <span>DRW: <span className="font-mono">{openSelData.drawing_number}</span></span>}
                  {openSelData.drawing_revision && <span>Rev: <span className="font-mono">{openSelData.drawing_revision}</span></span>}
                </div>
              )}
            </div>

            {/* Rejection reason */}
            {selStatus === "rejected" && openSelData.rejection_reason && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                <span className="font-semibold">Rejected: </span>{openSelData.rejection_reason}
                <p className="mt-1 text-muted-foreground">Please remove this selection and submit a new item.</p>
              </div>
            )}

            {/* Datasheet section */}
            {openSelData.datasheet_required && selStatus !== "approved" && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">
                  Datasheet
                  {openSelData.datasheet_uploaded
                    ? <span className="ml-2 text-emerald-600 font-normal">✓ Uploaded (rev {openSelData.datasheet_revision_seq ?? 0})</span>
                    : <span className="ml-2 text-amber-600 font-normal">Required — not uploaded</span>
                  }
                </p>
                {selStatus !== "rejected" || openSelData.datasheet_uploaded ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={dsInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) uploadDatasheet.mutate({ lineId: line.id, file });
                        e.target.value = "";
                      }}
                    />
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs gap-1"
                      disabled={uploadDatasheet.isPending}
                      onClick={() => dsInputRef.current?.click()}
                    >
                      {uploadDatasheet.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Upload className="h-3.5 w-3.5" />}
                      {openSelData.datasheet_uploaded ? "Re-upload Datasheet" : "Upload Datasheet"}
                    </Button>
                    {openSelData.datasheet_original_filename && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-48">
                        {openSelData.datasheet_original_filename}
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Approved datasheet info */}
            {openSelData.datasheet_required && selStatus === "approved" && openSelData.datasheet_uploaded && (
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <FileText className="h-3.5 w-3.5" />
                Datasheet on file (rev {openSelData.datasheet_revision_seq ?? 0})
                {openSelData.datasheet_original_filename && (
                  <span className="text-muted-foreground">— {openSelData.datasheet_original_filename}</span>
                )}
              </div>
            )}

            {/* Approve / Reject actions (Manager+) */}
            {canAction && selStatus === "pending" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={approveSelection.isPending || (openSelData.datasheet_required && !openSelData.datasheet_uploaded)}
                  onClick={() => approveSelection.mutate(line.id)}
                >
                  {approveSelection.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Approve
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50"
                  disabled={rejectSelection.isPending}
                  onClick={() => setRejectDialog({ open: true, lineId: line.id })}
                >
                  <XOctagon className="h-3.5 w-3.5" /> Reject
                </Button>
                {openSelData.datasheet_required && !openSelData.datasheet_uploaded && (
                  <span className="text-[11px] text-amber-600 self-center">Datasheet needed before approval</span>
                )}
              </div>
            )}

            {/* Approved: Raise PR */}
            {selStatus === "approved" && !line.planning_record_id && ["released", "locked"].includes(lst.status) && (
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={raisePr.isPending}
                onClick={() => raisePr.mutate(line.id)}
              >
                {raisePr.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
                Raise PR
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">BUY List Control</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Project procurement buy lists · Phase 5 · PPPC</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* PPPC Current banner */}
            {pppcCurrentBanner && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium animate-pulse">
                <CheckCircle2 className="h-3.5 w-3.5" />
                PPPC Current — all package-matched items have up-to-date buy lists
              </div>
            )}
            {canWrite && selectedProjectId && (
              <Button
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-2"
                disabled={pppcStatusLoading || !selectedProjectId}
                onClick={checkPppcStatus}
              >
                {pppcStatusLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Zap className="h-4 w-4" />}
                Generate / Sync PPPC
              </Button>
            )}
          </div>
        </div>

        {/* Filters card */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1 w-72">
                <Label className="text-xs">Project</Label>
                <Select
                  value={selectedProjectId ? String(selectedProjectId) : ""}
                  onValueChange={(v) => { setSelectedProjectId(Number(v)); setExpandedId(null); setShowProcChain(null); setCheckedLines(new Set()); setOpenSelLineId(null); }}
                >
                  <SelectTrigger><SelectValue placeholder="Select a project…" /></SelectTrigger>
                  <SelectContent>
                    {(projects as any[]).map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.code} — {p.name}</SelectItem>
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
              <div className="space-y-1 w-44">
                <Label className="text-xs">Group</Label>
                <Select
                  value={groupFilterId === "all" ? "all" : String(groupFilterId)}
                  onValueChange={v => {
                    setGroupFilterId(v === "all" ? "all" : Number(v));
                    setSubgroupFilterId("all");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="All groups" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Groups</SelectItem>
                    {(groups as any[]).map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 w-44">
                <Label className="text-xs">Subgroup</Label>
                <Select
                  value={subgroupFilterId === "all" ? "all" : String(subgroupFilterId)}
                  onValueChange={v => setSubgroupFilterId(v === "all" ? "all" : Number(v))}
                  disabled={groupFilterId === "all"}
                >
                  <SelectTrigger><SelectValue placeholder={groupFilterId === "all" ? "Select group first" : "All subgroups"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subgroups</SelectItem>
                    {(filterSubgroups as any[]).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>
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
              { label: "Total",        value: stats.total,        cls: "text-foreground" },
              { label: "Draft",        value: stats.draft,        cls: "text-slate-600" },
              { label: "Under Review", value: stats.under_review, cls: "text-amber-700" },
              { label: "Released",     value: stats.released,     cls: "text-emerald-700" },
              { label: "Locked",       value: stats.locked,       cls: "text-purple-700" },
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

        {/* Main table */}
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
                    <TableRow
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => {
                        const newId = expandedId === lst.id ? null : lst.id;
                        setExpandedId(newId);
                        setOpenSelLineId(null);
                        setCheckedLines(new Set());
                        if (newId !== expandedId) setLinesSortOrder("default");
                      }}
                    >
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

                    {/* Expanded section */}
                    {expandedId === lst.id && (
                      <TableRow>
                        <TableCell colSpan={8} className="p-0 bg-muted/20">
                          {linesLoading ? (
                            <div className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
                          ) : expandedLines.length === 0 ? (
                            <div className="py-6 text-center text-muted-foreground text-sm">No lines yet.</div>
                          ) : (
                            <div className="p-4 space-y-4">

                              {/* ── Phase 5: Bulk toolbar ── */}
                              {bulkAvailable && checkedLines.size > 0 && (
                                <div className="flex items-center gap-2 p-2 rounded-md bg-blue-50 border border-blue-200">
                                  <Layers className="h-4 w-4 text-blue-600 shrink-0" />
                                  <span className="text-xs font-semibold text-blue-700">{checkedLines.size} line{checkedLines.size > 1 ? "s" : ""} selected</span>
                                  <div className="flex-1" />
                                  <Button
                                    size="sm" variant="outline"
                                    className="h-7 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-100"
                                    disabled={bulkSelect.isPending}
                                    onClick={() => setBulkSelDialog(true)}
                                  >
                                    <UserCheck className="h-3.5 w-3.5" /> Bulk Select
                                  </Button>
                                  {canAction && (
                                    <>
                                      <Button
                                        size="sm" variant="outline"
                                        className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                        disabled={bulkDirectApprove.isPending}
                                        onClick={() => {
                                          const checkedLineObjs = expandedLines.filter((l: any) => checkedLines.has(l.id));
                                          const blocked = checkedLineObjs.filter((l: any) => ["canceled", "obsolete"].includes(l.status));
                                          if (blocked.length > 0) {
                                            toast({ title: `${blocked.length} line${blocked.length > 1 ? "s are" : " is"} cancelled/obsolete`, description: "Only open, selected or DS-submitted lines can be approved.", variant: "destructive" });
                                            return;
                                          }
                                          setConfirmDirectApprove({ headerId: lst.id, lineIds: Array.from(checkedLines) });
                                        }}
                                      >
                                        {bulkDirectApprove.isPending
                                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          : <CheckCircle2 className="h-3.5 w-3.5" />}
                                        Select & Approve
                                      </Button>
                                      <Button
                                        size="sm" variant="outline"
                                        className="h-7 text-xs gap-1 border-slate-300 text-slate-600 hover:bg-slate-50"
                                        disabled={bulkApprove.isPending}
                                        onClick={() => {
                                          const checkedLineObjs = expandedLines.filter((l: any) => checkedLines.has(l.id));
                                          const noSelection = checkedLineObjs.filter((l: any) => l.status === "open");
                                          if (noSelection.length > 0) {
                                            toast({ title: `${noSelection.length} line${noSelection.length > 1 ? "s have" : " has"} no selection`, description: "Use Bulk Select to assign a master item first, then approve.", variant: "destructive" });
                                            return;
                                          }
                                          setConfirmBulkApprove({ headerId: lst.id, lineIds: Array.from(checkedLines) });
                                        }}
                                      >
                                        {bulkApprove.isPending
                                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          : <CheckCircle2 className="h-3.5 w-3.5" />}
                                        Bulk Approve
                                      </Button>
                                    </>
                                  )}
                                  <Button
                                    size="sm" variant="outline"
                                    className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                    disabled={bulkRaisePr.isPending}
                                    onClick={() => {
                                      const checkedLineObjs = expandedLines.filter((l: any) => checkedLines.has(l.id));
                                      const notApproved = checkedLineObjs.filter((l: any) => l.status !== "approved");
                                      if (notApproved.length > 0) {
                                        toast({
                                          title: `${notApproved.length} line${notApproved.length > 1 ? "s are" : " is"} not yet approved`,
                                          description: "Lines must be approved before a PR can be raised.",
                                          variant: "destructive",
                                        });
                                        return;
                                      }
                                      setConfirmBulkRaisePr({ headerId: lst.id, lineIds: Array.from(checkedLines) });
                                    }}
                                  >
                                    {bulkRaisePr.isPending
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <TrendingUp className="h-3.5 w-3.5" />}
                                    Bulk Raise PR
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-7 text-xs text-muted-foreground"
                                    onClick={() => setCheckedLines(new Set())}
                                  >
                                    Clear
                                  </Button>
                                </div>
                              )}

                              {/* ── Lines Table ── */}
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50">
                                    {bulkAvailable && (
                                      <TableHead className="w-8">
                                        <Checkbox
                                          checked={displayLines.length > 0 && displayLines.every((l: any) => checkedLines.has(l.id))}
                                          onCheckedChange={() => toggleAllLines(displayLines)}
                                        />
                                      </TableHead>
                                    )}
                                    <TableHead className="text-xs">#</TableHead>
                                    <TableHead className="text-xs p-0">
                                      <button
                                        onClick={cycleSubgroupSort}
                                        className="flex items-center gap-1 px-3 py-2 w-full hover:bg-muted/70 transition-colors rounded"
                                        title="Sort by Group / Subgroup"
                                      >
                                        Group / Subgroup
                                        {linesSortOrder === "default" && <ArrowUpDown className="h-3 w-3 text-muted-foreground/60" />}
                                        {linesSortOrder === "subgroup_asc"  && <ArrowUp   className="h-3 w-3 text-blue-600" />}
                                        {linesSortOrder === "subgroup_desc" && <ArrowDown  className="h-3 w-3 text-blue-600" />}
                                      </button>
                                    </TableHead>
                                    <TableHead className="text-xs">Requirement</TableHead>
                                    <TableHead className="text-xs">Model</TableHead>
                                    <TableHead className="text-xs">Tag No</TableHead>
                                    <TableHead className="text-xs">Equip. Ref</TableHead>
                                    <TableHead className="text-xs">Service Desc</TableHead>
                                    <TableHead className="text-xs text-center">Qty</TableHead>
                                    <TableHead className="text-xs">Line Status</TableHead>
                                    <TableHead className="text-xs">Planning</TableHead>
                                    <TableHead className="text-xs">PLC</TableHead>
                                    <TableHead className="text-xs">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {displayLines.map((line: any) => {
                                    const canRaisePr =
                                      line.status === "approved" &&
                                      !line.planning_record_id &&
                                      ["released", "locked"].includes(lst.status);
                                    const alreadyRaised = !!line.planning_record_id;
                                    const selCardOpen   = openSelLineId === line.id;
                                    const showSelToggle = ["released", "locked"].includes(lst.status) && line.selection_required;

                                    return (
                                      <Fragment key={line.id}>
                                        <TableRow className={selCardOpen ? "bg-blue-50/40" : ""}>
                                          {bulkAvailable && (
                                            <TableCell>
                                              <Checkbox
                                                checked={checkedLines.has(line.id)}
                                                onCheckedChange={() => toggleChecked(line.id)}
                                              />
                                            </TableCell>
                                          )}
                                          <TableCell className="text-xs font-mono">{line.line_number}</TableCell>
                                          <TableCell className="text-xs">
                                            <div className="font-medium">{line.buy_group_code}</div>
                                            <div className="text-muted-foreground">{line.buy_subgroup_code}</div>
                                          </TableCell>
                                          <TableCell className="text-xs max-w-40 truncate">{line.generic_requirement}</TableCell>
                                          <TableCell className="text-xs">
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-800">
                                              {line.model || "TBN"}
                                            </span>
                                          </TableCell>
                                          <TableCell className="text-xs font-mono">
                                            {line.buy_group_code === 'raw_materials'
                                              ? <span className="text-muted-foreground">—</span>
                                              : (line.tag_no || <span className="text-amber-600 italic">missing</span>)
                                            }
                                          </TableCell>
                                          <TableCell className="text-xs truncate max-w-32">
                                            {line.equipment_reference || <span className="text-muted-foreground">—</span>}
                                          </TableCell>
                                          <TableCell className="text-xs truncate max-w-32">
                                            {line.service_description
                                              ? line.service_description
                                              : line.generic_requirement
                                                ? <span className="text-muted-foreground italic">{line.generic_requirement}</span>
                                                : <span className="text-muted-foreground">—</span>
                                            }
                                          </TableCell>
                                          <TableCell className="text-xs text-center">{line.quantity} {line.uom_code}</TableCell>
                                          <TableCell>
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${LINE_STATUS[line.status]?.cls ?? ""}`}>
                                              {LINE_STATUS[line.status]?.label ?? line.status}
                                            </span>
                                          </TableCell>

                                          {/* Planning cell */}
                                          <TableCell className="min-w-36">
                                            {alreadyRaised ? (
                                              <div className="space-y-0.5">
                                                <span className="font-mono text-[10px] text-emerald-700 font-semibold block">
                                                  {line.ipr_planning_number ?? `PLN #${line.planning_record_id}`}
                                                </span>
                                                {line.ipr_status && (
                                                  <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium ${PLN_STATUS[line.ipr_status]?.cls ?? "bg-slate-100 text-slate-600"}`}>
                                                    {PLN_STATUS[line.ipr_status]?.label ?? line.ipr_status}
                                                  </span>
                                                )}
                                              </div>
                                            ) : (
                                              <span className="text-[10px] text-muted-foreground/50 italic">not raised</span>
                                            )}
                                          </TableCell>

                                          {/* PLC cell */}
                                          <TableCell className="min-w-32">
                                            {line.plc_number ? (
                                              <div className="space-y-0.5">
                                                <span className="font-mono text-[10px] text-indigo-700 font-semibold block">
                                                  {line.plc_number}
                                                </span>
                                                {line.plc_status && (
                                                  <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-indigo-50 text-indigo-700">
                                                    {line.plc_status.replace(/_/g, ' ')}
                                                  </span>
                                                )}
                                              </div>
                                            ) : (
                                              <span className="text-[10px] text-muted-foreground/50 italic">—</span>
                                            )}
                                          </TableCell>

                                          {/* Actions cell */}
                                          <TableCell>
                                            <div className="flex gap-1 flex-wrap">
                                              {/* Datasheet preview + download (always visible when attrs exist) */}
                                              {line.technical_attributes && Object.keys(line.technical_attributes).length > 0 && (
                                                <>
                                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                                    title="Preview Datasheet"
                                                    onClick={() => setDatasheetLine(line)}>
                                                    <FileSpreadsheet className="h-3 w-3" />
                                                  </Button>
                                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                                    title="Download Datasheet PDF"
                                                    onClick={() => downloadDatasheetPdf(line)}>
                                                    <Download className="h-3 w-3" />
                                                  </Button>
                                                </>
                                              )}
                                              {lst.status === "draft" && canWrite && (
                                                <>
                                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                                    onClick={() => openEditLine(lst.id, lst.status, line)}>
                                                    <Edit2 className="h-3 w-3" />
                                                  </Button>
                                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                                                    onClick={() => deleteLine.mutate(line.id)}>
                                                    <Trash2 className="h-3 w-3" />
                                                  </Button>
                                                </>
                                              )}
                                              {/* Phase 5 — selection card toggle */}
                                              {showSelToggle && (
                                                <Button
                                                  size="sm" variant={selCardOpen ? "default" : "outline"}
                                                  className="h-6 text-[10px] px-1.5 gap-0.5"
                                                  title="Manage item selection"
                                                  onClick={() => toggleSelCard(line.id)}
                                                >
                                                  <UserCheck className="h-3 w-3" />
                                                  {selCardOpen ? "Close" : "Select"}
                                                </Button>
                                              )}
                                              {/* Raise PR (single) */}
                                              {canRaisePr && (
                                                <Button
                                                  size="sm" variant="outline"
                                                  className="h-6 text-[10px] px-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                                  disabled={raisePr.isPending}
                                                  onClick={() => raisePr.mutate(line.id)}
                                                >
                                                  {raisePr.isPending
                                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                                    : <><TrendingUp className="h-3 w-3 mr-1" />Raise PR</>
                                                  }
                                                </Button>
                                              )}
                                              {/* Re-raise for canceled/superseded PLN */}
                                              {line.status === "approved" &&
                                                alreadyRaised &&
                                                ["canceled", "superseded"].includes(line.ipr_status) &&
                                                ["released", "locked"].includes(lst.status) && (
                                                <Button
                                                  size="sm" variant="outline"
                                                  className="h-6 text-[10px] px-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                                                  disabled={raisePr.isPending}
                                                  onClick={() => raisePr.mutate(line.id)}
                                                >
                                                  <RotateCcw className="h-3 w-3 mr-1" />Re-raise PR
                                                </Button>
                                              )}
                                            </div>
                                          </TableCell>
                                        </TableRow>

                                        {/* Phase 5 — inline selection card */}
                                        {selCardOpen && (
                                          <TableRow>
                                            <TableCell colSpan={bulkAvailable ? 12 : 11} className="py-2 px-4 bg-blue-50/30">
                                              {renderSelCard(line, lst)}
                                            </TableCell>
                                          </TableRow>
                                        )}
                                      </Fragment>
                                    );
                                  })}
                                </TableBody>
                              </Table>

                              {/* ── Phase 4: Procurement Chain Panel ── */}
                              {["released", "locked"].includes(lst.status) && (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <button
                                      className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                                      onClick={() => toggleProcChain(lst.id)}
                                    >
                                      <ClipboardList className="h-4 w-4" />
                                      Procurement Chain Status
                                      {showProcChain === lst.id
                                        ? <ChevronDown className="h-3.5 w-3.5" />
                                        : <ChevronRight className="h-3.5 w-3.5" />
                                      }
                                    </button>
                                    {showProcChain === lst.id && (
                                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                                        onClick={() => invalidateProcChain(lst.id)}>
                                        Refresh
                                      </Button>
                                    )}
                                  </div>

                                  {showProcChain === lst.id && (
                                    <Card className="border-dashed">
                                      <CardHeader className="pb-2 pt-3 px-4">
                                        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                                          <TrendingUp className="h-3.5 w-3.5" />
                                          Downstream procurement chain per line
                                        </CardTitle>
                                      </CardHeader>
                                      <CardContent className="px-4 pb-4">
                                        {procChainLoading ? (
                                          <div className="py-6 text-center">
                                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                          </div>
                                        ) : !procChainData?.lines?.length ? (
                                          <p className="text-sm text-muted-foreground italic">No lines found.</p>
                                        ) : (
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="border-b">
                                                  <th className="text-left py-2 pr-4 font-semibold text-muted-foreground w-24">Tag No</th>
                                                  <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Line Status</th>
                                                  <th className="text-center py-2 font-semibold text-muted-foreground" colSpan={5}>
                                                    <div className="flex items-center justify-center gap-1">
                                                      <span>Procurement Pipeline</span>
                                                      <ArrowRight className="h-3 w-3" />
                                                    </div>
                                                  </th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {procChainData.lines.map((row: any) => (
                                                  <tr key={row.lineId} className="border-b last:border-0 hover:bg-muted/30">
                                                    <td className="py-2.5 pr-4 font-mono font-semibold">{row.tagNo || "—"}</td>
                                                    <td className="py-2.5 pr-6">
                                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${LINE_STATUS[row.lineStatus]?.cls ?? "bg-slate-100 text-slate-600"}`}>
                                                        {LINE_STATUS[row.lineStatus]?.label ?? row.lineStatus}
                                                      </span>
                                                    </td>
                                                    <td className="py-2.5">
                                                      <div className="flex items-center gap-2">
                                                        <StageBadge
                                                          label="Planning"
                                                          value={row.planningStatus ? (PLN_STATUS[row.planningStatus]?.label ?? row.planningStatus) : null}
                                                          cls={PLN_STATUS[row.planningStatus]?.cls}
                                                        />
                                                        {row.planningRecordId && <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                                                        {row.planningRecordId && (
                                                          <>
                                                            <StageBadge label="Exec" value={row.procurementStatus} cls="bg-blue-100 text-blue-800" />
                                                            <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                                          </>
                                                        )}
                                                        {row.planningRecordId && (
                                                          <>
                                                            <StageBadge label="PO Prep" value={row.poPrepStatus} cls="bg-violet-100 text-violet-800" />
                                                            <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                                          </>
                                                        )}
                                                        {row.planningRecordId && (
                                                          <>
                                                            <StageBadge
                                                              label="PO"
                                                              value={row.epcPoStatus ? `${row.epcPoStatus}${row.epcPoNumber ? ` · ${row.epcPoNumber}` : ""}` : null}
                                                              cls="bg-indigo-100 text-indigo-800"
                                                            />
                                                            <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                                          </>
                                                        )}
                                                        {row.planningRecordId && (
                                                          <StageBadge label="QC" value={row.qualityStatus} cls="bg-teal-100 text-teal-800" />
                                                        )}
                                                        {!row.planningRecordId && (
                                                          <span className="text-[10px] text-muted-foreground/50 italic">PR not raised</span>
                                                        )}
                                                      </div>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </CardContent>
                                    </Card>
                                  )}
                                </div>
                              )}

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

      {/* ── Create Buy List Dialog ─────────────────────────────────────────────── */}
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
              <Select value={createForm.sourcePackageId || "_none"} onValueChange={v => setCreateForm(f => ({ ...f, sourcePackageId: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="None — create blank list" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None — blank list</SelectItem>
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
            <Button
              onClick={() => createList.mutate({
                projectItemId: Number(createForm.projectItemId),
                sourcePackageId: createForm.sourcePackageId ? Number(createForm.sourcePackageId) : undefined,
              })}
              disabled={!createForm.projectItemId || createList.isPending}
            >
              {createList.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lifecycle Action Dialog ─────────────────────────────────────────────── */}
      {actionDialog && (
        <Dialog open={actionDialog.open} onOpenChange={() => setActionDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{ACTION_META[actionDialog.action]?.label}</DialogTitle>
              <DialogDescription>
                {actionDialog.action === "cancel"   && "This cannot be undone for released lists."}
                {actionDialog.action === "supersede" && "A new draft revision will be created with all lines copied."}
                {actionDialog.action === "review"   && "Record your review recommendation."}
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
                  <Label>
                    {ACTION_META[actionDialog.action].noteLabel}
                    {["cancel", "supersede"].includes(actionDialog.action) && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <Textarea value={actionNote} onChange={e => setActionNote(e.target.value)} rows={3} />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
              <Button
                onClick={submitAction}
                disabled={doAction.isPending || (["cancel", "supersede"].includes(actionDialog.action) && !actionNote.trim())}
              >
                {doAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Line Add/Edit Dialog ────────────────────────────────────────────────── */}
      {lineDialog && (
        <Dialog open={lineDialog.open} onOpenChange={() => setLineDialog(null)}>
          <DialogContent className="max-w-2xl flex flex-col gap-0 p-0 max-h-[90vh] overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b shrink-0">
              <DialogHeader>
                <DialogTitle>{lineDialog.editLine ? "Edit Line" : "Add Line"}</DialogTitle>
                <DialogDescription>Tag, equipment and service fields must be filled before submission.</DialogDescription>
              </DialogHeader>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
            {/* ── Electrical Standard Info Strip ──────────────────────────── */}
            {(currentSubgroupCode === 'non_flameproof' || currentSubgroupCode === 'flameproof' || currentSubgroupCode === 'panels') &&
              selectedProject?.electrical_voltage && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-600" />
                <span>
                  <span className="font-semibold">Project electrical standard:</span>{' '}
                  {selectedProject.electrical_voltage} V
                  {selectedProject.electrical_frequency ? ` / ${selectedProject.electrical_frequency} Hz` : ''}
                  {selectedProject.electrical_phase ? ` / ${selectedProject.electrical_phase}` : ''}
                  {' — '}auto-applied to motor voltage, frequency and panel voltage when seeding from templates.
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Buy Group <span className="text-red-500">*</span></Label>
                <Select value={lf.buyGroupId} onValueChange={v => {
                  const NOS_GROUPS = new Set(["pumps", "motors", "instruments", "valves"]);
                  const grpCode = (groups as any[]).find((g: any) => String(g.id) === v)?.code ?? "";
                  const nosUom  = (uoms   as any[]).find((u: any) => u.code?.toUpperCase() === "NOS");
                  setLf(f => ({
                    ...f, buyGroupId: v, buySubgroupId: "",
                    ...(NOS_GROUPS.has(grpCode) && nosUom ? { uomId: String(nosUom.id) } : { uomId: "" }),
                  }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select group…" /></SelectTrigger>
                  <SelectContent>
                    {(groups as any[]).map((g: any) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.code} — {g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Buy Subgroup <span className="text-red-500">*</span></Label>
                <Select value={lf.buySubgroupId} onValueChange={v => {
                  const NOS_GROUPS = new Set(["pumps", "motors", "instruments", "valves"]);
                  const nosUom = (uoms as any[]).find((u: any) => u.code?.toUpperCase() === "NOS");
                  setLf(f => ({
                    ...f, buySubgroupId: v,
                    technicalAttributes: currentGroupCode === "instruments" ? { ...INSTRUMENT_CABLE_GLAND_DEFAULTS } : {},
                    ...(NOS_GROUPS.has(currentGroupCode ?? "") && nosUom ? { uomId: String(nosUom.id) } : {}),
                  }));
                }} disabled={!lf.buyGroupId}>
                  <SelectTrigger><SelectValue placeholder="Select subgroup…" /></SelectTrigger>
                  <SelectContent>
                    {(subgroups as any[]).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.code} — {s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" min="1" step="1" value={lf.quantity}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={e => { const v = e.target.value; setLf(f => ({ ...f, quantity: v === "" ? "" : String(Math.max(1, Math.trunc(Number(v)))) })); }} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Generic Requirement <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Feed Pump, Suction Strainer"
                  value={lf.genericRequirement} onChange={e => setLf(f => ({ ...f, genericRequirement: e.target.value }))} />
              </div>
              {currentSubgroupCode && PUMP_SUBGROUP_CODES.has(currentSubgroupCode) ? (
                <div className="col-span-2">
                  {currentSubgroupCode === "centrifugal" && (
                    <CentrifugalPumpAttrsForm
                      attrs={lf.technicalAttributes}
                      onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                    />
                  )}
                  {currentSubgroupCode === "gear" && (
                    <GearPumpAttrsForm
                      attrs={lf.technicalAttributes}
                      onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                    />
                  )}
                  {currentSubgroupCode === "screw" && (
                    <ScrewPumpAttrsForm
                      attrs={lf.technicalAttributes}
                      onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                    />
                  )}
                  {currentSubgroupCode === "multistage" && (
                    <MultistagePumpAttrsForm
                      attrs={lf.technicalAttributes}
                      onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                    />
                  )}
                  {currentSubgroupCode === "dosing_metering" && (
                    <DosingPumpAttrsForm
                      attrs={lf.technicalAttributes}
                      onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                    />
                  )}
                  {currentSubgroupCode === "vacuum_boosters" && (
                    <VacuumBoosterAttrsForm
                      attrs={lf.technicalAttributes}
                      onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                    />
                  )}
                  {currentSubgroupCode === "pump_skid" && (
                    <PumpSkidAttrsForm
                      attrs={lf.technicalAttributes}
                      onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                    />
                  )}
                </div>
              ) : (currentSubgroupCode === "non_flameproof" || currentSubgroupCode === "flameproof") ? (
                <div className="col-span-2">
                  <MotorAttrsForm
                    attrs={lf.technicalAttributes}
                    isFlameproof={currentSubgroupCode === "flameproof"}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "pressure" ? (
                <div className="col-span-2">
                  <PressureAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "temperature" ? (
                <div className="col-span-2">
                  <TemperatureAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "flow" ? (
                <div className="col-span-2">
                  <FlowAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "level" ? (
                <div className="col-span-2">
                  <LevelAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "control" ? (
                <div className="col-span-2">
                  <ControlValveAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "safety" ? (
                <div className="col-span-2">
                  <SafetyValveAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "on_off" ? (
                <div className="col-span-2">
                  <OnOffValveAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "nrv" ? (
                <div className="col-span-2">
                  <NrvValveAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "needle" ? (
                <div className="col-span-2">
                  <NeedleValveAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "isolation" ? (
                <div className="col-span-2">
                  <IsolationValveAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "components" ? (
                <div className="col-span-2">
                  <ComponentsAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                    projectVoltage={selectedProject?.electrical_voltage ?? undefined}
                    projectFrequency={selectedProject?.electrical_frequency ?? undefined}
                  />
                </div>
              ) : currentSubgroupCode === "panels" ? (
                <div className="col-span-2">
                  <PanelAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                    projectVoltage={selectedProject?.electrical_voltage ?? undefined}
                    projectFrequency={selectedProject?.electrical_frequency ?? undefined}
                  />
                </div>
              ) : currentSubgroupCode === "cabling" ? (
                <div className="col-span-2">
                  <CablingAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "junction_box" ? (
                <div className="col-span-2">
                  <JunctionBoxAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "cooling_tower" ? (
                <div className="col-span-2">
                  <CoolingTowerAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : (currentSubgroupCode === "general" && currentGroupCode === "bought_out_packages") ? (
                <div className="col-span-2">
                  <BoughtOutAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "plates" ? (
                <div className="col-span-2">
                  <PlatesAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "pipes" ? (
                <div className="col-span-2">
                  <PipesAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "fittings" ? (
                <div className="col-span-2">
                  <FittingsAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "flanges" ? (
                <div className="col-span-2">
                  <FlangesAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "fasteners" ? (
                <div className="col-span-2">
                  <FastenersAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "gaskets" ? (
                <div className="col-span-2">
                  <GasketsAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : currentSubgroupCode === "structural_steel" ? (
                <div className="col-span-2">
                  <StructuralSteelAttrsForm
                    attrs={lf.technicalAttributes}
                    onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                  />
                </div>
              ) : (
                <TechnicalAttrsSection
                  subgroupCode={currentSubgroupCode}
                  attrs={lf.technicalAttributes}
                  onChange={ta => setLf(f => ({ ...f, technicalAttributes: ta }))}
                />
              )}
              {/* Tag No — hidden for Raw Materials, info box when qty-split */}
              {!isRawMaterials && !isQtySplit && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Tag No
                    {tagAutoFilled && (
                      <span className="text-[10px] font-normal text-blue-600 bg-blue-50 border border-blue-200 px-1 py-0.5 rounded">
                        auto
                      </span>
                    )}
                    {tagFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </Label>
                  <Input
                    placeholder="e.g. P-101A"
                    value={lf.tagNo}
                    onChange={e => { setTagAutoFilled(false); setLf(f => ({ ...f, tagNo: e.target.value })); }}
                    className={tagDuplicateWarning ? "border-amber-400 focus-visible:ring-amber-400" : ""}
                  />
                  {tagDuplicateWarning && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 flex-shrink-0" />
                      {tagDuplicateWarning}
                    </p>
                  )}
                </div>
              )}
              {!isRawMaterials && isQtySplit && (
                <div className="space-y-1.5">
                  <Label>Tag Numbers</Label>
                  <div className="rounded-md border bg-blue-50 border-blue-200 p-3">
                    {tagFetching ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Generating preview…
                      </div>
                    ) : tagPreview.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-blue-800">{lineQty} tagged lines will be created:</p>
                        <p className="text-xs font-mono text-blue-700">{tagPreview.join(' · ')}</p>
                        <p className="text-xs text-blue-600 mt-1">Each unit becomes 1 separate line with its own tag, datasheet, and procurement record.</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Tags will be auto-generated for each unit.</p>
                    )}
                  </div>
                </div>
              )}
              {isRawMaterials && <div />}
              <div className="space-y-1.5">
                <Label>Equipment Reference</Label>
                <Input placeholder="e.g. EQ-2024-001" value={lf.equipmentReference} onChange={e => setLf(f => ({ ...f, equipmentReference: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Service Description</Label>
                <Input placeholder="e.g. Cooling Water Pump"
                  value={lf.serviceDescription} onChange={e => setLf(f => ({ ...f, serviceDescription: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Required Date</Label>
                <Input type="date" value={lf.requiredDate} onChange={e => setLf(f => ({ ...f, requiredDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Specification</Label>
                <Input value={lf.specification} onChange={e => setLf(f => ({ ...f, specification: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-2 rounded-md border p-3 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Required Flags</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "selectionRequired",   label: "Selection Required" },
                    { key: "datasheetRequired",   label: "Datasheet Required" },
                    { key: "inspectionRequired",  label: "Inspection Required" },
                    { key: "certificateRequired", label: "Certificate Required" },
                    { key: "complianceRequired",  label: "Compliance Required" },
                  ].map(flag => (
                    <div key={flag.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`lflag-${flag.key}`}
                        checked={lf[flag.key as keyof typeof lf] as boolean}
                        onCheckedChange={v => setLf(f => ({ ...f, [flag.key]: Boolean(v) }))}
                      />
                      <Label htmlFor={`lflag-${flag.key}`} className="text-xs">{flag.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-1.5">
                <Label className="text-blue-800 font-semibold text-xs uppercase tracking-wide">Installed On</Label>
                <Select
                  value={lf.installedOn || "_none"}
                  onValueChange={v => setLf(f => ({ ...f, installedOn: v === "_none" ? "" : v }))}
                >
                  <SelectTrigger className="bg-white border-blue-200"><SelectValue placeholder="None / Not specified" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None / Not specified</SelectItem>
                    {SKID_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border border-violet-200 bg-violet-50 p-3 space-y-1.5">
                <Label className="text-violet-800 font-semibold text-xs uppercase tracking-wide">
                  Model <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={lf.model}
                  onChange={e => setLf(f => ({ ...f, model: e.target.value }))}
                  placeholder="e.g. TBN, 3100, NHM-50…"
                  className="bg-white border-violet-200"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={lf.notes} onChange={e => setLf(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            </div>
            <div className="px-6 py-4 border-t shrink-0">
              <DialogFooter>
                <Button variant="outline" onClick={() => setLineDialog(null)}>Cancel</Button>
                <Button onClick={submitLine} disabled={addLine.isPending || patchLine.isPending}>
                  {(addLine.isPending || patchLine.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {lineDialog.editLine ? "Save Changes" : "Add Line"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Reject Dialog ──────────────────────────────────────────────────────── */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={(o) => { if (!o) { setRejectDialog({ open: false, lineId: 0 }); setRejectReason(""); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Selection</DialogTitle>
            <DialogDescription>Provide a reason for rejection. The submitter will be notified.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Rejection Reason <span className="text-red-500">*</span></Label>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                placeholder="e.g. Wrong specification, datasheet mismatch…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialog({ open: false, lineId: 0 }); setRejectReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectSelection.isPending}
              onClick={() => rejectSelection.mutate({ lineId: rejectDialog.lineId, reason: rejectReason.trim() })}
            >
              {rejectSelection.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Select Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={bulkSelDialog} onOpenChange={(o) => { if (!o) { setBulkSelDialog(false); setBulkMasterItemId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Select — {checkedLines.size} Line{checkedLines.size > 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>
              Apply the same master item to all selected lines. Already-approved lines will be skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Master Item (Buy) <span className="text-red-500">*</span></Label>
              <Select value={bulkMasterItemId} onValueChange={setBulkMasterItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Search and select an item…" />
                </SelectTrigger>
                <SelectContent>
                  {buyItems.length === 0 && (
                    <SelectItem value="_none" disabled>No buy items available</SelectItem>
                  )}
                  {(buyItems as any[]).map((m: any) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.item_code} — {m.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              This will replace any existing non-approved selection on all {checkedLines.size} selected line(s).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkSelDialog(false); setBulkMasterItemId(""); }}>
              Cancel
            </Button>
            <Button
              disabled={!bulkMasterItemId || bulkSelect.isPending}
              onClick={submitBulkSelect}
            >
              {bulkSelect.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Apply to {checkedLines.size} Line{checkedLines.size > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PPPC Backfill Dialog (Scenario 1) ──────────────────────────────────── */}
      <Dialog open={showBackfillDialog} onOpenChange={(o) => { if (!o) { setShowBackfillDialog(false); setPppcStatusData(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-600" />
              Generate Missing PPPC Buy Lists
            </DialogTitle>
            <DialogDescription>
              The system detected project items without procurement buy lists.
              Matching will use the latest active Buy Package.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                {pppcStatusData?.missingLists ?? 0} eligible for generation
              </span>
              <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                {pppcStatusData?.alreadyHasLists ?? 0} already have buy lists (will be skipped)
              </span>
              <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">
                {pppcStatusData?.noPackageMatch ?? 0} no matching active package (will be skipped)
              </span>
            </div>

            {/* Preview table */}
            {pppcStatusData?.preview?.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Project Item</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">Matched Package</TableHead>
                      <TableHead className="text-xs text-center">Lines</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pppcStatusData.preview.map((item: any) => (
                      <TableRow key={item.projectItemId}>
                        <TableCell className="font-mono text-xs">{item.projectItemCode ?? `#${item.projectItemId}`}</TableCell>
                        <TableCell className="text-xs max-w-48 truncate">{item.description ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono text-blue-700">{item.matchedPackageCode}</span>
                          {item.matchedPackageName && <div className="text-muted-foreground truncate max-w-36">{item.matchedPackageName}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-center">{item.lineCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <p className="text-xs text-muted-foreground border-l-2 border-amber-400 pl-3">
              This will create {pppcStatusData?.missingLists ?? 0} new buy list(s).
              No existing data will be overwritten. Generated lists will be in Draft status.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowBackfillDialog(false); setPppcStatusData(null); }}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
              disabled={doBackfill.isPending || (pppcStatusData?.missingLists ?? 0) === 0}
              onClick={() => doBackfill.mutate()}
            >
              {doBackfill.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate {pppcStatusData?.missingLists ?? 0} Buy List(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PPPC Package Diff Sheet (Scenario 2) ──────────────────────────────── */}
      <Dialog
        open={pppcDiffListId !== null}
        onOpenChange={(o) => { if (!o) { setPppcDiffListId(null); setPppcDiffData(null); setReplaceConfirmText(""); setReplaceNote(""); } }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-blue-600" />
              Package Sync — Review Changes
            </DialogTitle>
            {pppcDiffData && !pppcDiffData.upToDate && (
              <DialogDescription>
                <span className="font-mono text-xs">{pppcDiffData.currentPackageCode}</span>
                {" "}v{pppcDiffData.currentPackageVersion} → v{pppcDiffData.latestPackageVersion}
                {" "}· {pppcDiffData.latestPackageCode && <span className="font-mono">{pppcDiffData.latestPackageCode}</span>}
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Multi-list navigation (if multiple drifted lists) */}
          {pppcStatusData?.driftedLists?.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground border-b pb-2 mb-2">
              <Info className="h-3.5 w-3.5" />
              Showing drift for list {pppcDriftIdx + 1} of {pppcStatusData.driftedLists.length}
              {pppcDriftIdx < pppcStatusData.driftedLists.length - 1 && (
                <button
                  className="text-blue-600 underline ml-2"
                  onClick={() => {
                    const next = pppcDriftIdx + 1;
                    setPppcDriftIdx(next);
                    loadDiff(pppcStatusData.driftedLists[next].listId);
                  }}
                >
                  View next drifted list →
                </button>
              )}
            </div>
          )}

          {pppcDiffLoading && (
            <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          )}

          {!pppcDiffLoading && pppcDiffData?.upToDate && (
            <div className="py-8 text-center text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              This buy list is already aligned with the latest active package.
            </div>
          )}

          {!pppcDiffLoading && pppcDiffData && !pppcDiffData.upToDate && (() => {
            const s = pppcDiffData.summary ?? {};
            const blocked = pppcDiffData.activityBlocked;
            const isSuperuser = (user as any)?.role === "Superuser";
            return (
              <div className="space-y-4">
                {/* Summary bar */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {s.new > 0      && <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium flex items-center gap-1"><PlusCircle className="h-3 w-3" />{s.new} New</span>}
                  {s.removed > 0  && <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1"><MinusCircle className="h-3 w-3" />{s.removed} Removed</span>}
                  {s.changed > 0  && <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">{s.changed} Changed</span>}
                  {s.userModified > 0 && <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{s.userModified} User-Modified</span>}
                  <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500 font-medium">{s.unchanged} Unchanged</span>
                </div>

                {/* Activity warning */}
                {blocked && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold mb-1">Some lines have active procurement data (selection approved / PR raised). Destructive actions are blocked for those lines.</div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {pppcDiffData.activityDetails?.map((d: any) => (
                          <li key={d.lineId}>Line #{d.lineId}: {d.reason}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* ── NEW LINES ─── */}
                {pppcDiffData.newLines?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-emerald-700 mb-1 flex items-center gap-1">
                      <PlusCircle className="h-3.5 w-3.5" /> New Lines (in latest package, not in project list)
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-emerald-50">
                            <TableHead className="text-xs">Group</TableHead>
                            <TableHead className="text-xs">Subgroup</TableHead>
                            <TableHead className="text-xs">Requirement</TableHead>
                            <TableHead className="text-xs text-center">Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pppcDiffData.newLines.map((nl: any) => (
                            <TableRow key={nl.id} className="bg-emerald-50/40">
                              <TableCell className="text-xs">{nl.buy_group_code}</TableCell>
                              <TableCell className="text-xs">{nl.buy_subgroup_code}</TableCell>
                              <TableCell className="text-xs">{nl.generic_requirement}</TableCell>
                              <TableCell className="text-xs text-center">{nl.default_quantity}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="mt-2">
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={doSyncAdditions.isPending}
                        onClick={() => pppcDiffListId && doSyncAdditions.mutate(pppcDiffListId)}
                      >
                        {doSyncAdditions.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />}
                        Add {pppcDiffData.newLines.length} New Line(s) Only
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── REMOVED LINES ─── */}
                {pppcDiffData.removedLines?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1">
                      <MinusCircle className="h-3.5 w-3.5" /> Removed Lines (in project list, gone from latest package)
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-red-50">
                            <TableHead className="text-xs">Group</TableHead>
                            <TableHead className="text-xs">Subgroup</TableHead>
                            <TableHead className="text-xs">Requirement</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Activity</TableHead>
                            <TableHead className="text-xs">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pppcDiffData.removedLines.map((l: any) => (
                            <TableRow key={l.id} className="bg-red-50/40">
                              <TableCell className="text-xs">{l.buy_group_code}</TableCell>
                              <TableCell className="text-xs">{l.buy_subgroup_code}</TableCell>
                              <TableCell className="text-xs">{l.generic_requirement}</TableCell>
                              <TableCell className="text-xs">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${LINE_STATUS[l.status]?.cls ?? ""}`}>
                                  {LINE_STATUS[l.status]?.label ?? l.status}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs">
                                {l.activityBlocked
                                  ? <span className="flex items-center gap-1 text-amber-700"><ShieldAlert className="h-3 w-3" />{l.activityReason}</span>
                                  : <span className="text-muted-foreground">None</span>}
                              </TableCell>
                              <TableCell className="text-xs">
                                {l.status !== "obsolete" && !l.activityBlocked && (
                                  <Button
                                    size="sm" variant="outline"
                                    className="h-6 text-[10px] px-2 border-red-300 text-red-700 hover:bg-red-50"
                                    disabled={doMarkObsolete.isPending}
                                    onClick={() => doMarkObsolete.mutate(l.id)}
                                  >
                                    Mark Obsolete
                                  </Button>
                                )}
                                {l.status === "obsolete" && <span className="text-muted-foreground italic text-[10px]">Already obsolete</span>}
                                {l.activityBlocked && <span className="text-amber-600 text-[10px]">🔒 Blocked</span>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* ── CHANGED LINES ─── */}
                {pppcDiffData.changedLines?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-amber-700 mb-1 flex items-center gap-1">
                      <RefreshCw className="h-3.5 w-3.5" /> Changed Lines (catalog values differ from project list)
                    </div>
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-amber-50">
                            <TableHead className="text-xs">Group</TableHead>
                            <TableHead className="text-xs">Requirement</TableHead>
                            <TableHead className="text-xs text-center">Catalog Qty</TableHead>
                            <TableHead className="text-xs text-center">Project Qty</TableHead>
                            <TableHead className="text-xs">Flags</TableHead>
                            <TableHead className="text-xs">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pppcDiffData.changedLines.map((l: any) => (
                            <TableRow key={l.id} className="bg-amber-50/40">
                              <TableCell className="text-xs">{l.buy_group_code} / {l.buy_subgroup_code}</TableCell>
                              <TableCell className="text-xs max-w-36 truncate">{l.generic_requirement}</TableCell>
                              <TableCell className="text-xs text-center font-mono">{l.catalogQty}</TableCell>
                              <TableCell className="text-xs text-center font-mono">{l.quantity}</TableCell>
                              <TableCell className="text-xs">
                                {l.is_user_modified && (
                                  <span className="flex items-center gap-1 text-orange-700 font-medium">
                                    <AlertTriangle className="h-3 w-3" /> User-modified
                                  </span>
                                )}
                                {l.activityBlocked && (
                                  <span className="flex items-center gap-1 text-amber-700">
                                    <ShieldAlert className="h-3 w-3" />{l.activityReason}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs">
                                {!l.is_user_modified && !l.activityBlocked ? (
                                  <Button
                                    size="sm" variant="outline"
                                    className="h-6 text-[10px] px-2 border-amber-300 text-amber-800 hover:bg-amber-50"
                                    disabled={doSyncCatalogChange.isPending}
                                    onClick={() => doSyncCatalogChange.mutate({ lineId: l.id, newPackageLineId: l.newPackageLineId })}
                                  >
                                    Apply Catalog Value
                                  </Button>
                                ) : l.is_user_modified ? (
                                  <span className="text-muted-foreground text-[10px] italic">Protected (user-modified)</span>
                                ) : (
                                  <span className="text-amber-600 text-[10px]">🔒 Blocked</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* ── ADMIN FULL REPLACEMENT ─── */}
                {isSuperuser && (
                  <div className="border border-red-200 rounded-md p-4 space-y-3 bg-red-50/30">
                    <div className="flex items-center gap-2 text-xs font-semibold text-red-700">
                      <ShieldAlert className="h-4 w-4" />
                      Superuser: Full Replacement (Destructive)
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Deletes all current lines and re-seeds from the latest active package.
                      A full snapshot is saved before deletion.
                      {blocked && " Blocked because some lines have active procurement data."}
                    </p>
                    {!blocked && (
                      <div className="space-y-2">
                        <Textarea
                          className="text-xs h-16"
                          placeholder="Reason / note for replacement (required for audit)…"
                          value={replaceNote}
                          onChange={e => setReplaceNote(e.target.value)}
                        />
                        <div className="space-y-1">
                          <Label className="text-[10px] text-red-700">Type "REPLACE" to confirm</Label>
                          <Input
                            className="h-8 text-xs font-mono"
                            placeholder="REPLACE"
                            value={replaceConfirmText}
                            onChange={e => setReplaceConfirmText(e.target.value)}
                          />
                        </div>
                        <Button
                          size="sm"
                          className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                          disabled={replaceConfirmText !== "REPLACE" || !replaceNote.trim() || doReplaceFromPackage.isPending}
                          onClick={() => pppcDiffListId && doReplaceFromPackage.mutate(pppcDiffListId)}
                        >
                          {doReplaceFromPackage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                          Full Replacement
                        </Button>
                      </div>
                    )}
                    {blocked && (
                      <div className="text-xs text-amber-700 flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5" /> Full replacement blocked due to active procurement lines above.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPppcDiffListId(null); setPppcDiffData(null); setReplaceConfirmText(""); setReplaceNote(""); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Datasheet Preview Dialog */}
      <DatasheetPreviewDialog
        line={datasheetLine}
        open={datasheetLine !== null}
        onClose={() => setDatasheetLine(null)}
      />

      {/* Remove Selection Confirm */}
      <AlertDialog open={confirmRemoveSel !== null} onOpenChange={o => { if (!o) setConfirmRemoveSel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Selection</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the selected master item and any associated datasheet from this line. The line will return to <strong>Open</strong> status. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => { if (confirmRemoveSel !== null) { deleteSelection.mutate(confirmRemoveSel); setConfirmRemoveSel(null); } }}
            >
              Remove Selection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Select & Approve Confirm */}
      <AlertDialog open={confirmDirectApprove !== null} onOpenChange={o => { if (!o) setConfirmDirectApprove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select & Approve — {confirmDirectApprove?.lineIds.length ?? 0} Line{(confirmDirectApprove?.lineIds.length ?? 0) !== 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              This will approve {(confirmDirectApprove?.lineIds.length ?? 0) !== 1 ? "these lines" : "this line"} for procurement. Vendor assignment will happen later on the Procurement List Control page after bid evaluation. Already-approved lines will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => { if (confirmDirectApprove) { bulkDirectApprove.mutate(confirmDirectApprove); setConfirmDirectApprove(null); } }}
            >
              Approve {confirmDirectApprove?.lineIds.length ?? 0} Line{(confirmDirectApprove?.lineIds.length ?? 0) !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Approve Confirm */}
      <AlertDialog open={confirmBulkApprove !== null} onOpenChange={o => { if (!o) setConfirmBulkApprove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Approve — {confirmBulkApprove?.lineIds.length ?? 0} Line{(confirmBulkApprove?.lineIds.length ?? 0) !== 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              This will approve the selected master item for each checked line. Lines must already have a selection. Approved lines cannot be changed without re-uploading a datasheet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => { if (confirmBulkApprove) { bulkApprove.mutate(confirmBulkApprove); setConfirmBulkApprove(null); } }}
            >
              Approve {confirmBulkApprove?.lineIds.length ?? 0} Line{(confirmBulkApprove?.lineIds.length ?? 0) !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Raise PR Confirm */}
      <AlertDialog open={confirmBulkRaisePr !== null} onOpenChange={o => { if (!o) setConfirmBulkRaisePr(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Raise PR — {confirmBulkRaisePr?.lineIds.length ?? 0} Line{(confirmBulkRaisePr?.lineIds.length ?? 0) !== 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              This will raise a Purchase Requisition for each checked line. Lines must be approved. PRs already raised will be skipped automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => { if (confirmBulkRaisePr) { bulkRaisePr.mutate(confirmBulkRaisePr); setConfirmBulkRaisePr(null); } }}
            >
              Raise PR for {confirmBulkRaisePr?.lineIds.length ?? 0} Line{(confirmBulkRaisePr?.lineIds.length ?? 0) !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Layout>
  );
}
