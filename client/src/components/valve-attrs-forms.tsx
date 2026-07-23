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
import { X, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { shortenToSapItemName } from "@/lib/sap-item-name";
import { getMakesList } from "@/lib/approved-makes";

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
// CONTROL VALVE
// ─────────────────────────────────────────────────────────────────────────────
const CONTROL_VALVE_TYPES = [
  "Globe Control Valve",
  "Ball Control Valve",
  "Butterfly Control Valve",
  "Eccentric Plug / Rotary Control Valve",
  "Angle Control Valve",
];

const CONTROL_COMMON_OPTS = {
  size_nb:              ["15 NB","20 NB","25 NB","40 NB","50 NB","65 NB","80 NB","100 NB","150 NB","200 NB","250 NB","300 NB"],
  pressure_rating:      ["Class 150","Class 300","Class 600","Class 900","Class 1500","Class 2500",
                         "PN10","PN16","PN25","PN40","PN64","PN100","PN160"],
  end_connection:       ["Flanged","Threaded","Butt Weld","Socket Weld"],
  end_conn_bfly:        ["Wafer","Flanged","Lug"],
  body_material:        ["WCB (CS)","LCB (Low Temp CS)","SS304","SS316","SS316L","CF8","CF8M","Duplex SS","Hastelloy C"],
  actuator_type:        ["Pneumatic Diaphragm","Pneumatic Piston","Electric Actuator","Hydraulic Actuator"],
  fail_action:          ["Fail Open (FO)","Fail Close (FC)","Fail Last (FL)"],
  input_signal:         ["4–20 mA","4–20 mA + HART","Foundation Fieldbus","PROFIBUS PA",
                         "Modbus RTU","Modbus TCP","Profinet","Ethernet/IP"],
  positioner:           ["With Positioner","Without Positioner"],
  handwheel:            ["Yes","No"],
  bypass_valve:         ["Yes","No"],
  area_classification:  ["Safe Area","Zone 1","Zone 2"],
  certification:        ["ATEX","IECEx","PESO"],
  explosion_protection: ["Flameproof (Ex d)","Intrinsically Safe (Ex ia)","Intrinsically Safe (Ex ib)",
                         "Increased Safety (Ex e)","Non-sparking (Ex n)"],
  gas_group:            ["IIA","IIB","IIC"],
  temperature_class:    ["T1","T2","T3","T4","T5","T6"],
};

const GLOBE_CV_OPTS = {
  valve_config:        ["Two Way","Three Way (Mixing)","Three Way (Diverting)"],
  trim_style:          ["Single Seated","Double Seated","Cage Guided","Balanced Trim"],
  flow_characteristic: ["Linear","Equal Percentage","Quick Opening"],
  trim_material:       ["SS304","SS316","Hardened SS","Stellite Overlay","SS316 + Stellite"],
  seat_material:       ["Metal Seat","Soft Seat (PTFE)","Graphite"],
  leakage_class:       ["Class II","Class III","Class IV","Class V","Class VI"],
  bonnet_type:         ["Standard","Extended (Low Temp)","Bellows Sealed (High Temp)"],
  packing_material:    ["PTFE","Graphite","PTFE V-Ring"],
  noise_cavitation:    ["Standard","Anti-Cavitation Trim","Low-Noise Trim","Multi-Stage Cage"],
};

const BALL_CV_OPTS = {
  ball_type:           ["Segmented Ball","V-Port Ball","Characterized Ball"],
  flow_characteristic: ["Equal Percentage","Modified Linear"],
  ball_trim_material:  ["SS316","Hardened SS","Stellite Overlay","Duplex SS"],
  seat_material:       ["PTFE","PEEK","Metal (SS316)","Metal (Hardened)"],
  leakage_class:       ["Class IV","Class V","Class VI"],
  packing_material:    ["PTFE","Graphite"],
};

const BFLY_CV_OPTS = {
  disc_mounting:       ["Double Offset","Triple Offset (High Performance)"],
  disc_material:       ["CI","CS","SS304","SS316","Duplex SS"],
  seat_liner_material: ["EPDM","PTFE","Metal (SS316)","Graphite"],
  leakage_class:       ["Class II","Class III","Class IV"],
  flow_characteristic: ["Inherent Equal %","Linear"],
};

const PLUG_CV_OPTS = {
  plug_style:          ["Contoured Plug","Characterized Plug"],
  plug_trim_material:  ["SS304","SS316","Hardened SS","Stellite"],
  seat_material:       ["Metal Seat","Resilient Seat (PTFE)"],
  leakage_class:       ["Class IV","Class V","Class VI"],
  packing_material:    ["PTFE","Graphite"],
};

const ANGLE_CV_OPTS = {
  service_application: ["High ΔP / Flash","Cavitation","Steam-Condensate","Erosive Slurry","General High ΔP"],
  flow_direction:      ["Flow-to-Open","Flow-to-Close"],
  trim_style:          ["Standard","Anti-Cavitation","Low-Noise","Multi-Stage Cage","Perforated Cage"],
  trim_material:       ["SS316","Hardened Trim","Stellite","Tungsten Carbide"],
  seat_material:       ["Metal Seat","Hard-Faced Metal"],
  leakage_class:       ["Class II","Class III","Class IV","Class V"],
  outlet_reducer:      ["Yes","No"],
};

const CONTROL_ALL_FIELD_OPTS: Record<string, string[]> = {
  ...CONTROL_COMMON_OPTS,
  valve_config:        GLOBE_CV_OPTS.valve_config,
  trim_style:          [...GLOBE_CV_OPTS.trim_style, ...ANGLE_CV_OPTS.trim_style],
  flow_characteristic: [...GLOBE_CV_OPTS.flow_characteristic, ...BALL_CV_OPTS.flow_characteristic, ...BFLY_CV_OPTS.flow_characteristic],
  trim_material:       [...GLOBE_CV_OPTS.trim_material, ...ANGLE_CV_OPTS.trim_material],
  ball_trim_material:  BALL_CV_OPTS.ball_trim_material,
  plug_trim_material:  PLUG_CV_OPTS.plug_trim_material,
  disc_material:       BFLY_CV_OPTS.disc_material,
  seat_material:       [...GLOBE_CV_OPTS.seat_material, ...BALL_CV_OPTS.seat_material, ...PLUG_CV_OPTS.seat_material, ...ANGLE_CV_OPTS.seat_material],
  seat_liner_material: BFLY_CV_OPTS.seat_liner_material,
  leakage_class:       GLOBE_CV_OPTS.leakage_class,
  bonnet_type:         GLOBE_CV_OPTS.bonnet_type,
  packing_material:    GLOBE_CV_OPTS.packing_material,
  noise_cavitation:    GLOBE_CV_OPTS.noise_cavitation,
  ball_type:           BALL_CV_OPTS.ball_type,
  disc_mounting:       BFLY_CV_OPTS.disc_mounting,
  plug_style:          PLUG_CV_OPTS.plug_style,
  service_application: ANGLE_CV_OPTS.service_application,
  flow_direction:      ANGLE_CV_OPTS.flow_direction,
  outlet_reducer:      ANGLE_CV_OPTS.outlet_reducer,
  explosion_protection:CONTROL_COMMON_OPTS.explosion_protection,
  gas_group:           CONTROL_COMMON_OPTS.gas_group,
  temperature_class:   CONTROL_COMMON_OPTS.temperature_class,
};

const CONTROL_VALVE_MAKES: string[] = [];

/**
 * Client-side Control Valve SAP Item Code preview.
 * Mirrors buildCtrlValveItemCode in buy-catalog-sap-service.ts.
 * Returns the generated code, or null if any required field is missing/unrecognised.
 */
export function buildCtrlValvePreviewCode(attrs: Record<string, unknown>): string | null {
  const VTYPE = (valveTypeRaw: string, valveConfigRaw: string): string | undefined => {
    const vt = valveTypeRaw.toLowerCase();
    if (vt.includes('globe')) {
      const cfg = valveConfigRaw.toLowerCase();
      if (cfg.includes('mixing'))    return 'G3MX';
      if (cfg.includes('diverting')) return 'G3DV';
      return 'GLBE';
    }
    if (vt.includes('ball'))      return 'BALL';
    if (vt.includes('butterfly')) return 'BFLY';
    if (vt.includes('eccentric') || vt.includes('rotary')) return 'PLUG';
    if (vt.includes('angle'))     return 'ANGL';
    return undefined;
  };

  const ECONN: Record<string, string> = {
    'Flanged': 'RF', 'Threaded': 'THD', 'Butt Weld': 'BW', 'Socket Weld': 'SW',
    'Wafer': 'WFR', 'Lug': 'LUG',
  };
  const PRES: Record<string, string> = {
    'Class 150': 'CL150', 'Class 300': 'CL300', 'Class 600': 'CL600',
    'Class 900': 'CL900', 'Class 1500': 'CL1500', 'Class 2500': 'CL2500',
    'PN10': 'PN10', 'PN16': 'PN16', 'PN25': 'PN25', 'PN40': 'PN40',
    'PN64': 'PN64', 'PN100': 'PN100', 'PN160': 'PN160',
  };
  const BMAT: Record<string, string> = {
    'WCB (CS)': 'WCB', 'LCB (Low Temp CS)': 'LCB',
    'SS304': 'SS304', 'SS316': 'SS316', 'SS316L': 'SS316L',
    'CF8': 'CF8', 'CF8M': 'CF8M', 'Duplex SS': 'DSS', 'Hastelloy C': 'HC276',
  };
  const TRIM: Record<string, string> = {
    'SS304': 'SS304', 'SS316': 'SS316', 'SS316L': 'S316L',
    'Hardened SS': 'HSS', 'Hardened Trim': 'HSS',
    'Stellite Overlay': 'STLT', 'Stellite': 'STLT',
    'SS316 + Stellite': 'S3ST', 'Duplex SS': 'DSS',
    'EPDM': 'EPDM', 'PTFE': 'PTFE', 'Metal (SS316)': 'SS316', 'Graphite': 'GRPH',
    'Tungsten Carbide': 'TC',
  };
  const ACT: Record<string, string> = {
    'Pneumatic Diaphragm': 'PNEU', 'Pneumatic Piston': 'PNUP',
    'Electric Actuator': 'ELEC', 'Hydraulic Actuator': 'HYD',
  };
  const FAIL: Record<string, string> = {
    'Fail Open (FO)': 'FO', 'Fail Close (FC)': 'FC', 'Fail Last (FL)': 'FL',
  };

  const valveTypeRaw  = (attrs.valve_type     as string)?.trim() ?? '';
  const valveConfigRaw= (attrs.valve_config   as string)?.trim() ?? '';
  const endConnRaw    = (attrs.end_connection  as string)?.trim() ?? '';
  const sizeRaw       = (attrs.size_nb         as string)?.trim() ?? '';
  const pressureRaw   = (attrs.pressure_rating as string)?.trim() ?? '';
  const bodyMatRaw    = (attrs.body_material   as string)?.trim() ?? '';
  const actuatorRaw   = (attrs.actuator_type   as string)?.trim() ?? '';
  const failRaw       = (attrs.fail_action     as string)?.trim() ?? '';
  const vt            = valveTypeRaw.toLowerCase();

  const valveType = VTYPE(valveTypeRaw, valveConfigRaw);
  const endConn   = ECONN[endConnRaw];
  const sizeMatch = sizeRaw.match(/^(\d+)\s*NB$/i);
  const size      = sizeMatch ? `DN${sizeMatch[1]}` : undefined;
  const pressure  = PRES[pressureRaw];
  const bodyMat   = BMAT[bodyMatRaw];
  const actuator  = ACT[actuatorRaw];
  const failAction= FAIL[failRaw];

  let trimRaw = '';
  if (vt.includes('globe') || vt.includes('angle'))              trimRaw = (attrs.trim_material       as string)?.trim() ?? '';
  else if (vt.includes('ball'))                                  trimRaw = (attrs.ball_trim_material  as string)?.trim() ?? '';
  else if (vt.includes('butterfly'))                             trimRaw = (attrs.seat_liner_material as string)?.trim() ?? '';
  else if (vt.includes('eccentric') || vt.includes('rotary'))   trimRaw = (attrs.plug_trim_material  as string)?.trim() ?? '';
  const trim = TRIM[trimRaw];

  if (!valveType || !endConn || !size || !pressure || !bodyMat || !trim || !actuator || !failAction) return null;
  return `VLV-CV-${valveType}-${endConn}-${size}-${pressure}-${bodyMat}-${trim}-${actuator}-${failAction}`;
}

export function buildControlValveRequirement(attrs: Record<string, unknown>): string {
  const type     = (attrs.valve_type      as string)?.trim() || "";
  const sizeNb   = (attrs.size_nb         as string)?.trim() || "";
  const rating   = (attrs.pressure_rating as string)?.trim() || "";
  const actuator = (attrs.actuator_type   as string)?.trim() || "";
  const failAct  = (attrs.fail_action     as string)?.trim() || "";
  const endConn  = (attrs.end_connection  as string)?.trim() || "";
  const bodyMat  = (attrs.body_material   as string)?.trim() || "";
  const typeLC   = type.toLowerCase();
  let typeSpecific = "";
  if (typeLC.includes("globe")) {
    const p: string[] = [];
    const trimStyle = (attrs.trim_style as string)?.trim() || "";
    const trimMat   = (attrs.trim_material as string)?.trim() || "";
    const flowChar  = (attrs.flow_characteristic as string)?.trim() || "";
    if (trimStyle) p.push(trimStyle);
    if (trimMat)   p.push(`${trimMat} Trim`);
    if (flowChar)  p.push(flowChar);
    typeSpecific = p.join(", ");
  } else if (typeLC.includes("angle")) {
    const p: string[] = [];
    const trimStyle = (attrs.trim_style as string)?.trim() || "";
    const trimMat   = (attrs.trim_material as string)?.trim() || "";
    const svc       = (attrs.service_application as string)?.trim() || "";
    if (svc)       p.push(svc);
    if (trimStyle) p.push(trimStyle);
    if (trimMat)   p.push(`${trimMat} Trim`);
    typeSpecific = p.join(", ");
  } else if (typeLC.includes("ball")) {
    const p: string[] = [];
    const ballType = (attrs.ball_type as string)?.trim() || "";
    const ballMat  = (attrs.ball_trim_material as string)?.trim() || "";
    const seatMat  = (attrs.seat_material as string)?.trim() || "";
    if (ballType) p.push(ballType);
    if (ballMat)  p.push(`${ballMat} Ball`);
    if (seatMat)  p.push(`${seatMat} Seat`);
    typeSpecific = p.join(", ");
  } else if (typeLC.includes("butterfly")) {
    const p: string[] = [];
    const discMount = (attrs.disc_mounting as string)?.trim() || "";
    const discMat   = (attrs.disc_material as string)?.trim() || "";
    const seatMat   = (attrs.seat_liner_material as string)?.trim() || "";
    if (discMount) p.push(discMount);
    if (discMat)   p.push(`${discMat} Disc`);
    if (seatMat)   p.push(`${seatMat} Seat`);
    typeSpecific = p.join(", ");
  } else if (typeLC.includes("eccentric") || typeLC.includes("rotary")) {
    const p: string[] = [];
    const plugStyle = (attrs.plug_style as string)?.trim() || "";
    const plugMat   = (attrs.plug_trim_material as string)?.trim() || "";
    const seatMat   = (attrs.seat_material as string)?.trim() || "";
    if (plugStyle) p.push(plugStyle);
    if (plugMat)   p.push(`${plugMat} Plug`);
    if (seatMat)   p.push(`${seatMat} Seat`);
    typeSpecific = p.join(", ");
  }
  const areaClass = (attrs.area_classification as string)?.trim() || "";
  const parts: string[] = [];
  if (type)         parts.push(type);
  if (sizeNb)       parts.push(sizeNb);
  if (rating)       parts.push(rating);
  if (typeSpecific) parts.push(typeSpecific);
  if (actuator)     parts.push(actuator);
  if (failAct)      parts.push(failAct);
  if (bodyMat)      parts.push(`${bodyMat} Body`);
  if (endConn)      parts.push(endConn);
  if (areaClass && areaClass !== "Safe Area") parts.push(areaClass);
  return shortenToSapItemName(parts.join(", "));
}

function buildControlValveDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    valve_type: type,
    size_nb: "50 NB", pressure_rating: "Class 150", end_connection: "Flanged",
    body_material: "WCB (CS)", actuator_type: "Pneumatic Diaphragm",
    fail_action: "Fail Close (FC)", input_signal: "4–20 mA + HART",
    positioner: "With Positioner", handwheel: "No", bypass_valve: "No",
    area_classification: "Safe Area", make: "",
    valve_config: "", trim_style: "", flow_characteristic: "", trim_material: "",
    seat_material: "", leakage_class: "", bonnet_type: "", packing_material: "", noise_cavitation: "",
    ball_type: "", ball_trim_material: "",
    disc_mounting: "", disc_material: "", seat_liner_material: "",
    plug_style: "", plug_trim_material: "",
    service_application: "", flow_direction: "", outlet_reducer: "",
  };
  switch (type) {
    case "Globe Control Valve":
      return { ...base, valve_config: "Two Way", trim_style: "Cage Guided",
        flow_characteristic: "Equal Percentage", trim_material: "SS316",
        seat_material: "Metal Seat", leakage_class: "Class IV",
        bonnet_type: "Standard", packing_material: "PTFE", noise_cavitation: "Standard" };
    case "Ball Control Valve":
      return { ...base, ball_type: "Segmented Ball", flow_characteristic: "Equal Percentage",
        ball_trim_material: "SS316", seat_material: "PTFE", leakage_class: "Class IV",
        packing_material: "PTFE" };
    case "Butterfly Control Valve":
      return { ...base, end_connection: "Wafer", pressure_rating: "PN16", body_material: "CI",
        disc_mounting: "Double Offset", disc_material: "SS316",
        seat_liner_material: "Metal (SS316)", leakage_class: "Class III",
        flow_characteristic: "Inherent Equal %" };
    case "Eccentric Plug / Rotary Control Valve":
      return { ...base, plug_style: "Contoured Plug", plug_trim_material: "SS316",
        seat_material: "Metal Seat", leakage_class: "Class IV", packing_material: "PTFE" };
    case "Angle Control Valve":
      return { ...base, pressure_rating: "Class 300", service_application: "High ΔP / Flash",
        flow_direction: "Flow-to-Open", trim_style: "Anti-Cavitation",
        trim_material: "Stellite", seat_material: "Metal Seat",
        leakage_class: "Class IV", outlet_reducer: "No" };
    default: return base;
  }
}

export function ControlValveAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(CONTROL_ALL_FIELD_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  function handleTypeChange(type: string) {
    const defaults = buildControlValveDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(CONTROL_ALL_FIELD_OPTS)) {
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); onChange({ ...defaults, make: "" });
  }

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      onChange({ ...attrs, [key]: "" });
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      onChange({ ...attrs, [key]: val });
    }
  }

  function set(key: string, val: unknown) { onChange({ ...attrs, [key]: val }); }

  function renderField(key: string, label: string, opts: string[], required?: boolean, wrapClass?: string) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className={`space-y-1.5 ${wrapClass ?? ""}`}>
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
      <div className="col-span-3 md:col-span-5 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  const makeOpts = getMakesList("control_valve", CONTROL_VALVE_MAKES);

  const valveType = (attrs.valve_type as string) ?? "";
  const areaClass = (attrs.area_classification as string) ?? "";
  const isGlobe   = valveType === "Globe Control Valve";
  const isBall    = valveType === "Ball Control Valve";
  const isBfly    = valveType === "Butterfly Control Valve";
  const isPlug    = valveType === "Eccentric Plug / Rotary Control Valve";
  const isAngle   = valveType === "Angle Control Valve";
  const hasType   = isGlobe || isBall || isBfly || isPlug || isAngle;


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

      {/* 1 — Valve Type */}
      <SectionCard title="Valve Type" color="bg-sky-50/60 border-sky-200">
        <div className="col-span-3 md:col-span-5 space-y-1.5">
          <Label className="text-xs">Control Valve Type <span className="text-red-500">*</span></Label>
          <SearchableSelect
            value={CONTROL_VALVE_TYPES.includes(valveType) ? valveType : ""}
            options={CONTROL_VALVE_TYPES} placeholder="Select valve type first…"
            onSelect={(v) => handleTypeChange(v)}
          />
        </div>
        {!hasType && (
          <div className="col-span-3 md:col-span-5 flex items-center justify-center py-3 text-sm text-muted-foreground">
            Select a valve type above to configure specifications
          </div>
        )}
      </SectionCard>

      {/* 2 — Type-specific configuration */}
      {isGlobe && (
        <SectionCard title="Globe Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("valve_config",        "Valve Configuration",  GLOBE_CV_OPTS.valve_config,        true)}
          {renderField("trim_style",          "Trim Style",           GLOBE_CV_OPTS.trim_style,          true)}
          {renderField("flow_characteristic", "Flow Characteristic",  GLOBE_CV_OPTS.flow_characteristic, true, "col-span-2")}
          {renderField("trim_material",       "Trim Material",        GLOBE_CV_OPTS.trim_material,       true)}
          {renderField("seat_material",       "Seat Material",        GLOBE_CV_OPTS.seat_material,       true)}
          {renderField("leakage_class",       "Leakage Class",        GLOBE_CV_OPTS.leakage_class,       true)}
          {renderField("bonnet_type",         "Bonnet Type",          GLOBE_CV_OPTS.bonnet_type)}
          {renderField("packing_material",    "Packing Material",     GLOBE_CV_OPTS.packing_material)}
          {renderField("noise_cavitation",    "Noise / Cavitation",   GLOBE_CV_OPTS.noise_cavitation)}
          <div />
        </SectionCard>
      )}

      {isBall && (
        <SectionCard title="Ball Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("ball_type",           "Ball Type",            BALL_CV_OPTS.ball_type,            true)}
          {renderField("flow_characteristic", "Flow Characteristic",  BALL_CV_OPTS.flow_characteristic,  true, "col-span-2")}
          {renderField("ball_trim_material",  "Ball / Trim Material", BALL_CV_OPTS.ball_trim_material,   true)}
          {renderField("seat_material",       "Seat Material",        BALL_CV_OPTS.seat_material,        true)}
          {renderField("leakage_class",       "Leakage Class",        BALL_CV_OPTS.leakage_class)}
          {renderField("packing_material",    "Packing Material",     BALL_CV_OPTS.packing_material)}
        </SectionCard>
      )}

      {isBfly && (
        <SectionCard title="Butterfly Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("disc_mounting",       "Disc Mounting",         BFLY_CV_OPTS.disc_mounting,       true)}
          {renderField("disc_material",       "Disc Material",         BFLY_CV_OPTS.disc_material,       true)}
          {renderField("seat_liner_material", "Seat / Liner Material", BFLY_CV_OPTS.seat_liner_material, true, "col-span-2")}
          {renderField("leakage_class",       "Leakage Class",         BFLY_CV_OPTS.leakage_class)}
          {renderField("flow_characteristic", "Flow Characteristic",   BFLY_CV_OPTS.flow_characteristic, undefined, "col-span-2")}
          <div />
        </SectionCard>
      )}

      {isPlug && (
        <SectionCard title="Eccentric Plug Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("plug_style",         "Plug Style",           PLUG_CV_OPTS.plug_style,         true)}
          {renderField("plug_trim_material", "Plug / Trim Material", PLUG_CV_OPTS.plug_trim_material, true)}
          {renderField("seat_material",      "Seat Material",        PLUG_CV_OPTS.seat_material,      true)}
          {renderField("leakage_class",      "Leakage Class",        PLUG_CV_OPTS.leakage_class)}
          {renderField("packing_material",   "Packing Material",     PLUG_CV_OPTS.packing_material)}
          <div />
        </SectionCard>
      )}

      {isAngle && (
        <SectionCard title="Angle Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("service_application", "Service Application",  ANGLE_CV_OPTS.service_application, true)}
          {renderField("flow_direction",      "Flow Direction",       ANGLE_CV_OPTS.flow_direction,      true)}
          {renderField("trim_style",          "Trim Style",           ANGLE_CV_OPTS.trim_style,          true)}
          {renderField("trim_material",       "Trim Material",        ANGLE_CV_OPTS.trim_material,       true)}
          {renderField("seat_material",       "Seat Material",        ANGLE_CV_OPTS.seat_material,       true)}
          {renderField("leakage_class",       "Leakage Class",        ANGLE_CV_OPTS.leakage_class,       true)}
          {renderField("outlet_reducer",      "Outlet Reducer",       ANGLE_CV_OPTS.outlet_reducer)}
          <div />
        </SectionCard>
      )}

      {/* 3 — Size, Rating & Body */}
      {hasType && (
        <SectionCard title="Size, Rating & Body" color="bg-violet-50/60 border-violet-200">
          {renderField("size_nb",         "Size (NB)",       CONTROL_COMMON_OPTS.size_nb,         true)}
          {renderField("pressure_rating", "Pressure Rating", CONTROL_COMMON_OPTS.pressure_rating, true)}
          {renderField("end_connection",  "End Connection",
            isBfly ? CONTROL_COMMON_OPTS.end_conn_bfly : CONTROL_COMMON_OPTS.end_connection, true)}
          {renderField("body_material",   "Body Material",   CONTROL_COMMON_OPTS.body_material,   true)}
        </SectionCard>
      )}

      {/* 4 — Actuation */}
      {hasType && (
        <SectionCard title="Actuation" color="bg-emerald-50/60 border-emerald-200">
          {renderField("actuator_type", "Actuator Type", CONTROL_COMMON_OPTS.actuator_type, true)}
          {renderField("fail_action",   "Fail Action",   CONTROL_COMMON_OPTS.fail_action,   true)}
        </SectionCard>
      )}

      {/* 5 — Signal & Control (Optional) */}
      {hasType && (
        <SectionCard title="Signal & Control (Optional)" color="bg-orange-50/60 border-orange-200">
          {renderField("input_signal",  "Input Signal",       CONTROL_COMMON_OPTS.input_signal)}
          {renderField("positioner",    "Positioner",         CONTROL_COMMON_OPTS.positioner)}
          {renderField("handwheel",     "Handwheel Override", CONTROL_COMMON_OPTS.handwheel)}
          {renderField("bypass_valve",  "Bypass Valve",       CONTROL_COMMON_OPTS.bypass_valve)}
        </SectionCard>
      )}

      {/* 6 — Area Classification (Optional) */}
      {hasType && (
        <SectionCard title="Area Classification (Optional)" color="bg-rose-50/60 border-rose-200">
          {renderField("area_classification", "Area Classification", CONTROL_COMMON_OPTS.area_classification, undefined, "col-span-2")}
          {(areaClass === "Zone 1" || areaClass === "Zone 2") ? (<>
            {renderField("certification",        "Certification",        CONTROL_COMMON_OPTS.certification,        true)}
            {renderField("explosion_protection", "Explosion Protection", CONTROL_COMMON_OPTS.explosion_protection, true, "col-span-2")}
            {renderField("gas_group",            "Gas Group",            CONTROL_COMMON_OPTS.gas_group,            true)}
            {renderField("temperature_class",    "Temperature Class",    CONTROL_COMMON_OPTS.temperature_class,    true)}
          </>) : <div />}
        </SectionCard>
      )}

      {/* Quantity */}
      {qty !== undefined && (
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="1" step="1"
            value={qty}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFETY VALVE
// ─────────────────────────────────────────────────────────────────────────────
const SAFETY_VALVE_TYPES = [
  "Pressure Safety Valve (PSV)",
  "Pressure Relief Valve (PRV)",
  "Safety Relief Valve (SRV)",
  "Vacuum Relief Valve (VRV)",
  "Breather Valve (Conservation Vent)",
];

const API_ORIFICE_OPTS = ["D","E","F","G","H","J","K","L","M","N","P","Q","R","T"];

const SAFETY_COMMON_OPTS = {
  inlet_outlet_size:  ["15 NB","25 NB","40 NB","50 NB","65 NB","80 NB","100 NB","150 NB","200 NB","250 NB","300 NB"],
  pressure_rating:    ["Class 150","Class 300","Class 600","Class 900","Class 1500"],
  end_connection:     ["Flanged","Threaded"],
  end_conn_bv:        ["Flanged","NPT","BSP"],
  body_material:      ["WCB (CS)","LCB (Low Temp CS)","SS304","SS316","SS316L","CF8","CF8M","Duplex SS","Hastelloy C"],
  body_material_bv:   ["Al Alloy","CS","SS304","SS316","FRP"],
  trim_material:      ["SS304","SS316","Hardened Trim","Stellite"],
  bonnet_type:        ["Open Bonnet","Closed Bonnet"],
  back_pressure_type: ["Conventional","Balanced Bellows","Pilot-Operated"],
  overpressure:       ["10%","16%","21%"],
  discharge_type:     ["Open Discharge","Closed Discharge","To Flare Line","Vent to Atmosphere"],
  design_std_psv:     ["ASME Section VIII","API 520","API 526","EN ISO 4126","EN 14123"],
  design_std_tank:    ["API 2000","ISO 28300","EN 14123"],
  certification:      ["IBR","ATEX","IECEx","PESO","CE","SIL Rated"],
  operation_type:     ["Spring-Loaded","Pilot-Operated"],
  service_phase:      ["Gas / Vapour","Liquid","Two-Phase"],
  service_fluid_psv:  ["Steam","Gas / Vapour","Hydrocarbon Vapour","Air","Chemical Vapour","LPG"],
  service_fluid_prv:  ["Water","Oil","Chemical","Hydraulic Fluid","LPG"],
  service_fluid_tank: ["Hydrocarbons","Inert Gas (N₂)","Chemical Vapour","LPG","Air"],
  connection_size:    ["25 NB","50 NB","80 NB","100 NB","150 NB","200 NB","250 NB","300 NB"],
  flame_arrestor:     ["Integrated","Separate","None"],
  set_pressure_unit:  ["barg","psig"],
  set_vacuum_unit:    ["mbar","kPa","mmWC","mmHg","inH2O"],
};

const SAFETY_ALL_FIELD_OPTS: Record<string, string[]> = {
  inlet_size:        SAFETY_COMMON_OPTS.inlet_outlet_size,
  outlet_size:       SAFETY_COMMON_OPTS.inlet_outlet_size,
  pressure_rating:   SAFETY_COMMON_OPTS.pressure_rating,
  end_connection:    [...SAFETY_COMMON_OPTS.end_connection, ...SAFETY_COMMON_OPTS.end_conn_bv],
  body_material:     [...SAFETY_COMMON_OPTS.body_material, ...SAFETY_COMMON_OPTS.body_material_bv],
  trim_material:     SAFETY_COMMON_OPTS.trim_material,
  bonnet_type:       SAFETY_COMMON_OPTS.bonnet_type,
  back_pressure_type:SAFETY_COMMON_OPTS.back_pressure_type,
  overpressure:      SAFETY_COMMON_OPTS.overpressure,
  discharge_type:    SAFETY_COMMON_OPTS.discharge_type,
  design_standard:   [...SAFETY_COMMON_OPTS.design_std_psv, ...SAFETY_COMMON_OPTS.design_std_tank],
  certification:     SAFETY_COMMON_OPTS.certification,
  operation_type:    SAFETY_COMMON_OPTS.operation_type,
  service_phase:     SAFETY_COMMON_OPTS.service_phase,
  service_fluid:     [...SAFETY_COMMON_OPTS.service_fluid_psv, ...SAFETY_COMMON_OPTS.service_fluid_prv, ...SAFETY_COMMON_OPTS.service_fluid_tank],
  connection_size:   SAFETY_COMMON_OPTS.connection_size,
  flame_arrestor:    SAFETY_COMMON_OPTS.flame_arrestor,
  api_orifice:       API_ORIFICE_OPTS,
  set_pressure_unit: SAFETY_COMMON_OPTS.set_pressure_unit,
  set_vacuum_unit:   SAFETY_COMMON_OPTS.set_vacuum_unit,
};

const SAFETY_VALVE_MAKES: string[] = [];

// ── Client-side SAP Item Code Preview (mirrors server builders) ───────────────
const _SV_END_CONN: Record<string, string> = { Flanged: 'RF', Threaded: 'THD' };
const _SV_BV_CONN:  Record<string, string> = { Flanged: 'FLG', NPT: 'NPT', BSP: 'BSP' };
const _SV_PRESS:    Record<string, string> = {
  'Class 150': 'CL150', 'Class 300': 'CL300', 'Class 600': 'CL600',
  'Class 900': 'CL900', 'Class 1500': 'CL1500',
};
const _SV_BODY: Record<string, string> = {
  'WCB (CS)': 'WCB', 'LCB (Low Temp CS)': 'LCB', 'SS304': 'SS304',
  'SS316': 'SS316', 'SS316L': 'SS316L', 'CF8': 'CF8', 'CF8M': 'CF8M',
  'Duplex SS': 'DSS', 'Hastelloy C': 'HC276',
};
const _SV_TRIM: Record<string, string> = {
  'SS304': 'SS304', 'SS316': 'SS316', 'Hardened Trim': 'HSS', 'Stellite': 'STLT',
};
const _SV_BP: Record<string, string> = {
  'Conventional': 'CONV', 'Balanced Bellows': 'BLW', 'Pilot-Operated': 'PLT',
};
const _SV_BV_BODY: Record<string, string> = {
  'Al Alloy': 'ALAY', 'CS': 'CS', 'SS304': 'SS304', 'SS316': 'SS316', 'FRP': 'FRP',
};
const _SV_FLAME: Record<string, string> = {
  'Integrated': 'INT', 'Separate': 'SEP', 'None': 'NON',
};

function _svTypeCode(vt: string): string | undefined {
  const v = vt.toLowerCase();
  if (v.includes('(psv)') || (v.includes('safety') && v.includes('valve') && !v.includes('relief'))) return 'PSV';
  if (v.includes('(prv)') || (v.includes('pressure') && v.includes('relief') && !v.includes('safety'))) return 'PRV';
  if (v.includes('(srv)') || v.includes('safety relief')) return 'SRV';
  return undefined;
}
function _svEncodePress(val: string, unit: string): string | undefined {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return undefined;
  let barg = n;
  if (unit.toLowerCase() === 'psig') barg = Math.round(n * 0.0689476 * 10) / 10;
  return parseFloat(barg.toPrecision(10)).toString().replace('.', 'P') + 'B';
}
function _svVacuumMbar(val: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case 'kpa':   return Math.round(val * 10);
    case 'mmwc':  return Math.round(val * 0.09807);
    case 'mmhg':  return Math.round(val * 1.33322);
    case 'inh2o': return Math.round(val * 2.49089);
    default:      return Math.round(val);
  }
}

/** Returns the live SAP Item Code preview for a safety valve, or null if any required segment is missing. */
export function buildSafetyValvePreviewCode(attrs: Record<string, unknown>): string | null {
  try {
    const vt = ((attrs.valve_type as string) ?? '').trim();
    if (!vt) return null;
    const vtL = vt.toLowerCase();

    if (vtL.includes('breather')) {
      const ec  = _SV_BV_CONN[(attrs.end_connection  as string)?.trim() ?? ''];
      const sm  = (attrs.connection_size as string)?.trim() ?? '';
      const szM = sm.match(/^(\d+)\s*NB$/i);
      const sz  = szM ? szM[1] : undefined;
      const bm  = _SV_BV_BODY[(attrs.body_material as string)?.trim() ?? ''];
      const fl  = _SV_FLAME[(attrs.flame_arrestor  as string)?.trim() ?? ''];
      if (!ec || !sz || !bm || !fl) return null;
      return `VLV-SV-BV-${ec}-${sz}-${bm}-${fl}`;
    }

    if (vtL.includes('vacuum')) {
      const ec  = _SV_END_CONN[(attrs.end_connection  as string)?.trim() ?? ''];
      const sm  = (attrs.connection_size as string)?.trim() ?? '';
      const szM = sm.match(/^(\d+)\s*NB$/i);
      const sz  = szM ? szM[1] : undefined;
      const pr  = _SV_PRESS[(attrs.pressure_rating   as string)?.trim() ?? ''];
      const bm  = _SV_BODY[(attrs.body_material       as string)?.trim() ?? ''];
      const tr  = _SV_TRIM[(attrs.trim_material       as string)?.trim() ?? ''];
      const vvR = (attrs.set_vacuum_value as string)?.trim() ?? '';
      const vu  = (attrs.set_vacuum_unit  as string)?.trim() || 'mbar';
      const vn  = parseFloat(vvR);
      const mb  = !isNaN(vn) && vn > 0 ? _svVacuumMbar(vn, vu) : undefined;
      const vc  = mb ? `${mb}M` : undefined;
      if (!ec || !sz || !pr || !bm || !tr || !vc) return null;
      return `VLV-SV-VRV-${ec}-${sz}-${pr}-${bm}-${tr}-${vc}`;
    }

    const tc  = _svTypeCode(vt);
    const ec  = _SV_END_CONN[(attrs.end_connection    as string)?.trim() ?? ''];
    const sm  = (attrs.inlet_size as string)?.trim() ?? '';
    const szM = sm.match(/^(\d+)\s*NB$/i);
    const sz  = szM ? szM[1] : undefined;
    const pr  = _SV_PRESS[(attrs.pressure_rating      as string)?.trim() ?? ''];
    const bm  = _SV_BODY[(attrs.body_material         as string)?.trim() ?? ''];
    const tr  = _SV_TRIM[(attrs.trim_material         as string)?.trim() ?? ''];
    const or_ = (attrs.api_orifice as string)?.trim() ?? '';
    const ori = /^[A-T]$/i.test(or_) ? or_.toUpperCase() : undefined;
    const sp  = _svEncodePress(
      (attrs.set_pressure_value as string)?.trim() ?? '',
      (attrs.set_pressure_unit  as string)?.trim() || 'barg',
    );
    const bp  = _SV_BP[(attrs.back_pressure_type as string)?.trim() ?? ''];
    if (!tc || !ec || !sz || !pr || !bm || !tr || !ori || !sp || !bp) return null;
    return `VLV-SV-${tc}-${ec}-${sz}-${pr}-${bm}-${tr}-${ori}-${sp}-${bp}`;
  } catch {
    return null;
  }
}

export function buildSafetyValveRequirement(attrs: Record<string, unknown>): string {
  const type     = (attrs.valve_type as string)?.trim() || "";
  const typeLC   = type.toLowerCase();
  const SAFETY_TYPE_ABBR_OVERRIDE: Record<string, string> = {
    "Breather Valve (Conservation Vent)": "BV",
  };
  const typeAbbr = SAFETY_TYPE_ABBR_OVERRIDE[type]
    ?? (type.match(/\(([^)]+)\)/)?.[1] || type.split(" ").map(w => w[0]).join("") || type);
  const bodyMat  = (attrs.body_material as string)?.trim() || "";
  const endConn  = (attrs.end_connection as string)?.trim() || "";
  const standard = (attrs.design_standard as string)?.trim() || "";
  const bodyStr  = bodyMat ? `${bodyMat} Body` : "";
  let sizeStr = ""; let pressStr = ""; let typeSpecific = "";
  if (typeLC.includes("breather")) {
    const connSize = (attrs.connection_size as string)?.trim() || "";
    const presMbar = (attrs.pressure_setting_mbar as string)?.trim() || "";
    const vacMbar  = (attrs.vacuum_setting_mbar as string)?.trim() || "";
    const flame    = (attrs.flame_arrestor as string)?.trim() || "";
    sizeStr = connSize;
    const p2: string[] = [];
    if (presMbar) p2.push(`P:${presMbar} mbar`);
    if (vacMbar)  p2.push(`V:${vacMbar} mbar`);
    if (flame && flame !== "None") p2.push(`${flame} Arrestor`);
    typeSpecific = p2.join(", ");
  } else if (typeLC.includes("vacuum")) {
    const connSize   = (attrs.connection_size   as string)?.trim() || "";
    const vvRaw      = (attrs.set_vacuum_value  as string)?.trim() || "";
    const vuRaw      = (attrs.set_vacuum_unit   as string)?.trim() || "mbar";
    const legacyVac  = (attrs.set_vacuum        as string)?.trim() || "";
    const setVac     = vvRaw ? `${vvRaw} ${vuRaw}` : legacyVac;
    sizeStr  = connSize;
    pressStr = setVac ? `Set Vacuum: ${setVac}` : "";
  } else {
    const inletSize   = (attrs.inlet_size as string)?.trim() || "";
    const outletSize  = (attrs.outlet_size as string)?.trim() || "";
    const spVal       = (attrs.set_pressure_value as string)?.trim() || "";
    const spUnit      = (attrs.set_pressure_unit  as string)?.trim() || "barg";
    const legacySP    = (attrs.set_pressure       as string)?.trim() || "";
    const setPressure = spVal ? `${spVal} ${spUnit}` : legacySP;
    const orifice     = (attrs.api_orifice as string)?.trim() || "";
    const opType      = (attrs.operation_type as string)?.trim() || "";
    sizeStr  = inletSize && outletSize ? `${inletSize} x ${outletSize}` : inletSize || outletSize;
    pressStr = setPressure ? `Set @ ${setPressure}` : "";
    const p2: string[] = [];
    if (opType && opType !== "Spring-Loaded") p2.push(opType);
    if (orifice) p2.push(`Orifice ${orifice}`);
    typeSpecific = p2.join(", ");
  }
  const parts: string[] = [];
  if (typeAbbr)     parts.push(typeAbbr);
  if (sizeStr)      parts.push(sizeStr);
  if (pressStr)     parts.push(pressStr);
  if (typeSpecific) parts.push(typeSpecific);
  if (bodyStr)      parts.push(bodyStr);
  if (endConn)      parts.push(endConn);
  if (standard)     parts.push(standard);
  return shortenToSapItemName(parts.join(", "));
}

function buildSafetyValveDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    valve_type: type, body_material: "WCB (CS)", end_connection: "Flanged", make: "",
    inlet_size: "", outlet_size: "", pressure_rating: "", set_pressure: "",
    set_pressure_value: "", set_pressure_unit: "barg",
    api_orifice: "", bonnet_type: "", back_pressure_type: "", overpressure: "",
    discharge_type: "", design_standard: "", certification: "", service_fluid: "",
    operating_temp: "", trim_material: "", operation_type: "", service_phase: "",
    set_vacuum: "", set_vacuum_value: "", set_vacuum_unit: "mbar",
    flow_capacity: "", reseal_pressure: "",
    connection_size: "", pressure_setting_mbar: "", vacuum_setting_mbar: "",
    flame_arrestor: "", relieving_capacity: "",
  };
  switch (type) {
    case "Pressure Safety Valve (PSV)":
      return { ...base, design_standard: "ASME Section VIII", inlet_size: "50 NB", outlet_size: "80 NB",
        pressure_rating: "Class 300", operation_type: "Spring-Loaded", bonnet_type: "Closed Bonnet",
        discharge_type: "To Flare Line", back_pressure_type: "Conventional",
        overpressure: "10%", service_fluid: "Steam" };
    case "Pressure Relief Valve (PRV)":
      return { ...base, design_standard: "ASME Section VIII", inlet_size: "50 NB", outlet_size: "80 NB",
        pressure_rating: "Class 150", bonnet_type: "Closed Bonnet",
        discharge_type: "Closed Discharge", back_pressure_type: "Conventional",
        overpressure: "10%", service_fluid: "Water" };
    case "Safety Relief Valve (SRV)":
      return { ...base, design_standard: "ASME Section VIII", inlet_size: "50 NB", outlet_size: "80 NB",
        pressure_rating: "Class 150", operation_type: "Spring-Loaded",
        service_phase: "Gas / Vapour", bonnet_type: "Open Bonnet",
        discharge_type: "Open Discharge", back_pressure_type: "Conventional", overpressure: "10%" };
    case "Vacuum Relief Valve (VRV)":
      return { ...base, design_standard: "API 2000", body_material: "WCB (CS)",
        pressure_rating: "Class 150", trim_material: "SS316",
        connection_size: "50 NB", service_fluid: "Air",
        set_vacuum_unit: "mbar" };
    case "Breather Valve (Conservation Vent)":
      return { ...base, design_standard: "API 2000", body_material: "Al Alloy",
        connection_size: "80 NB", flame_arrestor: "Integrated" };
    default: return base;
  }
}

export function SafetyValveAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(SAFETY_ALL_FIELD_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  function handleTypeChange(type: string) {
    const defaults = buildSafetyValveDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(SAFETY_ALL_FIELD_OPTS)) {
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); onChange({ ...defaults, make: "" });
  }

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      onChange({ ...attrs, [key]: "" });
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      onChange({ ...attrs, [key]: val });
    }
  }

  function set(key: string, val: unknown) { onChange({ ...attrs, [key]: val }); }

  function renderField(key: string, label: string, opts: string[], required?: boolean, wrapClass?: string) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className={`space-y-1.5 ${wrapClass ?? ""}`}>
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal}
            onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function renderText(key: string, label: string, placeholder: string, required?: boolean, wrapClass?: string) {
    return (
      <div className={`space-y-1.5 ${wrapClass ?? ""}`}>
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <Input className="h-8 text-sm" placeholder={placeholder}
          value={(attrs[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} />
      </div>
    );
  }

  function sec(label: string) {
    return (
      <div className="col-span-3 md:col-span-5 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  const makeOpts = getMakesList("safety_valve", SAFETY_VALVE_MAKES);

  const valveType     = (attrs.valve_type as string) ?? "";
  const isPSV         = valveType === "Pressure Safety Valve (PSV)";
  const isPRV         = valveType === "Pressure Relief Valve (PRV)";
  const isSRV         = valveType === "Safety Relief Valve (SRV)";
  const isVRV         = valveType === "Vacuum Relief Valve (VRV)";
  const isBV          = valveType === "Breather Valve (Conservation Vent)";
  const hasType       = isPSV || isPRV || isSRV || isVRV || isBV;
  const isSpringBased = isPSV || isPRV || isSRV;


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

      {/* 1 — Valve Type */}
      <SectionCard title="Valve Type" color="bg-sky-50/60 border-sky-200">
        <div className="col-span-3 md:col-span-5 space-y-1.5">
          <Label className="text-xs">Safety Valve Type <span className="text-red-500">*</span></Label>
          <SearchableSelect
            value={SAFETY_VALVE_TYPES.includes(valveType) ? valveType : ""}
            options={SAFETY_VALVE_TYPES} placeholder="Select valve type first…"
            onSelect={(v) => handleTypeChange(v)}
          />
        </div>
        {!hasType && (
          <div className="col-span-3 md:col-span-5 flex items-center justify-center py-3 text-sm text-muted-foreground">
            Select a valve type above to configure specifications
          </div>
        )}
      </SectionCard>

      {/* 2 — Size & Pressure Rating (spring-based) */}
      {isSpringBased && (
        <SectionCard title="Size & Pressure Rating" color="bg-violet-50/60 border-violet-200">
          {renderField("inlet_size",  "Inlet Size (NB)",  SAFETY_COMMON_OPTS.inlet_outlet_size, true)}
          {renderField("outlet_size", "Outlet Size (NB)", SAFETY_COMMON_OPTS.inlet_outlet_size, true)}
          <div className="col-span-3 md:col-span-5">
            {renderField("pressure_rating","Pressure Rating",SAFETY_COMMON_OPTS.pressure_rating, true)}
          </div>
        </SectionCard>
      )}

      {/* 3 — Pressure Settings (spring-based) */}
      {isSpringBased && (
        <SectionCard title="Pressure Settings" color="bg-amber-50/60 border-amber-300">
          {renderText( "set_pressure_value", "Set Pressure Value", "e.g. 10.5",   true)}
          {renderField("set_pressure_unit",  "Pressure Unit",      SAFETY_COMMON_OPTS.set_pressure_unit, true)}
          {renderField("overpressure",       "Overpressure (%)",   SAFETY_COMMON_OPTS.overpressure)}
          {renderText( "relieving_capacity", "Relieving Capacity", "e.g. 500 kg/h")}
        </SectionCard>
      )}

      {/* 4 — Type-specific configuration */}
      {isPSV && (
        <SectionCard title="PSV Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("operation_type",    "Operation Type",    SAFETY_COMMON_OPTS.operation_type,    true)}
          {renderField("api_orifice",       "API Orifice",       API_ORIFICE_OPTS,                     true)}
          {renderField("bonnet_type",       "Bonnet Type",       SAFETY_COMMON_OPTS.bonnet_type,       true)}
          {renderField("discharge_type",    "Discharge Type",    SAFETY_COMMON_OPTS.discharge_type,    true, "col-span-2")}
          {renderField("back_pressure_type","Back Pressure Type",SAFETY_COMMON_OPTS.back_pressure_type, undefined, "col-span-2")}
          <div />
        </SectionCard>
      )}

      {isPRV && (
        <SectionCard title="PRV Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("discharge_type",    "Discharge Type",    SAFETY_COMMON_OPTS.discharge_type,    true, "col-span-2")}
          {renderField("bonnet_type",       "Bonnet Type",       SAFETY_COMMON_OPTS.bonnet_type)}
          {renderField("api_orifice",       "API Orifice",       API_ORIFICE_OPTS,                      true)}
          {renderField("back_pressure_type","Back Pressure Type",SAFETY_COMMON_OPTS.back_pressure_type, true, "col-span-2")}
        </SectionCard>
      )}

      {isSRV && (
        <SectionCard title="SRV Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("operation_type",    "Operation Type",    SAFETY_COMMON_OPTS.operation_type,    true)}
          {renderField("api_orifice",       "API Orifice",       API_ORIFICE_OPTS,                     true)}
          {renderField("service_phase",     "Service Phase",     SAFETY_COMMON_OPTS.service_phase,     true)}
          {renderField("bonnet_type",       "Bonnet Type",       SAFETY_COMMON_OPTS.bonnet_type,       true)}
          {renderField("discharge_type",    "Discharge Type",    SAFETY_COMMON_OPTS.discharge_type,    true, "col-span-2")}
          {renderField("back_pressure_type","Back Pressure Type",SAFETY_COMMON_OPTS.back_pressure_type, undefined, "col-span-2")}
        </SectionCard>
      )}

      {isVRV && (
        <SectionCard title="VRV Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("connection_size", "Inlet Size (NB)",        SAFETY_COMMON_OPTS.connection_size,  true)}
          {renderField("pressure_rating", "Pressure Rating",        SAFETY_COMMON_OPTS.pressure_rating,  true)}
          {renderField("end_connection",  "End Connection",         SAFETY_COMMON_OPTS.end_connection,   true)}
          {renderField("body_material",   "Body Material",          SAFETY_COMMON_OPTS.body_material,    true)}
          {renderField("trim_material",   "Trim Material",          SAFETY_COMMON_OPTS.trim_material,    true)}
          {renderText( "set_vacuum_value","Vacuum Set Value",       "e.g. 250",                          true)}
          {renderField("set_vacuum_unit", "Vacuum Unit",            SAFETY_COMMON_OPTS.set_vacuum_unit,  true)}
          {renderText( "flow_capacity",   "Flow Capacity (m³/h)",   "e.g. 200 m³/h")}
          {renderText( "reseal_pressure", "Re-seal Pressure (mbar)","e.g. 5 mbar")}
          {renderField("service_fluid",   "Service Fluid",          SAFETY_COMMON_OPTS.service_fluid_tank)}
          {renderText( "operating_temp",  "Operating Temperature",  "e.g. 65°C")}
          {renderField("certification",   "Certification",          SAFETY_COMMON_OPTS.certification)}
          {renderField("design_standard", "Design Standard",        SAFETY_COMMON_OPTS.design_std_tank,  true, "col-span-2")}
          <div />
        </SectionCard>
      )}

      {isBV && (
        <SectionCard title="Breather Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("connection_size",       "Connection Size (NB)",    SAFETY_COMMON_OPTS.connection_size,  true, "col-span-2")}
          {renderText( "pressure_setting_mbar", "Pressure Setting (mbar)", "e.g. 14 mbar",                      true)}
          {renderText( "vacuum_setting_mbar",   "Vacuum Setting (mbar)",   "e.g. 3.5 mbar",                     true)}
          {renderField("flame_arrestor",        "Flame Arrestor",          SAFETY_COMMON_OPTS.flame_arrestor,   true)}
          {renderText( "flow_capacity",         "Flow Capacity (m³/h)",    "e.g. 500 m³/h")}
          {renderField("service_fluid",         "Service Fluid",           SAFETY_COMMON_OPTS.service_fluid_tank)}
          {renderText( "operating_temp",        "Operating Temperature",   "e.g. 60°C")}
          {renderField("body_material",         "Body Material",           SAFETY_COMMON_OPTS.body_material_bv)}
          {renderField("end_connection",        "End Connection",          SAFETY_COMMON_OPTS.end_conn_bv)}
          {renderField("certification",         "Certification",           SAFETY_COMMON_OPTS.certification)}
          {renderField("design_standard",       "Design Standard",         SAFETY_COMMON_OPTS.design_std_tank, true, "col-span-2")}
          <div />
        </SectionCard>
      )}

      {/* 5 — Service Conditions (spring-based, optional) */}
      {isSpringBased && (
        <SectionCard title="Service Conditions (Optional)" color="bg-orange-50/60 border-orange-200">
          {renderField("service_fluid",  "Service Fluid",
            isPRV ? SAFETY_COMMON_OPTS.service_fluid_prv : SAFETY_COMMON_OPTS.service_fluid_psv)}
          {renderText( "operating_temp", "Operating Temperature", "e.g. 150°C")}
        </SectionCard>
      )}

      {/* 6 — Material & Connection (spring-based) */}
      {isSpringBased && (
        <SectionCard title="Material & Connection" color="bg-emerald-50/60 border-emerald-200">
          {renderField("body_material",  "Body Material",  SAFETY_COMMON_OPTS.body_material,  true)}
          {renderField("trim_material",  "Trim Material",  SAFETY_COMMON_OPTS.trim_material,  true)}
          {renderField("end_connection", "End Connection", SAFETY_COMMON_OPTS.end_connection, true)}
          <div />
        </SectionCard>
      )}

      {/* 7 — Standard & Certification (spring-based) */}
      {isSpringBased && (
        <SectionCard title="Standard & Certification" color="bg-teal-50/60 border-teal-200">
          {renderField("design_standard","Design Standard", SAFETY_COMMON_OPTS.design_std_psv, true, "col-span-2")}
          {renderField("certification",  "Certification",  SAFETY_COMMON_OPTS.certification)}
        </SectionCard>
      )}

      {/* Quantity */}
      {qty !== undefined && (
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="1" step="1"
            value={qty}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ON/OFF VALVE
// ─────────────────────────────────────────────────────────────────────────────
const OO_VALVE_TYPES = [
  "Ball Valve","Gate Valve","Globe Valve","Butterfly Valve","Plug Valve","Diaphragm Valve",
];

const OO_COMMON_OPTS = {
  size_nb:             ["15 NB","25 NB","40 NB","50 NB","65 NB","80 NB","100 NB","150 NB","200 NB","250 NB","300 NB","350 NB","400 NB","450 NB","500 NB","600 NB"],
  pressure_rating_std: ["Class 150","Class 300","Class 600","Class 900","Class 1500"],
  pressure_rating_pn:  ["PN6","PN10","PN16","PN25","PN40","PN64","PN100","PN160"],
  actuation_type:      ["Manual Lever","Manual Handwheel","Manual Gear","Pneumatic Actuator","Electric Actuator","Hydraulic Actuator"],
  fail_action:         ["Fail Open (FO)","Fail Close (FC)","Fail Last (FL)"],
  end_connection:      ["Flanged","Threaded","Butt Weld","Socket Weld","Wafer","Lug Type","Grooved","Clamp End (Tri-Clamp)"],
  body_material:       ["WCB (CS)","LCB (Low Temp CS)","SS304","SS316","SS316L","CF8","CF8M","Duplex SS","CI (Cast Iron)","Ductile Iron","Hastelloy C"],
  service_type:        ["Isolation","On-Off Control","Emergency Shutdown (ESD)","Bypass","General"],
  area_class:          ["Safe Area","Zone 1","Zone 2"],
  certification:       ["ATEX","IECEx","PESO","SIL Rated","Fire Safe (API 607)"],
  explosion_protection:["Ex d (Flameproof)","Ex e (Increased Safety)","Ex ia (Intrinsic Safety)","Ex nA (Non-Sparking)"],
  gas_group:           ["IIA","IIB","IIC"],
  temperature_class:   ["T1","T2","T3","T4","T5","T6"],
  yes_no:              ["Yes","No"],
  bore_type:           ["Full Bore","Reduced Bore"],
  body_style:          ["Floating Ball","Trunnion Mounted"],
  seat_material_ball:  ["PTFE","PEEK","Metal Seat (SS316)","Graphite","Devlon"],
  port_config:         ["2-Way","3-Way (L-Port)","3-Way (T-Port)","DBB (Double Block & Bleed)"],
  stem_seal:           ["PTFE","Graphite","RPTFE"],
  stem_type:           ["OS&Y (Rising Stem)","Non-Rising Stem"],
  wedge_type:          ["Solid Wedge","Flexible Wedge","Split Wedge"],
  bonnet_type:         ["Bolted Bonnet","Pressure Seal Bonnet"],
  gate_material:       ["WCB (CS)","SS316","Hardened Steel","Stellite Faced"],
  gate_stem_seal:      ["Graphite","PTFE"],
  port_type:           ["Single Port","Double Port"],
  plug_trim_mat:       ["SS316","SS304","Stellite Faced","Hardened"],
  seat_mat_globe:      ["SS316","SS304","Stellite Faced","Hardened","PTFE Insert"],
  bonnet_type_globe:   ["Standard","Bellows Sealed","Extended Bonnet"],
  flow_direction:      ["Flow to Open","Flow to Close"],
  packing:             ["PTFE","Graphite"],
  valve_design:        ["Concentric (Centric)","Double Eccentric (High Performance)","Triple Eccentric"],
  disc_material:       ["CI","CS","SS304","SS316","Ni-Al Bronze","Hastelloy C"],
  seat_liner:          ["EPDM","NBR","PTFE","Viton (FKM)","Silicone"],
  stem_material:       ["SS304","SS316","Duplex SS"],
  face_to_face:        ["EN 558-1","ASME B16.10","ISO 5752"],
  plug_type:           ["Lubricated","Non-Lubricated (Sleeved)","Eccentric"],
  plug_port_config:    ["2-Way","3-Way"],
  sleeve_material:     ["PTFE","RPTFE","Neoprene","Kel-F"],
  diaphragm_material:  ["EPDM","Natural Rubber","PTFE","Butyl Rubber","Neoprene"],
  body_design:         ["Weir Type","Straight-Through"],
  body_lining:         ["Unlined","PTFE Lined","Rubber Lined","Glass Lined"],
  valve_std_ball:      ["API 6D","API 608","ISO 17292","EN 1983","ASME B16.34","ISO 5208"],
  valve_std_gate:      ["API 600","ASME B16.34","EN 13709","ISO 5208"],
  valve_std_globe:     ["API 602","ASME B16.34","EN 13709","ISO 5208"],
  valve_std_butterfly: ["API 609","EN 593","ASME B16.34","ISO 5208"],
  valve_std_plug:      ["MSS SP-78","MSS SP-99","ASME B16.34","ISO 5208"],
  valve_std_diaphragm: ["EN 13397","ISO 16136","ASME B16.34","ISO 5208"],
};

const OO_ALL_VALVE_STDS = [
  ...OO_COMMON_OPTS.valve_std_ball, ...OO_COMMON_OPTS.valve_std_gate,
  ...OO_COMMON_OPTS.valve_std_globe, ...OO_COMMON_OPTS.valve_std_butterfly,
  ...OO_COMMON_OPTS.valve_std_plug, ...OO_COMMON_OPTS.valve_std_diaphragm,
].filter((v, i, a) => a.indexOf(v) === i);

const OO_ALL_FIELD_OPTS: Record<string, string[]> = {
  size_nb:             OO_COMMON_OPTS.size_nb,
  pressure_rating:     [...OO_COMMON_OPTS.pressure_rating_std, ...OO_COMMON_OPTS.pressure_rating_pn],
  actuation_type:      OO_COMMON_OPTS.actuation_type,
  fail_action:         OO_COMMON_OPTS.fail_action,
  end_connection:      OO_COMMON_OPTS.end_connection,
  body_material:       OO_COMMON_OPTS.body_material,
  service_type:        OO_COMMON_OPTS.service_type,
  area_classification: OO_COMMON_OPTS.area_class,
  certification:       OO_COMMON_OPTS.certification,
  explosion_protection:OO_COMMON_OPTS.explosion_protection,
  gas_group:           OO_COMMON_OPTS.gas_group,
  temperature_class:   OO_COMMON_OPTS.temperature_class,
  valve_standard:      OO_ALL_VALVE_STDS,
  bore_type:           OO_COMMON_OPTS.bore_type,
  body_style:          OO_COMMON_OPTS.body_style,
  seat_material:       OO_COMMON_OPTS.seat_material_ball,
  port_configuration:  OO_COMMON_OPTS.port_config,
  stem_seal:           OO_COMMON_OPTS.stem_seal,
  fire_safe:           OO_COMMON_OPTS.yes_no,
  anti_static_device:  OO_COMMON_OPTS.yes_no,
  stem_type:           OO_COMMON_OPTS.stem_type,
  wedge_type:          OO_COMMON_OPTS.wedge_type,
  bonnet_type:         OO_COMMON_OPTS.bonnet_type,
  gate_material:       OO_COMMON_OPTS.gate_material,
  gate_stem_seal:      OO_COMMON_OPTS.gate_stem_seal,
  port_type:           OO_COMMON_OPTS.port_type,
  plug_trim_material:  OO_COMMON_OPTS.plug_trim_mat,
  seat_material_globe: OO_COMMON_OPTS.seat_mat_globe,
  bonnet_type_globe:   OO_COMMON_OPTS.bonnet_type_globe,
  flow_direction:      OO_COMMON_OPTS.flow_direction,
  packing:             OO_COMMON_OPTS.packing,
  valve_design:        OO_COMMON_OPTS.valve_design,
  disc_material:       OO_COMMON_OPTS.disc_material,
  seat_liner:          OO_COMMON_OPTS.seat_liner,
  stem_material:       OO_COMMON_OPTS.stem_material,
  face_to_face_std:    OO_COMMON_OPTS.face_to_face,
  plug_type:           OO_COMMON_OPTS.plug_type,
  plug_port_config:    OO_COMMON_OPTS.plug_port_config,
  sleeve_material:     OO_COMMON_OPTS.sleeve_material,
  diaphragm_material:  OO_COMMON_OPTS.diaphragm_material,
  body_design:         OO_COMMON_OPTS.body_design,
  body_lining:         OO_COMMON_OPTS.body_lining,
};

const OO_VALVE_MAKES: string[] = [];

const OO_ACTUATED_TYPES = ["Pneumatic Actuator","Electric Actuator","Hydraulic Actuator"];

export function buildOnOffValveRequirement(attrs: Record<string, unknown>): string {
  const type    = (attrs.valve_type as string)?.trim() || "";
  const typeLC  = type.toLowerCase();
  const sizeNb  = (attrs.size_nb as string)?.trim() || "";
  const pr      = (attrs.pressure_rating as string)?.trim() || "";
  const act     = (attrs.actuation_type as string)?.trim() || "";
  const fail    = (attrs.fail_action as string)?.trim() || "";
  const bodyMat = (attrs.body_material as string)?.trim() || "";
  const endConn = (attrs.end_connection as string)?.trim() || "";
  const bodyStr = bodyMat ? `${bodyMat} Body` : "";
  let typeSpecific = "";
  if (typeLC.includes("ball")) {
    const bore = (attrs.bore_type as string)?.trim() || "";
    const style = (attrs.body_style as string)?.trim() || "";
    const seat  = (attrs.seat_material as string)?.trim() || "";
    const p2: string[] = [];
    if (bore)  p2.push(bore);
    if (style) p2.push(style);
    if (seat)  p2.push(`${seat} Seat`);
    typeSpecific = p2.join(", ");
  } else if (typeLC.includes("gate")) {
    const stemT = (attrs.stem_type as string)?.trim() || "";
    const wedge = (attrs.wedge_type as string)?.trim() || "";
    const p2: string[] = [];
    if (stemT) p2.push(stemT);
    if (wedge) p2.push(wedge);
    typeSpecific = p2.join(", ");
  } else if (typeLC.includes("globe")) {
    const portT = (attrs.port_type as string)?.trim() || "";
    const trim  = (attrs.plug_trim_material as string)?.trim() || "";
    const p2: string[] = [];
    if (portT) p2.push(portT);
    if (trim)  p2.push(`${trim} Trim`);
    typeSpecific = p2.join(", ");
  } else if (typeLC.includes("butterfly")) {
    const design = (attrs.valve_design as string)?.trim() || "";
    const disc   = (attrs.disc_material as string)?.trim() || "";
    const liner  = (attrs.seat_liner as string)?.trim() || "";
    const p2: string[] = [];
    if (design) p2.push(design.split(" ")[0]);
    if (disc)   p2.push(`${disc} Disc`);
    if (liner)  p2.push(`${liner} Liner`);
    typeSpecific = p2.join(", ");
  } else if (typeLC.includes("plug")) {
    const plugT = (attrs.plug_type as string)?.trim() || "";
    const portC = (attrs.plug_port_config as string)?.trim() || "";
    const p2: string[] = [];
    if (plugT) p2.push(plugT);
    if (portC) p2.push(portC);
    typeSpecific = p2.join(", ");
  } else if (typeLC.includes("diaphragm")) {
    const diagMat = (attrs.diaphragm_material as string)?.trim() || "";
    const design  = (attrs.body_design as string)?.trim() || "";
    const p2: string[] = [];
    if (diagMat) p2.push(`${diagMat} Diaphragm`);
    if (design)  p2.push(design);
    typeSpecific = p2.join(", ");
  }
  const areaClass = (attrs.area_classification as string)?.trim() || "";
  const certif    = (attrs.certification       as string)?.trim() || "";
  const isActuated = OO_ACTUATED_TYPES.includes(act);
  const parts: string[] = [];
  if (type)         parts.push(type);
  if (sizeNb)       parts.push(sizeNb);
  if (pr)           parts.push(pr);
  if (typeSpecific) parts.push(typeSpecific);
  if (act)          parts.push(act);
  if (isActuated && fail) parts.push(fail);
  if (bodyStr)      parts.push(bodyStr);
  if (endConn)      parts.push(endConn);
  if (areaClass && areaClass !== "Safe Area") parts.push(areaClass);
  if (certif && areaClass && areaClass !== "Safe Area") parts.push(certif);
  return shortenToSapItemName(parts.join(", "));
}

function buildOnOffValveDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    valve_type: type, make: "",
    size_nb: "", pressure_rating: "", actuation_type: "", fail_action: "",
    end_connection: "Flanged", body_material: "WCB (CS)", service_type: "",
    valve_standard: "",
    area_classification: "", certification: "",
    explosion_protection: "", gas_group: "", temperature_class: "",
    bore_type: "", body_style: "", seat_material: "", port_configuration: "",
    stem_seal: "", fire_safe: "", anti_static_device: "",
    stem_type: "", wedge_type: "", bonnet_type: "", gate_material: "", gate_stem_seal: "",
    port_type: "", plug_trim_material: "", seat_material_globe: "", bonnet_type_globe: "",
    flow_direction: "", packing: "",
    valve_design: "", disc_material: "", seat_liner: "", stem_material: "", face_to_face_std: "",
    plug_type: "", plug_port_config: "", sleeve_material: "",
    diaphragm_material: "", body_design: "", body_lining: "",
  };
  switch (type) {
    case "Ball Valve":
      return { ...base, valve_standard: "API 6D", pressure_rating: "Class 150", end_connection: "Flanged",
        body_material: "WCB (CS)", actuation_type: "Pneumatic Actuator",
        fail_action: "Fail Close (FC)", bore_type: "Full Bore",
        body_style: "Floating Ball", seat_material: "PTFE",
        port_configuration: "2-Way", fire_safe: "No", anti_static_device: "No" };
    case "Gate Valve":
      return { ...base, valve_standard: "API 600", pressure_rating: "Class 150", end_connection: "Flanged",
        body_material: "WCB (CS)", actuation_type: "Manual Gear",
        stem_type: "OS&Y (Rising Stem)", wedge_type: "Solid Wedge",
        bonnet_type: "Bolted Bonnet" };
    case "Globe Valve":
      return { ...base, valve_standard: "API 602", pressure_rating: "Class 150", end_connection: "Flanged",
        body_material: "WCB (CS)", actuation_type: "Manual Handwheel",
        port_type: "Single Port", plug_trim_material: "SS316",
        seat_material_globe: "SS316", bonnet_type_globe: "Standard" };
    case "Butterfly Valve":
      return { ...base, valve_standard: "API 609", pressure_rating: "PN16", end_connection: "Wafer",
        body_material: "CI (Cast Iron)", actuation_type: "Pneumatic Actuator",
        fail_action: "Fail Close (FC)", valve_design: "Concentric (Centric)",
        disc_material: "SS316", seat_liner: "EPDM" };
    case "Plug Valve":
      return { ...base, valve_standard: "MSS SP-78", pressure_rating: "Class 150", end_connection: "Flanged",
        body_material: "WCB (CS)", actuation_type: "Manual Lever",
        plug_type: "Non-Lubricated (Sleeved)", plug_port_config: "2-Way",
        sleeve_material: "PTFE" };
    case "Diaphragm Valve":
      return { ...base, valve_standard: "EN 13397", pressure_rating: "PN10", end_connection: "Flanged",
        body_material: "WCB (CS)", actuation_type: "Manual Handwheel",
        diaphragm_material: "EPDM", body_design: "Weir Type", body_lining: "Unlined" };
    default: return base;
  }
}

export function OnOffValveAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(OO_ALL_FIELD_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  function handleTypeChange(type: string) {
    const defaults = buildOnOffValveDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(OO_ALL_FIELD_OPTS)) {
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); onChange({ ...defaults, make: "" });
  }

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      onChange({ ...attrs, [key]: "" });
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      onChange({ ...attrs, [key]: val });
    }
  }

  function set(key: string, val: unknown) { onChange({ ...attrs, [key]: val }); }

  function renderField(key: string, label: string, opts: string[], required?: boolean, wrapClass?: string) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className={`space-y-1.5 ${wrapClass ?? ""}`}>
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal}
            onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function sec(label: string) {
    return (
      <div className="col-span-3 md:col-span-5 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  const makeOpts = getMakesList("onoff_valve", OO_VALVE_MAKES);

  const valveType   = (attrs.valve_type as string) ?? "";
  const isBall      = valveType === "Ball Valve";
  const isGate      = valveType === "Gate Valve";
  const isGlobe     = valveType === "Globe Valve";
  const isBfly      = valveType === "Butterfly Valve";
  const isPlug      = valveType === "Plug Valve";
  const isDiaphragm = valveType === "Diaphragm Valve";
  const hasType     = isBall || isGate || isGlobe || isBfly || isPlug || isDiaphragm;

  const actuationType = (attrs.actuation_type as string) ?? "";
  const isActuated    = OO_ACTUATED_TYPES.includes(actuationType);
  const plugType      = (attrs.plug_type as string) ?? "";
  const isSleeved     = plugType === "Non-Lubricated (Sleeved)";
  const isLubricated  = plugType === "Lubricated";
  const areaClass     = (attrs.area_classification as string) ?? "";
  const isHazardous   = areaClass === "Zone 1" || areaClass === "Zone 2";

  const valveStdOpts = isBall ? OO_COMMON_OPTS.valve_std_ball
    : isGate      ? OO_COMMON_OPTS.valve_std_gate
    : isGlobe     ? OO_COMMON_OPTS.valve_std_globe
    : isBfly      ? OO_COMMON_OPTS.valve_std_butterfly
    : isPlug      ? OO_COMMON_OPTS.valve_std_plug
    : isDiaphragm ? OO_COMMON_OPTS.valve_std_diaphragm
    : [];


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

      {/* 1 — Valve Type */}
      <SectionCard title="Valve Type" color="bg-sky-50/60 border-sky-200">
        <div className="col-span-3 md:col-span-5 space-y-1.5">
          <Label className="text-xs">Valve Type <span className="text-red-500">*</span></Label>
          <SearchableSelect
            value={OO_VALVE_TYPES.includes(valveType) ? valveType : ""}
            options={OO_VALVE_TYPES} placeholder="Select valve type first…"
            onSelect={(v) => handleTypeChange(v)}
          />
        </div>
        {!hasType && (
          <div className="col-span-3 md:col-span-5 flex items-center justify-center py-3 text-sm text-muted-foreground">
            Select a valve type above to configure specifications
          </div>
        )}
      </SectionCard>

      {/* 2 — Size, Rating & Design Standard */}
      {hasType && (
        <SectionCard title="Size, Pressure Rating & Design Standard" color="bg-violet-50/60 border-violet-200">
          {renderField("size_nb",         "Size (NB)",       OO_COMMON_OPTS.size_nb, true)}
          {renderField("pressure_rating", "Pressure Rating",
            isBfly || isDiaphragm ? OO_COMMON_OPTS.pressure_rating_pn : OO_COMMON_OPTS.pressure_rating_std, true)}
          {renderField("valve_standard",  "Valve Standard",  valveStdOpts, true)}
          <div />
        </SectionCard>
      )}

      {/* 3 — Type-specific configuration */}
      {isBall && (
        <SectionCard title="Ball Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("bore_type",          "Bore Type",           OO_COMMON_OPTS.bore_type,         true)}
          {renderField("body_style",         "Body Style",          OO_COMMON_OPTS.body_style,         true)}
          {renderField("seat_material",      "Seat Material",       OO_COMMON_OPTS.seat_material_ball, true)}
          {renderField("port_configuration", "Port Configuration",  OO_COMMON_OPTS.port_config)}
          {renderField("fire_safe",          "Fire Safe",           OO_COMMON_OPTS.yes_no)}
          {renderField("anti_static_device", "Anti-Static Device",  OO_COMMON_OPTS.yes_no)}
          {renderField("stem_seal",          "Stem Seal / Packing", OO_COMMON_OPTS.stem_seal)}
          <div />
        </SectionCard>
      )}

      {isGate && (
        <SectionCard title="Gate Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("stem_type",     "Stem Type",           OO_COMMON_OPTS.stem_type,     true)}
          {renderField("wedge_type",    "Wedge Type",          OO_COMMON_OPTS.wedge_type,    true)}
          {renderField("bonnet_type",   "Bonnet Type",         OO_COMMON_OPTS.bonnet_type)}
          {renderField("gate_material", "Gate/Wedge Material", OO_COMMON_OPTS.gate_material)}
          {renderField("gate_stem_seal","Stem Seal / Packing", OO_COMMON_OPTS.gate_stem_seal)}
          <div />
        </SectionCard>
      )}

      {isGlobe && (
        <SectionCard title="Globe Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("port_type",          "Port Type",            OO_COMMON_OPTS.port_type,         true)}
          {renderField("plug_trim_material", "Plug / Trim Material", OO_COMMON_OPTS.plug_trim_mat,     true)}
          {renderField("seat_material_globe","Seat Material",        OO_COMMON_OPTS.seat_mat_globe,    true)}
          {renderField("bonnet_type_globe",  "Bonnet Type",          OO_COMMON_OPTS.bonnet_type_globe)}
          {renderField("flow_direction",     "Flow Direction",       OO_COMMON_OPTS.flow_direction)}
          {renderField("packing",            "Stem Packing",         OO_COMMON_OPTS.packing)}
        </SectionCard>
      )}

      {isBfly && (
        <SectionCard title="Butterfly Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("valve_design",    "Valve Design",      OO_COMMON_OPTS.valve_design,  true)}
          {renderField("disc_material",   "Disc Material",     OO_COMMON_OPTS.disc_material, true)}
          {renderField("seat_liner",      "Seat Liner",        OO_COMMON_OPTS.seat_liner,    true)}
          {renderField("stem_material",   "Stem Material",     OO_COMMON_OPTS.stem_material)}
          {renderField("face_to_face_std","Face-to-Face Std",  OO_COMMON_OPTS.face_to_face)}
          <div />
        </SectionCard>
      )}

      {isPlug && (
        <SectionCard title="Plug Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("plug_type",       "Plug Type",          OO_COMMON_OPTS.plug_type,        true)}
          {renderField("plug_port_config","Port Configuration", OO_COMMON_OPTS.plug_port_config, true)}
          {isSleeved    ? renderField("sleeve_material",     "Sleeve Material",  OO_COMMON_OPTS.sleeve_material) : <div />}
          {isLubricated ? renderField("anti_static_device", "Injection Fitting",OO_COMMON_OPTS.yes_no) : <div />}
        </SectionCard>
      )}

      {isDiaphragm && (
        <SectionCard title="Diaphragm Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("diaphragm_material","Diaphragm Material",OO_COMMON_OPTS.diaphragm_material, true)}
          {renderField("body_design",       "Body Design",       OO_COMMON_OPTS.body_design,        true)}
          {renderField("body_lining",       "Body Lining",       OO_COMMON_OPTS.body_lining)}
          <div />
        </SectionCard>
      )}

      {/* 4 — Actuation & Connection */}
      {hasType && (
        <SectionCard title="Actuation & Connection" color="bg-emerald-50/60 border-emerald-200">
          {renderField("actuation_type","Actuation Type", OO_COMMON_OPTS.actuation_type, true)}
          {isActuated ? renderField("fail_action","Fail Action",OO_COMMON_OPTS.fail_action, true) : <div />}
          {renderField("end_connection","End Connection", OO_COMMON_OPTS.end_connection,  true)}
          {renderField("body_material", "Body Material",  OO_COMMON_OPTS.body_material,   true)}
        </SectionCard>
      )}

      {/* 5 — Service (Optional) */}
      {hasType && (
        <SectionCard title="Service (Optional)" color="bg-orange-50/60 border-orange-200">
          {renderField("service_type","Service Type",OO_COMMON_OPTS.service_type)}
          <div />
        </SectionCard>
      )}

      {/* 6 — Hazardous Area (Optional) */}
      {hasType && (
        <SectionCard title="Hazardous Area (Optional)" color="bg-rose-50/60 border-rose-200">
          {renderField("area_classification","Area Classification",OO_COMMON_OPTS.area_class, undefined, "col-span-2")}
          {renderField("certification",      "Certification",      OO_COMMON_OPTS.certification)}
          {isHazardous && renderField("explosion_protection","Explosion Protection",OO_COMMON_OPTS.explosion_protection, true, "col-span-2")}
          {isHazardous && renderField("gas_group",           "Gas Group",           OO_COMMON_OPTS.gas_group,           true)}
          {isHazardous && renderField("temperature_class",   "Temperature Class",   OO_COMMON_OPTS.temperature_class,   true)}
          {isHazardous && <div />}
        </SectionCard>
      )}

      {/* Quantity */}
      {qty !== undefined && (
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="1" step="1"
            value={qty}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ISOLATION VALVE
// ─────────────────────────────────────────────────────────────────────────────
const ISOLATION_VALVE_TYPES = [
  "Ball Valve", "Gate Valve", "Globe Valve", "Butterfly Valve",
  "Plug Valve", "Knife Gate Valve", "Diaphragm Valve",
];

const ISOLATION_COMMON_OPTS = {
  size_nb:          ["15 NB","20 NB","25 NB","32 NB","40 NB","50 NB","65 NB","80 NB",
                     "100 NB","125 NB","150 NB","200 NB","250 NB","300 NB","350 NB","400 NB"],
  pressure_rating:  ["Class 150","Class 300","Class 600","Class 900","Class 1500","Class 2500",
                     "PN6","PN10","PN16","PN25","PN40","PN64","PN100","PN160"],
  end_connection:   ["Flanged","Threaded (BSP)","Threaded (NPT)","Socket Weld","Butt Weld",
                     "Grooved","Clamp End (Tri-Clamp)"],
  end_conn_bfly:    ["Wafer","Lug Type","Flanged","Grooved"],
  end_conn_knife:   ["Wafer","Flanged"],
  body_material:    ["CI","DI","CS (WCB)","LCB","SS304","SS316","SS316L","CF8","CF8M",
                     "Duplex SS","Hastelloy C","Bronze","Monel","Titanium"],
  area_classification: ["Safe Area","Zone 1","Zone 2"],
};

const ISOLATION_BALL_OPTS = {
  ball_design:    ["Floating Ball","Trunnion Mounted"],
  bore_type:      ["Full Bore","Reduced Bore"],
  seat_material:  ["PTFE","PEEK","Metal (SS316)","Nylon"],
  ball_material:  ["SS304","SS316","CS+ENP","Duplex SS"],
  stem_packing:   ["PTFE","Graphite"],
  locking_device: ["Yes","No"],
};
const ISOLATION_GATE_OPTS = {
  wedge_type:    ["Solid Wedge","Flexible Wedge","Split Wedge"],
  stem_type:     ["Rising Stem (OS&Y)","Non-Rising Stem"],
  trim_material: ["SS304","SS316","13Cr","Hard Facing (Stellite)"],
};
const ISOLATION_GLOBE_OPTS = {
  port_type:     ["Single Port","Double Port"],
  disc_type:     ["Plug Disc","Needle Disc","Globe Disc"],
  trim_material: ["SS304","SS316","Hard Facing (Stellite)","Alloy Steel"],
  bonnet_type:   ["Bolted Bonnet","Pressure Seal Bonnet","Welded Bonnet"],
};
const ISOLATION_BUTTERFLY_OPTS = {
  disc_material: ["CI","CS","SS304","SS316","Duplex SS"],
  seat_material: ["EPDM","NBR","PTFE","Metal (SS316)"],
  disc_mounting: ["Concentric","Single Offset","Double Offset","Triple Offset"],
  lining_type:   ["Lined","Unlined"],
};
const ISOLATION_PLUG_OPTS = {
  port_pattern:    ["Single Port","3-Way Multi-Port","4-Way Multi-Port"],
  lubrication:     ["Non-Lubricated","Lubricated"],
  plug_material:   ["CS","SS304","SS316"],
  sleeve_material: ["PTFE","Nylon","Metal"],
};
const ISOLATION_KNIFE_OPTS = {
  service_type:   ["Standard","Slurry Service"],
  gate_material:  ["SS304","SS316","Hardened SS"],
  packing_type:   ["PTFE Stuffing Box","O-Ring"],
  seat_type:      ["Metal Seat","Soft Seat (EPDM)","Scraper Type"],
  flow_direction: ["Bidirectional","Unidirectional"],
};
const ISOLATION_DIAPHRAGM_OPTS = {
  diaphragm_material: ["EPDM","NBR","PTFE","Butyl"],
  body_lining:        ["Rubber Lined","PTFE Lined","PVDF Lined","Unlined"],
  weir_type:          ["Weir Type","Straightway","Full Bore"],
};

const ISOLATION_VALVE_MAKES = [
  "Audco (L&T)","AVK","Bray","Crane","Flowserve","GF Piping Systems",
  "GEMU","IMI","KITZ","KSB","L&T Valves","Metso","Neway","ORBINOX","Velan",
];

const ISOLATION_ALL_FIELD_OPTS: Record<string, string[]> = {
  size_nb:            ISOLATION_COMMON_OPTS.size_nb,
  pressure_rating:    ISOLATION_COMMON_OPTS.pressure_rating,
  body_material:      ISOLATION_COMMON_OPTS.body_material,
  area_classification:ISOLATION_COMMON_OPTS.area_classification,
  end_connection:     [...ISOLATION_COMMON_OPTS.end_connection,"Wafer","Lug Type"],
  ball_design:        ISOLATION_BALL_OPTS.ball_design,
  bore_type:          ISOLATION_BALL_OPTS.bore_type,
  seat_material:      [...ISOLATION_BALL_OPTS.seat_material, ...ISOLATION_BUTTERFLY_OPTS.seat_material],
  ball_material:      ISOLATION_BALL_OPTS.ball_material,
  stem_packing:       ISOLATION_BALL_OPTS.stem_packing,
  locking_device:     ISOLATION_BALL_OPTS.locking_device,
  wedge_type:         ISOLATION_GATE_OPTS.wedge_type,
  stem_type:          ISOLATION_GATE_OPTS.stem_type,
  trim_material:      [...ISOLATION_GATE_OPTS.trim_material, ...ISOLATION_GLOBE_OPTS.trim_material],
  port_type:          ISOLATION_GLOBE_OPTS.port_type,
  disc_type:          ISOLATION_GLOBE_OPTS.disc_type,
  bonnet_type:        ISOLATION_GLOBE_OPTS.bonnet_type,
  disc_material:      ISOLATION_BUTTERFLY_OPTS.disc_material,
  disc_mounting:      ISOLATION_BUTTERFLY_OPTS.disc_mounting,
  lining_type:        ISOLATION_BUTTERFLY_OPTS.lining_type,
  port_pattern:       ISOLATION_PLUG_OPTS.port_pattern,
  lubrication:        ISOLATION_PLUG_OPTS.lubrication,
  plug_material:      ISOLATION_PLUG_OPTS.plug_material,
  sleeve_material:    ISOLATION_PLUG_OPTS.sleeve_material,
  service_type:       ISOLATION_KNIFE_OPTS.service_type,
  gate_material:      ISOLATION_KNIFE_OPTS.gate_material,
  packing_type:       ISOLATION_KNIFE_OPTS.packing_type,
  seat_type:          ISOLATION_KNIFE_OPTS.seat_type,
  flow_direction:     ISOLATION_KNIFE_OPTS.flow_direction,
  diaphragm_material: ISOLATION_DIAPHRAGM_OPTS.diaphragm_material,
  body_lining:        ISOLATION_DIAPHRAGM_OPTS.body_lining,
  weir_type:          ISOLATION_DIAPHRAGM_OPTS.weir_type,
};

/**
 * Client-side Isolation Valve SAP Item Code preview.
 * Mirrors buildIsoValveItemCode in buy-catalog-sap-service.ts.
 * Returns the generated code, or null if any required field is missing/unrecognised.
 */
export function buildIsoValvePreviewCode(attrs: Record<string, unknown>): string | null {
  const VTYPE: Record<string, string> = {
    'Ball Valve': 'BALL', 'Gate Valve': 'GATE', 'Globe Valve': 'GLBE',
    'Butterfly Valve': 'BFLY', 'Plug Valve': 'PLUG',
    'Knife Gate Valve': 'KGATE', 'Diaphragm Valve': 'DIAPH',
  };
  const ECONN: Record<string, string> = {
    'Flanged': 'RF', 'Butt Weld': 'BW', 'Socket Weld': 'SW',
    'Threaded (BSP)': 'THDB', 'Threaded (NPT)': 'THDN',
    'Wafer': 'WFR', 'Lug Type': 'LUG', 'Grooved': 'GRV',
    'Clamp End (Tri-Clamp)': 'TC',
  };
  const PRES: Record<string, string> = {
    'Class 150': 'CL150', 'Class 300': 'CL300', 'Class 600': 'CL600',
    'Class 900': 'CL900', 'Class 1500': 'CL1500', 'Class 2500': 'CL2500',
    'PN6': 'PN6', 'PN10': 'PN10', 'PN16': 'PN16', 'PN25': 'PN25',
    'PN40': 'PN40', 'PN64': 'PN64', 'PN100': 'PN100', 'PN160': 'PN160',
  };
  const BMAT: Record<string, string> = {
    'CI': 'CI', 'DI': 'DI', 'CS (WCB)': 'WCB', 'LCB': 'LCB',
    'SS304': 'SS304', 'SS316': 'SS316', 'SS316L': 'SS316L',
    'CF8': 'CF8', 'CF8M': 'CF8M', 'Duplex SS': 'DSS',
    'Hastelloy C': 'HC276', 'Bronze': 'BRZ', 'Monel': 'MNL', 'Titanium': 'TI',
  };
  const TRIM: Record<string, string> = {
    'PTFE': 'PTFE', 'PEEK': 'PEEK', 'Metal (SS316)': 'SS316', 'Nylon': 'NYLON',
    'EPDM': 'EPDM', 'NBR': 'NBR', 'SS304': 'SS304', '13Cr': '13CR',
    'Hard Facing (Stellite)': 'STLT', 'Alloy Steel': 'AYST',
    'Metal': 'MTL', 'Hardened SS': 'HSS', 'Butyl': 'BUTYL',
  };

  const valveTypeRaw = (attrs.valve_type     as string)?.trim() ?? '';
  const endConnRaw   = (attrs.end_connection  as string)?.trim() ?? '';
  const sizeRaw      = (attrs.size_nb         as string)?.trim() ?? '';
  const pressureRaw  = (attrs.pressure_rating as string)?.trim() ?? '';
  const bodyMatRaw   = (attrs.body_material   as string)?.trim() ?? '';
  const vt           = valveTypeRaw.toLowerCase();

  const valveType = VTYPE[valveTypeRaw];
  const endConn   = ECONN[endConnRaw];
  const pressure  = PRES[pressureRaw];
  const bodyMat   = BMAT[bodyMatRaw];
  const sizeMatch = sizeRaw.match(/^(\d+)\s*NB$/i);
  const size      = sizeMatch ? `DN${sizeMatch[1]}` : undefined;

  let trimRaw = '';
  if (vt.includes('ball') || vt.includes('butterfly'))      trimRaw = (attrs.seat_material       as string)?.trim() ?? '';
  else if (vt.includes('gate') || vt.includes('globe'))     trimRaw = (attrs.trim_material        as string)?.trim() ?? '';
  else if (vt.includes('plug'))                             trimRaw = (attrs.sleeve_material      as string)?.trim() ?? '';
  else if (vt.includes('knife'))                            trimRaw = (attrs.gate_material        as string)?.trim() ?? '';
  else if (vt.includes('diaphragm'))                        trimRaw = (attrs.diaphragm_material   as string)?.trim() ?? '';
  const trim = TRIM[trimRaw];

  if (!valveType || !endConn || !size || !pressure || !bodyMat || !trim) return null;
  return `VLV-ISO-${valveType}-${endConn}-${size}-${pressure}-${bodyMat}-${trim}`;
}

export function buildIsolationValveRequirement(attrs: Record<string, unknown>): string {
  const valveType = (attrs.valve_type      as string)?.trim() || "";
  const sizeNb    = (attrs.size_nb         as string)?.trim() || "";
  const rating    = (attrs.pressure_rating as string)?.trim() || "";
  const bodyMat   = (attrs.body_material   as string)?.trim() || "";
  const endConn   = (attrs.end_connection  as string)?.trim() || "";
  const areaClass = (attrs.area_classification as string)?.trim() || "";
  const vt        = valveType.toLowerCase();
  const parts: string[] = [];
  if (valveType) parts.push(valveType);
  if (sizeNb)    parts.push(sizeNb);
  if (rating)    parts.push(rating);
  if (bodyMat)   parts.push(`${bodyMat} Body`);
  if (endConn)   parts.push(endConn);
  if (vt.includes("ball")) {
    const ballDesign  = (attrs.ball_design   as string)?.trim() || "";
    const bore        = (attrs.bore_type     as string)?.trim() || "";
    const seat        = (attrs.seat_material as string)?.trim() || "";
    const ballMat     = (attrs.ball_material as string)?.trim() || "";
    const lockDevice  = (attrs.locking_device as string)?.trim() || "";
    if (ballDesign) parts.push(ballDesign);
    if (bore)       parts.push(bore);
    if (seat)       parts.push(`${seat} Seat`);
    if (ballMat)    parts.push(`${ballMat} Ball`);
    if (lockDevice === "Yes") parts.push("With Locking Device");
  } else if (vt.includes("gate") && !vt.includes("knife")) {
    const wedge    = (attrs.wedge_type    as string)?.trim() || "";
    const stemType = (attrs.stem_type     as string)?.trim() || "";
    const trim     = (attrs.trim_material as string)?.trim() || "";
    if (wedge)    parts.push(wedge);
    if (stemType) parts.push(stemType);
    if (trim)     parts.push(`${trim} Trim`);
  } else if (vt.includes("globe")) {
    const portType = (attrs.port_type     as string)?.trim() || "";
    const disc     = (attrs.disc_type     as string)?.trim() || "";
    const trim     = (attrs.trim_material as string)?.trim() || "";
    if (portType) parts.push(portType);
    if (disc)     parts.push(disc);
    if (trim)     parts.push(`${trim} Trim`);
  } else if (vt.includes("butterfly")) {
    const discMat   = (attrs.disc_material as string)?.trim() || "";
    const seatMat   = (attrs.seat_material as string)?.trim() || "";
    const mounting  = (attrs.disc_mounting as string)?.trim() || "";
    const liningTyp = (attrs.lining_type   as string)?.trim() || "";
    if (discMat)   parts.push(`${discMat} Disc`);
    if (seatMat)   parts.push(`${seatMat} Seat`);
    if (mounting)  parts.push(mounting);
    if (liningTyp) parts.push(liningTyp);
  } else if (vt.includes("plug")) {
    const port     = (attrs.port_pattern  as string)?.trim() || "";
    const lube     = (attrs.lubrication   as string)?.trim() || "";
    const plugMat  = (attrs.plug_material as string)?.trim() || "";
    if (port)    parts.push(port);
    if (lube)    parts.push(lube);
    if (plugMat) parts.push(`${plugMat} Plug`);
  } else if (vt.includes("knife")) {
    const svcType = (attrs.service_type  as string)?.trim() || "";
    const gate    = (attrs.gate_material as string)?.trim() || "";
    const packing = (attrs.packing_type  as string)?.trim() || "";
    const seatTyp = (attrs.seat_type     as string)?.trim() || "";
    if (svcType && svcType !== "Standard") parts.push(svcType);
    if (gate)    parts.push(`${gate} Gate`);
    if (packing) parts.push(packing);
    if (seatTyp) parts.push(seatTyp);
  } else if (vt.includes("diaphragm")) {
    const diaphMat = (attrs.diaphragm_material as string)?.trim() || "";
    const lining   = (attrs.body_lining        as string)?.trim() || "";
    const weirType = (attrs.weir_type          as string)?.trim() || "";
    if (diaphMat) parts.push(`${diaphMat} Diaphragm`);
    if (lining)   parts.push(lining);
    if (weirType) parts.push(weirType);
  }
  if (areaClass && areaClass !== "Safe Area") parts.push(areaClass);
  return shortenToSapItemName(parts.join(", "));
}

function buildIsolationDefaults(valveType: string, prev: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {
    valve_type:          valveType,
    area_classification: (prev.area_classification as string) || "Safe Area",
    make:                (prev.make as string) ?? "",
  };
  const vt = valveType.toLowerCase();
  if (vt.includes("ball")) {
    return { ...base, size_nb: "50 NB", pressure_rating: "Class 150", end_connection: "Flanged",
      body_material: "CS (WCB)", bore_type: "Full Bore", seat_material: "PTFE" };
  } else if (vt.includes("gate")) {
    return { ...base, size_nb: "50 NB", pressure_rating: "Class 150", end_connection: "Flanged",
      body_material: "CS (WCB)", wedge_type: "Solid Wedge", stem_type: "Rising Stem (OS&Y)", trim_material: "SS304" };
  } else if (vt.includes("globe")) {
    return { ...base, size_nb: "50 NB", pressure_rating: "Class 150", end_connection: "Flanged",
      body_material: "CS (WCB)", port_type: "Single Port", disc_type: "Plug Disc", trim_material: "SS316" };
  } else if (vt.includes("butterfly")) {
    return { ...base, size_nb: "100 NB", pressure_rating: "PN16", end_connection: "Wafer",
      body_material: "CI", disc_material: "SS316", seat_material: "EPDM", disc_mounting: "Concentric" };
  } else if (vt.includes("plug")) {
    return { ...base, size_nb: "50 NB", pressure_rating: "Class 150", end_connection: "Flanged",
      body_material: "CS (WCB)", port_pattern: "Single Port", lubrication: "Non-Lubricated" };
  } else if (vt.includes("knife")) {
    return { ...base, size_nb: "100 NB", pressure_rating: "PN10", end_connection: "Wafer",
      body_material: "CI", gate_material: "SS304", packing_type: "PTFE Stuffing Box" };
  } else if (vt.includes("diaphragm")) {
    return { ...base, size_nb: "50 NB", pressure_rating: "PN10", end_connection: "Flanged",
      body_material: "CI", diaphragm_material: "EPDM", body_lining: "Rubber Lined", weir_type: "Weir Type" };
  }
  return base;
}

export function IsolationValveAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const set       = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const valveType = (attrs.valve_type as string) ?? "";
  const vt        = valveType.toLowerCase();
  const isBall      = vt.includes("ball");
  const isGate      = vt.includes("gate") && !vt.includes("knife");
  const isGlobe     = vt.includes("globe");
  const isButterfly = vt.includes("butterfly");
  const isPlug      = vt.includes("plug");
  const isKnife     = vt.includes("knife");
  const isDiaphragm = vt.includes("diaphragm");

  const endConnOpts = isButterfly
    ? ISOLATION_COMMON_OPTS.end_conn_bfly
    : isKnife
      ? ISOLATION_COMMON_OPTS.end_conn_knife
      : ISOLATION_COMMON_OPTS.end_connection;

  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(ISOLATION_ALL_FIELD_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  const makeOpts = getMakesList("isolation_valve", ISOLATION_VALVE_MAKES);

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom(c => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom(c => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function handleTypeChange(newType: string) {
    const next = buildIsolationDefaults(newType, attrs);
    setCustom(() => {
      const c: Record<string, boolean> = {};
      for (const [key, opts] of Object.entries(ISOLATION_ALL_FIELD_OPTS)) {
        const val = (next[key] as string) ?? "";
        c[key] = val !== "" && !opts.includes(val);
      }
      return c;
    });
    onChange(next);
  }

  function renderField(key: string, label: string, opts: string[], required?: boolean, wrapClass?: string) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className={`space-y-1.5 ${wrapClass ?? ""}`}>
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

      {/* 1 — Valve Type */}
      <SectionCard title="Valve Type" color="bg-sky-50/60 border-sky-200">
        <div className="col-span-3 md:col-span-5 space-y-1.5">
          <Label className="text-xs">Valve Type <span className="text-red-500">*</span></Label>
          <Select value={valveType} onValueChange={(v) => { if (v !== valveType) handleTypeChange(v); }}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select valve type…" />
            </SelectTrigger>
            <SelectContent>
              {ISOLATION_VALVE_TYPES.map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!valveType && (
          <div className="col-span-3 md:col-span-5 flex items-center justify-center py-3 text-sm text-muted-foreground">
            Select a valve type above to configure specifications.
          </div>
        )}
      </SectionCard>

      {/* 2 — Size & Pressure Rating */}
      {valveType && (
        <SectionCard title="Size & Pressure Rating" color="bg-violet-50/60 border-violet-200">
          {renderField("size_nb",         "Size (NB)",       ISOLATION_COMMON_OPTS.size_nb,         true)}
          {renderField("pressure_rating", "Pressure Rating", ISOLATION_COMMON_OPTS.pressure_rating,  true)}
        </SectionCard>
      )}

      {/* 3 — End Connection & Body Material */}
      {valveType && (
        <SectionCard title="End Connection & Body Material" color="bg-emerald-50/60 border-emerald-200">
          {renderField("end_connection", "End Connection", endConnOpts,                         true)}
          {renderField("body_material",  "Body Material",  ISOLATION_COMMON_OPTS.body_material, true)}
        </SectionCard>
      )}

      {/* 4 — Type-specific details */}
      {isBall && (
        <SectionCard title="Ball & Seat Details" color="bg-amber-50/60 border-amber-300">
          {renderField("ball_design",   "Ball Design",   ISOLATION_BALL_OPTS.ball_design,   true)}
          {renderField("bore_type",     "Bore Type",     ISOLATION_BALL_OPTS.bore_type,     true)}
          {renderField("seat_material", "Seat Material", ISOLATION_BALL_OPTS.seat_material, true)}
          {renderField("ball_material", "Ball Material", ISOLATION_BALL_OPTS.ball_material)}
          {renderField("stem_packing",  "Stem Packing",  ISOLATION_BALL_OPTS.stem_packing)}
          {renderField("locking_device","Locking Device",ISOLATION_BALL_OPTS.locking_device)}
        </SectionCard>
      )}

      {isGate && (
        <SectionCard title="Wedge & Stem Details" color="bg-amber-50/60 border-amber-300">
          {renderField("wedge_type",    "Wedge Type",    ISOLATION_GATE_OPTS.wedge_type,    true)}
          {renderField("stem_type",     "Stem Type",     ISOLATION_GATE_OPTS.stem_type,     true)}
          {renderField("trim_material", "Trim Material", ISOLATION_GATE_OPTS.trim_material, true)}
          <div />
        </SectionCard>
      )}

      {isGlobe && (
        <SectionCard title="Disc & Port Details" color="bg-amber-50/60 border-amber-300">
          {renderField("port_type",     "Port Type",     ISOLATION_GLOBE_OPTS.port_type,     true)}
          {renderField("disc_type",     "Disc Type",     ISOLATION_GLOBE_OPTS.disc_type,     true)}
          {renderField("trim_material", "Trim Material", ISOLATION_GLOBE_OPTS.trim_material, true)}
          {renderField("bonnet_type",   "Bonnet Type",   ISOLATION_GLOBE_OPTS.bonnet_type)}
        </SectionCard>
      )}

      {isButterfly && (
        <SectionCard title="Disc & Seat Details" color="bg-amber-50/60 border-amber-300">
          {renderField("disc_material", "Disc Material",         ISOLATION_BUTTERFLY_OPTS.disc_material, true)}
          {renderField("seat_material", "Seat / Liner Material", ISOLATION_BUTTERFLY_OPTS.seat_material, true)}
          {renderField("disc_mounting", "Disc Mounting",         ISOLATION_BUTTERFLY_OPTS.disc_mounting, true)}
          {renderField("lining_type",   "Lining Type",           ISOLATION_BUTTERFLY_OPTS.lining_type)}
        </SectionCard>
      )}

      {isPlug && (
        <SectionCard title="Port & Lubrication Details" color="bg-amber-50/60 border-amber-300">
          {renderField("port_pattern",    "Port Pattern",    ISOLATION_PLUG_OPTS.port_pattern,    true)}
          {renderField("lubrication",     "Lubrication",     ISOLATION_PLUG_OPTS.lubrication,     true)}
          {renderField("plug_material",   "Plug Material",   ISOLATION_PLUG_OPTS.plug_material)}
          {renderField("sleeve_material", "Sleeve Material", ISOLATION_PLUG_OPTS.sleeve_material, true)}
        </SectionCard>
      )}

      {isKnife && (
        <SectionCard title="Gate & Packing Details" color="bg-amber-50/60 border-amber-300">
          {renderField("service_type",   "Service Type",   ISOLATION_KNIFE_OPTS.service_type,   true)}
          {renderField("gate_material",  "Gate Material",  ISOLATION_KNIFE_OPTS.gate_material,  true)}
          {renderField("packing_type",   "Packing Type",   ISOLATION_KNIFE_OPTS.packing_type,   true)}
          {renderField("seat_type",      "Seat Type",      ISOLATION_KNIFE_OPTS.seat_type)}
          {renderField("flow_direction", "Flow Direction", ISOLATION_KNIFE_OPTS.flow_direction)}
          <div />
        </SectionCard>
      )}

      {isDiaphragm && (
        <SectionCard title="Diaphragm & Lining Details" color="bg-amber-50/60 border-amber-300">
          {renderField("diaphragm_material","Diaphragm Material",ISOLATION_DIAPHRAGM_OPTS.diaphragm_material, true)}
          {renderField("body_lining",       "Body Lining",       ISOLATION_DIAPHRAGM_OPTS.body_lining,        true)}
          {renderField("weir_type",         "Weir Type",         ISOLATION_DIAPHRAGM_OPTS.weir_type,          true)}
          <div />
        </SectionCard>
      )}

      {/* 5 — Area Classification */}
      {valveType && (
        <SectionCard title="Area Classification" color="bg-orange-50/60 border-orange-200">
          {renderField("area_classification","Area Classification",ISOLATION_COMMON_OPTS.area_classification, undefined, "col-span-2")}
          <div />
        </SectionCard>
      )}

      {/* Quantity */}
      {qty !== undefined && (
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="1" step="1"
            value={qty}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NRV (NON-RETURN / CHECK VALVE)
// ─────────────────────────────────────────────────────────────────────────────
const NRV_VALVE_TYPES = [
  "Swing Check Valve","Lift Check Valve","Dual Plate (Wafer) Check Valve",
  "Ball Check Valve","Tilting Disc Check Valve","Piston Check Valve","Foot Valve",
];

const NRV_COMMON_OPTS = {
  size_nb:             ["15 NB","25 NB","40 NB","50 NB","65 NB","80 NB","100 NB","150 NB","200 NB","250 NB","300 NB","350 NB","400 NB","450 NB","500 NB","600 NB"],
  pressure_rating_std: ["Class 150","Class 300","Class 600","Class 900","Class 1500"],
  pressure_rating_pn:  ["PN6","PN10","PN16","PN25","PN40","PN64","PN100","PN160"],
  end_connection:      ["Flanged","Threaded","Butt Weld","Socket Weld","Wafer","Lug Type","Grooved"],
  end_conn_dual:       ["Wafer","Lug Type","Flanged"],
  body_material:       ["WCB (CS)","LCB (Low Temp CS)","SS304","SS316","SS316L","CF8","CF8M","Duplex SS","CI (Cast Iron)","Ductile Iron","Bronze","Hastelloy C"],
  disc_material:       ["WCB (CS)","SS304","SS316","SS316L","Duplex SS","Bronze","Hardened Steel","Stellite Faced","NBR","EPDM"],
  seat_material:       ["Soft Seat (NBR)","Soft Seat (EPDM)","Soft Seat (PTFE)","Metal Seat (SS316)","Stellite"],
  spring:              ["Spring Assisted","No Spring"],
  spring_material:     ["SS316","Inconel","Hastelloy C"],
  hinge_pin_material:  ["SS316","Duplex SS","Monel","Bronze"],
  yes_no:              ["Yes","No"],
  piston_material:     ["SS316","PTFE Coated","Teflon Coated"],
  ball_material:       ["SS316","PTFE Coated","Rubber Coated","Buna-N"],
  disc_tilt_material:  ["WCB (CS)","SS316","Duplex SS","Stellite Faced"],
  face_to_face:        ["API 594","ASME B16.10","EN 558-1"],
  strainer:            ["Integral","Separate","None"],
  foot_seat_material:  ["Rubber","Brass","SS316"],
  std_swing:    ["API 594","API 6D","ASME B16.34","EN 12334","BS 5153","ISO 5208"],
  std_lift:     ["API 594","ASME B16.34","EN 12334","BS 5153","ISO 5208"],
  std_dual:     ["API 594","ASME B16.34","EN 12334","ISO 5208"],
  std_ball:     ["API 6D","ASME B16.34","ISO 5208"],
  std_tilting:  ["API 594","ASME B16.34","EN 12334","ISO 5208"],
  std_piston:   ["API 594","ASME B16.34","EN 12334","ISO 5208"],
  std_foot:     ["IS 4038","BS 5153","ASME B16.34","ISO 5208"],
};

const NRV_ALL_DESIGN_STDS = [
  ...NRV_COMMON_OPTS.std_swing, ...NRV_COMMON_OPTS.std_lift,
  ...NRV_COMMON_OPTS.std_dual,  ...NRV_COMMON_OPTS.std_ball,
  ...NRV_COMMON_OPTS.std_tilting,...NRV_COMMON_OPTS.std_piston,
  ...NRV_COMMON_OPTS.std_foot,
].filter((v, i, a) => a.indexOf(v) === i);

const NRV_ALL_FIELD_OPTS: Record<string, string[]> = {
  size_nb:              NRV_COMMON_OPTS.size_nb,
  pressure_rating:      [...NRV_COMMON_OPTS.pressure_rating_std, ...NRV_COMMON_OPTS.pressure_rating_pn],
  end_connection:       [...NRV_COMMON_OPTS.end_connection, ...NRV_COMMON_OPTS.end_conn_dual].filter((v,i,a)=>a.indexOf(v)===i),
  body_material:        NRV_COMMON_OPTS.body_material,
  disc_material:        NRV_COMMON_OPTS.disc_material,
  seat_material:        NRV_COMMON_OPTS.seat_material,
  design_standard:      NRV_ALL_DESIGN_STDS,
  spring:               NRV_COMMON_OPTS.spring,
  spring_material:      NRV_COMMON_OPTS.spring_material,
  hinge_pin_material:   NRV_COMMON_OPTS.hinge_pin_material,
  renewable_seat:       NRV_COMMON_OPTS.yes_no,
  guided:               NRV_COMMON_OPTS.yes_no,
  dual_spring_material: NRV_COMMON_OPTS.spring_material,
  face_to_face_std:     NRV_COMMON_OPTS.face_to_face,
  piston_material:      NRV_COMMON_OPTS.piston_material,
  dashpot:              NRV_COMMON_OPTS.yes_no,
  disc_tilt_material:   NRV_COMMON_OPTS.disc_tilt_material,
  counterweight:        NRV_COMMON_OPTS.yes_no,
  ball_material:        NRV_COMMON_OPTS.ball_material,
  strainer:             NRV_COMMON_OPTS.strainer,
  foot_seat_material:   NRV_COMMON_OPTS.foot_seat_material,
};

const NRV_VALVE_MAKES: string[] = [];

export function buildNrvValveRequirement(attrs: Record<string, unknown>): string {
  const type    = (attrs.valve_type as string)?.trim() || "";
  const typeLC  = type.toLowerCase();
  const sizeNb  = (attrs.size_nb as string)?.trim() || "";
  const pr      = (attrs.pressure_rating as string)?.trim() || "";
  const bodyMat = (attrs.body_material as string)?.trim() || "";
  const endConn = (attrs.end_connection as string)?.trim() || "";
  const std     = (attrs.design_standard as string)?.trim() || "";
  const discMat = (attrs.disc_material as string)?.trim() || "";
  const seatMat = (attrs.seat_material as string)?.trim() || "";
  const ballMat = (attrs.ball_material as string)?.trim() || "";
  const parts: string[] = [];
  if (type)    parts.push(type);
  if (sizeNb)  parts.push(sizeNb);
  if (pr)      parts.push(pr);
  if (bodyMat) parts.push(`${bodyMat} Body`);
  if (endConn) parts.push(endConn);
  if (typeLC.includes("ball check")) {
    if (ballMat) parts.push(`${ballMat} Ball`);
  } else {
    if (discMat) parts.push(`${discMat} Disc`);
    if (seatMat) parts.push(`${seatMat} Seat`);
  }
  if (std)     parts.push(std);
  return shortenToSapItemName(parts.join(", "));
}

function buildNrvValveDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    valve_type: type, make: "",
    size_nb: "50 NB", pressure_rating: "", end_connection: "Flanged",
    body_material: "WCB (CS)", disc_material: "SS316", seat_material: "Metal Seat (SS316)",
    design_standard: "",
    spring: "", spring_material: "",
    hinge_pin_material: "", renewable_seat: "",
    guided: "",
    dual_spring_material: "", face_to_face_std: "",
    piston_material: "", dashpot: "",
    disc_tilt_material: "", counterweight: "",
    ball_material: "",
    strainer: "", foot_seat_material: "",
  };
  switch (type) {
    case "Swing Check Valve":
      return { ...base, pressure_rating: "Class 150", design_standard: "API 594",
        spring: "Spring Assisted", spring_material: "SS316" };
    case "Lift Check Valve":
      return { ...base, pressure_rating: "Class 150", design_standard: "API 594",
        spring: "Spring Assisted", spring_material: "SS316" };
    case "Dual Plate (Wafer) Check Valve":
      return { ...base, pressure_rating: "PN16", end_connection: "Wafer",
        body_material: "CI (Cast Iron)", design_standard: "API 594",
        dual_spring_material: "SS316", face_to_face_std: "API 594" };
    case "Ball Check Valve":
      return { ...base, pressure_rating: "Class 150", design_standard: "API 6D",
        ball_material: "SS316" };
    case "Tilting Disc Check Valve":
      return { ...base, pressure_rating: "Class 150", design_standard: "API 594",
        spring: "Spring Assisted", spring_material: "SS316",
        disc_tilt_material: "SS316" };
    case "Piston Check Valve":
      return { ...base, pressure_rating: "Class 150", design_standard: "API 594",
        spring: "Spring Assisted", spring_material: "SS316",
        piston_material: "SS316", dashpot: "No" };
    case "Foot Valve":
      return { ...base, pressure_rating: "Class 150",
        body_material: "CI (Cast Iron)", design_standard: "IS 4038",
        strainer: "Integral", foot_seat_material: "Rubber" };
    default: return base;
  }
}

export function NrvValveAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(NRV_ALL_FIELD_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  function handleTypeChange(type: string) {
    const defaults = buildNrvValveDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(NRV_ALL_FIELD_OPTS)) {
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); onChange({ ...defaults, make: "" });
  }

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      onChange({ ...attrs, [key]: "" });
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      onChange({ ...attrs, [key]: val });
    }
  }

  function set(key: string, val: unknown) { onChange({ ...attrs, [key]: val }); }

  function renderField(key: string, label: string, opts: string[], required?: boolean, wrapClass?: string) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className={`space-y-1.5 ${wrapClass ?? ""}`}>
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal}
            onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function sec(label: string) {
    return (
      <div className="col-span-3 md:col-span-5 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  const makeOpts = getMakesList("nrv_valve", NRV_VALVE_MAKES);

  const valveType  = (attrs.valve_type as string) ?? "";
  const isSwing    = valveType === "Swing Check Valve";
  const isLift     = valveType === "Lift Check Valve";
  const isDual     = valveType === "Dual Plate (Wafer) Check Valve";
  const isBallChk  = valveType === "Ball Check Valve";
  const isTilting  = valveType === "Tilting Disc Check Valve";
  const isPiston   = valveType === "Piston Check Valve";
  const isFoot     = valveType === "Foot Valve";
  const hasType    = isSwing || isLift || isDual || isBallChk || isTilting || isPiston || isFoot;

  const hasSpringToggle  = isSwing || isLift || isTilting || isPiston;
  const springVal        = (attrs.spring as string) ?? "";
  const isSpringAssisted = springVal === "Spring Assisted";

  const stdOpts = isSwing   ? NRV_COMMON_OPTS.std_swing
    : isLift    ? NRV_COMMON_OPTS.std_lift
    : isDual    ? NRV_COMMON_OPTS.std_dual
    : isBallChk ? NRV_COMMON_OPTS.std_ball
    : isTilting ? NRV_COMMON_OPTS.std_tilting
    : isPiston  ? NRV_COMMON_OPTS.std_piston
    : isFoot    ? NRV_COMMON_OPTS.std_foot
    : [];


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

      {/* 1 — Valve Type */}
      <SectionCard title="Valve Type" color="bg-sky-50/60 border-sky-200">
        <div className="col-span-3 md:col-span-5 space-y-1.5">
          <Label className="text-xs">Valve Type <span className="text-red-500">*</span></Label>
          <SearchableSelect
            value={NRV_VALVE_TYPES.includes(valveType) ? valveType : ""}
            options={NRV_VALVE_TYPES} placeholder="Select valve type first…"
            onSelect={(v) => handleTypeChange(v)}
          />
        </div>
        {!hasType && (
          <div className="col-span-3 md:col-span-5 flex items-center justify-center py-3 text-sm text-muted-foreground">
            Select a valve type above to configure specifications
          </div>
        )}
      </SectionCard>

      {/* 2 — Size, Rating & Design Standard */}
      {hasType && (
        <SectionCard title="Size, Pressure Rating & Design Standard" color="bg-violet-50/60 border-violet-200">
          {renderField("size_nb",         "Size (NB)",       NRV_COMMON_OPTS.size_nb, true)}
          {renderField("pressure_rating", "Pressure Rating",
            isDual ? NRV_COMMON_OPTS.pressure_rating_pn : NRV_COMMON_OPTS.pressure_rating_std, true)}
          {renderField("design_standard", "Design Standard", stdOpts, true)}
          <div />
        </SectionCard>
      )}

      {/* 3 — Connection & Material */}
      {hasType && (
        <SectionCard title="Connection & Material" color="bg-emerald-50/60 border-emerald-200">
          {renderField("end_connection", "End Connection",
            isDual ? NRV_COMMON_OPTS.end_conn_dual : NRV_COMMON_OPTS.end_connection, true)}
          {renderField("body_material",  "Body Material",           NRV_COMMON_OPTS.body_material, true)}
          {renderField("disc_material",  "Disc / Closure Material", NRV_COMMON_OPTS.disc_material, true)}
          {renderField("seat_material",  "Seat Material",           NRV_COMMON_OPTS.seat_material)}
        </SectionCard>
      )}

      {/* 4 — Type-specific configuration */}
      {isSwing && (
        <SectionCard title="Swing Check Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("hinge_pin_material","Hinge / Pin Material",NRV_COMMON_OPTS.hinge_pin_material)}
          {renderField("renewable_seat",    "Renewable Seat",      NRV_COMMON_OPTS.yes_no)}
        </SectionCard>
      )}

      {isLift && (
        <SectionCard title="Lift Check Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("guided","Guided",NRV_COMMON_OPTS.yes_no)}
          <div />
        </SectionCard>
      )}

      {isDual && (
        <SectionCard title="Dual Plate Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("dual_spring_material","Spring Material",  NRV_COMMON_OPTS.spring_material, true)}
          {renderField("face_to_face_std",    "Face-to-Face Std", NRV_COMMON_OPTS.face_to_face)}
        </SectionCard>
      )}

      {isTilting && (
        <SectionCard title="Tilting Disc Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("disc_tilt_material","Disc Material", NRV_COMMON_OPTS.disc_tilt_material)}
          {renderField("counterweight",     "Counterweight", NRV_COMMON_OPTS.yes_no)}
        </SectionCard>
      )}

      {isPiston && (
        <SectionCard title="Piston Check Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("piston_material","Piston Material",    NRV_COMMON_OPTS.piston_material)}
          {renderField("dashpot",        "Dashpot / Dampener", NRV_COMMON_OPTS.yes_no)}
        </SectionCard>
      )}

      {isBallChk && (
        <SectionCard title="Ball Check Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("ball_material","Ball Material",NRV_COMMON_OPTS.ball_material)}
          <div />
        </SectionCard>
      )}

      {isFoot && (
        <SectionCard title="Foot Valve Configuration" color="bg-amber-50/60 border-amber-300">
          {renderField("strainer",          "Strainer",     NRV_COMMON_OPTS.strainer,         true)}
          {renderField("foot_seat_material","Seat Material",NRV_COMMON_OPTS.foot_seat_material)}
        </SectionCard>
      )}

      {/* 5 — Spring (for spring-capable types) */}
      {hasSpringToggle && (
        <SectionCard title="Spring" color="bg-orange-50/60 border-orange-200">
          {renderField("spring","Spring",NRV_COMMON_OPTS.spring)}
          {isSpringAssisted
            ? renderField("spring_material","Spring Material",NRV_COMMON_OPTS.spring_material)
            : <div />}
        </SectionCard>
      )}


      {/* Quantity */}
      {qty !== undefined && (
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="1" step="1"
            value={qty}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEEDLE VALVE FORM
// ─────────────────────────────────────────────────────────────────────────────

const NEEDLE_VALVE_TYPES = [
  "Straight Needle Valve",
  "Angle Needle Valve (L-Pattern)",
  "Multi-Turn Needle Valve",
  "Bleed / Vent Needle Valve",
];

const NEEDLE_COMMON_OPTS = {
  size: [
    '1/4" OD','3/8" OD','1/2" OD','3/4" OD','1" OD',
    "8 NB (DN8)","10 NB (DN10)","15 NB (DN15)","20 NB (DN20)","25 NB (DN25)",
  ],
  pressure_rating: [
    "Class 300","Class 600","Class 900","Class 1500",
    "3000 PSI (207 bar)","6000 PSI (414 bar)","10000 PSI (689 bar)",
    "PN40","PN64","PN100",
  ],
  std_general: ["ASME B16.34","BS 5793 Part 2","Manufacturer's Standard"],
  std_bleed:   ["ASME B16.34","BS 5793 Part 2","Manufacturer's Standard"],
  end_connection: [
    "Double Ferrule (Swagelok / Ham-Let Type)",
    "Single Ferrule (Parker Type)",
    "NPT (F) - Female Threaded",
    "NPT (M) - Male Threaded",
    "SW (Socket Weld)",
    "BW (Butt Weld)",
    "Compression Fitting",
    "Flanged (ASME B16.5)",
  ],
  body_material: [
    "SS316","SS316L","SS304",
    "Carbon Steel (A105)","Duplex SS (A182 F51)",
    "Monel 400 (B564)","Hastelloy C-276","Inconel 625",
  ],
  stem_material: ["SS316","SS316L","17-4 PH SS","Monel 400","Hastelloy C-276"],
  seat_type:     ["Metal Seat (Integral)","PTFE Soft Seat"],
  packing:       ["PTFE","Graphite","FKM (Viton)"],
  flow_pattern:  ["Straight-Through","Angle (L-Pattern)"],
  bonnet_type:   ["Packed Bonnet","Welded Bonnet","Capped Bonnet"],
  vent_type:     ["Manual Bleed","Auto Vent","Self-Closing Vent"],
};

const NEEDLE_ALL_DESIGN_STDS = [
  ...NEEDLE_COMMON_OPTS.std_general,
  ...NEEDLE_COMMON_OPTS.std_bleed,
].filter((v, i, a) => a.indexOf(v) === i);

const NEEDLE_ALL_FIELD_OPTS: Record<string, string[]> = {
  size:            NEEDLE_COMMON_OPTS.size,
  pressure_rating: NEEDLE_COMMON_OPTS.pressure_rating,
  design_standard: NEEDLE_ALL_DESIGN_STDS,
  end_connection:  NEEDLE_COMMON_OPTS.end_connection,
  body_material:   NEEDLE_COMMON_OPTS.body_material,
  stem_material:   NEEDLE_COMMON_OPTS.stem_material,
  seat_type:       NEEDLE_COMMON_OPTS.seat_type,
  packing:         NEEDLE_COMMON_OPTS.packing,
  flow_pattern:    NEEDLE_COMMON_OPTS.flow_pattern,
  bonnet_type:     NEEDLE_COMMON_OPTS.bonnet_type,
  vent_type:       NEEDLE_COMMON_OPTS.vent_type,
};

const NEEDLE_VALVE_MAKES: string[] = [];

export function buildNeedleValveRequirement(attrs: Record<string, unknown>): string {
  const type      = (attrs.valve_type     as string)?.trim() || "";
  const size      = (attrs.size           as string)?.trim() || "";
  const pr        = (attrs.pressure_rating as string)?.trim() || "";
  const bodyMat   = (attrs.body_material  as string)?.trim() || "";
  const endConn   = (attrs.end_connection as string)?.trim() || "";
  const stemMat   = (attrs.stem_material  as string)?.trim() || "";
  const flowPat   = (attrs.flow_pattern   as string)?.trim() || "";
  const parts: string[] = [];
  if (type)    parts.push(type);
  if (size)    parts.push(size);
  if (pr)      parts.push(pr);
  if (bodyMat) parts.push(`${bodyMat} Body`);
  if (endConn) parts.push(endConn);
  if (stemMat && stemMat !== bodyMat) parts.push(`${stemMat} Stem`);
  // Suppress flow pattern if already encoded in the type name (e.g. "Angle Needle Valve (L-Pattern)" + "Angle (L-Pattern)")
  const patternInType = flowPat && type.includes("(L-Pattern)") && flowPat.includes("L-Pattern");
  if (flowPat && flowPat !== "Straight-Through" && !patternInType) parts.push(flowPat);
  return shortenToSapItemName(parts.join(", "));
}

function buildNeedleValveDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    valve_type: type, make: "",
    size: '1/2" OD', pressure_rating: "3000 PSI (207 bar)",
    design_standard: "ASME B16.34",
    end_connection: "Double Ferrule (Swagelok / Ham-Let Type)",
    body_material: "SS316", stem_material: "SS316",
    seat_type: "Metal Seat (Integral)", packing: "PTFE",
    flow_pattern: "Straight-Through",
    bonnet_type: "Packed Bonnet", vent_type: "",
  };
  switch (type) {
    case "Straight Needle Valve":
      return { ...base, design_standard: "ASME B16.34", flow_pattern: "Straight-Through" };
    case "Angle Needle Valve (L-Pattern)":
      return { ...base, design_standard: "ASME B16.34", flow_pattern: "Angle (L-Pattern)" };
    case "Multi-Turn Needle Valve":
      return { ...base, design_standard: "BS 5793 Part 2", flow_pattern: "Straight-Through" };
    case "Bleed / Vent Needle Valve":
      return { ...base, design_standard: "ASME B16.34",
        bonnet_type: "Packed Bonnet", vent_type: "Manual Bleed" };
    default: return base;
  }
}

export function NeedleValveAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(NEEDLE_ALL_FIELD_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  function handleTypeChange(type: string) {
    const defaults = buildNeedleValveDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(NEEDLE_ALL_FIELD_OPTS)) {
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); onChange({ ...defaults, make: "" });
  }

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      onChange({ ...attrs, [key]: "" });
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      onChange({ ...attrs, [key]: val });
    }
  }

  function set(key: string, val: unknown) { onChange({ ...attrs, [key]: val }); }

  function renderField(key: string, label: string, opts: string[], required?: boolean, wrapClass?: string) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className={`space-y-1.5 ${wrapClass ?? ""}`}>
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select..."
          onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value..." value={curVal}
            onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function sec(label: string) {
    return (
      <div className="col-span-3 md:col-span-5 mt-1 pb-0.5 border-b">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    );
  }

  const makeOpts = getMakesList("needle_valve", NEEDLE_VALVE_MAKES);

  const valveType = (attrs.valve_type as string) ?? "";
  const isBleed   = valveType === "Bleed / Vent Needle Valve";
  const hasType   = NEEDLE_VALVE_TYPES.includes(valveType);
  const stdOpts   = isBleed ? NEEDLE_COMMON_OPTS.std_bleed : NEEDLE_COMMON_OPTS.std_general;


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

      {/* 1 — Valve Type */}
      <SectionCard title="Valve Type" color="bg-sky-50/60 border-sky-200">
        <div className="col-span-3 md:col-span-5 space-y-1.5">
          <Label className="text-xs">Valve Type <span className="text-red-500">*</span></Label>
          <SearchableSelect value={valveType} options={NEEDLE_VALVE_TYPES} placeholder="Select valve type..."
            onSelect={handleTypeChange} />
        </div>
        {!hasType && (
          <div className="col-span-3 md:col-span-5 flex items-center justify-center py-3 text-sm text-muted-foreground">
            Select a valve type above to configure specifications
          </div>
        )}
      </SectionCard>

      {/* 2 — Size, Pressure Rating & Design Standard */}
      {hasType && (
        <SectionCard title="Size, Pressure Rating & Design Standard" color="bg-violet-50/60 border-violet-200">
          {renderField("size",            "Size / Tube OD",  NEEDLE_COMMON_OPTS.size,            true)}
          {renderField("pressure_rating", "Pressure Rating", NEEDLE_COMMON_OPTS.pressure_rating, true)}
          {renderField("design_standard", "Design Standard", stdOpts,                            true)}
          <div />
        </SectionCard>
      )}

      {/* 3 — End Connection & Body */}
      {hasType && (
        <SectionCard title="End Connection & Body Material" color="bg-emerald-50/60 border-emerald-200">
          {renderField("end_connection", "End Connection", NEEDLE_COMMON_OPTS.end_connection, true)}
          {renderField("body_material",  "Body Material",  NEEDLE_COMMON_OPTS.body_material,  true)}
        </SectionCard>
      )}

      {/* 4 — Trim & Internals */}
      {hasType && (
        <SectionCard title="Trim & Internals" color="bg-amber-50/60 border-amber-300">
          {renderField("stem_material", "Stem Material",    NEEDLE_COMMON_OPTS.stem_material, true)}
          {renderField("seat_type",     "Seat Type",        NEEDLE_COMMON_OPTS.seat_type,     true)}
          {renderField("packing",       "Packing Material", NEEDLE_COMMON_OPTS.packing,       true)}
          {renderField("flow_pattern",  "Flow Pattern",     NEEDLE_COMMON_OPTS.flow_pattern)}
        </SectionCard>
      )}

      {/* 5 — Bonnet & Vent */}
      {hasType && (
        <SectionCard title={isBleed ? "Bonnet & Vent Configuration" : "Bonnet"} color="bg-orange-50/60 border-orange-200">
          {renderField("bonnet_type", "Bonnet Type", NEEDLE_COMMON_OPTS.bonnet_type)}
          {isBleed
            ? renderField("vent_type", "Vent Type", NEEDLE_COMMON_OPTS.vent_type, true)
            : <div />}
        </SectionCard>
      )}


      {/* Quantity */}
      {qty !== undefined && (
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" type="number" min="1" step="1"
            value={qty}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }} />
        </div>
      )}
    </div>
  );
}
