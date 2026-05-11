import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

// ─────────────────────────────────────────────────────────────────────────────
// PLATES
// ─────────────────────────────────────────────────────────────────────────────
export function buildPlatesRequirement(attrs: Record<string, unknown>): string {
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

const PLATE_OPTS: Record<string, string[]> = {
  plate_type:     ["MS", "SS 304", "SS 316", "Chequered", "Boiler Quality Plate"],
  material_grade: ["IS 2062 E250", "IS 2062 E350", "SA 516 Gr 60", "SA 516 Gr 65", "SA 516 Gr 70", "ASTM A36", "SS 304", "SS 316"],
  thickness_mm:   ["3", "5", "6", "8", "10", "12", "16", "20", "25", "32", "40"],
  width_mm:       ["1000", "1250", "1500", "2000", "2500"],
  length_mm:      ["2000", "2500", "3000", "6000"],
  standard:       ["IS 2062", "ASTM A36", "ASTM A516", "ASME SA-516", "DIN", "EN", "JIS"],
};

export function PlatesAttrsForm({
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
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plate Specifications</p>
      <div className="grid grid-cols-2 gap-3">
        {renderField("plate_type",     "Plate Type",      true)}
        {renderField("material_grade", "Material Grade")}
        {renderField("thickness_mm",   "Thickness (mm)",  true)}
        {renderField("width_mm",       "Width (mm)")}
        {renderField("length_mm",      "Length (mm)")}
        {renderField("standard",       "Standard")}
        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input
              className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPES
// ─────────────────────────────────────────────────────────────────────────────
export function buildPipesRequirement(attrs: Record<string, unknown>): string {
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

export function PipesAttrsForm({
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
        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input
              className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FITTINGS
// ─────────────────────────────────────────────────────────────────────────────
export function buildFittingsRequirement(attrs: Record<string, unknown>): string {
  const fittingType = (attrs.fitting_type as string)?.trim() || "";
  const endType     = (attrs.end_type     as string)?.trim() || "";
  const sizeNb      = (attrs.size_nb      as string)?.trim() || "";
  const rating      = (attrs.rating       as string)?.trim() || "";
  const material    = (attrs.material     as string)?.trim() || "";
  const standard    = (attrs.standard     as string)?.trim() || "";
  const endAbbr: Record<string, string> = {
    "Threaded": "THD", "Socket Weld": "SW", "Butt Weld": "BW", "Flanged": "FLG",
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

const FITTING_OPTS: Record<string, string[]> = {
  fitting_type: ["Elbow", "Tee", "Reducer", "Union", "Coupling", "Cap", "Cross", "Nipple"],
  end_type:     ["Threaded", "Socket Weld", "Butt Weld", "Flanged"],
  size_nb:      ["15", "20", "25", "32", "40", "50", "65", "80", "100", "150", "200", "250", "300"],
  rating:       ["Class 150", "Class 300", "Class 600", "PN10", "PN16", "PN25", "PN40"],
  material:     ["MS", "CS", "SS 304", "SS 316", "GI", "Alloy Steel"],
  standard:     ["ASME B16.9", "ASME B16.11", "IS", "DIN", "EN"],
};

export function FittingsAttrsForm({
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
          value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)}
        />
        {isCustom && (
          <Input
            className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus
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
        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input
              className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLANGES
// ─────────────────────────────────────────────────────────────────────────────
export function buildFlangesRequirement(attrs: Record<string, unknown>): string {
  const flangeType = (attrs.flange_type as string)?.trim() || "";
  const sizeNb     = (attrs.size_nb     as string)?.trim() || "";
  const pressure   = (attrs.pressure    as string)?.trim() || "";
  const facing     = (attrs.facing      as string)?.trim() || "";
  const material   = (attrs.material    as string)?.trim() || "";
  const standard   = (attrs.standard    as string)?.trim() || "";
  const typeAbbr: Record<string, string> = {
    "Weld Neck (WN)": "WN Flange", "Slip-On (SO)": "SO Flange",
    "Blind (BL)": "Blind Flange", "Socket Weld (SW)": "SW Flange",
    "Threaded (THD)": "THD Flange", "Lap Joint (LJ)": "LJ Flange",
    "Orifice": "Orifice Flange", "Spectacle Blind": "Spectacle Blind",
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

const FLANGE_OPTS: Record<string, string[]> = {
  flange_type: ["Weld Neck (WN)", "Slip-On (SO)", "Blind (BL)", "Socket Weld (SW)", "Threaded (THD)", "Lap Joint (LJ)", "Orifice", "Spectacle Blind"],
  size_nb:     ["15", "20", "25", "32", "40", "50", "65", "80", "100", "150", "200", "250", "300"],
  pressure:    ["Class 150", "Class 300", "Class 600", "Class 900", "PN10", "PN16", "PN25", "PN40"],
  facing:      ["RF (Raised Face)", "FF (Flat Face)", "RTJ (Ring Type Joint)"],
  material:    ["MS", "CS", "ASTM A105", "SS 304", "SS 316", "Alloy Steel"],
  standard:    ["ASME B16.5", "ASME B16.47", "DIN", "EN", "IS"],
};

export function FlangesAttrsForm({
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
          value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)}
        />
        {isCustom && (
          <Input
            className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus
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
        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input
              className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FASTENERS
// ─────────────────────────────────────────────────────────────────────────────
export function buildFastenersRequirement(attrs: Record<string, unknown>): string {
  const fastenerType = (attrs.fastener_type as string)?.trim() || "";
  const size         = (attrs.size_dia      as string)?.trim() || "";
  const length       = (attrs.length        as string)?.trim() || "";
  const grade        = (attrs.grade         as string)?.trim() || "";
  const finish       = (attrs.finish        as string)?.trim() || "";
  const standard     = (attrs.standard      as string)?.trim() || "";
  const finishAbbr: Record<string, string> = {
    "Hot Dip Galvanized (HDG)": "HDG", "Zinc Plated": "ZP",
    "PTFE Coated": "PTFE", "Black": "Black",
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

export function FastenersAttrsForm({
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
          value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)}
        />
        {isCustom && (
          <Input
            className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus
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
        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input
              className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GASKETS
// ─────────────────────────────────────────────────────────────────────────────
export function buildGasketsRequirement(attrs: Record<string, unknown>): string {
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

const GASKET_OPTS: Record<string, string[]> = {
  gasket_type: ["Full Face", "Ring Type", "Spiral Wound", "CAF (Compressed Asbestos Free)", "PTFE", "Graphite", "Rubber", "Metallic"],
  size_nb:     ["15", "20", "25", "32", "40", "50", "65", "80", "100", "150", "200", "250", "300"],
  pressure:    ["Class 150", "Class 300", "Class 600", "PN10", "PN16", "PN25", "PN40"],
  thickness:   ["1", "1.5", "2", "3", "4", "5"],
  material:    ["CAF", "PTFE", "Graphite", "Rubber", "SS Spiral Wound"],
  standard:    ["ASME B16.20", "ASME B16.21", "IS", "DIN", "EN"],
};

export function GasketsAttrsForm({
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
          value={selectVal} options={opts} placeholder="Select…"
          onSelect={(v) => handleSelect(key, v)}
        />
        {isCustom && (
          <Input
            className="h-8 text-sm" placeholder="Enter custom value…"
            value={curVal} onChange={(e) => set(key, e.target.value)} autoFocus
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
        {qty !== undefined && (
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
            <Input
              className="h-8 text-sm" type="number" min="1" step="1"
              value={qty}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => { const v = e.target.value; onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v))))); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL STEEL
// ─────────────────────────────────────────────────────────────────────────────
export function buildStructuralSteelRequirement(attrs: Record<string, unknown>): string {
  const sectionType = (attrs.section_type  as string)?.trim() || "";
  const size        = (attrs.size          as string)?.trim() || "";
  const thickness   = (attrs.thickness_mm  as string)?.trim() || "";
  const length      = (attrs.length        as string)?.trim() || "";
  const matGrade    = (attrs.material_grade as string)?.trim() || "";
  const standard    = (attrs.standard      as string)?.trim() || "";
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

const STRUCTURAL_SHOW_THICKNESS = new Set([
  "Plate (for structural use)", "T-Section", "Flat Bar", "Square Bar",
]);

export function StructuralSteelAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });
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

  const sectionTypes = Object.keys(STRUCTURAL_SIZE_BY_TYPE);
  const [sectionCustom, setSectionCustom] = useState(() => {
    const v = (attrs.section_type as string) ?? "";
    return v !== "" && !sectionTypes.includes(v);
  });

  const sectionType = (attrs.section_type as string) ?? "";
  const sizeOpts    = STRUCTURAL_SIZE_BY_TYPE[sectionType] ?? [];
  const showThickness = STRUCTURAL_SHOW_THICKNESS.has(sectionType);

  function handleSectionSelect(val: string) {
    if (val === "__other__") {
      setSectionCustom(true);
      onChange({ ...attrs, section_type: "", size: "" });
    } else {
      setSectionCustom(false);
      onChange({ ...attrs, section_type: val, size: "" });
      setCustom((c) => ({ ...c, size: false }));
    }
  }

  function handleSelect(key: string, val: string, _opts: string[]) {
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
        {showThickness && renderCommonField("thickness_mm", "Thickness (mm)", STRUCTURAL_COMMON_OPTS.thickness_mm)}
        {renderCommonField("material_grade", "Material Grade", STRUCTURAL_COMMON_OPTS.material_grade)}
        {renderCommonField("length",         "Length",         STRUCTURAL_COMMON_OPTS.length        )}
        {renderCommonField("standard",       "Standard",       STRUCTURAL_COMMON_OPTS.standard      )}
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
