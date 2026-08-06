import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowLeft, Lock, GitBranch, ChevronRight, CheckCircle2, XCircle,
  AlertCircle, FileText, BookOpen, Droplets, Activity, Calculator,
  GitFork, Settings, BarChart2, Wrench, Zap, DollarSign, ShieldCheck,
  FileDown, History, Play, Save, AlertTriangle, Info, Check, ChevronsUpDown
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PRODUCT_REQUIREMENT_MASTER, PRODUCT_PARAMETER_MASTER, shouldSeedRequirementRows } from "@shared/product-requirement-master";
import {
  RRBO_FEED_DENSITY_MASTER, RRBO_FEED_DENSITY_REF_TEMP, NMP_MASTER,
  RRBO_FEED_VISCOSITY_MASTER, RRBO_FEED_VISCOSITY_REF_TEMP,
  EMULSION_BEHAVIOUR_DEFAULT, EMULSION_BEHAVIOUR_LEGACY_DEFAULT, PENDING_VALIDATION, FLUID_PROPERTY_PROVENANCE,
  TWO_PHASE_SCREENING_DEFAULTS, TWO_PHASE_SCREENING_SOURCE, TWO_PHASE_SCREENING_REF_TEMP,
} from "@shared/fluid-properties-master";

// Module-level numeric parse helper (blank/invalid → null).
const numOrNull = (v: string | undefined | null): number | null => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
};

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_COLOURS: Record<string, string> = {
  draft:                    "bg-slate-100 text-slate-700 border-slate-200",
  under_review:             "bg-yellow-100 text-yellow-800 border-yellow-200",
  checked:                  "bg-blue-100 text-blue-800 border-blue-200",
  approved:                 "bg-green-100 text-green-800 border-green-200",
  issued_for_enquiry:       "bg-purple-100 text-purple-800 border-purple-200",
  issued_for_construction:  "bg-indigo-100 text-indigo-800 border-indigo-200",
  superseded:               "bg-orange-100 text-orange-800 border-orange-200",
  archived:                 "bg-gray-100 text-gray-500 border-gray-200",
};
const STATUS_LABELS: Record<string, string> = {
  draft:                    "Draft",
  under_review:             "Under Review",
  checked:                  "Checked",
  approved:                 "Approved",
  issued_for_enquiry:       "Issued for Enquiry",
  issued_for_construction:  "Issued for Construction",
  superseded:               "Superseded",
  archived:                 "Archived",
};

const LIFECYCLE_ACTIONS: Record<string, Array<{ action: string; label: string; variant?: "default" | "outline" | "destructive" }>> = {
  draft:                    [{ action: "submit_for_review", label: "Submit for Review" }],
  under_review:             [{ action: "return_to_draft", label: "Return to Draft", variant: "outline" }, { action: "check", label: "Check" }],
  checked:                  [{ action: "approve", label: "Approve" }],
  approved:                 [{ action: "issue", label: "Issue for Enquiry" }],
  issued_for_enquiry:       [{ action: "issue_for_construction", label: "Issue for Construction" }, { action: "supersede", label: "Supersede", variant: "outline" }],
  issued_for_construction:  [{ action: "supersede", label: "Supersede", variant: "outline" }],
};

// ── Workflow steps ────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1,  key: "design_identity",       label: "Design Identity",          icon: FileText },
  { id: 2,  key: "design_basis",          label: "Design Basis",             icon: BookOpen },
  { id: 3,  key: "fluid_properties",      label: "Fluid Properties",         icon: Droplets },
  { id: 4,  key: "process_design",        label: "Process Design",           icon: Activity },
  { id: 5,  key: "hydraulic_design",      label: "Common Hydraulic Design",  icon: Calculator },
  { id: 6,  key: "technology_selection",  label: "Technology Selection",     icon: GitFork },
  { id: 7,  key: "equipment_design",      label: "Equipment Design",         icon: Settings },
  { id: 8,  key: "technology_comparison", label: "Technology Comparison",    icon: BarChart2 },
  { id: 9,  key: "mechanical_design",     label: "Mechanical Design",        icon: Wrench },
  { id: 10, key: "utilities",             label: "Utilities",                icon: Zap },
  { id: 11, key: "cost_estimation",       label: "Cost Estimation",          icon: DollarSign },
  { id: 12, key: "design_validation",     label: "Design Validation",        icon: ShieldCheck },
  { id: 13, key: "reports",              label: "Reports",                  icon: FileDown },
  { id: 14, key: "revision_control",      label: "Review & Revision Control",icon: History },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

// ── Small helper components ───────────────────────────────────────────────────
function SectionCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`border rounded-xl bg-white mb-4 ${className}`}>
      <div className="px-5 py-3 border-b bg-gray-50 rounded-t-xl">
        <p className="text-sm font-semibold text-gray-700">{title}</p>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </div>
  );
}

function FieldRow({
  label, value, onChange, onBlur, type = "text", unit, placeholder, readOnly = false, note,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  type?: string; unit?: string; placeholder?: string; readOnly?: boolean; note?: string;
}) {
  return (
    <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
      <label className="text-sm text-gray-600 pt-2 font-medium leading-tight">{label}</label>
      <div>
        <Input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder ?? label}
          readOnly={readOnly}
          className={`h-8 text-sm ${readOnly ? "bg-gray-50 text-gray-500" : ""}`}
        />
        {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
      </div>
      <div className="pt-2 min-w-[60px]">
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
    </div>
  );
}

function TextAreaRow({
  label, value, onChange, onBlur, placeholder, rows = 2,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-start gap-3">
      <label className="text-sm text-gray-600 pt-2 font-medium leading-tight">{label}</label>
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder ?? label}
        rows={rows}
        className="text-sm"
      />
    </div>
  );
}

function SelectRow({
  label, value, onChange, onBlur, onCommit, options, allowOther = false, unit, note,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  onCommit?: (v: string) => void; options: string[]; allowOther?: boolean; unit?: string; note?: string;
}) {
  const inList = options.includes(value);
  const [otherMode, setOtherMode] = useState(!!value && !inList);
  const selectValue = otherMode ? "__other__" : (inList ? value : "");
  return (
    <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
      <label className="text-sm text-gray-600 pt-2 font-medium leading-tight">{label}</label>
      <div className="space-y-1">
        <Select
          value={selectValue}
          onValueChange={v => {
            if (v === "__other__") { setOtherMode(true); }
            else if (onCommit) { setOtherMode(false); onCommit(v); }
            else { setOtherMode(false); onChange(v); onBlur?.(); }
          }}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={`Select ${label}`} /></SelectTrigger>
          <SelectContent>
            {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            {allowOther && <SelectItem value="__other__">Other…</SelectItem>}
          </SelectContent>
        </Select>
        {otherMode && (
          <Input
            value={inList ? "" : value}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={`Enter custom ${label.toLowerCase()}`}
            className="h-8 text-sm"
          />
        )}
        {note && <p className="text-xs text-gray-400">{note}</p>}
      </div>
      <div className="pt-2 min-w-[60px]">{unit && <span className="text-xs text-gray-400">{unit}</span>}</div>
    </div>
  );
}

/** Governed suggestion: shows basis + suggested value; engineer must Apply (never auto-copied).
 *  If the confirmed value differs from the suggestion, an override reason is required. */
/** Searchable dropdown (combobox) row — options list is master-data driven. */
function SearchSelectRow({
  label, value, options, onSelect, unit, note, placeholder,
}: {
  label: string; value: string; options: string[]; onSelect: (v: string) => void;
  unit?: string; note?: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
      <label className="text-sm text-gray-600 pt-2 font-medium leading-tight">{label}</label>
      <div className="space-y-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="h-8 w-full justify-between text-sm font-normal">
              {value || placeholder || "Select…"}
              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[320px]" align="start">
            <Command>
              <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
              <CommandList>
                <CommandEmpty>No match found — additional options via master data.</CommandEmpty>
                <CommandGroup>
                  {options.map(o => (
                    <CommandItem key={o} value={o} onSelect={() => { onSelect(o); setOpen(false); }}>
                      <Check className={`mr-2 h-3 w-3 ${value === o ? "opacity-100" : "opacity-0"}`} />
                      {o}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {note && <p className="text-xs text-gray-400">{note}</p>}
      </div>
      <div className="pt-2 min-w-[60px]">{unit && <span className="text-xs text-gray-400">{unit}</span>}</div>
    </div>
  );
}

// Thermal oil master list — initial options only; future expansion via master data
// (a governed thermal-fluid master table), not by hard-coding here.
const THERMAL_OIL_OPTIONS = ["Therminol 65", "Therminol 66"];
const SITE_TEMP_OPTIONS = ["10", "15", "20", "25", "30", "40", "45"];
const SITE_ELEVATION_OPTIONS = ["0", "50", "150", "250", "500", "1000", "2000"];
const AMBIENT_DEFAULT = "25";
const ELEVATION_DEFAULT = "0";
const ISA_FORMULA = "P = 101.325 × (1 − 2.25577×10⁻⁵ × h)^5.25588 kPa";

// Thermopac standard design conditions — LLX vertical extraction column (~14 m).
// Internal pressure and external vacuum are SEPARATE design cases; Full Vacuum is
// a designation, never represented as 0 bar(g).
const LLX_COL_INTERNAL_DP = "2.5"; // bar(g)
// Thermopac Design Basis Master — default operating conditions for
// Liquid–Liquid NMP Solvent Extraction. Blank-only seed, fully editable.
const OPERATING_PRESSURE_DEFAULT = "1.0"; // bar(g)
const OPERATING_PRESSURE_SOURCE = "Thermopac Design Basis Master";
const LLX_COL_EXTERNAL_CONDITION = "Full Vacuum";
const LLX_COL_ORIENTATION = "Vertical";
const LLX_COL_HEIGHT_M = "14";
const LLX_COL_STANDARD_SOURCE = "Thermopac standard design condition — LLX vertical extraction column (~14 m)";
// Design Temperature — Thermopac rule under ASME Section VIII Division 1:
//   OT 50–80 °C → DT = 100 °C;  OT > 80 °C → DT = OT + 20 °C.
// Below 50 °C the rule does not apply — explicitly Not Calculable, never zero.
const DT_DESIGN_CODE = "ASME Section VIII Division 1";
const DT_RULE_SOURCE = `Thermopac Design Temperature Rule (${DT_DESIGN_CODE})`;
const dtRuleValue = (ot: number | null): number | null => {
  if (ot === null) return null;
  if (ot >= 50 && ot <= 80) return 100;
  if (ot > 80) return ot + 20;
  return null;
};
const THERMAL_RULE_ENGINE_VERSION = "Design Basis UI Rules v1.0";
// Thermal Fluid Master Data — approved Thermopac values (seeded 2026-08-05).
const THERMAL_FLUID_MASTER: Record<string, { maxBulk: string; maxFilm: string }> = {
  "Therminol 66": { maxBulk: "345", maxFilm: "375" },
  "Therminol 65": { maxBulk: "300", maxFilm: "360" },
};
// Thermopac design defaults — recommended heater temperatures (editable).
const HEATER_INLET_DEFAULT = "200";
const HEATER_OUTLET_DEFAULT = "230";
// Cooling Water — Thermopac defaults: CW Inlet tracks Ambient; ΔT default 8 °C.
const CW_INLET_OPTIONS = ["10", "15", "20", "25", "30", "40", "45"];
const CW_DELTA_T_OPTIONS = ["4", "6", "8"];
const CW_DELTA_T_DEFAULT = "8";

// Process Design (Stage 4) approved defaults
const SO_RATIO_OPTIONS = ["0.5", "1.0", "1.5", "2.0"];
const SO_RATIO_DEFAULT = "1.5";
const THEORETICAL_STAGES_DEFAULT = "6";
const STAGE_EFFICIENCY_DEFAULT = "60";
const DESIGN_MARGIN_DEFAULT = "20";
const PHASE_CONFIG_OPTIONS = [
  { value: "rrbo_continuous_nmp_dispersed", label: "RRBO continuous / NMP dispersed" },
  { value: "nmp_continuous_rrbo_dispersed", label: "NMP continuous / RRBO dispersed" },
];
const THERMAL_DEFAULT_SOURCE = "Thermopac design default — thermal-fluid master data";
// Interface Control — stored with Process Design data for future
// Instrumentation, Control and P&ID modules.
const INTERFACE_CONTROL_OPTIONS = [
  { value: "interphase_level_control", label: "Interphase Level Control (Default)" },
];
const INTERFACE_CONTROL_DEFAULT = "interphase_level_control";
// C2 component-balance assumptions — Thermopac Preliminary Screening Defaults.
// Percent on the page; the server mapper converts to fractions for the engine.
// These are component-balance assumptions, NOT the Raffinate/Extract Yield
// design targets — the two must never substitute for each other.
const COMPONENT_BALANCE_FIELDS = [
  { key: "solute_mass_fraction_feed", label: "Extractable Solute Mass Fraction in RRBO Feed", def: "20", engineKey: "soluteMassFractionInFeed" },
  { key: "solute_recovery_extract",   label: "Solute Recovery to Extract",                   def: "90", engineKey: "soluteRecoveryToExtract" },
  { key: "solvent_carryover_raffinate", label: "NMP Carryover to Raffinate",                 def: "2",  engineKey: "solventCarryoverFraction" },
  { key: "oil_loss_extract",          label: "Oil-Carrier Loss to Extract",                  def: "1",  engineKey: "oilLossToExtractFraction" },
];

const LIMIT_TYPES = ["Max", "Min", "Target", "Range"];
// Sentinel for the "Custom…" entry in the Product Requirement parameter dropdown.
const CUSTOM_PARAM = "Custom…";

const FEED_SERVICE_OPTIONS = [
  "Re-Refined Base Oil SN150",
  "Re-Refined Base Oil SN200",
  "Re-Refined Base Oil SN300",
  "Re-Refined Base Oil SN500",
];

const CAPACITY_OPTIONS = Array.from({ length: 15 }, (_, i) => String((i + 1) * 1000));

// Thermopac Design Basis Default feed densities @ 15 °C (kg/m³) — preliminary
// engineering defaults only; fully editable by the engineer.
const FEED_SERVICE_DENSITY: Record<string, string> = {
  "Re-Refined Base Oil SN150": "860",
  "Re-Refined Base Oil SN200": "870",
  "Re-Refined Base Oil SN300": "880",
  "Re-Refined Base Oil SN500": "890",
};
const FEED_DENSITY_DEFAULT_SOURCE = "Thermopac Design Basis Default";
interface QualityRow { parameter: string; target: string; unit: string; limitType: string; notes: string }

function QualityRowsEditor({
  title, jsonValue, legacyValue, onChange, onBlur, onCommit,
}: {
  title: string; jsonValue: string; legacyValue?: string;
  onChange: (json: string) => void; onBlur: () => void; onCommit: (json: string) => void;
}) {
  // UI-only custom-parameter mode per row index — the "Custom…" sentinel is
  // never written into the saved data.
  const [customIdx, setCustomIdx] = useState<Record<number, boolean>>({});
  // Advanced engineering function — adding/removing/renaming parameters is
  // hidden during normal operation; the standard master-data rows present a
  // clean specification with target/unit/limit fully editable.
  const [advanced, setAdvanced] = useState(false);
  let rows: QualityRow[] = [];
  try { const p = JSON.parse(jsonValue || "[]"); if (Array.isArray(p)) rows = p; } catch { /* treat as empty */ }
  const setRows = (r: QualityRow[]) => onChange(JSON.stringify(r));
  const commitRows = (r: QualityRow[]) => onCommit(JSON.stringify(r));
  const update = (i: number, k: keyof QualityRow, v: string) => setRows(rows.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const isBlankRow = (r: QualityRow) => (r.parameter ?? "").trim() === "" && (r.target ?? "").trim() === "" && (r.unit ?? "").trim() === "" && (r.notes ?? "").trim() === "";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">{title}</p>
        <div className="flex items-center gap-2">
          {advanced && (
            <button
              type="button"
              onClick={() => { commitRows([...rows, { parameter: "", target: "", unit: "", limitType: "Max", notes: "" }]); }}
              className="text-xs px-2 py-1 border rounded text-blue-700 border-blue-300 hover:bg-blue-50"
            >
              + Add parameter
            </button>
          )}
          <button
            type="button"
            onClick={() => { setCustomIdx({}); setAdvanced(a => !a); }}
            className={`text-xs px-2 py-1 border rounded ${advanced ? "text-gray-700 border-gray-300 hover:bg-gray-50" : "text-gray-500 border-gray-200 hover:bg-gray-50"}`}
            title="Adding or removing parameters is an advanced engineering function"
          >
            {advanced ? "Done customizing" : "Customize Product Requirements"}
          </button>
        </div>
      </div>
      {legacyValue && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Legacy free-text entry: “{legacyValue}” — re-enter as structured parameters below (legacy value is preserved).
        </p>
      )}
      {rows.length > 0 && (
        <div className="grid grid-cols-[1.4fr_0.8fr_0.6fr_0.7fr_1.2fr_auto] gap-2 text-xs text-gray-400 px-1">
          <span>Parameter</span><span>Target Value</span><span>Unit</span><span>Limit Type</span><span>Notes</span><span />
        </div>
      )}
      {rows.map((r, i) => {
        // Normal operation shows only the populated specification — blank
        // placeholder rows are an advanced-mode concern.
        if (!advanced && isBlankRow(r)) return null;
        return (
        <div key={i} className="grid grid-cols-[1.4fr_0.8fr_0.6fr_0.7fr_1.2fr_auto] gap-2 items-center">
          {!advanced ? (
            <span className="text-xs text-gray-800 font-medium px-1">{r.parameter || "—"}</span>
          ) : (customIdx[i] || (r.parameter !== "" && !(r.parameter in PRODUCT_PARAMETER_MASTER))) ? (
            <Input
              autoFocus={customIdx[i] && r.parameter === ""}
              value={r.parameter}
              onChange={e => update(i, "parameter", e.target.value)}
              onBlur={onBlur}
              placeholder="Type parameter name"
              className="h-7 text-xs"
            />
          ) : (
            <Select
              value={r.parameter in PRODUCT_PARAMETER_MASTER ? r.parameter : ""}
              onValueChange={v => {
                if (v === CUSTOM_PARAM) {
                  setCustomIdx(c => ({ ...c, [i]: true }));
                  return;
                }
                const m = PRODUCT_PARAMETER_MASTER[v];
                commitRows(rows.map((row, idx) => (idx === i ? {
                  ...row,
                  parameter: v,
                  unit: m?.unit ?? row.unit,
                  limitType: (m?.limitType ?? row.limitType) as QualityRow["limitType"],
                  target: row.target === "" ? (m?.defaultTarget ?? "") : row.target,
                  notes: row.notes === "" ? (m?.notes ?? "") : row.notes,
                } : row)));
              }}
            >
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select parameter" /></SelectTrigger>
              <SelectContent>
                {Object.keys(PRODUCT_PARAMETER_MASTER).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                <SelectItem value={CUSTOM_PARAM}>{CUSTOM_PARAM}</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Input value={r.target} onChange={e => update(i, "target", e.target.value)} onBlur={onBlur} placeholder="Value" className="h-7 text-xs" />
          <Input value={r.unit} onChange={e => update(i, "unit", e.target.value)} onBlur={onBlur} placeholder="Unit" className="h-7 text-xs" />
          <Select value={r.limitType} onValueChange={v => { commitRows(rows.map((row, idx) => (idx === i ? { ...row, limitType: v } : row))); }}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{LIMIT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={r.notes} onChange={e => update(i, "notes", e.target.value)} onBlur={onBlur} placeholder="Notes" className="h-7 text-xs" />
          {advanced ? (
            <button
              type="button"
              onClick={() => { setCustomIdx({}); commitRows(rows.filter((_, idx) => idx !== i)); }}
              className="text-xs text-red-500 hover:text-red-700 px-1"
              title="Remove row"
            >
              ✕
            </button>
          ) : (
            <span />
          )}
        </div>
        );
      })}
    </div>
  );
}

const SOURCE_OPTIONS = ["Measured", "Vendor", "Literature", "Assumed"] as const;
type Source = (typeof SOURCE_OPTIONS)[number];

function PropertyRow({
  label, propKey, data, onChange, onBlur,
}: {
  label: string;
  propKey: string;
  data: Record<string, string>;
  onChange: (key: string, val: string) => void;
  onBlur: () => void;
}) {
  const src = (data[`${propKey}_source`] ?? "Measured") as Source;
  const isAssumed = src === "Assumed";
  return (
    <div className={`grid grid-cols-[180px_110px_90px_110px_120px] items-center gap-2 py-1.5 px-2 rounded-lg ${isAssumed ? "bg-amber-50 border border-amber-200" : ""}`}>
      <span className="text-sm text-gray-700 font-medium">
        {label}
        {isAssumed && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
      </span>
      <Input
        value={data[`${propKey}_value`] ?? ""}
        onChange={e => onChange(`${propKey}_value`, e.target.value)}
        onBlur={onBlur}
        placeholder="Value"
        className="h-7 text-xs"
      />
      <Input
        value={data[`${propKey}_unit`] ?? ""}
        onChange={e => onChange(`${propKey}_unit`, e.target.value)}
        onBlur={onBlur}
        placeholder="Unit"
        className="h-7 text-xs"
      />
      <Input
        value={data[`${propKey}_ref_temp`] ?? ""}
        onChange={e => onChange(`${propKey}_ref_temp`, e.target.value)}
        onBlur={onBlur}
        placeholder="Ref. temp."
        className="h-7 text-xs"
      />
      <Select value={src} onValueChange={v => { onChange(`${propKey}_source`, v); onBlur(); }}>
        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SOURCE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function CalcResultCard({ label, formula, result, unit, reference, engineVersion }: {
  label: string; formula?: string; result?: string | number; unit?: string; reference?: string; engineVersion?: string;
}) {
  return (
    <div className="border rounded-lg p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {result !== undefined && (
          <span className="font-mono text-blue-700 text-sm font-bold">
            {typeof result === "number" ? result.toFixed(4) : result}{unit ? ` ${unit}` : ""}
          </span>
        )}
      </div>
      {formula && <p className="text-xs text-gray-500 font-mono mb-1">{formula}</p>}
      {reference && <p className="text-xs text-gray-400">Ref: {reference}</p>}
      {engineVersion && <p className="text-xs text-gray-300">Engine v{engineVersion}</p>}
      {result === undefined && (
        <p className="text-xs text-gray-400 italic">Run calculation to see result</p>
      )}
    </div>
  );
}

function ValidationCheck({ label, status, note }: { label: string; status: "pass" | "fail" | "warning" | "pending"; note?: string }) {
  const icon = status === "pass"    ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
             : status === "fail"    ? <XCircle       className="h-4 w-4 text-red-500 shrink-0" />
             : status === "warning" ? <AlertCircle   className="h-4 w-4 text-amber-500 shrink-0" />
             :                       <Info           className="h-4 w-4 text-gray-300 shrink-0" />;
  return (
    <div className={`flex items-start gap-3 py-2 px-3 rounded-lg border ${
      status === "pass"    ? "bg-green-50 border-green-200"
    : status === "fail"    ? "bg-red-50 border-red-200"
    : status === "warning" ? "bg-amber-50 border-amber-200"
    :                        "bg-gray-50 border-gray-200"}`}>
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {note && <p className="text-xs text-gray-500 mt-0.5">{note}</p>}
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Approval {
  id: number; action: string; performed_by_name: string | null;
  performed_at: string; comments: string | null;
}
interface CalcRun {
  id: number; calculation_type: string; engine_name: string; engine_version: string;
  calculation_status: string; calculated_at: string; calculated_by_name: string | null;
  warnings?: { code?: string; message: string }[];
  validation_issues?: { field?: string; message: string; severity?: string }[];
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DesignSoftwareWorkspacePage() {
  const { designId: designIdParam } = useParams<{ designId: string }>();
  const designId = parseInt(designIdParam ?? "0");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [activeStep, setActiveStep] = useState<StepKey>("design_identity");
  const [selectedRevisionId, setSelectedRevisionId] = useState<number | null>(null);

  // Local form data per section (populated from API, dirty-tracked for save)
  const [localData, setLocalData] = useState<Record<string, Record<string, string>>>({});
  const [savingSection, setSavingSection] = useState<string | null>(null);

  // New revision dialog
  const [showNewRevision, setShowNewRevision] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");

  // Lifecycle dialog
  const [showLifecycle, setShowLifecycle] = useState<string | null>(null);
  const [lifecycleComment, setLifecycleComment] = useState("");

  // ── Queries ─────────────────────────────────────────────────────────────────
  const designQ = useQuery({
    queryKey: [`/api/design-software/designs/${designId}`],
    queryFn: () => apiRequest("GET", `/api/design-software/designs/${designId}`) as Promise<any>,
    enabled: !isNaN(designId),
  });
  const revisionsQ = useQuery({
    queryKey: [`/api/design-software/designs/${designId}/revisions`],
    queryFn: () => apiRequest("GET", `/api/design-software/designs/${designId}/revisions`) as Promise<any>,
    enabled: !isNaN(designId),
  });
  const design = designQ.data;
  const revisions: any[] = revisionsQ.data ?? [];
  const activeRevisionId = selectedRevisionId ?? design?.rev_id ?? null;
  const activeRevision = revisions.find(r => r.id === activeRevisionId) ?? null;
  const isFrozen = activeRevision?.is_frozen ?? false;

  const inputsQ = useQuery({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/inputs`],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/inputs`) as Promise<any>,
    enabled: !!activeRevisionId,
    // Local edits are the source of truth between blur-saves; a focus refetch
    // returning pre-save data must never roll back the working copy (which a
    // subsequent whole-section save would then persist, silently losing values
    // such as Operating Temperature / Pressure / Design Capacity).
    refetchOnWindowFocus: false,
  });
  const runsQ = useQuery<CalcRun[]>({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/runs`],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/runs`) as Promise<CalcRun[]>,
    enabled: !!activeRevisionId,
  });
  const packingsQ = useQuery<any[]>({
    queryKey: ["/api/design-software/packings"],
    queryFn: () => apiRequest("GET", "/api/design-software/packings") as Promise<any[]>,
  });
  const backMixingRisk = (localData["ecp_design"]?.backmixing_risk as string) ?? "moderate";
  const sulzerQ = useQuery<any>({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/sulzer-screening`, backMixingRisk],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/sulzer-screening?risk=${backMixingRisk}`) as Promise<any>,
    enabled: !!activeRevisionId,
    retry: false,
  });
  const resultsQ = useQuery<any[]>({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/results`],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/results`) as Promise<any[]>,
    enabled: !!activeRevisionId,
  });
  const reportsQ = useQuery<any[]>({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/reports`],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/reports`) as Promise<any[]>,
    enabled: !!activeRevisionId,
  });

  const approvalsQ = useQuery<Approval[]>({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/approvals`],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/approvals`) as Promise<Approval[]>,
    enabled: !!activeRevisionId,
  });

  // Populate local data from API. Full replace ONLY on first load of a
  // revision; afterwards server data merges UNDER local values (local wins),
  // because localData carries edits newer than any in-flight/stale response —
  // replacing it would roll back values that the next whole-section save then
  // silently erases from the server (root cause of lost Design Basis fields).
  const hydratedRevisionRef = useRef<number | null>(null);
  // Hydration barrier for ALL auto-seeding effects: seeders must not run until
  // localData actually contains the first server snapshot for this revision.
  // State (not the ref) is used so that, in the render pass where hydration is
  // still pending, seeders observe the old value and skip — otherwise a seeder
  // could commit a whole-section object built from pre-hydration empty state,
  // overwriting an already-populated section on the server.
  const [hydratedRevision, setHydratedRevision] = useState<number | null>(null);
  useEffect(() => {
    if (!inputsQ.data || !activeRevisionId) return;
    const server: Record<string, Record<string, string>> = {};
    for (const inp of inputsQ.data as any[]) {
      server[inp.section] = inp.data ?? {};
    }
    if (hydratedRevisionRef.current !== activeRevisionId) {
      hydratedRevisionRef.current = activeRevisionId;
      setLocalData(server);
      setHydratedRevision(activeRevisionId);
      return;
    }
    setLocalData(prev => {
      const next: Record<string, Record<string, string>> = { ...prev };
      for (const [section, data] of Object.entries(server)) {
        next[section] = { ...data, ...(prev[section] ?? {}) };
      }
      return next;
    });
  }, [inputsQ.data, activeRevisionId]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const upsertMutation = useMutation({
    mutationFn: ({ section, data }: { section: string; data: Record<string, string> }) =>
      apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/inputs`, { section, data }) as Promise<any>,
    onSettled: () => setSavingSection(null),
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const saveSection = useCallback((section: string) => {
    if (isFrozen || !activeRevisionId) return;
    setSavingSection(section);
    upsertMutation.mutate({ section, data: localData[section] ?? {} });
  }, [isFrozen, activeRevisionId, localData, upsertMutation]);

  // Field change helper — updates local state
  const field = (section: string) => (key: string, val: string) => {
    setLocalData(prev => ({ ...prev, [section]: { ...(prev[section] ?? {}), [key]: val } }));
  };

  // Save on blur helper
  const save = (section: string) => () => saveSection(section);

  // Stage 9 — automatic nozzle generation (server-side Thermopac nozzle master data)
  const [nozGenBusy, setNozGenBusy] = useState(false);
  // Stage 13 — report generation busy flag
  const [reportGenBusy, setReportGenBusy] = useState(false);
  /** Generate + size the nozzle schedule and persist it (awaited direct POST so a
   *  follow-on calculation run sees the saved rows). Returns true on success. */
  const autoGenerateNozzles = useCallback(async (): Promise<boolean> => {
    if (isFrozen || !activeRevisionId) return false;
    setNozGenBusy(true);
    try {
      const res: any = await apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/nozzles/generate`);
      const next = {
        ...(localData["mechanical_design"] ?? {}),
        nozzle_rows: JSON.stringify(res.rows),
        nozzle_generation_issues: JSON.stringify(res.issues ?? []),
        nozzle_generation_refs: (res.references ?? []).join(" · "),
      };
      setLocalData(prev => ({ ...prev, mechanical_design: next }));
      await apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/inputs`, { section: "mechanical_design", data: next });
      inputsQ.refetch();
      toast({ title: "Nozzle schedule generated", description: `${res.rows.length} nozzles sized from Thermopac nozzle master data${(res.issues ?? []).length ? ` — ${(res.issues as any[]).length} validation finding(s)` : ""}.` });
      return true;
    } catch (e: any) {
      toast({ title: "Nozzle generation blocked", description: e.message, variant: "destructive" });
      return false;
    } finally {
      setNozGenBusy(false);
    }
  }, [isFrozen, activeRevisionId, localData, toast]);

  // Atomic commit — merges updates into local state AND posts the exact merged
  // object, so immediate actions (Apply buttons, dropdown selections, checkboxes,
  // row deletes) can never save from a stale closure.
  const commitSection = useCallback((section: string, updates: Record<string, string>) => {
    if (isFrozen || !activeRevisionId) return;
    const next = { ...(localData[section] ?? {}), ...updates };
    setLocalData(prev => ({ ...prev, [section]: { ...(prev[section] ?? {}), ...updates } }));
    setSavingSection(section);
    upsertMutation.mutate({ section, data: next });
  }, [isFrozen, activeRevisionId, localData, upsertMutation]);

  // ── Fluid Properties auto-population (Step 3) ────────────────────────────────
  // NMP density / dynamic viscosity from the server-side EPD (source-tagged
  // tabular data) at the Design Basis Operating Temperature.
  const fpOtStr = (localData["design_basis"]?.operating_temperature ?? "").trim();
  const fpOt = numOrNull(fpOtStr);
  const epdNmpQ = useQuery({
    queryKey: [`/api/design-software/epd/nmp`, fpOtStr],
    queryFn: () => apiRequest("GET", `/api/design-software/epd/nmp?tc=${encodeURIComponent(fpOtStr)}`) as Promise<any>,
    enabled: (activeStep === "fluid_properties" || activeStep === "process_design") && fpOt !== null,
  });

  // Seed approved master-data defaults into blank Fluid Properties fields only.
  // Never overwrites engineer-entered values; properties without an approved
  // Thermopac value are left manual (no invented data).
  useEffect(() => {
    if (activeStep !== "fluid_properties" || isFrozen || !activeRevisionId || !inputsQ.data) return;
    if (hydratedRevision !== activeRevisionId) return; // never seed from pre-hydration empty state
    // Never auto-seed while a save is in flight — avoids posting a stale
    // whole-section object over a concurrent engineer edit.
    if (savingSection !== null || upsertMutation.isPending) return;
    const fp = localData["fluid_properties"] ?? {};
    const dbx = localData["design_basis"] ?? {};
    const u: Record<string, string> = {};
    const blank = (k: string) => (fp[k] ?? "").trim() === "";
    const setIf = (key: string, val: string | null, unit: string, refTemp?: string) => {
      if (val === null || val === "") return;
      if (blank(`${key}_value`)) u[`${key}_value`] = val;
      if (blank(`${key}_unit`) && (`${key}_value` in u || !blank(`${key}_value`))) {
        if (blank(`${key}_unit`)) u[`${key}_unit`] = unit;
      }
      if (refTemp && blank(`${key}_ref_temp`) && (`${key}_value` in u)) u[`${key}_ref_temp`] = refTemp;
    };
    // RRBO — Thermopac Feed Master density for the selected grade
    const grade = (dbx.feed_service ?? "").trim();
    const rhoMaster = RRBO_FEED_DENSITY_MASTER[grade];
    if (rhoMaster) setIf("rrbo_density", rhoMaster, "kg/m³", `${RRBO_FEED_DENSITY_REF_TEMP} °C`);
    // RRBO viscosities — Thermopac Master Data (Default) @ 40 °C, starting
    // values until laboratory measurements; engineer may override.
    const muMaster = RRBO_FEED_VISCOSITY_MASTER[grade];
    if (muMaster) {
      setIf("rrbo_viscosity_dynamic", muMaster.dynamic_mpas, "mPa·s", `${RRBO_FEED_VISCOSITY_REF_TEMP} °C`);
      setIf("rrbo_viscosity_kinematic", muMaster.kinematic_cst, "cSt", `${RRBO_FEED_VISCOSITY_REF_TEMP} °C`);
    }
    // RRBO / NMP temperature — Design Basis Operating Temperature
    if (fpOt !== null) {
      setIf("rrbo_temperature", fpOtStr, "°C", fpOtStr + " °C");
      setIf("nmp_temperature", fpOtStr, "°C", fpOtStr + " °C");
    }
    // RRBO product-requirement targets (Water / Colour / Sulphur)
    try {
      const rows: any[] = JSON.parse(dbx.raffinate_quality_rows || "[]");
      const target = (p: string) => rows.find(r => r?.parameter === p)?.target ?? null;
      setIf("rrbo_water", target("Water"), "ppm");
      setIf("rrbo_colour", target("Product Colour"), "ASTM D1500");
      setIf("rrbo_sulphur", target("Sulphur"), "ppm");
    } catch { /* ignore malformed rows */ }
    // RRBO kinematic viscosity — fallback calculation from an engineer-entered
    // dynamic viscosity ÷ density, only when the viscosity master did not
    // already seed a value for this grade.
    const mu = numOrNull(fp.rrbo_viscosity_dynamic_value);
    const rho = numOrNull(`${"rrbo_density_value" in u ? u.rrbo_density_value : fp.rrbo_density_value}`);
    if (mu !== null && rho !== null && rho > 0 && blank("rrbo_viscosity_kinematic_value") && !("rrbo_viscosity_kinematic_value" in u)) {
      u.rrbo_viscosity_kinematic_value = String(Math.round((mu / rho) * 1000 * 1000) / 1000);
      if (blank("rrbo_viscosity_kinematic_unit")) u.rrbo_viscosity_kinematic_unit = "mm²/s";
      if (blank("rrbo_viscosity_kinematic_ref_temp") && (fp.rrbo_viscosity_dynamic_ref_temp ?? "").trim() !== "")
        u.rrbo_viscosity_kinematic_ref_temp = fp.rrbo_viscosity_dynamic_ref_temp;
    }
    // NMP — EPD values at Operating Temperature
    const epd = epdNmpQ.data;
    if (epd?.density?.value != null) {
      setIf("nmp_density", String(Math.round(epd.density.value * 10) / 10), "kg/m³", fpOtStr + " °C");
      if (blank("nmp_density_source") && ("nmp_density_value" in u)) u.nmp_density_source = epd.density.pendingValidation ? "Assumed" : "Literature";
    }
    if (epd?.dynamicViscosity?.value != null) {
      setIf("nmp_viscosity_dynamic", String(Math.round(epd.dynamicViscosity.value * 1000) / 1000), "mPa·s", fpOtStr + " °C");
      if (blank("nmp_viscosity_dynamic_source") && ("nmp_viscosity_dynamic_value" in u)) u.nmp_viscosity_dynamic_source = epd.dynamicViscosity.pendingValidation ? "Assumed" : "Literature";
    }
    // NMP Master Data — purity / water spec limits
    setIf("nmp_purity", NMP_MASTER.purity.value, NMP_MASTER.purity.unit);
    setIf("nmp_water", NMP_MASTER.water.value, NMP_MASTER.water.unit);
    // Emulsion behaviour default text
    // Two-Phase Properties — Thermopac Preliminary Screening Defaults @ 70 °C
    // (source-tagged Assumed; Pending Laboratory Validation; ref temp stays
    // 70 °C and is never silently corrected to the Operating Temperature).
    for (const k of ["interfacial_tension", "nmp_solubility_rrbo", "oil_solubility_nmp"]) {
      const tp = TWO_PHASE_SCREENING_DEFAULTS[k];
      setIf(k, tp.value, tp.unit, `${TWO_PHASE_SCREENING_REF_TEMP} °C`);
      if ((`${k}_value` in u) && blank(`${k}_source`)) u[`${k}_source`] = "Assumed";
    }
    if (blank("phase_separation_time")) {
      u.phase_separation_time = TWO_PHASE_SCREENING_DEFAULTS.phase_separation_time.value;
      if (blank("phase_separation_time_unit")) u.phase_separation_time_unit = TWO_PHASE_SCREENING_DEFAULTS.phase_separation_time.unit;
      if (blank("phase_separation_time_source")) u.phase_separation_time_source = "Assumed";
      if (blank("phase_separation_time_ref_temp")) u.phase_separation_time_ref_temp = `${TWO_PHASE_SCREENING_REF_TEMP} °C`;
    }
    if (blank("emulsion_behaviour")) {
      u.emulsion_behaviour = EMULSION_BEHAVIOUR_DEFAULT;
    } else if ((fp.emulsion_behaviour ?? "").trim() === EMULSION_BEHAVIOUR_LEGACY_DEFAULT) {
      // Deterministic upgrade of the unchanged previous default text only.
      u.emulsion_behaviour = EMULSION_BEHAVIOUR_DEFAULT;
    }
    if (Object.keys(u).length > 0) commitSection("fluid_properties", u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, isFrozen, activeRevisionId, hydratedRevision, inputsQ.data, epdNmpQ.data, localData, savingSection, upsertMutation.isPending]);

  // ── Cooling Water default initialization (Design Basis) ─────────────────────
  // A new Design Basis persists all four CW defaults together, without waiting
  // for the engineer's first edit: Inlet = Ambient, ΔT = 8 °C (Auto-Populated),
  // Outlet = Inlet + ΔT, CT Approach = Inlet − Wet Bulb. Blank-only — never
  // overwrites engineer-entered or manual values.
  useEffect(() => {
    if (isFrozen || !activeRevisionId || !inputsQ.data) return;
    if (hydratedRevision !== activeRevisionId) return; // never seed from pre-hydration empty state
    if (savingSection !== null || upsertMutation.isPending) return;
    const dbx = localData["design_basis"] ?? {};
    const blank = (k: string) => (dbx[k] ?? "").trim() === "";
    const u: Record<string, string> = {};
    const amb = numOrNull(dbx.ambient_temperature ?? AMBIENT_DEFAULT);
    const inlet = !blank("cw_inlet_temperature") ? numOrNull(dbx.cw_inlet_temperature) : amb;
    if (blank("cw_inlet_temperature") && inlet !== null && dbx.cw_inlet_manual !== "true") {
      u.cw_inlet_temperature = String(inlet);
    }
    const dt = numOrNull(dbx.cw_delta_t);
    const dtEff = dt !== null && dt > 0 ? dt : Number(CW_DELTA_T_DEFAULT);
    if (dt === null || dt <= 0) {
      if (blank("cw_delta_t") || (dt !== null && dt <= 0)) u.cw_delta_t = CW_DELTA_T_DEFAULT;
      if ((dbx.cw_delta_t_manual ?? "") !== "") u.cw_delta_t_manual = "";
    }
    if (inlet !== null && blank("cw_outlet_temperature")) {
      u.cw_outlet_temperature = String(Math.round((inlet + dtEff) * 10) / 10);
    }
    // CT Approach — standard cooling-tower definition: Inlet − Wet Bulb (never outlet-based)
    const wbSeed = numOrNull(dbx.wet_bulb_temperature) ?? (amb !== null ? amb - 5 : null);
    if (inlet !== null && wbSeed !== null && blank("cw_approach")) {
      u.cw_approach = String(Math.round((inlet - wbSeed) * 10) / 10);
    }
    if (Object.keys(u).length > 0) commitSection("design_basis", u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFrozen, activeRevisionId, hydratedRevision, inputsQ.data, localData, savingSection, upsertMutation.isPending]);

  // ── Process Design (Stage 4) default initialization ─────────────────────────
  // Consumes the approved Design Basis: S/O ratio 1.5 (vol/vol), 6 theoretical
  // stages, 60 % stage efficiency, 20 % design margin; Extraction T/P track the
  // Design Basis Operating T/P until manually changed. Blank-only for defaults;
  // tracked fields never override a manual value.
  useEffect(() => {
    if (activeStep !== "process_design" || isFrozen || !activeRevisionId || !inputsQ.data) return;
    if (hydratedRevision !== activeRevisionId) return; // never seed from pre-hydration empty state
    if (savingSection !== null || upsertMutation.isPending) return;
    const pd = localData["process_design"] ?? {};
    const dbx = localData["design_basis"] ?? {};
    const u: Record<string, string> = {};
    const blank = (k: string) => (pd[k] ?? "").trim() === "";
    if (blank("so_ratio")) u.so_ratio = SO_RATIO_DEFAULT;
    if (blank("theoretical_stages")) u.theoretical_stages = THEORETICAL_STAGES_DEFAULT;
    if (blank("stage_efficiency")) u.stage_efficiency = STAGE_EFFICIENCY_DEFAULT;
    if (blank("design_margin")) u.design_margin = DESIGN_MARGIN_DEFAULT;
    if (blank("interface_control")) u.interface_control = INTERFACE_CONTROL_DEFAULT;
    for (const cb of COMPONENT_BALANCE_FIELDS) {
      if (blank(cb.key)) u[cb.key] = cb.def;
    }
    const otTrk = (dbx.operating_temperature ?? "").trim();
    if (otTrk !== "" && pd.extraction_temperature_manual !== "true" && (pd.extraction_temperature ?? "").trim() !== otTrk) {
      u.extraction_temperature = otTrk;
    }
    const opTrk = (dbx.operating_pressure ?? "").trim();
    if (opTrk !== "" && pd.extraction_pressure_manual !== "true" && (pd.extraction_pressure ?? "").trim() !== opTrk) {
      u.extraction_pressure = opTrk;
    }
    if (Object.keys(u).length > 0) commitSection("process_design", u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, isFrozen, activeRevisionId, hydratedRevision, inputsQ.data, localData, savingSection, upsertMutation.isPending]);

  const newRevisionMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/design-software/designs/${designId}/revisions`, {
        changeDescription: revisionNote, preparedById: (user as any)?.id,
      }) as Promise<any>,
    onSuccess: (rev) => {
      qc.invalidateQueries({ queryKey: [`/api/design-software/designs/${designId}`] });
      qc.invalidateQueries({ queryKey: [`/api/design-software/designs/${designId}/revisions`] });
      setSelectedRevisionId(rev.id);
      setShowNewRevision(false);
      setRevisionNote("");
      toast({ title: "New revision created", description: `Rev ${rev.revision_number}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const lifecycleMutation = useMutation({
    mutationFn: (action: string) =>
      apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/lifecycle`, {
        action, comments: lifecycleComment || undefined,
      }) as Promise<any>,
    onSuccess: (rev) => {
      qc.invalidateQueries({ queryKey: [`/api/design-software/designs/${designId}`] });
      qc.invalidateQueries({ queryKey: [`/api/design-software/designs/${designId}/revisions`] });
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/approvals`] });
      setShowLifecycle(null);
      setLifecycleComment("");
      toast({ title: "Status updated", description: STATUS_LABELS[rev.status] ?? rev.status });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const prelimDefaultsMutation = useMutation({
    mutationFn: (p: { scope: "ecp" | "ecr"; action: "apply" | "clear" }) =>
      apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/preliminary-defaults`, p) as Promise<any>,
    onSuccess: (resp: any) => {
      // Server response is authoritative for this section — overwrite local values
      setLocalData(prev => ({ ...prev, [resp.section]: Object.fromEntries(Object.entries(resp.data ?? {}).map(([k, v]) => [k, String(v ?? "")])) }));
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/inputs`] });
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/assumptions`] });
      toast({
        title: resp.applied ? "Preliminary defaults applied" : "Preliminary defaults cleared",
        description: resp.applied
          ? `${resp.fieldCount} Assumed-tagged screening defaults populated — editable, Pending Validation.`
          : "Thermopac preliminary default values and their register entries were removed.",
      });
    },
    onError: (e: any) => toast({ title: "Preliminary defaults error", description: e.message, variant: "destructive" }),
  });

  function renderPrelimBanner(scope: "ecp" | "ecr") {
    const section = scope === "ecp" ? "ecp_design" : "ecr_design";
    const active = Object.keys(localData[section] ?? {}).some(k => k.endsWith("_source_reference") && String((localData[section] as any)[k] ?? "").startsWith("Thermopac Preliminary"));
    return (
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl mb-3">
        <p className="text-xs text-blue-900">
          {active
            ? "Thermopac preliminary screening defaults are active. Results are suitable for preliminary engineering only and require vendor, laboratory, or pilot validation before design release."
            : "Thermopac preliminary screening defaults are available for this panel — apply them to populate a complete Assumed-tagged preliminary input set (Pending Validation)."}
        </p>
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isFrozen || prelimDefaultsMutation.isPending}
            onClick={() => prelimDefaultsMutation.mutate({ scope, action: "apply" })}>
            Reset to Thermopac Preliminary Defaults
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isFrozen || prelimDefaultsMutation.isPending}
            onClick={() => prelimDefaultsMutation.mutate({ scope, action: "clear" })}>
            Clear Preliminary Defaults
          </Button>
        </div>
        <p className="text-[10px] text-blue-700 mt-1.5">
          All defaults are Source Type: Assumed, visible and editable above, entered in the assumptions register, and classified Pending Validation until replaced by approved vendor, measured, or project data.
        </p>
      </div>
    );
  }

  const calculateMutation = useMutation({
    mutationFn: (calculationType: string) =>
      apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/calculate`, { calculationType }) as Promise<any>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/runs`] });
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/results`] });
    },
    onError: (e: any) => toast({ title: "Calculation error", description: e.message, variant: "destructive" }),
  });

  // ── Derived state ─────────────────────────────────────────────────────────────
  const currentStatus = activeRevision?.status ?? design?.revision_status ?? design?.current_status;
  const lifecycleActions = LIFECYCLE_ACTIONS[currentStatus] ?? [];
  const techSelection = localData["technology_selection"]?.technology ?? "";
  const showECP = techSelection === "ecp" || techSelection === "both";
  const showECR = techSelection === "ecr" || techSelection === "both";
  const d = (section: string) => localData[section] ?? {};

  // ── Validation checks ─────────────────────────────────────────────────────────
  const db = d("design_basis");
  const ts = d("technology_selection");
  const hd = d("hydraulic_design");
  const runs = runsQ.data ?? [];
  const hasHydraulicsRun = runs.some(r => r.calculation_type === "hydraulics_common" && r.calculation_status === "success");
  const hasECPRun = runs.some(r => r.calculation_type === "ecp" && r.calculation_status === "success");
  const hasECRRun = runs.some(r => r.calculation_type === "ecr" && r.calculation_status === "success");
  const floodingMargin = parseFloat(hd.flooding_margin ?? "");
  const mandatoryFields = [db.process_description, db.feed_service, db.solvent, db.design_capacity_lph ?? db.design_capacity, ts.technology];

  // Override-traceability enforcement (Design Basis governed suggestions)
  const vNum = (v: string | undefined) => {
    if (v === undefined || v.trim() === "") return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const overrideViolations: string[] = [];
  {
    // Extraction column pressure design cases (internal + external kept separate)
    const opV = vNum(db.operating_pressure);
    const intDP = vNum(db.llx_internal_design_pressure ?? "2.5");
    if (opV !== null && intDP !== null && intDP < opV) {
      overrideViolations.push("Internal Design Pressure must not be below Maximum Operating Pressure");
    }
    const extCond = (db.llx_external_design_condition ?? "Full Vacuum").trim();
    if (vNum(extCond) !== null) {
      overrideViolations.push("External design case must be a designation (e.g. Full Vacuum) — never a numeric bar(g) value such as 0");
    }
    const otV = vNum(db.operating_temperature); const dtV = vNum(db.design_temperature);
    if (otV !== null && dtV !== null && dtV < otV) {
      overrideViolations.push("Design Temperature must be ≥ Operating Temperature");
    }
    if (otV !== null && otV < 50 && dtV !== null && db.design_temperature_override !== "true") {
      overrideViolations.push("Design Temperature rule applies from 50 °C Operating Temperature — below that a stored value must be entered manually");
    }
    const ambVv = vNum(db.ambient_temperature ?? "25"); const wbVv = vNum(db.wet_bulb_temperature);
    if (ambVv !== null && wbVv !== null && wbVv > ambVv) {
      overrideViolations.push("Wet Bulb Temperature must not exceed Ambient Temperature");
    }
    const cwInV = vNum(db.cw_inlet_temperature); const cwOutV = vNum(db.cw_outlet_temperature); const cwDtV = vNum(db.cw_delta_t);
    if (cwInV !== null && ambVv !== null && cwInV > ambVv && db.cw_inlet_manual !== "true") {
      overrideViolations.push("CW Inlet Temperature exceeds Ambient Temperature without a manual engineer selection");
    }
    if (cwInV !== null && cwOutV !== null && cwOutV <= cwInV) {
      overrideViolations.push("CW Outlet Temperature must be greater than CW Inlet Temperature");
    }
    if (cwDtV !== null && cwDtV <= 0) {
      overrideViolations.push("CW Design ΔT must be positive");
    }
  }

  const validationChecks = [
    {
      label: "Design Basis — override traceability",
      status: overrideViolations.length === 0 ? "pass" : "fail",
      note: overrideViolations.length > 0 ? overrideViolations.join("; ") : undefined,
    },
    {
      label: "Design Basis — mandatory fields completed",
      status: mandatoryFields.every(f => f?.trim()) ? "pass" : "fail",
      note: !mandatoryFields.every(f => f?.trim()) ? "Process description, feed service, solvent, design capacity, and technology selection are required" : undefined,
    },
    {
      label: "Technology selection made",
      status: ts.technology ? "pass" : "fail",
      note: !ts.technology ? "Select ECP, ECR or Compare Both in Step 6" : undefined,
    },
    {
      label: "Common hydraulics calculation run",
      status: hasHydraulicsRun ? "pass" : "warning",
      note: !hasHydraulicsRun ? "Run Step 5 before proceeding to approval" : undefined,
    },
    {
      label: "Flooding within allowable limits (< 80 %)",
      status: isNaN(floodingMargin) ? "pending"
            : floodingMargin >= 80 ? "fail"
            : "pass",
      note: isNaN(floodingMargin) ? "Run hydraulics calculation first"
          : floodingMargin >= 80 ? `Current flooding margin: ${floodingMargin.toFixed(1)} %` : undefined,
    },
    {
      label: showECP ? "ECP equipment calculation run" : "ECP calculation (not selected)",
      status: !showECP ? "pending" : hasECPRun ? "pass" : "warning",
      note: showECP && !hasECPRun ? "Run ECP calculation in Step 7" : undefined,
    },
    {
      label: showECR ? "ECR equipment calculation run" : "ECR calculation (not selected)",
      status: !showECR ? "pending" : hasECRRun ? "pass" : "warning",
      note: showECR && !hasECRRun ? "Run ECR calculation in Step 7" : undefined,
    },
    {
      label: "All fluid properties have a source declared",
      status: (() => {
        const fp = d("fluid_properties");
        const keys = ["rrbo_density", "rrbo_viscosity_dynamic", "nmp_density", "nmp_viscosity_dynamic", "interfacial_tension"];
        return keys.every(k => fp[`${k}_source`]) ? "pass" : "warning";
      })(),
      note: "Every fluid property must have Measured / Vendor / Literature / Assumed declared",
    },
    {
      label: "Assumed data acknowledged",
      status: (() => {
        const fp = d("fluid_properties");
        const keys = ["rrbo_density", "rrbo_viscosity_dynamic", "rrbo_viscosity_kinematic", "nmp_density", "nmp_viscosity_dynamic", "interfacial_tension", "mutual_solubility"];
        const assumed = keys.filter(k => fp[`${k}_source`] === "Assumed");
        return assumed.length === 0 ? "pass" : "warning";
      })(),
      note: "Review amber-highlighted assumed values before approving",
    },
  ] as { label: string; status: "pass" | "fail" | "warning" | "pending"; note?: string }[];

  const canSubmit = validationChecks.filter(c => c.status === "fail").length === 0;

  // ── Step content renderers ────────────────────────────────────────────────────

  function renderDesignIdentity() {
    const di = d("design_identity");
    const info = (label: string, value: string | null | undefined) => (
      <div key={label} className="grid grid-cols-[180px_1fr] gap-2 py-1.5 border-b last:border-0">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-sm font-medium text-gray-900">{value || <span className="text-gray-300 italic">—</span>}</span>
      </div>
    );
    return (
      <div className="max-w-2xl">
        <SectionCard title="Engineering Document">
          {info("Design Number", design?.design_number)}
          {info("Design Title", design?.title)}
          {info("Module", "Liquid-Liquid Extraction")}
          {info("Design Type", design?.design_type === "rnd" ? "R&D / Independent Design" : "Project Design")}
          {info("Revision", activeRevision ? `Rev ${activeRevision.revision_number}` : "—")}
          {info("Status", STATUS_LABELS[currentStatus] ?? currentStatus)}
          {info("Design Date", activeRevision?.created_at ? new Date(activeRevision.created_at).toLocaleDateString() : "—")}
        </SectionCard>
        {!isFrozen && (
          <SectionCard title="Responsibility">
            <FieldRow label="Prepared By" value={di.prepared_by ?? ""} onChange={v => field("design_identity")("prepared_by", v)} onBlur={save("design_identity")} />
            <FieldRow label="Checked By" value={di.checked_by ?? ""} onChange={v => field("design_identity")("checked_by", v)} onBlur={save("design_identity")} />
            <FieldRow label="Approved By" value={di.approved_by ?? ""} onChange={v => field("design_identity")("approved_by", v)} onBlur={save("design_identity")} />
            <FieldRow label="Client / Customer" value={di.client ?? ""} onChange={v => field("design_identity")("client", v)} onBlur={save("design_identity")} />
            <FieldRow label="Plant Location" value={di.plant_location ?? ""} onChange={v => field("design_identity")("plant_location", v)} onBlur={save("design_identity")} />
          </SectionCard>
        )}
        {design?.design_type === "project" && (
          <SectionCard title="Project Details (auto-populated)">
            {info("Project Number", design?.project_code)}
            {info("Project Name", design?.project_name)}
            {info("Customer", design?.customer_name)}
            {info("Plant Location", design?.plant_location)}
            {info("Project Capacity", design?.capacity)}
          </SectionCard>
        )}
      </div>
    );
  }

  function renderDesignBasis() {
    const db = d("design_basis");
    const f = field("design_basis");
    const s = save("design_basis");
    const cs = (updates: Record<string, string>) => commitSection("design_basis", updates);
    const num = (v: string | undefined): number | null => {
      if (v === undefined || v.trim() === "") return null;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const fpData0 = d("fluid_properties");
    // Auto-generated Process Description (item 1) — built only from entered data
    const genDesc = (m: Record<string, string>): string => {
      const parts: string[] = [];
      parts.push(`Liquid-liquid extraction unit using ${m.solvent?.trim() || "NMP"} solvent${m.feed_service ? ` for treatment of ${m.feed_service}` : ""}.`);
      if (m.design_capacity_lph) {
        let cap = `Design capacity ${m.design_capacity_lph} LPH`;
        if (m.design_capacity_mtpa) cap += ` (≈ ${m.design_capacity_mtpa} TPA)`;
        cap += ` at 24 hr/day${m.operating_days ? `, ${m.operating_days} days/yr` : ""}.`;
        parts.push(cap);
      }
      const cond: string[] = [];
      if (m.feed_temperature) cond.push(`feed at ${m.feed_temperature} °C`);
      if (m.operating_temperature) cond.push(`operating temperature ${m.operating_temperature} °C`);
      if (m.operating_pressure) cond.push(`operating pressure ${m.operating_pressure} bar g`);
      if (cond.length) parts.push(`Operating conditions: ${cond.join(", ")}.`);
      if (m.design_life) parts.push(`Design life ${m.design_life} years.`);
      return parts.join(" ");
    };
    // Auto Design Objective from Design Type (item 9)
    const genObjective = (): string =>
      design?.design_type === "rnd"
        ? "R&D / independent design study of an NMP liquid-liquid extraction unit for re-refined base oil, to establish and validate the process and equipment design basis."
        : "Detailed process and equipment design of an NMP liquid-liquid extraction unit for re-refined base oil, for execution under the linked project.";
    // Wraps updates: recomputes auto-generated fields + derived TPA atomically (no stale closures)
    const auto = (updates: Record<string, string>): Record<string, string> => {
      const m = { ...db, ...updates };
      const lphM = num(m.design_capacity_lph);
      const daysM = num(m.operating_days);
      // Prefer the Design Basis feed density (source-tagged by construction); fall back to Fluid Properties
      const dbRho = num(m.feed_density);
      const rhoM = dbRho !== null ? dbRho : num(fpData0.rrbo_density_value);
      const rhoOk = dbRho !== null
        ? true
        : rhoM !== null && (fpData0.rrbo_density_source ?? "").trim() !== "" && (fpData0.rrbo_density_ref_temp ?? "").trim() !== "";
      if (lphM !== null && daysM !== null && rhoOk) {
        m.design_capacity_mtpa = ((lphM * 24 * daysM * (rhoM as number)) / 1e6).toFixed(0);
        updates = { ...updates, design_capacity_mtpa: m.design_capacity_mtpa };
      }
      // Extraction column pressure design — Thermopac standard values auto-populated
      // (NOT calculated from Operating Pressure by a percentage margin for this equipment).
      // Internal pressure and external vacuum are kept as separate design cases.
      if (m.llx_internal_design_pressure_override !== "true") {
        m.llx_internal_design_pressure = LLX_COL_INTERNAL_DP;
        updates = {
          ...updates,
          llx_internal_design_pressure: LLX_COL_INTERNAL_DP,
          llx_internal_design_pressure_status: "Auto-Populated",
          // Backward-compat dual-write: legacy design_pressure mirrors the internal design case
          design_pressure: LLX_COL_INTERNAL_DP,
          design_pressure_status: "Auto-Populated",
        };
      } else {
        updates = { ...updates, design_pressure: m.llx_internal_design_pressure ?? m.design_pressure };
      }
      if (m.llx_external_design_condition_override !== "true") {
        updates = {
          ...updates,
          llx_external_design_condition: LLX_COL_EXTERNAL_CONDITION,
          llx_full_vacuum_required: "Yes",
          llx_external_design_condition_status: "Auto-Populated",
        };
      } else {
        updates = { ...updates, llx_full_vacuum_required: (m.llx_external_design_condition ?? "") === "Full Vacuum" ? "Yes" : "No" };
      }
      // Wet Bulb Temperature — Thermopac rule: Ambient − 5 °C, auto-applied and
      // auto-saved unless the engineer has selected a different value.
      const ambM = num(m.ambient_temperature ?? AMBIENT_DEFAULT);
      if (m.wet_bulb_manual !== "true" && ambM !== null) {
        m.wet_bulb_temperature = String(ambM - 5);
        updates = { ...updates, wet_bulb_temperature: m.wet_bulb_temperature };
      }
      // Cooling Water — inlet defaults to Ambient (tracks Ambient until manually changed);
      // ΔT default 8 °C; Outlet = Inlet + ΔT; CT Approach = Inlet − Wet Bulb (read-only).
      const ambCW = num(m.ambient_temperature ?? AMBIENT_DEFAULT);
      if (m.cw_inlet_manual !== "true" && ambCW !== null) {
        m.cw_inlet_temperature = String(ambCW);
        updates = { ...updates, cw_inlet_temperature: m.cw_inlet_temperature };
      }
      if (num(m.cw_delta_t) === null || (num(m.cw_delta_t) as number) <= 0) {
        m.cw_delta_t = CW_DELTA_T_DEFAULT;
        updates = { ...updates, cw_delta_t: CW_DELTA_T_DEFAULT, cw_delta_t_manual: "" };
      }
      const cwInA = num(m.cw_inlet_temperature); const cwDtA = num(m.cw_delta_t);
      if (cwInA !== null && cwDtA !== null) {
        m.cw_outlet_temperature = String(Math.round((cwInA + cwDtA) * 10) / 10);
        updates = { ...updates, cw_outlet_temperature: m.cw_outlet_temperature };
      }
      const wbCW = num(m.wet_bulb_temperature);
      if (cwInA !== null && wbCW !== null) {
        m.cw_approach = String(Math.round((cwInA - wbCW) * 10) / 10);
        updates = { ...updates, cw_approach: m.cw_approach };
      } else if ((m.cw_approach ?? "").trim()) {
        m.cw_approach = "";
        updates = { ...updates, cw_approach: "" };
      }
      if (!(m.vessel_orientation ?? "").trim()) updates = { ...updates, vessel_orientation: LLX_COL_ORIENTATION };
      if (!(m.column_height_m ?? "").trim()) updates = { ...updates, column_height_m: LLX_COL_HEIGHT_M };
      // Design Temperature — Thermopac rule (ASME Sec. VIII Div. 1): OT 50–80 → 100 °C; OT > 80 → OT + 20 °C.
      const dtRuleA = dtRuleValue(num(m.operating_temperature));
      if (m.design_temperature_override !== "true") {
        if (dtRuleA !== null) {
          m.design_temperature = dtRuleA.toFixed(1);
          updates = { ...updates, design_temperature: m.design_temperature, design_temperature_status: "Auto-Populated", design_temperature_source: DT_RULE_SOURCE };
        } else if (["Auto-Calculated", "Auto-Populated"].includes(m.design_temperature_status ?? "")) {
          updates = { ...updates, design_temperature: "", design_temperature_status: "", design_temperature_source: "" };
        }
      }
      // Thermal Oil System — auto-populate from the Thermal Fluid Master Data on
      // fluid selection; all values remain directly editable (Manual when edited).
      const fluidM = THERMAL_FLUID_MASTER[(m.thermal_oil_type ?? "").trim()];
      const fluidSource = `${(m.thermal_oil_type ?? "").trim()} — Thermopac thermal-fluid master data`;
      if (fluidM) {
        if (m.thermal_heater_inlet_override !== "true") {
          m.thermal_heater_inlet = HEATER_INLET_DEFAULT;
          updates = { ...updates, thermal_heater_inlet: HEATER_INLET_DEFAULT, thermal_heater_inlet_status: "Auto-Populated" };
        }
        if (m.thermal_heater_outlet_override !== "true") {
          m.thermal_heater_outlet = HEATER_OUTLET_DEFAULT;
          updates = { ...updates, thermal_heater_outlet: HEATER_OUTLET_DEFAULT, thermal_heater_outlet_status: "Auto-Populated" };
        }
        if (m.thermal_oil_max_bulk_override !== "true") {
          m.thermal_oil_max_bulk_temp = fluidM.maxBulk;
          updates = { ...updates, thermal_oil_max_bulk_temp: fluidM.maxBulk, thermal_oil_max_bulk_status: "Auto-Populated" };
        }
        if (m.thermal_oil_max_film_override !== "true") {
          m.thermal_oil_max_film_temp = fluidM.maxFilm;
          updates = { ...updates, thermal_oil_max_film_temp: fluidM.maxFilm, thermal_oil_max_film_status: "Auto-Populated", thermal_oil_max_film_source: fluidSource };
        }
      } else {
        // No fluid selected / unknown fluid: clear auto-populated values only.
        const clr = (key: string, statusKey: string) => {
          if (["Auto-Calculated", "Auto-Populated"].includes(m[statusKey] ?? "")) {
            m[key] = ""; updates = { ...updates, [key]: "", [statusKey]: "" };
          }
        };
        clr("thermal_heater_inlet", "thermal_heater_inlet_status");
        clr("thermal_heater_outlet", "thermal_heater_outlet_status");
        clr("thermal_oil_max_bulk_temp", "thermal_oil_max_bulk_status");
        clr("thermal_oil_max_film_temp", "thermal_oil_max_film_status");
      }
      // Product Requirements — seed defaults from Product Requirement Master Data
      // once per design (seeded flag prevents re-seeding after deliberate removal).
      const prMaster = PRODUCT_REQUIREMENT_MASTER[m.feed_service ?? ""];
      if (prMaster) {
        if (shouldSeedRequirementRows(m.raffinate_quality_rows, m.raffinate_quality_rows_seeded)) {
          m.raffinate_quality_rows = JSON.stringify(prMaster.raffinate);
          updates = { ...updates, raffinate_quality_rows: m.raffinate_quality_rows, raffinate_quality_rows_seeded: "true" };
        }
        if (shouldSeedRequirementRows(m.extract_quality_rows, m.extract_quality_rows_seeded)) {
          m.extract_quality_rows = JSON.stringify(prMaster.extract);
          updates = { ...updates, extract_quality_rows: m.extract_quality_rows, extract_quality_rows_seeded: "true" };
        }
      }
      // One-time migration: legacy standalone Colour Scale / Colour Value /
      // Raffinate Yield fields fold into the structured Product Requirement
      // rows (the source of truth), then the legacy keys are cleared so this
      // never runs again. Engineer-edited row targets are never overwritten —
      // legacy values only fill rows whose target is blank or still at the
      // master default.
      const legacyColour = (m.product_colour ?? "").trim();
      const legacyYield = (m.raffinate_yield ?? "").trim();
      const legacyScale = (m.colour_scale ?? "").trim();
      if (legacyColour !== "" || legacyYield !== "" || legacyScale !== "") {
        let rows: Array<Record<string, string>> = [];
        try { rows = JSON.parse(m.raffinate_quality_rows || "[]"); } catch { rows = []; }
        if (!Array.isArray(rows)) rows = [];
        const patch = (param: string, target: string, notes?: string) => {
          if (target === "" && !notes) return;
          const master = PRODUCT_PARAMETER_MASTER[param];
          const row = rows.find(r => r.parameter === param);
          if (row) {
            const t = (row.target ?? "").trim();
            if (target !== "" && (t === "" || t === (master?.defaultTarget ?? ""))) row.target = target;
            if (notes && (row.notes ?? "").trim() === (param === "Product Colour" ? (master?.notes ?? "") : "")) row.notes = notes;
          } else if (target !== "") {
            rows.push({ parameter: param, target, unit: master?.unit ?? "", limitType: master?.limitType ?? "Max", notes: notes ?? master?.notes ?? "" });
          }
        };
        patch("Product Colour", legacyColour, legacyScale !== "" ? `Scale: ${legacyScale}` : undefined);
        patch("Raffinate Yield", legacyYield);
        m.raffinate_quality_rows = JSON.stringify(rows);
        updates = {
          ...updates,
          raffinate_quality_rows: m.raffinate_quality_rows,
          raffinate_quality_rows_seeded: "true",
          product_colour: "",
          raffinate_yield: "",
          colour_scale: "",
        };
      }
      // Operating Pressure — Thermopac Design Basis Master default for LLX
      // (1.0 bar g). Blank-only: never overwrites an engineer-entered value.
      if ((m.operating_pressure ?? "").trim() === "") {
        m.operating_pressure = OPERATING_PRESSURE_DEFAULT;
        updates = { ...updates, operating_pressure: OPERATING_PRESSURE_DEFAULT };
      }
      if (m.design_objective_manual !== "true") {
        m.design_objective = genObjective();
        updates = { ...updates, design_objective: m.design_objective };
      }
      if (m.process_description_manual !== "true") {
        updates = { ...updates, process_description: genDesc(m) };
      }
      return updates;
    };
    const csa = (updates: Record<string, string>) => cs(auto(updates));
    // Rule-populated design values: edits switch the field to Manual (no change-control
    // machinery — the workspace revision history tracks changes). Blank restores the rule;
    // re-entering the rule value returns the field to Auto-Populated.
    const commitDesignValue = (key: string, ruleVal: string | null) => () => {
      const val = (db[key] ?? "").trim();
      if (val === "" || (ruleVal !== null && num(val) === num(ruleVal))) {
        cs(auto({ [key]: val === "" ? "" : (ruleVal as string), [`${key}_status`]: "", [`${key}_override`]: "" }));
        return;
      }
      cs(auto({ [key]: val, [`${key}_override`]: "true", [`${key}_status`]: "Manual" }));
    };
    const clearDesignOverride = (key: string) => () =>
      cs(auto({ [`${key}_override`]: "", [`${key}_status`]: "" }));
    // Governed suggestions — computed for display only, never auto-saved
    const op = num(db.operating_pressure);
    const ot = num(db.operating_temperature);
    const dtRuleN = dtRuleValue(ot);
    const suggestedDT = dtRuleN !== null ? dtRuleN.toFixed(1) : null;
    const feedT = num(db.feed_temperature);
    const wb = num(db.wet_bulb_temperature);
    // Site Conditions — Thermopac defaults apply when nothing is selected yet
    const ambSite = num(db.ambient_temperature ?? AMBIENT_DEFAULT);
    const wbSuggested = ambSite !== null ? String(ambSite - 5) : null;
    const elevEff = num(db.site_elevation ?? ELEVATION_DEFAULT);
    const atmCalc = elevEff !== null ? (101325 * Math.pow(1 - 0.0000225577 * elevEff, 5.25588) / 1000).toFixed(2) : null;
    const atmOverride = db.atm_pressure_override === "true";
    // Cooling Water — effective values: rules apply immediately in the display even
    // before any commit has persisted them (never blank when defaults exist).
    const cwInEff = (db.cw_inlet_temperature ?? "").trim() !== "" ? (db.cw_inlet_temperature as string) : (db.ambient_temperature ?? AMBIENT_DEFAULT);
    const cwIn = num(cwInEff);
    const cwDtEff = num(db.cw_delta_t) !== null && (num(db.cw_delta_t) as number) > 0 ? (db.cw_delta_t as string) : CW_DELTA_T_DEFAULT;
    const cwOutEff = cwIn !== null ? String(Math.round((cwIn + (num(cwDtEff) as number)) * 10) / 10) : "";
    const cwOut = num((db.cw_outlet_temperature ?? "").trim() !== "" ? (db.cw_outlet_temperature as string) : cwOutEff);
    const wbEffN = wb !== null ? wb : (ambSite !== null ? ambSite - 5 : null);
    const cwApprEff = cwIn !== null && wbEffN !== null ? String(Math.round((cwIn - wbEffN) * 10) / 10) : "";
    // Design capacity cross-conversion (governed: only with annual hours + tagged density)
    const daysYr = num(db.operating_days);
    const fpData = d("fluid_properties");
    const dbFeedRho = num(db.feed_density);
    const rho = dbFeedRho !== null ? dbFeedRho : num(fpData.rrbo_density_value);
    const rhoTagged = dbFeedRho !== null
      ? true
      : rho !== null && (fpData.rrbo_density_source ?? "").trim() !== "" && (fpData.rrbo_density_ref_temp ?? "").trim() !== "";
    const rhoRefT = dbFeedRho !== null ? `${db.feed_density_ref_temp || "15"} °C` : fpData.rrbo_density_ref_temp;
    const rhoSrc = dbFeedRho !== null ? (db.feed_density_source || FEED_DENSITY_DEFAULT_SOURCE) : fpData.rrbo_density_source;
    const annualHours = daysYr !== null ? 24 * daysYr : null; // Operating Hours fixed at 24 hr/day for this module
    const lph = num(db.design_capacity_lph);
    const tpa = lph !== null && annualHours !== null && rhoTagged ? (lph * annualHours * (rho as number)) / 1e6 : null;
    return (
      <div className="max-w-3xl">
        <SectionCard title="General">
          <TextAreaRow
            label="Process Description"
            value={db.process_description ?? ""}
            onChange={v => { f("process_description", v); f("process_description_manual", "true"); }}
            onBlur={s}
            rows={3}
          />
          <div className="ml-[212px] -mt-1 flex items-center gap-3">
            <p className="text-xs text-gray-500">
              {db.process_description_manual === "true"
                ? "Manually edited — auto-update paused"
                : "Auto-generated from the Design Basis; edits pause auto-update"}
            </p>
            {db.process_description_manual === "true" && (
              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => cs({ process_description: genDesc(db), process_description_manual: "false" })}>
                Reset to auto-generated
              </Button>
            )}
          </div>
          <SelectRow
            label="Feed Service"
            value={db.feed_service ?? ""}
            onChange={v => f("feed_service", v)}
            onBlur={s}
            onCommit={v => {
              const rho = FEED_SERVICE_DENSITY[v];
              csa(rho
                ? { feed_service: v, feed_density: rho, feed_density_ref_temp: "15", feed_density_source: FEED_DENSITY_DEFAULT_SOURCE, feed_density_status: "Auto-Populated" }
                : { feed_service: v });
            }}
            options={db.feed_service && !FEED_SERVICE_OPTIONS.includes(db.feed_service) ? [...FEED_SERVICE_OPTIONS, db.feed_service] : FEED_SERVICE_OPTIONS}
          />
          <FieldRow
            label="Feed Density"
            value={db.feed_density ?? ""}
            onChange={v => { f("feed_density", v); f("feed_density_status", "Manual"); }}
            onBlur={() => cs(auto({}))}
            unit="kg/m³"
            note={db.feed_density
              ? `Reference Temperature: ${db.feed_density_ref_temp || "15"} °C · Source: ${db.feed_density_source || FEED_DENSITY_DEFAULT_SOURCE} · Status: ${db.feed_density_status || "Auto-Populated"}`
              : "Auto-populated on Feed Service selection (Thermopac Design Basis Default @ 15 °C); fully editable"}
          />
          <SelectRow
            label="Solvent"
            value={db.solvent ?? ""}
            onChange={v => f("solvent", v)}
            onBlur={s}
            onCommit={v => csa({ solvent: v, solvent_status: "Manual", solvent_source: "Engineer selection" })}
            options={db.solvent && db.solvent !== "N-Methyl-2-Pyrrolidone (NMP)" ? ["N-Methyl-2-Pyrrolidone (NMP)", db.solvent] : ["N-Methyl-2-Pyrrolidone (NMP)"]}
            note={db.solvent
              ? `Status: ${db.solvent_status || "Manual"}${db.solvent_source ? ` · Source: ${db.solvent_source}` : ""} · Controlled list — expanded via master data only. Drives the Fluid Properties section.`
              : "Not persisted — new designs are seeded with N-Methyl-2-Pyrrolidone (NMP) automatically. Select to persist."}
          />
          <SelectRow
            label="Design Capacity (LPH)"
            value={db.design_capacity_lph ?? db.design_capacity ?? ""}
            onChange={v => { f("design_capacity_lph", v); f("design_capacity", v); f("feed_flow", v); }}
            onBlur={s}
            onCommit={v => csa({ design_capacity_lph: v, design_capacity: v, feed_flow: v })}
            options={db.design_capacity_lph && !CAPACITY_OPTIONS.includes(db.design_capacity_lph) ? [...CAPACITY_OPTIONS, db.design_capacity_lph] : CAPACITY_OPTIONS}
            unit="LPH"
            note="Sets Feed Flow and the legacy capacity field"
          />
          <FieldRow label="Design Capacity (TPA)" value={tpa !== null ? tpa.toFixed(0) : (db.design_capacity_mtpa ?? "")} onChange={() => {}} onBlur={() => {}} unit="t/yr" readOnly />
          {tpa !== null && (
            <p className="text-xs ml-[212px] -mt-1 text-gray-500">
              Auto-calculated: {lph} LPH × 24 hr/day × {daysYr} days/yr × ρ {rho} kg/m³ (@ {rhoRefT}, source: {rhoSrc}) ÷ 10⁶ = <b>{tpa.toFixed(0)} t/yr</b>
            </p>
          )}
          <FieldRow label="Operating Hours" value="24" onChange={() => {}} onBlur={() => {}} unit="hr/day" readOnly note="Fixed for this module" />
          <SelectRow label="Operating Days" value={db.operating_days ?? ""} onChange={v => f("operating_days", v)} onBlur={s} onCommit={v => csa({ operating_days: v })} options={["300", "310", "320", "330"]} unit="days/yr" />
          <SelectRow
            label="Design Life"
            value={db.design_life ?? ""}
            onChange={v => f("design_life", v)}
            onBlur={s}
            onCommit={v => csa({ design_life: v })}
            options={db.design_life && !["20", "30"].includes(db.design_life) ? ["20", "30", db.design_life] : ["20", "30"]}
            unit="years"
          />
          <TextAreaRow
            label="Design Objective"
            value={db.design_objective || (db.design_objective_manual !== "true" ? genObjective() : "")}
            onChange={v => { f("design_objective", v); f("design_objective_manual", "true"); }}
            onBlur={s}
            rows={2}
          />
          <div className="ml-[212px] -mt-1 flex items-center gap-3">
            <p className="text-xs text-gray-500">
              {db.design_objective_manual === "true"
                ? "Manually edited"
                : `Auto-populated from Design Type (${design?.design_type === "rnd" ? "R&D / Independent" : "Project"})`}
            </p>
            {db.design_objective_manual === "true" && (
              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => cs({ design_objective: genObjective(), design_objective_manual: "false" })}>
                Reset to auto
              </Button>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Operating Conditions">
          <div className="border-b pb-3 mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Site Conditions</p>
            <SelectRow
              label="Ambient Temperature"
              value={db.ambient_temperature ?? AMBIENT_DEFAULT}
              onChange={v => f("ambient_temperature", v)}
              onBlur={s}
              onCommit={v => csa({ ambient_temperature: v })}
              options={SITE_TEMP_OPTIONS}
              unit="°C"
              note={db.ambient_temperature ? undefined : "Default: 25 °C (Thermopac default) — select to confirm/change"}
            />
            <SelectRow
              label="Wet Bulb Temperature"
              value={db.wet_bulb_temperature ?? (wbSuggested ?? "")}
              onChange={v => f("wet_bulb_temperature", v)}
              onBlur={s}
              onCommit={v => csa({ wet_bulb_temperature: v, wet_bulb_manual: wbSuggested !== null && v === wbSuggested ? "" : "true" })}
              options={SITE_TEMP_OPTIONS}
              unit="°C"
              note={db.wet_bulb_manual === "true" ? "Engineer-selected value (rule: Ambient − 5 °C)" : "Auto-applied Thermopac rule: Ambient − 5 °C — select a different value to override"}
            />
            {wb !== null && ambSite !== null && wb > ambSite && (
              <p className="text-xs ml-[212px] text-red-600 font-medium">Wet Bulb Temperature must not exceed Ambient Temperature ({ambSite} °C)</p>
            )}
            <SelectRow
              label="Site Elevation"
              value={db.site_elevation ?? ELEVATION_DEFAULT}
              onChange={v => f("site_elevation", v)}
              onBlur={s}
              onCommit={v => cs({ site_elevation: v })}
              options={SITE_ELEVATION_OPTIONS}
              unit="m above MSL"
              note={db.site_elevation ? undefined : "Default: 0 m (Thermopac default) — select to confirm/change"}
            />
            <FieldRow
              label="Atmospheric Pressure"
              value={atmCalc ?? ""}
              onChange={() => {}}
              onBlur={() => {}}
              unit="kPa"
              readOnly
            />
            {atmCalc === null ? (
              <p className="text-xs ml-[212px] -mt-1 text-gray-500">Awaiting Site Elevation — ISA rule applies once elevation is set (a value is never defaulted to zero)</p>
            ) : (
              <p className="text-xs ml-[212px] -mt-1 text-gray-500">
                {ISA_FORMULA} · h = {elevEff ?? "—"} m · Source: ISA Standard Atmosphere · Status: Auto-Populated (read-only)
              </p>
            )}
          </div>
          <FieldRow label="Feed Flow" value={db.feed_flow ?? db.design_capacity_lph ?? ""} onChange={() => {}} onBlur={() => {}} unit="LPH" readOnly note="= Design Capacity (LPH)" />
          <SelectRow label="Feed Temperature" value={db.feed_temperature ?? ""} onChange={v => f("feed_temperature", v)} onBlur={s} onCommit={v => csa({ feed_temperature: v })} options={["10", "15", "20", "25", "30", "35", "40"]} unit="°C" />
          <FieldRow
            label="Feed Pressure"
            value={db.feed_pressure ?? ""}
            onChange={v => f("feed_pressure", v)}
            onBlur={() => cs(auto({}))}
            unit="bar g"
            note="Manual — no process-configuration rule or master data available"
          />
          <FieldRow
            label="Operating Pressure"
            value={db.operating_pressure ?? ""}
            onChange={v => f("operating_pressure", v)}
            onBlur={() => cs(auto({}))}
            unit="bar g"
          />
          <p className="text-xs ml-[212px] -mt-1 text-gray-500">
            Status: {(db.operating_pressure ?? "").trim() !== "" && db.operating_pressure !== OPERATING_PRESSURE_DEFAULT ? "Manual" : "Auto-Populated"} · Default {OPERATING_PRESSURE_DEFAULT} bar g · Source: {OPERATING_PRESSURE_SOURCE} — editable; Extraction Pressure follows this value
          </p>
          <SelectRow label="Operating Temperature" value={db.operating_temperature ?? ""} onChange={v => f("operating_temperature", v)} onBlur={s} onCommit={v => csa({ operating_temperature: v })} options={["50", "55", "60", "65", "70", "75", "80"]} unit="°C" allowOther note="Values above 80 °C may be entered directly — Design Temperature then follows OT + 20 °C" />
          <div className="border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Extraction Column Pressure Design — Thermopac Standard</p>
            <FieldRow label="Vessel Orientation" value={db.vessel_orientation ?? LLX_COL_ORIENTATION} onChange={() => {}} onBlur={() => {}} readOnly note="Thermopac standard — vertical extraction column" />
            <FieldRow label="Approx. Column Height" value={db.column_height_m ?? LLX_COL_HEIGHT_M} onChange={v => f("column_height_m", v)} onBlur={() => cs(auto({}))} unit="m" note="Thermopac standard ≈ 14 m — editable" />
            <FieldRow
              label="Internal Design Pressure"
              value={db.llx_internal_design_pressure ?? LLX_COL_INTERNAL_DP}
              onChange={v => f("llx_internal_design_pressure", v)}
              onBlur={commitDesignValue("llx_internal_design_pressure", LLX_COL_INTERNAL_DP)}
              unit="bar g"
            />
            <p className="text-xs ml-[212px] -mt-1 text-gray-500">
              Positive internal design case: <b>{db.llx_internal_design_pressure ?? LLX_COL_INTERNAL_DP} bar(g)</b> · Source: {LLX_COL_STANDARD_SOURCE} · Status: {db.llx_internal_design_pressure_override === "true" ? "Manual" : "Auto-Populated"} — not derived from Operating Pressure by a percentage margin
            </p>
            {op !== null && num(db.llx_internal_design_pressure ?? LLX_COL_INTERNAL_DP) !== null && (num(db.llx_internal_design_pressure ?? LLX_COL_INTERNAL_DP) as number) < op && (
              <p className="text-xs ml-[212px] text-red-600 font-medium">Internal Design Pressure must not be below Maximum Operating Pressure ({op} bar g)</p>
            )}
            {db.llx_internal_design_pressure_override === "true" && (
              <div className="ml-[212px] mt-1">
                <button type="button" onClick={clearDesignOverride("llx_internal_design_pressure")} className="px-2 py-0.5 text-xs border border-blue-300 text-blue-700 rounded hover:bg-blue-50 whitespace-nowrap">Revert to standard ({LLX_COL_INTERNAL_DP} bar g)</button>
              </div>
            )}
            <SelectRow
              label="External Design Pressure"
              value={db.llx_external_design_condition ?? LLX_COL_EXTERNAL_CONDITION}
              onChange={v => f("llx_external_design_condition", v)}
              onBlur={s}
              onCommit={v => {
                const prev = db.llx_external_design_condition ?? LLX_COL_EXTERNAL_CONDITION;
                if (v === prev) return;
                cs(auto({
                  llx_external_design_condition: v,
                  llx_external_design_condition_override: v === LLX_COL_EXTERNAL_CONDITION ? "" : "true",
                }));
              }}
              options={["Full Vacuum"]}
              allowOther
              note="Separate external design case — never combined with the internal pressure rating and never represented as 0 bar(g)"
            />
            <FieldRow label="Full Vacuum Design Required" value={db.llx_full_vacuum_required ?? "Yes"} onChange={() => {}} onBlur={() => {}} readOnly note="Derived from the external design case; stored in the Design Basis and consumed by the C6 mechanical design engine (engine unchanged)" />
            <p className="text-xs ml-[212px] -mt-1 text-gray-500">
              Source: {db.llx_external_design_condition_override === "true" ? "Engineer selection" : LLX_COL_STANDARD_SOURCE} · Status: {db.llx_external_design_condition_override === "true" ? "Manual" : "Auto-Populated"}
            </p>
          </div>
          <div className="border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Design Temperature — Thermopac Design Temperature Rule</p>
            <FieldRow label="Design Code" value={DT_DESIGN_CODE} onChange={() => {}} onBlur={() => {}} readOnly note="Governing mechanical design code for the Design Temperature rule" />
            <FieldRow
              label="Design Temperature"
              value={db.design_temperature ?? ""}
              onChange={v => f("design_temperature", v)}
              onBlur={commitDesignValue("design_temperature", suggestedDT)}
              unit="°C"
            />
            {suggestedDT === null && db.design_temperature_override !== "true" ? (
              <p className="text-xs ml-[212px] -mt-1 text-gray-500">Rule applies from OT 50 °C — below that, enter Design Temperature manually (a value is never defaulted to zero)</p>
            ) : (
              <p className="text-xs ml-[212px] -mt-1 text-gray-500">
                Rule: OT 50–80 °C → DT = 100 °C; OT &gt; 80 °C → DT = OT + 20 °C{ot !== null && suggestedDT ? ` · Applied: OT ${ot} °C → DT ${suggestedDT} °C` : ""} · Source: {DT_RULE_SOURCE} · Status: {db.design_temperature_override === "true" ? "Manual" : "Auto-Populated"}
              </p>
            )}
            {ot !== null && num(db.design_temperature) !== null && (num(db.design_temperature) as number) < ot && (
              <p className="text-xs ml-[212px] text-red-600 font-medium">Design Temperature must be ≥ Operating Temperature ({ot} °C)</p>
            )}
            {db.design_temperature_override === "true" && (
              <div className="ml-[212px] mt-1">
                <button type="button" onClick={clearDesignOverride("design_temperature")} className="px-2 py-0.5 text-xs border border-blue-300 text-blue-700 rounded hover:bg-blue-50 whitespace-nowrap">Revert to rule{suggestedDT ? ` (${suggestedDT} °C)` : ""}</button>
              </div>
            )}
          </div>
          <div className="border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Thermal Oil System</p>
            {(() => {
              const fluidName = (db.thermal_oil_type ?? "").trim();
              const fluidM = THERMAL_FLUID_MASTER[fluidName];
              const fluidSource = fluidM ? `${fluidName} — Thermopac thermal-fluid master data` : null;
              const statusLine = (overrideKey: string, ruleVal: string | null, source: string) =>
                fluidM || db[overrideKey] === "true" ? (
                  <p className="text-xs ml-[212px] -mt-1 text-gray-500">
                    Status: {db[overrideKey] === "true" ? "Manual" : "Auto-Populated"} · Source: {db[overrideKey] === "true" ? "Engineer entry" : source} · Fluid: {fluidName || "—"}{ruleVal && db[overrideKey] === "true" ? ` · Recommended: ${ruleVal} °C` : ""}
                  </p>
                ) : (
                  <p className="text-xs ml-[212px] -mt-1 text-gray-500">Select a thermal fluid to auto-populate (never defaulted to zero)</p>
                );
              const commitThermal = (key: string, overrideKey: string, statusKey: string, ruleVal: string | null) => () => {
                const v = (db[key] ?? "").trim();
                if (v === "" || (ruleVal !== null && num(v) === num(ruleVal))) {
                  cs(auto({ [key]: "", [overrideKey]: "", [statusKey]: "" }));
                } else {
                  cs(auto({ [key]: v, [overrideKey]: "true", [statusKey]: "Manual" }));
                }
              };
              return (
                <>
                  <SearchSelectRow
                    label="Oil Type / Grade"
                    value={db.thermal_oil_type ?? ""}
                    options={THERMAL_OIL_OPTIONS}
                    onSelect={v => csa({ thermal_oil_type: v })}
                    placeholder="Search / select thermal oil…"
                    note="Searchable — master data: Therminol 65 / 66"
                  />
                  <FieldRow
                    label="Heater Inlet Temp"
                    value={db.thermal_heater_inlet ?? ""}
                    onChange={v => f("thermal_heater_inlet", v)}
                    onBlur={commitThermal("thermal_heater_inlet", "thermal_heater_inlet_override", "thermal_heater_inlet_status", fluidM ? HEATER_INLET_DEFAULT : null)}
                    unit="°C"
                  />
                  {statusLine("thermal_heater_inlet_override", HEATER_INLET_DEFAULT, THERMAL_DEFAULT_SOURCE)}
                  <FieldRow
                    label="Heater Outlet Temp"
                    value={db.thermal_heater_outlet ?? ""}
                    onChange={v => f("thermal_heater_outlet", v)}
                    onBlur={commitThermal("thermal_heater_outlet", "thermal_heater_outlet_override", "thermal_heater_outlet_status", fluidM ? HEATER_OUTLET_DEFAULT : null)}
                    unit="°C"
                  />
                  {statusLine("thermal_heater_outlet_override", HEATER_OUTLET_DEFAULT, THERMAL_DEFAULT_SOURCE)}
                  <FieldRow
                    label="Max Bulk Temp"
                    value={db.thermal_oil_max_bulk_temp ?? ""}
                    onChange={v => f("thermal_oil_max_bulk_temp", v)}
                    onBlur={commitThermal("thermal_oil_max_bulk_temp", "thermal_oil_max_bulk_override", "thermal_oil_max_bulk_status", fluidM?.maxBulk ?? null)}
                    unit="°C"
                  />
                  {statusLine("thermal_oil_max_bulk_override", fluidM?.maxBulk ?? null, fluidSource ?? THERMAL_DEFAULT_SOURCE)}
                  <FieldRow
                    label="Max Film Temp"
                    value={db.thermal_oil_max_film_temp ?? ""}
                    onChange={v => f("thermal_oil_max_film_temp", v)}
                    onBlur={commitThermal("thermal_oil_max_film_temp", "thermal_oil_max_film_override", "thermal_oil_max_film_status", fluidM?.maxFilm ?? null)}
                    unit="°C"
                  />
                  {statusLine("thermal_oil_max_film_override", fluidM?.maxFilm ?? null, fluidSource ?? THERMAL_DEFAULT_SOURCE)}
                </>
              );
            })()}
          </div>
          <div className="border-t pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cooling Water</p>
            <SelectRow
              label="CW Inlet Temp"
              value={cwInEff}
              onChange={v => f("cw_inlet_temperature", v)}
              onBlur={s}
              onCommit={v => cs(auto({
                cw_inlet_temperature: v,
                cw_inlet_manual: num(v) !== null && num(v) === num(db.ambient_temperature ?? AMBIENT_DEFAULT) ? "" : "true",
              }))}
              options={CW_INLET_OPTIONS}
              unit="°C"
            />
            <p className="text-xs ml-[212px] -mt-1 text-gray-500">
              Status: {db.cw_inlet_manual === "true" ? "Manual" : "Auto-Populated"} · Rule: defaults to Ambient Temperature ({db.ambient_temperature ?? AMBIENT_DEFAULT} °C) and follows it until manually changed
            </p>
            {db.cw_inlet_manual === "true" && (
              <div className="ml-[212px] mt-1">
                <button type="button" onClick={() => cs(auto({ cw_inlet_manual: "" }))} className="px-2 py-0.5 text-xs border border-blue-300 text-blue-700 rounded hover:bg-blue-50 whitespace-nowrap">Reset to Default (Ambient {db.ambient_temperature ?? AMBIENT_DEFAULT} °C)</button>
              </div>
            )}
            {cwIn !== null && num(db.ambient_temperature ?? AMBIENT_DEFAULT) !== null && cwIn > (num(db.ambient_temperature ?? AMBIENT_DEFAULT) as number) && db.cw_inlet_manual !== "true" && (
              <p className="text-xs ml-[212px] text-red-600 font-medium">CW Inlet Temperature exceeds Ambient Temperature — requires a manual engineer selection</p>
            )}
            <SelectRow
              label="CW Design ΔT"
              value={cwDtEff}
              onChange={v => f("cw_delta_t", v)}
              onBlur={s}
              onCommit={v => cs(auto({ cw_delta_t: v, cw_delta_t_manual: v === CW_DELTA_T_DEFAULT ? "" : "true" }))}
              options={CW_DELTA_T_OPTIONS}
              allowOther
              unit="°C"
            />
            <p className="text-xs ml-[212px] -mt-1 text-gray-500">
              Status: {db.cw_delta_t_manual === "true" ? "Manual" : "Auto-Populated"} · Rule: default {CW_DELTA_T_DEFAULT} °C · changing ΔT recalculates CW Outlet
            </p>
            {num(db.cw_delta_t) !== null && (num(db.cw_delta_t) as number) <= 0 && (
              <p className="text-xs ml-[212px] text-red-600 font-medium">CW Design ΔT must be positive</p>
            )}
            <FieldRow
              label="CW Outlet Temp"
              value={(db.cw_outlet_temperature ?? "").trim() !== "" ? (db.cw_outlet_temperature as string) : cwOutEff}
              onChange={v => f("cw_outlet_temperature", v)}
              onBlur={() => {
                const o = num(db.cw_outlet_temperature); const i = cwIn;
                if (o !== null && i !== null && o > i) {
                  const dT = String(Math.round((o - i) * 10) / 10);
                  cs(auto({ cw_delta_t: dT, cw_delta_t_manual: dT === CW_DELTA_T_DEFAULT ? "" : "true" }));
                } else {
                  cs(auto({}));
                }
              }}
              unit="°C"
            />
            <p className="text-xs ml-[212px] -mt-1 text-gray-500">
              Status: Auto-Populated · Rule: CW Inlet + CW Design ΔT · editing recalculates ΔT
            </p>
            {cwIn !== null && cwOut !== null && cwOut <= cwIn && (
              <p className="text-xs ml-[212px] text-red-600 font-medium">CW Outlet Temperature must be greater than CW Inlet Temperature</p>
            )}
            <FieldRow
              label="CT Approach"
              value={(db.cw_approach ?? "").trim() !== "" ? (db.cw_approach as string) : cwApprEff}
              onChange={() => {}}
              onBlur={() => {}}
              readOnly
              unit="°C"
              note="Calculated: CW Inlet − Wet Bulb Temperature (read-only)"
            />
          </div>
        </SectionCard>

        <SectionCard title="Product Requirements">
          <QualityRowsEditor
            title="Raffinate Quality"
            jsonValue={!shouldSeedRequirementRows(db.raffinate_quality_rows, db.raffinate_quality_rows_seeded) || !PRODUCT_REQUIREMENT_MASTER[db.feed_service ?? ""]
              ? (db.raffinate_quality_rows ?? "")
              : JSON.stringify(PRODUCT_REQUIREMENT_MASTER[db.feed_service ?? ""].raffinate)}
            legacyValue={db.raffinate_quality}
            onChange={v => { f("raffinate_quality_rows", v); f("raffinate_quality_rows_seeded", "true"); }}
            onBlur={s}
            onCommit={v => cs({ raffinate_quality_rows: v, raffinate_quality_rows_seeded: "true" })}
          />
          <div className="border-t pt-3">
            <QualityRowsEditor
              title="Extract Quality"
              jsonValue={!shouldSeedRequirementRows(db.extract_quality_rows, db.extract_quality_rows_seeded) || !PRODUCT_REQUIREMENT_MASTER[db.feed_service ?? ""]
                ? (db.extract_quality_rows ?? "")
                : JSON.stringify(PRODUCT_REQUIREMENT_MASTER[db.feed_service ?? ""].extract)}
              legacyValue={db.extract_quality}
              onChange={v => { f("extract_quality_rows", v); f("extract_quality_rows_seeded", "true"); }}
              onBlur={s}
              onCommit={v => cs({ extract_quality_rows: v, extract_quality_rows_seeded: "true" })}
            />
          </div>
        </SectionCard>

        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <Info className="h-4 w-4 shrink-0" />
          These operating conditions become the common design basis for all downstream engineering modules.
          No calculations are performed in this section.
        </div>
      </div>
    );
  }

  function renderFluidProperties() {
    const fp = d("fluid_properties");
    const f = field("fluid_properties");
    const s = save("fluid_properties");
    const prop = (label: string, key: string) => (
      <div key={key}>
        <PropertyRow label={label} propKey={key} data={fp} onChange={f} onBlur={s} />
        {FLUID_PROPERTY_PROVENANCE[key] && (
          <p className="text-[11px] text-gray-400 px-2 -mt-0.5">{FLUID_PROPERTY_PROVENANCE[key]}</p>
        )}
        {["interfacial_tension", "nmp_solubility_rrbo", "oil_solubility_nmp"].includes(key) && (fp[`${key}_value`] ?? "").trim() === "" && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 mx-2 mt-0.5 inline-block">
            {PENDING_VALIDATION} — no approved NMP/RRBO two-phase value; enter laboratory/vendor data
          </p>
        )}
      </div>
    );
    const assumedCount = ["rrbo_density", "rrbo_viscosity_dynamic", "rrbo_viscosity_kinematic", "nmp_density", "nmp_viscosity_dynamic", "interfacial_tension", "nmp_solubility_rrbo", "oil_solubility_nmp"]
      .filter(k => fp[`${k}_source`] === "Assumed").length;
    return (
      <div className="max-w-4xl">
        {assumedCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-4">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <strong>{assumedCount} assumed value{assumedCount > 1 ? "s" : ""}</strong> — highlighted in amber below. Review before approving.
          </div>
        )}
        <div className="flex items-center gap-4 text-xs text-gray-400 px-2 mb-2">
          <span className="w-[180px]">Property</span>
          <span className="w-[110px]">Value</span>
          <span className="w-[90px]">Unit</span>
          <span className="w-[110px]">Ref. Temperature</span>
          <span className="w-[120px]">Source</span>
        </div>
        <SectionCard title="RRBO — Raffinate / Residual Base Oil">
          {prop("Density", "rrbo_density")}
          {prop("Dynamic Viscosity", "rrbo_viscosity_dynamic")}
          {prop("Kinematic Viscosity", "rrbo_viscosity_kinematic")}
          {prop("Temperature", "rrbo_temperature")}
          {prop("Water Content", "rrbo_water")}
          {prop("Colour (ASTM)", "rrbo_colour")}
          {prop("Sulphur Content", "rrbo_sulphur")}
          {prop("Asphaltenes", "rrbo_asphaltenes")}
        </SectionCard>
        <SectionCard title="NMP — N-Methyl-2-Pyrrolidone">
          {prop("Density", "nmp_density")}
          {prop("Dynamic Viscosity", "nmp_viscosity_dynamic")}
          {prop("Temperature", "nmp_temperature")}
          {prop("Purity", "nmp_purity")}
          {prop("Water Content", "nmp_water")}
        </SectionCard>
        <SectionCard title="Two-Phase Properties">
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 mb-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Thermopac Preliminary Screening Defaults @ {TWO_PHASE_SCREENING_REF_TEMP} °C — Source Type: Assumed · Source: {TWO_PHASE_SCREENING_SOURCE} · Status: Pending Laboratory Validation.
              These are NOT measured equilibrium data. The reference temperature stays at {TWO_PHASE_SCREENING_REF_TEMP} °C and is not corrected when the Operating Temperature
              {(d("design_basis").operating_temperature ?? "").trim() !== "" && (d("design_basis").operating_temperature ?? "").trim() !== TWO_PHASE_SCREENING_REF_TEMP
                ? ` (currently ${(d("design_basis").operating_temperature ?? "").trim()} °C)`
                : ""} changes — replace with temperature-dependent laboratory or vendor data.
            </span>
          </div>
          {prop("Interfacial Tension", "interfacial_tension")}
          {prop("NMP in RRBO-Rich Phase", "nmp_solubility_rrbo")}
          {prop("Oil/Extractables in NMP-Rich Phase", "oil_solubility_nmp")}
          {(fp.mutual_solubility_value ?? "").trim() !== "" && prop("Mutual Solubility (legacy)", "mutual_solubility")}
          <div className="grid grid-cols-[180px_1fr] gap-3 py-1.5">
            <span className="text-sm text-gray-700 font-medium">Phase Separation Time</span>
            <div className="flex gap-2">
              <Input value={fp.phase_separation_time ?? ""} onChange={e => f("phase_separation_time", e.target.value)} onBlur={s} placeholder="Value" className="h-7 text-xs flex-1" />
              <Input value={fp.phase_separation_time_unit ?? ""} onChange={e => f("phase_separation_time_unit", e.target.value)} onBlur={s} placeholder="Unit" className="h-7 text-xs w-[90px]" />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 px-2 -mt-0.5">
            {FLUID_PROPERTY_PROVENANCE.phase_separation_time}
            {(fp.phase_separation_time_source ?? "").trim() !== "" &&
              ` · Source: ${fp.phase_separation_time_source}${(fp.phase_separation_time_ref_temp ?? "").trim() !== "" ? ` @ ${fp.phase_separation_time_ref_temp}` : ""}`}
          </p>
          <TextAreaRow label="Emulsion Behaviour" value={fp.emulsion_behaviour ?? ""} onChange={v => f("emulsion_behaviour", v)} onBlur={s} rows={2} />
          <p className="text-[11px] text-gray-400 px-2 -mt-0.5">{FLUID_PROPERTY_PROVENANCE.emulsion_behaviour}</p>
        </SectionCard>
      </div>
    );
  }

  function renderProcessDesign() {
    const pd = d("process_design");
    const dbx = d("design_basis");
    const fp = d("fluid_properties");
    const f = field("process_design");
    const s = save("process_design");
    const cs = (u: Record<string, string>) => commitSection("process_design", u);
    const pdRun = runs.find(r => r.calculation_type === "process_design");
    const pdResult = (resultsQ.data ?? []).find((r: any) => r.section === "process_design");
    // Never present a stale accepted result as current: if the LATEST run was
    // blocked (error), the previous successful result is suppressed and only
    // the blocking validation issues are shown.
    const latestRunBlocked = pdRun?.calculation_status === "error";
    const rd: any = latestRunBlocked ? null : (pdResult?.data ?? null);

    // Effective inputs — approved defaults shown immediately, everything editable
    const otStr = (dbx.operating_temperature ?? "").trim();
    const opStr = (dbx.operating_pressure ?? "").trim();
    const ratioEff = (pd.so_ratio ?? "").trim() !== "" ? (pd.so_ratio as string) : SO_RATIO_DEFAULT;
    const stagesEff = (pd.theoretical_stages ?? "").trim() !== "" ? (pd.theoretical_stages as string) : THEORETICAL_STAGES_DEFAULT;
    const effEff = (pd.stage_efficiency ?? "").trim() !== "" ? (pd.stage_efficiency as string) : STAGE_EFFICIENCY_DEFAULT;
    const marginEff = (pd.design_margin ?? "").trim() !== "" ? (pd.design_margin as string) : DESIGN_MARGIN_DEFAULT;
    const extTEff = pd.extraction_temperature_manual === "true" ? (pd.extraction_temperature ?? "") : (otStr || (pd.extraction_temperature ?? ""));
    const extPEff = pd.extraction_pressure_manual === "true" ? (pd.extraction_pressure ?? "") : (opStr || (pd.extraction_pressure ?? ""));

    const effN = numOrNull(effEff);
    const effInvalid = effN !== null && (effN <= 0 || effN > 100);
    const stagesN = numOrNull(stagesEff);
    const stagesInvalid = stagesN !== null && (stagesN < 1 || !Number.isInteger(stagesN));

    // Solvent circulation display — definitions only (volume ratio × feed flow,
    // mass = volume × EPD NMP density, max = normal × (1 + margin)); the C2
    // engine remains the authority for the material balance itself.
    const feedLph = numOrNull(dbx.design_capacity_lph ?? dbx.design_capacity ?? dbx.feed_flow);
    const ratioN = numOrNull(ratioEff);
    const marginN = numOrNull(marginEff);
    const rhoNmp = numOrNull(fp.nmp_density_value) ?? (epdNmpQ.data?.density?.value != null ? Number(epdNmpQ.data.density.value) : null);
    const normLph = feedLph !== null && ratioN !== null && ratioN > 0 ? feedLph * ratioN : null;
    const normMass = normLph !== null && rhoNmp !== null ? (normLph / 1000) * rhoNmp : null;
    const maxLph = normLph !== null && marginN !== null && marginN >= 0 ? normLph * (1 + marginN / 100) : null;
    const maxMass = maxLph !== null && rhoNmp !== null ? (maxLph / 1000) * rhoNmp : null;
    const fmt = (v: number | null | undefined, dp = 0) =>
      v === null || v === undefined || !isFinite(v as number) ? null : (v as number).toLocaleString("en-IN", { maximumFractionDigits: dp });

    const statusLine = (text: string) => <p className="text-[11px] text-gray-400 px-2 -mt-0.5">{text}</p>;
    const calcRow = (label: string, value: string | null, unit: string, missing: string) => (
      <div className="grid grid-cols-[220px_1fr] items-center gap-3 py-1">
        <span className="text-sm text-gray-700 font-medium">{label}</span>
        {value !== null ? (
          <span className="font-mono text-sm text-blue-700 font-semibold">{value} {unit} <span className="ml-1 text-[10px] font-sans font-normal text-gray-400">Calculated</span></span>
        ) : (
          <span className="text-xs text-amber-700">Not Calculable — missing: {missing}</span>
        )}
      </div>
    );

    // Material-balance result presentation
    const engineName = pdRun?.engine_name ?? "llx-process-design";
    const engineVersion = pdResult?.engine_version ?? pdRun?.engine_version;
    const runStatusRaw: string = rd?.calculationRunStatus ?? pdRun?.calculation_status ?? "";
    const runWarnings: { code?: string; message: string }[] = Array.isArray(pdRun?.warnings) ? pdRun!.warnings! : [];
    const missingInputs: string[] = Array.from(new Set([
      ...(rd?.normalCase?.yields?.missingInputs ?? []),
      ...(rd?.normalCase?.componentBalance?.missingInputs ?? []),
      ...(rd?.maximumCase?.componentBalance?.missingInputs ?? []),
    ]));
    const gross = rd?.normalCase?.grossInletBalance;
    const flows = rd?.flows;
    const yields = rd?.normalCase?.yields;
    const closure = rd?.normalCase?.componentBalance?.closure;
    const pct = (v: unknown) => (typeof v === "number" && isFinite(v) ? (v * 100).toFixed(2) : null);

    const resultCard = (label: string, value: string | null, unit: string, formulaRef: string, source: string, classification?: string) => (
      <div className="border rounded-lg p-3 bg-gray-50">
        <div className="flex items-center justify-between mb-1 gap-2">
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          {value !== null ? (
            <span className="font-mono text-blue-700 text-sm font-bold whitespace-nowrap">{value}{unit ? ` ${unit}` : ""}</span>
          ) : (
            <span className="text-xs text-amber-700 font-medium whitespace-nowrap">{rd ? "Pending Validation" : "Not run"}</span>
          )}
        </div>
        <p className="text-xs text-gray-500">Ref: {formulaRef}</p>
        <p className="text-xs text-gray-400">Source: {source}</p>
        {classification && <p className={`text-[11px] mt-0.5 ${classification === "Pending Validation" ? "text-amber-600" : "text-gray-400"}`}>Status: {classification}</p>}
        <p className="text-[11px] text-gray-300">Engine: {engineName}{engineVersion ? ` v${engineVersion}` : ""}</p>
      </div>
    );

    return (
      <div className="max-w-3xl">
        <SectionCard title="Process Inputs">
          <SelectRow
            label="Solvent / Oil Ratio"
            value={ratioEff}
            onChange={v => f("so_ratio", v)}
            onCommit={v => cs({ so_ratio: v, so_ratio_manual: v === SO_RATIO_DEFAULT ? "" : "true" })}
            options={SO_RATIO_OPTIONS}
            unit=": 1 (vol/vol)"
          />
          {statusLine(`Status: ${pd.so_ratio_manual === "true" ? "Manual" : "Auto-Populated"} · Basis: NMP solvent volume flow / RRBO feed volume flow · Rule: default ${SO_RATIO_DEFAULT} : 1`)}

          <FieldRow
            label="Extraction Temperature"
            value={extTEff}
            onChange={v => f("extraction_temperature", v)}
            onBlur={() => {
              const v = (pd.extraction_temperature ?? "").trim();
              cs({ extraction_temperature: v || otStr, extraction_temperature_manual: v !== "" && v !== otStr ? "true" : "" });
            }}
            unit="°C"
          />
          {statusLine(`Status: ${pd.extraction_temperature_manual === "true" ? "Manual" : "Auto-Populated"} · Rule: follows Design Basis Operating Temperature (${otStr || "—"} °C) until manually changed`)}

          <FieldRow
            label="Extraction Pressure"
            value={extPEff}
            onChange={v => f("extraction_pressure", v)}
            onBlur={() => {
              const v = (pd.extraction_pressure ?? "").trim();
              cs({ extraction_pressure: v || opStr, extraction_pressure_manual: v !== "" && v !== opStr ? "true" : "" });
            }}
            unit="bar g"
          />
          {statusLine(`Status: ${pd.extraction_pressure_manual === "true" ? "Manual" : "Auto-Populated"} · Rule: follows Design Basis Operating Pressure (${opStr || "—"} bar g) until manually changed`)}

          <FieldRow label="Theoretical Stages" value={stagesEff} onChange={v => f("theoretical_stages", v)} onBlur={s} unit="stages" />
          {stagesInvalid && <p className="text-xs text-red-600 px-2 -mt-0.5">Theoretical stages must be a whole number ≥ 1.</p>}
          {statusLine(`Status: ${(pd.theoretical_stages ?? "").trim() !== "" && pd.theoretical_stages !== THEORETICAL_STAGES_DEFAULT ? "Manual" : "Auto-Populated"} · Rule: default ${THEORETICAL_STAGES_DEFAULT} stages`)}

          <FieldRow label="Stage Efficiency" value={effEff} onChange={v => f("stage_efficiency", v)} onBlur={s} unit="%" />
          {effInvalid && <p className="text-xs text-red-600 px-2 -mt-0.5">Stage efficiency must be greater than 0 % and not more than 100 %.</p>}
          {statusLine(`Status: ${(pd.stage_efficiency ?? "").trim() !== "" && pd.stage_efficiency !== STAGE_EFFICIENCY_DEFAULT ? "Manual" : "Auto-Populated"} · Rule: default ${STAGE_EFFICIENCY_DEFAULT} %`)}

          <FieldRow label="Design Margin" value={marginEff} onChange={v => f("design_margin", v)} onBlur={s} unit="%" />
          {statusLine(`Status: ${(pd.design_margin ?? "").trim() !== "" && pd.design_margin !== DESIGN_MARGIN_DEFAULT ? "Manual" : "Auto-Populated"} · Rule: default ${DESIGN_MARGIN_DEFAULT} % · applied to Normal Solvent Circulation to give Maximum Solvent Circulation`)}

          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Phase Configuration</label>
            <select
              value={pd.phase_configuration ?? ""}
              onChange={e => cs({ phase_configuration: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="">Select…</option>
              {PHASE_CONFIG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span />
          </div>
          {statusLine("Status: Manual · Engineer selection required by the C2 engine — phase continuity is never assumed from density")}

          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Interface Control</label>
            <select
              value={pd.interface_control ?? INTERFACE_CONTROL_DEFAULT}
              onChange={e => cs({ interface_control: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              {INTERFACE_CONTROL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span />
          </div>
          {statusLine(`Status: ${(pd.interface_control ?? "").trim() !== "" && pd.interface_control !== INTERFACE_CONTROL_DEFAULT ? "Manual" : "Auto-Populated"} · Default: Interphase Level Control · Stored with Process Design data for Instrumentation, Control and P&ID modules`)}
        </SectionCard>

        <SectionCard title="Component Balance Assumptions">
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 mb-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Thermopac Preliminary Screening Defaults — Source Type: Assumed · Pending Laboratory Validation.
              These are component-balance assumptions for the C2 engine; the Raffinate/Extract Yield product
              requirements are design targets and are never substituted for these splits.
            </span>
          </div>
          {COMPONENT_BALANCE_FIELDS.map(cb => {
            const val = (pd[cb.key] ?? "").trim();
            return (
              <div key={cb.key}>
                <FieldRow label={cb.label} value={val !== "" ? (pd[cb.key] as string) : cb.def} onChange={v => f(cb.key, v)} onBlur={s} unit="%" />
                {statusLine(`Status: ${val !== "" && val !== cb.def ? "Manual" : "Auto-Populated"} · Default ${cb.def} % · Source: Thermopac Preliminary Screening Default (Assumed) · Engine input ${cb.engineKey}`)}
              </div>
            );
          })}
        </SectionCard>

        <SectionCard title="Solvent Circulation Rate">
          {calcRow("Normal Solvent Flow", fmt(normLph), "LPH", [feedLph === null ? "Feed Flow (Design Basis)" : "", ratioN === null || ratioN <= 0 ? "Solvent/Oil Ratio" : ""].filter(Boolean).join(", ") || "—")}
          {calcRow("Normal Solvent Mass Flow", fmt(normMass), "kg/h", normLph === null ? "Normal Solvent Flow" : "NMP density (EPD, at Operating Temperature)")}
          {calcRow("Maximum Solvent Flow", fmt(maxLph), "LPH", normLph === null ? "Normal Solvent Flow" : "Design Margin")}
          {calcRow("Maximum Solvent Mass Flow", fmt(maxMass), "kg/h", maxLph === null ? "Maximum Solvent Flow" : "NMP density (EPD, at Operating Temperature)")}
          <p className="text-[11px] text-gray-400 px-2 mt-1">
            Solvent Volumetric Flow = Feed Volumetric Flow ({fmt(feedLph) ?? "—"} LPH) × Solvent/Oil Ratio ({ratioEff} : 1) · Maximum = Normal × (1 + {marginEff} %) · Mass flows use NMP density {rhoNmp !== null ? `${fmt(rhoNmp, 1)} kg/m³` : "(EPD pending)"} from EPD
          </p>
        </SectionCard>

        <div className="flex items-center gap-3 mb-4">
          <Button
            size="sm"
            className="gap-2"
            disabled={isFrozen || calculateMutation.isPending}
            onClick={() => calculateMutation.mutate("process_design")}
          >
            <Play className="h-3.5 w-3.5" />
            {calculateMutation.isPending ? "Calculating…" : "Run Material Balance"}
          </Button>
          {pdRun && (
            <span className="text-xs text-gray-400">
              Last run: {new Date(pdRun.calculated_at).toLocaleString()} · {engineName} v{pdRun.engine_version} · {pdRun.calculation_status}
            </span>
          )}
        </div>

        <SectionCard title="Material Balance Results">
          {rd ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {resultCard("Gross Material Balance (Feed + Solvent)", fmt(gross?.totalInletMassFlow, 1), gross?.unit ?? "kg/h", "C2 PD-006 — gross inlet balance F + S", "C2 Process Design Engine", gross?.classification)}
                {resultCard("Solvent Balance (Normal NMP Mass Flow)", fmt(flows?.normalSolventMassFlow, 1), "kg/h", "C2 PD-002/PD-003 — solvent basis", "C2 Process Design Engine", gross?.classification)}
                {resultCard("Raffinate Yield (solvent-free)", pct(yields?.solventFreeRaffinateYield), "%", "C2 PD-007 — solvent-free raffinate / feed", "C2 Process Design Engine", yields?.classification)}
                {resultCard("Extract Yield (gross extract / feed)", pct(yields?.grossExtractToFeedRatio), "%", "C2 PD-007 — gross extract stream / feed", "C2 Process Design Engine", yields?.classification)}
                {resultCard("Normal Solvent Circulation", fmt(typeof flows?.normalSolventVolumetricFlow === "number" ? flows.normalSolventVolumetricFlow * 1000 : null), "LPH", "C2 PD-002 — normal case", "C2 Process Design Engine", gross?.classification)}
                {resultCard("Maximum Solvent Circulation", fmt(typeof flows?.maximumSolventVolumetricFlow === "number" ? flows.maximumSolventVolumetricFlow * 1000 : null), "LPH", `C2 PD-004 — normal × max-circulation factor ${flows?.maxCirculationFactor ?? ""}`, "C2 Process Design Engine", gross?.classification)}
                {resultCard("Material-Balance Closure", closure ? `${(closure.relative * 100).toExponential(2)}` : null, "%", "C2 PD-006 — |in − out| / in", "C2 Process Design Engine", rd?.normalCase?.componentBalance?.classification)}
                {resultCard("Validation Status", runStatusRaw ? (runStatusRaw === "screening_complete" ? "Screening Complete" : runStatusRaw === "pending_validation" ? "Pending Validation" : runStatusRaw) : null, "", "Overall C2 run status", "C2 Process Design Engine")}
              </div>
              {missingInputs.length > 0 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-semibold text-amber-800 mb-1">Missing validation inputs (component balance is Pending Validation — no values assumed):</p>
                  <p className="text-xs text-amber-700">{missingInputs.join(", ")}</p>
                </div>
              )}
              {runWarnings.length > 0 && (
                <div className="mt-3 p-3 bg-gray-50 border rounded-lg">
                  <p className="text-xs font-semibold text-gray-700 mb-1">Engine warnings</p>
                  {runWarnings.map((w, i) => (
                    <p key={i} className="text-xs text-gray-600">{w.code ? `[${w.code}] ` : ""}{w.message}</p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400 italic">
              {pdRun && pdRun.calculation_status === "error"
                ? "Last run was blocked — required upstream inputs are missing. Complete the Design Basis and Fluid Properties, then re-run."
                : "Run material balance to see results"}
            </p>
          )}
          {pdRun?.calculation_status === "error" && Array.isArray(pdRun.validation_issues) && pdRun.validation_issues.length > 0 && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs font-semibold text-red-800 mb-1">Blocking validation issues</p>
              {pdRun.validation_issues.map((v, i) => (
                <p key={i} className="text-xs text-red-700">{v.field ? `${v.field}: ` : ""}{v.message}</p>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  function renderHydraulicDesign() {
    const hd = d("hydraulic_design");
    const f = field("hydraulic_design");
    const s = save("hydraulic_design");
    const hydRun = runs.find(r => r.calculation_type === "hydraulics_common" && r.calculation_status === "success");
    // Total Volumetric Flow — binding only: Feed Flow + Normal Solvent Flow
    // (both already established in Design Basis / Process Design).
    const dbx = d("design_basis");
    const pdx = d("process_design");
    const hydFeedLph = numOrNull(dbx.design_capacity_lph ?? dbx.design_capacity ?? dbx.feed_flow);
    const hydRatio = numOrNull((pdx.so_ratio ?? "").trim() !== "" ? pdx.so_ratio : SO_RATIO_DEFAULT);
    const hydTotalLph = hydFeedLph !== null && hydRatio !== null ? hydFeedLph * (1 + hydRatio) : null;
    const hydTotalM3h = hydTotalLph !== null ? hydTotalLph / 1000 : null;
    const totalFlowOverride = (hd.total_flow ?? "").trim();
    const fmt = (v: number | null | undefined, dp = 0) =>
      v === null || v === undefined || !isFinite(v) ? "—" : v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
    const statusLine = (text: string) => <p className="text-[11px] text-gray-400 px-2 -mt-0.5">{text}</p>;
    // Trial diameter auto-initialization: engine-computed minimum feasible
    // diameter from the latest hydraulic sizing sweep (never computed here).
    const hydResData = (resultsQ.data ?? []).find((r: any) => r.section === "hydraulics_common")?.data;
    const hydNormal = hydResData?.normalCase ?? hydResData?.cases?.normal;
    const minFeasibleD = numOrNull(String(hydNormal?.summary?.minimumFeasibleDiameter_m ?? ""));
    return (
      <div className="max-w-3xl">
        <SectionCard title="Hydraulic Inputs">
          <FieldRow
            label="Column Diameter (trial)"
            value={(hd.column_diameter ?? "").trim() !== "" ? (hd.column_diameter as string) : (minFeasibleD !== null ? String(minFeasibleD) : "")}
            onChange={v => f("column_diameter", v)}
            onBlur={s}
            unit="m"
            placeholder="Auto-sizes from the hydraulic screening sweep on first run"
          />
          {statusLine((hd.column_diameter ?? "").trim() !== ""
            ? "Status: Manual · Engineer-selected trial diameter — evaluated within the screening sweep"
            : minFeasibleD !== null
              ? `Status: Auto-Populated · Minimum feasible diameter ${minFeasibleD} m from the Common Hydraulic sizing sweep (0.3–2.0 m) · Source: Common Hydraulic Design Engine — engineer may override before re-running`
              : "Status: Auto-Populated · Rule: first Run Common Hydraulics sizes the column via the screening sweep 0.3–2.0 m (0.05 m step) using the d32 screening basis below; the minimum feasible diameter then appears here")}
          <FieldRow label="Continuous Phase Density" value={hd.cont_density ?? d("fluid_properties").nmp_density_value ?? ""} onChange={v => f("cont_density", v)} onBlur={s} unit="kg/m³" note="Auto-filled from Fluid Properties" />
          <FieldRow label="Dispersed Phase Density" value={hd.disp_density ?? d("fluid_properties").rrbo_density_value ?? ""} onChange={v => f("disp_density", v)} onBlur={s} unit="kg/m³" />
          <FieldRow label="Continuous Phase Viscosity" value={hd.cont_viscosity ?? d("fluid_properties").nmp_viscosity_dynamic_value ?? ""} onChange={v => f("cont_viscosity", v)} onBlur={s} unit="mPa·s" />
          <FieldRow label="Dispersed Phase Viscosity" value={hd.disp_viscosity ?? d("fluid_properties").rrbo_viscosity_dynamic_value ?? ""} onChange={v => f("disp_viscosity", v)} onBlur={s} unit="mPa·s" />
          <FieldRow label="Interfacial Tension" value={hd.interfacial_tension ?? d("fluid_properties").interfacial_tension_value ?? ""} onChange={v => f("interfacial_tension", v)} onBlur={s} unit="mN/m" />
          <FieldRow
            label="Total Volumetric Flow"
            value={totalFlowOverride !== "" ? (hd.total_flow as string) : (hydTotalM3h !== null ? String(Math.round(hydTotalM3h * 100) / 100) : "")}
            onChange={v => f("total_flow", v)}
            onBlur={s}
            unit="m³/h"
          />
          {statusLine(totalFlowOverride !== "" && numOrNull(totalFlowOverride) !== hydTotalM3h
            ? "Status: Manual · Engineer override"
            : `Status: Auto-Populated · Rule: Feed Flow (${hydFeedLph !== null ? fmt(hydFeedLph) : "—"} LPH) + Normal Solvent Flow (${hydFeedLph !== null && hydRatio !== null ? fmt(hydFeedLph * hydRatio) : "—"} LPH) = ${hydTotalLph !== null ? fmt(hydTotalLph) : "—"} LPH = ${hydTotalM3h !== null ? fmt(hydTotalM3h, 1) : "—"} m³/h · Source: Process Design / Design Basis`)}
          <FieldRow label="Flooding Margin Design" value={hd.flooding_margin_design ?? "70"} onChange={v => f("flooding_margin_design", v)} onBlur={s} unit="%" />
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Hydraulic Model</label>
            <select
              value={hd.hydraulic_model ?? "d32_terminal"}
              onChange={e => commitSection("hydraulic_design", { hydraulic_model: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="d32_terminal">Sauter Mean Diameter (d32) / Terminal Velocity (Default)</option>
              <option value="characteristic_velocity">Characteristic Velocity + Hindrance Exponent</option>
            </select>
            <span />
          </div>
          {statusLine(`Status: ${(hd.hydraulic_model ?? "d32_terminal") === "d32_terminal" ? "Auto-Populated · Default LLX screening method" : "Manual · Engineer-selected hydraulic model"}`)}
          {(hd.hydraulic_model ?? "d32_terminal") === "d32_terminal" ? (
            <>
              <FieldRow label="Sauter Mean Diameter d32 (screening)" value={hd.sauter_mean_d32 ?? "1.5"} onChange={v => f("sauter_mean_d32", v)} onBlur={s} unit="mm" />
              {statusLine(`Status: ${(hd.sauter_mean_d32 ?? "").trim() !== "" && hd.sauter_mean_d32 !== "1.5" ? "Manual" : "Auto-Populated"} · Default 1.5 mm · Source: Thermopac Preliminary Screening Default (Assumed) · terminal velocity used as characteristic velocity`)}
            </>
          ) : (
            <>
              <FieldRow label="Characteristic Velocity" value={hd.characteristic_velocity ?? ""} onChange={v => f("characteristic_velocity", v)} onBlur={s} unit="m/s" />
              {statusLine("Status: Manual · Engineer-entered characteristic velocity — pending laboratory validation")}
              <FieldRow label="Hindrance Exponent n" value={hd.hindrance_exponent ?? "1"} onChange={v => f("hindrance_exponent", v)} onBlur={s} unit="—" />
              {statusLine(`Status: ${(hd.hindrance_exponent ?? "").trim() !== "" && hd.hindrance_exponent !== "1" ? "Manual" : "Auto-Populated"} · Default n = 1 (explicit Assumed entry — not a universal relationship) · Pending Laboratory Validation`)}
            </>
          )}
        </SectionCard>

        <div className="flex items-center gap-3 mb-4">
          <Button
            size="sm"
            className="gap-2"
            disabled={isFrozen || calculateMutation.isPending}
            onClick={() => calculateMutation.mutate("hydraulics_common")}
          >
            <Play className="h-3.5 w-3.5" />
            {calculateMutation.isPending ? "Calculating…" : "Run Common Hydraulics"}
          </Button>
          {hydRun && <span className="text-xs text-gray-400">Last run: {new Date(hydRun.calculated_at).toLocaleString()} · Engine v{hydRun.engine_version}</span>}
        </div>

        <SectionCard title="Hydraulic Calculation Results">
          <div className="grid grid-cols-2 gap-3">
            <CalcResultCard label="Column Diameter" formula="D = √(4Q / π·u_f·FM)" unit="m" reference="Thornton (1956)" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Cross-Sectional Area" formula="A = π·D²/4" unit="m²" reference="Geometry" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Superficial Velocity (cont.)" formula="u_c = Q_c / A" unit="m/s" reference="Definition" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Superficial Velocity (disp.)" formula="u_d = Q_d / A" unit="m/s" reference="Definition" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Droplet Diameter" formula="d = C·σ^0.5 / (Δρ·g)^0.5" unit="mm" reference="Lapidus & Elgin" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Terminal Velocity" formula="u_t = √(4·d·Δρ·g / 3·C_D·ρ_c)" unit="m/s" reference="Stokes / Intermediate" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Reynolds Number" formula="Re = ρ_c·u_t·d / μ_c" unit="—" reference="Dimensionless" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Weber Number" formula="We = ρ_c·u_t²·d / σ" unit="—" reference="Dimensionless" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Froude Number" formula="Fr = u_t / √(g·d)" unit="—" reference="Dimensionless" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Drag Coefficient" formula="C_D = 24/Re + 6/(1+√Re) + 0.4" unit="—" reference="Schiller-Naumann" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Operating Holdup" formula="φ = u_d / (u_d + u_c·(1-φ)^n)" unit="—" reference="Seader & Henley" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Flooding Velocity" formula="u_f = u_t·(1-φ_f)^n" unit="m/s" reference="Thornton (1956)" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Flooding Margin" formula="FM = (u_c+u_d) / u_f × 100" unit="%" reference="Design criterion < 80 %" engineVersion={hydRun?.engine_version} />
            <CalcResultCard label="Interfacial Area" formula="a = 6·φ / d" unit="m²/m³" reference="Bubble/drop model" engineVersion={hydRun?.engine_version} />
          </div>
          {!hydRun && <p className="text-xs text-gray-400 italic mt-2">Run hydraulics calculation to populate results</p>}
        </SectionCard>
      </div>
    );
  }

  function renderTechnologySelection() {
    const ts = d("technology_selection");
    const f = field("technology_selection");
    const s = save("technology_selection");
    const options = [
      { value: "ecp", label: "ECP — Packed Extraction Column", desc: "Static packing, no moving parts, low maintenance" },
      { value: "ecr", label: "ECR — Kühni Agitated Column", desc: "Rotating agitator, higher stage efficiency, adjustable" },
      { value: "both", label: "Compare Both — ECP and ECR", desc: "Design both technologies for side-by-side comparison" },
    ];
    return (
      <div className="max-w-2xl">
        <SectionCard title="Technology Selection">
          <p className="text-sm text-gray-500 mb-4">
            Select the extraction technology to design. Changing technology will never re-run upstream hydraulic calculations — only the equipment-specific design steps will change.
          </p>
          <div className="space-y-3">
            {options.map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  ts.technology === opt.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="technology"
                  value={opt.value}
                  checked={ts.technology === opt.value}
                  onChange={() => { f("technology", opt.value); s(); }}
                  className="mt-0.5"
                  disabled={isFrozen}
                />
                <div>
                  <p className="font-semibold text-gray-900">{opt.label}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
          {!ts.technology && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mt-4">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Technology must be selected before Equipment Design can proceed.
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  function equipmentCarryOver() {
    // Stage 5 / Stage 3 / Stage 4 carry-over — bindings only, no calculations
    const hd = d("hydraulic_design");
    const fp = d("fluid_properties");
    const dbx = d("design_basis");
    const pdx = d("process_design");
    const feedLph = numOrNull(dbx.design_capacity_lph ?? dbx.design_capacity ?? dbx.feed_flow);
    const ratio = numOrNull((pdx.so_ratio ?? "").trim() !== "" ? pdx.so_ratio : SO_RATIO_DEFAULT);
    const margin = numOrNull(pdx.design_margin) ?? 20;
    const totalLph = feedLph !== null && ratio !== null ? feedLph * (1 + ratio) : null;
    const hydResData = (resultsQ.data ?? []).find((r: any) => r.section === "hydraulics_common")?.data;
    const hydNormal = hydResData?.normalCase ?? hydResData?.cases?.normal;
    const minFeasibleD = numOrNull(String(hydNormal?.summary?.minimumFeasibleDiameter_m ?? ""));
    const diameter = (hd.column_diameter ?? "").trim() !== "" ? numOrNull(hd.column_diameter) : minFeasibleD;
    const diameterSource = (hd.column_diameter ?? "").trim() !== ""
      ? "Stage 5 — engineer-selected trial diameter"
      : minFeasibleD !== null ? "Stage 5 — Common Hydraulic sizing sweep (minimum feasible diameter)" : "Stage 5 — pending Common Hydraulic run";
    return {
      diameter, diameterSource,
      totalLph, totalM3h: totalLph !== null ? totalLph / 1000 : null,
      contDensity: hd.cont_density ?? fp.nmp_density_value ?? "",
      dispDensity: hd.disp_density ?? fp.rrbo_density_value ?? "",
      contViscosity: hd.cont_viscosity ?? fp.nmp_viscosity_dynamic_value ?? "",
      dispViscosity: hd.disp_viscosity ?? fp.rrbo_viscosity_dynamic_value ?? "",
      ift: hd.interfacial_tension ?? fp.interfacial_tension_value ?? "",
      phaseConfig: (pdx.phase_configuration ?? "").trim() || "—",
      normalSolventLph: feedLph !== null && ratio !== null ? feedLph * ratio : null,
      maxSolventLph: feedLph !== null && ratio !== null ? feedLph * ratio * (1 + margin / 100) : null,
      feedLph,
    };
  }

  function renderCarryOverCard(co: ReturnType<typeof equipmentCarryOver>) {
    const row = (label: string, value: string, source: string) => (
      <div className="grid grid-cols-[180px_1fr] gap-2 py-1 border-b border-gray-50 last:border-0">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs">
          <span className="font-medium text-gray-800">{value}</span>
          <span className="block text-[10px] text-gray-400">Auto-Populated · Source: {source}</span>
        </span>
      </div>
    );
    return (
      <SectionCard title="Carry-Over from Common Hydraulic Design (Stage 5)">
        {row("Column Diameter", co.diameter !== null ? `${co.diameter} m` : "— (run Stage 5)", co.diameterSource)}
        {row("Total Volumetric Flow", co.totalLph !== null ? `${co.totalLph.toLocaleString("en-IN")} LPH = ${(co.totalM3h as number).toFixed(1)} m³/h` : "—", "Stage 5 — Feed + Normal Solvent Flow")}
        {row("Continuous Phase Density", co.contDensity ? `${co.contDensity} kg/m³` : "—", "Stage 3 — Fluid Properties (NMP)")}
        {row("Dispersed Phase Density", co.dispDensity ? `${co.dispDensity} kg/m³` : "—", "Stage 3 — Fluid Properties (RRBO)")}
        {row("Continuous Phase Viscosity", co.contViscosity ? `${co.contViscosity} mPa·s` : "—", "Stage 3 — Fluid Properties (NMP)")}
        {row("Dispersed Phase Viscosity", co.dispViscosity ? `${co.dispViscosity} mPa·s` : "—", "Stage 3 — Fluid Properties (RRBO)")}
        {row("Interfacial Tension", co.ift ? `${co.ift} mN/m` : "—", "Stage 3 — Two-Phase Properties")}
        {row("Phase Configuration", co.phaseConfig, "Stage 4 — Process Design")}
        {row("Normal Case Flows", co.feedLph !== null && co.normalSolventLph !== null ? `Feed ${co.feedLph.toLocaleString("en-IN")} LPH · Solvent ${co.normalSolventLph.toLocaleString("en-IN")} LPH` : "—", "Stage 2/4 — Design Basis + S/O ratio")}
        {row("Maximum Case Flows", co.feedLph !== null && co.maxSolventLph !== null ? `Feed ${co.feedLph.toLocaleString("en-IN")} LPH · Solvent ${co.maxSolventLph.toLocaleString("en-IN")} LPH` : "—", "Stage 4 — Design Margin rule")}
        <p className="text-[10px] text-gray-400 mt-2">These values remain owned by their source stages — override them there, not here. The equipment engines receive them traceably through the workspace mapper.</p>
      </SectionCard>
    );
  }

  function renderEquipmentDesign() {
    if (!techSelection) {
      return (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Complete Technology Selection (Step 6) before designing equipment. Stage 7 is blocked until a technology (ECP, ECR, or Compare Both) is selected.
        </div>
      );
    }
    const co = equipmentCarryOver();
    return (
      <div className="max-w-5xl space-y-6">
        {renderCarryOverCard(co)}
        <div className={techSelection === "both" ? "grid grid-cols-2 gap-6" : ""}>
          {showECP && renderECPDesign()}
          {showECR && renderECRDesign()}
        </div>
      </div>
    );
  }

  function renderSulzerScreening(f: (k: string, v: string) => void, s: () => void, ec: Record<string, any>) {
    const scr = sulzerQ.data;
    const err = (sulzerQ.error as any)?.message;
    const fmtB = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
    const confColor = (c: string) =>
      c === "High Confidence" ? "text-green-700 bg-green-50 border-green-200"
      : c === "Medium Confidence" ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-red-700 bg-red-50 border-red-200";
    const critCell = (c: any) => (
      <span
        className={c.status === "Good Agreement" ? "text-green-700" : c.status === "Feasible — Review Recommended" ? "text-amber-700" : "text-red-700"}
        title={c.note}
      >
        {c.status}
      </span>
    );
    const famRow = (fam: any) => {
      const sel = fam.perDiameter.find((d: any) => d.isSelectedTrial) ?? fam.perDiameter[0];
      return (
        <tr key={fam.record.family} className="border-b border-gray-100 align-top">
          <td className="py-1.5 pr-2 font-medium text-gray-800">Sulzer {fam.record.family}<span className="block text-[10px] text-gray-400 font-normal">{fam.record.packingCategory}</span></td>
          <td className="py-1.5 pr-2">{sel ? `${fmtB(sel.normalSpecificThroughput_m3_m2h)}` : "—"}</td>
          <td className="py-1.5 pr-2">{sel ? `${fmtB(sel.maximumSpecificThroughput_m3_m2h)}` : "—"}</td>
          <td className="py-1.5 pr-2">{fam.record.typicalSpecificThroughput.min}–{fam.record.typicalSpecificThroughput.max}<span className="block text-[10px] text-gray-400">typical, not a limit</span></td>
          <td className="py-1.5 pr-2">{fam.hydraulicLoading.classification}<span className="block text-[10px] text-gray-400">{critCell(fam.hydraulicLoading)}</span></td>
          <td className="py-1.5 pr-2">{critCell(fam.stageCompatibility)}<span className="block text-[10px] text-gray-400">≤ {fam.record.preliminaryStageRange.maxNTS} NTS</span></td>
          <td className="py-1.5 pr-2">{critCell(fam.phaseRatioCompatibility)}<span className="block text-[10px] text-gray-400">{fam.record.phaseRatioRule}</span></td>
          <td className="py-1.5 pr-2">{critCell(fam.backMixingSuitability)}</td>
          <td className="py-1.5 pr-2">{fam.record.typicalNumberOfBeds}</td>
          <td className="py-1.5 pr-2">{fam.record.capacityClassification}</td>
          <td className="py-1.5 pr-2"><span className={`inline-block px-1.5 py-0.5 rounded border text-[11px] font-medium ${confColor(fam.confidence)}`}>{fam.confidence}</span></td>
          <td className="py-1.5 text-[10px] text-gray-400">{fam.record.sourceReference}</td>
        </tr>
      );
    };
    return (
      <SectionCard title="Sulzer SMV / SMVP — Preliminary Packing Screening (literature-based)">
        <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3 mb-2">
          <label className="text-sm text-gray-700 font-medium pt-1.5">Back-Mixing Risk</label>
          <select
            value={ec.backmixing_risk ?? "moderate"}
            onChange={e => commitSection("ecp_design", { backmixing_risk: e.target.value })}
            disabled={isFrozen}
            className="h-8 text-sm border rounded-md px-2 bg-white"
          >
            <option value="low">Low</option>
            <option value="moderate">Moderate (default)</option>
            <option value="high">High</option>
          </select>
          <Button size="sm" variant="outline" className="h-8" onClick={() => sulzerQ.refetch()}>Refresh Screening</Button>
        </div>
        {err && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">{err}</p>}
        {scr && (
          <>
            <p className="text-[11px] text-gray-500 mb-1">
              Selection is by specific liquid loading B = Total Volumetric Flow / Column Cross-Sectional Area [m³/(m²·h)] per Stage 5 trial diameter — never by total plant flow alone.
              Normal Total Flow {fmtB(scr.input.normalTotalFlow_m3_h)} m³/h · Maximum Total Flow {fmtB(scr.input.maximumTotalFlow_m3_h)} m³/h · NTS {scr.input.theoreticalStages} · S/O (vol) {scr.input.phaseRatioVolumetric}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-200">
                    <th className="py-1 pr-2">Packing Family</th>
                    <th className="py-1 pr-2">B Normal<br/>m³/(m²·h)</th>
                    <th className="py-1 pr-2">B Maximum<br/>m³/(m²·h)</th>
                    <th className="py-1 pr-2">Typical Published Range</th>
                    <th className="py-1 pr-2">Hydraulic Loading</th>
                    <th className="py-1 pr-2">Stage Compat.</th>
                    <th className="py-1 pr-2">Phase-Ratio Compat.</th>
                    <th className="py-1 pr-2">Back-Mixing</th>
                    <th className="py-1 pr-2">Beds</th>
                    <th className="py-1 pr-2">Capacity Class</th>
                    <th className="py-1 pr-2">Screening Confidence</th>
                    <th className="py-1">Source</th>
                  </tr>
                </thead>
                <tbody>{famRow(scr.smv)}{famRow(scr.smvp)}</tbody>
              </table>
            </div>
            <div className="mt-2 grid md:grid-cols-2 gap-2">
              {[scr.smv, scr.smvp].map((fam: any) => (
                <div key={fam.record.family} className="border border-gray-200 rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-800">Sulzer {fam.record.family}</p>
                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[11px] font-medium ${confColor(fam.confidence)}`}>{fam.confidence}</span>
                  </div>
                  <p className="text-[11px] text-gray-700"><span className="font-medium">Hydraulic Loading:</span> {fam.hydraulicLoading.classification}</p>
                  <p className="text-[11px] text-gray-600">{fam.hydraulicLoading.note}</p>
                  <p className="text-[11px] text-gray-600"><span className="font-medium text-gray-700">Comment:</span> {fam.confidenceComment}</p>
                  <p className="text-[10px] text-gray-400">{fam.recommendationBasis}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-gray-600">Specific throughput per Stage 5 trial diameter (normal / maximum):</p>
              <div className="flex flex-wrap gap-1.5">
                {scr.loadings.map((l: any) => (
                  <span key={l.diameter_m} className={`text-[10px] px-2 py-0.5 rounded-full border ${l.isSelectedTrial ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-200 bg-gray-50 text-gray-600"}`}>
                    D {l.diameter_m} m → {fmtB(l.normalSpecificThroughput_m3_m2h)} / {fmtB(l.maximumSpecificThroughput_m3_m2h)}{l.isSelectedTrial ? " · trial" : ""}
                  </span>
                ))}
              </div>
              <p className="text-xs font-semibold text-gray-800 mt-1">{scr.overallVerdict}</p>
              <p className="text-[11px] text-gray-600">{scr.verdictNote}</p>
              <p className="text-[10px] text-gray-400">{scr.governanceNote}</p>
            </div>
          </>
        )}
        {!scr && !err && <p className="text-xs text-gray-400">Loading screening…</p>}
      </SectionCard>
    );
  }

  function renderRunIssues(latestRun: any, label: string) {
    if (!latestRun) return null;
    const issues = Array.isArray(latestRun.validation_issues) ? latestRun.validation_issues : [];
    const warns = Array.isArray(latestRun.warnings) ? latestRun.warnings : [];
    return (
      <div className="mt-2 space-y-2">
        <p className="text-[11px] text-gray-500">
          Last run: {new Date(latestRun.calculated_at).toLocaleString()} · {latestRun.engine_name} v{latestRun.engine_version} · {latestRun.calculation_status}
        </p>
        {latestRun.calculation_status === "error" && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-semibold text-red-800 mb-1">
              {label} run blocked — the engine reported {issues.length} missing/invalid mandatory input{issues.length === 1 ? "" : "s"}. No results were generated; nothing is defaulted silently.
            </p>
            <ul className="space-y-0.5">
              {issues.map((v: any, i: number) => (
                <li key={i} className="text-[11px] text-red-700"><span className="font-medium">{v.field ?? "input"}:</span> {v.message}</li>
              ))}
            </ul>
          </div>
        )}
        {warns.length > 0 && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-semibold text-amber-800 mb-1">Engine warnings</p>
            <ul className="space-y-0.5">
              {warns.map((w: any, i: number) => (
                <li key={i} className="text-[11px] text-amber-700">{w.code ? `${w.code}: ` : ""}{w.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  function renderECPDesign() {
    const ec = d("ecp_design");
    const f = field("ecp_design");
    const s = save("ecp_design");
    const ecpRun = runs.find(r => r.calculation_type === "ecp" && r.calculation_status === "success");
    const ecpLatestRun = runs.filter(r => r.calculation_type === "ecp").sort((a, b) => new Date(b.calculated_at).getTime() - new Date(a.calculated_at).getTime())[0];
    const packings = packingsQ.data ?? [];
    const selectedPacking = packings.find((p: any) => p.id === ec.packing_id);
    const statusLine = (text: string) => <p className="text-[11px] text-gray-400 px-2 -mt-0.5">{text}</p>;
    const pk = (v: any, unit = "") => (v === null || v === undefined || v === "" ? "—" : `${typeof v === "object" ? v.value ?? "—" : v}${unit ? ` ${unit}` : ""}`);
    return (
      <div>
        <SectionCard title="ECP — Packed Extraction Column">
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3 mb-1">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Packing (Packing Database)</label>
            <select
              value={ec.packing_id ?? ""}
              onChange={e => commitSection("ecp_design", { packing_id: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="">— select a registered packing —</option>
              {packings.map((p: any) => (
                <option key={p.id} value={p.id}>{p.manufacturer} {p.productName} ({p.material})</option>
              ))}
            </select>
            <span />
          </div>
          {packings.length === 0 && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              No packing records are registered in the Packing Database. Vendor data is never invented — register controlled vendor records to enable selection. The ECP calculation requires a Packing Database record.
            </div>
          )}
          {selectedPacking && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5 mb-2 space-y-0.5">
              {[
                ["Manufacturer", pk(selectedPacking.manufacturer)],
                ["Packing Family / Type", pk(`${selectedPacking.productFamily ?? ""} ${selectedPacking.productName ?? ""} · ${selectedPacking.packingType ?? ""} (${selectedPacking.geometryClass ?? ""})`)],
                ["Material", pk(selectedPacking.material)],
                ["Specific Surface Area", pk(selectedPacking.specificSurfaceArea, "m²/m³")],
                ["Void Fraction", pk(selectedPacking.voidFraction)],
                ["Maximum Bed Height", pk(selectedPacking.maximumBedHeight, "m")],
                ["Capacity Data Reference", pk(selectedPacking.hydraulicCapacityReference)],
                ["Pressure-Drop Data Reference", pk(selectedPacking.pressureDropReference)],
              ].map(([l, v]) => (
                <div key={l as string} className="grid grid-cols-[180px_1fr] gap-2 text-xs">
                  <span className="text-gray-500">{l}</span>
                  <span className="font-medium text-gray-800">{v}</span>
                </div>
              ))}
              <p className="text-[10px] text-gray-400 pt-1">Auto-Populated · Source: Packing Database record "{selectedPacking.id}" — read-only vendor data, consumed by the C4 ECP engine.</p>
            </div>
          )}
          <FieldRow label="HETS (design)" value={ec.hets ?? ""} onChange={v => f("hets", v)} onBlur={s} unit="m" />
          {statusLine("HETS comes only from a source-tagged system HETS record or engineer input — never predicted. Engineer-entered values are tagged Assumed, pending validation.")}
          <FieldRow label="Liquid Distributor (type)" value={ec.liquid_distributor ?? ""} onChange={v => f("liquid_distributor", v)} onBlur={s} />
        </SectionCard>
        {renderSulzerScreening(f, s, ec)}
        <SectionCard title="ECP — Height Allowances (engineer/vendor)">
          <FieldRow label="Top Head Height" value={ec.top_head_height ?? ""} onChange={v => f("top_head_height", v)} onBlur={s} unit="m" />
          <FieldRow label="Top Disengagement Height" value={ec.top_disengagement_height ?? ""} onChange={v => f("top_disengagement_height", v)} onBlur={s} unit="m" />
          <FieldRow label="Top Distributor Allowance" value={ec.top_distributor_allowance ?? ""} onChange={v => f("top_distributor_allowance", v)} onBlur={s} unit="m" />
          <FieldRow label="Packing Support Allowance" value={ec.packing_support_allowance ?? ""} onChange={v => f("packing_support_allowance", v)} onBlur={s} unit="m" />
          <FieldRow label="Hold-Down Allowance" value={ec.hold_down_allowance ?? ""} onChange={v => f("hold_down_allowance", v)} onBlur={s} unit="m" />
          <FieldRow label="Bottom Distributor Allowance" value={ec.bottom_distributor_allowance ?? ""} onChange={v => f("bottom_distributor_allowance", v)} onBlur={s} unit="m" />
          <FieldRow label="Bottom Disengagement Height" value={ec.bottom_disengagement_height ?? ""} onChange={v => f("bottom_disengagement_height", v)} onBlur={s} unit="m" />
          <FieldRow label="Bottom Head Height" value={ec.bottom_head_height ?? ""} onChange={v => f("bottom_head_height", v)} onBlur={s} unit="m" />
          <FieldRow label="Redistributor Allowance" value={ec.redistributor_allowance ?? ""} onChange={v => f("redistributor_allowance", v)} onBlur={s} unit="m" />
          {statusLine("Engineer/vendor dimensions — mapped to the C4 engine only when entered; missing items are reported explicitly by the engine, never defaulted.")}
        </SectionCard>
        <SectionCard title="ECP — Calculated Results">
          <p className="text-xs text-gray-400">
            Packing height, packing volume, pressure drop, and total column height are C4 engine outputs — they are no longer manual inputs. Run Calculate ECP with a Packing Database record and HETS to generate them.
          </p>
          {ecpRun && <p className="text-[11px] text-gray-500 mt-1">Last successful run: {new Date(ecpRun.calculated_at).toLocaleString()}</p>}
          {renderRunIssues(ecpLatestRun, "ECP")}
        </SectionCard>
        {renderPrelimBanner("ecp")}
        <Button size="sm" className="gap-2 mb-4" disabled={isFrozen || calculateMutation.isPending} onClick={() => calculateMutation.mutate("ecp")}>
          <Play className="h-3.5 w-3.5" /> Calculate ECP
        </Button>
      </div>
    );
  }

  function renderECRDesign() {
    const er = d("ecr_design");
    const f = field("ecr_design");
    const s = save("ecr_design");
    const ecrRun = runs.find(r => r.calculation_type === "ecr" && r.calculation_status === "success");
    const ecrLatestRun = runs.filter(r => r.calculation_type === "ecr").sort((a, b) => new Date(b.calculated_at).getTime() - new Date(a.calculated_at).getTime())[0];
    const statusLine = (text: string) => <p className="text-[11px] text-gray-400 px-2 -mt-0.5">{text}</p>;

    // ── Read-only results binding from the latest accepted C5 ECR result ────
    const ecrData = (resultsQ.data ?? []).find((r: any) => r.section === "ecr")?.data;
    const ecrNormal = ecrData?.normalCase ?? ecrData?.cases?.normal;
    const ecrRows: any[] = ecrNormal?.diameters ?? [];
    const trialD = numOrNull(String(ecrNormal?.summary?.selectedTrialDiameter_m ?? ""));
    const selRow = ecrRows.find((r: any) => trialD !== null && Math.abs(Number(r.diameter_m) - trialD) < 1e-9)
      ?? ecrRows.find((r: any) => r.feasibility === "within_screening_band")
      ?? ecrRows[0];
    const sp0 = selRow?.rotor?.atSpeed?.[0];
    const itemVal = (it: any, dp = 3, scale = 1): string => {
      const v = it && typeof it === "object" ? it.result : it;
      if (v === null || v === undefined) return "—";
      if (typeof v === "number") return (v * scale).toLocaleString("en-IN", { maximumFractionDigits: dp });
      return String(v);
    };
    const itemStatus = (it: any): string => (it && typeof it === "object" && it.status ? ` · ${it.status}` : "");
    const resultRow = (label: string, it: any, unit = "", dp = 3, scale = 1) => (
      <div key={label} className="grid grid-cols-[200px_1fr] gap-2 py-1 border-b border-gray-50 last:border-0">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-medium text-gray-800">{itemVal(it, dp, scale)}{unit ? ` ${unit}` : ""}<span className="text-[10px] text-gray-400 font-normal">{itemStatus(it)}</span></span>
      </div>
    );

    return (
      <div>
        <SectionCard title="ECR — Kühni Agitated Column · Engineering Inputs">
          <FieldRow label="Rotor Type" value={er.rotor_type ?? "Kühni turbine"} onChange={v => f("rotor_type", v)} onBlur={s} placeholder="e.g. Kühni turbine" />
          {statusLine(`Status: ${(er.rotor_type ?? "").trim() !== "" && er.rotor_type !== "Kühni turbine" ? "Manual" : "Auto-Populated · Default label"} · Identification label only — carries no correlation`)}
          <FieldRow label="Rotor Diameter" value={er.rotor_diameter ?? ""} onChange={v => f("rotor_diameter", v)} onBlur={s} unit="m" placeholder="Or enter rotor/column ratio below" />
          <FieldRow label="Rotor / Column Diameter Ratio" value={er.rotor_ratio ?? ""} onChange={v => f("rotor_ratio", v)} onBlur={s} unit="—" placeholder="e.g. 0.5" />
          <FieldRow label="Rotor Speed" value={er.rotor_speed ?? ""} onChange={v => f("rotor_speed", v)} onBlur={s} unit="rpm" />
          <FieldRow label="Power Number" value={er.power_number ?? ""} onChange={v => f("power_number", v)} onBlur={s} unit="—" />
          <FieldRow label="Compartment Height" value={er.compartment_height ?? ""} onChange={v => f("compartment_height", v)} onBlur={s} unit="m" />
          <FieldRow label="Compartment Efficiency" value={er.compartment_efficiency ?? ""} onChange={v => f("compartment_efficiency", v)} onBlur={s} unit="%" />
          <FieldRow label="Shaft Efficiency" value={er.shaft_efficiency ?? ""} onChange={v => f("shaft_efficiency", v)} onBlur={s} unit="%" />
          <FieldRow label="Mechanical Design Margin" value={er.mechanical_design_margin ?? ""} onChange={v => f("mechanical_design_margin", v)} onBlur={s} unit="—" placeholder="e.g. 1.2" />
          <FieldRow label="Rotors per Compartment" value={er.rotors_per_compartment ?? ""} onChange={v => f("rotors_per_compartment", v)} onBlur={s} unit="—" placeholder="1" />
          <FieldRow label="Max Allowable Tip Speed (vendor)" value={er.max_tip_speed ?? ""} onChange={v => f("max_tip_speed", v)} onBlur={s} unit="m/s" />
          <FieldRow label="Max Allowable Shaft Power (vendor)" value={er.max_shaft_power ?? ""} onChange={v => f("max_shaft_power", v)} onBlur={s} unit="kW" />
          <FieldRow label="Max Unsupported Shaft Length (vendor)" value={er.max_unsupported_shaft_length ?? ""} onChange={v => f("max_unsupported_shaft_length", v)} onBlur={s} unit="m" />
          {statusLine("Engineer/vendor-entered inputs — mapped source-tagged to the C5 ECR engine, pending validation. Vendor limits are optional; missing limits are reported by the engine, never assumed.")}
        </SectionCard>
        <SectionCard title="ECR — Height Allowances (engineer/vendor)">
          <FieldRow label="Drive/Seal/Bearing Allowance" value={er.drive_seal_bearing_allowance ?? ""} onChange={v => f("drive_seal_bearing_allowance", v)} onBlur={s} unit="m" />
          <FieldRow label="Top Head Height" value={er.top_head_height ?? ""} onChange={v => f("top_head_height", v)} onBlur={s} unit="m" />
          <FieldRow label="Top Disengagement Height" value={er.top_disengagement_height ?? ""} onChange={v => f("top_disengagement_height", v)} onBlur={s} unit="m" />
          <FieldRow label="Top Distributor Allowance" value={er.top_distributor_allowance ?? ""} onChange={v => f("top_distributor_allowance", v)} onBlur={s} unit="m" />
          <FieldRow label="Bottom Distributor Allowance" value={er.bottom_distributor_allowance ?? ""} onChange={v => f("bottom_distributor_allowance", v)} onBlur={s} unit="m" />
          <FieldRow label="Bottom Disengagement Height" value={er.bottom_disengagement_height ?? ""} onChange={v => f("bottom_disengagement_height", v)} onBlur={s} unit="m" />
          <FieldRow label="Bottom Head Height" value={er.bottom_head_height ?? ""} onChange={v => f("bottom_head_height", v)} onBlur={s} unit="m" />
        </SectionCard>
        {renderPrelimBanner("ecr")}
        <Button size="sm" className="gap-2 mb-4" disabled={isFrozen || calculateMutation.isPending} onClick={() => calculateMutation.mutate("ecr")}>
          <Play className="h-3.5 w-3.5" /> Calculate ECR
        </Button>
        <SectionCard title="ECR — Calculated Results (C5 engine, read-only)">
          {!selRow ? (
            ecrLatestRun?.calculation_status === "error"
              ? null
              : <p className="text-xs text-gray-400">No ECR results yet — enter the engineering inputs above and run Calculate ECR. Calculated values are never entered manually.</p>
          ) : (
            <>
              <p className="text-[11px] text-gray-500 mb-1">
                Normal case · Column diameter {String(selRow.diameter_m)} m
                {trialD !== null && Math.abs(Number(selRow.diameter_m) - trialD) < 1e-9 ? " (engineer-selected trial)" : " (first in-band diameter from sweep)"}
                {ecrRun ? ` · Run: ${new Date(ecrRun.calculated_at).toLocaleString()}` : ""}
              </p>
              {resultRow("Tip Speed", sp0?.tipSpeed, "m/s")}
              {resultRow("Rotor Reynolds Number", sp0?.reynolds, "", 0)}
              {resultRow("Rotor Weber Number", sp0?.weber, "", 1)}
              {resultRow("Rotor Froude Number", sp0?.froude, "", 4)}
              {resultRow("Power Per Rotor", sp0?.power?.perRotor, "W", 1)}
              {resultRow("Number of Compartments", ecrData?.compartments, "", 0)}
              {resultRow("Active Height", ecrData?.heightBreakdown?.activeAgitatedHeight, "m", 2)}
              {resultRow("Shaft Power", sp0?.power?.totalShaft, "kW", 2, 0.001)}
              {resultRow("Motor Design Power", sp0?.power?.motorDesign, "kW", 2, 0.001)}
              {resultRow("Total Column Height (overall vessel)", ecrData?.heightBreakdown?.overallVesselHeight, "m", 2)}
              {resultRow("Hydraulic Utilization", selRow?.ecrHydraulicUtilization, "%", 1)}
              {resultRow("Validation Status", selRow?.feasibility)}
            </>
          )}
          {renderRunIssues(ecrLatestRun, "ECR")}
        </SectionCard>
      </div>
    );
  }

  function renderTechnologyComparison() {
    if (techSelection !== "both") {
      return (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-sm">
          <Info className="h-5 w-5 shrink-0" />
          Technology Comparison is only shown when <strong>"Compare Both"</strong> is selected in Step 6.
        </div>
      );
    }
    const tc = d("technology_comparison");
    const f = field("technology_comparison");
    const s = save("technology_comparison");

    // ── Run binding: latest accepted (success / pending-validation) run per engine ──
    const acceptedStatuses = ["success", "warning"]; // 'warning' = calculated, Pending Validation
    const ecpRun: any = runs.find(r => r.calculation_type === "ecp" && acceptedStatuses.includes(r.calculation_status));
    const ecrRun: any = runs.find(r => r.calculation_type === "ecr" && acceptedStatuses.includes(r.calculation_status));

    // Selected Stage 5 diameter: engineer trial when entered, else the sweep minimum feasible
    const hydSummary = (resultsQ.data ?? []).find((r: any) => r.section === "hydraulics_common")?.data?.normalCase?.summary;
    const trialStr = (d("hydraulic_design").column_diameter ?? "").trim();
    const selDia = parseFloat(trialStr) > 0 ? parseFloat(trialStr) : parseFloat(String(hydSummary?.minimumFeasibleDiameter_m ?? ""));
    const selRow = (snap: any) => (snap?.normalCase?.diameters ?? []).find((x: any) => Math.abs(x.diameter_m - selDia) < 1e-6);

    type Cell = { text: string; sub?: string; warn?: boolean };
    const NA: Cell = { text: "Not Applicable" };
    const noRun = (t: string): Cell => ({ text: `No accepted ${t} run available`, warn: true });
    const fmtN = (v: any, dp = 2) => (typeof v === "number" && isFinite(v) ? v.toFixed(dp) : null);

    const ecpSnap = ecpRun?.result_snapshot;
    const ecrSnap = ecrRun?.result_snapshot;
    const ecpHB = ecpSnap?.heightBreakdown;
    const ecrHB = ecrSnap?.heightBreakdown;
    const ecpSel = selRow(ecpSnap);
    const ecrSel = selRow(ecrSnap);
    const ecrAt = ecrSel?.rotor?.atSpeed?.[0];

    const packedBed = (ecpHB?.lines ?? []).filter((l: any) => String(l.label).startsWith("Packing Bed")).reduce((a: number, l: any) => a + (l.result ?? 0), 0);
    const utilCell = (u: any, tech: string): Cell => !u || u.result === null
      ? { text: "Pending Vendor Capacity Data", sub: `${tech} vendor capacity data not in record — C3 generic % is not a substitute`, warn: true }
      : { text: `${fmtN(u.result, 1)} %`, sub: u.status };
    const genericLoad = hydSummary ? `Stage 5 generic hydraulic screening available — not ECP/ECR vendor rating` : undefined;

    const calcRows: { label: string; unit: string; ecp: Cell; ecr: Cell }[] = [
      {
        label: "Column Diameter", unit: "m",
        ecp: ecpRun ? { text: fmtN(selDia) ?? "—", sub: trialStr ? "Stage 5 engineer trial" : "Stage 5 minimum feasible (sweep)" } : noRun("ECP"),
        ecr: ecrRun ? { text: fmtN(selDia) ?? "—", sub: trialStr ? "Stage 5 engineer trial" : "Stage 5 minimum feasible (sweep)" } : noRun("ECR"),
      },
      {
        label: "Active Height", unit: "m",
        ecp: ecpRun ? { text: fmtN(packedBed) ?? "—", sub: "Total packed-bed height (ECP-005/006)" } : noRun("ECP"),
        ecr: ecrRun ? { text: fmtN(ecrHB?.activeAgitatedHeight?.result) ?? "—", sub: `Active agitated height (${ecrSnap?.compartments?.result ?? "—"} compartments × compartment height)` } : noRun("ECR"),
      },
      {
        label: "Total Height (Overall Vessel)", unit: "m",
        ecp: ecpRun ? { text: fmtN(ecpHB?.overallVesselHeight?.result) ?? "—", sub: `T/T ${fmtN(ecpHB?.totalTangentToTangent?.result)} m + heads` } : noRun("ECP"),
        ecr: ecrRun ? { text: fmtN(ecrHB?.overallVesselHeight?.result) ?? "—", sub: `T/T ${fmtN(ecrHB?.totalTangentToTangent?.result)} m + heads + drive/seal` } : noRun("ECR"),
      },
      {
        label: "Hydraulic Utilization", unit: "%",
        ecp: ecpRun ? utilCell(ecpSel?.ecpHydraulicUtilization, "ECP") : noRun("ECP"),
        ecr: ecrRun ? utilCell(ecrSel?.ecrHydraulicUtilization, "ECR") : noRun("ECR"),
      },
      {
        label: "Pressure Drop", unit: "Pa/m",
        ecp: ecpRun
          ? (ecpSel?.pressureDrop?.result !== null && ecpSel?.pressureDrop?.result !== undefined
              ? { text: `${fmtN(ecpSel.pressureDrop.result, 1)} ${ecpSel.pressureDrop.units}`, sub: ecpSel.pressureDrop.status }
              : { text: "Not Calculable", sub: "Vendor pressure-drop data missing", warn: true })
          : noRun("ECP"),
        ecr: NA,
      },
      {
        label: "Shaft Power", unit: "kW",
        ecp: NA,
        ecr: ecrRun && ecrAt
          ? { text: fmtN((ecrAt.power?.totalShaft?.result ?? NaN) / 1000, 4) ?? "—", sub: `Motor design ${fmtN((ecrAt.power?.motorDesign?.result ?? NaN) / 1000, 4)} kW (ECR-006, ${ecrAt.power?.totalShaft?.status})` }
          : noRun("ECR"),
      },
    ];

    const runHeader = (run: any, label: string) => run ? (
      <p className="text-[11px] text-gray-500">
        <strong>{label}</strong>: run #{run.id} · {run.engine_name} v{run.engine_version} · {run.calculation_status === "warning" ? "Pending Validation" : run.calculation_status} · {new Date(run.calculated_at).toLocaleString()}
      </p>
    ) : <p className="text-[11px] text-amber-700"><strong>{label}</strong>: {label === "ECP" ? "No accepted ECP run available" : "No accepted ECR run available"} — run Calculate in Step 7</p>;

    // ── Qualitative screening rows: Preliminary Engineering Assessment, editable ──
    const QUAL_REF = "Preliminary Engineering Assessment — Thermopac qualitative screening basis (editable)";
    const LIT_REF = "Sulzer ECP/ECR literature screening record (Rauber, AIChE 2006)";
    const pulsator = String(d("technology_selection").pulsator_required ?? tc.pulsator_required ?? "").toLowerCase() === "yes";
    const qualRows: { key: string; label: string; ecpDefault: string; ecrDefault: string; ref: string }[] = [
      { key: "moving_parts", label: "Moving Parts", ecpDefault: pulsator ? "Pulsator only" : "No (unpulsed)", ecrDefault: "Yes — rotor, shaft and drive", ref: QUAL_REF },
      { key: "fouling_resistance", label: "Fouling Resistance", ecpDefault: "Moderate — packing/distributors sensitive to solids, rag and fouling", ecrDefault: "Moderate to Good — agitated internals tolerate changing properties; shaft/bearings/narrow internals need maintenance", ref: QUAL_REF },
      { key: "maintenance", label: "Maintenance", ecpDefault: pulsator ? "Medium (pulsator selected)" : "Low (unpulsed column)", ecrDefault: "Medium to High — rotor, shaft, seal, bearings, drive", ref: QUAL_REF },
      { key: "turndown", label: "Turndown", ecpDefault: "1:2", ecrDefault: "1:3", ref: LIT_REF },
    ];

    const costCell: Cell = { text: "Not Calculable", sub: "Cost Estimation (Step 11) not completed", warn: true };
    const cellEl = (c: Cell) => (
      <div className="text-center px-1">
        <span className={`text-xs ${c.warn ? "text-amber-700" : "text-gray-800"} font-medium`}>{c.text}</span>
        {c.sub && <p className="text-[10px] text-gray-400 leading-tight">{c.sub}</p>}
      </div>
    );

    return (
      <div className="max-w-4xl">
        <SectionCard title="Technology Comparison — ECP vs ECR">
          <div className="mb-3 space-y-0.5">
            {runHeader(ecpRun, "ECP")}
            {runHeader(ecrRun, "ECR")}
            {genericLoad && <p className="text-[10px] text-gray-400">{genericLoad}</p>}
          </div>
          <div className="grid grid-cols-[1fr_190px_190px] gap-1 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parameter</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">ECP</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">ECR</span>
          </div>
          {calcRows.map(row => (
            <div key={row.label} className="grid grid-cols-[1fr_190px_190px] gap-1 items-center py-1.5 border-b">
              <span className="text-sm text-gray-700">{row.label} <span className="text-gray-400 text-xs">({row.unit})</span></span>
              {cellEl(row.ecp)}
              {cellEl(row.ecr)}
            </div>
          ))}
          {qualRows.map(row => (
            <div key={row.key} className="grid grid-cols-[1fr_190px_190px] gap-1 items-center py-1.5 border-b">
              <span className="text-sm text-gray-700">{row.label}
                <p className="text-[10px] text-gray-400 leading-tight">{row.ref}</p>
              </span>
              <Input value={tc[`ecp_${row.key}`] ?? row.ecpDefault} onChange={e => f(`ecp_${row.key}`, e.target.value)} onBlur={s} className="h-8 text-[11px] text-center" disabled={isFrozen} />
              <Input value={tc[`ecr_${row.key}`] ?? row.ecrDefault} onChange={e => f(`ecr_${row.key}`, e.target.value)} onBlur={s} className="h-8 text-[11px] text-center" disabled={isFrozen} />
            </div>
          ))}
          {(["CAPEX (₹ Lakhs)", "OPEX (₹ Lakhs/yr)"]).map(lbl => (
            <div key={lbl} className="grid grid-cols-[1fr_190px_190px] gap-1 items-center py-1.5 border-b last:border-0">
              <span className="text-sm text-gray-700">{lbl}</span>
              {cellEl(costCell)}
              {cellEl(costCell)}
            </div>
          ))}
          <p className="text-[10px] text-gray-400 mt-2">
            All calculated cells are bound to the latest accepted C4/C5 runs (never manual entry). CAPEX/OPEX will bind to the Cost Estimation engine when Step 11 is completed.
          </p>
        </SectionCard>
        <SectionCard title="Selection Decision">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-3">
            <AlertTriangle className="inline h-4 w-4 mr-1" />
            <strong>The software never automatically selects the preferred technology.</strong> The engineer must make this decision based on technical merit and project requirements.
          </div>
          <TextAreaRow label="Preliminary Comparison Summary" value={tc.comparison_summary ?? ""} onChange={v => f("comparison_summary", v)} onBlur={s} rows={3} placeholder="Engineer's summary of the ECP vs ECR comparison (heights, power, utilization data gaps, qualitative factors)" />
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-600 block mb-1">Engineer Selected Technology</label>
            <select
              className="w-full h-9 text-sm border rounded-md px-2 bg-white"
              value={tc.preferred ?? ""}
              disabled={isFrozen}
              onChange={e => commitSection("technology_comparison", { preferred: e.target.value })}
            >
              <option value="">— Not yet selected —</option>
              <option value="ecp">ECP</option>
              <option value="ecr">ECR</option>
              <option value="both_vendor_pilot">Continue Both for Vendor/Pilot Review</option>
            </select>
          </div>
          <TextAreaRow label="Selection Basis" value={tc.selection_basis ?? ""} onChange={v => f("selection_basis", v)} onBlur={s} rows={3} placeholder="Technical justification for technology selection" />
          <TextAreaRow label="Engineer Comments" value={tc.engineer_comments ?? ""} onChange={v => f("engineer_comments", v)} onBlur={s} rows={2} placeholder="Additional engineering notes" />
        </SectionCard>
      </div>
    );
  }

  function renderMechanicalDesign() {
    const md = d("mechanical_design");
    const f = field("mechanical_design");
    const s = save("mechanical_design");
    const dbData = d("design_basis");
    const tcData = d("technology_comparison");

    // ── Inherited values (Stages 1/7/8) ─────────────────────────────
    const acceptedStatuses = ["success", "warning"];
    const preferred = tcData.preferred ?? "";
    const techLabel = preferred === "ecp" ? "ECP (Packed Column)" : preferred === "ecr" ? "ECR (Rotary Agitated Column)" : preferred === "both_vendor_pilot" ? "Continue Both for Vendor/Pilot Review" : "";
    const techRunType = preferred === "ecp" || preferred === "ecr" ? preferred : null;
    const techRun: any = techRunType ? runs.find(r => r.calculation_type === techRunType && acceptedStatuses.includes(r.calculation_status)) : null;
    const techHB = techRun?.result_snapshot?.heightBreakdown;

    const hydSummary = (resultsQ.data ?? []).find((r: any) => r.section === "hydraulics_common")?.data?.normalCase?.summary;
    const trialStr = (d("hydraulic_design").column_diameter ?? "").trim();
    const selDiaM = parseFloat(trialStr) > 0 ? parseFloat(trialStr) : parseFloat(String(hydSummary?.minimumFeasibleDiameter_m ?? ""));
    const fmt = (v: any, dp = 2) => (typeof v === "number" && isFinite(v) ? v.toFixed(dp) : "");

    const mdRow = inputsQ.data?.find?.((r: any) => r.section === "mechanical_design");
    const sectionUpdated = mdRow?.updated_at ? new Date(mdRow.updated_at).toLocaleString() : "Never saved";

    // Inherited field definitions: [key, label, unit, inheritedValue, sourceStage, sourceRef]
    const inherited: { key: string; label: string; unit?: string; inh: string; stage: string; ref: string; missing?: string }[] = [
      { key: "selected_technology", label: "Selected Technology", inh: techLabel, stage: "Stage 8 — Technology Comparison", ref: "Engineer Selected Technology", missing: "Pending Technology Selection (Stage 8)" },
      { key: "column_diameter_m", label: "Column Diameter", unit: "m", inh: fmt(selDiaM), stage: "Stage 7 — Equipment Design", ref: trialStr ? "Stage 5 engineer trial diameter" : "Stage 5 minimum feasible diameter (sweep)", missing: "Pending Stage 5 hydraulic sweep" },
      { key: "tt_height_m", label: "Tangent-to-Tangent Height", unit: "m", inh: fmt(techHB?.totalTangentToTangent?.result), stage: "Stage 7 — Equipment Design", ref: techRun ? `${techRunType?.toUpperCase()} run #${techRun.id} v${techRun.engine_version}` : "", missing: "Pending accepted Stage 7 run for selected technology" },
      { key: "overall_height_m", label: "Overall Vessel Height", unit: "m", inh: fmt(techHB?.overallVesselHeight?.result), stage: "Stage 7 — Equipment Design", ref: techRun ? `${techRunType?.toUpperCase()} run #${techRun.id} v${techRun.engine_version}` : "", missing: "Pending accepted Stage 7 run for selected technology" },
      { key: "operating_pressure", label: "Operating Pressure", unit: "bar g", inh: (dbData.operating_pressure ?? "").trim(), stage: "Stage 2 — Design Basis", ref: "Design Basis operating condition", missing: "Pending Design Basis entry" },
      { key: "design_pressure", label: "Design Pressure (Internal)", unit: "bar g", inh: (dbData.llx_internal_design_pressure ?? dbData.design_pressure ?? "").trim(), stage: "Stage 2 — Design Basis", ref: "Thermopac Design Rule — LLX internal design pressure", missing: "Pending Design Basis entry" },
      { key: "operating_temperature", label: "Operating Temperature", unit: "°C", inh: (dbData.operating_temperature ?? "").trim(), stage: "Stage 2 — Design Basis", ref: "Design Basis operating condition", missing: "Pending Design Basis entry" },
      { key: "design_temperature", label: "Design Temperature", unit: "°C", inh: (dbData.design_temperature ?? "").trim(), stage: "Stage 2 — Design Basis", ref: dbData.design_temperature_source ?? "Thermopac Design Temperature Rule", missing: "Pending Design Basis entry" },
    ];
    // Override is intent-based (key present in mechanical_design), not value-comparison —
    // an override equal to today's inherited value stays an override if upstream changes.
    const isOverridden = (key: string) => (md[key] ?? "").trim() !== "";
    const effVal = (row: typeof inherited[0]) => isOverridden(row.key) ? md[row.key].trim() : row.inh;
    const rowStatus = (row: typeof inherited[0]) => {
      if (isOverridden(row.key)) return "Engineer Override";
      if (row.inh !== "") return "Auto-Populated";
      return row.missing ?? "Pending";
    };
    const cm = (updates: Record<string, string>) => commitSection("mechanical_design", updates);

    // ── Mechanical configuration masters ────────────────────────────
    const HEAD_TYPES = ["2:1 Ellipsoidal", "Torispherical", "Hemispherical", "Flat", "Conical"];
    const MATERIALS: { name: string; ca: string }[] = [
      { name: "SA-516 Gr 70", ca: "3" },
      { name: "SS304L", ca: "0" },
      { name: "SS316L", ca: "0" },
      { name: "Duplex Stainless Steel (2205)", ca: "0" },
    ];
    const headType = md.head_type && HEAD_TYPES.includes(md.head_type) ? md.head_type : "2:1 Ellipsoidal";
    const shellMat = md.shell_material && MATERIALS.some(m => m.name === md.shell_material) ? md.shell_material : "SA-516 Gr 70";
    const caDefault = MATERIALS.find(m => m.name === shellMat)?.ca ?? "";
    const caVal = isOverridden("corrosion_allowance") ? md.corrosion_allowance.trim() : caDefault;
    const caStatus = isOverridden("corrosion_allowance") ? "Engineer Override" : "Auto-Populated";
    const CA_REF = "Thermopac Design Standard — Corrosion Allowance (Carbon Steel 3 mm / Stainless & Duplex 0 mm)";

    // ── Nozzle schedule (structured, JSON in section data) ──────────
    type Noz = {
      tag: string; service: string; flow_basis?: string; design_velocity?: string; calc_dia_mm?: string;
      size: string; rating: string; flange_std?: string; facing?: string; connection: string;
      orientation: string; elevation: string; qty?: string; source?: string; status?: string; remarks: string;
    };
    const NOZ_COLS: { k: keyof Noz; label: string; w: string; ro?: boolean }[] = [
      { k: "tag", label: "Tag", w: "56px" }, { k: "service", label: "Service", w: "170px" },
      { k: "flow_basis", label: "Flow Basis", w: "200px", ro: true }, { k: "design_velocity", label: "Vel.", w: "62px" },
      { k: "calc_dia_mm", label: "Calc Ø mm", w: "70px", ro: true }, { k: "size", label: "DN", w: "64px" },
      { k: "rating", label: "Rating", w: "60px" }, { k: "flange_std", label: "Flange Std", w: "86px" },
      { k: "facing", label: "Facing", w: "56px" }, { k: "connection", label: "Conn.", w: "76px" },
      { k: "orientation", label: "Orient.", w: "78px" }, { k: "elevation", label: "Elev. m", w: "62px" },
      { k: "qty", label: "Qty", w: "40px" }, { k: "source", label: "Source", w: "120px", ro: true },
      { k: "status", label: "Status", w: "150px", ro: true }, { k: "remarks", label: "Remarks", w: "180px" },
    ];
    let nozzles: Noz[] = [];
    try { nozzles = JSON.parse(md.nozzle_rows ?? "[]"); } catch { nozzles = []; }
    let nozIssues: { severity: string; message: string }[] = [];
    try { nozIssues = JSON.parse(md.nozzle_generation_issues ?? "[]"); } catch { nozIssues = []; }
    const nozRefs = (md.nozzle_generation_refs ?? "").trim();
    const saveNozzles = (rows: Noz[]) => cm({ nozzle_rows: JSON.stringify(rows) }); // atomic — never saves from a stale closure
    // An edit to a generated value marks the row Engineer Override (no Change Reason required).
    const setNozCell = (i: number, k: keyof Noz, v: string) => {
      const rows = nozzles.map((r, j) => (j === i ? { ...r, [k]: v, ...(r.source === "Auto-Generated" && v !== (r[k] ?? "") ? { source: "Engineer Override" } : {}) } : r));
      f("nozzle_rows", JSON.stringify(rows));
    };
    const generateNozzlesAuto = () => autoGenerateNozzles();

    // ── Structural ──────────────────────────────────────────────────
    const SUPPORT_TYPES = ["Skirt", "Leg Support", "Saddle", "Lug", "Trunnion"];
    const supportType = md.supports && SUPPORT_TYPES.includes(md.supports) ? md.supports : "Skirt";

    const trace = (status: string, stage: string, ref: string) => (
      <p className="text-[10px] text-gray-400 leading-tight mt-0.5">
        <span className={status === "Engineer Override" ? "text-blue-600 font-medium" : status === "Auto-Populated" ? "text-green-700" : "text-amber-700"}>{status}</span>
        {stage && <> · {stage}</>}{ref && <> · {ref}</>} · Editable
      </p>
    );

    return (
      <div className="max-w-4xl">
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-4">
          <Info className="h-4 w-4 shrink-0" />
          Stage 9 assembles the traceable Mechanical Design Basis and runs it through the existing C6 Common Mechanical Design Engine — preliminary screening only. Final code-certified ASME/EN/IS design remains pending.
        </div>

        <SectionCard title="Vessel Geometry & Design Conditions (Auto-Populated)">
          <p className="text-[11px] text-gray-500 mb-2">Inherited from previous stages — no re-entry required. Values remain editable; an edit is recorded as Engineer Override. Section last updated: {sectionUpdated}.</p>
          {inherited.map(row => (
            <div key={row.key} className="grid grid-cols-[210px_1fr_60px] items-start gap-3 py-1">
              <label className="text-sm text-gray-600 pt-2 font-medium leading-tight">{row.label}</label>
              <div>
                <Input value={effVal(row)} onChange={e => f(row.key, e.target.value)} onBlur={s} disabled={isFrozen}
                  placeholder={row.inh === "" ? (row.missing ?? "Pending") : row.label} className="h-8 text-sm" />
                {trace(rowStatus(row), row.stage, row.ref)}
                {isOverridden(row.key) && !isFrozen && (
                  <button className="text-[10px] text-blue-600 hover:underline" onClick={() => cm({ [row.key]: "" })}>Revert to inherited value</button>
                )}
              </div>
              <span className="text-xs text-gray-400 pt-2">{row.unit ?? ""}</span>
            </div>
          ))}
          <div className="grid grid-cols-[210px_1fr_60px] items-start gap-3 py-1">
            <label className="text-sm text-gray-600 pt-2 font-medium leading-tight">Shell Thickness</label>
            <div className="pt-2">
              <p className="text-sm text-gray-500 italic">Calculated by the existing C6 Common Mechanical Design Engine — preliminary screening only. Final code-certified ASME/EN/IS design remains pending.</p>
              <p className="text-[10px] text-gray-400">Not a manual entry — run the preliminary mechanical design below.</p>
            </div>
            <span className="text-xs text-gray-400 pt-2">mm</span>
          </div>
        </SectionCard>

        <SectionCard title="Mechanical Configuration">
          <div className="grid grid-cols-[210px_1fr_60px] items-start gap-3 py-1">
            <label className="text-sm text-gray-600 pt-2 font-medium leading-tight">Head Type</label>
            <div>
              <select className="w-full h-8 text-sm border rounded-md px-2 bg-white" value={headType} disabled={isFrozen}
                onChange={e => cm({ head_type: e.target.value })}>
                {HEAD_TYPES.map(h => <option key={h} value={h}>{h}{h === "2:1 Ellipsoidal" ? " (Default)" : ""}</option>)}
              </select>
              {trace(md.head_type && md.head_type !== "2:1 Ellipsoidal" ? "Engineer Override" : "Auto-Populated", "Thermopac Design Standard", "Default head type — 2:1 Ellipsoidal")}
            </div>
            <span />
          </div>
          <div className="grid grid-cols-[210px_1fr_60px] items-start gap-3 py-1">
            <label className="text-sm text-gray-600 pt-2 font-medium leading-tight">Shell Material</label>
            <div>
              <select className="w-full h-8 text-sm border rounded-md px-2 bg-white" value={shellMat} disabled={isFrozen}
                onChange={e => cm({ shell_material: e.target.value, corrosion_allowance: "" })}>
                {MATERIALS.map(m => <option key={m.name} value={m.name}>{m.name}{m.name === "SA-516 Gr 70" ? " (Default)" : ""}</option>)}
              </select>
              {trace(md.shell_material && md.shell_material !== "SA-516 Gr 70" ? "Engineer Override" : "Auto-Populated", "Material Master", "Default shell material — SA-516 Gr 70")}
            </div>
            <span />
          </div>
          <div className="grid grid-cols-[210px_1fr_60px] items-start gap-3 py-1">
            <label className="text-sm text-gray-600 pt-2 font-medium leading-tight">Corrosion Allowance</label>
            <div>
              <Input value={caVal} onChange={e => f("corrosion_allowance", e.target.value)} onBlur={s} disabled={isFrozen} className="h-8 text-sm" />
              {trace(caStatus, "Thermopac Design Standards", CA_REF)}
              {isOverridden("corrosion_allowance") && !isFrozen && (
                <button className="text-[10px] text-blue-600 hover:underline" onClick={() => cm({ corrosion_allowance: "" })}>Revert to standard default</button>
              )}
            </div>
            <span className="text-xs text-gray-400 pt-2">mm</span>
          </div>
        </SectionCard>

        <SectionCard title="Nozzle Schedule (Auto-Generated & Sized)">
          <div className="flex items-center justify-between mb-2 gap-3">
            <p className="text-[11px] text-gray-500">
              Fully automatic generation from the selected technology, process flows, vessel geometry and controlled Thermopac nozzle master data (velocity rules, DN series, instrument masters, access rules). Liquid nozzles: A = Q/v, d = √(4A/π), next larger DN. All values remain editable — an edit is marked Engineer Override. Elevations are Preliminary Layout values.
              {nozRefs && <> <span className="text-gray-400">Master data: {nozRefs}</span></>}
            </p>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" disabled={isFrozen || nozGenBusy || (preferred !== "ecp" && preferred !== "ecr")} onClick={generateNozzlesAuto}>
                {nozGenBusy ? "Generating…" : nozzles.length ? "Regenerate & Size Nozzles (Auto)" : "Generate & Size Nozzles (Auto)"}
              </Button>
              {nozzles.length > 0 && (
                <Button size="sm" variant="outline" disabled={isFrozen} onClick={() => saveNozzles([...nozzles, { tag: "", service: "", size: "", rating: "150#", flange_std: "ASME B16.5", facing: "RF", connection: "Flanged", orientation: "", elevation: "", qty: "1", source: "Engineer Entry", status: "Preliminary — Pending Validation", remarks: "" } as Noz])}>
                  + Add Row
                </Button>
              )}
            </div>
          </div>
          {preferred !== "ecp" && preferred !== "ecr" && (
            <p className="text-[11px] text-amber-700 mb-2">Generation requires a single selected technology (ECP or ECR) in Stage 8 — Technology Comparison.</p>
          )}
          {nozIssues.length > 0 && (
            <div className="p-2 mb-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
              <p className="font-semibold mb-1">Generation validation findings</p>
              {nozIssues.map((it, i) => (
                <p key={i} className={it.severity === "error" ? "text-red-700" : ""}>• [{it.severity}] {it.message}</p>
              ))}
            </div>
          )}
          {nozzles.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No nozzles defined — click "Generate &amp; Size Nozzles (Auto)" to generate and size the full {preferred === "ecr" ? "ECR" : preferred === "ecp" ? "ECP" : "LLX"} schedule from Thermopac nozzle master data.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: NOZ_COLS.map(c => c.w).join(" ") + " 28px", minWidth: 1650 }}>
                {NOZ_COLS.map(c => <span key={c.k} className="text-[10px] font-semibold text-gray-500 uppercase">{c.label}</span>)}
                <span />
              </div>
              {nozzles.map((n, i) => (
                <div key={i} className="grid gap-1 mb-1" style={{ gridTemplateColumns: NOZ_COLS.map(c => c.w).join(" ") + " 28px", minWidth: 1650 }}>
                  {NOZ_COLS.map(c => c.ro ? (
                    <span key={c.k} title={n[c.k] ?? ""} className={`text-[10px] leading-tight pt-1.5 truncate ${c.k === "source" && n.source === "Engineer Override" ? "text-blue-600 font-medium" : "text-gray-500"}`}>{n[c.k] ?? ""}</span>
                  ) : (
                    <Input key={c.k} value={n[c.k] ?? ""} disabled={isFrozen} className="h-7 text-[11px] px-1.5"
                      onChange={e => setNozCell(i, c.k, e.target.value)} onBlur={s} />
                  ))}
                  <button className="text-gray-300 hover:text-red-500 text-sm" disabled={isFrozen} title="Remove row"
                    onClick={() => saveNozzles(nozzles.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Structural">
          <div className="grid grid-cols-[210px_1fr_60px] items-start gap-3 py-1">
            <label className="text-sm text-gray-600 pt-2 font-medium leading-tight">Support Type</label>
            <div>
              <select className="w-full h-8 text-sm border rounded-md px-2 bg-white" value={supportType} disabled={isFrozen}
                onChange={e => cm({ supports: e.target.value })}>
                {SUPPORT_TYPES.map(t => <option key={t} value={t}>{t}{t === "Skirt" ? " (Default — vertical column)" : ""}</option>)}
              </select>
              {trace(md.supports && md.supports !== "Skirt" ? "Engineer Override" : "Auto-Populated", "Thermopac Design Standard", "Default support for vertical LLX columns — Skirt")}
            </div>
            <span />
          </div>
          <FieldRow label="Skirt / Support Height" value={md.skirt_height ?? ""} onChange={v => f("skirt_height", v)} onBlur={s} unit="mm" placeholder="Engineer entry — set at layout/GA stage" readOnly={isFrozen} />
          <FieldRow label="Lifting Lugs" value={md.lifting_lugs ?? ""} onChange={v => f("lifting_lugs", v)} onBlur={s} placeholder="e.g. 2 × Trunnion, Qty / Rating" readOnly={isFrozen} />
        </SectionCard>

        <SectionCard title="Mechanical Design Summary (Read-Only)">
          {([
            ["Selected Technology", effVal(inherited[0]) || "Pending Stage 8 selection"],
            ["Column Diameter", effVal(inherited[1]) ? `${effVal(inherited[1])} m` : "Pending"],
            ["T/T Height", effVal(inherited[2]) ? `${effVal(inherited[2])} m` : "Pending Stage 7 run"],
            ["Overall Vessel Height", effVal(inherited[3]) ? `${effVal(inherited[3])} m` : "Pending Stage 7 run"],
            ["Shell Material", shellMat],
            ["Head Type", headType],
            ["Support Type", supportType],
            ["Corrosion Allowance", caVal !== "" ? `${caVal} mm` : "Pending"],
            ["Nozzle Count", String(nozzles.length)],
            ["Design Pressure", effVal(inherited[5]) ? `${effVal(inherited[5])} bar g` : "Pending"],
            ["Design Temperature", effVal(inherited[7]) ? `${effVal(inherited[7])} °C` : "Pending"],
            ["Shell Thickness", "Calculated by the C6 Common Mechanical Design Engine — preliminary screening only"],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex justify-between py-1 border-b last:border-0">
              <span className="text-sm text-gray-600">{k}</span>
              <span className="text-sm text-gray-800 font-medium text-right">{v}</span>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 mt-2">This summary is the input set mapped into the existing C6 Common Mechanical Design Engine (mech-vessel v1.0.0) — preliminary screening only. No reinforcement, wind/seismic, detailed skirt/saddle design, FEA, PV Elite replacement or code-certified MAWP calculation. Final code-certified ASME/EN/IS design remains pending.</p>
        </SectionCard>

        {renderMechVesselResults()}
      </div>
    );
  }

  function renderMechVesselResults() {
    const tcPreferred = String(d("technology_comparison").preferred ?? "");
    const techSelected = tcPreferred === "ecp" || tcPreferred === "ecr";
    const mechRun: any = runs.find(r => r.calculation_type === "mechanical_vessel" && ["success", "warning"].includes(r.calculation_status));
    const snap = mechRun?.result_snapshot;
    const fmtV = (it: any, dp = 2) => it && typeof it.result === "number" && isFinite(it.result) ? `${it.result.toFixed(dp)} ${it.units}` : null;
    const cell = (label: string, it: any, dp = 2) => (
      <div key={label} className="flex justify-between py-1 border-b last:border-0">
        <span className="text-sm text-gray-600">{label}</span>
        <span className={`text-sm font-medium text-right ${fmtV(it, dp) ? "text-gray-800" : "text-amber-700"}`}>
          {fmtV(it, dp) ?? `${it?.status ?? "Not Calculable"}${it?.validation ? "" : ""}`}
          {!fmtV(it, dp) && it?.validation && <span className="block text-[10px] font-normal text-gray-400 max-w-[340px]">{it.validation}</span>}
        </span>
      </div>
    );
    return (
      <SectionCard title="Preliminary Mechanical Design — C6 Common Mechanical Design Engine">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] text-gray-500">
            Maps the confirmed Stage 9 Mechanical Design Basis into mech-vessel v1.0.0. Preliminary thin-wall screening only — not a final ASME design and not fabrication-ready.
          </p>
          <Button size="sm" disabled={isFrozen || calculateMutation.isPending || nozGenBusy || !techSelected} onClick={async () => {
            // Fully automatic: an unsized/legacy nozzle schedule (no DN on any row and
            // no engineer overrides) is auto-generated + persisted before the run.
            let rows: any[] = [];
            try { rows = JSON.parse(d("mechanical_design").nozzle_rows ?? "[]"); } catch { rows = []; }
            const hasOverride = rows.some(r => r.source === "Engineer Override" || r.source === "Engineer Entry");
            const unsized = rows.length === 0 || rows.every(r => !String(r.size ?? "").trim());
            if (unsized && !hasOverride) {
              const ok = await autoGenerateNozzles();
              if (!ok) return;
            }
            calculateMutation.mutate("mechanical_vessel");
          }}>
            {nozGenBusy ? "Generating nozzles…" : calculateMutation.isPending ? "Running…" : "Run Preliminary Mechanical Design"}
          </Button>
        </div>
        {!techSelected && (
          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 mb-3">
            Blocked — set <strong>Engineer Selected Technology</strong> to ECP or ECR in Stage 8 (Technology Comparison) first. {tcPreferred === "both_vendor_pilot" ? '"Continue Both for Vendor/Pilot Review" cannot drive the mechanical basis — a single technology is required.' : "The software never auto-selects the technology."}
          </div>
        )}
        <div className="p-2 bg-gray-50 border rounded-lg text-[10px] text-gray-500 mb-3">
          Applicability limitations: no reinforcement calculation · no wind or seismic design · no detailed skirt/saddle design · no FEA · no PV Elite replacement · no code-certified MAWP calculation. Final code-certified ASME/EN/IS design remains pending.
        </div>
        {!mechRun ? (
          <p className="text-sm text-gray-400 italic">No preliminary mechanical design run yet.</p>
        ) : (
          <>
            <p className="text-[11px] text-gray-500 mb-2">
              Run #{mechRun.id} · {mechRun.engine_name} v{mechRun.engine_version} · {mechRun.calculation_status === "warning" ? "Pending Validation" : mechRun.calculation_status} · {new Date(mechRun.calculated_at).toLocaleString()} · Engine status: {snap?.calculationRunStatus ?? "—"}
            </p>
            <div className="grid md:grid-cols-2 gap-x-8">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Thickness Screening (mm)</p>
                {cell("Shell — calculated", snap?.shellDesign?.shellThicknessCalculated, 3)}
                {cell("Shell — required (incl. CA)", snap?.shellDesign?.shellThicknessRequired, 3)}
                {cell("Shell — selected plate", snap?.shellDesign?.shellThicknessSelected, 0)}
                {cell("Head — calculated", snap?.shellDesign?.headThicknessCalculated, 3)}
                {cell("Head — required (incl. CA)", snap?.shellDesign?.headThicknessRequired, 3)}
                {cell("Head — selected plate", snap?.shellDesign?.headThicknessSelected, 0)}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Volume & Weights</p>
                {cell("Internal volume", snap?.weights?.vesselVolume, 3)}
                {cell("Empty weight", snap?.weights?.emptyWeight, 0)}
                {cell("Operating weight", snap?.weights?.operatingWeight, 0)}
                {cell("Hydrotest weight", snap?.weights?.hydrotestWeight, 0)}
                <p className="text-xs font-semibold text-gray-500 uppercase mt-3 mb-1">Support & Lifting</p>
                <div className="flex justify-between py-1 border-b"><span className="text-sm text-gray-600">Support type</span><span className="text-sm font-medium text-gray-800">{String(snap?.support?.selection?.result ?? "—")}{snap?.support?.quantity ? ` × ${snap.support.quantity}` : ""}</span></div>
                <div className="py-1">
                  <span className="text-sm text-gray-600">Preliminary lifting arrangement</span>
                  <p className="text-xs text-gray-700 mt-0.5">{snap?.lifting?.lugQuantity?.result ?? "—"} lugs — {(snap?.lifting?.suggestedLocations ?? []).join("; ") || "—"}</p>
                  <p className="text-[10px] text-amber-700">Quantity/location convention only — no structural verification.</p>
                </div>
              </div>
            </div>
            {Array.isArray(snap?.nozzleSchedule) && snap.nozzleSchedule.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Preliminary Nozzle Schedule ({snap.nozzleSchedule.length})</p>
                <div className="overflow-x-auto">
                  <div className="grid gap-1 text-[10px] font-semibold text-gray-500 uppercase" style={{ gridTemplateColumns: "60px 1fr 90px 70px 90px 110px", minWidth: 600 }}>
                    <span>Tag</span><span>Service</span><span>Size (DN)</span><span>Rating</span><span>Flange Class</span><span>Flange Std</span>
                  </div>
                  {snap.nozzleSchedule.map((n: any, i: number) => (
                    <div key={i} className="grid gap-1 text-[11px] text-gray-700 py-0.5 border-b last:border-0" style={{ gridTemplateColumns: "60px 1fr 90px 70px 90px 110px", minWidth: 600 }}>
                      <span>{n.tag ?? "—"}</span><span>{n.service}</span>
                      <span>{typeof n.size?.result === "number" ? n.size.result : (n.size?.status ?? "—")}</span>
                      <span>{n.rating ?? "—"}</span><span>{n.flangeClass ?? "—"}</span><span>{n.flangeStandard ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {Array.isArray(snap?.assumptions) && snap.assumptions.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Assumptions ({snap.assumptions.length})</p>
                {snap.assumptions.map((a: any, i: number) => (
                  <p key={i} className="text-[11px] text-gray-600">• {a.assumption}{a.sourceReference ? ` — ${a.sourceReference}` : ""}{a.consequence ? ` (${a.consequence})` : ""}</p>
                ))}
              </div>
            )}
            {renderRunIssues(mechRun, "C6 Mechanical")}
          </>
        )}
      </SectionCard>
    );
  }

  function renderUtilities() {
    const ut = d("utilities");
    const f = field("utilities");
    const s = save("utilities");
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-4">
          <Info className="h-4 w-4 shrink-0" />
          Operating temperatures are auto-filled from Design Basis. All utilities are consistent with Section 2 operating conditions.
        </div>
        <SectionCard title="Utility Requirements">
          <FieldRow label="Thermal Oil Duty" value={ut.thermal_oil_duty ?? ""} onChange={v => f("thermal_oil_duty", v)} onBlur={s} unit="kW" />
          <FieldRow label="Cooling Water Duty" value={ut.cw_duty ?? ""} onChange={v => f("cw_duty", v)} onBlur={s} unit="kW" />
          <FieldRow label="Cooling Water Flow" value={ut.cw_flow ?? ""} onChange={v => f("cw_flow", v)} onBlur={s} unit="m³/h" />
          <FieldRow label="Steam Requirement" value={ut.steam_requirement ?? ""} onChange={v => f("steam_requirement", v)} onBlur={s} unit="kg/h" />
          <FieldRow label="Electrical Load" value={ut.electrical_load ?? ""} onChange={v => f("electrical_load", v)} onBlur={s} unit="kW" />
          <FieldRow label="Nitrogen Requirement" value={ut.nitrogen_requirement ?? ""} onChange={v => f("nitrogen_requirement", v)} onBlur={s} unit="Nm³/h" />
        </SectionCard>
        <SectionCard title="Reference Conditions (from Design Basis)">
          <FieldRow label="Thermal Oil Inlet" value={d("design_basis").thermal_heater_inlet ?? "—"} onChange={() => {}} readOnly />
          <FieldRow label="Thermal Oil Outlet" value={d("design_basis").thermal_heater_outlet ?? "—"} onChange={() => {}} readOnly />
          <FieldRow label="CW Inlet" value={d("design_basis").cw_inlet_temperature ?? "—"} onChange={() => {}} readOnly unit="°C" />
          <FieldRow label="CW Outlet" value={d("design_basis").cw_outlet_temperature ?? "—"} onChange={() => {}} readOnly unit="°C" />
        </SectionCard>
      </div>
    );
  }

  function renderCostEstimation() {
    const ce = d("cost_estimation");
    const f = field("cost_estimation");
    const s = save("cost_estimation");
    const items = [
      { key: "vessel_cost",          label: "Vessel / Shell" },
      { key: "internals_cost",       label: "Internals" },
      { key: "packing_cost",         label: "Packing" },
      { key: "agitator_cost",        label: "Agitator (ECR only)" },
      { key: "instrumentation_cost", label: "Instrumentation" },
      { key: "piping_cost",          label: "Piping" },
      { key: "electrical_cost",      label: "Electrical" },
      { key: "civil_cost",           label: "Civil / Foundation" },
    ];
    const total = items.reduce((sum, it) => sum + (parseFloat(ce[it.key] ?? "") || 0), 0);
    return (
      <div className="max-w-2xl">
        <SectionCard title="Cost Estimation">
          <div className="grid grid-cols-[200px_120px_60px] gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Currency</span>
          </div>
          {items.map(it => (
            <div key={it.key} className="grid grid-cols-[200px_120px_60px] gap-2 items-center py-1 border-b last:border-0">
              <span className="text-sm text-gray-700">{it.label}</span>
              <Input value={ce[it.key] ?? ""} onChange={e => f(it.key, e.target.value)} onBlur={s} className="h-7 text-xs" placeholder="0.00" type="number" />
              <span className="text-xs text-gray-400">₹ Lakhs</span>
            </div>
          ))}
          <div className="grid grid-cols-[200px_120px_60px] gap-2 items-center pt-3 mt-1 border-t-2">
            <span className="text-sm font-bold text-gray-900">Installed Cost (Total)</span>
            <span className="text-sm font-bold text-blue-700 font-mono">₹ {total.toFixed(2)} L</span>
            <span />
          </div>
        </SectionCard>
        <SectionCard title="Escalation">
          <FieldRow label="Base Year" value={ce.base_year ?? new Date().getFullYear().toString()} onChange={v => f("base_year", v)} onBlur={s} />
          <FieldRow label="Escalation Factor" value={ce.escalation_factor ?? "1.00"} onChange={v => f("escalation_factor", v)} onBlur={s} />
          <FieldRow label="Contingency %" value={ce.contingency_percent ?? "10"} onChange={v => f("contingency_percent", v)} onBlur={s} unit="%" />
        </SectionCard>
      </div>
    );
  }

  function renderDesignValidation() {
    const failCount = validationChecks.filter(c => c.status === "fail").length;
    const warnCount = validationChecks.filter(c => c.status === "warning").length;
    return (
      <div className="max-w-2xl">
        <div className={`flex items-center gap-3 p-4 rounded-xl border-2 mb-4 ${
          failCount > 0 ? "border-red-300 bg-red-50" : warnCount > 0 ? "border-amber-300 bg-amber-50" : "border-green-300 bg-green-50"
        }`}>
          {failCount > 0
            ? <XCircle className="h-6 w-6 text-red-500 shrink-0" />
            : warnCount > 0
            ? <AlertCircle className="h-6 w-6 text-amber-500 shrink-0" />
            : <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />}
          <div>
            <p className="font-semibold text-gray-900">
              {failCount > 0
                ? `${failCount} check${failCount > 1 ? "s" : ""} failed — cannot progress to review`
                : warnCount > 0
                ? `${warnCount} warning${warnCount > 1 ? "s" : ""} — review before approving`
                : "All checks passed — ready to submit for review"}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              {failCount > 0 ? "Resolve all failures before submitting this design for review." : "Warnings are advisory; the design may proceed with engineering sign-off."}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {validationChecks.map((check, i) => (
            <ValidationCheck key={i} label={check.label} status={check.status as any} note={check.note} />
          ))}
        </div>
        {!canSubmit && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            The "Submit for Review" button in Step 14 is disabled until all mandatory checks pass.
          </div>
        )}
      </div>
    );
  }

  function renderReports() {
    const reportCards = [
      { key: "design_basis",       docType: "DBR", title: "Design Basis Report", desc: "Frozen statement of the design basis — Stages 1–4 inputs with source classification, assumptions register and validation summary." },
      { key: "process_design",     docType: "PDR", title: "Process Design Report", desc: "Frozen C2 results — material balance (normal + maximum case), solvent balance, yields and split fractions with provenance." },
      { key: "hydraulic_calc",     docType: "HDR", title: "Hydraulic Design Report", desc: "Frozen C3 generic screening — diameter feasibility tables (normal + maximum case), terminal-velocity screening, shape-regime indicators, slip-model basis and limitations." },
      { key: "equipment_datasheet",title: "Equipment Datasheet",          desc: "Engineering datasheet for equipment procurement." },
      { key: "mechanical_datasheet",title:"Mechanical Datasheet",         desc: "Mechanical design datasheet for fabrication." },
      { key: "rfq_datasheet",      title: "RFQ Datasheet",               desc: "Request-for-quotation specification sheet." },
      { key: "calc_book",          title: "Process Calculation Book",     desc: "Complete calculation workings in engineering format." },
      { key: "design_report",      title: "Engineering Design Report",    desc: "Complete engineering design report for client submission." },
    ];
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-4">
          <Info className="h-4 w-4 shrink-0" />
          Report generation requires completed calculation runs. Reports are generated from live engineering data and frozen at each revision.
        </div>
        <div className="grid grid-cols-2 gap-4">
          {reportCards.map(rc => {
            const docType = (rc as any).docType as string | undefined;
            const rep = docType ? (reportsQ.data ?? []).find(r => r.doc_type === docType) : undefined;
            const statusColours: Record<string, string> = {
              draft: "bg-gray-100 text-gray-600 border-gray-200",
              for_review: "bg-amber-50 text-amber-700 border-amber-200",
              approved: "bg-green-50 text-green-700 border-green-200",
              issued: "bg-blue-50 text-blue-700 border-blue-200",
            };
            const statusLabels: Record<string, string> = { draft: "Draft", for_review: "For Review", approved: "Approved", issued: "Issued" };
            const advanceLabels: Record<string, string> = { draft: "Submit for Review", for_review: "Approve", approved: "Issue" };
            const missingErrors = rep ? ((rep.missing_data ?? []) as any[]).filter(m => m.severity === "error").length : 0;
            return (
              <div key={rc.key} className="border rounded-xl p-4 bg-white">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-semibold text-sm text-gray-900">{rc.title}</p>
                  {rep
                    ? <Badge className={`border text-[10px] px-2 shrink-0 ${statusColours[rep.status] ?? ""}`}>{statusLabels[rep.status] ?? rep.status}</Badge>
                    : <FileDown className="h-4 w-4 text-gray-300 shrink-0 mt-0.5" />}
                </div>
                <p className="text-xs text-gray-500 mb-3">{rc.desc}</p>
                {docType ? (
                  <div className="space-y-1.5">
                    {rep && (
                      <p className="text-[11px] text-gray-500">
                        {rep.doc_number} · {rep.report_rev} · generated {new Date(rep.generated_at).toLocaleString()} by {rep.generated_by_name ?? "—"}
                        <span className="block">
                          {rep.assumption_count} assumption(s) in register{missingErrors > 0 && <span className="text-red-600"> · {missingErrors} mandatory value(s) missing</span>}
                        </span>
                      </p>
                    )}
                    <div className="flex gap-1.5">
                      <Button size="sm" variant={rep ? "outline" : "default"} className="flex-1 text-xs gap-1.5" disabled={reportGenBusy || (rep && rep.status !== "draft")}
                        title={rep && rep.status !== "draft" ? `${statusLabels[rep.status]} report is immutable — content changes require a new design revision` : undefined}
                        onClick={async () => {
                          setReportGenBusy(true);
                          try {
                            const res: any = await apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/reports`, { docType });
                            toast({ title: `${rep ? "Regenerated" : "Generated"} ${res.docNumber} ${res.reportRev}`, description: `${res.assumptions} assumption(s) in register · ${res.missing} validation finding(s)${res.blocking ? ` · ${res.blocking} blocking` : ""}` });
                            reportsQ.refetch();
                          } catch (e: any) {
                            toast({ title: "Report generation failed", description: e.message, variant: "destructive" });
                          } finally { setReportGenBusy(false); }
                        }}>
                        <FileDown className="h-3.5 w-3.5" /> {rep ? "Regenerate" : "Generate"}
                      </Button>
                      {rep && (
                        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => window.open(`/api/design-software/reports/${rep.id}/pdf`, "_blank")}>
                          View PDF
                        </Button>
                      )}
                    </div>
                    {rep && advanceLabels[rep.status] && (
                      <Button size="sm" variant="ghost" className="w-full text-xs text-gray-600"
                        disabled={rep.status === "draft" && missingErrors > 0}
                        title={rep.status === "draft" && missingErrors > 0 ? "Blocked — mandatory basis values missing; complete inputs and regenerate" : undefined}
                        onClick={async () => {
                          try {
                            const res: any = await apiRequest("POST", `/api/design-software/reports/${rep.id}/advance-status`);
                            toast({ title: `Report ${statusLabels[res.status] ?? res.status}` });
                            reportsQ.refetch();
                          } catch (e: any) {
                            toast({ title: "Status change blocked", description: e.message, variant: "destructive" });
                          }
                        }}>
                        {advanceLabels[rep.status]} →
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="w-full text-xs gap-1.5" disabled={true} title="Implemented one at a time in engineering sequence — next: Process Design Report">
                    <FileDown className="h-3.5 w-3.5" /> Generate (pending implementation)
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderRevisionControl() {
    const approvals = approvalsQ.data ?? [];
    return (
      <div className="max-w-2xl">
        <SectionCard title="Current Status">
          <div className="flex items-center justify-between">
            <div>
              <Badge className={`border text-sm px-3 py-1 ${STATUS_COLOURS[currentStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {STATUS_LABELS[currentStatus] ?? currentStatus}
              </Badge>
              <p className="text-xs text-gray-400 mt-1">Rev {activeRevision?.revision_number ?? "—"} · {isFrozen ? "Frozen" : "Active"}</p>
            </div>
            {!isFrozen && activeRevision?.is_current && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setShowNewRevision(true)}>
                <GitBranch className="h-3.5 w-3.5" /> New Revision
              </Button>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Lifecycle Actions">
          {isFrozen ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Lock className="h-4 w-4" /> This revision is frozen. Create a new revision to make changes.
            </div>
          ) : lifecycleActions.length > 0 ? (
            <div className="space-y-2">
              {lifecycleActions.map(la => {
                const blocked = la.action === "submit_for_review" && !canSubmit;
                return (
                  <div key={la.action} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{la.label}</p>
                      {blocked && <p className="text-xs text-red-500 mt-0.5">Design validation checks must pass first (Step 12)</p>}
                    </div>
                    <Button
                      size="sm"
                      variant={la.variant ?? "default"}
                      disabled={blocked || lifecycleMutation.isPending || !activeRevision?.is_current}
                      onClick={() => { setShowLifecycle(la.action); setLifecycleComment(""); }}
                    >
                      {la.label}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No lifecycle actions available for current status.</p>
          )}
        </SectionCard>

        <SectionCard title="Workflow History">
          {approvals.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No workflow actions recorded yet.</p>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-200" />
              {approvals.map(a => (
                <div key={a.id} className="relative mb-4">
                  <div className="absolute -left-4 top-1.5 h-2.5 w-2.5 rounded-full bg-blue-400 border-2 border-white" />
                  <div className="bg-white border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium capitalize">{a.action.replace(/_/g, " ")}</p>
                      <p className="text-xs text-gray-400">{new Date(a.performed_at).toLocaleString()}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{a.performed_by_name ?? "—"}</p>
                    {a.comments && <p className="text-sm text-gray-700 mt-1.5 italic">"{a.comments}"</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  function renderStepContent(key: StepKey) {
    switch (key) {
      case "design_identity":       return renderDesignIdentity();
      case "design_basis":          return renderDesignBasis();
      case "fluid_properties":      return renderFluidProperties();
      case "process_design":        return renderProcessDesign();
      case "hydraulic_design":      return renderHydraulicDesign();
      case "technology_selection":  return renderTechnologySelection();
      case "equipment_design":      return renderEquipmentDesign();
      case "technology_comparison": return renderTechnologyComparison();
      case "mechanical_design":     return renderMechanicalDesign();
      case "utilities":             return renderUtilities();
      case "cost_estimation":       return renderCostEstimation();
      case "design_validation":     return renderDesignValidation();
      case "reports":              return renderReports();
      case "revision_control":      return renderRevisionControl();
    }
  }

  // ── Early returns ─────────────────────────────────────────────────────────────
  if (designQ.isLoading) {
    return <Layout><div className="flex items-center justify-center h-64 text-gray-400">Loading…</div></Layout>;
  }
  if (!design) {
    return (
      <Layout>
        <div className="p-8 text-center text-gray-500">
          Design not found. <button className="text-blue-600 underline" onClick={() => navigate("/design-software/liquid-liquid-extraction")}>Back to list</button>
        </div>
      </Layout>
    );
  }

  const activeStepDef = STEPS.find(s => s.key === activeStep)!;

  return (
    <Layout>
      <div className="flex flex-col h-full min-h-0">
        {/* ── Header bar ──────────────────────────────────────────────────── */}
        <div className="border-b bg-white px-6 py-3 flex items-center gap-4 shrink-0">
          <button onClick={() => navigate("/design-software/liquid-liquid-extraction")} className="text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-gray-400">{design.design_number}</span>
              <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
              <h1 className="font-semibold text-gray-900 truncate">{design.title}</h1>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Liquid-Liquid Extraction · Rev {activeRevision?.revision_number ?? "—"}</p>
          </div>

          {/* Revision selector */}
          <Select value={String(activeRevisionId ?? "")} onValueChange={v => setSelectedRevisionId(parseInt(v))}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Revision" /></SelectTrigger>
            <SelectContent>
              {revisions.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>Rev {r.revision_number}{r.is_current ? " · Current" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge className={`border shrink-0 ${STATUS_COLOURS[currentStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
            {isFrozen && <Lock className="h-3 w-3 mr-1 inline-block" />}
            {STATUS_LABELS[currentStatus] ?? currentStatus}
          </Badge>

          {/* Quick lifecycle shortcuts */}
          {lifecycleActions.slice(0, 2).map(la => (
            <Button
              key={la.action}
              size="sm"
              variant={la.variant ?? "default"}
              className="h-8 text-xs shrink-0"
              onClick={() => { setActiveStep("revision_control"); }}
              title={`Go to Review & Revision Control to ${la.label}`}
            >
              {la.label}
            </Button>
          ))}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: numbered step sidebar */}
          <div className="w-64 border-r bg-gray-50 overflow-auto shrink-0">
            <div className="p-3">
              {STEPS.map(step => {
                const Icon = step.icon;
                const isActive = activeStep === step.key;
                // Validation indicator
                const hasFail = step.key === "design_validation" && validationChecks.some(c => c.status === "fail");
                return (
                  <button
                    key={step.key}
                    onClick={() => setActiveStep(step.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors mb-0.5 ${
                      isActive ? "bg-blue-600 text-white shadow-sm" : "hover:bg-gray-100 text-gray-700"
                    }`}
                  >
                    <span className={`text-xs font-bold w-5 shrink-0 ${isActive ? "text-blue-200" : "text-gray-400"}`}>{step.id}</span>
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-blue-200" : "text-gray-400"}`} />
                    <span className="text-xs font-medium leading-tight">{step.label}</span>
                    {hasFail && <span className="ml-auto w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-auto p-6">
            {/* Frozen banner */}
            {isFrozen && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4 text-sm text-blue-800">
                <Lock className="h-4 w-4 shrink-0" />
                This revision is frozen (status: {STATUS_LABELS[currentStatus]}). Create a new revision to edit inputs.
              </div>
            )}

            {/* Section header */}
            <div className="flex items-center gap-3 mb-5">
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                activeStep === activeStepDef.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"
              }`}>
                {activeStepDef.id}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{activeStepDef.label}</h2>
                {savingSection === activeStep && <p className="text-xs text-blue-500 flex items-center gap-1"><Save className="h-3 w-3" /> Saving…</p>}
              </div>
            </div>

            {renderStepContent(activeStep)}
          </div>
        </div>
      </div>

      {/* ── New Revision dialog ─────────────────────────────────────────────── */}
      <Dialog open={showNewRevision} onOpenChange={setShowNewRevision}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create New Revision</DialogTitle></DialogHeader>
          <div className="py-2">
            <p className="text-sm text-gray-500 mb-3">A new revision copies all inputs and assumptions from the current revision. Results are not copied.</p>
            <Label>Change Description</Label>
            <Textarea className="mt-1.5" rows={3} placeholder="What changed from the previous revision?" value={revisionNote} onChange={e => setRevisionNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewRevision(false)}>Cancel</Button>
            <Button onClick={() => newRevisionMutation.mutate()} disabled={newRevisionMutation.isPending}>
              {newRevisionMutation.isPending ? "Creating…" : "Create Revision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lifecycle dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!showLifecycle} onOpenChange={() => setShowLifecycle(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{showLifecycle?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label>Comments (optional)</Label>
            <Textarea className="mt-1.5" rows={3} placeholder="Add a comment for the audit trail…" value={lifecycleComment} onChange={e => setLifecycleComment(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLifecycle(null)}>Cancel</Button>
            <Button onClick={() => showLifecycle && lifecycleMutation.mutate(showLifecycle)} disabled={lifecycleMutation.isPending}>
              {lifecycleMutation.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
