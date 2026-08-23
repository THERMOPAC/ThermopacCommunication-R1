import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
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
  ArrowLeft, Lock, GitBranch, ChevronRight, ChevronDown, CheckCircle2, XCircle,
  AlertCircle, FileText, BookOpen, Droplets, Activity, Calculator,
  GitFork, Settings, Wrench, Zap, DollarSign, ShieldCheck,
  FileDown, History, Play, Save, AlertTriangle, Info, Check, ChevronsUpDown
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PRODUCT_REQUIREMENT_MASTER, PRODUCT_PARAMETER_MASTER, shouldSeedRequirementRows } from "@shared/product-requirement-master";
import {
  NMP_MASTER,
  RRBO_FEED_VISCOSITY_MASTER, RRBO_FEED_VISCOSITY_REF_TEMP,
  EMULSION_BEHAVIOUR_DEFAULT, EMULSION_BEHAVIOUR_LEGACY_DEFAULT, PENDING_VALIDATION, FLUID_PROPERTY_PROVENANCE,
  TWO_PHASE_SCREENING_DEFAULTS, TWO_PHASE_SCREENING_SOURCE, TWO_PHASE_SCREENING_REF_TEMP,
} from "@shared/fluid-properties-master";
import { resolveNtInputs } from "@/lib/nt-requirement-resolver";
import { validateEcr2Stage8, ECR2_STAGE8_COMPONENTS, ECR2_STAGE8_SOURCE_TYPES } from "@/lib/ecr2-stage8-validation";
import { getEcr2Stage8LiveDependencies } from "@/lib/ecr2-stage8-live-dependencies";
import { getEcr2D32SnapshotGovernance } from "@/lib/ecr2-d32-snapshot-governance";
import { canDisplayECR2PreliminaryTransferPerformance } from "@/lib/ecr2-transfer-presentation";
import {
  ECR2_STAGE8_VISIBLE_STATE_LABELS,
  getEcr2Stage8VisibleResolutionState,
} from "@/lib/ecr2-stage8-display";
import {
  findEcr2Stage8Evidence,
  type ECR2Stage8NumericalParameterId,
} from "@shared/ecr2-stage8-evidence";

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
  { id: 8,  key: "ecr2_simulation",       label: "ECR-2 Process Simulation", icon: Play },
  { id: 9,  key: "mechanical_design",     label: "Mechanical Design",        icon: Wrench },
  { id: 10, key: "utilities",             label: "Utilities",                icon: Zap },
  { id: 11, key: "cost_estimation",       label: "Cost Estimation",          icon: DollarSign },
  { id: 12, key: "design_validation",     label: "Design Validation",        icon: ShieldCheck },
  { id: 13, key: "reports",               label: "Reports",                  icon: FileDown },
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
  label, value, onChange, onBlur, type = "text", unit, placeholder, readOnly = false, note, error,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  type?: string; unit?: string; placeholder?: string; readOnly?: boolean; note?: string; error?: string;
}) {
  return (
    <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
      <label className={`text-sm pt-2 font-medium leading-tight ${error ? "text-red-600" : "text-gray-600"}`}>{label}{error && <span className="text-red-500 ml-0.5">*</span>}</label>
      <div>
        <Input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder ?? label}
          readOnly={readOnly}
          className={`h-8 text-sm ${readOnly ? "bg-gray-50 text-gray-500" : ""} ${error ? "border-red-400 focus-visible:ring-red-400 bg-red-50" : ""}`}
        />
        {error && <p className="text-xs text-red-600 mt-1 font-medium">{error}</p>}
        {note && !error && <p className="text-xs text-gray-400 mt-1">{note}</p>}
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
  label, value, onChange, onBlur, onCommit, options, allowOther = false, unit, note, error,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  onCommit?: (v: string) => void; options: string[]; allowOther?: boolean; unit?: string; note?: string; error?: string;
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
          <SelectTrigger className={`h-8 text-sm ${error ? "border-red-400 focus:ring-red-400 bg-red-50" : ""}`}><SelectValue placeholder={`Select ${label}`} /></SelectTrigger>
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
        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
        {note && !error && <p className="text-xs text-gray-400">{note}</p>}
      </div>
      <div className="pt-2 min-w-[60px]">{unit && <span className="text-xs text-gray-400">{unit}</span>}</div>
    </div>
  );
}

/** Governed suggestion: shows basis + suggested value; engineer must Apply (never auto-copied).
 *  If the confirmed value differs from the suggestion, an override reason is required. */
/** Searchable dropdown (combobox) row — options list is master-data driven. */
function SearchSelectRow({
  label, value, options, onSelect, unit, note, placeholder, error,
}: {
  label: string; value: string; options: string[]; onSelect: (v: string) => void;
  unit?: string; note?: string; placeholder?: string; error?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
      <label className={`text-sm pt-2 font-medium leading-tight ${error ? "text-red-600" : "text-gray-600"}`}>
        {label}{error && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="space-y-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={`h-8 w-full justify-between text-sm font-normal ${error ? "border-red-400 bg-red-50 text-red-900" : ""}`}
            >
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
        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
        {note && !error && <p className="text-xs text-gray-400">{note}</p>}
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
// SO_RATIO_DEFAULT deliberately removed — S/O is a governed engineer input with no silent default (A-2).
const TOTAL_AROMATICS_DEFAULT = "2.7";
// DESIGN_MARGIN_DEFAULT deliberately removed — Design Margin is a governed project input with no silent default (A-3).
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

// Cross-stage error keys per stage — fields whose UI lives in a DIFFERENT stage's form.
// Add entries here as each stage's validation is approved and cross-stage rules emerge.
// The footer uses this to show "N fields in a later stage" instead of "N fields missing on this page".
const CROSS_STAGE_ERROR_KEYS: Partial<Record<string, Set<string>>> = {};

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
  label, propKey, data, onChange, onBlur, error,
}: {
  label: string;
  propKey: string;
  data: Record<string, string>;
  onChange: (key: string, val: string) => void;
  onBlur: () => void;
  error?: string;
}) {
  const src = (data[`${propKey}_source`] ?? "Measured") as Source;
  const isAssumed = src === "Assumed";
  return (
    <div>
      <div className={`grid grid-cols-[180px_110px_90px_110px_120px] items-center gap-2 py-1.5 px-2 rounded-lg ${
        error ? "bg-red-50 border border-red-200" : isAssumed ? "bg-amber-50 border border-amber-200" : ""
      }`}>
        <span className={`text-sm font-medium ${error ? "text-red-700" : "text-gray-700"}`}>
          {label}
          {error && <span className="text-red-500 ml-0.5">*</span>}
          {!error && isAssumed && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
        </span>
        <Input
          value={data[`${propKey}_value`] ?? ""}
          onChange={e => onChange(`${propKey}_value`, e.target.value)}
          onBlur={onBlur}
          placeholder="Value"
          className={`h-7 text-xs ${error ? "border-red-400" : ""}`}
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
      {error && <p className="text-xs text-red-600 font-medium px-2 mt-0.5">{error}</p>}
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
  result_snapshot?: {
    maximumCase?: {
      flows?: {
        rrboVolumetricFlow_m3_h?: number;
        nmpVolumetricFlow_m3_h?: number;
      };
    };
  };
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
  const [ecr2RunPreparing, setEcr2RunPreparing] = useState(false);
  const [ecr2AcceptancePreparing, setEcr2AcceptancePreparing] = useState(false);
  const [lastEcr2RunReceipt, setLastEcr2RunReceipt] = useState<{ revisionId: number; run: CalcRun } | null>(null);
  const [stage8ExpandedRows, setStage8ExpandedRows] = useState<Record<string, boolean>>({});

  // ── Stage-by-stage validation ────────────────────────────────────────────────
  // errors:   { stageKey → { fieldKey → errorMessage } }  — block forward nav
  // warnings: { stageKey → { fieldKey → warningMessage } } — shown but do not block
  // attempted: set of stages where the user has tried to navigate forward via "Next →"
  const [stageValidationErrors,   setStageValidationErrors]   = useState<Partial<Record<StepKey, Record<string, string>>>>({});
  const [stageValidationWarnings, setStageValidationWarnings] = useState<Partial<Record<StepKey, Record<string, string>>>>({});
  const [stageValidationAttempted, setStageValidationAttempted] = useState<Set<StepKey>>(new Set());

  // New revision dialog
  const [showNewRevision, setShowNewRevision] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");

  // Lifecycle dialog
  const [showLifecycle, setShowLifecycle] = useState<string | null>(null);
  const [lifecycleComment, setLifecycleComment] = useState("");

  // DS-SEL — engineer decision dialog (approve / request_verification / override)
  const [dselDialog, setDselDialog] = useState<string | null>(null);
  const [dselEngineer, setDselEngineer] = useState("");
  const [dselReason, setDselReason] = useState("");
  const [dselOverrideTech, setDselOverrideTech] = useState("");
  const [dselOverrideDia, setDselOverrideDia] = useState("");

  // DS-SEL-006 — governed user diameter selection (Step 7)
  const [udOpen, setUdOpen] = useState(false);
  const [udDia, setUdDia] = useState("");
  const [udEngineer, setUdEngineer] = useState("");
  const [udReason, setUdReason] = useState("");

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
  const stage8ResolutionQ = useQuery<any>({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/ecr2-stage8-resolution`],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/ecr2-stage8-resolution`) as Promise<any>,
    enabled: !!activeRevisionId && activeStep === "ecr2_simulation",
    retry: false,
  });
  const packingsQ = useQuery<any[]>({
    queryKey: ["/api/design-software/packings"],
    queryFn: () => apiRequest("GET", "/api/design-software/packings") as Promise<any[]>,
  });
  // backMixingRisk has no silent default — A-4. Query is disabled until engineer has assessed and entered a value.
  const backMixingRisk = (localData["ecp_design"]?.backmixing_risk as string) ?? "";
  const sulzerQ = useQuery<any>({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/sulzer-screening`, backMixingRisk],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/sulzer-screening?risk=${backMixingRisk}`) as Promise<any>,
    enabled: !!activeRevisionId && backMixingRisk !== "",
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

  const designSelectionQ = useQuery<any>({
    queryKey: [`/api/design-software/revisions/${activeRevisionId}/design-selection`],
    queryFn: () => apiRequest("GET", `/api/design-software/revisions/${activeRevisionId}/design-selection`) as Promise<any>,
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
  // Tracks whether a backfill for newly-required ECR fields has been dispatched this session.
  // Prevents the backfill useEffect from re-triggering while the query refetch is in-flight.
  const ecrBackfillAttemptedRef = useRef<number | null>(null);
  // Tracks the previous N_T calculability state so the auto-trigger fires only
  // on the transition false → true (not on every render while already calculable).
  const ntPrevCalculable = useRef(false);
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

  // Grade from Design Basis — used to select the correct RRBO EPD library fluid.
  const fpGrade = (localData["design_basis"]?.feed_service ?? "Re-Refined Base Oil SN300").trim();

  // Governed density pair — ρNMP(T), ρRRBO_<grade>(T), Δρ(T) — EPD library lookup.
  // Used in Fluid Properties display and Stage 5 hydraulic auto-fill.
  const densityPairQ = useQuery({
    queryKey: [`/api/design-software/epd/density-pair`, fpOtStr, fpGrade],
    queryFn: () => apiRequest("GET", `/api/design-software/epd/density-pair?tc=${encodeURIComponent(fpOtStr)}&grade=${encodeURIComponent(fpGrade)}`) as Promise<any>,
    enabled: fpOt !== null,
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
    // RRBO viscosities — Thermopac Master Data (Default) @ 40 °C, starting
    // values until laboratory measurements; engineer may override.
    const grade = (dbx.feed_service ?? "").trim();
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
    // NMP — EPD values at Operating Temperature (density is application-calculated;
    // only dynamic viscosity is seeded from the EPD data into the workspace field)
    const epd = epdNmpQ.data;
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
  // Seeds only governed engineering defaults. S/O ratio is NOT seeded — it is a
  // project input that must be explicitly entered by the engineer (no silent default).
  // Extraction T/P track the Design Basis Operating T/P until manually changed.
  useEffect(() => {
    if (activeStep !== "process_design" || isFrozen || !activeRevisionId || !inputsQ.data) return;
    if (hydratedRevision !== activeRevisionId) return; // never seed from pre-hydration empty state
    if (savingSection !== null || upsertMutation.isPending) return;
    const pd = localData["process_design"] ?? {};
    const dbx = localData["design_basis"] ?? {};
    const u: Record<string, string> = {};
    const blank = (k: string) => (pd[k] ?? "").trim() === "";
    // so_ratio is intentionally NOT seeded: S/O ratio is a governed project input
    // that the engineer must enter explicitly — no silent default is permitted.
    // theoretical_stages is intentionally NOT seeded: it is the Engineer
    // Override N_T, which must be an explicit engineer action — the governed
    // Coto 2022 auto-calculation is the primary basis (never a default of 6).
    // Total Aromatics is an EDITABLE engineer field (never hard-coded in the
    // engine); blank-only default 2.7 wt % per engineering direction.
    if (blank("rrbo_total_aromatics_wt")) u.rrbo_total_aromatics_wt = TOTAL_AROMATICS_DEFAULT;
    // stage_efficiency is intentionally NOT seeded: it is informational-only
    // (never governs packed-column height, H_active = N_T × HETS) and is never
    // silently assumed at 60 %.
    // design_margin is intentionally NOT seeded: it is a governed project input
    // that the engineer must enter explicitly — no silent default is permitted (A-3).
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

  // ── Hydraulic Design C3 screening defaults (Step 5) ──────────────────────────
  // Pre-populate d32 = 3 mm and n = 1 (both Assumed — Preliminary / Pending
  // Validation) for new d32_terminal cases. Values are stored explicitly in the
  // workspace so the C3 engine always receives visible, traceable inputs — no
  // hidden mapper fallbacks. The engineer may change either value freely; doing
  // so updates the source type and reference to reflect the new basis.
    // n is only seeded in d32_terminal mode; characteristic-velocity routes
    // must carry their own, independently sourced exponent with no default.
  useEffect(() => {
    if (isFrozen || !activeRevisionId) return;
    if (hydratedRevision !== activeRevisionId) return;
    if (savingSection !== null || upsertMutation.isPending) return;
    const hd = localData["hydraulic_design"] ?? {};
    const mode = (hd.hydraulic_model ?? "").trim() || "d32_terminal";
    const updates: Record<string, string> = {};
    const D32_REF = "Thermopac Preliminary Screening Default — d₃₂ = 3 mm (Assumed / Preliminary / Pending Validation)";
    const N_REF   = "Thermopac Preliminary Screening Default — n = 1 (Assumed / Preliminary / Pending Validation)";
    // d32 — always seed when blank; field is consumed only in d32_terminal mode
    // but is stored regardless so a future mode switch retains the screening basis.
    if (!hd.sauter_mean_d32 || hd.sauter_mean_d32.trim() === "") {
      updates.sauter_mean_d32            = "3";
      updates.sauter_mean_d32_source     = "Assumed";
      updates.sauter_mean_d32_source_ref = D32_REF;
    }
    // n — seed only in d32_terminal mode; no governed default in
    // characteristic-velocity routes (engineer must enter a separately sourced value).
    if (mode === "d32_terminal" && (!hd.hindrance_exponent || hd.hindrance_exponent.trim() === "")) {
      updates.hindrance_exponent            = "1";
      updates.hindrance_exponent_source     = "Assumed";
      updates.hindrance_exponent_source_ref = N_REF;
    }
    if (Object.keys(updates).length === 0) return;
    commitSection("hydraulic_design", updates);
  }, [isFrozen, activeRevisionId, hydratedRevision, localData, savingSection, upsertMutation.isPending, commitSection]);

  // ── Legacy technology value migration ────────────────────────────────────────
  // Revisions created before ECP was removed may have technology="ecp" or "both".
  // Auto-migrate to "ecr" on load so the radio button shows correctly and
  // downstream logic (showECR, validation) receives the canonical value.
  useEffect(() => {
    if (isFrozen || !activeRevisionId) return;
    if (hydratedRevision !== activeRevisionId) return;
    if (savingSection !== null || upsertMutation.isPending) return;
    const raw = (localData["technology_selection"]?.technology ?? "").trim();
    if (raw === "ecp" || raw === "both") {
      commitSection("technology_selection", { technology: "ecr" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFrozen, activeRevisionId, hydratedRevision, localData, savingSection, upsertMutation.isPending]);

  // ── Technology Selection rationale auto-population (Step 6) ─────────────────
  // Writes a preliminary rationale when a technology is selected and the field
  // is blank. The engineer can edit or overwrite it freely at any time.
  useEffect(() => {
    if (isFrozen || !activeRevisionId) return;
    if (hydratedRevision !== activeRevisionId) return;
    if (savingSection !== null || upsertMutation.isPending) return;
    const ts = localData["technology_selection"] ?? {};
    const tech = (ts.technology ?? "").trim();
    if (!tech) return; // no technology chosen yet — nothing to seed
    if ((ts.technology_selection_rationale ?? "").trim()) return; // already filled
    const RATIONALE: Record<string, string> = {
      ecr:  "ECR — Kühni Agitated Column selected for this service. Rotating agitator provides higher stage efficiency and throughput adjustability. Preliminary selection — subject to hydraulic screening results and vendor confirmation.",
    };
    const text = RATIONALE[tech];
    if (!text) return;
    commitSection("technology_selection", { technology_selection_rationale: text });
  }, [isFrozen, activeRevisionId, hydratedRevision, localData, savingSection, upsertMutation.isPending, commitSection]);

  // ── N_T auto-calculation trigger ────────────────────────────────────────────
  // Fires the material-balance + N_T run when the user enters RRBO Total
  // Aromatics AND all 8 governed N_T required inputs become valid.
  // Only triggers on the false→true transition (not on every render).
  useEffect(() => {
    if (activeStep !== "process_design" || isFrozen) { ntPrevCalculable.current = false; return; }
    const pd = localData["process_design"] ?? {};
    const db = localData["design_basis"] ?? {};
    const hasTotalAromatics = (pd["rrbo_total_aromatics_wt"] ?? "").trim() !== "";
    if (!hasTotalAromatics) { ntPrevCalculable.current = false; return; }
    const ntNowCalculable = resolveNtInputs(db, pd).calculable;
    if (ntNowCalculable && !ntPrevCalculable.current && !calculateMutation.isPending) {
      calculateMutation.mutate("process_design");
    }
    ntPrevCalculable.current = ntNowCalculable;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, isFrozen, localData]);

  // ── N_T result write-back ────────────────────────────────────────────────────
  // After a process_design calculation completes, copy the engine-calculated N_T
  // (theoreticalStages) back into the workspace field so the engineer can see it
  // and optionally override it.  Skipped if the engineer has already overridden.
  useEffect(() => {
    const pdResult = (resultsQ.data ?? []).find((r: any) => r.section === "process_design");
    const calcNt = pdResult?.data?.stages?.theoreticalStages;   // stages is the nested object
    if (typeof calcNt !== "number" || !Number.isInteger(calcNt) || calcNt < 1) return;
    const pd = localData["process_design"] ?? {};
    if ((pd.theoretical_stages_source ?? "") === "override") return; // respect manual override
    if ((pd.theoretical_stages ?? "").trim() === String(calcNt)) return; // already in sync
    commitSection("process_design", {
      theoretical_stages:        String(calcNt),
      theoretical_stages_source: "calculated",
    });
    setTimeout(() => saveSection("process_design"), 60);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsQ.data]);

  // ── Assumed RRBO characterisation auto-fill (SOFTWARE TESTING ONLY) ─────────
  // Fires ONCE when all 4 class fields are empty, source === "Assumed", and
  // Total Aromatics is a valid number.  Preserves any manually entered values.
  useEffect(() => {
    if (activeStep !== "process_design" || isFrozen) return;
    const pd = localData["process_design"] ?? {};
    if ((pd.rrbo_characterisation_source ?? "") !== "Assumed") return;
    const A = parseFloat((pd.rrbo_total_aromatics_wt ?? "").trim());
    if (!Number.isFinite(A) || A <= 0 || A >= 100) return;
    const allEmpty = ["rrbo_saturates_wt", "rrbo_mono_aromatics_wt", "rrbo_di_aromatics_wt", "rrbo_poly_aromatics_wt"]
      .every(k => (pd[k as keyof typeof pd] ?? "").trim() === "");
    if (!allEmpty) return;
    const sat  = String(parseFloat((100 - A).toFixed(4)));
    const ar3  = String(parseFloat((A / 3).toFixed(4)));
    commitSection("process_design", {
      rrbo_saturates_wt:       sat,
      rrbo_mono_aromatics_wt:  ar3,
      rrbo_di_aromatics_wt:    ar3,
      rrbo_poly_aromatics_wt:  ar3,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, isFrozen, localData]);

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
    mutationFn: (p: { scope: "ecp" | "ecr"; action: "apply" | "clear"; mode?: "reset" | "backfill" }) =>
      apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/preliminary-defaults`, p) as Promise<any>,
    onSuccess: (resp: any, variables: { scope: string; action: string; mode?: string }) => {
      // Server response is authoritative for this section — overwrite local values
      setLocalData(prev => ({ ...prev, [resp.section]: Object.fromEntries(Object.entries(resp.data ?? {}).map(([k, v]) => [k, String(v ?? "")])) }));
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/inputs`] });
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/assumptions`] });
      // Suppress toast for silent auto-backfills (newly required fields on existing workspaces).
      if (variables.mode !== 'backfill') {
        toast({
          title: resp.applied ? "Preliminary defaults applied" : "Preliminary defaults cleared",
          description: resp.applied
            ? `${resp.fieldCount} Assumed-tagged screening defaults populated — editable, Pending Validation.`
            : "Thermopac preliminary default values and their register entries were removed.",
        });
      }
    },
    onError: (e: any) => toast({ title: "Preliminary defaults error", description: e.message, variant: "destructive" }),
  });

  // ── ECP / ECR preliminary equipment screening defaults (Step 7) ───────────────
  // Auto-applies the Thermopac preliminary screening defaults for ECP and/or ECR
  // the first time a technology-selected revision loads with blank height allowances.
  // Uses the same server route as the manual "Reset to Thermopac Preliminary Defaults"
  // button (which also registers each value in the assumptions register).
  // One scope is applied per render pass; the localData update from onSuccess
  // re-triggers the effect and the second scope (if needed) fires on the next pass.
  // The banner and manual reset button remain fully functional — this only seeds
  // a blank workspace; populated or engineer-modified values are never overwritten.
  useEffect(() => {
    if (isFrozen || !activeRevisionId) return;
    if (hydratedRevision !== activeRevisionId) return;
    if (prelimDefaultsMutation.isPending) return;
    const tech = (localData["technology_selection"]?.technology ?? "").trim();
    const ecr = localData["ecr_design"] ?? {};
    // Full apply — technology is ECR and height allowances are completely absent (brand new workspace)
    if (tech === "ecr" && !(ecr.top_head_height ?? "").trim()) {
      prelimDefaultsMutation.mutate({ scope: "ecr", action: "apply" });
      return;
    }
    // Backfill — ECR workspace already has height allowances (engineer values present) but is
    // missing a newly required field added after the workspace was created (e.g. system_derating_factor,
    // ecr_preliminary_hydraulic_capacity, ecr_interfacial_tension — A1/A2/A3 governance 2026-08-16).
    // backfill mode writes only absent fields — never overwrites engineer-modified values.
    // The ref guard prevents re-triggering while the query refetch is in-flight after the mutation.
    const ecrNeedsBackfill =
      !(ecr.system_derating_factor ?? "").trim() ||
      !(ecr.ecr_preliminary_hydraulic_capacity ?? "").trim() ||
      !(ecr.ecr_interfacial_tension ?? "").trim();
    if (
      tech === "ecr" &&
      (ecr.top_head_height ?? "").trim() &&
      ecrNeedsBackfill &&
      ecrBackfillAttemptedRef.current !== activeRevisionId
    ) {
      ecrBackfillAttemptedRef.current = activeRevisionId;
      prelimDefaultsMutation.mutate({ scope: "ecr", action: "apply", mode: "backfill" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFrozen, activeRevisionId, hydratedRevision, localData, prelimDefaultsMutation.isPending]);

  // ── Utility calculation helper ─────────────────────────────────────────────
  // Derives the four calculable utility fields from workspace inputs + EPD data.
  // Returns null when required inputs are absent (caller should not commit).
  // Physical constants: Cp_NMP 1.67 kJ/(kg·K), Cp_RRBO 2.1 kJ/(kg·K),
  // pump ΔP 300 kPa screening, η_pump 0.65, Cp_water 4.186 kJ/(kg·K).
  // Steam and nitrogen require stripping-column design — left for manual entry.
  function computeUtilities(): Record<string, string> | null {
    const db  = localData["design_basis"]       ?? {};
    const pd  = localData["process_design"]     ?? {};
    const ts  = localData["technology_selection"] ?? {};

    const T_op      = numOrNull(db.operating_temperature);
    const T_amb     = numOrNull(db.ambient_temperature ?? AMBIENT_DEFAULT) ?? 25;
    const T_CW_in   = numOrNull(db.cw_inlet_temperature ?? String(T_amb));
    const dT_CW     = numOrNull(db.cw_delta_t ?? CW_DELTA_T_DEFAULT) ?? 8;
    const Q_feed_lph = numOrNull(db.design_capacity_lph ?? db.design_capacity);
    const R          = numOrNull((pd.so_ratio ?? "").trim());
    const margin_pct = numOrNull((pd.design_margin ?? "0").trim()) ?? 0;

    if (T_op === null || Q_feed_lph === null || R === null || T_CW_in === null) return null;

    const dpData = densityPairQ.data as any;
    const rhoNMP  = dpData?.nmp?.value;
    const rhoRRBO = dpData?.rrbo?.value;
    if (!rhoNMP || !rhoRRBO) return null;

    const T_CW_out   = T_CW_in + dT_CW;
    const dT_heat    = T_op - T_CW_out;
    if (dT_heat <= 0) return null; // operating temp must be above CW outlet

    const CP_NMP    = 1.67;   // kJ/(kg·K)
    const CP_RRBO   = 2.1;    // kJ/(kg·K)
    const CP_WATER  = 4.186;  // kJ/(kg·K)
    const RHO_WATER = 1000;   // kg/m³
    const ETA_PUMP  = 0.65;
    const DP_PUMP   = 300000; // Pa — screening

    const f_max = 1 + margin_pct / 100;
    // max-case mass flow rates (kg/s)
    const m_NMP  = (Q_feed_lph * R * f_max) / 1000 / 3600 * rhoNMP;
    const m_RRBO = (Q_feed_lph * f_max)     / 1000 / 3600 * rhoRRBO;

    // 1 — Thermal Oil Duty: heat NMP from T_CW_out back to T_op
    const Q_thermal = m_NMP * CP_NMP * dT_heat;            // kW

    // 2 — CW Duty: cool recycled NMP + cool raffinate from T_op to T_amb
    const Q_raff = m_RRBO * CP_RRBO * (T_op - T_amb);      // kW
    const Q_CW   = Q_thermal + Q_raff;                       // kW

    // 3 — CW Flow
    const V_CW = Q_CW * 3600 / (RHO_WATER * CP_WATER * dT_CW); // m³/h

    // 4 — Electrical Load: pumps (all streams, max case) + ECR motor if present
    const Q_total_m3s = (Q_feed_lph * f_max * (1 + R)) / 1000 / 3600;
    const P_pumps = (Q_total_m3s * DP_PUMP / ETA_PUMP) / 1000; // kW
    let P_elec = P_pumps;
    const tech = (ts.technology ?? "").trim();
    const ecrRes = (resultsQ.data ?? []).find((r: any) => r.section === "ecr");
    const P_motor_W = ecrRes?.data?.maximumCase?.power?.motorDesign?.value;
    if ((tech === "ecr" || tech === "both") && typeof P_motor_W === "number" && isFinite(P_motor_W)) {
      P_elec += P_motor_W / 1000;
    }

    // Unit conversions for Indian thermal-systems convention:
    //   Heating duty  → kcal/h  (1 kW = 860 kcal/h)
    //   Cooling duty  → TR      (1 TR = 3.517 kW)
    //   Electrical    → kW      (unchanged)
    const KW_TO_KCALH = 860;
    const KW_TO_TR    = 1 / 3.517;

    const r2 = (v: number) => String(Math.round(v * 100) / 100);
    return {
      thermal_oil_duty:  r2(Q_thermal * KW_TO_KCALH),
      cw_duty:           r2(Q_CW     * KW_TO_TR),
      cw_flow:           r2(V_CW),
      electrical_load:   r2(P_elec),
      // Sentinel: if this changes, the seeder re-fires even when fields are not blank.
      // Bump this string any time output units change.
      _units_version:    "v2-kcalh-TR",
    };
  }

  // ── Utility auto-seeder (Step 10) ──────────────────────────────────────────
  // Fires on hydration when the four calculable fields are all blank,
  // OR when the stored _units_version sentinel doesn't match the current
  // output format (catches stale values seeded under a previous unit scheme).
  // Steam and nitrogen remain blank (require stripping design — manual entry).
  // The engineer can recalculate at any time using the Recalculate button.
  const UTILITY_UNITS_VERSION = "v2-kcalh-TR";
  useEffect(() => {
    if (isFrozen || !activeRevisionId) return;
    if (hydratedRevision !== activeRevisionId) return;
    const ut = localData["utilities"] ?? {};
    const allBlank = ["thermal_oil_duty", "cw_duty", "cw_flow", "electrical_load"]
      .every(k => !(ut[k] ?? "").trim());
    const staleUnits = (ut as any)._units_version !== UTILITY_UNITS_VERSION;
    if (!allBlank && !staleUnits) return;
    const vals = computeUtilities();
    if (vals) commitSection("utilities", vals);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydratedRevision, activeRevisionId, isFrozen, localData, densityPairQ.data, resultsQ.data]);

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
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/design-selection`] });
    },
    onError: (e: any) => toast({ title: "Calculation error", description: e.message, variant: "destructive" }),
  });

  const dselDecisionMutation = useMutation({
    mutationFn: ({ recordId, body }: { recordId: number; body: any }) =>
      apiRequest("POST", `/api/design-software/design-selection/${recordId}/decision`, body) as Promise<any>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/design-selection`] });
      setDselDialog(null); setDselEngineer(""); setDselReason(""); setDselOverrideTech(""); setDselOverrideDia("");
      toast({ title: "Decision recorded" });
    },
    onError: (e: any) => toast({ title: "Decision failed", description: e.message, variant: "destructive" }),
  });

  const userDiameterMutation = useMutation({
    mutationFn: (body: { diameterMm: number; engineer: string; reason: string }) =>
      apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/design-selection/user-diameter`, body) as Promise<any>,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/design-selection`] });
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/runs`] });
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/results`] });
      qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/reports`] });
      setUdOpen(false); setUdDia(""); setUdEngineer(""); setUdReason("");
      const recalcs = (res?.recalculations ?? []).filter((r: any) => r.runId).map((r: any) => r.calculation).join(", ");
      const reports = (res?.reports ?? []).map((r: any) => `${r.docType}: ${r.error ? "FAILED — " + r.error : r.action}`).join(" · ");
      toast({ title: "Governing diameter applied", description: `Re-run: ${recalcs || "none"}. ${reports ? "Reports — " + reports : ""} New DS-SEL record awaits engineer decision.` });
    },
    onError: (e: any) => toast({ title: "Governing diameter selection rejected", description: e.message, variant: "destructive" }),
  });

  // ── Derived state ─────────────────────────────────────────────────────────────
  const currentStatus = activeRevision?.status ?? design?.revision_status ?? design?.current_status;
  const lifecycleActions = LIFECYCLE_ACTIONS[currentStatus] ?? [];
  const techSelection = localData["technology_selection"]?.technology ?? "";
  const showECP = false; // ECP (Packed Column) removed — ECR — Kühni Agitated Column is the only design technology
  // Legacy revisions may have technology="both" or technology="ecp" stored from before ECP was removed.
  // Treat any non-empty technology value as ECR so the panel renders while the migration effect below
  // auto-writes "ecr" back to the database.
  const showECR = !!(techSelection && techSelection.trim());
  const d = (section: string) => localData[section] ?? {};
  const ecr2Stage8ResolverRecords = stage8ResolutionQ.data?.records;
  const ecr2HasAcceptedEcrRun = (resultsQ.data ?? []).some((r: any) =>
    r.section === "ecr" && r.data?.heightBreakdown?.activeAgitatedHeight?.result,
  );
  // This is the one live Stage 8 readiness model. The register, stage banner,
  // footer count, and validation input all use current resolver metadata rather
  // than treating system-resolved values as blank form fields.
  const ecr2LiveDependencies = getEcr2Stage8LiveDependencies({
    sim: d("ecr_simulator"),
    hasAcceptedEcrRun: ecr2HasAcceptedEcrRun,
    resolverRecords: ecr2Stage8ResolverRecords,
  });

  // ── Stage validation engine ──────────────────────────────────────────────────
  // Returns { errors, warnings } for a given stage.
  //   errors   — blocking: forward nav is prevented until resolved
  //   warnings — advisory: shown but do not block navigation
  // Add each stage's rules here as each is approved.
  function validateStage(stageKey: StepKey): { errors: Record<string, string>; warnings: Record<string, string> } {
    const errors:   Record<string, string> = {};
    const warnings: Record<string, string> = {};
    const numVal = (v: string | undefined): number | null => {
      if (!v?.trim()) return null;
      const n = parseFloat(v.trim());
      return Number.isFinite(n) ? n : null;
    };

    if (stageKey === "design_identity") {
      const di = d("design_identity");
      if (!di.prepared_by?.trim())    errors["prepared_by"]    = "Prepared By is required";
      if (!di.checked_by?.trim())     errors["checked_by"]     = "Checked By is required";
      if (!di.approved_by?.trim())    errors["approved_by"]    = "Approved By is required";
      if (!di.client?.trim())         errors["client"]         = "Client / Customer is required";
      if (!di.plant_location?.trim()) errors["plant_location"] = "Plant Location is required";
    }

    if (stageKey === "design_basis") {
      const db2 = d("design_basis");

      // ── Blocking rules ──────────────────────────────────────────────────────
      // Design Capacity
      const cap = numVal(db2.design_capacity_lph ?? db2.design_capacity);
      if (cap === null || cap <= 0)
        errors["design_capacity_lph"] = "Design Capacity is required and must be > 0 LPH";

      // Feed Service — must be one of the four governed RRBO grades
      const svcOk = FEED_SERVICE_OPTIONS.includes(db2.feed_service ?? "");
      if (!svcOk)
        errors["feed_service"] = "Feed Service (RRBO grade) must be selected — required for fluid property lookup";

      // Operating Temperature — numeric, 0 < T < 200 °C
      const ot2 = numVal(db2.operating_temperature);
      if (ot2 === null)
        errors["operating_temperature"] = "Operating Temperature is required";
      else if (ot2 <= 0 || ot2 >= 200)
        errors["operating_temperature"] = `Operating Temperature ${ot2} °C is out of the governed range (0–200 °C)`;

      // Thermal Oil Type — required for heater duty and thermal design (C9 mechanical)
      if (!db2.thermal_oil_type?.trim())
        errors["thermal_oil_type"] = "Thermal Oil Type / Grade must be selected — required for heater duty and mechanical design";

      // Operating Days — required selection
      if (!db2.operating_days?.trim())
        errors["operating_days"] = "Operating Days must be selected";

      // Design Life — required selection
      if (!db2.design_life?.trim())
        errors["design_life"] = "Design Life must be selected";

      // Feed Temperature — required selection
      if (!db2.feed_temperature?.trim())
        errors["feed_temperature"] = "Feed Temperature must be selected";

      // Feed Pressure — required entry
      if (!db2.feed_pressure?.trim())
        errors["feed_pressure"] = "Feed Pressure must be entered";
    }

    if (stageKey === "fluid_properties") {
      const fp = d("fluid_properties");
      const val = (k: string) => (fp[k] ?? "").trim();

      // ── Blocking rules ──────────────────────────────────────────────────────
      // Core hydraulic design inputs
      if (!val("rrbo_viscosity_dynamic_value"))
        errors["rrbo_viscosity_dynamic"] = "RRBO Dynamic Viscosity is required — needed for hydraulic and packing design";
      if (!val("nmp_viscosity_dynamic_value"))
        errors["nmp_viscosity_dynamic"] = "NMP Dynamic Viscosity is required — needed for hydraulic and packing design";

      // Phase-separation / extraction equilibrium inputs
      if (!val("interfacial_tension_value"))
        errors["interfacial_tension"] = "Interfacial Tension is required — needed for phase-separation design";
      if (!val("nmp_solubility_rrbo_value"))
        errors["nmp_solubility_rrbo"] = "NMP in RRBO-Rich Phase is required — needed for extraction equilibrium";
      if (!val("oil_solubility_nmp_value"))
        errors["oil_solubility_nmp"] = "Oil/Extractables in NMP-Rich Phase is required — needed for extraction equilibrium";

      // Settler sizing input
      if (!val("phase_separation_time"))
        errors["phase_separation_time"] = "Phase Separation Time is required — needed for settler/coalescer sizing";

      // ── Advisory warnings ───────────────────────────────────────────────────
      const assumedProps = ["rrbo_viscosity_dynamic", "rrbo_viscosity_kinematic", "nmp_viscosity_dynamic",
                            "interfacial_tension", "nmp_solubility_rrbo", "oil_solubility_nmp"]
        .filter(k => val(`${k}_source`) === "Assumed");
      if (assumedProps.length > 0)
        warnings["assumed_properties"] = `${assumedProps.length} fluid propert${assumedProps.length > 1 ? "ies" : "y"} still tagged Assumed — replace with laboratory or vendor data before final release`;
    }

    if (stageKey === "process_design") {
      const pd = d("process_design");
      const val = (k: string) => (pd[k] ?? "").trim();

      // ── Blocking rules ──────────────────────────────────────────────────────
      // Required inputs with no default
      if (!val("so_ratio"))
        errors["so_ratio"] = "Solvent/Oil Ratio is required — engineer-entered, no default";
      if (!val("design_margin"))
        errors["design_margin"] = "Design Margin is required — needed for maximum solvent circulation";
      if (!val("phase_configuration"))
        errors["phase_configuration"] = "Phase Configuration is required — C2 engine never assumes phase continuity from density";

      // Format validation — only block when a value has been entered AND is invalid
      const stagesN = numOrNull(val("theoretical_stages"));
      if (val("theoretical_stages") && (stagesN === null || stagesN < 1 || !Number.isInteger(stagesN)))
        errors["theoretical_stages"] = "Theoretical stages must be a whole number ≥ 1";
      const effN = numOrNull(val("stage_efficiency"));
      if (val("stage_efficiency") && (effN === null || effN <= 0 || effN > 100))
        errors["stage_efficiency"] = "Stage efficiency must be > 0 % and ≤ 100 %";

      // ── RRBO characterisation & LLE targets — driven by governed N_T resolver ─
      // Single source of truth: only process_design section fields are blocking
      // here; design_basis fields (operating_temperature, feed_service) are
      // gated at Stage 2. Class MWs are NOT user inputs (surrogate constants).
      for (const rf of resolveNtInputs(d("design_basis"), pd).missingFields.filter(f => f.section === "process_design")) {
        errors[rf.key] = `${rf.label} is required — ${rf.reason}`;
      }

      // Target raffinate aromatics source reference — mandatory whenever the target
      // value is entered. The engine's parseTagged() rejects a blank sourceReference
      // with an error status, so gate it here before the run.
      if (val("target_raffinate_aromatics_mol") && !val("target_raffinate_aromatics_source_reference"))
        errors["target_raffinate_aromatics_source_reference"] = "Target Raffinate Aromatics Source Reference is required — enter the product-quality specification document that sets this threshold (e.g. RRBO product spec sheet, client requirement document)";
    }

    if (stageKey === "hydraulic_design") {
      const hd = d("hydraulic_design");
      const val = (k: string) => (hd[k] ?? "").trim();
      const VALID_SOURCES = ["Measured", "Vendor", "Literature", "Assumed"];

      // Packing Specific Surface Area — blocking
      if (!val("packing_specific_surface_value"))
        errors["packing_specific_surface_value"] = "Packing Specific Surface Area is required — no default (A-5 governed input)";
      else {
        if (!VALID_SOURCES.includes(val("packing_specific_surface_source_type")))
          errors["packing_specific_surface_source_type"] = "Source Type for Packing SSA is required (Measured / Vendor / Literature / Assumed)";
        if (!val("packing_specific_surface_source_ref"))
          errors["packing_specific_surface_source_ref"] = "Source Reference for Packing SSA is required — non-blank";
      }

      // Corrugation Angle — blocking
      if (!val("packing_corrugation_angle_value"))
        errors["packing_corrugation_angle_value"] = "Corrugation Angle is required — no default (30° or 45°)";
      else if (!val("packing_corrugation_angle_source_ref"))
        errors["packing_corrugation_angle_source_ref"] = "Corrugation Angle Source Reference is required — non-blank";

      // Droplet / characteristic-velocity model
      const model = val("hydraulic_model") || "d32_terminal";
      if (model === "d32_terminal") {
        const d32v = numVal(val("sauter_mean_d32"));
        if (d32v === null || d32v <= 0)
          errors["sauter_mean_d32"] = "Sauter Mean Diameter d32 is required and must be > 0 mm — screening default d₃₂ = 3 mm (Assumed) should have been pre-populated";
        else {
          if (!VALID_SOURCES.includes(val("sauter_mean_d32_source")))
            errors["sauter_mean_d32_source"] = "d32 Source Type is required (Measured / Vendor / Literature / Assumed)";
          if (!val("sauter_mean_d32_source_ref"))
            errors["sauter_mean_d32_source_ref"] = "d32 Source Reference is required — non-blank";
        }
        // n is a governed source-tagged input in d32_terminal mode.
        // The UI pre-populates n = 1 (Assumed) for new cases; source type and
        // reference are always required (same pattern as d32).
        const nv = numVal(val("hindrance_exponent"));
        if (nv === null || nv <= 0) {
          errors["hindrance_exponent"] = "Hindrance Exponent n is required and must be > 0 — screening default n = 1 (Assumed) should have been pre-populated";
        } else {
          if (!VALID_SOURCES.includes(val("hindrance_exponent_source")))
            errors["hindrance_exponent_source"] = "n Source Type is required (Measured / Vendor / Literature / Assumed)";
          if (!val("hindrance_exponent_source_ref"))
            errors["hindrance_exponent_source_ref"] = "n Source Reference is required — non-blank";
        }
      } else if (model === "asadollahzadeh_2017_kuhni_vk_preliminary") {
        const m = numVal(val("kuhni_vk_hindrance_exponent"));
        if (m === null || m <= 0) {
          warnings["kuhni_vk_hindrance_exponent"] = "Kühni V_k is retained as an audit calculation only. Engineer review rejects φ_op, limiting throughput, % of Max, and diameter screening until controlled primary evidence and a reviewed route-specific m are available.";
        } else {
          if (!VALID_SOURCES.includes(val("kuhni_vk_hindrance_exponent_source")))
            errors["kuhni_vk_hindrance_exponent_source"] = "Route-specific m Source Type is required (Measured / Vendor / Literature / Assumed)";
          if (!val("kuhni_vk_hindrance_exponent_source_ref"))
            errors["kuhni_vk_hindrance_exponent_source_ref"] = "Route-specific m Source Reference is required — non-blank";
          if (m === 1 && val("kuhni_vk_hindrance_exponent_source") === "Assumed")
            errors["kuhni_vk_hindrance_exponent"] = "m = 1 cannot be an Assumed carry-over. Supply a separately sourced Kühni-route value.";
        }
      } else {
        const uk = numVal(val("characteristic_velocity"));
        if (uk === null || uk <= 0)
          errors["characteristic_velocity"] = "Characteristic Velocity u_K is required and must be > 0 m/s";
        else {
          if (!VALID_SOURCES.includes(val("characteristic_velocity_source")))
            errors["characteristic_velocity_source"] = "u_K Source Type is required (Measured / Vendor / Literature / Assumed)";
          if (!val("characteristic_velocity_source_ref"))
            errors["characteristic_velocity_source_ref"] = "u_K Source Reference is required — non-blank";
        }
        const n = numVal(val("hindrance_exponent"));
        if (n === null || n <= 0)
          errors["hindrance_exponent"] = "Hindrance Exponent n is required — no default (A-series governed input)";
        else {
          if (!VALID_SOURCES.includes(val("hindrance_exponent_source")))
            errors["hindrance_exponent_source"] = "Hindrance Exponent Source Type is required (Measured / Vendor / Literature / Assumed)";
          if (!val("hindrance_exponent_source_ref"))
            errors["hindrance_exponent_source_ref"] = "Hindrance Exponent Source Reference is required — non-blank";
        }
      }

      // Advisory: SSA with no governed cf dataset and no vendor ΔP override
      const ssaV = numVal(val("packing_specific_surface_value"));
      if (ssaV !== null && [300, 350, 400, 450].includes(ssaV) && !val("vendor_dp_value"))
        warnings["ssa_no_governed_cf"] = `SSA = ${ssaV} m²/m³ has no governed Duss 2013 c_f dataset — pressure drop Not Calculable for this geometry. Enter vendor ΔP data to enable pressure-drop calculation.`;
    }

    if (stageKey === "technology_selection") {
      const ts2 = d("technology_selection");
      if (!ts2.technology?.trim())
        errors["technology"] = "Technology must be confirmed (ECR — Kühni Agitated Column) — Stage 7 Equipment Design is blocked without a selection";
      // Selection Rationale is optional — not a blocking input.
    }

    if (stageKey === "equipment_design") {
      const techSel = d("technology_selection").technology;
      // ECP removed — only ECR is validated. Legacy "ecp"/"both" stored values are treated as ECR.
      const isECR = !!(techSel?.trim());
      const VALID_SOURCES = ["Measured", "Vendor", "Literature", "Assumed"];
      if (!techSel?.trim()) {
        errors["technology"] = "Technology selection (Stage 6) is required before Equipment Design inputs are validated";
      } else {
        if (isECR) {
          const er = d("ecr_design");
          const erVal = (k: string) => (er[k] ?? "").trim();
          if (!numVal(erVal("rotor_diameter")) && !numVal(erVal("rotor_ratio")))
            errors["ecr_rotor"] = "ECR: enter Rotor Diameter (m) OR Rotor/Column Diameter Ratio — at least one is required";
          const hasSpeed = numVal(erVal("rotor_speed")) !== null;
          const hasRange = erVal("rotor_speed_range") !== "";
          if (!hasSpeed && !hasRange)
            errors["ecr_rotor_speed"] = "ECR Rotor Speed or Speed Range — one is required (mutually exclusive)";
          if (hasSpeed && hasRange)
            errors["ecr_rotor_speed"] = "ECR Rotor Speed and Speed Range are mutually exclusive — enter only one";
          if (!numVal(erVal("power_number")))
            errors["ecr_power_number"] = "ECR Power Number is required (> 0) — the C5 engine blocks without it";
          // compartment_height: value + source type + source reference all mandatory (governs ECR active height)
          const chV = numVal(erVal("compartment_height"));
          if (chV === null || chV <= 0)
            errors["ecr_compartment_height"] = "ECR Compartment Height is required (> 0 m) — the C5 engine blocks without it";
          else {
            if (!VALID_SOURCES.includes(erVal("compartment_height_source")))
              errors["ecr_compartment_height_source"] = "ECR Compartment Height Source Type is required";
            if (!erVal("compartment_height_source_reference"))
              errors["ecr_compartment_height_source_reference"] = "ECR Compartment Height Source Reference is required — non-blank";
          }
          const ceV = numVal(erVal("compartment_efficiency"));
          if (ceV === null || ceV <= 0)
            errors["ecr_compartment_efficiency"] = "ECR Compartment Efficiency is required — governed override only, no default (A-10)";
          else {
            if (!VALID_SOURCES.includes(erVal("compartment_efficiency_source")))
              errors["ecr_compartment_efficiency_source"] = "ECR Compartment Efficiency Source Type is required";
            if (!erVal("compartment_efficiency_source_reference"))
              errors["ecr_compartment_efficiency_source_reference"] = "ECR Compartment Efficiency Source Reference is required — non-blank";
          }
          for (const [k, label] of [
            ["shaft_efficiency", "ECR Shaft Efficiency"], ["mechanical_design_margin", "ECR Mechanical Design Margin"],
            ["drive_seal_bearing_allowance", "ECR Drive/Seal/Bearing Allowance"],
          ] as [string, string][]) {
            if (!numVal(erVal(k)))
              errors[`ecr_${k}`] = `${label} is required (> 0) — the C5 engine blocks without it`;
          }
          for (const [k, label] of [
            ["top_head_height", "ECR Top Head Height"], ["top_disengagement_height", "ECR Top Disengagement Height"],
            ["top_distributor_allowance", "ECR Top Distributor Allowance"], ["bottom_distributor_allowance", "ECR Bottom Distributor Allowance"],
            ["bottom_disengagement_height", "ECR Bottom Disengagement Height"], ["bottom_head_height", "ECR Bottom Head Height"],
          ] as [string, string][]) {
            if (!numVal(erVal(k)))
              errors[`ecr_${k}`] = `${label} is required (> 0 m) — the C5 engine blocks without it`;
          }
        }
      }
    }

    if (stageKey === "ecr2_simulation") {
      const sim = d("ecr_simulator");
      // System-resolved MW/diffusivity candidates are valid only when the
      // validator sees the current server resolver register. Without this
      // third argument, every calculated candidate is misreported as a
      // missing manual field (up to 48 false errors on the footer).
      Object.assign(errors, validateEcr2Stage8(
        sim,
        ecr2HasAcceptedEcrRun,
        ecr2Stage8ResolverRecords,
      ));
    }

    if (stageKey === "mechanical_design") {
      const md2 = d("mechanical_design");
      if (!(md2.design_code ?? "").trim())
        errors["design_code"] = "Governing Design Code must be assigned — the C6 engine records NOT_ASSIGNED until it is entered";
    }

    if (stageKey === "utilities") {
      const ut = d("utilities");
      const val = (k: string) => (ut[k] ?? "").trim();
      const missingUtils = (["thermal_oil_duty", "cw_duty", "cw_flow", "steam_requirement", "electrical_load", "nitrogen_requirement"] as const)
        .filter(k => !val(k));
      if (missingUtils.length > 0)
        warnings["utilities_incomplete"] = `${missingUtils.length} utility field${missingUtils.length > 1 ? "s" : ""} not yet entered — the utilities section of Stage 13 reports will be incomplete`;
    }

    if (stageKey === "cost_estimation") {
      const ce = d("cost_estimation");
      const val = (k: string) => (ce[k] ?? "").trim();
      const byearStr = val("base_year");
      const byear = byearStr ? numVal(byearStr) : null;
      if (byear === null || byear < 2000 || !Number.isInteger(byear))
        errors["base_year"] = "Base Year is required — integer ≥ 2000";
      const efStr = val("escalation_factor");
      const ef = efStr ? numVal(efStr) : null;
      if (ef === null || ef <= 0)
        errors["escalation_factor"] = "Escalation Factor is required (> 0)";
      const cpStr = val("contingency_percent");
      const cp = cpStr ? numVal(cpStr) : null;
      if (cp === null || cp < 0 || cp > 100)
        errors["contingency_percent"] = "Contingency % is required (0–100 %)";
      // Advisory: base year differs significantly from current year with factor = 1.0
      if (byear !== null && ef !== null) {
        const currentYear = new Date().getFullYear();
        if (Math.abs(currentYear - byear) > 2 && Math.abs(ef - 1.0) < 0.001)
          warnings["escalation_factor"] = `Base year ${byear} differs from the current year ${currentYear} by more than 2 years but the escalation factor is 1.00 — verify that cost escalation has been correctly applied`;
      }
    }

    // Future stages will be added here as each is approved.

    return { errors, warnings };
  }

  // "Next →" button: validates the current stage and blocks forward navigation on errors.
  // Sidebar clicks use bare setActiveStep (free navigation) — this avoids circular deadlocks
  // when a blocking field (e.g. Phase Configuration) lives in a later stage's UI.
  function tryNavigateTo(targetKey: StepKey) {
    const currentIdx = STEPS.findIndex(s => s.key === activeStep);
    const targetIdx  = STEPS.findIndex(s => s.key === targetKey);

    // "Previous ←" button — always allowed (no validation)
    if (targetIdx <= currentIdx) {
      setActiveStep(targetKey);
      return;
    }

    // Forward — validate current stage first
    const { errors, warnings } = validateStage(activeStep);
    setStageValidationErrors(  prev => ({ ...prev, [activeStep]: errors }));
    setStageValidationWarnings(prev => ({ ...prev, [activeStep]: warnings }));
    setStageValidationAttempted(prev => new Set(prev).add(activeStep));

    if (Object.keys(errors).length > 0) {
      // Scroll to the first erroneous field wrapper
      const firstKey = Object.keys(errors)[0];
      const el = document.querySelector(`[data-field-key="${activeStep}__${firstKey}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return; // Block forward navigation
    }

    setActiveStep(targetKey);
  }

  // Status of a step for the left-nav indicator dot.
  function stageStatus(key: StepKey): "complete" | "warning" | "blocking" | "unchecked" {
    if (!stageValidationAttempted.has(key)) return "unchecked";
    const errs  = stageValidationErrors[key]   ?? {};
    const warns = stageValidationWarnings[key] ?? {};
    if (Object.keys(errs).length  > 0) return "blocking";
    if (Object.keys(warns).length > 0) return "warning";
    return "complete";
  }

  // Renders the per-stage error/warning banner — same visual pattern as Stage 3/4.
  function stageBanner(key: StepKey, label = "Stage incomplete") {
    if (!stageValidationAttempted.has(key)) return null;
    const ve = stageValidationErrors[key] ?? {};
    const vw = stageValidationWarnings[key] ?? {};
    const ec = Object.keys(ve).length;
    const wc = Object.keys(vw).length;
    const stage8Unresolved = key === "ecr2_simulation" && stage8ResolutionQ.isSuccess
      ? ecr2LiveDependencies.filter(dependency => !dependency.ready)
      : null;
    const displayedErrorCount = stage8Unresolved?.length ?? ec;
    return (
      <>
        {displayedErrorCount > 0 && (
          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-500">⚠</span>
            <p className="text-sm font-semibold text-red-800">
              {stage8Unresolved
                ? `${label} — ${displayedErrorCount} required dependenc${displayedErrorCount === 1 ? "y" : "ies"} unresolved`
                : `${label} — ${displayedErrorCount} required input${displayedErrorCount > 1 ? "s" : ""} missing or invalid`
              }
            </p>
          </div>
        )}
        {wc > 0 && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-amber-500">⚠</span>
            <p className="text-sm text-amber-800">{Object.values(vw).join(" · ")}</p>
          </div>
        )}
      </>
    );
  }

  // ── Validation checks ─────────────────────────────────────────────────────────
  const db = d("design_basis");
  const ts = d("technology_selection");
  const runs = runsQ.data ?? [];
  // Execution vs engineering-maturity are SEPARATE validation questions:
  // a run that completed with engine warnings (Assumed / Pending Validation
  // data) HAS been executed. Executed = latest run of the type has status
  // success or warning; error/failed or no run at all = not executed.
  const latestRun = (type: string) =>
    runs.filter(r => r.calculation_type === type)
        .sort((a, b) => new Date(b.calculated_at ?? 0).getTime() - new Date(a.calculated_at ?? 0).getTime())[0];
  const execCheck = (type: string): { executed: boolean; withWarnings: boolean } => {
    const r = latestRun(type);
    if (!r) return { executed: false, withWarnings: false };
    const executed = r.calculation_status === "success" || r.calculation_status === "warning";
    return { executed, withWarnings: r.calculation_status === "warning" };
  };
  const WARN_NOTE = "Status: Completed with Engineering Warnings. Reason: Preliminary design contains Assumed and/or Pending Validation data. Execution, engineering maturity, vendor validation and final approval are reported independently — warnings remain visible and still gate release-grade approval.";
  const hydExec = execCheck("hydraulics_common");
  const ecpExec = execCheck("ecp");
  const ecrExec = execCheck("ecr");
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
      note: !ts.technology ? "Confirm technology (ECR — Kühni Agitated Column) in Step 6" : undefined,
    },
    {
      label: "Common Hydraulics Calculation Executed",
      status: hydExec.executed ? "pass" : "fail",
      note: hydExec.executed
        ? (hydExec.withWarnings ? `✓ Calculation Executed. ${WARN_NOTE}` : undefined)
        : "No successful hydraulics run exists (latest run failed or Step 5 not run)",
    },
    {
      label: "Flooding within allowable limits (< 80 %)",
      ...((): { status: "pass" | "fail" | "warning" | "pending"; note?: string } => {
        // Pass/fail of the DESIGN CRITERION only (utilization ≤ limit), read from
        // the latest active (non-superseded) DS-SEL record. Basis maturity is a
        // separate advisory check below.
        const dsel = designSelectionQ.data?.record ?? null;
        // Effective design diameter governs (governed user selection when
        // present, else autonomous) — legacy records carry only floodingUtilization.
        const util = typeof dsel?.effectiveFloodingUtilization === "number" ? dsel.effectiveFloodingUtilization : dsel?.floodingUtilization;
        const limit = dsel?.utilizationLimit?.value ?? 0.8;
        if (dsel == null || typeof util !== "number") {
          return { status: "pending", note: "No active DS-SEL record with a hydraulic utilization result exists yet" };
        }
        const atDia = dsel.effectiveDiameter_mm ?? dsel.selectedDiameter_mm;
        const utilPct = (util * 100).toFixed(2);
        const limitPct = (limit * 100).toFixed(0);
        if (util > limit) {
          return { status: "fail", note: `Hydraulic utilization ${utilPct} % at the effective design diameter${atDia != null ? ` (${atDia} mm)` : ""} exceeds the allowable limit ${limitPct} % (DS-SEL record, ${dsel.capacityBasis?.tier ?? "declared basis"})` };
        }
        return { status: "pass", note: `Hydraulic utilization within allowable limit at the effective design diameter${atDia != null ? ` (${atDia} mm)` : ""}: ${utilPct}% ≤ ${limitPct}% (basis: ${dsel.capacityBasis?.tier ?? "declared basis"})` };
      })(),
    },
    {
      label: "Hydraulic capacity basis maturity",
      ...((): { status: "pass" | "fail" | "warning" | "pending"; note?: string } => {
        // Maturity of the underlying hydraulic basis — advisory only, independent
        // of the design-criterion pass/fail above.
        const dsel = designSelectionQ.data?.record ?? null;
        if (dsel == null || typeof dsel.floodingUtilization !== "number") {
          return { status: "pending", note: "No active DS-SEL record yet" };
        }
        if (dsel.capacityBasis?.assumed) {
          return { status: "warning", note: "Hydraulic capacity basis: Preliminary Screening Threshold – Pending Hydraulic Validation." };
        }
        return { status: "pass", note: `Validated hydraulic capacity basis: ${dsel.capacityBasis?.tier ?? "declared basis"}` };
      })(),
    },
    {
      label: showECR ? "ECR Equipment Calculation Executed" : "ECR calculation (not selected)",
      status: !showECR ? "pending" : ecrExec.executed ? "pass" : "fail",
      note: !showECR ? undefined
        : ecrExec.executed
          ? (ecrExec.withWarnings ? `✓ Calculation Executed. ${WARN_NOTE}` : undefined)
          : "No successful ECR run exists (latest run failed or Step 7 not run)",
    },
    {
      // Advisory only — informational acceptance-state line for the autonomous
      // Engineering Decision Record. Execution/maturity separation: the record's
      // existence and decision state never block submission by themselves.
      label: "Design selection decision recorded (DS-SEL)",
      status: (() => {
        const r = designSelectionQ.data;
        if (!r) return "pending";
        return r.decision === "pending" ? "warning" : "pass";
      })(),
      note: (() => {
        const r = designSelectionQ.data;
        if (!r) return "No autonomous selection record yet — it is generated after each accepted ECR run (informational; not blocking)";
        if (r.decision === "pending") return "Autonomous recommendation awaiting engineer decision (Approve / Request Verification / Override) — informational; not blocking";
        return `Decision: ${String(r.decision).replace(/_/g, " ")} by ${r.decision_engineer ?? "—"}`;
      })(),
    },
    {
      label: "All fluid properties have a source declared",
      status: (() => {
        const fp = d("fluid_properties");
        const keys = ["rrbo_viscosity_dynamic", "nmp_viscosity_dynamic", "interfacial_tension"];
        return keys.every(k => fp[`${k}_source`]) ? "pass" : "warning";
      })(),
      note: "Every fluid property must have Measured / Vendor / Literature / Assumed declared",
    },
    {
      label: "Assumed data acknowledged",
      status: (() => {
        const fp = d("fluid_properties");
        const keys = ["rrbo_viscosity_dynamic", "rrbo_viscosity_kinematic", "nmp_viscosity_dynamic", "interfacial_tension", "mutual_solubility"];
        const assumed = keys.filter(k => fp[`${k}_source`] === "Assumed");
        return assumed.length === 0 ? "pass" : "warning";
      })(),
      note: "Review amber-highlighted assumed values before approving",
    },
    // ── Stage 5–11 aggregate checks ────────────────────────────────────────────
    {
      label: "Stage 5 — Hydraulic Design inputs complete",
      status: (() => {
        const { errors: e5 } = validateStage("hydraulic_design");
        return Object.keys(e5).length === 0 ? "pass" : "fail";
      })(),
      note: (() => {
        const { errors: e5 } = validateStage("hydraulic_design");
        const k = Object.keys(e5);
        return k.length > 0 ? `${k.length} blocking input${k.length > 1 ? "s" : ""} missing: ${Object.values(e5).slice(0, 2).join("; ")}${k.length > 2 ? `… (+${k.length - 2} more)` : ""}` : undefined;
      })(),
    },
    {
      label: "Stage 6 — Technology selection and rationale complete",
      status: (() => {
        const { errors: e6 } = validateStage("technology_selection");
        return Object.keys(e6).length === 0 ? "pass" : "fail";
      })(),
      note: (() => {
        const { errors: e6 } = validateStage("technology_selection");
        const k = Object.keys(e6);
        return k.length > 0 ? Object.values(e6).join("; ") : undefined;
      })(),
    },
    {
      label: showECP || showECR ? "Stage 7 — Equipment Design inputs complete" : "Stage 7 — Equipment Design (technology not selected)",
      status: (() => {
        if (!showECP && !showECR) return "pending";
        const { errors: e7 } = validateStage("equipment_design");
        return Object.keys(e7).length === 0 ? "pass" : "fail";
      })(),
      note: (() => {
        if (!showECP && !showECR) return "Select technology in Stage 6 first";
        const { errors: e7 } = validateStage("equipment_design");
        const k = Object.keys(e7);
        return k.length > 0 ? `${k.length} blocking input${k.length > 1 ? "s" : ""} missing: ${Object.values(e7).slice(0, 2).join("; ")}${k.length > 2 ? `… (+${k.length - 2} more)` : ""}` : undefined;
      })(),
    },
    {
      label: "Stage 9 — Mechanical Design code assigned",
      status: (() => {
        const { errors: e9 } = validateStage("mechanical_design");
        return Object.keys(e9).length === 0 ? "pass" : "fail";
      })(),
      note: (() => {
        const { errors: e9 } = validateStage("mechanical_design");
        return Object.values(e9).join("; ") || undefined;
      })(),
    },
    {
      label: "Stage 11 — Cost Estimation parameters complete",
      status: (() => {
        const { errors: e11 } = validateStage("cost_estimation");
        return Object.keys(e11).length === 0 ? "pass" : "fail";
      })(),
      note: (() => {
        const { errors: e11 } = validateStage("cost_estimation");
        return Object.values(e11).join("; ") || undefined;
      })(),
    },
  ] as { label: string; status: "pass" | "fail" | "warning" | "pending"; note?: string }[];

  const canSubmit = validationChecks.filter(c => c.status === "fail").length === 0;

  // ── Step content renderers ────────────────────────────────────────────────────

  function renderDesignIdentity() {
    const di = d("design_identity");
    const ve = stageValidationErrors["design_identity"] ?? {};
    const fErr = (key: string) => ve[key];
    const info = (label: string, value: string | null | undefined) => (
      <div key={label} className="grid grid-cols-[180px_1fr] gap-2 py-1.5 border-b last:border-0">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-sm font-medium text-gray-900">{value || <span className="text-gray-300 italic">—</span>}</span>
      </div>
    );
    const blockingCount = Object.keys(ve).length;
    return (
      <div className="max-w-2xl">
        {/* Validation error summary — shown only after first forward-nav attempt */}
        {stageValidationAttempted.has("design_identity") && blockingCount > 0 && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
            <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
            <div>
              <p className="text-sm font-semibold text-red-800">Stage incomplete — {blockingCount} required field{blockingCount > 1 ? "s" : ""} missing</p>
              <p className="text-xs text-red-700 mt-0.5">Complete all required fields before proceeding to Design Basis.</p>
            </div>
          </div>
        )}
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
            <div data-field-key="design_identity__prepared_by">
              <FieldRow label="Prepared By" value={di.prepared_by ?? ""} onChange={v => field("design_identity")("prepared_by", v)} onBlur={save("design_identity")} error={fErr("prepared_by")} />
            </div>
            <div data-field-key="design_identity__checked_by">
              <FieldRow label="Checked By" value={di.checked_by ?? ""} onChange={v => field("design_identity")("checked_by", v)} onBlur={save("design_identity")} error={fErr("checked_by")} />
            </div>
            <div data-field-key="design_identity__approved_by">
              <FieldRow label="Approved By" value={di.approved_by ?? ""} onChange={v => field("design_identity")("approved_by", v)} onBlur={save("design_identity")} error={fErr("approved_by")} />
            </div>
            <div data-field-key="design_identity__client">
              <FieldRow label="Client / Customer" value={di.client ?? ""} onChange={v => field("design_identity")("client", v)} onBlur={save("design_identity")} error={fErr("client")} />
            </div>
            <div data-field-key="design_identity__plant_location">
              <FieldRow label="Plant Location" value={di.plant_location ?? ""} onChange={v => field("design_identity")("plant_location", v)} onBlur={save("design_identity")} error={fErr("plant_location")} />
            </div>
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

    // ── Extract Quality — Calculated from NRTL/Cascade Component Balance ───────
    // Surrogate MWs (Coto 2022 engine constants, physical constants):
    //   [0] n-C12 (Saturates), [1] 1,4-xylene (Mono-Ar), [2] 1-methylnaphthalene (Di-Ar),
    //   [3] pyrene (Poly-Ar), [4] NMP — used for mass/mole unit conversion only.
    const pd4 = d("process_design");
    const pdResultData: any = (resultsQ.data ?? []).find((r: any) => r.section === "process_design")?.data ?? null;
    const pdAcceptedRun = runs.find(r =>
      r.calculation_type === "process_design" && ["success", "warning"].includes(r.calculation_status),
    );
    const lleCascade: any = pdResultData?.lleStageCalculation ?? null;
    const raffinateLleAromatics: any = lleCascade?.raffinateAromaticsLLE ?? null;
    const raffinateProductQuality: any = lleCascade?.raffinateProductQuality ?? null;
    // Stage j=1 (raffinate product end) is stages[0]; j=N (extract end) is stages[N-1].
    const cascadeStages: any[] = Array.isArray(lleCascade?.stages) ? lleCascade.stages : [];
    const raffStage: any = cascadeStages.length > 0 ? cascadeStages[0] : null;
    const hasNrtlData =
      raffStage !== null &&
      Array.isArray(raffStage.raffinate_x) && raffStage.raffinate_x.length >= 5 &&
      typeof raffStage.raffinateFlow_mol === "number" &&
      Array.isArray(lleCascade?.overallBalance?.rows) && lleCascade.overallBalance.rows.length >= 5;
    // Feed total RRBO mass flow (kg/h) from normalCase component balance
    const eqFeedKgh: number | null =
      typeof pdResultData?.normalCase?.componentBalance?.feed?.total === "number"
        ? (pdResultData.normalCase.componentBalance.feed.total as number)
        : null;
    // Live RRBO wt% from Stage 4 inputs — updates immediately when engineer changes composition
    const eqLiveWt = [
      parseFloat((pd4.rrbo_saturates_wt      ?? "").trim()),
      parseFloat((pd4.rrbo_mono_aromatics_wt  ?? "").trim()),
      parseFloat((pd4.rrbo_di_aromatics_wt    ?? "").trim()),
      parseFloat((pd4.rrbo_poly_aromatics_wt  ?? "").trim()),
    ];
    const hasLiveWt = eqLiveWt.every(v => isFinite(v) && v >= 0);
    // Staleness: compare live wt% against the inputTrace echoed in the accepted run snapshot
    const runWtEcho = [
      lleCascade?.inputTrace?.rrboCharacterisationWtPct?.saturates?.value,
      lleCascade?.inputTrace?.rrboCharacterisationWtPct?.monoAromatics?.value,
      lleCascade?.inputTrace?.rrboCharacterisationWtPct?.diAromatics?.value,
      lleCascade?.inputTrace?.rrboCharacterisationWtPct?.polyAromatics?.value,
    ] as (number | undefined)[];
    const eqIsStale = hasLiveWt && runWtEcho.some(
      (rv, i) => typeof rv === "number" && Math.abs(rv - eqLiveWt[i]) > 0.01,
    );
    // Compute extract composition using mole split fractions from the cascade
    interface EQResult {
      satKgh: number; monoKgh: number; diKgh: number; polyKgh: number;
      oilEKgh: number; nmpEKgh: number;
      satWt: number; monoWt: number; diWt: number; polyWt: number;
      totalArWt: number; oilYield: number; nmpWtInExtract: number;
    }
    let eqResult: EQResult | null = null;
    if (hasNrtlData && hasLiveWt && eqFeedKgh !== null && eqFeedKgh > 0) {
      const rx   = raffStage.raffinate_x as number[];
      const rFlow = raffStage.raffinateFlow_mol as number;
      const obRows = (lleCascade.overallBalance.rows as { lhs_mol: number }[]);
      // Mole split fraction to raffinate for each oil component (i = 0..3).
      // The molar split = mass split because both phases contain the same surrogate
      // molecule for each class (same MW cancels in numerator/denominator).
      const splitR = [0, 1, 2, 3].map(i => {
        const feedMolI = obRows[i].lhs_mol;
        return feedMolI > 0 ? (rFlow * rx[i]) / feedMolI : 0;
      });
      // Feed mass per component using live wt% (kg/h)
      const mF = eqLiveWt.map(wt => eqFeedKgh * wt / 100);
      // Extract mass per component: m_{i,E} = m_{i,F} − m_{i,R}
      const mE = mF.map((m, i) => Math.max(0, m * (1 - splitR[i])));
      const oilEKgh = mE.reduce((a, b) => a + b, 0);
      // NMP in extract from the normalCase pseudo-component balance (kg/h)
      const nmpEKgh: number =
        typeof pdResultData?.normalCase?.componentBalance?.extract?.nmp === "number"
          ? (pdResultData.normalCase.componentBalance.extract.nmp as number)
          : 0;
      const totalExtract = oilEKgh + nmpEKgh;
      if (oilEKgh > 0) {
        eqResult = {
          satKgh: mE[0], monoKgh: mE[1], diKgh: mE[2], polyKgh: mE[3],
          oilEKgh, nmpEKgh,
          satWt:        mE[0] / oilEKgh * 100,
          monoWt:       mE[1] / oilEKgh * 100,
          diWt:         mE[2] / oilEKgh * 100,
          polyWt:       mE[3] / oilEKgh * 100,
          totalArWt:    (mE[1] + mE[2] + mE[3]) / oilEKgh * 100,
          oilYield:     oilEKgh / eqFeedKgh * 100,
          nmpWtInExtract: totalExtract > 0 ? nmpEKgh / totalExtract * 100 : 0,
        };
      }
    }
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
      // Design Basis feed density (source-tagged by construction) — primary source only.
      // RRBO density is no longer user-entered in Fluid Properties; it is application-calculated.
      const dbRho = num(m.feed_density);
      const rhoM = dbRho;
      const rhoOk = dbRho !== null;
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
        // Extract quality is now a calculated output (NRTL/cascade component balance) —
        // no longer seeded from Product Requirement Master defaults.
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
    // RRBO density is no longer user-entered in Fluid Properties; use Design Basis feed density only.
    const dbFeedRho = num(db.feed_density);
    const rho = dbFeedRho;
    const rhoTagged = dbFeedRho !== null;
    const rhoRefT = `${db.feed_density_ref_temp || "15"} °C`;
    const rhoSrc = db.feed_density_source || FEED_DENSITY_DEFAULT_SOURCE;
    const annualHours = daysYr !== null ? 24 * daysYr : null; // Operating Hours fixed at 24 hr/day for this module
    const lph = num(db.design_capacity_lph);
    const tpa = lph !== null && annualHours !== null && rhoTagged ? (lph * annualHours * (rho as number)) / 1e6 : null;

    // Stage 2 validation helpers (populated after first "Next →" click)
    const s2ve = stageValidationErrors["design_basis"] ?? {};
    const fErr2 = (key: string) => s2ve[key];
    const s2Attempted = stageValidationAttempted.has("design_basis");
    const s2ErrCount  = Object.keys(s2ve).length;

    return (
      <div className="max-w-3xl">
        {/* Stage 2 validation summary — shown only after first forward-nav attempt */}
        {s2Attempted && s2ErrCount > 0 && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-500">⚠</span>
            <p className="text-sm font-semibold text-red-800">
              Stage incomplete — {s2ErrCount} required field{s2ErrCount > 1 ? "s" : ""} missing
            </p>
          </div>
        )}
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
          <div data-field-key="design_basis__feed_service">
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
              error={fErr2("feed_service")}
            />
          </div>
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
          <div data-field-key="design_basis__design_capacity_lph">
            <SelectRow
              label="Design Capacity (LPH)"
              value={db.design_capacity_lph ?? db.design_capacity ?? ""}
              onChange={v => { f("design_capacity_lph", v); f("design_capacity", v); f("feed_flow", v); }}
              onBlur={s}
              onCommit={v => csa({ design_capacity_lph: v, design_capacity: v, feed_flow: v })}
              options={db.design_capacity_lph && !CAPACITY_OPTIONS.includes(db.design_capacity_lph) ? [...CAPACITY_OPTIONS, db.design_capacity_lph] : CAPACITY_OPTIONS}
              unit="LPH"
              note="Sets Feed Flow and the legacy capacity field"
              error={fErr2("design_capacity_lph")}
            />
          </div>
          <FieldRow label="Design Capacity (TPA)" value={tpa !== null ? tpa.toFixed(0) : (db.design_capacity_mtpa ?? "")} onChange={() => {}} onBlur={() => {}} unit="t/yr" readOnly />
          {tpa !== null && (
            <p className="text-xs ml-[212px] -mt-1 text-gray-500">
              Auto-calculated: {lph} LPH × 24 hr/day × {daysYr} days/yr × ρ {rho} kg/m³ (@ {rhoRefT}, source: {rhoSrc}) ÷ 10⁶ = <b>{tpa.toFixed(0)} t/yr</b>
            </p>
          )}
          <FieldRow label="Operating Hours" value="24" onChange={() => {}} onBlur={() => {}} unit="hr/day" readOnly note="Fixed for this module" />
          <div data-field-key="design_basis__operating_days">
            <SelectRow
              label="Operating Days"
              value={db.operating_days ?? ""}
              onChange={v => f("operating_days", v)}
              onBlur={s}
              onCommit={v => csa({ operating_days: v })}
              options={["300", "310", "320", "330"]}
              unit="days/yr"
              error={fErr2("operating_days")}
              note={undefined}
            />
          </div>
          <div data-field-key="design_basis__design_life">
            <SelectRow
              label="Design Life"
              value={db.design_life ?? ""}
              onChange={v => f("design_life", v)}
              onBlur={s}
              onCommit={v => csa({ design_life: v })}
              options={db.design_life && !["20", "30"].includes(db.design_life) ? ["20", "30", db.design_life] : ["20", "30"]}
              unit="years"
              error={fErr2("design_life")}
            />
          </div>
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
          <div data-field-key="design_basis__feed_temperature">
            <SelectRow
              label="Feed Temperature"
              value={db.feed_temperature ?? ""}
              onChange={v => f("feed_temperature", v)}
              onBlur={s}
              onCommit={v => csa({ feed_temperature: v })}
              options={["10", "15", "20", "25", "30", "35", "40"]}
              unit="°C"
              error={fErr2("feed_temperature")}
              note={undefined}
            />
          </div>
          <div data-field-key="design_basis__feed_pressure">
            <FieldRow
              label="Feed Pressure"
              value={db.feed_pressure ?? ""}
              onChange={v => f("feed_pressure", v)}
              onBlur={() => cs(auto({}))}
              unit="bar g"
              error={fErr2("feed_pressure")}
              note={fErr2("feed_pressure") ? undefined : "Manual — no process-configuration rule or master data available"}
            />
          </div>
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
          <div data-field-key="design_basis__operating_temperature">
            <SelectRow
              label="Operating Temperature"
              value={db.operating_temperature ?? ""}
              onChange={v => f("operating_temperature", v)}
              onBlur={s}
              onCommit={v => csa({ operating_temperature: v })}
              options={["50", "55", "60", "65", "70", "75", "80"]}
              unit="°C"
              allowOther
              error={fErr2("operating_temperature")}
              note={fErr2("operating_temperature") ? undefined : "Values above 80 °C may be entered directly — Design Temperature then follows OT + 20 °C"}
            />
          </div>
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
                  <div data-field-key="design_basis__thermal_oil_type">
                    <SearchSelectRow
                      label="Oil Type / Grade"
                      value={db.thermal_oil_type ?? ""}
                      options={THERMAL_OIL_OPTIONS}
                      onSelect={v => csa({ thermal_oil_type: v })}
                      placeholder="Search / select thermal oil…"
                      note="Searchable — master data: Therminol 65 / 66"
                      error={fErr2("thermal_oil_type")}
                    />
                  </div>
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
          <div className="border-t pt-3 mt-3">
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-800">Calculated Raffinate Aromatics</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Reporting basis</span>
            </div>
            {raffinateLleAromatics && raffinateProductQuality ? (
              <>
                {[
                  {
                    label: "LLE aromatics — full phase, NMP included",
                    symbol: "x_A,R^LLE",
                    value: raffinateLleAromatics.value,
                    unit: "mol %",
                  },
                  {
                    label: "Product aromatics — hydrocarbon-only, NMP excluded",
                    symbol: "x_A,R^product",
                    value: raffinateProductQuality.x_A_R_product?.value,
                    unit: "mol %",
                  },
                  {
                    label: "Product aromatics — hydrocarbon-only, NMP excluded",
                    symbol: "w_A,R^product",
                    value: raffinateProductQuality.w_A_R_product?.value,
                    unit: "wt %",
                  },
                ].map(({ label, symbol, value, unit }) => (
                  <div key={symbol} className="grid grid-cols-[260px_1fr] items-center gap-2 py-1 border-b border-gray-50">
                    <span className="text-sm text-gray-700">
                      {label}
                      <span className="ml-1 text-[10px] font-mono text-gray-400">{symbol}</span>
                    </span>
                    <span className="font-mono text-sm text-blue-700 font-semibold">
                      {typeof value === "number" ? `${(value * 100).toFixed(2)} ${unit}` : "—"}
                    </span>
                  </div>
                ))}
                <p className="text-[11px] text-gray-400 mt-1.5">
                  The retained LLE value uses all five phase components. Product values use only Saturates + Mono + Di + Poly; residual NMP is excluded from both denominators.
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-500">
                Run Stage 4 Process Design with the LLE characterization to calculate basis-separated raffinate aromatics.
              </p>
            )}
          </div>
          {/* Extract Quality — calculated read-only panel from NRTL/cascade component balance */}
          <div className="border-t pt-3">
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-800">Extract Quality</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Calculated</span>
              <span className="text-xs text-gray-400">NMP-free oil basis · NRTL/cascade component balance</span>
            </div>
            {eqIsStale && (
              <div className="flex items-start gap-2 mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                RRBO characterisation inputs changed since last Stage 4 run — re-run Process Design to refresh mole split fractions.
              </div>
            )}
            {eqResult ? (
              <div>
                {([ 
                  { label: "Saturates",                           value: eqResult.satWt,     bold: false },
                  { label: "Mono-Aromatics",                      value: eqResult.monoWt,    bold: false },
                  { label: "Di-Aromatics",                        value: eqResult.diWt,      bold: false },
                  { label: "Poly-Aromatics",                      value: eqResult.polyWt,    bold: false },
                  { label: "Total Aromatics",                     value: eqResult.totalArWt, bold: true  },
                  { label: "Extract Oil Yield (of RRBO feed)",    value: eqResult.oilYield,  bold: false },
                ] as { label: string; value: number; bold: boolean }[]).map(({ label, value, bold }) => (
                  <div key={label} className="grid grid-cols-[220px_1fr] items-center gap-2 py-1 border-b border-gray-50">
                    <span className={`text-sm text-gray-700 ${bold ? "font-semibold" : ""}`}>{label}</span>
                    <span className={`font-mono text-sm ${bold ? "text-blue-800 font-bold" : "text-blue-700 font-semibold"}`}>
                      {value.toFixed(2)} wt %
                      <span className="ml-2 text-[10px] font-sans font-normal text-gray-400">Calculated</span>
                    </span>
                  </div>
                ))}
                <div className="grid grid-cols-[220px_1fr] items-center gap-2 py-1.5 mt-1 border-t border-gray-100">
                  <span className="text-sm text-gray-500 italic">NMP-rich extract phase</span>
                  <span className="font-mono text-sm text-gray-600">
                    {eqResult.nmpWtInExtract.toFixed(2)} wt % NMP
                    <span className="ml-2 text-[10px] font-sans font-normal text-gray-400">
                      ({(100 - eqResult.nmpWtInExtract).toFixed(2)} wt % oil)
                    </span>
                  </span>
                </div>
                {pdAcceptedRun && (
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Source: Stage 4 Process Design run #{pdAcceptedRun.id}
                    {" · "}{new Date(pdAcceptedRun.calculated_at).toLocaleString()}
                    {" · "}{pdAcceptedRun.engine_name} v{pdAcceptedRun.engine_version}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-500">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-gray-400" />
                <span>
                  {!pdAcceptedRun
                    ? "Not calculable — no accepted Stage 4 Process Design run found. Run Stage 4 with RRBO characterisation (Saturates / Mono / Di / Poly wt%) and target raffinate aromatics."
                    : !hasNrtlData
                      ? "Not calculable — Stage 4 run does not contain a per-component NRTL cascade trace. This is available when the NRTL direct cascade path is used (extrapolation mode, i.e. design temperature significantly above 25 °C)."
                      : "Not calculable — RRBO characterisation wt% inputs (Saturates / Mono / Di / Poly) must be entered in Stage 4 Process Design."}
                </span>
              </div>
            )}
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

    // Stage 3 validation helpers
    const s3ve = stageValidationErrors["fluid_properties"]   ?? {};
    const s3vw = stageValidationWarnings["fluid_properties"] ?? {};
    const fErr3 = (key: string) => s3ve[key];
    const s3Attempted = stageValidationAttempted.has("fluid_properties");
    const s3ErrCount  = Object.keys(s3ve).length;
    const s3WarnCount = Object.keys(s3vw).length;

    const prop = (label: string, key: string) => (
      <div key={key} data-field-key={`fluid_properties__${key}`}>
        <PropertyRow label={label} propKey={key} data={fp} onChange={f} onBlur={s} error={fErr3(key)} />
        {FLUID_PROPERTY_PROVENANCE[key] && !fErr3(key) && (
          <p className="text-[11px] text-gray-400 px-2 -mt-0.5">{FLUID_PROPERTY_PROVENANCE[key]}</p>
        )}
        {["interfacial_tension", "nmp_solubility_rrbo", "oil_solubility_nmp"].includes(key) && (fp[`${key}_value`] ?? "").trim() === "" && !fErr3(key) && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 mx-2 mt-0.5 inline-block">
            {PENDING_VALIDATION} — no approved NMP/RRBO two-phase value; enter laboratory/vendor data
          </p>
        )}
      </div>
    );
    const assumedCount = ["rrbo_viscosity_dynamic", "rrbo_viscosity_kinematic", "nmp_viscosity_dynamic", "interfacial_tension", "nmp_solubility_rrbo", "oil_solubility_nmp"]
      .filter(k => fp[`${k}_source`] === "Assumed").length;
    return (
      <div className="max-w-4xl">
        {/* Stage 3 validation banner — shown after first forward-nav attempt */}
        {s3Attempted && s3ErrCount > 0 && (
          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-500">⚠</span>
            <p className="text-sm font-semibold text-red-800">
              Stage incomplete — {s3ErrCount} required fluid propert{s3ErrCount > 1 ? "ies" : "y"} missing
            </p>
          </div>
        )}
        {s3Attempted && s3WarnCount > 0 && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-amber-500">⚠</span>
            <p className="text-sm text-amber-800">{s3vw["assumed_properties"]}</p>
          </div>
        )}
        {assumedCount > 0 && !s3Attempted && (
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
        <SectionCard title="Phase Separation Density — Application Calculated">
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 mb-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Source type: <strong>Assumed</strong> (provisional). No manual entry required or accepted.
              Replace governed dataset with controlled vendor or measured data before release-grade classification.
            </span>
          </div>
          {fpOt === null && (
            <p className="text-xs text-amber-700 px-1">Enter Operating Temperature in Design Basis to display densities.</p>
          )}
          {!fpGrade && (
            <p className="text-xs text-amber-700 px-1">Select RRBO Feed Service in Design Basis to display grade-specific density.</p>
          )}
          {fpOt !== null && densityPairQ.isLoading && (
            <p className="text-xs text-gray-400 py-1 px-1">Calculating…</p>
          )}
          {fpOt !== null && densityPairQ.isError && (
            <p className="text-xs text-red-600 py-1 px-1">Density lookup failed — verify Operating Temperature and Feed Service grade are valid.</p>
          )}
          {fpOt !== null && densityPairQ.data && (() => {
            const dp = densityPairQ.data as { nmp: { value: number }; rrbo: { value: number }; delta: number; rrboFluidId?: string; densityTrace?: { grade: string } };
            const gradeLabel = dp.densityTrace?.grade ?? (dp.rrboFluidId ?? "RRBO").replace("rrbo-", "").toUpperCase();
            const rows: { label: string; value: number; bold?: boolean }[] = [
              { label: `\u03c1 RRBO ${gradeLabel}`, value: dp.rrbo.value },
              { label: "\u03c1 NMP", value: dp.nmp.value },
              { label: `\u0394\u03c1 = |\u03c1\u2009NMP \u2212 \u03c1\u2009RRBO ${gradeLabel}|`, value: dp.delta, bold: true },
            ];
            return (
              <div className="space-y-0.5">
                <div className="flex items-center gap-4 text-xs text-gray-400 px-2 mb-1">
                  <span className="w-[240px]">Property</span>
                  <span className="w-[80px] text-right">Value</span>
                  <span className="w-[60px] pl-2">Unit</span>
                </div>
                {rows.map(r => (
                  <div key={r.label} className={`flex items-center gap-4 px-2 py-1 rounded ${r.bold ? "bg-gray-50 border border-gray-100 mt-1" : ""}`}>
                    <span className={`w-[240px] text-sm ${r.bold ? "font-semibold text-gray-800" : "text-gray-700"}`}>{r.label}</span>
                    <span className={`w-[80px] text-right font-mono text-sm ${r.bold ? "font-bold text-blue-800" : "text-blue-700"}`}>{r.value.toFixed(1)}</span>
                    <span className="w-[60px] pl-2 text-xs text-gray-500">kg/m³</span>
                  </div>
                ))}
                <p className="text-[11px] text-gray-400 px-2 pt-2">
                  Trace: {gradeLabel} · {fpOtStr} °C · ρ{gradeLabel} = {dp.rrbo.value.toFixed(1)} · ρNMP = {dp.nmp.value.toFixed(1)} · Δρ = {dp.delta.toFixed(1)} kg/m³ · EPD tabular (Assumed)
                </p>
              </div>
            );
          })()}
        </SectionCard>
        <SectionCard title="RRBO — Raffinate / Residual Base Oil">
          {prop("Dynamic Viscosity", "rrbo_viscosity_dynamic")}
          {prop("Kinematic Viscosity", "rrbo_viscosity_kinematic")}
          {prop("Temperature", "rrbo_temperature")}
          {prop("Water Content", "rrbo_water")}
          {prop("Colour (ASTM)", "rrbo_colour")}
          {prop("Sulphur Content", "rrbo_sulphur")}
          {prop("Asphaltenes", "rrbo_asphaltenes")}
        </SectionCard>
        <SectionCard title="NMP — N-Methyl-2-Pyrrolidone">
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

    // Stage 4 validation helpers
    const s4ve = stageValidationErrors["process_design"]   ?? {};
    const s4vw = stageValidationWarnings["process_design"] ?? {};
    const fErr4 = (key: string) => s4ve[key];
    const s4Attempted = stageValidationAttempted.has("process_design");
    const s4ErrCount  = Object.keys(s4ve).length;
    const s4WarnCount = Object.keys(s4vw).length;

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
    const ratioEff = (pd.so_ratio ?? "").trim();
    const stagesEff = pd.theoretical_stages ?? ""; // Engineer Override N_T — never defaulted
    const effEff = pd.stage_efficiency ?? ""; // informational-only, never defaulted
    const marginEff = (pd.design_margin ?? "").trim();
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
    const rhoNmp = epdNmpQ.data?.density?.value != null ? Number(epdNmpQ.data.density.value) : null;
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
        {/* Stage 4 validation banner — shown after first forward-nav attempt */}
        {s4Attempted && s4ErrCount > 0 && (
          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-500">⚠</span>
            <p className="text-sm font-semibold text-red-800">
              Stage incomplete — {s4ErrCount} required field{s4ErrCount > 1 ? "s" : ""} missing or invalid
            </p>
          </div>
        )}
        <SectionCard title="Process Inputs">
          <div data-field-key="process_design__so_ratio">
          <SelectRow
            label="Solvent / Oil Ratio"
            value={ratioEff}
            onChange={v => f("so_ratio", v)}
            onCommit={v => cs({ so_ratio: v, so_ratio_manual: v !== "" ? "true" : "" })}
            options={SO_RATIO_OPTIONS}
            unit=": 1 (vol/vol)"
            allowOther
            note="Engineer-entered project input — no default. Enter the design S/O ratio (vol NMP / vol RRBO)."
            error={fErr4("so_ratio")}
          />
          </div>
          {statusLine(`Status: ${ratioEff ? "Engineer-entered" : "Not entered — required input"} · Basis: NMP solvent volume flow / RRBO feed volume flow`)}

          <SelectRow
            label="Extraction Temperature"
            value={extTEff}
            onChange={v => f("extraction_temperature", v)}
            onBlur={s}
            onCommit={v => cs({ extraction_temperature: v, extraction_temperature_manual: v !== "" && v !== otStr ? "true" : "" })}
            options={["25", "30", "40", "50", "60", "70"]}
            unit="°C"
            note="Governed EPD tabular points — densities are exact at these temperatures; interpolated between them"
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

          <div data-field-key="process_design__theoretical_stages">
          <FieldRow
            label="Theoretical Stages (N_T)"
            value={stagesEff}
            onChange={v => {
              f("theoretical_stages", v);
              // Mark as Engineer Override the moment the user edits the field so
              // the write-back effect does not clobber a deliberate manual entry.
              cs({ theoretical_stages_source: v.trim() ? "override" : "" });
            }}
            onBlur={s}
            unit="stages"
            error={fErr4("theoretical_stages")}
          />
          </div>
          {(() => {
            const src = (pd.theoretical_stages_source ?? "").trim();
            if (src === "calculated") {
              return statusLine(`Status: Auto-Calculated · Coto 2022 LLE (N_T = ${stagesEff}) · Edit this field to enter an Engineer Override — the override will be labelled "Assumed / Pending Validation" in all reports`);
            }
            if (src === "override") {
              return statusLine(`Status: Engineer Override · Assumed / Pending Validation · Coto 2022 auto-calculation was overridden by a manual entry · Clear the field to restore auto-calculation`);
            }
            return statusLine(`Status: Pending · N_T will be auto-calculated from the Coto 2022 LLE model once all required inputs are present — enter a value here to use an Engineer Override instead`);
          })()}

          <div data-field-key="process_design__stage_efficiency">
          <FieldRow label="Stage Efficiency (informational only)" value={effEff} onChange={v => f("stage_efficiency", v)} onBlur={s} unit="%" error={fErr4("stage_efficiency")} />
          </div>
          {statusLine("Status: Manual (optional) · Informational only — does NOT govern packed-column height (H_active = N_T × HETS). Applies only where a separately governed stage-efficiency model exists (e.g. ECR mixer-settler compartments). Never defaulted.")}

          <div data-field-key="process_design__design_margin">
          <FieldRow label="Design Margin" value={marginEff} onChange={v => f("design_margin", v)} onBlur={s} unit="%" note="Engineer-entered project input — no default. Applied to Normal Solvent Circulation to give Maximum Solvent Circulation." error={fErr4("design_margin")} />
          </div>
          {statusLine(`Status: ${marginEff ? "Engineer-entered" : "Not entered — required input"} · Basis: Maximum Solvent Circulation = Normal × (1 + Margin / 100)`)}

          <div data-field-key="process_design__phase_configuration">
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
            <label className={`text-sm font-medium pt-1.5 ${fErr4("phase_configuration") ? "text-red-700" : "text-gray-700"}`}>
              Phase Configuration
              {fErr4("phase_configuration") && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <select
              value={pd.phase_configuration ?? ""}
              onChange={e => cs({ phase_configuration: e.target.value })}
              disabled={isFrozen}
              className={`h-8 text-sm border rounded-md px-2 bg-white ${fErr4("phase_configuration") ? "border-red-400 bg-red-50" : ""}`}
            >
              <option value="">Select…</option>
              {PHASE_CONFIG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span />
          </div>
          {fErr4("phase_configuration") && (
            <p className="text-xs text-red-600 font-medium px-2 mt-0.5">{fErr4("phase_configuration")}</p>
          )}
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

        <SectionCard title="RRBO Characterisation & LLE Targets — Governed N_T Inputs (Coto 2022)">
          <FieldRow label="RRBO Total Aromatics" value={pd.rrbo_total_aromatics_wt ?? ""} onChange={v => f("rrbo_total_aromatics_wt", v)} onBlur={s} unit="wt %" />
          {statusLine(`Status: ${(pd.rrbo_total_aromatics_wt ?? "").trim() !== "" && pd.rrbo_total_aromatics_wt !== TOTAL_AROMATICS_DEFAULT ? "Manual · Engineer-entered" : `Auto-Populated · default ${TOTAL_AROMATICS_DEFAULT} wt % — editable`} · Trigger for N_T input resolution — class distribution (Mono / Di / Poly) entered below; Total Aromatics is derived by the engine as their sum`)}

          {/* N_T calculability panel — shown whenever Total Aromatics is entered.
              Driven entirely by the governed resolver — never a hard-coded field list. */}
          {(() => {
            const totalAromEntered = (pd.rrbo_total_aromatics_wt ?? "").trim() !== "";
            if (!totalAromEntered) return null;
            const ntResult = resolveNtInputs(d("design_basis"), pd);
            if (ntResult.calculable) {
              return (
                <div className="my-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-800">All N_T inputs present — auto-calculation triggered</p>
                </div>
              );
            }
            return (
              <div className="my-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-800">
                    N_T requires {ntResult.missingFields.length} more input{ntResult.missingFields.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <ul className="space-y-1 pl-1">
                  {ntResult.missingFields.map(rf => (
                    <li key={rf.key} className="text-xs text-amber-900 flex items-start gap-1">
                      <span className="shrink-0 mt-0.5 text-amber-500">•</span>
                      <span>
                        <span className="font-medium">{rf.label}{rf.unit ? ` (${rf.unit})` : ""}</span>
                        {rf.section === "design_basis" && (
                          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-100 px-1 rounded">Stage 2</span>
                        )}
                        <span className="text-amber-700"> — {rf.reason}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          <div data-field-key="process_design__rrbo_saturates_wt">
            <FieldRow label="RRBO Saturates" value={pd.rrbo_saturates_wt ?? ""} onChange={v => f("rrbo_saturates_wt", v)} onBlur={s} unit="wt %" error={fErr4("rrbo_saturates_wt")} />
          </div>
          <div data-field-key="process_design__rrbo_mono_aromatics_wt">
            <FieldRow label="RRBO Mono-Aromatics" value={pd.rrbo_mono_aromatics_wt ?? ""} onChange={v => f("rrbo_mono_aromatics_wt", v)} onBlur={s} unit="wt %" error={fErr4("rrbo_mono_aromatics_wt")} />
          </div>
          <div data-field-key="process_design__rrbo_di_aromatics_wt">
            <FieldRow label="RRBO Di-Aromatics" value={pd.rrbo_di_aromatics_wt ?? ""} onChange={v => f("rrbo_di_aromatics_wt", v)} onBlur={s} unit="wt %" error={fErr4("rrbo_di_aromatics_wt")} />
          </div>
          <div data-field-key="process_design__rrbo_poly_aromatics_wt">
            <FieldRow label="RRBO Poly-Aromatics" value={pd.rrbo_poly_aromatics_wt ?? ""} onChange={v => f("rrbo_poly_aromatics_wt", v)} onBlur={s} unit="wt %" error={fErr4("rrbo_poly_aromatics_wt")} />
          </div>
          {(() => {
            const chSum = ["rrbo_saturates_wt", "rrbo_mono_aromatics_wt", "rrbo_di_aromatics_wt", "rrbo_poly_aromatics_wt"]
              .map(k => numOrNull((pd[k] ?? "").trim()))
              .reduce<number | null>((a, b) => (a === null || b === null ? null : a + b), 0);
            return chSum !== null && Math.abs(chSum - 100) > 0.5
              ? <p className="text-xs text-red-600 px-2 -mt-0.5">Characterisation classes sum to {chSum.toFixed(2)} wt % — must sum to 100 ± 0.5.</p>
              : null;
          })()}
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Characterisation Source</label>
            <select value={pd.rrbo_characterisation_source ?? ""} onChange={e => cs({ rrbo_characterisation_source: e.target.value })} disabled={isFrozen} className="h-8 text-sm border rounded-md px-2 bg-white">
              <option value="">Select…</option>
              {["Measured", "Vendor", "Literature", "Assumed"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <span />
          </div>

          {/* ── Assumed distribution — inline, no separate card ──────────── */}
          {(() => {
            const A = parseFloat((pd.rrbo_total_aromatics_wt ?? "").trim());
            if (!Number.isFinite(A) || A <= 0 || A >= 100) return null;
            const sat = parseFloat((100 - A).toFixed(4));
            const ar3 = parseFloat((A / 3).toFixed(4));
            const applyAssumed = () => {
              cs({
                rrbo_saturates_wt:            String(sat),
                rrbo_mono_aromatics_wt:       String(ar3),
                rrbo_di_aromatics_wt:         String(ar3),
                rrbo_poly_aromatics_wt:       String(ar3),
                rrbo_characterisation_source: "Assumed",
              });
              setTimeout(() => saveSection("process_design"), 60);
            };
            const hasValues = ["rrbo_saturates_wt", "rrbo_mono_aromatics_wt", "rrbo_di_aromatics_wt", "rrbo_poly_aromatics_wt"]
              .some(k => (pd[k as keyof typeof pd] ?? "").trim() !== "");
            return (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-[11px] text-orange-800 bg-orange-50 border border-orange-200 rounded">
                <span className="font-bold uppercase tracking-wider text-orange-600 shrink-0">[Testing]</span>
                <span className="text-orange-700 shrink-0">
                  Assumed: Sat&nbsp;=&nbsp;<strong>{sat}</strong>&nbsp;·
                  Mono&nbsp;=&nbsp;Di&nbsp;=&nbsp;Poly&nbsp;=&nbsp;<strong>{ar3}</strong>&nbsp;wt%
                  &nbsp;(Σ&nbsp;={parseFloat((sat + ar3 * 3).toFixed(4))}&nbsp;wt%)
                </span>
                {!isFrozen && (
                  <button
                    type="button"
                    onClick={applyAssumed}
                    className="ml-auto shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded border border-orange-400 bg-white hover:bg-orange-100 text-orange-800 transition-colors"
                  >
                    {hasValues ? "⟳ Re-apply" : "Apply"}
                  </button>
                )}
              </div>
            );
          })()}

          <FieldRow label="Source Reference (characterisation)" value={pd.rrbo_characterisation_source_reference ?? ""} onChange={v => f("rrbo_characterisation_source_reference", v)} onBlur={s} unit="" />
          {statusLine("Surrogate conversion: saturates → n-dodecane 170.34 · mono → 1,4-xylene 106.17 · di → 1-methylnaphthalene 142.20 · poly → pyrene 202.25 g/mol (governed constants, not user-entered)")}
          <div data-field-key="process_design__target_raffinate_aromatics_mol">
            <FieldRow label="Target Raffinate Aromatics" value={pd.target_raffinate_aromatics_mol ?? ""} onChange={v => f("target_raffinate_aromatics_mol", v)} onBlur={s} unit="mol %" error={fErr4("target_raffinate_aromatics_mol")} />
          </div>
          <FieldRow label="Source Reference (target)" value={pd.target_raffinate_aromatics_source_reference ?? ""} onChange={v => f("target_raffinate_aromatics_source_reference", v)} onBlur={s} unit="" />
          {statusLine("Governed envelope: raffinate locus x1R ∈ [0.641, 0.878] (total aromatics ≈ 6.2–20.1 mol %) at 298.15 K — targets outside fail closed, no extrapolation")}
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Target Source</label>
            <select value={pd.target_raffinate_aromatics_source ?? ""} onChange={e => cs({ target_raffinate_aromatics_source: e.target.value })} disabled={isFrozen} className="h-8 text-sm border rounded-md px-2 bg-white">
              <option value="">Select…</option>
              {["Measured", "Vendor", "Literature", "Assumed"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <span />
          </div>
          {/* Provenance status block — always visible, never auto-resolved */}
          {(() => {
            const tgtVal    = (pd.target_raffinate_aromatics_mol ?? "").trim();
            const tgtSrc    = (pd.target_raffinate_aromatics_source ?? "").trim();
            const tgtRefRaw = (pd.target_raffinate_aromatics_source_reference ?? "").trim();
            // Numeric mirror: ref equals target value string → not a real reference
            const isNumericMirror = tgtRefRaw !== "" &&
              Number.isFinite(parseFloat(tgtRefRaw)) &&
              Math.abs(parseFloat(tgtRefRaw) - parseFloat(tgtVal)) < 1e-9;
            const refDisplay = (tgtRefRaw === "" || isNumericMirror) ? "Not Provided" : tgtRefRaw;
            const srcDisplay = tgtSrc !== "" ? tgtSrc : "Not Stated";
            return (
              <div className="mx-2 mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-0.5">
                <p className="font-semibold text-amber-800 mb-1">Target Raffinate Aromatics — Provenance</p>
                <p><span className="text-amber-700 w-36 inline-block">Target:</span><span className="font-mono">{tgtVal !== "" ? `${tgtVal} mol%` : "—"}</span></p>
                <p><span className="text-amber-700 w-36 inline-block">Source:</span><span className="font-mono">{srcDisplay}</span></p>
                <p><span className="text-amber-700 w-36 inline-block">Source Reference:</span><span className={`font-mono ${refDisplay === "Not Provided" ? "italic" : ""}`}>{refDisplay}</span></p>
                <p><span className="text-amber-700 w-36 inline-block">Engineering Basis:</span><span className="font-semibold">Not Governed</span></p>
              </div>
            );
          })()}
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
              {(() => {
                const st = rd?.stages;
                const lle = rd?.lleStageCalculation;
                if (!st && !lle) return null;
                const auto = st?.mode === "auto_calculated";
                return (
                  <div className="mt-3 border rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-semibold text-gray-800">Theoretical Stages (N_T)</p>
                      {st?.theoreticalStages != null ? (
                        <span className={`font-mono text-sm font-bold whitespace-nowrap ${auto ? "text-blue-700" : "text-amber-700"}`}>
                          N_T = {st.theoreticalStages}{st.theoreticalStagesFractional != null && st.theoreticalStagesFractional !== st.theoreticalStages ? ` (calc. ${st.theoreticalStagesFractional})` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-red-700 font-medium">Not Calculable</span>
                      )}
                    </div>
                    <p className={`text-xs font-medium ${auto ? "text-blue-700" : st?.mode === "engineer_override" ? "text-amber-700" : "text-red-700"}`}>{st?.label}</p>
                    {st?.basis && <p className="text-xs text-gray-500">Basis: {st.basis}</p>}
                    {(() => {
                      const tm = lle?.temperatureModel;
                      if (!tm) return null;
                      const extrap = tm.mode === "extrapolation";
                      return (
                        <div className={`mt-2 p-2 rounded border ${extrap ? "bg-orange-50 border-orange-300" : "bg-emerald-50 border-emerald-200"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs font-semibold ${extrap ? "text-orange-800" : "text-emerald-800"}`}>Temperature-Dependent LLE Model</p>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${extrap ? "bg-orange-200 text-orange-900" : "bg-emerald-200 text-emerald-900"}`}>
                              {extrap ? "Extrapolation" : "Interpolation"}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-700">
                            <span>Extraction temperature (user-selected)</span>
                            <span className="font-mono">{tm.userSelectedTemperatureC} °C ({tm.userSelectedTemperatureK} K)</span>
                            <span>Calibrated temperature range</span>
                            <span className="font-mono">[{tm.calibratedTemperatureRangeK?.minK}, {tm.calibratedTemperatureRangeK?.maxK}] K</span>
                            {extrap && (
                              <>
                                <span>Distance outside calibrated range</span>
                                <span className="font-mono">{tm.distanceOutsideRangeK} K</span>
                              </>
                            )}
                            <span>Model</span>
                            <span className="font-mono">{tm.model?.id} v{tm.model?.version}</span>
                          </div>
                          <p className={`text-[11px] mt-1 font-medium ${extrap ? "text-orange-800" : "text-emerald-800"}`}>{tm.classification}</p>
                          <p className="text-[10px] text-gray-600 mt-0.5">{tm.statement}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">Validation status: {tm.validationStatus}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">Temperature source: {tm.temperatureSource}</p>
                        </div>
                      );
                    })()}
                    {st?.temperatureStatement && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded">
                        <p className="text-[11px] text-amber-800 font-medium">{st.temperatureStatement}</p>
                      </div>
                    )}
                    {lle?.limitExceeded && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                        <p className="text-xs font-semibold text-red-800">{lle.limitExceeded.limit}</p>
                        <p className="text-[11px] text-red-700 mt-0.5">{lle.limitExceeded.detail}</p>
                      </div>
                    )}
                    {lle?.feedStageNote && <p className="text-[11px] text-gray-500 mt-1">{lle.feedStageNote}</p>}
                    {Array.isArray(lle?.stageTrace) && lle.stageTrace.length > 0 && (
                      <div className="mt-2 overflow-x-auto">
                        <p className="text-xs font-semibold text-gray-700 mb-1">Stage-by-stage trace (from raffinate end, molar basis R_N = 100)</p>
                        <table className="text-[11px] font-mono border-collapse">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="border px-1.5 py-0.5">Stage</th>
                              <th className="border px-1.5 py-0.5">R out (mol)</th>
                              <th className="border px-1.5 py-0.5">x out [C12, Ar-mono, Ar-di, Ar-poly, NMP]</th>
                              <th className="border px-1.5 py-0.5">E out (mol)</th>
                              <th className="border px-1.5 py-0.5">Passing R (mol)</th>
                              <th className="border px-1.5 py-0.5">Aromatics passing</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lle.stageTrace.map((t: any, i: number) => (
                              <tr key={i} className="text-gray-700">
                                <td className="border px-1.5 py-0.5">{t.stageFromRaffinateEnd}</td>
                                <td className="border px-1.5 py-0.5">{t.raffinateLeaving?.flow_mol}</td>
                                <td className="border px-1.5 py-0.5">[{(t.raffinateLeaving?.x ?? []).join(", ")}]</td>
                                <td className="border px-1.5 py-0.5">{t.extractLeaving?.flow_mol}</td>
                                <td className="border px-1.5 py-0.5">{t.passingRaffinateFromAbove?.flow_mol}</td>
                                <td className="border px-1.5 py-0.5">{t.aromaticsInPassingStream}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {lle?.citation && <p className="text-[10px] text-gray-400 mt-2">Dataset: {lle.datasetId} v{lle.datasetVersion} · {lle.citation}</p>}
                  </div>
                );
              })()}
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
    const s5ve = stageValidationErrors["hydraulic_design"] ?? {};
    const fErr5 = (key: string) => s5ve[key];
    const hydRun = runs.filter(r => r.calculation_type === "hydraulics_common" && (r.calculation_status === "success" || r.calculation_status === "warning"))
      .sort((a, b) => new Date(b.calculated_at ?? 0).getTime() - new Date(a.calculated_at ?? 0).getTime())[0];
    const hydErrorRun = !hydRun
      ? runs.filter(r => r.calculation_type === "hydraulics_common" && r.calculation_status === "error")
          .sort((a, b) => new Date(b.calculated_at ?? 0).getTime() - new Date(a.calculated_at ?? 0).getTime())[0]
      : undefined;
    // Total Volumetric Flow — binding only: Feed Flow + Normal Solvent Flow
    // (both already established in Design Basis / Process Design).
    const dbx = d("design_basis");
    const pdx = d("process_design");
    const hydFeedLph = numOrNull(dbx.design_capacity_lph ?? dbx.design_capacity ?? dbx.feed_flow);
    const hydRatio = numOrNull((pdx.so_ratio ?? "").trim());
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
        {stageBanner("hydraulic_design")}
        <SectionCard title="Hydraulic Inputs">
          <FieldRow
            label="Trial diameter — screening only; does not govern final design"
            value={(hd.column_diameter ?? "").trim() !== "" ? (hd.column_diameter as string) : (minFeasibleD !== null ? String(minFeasibleD) : "")}
            onChange={v => f("column_diameter", v)}
            onBlur={s}
            unit="m"
            placeholder="Auto-sizes from the hydraulic screening sweep on first run"
          />
          {statusLine((hd.column_diameter ?? "").trim() !== ""
            ? "Status: Manual · Engineer-selected trial diameter — screening evaluation only. The governing design diameter is set in Step 7 (Governing Diameter Selection on the DS-SEL record)."
            : minFeasibleD !== null
              ? `Status: Auto-Populated · Minimum feasible diameter ${minFeasibleD} m from the Common Hydraulic sizing sweep (0.3–2.0 m) · Source: Common Hydraulic Design Engine — engineer may override before re-running`
              : "Status: Auto-Populated · Rule: first Run Common Hydraulics sizes the column via the screening sweep 0.3–2.0 m (0.05 m step) using the d32 screening basis below; the minimum feasible diameter then appears here")}
          <FieldRow label="Continuous Phase Density" value={hd.cont_density ?? (densityPairQ.data ? String(Math.round(densityPairQ.data.nmp.value * 10) / 10) : "")} onChange={v => f("cont_density", v)} onBlur={s} unit="kg/m³" note="Auto-filled from EPD library at Operating Temperature" />
          <FieldRow label="Dispersed Phase Density" value={hd.disp_density ?? (densityPairQ.data ? String(Math.round(densityPairQ.data.rrbo.value * 10) / 10) : "")} onChange={v => f("disp_density", v)} onBlur={s} unit="kg/m³" note="Auto-filled from EPD library at Operating Temperature" />
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
          <FieldRow label="Throughput Utilisation Band Upper Limit" value={hd.flooding_margin_design ?? "70"} onChange={v => f("flooding_margin_design", v)} onBlur={s} unit="%" note="Stored design criterion (e.g. 70%). The C3 engine applies the governed 40–80% screening band. This field is recorded here for reference; it does not replace a validated flooding correlation." />
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-3">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Hydraulic Model</label>
            <select
              value={hd.hydraulic_model ?? "d32_terminal"}
              onChange={e => commitSection("hydraulic_design", { hydraulic_model: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="d32_terminal">d₃₂ / Rigid-Sphere Terminal Velocity — Preliminary Screening / Pending Validation (Default)</option>
              <option value="characteristic_velocity">Characteristic Swarm Velocity u_K + Hindrance Exponent n (Engineer-entered, source-tagged)</option>
              <option value="asadollahzadeh_2017_kuhni_vk_preliminary">Asadollahzadeh 2017 Kühni V_k — Preliminary / Pending Validation</option>
            </select>
            <span />
          </div>
          {statusLine(`Status: ${(hd.hydraulic_model ?? "d32_terminal") === "d32_terminal"
            ? "Preliminary Screening · u_K = u_T (Pending Validation) · d₃₂ = 3 mm, n = 1 (Assumed screening defaults — Preliminary / Pending Validation)"
            : (hd.hydraulic_model ?? "") === "asadollahzadeh_2017_kuhni_vk_preliminary"
              ? "Preliminary Kühni route · V_k is calculated from Stage 4 operating-temperature properties and Stage 7 rotor ratio/speed; the rigid-sphere terminal velocity is not reused"
              : "Engineer-entered · u_K and n source-tagged"}`)}
          {(hd.hydraulic_model ?? "d32_terminal") === "d32_terminal" ? (
            <>
              <FieldRow label="Sauter Mean Diameter d32 (screening)" value={hd.sauter_mean_d32 ?? ""} onChange={v => f("sauter_mean_d32", v)} onBlur={s} unit="mm" note="Screening default: d₃₂ = 3 mm (Assumed — Preliminary / Pending Validation). Replace with a measured, vendor, or literature value before design-grade use. Never adjusted to obtain a desired column diameter." error={fErr5("sauter_mean_d32")} />
              {statusLine(`Status: ${(hd.sauter_mean_d32 ?? "").trim() !== "" && hd.sauter_mean_d32_source_ref !== "Thermopac Preliminary Screening Default — d₃₂ = 3 mm (Assumed / Preliminary / Pending Validation)" ? `Engineer-entered · d₃₂ = ${hd.sauter_mean_d32} mm` : `Screening default · d₃₂ = 3 mm (Assumed — Preliminary / Pending Validation)`} · Basis: d₃₂ / rigid-sphere terminal velocity — u_K = u_T`)}
              <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5 mt-1">
                <label className={`text-sm font-medium pt-1.5 ${fErr5("sauter_mean_d32_source") ? "text-red-700" : "text-gray-700"}`}>
                  d32 Source Type{fErr5("sauter_mean_d32_source") && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <div>
                  <select
                    value={hd.sauter_mean_d32_source ?? ""}
                    onChange={e => commitSection("hydraulic_design", { sauter_mean_d32_source: e.target.value })}
                    disabled={isFrozen}
                    className={`h-8 text-sm border rounded-md px-2 bg-white w-full ${fErr5("sauter_mean_d32_source") ? "border-red-400 bg-red-50" : ""}`}
                  >
                    <option value="">— select source type —</option>
                    <option value="Measured">Measured</option>
                    <option value="Vendor">Vendor</option>
                    <option value="Literature">Literature</option>
                    <option value="Assumed">Assumed</option>
                  </select>
                  {fErr5("sauter_mean_d32_source") && <p className="text-xs text-red-600 font-medium mt-0.5">{fErr5("sauter_mean_d32_source")}</p>}
                </div>
                <span />
              </div>
              <FieldRow label="d32 Source Reference" value={hd.sauter_mean_d32_source_ref ?? ""} onChange={v => f("sauter_mean_d32_source_ref", v)} onBlur={s} unit="" placeholder="e.g. Laboratory measurement report / Vendor droplet study / Thornton 1959 — pending RRBO-NMP data" error={fErr5("sauter_mean_d32_source_ref")} />

              {/* ── Hindrance Exponent n (governed, source-tagged — d32_terminal mode) ───── */}
              <FieldRow
                label="Hindrance Exponent n"
                value={hd.hindrance_exponent ?? ""}
                onChange={v => f("hindrance_exponent", v)}
                onBlur={s}
                unit="—"
                note="Screening default: n = 1 (Assumed — Preliminary / Pending Validation). Governs the slip model: u_slip(φ) = u_K·(1−φ)^n. Not a universal relationship — replace with a measured or literature value before design-grade use."
                error={fErr5("hindrance_exponent")}
              />
              {statusLine(`Status: ${hd.hindrance_exponent_source_ref === "Thermopac Preliminary Screening Default — n = 1 (Assumed / Preliminary / Pending Validation)" ? "Screening default · n = 1 (Assumed — Preliminary / Pending Validation)" : `Engineer-entered · n = ${hd.hindrance_exponent}`}`)}
              <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5 mt-1">
                <label className={`text-sm font-medium pt-1.5 ${fErr5("hindrance_exponent_source") ? "text-red-700" : "text-gray-700"}`}>
                  n Source Type{fErr5("hindrance_exponent_source") && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <div>
                  <select
                    value={hd.hindrance_exponent_source ?? ""}
                    onChange={e => commitSection("hydraulic_design", { hindrance_exponent_source: e.target.value })}
                    disabled={isFrozen}
                    className={`h-8 text-sm border rounded-md px-2 bg-white w-full ${fErr5("hindrance_exponent_source") ? "border-red-400 bg-red-50" : ""}`}
                  >
                    <option value="">— select source type —</option>
                    <option value="Measured">Measured</option>
                    <option value="Vendor">Vendor</option>
                    <option value="Literature">Literature</option>
                    <option value="Assumed">Assumed</option>
                  </select>
                  {fErr5("hindrance_exponent_source") && <p className="text-xs text-red-600 font-medium mt-0.5">{fErr5("hindrance_exponent_source")}</p>}
                </div>
                <span />
              </div>
              <FieldRow label="n Source Reference" value={hd.hindrance_exponent_source_ref ?? ""} onChange={v => f("hindrance_exponent_source_ref", v)} onBlur={s} unit="" placeholder="e.g. Lapidus & Elgin 1957 / Thornton 1956 / Godfrey & Slater 1994 / Laboratory holdup experiment — pending RRBO-NMP validation" error={fErr5("hindrance_exponent_source_ref")} />
            </>
          ) : (hd.hydraulic_model ?? "") === "asadollahzadeh_2017_kuhni_vk_preliminary" ? (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-2">
                <p className="text-sm font-semibold text-amber-900 mb-1">Asadollahzadeh 2017 Kühni V<sub>k</sub> — Preliminary Route</p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  V<sub>k</sub> = 0.237·(ρ<sub>c</sub>/Δρ)<sup>0.741</sup>·Fr<sup>−0.184</sup>·N<sub>μ</sub><sup>−0.095</sup>·(1 + 0.052α<sub>MT</sub>), with Fr = N²d<sub>R</sub>/g and N<sub>μ</sub> = μ<sub>c</sub>⁴g/(ρ<sub>d</sub>γ³).
                  The route inherits operating-temperature properties from Stage 4 and the rotor/column ratio plus rotor speed from Stage 7. For this RRBO→NMP extraction basis, α<sub>MT</sub> is resolved as +1 (d→c).
                </p>
                <p className="text-[11px] text-amber-800 mt-1 font-medium">
                  V<sub>k</sub> is calculated separately at every trial diameter because d<sub>R</sub> = (Stage 7 rotor ratio) × D. It is not the rigid-sphere terminal velocity.
                </p>
                <div className="mt-2 rounded border border-amber-300 bg-amber-100/70 p-2 text-[11px] text-amber-950 leading-relaxed">
                  <p className="font-semibold">Controlled source record — engineer decision: capacity/sizing use rejected</p>
                  <p>Primary bibliography verified: Asadollahzadeh, M.; Torkaman, R.; Torab-Mostaedi, M. “New correlations for slip velocity and characteristic velocity in a rotary liquid–liquid extraction column,” <em>Chemical Engineering Research &amp; Design</em> 127 (2017), 146–153. DOI: 10.1016/j.cherd.2017.07.032.</p>
                  <p className="mt-1">The publisher record exposes the abstract and an institutional-access/purchase path, not a retainable primary equation page. Therefore the native V<sub>k</sub> output unit, independent transcription check, fitted validity ranges, full tested geometry, and NMP/RRBO calibration are <strong>not established</strong>.</p>
                  <p className="mt-1 font-medium">Engineer decision (22 Aug 2026): <strong>REJECTED</strong> for Stage 5 capacity and diameter use. This route can show only audit V<sub>k</sub>, Fr, and Morton values; it cannot change Stage 5, Stage 7, or DS-SEL selections. A saved field cannot override this server-side decision.</p>
                </div>
              </div>
              <FieldRow
                label="Kühni-route Hindrance Exponent m"
                value={hd.kuhni_vk_hindrance_exponent ?? ""}
                onChange={v => f("kuhni_vk_hindrance_exponent", v)}
                onBlur={s}
                unit="—"
                note="No default and no carry-over from the rigid-sphere n. A supplied value is audit provenance only; the rejected source review prevents it from enabling capacity or diameter selection."
                error={fErr5("kuhni_vk_hindrance_exponent")}
              />
              <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5 mt-1">
                <label className={`text-sm font-medium pt-1.5 ${fErr5("kuhni_vk_hindrance_exponent_source") ? "text-red-700" : "text-gray-700"}`}>
                  Route-specific m Source Type{fErr5("kuhni_vk_hindrance_exponent_source") && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <div>
                  <select
                    value={hd.kuhni_vk_hindrance_exponent_source ?? ""}
                    onChange={e => commitSection("hydraulic_design", { kuhni_vk_hindrance_exponent_source: e.target.value })}
                    disabled={isFrozen}
                    className={`h-8 text-sm border rounded-md px-2 bg-white w-full ${fErr5("kuhni_vk_hindrance_exponent_source") ? "border-red-400 bg-red-50" : ""}`}
                  >
                    <option value="">— select source type —</option>
                    <option value="Measured">Measured</option>
                    <option value="Vendor">Vendor</option>
                    <option value="Literature">Literature</option>
                    <option value="Assumed">Assumed</option>
                  </select>
                </div>
                <span />
              </div>
              <FieldRow label="Route-specific m Source Reference" value={hd.kuhni_vk_hindrance_exponent_source_ref ?? ""} onChange={v => f("kuhni_vk_hindrance_exponent_source_ref", v)} onBlur={s} unit="" placeholder="Exact Kühni-route source, test report, or vendor curve" error={fErr5("kuhni_vk_hindrance_exponent_source_ref")} />
              {statusLine((hd.kuhni_vk_hindrance_exponent ?? "").trim()
                ? `Route-specific m entered · source: ${hd.kuhni_vk_hindrance_exponent_source || "missing"} · capacity sweep remains blocked pending primary-source evidence review`
                : "V_k can be audited from the inherited Stage 4/7 basis. Capacity and diameter outputs remain Not Calculable pending a separately sourced m and primary-source evidence review.")}
            </>
          ) : (
            <>
              <FieldRow label="Characteristic Swarm Velocity u_K" value={hd.characteristic_velocity ?? ""} onChange={v => f("characteristic_velocity", v)} onBlur={s} unit="m/s" note="Engineer-entered, source-tagged. Must be a measured swarm velocity for the RRBO/NMP system at the operating temperature and packing geometry — not the rigid-sphere terminal velocity u_T." error={fErr5("characteristic_velocity")} />
              {statusLine(`Status: ${(hd.characteristic_velocity ?? "").trim() !== "" ? "Engineer-entered" : "Not entered — required input"} · Source type and reference required`)}
              <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5 mt-1">
                <label className={`text-sm font-medium pt-1.5 ${fErr5("characteristic_velocity_source") ? "text-red-700" : "text-gray-700"}`}>
                  u_K Source Type{fErr5("characteristic_velocity_source") && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <div>
                  <select
                    value={hd.characteristic_velocity_source ?? ""}
                    onChange={e => commitSection("hydraulic_design", { characteristic_velocity_source: e.target.value })}
                    disabled={isFrozen}
                    className={`h-8 text-sm border rounded-md px-2 bg-white w-full ${fErr5("characteristic_velocity_source") ? "border-red-400 bg-red-50" : ""}`}
                  >
                    <option value="">— select source type —</option>
                    <option value="Measured">Measured</option>
                    <option value="Vendor">Vendor</option>
                    <option value="Literature">Literature</option>
                    <option value="Assumed">Assumed</option>
                  </select>
                  {fErr5("characteristic_velocity_source") && <p className="text-xs text-red-600 font-medium mt-0.5">{fErr5("characteristic_velocity_source")}</p>}
                </div>
                <span />
              </div>
              <FieldRow label="u_K Source Reference" value={hd.characteristic_velocity_source_ref ?? ""} onChange={v => f("characteristic_velocity_source_ref", v)} onBlur={s} unit="" placeholder="e.g. Laboratory holdup/slip experiment — RRBO SN300 / NMP at 60°C on MellapakPlus 252.Y; pending RRBO-NMP validation" error={fErr5("characteristic_velocity_source_ref")} />
              <FieldRow label="Hindrance Exponent n" value={hd.hindrance_exponent ?? ""} onChange={v => f("hindrance_exponent", v)} onBlur={s} unit="—" note="Engineer-entered project input — no default. Not a universal relationship; source: laboratory measurement or literature for this system." error={fErr5("hindrance_exponent")} />
              {statusLine(`Status: ${(hd.hindrance_exponent ?? "").trim() !== "" ? "Engineer-entered" : "Not entered — required input"} · Pending Laboratory Validation`)}
              <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5 mt-1">
                <label className={`text-sm font-medium pt-1.5 ${fErr5("hindrance_exponent_source") ? "text-red-700" : "text-gray-700"}`}>
                  Hindrance Exponent Source Type{fErr5("hindrance_exponent_source") && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <div>
                  <select
                    value={hd.hindrance_exponent_source ?? ""}
                    onChange={e => commitSection("hydraulic_design", { hindrance_exponent_source: e.target.value })}
                    disabled={isFrozen}
                    className={`h-8 text-sm border rounded-md px-2 bg-white w-full ${fErr5("hindrance_exponent_source") ? "border-red-400 bg-red-50" : ""}`}
                  >
                    <option value="">— select source type —</option>
                    <option value="Measured">Measured</option>
                    <option value="Vendor">Vendor</option>
                    <option value="Literature">Literature</option>
                    <option value="Assumed">Assumed</option>
                  </select>
                  {fErr5("hindrance_exponent_source") && <p className="text-xs text-red-600 font-medium mt-0.5">{fErr5("hindrance_exponent_source")}</p>}
                </div>
                <span />
              </div>
              <FieldRow label="Hindrance Exponent Source Reference" value={hd.hindrance_exponent_source_ref ?? ""} onChange={v => f("hindrance_exponent_source_ref", v)} onBlur={s} unit="" placeholder="e.g. Laboratory settling experiments / Coulaloglou & Tavlarides 1977 — pending RRBO-NMP validation" error={fErr5("hindrance_exponent_source_ref")} />
            </>
          )}
        </SectionCard>

        <SectionCard title="Pressure Drop Basis — Duss 2013 / Zogg (Controlled Literature)">
          <p className="text-[12px] text-gray-500 mb-3 leading-relaxed">
            Single-phase frictional ΔP/Δz using the Duss 2013 / Zogg framework
            (EQ3–EQ6: d<sub>h</sub> = 4/a; Re = u<sub>s</sub>·ρ·d<sub>h</sub>/η; F<sub>v</sub> = u<sub>s</sub>·√ρ; ΔP/Δz = c<sub>f</sub>·ρ·u<sub>s</sub>²/2d<sub>h</sub>).
            All results are classified: <span className="font-medium text-amber-700">Controlled Literature Prediction — Preliminary / Pending RRBO-NMP Validation</span>.
            Providing vendor data below supersedes the literature result without deleting it.
          </p>

          <SelectRow
            label="Packing Specific Surface Area"
            value={hd.packing_specific_surface_value ?? ""}
            onChange={v => f("packing_specific_surface_value", v)}
            onBlur={s}
            onCommit={v => commitSection("hydraulic_design", { packing_specific_surface_value: v })}
            options={["250", "300", "350", "400", "450", "500"]}
            unit="m²/m³"
            note="Engineer-selected packing geometry — no default. d_h = 4/a (DUSS2013-EQ3) calculated automatically."
            error={fErr5("packing_specific_surface_value")}
          />
          {statusLine(`Status: ${(hd.packing_specific_surface_value ?? "").trim() ? `a = ${hd.packing_specific_surface_value} m²/m³ · d_h = ${(4 / Number(hd.packing_specific_surface_value)).toFixed(5)} m (DUSS2013-EQ3: d_h = 4/a)` : "Not entered — required input"}`)}
          {(() => {
            const ssaV = Number((hd.packing_specific_surface_value ?? "").trim());
            if (!ssaV) return null;
            const link = ssaV === 250
              ? <span className="text-emerald-700">Duss 2013 governed basis: <b>MellapakPlus 252.Y</b> · 45° corrugation · Y-type · Table 2-A (Re 143–7144, Re<sub>crit</sub> = 250)</span>
              : ssaV === 500
                ? <span className="text-emerald-700">Duss 2013 governed basis: <b>BXPlus</b> · 30° corrugation · X-type · Table 2-B (Re 71–3572, Re<sub>crit</sub> = 450)</span>
                : <span className="text-amber-700 font-medium">No governed Duss 2013 cf dataset for {ssaV} m²/m³ — friction factor and pressure drop: Not Calculable. Vendor override required for ΔP.</span>;
            return <p className="text-[11px] px-2 mt-0.5">{link}</p>;
          })()}
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5 mt-2">
            <label className={`text-sm font-medium pt-1.5 ${fErr5("packing_specific_surface_source_type") ? "text-red-700" : "text-gray-700"}`}>
              Source Type (packing geometry){fErr5("packing_specific_surface_source_type") && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <div>
              <select
                value={hd.packing_specific_surface_source_type ?? ""}
                onChange={e => commitSection("hydraulic_design", { packing_specific_surface_source_type: e.target.value })}
                disabled={isFrozen}
                className={`h-8 text-sm border rounded-md px-2 bg-white w-full ${fErr5("packing_specific_surface_source_type") ? "border-red-400 bg-red-50" : ""}`}
              >
                <option value="">— select source type —</option>
                <option value="Literature">Literature</option>
                <option value="Vendor">Vendor</option>
                <option value="Measured">Measured</option>
                <option value="Assumed">Assumed</option>
              </select>
              {fErr5("packing_specific_surface_source_type") && <p className="text-xs text-red-600 font-medium mt-0.5">{fErr5("packing_specific_surface_source_type")}</p>}
            </div>
            <span />
          </div>
          <FieldRow
            label="Specific Surface Source Reference"
            value={hd.packing_specific_surface_source_ref ?? ""}
            onChange={v => f("packing_specific_surface_source_ref", v)}
            onBlur={s}
            unit=""
            placeholder="e.g. Duss 2013 Table 2-A / Sulzer Mellapak 250.Y data sheet rev. 2019"
            error={fErr5("packing_specific_surface_source_ref")}
          />

          <SelectRow
            label="Corrugation Angle"
            value={hd.packing_corrugation_angle_value ?? ""}
            onChange={v => f("packing_corrugation_angle_value", v)}
            onBlur={s}
            onCommit={v => commitSection("hydraulic_design", { packing_corrugation_angle_value: v })}
            options={["30", "45"]}
            unit="°"
            note="Governed packing geometry — no default. 45° = Y-type · 30° = X-type. cf dataset is governed by SSA, not by angle alone."
            error={fErr5("packing_corrugation_angle_value")}
          />
          {statusLine(`Status: ${(hd.packing_corrugation_angle_value ?? "").trim() ? "Engineer-selected" : "Not entered — required input"}`)}
          <FieldRow
            label="Corrugation Angle Source Reference"
            value={hd.packing_corrugation_angle_source_ref ?? ""}
            onChange={v => f("packing_corrugation_angle_source_ref", v)}
            onBlur={s}
            unit=""
            placeholder="e.g. Duss 2013 §Interpretation of Results / Vendor data sheet"
            error={fErr5("packing_corrugation_angle_source_ref")}
          />

          <div className="border-t border-gray-100 pt-3 mt-1">
            <p className="text-[12px] font-medium text-gray-600 mb-1.5">
              Friction Factor c<sub>f</sub> — Auto-Calculated (Governed Dataset)
            </p>
            {(() => {
              const ssaRaw = (hd.packing_specific_surface_value ?? "").trim();
              const ssa = Number(ssaRaw);
              // cf dataset governed by SSA — not by corrugation angle alone (Duss governance)
              const dataset = ssa === 250
                ? { label: "45° Y-type (Table 2-A) — MellapakPlus 252.Y basis", points: 11, reMin: 143, reMax: 7144, reCrit: 250 }
                : ssa === 500
                  ? { label: "30° X-type (Table 2-B) — BXPlus basis", points: 11, reMin: 71, reMax: 3572, reCrit: 450 }
                  : null;
              const intermediate = ssa === 300 || ssa === 350 || ssa === 400 || ssa === 450;
              return (
                <div className={`border rounded-lg p-3 text-[11px] space-y-1.5 ${dataset ? "bg-blue-50 border-blue-200 text-blue-800" : intermediate ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
                  <p className="font-semibold">c<sub>f</sub> is not user-entered — it is computed automatically at each operating Re using the Duss 2013 Table 2 governed dataset.</p>
                  {!ssaRaw && (
                    <p className="font-medium">Select Packing Specific Surface Area to determine the active governed dataset.</p>
                  )}
                  {intermediate && (
                    <p className="font-semibold text-amber-900">No governed Duss 2013 cf dataset for a = {ssa} m²/m³. Duss 2013 characterises only 250 m²/m³ (MellapakPlus 252.Y, Table 2-A) and 500 m²/m³ (BXPlus, Table 2-B). Hydraulic diameter d_h = 4/a is calculable; friction factor c<sub>f</sub> and pressure drop ΔP: <b>Not Calculable</b>. Provide a vendor pressure-drop override to proceed.</p>
                  )}
                  {dataset && (
                    <>
                      <p><span className="font-medium">Active dataset:</span> Duss 2013 Table 2, {dataset.label} — {dataset.points} points, Re {dataset.reMin}–{dataset.reMax}, Re<sub>crit</sub> = {dataset.reCrit}</p>
                      <p><span className="font-medium">Method:</span> Piecewise linear interpolation within the published range.</p>
                      <p><span className="font-medium">Below Re = {dataset.reMin}:</span> "Outside Tabulated Range." Boundary minimum ΔP estimate using c<sub>f</sub> at Re<sub>min</sub> — <span className="font-semibold text-amber-800">NOT design ΔP</span>; do not use for sizing.</p>
                      <p><span className="font-medium">Above Re = {dataset.reMax}:</span> "Outside Tabulated Range." No estimate.</p>
                    </>
                  )}
                  {ssaRaw && <p><span className="font-medium">Sources:</span> Duss 2013 (AIChE Spring Meeting, San Antonio, April 2013, Table 2) / Zogg 1972 (ETH Diss. Nr. 4886). Sulcol V3.0.8 values reproduced — treated as controlled-literature tabulated data.</p>}
                  {ssaRaw && <p><span className="font-medium">Provenance:</span> Controlled Literature — auto-calculated, not user-entered. Vendor-software outputs (Sulcol, DRP, etc.) are prohibited as direct design inputs.</p>}
                </div>
              );
            })()}
          </div>

          <div className="border-t border-gray-100 pt-3 mt-1">
            <p className="text-[12px] font-medium text-gray-600 mb-1.5">Vendor Pressure Drop Override (optional)</p>
            <p className="text-[11px] text-gray-400 mb-2">
              When entered, the vendor value supersedes the controlled-literature result as the active ΔP/Δz for this diameter.
              The literature calculation is retained alongside for comparison.
            </p>
          </div>
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Vendor ΔP Source Type</label>
            <select
              value={hd.vendor_dp_source_type ?? "Vendor"}
              onChange={e => commitSection("hydraulic_design", { vendor_dp_source_type: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="Vendor">Vendor</option>
              <option value="Measured">Measured</option>
              <option value="Literature">Literature</option>
            </select>
            <span />
          </div>
          <FieldRow label="Vendor ΔP/Δz (constant)" value={hd.vendor_dp_value ?? ""} onChange={v => f("vendor_dp_value", v)} onBlur={s} unit="Pa/m" placeholder="Leave blank to use literature basis — enter to activate vendor override" />
          <FieldRow label="Vendor ΔP Source Reference" value={hd.vendor_dp_source_ref ?? ""} onChange={v => f("vendor_dp_source_ref", v)} onBlur={s} unit="" placeholder="Vendor tech document / test report reference" />
          {statusLine(
            (hd.vendor_dp_value ?? "").trim() !== ""
              ? `Status: Vendor override active — ΔP/Δz = ${hd.vendor_dp_value} Pa/m will supersede the literature result; literature retained for comparison`
              : "Status: No vendor override — controlled-literature basis will be used"
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
          {!hydRun ? (
            hydErrorRun ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-red-600">Last run failed — fix the following before re-running:</p>
                <ul className="space-y-1">
                  {((hydErrorRun.validation_issues ?? []) as any[]).filter((e: any) => e.severity === "error").map((e: any, i: number) => (
                    <li key={i} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                      <span className="font-mono font-semibold">{e.field}</span>: {e.message}
                    </li>
                  ))}
                  {((hydErrorRun.validation_issues ?? []) as any[]).filter((e: any) => e.severity === "warning").map((e: any, i: number) => (
                    <li key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      <span className="font-mono font-semibold">{e.field}</span>: {e.message}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-gray-400">Run at: {new Date(hydErrorRun.calculated_at).toLocaleString()} · Engine v{hydErrorRun.engine_version}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Run Common Hydraulics to see results</p>
            )
          ) : (() => {
            const tv   = hydResData?.terminalVelocityScreening;
            const db2  = hydResData?.designBasis;
            const kuhniRoute = db2?.characteristicVelocityRoute;
            const normSum = hydResData?.normalCase?.summary;
            const maxSum  = hydResData?.maximumCase?.summary;
            const normDiams: any[] = hydResData?.normalCase?.diameters ?? [];
            const maxDiams:  any[] = hydResData?.maximumCase?.diameters ?? [];
            const firstKuhniVelocity = normDiams[0]?.characteristicVelocity;
            const n4 = (v: any) => typeof v === "number" ? v.toFixed(4) : "—";
            const n3 = (v: any) => typeof v === "number" ? v.toFixed(3) : "—";
            const n2 = (v: any) => typeof v === "number" ? v.toFixed(2) : "—";
            const feasLabel: Record<string,string> = {
              hydraulically_feasible:       "✓ Feasible",
              hydraulically_infeasible:     "✗ Infeasible",
              not_calculable:               "— Not calculable",
              pending_validation:           "— Pending",
            };
            const bandRow = (label: string, summary: any) => {
              if (!summary) return null;
              const feasCount = summary.hydraulicallyFeasibleDiameters_m?.length ?? 0;
              return (
                <div className="flex items-center gap-4 py-1">
                  <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
                  <span className="text-xs font-medium text-gray-800">
                    Min feasible: <span className="font-mono text-blue-700">{n3(summary.minimumFeasibleDiameter_m)} m</span>
                    <span className="ml-3 text-gray-600">Feasible diameters: <span className="font-mono text-blue-700">{feasCount}</span></span>
                  </span>
                </div>
              );
            };
            // Build per-diameter table rows.
            // Show feasible rows (≤110%) when they exist.
            // When the entire sweep is infeasible (no row passes the filter),
            // fall back to all rows so the engineer can see why each diameter failed.
            const feasNorm = normDiams.filter((r: any) => {
              const pct = r.percentageOfGenericHydraulicThroughputMaximum;
              return typeof pct === "number" && pct <= 110;
            });
            const keyDiams = feasNorm.length > 0 ? feasNorm : normDiams;
            const feasMax = maxDiams.filter((r: any) => {
              const pct = r.percentageOfGenericHydraulicThroughputMaximum;
              return typeof pct === "number" && pct <= 110;
            });
            const maxKeyDiams = feasMax.length > 0 ? feasMax : maxDiams;
            return (
              <div className="space-y-4">
                {/* Velocity basis */}
                {!kuhniRoute ? <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Terminal Velocity Screening (rigid-sphere, RRBO drop in NMP)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <CalcResultCard label="Sauter Mean Diameter d₃₂" formula="Engineer-entered (Assumed)" unit="m" reference="Thermopac Preliminary Screening Default"
                      result={db2?.sauterMeanDiameter?.value} engineVersion={hydRun?.engine_version} />
                    <CalcResultCard label="Terminal Velocity u_T" formula="u_T = √(4·d₃₂·Δρ·g / 3·C_D·ρ_c)" unit="m/s" reference="Iterative Cd/Re balance"
                      result={typeof tv?.velocity_m_s === "number" ? Number(tv.velocity_m_s.toFixed(5)) : undefined} engineVersion={hydRun?.engine_version} />
                    <CalcResultCard label="Reynolds Number Re_T" formula="Re = ρ_c·u_T·d₃₂ / μ_c" unit="—" reference="Dimensionless"
                      result={typeof tv?.reynolds === "number" ? Number(tv.reynolds.toFixed(2)) : undefined} engineVersion={hydRun?.engine_version} />
                    <CalcResultCard label="Drag Coefficient C_D" formula="C_D·Re² = (4/3)·d₃₂³·ρ_c·Δρ·g / μ_c²" unit="—" reference="Schiller-Naumann (intermediate)"
                      result={typeof tv?.dragCoefficient === "number" ? Number(tv.dragCoefficient.toFixed(4)) : undefined} engineVersion={hydRun?.engine_version} />
                    <CalcResultCard label="Flow Regime" formula="Re < 2 → Stokes; Re < 500 → Intermediate; else Turbulent" unit="" reference="Regime classification"
                      result={tv?.regime ?? undefined} engineVersion={hydRun?.engine_version} />
                    <CalcResultCard label="Density Difference Δρ" formula="Δρ = |ρ_NMP − ρ_RRBO|" unit="kg/m³" reference="Buoyancy driver"
                      result={typeof db2?.densityDifference_kg_m3 === "number" ? Number(db2.densityDifference_kg_m3.toFixed(3)) : undefined} engineVersion={hydRun?.engine_version} />
                  </div>
                  <p className="text-[10px] text-amber-600 mt-1 px-1">⚠ Rigid-sphere screening only — NOT a validated liquid-drop terminal velocity. All holdup results are Pending Validation.</p>
                </div> : <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Kühni V<sub>k</sub> Basis — Evidence Incomplete / Capacity Sweep Disabled</p>
                  <div className="grid grid-cols-2 gap-2">
                    <CalcResultCard label="Characteristic V_k native output (first trial diameter)" formula="V_k = 0.237·(ρ_c/Δρ)^0.741·Fr^-0.184·N_μ^-0.095·(1+0.052·α_MT)" unit="native units unverified"
                      reference={kuhniRoute.sourceReference ?? "Preliminary route"} result={typeof firstKuhniVelocity?.nativeOutputValue === "number" ? Number(firstKuhniVelocity.nativeOutputValue.toFixed(5)) : undefined} engineVersion={hydRun?.engine_version} />
                    <CalcResultCard label="Froude Number Fr (first trial diameter)" formula="Fr = N²·d_R/g" unit="—"
                      reference="Stage 7 rotor ratio and speed" result={typeof firstKuhniVelocity?.froudeNumber === "number" ? Number(firstKuhniVelocity.froudeNumber.toFixed(6)) : undefined} engineVersion={hydRun?.engine_version} />
                    <CalcResultCard label="Morton Number N_μ" formula="N_μ = μ_c⁴·g/(ρ_d·γ³)" unit="—"
                      reference="Stage 4 operating-temperature properties" result={typeof firstKuhniVelocity?.mortonNumber === "number" ? Number(firstKuhniVelocity.mortonNumber.toExponential(4)) : undefined} engineVersion={hydRun?.engine_version} />
                    <CalcResultCard label="Transfer Direction α_MT" formula="+1 dispersed→continuous; 0 no transfer; −1 continuous→dispersed" unit="—"
                      reference={firstKuhniVelocity?.transferDirection ?? "Not resolved"} result={firstKuhniVelocity?.alphaMT} engineVersion={hydRun?.engine_version} />
                  </div>
                  <p className="text-[10px] text-amber-600 mt-1 px-1">⚠ V<sub>k</sub> is calculated per trial diameter as an unlabelled audit expression output. Engineer review rejects capacity and diameter use because the primary equation page, native units, transcription, fitted ranges, geometry, NMP/RRBO applicability, and accepted m remain unavailable.</p>
                </div>}

                {/* Characteristic velocity & slip model */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Slip Model Parameters — C3 Generic Screening</p>
                  <div className="grid grid-cols-2 gap-2">
                    <CalcResultCard label={kuhniRoute ? "Kühni V_k (first trial diameter)" : "Characteristic Swarm Velocity u_K"} formula={kuhniRoute ? "Audit expression output shown above; no rigid-sphere u_T reuse" : "u_K = u_T (rigid-sphere) — Preliminary / Pending Validation"} unit={kuhniRoute ? "native units unknown" : "m/s"} reference={kuhniRoute ? "Asadollahzadeh 2017 publisher record verified; engineer rejected design use because the equation page and applicability evidence are unavailable" : "u_K ≠ u_T in general; rigid-sphere terminal velocity is an upper-bound screening proxy only. Replace with measured swarm velocity before design-grade use."}
                      result={kuhniRoute ? (typeof firstKuhniVelocity?.nativeOutputValue === "number" ? Number(firstKuhniVelocity.nativeOutputValue.toFixed(5)) : undefined) : (typeof db2?.characteristicVelocity?.value_m_s === "number" ? Number(db2.characteristicVelocity.value_m_s.toFixed(5)) : undefined)} engineVersion={hydRun?.engine_version} />
                    <CalcResultCard label={kuhniRoute ? "Route-specific Hindrance Exponent m" : "Hindrance Exponent n"} formula={kuhniRoute ? "u_slip(φ) = V_k·(1−φ)^m — source-required" : "u_slip(φ) = u_K·(1−φ)^n — Godfrey generic slip model"} unit="—"
                      reference={kuhniRoute ? (kuhniRoute.routeSpecificHindranceNote ?? "Not entered") : (hydResData?.designBasis?.hindranceExponent ? `${hydResData.designBasis.hindranceExponent.sourceType}: ${hydResData.designBasis.hindranceExponent.sourceReference}` : "Not entered — default n = 1 (Assumed) pending engineer input")}
                      result={kuhniRoute ? (typeof kuhniRoute.routeSpecificHindranceExponent?.value === "number" ? kuhniRoute.routeSpecificHindranceExponent.value : undefined) : (typeof hydResData?.designBasis?.hindranceExponent?.value === "number" ? hydResData.designBasis.hindranceExponent.value : undefined)} engineVersion={hydRun?.engine_version} />
                    <CalcResultCard label="Flow Ratio R (normal)" formula="R = u_NMP / u_RRBO = q_NMP / q_RRBO" unit="—" reference="Counter-current flow basis"
                      result={(() => { const rows = normDiams; if (!rows.length) return undefined; const r0 = rows[0]?.flowRatio?.value; return typeof r0 === "number" ? Number(r0.toFixed(4)) : undefined; })()} engineVersion={hydRun?.engine_version} />
                    <CalcResultCard label="Flow Ratio R (maximum)" formula="R_max = R_normal × maxCirculationFactor" unit="—" reference="Counter-current flow basis"
                      result={(() => { const rows = maxDiams; if (!rows.length) return undefined; const r0 = rows[0]?.flowRatio?.value; return typeof r0 === "number" ? Number(r0.toFixed(4)) : undefined; })()} engineVersion={hydRun?.engine_version} />
                  </div>
                </div>

                {/* Case summaries */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Diameter Sweep Summary (0.30–2.00 m, step 0.05 m)</p>
                  {kuhniRoute?.sourceEvidence?.capacitySweepAllowed === false && (
                    <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                      Capacity sweep rejected for the Kühni V<sub>k</sub> route: the primary equation page, native output units, independent transcription, fitted ranges, tested geometry, NMP/RRBO applicability, and accepted route-specific m are unavailable. No Stage 5 feasible diameter, Stage 7 carry-over, or DS-SEL update is produced from this route.
                    </div>
                  )}
                  <div className="bg-gray-50 rounded border px-3 py-2 space-y-1">
                    {bandRow("Normal case", normSum)}
                    {bandRow("Maximum case", maxSum)}
                    {normSum?.hydraulicallyFeasibleDiameters_m?.length > 0 && (
                      <div className="flex items-start gap-4 py-1">
                        <span className="text-xs text-gray-500 w-28 shrink-0">Feasible (normal)</span>
                        <span className="text-xs font-mono text-blue-700">{(normSum.hydraulicallyFeasibleDiameters_m as number[]).map((d: number) => `${d} m`).join("  ·  ")}</span>
                      </div>
                    )}
                    {normSum?.hydraulicallyInfeasibleDiameters_m?.length > 0 && (
                      <div className="flex items-start gap-4 py-1">
                        <span className="text-xs text-gray-500 w-28 shrink-0">Infeasible (normal)</span>
                        <span className="text-xs font-mono text-red-600">{(normSum.hydraulicallyInfeasibleDiameters_m as number[]).map((d: number) => `${d} m`).join("  ·  ")}</span>
                      </div>
                    )}
                    {normSum?.screeningBandSuspended && (
                      <p className="text-[10px] text-amber-700 pt-1">⚠ 40–80% screening band suspended — no governed source established. Feasible = holdup solution exists and % of max &lt; 100%.</p>
                    )}
                  </div>
                </div>

                {/* Normal case per-diameter table */}
                {keyDiams.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Normal Case — Per-Diameter Results</p>
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-100 text-gray-600">
                            <th className="text-left px-2 py-1 border border-gray-200">D (m)</th>
                            <th className="text-right px-2 py-1 border border-gray-200">% of Max</th>
                            <th className="text-left px-2 py-1 border border-gray-200">Feasibility</th>
                            <th className="text-right px-2 py-1 border border-gray-200">φ_op</th>
                            <th className="text-right px-2 py-1 border border-gray-200">Re</th>
                            <th className="text-right px-2 py-1 border border-gray-200">ΔP/Δz (Pa/m)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keyDiams.map((row: any) => {
                            const feas: string = row.genericHydraulicFeasibility ?? "";
                            const pct: number | null = typeof row.percentageOfGenericHydraulicThroughputMaximum === "number" ? row.percentageOfGenericHydraulicThroughputMaximum : null;
                            const phi: number | null = row.holdup?.operatingHoldup ?? null;
                            const litPd = row.pressureDropPrediction?.literature;
                            const re: number | null = litPd?.phaseReynolds ?? null;
                            const dpPm: number | null = litPd?.pressureDropPerMeter_Pa_m ?? null;
                            const dpMin: number | null = litPd?.pressureDropBoundaryMinimumEstimate?.pressureDropPerMeter_Pa_m ?? null;
                            const isFeasible = feas === "hydraulically_feasible";
                            return (
                              <tr key={row.diameter_m}
                                className={isFeasible ? "bg-blue-50" : feas === "hydraulically_infeasible" ? "bg-red-50" : ""}>
                                <td className="font-mono px-2 py-1 border border-gray-200 font-semibold">{n3(row.diameter_m)}</td>
                                <td className="font-mono text-right px-2 py-1 border border-gray-200">{n2(pct)}%</td>
                                <td className="px-2 py-1 border border-gray-200">{feasLabel[feas] ?? feas}</td>
                                <td className="font-mono text-right px-2 py-1 border border-gray-200">{phi != null ? n4(phi) : "—"}</td>
                                <td className="font-mono text-right px-2 py-1 border border-gray-200">{re != null ? n2(re) : "—"}</td>
                                <td className="font-mono text-right px-2 py-1 border border-gray-200">
                                  {dpPm != null ? n3(dpPm) : dpMin != null ? <span className="text-amber-600" title="Boundary minimum — NOT design ΔP">≥{n3(dpMin)}*</span> : <span className="text-gray-400">— (below Re range)</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-gray-400 mt-1">* Boundary minimum ΔP estimate using c_f at Re_min=143 — NOT design ΔP; actual c_f is higher (Zogg 1972). Re range for Duss 2013 Table 2-A: 143–7144.</p>
                    </div>
                  </div>
                )}

                {/* Maximum case per-diameter table */}
                {maxKeyDiams.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Maximum Case — Per-Diameter Results</p>
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-100 text-gray-600">
                            <th className="text-left px-2 py-1 border border-gray-200">D (m)</th>
                            <th className="text-right px-2 py-1 border border-gray-200">% of Max</th>
                            <th className="text-left px-2 py-1 border border-gray-200">Feasibility</th>
                            <th className="text-right px-2 py-1 border border-gray-200">φ_op</th>
                            <th className="text-right px-2 py-1 border border-gray-200">Re</th>
                            <th className="text-right px-2 py-1 border border-gray-200">ΔP/Δz (Pa/m)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {maxKeyDiams.map((row: any) => {
                            const feas: string = row.genericHydraulicFeasibility ?? "";
                            const pct: number | null = typeof row.percentageOfGenericHydraulicThroughputMaximum === "number" ? row.percentageOfGenericHydraulicThroughputMaximum : null;
                            const phi: number | null = row.holdup?.operatingHoldup ?? null;
                            const litPd = row.pressureDropPrediction?.literature;
                            const re: number | null = litPd?.phaseReynolds ?? null;
                            const dpPm: number | null = litPd?.pressureDropPerMeter_Pa_m ?? null;
                            const dpMin: number | null = litPd?.pressureDropBoundaryMinimumEstimate?.pressureDropPerMeter_Pa_m ?? null;
                            const isFeasible = feas === "hydraulically_feasible";
                            return (
                              <tr key={row.diameter_m}
                                className={isFeasible ? "bg-blue-50" : feas === "hydraulically_infeasible" ? "bg-red-50" : ""}>
                                <td className="font-mono px-2 py-1 border border-gray-200 font-semibold">{n3(row.diameter_m)}</td>
                                <td className="font-mono text-right px-2 py-1 border border-gray-200">{n2(pct)}%</td>
                                <td className="px-2 py-1 border border-gray-200">{feasLabel[feas] ?? feas}</td>
                                <td className="font-mono text-right px-2 py-1 border border-gray-200">{phi != null ? n4(phi) : "—"}</td>
                                <td className="font-mono text-right px-2 py-1 border border-gray-200">{re != null ? n2(re) : "—"}</td>
                                <td className="font-mono text-right px-2 py-1 border border-gray-200">
                                  {dpPm != null ? n3(dpPm) : dpMin != null ? <span className="text-amber-600" title="Boundary minimum — NOT design ΔP">≥{n3(dpMin)}*</span> : <span className="text-gray-400">— (below Re range)</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-gray-400 mt-1">* Boundary minimum ΔP estimate — NOT design ΔP. * At D=0.55 m maximum case, Re=144.9 is within the governed range → direct c_f interpolation available.</p>
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-gray-400">Engine v{hydRun?.engine_version} · Run: {new Date(hydRun?.calculated_at ?? 0).toLocaleString()} · Status: {hydRun?.calculation_status}</p>
              </div>
            );
          })()}
        </SectionCard>
      </div>
    );
  }

  function renderTechnologySelection() {
    const ts = d("technology_selection");
    const f = field("technology_selection");
    const s = save("technology_selection");
    const options = [
      { value: "ecr", label: "ECR — Kühni Agitated Column", desc: "Rotating agitator, higher stage efficiency, adjustable speed — selected technology for this service" },
    ];
    return (
      <div className="max-w-2xl">
        {stageBanner("technology_selection")}
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
                  checked={ts.technology === opt.value || (opt.value === "ecr" && (ts.technology === "ecp" || ts.technology === "both"))}
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
    // Stage 5 / Stage 3 / Stage 4 / DS-SEL carry-over — bindings only, no calculations.
    // Diameter priority (per DS-SEL-006 governance):
    //   1. DS-SEL effective diameter (autonomous ?? user-selected) — authoritative design basis
    //   2. hydraulic_design.column_diameter — engineer-entered trial in Stage 5
    //   3. hydraulics_common sweep minimum feasible diameter
    const hd = d("hydraulic_design");
    const fp = d("fluid_properties");
    const dbx = d("design_basis");
    const pdx = d("process_design");
    const feedLph = numOrNull(dbx.design_capacity_lph ?? dbx.design_capacity ?? dbx.feed_flow);
    const ratio = numOrNull((pdx.so_ratio ?? "").trim());
    const margin = numOrNull(pdx.design_margin);
    const totalLph = feedLph !== null && ratio !== null ? feedLph * (1 + ratio) : null;
    const hydResData = (resultsQ.data ?? []).find((r: any) => r.section === "hydraulics_common")?.data;
    const hydNormal = hydResData?.normalCase ?? hydResData?.cases?.normal;
    const minFeasibleD = numOrNull(String(hydNormal?.summary?.minimumFeasibleDiameter_m ?? ""));

    // DS-SEL effective diameter (mm → m)
    const dselRec = designSelectionQ.data?.record ?? null;
    const dselDiameter_mm = typeof dselRec?.effectiveDiameter_mm === "number" && isFinite(dselRec.effectiveDiameter_mm)
      ? dselRec.effectiveDiameter_mm : null;
    const dselDiameter_m = dselDiameter_mm !== null ? Math.round(dselDiameter_mm) / 1000 : null;
    const dselTech = dselRec?.selectedTechnology ?? null;
    const dselMode = dselRec?.selectionMode ?? null;

    // Validate DS-SEL against the current hydraulic sweep minimum.
    // If DS-SEL effective diameter < current sweep minimum, the record is stale:
    // it was generated from a previous run that produced a smaller minimum feasible
    // diameter. In that case fall back to Stage 5 and surface a stale warning.
    // A 1 mm tolerance handles floating-point rounding in the sweep.
    const dselDiameterValid = dselDiameter_m !== null &&
      (minFeasibleD === null || dselDiameter_m >= minFeasibleD - 0.001);

    // Technology mismatch: Stage 6 selection changed since this DS-SEL record was
    // generated. "both" always passes — it covers any single-tech record.
    const dselTechMismatch = dselTech !== null &&
      techSelection !== "both" &&
      dselTech.toLowerCase() !== techSelection.toLowerCase();

    const dselValid = dselDiameterValid && !dselTechMismatch;
    const dselStale = dselRec !== null && !dselValid;

    let diameter: number | null;
    let diameterSource: string;
    if (dselValid) {
      diameter = dselDiameter_m;
      const modeLabel = dselMode === "user_selected" ? "user-selected" : "autonomous";
      diameterSource = `Stage 7 — DS-SEL effective design diameter (${modeLabel}, ${dselDiameter_mm} mm)`;
    } else if ((hd.column_diameter ?? "").trim() !== "") {
      diameter = numOrNull(hd.column_diameter);
      diameterSource = "Stage 5 — engineer-selected trial diameter";
    } else {
      diameter = minFeasibleD;
      diameterSource = minFeasibleD !== null
        ? "Stage 5 — Common Hydraulic sizing sweep (minimum feasible diameter)"
        : "Stage 5 — pending Common Hydraulic run";
    }

    return {
      diameter, diameterSource, dselTech, dselStale, dselTechMismatch,
      dselDiameter_mm, // exposed for the stale warning message
      totalLph, totalM3h: totalLph !== null ? totalLph / 1000 : null,
      // Fall back to EPD library values (same source the Stage 5 field displays) when
      // the engineer has not manually stored a value in the hydraulic_design section.
      contDensity: hd.cont_density ||
        (densityPairQ.data ? String(Math.round((densityPairQ.data as any).nmp.value * 10) / 10) : ""),
      dispDensity: hd.disp_density ||
        (densityPairQ.data ? String(Math.round((densityPairQ.data as any).rrbo.value * 10) / 10) : ""),
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
    const fromDSSEL = co.diameterSource.startsWith("Stage 7 — DS-SEL");
    const row = (label: string, value: string, source: string) => (
      <div className="grid grid-cols-[180px_1fr] gap-2 py-1 border-b border-gray-50 last:border-0">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs">
          <span className="font-medium text-gray-800">{value}</span>
          <span className="block text-[10px] text-gray-400">Auto-Populated · Source: {source}</span>
        </span>
      </div>
    );
    const techLabel: Record<string, string> = {
      ecr: "ECR — Kühni Agitated Column",
    };
    const ts6 = d("technology_selection");
    const tech6Label = techLabel[techSelection] ?? techSelection.toUpperCase();
    const tech6Rationale = (ts6.technology_selection_rationale ?? "").trim();
    const cardTitle = "Design Inputs — Stage 5 Hydraulic Carry-Over + Stage 6 Technology Decision";
    return (
      <SectionCard title={cardTitle}>
        {/* Stale DS-SEL warning — tech mismatch or diameter below current sweep minimum */}
        {co.dselStale && (
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-300 rounded-lg mb-3 -mt-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 leading-snug">
              <span className="font-semibold">DS-SEL record is stale.</span>{" "}
              {co.dselTechMismatch
                ? <>Technology selection was changed to <strong>{techSelection.toUpperCase()}</strong> on Stage 6, but this DS-SEL record was generated for <strong>{(co.dselTech ?? "").toUpperCase()}</strong>. It does not reflect the current design intent.</>
                : <>The recorded effective diameter ({co.dselDiameter_mm} mm) is below the current hydraulic sweep minimum feasible diameter — generated from an earlier run with different inputs.</>
              }
              <span className="block mt-1 font-medium">
                Run the ECR calculation in Stage 7 — DS-SEL regenerates automatically and this record will be replaced.
              </span>
              Stage 5 hydraulic diameter is used below until the record is refreshed.
            </p>
          </div>
        )}
        {/* DS-SEL diameter override banner — shown when DS-SEL is valid and governs */}
        {fromDSSEL && !co.dselStale && (
          <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg mb-3 -mt-1">
            <Info className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-800 leading-snug">
              <span className="font-semibold">DS-SEL-006 diameter governance is active.</span>{" "}
              The column diameter below comes from the Autonomous Design Selection record (effective = user ?? autonomous),
              which supersedes the Stage 5 screening-only trial diameter.
              The Stage 5 trial is labelled "screening only — does not govern final design" and is retained for traceability.
            </p>
          </div>
        )}
        {/* ── Stage 6 Technology Decision ─────────────────────────────────── */}
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-1 mb-1">Stage 6 — Technology Decision</p>
        <div className="grid grid-cols-[180px_1fr] gap-2 py-1 border-b border-gray-50">
          <span className="text-xs text-gray-500">Selected Technology</span>
          <span className="text-xs">
            <span className="font-medium text-gray-800">{tech6Label || "— (not yet selected)"}</span>
            <span className="block text-[10px] text-gray-400">Engineer decision · Source: Stage 6 — Technology Selection</span>
          </span>
        </div>
        {/* ── Stage 5 Hydraulic Carry-Over ────────────────────────────────── */}
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-1">Stage 5 — Hydraulic Carry-Over</p>
        {row("Column Diameter", co.diameter !== null ? `${co.diameter} m` : "— (run Stage 5)", co.diameterSource)}
        {row("Total Volumetric Flow", co.totalLph !== null ? `${co.totalLph.toLocaleString("en-IN")} LPH = ${(co.totalM3h as number).toFixed(1)} m³/h` : "—", "Stage 5 — Feed + Normal Solvent Flow")}
        {row("Continuous Phase Density", co.contDensity ? `${co.contDensity} kg/m³` : "—", "Stage 5 — Hydraulic Design (engineer-entered)")}
        {row("Dispersed Phase Density", co.dispDensity ? `${co.dispDensity} kg/m³` : "—", "Stage 5 — Hydraulic Design (engineer-entered)")}
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
          Complete Technology Selection (Step 6) before designing equipment. Stage 7 is blocked until the technology (ECR — Kühni Agitated Column) is confirmed.
        </div>
      );
    }
    const co = equipmentCarryOver();
    return (
      <div className="max-w-5xl space-y-6">
        {stageBanner("equipment_design")}
        {renderCarryOverCard(co)}
        {renderDesignSelectionCard()}
        <div>
          {showECR && renderECRDesign()}
        </div>
      </div>
    );
  }

  function renderEcr2ProcessSimulation() {
    return (
      <div className="max-w-5xl space-y-4" data-testid="ecr2-process-simulation-stage">
        {stageBanner("ecr2_simulation")}
        <div className="flex items-start justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div>
            <p className="text-sm font-semibold text-blue-900">ECR-2 Process Simulation</p>
            <p className="mt-1 text-xs text-blue-800">
              This stage consumes the governed Stage 7 equipment basis and preserves the counter-current simulator as a separate process-simulation boundary.
              A future Optimizer mode may be added here; it is not enabled or implemented in this revision.
            </p>
          </div>
          <Badge className="shrink-0 border border-blue-200 bg-white text-blue-800 text-[10px]">SIMULATOR</Badge>
        </div>
        {renderEcr2Simulator()}
      </div>
    );
  }

  function renderEcr2Simulator() {
    const sim = d("ecr_simulator");
    const f = field("ecr_simulator");
    const s = save("ecr_simulator");
    const co = equipmentCarryOver();
    const ecrResult = (resultsQ.data ?? []).find((r: any) => r.section === "ecr")?.data;
    const ecr = d("ecr_design");
    const simResult = (resultsQ.data ?? []).find((r: any) => r.section === "ecr_simulator")?.data;
    const latestRun = runs
      .filter(r => r.calculation_type === "ecr_simulator")
      .sort((a, b) => new Date(b.calculated_at).getTime() - new Date(a.calculated_at).getTime())[0];
    const runReceipt = lastEcr2RunReceipt?.revisionId === activeRevisionId
      ? lastEcr2RunReceipt.run
      : null;
    const c2InputUpdatedAt = (inputsQ.data ?? []).find((row: any) => row.section === "process_design")?.updated_at;
    const c2ResultComputedAt = (resultsQ.data ?? []).find((row: any) => row.section === "process_design")?.computed_at;
    const c2InputsAreStale = !!(
      c2InputUpdatedAt
      && c2ResultComputedAt
      && new Date(c2InputUpdatedAt).getTime() > new Date(c2ResultComputedAt).getTime()
    );
    const runEcr2Simulation = async () => {
      if (isFrozen || !activeRevisionId || ecr2RunPreparing) return;
      setEcr2RunPreparing(true);
      setSavingSection("ecr_simulator");
      let simulatorInputsSaved = false;
      try {
        // A textarea blur and the Run click can occur in the same browser turn.
        // Persist the exact in-memory simulator payload before calculation so the
        // service never evaluates the previous blank/partial saved payload.
        await apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/inputs`, {
          section: "ecr_simulator",
          data: localData["ecr_simulator"] ?? {},
        });
        simulatorInputsSaved = true;
        await qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/inputs`] });
        await qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/ecr2-stage8-resolution`] });

        if (c2InputsAreStale) {
          toast({
            title: "Simulator inputs saved — refresh Stage 4 first",
            description: "C2 Process Design inputs changed after the accepted material-balance result. Re-run Stage 4 Material Balance before starting ECR-2.",
            variant: "destructive",
          });
          return;
        }
        const calculationResponse = await calculateMutation.mutateAsync("ecr_simulator");
        if (calculationResponse?.run && activeRevisionId) {
          // Show the persisted run identity immediately. The runs query is
          // refreshed by the mutation, but that refetch can complete after the
          // button handler returns (especially for a failed run).
          setLastEcr2RunReceipt({ revisionId: activeRevisionId, run: calculationResponse.run });
        }
      } catch (e: any) {
        // calculateMutation reports its own calculation error. Only surface a
        // dedicated message when the prerequisite save itself did not complete.
        if (!simulatorInputsSaved) {
          toast({ title: "Simulator input save failed", description: e.message, variant: "destructive" });
        }
      } finally {
        setSavingSection(null);
        setEcr2RunPreparing(false);
      }
    };
    const resolveStage8Candidates = async () => {
      if (isFrozen || !activeRevisionId || ecr2RunPreparing) return;
      setEcr2RunPreparing(true);
      setSavingSection("ecr_simulator");
      try {
        await apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/inputs`, {
          section: "ecr_simulator",
          data: localData["ecr_simulator"] ?? {},
        });
        await qc.invalidateQueries({ queryKey: [`/api/design-software/revisions/${activeRevisionId}/inputs`] });
        const preview = await stage8ResolutionQ.refetch();
        const resolved = preview.data?.autoPopulatedCount ?? 0;
        toast({
          title: "Stage 8 candidates resolved",
          description: `${resolved} of 15 numerical dependencies were resolved from the current governed server basis. Review and accept each candidate before running ECR-2.`,
        });
      } catch (e: any) {
        toast({ title: "Stage 8 resolution failed", description: e.message, variant: "destructive" });
      } finally {
        setSavingSection(null);
        setEcr2RunPreparing(false);
      }
    };
    const parseSnapshot = (value: any) => {
      if (typeof value !== "string") return value;
      try { return JSON.parse(value); } catch { return null; }
    };
    // Failed calculations are deliberately not upserted into results, but their
    // structured snapshot is the current safety record and must take precedence
    // over any earlier accepted result in this simulator panel.
    const latestFailedSnapshot = latestRun?.calculation_status === "error"
      ? parseSnapshot(latestRun.result_snapshot)
      : null;
    const latestInputSnapshot = parseSnapshot((latestRun as any)?.input_snapshot);
    const previewResolverRecords = stage8ResolutionQ.data?.records;
    const snapshotResolverRecords = latestInputSnapshot?.bvp?.stage8Resolution?.records;
    // The read-only preview reflects the current saved inputs. A historical run
    // is only used while the preview has not yet loaded, so stale candidates
    // cannot be accepted after a basis change.
    const serverResolverRecords = previewResolverRecords && Object.keys(previewResolverRecords).length > 0
      ? previewResolverRecords
      : snapshotResolverRecords ?? {};
    const displayedSnapshot = latestFailedSnapshot ?? simResult;
    const bvp = displayedSnapshot?.bvp;
    const headlineResults: any = displayedSnapshot?.headlineEngineeringResults ?? null;
    const massBalanceSummary: any = displayedSnapshot?.massBalanceSummary ?? null;
    const ecr2RaffinateProductQuality: any = displayedSnapshot?.raffinateProductQuality ?? null;
    const simulationBasis: any = displayedSnapshot?.designBasis ?? simResult?.designBasis ?? null;
    const simulationGeometry: any = displayedSnapshot?.geometry ?? null;
    const simulationPower: any = displayedSnapshot?.power ?? null;
    const simulationArea: any = displayedSnapshot?.interfacialArea ?? null;
    const d32Snapshot = displayedSnapshot?.d32;
    const d32SnapshotGovernance = getEcr2D32SnapshotGovernance(displayedSnapshot);
    const transferStatus = bvp?.transferStatus ?? displayedSnapshot?.transferStatus;
    const showPreliminaryTransferPerformance = canDisplayECR2PreliminaryTransferPerformance(bvp, transferStatus);
    const showingFailedSnapshot = !!latestFailedSnapshot;
    const hasStaleAcceptedSnapshot = !!simResult && showingFailedSnapshot;
    const activeHeight = ecrResult?.heightBreakdown?.activeAgitatedHeight?.result;
    const fmt = (value: any, digits = 4) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
    const inherited = [
      ["Operating temperature", d("design_basis").operating_temperature, "Design Basis"],
      ["RRBO feed", simulationBasis?.rrboFeed?.massFlow_kg_h ? `${fmt(simulationBasis.rrboFeed.massFlow_kg_h, 3)} kg/h` : (d("process_design").design_capacity_lph ? `${d("process_design").design_capacity_lph} LPH physical feed basis` : ""), "Stage 4 Process Design"],
      ["RRBO composition", d("process_design").rrbo_saturates_wt ? `Sat ${d("process_design").rrbo_saturates_wt}% · Mono ${d("process_design").rrbo_mono_aromatics_wt}% · Di ${d("process_design").rrbo_di_aromatics_wt}% · Poly ${d("process_design").rrbo_poly_aromatics_wt}%` : "Missing", "Stage 4 Process Design"],
      ["NMP feed / S/O ratio", simulationBasis?.nmpSolvent?.massFlow_kg_h ? `${fmt(simulationBasis.nmpSolvent.massFlow_kg_h, 3)} kg/h · S/O ${fmt(simulationBasis.SO_massRatio, 4)} mass basis` : (d("process_design").so_ratio ? `${d("process_design").so_ratio} volume basis` : ""), "Stage 4 Process Design"],
      ["Column diameter", co.diameter !== null ? `${co.diameter} m` : "", co.diameterSource],
      ["Active agitated height", typeof activeHeight === "number" ? `${activeHeight} m` : "", "Stage 7 — accepted ECR Equipment Design result"],
      ["Compartment height", ecr.compartment_height ? `${ecr.compartment_height} m` : "", "Stage 7 — ECR Equipment Design"],
      ["Rotor geometry", ecr.rotor_ratio ? `Dᵣ/D꜀ = ${ecr.rotor_ratio}` : "", "Stage 7 — ECR Equipment Design"],
      ["Rotor speed", ecr.rotor_speed ? `${ecr.rotor_speed} rpm` : "", "Stage 7 — ECR Equipment Design"],
      ["Power number", ecr.power_number ?? "", "Stage 7 — ECR Equipment Design"],
      ["RRBO viscosity", d("fluid_properties").rrbo_viscosity_dynamic_value, "Fluid Properties"],
      ["Interfacial tension", d("hydraulic_design").interfacial_tension || d("fluid_properties").interfacial_tension_value, "Two-Phase Properties"],
    ];
    const profile = bvp?.axialProfile ?? [];
    const compartments = bvp?.compartments ?? [];
    const resultOk = bvp?.status === "converged" && bvp?.massBalanceStatus === "passed";
    const staleResult = hasStaleAcceptedSnapshot;
    const hasAcceptedEcrRun = (resultsQ.data ?? []).some((r: any) =>
      r.section === "ecr" && r.data?.heightBreakdown?.activeAgitatedHeight?.result,
    );
    const legacyMw = parseSnapshot(sim.molecularWeights) ?? {};
    const legacyBvp = parseSnapshot(sim.bvp) ?? {};
    const numeric = (value: unknown) => {
      const n = Number(String(value ?? "").trim());
      return String(value ?? "").trim() !== "" && Number.isFinite(n) && n > 0;
    };
    const systemResolved = (record: any) => (
      (record?.status === "AUTO_RESOLVED_PENDING_ACCEPTANCE" || record?.status === "CALCULATED_PRELIMINARY")
      && numeric(record?.value)
    );
    const formatStage8Value = (value: unknown, unit: string) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "—";
      return unit === "g/mol" ? n.toFixed(2) : n.toExponential(4);
    };
    const evidenceFor = (id: ECR2Stage8NumericalParameterId, prefix: string) => {
      const record = serverResolverRecords[id] ?? findEcr2Stage8Evidence(id);
      const requestedStatus = sim[`${prefix}_evidence_status`] || "";
      const status = requestedStatus === "ENGINEER_OVERRIDE"
        ? requestedStatus
        : sim.stage8_system_values_acceptance_status === "ACCEPTED" && systemResolved(record)
          ? "ACCEPTED_AUTO_BASIS"
          : record.status;
      return {
        record,
        status,
      };
    };
    const evidenceIdForPrefix = (prefix: string): ECR2Stage8NumericalParameterId => (
      prefix.startsWith("molecular_weight_")
        ? `physical_mw_${prefix.replace("molecular_weight_", "")}` as ECR2Stage8NumericalParameterId
        : prefix as ECR2Stage8NumericalParameterId
    );
    const startEngineerOverride = (prefix: string, evidenceId: ECR2Stage8NumericalParameterId) => {
      commitSection("ecr_simulator", {
        [`${prefix}_evidence_status`]: "ENGINEER_OVERRIDE",
      });
    };
    const applyEngineerOverride = (prefix: string, key: string, value: string, evidenceId: ECR2Stage8NumericalParameterId) => {
      if (evidenceFor(evidenceId, prefix).status !== "ENGINEER_OVERRIDE") {
        commitSection("ecr_simulator", {
          [key]: value,
          [`${prefix}_evidence_status`]: "ENGINEER_OVERRIDE",
        });
        return;
      }
      f(key, value);
    };
    const acceptAllSystemResolvedValues = async () => {
      if (isFrozen || !activeRevisionId || ecr2AcceptancePreparing || ecr2RunPreparing) return;
      setEcr2AcceptancePreparing(true);
      try {
        const result = await apiRequest("POST", `/api/design-software/revisions/${activeRevisionId}/ecr2-stage8-resolution/accept-all`, {}) as {
          acceptedIds?: string[];
        };
        setLocalData(previous => {
          const simulator = { ...(previous.ecr_simulator ?? {}) };
          for (const key of Object.keys(simulator)) {
            if (/(?:_evidence_status|_original_evidence|_resolver_fingerprint|_resolver_signature|_accepted_by|_accepted_at|_override_reason|_override_user|_override_at)$/.test(key)) {
              delete simulator[key];
            }
          }
          simulator.stage8_system_values_acceptance_status = result.acceptedIds?.length ? "ACCEPTED" : "";
          return { ...previous, ecr_simulator: simulator };
        });
        await Promise.all([
          inputsQ.refetch(),
          stage8ResolutionQ.refetch(),
        ]);
        toast({
          title: "System-resolved Stage 8 values accepted",
          description: `${result.acceptedIds?.length ?? 0} current governed values were accepted and recorded by the server. Unresolved dependencies were not accepted.`,
        });
      } catch (e: any) {
        toast({ title: "Stage 8 acceptance failed", description: e.message, variant: "destructive" });
      } finally {
        setEcr2AcceptancePreparing(false);
      }
    };
    const visibleResolutionStatus = (evidence: ReturnType<typeof evidenceFor>, ready: boolean) => {
      const state = getEcr2Stage8VisibleResolutionState({
        status: evidence.status,
        hasResolvedValue: numeric(evidence.record.value),
        ready,
      });
      return {
        state,
        label: ECR2_STAGE8_VISIBLE_STATE_LABELS[state],
      };
    };
    const visibleWarning = (warning: string) => {
      if (warning === "RRBO_NMP_VALIDATION_PENDING") return "RRBO/NMP validation is pending.";
      if (warning === "NOT_YET_VALIDATED") return "Pilot calibration has not yet been completed.";
      if (warning === "System-resolved preliminary basis; engineer acceptance is required before numerical use.") {
        return "Preliminary system-resolved basis; engineer acceptance is required before numerical use.";
      }
      return warning;
    };
    const resolutionStatusBadge = (evidence: ReturnType<typeof evidenceFor>, ready: boolean) => {
      const visible = visibleResolutionStatus(evidence, ready);
      const className = visible.state === "SYSTEM_RESOLVED_READY" || visible.state === "ENGINEER_ACCEPTED_READY"
        ? "border border-emerald-200 bg-emerald-50 text-emerald-700 text-[9px]"
        : visible.state === "SYSTEM_RESOLVED_ACCEPTANCE_REQUIRED"
          ? "border border-amber-200 bg-amber-50 text-amber-800 text-[9px]"
          : "border border-red-200 bg-red-50 text-red-700 text-[9px]";
      return <Badge data-testid={`stage8-status-${evidence.record.id}`} className={className}>{visible.label}</Badge>;
    };
    const stage8Dependencies = ecr2LiveDependencies;
    const dependencyById = new Map(stage8Dependencies.map(dependency => [dependency.id, dependency]));
    const dependencyFor = (id: string) => {
      const dependency = dependencyById.get(id);
      if (!dependency) throw new Error(`Unknown Stage 8 dependency: ${id}`);
      return dependency;
    };
    const resolvedDependencies = stage8Dependencies.filter(dependency => dependency.ready);
    const unresolvedDependencies = stage8Dependencies.filter(dependency => !dependency.ready);
    const autoResolvedCount = stage8Dependencies.filter(dependency => dependency.group === "auto" && dependency.ready).length;
    const missingEngineeringCount = stage8Dependencies.filter(dependency => dependency.group === "engineering" && !dependency.ready).length;
    const missingApprovalCount = stage8Dependencies.filter(dependency => dependency.group === "approval" && !dependency.ready).length;
    const stage8Blocking = unresolvedDependencies.length > 0;
    // This is a system-resolution count, never a count of client-selected
    // "accepted" labels. A forged browser status must not make the register
    // advertise a numerical basis that the server catalog has not resolved.
    const autoPopulatedCount = [
      ...ECR2_STAGE8_COMPONENTS.slice(0, 4).map(component => `physical_mw_${component.key}`),
      ...ECR2_STAGE8_COMPONENTS.flatMap(component => ["c", "d"].map(phase => `diffusivity_${component.key}_${phase}`)),
    ].filter(id => {
      const record = serverResolverRecords[id] ?? findEcr2Stage8Evidence(id as ECR2Stage8NumericalParameterId);
       return (record.status === "AUTO_RESOLVED_PENDING_ACCEPTANCE" || record.status === "CALCULATED_PRELIMINARY")
         && typeof record.value === "number";
    }).length;
    const autoResolvedDiffusivityCount = ECR2_STAGE8_COMPONENTS
      .flatMap(component => ["c", "d"].map(phase => `diffusivity_${component.key}_${phase}`))
      .filter(id => {
        const record = serverResolverRecords[id] ?? findEcr2Stage8Evidence(id as ECR2Stage8NumericalParameterId);
        return (record.status === "AUTO_RESOLVED_PENDING_ACCEPTANCE" || record.status === "CALCULATED_PRELIMINARY")
          && typeof record.value === "number";
      }).length;
    const dependencyStatus = (sourceClass: string, ready: boolean) => (
      <div className="flex flex-wrap gap-1">
        <Badge className="border border-blue-200 bg-blue-50 text-blue-700 text-[9px]">{sourceClass}</Badge>
        <Badge className={ready
          ? "border border-emerald-200 bg-emerald-50 text-emerald-700 text-[9px]"
          : "border border-red-200 bg-red-50 text-red-700 text-[9px]"
        }>{ready ? "READY" : "MISSING_REQUIRED"}</Badge>
      </div>
    );
    const sourceEditor = (prefix: string, legacy?: any) => {
      const evidenceId = evidenceIdForPrefix(prefix);
      const evidence = evidenceFor(evidenceId, prefix);
      const editable = evidence.status === "ENGINEER_OVERRIDE";
      if (!editable) return null;
      return <div className="space-y-1">
        <select
          className="h-7 w-full rounded-md border bg-white px-1.5 text-[11px]"
          value={sim[`${prefix}_source_type`] ?? legacy?.sourceType ?? ""}
          disabled={isFrozen || !editable}
          onChange={e => applyEngineerOverride(prefix, `${prefix}_source_type`, e.target.value, evidenceId)}
          onBlur={s}
        >
          <option value="">Source class…</option>
          {ECR2_STAGE8_SOURCE_TYPES.map(source => <option key={source} value={source}>{source}</option>)}
        </select>
        <Input
          className="h-7 text-[11px]"
          value={sim[`${prefix}_source_reference`] ?? legacy?.sourceReference ?? ""}
          disabled={isFrozen}
          readOnly={!editable}
          placeholder="Source reference"
          onChange={e => applyEngineerOverride(prefix, `${prefix}_source_reference`, e.target.value, evidenceId)}
          onBlur={s}
        />
      </div>;
    };
    // Engineer-supplied d₃₂ is a direct sensitivity input, not one of the
    // numerical Stage 8 evidence records. Keep its provenance editor separate
    // from sourceEditor(), which resolves only catalog-backed evidence IDs.
    const engineerD32SourceEditor = () => (
      <div className="space-y-1">
        <select
          className="h-7 w-full rounded-md border bg-white px-1.5 text-[11px]"
          value={sim.d32_source_type ?? ""}
          disabled={isFrozen}
          onChange={e => f("d32_source_type", e.target.value)}
          onBlur={s}
        >
          <option value="">Source class…</option>
          {ECR2_STAGE8_SOURCE_TYPES.map(source => <option key={source} value={source}>{source}</option>)}
        </select>
        <Input
          className="h-7 text-[11px]"
          value={sim.d32_source_reference ?? ""}
          disabled={isFrozen}
          placeholder="Source reference"
          onChange={e => f("d32_source_reference", e.target.value)}
          onBlur={s}
        />
      </div>
    );
    const renderResolutionDetails = (prefix: string, evidence: ReturnType<typeof evidenceFor>, legacy: any, ready: boolean) => {
      const visible = visibleResolutionStatus(evidence, ready);
      const hasCandidate = numeric(evidence.record.value)
        && (systemResolved(evidence.record) || evidence.status === "ACCEPTED_AUTO_BASIS");
      if (evidence.status === "ENGINEER_OVERRIDE") {
        return sourceEditor(prefix, legacy);
      }
      if (hasCandidate && visible.state !== "EVIDENCE_GAP") {
        const referenceTemperature = evidence.record.inputSnapshot?.temperature_C
          ?? legacy?.referenceTemperature_C;
        const warnings = [
          ...(evidence.record.warnings ?? []),
          ...(evidence.record.validatedForRRBONMP === false ? ["RRBO_NMP_VALIDATION_PENDING"] : []),
          ...(evidence.record.pilotCalibrationStatus === "NOT_YET_VALIDATED" ? ["NOT_YET_VALIDATED"] : []),
        ].map(visibleWarning).filter((warning, index, all) => warning && all.indexOf(warning) === index);
        return <div className="space-y-1 text-[11px]">
          <p><strong>Source / reference:</strong> {evidence.record.source || legacy?.sourceReference || "—"}</p>
          <p><strong>Method:</strong> {evidence.record.method || legacy?.method || "—"}</p>
          <p><strong>Basis:</strong> {evidence.record.basis || "Preliminary system-resolved engineering basis."}</p>
          {referenceTemperature !== undefined && <p><strong>Reference temperature:</strong> {referenceTemperature} °C</p>}
          {warnings.map(warning => <p key={warning} className="text-amber-700"><strong>Warning:</strong> {warning}</p>)}
        </div>;
      }
      const evidenceId = evidenceIdForPrefix(prefix);
      return <div className="space-y-1">
        <p className="text-[10px] text-red-700"><strong>Evidence gap:</strong> {evidence.record.blockingReason || "A traceable basis is required."}</p>
        <Button type="button" variant="outline" size="sm" className="h-6 w-full text-[10px]" disabled={isFrozen} onClick={() => startEngineerOverride(prefix, evidenceId)}>
          Enter engineer override
        </Button>
      </div>;
    };
    const renderStage8DependencyRow = ({
      id,
      ready,
      parameter,
      value,
      unit,
      status,
      details,
    }: {
      id: string;
      ready: boolean;
      parameter: ReactNode;
      value: ReactNode;
      unit: ReactNode;
      status: ReactNode;
      details: ReactNode;
    }) => {
      const expanded = stage8ExpandedRows[id] ?? !ready;
      return <div key={id} className="border-b last:border-b-0">
        <div className="grid grid-cols-[170px_180px_70px_1fr_36px] items-start gap-2 px-3 py-2 text-xs">
          <span className="font-medium">{parameter}</span>
          <div className="min-w-0">{value}</div>
          <span className="pt-1">{unit}</span>
          <div className="min-w-0">{status}</div>
          <button
            type="button"
            className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            aria-expanded={expanded}
            aria-controls={`stage8-details-${id}`}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${typeof parameter === "string" ? parameter : "Stage 8 dependency"} details`}
            title={expanded ? "Collapse details" : "Expand details"}
            onClick={() => setStage8ExpandedRows(previous => ({ ...previous, [id]: !expanded }))}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
        {expanded && <div id={`stage8-details-${id}`} className="border-t bg-slate-50/70 px-3 py-2">
          {details}
        </div>}
      </div>;
    };
    return (
      <div className="space-y-4">
        <SectionCard title="ECR-2 — Counter-Current Simulator">
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 mb-4">
            <p className="text-sm font-semibold text-amber-900">Simulator only — preliminary engineering</p>
            <p className="text-xs text-amber-800 mt-1">
              Uses the governed five-component counter-current BVP. It does not alter ECR-1 design results, activate an optimizer,
              determine flooding, or create a design search.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px]">Published Correlation — Preliminary Engineering</Badge>
              <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px]">Primary source verification pending</Badge>
              <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px]">RRBO/NMP validation pending</Badge>
              <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px]">Pilot calibration pending</Badge>
            </div>
          </div>
          {c2InputsAreStale && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 mb-4" data-testid="ecr2-c2-refresh-required">
              <strong>Stage 4 refresh required before ECR-2 can run.</strong>
              <p className="mt-1">
                The saved C2 Process Design inputs are newer than the accepted material-balance result. This simulator will save its own inputs, but you must return to Stage 4 and run Material Balance before starting the ECR-2 calculation.
              </p>
            </div>
          )}

          <p className="text-xs font-semibold text-gray-700 mb-1">Inherited workspace inputs</p>
          <p className="text-[11px] text-gray-500 mb-2">These values remain owned by their named workspace stage. Edit them at the source, then rerun the upstream calculation before simulating. The simulator does not create shadow operating inputs.</p>
          <div className="rounded-lg border overflow-hidden mb-4">
            {inherited.map(([label, value, source]) => (
              <div key={label} className="grid grid-cols-[180px_1fr_auto] gap-2 px-3 py-2 border-b last:border-0 text-xs">
                <span className="text-gray-500">{label}</span>
                <span className={value ? "font-medium text-gray-800" : "text-red-700"}>{value || "MISSING_REQUIRED"}</span>
                <Badge className="h-5 bg-blue-50 text-blue-700 border border-blue-200 text-[9px]">{value ? `INHERITED · ${source}` : `Required source · ${source}`}</Badge>
              </div>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-700 mb-1">Simulator-only inputs</p>
          <p className="text-[11px] text-gray-500 mb-3">Stage 7 equipment geometry and operating data are inherited above and cannot be re-entered here. The diameter override below is the only permitted simulator geometry override.</p>
          <FieldRow label="Simulator-only diameter override" value={sim.columnDiameter_m ?? ""} onChange={v => f("columnDiameter_m", v)} onBlur={s} unit="m" note="Leave blank to inherit the governed Stage 5/Stage 7 diameter." />
          <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
            <Badge className="border border-blue-200 bg-blue-50 text-blue-700">INHERITED</Badge>
            <Badge className="border border-violet-200 bg-violet-50 text-violet-700">ENGINEER INPUT / APPROVAL</Badge>
            <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">CALCULATED</Badge>
            <Badge className="border border-red-200 bg-red-50 text-red-700">MISSING REQUIRED / BLOCKED</Badge>
            <Badge className="border border-amber-200 bg-amber-50 text-amber-800">PRELIMINARY / NOT RELEASE ELIGIBLE</Badge>
          </div>

           <SectionCard title="Stage 8 dependency register" className="mt-4">
              <p className="text-[11px] text-gray-500">The system resolves each numerical dependency from its governed evidence record; this is not a manual-entry worksheet. Each resolved value shows its value, source, method, and preliminary or validated status. One acceptance applies to all currently resolved values.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3" data-testid="stage8-auto-populated-summary">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                 <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">System-resolved numerical dependencies</p>
                <p className="mt-0.5 text-lg font-bold text-emerald-900">{autoPopulatedCount} / 14</p>
                <p className="text-[10px] text-emerald-800">4 physical MW + 10 diffusivities</p>
              </div>
              <div className="rounded-md border border-emerald-200 bg-white px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Diffusivities auto-resolved</p>
                <p className="mt-0.5 text-lg font-bold text-emerald-900">{autoResolvedDiffusivityCount} / 10</p>
                <p className="text-[10px] text-slate-600">{10 - autoResolvedDiffusivityCount} unresolved</p>
              </div>
              <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-800">Remaining approval</p>
                <p className="mt-0.5 text-sm font-bold text-violet-900">Kd concentration basis</p>
                <p className="text-[10px] text-violet-800">Engineer approval remains required</p>
              </div>
            </div>
             <div className="mt-3 flex flex-wrap items-center gap-2">
               <Button
                 type="button"
                 size="sm"
                 className="gap-1.5"
                 data-testid="accept-all-stage8-system-resolved"
                 disabled={isFrozen || ecr2AcceptancePreparing || ecr2RunPreparing || autoPopulatedCount === 0}
                 onClick={acceptAllSystemResolvedValues}
               >
                 {ecr2AcceptancePreparing ? "ACCEPTING SYSTEM-RESOLVED VALUES…" : "ACCEPT ALL SYSTEM-RESOLVED VALUES"}
               </Button>
               <p className="text-[10px] text-slate-500">
                 Accepts only current server-resolved values. Evidence gaps remain unresolved and are not accepted.
               </p>
             </div>
            <div className="mt-3 overflow-x-auto rounded-lg border">
              <div className="min-w-[900px]">
                 <div className="grid grid-cols-[170px_180px_70px_1fr_36px] gap-2 border-b bg-gray-50 px-3 py-2 text-[10px] font-semibold uppercase text-gray-500">
                   <span>Parameter</span><span>Value</span><span>Unit</span><span>Status</span><span aria-hidden="true"></span>
                </div>
                <div className="border-b bg-blue-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800">A. AUTO-RESOLVED</div>
                 {renderStage8DependencyRow({
                   id: "stage7_ecr_result",
                   ready: dependencyFor("stage7_ecr_result").ready,
                   parameter: "Stage 7 ECR equipment result",
                   value: dependencyFor("stage7_ecr_result").ready ? "Accepted active height + geometry" : <span className="text-red-700">Required before run</span>,
                   unit: "inherited",
                   status: dependencyStatus(dependencyFor("stage7_ecr_result").sourceClass, dependencyFor("stage7_ecr_result").ready),
                   details: <div className="text-[11px]">
                     <p><strong>Source:</strong> Stage 7 — accepted ECR Equipment Design result</p>
                     <p className="mt-1 text-[10px] text-gray-600"><strong>Use:</strong> active agitated height and ECR geometry for the BVP.</p>
                     {!dependencyFor("stage7_ecr_result").ready && <p className="text-[10px] text-red-700"><strong>Block:</strong> accepted Stage 7 ECR result is required; no manual Stage 8 geometry substitute is permitted.</p>}
                   </div>,
                 })}
                 {renderStage8DependencyRow({
                   id: "d32",
                   ready: dependencyFor("d32").ready,
                   parameter: "d₃₂",
                    value: sim.d32_mode === "engineer_supplied"
                      ? (sim.d32_value_mm || "—")
                       : sim.d32_mode === "direct_turbulence_preliminary"
                         ? (d32Snapshot?.d32_m ? `${fmt(d32Snapshot.d32_m * 1000, 4)} mm from latest preliminary run` : `C = ${sim.direct_turbulence_c_nominal || "—"} (range 0.36–0.43)`)
                      : d32Snapshot?.d32_m ? `${fmt(d32Snapshot.d32_m * 1000, 4)} mm from latest run` : "Unavailable — published K&H route is transcription-invalid",
                   unit: "mm",
                   status: dependencyStatus(dependencyFor("d32").sourceClass, dependencyFor("d32").ready),
                   details: <div className="space-y-1 text-[11px]">
                     <select className="h-7 w-full rounded-md border bg-white px-1.5 text-[11px]" value={sim.d32_mode || "published_correlation"} disabled={isFrozen} onChange={e => f("d32_mode", e.target.value)} onBlur={s}>
                        <option value="published_correlation">Published route — transcription-invalid (disabled)</option>
                        <option value="direct_turbulence_preliminary">Direct turbulence — preliminary engineering / not yet pilot validated</option>
                       <option value="engineer_supplied">Engineer supplied</option>
                     </select>
                     {sim.d32_mode === "engineer_supplied"
                       ? <><Input className="h-7 text-[11px]" value={sim.d32_value_mm ?? ""} disabled={isFrozen} placeholder="d₃₂ value" onChange={e => f("d32_value_mm", e.target.value)} onBlur={s} />{engineerD32SourceEditor()}</>
                        : sim.d32_mode === "direct_turbulence_preliminary"
                          ? <div className="space-y-1 rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
                              <p className="font-semibold">DIRECT_TURBULENCE_D32_PRELIMINARY — PRELIMINARY_ENGINEERING / NOT YET PILOT_VALIDATED</p>
                              <p>Uses governed Stage 7 Nₑ, n, d_R, V_R and Stage 4/8 γ, ρc: d₃₂ = C(γ/ρc)^0.6ε^-0.4; ε = Nₑn³d_R⁵/V_R. This is not the K&H 1996 route.</p>
                              <Input className="h-7 text-[11px]" value={sim.direct_turbulence_c_nominal ?? ""} disabled={isFrozen} placeholder="Selected nominal C (0.36–0.43)" onChange={e => f("direct_turbulence_c_nominal", e.target.value)} onBlur={s} />
                              <select className="h-7 w-full rounded-md border bg-white px-1.5 text-[11px]" value={sim.direct_turbulence_c_source_type ?? ""} disabled={isFrozen} onChange={e => f("direct_turbulence_c_source_type", e.target.value)} onBlur={s}>
                                <option value="">C source class</option>
                                {ECR2_STAGE8_SOURCE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                              </select>
                              <Input className="h-7 text-[11px]" value={sim.direct_turbulence_c_source_reference ?? ""} disabled={isFrozen} placeholder="Source reference for selected nominal C" onChange={e => f("direct_turbulence_c_source_reference", e.target.value)} onBlur={s} />
                              {d32Snapshot?.directTurbulence && <p>Frozen sensitivity: C={d32Snapshot.directTurbulence.C_min} → {fmt(d32Snapshot.directTurbulence.d32_at_C_min_m * 1000, 4)} mm; selected C={d32Snapshot.directTurbulence.C_nominal} → {fmt(d32Snapshot.directTurbulence.d32_at_C_nominal_m * 1000, 4)} mm; C={d32Snapshot.directTurbulence.C_max} → {fmt(d32Snapshot.directTurbulence.d32_at_C_max_m * 1000, 4)} mm.</p>}
                            </div>
                       : <p className="text-[10px] text-red-700">ecr2_d32_kh1996 — transcription-invalid route; numerical use is disabled pending independent source resolution.</p>}
                     <p className="mt-1 text-[10px] text-gray-600"><strong>Use:</strong> a = 6φd/d32 and local transfer calculation.</p>
                    {!dependencyFor("d32").ready && <p className="text-[10px] text-red-700"><strong>Block:</strong> {dependencyFor("d32").blockingReason}</p>}
                   </div>,
                 })}

                 <div className="border-b bg-amber-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">B. SYSTEM-RESOLVED VALUES</div>
                {ECR2_STAGE8_COMPONENTS.slice(0, 4).map(component => {
                  const prefix = `molecular_weight_${component.key}`;
                  const legacyKey = component.key === "sat" ? "saturates_g_mol" : `${component.key}_g_mol`;
                  const legacy = legacyMw[legacyKey];
                  const evidence = evidenceFor(`physical_mw_${component.key}` as ECR2Stage8NumericalParameterId, prefix);
                  const editable = evidence.status === "ENGINEER_OVERRIDE";
                   const resolvedValue = !editable && numeric(evidence.record.value)
                     ? evidence.record.value
                     : (sim[`${prefix}_value`] ?? legacy?.value);
                   const ready = dependencyFor(prefix).ready;
                   return renderStage8DependencyRow({
                     id: prefix,
                     ready,
                     parameter: `Physical MW — ${component.label}`,
                     value: <div className={`h-7 rounded-md border px-2 py-1 text-[11px] ${resolvedValue ? "bg-slate-50 text-slate-800" : "bg-red-50 text-red-700"}`}>{resolvedValue ? formatStage8Value(resolvedValue, evidence.record.unit) : "—"}</div>,
                     unit: "g/mol",
                     status: resolutionStatusBadge(evidence, ready),
                     details: <div className="space-y-2 text-[11px]">
                       {editable && <Input className="h-7 text-[11px]" value={sim[`${prefix}_value`] ?? legacy?.value ?? ""} disabled={isFrozen} placeholder="Override value" onChange={e => applyEngineerOverride(prefix, `${prefix}_value`, e.target.value, `physical_mw_${component.key}` as ECR2Stage8NumericalParameterId)} onBlur={s} />}
                       {renderResolutionDetails(prefix, evidence, legacy, ready)}
                       <p className="text-[10px] text-gray-600"><strong>Use:</strong> physical concentration, equilibrium concentration, Kd, driving force, and transfer rate; never NRTL.</p>
                       {!ready && evidence.status === "ENGINEER_OVERRIDE" && <p className="text-[10px] text-red-700"><strong>Review:</strong> positive value, source, reference, reason, and audit metadata are required.</p>}
                     </div>,
                   });
                })}

                {ECR2_STAGE8_COMPONENTS.flatMap(component => (["c", "d"] as const).map(phase => {
                  const prefix = `diffusivity_${component.key}_${phase}`;
                  const legacy = legacyBvp.diffusivity?.[component.label]?.[phase === "c" ? "De_c" : "De_d"];
                  const evidence = evidenceFor(prefix as ECR2Stage8NumericalParameterId, prefix);
                  const editable = evidence.status === "ENGINEER_OVERRIDE";
                   const ready = dependencyFor(prefix).ready;
                   const resolvedValue = !editable && numeric(evidence.record.value)
                     ? evidence.record.value
                     : (sim[`${prefix}_value`] ?? legacy?.value_m2_s);
                   const referenceTemperature = sim[`${prefix}_reference_temperature_c`]
                     ?? evidence.record.inputSnapshot?.temperature_C
                     ?? legacy?.referenceTemperature_C;
                   return renderStage8DependencyRow({
                     id: prefix,
                     ready,
                     parameter: `${phase === "c" ? "Dc" : "Dd"} ${component.label}`,
                     value: <div className={`h-7 rounded-md border px-2 py-1 text-[11px] ${resolvedValue ? "bg-slate-50 text-slate-800" : "bg-red-50 text-red-700"}`}>{resolvedValue ? formatStage8Value(resolvedValue, evidence.record.unit) : "—"}</div>,
                     unit: "m²/s",
                     status: resolutionStatusBadge(evidence, ready),
                     details: <div className="space-y-2 text-[11px]">
                       {editable && <>
                         <Input className="h-7 text-[11px]" value={sim[`${prefix}_value`] ?? legacy?.value_m2_s ?? ""} disabled={isFrozen} placeholder="Override value" onChange={e => applyEngineerOverride(prefix, `${prefix}_value`, e.target.value, prefix as ECR2Stage8NumericalParameterId)} onBlur={s} />
                         <Input className="h-7 text-[11px]" value={sim[`${prefix}_reference_temperature_c`] ?? legacy?.referenceTemperature_C ?? ""} disabled={isFrozen} placeholder="Operating-temperature basis" onChange={e => applyEngineerOverride(prefix, `${prefix}_reference_temperature_c`, e.target.value, prefix as ECR2Stage8NumericalParameterId)} onBlur={s} />
                       </>}
                       {renderResolutionDetails(prefix, evidence, legacy, ready)}
                       {editable && <Input className="h-7 text-[11px]" value={sim[`${prefix}_method`] ?? legacy?.method ?? ""} disabled={isFrozen} placeholder="System calculation method" onChange={e => applyEngineerOverride(prefix, `${prefix}_method`, e.target.value, prefix as ECR2Stage8NumericalParameterId)} onBlur={s} />}
                       <p className="text-[10px] text-gray-600"><strong>Use:</strong> {phase === "c" ? "continuous" : "dispersed"}-phase {component.label} local transfer and Schmidt calculation.</p>
                       {!ready && evidence.status === "ENGINEER_OVERRIDE" && <p className="text-[10px] text-red-700"><strong>Review:</strong> positive value, source, reference, method, reason, and audit metadata are required.</p>}
                     </div>,
                   });
                }))}

                <div className="border-b bg-violet-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">C. ENGINEERING APPROVAL REQUIRED</div>
                {(() => {
                  const legacy = legacyBvp.partitionBasis;
                  const approval = sim.partition_basis_approval_status ?? legacy?.approvalStatus ?? "";
                  const reference = sim.partition_basis_source_reference ?? legacy?.sourceReference ?? "";
                  const approvedBy = sim.partition_basis_approved_by ?? legacy?.approvedBy ?? "";
                  const approvedAt = sim.partition_basis_approved_at ?? legacy?.approvedAt ?? "";
                  const kdApproved = dependencyFor("partition_basis").ready;
                   return renderStage8DependencyRow({
                     id: "partition_basis",
                     ready: kdApproved,
                     parameter: "Kd basis approval",
                     value: "Calculated Kd = C*d / C*c",
                     unit: "—",
                     status: dependencyStatus(dependencyFor("partition_basis").sourceClass, kdApproved),
                     details: <div className="space-y-1 text-[11px]">
                       <select className="h-7 w-full rounded-md border bg-white px-1.5 text-[11px]" value={approval} disabled={isFrozen} onChange={e => f("partition_basis_approval_status", e.target.value)} onBlur={s}>
                         <option value="">Approval required…</option>
                         <option value="engineer_approved_governed">Engineer approved governed basis</option>
                       </select>
                       <Input className="h-7 text-[11px]" value={reference} disabled={isFrozen} placeholder="Approval / source reference" onChange={e => f("partition_basis_source_reference", e.target.value)} onBlur={s} />
                       <Input className="h-7 text-[11px]" value={approvedBy} disabled={isFrozen} placeholder="Approving engineer" onChange={e => f("partition_basis_approved_by", e.target.value)} onBlur={s} />
                       <Input type="datetime-local" className="h-7 text-[11px]" value={approvedAt} disabled={isFrozen} onChange={e => f("partition_basis_approved_at", e.target.value)} onBlur={s} />
                       <p className="mt-1 text-[10px] text-gray-600"><strong>Use:</strong> authorizes Koverall and the dispersed concentration driving force.</p>
                       {!kdApproved && <p className="text-[10px] text-red-700"><strong>Block:</strong> explicit governed concentration-basis approval, source reference, approver, and timestamp are required; numerical Kd is not entered.</p>}
                     </div>,
                   });
                })()}
                <div className="border-b bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">D. GOVERNANCE / EVIDENCE REQUIRED</div>
                 {renderStage8DependencyRow({
                   id: "preliminary_evidence",
                    ready: false,
                    parameter: "K&H 1996 d₃₂ source status",
                    value: "Transcription-invalid",
                   unit: "—",
                    status: <Badge className="border border-red-200 bg-red-50 text-red-700 text-[10px]">BLOCKED</Badge>,
                   details: <div className="text-[11px]">
                      <p><strong>Source:</strong> the legacy K&H 1996 reconstruction conflicts with independent secondary reproductions and cannot be numerically executed.</p>
                      <p className="mt-1 text-[10px] text-gray-600"><strong>Resolution:</strong> obtain authoritative definitions for H, the numerator symbol, and the complete coefficient mapping before introducing any calculated d₃₂ route.</p>
                      <p className="text-[10px] text-red-700">This blocks the published d₃₂ route. Use a complete, source-tagged engineer-supplied d₃₂ only for simulator development or sensitivity work.</p>
                   </div>,
                 })}
              </div>
            </div>
          </SectionCard>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="ecr2-stage8-readiness">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-800">Stage 8 readiness: {resolvedDependencies.length} / {stage8Dependencies.length} dependencies resolved</p>
              <Badge className={stage8Blocking
                ? "border border-red-200 bg-red-50 text-red-700 text-[10px]"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]"
              }>{stage8Blocking ? "RUN BLOCKED" : "READY TO RUN"}</Badge>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-label={`Stage 8 readiness ${resolvedDependencies.length} of ${stage8Dependencies.length}`}>
              <div className={`h-full rounded-full transition-all ${stage8Blocking ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.round((resolvedDependencies.length / stage8Dependencies.length) * 100)}%` }} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded border bg-white px-2 py-1.5">
                <p className="text-[10px] uppercase text-gray-500">Ready</p>
                <p className="text-sm font-semibold text-emerald-700">{resolvedDependencies.length}</p>
                <p className="text-[10px] text-gray-500">{autoResolvedCount} inherited/calculated</p>
              </div>
              <div className="rounded border bg-white px-2 py-1.5">
                <p className="text-[10px] uppercase text-gray-500">Missing system evidence</p>
                <p className="text-sm font-semibold text-amber-700">{missingEngineeringCount}</p>
                <p className="text-[10px] text-gray-500">root evidence gaps</p>
              </div>
              <div className="rounded border bg-white px-2 py-1.5">
                <p className="text-[10px] uppercase text-gray-500">Missing approvals</p>
                <p className="text-sm font-semibold text-violet-700">{missingApprovalCount}</p>
                <p className="text-[10px] text-gray-500">governed Kd basis</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-600" title="System evidence must resolve every Stage 8 numerical dependency before the preliminary ECR-2 counter-current simulation can run.">
              Diffusivities auto-resolved: {autoResolvedDiffusivityCount} / 10. Diffusivities unresolved: {10 - autoResolvedDiffusivityCount} / 10.
              {" "}Stage 8 numerical auto-populated: {autoPopulatedCount} / 14. Unresolved evidence remains visible as a root gap and cannot be bypassed by normal data entry.
            </p>
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" variant="outline" disabled={isFrozen || upsertMutation.isPending || ecr2RunPreparing} onClick={() => saveSection("ecr_simulator")}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Save simulator inputs
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" title="Refresh governed Stage 8 candidates from the current saved inputs without creating a simulation run." disabled={isFrozen || stage8ResolutionQ.isFetching || ecr2RunPreparing} onClick={resolveStage8Candidates}>
              <Calculator className="h-3.5 w-3.5" /> {stage8ResolutionQ.isFetching || ecr2RunPreparing ? "Resolving candidates…" : "Resolve Stage 8 candidates"}
            </Button>
            <Button size="sm" className="gap-1.5" title="Resolve all mandatory Stage 8 dependencies to run the preliminary ECR-2 counter-current simulation." disabled={isFrozen || calculateMutation.isPending || ecr2RunPreparing || stage8Blocking} onClick={runEcr2Simulation}>
              <Play className="h-3.5 w-3.5" /> {ecr2RunPreparing ? "Saving simulator inputs…" : c2InputsAreStale ? "Save inputs & refresh C2" : "RUN ECR-2 SIMULATION"}
            </Button>
          </div>
          {runReceipt && (
            <div
              className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"
              data-testid="ecr2-run-receipt"
            >
              <p className="font-semibold">ECR-2 simulation run created</p>
              <p className="mt-1">
                <span className="font-medium">Run #{runReceipt.id}</span>
                {" · "}
                {new Date(runReceipt.calculated_at).toLocaleString()}
                {" · "}
                {runReceipt.calculation_status}
              </p>
              <p className="mt-1 text-[11px] text-blue-800">
                This run is recorded in the calculation history, including when the simulator reports an error or the BVP is not accepted.
              </p>
            </div>
          )}
          {stage8Blocking && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <p className="font-semibold">
                Run blocked by {unresolvedDependencies.length} unresolved Stage 8 dependenc{unresolvedDependencies.length === 1 ? "y" : "ies"}.
              </p>
              <p className="mt-1 text-[11px]">
                Review the root evidence gap for each matching system-resolved row. No value is inferred, defaulted, or requested as normal project data entry.
              </p>
              <ol className="mt-3 space-y-2">
                {unresolvedDependencies.map((dependency, index) => (
                  <li key={dependency.id} className="rounded-md border border-red-200 bg-white px-2.5 py-2">
                    <p className="font-medium text-red-900">{index + 1}. {dependency.label}</p>
                    <p className="mt-0.5 text-[11px] text-red-800">
                      <span className="font-medium">Required:</span> {dependency.blockingReason}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      <span className="font-medium">Downstream use:</span> {dependency.downstreamUse}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {renderRunIssues(latestRun, "ECR-2 simulator", { useStructuredEcr2Dependencies: true })}
        </SectionCard>

        {(bvp || latestRun?.calculation_status === "error") && (
          <SectionCard title="ECR-2 — Simulation Snapshot">
            {d32SnapshotGovernance.transcriptionInvalid && (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 mb-4">
                <strong>{d32SnapshotGovernance.label}</strong>
                <p className="mt-1">The stored run snapshot has not been changed or recalculated; this display overlay prevents its legacy numerical result from being interpreted as an active design basis.</p>
              </div>
            )}
            {!bvp ? (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                The latest run was blocked before a complete simulator snapshot was produced. Expand the run issues above; each issue identifies the missing field and its dependency.
                {d32Snapshot && <p className="mt-2"><strong>d₃₂ safety status: {d32Snapshot.status ?? "not available"}</strong>{d32Snapshot.diagnostics?.[0] ? ` — ${d32Snapshot.diagnostics[0]}` : ""}</p>}
              </div>
            ) : (
              <>
                <div className={`p-3 rounded-lg border text-xs mb-4 ${staleResult || !resultOk ? "bg-red-50 border-red-200 text-red-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                  <strong>{showingFailedSnapshot ? "Latest simulation not accepted" : resultOk ? "Converged preliminary simulation — NOT release eligible" : "Simulation not accepted"}</strong>
                  <span className="ml-2">BVP: {bvp.status} · convergence: {bvp.convergenceStatus} · mass balance: {bvp.massBalanceStatus}</span>
                  {staleResult && <p className="mt-1">An earlier accepted snapshot exists but is stale. The safety result below is from the newest failed run and is the current record.</p>}
                  {!resultOk && bvp.failure && <p className="mt-1">Missing/failed dependency: <strong>{bvp.failure.dependency}</strong> — {bvp.failure.message}</p>}
                   {!resultOk && bvp.acceptanceChecks && (
                     <p className="mt-1">
                       Acceptance checks — normalized residual: {Number(bvp.acceptanceChecks.normalizedResidual?.value).toExponential(3)} / {Number(bvp.acceptanceChecks.normalizedResidual?.limit).toExponential(3)};
                       {" "}relative state change: {Number(bvp.acceptanceChecks.relativeStateChange?.value).toExponential(3)} / {Number(bvp.acceptanceChecks.relativeStateChange?.limit).toExponential(3)};
                       {" "}maximum component balance: {Number(bvp.acceptanceChecks.maximumComponentBalance_kg_h?.value).toExponential(3)} / {Number(bvp.acceptanceChecks.maximumComponentBalance_kg_h?.limit).toExponential(3)} kg/h;
                       {" "}total balance: {Number(bvp.acceptanceChecks.totalBalance_kg_h?.value).toExponential(3)} / {Number(bvp.acceptanceChecks.totalBalance_kg_h?.limit).toExponential(3)} kg/h;
                       {" "}termination: {String(bvp.acceptanceChecks.termination ?? "unknown").replace("_", " ")}.
                     </p>
                   )}
                </div>
                {transferStatus && (
                  <div className={`p-3 rounded-lg border text-xs mb-4 ${
                    transferStatus.status === "LOCAL_PRELIMINARY_CALCULATED"
                      ? "bg-amber-50 border-amber-200 text-amber-900"
                      : "bg-red-50 border-red-200 text-red-800"
                  }`}>
                    <strong>Transfer availability: {transferStatus.status}</strong>
                    <span className="ml-2">Governed values: {transferStatus.governedValues ?? "UNAVAILABLE"} · Release: {transferStatus.releaseStatus ?? "NOT_RELEASE_ELIGIBLE"}</span>
                    <p className="mt-1">{transferStatus.message}</p>
                  </div>
                )}
                {d32Snapshot && (
                  <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 mb-4">
                    <strong>Latest d₃₂ safety status: {d32Snapshot.status ?? "not available"}</strong>
                    <span className="ml-2">Basis: {d32Snapshot.engineeringBasis ?? "—"}</span>
                    {(d32Snapshot.diagnostics ?? []).length > 0 && <p className="mt-1">{d32Snapshot.diagnostics[0]}</p>}
                    {d32Snapshot.directTurbulence && <p className="mt-1">Frozen direct-turbulence sensitivity — ε: {fmt(d32Snapshot.directTurbulence.epsilon_m2_s3, 8)} m²/s³; C={d32Snapshot.directTurbulence.C_min}: {fmt(d32Snapshot.directTurbulence.d32_at_C_min_m * 1000, 4)} mm; nominal C={d32Snapshot.directTurbulence.C_nominal}: {fmt(d32Snapshot.directTurbulence.d32_at_C_nominal_m * 1000, 4)} mm; C={d32Snapshot.directTurbulence.C_max}: {fmt(d32Snapshot.directTurbulence.d32_at_C_max_m * 1000, 4)} mm.</p>}
                  </div>
                )}
                {showPreliminaryTransferPerformance ? (
                  <>
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">Headline engineering results — calculated preliminary</p>
                        <Badge className="border border-amber-300 bg-amber-100 text-amber-900 text-[10px]">{headlineResults?.releaseStatus ?? "NOT RELEASE ELIGIBLE"}</Badge>
                      </div>
                      <p className="mt-1 text-[11px]">{headlineResults?.basis ?? "Accepted BVP outlet values only."}</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ["RRBO feed", `${fmt(headlineResults?.rrboNmpFeed?.rrbo_kg_h, 3)} kg/h`],
                          ["NMP feed", `${fmt(headlineResults?.rrboNmpFeed?.nmp_kg_h, 3)} kg/h`],
                          ["S/O ratio", `${fmt(headlineResults?.rrboNmpFeed?.soRatio_mass, 4)} mass`],
                          ["Temperature", `${fmt(headlineResults?.selectedOperatingTemperature_C, 2)} °C`],
                          ["Raffinate flow", `${fmt(headlineResults?.raffinateFlow_kg_h, 3)} kg/h`],
                          ["RRBO to extract", `${fmt(headlineResults?.rrboTransferToExtract_kg_h, 3)} kg/h`],
                          ["RRBO recovery", `${fmt(headlineResults?.rrboRecovery_percent, 2)} %`],
                          ["Extract oil yield", `${fmt(headlineResults?.extractOilYield_percent, 2)} %`],
                          ["Saturates recovery", `${fmt(headlineResults?.saturatesRecovery_percent, 2)} %`],
                          ["Saturates loss", `${fmt(headlineResults?.saturatesLoss_kg_h, 3)} kg/h`],
                          ["Total aromatic removal", `${fmt(headlineResults?.totalAromaticRemoval_percent, 2)} %`],
                          ["Sulfur / DBT prediction", headlineResults?.sulfurDbtPrediction?.replaceAll("_", " ") ?? "NOT IMPLEMENTED"],
                        ].map(([label, value]) => <div key={label} className="rounded border border-amber-200 bg-white px-2.5 py-2"><p className="text-[10px] uppercase text-amber-800">{label}</p><p className="mt-0.5 font-semibold">{value}</p></div>)}
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        {[
                          ["Mono-aromatic removal", headlineResults?.monoAromaticRemoval_percent],
                          ["Di-aromatic removal", headlineResults?.diAromaticRemoval_percent],
                          ["Poly-aromatic removal", headlineResults?.polyAromaticRemoval_percent],
                        ].map(([label, value]) => <div key={String(label)} className="rounded border border-amber-200 bg-white px-2.5 py-2"><span className="text-[10px] uppercase text-amber-800">{label}</span><strong className="ml-2">{fmt(value, 2)} %</strong></div>)}
                      </div>
                      <p className="mt-3 text-[11px] text-amber-900"><strong>{headlineResults?.sulfurDbtPredictionNote ?? "SULFUR/DBT PREDICTION = NOT IMPLEMENTED. Aromatic-transfer results are not used as a sulfur or DBT surrogate."}</strong></p>
                    </div>
                    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        ["Numerical BVP compartments", simulationGeometry?.nCompartments],
                        ["Physical active height", `${fmt(simulationGeometry?.activeHeightActual_m, 4)} m`],
                        ["Column diameter", `${fmt(simulationGeometry?.columnDiameter_m, 4)} m`],
                        ["Rotor speed", `${fmt(simulationPower?.rotorSpeed_rpm, 2)} rpm`],
                        ["Dispersed holdup", fmt(bvp?.axialProfile?.[0]?.phi_d, 5)],
                        ["d32", `${fmt(bvp?.axialProfile?.[0]?.d32_m ? bvp.axialProfile[0].d32_m * 1000 : null, 4)} mm`],
                        ["Interfacial area", `${fmt(simulationArea?.a_m2_m3, 3)} m²/m³`],
                        ["Rotor type", simulationGeometry?.rotorType ?? "—"],
                      ].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-white p-2.5 text-xs"><p className="text-[10px] uppercase text-gray-500">{label}</p><p className="mt-0.5 font-semibold">{value}</p></div>)}
                    </div>
                    <div className="grid md:grid-cols-2 gap-3 mb-4">
                      {["raffinate", "extract"].map(name => {
                        const outlet = bvp.outlets?.[name];
                        const labels = ["Sat", "Mono", "Di", "Poly", "NMP"];
                        return <div key={name} className="border rounded-lg p-3">
                          <p className="font-semibold text-sm capitalize">{name}</p>
                          <p className="text-xs text-gray-500 mt-1">Total flow: {fmt(outlet?.totalFlow_kg_h, 3)} kg/h</p>
                          <table className="mt-2 w-full text-[11px]"><thead className="text-left text-gray-500"><tr><th>Component</th><th>Flow (kg/h)</th><th>Mass fraction</th></tr></thead><tbody>{labels.map((label, index) => <tr key={label} className="border-t"><td className="py-1">{label}</td><td>{fmt(outlet?.componentFlows_kg_h?.[index], 5)}</td><td>{fmt(outlet?.massFractions?.[index], 6)}</td></tr>)}</tbody></table>
                        </div>;
                      })}
                    </div>
                    {ecr2RaffinateProductQuality && (
                      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                        <p className="font-semibold">Raffinate product aromatics — hydrocarbon-only, NMP excluded</p>
                        <p className="mt-1">
                          x<sub>A,R</sub><sup>product</sup>: {((ecr2RaffinateProductQuality.x_A_R_product?.value ?? 0) * 100).toFixed(2)} mol %
                          {" · "}
                          w<sub>A,R</sub><sup>product</sup>: {((ecr2RaffinateProductQuality.w_A_R_product?.value ?? 0) * 100).toFixed(2)} wt %
                        </p>
                        <p className="mt-1 text-[11px] text-blue-800">
                          Derived only from the physical BVP raffinate outlet. Residual NMP is excluded from both product-quality denominators; this remains a preliminary, non-release-eligible simulator result.
                        </p>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-gray-700 mb-1">Component and global mass balance (accepted BVP)</p>
                    <div className="overflow-auto border rounded-lg mb-4"><table className="min-w-full text-[11px]"><thead className="bg-gray-50"><tr><th className="p-2 text-left">Component</th><th className="p-2 text-left">Feed (kg/h)</th><th className="p-2 text-left">Raffinate (kg/h)</th><th className="p-2 text-left">Extract (kg/h)</th><th className="p-2 text-left">Balance residual (kg/h)</th></tr></thead><tbody>{["Sat", "Mono", "Di", "Poly", "NMP"].map((label, index) => <tr key={label} className="border-t"><td className="p-2">{label}</td><td className="p-2">{fmt(massBalanceSummary?.feed_kg_h?.[index], 6)}</td><td className="p-2">{fmt(massBalanceSummary?.raffinate_kg_h?.[index], 6)}</td><td className="p-2">{fmt(massBalanceSummary?.extract_kg_h?.[index], 6)}</td><td className="p-2">{fmt(massBalanceSummary?.componentBalance_kg_h?.[index], 9)}</td></tr>)}<tr className="border-t bg-slate-50 font-semibold"><td className="p-2" colSpan={4}>Global mass-balance residual ({massBalanceSummary?.status ?? bvp.massBalanceStatus})</td><td className="p-2">{fmt(massBalanceSummary?.totalBalance_kg_h ?? bvp.totalMassBalance_kg_h, 9)}</td></tr></tbody></table></div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">Axial hydraulic profile (CALCULATED PRELIMINARY — NOT RELEASE ELIGIBLE)</p>
                    <div className="overflow-auto border rounded-lg mb-4"><table className="min-w-full text-[11px]"><thead className="bg-gray-50"><tr><th className="p-2 text-left">z (m)</th><th className="p-2 text-left">Raffinate flow</th><th className="p-2 text-left">Extract flow</th><th className="p-2 text-left">φd</th><th className="p-2 text-left">d32 (mm)</th><th className="p-2 text-left">Re_d</th></tr></thead><tbody>{profile.map((p: any, i: number) => <tr key={i} className="border-t"><td className="p-2">{fmt(p.z_m, 3)}</td><td className="p-2">{fmt(p.raffinateFlow_kg_h, 3)}</td><td className="p-2">{fmt(p.extractFlow_kg_h, 3)}</td><td className="p-2">{fmt(p.phi_d, 4)}</td><td className="p-2">{fmt(p.d32_m * 1000, 3)}</td><td className="p-2">{fmt(p.Re_d, 2)}</td></tr>)}</tbody></table></div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">Local mass-transfer profile by pseudo-component (CALCULATED PRELIMINARY — NOT RELEASE ELIGIBLE)</p>
                    <div className="overflow-auto border rounded-lg mb-4"><table className="min-w-[1100px] text-[11px]"><thead className="bg-gray-50"><tr><th className="p-2 text-left">z (m)</th><th className="p-2 text-left">Component</th><th className="p-2 text-left">Shc</th><th className="p-2 text-left">Shd</th><th className="p-2 text-left">kc (m/s)</th><th className="p-2 text-left">kd (m/s)</th><th className="p-2 text-left">Koverall (m/s)</th><th className="p-2 text-left">Koa (1/s)</th><th className="p-2 text-left">Driving force (kg/m³)</th><th className="p-2 text-left">Transfer rate (kg/m³/s)</th></tr></thead><tbody>{profile.flatMap((p: any, i: number) => ["Sat", "Mono", "Di", "Poly", "NMP"].map((component, index) => <tr key={`${i}-${component}`} className="border-t"><td className="p-2">{index === 0 ? fmt(p.z_m, 3) : ""}</td><td className="p-2">{component}</td><td className="p-2">{fmt(p.Sh_c?.[index], 4)}</td><td className="p-2">{fmt(p.Sh_d?.[index], 4)}</td><td className="p-2">{fmt(p.k_c_m_s?.[index], 8)}</td><td className="p-2">{fmt(p.k_d_m_s?.[index], 8)}</td><td className="p-2">{fmt(p.K_overall_m_s?.[index], 8)}</td><td className="p-2">{fmt(p.Koa_per_s?.[index], 8)}</td><td className="p-2">{fmt(p.drivingForce_kg_m3?.[index], 5)}</td><td className="p-2">{fmt(p.transferRate_kg_m3_s?.[index], 9)}</td></tr>))}</tbody></table></div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">Compartment engineering table (CALCULATED PRELIMINARY — NOT RELEASE ELIGIBLE)</p>
                    <div className="overflow-auto border rounded-lg"><table className="min-w-full text-[11px]"><thead className="bg-gray-50"><tr><th className="p-2 text-left">#</th><th className="p-2 text-left">z centre</th><th className="p-2 text-left">Active liquid volume</th><th className="p-2 text-left">Transfer warning(s)</th></tr></thead><tbody>{compartments.map((c: any) => <tr key={c.compartmentIndex} className="border-t"><td className="p-2">{c.compartmentIndex}</td><td className="p-2">{fmt(c.z_centre_m, 3)} m</td><td className="p-2">{fmt(c.activeLiquidVolume_m3, 5)} m³</td><td className="p-2">{(c.localWarnings ?? []).join("; ") || "—"}</td></tr>)}</tbody></table></div>
                  </>
                ) : (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    <strong>Transfer performance output unavailable.</strong> Any retained outlet, profile, or compartment arrays are unaccepted solver diagnostics and are not shown as calculated results.
                  </div>
                )}
                <div className="grid md:grid-cols-4 gap-3 mb-4">
                  <div className="border rounded-lg p-3 text-xs"><p className="text-gray-500">Iterations</p><p className="font-semibold text-base">{bvp.iterations}</p></div>
                  <div className="border rounded-lg p-3 text-xs"><p className="text-gray-500">Function evaluations</p><p className="font-semibold text-base">{bvp.functionEvaluations}</p></div>
                  <div className="border rounded-lg p-3 text-xs"><p className="text-gray-500">Final residual norm</p><p className="font-semibold text-base">{fmt(bvp.finalResidualNorm, 7)}</p></div>
                  <div className="border rounded-lg p-3 text-xs"><p className="text-gray-500">Total mass balance</p><p className="font-semibold text-base">{fmt(bvp.totalMassBalance_kg_h, 8)} kg/h</p></div>
                </div>
              </>
            )}
          </SectionCard>
        )}
      </div>
    );
  }

  // ── DS-SEL — Autonomous Design Selection (Engineering Decision Record) ──────
  function renderDesignSelectionCard() {
    const row = designSelectionQ.data;
    const rec = row?.record ?? null;
    const f4 = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(4) : "—");
    const f2 = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "—");
    const decided = row && row.decision !== "pending";
    const kv = (label: string, value: any, sub?: string) => (
      <div className="grid grid-cols-[220px_1fr] gap-2 py-1 border-b border-gray-50 last:border-0">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs">
          <span className="font-medium text-gray-800">{value}</span>
          {sub && <span className="block text-[10px] text-gray-400">{sub}</span>}
        </span>
      </div>
    );
    // Stale-record check: DS-SEL effective diameter vs. current hydraulic sweep minimum.
    // If effective < sweep minimum the record was generated from an older run.
    const hydResData2 = (resultsQ.data ?? []).find((r: any) => r.section === "hydraulics_common")?.data;
    const hydNormal2 = hydResData2?.normalCase ?? hydResData2?.cases?.normal;
    const minFeasibleD_m = numOrNull(String(hydNormal2?.summary?.minimumFeasibleDiameter_m ?? ""));
    const dselEffective_mm = rec?.effectiveDiameter_mm ?? rec?.selectedDiameter_mm ?? null;
    const dselRecTech = rec?.selectedTechnology ?? null;
    // Stale if: diameter below current sweep minimum, OR tech changed on Stage 6 since record was generated
    const dselDiameterStale = dselEffective_mm !== null && minFeasibleD_m !== null &&
      (dselEffective_mm / 1000) < minFeasibleD_m - 0.001;
    const dselTechStale = dselRecTech !== null &&
      techSelection !== "both" &&
      dselRecTech.toLowerCase() !== techSelection.toLowerCase();
    const dselStaleRecord = dselDiameterStale || dselTechStale;

    const submitDecision = () => {
      if (!row) return;
      const body: any = { action: dselDialog, engineer: dselEngineer, reason: dselReason };
      if (dselDialog === "override") {
        if (dselOverrideTech) body.overrideTechnology = dselOverrideTech;
        if (dselOverrideDia.trim() !== "") body.overrideDiameterMm = Number(dselOverrideDia);
      }
      dselDecisionMutation.mutate({ recordId: row.id, body });
    };
    return (
      <SectionCard title="Autonomous Design Selection — Engineering Decision Record (DS-SEL)">
        {/* Stale record warning — only for diameter staleness.
            Tech-mismatch records (e.g. a stored ECP record when design is ECR) are treated as
            absent: they cannot be used and will be automatically replaced on the next ECR run. */}
        {rec && dselDiameterStale && !dselTechStale && (
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-300 rounded-lg mb-3 -mt-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 leading-snug">
              <span className="font-semibold">This DS-SEL record is stale and its data is hidden below.</span>{" "}
              The effective design diameter recorded here ({dselEffective_mm} mm) is below the current hydraulic sweep minimum feasible diameter ({minFeasibleD_m !== null ? `${Math.round(minFeasibleD_m * 1000)} mm` : "—"}). It was generated from an earlier run with different inputs.
              <span className="block mt-1 font-medium">Run Calculate ECR in Stage 7 — DS-SEL regenerates automatically and this record will be replaced.</span>
            </p>
          </div>
        )}
        {(!rec || dselTechStale) ? (
          <p className="text-xs text-gray-500">
            No selection record yet — the software generates the Engineering Decision Record automatically after each accepted ECR calculation run (deterministic rules DS-SEL-001…005; no value is invented).
          </p>
        ) : dselDiameterStale ? null : (
          <>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant={rec.selectionStatus === "recommended" ? "default" : "destructive"}>
                {rec.selectionStatus === "recommended" ? "Recommended" : rec.selectionStatus === "engineering_review_required" ? "Engineering Review Required" : "Not Recommendable"}
              </Badge>
              <Badge variant="outline">{rec.confidenceLevel}</Badge>
              <Badge variant="outline">{row.decision === "pending" ? "Awaiting Engineer Decision" : `Decision: ${String(row.decision).replace(/_/g, " ")}`}</Badge>
            </div>
            {kv("Selected technology", rec.selectedTechnology ? String(rec.selectedTechnology).toUpperCase() : (rec.selectionStatus === "engineering_review_required" ? "None — multiple technically acceptable solutions identified; engineering review required" : "None"), rec.governanceState)}
            {kv("Autonomous diameter", (rec.autonomousDiameter_mm ?? rec.selectedDiameter_mm) != null ? `${rec.autonomousDiameter_mm ?? rec.selectedDiameter_mm} mm` : "—", "DS-SEL-003 — smallest practical 50 mm increment satisfying utilization ≤ limit; always retained for traceability")}
            {kv("User-selected diameter", rec.userSelectedDiameter_mm != null ? `${rec.userSelectedDiameter_mm} mm` : "— (none — autonomous selection governs)", rec.userSelection ? `Governed selection by ${rec.userSelection.engineer}${rec.userSelection.carriedForward ? " (carried forward across recalculation)" : ""} — ${rec.userSelection.reason}` : "DS-SEL-006 — governed 50 mm series, ≥ autonomous diameter; not an Engineer Override")}
            {kv("Effective design diameter", (rec.effectiveDiameter_mm ?? rec.selectedDiameter_mm) != null ? `${rec.effectiveDiameter_mm ?? rec.selectedDiameter_mm} mm` : "—", "Governs all downstream calculations and reports — user-selected diameter when entered and valid, otherwise the autonomous diameter")}
            {rec.selectionMode === "user_selected" && (
              kv("Loading / utilization at effective diameter", `${f2(rec.effectiveNormalLoading)} / ${f2(rec.effectiveMaximumLoading)} m³/(m²·h) · utilization ${f4(rec.effectiveFloodingUtilization)} · margin ${f4(rec.effectiveFloodingMarginFraction)}`, "Read verbatim from the frozen sweep at the effective design diameter")
            )}
            {rec.userSelectionDropped && (
              <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">{rec.userSelectionDropped}</div>
            )}
            {kv("Calculated minimum diameter", rec.calculatedMinimumDiameter_mm != null ? `${rec.calculatedMinimumDiameter_mm} mm` : "—", "DS-SEL-001 — D_min = √(4·Q_max/(π·u_allow·C_basis))")}
            {kv("Practical rounding rule", "Round UP to next 50 mm increment — never down", "DS-SEL-002")}
            {kv("Normal / Maximum loading", `${f2(rec.normalLoading)} / ${f2(rec.maximumLoading)} m³/(m²·h)`, "Read verbatim from the frozen sweep at the selected diameter")}
            {kv(rec.terminology?.utilizationLabel ?? "Utilization against preliminary capacity-screening basis", f4(rec.floodingUtilization), rec.capacityBasis ? `Basis: ${rec.capacityBasis.value} ${rec.capacityBasis.unit} — ${rec.capacityBasis.tier}${rec.capacityBasis.assumed ? " (Assumed — Pending Hydraulic and Pressure-Drop Validation)" : ""}` : undefined)}
            {kv(rec.terminology?.marginLabel ?? "Preliminary hydraulic loading margin", `${f4(rec.floodingMarginFraction)} (${f2(rec.floodingMarginAbsolute)} m³/(m²·h) absolute)`, "DS-SEL-005 step 2 — direct comparison of calculated margins, no tie band")}
            {(rec.terminology ? !!rec.terminology.trueFloodingStatement : true) && kv("True flooding utilization / margin", "Not Calculable", rec.terminology?.trueFloodingStatement ?? "Not Calculable until approved vendor, pilot or RRBO/NMP experimental flooding data are entered.")}
            {kv("Reason for recommendation", rec.reason ?? "—")}
            {(rec.governingAssumptions ?? []).length > 0 && kv("Governing assumptions", (
              <span>{(rec.governingAssumptions ?? []).map((a: any, i: number) => <span key={i} className="block">{a.item}: {a.value} — <span className="text-gray-400">{a.source}</span></span>)}</span>
            ))}
            {(rec.technologies ?? []).filter((t: any) => !t.recommendable).map((t: any) => (
              <div key={t.technology} className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
                {t.notAssessable ? t.notRecommendableReason : `${t.technology.toUpperCase()} not feasible — ${t.notRecommendableReason}`}
              </div>
            ))}
            {row.decision === "overridden" && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-800">
                Engineer Override by {row.decision_engineer} — {row.decision_reason}. Autonomous values retained above; override: {row.override_technology ? row.override_technology.toUpperCase() : (rec.selectedTechnology ?? "—").toUpperCase?.()} @ {row.override_diameter_mm ?? rec.selectedDiameter_mm ?? "—"} mm.
                {row.override_impact?.warning && <span className="block mt-1">{row.override_impact.warning}</span>}
                {row.override_impact?.floodingUtilization != null && <span className="block mt-1">Impact (frozen table): utilization {f4(row.override_impact.floodingUtilization)}, margin {f4(row.override_impact.floodingMarginFraction)}, feasible per autonomous criteria: {String(row.override_impact.feasiblePerAutonomousCriteria)}</span>}
              </div>
            )}
            {decided && row.decision !== "overridden" && (
              <p className="text-[11px] text-gray-500 mt-2">Decision recorded by {row.decision_engineer} on {row.decision_at ? new Date(row.decision_at).toLocaleString() : "—"}{row.decision_reason ? ` — ${row.decision_reason}` : ""}</p>
            )}
            {/* ── DS-SEL-006 — Governing Diameter Selection ─────────────────── */}
            {!isFrozen && rec.selectedDiameter_mm != null && (
              <div className={`mt-3 p-3 border rounded-lg space-y-2 ${dselStaleRecord ? "bg-amber-50 border-amber-200 opacity-75" : "bg-slate-50"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-gray-700">
                    Governing Diameter Selection (DS-SEL-006)
                    {dselStaleRecord && <span className="ml-2 text-[10px] font-normal text-amber-700 italic">— record stale, re-run to update</span>}
                  </p>
                  {!udOpen && !dselStaleRecord && (
                    <Button size="sm" variant="outline" onClick={() => { setUdOpen(true); setUdDia(String(rec.effectiveDiameter_mm ?? rec.selectedDiameter_mm)); }}>Select governing diameter…</Button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">
                  Minimum permitted:{" "}
                  <strong className={dselStaleRecord ? "text-amber-700" : ""}>{rec.autonomousDiameter_mm ?? rec.selectedDiameter_mm} mm</strong>
                  {dselStaleRecord
                    ? <span className="text-amber-700 ml-1">(from previous run — parameters have changed; re-run ECR to recalculate)</span>
                    : <span> (autonomous calculated minimum — DS-SEL-003). A smaller diameter would exceed the allowable utilization limit against the declared capacity basis and is blocked server-side. Only the governed 50 mm increment series is allowed. This is a governed selection of a larger, more conservative diameter — not an Engineer Override of an unsafe design.</span>
                  }
                </p>
                {udOpen && (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input placeholder={`Diameter (mm, 50 mm series, ≥ ${rec.autonomousDiameter_mm ?? rec.selectedDiameter_mm})`} value={udDia} onChange={e => setUdDia(e.target.value)} className="h-8 text-xs w-64" />
                      <span className="text-[10px] text-gray-400">mm</span>
                    </div>
                    <Input placeholder="Engineer name (mandatory)" value={udEngineer} onChange={e => setUdEngineer(e.target.value)} className="h-8 text-xs" />
                    <Textarea placeholder="Reason for selecting a larger diameter (mandatory)" value={udReason} onChange={e => setUdReason(e.target.value)} className="text-xs" rows={2} />
                    <p className="text-[10px] text-gray-400">
                      On confirmation the software automatically re-runs Common Hydraulics and ECR and the mechanical calculation with the effective diameter, supersedes this record (decision resets to Pending — the new effective design must be reviewed again) and reconciles all affected reports. Draft reports regenerate; For Review / Released reports are marked stale and regenerated as new records; approval is blocked while any report remains stale.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={userDiameterMutation.isPending} onClick={() => userDiameterMutation.mutate({ diameterMm: Number(udDia), engineer: udEngineer, reason: udReason })}>
                        {userDiameterMutation.isPending ? "Recalculating…" : "Confirm & Recalculate"}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={userDiameterMutation.isPending} onClick={() => setUdOpen(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {!isFrozen && !decided && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={() => setDselDialog("approve")}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => setDselDialog("request_verification")}>Request Verification</Button>
                <Button size="sm" variant="outline" onClick={() => setDselDialog("override")}>Override</Button>
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-2">
              The software acts as the Process Design Engineer: technology and diameter are determined autonomously by deterministic rules (DS-SEL-001…005) from the frozen calculation runs — CAPEX/OPEX excluded; confidence level is data maturity only and never a tie-breaker. Records are superseded, never edited; every re-run generates a fresh record.
            </p>
            {dselDialog && (
              <div className="mt-3 p-3 border rounded-lg bg-gray-50 space-y-2">
                <p className="text-xs font-medium text-gray-700">
                  {dselDialog === "approve" ? "Approve the autonomous recommendation" : dselDialog === "request_verification" ? "Request independent verification" : "Override the autonomous recommendation (mandatory engineering justification; the autonomous values are retained)"}
                </p>
                <Input placeholder="Engineer name (mandatory)" value={dselEngineer} onChange={e => setDselEngineer(e.target.value)} className="h-8 text-xs" />
                <Textarea placeholder={dselDialog === "override" ? "Engineering justification (mandatory)" : "Comments (optional)"} value={dselReason} onChange={e => setDselReason(e.target.value)} className="text-xs" rows={2} />
                {dselDialog === "override" && (
                  <div className="flex gap-2">
                    <select value={dselOverrideTech} onChange={e => setDselOverrideTech(e.target.value)} className="h-8 text-xs border rounded px-2">
                      <option value="">Keep technology</option>
                      <option value="ecr">ECR — Kühni Agitated Column</option>
                    </select>
                    <Input placeholder="Override diameter (mm)" value={dselOverrideDia} onChange={e => setDselOverrideDia(e.target.value)} className="h-8 text-xs w-44" />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" disabled={dselDecisionMutation.isPending} onClick={submitDecision}>Confirm</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDselDialog(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>
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
            value={ec.backmixing_risk ?? ""}
            onChange={e => commitSection("ecp_design", { backmixing_risk: e.target.value })}
            disabled={isFrozen}
            className="h-8 text-sm border rounded-md px-2 bg-white"
          >
            <option value="">— Not Assessed —</option>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
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

  function renderRunIssues(
    latestRun: any,
    label: string,
    options?: { useStructuredEcr2Dependencies?: boolean },
  ) {
    if (!latestRun) return null;
    const issues = Array.isArray(latestRun.validation_issues) ? latestRun.validation_issues : [];
    const warns = Array.isArray(latestRun.warnings) ? latestRun.warnings : [];
    const legacyEcr2Issues = options?.useStructuredEcr2Dependencies
      ? issues.filter((issue: any) => issue.field === "molecularWeights" || issue.field === "bvp")
      : [];
    const displayedIssues = options?.useStructuredEcr2Dependencies
      ? issues.filter((issue: any) => issue.field !== "molecularWeights" && issue.field !== "bvp")
      : issues;
    const resultSnapshot = typeof latestRun.result_snapshot === "string"
      ? (() => {
        try { return JSON.parse(latestRun.result_snapshot); } catch { return null; }
      })()
      : latestRun.result_snapshot;
    const downstreamFailure = options?.useStructuredEcr2Dependencies
      ? resultSnapshot?.bvp?.failure
      : null;
    const showsDownstreamFailure = displayedIssues.length === 0
      && typeof downstreamFailure?.dependency === "string"
      && typeof downstreamFailure?.message === "string";
    return (
      <div className="mt-2 space-y-2">
        <p className="text-[11px] text-gray-500">
          Last run: #{latestRun.id} · {new Date(latestRun.calculated_at).toLocaleString()} · {latestRun.engine_name} v{latestRun.engine_version} · {latestRun.calculation_status}
        </p>
        {latestRun.calculation_status === "error" && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-semibold text-red-800 mb-1">
              {showsDownstreamFailure
                ? `${label} run blocked by downstream BVP dependency '${downstreamFailure.dependency}': ${downstreamFailure.message}`
                : `${label} run blocked — the engine reported ${issues.length} missing/invalid mandatory input${issues.length === 1 ? "" : "s"}.`
              } No results were generated; nothing is defaulted silently.
            </p>
            {legacyEcr2Issues.length > 0 && (
              <p className="mb-1 text-[11px] text-red-700">
                This persisted run contains the pre-structured-register generic contract diagnostics. The live Stage 8 dependency register above is the authoritative per-dependency explanation and does not default missing engineering data.
              </p>
            )}
            <ul className="space-y-0.5">
              {showsDownstreamFailure && (
                <li className="text-[11px] text-red-700"><span className="font-medium">{downstreamFailure.dependency}:</span> {downstreamFailure.message}</li>
              )}
              {displayedIssues.map((v: any, i: number) => (
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
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-2">
            <p className="text-sm font-semibold text-amber-900 mb-1">HETS — Not Calculable: Governing Mass-Transfer Model Required</p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              No application-level mass-transfer / HTU-NTU model is currently implemented for the NMP–RRBO system.
              HETS cannot be predicted by the engine. A governing mass-transfer model is required before HETS becomes a calculated output.
            </p>
            <p className="text-[11px] text-amber-700 mt-1 font-medium">
              Vendor / pilot / test HETS is accepted as a governed override only — with explicit source type and audit reference.
            </p>
          </div>
          <FieldRow label="HETS Override (vendor / pilot / test)" value={ec.hets ?? ""} onChange={v => f("hets", v)} onBlur={s} unit="m" note="Governed override only. Source type and reference below are mandatory — no silent defaults." />
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5">
            <label className="text-sm text-gray-700 font-medium pt-1.5">HETS Source Type</label>
            <select
              value={ec.hets_source ?? ""}
              onChange={e => commitSection("ecp_design", { hets_source: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="">— select source type —</option>
              <option value="Vendor">Vendor</option>
              <option value="Measured">Measured</option>
              <option value="Literature">Literature</option>
              <option value="Assumed">Assumed</option>
            </select>
            <span />
          </div>
          <FieldRow label="HETS Source Reference" value={ec.hets_source_reference ?? ""} onChange={v => f("hets_source_reference", v)} onBlur={s} unit="" placeholder="e.g. Vendor test report ref. / pilot campaign date / literature citation" />
          {statusLine(`Status: ${ec.hets ? `Override entered · Source: ${ec.hets_source || "Not selected — required"} · ${ec.hets_source_reference ? "Reference provided" : "Reference missing — required"}` : "No override — HETS not calculable until mass-transfer model is implemented"}`)}
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
    // Preliminary ECR results are commonly accepted with a "warning" status
    // because their assumptions remain pending validation. A warning is still
    // an accepted engineering snapshot; only error runs must be excluded from
    // the hydraulic diameter display basis.
    const ecrRun = runs
      .filter(r => r.calculation_type === "ecr" && ["success", "warning"].includes(r.calculation_status))
      .sort((a, b) => new Date(b.calculated_at).getTime() - new Date(a.calculated_at).getTime())[0];
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

    // ── ECR Hydraulic Diameter Basis — computed for display panel ────────────────
    // D_ECR = sqrt(4·Q_T / (π·C_ECR·F_D·U_max)) — ECR-specific basis only.
    // C3 Godfrey slip model and Rauber 2006 packed-column throughput do NOT participate.
    // The immutable accepted run is the audit source. The accepted-result record
    // contains the same C5 output and provides a resilient display fallback while
    // run-history refetches after Calculate ECR.
    const maximumCaseFlows = ecrRun?.result_snapshot?.maximumCase?.flows ?? ecrData?.maximumCase?.flows;
    const qT_maxECR: number | null = (() => {
      const flows = maximumCaseFlows;
      const qR = parseFloat(String(flows?.rrboVolumetricFlow_m3_h ?? ""));
      const qN = parseFloat(String(flows?.nmpVolumetricFlow_m3_h ?? ""));
      return isFinite(qR) && isFinite(qN) ? qR + qN : null;
    })();
    const cECR_v: number | null = (() => {
      const v = parseFloat(String(er.ecr_preliminary_hydraulic_capacity ?? ""));
      return isFinite(v) && v > 0 ? v : null;
    })();
    const fD_v: number | null = (() => {
      const v = parseFloat(String(er.system_derating_factor ?? ""));
      return isFinite(v) && v > 0 ? v : null;
    })();
    const uMaxECR = 0.80; // DS-SEL governed maximum screening utilization (configurable)
    const dCalcECR_m: number | null = (qT_maxECR !== null && cECR_v !== null && fD_v !== null)
      ? Math.sqrt((4 * qT_maxECR) / (Math.PI * cECR_v * fD_v * uMaxECR))
      : null;
    // DS-SEL ECR-specific evaluation block (carries selected standard diameter + utilization)
    const dselECREval: any = designSelectionQ.data?.record?.technologies?.find((t: any) => t.technology === "ecr") ?? null;

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
          <FieldRow label="Power Number (N_P)" value={er.power_number ?? ""} onChange={v => f("power_number", v)} onBlur={s} unit="—" note="Thermopac Preliminary Screening Assumption — Pending Validation. Replace with vendor/literature datum when available." />
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-2">
            <p className="text-sm font-semibold text-amber-900 mb-1">ECR Compartment Height &amp; Efficiency — Governing Vendor / Pilot Data Required</p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Compartment height h<sub>comp</sub> and efficiency E<sub>M</sub> are vendor / pilot / literature inputs. No application-specific correlation exists for Kühni/Sulzer-type columns on the NMP–RRBO system.
            </p>
            <p className="text-[11px] text-amber-700 mt-1 font-medium">
              Nominal preliminary basis: E<sub>M</sub> / h<sub>comp</sub> = 0.50 / 0.25 = <strong>2.0 theoretical stages/m (nominal)</strong>.
              Because compartment count uses ceil(), the actual S<sub>effective</sub> = N<sub>T</sub> / H<sub>active</sub> will in general differ from 2.0 stages/m.
              The calculated effective value in the results panel below is authoritative for reporting.
              This is a Thermopac Preliminary ECR Screening Basis — Pending Vendor/Pilot Validation. It is not attributed individually to Sulzer.
              Replace with vendor datasheet, pilot campaign, or literature data before any design decision.
              Value, source type, and source reference are all mandatory.
            </p>
          </div>
          <FieldRow label="ECR Compartment Height (vendor / pilot / literature)" value={er.compartment_height ?? ""} onChange={v => f("compartment_height", v)} onBlur={s} unit="m" note="Governed input — source type and reference below are mandatory." />
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Compartment Height Source Type</label>
            <select
              value={er.compartment_height_source ?? ""}
              onChange={e => commitSection("ecr_design", { compartment_height_source: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="">— select source type —</option>
              <option value="Vendor">Vendor</option>
              <option value="Measured">Measured</option>
              <option value="Literature">Literature</option>
              <option value="Assumed">Assumed</option>
            </select>
            <span />
          </div>
          <FieldRow label="Compartment Height Source Reference" value={er.compartment_height_source_reference ?? ""} onChange={v => f("compartment_height_source_reference", v)} onBlur={s} unit="" placeholder="e.g. Vendor datasheet / pilot campaign / Míšek 1994 Table 2" />
          {statusLine(`Status: ${er.compartment_height
            ? `${er.compartment_height} m · Source: ${er.compartment_height_source || "Not selected — required"} · ${er.compartment_height_source_reference ? "Reference provided" : "Reference missing — required"}${er.compartment_height_source === "Assumed" ? " · Preliminary ECR Screening — Pending Vendor/Pilot Validation" : ""}`
            : "No value — ECR height not calculable"
          }`)}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-2">
            <p className="text-sm font-semibold text-amber-900 mb-1">Compartment Efficiency — Governing Efficiency Model Required</p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              No application-level compartment mass-transfer efficiency model is currently implemented for the NMP–RRBO system.
              E<sub>M</sub> cannot be predicted by the engine. The preliminary default of <strong>50 % (0.50)</strong> targets 2.0 theoretical stages/m with h<sub>comp</sub> = 0.25 m — this is a Thermopac screening placeholder only, not a Sulzer published value.
            </p>
            <p className="text-[11px] text-amber-700 mt-1 font-medium">
              Vendor / pilot / literature efficiency accepted as a governed override only — value, source type, and audit reference are all mandatory.
            </p>
          </div>
          <FieldRow label="Compartment Efficiency Override (vendor / pilot / literature)" value={er.compartment_efficiency ?? ""} onChange={v => f("compartment_efficiency", v)} onBlur={s} unit="%" note="Governed override only — no free engineer entry. All three fields below are mandatory." />
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Compartment Efficiency Source Type</label>
            <select
              value={er.compartment_efficiency_source ?? ""}
              onChange={e => commitSection("ecr_design", { compartment_efficiency_source: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="">— select source type —</option>
              <option value="Vendor">Vendor</option>
              <option value="Measured">Measured</option>
              <option value="Literature">Literature</option>
              <option value="Assumed">Assumed</option>
            </select>
            <span />
          </div>
          <FieldRow label="Compartment Efficiency Source Reference" value={er.compartment_efficiency_source_reference ?? ""} onChange={v => f("compartment_efficiency_source_reference", v)} onBlur={s} unit="" placeholder="e.g. Vendor test report ref. / pilot campaign / Míšek 1994 Table 3" />
          {statusLine(`Status: ${er.compartment_efficiency
            ? `Override entered: ${er.compartment_efficiency} % · Source: ${er.compartment_efficiency_source || "Not selected — required"} · ${er.compartment_efficiency_source_reference ? "Reference provided" : "Reference missing — required"}`
            : "No override — Not Calculable until efficiency model is implemented or governed override provided"
          }`)}
          <FieldRow label="Shaft Efficiency" value={er.shaft_efficiency ?? ""} onChange={v => f("shaft_efficiency", v)} onBlur={s} unit="%" />
          <FieldRow label="Mechanical Design Margin" value={er.mechanical_design_margin ?? ""} onChange={v => f("mechanical_design_margin", v)} onBlur={s} unit="—" placeholder="e.g. 1.2" />
          <FieldRow label="Rotors per Compartment" value={er.rotors_per_compartment ?? ""} onChange={v => f("rotors_per_compartment", v)} onBlur={s} unit="—" placeholder="1" />
          <FieldRow label="Stator Open Area Fraction" value={er.stator_open_area_fraction ?? ""} onChange={v => f("stator_open_area_fraction", v)} onBlur={s} unit="—" note="Fraction of column cross-section open through stator rings. Default 0.40 — Thermopac Preliminary ECR Geometry Assumption (Kühni AG; Widmer 1973; Godfrey & Slater 1994 — midpoint of 0.35–0.45 published range). Replace with vendor geometry when available." />
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-2 mt-2">
            <p className="text-sm font-semibold text-amber-900 mb-1">Interfacial Tension — ECR Weber Number</p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              σ is used only for the ECR rotor Weber number (We = ρ<sub>c</sub>·N²·D<sub>R</sub>³/σ — a dimensionless agitation criterion; no droplet-size prediction is made from it).
              Default 10 mN/m is the <strong>Thermopac Preliminary RRBO/NMP Interfacial-Tension Assumption</strong> —
              midpoint of the 5–15 mN/m published range for polar-solvent/paraffinic-hydrocarbon systems
              (Hampe 1986; Seibert &amp; Fair 1988). <strong>Not measured RRBO/NMP data.</strong> Replace with a measured or literature value when available.
              If the Stage 5 Common Hydraulics workspace already carries an IFT entry, that value takes precedence over this field.
            </p>
          </div>
          <FieldRow label="Interfacial Tension (ECR Weber No.)" value={er.ecr_interfacial_tension ?? ""} onChange={v => f("ecr_interfacial_tension", v)} onBlur={s} unit="mN/m" note="Thermopac Preliminary RRBO/NMP Interfacial-Tension Assumption — Pending Validation. Used for Weber number only." />
          <FieldRow label="IFT Reference Temperature" value={er.ecr_interfacial_tension_ref_temp ?? ""} onChange={v => f("ecr_interfacial_tension_ref_temp", v)} onBlur={s} unit="°C" placeholder="e.g. 60" />
          {statusLine(`Interfacial tension: ${er.ecr_interfacial_tension ? `${er.ecr_interfacial_tension} mN/m @ ${er.ecr_interfacial_tension_ref_temp ?? "?"}°C · Thermopac Preliminary — Pending Validation` : "No value — Weber number Not Calculable"}`)}
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5 mt-1">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Agitator Power Density Basis</label>
            <select
              value={er.power_density_basis ?? "continuous_phase"}
              onChange={e => commitSection("ecr_design", { power_density_basis: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="continuous_phase">Continuous Phase Density — preliminary default</option>
              <option value="volume_averaged">Volume-Averaged Mixture Density</option>
            </select>
            <span />
          </div>
          {statusLine("Power density basis for P₁ = N_P·ρ_m·N³·D_R⁵. 'Continuous phase' is the Thermopac preliminary default — recorded explicitly with every calculation.")}
          <FieldRow label="Max Allowable Tip Speed (vendor)" value={er.max_tip_speed ?? ""} onChange={v => f("max_tip_speed", v)} onBlur={s} unit="m/s" />
          <FieldRow label="Max Allowable Shaft Power (vendor)" value={er.max_shaft_power ?? ""} onChange={v => f("max_shaft_power", v)} onBlur={s} unit="kW" />
          <FieldRow label="Max Unsupported Shaft Length (vendor)" value={er.max_unsupported_shaft_length ?? ""} onChange={v => f("max_unsupported_shaft_length", v)} onBlur={s} unit="m" />
          {statusLine("Engineer/vendor-entered inputs — mapped source-tagged to the C5 ECR engine, pending validation. Vendor limits are optional; missing limits are reported by the engine, never assumed.")}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-2 mt-3">
            <p className="text-sm font-semibold text-amber-900 mb-1">Preliminary ECR Hydraulic Capacity — Thermopac Preliminary ECR Screening Basis</p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              The ECR hydraulic utilization U = (Q<sub>total</sub>/A) / (C<sub>ECR</sub> × F<sub>derate</sub>) × 100 requires an ECR-specific hydraulic capacity C<sub>ECR</sub>.
              Default <strong>20 m³/(m²·h)</strong> is the <strong>Thermopac Preliminary ECR Hydraulic Capacity Assumption</strong> —
              conservative midpoint of the published Kühni-type agitated-column flooding range 15–30 m³/(m²·h)
              for low-viscosity hydrocarbon/solvent systems (Míšek 1985; Pratt &amp; Stevens 1992).
            </p>
            <p className="text-[11px] text-amber-700 mt-1 font-medium">
              <strong>Not a Sulzer guarantee.</strong> <strong>Not validated RRBO/NMP flooding data.</strong>
              Any ECR diameter selected from this basis is a <strong>Preliminary ECR Diameter — based on assumed hydraulic capacity.</strong>
              Replace with vendor-quoted flooding capacity when obtained. Source type and reference are mandatory.
            </p>
          </div>
          <FieldRow label="Preliminary ECR Hydraulic Capacity" value={er.ecr_preliminary_hydraulic_capacity ?? ""} onChange={v => f("ecr_preliminary_hydraulic_capacity", v)} onBlur={s} unit="m³/(m²·h)" note="Thermopac Preliminary ECR Hydraulic Capacity Assumption — Pending Validation. Replace with vendor-quoted flooding capacity when obtained." />
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5">
            <label className="text-sm text-gray-700 font-medium pt-1.5">ECR Capacity Source Type</label>
            <select
              value={er.ecr_preliminary_hydraulic_capacity_source ?? ""}
              onChange={e => commitSection("ecr_design", { ecr_preliminary_hydraulic_capacity_source: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="">— select source type —</option>
              <option value="Vendor">Vendor</option>
              <option value="Measured">Measured</option>
              <option value="Literature">Literature</option>
              <option value="Assumed">Assumed</option>
            </select>
            <span />
          </div>
          <FieldRow label="ECR Capacity Source Reference" value={er.ecr_preliminary_hydraulic_capacity_source_reference ?? ""} onChange={v => f("ecr_preliminary_hydraulic_capacity_source_reference", v)} onBlur={s} unit="" placeholder="e.g. Vendor flooding test / Míšek 1985 / Thermopac Preliminary ECR Hydraulic Capacity Assumption" />
          {statusLine(`ECR Capacity: ${er.ecr_preliminary_hydraulic_capacity
            ? `${er.ecr_preliminary_hydraulic_capacity} m³/(m²·h) · Source: ${er.ecr_preliminary_hydraulic_capacity_source || "Not selected — required"} · ${er.ecr_preliminary_hydraulic_capacity_source_reference ? "Reference provided" : "Reference missing — required"}${er.ecr_preliminary_hydraulic_capacity_source === "Assumed" ? " · Preliminary ECR Screening — Pending Vendor/Pilot Validation" : er.ecr_preliminary_hydraulic_capacity_source === "Vendor" ? " · Vendor basis — will advance confidence beyond Preliminary Screening" : ""}`
            : "No value — ECR hydraulic utilization Not Calculable"
          }`)}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-2 mt-3">
            <p className="text-sm font-semibold text-amber-900 mb-1">System Derating Factor — Vendor Hydraulic Capacity Correction</p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Applies when the vendor hydraulic capacity curve was determined under conditions different from the project system (e.g. different fluid pair, temperature, test scale, or packing generation).
              A factor of 1.0 means no correction — the vendor capacity value is used as-is.
            </p>
            <p className="text-[11px] text-amber-700 mt-1 font-medium">
              Utilisation formula: U = load<sub>tot</sub> / (capacity<sub>vendor</sub> × derating) × 100 %.
              Default 1.0 (Assumed) is the Thermopac Preliminary ECR Screening Basis — Pending Vendor/Pilot Validation.
              Replace with a vendor/pilot-derived correction when available. Value, source type, and source reference are all mandatory.
            </p>
          </div>
          <FieldRow label="System Derating Factor" value={er.system_derating_factor ?? ""} onChange={v => f("system_derating_factor", v)} onBlur={s} unit="—" note="0.1–1.0. Used only in ECR hydraulic utilization — does not affect height, rotor power, or stage calculations." />
          <div className="grid grid-cols-[200px_1fr_auto] items-start gap-x-3 gap-y-0.5">
            <label className="text-sm text-gray-700 font-medium pt-1.5">Derating Factor Source Type</label>
            <select
              value={er.system_derating_factor_source ?? ""}
              onChange={e => commitSection("ecr_design", { system_derating_factor_source: e.target.value })}
              disabled={isFrozen}
              className="h-8 text-sm border rounded-md px-2 bg-white"
            >
              <option value="">— select source type —</option>
              <option value="Vendor">Vendor</option>
              <option value="Measured">Measured</option>
              <option value="Literature">Literature</option>
              <option value="Assumed">Assumed</option>
            </select>
            <span />
          </div>
          <FieldRow label="Derating Factor Source Reference" value={er.system_derating_factor_source_reference ?? ""} onChange={v => f("system_derating_factor_source_reference", v)} onBlur={s} unit="" placeholder="e.g. Vendor qualification test / pilot campaign / Thermopac Preliminary ECR Screening Basis" />
          {statusLine(`Derating: ${er.system_derating_factor
            ? `${er.system_derating_factor} · Source: ${er.system_derating_factor_source || "Not selected — required"} · ${er.system_derating_factor_source_reference ? "Reference provided" : "Reference missing — required"}${er.system_derating_factor_source === "Assumed" ? " · Preliminary ECR Screening — Pending Vendor/Pilot Validation" : ""}`
            : "No value — engine will block (required governed input)"
          }`)}
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

        {/* ── ECR Hydraulic Diameter Basis — independent of C3/Rauber/ECP ── */}
        <SectionCard title="ECR Hydraulic Diameter Basis">
          <div className="mb-2 p-2.5 rounded-lg border border-sky-100 bg-sky-50">
            <p className="text-[11px] text-sky-800 leading-relaxed">
              D<sub>ECR</sub> = √(4·Q<sub>T</sub> / (π·C<sub>ECR</sub>·F<sub>D</sub>·U<sub>max</sub>)) — ECR-specific hydraulic capacity basis only.
              C3 Godfrey slip model and Rauber 2006 packed-column throughput do <strong>not</strong> govern ECR diameter and
              are not inputs to this calculation.
            </p>
          </div>
          {[
            {
              label: "Total Liquid Throughput Q\u1D40 (max case)",
              value: qT_maxECR !== null ? `${qT_maxECR.toFixed(2)} m³/h  (Q\u1D40 = Q\u1D2E\u1D3A\u1D35\u1D2C + Q\u1D4C\u1D39\u1D3C)` : (ecrRun || ecrData) ? "Flows not found in accepted ECR result — re-run Calculate ECR" : "No accepted ECR result — enter inputs and calculate",
              alert: qT_maxECR === null,
            },
            {
              label: "ECR Hydraulic Capacity C\u1D3C\u1D3C\u1D3A (assumed)",
              value: cECR_v !== null ? `${cECR_v} m³/(m²·h) · ${er.ecr_preliminary_hydraulic_capacity_source || "source not selected"} · ${er.ecr_preliminary_hydraulic_capacity_source_reference || "no reference"}` : "Not entered — required for diameter calculation",
              alert: cECR_v === null,
            },
            {
              label: "System Derating Factor F\u1D30",
              value: fD_v !== null ? `${fD_v} · ${er.system_derating_factor_source || "source not selected"} · ${er.system_derating_factor_source_reference || "no reference"}` : "Not entered — required for diameter calculation",
              alert: fD_v === null,
            },
            {
              label: "Effective Capacity C\u1D3C\u1D3C\u1D3A × F\u1D30",
              value: (cECR_v !== null && fD_v !== null) ? `${(cECR_v * fD_v).toFixed(2)} m³/(m²·h)` : "—",
              alert: false,
            },
            {
              label: "Max Design Utilization U\u2098\u2090\u02E3",
              value: `${(uMaxECR * 100).toFixed(0)} % (DS-SEL governed screening criterion)`,
              alert: false,
            },
            {
              label: "Calculated Minimum Diameter D\u1D3C\u1D3C\u1D3A",
              value: dCalcECR_m !== null ? `${(dCalcECR_m * 1000).toFixed(1)} mm  (continuous — before 50 mm rounding)` : "Not calculable — enter Q\u1D40, C\u1D3C\u1D3C\u1D3A, and F\u1D30",
              alert: dCalcECR_m === null,
            },
            {
              label: "DS-SEL Selected Standard Diameter",
              value: dselECREval?.selectedDiameter_mm != null
                ? `${dselECREval.selectedDiameter_mm} mm  (next 50 mm increment ≥ D\u1D3C\u1D3C\u1D3A · DS-SEL-002)`
                : "Run DS-SEL (Step 8) to determine the governed standard diameter",
              alert: dselECREval?.selectedDiameter_mm == null,
            },
            {
              label: "Actual Utilization at Selected Diameter",
              value: dselECREval?.floodingUtilization != null
                ? `${(dselECREval.floodingUtilization * 100).toFixed(1)} %  (max case · against C\u1D3C\u1D3C\u1D3A × F\u1D30)`
                : "—",
              alert: false,
            },
          ].map(({ label, value, alert }) => (
            <div key={label} className="grid grid-cols-[260px_1fr] gap-2 py-1 border-b border-gray-50 last:border-0">
              <span className="text-xs text-gray-500">{label}</span>
              <span className={`text-xs font-medium ${alert ? "text-amber-700" : "text-gray-800"}`}>{value}</span>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 mt-2">
            Packed-column reference values (C3 Godfrey slip model, Rauber 2006 SMVP throughput) appear only in the ECP design section and do not participate in ECR diameter selection.
          </p>
        </SectionCard>

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
              {resultRow("Active Agitated Height", ecrData?.heightBreakdown?.activeAgitatedHeight, "m", 2)}
              {/* Effective performance — governance reporting outputs, not a second height calculation */}
              {resultRow("Effective Stages / m (S_eff = N_T / H_active)", ecrData?.heightBreakdown?.effectivePerformance?.stagesPerMetre, "stages/m", 2)}
              {resultRow("Effective HETS (H_active / N_T)", ecrData?.heightBreakdown?.effectivePerformance?.hetsEffective, "m/stage", 3)}
              {!ecrData?.heightBreakdown?.effectivePerformance && (
                <p className="text-[10px] text-amber-600 px-1 mb-1">
                  Effective performance outputs require a fresh Calculate ECR run — the stored snapshot predates these fields (engine updated this session).
                  {" "}First re-run the Stage 4 Material Balance if the C2 guard is active, then re-run Calculate ECR.
                </p>
              )}
              {resultRow("Shaft Power", sp0?.power?.totalShaft, "kW", 2, 0.001)}
              <div key="motor-power" className="grid grid-cols-[200px_1fr] gap-2 py-1 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-500">Motor Design Power</span>
                <span className="text-xs font-medium text-gray-800">
                  {sp0?.power?.motorDesign?.result != null ? ((sp0.power.motorDesign.result as number) * 0.001).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"} kW
                  <span className="text-[10px] text-amber-600 font-normal ml-1">Preliminary Agitator Power Screening — not vendor motor sizing</span>
                </span>
              </div>
              {resultRow("Total Column Height (overall vessel)", ecrData?.heightBreakdown?.overallVesselHeight, "m", 2)}
              {resultRow("Hydraulic Utilization", selRow?.ecrHydraulicUtilization, "%", 1)}
              {/* Density-difference screening */}
              {(() => {
                const dds = ecrData?.densityDifferenceScreening;
                if (!dds) return null;
                const deltarhoVal = dds?.deltarho?.result;
                const screeningResult: string = dds?.screeningResult ?? "";
                const isWithin = screeningResult.includes("Within");
                return (
                  <div className="mt-2 p-2.5 rounded-lg border border-gray-200 bg-gray-50">
                    <p className="text-[11px] font-semibold text-gray-700 mb-1">Density-Difference Screening (Δρ)</p>
                    <div className="grid grid-cols-[200px_1fr] gap-2 py-0.5">
                      <span className="text-xs text-gray-500">|ρ_NMP − ρ_RRBO|</span>
                      <span className="text-xs font-medium text-gray-800">{deltarhoVal != null ? (deltarhoVal as number).toFixed(1) : "—"} kg/m³ · {dds?.deltarho?.status ?? ""}</span>
                    </div>
                    <div className="grid grid-cols-[200px_1fr] gap-2 py-0.5">
                      <span className="text-xs text-gray-500">Screening threshold</span>
                      <span className="text-xs font-medium text-gray-800">50 kg/m³ (published standard ECR applicability)</span>
                    </div>
                    <div className={`mt-1 text-[11px] font-medium ${isWithin ? "text-green-700" : "text-amber-700"}`}>
                      {screeningResult || "—"}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{dds?.screeningNote}</p>
                  </div>
                );
              })()}
              {resultRow("Validation Status", selRow?.feasibility)}
            </>
          )}
          {renderRunIssues(ecrLatestRun, "ECR")}
        </SectionCard>
      </div>
    );
  }

  function renderMechanicalDesign() {
    const md = d("mechanical_design");
    const f = field("mechanical_design");
    const s = save("mechanical_design");
    const dbData = d("design_basis");


    // ── Inherited values (from Stages 1/5/7) ─────────────────────────────
    const acceptedStatuses = ["success", "warning"];
    // Auto-detect mechanical basis: most recently accepted Stage 7 ECR or ECP run — no selection required.
    const lastStage7Run: any = [...runs]
      .filter((r: any) => ["ecp", "ecr"].includes(r.calculation_type) && acceptedStatuses.includes(r.calculation_status))
      .sort((a: any, b: any) => new Date(b.calculated_at).getTime() - new Date(a.calculated_at).getTime())[0];
    const effectiveTech: string = lastStage7Run?.calculation_type ?? "";
    const techLabel = effectiveTech === "ecp" ? "ECP (Packed Column)" : effectiveTech === "ecr" ? "ECR (Rotary Agitated Column)" : "";
    const techRunType = effectiveTech || null;
    const techRun: any = techRunType ? runs.find((r: any) => r.calculation_type === techRunType && acceptedStatuses.includes(r.calculation_status)) : null;
    const techHB = techRun?.result_snapshot?.heightBreakdown;

    const hydSummary = (resultsQ.data ?? []).find((r: any) => r.section === "hydraulics_common")?.data?.normalCase?.summary;
    const trialStr = (d("hydraulic_design").column_diameter ?? "").trim();
    const selDiaM = parseFloat(trialStr) > 0 ? parseFloat(trialStr) : parseFloat(String(hydSummary?.minimumFeasibleDiameter_m ?? ""));
    const fmt = (v: any, dp = 2) => (typeof v === "number" && isFinite(v) ? v.toFixed(dp) : "");

    const mdRow = inputsQ.data?.find?.((r: any) => r.section === "mechanical_design");
    const sectionUpdated = mdRow?.updated_at ? new Date(mdRow.updated_at).toLocaleString() : "Never saved";

    // Inherited field definitions: [key, label, unit, inheritedValue, sourceStage, sourceRef]
    const inherited: { key: string; label: string; unit?: string; inh: string; stage: string; ref: string; missing?: string }[] = [
      { key: "selected_technology", label: "Selected Technology", inh: techLabel, stage: "Stage 7 — Equipment Design", ref: "Auto-detected from most recent accepted Stage 7 run", missing: "Pending accepted Stage 7 ECR/ECP run" },
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
        {stageBanner("mechanical_design")}
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
          <div className="grid grid-cols-[210px_1fr_60px] items-start gap-3 py-1">
            <label className="text-sm text-gray-600 pt-2 font-medium leading-tight">Governing Design Code</label>
            <div>
              <select className="w-full h-8 text-sm border rounded-md px-2 bg-white" value={(md.design_code ?? "").trim()} disabled={isFrozen}
                onChange={e => cm({ design_code: e.target.value })}>
                <option value="">— Not Assigned (blocks report issue) —</option>
                {["ASME Sec VIII Div 1", "ASME Sec VIII Div 2", "EN 13445", "IS 2825", "PD 5500"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {trace((md.design_code ?? "").trim() ? "Engineer Entered" : "Mandatory — Not Assigned", "Stage 9 — Mechanical Design", "No default is applied; the engine records NOT_ASSIGNED verbatim until entered. Assigning the code and re-running unblocks the EDS/MDS/RFQ/EDR reports.")}
            </div>
            <span />
          </div>
        </SectionCard>

        <SectionCard title="Nozzle Schedule (Auto-Generated & Sized)">
          <div className="flex items-center justify-between mb-2 gap-3">
            <p className="text-[11px] text-gray-500">
              Fully automatic generation from the selected technology, process flows, vessel geometry and controlled Thermopac nozzle master data (velocity rules, DN series, instrument masters, access rules). Liquid nozzles: A = Q/v, d = √(4A/π), next larger DN. All values remain editable — an edit is marked Engineer Override. Elevations are Preliminary Layout values.
              {nozRefs && <> <span className="text-gray-400">Master data: {nozRefs}</span></>}
            </p>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" disabled={isFrozen || nozGenBusy || !effectiveTech} onClick={generateNozzlesAuto}>
                {nozGenBusy ? "Generating…" : nozzles.length ? "Regenerate & Size Nozzles (Auto)" : "Generate & Size Nozzles (Auto)"}
              </Button>
              {nozzles.length > 0 && (
                <Button size="sm" variant="outline" disabled={isFrozen} onClick={() => saveNozzles([...nozzles, { tag: "", service: "", size: "", rating: "150#", flange_std: "ASME B16.5", facing: "RF", connection: "Flanged", orientation: "", elevation: "", qty: "1", source: "Engineer Entry", status: "Preliminary — Pending Validation", remarks: "" } as Noz])}>
                  + Add Row
                </Button>
              )}
            </div>
          </div>
          {!effectiveTech && (
            <p className="text-[11px] text-amber-700 mb-2">Generation requires an accepted Stage 7 ECR or ECP run — run the Stage 7 calculation and accept the result first.</p>
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
            <p className="text-sm text-gray-400 italic">No nozzles defined — click "Generate &amp; Size Nozzles (Auto)" to generate and size the full {effectiveTech === "ecr" ? "ECR" : effectiveTech === "ecp" ? "ECP" : "LLX"} schedule from Thermopac nozzle master data.</p>
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
            ["Selected Technology", effVal(inherited[0]) || "Pending Stage 7 accepted run"],
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
    // Auto-detect: most recently accepted Stage 7 ECR or ECP run governs.
    const acceptedSt = ["success", "warning"];
    const lastMVRun: any = [...runs]
      .filter((r: any) => ["ecp","ecr"].includes(r.calculation_type) && acceptedSt.includes(r.calculation_status))
      .sort((a: any, b: any) => new Date(b.calculated_at).getTime() - new Date(a.calculated_at).getTime())[0];
    const effectiveTechMV: string = lastMVRun?.calculation_type ?? "";
    const techSelected = !!effectiveTechMV;
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
          <Button size="sm" disabled={isFrozen || calculateMutation.isPending || nozGenBusy || !techSelected || !effectiveTechMV} onClick={async () => {
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
            Blocked — no accepted Stage 7 ECR or ECP run found. Run the Stage 7 calculation and accept the result first.
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
    const utCalc = computeUtilities();
    const statusLine = (text: string) => <p className="text-[11px] text-gray-400 px-2 -mt-0.5">{text}</p>;
    return (
      <div className="max-w-2xl">
        {stageBanner("utilities", "Utilities incomplete")}
        <div className="flex items-center justify-between gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-4">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" />
            <span>Four fields are calculated from Design Basis, fluid properties, and equipment results. Steam and nitrogen require stripping design — enter manually.</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" disabled={isFrozen || !utCalc}
            onClick={() => { if (utCalc) { Object.entries(utCalc).forEach(([k, v]) => f(k, v)); commitSection("utilities", utCalc); } }}>
            Recalculate
          </Button>
        </div>
        <SectionCard title="Utility Requirements">
          <FieldRow label="Thermal Oil Duty" value={ut.thermal_oil_duty ?? ""} onChange={v => f("thermal_oil_duty", v)} onBlur={s} unit="kcal/h" />
          {statusLine("ṁ_NMP(max) × Cp_NMP(1.67 kJ/kg·K) × (T_op − T_CW_out) × 860 — NMP solvent heating duty")}
          <FieldRow label="Cooling Water Duty" value={ut.cw_duty ?? ""} onChange={v => f("cw_duty", v)} onBlur={s} unit="TR" />
          {statusLine("(Thermal duty + raffinate cooling) / 3.517 — 1 TR = 3.517 kW; raffinate: ṁ_RRBO(max) × Cp_RRBO(2.1 kJ/kg·K) × (T_op − T_amb)")}
          <FieldRow label="Cooling Water Flow" value={ut.cw_flow ?? ""} onChange={v => f("cw_flow", v)} onBlur={s} unit="m³/h" />
          {statusLine("CW duty / (ρ_w × Cp_w × ΔT_CW) — uses CW ΔT from Design Basis")}
          <FieldRow label="Steam Requirement" value={ut.steam_requirement ?? ""} onChange={v => f("steam_requirement", v)} onBlur={s} unit="kg/h" />
          {statusLine("Manual entry — requires stripping column / NMP regeneration design (not in current scope)")}
          <FieldRow label="Electrical Load" value={ut.electrical_load ?? ""} onChange={v => f("electrical_load", v)} onBlur={s} unit="kW" />
          {statusLine("Pump power (all streams, ΔP 300 kPa, η 0.65) + ECR motor design power if ECR result present")}
          <FieldRow label="Nitrogen Requirement" value={ut.nitrogen_requirement ?? ""} onChange={v => f("nitrogen_requirement", v)} onBlur={s} unit="Nm³/h" />
          {statusLine("Manual entry — site blanket/purge philosophy; not derivable from process inputs")}
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
        {stageBanner("cost_estimation")}
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
      { key: "equipment_datasheet",docType: "EDS", title: "Equipment Datasheet", desc: "Engineering datasheet for equipment procurement — frozen mechanical snapshot at the effective design diameter (DS-SEL-006), process/design conditions, materials, nozzle schedule, weights." },
      { key: "mechanical_datasheet",docType: "MDS", title:"Mechanical Datasheet", desc: "Mechanical design datasheet for fabrication — full thickness workings with verbatim engine formulas, weights breakdown, nozzle schedule with projections, validation checklist." },
      { key: "rfq_datasheet",      docType: "RFQ", title: "RFQ Datasheet",  desc: "Request-for-quotation specification — purchaser design data at the effective diameter, nozzle schedule, and the explicit vendor-scope/outstanding-analyses declaration." },
      { key: "calc_book",          docType: "PCB", title: "Process Calculation Book", desc: "Complete calculation workings — compiles the frozen DBR, PDR, HDR, ECPR, ECRR and mechanical payloads verbatim into one book." },
      { key: "design_report",      docType: "EDR", title: "Engineering Design Report", desc: "Complete engineering design report — design basis extract, C2 summary, full DS-SEL decision record, mechanical summary, run and document registers." },
      { key: "preliminary_ga",     docType: "PGA", title: "Preliminary General Arrangement", desc: "Auto-generated scaled elevation & sectional views from the frozen calculation snapshots — nozzle table, dimension table, internals stack. Pending Mechanical Detail Design — Not for Fabrication." },
      { key: "design_review",      docType: "DRR", title: "Design Review Report", desc: "Capability & disposition review of the preliminary single-phase frictional pressure-drop framework (ECP-009/ECP-010) — existing vs new capability, gaps, recommended modifications, confidence per calculation, Not-Calculable dispositions." },
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
            // The LIVE report row is the non-stale one; stale rows (superseded by
            // a governed design change) stay listed for the audit trail only.
            const rep = docType ? (reportsQ.data ?? []).find(r => r.doc_type === docType && !r.is_stale) : undefined;
            const staleRep = docType ? (reportsQ.data ?? []).find(r => r.doc_type === docType && r.is_stale) : undefined;
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
                    {staleRep && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800">
                        Previous {staleRep.status === "for_review" ? "For Review" : staleRep.status} report is <strong>STALE</strong> — {staleRep.stale_reason ?? "superseded by a governed design change"}. It is retained for the audit trail;{" "}
                        <button className="underline" onClick={() => window.open(`/api/design-software/reports/${staleRep.id}/pdf`, "_blank")}>view superseded PDF</button>. Approval/issue of this revision's reports is blocked until all stale reports are resolved by the regenerated versions below.
                      </div>
                    )}
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
      case "ecr2_simulation":       return renderEcr2ProcessSimulation();
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
                const st = stageStatus(step.key as StepKey);
                // Design Validation stage inherits the existing check aggregator
                const hasDvFail = step.key === "design_validation" && validationChecks.some(c => c.status === "fail");
                return (
                  <button
                    key={step.key}
                    onClick={() => setActiveStep(step.key as StepKey)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors mb-0.5 ${
                      isActive ? "bg-blue-600 text-white shadow-sm" : "hover:bg-gray-100 text-gray-700"
                    }`}
                  >
                    <span className={`text-xs font-bold w-5 shrink-0 ${isActive ? "text-blue-200" : "text-gray-400"}`}>{step.id}</span>
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-blue-200" : "text-gray-400"}`} />
                    <span className="text-xs font-medium leading-tight flex-1">{step.label}</span>
                    {/* Stage status indicator — set only after "Next →" has been pressed */}
                    {st === "complete" && !isActive && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Stage complete" />
                    )}
                    {st === "warning" && !isActive && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Completed with warnings" />
                    )}
                    {(st === "blocking" || hasDvFail) && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-red-500 shrink-0" title="Blocking errors present" />
                    )}
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

            {/* ── Stage navigation footer ──────────────────────────────────── */}
            {(() => {
              const currentIdx = STEPS.findIndex(s => s.key === activeStep);
              const nextStep   = STEPS[currentIdx + 1];
              const prevStep   = STEPS[currentIdx - 1];
              if (!nextStep && !prevStep) return null;
              const errs  = stageValidationErrors[activeStep]   ?? {};
              const warns = stageValidationWarnings[activeStep] ?? {};
              const crossKeys      = CROSS_STAGE_ERROR_KEYS[activeStep] ?? new Set<string>();
              const inStageErrKeys = Object.keys(errs).filter(k => !crossKeys.has(k));
              const crossErrKeys   = Object.keys(errs).filter(k =>  crossKeys.has(k));
              const hasErrors   = Object.keys(errs).length  > 0;
              const hasWarnings = Object.keys(warns).length > 0;
              const attempted   = stageValidationAttempted.has(activeStep);
              const stage8Unresolved = activeStep === "ecr2_simulation" && stage8ResolutionQ.isSuccess
                ? ecr2LiveDependencies.filter(dependency => !dependency.ready)
                : null;
              const displayedInStageErrorCount = stage8Unresolved?.length ?? inStageErrKeys.length;
              return (
                <div className="mt-8 pt-5 border-t flex items-center justify-between">
                  <div>
                    {prevStep && (
                      <button
                        onClick={() => setActiveStep(prevStep.key as StepKey)}
                        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                      >
                        <ChevronRight className="h-4 w-4 rotate-180" />
                        {prevStep.label}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {attempted && displayedInStageErrorCount > 0 && (
                      <span className="text-xs text-red-600 font-medium">
                        {stage8Unresolved
                          ? `${displayedInStageErrorCount} required dependenc${displayedInStageErrorCount === 1 ? "y" : "ies"} unresolved on this page`
                          : `${displayedInStageErrorCount} required field${displayedInStageErrorCount > 1 ? "s" : ""} missing on this page`
                        }
                      </span>
                    )}
                    {attempted && displayedInStageErrorCount === 0 && crossErrKeys.length > 0 && (
                      <span className="text-xs text-red-600 font-medium">
                        {crossErrKeys.length} required field{crossErrKeys.length > 1 ? "s" : ""} in a later stage
                      </span>
                    )}
                    {attempted && !hasErrors && hasWarnings && (
                      <span className="text-xs text-amber-600 font-medium">
                        {Object.keys(warns).length} warning{Object.keys(warns).length > 1 ? "s" : ""} — review recommended
                      </span>
                    )}
                    {nextStep && (
                      <button
                        onClick={() => tryNavigateTo(nextStep.key as StepKey)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          attempted && hasErrors
                            ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                            : attempted && hasWarnings
                              ? "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                              : "bg-blue-600 text-white hover:bg-blue-700"
                        }`}
                      >
                        {nextStep.label}
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
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
