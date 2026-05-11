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
  size_nb:             ["15 NB","20 NB","25 NB","40 NB","50 NB","65 NB","80 NB","100 NB","150 NB","200 NB","250 NB","300 NB"],
  pressure_rating:     ["Class 150","Class 300","Class 600","Class 900","PN10","PN16","PN25","PN40"],
  end_connection:      ["Flanged","Threaded","Butt Weld","Socket Weld"],
  end_conn_bfly:       ["Wafer","Flanged","Lug"],
  body_material:       ["WCB (CS)","LCB (Low Temp CS)","SS304","SS316","Alloy Steel (WC6)","Duplex SS","Hastelloy C"],
  actuator_type:       ["Pneumatic Diaphragm","Pneumatic Piston","Electric Actuator","Hydraulic Actuator"],
  fail_action:         ["Fail Open (FO)","Fail Close (FC)","Fail Last (FL)"],
  input_signal:        ["4–20 mA","4–20 mA with HART","0–10 V","Digital / Fieldbus"],
  positioner:          ["With Positioner","Without Positioner"],
  handwheel:           ["Yes","No"],
  bypass_valve:        ["Yes","No"],
  area_classification: ["Safe Area","Zone 1","Zone 2"],
  certification:       ["ATEX","IECEx","PESO"],
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
};

const CONTROL_VALVE_MAKES = [
  "Flowserve","Fisher (Emerson)","Samson","Metso Neles","Spirax Sarco",
  "Rotork","AUMA","KMC","KOSO","Crane","IMI CCI","L&T Valves","Bray","Belimo",
];

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
  const parts: string[] = [];
  if (type)         parts.push(type);
  if (sizeNb)       parts.push(sizeNb);
  if (rating)       parts.push(rating);
  if (typeSpecific) parts.push(typeSpecific);
  if (actuator)     parts.push(actuator);
  if (failAct)      parts.push(failAct);
  if (bodyMat)      parts.push(`${bodyMat} Body`);
  if (endConn)      parts.push(endConn);
  return parts.join(", ");
}

function buildControlValveDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    valve_type: type,
    size_nb: "50 NB", pressure_rating: "Class 150", end_connection: "Flanged",
    body_material: "WCB (CS)", actuator_type: "Pneumatic Diaphragm",
    fail_action: "Fail Close (FC)", input_signal: "4–20 mA",
    positioner: "With Positioner", handwheel: "No", bypass_valve: "No",
    area_classification: "Safe Area", makes: [],
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
  const [makeSearch, setMakeSearch] = useState("");
  const [makes, setMakes] = useState<string[]>(() => {
    const m = attrs.makes;
    return Array.isArray(m) ? (m as string[]) : [];
  });

  function handleTypeChange(type: string) {
    const defaults = buildControlValveDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(CONTROL_ALL_FIELD_OPTS)) {
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); setMakes([]); onChange({ ...defaults, makes: [] });
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

  function renderField(key: string, label: string, opts: string[], required?: boolean) {
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

  function addMake(make: string) {
    if (!make.trim() || makes.includes(make.trim())) return;
    const next = [...makes, make.trim()];
    setMakes(next); onChange({ ...attrs, makes: next }); setMakeSearch("");
  }
  function removeMake(m: string) {
    const next = makes.filter((x) => x !== m);
    setMakes(next); onChange({ ...attrs, makes: next });
  }
  function moveMake(i: number, dir: -1 | 1) {
    const next = [...makes]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setMakes(next); onChange({ ...attrs, makes: next });
  }

  const valveType = (attrs.valve_type as string) ?? "";
  const areaClass = (attrs.area_classification as string) ?? "";
  const isGlobe   = valveType === "Globe Control Valve";
  const isBall    = valveType === "Ball Control Valve";
  const isBfly    = valveType === "Butterfly Control Valve";
  const isPlug    = valveType === "Eccentric Plug / Rotary Control Valve";
  const isAngle   = valveType === "Angle Control Valve";
  const hasType   = isGlobe || isBall || isBfly || isPlug || isAngle;

  const filteredMakes = CONTROL_VALVE_MAKES.filter(
    (m) => m.toLowerCase().includes(makeSearch.toLowerCase()) && !makes.includes(m)
  );

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Control Valve Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {sec("Valve Type")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Control Valve Type <span className="text-red-500">*</span></Label>
          <SearchableSelect
            value={CONTROL_VALVE_TYPES.includes(valveType) ? valveType : ""}
            options={CONTROL_VALVE_TYPES} placeholder="Select valve type first…"
            onSelect={(v) => handleTypeChange(v)}
          />
        </div>

        {!hasType && (
          <div className="col-span-2 rounded-md border border-dashed bg-muted/20 py-6 text-center text-xs text-muted-foreground">
            Select a valve type above to configure specifications
          </div>
        )}

        {isGlobe && (<>
          {sec("Globe Configuration")}
          {renderField("valve_config",        "Valve Configuration",  GLOBE_CV_OPTS.valve_config,        true)}
          {renderField("trim_style",          "Trim Style",           GLOBE_CV_OPTS.trim_style,          true)}
          {renderField("flow_characteristic", "Flow Characteristic",  GLOBE_CV_OPTS.flow_characteristic, true)}
          {renderField("trim_material",       "Trim Material",        GLOBE_CV_OPTS.trim_material,       true)}
          {renderField("seat_material",       "Seat Material",        GLOBE_CV_OPTS.seat_material,       true)}
          {renderField("leakage_class",       "Leakage Class",        GLOBE_CV_OPTS.leakage_class,       true)}
          {renderField("bonnet_type",         "Bonnet Type",          GLOBE_CV_OPTS.bonnet_type)}
          {renderField("packing_material",    "Packing Material",     GLOBE_CV_OPTS.packing_material)}
          {renderField("noise_cavitation",    "Noise / Cavitation",   GLOBE_CV_OPTS.noise_cavitation)}
          <div />
        </>)}

        {isBall && (<>
          {sec("Ball Configuration")}
          {renderField("ball_type",           "Ball Type",            BALL_CV_OPTS.ball_type,            true)}
          {renderField("flow_characteristic", "Flow Characteristic",  BALL_CV_OPTS.flow_characteristic,  true)}
          {renderField("ball_trim_material",  "Ball / Trim Material", BALL_CV_OPTS.ball_trim_material,   true)}
          {renderField("seat_material",       "Seat Material",        BALL_CV_OPTS.seat_material,        true)}
          {renderField("leakage_class",       "Leakage Class",        BALL_CV_OPTS.leakage_class)}
          {renderField("packing_material",    "Packing Material",     BALL_CV_OPTS.packing_material)}
        </>)}

        {isBfly && (<>
          {sec("Butterfly Configuration")}
          {renderField("disc_mounting",       "Disc Mounting",         BFLY_CV_OPTS.disc_mounting,       true)}
          {renderField("disc_material",       "Disc Material",         BFLY_CV_OPTS.disc_material,       true)}
          {renderField("seat_liner_material", "Seat / Liner Material", BFLY_CV_OPTS.seat_liner_material, true)}
          {renderField("leakage_class",       "Leakage Class",         BFLY_CV_OPTS.leakage_class)}
          {renderField("flow_characteristic", "Flow Characteristic",   BFLY_CV_OPTS.flow_characteristic)}
          <div />
        </>)}

        {isPlug && (<>
          {sec("Eccentric Plug Configuration")}
          {renderField("plug_style",         "Plug Style",           PLUG_CV_OPTS.plug_style,         true)}
          {renderField("plug_trim_material", "Plug / Trim Material", PLUG_CV_OPTS.plug_trim_material, true)}
          {renderField("seat_material",      "Seat Material",        PLUG_CV_OPTS.seat_material,      true)}
          {renderField("leakage_class",      "Leakage Class",        PLUG_CV_OPTS.leakage_class)}
          {renderField("packing_material",   "Packing Material",     PLUG_CV_OPTS.packing_material)}
          <div />
        </>)}

        {isAngle && (<>
          {sec("Angle Valve Configuration")}
          {renderField("service_application", "Service Application",  ANGLE_CV_OPTS.service_application, true)}
          {renderField("flow_direction",      "Flow Direction",       ANGLE_CV_OPTS.flow_direction,      true)}
          {renderField("trim_style",          "Trim Style",           ANGLE_CV_OPTS.trim_style,          true)}
          {renderField("trim_material",       "Trim Material",        ANGLE_CV_OPTS.trim_material,       true)}
          {renderField("seat_material",       "Seat Material",        ANGLE_CV_OPTS.seat_material,       true)}
          {renderField("leakage_class",       "Leakage Class",        ANGLE_CV_OPTS.leakage_class,       true)}
          {renderField("outlet_reducer",      "Outlet Reducer",       ANGLE_CV_OPTS.outlet_reducer)}
          <div />
        </>)}

        {hasType && (<>
          {sec("Size & Rating")}
          {renderField("size_nb",         "Size (NB)",       CONTROL_COMMON_OPTS.size_nb,         true)}
          {renderField("pressure_rating", "Pressure Rating", CONTROL_COMMON_OPTS.pressure_rating, true)}
          {renderField("end_connection",  "End Connection",
            isBfly ? CONTROL_COMMON_OPTS.end_conn_bfly : CONTROL_COMMON_OPTS.end_connection, true)}
          {renderField("body_material",   "Body Material",   CONTROL_COMMON_OPTS.body_material,   true)}

          {sec("Actuation")}
          {renderField("actuator_type", "Actuator Type", CONTROL_COMMON_OPTS.actuator_type, true)}
          {renderField("fail_action",   "Fail Action",   CONTROL_COMMON_OPTS.fail_action,   true)}

          {sec("Signal & Control (Optional)")}
          {renderField("input_signal",  "Input Signal",       CONTROL_COMMON_OPTS.input_signal)}
          {renderField("positioner",    "Positioner",         CONTROL_COMMON_OPTS.positioner)}
          {renderField("handwheel",     "Handwheel Override", CONTROL_COMMON_OPTS.handwheel)}
          {renderField("bypass_valve",  "Bypass Valve",       CONTROL_COMMON_OPTS.bypass_valve)}

          {sec("Area Classification (Optional)")}
          {renderField("area_classification", "Area Classification", CONTROL_COMMON_OPTS.area_classification)}
          {(areaClass === "Zone 1" || areaClass === "Zone 2")
            ? renderField("certification", "Certification", CONTROL_COMMON_OPTS.certification)
            : <div />}
        </>)}

        {hasType && (<>
          <div className="col-span-2 mt-1 pb-0.5 border-b">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Approved Makes (ranked)</p>
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Search or type make…" value={makeSearch}
                onChange={(e) => setMakeSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && makeSearch.trim()) addMake(makeSearch.trim()); }} />
              <Button type="button" size="sm" className="h-8"
                onClick={() => { if (makeSearch.trim()) addMake(makeSearch.trim()); }}>Add</Button>
            </div>
            {makeSearch && filteredMakes.length > 0 && (
              <div className="rounded-md border bg-background shadow-sm max-h-32 overflow-y-auto">
                {filteredMakes.map((m) => (
                  <button key={m} type="button"
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted"
                    onClick={() => addMake(m)}>{m}</button>
                ))}
              </div>
            )}
            {makes.length > 0 && (
              <div className="space-y-1">
                {makes.map((m, i) => (
                  <div key={m} className="flex items-center gap-2 rounded-md border px-2 py-1 bg-background">
                    <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}.</span>
                    <span className="flex-1 text-xs">{m}</span>
                    <button type="button" onClick={() => moveMake(i, -1)} disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronUp className="h-3 w-3" /></button>
                    <button type="button" onClick={() => moveMake(i, 1)} disabled={i === makes.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronDown className="h-3 w-3" /></button>
                    <button type="button" onClick={() => removeMake(m)}
                      className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}

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
  end_connection:     ["Flanged","Threaded","Screwed"],
  end_conn_bv:        ["Flanged","NPT","BSP"],
  body_material:      ["WCB (CS)","LCB (Low Temp CS)","SS304","SS316","Alloy Steel (WC6)","Duplex SS","Hastelloy C"],
  body_material_bv:   ["Al Alloy","CS","SS304","SS316","FRP"],
  trim_material:      ["SS304","SS316","Hardened Trim","Stellite"],
  bonnet_type:        ["Open Bonnet","Closed Bonnet"],
  back_pressure_type: ["Conventional","Balanced Bellows","Pilot-Operated"],
  overpressure:       ["10%","16%","21%"],
  discharge_type:     ["Open Discharge","Closed Discharge","To Flare Line","Vent to Atmosphere"],
  design_std_psv:     ["API 526","API 520","ASME Section VIII","EN ISO 4126"],
  design_std_tank:    ["API 2000","ISO 28300","EN 14123"],
  certification:      ["IBR","ATEX","IECEx","PESO","CE","SIL Rated"],
  operation_type:     ["Spring-Loaded","Pilot-Operated"],
  service_phase:      ["Gas / Vapour","Liquid","Two-Phase"],
  service_fluid_psv:  ["Steam","Gas / Vapour","Hydrocarbon Vapour","Air","Chemical Vapour","LPG"],
  service_fluid_prv:  ["Water","Oil","Chemical","Hydraulic Fluid","LPG"],
  service_fluid_tank: ["Hydrocarbons","Inert Gas (N₂)","Chemical Vapour","LPG","Air"],
  connection_size:    ["25 NB","50 NB","80 NB","100 NB","150 NB","200 NB","250 NB","300 NB"],
  flame_arrestor:     ["Integrated","Separate","None"],
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
};

const SAFETY_VALVE_MAKES = [
  "Crosby (Emerson)","Leser","Anderson Greenwood (Baker Hughes)","Consolidated (Emerson)",
  "Pentair (Varec)","Tyco / Bharat Valves","PROTEGO","OPW","Cashco","Aquatrol",
];

export function buildSafetyValveRequirement(attrs: Record<string, unknown>): string {
  const type     = (attrs.valve_type as string)?.trim() || "";
  const typeLC   = type.toLowerCase();
  const typeAbbr = type.match(/\(([^)]+)\)/)?.[1] || type.split(" ").map(w => w[0]).join("") || type;
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
    const connSize = (attrs.connection_size as string)?.trim() || "";
    const setVac   = (attrs.set_vacuum as string)?.trim() || "";
    sizeStr  = connSize;
    pressStr = setVac ? `Set Vacuum: ${setVac} mbar` : "";
  } else {
    const inletSize   = (attrs.inlet_size as string)?.trim() || "";
    const outletSize  = (attrs.outlet_size as string)?.trim() || "";
    const setPressure = (attrs.set_pressure as string)?.trim() || "";
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
  return parts.join(", ");
}

function buildSafetyValveDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    valve_type: type, body_material: "WCB (CS)", end_connection: "Flanged", makes: [],
    inlet_size: "", outlet_size: "", pressure_rating: "", set_pressure: "",
    api_orifice: "", bonnet_type: "", back_pressure_type: "", overpressure: "",
    discharge_type: "", design_standard: "", certification: "", service_fluid: "",
    operating_temp: "", trim_material: "", operation_type: "", service_phase: "",
    set_vacuum: "", flow_capacity: "", reseal_pressure: "",
    connection_size: "", pressure_setting_mbar: "", vacuum_setting_mbar: "",
    flame_arrestor: "", relieving_capacity: "",
  };
  switch (type) {
    case "Pressure Safety Valve (PSV)":
      return { ...base, design_standard: "API 526", inlet_size: "50 NB", outlet_size: "80 NB",
        pressure_rating: "Class 300", operation_type: "Spring-Loaded", bonnet_type: "Closed Bonnet",
        discharge_type: "To Flare Line", back_pressure_type: "Conventional",
        overpressure: "10%", service_fluid: "Steam" };
    case "Pressure Relief Valve (PRV)":
      return { ...base, design_standard: "API 520", inlet_size: "50 NB", outlet_size: "80 NB",
        pressure_rating: "Class 150", bonnet_type: "Closed Bonnet",
        discharge_type: "Closed Discharge", back_pressure_type: "Conventional",
        overpressure: "10%", service_fluid: "Water" };
    case "Safety Relief Valve (SRV)":
      return { ...base, design_standard: "API 526", inlet_size: "50 NB", outlet_size: "80 NB",
        pressure_rating: "Class 150", operation_type: "Spring-Loaded",
        service_phase: "Gas / Vapour", bonnet_type: "Open Bonnet",
        discharge_type: "Open Discharge", back_pressure_type: "Conventional", overpressure: "10%" };
    case "Vacuum Relief Valve (VRV)":
      return { ...base, design_standard: "API 2000", body_material: "CS",
        connection_size: "50 NB", service_fluid: "Air" };
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
  const [makeSearch, setMakeSearch] = useState("");
  const [makes, setMakes] = useState<string[]>(() => {
    const m = attrs.makes;
    return Array.isArray(m) ? (m as string[]) : [];
  });

  function handleTypeChange(type: string) {
    const defaults = buildSafetyValveDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(SAFETY_ALL_FIELD_OPTS)) {
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); setMakes([]); onChange({ ...defaults, makes: [] });
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

  function renderField(key: string, label: string, opts: string[], required?: boolean) {
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

  function renderText(key: string, label: string, placeholder: string, required?: boolean) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <Input className="h-8 text-sm" placeholder={placeholder}
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
    if (!make.trim() || makes.includes(make.trim())) return;
    const next = [...makes, make.trim()];
    setMakes(next); onChange({ ...attrs, makes: next }); setMakeSearch("");
  }
  function removeMake(m: string) {
    const next = makes.filter((x) => x !== m);
    setMakes(next); onChange({ ...attrs, makes: next });
  }
  function moveMake(i: number, dir: -1 | 1) {
    const next = [...makes]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setMakes(next); onChange({ ...attrs, makes: next });
  }

  const valveType     = (attrs.valve_type as string) ?? "";
  const isPSV         = valveType === "Pressure Safety Valve (PSV)";
  const isPRV         = valveType === "Pressure Relief Valve (PRV)";
  const isSRV         = valveType === "Safety Relief Valve (SRV)";
  const isVRV         = valveType === "Vacuum Relief Valve (VRV)";
  const isBV          = valveType === "Breather Valve (Conservation Vent)";
  const hasType       = isPSV || isPRV || isSRV || isVRV || isBV;
  const isSpringBased = isPSV || isPRV || isSRV;

  const filteredMakes = SAFETY_VALVE_MAKES.filter(
    (m) => m.toLowerCase().includes(makeSearch.toLowerCase()) && !makes.includes(m)
  );

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Safety / Relief Valve Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {sec("Valve Type")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Safety Valve Type <span className="text-red-500">*</span></Label>
          <SearchableSelect
            value={SAFETY_VALVE_TYPES.includes(valveType) ? valveType : ""}
            options={SAFETY_VALVE_TYPES} placeholder="Select valve type first…"
            onSelect={(v) => handleTypeChange(v)}
          />
        </div>

        {!hasType && (
          <div className="col-span-2 rounded-md border border-dashed bg-muted/20 py-6 text-center text-xs text-muted-foreground">
            Select a valve type above to configure specifications
          </div>
        )}

        {isSpringBased && (<>
          {sec("Size & Pressure Rating")}
          {renderField("inlet_size",      "Inlet Size (NB)",  SAFETY_COMMON_OPTS.inlet_outlet_size, true)}
          {renderField("outlet_size",     "Outlet Size (NB)", SAFETY_COMMON_OPTS.inlet_outlet_size, true)}
          <div className="col-span-2">{renderField("pressure_rating","Pressure Rating",SAFETY_COMMON_OPTS.pressure_rating, true)}</div>
          {sec("Pressure Settings")}
          <div className="col-span-2">{renderText("set_pressure", "Set Pressure", "e.g. 10 barg", true)}</div>
          {renderField("overpressure",       "Overpressure (%)",    SAFETY_COMMON_OPTS.overpressure)}
          {renderText( "relieving_capacity", "Relieving Capacity",  "e.g. 500 kg/h")}
        </>)}

        {isPSV && (<>
          {sec("PSV Configuration")}
          {renderField("operation_type",    "Operation Type",    SAFETY_COMMON_OPTS.operation_type,    true)}
          {renderField("api_orifice",       "API Orifice",       API_ORIFICE_OPTS,                     true)}
          {renderField("bonnet_type",       "Bonnet Type",       SAFETY_COMMON_OPTS.bonnet_type,       true)}
          {renderField("discharge_type",    "Discharge Type",    SAFETY_COMMON_OPTS.discharge_type,    true)}
          {renderField("back_pressure_type","Back Pressure Type",SAFETY_COMMON_OPTS.back_pressure_type)}
          <div />
        </>)}

        {isPRV && (<>
          {sec("PRV Configuration")}
          {renderField("discharge_type",    "Discharge Type",    SAFETY_COMMON_OPTS.discharge_type,    true)}
          {renderField("bonnet_type",       "Bonnet Type",       SAFETY_COMMON_OPTS.bonnet_type)}
          {renderField("api_orifice",       "API Orifice",       API_ORIFICE_OPTS)}
          {renderField("back_pressure_type","Back Pressure Type",SAFETY_COMMON_OPTS.back_pressure_type)}
        </>)}

        {isSRV && (<>
          {sec("SRV Configuration")}
          {renderField("operation_type",    "Operation Type",    SAFETY_COMMON_OPTS.operation_type,    true)}
          {renderField("api_orifice",       "API Orifice",       API_ORIFICE_OPTS,                     true)}
          {renderField("service_phase",     "Service Phase",     SAFETY_COMMON_OPTS.service_phase,     true)}
          {renderField("bonnet_type",       "Bonnet Type",       SAFETY_COMMON_OPTS.bonnet_type,       true)}
          {renderField("discharge_type",    "Discharge Type",    SAFETY_COMMON_OPTS.discharge_type,    true)}
          {renderField("back_pressure_type","Back Pressure Type",SAFETY_COMMON_OPTS.back_pressure_type)}
        </>)}

        {isSpringBased && (<>
          {sec("Service Conditions (Optional)")}
          {renderField("service_fluid",  "Service Fluid",
            isPRV ? SAFETY_COMMON_OPTS.service_fluid_prv : SAFETY_COMMON_OPTS.service_fluid_psv)}
          {renderText( "operating_temp", "Operating Temperature", "e.g. 150°C")}
          {sec("Material & Connection")}
          {renderField("body_material",  "Body Material",  SAFETY_COMMON_OPTS.body_material,  true)}
          {renderField("trim_material",  "Trim Material",  SAFETY_COMMON_OPTS.trim_material)}
          {renderField("end_connection", "End Connection", SAFETY_COMMON_OPTS.end_connection, true)}
          <div />
          {sec("Standard & Certification")}
          {renderField("design_standard","Design Standard", SAFETY_COMMON_OPTS.design_std_psv, true)}
          {renderField("certification",  "Certification",  SAFETY_COMMON_OPTS.certification)}
        </>)}

        {isVRV && (<>
          {sec("VRV Configuration")}
          {renderField("connection_size","Connection Size (NB)", SAFETY_COMMON_OPTS.connection_size,  true)}
          {renderText( "set_vacuum",     "Set Vacuum (mbar)",    "e.g. 10 mbar",                      true)}
          {renderText( "flow_capacity",  "Flow Capacity (m³/h)", "e.g. 200 m³/h")}
          {renderText( "reseal_pressure","Re-seal Pressure (mbar)", "e.g. 5 mbar")}
          {renderField("service_fluid",  "Service Fluid",        SAFETY_COMMON_OPTS.service_fluid_tank)}
          {renderText( "operating_temp", "Operating Temperature","e.g. 65°C")}
          {renderField("body_material",  "Body Material",        SAFETY_COMMON_OPTS.body_material)}
          {renderField("end_connection", "End Connection",       SAFETY_COMMON_OPTS.end_connection)}
          {renderField("certification",  "Certification",        SAFETY_COMMON_OPTS.certification)}
          <div />
          {sec("Standard")}
          {renderField("design_standard","Design Standard",      SAFETY_COMMON_OPTS.design_std_tank,  true)}
          <div />
        </>)}

        {isBV && (<>
          {sec("Breather Valve Configuration")}
          {renderField("connection_size",       "Connection Size (NB)",    SAFETY_COMMON_OPTS.connection_size,  true)}
          {renderText( "pressure_setting_mbar", "Pressure Setting (mbar)", "e.g. 14 mbar",                      true)}
          {renderText( "vacuum_setting_mbar",   "Vacuum Setting (mbar)",   "e.g. 3.5 mbar",                     true)}
          {renderField("flame_arrestor",        "Flame Arrestor",          SAFETY_COMMON_OPTS.flame_arrestor,   true)}
          {renderText( "flow_capacity",         "Flow Capacity (m³/h)",    "e.g. 500 m³/h")}
          {renderField("service_fluid",         "Service Fluid",           SAFETY_COMMON_OPTS.service_fluid_tank)}
          {renderText( "operating_temp",        "Operating Temperature",   "e.g. 60°C")}
          {renderField("body_material",         "Body Material",           SAFETY_COMMON_OPTS.body_material_bv)}
          {renderField("end_connection",        "End Connection",          SAFETY_COMMON_OPTS.end_conn_bv)}
          {renderField("certification",         "Certification",           SAFETY_COMMON_OPTS.certification)}
          {sec("Standard")}
          {renderField("design_standard","Design Standard", SAFETY_COMMON_OPTS.design_std_tank, true)}
          <div />
        </>)}

        {hasType && (<>
          <div className="col-span-2 mt-1 pb-0.5 border-b">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Approved Makes (ranked)</p>
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Search or type make…" value={makeSearch}
                onChange={(e) => setMakeSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && makeSearch.trim()) addMake(makeSearch.trim()); }} />
              <Button type="button" size="sm" className="h-8"
                onClick={() => { if (makeSearch.trim()) addMake(makeSearch.trim()); }}>Add</Button>
            </div>
            {makeSearch && filteredMakes.length > 0 && (
              <div className="rounded-md border bg-background shadow-sm max-h-32 overflow-y-auto">
                {filteredMakes.map((m) => (
                  <button key={m} type="button"
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted"
                    onClick={() => addMake(m)}>{m}</button>
                ))}
              </div>
            )}
            {makes.length > 0 && (
              <div className="space-y-1">
                {makes.map((m, i) => (
                  <div key={m} className="flex items-center gap-2 rounded-md border px-2 py-1 bg-background">
                    <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}.</span>
                    <span className="flex-1 text-xs">{m}</span>
                    <button type="button" onClick={() => moveMake(i, -1)} disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronUp className="h-3 w-3" /></button>
                    <button type="button" onClick={() => moveMake(i, 1)} disabled={i === makes.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronDown className="h-3 w-3" /></button>
                    <button type="button" onClick={() => removeMake(m)}
                      className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}

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
// ON/OFF VALVE
// ─────────────────────────────────────────────────────────────────────────────
const OO_VALVE_TYPES = [
  "Ball Valve","Gate Valve","Globe Valve","Butterfly Valve","Plug Valve","Diaphragm Valve",
];

const OO_COMMON_OPTS = {
  size_nb:             ["15 NB","25 NB","40 NB","50 NB","65 NB","80 NB","100 NB","150 NB","200 NB","250 NB","300 NB","350 NB","400 NB","450 NB","500 NB","600 NB"],
  pressure_rating_std: ["Class 150","Class 300","Class 600","Class 900","Class 1500"],
  pressure_rating_pn:  ["PN6","PN10","PN16","PN25","PN40"],
  actuation_type:      ["Manual Lever","Manual Handwheel","Manual Gear","Pneumatic Actuator","Electric Actuator","Hydraulic Actuator"],
  fail_action:         ["Fail Open (FO)","Fail Close (FC)","Fail Last (FL)"],
  end_connection:      ["Flanged","Threaded","Butt Weld","Socket Weld","Wafer","Lug Type"],
  body_material:       ["WCB (CS)","LCB (Low Temp CS)","SS304","SS316","Alloy Steel (WC6)","Duplex SS","CI (Cast Iron)","Ductile Iron","Hastelloy C"],
  service_type:        ["Isolation","On-Off Control","Emergency Shutdown (ESD)","Bypass","General"],
  area_class:          ["Safe Area","Zone 1","Zone 2"],
  certification:       ["ATEX","IECEx","PESO","SIL Rated","Fire Safe (API 607)"],
  yes_no:              ["Yes","No"],
  bore_type:           ["Full Bore","Reduced Bore"],
  body_style:          ["Floating Ball","Trunnion Mounted"],
  seat_material_ball:  ["PTFE","PEEK","Metal Seat (SS316)","Graphite","Devlon"],
  port_config:         ["2-Way","3-Way (L-Port)","3-Way (T-Port)"],
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
};

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

const OO_VALVE_MAKES = [
  "Metso","Emerson (Fisher)","Flowserve (BW Valves)","Velan","Neway (Adler)",
  "KSB","L&T Valves","Crane ChemPharma","AUMA","Rotork",
];

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
  return parts.join(", ");
}

function buildOnOffValveDefaults(type: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    valve_type: type, makes: [],
    size_nb: "", pressure_rating: "", actuation_type: "", fail_action: "",
    end_connection: "Flanged", body_material: "WCB (CS)", service_type: "",
    area_classification: "", certification: "",
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
      return { ...base, pressure_rating: "Class 150", end_connection: "Flanged",
        body_material: "WCB (CS)", actuation_type: "Pneumatic Actuator",
        fail_action: "Fail Close (FC)", bore_type: "Full Bore",
        body_style: "Floating Ball", seat_material: "PTFE",
        port_configuration: "2-Way", fire_safe: "No", anti_static_device: "No" };
    case "Gate Valve":
      return { ...base, pressure_rating: "Class 150", end_connection: "Flanged",
        body_material: "WCB (CS)", actuation_type: "Manual Gear",
        stem_type: "OS&Y (Rising Stem)", wedge_type: "Solid Wedge",
        bonnet_type: "Bolted Bonnet" };
    case "Globe Valve":
      return { ...base, pressure_rating: "Class 150", end_connection: "Flanged",
        body_material: "WCB (CS)", actuation_type: "Manual Handwheel",
        port_type: "Single Port", plug_trim_material: "SS316",
        seat_material_globe: "SS316", bonnet_type_globe: "Standard" };
    case "Butterfly Valve":
      return { ...base, pressure_rating: "PN16", end_connection: "Wafer",
        body_material: "CI (Cast Iron)", actuation_type: "Pneumatic Actuator",
        fail_action: "Fail Close (FC)", valve_design: "Concentric (Centric)",
        disc_material: "SS316", seat_liner: "EPDM" };
    case "Plug Valve":
      return { ...base, pressure_rating: "Class 150", end_connection: "Flanged",
        body_material: "WCB (CS)", actuation_type: "Manual Lever",
        plug_type: "Non-Lubricated (Sleeved)", plug_port_config: "2-Way",
        sleeve_material: "PTFE" };
    case "Diaphragm Valve":
      return { ...base, pressure_rating: "PN10", end_connection: "Flanged",
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
  const [makeSearch, setMakeSearch] = useState("");
  const [makes, setMakes] = useState<string[]>(() => {
    const m = attrs.makes;
    return Array.isArray(m) ? (m as string[]) : [];
  });

  function handleTypeChange(type: string) {
    const defaults = buildOnOffValveDefaults(type);
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(OO_ALL_FIELD_OPTS)) {
      const val = (defaults[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    setCustom(c); setMakes([]); onChange({ ...defaults, makes: [] });
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

  function addMake(make: string) {
    if (!make.trim() || makes.includes(make.trim())) return;
    const next = [...makes, make.trim()];
    setMakes(next); onChange({ ...attrs, makes: next }); setMakeSearch("");
  }
  function removeMake(m: string) {
    const next = makes.filter((x) => x !== m);
    setMakes(next); onChange({ ...attrs, makes: next });
  }
  function moveMake(i: number, dir: -1 | 1) {
    const next = [...makes]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setMakes(next); onChange({ ...attrs, makes: next });
  }

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

  const filteredMakes = OO_VALVE_MAKES.filter(
    (m) => m.toLowerCase().includes(makeSearch.toLowerCase()) && !makes.includes(m)
  );

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ON/OFF Valve Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {sec("Valve Type")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Valve Type <span className="text-red-500">*</span></Label>
          <SearchableSelect
            value={OO_VALVE_TYPES.includes(valveType) ? valveType : ""}
            options={OO_VALVE_TYPES} placeholder="Select valve type first…"
            onSelect={(v) => handleTypeChange(v)}
          />
        </div>

        {!hasType && (
          <div className="col-span-2 rounded-md border border-dashed bg-muted/20 py-6 text-center text-xs text-muted-foreground">
            Select a valve type above to configure specifications
          </div>
        )}

        {hasType && (<>
          {sec("Size & Pressure Rating")}
          {renderField("size_nb",         "Size (NB)",       OO_COMMON_OPTS.size_nb, true)}
          {renderField("pressure_rating", "Pressure Rating",
            isBfly || isDiaphragm ? OO_COMMON_OPTS.pressure_rating_pn : OO_COMMON_OPTS.pressure_rating_std, true)}
        </>)}

        {isBall && (<>
          {sec("Ball Valve Configuration")}
          {renderField("bore_type",          "Bore Type",           OO_COMMON_OPTS.bore_type,         true)}
          {renderField("body_style",         "Body Style",          OO_COMMON_OPTS.body_style,         true)}
          {renderField("seat_material",      "Seat Material",       OO_COMMON_OPTS.seat_material_ball, true)}
          {renderField("port_configuration", "Port Configuration",  OO_COMMON_OPTS.port_config)}
          {renderField("fire_safe",          "Fire Safe",           OO_COMMON_OPTS.yes_no)}
          {renderField("anti_static_device", "Anti-Static Device",  OO_COMMON_OPTS.yes_no)}
          {renderField("stem_seal",          "Stem Seal / Packing", OO_COMMON_OPTS.stem_seal)}
          <div />
        </>)}

        {isGate && (<>
          {sec("Gate Valve Configuration")}
          {renderField("stem_type",     "Stem Type",           OO_COMMON_OPTS.stem_type,     true)}
          {renderField("wedge_type",    "Wedge Type",          OO_COMMON_OPTS.wedge_type,    true)}
          {renderField("bonnet_type",   "Bonnet Type",         OO_COMMON_OPTS.bonnet_type)}
          {renderField("gate_material", "Gate/Wedge Material", OO_COMMON_OPTS.gate_material)}
          {renderField("gate_stem_seal","Stem Seal / Packing", OO_COMMON_OPTS.gate_stem_seal)}
          <div />
        </>)}

        {isGlobe && (<>
          {sec("Globe Valve Configuration")}
          {renderField("port_type",          "Port Type",            OO_COMMON_OPTS.port_type,         true)}
          {renderField("plug_trim_material", "Plug / Trim Material", OO_COMMON_OPTS.plug_trim_mat,     true)}
          {renderField("seat_material_globe","Seat Material",        OO_COMMON_OPTS.seat_mat_globe,    true)}
          {renderField("bonnet_type_globe",  "Bonnet Type",          OO_COMMON_OPTS.bonnet_type_globe)}
          {renderField("flow_direction",     "Flow Direction",       OO_COMMON_OPTS.flow_direction)}
          {renderField("packing",            "Stem Packing",         OO_COMMON_OPTS.packing)}
        </>)}

        {isBfly && (<>
          {sec("Butterfly Valve Configuration")}
          {renderField("valve_design",   "Valve Design",      OO_COMMON_OPTS.valve_design,  true)}
          {renderField("disc_material",  "Disc Material",     OO_COMMON_OPTS.disc_material, true)}
          {renderField("seat_liner",     "Seat Liner",        OO_COMMON_OPTS.seat_liner,    true)}
          {renderField("stem_material",  "Stem Material",     OO_COMMON_OPTS.stem_material)}
          {renderField("face_to_face_std","Face-to-Face Std", OO_COMMON_OPTS.face_to_face)}
          <div />
        </>)}

        {isPlug && (<>
          {sec("Plug Valve Configuration")}
          {renderField("plug_type",       "Plug Type",          OO_COMMON_OPTS.plug_type,       true)}
          {renderField("plug_port_config","Port Configuration", OO_COMMON_OPTS.plug_port_config, true)}
          {isSleeved    ? renderField("sleeve_material",     "Sleeve Material",  OO_COMMON_OPTS.sleeve_material) : <div />}
          {isLubricated ? renderField("anti_static_device", "Injection Fitting",OO_COMMON_OPTS.yes_no) : <div />}
        </>)}

        {isDiaphragm && (<>
          {sec("Diaphragm Valve Configuration")}
          {renderField("diaphragm_material","Diaphragm Material",OO_COMMON_OPTS.diaphragm_material, true)}
          {renderField("body_design",       "Body Design",       OO_COMMON_OPTS.body_design,        true)}
          {renderField("body_lining",       "Body Lining",       OO_COMMON_OPTS.body_lining)}
          <div />
        </>)}

        {hasType && (<>
          {sec("Service (Optional)")}
          {renderField("service_type","Service Type",OO_COMMON_OPTS.service_type)}
          <div />

          {sec("Actuation")}
          {renderField("actuation_type","Actuation Type",OO_COMMON_OPTS.actuation_type, true)}
          {isActuated ? renderField("fail_action","Fail Action",OO_COMMON_OPTS.fail_action, true) : <div />}

          {sec("Connection & Material")}
          {renderField("end_connection","End Connection",OO_COMMON_OPTS.end_connection, true)}
          {renderField("body_material", "Body Material", OO_COMMON_OPTS.body_material,  true)}

          {sec("Hazardous Area (Optional)")}
          {renderField("area_classification","Area Classification",OO_COMMON_OPTS.area_class)}
          {renderField("certification",      "Certification",      OO_COMMON_OPTS.certification)}
        </>)}

        {hasType && (<>
          <div className="col-span-2 mt-1 pb-0.5 border-b">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Approved Makes (ranked)</p>
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex gap-2">
              <Input className="h-8 text-sm flex-1" placeholder="Search or type make…" value={makeSearch}
                onChange={(e) => setMakeSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && makeSearch.trim()) addMake(makeSearch.trim()); }} />
              <Button type="button" size="sm" className="h-8"
                onClick={() => { if (makeSearch.trim()) addMake(makeSearch.trim()); }}>Add</Button>
            </div>
            {makeSearch && filteredMakes.length > 0 && (
              <div className="rounded-md border bg-background shadow-sm max-h-32 overflow-y-auto">
                {filteredMakes.map((m) => (
                  <button key={m} type="button"
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted"
                    onClick={() => addMake(m)}>{m}</button>
                ))}
              </div>
            )}
            {makes.length > 0 && (
              <div className="space-y-1">
                {makes.map((m, i) => (
                  <div key={m} className="flex items-center gap-2 rounded-md border px-2 py-1 bg-background">
                    <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}.</span>
                    <span className="flex-1 text-xs">{m}</span>
                    <button type="button" onClick={() => moveMake(i, -1)} disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronUp className="h-3 w-3" /></button>
                    <button type="button" onClick={() => moveMake(i, 1)} disabled={i === makes.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronDown className="h-3 w-3" /></button>
                    <button type="button" onClick={() => removeMake(m)}
                      className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}

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

export function buildIsolationValveRequirement(attrs: Record<string, unknown>): string {
  const valveType = (attrs.valve_type      as string)?.trim() || "";
  const sizeNb    = (attrs.size_nb         as string)?.trim() || "";
  const rating    = (attrs.pressure_rating as string)?.trim() || "";
  const bodyMat   = (attrs.body_material   as string)?.trim() || "";
  const endConn   = (attrs.end_connection  as string)?.trim() || "";
  const vt        = valveType.toLowerCase();
  const parts: string[] = [];
  if (valveType) parts.push(valveType);
  if (sizeNb)    parts.push(sizeNb);
  if (rating)    parts.push(rating);
  if (bodyMat)   parts.push(`${bodyMat} Body`);
  if (endConn)   parts.push(endConn);
  if (vt.includes("ball")) {
    const bore = (attrs.bore_type     as string)?.trim() || "";
    const seat = (attrs.seat_material as string)?.trim() || "";
    if (bore) parts.push(bore);
    if (seat) parts.push(`${seat} Seat`);
  } else if (vt.includes("gate") && !vt.includes("knife")) {
    const wedge = (attrs.wedge_type    as string)?.trim() || "";
    const trim  = (attrs.trim_material as string)?.trim() || "";
    if (wedge) parts.push(wedge);
    if (trim)  parts.push(`${trim} Trim`);
  } else if (vt.includes("globe")) {
    const disc = (attrs.disc_type      as string)?.trim() || "";
    const trim = (attrs.trim_material  as string)?.trim() || "";
    if (disc) parts.push(disc);
    if (trim) parts.push(`${trim} Trim`);
  } else if (vt.includes("butterfly")) {
    const discMat  = (attrs.disc_material as string)?.trim() || "";
    const seatMat  = (attrs.seat_material as string)?.trim() || "";
    const mounting = (attrs.disc_mounting as string)?.trim() || "";
    if (discMat)  parts.push(`${discMat} Disc`);
    if (seatMat)  parts.push(`${seatMat} Seat`);
    if (mounting) parts.push(mounting);
  } else if (vt.includes("plug")) {
    const port = (attrs.port_pattern as string)?.trim() || "";
    const lube = (attrs.lubrication  as string)?.trim() || "";
    if (port) parts.push(port);
    if (lube) parts.push(lube);
  } else if (vt.includes("knife")) {
    const gate    = (attrs.gate_material as string)?.trim() || "";
    const packing = (attrs.packing_type  as string)?.trim() || "";
    if (gate)    parts.push(`${gate} Gate`);
    if (packing) parts.push(packing);
  } else if (vt.includes("diaphragm")) {
    const diaphMat = (attrs.diaphragm_material as string)?.trim() || "";
    const lining   = (attrs.body_lining        as string)?.trim() || "";
    if (diaphMat) parts.push(`${diaphMat} Diaphragm`);
    if (lining)   parts.push(lining);
  }
  return parts.join(", ");
}

function buildIsolationDefaults(valveType: string, prev: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {
    valve_type:          valveType,
    area_classification: (prev.area_classification as string) || "Safe Area",
    approved_makes:      prev.approved_makes ?? [],
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

  const [makesOpen,      setMakesOpen]      = useState(false);
  const [makesQuery,     setMakesQuery]     = useState("");
  const [showCustomMake, setShowCustomMake] = useState(false);
  const [customMakeVal,  setCustomMakeVal]  = useState("");
  const approvedMakes  = (attrs.approved_makes as string[]) ?? [];
  const filteredMakes  = ISOLATION_VALVE_MAKES.filter(o => o.toLowerCase().includes(makesQuery.toLowerCase()));

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

  const RANK_LABELS_ISO = ["1st","2nd","3rd","4th","5th","6th","7th","8th"];

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Manual Isolation Valve Specifications</p>
      <div className="grid grid-cols-2 gap-3">

        {sectionHeader("Valve Type")}
        <div className="col-span-2">
          <div className="space-y-1.5">
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
        </div>

        {!valveType && (
          <div className="col-span-2 flex items-center justify-center py-8 text-sm text-muted-foreground">
            Select a valve type above to configure specifications.
          </div>
        )}

        {valveType && (<>
          {sectionHeader("Size & Rating")}
          {renderField("size_nb",        "Size (NB)",       ISOLATION_COMMON_OPTS.size_nb,        true)}
          {renderField("pressure_rating","Pressure Rating", ISOLATION_COMMON_OPTS.pressure_rating, true)}
          {sectionHeader("Connection")}
          {renderField("end_connection", "End Connection",  endConnOpts, true)}
          <div />
          {sectionHeader("Body Material")}
          {renderField("body_material",  "Body Material",   ISOLATION_COMMON_OPTS.body_material, true)}
          <div />
        </>)}

        {isBall && (<>
          {sectionHeader("Ball & Seat")}
          {renderField("ball_design",   "Ball Design",   ISOLATION_BALL_OPTS.ball_design,   true)}
          {renderField("bore_type",     "Bore Type",     ISOLATION_BALL_OPTS.bore_type,     true)}
          {renderField("seat_material", "Seat Material", ISOLATION_BALL_OPTS.seat_material, true)}
          {renderField("ball_material", "Ball Material", ISOLATION_BALL_OPTS.ball_material)}
          {renderField("stem_packing",  "Stem Packing",  ISOLATION_BALL_OPTS.stem_packing)}
          {renderField("locking_device","Locking Device",ISOLATION_BALL_OPTS.locking_device)}
        </>)}

        {isGate && (<>
          {sectionHeader("Wedge & Stem")}
          {renderField("wedge_type",    "Wedge Type",    ISOLATION_GATE_OPTS.wedge_type,    true)}
          {renderField("stem_type",     "Stem Type",     ISOLATION_GATE_OPTS.stem_type,     true)}
          {renderField("trim_material", "Trim Material", ISOLATION_GATE_OPTS.trim_material, true)}
          <div />
        </>)}

        {isGlobe && (<>
          {sectionHeader("Disc & Port")}
          {renderField("port_type",     "Port Type",     ISOLATION_GLOBE_OPTS.port_type,     true)}
          {renderField("disc_type",     "Disc Type",     ISOLATION_GLOBE_OPTS.disc_type,     true)}
          {renderField("trim_material", "Trim Material", ISOLATION_GLOBE_OPTS.trim_material, true)}
          {renderField("bonnet_type",   "Bonnet Type",   ISOLATION_GLOBE_OPTS.bonnet_type)}
        </>)}

        {isButterfly && (<>
          {sectionHeader("Disc & Seat")}
          {renderField("disc_material", "Disc Material",          ISOLATION_BUTTERFLY_OPTS.disc_material, true)}
          {renderField("seat_material", "Seat / Liner Material",  ISOLATION_BUTTERFLY_OPTS.seat_material, true)}
          {renderField("disc_mounting", "Disc Mounting",          ISOLATION_BUTTERFLY_OPTS.disc_mounting, true)}
          {renderField("lining_type",   "Lining Type",            ISOLATION_BUTTERFLY_OPTS.lining_type)}
        </>)}

        {isPlug && (<>
          {sectionHeader("Port & Lubrication")}
          {renderField("port_pattern",    "Port Pattern",    ISOLATION_PLUG_OPTS.port_pattern,    true)}
          {renderField("lubrication",     "Lubrication",     ISOLATION_PLUG_OPTS.lubrication,     true)}
          {renderField("plug_material",   "Plug Material",   ISOLATION_PLUG_OPTS.plug_material)}
          {renderField("sleeve_material", "Sleeve Material", ISOLATION_PLUG_OPTS.sleeve_material)}
        </>)}

        {isKnife && (<>
          {sectionHeader("Gate & Packing")}
          {renderField("service_type",   "Service Type",   ISOLATION_KNIFE_OPTS.service_type,   true)}
          {renderField("gate_material",  "Gate Material",  ISOLATION_KNIFE_OPTS.gate_material,  true)}
          {renderField("packing_type",   "Packing Type",   ISOLATION_KNIFE_OPTS.packing_type,   true)}
          {renderField("seat_type",      "Seat Type",      ISOLATION_KNIFE_OPTS.seat_type)}
          {renderField("flow_direction", "Flow Direction", ISOLATION_KNIFE_OPTS.flow_direction)}
        </>)}

        {isDiaphragm && (<>
          {sectionHeader("Diaphragm & Lining")}
          {renderField("diaphragm_material","Diaphragm Material",ISOLATION_DIAPHRAGM_OPTS.diaphragm_material, true)}
          {renderField("body_lining",       "Body Lining",       ISOLATION_DIAPHRAGM_OPTS.body_lining,        true)}
          {renderField("weir_type",         "Weir Type",         ISOLATION_DIAPHRAGM_OPTS.weir_type,          true)}
          <div />
        </>)}

        {valveType && (<>
          {sectionHeader("Area Classification")}
          {renderField("area_classification","Area Classification",ISOLATION_COMMON_OPTS.area_classification)}
          <div />
        </>)}

        {valveType && (<>
          {sectionHeader("Vendor / Approved Makes")}
          <div className="col-span-2 space-y-2">
            <Label className="text-xs">
              Approved Makes <span className="text-[10px] font-normal text-muted-foreground">(ranked — 1st = most preferred)</span>
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
                      {RANK_LABELS_ISO[idx] ?? `${idx + 1}.`}
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
        </>)}

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
