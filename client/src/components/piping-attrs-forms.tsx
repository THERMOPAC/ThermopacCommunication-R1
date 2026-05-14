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
      <PopoverContent className="w-64 p-0" align="start">
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

// ── SectionCard ───────────────────────────────────────────────────────────────
function SectionCard({ title, color, children }: {
  title: string; color: string; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${color} p-4 space-y-3`}>
      <h4 className="text-xs font-bold uppercase tracking-widest text-foreground/70 pb-1 border-b border-border/60">
        {title}
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {children}
      </div>
    </div>
  );
}

// ── Shared option lists ───────────────────────────────────────────────────────
const COMMON_NB = [
  "15NB","20NB","25NB","32NB","40NB","50NB","65NB","80NB",
  "100NB","125NB","150NB","200NB","250NB","300NB",
  "350NB","400NB","450NB","500NB","600NB",
  "650NB","700NB","750NB","800NB","900NB","1000NB","1200NB",
];
const COMMON_SCHEDULE      = ["SCH 10","SCH 20","SCH 40","SCH 80","SCH 160","XXS","STD","XS"];
const PRESSURE_CLASS_OPTS  = ["150#","300#","600#","900#","1500#","2500#"];
const FACING_OPTS          = ["RF (Raised Face)","FF (Flat Face)","RTJ (Ring Type Joint)"];
const YES_NO               = ["Yes","No"];
const HEAT_TREATMENT_OPTS  = ["None","Normalized","PWHT","Quenched & Tempered","Annealed","Stress Relieved"];

// ── Dynamic helpers ───────────────────────────────────────────────────────────
function derivePipeStandard(grade: string): string {
  const g = grade.toUpperCase();
  if (g.startsWith("A106"))    return "ASTM A106";
  if (g.startsWith("A312"))    return "ASTM A312";
  if (g.startsWith("A335"))    return "ASTM A335";
  if (g.startsWith("A53"))     return "ASTM A53";
  if (g.startsWith("IS 1239")) return "IS 1239";
  if (g.startsWith("IS 3589")) return "IS 3589";
  if (g.startsWith("IS 6630")) return "IS 6630";
  if (g.includes("DUPLEX"))    return "ASTM A790";
  if (g.includes("ERW"))       return "IS 3589";
  if (g.startsWith("API 5L"))  return "API 5L";
  return "";
}

function deriveFlangeStandard(nb: string): string {
  const m = nb.match(/^(\d+)NB$/i);
  if (!m) return "ASME B16.5";
  return parseInt(m[1]) > 600 ? "ASME B16.47A" : "ASME B16.5";
}

function derivePlateStandard(grade: string): string {
  const MAP: Record<string, string> = {
    "IS 2062 E250":   "IS 2062",
    "IS 2062 E350":   "IS 2062",
    "SS304":          "IS 6911",
    "SS304L":         "IS 6911",
    "SS316":          "IS 6911",
    "SS316L":         "IS 6911",
    "SA 516 Gr 60":   "ASME Sec. II Part A",
    "SA 516 Gr 70":   "ASME Sec. II Part A",
    "ASTM A36":       "ASME Sec. II Part A",
    "SA-240 Gr 304":  "ASME Sec. II Part A",
    "SA-240 Gr 304L": "ASME Sec. II Part A",
    "SA-240 Gr 316":  "ASME Sec. II Part A",
    "SA-240 Gr 316L": "ASME Sec. II Part A",
  };
  return MAP[grade] ?? "";
}

function getStructuralMtrDefault(grade: string): string {
  const g = grade.toUpperCase();
  if (g.startsWith("SS") || g.includes("DUPLEX")) return "Yes";
  return "No";
}

function deriveStructuralStandard(grade: string): string {
  if (grade.startsWith("IS 2062"))      return "IS 2062";
  if (grade === "ASTM A36")             return "ASTM A36";
  if (grade === "ASTM A500")            return "ASTM A500";
  if (grade.startsWith("ASTM A572"))    return "ASTM A572";
  if (grade === "EN S275" || grade === "EN S355") return "EN 10025";
  return "";
}

// ── Qty field (integer-only, no scroll-wheel) ─────────────────────────────────
function QtyField({ qty, onQtyChange }: { qty?: string; onQtyChange?: (q: string) => void }) {
  if (qty === undefined) return null;
  return (
    <div className="space-y-1.5 col-span-3">
      <Label className="text-xs">Quantity <span className="text-red-500">*</span></Label>
      <Input className="h-8 text-sm" type="number" min="1" step="1"
        value={qty}
        onWheel={(e) => e.currentTarget.blur()}
        onChange={(e) => {
          const v = e.target.value;
          onQtyChange?.(v === "" ? "" : String(Math.max(1, Math.trunc(Number(v)))));
        }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PLATES
// ─────────────────────────────────────────────────────────────────────────────
const PLATES_MATERIAL_GRADES = [
  "IS 2062 E250","IS 2062 E350",
  "SS304","SS304L","SS316","SS316L",
  "SA 516 Gr 60","SA 516 Gr 70","ASTM A36",
  "SA-240 Gr 304","SA-240 Gr 304L","SA-240 Gr 316","SA-240 Gr 316L",
];
const PLATES_THICKNESS = ["3","5","6","8","10","12","16","18","20","25","32","40","50"];
const PLATES_WIDTH     = ["1000","1250","1500","1800","2000","2500"];
const PLATES_LENGTH    = ["Mill Length","2000","2500","3000","4000","5000","6000","12000"];
const PLATES_STANDARD  = [
  "IS 2062","IS 6911","ASME Sec. II Part A",
];
const PLATES_SURFACE   = ["No.1 (HR)","No.2B (CR)","No.4 (Brushed)","Pickled & Oiled"];
const PLATES_TESTING   = ["UT (Ultrasonic)","NACE MR-0175","HIC Test","Impact Test","Charpy Test"];
const PLATES_ALL_OPTS: Record<string, string[]> = {
  material_grade:     PLATES_MATERIAL_GRADES,
  thickness_mm:       PLATES_THICKNESS,
  width_mm:           PLATES_WIDTH,
  length_mm:          PLATES_LENGTH,
  plate_standard:     PLATES_STANDARD,
  mtr_required:       YES_NO,
  heat_treatment:     HEAT_TREATMENT_OPTS,
  surface_finish:     PLATES_SURFACE,
  additional_testing: PLATES_TESTING,
};

export function buildPlatesRequirement(attrs: Record<string, unknown>): string {
  const grade  = (attrs.material_grade as string)?.trim() || "";
  const thick  = (attrs.thickness_mm   as string)?.trim() || "";
  const width  = (attrs.width_mm       as string)?.trim() || "";
  const length = (attrs.length_mm      as string)?.trim() || "";
  const std    = (attrs.plate_standard  as string)?.trim() || "";
  if (!grade) return "";
  const parts: string[] = [grade, "Plate"];
  if (thick)               parts.push(`${thick} mm thk`);
  if (width && length)     parts.push(`${width} × ${length} mm`);
  else if (width)          parts.push(`${width} mm wide`);
  else if (length)         parts.push(`${length} mm`);
  if (std)                 parts.push(std);
  return parts.join(", ");
}

export function PlatesAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(PLATES_ALL_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom(c => ({ ...c, [key]: true }));  set(key, ""); }
    else {
      setCustom(c => ({ ...c, [key]: false }));
      if (key === "material_grade") {
        const derived = derivePlateStandard(val);
        onChange({ ...attrs, material_grade: val, plate_standard: derived });
      } else {
        set(key, val);
      }
    }
  }
  function rf(key: string, label: string, opts: string[], required?: boolean) {
    const curVal = (attrs[key] as string) ?? "";
    const isCust = custom[key] ?? false;
    const selVal = isCust ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selVal} options={opts} placeholder="Select…" onSelect={v => handleSelect(key, v)} />
        {isCust && <Input className="h-8 text-sm" placeholder="Enter custom…" value={curVal}
          onChange={e => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SectionCard title="Material & Dimensions" color="bg-sky-50/60 border-sky-200">
        {rf("material_grade", "Material Grade",   PLATES_MATERIAL_GRADES, true)}
        {rf("thickness_mm",   "Thickness (mm)",   PLATES_THICKNESS,       true)}
        {rf("width_mm",       "Width (mm)",        PLATES_WIDTH,           true)}
        {rf("length_mm",      "Length (mm)",       PLATES_LENGTH,          true)}
        {rf("plate_standard", "Plate Standard",   PLATES_STANDARD,        true)}
        <div />
      </SectionCard>
      <SectionCard title="Quality & Testing" color="bg-slate-50/80 border-slate-200">
        {rf("mtr_required",       "MTR Required",       YES_NO,           true)}
        {rf("heat_treatment",     "Heat Treatment",     HEAT_TREATMENT_OPTS)}
        {rf("surface_finish",     "Surface Finish",     PLATES_SURFACE)}
        {rf("additional_testing", "Additional Testing", PLATES_TESTING)}
        <QtyField qty={qty} onQtyChange={onQtyChange} />
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PIPES
// ─────────────────────────────────────────────────────────────────────────────
const PIPES_MATERIAL_GRADES = [
  "A106 Gr.A","A106 Gr.B","A106 Gr.C",
  "A312 TP304","A312 TP304L","A312 TP316","A312 TP316L",
  "A335 P11","A335 P22","A335 P5","A335 P9",
  "A53 Gr.A","A53 Gr.B",
  "IS 1239 Light","IS 1239 Medium","IS 1239 Heavy",
  "IS 3589 Gr.330","IS 3589 Gr.410",
  "IS 6630",
  "Duplex S31803","Super Duplex S32750",
  "ERW CS","API 5L Gr.B","API 5L X42","API 5L X52","API 5L X65",
];
const PIPES_SCHEDULE        = [
  "SCH 5","SCH 5S","SCH 10","SCH 10S","SCH 20",
  "SCH 40","SCH 40S","SCH 80","SCH 80S","SCH 160","XXS","STD","XS",
];
const PIPES_END_CONDITION   = ["Plain End (PE)","Bevelled End (BE)","Threaded & Coupled (T&C)"];
const SMALL_BORE_NBS        = new Set(["15NB","20NB","25NB","32NB","40NB","50NB"]);
function pipeEndConditionOpts(nb: string): string[] {
  return (!nb || SMALL_BORE_NBS.has(nb))
    ? PIPES_END_CONDITION
    : PIPES_END_CONDITION.filter(v => v !== "Threaded & Coupled (T&C)");
}
function pipeNeedsHeatTreatment(grade: string): boolean {
  const g = grade.toUpperCase();
  return g.startsWith("A335") || g.includes("DUPLEX");
}
const PIPES_LENGTH_OPTS     = ["Random (5–7m)","Fixed 6m","Fixed 12m","Double Random Length"];
const PIPES_STANDARD_OPTS   = [
  "ASTM A106","ASTM A312","ASTM A335","ASTM A53",
  "IS 1239","IS 3589","IS 6630","API 5L","ASTM A790",
];
const PIPES_SURFACE         = ["Black (As-rolled)","Pickled & Passivated","Hot-Dip Galvanized"];
const PIPES_NDT             = ["None","Hydrotest","Ultrasonic (UT)","Radiography (RT)","Magnetic Particle (MT)"];
const PIPES_ALL_OPTS: Record<string, string[]> = {
  material_grade:    PIPES_MATERIAL_GRADES,
  nominal_bore:      COMMON_NB,
  schedule:          PIPES_SCHEDULE,
  end_condition:     PIPES_END_CONDITION,
  length:            PIPES_LENGTH_OPTS,
  pipe_standard:     PIPES_STANDARD_OPTS,
  mtr_required:      YES_NO,
  surface_condition: PIPES_SURFACE,
  ndt_requirement:   PIPES_NDT,
  heat_treatment:    HEAT_TREATMENT_OPTS,
};

export function buildPipesRequirement(attrs: Record<string, unknown>): string {
  const grade = (attrs.material_grade as string)?.trim() || "";
  const nb    = (attrs.nominal_bore   as string)?.trim() || "";
  const sch   = (attrs.schedule       as string)?.trim() || "";
  const end   = (attrs.end_condition  as string)?.trim() || "";
  const std   = (attrs.pipe_standard  as string)?.trim() || "";
  if (!grade) return "";
  const parts: string[] = [grade, "Pipe"];
  if (nb)  parts.push(nb);
  if (sch) parts.push(sch);
  if (end) parts.push(end);
  if (std) parts.push(std);
  return parts.join(", ");
}

export function PipesAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(PIPES_ALL_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom(c => ({ ...c, [key]: true }));  set(key, ""); }
    else {
      setCustom(c => ({ ...c, [key]: false }));
      if (key === "material_grade") {
        const derived  = derivePipeStandard(val);
        const existing = (attrs.pipe_standard as string) ?? "";
        onChange({ ...attrs, material_grade: val, pipe_standard: existing || derived });
      } else {
        set(key, val);
      }
    }
  }
  function rf(key: string, label: string, opts: string[], required?: boolean) {
    const curVal = (attrs[key] as string) ?? "";
    const isCust = custom[key] ?? false;
    const selVal = isCust ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selVal} options={opts} placeholder="Select…" onSelect={v => handleSelect(key, v)} />
        {isCust && <Input className="h-8 text-sm" placeholder="Enter custom…" value={curVal}
          onChange={e => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }

  const curGrade = (attrs.material_grade as string) ?? "";
  const curNB    = (attrs.nominal_bore   as string) ?? "";
  const endOpts  = pipeEndConditionOpts(curNB);
  const showHT   = pipeNeedsHeatTreatment(curGrade);

  return (
    <div className="space-y-3">
      <SectionCard title="Pipe Specification" color="bg-sky-50/60 border-sky-200">
        {rf("material_grade", "Material Grade", PIPES_MATERIAL_GRADES, true)}
        {rf("nominal_bore",   "Nominal Bore",   COMMON_NB,             true)}
        {rf("schedule",       "Schedule",       PIPES_SCHEDULE,        true)}
        {rf("end_condition",  "End Condition",  endOpts)}
        {rf("length",         "Length",         PIPES_LENGTH_OPTS,     true)}
        <div />
      </SectionCard>
      <SectionCard title="Standards & Quality" color="bg-emerald-50/60 border-emerald-200">
        {rf("pipe_standard", "Pipe Standard", PIPES_STANDARD_OPTS, true)}
        {rf("mtr_required",  "MTR Required",  YES_NO,              true)}
      </SectionCard>
      <SectionCard title="Additional Options" color="bg-slate-50/80 border-slate-200">
        {rf("surface_condition", "Surface Condition", PIPES_SURFACE)}
        {rf("ndt_requirement",   "NDT Requirement",   PIPES_NDT)}
        {showHT && rf("heat_treatment", "Heat Treatment", HEAT_TREATMENT_OPTS)}
        <div />
        <QtyField qty={qty} onQtyChange={onQtyChange} />
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FITTINGS
// ─────────────────────────────────────────────────────────────────────────────
const FITTINGS_TYPES = [
  "90° LR Elbow","45° LR Elbow","90° SR Elbow",
  "Equal Tee","Reducing Tee","Cross",
  "Concentric Reducer","Eccentric Reducer",
  "End Cap","Stub End","Swage Nipple",
  "Coupling","Half Coupling","Union","Boss",
  "Barrel Nipple","Pipe Nipple",
];
const FITTINGS_MATERIAL = [
  "A234 WPB","A234 WPC","A234 WP11","A234 WP22",
  "A403 WP304","A403 WP304L","A403 WP316","A403 WP316L","A403 WP321","A403 WP347",
  "A860 WPHY 60","Duplex F51","Super Duplex F53",
];
const FITTINGS_SCHEDULE  = [
  "SCH 5","SCH 5S","SCH 10","SCH 10S","SCH 20",
  "SCH 40","SCH 40S","SCH 80","SCH 80S","SCH 160","XXS","STD","XS",
];
const FITTINGS_END_TYPE_FULL    = ["Butt Weld (BW)","Socket Weld (SW)","Screwed NPT","Screwed BSP"];
const FITTINGS_END_TYPE_LARGE   = ["Butt Weld (BW)"];
const FITTING_SMALL_BORE_NBS    = new Set(["15NB","20NB","25NB","32NB","40NB","50NB"]);
function fittingEndTypeOpts(nb: string): string[] {
  return (!nb || FITTING_SMALL_BORE_NBS.has(nb))
    ? FITTINGS_END_TYPE_FULL
    : FITTINGS_END_TYPE_LARGE;
}
const FITTINGS_STANDARD = ["ASME B16.9","ASME B16.11","MSS SP-43","MSS SP-75"];
const ELBOW_RADIUS_OPTS = ["Long Radius (LR)","Short Radius (SR)"];
const FITTINGS_ALL_OPTS: Record<string, string[]> = {
  fitting_type:     FITTINGS_TYPES,
  material_grade:   FITTINGS_MATERIAL,
  nominal_bore:     COMMON_NB,
  schedule:         FITTINGS_SCHEDULE,
  end_type:         FITTINGS_END_TYPE_FULL,
  fitting_standard: FITTINGS_STANDARD,
  mtr_required:     YES_NO,
  elbow_radius:     ELBOW_RADIUS_OPTS,
  reducing_bore:    COMMON_NB,
};

export function buildFittingsRequirement(attrs: Record<string, unknown>): string {
  const ftype = (attrs.fitting_type    as string)?.trim() || "";
  const grade = (attrs.material_grade  as string)?.trim() || "";
  const nb    = (attrs.nominal_bore    as string)?.trim() || "";
  const sch   = (attrs.schedule        as string)?.trim() || "";
  const end   = (attrs.end_type        as string)?.trim() || "";
  const std   = (attrs.fitting_standard as string)?.trim() || "";
  if (!ftype) return "";
  const parts: string[] = [ftype];
  if (grade) parts.push(grade);
  if (nb)    parts.push(nb);
  if (sch)   parts.push(sch);
  if (end)   parts.push(end);
  if (std)   parts.push(std);
  return parts.join(", ");
}

export function FittingsAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(FITTINGS_ALL_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom(c => ({ ...c, [key]: true }));  set(key, ""); }
    else                     { setCustom(c => ({ ...c, [key]: false })); set(key, val); }
  }
  function rf(key: string, label: string, opts: string[], required?: boolean) {
    const curVal = (attrs[key] as string) ?? "";
    const isCust = custom[key] ?? false;
    const selVal = isCust ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selVal} options={opts} placeholder="Select…" onSelect={v => handleSelect(key, v)} />
        {isCust && <Input className="h-8 text-sm" placeholder="Enter custom…" value={curVal}
          onChange={e => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }

  const ftype    = (attrs.fitting_type as string) ?? "";
  const ftLower  = ftype.toLowerCase();
  const isLRElbow = ftype === "90° LR Elbow" || ftype === "45° LR Elbow";
  const isReduce  = ftLower.includes("reducer") || ftype === "Reducing Tee";
  const nb        = (attrs.nominal_bore as string) ?? "";
  const nbNum     = parseInt((nb.match(/^(\d+)NB$/i)?.[1]) ?? "999");
  const endType   = (attrs.end_type as string) ?? "";
  const isSW      = endType.includes("Socket Weld") || endType.toLowerCase().includes("screwed");
  const stdHint   = isSW ? "ASME B16.11" : "ASME B16.9";
  const endOpts   = fittingEndTypeOpts(nb);

  return (
    <div className="space-y-3">
      <SectionCard title="Fitting Specification" color="bg-sky-50/60 border-sky-200">
        {rf("fitting_type",   "Fitting Type",   FITTINGS_TYPES,    true)}
        {rf("material_grade", "Material Grade", FITTINGS_MATERIAL, true)}
        {rf("nominal_bore",   "Nominal Bore",   COMMON_NB,         true)}
        {rf("schedule",       "Schedule",       FITTINGS_SCHEDULE, true)}
      </SectionCard>
      <SectionCard title="Connection & Standards" color="bg-emerald-50/60 border-emerald-200">
        {rf("end_type", "End Type", endOpts, true)}
        {(() => {
          const curVal = (attrs.fitting_standard as string) ?? "";
          const isCust = custom["fitting_standard"] ?? false;
          const effective = curVal || stdHint;
          const selVal = isCust ? "__other__" : (FITTINGS_STANDARD.includes(effective) ? effective : "");
          return (
            <div className="space-y-1.5">
              <Label className="text-xs">Fitting Standard <span className="text-red-500">*</span></Label>
              <SearchableSelect value={selVal} options={FITTINGS_STANDARD} placeholder="Select…"
                onSelect={v => handleSelect("fitting_standard", v)} />
              {isCust && <Input className="h-8 text-sm" placeholder="Enter custom…" value={curVal}
                onChange={e => set("fitting_standard", e.target.value)} autoFocus />}
            </div>
          );
        })()}
      </SectionCard>
      {(isLRElbow || isReduce) && (
        <SectionCard title="Conditional Details" color="bg-violet-50/60 border-violet-200">
          {isLRElbow && rf("elbow_radius",  "Elbow Radius",       ELBOW_RADIUS_OPTS, true)}
          {isReduce  && rf("reducing_bore", "Reducing Size (NB)", COMMON_NB,         true)}
          {(isLRElbow && !isReduce) && <div />}
        </SectionCard>
      )}
      <SectionCard title="Quality" color="bg-slate-50/80 border-slate-200">
        {rf("mtr_required", "MTR Required", YES_NO, true)}
        <div />
        <QtyField qty={qty} onQtyChange={onQtyChange} />
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. FLANGES
// ─────────────────────────────────────────────────────────────────────────────
const FLANGES_TYPES = [
  "Weld Neck (WN)","Slip-On (SO)","Blind (BL)","Socket Weld (SW)",
  "Lap Joint (LJ)","Threaded","Orifice",
];
const FLANGES_MATERIAL = [
  "A105","A105N",
  "A182 F304","A182 F304L","A182 F316","A182 F316L","A182 F321","A182 F347",
  "A182 F11","A182 F22","A182 F5","A182 F9",
  "A350 LF2","A350 LF3",
  "Duplex F51","Super Duplex F53",
  "A694 F52","A694 F60","A694 F65",
];
const FLANGES_STANDARD  = ["ASME B16.5","ASME B16.47A","ASME B16.47B"];
const FLANGES_FACING_OPTS = [
  "RF (Raised Face)","FF (Flat Face)","RTJ (Ring Type Joint)",
  "Tongue & Groove (T&G)","Male & Female (M&F)",
];
const BORE_CONDITION    = ["Stock Bore","Full Bore"];
const FACING_FINISH     = ["125–250 AARH (Standard)","63 AARH (Smooth)"];
const TAP_HOLE_OPTS     = ["2-hole taps","4-hole taps"];
const FLANGES_ALL_OPTS: Record<string, string[]> = {
  flange_type:     FLANGES_TYPES,
  material_grade:  FLANGES_MATERIAL,
  nominal_bore:    COMMON_NB,
  pressure_class:  PRESSURE_CLASS_OPTS,
  facing:          FLANGES_FACING_OPTS,
  flange_standard: FLANGES_STANDARD,
  bore_condition:  BORE_CONDITION,
  facing_finish:   FACING_FINISH,
  mtr_required:    YES_NO,
  tap_hole_config: TAP_HOLE_OPTS,
};

export function buildFlangesRequirement(attrs: Record<string, unknown>): string {
  const ftype = (attrs.flange_type     as string)?.trim() || "";
  const grade = (attrs.material_grade  as string)?.trim() || "";
  const nb    = (attrs.nominal_bore    as string)?.trim() || "";
  const cls   = (attrs.pressure_class  as string)?.trim() || "";
  const facing= (attrs.facing          as string)?.trim() || "";
  const std   = (attrs.flange_standard as string)?.trim() || "";
  if (!ftype) return "";
  const parts: string[] = [`${ftype} Flange`];
  if (grade)  parts.push(grade);
  if (nb)     parts.push(nb);
  if (cls)    parts.push(cls);
  if (facing) parts.push(facing);
  if (std)    parts.push(std);
  return parts.join(", ");
}

export function FlangesAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(FLANGES_ALL_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom(c => ({ ...c, [key]: true }));  set(key, ""); }
    else {
      setCustom(c => ({ ...c, [key]: false }));
      if (key === "nominal_bore") {
        const derived  = deriveFlangeStandard(val);
        const existing = (attrs.flange_standard as string) ?? "";
        onChange({ ...attrs, nominal_bore: val, flange_standard: existing || derived });
      } else {
        set(key, val);
      }
    }
  }
  function rf(key: string, label: string, opts: string[], required?: boolean) {
    const curVal = (attrs[key] as string) ?? "";
    const isCust = custom[key] ?? false;
    const selVal = isCust ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selVal} options={opts} placeholder="Select…" onSelect={v => handleSelect(key, v)} />
        {isCust && <Input className="h-8 text-sm" placeholder="Enter custom…" value={curVal}
          onChange={e => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }
  function rt(key: string, label: string, required?: boolean, ph?: string) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <Input className="h-8 text-sm" placeholder={ph ?? `Enter ${label.toLowerCase()}…`}
          value={(attrs[key] as string) ?? ""} onChange={e => set(key, e.target.value)} />
      </div>
    );
  }

  const facing    = (attrs.facing      as string) ?? "";
  const ftype     = (attrs.flange_type as string) ?? "";
  const nb        = (attrs.nominal_bore as string) ?? "";
  const nbNum     = parseInt((nb.match(/^(\d+)NB$/i)?.[1]) ?? "0");
  const isRTJ     = facing.includes("RTJ");
  const isOrifice = ftype.toLowerCase().includes("orifice");

  return (
    <div className="space-y-3">
      <SectionCard title="Flange Specification" color="bg-sky-50/60 border-sky-200">
        {rf("flange_type",    "Flange Type",    FLANGES_TYPES,       true)}
        {rf("material_grade", "Material Grade", FLANGES_MATERIAL,    true)}
        {rf("nominal_bore",   "Nominal Bore",   COMMON_NB,           true)}
        {rf("pressure_class", "Pressure Class", PRESSURE_CLASS_OPTS, true)}
      </SectionCard>
      <SectionCard title="Facing & Standards" color="bg-emerald-50/60 border-emerald-200">
        {rf("facing", "Facing", FLANGES_FACING_OPTS, true)}
        {(() => {
          const curVal  = (attrs.flange_standard as string) ?? "";
          const isCust  = custom["flange_standard"] ?? false;
          const derived = nbNum > 0 ? deriveFlangeStandard(nb) : "ASME B16.5";
          const effective = curVal || derived;
          const selVal  = isCust ? "__other__" : (FLANGES_STANDARD.includes(effective) ? effective : "");
          return (
            <div className="space-y-1.5">
              <Label className="text-xs">Flange Standard <span className="text-red-500">*</span></Label>
              <SearchableSelect value={selVal} options={FLANGES_STANDARD} placeholder="Select…"
                onSelect={v => handleSelect("flange_standard", v)} />
              {isCust && <Input className="h-8 text-sm" placeholder="Enter custom…" value={curVal}
                onChange={e => set("flange_standard", e.target.value)} autoFocus />}
              {nbNum > 600 && !isCust && (
                <p className="text-[10px] text-amber-600 mt-0.5">NB &gt; 600 (NPS 24): defaults to ASME B16.47A</p>
              )}
            </div>
          );
        })()}
        {rf("bore_condition", "Bore Condition", BORE_CONDITION)}
        {rf("facing_finish",  "Facing Finish",  FACING_FINISH)}
      </SectionCard>
      {(isRTJ || isOrifice) && (
        <SectionCard title="Conditional Details" color="bg-violet-50/60 border-violet-200">
          {isRTJ     && rt("rtj_ring_number",  "RTJ Ring Number",          true, "e.g. R-24, RX-24")}
          {isOrifice && rf("tap_hole_config",   "Tap Hole Configuration",   TAP_HOLE_OPTS, true)}
          {(isRTJ && !isOrifice)  && <div />}
          {(!isRTJ && isOrifice)  && <div />}
        </SectionCard>
      )}
      <SectionCard title="Quality" color="bg-slate-50/80 border-slate-200">
        {rf("mtr_required", "MTR Required", YES_NO, true)}
        <div />
        <QtyField qty={qty} onQtyChange={onQtyChange} />
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. FASTENERS
// ─────────────────────────────────────────────────────────────────────────────
const FASTENER_TYPES = [
  "Stud Bolt (Full Thread)","Stud Bolt (2-end Thread)",
  "Stud + 2 Nut + 2 Washer Set",
  "Hex Bolt","Anchor Bolt",
  "Hex Nut","Heavy Hex Nut",
  "Flat Washer","Spring Washer","U-Bolt","Eye Bolt",
];
const FASTENER_BOLT_MATERIAL = [
  "ASTM A193 B7","ASTM A193 B7M",
  "ASTM A193 B8 (SS304)","ASTM A193 B8 Class 2",
  "ASTM A193 B8M (SS316)","ASTM A193 B8M Class 2",
  "ASTM A193 B16",
  "ASTM A320 L7","IS 1367 Cl.8.8","IS 1367 Cl.10.9","A307","A325","A490",
];
const FASTENER_NUT_MATERIAL = [
  "ASTM A194 2H","ASTM A194 2HM",
  "ASTM A194 8 (SS304)","ASTM A194 8M (SS316)",
  "ASTM A194 4","ASTM A194 7","ASTM A194 7M",
  "IS 1367 Cl.8",
];
const FASTENER_DIAMETER = [
  "M8","M10","M12","M16","M20","M24","M30","M36","M42","M48",
  '1/4"','3/8"','1/2"','5/8"','3/4"','7/8"','1"','1-1/4"','1-1/2"','1-3/4"','2"',
];
const FASTENER_THREADING = [
  "ASME B1.1 (UNC)","ASME B1.1 (UNF)","ISO Metric Coarse","ISO Metric Fine",
];
const FASTENER_COATING = [
  "Plain (Uncoated)","Hot-Dip Galvanized","Zinc Electroplated",
  "Xylan / Fluoropolymer","PTFE Coated","Black Oxide",
];
const FASTENER_THREAD_PROTECTION = ["None","Plastic Cap","Thread Protector"];
const FASTENER_STANDARD = [
  "ASME B18.2.1",
  "ASME B18.2.2",
  "ASME B18.22.1",
  "DIN 931",
  "DIN 933",
  "DIN 934",
  "DIN 125",
  "IS 1364",
  "IS 1367",
  "ASTM F436",
];
const FASTENERS_ALL_OPTS: Record<string, string[]> = {
  fastener_type:       FASTENER_TYPES,
  bolt_material:       FASTENER_BOLT_MATERIAL,
  nut_material:        FASTENER_NUT_MATERIAL,
  diameter:            FASTENER_DIAMETER,
  threading_standard:  FASTENER_THREADING,
  fastener_standard:   FASTENER_STANDARD,
  coating:             FASTENER_COATING,
  thread_protection:   FASTENER_THREAD_PROTECTION,
};

export function buildFastenersRequirement(attrs: Record<string, unknown>): string {
  const ftype   = (attrs.fastener_type      as string)?.trim() || "";
  const bmat    = (attrs.bolt_material      as string)?.trim() || "";
  const nmat    = (attrs.nut_material       as string)?.trim() || "";
  const dia     = (attrs.diameter           as string)?.trim() || "";
  const length  = (attrs.length_mm          as string)?.trim() || "";
  const thdStd  = (attrs.threading_standard as string)?.trim() || "";
  const fstdStr = (attrs.fastener_standard  as string)?.trim() || "";
  if (!ftype) return "";
  const parts: string[] = [ftype];
  if (bmat && nmat) parts.push(`${bmat} / ${nmat}`);
  else if (bmat)    parts.push(bmat);
  if (dia)     parts.push(dia);
  if (length)  parts.push(`L=${length}mm`);
  if (thdStd)  parts.push(thdStd);
  if (fstdStr) parts.push(fstdStr);
  return parts.join(", ");
}

function deriveFastenerStandard(ftype: string, threading: string): string {
  const ftl = ftype.toLowerCase();
  const thl = threading.toLowerCase();
  const isBoltOrStud = ftl.includes("bolt") || ftl.includes("stud");
  const isNut        = ftl.includes("nut");
  const isWasher     = ftl.includes("washer");
  const isInch       = thl.includes("unc") || thl.includes("unf");
  const isMetric     = thl.includes("iso metric");
  if (isBoltOrStud && isInch)   return "ASME B18.2.1";
  if (isNut        && isInch)   return "ASME B18.2.2";
  if (isWasher     && isInch)   return "ASME B18.22.1";
  // Metric bolts/studs: DIN 931 vs DIN 933 requires thread-length knowledge — leave blank
  if (isNut        && isMetric) return "DIN 934";
  if (isWasher     && isMetric) return "DIN 125";
  return "";
}

export function FastenersAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(FASTENERS_ALL_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom(c => ({ ...c, [key]: true }));  set(key, ""); }
    else                     { setCustom(c => ({ ...c, [key]: false })); set(key, val); }
  }
  function rf(key: string, label: string, opts: string[], required?: boolean) {
    const curVal = (attrs[key] as string) ?? "";
    const isCust = custom[key] ?? false;
    const selVal = isCust ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selVal} options={opts} placeholder="Select…" onSelect={v => handleSelect(key, v)} />
        {isCust && <Input className="h-8 text-sm" placeholder="Enter custom…" value={curVal}
          onChange={e => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }

  const ftype       = (attrs.fastener_type      as string) ?? "";
  const threading   = (attrs.threading_standard as string) ?? "";
  const ftLower     = ftype.toLowerCase();
  const needsLength = ftLower.includes("bolt") || ftLower.includes("stud");
  const needsNut    = ftLower.includes("bolt") || ftLower.includes("stud") || ftype === "Stud + 2 Nut + 2 Washer Set";

  // Auto-derive fastener standard (fill-if-blank)
  const derivedFStd = deriveFastenerStandard(ftype, threading);
  if (derivedFStd && !((attrs.fastener_standard as string) ?? "")) {
    Promise.resolve().then(() => onChange({ ...attrs, fastener_standard: derivedFStd }));
  }

  function rfFStd() {
    const curVal = (attrs.fastener_standard as string) ?? "";
    const isCust = custom["fastener_standard"] ?? false;
    const selVal = isCust ? "__other__" : (FASTENER_STANDARD.includes(curVal) ? curVal : "");
    const hint   = derivedFStd && !curVal ? `Suggested: ${derivedFStd}` : "";
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">Fastener Standard</Label>
        <SearchableSelect value={selVal} options={FASTENER_STANDARD} placeholder="Select…"
          onSelect={v => {
            if (v === "__other__") { setCustom(c => ({ ...c, fastener_standard: true }));  set("fastener_standard", ""); }
            else                   { setCustom(c => ({ ...c, fastener_standard: false })); set("fastener_standard", v); }
          }} />
        {isCust && <Input className="h-8 text-sm" placeholder="Enter custom…" value={curVal}
          onChange={e => set("fastener_standard", e.target.value)} autoFocus />}
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SectionCard title="Fastener Specification" color="bg-sky-50/60 border-sky-200">
        {rf("fastener_type", "Fastener Type", FASTENER_TYPES,    true)}
        {rf("diameter",      "Diameter",      FASTENER_DIAMETER, true)}
        {needsLength ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Length (mm) <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" type="number" min="1" step="1" placeholder="e.g. 100"
              value={(attrs.length_mm as string) ?? ""}
              onWheel={e => e.currentTarget.blur()}
              onChange={e => set("length_mm", e.target.value)} />
          </div>
        ) : <div />}
        {rfFStd()}
      </SectionCard>
      <SectionCard title="Materials & Threading" color="bg-violet-50/60 border-violet-200">
        {rf("bolt_material",      "Bolt / Stud Material", FASTENER_BOLT_MATERIAL, true)}
        {needsNut
          ? rf("nut_material",    "Nut Material",         FASTENER_NUT_MATERIAL,  true)
          : <div />}
        {rf("threading_standard", "Threading Standard",   FASTENER_THREADING,     true)}
        {rf("coating",            "Coating / Finish",     FASTENER_COATING)}
        {rf("thread_protection",  "Thread Protection",    FASTENER_THREAD_PROTECTION)}
        <QtyField qty={qty} onQtyChange={onQtyChange} />
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. GASKETS
// ─────────────────────────────────────────────────────────────────────────────
const GASKET_TYPES = [
  "Spiral Wound (Inner + Outer Ring)",
  "Spiral Wound (Outer Ring only)",
  "RTJ — Oval",
  "RTJ — Octagonal",
  "Flat Sheet — Full Face",
  "Flat Sheet — Raised Face",
  "Camprofile (Grooved)",
  "Kammprofile",
];
const GASKET_WINDING_MATERIAL    = [
  "SS316 / Graphite","SS304 / Graphite","SS316 / PTFE","SS304 / PTFE",
  "Inconel 625 / Graphite","CS / Graphite","SS316 / Ceramic",
];
const GASKET_INNER_RING_MATERIAL = ["SS316","SS304","CS","Inconel 625","Monel 400"];
const GASKET_RTJ_RING_MATERIAL   = ["Soft Iron","Low Carbon Steel","SS316","SS304","Monel","Inconel 625"];
const GASKET_SHEET_MATERIAL      = [
  "CAF-Free (Non-asbestos)","PTFE","EPDM","Neoprene","Graphite Sheet","Compressed Fibre",
];
const GASKET_STANDARD            = ["ASME B16.20","ASME B16.21","API 601"];
const GASKETS_FACING_OPTS        = ["RF","FF","RTJ"];
const GASKET_CAMPROFILE_CORE     = ["SS316","SS304","CS","Inconel 625"];
const GASKET_CAMPROFILE_FACING   = ["Graphite","PTFE"];
const GASKETS_ALL_OPTS: Record<string, string[]> = {
  gasket_type:            GASKET_TYPES,
  nominal_bore:           COMMON_NB,
  pressure_class:         PRESSURE_CLASS_OPTS,
  facing:                 GASKETS_FACING_OPTS,
  gasket_standard:        GASKET_STANDARD,
  winding_material:       GASKET_WINDING_MATERIAL,
  inner_ring_material:    GASKET_INNER_RING_MATERIAL,
  rtj_ring_material:      GASKET_RTJ_RING_MATERIAL,
  sheet_material:         GASKET_SHEET_MATERIAL,
  camprofile_core:        GASKET_CAMPROFILE_CORE,
  camprofile_facing:      GASKET_CAMPROFILE_FACING,
};

export function buildGasketsRequirement(attrs: Record<string, unknown>): string {
  const gtype  = (attrs.gasket_type    as string)?.trim() || "";
  const nb     = (attrs.nominal_bore   as string)?.trim() || "";
  const cls    = (attrs.pressure_class as string)?.trim() || "";
  const facing = (attrs.facing         as string)?.trim() || "";
  const std    = (attrs.gasket_standard as string)?.trim() || "";
  if (!gtype) return "";
  const parts: string[] = [`${gtype} Gasket`];
  if (nb)     parts.push(nb);
  if (cls)    parts.push(cls);
  if (facing) parts.push(facing);
  if (std)    parts.push(std);
  return parts.join(", ");
}

export function GasketsAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(GASKETS_ALL_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom(c => ({ ...c, [key]: true }));  set(key, ""); }
    else {
      setCustom(c => ({ ...c, [key]: false }));
      if (key === "gasket_type") {
        const isSwType = val.toLowerCase().startsWith("spiral");
        if (isSwType && !(attrs.winding_material as string)) {
          onChange({ ...attrs, gasket_type: val, winding_material: "SS316 / Graphite" });
        } else {
          set(key, val);
        }
      } else {
        set(key, val);
      }
    }
  }
  function rf(key: string, label: string, opts: string[], required?: boolean) {
    const curVal = (attrs[key] as string) ?? "";
    const isCust = custom[key] ?? false;
    const selVal = isCust ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selVal} options={opts} placeholder="Select…" onSelect={v => handleSelect(key, v)} />
        {isCust && <Input className="h-8 text-sm" placeholder="Enter custom…" value={curVal}
          onChange={e => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }
  function rt(key: string, label: string, required?: boolean, ph?: string) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <Input className="h-8 text-sm" placeholder={ph ?? `Enter ${label.toLowerCase()}…`}
          value={(attrs[key] as string) ?? ""} onChange={e => set(key, e.target.value)} />
      </div>
    );
  }

  const gtype  = (attrs.gasket_type as string) ?? "";
  const gLower = gtype.toLowerCase();
  const isSW   = gLower.startsWith("spiral");
  const isRTJ  = gLower.startsWith("rtj");
  const isFlat = gLower.startsWith("flat sheet");
  const isCamp = gLower.startsWith("camprofile") || gLower.startsWith("kammprofile");

  return (
    <div className="space-y-3">
      <SectionCard title="Gasket Specification" color="bg-sky-50/60 border-sky-200">
        {rf("gasket_type",    "Gasket Type",    GASKET_TYPES,        true)}
        {rf("nominal_bore",   "Nominal Bore",   COMMON_NB,           true)}
        {rf("pressure_class", "Pressure Class", PRESSURE_CLASS_OPTS, true)}
        {rf("facing",         "Facing",         GASKETS_FACING_OPTS, true)}
        {rf("gasket_standard","Standard",       GASKET_STANDARD,     true)}
        <div />
      </SectionCard>
      {(isSW || isRTJ || isFlat || isCamp) && (
        <SectionCard title="Materials" color="bg-violet-50/60 border-violet-200">
          {isSW   && rf("winding_material",    "Winding / Filler Material", GASKET_WINDING_MATERIAL,    true)}
          {isSW   && rf("inner_ring_material", "Inner Ring Material",       GASKET_INNER_RING_MATERIAL, true)}
          {isRTJ  && rf("rtj_ring_material",   "RTJ Ring Material",         GASKET_RTJ_RING_MATERIAL,   true)}
          {isRTJ  && rt("rtj_ring_number",     "RTJ Ring Number",           true, "e.g. R-24, RX-24, BX-169")}
          {isFlat && rf("sheet_material",      "Sheet Material",            GASKET_SHEET_MATERIAL,      true)}
          {isFlat && <div />}
          {isCamp && rf("camprofile_core",     "Core Material",             GASKET_CAMPROFILE_CORE,     true)}
          {isCamp && rf("camprofile_facing",   "Facing Material",           GASKET_CAMPROFILE_FACING,   true)}
        </SectionCard>
      )}
      <SectionCard title="Quantity" color="bg-slate-50/80 border-slate-200">
        <QtyField qty={qty} onQtyChange={onQtyChange} />
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. STRUCTURAL STEEL
// ─────────────────────────────────────────────────────────────────────────────
const STRUCTURAL_SECTION_TYPES = [
  "Plate (Plain)","Plate (Chequered)","Angle (Equal Leg)","Angle (Unequal Leg)",
  "Channel (ISMC)","I-Beam (ISMB)","H-Beam (ISHB)",
  "Round Bar","Flat Bar","Square Bar",
  "RHS (Round Hollow Section)","SHS (Square Hollow Section)","Rectangular Hollow Section",
  "Grating (GI)","Grating (SS)","Expanded Metal",
];
const STRUCTURAL_MATERIAL = [
  "IS 2062 E250A","IS 2062 E250 BR","IS 2062 E250 C","IS 2062 E250BO",
  "IS 2062 E300","IS 2062 E350","IS 2062 E350BO","IS 2062 E410",
  "SS 304","SS 304L","SS 316","SS 316L",
  "ASTM A36","ASTM A500","ASTM A572 Gr 50",
  "EN S275","EN S355",
];
const STRUCTURAL_LENGTH   = ["Mill Length","2m","3m","4m","6m","9m","12m","Cut to Size"];
const STRUCTURAL_STANDARD = ["IS 2062","IS 1161","IS 1239","EN 10025","ASTM A36","IS 808"];
const STRUCTURAL_SURFACE  = [
  "Mill Finish (Unpainted)","Shot Blasted SA 2.5 + Primer",
  "Hot-Dip Galvanized","Epoxy Primer Coated","Zinc-Rich Primer",
];
const GRATING_BAR_TYPES   = ["Flat Bar","I-Bar","Serrated Flat Bar"];
const GRATING_MESH_SIZES  = ["30×3","30×5","33×5","38×5","40×5","40×6"];
const STRUCTURAL_ALL_OPTS: Record<string, string[]> = {
  section_type:      STRUCTURAL_SECTION_TYPES,
  material_grade:    STRUCTURAL_MATERIAL,
  length:            STRUCTURAL_LENGTH,
  steel_standard:    STRUCTURAL_STANDARD,
  mtr_required:      YES_NO,
  surface_treatment: STRUCTURAL_SURFACE,
  grating_bar_type:  GRATING_BAR_TYPES,
  grating_mesh_size: GRATING_MESH_SIZES,
};

export function buildStructuralSteelRequirement(attrs: Record<string, unknown>): string {
  const stype  = (attrs.section_type   as string)?.trim() || "";
  const grade  = (attrs.material_grade as string)?.trim() || "";
  const size   = (attrs.section_size   as string)?.trim() || "";
  const length = (attrs.length         as string)?.trim() || "";
  const std    = (attrs.steel_standard as string)?.trim() || "";
  if (!stype) return "";
  const parts: string[] = [stype];
  if (size)   parts.push(size);
  if (grade)  parts.push(grade);
  if (length) parts.push(length);
  if (std)    parts.push(std);
  return parts.join(", ");
}

export function StructuralSteelAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(STRUCTURAL_ALL_OPTS)) {
      const val = (attrs[key] as string) ?? "";
      c[key] = val !== "" && !opts.includes(val);
    }
    return c;
  });
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  function handleSelect(key: string, val: string) {
    if (val === "__other__") { setCustom(c => ({ ...c, [key]: true }));  set(key, ""); }
    else {
      setCustom(c => ({ ...c, [key]: false }));
      if (key === "material_grade") {
        const existingMtr = (attrs.mtr_required  as string) ?? "";
        const existingStd = (attrs.steel_standard as string) ?? "";
        onChange({
          ...attrs,
          material_grade: val,
          mtr_required:   existingMtr || getStructuralMtrDefault(val),
          steel_standard: existingStd || deriveStructuralStandard(val),
        });
      } else {
        set(key, val);
      }
    }
  }
  function rf(key: string, label: string, opts: string[], required?: boolean) {
    const curVal = (attrs[key] as string) ?? "";
    const isCust = custom[key] ?? false;
    const selVal = isCust ? "__other__" : (opts.includes(curVal) ? curVal : "");
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selVal} options={opts} placeholder="Select…" onSelect={v => handleSelect(key, v)} />
        {isCust && <Input className="h-8 text-sm" placeholder="Enter custom…" value={curVal}
          onChange={e => set(key, e.target.value)} autoFocus />}
      </div>
    );
  }

  const stype      = (attrs.section_type as string) ?? "";
  const grade      = (attrs.material_grade as string) ?? "";
  const length     = (attrs.length as string) ?? "";
  const isGrating  = stype.toLowerCase().includes("grating");
  const isHollow   = stype.toLowerCase().includes("hollow");
  const isCutToSz  = length === "Cut to Size";
  const mtrDefault = getStructuralMtrDefault(grade);
  const curMtr     = (attrs.mtr_required as string) ?? "";

  return (
    <div className="space-y-3">
      <SectionCard title="Section Specification" color="bg-sky-50/60 border-sky-200">
        {rf("section_type",   "Section Type",              STRUCTURAL_SECTION_TYPES, true)}
        {rf("material_grade", "Material Grade",            STRUCTURAL_MATERIAL,      true)}
        <div className="space-y-1.5">
          <Label className="text-xs">Section Size / Designation <span className="text-red-500">*</span></Label>
          <Input className="h-8 text-sm" placeholder="e.g. 75×75×8, ISMC 100, ISMB 200"
            value={(attrs.section_size as string) ?? ""} onChange={e => set("section_size", e.target.value)} />
        </div>
        {rf("length",         "Length",                    STRUCTURAL_LENGTH,        true)}
        {rf("steel_standard", "Steel Standard",            STRUCTURAL_STANDARD,      true)}
        <div />
      </SectionCard>

      {(isGrating || isHollow || isCutToSz) && (
        <SectionCard title="Conditional Details" color="bg-violet-50/60 border-violet-200">
          {isGrating && rf("grating_bar_type",  "Grating Bar Type",  GRATING_BAR_TYPES,  true)}
          {isGrating && rf("grating_mesh_size", "Grating Mesh Size", GRATING_MESH_SIZES, true)}
          {isHollow && (
            <div className="space-y-1.5">
              <Label className="text-xs">Wall Thickness (mm) <span className="text-red-500">*</span></Label>
              <Input className="h-8 text-sm" type="number" min="1" step="1" placeholder="e.g. 5"
                value={(attrs.hollow_wall_thickness as string) ?? ""}
                onWheel={e => e.currentTarget.blur()}
                onChange={e => set("hollow_wall_thickness", e.target.value)} />
            </div>
          )}
          {isCutToSz && (
            <div className="space-y-1.5">
              <Label className="text-xs">Cut Length (mm) <span className="text-red-500">*</span></Label>
              <Input className="h-8 text-sm" type="number" min="1" step="1" placeholder="e.g. 1500"
                value={(attrs.cut_length_mm as string) ?? ""}
                onWheel={e => e.currentTarget.blur()}
                onChange={e => set("cut_length_mm", e.target.value)} />
            </div>
          )}
          {isGrating && !isHollow && !isCutToSz && null}
          {!isGrating && (isHollow || isCutToSz) && <div />}
        </SectionCard>
      )}

      <SectionCard title="Quality & Construction" color="bg-slate-50/80 border-slate-200">
        <div className="space-y-1.5">
          <Label className="text-xs">MTR Required</Label>
          {(() => {
            const isCust = custom["mtr_required"] ?? false;
            const effective = curMtr || mtrDefault;
            const selVal = isCust ? "__other__" : (YES_NO.includes(effective) ? effective : "");
            return (
              <>
                <SearchableSelect value={selVal} options={YES_NO} placeholder="Select…"
                  onSelect={v => handleSelect("mtr_required", v)} />
                {grade && !curMtr && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Default: {mtrDefault} ({
                      grade.toUpperCase().startsWith("SS") || grade.toUpperCase().includes("DUPLEX")
                        ? "SS / Duplex material" : "Carbon Steel material"
                    })
                  </p>
                )}
              </>
            );
          })()}
        </div>
        {rf("surface_treatment", "Surface Treatment", STRUCTURAL_SURFACE)}
        <QtyField qty={qty} onQtyChange={onQtyChange} />
      </SectionCard>
    </div>
  );
}
