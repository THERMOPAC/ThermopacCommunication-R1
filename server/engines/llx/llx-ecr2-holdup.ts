// ═══════════════════════════════════════════════════════════════════════════════
// ECR-2 K&H 1995 Kühni dispersed-phase holdup correlation
//
// Primary source: Kumar, A. & Hartland, S. (1995), Ind. Eng. Chem. Res. 34,
// 3925–3940, Eq. 15–19 and Table 2.
//
// This is a dependency calculation, not a flooding correlation. It never clips
// φ and it never labels an empirical or evidence failure as process infeasibility.
// ═══════════════════════════════════════════════════════════════════════════════

/** Gravitational acceleration (m/s²). */
const G = 9.80665;

export type ApplicabilityRangeSource = 'published_primary';

export interface ApplicabilityRange {
  min: number;
  max: number;
  unit: string;
  source: ApplicabilityRangeSource;
  sourceNote: string;
}

/**
 * Primary K&H 1995 data-envelope fields required to decide applicability.
 * These bounds are hard dependencies for an ECR-2 RRBO/NMP calculation.
 */
export const KH1995_PRIMARY_APPLICABILITY_RANGES: Record<string, ApplicabilityRange> = {
  Ud_m_s: { min: 0.0001, max: 0.0088, unit: 'm/s', source: 'published_primary', sourceNote: 'K&H 1995 Table 1, dispersed superficial velocity.' },
  Uc_m_s: { min: 0.0002, max: 0.0079, unit: 'm/s', source: 'published_primary', sourceNote: 'K&H 1995 Table 1, continuous superficial velocity.' },
  epsilon_W_kg: { min: 0, max: 0.83, unit: 'W/kg', source: 'published_primary', sourceNote: 'K&H 1995 Table 1, power dissipation per continuous-phase mass.' },
  gamma_N_m: { min: 0.0008, max: 0.0341, unit: 'N/m', source: 'published_primary', sourceNote: 'K&H 1995 Table 1, interfacial tension.' },
  xf: { min: 0.16, max: 1.0, unit: '—', source: 'published_primary', sourceNote: 'K&H 1995 Table 1, stator free-area fraction.' },
  columnDiameter_m: { min: 0.072, max: 0.2, unit: 'm', source: 'published_primary', sourceNote: 'K&H 1995 Table 1, column diameter.' },
  rotorDiameter_m: { min: 0.05, max: 0.085, unit: 'm', source: 'published_primary', sourceNote: 'K&H 1995 Table 1, rotor diameter.' },
  compartmentHeight_m: { min: 0.05, max: 0.09, unit: 'm', source: 'published_primary', sourceNote: 'K&H 1995 Table 1, compartment height.' },
  mu_c_Pa_s: { min: 0.00097, max: 0.00161, unit: 'Pa·s', source: 'published_primary', sourceNote: 'K&H 1995 Table 1, continuous-phase viscosity.' },
  mu_d_Pa_s: { min: 0.00066, max: 0.00392, unit: 'Pa·s', source: 'published_primary', sourceNote: 'K&H 1995 Table 1, dispersed-phase viscosity.' },
};

export type KH1995MassTransferDirection =
  | 'no_mass_transfer'
  | 'continuous_to_dispersed'
  | 'dispersed_to_continuous'
  | 'bidirectional_multicomponent';

/**
 * Published CΨ is direction-specific. A multicomponent bidirectional ECR-2
 * system cannot silently receive a single published factor.
 */
export type KH1995SystemIdentity = 'published_reference_system' | 'rrbo_nmp';

export interface HoldupInputs {
  /** Dispersed-phase superficial velocity Ud (m/s). */
  Ud_m_s: number;
  /** Continuous-phase superficial velocity Uc (m/s). */
  Uc_m_s: number;
  /** Continuous-phase density ρc (kg/m³). */
  rho_c_kg_m3: number;
  /** Dispersed-phase density ρd (kg/m³). */
  rho_d_kg_m3: number;
  /** Continuous-phase viscosity μc (Pa·s). */
  mu_c_Pa_s: number;
  /** Dispersed-phase viscosity μd (Pa·s). */
  mu_d_Pa_s: number;
  /** Interfacial tension γ (N/m). */
  gamma_N_m: number;
  /** Stator fractional free cross-sectional area xf (—). */
  xf: number;
  /** One agitator power P (W), as required by the primary power definition. */
  powerPerAgitator_W: number;
  /** Column area Ac (m²), not rotor swept area. */
  columnCrossSectionArea_m2: number;
  /** Actual local compartment height H (m). */
  compartmentHeight_m: number;
  /** Actual column internal diameter Dc (m). */
  columnDiameter_m: number;
  /** Actual rotor diameter Dr (m). */
  rotorDiameter_m: number;
  /** CΨ selection from K&H Table 2. */
  massTransferDirection: KH1995MassTransferDirection;
  /** Explicitly identifies whether the physical system is validated by K&H. */
  systemIdentity: KH1995SystemIdentity;
}

export interface ApplicabilityCheckItem {
  value: number;
  min: number;
  max: number;
  unit: string;
  source: ApplicabilityRangeSource;
  sourceNote: string;
  withinRange: boolean;
  extrapolated: boolean;
}

export interface HoldupGovernance {
  engineeringBasis: 'Published Correlation — Primary Equation / Dependency-Gated';
  governanceStatus: 'PRIMARY_FORM_VERIFIED__RRBO_NMP_NOT_VALIDATED';
  source: 'Kumar & Hartland (1995), primary Eq. 15–19 and Table 2';
  registryId: 'ecr2_holdup_kh1995';
  correlationStatus: 'primary_equation_verified';
  primarySourceVerified: true;
  validatedForRRBONMP: false;
  phaseMapping: 'NMP=continuous (ρc, Uc) | RRBO=dispersed (ρd, Ud)';
  powerDissipationBasis: 'ε = P/(Ac·H·ρc), using one agitator P, column area Ac, local compartment H, and continuous density ρc';
  massTransferFactorBasis: 'CΨ = 1.00 for no transfer or continuous→dispersed; 0.56 for dispersed→continuous; no single CΨ is admitted for bidirectional multicomponent transfer';
  localAxialApplication: 'not_governed_for_RRBO_NMP';
  downstreamUsabilityRule: "consume phi only when status = 'calculated' — use isHoldupUsable()";
}

const GOVERNANCE: HoldupGovernance = {
  engineeringBasis: 'Published Correlation — Primary Equation / Dependency-Gated',
  governanceStatus: 'PRIMARY_FORM_VERIFIED__RRBO_NMP_NOT_VALIDATED',
  source: 'Kumar & Hartland (1995), primary Eq. 15–19 and Table 2',
  registryId: 'ecr2_holdup_kh1995',
  correlationStatus: 'primary_equation_verified',
  primarySourceVerified: true,
  validatedForRRBONMP: false,
  phaseMapping: 'NMP=continuous (ρc, Uc) | RRBO=dispersed (ρd, Ud)',
  powerDissipationBasis: 'ε = P/(Ac·H·ρc), using one agitator P, column area Ac, local compartment H, and continuous density ρc',
  massTransferFactorBasis: 'CΨ = 1.00 for no transfer or continuous→dispersed; 0.56 for dispersed→continuous; no single CΨ is admitted for bidirectional multicomponent transfer',
  localAxialApplication: 'not_governed_for_RRBO_NMP',
  downstreamUsabilityRule: "consume phi only when status = 'calculated' — use isHoldupUsable()",
} as const;

export interface HoldupIntermediates {
  /** ε = P/(Ac·H·ρc), primary K&H power dissipation basis (W/kg). */
  epsilon_W_kg: number;
  epsilonTheta_over_g: number;
  Ud_theta: number;
  Uc_theta: number;
  density_ratio: number;
  termA: number;
  termB: number;
  /** exp(20.7·Uc·θ), with no unsupported outer 0.90 exponent. */
  termC: number;
  termD: number;
  /** CΨ · 2.27 · xf^-0.77. */
  termE: number;
  C_psi: number;
}

interface HoldupComputedCommon {
  phi_raw: number;
  theta_s_m: number;
  intermediates: HoldupIntermediates;
  applicabilityDiagnostics: Record<string, ApplicabilityCheckItem>;
  governance: HoldupGovernance;
}

export interface HoldupCalculated extends HoldupComputedCommon {
  status: 'calculated';
  phi: number;
}

export interface HoldupDependencyBlocked extends HoldupComputedCommon {
  status: 'dependency_blocked';
  phi: null;
  blockedBy: readonly string[];
}

export interface HoldupInputMissing {
  status: 'input_missing';
  phi: null;
  phi_raw: null;
  missing: string[];
}

export interface HoldupCalculationInvalid extends HoldupComputedCommon {
  status: 'calculation_invalid';
  phi: null;
  reason: string;
}

export interface HoldupPhysicallyInvalid extends HoldupComputedCommon {
  status: 'physically_invalid';
  phi: null;
  physicalViolation: 'phi_raw <= 0' | 'phi_raw >= 1';
}

export type KH1995HoldupResult =
  | HoldupCalculated
  | HoldupDependencyBlocked
  | HoldupInputMissing
  | HoldupCalculationInvalid
  | HoldupPhysicallyInvalid;

export function isHoldupUsable(result: KH1995HoldupResult): result is HoldupCalculated {
  return result.status === 'calculated';
}

function cPsiFor(direction: KH1995MassTransferDirection): number | null {
  if (direction === 'no_mass_transfer' || direction === 'continuous_to_dispersed') return 1.0;
  if (direction === 'dispersed_to_continuous') return 0.56;
  return null;
}

function applicability(
  values: Record<string, number>,
): { diagnostics: Record<string, ApplicabilityCheckItem>; outside: string[] } {
  const diagnostics: Record<string, ApplicabilityCheckItem> = {};
  const outside: string[] = [];
  for (const [name, range] of Object.entries(KH1995_PRIMARY_APPLICABILITY_RANGES)) {
    const value = values[name];
    const withinRange = value >= range.min && value <= range.max;
    diagnostics[name] = { value, ...range, withinRange, extrapolated: !withinRange };
    if (!withinRange) outside.push(name);
  }
  return { diagnostics, outside };
}

/**
 * Primary K&H Eq. 15–19 calculation. All reported source-domain or physical
 * failures are dependency blocks; they are not flooding labels and do not
 * establish process infeasibility.
 */
export function computeKH1995Holdup(inputs: HoldupInputs): KH1995HoldupResult {
  const positive: Array<[string, number]> = [
    ['Ud_m_s', inputs.Ud_m_s], ['Uc_m_s', inputs.Uc_m_s],
    ['rho_c_kg_m3', inputs.rho_c_kg_m3], ['rho_d_kg_m3', inputs.rho_d_kg_m3],
    ['mu_c_Pa_s', inputs.mu_c_Pa_s], ['mu_d_Pa_s', inputs.mu_d_Pa_s],
    ['gamma_N_m', inputs.gamma_N_m], ['xf', inputs.xf],
    ['powerPerAgitator_W', inputs.powerPerAgitator_W],
    ['columnCrossSectionArea_m2', inputs.columnCrossSectionArea_m2],
    ['compartmentHeight_m', inputs.compartmentHeight_m],
    ['columnDiameter_m', inputs.columnDiameter_m], ['rotorDiameter_m', inputs.rotorDiameter_m],
  ];
  const missing = positive.filter(([, value]) => !Number.isFinite(value) || value <= 0).map(([name]) => name);
  if (Number.isFinite(inputs.rho_c_kg_m3) && Number.isFinite(inputs.rho_d_kg_m3) &&
      inputs.rho_c_kg_m3 <= inputs.rho_d_kg_m3) {
    missing.push('rho_c_kg_m3 must be > rho_d_kg_m3 (NMP continuous must be denser than RRBO dispersed)');
  }
  if (missing.length) return { status: 'input_missing', phi: null, phi_raw: null, missing };

  const C_psi = cPsiFor(inputs.massTransferDirection);
  const epsilon_W_kg = inputs.powerPerAgitator_W /
    (inputs.columnCrossSectionArea_m2 * inputs.compartmentHeight_m * inputs.rho_c_kg_m3);
  const { diagnostics: applicabilityDiagnostics, outside } = applicability({
    Ud_m_s: inputs.Ud_m_s,
    Uc_m_s: inputs.Uc_m_s,
    epsilon_W_kg,
    gamma_N_m: inputs.gamma_N_m,
    xf: inputs.xf,
    columnDiameter_m: inputs.columnDiameter_m,
    rotorDiameter_m: inputs.rotorDiameter_m,
    compartmentHeight_m: inputs.compartmentHeight_m,
    mu_c_Pa_s: inputs.mu_c_Pa_s,
    mu_d_Pa_s: inputs.mu_d_Pa_s,
  });

  // A bidirectional system has no admitted single CΨ. Keep mathematical
  // diagnostics but do not manufacture a holdup by choosing one direction.
  if (C_psi === null) {
    const theta_s_m = Math.pow(inputs.rho_c_kg_m3 / (G * inputs.gamma_N_m), 0.25);
    const density_ratio = (inputs.rho_c_kg_m3 - inputs.rho_d_kg_m3) / inputs.rho_c_kg_m3;
    const zeroIntermediates: HoldupIntermediates = {
      epsilon_W_kg, epsilonTheta_over_g: (epsilon_W_kg * theta_s_m) / G,
      Ud_theta: inputs.Ud_m_s * theta_s_m, Uc_theta: inputs.Uc_m_s * theta_s_m,
      density_ratio, termA: Number.NaN, termB: Number.NaN, termC: Number.NaN,
      termD: Number.NaN, termE: Number.NaN, C_psi: Number.NaN,
    };
    return {
      status: 'dependency_blocked', phi: null, phi_raw: Number.NaN, theta_s_m,
      intermediates: zeroIntermediates, applicabilityDiagnostics, governance: GOVERNANCE,
      blockedBy: [
        'kh1995_cpsi_bidirectional_multicomponent_unresolved',
        ...(outside.length ? [`kh1995_primary_applicability_outside:${outside.join(',')}`] : []),
        ...(inputs.systemIdentity === 'rrbo_nmp' ? ['kh1995_rrbo_nmp_not_validated'] : []),
      ],
    };
  }

  const theta_s_m = Math.pow(inputs.rho_c_kg_m3 / (G * inputs.gamma_N_m), 0.25);
  const epsilonTheta_over_g = (epsilon_W_kg * theta_s_m) / G;
  const Ud_theta = inputs.Ud_m_s * theta_s_m;
  const Uc_theta = inputs.Uc_m_s * theta_s_m;
  const density_ratio = (inputs.rho_c_kg_m3 - inputs.rho_d_kg_m3) / inputs.rho_c_kg_m3;
  const termA = 0.0267 + Math.pow(epsilonTheta_over_g, 0.77);
  const termB = Math.pow(Ud_theta, 0.64);
  const termC = Math.exp(20.7 * Uc_theta);
  const termD = Math.pow(density_ratio, -0.34);
  const termE = C_psi * 2.27 * Math.pow(inputs.xf, -0.77);
  const phi_raw = termA * termB * termC * termD * termE;
  const intermediates: HoldupIntermediates = {
    epsilon_W_kg, epsilonTheta_over_g, Ud_theta, Uc_theta, density_ratio,
    termA, termB, termC, termD, termE, C_psi,
  };
  const common: HoldupComputedCommon = {
    phi_raw, theta_s_m, intermediates, applicabilityDiagnostics, governance: GOVERNANCE,
  };
  if (!Number.isFinite(phi_raw)) {
    return { status: 'calculation_invalid', phi: null, ...common,
      reason: 'K&H 1995 primary equation produced a non-finite result; no holdup is inferred.' };
  }
  if (phi_raw <= 0 || phi_raw >= 1) {
    return { status: 'physically_invalid', phi: null, ...common,
      physicalViolation: phi_raw <= 0 ? 'phi_raw <= 0' : 'phi_raw >= 1' };
  }
  const blockedBy = [
    ...(outside.length ? [`kh1995_primary_applicability_outside:${outside.join(',')}`] : []),
    ...(inputs.systemIdentity === 'rrbo_nmp' ? ['kh1995_rrbo_nmp_not_validated'] : []),
  ];
  if (blockedBy.length) return { status: 'dependency_blocked', phi: null, ...common, blockedBy };
  return { status: 'calculated', phi: phi_raw, ...common };
}