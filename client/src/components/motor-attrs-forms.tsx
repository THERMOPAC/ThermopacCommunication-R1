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
import { cn } from "@/lib/utils";

// ── Shared SearchableSelect ───────────────────────────────────────────────────
function SearchableSelect({
  value, options, placeholder, onSelect: onSelectProp, hideOther,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  onSelect: (v: string) => void;
  hideOther?: boolean;
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
              {!hideOther && (
                <CommandItem key="__other__" value="Other…"
                  onSelect={() => { onSelectProp("__other__"); setOpen(false); }}>
                  <Check className={`mr-2 h-3.5 w-3.5 ${value === "__other__" ? "opacity-100" : "opacity-0"}`} />
                  Other…
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MOTOR
// ─────────────────────────────────────────────────────────────────────────────
export function buildMotorRequirement(attrs: Record<string, unknown>): string {
  const motorType    = (attrs.motor_type       as string)?.trim() || "";
  const power        = (attrs.power            as string)?.trim() || "";
  const voltage      = (attrs.voltage          as string)?.trim() || "";
  const speed        = (attrs.speed            as string)?.trim() || "";
  const effClass     = (attrs.efficiency_class as string)?.trim() || "";
  const cooling      = (attrs.cooling_type     as string)?.trim() || "";
  const mounting     = (attrs.mounting         as string)?.trim() || "";
  const ipRating     = (attrs.ip_rating        as string)?.trim() || "";
  const motorLabel  = !motorType ? "" : motorType.endsWith("Motor") ? motorType : `${motorType} Motor`;
  const powerLabel  = power   ? `${power} kW`   : "";
  const voltLabel   = voltage ? voltage.replace(" ", "") : "";
  const speedLabel  = speed   ? `${speed} RPM`  : "";
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

const MOTOR_SPEED_BY_FREQ: Record<string, string[]> = {
  "50 Hz": ["3000", "1500", "1000", "750"],
  "60 Hz": ["3600", "1800", "1200", "900"],
};

const MOTOR_POLES_BY_FREQ: Record<string, string[]> = {
  "50 Hz": ["2", "4", "6", "8"],
  "60 Hz": ["2", "4", "6", "8"],
};

const MOTOR_AREA_SAFE      = ["Safe Area", "Other"];
const MOTOR_AREA_HAZARDOUS = ["Zone 1", "Zone 2"];

export const NON_FLAMEPROOF_MOTOR_DEFAULTS: Record<string, unknown> = {
  motor_type:          "Induction",
  mounting:            "Horizontal (B3)",
  cooling_type:        "TEFC",
  voltage:             "415 V",
  phase:               "Three Phase",
  frequency:           "50 Hz",
  num_poles:           "4",
  duty:                "S1 (Continuous)",
  area_classification: "Other",
  ip_rating:           "IP55",
  efficiency_class:    "IE4",
  vfd_compatible:      "Yes",
  material:            "Cast Iron",
};

export function applyNonFlameproofMotorDefaults(existing: Record<string, unknown>): Record<string, unknown> {
  const result = { ...existing };
  for (const [key, val] of Object.entries(NON_FLAMEPROOF_MOTOR_DEFAULTS)) {
    const cur = result[key];
    if (cur === undefined || cur === null || (typeof cur === "string" && !cur.trim())) {
      result[key] = val;
    }
  }
  return result;
}

export const FLAMEPROOF_MOTOR_DEFAULTS: Record<string, unknown> = {
  motor_type:           "Induction",
  mounting:             "Horizontal (B3)",
  cooling_type:         "TEFC",
  voltage:              "415 V",
  phase:                "Three Phase",
  frequency:            "50 Hz",
  num_poles:            "4",
  duty:                 "S1 (Continuous)",
  area_classification:  "Zone 1",
  ip_rating:            "IP55",
  efficiency_class:     "IE4",
  vfd_compatible:       "Yes",
  material:             "Cast Iron",
  explosion_protection: "Ex d",
  gas_group:            "IIA",
};

export function applyFlameproofMotorDefaults(existing: Record<string, unknown>): Record<string, unknown> {
  const result = { ...existing };
  for (const [key, val] of Object.entries(FLAMEPROOF_MOTOR_DEFAULTS)) {
    const cur = result[key];
    if (cur === undefined || cur === null || (typeof cur === "string" && !cur.trim())) {
      result[key] = val;
    }
  }
  return result;
}

const MOTOR_MAKES = ["ABB", "Siemens", "WEG", "Crompton", "Kirloskar", "Bharat Bijlee", "Havells", "Leroy Somer", "TECO"];

export function MotorAttrsForm({
  attrs, qty, isFlameproof, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  isFlameproof: boolean;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const areaOpts = isFlameproof ? MOTOR_AREA_HAZARDOUS : MOTOR_AREA_SAFE;
  const currentFreq = (attrs.frequency as string) ?? "";
  const speedOpts   = MOTOR_SPEED_BY_FREQ[currentFreq] ?? MOTOR_SPEED_BY_FREQ["50 Hz"];
  const polesOpts   = MOTOR_POLES_BY_FREQ[currentFreq]  ?? MOTOR_POLES_BY_FREQ["50 Hz"];
  const singleKeys = [...Object.keys(MOTOR_OPTS), "area_classification"];
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of singleKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = key === "area_classification" ? areaOpts
                 : key === "speed"               ? speedOpts
                 : (MOTOR_OPTS[key] ?? []);
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  function handleSelect(key: string, val: string) {
    if (key === "frequency" && val !== "__other__") {
      const newSpeedOpts = MOTOR_SPEED_BY_FREQ[val] ?? [];
      const newPolesOpts = MOTOR_POLES_BY_FREQ[val]  ?? [];
      const currentSpeed = (attrs.speed as string) ?? "";
      const currentPoles = (attrs.num_poles as string) ?? "";
      const speedStillValid = newSpeedOpts.includes(currentSpeed);
      const polesStillValid = newPolesOpts.includes(currentPoles);
      setCustom((c) => ({ ...c, [key]: false, speed: speedStillValid ? c.speed : false }));
      onChange({
        ...attrs,
        frequency: val,
        speed:     speedStillValid ? currentSpeed : "",
        num_poles: polesStillValid ? currentPoles : "",
      });
      return;
    }
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function renderField(key: string, label: string, opts: string[], required?: boolean, hideOther?: boolean) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} hideOther={hideOther} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

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

  function SectionCard({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
    return (
      <div className={`rounded-lg border ${color} p-4 space-y-3`}>
        <h4 className="text-xs font-bold uppercase tracking-widest text-foreground/70 pb-1 border-b border-border/60">
          {title}
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* 1 — Motor Specifications */}
      <SectionCard title="Motor Specifications" color="bg-sky-50/60 border-sky-200">
        {renderField("motor_type",   "Motor Type",   MOTOR_OPTS.motor_type,   true)}
        {renderField("mounting",     "Mounting",     MOTOR_OPTS.mounting,     true)}
        {renderField("cooling_type", "Cooling Type", MOTOR_OPTS.cooling_type, true)}
        <div />
      </SectionCard>

      {/* 2 — Electrical Data */}
      <SectionCard title="Electrical Data" color="bg-violet-50/60 border-violet-200">
        {renderField("power",   "Power (kW)", MOTOR_OPTS.power,     true)}
        {renderField("voltage", "Voltage",    MOTOR_OPTS.voltage,   true)}
        <div className="space-y-1.5">
          <Label className="text-xs">Phase <span className="text-red-500">*</span></Label>
          <div className="h-8 flex items-center px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">Three Phase</div>
        </div>
        {renderField("frequency", "Frequency",   MOTOR_OPTS.frequency, true)}
        {renderField("speed",     "Speed (RPM)", speedOpts,            true)}
        <div className="space-y-1.5">
          <Label className="text-xs">Number of Poles <span className="text-red-500">*</span></Label>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={(attrs.num_poles as string) ?? ""}
            onChange={(e) => set("num_poles", e.target.value)}
          >
            <option value="" disabled>Select…</option>
            {polesOpts.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </SectionCard>

      {/* 3 — Operating Conditions */}
      <SectionCard title="Operating Conditions" color="bg-emerald-50/60 border-emerald-200">
        {renderField("duty",                "Duty",                MOTOR_OPTS.duty,             true)}
        {renderField("area_classification", "Area Classification", areaOpts,                    true, true)}
        {renderField("ip_rating",           "IP Rating",           MOTOR_OPTS.ip_rating,        true)}
        {renderField("efficiency_class",    "Efficiency Class",    MOTOR_OPTS.efficiency_class, true)}
        {renderField("vfd_compatible",      "VFD Compatible",      MOTOR_OPTS.vfd_compatible,   true)}
        <div />
      </SectionCard>

      {/* 4 — Flameproof / Hazardous Area Details (flameproof only) */}
      {isFlameproof && (
        <SectionCard title="Flameproof / Hazardous Area Details" color="bg-amber-50/60 border-amber-300">
          <div className="space-y-1.5">
            <Label className="text-xs">Explosion Protection <span className="text-red-500">*</span></Label>
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={(attrs.explosion_protection as string) ?? "Ex d"}
              onChange={(e) => set("explosion_protection", e.target.value)}
            >
              <option value="Ex d">Ex d</option>
              <option value="IECEx d">IECEx d</option>
              <option value="ATEX">ATEX</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Gas Group <span className="text-red-500">*</span></Label>
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={(attrs.gas_group as string) ?? "IIA"}
              onChange={(e) => set("gas_group", e.target.value)}
            >
              <option value="IIA">IIA</option>
              <option value="IIB">IIB</option>
              <option value="IIC">IIC</option>
            </select>
          </div>
        </SectionCard>
      )}

      {/* 5 — Construction / Approved Makes */}
      <SectionCard title="Construction / Approved Makes" color="bg-slate-50/80 border-slate-200">
        {renderField("material", "Material", MOTOR_OPTS.material)}
        <div />
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Approved Makes <span className="text-red-500"> *</span></Label>
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
            <div className="flex flex-wrap gap-1 mt-1">
              {approvedMakes.map((make) => (
                <Badge key={make} variant="secondary" className="text-xs pr-1 gap-1">
                  {make}
                  <button type="button"
                    onClick={() => onChange({ ...attrs, approved_makes: approvedMakes.filter((m) => m !== make) })}
                    className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {showCustomMake && (
            <div className="flex gap-2 mt-1">
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

        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="0.01" step="0.01"
              value={qty} onChange={(e) => onQtyChange?.(e.target.value)} />
          </div>
        )}
      </SectionCard>

    </div>
  );
}
