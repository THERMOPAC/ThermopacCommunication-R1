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
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
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
const PRESSURE_CLASS_OPTS  = ["150#","300#","600#","900#","1500#","2500#","PN 10","PN 16","PN 20","PN 25"];
const FACING_OPTS          = ["RF (Raised Face)","FF (Flat Face)","RTJ (Ring Type Joint)"];
const YES_NO               = ["Yes","No"];
const HEAT_TREATMENT_OPTS  = ["None","Normalized","PWHT","Quenched & Tempered","Annealed","Stress Relieved"];

// ── Dynamic helpers ───────────────────────────────────────────────────────────
function derivePipeStandard(grade: string): string {
  const MAP: Record<string, string> = {
    "IS 1239 Class A":   "IS 1239",
    "IS 1239 Class B":   "IS 1239",
    "IS 1239 Class C":   "IS 1239",
    "IS 3589 Fe 330":    "IS 3589",
    "IS 3589 Fe 410":    "IS 3589",
    "SA-106 Gr B":       "ASME Sec. II Part A",
    "SA-53 Gr B":        "ASME Sec. II Part A",
    "SS304 Pipe":        "IS 6913",
    "SS304L Pipe":       "IS 6913",
    "SS316 Pipe":        "IS 6913",
    "SS316L Pipe":       "IS 6913",
    "SA-312 TP304":      "ASME Sec. II Part A",
    "SA-312 TP304L":     "ASME Sec. II Part A",
    "SA-312 TP316":      "ASME Sec. II Part A",
    "SA-312 TP316L":     "ASME Sec. II Part A",
    "Copper Pipe":       "ASME Sec. II Part B",
    "Aluminium Pipe":    "ASME Sec. II Part B",
  };
  return MAP[grade] ?? "";
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
    <div className="space-y-1.5 col-span-3 md:col-span-5">
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

// ── Plates SAP Item Code helpers (client mirror of server builder) ────────────
const _PLATES_GRADE_CODE: Record<string, string> = {
  'IS 2062 E250': 'E250', 'IS 2062 E350': 'E350',
  'SS304': 'SS304', 'SS304L': 'SS304L', 'SS316': 'SS316', 'SS316L': 'SS316L',
  'SA 516 Gr 60': 'SA516-60', 'SA 516 Gr 70': 'SA516-70',
  'ASTM A36': 'A36',
  'SA-240 Gr 304': 'SA240-304', 'SA-240 Gr 304L': 'SA240-304L',
  'SA-240 Gr 316': 'SA240-316', 'SA-240 Gr 316L': 'SA240-316L',
};
function _normDim(raw: string): string | null {
  const n = parseFloat(raw.trim());
  if (isNaN(n) || n <= 0) return null;
  return Number.isInteger(n) ? String(Math.round(n)) : String(n);
}

/** Client-side preview of the Plates SAP Item Code. Returns null when any required field is missing/invalid. */
export function buildPlatesPreviewCode(attrs: Record<string, unknown>): string | null {
  const gradeRaw  = ((attrs.material_grade as string) ?? '').trim();
  const thickRaw  = ((attrs.thickness_mm   as string) ?? '').trim();
  const widthRaw  = ((attrs.width_mm       as string) ?? '').trim();
  const lengthRaw = ((attrs.length_mm      as string) ?? '').trim();

  const grade  = _PLATES_GRADE_CODE[gradeRaw];
  if (!grade) return null;
  if (lengthRaw === 'Mill Length' || !lengthRaw) return null;

  const thick  = _normDim(thickRaw);
  const width  = _normDim(widthRaw);
  const length = _normDim(lengthRaw);
  if (!thick || !width || !length) return null;

  return `RM-PLT-${grade}-${thick}X${width}X${length}`;
}

export const PLATES_DEFAULTS: Record<string, unknown> = {
  material_grade: 'IS 2062 E250',
  thickness_mm:   '6',
  width_mm:       '1500',
  length_mm:      '6000',
  mtr_required:   'No',
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
// 2. PROFILES (Solid Circular · Hollow Circular)
// ─────────────────────────────────────────────────────────────────────────────
const PROFILES_MATERIAL_GRADES = PLATES_MATERIAL_GRADES; // same 13-grade list
const PROFILES_THICKNESS = ["6","8","10","12","16","20","25","32","40","50","63","75","100"];
const PROFILES_OD_OPTS   = ["50","63","75","100","120","150","200","250","300","350","400","450","500","600","750","1000"];
const PROFILES_ID_OPTS   = ["44","56","68","88","106","138","188","238","288","338","388","438","476","548"];
const PROFILES_DIM_TOL   = ["h9","h10","h11","h12","JS9","JS11","±0.5 mm","±1 mm","±1.5 mm","±2 mm","Per IS 1732","Per ASTM A484","Per EN 10060"];
const PROFILES_SURFACE   = ["No.1 (HR)","No.2B (CR)","Pickled & Passivated","Black (As-rolled)","Bright Drawn"];
const PROFILES_TESTING   = ["UT (Ultrasonic)","Hydrotest","Impact Test","Charpy Test","NACE MR-0175","HIC Test"];
const PROFILES_ALL_OPTS: Record<string, string[]> = {
  profile_type:        ['Solid Circular', 'Hollow Circular'],
  material_grade:      PROFILES_MATERIAL_GRADES,
  thickness_mm:        PROFILES_THICKNESS,
  od_mm:               PROFILES_OD_OPTS,
  id_mm:               PROFILES_ID_OPTS,
  mtr_required:        YES_NO,
  heat_treatment:      HEAT_TREATMENT_OPTS,
  surface_finish:      PROFILES_SURFACE,
  additional_testing:  PROFILES_TESTING,
  dimensional_tolerance: PROFILES_DIM_TOL,
};

// ── Profiles SAP Item Code helpers (client mirror of server builder) ──────────
const _PROFILES_GRADE_CODE: Record<string, string> = {
  'IS 2062 E250': 'E250', 'IS 2062 E350': 'E350',
  'SS304': 'SS304', 'SS304L': 'SS304L', 'SS316': 'SS316', 'SS316L': 'SS316L',
  'SA 516 Gr 60': 'SA516-60', 'SA 516 Gr 70': 'SA516-70',
  'ASTM A36': 'A36',
  'SA-240 Gr 304': 'SA240-304', 'SA-240 Gr 304L': 'SA240-304L',
  'SA-240 Gr 316': 'SA240-316', 'SA-240 Gr 316L': 'SA240-316L',
};

/** Client-side preview of the Profiles SAP Item Code. Returns null when any required field is missing/invalid. */
export function buildProfilesPreviewCode(attrs: Record<string, unknown>): string | null {
  const profileType = ((attrs.profile_type   as string) ?? '').trim();
  const gradeRaw    = ((attrs.material_grade as string) ?? '').trim();
  const thickRaw    = ((attrs.thickness_mm   as string) ?? '').trim();
  const odRaw       = ((attrs.od_mm          as string) ?? '').trim();
  const idRaw       = ((attrs.id_mm          as string) ?? '').trim();

  const grade = _PROFILES_GRADE_CODE[gradeRaw];
  if (!grade) return null;

  const thick = _normDim(thickRaw);
  const od    = _normDim(odRaw);
  if (!thick || !od) return null;

  if (profileType === 'Hollow Circular') {
    const id = _normDim(idRaw);
    if (!id) return null;
    if (parseFloat(id) >= parseFloat(od)) return null;
    return `RM-PRF-CIRH-${grade}-${thick}XOD${od}XID${id}`;
  }

  if (profileType === 'Solid Circular') {
    return `RM-PRF-CIR-${grade}-${thick}XOD${od}`;
  }

  return null;
}

export const PROFILES_DEFAULTS: Record<string, unknown> = {
  profile_type:   'Solid Circular',
  material_grade: 'IS 2062 E250',
  thickness_mm:   '12',
  od_mm:          '500',
  id_mm:          '',
  mtr_required:   'No',
};

export function buildProfilesRequirement(attrs: Record<string, unknown>): string {
  const type  = (attrs.profile_type   as string)?.trim() || '';
  const grade = (attrs.material_grade as string)?.trim() || '';
  const thick = (attrs.thickness_mm   as string)?.trim() || '';
  const od    = (attrs.od_mm          as string)?.trim() || '';
  const id    = (attrs.id_mm          as string)?.trim() || '';
  if (!grade) return '';
  const parts: string[] = [grade, type || 'Profile'];
  if (thick)         parts.push(`${thick} mm thk`);
  if (od)            parts.push(`OD ${od} mm`);
  if (id && type === 'Hollow Circular') parts.push(`ID ${id} mm`);
  return parts.join(', ');
}

export function ProfilesAttrsForm({
  attrs, qty, onChange, onQtyChange,
}: {
  attrs: Record<string, unknown>;
  qty?: string;
  onChange: (a: Record<string, unknown>) => void;
  onQtyChange?: (q: string) => void;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>(() => {
    const c: Record<string, boolean> = {};
    for (const [key, opts] of Object.entries(PROFILES_ALL_OPTS)) {
      const val = (attrs[key] as string) ?? '';
      c[key] = val !== '' && !opts.includes(val);
    }
    return c;
  });
  const set = (key: string, val: unknown) => onChange({ ...attrs, [key]: val });

  function handleSelect(key: string, val: string) {
    if (val === '__other__') { setCustom(c => ({ ...c, [key]: true })); set(key, ''); }
    else { setCustom(c => ({ ...c, [key]: false })); set(key, val); }
  }

  function rf(key: string, label: string, opts: string[], required?: boolean, numericCustom?: boolean) {
    const curVal = (attrs[key] as string) ?? '';
    const isCust = custom[key] ?? false;
    const selVal = isCust ? '__other__' : (opts.includes(curVal) ? curVal : '');
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <SearchableSelect value={selVal} options={opts} placeholder="Select…" onSelect={v => handleSelect(key, v)} />
        {isCust && (
          <Input className="h-8 text-sm"
            type={numericCustom ? 'number' : 'text'}
            placeholder={numericCustom ? 'Enter mm…' : 'Enter custom…'}
            value={curVal}
            onWheel={numericCustom ? (e) => e.currentTarget.blur() : undefined}
            onChange={e => set(key, e.target.value)}
            autoFocus />
        )}
      </div>
    );
  }

  const profileType = (attrs.profile_type as string) ?? '';
  const isHollow    = profileType === 'Hollow Circular';

  return (
    <div className="space-y-3">
      <SectionCard title="Profile Type & Dimensions" color="bg-sky-50/60 border-sky-200">
        {rf('profile_type',   'Profile Type',             ['Solid Circular', 'Hollow Circular'], true)}
        {rf('material_grade', 'Material Grade',           PROFILES_MATERIAL_GRADES,              true)}
        {rf('thickness_mm',   'Thickness (mm)',           PROFILES_THICKNESS,                    true, true)}
        {rf('od_mm',          'Outside Diameter — OD (mm)', PROFILES_OD_OPTS,                   true, true)}
        {isHollow
          ? rf('id_mm', 'Inside Diameter — ID (mm)', PROFILES_ID_OPTS, true, true)
          : <div />}
        <div />
      </SectionCard>
      <SectionCard title="Quality & Testing" color="bg-slate-50/80 border-slate-200">
        {rf('mtr_required',          'MTR Required',          YES_NO)}
        {rf('dimensional_tolerance', 'Dimensional Tolerance', PROFILES_DIM_TOL)}
        {rf('heat_treatment',        'Heat Treatment',        HEAT_TREATMENT_OPTS)}
        {rf('surface_finish',        'Surface Finish',        PROFILES_SURFACE)}
        {rf('additional_testing',    'Additional Testing',    PROFILES_TESTING)}
        <QtyField qty={qty} onQtyChange={onQtyChange} />
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PIPES
// ─────────────────────────────────────────────────────────────────────────────

// ── Pipes SAP Item Code helpers (client mirror of server builder) ─────────────
const _PIPES_GRADE_CODE: Record<string, string> = {
  'IS 1239 Class A': 'IS1239A',  'IS 1239 Class B': 'IS1239B',  'IS 1239 Class C': 'IS1239C',
  'IS 3589 Fe 330':  'IS3589-330', 'IS 3589 Fe 410': 'IS3589-410',
  'SA-106 Gr B': 'SA106B', 'SA-53 Gr B': 'SA53B',
  'SS304 Pipe': 'SS304', 'SS304L Pipe': 'SS304L', 'SS316 Pipe': 'SS316', 'SS316L Pipe': 'SS316L',
  'SA-312 TP304': 'SA312-304', 'SA-312 TP304L': 'SA312-304L',
  'SA-312 TP316': 'SA312-316', 'SA-312 TP316L': 'SA312-316L',
  'Copper Pipe': 'CU', 'Aluminium Pipe': 'AL',
};
const _PIPES_SCHEDULE_CODE: Record<string, string> = {
  'SCH 5': 'SCH5', 'SCH 5S': 'SCH5S', 'SCH 10': 'SCH10', 'SCH 10S': 'SCH10S',
  'SCH 20': 'SCH20', 'SCH 40': 'SCH40', 'SCH 40S': 'SCH40S',
  'SCH 80': 'SCH80', 'SCH 80S': 'SCH80S', 'SCH 160': 'SCH160',
  'XXS': 'XXS', 'STD': 'STD', 'XS': 'XS',
};

/** Client-side preview of the Pipes SAP Item Code. Returns null when any required field is missing/invalid. */
export function buildPipesPreviewCode(attrs: Record<string, unknown>): string | null {
  const gradeRaw = ((attrs.material_grade as string) ?? '').trim();
  const nbRaw    = ((attrs.nominal_bore   as string) ?? '').trim();
  const schRaw   = ((attrs.schedule       as string) ?? '').trim();
  const grade = _PIPES_GRADE_CODE[gradeRaw];
  const sch   = _PIPES_SCHEDULE_CODE[schRaw];
  if (!grade || !nbRaw || !sch) return null;
  return `RM-PIP-${grade}-${nbRaw}-${sch}`;
}

const PIPES_MATERIAL_GRADES = [
  "IS 1239 Class A","IS 1239 Class B","IS 1239 Class C",
  "IS 3589 Fe 330","IS 3589 Fe 410",
  "SA-106 Gr B","SA-53 Gr B",
  "SS304 Pipe","SS304L Pipe","SS316 Pipe","SS316L Pipe",
  "SA-312 TP304","SA-312 TP304L","SA-312 TP316","SA-312 TP316L",
  "Copper Pipe","Aluminium Pipe",
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
  "IS 1239","IS 3589","IS 6913","ASME Sec. II Part A","ASME Sec. II Part B",
];
const PIPES_SURFACE         = ["Black (As-rolled)","Pickled & Passivated","Hot-Dip Galvanized"];
const PIPES_NDT             = ["None","Hydrotest","Ultrasonic (UT)","Radiography (RT)","Magnetic Particle (MT)"];
const PIPES_TESTING         = ["UT (Ultrasonic)","Hydrotest","Radiography (RT)","Magnetic Particle (MT)","Impact Testing","Charpy Test","HIC Test","NACE MR-0175"];
const PIPES_ALL_OPTS: Record<string, string[]> = {
  material_grade:     PIPES_MATERIAL_GRADES,
  nominal_bore:       COMMON_NB,
  schedule:           PIPES_SCHEDULE,
  end_condition:      PIPES_END_CONDITION,
  length:             PIPES_LENGTH_OPTS,
  pipe_standard:      PIPES_STANDARD_OPTS,
  mtr_required:       YES_NO,
  additional_testing: PIPES_TESTING,
  surface_condition:  PIPES_SURFACE,
  ndt_requirement:    PIPES_NDT,
  heat_treatment:     HEAT_TREATMENT_OPTS,
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
        const derived = derivePipeStandard(val);
        onChange({ ...attrs, material_grade: val, pipe_standard: derived });
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
        {rf("pipe_standard",  "Pipe Standard",  PIPES_STANDARD_OPTS,   true)}
        {rf("nominal_bore",   "Nominal Bore",   COMMON_NB,             true)}
        {rf("schedule",       "Schedule",       PIPES_SCHEDULE,        true)}
        {rf("end_condition",  "End Condition",  endOpts)}
        {rf("length",         "Length",         PIPES_LENGTH_OPTS,     true)}
      </SectionCard>
      <SectionCard title="Standards & Quality" color="bg-emerald-50/60 border-emerald-200">
        {rf("mtr_required",       "MTR Required",       YES_NO,        true)}
        {rf("additional_testing", "Additional Testing", PIPES_TESTING)}
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
const FITTINGS_PRESSURE_CLASS = ['3000LB', '6000LB', '9000LB'];

const FITTINGS_TYPES = [
  "90° 1D Elbow","90° 1.5D Elbow","90° 2D Elbow",
  "45° 1D Elbow","45° 1.5D Elbow","45° 2D Elbow",
  "Equal Tee","Reducing Tee","Cross",
  "Concentric Reducer","Eccentric Reducer",
  "End Cap","Stub End","Swage Nipple",
  "Coupling","Half Coupling","Union","Boss",
  "Barrel Nipple","Pipe Nipple",
];
const FITTINGS_MATERIAL = [
  "A 105","A 182 F304","A 182 F316",
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
const NIPPLE_LENGTHS    = ["50","75","100","125","150","200","250","300"];
const FITTINGS_ALL_OPTS: Record<string, string[]> = {
  fitting_type:     FITTINGS_TYPES,
  material_grade:   FITTINGS_MATERIAL,
  nominal_bore:     COMMON_NB,
  schedule:         FITTINGS_SCHEDULE,
  pressure_class:   FITTINGS_PRESSURE_CLASS,
  end_type:         FITTINGS_END_TYPE_FULL,
  fitting_standard: FITTINGS_STANDARD,
  mtr_required:     YES_NO,
  elbow_radius:     ELBOW_RADIUS_OPTS,
  reducing_bore:    COMMON_NB,
  length_mm:        NIPPLE_LENGTHS,
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
  const isLRElbow = ftype.includes("Elbow");
  const isReduce  = ftLower.includes("reducer") || ftype === "Reducing Tee" || ftype === "Swage Nipple";
  const isNipple  = ftype === "Barrel Nipple" || ftype === "Pipe Nipple";
  const endType   = (attrs.end_type as string) ?? "";
  // Coupling / Half Coupling / Union / Boss + SW or Screwed → Pressure Class replaces Schedule
  const isPCType        = ["Coupling","Half Coupling","Union","Boss"].includes(ftype);
  const usePressureClass = isPCType && (endType.includes("Socket Weld") || endType.toLowerCase().includes("screwed") || endType.toLowerCase().includes("npt") || endType.toLowerCase().includes("bsp"));
  const nb        = (attrs.nominal_bore as string) ?? "";
  const nbNum     = parseInt((nb.match(/^(\d+)NB$/i)?.[1]) ?? "999");
  const isSW      = endType.includes("Socket Weld") || endType.toLowerCase().includes("screwed");
  const stdHint   = isSW ? "ASME B16.11" : "ASME B16.9";
  const endOpts   = fittingEndTypeOpts(nb);

  return (
    <div className="space-y-3">
      <SectionCard title="Fitting Specification" color="bg-sky-50/60 border-sky-200">
        {rf("fitting_type",   "Fitting Type",   FITTINGS_TYPES,    true)}
        {rf("material_grade", "Material Grade", FITTINGS_MATERIAL,     true)}
        {rf("nominal_bore",   "Nominal Bore",   COMMON_NB,             true)}
        {rf("end_type", "End Type", endOpts, true)}
        {usePressureClass
          ? rf("pressure_class", "Pressure Class (3000LB / 6000LB / 9000LB)", FITTINGS_PRESSURE_CLASS, true)
          : rf("schedule",       "Schedule",                                   FITTINGS_SCHEDULE,        true)
        }
      </SectionCard>
      <SectionCard title="Connection & Standards" color="bg-emerald-50/60 border-emerald-200">
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
      {(isLRElbow || isReduce || isNipple) && (
        <SectionCard title="Conditional Details" color="bg-violet-50/60 border-violet-200">
          {isLRElbow && rf("elbow_radius",  "Elbow Radius",       ELBOW_RADIUS_OPTS, true)}
          {isReduce  && rf("reducing_bore", "Reducing Size (NB)", COMMON_NB,         true)}
          {isNipple  && rf("length_mm",     "Length (mm) *",      NIPPLE_LENGTHS,    true)}
          {((isLRElbow || isNipple) && !isReduce) && <div />}
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

// ── Fittings SAP Item Code helpers (client mirror of server builder) ──────────
const _FTG_TYPE_CODE: Record<string, string> = {
  '90° 1D Elbow':'E90-1D','90° 1.5D Elbow':'E90-1.5D','90° 2D Elbow':'E90-2D',
  '45° 1D Elbow':'E45-1D','45° 1.5D Elbow':'E45-1.5D','45° 2D Elbow':'E45-2D',
  'Equal Tee':'TEE','Reducing Tee':'TEER','Cross':'CRS',
  'Concentric Reducer':'REDC','Eccentric Reducer':'REDE',
  'End Cap':'CAP','Stub End':'STUB','Swage Nipple':'SWAG',
  'Coupling':'CPLG','Half Coupling':'HCPL','Union':'UNI','Boss':'BOSS',
  'Barrel Nipple':'BNIP','Pipe Nipple':'PNIP',
};
const _FTG_GRADE_CODE: Record<string, string> = {
  'A 105':'A105','A 182 F304':'A182-F304','A 182 F316':'A182-F316',
  'A234 WPB':'A234-WPB','A234 WPC':'A234-WPC','A234 WP11':'A234-WP11','A234 WP22':'A234-WP22',
  'A403 WP304':'A403-304','A403 WP304L':'A403-304L','A403 WP316':'A403-316',
  'A403 WP316L':'A403-316L','A403 WP321':'A403-321','A403 WP347':'A403-347',
  'A860 WPHY 60':'A860-60','Duplex F51':'F51','Super Duplex F53':'F53',
};
const _FTG_SCH_CODE: Record<string, string> = {
  'SCH 5':'SCH5','SCH 5S':'SCH5S','SCH 10':'SCH10','SCH 10S':'SCH10S','SCH 20':'SCH20',
  'SCH 40':'SCH40','SCH 40S':'SCH40S','SCH 80':'SCH80','SCH 80S':'SCH80S',
  'SCH 160':'SCH160','XXS':'XXS','STD':'STD','XS':'XS',
};
const _FTG_END_CODE: Record<string, string> = {
  'Butt Weld (BW)':'BW','Socket Weld (SW)':'SW','Screwed NPT':'NPT','Screwed BSP':'BSP',
};
const _FTG_PC_TYPES  = new Set(['Coupling','Half Coupling','Union','Boss']);
const _FTG_SW_ENDS   = new Set(['Socket Weld (SW)','Screwed NPT','Screwed BSP']);
const _FTG_REDUCING  = new Set(['Concentric Reducer','Eccentric Reducer','Reducing Tee','Swage Nipple']);

const _FTG_NIPPLES = new Set(['Barrel Nipple', 'Pipe Nipple']);

/** Client-side preview of the Fittings SAP Item Code. Returns null when any required field is missing/invalid. */
export function buildFittingsPreviewCode(attrs: Record<string, unknown>): string | null {
  const ftype   = ((attrs.fitting_type   as string) ?? '').trim();
  const gradeRaw= ((attrs.material_grade as string) ?? '').trim();
  const nbRaw   = ((attrs.nominal_bore   as string) ?? '').trim();
  const schRaw  = ((attrs.schedule       as string) ?? '').trim();
  const endRaw  = ((attrs.end_type       as string) ?? '').trim();
  const pcRaw   = ((attrs.pressure_class as string) ?? '').trim();
  const rbRaw   = ((attrs.reducing_bore  as string) ?? '').trim();
  const lenRaw  = ((attrs.length_mm      as string) ?? '').trim().replace(/mm$/i, '');

  const typeCode = _FTG_TYPE_CODE[ftype];
  const grade    = _FTG_GRADE_CODE[gradeRaw];
  const endCode  = _FTG_END_CODE[endRaw];
  if (!typeCode || !grade || !nbRaw || !endCode) return null;

  const needsPC = _FTG_PC_TYPES.has(ftype) && _FTG_SW_ENDS.has(endRaw);
  let sizeDim: string;
  if (needsPC) {
    if (!pcRaw) return null;
    sizeDim = pcRaw;
  } else {
    const sch = _FTG_SCH_CODE[schRaw];
    if (!sch) return null;
    sizeDim = sch;
  }

  const isReducing = _FTG_REDUCING.has(ftype);
  if (isReducing && !rbRaw) return null;

  const isNipple = _FTG_NIPPLES.has(ftype);
  if (isNipple && !lenRaw) return null;

  const nbPart   = isReducing ? `${nbRaw}X${rbRaw}` : nbRaw;
  const segments = ['RM-FTG', typeCode, grade, nbPart];
  if (isNipple) segments.push(`${lenRaw}MM`);
  segments.push(sizeDim, endCode);
  const code = segments.join('-');
  return code.length <= 50 ? code : null;
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
// UI labels: "Fully Threaded Stud" and "Double-End Stud" (SAP codes: STDBF / STDBT)
const FASTENER_TYPES = [
  "Fully Threaded Stud","Double-End Stud",
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
const FASTENER_WASHER_MATERIAL = [
  "Carbon Steel (IS 2062)","SS 304","SS 316","Alloy Steel",
];
const FASTENER_DIAMETER = [
  "M8","M10","M12","M14","M16","M18","M20","M22","M24","M27","M30","M36","M42","M48",
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
  "ASME B18.2.1","ASME B18.2.2","ASME B18.22.1",
  "DIN 931","DIN 933","DIN 934","DIN 125",
  "IS 1364","IS 1367","ASTM F436",
];
const FASTENER_ANCHOR_SUBTYPES = ["L-Bolt","J-Bolt","Straight","Headed"];
const FASTENER_EYE_SUBTYPES    = ["Shoulder (Machinery)","Plain (Nut Eye)"];
const FASTENER_BOLT_PROFILES   = ["Full Thread","Partial Thread"];
const FASTENER_WASHER_SERIES   = [
  "DIN 125 A","DIN 125 B","ASME B18.22.1 Type A","ASME B18.22.1 Type B","ASME B18.22.1 Type C",
  "IS 2016","DIN 127 B","DIN 128 A","ASME B27.1","IS 3063",
];

// Diameter families — used for threading compatibility filtering
const _FST_METRIC_DIAS = new Set([
  "M8","M10","M12","M14","M16","M18","M20","M22","M24","M27","M30","M36","M42","M48",
]);

const FASTENERS_ALL_OPTS: Record<string, string[]> = {
  fastener_type:      FASTENER_TYPES,
  bolt_material:      FASTENER_BOLT_MATERIAL,
  nut_material:       FASTENER_NUT_MATERIAL,
  washer_material:    FASTENER_WASHER_MATERIAL,
  diameter:           FASTENER_DIAMETER,
  rod_diameter:       FASTENER_DIAMETER,
  threading_standard: FASTENER_THREADING,
  fastener_standard:  FASTENER_STANDARD,
  coating:            FASTENER_COATING,
  thread_protection:  FASTENER_THREAD_PROTECTION,
  anchor_type:        FASTENER_ANCHOR_SUBTYPES,
  eye_bolt_type:      FASTENER_EYE_SUBTYPES,
  bolt_profile:       FASTENER_BOLT_PROFILES,
  washer_series:      FASTENER_WASHER_SERIES,
  pipe_size:          COMMON_NB,
};

export function buildFastenersRequirement(attrs: Record<string, unknown>): string {
  const g   = (k: string) => ((attrs[k] as string)?.trim() || "");
  const ftype = g("fastener_type");
  if (!ftype) return "";
  const parts: string[] = [ftype];
  if (ftype === "U-Bolt") {
    const bmat = g("bolt_material"); if (bmat) parts.push(bmat);
    const rd = g("rod_diameter");   if (rd) parts.push(`${rd} rod`);
    const nb = g("pipe_size");      if (nb) parts.push(nb);
    const ll = g("leg_length");     if (ll) parts.push(`leg=${ll}mm`);
  } else if (ftype === "Anchor Bolt") {
    const sub = g("anchor_type");   if (sub) parts.push(`(${sub})`);
    const bmat = g("bolt_material"); if (bmat) parts.push(bmat);
    const dia = g("diameter");      if (dia) parts.push(dia);
    const ol = g("overall_length"); if (ol) parts.push(`OL=${ol}mm`);
    const tl = g("thread_length"); if (tl) parts.push(`TL=${tl}mm`);
  } else if (ftype === "Eye Bolt") {
    const sub = g("eye_bolt_type"); if (sub) parts.push(`(${sub})`);
    const bmat = g("bolt_material"); if (bmat) parts.push(bmat);
    const dia = g("diameter");      if (dia) parts.push(dia);
    const sl = g("shank_length");   if (sl) parts.push(`SL=${sl}mm`);
  } else {
    const bmat = g("bolt_material"); const nmat = g("nut_material"); const wmat = g("washer_material");
    if (bmat && nmat && wmat) parts.push(`${bmat} / ${nmat} / ${wmat}`);
    else if (bmat && nmat)    parts.push(`${bmat} / ${nmat}`);
    else if (nmat)            parts.push(nmat);
    else if (wmat)            parts.push(wmat);
    else if (bmat)            parts.push(bmat);
    const dia = g("diameter"); if (dia) parts.push(dia);
    const len = g("length_mm"); if (len) parts.push(`L=${len}mm`);
    const thr = g("threading_standard"); if (thr) parts.push(thr);
  }
  const coat = g("coating"); if (coat) parts.push(coat);
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
  // Metric bolts/studs: DIN 931 vs DIN 933 ambiguous — leave blank
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
  function numField(key: string, label: string, required?: boolean) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}{required && <span className="text-red-500"> *</span>}</Label>
        <Input className="h-8 text-sm" type="number" min="1" max="2000" step="1" placeholder="mm"
          value={(attrs[key] as string) ?? ""}
          onWheel={e => e.currentTarget.blur()}
          onChange={e => set(key, e.target.value)} />
      </div>
    );
  }

  // ── Type family ──────────────────────────────────────────────────────────
  const ftype        = (attrs.fastener_type      as string) ?? "";
  const isStudBolt   = ftype === "Fully Threaded Stud" || ftype === "Double-End Stud";
  const isSet        = ftype === "Stud + 2 Nut + 2 Washer Set";
  const isHexBolt    = ftype === "Hex Bolt";
  const isAnchorBolt = ftype === "Anchor Bolt";
  const isEyeBolt    = ftype === "Eye Bolt";
  const isUBolt      = ftype === "U-Bolt";
  const isNut        = ftype === "Hex Nut" || ftype === "Heavy Hex Nut";
  const isWasher     = ftype === "Flat Washer" || ftype === "Spring Washer";

  // ── Diameter family (drives threading filter) ────────────────────────────
  const currDia     = (attrs.diameter as string) ?? "";
  const diaIsMetric = _FST_METRIC_DIAS.has(currDia);
  const diaIsInch   = !diaIsMetric && currDia !== "";

  // Threading options filtered by diameter family
  const allowedThreading = diaIsMetric
    ? ["ISO Metric Coarse","ISO Metric Fine"]
    : diaIsInch
    ? ["ASME B1.1 (UNC)","ASME B1.1 (UNF)"]
    : FASTENER_THREADING;

  // Auto-clear threading if incompatible with selected diameter
  const threadRaw = (attrs.threading_standard as string) ?? "";
  if (currDia && threadRaw) {
    const isMT = threadRaw === "ISO Metric Coarse" || threadRaw === "ISO Metric Fine";
    const ok   = diaIsMetric ? isMT : !isMT;
    if (!ok) Promise.resolve().then(() => onChange({ ...attrs, threading_standard: "" }));
  }
  // Auto-clear bolt_profile when diameter changes to inch
  const profRaw = (attrs.bolt_profile as string) ?? "";
  if (isHexBolt && diaIsInch && profRaw) {
    Promise.resolve().then(() => onChange({ ...attrs, bolt_profile: "" }));
  }

  // ── Field visibility ──────────────────────────────────────────────────────
  const showBoltProfile  = isHexBolt && diaIsMetric;
  const showStdLen       = isStudBolt || isSet || isHexBolt;
  const showBoltMat      = isStudBolt || isSet || isHexBolt || isAnchorBolt || isEyeBolt || isUBolt;
  const showNutMat       = isSet || isNut;
  const showWasherMat    = isSet || isWasher;
  const showThread       = isStudBolt || isSet || isHexBolt || isAnchorBolt || isNut;
  const showFastenerStd  = !isUBolt && !isWasher;
  const bmatLabel        = (isStudBolt || isSet) ? "Stud Material" : isUBolt ? "Material" : "Bolt Material";

  // Auto-derive fastener standard
  const derivedFStd = deriveFastenerStandard(ftype, threadRaw);
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
        <Label className="text-xs">Fastener Standard <span className="text-muted-foreground text-[10px]">(engineering)</span></Label>
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
      {/* ── Card 1: Specification & Dimensions ─────────────────────────────── */}
      <SectionCard title="Fastener Specification" color="bg-sky-50/60 border-sky-200">
        {rf("fastener_type", "Fastener Type", FASTENER_TYPES, true)}

        {/* Sub-type selectors */}
        {isAnchorBolt && rf("anchor_type",   "Anchor Type",     FASTENER_ANCHOR_SUBTYPES, true)}
        {isEyeBolt    && rf("eye_bolt_type",  "Eye Bolt Type",   FASTENER_EYE_SUBTYPES,    true)}

        {/* Bolt profile — Hex Bolt + metric diameter only */}
        {showBoltProfile && rf("bolt_profile", "Bolt Profile", FASTENER_BOLT_PROFILES, true)}

        {/* Diameter — standard types (not U-Bolt) */}
        {!isUBolt && rf("diameter", "Diameter", FASTENER_DIAMETER, true)}

        {/* U-Bolt geometry */}
        {isUBolt && rf("rod_diameter", "Rod Diameter",   FASTENER_DIAMETER, true)}
        {isUBolt && rf("pipe_size",    "Pipe Size (NB)", COMMON_NB,         true)}

        {/* Lengths by family */}
        {showStdLen    && numField("length_mm",      "Length (mm)",          true)}
        {isAnchorBolt  && numField("overall_length", "Overall Length (mm)",  true)}
        {isAnchorBolt  && numField("thread_length",  "Thread Length (mm)",   true)}
        {isEyeBolt     && numField("shank_length",   "Shank Length (mm)",    true)}
        {isUBolt       && numField("leg_length",     "Leg Length (mm)",      true)}

        {/* Fastener standard (engineering-only) */}
        {showFastenerStd && rfFStd()}
      </SectionCard>

      {/* ── Card 2: Materials & Finishing ──────────────────────────────────── */}
      <SectionCard title="Materials & Finishing" color="bg-violet-50/60 border-violet-200">
        {showBoltMat   && rf("bolt_material",    bmatLabel,                    FASTENER_BOLT_MATERIAL,    true)}
        {showNutMat    && rf("nut_material",     "Nut Material",               FASTENER_NUT_MATERIAL,     true)}
        {showWasherMat && rf("washer_material",  "Washer Material",            FASTENER_WASHER_MATERIAL,  true)}
        {isWasher      && rf("washer_series",    "Washer Series (engineering)", FASTENER_WASHER_SERIES)}
        {showThread    && rf("threading_standard","Threading Standard",         allowedThreading,          true)}
        {rf("coating",           "Coating / Finish",    FASTENER_COATING,          true)}
        {!isWasher     && rf("thread_protection", "Thread Protection",         FASTENER_THREAD_PROTECTION)}
        <QtyField qty={qty} onQtyChange={onQtyChange} />
      </SectionCard>
    </div>
  );
}

// ── Client-side SAP code preview builder ─────────────────────────────────────
const _P_FST_TYPE: Record<string, string> = {
  "Fully Threaded Stud":"STDBF","Double-End Stud":"STDBT",
  "Stud + 2 Nut + 2 Washer Set":"STDS","Hex Bolt":"HXBT",
  "Anchor Bolt":"ANBT","Eye Bolt":"EYBT","U-Bolt":"UBLT",
  "Hex Nut":"HXNT","Heavy Hex Nut":"HHNT",
  "Flat Washer":"FLWSH","Spring Washer":"SPWSH",
};
const _P_FST_BMAT: Record<string, string> = {
  "ASTM A193 B7":"B7","ASTM A193 B7M":"B7M",
  "ASTM A193 B8 (SS304)":"B8","ASTM A193 B8 Class 2":"B8C2",
  "ASTM A193 B8M (SS316)":"B8M","ASTM A193 B8M Class 2":"B8MC2",
  "ASTM A193 B16":"B16","ASTM A320 L7":"L7",
  "IS 1367 Cl.8.8":"IS88","IS 1367 Cl.10.9":"IS109",
  "A307":"A307","A325":"A325","A490":"A490",
};
const _P_FST_NMAT: Record<string, string> = {
  "ASTM A194 2H":"2H","ASTM A194 2HM":"2HM",
  "ASTM A194 8 (SS304)":"8","ASTM A194 8M (SS316)":"8M",
  "ASTM A194 4":"4","ASTM A194 7":"7","ASTM A194 7M":"7M",
  "IS 1367 Cl.8":"IS8",
};
const _P_FST_WMAT: Record<string, string> = {
  "Carbon Steel (IS 2062)":"CS","SS 304":"SS304","SS 316":"SS316","Alloy Steel":"AS",
};
const _P_FST_DIA: Record<string, string> = {
  "M8":"M8","M10":"M10","M12":"M12","M14":"M14","M16":"M16","M18":"M18",
  "M20":"M20","M22":"M22","M24":"M24","M27":"M27","M30":"M30",
  "M36":"M36","M42":"M42","M48":"M48",
  '1/4"':"14IN",'3/8"':"38IN",'1/2"':"12IN",'5/8"':"58IN",
  '3/4"':"34IN",'7/8"':"78IN",'1"':"1IN",
  '1-1/4"':"114IN",'1-1/2"':"112IN",'1-3/4"':"134IN",'2"':"2IN",
};
const _P_FST_THR: Record<string, string> = {
  "ASME B1.1 (UNC)":"UNC","ASME B1.1 (UNF)":"UNF",
  "ISO Metric Coarse":"MC","ISO Metric Fine":"MF",
};
const _P_FST_COAT: Record<string, string> = {
  "Plain (Uncoated)":"PLN","Hot-Dip Galvanized":"HDG",
  "Zinc Electroplated":"ZEP","Xylan / Fluoropolymer":"XYL",
  "PTFE Coated":"PTFE","Black Oxide":"BOX",
};
const _P_FST_ANCH: Record<string, string> = {
  "L-Bolt":"LBLT","J-Bolt":"JBLT","Straight":"STR","Headed":"HDR",
};
const _P_FST_EYE: Record<string, string> = {
  "Shoulder (Machinery)":"SHD","Plain (Nut Eye)":"PNE",
};
const _P_FST_PROF: Record<string, string> = {
  "Full Thread":"FT","Partial Thread":"PT",
};
const _P_FST_STUD = new Set(["Fully Threaded Stud","Double-End Stud"]);
const _P_FST_NUT  = new Set(["Hex Nut","Heavy Hex Nut"]);
const _P_FST_WSHR = new Set(["Flat Washer","Spring Washer"]);

export function buildFastenersPreviewCode(attrs: Record<string, unknown>): string {
  try {
    const g = (k: string) => ((attrs[k] as string) ?? "").trim();
    const ftype       = g("fastener_type");
    const typeCode    = _P_FST_TYPE[ftype]; if (!typeCode) return "";
    const coat        = _P_FST_COAT[g("coating")]; if (!coat) return "";

    const bmat        = _P_FST_BMAT[g("bolt_material")];
    const nmat        = _P_FST_NMAT[g("nut_material")];
    const wmat        = _P_FST_WMAT[g("washer_material")];
    const dia         = _P_FST_DIA[g("diameter")];
    const thr         = _P_FST_THR[g("threading_standard")];
    const lenRaw      = g("length_mm").replace(/mm$/i, "");
    const totLenRaw   = g("overall_length").replace(/mm$/i, "");
    const thrdLenRaw  = g("thread_length").replace(/mm$/i, "");
    const shankLenRaw = g("shank_length").replace(/mm$/i, "");
    const legLenRaw   = g("leg_length").replace(/mm$/i, "");
    const rdDia       = _P_FST_DIA[g("rod_diameter")];
    const pipeSz      = g("pipe_size");

    if (_P_FST_STUD.has(ftype)) {
      if (!bmat || !dia || !lenRaw || !thr) return "";
      return `RM-FST-${typeCode}-${bmat}-${dia}-${lenRaw}MM-${thr}-${coat}`;
    }
    if (ftype === "Stud + 2 Nut + 2 Washer Set") {
      if (!bmat || !nmat || !wmat || !dia || !lenRaw || !thr) return "";
      return `RM-FST-STDS-${bmat}-${nmat}-${wmat}-${dia}-${lenRaw}MM-${thr}-${coat}`;
    }
    if (ftype === "Hex Bolt") {
      if (!bmat || !dia || !lenRaw || !thr) return "";
      const isMetric = _FST_METRIC_DIAS.has(g("diameter"));
      if (isMetric) {
        const prof = _P_FST_PROF[g("bolt_profile")]; if (!prof) return "";
        return `RM-FST-HXBT-${prof}-${bmat}-${dia}-${lenRaw}MM-${thr}-${coat}`;
      }
      return `RM-FST-HXBT-${bmat}-${dia}-${lenRaw}MM-${thr}-${coat}`;
    }
    if (ftype === "Anchor Bolt") {
      const sub = _P_FST_ANCH[g("anchor_type")];
      if (!sub || !bmat || !dia || !totLenRaw || !thrdLenRaw) return "";
      return `RM-FST-ANBT-${sub}-${bmat}-${dia}-${totLenRaw}MM-${thrdLenRaw}MM-${coat}`;
    }
    if (ftype === "Eye Bolt") {
      const sub = _P_FST_EYE[g("eye_bolt_type")];
      if (!sub || !bmat || !dia || !shankLenRaw) return "";
      return `RM-FST-EYBT-${sub}-${bmat}-${dia}-${shankLenRaw}MM-${coat}`;
    }
    if (ftype === "U-Bolt") {
      if (!bmat || !rdDia || !pipeSz || !legLenRaw) return "";
      return `RM-FST-UBLT-${bmat}-${rdDia}-${pipeSz}-${legLenRaw}MM-${coat}`;
    }
    if (_P_FST_NUT.has(ftype)) {
      if (!nmat || !dia || !thr) return "";
      return `RM-FST-${typeCode}-${nmat}-${dia}-${thr}-${coat}`;
    }
    if (_P_FST_WSHR.has(ftype)) {
      if (!wmat || !dia) return "";
      return `RM-FST-${typeCode}-${wmat}-${dia}-${coat}`;
    }
    return "";
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. GASKETS
// ─────────────────────────────────────────────────────────────────────────────
const GASKET_TYPES = [
  "Spiral Wound – Inner + Outer Ring",
  "Corrugated Metal Gasket",
  "Flat Sheet Gasket",
  "Soft Cut Gasket",
  "O-Ring",
];
const GASKET_WINDING_MATERIAL    = [
  "SS316 / Graphite","SS304 / Graphite","SS316 / PTFE","SS304 / PTFE",
  "Inconel 625 / Graphite","CS / Graphite","SS316 / Ceramic",
];
const GASKET_RING_METAL_OPTS     = ["SS316","SS304","Carbon Steel","Inconel 625","Monel 400"];
const GASKET_CMG_SURFACE_OPTS    = ["Graphite","PTFE"];
const GASKET_SHEET_MATERIAL      = [
  "CAF-Free (Non-asbestos)","PTFE","Expanded Graphite",
  "EPDM","Neoprene","Silicone","NBR","Compressed Fibre",
];
const GASKET_ORING_MATERIAL      = ["NBR","EPDM","Viton (FKM)","PTFE","Silicone","Neoprene"];
const GASKET_THICKNESS_OPTS      = ["1.5","2","3","4.5","6"];
const GASKET_FACING_OPTS         = ["RF","FF"];
const GASKET_SCG_SHAPES          = ["Ring","Full Face Ring","Rectangular","Custom"];
const GASKET_HARDNESS_OPTS       = ["50A","60A","70A","80A","90A"];
const GASKET_STANDARD            = ["ASME B16.20","ASME B16.21","API 601"];

const GASKETS_ALL_OPTS: Record<string, string[]> = {
  gasket_type:          GASKET_TYPES,
  nominal_bore:         COMMON_NB,
  pressure_class:       PRESSURE_CLASS_OPTS,
  facing:               GASKET_FACING_OPTS,
  gasket_standard:      GASKET_STANDARD,
  winding_material:     GASKET_WINDING_MATERIAL,
  inner_ring_material:  GASKET_RING_METAL_OPTS,
  outer_ring_material:  GASKET_RING_METAL_OPTS,
  cmg_material:         GASKET_RING_METAL_OPTS,
  cmg_surface:          GASKET_CMG_SURFACE_OPTS,
  sheet_material:       GASKET_SHEET_MATERIAL,
  sheet_thickness:      GASKET_THICKNESS_OPTS,
  scg_shape:            GASKET_SCG_SHAPES,
  oring_material:       GASKET_ORING_MATERIAL,
  oring_hardness:       GASKET_HARDNESS_OPTS,
};

export function buildGasketsRequirement(attrs: Record<string, unknown>): string {
  const g = (k: string) => ((attrs[k] as string) ?? "").trim();
  const gtype = g("gasket_type");
  if (!gtype) return "";
  if (gtype === "Spiral Wound – Inner + Outer Ring") {
    const parts: string[] = [gtype];
    if (g("nominal_bore"))     parts.push(g("nominal_bore"));
    if (g("pressure_class"))   parts.push(g("pressure_class"));
    if (g("winding_material")) parts.push(g("winding_material"));
    if (g("facing"))           parts.push(g("facing"));
    return parts.join(", ");
  }
  if (gtype === "Corrugated Metal Gasket") {
    const parts: string[] = [gtype];
    if (g("cmg_material"))   parts.push(g("cmg_material"));
    if (g("nominal_bore"))   parts.push(g("nominal_bore"));
    if (g("pressure_class")) parts.push(g("pressure_class"));
    if (g("facing"))         parts.push(g("facing"));
    return parts.join(", ");
  }
  if (gtype === "Flat Sheet Gasket") {
    const parts: string[] = [gtype];
    if (g("sheet_material"))  parts.push(g("sheet_material"));
    if (g("sheet_thickness")) parts.push(`${g("sheet_thickness")}mm thk`);
    if (g("nominal_bore"))    parts.push(g("nominal_bore"));
    if (g("pressure_class"))  parts.push(g("pressure_class"));
    if (g("facing"))          parts.push(g("facing"));
    return parts.join(", ");
  }
  if (gtype === "Soft Cut Gasket") {
    const parts: string[] = [gtype];
    if (g("sheet_material"))  parts.push(g("sheet_material"));
    if (g("sheet_thickness")) parts.push(`${g("sheet_thickness")}mm thk`);
    if (g("scg_shape"))       parts.push(g("scg_shape"));
    const id = g("scg_id"), od = g("scg_od");
    const l = g("scg_length"), w = g("scg_width");
    if (id && od)  parts.push(`ID${id}×OD${od}mm`);
    else if (l && w) parts.push(`${l}×${w}mm`);
    return parts.join(", ");
  }
  if (gtype === "O-Ring") {
    const parts: string[] = [gtype];
    if (g("oring_material")) parts.push(g("oring_material"));
    const id = g("oring_id"), od = g("oring_od"), cs = g("oring_cs");
    if (id && od && cs) parts.push(`ID${id}×OD${od}×CS${cs}mm`);
    if (g("oring_hardness")) parts.push(`Shore ${g("oring_hardness")}`);
    return parts.join(", ");
  }
  return gtype;
}

// ── Client-side encoding maps (mirrors server/buy-catalog-sap-service.ts) ───
const _GSK_WINDING: Record<string, string> = {
  "SS316 / Graphite": "316G",  "SS304 / Graphite": "304G",
  "SS316 / PTFE": "316T",      "SS304 / PTFE": "304T",
  "Inconel 625 / Graphite": "IC625G", "CS / Graphite": "CSG",
  "SS316 / Ceramic": "316C",
};
const _GSK_RING_METAL: Record<string, string> = {
  "SS316": "316", "SS304": "304", "Carbon Steel": "CS",
  "Inconel 625": "IC625", "Monel 400": "MNL400",
};
const _GSK_CMG_SURF: Record<string, string> = { "Graphite": "GRPH", "PTFE": "PTFE" };
const _GSK_SHEET_MAT: Record<string, string> = {
  "CAF-Free (Non-asbestos)": "CNAF", "PTFE": "PTFE", "Expanded Graphite": "EXGRPH",
  "EPDM": "EPDM", "Neoprene": "NEOP", "Silicone": "SIL", "NBR": "NBR",
  "Compressed Fibre": "CFB",
};
const _GSK_ORING_MAT: Record<string, string> = {
  "NBR": "NBR", "EPDM": "EPDM", "Viton (FKM)": "VITON",
  "PTFE": "PTFE", "Silicone": "SIL", "Neoprene": "NEOP",
};
const _GSK_PC: Record<string, string> = {
  "150#": "150", "300#": "300", "600#": "600", "900#": "900",
  "1500#": "1500", "2500#": "2500",
  "PN 10": "PN10", "PN 16": "PN16", "PN 20": "PN20", "PN 25": "PN25",
};
const _GSK_SHAPE: Record<string, string> = {
  "Ring": "RNG", "Full Face Ring": "FF", "Rectangular": "RECT",
};
function _gskFmt(v: string): string { const n = parseFloat(v); return isNaN(n) ? v : n.toString(); }

export function buildGasketsPreviewCode(attrs: Record<string, unknown>): string {
  try {
    const g  = (k: string) => ((attrs[k] as string) ?? "").trim();
    const gtype = g("gasket_type");
    if (!gtype) return "";
    const nb     = g("nominal_bore");
    const pc     = _GSK_PC[g("pressure_class")] ?? "";
    const facing = g("facing");

    if (gtype === "Spiral Wound – Inner + Outer Ring") {
      const wind  = _GSK_WINDING[g("winding_material")];
      const inner = _GSK_RING_METAL[g("inner_ring_material")];
      const outer = _GSK_RING_METAL[g("outer_ring_material")];
      if (!wind || !inner || !outer || !nb || !pc || !facing) return "";
      return `RM-GSK-SWIO-${wind}-${inner}-${outer}-${nb}-${pc}-${facing}`;
    }
    if (gtype === "Corrugated Metal Gasket") {
      const core = _GSK_RING_METAL[g("cmg_material")];
      const surfRaw = g("cmg_surface");
      const surf = surfRaw ? (_GSK_CMG_SURF[surfRaw] ?? null) : null;
      if (!core || !nb || !pc || !facing) return "";
      if (surfRaw && !surf) return "";
      const segs = ["RM-GSK-CMG", core];
      if (surf) segs.push(surf);
      segs.push(nb, pc, facing);
      return segs.join("-");
    }
    if (gtype === "Flat Sheet Gasket") {
      const mat = _GSK_SHEET_MAT[g("sheet_material")];
      const thk = g("sheet_thickness").replace(/mm$/i, "");
      if (!mat || !thk || !nb || !pc || !facing) return "";
      return `RM-GSK-FSG-${mat}-${thk}MM-${nb}-${pc}-${facing}`;
    }
    if (gtype === "Soft Cut Gasket") {
      const mat = _GSK_SHEET_MAT[g("sheet_material")];
      const thk = g("sheet_thickness").replace(/mm$/i, "");
      const shape = g("scg_shape");
      const shapeCode = _GSK_SHAPE[shape];
      if (!mat || !thk || !shape || !shapeCode) return "";
      if (shapeCode === "RNG" || shapeCode === "FF") {
        const id = g("scg_id"), od = g("scg_od");
        if (!id || !od) return "";
        return `RM-GSK-SCG-${mat}-${thk}MM-${shapeCode}-${id}X${od}`;
      }
      if (shapeCode === "RECT") {
        const l = g("scg_length"), w = g("scg_width");
        if (!l || !w) return "";
        return `RM-GSK-SCG-${mat}-${thk}MM-RECT-${l}X${w}`;
      }
      return "";
    }
    if (gtype === "O-Ring") {
      const mat    = _GSK_ORING_MAT[g("oring_material")];
      const id     = g("oring_id"), od = g("oring_od"), cs = g("oring_cs");
      const hard   = g("oring_hardness").replace(/\s+/g, "");
      const isPTFE = g("oring_material") === "PTFE";
      if (!mat || !id || !od || !cs) return "";
      if (!isPTFE && !hard) return "";
      const dimSeg = `${_gskFmt(id)}X${_gskFmt(od)}X${_gskFmt(cs)}`;
      return hard ? `RM-GSK-ORING-${mat}-${dimSeg}-${hard}` : `RM-GSK-ORING-${mat}-${dimSeg}`;
    }
    return "";
  } catch { return ""; }
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
    if (val === "__other__") { setCustom(c => ({ ...c, [key]: true })); set(key, ""); }
    else {
      setCustom(c => ({ ...c, [key]: false }));
      // Clear all type-specific fields when the gasket family changes
      if (key === "gasket_type") {
        onChange({
          ...attrs,
          gasket_type: val,
          winding_material: "", inner_ring_material: "", outer_ring_material: "",
          cmg_material: "", cmg_surface: "",
          sheet_material: "", sheet_thickness: "",
          scg_shape: "", scg_id: "", scg_od: "", scg_length: "", scg_width: "",
          oring_material: "", oring_id: "", oring_od: "", oring_cs: "", oring_hardness: "",
          nominal_bore: "", pressure_class: "", facing: "",
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
  const isSW   = gtype === "Spiral Wound – Inner + Outer Ring";
  const isCMG  = gtype === "Corrugated Metal Gasket";
  const isFSG  = gtype === "Flat Sheet Gasket";
  const isSCG  = gtype === "Soft Cut Gasket";
  const isOR   = gtype === "O-Ring";

  const scgShape  = (attrs.scg_shape as string) ?? "";
  const scgIsRing = scgShape === "Ring" || scgShape === "Full Face Ring";
  const scgIsRect = scgShape === "Rectangular";

  // O-Ring: live dimension check OD ≈ ID + 2×CS
  const oMatRaw = (attrs.oring_material as string) ?? "";
  const isPTFE  = oMatRaw === "PTFE";
  const oId = parseFloat((attrs.oring_id as string) ?? "");
  const oOd = parseFloat((attrs.oring_od as string) ?? "");
  const oCs = parseFloat((attrs.oring_cs as string) ?? "");
  let oringWarn = "";
  if (!isNaN(oId) && !isNaN(oOd) && !isNaN(oCs)) {
    const expected = oId + 2 * oCs;
    const tol = Math.max(1.0, expected * 0.03);
    if (Math.abs(oOd - expected) > tol) {
      oringWarn = `OD should equal ID + 2×CS = ${oId} + 2×${oCs} = ${expected.toFixed(2)} mm  (tolerance ±${tol.toFixed(2)} mm)`;
    }
  }

  return (
    <div className="space-y-3">
      {/* Type selector — always visible */}
      <SectionCard title="Gasket Type" color="bg-sky-50/60 border-sky-200">
        {rf("gasket_type",    "Gasket Type",               GASKET_TYPES,    true)}
        {rf("gasket_standard","Standard (engineering ref.)", GASKET_STANDARD)}
      </SectionCard>

      {/* ── Spiral Wound – Inner + Outer Ring ── */}
      {isSW && (
        <>
          <SectionCard title="Winding & Ring Materials" color="bg-violet-50/60 border-violet-200">
            {rf("winding_material",    "Winding / Filler Material",              GASKET_WINDING_MATERIAL,  true)}
            {rf("inner_ring_material", "Inner Ring (Compression-Stop) Material", GASKET_RING_METAL_OPTS,   true)}
            {rf("outer_ring_material", "Outer Ring (Centering) Material",        GASKET_RING_METAL_OPTS,   true)}
          </SectionCard>
          <SectionCard title="Flange Specification" color="bg-amber-50/60 border-amber-200">
            {rf("nominal_bore",   "Nominal Bore (NB)", COMMON_NB,           true)}
            {rf("pressure_class", "Pressure Class",   PRESSURE_CLASS_OPTS, true)}
            {rf("facing",         "Flange Facing",    GASKET_FACING_OPTS,  true)}
          </SectionCard>
        </>
      )}

      {/* ── Corrugated Metal Gasket ── */}
      {isCMG && (
        <>
          <SectionCard title="Material" color="bg-violet-50/60 border-violet-200">
            {rf("cmg_material", "Core Material", GASKET_RING_METAL_OPTS, true)}
            <div className="space-y-1.5">
              <Label className="text-xs">
                Surface Layer <span className="text-slate-400 font-normal">(optional — leave blank for bare CMG)</span>
              </Label>
              <SearchableSelect
                value={GASKET_CMG_SURFACE_OPTS.includes((attrs.cmg_surface as string) ?? "") ? (attrs.cmg_surface as string) : ""}
                options={GASKET_CMG_SURFACE_OPTS}
                placeholder="None (bare metal)"
                onSelect={v => set("cmg_surface", v)}
              />
            </div>
          </SectionCard>
          <SectionCard title="Flange Specification" color="bg-amber-50/60 border-amber-200">
            {rf("nominal_bore",   "Nominal Bore (NB)", COMMON_NB,           true)}
            {rf("pressure_class", "Pressure Class",   PRESSURE_CLASS_OPTS, true)}
            {rf("facing",         "Flange Facing",    GASKET_FACING_OPTS,  true)}
          </SectionCard>
        </>
      )}

      {/* ── Flat Sheet Gasket ── */}
      {isFSG && (
        <>
          <SectionCard title="Sheet Specification" color="bg-violet-50/60 border-violet-200">
            {rf("sheet_material",  "Sheet Material",  GASKET_SHEET_MATERIAL, true)}
            {rf("sheet_thickness", "Thickness (mm)",  GASKET_THICKNESS_OPTS, true)}
          </SectionCard>
          <SectionCard title="Flange Specification" color="bg-amber-50/60 border-amber-200">
            {rf("nominal_bore",   "Nominal Bore (NB)", COMMON_NB,           true)}
            {rf("pressure_class", "Pressure Class",   PRESSURE_CLASS_OPTS, true)}
            {rf("facing",         "Flange Facing",    GASKET_FACING_OPTS,  true)}
          </SectionCard>
        </>
      )}

      {/* ── Soft Cut Gasket ── */}
      {isSCG && (
        <SectionCard title="Material & Dimensions" color="bg-violet-50/60 border-violet-200">
          {rf("sheet_material",  "Sheet Material",  GASKET_SHEET_MATERIAL, true)}
          {rf("sheet_thickness", "Thickness (mm)",  GASKET_THICKNESS_OPTS, true)}
          {rf("scg_shape",       "Shape",           GASKET_SCG_SHAPES,     true)}
          {scgIsRing && rt("scg_id", "Inner Diameter — ID (mm)", true, "e.g. 50")}
          {scgIsRing && rt("scg_od", "Outer Diameter — OD (mm)", true, "e.g. 100")}
          {scgIsRect && rt("scg_length", "Length (mm)", true, "e.g. 300")}
          {scgIsRect && rt("scg_width",  "Width (mm)",  true, "e.g. 200")}
          {scgShape === "Custom" && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Custom shape — SAP code must be entered manually after saving.
            </div>
          )}
        </SectionCard>
      )}

      {/* ── O-Ring ── */}
      {isOR && (
        <>
          <SectionCard title="Ring Material" color="bg-violet-50/60 border-violet-200">
            {rf("oring_material", "Ring Material", GASKET_ORING_MATERIAL, true)}
          </SectionCard>
          <SectionCard title="Dimensions (measured with caliper)" color="bg-amber-50/60 border-amber-200">
            {rt("oring_id", "Inside Diameter — ID (mm)",  true, "e.g. 50")}
            {rt("oring_od", "Outside Diameter — OD (mm)", true, "e.g. 60.66")}
            {rt("oring_cs", "Cross-Section — CS (mm)",    true, "e.g. 5.33")}
            {oringWarn && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                ⚠ {oringWarn}
              </div>
            )}
          </SectionCard>
          <SectionCard title="Hardness" color="bg-slate-50/80 border-slate-200">
            {rf(
              "oring_hardness",
              isPTFE ? "Hardness (optional for PTFE)" : "Hardness (Shore A)",
              GASKET_HARDNESS_OPTS,
              !isPTFE,
            )}
          </SectionCard>
        </>
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
