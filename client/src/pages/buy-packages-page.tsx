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
  Plus, ChevronRight, ChevronDown, Package, Layers,
  CheckCircle2, Archive, Edit2, Trash2, Loader2, Search, AlertCircle, List,
  ChevronsUpDown, Check, X, FileSpreadsheet, Printer, Copy,
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

// ── Gear Pump requirement builder ────────────────────────────────────────────
function buildGearPumpRequirement(attrs: Record<string, unknown>): string {
  const gearType  = (attrs.gear_type     as string)?.trim() || "";
  const flowRate  = (attrs.flow_rate     as string)?.trim() || "";
  const pressure  = (attrs.pressure      as string)?.trim() || "";
  const matClass  = (attrs.material_class as string)?.trim() || "";
  const fluid     = (attrs.fluid         as string)?.trim() || "";

  const parts: string[] = ["Gear Pump"];
  if (gearType) parts.push(gearType);

  const opCond: string[] = [];
  if (flowRate) opCond.push(flowRate);
  if (pressure) opCond.push(`${pressure} pressure`);
  if (opCond.length === 2) parts.push(opCond.join(" @ "));
  else if (opCond.length === 1) parts.push(opCond[0]);

  if (matClass) parts.push(matClass);
  if (fluid)    parts.push(`${fluid} Service`);
  return parts.join(", ");
}

// ── Gear Pump option lists ────────────────────────────────────────────────────
const GEAR_PUMP_OPTS: Record<string, string[]> = {
  gear_type:      ["External Gear", "Internal Gear"],
  mounting:       ["Base Mounted", "Skid Mounted", "Vertical"],
  drive_type:     ["Motor Driven", "Engine Driven"],
  service_type:   ["Continuous", "Intermittent", "Standby"],
  flow_rate:      ["1 m³/hr", "2 m³/hr", "5 m³/hr", "10 m³/hr", "20 m³/hr",
                   "30 m³/hr", "50 m³/hr", "75 m³/hr", "100 m³/hr"],
  pressure:       ["2 bar", "5 bar", "10 bar", "15 bar", "20 bar", "25 bar"],
  fluid:          ["Oil", "Fuel", "Chemical", "Viscous Liquid", "Bitumen"],
  viscosity:      ["Low", "Medium", "High", "Very High"],
  operating_temp: ["Ambient", "50°C", "80°C", "120°C", "150°C"],
  material_class: ["CI", "CS", "SS304", "SS316", "Alloy Steel"],
  seal_type:      ["Mechanical Seal", "Gland Packing", "Magnetic Drive"],
};

const GEAR_PUMP_MAKES = ["Viking Pump", "Varisco", "SPX Flow", "Roper Pump", "Tuthill", "Leistritz", "Maag", "Bosch Rexroth", "Colfax"];

// ── Gear Pump structured form ─────────────────────────────────────────────────
function GearPumpAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const singleKeys = Object.keys(GEAR_PUMP_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = GEAR_PUMP_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = GEAR_PUMP_OPTS[key];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  // ── Makes multi-select ──
  const [makesOpen, setMakesOpen] = useState(false);
  const [makesQuery, setMakesQuery] = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const [customMakeVal, setCustomMakeVal] = useState("");
  const approvedMakes = (attrs.approved_makes as string[]) ?? [];

  function toggleMake(make: string) {
    onChange({ ...attrs, approved_makes: approvedMakes.includes(make)
      ? approvedMakes.filter((m) => m !== make)
      : [...approvedMakes, make] });
  }
  function addCustomMake() {
    const t = customMakeVal.trim();
    if (t && !approvedMakes.includes(t)) onChange({ ...attrs, approved_makes: [...approvedMakes, t] });
    setCustomMakeVal(""); setShowCustomMake(false);
  }
  const filteredMakes = GEAR_PUMP_MAKES.filter((o) => o.toLowerCase().includes(makesQuery.toLowerCase()));

  function sectionHeader(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gear Pump Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sectionHeader("Pump Specifications")}
        {renderField("gear_type",    "Gear Type",    true)}
        {renderField("mounting",     "Mounting"          )}
        {renderField("drive_type",   "Drive Type"        )}
        {renderField("service_type", "Service Type"      )}

        {sectionHeader("Operating Conditions")}
        {renderField("flow_rate",      "Flow Rate"       )}
        {renderField("pressure",       "Pressure"        )}
        {renderField("fluid",          "Fluid"           )}
        {renderField("viscosity",      "Viscosity"       )}
        {renderField("operating_temp", "Operating Temp"  )}

        {sectionHeader("Construction")}
        {renderField("material_class", "Material Class"  )}
        {renderField("seal_type",      "Seal Type"       )}

        {sectionHeader("Vendor / Make")}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Approved Makes <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></Label>
          <Popover open={makesOpen} onOpenChange={setMakesOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 w-full justify-between text-sm font-normal">
                {approvedMakes.length > 0 ? `${approvedMakes.length} make${approvedMakes.length > 1 ? "s" : ""} selected` : "Select approved makes…"}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {filteredMakes.map((opt) => (
                      <CommandItem key={opt} value={opt} onSelect={() => toggleMake(opt)}>
                        <Check className={cn("mr-2 h-4 w-4", approvedMakes.includes(opt) ? "opacity-100" : "opacity-0")} />
                        {opt}
                      </CommandItem>
                    ))}
                    <CommandItem value="__add_custom__" onSelect={() => { setShowCustomMake(true); setMakesOpen(false); }}>
                      <Plus className="mr-2 h-4 w-4" />Add custom make…
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {approvedMakes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {approvedMakes.map((make) => (
                <Badge key={make} variant="secondary" className="text-xs pr-1 gap-1">
                  {make}
                  <button type="button" onClick={() => onChange({ ...attrs, approved_makes: approvedMakes.filter((m) => m !== make) })} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {showCustomMake && (
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
                value={customMakeVal} onChange={(e) => setCustomMakeVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMake(); } }}
                autoFocus />
              <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomMake}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                onClick={() => { setShowCustomMake(false); setCustomMakeVal(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Screw Pump requirement builder ───────────────────────────────────────────
function buildScrewPumpRequirement(attrs: Record<string, unknown>): string {
  const screwType = (attrs.screw_type    as string)?.trim() || "";
  const flowRate  = (attrs.flow_rate     as string)?.trim() || "";
  const pressure  = (attrs.pressure      as string)?.trim() || "";
  const matClass  = (attrs.material_class as string)?.trim() || "";
  const fluid     = (attrs.fluid         as string)?.trim() || "";

  const parts: string[] = ["Screw Pump"];
  if (screwType) parts.push(screwType);

  const opCond: string[] = [];
  if (flowRate) opCond.push(flowRate);
  if (pressure) opCond.push(`${pressure} pressure`);
  if (opCond.length === 2) parts.push(opCond.join(" @ "));
  else if (opCond.length === 1) parts.push(opCond[0]);

  if (matClass) parts.push(matClass);
  if (fluid)    parts.push(`${fluid} Service`);
  return parts.join(", ");
}

// ── Screw Pump option lists ───────────────────────────────────────────────────
const SCREW_PUMP_OPTS: Record<string, string[]> = {
  screw_type:     ["Single Screw", "Twin Screw", "Triple Screw", "Progressive Cavity"],
  mounting:       ["Base Mounted", "Skid Mounted", "Vertical"],
  drive_type:     ["Motor Driven", "Engine Driven"],
  service_type:   ["Continuous", "Intermittent", "Standby"],
  flow_rate:      ["1 m³/hr", "5 m³/hr", "10 m³/hr", "20 m³/hr", "30 m³/hr",
                   "50 m³/hr", "75 m³/hr", "100 m³/hr"],
  pressure:       ["2 bar", "5 bar", "10 bar", "15 bar", "20 bar", "25 bar"],
  fluid:          ["Oil", "Fuel", "Chemical", "Slurry", "Viscous Liquid", "Bitumen"],
  viscosity:      ["Low", "Medium", "High", "Very High"],
  operating_temp: ["Ambient", "50°C", "80°C", "120°C", "150°C"],
  material_class: ["CI", "CS", "SS304", "SS316", "Alloy Steel"],
  seal_type:      ["Mechanical Seal", "Gland Packing", "Cartridge Seal"],
};

const SCREW_PUMP_MAKES = ["Allweiler", "Leistritz", "IMO Pump", "Bornemann", "NETZSCH", "Mono Pumps", "Roto", "PCM"];

// ── Screw Pump structured form ────────────────────────────────────────────────
function ScrewPumpAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const singleKeys = Object.keys(SCREW_PUMP_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = SCREW_PUMP_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = SCREW_PUMP_OPTS[key];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  // ── Makes multi-select ──
  const [makesOpen, setMakesOpen] = useState(false);
  const [makesQuery, setMakesQuery] = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const [customMakeVal, setCustomMakeVal] = useState("");
  const approvedMakes = (attrs.approved_makes as string[]) ?? [];

  function toggleMake(make: string) {
    onChange({ ...attrs, approved_makes: approvedMakes.includes(make)
      ? approvedMakes.filter((m) => m !== make)
      : [...approvedMakes, make] });
  }
  function addCustomMake() {
    const t = customMakeVal.trim();
    if (t && !approvedMakes.includes(t)) onChange({ ...attrs, approved_makes: [...approvedMakes, t] });
    setCustomMakeVal(""); setShowCustomMake(false);
  }
  const filteredMakes = SCREW_PUMP_MAKES.filter((o) => o.toLowerCase().includes(makesQuery.toLowerCase()));

  function sectionHeader(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Screw Pump Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sectionHeader("Pump Specifications")}
        {renderField("screw_type",   "Screw Type",   true)}
        {renderField("mounting",     "Mounting"          )}
        {renderField("drive_type",   "Drive Type"        )}
        {renderField("service_type", "Service Type"      )}

        {sectionHeader("Operating Conditions")}
        {renderField("flow_rate",      "Flow Rate"      )}
        {renderField("pressure",       "Pressure"       )}
        {renderField("fluid",          "Fluid"          )}
        {renderField("viscosity",      "Viscosity"      )}
        {renderField("operating_temp", "Operating Temp" )}

        {sectionHeader("Construction")}
        {renderField("material_class", "Material Class" )}
        {renderField("seal_type",      "Seal Type"      )}

        {sectionHeader("Vendor / Make")}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Approved Makes <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></Label>
          <Popover open={makesOpen} onOpenChange={setMakesOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 w-full justify-between text-sm font-normal">
                {approvedMakes.length > 0 ? `${approvedMakes.length} make${approvedMakes.length > 1 ? "s" : ""} selected` : "Select approved makes…"}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {filteredMakes.map((opt) => (
                      <CommandItem key={opt} value={opt} onSelect={() => toggleMake(opt)}>
                        <Check className={cn("mr-2 h-4 w-4", approvedMakes.includes(opt) ? "opacity-100" : "opacity-0")} />
                        {opt}
                      </CommandItem>
                    ))}
                    <CommandItem value="__add_custom__" onSelect={() => { setShowCustomMake(true); setMakesOpen(false); }}>
                      <Plus className="mr-2 h-4 w-4" />Add custom make…
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {approvedMakes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {approvedMakes.map((make) => (
                <Badge key={make} variant="secondary" className="text-xs pr-1 gap-1">
                  {make}
                  <button type="button" onClick={() => onChange({ ...attrs, approved_makes: approvedMakes.filter((m) => m !== make) })} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {showCustomMake && (
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
                value={customMakeVal} onChange={(e) => setCustomMakeVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMake(); } }}
                autoFocus />
              <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomMake}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                onClick={() => { setShowCustomMake(false); setCustomMakeVal(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Multistage Pump requirement builder ──────────────────────────────────────
function buildMultistagePumpRequirement(attrs: Record<string, unknown>): string {
  const msType   = (attrs.multistage_type  as string)?.trim() || "";
  const flowRate = (attrs.flow_rate        as string)?.trim() || "";
  const head     = (attrs.head_mlc         as string)?.trim() || "";
  const matClass = (attrs.material_class   as string)?.trim() || "";
  const fluid    = (attrs.fluid            as string)?.trim() || "";

  const parts: string[] = ["Multistage Pump"];
  if (msType) parts.push(msType);

  const opCond: string[] = [];
  if (flowRate) opCond.push(flowRate);
  if (head)     opCond.push(`${head} mLC`);
  if (opCond.length === 2) parts.push(opCond.join(" @ "));
  else if (opCond.length === 1) parts.push(opCond[0]);

  if (matClass) parts.push(matClass);
  if (fluid)    parts.push(`${fluid} Service`);
  return parts.join(", ");
}

// ── Multistage Pump option lists ─────────────────────────────────────────────
const MULTISTAGE_PUMP_OPTS: Record<string, string[]> = {
  multistage_type: ["Horizontal Multistage", "Vertical Multistage", "Ring Section", "Barrel Type"],
  mounting:        ["Base Mounted", "Skid Mounted", "Vertical"],
  drive_type:      ["Motor Driven", "Engine Driven"],
  service_type:    ["Continuous", "Intermittent", "Standby"],
  flow_rate:       ["1 m³/hr", "5 m³/hr", "10 m³/hr", "20 m³/hr", "30 m³/hr",
                    "50 m³/hr", "75 m³/hr", "100 m³/hr"],
  head_mlc:        ["50", "75", "100", "150", "200", "300", "500"],
  fluid:           ["Water", "Hot Water", "Boiler Feed Water", "Oil", "Chemical"],
  operating_temp:  ["Ambient", "50°C", "80°C", "120°C", "150°C"],
  material_class:  ["CI", "CS", "SS304", "SS316", "Duplex"],
  seal_type:       ["Single Mechanical Seal", "Double Mechanical Seal", "Cartridge Seal", "Gland Packing"],
};

const MULTISTAGE_PUMP_MAKES = ["Grundfos", "KSB", "Sulzer", "Flowserve", "Ebara", "WILO", "CNP", "Caprari", "Lowara"];

// ── Multistage Pump structured form ──────────────────────────────────────────
function MultistagePumpAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const singleKeys = Object.keys(MULTISTAGE_PUMP_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = MULTISTAGE_PUMP_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = MULTISTAGE_PUMP_OPTS[key];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  // ── Makes multi-select ──
  const [makesOpen, setMakesOpen] = useState(false);
  const [makesQuery, setMakesQuery] = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const [customMakeVal, setCustomMakeVal] = useState("");
  const approvedMakes = (attrs.approved_makes as string[]) ?? [];

  function toggleMake(make: string) {
    onChange({ ...attrs, approved_makes: approvedMakes.includes(make)
      ? approvedMakes.filter((m) => m !== make)
      : [...approvedMakes, make] });
  }
  function addCustomMake() {
    const t = customMakeVal.trim();
    if (t && !approvedMakes.includes(t)) onChange({ ...attrs, approved_makes: [...approvedMakes, t] });
    setCustomMakeVal(""); setShowCustomMake(false);
  }
  const filteredMakes = MULTISTAGE_PUMP_MAKES.filter((o) => o.toLowerCase().includes(makesQuery.toLowerCase()));

  function sectionHeader(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Multistage Pump Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sectionHeader("Pump Specifications")}
        {renderField("multistage_type", "Multistage Type", true)}
        {renderField("mounting",        "Mounting"             )}
        {renderField("drive_type",      "Drive Type"           )}
        {renderField("service_type",    "Service Type"         )}

        {sectionHeader("Operating Conditions")}
        {renderField("flow_rate",      "Flow Rate"      )}
        {renderField("head_mlc",       "Head (mLC)"     )}
        {renderField("fluid",          "Fluid"          )}
        {renderField("operating_temp", "Operating Temp" )}

        {sectionHeader("Construction")}
        {renderField("material_class", "Material Class" )}
        {renderField("seal_type",      "Seal Type"      )}

        {sectionHeader("Vendor / Make")}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Approved Makes <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></Label>
          <Popover open={makesOpen} onOpenChange={setMakesOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 w-full justify-between text-sm font-normal">
                {approvedMakes.length > 0 ? `${approvedMakes.length} make${approvedMakes.length > 1 ? "s" : ""} selected` : "Select approved makes…"}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {filteredMakes.map((opt) => (
                      <CommandItem key={opt} value={opt} onSelect={() => toggleMake(opt)}>
                        <Check className={cn("mr-2 h-4 w-4", approvedMakes.includes(opt) ? "opacity-100" : "opacity-0")} />
                        {opt}
                      </CommandItem>
                    ))}
                    <CommandItem value="__add_custom__" onSelect={() => { setShowCustomMake(true); setMakesOpen(false); }}>
                      <Plus className="mr-2 h-4 w-4" />Add custom make…
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {approvedMakes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {approvedMakes.map((make) => (
                <Badge key={make} variant="secondary" className="text-xs pr-1 gap-1">
                  {make}
                  <button type="button" onClick={() => onChange({ ...attrs, approved_makes: approvedMakes.filter((m) => m !== make) })} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {showCustomMake && (
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
                value={customMakeVal} onChange={(e) => setCustomMakeVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMake(); } }}
                autoFocus />
              <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomMake}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                onClick={() => { setShowCustomMake(false); setCustomMakeVal(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Dosing/Metering Pump requirement builder ──────────────────────────────────
function buildDosingPumpRequirement(attrs: Record<string, unknown>): string {
  const pumpType  = (attrs.pump_type        as string)?.trim() || "";
  const flowRate  = (attrs.flow_rate        as string)?.trim() || "";
  const pressure  = (attrs.pressure         as string)?.trim() || "";
  const diaphragm = (attrs.diaphragm_material as string)?.trim() || "";
  const fluid     = (attrs.fluid            as string)?.trim() || "";

  // "Diaphragm Pump" → "Diaphragm Type"; "Peristaltic Pump" → "Peristaltic Type", etc.
  const typeLabel = pumpType.endsWith(" Pump")
    ? pumpType.replace(/ Pump$/, " Type")
    : pumpType;

  const parts: string[] = ["Dosing Pump"];
  if (typeLabel) parts.push(typeLabel);

  const opCond: string[] = [];
  if (flowRate) opCond.push(flowRate);
  if (pressure) opCond.push(pressure);
  if (opCond.length === 2) parts.push(opCond.join(" @ "));
  else if (opCond.length === 1) parts.push(opCond[0]);

  if (diaphragm) parts.push(`${diaphragm} Diaphragm`);
  if (fluid)     parts.push(`${fluid} Service`);
  return parts.join(", ");
}

// ── Dosing/Metering Pump option lists ─────────────────────────────────────────
const DOSING_PUMP_OPTS: Record<string, string[]> = {
  pump_type:          ["Diaphragm Pump", "Plunger Pump", "Piston Pump", "Peristaltic Pump", "Solenoid Dosing Pump"],
  mounting:           ["Base Mounted", "Skid Mounted", "Wall Mounted", "Panel Mounted"],
  drive_type:         ["Motor Driven", "Solenoid Driven", "Pneumatic"],
  service_type:       ["Continuous", "Intermittent", "Batch"],
  flow_rate:          ["1 LPH", "5 LPH", "10 LPH", "20 LPH", "50 LPH", "100 LPH", "200 LPH", "500 LPH"],
  pressure:           ["2 bar", "5 bar", "10 bar", "15 bar", "20 bar", "25 bar"],
  dosing_accuracy:    ["±1%", "±2%", "±5%"],
  fluid:              ["Chemical", "Acid", "Alkali", "Solvent", "Water"],
  operating_temp:     ["Ambient", "40°C", "60°C", "80°C"],
  material_class:     ["PP", "PVC", "SS304", "SS316", "PVDF"],
  diaphragm_material: ["PTFE", "EPDM", "Nitrile", "Viton"],
};

const DOSING_PUMP_MAKES = ["ProMinent", "Grundfos Alldos", "Milton Roy", "Sera", "SEKO", "Emec", "Pulsafeeder", "Watson-Marlow", "LEWA"];

// ── Dosing/Metering Pump structured form ──────────────────────────────────────
function DosingPumpAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const singleKeys = Object.keys(DOSING_PUMP_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = DOSING_PUMP_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = DOSING_PUMP_OPTS[key];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  // ── Makes multi-select ──
  const [makesOpen, setMakesOpen] = useState(false);
  const [makesQuery, setMakesQuery] = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const [customMakeVal, setCustomMakeVal] = useState("");
  const approvedMakes = (attrs.approved_makes as string[]) ?? [];

  function toggleMake(make: string) {
    onChange({ ...attrs, approved_makes: approvedMakes.includes(make)
      ? approvedMakes.filter((m) => m !== make)
      : [...approvedMakes, make] });
  }
  function addCustomMake() {
    const t = customMakeVal.trim();
    if (t && !approvedMakes.includes(t)) onChange({ ...attrs, approved_makes: [...approvedMakes, t] });
    setCustomMakeVal(""); setShowCustomMake(false);
  }
  const filteredMakes = DOSING_PUMP_MAKES.filter((o) => o.toLowerCase().includes(makesQuery.toLowerCase()));

  function sectionHeader(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dosing / Metering Pump Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sectionHeader("Pump Specifications")}
        {renderField("pump_type",    "Pump Type",    true)}
        {renderField("mounting",     "Mounting"          )}
        {renderField("drive_type",   "Drive Type"        )}
        {renderField("service_type", "Service Type"      )}

        {sectionHeader("Operating Conditions")}
        {renderField("flow_rate",       "Flow Rate (LPH)"  )}
        {renderField("pressure",        "Pressure"         )}
        {renderField("dosing_accuracy", "Dosing Accuracy"  )}
        {renderField("fluid",           "Fluid"            )}
        {renderField("operating_temp",  "Operating Temp"   )}

        {sectionHeader("Construction")}
        {renderField("material_class",     "Material Class"     )}
        {renderField("diaphragm_material", "Diaphragm Material" )}

        {sectionHeader("Vendor / Make")}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Approved Makes <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></Label>
          <Popover open={makesOpen} onOpenChange={setMakesOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 w-full justify-between text-sm font-normal">
                {approvedMakes.length > 0 ? `${approvedMakes.length} make${approvedMakes.length > 1 ? "s" : ""} selected` : "Select approved makes…"}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {filteredMakes.map((opt) => (
                      <CommandItem key={opt} value={opt} onSelect={() => toggleMake(opt)}>
                        <Check className={cn("mr-2 h-4 w-4", approvedMakes.includes(opt) ? "opacity-100" : "opacity-0")} />
                        {opt}
                      </CommandItem>
                    ))}
                    <CommandItem value="__add_custom__" onSelect={() => { setShowCustomMake(true); setMakesOpen(false); }}>
                      <Plus className="mr-2 h-4 w-4" />Add custom make…
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {approvedMakes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {approvedMakes.map((make) => (
                <Badge key={make} variant="secondary" className="text-xs pr-1 gap-1">
                  {make}
                  <button type="button" onClick={() => onChange({ ...attrs, approved_makes: approvedMakes.filter((m) => m !== make) })} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {showCustomMake && (
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
                value={customMakeVal} onChange={(e) => setCustomMakeVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMake(); } }}
                autoFocus />
              <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomMake}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                onClick={() => { setShowCustomMake(false); setCustomMakeVal(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Vacuum Booster requirement builder ───────────────────────────────────────
function buildVacuumBoosterRequirement(attrs: Record<string, unknown>): string {
  const boosterType    = (attrs.booster_type     as string)?.trim() || "";
  const flowRate       = (attrs.flow_rate        as string)?.trim() || "";
  const suctionPres    = (attrs.suction_pressure as string)?.trim() || "";
  const gasType        = (attrs.gas_type         as string)?.trim() || "";

  // "Roots Blower" → "Roots Type", "Vacuum Booster" → "Vacuum Type", "Twin Lobe" → "Twin Lobe Type"
  const typeLabel = boosterType
    ? boosterType.replace(/ (Blower|Booster)$/, "") + " Type"
    : "";

  const parts: string[] = ["Vacuum Booster"];
  if (typeLabel)    parts.push(typeLabel);
  if (flowRate)     parts.push(flowRate);
  if (suctionPres)  parts.push(`${suctionPres} suction`);
  if (gasType)      parts.push(`${gasType} Service`);
  return parts.join(", ");
}

// ── Vacuum Booster option lists ───────────────────────────────────────────────
const VACUUM_BOOSTER_OPTS: Record<string, string[]> = {
  booster_type:      ["Roots Blower", "Vacuum Booster", "Twin Lobe", "Tri-Lobe"],
  flow_rate:         ["250 m³/hr", "500 m³/hr", "1000 m³/hr", "2000 m³/hr",
                      "4000 m³/hr", "6000 m³/hr", "10000 m³/hr"],
  suction_pressure:  ["1000 mbar (Atmospheric)", "500 mbar", "200 mbar",
                      "100 mbar", "50 mbar", "10 mbar", "1 mbar"],
  discharge_pressure:["Atmospheric", "Slight Positive", "0.2 bar(g)", "0.5 bar(g)"],
  gas_type:          ["Air", "Nitrogen", "Hydrocarbon Vapors", "Process Gas"],
  material_class:    ["CI", "CS", "SS304", "SS316"],
  cooling_type:      ["Air Cooled", "Water Cooled"],
};

const VACUUM_BOOSTER_MAKES = ["MD-Kinney", "Busch", "Pfeiffer", "Atlas Copco", "Leybold", "Edwards", "Elmo Rietschle", "Tuthill"];

// ── Vacuum Booster structured form ───────────────────────────────────────────
function VacuumBoosterAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const singleKeys = Object.keys(VACUUM_BOOSTER_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = VACUUM_BOOSTER_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = VACUUM_BOOSTER_OPTS[key];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  // ── Makes multi-select ──
  const [makesOpen, setMakesOpen] = useState(false);
  const [makesQuery, setMakesQuery] = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const [customMakeVal, setCustomMakeVal] = useState("");
  const approvedMakes = (attrs.approved_makes as string[]) ?? [];

  function toggleMake(make: string) {
    onChange({ ...attrs, approved_makes: approvedMakes.includes(make)
      ? approvedMakes.filter((m) => m !== make)
      : [...approvedMakes, make] });
  }
  function addCustomMake() {
    const t = customMakeVal.trim();
    if (t && !approvedMakes.includes(t)) onChange({ ...attrs, approved_makes: [...approvedMakes, t] });
    setCustomMakeVal(""); setShowCustomMake(false);
  }
  const filteredMakes = VACUUM_BOOSTER_MAKES.filter((o) => o.toLowerCase().includes(makesQuery.toLowerCase()));

  function sectionHeader(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vacuum Booster Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sectionHeader("Equipment Type")}
        {renderField("booster_type", "Booster Type", true)}
        <div /> {/* spacer */}

        {sectionHeader("Operating Conditions")}
        {renderField("flow_rate",          "Flow Rate (m³/hr)"   )}
        {renderField("suction_pressure",   "Suction Pressure"    )}
        {renderField("discharge_pressure", "Discharge Pressure"  )}
        {renderField("gas_type",           "Gas Type"            )}

        {sectionHeader("Construction")}
        {renderField("material_class", "Material Class" )}
        {renderField("cooling_type",   "Cooling Type"   )}

        {sectionHeader("Vendor / Make")}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Approved Makes <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></Label>
          <Popover open={makesOpen} onOpenChange={setMakesOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 w-full justify-between text-sm font-normal">
                {approvedMakes.length > 0 ? `${approvedMakes.length} make${approvedMakes.length > 1 ? "s" : ""} selected` : "Select approved makes…"}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {filteredMakes.map((opt) => (
                      <CommandItem key={opt} value={opt} onSelect={() => toggleMake(opt)}>
                        <Check className={cn("mr-2 h-4 w-4", approvedMakes.includes(opt) ? "opacity-100" : "opacity-0")} />
                        {opt}
                      </CommandItem>
                    ))}
                    <CommandItem value="__add_custom__" onSelect={() => { setShowCustomMake(true); setMakesOpen(false); }}>
                      <Plus className="mr-2 h-4 w-4" />Add custom make…
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {approvedMakes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {approvedMakes.map((make) => (
                <Badge key={make} variant="secondary" className="text-xs pr-1 gap-1">
                  {make}
                  <button type="button" onClick={() => onChange({ ...attrs, approved_makes: approvedMakes.filter((m) => m !== make) })} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {showCustomMake && (
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
                value={customMakeVal} onChange={(e) => setCustomMakeVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMake(); } }}
                autoFocus />
              <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomMake}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                onClick={() => { setShowCustomMake(false); setCustomMakeVal(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Completeness Warning System ───────────────────────────────────────────────
function WarningPanel({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-3 space-y-1.5">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
        ⚠ Datasheet Completeness Warning
      </p>
      <ul className="space-y-0.5">
        {warnings.map((w, i) => (
          <li key={i} className="text-xs text-amber-700 dark:text-amber-400">• {w}</li>
        ))}
      </ul>
      <p className="text-[11px] text-amber-500 dark:text-amber-500 italic">
        These fields are optional but leaving them empty may impact datasheet completeness.
      </p>
    </div>
  );
}

function computeSubgroupWarnings(
  subgroupCode: string,
  groupCode: string,
  attrs: Record<string, unknown>,
  isMotor: boolean,
): string[] {
  const w: string[] = [];
  const missing = (key: string) => !((attrs[key] as string) ?? "").trim();

  if (isMotor) {
    if (missing("efficiency_class")) w.push("Efficiency Class — required for energy compliance datasheets.");
    if (missing("ip_rating"))        w.push("IP Rating — required for area classification datasheets.");
    if (missing("mounting"))         w.push("Mounting type — needed for installation drawings.");
    if (missing("cooling_type"))     w.push("Cooling Type — may be needed for thermal datasheets.");
    return w;
  }

  if (subgroupCode === "pressure") {
    if (missing("range_min") && missing("range_max")) w.push("Pressure range — critical for instrument datasheet.");
    if (missing("range_unit"))      w.push("Range unit — needed for datasheet completeness.");
    if (missing("connection_type")) w.push("Connection type — needed for piping interface.");
    if (missing("wetted_material")) w.push("Wetted material — required for material selection datasheet.");
    if (missing("output_signal"))   w.push("Output signal — needed for control system interface.");
  } else if (subgroupCode === "temperature") {
    if (missing("sensor_type"))     w.push("Sensor type (TC/RTD) — required for instrument datasheet.");
    if (missing("range_min") && missing("range_max")) w.push("Temperature range — critical for instrument datasheet.");
    if (missing("wetted_material")) w.push("Wetted material — required for thermowell selection.");
    if (missing("connection_type")) w.push("Connection type — needed for piping interface.");
  } else if (subgroupCode === "flow") {
    if (missing("liner_material"))  w.push("Liner material — required for flow meter datasheet.");
    if (missing("end_connection"))  w.push("End connection — needed for piping interface.");
    if (missing("output_signal"))   w.push("Output signal — needed for control system interface.");
  } else if (subgroupCode === "level") {
    if (missing("range_min") && missing("range_max")) w.push("Level range — required for instrument datasheet.");
    if (missing("output_signal"))   w.push("Output signal — needed for control system interface.");
    if (missing("wetted_material")) w.push("Wetted material — required for material selection.");
  } else if (subgroupCode === "isolation") {
    if (missing("end_connection"))  w.push("End connection — needed for piping interface.");
    if (missing("body_material"))   w.push("Body material — required for material class datasheet.");
  } else if (subgroupCode === "control") {
    if (missing("end_connection"))  w.push("End connection — needed for piping interface.");
    if (missing("trim_material"))   w.push("Trim material — required for valve datasheet.");
  } else if (subgroupCode === "safety") {
    if (missing("set_pressure"))    w.push("Set pressure — critical for PSV datasheet and SIL compliance.");
    if (missing("end_connection"))  w.push("End connection — needed for piping interface.");
    if (missing("body_material"))   w.push("Body material — required for material class datasheet.");
  } else if (subgroupCode === "on_off") {
    if (missing("end_connection"))  w.push("End connection — needed for piping interface.");
    if (missing("body_material"))   w.push("Body material — required for material class datasheet.");
  } else if (subgroupCode === "panels") {
    if (missing("voltage"))         w.push("Supply voltage — required for electrical datasheet.");
    if (missing("ip_rating"))       w.push("IP rating — required for enclosure datasheet.");
    if (missing("enclosure_type"))  w.push("Enclosure type — needed for panel datasheet.");
  } else if (subgroupCode === "cabling") {
    if (missing("insulation_type")) w.push("Insulation type — required for cable datasheet.");
    if (missing("armour_type"))     w.push("Armour type — required for cable routing design.");
    if (missing("voltage_grade"))   w.push("Voltage grade — critical for cable selection.");
  } else if (subgroupCode === "junction_box") {
    if (missing("num_terminals"))   w.push("Number of terminals — needed for JB schedule.");
    if (missing("terminal_type"))   w.push("Terminal type — required for termination datasheet.");
  } else if (subgroupCode === "general" && groupCode === "bought_out_packages") {
    if (missing("material_class"))  w.push("Material class — required for vendor datasheet.");
    if (missing("configuration"))   w.push("Configuration — may impact vendor selection.");
  } else if (subgroupCode === "cooling_tower") {
    if (missing("casing_material")) w.push("Casing material — required for CT datasheet.");
    if (missing("fan_type"))        w.push("Fan type — required for fan selection datasheet.");
  }

  return w;
}

// ── Datasheet Section Types ───────────────────────────────────────────────────
type DatasheetField   = { label: string; value: string; highlight?: boolean };
type DatasheetSection = { title: string; fields: DatasheetField[] };

function buildDatasheetSections(
  subgroupCode: string,
  groupCode: string,
  attrs: Record<string, unknown>,
  isMotor: boolean,
): DatasheetSection[] {
  const v = (key: string): string => ((attrs[key] as string) ?? "").trim() || "—";
  const vUnit = (key: string, unitKey: string): string => {
    const val = ((attrs[key] as string) ?? "").trim();
    const unit = ((attrs[unitKey] as string) ?? "").trim();
    if (!val) return "—";
    return unit ? `${val} ${unit}` : val;
  };
  const vMakes = (): string => {
    const raw = attrs["approved_makes"];
    if (Array.isArray(raw)) return raw.join(", ") || "—";
    return ((raw as string) ?? "").trim() || "—";
  };

  const vFirst = (...keys: string[]): string => {
    for (const k of keys) {
      const val = ((attrs[k] as string) ?? "").trim();
      if (val) return val;
    }
    return "—";
  };

  if (isMotor) {
    return [
      { title: "Motor Details", fields: [
        { label: "Motor Type",       value: v("motor_type"), highlight: true },
        { label: "Power (kW)",       value: v("power") },
        { label: "Voltage",          value: v("voltage") },
        { label: "Speed (RPM)",      value: v("speed") },
        { label: "Efficiency Class", value: v("efficiency_class") },
        { label: "Frame Size",       value: v("frame_size") },
        { label: "Poles",            value: v("poles") },
      ]},
      { title: "Mechanical", fields: [
        { label: "Cooling Type",     value: v("cooling_type") },
        { label: "Mounting",         value: v("mounting") },
        { label: "IP Rating",        value: v("ip_rating") },
        { label: "Insulation Class", value: v("insulation_class") },
        { label: "Duty",             value: v("duty") },
      ]},
      { title: "Hazardous Area", fields: [
        { label: "Area Classification",  value: v("area_classification") },
        { label: "Explosion Protection", value: v("explosion_protection") },
        { label: "Certification",        value: v("certification") },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "pressure") {
    return [
      { title: "Instrument Details", fields: [
        { label: "Instrument Type",  value: v("instrument_type"), highlight: true },
        { label: "Measurement Type", value: v("measurement_type") },
        { label: "Output Signal",    value: v("output_signal") },
      ]},
      { title: "Measurement Range", fields: [
        { label: "Range Min",  value: v("range_min") },
        { label: "Range Max",  value: v("range_max") },
        { label: "Range Unit", value: v("range_unit") },
      ]},
      { title: "Process Conditions", fields: [
        { label: "Process Fluid",       value: v("process_fluid") },
        { label: "Operating Temp",      value: v("operating_temp") },
        { label: "Design Pressure",     value: vUnit("design_pressure", "design_pressure_unit") },
        { label: "Design Temperature",  value: vUnit("design_temperature", "design_temperature_unit") },
      ]},
      { title: "Connection", fields: [
        { label: "Connection Size", value: v("connection_size") },
        { label: "Connection Type", value: v("connection_type") },
      ]},
      { title: "Construction", fields: [
        { label: "Wetted Material", value: v("wetted_material") },
        { label: "Enclosure Type",  value: v("enclosure_type") },
      ]},
      { title: "Hazardous Area", fields: [
        { label: "Area Classification",  value: v("area_classification") },
        { label: "Explosion Protection", value: v("explosion_protection") },
        { label: "Certification",        value: v("certification") },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "temperature") {
    return [
      { title: "Instrument Details", fields: [
        { label: "Instrument Type", value: v("instrument_type"), highlight: true },
        { label: "Sensor Type",     value: v("sensor_type") },
      ]},
      { title: "Measuring Range", fields: [
        { label: "Range Min",  value: v("range_min") },
        { label: "Range Max",  value: v("range_max") },
        { label: "Range Unit", value: v("range_unit") },
      ]},
      { title: "Process Conditions", fields: [
        { label: "Process Fluid",       value: v("process_fluid") },
        { label: "Design Pressure",     value: vUnit("design_pressure", "design_pressure_unit") },
        { label: "Design Temperature",  value: vUnit("design_temperature", "design_temperature_unit") },
      ]},
      { title: "Connection", fields: [
        { label: "Connection Size", value: v("connection_size") },
        { label: "Connection Type", value: v("connection_type") },
        { label: "Wetted Material", value: v("wetted_material") },
      ]},
      { title: "Hazardous Area", fields: [
        { label: "Area Classification",  value: v("area_classification") },
        { label: "Explosion Protection", value: v("explosion_protection") },
        { label: "Certification",        value: v("certification") },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "flow") {
    return [
      { title: "Instrument Details", fields: [
        { label: "Instrument Type", value: v("instrument_type"), highlight: true },
        { label: "Line Size",       value: v("line_size") },
        { label: "Output Signal",   value: v("output_signal") },
      ]},
      { title: "Process Conditions", fields: [
        { label: "Process Fluid",       value: v("process_fluid") },
        { label: "Design Pressure",     value: vUnit("design_pressure", "design_pressure_unit") },
        { label: "Design Temperature",  value: vUnit("design_temperature", "design_temperature_unit") },
      ]},
      { title: "Construction", fields: [
        { label: "Liner Material", value: v("liner_material") },
        { label: "End Connection", value: v("end_connection") },
      ]},
      { title: "Hazardous Area", fields: [
        { label: "Area Classification",  value: v("area_classification") },
        { label: "Explosion Protection", value: v("explosion_protection") },
        { label: "Certification",        value: v("certification") },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "level") {
    return [
      { title: "Instrument Details", fields: [
        { label: "Instrument Type", value: v("instrument_type"), highlight: true },
        { label: "Output Signal",   value: v("output_signal") },
      ]},
      { title: "Measurement Range", fields: [
        { label: "Range Min",  value: v("range_min") },
        { label: "Range Max",  value: v("range_max") },
        { label: "Range Unit", value: v("range_unit") },
      ]},
      { title: "Process Conditions", fields: [
        { label: "Process Fluid",       value: v("process_fluid") },
        { label: "Design Pressure",     value: vUnit("design_pressure", "design_pressure_unit") },
        { label: "Design Temperature",  value: vUnit("design_temperature", "design_temperature_unit") },
      ]},
      { title: "Construction", fields: [
        { label: "Wetted Material", value: v("wetted_material") },
        { label: "Connection Size", value: v("connection_size") },
        { label: "Connection Type", value: v("connection_type") },
        { label: "Enclosure",       value: v("enclosure") },
      ]},
      { title: "Hazardous Area", fields: [
        { label: "Area Classification",  value: v("area_classification") },
        { label: "Explosion Protection", value: v("explosion_protection") },
        { label: "Certification",        value: v("certification") },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "isolation") {
    return [
      { title: "Valve Details", fields: [
        { label: "Valve Type",      value: v("valve_type"), highlight: true },
        { label: "Size (NB)",       value: v("size_nb") },
        { label: "Pressure Rating", value: v("pressure_rating") },
        { label: "Operation Type",  value: v("operation_type") },
      ]},
      { title: "Process Conditions", fields: [
        { label: "Process Fluid",         value: v("process_fluid") },
        { label: "Operating Pressure",    value: vUnit("operating_pressure", "operating_pressure_unit") },
        { label: "Operating Temperature", value: vUnit("operating_temperature", "operating_temperature_unit") },
        { label: "Design Pressure",       value: vUnit("design_pressure", "design_pressure_unit") },
        { label: "Design Temperature",    value: vUnit("design_temperature", "design_temperature_unit") },
      ]},
      { title: "Connection & Material", fields: [
        { label: "End Connection", value: v("end_connection") },
        { label: "Body Material",  value: v("body_material") },
        { label: "Trim Material",  value: v("trim_material") },
        { label: "Seat Type",      value: v("seat_type") },
      ]},
      { title: "Hazardous Area", fields: [
        { label: "Area Classification", value: v("area_classification") },
        { label: "Certification",       value: v("certification") },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "control") {
    return [
      { title: "Valve Details", fields: [
        { label: "Valve Type",          value: v("valve_type"), highlight: true },
        { label: "Size (NB)",           value: v("size_nb") },
        { label: "Pressure Rating",     value: v("pressure_rating") },
        { label: "Flow Characteristic", value: v("flow_characteristic") },
      ]},
      { title: "Actuation", fields: [
        { label: "Actuation Type", value: v("actuation_type") },
        { label: "Fail Action",    value: v("fail_action") },
        { label: "Input Signal",   value: v("input_signal") },
        { label: "Positioner",     value: v("positioner") },
      ]},
      { title: "Process Conditions", fields: [
        { label: "Process Fluid",         value: v("process_fluid") },
        { label: "Operating Pressure",    value: vUnit("operating_pressure", "operating_pressure_unit") },
        { label: "Operating Temperature", value: vUnit("operating_temperature", "operating_temperature_unit") },
        { label: "Design Pressure",       value: vUnit("design_pressure", "design_pressure_unit") },
        { label: "Design Temperature",    value: vUnit("design_temperature", "design_temperature_unit") },
      ]},
      { title: "Connection & Material", fields: [
        { label: "End Connection", value: v("end_connection") },
        { label: "Body Material",  value: v("body_material") },
        { label: "Trim Material",  value: v("trim_material") },
        { label: "Seat Type",      value: v("seat_type") },
      ]},
      { title: "Hazardous Area", fields: [
        { label: "Area Classification", value: v("area_classification") },
        { label: "Certification",       value: v("certification") },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "safety") {
    return [
      { title: "Valve Details", fields: [
        { label: "Valve Type",      value: v("valve_type"), highlight: true },
        { label: "Size (NB)",       value: v("size_nb") },
        { label: "Pressure Rating", value: v("pressure_rating") },
        { label: "Set Pressure",    value: v("set_pressure") },
        { label: "API Orifice",     value: v("api_orifice") },
      ]},
      { title: "Process Conditions", fields: [
        { label: "Process Fluid",         value: v("process_fluid") },
        { label: "Operating Pressure",    value: vUnit("operating_pressure", "operating_pressure_unit") },
        { label: "Operating Temperature", value: vUnit("operating_temperature", "operating_temperature_unit") },
        { label: "Design Pressure",       value: vUnit("design_pressure", "design_pressure_unit") },
        { label: "Design Temperature",    value: vUnit("design_temperature", "design_temperature_unit") },
      ]},
      { title: "Connection & Material", fields: [
        { label: "End Connection", value: v("end_connection") },
        { label: "Body Material",  value: v("body_material") },
        { label: "Trim Material",  value: v("trim_material") },
        { label: "Bonnet Type",    value: v("bonnet_type") },
      ]},
      { title: "Hazardous Area", fields: [
        { label: "Area Classification", value: v("area_classification") },
        { label: "Certification",       value: v("certification") },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "on_off") {
    return [
      { title: "Valve Details", fields: [
        { label: "Valve Type",          value: v("valve_type"), highlight: true },
        { label: "Valve Configuration", value: v("valve_configuration") },
        { label: "Size (NB)",           value: v("size_nb") },
        { label: "Pressure Rating",     value: v("pressure_rating") },
        { label: "Service Type",        value: v("service_type") },
      ]},
      { title: "Actuation", fields: [
        { label: "Actuation Type", value: v("actuation_type") },
        { label: "Fail Action",    value: v("fail_action") },
      ]},
      { title: "Process Conditions", fields: [
        { label: "Process Fluid",         value: v("process_fluid") },
        { label: "Operating Pressure",    value: vUnit("operating_pressure", "operating_pressure_unit") },
        { label: "Operating Temperature", value: vUnit("operating_temperature", "operating_temperature_unit") },
        { label: "Design Pressure",       value: vUnit("design_pressure", "design_pressure_unit") },
        { label: "Design Temperature",    value: vUnit("design_temperature", "design_temperature_unit") },
      ]},
      { title: "Connection & Material", fields: [
        { label: "End Connection",     value: v("end_connection") },
        { label: "Body Material",      value: v("body_material") },
        { label: "Trim/Disc Material", value: v("trim_disc_material") },
        { label: "Seat Type",          value: v("seat_type") },
      ]},
      { title: "Hazardous Area", fields: [
        { label: "Area Classification", value: v("area_classification") },
        { label: "Certification",       value: v("certification") },
      ]},
    ];
  }

  if (subgroupCode === "panels") {
    return [
      { title: "Panel Details", fields: [
        { label: "Panel Type",     value: v("panel_type"), highlight: true },
        { label: "Voltage",        value: v("voltage") },
        { label: "Frequency",      value: v("frequency") },
        { label: "Control Supply", value: v("control_supply") },
      ]},
      { title: "Enclosure", fields: [
        { label: "Enclosure Type",     value: v("enclosure_type") },
        { label: "IP Rating",          value: v("ip_rating") },
        { label: "Enclosure Material", value: v("enclosure_material") },
        { label: "Mounting",           value: v("mounting") },
      ]},
      { title: "Feeder / Incomer", fields: [
        { label: "Incomer Type",   value: v("incomer_type") },
        { label: "Incomer Rating", value: v("incomer_rating") },
        { label: "Feeder Load",    value: v("feeder_load") },
        { label: "Busbar Type",    value: v("busbar_type") },
      ]},
      { title: "Communication & Certification", fields: [
        { label: "Protocol",            value: v("communication_protocol") },
        { label: "Area Classification", value: v("area_classification") },
        { label: "Certification",       value: v("certification") },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "cabling") {
    return [
      { title: "Cable Details", fields: [
        { label: "Cable Type",         value: v("cable_type"), highlight: true },
        { label: "No. of Cores",       value: v("num_cores") },
        { label: "Cable Size (sq.mm)", value: v("cable_size") },
        { label: "Conductor",          value: v("conductor_material") },
      ]},
      { title: "Insulation & Armour", fields: [
        { label: "Insulation Type", value: v("insulation_type") },
        { label: "Armour Type",     value: v("armour_type") },
        { label: "Voltage Grade",   value: v("voltage_grade") },
        { label: "Laying Type",     value: v("laying_type") },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "junction_box") {
    const l = v("length_mm"), w = v("width_mm"), d = v("depth_mm");
    const dims = l !== "—" && w !== "—" && d !== "—" ? `${l} × ${w} × ${d} mm` : "—";
    return [
      { title: "Junction Box Details", fields: [
        { label: "JB Type",         value: v("jb_type"), highlight: true },
        { label: "Enclosure Type",  value: v("enclosure_type") },
        { label: "Mounting",        value: v("mounting") },
        { label: "IP Rating",       value: v("ip_rating") },
        { label: "Material",        value: v("enclosure_material") },
        { label: "Dimensions",      value: dims },
      ]},
      { title: "Termination & Glands", fields: [
        { label: "No. of Terminals",  value: v("num_terminals") },
        { label: "Terminal Type",     value: v("terminal_type") },
        { label: "Cable Entries",     value: v("num_cable_entries") },
        { label: "Cable Entry Type",  value: v("cable_entry_type") },
        { label: "No. of Glands",     value: v("num_glands") },
        { label: "Cable Gland Type",  value: v("cable_gland_type") },
        { label: "Gland Size",        value: v("gland_size") },
      ]},
      { title: "Area & Certification", fields: [
        { label: "Area Classification", value: v("area_classification") },
        { label: "Certification",       value: v("certification") },
        { label: "Earthing",            value: v("earthing") },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "cooling_tower") {
    return [
      { title: "Cooling Tower Details", fields: [
        { label: "Type",              value: v("cooling_tower_type"), highlight: true },
        { label: "Circulation Rate",  value: v("circulation_rate") !== "—" ? `${v("circulation_rate")} m³/hr` : "—" },
        { label: "Fan Type",          value: v("fan_type") },
        { label: "Fan Drive",         value: v("fan_drive") },
        { label: "Motor Power (kW)",  value: v("motor_power_kw") },
      ]},
      { title: "Thermal Performance", fields: [
        { label: "Inlet Water Temp (°C)",  value: v("inlet_water_temp") },
        { label: "Outlet Water Temp (°C)", value: v("outlet_water_temp") },
        { label: "Wet Bulb Temp (°C)",     value: v("wet_bulb_temp") },
      ]},
      { title: "Construction", fields: [
        { label: "Casing Material", value: v("casing_material") },
        { label: "Fill Type",       value: v("fill_type") },
        { label: "Construction",    value: v("construction") },
      ]},
    ];
  }

  if (subgroupCode === "general" && groupCode === "bought_out_packages") {
    return [
      { title: "Package Details", fields: [
        { label: "Package Type",    value: v("package_type"), highlight: true },
        { label: "Capacity",        value: v("capacity") },
        { label: "Duty Type",       value: v("duty_type") },
        { label: "Number of Units", value: v("number_of_units") },
        { label: "Configuration",   value: v("configuration") },
        { label: "Material Class",  value: v("material_class") },
      ]},
      { title: "Components", fields: [
        { label: "Package Components", value: ((attrs.package_components as string) ?? "").trim() || "—" },
      ]},
      { title: "Approved Makes", fields: [{ label: "Makes", value: vMakes() }]},
    ];
  }

  if (subgroupCode === "pump_skid" || subgroupCode === "pump_skid_packages") {
    return [
      { title: "Package Details", fields: [
        { label: "Package Type",   value: v("package_type"), highlight: true },
        { label: "Pump Type",      value: vFirst("pump_type") },
        { label: "No. of Pumps",   value: v("num_pumps") },
        { label: "Standby Config", value: v("standby_config") },
        { label: "Mounting",       value: v("mounting") },
        { label: "Material Class", value: v("material_class") },
      ]},
      { title: "Operating Conditions", fields: [
        { label: "Flow Rate / Flow (m³/hr)", value: vFirst("flow_rate", "flow_m3hr"), highlight: true },
        { label: "Head / Pressure",          value: vFirst("head", "head_m", "head_pressure") },
        { label: "Fluid / Process Fluid",    value: vFirst("fluid", "process_fluid") },
        { label: "Operating Temperature",    value: vFirst("operating_temp", "operating_temp_c") },
        { label: "Design Pressure",          value: vUnit("design_pressure", "design_pressure_unit") },
      ]},
      { title: "Components", fields: [
        { label: "Included Components",
          value: ((attrs.included_components as string[]) ?? []).join(", ") || "—" },
      ]},
    ];
  }

  // Generic fallback — raw materials, unrecognized subgroups, or any attrs-bearing item
  const SKIP_GEN = new Set(["preferred_series", "approved_makes"]);
  const genericFields: DatasheetField[] = [];
  for (const [key, val] of Object.entries(attrs)) {
    if (SKIP_GEN.has(key)) continue;
    const raw = Array.isArray(val)
      ? (val as string[]).join(", ")
      : String(val ?? "").trim();
    if (!raw || raw === "false" || raw === "0") continue;
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    genericFields.push({ label, value: raw });
  }
  const makesVal = vMakes();
  if (makesVal !== "—") genericFields.push({ label: "Approved Makes", value: makesVal });

  return [{
    title: "Item Specifications",
    fields: genericFields.length > 0
      ? genericFields
      : [{ label: "Description", value: "Refer to generic requirement", highlight: true }],
  }];
}

// ── Datasheet PDF Document (react-pdf) ───────────────────────────────────────
const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1a1a1a",
    paddingTop: 40,
    paddingBottom: 52,
    paddingHorizontal: 42,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: "#1e3a5f",
    paddingBottom: 8,
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
    marginBottom: 3,
  },
  headerSub: { fontSize: 8, color: "#555" },
  headerRight: { textAlign: "right" },
  headerRightStrong: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#333", marginBottom: 2 },
  headerRightSmall: { fontSize: 8, color: "#666" },
  reqBlock: {
    backgroundColor: "#f8fafc",
    borderWidth: 0.75,
    borderColor: "#cbd5e1",
    borderRadius: 3,
    padding: 8,
    marginBottom: 14,
  },
  reqLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  reqText: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 2,
  },
  reqQty: { fontSize: 7.5, color: "#64748b" },
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    borderBottomWidth: 0.75,
    borderBottomColor: "#93c5fd",
    paddingBottom: 3,
    marginBottom: 5,
    marginTop: 12,
  },
  fieldsGrid: { flexDirection: "row", flexWrap: "wrap" },
  fieldRow: { width: "50%", flexDirection: "row", paddingVertical: 2, paddingRight: 6 },
  fieldLabel: { width: 105, fontSize: 8, color: "#64748b", flexShrink: 0 },
  fieldValue:         { flex: 1, fontSize: 8, color: "#0f172a" },
  fieldValueBold:     { flex: 1, fontSize: 8, color: "#0f172a", fontFamily: "Helvetica-Bold" },
  fieldValueMissing:  { flex: 1, fontSize: 8, color: "#cbd5e1" },
  divider: { borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", marginVertical: 4 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 42,
    right: 42,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#d1d5db",
    paddingTop: 5,
  },
  footerText: { fontSize: 7, color: "#9ca3af" },
});

function DatasheetPDFDocument({
  line,
  sections,
}: {
  line: PackageLine;
  sections: DatasheetSection[];
}) {
  return (
    <Document
      title={`Datasheet — ${line.generic_requirement}`}
      author="THERMOPAC ENGINEERING PVT LTD"
      subject="BUY Package Catalog Datasheet"
    >
      <Page size="A4" style={pdfStyles.page}>
        {/* Header */}
        <View style={pdfStyles.header}>
          <View>
            <Text style={pdfStyles.headerTitle}>THERMOPAC — ITEM DATASHEET</Text>
            <Text style={pdfStyles.headerSub}>
              {line.buy_group_label} / {line.buy_subgroup_label}
            </Text>
          </View>
          <View style={pdfStyles.headerRight}>
            <Text style={pdfStyles.headerRightStrong}>BUY Package Catalog</Text>
            <Text style={pdfStyles.headerRightSmall}>
              Qty: {line.default_quantity} {line.uom_code}
            </Text>
          </View>
        </View>

        {/* Generic Requirement */}
        <View style={pdfStyles.reqBlock}>
          <Text style={pdfStyles.reqLabel}>Generic Requirement</Text>
          <Text style={pdfStyles.reqText}>{line.generic_requirement}</Text>
          <Text style={pdfStyles.reqQty}>Quantity: {line.default_quantity} {line.uom_code}</Text>
        </View>

        {/* Sections */}
        {sections.map((sec) => (
          <View key={sec.title} wrap={false}>
            <Text style={pdfStyles.sectionTitle}>{sec.title}</Text>
            <View style={pdfStyles.fieldsGrid}>
              {sec.fields.map((f) => (
                <View key={f.label} style={pdfStyles.fieldRow}>
                  <Text style={pdfStyles.fieldLabel}>{f.label}</Text>
                  <Text
                    style={
                      f.value === "—"
                        ? pdfStyles.fieldValueMissing
                        : f.highlight
                        ? pdfStyles.fieldValueBold
                        : pdfStyles.fieldValue
                    }
                  >
                    {f.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Footer — fixed on every page */}
        <View style={pdfStyles.footer} fixed>
          <Text style={pdfStyles.footerText}>
            THERMOPAC ENGINEERING PVT LTD — BUY Package Catalog
          </Text>
          <Text
            style={pdfStyles.footerText}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

// ── Datasheet Completeness ────────────────────────────────────────────────────
type DatasheetCompleteness = { score: number; filled: number; total: number; criticalMissing: string[] };

const DS_CRITICAL_FIELDS: Record<string, string[]> = {
  pressure:     ["Instrument Type","Range Min","Range Max","Range Unit","Output Signal","Wetted Material"],
  temperature:  ["Instrument Type","Range Min","Range Max","Range Unit"],
  flow:         ["Instrument Type","Line Size","Liner Material","End Connection","Output Signal"],
  level:        ["Instrument Type","Output Signal","Range Min","Range Max"],
  isolation:    ["Valve Type","Size (NB)","Pressure Rating","End Connection","Body Material"],
  control:      ["Valve Type","Size (NB)","Pressure Rating","Actuation Type","Fail Action","End Connection"],
  safety:       ["Valve Type","Size (NB)","Set Pressure","End Connection","Body Material"],
  on_off:       ["Valve Type","Size (NB)","End Connection","Body Material"],
  panels:       ["Panel Type","Voltage","IP Rating","Enclosure Type"],
  cabling:      ["Cable Type","No. of Cores","Insulation Type","Armour Type","Voltage Grade"],
  junction_box: ["JB Type","IP Rating","No. of Terminals","Terminal Type"],
  cooling_tower:["Type","Circulation Rate","Casing Material","Fan Type"],
  motor:        ["Motor Type","Power (kW)","Voltage","IP Rating","Efficiency Class","Mounting","Cooling Type"],
  pump_skid:    ["Package Type","Pump Type","Flow Rate / Flow (m³/hr)","Head / Pressure","Fluid / Process Fluid"],
};

function computeDatasheetCompleteness(
  sections: DatasheetSection[],
  subgroupCode: string,
  isMotor: boolean,
): DatasheetCompleteness {
  const allFields = sections.flatMap((s) => s.fields);
  const filled    = allFields.filter((f) => f.value !== "—").length;
  const total     = allFields.length;
  const score     = total === 0 ? 0 : Math.round((filled / total) * 100);
  const key       = isMotor ? "motor" : subgroupCode;
  const critical  = DS_CRITICAL_FIELDS[key] ?? [];
  const fieldMap  = new Map(allFields.map((f) => [f.label, f.value]));
  const criticalMissing = critical.filter((l) => !fieldMap.has(l) || fieldMap.get(l) === "—");
  return { score, filled, total, criticalMissing };
}

// ── Datasheet Preview Dialog ──────────────────────────────────────────────────
function DatasheetPreviewDialog({
  line, open, onClose,
}: {
  line: PackageLine | null;
  open: boolean;
  onClose: () => void;
}) {
  const [pdfLoading, setPdfLoading] = useState(false);

  if (!line) return null;
  const isMotorCode  = line.buy_subgroup_code === "non_flameproof" || line.buy_subgroup_code === "flameproof";
  const attrs        = line.technical_attributes ?? {};
  const sections     = buildDatasheetSections(line.buy_subgroup_code, line.buy_group_code, attrs, isMotorCode);
  const completeness = computeDatasheetCompleteness(sections, line.buy_subgroup_code, isMotorCode);

  const scoreColor = completeness.score >= 80 ? "text-green-600" : completeness.score >= 50 ? "text-amber-600" : "text-red-600";
  const barColor   = completeness.score >= 80 ? "bg-green-500"  : completeness.score >= 50 ? "bg-amber-500"  : "bg-red-500";

  async function handleDownloadPDF() {
    setPdfLoading(true);
    try {
      const blob = await pdf(
        <DatasheetPDFDocument line={line} sections={sections} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = line.generic_requirement.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 50);
      a.download = `Datasheet_${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Screen-only header */}
        <DialogHeader className="ds-no-print">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Datasheet Preview
          </DialogTitle>
          <DialogDescription className="text-xs">
            {line.buy_group_label} → {line.buy_subgroup_label}
          </DialogDescription>
        </DialogHeader>

        {/* ── Printable content root ── */}
        <div className="ds-print">

          {/* Print-only header — hidden on screen via CSS */}
          <div className="ds-print-header">
            <div>
              <p style={{ fontSize: "15px", fontWeight: 700, color: "#1e3a5f", marginBottom: "2px" }}>
                THERMOPAC — ITEM DATASHEET
              </p>
              <p style={{ fontSize: "10px", color: "#555" }}>
                {line.buy_group_label} / {line.buy_subgroup_label}
              </p>
            </div>
            <div style={{ textAlign: "right", fontSize: "10px", color: "#555" }}>
              <p style={{ fontWeight: 600 }}>BUY Package Catalog</p>
              <p style={{ marginTop: "2px" }}>Qty: {line.default_quantity} {line.uom_code}</p>
            </div>
          </div>

          {/* Generic requirement block */}
          <div className="rounded-md bg-muted/50 border px-3 py-2 mb-3">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
              Generic Requirement
            </p>
            <p className="text-sm font-semibold">{line.generic_requirement}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Qty: {line.default_quantity} {line.uom_code}
            </p>
          </div>

          {/* Completeness indicator — screen only */}
          <div className="ds-no-print mb-3 rounded-md border px-3 py-2 bg-muted/20">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Datasheet Completeness
              </span>
              <span className={`text-sm font-bold tabular-nums ${scoreColor}`}>
                {completeness.score}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${completeness.score}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {completeness.filled} of {completeness.total} fields filled
            </p>
            {completeness.criticalMissing.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-2 py-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-red-700 dark:text-red-400">
                    Critical fields missing:
                  </p>
                  <p className="text-[10px] text-red-600 dark:text-red-500 mt-0.5 leading-relaxed">
                    {completeness.criticalMissing.join(" · ")}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Sections */}
          <div className="space-y-4">
            {sections.map((sec) => (
              <div key={sec.title}>
                <p className="ds-section-title text-[11px] font-semibold text-primary uppercase tracking-wide border-b pb-1 mb-2">
                  {sec.title}
                </p>
                <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
                  {sec.fields.map((f) => (
                    <div key={f.label} className="flex gap-2 text-xs py-0.5">
                      <span className="text-muted-foreground min-w-[148px] shrink-0">{f.label}</span>
                      <span className={
                        f.value === "—"
                          ? "ds-field-missing text-muted-foreground/40 italic"
                          : f.highlight
                            ? "font-semibold text-foreground"
                            : "text-foreground"
                      }>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Print-only footer — hidden on screen via CSS */}
          <div className="ds-print-footer">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>THERMOPAC ENGINEERING PVT LTD — BUY Package Catalog</span>
              <span>Page <span className="ds-page-num" /></span>
            </div>
          </div>

        </div>{/* end ds-print */}

        {/* Screen-only footer */}
        <DialogFooter className="gap-2 ds-no-print">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
          >
            {pdfLoading
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            }
            {pdfLoading ? "Generating…" : "Download PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
          </Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

// ── Process & Design Conditions Block (for valve modes) ───────────────────────
const PROC_FLUID_OPTS    = ["Water","Steam","Air","Compressed Air","Nitrogen","Oil","Gas","LPG","Acid","Alkali","Chemical","Slurry","Other"];
const PRESSURE_UNIT_OPTS = ["bar","barg","psi","kg/cm²","kPa","MPa"];
const TEMP_UNIT_OPTS     = ["°C","°F","K"];

function ProcessDesignConditionsBlock({
  attrs, onChange,
}: {
  attrs: Record<string, unknown>;
  onChange: (a: Record<string, unknown>) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...attrs, [k]: v });
  const val = (k: string) => (attrs[k] as string) ?? "";

  const numRow = (label: string, numKey: string, unitKey: string, unitOpts: string[], defaultUnit: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1">
        <Input className="h-8 text-sm" type="number" step="any"
          value={val(numKey)} onChange={(e) => set(numKey, e.target.value)} />
        <Select value={val(unitKey) || defaultUnit} onValueChange={(v) => set(unitKey, v)}>
          <SelectTrigger className="h-8 w-20 text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {unitOpts.map((u) => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 rounded-md border border-blue-200 dark:border-blue-800 p-3 bg-blue-50/40 dark:bg-blue-950/10">
      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
        Process &amp; Design Conditions
        <span className="text-[10px] font-normal normal-case text-blue-500 ml-2">required for datasheet</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Process Fluid</Label>
          <SearchableSelect options={PROC_FLUID_OPTS} value={val("process_fluid")}
            onSelect={(v) => set("process_fluid", v === "__other__" ? "" : v)}
            placeholder="Select fluid…" />
        </div>
        <div />
        {numRow("Operating Pressure", "operating_pressure", "operating_pressure_unit", PRESSURE_UNIT_OPTS, "barg")}
        {numRow("Operating Temperature", "operating_temperature", "operating_temperature_unit", TEMP_UNIT_OPTS, "°C")}
        {numRow("Design Pressure", "design_pressure", "design_pressure_unit", PRESSURE_UNIT_OPTS, "barg")}
        {numRow("Design Temperature", "design_temperature", "design_temperature_unit", TEMP_UNIT_OPTS, "°C")}
      </div>
    </div>
  );
}

// ── Pressure Instrument requirement builder ───────────────────────────────────
function buildPressureRequirement(attrs: Record<string, unknown>): string {
  const instrType   = (attrs.instrument_type    as string)?.trim() || "";
  const rangeMin    = (attrs.range_min          as string)?.trim() || "";
  const rangeMax    = (attrs.range_max          as string)?.trim() || "";
  const rangeUnit   = (attrs.range_unit         as string)?.trim() || "";
  const outputSig   = (attrs.output_signal      as string)?.trim() || "";
  const wettedMat   = (attrs.wetted_material    as string)?.trim() || "";
  const connSize    = (attrs.connection_size    as string)?.trim() || "";
  const connType    = (attrs.connection_type    as string)?.trim() || "";
  const areaClass   = (attrs.area_classification as string)?.trim() || "";
  const exProt      = (attrs.explosion_protection as string)?.trim() || "";

  const rangeStr  = rangeMin && rangeMax && rangeUnit
    ? `${rangeMin}–${rangeMax} ${rangeUnit}`
    : rangeMax && rangeUnit ? `0–${rangeMax} ${rangeUnit}` : "";
  const connStr   = connSize && connType ? `${connSize} ${connType}` : connSize || connType;
  const exStr     = exProt && exProt !== "Non-Flameproof" ? exProt.replace("Flameproof ", "").replace("Intrinsically Safe ", "") : "";

  const parts: string[] = [];
  if (instrType)  parts.push(instrType);
  if (rangeStr)   parts.push(rangeStr);
  if (outputSig && outputSig !== "Not Applicable") parts.push(outputSig);
  if (wettedMat)  parts.push(wettedMat);
  if (connStr)    parts.push(connStr);
  if (areaClass && areaClass !== "Safe Area") parts.push(areaClass);
  if (exStr)      parts.push(exStr);
  return parts.join(", ");
}

// ── Pressure Instrument option lists ─────────────────────────────────────────
const PRESSURE_OPTS: Record<string, string[]> = {
  instrument_type:       ["Pressure Gauge (PG)", "Pressure Transmitter (PT)", "Differential Pressure Transmitter (DPT)", "Pressure Switch (PS)", "Vacuum Gauge"],
  measurement_type:      ["Gauge Pressure", "Absolute Pressure", "Differential Pressure", "Vacuum"],
  range_unit:            ["bar", "kg/cm²", "psi", "kPa", "mmWC"],
  process_fluid:         ["Air", "Water", "Steam", "Oil", "Gas", "Chemical"],
  operating_temp:        ["Ambient", "50°C", "100°C", "150°C", "250°C"],
  connection_size:       ['1/4"', '1/2"', '3/4"', '1"'],
  connection_type:       ["NPT", "BSP", "Flanged"],
  wetted_material:       ["SS316", "SS304", "Brass"],
  enclosure_type:        ["IP65", "IP66", "Flameproof", "Weatherproof"],
  area_classification:   ["Safe Area", "Zone 1", "Zone 2"],
  explosion_protection:  ["Non-Flameproof", "Flameproof Ex d", "Intrinsically Safe Ex ia", "Intrinsically Safe Ex ib", "Increased Safety Ex e"],
  certification:         ["ATEX", "IECEx", "PESO", "UL", "FM"],
  gas_group:             ["IIA", "IIB", "IIC"],
  temperature_class:     ["T1", "T2", "T3", "T4", "T5", "T6"],
};

// Output signal options depend on instrument_type
function pressureOutputOpts(instrType: string): string[] | null {
  if (!instrType) return null;
  const t = instrType.toLowerCase();
  if (t.includes("gauge") || t.includes("vacuum gauge")) return null; // N/A for gauges
  if (t.includes("transmitter")) return ["4–20 mA", "HART"];
  if (t.includes("switch")) return ["NO/NC Contact"];
  return null;
}

// ── Pressure Instrument structured form ──────────────────────────────────────
function PressureAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const singleKeys = Object.keys(PRESSURE_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = PRESSURE_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      // Clear dependent fields when instrument_type changes
      if (key === "instrument_type") {
        onChange({ ...attrs, instrument_type: val, output_signal: "" });
      } else {
        set(key, val);
      }
    }
  }

  function renderField(key: string, label: string, required?: boolean, overrideOpts?: string[]) {
    const opts      = overrideOpts ?? PRESSURE_OPTS[key] ?? [];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function renderNumeric(key: string, label: string) {
    const curVal = (attrs[key] as string) ?? "";
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <Input className="h-8 text-sm" type="number" placeholder="0"
          value={curVal} onChange={(e) => set(key, e.target.value)} />
      </div>
    );
  }

  function sectionHeader(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  const instrType   = (attrs.instrument_type as string) ?? "";
  const areaClass   = (attrs.area_classification as string) ?? "";
  const outputOpts  = pressureOutputOpts(instrType);
  const isGaugeType = instrType.toLowerCase().includes("gauge");
  const isZone      = areaClass === "Zone 1" || areaClass === "Zone 2";

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pressure Instrument Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sectionHeader("Instrument Type")}
        <div className="col-span-2">
          {renderField("instrument_type", "Instrument Type", true)}
        </div>

        {sectionHeader("Measurement")}
        {renderField("measurement_type", "Measurement Type")}
        {renderField("range_unit",       "Range Unit")}
        {renderNumeric("range_min",      "Range Min")}
        {renderNumeric("range_max",      "Range Max")}

        {sectionHeader("Process Conditions")}
        {renderField("process_fluid",   "Process Fluid")}
        {renderField("operating_temp",  "Operating Temperature")}

        {sectionHeader("Connection Details")}
        {renderField("connection_size", "Connection Size")}
        {renderField("connection_type", "Connection Type")}

        {sectionHeader("Signal / Output")}
        {isGaugeType ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Output Signal</Label>
            <div className="h-8 px-3 flex items-center text-sm bg-muted rounded-md border text-muted-foreground">Not Applicable</div>
          </div>
        ) : outputOpts ? (
          renderField("output_signal", "Output Signal", false, [...outputOpts, "Other"])
        ) : (
          renderField("output_signal", "Output Signal")
        )}
        <div /> {/* spacer */}

        {sectionHeader("Construction")}
        {renderField("wetted_material", "Wetted Parts Material")}
        {renderField("enclosure_type",  "Enclosure Type")}

        {sectionHeader("Hazardous Area / Certification")}
        {renderField("area_classification",   "Area Classification")}
        {renderField("explosion_protection",  "Explosion Protection")}
        <div className="space-y-1.5">
          <Label className="text-xs">
            Certification
            {isZone && <span className="text-red-500"> *</span>}
            {!isZone && <span className="text-[10px] font-normal text-muted-foreground ml-1">(optional for Safe Area)</span>}
          </Label>
          {(() => {
            const key     = "certification";
            const opts    = PRESSURE_OPTS[key];
            const curVal  = (attrs[key] as string) ?? "";
            const isCustom= custom[key] ?? false;
            const selVal  = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
            return (
              <>
                <SearchableSelect value={selVal} options={opts} placeholder="Select…"
                  onSelect={(v) => handleSelect(key, v)} />
                {isCustom && (
                  <Input className="h-8 text-sm" placeholder="Enter custom value…"
                    value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
                )}
              </>
            );
          })()}
        </div>
        {renderField("gas_group",          "Gas Group")}
        {renderField("temperature_class",  "Temperature Class")}

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Temperature Instrument requirement builder ────────────────────────────────
function buildTemperatureRequirement(attrs: Record<string, unknown>): string {
  const instrType   = (attrs.instrument_type   as string)?.trim() || "";
  const sensorType  = (attrs.sensor_type       as string)?.trim() || "";
  const rangeMin    = (attrs.range_min         as string)?.trim() || "";
  const rangeMax    = (attrs.range_max         as string)?.trim() || "";
  const rangeUnit   = (attrs.range_unit        as string)?.trim() || "°C";
  const material    = (attrs.wetted_material   as string)?.trim() || "";
  const connSize    = (attrs.connection_size   as string)?.trim() || "";
  const connType    = (attrs.connection_type   as string)?.trim() || "";
  const areaClass   = (attrs.area_classification as string)?.trim() || "";
  const expProt     = (attrs.explosion_protection as string)?.trim() || "";

  const rangeStr    = rangeMin || rangeMax ? `${rangeMin}–${rangeMax} ${rangeUnit}`.trim() : "";
  const connStr     = [connSize, connType].filter(Boolean).join(" ");
  const parts: string[] = [];
  if (instrType)  parts.push(instrType);
  if (sensorType) parts.push(sensorType);
  if (rangeStr)   parts.push(rangeStr);
  if (material)   parts.push(material);
  if (connStr)    parts.push(connStr);
  if (areaClass && areaClass !== "Safe Area") parts.push(areaClass);
  if (expProt)    parts.push(expProt);
  return parts.join(", ");
}

const TEMPERATURE_OPTS: Record<string, string[]> = {
  instrument_type:      ["Thermocouple (TC)", "RTD", "Temperature Transmitter (TT)", "Temperature Switch (TS)", "Bimetal Thermometer"],
  sensor_type:          ["PT100", "PT1000", "Type K", "Type J", "Type E", "Type T"],
  range_unit:           ["°C", "°F", "K"],
  wetted_material:      ["SS304", "SS316", "Inconel 600", "Carbon Steel"],
  connection_size:      ["1/4\"", "1/2\"", "3/4\"", "1\""],
  connection_type:      ["NPT", "BSP", "Flanged"],
  output_signal:        ["4–20 mA", "HART", "Resistance (RTD)", "mV (TC)", "SPDT Contact", "Local Display"],
  enclosure:            ["IP65", "IP66", "Flameproof", "Weatherproof"],
  area_classification:  ["Safe Area", "Zone 1", "Zone 2"],
  explosion_protection: ["Ex d (Flameproof)", "Ex ia (Intrinsically Safe)", "Ex ib (Intrinsically Safe)", "Non-Flameproof"],
  certification:        ["ATEX", "IECEx", "PESO"],
  gas_group:            ["IIA", "IIB", "IIC"],
  temperature_class:    ["T1", "T2", "T3", "T4", "T5", "T6"],
};

function TemperatureAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const singleKeys = Object.keys(TEMPERATURE_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val = (attrs[key] as string) ?? "";
      const opts = TEMPERATURE_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = TEMPERATURE_OPTS[key] ?? [];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function sec(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  const areaClass = (attrs.area_classification as string) ?? "";
  const instrType = (attrs.instrument_type as string) ?? "";
  const showSensor = instrType.startsWith("Thermocouple") || instrType.startsWith("RTD");

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Temperature Instrument Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Instrument Type")}
        <div className="col-span-2">{renderField("instrument_type", "Instrument Type", true)}</div>

        {showSensor && <>{sec("Sensor")}{renderField("sensor_type", "Sensor Type")}<div /></>}

        {sec("Measuring Range")}
        <div className="space-y-1.5">
          <Label className="text-xs">Range Min</Label>
          <Input className="h-8 text-sm" placeholder="e.g. -50" value={(attrs.range_min as string) ?? ""}
            onChange={(e) => set("range_min", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Range Max</Label>
          <Input className="h-8 text-sm" placeholder="e.g. 200" value={(attrs.range_max as string) ?? ""}
            onChange={(e) => set("range_max", e.target.value)} />
        </div>
        <div className="col-span-2">{renderField("range_unit", "Range Unit")}</div>

        {sec("Material & Connection")}
        {renderField("wetted_material", "Wetted Parts Material")}
        {renderField("connection_size",  "Connection Size")}
        {renderField("connection_type",  "Connection Type")}
        {renderField("output_signal",    "Output Signal")}

        {sec("Enclosure")}
        {renderField("enclosure", "Enclosure Type")}
        <div />

        {sec("Hazardous Area (Optional)")}
        {renderField("area_classification",  "Area Classification")}
        {renderField("explosion_protection", "Explosion Protection")}
        {(areaClass === "Zone 1" || areaClass === "Zone 2") && (
          <>
            {renderField("certification",    "Certification")}
            {renderField("gas_group",        "Gas Group")}
            {renderField("temperature_class","Temperature Class")}
            <div />
          </>
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

// ── Flow Instrument requirement builder ───────────────────────────────────────
function buildFlowRequirement(attrs: Record<string, unknown>): string {
  const instrType  = (attrs.instrument_type  as string)?.trim() || "";
  const lineSize   = (attrs.line_size        as string)?.trim() || "";
  const signal     = (attrs.output_signal    as string)?.trim() || "";
  const material   = (attrs.liner_material   as string)?.trim() || "";
  const endConn    = (attrs.end_connection   as string)?.trim() || "";
  const areaClass  = (attrs.area_classification as string)?.trim() || "";
  const expProt    = (attrs.explosion_protection as string)?.trim() || "";

  const matStr = material ? `${material} Liner` : "";
  const parts: string[] = [];
  if (instrType) parts.push(instrType);
  if (lineSize)  parts.push(lineSize);
  if (signal)    parts.push(signal);
  if (matStr)    parts.push(matStr);
  if (endConn)   parts.push(endConn);
  if (areaClass && areaClass !== "Safe Area") parts.push(areaClass);
  if (expProt)   parts.push(expProt);
  return parts.join(", ");
}

const FLOW_OPTS: Record<string, string[]> = {
  instrument_type:      ["Electromagnetic Flowmeter", "Vortex Flowmeter", "Turbine Flowmeter", "Orifice / DP Flowmeter", "Ultrasonic Flowmeter", "Coriolis Flowmeter", "Rotameter"],
  line_size:            ["15 NB", "25 NB", "40 NB", "50 NB", "80 NB", "100 NB", "150 NB", "200 NB", "250 NB", "300 NB"],
  process_fluid:        ["Water", "Oil", "Chemical", "Steam", "Gas", "Slurry", "Acid", "Alkali"],
  output_signal:        ["4–20 mA", "HART", "4–20 mA / HART", "Pulse", "RS485", "Modbus RTU"],
  liner_material:       ["PTFE", "Hard Rubber", "PFA", "SS316", "Carbon Steel", "PP"],
  end_connection:       ["Flanged", "Wafer", "Clamp", "Inline"],
  pressure_rating:      ["PN10", "PN16", "PN25", "PN40", "Class 150", "Class 300"],
  area_classification:  ["Safe Area", "Zone 1", "Zone 2"],
  explosion_protection: ["Ex d (Flameproof)", "Ex ia (Intrinsically Safe)", "Ex ib (Intrinsically Safe)", "Non-Flameproof"],
  certification:        ["ATEX", "IECEx", "PESO"],
  gas_group:            ["IIA", "IIB", "IIC"],
  temperature_class:    ["T1", "T2", "T3", "T4", "T5", "T6"],
};

function FlowAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const singleKeys = Object.keys(FLOW_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val = (attrs[key] as string) ?? "";
      const opts = FLOW_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = FLOW_OPTS[key] ?? [];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function sec(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  const areaClass = (attrs.area_classification as string) ?? "";

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Flow Instrument Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Instrument Type")}
        <div className="col-span-2">{renderField("instrument_type", "Instrument Type", true)}</div>

        {sec("Line & Process")}
        {renderField("line_size",    "Line Size (NB)", true)}
        {renderField("process_fluid","Process Fluid")}

        {sec("Signal & Material")}
        {renderField("output_signal",   "Output Signal")}
        {renderField("liner_material",  "Liner / Body Material")}

        {sec("Connection")}
        {renderField("end_connection",  "End Connection")}
        {renderField("pressure_rating", "Pressure Rating")}

        {sec("Hazardous Area (Optional)")}
        {renderField("area_classification",  "Area Classification")}
        {renderField("explosion_protection", "Explosion Protection")}
        {(areaClass === "Zone 1" || areaClass === "Zone 2") && (
          <>
            {renderField("certification",    "Certification")}
            {renderField("gas_group",        "Gas Group")}
            {renderField("temperature_class","Temperature Class")}
            <div />
          </>
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

// ── Level Instrument requirement builder ──────────────────────────────────────
function buildLevelRequirement(attrs: Record<string, unknown>): string {
  const instrType  = (attrs.instrument_type  as string)?.trim() || "";
  const rangeMin   = (attrs.range_min        as string)?.trim() || "";
  const rangeMax   = (attrs.range_max        as string)?.trim() || "";
  const rangeUnit  = (attrs.range_unit       as string)?.trim() || "m";
  const signal     = (attrs.output_signal    as string)?.trim() || "";
  const material   = (attrs.wetted_material  as string)?.trim() || "";
  const areaClass  = (attrs.area_classification as string)?.trim() || "";
  const expProt    = (attrs.explosion_protection as string)?.trim() || "";

  const rangeStr = rangeMin || rangeMax ? `${rangeMin}–${rangeMax} ${rangeUnit}`.trim() : "";
  const parts: string[] = [];
  if (instrType) parts.push(instrType);
  if (rangeStr)  parts.push(rangeStr);
  if (signal)    parts.push(signal);
  if (material)  parts.push(material);
  if (areaClass && areaClass !== "Safe Area") parts.push(areaClass);
  if (expProt)   parts.push(expProt);
  return parts.join(", ");
}

const LEVEL_OPTS: Record<string, string[]> = {
  instrument_type:      ["Radar Level Transmitter (LT)", "Guided Wave Radar (GWR)", "DP Level Transmitter", "Ultrasonic Level Transmitter", "Float Level Switch (LS)", "Displacer Level Transmitter", "Level Gauge (Glass)", "Magnetostrictive Level Transmitter"],
  range_unit:           ["m", "mm", "ft", "%"],
  output_signal:        ["4–20 mA", "HART", "4–20 mA / HART", "SPDT Contact", "Modbus RTU"],
  connection_size:      ["1/2\"", "3/4\"", "1\"", "1.5\"", "2\"", "3\"", "4\""],
  connection_type:      ["Flanged", "Threaded (NPT)", "Threaded (BSP)"],
  wetted_material:      ["SS316", "SS304", "CS", "PP", "PVC", "PTFE", "Hastelloy C"],
  enclosure:            ["IP65", "IP66", "Flameproof", "Weatherproof"],
  area_classification:  ["Safe Area", "Zone 1", "Zone 2"],
  explosion_protection: ["Ex d (Flameproof)", "Ex ia (Intrinsically Safe)", "Ex ib (Intrinsically Safe)", "Non-Flameproof"],
  certification:        ["ATEX", "IECEx", "PESO"],
  gas_group:            ["IIA", "IIB", "IIC"],
  temperature_class:    ["T1", "T2", "T3", "T4", "T5", "T6"],
};

function LevelAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const singleKeys = Object.keys(LEVEL_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val = (attrs[key] as string) ?? "";
      const opts = LEVEL_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = LEVEL_OPTS[key] ?? [];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function sec(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  const areaClass = (attrs.area_classification as string) ?? "";

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Level Instrument Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Instrument Type")}
        <div className="col-span-2">{renderField("instrument_type", "Instrument Type", true)}</div>

        {sec("Measuring Range")}
        <div className="space-y-1.5">
          <Label className="text-xs">Range Min</Label>
          <Input className="h-8 text-sm" placeholder="e.g. 0" value={(attrs.range_min as string) ?? ""}
            onChange={(e) => set("range_min", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Range Max</Label>
          <Input className="h-8 text-sm" placeholder="e.g. 5" value={(attrs.range_max as string) ?? ""}
            onChange={(e) => set("range_max", e.target.value)} />
        </div>
        <div className="col-span-2">{renderField("range_unit", "Range Unit")}</div>

        {sec("Output Signal")}
        {renderField("output_signal", "Output Signal")}
        <div />

        {sec("Process Connection")}
        {renderField("connection_size", "Connection Size")}
        {renderField("connection_type", "Connection Type")}

        {sec("Material & Enclosure")}
        {renderField("wetted_material", "Wetted Parts Material")}
        {renderField("enclosure",       "Enclosure Type")}

        {sec("Hazardous Area (Optional)")}
        {renderField("area_classification",  "Area Classification")}
        {renderField("explosion_protection", "Explosion Protection")}
        {(areaClass === "Zone 1" || areaClass === "Zone 2") && (
          <>
            {renderField("certification",    "Certification")}
            {renderField("gas_group",        "Gas Group")}
            {renderField("temperature_class","Temperature Class")}
            <div />
          </>
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

// ── Electrical Panel requirement builder ─────────────────────────────────────
function buildPanelRequirement(attrs: Record<string, unknown>): string {
  const panelType   = (attrs.panel_type          as string)?.trim() || "";
  const voltage     = (attrs.voltage             as string)?.trim() || "";
  const frequency   = (attrs.frequency           as string)?.trim() || "";
  const enclosure   = (attrs.enclosure_type      as string)?.trim() || "";
  const ipRating    = (attrs.ip_rating           as string)?.trim() || "";
  const feederLoad  = (attrs.feeder_load         as string)?.trim() || "";
  const incomerType = (attrs.incomer_type        as string)?.trim() || "";
  const incomerRating = (attrs.incomer_rating    as string)?.trim() || "";
  const ctrlSupply  = (attrs.control_supply      as string)?.trim() || "";
  const protocol    = (attrs.communication_protocol as string)?.trim() || "";
  const cert        = (attrs.certification       as string)?.trim() || "";

  const encStr      = [enclosure, ipRating].filter(Boolean).join(" ");
  const feederStr   = feederLoad ? `${feederLoad} kW` : "";
  const incomerStr  = [incomerType, incomerRating].filter(Boolean).join(" ");
  const certStr     = cert ? `${cert} Certified` : "";

  const parts: string[] = [];
  if (panelType) parts.push(panelType);
  if (voltage)   parts.push(voltage);
  parts.push("3 Phase");
  if (frequency) parts.push(frequency);
  if (encStr)    parts.push(encStr);
  if (feederStr) parts.push(feederStr);
  if (incomerStr) parts.push(incomerStr);
  if (ctrlSupply) parts.push(ctrlSupply);
  if (protocol)  parts.push(protocol);
  if (certStr)   parts.push(certStr);
  return parts.join(", ");
}

const PANEL_OPTS: Record<string, string[]> = {
  panel_type:             ["PCC (Power Control Center)", "MCC (Motor Control Center)", "PLC Panel", "VFD Panel", "Control Panel", "Instrument Panel", "Junction Box Panel"],
  voltage:                ["380 V", "400 V", "415 V", "690 V"],
  frequency:              ["50 Hz", "60 Hz"],
  enclosure_type:         ["Indoor", "Outdoor", "Weatherproof", "Flameproof"],
  mounting:               ["Floor Mounted", "Wall Mounted", "Free Standing"],
  ip_rating:              ["IP42", "IP54", "IP55", "IP65", "IP66"],
  enclosure_material:     ["MS Powder Coated", "SS304", "SS316", "Aluminum"],
  area_classification:    ["Safe Area", "Zone 1", "Zone 2"],
  certification:          ["CE", "UL", "IEC", "IECEx", "ATEX", "PESO"],
  incomer_type:           ["MCCB", "ACB", "Isolator", "MCB"],
  incomer_rating:         ["32A", "63A", "100A", "160A", "250A", "400A", "630A", "800A"],
  busbar_type:            ["Aluminum", "Copper"],
  communication_protocol: ["Modbus RTU", "Modbus TCP", "Profibus", "Profinet", "Ethernet/IP"],
  control_supply:         ["24 V DC", "110 V AC", "230 V AC"],
  cable_entry:            ["Bottom", "Top", "Both"],
};

const PANEL_MAKES = ["Siemens", "ABB", "Schneider Electric", "L&T", "Eaton", "GE", "Allen-Bradley", "Fuji", "Legrand", "Havells"];

function PanelAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const singleKeys = Object.keys(PANEL_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = PANEL_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  const selectedMakes: string[] = (() => {
    const raw = (attrs.approved_makes as string) ?? "";
    return raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : [];
  })();

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function toggleMake(make: string) {
    const current = selectedMakes.includes(make)
      ? selectedMakes.filter(m => m !== make)
      : [...selectedMakes, make];
    set("approved_makes", current.join(", "));
  }

  function renderField(key: string, label: string, required?: boolean) {
    const opts      = PANEL_OPTS[key] ?? [];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal}
            onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function renderNumeric(key: string, label: string, placeholder?: string) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <Input className="h-8 text-sm" type="number" min="0" placeholder={placeholder ?? "0"}
          value={(attrs[key] as string) ?? ""}
          onChange={(e) => set(key, e.target.value)} />
      </div>
    );
  }

  function sec(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  const panelType     = (attrs.panel_type as string) ?? "";
  const enclosureType = (attrs.enclosure_type as string) ?? "";
  const areaClass     = (attrs.area_classification as string) ?? "";

  const isPLCPanel    = panelType === "PLC Panel" || panelType === "Control Panel" || panelType === "Instrument Panel";
  const isFeederPanel = panelType === "PCC (Power Control Center)" || panelType === "MCC (Motor Control Center)" || panelType === "VFD Panel";

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Electrical Panel Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Panel Type")}
        <div className="col-span-2">{renderField("panel_type", "Panel Type", true)}</div>

        {sec("Electrical Specifications")}
        {renderField("voltage", "Voltage", true)}
        {renderField("frequency", "Frequency")}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Phase</Label>
          <Input readOnly className="h-8 text-sm bg-muted/50 text-muted-foreground cursor-default" value="Three Phase" />
        </div>

        {sec("Enclosure")}
        {renderField("enclosure_type",     "Enclosure Type")}
        {renderField("mounting",           "Mounting")}
        {renderField("ip_rating",          enclosureType === "Outdoor" ? "IP Rating *" : "IP Rating")}
        {renderField("enclosure_material", "Enclosure Material")}

        {sec("Area Classification")}
        {renderField("area_classification", enclosureType === "Flameproof" ? "Area Classification *" : "Area Classification")}
        {renderField("certification", "Certification")}

        {isFeederPanel && (
          <>
            {sec("Feeder / Power Details")}
            {renderNumeric("feeder_load",     "Feeder Load (kW)", "e.g. 250")}
            {renderNumeric("number_of_feeders","Number of Feeders", "e.g. 8")}
            {renderField("incomer_type",   "Incomer Type")}
            {renderField("incomer_rating", "Incomer Rating (A)")}
            {renderField("busbar_type",    "Busbar Type")}
            <div />
          </>
        )}

        {isPLCPanel && (
          <>
            {sec("Control / PLC I/O Details")}
            {renderNumeric("di_count", "DI Count", "0")}
            {renderNumeric("do_count", "DO Count", "0")}
            {renderNumeric("ai_count", "AI Count", "0")}
            {renderNumeric("ao_count", "AO Count", "0")}
            {renderField("communication_protocol", "Communication Protocol")}
            {renderField("control_supply",         "Control Supply")}
          </>
        )}

        {!isPLCPanel && (
          <>
            {sec("Control")}
            {renderField("control_supply", "Control Supply")}
            <div />
          </>
        )}

        {sec("Panel Configuration")}
        {renderField("cable_entry", "Cable Entry")}
        <div />

        {sec("Vendor / Approved Makes")}
        <div className="col-span-2 space-y-2">
          <Label className="text-xs">Approved Makes</Label>
          <div className="flex flex-wrap gap-2">
            {PANEL_MAKES.map(make => (
              <button key={make} type="button"
                onClick={() => toggleMake(make)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selectedMakes.includes(make)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary"
                }`}>
                {make}
              </button>
            ))}
          </div>
          {selectedMakes.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Selected: {selectedMakes.join(", ")}</p>
          )}
          <Input className="h-8 text-sm" placeholder="Other makes (comma-separated)…"
            value={(attrs.approved_makes_other as string) ?? ""}
            onChange={(e) => set("approved_makes_other", e.target.value)} />
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Cabling requirement builder ───────────────────────────────────────────────
function buildCablingRequirement(attrs: Record<string, unknown>): string {
  const cableType    = (attrs.cable_type        as string)?.trim() || "";
  const numCores     = (attrs.num_cores         as string)?.trim() || "";
  const cableSize    = (attrs.cable_size        as string)?.trim() || "";
  const insulation   = (attrs.insulation_type   as string)?.trim() || "";
  const armour       = (attrs.armour_type       as string)?.trim() || "";
  const voltageGrade = (attrs.voltage_grade     as string)?.trim() || "";
  const layingType   = (attrs.laying_type       as string)?.trim() || "";
  const conductor    = (attrs.conductor_material as string)?.trim() || "";

  const coreStr      = numCores && cableSize ? `${numCores}C x ${cableSize} sq.mm` : cableSize ? `${cableSize} sq.mm` : "";
  const armourAbbr   = armour.startsWith("Unarmoured") ? "Unarmoured" : armour.includes("Armoured") ? "Armoured" : armour;
  const insulStr     = [insulation, armourAbbr].filter(Boolean).join(" ");

  const parts: string[] = [];
  if (cableType)    parts.push(cableType);
  if (coreStr)      parts.push(coreStr);
  if (insulStr)     parts.push(insulStr);
  if (voltageGrade) parts.push(voltageGrade);
  if (layingType)   parts.push(layingType);
  if (conductor)    parts.push(conductor);
  return parts.join(", ");
}

const CABLING_OPTS: Record<string, string[]> = {
  cable_type:         ["Power Cable", "Control Cable", "Instrument Cable", "Communication Cable", "Earthing Cable"],
  conductor_material: ["Copper", "Aluminum"],
  core_type:          ["Single Core", "Multi Core"],
  cable_size:         ["1.5", "2.5", "4", "6", "10", "16", "25", "35", "50", "70", "95", "120", "150", "185", "240"],
  num_cores:          ["1", "2", "3", "3.5", "4", "5", "7", "10", "12", "24"],
  voltage_grade:      ["1.1 kV", "3.3 kV", "6.6 kV", "11 kV"],
  insulation_type:    ["PVC", "XLPE", "EPR"],
  sheath_type:        ["PVC", "FRLS", "FRLSZH", "PE"],
  armour_type:        ["Unarmoured", "Armoured (Steel Wire)", "Armoured (Aluminum Wire)"],
  laying_type:        ["Underground", "Cable Tray", "Conduit", "Direct Buried"],
  application:        ["Motor Power", "Panel Interconnection", "Instrument Signal", "Communication", "Earthing"],
  area_classification:["Safe Area", "Zone 1", "Zone 2"],
  cable_certification:["CE", "IEC", "ATEX", "IECEx", "Flame Retardant", "Fire Resistant"],
};

const CABLE_MAKES = ["Polycab", "Havells", "Finolex", "KEI", "Nexans", "Prysmian", "RR Kabel", "Gloster", "Birla Cables"];

function CablingAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const singleKeys = Object.keys(CABLING_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = CABLING_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  const selectedMakes: string[] = (() => {
    const raw = (attrs.approved_makes as string) ?? "";
    return raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : [];
  })();

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function toggleMake(make: string) {
    const updated = selectedMakes.includes(make)
      ? selectedMakes.filter(m => m !== make)
      : [...selectedMakes, make];
    set("approved_makes", updated.join(", "));
  }

  function renderField(key: string, label: string, required?: boolean) {
    const opts      = CABLING_OPTS[key] ?? [];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal}
            onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function sec(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cable Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Cable Type")}
        {renderField("cable_type",         "Cable Type",          true)}
        {renderField("conductor_material", "Conductor Material")}
        {renderField("core_type",          "Core Type")}
        <div />

        {sec("Size / Rating")}
        {renderField("cable_size",    "Cable Size (sq.mm)", true)}
        {renderField("num_cores",     "Number of Cores")}
        {renderField("voltage_grade", "Voltage Grade")}
        <div />

        {sec("Insulation / Construction")}
        {renderField("insulation_type", "Insulation Type")}
        {renderField("sheath_type",     "Sheath Type")}
        <div className="col-span-2">{renderField("armour_type", "Armour Type")}</div>

        {sec("Installation")}
        {renderField("laying_type", "Laying Type")}
        {renderField("application", "Application")}

        {sec("Area / Certification")}
        {renderField("area_classification", "Area Classification")}
        {renderField("cable_certification", "Cable Certification")}

        {sec("Approved Makes")}
        <div className="col-span-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            {CABLE_MAKES.map(make => (
              <button key={make} type="button" onClick={() => toggleMake(make)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selectedMakes.includes(make)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary"
                }`}>
                {make}
              </button>
            ))}
          </div>
          {selectedMakes.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Selected: {selectedMakes.join(", ")}</p>
          )}
          <Input className="h-8 text-sm" placeholder="Other makes (comma-separated)…"
            value={(attrs.approved_makes_other as string) ?? ""}
            onChange={(e) => set("approved_makes_other", e.target.value)} />
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Length (m) <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Junction Box requirement builder ─────────────────────────────────────────
const JB_TYPE_OPTS        = ["Field Junction Box","Instrument Junction Box","Marshalling Box","Control Junction Box","Explosion Proof Junction Box","Other"];
const JB_ENCLOSURE_OPTS   = ["Indoor","Outdoor","Weatherproof","Flameproof","Other"];
const JB_MOUNTING_OPTS    = ["Wall Mounted","Structure Mounted","Pole Mounted","Other"];
const JB_IP_OPTS          = ["IP54","IP55","IP65","IP66","IP67","Other"];
const JB_MATERIAL_OPTS    = ["MS Powder Coated","SS304","SS316","Aluminum","FRP","Other"];
const JB_TERMINALS_OPTS   = ["10","20","30","50","75","100","Other"];
const JB_TERMINAL_TYPE    = ["Screw Type","Spring Clamp","Barrier Type","Other"];
const JB_ENTRY_TYPE_OPTS  = ["Bottom Entry","Top Entry","Side Entry","Multi Side","Other"];
const JB_GLAND_TYPE_OPTS  = ["Single Compression","Double Compression","Explosion Proof","Other"];
const JB_GLAND_SIZE_OPTS  = ["M16","M20","M25","M32","M40","M50","M63","Other"];
const JB_AREA_OPTS        = ["Safe Area","Zone 1","Zone 2"];
const JB_CERT_OPTS        = ["CE","ATEX","IECEx","PESO","Other"];
const JB_EARTHING_OPTS    = ["Internal Earthing","External Earthing","Both"];
const JB_ACCESSORIES      = ["Glands","Lugs","Terminal Blocks","Mounting Brackets","Labels","Other"];
const JB_VENDOR_CHIPS     = ["Hensel","Rittal","Pepperl+Fuchs","R.Stahl","Eaton","ABB","Baliga","Apex","Clifford","Flameproof Enclosures"];

function buildJunctionBoxRequirement(attrs: Record<string, unknown>): string {
  const jbType   = (attrs.jb_type            as string)?.trim() || "";
  const mat      = (attrs.enclosure_material  as string)?.trim() || "";
  const ip       = (attrs.ip_rating           as string)?.trim() || "";
  const lenMM    = (attrs.length_mm           as string)?.trim() || "";
  const widMM    = (attrs.width_mm            as string)?.trim() || "";
  const depMM    = (attrs.depth_mm            as string)?.trim() || "";
  const terms    = (attrs.num_terminals       as string)?.trim() || "";
  const entries  = (attrs.num_cable_entries   as string)?.trim() || "";
  const glands   = (attrs.num_glands          as string)?.trim() || "";
  const glandSz  = (attrs.gland_size          as string)?.trim() || "";
  const area     = (attrs.area_classification as string)?.trim() || "";
  const parts: string[] = [];
  if (jbType)  parts.push(jbType);
  if (mat)     parts.push(mat);
  if (ip)      parts.push(ip);
  if (lenMM && widMM && depMM) parts.push(`${lenMM}×${widMM}×${depMM} mm`);
  if (terms)   parts.push(`${terms} Terminals`);
  if (entries) parts.push(`${entries} Entries`);
  if (glands)  parts.push(glandSz ? `${glands} Glands ${glandSz}` : `${glands} Glands`);
  if (area)    parts.push(area);
  return parts.join(", ");
}

function JunctionBoxAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...attrs, [k]: v });
  const encType = (attrs.enclosure_type as string) ?? "";

  const selectedAcc: string[] = ((attrs.accessories as string) ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const toggleAcc = (chip: string) => {
    const next = selectedAcc.includes(chip)
      ? selectedAcc.filter(a => a !== chip)
      : [...selectedAcc, chip];
    set("accessories", next.join(", "));
  };

  const selectedVendors: string[] = ((attrs.approved_makes as string) ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const toggleVendor = (chip: string) => {
    const next = selectedVendors.includes(chip)
      ? selectedVendors.filter(v => v !== chip)
      : [...selectedVendors, chip];
    set("approved_makes", next.join(", "));
  };

  const sec = (title: string) => (
    <p className="text-[11px] font-semibold text-primary uppercase tracking-wide col-span-2 border-b pb-1 mt-1">{title}</p>
  );
  const ss = (key: string, label: string, opts: string[], required = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <SearchableSelect options={opts} value={(attrs[key] as string) ?? ""}
        onSelect={(v) => set(key, v === "__other__" ? "" : v)}
        placeholder={`Select ${label}…`} />
    </div>
  );
  const num = (key: string, label: string, required = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <Input className="h-8 text-sm" type="number" min="0" step="1"
        value={(attrs[key] as string) ?? ""}
        onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Junction Box Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Type")}
        {ss("jb_type", "Junction Box Type", JB_TYPE_OPTS, true)}
        <div />

        {sec("Enclosure")}
        {ss("enclosure_type",     "Enclosure Type",     JB_ENCLOSURE_OPTS)}
        {ss("mounting",           "Mounting",           JB_MOUNTING_OPTS)}
        {ss("ip_rating",          "IP Rating",          JB_IP_OPTS, encType === "Outdoor" || encType === "Weatherproof")}
        {ss("enclosure_material", "Enclosure Material", JB_MATERIAL_OPTS, true)}

        {sec("Dimensions (mm)")}
        {num("length_mm", "Length (mm)", true)}
        {num("width_mm",  "Width (mm)",  true)}
        {num("depth_mm",  "Depth (mm)",  true)}
        <div />

        {sec("Termination")}
        {ss("num_terminals",  "Number of Terminals", JB_TERMINALS_OPTS)}
        {ss("terminal_type",  "Terminal Type",       JB_TERMINAL_TYPE)}

        {sec("Cable Entry & Glands")}
        {num("num_cable_entries", "Number of Cable Entries")}
        {num("num_glands",        "Number of Glands")}
        {ss("cable_entry_type", "Cable Entry Type", JB_ENTRY_TYPE_OPTS)}
        {ss("cable_gland_type", "Cable Gland Type", JB_GLAND_TYPE_OPTS)}
        {ss("gland_size",       "Gland Size",       JB_GLAND_SIZE_OPTS)}
        <div />

        {sec("Area / Certification")}
        {ss("area_classification", "Area Classification", JB_AREA_OPTS, encType === "Flameproof")}
        {ss("certification",       "Certification",       JB_CERT_OPTS)}

        {sec("Earthing / Accessories")}
        {ss("earthing", "Earthing", JB_EARTHING_OPTS)}
        <div />
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Accessories</Label>
          <div className="flex flex-wrap gap-1.5">
            {JB_ACCESSORIES.map(chip => (
              <button key={chip} type="button" onClick={() => toggleAcc(chip)}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  selectedAcc.includes(chip)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary"
                }`}>{chip}</button>
            ))}
          </div>
          {selectedAcc.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Selected: {selectedAcc.join(", ")}</p>
          )}
        </div>

        {sec("Approved Makes")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Approved Makes</Label>
          <div className="flex flex-wrap gap-1.5">
            {JB_VENDOR_CHIPS.map(chip => (
              <button key={chip} type="button" onClick={() => toggleVendor(chip)}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  selectedVendors.includes(chip)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary"
                }`}>{chip}</button>
            ))}
          </div>
          {selectedVendors.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Selected: {selectedVendors.join(", ")}</p>
          )}
          <Input className="h-8 text-sm" placeholder="Other makes (comma-separated)…"
            value={(attrs.approved_makes_other as string) ?? ""}
            onChange={(e) => set("approved_makes_other", e.target.value)} />
        </div>

        {sec("Quantity")}
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity (Units) <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="1" step="1"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
        <div />

      </div>
    </div>
  );
}

// ── Cooling Tower requirement builder ────────────────────────────────────────
const CT_TYPE_OPTS         = ["Induced Draft","Forced Draft","Cross Flow","Counter Flow","Other"];
const CT_CONSTRUCTION_OPTS = ["FRP","RCC","Steel","Other"];
const CT_FAN_TYPE_OPTS     = ["Axial","Centrifugal"];
const CT_FAN_DRIVE_OPTS    = ["Direct Drive","Gearbox Drive","Belt Drive"];
const CT_FILL_OPTS         = ["Splash Fill","Film Fill","Other"];
const CT_YES_NO            = ["Yes","No"];
const CT_CASING_MAT_OPTS   = ["FRP","GI","SS304","Other"];
const CT_BASIN_MAT_OPTS    = ["RCC","FRP","Steel","Other"];
const CT_WATER_TYPE_OPTS   = ["Cooling Water","Process Water","Chemical Water","Other"];
const CT_VENDOR_CHIPS      = [
  "Paharpur","Cooling Tower India","Alfa Laval","SPX Cooling","Brentwood",
  "Baltimore Aircoil","Evapco","Star Cooling","Tower Tech","Hindustan",
];

function buildCoolingTowerRequirement(attrs: Record<string, unknown>): string {
  const ctType    = (attrs.cooling_tower_type   as string)?.trim() || "";
  const circ      = (attrs.circulation_rate     as string)?.trim() || "";
  const inletT    = parseFloat((attrs.inlet_water_temp  as string) ?? "");
  const outletT   = parseFloat((attrs.outlet_water_temp as string) ?? "");
  const wbt       = parseFloat((attrs.wet_bulb_temp     as string) ?? "");
  const casing    = (attrs.casing_material      as string)?.trim() || "";
  const fanType   = (attrs.fan_type             as string)?.trim() || "";
  const motorKW   = (attrs.motor_power_kw       as string)?.trim() || "";
  const parts: string[] = ["Cooling Tower"];
  if (circ)               parts.push(`${circ} m³/hr`);
  if (!isNaN(inletT) && !isNaN(outletT)) parts.push(`Range ${(inletT - outletT).toFixed(1)}°C`);
  if (!isNaN(outletT) && !isNaN(wbt))    parts.push(`Approach ${(outletT - wbt).toFixed(1)}°C`);
  if (casing)             parts.push(casing);
  if (ctType)             parts.push(ctType);
  if (fanType)            parts.push(`${fanType} Fan`);
  if (motorKW)            parts.push(`${motorKW} kW`);
  return parts.join(", ");
}

function CoolingTowerAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...attrs, [k]: v });

  const inletT  = parseFloat((attrs.inlet_water_temp  as string) ?? "");
  const outletT = parseFloat((attrs.outlet_water_temp as string) ?? "");
  const wbt     = parseFloat((attrs.wet_bulb_temp     as string) ?? "");
  const range   = (!isNaN(inletT) && !isNaN(outletT)) ? (inletT - outletT).toFixed(1) : "—";
  const approach = (!isNaN(outletT) && !isNaN(wbt))   ? (outletT - wbt).toFixed(1)    : "—";

  const selectedVendors: string[] = ((attrs.approved_makes as string) ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const toggleVendor = (chip: string) => {
    const next = selectedVendors.includes(chip)
      ? selectedVendors.filter(v => v !== chip)
      : [...selectedVendors, chip];
    set("approved_makes", next.join(", "));
  };

  const sec = (title: string) => (
    <p className="text-[11px] font-semibold text-primary uppercase tracking-wide col-span-2 border-b pb-1 mt-1">{title}</p>
  );
  const renderSS = (key: string, label: string, opts: string[], required = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <SearchableSelect
        options={opts}
        value={(attrs[key] as string) ?? ""}
        onSelect={(v) => set(key, v === "__other__" ? "" : v)}
        placeholder={`Select ${label}…`}
      />
    </div>
  );
  const renderNum = (key: string, label: string, required = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <Input className="h-8 text-sm" type="number" min="0" step="any"
        value={(attrs[key] as string) ?? ""}
        onChange={(e) => {
          set(key, e.target.value);
        }} />
    </div>
  );

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cooling Tower Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Type")}
        {renderSS("cooling_tower_type", "Cooling Tower Type", CT_TYPE_OPTS, true)}
        {renderSS("construction_type",  "Construction Type",  CT_CONSTRUCTION_OPTS)}

        {sec("Capacity / Duty")}
        {renderNum("circulation_rate", "Circulation Rate (m³/hr)", true)}
        {renderNum("heat_load_kcal",   "Heat Load (kcal/hr)")}
        {renderNum("inlet_water_temp",  "Inlet Water Temp (°C)",  true)}
        {renderNum("outlet_water_temp", "Outlet Water Temp (°C)", true)}
        {renderNum("wet_bulb_temp",     "Wet Bulb Temp (°C)",     true)}
        <div />

        {sec("Performance (Auto-calculated)")}
        <div className="space-y-1.5">
          <Label className="text-xs">Range (°C) <span className="text-[10px] text-muted-foreground">(Inlet − Outlet)</span></Label>
          <Input readOnly className="h-8 text-sm bg-muted/50 text-muted-foreground cursor-default" value={range} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Approach (°C) <span className="text-[10px] text-muted-foreground">(Outlet − WBT)</span></Label>
          <Input readOnly className="h-8 text-sm bg-muted/50 text-muted-foreground cursor-default" value={approach} />
        </div>

        {sec("Fan / Drive")}
        {renderSS("fan_type",   "Fan Type",   CT_FAN_TYPE_OPTS)}
        {renderSS("fan_drive",  "Fan Drive",  CT_FAN_DRIVE_OPTS)}
        {renderNum("motor_power_kw", "Motor Power (kW)")}
        <div />

        {sec("Components")}
        {renderSS("fill_type",         "Fill Type",         CT_FILL_OPTS)}
        {renderSS("drift_eliminator",  "Drift Eliminator",  CT_YES_NO)}
        {renderSS("louvers",           "Louvers",           CT_YES_NO)}
        <div />

        {sec("Material")}
        {renderSS("casing_material", "Casing Material", CT_CASING_MAT_OPTS)}
        {renderSS("basin_material",  "Basin Material",  CT_BASIN_MAT_OPTS)}

        {sec("Operating Conditions")}
        {renderSS("water_type", "Water Type", CT_WATER_TYPE_OPTS)}
        <div />

        {sec("Approved Makes")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Approved Makes</Label>
          <div className="flex flex-wrap gap-1.5">
            {CT_VENDOR_CHIPS.map(chip => (
              <button key={chip} type="button"
                onClick={() => toggleVendor(chip)}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  selectedVendors.includes(chip)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary"
                }`}>{chip}</button>
            ))}
          </div>
          {selectedVendors.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Selected: {selectedVendors.join(", ")}</p>
          )}
          <Input className="h-8 text-sm" placeholder="Other makes (comma-separated)…"
            value={(attrs.approved_makes_other as string) ?? ""}
            onChange={(e) => set("approved_makes_other", e.target.value)} />
        </div>

        {sec("Quantity")}
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity (Units) <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="1" step="1"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
        <div />

      </div>
    </div>
  );
}

// ── Bought-out Package requirement builder ────────────────────────────────────
const BOUGHT_OUT_PKG_TYPE_OPTS = [
  "Pump Skid Package","Vacuum System","Dosing System","Filtration Unit",
  "Heat Exchanger Package","Compressor Package","Utility Skid","Other",
];
const BOUGHT_OUT_CAPACITY_OPTS = [
  "1 m³/hr","5 m³/hr","10 m³/hr","20 m³/hr","50 m³/hr","100 m³/hr","Other",
];
const BOUGHT_OUT_DUTY_OPTS     = ["Continuous","Intermittent","Standby"];
const BOUGHT_OUT_UNITS_OPTS    = ["1","2","3","4","Other"];
const BOUGHT_OUT_CONFIG_OPTS   = [
  "Single","Duty + Standby","2 Working + 1 Standby","Parallel","Other",
];
const BOUGHT_OUT_COMPONENTS    = [
  "Pumps","Motors","Base Frame","Coupling","Control Panel",
  "VFD","Instruments","Piping","Valves","Gauges","Flow Meter","Other",
];
const BOUGHT_OUT_FLUID_OPTS    = ["Water","Oil","Chemical","Slurry","Air","Gas","Other"];
const BOUGHT_OUT_TEMP_OPTS     = ["Ambient","50°C","80°C","120°C","Other"];
const BOUGHT_OUT_MATERIAL_OPTS = ["CS","SS304","SS316","Duplex","Other"];
const BOUGHT_OUT_AREA_OPTS     = ["Safe Area","Zone 1","Zone 2"];
const BOUGHT_OUT_CERT_OPTS     = ["CE","ATEX","IECEx","PESO","Other"];
const BOUGHT_OUT_VENDOR_CHIPS  = [
  "Flowserve","KSB","Sulzer","Grundfos","SPX Flow","Atlas Copco",
  "Alfa Laval","Praj Industries","ISGEC","Thermax","HOWE-Baker","Samarth",
];

function buildBoughtOutRequirement(attrs: Record<string, unknown>): string {
  const pkgType   = (attrs.package_type    as string)?.trim() || "";
  const capacity  = (attrs.capacity        as string)?.trim() || "";
  const config    = (attrs.configuration   as string)?.trim() || "";
  const material  = (attrs.material_class  as string)?.trim() || "";
  const compsRaw  = (attrs.package_components as string)?.trim() || "";
  const parts: string[] = [];
  if (pkgType)  parts.push(pkgType);
  if (capacity) parts.push(capacity);
  if (config)   parts.push(config);
  if (material) parts.push(material);
  if (compsRaw) {
    const comps = compsRaw.split(",").map(s => s.trim()).filter(Boolean);
    if (comps.length) parts.push("Includes " + comps.join(" + "));
  }
  return parts.join(", ");
}

function BoughtOutAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...attrs, [k]: v });

  const selectedComps: string[] = ((attrs.package_components as string) ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const toggleComp = (chip: string) => {
    const next = selectedComps.includes(chip)
      ? selectedComps.filter(c => c !== chip)
      : [...selectedComps, chip];
    set("package_components", next.join(", "));
  };

  const selectedVendors: string[] = ((attrs.approved_vendors as string) ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const toggleVendor = (chip: string) => {
    const next = selectedVendors.includes(chip)
      ? selectedVendors.filter(v => v !== chip)
      : [...selectedVendors, chip];
    set("approved_vendors", next.join(", "));
  };

  const sec = (title: string) => (
    <p className="text-[11px] font-semibold text-primary uppercase tracking-wide col-span-2 border-b pb-1 mt-1">{title}</p>
  );
  const renderSS = (key: string, label: string, opts: string[], required = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <SearchableSelect
        options={opts}
        value={(attrs[key] as string) ?? ""}
        onSelect={(v) => set(key, v === "__other__" ? "" : v)}
        placeholder={`Select ${label}…`}
      />
    </div>
  );
  const renderOtherText = (key: string, label: string, opts: string[]) => {
    const val = (attrs[key] as string) ?? "";
    const isOther = val === "__other__" || (val === "" && (attrs[`${key}_other`] as string) !== undefined);
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <SearchableSelect
          options={opts}
          value={val}
          onSelect={(v) => set(key, v)}
          placeholder={`Select ${label}…`}
        />
        {isOther && (
          <Input className="h-8 text-sm mt-1" placeholder="Specify…"
            value={(attrs[`${key}_other`] as string) ?? ""}
            onChange={(e) => set(`${key}_other`, e.target.value)} />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bought-out Package Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Package Type")}
        {renderSS("package_type", "Package Type", BOUGHT_OUT_PKG_TYPE_OPTS, true)}
        <div />

        {sec("Capacity / Duty")}
        {renderOtherText("capacity", "Capacity", BOUGHT_OUT_CAPACITY_OPTS)}
        {renderSS("duty_type", "Duty Type", BOUGHT_OUT_DUTY_OPTS)}

        {sec("Configuration")}
        {renderSS("number_of_units", "Number of Units", BOUGHT_OUT_UNITS_OPTS)}
        {renderSS("configuration", "Configuration", BOUGHT_OUT_CONFIG_OPTS)}

        {sec("Major Components")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Package Components <span className="text-red-500">*</span></Label>
          <div className="flex flex-wrap gap-1.5">
            {BOUGHT_OUT_COMPONENTS.map(chip => (
              <button key={chip} type="button"
                onClick={() => toggleComp(chip)}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  selectedComps.includes(chip)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary"
                }`}>{chip}</button>
            ))}
          </div>
          {selectedComps.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Selected: {selectedComps.join(", ")}</p>
          )}
        </div>

        {sec("Operating Conditions")}
        {renderSS("fluid_type", "Fluid Type", BOUGHT_OUT_FLUID_OPTS)}
        {renderSS("operating_temperature", "Operating Temperature", BOUGHT_OUT_TEMP_OPTS)}

        {sec("Construction")}
        {renderSS("material_class", "Material Class", BOUGHT_OUT_MATERIAL_OPTS)}
        <div />

        {sec("Area / Compliance")}
        {renderSS("area_classification", "Area Classification", BOUGHT_OUT_AREA_OPTS)}
        {renderSS("certification", "Certification", BOUGHT_OUT_CERT_OPTS)}

        {sec("Approved Package Vendors")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Approved Vendors</Label>
          <div className="flex flex-wrap gap-1.5">
            {BOUGHT_OUT_VENDOR_CHIPS.map(chip => (
              <button key={chip} type="button"
                onClick={() => toggleVendor(chip)}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  selectedVendors.includes(chip)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary"
                }`}>{chip}</button>
            ))}
          </div>
          {selectedVendors.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Selected: {selectedVendors.join(", ")}</p>
          )}
          <Input className="h-8 text-sm" placeholder="Other vendors (comma-separated)…"
            value={(attrs.approved_vendors_other as string) ?? ""}
            onChange={(e) => set("approved_vendors_other", e.target.value)} />
        </div>

        {sec("Quantity")}
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity (Systems) <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="1" step="1"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
        <div />

      </div>
    </div>
  );
}

// ── Control Valve requirement builder ────────────────────────────────────────
function buildControlValveRequirement(attrs: Record<string, unknown>): string {
  const valveType   = (attrs.valve_type        as string)?.trim() || "";
  const config      = (attrs.valve_config      as string)?.trim() || "";
  const sizeNb      = (attrs.size_nb           as string)?.trim() || "";
  const rating      = (attrs.pressure_rating   as string)?.trim() || "";
  const actuator    = (attrs.actuator_type     as string)?.trim() || "";
  const failAction  = (attrs.fail_action       as string)?.trim() || "";
  const trimMat     = (attrs.trim_material     as string)?.trim() || "";
  const flowChar    = (attrs.flow_characteristic as string)?.trim() || "";
  const signal      = (attrs.input_signal      as string)?.trim() || "";
  const endConn     = (attrs.end_connection    as string)?.trim() || "";

  const trimStr = trimMat ? `${trimMat} Trim` : "";
  const parts: string[] = [];
  if (valveType)  parts.push(valveType);
  if (config)     parts.push(config);
  if (sizeNb)     parts.push(sizeNb);
  if (rating)     parts.push(rating);
  if (actuator)   parts.push(actuator);
  if (failAction) parts.push(failAction);
  if (trimStr)    parts.push(trimStr);
  if (flowChar)   parts.push(flowChar);
  if (signal)     parts.push(signal);
  if (endConn)    parts.push(endConn);
  return parts.join(", ");
}

const CONTROL_VALVE_OPTS: Record<string, string[]> = {
  valve_type:           ["Globe Control Valve", "Ball Control Valve", "Butterfly Control Valve", "Eccentric Plug Valve"],
  valve_config:         ["Two Way", "Three Way (Mixing)", "Three Way (Diverting)"],
  size_nb:              ["15 NB", "25 NB", "40 NB", "50 NB", "80 NB", "100 NB", "150 NB", "200 NB"],
  pressure_rating:      ["Class 150", "Class 300", "Class 600", "PN10", "PN16", "PN25", "PN40"],
  service_type:         ["Flow Control", "Pressure Control", "Level Control", "Temperature Control"],
  flow_characteristic:  ["Linear", "Equal Percentage", "Quick Opening"],
  actuator_type:        ["Pneumatic Diaphragm", "Pneumatic Piston", "Electric Actuator", "Hydraulic"],
  fail_action:          ["Fail Open (FO)", "Fail Close (FC)", "Fail Last (FL)"],
  end_connection:       ["Flanged", "Threaded", "Butt Weld", "Wafer"],
  body_material:        ["WCB (CS)", "SS304", "SS316", "Alloy Steel", "Duplex"],
  trim_material:        ["SS304", "SS316", "Hardened Trim", "Stellite"],
  seat_type:            ["Metal Seat", "Soft Seat (PTFE)", "Balanced Trim", "Unbalanced Trim"],
  leakage_class:        ["Class II", "Class III", "Class IV", "Class V", "Class VI"],
  input_signal:         ["4–20 mA", "0–10 V", "Digital"],
  positioner:           ["With Positioner", "Without Positioner"],
  area_classification:  ["Safe Area", "Zone 1", "Zone 2"],
  certification:        ["ATEX", "IECEx", "PESO"],
};

function ControlValveAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const singleKeys = Object.keys(CONTROL_VALVE_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = CONTROL_VALVE_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = CONTROL_VALVE_OPTS[key] ?? [];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal}
            onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function sec(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  const areaClass = (attrs.area_classification as string) ?? "";

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Control Valve Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Valve Type")}
        {renderField("valve_type",   "Control Valve Type", true)}
        {renderField("valve_config", "Valve Configuration", true)}

        {sec("Size & Rating")}
        {renderField("size_nb",         "Size (NB)",       true)}
        {renderField("pressure_rating",  "Pressure Rating", true)}

        {sec("Flow / Service")}
        {renderField("service_type",       "Service Type")}
        {renderField("flow_characteristic","Flow Characteristic")}

        {sec("Actuation")}
        {renderField("actuator_type", "Actuator Type", true)}
        {renderField("fail_action",   "Fail Action",   true)}

        {sec("Connection")}
        {renderField("end_connection", "End Connection")}
        <div />

        {sec("Material")}
        {renderField("body_material", "Body Material")}
        {renderField("trim_material", "Trim Material")}

        {sec("Seat / Leakage")}
        {renderField("seat_type",     "Seat Type")}
        {renderField("leakage_class", "Leakage Class")}

        {sec("Signal / Control")}
        {renderField("input_signal", "Input Signal")}
        {renderField("positioner",   "Positioner")}

        {sec("Hazardous Area (Optional)")}
        {renderField("area_classification", "Area Classification")}
        {(areaClass === "Zone 1" || areaClass === "Zone 2")
          ? renderField("certification", "Certification")
          : <div />}

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Safety Valve requirement builder ─────────────────────────────────────────
function buildSafetyValveRequirement(attrs: Record<string, unknown>): string {
  const valveType   = (attrs.valve_type     as string)?.trim() || "";
  const inletSize   = (attrs.inlet_size     as string)?.trim() || "";
  const outletSize  = (attrs.outlet_size    as string)?.trim() || "";
  const setPressure = (attrs.set_pressure   as string)?.trim() || "";
  const bodyMat     = (attrs.body_material  as string)?.trim() || "";
  const trimMat     = (attrs.trim_material  as string)?.trim() || "";
  const endConn     = (attrs.end_connection as string)?.trim() || "";
  const standard    = (attrs.design_standard as string)?.trim() || "";

  const typeAbbr = valveType.match(/\(([^)]+)\)/)?.[ 1] || valveType.split(" ").map(w => w[0]).join("") || valveType;
  const sizeStr   = inletSize && outletSize ? `${inletSize} x ${outletSize}` : inletSize || outletSize;
  const pressStr  = setPressure ? `Set @ ${setPressure}` : "";
  const bodyStr   = bodyMat ? `${bodyMat} Body` : "";
  const trimStr   = trimMat ? `${trimMat} Trim` : "";

  const parts: string[] = [];
  if (typeAbbr)  parts.push(typeAbbr);
  if (sizeStr)   parts.push(sizeStr);
  if (pressStr)  parts.push(pressStr);
  if (bodyStr)   parts.push(bodyStr);
  if (trimStr)   parts.push(trimStr);
  if (endConn)   parts.push(endConn);
  if (standard)  parts.push(standard);
  return parts.join(", ");
}

const SAFETY_VALVE_OPTS: Record<string, string[]> = {
  valve_type:           ["Pressure Safety Valve (PSV)", "Pressure Relief Valve (PRV)", "Safety Relief Valve (SRV)", "Vacuum Relief Valve (VRV)", "Breather Valve"],
  inlet_size:           ["15 NB", "25 NB", "40 NB", "50 NB", "80 NB", "100 NB", "150 NB"],
  outlet_size:          ["25 NB", "40 NB", "50 NB", "80 NB", "100 NB", "150 NB", "200 NB"],
  pressure_rating:      ["Class 150", "Class 300", "Class 600", "PN10", "PN16", "PN25", "PN40"],
  set_pressure:         ["2 bar", "5 bar", "10 bar", "15 bar", "20 bar", "25 bar"],
  overpressure:         ["10%", "16%", "21%"],
  service_fluid:        ["Steam", "Air", "Gas", "Water", "Oil", "Chemical"],
  operating_temp:       ["Ambient", "50°C", "100°C", "150°C", "250°C"],
  end_connection:       ["Flanged", "Threaded"],
  body_material:        ["WCB (CS)", "SS304", "SS316", "Alloy Steel"],
  trim_material:        ["SS304", "SS316", "Hardened Trim"],
  discharge_type:       ["Open Discharge", "Closed Discharge", "Vent to Atmosphere", "To Flare Line"],
  design_standard:      ["API 520", "API 526", "ASME", "ISO"],
  certification:        ["IBR", "ATEX", "IECEx", "PESO"],
  area_classification:  ["Safe Area", "Zone 1", "Zone 2"],
};

function SafetyValveAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const singleKeys = Object.keys(SAFETY_VALVE_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = SAFETY_VALVE_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = SAFETY_VALVE_OPTS[key] ?? [];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal}
            onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function sec(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Safety Valve (PSV/PRV) Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Valve Type")}
        <div className="col-span-2">{renderField("valve_type", "Safety Valve Type", true)}</div>

        {sec("Size & Rating")}
        {renderField("inlet_size",      "Inlet Size (NB)",  true)}
        {renderField("outlet_size",     "Outlet Size (NB)")}
        <div className="col-span-2">{renderField("pressure_rating", "Pressure Rating")}</div>

        {sec("Pressure Settings")}
        {renderField("set_pressure", "Set Pressure", true)}
        {renderField("overpressure", "Overpressure (%)")}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Relieving Capacity (optional)</Label>
          <Input className="h-8 text-sm" placeholder="e.g. 500 kg/h"
            value={(attrs.relieving_capacity as string) ?? ""}
            onChange={(e) => set("relieving_capacity", e.target.value)} />
        </div>

        {sec("Service Conditions")}
        {renderField("service_fluid",  "Service Fluid")}
        {renderField("operating_temp", "Operating Temperature")}

        {sec("Connection")}
        {renderField("end_connection", "End Connection")}
        <div />

        {sec("Material")}
        {renderField("body_material", "Body Material")}
        {renderField("trim_material", "Trim Material")}

        {sec("Discharge Type")}
        {renderField("discharge_type", "Discharge Type")}
        <div />

        {sec("Certification / Standard")}
        {renderField("design_standard", "Design Standard")}
        {renderField("certification",   "Certification")}

        {sec("Hazardous Area (Optional)")}
        {renderField("area_classification", "Area Classification")}
        <div />

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── ON/OFF Valve requirement builder ─────────────────────────────────────────
const OO_VALVE_TYPE_OPTS  = ["Ball Valve","Gate Valve","Globe Valve","Butterfly Valve","Plug Valve","Diaphragm Valve","Other"];
const OO_VALVE_CFG_OPTS   = ["Two Way","Three Way","Other"];
const OO_SIZE_NB_OPTS     = ["15 NB","25 NB","40 NB","50 NB","80 NB","100 NB","150 NB","200 NB","Other"];
const OO_PR_OPTS          = ["Class 150","Class 300","Class 600","PN10","PN16","PN25","PN40","Other"];
const OO_SERVICE_OPTS     = ["Isolation","On/Off Control","Emergency Shutdown (ESD)","Bypass","Other"];
const OO_ACT_OPTS         = ["Manual Lever","Manual Gear","Pneumatic Actuator","Electric Actuator","Hydraulic Actuator","Other"];
const OO_FAIL_OPTS        = ["Fail Open (FO)","Fail Close (FC)","Fail Last (FL)","Not Applicable"];
const OO_END_CONN_OPTS    = ["Flanged","Threaded","Butt Weld","Socket Weld","Wafer","Lug Type","Other"];
const OO_BODY_MAT_OPTS    = ["WCB (CS)","SS304","SS316","Alloy Steel","Duplex","CI","Other"];
const OO_TRIM_MAT_OPTS    = ["SS304","SS316","Hardened Steel","Stellite","PTFE Lined","Other"];
const OO_SEAT_OPTS        = ["Metal Seat","Soft Seat (PTFE)","Resilient Seat","Other"];
const OO_AREA_OPTS        = ["Safe Area","Zone 1","Zone 2"];
const OO_CERT_OPTS        = ["ATEX","IECEx","PESO","SIL Rated","Other"];

const OO_ACTUATED = ["Pneumatic Actuator","Electric Actuator","Hydraulic Actuator"];

function buildOnOffValveRequirement(attrs: Record<string, unknown>): string {
  const valveType = (attrs.valve_type      as string)?.trim() || "";
  const sizeNb    = (attrs.size_nb         as string)?.trim() || "";
  const pr        = (attrs.pressure_rating as string)?.trim() || "";
  const act       = (attrs.actuation_type  as string)?.trim() || "";
  const fail      = (attrs.fail_action     as string)?.trim() || "";
  const bodyMat   = (attrs.body_material   as string)?.trim() || "";
  const endConn   = (attrs.end_connection  as string)?.trim() || "";
  const parts: string[] = [];
  if (valveType) parts.push(valveType);
  if (sizeNb)    parts.push(sizeNb);
  if (pr)        parts.push(pr);
  const isActuated = OO_ACTUATED.includes(act);
  if (act)       parts.push(isActuated ? act : act);
  if (isActuated && fail && fail !== "Not Applicable") parts.push(fail);
  if (bodyMat)   parts.push(`${bodyMat} Body`);
  if (endConn)   parts.push(endConn);
  return parts.join(", ");
}

function OnOffValveAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...attrs, [k]: v });
  const actuation = (attrs.actuation_type as string) ?? "";
  const isActuated = OO_ACTUATED.includes(actuation);

  const sec = (title: string) => (
    <p className="text-[11px] font-semibold text-primary uppercase tracking-wide col-span-2 border-b pb-1 mt-1">{title}</p>
  );
  const ss = (key: string, label: string, opts: string[], required = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <SearchableSelect options={opts} value={(attrs[key] as string) ?? ""}
        onSelect={(v) => set(key, v === "__other__" ? "" : v)}
        placeholder={`Select ${label}…`} />
    </div>
  );

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ON/OFF Valve Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Valve Type")}
        {ss("valve_type",        "Valve Type",        OO_VALVE_TYPE_OPTS, true)}
        {ss("valve_configuration","Valve Configuration",OO_VALVE_CFG_OPTS)}

        {sec("Size & Rating")}
        {ss("size_nb",           "Size (NB)",          OO_SIZE_NB_OPTS, true)}
        {ss("pressure_rating",   "Pressure Rating",    OO_PR_OPTS, true)}

        {sec("Service")}
        {ss("service_type",      "Service Type",       OO_SERVICE_OPTS)}
        <div />

        {sec("Actuation")}
        {ss("actuation_type",    "Actuation Type",     OO_ACT_OPTS, true)}
        {isActuated
          ? ss("fail_action",    "Fail Action",        OO_FAIL_OPTS, true)
          : <div />}

        {sec("Connection")}
        {ss("end_connection",    "End Connection",     OO_END_CONN_OPTS)}
        <div />

        {sec("Material")}
        {ss("body_material",     "Body Material",      OO_BODY_MAT_OPTS)}
        {ss("trim_disc_material","Trim / Disc Material",OO_TRIM_MAT_OPTS)}

        {sec("Seat")}
        {ss("seat_type",         "Seat Type",          OO_SEAT_OPTS)}
        <div />

        {sec("Hazardous Area")}
        {ss("area_classification","Area Classification",OO_AREA_OPTS)}
        {ss("certification",      "Certification",      OO_CERT_OPTS)}

        {sec("Quantity")}
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity (Units) <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="1" step="1"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
        <div />

      </div>
    </div>
  );
}

// ── Isolation Valve requirement builder ──────────────────────────────────────
function buildIsolationValveRequirement(attrs: Record<string, unknown>): string {
  const valveType   = (attrs.valve_type        as string)?.trim() || "";
  const sizeNb      = (attrs.size_nb           as string)?.trim() || "";
  const rating      = (attrs.pressure_rating   as string)?.trim() || "";
  const bodyMat     = (attrs.body_material     as string)?.trim() || "";
  const trimMat     = (attrs.trim_material     as string)?.trim() || "";
  const endConn     = (attrs.end_connection    as string)?.trim() || "";
  const operation   = (attrs.operation_type   as string)?.trim() || "";

  const bodyStr  = bodyMat  ? `${bodyMat} Body`  : "";
  const trimStr  = trimMat  ? `${trimMat} Trim`  : "";

  const parts: string[] = [];
  if (valveType) parts.push(valveType);
  if (sizeNb)    parts.push(sizeNb);
  if (rating)    parts.push(rating);
  if (bodyStr)   parts.push(bodyStr);
  if (trimStr)   parts.push(trimStr);
  if (endConn)   parts.push(endConn);
  if (operation) parts.push(operation);
  return parts.join(", ");
}

// ── Isolation Valve option lists ──────────────────────────────────────────────
const ISOLATION_VALVE_OPTS: Record<string, string[]> = {
  valve_type:       ["Gate Valve", "Ball Valve", "Butterfly Valve", "Plug Valve", "Knife Gate Valve"],
  size_nb:          ["15 NB", "25 NB", "40 NB", "50 NB", "80 NB", "100 NB", "150 NB", "200 NB", "250 NB", "300 NB"],
  pressure_rating:  ["Class 150", "Class 300", "Class 600", "PN10", "PN16", "PN25", "PN40"],
  end_connection:   ["Flanged", "Threaded", "Socket Weld", "Butt Weld", "Wafer", "Lug Type"],
  body_material:    ["CI", "CS (WCB)", "SS304", "SS316", "Alloy Steel", "Duplex"],
  trim_material:    ["SS304", "SS316", "Hard Facing", "Alloy Steel"],
  operation_type:   ["Manual", "Gear Operated", "Pneumatic Actuated", "Electric Actuated", "Hydraulic"],
  seat_type:        ["Metal Seat", "Soft Seat (PTFE)", "Resilient Seat"],
  area_classification: ["Safe Area", "Zone 1", "Zone 2"],
  certification:    ["ATEX", "IECEx", "PESO"],
};

// ── Isolation Valve structured form ──────────────────────────────────────────
function IsolationValveAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const singleKeys = Object.keys(ISOLATION_VALVE_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = ISOLATION_VALVE_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = ISOLATION_VALVE_OPTS[key] ?? [];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function sectionHeader(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Isolation Valve Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sectionHeader("Valve Type")}
        <div className="col-span-2">
          {renderField("valve_type", "Valve Type", true)}
        </div>

        {sectionHeader("Size & Rating")}
        {renderField("size_nb",         "Size (NB)",       true)}
        {renderField("pressure_rating",  "Pressure Rating", true)}

        {sectionHeader("Connection")}
        {renderField("end_connection", "End Connection")}
        <div /> {/* spacer */}

        {sectionHeader("Material")}
        {renderField("body_material", "Body Material")}
        {renderField("trim_material", "Trim Material")}

        {sectionHeader("Operation")}
        {renderField("operation_type", "Operation Type")}
        <div />

        {sectionHeader("Seat / Seal")}
        {renderField("seat_type", "Seat Type")}
        <div />

        {sectionHeader("Hazardous Area (Optional)")}
        {renderField("area_classification", "Area Classification")}
        {renderField("certification",       "Certification")}

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Pump Skid requirement builder ────────────────────────────────────────────
function buildPumpSkidRequirement(attrs: Record<string, unknown>): string {
  const pkgType    = (attrs.package_type         as string)?.trim()   || "";
  const pumpType   = (attrs.pump_type            as string)?.trim()   || "";
  const flowRate   = (attrs.flow_rate            as string)?.trim()   || "";
  const standby    = (attrs.standby_config       as string)?.trim()   || "";
  const components = (attrs.included_components  as string[])         ?? [];

  // "Duplex Pump Skid (1W + 1S)" → "Duplex Pump Skid"
  const pkgLabel   = pkgType.replace(/\s*\(.*\)$/, "");
  // "Centrifugal" → "Centrifugal Pumps"
  const pumpLabel  = pumpType ? `${pumpType} Pumps` : "";
  // "1 Working + 1 Standby" → "1W+1S"
  const standbyLabel = standby
    .replace("1 Working + 1 Standby", "1W+1S")
    .replace("2 Working + 1 Standby", "2W+1S");

  const parts: string[] = [];
  if (pkgLabel)  parts.push(pkgLabel);
  if (pumpLabel) parts.push(pumpLabel);
  if (flowRate)  parts.push(flowRate);
  if (standbyLabel && standbyLabel !== "No Standby") parts.push(standbyLabel);
  if (components.length > 0) parts.push(`Complete with ${components.slice(0, 4).join(", ")}`);
  return parts.join(", ");
}

// ── Pump Skid option lists ────────────────────────────────────────────────────
const PUMP_SKID_OPTS: Record<string, string[]> = {
  package_type:     ["Single Pump Skid", "Duplex Pump Skid (1W + 1S)", "Triplex Pump Skid (2W + 1S)", "Custom Package"],
  pump_type:        ["Centrifugal", "Multistage", "Gear", "Screw", "Dosing / Metering", "Vacuum Booster"],
  flow_rate:        ["5 m³/hr", "10 m³/hr", "20 m³/hr", "50 m³/hr", "100 m³/hr", "200 m³/hr"],
  head_pressure:    ["10", "20", "50", "100", "150", "200"],
  num_pumps:        ["1", "2", "3", "4"],
  standby_config:   ["No Standby", "1 Working + 1 Standby", "2 Working + 1 Standby"],
  mounting:         ["Base Mounted", "Skid Mounted", "Containerized"],
  material_class:   ["CS", "SS304", "SS316", "Duplex"],
};

const PUMP_SKID_COMPONENT_OPTS = [
  "Pumps", "Motor", "Base Frame", "Coupling", "Control Panel",
  "VFD", "Instrumentation", "Piping", "Valves", "NRV",
  "Pressure Gauges", "Flow Meter",
];

const PUMP_SKID_MAKES = ["Flowserve", "KSB", "Grundfos", "Sulzer", "Ebara", "Ruhrpumpen", "SPX", "Peerless", "Kirloskar"];

// ── Pump Skid structured form ─────────────────────────────────────────────────
function PumpSkidAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const singleKeys = Object.keys(PUMP_SKID_OPTS);
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = PUMP_SKID_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
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
    const opts      = PUMP_SKID_OPTS[key];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  // ── Included Components multi-select ──
  const [compOpen, setCompOpen] = useState(false);
  const [compQuery, setCompQuery] = useState("");
  const [showCustomComp, setShowCustomComp] = useState(false);
  const [customCompVal, setCustomCompVal] = useState("");
  const includedComponents = (attrs.included_components as string[]) ?? [];

  function toggleComp(comp: string) {
    onChange({ ...attrs, included_components: includedComponents.includes(comp)
      ? includedComponents.filter((c) => c !== comp)
      : [...includedComponents, comp] });
  }
  function addCustomComp() {
    const t = customCompVal.trim();
    if (t && !includedComponents.includes(t)) onChange({ ...attrs, included_components: [...includedComponents, t] });
    setCustomCompVal(""); setShowCustomComp(false);
  }
  const filteredComps = PUMP_SKID_COMPONENT_OPTS.filter((o) => o.toLowerCase().includes(compQuery.toLowerCase()));

  // ── Makes multi-select ──
  const [makesOpen, setMakesOpen] = useState(false);
  const [makesQuery, setMakesQuery] = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const [customMakeVal, setCustomMakeVal] = useState("");
  const approvedMakes = (attrs.approved_makes as string[]) ?? [];

  function toggleMake(make: string) {
    onChange({ ...attrs, approved_makes: approvedMakes.includes(make)
      ? approvedMakes.filter((m) => m !== make)
      : [...approvedMakes, make] });
  }
  function addCustomMake() {
    const t = customMakeVal.trim();
    if (t && !approvedMakes.includes(t)) onChange({ ...attrs, approved_makes: [...approvedMakes, t] });
    setCustomMakeVal(""); setShowCustomMake(false);
  }
  const filteredMakes = PUMP_SKID_MAKES.filter((o) => o.toLowerCase().includes(makesQuery.toLowerCase()));

  function sectionHeader(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pump Skid Package Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sectionHeader("Package Type")}
        {renderField("package_type", "Package Type", true)}
        {renderField("pump_type",    "Pump Type"        )}

        {sectionHeader("Capacity (Indicative)")}
        {renderField("flow_rate",     "Flow Rate (m³/hr)"          )}
        {renderField("head_pressure", "Head / Pressure (m or bar)" )}

        {sectionHeader("Package Configuration")}
        {renderField("num_pumps",      "Number of Pumps"      )}
        {renderField("standby_config", "Standby Configuration")}
        {renderField("mounting",       "Mounting"             )}

        {sectionHeader("Scope of Supply")}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Included Components <span className="text-[10px] font-normal text-muted-foreground">(multi-select)</span></Label>
          <Popover open={compOpen} onOpenChange={setCompOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 w-full justify-between text-sm font-normal">
                {includedComponents.length > 0 ? `${includedComponents.length} item${includedComponents.length > 1 ? "s" : ""} selected` : "Select components…"}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search…" value={compQuery} onValueChange={setCompQuery} />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {filteredComps.map((opt) => (
                      <CommandItem key={opt} value={opt} onSelect={() => toggleComp(opt)}>
                        <Check className={cn("mr-2 h-4 w-4", includedComponents.includes(opt) ? "opacity-100" : "opacity-0")} />
                        {opt}
                      </CommandItem>
                    ))}
                    <CommandItem value="__add_custom_comp__" onSelect={() => { setShowCustomComp(true); setCompOpen(false); }}>
                      <Plus className="mr-2 h-4 w-4" />Add custom…
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {includedComponents.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {includedComponents.map((comp) => (
                <Badge key={comp} variant="secondary" className="text-xs pr-1 gap-1">
                  {comp}
                  <button type="button" onClick={() => onChange({ ...attrs, included_components: includedComponents.filter((c) => c !== comp) })} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {showCustomComp && (
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Enter component…"
                value={customCompVal} onChange={(e) => setCustomCompVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomComp(); } }}
                autoFocus />
              <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomComp}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                onClick={() => { setShowCustomComp(false); setCustomCompVal(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {sectionHeader("Construction")}
        {renderField("material_class", "Material Class")}
        <div /> {/* spacer */}

        {sectionHeader("Vendor / Make")}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Approved Makes <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></Label>
          <Popover open={makesOpen} onOpenChange={setMakesOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 w-full justify-between text-sm font-normal">
                {approvedMakes.length > 0 ? `${approvedMakes.length} make${approvedMakes.length > 1 ? "s" : ""} selected` : "Select approved makes…"}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {filteredMakes.map((opt) => (
                      <CommandItem key={opt} value={opt} onSelect={() => toggleMake(opt)}>
                        <Check className={cn("mr-2 h-4 w-4", approvedMakes.includes(opt) ? "opacity-100" : "opacity-0")} />
                        {opt}
                      </CommandItem>
                    ))}
                    <CommandItem value="__add_custom__" onSelect={() => { setShowCustomMake(true); setMakesOpen(false); }}>
                      <Plus className="mr-2 h-4 w-4" />Add custom make…
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {approvedMakes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {approvedMakes.map((make) => (
                <Badge key={make} variant="secondary" className="text-xs pr-1 gap-1">
                  {make}
                  <button type="button" onClick={() => onChange({ ...attrs, approved_makes: approvedMakes.filter((m) => m !== make) })} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {showCustomMake && (
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
                value={customMakeVal} onChange={(e) => setCustomMakeVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMake(); } }}
                autoFocus />
              <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomMake}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                onClick={() => { setShowCustomMake(false); setCustomMakeVal(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
            value={qty} onChange={(e) => onQtyChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Motor requirement builder ─────────────────────────────────────────────────
function buildMotorRequirement(attrs: Record<string, unknown>): string {
  const motorType    = (attrs.motor_type       as string)?.trim() || "";
  const power        = (attrs.power            as string)?.trim() || "";
  const voltage      = (attrs.voltage          as string)?.trim() || "";
  const speed        = (attrs.speed            as string)?.trim() || "";
  const effClass     = (attrs.efficiency_class as string)?.trim() || "";
  const cooling      = (attrs.cooling_type     as string)?.trim() || "";
  const mounting     = (attrs.mounting         as string)?.trim() || "";
  const ipRating     = (attrs.ip_rating        as string)?.trim() || "";

  // "Induction" → "Induction Motor", "Brake Motor" → "Brake Motor" (already has Motor)
  const motorLabel  = !motorType ? "" : motorType.endsWith("Motor") ? motorType : `${motorType} Motor`;
  const powerLabel  = power   ? `${power} kW`   : "";
  // "415 V" → "415V"
  const voltLabel   = voltage ? voltage.replace(" ", "") : "";
  const speedLabel  = speed   ? `${speed} RPM`  : "";
  // "Horizontal (B3)" → "Horizontal B3"
  const mountLabel  = mounting.replace(/[()]/g, "").replace(/\s+/g, " ").trim();

  const parts: string[] = [];
  if (motorLabel) parts.push(motorLabel);
  if (powerLabel) parts.push(powerLabel);
  if (voltLabel)  parts.push(voltLabel);
  if (speedLabel) parts.push(speedLabel);
  if (effClass)   parts.push(effClass);
  if (cooling)    parts.push(cooling);
  if (mountLabel) parts.push(mountLabel);
  if (ipRating)   parts.push(ipRating);
  return parts.join(", ");
}

// ── Motor option lists ────────────────────────────────────────────────────────
const MOTOR_OPTS: Record<string, string[]> = {
  motor_type:       ["Induction", "Brake Motor", "VFD Duty"],
  mounting:         ["Horizontal (B3)", "Vertical (V1)", "Flange Mounted (B5)", "Foot + Flange (B35)"],
  cooling_type:     ["TEFC", "ODP", "TENV"],
  power:            ["0.37", "0.75", "1.1", "2.2", "3.7", "5.5", "7.5", "11", "15", "22", "30"],
  voltage:          ["380 V", "400 V", "415 V", "440 V", "690 V"],
  frequency:        ["50 Hz", "60 Hz"],
  speed:            ["750", "1000", "1500", "3000"],
  duty:             ["S1 (Continuous)", "S2", "S3", "Intermittent", "Standby"],
  ip_rating:        ["IP55", "IP56", "IP65", "IP66"],
  efficiency_class: ["IE2", "IE3", "IE4"],
  vfd_compatible:   ["Yes", "No"],
  material:         ["Cast Iron", "Aluminium"],
};

const MOTOR_AREA_SAFE      = ["Safe Area"];
const MOTOR_AREA_HAZARDOUS = ["Zone 1", "Zone 2", "Hazardous Area"];

const MOTOR_MAKES = ["ABB", "Siemens", "WEG", "Crompton", "Kirloskar", "Bharat Bijlee", "Havells", "Leroy Somer", "TECO"];

// ── Motor structured form ─────────────────────────────────────────────────────
function MotorAttrsForm({
  attrs, qty, isFlameproof, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty: string;
  isFlameproof: boolean;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const areaOpts = isFlameproof ? MOTOR_AREA_HAZARDOUS : MOTOR_AREA_SAFE;

  const singleKeys = [...Object.keys(MOTOR_OPTS), "area_classification"];
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = key === "area_classification" ? areaOpts : (MOTOR_OPTS[key] ?? []);
      c[key] = val !== "" && !opts.includes(val);
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

  function renderField(key: string, label: string, opts: string[], required?: boolean) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  // ── Makes multi-select ──
  const [makesOpen, setMakesOpen] = useState(false);
  const [makesQuery, setMakesQuery] = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const [customMakeVal, setCustomMakeVal] = useState("");
  const approvedMakes = (attrs.approved_makes as string[]) ?? [];

  function toggleMake(make: string) {
    onChange({ ...attrs, approved_makes: approvedMakes.includes(make)
      ? approvedMakes.filter((m) => m !== make)
      : [...approvedMakes, make] });
  }
  function addCustomMake() {
    const t = customMakeVal.trim();
    if (t && !approvedMakes.includes(t)) onChange({ ...attrs, approved_makes: [...approvedMakes, t] });
    setCustomMakeVal(""); setShowCustomMake(false);
  }
  const filteredMakes = MOTOR_MAKES.filter((o) => o.toLowerCase().includes(makesQuery.toLowerCase()));

  function sectionHeader(label: string) {
    return (
      <div className="col-span-2 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {isFlameproof ? "Flameproof Motor Specifications" : "Motor Specifications"}
      </p>
      <div className="grid grid-cols-2 gap-3">

        {sectionHeader("Motor Specifications")}
        {renderField("motor_type",   "Motor Type", MOTOR_OPTS.motor_type,   true)}
        {renderField("mounting",     "Mounting",   MOTOR_OPTS.mounting          )}
        {renderField("cooling_type", "Cooling Type", MOTOR_OPTS.cooling_type    )}
        <div /> {/* spacer */}

        {sectionHeader("Electrical Data")}
        {renderField("power",     "Power (kW)",    MOTOR_OPTS.power    )}
        {renderField("voltage",   "Voltage",        MOTOR_OPTS.voltage  )}
        {/* Phase: Three Phase only — static display */}
        <div className="space-y-1.5">
          <Label className="text-xs">Phase</Label>
          <div className="h-8 flex items-center px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">Three Phase</div>
        </div>
        {renderField("frequency", "Frequency",      MOTOR_OPTS.frequency)}
        {renderField("speed",     "Speed (RPM)",    MOTOR_OPTS.speed    )}
        <div /> {/* spacer */}

        {sectionHeader("Operating Conditions")}
        {renderField("duty",             "Duty",               MOTOR_OPTS.duty            )}
        {renderField("area_classification", "Area Classification", areaOpts)}
        {renderField("ip_rating",        "IP Rating",          MOTOR_OPTS.ip_rating       )}
        {renderField("efficiency_class", "Efficiency Class",   MOTOR_OPTS.efficiency_class)}
        {renderField("vfd_compatible",   "VFD Compatible",     MOTOR_OPTS.vfd_compatible)}
        <div /> {/* spacer */}

        {sectionHeader("Construction")}
        {renderField("material", "Material", MOTOR_OPTS.material)}
        <div /> {/* spacer */}

        {sectionHeader("Vendor / Make")}
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Approved Makes <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></Label>
          <Popover open={makesOpen} onOpenChange={setMakesOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 w-full justify-between text-sm font-normal">
                {approvedMakes.length > 0 ? `${approvedMakes.length} make${approvedMakes.length > 1 ? "s" : ""} selected` : "Select approved makes…"}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {filteredMakes.map((opt) => (
                      <CommandItem key={opt} value={opt} onSelect={() => toggleMake(opt)}>
                        <Check className={cn("mr-2 h-4 w-4", approvedMakes.includes(opt) ? "opacity-100" : "opacity-0")} />
                        {opt}
                      </CommandItem>
                    ))}
                    <CommandItem value="__add_custom__" onSelect={() => { setShowCustomMake(true); setMakesOpen(false); }}>
                      <Plus className="mr-2 h-4 w-4" />Add custom make…
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {approvedMakes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {approvedMakes.map((make) => (
                <Badge key={make} variant="secondary" className="text-xs pr-1 gap-1">
                  {make}
                  <button type="button" onClick={() => onChange({ ...attrs, approved_makes: approvedMakes.filter((m) => m !== make) })} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {showCustomMake && (
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
                value={customMakeVal} onChange={(e) => setCustomMakeVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMake(); } }}
                autoFocus />
              <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomMake}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                onClick={() => { setShowCustomMake(false); setCustomMakeVal(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

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

  const [datasheetLine, setDatasheetLine] = useState<PackageLine | null>(null);

  // Save As (Clone) dialog state
  const [saveAsSource,  setSaveAsSource]  = useState<BuyPackage | null>(null);
  const [saveAsName,    setSaveAsName]    = useState("");
  const [saveAsTarget,  setSaveAsTarget]  = useState<string>("");

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
  const isBoughtOutMode =
    (lineDialog.lock?.subgroupCode === "general" && lineDialog.lock?.groupCode === "bought_out_packages") ||
    (selectedGroupCode === "bought_out_packages" && selectedSubgroupCode === "general");
  const isCoolingTowerMode =
    (lineDialog.lock?.subgroupCode === "cooling_tower") ||
    (selectedGroupCode === "bought_out_packages" && selectedSubgroupCode === "cooling_tower");
  const isJunctionBoxMode =
    (lineDialog.lock?.subgroupCode === "junction_box") ||
    (selectedGroupCode === "electrical_control" && selectedSubgroupCode === "junction_box");

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
      setSaveAsSource(null);
      setSaveAsName("");
      setSaveAsTarget("");
      invalidatePkgs();
      setStatusFilter("draft");
      setExpandedId(data.id);
      setTimeout(() => {
        document.getElementById(`pkg-row-${data.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 400);
    },
    onError: (e: any) => toast({ title: "Clone failed", description: e.message, variant: "destructive" }),
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
    } else if (isGearPumpMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.gear_type as string)?.trim()) {
        toast({ title: "Gear Type is required", variant: "destructive" }); return;
      }
    } else if (isScrewPumpMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.screw_type as string)?.trim()) {
        toast({ title: "Screw Type is required", variant: "destructive" }); return;
      }
    } else if (isMultistagePumpMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.multistage_type as string)?.trim()) {
        toast({ title: "Multistage Type is required", variant: "destructive" }); return;
      }
    } else if (isDosingPumpMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.pump_type as string)?.trim()) {
        toast({ title: "Pump Type is required", variant: "destructive" }); return;
      }
    } else if (isVacuumBoosterMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.booster_type as string)?.trim()) {
        toast({ title: "Booster Type is required", variant: "destructive" }); return;
      }
    } else if (isPumpSkidMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.package_type as string)?.trim()) {
        toast({ title: "Package Type is required", variant: "destructive" }); return;
      }
    } else if (isMotorMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.motor_type as string)?.trim()) {
        toast({ title: "Motor Type is required", variant: "destructive" }); return;
      }
    } else if (isPressureMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.instrument_type as string)?.trim()) {
        toast({ title: "Instrument Type is required", variant: "destructive" }); return;
      }
      const areaClass = (ta.area_classification as string)?.trim();
      if ((areaClass === "Zone 1" || areaClass === "Zone 2") && !(ta.certification as string)?.trim()) {
        toast({ title: "Certification is required for Zone 1 / Zone 2", variant: "destructive" }); return;
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
      const ta = lf.technicalAttributes;
      if (!(ta.valve_type as string)?.trim()) {
        toast({ title: "Safety Valve Type is required", variant: "destructive" }); return;
      }
      if (!(ta.inlet_size as string)?.trim()) {
        toast({ title: "Inlet Size is required", variant: "destructive" }); return;
      }
      if (!(ta.set_pressure as string)?.trim()) {
        toast({ title: "Set Pressure is required", variant: "destructive" }); return;
      }
    } else if (isControlValveMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.valve_type as string)?.trim()) {
        toast({ title: "Control Valve Type is required", variant: "destructive" }); return;
      }
      if (!(ta.valve_config as string)?.trim()) {
        toast({ title: "Valve Configuration is required", variant: "destructive" }); return;
      }
      if (!(ta.size_nb as string)?.trim()) {
        toast({ title: "Size (NB) is required", variant: "destructive" }); return;
      }
      if (!(ta.pressure_rating as string)?.trim()) {
        toast({ title: "Pressure Rating is required", variant: "destructive" }); return;
      }
      if (!(ta.actuator_type as string)?.trim()) {
        toast({ title: "Actuator Type is required", variant: "destructive" }); return;
      }
      if (!(ta.fail_action as string)?.trim()) {
        toast({ title: "Fail Action is required", variant: "destructive" }); return;
      }
    } else if (isIsolationValveMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.valve_type as string)?.trim()) {
        toast({ title: "Valve Type is required", variant: "destructive" }); return;
      }
      if (!(ta.size_nb as string)?.trim()) {
        toast({ title: "Size (NB) is required", variant: "destructive" }); return;
      }
      if (!(ta.pressure_rating as string)?.trim()) {
        toast({ title: "Pressure Rating is required", variant: "destructive" }); return;
      }
    } else if (isOnOffValveMode) {
      const ta = lf.technicalAttributes;
      if (!(ta.valve_type as string)?.trim()) {
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
      if (OO_ACTUATED.includes(act) && !(ta.fail_action as string)?.trim()) {
        toast({ title: "Fail Action is required for actuated valves", variant: "destructive" }); return;
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
                            {canWrite && (
                              <Button
                                variant="ghost" size="sm"
                                title="Save As (Clone to another product)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSaveAsSource(pkg);
                                  setSaveAsName("");
                                  setSaveAsTarget("");
                                }}
                              >
                                <Copy className="h-4 w-4" />
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Gear Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Screw Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Multistage Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Pump Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Booster Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Package Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Motor Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Instrument Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Instrument Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Instrument Type and Line Size to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Instrument Type to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Select JB Type and fill dimensions to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Enter temperatures and flow to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Select Package Type and Capacity to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Cable Type and Size to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Panel Type and Voltage to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Valve Type, Inlet Size and Set Pressure to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Valve Type, Size and Actuator to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Select Valve Type, Size and Actuation to generate…"} />
                  </div>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Generic Requirement <span className="text-[10px] font-normal">(auto-generated)</span>
                    </Label>
                    <Input readOnly className="h-9 text-sm bg-muted/50 text-muted-foreground cursor-default"
                      value={lf.genericRequirement || "Fill Valve Type, Size and Rating to generate…"} />
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

              {/* Process & Design Conditions — valve modes */}
              {(isIsolationValveMode || isControlValveMode || isSafetyValveMode || isOnOffValveMode) && (
                <ProcessDesignConditionsBlock
                  attrs={lf.technicalAttributes}
                  onChange={(a) => setLf((f) => ({ ...f, technicalAttributes: a }))}
                />
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

      {/* Datasheet Preview Dialog */}
      <DatasheetPreviewDialog
        line={datasheetLine}
        open={datasheetLine !== null}
        onClose={() => setDatasheetLine(null)}
      />

      {/* ── Save As (Clone) Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!saveAsSource} onOpenChange={(o) => { if (!o) { setSaveAsSource(null); setSaveAsName(""); setSaveAsTarget(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Save As — Clone Package</DialogTitle>
            <DialogDescription>
              Clone this package as a new draft on a different top-level product.
              All lines will be deep-copied. One active package per top-level product is allowed.
            </DialogDescription>
          </DialogHeader>

          {saveAsSource && (
            <div className="space-y-5 pt-1">

              {/* Source Package — read-only */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source Package</label>
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-mono">
                  {saveAsSource.packageCode} — {saveAsSource.name}
                </div>
              </div>

              {/* Source Grandparent Product — read-only */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source Product</label>
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {saveAsSource.productCode} · {saveAsSource.productDescription}
                </div>
              </div>

              {/* Target Grandparent Product — required searchable dropdown */}
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide">
                  Target Product <span className="text-destructive">*</span>
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={saveAsTarget}
                  onChange={(e) => setSaveAsTarget(e.target.value)}
                >
                  <option value="">Select target product…</option>
                  {buyProducts
                    .filter((p) => p.id !== saveAsSource.productId)
                    .sort((a, b) => a.productCode.localeCompare(b.productCode))
                    .map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.productCode}
                      </option>
                    ))}
                </select>
                {saveAsTarget && (() => {
                  const prod = buyProducts.find((p) => String(p.id) === saveAsTarget);
                  return prod ? (
                    <p className="text-xs text-muted-foreground pt-0.5 pl-1">{prod.description ?? prod.productDescription}</p>
                  ) : null;
                })()}
              </div>

              {/* Optional Draft Name Override */}
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide">
                  Draft Name <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={`${saveAsSource.name} - Draft`}
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  maxLength={200}
                />
              </div>

            </div>
          )}

          <DialogFooter className="pt-4">
            <Button
              variant="outline"
              onClick={() => { setSaveAsSource(null); setSaveAsName(""); setSaveAsTarget(""); }}
            >
              Cancel
            </Button>
            <Button
              disabled={!saveAsTarget || clonePkg.isPending}
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
              {clonePkg.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Cloning…</> : "Clone Package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}
