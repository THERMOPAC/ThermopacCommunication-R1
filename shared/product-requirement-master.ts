// ─────────────────────────────────────────────────────────────────────────────
// Product Requirement Master Data — Thermopac LLX Design Basis defaults.
//
// Default Raffinate / Extract requirements auto-populated per Feed Service.
// These are preliminary engineering defaults only — fully editable by the
// engineer in the Design Basis workspace. Seeded 2026-08-05.
//
// Governance: this file is the single source of truth for Product Requirement
// defaults. The React workspace component must import from here and must not
// hard-code these values.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductRequirementRow {
  parameter: string;
  target: string;
  unit: string;
  limitType: "Min" | "Max" | "Target" | "Range";
  notes: string;
}

/** Known product-requirement parameters — unit and limit type auto-populate
 *  when the parameter is selected; target defaults where defined. */
export const PRODUCT_PARAMETER_MASTER: Record<
  string,
  { unit: string; limitType: ProductRequirementRow["limitType"]; defaultTarget?: string; notes?: string }
> = {
  "Product Colour":        { unit: "ASTM", limitType: "Max",    defaultTarget: "1.5",  notes: "Scale: ASTM D1500" },
  "Water":                 { unit: "ppm",  limitType: "Max",    defaultTarget: "100" },
  "Sulphur":               { unit: "ppm",  limitType: "Max",    defaultTarget: "1500" },
  "Raffinate Yield":       { unit: "%",    limitType: "Min",    defaultTarget: "80" },
  "Aromatic-Rich Extract": { unit: "%",    limitType: "Target", defaultTarget: "20" },
  "Extract Yield":         { unit: "%",    limitType: "Target", defaultTarget: "20" },
};

const RRBO_RAFFINATE_DEFAULTS: ProductRequirementRow[] = [
  { parameter: "Product Colour",  target: "1.5",  unit: "ASTM", limitType: "Max", notes: "Scale: ASTM D1500" },
  { parameter: "Water",           target: "100",  unit: "ppm",  limitType: "Max", notes: "" },
  { parameter: "Sulphur",         target: "1500", unit: "ppm",  limitType: "Max", notes: "" },
  { parameter: "Raffinate Yield", target: "80",   unit: "%",    limitType: "Min", notes: "" },
];

const RRBO_EXTRACT_DEFAULTS: ProductRequirementRow[] = [
  { parameter: "Aromatic-Rich Extract", target: "20", unit: "%", limitType: "Target", notes: "" },
  { parameter: "Extract Yield",         target: "20", unit: "%", limitType: "Target", notes: "" },
];

/** Default Product Requirements per Feed Service. */
export const PRODUCT_REQUIREMENT_MASTER: Record<
  string,
  { raffinate: ProductRequirementRow[]; extract: ProductRequirementRow[] }
> = {
  "Re-Refined Base Oil SN150": { raffinate: RRBO_RAFFINATE_DEFAULTS, extract: RRBO_EXTRACT_DEFAULTS },
  "Re-Refined Base Oil SN200": { raffinate: RRBO_RAFFINATE_DEFAULTS, extract: RRBO_EXTRACT_DEFAULTS },
  "Re-Refined Base Oil SN300": { raffinate: RRBO_RAFFINATE_DEFAULTS, extract: RRBO_EXTRACT_DEFAULTS },
  "Re-Refined Base Oil SN500": { raffinate: RRBO_RAFFINATE_DEFAULTS, extract: RRBO_EXTRACT_DEFAULTS },
};

export const PRODUCT_REQUIREMENT_MASTER_SOURCE =
  "Thermopac Product Requirement Master Data — Design Basis defaults";
