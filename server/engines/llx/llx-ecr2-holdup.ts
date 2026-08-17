// ═══════════════════════════════════════════════════════════════════════════════
// ECR-2 K&H 1995 Kühni Dispersed-Phase Holdup Correlation
//
// Implements Laitinen et al. (2019), Eqs (1)–(2), which reproduce:
//   Kumar, A. & Hartland, S. (1995).
//   "A Unified Correlation for the Prediction of Dispersed-Phase Hold-Up
//   in Liquid-Liquid Extraction Columns."
//   Industrial & Engineering Chemistry Research, 34(11), 3925–3940.
//   DOI: 10.1021/ie00038a032
//
// Secondary source (this reproduction):
//   Laitinen, A. et al. (2019).
//   Chemical Engineering Research and Design, 146, 518–527.
//   DOI: 10.1016/j.cherd.2019.04.018
//
// Registry status: secondary_equation_verified
//   All 8 Kühni constants are assigned to exact equation terms.
//   Dimensional verification complete (θ, Ud·θ, Uc·θ, ψθ/g all dimensionless ✓).
//   primarySourceVerified = false — K&H 1995 primary paper not yet read.
//
// ── GOVERNANCE ──────────────────────────────────────────────────────────────
//
//   engineeringBasis = 'Published Correlation — Preliminary Engineering'
//   primarySourceVerified = false
//   validatedForRRBONMP   = false
//
//   These flags record the state of verification — they do NOT suppress a
//   mathematically valid result.  phi = null is only set when the calculation
//   itself fails (calculation_invalid) or the empirical output is
//   physically inadmissible (physically_invalid).
//
//   Results are appropriate for preliminary engineering sizing.
//   They must NOT be used for design-basis commitments or performance
//   guarantees until primarySourceVerified = true.
//
// ── SCOPE ───────────────────────────────────────────────────────────────────
//
//   This file implements holdup ONLY.
//   Do NOT add d₃₂, mass-transfer, BVP, flooding, or optimizer here.
//
// ── PHASE MAPPING (ECR-2 governance-fixed) ─────────────────────────────────
//
//   Continuous phase = NMP  (heavy, downward)   → Uc, ρc, rho_c
//   Dispersed phase  = RRBO (light, upward)      → Ud, ρd, rho_d
//
// ── EQUATION ────────────────────────────────────────────────────────────────
//
//   Eq. (2):  θ = (ρc / (g · γ))^0.25             [s/m]
//
//   Eq. (1):  φ = [2.67×10⁻² + (ψθ/g)^0.77]
//                 · (Ud·θ)^0.64
//                 · [exp(20.7·Uc·θ)]^0.90
//                 · ((ρc − ρd)/ρc)^(−0.34)
//                 · 2.27 · xf^(−0.77)
//
//   All dimensionless products verified:
//     θ [s/m]: (s⁴/m⁴)^0.25 = s/m ✓
//     Ud·θ:    [m/s]·[s/m] = − ✓
//     Uc·θ:    [m/s]·[s/m] = − ✓
//     ψθ/g:    [m²/s³]·[s/m]/[m/s²] = − ✓
//
// ── ψ DEFINITION ────────────────────────────────────────────────────────────
//
//   Current implementation: ψ = (P/V) / ρ_mix [W/kg]
//   where P/V = N_P·N³·D_R⁵ / (A_col·h_comp) [W/m³]
//
//   The exact mass basis of ψ (total liquid, continuous, or dispersed)
//   is NOT explicitly stated in the secondary source (Laitinen 2019).
//   Primary K&H 1995 paper not yet read.
//   psiBasis = 'Thermopac preliminary interpretation — specific mechanical
//               power dissipation'
//   This does NOT block calculation.
//
// ── AXIAL APPLICATION ───────────────────────────────────────────────────────
//
//   K&H 1995 is an empirical whole-column correlation.
//   Applying it independently at local axial states is a Thermopac modelling
//   extension.  localAxialApplication = 'Thermopac model extension'.
//   This does NOT block calculation.
//
// ── DOWNSTREAM USABILITY RULE ───────────────────────────────────────────────
//
//   ECR-2 modules (d₃₂, K_oa, BVP, optimizer) MAY consume holdup when:
//     result.status ∈ { 'calculated', 'calculated_extrapolated' }
//     result.phi    !== null
//
//   They MUST NOT consume holdup when:
//     result.status ∈ { 'input_missing', 'calculation_invalid', 'physically_invalid' }
//
//   Use the exported isHoldupUsable() guard to enforce this contract.
//
// ═══════════════════════════════════════════════════════════════════════════════

/** Gravitational acceleration (m/s²). Fixed physical constant. */
const G = 9.80665;

// ── Applicability ranges — diagnostic metadata only ───────────────────────────
//
// These ranges are recorded PURELY as engineering reference.  They do NOT block
// calculation.  Exceeding a range changes the result status from 'calculated'
// to 'calculated_extrapolated' and populates extrapolatedRanges.
//
// SOURCE CLASSIFICATION for each range:
//
//   Ud_m_s   → source_not_verified
//     Note: claimed as Kühni dataset range from K&H 1995 / Laitinen 2019.
//     K&H 1995 primary paper not yet read.  Laitinen 2019 is a secondary
//     reproduction; it does not explicitly tabulate the training data envelope.
//
//   Uc_m_s   → source_not_verified
//     Same basis as Ud_m_s.
//
//   psi_W_kg → source_not_verified
//     Stated as agitated-column range; ψ basis is itself unresolved
//     (Thermopac preliminary).  No primary citation.
//
//   gamma_N_m → source_not_verified
//     Claimed as organic–aqueous system range from K&H 1995 database.
//     K&H 1995 primary not yet read.
//
//   xf → source_not_verified
//     Derived from Laitinen ECR60/50G geometry (xf = 0.30).  No explicit
//     published training range for xf confirmed in either source.

/** Source classification for an applicability range. */
export type ApplicabilityRangeSource =
  | 'published_primary'
  | 'published_secondary'
  | 'derived_from_published_data'
  | 'thermopac_preliminary'
  | 'source_not_verified';

/** Applicability range entry — diagnostic metadata. */
export interface ApplicabilityRange {
  min: number;
  max: number;
  unit: string;
  /** How this range bound was determined. */
  source: ApplicabilityRangeSource;
  /** Human-readable description of the source claim. */
  sourceNote: string;
}

const DIAGNOSTIC_RANGES: Record<string, ApplicabilityRange> = {
  Ud_m_s: {
    min: 0.0005,
    max: 0.02,
    unit: 'm/s',
    source: 'source_not_verified',
    sourceNote:
      'Claimed Kühni training-dataset range (K&H 1995 / Laitinen 2019). ' +
      'K&H 1995 primary not yet read; Laitinen 2019 does not tabulate training envelope.',
  },
  Uc_m_s: {
    min: 0.0005,
    max: 0.02,
    unit: 'm/s',
    source: 'source_not_verified',
    sourceNote:
      'Same basis as Ud_m_s. Source not verified against primary paper.',
  },
  psi_W_kg: {
    min: 0.05,
    max: 50,
    unit: 'W/kg',
    source: 'source_not_verified',
    sourceNote:
      'Agitated-column operating range. ψ mass basis is unresolved ' +
      '(Thermopac preliminary interpretation). No primary citation confirmed.',
  },
  gamma_N_m: {
    min: 0.001,
    max: 0.045,
    unit: 'N/m',
    source: 'source_not_verified',
    sourceNote:
      'Claimed organic–aqueous system range from K&H 1995 database. ' +
      'K&H 1995 primary not yet read.',
  },
  xf: {
    min: 0.10,
    max: 0.50,
    unit: '−',
    source: 'source_not_verified',
    sourceNote:
      'Derived from Laitinen ECR60/50G geometry (xf = 0.30). ' +
      'No explicit published training range for xf confirmed in either source.',
  },
};

// ── Input/output types ────────────────────────────────────────────────────────

export interface HoldupInputs {
  /** Mechanical power dissipation per unit mass ψ (W/kg = m²/s³). */
  psi_W_kg: number;
  /** Dispersed-phase (RRBO) superficial velocity Ud = Q_RRBO / A_col (m/s). */
  Ud_m_s: number;
  /** Continuous-phase (NMP) superficial velocity Uc = Q_NMP / A_col (m/s). */
  Uc_m_s: number;
  /** Continuous-phase (NMP) density ρc (kg/m³). */
  rho_c_kg_m3: number;
  /** Dispersed-phase (RRBO) density ρd (kg/m³). */
  rho_d_kg_m3: number;
  /** NMP/RRBO interfacial tension γ (N/m). Must be in SI — do not pass mN/m. */
  gamma_N_m: number;
  /** Stator fractional free cross-sectional area xf (−). */
  xf: number;
}

/** Single applicability check result for one input variable. */
export interface ApplicabilityCheckItem {
  value: number;
  min: number;
  max: number;
  unit: string;
  source: ApplicabilityRangeSource;
  sourceNote: string;
  withinRange: boolean;
  /** True only when withinRange = false and the result is calculated_extrapolated. */
  extrapolated: boolean;
}

/** Governance metadata — fixed for this implementation. */
export interface HoldupGovernance {
  /**
   * Records that the secondary-source equation is accepted as the current
   * preliminary engineering basis.  Does NOT suppress a valid result.
   */
  engineeringBasis: 'Published Correlation — Preliminary Engineering';
  governanceStatus: 'UNVERIFIED — pending primary source';
  source: 'Kumar & Hartland (1995) via Laitinen et al. (2019) secondary reproduction';
  registryId: 'ecr2_holdup_kh1995';
  correlationStatus: 'secondary_equation_verified';
  /**
   * K&H 1995 primary paper not yet read.
   * Does NOT force phi = null.
   */
  primarySourceVerified: false;
  /**
   * Correlation not calibrated against RRBO/NMP pilot or vendor data.
   * Does NOT force phi = null.
   */
  validatedForRRBONMP: false;
  phaseMapping: 'NMP=continuous (ρc, Uc) | RRBO=dispersed (ρd, Ud)';
  /**
   * The exact mass basis of ψ is unresolved in available secondary sources.
   * Current implementation uses ψ = (P/V)/ρ_mix (total liquid basis).
   * Does NOT block calculation.
   */
  psiBasis: 'Thermopac preliminary interpretation — specific mechanical power dissipation';
  /**
   * Applying K&H 1995 (whole-column empirical) at local axial states is
   * a Thermopac modelling extension.
   * Does NOT block calculation.
   */
  localAxialApplication: 'Thermopac model extension';
  /**
   * ── DOWNSTREAM USABILITY RULE ─────────────────────────────────────────
   * ECR-2 modules MUST check isHoldupUsable(result) before consuming phi.
   * Usable statuses: 'calculated', 'calculated_extrapolated' (phi !== null).
   * Non-usable statuses: 'input_missing', 'calculation_invalid', 'physically_invalid'.
   */
  downstreamUsabilityRule:
    "consume phi only when status ∈ {'calculated','calculated_extrapolated'} — use isHoldupUsable()";
}

const GOVERNANCE: HoldupGovernance = {
  engineeringBasis: 'Published Correlation — Preliminary Engineering',
  governanceStatus: 'UNVERIFIED — pending primary source',
  source: 'Kumar & Hartland (1995) via Laitinen et al. (2019) secondary reproduction',
  registryId: 'ecr2_holdup_kh1995',
  correlationStatus: 'secondary_equation_verified',
  primarySourceVerified: false,
  validatedForRRBONMP: false,
  phaseMapping: 'NMP=continuous (ρc, Uc) | RRBO=dispersed (ρd, Ud)',
  psiBasis: 'Thermopac preliminary interpretation — specific mechanical power dissipation',
  localAxialApplication: 'Thermopac model extension',
  downstreamUsabilityRule:
    "consume phi only when status ∈ {'calculated','calculated_extrapolated'} — use isHoldupUsable()",
} as const;

/** Intermediate dimensionless groups and equation terms (for traceability). */
export interface HoldupIntermediates {
  /** ψθ/g — dimensionless agitation group. */
  psiTheta_over_g: number;
  /** Ud·θ — dimensionless dispersed-phase throughput group. */
  Ud_theta: number;
  /** Uc·θ — dimensionless continuous-phase throughput group. */
  Uc_theta: number;
  /** (ρc − ρd)/ρc — dimensionless density ratio. */
  density_ratio: number;
  /** [2.67×10⁻² + (ψθ/g)^0.77] — agitation bracket. */
  termA: number;
  /** (Ud·θ)^0.64 — dispersed throughput term. */
  termB: number;
  /** [exp(20.7·Uc·θ)]^0.90 — continuous throughput term. */
  termC: number;
  /** ((ρc−ρd)/ρc)^(−0.34) — density-ratio term. */
  termD: number;
  /** 2.27·xf^(−0.77) — stator geometry term. */
  termE: number;
}

// ── Result types ──────────────────────────────────────────────────────────────

/**
 * All inputs valid, all inputs within diagnostic applicability ranges.
 * phi is physically valid: 0 < phi < 1.
 * DOWNSTREAM: consumable.
 */
export interface HoldupCalculated {
  status: 'calculated';
  /** Dispersed-phase holdup φ — volume fraction (0, 1). */
  phi: number;
  /** Raw equation output (= phi when status is 'calculated'). */
  phi_raw: number;
  /** Characteristic time-length scale θ = (ρc/(g·γ))^0.25 (s/m). */
  theta_s_m: number;
  intermediates: HoldupIntermediates;
  applicabilityDiagnostics: Record<string, ApplicabilityCheckItem>;
  governance: HoldupGovernance;
}

/**
 * All inputs valid; calculation succeeded; phi physically valid (0 < phi < 1);
 * but one or more inputs exceeded a diagnostic applicability range.
 * Extrapolation outside the source dataset.  Use with engineering judgement.
 * DOWNSTREAM: consumable (caller must decide whether extrapolation is acceptable).
 */
export interface HoldupCalculatedExtrapolated {
  status: 'calculated_extrapolated';
  /** Dispersed-phase holdup φ — volume fraction (0, 1). */
  phi: number;
  /** Raw equation output (= phi when physically valid). */
  phi_raw: number;
  /** Characteristic time-length scale θ (s/m). */
  theta_s_m: number;
  intermediates: HoldupIntermediates;
  applicabilityDiagnostics: Record<string, ApplicabilityCheckItem>;
  /** Names of inputs that exceeded their diagnostic ranges. */
  extrapolatedRanges: string[];
  governance: HoldupGovernance;
}

/**
 * Required mathematical inputs were absent, non-finite, or physically
 * inconsistent (e.g. rho_c ≤ rho_d).
 * DOWNSTREAM: NOT consumable.
 */
export interface HoldupInputMissing {
  status: 'input_missing';
  phi: null;
  phi_raw: null;
  missing: string[];
}

/**
 * Inputs were valid but the calculation produced a non-finite intermediate
 * or result (NaN, ±Infinity).  This can occur at extreme operating conditions
 * where the empirical equation overflows (e.g. very high Uc causing exp() overflow).
 * DOWNSTREAM: NOT consumable.
 */
export interface HoldupCalculationInvalid {
  status: 'calculation_invalid';
  phi: null;
  /** The raw non-finite value produced by the equation — retained for diagnostics. */
  phi_raw: number;
  theta_s_m: number;
  intermediates: HoldupIntermediates;
  applicabilityDiagnostics: Record<string, ApplicabilityCheckItem>;
  extrapolatedRanges: string[];
  /** Description of the mathematical failure. */
  reason: string;
  governance: HoldupGovernance;
}

/**
 * Calculation completed but phi_raw is outside the physically admissible
 * range (0, 1).  Holdup is a volume fraction; phi_raw ≤ 0 or ≥ 1 means
 * the empirical correlation has produced a physically inadmissible prediction
 * at this operating point.  phi_raw is retained for diagnostics.
 * DOWNSTREAM: NOT consumable.
 */
export interface HoldupPhysicallyInvalid {
  status: 'physically_invalid';
  phi: null;
  /** Raw equation output — retained even though physically inadmissible. */
  phi_raw: number;
  theta_s_m: number;
  intermediates: HoldupIntermediates;
  applicabilityDiagnostics: Record<string, ApplicabilityCheckItem>;
  extrapolatedRanges: string[];
  /** phi_raw ≤ 0 or phi_raw ≥ 1 */
  physicalViolation: 'phi_raw <= 0' | 'phi_raw >= 1';
  governance: HoldupGovernance;
}

export type KH1995HoldupResult =
  | HoldupCalculated
  | HoldupCalculatedExtrapolated
  | HoldupInputMissing
  | HoldupCalculationInvalid
  | HoldupPhysicallyInvalid;

// ── Downstream usability guard ────────────────────────────────────────────────

/**
 * Returns true when the holdup result can be consumed by downstream ECR-2 modules.
 *
 * RULE: ECR-2 modules (d₃₂, K_oa, BVP, optimizer) MUST call this guard before
 * using result.phi.  Only 'calculated' and 'calculated_extrapolated' statuses
 * are usable.  Callers consuming 'calculated_extrapolated' must apply engineering
 * judgement about the extrapolation acceptability for their specific purpose.
 */
export function isHoldupUsable(
  result: KH1995HoldupResult,
): result is HoldupCalculated | HoldupCalculatedExtrapolated {
  return result.status === 'calculated' || result.status === 'calculated_extrapolated';
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Compute Kühni dispersed-phase holdup using Kumar & Hartland (1995),
 * Eqs (1)–(2) as reproduced in Laitinen et al. (2019).
 *
 * ENGINEERING BASIS: 'Published Correlation — Preliminary Engineering'
 * GOVERNANCE: primarySourceVerified = false, validatedForRRBONMP = false.
 *   These flags record verification state — they do NOT suppress valid results.
 *
 * STATUS HIERARCHY (priority order):
 *   1. input_missing        — required input absent, non-finite, or rho_c ≤ rho_d
 *   2. calculation_invalid  — intermediate or phi_raw is NaN/Infinity
 *   3. physically_invalid   — phi_raw ≤ 0 or phi_raw ≥ 1
 *   4. calculated_extrapolated — valid phi but ≥1 input outside diagnostic range
 *   5. calculated           — all inputs within diagnostic ranges, valid phi
 *
 * DOWNSTREAM: use isHoldupUsable(result) before consuming result.phi.
 *
 * @param inputs  Physical inputs — all must be in SI units as documented.
 * @returns       KH1995HoldupResult — check result.status before using result.phi.
 */
export function computeKH1995Holdup(inputs: HoldupInputs): KH1995HoldupResult {
  const { psi_W_kg, Ud_m_s, Uc_m_s, rho_c_kg_m3, rho_d_kg_m3, gamma_N_m, xf } = inputs;

  // ── 1. Guard: all inputs must be finite positive numbers ──────────────────
  const missing: string[] = [];
  const requiredPositive: [string, number][] = [
    ['psi_W_kg',    psi_W_kg],
    ['Ud_m_s',      Ud_m_s],
    ['Uc_m_s',      Uc_m_s],
    ['rho_c_kg_m3', rho_c_kg_m3],
    ['rho_d_kg_m3', rho_d_kg_m3],
    ['gamma_N_m',   gamma_N_m],
    ['xf',          xf],
  ];
  for (const [name, v] of requiredPositive) {
    if (!Number.isFinite(v) || v <= 0) missing.push(name);
  }
  if (Number.isFinite(rho_c_kg_m3) && Number.isFinite(rho_d_kg_m3) && rho_c_kg_m3 <= rho_d_kg_m3) {
    // NMP must be denser than RRBO for a physically valid density difference (ECR-2 fixed phase mapping).
    missing.push('rho_c_kg_m3 must be > rho_d_kg_m3 (NMP continuous must be denser than RRBO dispersed)');
  }
  if (missing.length > 0) {
    return { status: 'input_missing', phi: null, phi_raw: null, missing };
  }

  // ── 2. Applicability diagnostics (diagnostic only — do not block) ─────────
  const rangeInputs: [string, number][] = [
    ['Ud_m_s',    Ud_m_s],
    ['Uc_m_s',    Uc_m_s],
    ['psi_W_kg',  psi_W_kg],
    ['gamma_N_m', gamma_N_m],
    ['xf',        xf],
  ];

  const applicabilityDiagnostics: Record<string, ApplicabilityCheckItem> = {};
  const extrapolatedRanges: string[] = [];

  for (const [name, value] of rangeInputs) {
    const range = DIAGNOSTIC_RANGES[name];
    const withinRange = value >= range.min && value <= range.max;
    const extrapolated = !withinRange;
    applicabilityDiagnostics[name] = {
      value,
      min: range.min,
      max: range.max,
      unit: range.unit,
      source: range.source,
      sourceNote: range.sourceNote,
      withinRange,
      extrapolated,
    };
    if (extrapolated) extrapolatedRanges.push(name);
  }

  // ── 3. Eq. (2): characteristic time-length scale θ ───────────────────────
  //
  //   θ = (ρc / (g · γ))^0.25
  //
  //   Dimensional verification:
  //     ρc / (g · γ) = [kg/m³] / ([m/s²] · [kg/s²]) = s⁴/m⁴
  //     θ = (s⁴/m⁴)^0.25 = s/m  ✓
  //
  const theta_s_m = Math.pow(rho_c_kg_m3 / (G * gamma_N_m), 0.25);

  // ── 4. Dimensionless groups ───────────────────────────────────────────────
  const psiTheta_over_g = (psi_W_kg * theta_s_m) / G;  // (ψ·θ)/g  [−]
  const Ud_theta        = Ud_m_s * theta_s_m;           // Ud·θ     [−]
  const Uc_theta        = Uc_m_s * theta_s_m;           // Uc·θ     [−]
  const density_ratio   = (rho_c_kg_m3 - rho_d_kg_m3) / rho_c_kg_m3; // [−]

  // ── 5. Eq. (1): dispersed-phase holdup φ ─────────────────────────────────
  //
  //   φ = [2.67×10⁻² + (ψθ/g)^0.77]
  //       · (Ud·θ)^0.64
  //       · [exp(20.7·Uc·θ)]^0.90
  //       · ((ρc − ρd)/ρc)^(−0.34)
  //       · 2.27 · xf^(−0.77)
  //
  // Kühni constants: 2.67×10⁻², 0.77, 0.64, 20.7, 0.90, −0.34, 2.27, −0.77
  // All eight assigned from secondary-verified Kühni parameter table.
  //
  const termA = 0.0267 + Math.pow(psiTheta_over_g, 0.77);
  const termB = Math.pow(Ud_theta, 0.64);
  const termC = Math.pow(Math.exp(20.7 * Uc_theta), 0.90);
  const termD = Math.pow(density_ratio, -0.34);
  const termE = 2.27 * Math.pow(xf, -0.77);

  const phi_raw = termA * termB * termC * termD * termE;

  const intermediates: HoldupIntermediates = {
    psiTheta_over_g,
    Ud_theta,
    Uc_theta,
    density_ratio,
    termA,
    termB,
    termC,
    termD,
    termE,
  };

  // ── 6. Guard: mathematical validity ──────────────────────────────────────
  //
  // phi_raw can be NaN or ±Infinity at extreme operating conditions.
  // For example: very high Uc causes 20.7·Uc·θ >> 709, overflowing exp().
  // This is a calculation failure, not a physical conclusion.
  //
  if (!Number.isFinite(phi_raw)) {
    return {
      status: 'calculation_invalid',
      phi: null,
      phi_raw,
      theta_s_m,
      intermediates,
      applicabilityDiagnostics,
      extrapolatedRanges,
      reason:
        `phi_raw = ${phi_raw} — non-finite intermediate produced by the empirical equation. ` +
        'Likely cause: exp(20.7·Uc·θ) overflow at very high Uc, or zero/negative ' +
        'argument to a fractional power. Review operating conditions.',
      governance: GOVERNANCE,
    };
  }

  // ── 7. Guard: physical validity ───────────────────────────────────────────
  //
  // Holdup is a volume fraction — it must satisfy 0 < φ < 1.
  // The K&H empirical correlation is not constrained to this range.
  // phi_raw ≥ 1 means the correlation has produced a physically inadmissible
  // prediction at this operating point — it is NOT valid holdup.
  // phi_raw is retained in the result for diagnostic traceability.
  // Do NOT clamp phi_raw.
  //
  if (phi_raw <= 0) {
    return {
      status: 'physically_invalid',
      phi: null,
      phi_raw,
      theta_s_m,
      intermediates,
      applicabilityDiagnostics,
      extrapolatedRanges,
      physicalViolation: 'phi_raw <= 0',
      governance: GOVERNANCE,
    };
  }
  if (phi_raw >= 1) {
    return {
      status: 'physically_invalid',
      phi: null,
      phi_raw,
      theta_s_m,
      intermediates,
      applicabilityDiagnostics,
      extrapolatedRanges,
      physicalViolation: 'phi_raw >= 1',
      governance: GOVERNANCE,
    };
  }

  // ── 8. Valid result — inside or outside applicability ranges ─────────────
  if (extrapolatedRanges.length > 0) {
    return {
      status: 'calculated_extrapolated',
      phi: phi_raw,
      phi_raw,
      theta_s_m,
      intermediates,
      applicabilityDiagnostics,
      extrapolatedRanges,
      governance: GOVERNANCE,
    };
  }

  return {
    status: 'calculated',
    phi: phi_raw,
    phi_raw,
    theta_s_m,
    intermediates,
    applicabilityDiagnostics,
    governance: GOVERNANCE,
  };
}
