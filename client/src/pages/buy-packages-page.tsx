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
  Plus, ChevronRight, ChevronDown, Package, Layers,
  CheckCircle2, Archive, Edit2, Trash2, Loader2, Search, AlertCircle, List,
  ChevronsUpDown, Check, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

// ── Plates dropdown option lists ─────────────────────────────────────────────
const PLATE_OPTS: Record<string, string[]> = {
  plate_type:     ["MS", "SS 304", "SS 316", "Chequered", "Boiler Quality Plate"],
  material_grade: ["IS 2062 E250", "IS 2062 E350", "SA 516 Gr 60", "SA 516 Gr 65", "SA 516 Gr 70", "ASTM A36", "SS 304", "SS 316"],
  thickness_mm:   ["3", "5", "6", "8", "10", "12", "16", "20", "25", "32", "40"],
  width_mm:       ["1000", "1250", "1500", "2000", "2500"],
  length_mm:      ["2000", "2500", "3000", "6000"],
  standard:       ["IS 2062", "ASTM A36", "ASTM A516", "ASME SA-516", "DIN", "EN", "JIS"],
};

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

  // Track which fields are in free-text "Other" mode
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of Object.keys(PLATE_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !PLATE_OPTS[key].includes(val);
    }
    return c;
  });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function renderField(key: string, label: string, required?: boolean, colSpan?: boolean) {
    const opts = PLATE_OPTS[key];
    const curVal = (attrs[key] as string) ?? "";
    const isCustom = custom[key] ?? false;
    const dropdownVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className={`space-y-1.5${colSpan ? " col-span-2" : ""}`}>
        <Label className="text-xs">
          {label}{required && <span className="text-red-500"> *</span>}
        </Label>
        <Select value={dropdownVal} onValueChange={(v) => handleSelect(key, v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            <SelectItem value="__other__">Other…</SelectItem>
          </SelectContent>
        </Select>
        {isCustom && (
          <Input
            className="h-8 text-sm"
            placeholder={`Enter custom value…`}
            value={curVal}
            onChange={(e) => set(key, e.target.value)}
            autoFocus
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plate Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {renderField("plate_type",     "Plate Type",      true)}
        {renderField("material_grade", "Material Grade")}
        {renderField("thickness_mm",   "Thickness (mm)",  true)}
        {renderField("width_mm",       "Width (mm)")}
        {renderField("length_mm",      "Length (mm)")}
        {renderField("standard",       "Standard")}
        <div className="space-y-1.5 col-span-2">
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

// ── Pipes requirement builder ─────────────────────────────────────────────────
function buildPipesRequirement(attrs: Record<string, unknown>): string {
  const sectionType = (attrs.section_type  as string)?.trim() || "";
  const matGrade    = (attrs.material_grade as string)?.trim() || "";
  const lengthVal   = (attrs.length         as string)?.trim() || "";
  const standard    = (attrs.standard       as string)?.trim() || "";

  let sizePart = "";
  if (sectionType === "Round Pipe") {
    const nb  = attrs.nb_mm    ? `${attrs.nb_mm}NB`   : "";
    const sch = (attrs.schedule as string)?.trim() || "";
    sizePart = [nb, sch].filter(Boolean).join(" ");
  } else if (sectionType === "Square Pipe") {
    const sz  = (attrs.sq_size     as string)?.trim() || "";
    const thk = attrs.thickness_mm ? `x${attrs.thickness_mm}mm` : "";
    sizePart = sz ? `${sz}${thk}` : "";
  } else if (sectionType === "Rectangular Pipe") {
    const sz  = (attrs.rect_size   as string)?.trim() || "";
    const thk = attrs.thickness_mm ? `x${attrs.thickness_mm}mm` : "";
    sizePart = sz ? `${sz}${thk}` : "";
  }

  const label = sectionType || "Pipe";
  const parts: string[] = [label];
  if (sizePart) parts.push(sizePart);
  const trailer = [matGrade, lengthVal ? `${lengthVal} length` : "", standard].filter(Boolean).join(", ");
  let result = parts.join(" ");
  if (trailer) result += (result ? ", " : "") + trailer;
  return result;
}

// ── Pipes dropdown option lists ───────────────────────────────────────────────
const PIPE_OPTS: Record<string, string[]> = {
  section_type:   ["Round Pipe", "Square Pipe", "Rectangular Pipe", "Seamless", "ERW", "Welded", "GI", "MS", "SS"],
  material_grade: ["ASTM A106 Gr B", "ASTM A53", "IS 1239", "IS 3589", "SS 304", "SS 316"],
  nb_mm:          ["15", "20", "25", "32", "40", "50", "65", "80", "100", "150", "200", "250", "300"],
  schedule:       ["Sch 10", "Sch 20", "Sch 40", "Sch 80", "Sch 160", "XS", "XXS"],
  sq_size:        ["25x25", "40x40", "50x50", "75x75", "100x100", "150x150"],
  rect_size:      ["50x25", "75x40", "100x50", "150x75", "200x100"],
  thickness_mm:   ["1.6", "2", "3", "4", "5", "6", "8", "10"],
  length:         ["3m", "6m", "12m", "Random"],
  standard:       ["ASTM", "ASME", "IS", "DIN", "EN", "JIS"],
};

// ── Searchable combobox ───────────────────────────────────────────────────────
function SearchableSelect({
  value, options, placeholder, onSelect: onSelectProp,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const displayVal = value === "__other__" ? "Other…" : value;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline" role="combobox"
          className="h-8 text-sm justify-between font-normal w-full overflow-hidden"
        >
          <span className={displayVal ? "truncate" : "text-muted-foreground"}>
            {displayVal || (placeholder ?? "Select…")}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" className="h-8" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt} value={opt}
                  onSelect={() => { onSelectProp(opt); setOpen(false); }}
                >
                  <Check className={`mr-2 h-3.5 w-3.5 ${value === opt ? "opacity-100" : "opacity-0"}`} />
                  {opt}
                </CommandItem>
              ))}
              <CommandItem
                key="__other__" value="Other…"
                onSelect={() => { onSelectProp("__other__"); setOpen(false); }}
              >
                <Check className={`mr-2 h-3.5 w-3.5 ${value === "__other__" ? "opacity-100" : "opacity-0"}`} />
                Other…
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Pipes structured form ─────────────────────────────────────────────────────
function PipesAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of Object.keys(PIPE_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !PIPE_OPTS[key].includes(val);
    }
    return c;
  });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      // clear shape-specific fields when section_type changes
      if (key === "section_type") {
        onChange({ ...attrs, section_type: val, nb_mm: "", schedule: "", sq_size: "", rect_size: "", thickness_mm: "" });
      } else {
        set(key, val);
      }
    }
  }

  function renderField(key: string, label: string, required?: boolean) {
    const opts = PIPE_OPTS[key];
    const curVal = (attrs[key] as string) ?? "";
    const isCustom = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">
          {label}{required && <span className="text-red-500"> *</span>}
        </Label>
        <SearchableSelect
          value={selectVal}
          options={opts}
          placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)}
        />
        {isCustom && (
          <Input
            className="h-8 text-sm"
            placeholder="Enter custom value…"
            value={curVal}
            onChange={(e) => set(key, e.target.value)}
            autoFocus
          />
        )}
      </div>
    );
  }

  const sectionType = (attrs.section_type as string) ?? "";
  const isRound  = sectionType === "Round Pipe";
  const isSquare = sectionType === "Square Pipe";
  const isRect   = sectionType === "Rectangular Pipe";

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pipe Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {renderField("section_type",   "Section / Pipe Type", true)}
        {renderField("material_grade", "Material Grade")}

        {isRound  && renderField("nb_mm",        "Nominal Bore (NB)", true)}
        {isRound  && renderField("schedule",      "Schedule")}
        {isSquare && renderField("sq_size",       "Size (mm)",         true)}
        {isSquare && renderField("thickness_mm",  "Thickness (mm)",    true)}
        {isRect   && renderField("rect_size",     "Size (mm)",         true)}
        {isRect   && renderField("thickness_mm",  "Thickness (mm)",    true)}

        {renderField("length",   "Length")}
        {renderField("standard", "Standard")}

        <div className="space-y-1.5 col-span-2">
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

// ── Fittings requirement builder ─────────────────────────────────────────────
function buildFittingsRequirement(attrs: Record<string, unknown>): string {
  const fittingType = (attrs.fitting_type as string)?.trim() || "";
  const endType     = (attrs.end_type     as string)?.trim() || "";
  const sizeNb      = (attrs.size_nb      as string)?.trim() || "";
  const rating      = (attrs.rating       as string)?.trim() || "";
  const material    = (attrs.material     as string)?.trim() || "";
  const standard    = (attrs.standard     as string)?.trim() || "";

  const endAbbr: Record<string, string> = {
    "Threaded":    "THD",
    "Socket Weld": "SW",
    "Butt Weld":   "BW",
    "Flanged":     "FLG",
  };
  const endShort = endAbbr[endType] || endType;

  const parts: string[] = [];
  if (material)    parts.push(material);
  if (fittingType) parts.push(fittingType);
  if (sizeNb)      parts.push(`${sizeNb} NB`);
  if (rating)      parts.push(rating);
  if (endShort)    parts.push(endShort);
  if (standard)    parts.push(standard);
  return parts.join(", ");
}

// ── Fittings dropdown option lists ───────────────────────────────────────────
const FITTING_OPTS: Record<string, string[]> = {
  fitting_type: ["Elbow", "Tee", "Reducer", "Union", "Coupling", "Cap", "Cross", "Nipple"],
  end_type:     ["Threaded", "Socket Weld", "Butt Weld", "Flanged"],
  size_nb:      ["15", "20", "25", "32", "40", "50", "65", "80", "100", "150", "200", "250", "300"],
  rating:       ["Class 150", "Class 300", "Class 600", "PN10", "PN16", "PN25", "PN40"],
  material:     ["MS", "CS", "SS 304", "SS 316", "GI", "Alloy Steel"],
  standard:     ["ASME B16.9", "ASME B16.11", "IS", "DIN", "EN"],
};

// ── Fittings structured form ──────────────────────────────────────────────────
function FittingsAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of Object.keys(FITTING_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !FITTING_OPTS[key].includes(val);
    }
    return c;
  });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function renderField(key: string, label: string, required?: boolean) {
    const opts = FITTING_OPTS[key];
    const curVal = (attrs[key] as string) ?? "";
    const isCustom = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">
          {label}{required && <span className="text-red-500"> *</span>}
        </Label>
        <SearchableSelect
          value={selectVal}
          options={opts}
          placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)}
        />
        {isCustom && (
          <Input
            className="h-8 text-sm"
            placeholder="Enter custom value…"
            value={curVal}
            onChange={(e) => set(key, e.target.value)}
            autoFocus
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fitting Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {renderField("fitting_type", "Fitting Type",    true)}
        {renderField("end_type",     "End Type"              )}
        {renderField("size_nb",      "Size (NB)",       true)}
        {renderField("rating",       "Rating / Class"        )}
        {renderField("material",     "Material"              )}
        {renderField("standard",     "Standard"              )}

        <div className="space-y-1.5 col-span-2">
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

// ── Flanges requirement builder ───────────────────────────────────────────────
function buildFlangesRequirement(attrs: Record<string, unknown>): string {
  const flangeType = (attrs.flange_type as string)?.trim() || "";
  const sizeNb     = (attrs.size_nb     as string)?.trim() || "";
  const pressure   = (attrs.pressure    as string)?.trim() || "";
  const facing     = (attrs.facing      as string)?.trim() || "";
  const material   = (attrs.material    as string)?.trim() || "";
  const standard   = (attrs.standard    as string)?.trim() || "";

  // Abbreviation map for flange type
  const typeAbbr: Record<string, string> = {
    "Weld Neck (WN)":   "WN Flange",
    "Slip-On (SO)":     "SO Flange",
    "Blind (BL)":       "Blind Flange",
    "Socket Weld (SW)": "SW Flange",
    "Threaded (THD)":   "THD Flange",
    "Lap Joint (LJ)":   "LJ Flange",
    "Orifice":          "Orifice Flange",
    "Spectacle Blind":  "Spectacle Blind",
  };
  const typeLabel = typeAbbr[flangeType] || (flangeType ? `${flangeType} Flange` : "");

  const parts: string[] = [];
  if (typeLabel) parts.push(typeLabel);
  if (sizeNb)    parts.push(`${sizeNb} NB`);
  if (pressure)  parts.push(pressure);
  if (facing)    parts.push(facing);
  if (material)  parts.push(material);
  if (standard)  parts.push(standard);
  return parts.join(", ");
}

// ── Flanges dropdown option lists ─────────────────────────────────────────────
const FLANGE_OPTS: Record<string, string[]> = {
  flange_type: ["Weld Neck (WN)", "Slip-On (SO)", "Blind (BL)", "Socket Weld (SW)", "Threaded (THD)", "Lap Joint (LJ)", "Orifice", "Spectacle Blind"],
  size_nb:     ["15", "20", "25", "32", "40", "50", "65", "80", "100", "150", "200", "250", "300"],
  pressure:    ["Class 150", "Class 300", "Class 600", "Class 900", "PN10", "PN16", "PN25", "PN40"],
  facing:      ["RF (Raised Face)", "FF (Flat Face)", "RTJ (Ring Type Joint)"],
  material:    ["MS", "CS", "ASTM A105", "SS 304", "SS 316", "Alloy Steel"],
  standard:    ["ASME B16.5", "ASME B16.47", "DIN", "EN", "IS"],
};

// ── Flanges structured form ───────────────────────────────────────────────────
function FlangesAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of Object.keys(FLANGE_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !FLANGE_OPTS[key].includes(val);
    }
    return c;
  });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function renderField(key: string, label: string, required?: boolean) {
    const opts = FLANGE_OPTS[key];
    const curVal = (attrs[key] as string) ?? "";
    const isCustom = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">
          {label}{required && <span className="text-red-500"> *</span>}
        </Label>
        <SearchableSelect
          value={selectVal}
          options={opts}
          placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)}
        />
        {isCustom && (
          <Input
            className="h-8 text-sm"
            placeholder="Enter custom value…"
            value={curVal}
            onChange={(e) => set(key, e.target.value)}
            autoFocus
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Flange Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {renderField("flange_type", "Flange Type",      true)}
        {renderField("size_nb",     "Size (NB)",         true)}
        {renderField("pressure",    "Pressure Class"         )}
        {renderField("facing",      "Facing"                 )}
        {renderField("material",    "Material"               )}
        {renderField("standard",    "Standard"               )}

        <div className="space-y-1.5 col-span-2">
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

// ── Fasteners requirement builder ────────────────────────────────────────────
function buildFastenersRequirement(attrs: Record<string, unknown>): string {
  const fastenerType = (attrs.fastener_type as string)?.trim() || "";
  const size         = (attrs.size_dia      as string)?.trim() || "";
  const length       = (attrs.length        as string)?.trim() || "";
  const grade        = (attrs.grade         as string)?.trim() || "";
  const finish       = (attrs.finish        as string)?.trim() || "";
  const standard     = (attrs.standard      as string)?.trim() || "";

  const finishAbbr: Record<string, string> = {
    "Hot Dip Galvanized (HDG)": "HDG",
    "Zinc Plated":              "ZP",
    "PTFE Coated":              "PTFE",
    "Black":                    "Black",
  };
  const finishShort = finishAbbr[finish] || finish;

  const sizePart = size && length ? `${size} x ${length}` : size;
  const parts: string[] = [];
  if (fastenerType) parts.push(fastenerType);
  if (sizePart)     parts.push(sizePart);
  if (grade)        parts.push(`Grade ${grade}`);
  if (finishShort)  parts.push(finishShort);
  if (standard)     parts.push(standard);
  return parts.join(", ");
}

// ── Fasteners dropdown option lists ──────────────────────────────────────────
const FASTENER_OPTS: Record<string, string[]> = {
  fastener_type: ["Bolt", "Nut", "Washer", "Stud", "Screw", "Anchor Bolt", "U-Bolt"],
  size_dia:      ["M6", "M8", "M10", "M12", "M16", "M20", "M24", "M30"],
  length:        ["20", "30", "40", "50", "60", "75", "100", "150", "200"],
  thread_type:   ["Metric", "UNC", "UNF", "BSW"],
  grade:         ["4.6", "5.6", "8.8", "10.9", "12.9", "SS 304", "SS 316"],
  material:      ["MS", "CS", "SS 304", "SS 316", "Alloy Steel"],
  finish:        ["Black", "Zinc Plated", "Hot Dip Galvanized (HDG)", "PTFE Coated"],
  standard:      ["IS", "ASTM", "DIN", "ISO"],
};

const FASTENER_LENGTH_TYPES = new Set(["Bolt", "Stud", "U-Bolt", "Anchor Bolt"]);

// ── Fasteners structured form ─────────────────────────────────────────────────
function FastenersAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of Object.keys(FASTENER_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !FASTENER_OPTS[key].includes(val);
    }
    return c;
  });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function renderField(key: string, label: string, required?: boolean) {
    const opts = FASTENER_OPTS[key];
    const curVal = (attrs[key] as string) ?? "";
    const isCustom = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">
          {label}{required && <span className="text-red-500"> *</span>}
        </Label>
        <SearchableSelect
          value={selectVal}
          options={opts}
          placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)}
        />
        {isCustom && (
          <Input
            className="h-8 text-sm"
            placeholder="Enter custom value…"
            value={curVal}
            onChange={(e) => set(key, e.target.value)}
            autoFocus
          />
        )}
      </div>
    );
  }

  const fastenerType  = (attrs.fastener_type as string) ?? "";
  const showLength    = FASTENER_LENGTH_TYPES.has(fastenerType);

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fastener Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {renderField("fastener_type", "Fastener Type", true)}
        {renderField("size_dia",      "Size (Diameter)", true)}

        {showLength && renderField("length", "Length (mm)")}

        {renderField("thread_type", "Thread Type")}
        {renderField("grade",       "Grade"      )}
        {renderField("material",    "Material"   )}
        {renderField("finish",      "Finish"     )}
        {renderField("standard",    "Standard"   )}

        <div className="space-y-1.5 col-span-2">
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

// ── Gaskets requirement builder ───────────────────────────────────────────────
function buildGasketsRequirement(attrs: Record<string, unknown>): string {
  const gasketType = (attrs.gasket_type as string)?.trim() || "";
  const sizeNb     = (attrs.size_nb     as string)?.trim() || "";
  const pressure   = (attrs.pressure    as string)?.trim() || "";
  const material   = (attrs.material    as string)?.trim() || "";
  const standard   = (attrs.standard    as string)?.trim() || "";

  const label = gasketType ? `${gasketType} Gasket` : "Gasket";
  const parts: string[] = [label];
  if (sizeNb)   parts.push(`${sizeNb} NB`);
  if (pressure) parts.push(pressure);
  if (material) parts.push(material);
  if (standard) parts.push(standard);
  return parts.join(", ");
}

// ── Gaskets dropdown option lists ─────────────────────────────────────────────
const GASKET_OPTS: Record<string, string[]> = {
  gasket_type: ["Full Face", "Ring Type", "Spiral Wound", "CAF (Compressed Asbestos Free)", "PTFE", "Graphite", "Rubber", "Metallic"],
  size_nb:     ["15", "20", "25", "32", "40", "50", "65", "80", "100", "150", "200", "250", "300"],
  pressure:    ["Class 150", "Class 300", "Class 600", "PN10", "PN16", "PN25", "PN40"],
  thickness:   ["1", "1.5", "2", "3", "4", "5"],
  material:    ["CAF", "PTFE", "Graphite", "Rubber", "SS Spiral Wound"],
  standard:    ["ASME B16.20", "ASME B16.21", "IS", "DIN", "EN"],
};

// ── Gaskets structured form ───────────────────────────────────────────────────
function GasketsAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of Object.keys(GASKET_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !GASKET_OPTS[key].includes(val);
    }
    return c;
  });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function renderField(key: string, label: string, required?: boolean) {
    const opts = GASKET_OPTS[key];
    const curVal = (attrs[key] as string) ?? "";
    const isCustom = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">
          {label}{required && <span className="text-red-500"> *</span>}
        </Label>
        <SearchableSelect
          value={selectVal}
          options={opts}
          placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)}
        />
        {isCustom && (
          <Input
            className="h-8 text-sm"
            placeholder="Enter custom value…"
            value={curVal}
            onChange={(e) => set(key, e.target.value)}
            autoFocus
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gasket Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {renderField("gasket_type", "Gasket Type",     true)}
        {renderField("size_nb",     "Size (NB)",        true)}
        {renderField("pressure",    "Pressure Class"        )}
        {renderField("thickness",   "Thickness (mm)"        )}
        {renderField("material",    "Material"              )}
        {renderField("standard",    "Standard"              )}

        <div className="space-y-1.5 col-span-2">
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

// ── Structural Steel requirement builder ─────────────────────────────────────
function buildStructuralSteelRequirement(attrs: Record<string, unknown>): string {
  const sectionType = (attrs.section_type  as string)?.trim() || "";
  const size        = (attrs.size          as string)?.trim() || "";
  const thickness   = (attrs.thickness_mm  as string)?.trim() || "";
  const length      = (attrs.length        as string)?.trim() || "";
  const matGrade    = (attrs.material_grade as string)?.trim() || "";
  const standard    = (attrs.standard      as string)?.trim() || "";

  // For IS-named sections (Channel, I-Beam, H-Beam) size already contains
  // the designation (e.g. "ISMC 150") — put it before the type label.
  const isNamedSection = ["Channel", "I-Beam (UB)", "H-Beam (UC)"].includes(sectionType);
  let mainPart = "";
  if (isNamedSection && size) {
    mainPart = `${size} ${sectionType}`;
  } else {
    mainPart = [sectionType, size].filter(Boolean).join(" ");
  }

  const parts: string[] = [];
  if (mainPart)   parts.push(mainPart);
  if (thickness)  parts.push(`${thickness}mm thk`);
  if (matGrade)   parts.push(matGrade);
  if (length)     parts.push(`${length} length`);
  if (standard)   parts.push(standard);
  return parts.join(", ");
}

// ── Structural Steel size/option lists ───────────────────────────────────────
const STRUCTURAL_COMMON_OPTS: Record<string, string[]> = {
  length:        ["3m", "6m", "12m", "Random"],
  material_grade:["IS 2062 E250", "IS 2062 E350", "ASTM A36"],
  standard:      ["IS", "ASTM", "EN", "DIN"],
  thickness_mm:  ["3", "5", "6", "8", "10", "12", "16", "20"],
};

const STRUCTURAL_SIZE_BY_TYPE: Record<string, string[]> = {
  "Angle":              ["25x25x3", "40x40x5", "50x50x6", "65x65x6", "75x75x8", "100x100x10"],
  "Channel":            ["ISMC 75", "ISMC 100", "ISMC 125", "ISMC 150", "ISMC 200", "ISMC 250", "ISMC 300"],
  "I-Beam (UB)":        ["ISMB 100", "ISMB 150", "ISMB 200", "ISMB 250", "ISMB 300", "ISMB 400"],
  "H-Beam (UC)":        ["ISMB 100", "ISMB 150", "ISMB 200", "ISMB 250", "ISMB 300", "ISMB 400"],
  "Flat Bar":           ["25x3", "50x6", "75x8", "100x10", "150x12"],
  "Square Bar":         ["10x10", "12x12", "16x16", "20x20", "25x25"],
  "Round Bar":          ["10", "12", "16", "20", "25", "32"],
  "Hollow Section (SHS)":               ["25x25", "40x40", "50x50", "75x75", "100x100"],
  "Rectangular Hollow Section (RHS)":   ["50x25", "75x40", "100x50", "150x75", "200x100"],
  "T-Section":                          [],
  "Plate (for structural use)":         [],
};

// Types that show a separate Thickness field
const STRUCTURAL_SHOW_THICKNESS = new Set([
  "Plate (for structural use)", "T-Section", "Flat Bar", "Square Bar",
]);

// ── Structural Steel form ─────────────────────────────────────────────────────
function StructuralSteelAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  // Track custom-entry per field
  type CustomMap = Record<string, boolean>;
  const allKeys = ["size", "length", "material_grade", "standard", "thickness_mm"];
  const [custom, setCustom] = useState<CustomMap>(() => {
    const c: CustomMap = {};
    for (const key of allKeys) {
      const val = (attrs[key] as string) ?? "";
      const opts = key === "size"
        ? (STRUCTURAL_SIZE_BY_TYPE[(attrs.section_type as string) ?? ""] ?? [])
        : STRUCTURAL_COMMON_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  // Section-type custom
  const sectionTypes = Object.keys(STRUCTURAL_SIZE_BY_TYPE);
  const [sectionCustom, setSectionCustom] = useState(
    () => {
      const v = (attrs.section_type as string) ?? "";
      return v !== "" && !sectionTypes.includes(v);
    }
  );

  const sectionType = (attrs.section_type as string) ?? "";
  const sizeOpts    = STRUCTURAL_SIZE_BY_TYPE[sectionType] ?? [];
  const showThickness = STRUCTURAL_SHOW_THICKNESS.has(sectionType);

  function handleSectionSelect(val: string) {
    if (val === "__other__") {
      setSectionCustom(true);
      onChange({ ...attrs, section_type: "", size: "" });
    } else {
      setSectionCustom(false);
      // Clear size when section type changes
      onChange({ ...attrs, section_type: val, size: "" });
      setCustom((c) => ({ ...c, size: false }));
    }
  }

  function handleSelect(key: string, val: string, opts: string[]) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function renderCommonField(key: string, label: string, opts: string[], required?: boolean) {
    const curVal  = (attrs[key] as string) ?? "";
    const isCustom = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect
          value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v, opts)}
        />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  const sectionSelectVal = sectionCustom ? "__other__" : (sectionTypes.includes(sectionType) ? sectionType : "");

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Structural Steel Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {/* Section Type */}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Section Type <span className="text-red-500">*</span></Label>
          <SearchableSelect
            value={sectionSelectVal} options={sectionTypes} placeholder="Select section type…"
            onSelect={handleSectionSelect}
          />
          {sectionCustom && (
            <Input className="h-8 text-sm" placeholder="Enter custom section type…"
              value={sectionType} onChange={(e) => onChange({ ...attrs, section_type: e.target.value })} autoFocus />
          )}
        </div>

        {/* Size — only when section type has predefined options */}
        {sectionType && (
          sizeOpts.length > 0
            ? renderCommonField("size", "Size", sizeOpts, true)
            : (
              <div className="space-y-1.5">
                <Label className="text-xs">Size <span className="text-red-500">*</span></Label>
                <Input className="h-8 text-sm" placeholder="Enter size…"
                  value={(attrs.size as string) ?? ""}
                  onChange={(e) => set("size", e.target.value)} />
              </div>
            )
        )}

        {/* Thickness — conditional */}
        {showThickness && renderCommonField("thickness_mm", "Thickness (mm)", STRUCTURAL_COMMON_OPTS.thickness_mm)}

        {renderCommonField("material_grade", "Material Grade", STRUCTURAL_COMMON_OPTS.material_grade)}
        {renderCommonField("length",         "Length",         STRUCTURAL_COMMON_OPTS.length        )}
        {renderCommonField("standard",       "Standard",       STRUCTURAL_COMMON_OPTS.standard      )}

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Centrifugal Pump requirement builder ──────────────────────────────────────
function buildCentrifugalPumpRequirement(attrs: Record<string, unknown>): string {
  const pumpType  = (attrs.pump_type      as string)?.trim() || "";
  const flowRate  = (attrs.flow_rate      as string)?.trim() || "";
  const head      = (attrs.head           as string)?.trim() || "";
  const matClass  = (attrs.material_class as string)?.trim() || "";

  const parts: string[] = ["Centrifugal Pump"];
  if (pumpType) parts.push(pumpType);

  const opCond: string[] = [];
  if (flowRate) opCond.push(flowRate);
  if (head)     opCond.push(`${head} head`);
  if (opCond.length === 2) parts.push(opCond.join(" @ "));
  else if (opCond.length === 1) parts.push(opCond[0]);

  if (matClass) parts.push(matClass);
  return parts.join(", ");
}

// ── Centrifugal Pump option lists ─────────────────────────────────────────────
const CENTRIFUGAL_OPTS: Record<string, string[]> = {
  pump_type:      ["End Suction", "Split Case", "Multistage", "Vertical Inline", "Vertical Turbine"],
  mounting:       ["Base Mounted", "Inline", "Vertical"],
  drive_type:     ["Motor Driven", "Engine Driven"],
  service_type:   ["Continuous", "Intermittent", "Standby"],
  seal_type:      ["Single Mechanical Seal", "Double Mechanical Seal", "Gland Packing"],
  material_class: ["CI", "CS", "SS304", "SS316", "Duplex"],
  flow_rate:      ["5 m³/hr", "10 m³/hr", "20 m³/hr", "30 m³/hr", "50 m³/hr",
                   "75 m³/hr", "100 m³/hr", "150 m³/hr", "200 m³/hr", "300 m³/hr", "500 m³/hr"],
  head:           ["5 m", "10 m", "20 m", "30 m", "40 m", "50 m", "75 m", "100 m", "150 m", "200 m"],
  operating_temp: ["Ambient", "50°C", "80°C", "100°C", "150°C", "200°C"],
  fluid:          ["Water", "Hot Water", "Oil", "Chemical", "Slurry", "Effluent"],
};

const PUMP_MAKES = ["KSB", "Grundfos", "SPX Flow", "Flowserve", "Sulzer", "Kirloskar", "WILO", "CNP", "ITT", "Armstrong"];
const PUMP_SERIES_BY_MAKE: Record<string, string[]> = {
  "KSB":       ["Etanorm", "MegaCPK", "Omega", "Movitec"],
  "Grundfos":  ["CR", "NK", "CM", "TP", "S"],
  "SPX Flow":  ["W+", "SIHI", "Bran+Luebbe"],
  "Flowserve": ["Mark 3", "Durco", "Worthington"],
  "Sulzer":    ["A Series", "B Series", "CPT"],
  "Kirloskar": ["GD", "HOSC", "DB"],
  "WILO":      ["Economy", "Stratos", "Helix"],
  "ITT":       ["Goulds 3196", "Goulds 3410"],
  "Armstrong": ["4300", "4380", "S-Series"],
};

// ── Approved Makes multi-select ────────────────────────────────────────────────
function ApprovedMakesField({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");

  const filtered = PUMP_MAKES.filter((o) => o.toLowerCase().includes(query.toLowerCase()));

  function toggle(make: string) {
    onChange(values.includes(make) ? values.filter((m) => m !== make) : [...values, make]);
  }

  function addCustom() {
    const t = customVal.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setCustomVal("");
    setShowCustom(false);
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 w-full justify-between text-sm font-normal">
            {values.length > 0 ? `${values.length} make${values.length > 1 ? "s" : ""} selected` : "Select approved makes…"}
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search makes…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup>
                {filtered.map((opt) => (
                  <CommandItem key={opt} value={opt} onSelect={() => toggle(opt)}>
                    <Check className={cn("mr-2 h-4 w-4", values.includes(opt) ? "opacity-100" : "opacity-0")} />
                    {opt}
                  </CommandItem>
                ))}
                <CommandItem value="__add_custom__" onSelect={() => { setShowCustom(true); setOpen(false); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add custom make…
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((make) => (
            <Badge key={make} variant="secondary" className="text-xs pr-1 gap-1">
              {make}
              <button type="button" onClick={() => onChange(values.filter((m) => m !== make))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {showCustom && (
        <div className="flex gap-2">
          <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
            value={customVal} onChange={(e) => setCustomVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            autoFocus />
          <Button size="sm" className="h-8 px-3" type="button" onClick={addCustom}>Add</Button>
          <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
            onClick={() => { setShowCustom(false); setCustomVal(""); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Centrifugal Pump structured form ──────────────────────────────────────────
function CentrifugalPumpAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const singleKeys = ["pump_type", "mounting", "drive_type", "service_type", "seal_type",
    "material_class", "flow_rate", "head", "operating_temp", "fluid", "preferred_series"];

  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = key === "preferred_series" ? [] : (CENTRIFUGAL_OPTS[key] ?? []);
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  function handleSelect(key: string, val: string, opts: string[]) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function renderField(key: string, label: string, opts: string[], required?: boolean) {
    const curVal   = (attrs[key] as string) ?? "";
    const isCustom = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v, opts)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  const approvedMakes = (attrs.approved_makes as string[]) ?? [];
  // Preferred series options: union of all selected makes' series
  const seriesOpts = Array.from(new Set(approvedMakes.flatMap((m) => PUMP_SERIES_BY_MAKE[m] ?? [])));
  const preferredSeries = (attrs.preferred_series as string) ?? "";
  const isSeriesCustom = custom["preferred_series"] ?? false;
  const seriesSelectVal = isSeriesCustom ? "__other__" : (seriesOpts.includes(preferredSeries) ? preferredSeries : "");

  function sectionHeader(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Centrifugal Pump Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sectionHeader("Pump Specifications")}
        {renderField("pump_type",      "Pump Type",      CENTRIFUGAL_OPTS.pump_type,      true)}
        {renderField("mounting",       "Mounting",       CENTRIFUGAL_OPTS.mounting             )}
        {renderField("drive_type",     "Drive Type",     CENTRIFUGAL_OPTS.drive_type           )}
        {renderField("service_type",   "Service Type",   CENTRIFUGAL_OPTS.service_type         )}
        {renderField("seal_type",      "Seal Type",      CENTRIFUGAL_OPTS.seal_type            )}
        {renderField("material_class", "Material Class", CENTRIFUGAL_OPTS.material_class       )}

        {sectionHeader("Operating Conditions")}
        {renderField("flow_rate",      "Flow Rate",      CENTRIFUGAL_OPTS.flow_rate            )}
        {renderField("head",           "Head",           CENTRIFUGAL_OPTS.head                 )}
        {renderField("operating_temp", "Operating Temp", CENTRIFUGAL_OPTS.operating_temp       )}
        {renderField("fluid",          "Fluid",          CENTRIFUGAL_OPTS.fluid                )}

        {sectionHeader("Vendor / Make")}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Approved Makes <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></Label>
          <ApprovedMakesField
            values={approvedMakes}
            onChange={(v) => onChange({ ...attrs, approved_makes: v, preferred_series: "" })}
          />
        </div>

        {seriesOpts.length > 0 && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Preferred Series <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></Label>
            <SearchableSelect value={seriesSelectVal} options={seriesOpts} placeholder="Select series…"
              onSelect={(v) => handleSelect("preferred_series", v, seriesOpts)} />
            {isSeriesCustom && (
              <Input className="h-8 text-sm" placeholder="Enter custom series…"
                value={preferredSeries} onChange={(e) => set("preferred_series", e.target.value)} autoFocus />
            )}
          </div>
        )}

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
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
      if (!(ta.pump_type as string)?.trim()) {
        toast({ title: "Pump Type is required", variant: "destructive" }); return;
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Plate Type and Thickness to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Section / Pipe Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Fitting Type and Size to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Flange Type and Size to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Fastener Type and Size to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Gasket Type and Size to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Section Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Pump Type to generate…"} />
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
