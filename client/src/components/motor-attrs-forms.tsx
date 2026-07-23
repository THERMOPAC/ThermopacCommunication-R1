import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ChevronsUpDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { getMakesList } from "@/lib/approved-makes";

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

// ── NFP Motor — controlled vocabulary ────────────────────────────────────────

/**
 * Approved Motor Type vocabulary for Non-Flameproof motors.
 * Display name is stored in technical_attributes; the server maps it to the
 * 3–4 char short code when building the SAP Item Code.
 */
export const NFP_MOTOR_TYPES = [
  { code: 'IND', label: 'Induction' },
  { code: 'BRK', label: 'Brake Motor' },
  { code: 'VFD', label: 'VFD Duty' },
  { code: 'SYN', label: 'Synchronous' },
  { code: 'PMS', label: 'Permanent Magnet Synchronous' },
  { code: 'WRM', label: 'Wound Rotor Motor' },
] as const;

const NFP_MOTOR_TYPE_LABELS = NFP_MOTOR_TYPES.map((t) => t.label);

/** Full IEC 60034-1 standard power rating list (kW). Stored as-is in attrs. */
const IEC_POWER_RATINGS = [
  "0.09", "0.12", "0.18", "0.25", "0.37", "0.55", "0.75",
  "1.1", "1.5", "2.2", "3", "3.7", "4", "5.5", "7.5",
  "11", "15", "18.5", "22", "30", "37", "45", "55", "75",
  "90", "110", "132", "160", "200", "250", "315", "400", "500",
];

/** IEC 60034-7 mounting codes. Stored as bare IEC codes in attrs. */
const IEC_MOUNTING_CODES = ["B3", "B5", "B14", "B35", "V1", "V3", "V5", "V6"];

/**
 * Client-side NFP Motor SAP Item Code preview.
 * Mirrors the server logic in buy-catalog-sap-service.ts.
 * Returns the generated code string, or null if any required field is missing/unrecognised.
 *
 * Power P-notation rules (same as server):
 *   Whole kW  → 3-digit zero-padded integer        e.g. "015"
 *   Sub-1 kW  → "000P{centesimal fraction}"         e.g. "000P37"
 *   Fractional ≥1 kW → "{3d}P{decimal}"             e.g. "001P1", "018P5"
 */
export function buildNfpMotorPreviewCode(attrs: Record<string, unknown>): string | null {
  const MTYPE: Record<string, string> = {
    'Induction': 'IND', 'Brake Motor': 'BRK', 'VFD Duty': 'VFD',
    'Synchronous': 'SYN', 'Permanent Magnet Synchronous': 'PMS', 'Wound Rotor Motor': 'WRM',
  };
  // Accepts both legacy display strings and bare IEC codes
  const MOUNT: Record<string, string> = {
    'Horizontal (B3)': 'B3', 'Flange Mounted (B5)': 'B5', 'Foot + Flange (B35)': 'B35',
    'Vertical (V1)': 'V1', 'Vertical (V3)': 'V3', 'Vertical (V5)': 'V5', 'Vertical (V6)': 'V6',
    'B3': 'B3', 'B5': 'B5', 'B14': 'B14', 'B35': 'B35',
    'V1': 'V1', 'V3': 'V3', 'V5': 'V5', 'V6': 'V6',
  };
  const VOLT: Record<string, string> = {
    '230 V': '230', '380 V': '380', '400 V': '400', '415 V': '415', '440 V': '440',
    '525 V': '525', '690 V': '690', '3300 V': '3300', '6600 V': '6600', '11000 V': '11000',
  };
  const FREQ: Record<string, string> = { '50 Hz': '50', '60 Hz': '60' };

  function encodeKw(kw: string): string | null {
    const num = parseFloat(kw);
    if (isNaN(num) || num <= 0) return null;
    if (Number.isInteger(num)) return String(num).padStart(3, '0');
    const s = num.toString();
    const d = s.indexOf('.');
    return `${s.slice(0, d).padStart(3, '0')}P${s.slice(d + 1)}`;
  }

  const motorType  = MTYPE[(attrs.motor_type as string)?.trim() ?? ''];
  const mounting   = MOUNT[(attrs.mounting   as string)?.trim() ?? ''];
  const power      = encodeKw((attrs.power   as string)?.trim() ?? '');
  const voltage    = VOLT[(attrs.voltage     as string)?.trim() ?? ''];
  const frequency  = FREQ[(attrs.frequency   as string)?.trim() ?? ''];
  const poles      = ((attrs.num_poles ?? attrs.poles) as string | undefined)?.trim() ?? '';
  const efficiency = (attrs.efficiency_class as string)?.trim() ?? '';

  if (!motorType || !mounting || !power || !voltage || !frequency || !poles || !efficiency)
    return null;

  return `MOT-NFP-${motorType}-${mounting}-${power}-${voltage}-${frequency}-${poles}-${efficiency}`;
}

const MOTOR_OPTS: Record<string, string[]> = {
  motor_type:       NFP_MOTOR_TYPE_LABELS,
  mounting:         IEC_MOUNTING_CODES,
  cooling_type:     ["TEFC", "ODP", "TENV"],
  power:            IEC_POWER_RATINGS,
  voltage:          ["230 V", "380 V", "400 V", "415 V", "440 V", "525 V", "690 V", "3300 V", "6600 V", "11000 V"],
  frequency:        ["50 Hz", "60 Hz"],
  speed:            ["750", "1000", "1500", "3000"],
  duty:             ["S1 (Continuous)", "S2", "S3", "Intermittent", "Standby"],
  ip_rating:        ["IP55", "IP56", "IP65", "IP66"],
  efficiency_class: ["IE2", "IE3", "IE4"],
  vfd_compatible:   ["Yes", "No"],
  material:         ["Cast Iron", "Aluminium"],
};

// RPM = 120 × Hz / poles  (synchronous speed formula)
function computeRPM(freqStr: string, polesStr: string): string {
  const freqMatch = freqStr?.match(/(\d+)/);
  const freq  = freqMatch ? parseInt(freqMatch[1]) : 0;
  const poles = parseInt(polesStr ?? "0");
  if (!freq || !poles) return "";
  return String(Math.round(120 * freq / poles));
}

const MOTOR_POLES_BY_FREQ: Record<string, string[]> = {
  "50 Hz": ["2", "4", "6", "8"],
  "60 Hz": ["2", "4", "6", "8"],
};

const MOTOR_AREA_SAFE      = ["Safe Area", "Other"];
const MOTOR_AREA_HAZARDOUS = ["Zone 1", "Zone 2"];

export const NON_FLAMEPROOF_MOTOR_DEFAULTS: Record<string, unknown> = {
  motor_type:          "Induction",
  mounting:            "B3",
  cooling_type:        "TEFC",
  voltage:             "415 V",
  phase:               "Three Phase",
  frequency:           "50 Hz",
  num_poles:           "4",
  speed:               "1500",
  duty:                "S1 (Continuous)",
  area_classification: "Other",
  ip_rating:           "IP55",
  efficiency_class:    "IE3",
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
  mounting:             "B3",
  cooling_type:         "TEFC",
  voltage:              "415 V",
  phase:                "Three Phase",
  frequency:            "50 Hz",
  num_poles:            "4",
  speed:                "1500",
  duty:                 "S1 (Continuous)",
  area_classification:  "Zone 1",
  ip_rating:            "IP55",
  efficiency_class:     "IE3",
  vfd_compatible:       "No",
  material:             "Cast Iron",
  explosion_protection: "Ex d",
  gas_group:            "IIB",
  temperature_class:    "T3",
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

/**
 * Client-side FLP Motor SAP Item Code preview.
 * Mirrors buildFlpMotorItemCode in buy-catalog-sap-service.ts.
 * Returns the generated code string, or null if any required field is missing/unrecognised.
 */
export function buildFlpMotorPreviewCode(attrs: Record<string, unknown>): string | null {
  const MTYPE: Record<string, string> = {
    'Induction': 'IND', 'Brake Motor': 'BRK', 'VFD Duty': 'VFD',
    'Synchronous': 'SYN', 'Permanent Magnet Synchronous': 'PMS', 'Wound Rotor Motor': 'WRM',
  };
  const MOUNT: Record<string, string> = {
    'Horizontal (B3)': 'B3', 'Flange Mounted (B5)': 'B5', 'Foot + Flange (B35)': 'B35',
    'Vertical (V1)': 'V1', 'Vertical (V3)': 'V3', 'Vertical (V5)': 'V5', 'Vertical (V6)': 'V6',
    'B3': 'B3', 'B5': 'B5', 'B14': 'B14', 'B35': 'B35',
    'V1': 'V1', 'V3': 'V3', 'V5': 'V5', 'V6': 'V6',
  };
  const VOLT: Record<string, string> = {
    '230 V': '230', '380 V': '380', '400 V': '400', '415 V': '415', '440 V': '440',
    '525 V': '525', '690 V': '690', '3300 V': '3300', '6600 V': '6600', '11000 V': '11000',
  };
  const FREQ: Record<string, string> = { '50 Hz': '50', '60 Hz': '60' };
  const EXPROT: Record<string, string> = {
    'Ex d': 'EXD', 'Ex e': 'EXE', 'Ex de': 'EXDE', 'Ex n': 'EXN', 'Ex p': 'EXP',
  };
  const GASGRP: Record<string, string> = { 'IIA': 'IIA', 'IIB': 'IIB', 'IIC': 'IIC' };
  const TCLS: Record<string, string> = {
    'T1': 'T1', 'T2': 'T2', 'T3': 'T3', 'T4': 'T4', 'T5': 'T5', 'T6': 'T6',
  };

  function encodeKw(kw: string): string | null {
    const num = parseFloat(kw);
    if (isNaN(num) || num <= 0) return null;
    if (Number.isInteger(num)) return String(num).padStart(3, '0');
    const s = num.toString();
    const d = s.indexOf('.');
    return `${s.slice(0, d).padStart(3, '0')}P${s.slice(d + 1)}`;
  }

  const motorType    = MTYPE[(attrs.motor_type as string)?.trim() ?? ''];
  const mounting     = MOUNT[(attrs.mounting   as string)?.trim() ?? ''];
  const power        = encodeKw((attrs.power   as string)?.trim() ?? '');
  const voltage      = VOLT[(attrs.voltage     as string)?.trim() ?? ''];
  const frequency    = FREQ[(attrs.frequency   as string)?.trim() ?? ''];
  const poles        = ((attrs.num_poles ?? attrs.poles) as string | undefined)?.trim() ?? '';
  const efficiency   = (attrs.efficiency_class     as string)?.trim() ?? '';
  const exProtection = EXPROT[(attrs.explosion_protection as string)?.trim() ?? ''];
  const gasGroup     = GASGRP[(attrs.gas_group        as string)?.trim() ?? ''];
  const tClass       = TCLS[(attrs.temperature_class  as string)?.trim() ?? ''];

  if (!motorType || !mounting || !power || !voltage || !frequency || !poles || !efficiency ||
      !exProtection || !gasGroup || !tClass)
    return null;

  return `MOT-FLP-${motorType}-${mounting}-${power}-${voltage}-${frequency}-${poles}-${efficiency}-${exProtection}-${gasGroup}-${tClass}`;
}

const MOTOR_MAKES: string[] = [];

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
  const polesOpts   = MOTOR_POLES_BY_FREQ[currentFreq]  ?? MOTOR_POLES_BY_FREQ["50 Hz"];
  const singleKeys = [...Object.keys(MOTOR_OPTS).filter((k) => k !== "speed"), "area_classification"];
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
    if (key === "frequency" && val !== "__other__") {
      const newPolesOpts = MOTOR_POLES_BY_FREQ[val] ?? [];
      const currentPoles = (attrs.num_poles as string) ?? "";
      const polesStillValid = newPolesOpts.includes(currentPoles);
      const effectivePoles = polesStillValid ? currentPoles : "";
      setCustom((c) => ({ ...c, [key]: false }));
      onChange({
        ...attrs,
        frequency: val,
        num_poles: effectivePoles,
        speed:     computeRPM(val, effectivePoles),
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

  function renderField(key: string, label: string, opts: string[], required?: boolean, hideOther?: boolean, wrapClass?: string) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className={`space-y-1.5 ${wrapClass ?? ""}`}>
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

  const makeOpts = getMakesList("motor", MOTOR_MAKES);

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
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
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
        {renderField("frequency", "Frequency", MOTOR_OPTS.frequency, true)}
        <div className="space-y-1.5">
          <Label className="text-xs">Number of Poles <span className="text-red-500">*</span></Label>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={(attrs.num_poles as string) ?? ""}
            onChange={(e) => {
              const poles = e.target.value;
              onChange({ ...attrs, num_poles: poles, speed: computeRPM(currentFreq, poles) });
            }}
          >
            <option value="" disabled>Select…</option>
            {polesOpts.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Speed (RPM) <span className="text-red-500">*</span></Label>
          <div className="h-8 flex items-center px-3 rounded-md border bg-muted/50 text-sm font-medium">
            {computeRPM(currentFreq, (attrs.num_poles as string) ?? "") || <span className="text-muted-foreground">Select frequency &amp; poles</span>}
          </div>
        </div>
      </SectionCard>

      {/* 3 — Operating Conditions */}
      <SectionCard title="Operating Conditions" color="bg-emerald-50/60 border-emerald-200">
        {renderField("duty",                "Duty",                MOTOR_OPTS.duty,             true)}
        {renderField("area_classification", "Area Classification", areaOpts,                    true, true, "col-span-2")}
        {renderField("ip_rating",           "IP Rating",           MOTOR_OPTS.ip_rating,        true)}
        {renderField("efficiency_class",    "Efficiency Class",    MOTOR_OPTS.efficiency_class, true, undefined, "col-span-2")}
        {renderField("vfd_compatible",      "VFD Compatible",      MOTOR_OPTS.vfd_compatible,   true, undefined, "col-span-2")}
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
              <option value="Ex d">Ex d — Flameproof enclosure</option>
              <option value="Ex e">Ex e — Increased safety</option>
              <option value="Ex de">Ex de — Combined (d+e)</option>
              <option value="Ex n">Ex n — Non-sparking</option>
              <option value="Ex p">Ex p — Pressurised</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Gas Group <span className="text-red-500">*</span></Label>
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={(attrs.gas_group as string) ?? "IIB"}
              onChange={(e) => set("gas_group", e.target.value)}
            >
              <option value="IIA">IIA — Propane / Methane</option>
              <option value="IIB">IIB — Ethylene</option>
              <option value="IIC">IIC — Hydrogen / Acetylene</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Temperature Class <span className="text-red-500">*</span></Label>
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={(attrs.temperature_class as string) ?? "T3"}
              onChange={(e) => set("temperature_class", e.target.value)}
            >
              <option value="T1">T1 — Max 450°C</option>
              <option value="T2">T2 — Max 300°C</option>
              <option value="T3">T3 — Max 200°C</option>
              <option value="T4">T4 — Max 135°C</option>
              <option value="T5">T5 — Max 100°C</option>
              <option value="T6">T6 — Max 85°C</option>
            </select>
          </div>
        </SectionCard>
      )}

      {/* 5 — Construction */}
      <SectionCard title="Construction" color="bg-slate-50/80 border-slate-200">
        {renderField("material", "Material", MOTOR_OPTS.material)}
        {renderField("make", "Make", makeOpts, true)}

        {qty !== undefined && (
          <div className="space-y-1.5 col-span-3 md:col-span-5">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }} />
          </div>
        )}
      </SectionCard>

    </div>
  );
}
