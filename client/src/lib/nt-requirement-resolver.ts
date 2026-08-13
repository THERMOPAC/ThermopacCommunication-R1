// ─────────────────────────────────────────────────────────────────────────────
// Governed N_T Requirement Resolver — single source of truth.
//
// Drives three consumers from ONE definition:
//   1. Stage 4 blocking validation ("Next →")
//   2. Dynamic missing-input panel (triggered by Total Aromatics entry)
//   3. N_T auto-calculation readiness check
//
// Engineering basis confirmed 2026-08-11:
//   • wt% → mole fraction uses fixed Coto 2022 surrogate MWs — no user-entered MWs.
//   • Total Aromatics wt% is DERIVED as mono + di + poly — not a required input.
//   • Class molecular weights (rrbo_mw_*) are NOT required fields.
// ─────────────────────────────────────────────────────────────────────────────

/** RRBO grades accepted by the EPD library (mirrors RRBO_GRADE_FLUID_IDS in the mapper). */
const RRBO_GRADES = [
  'Re-Refined Base Oil SN150',
  'Re-Refined Base Oil SN200',
  'Re-Refined Base Oil SN300',
  'Re-Refined Base Oil SN500',
] as const;

/** One field required for the governed Coto 2022 N_T auto-calculation. */
export interface NtRequiredField {
  /** Flat workspace field key (snake_case, as stored in section data). */
  key: string;
  /** Workspace section where this field lives. */
  section: 'design_basis' | 'process_design';
  /** Human-readable label shown in the missing-input panel. */
  label: string;
  /** Unit string (empty string when dimensionless or categorical). */
  unit: string;
  /** Exact mathematical reason this field is required — shown alongside the label. */
  reason: string;
  /**
   * Returns true when the raw string value from the workspace is present and
   * passes the minimum validity check for this field.
   */
  validate: (value: string | undefined) => boolean;
}

// ── Shared validators ─────────────────────────────────────────────────────────

const parseNum = (v: string | undefined) => {
  const n = parseFloat((v ?? '').trim());
  return Number.isFinite(n) ? n : null;
};
const isFinitePositive  = (v: string | undefined) => { const n = parseNum(v); return n !== null && n > 0; };
const isFiniteNonNeg    = (v: string | undefined) => { const n = parseNum(v); return n !== null && n >= 0; };

// ── Governed required-field list ──────────────────────────────────────────────

/**
 * All 8 fields mathematically required for the governed Coto 2022 N_T cascade.
 *
 * Order: design_basis fields first (already gated at Stage 2), then
 * process_design fields in the order they appear in the Stage 4 UI.
 *
 * Adding or removing a field here automatically updates:
 *   • Stage 4 blocking validation
 *   • The missing-input panel
 *   • The N_T auto-calculation gate
 */
export const NT_REQUIRED_FIELDS: readonly NtRequiredField[] = [
  {
    key: 'operating_temperature',
    section: 'design_basis',
    label: 'Operating Temperature',
    unit: '°C',
    reason: 'Governs LLE equilibrium basis — Coto 2022 at 298.15 K or NRTL τ(T) extrapolation at other temperatures',
    validate: v => { const n = parseNum(v); return n !== null && n > 0 && n < 200; },
  },
  {
    key: 'feed_service',
    section: 'design_basis',
    label: 'Feed Service (RRBO Grade)',
    unit: '',
    reason: 'Determines RRBO density from the EPD library — required for vol-basis S/O → molar S/O conversion',
    validate: v => RRBO_GRADES.includes((v ?? '').trim() as typeof RRBO_GRADES[number]),
  },
  {
    key: 'so_ratio',
    section: 'process_design',
    label: 'Solvent/Oil Ratio',
    unit: 'vol/vol',
    reason: 'Volume S/O → mass S/O → molar S/O (× avg surrogate feed MW / 99.13 g/mol NMP)',
    validate: isFinitePositive,
  },
  {
    key: 'rrbo_saturates_wt',
    section: 'process_design',
    label: 'RRBO Saturates',
    unit: 'wt%',
    reason: 'Coto feed mole fraction — n-dodecane surrogate (170.34 g/mol); also sets avg surrogate feed MW',
    validate: isFiniteNonNeg,
  },
  {
    key: 'rrbo_mono_aromatics_wt',
    section: 'process_design',
    label: 'RRBO Mono-Aromatics',
    unit: 'wt%',
    reason: 'Coto feed mole fraction — 1,4-xylene surrogate (106.17 g/mol)',
    validate: isFiniteNonNeg,
  },
  {
    key: 'rrbo_di_aromatics_wt',
    section: 'process_design',
    label: 'RRBO Di-Aromatics',
    unit: 'wt%',
    reason: 'Coto feed mole fraction — 1-methylnaphthalene surrogate (142.20 g/mol)',
    validate: isFiniteNonNeg,
  },
  {
    key: 'rrbo_poly_aromatics_wt',
    section: 'process_design',
    label: 'RRBO Poly-Aromatics',
    unit: 'wt%',
    reason: 'Coto feed mole fraction — pyrene surrogate (202.25 g/mol)',
    validate: isFiniteNonNeg,
  },
  {
    key: 'target_raffinate_aromatics_mol',
    section: 'process_design',
    label: 'Target Raffinate Aromatics',
    unit: 'mol%',
    reason: 'Raffinate locus specification — anchors the cascade endpoint on the Coto phase diagram; governed envelope ≈ 6.2 – 20.1 mol% (Coto 2022 Table 3)',
    validate: v => { const n = parseNum(v); return n !== null && n > 0 && n < 100; },
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

export interface NtResolverResult {
  /** Complete governed required-field list. */
  allFields: readonly NtRequiredField[];
  /** Fields currently missing or invalid in the workspace — empty when calculable. */
  missingFields: NtRequiredField[];
  /** True when no required fields are missing — N_T auto-calculation can proceed. */
  calculable: boolean;
}

/**
 * Evaluate N_T calculability against the current workspace state.
 *
 * @param designBasis   Flat section data from the design_basis section.
 * @param processDesign Flat section data from the process_design section.
 *
 * Pure function — no side effects. Safe to call on every render.
 */
export function resolveNtInputs(
  designBasis: Record<string, string | undefined>,
  processDesign: Record<string, string | undefined>,
): NtResolverResult {
  const missingFields = (NT_REQUIRED_FIELDS as NtRequiredField[]).filter(f => {
    const section = f.section === 'design_basis' ? designBasis : processDesign;
    const raw = (section[f.key] ?? '').trim();
    return !f.validate(raw || undefined);
  });
  return { allFields: NT_REQUIRED_FIELDS, missingFields, calculable: missingFields.length === 0 };
}
