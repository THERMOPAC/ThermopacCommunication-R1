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
//   Every result carries governanceStatus = 'UNVERIFIED — pending primary source'.
//   primarySourceVerified = false.
//   validatedForRRBONMP = false.
//
//   Results MUST NOT be used for:
//     · Column sizing decisions
//     · Flooding margin calculations
//     · Performance guarantees
//     · Design basis commitments
//   until primarySourceVerified = true and status advances to 'governed'.
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
// ═══════════════════════════════════════════════════════════════════════════════

/** Gravitational acceleration (m/s²). Fixed physical constant. */
const G = 9.80665;

// ── Validity ranges (from ecr2_holdup_kh1995 registry entry) ─────────────────
// Bounds checked before calculation. Results outside these ranges trigger
// 'outside_envelope' — no silent extrapolation.

interface ApplicabilityBound {
  min: number;
  max: number;
  unit: string;
  note: string;
}

const VALIDITY: Record<string, ApplicabilityBound> = {
  Ud_m_s: {
    min: 0.0005,
    max: 0.02,
    unit: 'm/s',
    note: 'Dispersed-phase superficial velocity (Laitinen/K&H 1995 Kühni dataset range)',
  },
  Uc_m_s: {
    min: 0.0005,
    max: 0.02,
    unit: 'm/s',
    note: 'Continuous-phase superficial velocity (Laitinen/K&H 1995 Kühni dataset range)',
  },
  psi_W_kg: {
    min: 0.05,
    max: 50,
    unit: 'W/kg',
    note: 'Mechanical power dissipation per unit mass (agitated-column range, K&H 1995)',
  },
  gamma_N_m: {
    min: 0.001,
    max: 0.045,
    unit: 'N/m',
    note: 'Interfacial tension (organic–aqueous systems, K&H 1995 database)',
  },
  xf: {
    min: 0.10,
    max: 0.50,
    unit: '−',
    note: 'Stator fractional free cross-sectional area (Laitinen ECR60/50G: 0.30)',
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
  withinRange: boolean;
  note: string;
}

/** Governance metadata — fixed for this implementation. */
export interface HoldupGovernance {
  governanceStatus: 'UNVERIFIED — pending primary source';
  source: 'Kumar & Hartland (1995) via Laitinen et al. (2019) secondary reproduction';
  registryId: 'ecr2_holdup_kh1995';
  correlationStatus: 'secondary_equation_verified';
  primarySourceVerified: false;
  validatedForRRBONMP: false;
  phaseMapping: 'NMP=continuous (ρc, Uc) | RRBO=dispersed (ρd, Ud)';
}

const GOVERNANCE: HoldupGovernance = {
  governanceStatus: 'UNVERIFIED — pending primary source',
  source: 'Kumar & Hartland (1995) via Laitinen et al. (2019) secondary reproduction',
  registryId: 'ecr2_holdup_kh1995',
  correlationStatus: 'secondary_equation_verified',
  primarySourceVerified: false,
  validatedForRRBONMP: false,
  phaseMapping: 'NMP=continuous (ρc, Uc) | RRBO=dispersed (ρd, Ud)',
} as const;

/** Successful holdup calculation result. */
export interface HoldupSuccess {
  status: 'calculated';
  /** Dispersed-phase holdup φ (volume fraction, dimensionless). */
  phi: number;
  /** Characteristic time-length scale θ = (ρc/(g·γ))^0.25 (s/m). */
  theta_s_m: number;
  /**
   * Intermediate dimensionless groups and equation terms.
   * Retained for traceability and dimensional verification.
   */
  intermediates: {
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
  };
  /** Per-input applicability diagnostics against K&H 1995 dataset bounds. */
  applicabilityDiagnostics: Record<string, ApplicabilityCheckItem>;
  governance: HoldupGovernance;
}

/** Result when one or more required inputs fall outside the correlation envelope. */
export interface HoldupOutsideEnvelope {
  status: 'outside_envelope';
  phi: null;
  /** Names of inputs that failed the range check. */
  failedChecks: string[];
  /** Full applicability diagnostics (including passed checks for context). */
  applicabilityDiagnostics: Record<string, ApplicabilityCheckItem>;
  governance: HoldupGovernance;
}

/** Result when a required input was not supplied. */
export interface HoldupInputMissing {
  status: 'input_missing';
  phi: null;
  missing: string[];
}

export type KH1995HoldupResult =
  | HoldupSuccess
  | HoldupOutsideEnvelope
  | HoldupInputMissing;

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Compute Kühni dispersed-phase holdup using Kumar & Hartland (1995),
 * Eqs (1)–(2) as reproduced in Laitinen et al. (2019).
 *
 * GOVERNANCE: result.governance.governanceStatus is always
 * 'UNVERIFIED — pending primary source'. Results must not be used for
 * design sizing or performance commitments until primarySourceVerified = true.
 *
 * @param inputs  Physical inputs — all must be in SI units as documented.
 * @returns       KH1995HoldupResult — check result.status before using result.phi.
 */
export function computeKH1995Holdup(inputs: HoldupInputs): KH1995HoldupResult {
  const { psi_W_kg, Ud_m_s, Uc_m_s, rho_c_kg_m3, rho_d_kg_m3, gamma_N_m, xf } = inputs;

  // ── Guard: all inputs must be finite positive numbers ─────────────────────
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
  if (rho_c_kg_m3 <= rho_d_kg_m3) {
    // NMP must be denser than RRBO for a physically valid density difference
    missing.push('rho_c_kg_m3 must be > rho_d_kg_m3 (NMP denser than RRBO)');
  }
  if (missing.length > 0) return { status: 'input_missing', phi: null, missing };

  // ── Applicability checks ──────────────────────────────────────────────────
  const rangeInputs: [string, number][] = [
    ['Ud_m_s',    Ud_m_s],
    ['Uc_m_s',    Uc_m_s],
    ['psi_W_kg',  psi_W_kg],
    ['gamma_N_m', gamma_N_m],
    ['xf',        xf],
  ];

  const applicabilityDiagnostics: Record<string, ApplicabilityCheckItem> = {};
  const failedChecks: string[] = [];

  for (const [name, value] of rangeInputs) {
    const bounds = VALIDITY[name];
    const withinRange = value >= bounds.min && value <= bounds.max;
    applicabilityDiagnostics[name] = {
      value,
      min: bounds.min,
      max: bounds.max,
      unit: bounds.unit,
      withinRange,
      note: bounds.note,
    };
    if (!withinRange) failedChecks.push(name);
  }

  if (failedChecks.length > 0) {
    return {
      status: 'outside_envelope',
      phi: null,
      failedChecks,
      applicabilityDiagnostics,
      governance: GOVERNANCE,
    };
  }

  // ── Eq. (2): characteristic time-length scale θ ───────────────────────────
  //
  //   θ = (ρc / (g · γ))^0.25
  //
  //   Dimensional verification:
  //     ρc / (g · γ) = [kg/m³] / ([m/s²] · [kg/s²]) = s⁴/m⁴
  //     θ = (s⁴/m⁴)^0.25 = s/m  ✓
  //
  const theta_s_m = Math.pow(rho_c_kg_m3 / (G * gamma_N_m), 0.25);

  // ── Dimensionless groups ─────────────────────────────────────────────────
  const psiTheta_over_g = (psi_W_kg * theta_s_m) / G;  // (ψ·θ)/g  [−]
  const Ud_theta        = Ud_m_s * theta_s_m;           // Ud·θ     [−]
  const Uc_theta        = Uc_m_s * theta_s_m;           // Uc·θ     [−]
  const density_ratio   = (rho_c_kg_m3 - rho_d_kg_m3) / rho_c_kg_m3; // [−]

  // ── Eq. (1): dispersed-phase holdup φ ────────────────────────────────────
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

  const phi = termA * termB * termC * termD * termE;

  return {
    status: 'calculated',
    phi,
    theta_s_m,
    intermediates: {
      psiTheta_over_g,
      Ud_theta,
      Uc_theta,
      density_ratio,
      termA,
      termB,
      termC,
      termD,
      termE,
    },
    applicabilityDiagnostics,
    governance: GOVERNANCE,
  };
}
