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
const PANEL_OPTS = {
  panel_type:           PANEL_TYPES,
  enclosure_type:       ["Floor Standing", "Wall Mounted", "Desktop", "Rack Mounted"],
  voltage:              ["415V AC (3Ph)", "380V AC (3Ph)", "440V AC (3Ph)", "480V AC (3Ph)", "690V AC (3Ph)", "240V AC (1Ph)", "110V AC (1Ph)", "48V DC", "24V DC"],
  busbar_material:      ["Copper", "Aluminium", "Copper Tin Plated"],
  enclosure_material:   ["CRCA Steel", "SS304", "SS316", "Aluminium", "GRP/FRP"],
  ip_rating:            ["IP20", "IP42", "IP54", "IP55", "IP65", "IP66"],
  form_of_separation:   ["Form 2b", "Form 3b", "Form 4b"],
  short_circuit_rating: ["10 kA", "25 kA", "36 kA", "50 kA", "65 kA"],
  interlocking:         ["None", "Electrical Interlocking", "Mechanical Interlocking", "Both"],
  area_classification:  ["Safe Area", "Zone 1", "Zone 2"],
  anti_condensation:    ["Yes", "No"],
  aux_power_supply:     ["24V DC", "230V AC", "110V DC", "48V DC"],
  testing_std:          ["IEC 61439-1", "IEC 61439-2", "IEC 60439", "IS 8623", "UL 508A"],
  bus_rating:           ["100A", "200A", "400A", "630A", "800A", "1000A", "1600A", "2000A"],
  num_incomer_units:    ["1", "2", "3"],
};

export function buildPanelRequirement(attrs: Record<string, unknown>): string {
  const panelType     = (attrs.panel_type         as string)?.trim() || "";
  const voltage       = (attrs.voltage            as string)?.trim() || "";
  const busRating     = (attrs.bus_rating         as string)?.trim() || "";
  const scRating      = (attrs.short_circuit_rating as string)?.trim() || "";
  const ipRating      = (attrs.ip_rating          as string)?.trim() || "";
  const encType       = (attrs.enclosure_type     as string)?.trim() || "";
  const areaClass     = (attrs.area_classification as string)?.trim() || "";
  const parts: string[] = [];
  if (panelType) parts.push(panelType);
  if (voltage)   parts.push(voltage);
  if (busRating) parts.push(`${busRating} Bus`);
  if (scRating)  parts.push(`${scRating} SC Rating`);
  if (ipRating)  parts.push(ipRating);
  if (encType)   parts.push(encType);
  if (areaClass && areaClass !== "Safe Area") parts.push(areaClass);
  return parts.join(", ");
}

export function PanelAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
  const allKeys = [...Object.keys(PANEL_OPTS), "num_feeders", "phase", "neutral", "earth"];
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const key of allKeys) {
      const val  = (attrs[key] as string) ?? "";
      const opts = (PANEL_OPTS as Record<string, string[]>)[key] ?? [];
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
        <SearchableSelect value={selectVal} options={opts} placeholder="Select…" onSelect={(v) => handleSelect(key, v)} />
        {isCustom && (
          <Input className="h-8 text-sm" placeholder="Enter custom value…" value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus />
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

  function sec(label: string) {
    return (
      <p className="text-[11px] font-semibold text-primary uppercase tracking-wide col-span-2 border-b pb-1 mt-1">{label}</p>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Panel Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {sec("Panel Type")}
        <div className="col-span-2">{renderField("panel_type", "Panel Type", PANEL_OPTS.panel_type, true)}</div>

        {sec("Electrical Rating")}
        {renderField("voltage",          "Voltage",              PANEL_OPTS.voltage,              true)}
        {renderField("bus_rating",       "Bus Rating (A)",       PANEL_OPTS.bus_rating,           true)}
        {renderField("short_circuit_rating","Short Circuit Rating",PANEL_OPTS.short_circuit_rating,true)}
        {renderField("num_incomer_units","No. of Incomer Units",  PANEL_OPTS.num_incomer_units)}

        {sec("Incoming / Feeder")}
        {renderText("incomer_rating", "Incomer Rating",  "e.g. 630A ACB")}
        {renderText("num_feeders",    "Number of Feeders","e.g. 12")}

        {sec("Enclosure")}
        {renderField("enclosure_type",     "Enclosure Type",     PANEL_OPTS.enclosure_type,     true)}
        {renderField("enclosure_material", "Enclosure Material", PANEL_OPTS.enclosure_material, true)}
        {renderField("ip_rating",          "IP Rating",          PANEL_OPTS.ip_rating,          true)}
        {renderField("form_of_separation", "Form of Separation", PANEL_OPTS.form_of_separation)}

        {sec("Busbars & Construction")}
        {renderField("busbar_material", "Busbar Material", PANEL_OPTS.busbar_material, true)}
        {renderField("interlocking",    "Interlocking",    PANEL_OPTS.interlocking)}

        {sec("Accessories & Auxiliary")}
        {renderField("anti_condensation","Anti-condensation Heater",PANEL_OPTS.anti_condensation)}
        {renderField("aux_power_supply", "Auxiliary Power Supply",  PANEL_OPTS.aux_power_supply)}

        {sec("Area / Testing")}
        {renderField("area_classification","Area Classification",PANEL_OPTS.area_classification)}
        {renderField("testing_std",        "Testing Standard",   PANEL_OPTS.testing_std)}

        {sec("Notes")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Additional Notes</Label>
          <Input className="h-8 text-sm" placeholder="Any additional requirements…"
            value={(attrs.notes as string) ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>

        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity (Panels) <span className="text-red-500">*</span></Label>
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

  function renderField(key: string, label: string, required?: boolean) {
    const opts      = CABLE_ALL_OPTS[key] ?? [];
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
      <p className="text-[11px] font-semibold text-primary uppercase tracking-wide col-span-2 border-b pb-1 mt-1">{label}</p>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cabling Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {sec("Cable Type")}
        <div className="col-span-2">{renderField("cable_type",  "Cable Type",    true)}</div>

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
          <div className="space-y-1.5 col-span-2">
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
  const selectedVendors = ((attrs.approved_makes  as string) ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const encType         = (attrs.enclosure_type as string) ?? "";

  function toggleAcc(chip: string) {
    const next = selectedAcc.includes(chip)
      ? selectedAcc.filter(a => a !== chip)
      : [...selectedAcc, chip];
    set("accessories", next.join(", "));
  }
  function toggleVendor(chip: string) {
    const next = selectedVendors.includes(chip)
      ? selectedVendors.filter(v => v !== chip)
      : [...selectedVendors, chip];
    set("approved_makes", next.join(", "));
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
      <p className="text-[11px] font-semibold text-primary uppercase tracking-wide col-span-2 border-b pb-1 mt-1">{label}</p>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Junction Box Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {sec("JB Type & Construction")}
        <div className="col-span-2">{ss("jb_type", "JB Type", JB_TYPE_OPTS, true)}</div>
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

        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
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

        {sec("Approved Makes")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Approved Makes</Label>
          <div className="flex flex-wrap gap-1.5">
            {CT_VENDOR_CHIPS.map(chip => (
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

        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
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
      <div className="grid grid-cols-2 gap-3">
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
        <div className="col-span-2 space-y-1.5">
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

        {sec("Approved Package Vendors")}
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Approved Vendors</Label>
          <div className="flex flex-wrap gap-1.5">
            {BOUGHT_OUT_VENDOR_CHIPS.map(chip => (
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
          <Input className="h-8 text-sm" placeholder="Other vendors (comma-separated)…"
            value={(attrs.approved_vendors_other as string) ?? ""}
            onChange={(e) => set("approved_vendors_other", e.target.value)} />
        </div>

        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
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
