import { useState, useEffect, useCallback } from "react";
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
  EMULSION_BEHAVIOUR_DEFAULT, PENDING_VALIDATION, FLUID_PROPERTY_PROVENANCE,
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
  });
  const runsQ = useQuery<CalcRun[]>({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/runs`],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/runs`) as Promise<CalcRun[]>,
    enabled: !!activeRevisionId,
  });
  const resultsQ = useQuery<any[]>({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/results`],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/results`) as Promise<any[]>,
    enabled: !!activeRevisionId,
  });
  const approvalsQ = useQuery<Approval[]>({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/approvals`],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/approvals`) as Promise<Approval[]>,
    enabled: !!activeRevisionId,
  });

  // Populate local data from API whenever inputs load
  useEffect(() => {
    if (!inputsQ.data) return;
    const merged: Record<string, Record<string, string>> = {};
    for (const inp of inputsQ.data as any[]) {
      merged[inp.section] = inp.data ?? {};
    }
    setLocalData(merged);
  }, [inputsQ.data]);

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
    // RRBO kinematic viscosity — calculated from dynamic viscosity ÷ density
    const mu = numOrNull(fp.rrbo_viscosity_dynamic_value);
    const rho = numOrNull(`${"rrbo_density_value" in u ? u.rrbo_density_value : fp.rrbo_density_value}`);
    if (mu !== null && rho !== null && rho > 0 && blank("rrbo_viscosity_kinematic_value")) {
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
    if (blank("emulsion_behaviour")) u.emulsion_behaviour = EMULSION_BEHAVIOUR_DEFAULT;
    if (Object.keys(u).length > 0) commitSection("fluid_properties", u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, isFrozen, activeRevisionId, inputsQ.data, epdNmpQ.data, localData, savingSection, upsertMutation.isPending]);

  // ── Cooling Water default initialization (Design Basis) ─────────────────────
  // A new Design Basis persists all four CW defaults together, without waiting
  // for the engineer's first edit: Inlet = Ambient, ΔT = 8 °C (Auto-Populated),
  // Outlet = Inlet + ΔT, CT Approach = Inlet − Wet Bulb. Blank-only — never
  // overwrites engineer-entered or manual values.
  useEffect(() => {
    if (isFrozen || !activeRevisionId || !inputsQ.data) return;
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
  }, [isFrozen, activeRevisionId, inputsQ.data, localData, savingSection, upsertMutation.isPending]);

  // ── Process Design (Stage 4) default initialization ─────────────────────────
  // Consumes the approved Design Basis: S/O ratio 1.5 (vol/vol), 6 theoretical
  // stages, 60 % stage efficiency, 20 % design margin; Extraction T/P track the
  // Design Basis Operating T/P until manually changed. Blank-only for defaults;
  // tracked fields never override a manual value.
  useEffect(() => {
    if (activeStep !== "process_design" || isFrozen || !activeRevisionId || !inputsQ.data) return;
    if (savingSection !== null || upsertMutation.isPending) return;
    const pd = localData["process_design"] ?? {};
    const dbx = localData["design_basis"] ?? {};
    const u: Record<string, string> = {};
    const blank = (k: string) => (pd[k] ?? "").trim() === "";
    if (blank("so_ratio")) u.so_ratio = SO_RATIO_DEFAULT;
    if (blank("theoretical_stages")) u.theoretical_stages = THEORETICAL_STAGES_DEFAULT;
    if (blank("stage_efficiency")) u.stage_efficiency = STAGE_EFFICIENCY_DEFAULT;
    if (blank("design_margin")) u.design_margin = DESIGN_MARGIN_DEFAULT;
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
  }, [activeStep, isFrozen, activeRevisionId, inputsQ.data, localData, savingSection, upsertMutation.isPending]);

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
            value={db.solvent || "NMP"}
            onChange={v => f("solvent", v)}
            onBlur={s}
            onCommit={v => csa({ solvent: v })}
            options={db.solvent && db.solvent !== "NMP" ? ["NMP", db.solvent] : ["NMP"]}
            note="Default NMP. Controlled list — expanded via master data only. Drives the Fluid Properties section."
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
            note="Manual — no process-configuration rule or master data available"
          />
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
          <div className="border-t pt-3 space-y-3">
            <SelectRow label="Colour Scale" value={db.colour_scale ?? ""} onChange={v => f("colour_scale", v)} onBlur={s} onCommit={v => cs({ colour_scale: v })} options={["ASTM D1500", "Saybolt"]} allowOther />
            <FieldRow label="Colour Value" value={db.product_colour ?? ""} onChange={v => f("product_colour", v)} onBlur={s} />
            <FieldRow label="Raffinate Yield" value={db.raffinate_yield ?? ""} onChange={v => f("raffinate_yield", v)} onBlur={s} unit="%" />
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
        {["interfacial_tension", "mutual_solubility"].includes(key) && (fp[`${key}_value`] ?? "").trim() === "" && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 mx-2 mt-0.5 inline-block">
            {PENDING_VALIDATION} — no approved NMP/RRBO two-phase value; enter laboratory/vendor data
          </p>
        )}
      </div>
    );
    const assumedCount = ["rrbo_density", "rrbo_viscosity_dynamic", "rrbo_viscosity_kinematic", "nmp_density", "nmp_viscosity_dynamic", "interfacial_tension", "mutual_solubility"]
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
          {prop("Interfacial Tension", "interfacial_tension")}
          {prop("Mutual Solubility", "mutual_solubility")}
          <div className="grid grid-cols-[180px_1fr] gap-3 py-1.5">
            <span className="text-sm text-gray-700 font-medium">Phase Separation Time</span>
            <div className="flex gap-2">
              <Input value={fp.phase_separation_time ?? ""} onChange={e => f("phase_separation_time", e.target.value)} onBlur={s} placeholder="Value" className="h-7 text-xs flex-1" />
              <Input value={fp.phase_separation_time_unit ?? ""} onChange={e => f("phase_separation_time_unit", e.target.value)} onBlur={s} placeholder="Unit" className="h-7 text-xs w-[90px]" />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 px-2 -mt-0.5">{FLUID_PROPERTY_PROVENANCE.phase_separation_time}</p>
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
    const feedLph = numOrNull(dbx.design_capacity_lph ?? dbx.design_capacity);
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
    return (
      <div className="max-w-3xl">
        <SectionCard title="Hydraulic Inputs">
          <FieldRow label="Column Diameter (trial)" value={hd.column_diameter ?? ""} onChange={v => f("column_diameter", v)} onBlur={s} unit="m" placeholder="Or leave blank to auto-size" />
          <FieldRow label="Continuous Phase Density" value={hd.cont_density ?? d("fluid_properties").nmp_density_value ?? ""} onChange={v => f("cont_density", v)} onBlur={s} unit="kg/m³" note="Auto-filled from Fluid Properties" />
          <FieldRow label="Dispersed Phase Density" value={hd.disp_density ?? d("fluid_properties").rrbo_density_value ?? ""} onChange={v => f("disp_density", v)} onBlur={s} unit="kg/m³" />
          <FieldRow label="Continuous Phase Viscosity" value={hd.cont_viscosity ?? d("fluid_properties").nmp_viscosity_dynamic_value ?? ""} onChange={v => f("cont_viscosity", v)} onBlur={s} unit="mPa·s" />
          <FieldRow label="Dispersed Phase Viscosity" value={hd.disp_viscosity ?? d("fluid_properties").rrbo_viscosity_dynamic_value ?? ""} onChange={v => f("disp_viscosity", v)} onBlur={s} unit="mPa·s" />
          <FieldRow label="Interfacial Tension" value={hd.interfacial_tension ?? d("fluid_properties").interfacial_tension_value ?? ""} onChange={v => f("interfacial_tension", v)} onBlur={s} unit="mN/m" />
          <FieldRow label="Total Volumetric Flow" value={hd.total_flow ?? ""} onChange={v => f("total_flow", v)} onBlur={s} unit="m³/h" />
          <FieldRow label="Flooding Margin Design" value={hd.flooding_margin_design ?? "70"} onChange={v => f("flooding_margin_design", v)} onBlur={s} unit="%" />
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

  function renderEquipmentDesign() {
    if (!techSelection) {
      return (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Complete Technology Selection (Step 6) before designing equipment.
        </div>
      );
    }
    return (
      <div className={`max-w-5xl ${techSelection === "both" ? "grid grid-cols-2 gap-6" : ""}`}>
        {showECP && renderECPDesign()}
        {showECR && renderECRDesign()}
      </div>
    );
  }

  function renderECPDesign() {
    const ec = d("ecp_design");
    const f = field("ecp_design");
    const s = save("ecp_design");
    const ecpRun = runs.find(r => r.calculation_type === "ecp" && r.calculation_status === "success");
    return (
      <div>
        <SectionCard title="ECP — Packed Extraction Column">
          <FieldRow label="Packing Manufacturer" value={ec.manufacturer ?? ""} onChange={v => f("manufacturer", v)} onBlur={s} />
          <FieldRow label="Packing Type" value={ec.packing_type ?? ""} onChange={v => f("packing_type", v)} onBlur={s} placeholder="e.g. Sulzer MellapakPlus" />
          <FieldRow label="Packing Material" value={ec.packing_material ?? ""} onChange={v => f("packing_material", v)} onBlur={s} placeholder="e.g. 316L SS" />
          <FieldRow label="Specific Surface Area" value={ec.specific_surface_area ?? ""} onChange={v => f("specific_surface_area", v)} onBlur={s} unit="m²/m³" />
          <FieldRow label="Void Fraction" value={ec.void_fraction ?? ""} onChange={v => f("void_fraction", v)} onBlur={s} unit="—" />
          <FieldRow label="HETS (design)" value={ec.hets ?? ""} onChange={v => f("hets", v)} onBlur={s} unit="m" />
          <FieldRow label="Packing Height" value={ec.packing_height ?? ""} onChange={v => f("packing_height", v)} onBlur={s} unit="m" />
          <FieldRow label="Packing Volume" value={ec.packing_volume ?? ""} onChange={v => f("packing_volume", v)} onBlur={s} unit="m³" />
          <FieldRow label="Pressure Drop" value={ec.pressure_drop ?? ""} onChange={v => f("pressure_drop", v)} onBlur={s} unit="Pa/m" />
          <FieldRow label="Liquid Distributor" value={ec.liquid_distributor ?? ""} onChange={v => f("liquid_distributor", v)} onBlur={s} />
          <FieldRow label="Packing Support Plate" value={ec.support_plate ?? ""} onChange={v => f("support_plate", v)} onBlur={s} />
          <FieldRow label="Hold Down Grid" value={ec.hold_down_grid ?? ""} onChange={v => f("hold_down_grid", v)} onBlur={s} />
          <FieldRow label="Total Column Height" value={ec.total_column_height ?? ""} onChange={v => f("total_column_height", v)} onBlur={s} unit="m" />
        </SectionCard>
        <Button size="sm" className="gap-2 mb-4" disabled={isFrozen || calculateMutation.isPending} onClick={() => calculateMutation.mutate("ecp")}>
          <Play className="h-3.5 w-3.5" /> Calculate ECP
        </Button>
        {ecpRun && <p className="text-xs text-gray-400 mb-2">Last run: {new Date(ecpRun.calculated_at).toLocaleString()}</p>}
      </div>
    );
  }

  function renderECRDesign() {
    const er = d("ecr_design");
    const f = field("ecr_design");
    const s = save("ecr_design");
    const ecrRun = runs.find(r => r.calculation_type === "ecr" && r.calculation_status === "success");
    return (
      <div>
        <SectionCard title="ECR — Kühni Agitated Column">
          <FieldRow label="Rotor Diameter" value={er.rotor_diameter ?? ""} onChange={v => f("rotor_diameter", v)} onBlur={s} unit="m" />
          <FieldRow label="Rotor Speed" value={er.rotor_speed ?? ""} onChange={v => f("rotor_speed", v)} onBlur={s} unit="rpm" />
          <FieldRow label="Tip Speed" value={er.tip_speed ?? ""} onChange={v => f("tip_speed", v)} onBlur={s} unit="m/s" />
          <FieldRow label="Rotor Reynolds Number" value={er.rotor_re ?? ""} onChange={v => f("rotor_re", v)} onBlur={s} unit="—" />
          <FieldRow label="Rotor Weber Number" value={er.rotor_we ?? ""} onChange={v => f("rotor_we", v)} onBlur={s} unit="—" />
          <FieldRow label="Rotor Froude Number" value={er.rotor_fr ?? ""} onChange={v => f("rotor_fr", v)} onBlur={s} unit="—" />
          <FieldRow label="Power Number" value={er.power_number ?? ""} onChange={v => f("power_number", v)} onBlur={s} unit="—" />
          <FieldRow label="Power Per Rotor" value={er.power_per_rotor ?? ""} onChange={v => f("power_per_rotor", v)} onBlur={s} unit="W" />
          <FieldRow label="Number of Compartments" value={er.compartment_count ?? ""} onChange={v => f("compartment_count", v)} onBlur={s} unit="—" />
          <FieldRow label="Compartment Height" value={er.compartment_height ?? ""} onChange={v => f("compartment_height", v)} onBlur={s} unit="m" />
          <FieldRow label="Active Height" value={er.active_height ?? ""} onChange={v => f("active_height", v)} onBlur={s} unit="m" />
          <FieldRow label="Shaft Power" value={er.shaft_power ?? ""} onChange={v => f("shaft_power", v)} onBlur={s} unit="kW" />
          <FieldRow label="Total Column Height" value={er.total_column_height ?? ""} onChange={v => f("total_column_height", v)} onBlur={s} unit="m" />
        </SectionCard>
        <Button size="sm" className="gap-2 mb-4" disabled={isFrozen || calculateMutation.isPending} onClick={() => calculateMutation.mutate("ecr")}>
          <Play className="h-3.5 w-3.5" /> Calculate ECR
        </Button>
        {ecrRun && <p className="text-xs text-gray-400 mb-2">Last run: {new Date(ecrRun.calculated_at).toLocaleString()}</p>}
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
    const rows = [
      { key: "column_diameter",  label: "Column Diameter",  unit: "m" },
      { key: "active_height",    label: "Active Height",    unit: "m" },
      { key: "total_height",     label: "Total Height",     unit: "m" },
      { key: "flooding_margin",  label: "Flooding Margin",  unit: "%" },
      { key: "pressure_drop",    label: "Pressure Drop",    unit: "Pa/m" },
      { key: "shaft_power",      label: "Shaft Power",      unit: "kW" },
      { key: "moving_parts",     label: "Moving Parts",     unit: "—" },
      { key: "fouling_resistance",label: "Fouling Resistance",unit: "—" },
      { key: "maintenance",      label: "Maintenance",      unit: "—" },
      { key: "turndown",         label: "Turndown",         unit: "—" },
      { key: "capex",            label: "CAPEX",            unit: "₹ Lakhs" },
      { key: "opex",             label: "OPEX",             unit: "₹ Lakhs/yr" },
    ];
    return (
      <div className="max-w-3xl">
        <SectionCard title="Technology Comparison — ECP vs ECR">
          <div className="grid grid-cols-[1fr_130px_130px] gap-1 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parameter</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">ECP</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">ECR</span>
          </div>
          {rows.map(row => (
            <div key={row.key} className="grid grid-cols-[1fr_130px_130px] gap-1 items-center py-1.5 border-b last:border-0">
              <span className="text-sm text-gray-700">{row.label} <span className="text-gray-400 text-xs">({row.unit})</span></span>
              <Input value={tc[`ecp_${row.key}`] ?? ""} onChange={e => f(`ecp_${row.key}`, e.target.value)} onBlur={s} className="h-7 text-xs text-center" placeholder="—" />
              <Input value={tc[`ecr_${row.key}`] ?? ""} onChange={e => f(`ecr_${row.key}`, e.target.value)} onBlur={s} className="h-7 text-xs text-center" placeholder="—" />
            </div>
          ))}
        </SectionCard>
        <SectionCard title="Selection Decision">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-3">
            <AlertTriangle className="inline h-4 w-4 mr-1" />
            <strong>The software never automatically selects the preferred technology.</strong> The engineer must make this decision based on technical merit and project requirements.
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer ${tc.preferred === "ecp" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
              <input type="radio" name="preferred" value="ecp" checked={tc.preferred === "ecp"} onChange={() => { f("preferred", "ecp"); s(); }} disabled={isFrozen} />
              <span className="font-medium text-sm">ECP Preferred</span>
            </label>
            <label className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer ${tc.preferred === "ecr" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
              <input type="radio" name="preferred" value="ecr" checked={tc.preferred === "ecr"} onChange={() => { f("preferred", "ecr"); s(); }} disabled={isFrozen} />
              <span className="font-medium text-sm">ECR Preferred</span>
            </label>
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
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-4">
          <Info className="h-4 w-4 shrink-0" />
          Architecture designed for future integration with ASME Section VIII, IS 2825 and PV Elite.
        </div>
        <SectionCard title="Vessel Sizing">
          <FieldRow label="Vessel Diameter" value={md.vessel_diameter ?? ""} onChange={v => f("vessel_diameter", v)} onBlur={s} unit="mm" />
          <FieldRow label="Shell Thickness" value={md.shell_thickness ?? ""} onChange={v => f("shell_thickness", v)} onBlur={s} unit="mm" />
          <FieldRow label="Head Type" value={md.head_type ?? ""} onChange={v => f("head_type", v)} onBlur={s} placeholder="e.g. Torispherical, 2:1 Ellipsoidal" />
          <FieldRow label="Corrosion Allowance" value={md.corrosion_allowance ?? ""} onChange={v => f("corrosion_allowance", v)} onBlur={s} unit="mm" />
          <FieldRow label="Shell Material" value={md.shell_material ?? ""} onChange={v => f("shell_material", v)} onBlur={s} placeholder="e.g. SA-516 Gr 70 / 304L SS" />
        </SectionCard>
        <SectionCard title="Nozzle Schedule">
          <TextAreaRow label="Nozzle Description" value={md.nozzle_schedule ?? ""} onChange={v => f("nozzle_schedule", v)} onBlur={s} rows={4} placeholder="Aqueous feed, Solvent feed, Raffinate outlet, Extract outlet, Vent, Drain…" />
        </SectionCard>
        <SectionCard title="Structural">
          <FieldRow label="Support Type" value={md.supports ?? ""} onChange={v => f("supports", v)} onBlur={s} placeholder="e.g. Skirt, Lug, Saddle" />
          <FieldRow label="Skirt Height" value={md.skirt_height ?? ""} onChange={v => f("skirt_height", v)} onBlur={s} unit="mm" />
          <FieldRow label="Lifting Lugs" value={md.lifting_lugs ?? ""} onChange={v => f("lifting_lugs", v)} onBlur={s} placeholder="e.g. 2 × Trunnion, Qty / Rating" />
        </SectionCard>
      </div>
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
      { key: "design_basis",       title: "Design Basis Report",          desc: "Summary of all design inputs, operating conditions and product requirements." },
      { key: "process_design",     title: "Process Design Report",        desc: "Material balance, solvent balance and process design summary." },
      { key: "hydraulic_calc",     title: "Hydraulic Calculation Report", desc: "Full hydraulic calculation workings with formulas and references." },
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
          {reportCards.map(rc => (
            <div key={rc.key} className="border rounded-xl p-4 bg-white">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-semibold text-sm text-gray-900">{rc.title}</p>
                <FileDown className="h-4 w-4 text-gray-300 shrink-0 mt-0.5" />
              </div>
              <p className="text-xs text-gray-500 mb-3">{rc.desc}</p>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs gap-1.5"
                disabled={true}
                title="Report generation — Stage C"
              >
                <FileDown className="h-3.5 w-3.5" />
                Generate (Stage C)
              </Button>
            </div>
          ))}
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
