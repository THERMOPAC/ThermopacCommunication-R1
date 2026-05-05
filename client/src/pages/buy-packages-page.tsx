import { useState, Fragment, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, ChevronRight, ChevronDown, Package, Layers,
  CheckCircle2, Archive, Edit2, Trash2, Loader2, Search, AlertCircle, List,
} from "lucide-react";

// ── Role helpers ──────────────────────────────────────────────────────────────
const ROLE_LEVEL: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2,
  Manager: 3, "Senior Executive": 4, Employee: 5,
};
const rl = (role?: string) => ROLE_LEVEL[role ?? ""] ?? 999;
const isManager       = (r?: string) => rl(r) <= 3;
const isSeniorManager = (r?: string) => rl(r) <= 2;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; cls: string }> = {
  draft:    { label: "Draft",    cls: "bg-slate-100 text-slate-700 border border-slate-200" },
  active:   { label: "Active",   cls: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
  archived: { label: "Archived", cls: "bg-orange-100 text-orange-800 border border-orange-200" },
};

// ── Technical attribute field definitions (verbatim from baseline) ─────────────
type TAField = { key: string; label: string; type: "text" | "number" | "boolean" };
const TA_FIELDS: Record<string, TAField[]> = {
  pumps: [
    { key: "flow_m3hr",        label: "Flow Rate (m³/hr)",    type: "number" },
    { key: "head_m",           label: "Head (m)",              type: "number" },
    { key: "fluid",            label: "Fluid",                 type: "text"   },
    { key: "operating_temp_c", label: "Operating Temp (°C)",   type: "number" },
    { key: "moc",              label: "MOC",                   type: "text"   },
    { key: "seal_type",        label: "Seal Type",             type: "text"   },
    { key: "mounting",         label: "Mounting",              type: "text"   },
    { key: "motor_coupling",   label: "Motor Coupling",        type: "boolean"},
    { key: "duty_class",       label: "Duty Class",            type: "text"   },
  ],
  motors: [
    { key: "kw",                 label: "Power (kW)",           type: "number" },
    { key: "hp",                 label: "Power (HP)",           type: "number" },
    { key: "voltage_v",          label: "Voltage (V)",          type: "number" },
    { key: "phase",              label: "Phase",                type: "text"   },
    { key: "frequency_hz",       label: "Frequency (Hz)",       type: "number" },
    { key: "rpm",                label: "RPM",                  type: "number" },
    { key: "duty",               label: "Duty",                 type: "text"   },
    { key: "mounting",           label: "Mounting",             type: "text"   },
    { key: "ip_rating",          label: "IP Rating",            type: "text"   },
    { key: "area_classification",label: "Area Classification",  type: "text"   },
    { key: "efficiency_class",   label: "Efficiency Class",     type: "text"   },
  ],
  instruments: [
    { key: "measurement_type",    label: "Measurement Type",    type: "text"   },
    { key: "range_min",           label: "Range Min",           type: "number" },
    { key: "range_max",           label: "Range Max",           type: "number" },
    { key: "range_unit",          label: "Range Unit",          type: "text"   },
    { key: "process_fluid",       label: "Process Fluid",       type: "text"   },
    { key: "connection_size_mm",  label: "Connection Size (mm)",type: "number" },
  ],
  valves: [
    { key: "valve_type",    label: "Valve Type",    type: "text"   },
    { key: "size_mm",       label: "Size (mm)",     type: "number" },
    { key: "rating_class",  label: "Rating Class",  type: "text"   },
    { key: "end_connection",label: "End Connection",type: "text"   },
    { key: "moc_body",      label: "MOC Body",      type: "text"   },
    { key: "moc_trim",      label: "MOC Trim",      type: "text"   },
  ],
  electrical_control: [
    { key: "panel_type",          label: "Panel Type",         type: "text"   },
    { key: "voltage_v",           label: "Voltage (V)",        type: "number" },
    { key: "phase",               label: "Phase",              type: "text"   },
    { key: "ip_rating",           label: "IP Rating",          type: "text"   },
    { key: "enclosure_material",  label: "Enclosure Material", type: "text"   },
  ],
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface BuyPackage {
  id: number; productId: number; productCode: string; productDescription: string;
  packageCode: string; name: string; description: string | null;
  version: number; status: string; isActive: boolean; lineCount: number;
  createdAt: string;
}
interface PackageLine {
  id: number; buy_package_header_id: number; line_number: number;
  buy_group_id: number; buy_group_code: string; buy_group_label: string;
  buy_subgroup_id: number; buy_subgroup_code: string; buy_subgroup_label: string;
  uom_id: number; uom_code: string; uom_label: string;
  generic_requirement: string; default_quantity: string;
  default_specification: string | null; technical_attributes: Record<string, unknown> | null;
  selection_required: boolean; datasheet_required: boolean;
  inspection_required: boolean; certificate_required: boolean; compliance_required: boolean;
  notes: string | null; sort_order: number;
}
interface BuyGroup    { id: number; code: string; label: string; sortOrder: number; }
interface BuySubgroup { id: number; buy_group_id: number; code: string; label: string; }
interface UomMaster   { id: number; code: string; label: string; }
interface Product     { id: number; productCode: string; description: string; makeOrBuy: string; parentId: number | null; isGrandparent: boolean; }

// ── Group lines by BUY Group → Subgroup ──────────────────────────────────────
function groupLines(lines: PackageLine[]) {
  const groupMap = new Map<number, {
    groupId: number; groupCode: string; groupLabel: string;
    subgroups: Map<number, { subgroupId: number; subgroupCode: string; subgroupLabel: string; lines: PackageLine[] }>;
  }>();
  for (const line of lines) {
    if (!groupMap.has(line.buy_group_id)) {
      groupMap.set(line.buy_group_id, { groupId: line.buy_group_id, groupCode: line.buy_group_code, groupLabel: line.buy_group_label, subgroups: new Map() });
    }
    const grp = groupMap.get(line.buy_group_id)!;
    if (!grp.subgroups.has(line.buy_subgroup_id)) {
      grp.subgroups.set(line.buy_subgroup_id, { subgroupId: line.buy_subgroup_id, subgroupCode: line.buy_subgroup_code, subgroupLabel: line.buy_subgroup_label, lines: [] });
    }
    grp.subgroups.get(line.buy_subgroup_id)!.lines.push(line);
  }
  return Array.from(groupMap.values()).map((g) => ({ ...g, subgroups: Array.from(g.subgroups.values()) }));
}

// ── Plates requirement builder ────────────────────────────────────────────────
function buildPlatesRequirement(attrs: Record<string, unknown>): string {
  const plateType    = (attrs.plate_type     as string)?.trim() || "";
  const grade        = (attrs.material_grade as string)?.trim() || "";
  const standard     = (attrs.standard       as string)?.trim() || "";
  const thick        = attrs.thickness_mm ? `${attrs.thickness_mm}mm Thk` : "";
  const width        = attrs.width_mm      ? `${attrs.width_mm}mm W`      : "";
  const length       = attrs.length_mm     ? `${attrs.length_mm}mm L`     : "";

  const prefix = [plateType, "Plate"].filter(Boolean).join(" ");
  const spec   = [standard, grade].filter(Boolean).join(" ");
  const dims   = [thick, width, length].filter(Boolean).join(" x ");

  let result = [prefix, spec].filter(Boolean).join(" ");
  if (dims) result += (result ? ", " : "") + dims;
  return result;
}

// ── Plates structured form ────────────────────────────────────────────────────
function PlatesAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plate Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Plate Type <span className="text-red-500">*</span></Label>
          <Input
            className="h-8 text-sm" placeholder="e.g. MS, SS 304, Chequered"
            value={(attrs.plate_type as string) ?? ""}
            onChange={(e) => set("plate_type", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Material Grade</Label>
          <Input
            className="h-8 text-sm" placeholder="e.g. E250, E350, 304L"
            value={(attrs.material_grade as string) ?? ""}
            onChange={(e) => set("material_grade", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Thickness (mm) <span className="text-red-500">*</span></Label>
          <Input
            className="h-8 text-sm" type="number" placeholder="e.g. 10"
            value={(attrs.thickness_mm as string) ?? ""}
            onChange={(e) => set("thickness_mm", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Width (mm)</Label>
          <Input
            className="h-8 text-sm" type="number" placeholder="e.g. 1500"
            value={(attrs.width_mm as string) ?? ""}
            onChange={(e) => set("width_mm", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Length (mm)</Label>
          <Input
            className="h-8 text-sm" type="number" placeholder="e.g. 3000"
            value={(attrs.length_mm as string) ?? ""}
            onChange={(e) => set("length_mm", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Standard</Label>
          <Input
            className="h-8 text-sm" placeholder="e.g. IS 2062, ASTM A36"
            value={(attrs.standard as string) ?? ""}
            onChange={(e) => set("standard", e.target.value)}
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input
            className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty}
            onChange={(e) => onQtyChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Technical attributes form ─────────────────────────────────────────────────
function TechnicalAttrsForm({
  groupCode, attrs, onChange,
}: { groupCode: string; attrs: Record<string, unknown>; onChange: (a: Record<string, unknown>) => void }) {
  const fields = TA_FIELDS[groupCode];
  if (!fields || fields.length === 0) return null;
  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Technical Attributes</p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => {
          if (f.type === "boolean") {
            return (
              <div key={f.key} className="flex items-center gap-2">
                <Checkbox
                  id={`ta-${f.key}`}
                  checked={Boolean(attrs[f.key])}
                  onCheckedChange={(v) => onChange({ ...attrs, [f.key]: Boolean(v) })}
                />
                <Label htmlFor={`ta-${f.key}`} className="text-sm">{f.label}</Label>
              </div>
            );
          }
          return (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              <Input
                type={f.type === "number" ? "number" : "text"}
                value={(attrs[f.key] as string | number) ?? ""}
                onChange={(e) => {
                  const v = f.type === "number"
                    ? (e.target.value === "" ? undefined : Number(e.target.value))
                    : e.target.value;
                  onChange({ ...attrs, [f.key]: v });
                }}
                className="h-8 text-sm"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Flag badges ───────────────────────────────────────────────────────────────
const FLAGS = [
  { key: "selection_required",   short: "SEL"  },
  { key: "datasheet_required",   short: "DS"   },
  { key: "inspection_required",  short: "INSP" },
  { key: "certificate_required", short: "CERT" },
  { key: "compliance_required",  short: "COMP" },
] as const;

function FlagBadges({ line }: { line: PackageLine }) {
  const active = FLAGS.filter((f) => line[f.key as keyof PackageLine]);
  if (active.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex gap-1 flex-wrap">
      {active.map((f) => (
        <span key={f.key} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">
          {f.short}
        </span>
      ))}
    </div>
  );
}

// ── Line form default ─────────────────────────────────────────────────────────
const EMPTY_LINE = {
  buyGroupId: "", buySubgroupId: "", uomId: "",
  genericRequirement: "", defaultQuantity: "1", defaultSpecification: "",
  selectionRequired: true, datasheetRequired: false, inspectionRequired: false,
  certificateRequired: false, complianceRequired: false,
  notes: "", technicalAttributes: {} as Record<string, unknown>,
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BuyPackagesPage() {
  const { toast } = useToast();
  const { user }  = useAuth();
  const role      = (user as any)?.role as string | undefined;
  const canWrite  = isManager(role);
  const canAction = isSeniorManager(role);

  // Filters / expand
  const [statusFilter,   setStatusFilter]   = useState<"all" | "draft" | "active" | "archived">("all");
  const [productFilter,  setProductFilter]  = useState<string>("all");
  const [search,         setSearch]         = useState("");
  const [expandedId,     setExpandedId]     = useState<number | null>(null);
  const [activeGroupTab, setActiveGroupTab] = useState<Record<number, string>>({});

  // Details drawer state
  const [detailsDrawer, setDetailsDrawer] = useState<{
    open: boolean;
    pkg: BuyPackage | null;
    grp: { id: number; code: string; label: string } | null;
    sub: { id: number; code: string; label: string } | null;
  }>({ open: false, pkg: null, grp: null, sub: null });

  // Dialogs
  const [showCreate, setShowCreate]     = useState(false);
  const [editPkg,    setEditPkg]        = useState<BuyPackage | null>(null);
  const [lineDialog, setLineDialog]     = useState<{
    open: boolean; pkgId: number; pkgStatus: string; editLine: PackageLine | null;
    lock: { groupId: string; groupCode: string; groupLabel: string; subgroupId: string; subgroupCode: string; subgroupLabel: string } | null;
  }>({ open: false, pkgId: 0, pkgStatus: "", editLine: null, lock: null });

  // Header form
  const [hdr, setHdr] = useState({ productId: "", packageCode: "", name: "", description: "" });
  const [codeLoading, setCodeLoading] = useState(false);

  // Line form
  const [lf, setLf] = useState({ ...EMPTY_LINE });

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: packages = [], isLoading: pkgLoad } = useQuery<BuyPackage[]>({
    queryKey: ["/api/buy-packages"],
  });

  const { data: expandedLines = [], isLoading: linesLoad } = useQuery<PackageLine[]>({
    queryKey: ["/api/buy-packages", expandedId, "lines"],
    queryFn: () =>
      fetch(`/api/buy-packages/${expandedId}/lines`, { credentials: "include" }).then((r) => r.json()),
    enabled: expandedId !== null,
  });

  const { data: groups = [] } = useQuery<BuyGroup[]>({ queryKey: ["/api/buy-groups"] });

  const { data: subgroups = [] } = useQuery<BuySubgroup[]>({
    queryKey: ["/api/buy-groups", lf.buyGroupId, "subgroups"],
    queryFn: () =>
      fetch(`/api/buy-groups/${lf.buyGroupId}/subgroups`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!lf.buyGroupId,
  });

  const { data: allSubgroups = [] } = useQuery<BuySubgroup[]>({
    queryKey: ["/api/buy-subgroups-all", groups.map((g) => g.id).join(",")],
    queryFn: async () => {
      if (groups.length === 0) return [];
      const results = await Promise.all(
        groups.map((g) =>
          fetch(`/api/buy-groups/${g.id}/subgroups`, { credentials: "include" }).then((r) => r.json()),
        ),
      );
      return (results as BuySubgroup[][]).flat();
    },
    enabled: groups.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: uoms = [] } = useQuery<UomMaster[]>({ queryKey: ["/api/uom-master"] });

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/sales-marketing/products"],
  });
  const buyProducts = allProducts.filter((p) => p.isGrandparent === true);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const visiblePackages = packages.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (productFilter !== "all" && String(p.productId) !== productFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.packageCode.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.productCode ?? "").toLowerCase().includes(q) ||
        (p.productDescription ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedGroupCode    = groups.find((g)   => String(g.id) === String(lf.buyGroupId))?.code    ?? "";
  const selectedSubgroupCode = subgroups.find((s) => String(s.id) === String(lf.buySubgroupId))?.code ?? "";
  const isPlatesMode =
    (lineDialog.lock?.subgroupCode === "plates") ||
    (selectedGroupCode === "raw_materials" && selectedSubgroupCode === "plates");

  // ── Invalidation helpers ──────────────────────────────────────────────────────
  const invalidatePkgs  = () => queryClient.invalidateQueries({ queryKey: ["/api/buy-packages"] });
  const invalidateLines = (pid: number) => {
    queryClient.invalidateQueries({ queryKey: ["/api/buy-packages", pid, "lines"] });
    invalidatePkgs();
  };

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createPkg = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/buy-packages", body),
    onSuccess: () => { toast({ title: "Package created" }); setShowCreate(false); invalidatePkgs(); },
    onError:   (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const patchPkg = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => apiRequest("PATCH", `/api/buy-packages/${id}`, body),
    onSuccess: () => { toast({ title: "Package updated" }); setEditPkg(null); invalidatePkgs(); },
    onError:   (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activatePkg = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/buy-packages/${id}/activate`, {}),
    onSuccess: () => { toast({ title: "Package activated" }); invalidatePkgs(); },
    onError:   (e: any) => toast({ title: "Cannot activate", description: e.message, variant: "destructive" }),
  });

  const archivePkg = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/buy-packages/${id}/archive`, {}),
    onSuccess: () => { toast({ title: "Package archived" }); invalidatePkgs(); },
    onError:   (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addLineMutation = useMutation({
    mutationFn: ({ pkgId, body }: { pkgId: number; body: object }) =>
      apiRequest("POST", `/api/buy-packages/${pkgId}/lines`, body),
    onSuccess: (_, v) => {
      toast({ title: "Line added" });
      setLineDialog({ open: false, pkgId: 0, pkgStatus: "", editLine: null });
      invalidateLines(v.pkgId);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editLineMutation = useMutation({
    mutationFn: ({ lineId, pkgId, body }: { lineId: number; pkgId: number; body: object }) =>
      apiRequest("PATCH", `/api/buy-package-lines/${lineId}`, body),
    onSuccess: (_, v) => {
      toast({ title: "Line updated" });
      setLineDialog({ open: false, pkgId: 0, pkgStatus: "", editLine: null });
      invalidateLines(v.pkgId);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLineMutation = useMutation({
    mutationFn: ({ lineId }: { lineId: number }) =>
      apiRequest("DELETE", `/api/buy-package-lines/${lineId}`, undefined),
    onSuccess: () => { toast({ title: "Line deleted" }); if (expandedId) invalidateLines(expandedId); },
    onError:   (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const fetchGeneratedCode = useCallback(async (productId: string) => {
    if (!productId) return;
    setCodeLoading(true);
    try {
      const res = await fetch(`/api/buy-packages/generate-code?productId=${productId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setHdr((h) => ({ ...h, packageCode: data.packageCode }));
      }
    } catch {
      // silently ignore — user can type manually
    } finally {
      setCodeLoading(false);
    }
  }, []);

  function openCreate() {
    setHdr({ productId: "", packageCode: "", name: "", description: "" });
    setShowCreate(true);
  }

  function openEdit(pkg: BuyPackage) {
    setHdr({ productId: String(pkg.productId), packageCode: pkg.packageCode, name: pkg.name, description: pkg.description ?? "" });
    setEditPkg(pkg);
  }

  function openAddLine(pkg: BuyPackage) {
    setLf({ ...EMPTY_LINE });
    setLineDialog({ open: true, pkgId: pkg.id, pkgStatus: pkg.status, editLine: null, lock: null });
  }

  function openAddLineForSubgroup(
    pkg: BuyPackage,
    groupId: number, groupCode: string, groupLabel: string,
    subgroupId: number, subgroupCode: string, subgroupLabel: string,
  ) {
    setLf({ ...EMPTY_LINE, buyGroupId: String(groupId), buySubgroupId: String(subgroupId) });
    setLineDialog({
      open: true, pkgId: pkg.id, pkgStatus: pkg.status, editLine: null,
      lock: { groupId: String(groupId), groupCode, groupLabel, subgroupId: String(subgroupId), subgroupCode, subgroupLabel },
    });
  }

  function openEditLine(pkg: BuyPackage, line: PackageLine) {
    setLf({
      buyGroupId: String(line.buy_group_id), buySubgroupId: String(line.buy_subgroup_id), uomId: String(line.uom_id),
      genericRequirement: line.generic_requirement, defaultQuantity: line.default_quantity,
      defaultSpecification: line.default_specification ?? "",
      selectionRequired: line.selection_required, datasheetRequired: line.datasheet_required,
      inspectionRequired: line.inspection_required, certificateRequired: line.certificate_required,
      complianceRequired: line.compliance_required, notes: line.notes ?? "",
      technicalAttributes: (line.technical_attributes ?? {}) as Record<string, unknown>,
    });
    setLineDialog({
      open: true, pkgId: pkg.id, pkgStatus: pkg.status, editLine: line,
      lock: { groupId: String(line.buy_group_id), groupCode: line.buy_group_code, groupLabel: line.buy_group_label, subgroupId: String(line.buy_subgroup_id), subgroupCode: line.buy_subgroup_code, subgroupLabel: line.buy_subgroup_label },
    });
  }

  function submitHeader(isEdit: boolean) {
    if (!hdr.productId || !hdr.packageCode || !hdr.name) {
      toast({ title: "Product, package code, and name are required", variant: "destructive" }); return;
    }
    const body = {
      productId: Number(hdr.productId),
      packageCode: hdr.packageCode.trim().toUpperCase(),
      name: hdr.name.trim(),
      description: hdr.description.trim() || null,
    };
    if (isEdit && editPkg) {
      patchPkg.mutate({ id: editPkg.id, body: { name: body.name, description: body.description } });
    } else {
      createPkg.mutate(body);
    }
  }

  function submitLine() {
    const { editLine, pkgId } = lineDialog;
    if (!lf.buyGroupId || !lf.buySubgroupId || !lf.uomId) {
      toast({ title: "Group, subgroup, and UOM are required", variant: "destructive" }); return;
    }
    if (isPlatesMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.plate_type as string)?.trim() || !(ta.thickness_mm)) {
        toast({ title: "Plate Type and Thickness are required", variant: "destructive" }); return;
      }
    } else if (!lf.genericRequirement.trim()) {
      toast({ title: "Generic Requirement is required", variant: "destructive" }); return;
    }
    const body = {
      buyGroupId:           Number(lf.buyGroupId),
      buySubgroupId:        Number(lf.buySubgroupId),
      uomId:                Number(lf.uomId),
      genericRequirement:   lf.genericRequirement.trim(),
      defaultQuantity:      lf.defaultQuantity,
      defaultSpecification: lf.defaultSpecification.trim() || null,
      selectionRequired:    lf.selectionRequired,
      datasheetRequired:    lf.datasheetRequired,
      inspectionRequired:   lf.inspectionRequired,
      certificateRequired:  lf.certificateRequired,
      complianceRequired:   lf.complianceRequired,
      notes:                lf.notes.trim() || null,
      technicalAttributes:  Object.keys(lf.technicalAttributes).length > 0 ? lf.technicalAttributes : null,
    };
    if (editLine) {
      editLineMutation.mutate({ lineId: editLine.id, pkgId, body });
    } else {
      addLineMutation.mutate({ pkgId, body });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-screen-xl mx-auto p-6 space-y-5">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              BUY Package Catalog
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Standard procurement templates — Phase 1 · PPPC
            </p>
          </div>
          {canWrite && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> New Package
            </Button>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search code, name, product…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {/* Product family filter */}
            <div className="w-52">
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All product families" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All product families</SelectItem>
                  {buyProducts.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.productCode} — {p.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1 flex-wrap">
              {(["all", "draft", "active", "archived"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {s === "all" ? "All" : STATUS[s]?.label ?? s}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Main table */}
        {pkgLoad ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : visiblePackages.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">No packages found.</p>
              {canWrite && (
                <Button variant="outline" className="mt-4 gap-2" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Create First Package
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-8" />
                  <TableHead>Package Code</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center w-16">Ver.</TableHead>
                  <TableHead className="text-center w-28">Status</TableHead>
                  <TableHead className="text-center w-16">Lines</TableHead>
                  <TableHead className="text-right w-44">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePackages.map((pkg) => {
                  const isExpanded = expandedId === pkg.id;
                  const scfg = STATUS[pkg.status] ?? STATUS.draft;
                  return (
                    <Fragment key={pkg.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setExpandedId((cur) => (cur === pkg.id ? null : pkg.id))}
                      >
                        <TableCell className="pl-4">
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm font-semibold">{pkg.packageCode}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-medium text-primary">{pkg.productCode}</span>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{pkg.productDescription}</p>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{pkg.name}</TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono text-sm text-muted-foreground">v{pkg.version}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${scfg.cls}`}>
                            {scfg.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                            <Layers className="h-3.5 w-3.5" />{pkg.lineCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {canWrite && pkg.status === "draft" && (
                              <Button variant="ghost" size="sm" onClick={() => openEdit(pkg)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            )}
                            {canAction && pkg.status === "draft" && (
                              <Button
                                variant="outline" size="sm"
                                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1"
                                onClick={() => activatePkg.mutate(pkg.id)}
                                disabled={activatePkg.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Activate
                              </Button>
                            )}
                            {canAction && pkg.status === "active" && (
                              <Button
                                variant="outline" size="sm"
                                className="text-orange-700 border-orange-200 hover:bg-orange-50 gap-1"
                                onClick={() => archivePkg.mutate(pkg.id)}
                                disabled={archivePkg.isPending}
                              >
                                <Archive className="h-3.5 w-3.5" /> Archive
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded lines — all groups as cards, all subgroups as rows */}
                      {isExpanded && (() => {
                        // Build lines lookup: groupId → subgroupId → lines[]
                        const linesMap = new Map<number, Map<number, PackageLine[]>>();
                        for (const line of expandedLines) {
                          if (!linesMap.has(line.buy_group_id)) linesMap.set(line.buy_group_id, new Map());
                          const gm = linesMap.get(line.buy_group_id)!;
                          if (!gm.has(line.buy_subgroup_id)) gm.set(line.buy_subgroup_id, []);
                          gm.get(line.buy_subgroup_id)!.push(line);
                        }
                        // Build group→subgroups structure from master data
                        const catalog = groups.map((g) => ({
                          ...g,
                          subgroups: allSubgroups.filter((s) => s.buy_group_id === g.id),
                        }));

                        return (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={8} className="p-0 bg-muted/20 border-t">
                              <div className="px-6 py-5 space-y-4">

                                {/* Section title */}
                                <h4 className="text-sm font-semibold text-foreground">
                                  Package Lines — <span className="font-mono text-xs text-muted-foreground">{pkg.packageCode}</span>
                                </h4>

                                {linesLoad || allSubgroups.length === 0 ? (
                                  <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                                  </div>
                                ) : (() => {
                                  const tabVal = activeGroupTab[pkg.id] ?? String(catalog[0]?.id ?? "");
                                  return (
                                    <Tabs
                                      value={tabVal}
                                      onValueChange={(v) => setActiveGroupTab((prev) => ({ ...prev, [pkg.id]: v }))}
                                    >
                                      {/* Tab strip — one trigger per BUY Group */}
                                      <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-1">
                                        {catalog.map((grp) => {
                                          const grpLineCount = Array.from(linesMap.get(grp.id)?.values() ?? []).reduce((a, v) => a + v.length, 0);
                                          return (
                                            <TabsTrigger
                                              key={grp.id}
                                              value={String(grp.id)}
                                              className="text-xs gap-1.5"
                                            >
                                              {grp.label}
                                              {grpLineCount > 0 && (
                                                <span className="ml-1 rounded-full bg-primary/15 text-primary px-1.5 py-0 text-[10px] font-semibold">
                                                  {grpLineCount}
                                                </span>
                                              )}
                                            </TabsTrigger>
                                          );
                                        })}
                                      </TabsList>

                                      {/* Tab panels — one per BUY Group */}
                                      {catalog.map((grp) => {
                                        const grpLinesMap = linesMap.get(grp.id);
                                        return (
                                          <TabsContent key={grp.id} value={String(grp.id)} className="mt-3">
                                            <div className="rounded-lg border bg-card divide-y">
                                              {grp.subgroups.map((sub) => {
                                                const subLines = grpLinesMap?.get(sub.id) ?? [];
                                                return (
                                                  <div key={sub.id} className="px-4 py-3 space-y-2">
                                                    {/* Subgroup header row */}
                                                    <div className="flex items-center justify-between">
                                                      <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium">{sub.label}</span>
                                                        {subLines.length > 0 && (
                                                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                                                            {subLines.length} line{subLines.length !== 1 ? "s" : ""}
                                                          </span>
                                                        )}
                                                      </div>
                                                      <div className="flex items-center gap-1.5">
                                                        {canWrite && pkg.status === "draft" && (
                                                          <Button
                                                            size="sm" variant="outline"
                                                            className="h-7 px-2 gap-1 text-xs"
                                                            onClick={() => openAddLineForSubgroup(
                                                              pkg,
                                                              grp.id, grp.code, grp.label,
                                                              sub.id, sub.code, sub.label,
                                                            )}
                                                          >
                                                            <Plus className="h-3 w-3" /> Add Line
                                                          </Button>
                                                        )}
                                                        <Button
                                                          size="sm" variant="outline"
                                                          className="h-7 px-2 gap-1 text-xs"
                                                          onClick={() => setDetailsDrawer({
                                                            open: true, pkg,
                                                            grp: { id: grp.id, code: grp.code, label: grp.label },
                                                            sub: { id: sub.id, code: sub.code, label: sub.label },
                                                          })}
                                                        >
                                                          <List className="h-3 w-3" /> Details
                                                        </Button>
                                                      </div>
                                                    </div>

                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </TabsContent>
                                        );
                                      })}
                                    </Tabs>
                                  );
                                })()}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })()}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* ── Create Package Dialog ─────────────────────────────────────────── */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New BUY Package</DialogTitle>
              <DialogDescription>Create a standard procurement template linked to a catalog product.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>BUY Product <span className="text-red-500">*</span></Label>
                <Select
                  value={hdr.productId}
                  onValueChange={(v) => {
                    const prod = buyProducts.find((p) => String(p.id) === v);
                    setHdr((h) => ({
                      ...h,
                      productId: v,
                      packageCode: "",
                      name: prod?.description ?? "",
                      description: prod?.description ?? "",
                    }));
                    fetchGeneratedCode(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a BUY catalog product…" />
                  </SelectTrigger>
                  <SelectContent>
                    {buyProducts.length === 0 && (
                      <SelectItem value="_none" disabled>No BUY products in catalog</SelectItem>
                    )}
                    {buyProducts.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.productCode} — {p.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Package Code <span className="text-red-500">*</span></Label>
                  <span className="text-[11px] text-muted-foreground">Auto-generated</span>
                </div>
                <div className="relative">
                  <Input
                    placeholder={codeLoading ? "Generating…" : "Select a product above"}
                    value={hdr.packageCode}
                    readOnly
                    maxLength={30}
                    className="font-mono pr-8 bg-muted cursor-not-allowed select-all"
                  />
                  {codeLoading && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Package Name <span className="text-red-500">*</span></Label>
                  <span className="text-[11px] text-muted-foreground">Auto-generated</span>
                </div>
                <Input
                  placeholder="Select a product above"
                  value={hdr.name}
                  readOnly
                  maxLength={255}
                  className="bg-muted cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Description</Label>
                  <span className="text-[11px] text-muted-foreground">From product</span>
                </div>
                <Textarea
                  placeholder="Select a product above"
                  value={hdr.description}
                  readOnly
                  rows={3}
                  className="bg-muted cursor-not-allowed resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => submitHeader(false)} disabled={createPkg.isPending}>
                {createPkg.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Package
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Edit Package Dialog ───────────────────────────────────────────── */}
        <Dialog open={!!editPkg} onOpenChange={(o) => !o && setEditPkg(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Package — {editPkg?.packageCode}</DialogTitle>
              <DialogDescription>Package code and product cannot be changed on an existing package.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Package Name <span className="text-red-500">*</span></Label>
                <Input value={hdr.name} onChange={(e) => setHdr((h) => ({ ...h, name: e.target.value }))} maxLength={255} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={hdr.description} onChange={(e) => setHdr((h) => ({ ...h, description: e.target.value }))} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditPkg(null)}>Cancel</Button>
              <Button onClick={() => submitHeader(true)} disabled={patchPkg.isPending}>
                {patchPkg.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Add / Edit Line Dialog ────────────────────────────────────────── */}
        <Dialog
          open={lineDialog.open}
          onOpenChange={(o) => !o && setLineDialog({ open: false, pkgId: 0, pkgStatus: "", editLine: null, lock: null })}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{lineDialog.editLine ? "Edit Line" : "Add Line"}</DialogTitle>
              <DialogDescription>
                {lineDialog.lock
                  ? <>Adding to <strong>{lineDialog.lock.groupLabel}</strong> → <strong>{lineDialog.lock.subgroupLabel}</strong></>
                  : lineDialog.editLine ? "Modify this procurement line." : "Define a procurement requirement for this package."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">

              {/* Group / Subgroup / UOM */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Group <span className="text-red-500">*</span></Label>
                  {lineDialog.lock ? (
                    <div className="h-9 px-3 flex items-center text-sm bg-muted rounded-md border font-medium">
                      {lineDialog.lock.groupLabel}
                    </div>
                  ) : (
                    <Select
                      value={lf.buyGroupId}
                      onValueChange={(v) => setLf((f) => ({ ...f, buyGroupId: v, buySubgroupId: "", technicalAttributes: {}, genericRequirement: "" }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Subgroup <span className="text-red-500">*</span></Label>
                  {lineDialog.lock ? (
                    <div className="h-9 px-3 flex items-center text-sm bg-muted rounded-md border">
                      {lineDialog.lock.subgroupLabel}
                    </div>
                  ) : (
                    <Select
                      value={lf.buySubgroupId}
                      onValueChange={(v) => setLf((f) => ({ ...f, buySubgroupId: v, technicalAttributes: {}, genericRequirement: "" }))}
                      disabled={!lf.buyGroupId}
                    >
                      <SelectTrigger><SelectValue placeholder={lf.buyGroupId ? "Select…" : "Pick group first"} /></SelectTrigger>
                      <SelectContent>
                        {subgroups.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>UOM <span className="text-red-500">*</span></Label>
                  <Select value={lf.uomId} onValueChange={(v) => setLf((f) => ({ ...f, uomId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {uoms.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.code} — {u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Plates mode: structured plate fields + auto-generated requirement */}
              {isPlatesMode ? (
                <>
                  <PlatesAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildPlatesRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  {/* Auto-generated Generic Requirement */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated from fields above)</span>
                    </Label>
                    <Input
                      readOnly
                      className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Plate Type and Thickness to generate…"}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Requirement + Qty */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-3 space-y-1.5">
                      <Label>Generic Requirement <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="e.g. Feed Pump, Suction Strainer"
                        value={lf.genericRequirement}
                        onChange={(e) => setLf((f) => ({ ...f, genericRequirement: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Default Qty</Label>
                      <Input
                        type="number" min="0.01" step="0.01"
                        value={lf.defaultQuantity}
                        onChange={(e) => setLf((f) => ({ ...f, defaultQuantity: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Default Specification */}
                  <div className="space-y-1.5">
                    <Label>Default Specification</Label>
                    <Textarea
                      placeholder="Optional technical specification…"
                      value={lf.defaultSpecification}
                      onChange={(e) => setLf((f) => ({ ...f, defaultSpecification: e.target.value }))}
                      rows={2}
                    />
                  </div>

                  {/* Group-specific Technical Attributes */}
                  {selectedGroupCode && (
                    <TechnicalAttrsForm
                      groupCode={selectedGroupCode}
                      attrs={lf.technicalAttributes}
                      onChange={(attrs) => setLf((f) => ({ ...f, technicalAttributes: attrs }))}
                    />
                  )}
                </>
              )}

              {/* Required Flags */}
              <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Required Flags</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { key: "selectionRequired",   label: "Selection Required" },
                    { key: "datasheetRequired",   label: "Datasheet Required" },
                    { key: "inspectionRequired",  label: "Inspection Required" },
                    { key: "certificateRequired", label: "Certificate Required" },
                    { key: "complianceRequired",  label: "Compliance Required" },
                  ].map((flag) => (
                    <div key={flag.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`fl-${flag.key}`}
                        checked={lf[flag.key as keyof typeof lf] as boolean}
                        onCheckedChange={(v) => setLf((f) => ({ ...f, [flag.key]: Boolean(v) }))}
                      />
                      <Label htmlFor={`fl-${flag.key}`} className="text-sm">{flag.label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Optional notes…"
                  value={lf.notes}
                  onChange={(e) => setLf((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setLineDialog({ open: false, pkgId: 0, pkgStatus: "", editLine: null })}
              >
                Cancel
              </Button>
              <Button
                onClick={submitLine}
                disabled={addLineMutation.isPending || editLineMutation.isPending}
              >
                {(addLineMutation.isPending || editLineMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {lineDialog.editLine ? "Save Changes" : "Add Line"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Subgroup Details Dialog ──────────────────────────────────────── */}
        {detailsDrawer.open && detailsDrawer.pkg && detailsDrawer.grp && detailsDrawer.sub && (() => {
          const dpkg = detailsDrawer.pkg!;
          const dgrp = detailsDrawer.grp!;
          const dsub = detailsDrawer.sub!;
          const dlines = expandedLines.filter(
            (l) => l.buy_group_id === dgrp.id && l.buy_subgroup_id === dsub.id,
          );
          const isDraft = dpkg.status === "draft";
          return (
            <Dialog
              open={detailsDrawer.open}
              onOpenChange={(o) => !o && setDetailsDrawer((s) => ({ ...s, open: false }))}
            >
              <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col gap-0 p-0">
                {/* Header */}
                <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <DialogTitle className="text-base">
                        {dgrp.label} — {dsub.label}
                      </DialogTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {dpkg.packageCode} · {dlines.length} line{dlines.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {canWrite && isDraft && (
                      <Button
                        size="sm" className="h-8 gap-1.5 shrink-0"
                        onClick={() => {
                          setDetailsDrawer((s) => ({ ...s, open: false }));
                          openAddLineForSubgroup(
                            dpkg,
                            dgrp.id, dgrp.code, dgrp.label,
                            dsub.id, dsub.code, dsub.label,
                          );
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Line
                      </Button>
                    )}
                  </div>
                </DialogHeader>

                {/* Body — scrollable table */}
                <div className="flex-1 overflow-auto px-6 py-4">
                  {dlines.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                      <List className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No lines added yet for this subgroup.</p>
                      {canWrite && isDraft && (
                        <Button
                          size="sm" variant="outline" className="mt-2 gap-1.5"
                          onClick={() => {
                            setDetailsDrawer((s) => ({ ...s, open: false }));
                            openAddLineForSubgroup(
                              dpkg,
                              dgrp.id, dgrp.code, dgrp.label,
                              dsub.id, dsub.code, dsub.label,
                            );
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" /> Add First Line
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Requirement</TableHead>
                          <TableHead className="w-16 text-right">Qty</TableHead>
                          <TableHead className="w-16">UOM</TableHead>
                          <TableHead className="w-36">Flags</TableHead>
                          {canWrite && isDraft && <TableHead className="w-16 text-center">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dlines.map((line, idx) => (
                          <TableRow key={line.id} className="text-xs align-top">
                            <TableCell className="text-muted-foreground font-mono pt-3">{idx + 1}</TableCell>
                            <TableCell className="max-w-xs pt-3">
                              <p className="leading-snug">{line.generic_requirement}</p>
                              {line.default_specification && (
                                <p className="text-muted-foreground text-[11px] mt-0.5 leading-snug">{line.default_specification}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono pt-3">{line.default_quantity}</TableCell>
                            <TableCell className="pt-3">{line.uom_code}</TableCell>
                            <TableCell className="pt-3">
                              <div className="flex flex-wrap gap-1">
                                {line.selection_required   && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">SEL</span>}
                                {line.datasheet_required   && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">DS</span>}
                                {line.inspection_required  && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">INSP</span>}
                                {line.certificate_required && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">CERT</span>}
                                {line.compliance_required  && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">COMP</span>}
                                {!line.selection_required && !line.datasheet_required && !line.inspection_required && !line.certificate_required && !line.compliance_required && (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </div>
                            </TableCell>
                            {canWrite && isDraft && (
                              <TableCell className="text-center pt-2">
                                <div className="flex items-center justify-center gap-0.5">
                                  <Button
                                    variant="ghost" size="sm" className="h-7 w-7 p-0"
                                    title="Edit line"
                                    onClick={() => {
                                      setDetailsDrawer((s) => ({ ...s, open: false }));
                                      openEditLine(dpkg, line);
                                    }}
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost" size="sm"
                                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                    title="Delete line"
                                    onClick={() => {
                                      if (confirm("Delete this line?")) {
                                        deleteLineMutation.mutate({ lineId: line.id });
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          );
        })()}

      </div>
    </Layout>
  );
}
