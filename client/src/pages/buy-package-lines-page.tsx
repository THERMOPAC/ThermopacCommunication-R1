import { useState, useCallback } from "react";
import { useParams, Link } from "wouter";
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
import { Badge } from "@/components/ui/badge";
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
  Plus, ArrowLeft, Package, Layers, Edit2, Trash2, Loader2,
  Search, AlertCircle, ChevronRight,
} from "lucide-react";

// ── Role helpers ───────────────────────────────────────────────────────────────
const ROLE_LEVEL: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2,
  Manager: 3, "Senior Executive": 4, Employee: 5,
};
const rl = (role?: string) => ROLE_LEVEL[role ?? ""] ?? 999;
const isManager = (r?: string) => rl(r) <= 3;

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; cls: string }> = {
  draft:    { label: "Draft",    cls: "bg-slate-100 text-slate-700 border border-slate-200" },
  active:   { label: "Active",   cls: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
  archived: { label: "Archived", cls: "bg-orange-100 text-orange-800 border border-orange-200" },
};

// ── Technical attribute field definitions ─────────────────────────────────────
type TAField = { key: string; label: string; type: "text" | "number" | "boolean" };
const TA_FIELDS: Record<string, TAField[]> = {
  pumps: [
    { key: "flow_m3hr",        label: "Flow Rate (m³/hr)",   type: "number" },
    { key: "head_m",           label: "Head (m)",             type: "number" },
    { key: "fluid",            label: "Fluid",                type: "text"   },
    { key: "operating_temp_c", label: "Operating Temp (°C)",  type: "number" },
    { key: "moc",              label: "MOC",                  type: "text"   },
    { key: "seal_type",        label: "Seal Type",            type: "text"   },
    { key: "mounting",         label: "Mounting",             type: "text"   },
    { key: "motor_coupling",   label: "Motor Coupling",       type: "boolean"},
    { key: "duty_class",       label: "Duty Class",           type: "text"   },
  ],
  motors: [
    { key: "kw",                  label: "Power (kW)",          type: "number" },
    { key: "hp",                  label: "Power (HP)",          type: "number" },
    { key: "voltage_v",           label: "Voltage (V)",         type: "number" },
    { key: "phase",               label: "Phase",               type: "text"   },
    { key: "frequency_hz",        label: "Frequency (Hz)",      type: "number" },
    { key: "rpm",                 label: "RPM",                 type: "number" },
    { key: "duty",                label: "Duty",                type: "text"   },
    { key: "mounting",            label: "Mounting",            type: "text"   },
    { key: "ip_rating",           label: "IP Rating",           type: "text"   },
    { key: "area_classification", label: "Area Classification", type: "text"   },
    { key: "efficiency_class",    label: "Efficiency Class",    type: "text"   },
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
    { key: "panel_type",         label: "Panel Type",        type: "text"   },
    { key: "voltage_v",          label: "Voltage (V)",       type: "number" },
    { key: "phase",              label: "Phase",             type: "text"   },
    { key: "ip_rating",          label: "IP Rating",         type: "text"   },
    { key: "enclosure_material", label: "Enclosure Material",type: "text"   },
  ],
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface PackageHeader {
  id: number; product_id: number; product_code: string; product_description: string;
  package_code: string; name: string; description: string | null;
  version: number; status: string; line_count: number;
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

// ── Flag badges ────────────────────────────────────────────────────────────────
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

// ── Plates requirement builder ─────────────────────────────────────────────────
function buildPlatesRequirement(attrs: Record<string, unknown>): string {
  const plateType = (attrs.plate_type as string)?.trim() || "";
  const grade     = (attrs.material_grade as string)?.trim() || "";
  const standard  = (attrs.standard as string)?.trim() || "";
  const thick     = attrs.thickness_mm ? `${attrs.thickness_mm}mm Thk` : "";
  const width     = attrs.width_mm     ? `${attrs.width_mm}mm W`       : "";
  const length    = attrs.length_mm    ? `${attrs.length_mm}mm L`      : "";
  const prefix    = [plateType, "Plate"].filter(Boolean).join(" ");
  const suffix    = [grade, standard].filter(Boolean).join(" ");
  const dims      = [thick, width, length].filter(Boolean).join(" x ");
  return [prefix, suffix, dims].filter(Boolean).join(", ");
}

// ── PlatesAttrsForm ────────────────────────────────────────────────────────────
function PlatesAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: { attrs: Record<string, unknown>; qty: string; onChange: (a: Record<string, unknown>) => void; onQtyChange: (q: string) => void }) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plate Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Plate Type <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" placeholder="e.g. MS, SS 304" value={(attrs.plate_type as string) ?? ""} onChange={(e) => set("plate_type", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Material Grade</Label>
          <Input className="h-8 text-sm" placeholder="e.g. E250, E350" value={(attrs.material_grade as string) ?? ""} onChange={(e) => set("material_grade", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Thickness (mm) <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" placeholder="e.g. 10" value={(attrs.thickness_mm as string) ?? ""} onChange={(e) => set("thickness_mm", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Width (mm)</Label>
          <Input className="h-8 text-sm" type="number" placeholder="e.g. 1500" value={(attrs.width_mm as string) ?? ""} onChange={(e) => set("width_mm", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Length (mm)</Label>
          <Input className="h-8 text-sm" type="number" placeholder="e.g. 3000" value={(attrs.length_mm as string) ?? ""} onChange={(e) => set("length_mm", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Standard</Label>
          <Input className="h-8 text-sm" placeholder="e.g. IS 2062" value={(attrs.standard as string) ?? ""} onChange={(e) => set("standard", e.target.value)} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01" value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── TechnicalAttrsForm ─────────────────────────────────────────────────────────
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
                <Checkbox id={`ta-${f.key}`} checked={Boolean(attrs[f.key])} onCheckedChange={(v) => onChange({ ...attrs, [f.key]: Boolean(v) })} />
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
                  const v = f.type === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value;
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

// ── Empty line form default ────────────────────────────────────────────────────
const EMPTY_LINE = {
  buyGroupId: "", buySubgroupId: "", uomId: "",
  genericRequirement: "", defaultQuantity: "1", defaultSpecification: "",
  selectionRequired: true, datasheetRequired: false, inspectionRequired: false,
  certificateRequired: false, complianceRequired: false,
  notes: "", technicalAttributes: {} as Record<string, unknown>,
};

// ── Main page ──────────────────────────────────────────────────────────────────
export default function BuyPackageLinesPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const pkgId = parseInt(idParam ?? "");

  const { toast }  = useToast();
  const { user }   = useAuth();
  const role       = (user as any)?.role as string | undefined;
  const canWrite   = isManager(role);

  const [search,        setSearch]        = useState("");
  const [activeTab,     setActiveTab]     = useState<string>("");
  const [lineDialog, setLineDialog] = useState<{
    open: boolean; editLine: PackageLine | null;
    lock: { groupId: string; groupCode: string; groupLabel: string; subgroupId: string; subgroupCode: string; subgroupLabel: string } | null;
  }>({ open: false, editLine: null, lock: null });
  const [lf, setLf] = useState({ ...EMPTY_LINE });

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: pkg, isLoading: pkgLoad, isError: pkgError } = useQuery<PackageHeader>({
    queryKey: ["/api/buy-packages", pkgId],
    queryFn: () => fetch(`/api/buy-packages/${pkgId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !isNaN(pkgId),
  });

  const { data: lines = [], isLoading: linesLoad } = useQuery<PackageLine[]>({
    queryKey: ["/api/buy-packages", pkgId, "lines"],
    queryFn: () => fetch(`/api/buy-packages/${pkgId}/lines`, { credentials: "include" }).then((r) => r.json()),
    enabled: !isNaN(pkgId),
  });

  const { data: groups = [] } = useQuery<BuyGroup[]>({ queryKey: ["/api/buy-groups"] });

  const { data: subgroups = [] } = useQuery<BuySubgroup[]>({
    queryKey: ["/api/buy-groups", lf.buyGroupId, "subgroups"],
    queryFn: () => fetch(`/api/buy-groups/${lf.buyGroupId}/subgroups`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!lf.buyGroupId,
  });

  const { data: allSubgroups = [] } = useQuery<BuySubgroup[]>({
    queryKey: ["/api/buy-subgroups-all", groups.map((g) => g.id).join(",")],
    queryFn: async () => {
      if (groups.length === 0) return [];
      const results = await Promise.all(
        groups.map((g) => fetch(`/api/buy-groups/${g.id}/subgroups`, { credentials: "include" }).then((r) => r.json())),
      );
      return (results as BuySubgroup[][]).flat();
    },
    enabled: groups.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: uoms = [] } = useQuery<UomMaster[]>({ queryKey: ["/api/uom-master"] });

  // ── Derived state ──────────────────────────────────────────────────────────
  const currentTab = activeTab || (groups[0] ? String(groups[0].id) : "");

  const filteredLines = search.trim()
    ? lines.filter((l) => {
        const q = search.toLowerCase();
        return (
          l.generic_requirement.toLowerCase().includes(q) ||
          l.buy_group_label.toLowerCase().includes(q) ||
          l.buy_subgroup_label.toLowerCase().includes(q) ||
          l.uom_code.toLowerCase().includes(q)
        );
      })
    : lines;

  // lines map: group_id → subgroup_id → lines[]
  const linesMap = new Map<number, Map<number, PackageLine[]>>();
  for (const line of filteredLines) {
    if (!linesMap.has(line.buy_group_id)) linesMap.set(line.buy_group_id, new Map());
    const gm = linesMap.get(line.buy_group_id)!;
    if (!gm.has(line.buy_subgroup_id)) gm.set(line.buy_subgroup_id, []);
    gm.get(line.buy_subgroup_id)!.push(line);
  }

  const selectedGroupCode    = groups.find((g)   => String(g.id) === lf.buyGroupId)?.code    ?? "";
  const selectedSubgroupCode = subgroups.find((s) => String(s.id) === lf.buySubgroupId)?.code ?? "";
  const isPlatesMode =
    (lineDialog.lock?.subgroupCode === "plates") ||
    (selectedGroupCode === "raw_materials" && selectedSubgroupCode === "plates");

  // ── Invalidation ───────────────────────────────────────────────────────────
  const invalidateLines = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/buy-packages", pkgId, "lines"] });
    queryClient.invalidateQueries({ queryKey: ["/api/buy-packages", pkgId] });
    queryClient.invalidateQueries({ queryKey: ["/api/buy-packages"] });
  }, [pkgId]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addLineMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", `/api/buy-packages/${pkgId}/lines`, body),
    onSuccess: () => {
      toast({ title: "Line added" });
      setLineDialog({ open: false, editLine: null, lock: null });
      invalidateLines();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editLineMutation = useMutation({
    mutationFn: ({ lineId, body }: { lineId: number; body: object }) =>
      apiRequest("PATCH", `/api/buy-package-lines/${lineId}`, body),
    onSuccess: () => {
      toast({ title: "Line updated" });
      setLineDialog({ open: false, editLine: null, lock: null });
      invalidateLines();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLineMutation = useMutation({
    mutationFn: (lineId: number) => apiRequest("DELETE", `/api/buy-package-lines/${lineId}`, undefined),
    onSuccess: () => { toast({ title: "Line deleted" }); invalidateLines(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  function openAddLine(grp: BuyGroup) {
    setLf({ ...EMPTY_LINE, buyGroupId: String(grp.id) });
    setLineDialog({
      open: true, editLine: null,
      lock: { groupId: String(grp.id), groupCode: grp.code, groupLabel: grp.label, subgroupId: "", subgroupCode: "", subgroupLabel: "" },
    });
  }

  function openAddLineForSubgroup(
    grp: BuyGroup, sub: BuySubgroup,
  ) {
    setLf({ ...EMPTY_LINE, buyGroupId: String(grp.id), buySubgroupId: String(sub.id) });
    setLineDialog({
      open: true, editLine: null,
      lock: { groupId: String(grp.id), groupCode: grp.code, groupLabel: grp.label, subgroupId: String(sub.id), subgroupCode: sub.code, subgroupLabel: sub.label },
    });
  }

  function openEditLine(line: PackageLine) {
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
      open: true, editLine: line,
      lock: { groupId: String(line.buy_group_id), groupCode: line.buy_group_code, groupLabel: line.buy_group_label, subgroupId: String(line.buy_subgroup_id), subgroupCode: line.buy_subgroup_code, subgroupLabel: line.buy_subgroup_label },
    });
  }

  function submitLine() {
    if (!lf.buyGroupId || !lf.buySubgroupId || !lf.uomId) {
      toast({ title: "Group, subgroup, and UOM are required", variant: "destructive" }); return;
    }
    if (isPlatesMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.plate_type as string)?.trim() || !ta.thickness_mm) {
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
    if (lineDialog.editLine) {
      editLineMutation.mutate({ lineId: lineDialog.editLine.id, body });
    } else {
      addLineMutation.mutate(body);
    }
  }

  // ── Loading / error ────────────────────────────────────────────────────────
  if (isNaN(pkgId)) {
    return (
      <Layout>
        <div className="max-w-screen-xl mx-auto p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" /> Invalid package ID.
          </div>
        </div>
      </Layout>
    );
  }

  if (pkgLoad) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (pkgError || !pkg) {
    return (
      <Layout>
        <div className="max-w-screen-xl mx-auto p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" /> Package not found.
          </div>
          <Link href="/products/buy-packages">
            <Button variant="outline" className="mt-4 gap-2"><ArrowLeft className="h-4 w-4" /> Back to Catalog</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const scfg   = STATUS[pkg.status] ?? STATUS.draft;
  const isDraft = pkg.status === "draft";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-screen-xl mx-auto p-6 space-y-5">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/products/buy-packages">
            <button className="flex items-center gap-1 hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" /> BUY Package Catalog
            </button>
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-mono text-foreground font-medium">{pkg.package_code}</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">Lines</span>
        </div>

        {/* Package header summary */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-base">{pkg.package_code}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${scfg.cls}`}>
                      {scfg.label}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">v{pkg.version}</span>
                  </div>
                  <p className="text-sm font-medium mt-0.5">{pkg.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-primary font-medium">{pkg.product_code}</span>
                    {" · "}{pkg.product_description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-center">
                  <div className="flex items-center gap-1.5 text-2xl font-bold text-foreground">
                    <Layers className="h-5 w-5 text-primary" />
                    {lines.length}
                  </div>
                  <p className="text-xs text-muted-foreground">Total Lines</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search bar */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search requirement, group, subgroup…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Group tabs */}
        {(linesLoad || groups.length === 0) ? (
          <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading lines…
          </div>
        ) : (
          <Tabs value={currentTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-1">
              {groups.map((grp) => {
                const grpLineCount = Array.from(linesMap.get(grp.id)?.values() ?? []).reduce((a, v) => a + v.length, 0);
                return (
                  <TabsTrigger key={grp.id} value={String(grp.id)} className="text-xs gap-1.5">
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

            {groups.map((grp) => {
              const grpSubgroups = allSubgroups.filter((s) => s.buy_group_id === grp.id);
              const grpLinesMap  = linesMap.get(grp.id);
              const grpTotalLines = Array.from(grpLinesMap?.values() ?? []).reduce((a, v) => a + v.length, 0);

              return (
                <TabsContent key={grp.id} value={String(grp.id)} className="mt-4 space-y-4">

                  {/* Tab action bar */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {grpTotalLines === 0
                        ? "No lines in this group yet."
                        : `${grpTotalLines} line${grpTotalLines !== 1 ? "s" : ""} across ${grpSubgroups.filter((s) => (grpLinesMap?.get(s.id)?.length ?? 0) > 0).length} subgroup${grpSubgroups.filter((s) => (grpLinesMap?.get(s.id)?.length ?? 0) > 0).length !== 1 ? "s" : ""}`}
                      {search && <span className="ml-1 text-primary">(filtered)</span>}
                    </p>
                    {canWrite && isDraft && (
                      <Button size="sm" className="gap-1.5" onClick={() => openAddLine(grp)}>
                        <Plus className="h-3.5 w-3.5" /> Add Line
                      </Button>
                    )}
                  </div>

                  {/* Per-subgroup sections */}
                  {grpSubgroups.map((sub) => {
                    const subLines = grpLinesMap?.get(sub.id) ?? [];
                    if (subLines.length === 0 && search) return null;

                    return (
                      <Card key={sub.id} className="overflow-hidden">
                        {/* Subgroup header */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{sub.label}</span>
                            {subLines.length > 0 && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                {subLines.length} line{subLines.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          {canWrite && isDraft && subLines.length > 0 && (
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => openAddLineForSubgroup(grp, sub)}>
                              <Plus className="h-3 w-3" /> Add
                            </Button>
                          )}
                        </div>

                        {subLines.length === 0 ? (
                          <div className="px-4 py-4 text-center">
                            <p className="text-xs text-muted-foreground">No lines yet.</p>
                            {canWrite && isDraft && (
                              <Button size="sm" variant="outline" className="mt-2 gap-1 text-xs" onClick={() => openAddLineForSubgroup(grp, sub)}>
                                <Plus className="h-3 w-3" /> Add First Line
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/20">
                                <TableHead className="w-12 text-center">#</TableHead>
                                <TableHead>Generic Requirement</TableHead>
                                <TableHead className="w-28 text-center">Qty / UOM</TableHead>
                                <TableHead className="w-44">Flags</TableHead>
                                {canWrite && isDraft && <TableHead className="w-20 text-right">Actions</TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {subLines.map((line) => (
                                <TableRow key={line.id} className="hover:bg-muted/20">
                                  <TableCell className="text-center">
                                    <span className="font-mono text-xs text-muted-foreground">{line.line_number}</span>
                                  </TableCell>
                                  <TableCell>
                                    <p className="text-sm font-medium leading-snug">{line.generic_requirement}</p>
                                    {line.default_specification && (
                                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{line.default_specification}</p>
                                    )}
                                    {line.notes && (
                                      <p className="text-xs text-amber-600 mt-0.5">{line.notes}</p>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                                      {line.default_quantity} {line.uom_code}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <FlagBadges line={line} />
                                  </TableCell>
                                  {canWrite && isDraft && (
                                    <TableCell className="text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditLine(line)}>
                                          <Edit2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                          onClick={() => { if (confirm("Delete this line?")) deleteLineMutation.mutate(line.id); }}
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
                      </Card>
                    );
                  })}

                  {/* Empty group state */}
                  {grpTotalLines === 0 && !search && (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Layers className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                        <p className="text-muted-foreground text-sm">No lines in <strong>{grp.label}</strong> yet.</p>
                        {canWrite && isDraft && (
                          <Button variant="outline" className="mt-4 gap-2" onClick={() => openAddLine(grp)}>
                            <Plus className="h-4 w-4" /> Add First Line
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}

        {/* ── Add / Edit Line Dialog ─────────────────────────────────────────── */}
        <Dialog
          open={lineDialog.open}
          onOpenChange={(o) => !o && setLineDialog({ open: false, editLine: null, lock: null })}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{lineDialog.editLine ? "Edit Line" : "Add Line"}</DialogTitle>
              <DialogDescription>
                {lineDialog.lock?.subgroupId
                  ? <>Adding to <strong>{lineDialog.lock.groupLabel}</strong> → <strong>{lineDialog.lock.subgroupLabel}</strong></>
                  : lineDialog.editLine
                    ? "Modify this procurement line."
                    : `Adding line to ${lineDialog.lock?.groupLabel ?? "package"}.`}
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
                    <Select value={lf.buyGroupId} onValueChange={(v) => setLf((f) => ({ ...f, buyGroupId: v, buySubgroupId: "", technicalAttributes: {}, genericRequirement: "" }))}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Subgroup <span className="text-red-500">*</span></Label>
                  {lineDialog.lock?.subgroupId ? (
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

              {/* Plates mode vs generic */}
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Plate Type and Thickness to generate…"} />
                  </div>
                </>
              ) : (
                <>
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
                      <Input type="number" min="0.01" step="0.01" value={lf.defaultQuantity}
                        onChange={(e) => setLf((f) => ({ ...f, defaultQuantity: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Default Specification</Label>
                    <Textarea placeholder="Optional technical specification…" value={lf.defaultSpecification}
                      onChange={(e) => setLf((f) => ({ ...f, defaultSpecification: e.target.value }))} rows={2} />
                  </div>
                  {selectedGroupCode && (
                    <TechnicalAttrsForm groupCode={selectedGroupCode} attrs={lf.technicalAttributes}
                      onChange={(attrs) => setLf((f) => ({ ...f, technicalAttributes: attrs }))} />
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
                <Textarea placeholder="Optional notes…" value={lf.notes}
                  onChange={(e) => setLf((f) => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLineDialog({ open: false, editLine: null, lock: null })}>
                Cancel
              </Button>
              <Button onClick={submitLine} disabled={addLineMutation.isPending || editLineMutation.isPending}>
                {(addLineMutation.isPending || editLineMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {lineDialog.editLine ? "Save Changes" : "Add Line"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}
