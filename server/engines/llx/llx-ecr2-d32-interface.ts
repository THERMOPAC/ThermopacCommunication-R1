// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — d₃₂ Plug-In Interface
//
// Defines the contract through which a droplet diameter enters the ECR-2
// simulator. Three modes are supported:
//
//   'published_correlation'  — K&H 1996 (ecr2_d32_kh1996). The former
//                              preliminary reconstruction is transcription-
//                              invalid and deliberately fails closed until the
//                              original notation is independently resolved.
//
//   'engineer_supplied'      — Explicit engineer-supplied d₃₂ for simulator
//                              development and sensitivity testing ONLY.
//                              Must carry source type and reference. Outputs are
//                              labelled "Engineer-Supplied d₃₂ — Simulator
//                              Development / Sensitivity Basis".
//
//   'direct_turbulence_preliminary'
//                            — Separate Hinze-type preliminary engineering
//                              route. It uses an explicitly source-tagged
//                              selected C within the controlled sensitivity
//                              interval. It is NOT the K&H 1996 equation.
//
// This interface also permits a future 'pilot_calibrated' mode once pilot data
// becomes available.
//
// IMPORTANT:
//   · Do NOT silently substitute an assumed d₃₂.
//   · A null result for an unavailable or invalid calculation is the correct
//     response — never invent or silently substitute a fallback d₃₂.
//   · Engineer-supplied d₃₂ is NOT a hidden fallback — it requires explicit
//     declaration of source type and reference by the engineer.
// ═══════════════════════════════════════════════════════════════════════════

// ── D₃₂ mode types ────────────────────────────────────────────────────────

/**
 * Which source provides d₃₂ for this simulator run.
 *
 * 'published_correlation' — retain the K&H 1996 selection and its provenance.
 *                           The former numerical reconstruction is disabled as
 *                           transcription-invalid; it cannot produce d₃₂.
 * 'engineer_supplied'     — engineer provides d₃₂ explicitly for development/
 *                           sensitivity testing. Not a published model result.
 */
export type D32Mode =
  | 'published_correlation'
  | 'engineer_supplied'
  | 'direct_turbulence_preliminary';

/** Status of the d₃₂ computation result. */
export type D32Status =
  | 'calculated'              // reserved for a fully governed published correlation
  | 'calculated_extrapolated' // from resolved correlation but outside validity range
  | 'calculated_preliminary'  // controlled preliminary engineering route
  | 'engineer_supplied'       // explicit engineer input, labelled accordingly
  | 'transcription_invalid'   // former K&H reconstruction is known not to match its secondary sources
  | 'phase_configuration_unsupported'
                               // published K&H 1996 route not approved for selected continuity
  | 'correlation_unresolved'  // reserved for a future unapproved published correlation
  | 'calculation_invalid'     // correlation produced a non-physical result
  | 'input_missing';          // required local-state inputs are absent

// ── Input contracts ────────────────────────────────────────────────────────

/**
 * Configuration for engineer-supplied d₃₂.
 *
 * This is an explicit, declared mode for simulator development and sensitivity
 * testing. It is NOT a hidden fallback. The engineer must supply:
 *   · The d₃₂ value in metres
 *   · A source type (e.g. 'Assumed', 'Vendor', 'Estimated_Pilot')
 *   · A source reference (e.g. "Assumed basis: Kühni ECR-60 vendor data ref XYZ")
 *
 * All outputs computed using this value will be labelled:
 *   "Engineer-Supplied d₃₂ — Simulator Development / Sensitivity Basis"
 */
export interface EngineerSuppliedD32Config {
  mode: 'engineer_supplied';
  /** Sauter mean diameter d₃₂ (m). Must be > 0. Typical Kühni range: 0.5–5 mm. */
  value_m: number;
  /**
   * Source type classification.
   * Use one of: 'Assumed', 'Estimated_Pilot', 'Vendor', 'Literature_Analogy',
   * 'Engineer_Judgement', 'Calibrated'.
   */
  sourceType: string;
  /**
   * Human-readable source reference.
   * Example: "Assumed basis — analogous Kühni ECR60 pilot, see ref TXX-YYY"
   * Must not be empty.
   */
  sourceReference: string;
}

/**
 * Configuration for the published K&H 1996 correlation.
 *
 * No numerical K&H result is currently available. The prior reconstruction
 * used an inferred C₁^n₁ numerator and directly added the high-agitation term;
 * independent secondary reproductions show that term placement is not
 * supportable. Primary notation for H and the numerator symbol remains
 * unresolved, so this route returns transcription_invalid with no value.
 */
export interface PublishedCorrelationD32Config {
  mode: 'published_correlation';
  /** Registry correlation ID. Must be 'ecr2_d32_kh1996'. */
  correlationId: 'ecr2_d32_kh1996';
}

/**
 * Configuration for the separately governed direct-turbulence sensitivity route.
 *
 * The C interval is deliberately fixed in the correlation registry rather than
 * supplied as free-form input. A nominal C must remain inside that interval and
 * carry its own recorded source; no midpoint is silently selected. That source
 * records the nominal-value selection only: it does not establish the
 * project-controlled C interval as literature-verified.
 */
export interface DirectTurbulencePreliminaryD32Config {
  mode: 'direct_turbulence_preliminary';
  correlationId: 'ecr2_d32_direct_turbulence_preliminary';
  /** Selected preliminary C, dimensionless; must be within 0.36 to 0.43. */
  C_nominal: number;
  /** Source class for the selected nominal C. */
  sourceType: string;
  /** Exact source/reference for the selected nominal C. */
  sourceReference: string;
}

/** Union type — one supported d₃₂ configuration. */
export type D32Config =
  | EngineerSuppliedD32Config
  | PublishedCorrelationD32Config
  | DirectTurbulencePreliminaryD32Config;

// ── Local hydrodynamic state (inputs to the correlation) ──────────────────

/**
 * Local compartment state fields required to compute d₃₂ from a published
 * correlation such as K&H 1996.
 *
 * All properties are at the local axial position z.
 * Phase convention: RRBO = dispersed (d), NMP = continuous (c).
 */
export interface D32LocalState {
  /** Compartment height h (m). */
  h_comp_m: number;
  /** Specific power input ψ = (P/V)/ρ_b (W/kg). */
  psi_W_kg: number;
  /** Local continuous-phase (NMP) density ρ_c (kg/m³). */
  rho_c_kg_m3: number;
  /** Local dispersed-phase (RRBO) density ρ_d (kg/m³). */
  rho_d_kg_m3: number;
  /**
   * Legacy diagnostic context only; d₃₂ derives Δρ directly as ρ_c − ρ_d so
   * contradictory caller-supplied differences cannot affect the calculation.
   */
  delta_rho_kg_m3?: number;
  /** Local interfacial tension σ (N/m). */
  sigma_N_m: number;
  /**
   * Legacy context only; not a mathematical input to the approved d₃₂ equation.
   * Holdup retains its independent K&H 1995 requirement for x_f.
   */
  xf_stator?: number;
  /**
   * Legacy context only; not a mathematical input to the approved d₃₂ equation.
   * Kept optional for callers that co-locate holdup and d₃₂ state.
   */
  phi_d?: number;
  /** Axial position z (m). For diagnostics only. */
  z_m?: number;
  /** Compartment index. For diagnostics only. */
  compartmentIndex?: number;
  /**
   * Governed Stage 7 rotor data required for the direct-turbulence route.
   * V_R is the active liquid volume of one agitated compartment, not total
   * column volume. All values use SI units.
   */
  directTurbulence?: {
    powerNumber_Ne: number;
    rotorSpeed_s: number;
    rotorDiameter_m: number;
    rotorVolume_m3: number;
  };
}

// ── Result type ────────────────────────────────────────────────────────────

/**
 * Result of computeDropletDiameter().
 *
 * d32_m is non-null only when status is calculated, calculated_extrapolated,
 * or engineer_supplied. A transcription-invalid result never carries an
 * executable raw value, even if the old formula would have produced one.
 */
export interface D32Result {
  /** Sauter mean diameter d₃₂ (m). Null unless status is computed or engineer_supplied. */
  d32_m: number | null;
  /**
   * Unclamped raw correlation output (m). Retained when finite even when a
   * later physical-validity guard rejects it; null when no numerical output is
   * mathematically calculable.
   */
  d32_raw_m: number | null;
  /** Computation status. */
  status: D32Status;
  /** Mode that produced this result. */
  mode: D32Mode;
  /** Registry correlation ID used (null for engineer_supplied). */
  correlationId: string | null;
  /**
   * Display label for all outputs computed using this d₃₂.
   * Non-null whenever d32_m is non-null.
   *
   * Examples:
   *   "Published Correlation — Preliminary Engineering (K&H 1996)"
   *   "Engineer-Supplied d₃₂ — Simulator Development / Sensitivity Basis"
   */
  label: string | null;
  /** True if result came from outside the primary validity range. */
  extrapolated: boolean;
  /** List of diagnostic messages (applicability warnings, range violations). */
  diagnostics: string[];
  /** Provenance string for audit trail. */
  provenance: string;
  /**
   * Source type and reference when mode='engineer_supplied'.
   * Null for published correlation results.
   */
  engineerSource: { sourceType: string; sourceReference: string } | null;
  /** Engineering basis carried by every numerical d₃₂ result. */
  engineeringBasis: string;
  /** Lifecycle/governance statement carried without suppressing preliminary use. */
  governanceStatus: string;
  /** K&H 1996 primary paper has not been verified in this implementation. */
  primarySourceVerified: boolean;
  /** K&H 1996 has not been validated for the RRBO/NMP system. */
  validatedForRRBONMP: boolean;
  /** Calibration condition attached to the result. */
  pilotCalibrationStatus: string;
  /** Applied calibration factor; unity is explicitly uncalibrated. */
  calibrationFactor: number | null;
  /** States whether values are local or the current uniform/inlet model extension. */
  localAxialApplication: string;
  /**
   * Immutable direct-turbulence calculation and C-range sensitivity record.
   * Present only for the separately named direct-turbulence preliminary route.
   */
  directTurbulence?: {
    equation: 'd32 = C * (gamma / rho_c)^0.6 * epsilon^-0.4';
    epsilon_m2_s3: number;
    powerNumber_Ne: number;
    rotorSpeed_s: number;
    rotorDiameter_m: number;
    rotorVolume_m3: number;
    gamma_N_m: number;
    rho_c_kg_m3: number;
    C_nominal: number;
    C_min: 0.36;
    C_max: 0.43;
    C_rangeEvidenceStatus: 'PROJECT_CONTROLLED__AUTHORITATIVE_SOURCE_NOT_VERIFIED';
    C_rangeDesignDecisionEligible: false;
    C_rangeEvidenceReference: string;
    d32_at_C_min_m: number;
    d32_at_C_nominal_m: number;
    d32_at_C_max_m: number;
    sourceType: string;
    sourceReference: string;
  };
}

// ── Validation helpers ─────────────────────────────────────────────────────

const TRANSCRIPTION_INVALID_ENGINEERING_BASIS =
  'Published correlation disabled — K&H 1996 transcription-invalid reconstruction';
const TRANSCRIPTION_INVALID_GOVERNANCE_STATUS =
  'kh1996_secondary_reproductions_conflict_with_legacy_reconstruction';
const UNIFORM_INLET_BASIS =
  'Thermopac model extension — uniform/inlet property basis';
export const DIRECT_TURBULENCE_C_MIN = 0.36 as const;
export const DIRECT_TURBULENCE_C_MAX = 0.43 as const;
export const DIRECT_TURBULENCE_C_RANGE_EVIDENCE_STATUS =
  'PROJECT_CONTROLLED__AUTHORITATIVE_SOURCE_NOT_VERIFIED' as const;
export const DIRECT_TURBULENCE_C_RANGE_EVIDENCE_REFERENCE =
  'docs/ecr2-kh1996-droplet-size-evidence-verification.md § Direct-turbulence C-range verification (22 August 2026)';
const TRANSCRIPTION_INVALID_TRACEABILITY = [
  'PRIMARY_SOURCE_UNVERIFIED__KH1996',
  'TRANSCRIPTION_INVALID__LEGACY_C1_N1_AND_DIRECT_HIGH_AGITATION_TERM',
  'SECONDARY_SOURCE_CONFIRMS_RECIPROCAL_HIGH_AGITATION_STRUCTURE',
  'KH1996_H_UNRESOLVED__NUMERICAL_EXECUTION_DISABLED',
  'KH1996_NUMERATOR_SYMBOL_UNRESOLVED__NUMERICAL_EXECUTION_DISABLED',
  'KH1996_PHASE_CONVENTION_NOT_PRIMARY_VERIFIED',
  'RRBO_NMP_VALIDATION_PENDING',
] as const;

function publishedGovernanceFields() {
  return {
    engineeringBasis: TRANSCRIPTION_INVALID_ENGINEERING_BASIS,
    governanceStatus: TRANSCRIPTION_INVALID_GOVERNANCE_STATUS,
    primarySourceVerified: false,
    validatedForRRBONMP: false,
    pilotCalibrationStatus: 'NOT_APPLICABLE__TRANSCRIPTION_INVALID',
    calibrationFactor: 1.0,
    localAxialApplication: `${UNIFORM_INLET_BASIS}; numerical K&H d₃₂ execution disabled`,
  };
}

function engineerGovernanceFields() {
  return {
    engineeringBasis: 'Engineer-Supplied d₃₂ — Simulator Development / Sensitivity Basis',
    governanceStatus: 'engineer_supplied_development_basis',
    primarySourceVerified: false,
    validatedForRRBONMP: false,
    pilotCalibrationStatus: 'NOT_APPLICABLE__ENGINEER_SUPPLIED_VALUE',
    calibrationFactor: null,
    localAxialApplication: 'Engineer-supplied value; local axial basis declared by source reference',
  };
}

function directTurbulenceGovernanceFields() {
  return {
    engineeringBasis:
      'DIRECT_TURBULENCE_D32_PRELIMINARY — PRELIMINARY_ENGINEERING / NOT YET PILOT_VALIDATED',
    governanceStatus:
      'preliminary_engineering_not_design_decision_eligible__authoritative_C_range_source_not_verified__direct_turbulence_d32',
    primarySourceVerified: false,
    validatedForRRBONMP: false,
    pilotCalibrationStatus: 'NOT_YET_PILOT_VALIDATED',
    calibrationFactor: 1.0,
    localAxialApplication:
      `${UNIFORM_INLET_BASIS}; ε derived from governed Stage 7 Nₑ, n, d_R, and V_R`,
  };
}

function stateLocation(state: Partial<D32LocalState>): string {
  if (state.compartmentIndex !== undefined) return `compartment ${state.compartmentIndex}`;
  if (state.z_m !== undefined) return `z = ${state.z_m.toFixed(3)} m`;
  return 'unspecified location';
}

// ── Main function ──────────────────────────────────────────────────────────

/**
 * Compute the Sauter mean droplet diameter d₃₂ (m) for one axial compartment.
 *
 * This is the single entry point for d₃₂ in the ECR-2 simulator. All downstream
 * consumers (interfacial area, Sherwood numbers, K_oa) must obtain d₃₂ through
 * this interface — never assume or hard-code a value.
 *
 * Current behaviour:
 *   · mode='published_correlation': returns a transcription-invalid,
 *     non-executable K&H 1996 result with controlled evidence diagnostics.
 *   · mode='engineer_supplied': validates the engineer's value, applies physical
 *     admissibility guards (d₃₂ > 0), and returns it with explicit labelling.
 *
 * A future primary-source verification may advance the result lifecycle, but
 * must not alter the approved equation without a governed review.
 *
 * @param localState  Local compartment hydrodynamic state (required for correlation;
 *                    can be a minimal object for engineer_supplied mode).
 * @param config      d₃₂ mode configuration.
 * @returns           D32Result with d32_m, status, label, diagnostics, provenance.
 */
export function computeDropletDiameter(
  localState: Partial<D32LocalState>,
  config: D32Config,
): D32Result {

  // ── Direct-turbulence preliminary route ───────────────────────────────────
  if (config.mode === 'direct_turbulence_preliminary') {
    const cfg = config as DirectTurbulencePreliminaryD32Config;
    const state = localState.directTurbulence;
    const missing: string[] = [];
    const finitePositive = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0;

    if (!finitePositive(localState.sigma_N_m)) missing.push('gamma_N_m');
    if (!finitePositive(localState.rho_c_kg_m3)) missing.push('rho_c_kg_m3');
    if (!state || !finitePositive(state.powerNumber_Ne)) missing.push('N_e');
    if (!state || !finitePositive(state.rotorSpeed_s)) missing.push('n');
    if (!state || !finitePositive(state.rotorDiameter_m)) missing.push('d_R');
    if (!state || !finitePositive(state.rotorVolume_m3)) missing.push('V_R');
    if (!finitePositive(cfg.C_nominal)) missing.push('C_nominal');
    if (!cfg.sourceType?.trim()) missing.push('C_nominal sourceType');
    if (!cfg.sourceReference?.trim()) missing.push('C_nominal sourceReference');

    if (missing.length > 0) {
      return {
        d32_m: null,
        d32_raw_m: null,
        status: 'input_missing',
        mode: 'direct_turbulence_preliminary',
        correlationId: 'ecr2_d32_direct_turbulence_preliminary',
        label: null,
        extrapolated: false,
        diagnostics: [
          `DIRECT_TURBULENCE_D32_PRELIMINARY cannot calculate d₃₂ at ${stateLocation(localState)}; missing/invalid: ${missing.join(', ')}.`,
          'The route requires temperature-matched γ and ρ_c plus governed Stage 7 Nₑ, n, d_R, and V_R.',
        ],
        provenance:
          'Direct-turbulence preliminary route blocked. No nominal C or hydraulic input is silently inferred.',
        engineerSource: null,
        ...directTurbulenceGovernanceFields(),
      };
    }

    if (cfg.C_nominal < DIRECT_TURBULENCE_C_MIN || cfg.C_nominal > DIRECT_TURBULENCE_C_MAX) {
      return {
        d32_m: null,
        d32_raw_m: null,
        status: 'calculation_invalid',
        mode: 'direct_turbulence_preliminary',
        correlationId: 'ecr2_d32_direct_turbulence_preliminary',
        label: null,
        extrapolated: false,
        diagnostics: [
          `Selected nominal C = ${cfg.C_nominal} is outside the governed preliminary sensitivity interval [${DIRECT_TURBULENCE_C_MIN}, ${DIRECT_TURBULENCE_C_MAX}].`,
          'No midpoint or alternative nominal C is substituted.',
        ],
        provenance:
          'Direct-turbulence preliminary route rejected because selected nominal C is outside the controlled sensitivity interval.',
        engineerSource: null,
        ...directTurbulenceGovernanceFields(),
      };
    }

    const epsilon = state.powerNumber_Ne
      * Math.pow(state.rotorSpeed_s, 3)
      * Math.pow(state.rotorDiameter_m, 5)
      / state.rotorVolume_m3;
    const hydrodynamicScale = Math.pow(localState.sigma_N_m! / localState.rho_c_kg_m3!, 0.6)
      * Math.pow(epsilon, -0.4);
    const d32Nominal = cfg.C_nominal * hydrodynamicScale;
    const d32Min = DIRECT_TURBULENCE_C_MIN * hydrodynamicScale;
    const d32Max = DIRECT_TURBULENCE_C_MAX * hydrodynamicScale;

    if (![epsilon, hydrodynamicScale, d32Nominal, d32Min, d32Max].every(finitePositive)) {
      return {
        d32_m: null,
        d32_raw_m: Number.isFinite(d32Nominal) ? d32Nominal : null,
        status: 'calculation_invalid',
        mode: 'direct_turbulence_preliminary',
        correlationId: 'ecr2_d32_direct_turbulence_preliminary',
        label: null,
        extrapolated: false,
        diagnostics: ['DIRECT_TURBULENCE_D32_PRELIMINARY produced a non-physical epsilon or d₃₂ result.'],
        provenance:
          'Direct-turbulence preliminary route rejected by finite-positive output guard; no clamping applied.',
        engineerSource: null,
        ...directTurbulenceGovernanceFields(),
      };
    }

    return {
      d32_m: d32Nominal,
      d32_raw_m: d32Nominal,
      status: 'calculated_preliminary',
      mode: 'direct_turbulence_preliminary',
      correlationId: 'ecr2_d32_direct_turbulence_preliminary',
      label: 'DIRECT_TURBULENCE_D32_PRELIMINARY — PRELIMINARY_ENGINEERING / NOT YET PILOT_VALIDATED',
      extrapolated: false,
      diagnostics: [
        'This is a separate direct-turbulence preliminary d₃₂ route; it is NOT the verified K&H 1996 equation.',
        'C range [0.36, 0.43] is project-controlled sensitivity only: no authoritative source verifies this interval for this exact route in a Kühni or RRBO/NMP system.',
        'The nominal-C source reference records the selected value only; this result is not design-decision or release eligible pending authoritative range evidence and pilot validation.',
      ],
      provenance:
        `d₃₂ = C·(γ/ρ_c)^0.6·ε^-0.4, ε = Nₑ·n³·d_R⁵/V_R. ` +
        `Selected C=${cfg.C_nominal} (${cfg.sourceType}: ${cfg.sourceReference}); ` +
        `sensitivity C=[${DIRECT_TURBULENCE_C_MIN}, ${DIRECT_TURBULENCE_C_MAX}]. ` +
        'DIRECT_TURBULENCE_D32_PRELIMINARY — PRELIMINARY_ENGINEERING / NOT YET PILOT_VALIDATED. ' +
        `${DIRECT_TURBULENCE_C_RANGE_EVIDENCE_STATUS}; Not K&H 1996, not design-decision eligible, and not pilot-validated for RRBO/NMP.`,
      engineerSource: null,
      directTurbulence: {
        equation: 'd32 = C * (gamma / rho_c)^0.6 * epsilon^-0.4',
        epsilon_m2_s3: epsilon,
        powerNumber_Ne: state.powerNumber_Ne,
        rotorSpeed_s: state.rotorSpeed_s,
        rotorDiameter_m: state.rotorDiameter_m,
        rotorVolume_m3: state.rotorVolume_m3,
        gamma_N_m: localState.sigma_N_m!,
        rho_c_kg_m3: localState.rho_c_kg_m3!,
        C_nominal: cfg.C_nominal,
        C_min: DIRECT_TURBULENCE_C_MIN,
        C_max: DIRECT_TURBULENCE_C_MAX,
        C_rangeEvidenceStatus: DIRECT_TURBULENCE_C_RANGE_EVIDENCE_STATUS,
        C_rangeDesignDecisionEligible: false,
        C_rangeEvidenceReference: DIRECT_TURBULENCE_C_RANGE_EVIDENCE_REFERENCE,
        d32_at_C_min_m: d32Min,
        d32_at_C_nominal_m: d32Nominal,
        d32_at_C_max_m: d32Max,
        sourceType: cfg.sourceType,
        sourceReference: cfg.sourceReference,
      },
      ...directTurbulenceGovernanceFields(),
    };
  }

  // ── Engineer-supplied mode ───────────────────────────────────────────────
  if (config.mode === 'engineer_supplied') {
    const cfg = config as EngineerSuppliedD32Config;
    const diagnostics: string[] = [];

    // Value validation
    if (!Number.isFinite(cfg.value_m) || cfg.value_m <= 0) {
      return {
        d32_m: null,
        d32_raw_m: Number.isFinite(cfg.value_m) ? cfg.value_m : null,
        status: 'calculation_invalid',
        mode: 'engineer_supplied',
        correlationId: null,
        label: null,
        extrapolated: false,
        diagnostics: ['Engineer-supplied d₃₂ value must be a finite positive number (m).'],
        provenance: 'Engineer-supplied value rejected — failed physical admissibility guard (d₃₂ > 0).',
        engineerSource: { sourceType: cfg.sourceType, sourceReference: cfg.sourceReference },
        ...engineerGovernanceFields(),
      };
    }

    if (!cfg.sourceType || !cfg.sourceType.trim()) {
      diagnostics.push('WARNING: sourceType is empty — engineer-supplied d₃₂ should carry an explicit source type.');
    }
    if (!cfg.sourceReference || !cfg.sourceReference.trim()) {
      diagnostics.push('WARNING: sourceReference is empty — engineer-supplied d₃₂ should carry an explicit source reference.');
    }

    // Plausibility advisory (not a blocker — do not clamp)
    const d32_mm = cfg.value_m * 1000;
    if (d32_mm < 0.1) {
      diagnostics.push(
        `ADVISORY: d₃₂ = ${d32_mm.toFixed(3)} mm is below the typical Kühni range (0.5–5 mm). ` +
        'Verify the supplied value. Not clamped — engineer basis accepted as supplied.'
      );
    }
    if (d32_mm > 10) {
      diagnostics.push(
        `ADVISORY: d₃₂ = ${d32_mm.toFixed(2)} mm is above the typical Kühni range (0.5–5 mm). ` +
        'Verify the supplied value. Not clamped — engineer basis accepted as supplied.'
      );
    }

    return {
      d32_m: cfg.value_m,
      d32_raw_m: cfg.value_m,
      status: 'engineer_supplied',
      mode: 'engineer_supplied',
      correlationId: null,
      label: 'Engineer-Supplied d₃₂ — Simulator Development / Sensitivity Basis',
      extrapolated: false,
      diagnostics,
      provenance:
        `Engineer-supplied d₃₂: ${cfg.value_m * 1000} mm. ` +
        `Source type: ${cfg.sourceType || '(not specified)'}. ` +
        `Reference: ${cfg.sourceReference || '(not specified)'}. ` +
        'NOT a published correlation result. For simulator development and sensitivity testing only. ' +
        'All downstream outputs (a, k_c, k_d, K_oa) carry the same engineer-basis label.',
      engineerSource: {
        sourceType: cfg.sourceType,
        sourceReference: cfg.sourceReference,
      },
      ...engineerGovernanceFields(),
    };
  }

  // ── Published correlation mode ────────────────────────────────────────────
  if (config.mode === 'published_correlation') {
    const location = stateLocation(localState);
    return {
      d32_m: null,
      d32_raw_m: null,
      status: 'transcription_invalid',
      mode: 'published_correlation',
      correlationId: 'ecr2_d32_kh1996',
      label: null,
      extrapolated: false,
      diagnostics: [
        `K&H 1996 d₃₂ at ${location} is not calculated: the former reconstruction is transcription-invalid.`,
        'Rahimpour et al. (2024), Table 1 (explicitly “Pulse and karr”), and Laitinen et al. (2019), Eq. (3) (Kühni-specific), both show a reciprocal high-agitation contribution; the legacy implementation directly added that contribution.',
        'Laitinen confirms ψ is mechanical power dissipation per unit mass (W/kg), but neither independent secondary reproduction resolves H or the numerator symbol sufficiently for numerical execution.',
        ...TRANSCRIPTION_INVALID_TRACEABILITY,
      ],
      provenance:
        'K&H 1996 published-correlation route disabled. The former C₁^n₁/direct-Term₂ reconstruction produced legacy outputs including approximately 10.299 m, but is incompatible with independently reproduced reciprocal high-agitation structure. ' +
        'No corrected numerical d₃₂ is asserted until H, numerator symbol, coefficient mapping, phase convention, and applicability are independently resolved.',
      engineerSource: null,
      ...publishedGovernanceFields(),
    };
  }

  // Exhaustive check — TypeScript should prevent reaching here
  const _exhaustive: never = config;
  return _exhaustive;
}

// ── Usability guard ────────────────────────────────────────────────────────

/**
 * True when a D32Result can be consumed by downstream modules
 * (interfacial area, Sherwood numbers, K_oa).
 *
 * A result is usable when:
 *   · d32_m is a finite positive number, AND
   *   · status is 'calculated', 'calculated_extrapolated', or
   *     'engineer_supplied'
 *
 * 'correlation_unresolved', 'calculation_invalid', and 'input_missing' are NOT usable.
 */
export function isD32Usable(result: D32Result): result is D32Result & { d32_m: number } {
  return (
    result.d32_m !== null &&
    Number.isFinite(result.d32_m) &&
    result.d32_m > 0 &&
    (
       result.status === 'calculated' ||
      result.status === 'calculated_extrapolated' ||
       result.status === 'calculated_preliminary' ||
      result.status === 'engineer_supplied'
    )
  );
}

// ── Driving-force contract (Phase 2 interface stub) ───────────────────────

/**
 * Per-component driving force for mass transfer.
 *
 * The rate-based simulator requires, for each component i:
 *   ΔC_i = (C_i_actual − C_i_equilibrium)
 *
 * The equilibrium composition C_i* comes from the NRTL flash at local T and
 * local phase compositions. This interface stub defines the contract that the
 * driving-force computation must satisfy when the BVP is implemented.
 *
 * NOT YET IMPLEMENTED. Defined here to anchor the interface contract before
 * the BVP is built, per section 6 of the simulator specification.
 *
 * Component index convention (frozen):
 *   0 = Saturates, 1 = Mono-aromatics, 2 = Di-aromatics, 3 = Poly-aromatics
 *   4 = NMP (solvent — no driving-force transfer)
 */
export interface ComponentDrivingForce {
  /** Component index (0–3; NMP is not transferred). */
  componentIndex: 0 | 1 | 2 | 3;
  /** Local raffinate-phase mole fraction x_i at this compartment. */
  x_actual: number;
  /** Equilibrium raffinate-phase mole fraction x_i* from NRTL flash. */
  x_equilibrium: number;
  /** Local extract-phase mole fraction y_i at this compartment. */
  y_actual: number;
  /** Equilibrium extract-phase mole fraction y_i* from NRTL flash. */
  y_equilibrium: number;
  /**
   * Driving force expressed in the continuous phase (NMP side).
   * ΔC_c,i = (x_i* − x_i) × C_c_total [mol/m³].
   * Positive when transfer from dispersed (RRBO) to continuous (NMP).
   */
  drivingForce_continuous_mol_m3: number;
  /** Partition coefficient K_d,i = y_i* / x_i* (dispersed/continuous, from NRTL). */
  K_d_partition: number;
}

/**
 * Stub interface for the driving-force computation contract.
 *
 * To be implemented when the BVP is built. The BVP will call this function
 * at each compartment to obtain per-component driving forces.
 *
 * @param x_raffinate  Local raffinate mole fractions [5-component].
 * @param y_extract    Local extract mole fractions [5-component].
 * @param T_K          Local temperature (K).
 * @returns            Driving forces for components 0–3 (NMP excluded).
 */
export type ComputeDrivingForce = (
  x_raffinate: [number, number, number, number, number],
  y_extract: [number, number, number, number, number],
  T_K: number,
) => ComponentDrivingForce[];

/**
 * Placeholder that signals the driving-force contract is defined but the BVP
 * is not yet implemented. Returns an empty array.
 *
 * Replace this with the actual NRTL-flash-driven implementation when building
 * the BVP in a future phase.
 */
export const drivingForceContractDefined = true;
export const drivingForceContractNote =
  'Driving-force interface contract is defined (ComponentDrivingForce, ComputeDrivingForce). ' +
  'Not yet implemented — requires BVP and NRTL flash at each compartment. ' +
  'Per section 6 of the simulator specification: x₅ pseudo-components; ' +
  'NRTL provides local equilibrium; per-component driving force (x_i − x_i*) with ' +
  'K_d,i from NRTL flash. Do not use an arbitrary lumped driving force.';
