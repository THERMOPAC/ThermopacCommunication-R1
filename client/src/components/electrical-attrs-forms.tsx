import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown, Check } from "lucide-react";

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
// PANEL
// ─────────────────────────────────────────────────────────────────────────────
const PANEL_TYPES = [
  "MCC (Motor Control Centre)", "PLC Panel", "DCS Panel",
  "Starter Panel", "Distribution Board (DB)", "APFC Panel",
  "VFD Panel", "SCADA Panel", "Relay / Protection Panel", "Power Distribution Panel",
];

// MCC-only voltage options (3-phase AC only)
const MCC_VOLTAGE_OPTS = [
  "415V AC (3Ph)", "380V AC (3Ph)", "440V AC (3Ph)", "480V AC (3Ph)", "690V AC (3Ph)",
];

// MCC-specific structured fields
const MCC_SPECIFIC_OPTS = {
  main_bus_rating: [
    "100A", "125A", "160A", "200A", "250A", "315A", "400A", "500A",
    "630A", "800A", "1000A", "1250A", "1600A", "2000A", "2500A", "3200A",
  ],
  fault_level_icw: ["6 kA", "10 kA", "25 kA", "36 kA", "50 kA", "65 kA", "85 kA"],
  incomer_arrangement:    ["Single Incomer", "Dual Incomer", "Dual Incomer with Bus Coupler"],
  incomer_current_rating: [
    "100A", "160A", "250A", "400A", "630A", "800A", "1000A", "1250A", "1600A", "2000A", "2500A", "3200A",
  ],
  incomer_device_type:    ["MCB", "MCCB", "ACB", "Isolator", "Fuse Switch", "Contactor"],
  bus_coupler_rating:     [
    "100A", "160A", "250A", "400A", "630A", "800A", "1000A", "1250A", "1600A", "2000A", "2500A", "3200A",
  ],
  changeover_arrangement: ["Manual", "Semi-Automatic", "Automatic"],
};

const PANEL_OPTS = {
  panel_type:           PANEL_TYPES,
  panel_standard:       ["IEC 61439-1", "IEC 61439-2", "IEC 60439", "IS 8623", "UL 508A"],
  voltage:              ["415V AC (3Ph)", "380V AC (3Ph)", "440V AC (3Ph)", "480V AC (3Ph)", "690V AC (3Ph)", "240V AC (1Ph)", "110V AC (1Ph)", "110V DC", "48V DC", "24V DC"],
  frequency:            ["50 Hz", "60 Hz"],
  bus_rating:           ["100A", "200A", "400A", "630A", "800A", "1000A", "1600A", "2000A"],
  short_circuit_rating: ["10 kA", "25 kA", "36 kA", "50 kA", "65 kA"],
  enclosure_type:       ["Floor Standing", "Wall Mounted", "Desktop", "Rack Mounted"],
  enclosure_material:   ["CRCA Steel", "SS304", "SS316", "Aluminium", "GRP/FRP"],
  ip_rating:            ["IP20", "IP42", "IP54", "IP55", "IP65", "IP66"],
  form_of_separation:   ["Form 2b", "Form 3b", "Form 4b"],
  busbar_material:      ["Copper", "Aluminium", "Copper Tin Plated"],
  interlocking:         ["None", "Electrical Interlocking", "Mechanical Interlocking", "Both"],
  anti_condensation:    ["Yes", "No"],
  aux_power_supply:     ["24V DC", "230V AC", "110V DC", "48V DC"],
  area_classification:  ["Safe Area", "Zone 1", "Zone 2"],
  explosion_protection: ["Ex e (Increased Safety)", "Ex d (Flameproof)", "Ex n (Non-sparking)", "Ex p (Pressurized)", "Ex ia (Intrinsically Safe)"],
  gas_group:            ["IIA", "IIB", "IIC"],
  temperature_class:    ["T1 (450°C)", "T2 (300°C)", "T3 (200°C)", "T4 (135°C)", "T5 (100°C)", "T6 (85°C)"],
  testing_std:          ["IEC 61439-1", "IEC 61439-2", "IEC 60439", "IS 8623", "UL 508A"],
};

// ── Additional panel option constants ─────────────────────────────────────────
const STARTER_TYPE_OPTS   = ["DOL", "Star-Delta", "Soft Starter"];
const DB_VOLTAGE_OPTS     = ["415V AC (3Ph)", "380V AC (3Ph)", "440V AC (3Ph)", "480V AC (3Ph)", "690V AC (3Ph)", "240V AC (1Ph)", "110V AC (1Ph)"];
const AUTO_VOLT_OPTS      = ["415V AC (3Ph)", "380V AC (3Ph)", "240V AC (1Ph)", "110V AC (1Ph)"];
const REL_VOLT_OPTS       = ["415V AC (3Ph)", "240V AC (1Ph)", "110V AC (1Ph)", "110V DC", "48V DC", "24V DC"];
const APFC_KVAR_OPTS      = ["25 kVAr","50 kVAr","75 kVAr","100 kVAr","150 kVAr","200 kVAr","250 kVAr","300 kVAr","400 kVAr","500 kVAr","750 kVAr","1000 kVAr"];
const VFD_KW_OPTS         = ["11 kW","15 kW","22 kW","30 kW","37 kW","45 kW","55 kW","75 kW","90 kW","110 kW","132 kW","160 kW","200 kW","250 kW","315 kW","400 kW","500 kW","630 kW","800 kW","1000 kW"];
const VFD_BYPASS_OPTS     = ["None", "Mechanical Bypass", "Electronic Bypass"];

const PANEL_TYPE_DEFAULTS: Record<string, Record<string, string>> = {
  "MCC (Motor Control Centre)":   { enclosure_type: "Floor Standing", busbar_material: "Copper", ip_rating: "IP54", interlocking: "Electrical Interlocking", incomer_arrangement: "Single Incomer" },
  "Starter Panel":                { enclosure_type: "Floor Standing", busbar_material: "Copper", ip_rating: "IP54" },
  "Distribution Board (DB)":      { enclosure_type: "Wall Mounted", ip_rating: "IP42" },
  "Power Distribution Panel":     { enclosure_type: "Floor Standing", busbar_material: "Copper", ip_rating: "IP54" },
  "PLC Panel":                    { enclosure_type: "Floor Standing", ip_rating: "IP54", aux_power_supply: "24V DC" },
  "DCS Panel":                    { enclosure_type: "Floor Standing", ip_rating: "IP54", aux_power_supply: "24V DC" },
  "SCADA Panel":                  { enclosure_type: "Floor Standing", ip_rating: "IP54" },
  "Relay / Protection Panel":     { enclosure_type: "Floor Standing", ip_rating: "IP54" },
  "APFC Panel":                   { enclosure_type: "Floor Standing", busbar_material: "Copper", ip_rating: "IP54" },
  "VFD Panel":                    { enclosure_type: "Floor Standing", ip_rating: "IP54", bypass_arrangement: "None" },
};

// ── MCC preview maps (client-side — mirrors server buildMccPanelItemCode) ────
const _MCC_VOLT_MAP: Record<string, string> = {
  "415V AC (3Ph)": "415V", "380V AC (3Ph)": "380V", "440V AC (3Ph)": "440V",
  "480V AC (3Ph)": "480V", "690V AC (3Ph)": "690V",
};
const _MCC_ICW_MAP: Record<string, string> = {
  "6 kA":"6KA","10 kA":"10KA","25 kA":"25KA","36 kA":"36KA",
  "50 kA":"50KA","65 kA":"65KA","85 kA":"85KA",
};
const _MCC_MAT_MAP: Record<string, string> = {
  "CRCA Steel":"CRCA","SS304":"SS304","SS316":"SS316","Aluminium":"ALU","GRP/FRP":"GRP",
};
const _MCC_EXP_MAP: Record<string, string> = {
  "Ex e (Increased Safety)":"EXE","Ex d (Flameproof)":"EXD",
  "Ex n (Non-sparking)":"EXN","Ex p (Pressurized)":"EXP",
  "Ex ia (Intrinsically Safe)":"EXIA",
};
const _MCC_IP_SET  = new Set(["IP20","IP42","IP54","IP55","IP65","IP66"]);
const _MCC_BUS_SET = new Set(MCC_SPECIFIC_OPTS.main_bus_rating);

export function buildMccPanelPreviewCode(attrs: Record<string, unknown>): string | null {
  try {
    const volt  = _MCC_VOLT_MAP[((attrs.voltage           as string) ?? "").trim()];
    const bus   = _MCC_BUS_SET.has(((attrs.main_bus_rating as string) ?? "").trim())
                    ? ((attrs.main_bus_rating as string) ?? "").trim() : undefined;
    const icw   = _MCC_ICW_MAP[((attrs.fault_level_icw    as string) ?? "").trim()];
    const ip    = _MCC_IP_SET.has(((attrs.ip_rating        as string) ?? "").trim())
                    ? ((attrs.ip_rating as string) ?? "").trim() : undefined;
    const mat   = _MCC_MAT_MAP[((attrs.enclosure_material  as string) ?? "").trim()];
    const area  = ((attrs.area_classification as string) ?? "").trim();
    if (!volt || !bus || !icw || !ip || !mat || !area) return null;
    const isHaz = area === "Zone 1" || area === "Zone 2";
    if (isHaz) {
      const exp = _MCC_EXP_MAP[((attrs.explosion_protection as string) ?? "").trim()];
      const gas = ((attrs.gas_group as string) ?? "").trim();
      const tmp = ((attrs.temperature_class as string) ?? "").trim().split(" ")[0];
      if (!exp || !["IIA","IIB","IIC"].includes(gas) || !/^T[1-6]$/.test(tmp)) return null;
      const zone = area === "Zone 1" ? "Z1" : "Z2";
      const code = `PNL-MCC-${volt}-${bus}-${icw}-${ip}-${mat}-${zone}-${exp}-${gas}-${tmp}`;
      return code.length <= 50 ? code : null;
    }
    if (area !== "Safe Area") return null;
    return `PNL-MCC-${volt}-${bus}-${icw}-${ip}-${mat}-SA`;
  } catch { return null; }
}

// ── Shared client-side preview maps (mirrors server non-MCC panel builders) ──
const _P_VOLT3: Record<string, string> = {
  "415V AC (3Ph)": "415V", "380V AC (3Ph)": "380V", "440V AC (3Ph)": "440V",
  "480V AC (3Ph)": "480V", "690V AC (3Ph)": "690V",
};
const _P_VOLT_ALL: Record<string, string> = {
  ..._P_VOLT3,
  "240V AC (1Ph)": "240V", "110V AC (1Ph)": "110V",
  "110V DC": "110VDC", "48V DC": "48VDC", "24V DC": "24VDC",
};
const _P_ICW: Record<string, string> = {
  "6 kA":"6KA","10 kA":"10KA","25 kA":"25KA","36 kA":"36KA",
  "50 kA":"50KA","65 kA":"65KA","85 kA":"85KA",
};
const _P_MAT: Record<string, string> = {
  "CRCA Steel":"CRCA","SS304":"SS304","SS316":"SS316","Aluminium":"ALU","GRP/FRP":"GRP",
};
const _P_EXP: Record<string, string> = {
  "Ex e (Increased Safety)":"EXE","Ex d (Flameproof)":"EXD",
  "Ex n (Non-sparking)":"EXN","Ex p (Pressurized)":"EXP",
  "Ex ia (Intrinsically Safe)":"EXIA",
};
const _P_IP  = new Set(["IP20","IP42","IP54","IP55","IP65","IP66"]);
const _P_BUS = new Set(["100A","125A","160A","200A","250A","315A","400A","500A","630A","800A","1000A","1250A","1600A","2000A","2500A","3200A"]);
const _P_ENC: Record<string, string> = { "Floor Standing":"FS","Wall Mounted":"WM","Desktop":"DSK","Rack Mounted":"RM" };
const _P_STR: Record<string, string> = { "DOL":"DOL","Star-Delta":"SD","Soft Starter":"SS" };
const _P_BYP: Record<string, string> = { "None":"NBY","Mechanical Bypass":"MBY","Electronic Bypass":"EBY" };
const _P_VFD = new Set(["11","15","22","30","37","45","55","75","90","110","132","160","200","250","315","400","500","630","800","1000"]);
const _P_KV  = new Set(["25","50","75","100","150","200","250","300","400","500","750","1000"]);

function _areaPreview(a: Record<string, unknown>): string | null {
  const area = ((a.area_classification as string) ?? "").trim();
  if (area === "Safe Area") return "SA";
  if (area !== "Zone 1" && area !== "Zone 2") return null;
  const exp = _P_EXP[((a.explosion_protection as string) ?? "").trim()];
  const gas = ((a.gas_group as string) ?? "").trim();
  const tmp = ((a.temperature_class as string) ?? "").trim().split(" ")[0];
  if (!exp || !["IIA","IIB","IIC"].includes(gas) || !/^T[1-6]$/.test(tmp)) return null;
  return `${area === "Zone 1" ? "Z1" : "Z2"}-${exp}-${gas}-${tmp}`;
}
function _g(a: Record<string, unknown>, k: string): string { return ((a[k] as string) ?? "").trim(); }

/** Returns the complete SAP Item Code preview for any spec-based panel type, or null if incomplete. */
export function buildPanelPreviewCode(attrs: Record<string, unknown>): string | null {
  try {
    const pt = _g(attrs, "panel_type");
    const ar = _areaPreview(attrs);
    if (!ar) return null;
    if (pt === "MCC (Motor Control Centre)") return buildMccPanelPreviewCode(attrs);
    if (pt === "Starter Panel") {
      const str = _P_STR[_g(attrs,"starter_type")];
      const v   = _P_VOLT3[_g(attrs,"voltage")];
      const i   = _P_ICW[_g(attrs,"fault_level_icw")];
      const p   = _P_IP.has(_g(attrs,"ip_rating")) ? _g(attrs,"ip_rating") : undefined;
      const m   = _P_MAT[_g(attrs,"enclosure_material")];
      if (!str||!v||!i||!p||!m) return null;
      const c = `PNL-STR-${str}-${v}-${i}-${p}-${m}-${ar}`; return c.length<=50?c:null;
    }
    if (pt === "Distribution Board (DB)") {
      const v = _P_VOLT_ALL[_g(attrs,"voltage")];
      const b = _P_BUS.has(_g(attrs,"main_bus_rating")) ? _g(attrs,"main_bus_rating") : undefined;
      const i = _P_ICW[_g(attrs,"fault_level_icw")];
      const p = _P_IP.has(_g(attrs,"ip_rating")) ? _g(attrs,"ip_rating") : undefined;
      const m = _P_MAT[_g(attrs,"enclosure_material")];
      if (!v||!b||!i||!p||!m) return null;
      const c = `PNL-DB-${v}-${b}-${i}-${p}-${m}-${ar}`; return c.length<=50?c:null;
    }
    if (pt === "Power Distribution Panel") {
      const v = _P_VOLT3[_g(attrs,"voltage")];
      const b = _P_BUS.has(_g(attrs,"main_bus_rating")) ? _g(attrs,"main_bus_rating") : undefined;
      const i = _P_ICW[_g(attrs,"fault_level_icw")];
      const p = _P_IP.has(_g(attrs,"ip_rating")) ? _g(attrs,"ip_rating") : undefined;
      const m = _P_MAT[_g(attrs,"enclosure_material")];
      if (!v||!b||!i||!p||!m) return null;
      const c = `PNL-PDP-${v}-${b}-${i}-${p}-${m}-${ar}`; return c.length<=50?c:null;
    }
    const autoTypes: Record<string,string> = { "PLC Panel":"PLC","DCS Panel":"DCS","SCADA Panel":"SCADA","Relay / Protection Panel":"REL" };
    if (autoTypes[pt]) {
      const tc = autoTypes[pt];
      const v  = _P_VOLT_ALL[_g(attrs,"voltage")];
      const p  = _P_IP.has(_g(attrs,"ip_rating")) ? _g(attrs,"ip_rating") : undefined;
      const e  = _P_ENC[_g(attrs,"enclosure_type")];
      const m  = _P_MAT[_g(attrs,"enclosure_material")];
      if (!v||!p||!e||!m) return null;
      const c = `PNL-${tc}-${v}-${p}-${e}-${m}-${ar}`; return c.length<=50?c:null;
    }
    if (pt === "APFC Panel") {
      const v    = _P_VOLT3[_g(attrs,"voltage")];
      const kNum = _g(attrs,"kvar_rating").split(" ")[0];
      const kv   = _P_KV.has(kNum) ? `${kNum}KVAR` : undefined;
      const p    = _P_IP.has(_g(attrs,"ip_rating")) ? _g(attrs,"ip_rating") : undefined;
      const m    = _P_MAT[_g(attrs,"enclosure_material")];
      if (!v||!kv||!p||!m) return null;
      const c = `PNL-APFC-${v}-${kv}-${p}-${m}-${ar}`; return c.length<=50?c:null;
    }
    if (pt === "VFD Panel") {
      const v    = _P_VOLT3[_g(attrs,"voltage")];
      const dNum = _g(attrs,"drive_power_kw").split(" ")[0];
      const drv  = _P_VFD.has(dNum) ? `${dNum}KW` : undefined;
      const p    = _P_IP.has(_g(attrs,"ip_rating")) ? _g(attrs,"ip_rating") : undefined;
      const m    = _P_MAT[_g(attrs,"enclosure_material")];
      const byp  = _P_BYP[_g(attrs,"bypass_arrangement")];
      if (!v||!drv||!p||!m||!byp) return null;
      const c = `PNL-VFD-${v}-${drv}-${p}-${m}-${byp}-${ar}`; return c.length<=50?c:null;
    }
  } catch { return null; }
  return null;
}

function resolveProjectVoltage(projectVoltage?: string): string {
  if (!projectVoltage) return "";
  const num = String(projectVoltage).trim();
  return PANEL_OPTS.voltage.find((v) => v.startsWith(num + "V")) ?? "";
}

function resolveProjectFrequency(projectFrequency?: string): string {
  if (!projectFrequency) return "";
  const num = String(projectFrequency).trim();
  return PANEL_OPTS.frequency.find((f) => f.startsWith(num + " ")) ?? "";
}

export function buildPanelDefaults(
  panelType: string,
  projectVoltage?: string,
  projectFrequency?: string,
): Record<string, unknown> {
  const typeDefaults = PANEL_TYPE_DEFAULTS[panelType] ?? {};
  const volt  = resolveProjectVoltage(projectVoltage);
  const freq  = resolveProjectFrequency(projectFrequency);
  return { ...typeDefaults, ...(volt  ? { voltage:   volt  } : {}), ...(freq  ? { frequency: freq  } : {}) };
}

export function applyPanelTypeDefaults(
  existing: Record<string, unknown>,
  panelType: string,
  projectVoltage?: string,
  projectFrequency?: string,
): Record<string, unknown> {
  const defaults = buildPanelDefaults(panelType, projectVoltage, projectFrequency);
  const result = { ...existing };
  for (const [key, val] of Object.entries(defaults)) {
    const cur = result[key];
    if (cur === undefined || cur === null || (typeof cur === "string" && !cur.trim())) {
      result[key] = val;
    }
  }
  return result;
}

export function buildPanelRequirement(attrs: Record<string, unknown>): string {
  const r = (k: string) => ((attrs[k] as string) ?? "").trim();
  const panelType  = r("panel_type");
  const voltage    = r("voltage");
  const busRating  = (r("main_bus_rating") || r("bus_rating"));
  const icw        = (r("fault_level_icw") || r("short_circuit_rating"));
  const ipRating   = r("ip_rating");
  const encType    = r("enclosure_type");
  const encMat     = r("enclosure_material");
  const areaClass  = r("area_classification");
  const expProt    = r("explosion_protection");
  const gasGroup   = r("gas_group");
  const tempClass  = r("temperature_class");
  const expShort   = expProt ? expProt.replace(/\s*\(.*?\)/, "") : "";
  const tmpShort   = tempClass ? tempClass.split(" ")[0] : "";
  const isHaz      = areaClass === "Zone 1" || areaClass === "Zone 2";
  const hazSuffix  = isHaz && expShort && gasGroup && tmpShort ? `, ${expShort}, ${gasGroup}, ${tmpShort}` : "";

  const SPEC_TYPES = new Set(["MCC (Motor Control Centre)","Starter Panel","Distribution Board (DB)","Power Distribution Panel","PLC Panel","DCS Panel","SCADA Panel","Relay / Protection Panel","APFC Panel","VFD Panel"]);

  if (SPEC_TYPES.has(panelType)) {
    // All spec types use compact Level-A format to stay within 100 chars
    const base: string[] = [];
    if (panelType === "MCC (Motor Control Centre)") {
      base.push("MCC");
      if (voltage)   base.push(voltage);
      if (busRating) base.push(`${busRating} Bus`);
      if (icw)       base.push(`${icw} Icw`);
      if (ipRating)  base.push(ipRating);
      if (encMat)    base.push(encMat);
      if (areaClass) base.push(areaClass);
    } else if (panelType === "Starter Panel") {
      base.push("Starter Panel");
      if (r("starter_type")) base.push(r("starter_type"));
      if (voltage)   base.push(voltage);
      if (icw)       base.push(`${icw} Icw`);
      if (ipRating)  base.push(ipRating);
      if (encMat)    base.push(encMat);
      if (areaClass) base.push(areaClass);
    } else if (panelType === "Distribution Board (DB)") {
      base.push("DB");
      if (voltage)   base.push(voltage);
      if (busRating) base.push(`${busRating} Bus`);
      if (icw)       base.push(`${icw} Icw`);
      if (ipRating)  base.push(ipRating);
      if (encMat)    base.push(encMat);
      if (areaClass) base.push(areaClass);
    } else if (panelType === "Power Distribution Panel") {
      base.push("PDP");
      if (voltage)   base.push(voltage);
      if (busRating) base.push(`${busRating} Bus`);
      if (icw)       base.push(`${icw} Icw`);
      if (ipRating)  base.push(ipRating);
      if (encMat)    base.push(encMat);
      if (areaClass) base.push(areaClass);
    } else if (["PLC Panel","DCS Panel","SCADA Panel"].includes(panelType)) {
      base.push(panelType.replace(" Panel",""));
      if (voltage)  base.push(voltage);
      if (ipRating) base.push(ipRating);
      if (encType)  base.push(encType);
      if (encMat)   base.push(encMat);
      if (areaClass) base.push(areaClass);
    } else if (panelType === "Relay / Protection Panel") {
      base.push("Relay Panel");
      if (voltage)  base.push(voltage);
      if (ipRating) base.push(ipRating);
      if (encType)  base.push(encType);
      if (encMat)   base.push(encMat);
      if (areaClass) base.push(areaClass);
    } else if (panelType === "APFC Panel") {
      base.push("APFC Panel");
      if (voltage)          base.push(voltage);
      if (r("kvar_rating")) base.push(r("kvar_rating"));
      if (ipRating)         base.push(ipRating);
      if (encMat)           base.push(encMat);
      if (areaClass)        base.push(areaClass);
    } else if (panelType === "VFD Panel") {
      const driveKw = r("drive_power_kw");
      const bypLabel = r("bypass_arrangement") === "Mechanical Bypass" ? "Mech. Bypass"
                     : r("bypass_arrangement") === "Electronic Bypass" ? "Elec. Bypass" : "No Bypass";
      base.push("VFD Panel");
      if (voltage)  base.push(voltage);
      if (driveKw)  base.push(`${driveKw} Drive`);
      if (r("bypass_arrangement")) base.push(bypLabel);
      if (ipRating) base.push(ipRating);
      if (encMat)   base.push(encMat);
      if (areaClass) base.push(areaClass);
    }
    return base.join(", ") + hazSuffix;
  }

  // ── Generic non-spec panel types: full description ───────────────────────────
  const incoArr    = r("incomer_arrangement");
  const incoRating = r("incomer_current_rating");
  const incoDevice = r("incomer_device_type");
  const numFeeders = r("num_feeders");
  const parts: string[] = [];
  if (panelType)  parts.push(panelType);
  if (voltage)    parts.push(voltage);
  if (busRating)  parts.push(`${busRating} Bus`);
  if (icw)        parts.push(`${icw} Icw`);
  if (ipRating)   parts.push(ipRating);
  if (encType)    parts.push(encType);
  if (encMat)     parts.push(encMat);
  if (incoArr)    parts.push(incoArr);
  if (incoRating && incoDevice) parts.push(`${incoRating} ${incoDevice}`);
  else if (incoRating)          parts.push(incoRating);
  else if (incoDevice)          parts.push(incoDevice);
  if (numFeeders) parts.push(`${numFeeders} Feeders`);
  if (areaClass)  parts.push(areaClass);
  if (expProt && gasGroup && tempClass) parts.push(`${expProt}, ${gasGroup}, ${tempClass}`);
  return parts.join(", ");
}

export function PanelAttrsForm({
  attrs, qty, onChange, onQtyChange, projectVoltage, projectFrequency,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
  projectVoltage?: string;
  projectFrequency?: string;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const resolvedProjVolt = resolveProjectVoltage(projectVoltage);
  const resolvedProjFreq = resolveProjectFrequency(projectFrequency);

  const allDropdownKeys = [
    ...Object.keys(PANEL_OPTS),
    ...Object.keys(MCC_SPECIFIC_OPTS),
  ];
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of allDropdownKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = (PANEL_OPTS as Record<string, string[]>)[key]
               ?? (MCC_SPECIFIC_OPTS as Record<string, string[]>)[key]
               ?? [];
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

  // Area change for MCC: clear hazardous fields when Safe Area is selected
  function handleAreaChange(val: string) {
    if (val === "Safe Area") {
      const next = { ...attrs };
      delete next.explosion_protection;
      delete next.gas_group;
      delete next.temperature_class;
      setCustom((c) => ({ ...c, area_classification: false, explosion_protection: false, gas_group: false, temperature_class: false }));
      onChange({ ...next, area_classification: "Safe Area" });
    } else {
      handleSelect("area_classification", val);
    }
  }

  function handleTypeSelect(panelType: string) {
    if (panelType === "__other__") {
      setCustom((c) => ({ ...c, panel_type: true }));
      onChange({ ...attrs, panel_type: "" });
      return;
    }
    setCustom((c) => ({ ...c, panel_type: false }));
    const updated = applyPanelTypeDefaults({ ...attrs, panel_type: panelType }, panelType, projectVoltage, projectFrequency);
    onChange(updated);
  }

  function renderField(
    key: string,
    label: string,
    opts: string[],
    required?: boolean,
    projDefault?: string,
    wrapClass?: string,
  ) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    const fromProj  = !!projDefault && curVal === projDefault;
    return (
      <div className={`space-y-1.5 ${wrapClass ?? ""}`}>
        <Label className="text-xs flex items-center gap-1.5">
          {label}{required && <span className="text-red-500">*</span>}
          {fromProj && (
            <span className="text-[9px] font-normal text-sky-600 bg-sky-50 border border-sky-200 px-1 py-px rounded leading-none">
              project
            </span>
          )}
        </Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal}
            onChange={(e) => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function renderText(key: string, label: string, placeholder?: string) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <Input className="h-8 text-sm" placeholder={placeholder ?? `Enter ${label.toLowerCase()}…`}
          value={(attrs[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} />
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

  const panelType   = (attrs.panel_type          as string) ?? "";
  const areaClass   = (attrs.area_classification as string) ?? "";
  const incoArr     = (attrs.incomer_arrangement as string) ?? "";
  const isHazardous = areaClass === "Zone 1" || areaClass === "Zone 2";
  // Panel family helpers
  const isMcc       = panelType === "MCC (Motor Control Centre)";
  const isStarter   = panelType === "Starter Panel";
  const isDb        = panelType === "Distribution Board (DB)";
  const isPdp       = panelType === "Power Distribution Panel";
  const isPowerBus  = isDb || isPdp;           // DB and PDP: bus+ICW, simpler incomer
  const isAutoType  = ["PLC Panel","DCS Panel","SCADA Panel","Relay / Protection Panel"].includes(panelType);
  const isRel       = panelType === "Relay / Protection Panel";
  const isApfc      = panelType === "APFC Panel";
  const isVfd       = panelType === "VFD Panel";
  const isSpecType  = isMcc || isStarter || isPowerBus || isAutoType || isApfc || isVfd;
  const hasBusBars  = isMcc || isStarter || isPowerBus;
  const ptIsCustom  = custom.panel_type ?? false;
  const ptSelectVal = ptIsCustom ? "__other__" : (PANEL_OPTS.panel_type.includes(panelType) ? panelType : "");

  return (
    <div className="space-y-3">

      {/* 1 — Panel Identity */}
      <SectionCard title="Panel Identity" color="bg-sky-50/60 border-sky-200">
        <div className="col-span-3 md:col-span-5 space-y-1.5">
          <Label className="text-xs">Panel Type <span className="text-red-500">*</span></Label>
          <SearchableSelect value={ptSelectVal} options={PANEL_OPTS.panel_type}
            placeholder="Select panel type…" onSelect={handleTypeSelect} />
          {ptIsCustom && (
            <Input className="h-8 text-sm" placeholder="Enter custom panel type…" value={panelType}
              onChange={(e) => onChange({ ...attrs, panel_type: e.target.value })} autoFocus />
          )}
        </div>
        {renderField("panel_standard", "Design Standard", PANEL_OPTS.panel_standard, true)}
        <div />
      </SectionCard>

      {/* 2 — Electrical Rating */}
      <SectionCard title="Electrical Rating" color="bg-violet-50/60 border-violet-200">
        {isMcc ? (
          <>
            {renderField("voltage",         "System Voltage",          MCC_VOLTAGE_OPTS,                   true, resolvedProjVolt)}
            {renderField("frequency",       "Frequency",               PANEL_OPTS.frequency,               true, resolvedProjFreq)}
            {renderField("main_bus_rating", "Main Bus Rating",         MCC_SPECIFIC_OPTS.main_bus_rating,  true)}
            {renderField("fault_level_icw", "Panel Fault Level (Icw)", MCC_SPECIFIC_OPTS.fault_level_icw,  true, undefined, "col-span-2")}
          </>
        ) : isStarter ? (
          <>
            {renderField("voltage",         "System Voltage",          MCC_VOLTAGE_OPTS,                   true, resolvedProjVolt)}
            {renderField("frequency",       "Frequency",               PANEL_OPTS.frequency,               true, resolvedProjFreq)}
            {renderField("starter_type",    "Starter Type",            STARTER_TYPE_OPTS,                  true)}
            {renderField("fault_level_icw", "Panel Fault Level (Icw)", MCC_SPECIFIC_OPTS.fault_level_icw,  true, undefined, "col-span-2")}
          </>
        ) : isDb ? (
          <>
            {renderField("voltage",         "System Voltage",          DB_VOLTAGE_OPTS,                    true, resolvedProjVolt)}
            {renderField("frequency",       "Frequency",               PANEL_OPTS.frequency,               true, resolvedProjFreq)}
            {renderField("main_bus_rating", "Main Bus Rating",         MCC_SPECIFIC_OPTS.main_bus_rating,  true)}
            {renderField("fault_level_icw", "Panel Fault Level (Icw)", MCC_SPECIFIC_OPTS.fault_level_icw,  true, undefined, "col-span-2")}
          </>
        ) : isPdp ? (
          <>
            {renderField("voltage",         "System Voltage",          MCC_VOLTAGE_OPTS,                   true, resolvedProjVolt)}
            {renderField("frequency",       "Frequency",               PANEL_OPTS.frequency,               true, resolvedProjFreq)}
            {renderField("main_bus_rating", "Main Bus Rating",         MCC_SPECIFIC_OPTS.main_bus_rating,  true)}
            {renderField("fault_level_icw", "Panel Fault Level (Icw)", MCC_SPECIFIC_OPTS.fault_level_icw,  true, undefined, "col-span-2")}
          </>
        ) : isAutoType ? (
          <>
            {renderField("voltage",         "Supply Voltage",          isRel ? REL_VOLT_OPTS : AUTO_VOLT_OPTS, true, resolvedProjVolt)}
            {!isRel && renderField("frequency","Frequency",            PANEL_OPTS.frequency,               true, resolvedProjFreq)}
            {renderField("enclosure_type",  "Enclosure Type",          PANEL_OPTS.enclosure_type,          true)}
            {isRel && <div />}
          </>
        ) : isApfc ? (
          <>
            {renderField("voltage",         "System Voltage",          MCC_VOLTAGE_OPTS,                   true, resolvedProjVolt)}
            {renderField("frequency",       "Frequency",               PANEL_OPTS.frequency,               true, resolvedProjFreq)}
            {renderField("kvar_rating",     "Capacitor Bank Rating",   APFC_KVAR_OPTS,                     true)}
            <div />
          </>
        ) : isVfd ? (
          <>
            {renderField("voltage",              "System Voltage",     MCC_VOLTAGE_OPTS,                   true, resolvedProjVolt)}
            {renderField("frequency",            "Frequency",          PANEL_OPTS.frequency,               true, resolvedProjFreq)}
            {renderField("drive_power_kw",       "Drive Power Rating", VFD_KW_OPTS,                        true)}
            {renderField("bypass_arrangement",   "Bypass Arrangement", VFD_BYPASS_OPTS,                    true)}
          </>
        ) : (
          <>
            {renderField("voltage",              "Voltage",              PANEL_OPTS.voltage,              true, resolvedProjVolt)}
            {renderField("frequency",            "Frequency",            PANEL_OPTS.frequency,            true, resolvedProjFreq)}
            {renderField("bus_rating",           "Bus Rating",           PANEL_OPTS.bus_rating,           true)}
            {renderField("short_circuit_rating", "Short Circuit Rating", PANEL_OPTS.short_circuit_rating, true, undefined, "col-span-2")}
          </>
        )}
      </SectionCard>

      {/* 3 — Incoming / Feeder (power panels only; hidden for automation/APFC/VFD) */}
      {(hasBusBars || !isSpecType) && (
        <SectionCard title="Incoming / Feeder" color="bg-amber-50/60 border-amber-200">
          {isMcc ? (
            <>
              <div className="col-span-3 md:col-span-5">
                {renderField("incomer_arrangement", "Incomer Arrangement", MCC_SPECIFIC_OPTS.incomer_arrangement, true)}
              </div>
              {renderField("incomer_current_rating", "Incomer Current Rating", MCC_SPECIFIC_OPTS.incomer_current_rating)}
              {renderField("incomer_device_type",    "Incomer Device Type",    MCC_SPECIFIC_OPTS.incomer_device_type)}
              {incoArr === "Dual Incomer with Bus Coupler" && (
                renderField("bus_coupler_rating", "Bus Coupler Rating", MCC_SPECIFIC_OPTS.bus_coupler_rating)
              )}
              {(incoArr === "Dual Incomer" || incoArr === "Dual Incomer with Bus Coupler") && (
                renderField("changeover_arrangement", "Changeover Arrangement", MCC_SPECIFIC_OPTS.changeover_arrangement)
              )}
              {renderText("num_feeders", "Number of Feeders", "e.g. 12")}
            </>
          ) : (isStarter || isPowerBus) ? (
            <>
              {renderField("incomer_current_rating", "Incomer Current Rating", MCC_SPECIFIC_OPTS.incomer_current_rating)}
              {renderField("incomer_device_type",    "Incomer Device Type",    MCC_SPECIFIC_OPTS.incomer_device_type)}
              {renderText("num_feeders", "Number of Feeders", "e.g. 12")}
              <div />
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">No. of Incomer Units</Label>
                <Input className="h-8 text-sm" type="number" min="1" step="1" placeholder="e.g. 1"
                  value={(attrs.num_incomer_units as string) ?? ""}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => {
                    const v = e.target.value;
                    set("num_incomer_units", v === "" ? "" : String(Math.max(1, Math.trunc(Number(v)))));
                  }} />
              </div>
              {renderText("incomer_rating", "Incomer Rating",    "e.g. 630A ACB")}
              {renderText("num_feeders",    "Number of Feeders", "e.g. 12")}
              <div />
            </>
          )}
        </SectionCard>
      )}

      {/* 4 — Enclosure */}
      <SectionCard title="Enclosure" color="bg-emerald-50/60 border-emerald-200">
        {isAutoType ? (
          // For automation panels, enclosure_type is already in Electrical Rating section (in code)
          <>
            {renderField("enclosure_material", "Enclosure Material", PANEL_OPTS.enclosure_material, true)}
            {renderField("ip_rating",          "IP Rating",          PANEL_OPTS.ip_rating,          true)}
            {renderField("form_of_separation", "Form of Separation", PANEL_OPTS.form_of_separation)}
            <div /><div />
          </>
        ) : (
          <>
            {renderField("enclosure_type",     "Enclosure Type",     PANEL_OPTS.enclosure_type,     true)}
            {renderField("enclosure_material", "Enclosure Material", PANEL_OPTS.enclosure_material, isSpecType)}
            {renderField("ip_rating",          "IP Rating",          PANEL_OPTS.ip_rating,          isSpecType)}
            {renderField("form_of_separation", "Form of Separation", PANEL_OPTS.form_of_separation)}
          </>
        )}
      </SectionCard>

      {/* 5 — Busbars & Construction (power panels only) */}
      {hasBusBars && (
        <SectionCard title="Busbars & Construction" color="bg-teal-50/60 border-teal-200">
          {renderField("busbar_material", "Busbar Material", PANEL_OPTS.busbar_material, true)}
          {renderField("interlocking",    "Interlocking",    PANEL_OPTS.interlocking)}
        </SectionCard>
      )}
      {!hasBusBars && !isSpecType && (
        <SectionCard title="Busbars & Construction" color="bg-teal-50/60 border-teal-200">
          {renderField("busbar_material", "Busbar Material", PANEL_OPTS.busbar_material)}
          {renderField("interlocking",    "Interlocking",    PANEL_OPTS.interlocking)}
        </SectionCard>
      )}

      {/* 6 — Accessories & Auxiliary */}
      <SectionCard title="Accessories & Auxiliary" color="bg-orange-50/60 border-orange-200">
        {renderField("anti_condensation", "Anti-condensation Heater", PANEL_OPTS.anti_condensation, undefined, undefined, "col-span-2")}
        {renderField("aux_power_supply",  "Auxiliary Power Supply",   PANEL_OPTS.aux_power_supply,  undefined, undefined, "col-span-2")}
      </SectionCard>

      {/* 7 — Area Classification (required for all spec types) */}
      <SectionCard title="Area Classification" color="bg-rose-50/60 border-rose-200">
        <div className="col-span-3 md:col-span-5">
          {isSpecType ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Area Classification <span className="text-red-500">*</span></Label>
              <SearchableSelect
                value={PANEL_OPTS.area_classification.includes(areaClass) ? areaClass : ""}
                options={PANEL_OPTS.area_classification}
                placeholder="Select…"
                onSelect={handleAreaChange}
              />
            </div>
          ) : (
            renderField("area_classification", "Area Classification", PANEL_OPTS.area_classification)
          )}
        </div>
        {isHazardous && (
          <>
            {renderField("explosion_protection", "Explosion Protection", PANEL_OPTS.explosion_protection, true, undefined, "col-span-2")}
            {renderField("gas_group",            "Gas Group",            PANEL_OPTS.gas_group,            true)}
            {renderField("temperature_class",    "Temperature Class",    PANEL_OPTS.temperature_class,    true)}
            <div />
          </>
        )}
      </SectionCard>

      {/* 8 — Standards & Testing */}
      <SectionCard title="Standards & Testing" color="bg-slate-50/80 border-slate-200">
        {renderField("testing_std", "Testing Standard", PANEL_OPTS.testing_std)}
        <div />
        <div className="col-span-3 md:col-span-5 space-y-1.5">
          <Label className="text-xs">Additional Notes</Label>
          <Input className="h-8 text-sm" placeholder="Any additional requirements…"
            value={(attrs.notes as string) ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
        {qty !== undefined && (
          <div className="space-y-1.5 col-span-3 md:col-span-5">
            <Label className="text-xs">Quantity (Panels) <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => {
                const v = e.target.value;
                onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v)))));
              }} />
          </div>
        )}
      </SectionCard>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CABLING
// ─────────────────────────────────────────────────────────────────────────────
const CABLE_TYPE_OPTS    = ["Power Cable", "Control Cable", "Instrumentation Cable", "Data / Comm Cable", "Earthing Cable", "Fire Resistant Cable", "Other"];
const CABLE_CORE_OPTS    = ["1 Core", "2 Core", "3 Core", "3.5 Core", "4 Core", "7 Core", "12 Core", "19 Core", "27 Core", "Other"];
const CABLE_SIZE_OPTS    = ["1.0 mm²", "1.5 mm²", "2.5 mm²", "4 mm²", "6 mm²", "10 mm²", "16 mm²", "25 mm²", "35 mm²", "50 mm²", "70 mm²", "95 mm²", "120 mm²", "150 mm²", "185 mm²", "240 mm²", "Other"];
const CABLE_VOLTAGE_OPTS = ["300/500V", "450/750V", "600/1000V", "1.1kV", "3.3kV", "6.6kV", "11kV", "Other"];
const CABLE_INSUL_OPTS   = ["PVC", "XLPE", "EPR", "Silicone", "Other"];
const CABLE_SHEATH_OPTS  = ["PVC", "LSZH", "Polyurethane", "Other"];
const CABLE_ARMOUR_OPTS  = ["Unarmoured", "SWA (Steel Wire Armour)", "STA (Steel Tape Armour)", "Braided Wire Armour", "Other"];
const CABLE_SCREEN_OPTS  = ["Unscreened", "Individual + Overall Screened", "Overall Screened", "Individually Screened", "Other"];
const CABLE_LAYING_OPTS  = ["Cable Tray", "Conduit", "Direct Burial", "Duct / Raceway", "Surface Mounted", "Other"];
const CABLE_STD_OPTS     = ["IS 1554", "IS 7098", "BS 5308", "BS 6724", "IEC 60502", "IEC 60228", "BS EN 50525", "Other"];

export function buildCablingRequirement(attrs: Record<string, unknown>): string {
  const cableType   = (attrs.cable_type   as string)?.trim() || "";
  const coreConf    = (attrs.core_config  as string)?.trim() || "";
  const cableSize   = (attrs.cable_size   as string)?.trim() || "";
  const voltage     = (attrs.voltage      as string)?.trim() || "";
  const insulation  = (attrs.insulation   as string)?.trim() || "";
  const armour      = (attrs.armour       as string)?.trim() || "";
  const screen      = (attrs.screening    as string)?.trim() || "";
  const standard    = (attrs.standard     as string)?.trim() || "";
  const coreStr  = [coreConf, cableSize].filter(Boolean).join(" x ");
  const armAbbr: Record<string, string> = { "Unarmoured": "UnArm", "SWA (Steel Wire Armour)": "SWA", "STA (Steel Tape Armour)": "STA" };
  const armShort = armAbbr[armour] || armour;
  const parts: string[] = [];
  if (cableType) parts.push(cableType);
  if (coreStr)   parts.push(coreStr);
  if (voltage)   parts.push(voltage);
  if (insulation) parts.push(insulation);
  if (armShort && armShort !== "Unarmoured") parts.push(armShort);
  if (screen && screen !== "Unscreened") parts.push(screen);
  if (standard)  parts.push(standard);
  return parts.join(", ");
}

const CABLE_ALL_OPTS: Record<string, string[]> = {
  cable_type:   CABLE_TYPE_OPTS,
  core_config:  CABLE_CORE_OPTS,
  cable_size:   CABLE_SIZE_OPTS,
  voltage:      CABLE_VOLTAGE_OPTS,
  insulation:   CABLE_INSUL_OPTS,
  outer_sheath: CABLE_SHEATH_OPTS,
  armour:       CABLE_ARMOUR_OPTS,
  screening:    CABLE_SCREEN_OPTS,
  laying_type:  CABLE_LAYING_OPTS,
  standard:     CABLE_STD_OPTS,
};

export function CablingAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(CABLE_ALL_OPTS)) {
      const val = (attrs[key] as string) ?? "";
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

  function renderField(key: string, label: string, required?: boolean, wrapClass?: string) {
    const opts      = CABLE_ALL_OPTS[key] ?? [];
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className={`space-y-1.5 ${wrapClass ?? ""}`}>
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
      <p className="text-[11px] font-semibold text-primary uppercase tracking-wide col-span-3 md:col-span-5 border-b pb-1 mt-1">{label}</p>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cabling Specifications</p>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {sec("Cable Type")}
        <div className="col-span-3 md:col-span-5">{renderField("cable_type",  "Cable Type",    true)}</div>

        {sec("Core & Size")}
        {renderField("core_config",   "Core Configuration", true)}
        {renderField("cable_size",    "Conductor Size",     true)}
        {renderField("voltage",       "Voltage Rating",     true)}
        <div />

        {sec("Insulation & Sheath")}
        {renderField("insulation",    "Insulation")}
        {renderField("outer_sheath",  "Outer Sheath")}

        {sec("Armour & Screening")}
        {renderField("armour",    "Armour")}
        {renderField("screening", "Screening")}

        {sec("Laying")}
        {renderField("laying_type", "Laying Type")}
        <div />

        {sec("Standard")}
        {renderField("standard", "Standard")}
        <div />

        {qty !== undefined && (
          <div className="space-y-1.5 col-span-3 md:col-span-5">
            <Label className="text-xs">Length (m) <span className="text-red-500">*</span></Label>
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
// JUNCTION BOX
// ─────────────────────────────────────────────────────────────────────────────
const JB_TYPE_OPTS         = ["General Purpose JB", "Marshalling JB", "Thermocouple JB", "RTD JB", "Field JB", "Panel JB", "Signal Distribution JB", "Intrinsically Safe JB", "Flameproof JB"];
const JB_MATERIAL_OPTS     = ["GRP/FRP", "SS316", "SS304", "Carbon Steel", "Polycarbonate", "Die-Cast Aluminium", "Mild Steel (Painted)"];
const JB_MOUNTING_OPTS     = ["Wall Mounted", "Stand Mounted", "Pole Mounted", "Panel Mounted", "Rack Mounted"];
const JB_ENCLOSURE_OPTS    = ["IP65", "IP66", "IP67", "IP68"];
const JB_TERMINALS_OPTS    = ["6", "8", "10", "12", "16", "20", "24", "30", "40", "48", "60", "72", "96", "Other"];
const JB_TERMINAL_TYPE     = ["Screw Clamp (Weidmuller)", "Screw Clamp (Phoenix)", "Spring Cage (WAGO)", "Knife Disconnect", "DIN Rail", "Other"];
const JB_ENTRY_TYPE_OPTS   = ["Bottom Entry (Glands)", "Side Entry (Glands)", "Top Entry (Conduit)", "Both Sides", "Other"];
const JB_GLAND_TYPE_OPTS   = ["Brass (Nickel Plated)", "SS316 (Flameproof)", "SS304", "Nylon", "Other"];
const JB_GLAND_SIZE_OPTS   = ["M16 (for 6–10mm cable)", "M20 (for 10–14mm cable)", "M25 (for 14–18mm cable)", "M32 (for 18–25mm cable)", "NPT 3/4\"", "NPT 1\"", "Other"];
const JB_AREA_OPTS         = ["Safe Area", "Zone 1 (Gas Groups IIA/IIB)", "Zone 1 (Gas Group IIC)", "Zone 2", "Division 1", "Division 2", "Non-classified"];
const JB_CERT_OPTS         = ["ATEX Certified", "IECEx Certified", "PESO Certified", "UL / FM Listed", "CMRI / BIS Certified", "No Certification Required"];
const JB_EARTHING_OPTS     = ["External Earthing Boss (M8)", "Internal Earth Bar", "Both Internal + External", "None"];
const JB_ACCESSORIES       = ["Nameplate", "Tag Plate", "Anti-condensation Heater", "Thermostat", "Din Rail", "Tamper-proof Screws", "Padlocking Facility", "Window (Inspection)"];
const JB_VENDOR_CHIPS      = ["Pepperl+Fuchs", "R.Stahl", "Weidmuller", "Rittal", "Polycab", "Egar", "CG Power", "ABB", "Hawke International", "Woerner"];

export function buildJunctionBoxRequirement(attrs: Record<string, unknown>): string {
  const jbType     = (attrs.jb_type          as string)?.trim() || "";
  const encType    = (attrs.enclosure_type   as string)?.trim() || "";
  const material   = (attrs.body_material    as string)?.trim() || "";
  const mounting   = (attrs.mounting         as string)?.trim() || "";
  const numTerms   = (attrs.num_terminals    as string)?.trim() || "";
  const termType   = (attrs.terminal_type    as string)?.trim() || "";
  const numEntries = (attrs.num_cable_entries as string)?.trim() || "";
  const glandSize  = (attrs.gland_size       as string)?.trim() || "";
  const areaClass  = (attrs.area_classification as string)?.trim() || "";
  const acc        = (attrs.accessories      as string)?.trim() || "";
  const jbLabel = jbType || "Junction Box";
  const termStr = numTerms ? `${numTerms} Terminals` : "";
  const termTypeStr = termType ? termType.split(" ")[0] : "";
  const fullTermStr = [termStr, termTypeStr].filter(Boolean).join(" ");
  const entryStr = numEntries ? `${numEntries} Entries ${glandSize ? "(" + glandSize.split(" ")[0] + ")" : ""}` : "";
  const parts: string[] = [jbLabel];
  if (encType) parts.push(encType);
  if (material) parts.push(material);
  if (mounting) parts.push(mounting);
  if (fullTermStr) parts.push(fullTermStr);
  if (entryStr) parts.push(entryStr);
  if (areaClass && !areaClass.toLowerCase().startsWith("safe")) parts.push(areaClass);
  if (acc) parts.push("w/ " + acc.split(",").slice(0, 2).join("+").trim());
  return parts.join(", ");
}

export function JunctionBoxAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const allFieldOpts: Record<string, string[]> = {
    jb_type:             JB_TYPE_OPTS,
    body_material:       JB_MATERIAL_OPTS,
    mounting:            JB_MOUNTING_OPTS,
    enclosure_type:      JB_ENCLOSURE_OPTS,
    num_terminals:       JB_TERMINALS_OPTS,
    terminal_type:       JB_TERMINAL_TYPE,
    cable_entry_type:    JB_ENTRY_TYPE_OPTS,
    cable_gland_type:    JB_GLAND_TYPE_OPTS,
    gland_size:          JB_GLAND_SIZE_OPTS,
    area_classification: JB_AREA_OPTS,
    certification:       JB_CERT_OPTS,
    earthing:            JB_EARTHING_OPTS,
  };
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(allFieldOpts)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  const selectedAcc     = ((attrs.accessories    as string) ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const encType         = (attrs.enclosure_type as string) ?? "";

  function toggleAcc(chip: string) {
    const next = selectedAcc.includes(chip)
      ? selectedAcc.filter(a => a !== chip)
      : [...selectedAcc, chip];
    set("accessories", next.join(", "));
  }
  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom((c) => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom((c) => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function ss(key: string, label: string, opts: string[], required?: boolean) {
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

  function num(key: string, label: string) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <Input className="h-8 text-sm" type="number" min="0" step="1"
          value={(attrs[key] as string) ?? ""}
          onChange={(e) => set(key, e.target.value)} />
      </div>
    );
  }

  function sec(label: string) {
    return (
      <p className="text-[11px] font-semibold text-primary uppercase tracking-wide col-span-3 md:col-span-5 border-b pb-1 mt-1">{label}</p>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Junction Box Specifications</p>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {sec("JB Type & Construction")}
        <div className="col-span-3 md:col-span-5">{ss("jb_type", "JB Type", JB_TYPE_OPTS, true)}</div>
        {ss("body_material",  "Body Material",   JB_MATERIAL_OPTS, true)}
        {ss("mounting",       "Mounting",        JB_MOUNTING_OPTS)}
        {ss("enclosure_type", "Enclosure (IP Rating)", JB_ENCLOSURE_OPTS, true)}
        <div />

        {sec("Terminals")}
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
        <div className="col-span-3 md:col-span-5 space-y-1.5">
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

        {sec("Make")}
        <div className="col-span-3 md:col-span-5">{ss("make", "Make", JB_VENDOR_CHIPS, true)}</div>

        {qty !== undefined && (
          <div className="space-y-1.5 col-span-3 md:col-span-5">
            <Label className="text-xs">Quantity (Units) <span className="text-red-500">*</span></Label>
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
// COOLING TOWER
// ─────────────────────────────────────────────────────────────────────────────
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

export function buildCoolingTowerRequirement(attrs: Record<string, unknown>): string {
  const ctType   = (attrs.cooling_tower_type   as string)?.trim() || "";
  const circ     = (attrs.circulation_rate     as string)?.trim() || "";
  const inletT   = parseFloat((attrs.inlet_water_temp  as string) ?? "");
  const outletT  = parseFloat((attrs.outlet_water_temp as string) ?? "");
  const wbt      = parseFloat((attrs.wet_bulb_temp     as string) ?? "");
  const casing   = (attrs.casing_material      as string)?.trim() || "";
  const fanType  = (attrs.fan_type             as string)?.trim() || "";
  const motorKW  = (attrs.motor_power_kw       as string)?.trim() || "";
  const parts: string[] = ["Cooling Tower"];
  if (circ)               parts.push(`${circ} m³/hr`);
  if (!isNaN(inletT) && !isNaN(outletT)) parts.push(`Range ${(inletT - outletT).toFixed(1)}°C`);
  if (!isNaN(outletT) && !isNaN(wbt))    parts.push(`Approach ${(outletT - wbt).toFixed(1)}°C`);
  if (casing)  parts.push(casing);
  if (ctType)  parts.push(ctType);
  if (fanType) parts.push(`${fanType} Fan`);
  if (motorKW) parts.push(`${motorKW} kW`);
  return parts.join(", ");
}

export function CoolingTowerAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...attrs, [k]: v });

  const inletT  = parseFloat((attrs.inlet_water_temp  as string) ?? "");
  const outletT = parseFloat((attrs.outlet_water_temp as string) ?? "");
  const wbt     = parseFloat((attrs.wet_bulb_temp     as string) ?? "");
  const range   = (!isNaN(inletT) && !isNaN(outletT)) ? (inletT - outletT).toFixed(1) : "—";
  const approach = (!isNaN(outletT) && !isNaN(wbt))   ? (outletT - wbt).toFixed(1)    : "—";


  const sec = (title: string) => (
    <p className="text-[11px] font-semibold text-primary uppercase tracking-wide col-span-3 md:col-span-5 border-b pb-1 mt-1">{title}</p>
  );
  const renderSS = (key: string, label: string, opts: string[], required = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <SearchableSelect
        options={opts} value={(attrs[key] as string) ?? ""}
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
        onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cooling Tower Specifications</p>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
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
        {renderSS("fan_type",  "Fan Type",  CT_FAN_TYPE_OPTS)}
        {renderSS("fan_drive", "Fan Drive", CT_FAN_DRIVE_OPTS)}
        {renderNum("motor_power_kw", "Motor Power (kW)")}
        <div />

        {sec("Components")}
        {renderSS("fill_type",        "Fill Type",        CT_FILL_OPTS)}
        {renderSS("drift_eliminator", "Drift Eliminator", CT_YES_NO)}
        {renderSS("louvers",          "Louvers",          CT_YES_NO)}
        <div />

        {sec("Material")}
        {renderSS("casing_material", "Casing Material", CT_CASING_MAT_OPTS)}
        {renderSS("basin_material",  "Basin Material",  CT_BASIN_MAT_OPTS)}

        {sec("Operating Conditions")}
        {renderSS("water_type", "Water Type", CT_WATER_TYPE_OPTS)}
        <div />

        {sec("Make")}
        <div className="col-span-3 md:col-span-5">{renderSS("make", "Make", CT_VENDOR_CHIPS, true)}</div>

        {qty !== undefined && (
          <div className="space-y-1.5 col-span-3 md:col-span-5">
            <Label className="text-xs">Quantity (Units) <span className="text-red-500">*</span></Label>
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
// BOUGHT-OUT PACKAGE
// ─────────────────────────────────────────────────────────────────────────────
const BOUGHT_OUT_PKG_TYPE_OPTS = [
  "Pump Skid Package","Vacuum System","Dosing System","Filtration Unit",
  "Heat Exchanger Package","Compressor Package","Utility Skid","Other",
];
const BOUGHT_OUT_CAPACITY_OPTS = ["1 m³/hr","5 m³/hr","10 m³/hr","20 m³/hr","50 m³/hr","100 m³/hr","Other"];
const BOUGHT_OUT_DUTY_OPTS     = ["Continuous","Intermittent","Standby"];
const BOUGHT_OUT_UNITS_OPTS    = ["1","2","3","4","Other"];
const BOUGHT_OUT_CONFIG_OPTS   = ["Single","Duty + Standby","2 Working + 1 Standby","Parallel","Other"];
const BOUGHT_OUT_COMPONENTS    = ["Pumps","Motors","Base Frame","Coupling","Control Panel","VFD","Instruments","Piping","Valves","Gauges","Flow Meter","Other"];
const BOUGHT_OUT_FLUID_OPTS    = ["Water","Oil","Chemical","Slurry","Air","Gas","Other"];
const BOUGHT_OUT_TEMP_OPTS     = ["Ambient","50°C","80°C","120°C","Other"];
const BOUGHT_OUT_MATERIAL_OPTS = ["CS","SS304","SS316","Duplex","Other"];
const BOUGHT_OUT_AREA_OPTS     = ["Safe Area","Zone 1","Zone 2"];
const BOUGHT_OUT_CERT_OPTS     = ["CE","ATEX","IECEx","PESO","Other"];
const BOUGHT_OUT_VENDOR_CHIPS  = [
  "Flowserve","KSB","Sulzer","Grundfos","SPX Flow","Atlas Copco",
  "Alfa Laval","Praj Industries","ISGEC","Thermax","HOWE-Baker","Samarth",
];

export function buildBoughtOutRequirement(attrs: Record<string, unknown>): string {
  const pkgType  = (attrs.package_type      as string)?.trim() || "";
  const capacity = (attrs.capacity          as string)?.trim() || "";
  const config   = (attrs.configuration     as string)?.trim() || "";
  const material = (attrs.material_class    as string)?.trim() || "";
  const compsRaw = (attrs.package_components as string)?.trim() || "";
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

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const COMP_TYPE_OPTS = [
  "MCB", "MCCB", "ACB",
  "Contactor", "Overload Relay",
  "DOL Starter", "Star-Delta Starter",
  "VFD (Variable Frequency Drive)", "Soft Starter",
  "Transformer", "SMPS / Power Supply", "UPS",
  "Relay", "Timer Relay",
  "Selector Switch", "Push Button", "Limit Switch",
  "Indicator / Pilot Light",
  "Energy Meter",
  "Current Transformer (CT)", "Potential Transformer (PT)",
  "Fuse", "Terminal Block", "ELCB / RCCB / RCBO",
  "PLC / DCS Module", "HMI / Operator Panel",
];
const COMP_VOLTAGE_OPTS  = ["415V AC (3Ph)","380V AC (3Ph)","440V AC (3Ph)","480V AC (3Ph)","690V AC (3Ph)","240V AC (1Ph)","110V AC (1Ph)","48V DC","24V DC"];
const COMP_FREQ_OPTS     = ["50 Hz","60 Hz"];
const COMP_CURRENT_OPTS  = ["6A","10A","16A","20A","25A","32A","40A","50A","63A","80A","100A","125A","160A","200A","250A","315A","400A","630A","800A","1000A","1250A","1600A"];
const COMP_POWER_KW_OPTS = ["0.37","0.75","1.1","2.2","3.7","5.5","7.5","11","15","18.5","22","30","37","45","55","75","90","110","132","160","200","250","315","400"];
const COMP_COIL_V_OPTS   = ["24V DC","24V AC","48V DC","110V DC","110V AC","230V AC","415V AC"];
const COMP_IP_OPTS       = ["IP20","IP40","IP42","IP54","IP55","IP65","IP66","IP67","IP68"];
const COMP_MOUNTING_OPTS = ["DIN Rail","Panel Mounted","Wall Mounted","Rack Mounted","Surface Mounted","Standalone"];
const COMP_AREA_OPTS     = ["Safe Area","Zone 1","Zone 2"];
const COMP_EX_PROT_OPTS  = ["Ex e (Increased Safety)","Ex d (Flameproof)","Ex n (Non-sparking)","Ex p (Pressurized)","Ex ia (Intrinsically Safe)"];
const COMP_GAS_GRP_OPTS  = ["IIA","IIB","IIC"];
const COMP_TEMP_CLS_OPTS = ["T1 (450°C)","T2 (300°C)","T3 (200°C)","T4 (135°C)","T5 (100°C)","T6 (85°C)"];
const COMP_CERT_OPTS     = ["ATEX","IECEx","PESO","UL / FM Listed","CMRI / BIS Certified"];
const COMP_YES_NO        = ["Yes","No"];
const COMP_POLES_ALL     = ["1P","2P","3P","4P"];
const COMP_POLES_3P4P    = ["3P","4P"];

const MCB_BREAKING   = ["6 kA","10 kA","16 kA","25 kA"];
const MCB_TRIP       = ["B","C","D","K"];
const MCB_STD        = ["IEC 60898-1","IS 8828"];
const MCCB_BREAKING  = ["10 kA","16 kA","25 kA","36 kA","50 kA","65 kA","85 kA","100 kA"];
const MCCB_RELEASE   = ["Thermal-Magnetic","Electronic (ETU)"];
const MCCB_STD       = ["IEC 60947-2","IS 13947-2"];
const ACB_BREAKING   = ["50 kA","65 kA","80 kA","100 kA","120 kA"];
const ACB_RELEASE    = ["Electronic (ETU)","Microprocessor-based"];
const ACB_DRAWOUT    = ["Fixed","Drawout (Withdrawable)"];
const ACB_STD        = ["IEC 60947-2","IS 13947-2"];
const CONT_AC_DUTY   = ["AC1","AC2","AC3","AC4"];
const CONT_AUX       = ["None","1NO","1NC","1NO+1NC","2NO+2NC"];
const CONT_STD       = ["IEC 60947-4-1","IS 13947-4-1"];
const OL_RANGE       = ["0.1–0.16A","0.16–0.25A","0.25–0.4A","0.4–0.63A","0.63–1A","1–1.6A","1.6–2.5A","2.5–4A","4–6A","6–10A","9–14A","13–18A","18–25A","24–32A","28–40A","37–50A","48–65A","55–70A","63–80A","80–100A","90–125A"];
const OL_TRIP_CLASS  = ["Class 5","Class 10","Class 10A","Class 20","Class 30"];
const OL_TYPE        = ["Bi-metal Thermal","Electronic"];
const STARTER_STD    = ["IEC 60947-4-1","IS 13947-4-1"];
const VFD_CONTROL    = ["V/f Scalar","Sensorless Vector","Closed Loop Vector"];
const VFD_COMM       = ["None","Modbus RTU","Profibus DP","EtherNet/IP","PROFINET","CANopen"];
const VFD_STD        = ["IEC 61800-5-1","IEC 61800-3"];
const XFMR_TYPE      = ["Control Transformer","Isolation Transformer","Auto-transformer","Step-down","Step-up"];
const XFMR_KVA       = ["0.1","0.25","0.5","1","2","3","5","7.5","10","15","20","25","50","75","100"];
const XFMR_SEC_V     = ["24V AC","48V AC","110V AC","230V AC","415V AC"];
const XFMR_INSUL     = ["Class B","Class F","Class H"];
const XFMR_STD       = ["IEC 61558","IS 5142"];
const SMPS_OUT_V     = ["5V DC","12V DC","24V DC","48V DC","110V DC"];
const SMPS_OUT_A     = ["1A","2A","3A","5A","10A","15A","20A","40A"];
const SMPS_REDUND    = ["None","1+1 Redundant"];
const UPS_KVA        = ["0.5","1","2","3","5","6","10","15","20"];
const UPS_TOPOLOGY   = ["Online (Double Conversion)","Line Interactive","Offline"];
const UPS_BACKUP     = ["15 min","30 min","45 min","60 min","90 min","120 min"];
const UPS_BATTERY    = ["VRLA (Sealed)","Lithium-Ion","Gel"];
const RELAY_CAT      = ["General Purpose","Auxiliary","Latching","Solid State","Safety Relay"];
const RELAY_CONTACT  = ["SPDT (1C/O)","DPDT (2C/O)","4PDT (4C/O)"];
const RELAY_SOCKET   = ["DIN Rail Socket","Panel Mount","PCB Mount"];
const TIMER_FUNC     = ["ON Delay","OFF Delay","Star-Delta","Interval","Cyclic"];
const TIMER_RANGE    = ["0.1–10s","1–100s","1s–60s","1–60 min","1–60 hr"];
const SW_POSITIONS   = ["2-Position","3-Position","4-Position"];
const PB_TYPES       = ["Momentary","Maintained","Spring Return"];
const SW_CONTACT     = ["NO","NC","NO+NC"];
const SW_COLOUR      = ["Black","Green","Red","Yellow","White","Blue","Grey"];
const SW_OPERATOR    = ["Standard","Illuminated","Key-operated","Mushroom Head (Emergency Stop)"];
const SW_CUTOUT      = ["22mm","30mm","40mm"];
const IND_COLOUR     = ["Red","Green","Yellow","White","Blue","Orange"];
const IND_VOLTAGE    = ["24V DC","24V AC","110V AC","230V AC"];
const IND_LAMP       = ["LED","Incandescent","Neon"];
const EM_TYPE        = ["Single Phase kWh","Three Phase kWh","Multifunction (kWh+kVAh+kVArh)","Power Analyser"];
const EM_ACCURACY    = ["Class 0.2","Class 0.5","Class 1.0","Class 2.0"];
const EM_COMM        = ["None","Pulse Output","RS485/Modbus RTU","Ethernet","DNP3"];
const EM_DISPLAY     = ["LCD","LED","None"];
const CT_RATIO       = ["50/5A","75/5A","100/5A","150/5A","200/5A","250/5A","300/5A","400/5A","500/5A","600/5A","800/5A","1000/5A","1200/5A","1500/5A","2000/5A"];
const CT_ACCURACY    = ["Class 0.2","Class 0.5","Class 1","Class 3","5P10","5P20","10P10","10P20"];
const CT_BURDEN      = ["2.5 VA","5 VA","10 VA","15 VA","20 VA","30 VA"];
const CT_CORE        = ["Measurement","Protection","Metering + Protection (Dual)"];
const CT_STD         = ["IEC 61869-2","IS 2705"];
const PT_RATIO       = ["415/110V","3300/110V","6600/110V","11000/110V"];
const PT_ACCURACY    = ["Class 0.2","Class 0.5","Class 1","Class 3","3P","6P"];
const PT_STD         = ["IEC 61869-3","IS 3156"];
const FUSE_TYPE      = ["HRC (High Rupturing Capacity)","Rewireable","Cartridge","NH Type","D-Type"];
const FUSE_BREAKING  = ["10 kA","16 kA","25 kA","50 kA","80 kA","100 kA","120 kA"];
const FUSE_SIZE      = ["00","0","1","2","3","4"];
const FUSE_STD       = ["IEC 60269","IS 13703","BS 88"];
const TB_TYPE        = ["Screw Clamp","Spring Cage","Knife Disconnect","Fused","Earth"];
const TB_WIRE        = ["0.5–4 mm²","0.5–6 mm²","0.75–10 mm²","2.5–16 mm²","4–25 mm²","6–35 mm²"];
const TB_CURRENT     = ["10A","16A","25A","32A","57A","76A","101A"];
const ELCB_TYPE      = ["ELCB","RCCB","RCBO"];
const ELCB_POLES     = ["2P","4P"];
const ELCB_SENS      = ["10 mA","30 mA","100 mA","300 mA","500 mA"];
const ELCB_STD       = ["IEC 61008","IEC 61009","IS 12640"];
const PLC_MODULE     = ["CPU Module","Digital Input (DI)","Digital Output (DO)","Analog Input (AI)","Analog Output (AO)","Communication Module","Power Supply Module"];
const PLC_PLATFORM   = ["Siemens S7-1200","Siemens S7-1500","Allen Bradley CompactLogix","Allen Bradley MicroLogix","Schneider M221","Schneider M340","Honeywell","Yokogawa","ABB"];
const PLC_COMM       = ["Profibus DP","PROFINET","EtherNet/IP","Modbus RTU","Modbus TCP"];
const HMI_SIZE       = ['4"','5.7"','7"','10"','12"','15"'];
const HMI_DISPLAY    = ["TFT LCD Colour Touch","TFT LCD Non-touch","Membrane Keypad"];
const HMI_PLATFORM   = ["Siemens KTP","Allen Bradley PanelView","Schneider Magelis","Weintek","Delta"];
const HMI_COMM       = ["Profibus DP","PROFINET","EtherNet/IP","Modbus RTU","RS232/RS485"];
const COMP_FALLBACK_STD = ["IEC 60947-1","IEC 61439-1","IS 13947-1","BS EN 60947"];

const ALL_COMP_OPTS: Record<string, string[]> = {
  component_type: COMP_TYPE_OPTS, voltage: COMP_VOLTAGE_OPTS, frequency: COMP_FREQ_OPTS,
  current_rating: COMP_CURRENT_OPTS, power_kw: COMP_POWER_KW_OPTS, coil_voltage: COMP_COIL_V_OPTS,
  ip_rating: COMP_IP_OPTS, mounting_type: COMP_MOUNTING_OPTS, area_classification: COMP_AREA_OPTS,
  explosion_protection: COMP_EX_PROT_OPTS, gas_group: COMP_GAS_GRP_OPTS,
  temperature_class: COMP_TEMP_CLS_OPTS, certification: COMP_CERT_OPTS,
  num_poles: [...new Set([...COMP_POLES_ALL, ...COMP_POLES_3P4P])],
  breaking_capacity: [...new Set([...MCB_BREAKING, ...MCCB_BREAKING, ...ACB_BREAKING, ...FUSE_BREAKING])],
  trip_characteristic: MCB_TRIP, release_type: [...MCCB_RELEASE, ...ACB_RELEASE],
  draw_out_type: ACB_DRAWOUT, ac_duty: CONT_AC_DUTY, aux_contacts: CONT_AUX,
  current_range: OL_RANGE, trip_class: OL_TRIP_CLASS, relay_type: OL_TYPE,
  contactor_included: COMP_YES_NO, overload_included: COMP_YES_NO,
  control_type: VFD_CONTROL, bypass_provision: COMP_YES_NO,
  transformer_type: XFMR_TYPE, kva_rating: [...new Set([...XFMR_KVA, ...UPS_KVA])],
  primary_voltage: COMP_VOLTAGE_OPTS, secondary_voltage: XFMR_SEC_V, insulation_class: XFMR_INSUL,
  output_voltage: SMPS_OUT_V, output_current: SMPS_OUT_A, redundancy: SMPS_REDUND,
  ups_topology: UPS_TOPOLOGY, battery_backup_min: UPS_BACKUP, battery_type: UPS_BATTERY,
  relay_category: RELAY_CAT, contact_config: [...new Set([...RELAY_CONTACT, ...SW_CONTACT])],
  relay_socket: RELAY_SOCKET, timer_function: TIMER_FUNC, time_range: TIMER_RANGE,
  switch_positions: SW_POSITIONS, pb_type: PB_TYPES, actuator_colour: SW_COLOUR,
  operator_type: SW_OPERATOR, mounting_cutout: SW_CUTOUT,
  indicator_colour: IND_COLOUR, indicator_voltage: IND_VOLTAGE, lamp_type: IND_LAMP,
  meter_type: EM_TYPE, accuracy_class: [...new Set([...EM_ACCURACY, ...CT_ACCURACY, ...PT_ACCURACY])],
  communication: [...new Set([...VFD_COMM, ...EM_COMM, ...PLC_COMM, ...HMI_COMM])],
  meter_display: EM_DISPLAY, ct_ratio: CT_RATIO, burden_va: CT_BURDEN, core_type: CT_CORE,
  pt_ratio: PT_RATIO, fuse_type: FUSE_TYPE, fuse_size: FUSE_SIZE,
  terminal_type: TB_TYPE, wire_range: TB_WIRE, terminal_current: TB_CURRENT,
  elcb_type: ELCB_TYPE, elcb_poles: ELCB_POLES, sensitivity_ma: ELCB_SENS,
  plc_module_type: PLC_MODULE, plc_platform: PLC_PLATFORM,
  screen_size: HMI_SIZE, display_type: HMI_DISPLAY, hmi_platform: HMI_PLATFORM,
  component_std: [...new Set([...MCB_STD, ...MCCB_STD, ...ACB_STD, ...CONT_STD, ...STARTER_STD,
    ...VFD_STD, ...XFMR_STD, ...CT_STD, ...PT_STD, ...FUSE_STD, ...ELCB_STD, ...COMP_FALLBACK_STD])],
};

const COMP_TYPE_DEFAULTS: Record<string, Record<string, string>> = {
  "MCB":                            { num_poles: "3P", trip_characteristic: "C", mounting_type: "DIN Rail" },
  "MCCB":                           { num_poles: "3P", release_type: "Thermal-Magnetic", mounting_type: "Panel Mounted" },
  "ACB":                            { num_poles: "3P", draw_out_type: "Drawout (Withdrawable)", mounting_type: "Panel Mounted" },
  "Contactor":                      { num_poles: "3P", ac_duty: "AC3", mounting_type: "DIN Rail" },
  "Overload Relay":                 { relay_type: "Bi-metal Thermal", mounting_type: "DIN Rail" },
  "DOL Starter":                    { contactor_included: "Yes", overload_included: "Yes", mounting_type: "Panel Mounted" },
  "Star-Delta Starter":             { contactor_included: "Yes", overload_included: "Yes", mounting_type: "Panel Mounted" },
  "VFD (Variable Frequency Drive)": { ip_rating: "IP20", mounting_type: "Panel Mounted", control_type: "V/f Scalar" },
  "Soft Starter":                   { ip_rating: "IP20", mounting_type: "Panel Mounted" },
  "SMPS / Power Supply":            { output_voltage: "24V DC", mounting_type: "DIN Rail" },
  "Relay":                          { contact_config: "SPDT (1C/O)", relay_socket: "DIN Rail Socket", mounting_type: "DIN Rail" },
  "Timer Relay":                    { mounting_type: "DIN Rail" },
  "Push Button":                    { operator_type: "Standard", mounting_cutout: "22mm" },
  "Indicator / Pilot Light":        { lamp_type: "LED", mounting_cutout: "22mm" },
};

const TYPES_WITH_CURRENT_RATING = new Set(["MCB","MCCB","ACB","Fuse","ELCB / RCCB / RCBO"]);
const TYPES_WITH_POWER_KW       = new Set(["VFD (Variable Frequency Drive)","Soft Starter","DOL Starter","Star-Delta Starter","Transformer","UPS"]);
const TYPES_WITH_COIL_VOLTAGE   = new Set(["Contactor","Relay","Timer Relay","DOL Starter","Star-Delta Starter"]);
const TYPES_NO_SYSTEM_VOLTAGE   = new Set(["Indicator / Pilot Light","Current Transformer (CT)","Potential Transformer (PT)","Terminal Block"]);
const TYPES_NO_FREQUENCY        = new Set(["SMPS / Power Supply","Current Transformer (CT)","Potential Transformer (PT)","Terminal Block","Limit Switch","Indicator / Pilot Light"]);
const TYPES_WITH_OWN_STD        = new Set(["MCB","MCCB","ACB","Contactor","DOL Starter","Star-Delta Starter","VFD (Variable Frequency Drive)","Transformer","Current Transformer (CT)","Potential Transformer (PT)","Fuse","ELCB / RCCB / RCBO"]);

function getCompVendors(t: string): string[] {
  if (["MCB","MCCB","ACB","ELCB / RCCB / RCBO"].includes(t))
    return ["ABB","Schneider Electric","Siemens","L&T","Havells","Legrand","C&S","Eaton","Hager"];
  if (["Contactor","Overload Relay","DOL Starter","Star-Delta Starter"].includes(t))
    return ["ABB","Schneider Electric","Siemens","L&T","Chint","Lovato","WEG"];
  if (["VFD (Variable Frequency Drive)","Soft Starter"].includes(t))
    return ["ABB","Schneider Electric","Siemens","Danfoss","Yaskawa","Allen Bradley","Delta","WEG","Mitsubishi"];
  if (t === "Transformer") return ["Siemens","Schneider Electric","ABB","Hammond","Legrand","Servomax"];
  if (t === "SMPS / Power Supply") return ["Phoenix Contact","Weidmuller","Murr Elektronik","Siemens","ABB","Mean Well","Puls"];
  if (t === "UPS") return ["Eaton","APC (Schneider)","ABB","Delta","Vertiv","Emerson"];
  if (["Relay","Timer Relay"].includes(t))
    return ["Omron","Phoenix Contact","Weidmuller","Schneider Electric","ABB","Siemens","Finder"];
  if (["Selector Switch","Push Button","Limit Switch","Indicator / Pilot Light"].includes(t))
    return ["Schneider Electric","ABB","Siemens","IDEC","Eaton","GE"];
  if (t === "Energy Meter") return ["Schneider Electric","ABB","Siemens","L&T","Secure Meters","Elmeasure","HPL"];
  if (["Current Transformer (CT)","Potential Transformer (PT)"].includes(t))
    return ["Kappa","Selec","Crompton","Rishabh","ABB","Siemens","Schneider"];
  if (t === "Fuse") return ["L&T","Siemens","Schneider Electric","Eaton","ETI","Legrand"];
  if (t === "Terminal Block") return ["Weidmuller","Phoenix Contact","WAGO","Entrelec","Elmex"];
  if (["PLC / DCS Module","HMI / Operator Panel"].includes(t))
    return ["Siemens","Allen Bradley","Schneider Electric","ABB","Honeywell","Yokogawa","Delta","Beckhoff","Weintek"];
  return ["ABB","Schneider Electric","Siemens","L&T","Havells"];
}

export function buildComponentsRequirement(attrs: Record<string, unknown>): string {
  const t       = (attrs.component_type   as string)?.trim() || "";
  const voltage = (attrs.voltage          as string)?.trim() || "";
  const currA   = (attrs.current_rating   as string)?.trim() || "";
  const powerKW = (attrs.power_kw         as string)?.trim() || "";
  const ip      = (attrs.ip_rating        as string)?.trim() || "";
  const area    = (attrs.area_classification as string)?.trim() || "";
  const parts: string[] = [];
  if (t) parts.push(t);

  if (["MCB","MCCB","ACB"].includes(t)) {
    if (currA) parts.push(currA);
    if (voltage) parts.push(voltage);
    const poles = (attrs.num_poles as string)?.trim();
    if (poles) parts.push(poles);
    const brk = (attrs.breaking_capacity as string)?.trim();
    if (brk) parts.push(`Breaking ${brk}`);
    if (t === "MCB") {
      const trip = (attrs.trip_characteristic as string)?.trim();
      if (trip) parts.push(`${trip} Curve`);
    }
  } else if (t === "Contactor") {
    if (currA) parts.push(currA);
    if (voltage) parts.push(voltage);
    const duty = (attrs.ac_duty as string)?.trim();
    if (duty) parts.push(duty);
    const coil = (attrs.coil_voltage as string)?.trim();
    if (coil) parts.push(`Coil ${coil}`);
  } else if (t === "Overload Relay") {
    const range = (attrs.current_range as string)?.trim();
    if (range) parts.push(range);
    const cls = (attrs.trip_class as string)?.trim();
    if (cls) parts.push(cls);
  } else if (["VFD (Variable Frequency Drive)","Soft Starter"].includes(t)) {
    if (powerKW) parts.push(`${powerKW} kW`);
    if (voltage) parts.push(voltage);
    if (ip) parts.push(ip);
  } else if (["DOL Starter","Star-Delta Starter"].includes(t)) {
    if (powerKW) parts.push(`${powerKW} kW`);
    if (voltage) parts.push(voltage);
  } else if (t === "Transformer") {
    const kva = (attrs.kva_rating as string)?.trim();
    if (kva) parts.push(`${kva} kVA`);
    const pv = (attrs.primary_voltage as string)?.trim();
    const sv = (attrs.secondary_voltage as string)?.trim();
    if (pv && sv) parts.push(`${pv}/${sv}`);
    else if (pv) parts.push(pv);
  } else if (t === "SMPS / Power Supply") {
    const ov = (attrs.output_voltage as string)?.trim();
    const oa = (attrs.output_current as string)?.trim();
    if (ov) parts.push(ov);
    if (oa) parts.push(oa);
  } else if (t === "UPS") {
    const kva = (attrs.kva_rating as string)?.trim();
    if (kva) parts.push(`${kva} kVA`);
    const backup = (attrs.battery_backup_min as string)?.trim();
    if (backup) parts.push(`${backup} backup`);
  } else if (["Relay","Timer Relay"].includes(t)) {
    const coil = (attrs.coil_voltage as string)?.trim();
    if (coil) parts.push(coil);
    const contact = (attrs.contact_config as string)?.trim();
    if (contact) parts.push(contact);
  } else if (["Selector Switch","Push Button","Limit Switch"].includes(t)) {
    const contact = (attrs.contact_config as string)?.trim();
    if (contact) parts.push(contact);
  } else if (t === "Indicator / Pilot Light") {
    const colour = (attrs.indicator_colour as string)?.trim();
    if (colour) parts.push(colour);
    const indV = (attrs.indicator_voltage as string)?.trim();
    if (indV) parts.push(indV);
  } else if (t === "Energy Meter") {
    const mt = (attrs.meter_type as string)?.trim();
    if (mt) parts.push(mt);
    const acc = (attrs.accuracy_class as string)?.trim();
    if (acc) parts.push(acc);
  } else if (t === "Current Transformer (CT)") {
    const ratio = (attrs.ct_ratio as string)?.trim();
    if (ratio) parts.push(ratio);
    const acc = (attrs.accuracy_class as string)?.trim();
    if (acc) parts.push(acc);
    const burden = (attrs.burden_va as string)?.trim();
    if (burden) parts.push(burden);
  } else if (t === "Potential Transformer (PT)") {
    const ratio = (attrs.pt_ratio as string)?.trim();
    if (ratio) parts.push(ratio);
    const acc = (attrs.accuracy_class as string)?.trim();
    if (acc) parts.push(acc);
  } else if (t === "Fuse") {
    if (currA) parts.push(currA);
    const fsz = (attrs.fuse_size as string)?.trim();
    if (fsz) parts.push(`Size ${fsz}`);
  } else if (t === "Terminal Block") {
    const tbType = (attrs.terminal_type as string)?.trim();
    if (tbType) parts.push(tbType);
    const wire = (attrs.wire_range as string)?.trim();
    if (wire) parts.push(wire);
  } else if (t === "ELCB / RCCB / RCBO") {
    if (currA) parts.push(currA);
    const sens = (attrs.sensitivity_ma as string)?.trim();
    if (sens) parts.push(sens);
  } else if (t === "PLC / DCS Module") {
    const mod = (attrs.plc_module_type as string)?.trim();
    if (mod) parts.push(mod);
    const plat = (attrs.plc_platform as string)?.trim();
    if (plat) parts.push(plat);
  } else if (t === "HMI / Operator Panel") {
    const sz = (attrs.screen_size as string)?.trim();
    if (sz) parts.push(sz);
    const disp = (attrs.display_type as string)?.trim();
    if (disp) parts.push(disp);
  } else {
    if (currA) parts.push(currA);
    if (powerKW) parts.push(`${powerKW} kW`);
    if (voltage) parts.push(voltage);
  }

  if (ip && !parts.includes(ip)) parts.push(ip);
  if (area && area !== "Safe Area") parts.push(area);
  return parts.join(", ");
}

export function ComponentsAttrsForm({
  attrs, qty, onChange, onQtyChange, projectVoltage, projectFrequency,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
  projectVoltage?: string;
  projectFrequency?: string;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  const resolvedProjVolt = resolveProjectVoltage(projectVoltage);
  const resolvedProjFreq = resolveProjectFrequency(projectFrequency);

  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(ALL_COMP_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") {
      setCustom(c => ({ ...c, [key]: true }));
      set(key, "");
    } else {
      setCustom(c => ({ ...c, [key]: false }));
      set(key, val);
    }
  }

  function renderField(key: string, label: string, opts: string[], required?: boolean, projDefault?: string, wrapClass?: string) {
    const curVal    = (attrs[key] as string) ?? "";
    const isCustom  = custom[key] ?? false;
    const selectVal = isCustom ? "__other__" : (opts.includes(curVal) ? curVal : "");
    const fromProj  = !!projDefault && curVal === projDefault;
    return (
      <div className={`space-y-1.5 ${wrapClass ?? ""}`}>
        <Label className="text-xs flex items-center gap-1.5">
          {label}{required && <span className="text-red-500">*</span>}
          {fromProj && (
            <span className="text-[9px] font-normal text-sky-600 bg-sky-50 border border-sky-200 px-1 py-px rounded leading-none">
              project
            </span>
          )}
        </Label>
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={v => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal}
            onChange={e => set(key, e.target.value)} autoFocus />
        )}
      </div>
    );
  }

  function renderText(key: string, label: string, placeholder?: string) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <Input className="h-8 text-sm" placeholder={placeholder ?? `Enter ${label.toLowerCase()}…`}
          value={(attrs[key] as string) ?? ""} onChange={e => set(key, e.target.value)} />
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

  const compType    = (attrs.component_type    as string) ?? "";
  const areaClass   = (attrs.area_classification as string) ?? "";
  const isHazardous = areaClass === "Zone 1" || areaClass === "Zone 2";
  const ctIsCustom  = custom.component_type ?? false;
  const ctSelectVal = ctIsCustom ? "__other__" : (COMP_TYPE_OPTS.includes(compType) ? compType : "");
  const vendors     = getCompVendors(compType);

  function handleTypeSelect(v: string) {
    if (v === "__other__") {
      setCustom(c => ({ ...c, component_type: true }));
      onChange({ ...attrs, component_type: "" });
      return;
    }
    setCustom(c => ({ ...c, component_type: false }));
    const typeDefaults = COMP_TYPE_DEFAULTS[v] ?? {};
    const volt = resolveProjectVoltage(projectVoltage);
    const freq = resolveProjectFrequency(projectFrequency);
    const defaults: Record<string, unknown> = { ...typeDefaults };
    if (volt && !TYPES_NO_SYSTEM_VOLTAGE.has(v)) defaults.voltage = volt;
    if (freq && !TYPES_NO_FREQUENCY.has(v)) defaults.frequency = freq;
    const next: Record<string, unknown> = { ...attrs, component_type: v };
    for (const [key, val] of Object.entries(defaults)) {
      const cur = next[key];
      if (cur === undefined || cur === null || (typeof cur === "string" && !cur.trim())) {
        next[key] = val;
      }
    }
    onChange(next);
  }

  function renderTypeSpecific() {
    const t = compType;
    if (!t) return null;

    if (t === "MCB") return (
      <>
        {renderField("num_poles",           "Number of Poles",    COMP_POLES_ALL, true)}
        {renderField("breaking_capacity",   "Breaking Capacity",  MCB_BREAKING,   true)}
        {renderField("trip_characteristic", "Trip Characteristic",MCB_TRIP,       true)}
        {renderField("component_std",       "Standard",           MCB_STD)}
      </>
    );
    if (t === "MCCB") return (
      <>
        {renderField("num_poles",         "Number of Poles",   COMP_POLES_3P4P, true)}
        {renderField("breaking_capacity", "Breaking Capacity", MCCB_BREAKING,   true)}
        {renderField("release_type",      "Release Type",      MCCB_RELEASE)}
        {renderField("component_std",     "Standard",          MCCB_STD)}
      </>
    );
    if (t === "ACB") return (
      <>
        {renderField("num_poles",         "Number of Poles",   COMP_POLES_3P4P, true)}
        {renderField("breaking_capacity", "Breaking Capacity", ACB_BREAKING,    true)}
        {renderField("release_type",      "Release Type",      ACB_RELEASE)}
        {renderField("draw_out_type",     "Drawout / Fixed",   ACB_DRAWOUT)}
        {renderField("component_std",     "Standard",          ACB_STD)}
        <div />
      </>
    );
    if (t === "Contactor") return (
      <>
        {renderField("num_poles",    "Number of Poles",       COMP_POLES_3P4P, true)}
        {renderField("ac_duty",      "Utilisation Category",  CONT_AC_DUTY,    true)}
        {renderField("aux_contacts", "Auxiliary Contacts",    CONT_AUX)}
        {renderField("component_std","Standard",              CONT_STD)}
      </>
    );
    if (t === "Overload Relay") return (
      <>
        <div className="col-span-3 md:col-span-5">{renderField("current_range", "Current Setting Range", OL_RANGE, true)}</div>
        {renderField("trip_class", "Trip Class", OL_TRIP_CLASS, true)}
        {renderField("relay_type", "Relay Type", OL_TYPE)}
      </>
    );
    if (t === "DOL Starter" || t === "Star-Delta Starter") return (
      <>
        {renderField("contactor_included", "Contactor Included", COMP_YES_NO)}
        {renderField("overload_included",  "Overload Included",  COMP_YES_NO)}
        {renderField("component_std",      "Standard",           STARTER_STD)}
        <div />
      </>
    );
    if (t === "VFD (Variable Frequency Drive)") return (
      <>
        {renderField("control_type",    "Control Type",    VFD_CONTROL, true)}
        {renderField("communication",   "Communication",   VFD_COMM)}
        {renderField("bypass_provision","Bypass Provision",COMP_YES_NO)}
        {renderField("component_std",   "Standard",        VFD_STD)}
      </>
    );
    if (t === "Soft Starter") return (
      <>
        {renderField("bypass_provision","Bypass Provision", COMP_YES_NO)}
        {renderField("communication",   "Communication",    VFD_COMM)}
        <div /><div />
      </>
    );
    if (t === "Transformer") return (
      <>
        {renderField("transformer_type", "Transformer Type",   XFMR_TYPE,         true)}
        {renderField("kva_rating",       "kVA Rating",         XFMR_KVA,          true)}
        {renderField("primary_voltage",  "Primary Voltage",    COMP_VOLTAGE_OPTS,  true)}
        {renderField("secondary_voltage","Secondary Voltage",  XFMR_SEC_V,         true)}
        {renderField("insulation_class", "Insulation Class",   XFMR_INSUL)}
        {renderField("component_std",    "Standard",           XFMR_STD)}
      </>
    );
    if (t === "SMPS / Power Supply") return (
      <>
        {renderField("output_voltage", "Output Voltage", SMPS_OUT_V, true)}
        {renderField("output_current", "Output Current", SMPS_OUT_A, true)}
        {renderField("redundancy",     "Redundancy",     SMPS_REDUND)}
        <div />
      </>
    );
    if (t === "UPS") return (
      <>
        {renderField("kva_rating",         "kVA Rating",    UPS_KVA,      true)}
        {renderField("ups_topology",       "Topology",      UPS_TOPOLOGY, true)}
        {renderField("battery_backup_min", "Battery Backup",UPS_BACKUP)}
        {renderField("battery_type",       "Battery Type",  UPS_BATTERY)}
      </>
    );
    if (t === "Relay") return (
      <>
        {renderField("relay_category", "Relay Category",        RELAY_CAT,     true)}
        {renderField("contact_config", "Contact Configuration", RELAY_CONTACT, true)}
        {renderField("relay_socket",   "Socket / Base",         RELAY_SOCKET)}
        <div />
      </>
    );
    if (t === "Timer Relay") return (
      <>
        {renderField("timer_function", "Timer Function", TIMER_FUNC,  true)}
        {renderField("time_range",     "Time Range",     TIMER_RANGE, true)}
      </>
    );
    if (t === "Selector Switch") return (
      <>
        {renderField("switch_positions","Positions",       SW_POSITIONS, true)}
        {renderField("contact_config",  "Contact",        SW_CONTACT,   true)}
        {renderField("actuator_colour", "Actuator Colour",SW_COLOUR)}
        {renderField("operator_type",   "Operator Type",  SW_OPERATOR)}
        {renderField("mounting_cutout", "Mounting Cutout",SW_CUTOUT)}
        <div />
      </>
    );
    if (t === "Push Button") return (
      <>
        {renderField("pb_type",         "Button Type",    PB_TYPES,   true)}
        {renderField("contact_config",  "Contact",        SW_CONTACT, true)}
        {renderField("actuator_colour", "Actuator Colour",SW_COLOUR)}
        {renderField("operator_type",   "Operator Type",  SW_OPERATOR)}
        {renderField("mounting_cutout", "Mounting Cutout",SW_CUTOUT)}
        <div />
      </>
    );
    if (t === "Limit Switch") return (
      <>
        {renderField("contact_config", "Contact", SW_CONTACT, true)}
        <div />
      </>
    );
    if (t === "Indicator / Pilot Light") return (
      <>
        {renderField("indicator_colour",  "Colour",            IND_COLOUR,  true)}
        {renderField("indicator_voltage", "Indicator Voltage", IND_VOLTAGE, true)}
        {renderField("lamp_type",         "Lamp Type",         IND_LAMP)}
        {renderField("mounting_cutout",   "Mounting Cutout",   SW_CUTOUT)}
      </>
    );
    if (t === "Energy Meter") return (
      <>
        {renderField("meter_type",    "Meter Type",     EM_TYPE,     true)}
        {renderField("accuracy_class","Accuracy Class", EM_ACCURACY, true)}
        {renderField("communication", "Communication",  EM_COMM)}
        {renderField("meter_display", "Display",        EM_DISPLAY)}
      </>
    );
    if (t === "Current Transformer (CT)") return (
      <>
        {renderField("ct_ratio",       "CT Ratio",       CT_RATIO,    true)}
        {renderField("accuracy_class", "Accuracy Class", CT_ACCURACY, true)}
        {renderField("burden_va",      "Burden (VA)",    CT_BURDEN)}
        {renderField("core_type",      "Core Type",      CT_CORE)}
        {renderField("component_std",  "Standard",       CT_STD)}
        <div />
      </>
    );
    if (t === "Potential Transformer (PT)") return (
      <>
        {renderField("pt_ratio",       "PT Ratio",       PT_RATIO,    true)}
        {renderField("accuracy_class", "Accuracy Class", PT_ACCURACY, true)}
        {renderField("component_std",  "Standard",       PT_STD)}
        <div />
      </>
    );
    if (t === "Fuse") return (
      <>
        {renderField("fuse_type",         "Fuse Type",         FUSE_TYPE,     true)}
        {renderField("fuse_size",         "Fuse Size",         FUSE_SIZE)}
        {renderField("breaking_capacity", "Breaking Capacity", FUSE_BREAKING)}
        {renderField("component_std",     "Standard",          FUSE_STD)}
      </>
    );
    if (t === "Terminal Block") return (
      <>
        {renderField("terminal_type",    "Terminal Type",   TB_TYPE,     true)}
        {renderField("wire_range",       "Wire Range",      TB_WIRE,     true)}
        {renderField("terminal_current", "Current Rating",  TB_CURRENT)}
        {renderText( "qty_per_set",      "Qty per Set",     "e.g. 24 way")}
      </>
    );
    if (t === "ELCB / RCCB / RCBO") return (
      <>
        {renderField("elcb_type",      "Device Type",      ELCB_TYPE,  true)}
        {renderField("elcb_poles",     "Number of Poles",  ELCB_POLES, true)}
        {renderField("sensitivity_ma", "Sensitivity (mA)", ELCB_SENS,  true)}
        {renderField("component_std",  "Standard",         ELCB_STD)}
      </>
    );
    if (t === "PLC / DCS Module") return (
      <>
        {renderField("plc_module_type", "Module Type", PLC_MODULE,   true)}
        <div className="col-span-3 md:col-span-5">{renderField("plc_platform", "Platform / Series", PLC_PLATFORM, true)}</div>
        {renderField("communication",   "Communication",             PLC_COMM)}
        {renderText( "io_count",        "I/O Count",                 "e.g. 16 DI / 16 DO")}
      </>
    );
    if (t === "HMI / Operator Panel") return (
      <>
        {renderField("screen_size",   "Screen Size (inch)", HMI_SIZE,     true)}
        {renderField("display_type",  "Display Type",       HMI_DISPLAY,  true)}
        <div className="col-span-3 md:col-span-5">{renderField("hmi_platform", "Platform", HMI_PLATFORM)}</div>
        {renderField("communication", "Communication",      HMI_COMM)}
        <div />
      </>
    );
    return null;
  }

  const showVoltage    = compType !== "" && !TYPES_NO_SYSTEM_VOLTAGE.has(compType);
  const showFrequency  = compType !== "" && !TYPES_NO_FREQUENCY.has(compType);
  const showCurrentA   = compType !== "" && TYPES_WITH_CURRENT_RATING.has(compType);
  const showPowerKW    = compType !== "" && TYPES_WITH_POWER_KW.has(compType);
  const showCoilVolt   = compType !== "" && TYPES_WITH_COIL_VOLTAGE.has(compType);
  const showFallbackStd = compType !== "" && !TYPES_WITH_OWN_STD.has(compType);

  return (
    <div className="space-y-3">

      {/* 1 — Component Identity */}
      <SectionCard title="Component Identity" color="bg-sky-50/60 border-sky-200">
        <div className="col-span-3 md:col-span-5 space-y-1.5">
          <Label className="text-xs">Component Type <span className="text-red-500">*</span></Label>
          <SearchableSelect value={ctSelectVal} options={COMP_TYPE_OPTS}
            placeholder="Select component type…" onSelect={handleTypeSelect} />
          {ctIsCustom && (
            <Input className="h-8 text-sm" placeholder="Enter custom component type…" value={compType}
              onChange={e => onChange({ ...attrs, component_type: e.target.value })} autoFocus />
          )}
        </div>
        {renderText("make",          "Make / Brand")}
        {renderText("model_no",      "Model / Catalogue No.")}
        {renderText("tag_reference", "Tag Reference")}
        <div />
      </SectionCard>

      {/* 2 — Electrical Rating */}
      {compType && (
        <SectionCard title="Electrical Rating" color="bg-violet-50/60 border-violet-200">
          {showVoltage  && renderField("voltage",        "Voltage",                COMP_VOLTAGE_OPTS,  true, resolvedProjVolt)}
          {showFrequency && renderField("frequency",     "Frequency",              COMP_FREQ_OPTS,     true, resolvedProjFreq)}
          {showCurrentA  && renderField("current_rating","Current Rating",         COMP_CURRENT_OPTS,  true)}
          {showPowerKW   && renderField("power_kw",      "Power (kW)",             COMP_POWER_KW_OPTS, true)}
          {showCoilVolt  && renderField("coil_voltage",  "Coil / Control Voltage", COMP_COIL_V_OPTS,   true)}
          {!showVoltage && !showFrequency && !showCurrentA && !showPowerKW && !showCoilVolt && (
            <div className="col-span-3 md:col-span-5 text-xs text-muted-foreground italic py-1">
              No electrical rating fields applicable for this component type.
            </div>
          )}
        </SectionCard>
      )}

      {/* 3 — Type Configuration */}
      {compType && (
        <SectionCard title="Type Configuration" color="bg-amber-50/60 border-amber-200">
          {renderTypeSpecific()}
        </SectionCard>
      )}

      {/* 4 — Mounting & Enclosure */}
      <SectionCard title="Mounting & Enclosure" color="bg-emerald-50/60 border-emerald-200">
        {renderField("mounting_type", "Mounting Type", COMP_MOUNTING_OPTS)}
        {renderField("ip_rating",     "IP Rating",     COMP_IP_OPTS)}
      </SectionCard>

      {/* 5 — Make */}
      {compType && (
        <SectionCard title="Make" color="bg-teal-50/60 border-teal-200">
          <div className="col-span-3 md:col-span-5">{renderField("make", "Make", vendors, true)}</div>
        </SectionCard>
      )}

      {/* 6 — Area Classification */}
      <SectionCard title="Area Classification" color="bg-rose-50/60 border-rose-200">
        <div className="col-span-3 md:col-span-5">
          {renderField("area_classification", "Area Classification", COMP_AREA_OPTS)}
        </div>
        {isHazardous && (
          <>
            {renderField("explosion_protection", "Explosion Protection", COMP_EX_PROT_OPTS, true)}
            {renderField("gas_group",             "Gas Group",           COMP_GAS_GRP_OPTS, true)}
            {renderField("temperature_class",     "Temperature Class",   COMP_TEMP_CLS_OPTS, true)}
            {renderField("certification",         "Certification",       COMP_CERT_OPTS,     true)}
          </>
        )}
      </SectionCard>

      {/* 7 — Standards & Notes */}
      <SectionCard title="Standards & Notes" color="bg-slate-50/80 border-slate-200">
        {showFallbackStd && (
          <>
            {renderField("component_std", "Applicable Standard", COMP_FALLBACK_STD)}
            <div />
          </>
        )}
        <div className="col-span-3 md:col-span-5 space-y-1.5">
          <Label className="text-xs">Additional Notes</Label>
          <Input className="h-8 text-sm" placeholder="Any additional requirements…"
            value={(attrs.notes as string) ?? ""} onChange={e => set("notes", e.target.value)} />
        </div>
        {qty !== undefined && (
          <div className="space-y-1.5 col-span-3 md:col-span-5">
            <Label className="text-xs">Quantity (Nos.) <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={e => e.currentTarget.blur()}
              onChange={e => {
                const v = e.target.value;
                onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v)))));
              }} />
          </div>
        )}
      </SectionCard>

    </div>
  );
}

export function BoughtOutAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
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

  const sec = (title: string) => (
    <p className="text-[11px] font-semibold text-primary uppercase tracking-wide col-span-3 md:col-span-5 border-b pb-1 mt-1">{title}</p>
  );
  const renderSS = (key: string, label: string, opts: string[], required = false) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <SearchableSelect
        options={opts} value={(attrs[key] as string) ?? ""}
        onSelect={(v) => set(key, v === "__other__" ? "" : v)}
        placeholder={`Select ${label}…`}
      />
    </div>
  );
  const renderOtherText = (key: string, label: string, opts: string[]) => {
    const val = (attrs[key] as string) ?? "";
    const isOther = val === "__other__";
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <SearchableSelect options={opts} value={val} onSelect={(v) => set(key, v)} placeholder={`Select ${label}…`} />
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
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {sec("Package Type")}
        {renderSS("package_type", "Package Type", BOUGHT_OUT_PKG_TYPE_OPTS, true)}
        <div />

        {sec("Capacity / Duty")}
        {renderOtherText("capacity", "Capacity", BOUGHT_OUT_CAPACITY_OPTS)}
        {renderSS("duty_type", "Duty Type", BOUGHT_OUT_DUTY_OPTS)}

        {sec("Configuration")}
        {renderSS("number_of_units", "Number of Units", BOUGHT_OUT_UNITS_OPTS)}
        {renderSS("configuration",   "Configuration",   BOUGHT_OUT_CONFIG_OPTS)}

        {sec("Major Components")}
        <div className="col-span-3 md:col-span-5 space-y-1.5">
          <Label className="text-xs">Package Components <span className="text-red-500">*</span></Label>
          <div className="flex flex-wrap gap-1.5">
            {BOUGHT_OUT_COMPONENTS.map(chip => (
              <button key={chip} type="button" onClick={() => toggleComp(chip)}
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
        {renderSS("fluid_type",            "Fluid Type",            BOUGHT_OUT_FLUID_OPTS)}
        {renderSS("operating_temperature", "Operating Temperature", BOUGHT_OUT_TEMP_OPTS)}

        {sec("Construction")}
        {renderSS("material_class", "Material Class", BOUGHT_OUT_MATERIAL_OPTS)}
        <div />

        {sec("Area / Compliance")}
        {renderSS("area_classification", "Area Classification", BOUGHT_OUT_AREA_OPTS)}
        {renderSS("certification",       "Certification",       BOUGHT_OUT_CERT_OPTS)}

        {sec("Make")}
        <div className="col-span-3 md:col-span-5">{renderSS("make", "Make", BOUGHT_OUT_VENDOR_CHIPS, true)}</div>

        {qty !== undefined && (
          <div className="space-y-1.5 col-span-3 md:col-span-5">
            <Label className="text-xs">Quantity (Systems) <span className="text-red-500">*</span></Label>
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
