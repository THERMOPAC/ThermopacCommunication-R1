import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import { ChevronUp, ChevronDown, X, Plus, ChevronsUpDown, Check } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Shared SearchableSelect
// ─────────────────────────────────────────────────────────────────────────────
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
        <Button variant="outline" role="combobox"
          className="h-8 text-sm justify-between font-normal w-full overflow-hidden">
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
                <CommandItem key={opt} value={opt}
                  onSelect={() => { onSelectProp(opt); setOpen(false); }}>
                  <Check className={`mr-2 h-3.5 w-3.5 ${value === opt ? "opacity-100" : "opacity-0"}`} />
                  {opt}
                </CommandItem>
              ))}
              <CommandItem key="__other__" value="Other…"
                onSelect={() => { onSelectProp("__other__"); setOpen(false); }}>
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

// ─────────────────────────────────────────────────────────────────────────────
// CENTRIFUGAL PUMP
// ─────────────────────────────────────────────────────────────────────────────
const CENTRIFUGAL_PUMP_TYPES = [
  "End Suction","Split Case","Multistage","Vertical Inline","Vertical Turbine",
];
const CENTRIFUGAL_COMMON_OPTS = {
  mounting:              ["Base Mounted","Skid Mounted","Inline","Sump"],
  drive_type:            ["Motor Driven","Engine Driven","Variable Speed Drive (VSD)"],
  service_type:          ["Continuous","Intermittent","Standby","Duty-Standby"],
  seal_type:             ["Single Mechanical Seal","Double Mechanical Seal","Cartridge Seal (Back-to-Back)","Gland Packing"],
  material_class:        ["CI","CS","SS304","SS316","Duplex SS","CD4MCu","Super Duplex"],
  flow_rate:             ["1 m³/hr","2 m³/hr","5 m³/hr","10 m³/hr","20 m³/hr","30 m³/hr","50 m³/hr",
                          "75 m³/hr","100 m³/hr","150 m³/hr","200 m³/hr","300 m³/hr","500 m³/hr",
                          "750 m³/hr","1000 m³/hr","1500 m³/hr","2000 m³/hr"],
  head:                  ["5 m","10 m","20 m","30 m","40 m","50 m","75 m","100 m","150 m","200 m",
                          "250 m","300 m","400 m","500 m","600 m"],
  fluid:                 ["Water","Hot Water","Cooling Water","Oil","Chemical","Slurry","Effluent","Hydrocarbons","Acid","Alkali"],
  operating_temp:        ["Ambient","50°C","80°C","100°C","120°C","150°C","200°C","250°C"],
  area_class:            ["Safe Area","Zone 1","Zone 2"],
  certification:         ["ATEX","IECEx","PESO"],
  speed_rpm:             ["960 RPM","1450 RPM","1750 RPM","2900 RPM","2950 RPM","3500 RPM","Variable"],
  motor_power_kw:        ["1.5 kW","2.2 kW","3.7 kW","5.5 kW","7.5 kW","11 kW","15 kW","18.5 kW",
                          "22 kW","30 kW","37 kW","45 kW","55 kW","75 kW","90 kW","110 kW",
                          "132 kW","160 kW","200 kW","250 kW","315 kW","400 kW"],
  spare_parts:           ["Seal + Bearing Kit","Full Rotating Element","Impeller Only","None"],
  api_610:               ["OH1","OH2","OH3","OH4","OH5","BB1","BB2","BB3","BB4","BB5",
                          "VS1","VS2","VS3","VS4","VS5","VS6","VS7","Non-API"],
  yes_no:                ["Yes","No"],
  casing_type:           ["Back Pull-Out (BPO)","Close-Coupled","Monobloc"],
  impeller_type:         ["Open","Semi-Open","Closed"],
  coupling_type:         ["Flexible Coupling","Direct Drive","V-Belt","Spacer Coupling"],
  impeller_type_sc:      ["Double Suction","Single Suction"],
  orientation:           ["Horizontal","Vertical"],
  coupling_type_sc:      ["Flexible Coupling","Spacer Coupling","Direct Drive"],
  num_stages:            ["2","3","4","5","6","7","8","9","10+"],
  balance_method:        ["Hydraulic Balancing Disc","Back-to-Back Staging","Balance Drum"],
  coupling_type_ms:      ["Flexible Coupling","Spacer Coupling","Direct Drive"],
  num_bowl_stages:       ["1","2","3","4","5","6+"],
  column_length:         ["1 m","2 m","3 m","4 m","5 m","6 m","7 m","8 m","10 m","12 m","Custom"],
  discharge_head_type:   ["Open Discharge Head","Enclosed Discharge Head","Elbow Head"],
  lineshaft_lubrication: ["Water Lubricated","Oil Lubricated","Grease Lubricated"],
  bowl_diameter:         ["4\"","6\"","8\"","10\"","12\"","14\""],
  motor_platform:        ["Standard","Extended"],
  coupling_type_vi:      ["Close-Coupled","Flexible Coupling"],
};
const CENTRIFUGAL_ALL_FIELD_OPTS: Record<string, string[]> = {
  pump_type:             CENTRIFUGAL_PUMP_TYPES,
  mounting:              CENTRIFUGAL_COMMON_OPTS.mounting,
  drive_type:            CENTRIFUGAL_COMMON_OPTS.drive_type,
  service_type:          CENTRIFUGAL_COMMON_OPTS.service_type,
  seal_type:             CENTRIFUGAL_COMMON_OPTS.seal_type,
  material_class:        CENTRIFUGAL_COMMON_OPTS.material_class,
  flow_rate:             CENTRIFUGAL_COMMON_OPTS.flow_rate,
  head:                  CENTRIFUGAL_COMMON_OPTS.head,
  fluid:                 CENTRIFUGAL_COMMON_OPTS.fluid,
  operating_temp:        CENTRIFUGAL_COMMON_OPTS.operating_temp,
  area_classification:   CENTRIFUGAL_COMMON_OPTS.area_class,
  certification:         CENTRIFUGAL_COMMON_OPTS.certification,
  speed_rpm:             CENTRIFUGAL_COMMON_OPTS.speed_rpm,
  motor_power_kw:        CENTRIFUGAL_COMMON_OPTS.motor_power_kw,
  spare_parts:           CENTRIFUGAL_COMMON_OPTS.spare_parts,
  api_610_category:      CENTRIFUGAL_COMMON_OPTS.api_610,
  strainer_fitted:       CENTRIFUGAL_COMMON_OPTS.yes_no,
  casing_type:           CENTRIFUGAL_COMMON_OPTS.casing_type,
  impeller_type:         CENTRIFUGAL_COMMON_OPTS.impeller_type,
  coupling_type:         CENTRIFUGAL_COMMON_OPTS.coupling_type,
  impeller_type_sc:      CENTRIFUGAL_COMMON_OPTS.impeller_type_sc,
  orientation:           CENTRIFUGAL_COMMON_OPTS.orientation,
  coupling_type_sc:      CENTRIFUGAL_COMMON_OPTS.coupling_type_sc,
  num_stages:            CENTRIFUGAL_COMMON_OPTS.num_stages,
  balance_method:        CENTRIFUGAL_COMMON_OPTS.balance_method,
  coupling_type_ms:      CENTRIFUGAL_COMMON_OPTS.coupling_type_ms,
  orientation_ms:        CENTRIFUGAL_COMMON_OPTS.orientation,
  coupling_type_vi:      CENTRIFUGAL_COMMON_OPTS.coupling_type_vi,
  num_bowl_stages:       CENTRIFUGAL_COMMON_OPTS.num_bowl_stages,
  column_length:         CENTRIFUGAL_COMMON_OPTS.column_length,
  discharge_head_type:   CENTRIFUGAL_COMMON_OPTS.discharge_head_type,
  lineshaft_lubrication: CENTRIFUGAL_COMMON_OPTS.lineshaft_lubrication,
  bowl_diameter:         CENTRIFUGAL_COMMON_OPTS.bowl_diameter,
  motor_platform:        CENTRIFUGAL_COMMON_OPTS.motor_platform,
};
const PUMP_MAKES = ["KSB","Grundfos","SPX Flow","Flowserve","Sulzer","Kirloskar","WILO","CNP","ITT","Armstrong"];
const PUMP_SERIES_BY_MAKE: Record<string, string[]> = {
  "KSB":       ["Etanorm","MegaCPK","Omega","Movitec"],
  "Grundfos":  ["CR","NK","CM","TP","S"],
  "SPX Flow":  ["W+","SIHI","Bran+Luebbe"],
  "Flowserve": ["Mark 3","Durco","Worthington"],
  "Sulzer":    ["A Series","B Series","CPT"],
  "Kirloskar": ["GD","HOSC","DB"],
  "WILO":      ["Economy","Stratos","Helix"],
  "ITT":       ["Goulds 3196","Goulds 3410"],
  "Armstrong": ["4300","4380","S-Series"],
};

function buildCentrifugalPumpDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    pump_type: type, approved_makes: [], preferred_series: "",
    mounting: "Base Mounted", drive_type: "Motor Driven",
    service_type: "Continuous", seal_type: "Single Mechanical Seal",
    material_class: "CI", flow_rate: "", head: "", fluid: "",
    operating_temp: "", motor_power_kw: "", speed_rpm: "", npsha: "",
    api_610_category: "", area_classification: "", certification: "", spare_parts: "",
    casing_type: "", impeller_type: "", coupling_type: "",
    impeller_type_sc: "", orientation: "", coupling_type_sc: "",
    num_stages: "", balance_method: "", coupling_type_ms: "", orientation_ms: "",
    coupling_type_vi: "",
    num_bowl_stages: "", column_length: "", discharge_head_type: "",
    lineshaft_lubrication: "", bowl_diameter: "", strainer_fitted: "", motor_platform: "",
  };
  switch (type) {
    case "End Suction":
      return { ...base, casing_type: "Back Pull-Out (BPO)", impeller_type: "Closed", coupling_type: "Flexible Coupling" };
    case "Split Case":
      return { ...base, impeller_type_sc: "Double Suction", orientation: "Horizontal", coupling_type_sc: "Flexible Coupling" };
    case "Multistage":
      return { ...base, num_stages: "3", impeller_type: "Closed", coupling_type_ms: "Flexible Coupling" };
    case "Vertical Inline":
      return { ...base, mounting: "Inline", impeller_type: "Closed", coupling_type_vi: "Close-Coupled" };
    case "Vertical Turbine":
      return { ...base, mounting: "Sump", num_bowl_stages: "2", column_length: "3 m",
        discharge_head_type: "Open Discharge Head", lineshaft_lubrication: "Water Lubricated" };
    default: return base;
  }
}

export function buildCentrifugalPumpRequirement(attrs: Record<string, unknown>): string {
  const pumpType = (attrs.pump_type as string)?.trim() || "";
  const flowRate = (attrs.flow_rate as string)?.trim() || "";
  const head     = (attrs.head as string)?.trim() || "";
  const matClass = (attrs.material_class as string)?.trim() || "";
  const typeLC   = pumpType.toLowerCase();
  let typeSpec = "";
  if (typeLC.includes("end suction")) {
    const casing = (attrs.casing_type as string)?.trim() || "";
    const imp    = (attrs.impeller_type as string)?.trim() || "";
    const p2: string[] = [];
    if (casing) p2.push(casing);
    if (imp)    p2.push(`${imp} Impeller`);
    typeSpec = p2.join(", ");
  } else if (typeLC.includes("split case")) {
    const orient = (attrs.orientation as string)?.trim() || "";
    const imp    = (attrs.impeller_type_sc as string)?.trim() || "";
    const p2: string[] = [];
    if (orient) p2.push(orient);
    if (imp)    p2.push(`${imp} Impeller`);
    typeSpec = p2.join(", ");
  } else if (typeLC.includes("multistage")) {
    const stages = (attrs.num_stages as string)?.trim() || "";
    const imp    = (attrs.impeller_type as string)?.trim() || "";
    const p2: string[] = [];
    if (stages) p2.push(`${stages}-Stage`);
    if (imp)    p2.push(`${imp} Impeller`);
    typeSpec = p2.join(", ");
  } else if (typeLC.includes("vertical turbine")) {
    const stages = (attrs.num_bowl_stages as string)?.trim() || "";
    const col    = (attrs.column_length as string)?.trim() || "";
    const p2: string[] = [];
    if (stages) p2.push(`${stages}-Bowl`);
    if (col)    p2.push(`${col} Column`);
    typeSpec = p2.join(", ");
  } else if (typeLC.includes("vertical inline")) {
    const imp = (attrs.impeller_type as string)?.trim() || "";
    if (imp) typeSpec = `${imp} Impeller`;
  }
  const parts: string[] = ["Centrifugal Pump"];
  if (pumpType) parts.push(pumpType);
  if (typeSpec) parts.push(typeSpec);
  const opCond: string[] = [];
  if (flowRate) opCond.push(flowRate);
  if (head)     opCond.push(`${head} TDH`);
  if (opCond.length === 2) parts.push(opCond.join(" @ "));
  else if (opCond.length === 1) parts.push(opCond[0]);
  if (matClass) parts.push(matClass);
  return parts.join(", ");
}

export function CentrifugalPumpAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(CENTRIFUGAL_ALL_FIELD_OPTS)) {
      if (opts.length === 0) continue;
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const [makeSearch, setMakeSearch] = useState("");
  const [makes, setMakes] = useState<string[]>(() => {
    const m = attrs.approved_makes;
    return Array.isArray(m) ? (m as string[]) : [];
  });

  function handleTypeChange(type: string) {
    const defaults = buildCentrifugalPumpDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(CENTRIFUGAL_ALL_FIELD_OPTS)) {
      if (opts.length === 0) continue;
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); setMakes([]); onChange({ ...defaults, approved_makes: [] });
  }
  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom((c) => ({ ...c, [key]: true })); onChange({ ...attrs, [key]: "" }); }
    else { setCustom((c) => ({ ...c, [key]: false })); onChange({ ...attrs, [key]: val }); }
  }
  function set(key: string, val: unknown) { onChange({ ...attrs, [key]: val }); }

  function renderField(key: string, label: string, opts: string[], required?: boolean) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }
  function renderFreeText(key: string, label: string, placeholder?: string) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <Input className="h-8 text-sm" placeholder={placeholder ?? `Enter ${label}…`}
          value={(attrs[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} />
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
  function addMake(make: string) {
    const t = make.trim(); if (!t || makes.includes(t)) return;
    const next = [...makes, t]; setMakes(next); onChange({ ...attrs, approved_makes: next }); setMakeSearch("");
  }
  function removeMake(m: string) { const next = makes.filter((x) => x !== m); setMakes(next); onChange({ ...attrs, approved_makes: next }); }
  function moveMake(i: number, dir: -1 | 1) {
    const next = [...makes]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]]; setMakes(next); onChange({ ...attrs, approved_makes: next });
  }

  const pumpType      = (attrs.pump_type as string) ?? "";
  const isEndSuction  = pumpType === "End Suction";
  const isSplitCase   = pumpType === "Split Case";
  const isMultistage  = pumpType === "Multistage";
  const isVertInline  = pumpType === "Vertical Inline";
  const isVertTurbine = pumpType === "Vertical Turbine";
  const hasType = isEndSuction || isSplitCase || isMultistage || isVertInline || isVertTurbine;
  const seriesOpts      = Array.from(new Set(makes.flatMap((m) => PUMP_SERIES_BY_MAKE[m] ?? [])));
  const preferredSeries = (attrs.preferred_series as string) ?? "";
  const isSeriesCustom  = custom["preferred_series"] ?? false;
  const seriesSelectVal = isSeriesCustom ? "__other__" : (seriesOpts.includes(preferredSeries) ? preferredSeries : "");
  const filteredMakes   = PUMP_MAKES.filter((m) => m.toLowerCase().includes(makeSearch.toLowerCase()) && !makes.includes(m));

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Centrifugal Pump Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {sec("Pump Type")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Pump Type <span className="text-red-500">*</span></Label>
          <SearchableSelect value={CENTRIFUGAL_PUMP_TYPES.includes(pumpType) ? pumpType : ""}
            options={CENTRIFUGAL_PUMP_TYPES} placeholder="Select pump type first…"
            onSelect={(v) => handleTypeChange(v)} />
        </div>
        {!hasType && (
          <div className="col-span-2 rounded-md border border-dashed bg-muted/20 py-6 text-center text-xs text-muted-foreground">
            Select a pump type above to configure specifications
          </div>
        )}
        {isEndSuction && (<>
          {sec("End Suction Configuration")}
          {renderField("casing_type",    "Casing Type",       CENTRIFUGAL_COMMON_OPTS.casing_type,   true)}
          {renderField("impeller_type",  "Impeller Type",     CENTRIFUGAL_COMMON_OPTS.impeller_type, true)}
          {renderField("coupling_type",  "Coupling Type",     CENTRIFUGAL_COMMON_OPTS.coupling_type, true)}
          {renderField("api_610_category","API 610 Category", CENTRIFUGAL_COMMON_OPTS.api_610)}
          {renderField("speed_rpm",      "Speed (RPM)",       CENTRIFUGAL_COMMON_OPTS.speed_rpm)}
          {renderFreeText("npsha",       "NPSHa (m)",         "e.g. 4.5 m")}
          {renderField("motor_power_kw", "Motor Power (kW)",  CENTRIFUGAL_COMMON_OPTS.motor_power_kw)}
          <div />
        </>)}
        {isSplitCase && (<>
          {sec("Split Case Configuration")}
          {renderField("impeller_type_sc","Impeller Type",    CENTRIFUGAL_COMMON_OPTS.impeller_type_sc, true)}
          {renderField("orientation",    "Orientation",       CENTRIFUGAL_COMMON_OPTS.orientation,     true)}
          {renderField("coupling_type_sc","Coupling Type",    CENTRIFUGAL_COMMON_OPTS.coupling_type_sc,true)}
          {renderField("api_610_category","API 610 Category", CENTRIFUGAL_COMMON_OPTS.api_610)}
          {renderField("speed_rpm",      "Speed (RPM)",       CENTRIFUGAL_COMMON_OPTS.speed_rpm)}
          {renderFreeText("npsha",       "NPSHa (m)",         "e.g. 4.5 m")}
          {renderField("motor_power_kw", "Motor Power (kW)",  CENTRIFUGAL_COMMON_OPTS.motor_power_kw)}
          <div />
        </>)}
        {isMultistage && (<>
          {sec("Multistage Configuration")}
          {renderField("num_stages",     "Number of Stages",  CENTRIFUGAL_COMMON_OPTS.num_stages,     true)}
          {renderField("impeller_type",  "Impeller Type",     CENTRIFUGAL_COMMON_OPTS.impeller_type,  true)}
          {renderField("coupling_type_ms","Coupling Type",    CENTRIFUGAL_COMMON_OPTS.coupling_type_ms,true)}
          {renderField("orientation_ms", "Orientation",       CENTRIFUGAL_COMMON_OPTS.orientation)}
          {renderField("balance_method", "Balancing Method",  CENTRIFUGAL_COMMON_OPTS.balance_method)}
          {renderField("api_610_category","API 610 Category", CENTRIFUGAL_COMMON_OPTS.api_610)}
          {renderField("speed_rpm",      "Speed (RPM)",       CENTRIFUGAL_COMMON_OPTS.speed_rpm)}
          {renderField("motor_power_kw", "Motor Power (kW)",  CENTRIFUGAL_COMMON_OPTS.motor_power_kw)}
        </>)}
        {isVertInline && (<>
          {sec("Vertical Inline Configuration")}
          {renderField("impeller_type",  "Impeller Type",     CENTRIFUGAL_COMMON_OPTS.impeller_type,   true)}
          {renderField("coupling_type_vi","Coupling Type",    CENTRIFUGAL_COMMON_OPTS.coupling_type_vi,true)}
          {renderField("api_610_category","API 610 Category", CENTRIFUGAL_COMMON_OPTS.api_610)}
          {renderField("speed_rpm",      "Speed (RPM)",       CENTRIFUGAL_COMMON_OPTS.speed_rpm)}
          {renderField("motor_power_kw", "Motor Power (kW)",  CENTRIFUGAL_COMMON_OPTS.motor_power_kw)}
          <div />
        </>)}
        {isVertTurbine && (<>
          {sec("Vertical Turbine Configuration")}
          {renderField("num_bowl_stages",      "No. of Bowl Stages",    CENTRIFUGAL_COMMON_OPTS.num_bowl_stages,         true)}
          {renderField("column_length",        "Column Length",          CENTRIFUGAL_COMMON_OPTS.column_length,           true)}
          {renderField("discharge_head_type",  "Discharge Head Type",    CENTRIFUGAL_COMMON_OPTS.discharge_head_type,     true)}
          {renderField("lineshaft_lubrication","Lineshaft Lubrication",  CENTRIFUGAL_COMMON_OPTS.lineshaft_lubrication,   true)}
          {renderField("bowl_diameter",        "Bowl Diameter",          CENTRIFUGAL_COMMON_OPTS.bowl_diameter)}
          {renderField("api_610_category",     "API 610 Category",       CENTRIFUGAL_COMMON_OPTS.api_610)}
          {renderField("strainer_fitted",      "Strainer Fitted",        CENTRIFUGAL_COMMON_OPTS.yes_no)}
          {renderField("motor_platform",       "Motor Platform",         CENTRIFUGAL_COMMON_OPTS.motor_platform)}
          {renderField("motor_power_kw",       "Motor Power (kW)",       CENTRIFUGAL_COMMON_OPTS.motor_power_kw)}
          <div />
        </>)}
        {hasType && (<>
          {sec("Operating Conditions")}
          {renderField("flow_rate",      "Flow Rate",         CENTRIFUGAL_COMMON_OPTS.flow_rate,      true)}
          {renderField("head",           "Head / TDH",        CENTRIFUGAL_COMMON_OPTS.head,           true)}
          {renderField("fluid",          "Fluid",             CENTRIFUGAL_COMMON_OPTS.fluid,          true)}
          {renderField("operating_temp", "Operating Temp",    CENTRIFUGAL_COMMON_OPTS.operating_temp)}
          {sec("Pump Configuration")}
          {renderField("mounting",       "Mounting",          CENTRIFUGAL_COMMON_OPTS.mounting,       true)}
          {renderField("drive_type",     "Drive Type",        CENTRIFUGAL_COMMON_OPTS.drive_type,     true)}
          {renderField("service_type",   "Service Type",      CENTRIFUGAL_COMMON_OPTS.service_type,   true)}
          {renderField("seal_type",      "Seal Type",         CENTRIFUGAL_COMMON_OPTS.seal_type,      true)}
          {renderField("material_class", "Material Class",    CENTRIFUGAL_COMMON_OPTS.material_class, true)}
          <div />
          {sec("Optional — Area & Spares")}
          {renderField("area_classification","Area Classification", CENTRIFUGAL_COMMON_OPTS.area_class)}
          {renderField("certification",  "Certification",     CENTRIFUGAL_COMMON_OPTS.certification)}
          {renderField("spare_parts",    "Spare Parts Package",CENTRIFUGAL_COMMON_OPTS.spare_parts)}
          <div />
          <div className="col-span-2 mt-1 pb-0.5 border-b">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Approved Makes (ranked) <span className="text-red-500">*</span>
            </p>
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Search or type make…"
                value={makeSearch} onChange={(e) => setMakeSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && makeSearch.trim()) addMake(makeSearch); }} />
              <Button type="button" size="sm" className="h-8" onClick={() => { if (makeSearch.trim()) addMake(makeSearch); }}>Add</Button>
            </div>
            {makeSearch && filteredMakes.length > 0 && (
              <div className="rounded-md border bg-background shadow-sm max-h-32 overflow-y-auto">
                {filteredMakes.map((m) => (
                  <button key={m} type="button" className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted" onClick={() => addMake(m)}>{m}</button>
                ))}
              </div>
            )}
            {makes.length > 0 && (
              <div className="space-y-1">
                {makes.map((m, i) => (
                  <div key={m} className="flex items-center gap-2 rounded-md border px-2 py-1 bg-background">
                    <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}.</span>
                    <span className="flex-1 text-xs">{m}</span>
                    <button type="button" onClick={() => moveMake(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                    <button type="button" onClick={() => moveMake(i, 1)} disabled={i === makes.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                    <button type="button" onClick={() => removeMake(m)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {seriesOpts.length > 0 && (
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Preferred Series <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></Label>
              <SearchableSelect value={seriesSelectVal} options={seriesOpts} placeholder="Select series…"
                onSelect={(v) => {
                  if (v === "__other__") { setCustom((c) => ({ ...c, preferred_series: true })); set("preferred_series", ""); }
                  else { setCustom((c) => ({ ...c, preferred_series: false })); set("preferred_series", v); }
                }} />
              {isSeriesCustom && (
                <Input className="h-8 text-sm" placeholder="Enter custom series…"
                  value={preferredSeries} onChange={(e) => set("preferred_series", e.target.value)} autoFocus />
              )}
            </div>
          )}
        </>)}
        {qty !== undefined && onQtyChange && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
              value={qty} onChange={(e) => onQtyChange(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GEAR PUMP
// ─────────────────────────────────────────────────────────────────────────────
const GEAR_PUMP_TYPES = [
  "External Gear","Internal Gear (Crescent)","Helical Gear","Bi-Helical / Herringbone",
];
const GEAR_COMMON_OPTS = {
  mounting:            ["Base Mounted","Skid Mounted","Vertical","Close-Coupled"],
  drive_type:          ["Motor Driven","Engine Driven","Variable Speed Drive (VSD)"],
  service_type:        ["Continuous","Intermittent","Standby","Duty-Standby"],
  flow_rate:           ["0.1 m³/hr","0.2 m³/hr","0.5 m³/hr","1 m³/hr","2 m³/hr","5 m³/hr",
                        "10 m³/hr","15 m³/hr","20 m³/hr","30 m³/hr","50 m³/hr",
                        "75 m³/hr","100 m³/hr","150 m³/hr","200 m³/hr"],
  diff_pressure:       ["2 bar","5 bar","8 bar","10 bar","15 bar","20 bar","25 bar","30 bar","40 bar","50 bar"],
  fluid:               ["Fuel Oil","Lube Oil","Thermal Oil","Bitumen","Asphalt","Chemical",
                        "Resin","Molasses","Crude Oil","Water","Other"],
  operating_temp:      ["Ambient","60°C","80°C","100°C","120°C","150°C","200°C","250°C","300°C"],
  material_class:      ["CI","CS","SS304","SS316","Alloy Steel","Hastelloy"],
  seal_type:           ["Mechanical Seal","Gland Packing","Magnetic Drive","Lip Seal"],
  yes_no:              ["Yes","No"],
  heating_medium:      ["Steam","Hot Water","Thermal Oil"],
  api_676:             ["API 676","Non-API"],
  area_class:          ["Safe Area","Zone 1","Zone 2"],
  certification:       ["ATEX","IECEx","PESO"],
  speed_rpm:           ["960 RPM","1450 RPM","1750 RPM","2900 RPM","Variable"],
  motor_power_kw:      ["0.37 kW","0.55 kW","0.75 kW","1.1 kW","1.5 kW","2.2 kW","3.7 kW",
                        "5.5 kW","7.5 kW","11 kW","15 kW","18.5 kW","22 kW","30 kW","37 kW","45 kW","55 kW","75 kW"],
  spare_parts:         ["Seal Kit","Full Rotating Element","None"],
  port_conn:           ["Flanged","NPT","BSP","DIN"],
  gear_material:       ["Cast Iron","Carbon Steel","SS304","SS316","Bronze","Alloy Steel"],
  crescent_type:       ["Fixed Crescent","Adjustable Crescent"],
  idler_pin_type:      ["Fixed Pin","Floating Pin"],
  helix_angle:         ["15°","20°","30°","Custom"],
  noise_class:         ["Standard","Low Noise","Silent"],
  bearing_type:        ["Sleeve","Rolling Element","Hydrodynamic"],
  lube_system:         ["Self-Lubricated","Forced Lubrication"],
};
const GEAR_ALL_FIELD_OPTS: Record<string, string[]> = {
  gear_type:            GEAR_PUMP_TYPES,
  mounting:             GEAR_COMMON_OPTS.mounting,
  drive_type:           GEAR_COMMON_OPTS.drive_type,
  service_type:         GEAR_COMMON_OPTS.service_type,
  flow_rate:            GEAR_COMMON_OPTS.flow_rate,
  diff_pressure:        GEAR_COMMON_OPTS.diff_pressure,
  fluid:                GEAR_COMMON_OPTS.fluid,
  operating_temp:       GEAR_COMMON_OPTS.operating_temp,
  material_class:       GEAR_COMMON_OPTS.material_class,
  seal_type:            GEAR_COMMON_OPTS.seal_type,
  heating_jacket:       GEAR_COMMON_OPTS.yes_no,
  heating_medium:       GEAR_COMMON_OPTS.heating_medium,
  insulation:           GEAR_COMMON_OPTS.yes_no,
  builtin_relief_valve: GEAR_COMMON_OPTS.yes_no,
  api_standard:         GEAR_COMMON_OPTS.api_676,
  area_classification:  GEAR_COMMON_OPTS.area_class,
  certification:        GEAR_COMMON_OPTS.certification,
  speed_rpm:            GEAR_COMMON_OPTS.speed_rpm,
  motor_power_kw:       GEAR_COMMON_OPTS.motor_power_kw,
  spare_parts:          GEAR_COMMON_OPTS.spare_parts,
  port_connection:      GEAR_COMMON_OPTS.port_conn,
  gear_material:        GEAR_COMMON_OPTS.gear_material,
  crescent_type:        GEAR_COMMON_OPTS.crescent_type,
  idler_pin_type:       GEAR_COMMON_OPTS.idler_pin_type,
  helix_angle:          GEAR_COMMON_OPTS.helix_angle,
  noise_class:          GEAR_COMMON_OPTS.noise_class,
  bearing_type:         GEAR_COMMON_OPTS.bearing_type,
  lube_system:          GEAR_COMMON_OPTS.lube_system,
};
const GEAR_PUMP_MAKES = [
  "Viking Pump","Varisco","SPX Flow","Roper Pump","Tuthill","Leistritz",
  "Maag","Bosch Rexroth","Colfax","Gorman-Rupp","IMO Pump","Desmi",
];

function buildGearPumpDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    gear_type: type, approved_makes: [],
    mounting: "Base Mounted", drive_type: "Motor Driven",
    service_type: "Continuous", flow_rate: "", diff_pressure: "",
    fluid: "", operating_temp: "", material_class: "CI", seal_type: "Mechanical Seal",
    heating_jacket: "No", heating_medium: "", insulation: "No",
    builtin_relief_valve: "No", relief_pressure_setting: "",
    api_standard: "", area_classification: "", certification: "",
    speed_rpm: "", motor_power_kw: "", spare_parts: "",
    port_connection: "", port_size: "", gear_material: "",
    crescent_type: "", idler_pin_type: "",
    helix_angle: "", noise_class: "",
    bearing_type: "", lube_system: "", max_diff_pressure: "",
  };
  switch (type) {
    case "External Gear":
      return { ...base, gear_material: "Cast Iron", builtin_relief_valve: "Yes" };
    case "Internal Gear (Crescent)":
      return { ...base, gear_material: "Cast Iron", crescent_type: "Fixed Crescent",
        idler_pin_type: "Fixed Pin", heating_jacket: "Yes", heating_medium: "Steam" };
    case "Helical Gear":
      return { ...base, gear_material: "Carbon Steel", noise_class: "Standard", builtin_relief_valve: "Yes" };
    case "Bi-Helical / Herringbone":
      return { ...base, gear_material: "Alloy Steel", bearing_type: "Sleeve", lube_system: "Self-Lubricated" };
    default: return base;
  }
}

export function buildGearPumpRequirement(attrs: Record<string, unknown>): string {
  const gearType = (attrs.gear_type as string)?.trim() || "";
  const flowRate = (attrs.flow_rate as string)?.trim() || "";
  const pressure = (attrs.diff_pressure as string)?.trim() || "";
  const matClass = (attrs.material_class as string)?.trim() || "";
  const fluid    = (attrs.fluid as string)?.trim() || "";
  const typeLC   = gearType.toLowerCase();
  let typeSpec = "";
  if (typeLC.includes("internal") || typeLC.includes("crescent")) {
    const crescent = (attrs.crescent_type as string)?.trim() || "";
    if (crescent) typeSpec = crescent;
  } else if (typeLC.includes("helical") && !typeLC.includes("bi")) {
    const noise = (attrs.noise_class as string)?.trim() || "";
    if (noise && noise !== "Standard") typeSpec = `${noise} Noise`;
  } else if (typeLC.includes("bi-helical") || typeLC.includes("herringbone")) {
    const bearing = (attrs.bearing_type as string)?.trim() || "";
    if (bearing) typeSpec = `${bearing} Bearing`;
  }
  const parts: string[] = ["Gear Pump"];
  if (gearType) parts.push(gearType);
  if (typeSpec)  parts.push(typeSpec);
  const opCond: string[] = [];
  if (flowRate) opCond.push(flowRate);
  if (pressure) opCond.push(`${pressure} DP`);
  if (opCond.length === 2) parts.push(opCond.join(" @ "));
  else if (opCond.length === 1) parts.push(opCond[0]);
  if (matClass) parts.push(matClass);
  if (fluid)    parts.push(`${fluid} Service`);
  return parts.join(", ");
}

export function GearPumpAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(GEAR_ALL_FIELD_OPTS)) {
      if (opts.length === 0) continue;
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const [makeSearch, setMakeSearch] = useState("");
  const [makes, setMakes] = useState<string[]>(() => {
    const m = attrs.approved_makes; return Array.isArray(m) ? (m as string[]) : [];
  });
  function handleTypeChange(type: string) {
    const defaults = buildGearPumpDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(GEAR_ALL_FIELD_OPTS)) {
      if (opts.length === 0) continue;
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); setMakes([]); onChange({ ...defaults, approved_makes: [] });
  }
  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom((c) => ({ ...c, [key]: true })); onChange({ ...attrs, [key]: "" }); }
    else { setCustom((c) => ({ ...c, [key]: false })); onChange({ ...attrs, [key]: val }); }
  }
  function set(key: string, val: unknown) { onChange({ ...attrs, [key]: val }); }
  function renderField(key: string, label: string, opts: string[], required?: boolean) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }
  function renderFreeText(key: string, label: string, placeholder?: string, required?: boolean) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <Input className="h-8 text-sm" placeholder={placeholder ?? `Enter ${label}…`}
          value={(attrs[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} />
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
  function addMake(make: string) {
    const t = make.trim(); if (!t || makes.includes(t)) return;
    const next = [...makes, t]; setMakes(next); onChange({ ...attrs, approved_makes: next }); setMakeSearch("");
  }
  function removeMake(m: string) { const next = makes.filter((x) => x !== m); setMakes(next); onChange({ ...attrs, approved_makes: next }); }
  function moveMake(i: number, dir: -1 | 1) {
    const next = [...makes]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]]; setMakes(next); onChange({ ...attrs, approved_makes: next });
  }
  const gearType    = (attrs.gear_type as string) ?? "";
  const isExternal  = gearType === "External Gear";
  const isInternal  = gearType === "Internal Gear (Crescent)";
  const isHelical   = gearType === "Helical Gear";
  const isBiHelical = gearType === "Bi-Helical / Herringbone";
  const hasType     = isExternal || isInternal || isHelical || isBiHelical;
  const hasJacket   = (attrs.heating_jacket as string) === "Yes";
  const hasRelief   = (attrs.builtin_relief_valve as string) === "Yes";
  const filteredMakes = GEAR_PUMP_MAKES.filter((m) => m.toLowerCase().includes(makeSearch.toLowerCase()) && !makes.includes(m));

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gear Pump Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {sec("Gear Type")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Gear Type <span className="text-red-500">*</span></Label>
          <SearchableSelect value={GEAR_PUMP_TYPES.includes(gearType) ? gearType : ""}
            options={GEAR_PUMP_TYPES} placeholder="Select gear type first…"
            onSelect={(v) => handleTypeChange(v)} />
        </div>
        {!hasType && (
          <div className="col-span-2 rounded-md border border-dashed bg-muted/20 py-6 text-center text-xs text-muted-foreground">
            Select a gear type above to configure specifications
          </div>
        )}
        {isExternal && (<>
          {sec("External Gear Configuration")}
          {renderField("gear_material",       "Gear Material",         GEAR_COMMON_OPTS.gear_material, true)}
          {renderField("port_connection",     "Port Connection",       GEAR_COMMON_OPTS.port_conn,     true)}
          {renderFreeText("port_size",        "Port Size (DN/NPS)",    "e.g. DN50, 2\"")}
          {renderField("builtin_relief_valve","Built-in Relief Valve", GEAR_COMMON_OPTS.yes_no)}
          {hasRelief && renderFreeText("relief_pressure_setting","Relief Pressure Setting","e.g. 12 bar")}
          {renderField("heating_jacket",      "Heating Jacket",        GEAR_COMMON_OPTS.yes_no)}
          {hasJacket ? renderField("heating_medium","Heating Medium",  GEAR_COMMON_OPTS.heating_medium) : <div />}
        </>)}
        {isInternal && (<>
          {sec("Internal Gear (Crescent) Configuration")}
          {renderField("gear_material",   "Gear Material",       GEAR_COMMON_OPTS.gear_material,  true)}
          {renderField("crescent_type",   "Crescent Type",       GEAR_COMMON_OPTS.crescent_type,  true)}
          {renderField("idler_pin_type",  "Idler Pin Type",      GEAR_COMMON_OPTS.idler_pin_type, true)}
          {renderField("port_connection", "Port Connection",     GEAR_COMMON_OPTS.port_conn,      true)}
          {renderFreeText("port_size",    "Port Size (DN/NPS)",  "e.g. DN50, 2\"")}
          {renderField("heating_jacket",  "Heating Jacket",      GEAR_COMMON_OPTS.yes_no,         true)}
          {hasJacket ? renderField("heating_medium","Heating Medium",GEAR_COMMON_OPTS.heating_medium) : <div />}
          {renderField("insulation",      "Insulation Required", GEAR_COMMON_OPTS.yes_no)}
          <div />
        </>)}
        {isHelical && (<>
          {sec("Helical Gear Configuration")}
          {renderField("gear_material",       "Gear Material",         GEAR_COMMON_OPTS.gear_material, true)}
          {renderField("helix_angle",         "Helix Angle",           GEAR_COMMON_OPTS.helix_angle)}
          {renderField("noise_class",         "Noise Class",           GEAR_COMMON_OPTS.noise_class)}
          {renderField("port_connection",     "Port Connection",       GEAR_COMMON_OPTS.port_conn)}
          {renderFreeText("port_size",        "Port Size (DN/NPS)",    "e.g. DN50, 2\"")}
          {renderField("builtin_relief_valve","Built-in Relief Valve", GEAR_COMMON_OPTS.yes_no)}
          {hasRelief && renderFreeText("relief_pressure_setting","Relief Pressure Setting","e.g. 12 bar")}
          {renderField("heating_jacket",      "Heating Jacket",        GEAR_COMMON_OPTS.yes_no)}
          {hasJacket ? renderField("heating_medium","Heating Medium",  GEAR_COMMON_OPTS.heating_medium) : <div />}
        </>)}
        {isBiHelical && (<>
          {sec("Bi-Helical / Herringbone Configuration")}
          {renderField("gear_material",       "Gear Material",         GEAR_COMMON_OPTS.gear_material, true)}
          {renderField("bearing_type",        "Bearing Type",          GEAR_COMMON_OPTS.bearing_type,  true)}
          {renderFreeText("max_diff_pressure","Max Diff. Pressure",    "e.g. 40 bar",                  true)}
          {renderField("lube_system",         "Lubrication System",    GEAR_COMMON_OPTS.lube_system)}
          {renderField("builtin_relief_valve","Built-in Relief Valve", GEAR_COMMON_OPTS.yes_no)}
          {hasRelief && renderFreeText("relief_pressure_setting","Relief Pressure Setting","e.g. 40 bar")}
          {renderField("heating_jacket",      "Heating Jacket",        GEAR_COMMON_OPTS.yes_no)}
          {hasJacket ? renderField("heating_medium","Heating Medium",  GEAR_COMMON_OPTS.heating_medium) : <div />}
        </>)}
        {hasType && (<>
          {sec("Operating Conditions")}
          {renderField("flow_rate",      "Flow Rate",             GEAR_COMMON_OPTS.flow_rate,      true)}
          {renderField("diff_pressure",  "Differential Pressure", GEAR_COMMON_OPTS.diff_pressure,  true)}
          {renderField("fluid",          "Fluid",                 GEAR_COMMON_OPTS.fluid,          true)}
          {renderFreeText("viscosity",   "Viscosity (cSt)",       "e.g. 100 cSt")}
          {renderField("operating_temp", "Operating Temp",        GEAR_COMMON_OPTS.operating_temp)}
          <div />
          {sec("Pump Configuration")}
          {renderField("mounting",       "Mounting",              GEAR_COMMON_OPTS.mounting,       true)}
          {renderField("drive_type",     "Drive Type",            GEAR_COMMON_OPTS.drive_type,     true)}
          {renderField("service_type",   "Service Type",          GEAR_COMMON_OPTS.service_type,   true)}
          {renderField("material_class", "Material Class",        GEAR_COMMON_OPTS.material_class, true)}
          {renderField("seal_type",      "Seal Type",             GEAR_COMMON_OPTS.seal_type,      true)}
          <div />
          {sec("Optional — Performance & Area")}
          {renderField("speed_rpm",          "Speed (RPM)",          GEAR_COMMON_OPTS.speed_rpm)}
          {renderField("motor_power_kw",     "Motor Power (kW)",     GEAR_COMMON_OPTS.motor_power_kw)}
          {renderField("api_standard",       "API Standard",         GEAR_COMMON_OPTS.api_676)}
          {renderField("area_classification","Area Classification",  GEAR_COMMON_OPTS.area_class)}
          {renderField("certification",      "Certification",        GEAR_COMMON_OPTS.certification)}
          {renderField("spare_parts",        "Spare Parts Package",  GEAR_COMMON_OPTS.spare_parts)}
          <div className="col-span-2 mt-1 pb-0.5 border-b">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Approved Makes (ranked) <span className="text-red-500">*</span>
            </p>
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Search or type make…"
                value={makeSearch} onChange={(e) => setMakeSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && makeSearch.trim()) addMake(makeSearch); }} />
              <Button type="button" size="sm" className="h-8" onClick={() => { if (makeSearch.trim()) addMake(makeSearch); }}>Add</Button>
            </div>
            {makeSearch && filteredMakes.length > 0 && (
              <div className="rounded-md border bg-background shadow-sm max-h-32 overflow-y-auto">
                {filteredMakes.map((m) => (
                  <button key={m} type="button" className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted" onClick={() => addMake(m)}>{m}</button>
                ))}
              </div>
            )}
            {makes.length > 0 && (
              <div className="space-y-1">
                {makes.map((m, i) => (
                  <div key={m} className="flex items-center gap-2 rounded-md border px-2 py-1 bg-background">
                    <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}.</span>
                    <span className="flex-1 text-xs">{m}</span>
                    <button type="button" onClick={() => moveMake(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                    <button type="button" onClick={() => moveMake(i, 1)} disabled={i === makes.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                    <button type="button" onClick={() => removeMake(m)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}
        {qty !== undefined && onQtyChange && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
              value={qty} onChange={(e) => onQtyChange(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREW PUMP
// ─────────────────────────────────────────────────────────────────────────────
const SCREW_PUMP_TYPES = ["Single Screw","Twin Screw","Triple Screw","Progressive Cavity"];
const SCREW_COMMON_OPTS = {
  mounting:         ["Base Mounted","Skid Mounted","Vertical","Close-Coupled"],
  drive_type:       ["Motor Driven","Engine Driven","Variable Speed Drive (VSD)"],
  service_type:     ["Continuous","Intermittent","Standby","Duty-Standby"],
  flow_rate:        ["0.5 m³/hr","1 m³/hr","2 m³/hr","5 m³/hr","10 m³/hr","15 m³/hr",
                     "20 m³/hr","30 m³/hr","50 m³/hr","75 m³/hr","100 m³/hr","150 m³/hr","200 m³/hr"],
  diff_pressure:    ["2 bar","5 bar","8 bar","10 bar","15 bar","20 bar","25 bar","30 bar","40 bar"],
  fluid:            ["Fuel Oil","Lube Oil","Thermal Oil","Bitumen","Crude Oil","Chemical",
                     "Slurry","Sludge","Water","Other"],
  operating_temp:   ["Ambient","60°C","80°C","100°C","120°C","150°C","200°C","250°C"],
  material_class:   ["CI","CS","SS304","SS316","Alloy Steel","Hastelloy"],
  seal_type:        ["Mechanical Seal","Gland Packing","Cartridge Seal","Lip Seal"],
  yes_no:           ["Yes","No"],
  heating_medium:   ["Steam","Hot Water","Thermal Oil"],
  api_676:          ["API 676","Non-API"],
  area_class:       ["Safe Area","Zone 1","Zone 2"],
  certification:    ["ATEX","IECEx","PESO"],
  speed_rpm:        ["960 RPM","1450 RPM","Variable"],
  motor_power_kw:   ["0.37 kW","0.55 kW","0.75 kW","1.1 kW","1.5 kW","2.2 kW","3.7 kW",
                     "5.5 kW","7.5 kW","11 kW","15 kW","18.5 kW","22 kW","30 kW","37 kW","45 kW","55 kW","75 kW"],
  spare_parts:      ["Seal Kit","Rotor-Stator Set","Full Rotating Element","None"],
  port_conn:        ["Flanged","NPT","BSP"],
  screw_mat_s:      ["Cast Iron","Carbon Steel","SS316","Bronze"],
  liner_material:   ["Cast Iron","SS316","Alloy Steel"],
  screw_mat_tw:     ["Carbon Steel","SS316","Alloy Steel"],
  timing_gears:     ["Yes (Non-Contacting)","No (Contacting)"],
  noise_level:      ["Standard","Low Noise"],
  rotor_material:   ["Chrome Steel","SS316","Alloy Steel"],
  stator_elastomer: ["NBR","EPDM","Viton","Natural Rubber","Neoprene"],
  speed_control:    ["Fixed Speed","Variable Speed Drive (VSD)"],
};
const SCREW_ALL_FIELD_OPTS: Record<string, string[]> = {
  screw_type:          SCREW_PUMP_TYPES,
  mounting:            SCREW_COMMON_OPTS.mounting,
  drive_type:          SCREW_COMMON_OPTS.drive_type,
  service_type:        SCREW_COMMON_OPTS.service_type,
  flow_rate:           SCREW_COMMON_OPTS.flow_rate,
  diff_pressure:       SCREW_COMMON_OPTS.diff_pressure,
  fluid:               SCREW_COMMON_OPTS.fluid,
  operating_temp:      SCREW_COMMON_OPTS.operating_temp,
  material_class:      SCREW_COMMON_OPTS.material_class,
  seal_type:           SCREW_COMMON_OPTS.seal_type,
  heating_jacket:      SCREW_COMMON_OPTS.yes_no,
  heating_medium:      SCREW_COMMON_OPTS.heating_medium,
  api_standard:        SCREW_COMMON_OPTS.api_676,
  area_classification: SCREW_COMMON_OPTS.area_class,
  certification:       SCREW_COMMON_OPTS.certification,
  speed_rpm:           SCREW_COMMON_OPTS.speed_rpm,
  motor_power_kw:      SCREW_COMMON_OPTS.motor_power_kw,
  spare_parts:         SCREW_COMMON_OPTS.spare_parts,
  port_connection:     SCREW_COMMON_OPTS.port_conn,
  screw_material:      [...new Set([...SCREW_COMMON_OPTS.screw_mat_s, ...SCREW_COMMON_OPTS.screw_mat_tw])],
  liner_material:      SCREW_COMMON_OPTS.liner_material,
  timing_gears:        SCREW_COMMON_OPTS.timing_gears,
  self_priming:        SCREW_COMMON_OPTS.yes_no,
  noise_level:         SCREW_COMMON_OPTS.noise_level,
  rotor_material:      SCREW_COMMON_OPTS.rotor_material,
  stator_elastomer:    SCREW_COMMON_OPTS.stator_elastomer,
  speed_control:       SCREW_COMMON_OPTS.speed_control,
  dry_run_protection:  SCREW_COMMON_OPTS.yes_no,
};
const SCREW_PUMP_MAKES = [
  "Allweiler","Leistritz","IMO Pump","Bornemann","NETZSCH","Mono Pumps",
  "Roto","PCM","Seepex","Hugo Vogel","CIRCOR","Desmi",
];

function buildScrewPumpDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    screw_type: type, approved_makes: [],
    mounting: "Base Mounted", drive_type: "Motor Driven",
    service_type: "Continuous", flow_rate: "", diff_pressure: "",
    fluid: "", operating_temp: "", material_class: "CI", seal_type: "Mechanical Seal",
    heating_jacket: "No", heating_medium: "",
    api_standard: "", area_classification: "", certification: "",
    speed_rpm: "", motor_power_kw: "", spare_parts: "",
    port_connection: "", port_size: "", screw_material: "",
    liner_material: "", timing_gears: "", self_priming: "",
    noise_level: "", rotor_material: "", stator_elastomer: "",
    speed_control: "", dry_run_protection: "",
  };
  switch (type) {
    case "Single Screw":
      return { ...base, screw_material: "Cast Iron", liner_material: "Cast Iron" };
    case "Twin Screw":
      return { ...base, screw_material: "Carbon Steel", timing_gears: "Yes (Non-Contacting)", self_priming: "Yes" };
    case "Triple Screw":
      return { ...base, screw_material: "Alloy Steel", noise_level: "Standard", api_standard: "Non-API" };
    case "Progressive Cavity":
      return { ...base, material_class: "CS", rotor_material: "Chrome Steel",
        stator_elastomer: "NBR", speed_control: "Variable Speed Drive (VSD)",
        self_priming: "Yes", dry_run_protection: "Yes" };
    default: return base;
  }
}

export function buildScrewPumpRequirement(attrs: Record<string, unknown>): string {
  const screwType = (attrs.screw_type    as string)?.trim() || "";
  const flowRate  = (attrs.flow_rate     as string)?.trim() || "";
  const pressure  = (attrs.diff_pressure as string)?.trim() || "";
  const matClass  = (attrs.material_class as string)?.trim() || "";
  const fluid     = (attrs.fluid         as string)?.trim() || "";
  const stL = screwType.toLowerCase();
  let typeSpec = "";
  if (stL.includes("progressive") || stL.includes("cavity")) {
    const stator = (attrs.stator_elastomer as string)?.trim() || "";
    if (stator) typeSpec = `${stator} Stator`;
  } else if (stL.includes("twin")) {
    const tg = (attrs.timing_gears as string)?.trim() || "";
    if (tg.includes("Non-Contacting")) typeSpec = "Non-Contacting";
  } else if (stL.includes("triple")) {
    const nl = (attrs.noise_level as string)?.trim() || "";
    if (nl && nl !== "Standard") typeSpec = nl;
  }
  const parts: string[] = ["Screw Pump"];
  if (screwType) parts.push(screwType);
  if (typeSpec)  parts.push(typeSpec);
  const opCond: string[] = [];
  if (flowRate) opCond.push(flowRate);
  if (pressure) opCond.push(`${pressure} DP`);
  if (opCond.length === 2) parts.push(opCond.join(" @ "));
  else if (opCond.length === 1) parts.push(opCond[0]);
  if (matClass) parts.push(matClass);
  if (fluid)    parts.push(`${fluid} Service`);
  return parts.join(", ");
}

export function ScrewPumpAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(SCREW_ALL_FIELD_OPTS)) {
      if (opts.length === 0) continue;
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const [makeSearch, setMakeSearch] = useState("");
  const [makes, setMakes] = useState<string[]>(() => {
    const m = attrs.approved_makes; return Array.isArray(m) ? (m as string[]) : [];
  });
  function handleTypeChange(type: string) {
    const defaults = buildScrewPumpDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(SCREW_ALL_FIELD_OPTS)) {
      if (opts.length === 0) continue;
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); setMakes([]); onChange({ ...defaults, approved_makes: [] });
  }
  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom((c) => ({ ...c, [key]: true })); onChange({ ...attrs, [key]: "" }); }
    else { setCustom((c) => ({ ...c, [key]: false })); onChange({ ...attrs, [key]: val }); }
  }
  function set(key: string, val: unknown) { onChange({ ...attrs, [key]: val }); }
  function renderField(key: string, label: string, opts: string[], required?: boolean) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }
  function renderFreeText(key: string, label: string, placeholder?: string, required?: boolean) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <Input className="h-8 text-sm" placeholder={placeholder ?? `Enter ${label}…`}
          value={(attrs[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} />
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
  function addMake(make: string) {
    const t = make.trim(); if (!t || makes.includes(t)) return;
    const next = [...makes, t]; setMakes(next); onChange({ ...attrs, approved_makes: next }); setMakeSearch("");
  }
  function removeMake(m: string) { const next = makes.filter((x) => x !== m); setMakes(next); onChange({ ...attrs, approved_makes: next }); }
  function moveMake(i: number, dir: -1 | 1) {
    const next = [...makes]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]]; setMakes(next); onChange({ ...attrs, approved_makes: next });
  }
  const screwType  = (attrs.screw_type as string) ?? "";
  const isSingle   = screwType === "Single Screw";
  const isTwin     = screwType === "Twin Screw";
  const isTriple   = screwType === "Triple Screw";
  const isPC       = screwType === "Progressive Cavity";
  const hasType    = isSingle || isTwin || isTriple || isPC;
  const hasJacket  = (attrs.heating_jacket as string) === "Yes";
  const filteredMakes = SCREW_PUMP_MAKES.filter((m) => m.toLowerCase().includes(makeSearch.toLowerCase()) && !makes.includes(m));

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Screw Pump Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {sec("Screw Type")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Screw Type <span className="text-red-500">*</span></Label>
          <SearchableSelect value={SCREW_PUMP_TYPES.includes(screwType) ? screwType : ""}
            options={SCREW_PUMP_TYPES} placeholder="Select screw type first…"
            onSelect={(v) => handleTypeChange(v)} />
        </div>
        {!hasType && (
          <div className="col-span-2 rounded-md border border-dashed bg-muted/20 py-6 text-center text-xs text-muted-foreground">
            Select a screw type above to configure specifications
          </div>
        )}
        {isSingle && (<>
          {sec("Single Screw Configuration")}
          {renderField("screw_material", "Screw Material",    SCREW_COMMON_OPTS.screw_mat_s,   true)}
          {renderField("liner_material", "Liner / Casing",    SCREW_COMMON_OPTS.liner_material, true)}
          {renderField("port_connection","Port Connection",   SCREW_COMMON_OPTS.port_conn,     true)}
          {renderFreeText("port_size",   "Port Size (DN/NPS)","e.g. DN50")}
          {renderField("heating_jacket", "Heating Jacket",    SCREW_COMMON_OPTS.yes_no)}
          {hasJacket ? renderField("heating_medium","Heating Medium",SCREW_COMMON_OPTS.heating_medium) : <div />}
        </>)}
        {isTwin && (<>
          {sec("Twin Screw Configuration")}
          {renderField("screw_material", "Screw Material",    SCREW_COMMON_OPTS.screw_mat_tw, true)}
          {renderField("timing_gears",   "Timing Gears",      SCREW_COMMON_OPTS.timing_gears, true)}
          {renderField("self_priming",   "Self-Priming",      SCREW_COMMON_OPTS.yes_no,       true)}
          {renderField("port_connection","Port Connection",   SCREW_COMMON_OPTS.port_conn,    true)}
          {renderFreeText("port_size",   "Port Size (DN/NPS)","e.g. DN80")}
          {renderField("api_standard",   "API Standard",      SCREW_COMMON_OPTS.api_676)}
          {renderField("heating_jacket", "Heating Jacket",    SCREW_COMMON_OPTS.yes_no)}
          {hasJacket ? renderField("heating_medium","Heating Medium",SCREW_COMMON_OPTS.heating_medium) : <div />}
        </>)}
        {isTriple && (<>
          {sec("Triple Screw Configuration")}
          {renderField("screw_material", "Screw Material",    SCREW_COMMON_OPTS.screw_mat_tw, true)}
          {renderField("noise_level",    "Noise Level",       SCREW_COMMON_OPTS.noise_level)}
          {renderField("port_connection","Port Connection",   SCREW_COMMON_OPTS.port_conn,    true)}
          {renderFreeText("port_size",   "Port Size (DN/NPS)","e.g. DN50")}
          {renderField("api_standard",   "API Standard",      SCREW_COMMON_OPTS.api_676)}
          {renderField("heating_jacket", "Heating Jacket",    SCREW_COMMON_OPTS.yes_no)}
          {hasJacket ? renderField("heating_medium","Heating Medium",SCREW_COMMON_OPTS.heating_medium) : <div />}
        </>)}
        {isPC && (<>
          {sec("Progressive Cavity Configuration")}
          {renderField("rotor_material",    "Rotor Material",    SCREW_COMMON_OPTS.rotor_material,   true)}
          {renderField("stator_elastomer",  "Stator Elastomer",  SCREW_COMMON_OPTS.stator_elastomer, true)}
          {renderField("speed_control",     "Speed Control",     SCREW_COMMON_OPTS.speed_control,    true)}
          {renderField("self_priming",      "Self-Priming",      SCREW_COMMON_OPTS.yes_no,           true)}
          {renderField("dry_run_protection","Dry Run Protection",SCREW_COMMON_OPTS.yes_no,           true)}
          {renderField("port_connection",   "Port Connection",   SCREW_COMMON_OPTS.port_conn,        true)}
          {renderFreeText("port_size",      "Port Size (DN/NPS)","e.g. DN50")}
          {renderField("heating_jacket",    "Heating Jacket",    SCREW_COMMON_OPTS.yes_no)}
          {hasJacket ? renderField("heating_medium","Heating Medium",SCREW_COMMON_OPTS.heating_medium) : <div />}
        </>)}
        {hasType && (<>
          {sec("Operating Conditions")}
          {renderField("flow_rate",      "Flow Rate",             SCREW_COMMON_OPTS.flow_rate,     true)}
          {renderField("diff_pressure",  "Differential Pressure", SCREW_COMMON_OPTS.diff_pressure, true)}
          {renderField("fluid",          "Fluid",                 SCREW_COMMON_OPTS.fluid,         true)}
          {renderFreeText("viscosity",   "Viscosity (cSt)",       "e.g. 500 cSt")}
          {renderField("operating_temp", "Operating Temp",        SCREW_COMMON_OPTS.operating_temp)}
          <div />
          {sec("Pump Configuration")}
          {renderField("mounting",       "Mounting",       SCREW_COMMON_OPTS.mounting,       true)}
          {renderField("drive_type",     "Drive Type",     SCREW_COMMON_OPTS.drive_type,     true)}
          {renderField("service_type",   "Service Type",   SCREW_COMMON_OPTS.service_type,   true)}
          {renderField("material_class", "Material Class", SCREW_COMMON_OPTS.material_class, true)}
          {renderField("seal_type",      "Seal Type",      SCREW_COMMON_OPTS.seal_type,      true)}
          <div />
          {sec("Optional — Performance & Area")}
          {renderField("speed_rpm",          "Speed (RPM)",         SCREW_COMMON_OPTS.speed_rpm)}
          {renderField("motor_power_kw",     "Motor Power (kW)",    SCREW_COMMON_OPTS.motor_power_kw)}
          {renderField("area_classification","Area Classification", SCREW_COMMON_OPTS.area_class)}
          {renderField("certification",      "Certification",       SCREW_COMMON_OPTS.certification)}
          {renderField("spare_parts",        "Spare Parts Package", SCREW_COMMON_OPTS.spare_parts)}
          <div />
          <div className="col-span-2 mt-1 pb-0.5 border-b">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Approved Makes (ranked) <span className="text-red-500">*</span>
            </p>
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Search or type make…"
                value={makeSearch} onChange={(e) => setMakeSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && makeSearch.trim()) addMake(makeSearch); }} />
              <Button type="button" size="sm" className="h-8" onClick={() => { if (makeSearch.trim()) addMake(makeSearch); }}>Add</Button>
            </div>
            {makeSearch && filteredMakes.length > 0 && (
              <div className="rounded-md border bg-background shadow-sm max-h-32 overflow-y-auto">
                {filteredMakes.map((m) => (
                  <button key={m} type="button" className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted" onClick={() => addMake(m)}>{m}</button>
                ))}
              </div>
            )}
            {makes.length > 0 && (
              <div className="space-y-1">
                {makes.map((m, i) => (
                  <div key={m} className="flex items-center gap-2 rounded-md border px-2 py-1 bg-background">
                    <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}.</span>
                    <span className="flex-1 text-xs">{m}</span>
                    <button type="button" onClick={() => moveMake(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                    <button type="button" onClick={() => moveMake(i, 1)} disabled={i === makes.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                    <button type="button" onClick={() => removeMake(m)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}
        {qty !== undefined && onQtyChange && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
              value={qty} onChange={(e) => onQtyChange(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTISTAGE PUMP
// ─────────────────────────────────────────────────────────────────────────────
const MULTISTAGE_PUMP_TYPES = ["Horizontal Multistage","Vertical Multistage","Ring Section","Barrel Type"];
const MS_COMMON_OPTS = {
  mounting:          ["Base Mounted","Skid Mounted","Vertical"],
  drive_type:        ["Motor Driven","Engine Driven","Variable Speed Drive (VSD)","Steam Turbine Driven"],
  service_type:      ["Continuous","Intermittent","Standby","Duty-Standby"],
  flow_rate:         ["1 m³/hr","2 m³/hr","5 m³/hr","10 m³/hr","15 m³/hr","20 m³/hr","30 m³/hr",
                      "50 m³/hr","75 m³/hr","100 m³/hr","150 m³/hr","200 m³/hr","300 m³/hr","500 m³/hr"],
  head_mlc:          ["50","75","100","150","200","300","400","500","600","800","1000","1500","2000"],
  fluid:             ["Water","Hot Water","Boiler Feed Water","Condensate","Sea Water","Chemical",
                      "Oil","Hydrocarbons","Cryogenic Fluid","Other"],
  operating_temp:    ["Ambient","60°C","80°C","100°C","120°C","150°C","200°C","250°C","300°C","350°C"],
  material_class:    ["CI","CS","SS304","SS316","Duplex SS","Super Duplex","Hastelloy"],
  seal_type:         ["Single Mechanical Seal","Double Mechanical Seal","Tandem Seal",
                      "Cartridge Seal","Gland Packing","Labyrinth Seal"],
  yes_no:            ["Yes","No"],
  api_standard:      ["API 610","Non-API"],
  area_class:        ["Safe Area","Zone 1","Zone 2"],
  certification:     ["ATEX","IECEx","PESO"],
  speed_rpm:         ["960 RPM","1450 RPM","1500 RPM","2900 RPM","3000 RPM","3500 RPM","Variable"],
  motor_power_kw:    ["1.1 kW","1.5 kW","2.2 kW","3.7 kW","5.5 kW","7.5 kW","11 kW","15 kW","18.5 kW",
                      "22 kW","30 kW","37 kW","45 kW","55 kW","75 kW","90 kW","110 kW","132 kW",
                      "160 kW","200 kW","250 kW"],
  spare_parts:       ["Seal Kit","Full Rotating Element","Bearing Kit","Impeller Set","None"],
  port_conn:         ["Flanged","NPT","BSP"],
  num_stages:        ["2-stage","3-stage","4-stage","5-stage","6-stage","7-stage","8-stage","10-stage","12-stage"],
  impeller_type:     ["Closed","Semi-Closed","Open","Double Suction"],
  shaft_material:    ["CS","SS316","Duplex SS","Alloy Steel"],
  impeller_material: ["CI","CS","SS304","SS316","Duplex SS","Bronze"],
  bearing_type:      ["Anti-Friction (Ball/Roller)","Sleeve","Rolling Element","Tilting Pad"],
  casing_split:      ["Radial Split","Axial Split"],
  coupling_type:     ["Direct Coupled","Flexible Coupled","Close Coupled"],
  lineshaft_type:    ["Open (water-lubricated)","Enclosed (oil-lubricated)"],
  discharge_type:    ["Above Ground","Below Ground (Submersible Motor)"],
  motor_type:        ["Hollow Shaft","Solid Shaft","Submersible Motor"],
  rotor_type:        ["Between Bearings","Overhung"],
  inner_casing:      ["Radially Split","Axially Split"],
};
const MS_ALL_FIELD_OPTS: Record<string, string[]> = {
  multistage_type:    MULTISTAGE_PUMP_TYPES,
  mounting:           MS_COMMON_OPTS.mounting,
  drive_type:         MS_COMMON_OPTS.drive_type,
  service_type:       MS_COMMON_OPTS.service_type,
  flow_rate:          MS_COMMON_OPTS.flow_rate,
  head_mlc:           MS_COMMON_OPTS.head_mlc,
  fluid:              MS_COMMON_OPTS.fluid,
  operating_temp:     MS_COMMON_OPTS.operating_temp,
  material_class:     MS_COMMON_OPTS.material_class,
  seal_type:          MS_COMMON_OPTS.seal_type,
  api_standard:       MS_COMMON_OPTS.api_standard,
  area_classification:MS_COMMON_OPTS.area_class,
  certification:      MS_COMMON_OPTS.certification,
  speed_rpm:          MS_COMMON_OPTS.speed_rpm,
  motor_power_kw:     MS_COMMON_OPTS.motor_power_kw,
  spare_parts:        MS_COMMON_OPTS.spare_parts,
  port_connection:    MS_COMMON_OPTS.port_conn,
  num_stages:         MS_COMMON_OPTS.num_stages,
  impeller_type:      MS_COMMON_OPTS.impeller_type,
  shaft_material:     MS_COMMON_OPTS.shaft_material,
  impeller_material:  MS_COMMON_OPTS.impeller_material,
  bearing_type:       MS_COMMON_OPTS.bearing_type,
  casing_split:       MS_COMMON_OPTS.casing_split,
  coupling_type:      MS_COMMON_OPTS.coupling_type,
  balance_drum:       MS_COMMON_OPTS.yes_no,
  lineshaft_type:     MS_COMMON_OPTS.lineshaft_type,
  discharge_type:     MS_COMMON_OPTS.discharge_type,
  motor_type:         MS_COMMON_OPTS.motor_type,
  rotor_type:         MS_COMMON_OPTS.rotor_type,
  back_to_back:       MS_COMMON_OPTS.yes_no,
  inner_casing_type:  MS_COMMON_OPTS.inner_casing,
};
const MULTISTAGE_PUMP_MAKES = [
  "Grundfos","KSB","Sulzer","Flowserve","Ebara","WILO","CNP",
  "Caprari","Lowara","Torishima","Ruhrpumpen","ITT (Goulds Pumps)","Xylem",
];

function buildMultistagePumpDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    multistage_type: type, approved_makes: [],
    mounting: "Base Mounted", drive_type: "Motor Driven",
    service_type: "Continuous", flow_rate: "", head_mlc: "",
    fluid: "", operating_temp: "", material_class: "CI",
    seal_type: "Single Mechanical Seal", api_standard: "",
    area_classification: "", certification: "",
    speed_rpm: "", motor_power_kw: "", spare_parts: "",
    specific_gravity: "", npsh_available: "",
    port_connection: "Flanged", port_size: "",
    num_stages: "", impeller_type: "", shaft_material: "",
    impeller_material: "", bearing_type: "",
    casing_split: "", coupling_type: "", balance_drum: "",
    lineshaft_type: "", discharge_type: "", motor_type: "",
    column_length: "", rotor_type: "", back_to_back: "",
    inner_casing_type: "", design_pressure: "", design_temp: "",
  };
  switch (type) {
    case "Horizontal Multistage":
      return { ...base, num_stages: "2-stage", impeller_type: "Closed",
        casing_split: "Radial Split", coupling_type: "Flexible Coupled",
        bearing_type: "Anti-Friction (Ball/Roller)", shaft_material: "CS",
        impeller_material: "CS", api_standard: "Non-API", balance_drum: "No" };
    case "Vertical Multistage":
      return { ...base, mounting: "Vertical", num_stages: "4-stage",
        impeller_type: "Closed", lineshaft_type: "Open (water-lubricated)",
        discharge_type: "Above Ground", motor_type: "Hollow Shaft",
        shaft_material: "CS", impeller_material: "CS", api_standard: "Non-API" };
    case "Ring Section":
      return { ...base, material_class: "CS", num_stages: "4-stage",
        impeller_type: "Closed", rotor_type: "Between Bearings",
        bearing_type: "Sleeve", shaft_material: "CS", impeller_material: "CS",
        api_standard: "Non-API", back_to_back: "No" };
    case "Barrel Type":
      return { ...base, material_class: "CS", seal_type: "Double Mechanical Seal",
        num_stages: "6-stage", impeller_type: "Closed",
        inner_casing_type: "Radially Split", bearing_type: "Sleeve",
        shaft_material: "CS", impeller_material: "CS", api_standard: "API 610" };
    default: return base;
  }
}

export function buildMultistagePumpRequirement(attrs: Record<string, unknown>): string {
  const msType   = (attrs.multistage_type as string)?.trim() || "";
  const flowRate = (attrs.flow_rate       as string)?.trim() || "";
  const head     = (attrs.head_mlc        as string)?.trim() || "";
  const matClass = (attrs.material_class  as string)?.trim() || "";
  const fluid    = (attrs.fluid           as string)?.trim() || "";
  const stages   = (attrs.num_stages      as string)?.trim() || "";
  const parts: string[] = ["Multistage Pump"];
  if (msType)  parts.push(msType);
  if (stages)  parts.push(stages);
  const opCond: string[] = [];
  if (flowRate) opCond.push(flowRate);
  if (head)     opCond.push(`${head} mLC`);
  if (opCond.length === 2) parts.push(opCond.join(" @ "));
  else if (opCond.length === 1) parts.push(opCond[0]);
  if (matClass) parts.push(matClass);
  if (fluid)    parts.push(`${fluid} Service`);
  return parts.join(", ");
}

export function MultistagePumpAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const msType = (attrs.multistage_type as string) ?? "";
  function handleTypeChange(newType: string) {
    onChange({ ...buildMultistagePumpDefaults(newType), approved_makes: [] });
  }
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of Object.keys(MS_ALL_FIELD_OPTS)) {
      const val  = (attrs[key] as string) ?? "";
      const opts = MS_ALL_FIELD_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom((c) => ({ ...c, [key]: true })); onChange({ ...attrs, [key]: "" }); }
    else { setCustom((c) => ({ ...c, [key]: false })); onChange({ ...attrs, [key]: val }); }
  }
  function renderField(key: string, label: string, required?: boolean, freeText?: boolean) {
    const curVal = (attrs[key] as string) ?? "";
    if (freeText) {
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
          <Input className="h-8 text-sm" placeholder="Enter value…"
            value={curVal} onChange={(e) => onChange({ ...attrs, [key]: e.target.value })} />
        </div>
      );
    }
    const opts      = MS_ALL_FIELD_OPTS[key] ?? [];
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && <Input className="h-8 text-sm" placeholder="Enter custom value…"
          value={curVal} onChange={(e) => onChange({ ...attrs, [key]: e.target.value })} autoFocus />}
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
  const [makesQuery, setMakesQuery]         = useState("");
  const [makesOpen, setMakesOpen]           = useState(false);
  const [customMakeVal, setCustomMakeVal]   = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const approvedMakes: string[] = (attrs.approved_makes as string[]) ?? [];
  function moveMake(idx: number, dir: -1 | 1) {
    const next = [...approvedMakes]; const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange({ ...attrs, approved_makes: next });
  }
  function removeMake(idx: number) { onChange({ ...attrs, approved_makes: approvedMakes.filter((_, i) => i !== idx) }); }
  function addMake(make: string) {
    if (!make.trim() || approvedMakes.includes(make.trim())) return;
    onChange({ ...attrs, approved_makes: [...approvedMakes, make.trim()] });
  }
  function addCustomMakeConfirm() { addMake(customMakeVal); setCustomMakeVal(""); setShowCustomMake(false); }
  const filteredMakes = MULTISTAGE_PUMP_MAKES.filter(
    (o) => !approvedMakes.includes(o) && o.toLowerCase().includes(makesQuery.toLowerCase()));
  const isHorizontal = msType === "Horizontal Multistage";
  const isVertical   = msType === "Vertical Multistage";
  const isRing       = msType === "Ring Section";
  const isBarrel     = msType === "Barrel Type";

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Multistage Pump Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Multistage Type <span className="text-red-500">*</span></Label>
          <SearchableSelect value={MULTISTAGE_PUMP_TYPES.includes(msType) ? msType : ""}
            options={MULTISTAGE_PUMP_TYPES} placeholder="Select multistage type…"
            onSelect={(v) => handleTypeChange(v)} />
        </div>
        {isHorizontal && (<>
          {sectionHeader("Horizontal Multistage — Configuration")}
          {renderField("num_stages",       "Number of Stages",    true)}
          {renderField("impeller_type",    "Impeller Type",       true)}
          {renderField("casing_split",     "Casing Split",        true)}
          {renderField("coupling_type",    "Coupling Type")}
          {renderField("bearing_type",     "Bearing Type")}
          {renderField("shaft_material",   "Shaft Material",      true)}
          {renderField("impeller_material","Impeller Material",   true)}
          {renderField("port_connection",  "Port Connection",     true)}
          {renderField("port_size",        "Port Size (DN/NPS)",  false, true)}
          {renderField("balance_drum",     "Balance Drum")}
          {renderField("api_standard",     "API Standard")}
        </>)}
        {isVertical && (<>
          {sectionHeader("Vertical Multistage — Configuration")}
          {renderField("num_stages",       "Number of Stages",        true)}
          {renderField("impeller_type",    "Impeller Type",           true)}
          {renderField("column_length",    "Column / Setting Length", false, true)}
          {renderField("lineshaft_type",   "Lineshaft Type",          true)}
          {renderField("discharge_type",   "Discharge Type",          true)}
          {renderField("motor_type",       "Motor Type",              true)}
          {renderField("shaft_material",   "Shaft Material",          true)}
          {renderField("impeller_material","Impeller Material",       true)}
          {renderField("port_connection",  "Port Connection",         true)}
          {renderField("port_size",        "Port Size (DN/NPS)",      false, true)}
          {renderField("api_standard",     "API Standard")}
        </>)}
        {isRing && (<>
          {sectionHeader("Ring Section — Configuration")}
          {renderField("num_stages",       "Number of Stages",     true)}
          {renderField("impeller_type",    "Impeller Type",        true)}
          {renderField("rotor_type",       "Rotor Arrangement")}
          {renderField("bearing_type",     "Bearing Type")}
          {renderField("back_to_back",     "Back-to-Back Impellers")}
          {renderField("shaft_material",   "Shaft Material",       true)}
          {renderField("impeller_material","Impeller Material",    true)}
          {renderField("port_connection",  "Port Connection",      true)}
          {renderField("port_size",        "Port Size (DN/NPS)",   false, true)}
          {renderField("api_standard",     "API Standard")}
        </>)}
        {isBarrel && (<>
          {sectionHeader("Barrel Type — Configuration")}
          {renderField("num_stages",       "Number of Stages",     true)}
          {renderField("inner_casing_type","Inner Casing Split",   true)}
          {renderField("impeller_type",    "Impeller Type",        true)}
          {renderField("bearing_type",     "Bearing Type",         true)}
          {renderField("shaft_material",   "Shaft Material",       true)}
          {renderField("impeller_material","Impeller Material",    true)}
          {renderField("design_pressure",  "Design Pressure",      false, true)}
          {renderField("design_temp",      "Design Temperature",   false, true)}
          {renderField("port_connection",  "Port Connection",      true)}
          {renderField("port_size",        "Port Size (DN/NPS)",   false, true)}
          {renderField("api_standard",     "API Standard",         true)}
        </>)}
        {msType && (<>
          {sectionHeader("Operating Conditions")}
          {renderField("flow_rate",     "Flow Rate (m³/hr)",  true)}
          {renderField("head_mlc",      "Head / TDH (mLC)",   true)}
          {renderField("fluid",         "Fluid",              true)}
          {renderField("material_class","Material Class",     true)}
          {renderField("seal_type",     "Seal Type",          true)}
          {renderField("mounting",      "Mounting",           true)}
          {renderField("drive_type",    "Drive Type",         true)}
          {renderField("service_type",  "Service Type",       true)}
          {sectionHeader("Optional / Additional")}
          {renderField("operating_temp", "Operating Temp")}
          <div className="space-y-1.5">
            <Label className="text-xs">Specific Gravity</Label>
            <Input className="h-8 text-sm" placeholder="e.g. 1.0"
              value={(attrs.specific_gravity as string) ?? ""}
              onChange={(e) => onChange({ ...attrs, specific_gravity: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">NPSHa (m)</Label>
            <Input className="h-8 text-sm" placeholder="e.g. 5"
              value={(attrs.npsh_available as string) ?? ""}
              onChange={(e) => onChange({ ...attrs, npsh_available: e.target.value })} />
          </div>
          {renderField("speed_rpm",          "Speed (RPM)")}
          {renderField("motor_power_kw",     "Motor Power (kW)")}
          {renderField("area_classification","Area Classification")}
          {renderField("certification",      "Certification")}
          {renderField("spare_parts",        "Spare Parts Package")}
          {sectionHeader("Approved Makes (Ranked)")}
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2">
              <Popover open={makesOpen} onOpenChange={setMakesOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" />Add Make
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                    <CommandList>
                      <CommandEmpty>No results.</CommandEmpty>
                      <CommandGroup>
                        {filteredMakes.map((opt) => (
                          <CommandItem key={opt} value={opt} onSelect={() => { addMake(opt); setMakesOpen(false); setMakesQuery(""); }}>
                            {opt}
                          </CommandItem>
                        ))}
                        <CommandItem value="__custom__" onSelect={() => { setShowCustomMake(true); setMakesOpen(false); }}>
                          <Plus className="mr-2 h-4 w-4" />Add custom make…
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {approvedMakes.length === 0 && (
                <span className="text-[11px] text-muted-foreground self-center">No makes added yet</span>
              )}
            </div>
            {showCustomMake && (
              <div className="flex gap-2">
                <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
                  value={customMakeVal} onChange={(e) => setCustomMakeVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMakeConfirm(); } }}
                  autoFocus />
                <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomMakeConfirm}>Add</Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                  onClick={() => { setShowCustomMake(false); setCustomMakeVal(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {approvedMakes.length > 0 && (
              <div className="space-y-1">
                {approvedMakes.map((make, idx) => (
                  <div key={make} className="flex items-center gap-2 rounded border bg-background px-2 py-1">
                    <span className="text-[11px] font-semibold text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
                    <span className="text-xs flex-1">{make}</span>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" type="button" onClick={() => moveMake(idx, -1)} disabled={idx === 0}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" type="button" onClick={() => moveMake(idx, 1)} disabled={idx === approvedMakes.length - 1}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" type="button" onClick={() => removeMake(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}
        {qty !== undefined && onQtyChange && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
              value={qty} onChange={(e) => onQtyChange(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DOSING / METERING PUMP
// ─────────────────────────────────────────────────────────────────────────────
const DOSING_PUMP_TYPES = ["Diaphragm Pump","Plunger Pump","Piston Pump","Peristaltic Pump","Solenoid Dosing Pump"];
const DOSING_COMMON_OPTS = {
  mounting:           ["Base Mounted","Skid Mounted","Wall Mounted","Panel Mounted"],
  drive_type:         ["Motor Driven","Solenoid Driven","Pneumatic"],
  service_type:       ["Continuous","Intermittent","Batch"],
  flow_rate:          ["1 LPH","5 LPH","10 LPH","20 LPH","50 LPH","100 LPH",
                       "200 LPH","500 LPH","1000 LPH","1 m³/hr","2 m³/hr","5 m³/hr"],
  discharge_pressure: ["2 bar","5 bar","8 bar","10 bar","15 bar","20 bar","25 bar"],
  dosing_accuracy:    ["±0.5%","±1%","±2%","±3%","±5%"],
  fluid:              ["Chemical","Acid","Alkali","Solvent","Polymer","Scale Inhibitor",
                       "Biocide","Water","Slurry","Other"],
  operating_temp:     ["Ambient","40°C","60°C","80°C","100°C"],
  wetted_material:    ["PP","PVC","SS304","SS316","PVDF","Hastelloy"],
  area_class:         ["Safe Area","Zone 1","Zone 2"],
  certification:      ["ATEX","IECEx","PESO"],
  yes_no:             ["Yes","No"],
  spare_parts:        ["Seal Kit","Diaphragm Kit","Hose Kit","Valve Kit","None"],
  diaphragm_material: ["PTFE","EPDM","Nitrile","Viton","PVDF"],
  diaphragm_design:   ["Single","Double","Sandwich"],
  ctrl_dp:            ["Manual","4-20mA","Pulse Input","PROFIBUS","HART"],
  plunger_material:   ["SS316","Ceramic","Tungsten Carbide","Hastelloy"],
  packing_material:   ["PTFE","Graphite","PEEK"],
  num_heads:          ["Simplex","Duplex","Triplex"],
  ctrl_pl:            ["Manual Stroke","Variable Speed Drive (VSD)","Stroke Length","Both (VSD + Stroke)"],
  piston_material:    ["SS316","Cast Iron","PTFE-lined"],
  packing_seal_type:  ["O-Ring","Cup Seal","Gland Packing"],
  ctrl_pn:            ["Manual","4-20mA","Pulse Input"],
  hose_material:      ["Natural Rubber","EPDM","Viton","Neoprene","Norprene"],
  speed_control:      ["Fixed Speed","Variable Speed Drive (VSD)"],
  ip_rating:          ["IP54","IP55","IP65","IP66","IP67"],
  ctrl_sol:           ["Manual","4-20mA","Pulse Input","Batch"],
};
const DOSING_ALL_FIELD_OPTS: Record<string, string[]> = {
  pump_type:           DOSING_PUMP_TYPES,
  mounting:            DOSING_COMMON_OPTS.mounting,
  drive_type:          DOSING_COMMON_OPTS.drive_type,
  service_type:        DOSING_COMMON_OPTS.service_type,
  flow_rate:           DOSING_COMMON_OPTS.flow_rate,
  discharge_pressure:  DOSING_COMMON_OPTS.discharge_pressure,
  dosing_accuracy:     DOSING_COMMON_OPTS.dosing_accuracy,
  fluid:               DOSING_COMMON_OPTS.fluid,
  operating_temp:      DOSING_COMMON_OPTS.operating_temp,
  wetted_material:     DOSING_COMMON_OPTS.wetted_material,
  area_classification: DOSING_COMMON_OPTS.area_class,
  certification:       DOSING_COMMON_OPTS.certification,
  control_panel:       ["Integral","Remote","None"],
  pulsation_dampener:  DOSING_COMMON_OPTS.yes_no,
  safety_valve:        DOSING_COMMON_OPTS.yes_no,
  spare_parts:         DOSING_COMMON_OPTS.spare_parts,
  diaphragm_material:  DOSING_COMMON_OPTS.diaphragm_material,
  diaphragm_design:    DOSING_COMMON_OPTS.diaphragm_design,
  control_type:        [...new Set([...DOSING_COMMON_OPTS.ctrl_dp, ...DOSING_COMMON_OPTS.ctrl_pl])],
  back_pressure_valve: DOSING_COMMON_OPTS.yes_no,
  leak_detection:      DOSING_COMMON_OPTS.yes_no,
  degassing_valve:     DOSING_COMMON_OPTS.yes_no,
  plunger_material:    DOSING_COMMON_OPTS.plunger_material,
  packing_material:    DOSING_COMMON_OPTS.packing_material,
  num_heads:           DOSING_COMMON_OPTS.num_heads,
  piston_material:     DOSING_COMMON_OPTS.piston_material,
  packing_seal_type:   DOSING_COMMON_OPTS.packing_seal_type,
  hose_material:       DOSING_COMMON_OPTS.hose_material,
  reversible:          DOSING_COMMON_OPTS.yes_no,
  speed_control:       DOSING_COMMON_OPTS.speed_control,
  ip_rating:           DOSING_COMMON_OPTS.ip_rating,
};
const DOSING_PUMP_MAKES = [
  "ProMinent","Grundfos Alldos","Milton Roy","Sera","SEKO","Emec",
  "Pulsafeeder","Watson-Marlow","LEWA","Iwaki","Verder","IDEX",
];

function buildDosingPumpDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    pump_type: type, approved_makes: [],
    mounting: "Base Mounted", drive_type: "Motor Driven",
    service_type: "Continuous", flow_rate: "", discharge_pressure: "",
    dosing_accuracy: "±1%", fluid: "", operating_temp: "", wetted_material: "SS316",
    area_classification: "", certification: "",
    control_panel: "None", pulsation_dampener: "No", safety_valve: "No", spare_parts: "",
    diaphragm_material: "", diaphragm_design: "", control_type: "",
    back_pressure_valve: "No", leak_detection: "", degassing_valve: "No",
    plunger_material: "", packing_material: "", num_heads: "",
    piston_material: "", packing_seal_type: "",
    hose_material: "", reversible: "", speed_control: "",
    ip_rating: "", max_stroke_rate: "", motor_power: "",
  };
  switch (type) {
    case "Diaphragm Pump":
      return { ...base, diaphragm_material: "PTFE", diaphragm_design: "Single", control_type: "4-20mA", back_pressure_valve: "No" };
    case "Plunger Pump":
      return { ...base, plunger_material: "SS316", packing_material: "PTFE", num_heads: "Simplex", control_type: "Manual Stroke" };
    case "Piston Pump":
      return { ...base, piston_material: "SS316", packing_seal_type: "O-Ring", num_heads: "Simplex", control_type: "4-20mA" };
    case "Peristaltic Pump":
      return { ...base, hose_material: "EPDM", speed_control: "Variable Speed Drive (VSD)", reversible: "Yes" };
    case "Solenoid Dosing Pump":
      return { ...base, drive_type: "Solenoid Driven", diaphragm_material: "PTFE", wetted_material: "PP", control_type: "Manual", service_type: "Batch" };
    default: return base;
  }
}

export function buildDosingPumpRequirement(attrs: Record<string, unknown>): string {
  const pumpType = (attrs.pump_type          as string)?.trim() || "";
  const flowRate = (attrs.flow_rate          as string)?.trim() || "";
  const pressure = (attrs.discharge_pressure as string)?.trim() || "";
  const fluid    = (attrs.fluid              as string)?.trim() || "";
  const typeLC   = pumpType.toLowerCase();
  let typeSpec = "";
  if (typeLC.includes("diaphragm")) {
    const design = (attrs.diaphragm_design as string)?.trim() || "";
    if (design) typeSpec = `${design} Diaphragm`;
  } else if (typeLC.includes("plunger") || typeLC.includes("piston")) {
    const heads = (attrs.num_heads as string)?.trim() || "";
    if (heads) typeSpec = heads;
  } else if (typeLC.includes("peristaltic")) {
    const hose = (attrs.hose_material as string)?.trim() || "";
    if (hose) typeSpec = `${hose} Hose`;
  }
  const parts: string[] = ["Dosing Pump"];
  if (pumpType) parts.push(pumpType);
  if (typeSpec) parts.push(typeSpec);
  const opCond: string[] = [];
  if (flowRate) opCond.push(flowRate);
  if (pressure) opCond.push(pressure);
  if (opCond.length === 2) parts.push(opCond.join(" @ "));
  else if (opCond.length === 1) parts.push(opCond[0]);
  if (fluid) parts.push(`${fluid} Service`);
  return parts.join(", ");
}

export function DosingPumpAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(DOSING_ALL_FIELD_OPTS)) {
      if (opts.length === 0) continue;
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const [makeSearch, setMakeSearch] = useState("");
  const [makes, setMakes] = useState<string[]>(() => {
    const m = attrs.approved_makes; return Array.isArray(m) ? (m as string[]) : [];
  });
  function handleTypeChange(type: string) {
    const defaults = buildDosingPumpDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(DOSING_ALL_FIELD_OPTS)) {
      if (opts.length === 0) continue;
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); setMakes([]); onChange({ ...defaults, approved_makes: [] });
  }
  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom((c) => ({ ...c, [key]: true })); onChange({ ...attrs, [key]: "" }); }
    else { setCustom((c) => ({ ...c, [key]: false })); onChange({ ...attrs, [key]: val }); }
  }
  function set(key: string, val: unknown) { onChange({ ...attrs, [key]: val }); }
  function renderField(key: string, label: string, opts: string[], required?: boolean) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }
  function renderFreeText(key: string, label: string, placeholder?: string, required?: boolean) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <Input className="h-8 text-sm" placeholder={placeholder ?? `Enter ${label}…`}
          value={(attrs[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} />
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
  function addMake(make: string) {
    const t = make.trim(); if (!t || makes.includes(t)) return;
    const next = [...makes, t]; setMakes(next); onChange({ ...attrs, approved_makes: next }); setMakeSearch("");
  }
  function removeMake(m: string) { const next = makes.filter((x) => x !== m); setMakes(next); onChange({ ...attrs, approved_makes: next }); }
  function moveMake(i: number, dir: -1 | 1) {
    const next = [...makes]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]]; setMakes(next); onChange({ ...attrs, approved_makes: next });
  }
  const pumpType    = (attrs.pump_type as string) ?? "";
  const isDiaphragm = pumpType === "Diaphragm Pump";
  const isPlunger   = pumpType === "Plunger Pump";
  const isPiston    = pumpType === "Piston Pump";
  const isPeris     = pumpType === "Peristaltic Pump";
  const isSolenoid  = pumpType === "Solenoid Dosing Pump";
  const hasType     = isDiaphragm || isPlunger || isPiston || isPeris || isSolenoid;
  const isDoubleD   = (attrs.diaphragm_design as string) === "Double";
  const filteredMakes = DOSING_PUMP_MAKES.filter((m) => m.toLowerCase().includes(makeSearch.toLowerCase()) && !makes.includes(m));

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dosing / Metering Pump Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {sec("Pump Type")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Pump Type <span className="text-red-500">*</span></Label>
          <SearchableSelect value={DOSING_PUMP_TYPES.includes(pumpType) ? pumpType : ""}
            options={DOSING_PUMP_TYPES} placeholder="Select pump type first…"
            onSelect={(v) => handleTypeChange(v)} />
        </div>
        {!hasType && (
          <div className="col-span-2 rounded-md border border-dashed bg-muted/20 py-6 text-center text-xs text-muted-foreground">
            Select a pump type above to configure specifications
          </div>
        )}
        {isDiaphragm && (<>
          {sec("Diaphragm Pump Configuration")}
          {renderField("diaphragm_material", "Diaphragm Material",   DOSING_COMMON_OPTS.diaphragm_material, true)}
          {renderField("diaphragm_design",   "Diaphragm Design",     DOSING_COMMON_OPTS.diaphragm_design,   true)}
          {renderField("control_type",       "Control Type",         DOSING_COMMON_OPTS.ctrl_dp,            true)}
          {renderField("back_pressure_valve","Back Pressure Valve",  DOSING_COMMON_OPTS.yes_no)}
          {isDoubleD ? renderField("leak_detection","Leak Detection",DOSING_COMMON_OPTS.yes_no) : <div />}
          {renderField("degassing_valve",    "Degassing Valve",      DOSING_COMMON_OPTS.yes_no)}
          <div />
        </>)}
        {isPlunger && (<>
          {sec("Plunger Pump Configuration")}
          {renderField("plunger_material", "Plunger Material",   DOSING_COMMON_OPTS.plunger_material, true)}
          {renderField("packing_material", "Packing Material",   DOSING_COMMON_OPTS.packing_material, true)}
          {renderField("num_heads",        "Number of Heads",    DOSING_COMMON_OPTS.num_heads,        true)}
          {renderField("control_type",     "Control Type",       DOSING_COMMON_OPTS.ctrl_pl,          true)}
        </>)}
        {isPiston && (<>
          {sec("Piston Pump Configuration")}
          {renderField("piston_material",  "Piston Material",    DOSING_COMMON_OPTS.piston_material,   true)}
          {renderField("packing_seal_type","Packing / Seal Type",DOSING_COMMON_OPTS.packing_seal_type, true)}
          {renderField("num_heads",        "Number of Heads",    DOSING_COMMON_OPTS.num_heads,         true)}
          {renderField("control_type",     "Control Type",       DOSING_COMMON_OPTS.ctrl_pn,           true)}
        </>)}
        {isPeris && (<>
          {sec("Peristaltic Pump Configuration")}
          {renderField("hose_material",  "Hose / Tube Material", DOSING_COMMON_OPTS.hose_material,  true)}
          {renderField("reversible",     "Reversible",           DOSING_COMMON_OPTS.yes_no,         true)}
          {renderField("speed_control",  "Speed Control",        DOSING_COMMON_OPTS.speed_control,  true)}
          {renderField("ip_rating",      "IP Rating",            DOSING_COMMON_OPTS.ip_rating)}
        </>)}
        {isSolenoid && (<>
          {sec("Solenoid Dosing Pump Configuration")}
          {renderField("diaphragm_material","Diaphragm Material", DOSING_COMMON_OPTS.diaphragm_material, true)}
          {renderField("wetted_material",   "Wetted Material",    DOSING_COMMON_OPTS.wetted_material,    true)}
          {renderField("control_type",      "Control Type",       DOSING_COMMON_OPTS.ctrl_sol,           true)}
          {renderFreeText("max_stroke_rate","Max Stroke Rate (spm)","e.g. 120 spm")}
          {renderField("ip_rating",         "IP Rating",          DOSING_COMMON_OPTS.ip_rating)}
          <div />
        </>)}
        {hasType && (<>
          {sec("Operating Conditions")}
          {renderField("flow_rate",           "Flow Rate",           DOSING_COMMON_OPTS.flow_rate,           true)}
          {renderField("discharge_pressure",  "Discharge Pressure",  DOSING_COMMON_OPTS.discharge_pressure,  true)}
          {renderField("dosing_accuracy",     "Dosing Accuracy",     DOSING_COMMON_OPTS.dosing_accuracy,     true)}
          {renderField("fluid",               "Fluid",               DOSING_COMMON_OPTS.fluid,               true)}
          {renderField("operating_temp",      "Operating Temp",      DOSING_COMMON_OPTS.operating_temp)}
          {renderField("wetted_material",     "Wetted / Body Mat.",  DOSING_COMMON_OPTS.wetted_material,     true)}
          {sec("Pump Configuration")}
          {renderField("mounting",     "Mounting",     DOSING_COMMON_OPTS.mounting,     true)}
          {renderField("drive_type",   "Drive Type",   DOSING_COMMON_OPTS.drive_type,   true)}
          {renderField("service_type", "Service Type", DOSING_COMMON_OPTS.service_type, true)}
          <div />
          {sec("Optional — Controls & Area")}
          {renderFreeText("motor_power",     "Motor Power",          "e.g. 0.37 kW")}
          {renderField("control_panel",      "Control Panel",        ["Integral","Remote","None"])}
          {renderField("pulsation_dampener", "Pulsation Dampener",   DOSING_COMMON_OPTS.yes_no)}
          {renderField("safety_valve",       "Safety / Relief Valve",DOSING_COMMON_OPTS.yes_no)}
          {renderField("area_classification","Area Classification",  DOSING_COMMON_OPTS.area_class)}
          {renderField("certification",      "Certification",        DOSING_COMMON_OPTS.certification)}
          {renderField("spare_parts",        "Spare Parts Package",  DOSING_COMMON_OPTS.spare_parts)}
          <div />
          <div className="col-span-2 mt-1 pb-0.5 border-b">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Approved Makes (ranked) <span className="text-red-500">*</span>
            </p>
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Search or type make…"
                value={makeSearch} onChange={(e) => setMakeSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && makeSearch.trim()) addMake(makeSearch); }} />
              <Button type="button" size="sm" className="h-8" onClick={() => { if (makeSearch.trim()) addMake(makeSearch); }}>Add</Button>
            </div>
            {makeSearch && filteredMakes.length > 0 && (
              <div className="rounded-md border bg-background shadow-sm max-h-32 overflow-y-auto">
                {filteredMakes.map((m) => (
                  <button key={m} type="button" className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted" onClick={() => addMake(m)}>{m}</button>
                ))}
              </div>
            )}
            {makes.length > 0 && (
              <div className="space-y-1">
                {makes.map((m, i) => (
                  <div key={m} className="flex items-center gap-2 rounded-md border px-2 py-1 bg-background">
                    <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}.</span>
                    <span className="flex-1 text-xs">{m}</span>
                    <button type="button" onClick={() => moveMake(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                    <button type="button" onClick={() => moveMake(i, 1)} disabled={i === makes.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                    <button type="button" onClick={() => removeMake(m)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}
        {qty !== undefined && onQtyChange && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
              value={qty} onChange={(e) => onQtyChange(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VACUUM BOOSTER
// ─────────────────────────────────────────────────────────────────────────────
const VB_TYPES = ["Roots Blower","Vacuum Booster","Twin Lobe","Tri-Lobe"];
const VB_ALL_FIELD_OPTS: Record<string, string[]> = {
  booster_type:              VB_TYPES,
  flow_rate:                 ["250 m³/hr","500 m³/hr","1000 m³/hr","2000 m³/hr","4000 m³/hr","6000 m³/hr","10000 m³/hr"],
  suction_pressure:          ["1000 mbar (Atmospheric)","500 mbar","200 mbar","100 mbar","50 mbar","10 mbar","1 mbar","0.1 mbar"],
  discharge_pressure:        ["Atmospheric","Slight Positive","0.1 bar(g)","0.2 bar(g)","0.5 bar(g)","1.0 bar(g)"],
  gas_type:                  ["Air","Nitrogen","Hydrocarbon Vapors","Process Gas","Inert Gas","Water Vapour"],
  material_class:            ["CI","CS","SS304","SS316","Duplex SS"],
  cooling_type:              ["Air Cooled","Water Cooled"],
  drive_type:                ["Direct Drive","Belt Drive","Gear Drive","VFD Drive"],
  rotor_profile:             ["Involute","Cycloidal"],
  pressure_differential:     ["0.1 bar","0.2 bar","0.3 bar","0.5 bar","0.7 bar","1.0 bar"],
  synchronizing_gears:       ["Yes","No"],
  oil_sealed:                ["Oil Sealed","Dry Running"],
  silencer_included:         ["Yes","No"],
  bypass_valve:              ["Internal Bypass","External Bypass","None"],
  backing_pump_type:         ["Oil Sealed Rotary Vane","Dry Rotary Screw","Liquid Ring"],
  booster_compression_ratio: ["2:1","3:1","4:1","5:1"],
  motor_power_kw:            ["1.1 kW","1.5 kW","2.2 kW","3.7 kW","5.5 kW","7.5 kW",
                               "11 kW","15 kW","18.5 kW","22 kW","30 kW","37 kW","45 kW","55 kW","75 kW"],
  speed_rpm:                 ["960 RPM","1450 RPM","1500 RPM","2900 RPM","3000 RPM","Variable"],
  area_classification:       ["Safe Area","Zone 1","Zone 2"],
  atex_rating:               ["Ex d","Ex e","Ex n","Non-ATEX"],
  ip_rating_motor:           ["IP44","IP54","IP55","IP65"],
  operating_temp:            ["Ambient","50°C","80°C","100°C","120°C","150°C"],
};
const VACUUM_BOOSTER_MAKES = [
  "MD-Kinney","Busch","Pfeiffer","Atlas Copco","Leybold","Edwards","Elmo Rietschle","Tuthill","Agilent",
];

function buildVacuumBoosterDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    booster_type: type, approved_makes: [],
    flow_rate: "", suction_pressure: "", discharge_pressure: "",
    gas_type: "", material_class: "CI", cooling_type: "Air Cooled",
    drive_type: "Direct Drive", rotor_profile: "", pressure_differential: "",
    synchronizing_gears: "", oil_sealed: "", silencer_included: "",
    bypass_valve: "", backing_pump_type: "", booster_compression_ratio: "",
    motor_power_kw: "", speed_rpm: "", area_classification: "",
    atex_rating: "", ip_rating_motor: "", operating_temp: "",
    noise_level: "", inlet_size: "",
  };
  switch (type) {
    case "Roots Blower":
      return { ...base, rotor_profile: "Involute", drive_type: "Direct Drive", synchronizing_gears: "Yes", oil_sealed: "Oil Sealed" };
    case "Vacuum Booster":
      return { ...base, drive_type: "Direct Drive", bypass_valve: "Internal Bypass", backing_pump_type: "Oil Sealed Rotary Vane", booster_compression_ratio: "3:1" };
    case "Twin Lobe":
      return { ...base, rotor_profile: "Involute", drive_type: "Direct Drive", silencer_included: "Yes" };
    case "Tri-Lobe":
      return { ...base, drive_type: "Direct Drive", silencer_included: "Yes" };
    default: return base;
  }
}

export function buildVacuumBoosterRequirement(attrs: Record<string, unknown>): string {
  const boosterType = (attrs.booster_type     as string)?.trim() || "";
  const flowRate    = (attrs.flow_rate        as string)?.trim() || "";
  const suctionPres = (attrs.suction_pressure as string)?.trim() || "";
  const gasType     = (attrs.gas_type         as string)?.trim() || "";
  const parts: string[] = ["Vacuum Booster"];
  if (boosterType) parts.push(boosterType);
  if (flowRate)    parts.push(flowRate);
  if (suctionPres) parts.push(`${suctionPres} suction`);
  if (gasType)     parts.push(`${gasType} Service`);
  return parts.join(", ");
}

export function VacuumBoosterAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const vbType = (attrs.booster_type as string) ?? "";
  function handleTypeChange(newType: string) {
    onChange({ ...buildVacuumBoosterDefaults(newType), approved_makes: [] });
  }
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of Object.keys(VB_ALL_FIELD_OPTS)) {
      const val  = (attrs[key] as string) ?? "";
      const opts = VB_ALL_FIELD_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom((c) => ({ ...c, [key]: true })); onChange({ ...attrs, [key]: "" }); }
    else { setCustom((c) => ({ ...c, [key]: false })); onChange({ ...attrs, [key]: val }); }
  }
  function renderField(key: string, label: string, required?: boolean, freeText?: boolean) {
    const curVal = (attrs[key] as string) ?? "";
    if (freeText) {
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
          <Input className="h-8 text-sm" placeholder="Enter value…"
            value={curVal} onChange={(e) => onChange({ ...attrs, [key]: e.target.value })} />
        </div>
      );
    }
    const opts      = VB_ALL_FIELD_OPTS[key] ?? [];
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && <Input className="h-8 text-sm" placeholder="Enter custom value…"
          value={curVal} onChange={(e) => onChange({ ...attrs, [key]: e.target.value })} autoFocus />}
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
  const [makesQuery, setMakesQuery]         = useState("");
  const [makesOpen, setMakesOpen]           = useState(false);
  const [customMakeVal, setCustomMakeVal]   = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const approvedMakes: string[] = (attrs.approved_makes as string[]) ?? [];
  function moveMake(idx: number, dir: -1 | 1) {
    const next = [...approvedMakes]; const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange({ ...attrs, approved_makes: next });
  }
  function removeMake(idx: number) { onChange({ ...attrs, approved_makes: approvedMakes.filter((_, i) => i !== idx) }); }
  function addMake(make: string) {
    if (!make.trim() || approvedMakes.includes(make.trim())) return;
    onChange({ ...attrs, approved_makes: [...approvedMakes, make.trim()] });
  }
  function addCustomMakeConfirm() { addMake(customMakeVal); setCustomMakeVal(""); setShowCustomMake(false); }
  const filteredMakes = VACUUM_BOOSTER_MAKES.filter(
    (o) => !approvedMakes.includes(o) && o.toLowerCase().includes(makesQuery.toLowerCase()));
  const isRoots   = vbType === "Roots Blower";
  const isBooster = vbType === "Vacuum Booster";
  const isTwin    = vbType === "Twin Lobe";
  const isTri     = vbType === "Tri-Lobe";

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vacuum Booster Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Booster Type <span className="text-red-500">*</span></Label>
          <SearchableSelect value={VB_TYPES.includes(vbType) ? vbType : ""}
            options={VB_TYPES} placeholder="Select booster type…"
            onSelect={(v) => handleTypeChange(v)} />
        </div>
        {isRoots && (<>
          {sectionHeader("Roots Blower — Configuration")}
          {renderField("rotor_profile",        "Rotor Profile")}
          {renderField("drive_type",           "Drive Type")}
          {renderField("pressure_differential","Pressure Differential")}
          {renderField("synchronizing_gears",  "Synchronizing Gears")}
          {renderField("oil_sealed",           "Sealing Type")}
          {renderField("inlet_size",           "Inlet Size (DN/NPS)", false, true)}
        </>)}
        {isBooster && (<>
          {sectionHeader("Vacuum Booster — Configuration")}
          {renderField("booster_compression_ratio","Compression Ratio")}
          {renderField("bypass_valve",             "Bypass Valve")}
          {renderField("backing_pump_type",        "Backing Pump Type")}
          {renderField("drive_type",               "Drive Type")}
          {renderField("inlet_size",               "Inlet Size (DN/NPS)", false, true)}
        </>)}
        {isTwin && (<>
          {sectionHeader("Twin Lobe — Configuration")}
          {renderField("rotor_profile",        "Rotor Profile")}
          {renderField("drive_type",           "Drive Type")}
          {renderField("pressure_differential","Pressure Differential")}
          {renderField("silencer_included",    "Silencer Included")}
          {renderField("inlet_size",           "Inlet Size (DN/NPS)", false, true)}
        </>)}
        {isTri && (<>
          {sectionHeader("Tri-Lobe — Configuration")}
          {renderField("drive_type",           "Drive Type")}
          {renderField("pressure_differential","Pressure Differential")}
          {renderField("silencer_included",    "Silencer Included")}
          {renderField("noise_level",          "Noise Level Target", false, true)}
          {renderField("inlet_size",           "Inlet Size (DN/NPS)", false, true)}
        </>)}
        {vbType && (<>
          {sectionHeader("Operating Conditions")}
          {renderField("flow_rate",          "Flow Rate (m³/hr)",  true)}
          {renderField("suction_pressure",   "Suction Pressure",   true)}
          {renderField("discharge_pressure", "Discharge Pressure", true)}
          {renderField("gas_type",           "Gas Type",           true)}
          {renderField("material_class",     "Material Class",     true)}
          {renderField("cooling_type",       "Cooling Type",       true)}
          {sectionHeader("Optional / Additional")}
          {renderField("motor_power_kw",    "Motor Power (kW)")}
          {renderField("speed_rpm",         "Speed (RPM)")}
          {renderField("operating_temp",    "Operating Temp")}
          {renderField("area_classification","Area Classification")}
          {renderField("atex_rating",       "ATEX Rating")}
          {renderField("ip_rating_motor",   "IP Rating (Motor)")}
          {sectionHeader("Approved Makes (Ranked)")}
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2">
              <Popover open={makesOpen} onOpenChange={setMakesOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" />Add Make
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                    <CommandList>
                      <CommandEmpty>No results.</CommandEmpty>
                      <CommandGroup>
                        {filteredMakes.map((opt) => (
                          <CommandItem key={opt} value={opt} onSelect={() => { addMake(opt); setMakesOpen(false); setMakesQuery(""); }}>
                            {opt}
                          </CommandItem>
                        ))}
                        <CommandItem value="__custom__" onSelect={() => { setShowCustomMake(true); setMakesOpen(false); }}>
                          <Plus className="mr-2 h-4 w-4" />Add custom make…
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {approvedMakes.length === 0 && (
                <span className="text-[11px] text-muted-foreground self-center">No makes added yet</span>
              )}
            </div>
            {showCustomMake && (
              <div className="flex gap-2">
                <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
                  value={customMakeVal} onChange={(e) => setCustomMakeVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMakeConfirm(); } }}
                  autoFocus />
                <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomMakeConfirm}>Add</Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                  onClick={() => { setShowCustomMake(false); setCustomMakeVal(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {approvedMakes.length > 0 && (
              <div className="space-y-1">
                {approvedMakes.map((make, idx) => (
                  <div key={make} className="flex items-center gap-2 rounded border bg-background px-2 py-1">
                    <span className="text-[11px] font-semibold text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
                    <span className="text-xs flex-1">{make}</span>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" type="button" onClick={() => moveMake(idx, -1)} disabled={idx === 0}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" type="button" onClick={() => moveMake(idx, 1)} disabled={idx === approvedMakes.length - 1}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" type="button" onClick={() => removeMake(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}
        {qty !== undefined && onQtyChange && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
              value={qty} onChange={(e) => onQtyChange(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VACUUM PUMP
// ─────────────────────────────────────────────────────────────────────────────
const VP_TYPES = ["Liquid Ring", "Dry Screw", "Rotary Vane", "Reciprocating", "Steam Jet Ejector"];
const VP_ALL_FIELD_OPTS: Record<string, string[]> = {
  vacuum_pump_type:         VP_TYPES,
  sealing_liquid:           ["Water", "Process Liquid", "Oil", "Other"],
  compression_stages:       ["Single Stage", "Two Stage"],
  screw_profile:            ["Parallel", "Twisted"],
  cooling_type:             ["Air Cooled", "Water Cooled", "Oil Cooled"],
  gearbox_lubrication:      ["Splash Lubricated", "Force Lubricated"],
  oil_sealed:               ["Yes", "No (Oil-Free)"],
  num_stages_rv:            ["Single Stage", "Two Stage"],
  num_cylinders:            ["1", "2", "4"],
  cylinder_lubrication:     ["Oil Lubricated", "Oil-Free"],
  port_connection:          ["Flanged", "NPT", "BSP"],
  num_stages_ejector:       ["1", "2", "3", "4", "5", "6"],
  intercondenser_type:      ["Barometric", "Surface", "None"],
  after_condenser:          ["Yes", "No"],
  condenser_cooling_medium: ["Cooling Water", "Sea Water", "Air"],
  suction_capacity_m3hr:    ["5", "10", "20", "30", "50", "75", "100", "150", "200", "300", "500", "750", "1000"],
  operating_vacuum_mbar:    ["10", "25", "33", "50", "100", "150", "200", "300", "500", "700"],
  ultimate_vacuum_mbar:     ["0.01", "0.1", "1", "5", "10", "20", "33", "50"],
  discharge_pressure_barg:  ["0", "0.5", "1", "1.5", "2", "3", "5"],
  gas_type:                 ["Air", "Steam–Air Mixture", "Hydrocarbon Gas", "Nitrogen", "Water Vapour", "Solvent Vapour", "Other"],
  condensable_vapours:      ["Yes", "No"],
  liquid_carry_over:        ["Yes", "No"],
  mounting:                 ["Base Mounted", "Skid Mounted", "Close-Coupled"],
  drive_type:               ["Motor Driven", "Belt Drive", "Engine Driven"],
  coupling_type:            ["Flexible Coupling", "V-Belt", "Direct Drive", "Spacer Coupling"],
  seal_type:                ["Single Mechanical Seal", "Double Mechanical Seal", "Dry Running Seal", "Lip Seal", "Piston Ring", "Liquid Ring (Integral)"],
  material_class:           ["CI", "CS", "SS304", "SS316", "Duplex SS"],
  service_type:             ["Continuous", "Intermittent", "Standby", "Duty-Standby"],
  motor_power_kw:           ["0.37 kW", "0.55 kW", "0.75 kW", "1.1 kW", "1.5 kW", "2.2 kW", "3.7 kW",
                             "5.5 kW", "7.5 kW", "11 kW", "15 kW", "18.5 kW", "22 kW", "30 kW",
                             "37 kW", "45 kW", "55 kW", "75 kW", "90 kW", "110 kW", "132 kW"],
  supply_voltage:           ["415V 3Ph 50Hz", "11kV 3Ph 50Hz", "220V 1Ph 50Hz"],
  motor_enclosure:          ["TEFC (IP55)", "TEFC (IP65)", "Flameproof (Ex d)", "Weatherproof (WP)"],
  motor_efficiency_class:   ["IE2", "IE3", "IE4"],
  speed_rpm:                ["960 RPM", "1450 RPM", "1500 RPM", "2900 RPM", "2950 RPM", "Variable"],
  vfd_required:             ["Yes", "No"],
};
const VACUUM_PUMP_MAKES = [
  "Busch", "Gardner Denver (Elmo Rietschle)", "Nash (Atlas Copco)", "Sterling SIHI (SPX Flow)",
  "Pfeiffer Vacuum", "Atlas Copco", "Becker", "Kinetic Pumps", "Cutes Corporation",
  "Graham Corporation", "Croll-Reynolds", "Mazda Vacuum",
];
const VP_SEAL_DEFAULTS: Record<string, string> = {
  "Liquid Ring":       "Liquid Ring (Integral)",
  "Dry Screw":         "Dry Running Seal",
  "Rotary Vane":       "Lip Seal",
  "Reciprocating":     "Piston Ring",
  "Steam Jet Ejector": "",
};

function buildVacuumPumpDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    vacuum_pump_type: type, approved_makes: [],
    sealing_liquid: "", sealing_liquid_temp_c: "", compression_stages: "",
    screw_profile: "", cooling_type: "", gearbox_lubrication: "",
    oil_sealed: "", num_stages_rv: "", num_cylinders: "", cylinder_lubrication: "",
    port_connection: "", port_size: "", num_stages_ejector: "",
    intercondenser_type: "", after_condenser: "", condenser_cooling_medium: "",
    motive_steam_pressure: "",
    suction_capacity_m3hr: "", operating_vacuum_mbar: "", ultimate_vacuum_mbar: "",
    discharge_pressure_barg: "0", gas_type: "", gas_inlet_temp_c: "",
    condensable_vapours: "", liquid_carry_over: "",
    mounting: "Base Mounted", drive_type: "Motor Driven",
    material_class: "CI", service_type: "Continuous",
    seal_type: VP_SEAL_DEFAULTS[type] ?? "",
    coupling_type: "", noise_level_dba: "",
    motor_power_kw: "", supply_voltage: "415V 3Ph 50Hz",
    motor_enclosure: "TEFC (IP55)", motor_efficiency_class: "IE3",
    speed_rpm: "", vfd_required: "No",
  };
  switch (type) {
    case "Liquid Ring":
      return { ...base, sealing_liquid: "Water", compression_stages: "Single Stage",
        port_connection: "Flanged", cooling_type: "Water Cooled" };
    case "Dry Screw":
      return { ...base, compression_stages: "Single Stage", screw_profile: "Twisted",
        cooling_type: "Air Cooled", port_connection: "Flanged", material_class: "CS" };
    case "Rotary Vane":
      return { ...base, oil_sealed: "Yes", num_stages_rv: "Single Stage",
        cooling_type: "Air Cooled", port_connection: "Flanged" };
    case "Reciprocating":
      return { ...base, num_cylinders: "2", compression_stages: "Single Stage",
        cooling_type: "Air Cooled", material_class: "CS" };
    case "Steam Jet Ejector":
      return { ...base, num_stages_ejector: "2", intercondenser_type: "Barometric",
        after_condenser: "Yes", condenser_cooling_medium: "Cooling Water",
        motor_power_kw: "", supply_voltage: "", motor_enclosure: "",
        motor_efficiency_class: "", speed_rpm: "", vfd_required: "", seal_type: "" };
    default: return base;
  }
}

export function buildVacuumPumpRequirement(attrs: Record<string, unknown>): string {
  const vpType   = (attrs.vacuum_pump_type      as string)?.trim() || "";
  const capacity = (attrs.suction_capacity_m3hr as string)?.trim() || "";
  const vacuum   = (attrs.operating_vacuum_mbar as string)?.trim() || "";
  const mat      = (attrs.material_class        as string)?.trim() || "";
  const gas      = (attrs.gas_type              as string)?.trim() || "";
  const parts: string[] = ["Vacuum Pump"];
  if (vpType)   parts.push(vpType);
  const opCond: string[] = [];
  if (capacity) opCond.push(`${capacity} m³/hr`);
  if (vacuum)   opCond.push(`${vacuum} mbar abs`);
  if (opCond.length === 2) parts.push(opCond.join(" @ "));
  else if (opCond.length === 1) parts.push(opCond[0]);
  if (mat)      parts.push(mat);
  if (gas)      parts.push(`${gas} Service`);
  return parts.join(", ");
}

export function VacuumPumpAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const vpType = (attrs.vacuum_pump_type as string) ?? "";
  function handleTypeChange(newType: string) {
    onChange({ ...buildVacuumPumpDefaults(newType), approved_makes: [] });
  }
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of Object.keys(VP_ALL_FIELD_OPTS)) {
      const val  = (attrs[key] as string) ?? "";
      const opts = VP_ALL_FIELD_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom((c) => ({ ...c, [key]: true })); onChange({ ...attrs, [key]: "" }); }
    else { setCustom((c) => ({ ...c, [key]: false })); onChange({ ...attrs, [key]: val }); }
  }
  function set(key: string, val: unknown) { onChange({ ...attrs, [key]: val }); }
  function renderField(key: string, label: string, required?: boolean, freeText?: boolean) {
    const curVal = (attrs[key] as string) ?? "";
    if (freeText) {
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
          <Input className="h-8 text-sm" placeholder="Enter value…" value={curVal} onChange={(e) => set(key, e.target.value)} />
        </div>
      );
    }
    const opts      = VP_ALL_FIELD_OPTS[key] ?? [];
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }
  function renderReadOnly(label: string, value: string) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label} <span className="text-red-500">*</span></Label>
        <Input className="h-8 text-sm bg-muted/50 text-muted-foreground cursor-default" readOnly value={value} />
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
  const [makesQuery, setMakesQuery]         = useState("");
  const [makesOpen, setMakesOpen]           = useState(false);
  const [customMakeVal, setCustomMakeVal]   = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const approvedMakes: string[] = (attrs.approved_makes as string[]) ?? [];
  function moveMake(idx: number, dir: -1 | 1) {
    const next = [...approvedMakes]; const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange({ ...attrs, approved_makes: next });
  }
  function removeMake(idx: number) { onChange({ ...attrs, approved_makes: approvedMakes.filter((_, i) => i !== idx) }); }
  function addMake(make: string) {
    if (!make.trim() || approvedMakes.includes(make.trim())) return;
    onChange({ ...attrs, approved_makes: [...approvedMakes, make.trim()] });
  }
  function addCustomMakeConfirm() { addMake(customMakeVal); setCustomMakeVal(""); setShowCustomMake(false); }
  const filteredMakes = VACUUM_PUMP_MAKES.filter(
    (o) => !approvedMakes.includes(o) && o.toLowerCase().includes(makesQuery.toLowerCase()));
  const isLiquidRing = vpType === "Liquid Ring";
  const isDryScrew   = vpType === "Dry Screw";
  const isRotaryVane = vpType === "Rotary Vane";
  const isRecip      = vpType === "Reciprocating";
  const isEjector    = vpType === "Steam Jet Ejector";
  const hasType      = isLiquidRing || isDryScrew || isRotaryVane || isRecip || isEjector;
  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vacuum Pump Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Vacuum Pump Technology <span className="text-red-500">*</span></Label>
          <SearchableSelect value={VP_TYPES.includes(vpType) ? vpType : ""}
            options={VP_TYPES} placeholder="Select technology first…"
            onSelect={(v) => handleTypeChange(v)} />
        </div>
        {!hasType && (
          <div className="col-span-2 rounded-md border border-dashed bg-muted/20 py-6 text-center text-xs text-muted-foreground">
            Select a vacuum pump technology above to configure specifications
          </div>
        )}
        {isLiquidRing && (<>
          {sectionHeader("Liquid Ring — Configuration")}
          {renderField("sealing_liquid",       "Sealing Liquid",      true)}
          {renderField("compression_stages",   "Compression Stages")}
          {renderField("port_connection",      "Port Connection",     true)}
          {renderField("sealing_liquid_temp_c","Sealing Liquid Temp (°C)", false, true)}
          {renderField("port_size",            "Port Size (DN/NPS)",  false, true)}
          <div />
        </>)}
        {isDryScrew && (<>
          {sectionHeader("Dry Screw — Configuration")}
          {renderField("compression_stages",  "Compression Stages",  true)}
          {renderField("screw_profile",       "Screw Profile",       true)}
          {renderField("cooling_type",        "Cooling Type",        true)}
          {renderField("gearbox_lubrication", "Gearbox Lubrication")}
          {renderField("port_connection",     "Port Connection",     true)}
          {renderField("port_size",           "Port Size (DN/NPS)",  false, true)}
        </>)}
        {isRotaryVane && (<>
          {sectionHeader("Rotary Vane — Configuration")}
          {renderField("oil_sealed",      "Oil Sealed",         true)}
          {renderField("num_stages_rv",   "Number of Stages",   true)}
          {renderField("cooling_type",    "Cooling Type",       true)}
          {renderField("port_connection", "Port Connection",    true)}
          {renderField("port_size",       "Port Size (DN/NPS)", false, true)}
          <div />
        </>)}
        {isRecip && (<>
          {sectionHeader("Reciprocating — Configuration")}
          {renderField("num_cylinders",       "Number of Cylinders", true)}
          {renderField("compression_stages",  "Compression Stages",  true)}
          {renderField("cooling_type",        "Cooling Type",        true)}
          {renderField("cylinder_lubrication","Cylinder Lubrication")}
          {renderField("port_connection",     "Port Connection")}
          {renderField("port_size",           "Port Size (DN/NPS)",  false, true)}
        </>)}
        {isEjector && (<>
          {sectionHeader("Steam Jet Ejector — Configuration")}
          {renderField("num_stages_ejector",       "Number of Stages",        true)}
          {renderField("motive_steam_pressure",    "Motive Steam Pressure",   true, true)}
          {renderField("intercondenser_type",      "Intercondenser Type")}
          {renderField("after_condenser",          "After Condenser")}
          {renderField("condenser_cooling_medium", "Condenser Cooling Medium")}
          <div />
        </>)}
        {hasType && (<>
          {sectionHeader("Operating Conditions")}
          {renderField("suction_capacity_m3hr",  "Suction Capacity (m³/hr)",    true)}
          {renderField("operating_vacuum_mbar",  "Operating Vacuum (mbar abs)", true)}
          {renderField("discharge_pressure_barg","Discharge Pressure (bar g)",  true)}
          {renderField("gas_type",               "Gas / Vapour Handled",        true)}
          {renderField("ultimate_vacuum_mbar",   "Ultimate Vacuum (mbar abs)")}
          {renderField("gas_inlet_temp_c",       "Gas Inlet Temp (°C)",         false, true)}
          {renderField("condensable_vapours",    "Condensable Vapours Present")}
          {renderField("liquid_carry_over",      "Liquid Carry-Over Risk")}
          {sectionHeader("Mechanical Configuration")}
          {renderField("mounting",      "Mounting",      true)}
          {renderField("drive_type",    "Drive Type",    true)}
          {renderField("material_class","Material Class",true)}
          {renderField("service_type",  "Service Type",  true)}
          {isEjector
            ? <div />
            : isLiquidRing
              ? renderReadOnly("Seal Type", "Liquid Ring (Integral)")
              : renderField("seal_type", "Seal Type", true)
          }
          {renderField("coupling_type",   "Coupling Type")}
          {renderField("noise_level_dba", "Noise Level Target", false, true)}
          <div />
          {!isEjector && (<>
            {sectionHeader("Electrical & Motor")}
            {renderField("motor_power_kw",        "Motor Power (kW)",  true)}
            {renderField("supply_voltage",        "Supply Voltage",    true)}
            {renderField("motor_enclosure",       "Motor Enclosure")}
            {renderField("motor_efficiency_class","Efficiency Class")}
            {renderField("speed_rpm",             "Speed (RPM)")}
            {renderField("vfd_required",          "VFD Required")}
          </>)}
          {sectionHeader("Approved Makes (Ranked)")}
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2">
              <Popover open={makesOpen} onOpenChange={setMakesOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" />Add Make
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                    <CommandList>
                      <CommandEmpty>No results.</CommandEmpty>
                      <CommandGroup>
                        {filteredMakes.map((opt) => (
                          <CommandItem key={opt} value={opt} onSelect={() => { addMake(opt); setMakesOpen(false); setMakesQuery(""); }}>
                            {opt}
                          </CommandItem>
                        ))}
                        <CommandItem value="__custom__" onSelect={() => { setShowCustomMake(true); setMakesOpen(false); }}>
                          <Plus className="mr-2 h-4 w-4" />Add custom make…
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {approvedMakes.length === 0 && (
                <span className="text-[11px] text-muted-foreground self-center">No makes added yet — at least 1 required</span>
              )}
            </div>
            {showCustomMake && (
              <div className="flex gap-2">
                <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
                  value={customMakeVal} onChange={(e) => setCustomMakeVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMakeConfirm(); } }}
                  autoFocus />
                <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomMakeConfirm}>Add</Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                  onClick={() => { setShowCustomMake(false); setCustomMakeVal(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {approvedMakes.length > 0 && (
              <div className="space-y-1">
                {approvedMakes.map((make, idx) => (
                  <div key={make} className="flex items-center gap-2 rounded border bg-background px-2 py-1">
                    <span className="text-[11px] font-semibold text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
                    <span className="text-xs flex-1">{make}</span>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" type="button" onClick={() => moveMake(idx, -1)} disabled={idx === 0}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" type="button" onClick={() => moveMake(idx, 1)} disabled={idx === approvedMakes.length - 1}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" type="button" onClick={() => removeMake(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}
        {qty !== undefined && onQtyChange && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
              value={qty} onChange={(e) => onQtyChange(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PUMP SKID
// ─────────────────────────────────────────────────────────────────────────────
const PUMP_SKID_PKG_TYPES = [
  "Single Pump Skid","Duplex Pump Skid (1W + 1S)","Triplex Pump Skid (2W + 1S)","Custom Package",
];
const PS_ALL_FIELD_OPTS: Record<string, string[]> = {
  package_type:      PUMP_SKID_PKG_TYPES,
  pump_type:         ["Centrifugal","Multistage","Gear","Screw","Dosing / Metering","Vacuum Booster","Reciprocating"],
  flow_rate:         ["1 m³/hr","2 m³/hr","5 m³/hr","10 m³/hr","20 m³/hr","50 m³/hr","100 m³/hr","200 m³/hr","500 m³/hr"],
  head_pressure:     ["10 m","20 m","50 m","100 m","150 m","200 m","1 bar","2 bar","5 bar","10 bar","20 bar","50 bar"],
  num_pumps:         ["1","2","3","4"],
  standby_config:    ["No Standby","1 Working + 1 Standby","2 Working + 1 Standby","3 Working + 0 Standby"],
  mounting:          ["Base Mounted","Skid Mounted","Containerized"],
  fluid:             ["Water","Boiler Feed Water","Oil","Chemical","Sea Water","Process Gas","Other"],
  material_class:    ["CS","SS304","SS316","Duplex SS"],
  driver_type:       ["Electric Motor","Diesel Engine","Gas Turbine","Steam Turbine"],
  testing_standard:  ["API 610","Hydrostatic Only","Third Party Witnessing","No Testing Required"],
  pipeline_class:    ["ASME B16.5","DIN 2501","BS 4504","Not Specified"],
};
const PUMP_SKID_COMPONENT_OPTS = [
  "Pumps","Motor","Base Frame","Coupling","Control Panel",
  "VFD","Instrumentation","Piping","Valves","NRV",
  "Pressure Gauges","Flow Meter","Strainer","Relief Valve","Expansion Joints",
];
const PUMP_SKID_MAKES = [
  "Flowserve","KSB","Grundfos","Sulzer","Ebara","Ruhrpumpen","SPX","Peerless","Kirloskar","WILO",
];

function buildPumpSkidDefaults(pkgType: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    package_type: pkgType, approved_makes: [], included_components: [],
    pump_type: "", flow_rate: "", head_pressure: "",
    num_pumps: "", standby_config: "No Standby", mounting: "Skid Mounted",
    fluid: "", material_class: "CS", driver_type: "Electric Motor",
    testing_standard: "", pipeline_class: "Not Specified",
  };
  switch (pkgType) {
    case "Single Pump Skid":          return { ...base, num_pumps: "1", standby_config: "No Standby" };
    case "Duplex Pump Skid (1W + 1S)":return { ...base, num_pumps: "2", standby_config: "1 Working + 1 Standby" };
    case "Triplex Pump Skid (2W + 1S)":return { ...base, num_pumps: "3", standby_config: "2 Working + 1 Standby" };
    default: return base;
  }
}

export function buildPumpSkidRequirement(attrs: Record<string, unknown>): string {
  const pkgType    = (attrs.package_type        as string)?.trim()   || "";
  const pumpType   = (attrs.pump_type           as string)?.trim()   || "";
  const flowRate   = (attrs.flow_rate           as string)?.trim()   || "";
  const standby    = (attrs.standby_config      as string)?.trim()   || "";
  const fluid      = (attrs.fluid               as string)?.trim()   || "";
  const components = (attrs.included_components as string[])         ?? [];
  const pkgLabel     = pkgType.replace(/\s*\(.*\)$/, "");
  const pumpLabel    = pumpType ? `${pumpType} Pumps` : "";
  const standbyLabel = standby
    .replace("1 Working + 1 Standby", "1W+1S")
    .replace("2 Working + 1 Standby", "2W+1S");
  const parts: string[] = [];
  if (pkgLabel)  parts.push(pkgLabel);
  if (pumpLabel) parts.push(pumpLabel);
  if (flowRate)  parts.push(flowRate);
  if (fluid)     parts.push(`${fluid} Service`);
  if (standbyLabel && standbyLabel !== "No Standby") parts.push(standbyLabel);
  if (components.length > 0) parts.push(`Complete with ${components.slice(0, 3).join(", ")}`);
  return parts.join(", ");
}

export function PumpSkidAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const pkgType = (attrs.package_type as string) ?? "";
  function handleTypeChange(newPkgType: string) {
    onChange({ ...buildPumpSkidDefaults(newPkgType), approved_makes: [], included_components: [] });
  }
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of Object.keys(PS_ALL_FIELD_OPTS)) {
      const val  = (attrs[key] as string) ?? "";
      const opts = PS_ALL_FIELD_OPTS[key] ?? [];
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom((c) => ({ ...c, [key]: true })); onChange({ ...attrs, [key]: "" }); }
    else { setCustom((c) => ({ ...c, [key]: false })); onChange({ ...attrs, [key]: val }); }
  }
  function renderField(key: string, label: string, required?: boolean) {
    const opts      = PS_ALL_FIELD_OPTS[key] ?? [];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && <Input className="h-8 text-sm" placeholder="Enter custom value…"
          value={curVal} onChange={(e) => onChange({ ...attrs, [key]: e.target.value })} autoFocus />}
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
  const [compOpen, setCompOpen]             = useState(false);
  const [compQuery, setCompQuery]           = useState("");
  const [showCustomComp, setShowCustomComp] = useState(false);
  const [customCompVal, setCustomCompVal]   = useState("");
  const includedComponents: string[] = (attrs.included_components as string[]) ?? [];
  function addComp(comp: string) {
    if (!comp.trim() || includedComponents.includes(comp.trim())) return;
    onChange({ ...attrs, included_components: [...includedComponents, comp.trim()] });
  }
  function removeComp(comp: string) { onChange({ ...attrs, included_components: includedComponents.filter((c) => c !== comp) }); }
  function addCustomCompConfirm() { addComp(customCompVal); setCustomCompVal(""); setShowCustomComp(false); }
  const filteredComps = PUMP_SKID_COMPONENT_OPTS.filter(
    (o) => !includedComponents.includes(o) && o.toLowerCase().includes(compQuery.toLowerCase()));
  const [makesQuery, setMakesQuery]         = useState("");
  const [makesOpen, setMakesOpen]           = useState(false);
  const [customMakeVal, setCustomMakeVal]   = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const approvedMakes: string[] = (attrs.approved_makes as string[]) ?? [];
  function moveMake(idx: number, dir: -1 | 1) {
    const next = [...approvedMakes]; const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange({ ...attrs, approved_makes: next });
  }
  function removeMake(idx: number) { onChange({ ...attrs, approved_makes: approvedMakes.filter((_, i) => i !== idx) }); }
  function addMake(make: string) {
    if (!make.trim() || approvedMakes.includes(make.trim())) return;
    onChange({ ...attrs, approved_makes: [...approvedMakes, make.trim()] });
  }
  function addCustomMakeConfirm() { addMake(customMakeVal); setCustomMakeVal(""); setShowCustomMake(false); }
  const filteredMakes = PUMP_SKID_MAKES.filter(
    (o) => !approvedMakes.includes(o) && o.toLowerCase().includes(makesQuery.toLowerCase()));

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pump Skid Package Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Package Type <span className="text-red-500">*</span></Label>
          <SearchableSelect value={PUMP_SKID_PKG_TYPES.includes(pkgType) ? pkgType : ""}
            options={PUMP_SKID_PKG_TYPES} placeholder="Select package type…"
            onSelect={(v) => handleTypeChange(v)} />
        </div>
        {pkgType && (<>
          {sectionHeader("Pump Details")}
          {renderField("pump_type",     "Pump Type",     true)}
          {renderField("num_pumps",     "Number of Pumps")}
          {renderField("standby_config","Standby Config")}
          {renderField("driver_type",   "Driver Type")}
          {sectionHeader("Capacity (Indicative)")}
          {renderField("flow_rate",     "Flow Rate (m³/hr)")}
          {renderField("head_pressure", "Head / Pressure")}
          {renderField("fluid",         "Process Fluid")}
          {sectionHeader("Package Configuration")}
          {renderField("mounting",         "Mounting")}
          {renderField("material_class",   "Material Class")}
          {renderField("testing_standard", "Testing Standard")}
          {renderField("pipeline_class",   "Pipeline Class")}
          {sectionHeader("Scope of Supply")}
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2 flex-wrap">
              <Popover open={compOpen} onOpenChange={setCompOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" />Add Component
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search…" value={compQuery} onValueChange={setCompQuery} />
                    <CommandList>
                      <CommandEmpty>No results.</CommandEmpty>
                      <CommandGroup>
                        {filteredComps.map((opt) => (
                          <CommandItem key={opt} value={opt} onSelect={() => { addComp(opt); setCompOpen(false); setCompQuery(""); }}>
                            {opt}
                          </CommandItem>
                        ))}
                        <CommandItem value="__custom_comp__" onSelect={() => { setShowCustomComp(true); setCompOpen(false); }}>
                          <Plus className="mr-2 h-4 w-4" />Add custom…
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {includedComponents.length === 0 && (
                <span className="text-[11px] text-muted-foreground self-center">No components added</span>
              )}
            </div>
            {showCustomComp && (
              <div className="flex gap-2">
                <Input className="h-8 text-sm flex-1" placeholder="Enter component…"
                  value={customCompVal} onChange={(e) => setCustomCompVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomCompConfirm(); } }}
                  autoFocus />
                <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomCompConfirm}>Add</Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                  onClick={() => { setShowCustomComp(false); setCustomCompVal(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {includedComponents.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {includedComponents.map((comp) => (
                  <Badge key={comp} variant="secondary" className="text-xs pr-1 gap-1">
                    {comp}
                    <button type="button" onClick={() => removeComp(comp)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          {sectionHeader("Approved Makes (Ranked)")}
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2">
              <Popover open={makesOpen} onOpenChange={setMakesOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" />Add Make
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                    <CommandList>
                      <CommandEmpty>No results.</CommandEmpty>
                      <CommandGroup>
                        {filteredMakes.map((opt) => (
                          <CommandItem key={opt} value={opt} onSelect={() => { addMake(opt); setMakesOpen(false); setMakesQuery(""); }}>
                            {opt}
                          </CommandItem>
                        ))}
                        <CommandItem value="__custom__" onSelect={() => { setShowCustomMake(true); setMakesOpen(false); }}>
                          <Plus className="mr-2 h-4 w-4" />Add custom make…
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {approvedMakes.length === 0 && (
                <span className="text-[11px] text-muted-foreground self-center">Optional — add preferred makes</span>
              )}
            </div>
            {showCustomMake && (
              <div className="flex gap-2">
                <Input className="h-8 text-sm flex-1" placeholder="Enter make name…"
                  value={customMakeVal} onChange={(e) => setCustomMakeVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomMakeConfirm(); } }}
                  autoFocus />
                <Button size="sm" className="h-8 px-3" type="button" onClick={addCustomMakeConfirm}>Add</Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" type="button"
                  onClick={() => { setShowCustomMake(false); setCustomMakeVal(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {approvedMakes.length > 0 && (
              <div className="space-y-1">
                {approvedMakes.map((make, idx) => (
                  <div key={make} className="flex items-center gap-2 rounded border bg-background px-2 py-1">
                    <span className="text-[11px] font-semibold text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
                    <span className="text-xs flex-1">{make}</span>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" type="button" onClick={() => moveMake(idx, -1)} disabled={idx === 0}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" type="button" onClick={() => moveMake(idx, 1)} disabled={idx === approvedMakes.length - 1}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" type="button" onClick={() => removeMake(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}
        {qty !== undefined && onQtyChange && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
              value={qty} onChange={(e) => onQtyChange(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pump subgroup code → validation helper
// ─────────────────────────────────────────────────────────────────────────────
export const PUMP_SUBGROUP_CODES = new Set([
  "centrifugal","gear","screw","multistage","dosing_metering","vacuum_boosters","pump_skid",
]);

export function validatePumpAttrs(subgroupCode: string, attrs: Record<string, unknown>): string | null {
  switch (subgroupCode) {
    case "centrifugal":
      if (!attrs.pump_type)   return "Centrifugal: Pump Type is required";
      if (!attrs.flow_rate)   return "Centrifugal: Flow Rate is required";
      if (!attrs.head)        return "Centrifugal: Head / TDH is required";
      if (!attrs.fluid)       return "Centrifugal: Fluid is required";
      if (!attrs.material_class) return "Centrifugal: Material Class is required";
      if (!attrs.seal_type)   return "Centrifugal: Seal Type is required";
      break;
    case "gear":
      if (!attrs.gear_type)   return "Gear Pump: Gear Type is required";
      if (!attrs.flow_rate)   return "Gear Pump: Flow Rate is required";
      if (!attrs.diff_pressure) return "Gear Pump: Differential Pressure is required";
      if (!attrs.fluid)       return "Gear Pump: Fluid is required";
      if (!attrs.material_class) return "Gear Pump: Material Class is required";
      break;
    case "screw":
      if (!attrs.screw_type)  return "Screw Pump: Screw Type is required";
      if (!attrs.flow_rate)   return "Screw Pump: Flow Rate is required";
      if (!attrs.diff_pressure) return "Screw Pump: Differential Pressure is required";
      if (!attrs.fluid)       return "Screw Pump: Fluid is required";
      if (!attrs.material_class) return "Screw Pump: Material Class is required";
      break;
    case "multistage":
      if (!attrs.multistage_type) return "Multistage Pump: Type is required";
      if (!attrs.flow_rate)   return "Multistage Pump: Flow Rate is required";
      if (!attrs.head_mlc)    return "Multistage Pump: Head / TDH is required";
      if (!attrs.fluid)       return "Multistage Pump: Fluid is required";
      if (!attrs.material_class) return "Multistage Pump: Material Class is required";
      break;
    case "dosing_metering":
      if (!attrs.pump_type)   return "Dosing Pump: Pump Type is required";
      if (!attrs.flow_rate)   return "Dosing Pump: Flow Rate is required";
      if (!attrs.discharge_pressure) return "Dosing Pump: Discharge Pressure is required";
      if (!attrs.fluid)       return "Dosing Pump: Fluid is required";
      break;
    case "vacuum_boosters":
      if (!attrs.booster_type) return "Vacuum Booster: Booster Type is required";
      if (!attrs.flow_rate)   return "Vacuum Booster: Flow Rate is required";
      if (!attrs.suction_pressure) return "Vacuum Booster: Suction Pressure is required";
      if (!attrs.gas_type)    return "Vacuum Booster: Gas Type is required";
      break;
    case "pump_skid":
      if (!attrs.package_type) return "Pump Skid: Package Type is required";
      if (!attrs.pump_type)    return "Pump Skid: Pump Type is required";
      break;
  }
  return null;
}
