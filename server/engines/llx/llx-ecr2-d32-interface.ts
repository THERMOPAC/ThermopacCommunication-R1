// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — d₃₂ Plug-In Interface
//
// Defines the contract through which a droplet diameter enters the ECR-2
// simulator. Two modes are supported:
//
//   'published_correlation'  — K&H 1996 (ecr2_d32_kh1996), implemented as an
//                              approved preliminary-engineering reconstruction.
//
//   'engineer_supplied'      — Explicit engineer-supplied d₃₂ for simulator
//                              development and sensitivity testing ONLY.
//                              Must carry source type and reference. Outputs are
//                              labelled "Engineer-Supplied d₃₂ — Simulator
//                              Development / Sensitivity Basis".
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
 * 'published_correlation' — use the approved K&H 1996 preliminary-engineering
 *                           reconstruction. This remains explicitly unverified
 *                           against the primary source and RRBO/NMP pilot data.
 * 'engineer_supplied'     — engineer provides d₃₂ explicitly for development/
 *                           sensitivity testing. Not a published model result.
 */
export type D32Mode = 'published_correlation' | 'engineer_supplied';

/** Status of the d₃₂ computation result. */
export type D32Status =
  | 'preliminary_engineering_reconstruction'
                               // approved K&H 1996 reconstruction; traceability warnings required
  | 'calculated'              // reserved for a fully governed published correlation
  | 'calculated_extrapolated' // from resolved correlation but outside validity range
  | 'engineer_supplied'       // explicit engineer input, labelled accordingly
  | 'phase_configuration_unsupported'
                               // published K&H 1996 reconstruction not approved for selected continuity
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
 * The preliminary reconstruction uses C₁^n₁ (with n₁ applied once) and
 * [h·(ρcg/γ)^0.5]^n₃. It is not primary-source verified, RRBO/NMP validated,
 * or pilot calibrated; every result carries those traceability warnings.
 */
export interface PublishedCorrelationD32Config {
  mode: 'published_correlation';
  /** Registry correlation ID. Must be 'ecr2_d32_kh1996'. */
  correlationId: 'ecr2_d32_kh1996';
}

/** Union type — one of the two supported d₃₂ configurations. */
export type D32Config = EngineerSuppliedD32Config | PublishedCorrelationD32Config;

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
}

// ── Result type ────────────────────────────────────────────────────────────

/**
 * Result of computeDropletDiameter().
 *
 * d32_m is non-null only when status is preliminary, calculated,
 * calculated_extrapolated, or engineer_supplied.
 *
 * Status 'correlation_unresolved' is reserved for a future unapproved
 * correlation; the K&H 1996 preliminary path remains explicitly traceable.
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
}

// ── Validation helpers ─────────────────────────────────────────────────────

const GRAVITY_M_S2 = 9.80665;
const KH1996_PRELIMINARY = {
  C1_d_to_c: 3.04,
  C2: 1.60,
  C3: 0.034,
  n1: 0.45,
  n2: -0.63,
  n3: -0.38,
} as const;

const PRELIMINARY_ENGINEERING_BASIS =
  'Published Correlation — Preliminary Engineering';
const PRELIMINARY_GOVERNANCE_STATUS =
  'K&H 1996 reconstructed pending primary-source verification';
const UNIFORM_INLET_BASIS =
  'Thermopac model extension — uniform/inlet property basis';
const PRELIMINARY_TRACEABILITY_WARNINGS = [
  'PRIMARY_SOURCE_UNVERIFIED__KH1996',
  'NUMERATOR_RECONSTRUCTION__C1_N1',
  'GEOMETRY_RECONSTRUCTION__CAPILLARY_LENGTH_GROUP',
  'KH1996_PHASE_CONVENTION_NOT_PRIMARY_VERIFIED',
  'RRBO_NMP_VALIDATION_PENDING',
] as const;

function publishedGovernanceFields() {
  return {
    engineeringBasis: PRELIMINARY_ENGINEERING_BASIS,
    governanceStatus: PRELIMINARY_GOVERNANCE_STATUS,
    primarySourceVerified: false,
    validatedForRRBONMP: false,
    pilotCalibrationStatus: 'NOT_YET_CALIBRATED__UNITY_BASIS',
    calibrationFactor: 1.0,
    localAxialApplication: UNIFORM_INLET_BASIS,
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
 *   · mode='published_correlation': evaluates the approved K&H 1996
 *     preliminary-engineering reconstruction and carries traceability warnings.
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
    const h = localState.h_comp_m;
    const psi = localState.psi_W_kg;
    const rhoC = localState.rho_c_kg_m3;
    const rhoD = localState.rho_d_kg_m3;
    const gamma = localState.sigma_N_m;
    const requiredInputs: Array<[string, number | undefined]> = [
      ['h_comp_m', h],
      ['psi_W_kg', psi],
      ['rho_c_kg_m3', rhoC],
      ['rho_d_kg_m3', rhoD],
      ['sigma_N_m (gamma)', gamma],
    ];
    const missing = requiredInputs
      .filter(([, value]) => value === undefined || value === null)
      .map(([name]) => name);

    if (missing.length > 0) {
      return {
        d32_m: null,
        d32_raw_m: null,
        status: 'input_missing',
        mode: 'published_correlation',
        correlationId: 'ecr2_d32_kh1996',
        label: null,
        extrapolated: false,
        diagnostics: [
          `K&H 1996 preliminary d₃₂ reconstruction at ${location}: required input(s) missing: ${missing.join(', ')}.`,
          ...PRELIMINARY_TRACEABILITY_WARNINGS,
        ],
        provenance:
          'K&H 1996 preliminary-engineering reconstruction not calculated — required numerical inputs are absent. ' +
          'No NMP/RRBO interfacial tension is invented.',
        engineerSource: null,
        ...publishedGovernanceFields(),
      };
    }

    const values = [h!, psi!, rhoC!, rhoD!, gamma!];
    if (!values.every(Number.isFinite)) {
      return {
        d32_m: null,
        d32_raw_m: null,
        status: 'calculation_invalid',
        mode: 'published_correlation',
        correlationId: 'ecr2_d32_kh1996',
        label: null,
        extrapolated: false,
        diagnostics: [
          `K&H 1996 preliminary d₃₂ reconstruction at ${location}: all numerical inputs must be finite.`,
          ...PRELIMINARY_TRACEABILITY_WARNINGS,
        ],
        provenance: 'K&H 1996 preliminary-engineering reconstruction rejected — non-finite numerical input.',
        engineerSource: null,
        ...publishedGovernanceFields(),
      };
    }

    const numerator = Math.pow(KH1996_PRELIMINARY.C1_d_to_c, KH1996_PRELIMINARY.n1);
    const deltaRho = rhoC! - rhoD!;
    const term1 = KH1996_PRELIMINARY.C2 * Math.sqrt(
      gamma! / (deltaRho * GRAVITY_M_S2 * h! * h!),
    );
    const agitationGroup = (psi! / GRAVITY_M_S2)
      * Math.pow(rhoC! / (GRAVITY_M_S2 * gamma!), 0.25);
    const geometryGroup = h! * Math.sqrt((rhoC! * GRAVITY_M_S2) / gamma!);
    const term2 = KH1996_PRELIMINARY.C3
      * Math.pow(agitationGroup, KH1996_PRELIMINARY.n2)
      * Math.pow(geometryGroup, KH1996_PRELIMINARY.n3);
    const denominator = term1 + term2;
    const rawCandidate = h! * numerator / denominator;
    const d32Raw = Number.isFinite(rawCandidate) ? rawCandidate : null;

    const invalid: string[] = [];
    if (h! <= 0) invalid.push('h_comp_m must be > 0 (m)');
    if (psi! <= 0) invalid.push('psi_W_kg must be > 0 (W/kg)');
    if (rhoC! <= 0) invalid.push('rho_c_kg_m3 must be > 0 (kg/m³)');
    if (rhoD! <= 0) invalid.push('rho_d_kg_m3 must be > 0 (kg/m³)');
    if (gamma! <= 0) invalid.push('sigma_N_m (gamma) must be > 0 (N/m)');
    if (rhoC! <= rhoD!) invalid.push('rho_c_kg_m3 must be > rho_d_kg_m3 (NMP continuous phase must be denser)');
    if (!Number.isFinite(denominator) || denominator <= 0)
      invalid.push(`denominator must be finite and > 0 (received ${denominator})`);
    if (!Number.isFinite(rawCandidate) || rawCandidate <= 0)
      invalid.push(`d32_raw_m must be finite and > 0 (received ${rawCandidate})`);

    if (invalid.length > 0) {
      return {
        d32_m: null,
        d32_raw_m: d32Raw,
        status: 'calculation_invalid',
        mode: 'published_correlation',
        correlationId: 'ecr2_d32_kh1996',
        label: null,
        extrapolated: false,
        diagnostics: [
          `K&H 1996 preliminary d₃₂ reconstruction at ${location}: ${invalid.join('; ')}. No value was clamped.`,
          ...PRELIMINARY_TRACEABILITY_WARNINGS,
        ],
        provenance:
          `K&H 1996 preliminary-engineering reconstruction rejected by physical/numerical guard. ` +
          `Raw d₃₂ retained when finite: ${d32Raw === null ? 'not calculable' : `${d32Raw} m`}.`,
        engineerSource: null,
        ...publishedGovernanceFields(),
      };
    }

    return {
      d32_m: d32Raw,
      d32_raw_m: d32Raw,
      status: 'preliminary_engineering_reconstruction',
      mode: 'published_correlation',
      correlationId: 'ecr2_d32_kh1996',
      label: PRELIMINARY_ENGINEERING_BASIS,
      extrapolated: false,
      diagnostics: [
        ...PRELIMINARY_TRACEABILITY_WARNINGS,
        `C₁^n₁ = ${KH1996_PRELIMINARY.C1_d_to_c}^${KH1996_PRELIMINARY.n1} = ${numerator.toFixed(9)} (n₁ applied once).`,
        `d₃₂_raw = h·C₁^n₁/(Term₁ + Term₂) = ${d32Raw!.toExponential(8)} m.`,
        `Local application: ${UNIFORM_INLET_BASIS}.`,
        'Calibration factor = 1.0 on an explicit NOT_YET_CALIBRATED__UNITY_BASIS; it is not a validated calibration.',
      ],
      provenance:
        'K&H 1996 Kühni d₃₂ preliminary reconstruction: ' +
        'd₃₂/h = C₁^n₁ / [C₂·(γ/((ρc−ρd)gh²))^0.5 + ' +
        'C₃·((ψ/g)·(ρc/(gγ))^0.25)^n₂·(h·(ρcg/γ)^0.5)^n₃]. ' +
        'RRBO = dispersed, NMP = continuous, so C₁(d→c)=3.04. ' +
        'Not primary-source verified, RRBO/NMP validated, or pilot calibrated.',
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
 *   · status is 'preliminary_engineering_reconstruction', 'calculated',
 *     'calculated_extrapolated', or 'engineer_supplied'
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
      result.status === 'preliminary_engineering_reconstruction' ||
      result.status === 'calculated_extrapolated' ||
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
