import { useState, Fragment, useCallback } from "react";
import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, ChevronRight, ChevronUp, ChevronDown, Package, Layers,
  CheckCircle2, Archive, Edit2, Trash2, Loader2, Search, AlertCircle, List,
  ChevronsUpDown, Check, X, FileSpreadsheet, Printer, Copy, GitBranch,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CentrifugalPumpAttrsForm,
  GearPumpAttrsForm,
  ScrewPumpAttrsForm,
  MultistagePumpAttrsForm,
  DosingPumpAttrsForm,
  VacuumBoosterAttrsForm,
  VacuumPumpAttrsForm,
  PumpSkidAttrsForm,
  buildCentrifugalPumpRequirement,
  buildGearPumpRequirement,
  buildScrewPumpRequirement,
  buildMultistagePumpRequirement,
  buildDosingPumpRequirement,
  buildVacuumBoosterRequirement,
  buildVacuumPumpRequirement,
  buildPumpSkidRequirement,
} from "@/components/pump-attrs-forms";
import {
  PlatesAttrsForm, PipesAttrsForm, FittingsAttrsForm, FlangesAttrsForm,
  FastenersAttrsForm, GasketsAttrsForm, StructuralSteelAttrsForm,
  buildPlatesRequirement, buildPipesRequirement, buildFittingsRequirement,
  buildFlangesRequirement, buildFastenersRequirement, buildGasketsRequirement,
  buildStructuralSteelRequirement,
} from "@/components/piping-attrs-forms";
import {
  PressureAttrsForm, TemperatureAttrsForm, FlowAttrsForm, LevelAttrsForm,
  buildPressureRequirement, buildTemperatureRequirement, buildFlowRequirement,
  buildLevelRequirement, INSTRUMENT_CABLE_GLAND_DEFAULTS, applyTemperatureDefaults,
} from "@/components/instrument-attrs-forms";
import {
  MotorAttrsForm, buildMotorRequirement,
  NON_FLAMEPROOF_MOTOR_DEFAULTS, FLAMEPROOF_MOTOR_DEFAULTS,
  applyNonFlameproofMotorDefaults, applyFlameproofMotorDefaults,
} from "@/components/motor-attrs-forms";
import {
  PanelAttrsForm, CablingAttrsForm, JunctionBoxAttrsForm,
  CoolingTowerAttrsForm, BoughtOutAttrsForm, ComponentsAttrsForm,
  buildPanelRequirement, buildCablingRequirement, buildJunctionBoxRequirement,
  buildCoolingTowerRequirement, buildBoughtOutRequirement, buildComponentsRequirement,
} from "@/components/electrical-attrs-forms";
import {
  ControlValveAttrsForm, SafetyValveAttrsForm, OnOffValveAttrsForm, IsolationValveAttrsForm,
  NrvValveAttrsForm, NeedleValveAttrsForm,
  buildControlValveRequirement, buildSafetyValveRequirement,
  buildOnOffValveRequirement, buildIsolationValveRequirement,
  buildNrvValveRequirement, buildNeedleValveRequirement,
} from "@/components/valve-attrs-forms";

// ── Role helpers ──────────────────────────────────────────────────────────────
const ROLE_LEVEL: Record<string, number> = {
  Superuser: 0, "General Manager": 1, "Senior Manager": 2,
  Manager: 3, "Senior Executive": 4, Employee: 5,
};
const rl = (role?: string) => ROLE_LEVEL[role ?? ""] ?? 999;
const isManager          = (r?: string) => rl(r) <= 3;
const isSeniorManager    = (r?: string) => rl(r) <= 2;
const isSeniorExecutive  = (r?: string) => rl(r) <= 4;

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

const OO_ACTUATED_TYPES = ["Pneumatic Actuator","Electric Actuator","Hydraulic Actuator"];
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

// ── Subgroup completeness warnings ────────────────────────────────────────────
function computeSubgroupWarnings(
  subgroupCode: string,
  groupCode: string,
  attrs: Record<string, unknown>,
  isMotorMode: boolean,
): string[] {
  const warns: string[] = [];
  const missing = (key: string) => !attrs[key] && attrs[key] !== 0;

  if (isMotorMode || groupCode === "motors") {
    if (missing("kw") && missing("hp"))  warns.push("Power rating (kW or HP) is required");
    if (missing("voltage_v"))            warns.push("Voltage is required");
    if (missing("phase"))                warns.push("Phase is required");
    if (missing("frequency_hz"))         warns.push("Frequency is required");
    if (missing("rpm"))                  warns.push("RPM is required");
    if (subgroupCode === "flameproof" && missing("explosion_protection"))
                                         warns.push("Explosion Protection is required");
  } else if (groupCode === "pumps") {
    if (missing("flow_m3hr"))            warns.push("Flow rate (m³/hr) is required");
    if (missing("head_m"))               warns.push("Head (m) is required");
    if (missing("fluid"))                warns.push("Fluid is required");
    if (missing("moc"))                  warns.push("MOC is required");
  } else if (groupCode === "instruments") {
    if (missing("measurement_type"))     warns.push("Measurement type is required");
    if (missing("range_min"))            warns.push("Range minimum is required");
    if (missing("range_max"))            warns.push("Range maximum is required");
    if (missing("range_unit"))           warns.push("Range unit is required");
  } else if (groupCode === "valves") {
    if (missing("size_mm"))              warns.push("Valve size (mm) is required");
    if (missing("rating_class"))         warns.push("Rating class is required");
    if (missing("end_connection"))       warns.push("End connection is required");
  } else if (groupCode === "electrical_control") {
    if (subgroupCode === "panels") {
      if (missing("panel_type"))         warns.push("Panel type is required");
      if (missing("voltage_v"))          warns.push("Voltage is required");
    } else if (subgroupCode === "cabling") {
      if (missing("voltage_v"))          warns.push("Voltage is required");
    }
  }
  return warns;
}

function WarningPanel({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1">
        <AlertCircle className="h-3 w-3" /> Completeness Warnings
      </p>
      <ul className="list-disc list-inside space-y-0.5">
        {warnings.map((w, i) => (
          <li key={i} className="text-xs text-amber-700">{w}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Datasheet Preview Dialog ──────────────────────────────────────────────────
function DatasheetPreviewDialog({
  line, open, onClose,
}: { line: PackageLine | null; open: boolean; onClose: () => void }) {
  if (!line) return null;
  const attrs = line.technical_attributes ?? {};
  const entries = Object.entries(attrs).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Technical Datasheet
          </DialogTitle>
          <DialogDescription>
            {line.buy_subgroup_label} — Line {line.line_number}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {line.generic_requirement && (
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Requirement</p>
              <p className="text-sm">{line.generic_requirement}</p>
            </div>
          )}
          {entries.length > 0 ? (
            <div className="rounded-md border divide-y">
              {entries.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                  <span className="font-medium text-right">{String(value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No technical attributes recorded.</p>
          )}
          {line.notes && (
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm">{line.notes}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
const SKID_OPTIONS = ["Skid-1", "Skid-2", "Skid-3", "Skid-4"];

const EMPTY_LINE = {
  buyGroupId: "", buySubgroupId: "", uomId: "",
  genericRequirement: "", defaultQuantity: "1", defaultSpecification: "",
  selectionRequired: true, datasheetRequired: false, inspectionRequired: false,
  certificateRequired: false, complianceRequired: false,
  notes: "", technicalAttributes: {} as Record<string, unknown>,
  installedOn: "",
};

// ── Generic Requirement field — live char count, 100-char hard limit ──────────
const ITEM_DESC_LIMIT = 100;
function GenericReqField({
  value, placeholder, onChange, required,
}: {
  value: string; placeholder?: string; onChange: (v: string) => void; required?: boolean;
}) {
  const len = value.length;
  const over = len > ITEM_DESC_LIMIT;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Generic Requirement{" "}
          {required
            ? <span className="text-red-500">*</span>
            : <span className="text-[10px] font-normal">(Item Description / SAP ItemName)</span>}
        </Label>
        <span className={`shrink-0 text-[10px] font-mono tabular-nums ${over ? "text-red-600 font-bold" : len > 85 ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
          {len}/{ITEM_DESC_LIMIT}
        </span>
      </div>
      <Input
        className={`h-9 text-sm${over ? " border-red-500 focus-visible:ring-red-500" : ""}`}
        value={value}
        placeholder={placeholder || "Fill attributes above to generate…"}
        onChange={(e) => onChange(e.target.value)}
      />
      {over && (
        <p className="text-[10px] text-red-600 font-medium">
          Exceeds {ITEM_DESC_LIMIT} characters — shorten manually before saving.
        </p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BuyPackagesPage() {
  const { toast } = useToast();
  const { user }  = useAuth();
  const role      = (user as any)?.role as string | undefined;
  const canWrite     = isManager(role);
  const canWriteLine = isSeniorExecutive(role);
  const canAction    = isSeniorManager(role);

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

  const [datasheetLine, setDatasheetLine] = useState<PackageLine | null>(null);

  // Save As (Clone) dialog state
  const [saveAsSource,      setSaveAsSource]      = useState<BuyPackage | null>(null);
  const [saveAsName,        setSaveAsName]        = useState("");
  const [saveAsTarget,      setSaveAsTarget]      = useState<string>("");
  const [saveAsCode,        setSaveAsCode]        = useState("");
  const [saveAsCodeLoading, setSaveAsCodeLoading] = useState(false);
  const [saveAsDescription, setSaveAsDescription] = useState("");

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
  const isPipesMode =
    (lineDialog.lock?.subgroupCode === "pipes") ||
    (selectedGroupCode === "raw_materials" && selectedSubgroupCode === "pipes");
  const isFittingsMode =
    (lineDialog.lock?.subgroupCode === "fittings") ||
    (selectedGroupCode === "raw_materials" && selectedSubgroupCode === "fittings");
  const isFlangesMode =
    (lineDialog.lock?.subgroupCode === "flanges") ||
    (selectedGroupCode === "raw_materials" && selectedSubgroupCode === "flanges");
  const isFastenersMode =
    (lineDialog.lock?.subgroupCode === "fasteners") ||
    (selectedGroupCode === "raw_materials" && selectedSubgroupCode === "fasteners");
  const isGasketsMode =
    (lineDialog.lock?.subgroupCode === "gaskets") ||
    (selectedGroupCode === "raw_materials" && selectedSubgroupCode === "gaskets");
  const isStructuralSteelMode =
    (lineDialog.lock?.subgroupCode === "structural_steel") ||
    (selectedGroupCode === "raw_materials" && selectedSubgroupCode === "structural_steel");
  const isCentrifugalPumpMode =
    (lineDialog.lock?.subgroupCode === "centrifugal") ||
    (selectedGroupCode === "pumps" && selectedSubgroupCode === "centrifugal");
  const isGearPumpMode =
    (lineDialog.lock?.subgroupCode === "gear") ||
    (selectedGroupCode === "pumps" && selectedSubgroupCode === "gear");
  const isScrewPumpMode =
    (lineDialog.lock?.subgroupCode === "screw") ||
    (selectedGroupCode === "pumps" && selectedSubgroupCode === "screw");
  const isMultistagePumpMode =
    (lineDialog.lock?.subgroupCode === "multistage") ||
    (selectedGroupCode === "pumps" && selectedSubgroupCode === "multistage");
  const isDosingPumpMode =
    (lineDialog.lock?.subgroupCode === "dosing_metering") ||
    (lineDialog.lock?.subgroupCode === "dosing") ||
    (selectedGroupCode === "pumps" && (selectedSubgroupCode === "dosing_metering" || selectedSubgroupCode === "dosing"));
  const isVacuumBoosterMode =
    (lineDialog.lock?.subgroupCode === "vacuum_boosters") ||
    (lineDialog.lock?.subgroupCode === "vacuum") ||
    (selectedGroupCode === "pumps" && (selectedSubgroupCode === "vacuum_boosters" || selectedSubgroupCode === "vacuum"));
  const isPumpSkidMode =
    (lineDialog.lock?.subgroupCode === "pump_skid_packages") ||
    (lineDialog.lock?.subgroupCode === "pump_skid") ||
    (selectedGroupCode === "pumps" && (selectedSubgroupCode === "pump_skid_packages" || selectedSubgroupCode === "pump_skid"));
  const isVacuumPumpMode =
    (lineDialog.lock?.subgroupCode === "vacuum_pump") ||
    (selectedGroupCode === "pumps" && selectedSubgroupCode === "vacuum_pump");
  const isNonFlameproofMotorMode =
    (lineDialog.lock?.subgroupCode === "non_flameproof") ||
    (selectedGroupCode === "motors" && selectedSubgroupCode === "non_flameproof");
  const isFlameproofMotorMode =
    (lineDialog.lock?.subgroupCode === "flameproof") ||
    (selectedGroupCode === "motors" && selectedSubgroupCode === "flameproof");
  const isMotorMode = isNonFlameproofMotorMode || isFlameproofMotorMode;
  const isPressureMode =
    (lineDialog.lock?.subgroupCode === "pressure") ||
    (selectedGroupCode === "instruments" && selectedSubgroupCode === "pressure");
  const isTemperatureMode =
    (lineDialog.lock?.subgroupCode === "temperature") ||
    (selectedGroupCode === "instruments" && selectedSubgroupCode === "temperature");
  const isFlowMode =
    (lineDialog.lock?.subgroupCode === "flow") ||
    (selectedGroupCode === "instruments" && selectedSubgroupCode === "flow");
  const isLevelMode =
    (lineDialog.lock?.subgroupCode === "level") ||
    (selectedGroupCode === "instruments" && selectedSubgroupCode === "level");
  const isPanelMode =
    (lineDialog.lock?.subgroupCode === "panels") ||
    (selectedGroupCode === "electrical_control" && selectedSubgroupCode === "panels");
  const isCablingMode =
    (lineDialog.lock?.subgroupCode === "cabling") ||
    (selectedGroupCode === "electrical_control" && selectedSubgroupCode === "cabling");
  const isControlValveMode =
    (lineDialog.lock?.subgroupCode === "control") ||
    (selectedGroupCode === "valves" && selectedSubgroupCode === "control");
  const isSafetyValveMode =
    (lineDialog.lock?.subgroupCode === "safety") ||
    (selectedGroupCode === "valves" && selectedSubgroupCode === "safety");
  const isIsolationValveMode =
    (lineDialog.lock?.subgroupCode === "isolation") ||
    (selectedGroupCode === "valves" && selectedSubgroupCode === "isolation");
  const isOnOffValveMode =
    (lineDialog.lock?.subgroupCode === "on_off") ||
    (selectedGroupCode === "valves" && selectedSubgroupCode === "on_off");
  const isNrvValveMode =
    (lineDialog.lock?.subgroupCode === "nrv") ||
    (selectedGroupCode === "valves" && selectedSubgroupCode === "nrv");
  const isNeedleValveMode =
    (lineDialog.lock?.subgroupCode === "needle") ||
    (selectedGroupCode === "valves" && selectedSubgroupCode === "needle");
  const isBoughtOutMode =
    (lineDialog.lock?.subgroupCode === "general" && lineDialog.lock?.groupCode === "bought_out_packages") ||
    (selectedGroupCode === "bought_out_packages" && selectedSubgroupCode === "general");
  const isCoolingTowerMode =
    (lineDialog.lock?.subgroupCode === "cooling_tower") ||
    (selectedGroupCode === "bought_out_packages" && selectedSubgroupCode === "cooling_tower");
  const isJunctionBoxMode =
    (lineDialog.lock?.subgroupCode === "junction_box") ||
    (selectedGroupCode === "electrical_control" && selectedSubgroupCode === "junction_box");
  const isComponentsMode =
    (lineDialog.lock?.subgroupCode === "components") ||
    (selectedGroupCode === "electrical_control" && selectedSubgroupCode === "components");

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

  const clonePkg = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiRequest("POST", `/api/buy-packages/${id}/clone`, body),
    onSuccess: (data: { id: number; packageCode: string; linesCopied: number }) => {
      toast({ title: "Package cloned", description: `${data.packageCode} — ${data.linesCopied} line(s) copied` });
      resetSaveAs();
      invalidatePkgs();
      setStatusFilter("draft");
      setExpandedId(data.id);
      setTimeout(() => {
        document.getElementById(`pkg-row-${data.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 400);
    },
    onError: (e: any) => toast({ title: "Clone failed", description: e.message, variant: "destructive" }),
  });

  const revisePkg = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/buy-packages/${id}/revise`, {}),
    onSuccess: (data: { id: number; packageCode: string; version: number; linesCopied: number }) => {
      toast({ title: "Revision created", description: `${data.packageCode} (v${data.version}) — ${data.linesCopied} line(s) copied. Edit and activate when ready.` });
      invalidatePkgs();
      setStatusFilter("draft");
      setExpandedId(data.id);
      setTimeout(() => {
        document.getElementById(`pkg-row-${data.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 400);
    },
    onError: (e: any) => toast({ title: "Revise failed", description: e.message, variant: "destructive" }),
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
  const resetSaveAs = useCallback(() => {
    setSaveAsSource(null); setSaveAsName(""); setSaveAsTarget("");
    setSaveAsCode(""); setSaveAsDescription("");
  }, []);

  const fetchSaveAsCode = useCallback(async (productId: string, prod: { description?: string; productDescription?: string } | undefined) => {
    setSaveAsCode(""); setSaveAsDescription(prod?.description ?? prod?.productDescription ?? "");
    if (!productId) return;
    setSaveAsCodeLoading(true);
    try {
      const res = await fetch(`/api/buy-packages/generate-code?productId=${productId}`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setSaveAsCode(d.packageCode); }
    } catch { /* ignore */ } finally { setSaveAsCodeLoading(false); }
  }, []);

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
    const NOS_GROUPS = new Set(["pumps", "motors", "instruments", "valves"]);
    const initAttrs: Record<string, unknown> =
      subgroupCode === "non_flameproof" ? { ...NON_FLAMEPROOF_MOTOR_DEFAULTS } :
      subgroupCode === "flameproof"     ? { ...FLAMEPROOF_MOTOR_DEFAULTS }     :
      groupCode === "instruments"       ? { ...INSTRUMENT_CABLE_GLAND_DEFAULTS } : {};
    const nosUom = uoms.find((u: any) => u.code?.toUpperCase() === "NOS");
    setLf({
      ...EMPTY_LINE,
      buyGroupId: String(groupId),
      buySubgroupId: String(subgroupId),
      technicalAttributes: initAttrs,
      ...(NOS_GROUPS.has(groupCode) && nosUom ? { uomId: String(nosUom.id) } : {}),
    });
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
      installedOn: (line as any).installed_on ?? "",
      technicalAttributes: line.buy_subgroup_code === "non_flameproof"
        ? applyNonFlameproofMotorDefaults((line.technical_attributes ?? {}) as Record<string, unknown>)
        : line.buy_subgroup_code === "flameproof"
          ? applyFlameproofMotorDefaults((line.technical_attributes ?? {}) as Record<string, unknown>)
          : line.buy_group_code === "instruments"
            ? (lineDialog.lock?.subgroupCode === "temperature"
                ? applyTemperatureDefaults((line.technical_attributes ?? {}) as Record<string, unknown>)
                : (() => {
                    const ta = (line.technical_attributes ?? {}) as Record<string, unknown>;
                    return { ...INSTRUMENT_CABLE_GLAND_DEFAULTS, ...ta };
                  })())
            : (line.technical_attributes ?? {}) as Record<string, unknown>,
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
    } else if (isPipesMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.section_type as string)?.trim()) {
        toast({ title: "Section / Pipe Type is required", variant: "destructive" }); return;
      }
    } else if (isFittingsMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.fitting_type as string)?.trim() || !(ta.size_nb as string)?.trim()) {
        toast({ title: "Fitting Type and Size (NB) are required", variant: "destructive" }); return;
      }
    } else if (isFlangesMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.flange_type as string)?.trim() || !(ta.size_nb as string)?.trim()) {
        toast({ title: "Flange Type and Size (NB) are required", variant: "destructive" }); return;
      }
    } else if (isFastenersMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.fastener_type as string)?.trim() || !(ta.size_dia as string)?.trim()) {
        toast({ title: "Fastener Type and Size are required", variant: "destructive" }); return;
      }
    } else if (isGasketsMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.gasket_type as string)?.trim() || !(ta.size_nb as string)?.trim()) {
        toast({ title: "Gasket Type and Size (NB) are required", variant: "destructive" }); return;
      }
    } else if (isStructuralSteelMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.section_type as string)?.trim()) {
        toast({ title: "Section Type is required", variant: "destructive" }); return;
      }
    } else if (isCentrifugalPumpMode) {
      const ta = lf.technicalAttributes;
      const cPT = (ta.pump_type as string)?.trim() ?? "";
      if (!cPT) { toast({ title: "Pump Type is required", variant: "destructive" }); return; }
      if (!(ta.flow_rate as string)?.trim()) { toast({ title: "Flow Rate is required", variant: "destructive" }); return; }
      if (!(ta.head as string)?.trim()) { toast({ title: "Head / TDH is required", variant: "destructive" }); return; }
      if (!(ta.fluid as string)?.trim()) { toast({ title: "Fluid is required", variant: "destructive" }); return; }
      if (!(ta.mounting as string)?.trim()) { toast({ title: "Mounting is required", variant: "destructive" }); return; }
      if (!(ta.drive_type as string)?.trim()) { toast({ title: "Drive Type is required", variant: "destructive" }); return; }
      if (!(ta.service_type as string)?.trim()) { toast({ title: "Service Type is required", variant: "destructive" }); return; }
      if (!(ta.seal_type as string)?.trim()) { toast({ title: "Seal Type is required", variant: "destructive" }); return; }
      if (!(ta.material_class as string)?.trim()) { toast({ title: "Material Class is required", variant: "destructive" }); return; }
      const cPTl = cPT.toLowerCase();
      if (cPTl.includes("end suction")) {
        if (!(ta.casing_type as string)?.trim()) { toast({ title: "Casing Type is required for End Suction", variant: "destructive" }); return; }
        if (!(ta.impeller_type as string)?.trim()) { toast({ title: "Impeller Type is required for End Suction", variant: "destructive" }); return; }
        if (!(ta.coupling_type as string)?.trim()) { toast({ title: "Coupling Type is required for End Suction", variant: "destructive" }); return; }
      } else if (cPTl.includes("split case")) {
        if (!(ta.impeller_type_sc as string)?.trim()) { toast({ title: "Impeller Type is required for Split Case", variant: "destructive" }); return; }
        if (!(ta.orientation as string)?.trim()) { toast({ title: "Orientation is required for Split Case", variant: "destructive" }); return; }
        if (!(ta.coupling_type_sc as string)?.trim()) { toast({ title: "Coupling Type is required for Split Case", variant: "destructive" }); return; }
      } else if (cPTl.includes("multistage")) {
        if (!(ta.num_stages as string)?.trim()) { toast({ title: "Number of Stages is required for Multistage", variant: "destructive" }); return; }
        if (!(ta.impeller_type as string)?.trim()) { toast({ title: "Impeller Type is required for Multistage", variant: "destructive" }); return; }
        if (!(ta.coupling_type_ms as string)?.trim()) { toast({ title: "Coupling Type is required for Multistage", variant: "destructive" }); return; }
      } else if (cPTl.includes("vertical turbine")) {
        if (!(ta.num_bowl_stages as string)?.trim()) { toast({ title: "No. of Bowl Stages is required for VTP", variant: "destructive" }); return; }
        if (!(ta.column_length as string)?.trim()) { toast({ title: "Column Length is required for VTP", variant: "destructive" }); return; }
        if (!(ta.discharge_head_type as string)?.trim()) { toast({ title: "Discharge Head Type is required for VTP", variant: "destructive" }); return; }
        if (!(ta.lineshaft_lubrication as string)?.trim()) { toast({ title: "Lineshaft Lubrication is required for VTP", variant: "destructive" }); return; }
      } else if (cPTl.includes("vertical inline")) {
        if (!(ta.impeller_type as string)?.trim()) { toast({ title: "Impeller Type is required for Vertical Inline", variant: "destructive" }); return; }
        if (!(ta.coupling_type_vi as string)?.trim()) { toast({ title: "Coupling Type is required for Vertical Inline", variant: "destructive" }); return; }
      }
      if (!((ta.approved_makes as string[]) ?? []).length) { toast({ title: "At least one Approved Make is required", variant: "destructive" }); return; }
    } else if (isGearPumpMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.gear_type as string)?.trim()) { toast({ title: "Gear Type is required", variant: "destructive" }); return; }
      if (!(ta.flow_rate as string)?.trim()) { toast({ title: "Flow Rate is required", variant: "destructive" }); return; }
      if (!(ta.diff_pressure as string)?.trim()) { toast({ title: "Differential Pressure is required", variant: "destructive" }); return; }
      if (!(ta.fluid as string)?.trim()) { toast({ title: "Fluid is required", variant: "destructive" }); return; }
      if (!(ta.material_class as string)?.trim()) { toast({ title: "Material Class is required", variant: "destructive" }); return; }
      if (!(ta.seal_type as string)?.trim()) { toast({ title: "Seal Type is required", variant: "destructive" }); return; }
      if (!(ta.mounting as string)?.trim()) { toast({ title: "Mounting is required", variant: "destructive" }); return; }
      if (!(ta.drive_type as string)?.trim()) { toast({ title: "Drive Type is required", variant: "destructive" }); return; }
      if (!(ta.service_type as string)?.trim()) { toast({ title: "Service Type is required", variant: "destructive" }); return; }
      if (!(ta.gear_material as string)?.trim()) { toast({ title: "Gear Material is required", variant: "destructive" }); return; }
      const gTL = ((ta.gear_type as string) ?? "").toLowerCase();
      if (gTL.includes("internal") || gTL.includes("crescent")) {
        if (!(ta.crescent_type as string)?.trim()) { toast({ title: "Crescent Type is required for Internal Gear", variant: "destructive" }); return; }
        if (!(ta.idler_pin_type as string)?.trim()) { toast({ title: "Idler Pin Type is required for Internal Gear", variant: "destructive" }); return; }
      } else if (gTL.includes("bi-helical") || gTL.includes("herringbone")) {
        if (!(ta.bearing_type as string)?.trim()) { toast({ title: "Bearing Type is required for Bi-Helical pump", variant: "destructive" }); return; }
        if (!(ta.max_diff_pressure as string)?.trim()) { toast({ title: "Max Diff. Pressure is required for Bi-Helical pump", variant: "destructive" }); return; }
      }
      if (!((ta.approved_makes as string[]) ?? []).length) { toast({ title: "At least one Approved Make is required", variant: "destructive" }); return; }
    } else if (isScrewPumpMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.screw_type as string)?.trim()) { toast({ title: "Screw Type is required", variant: "destructive" }); return; }
      if (!(ta.flow_rate as string)?.trim()) { toast({ title: "Flow Rate is required", variant: "destructive" }); return; }
      if (!(ta.diff_pressure as string)?.trim()) { toast({ title: "Differential Pressure is required", variant: "destructive" }); return; }
      if (!(ta.fluid as string)?.trim()) { toast({ title: "Fluid is required", variant: "destructive" }); return; }
      if (!(ta.material_class as string)?.trim()) { toast({ title: "Material Class is required", variant: "destructive" }); return; }
      if (!(ta.seal_type as string)?.trim()) { toast({ title: "Seal Type is required", variant: "destructive" }); return; }
      if (!(ta.mounting as string)?.trim()) { toast({ title: "Mounting is required", variant: "destructive" }); return; }
      if (!(ta.drive_type as string)?.trim()) { toast({ title: "Drive Type is required", variant: "destructive" }); return; }
      if (!(ta.service_type as string)?.trim()) { toast({ title: "Service Type is required", variant: "destructive" }); return; }
      if (!(ta.screw_material as string)?.trim()) { toast({ title: "Screw Material is required", variant: "destructive" }); return; }
      const sTL = ((ta.screw_type as string) ?? "").toLowerCase();
      if (sTL.includes("progressive") || sTL.includes("cavity")) {
        if (!(ta.rotor_material as string)?.trim()) { toast({ title: "Rotor Material is required for Progressive Cavity", variant: "destructive" }); return; }
        if (!(ta.stator_elastomer as string)?.trim()) { toast({ title: "Stator Elastomer is required for Progressive Cavity", variant: "destructive" }); return; }
      }
      if (!((ta.approved_makes as string[]) ?? []).length) { toast({ title: "At least one Approved Make is required", variant: "destructive" }); return; }
    } else if (isMultistagePumpMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.multistage_type as string)?.trim()) { toast({ title: "Multistage Type is required", variant: "destructive" }); return; }
      if (!(ta.flow_rate as string)?.trim()) { toast({ title: "Flow Rate is required", variant: "destructive" }); return; }
      if (!(ta.head_mlc as string)?.trim()) { toast({ title: "Head / TDH is required", variant: "destructive" }); return; }
      if (!(ta.fluid as string)?.trim()) { toast({ title: "Fluid is required", variant: "destructive" }); return; }
      if (!(ta.material_class as string)?.trim()) { toast({ title: "Material Class is required", variant: "destructive" }); return; }
      if (!(ta.seal_type as string)?.trim()) { toast({ title: "Seal Type is required", variant: "destructive" }); return; }
      if (!(ta.mounting as string)?.trim()) { toast({ title: "Mounting is required", variant: "destructive" }); return; }
      if (!(ta.drive_type as string)?.trim()) { toast({ title: "Drive Type is required", variant: "destructive" }); return; }
      if (!(ta.num_stages as string)?.trim()) { toast({ title: "Number of Stages is required", variant: "destructive" }); return; }
      if (!(ta.impeller_type as string)?.trim()) { toast({ title: "Impeller Type is required", variant: "destructive" }); return; }
      if (!(ta.shaft_material as string)?.trim()) { toast({ title: "Shaft Material is required", variant: "destructive" }); return; }
      if (!(ta.impeller_material as string)?.trim()) { toast({ title: "Impeller Material is required", variant: "destructive" }); return; }
      const msTL = ((ta.multistage_type as string) ?? "").toLowerCase();
      if (msTL.includes("vertical")) {
        if (!(ta.lineshaft_type as string)?.trim()) { toast({ title: "Lineshaft Type is required for Vertical Multistage", variant: "destructive" }); return; }
        if (!(ta.motor_type as string)?.trim()) { toast({ title: "Motor Type is required for Vertical Multistage", variant: "destructive" }); return; }
      } else if (msTL.includes("barrel")) {
        if (!(ta.inner_casing_type as string)?.trim()) { toast({ title: "Inner Casing Type is required for Barrel Type", variant: "destructive" }); return; }
      }
      if (!((ta.approved_makes as string[]) ?? []).length) { toast({ title: "At least one Approved Make is required", variant: "destructive" }); return; }
    } else if (isDosingPumpMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.pump_type as string)?.trim()) { toast({ title: "Pump Type is required", variant: "destructive" }); return; }
      if (!(ta.flow_rate as string)?.trim()) { toast({ title: "Flow Rate is required", variant: "destructive" }); return; }
      if (!(ta.discharge_pressure as string)?.trim()) { toast({ title: "Discharge Pressure is required", variant: "destructive" }); return; }
      if (!(ta.dosing_accuracy as string)?.trim()) { toast({ title: "Dosing Accuracy is required", variant: "destructive" }); return; }
      if (!(ta.fluid as string)?.trim()) { toast({ title: "Fluid is required", variant: "destructive" }); return; }
      if (!(ta.wetted_material as string)?.trim()) { toast({ title: "Wetted / Body Material is required", variant: "destructive" }); return; }
      if (!(ta.mounting as string)?.trim()) { toast({ title: "Mounting is required", variant: "destructive" }); return; }
      if (!(ta.drive_type as string)?.trim()) { toast({ title: "Drive Type is required", variant: "destructive" }); return; }
      const dTL = ((ta.pump_type as string) ?? "").toLowerCase();
      if (dTL.includes("diaphragm") || dTL.includes("solenoid")) {
        if (!(ta.diaphragm_material as string)?.trim()) { toast({ title: "Diaphragm Material is required", variant: "destructive" }); return; }
        if (!(ta.diaphragm_design as string)?.trim()) { toast({ title: "Diaphragm Design is required", variant: "destructive" }); return; }
      } else if (dTL.includes("plunger")) {
        if (!(ta.plunger_material as string)?.trim()) { toast({ title: "Plunger Material is required", variant: "destructive" }); return; }
        if (!(ta.packing_material as string)?.trim()) { toast({ title: "Packing Material is required for Plunger pump", variant: "destructive" }); return; }
        if (!(ta.num_heads as string)?.trim()) { toast({ title: "Number of Heads is required for Plunger pump", variant: "destructive" }); return; }
      } else if (dTL.includes("piston")) {
        if (!(ta.piston_material as string)?.trim()) { toast({ title: "Piston Material is required", variant: "destructive" }); return; }
        if (!(ta.num_heads as string)?.trim()) { toast({ title: "Number of Heads is required for Piston pump", variant: "destructive" }); return; }
      } else if (dTL.includes("peristaltic")) {
        if (!(ta.hose_material as string)?.trim()) { toast({ title: "Hose Material is required for Peristaltic pump", variant: "destructive" }); return; }
      }
      if (!((ta.approved_makes as string[]) ?? []).length) { toast({ title: "At least one Approved Make is required", variant: "destructive" }); return; }
    } else if (isVacuumBoosterMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.booster_type as string)?.trim()) { toast({ title: "Booster Type is required", variant: "destructive" }); return; }
      if (!(ta.flow_rate as string)?.trim()) { toast({ title: "Flow Rate is required", variant: "destructive" }); return; }
      if (!(ta.suction_pressure as string)?.trim()) { toast({ title: "Suction Pressure is required", variant: "destructive" }); return; }
      if (!(ta.gas_type as string)?.trim()) { toast({ title: "Gas Type is required", variant: "destructive" }); return; }
      if (!(ta.material_class as string)?.trim()) { toast({ title: "Material Class is required", variant: "destructive" }); return; }
      if (!(ta.cooling_type as string)?.trim()) { toast({ title: "Cooling Type is required", variant: "destructive" }); return; }
      if (!((ta.approved_makes as string[]) ?? []).length) { toast({ title: "At least one Approved Make is required", variant: "destructive" }); return; }
    } else if (isVacuumPumpMode) {
      const ta = lf.technicalAttributes;
      const vpType = (ta.vacuum_pump_type as string)?.trim() ?? "";
      if (!vpType) { toast({ title: "Vacuum Pump Technology is required", variant: "destructive" }); return; }
      if (!(ta.suction_capacity_m3hr  as string)?.trim()) { toast({ title: "Suction Capacity is required",              variant: "destructive" }); return; }
      if (!(ta.operating_vacuum_mbar  as string)?.trim()) { toast({ title: "Operating Vacuum is required",              variant: "destructive" }); return; }
      if (!(ta.discharge_pressure_barg as string)?.trim()) { toast({ title: "Discharge Pressure is required",           variant: "destructive" }); return; }
      if (!(ta.gas_type               as string)?.trim()) { toast({ title: "Gas / Vapour Handled is required",          variant: "destructive" }); return; }
      if (!(ta.mounting               as string)?.trim()) { toast({ title: "Mounting is required",                      variant: "destructive" }); return; }
      if (!(ta.drive_type             as string)?.trim()) { toast({ title: "Drive Type is required",                    variant: "destructive" }); return; }
      if (!(ta.material_class         as string)?.trim()) { toast({ title: "Material Class is required",                variant: "destructive" }); return; }
      if (!(ta.service_type           as string)?.trim()) { toast({ title: "Service Type is required",                  variant: "destructive" }); return; }
      if (vpType !== "Steam Jet Ejector") {
        if (vpType !== "Liquid Ring" && !(ta.seal_type as string)?.trim()) {
          toast({ title: "Seal Type is required", variant: "destructive" }); return;
        }
        if (!(ta.motor_power_kw  as string)?.trim()) { toast({ title: "Motor Power is required",    variant: "destructive" }); return; }
        if (!(ta.supply_voltage  as string)?.trim()) { toast({ title: "Supply Voltage is required", variant: "destructive" }); return; }
      }
      if (vpType === "Liquid Ring") {
        if (!(ta.sealing_liquid   as string)?.trim()) { toast({ title: "Sealing Liquid is required",   variant: "destructive" }); return; }
        if (!(ta.port_connection  as string)?.trim()) { toast({ title: "Port Connection is required",  variant: "destructive" }); return; }
      } else if (vpType === "Dry Screw") {
        if (!(ta.compression_stages as string)?.trim()) { toast({ title: "Compression Stages is required", variant: "destructive" }); return; }
        if (!(ta.screw_profile      as string)?.trim()) { toast({ title: "Screw Profile is required",      variant: "destructive" }); return; }
        if (!(ta.cooling_type       as string)?.trim()) { toast({ title: "Cooling Type is required",       variant: "destructive" }); return; }
        if (!(ta.port_connection    as string)?.trim()) { toast({ title: "Port Connection is required",    variant: "destructive" }); return; }
      } else if (vpType === "Rotary Vane") {
        if (!(ta.oil_sealed       as string)?.trim()) { toast({ title: "Oil Sealed is required",        variant: "destructive" }); return; }
        if (!(ta.num_stages_rv    as string)?.trim()) { toast({ title: "Number of Stages is required",  variant: "destructive" }); return; }
        if (!(ta.cooling_type     as string)?.trim()) { toast({ title: "Cooling Type is required",      variant: "destructive" }); return; }
        if (!(ta.port_connection  as string)?.trim()) { toast({ title: "Port Connection is required",   variant: "destructive" }); return; }
      } else if (vpType === "Reciprocating") {
        if (!(ta.num_cylinders      as string)?.trim()) { toast({ title: "Number of Cylinders is required", variant: "destructive" }); return; }
        if (!(ta.compression_stages as string)?.trim()) { toast({ title: "Compression Stages is required",  variant: "destructive" }); return; }
        if (!(ta.cooling_type       as string)?.trim()) { toast({ title: "Cooling Type is required",        variant: "destructive" }); return; }
      } else if (vpType === "Steam Jet Ejector") {
        if (!(ta.num_stages_ejector      as string)?.trim()) { toast({ title: "Number of Stages is required",       variant: "destructive" }); return; }
        if (!(ta.motive_steam_pressure   as string)?.trim()) { toast({ title: "Motive Steam Pressure is required",  variant: "destructive" }); return; }
      }
      if (!((ta.approved_makes as string[]) ?? []).length) { toast({ title: "At least one Approved Make is required", variant: "destructive" }); return; }
    } else if (isPumpSkidMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.package_type as string)?.trim()) { toast({ title: "Package Type is required", variant: "destructive" }); return; }
      if (!(ta.pump_type as string)?.trim()) { toast({ title: "Pump Type is required", variant: "destructive" }); return; }
    } else if (isMotorMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.motor_type as string)?.trim()) { toast({ title: "Motor Type is required", variant: "destructive" }); return; }
      if (!(ta.mounting as string)?.trim()) { toast({ title: "Mounting is required", variant: "destructive" }); return; }
      if (!(ta.cooling_type as string)?.trim()) { toast({ title: "Cooling Type is required", variant: "destructive" }); return; }
      if (!(ta.power as string)?.trim()) { toast({ title: "Power (kW) is required", variant: "destructive" }); return; }
      if (!(ta.voltage as string)?.trim()) { toast({ title: "Voltage is required", variant: "destructive" }); return; }
      if (!(ta.frequency as string)?.trim()) { toast({ title: "Frequency is required", variant: "destructive" }); return; }
      if (!(ta.speed as string)?.trim()) { toast({ title: "Speed (RPM) is required", variant: "destructive" }); return; }
      if (!(ta.duty as string)?.trim()) { toast({ title: "Duty is required", variant: "destructive" }); return; }
      if (!(ta.area_classification as string)?.trim()) { toast({ title: "Area Classification is required", variant: "destructive" }); return; }
      if (!(ta.ip_rating as string)?.trim()) { toast({ title: "IP Rating is required", variant: "destructive" }); return; }
      if (!(ta.efficiency_class as string)?.trim()) { toast({ title: "Efficiency Class is required", variant: "destructive" }); return; }
      if (!(ta.vfd_compatible as string)?.trim()) { toast({ title: "VFD Compatible is required", variant: "destructive" }); return; }
      if (!((ta.approved_makes as string[]) ?? []).length) { toast({ title: "At least one Approved Make is required", variant: "destructive" }); return; }
    } else if (isPressureMode) {
      const ta    = lf.technicalAttributes;
      const iType = (ta.instrument_type as string)?.trim();
      if (!iType) { toast({ title: "Instrument Type is required", variant: "destructive" }); return; }
      const pt      = iType.toLowerCase();
      const isPG_v  = pt.includes("gauge");
      const isPT_v  = pt.includes("transmitter") && !pt.includes("differential");
      const isDPT_v = pt.includes("differential");
      const isPS_v  = pt.includes("switch");
      // Mandatory across all types
      if (!(ta.range_max           as string)?.trim()) { toast({ title: "Range Max is required",             variant: "destructive" }); return; }
      if (!(ta.range_unit          as string)?.trim()) { toast({ title: "Range Unit is required",            variant: "destructive" }); return; }
      if (!(ta.wetted_material     as string)?.trim()) { toast({ title: "Wetted Parts Material is required", variant: "destructive" }); return; }
      if (!(ta.ip_rating           as string)?.trim()) { toast({ title: "IP Rating is required",             variant: "destructive" }); return; }
      if (!(ta.area_classification as string)?.trim()) { toast({ title: "Area Classification is required",   variant: "destructive" }); return; }
      if (!((ta.approved_makes as string[]) ?? []).length) { toast({ title: "At least one Approved Make is required", variant: "destructive" }); return; }
      // PG-specific mandatory
      if (isPG_v) {
        if (!(ta.measurement_type as string)?.trim()) { toast({ title: "Measurement Type is required", variant: "destructive" }); return; }
        if (!(ta.accuracy_class   as string)?.trim()) { toast({ title: "Accuracy Class is required",   variant: "destructive" }); return; }
        if (!(ta.dial_size        as string)?.trim()) { toast({ title: "Dial Size is required",        variant: "destructive" }); return; }
        if (!(ta.dial_type        as string)?.trim()) { toast({ title: "Fill Type is required",        variant: "destructive" }); return; }
        if (!(ta.connection_size  as string)?.trim()) { toast({ title: "Connection Size is required",  variant: "destructive" }); return; }
        if (!(ta.connection_type  as string)?.trim()) { toast({ title: "Connection Type is required",  variant: "destructive" }); return; }
        if (!(ta.conn_orientation as string)?.trim()) { toast({ title: "Connection Orientation is required", variant: "destructive" }); return; }
      }
      // PT-specific mandatory
      if (isPT_v) {
        if (!(ta.measurement_type as string)?.trim()) { toast({ title: "Measurement Type is required", variant: "destructive" }); return; }
        if (!(ta.accuracy_class   as string)?.trim()) { toast({ title: "Accuracy Class is required",   variant: "destructive" }); return; }
        if (!(ta.output_signal    as string)?.trim()) { toast({ title: "Output Signal is required",    variant: "destructive" }); return; }
        if (!(ta.power_supply     as string)?.trim()) { toast({ title: "Power Supply is required",     variant: "destructive" }); return; }
        if (!(ta.connection_size  as string)?.trim()) { toast({ title: "Connection Size is required",  variant: "destructive" }); return; }
        if (!(ta.connection_type  as string)?.trim()) { toast({ title: "Connection Type is required",  variant: "destructive" }); return; }
        if (!(ta.conn_orientation as string)?.trim()) { toast({ title: "Connection Orientation is required", variant: "destructive" }); return; }
      }
      // DPT-specific mandatory
      if (isDPT_v) {
        if (!(ta.application      as string)?.trim()) { toast({ title: "Application is required",        variant: "destructive" }); return; }
        if (!(ta.accuracy_class   as string)?.trim()) { toast({ title: "Accuracy Class is required",     variant: "destructive" }); return; }
        if (!(ta.output_signal    as string)?.trim()) { toast({ title: "Output Signal is required",      variant: "destructive" }); return; }
        if (!(ta.power_supply     as string)?.trim()) { toast({ title: "Power Supply is required",       variant: "destructive" }); return; }
        if (!(ta.connection_size  as string)?.trim()) { toast({ title: "HP Connection Size is required", variant: "destructive" }); return; }
        if (!(ta.connection_type  as string)?.trim()) { toast({ title: "HP Connection Type is required", variant: "destructive" }); return; }
        if (!(ta.conn_orientation as string)?.trim()) { toast({ title: "HP Orientation is required",     variant: "destructive" }); return; }
        if (!(ta.manifold_type    as string)?.trim()) { toast({ title: "Manifold Type is required",      variant: "destructive" }); return; }
      }
      // PS-specific mandatory
      if (isPS_v) {
        if (!(ta.measurement_type as string)?.trim()) { toast({ title: "Measurement Type is required",  variant: "destructive" }); return; }
        if (!(ta.trip_setpoint    as string)?.trim()) { toast({ title: "Trip Setpoint is required",     variant: "destructive" }); return; }
        if (!(ta.switching_action as string)?.trim()) { toast({ title: "Switching Action is required",  variant: "destructive" }); return; }
        if (!(ta.contact_rating   as string)?.trim()) { toast({ title: "Contact Rating is required",    variant: "destructive" }); return; }
        if (!(ta.reset_type       as string)?.trim()) { toast({ title: "Reset Type is required",        variant: "destructive" }); return; }
        if (!(ta.connection_size  as string)?.trim()) { toast({ title: "Connection Size is required",   variant: "destructive" }); return; }
        if (!(ta.connection_type  as string)?.trim()) { toast({ title: "Connection Type is required",   variant: "destructive" }); return; }
      }
      // Hazardous area checks (non-PG only — PG is non-electrical)
      const areaClass = (ta.area_classification as string)?.trim();
      if (!isPG_v && (areaClass === "Zone 1" || areaClass === "Zone 2")) {
        if (!(ta.explosion_protection as string)?.trim()) { toast({ title: "Explosion Protection is required for Zone 1 / Zone 2", variant: "destructive" }); return; }
        if (!(ta.certification        as string)?.trim()) { toast({ title: "Certification is required for Zone 1 / Zone 2",        variant: "destructive" }); return; }
        if (!(ta.gas_group            as string)?.trim()) { toast({ title: "Gas Group is required for Zone 1 / Zone 2",            variant: "destructive" }); return; }
        if (!(ta.temperature_class    as string)?.trim()) { toast({ title: "Temperature Class is required for Zone 1 / Zone 2",    variant: "destructive" }); return; }
      }
    } else if (isTemperatureMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.instrument_type as string)?.trim()) {
        toast({ title: "Instrument Type is required", variant: "destructive" }); return;
      }
    } else if (isFlowMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.instrument_type as string)?.trim()) {
        toast({ title: "Instrument Type is required", variant: "destructive" }); return;
      }
      if (!(ta.line_size as string)?.trim()) {
        toast({ title: "Line Size (NB) is required", variant: "destructive" }); return;
      }
    } else if (isLevelMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.instrument_type as string)?.trim()) {
        toast({ title: "Instrument Type is required", variant: "destructive" }); return;
      }
    } else if (isComponentsMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.component_type as string)?.trim()) {
        toast({ title: "Component Type is required", variant: "destructive" }); return;
      }
    } else if (isCablingMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.cable_type as string)?.trim()) {
        toast({ title: "Cable Type is required", variant: "destructive" }); return;
      }
      if (!(ta.cable_size as string)?.trim()) {
        toast({ title: "Cable Size is required", variant: "destructive" }); return;
      }
    } else if (isPanelMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.panel_type as string)?.trim()) {
        toast({ title: "Panel Type is required", variant: "destructive" }); return;
      }
      if (!(ta.voltage as string)?.trim()) {
        toast({ title: "Voltage is required", variant: "destructive" }); return;
      }
      const enc = (ta.enclosure_type as string)?.trim();
      if (enc === "Outdoor" && !(ta.ip_rating as string)?.trim()) {
        toast({ title: "IP Rating is required for Outdoor enclosure", variant: "destructive" }); return;
      }
      if (enc === "Flameproof" && !(ta.area_classification as string)?.trim()) {
        toast({ title: "Area Classification is required for Flameproof enclosure", variant: "destructive" }); return;
      }
    } else if (isSafetyValveMode) {
      const ta    = lf.technicalAttributes;
      const svType = ((ta.valve_type as string) ?? "").trim().toLowerCase();
      if (!svType) {
        toast({ title: "Safety Valve Type is required", variant: "destructive" }); return;
      }
      if (!(ta.design_standard as string)?.trim()) {
        toast({ title: "Design Standard is required", variant: "destructive" }); return;
      }
      if (svType.includes("breather")) {
        if (!(ta.connection_size as string)?.trim())
          { toast({ title: "Connection Size is required", variant: "destructive" }); return; }
        if (!(ta.pressure_setting_mbar as string)?.trim())
          { toast({ title: "Pressure Setting (mbar) is required", variant: "destructive" }); return; }
        if (!(ta.vacuum_setting_mbar as string)?.trim())
          { toast({ title: "Vacuum Setting (mbar) is required", variant: "destructive" }); return; }
        if (!(ta.flame_arrestor as string)?.trim())
          { toast({ title: "Flame Arrestor is required", variant: "destructive" }); return; }
      } else if (svType.includes("vacuum")) {
        if (!(ta.connection_size as string)?.trim())
          { toast({ title: "Connection Size is required for VRV", variant: "destructive" }); return; }
        if (!(ta.set_vacuum as string)?.trim())
          { toast({ title: "Set Vacuum (mbar) is required", variant: "destructive" }); return; }
      } else {
        if (!(ta.inlet_size as string)?.trim())
          { toast({ title: "Inlet Size is required", variant: "destructive" }); return; }
        if (!(ta.outlet_size as string)?.trim())
          { toast({ title: "Outlet Size is required", variant: "destructive" }); return; }
        if (!(ta.pressure_rating as string)?.trim())
          { toast({ title: "Pressure Rating is required", variant: "destructive" }); return; }
        if (!(ta.set_pressure as string)?.trim())
          { toast({ title: "Set Pressure is required", variant: "destructive" }); return; }
        if (!(ta.body_material as string)?.trim())
          { toast({ title: "Body Material is required", variant: "destructive" }); return; }
        if (!(ta.end_connection as string)?.trim())
          { toast({ title: "End Connection is required", variant: "destructive" }); return; }
        if (!(ta.discharge_type as string)?.trim())
          { toast({ title: "Discharge Type is required", variant: "destructive" }); return; }
        if (svType.includes("psv") || svType.includes("pressure safety")) {
          if (!(ta.operation_type as string)?.trim())
            { toast({ title: "Operation Type is required for PSV", variant: "destructive" }); return; }
          if (!(ta.api_orifice as string)?.trim())
            { toast({ title: "API Orifice is required for PSV", variant: "destructive" }); return; }
          if (!(ta.bonnet_type as string)?.trim())
            { toast({ title: "Bonnet Type is required for PSV", variant: "destructive" }); return; }
        } else if (svType.includes("srv") || svType.includes("safety relief")) {
          if (!(ta.operation_type as string)?.trim())
            { toast({ title: "Operation Type is required for SRV", variant: "destructive" }); return; }
          if (!(ta.api_orifice as string)?.trim())
            { toast({ title: "API Orifice is required for SRV", variant: "destructive" }); return; }
          if (!(ta.service_phase as string)?.trim())
            { toast({ title: "Service Phase is required for SRV", variant: "destructive" }); return; }
          if (!(ta.bonnet_type as string)?.trim())
            { toast({ title: "Bonnet Type is required for SRV", variant: "destructive" }); return; }
        }
      }
    } else if (isControlValveMode) {
      const ta     = lf.technicalAttributes;
      const cvType = ((ta.valve_type as string) ?? "").trim().toLowerCase();
      if (!cvType) {
        toast({ title: "Control Valve Type is required", variant: "destructive" }); return;
      }
      if (!(ta.size_nb as string)?.trim()) {
        toast({ title: "Size (NB) is required", variant: "destructive" }); return;
      }
      if (!(ta.pressure_rating as string)?.trim()) {
        toast({ title: "Pressure Rating is required", variant: "destructive" }); return;
      }
      if (!(ta.end_connection as string)?.trim()) {
        toast({ title: "End Connection is required", variant: "destructive" }); return;
      }
      if (!(ta.body_material as string)?.trim()) {
        toast({ title: "Body Material is required", variant: "destructive" }); return;
      }
      if (!(ta.actuator_type as string)?.trim()) {
        toast({ title: "Actuator Type is required", variant: "destructive" }); return;
      }
      if (!(ta.fail_action as string)?.trim()) {
        toast({ title: "Fail Action is required", variant: "destructive" }); return;
      }
      if (cvType.includes("globe")) {
        if (!(ta.trim_style as string)?.trim())          { toast({ title: "Trim Style is required for Globe CV",          variant: "destructive" }); return; }
        if (!(ta.flow_characteristic as string)?.trim()) { toast({ title: "Flow Characteristic is required for Globe CV", variant: "destructive" }); return; }
        if (!(ta.trim_material as string)?.trim())       { toast({ title: "Trim Material is required for Globe CV",       variant: "destructive" }); return; }
        if (!(ta.seat_material as string)?.trim())       { toast({ title: "Seat Material is required for Globe CV",       variant: "destructive" }); return; }
        if (!(ta.leakage_class as string)?.trim())       { toast({ title: "Leakage Class is required for Globe CV",       variant: "destructive" }); return; }
      } else if (cvType.includes("ball")) {
        if (!(ta.ball_type as string)?.trim())           { toast({ title: "Ball Type is required for Ball CV",            variant: "destructive" }); return; }
        if (!(ta.ball_trim_material as string)?.trim())  { toast({ title: "Ball/Trim Material is required for Ball CV",  variant: "destructive" }); return; }
        if (!(ta.seat_material as string)?.trim())       { toast({ title: "Seat Material is required for Ball CV",        variant: "destructive" }); return; }
      } else if (cvType.includes("butterfly")) {
        if (!(ta.disc_mounting as string)?.trim())        { toast({ title: "Disc Mounting is required for Butterfly CV",        variant: "destructive" }); return; }
        if (!(ta.disc_material as string)?.trim())        { toast({ title: "Disc Material is required for Butterfly CV",        variant: "destructive" }); return; }
        if (!(ta.seat_liner_material as string)?.trim())  { toast({ title: "Seat/Liner Material is required for Butterfly CV", variant: "destructive" }); return; }
      } else if (cvType.includes("eccentric") || cvType.includes("rotary")) {
        if (!(ta.plug_style as string)?.trim())           { toast({ title: "Plug Style is required for Eccentric Plug CV",        variant: "destructive" }); return; }
        if (!(ta.plug_trim_material as string)?.trim())   { toast({ title: "Plug/Trim Material is required for Eccentric Plug CV",variant: "destructive" }); return; }
        if (!(ta.seat_material as string)?.trim())        { toast({ title: "Seat Material is required for Eccentric Plug CV",     variant: "destructive" }); return; }
      } else if (cvType.includes("angle")) {
        if (!(ta.service_application as string)?.trim())  { toast({ title: "Service Application is required for Angle CV",  variant: "destructive" }); return; }
        if (!(ta.flow_direction as string)?.trim())       { toast({ title: "Flow Direction is required for Angle CV",       variant: "destructive" }); return; }
        if (!(ta.trim_style as string)?.trim())           { toast({ title: "Trim Style is required for Angle CV",           variant: "destructive" }); return; }
        if (!(ta.trim_material as string)?.trim())        { toast({ title: "Trim Material is required for Angle CV",        variant: "destructive" }); return; }
        if (!(ta.seat_material as string)?.trim())        { toast({ title: "Seat Material is required for Angle CV",        variant: "destructive" }); return; }
        if (!(ta.leakage_class as string)?.trim())        { toast({ title: "Leakage Class is required for Angle CV",        variant: "destructive" }); return; }
      }
    } else if (isIsolationValveMode) {
      const ta  = lf.technicalAttributes;
      const vt2 = ((ta.valve_type as string) ?? "").toLowerCase();
      if (!vt2) {
        toast({ title: "Valve Type is required", variant: "destructive" }); return;
      }
      if (!(ta.size_nb as string)?.trim()) {
        toast({ title: "Size (NB) is required", variant: "destructive" }); return;
      }
      if (!(ta.pressure_rating as string)?.trim()) {
        toast({ title: "Pressure Rating is required", variant: "destructive" }); return;
      }
      if (!(ta.end_connection as string)?.trim()) {
        toast({ title: "End Connection is required", variant: "destructive" }); return;
      }
      if (!(ta.body_material as string)?.trim()) {
        toast({ title: "Body Material is required", variant: "destructive" }); return;
      }
      if (vt2.includes("ball")) {
        if (!(ta.bore_type     as string)?.trim()) { toast({ title: "Bore Type is required for Ball Valve",     variant: "destructive" }); return; }
        if (!(ta.seat_material as string)?.trim()) { toast({ title: "Seat Material is required for Ball Valve",  variant: "destructive" }); return; }
      } else if (vt2.includes("gate") && !vt2.includes("knife")) {
        if (!(ta.wedge_type    as string)?.trim()) { toast({ title: "Wedge Type is required for Gate Valve",    variant: "destructive" }); return; }
        if (!(ta.stem_type     as string)?.trim()) { toast({ title: "Stem Type is required for Gate Valve",     variant: "destructive" }); return; }
        if (!(ta.trim_material as string)?.trim()) { toast({ title: "Trim Material is required for Gate Valve", variant: "destructive" }); return; }
      } else if (vt2.includes("globe")) {
        if (!(ta.port_type     as string)?.trim()) { toast({ title: "Port Type is required for Globe Valve",    variant: "destructive" }); return; }
        if (!(ta.disc_type     as string)?.trim()) { toast({ title: "Disc Type is required for Globe Valve",    variant: "destructive" }); return; }
        if (!(ta.trim_material as string)?.trim()) { toast({ title: "Trim Material is required for Globe Valve",variant: "destructive" }); return; }
      } else if (vt2.includes("butterfly")) {
        if (!(ta.disc_material as string)?.trim()) { toast({ title: "Disc Material is required for Butterfly Valve",       variant: "destructive" }); return; }
        if (!(ta.seat_material as string)?.trim()) { toast({ title: "Seat/Liner Material is required for Butterfly Valve", variant: "destructive" }); return; }
        if (!(ta.disc_mounting as string)?.trim()) { toast({ title: "Disc Mounting is required for Butterfly Valve",       variant: "destructive" }); return; }
      } else if (vt2.includes("plug")) {
        if (!(ta.port_pattern  as string)?.trim()) { toast({ title: "Port Pattern is required for Plug Valve",  variant: "destructive" }); return; }
        if (!(ta.lubrication   as string)?.trim()) { toast({ title: "Lubrication is required for Plug Valve",   variant: "destructive" }); return; }
      } else if (vt2.includes("knife")) {
        if (!(ta.gate_material as string)?.trim()) { toast({ title: "Gate Material is required for Knife Gate Valve",  variant: "destructive" }); return; }
        if (!(ta.packing_type  as string)?.trim()) { toast({ title: "Packing Type is required for Knife Gate Valve",   variant: "destructive" }); return; }
      } else if (vt2.includes("diaphragm")) {
        if (!(ta.diaphragm_material as string)?.trim()) { toast({ title: "Diaphragm Material is required for Diaphragm Valve", variant: "destructive" }); return; }
        if (!(ta.body_lining        as string)?.trim()) { toast({ title: "Body Lining is required for Diaphragm Valve",        variant: "destructive" }); return; }
        if (!(ta.weir_type          as string)?.trim()) { toast({ title: "Weir Type is required for Diaphragm Valve",          variant: "destructive" }); return; }
      }
    } else if (isOnOffValveMode) {
      const ta     = lf.technicalAttributes;
      const ooType = ((ta.valve_type as string) ?? "").trim().toLowerCase();
      if (!ooType) {
        toast({ title: "Valve Type is required", variant: "destructive" }); return;
      }
      if (!(ta.size_nb as string)?.trim()) {
        toast({ title: "Size (NB) is required", variant: "destructive" }); return;
      }
      if (!(ta.pressure_rating as string)?.trim()) {
        toast({ title: "Pressure Rating is required", variant: "destructive" }); return;
      }
      if (!(ta.actuation_type as string)?.trim()) {
        toast({ title: "Actuation Type is required", variant: "destructive" }); return;
      }
      const act = (ta.actuation_type as string)?.trim();
      if (OO_ACTUATED_TYPES.includes(act) && !(ta.fail_action as string)?.trim()) {
        toast({ title: "Fail Action is required for actuated valves", variant: "destructive" }); return;
      }
      if (!(ta.end_connection as string)?.trim()) {
        toast({ title: "End Connection is required", variant: "destructive" }); return;
      }
      if (!(ta.body_material as string)?.trim()) {
        toast({ title: "Body Material is required", variant: "destructive" }); return;
      }
      if (ooType.includes("ball")) {
        if (!(ta.bore_type as string)?.trim())
          { toast({ title: "Bore Type is required for Ball Valve", variant: "destructive" }); return; }
        if (!(ta.body_style as string)?.trim())
          { toast({ title: "Body Style is required for Ball Valve", variant: "destructive" }); return; }
        if (!(ta.seat_material as string)?.trim())
          { toast({ title: "Seat Material is required for Ball Valve", variant: "destructive" }); return; }
      } else if (ooType.includes("gate")) {
        if (!(ta.stem_type as string)?.trim())
          { toast({ title: "Stem Type is required for Gate Valve", variant: "destructive" }); return; }
        if (!(ta.wedge_type as string)?.trim())
          { toast({ title: "Wedge Type is required for Gate Valve", variant: "destructive" }); return; }
      } else if (ooType.includes("globe")) {
        if (!(ta.port_type as string)?.trim())
          { toast({ title: "Port Type is required for Globe Valve", variant: "destructive" }); return; }
        if (!(ta.plug_trim_material as string)?.trim())
          { toast({ title: "Plug/Trim Material is required for Globe Valve", variant: "destructive" }); return; }
        if (!(ta.seat_material_globe as string)?.trim())
          { toast({ title: "Seat Material is required for Globe Valve", variant: "destructive" }); return; }
      } else if (ooType.includes("butterfly")) {
        if (!(ta.valve_design as string)?.trim())
          { toast({ title: "Valve Design is required for Butterfly Valve", variant: "destructive" }); return; }
        if (!(ta.disc_material as string)?.trim())
          { toast({ title: "Disc Material is required for Butterfly Valve", variant: "destructive" }); return; }
        if (!(ta.seat_liner as string)?.trim())
          { toast({ title: "Seat Liner is required for Butterfly Valve", variant: "destructive" }); return; }
      } else if (ooType.includes("plug")) {
        if (!(ta.plug_type as string)?.trim())
          { toast({ title: "Plug Type is required for Plug Valve", variant: "destructive" }); return; }
        if (!(ta.plug_port_config as string)?.trim())
          { toast({ title: "Port Configuration is required for Plug Valve", variant: "destructive" }); return; }
      } else if (ooType.includes("diaphragm")) {
        if (!(ta.diaphragm_material as string)?.trim())
          { toast({ title: "Diaphragm Material is required", variant: "destructive" }); return; }
        if (!(ta.body_design as string)?.trim())
          { toast({ title: "Body Design is required for Diaphragm Valve", variant: "destructive" }); return; }
      }
    } else if (isNeedleValveMode) {
      const ta         = lf.technicalAttributes;
      const needleType = ((ta.valve_type as string) ?? "").trim();
      if (!needleType) {
        toast({ title: "Valve Type is required", variant: "destructive" }); return;
      }
      if (!(ta.size as string)?.trim()) {
        toast({ title: "Size / Tube OD is required", variant: "destructive" }); return;
      }
      if (!(ta.pressure_rating as string)?.trim()) {
        toast({ title: "Pressure Rating is required", variant: "destructive" }); return;
      }
      if (!(ta.design_standard as string)?.trim()) {
        toast({ title: "Design Standard is required", variant: "destructive" }); return;
      }
      if (!(ta.end_connection as string)?.trim()) {
        toast({ title: "End Connection is required", variant: "destructive" }); return;
      }
      if (!(ta.body_material as string)?.trim()) {
        toast({ title: "Body Material is required", variant: "destructive" }); return;
      }
      if (!(ta.stem_material as string)?.trim()) {
        toast({ title: "Stem Material is required", variant: "destructive" }); return;
      }
      if (!(ta.seat_type as string)?.trim()) {
        toast({ title: "Seat Type is required", variant: "destructive" }); return;
      }
      if (!(ta.packing as string)?.trim()) {
        toast({ title: "Packing Material is required", variant: "destructive" }); return;
      }
      if (needleType === "Bleed / Vent Needle Valve" && !(ta.vent_type as string)?.trim()) {
        toast({ title: "Vent Type is required for Bleed / Vent Needle Valve", variant: "destructive" }); return;
      }
    } else if (isNrvValveMode) {
      const ta      = lf.technicalAttributes;
      const nrvType = ((ta.valve_type as string) ?? "").trim();
      if (!nrvType) {
        toast({ title: "Valve Type is required", variant: "destructive" }); return;
      }
      if (!(ta.size_nb as string)?.trim()) {
        toast({ title: "Size (NB) is required", variant: "destructive" }); return;
      }
      if (!(ta.pressure_rating as string)?.trim()) {
        toast({ title: "Pressure Rating is required", variant: "destructive" }); return;
      }
      if (!(ta.design_standard as string)?.trim()) {
        toast({ title: "Design Standard is required", variant: "destructive" }); return;
      }
      if (!(ta.end_connection as string)?.trim()) {
        toast({ title: "End Connection is required", variant: "destructive" }); return;
      }
      if (!(ta.body_material as string)?.trim()) {
        toast({ title: "Body Material is required", variant: "destructive" }); return;
      }
      if (!(ta.disc_material as string)?.trim()) {
        toast({ title: "Disc / Closure Material is required", variant: "destructive" }); return;
      }
      if (nrvType === "Dual Plate (Wafer) Check Valve" && !(ta.dual_spring_material as string)?.trim()) {
        toast({ title: "Spring Material is required for Dual Plate Check Valve", variant: "destructive" }); return;
      }
      if (nrvType === "Foot Valve" && !(ta.strainer as string)?.trim()) {
        toast({ title: "Strainer is required for Foot Valve", variant: "destructive" }); return;
      }
    } else if (isBoughtOutMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.package_type as string)?.trim()) {
        toast({ title: "Package Type is required", variant: "destructive" }); return;
      }
      if (!((ta.package_components as string) ?? "").trim()) {
        toast({ title: "At least one Package Component must be selected", variant: "destructive" }); return;
      }
      if (!((ta.capacity as string) ?? "").trim()) {
        toast({ title: "Capacity is required", variant: "destructive" }); return;
      }
    } else if (isCoolingTowerMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.cooling_tower_type as string)?.trim()) {
        toast({ title: "Cooling Tower Type is required", variant: "destructive" }); return;
      }
      if (!((ta.circulation_rate as string) ?? "").trim()) {
        toast({ title: "Circulation Rate is required", variant: "destructive" }); return;
      }
      if (!((ta.inlet_water_temp as string) ?? "").trim()) {
        toast({ title: "Inlet Water Temperature is required", variant: "destructive" }); return;
      }
      if (!((ta.outlet_water_temp as string) ?? "").trim()) {
        toast({ title: "Outlet Water Temperature is required", variant: "destructive" }); return;
      }
      if (!((ta.wet_bulb_temp as string) ?? "").trim()) {
        toast({ title: "Wet Bulb Temperature is required", variant: "destructive" }); return;
      }
    } else if (isJunctionBoxMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.jb_type as string)?.trim()) {
        toast({ title: "Junction Box Type is required", variant: "destructive" }); return;
      }
      if (!(ta.enclosure_material as string)?.trim()) {
        toast({ title: "Enclosure Material is required", variant: "destructive" }); return;
      }
      if (!((ta.length_mm as string) ?? "").trim() || !((ta.width_mm as string) ?? "").trim() || !((ta.depth_mm as string) ?? "").trim()) {
        toast({ title: "All dimensions (L/W/D) are required", variant: "destructive" }); return;
      }
      const enc = (ta.enclosure_type as string)?.trim();
      if ((enc === "Outdoor" || enc === "Weatherproof") && !(ta.ip_rating as string)?.trim()) {
        toast({ title: "IP Rating is required for Outdoor/Weatherproof enclosure", variant: "destructive" }); return;
      }
      if (enc === "Flameproof" && !(ta.area_classification as string)?.trim()) {
        toast({ title: "Area Classification is required for Flameproof enclosure", variant: "destructive" }); return;
      }
      const ng = parseFloat((ta.num_glands as string) ?? "0");
      if (ng > 0 && !(ta.gland_size as string)?.trim()) {
        toast({ title: "Gland Size is required when Number of Glands > 0", variant: "destructive" }); return;
      }
    } else if (!lf.genericRequirement.trim()) {
      toast({ title: "Generic Requirement is required", variant: "destructive" }); return;
    } else if (lf.genericRequirement.trim().length > ITEM_DESC_LIMIT) {
      toast({ title: `Item Description exceeds ${ITEM_DESC_LIMIT} characters — shorten manually before saving.`, variant: "destructive" }); return;
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
      installedOn:          lf.installedOn || null,
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
                            {canWrite && (
                              <Button
                                variant="outline" size="sm"
                                className="gap-1"
                                title="Save As — clone to another top-level product"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSaveAsSource(pkg);
                                  setSaveAsName("");
                                  setSaveAsTarget("");
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" /> Save As
                              </Button>
                            )}
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
                                className="text-blue-700 border-blue-200 hover:bg-blue-50 gap-1"
                                title="Create a new draft revision of this package for the same product"
                                onClick={() => revisePkg.mutate(pkg.id)}
                                disabled={revisePkg.isPending}
                              >
                                {revisePkg.isPending
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <GitBranch className="h-3.5 w-3.5" />}
                                Revise
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
                                                        {canWriteLine && pkg.status === "draft" && (
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
                      onValueChange={(v) => {
                        const sg = subgroups.find((s) => String(s.id) === v);
                        const NOS_GROUPS = new Set(["pumps", "motors", "instruments", "valves"]);
                        const isNFP = selectedGroupCode === "motors" && sg?.code === "non_flameproof";
                        const isFP  = selectedGroupCode === "motors" && sg?.code === "flameproof";
                        const nosUom = uoms.find((u: any) => u.code?.toUpperCase() === "NOS");
                        setLf((f) => ({
                          ...f, buySubgroupId: v, genericRequirement: "",
                          technicalAttributes: isNFP ? { ...NON_FLAMEPROOF_MOTOR_DEFAULTS }
                                             : isFP  ? { ...FLAMEPROOF_MOTOR_DEFAULTS }
                                             : selectedGroupCode === "instruments" ? { ...INSTRUMENT_CABLE_GLAND_DEFAULTS }
                                             : {},
                          ...(NOS_GROUPS.has(selectedGroupCode) && nosUom ? { uomId: String(nosUom.id) } : {}),
                        }));
                      }}
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

              {/* SAP ItemCode — reserved position; auto-generated after approval */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  SAP ItemCode
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-normal">
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Auto-generated
                  </span>
                </Label>
                <div className="h-9 px-3 flex items-center justify-between rounded-md border border-dashed bg-muted/40 text-sm text-muted-foreground select-none">
                  <span className="font-mono tracking-wide">Auto-generated after approval</span>
                </div>
              </div>

              {/* Structured forms: Plates / Pipes / generic */}
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
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Plate Type and Thickness to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isPipesMode ? (
                <>
                  <PipesAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildPipesRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Section / Pipe Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isFittingsMode ? (
                <>
                  <FittingsAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildFittingsRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Fitting Type and Size to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isFlangesMode ? (
                <>
                  <FlangesAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildFlangesRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Flange Type and Size to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isFastenersMode ? (
                <>
                  <FastenersAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildFastenersRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Fastener Type and Size to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isGasketsMode ? (
                <>
                  <GasketsAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildGasketsRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Gasket Type and Size to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isStructuralSteelMode ? (
                <>
                  <StructuralSteelAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildStructuralSteelRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Section Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isCentrifugalPumpMode ? (
                <>
                  <CentrifugalPumpAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildCentrifugalPumpRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Pump Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isGearPumpMode ? (
                <>
                  <GearPumpAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildGearPumpRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Gear Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isScrewPumpMode ? (
                <>
                  <ScrewPumpAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildScrewPumpRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Screw Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isMultistagePumpMode ? (
                <>
                  <MultistagePumpAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildMultistagePumpRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Multistage Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isDosingPumpMode ? (
                <>
                  <DosingPumpAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildDosingPumpRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Pump Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isVacuumBoosterMode ? (
                <>
                  <VacuumBoosterAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildVacuumBoosterRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Booster Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isVacuumPumpMode ? (
                <>
                  <VacuumPumpAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildVacuumPumpRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Select technology to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isPumpSkidMode ? (
                <>
                  <PumpSkidAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildPumpSkidRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Package Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isMotorMode ? (
                <>
                  <MotorAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    isFlameproof={isFlameproofMotorMode}
                    onChange={(attrs) => {
                      const req = buildMotorRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Motor Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isPressureMode ? (
                <>
                  <PressureAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildPressureRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Instrument Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isTemperatureMode ? (
                <>
                  <TemperatureAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildTemperatureRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Instrument Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isFlowMode ? (
                <>
                  <FlowAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildFlowRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Instrument Type and Line Size to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isLevelMode ? (
                <>
                  <LevelAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildLevelRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Instrument Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isComponentsMode ? (
                <>
                  <ComponentsAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildComponentsRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Select Component Type to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isJunctionBoxMode ? (
                <>
                  <JunctionBoxAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildJunctionBoxRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Select JB Type and fill dimensions to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isCoolingTowerMode ? (
                <>
                  <CoolingTowerAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildCoolingTowerRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Enter temperatures and flow to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isBoughtOutMode ? (
                <>
                  <BoughtOutAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildBoughtOutRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Select Package Type and Capacity to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isCablingMode ? (
                <>
                  <CablingAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildCablingRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Cable Type and Size to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isPanelMode ? (
                <>
                  <PanelAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildPanelRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Panel Type and Voltage to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isSafetyValveMode ? (
                <>
                  <SafetyValveAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildSafetyValveRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Valve Type, Inlet Size and Set Pressure to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isControlValveMode ? (
                <>
                  <ControlValveAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildControlValveRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Valve Type, Size and Actuator to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isOnOffValveMode ? (
                <>
                  <OnOffValveAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildOnOffValveRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Select Valve Type, Size and Actuation to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isNrvValveMode ? (
                <>
                  <NrvValveAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildNrvValveRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Select Valve Type, Size and Rating to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isNeedleValveMode ? (
                <>
                  <NeedleValveAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildNeedleValveRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Select Valve Type, Size and Rating to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : isIsolationValveMode ? (
                <>
                  <IsolationValveAttrsForm
                    attrs={lf.technicalAttributes}
                    qty={lf.defaultQuantity}
                    onChange={(attrs) => {
                      const req = buildIsolationValveRequirement(attrs);
                      setLf((f) => ({ ...f, technicalAttributes: attrs, genericRequirement: req }));
                    }}
                    onQtyChange={(q) => setLf((f) => ({ ...f, defaultQuantity: q }))}
                  />
                  <GenericReqField
                    value={lf.genericRequirement}
                    placeholder="Fill Valve Type, Size and Rating to generate…"
                    onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                  />
                </>
              ) : (
                <>
                  {/* Requirement + Qty */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-3">
                      <GenericReqField
                        required
                        value={lf.genericRequirement}
                        placeholder="e.g. Feed Pump, Suction Strainer"
                        onChange={(v) => setLf((f) => ({ ...f, genericRequirement: v }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Default Qty</Label>
                      <Input
                        type="number" min="1" step="1"
                        value={lf.defaultQuantity}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => { const v = e.target.value; setLf((f) => ({ ...f, defaultQuantity: v === "" ? "" : String(Math.max(1, Math.trunc(Number(v)))) })); }}
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

              {/* Completeness Warnings */}
              {(() => {
                const sg = lineDialog.lock?.subgroupCode || selectedSubgroupCode || "";
                const gr = lineDialog.lock?.groupCode    || selectedGroupCode    || "";
                const warns = computeSubgroupWarnings(sg, gr, lf.technicalAttributes, isMotorMode);
                return warns.length > 0 ? <WarningPanel warnings={warns} /> : null;
              })()}

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

              {/* Installed On (Skid) */}
              <div className="space-y-1.5">
                <Label>Installed On</Label>
                <Select
                  value={lf.installedOn || "_none"}
                  onValueChange={(v) => setLf((f) => ({ ...f, installedOn: v === "_none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="None / Not specified" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None / Not specified</SelectItem>
                    {SKID_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                    {canWriteLine && isDraft && (
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
                      {canWriteLine && isDraft && (
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
                          {canWriteLine && isDraft && <TableHead className="w-16 text-center">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dlines.map((line, idx) => (
                          <TableRow key={line.id} className="text-xs align-top">
                            <TableCell className="text-muted-foreground font-mono pt-3">{idx + 1}</TableCell>
                            <TableCell className="max-w-xs pt-3">
                              <div className="flex items-start gap-1">
                                <div className="flex-1 min-w-0">
                                  <p className="leading-snug">{line.generic_requirement}</p>
                                  {line.default_specification && (
                                    <p className="text-muted-foreground text-[11px] mt-0.5 leading-snug">{line.default_specification}</p>
                                  )}
                                </div>
                                {line.technical_attributes && Object.keys(line.technical_attributes).length > 0 && (
                                  <Button
                                    variant="ghost" size="sm"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-primary shrink-0"
                                    title="Preview Datasheet"
                                    onClick={() => setDatasheetLine(line)}
                                  >
                                    <FileSpreadsheet className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
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
                            {canWriteLine && isDraft && (
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

      {/* Datasheet Preview Dialog */}
      <DatasheetPreviewDialog
        line={datasheetLine}
        open={datasheetLine !== null}
        onClose={() => setDatasheetLine(null)}
      />

      {/* ── Save As (Clone) Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!saveAsSource} onOpenChange={(o) => { if (!o) resetSaveAs(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Save As — BUY Package</DialogTitle>
            <DialogDescription>Copy this package as a new draft linked to a different top-level product. All lines will be copied across.</DialogDescription>
          </DialogHeader>

          {saveAsSource && (
            <div className="space-y-4 py-2">

              {/* Source package info — read-only */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Source Package</Label>
                  <span className="text-[11px] text-muted-foreground">Read only</span>
                </div>
                <Input
                  value={`${saveAsSource.packageCode} — ${saveAsSource.name}`}
                  readOnly
                  className="font-mono bg-muted cursor-not-allowed"
                />
              </div>

              {/* Target BUY Product — required, shadcn Select */}
              <div className="space-y-1.5">
                <Label>BUY Product <span className="text-red-500">*</span></Label>
                <Select
                  value={saveAsTarget}
                  onValueChange={(v) => {
                    setSaveAsTarget(v);
                    const prod = buyProducts.find((p) => String(p.id) === v);
                    setSaveAsName(prod?.description ?? prod?.productDescription ?? "");
                    fetchSaveAsCode(v, prod);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a BUY catalog product…" />
                  </SelectTrigger>
                  <SelectContent>
                    {buyProducts
                      .filter((p) => p.id !== saveAsSource.productId)
                      .sort((a, b) => a.productCode.localeCompare(b.productCode))
                      .map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.productCode} — {p.description ?? p.productDescription}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Package Code — auto-generated, read-only */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Package Code <span className="text-red-500">*</span></Label>
                  <span className="text-[11px] text-muted-foreground">Auto-generated</span>
                </div>
                <div className="relative">
                  <Input
                    placeholder={saveAsCodeLoading ? "Generating…" : "Select a product above"}
                    value={saveAsCode}
                    readOnly
                    className="font-mono pr-8 bg-muted cursor-not-allowed select-all"
                  />
                  {saveAsCodeLoading && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Package Name — editable */}
              <div className="space-y-1.5">
                <Label>Package Name <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Select a product above"
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  maxLength={255}
                />
              </div>

              {/* Description — from target product, read-only */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Description</Label>
                  <span className="text-[11px] text-muted-foreground">From product</span>
                </div>
                <Textarea
                  placeholder="Select a product above"
                  value={saveAsDescription}
                  readOnly
                  rows={3}
                  className="bg-muted cursor-not-allowed resize-none"
                />
              </div>

            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={resetSaveAs}>Cancel</Button>
            <Button
              disabled={!saveAsTarget || !saveAsCode || clonePkg.isPending}
              onClick={() => {
                if (!saveAsSource || !saveAsTarget) return;
                clonePkg.mutate({
                  id: saveAsSource.id,
                  body: {
                    targetProductId: Number(saveAsTarget),
                    ...(saveAsName.trim() ? { name: saveAsName.trim() } : {}),
                  },
                });
              }}
            >
              {clonePkg.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving…</> : "Save As"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}
