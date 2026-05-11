import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import { ChevronUp, ChevronDown, X, Plus, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Cable Gland constants ──────────────────────────────────────────────────────
const CABLE_GLAND_TYPES = ["PG", "Metric", "NPT", "BSP", "BSPT"] as const;
const CABLE_GLAND_THREAD_SIZES: Record<string, string[]> = {
  PG:     ["PG7", "PG9", "PG11", "PG13.5", "PG16", "PG21"],
  Metric: ["M16", "M20", "M25", "M32"],
  NPT:    ['1/2" NPT', '3/4" NPT', '1" NPT'],
  BSP:    ['1/2"', '3/4"', '1"'],
  BSPT:   ['1/2"', '3/4"', '1"'],
};
export const INSTRUMENT_CABLE_GLAND_DEFAULTS = {
  cable_gland_type: "NPT",
  thread_size: '1/2" NPT',
} as const;

// ── Temperature / Thermocouple defaults ──────────────────────────────────────
export const TEMPERATURE_THERMOCOUPLE_DEFAULTS = {
  element_type:   "Simplex",
  probe_diameter: "6 mm",
  probe_length:   "260",
} as const;

const TC_ELEMENT_TYPES   = ["Simplex", "Duplex"] as const;
const TC_PROBE_DIAMETERS  = ["3 mm", "6 mm", "8 mm", "10 mm", "12 mm"] as const;
const TC_TYPES            = ["Type K", "Type J", "Type T", "Type E", "Type N", "Type R", "Type S", "Type B"] as const;
const RTD_TYPES           = ["PT100", "PT1000"] as const;

// ── Cable Gland Block (shared by all instrument forms) ────────────────────────
function CableGlandBlock({
  attrs, onChange,
}: {
  attrs: Record<string, unknown>;
  onChange: (a: Record<string, unknown>) => void;
}) {
  const glandType  = (attrs.cable_gland_type as string) || "NPT";
  const threadSize = (attrs.thread_size      as string) || '1/2" NPT';
  const threadOpts = CABLE_GLAND_THREAD_SIZES[glandType] ?? [];
  const safeThread = threadOpts.includes(threadSize) ? threadSize : (threadOpts[0] ?? "");

  function handleGlandType(val: string) {
    const opts = CABLE_GLAND_THREAD_SIZES[val] ?? [];
    onChange({ ...attrs, cable_gland_type: val, thread_size: opts[0] ?? "" });
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Cable Gland Type <span className="text-red-500">*</span></Label>
        <Select value={glandType} onValueChange={handleGlandType}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CABLE_GLAND_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Thread Size <span className="text-red-500">*</span></Label>
        <Select value={safeThread} onValueChange={v => onChange({ ...attrs, thread_size: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {threadOpts.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

// ── Shared SearchableSelect ───────────────────────────────────────────────────
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
// PRESSURE INSTRUMENTS
// ─────────────────────────────────────────────────────────────────────────────
const PRESSURE_INSTR_TYPES = [
  "Pressure Gauge (PG)",
  "Pressure Transmitter (PT)",
  "Differential Pressure Transmitter (DPT)",
  "Pressure Switch (PS)",
];
const PRESSURE_COMMON_OPTS = {
  connection_size:      ['1/4"', '1/2"', '3/4"', '1"', '1.5"', '2"'],
  connection_type:      ["BSP", "NPT", "Flanged (ANSI 150#)", "Flanged (ANSI 300#)", "DIN Flanged"],
  wetted_material:      ["SS316L", "SS316", "SS304", "Hastelloy C-276", "Monel", "Titanium", "Brass"],
  area_classification:  ["Safe Area", "Zone 1", "Zone 2"],
  explosion_protection: ["Flameproof Ex d", "Intrinsically Safe Ex ia", "Intrinsically Safe Ex ib", "Increased Safety Ex e"],
  certification:        ["ATEX", "IECEx", "PESO", "UL", "FM"],
  gas_group:            ["IIA", "IIB", "IIC"],
  temperature_class:    ["T1", "T2", "T3", "T4", "T5", "T6"],
  ip_rating:            ["IP65", "IP66", "IP67", "IP68"],
  housing_material:     ["Aluminium", "SS316", "Carbon Steel", "GI"],
  conn_orientation:     ["Bottom Entry", "Back Entry", "Remote Seal"],
  process_fluid:        ["Air", "Water", "Steam", "Oil", "Gas", "Chemical", "Slurry", "Corrosive"],
  sil_requirement:      ["None", "SIL 1", "SIL 2", "SIL 3"],
  range_unit_bar:       ["bar", "kg/cm²", "psi", "kPa", "MPa"],
  range_unit_dp:        ["mmWC", "Pa", "mbar", "bar", "kPa", "inH₂O"],
};
const PRESSURE_PG_OPTS = {
  measurement_type: ["Gauge Pressure", "Absolute Pressure", "Vacuum"],
  accuracy_class:   ["1.0%", "1.6%", "2.5%"],
  dial_size:        ["63 mm", "100 mm", "150 mm"],
  dial_type:        ["Glycerine Filled", "Dry", "Oil Filled (Silicone)"],
  bourdon_material: ["SS316L", "SS316", "SS304", "Phosphor Bronze", "Hastelloy C-276"],
  window_material:  ["Glass", "Polycarbonate", "Laminated Safety Glass"],
};
const PRESSURE_PT_DPT_OPTS = {
  accuracy_class:   ["0.1%", "0.2%", "0.5%"],
  pt_meas_type:     ["Gauge Pressure", "Absolute Pressure"],
  output_signal:    ["4–20 mA", "4–20 mA + HART", "Foundation Fieldbus", "PROFIBUS PA"],
  power_supply:     ["24V DC (Loop)", "24V DC (Separate)", "110V AC", "230V AC"],
  comm_protocol:    ["HART 5", "HART 7", "Foundation Fieldbus", "PROFIBUS PA"],
  display:          ["Integral LCD", "No Display"],
  remote_seal_type: ["Diaphragm Seal", "Flush Diaphragm", "Capillary Remote Seal", "Extended Diaphragm"],
  application:      ["Flow", "Level", "Pressure (DP)"],
  manifold_type:    ["3-Valve", "5-Valve", "Integral", "Remote Seal"],
  lp_connection:    ["Same as HP", '1/4"', '1/2"', '3/4"'],
};
const PRESSURE_PS_OPTS = {
  measurement_type: ["Gauge Pressure", "Differential Pressure", "Vacuum"],
  switching_action: ["NO", "NC", "SPDT", "DPDT"],
  contact_rating:   ["5A 250V AC", "10A 250V AC", "1A 24V DC", "2A 24V DC"],
  cable_entry:      ["M20", '1/2" NPT', '3/4" NPT'],
  reset_type:       ["Auto Reset", "Manual Reset"],
};
const PRESSURE_ALL_FIELD_OPTS: Record<string, string[]> = {
  measurement_type:     ["Gauge Pressure", "Absolute Pressure", "Vacuum", "Differential Pressure"],
  accuracy_class:       ["0.1%", "0.2%", "0.5%", "1.0%", "1.6%", "2.5%"],
  dial_size:            PRESSURE_PG_OPTS.dial_size,
  dial_type:            PRESSURE_PG_OPTS.dial_type,
  bourdon_material:     PRESSURE_PG_OPTS.bourdon_material,
  window_material:      PRESSURE_PG_OPTS.window_material,
  output_signal:        PRESSURE_PT_DPT_OPTS.output_signal,
  power_supply:         PRESSURE_PT_DPT_OPTS.power_supply,
  comm_protocol:        PRESSURE_PT_DPT_OPTS.comm_protocol,
  display:              PRESSURE_PT_DPT_OPTS.display,
  remote_seal_type:     PRESSURE_PT_DPT_OPTS.remote_seal_type,
  application:          PRESSURE_PT_DPT_OPTS.application,
  manifold_type:        PRESSURE_PT_DPT_OPTS.manifold_type,
  lp_connection:        PRESSURE_PT_DPT_OPTS.lp_connection,
  switching_action:     PRESSURE_PS_OPTS.switching_action,
  contact_rating:       PRESSURE_PS_OPTS.contact_rating,
  cable_entry:          PRESSURE_PS_OPTS.cable_entry,
  reset_type:           PRESSURE_PS_OPTS.reset_type,
  connection_size:      PRESSURE_COMMON_OPTS.connection_size,
  connection_type:      PRESSURE_COMMON_OPTS.connection_type,
  wetted_material:      PRESSURE_COMMON_OPTS.wetted_material,
  area_classification:  PRESSURE_COMMON_OPTS.area_classification,
  explosion_protection: PRESSURE_COMMON_OPTS.explosion_protection,
  certification:        PRESSURE_COMMON_OPTS.certification,
  gas_group:            PRESSURE_COMMON_OPTS.gas_group,
  temperature_class:    PRESSURE_COMMON_OPTS.temperature_class,
  ip_rating:            PRESSURE_COMMON_OPTS.ip_rating,
  housing_material:     PRESSURE_COMMON_OPTS.housing_material,
  conn_orientation:     PRESSURE_COMMON_OPTS.conn_orientation,
  process_fluid:        PRESSURE_COMMON_OPTS.process_fluid,
  sil_requirement:      PRESSURE_COMMON_OPTS.sil_requirement,
  range_unit:           ["bar", "kg/cm²", "psi", "kPa", "MPa", "mmWC", "Pa", "mbar", "inH₂O"],
};
const PRESSURE_PG_MAKES     = ["Wika", "Bourdon", "Ashcroft", "Baumer", "H.Guru", "Fiebig", "Nuova Fima", "Winters"];
const PRESSURE_PT_DPT_MAKES = ["Endress+Hauser", "Yokogawa", "Emerson (Rosemount)", "ABB", "Honeywell", "Wika", "Siemens", "Dwyer"];
const PRESSURE_PS_MAKES     = ["Danfoss", "Wika", "United Electric", "Barksdale", "Honeywell", "Dwyer", "Nuova Fima", "Bourdon"];

export function buildPressureRequirement(attrs: Record<string, unknown>): string {
  const instrType = (attrs.instrument_type as string)?.trim() || "";
  if (!instrType) return "";
  const t         = instrType.toLowerCase();
  const rangeMin  = (attrs.range_min  as string)?.trim() || "";
  const rangeMax  = (attrs.range_max  as string)?.trim() || "";
  const rangeUnit = (attrs.range_unit as string)?.trim() || "";
  const rangeStr  = rangeMax ? `${rangeMin || "0"}–${rangeMax} ${rangeUnit}`.trim() : "";
  const areaClass = (attrs.area_classification as string)?.trim() || "";
  const connSize  = (attrs.connection_size as string)?.trim() || "";
  const connType  = (attrs.connection_type as string)?.trim() || "";
  const connStr   = [connSize, connType].filter(Boolean).join(" ");
  const wetted    = (attrs.wetted_material as string)?.trim() || "";
  const ipRating  = (attrs.ip_rating as string)?.trim() || "";
  const zoneStr   = (areaClass && areaClass !== "Safe Area") ? areaClass : "";
  const parts: string[] = [instrType];
  if (t.includes("gauge")) {
    const dialSize = (attrs.dial_size as string)?.trim() || "";
    const dialType = (attrs.dial_type as string)?.trim() || "";
    if (rangeStr)                       parts.push(rangeStr);
    if (dialType && dialType !== "Dry") parts.push(dialType);
    if (dialSize)                       parts.push(dialSize);
    if (connStr)                        parts.push(connStr);
    if (wetted)                         parts.push(wetted);
    if (ipRating)                       parts.push(ipRating);
  } else if (t.includes("differential")) {
    const app      = (attrs.application   as string)?.trim() || "";
    const output   = (attrs.output_signal as string)?.trim() || "";
    const manifold = (attrs.manifold_type as string)?.trim() || "";
    if (app)      parts.push(app);
    if (rangeStr) parts.push(rangeStr);
    if (output)   parts.push(output);
    if (manifold) parts.push(manifold);
    if (wetted)   parts.push(wetted);
    if (ipRating) parts.push(ipRating);
  } else if (t.includes("transmitter")) {
    const output = (attrs.output_signal as string)?.trim() || "";
    const supply = (attrs.power_supply  as string)?.trim() || "";
    if (rangeStr) parts.push(rangeStr);
    if (output)   parts.push(output);
    if (supply)   parts.push(supply);
    if (connStr)  parts.push(connStr);
    if (wetted)   parts.push(wetted);
    if (ipRating) parts.push(ipRating);
  } else if (t.includes("switch")) {
    const setpoint  = (attrs.trip_setpoint   as string)?.trim() || "";
    const switching = (attrs.switching_action as string)?.trim() || "";
    const contact   = (attrs.contact_rating   as string)?.trim() || "";
    if (rangeStr)  parts.push(rangeStr);
    if (setpoint)  parts.push(`SP: ${setpoint}${rangeUnit ? " " + rangeUnit : ""}`);
    if (switching) parts.push(switching);
    if (contact)   parts.push(contact);
    if (connStr)   parts.push(connStr);
    if (wetted)    parts.push(wetted);
    if (ipRating)  parts.push(ipRating);
  }
  if (zoneStr) parts.push(zoneStr);
  return parts.join(", ");
}

export function PressureAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(PRESSURE_ALL_FIELD_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const [makesOpen,      setMakesOpen]      = useState(false);
  const [makesQuery,     setMakesQuery]     = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const [customMakeVal,  setCustomMakeVal]  = useState("");

  const instrType     = (attrs.instrument_type as string) ?? "";
  const t             = instrType.toLowerCase();
  const isPG          = t.includes("gauge");
  const isPT          = t.includes("transmitter") && !t.includes("differential");
  const isDPT         = t.includes("differential");
  const isPS          = t.includes("switch");
  const areaClass     = (attrs.area_classification as string) ?? "";
  const isZone        = areaClass === "Zone 1" || areaClass === "Zone 2";
  const approvedMakes = (attrs.approved_makes as string[]) ?? [];
  const makesList     = isPG ? PRESSURE_PG_MAKES : isPS ? PRESSURE_PS_MAKES : PRESSURE_PT_DPT_MAKES;
  const filteredMakes = makesList.filter(o => o.toLowerCase().includes(makesQuery.toLowerCase()));
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom(c => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom(c => ({ ...c, [key]: false }));
      if (key === "area_classification" && val === "Safe Area") {
        const next = { ...attrs, area_classification: val };
        delete (next as Record<string, unknown>).explosion_protection;
        delete (next as Record<string, unknown>).certification;
        delete (next as Record<string, unknown>).gas_group;
        delete (next as Record<string, unknown>).temperature_class;
        onChange(next);
      } else {
        set(key, val);
      }
    }
  }

  function handleTypeChange(newType: string) {
    const t2 = newType.toLowerCase();
    const base: Record<string, unknown> = {
      instrument_type:     newType,
      area_classification: (attrs.area_classification as string) || "Safe Area",
      approved_makes:      attrs.approved_makes ?? [],
      connection_size:     '1/2"',
      connection_type:     "BSP",
      conn_orientation:    "Bottom Entry",
      wetted_material:     "SS316L",
      ip_rating:           t2.includes("gauge") ? "IP65" : "IP66",
    };
    if (t2.includes("gauge")) {
      base.measurement_type = "Gauge Pressure";
      base.accuracy_class   = "1.6%";
      base.dial_size        = "100 mm";
      base.dial_type        = "Glycerine Filled";
      base.range_unit       = "bar";
    } else if (t2.includes("differential")) {
      base.application      = "Pressure (DP)";
      base.accuracy_class   = "0.2%";
      base.output_signal    = "4–20 mA + HART";
      base.power_supply     = "24V DC (Loop)";
      base.comm_protocol    = "HART 7";
      base.display          = "Integral LCD";
      base.manifold_type    = "5-Valve";
      base.lp_connection    = "Same as HP";
      base.range_unit       = "mmWC";
      base.housing_material = "Aluminium";
    } else if (t2.includes("transmitter")) {
      base.measurement_type = "Gauge Pressure";
      base.accuracy_class   = "0.2%";
      base.output_signal    = "4–20 mA + HART";
      base.power_supply     = "24V DC (Loop)";
      base.comm_protocol    = "HART 7";
      base.display          = "Integral LCD";
      base.range_unit       = "bar";
      base.housing_material = "Aluminium";
    } else if (t2.includes("switch")) {
      base.measurement_type = "Gauge Pressure";
      base.switching_action = "SPDT";
      base.contact_rating   = "5A 250V AC";
      base.reset_type       = "Auto Reset";
      base.range_unit       = "bar";
      base.housing_material = "Aluminium";
    }
    setCustom({});
    onChange(base);
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

  function renderNumeric(key: string, label: string, required?: boolean) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <Input className="h-8 text-sm" type="number" placeholder="0"
          value={(attrs[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} />
      </div>
    );
  }

  function renderText(key: string, label: string, required?: boolean, placeholder?: string) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <Input className="h-8 text-sm" placeholder={placeholder ?? `Enter ${label.toLowerCase()}…`}
          value={(attrs[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} />
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

  function toggleMake(make: string) {
    onChange({ ...attrs, approved_makes: approvedMakes.includes(make)
      ? approvedMakes.filter(m => m !== make)
      : [...approvedMakes, make] });
  }
  function addCustomMake() {
    const v = customMakeVal.trim();
    if (v && !approvedMakes.includes(v)) onChange({ ...attrs, approved_makes: [...approvedMakes, v] });
    setCustomMakeVal(""); setShowCustomMake(false);
  }
  function moveMakeUp(idx: number) {
    if (idx <= 0) return;
    const arr = [...approvedMakes];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    onChange({ ...attrs, approved_makes: arr });
  }
  function moveMakeDown(idx: number) {
    if (idx >= approvedMakes.length - 1) return;
    const arr = [...approvedMakes];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    onChange({ ...attrs, approved_makes: arr });
  }

  function renderHazardousBlock() {
    return (
      <>
        {sectionHeader("Hazardous Area / Classification")}
        {renderField("area_classification", "Area Classification", PRESSURE_COMMON_OPTS.area_classification, true)}
        {isPG && isZone && (
          <div className="space-y-1.5">
            <Label className="text-xs">Explosion Protection</Label>
            <div className="h-8 flex items-center px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">
              Non-Electrical / Passive Device
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight mt-1">
              Pressure gauges are non-electrical — no Ex certification required. Ensure IP66+ enclosure for Zone 1/2.
            </p>
          </div>
        )}
        {!isPG && isZone && renderField("explosion_protection", "Explosion Protection", PRESSURE_COMMON_OPTS.explosion_protection, true)}
        {!isPG && isZone && (
          <>
            {renderField("certification",    "Certification",     PRESSURE_COMMON_OPTS.certification,     true)}
            {renderField("gas_group",        "Gas Group",         PRESSURE_COMMON_OPTS.gas_group,         true)}
            {renderField("temperature_class","Temperature Class", PRESSURE_COMMON_OPTS.temperature_class, true)}
            <div />
          </>
        )}
      </>
    );
  }

  const RANK_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

  function renderMakesBlock() {
    return (
      <>
        {sectionHeader("Vendor / Approved Makes")}
        <div className="col-span-2 space-y-2">
          <Label className="text-xs">
            Approved Makes <span className="text-[10px] font-normal text-muted-foreground">(ranked — 1st = most preferred)</span>
            <span className="text-red-500"> *</span>
          </Label>
          <Popover open={makesOpen} onOpenChange={setMakesOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 w-full justify-between text-sm font-normal">
                {approvedMakes.length > 0
                  ? `${approvedMakes.length} make${approvedMakes.length > 1 ? "s" : ""} selected`
                  : "Select approved makes…"}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search makes…" value={makesQuery} onValueChange={setMakesQuery} />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {filteredMakes.map(opt => (
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
            <div className="flex flex-col gap-1">
              {approvedMakes.map((make, idx) => (
                <div key={make} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground w-7 shrink-0 text-right">
                    {RANK_LABELS[idx] ?? `${idx + 1}.`}
                  </span>
                  <Badge variant="secondary" className="text-xs flex-1 flex items-center justify-between pr-1 gap-1">
                    <span className="truncate">{make}</span>
                    <span className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onClick={() => moveMakeUp(idx)} disabled={idx === 0}
                        className="disabled:opacity-30 hover:text-foreground transition-opacity">
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => moveMakeDown(idx)} disabled={idx === approvedMakes.length - 1}
                        className="disabled:opacity-30 hover:text-foreground transition-opacity">
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <button type="button"
                        onClick={() => onChange({ ...attrs, approved_makes: approvedMakes.filter(m => m !== make) })}
                        className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </Badge>
                </div>
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
      </>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pressure Instrument Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {sectionHeader("Instrument Type")}
        <div className="col-span-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Instrument Type <span className="text-red-500">*</span></Label>
            <Select value={instrType} onValueChange={(v) => { if (v !== instrType) handleTypeChange(v); }}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select instrument type…" />
              </SelectTrigger>
              <SelectContent>
                {PRESSURE_INSTR_TYPES.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!instrType && (
          <div className="col-span-2 flex items-center justify-center py-8 text-sm text-muted-foreground">
            Select an instrument type above to configure specifications.
          </div>
        )}

        {isPG && (<>
          {sectionHeader("Measurement")}
          {renderField("measurement_type", "Measurement Type",   PRESSURE_PG_OPTS.measurement_type, true)}
          {renderField("range_unit",       "Range Unit",         PRESSURE_COMMON_OPTS.range_unit_bar, true)}
          {renderNumeric("range_min",      "Range Min")}
          {renderNumeric("range_max",      "Range Max",          true)}
          {renderField("accuracy_class",   "Accuracy Class",     PRESSURE_PG_OPTS.accuracy_class, true)}
          <div />
          {sectionHeader("Physical")}
          {renderField("dial_size",        "Dial Size",          PRESSURE_PG_OPTS.dial_size, true)}
          {renderField("dial_type",        "Fill Type",          PRESSURE_PG_OPTS.dial_type, true)}
          {renderField("bourdon_material", "Bourdon Tube Material", PRESSURE_PG_OPTS.bourdon_material)}
          {renderField("window_material",  "Window Material",    PRESSURE_PG_OPTS.window_material)}
          {sectionHeader("Process Connection")}
          {renderField("connection_size",  "Connection Size",    PRESSURE_COMMON_OPTS.connection_size,  true)}
          {renderField("connection_type",  "Connection Type",    PRESSURE_COMMON_OPTS.connection_type,  true)}
          {renderField("conn_orientation", "Orientation",        PRESSURE_COMMON_OPTS.conn_orientation, true)}
          <div />
          {sectionHeader("Process Conditions")}
          {renderField("process_fluid",    "Process Fluid",      PRESSURE_COMMON_OPTS.process_fluid)}
          {renderText("operating_temp",    "Operating Temp (Process)", false, "e.g. Ambient, −10 to 120°C")}
          {sectionHeader("Construction")}
          {renderField("wetted_material",  "Wetted Parts Material", PRESSURE_COMMON_OPTS.wetted_material, true)}
          {renderField("ip_rating",        "IP Rating",          PRESSURE_COMMON_OPTS.ip_rating, true)}
        </>)}

        {isPT && (<>
          {sectionHeader("Measurement")}
          {renderField("measurement_type", "Measurement Type",   PRESSURE_PT_DPT_OPTS.pt_meas_type, true)}
          {renderField("range_unit",       "Range Unit",         PRESSURE_COMMON_OPTS.range_unit_bar, true)}
          {renderNumeric("range_min",      "Range Min")}
          {renderNumeric("range_max",      "Range Max",          true)}
          {renderField("accuracy_class",   "Accuracy Class",     PRESSURE_PT_DPT_OPTS.accuracy_class, true)}
          <div />
          {sectionHeader("Electrical / Signal")}
          {renderField("output_signal",    "Output Signal",          PRESSURE_PT_DPT_OPTS.output_signal,  true)}
          {renderField("power_supply",     "Power Supply",           PRESSURE_PT_DPT_OPTS.power_supply,   true)}
          {renderField("comm_protocol",    "Communication Protocol", PRESSURE_PT_DPT_OPTS.comm_protocol)}
          {renderField("display",          "Display",                PRESSURE_PT_DPT_OPTS.display)}
          {sectionHeader("Process Connection")}
          {renderField("connection_size",  "Connection Size",    PRESSURE_COMMON_OPTS.connection_size,  true)}
          {renderField("connection_type",  "Connection Type",    PRESSURE_COMMON_OPTS.connection_type,  true)}
          {renderField("conn_orientation", "Orientation",        PRESSURE_COMMON_OPTS.conn_orientation, true)}
          <div />
          {sectionHeader("Remote Seal (Optional)")}
          {renderField("remote_seal_type", "Remote Seal Type",   PRESSURE_PT_DPT_OPTS.remote_seal_type)}
          {renderText("capillary_length",  "Capillary Length",   false, "e.g. 2 m, 5 m")}
          {sectionHeader("Process Conditions")}
          {renderField("process_fluid",    "Process Fluid",      PRESSURE_COMMON_OPTS.process_fluid)}
          {renderText("operating_temp",    "Operating Temp (Process)", false, "e.g. Ambient, −10 to 120°C")}
          {sectionHeader("Construction")}
          {renderField("wetted_material",  "Wetted Parts Material", PRESSURE_COMMON_OPTS.wetted_material, true)}
          {renderField("housing_material", "Housing Material",      PRESSURE_COMMON_OPTS.housing_material)}
          {renderField("ip_rating",        "IP Rating",          PRESSURE_COMMON_OPTS.ip_rating, true)}
          <div />
          {sectionHeader("Safety Integrity")}
          {renderField("sil_requirement",  "SIL Requirement",    PRESSURE_COMMON_OPTS.sil_requirement)}
          <div />
        </>)}

        {isDPT && (<>
          {sectionHeader("Measurement")}
          <div className="space-y-1.5">
            <Label className="text-xs">Measurement Type</Label>
            <div className="h-8 flex items-center px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">
              Differential Pressure
            </div>
          </div>
          {renderField("application",      "Application",        PRESSURE_PT_DPT_OPTS.application, true)}
          {renderField("range_unit",       "Range Unit",         PRESSURE_COMMON_OPTS.range_unit_dp, true)}
          {renderNumeric("range_min",      "Range Min")}
          {renderNumeric("range_max",      "Range Max",          true)}
          {renderField("accuracy_class",   "Accuracy Class",     PRESSURE_PT_DPT_OPTS.accuracy_class, true)}
          <div />
          {sectionHeader("Electrical / Signal")}
          {renderField("output_signal",    "Output Signal",          PRESSURE_PT_DPT_OPTS.output_signal,  true)}
          {renderField("power_supply",     "Power Supply",           PRESSURE_PT_DPT_OPTS.power_supply,   true)}
          {renderField("comm_protocol",    "Communication Protocol", PRESSURE_PT_DPT_OPTS.comm_protocol)}
          {renderField("display",          "Display",                PRESSURE_PT_DPT_OPTS.display)}
          {sectionHeader("Process Connection")}
          {renderField("connection_size",  "HP Connection Size", PRESSURE_COMMON_OPTS.connection_size,  true)}
          {renderField("connection_type",  "HP Connection Type", PRESSURE_COMMON_OPTS.connection_type,  true)}
          {renderField("conn_orientation", "HP Orientation",     PRESSURE_COMMON_OPTS.conn_orientation, true)}
          {renderField("lp_connection",    "LP Connection",      PRESSURE_PT_DPT_OPTS.lp_connection)}
          {sectionHeader("Manifold")}
          {renderField("manifold_type",    "Manifold Type",      PRESSURE_PT_DPT_OPTS.manifold_type, true)}
          <div />
          {sectionHeader("Remote Seal (Optional)")}
          {renderField("remote_seal_type", "Remote Seal Type",   PRESSURE_PT_DPT_OPTS.remote_seal_type)}
          {renderText("capillary_length",  "Capillary Length",   false, "e.g. 2 m, 5 m")}
          {sectionHeader("Process Conditions")}
          {renderField("process_fluid",    "Process Fluid",      PRESSURE_COMMON_OPTS.process_fluid)}
          {renderText("operating_temp",    "Operating Temp (Process)", false, "e.g. Ambient, −10 to 120°C")}
          {sectionHeader("Construction")}
          {renderField("wetted_material",  "Wetted Parts Material", PRESSURE_COMMON_OPTS.wetted_material, true)}
          {renderField("housing_material", "Housing Material",      PRESSURE_COMMON_OPTS.housing_material)}
          {renderField("ip_rating",        "IP Rating",          PRESSURE_COMMON_OPTS.ip_rating, true)}
          <div />
          {sectionHeader("Safety Integrity")}
          {renderField("sil_requirement",  "SIL Requirement",    PRESSURE_COMMON_OPTS.sil_requirement)}
          <div />
        </>)}

        {isPS && (<>
          {sectionHeader("Measurement & Range")}
          {renderField("measurement_type", "Measurement Type",     PRESSURE_PS_OPTS.measurement_type, true)}
          {renderField("range_unit",       "Range Unit",           PRESSURE_COMMON_OPTS.range_unit_bar, true)}
          {renderNumeric("range_min",      "Adjustable Range Min")}
          {renderNumeric("range_max",      "Adjustable Range Max", true)}
          {sectionHeader("Setpoint")}
          {renderText("trip_setpoint",     "Trip Setpoint",        true,  "e.g. 8.0 bar")}
          {renderText("deadband",          "Deadband / Hysteresis",false, "e.g. 0.5 bar")}
          {sectionHeader("Switching")}
          {renderField("switching_action", "Switching Action",     PRESSURE_PS_OPTS.switching_action, true)}
          {renderField("contact_rating",   "Contact Rating",       PRESSURE_PS_OPTS.contact_rating,   true)}
          {renderField("reset_type",       "Reset Type",           PRESSURE_PS_OPTS.reset_type,       true)}
          <div />
          {sectionHeader("Process Connection")}
          {renderField("connection_size",  "Connection Size",      PRESSURE_COMMON_OPTS.connection_size, true)}
          {renderField("connection_type",  "Connection Type",      PRESSURE_COMMON_OPTS.connection_type, true)}
          {sectionHeader("Process Conditions")}
          {renderField("process_fluid",    "Process Fluid",        PRESSURE_COMMON_OPTS.process_fluid)}
          {renderText("operating_temp",    "Operating Temp (Process)", false, "e.g. Ambient, −10 to 120°C")}
          {sectionHeader("Construction")}
          {renderField("wetted_material",  "Wetted Parts Material", PRESSURE_COMMON_OPTS.wetted_material, true)}
          {renderField("housing_material", "Housing Material",      PRESSURE_COMMON_OPTS.housing_material)}
          {renderField("cable_entry",      "Cable Entry",           PRESSURE_PS_OPTS.cable_entry)}
          {renderField("ip_rating",        "IP Rating",             PRESSURE_COMMON_OPTS.ip_rating, true)}
          <div />
          {sectionHeader("Safety Integrity")}
          {renderField("sil_requirement",  "SIL Requirement",      PRESSURE_COMMON_OPTS.sil_requirement)}
          <div />
        </>)}

        {sectionHeader("Cable Gland")}
        <CableGlandBlock attrs={attrs} onChange={onChange} />

        {instrType && (<>
          {renderHazardousBlock()}
          {renderMakesBlock()}
          {qty !== undefined && (
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
              <Input className="h-8 text-sm" type="number" min="1" step="1"
                value={qty}
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }} />
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPERATURE INSTRUMENTS
// ─────────────────────────────────────────────────────────────────────────────
const TEMP_INSTR_TYPES = ["Thermocouple (TC)", "RTD", "Thermistor"] as const;

export function buildTemperatureRequirement(attrs: Record<string, unknown>): string {
  const instrType  = (attrs.instrument_type   as string)?.trim() || "";
  const subType    = instrType === "Thermocouple (TC)"
    ? (attrs.tc_type        as string)?.trim() || ""
    : instrType === "RTD"
      ? (attrs.rtd_type      as string)?.trim() || ""
      : instrType === "Thermistor"
        ? (attrs.thermistor_type as string)?.trim() || ""
        : "";
  const rangeMin   = (attrs.range_min          as string)?.trim() || "";
  const rangeMax   = (attrs.range_max          as string)?.trim() || "";
  const rangeUnit  = (attrs.range_unit         as string)?.trim() || "°C";
  const connSize   = (attrs.connection_size    as string)?.trim() || "";
  const connType   = (attrs.connection_type    as string)?.trim() || "";
  const areaClass  = (attrs.area_classification as string)?.trim() || "";
  const expProt    = (attrs.explosion_protection as string)?.trim() || "";
  const rangeStr   = rangeMin || rangeMax ? `${rangeMin}–${rangeMax} ${rangeUnit}`.trim() : "";
  const connStr    = [connSize, connType].filter(Boolean).join(" ");
  const parts: string[] = [];
  if (instrType) parts.push(instrType);
  if (subType)   parts.push(subType);
  if (rangeStr)  parts.push(rangeStr);
  if (connStr)   parts.push(connStr);
  if (areaClass && areaClass !== "Safe Area") parts.push(areaClass);
  if (expProt)   parts.push(expProt);
  return parts.join(", ");
}

export function applyTemperatureDefaults(ta: Record<string, unknown>): Record<string, unknown> {
  const instrType = (ta.instrument_type as string) || "";
  const base: Record<string, unknown> = {
    ...INSTRUMENT_CABLE_GLAND_DEFAULTS,
    range_min:           "-30",
    range_max:           "400",
    range_unit:          "°C",
    ip_rating:           "IP65",
    area_classification: "Safe Area",
    ...ta,
  };
  if (instrType === "Thermocouple (TC)") {
    return {
      element_type:        "Simplex",
      probe_diameter:      "6 mm",
      probe_length:        "260",
      thermowell_required: "No",
      connection_size:     '1/2"',
      connection_type:     "NPT",
      head_transmitter:    "No",
      output_signal:       "mV (TC)",
      ...base,
    };
  }
  if (instrType === "RTD") {
    return {
      rtd_type:            "PT100",
      wire_count:          "3-wire",
      probe_diameter:      "6 mm",
      probe_length:        "150",
      thermowell_required: "No",
      connection_size:     '1/2"',
      connection_type:     "NPT",
      head_transmitter:    "No",
      output_signal:       "Resistance (RTD)",
      ...base,
    };
  }
  if (instrType === "Thermistor") {
    return {
      probe_diameter: "6 mm",
      probe_length:   "100",
      ...base,
    };
  }
  return base;
}

export function TemperatureAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const [instrCustom, setInstrCustom] = useState(() => {
    const v = (attrs.instrument_type as string) ?? "";
    return v !== "" && !(TEMP_INSTR_TYPES as readonly string[]).includes(v);
  });

  function handleInstrTypeSelect(val: string) {
    if (val === "__other__") { setInstrCustom(true); set("instrument_type", ""); return; }
    setInstrCustom(false);
    const next: Record<string, unknown> = {
      ...attrs,
      instrument_type:     val,
      range_min:           (attrs.range_min  as string)  || "-30",
      range_max:           (attrs.range_max  as string)  || "400",
      range_unit:          (attrs.range_unit as string)  || "°C",
      ip_rating:           (attrs.ip_rating  as string)  || "IP65",
      area_classification: (attrs.area_classification as string) || "Safe Area",
    };
    if (val === "Thermocouple (TC)") {
      next.rtd_type = ""; next.thermistor_type = "";
      next.element_type        = (attrs.element_type   as string) || "Simplex";
      next.probe_diameter      = (attrs.probe_diameter as string) || "6 mm";
      next.probe_length        = (attrs.probe_length   as string) || "260";
      next.thermowell_required = (attrs.thermowell_required as string) || "No";
      next.connection_size     = (attrs.connection_size as string) || '1/2"';
      next.connection_type     = (attrs.connection_type as string) || "NPT";
      next.head_transmitter    = (attrs.head_transmitter as string) || "No";
      next.output_signal       = (attrs.output_signal   as string) || "mV (TC)";
    } else if (val === "RTD") {
      next.tc_type = ""; next.thermistor_type = "";
      next.rtd_type            = (attrs.rtd_type      as string) || "PT100";
      next.wire_count          = (attrs.wire_count     as string) || "3-wire";
      next.probe_diameter      = (attrs.probe_diameter as string) || "6 mm";
      next.probe_length        = (attrs.probe_length   as string) || "150";
      next.thermowell_required = (attrs.thermowell_required as string) || "No";
      next.connection_size     = (attrs.connection_size as string) || '1/2"';
      next.connection_type     = (attrs.connection_type as string) || "NPT";
      next.head_transmitter    = (attrs.head_transmitter as string) || "No";
      next.output_signal       = (attrs.output_signal   as string) || "Resistance (RTD)";
    } else if (val === "Thermistor") {
      next.tc_type = ""; next.rtd_type = "";
      next.probe_diameter = (attrs.probe_diameter as string) || "6 mm";
      next.probe_length   = (attrs.probe_length   as string) || "100";
    }
    onChange(next);
  }

  function ss(key: string, label: string, opts: string[], mandatory: boolean, defaultVal?: string) {
    const val = (attrs[key] as string) || (defaultVal ?? "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{mandatory && <span className="text-red-500"> *</span>}</Label>
        <Select value={val} onValueChange={v => set(key, v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>{opts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    );
  }

  function ni(key: string, label: string, mandatory: boolean, defaultVal?: string, placeholder?: string, allowNeg?: boolean) {
    const val = (attrs[key] as string) ?? (defaultVal ?? "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{mandatory && <span className="text-red-500"> *</span>}</Label>
        <Input className="h-8 text-sm" type="number" step="1" {...(allowNeg ? {} : { min: "1" })}
          placeholder={placeholder ?? ""} value={val}
          onWheel={(e) => e.currentTarget.blur()}
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

  const instrType       = (attrs.instrument_type   as string) ?? "";
  const instrTypeSelect = instrCustom ? "__other__" : ((TEMP_INSTR_TYPES as readonly string[]).includes(instrType) ? instrType : "");
  const isTC            = instrType === "Thermocouple (TC)";
  const isRTD           = instrType === "RTD";
  const isThermistor    = instrType === "Thermistor";
  const hasType         = isTC || isRTD || isThermistor;
  const thermowell      = (attrs.thermowell_required as string) === "Yes";
  const headXmtr        = (attrs.head_transmitter   as string) === "Yes";
  const areaClass       = (attrs.area_classification as string) ?? "";
  const isHazardous     = areaClass === "Zone 1" || areaClass === "Zone 2";

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Temperature Instrument Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sec("Instrument Type")}
        <div className="col-span-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Instrument Type <span className="text-red-500">*</span></Label>
            <SearchableSelect value={instrTypeSelect} options={[...TEMP_INSTR_TYPES]} placeholder="Select…" onSelect={handleInstrTypeSelect} />
            {instrCustom && (
              <Input className="h-8 text-sm" placeholder="Enter custom type…"
                value={instrType} onChange={(e) => set("instrument_type", e.target.value)} autoFocus />
            )}
          </div>
        </div>

        {isTC && (<>
          {sec("Thermocouple Details")}
          {ss("tc_type",       "TC Type",       [...TC_TYPES],          true)}
          {ss("element_type",  "Element Type",  ["Simplex","Duplex"],   true, "Simplex")}
          {ss("probe_diameter","Probe Diameter",[...TC_PROBE_DIAMETERS],true, "6 mm")}
          {ni("probe_length",  "Probe Length (mm)", true, "260", "e.g. 260")}
        </>)}

        {isRTD && (<>
          {sec("RTD Details")}
          {ss("rtd_type",      "RTD Type",         ["PT100","PT1000"],                           true,  "PT100")}
          {ss("wire_count",    "Number of Wires",  ["2-wire","3-wire","4-wire"],                 true,  "3-wire")}
          {ss("accuracy_class","Accuracy Class",   ["Class A","Class B","1/3 DIN","1/5 DIN"],   false)}
          {ss("probe_diameter","Probe Diameter",   [...TC_PROBE_DIAMETERS],                      true,  "6 mm")}
          {ni("probe_length",  "Probe Length (mm)", true, "150", "e.g. 150")}
        </>)}

        {isThermistor && (<>
          {sec("Thermistor Details")}
          {ss("thermistor_type",  "Thermistor Type",   ["NTC","PTC"],                                          true)}
          {ss("resistance_value", "Resistance Value",  ["1 kΩ","2 kΩ","5 kΩ","10 kΩ","20 kΩ","100 kΩ"],     false)}
          {ss("probe_diameter",   "Probe Diameter",    [...TC_PROBE_DIAMETERS],                                false, "6 mm")}
          {ni("probe_length",     "Probe Length (mm)", false, "100", "e.g. 100")}
        </>)}

        {(isTC || isRTD) && (<>
          {sec("Thermowell")}
          {ss("thermowell_required","Thermowell Required",["No","Yes"], true, "No")}
          <div />
          {thermowell && (<>
            {ss("thermowell_material","Thermowell Material",["SS316","SS316L","SS304","Inconel 600","Carbon Steel","Hastelloy C-276"], true)}
            {ss("thermowell_style",   "Thermowell Style",   ["Straight","Tapered","Stepped"], true)}
            {ni("insertion_length_u", "Insertion Length U (mm)", true,  "", "e.g. 150")}
            {ni("lagging_extension",  "Lagging Extension (mm)",  false, "", "e.g. 50")}
          </>)}
        </>)}

        {hasType && (<>
          {sec("Measuring Range")}
          {ni("range_min", "Range Min", true, "-30", "e.g. -30", true)}
          {ni("range_max", "Range Max", true, "400", "e.g. 400", true)}
          <div className="col-span-2">
            {ss("range_unit", "Range Unit", ["°C","°F","K"], true, "°C")}
          </div>
        </>)}

        {(isTC || isRTD) && (<>
          {sec("Process Connection")}
          {ss("connection_size","Connection Size",['1/4"','1/2"','3/4"','1"'], true,  '1/2"')}
          {ss("connection_type","Connection Type",["NPT","BSP","Flanged"],     true,  "NPT")}
        </>)}
        {isThermistor && (<>
          {sec("Process Connection (Optional)")}
          {ss("connection_size","Connection Size",['1/4"','1/2"','3/4"','1"'], false)}
          {ss("connection_type","Connection Type",["NPT","BSP","Flanged"],     false)}
        </>)}

        {(isTC || isRTD) && (<>
          {sec("Transmitter")}
          {ss("head_transmitter","Head Mounted Transmitter",["No","Yes"], false, "No")}
          {ss("output_signal","Output Signal",
            isTC ? ["mV (TC)","4–20 mA","4–20 mA / HART"] : ["Resistance (RTD)","4–20 mA","4–20 mA / HART"],
            headXmtr,
            isTC ? "mV (TC)" : "Resistance (RTD)")}
        </>)}

        {hasType && (<>
          {sec("Protection")}
          {ss("ip_rating","IP Rating",["IP65","IP66","IP67","IP68"], true, "IP65")}
          <div />
        </>)}

        {hasType && (<>
          {sec("Hazardous Area (Optional)")}
          {ss("area_classification",  "Area Classification",  ["Safe Area","Zone 1","Zone 2"],                                                                             false, "Safe Area")}
          {ss("explosion_protection", "Explosion Protection", ["Ex d (Flameproof)","Ex ia (Intrinsically Safe)","Ex ib (Intrinsically Safe)","Ex e (Increased Safety)"], isHazardous)}
          {isHazardous && (<>
            {ss("certification",    "Certification",     ["ATEX","IECEx","PESO"],          true)}
            {ss("gas_group",        "Gas Group",         ["IIA","IIB","IIC"],              true)}
            {ss("temperature_class","Temperature Class", ["T1","T2","T3","T4","T5","T6"], true)}
            <div />
          </>)}
        </>)}

        {sec("Cable Gland")}
        <CableGlandBlock attrs={attrs} onChange={onChange} />

        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLOW INSTRUMENTS
// ─────────────────────────────────────────────────────────────────────────────
export function buildFlowRequirement(attrs: Record<string, unknown>): string {
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

export function FlowAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
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
        {sec("Cable Gland")}
        <CableGlandBlock attrs={attrs} onChange={onChange} />
        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL INSTRUMENTS
// ─────────────────────────────────────────────────────────────────────────────
export function buildLevelRequirement(attrs: Record<string, unknown>): string {
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

export function LevelAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
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
        {sec("Cable Gland")}
        <CableGlandBlock attrs={attrs} onChange={onChange} />
        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }} />
          </div>
        )}
      </div>
    </div>
  );
}
