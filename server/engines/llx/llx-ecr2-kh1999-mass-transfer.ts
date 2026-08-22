// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — K&H 1999 Preliminary Local Mass-Transfer Kernel
//
// The base evaluator calculates the concentration-basis subset. A separate,
// explicit activation path evaluates governed K&H structures only for one
// fully provenance-tagged local compartment state.
//
// Source-backed work implemented here:
//   · physical mole-fraction → component mass-concentration conversion
//   · K_d,i = C_d,i* / C_c,i* on an equilibrium mass-concentration basis
//   · ΔC_d,i = C_d,i − K_d,i C_c,i (positive: RRBO/d → NMP/c)
//   · preservation of dimensionless / Schmidt inputs and applicability labels
//
// Explicitly out of scope:
//   BVP/axial propagation, outlet prediction, optimizer, flooding, and UI.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ECR2AllSchmidtNumbers,
  ECR2DiffusivityContract,
  DiffusivityInput,
} from './llx-ecr2-diffusivity';
import type {
  ECR2DimensionlessResult,
} from './llx-ecr2-dimensionless';
import type { ECR2LocalPropertyResult } from './llx-ecr2-local-properties';
import {
  nullField,
  type ECR2DependencyReason,
  type ECR2NullField,
} from './llx-ecr2-compartment-state';
import {
  ECR2_KH1999_SECONDARY_SCOPED_CONSTANTS,
  ECR2_KH1999_PRELIMINARY_PARAMETERS,
  type ECR2KH1999PreliminaryParameter,
} from './llx-ecr2-correlation-registry';

/** The local kernel preserves the frozen NRTL order, including NMP. */
export const TRANSFER_COMPONENTS = ['Sat', 'Mono', 'Di', 'Poly', 'NMP'] as const;
export type TransferComponent = (typeof TRANSFER_COMPONENTS)[number];

export type FiveComponentVector = readonly [
  number,
  number,
  number,
  number,
  number,
];

export interface ECR2PhysicalMolecularWeightVector {
  /** Physical/project molecular weights only. Never feed these to NRTL. */
  Sat_g_mol: number;
  Mono_g_mol: number;
  Di_g_mol: number;
  Poly_g_mol: number;
  NMP_g_mol: number;
}

export interface ECR2ComponentMassConcentration {
  component: TransferComponent;
  moleFraction: number;
  physicalMassFraction: number;
  concentration_kg_m3: number;
  molecularWeight_g_mol: number;
}

export interface ECR2ComponentConcentrationBasis {
  phase: 'continuous_nmp_rich' | 'dispersed_rrbo_rich';
  phaseDensity_kg_m3: number;
  components: Record<TransferComponent, ECR2ComponentMassConcentration>;
  diagnostics: string[];
}

export interface ECR2KH1999ComponentResult {
  component: TransferComponent;
  Sc_c: number | ECR2NullField;
  Sc_d: number | ECR2NullField;
  C_c_bulk_kg_m3: number | ECR2NullField;
  C_d_bulk_kg_m3: number | ECR2NullField;
  C_c_equilibrium_kg_m3: number | ECR2NullField;
  C_d_equilibrium_kg_m3: number | ECR2NullField;
  /** K_d,i = C_d,i* / C_c,i* (dimensionless). */
  K_d_partition: number | ECR2NullField;
  /**
   * ΔC_d,i = C_d,i − K_d,i·C_c,i (kg/m³).
   * Positive values are transfer from RRBO/dispersed to NMP/continuous.
   */
  drivingForce_dispersed_kg_m3: number | ECR2NullField;
  Sh_c: number | ECR2NullField;
  Sh_d: number | ECR2NullField;
  k_c_m_s: number | ECR2NullField;
  k_d_m_s: number | ECR2NullField;
  /** Overall dispersed-basis coefficient, retained for compatibility. */
  K_od_m_s: number | ECR2NullField;
  /** Explicit overall-coefficient name for new consumers. */
  K_overall_m_s: number | ECR2NullField;
  /** Volumetric coefficient; unit is 1/s, never m/s. */
  K_oa_per_s: number | ECR2NullField;
  transferRate_kg_m3_s: number | ECR2NullField;
  outputStatus: ECR2KH1999ComponentOutputStatuses;
}

export type ECR2KH1999OutputStatus =
  | 'calculated_preliminary'
  | 'blocked_by_missing_d32'
  | 'blocked_by_missing_diffusivity'
  | 'blocked_by_invalid_holdup'
  | 'blocked_by_invalid_c1_scope'
  | 'engineer_partition_basis_required'
  | 'blocked_by_K_overall'
  | 'not_calculable';

export interface ECR2KH1999OutputState {
  status: ECR2KH1999OutputStatus;
  message: string;
}

export interface ECR2KH1999ComponentOutputStatuses {
  Sh_c: ECR2KH1999OutputState;
  Sh_d: ECR2KH1999OutputState;
  k_c: ECR2KH1999OutputState;
  k_d: ECR2KH1999OutputState;
  K_overall: ECR2KH1999OutputState;
  Koa: ECR2KH1999OutputState;
  drivingForce: ECR2KH1999OutputState;
  transferRate: ECR2KH1999OutputState;
}

export interface ECR2KH1999HydrodynamicInputs {
  /** Usable dispersed-phase holdup (0 < φ_d < 1). */
  phi_d: number;
  /** Thermopac preliminary ψ = (P/V)/ρ_mix_phase1 (W/kg). */
  psi_W_kg: number;
  /** Local phase slip velocity V_s (m/s). */
  U_slip_m_s: number;
  rho_c_kg_m3: number;
  rho_d_kg_m3: number;
  mu_c: ECR2LocalPropertyResult;
  mu_d: ECR2LocalPropertyResult;
  sigma: ECR2LocalPropertyResult;
}

export interface ECR2KH1999PartitionBasisApproval {
  /** Exact ECR-2 concentration basis used by the local kernel. */
  basis: 'K_d_concentration';
  /**
   * Caller assertion that this basis was explicitly engineer-approved for the
   * registered K&H two-film relation and its dispersed concentration driving force.
   */
  approvalStatus: 'engineer_approved_governed';
  sourceReference: string;
  /** Auditable approval metadata; the numerical Kd remains locally calculated. */
  approvedBy?: string;
  approvedAt?: string;
}

export interface ECR2KH1999D32Provenance {
  value_m: number;
  source: 'governed_calculated' | 'engineer_entered' | 'measured';
  sourceReference: string;
}

export interface ECR2KH1999PreliminaryActivation {
  hydrodynamics: ECR2KH1999HydrodynamicInputs;
  diffusivity: ECR2DiffusivityContract;
  /** d₃₂ must use an explicit governed, engineer-entered, or measured route. */
  d32: ECR2KH1999D32Provenance;
  /**
   * C1 is registry-controlled. Any override is rejected to prevent using 0.90
   * or a pulsed-column constant by symbol collision.
   */
  c1Override?: number;
  /** Required only for K_overall, Koa, and rate. */
  partitionBasis?: ECR2KH1999PartitionBasisApproval | null;
}

export interface ECR2KH1999LocalMassTransferResult {
  status: 'MASS_TRANSFER_PRELIMINARY';
  engineeringBasis: 'Published Correlation — Preliminary Engineering';
  phaseConvention: {
    continuous: 'NMP-rich';
    dispersed: 'RRBO-rich';
    positiveTransfer: 'RRBO/dispersed → NMP/continuous';
  };
  parameters: readonly ECR2KH1999PreliminaryParameter[];
  dimensionless: ECR2DimensionlessResult | null;
  schmidt: ECR2AllSchmidtNumbers | null;
  ReynoldsApplicability:
    | 'not_available'
    | 'below_rigid_sphere_validity'
    | 'within_reported_rigid_sphere_range'
    | 'above_reported_rigid_sphere_range';
  d32_m: number | null;
  localDensityBasis: {
    rho_c_bulk_kg_m3: number;
    rho_d_bulk_kg_m3: number;
    rho_c_equilibrium_kg_m3: number;
    rho_d_equilibrium_kg_m3: number;
  } | null;
  interfacialArea_m2_m3: number | null;
  components: Record<TransferComponent, ECR2KH1999ComponentResult>;
  governance: {
    engineeringBasis: 'Published Correlation — Preliminary Engineering';
    primarySourceVerified: false;
    validatedForRRBONMP: false;
    pilotCalibrationStatus: 'NOT_YET_VALIDATED';
    psiBasis: 'Thermopac preliminary interpretation of K&H power dissipated per unit mass';
    engineerInputs: {
      diffusivity: ECR2DiffusivityContract | null;
      d32: ECR2KH1999D32Provenance | null;
      localProperties: {
        mu_c: ECR2LocalPropertyResult;
        mu_d: ECR2LocalPropertyResult;
        sigma: ECR2LocalPropertyResult;
      } | null;
    };
  };
  unresolvedItems: readonly string[];
  diagnostics: string[];
}

const MW_KEYS: Record<TransferComponent, keyof ECR2PhysicalMolecularWeightVector> = {
  Sat: 'Sat_g_mol',
  Mono: 'Mono_g_mol',
  Di: 'Di_g_mol',
  Poly: 'Poly_g_mol',
  NMP: 'NMP_g_mol',
};

const COMPONENT_INDEX: Record<TransferComponent, 0 | 1 | 2 | 3 | 4> = {
  Sat: 0,
  Mono: 1,
  Di: 2,
  Poly: 3,
  NMP: 4,
};

const UNRESOLVED_SHERWOOD_ITEMS = [
  'Governed Kühni ψ definition for the secondary-recorded power correction.',
  'Rigid/circulating/oscillating regime equations and selection criterion.',
  'Characteristic-drop-velocity relation.',
  'Defined two-film slope m and overall partition basis.',
  'Original K&H validity ranges and RRBO/NMP validation.',
  'Explicit runtime activation approval.',
] as const;

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNullField(value: unknown): value is ECR2NullField {
  return typeof value === 'object' && value !== null && 'value' in value &&
    (value as { value?: unknown }).value === null;
}

function unavailable(
  reason: ECR2DependencyReason,
  message: string,
): ECR2NullField {
  return nullField(
    reason,
    reason === 'correlation_unresolved' ? 'ecr2_koa_kh1999' : null,
    message,
  );
}

function unavailableSherwood(component: TransferComponent, quantity: string): ECR2NullField {
  return unavailable(
    'correlation_unresolved',
    `${quantity} (${component}) is unavailable: secondary K&H 1999 equation metadata is not runtime authorisation. ` +
      `Kühni ψ, regime selection, and overall-resistance basis remain unresolved. No numerical reconstruction was invented.`,
  );
}

const PRELIMINARY_GOVERNANCE = {
  engineeringBasis: 'Published Correlation — Preliminary Engineering' as const,
  primarySourceVerified: false as const,
  validatedForRRBONMP: false as const,
  pilotCalibrationStatus: 'NOT_YET_VALIDATED' as const,
  psiBasis: 'Thermopac preliminary interpretation of K&H power dissipated per unit mass' as const,
};

function outputState(status: ECR2KH1999OutputStatus, message: string): ECR2KH1999OutputState {
  return { status, message };
}

function numeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function componentDiffusivities(
  activation: ECR2KH1999PreliminaryActivation,
  component: TransferComponent,
): { De_c: DiffusivityInput | null; De_d: DiffusivityInput | null } {
  const pair = activation.diffusivity[component];
  return { De_c: pair.De_c, De_d: pair.De_d };
}

function propertyProvenanceIssue(
  property: ECR2LocalPropertyResult | null | undefined,
  label: string,
  requiredUnitFragment: string,
): string | null {
  if (!property || !numeric(property.value) || property.value <= 0) {
    return `${label} requires a positive provenance-bearing local property record.`;
  }
  if (
    !property.unit.includes(requiredUnitFragment) ||
    !property.sourceType.trim() ||
    !property.sourceReference.trim() ||
    !property.calculationMethod.trim() ||
    !property.status.trim()
  ) {
    return `${label} property record is missing required unit, source, calculation-method, or status provenance.`;
  }
  return null;
}

function validHydrodynamics(h: ECR2KH1999HydrodynamicInputs): string | null {
  const propertyIssue = propertyProvenanceIssue(h.mu_c, 'μ_c', 'Pa') ??
    propertyProvenanceIssue(h.mu_d, 'μ_d', 'Pa') ??
    propertyProvenanceIssue(h.sigma, 'σ', 'N/');
  if (propertyIssue) return propertyIssue;
  if (!numeric(h.phi_d) || h.phi_d <= 0 || h.phi_d >= 1) {
    return 'Usable holdup is required: φ_d must be a finite value strictly between 0 and 1.';
  }
  const positive: Array<[string, number]> = [
    ['ψ', h.psi_W_kg],
    ['V_s', h.U_slip_m_s],
    ['ρ_c', h.rho_c_kg_m3],
    ['ρ_d', h.rho_d_kg_m3],
    ['μ_c', h.mu_c.value],
    ['μ_d', h.mu_d.value],
    ['σ', h.sigma.value],
  ];
  const invalid = positive.filter(([, value]) => !numeric(value) || value <= 0).map(([label]) => label);
  return invalid.length > 0
    ? `Local K&H inputs must be finite and positive; invalid: ${invalid.join(', ')}.`
    : null;
}

function d32ProvenanceIssue(d32: ECR2KH1999D32Provenance): string | null {
  if (!numeric(d32.value_m) || d32.value_m <= 0 || !d32.sourceReference.trim()) {
    return 'd₃₂ requires a positive value and sourceReference; no unprovenanced d₃₂ is accepted.';
  }
  return ['governed_calculated', 'engineer_entered', 'measured'].includes(d32.source)
    ? null
    : 'd₃₂ source must be governed_calculated, engineer_entered, or measured.';
}

function diffusivityProvenanceIssue(input: DiffusivityInput | null): string | null {
  if (!input || !isFinitePositive(input.value_m2_s)) {
    return 'Diffusivity requires a positive SI value.';
  }
  if (
    !input.sourceType.trim() ||
    !input.sourceReference.trim() ||
    !numeric(input.referenceTemperature_C) ||
    !input.method.trim() ||
    !['engineer_supplied', 'system_resolved_preliminary'].includes(input.status)
  ) {
    return 'Diffusivity requires sourceType, sourceReference, reference temperature, method, and an engineer-supplied or accepted system-resolved preliminary status.';
  }
  return null;
}

function resolveKuhniC1(activation: ECR2KH1999PreliminaryActivation): number | ECR2NullField {
  if (activation.c1Override !== undefined) {
    return unavailable(
      'correlation_unresolved',
      'C1 is registry-controlled. C1 = 0.90 and all pulsed-column constants are rejected; use only kh1999_shc_agitation_C1_kuhni.',
    );
  }
  const constant = ECR2_KH1999_SECONDARY_SCOPED_CONSTANTS.find(
    (item) => item.id === 'kh1999_shc_agitation_C1_kuhni' &&
      item.deviceType === 'kuhni' &&
      item.phaseBasis === 'continuous' &&
      item.value === 7.5,
  );
  return constant?.value ?? unavailable(
    'correlation_unresolved',
    'Scoped Kühni C1 = 7.5 is absent from the controlled K&H 1999 registry.',
  );
}

function calculateShc(params: {
  Re: number;
  Sc_c: number;
  De_c: number;
  d32_m: number;
  kappa: number;
  h: ECR2KH1999HydrodynamicInputs;
  C1: number;
}): { Sh_c: number; Sh_c_rigid: number; Sh_c_infinity: number } | null {
  const { Re, Sc_c, De_c, d32_m, h, C1 } = params;
  const scThird = Math.cbrt(Sc_c);
  const Sh_c_rigid = 2.43 + 0.775 * Math.sqrt(Re) * scThird + 0.0103 * Re * scThird;
  const Pe_c = (d32_m * h.U_slip_m_s) / De_c;
  const Sh_c_infinity = 50 + (2 / Math.sqrt(Math.PI)) * Math.sqrt(Pe_c);
  const agitationGroup = (h.psi_W_kg / 9.80665) *
    Math.pow(h.rho_c_kg_m3 / (9.80665 * h.sigma.value), 0.25);
  const rhs = 5.26e-2 *
    Math.pow(Re, 1 / 3 + 6.59e-2 * Math.pow(Re, 0.25)) *
    scThird *
    Math.cbrt((h.U_slip_m_s * h.mu_c.value) / h.sigma.value) *
    (1 / (1 + Math.pow(params.kappa, 1.1))) *
    (1 + C1 * Math.cbrt(agitationGroup));
  const normalizedSh = (Sh_c_rigid + rhs * Sh_c_infinity) / (1 + rhs);
  const Sh_c = (1 - h.phi_d) * normalizedSh;
  return [Sh_c, Sh_c_rigid, Sh_c_infinity, rhs, Pe_c].every(
    (value) => Number.isFinite(value) && value > 0,
  )
    ? { Sh_c, Sh_c_rigid, Sh_c_infinity }
    : null;
}

function calculateShd(params: {
  Re: number;
  Sc_d: number;
  kappa: number;
  h: ECR2KH1999HydrodynamicInputs;
}): number | null {
  const { Re, Sc_d, h } = params;
  const reSc = Re * Math.cbrt(Sc_d);
  const hydrodynamicTerm = (3.19e-3 * Math.pow(reSc, 1.7)) /
    (1 + 1.43e-2 * Math.pow(reSc, 0.7));
  const Sh_d = 17.7 +
    hydrodynamicTerm *
    Math.pow(h.rho_d_kg_m3 / h.rho_c_kg_m3, 2 / 3) *
    (1 / (1 + Math.pow(params.kappa, 2 / 3)));
  return Number.isFinite(Sh_d) && Sh_d > 0 ? Sh_d : null;
}

function inactiveOutputStatuses(): ECR2KH1999ComponentOutputStatuses {
  const unavailableState = outputState(
    'not_calculable',
    'Numerical K&H 1999 preliminary activation inputs were not supplied.',
  );
  return {
    Sh_c: unavailableState,
    Sh_d: unavailableState,
    k_c: unavailableState,
    k_d: unavailableState,
    K_overall: unavailableState,
    Koa: unavailableState,
    drivingForce: unavailableState,
    transferRate: unavailableState,
  };
}

function massWeights(vector: FiveComponentVector, molecularWeights: ECR2PhysicalMolecularWeightVector): number[] | null {
  const allMw = [
    molecularWeights.Sat_g_mol,
    molecularWeights.Mono_g_mol,
    molecularWeights.Di_g_mol,
    molecularWeights.Poly_g_mol,
    molecularWeights.NMP_g_mol,
  ];
  if (!vector.every((value) => Number.isFinite(value) && value >= 0) ||
      !allMw.every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  const sum = vector.reduce((total, value) => total + value, 0);
  if (!Number.isFinite(sum) || sum <= 0) return null;
  const numerator = vector.map((value, index) => (value / sum) * allMw[index]);
  const denominator = numerator.reduce((total, value) => total + value, 0);
  return Number.isFinite(denominator) && denominator > 0
    ? numerator.map((value) => value / denominator)
    : null;
}

/**
 * Convert a thermodynamic mole vector into physical component mass
 * concentrations using project physical molecular weights. This is a one-way
 * reporting/transport conversion and never changes the NRTL coordinates.
 */
export function computePhysicalComponentMassConcentrations(params: {
  phase: 'continuous_nmp_rich' | 'dispersed_rrbo_rich';
  phaseMoleFractions: FiveComponentVector;
  phaseDensity_kg_m3: number;
  molecularWeights: ECR2PhysicalMolecularWeightVector;
}): ECR2ComponentConcentrationBasis | ECR2NullField {
  const weights = massWeights(params.phaseMoleFractions, params.molecularWeights);
  if (!weights || !isFinitePositive(params.phaseDensity_kg_m3)) {
    return unavailable(
      'blocked_by_composition',
      'Physical component mass concentrations require a non-negative, non-empty mole vector, positive physical molecular weights, and a positive phase density.',
    );
  }

  const components = Object.fromEntries(TRANSFER_COMPONENTS.map((component) => {
    const index = COMPONENT_INDEX[component];
    const molecularWeight_g_mol = params.molecularWeights[MW_KEYS[component]];
    return [component, {
      component,
      moleFraction: params.phaseMoleFractions[index],
      physicalMassFraction: weights[index],
      concentration_kg_m3: weights[index] * params.phaseDensity_kg_m3,
      molecularWeight_g_mol,
    }];
  })) as Record<TransferComponent, ECR2ComponentMassConcentration>;

  return {
    phase: params.phase,
    phaseDensity_kg_m3: params.phaseDensity_kg_m3,
    components,
    diagnostics: [
      'Physical concentration conversion: w_i = z_i·MW_i / Σ(z_j·MW_j); C_i = w_i·ρ_phase.',
      'The supplied physical molecular weights are used only for this conversion and do not modify NRTL coordinates.',
    ],
  };
}

function reynoldsApplicability(dimensionless: ECR2DimensionlessResult | null): ECR2KH1999LocalMassTransferResult['ReynoldsApplicability'] {
  const re = dimensionless?.Re_d;
  if (typeof re !== 'number' || !Number.isFinite(re)) return 'not_available';
  if (re < 10) return 'below_rigid_sphere_validity';
  if (re <= 1200) return 'within_reported_rigid_sphere_range';
  return 'above_reported_rigid_sphere_range';
}

/**
 * Evaluate the approved preliminary K&H 1999 local-kernel subset.
 *
 * It calculates concentration-based K_d and driving force only. The result
 * intentionally leaves Sherwood-dependent values unavailable until the
 * unresolved Kühni-specific dependencies are governed and runtime use is
 * explicitly authorised.
 */
export function evaluateKH1999PreliminaryLocalMassTransfer(params: {
  /**
   * NMP-rich local bulk composition. Map from local NRTL y_j, never x_j.
   */
  continuous_bulk: FiveComponentVector;
  /**
   * RRBO-rich local bulk composition. Map from local NRTL x_j, never y_j.
   */
  dispersed_bulk: FiveComponentVector;
  /** NMP-rich equilibrium composition. Map from local NRTL y_eq. */
  continuous_equilibrium: FiveComponentVector;
  /** RRBO-rich equilibrium composition. Map from local NRTL x_eq. */
  dispersed_equilibrium: FiveComponentVector;
  rho_c_bulk_kg_m3: number;
  rho_d_bulk_kg_m3: number;
  /**
   * Equilibrium phase densities must be explicitly supplied. A caller may use
   * the same controlled local-property approximation as the bulk state, but
   * the kernel does not silently assume that approximation.
   */
  rho_c_equilibrium_kg_m3: number;
  rho_d_equilibrium_kg_m3: number;
  molecularWeights: ECR2PhysicalMolecularWeightVector;
  dimensionless: ECR2DimensionlessResult;
  schmidt: ECR2AllSchmidtNumbers;
  d32_m: number | null;
  interfacialArea_m2_m3: number | null;
}): ECR2KH1999LocalMassTransferResult {
  const cBulk = computePhysicalComponentMassConcentrations({
    phase: 'continuous_nmp_rich',
    phaseMoleFractions: params.continuous_bulk,
    phaseDensity_kg_m3: params.rho_c_bulk_kg_m3,
    molecularWeights: params.molecularWeights,
  });
  const dBulk = computePhysicalComponentMassConcentrations({
    phase: 'dispersed_rrbo_rich',
    phaseMoleFractions: params.dispersed_bulk,
    phaseDensity_kg_m3: params.rho_d_bulk_kg_m3,
    molecularWeights: params.molecularWeights,
  });
  const cEq = computePhysicalComponentMassConcentrations({
    phase: 'continuous_nmp_rich',
    phaseMoleFractions: params.continuous_equilibrium,
    phaseDensity_kg_m3: params.rho_c_equilibrium_kg_m3,
    molecularWeights: params.molecularWeights,
  });
  const dEq = computePhysicalComponentMassConcentrations({
    phase: 'dispersed_rrbo_rich',
    phaseMoleFractions: params.dispersed_equilibrium,
    phaseDensity_kg_m3: params.rho_d_equilibrium_kg_m3,
    molecularWeights: params.molecularWeights,
  });

  const concentrationsAvailable = !isNullField(cBulk) && !isNullField(dBulk) &&
    !isNullField(cEq) && !isNullField(dEq);

  const components = Object.fromEntries(TRANSFER_COMPONENTS.map((component) => {
    const schmidt = params.schmidt[component];
    const blockedConcentration = unavailable(
      'blocked_by_composition',
      `Mass concentration basis (${component}) is unavailable because local composition, density, or physical molecular weights are invalid.`,
    );

    const C_c_bulk = concentrationsAvailable ? cBulk.components[component].concentration_kg_m3 : blockedConcentration;
    const C_d_bulk = concentrationsAvailable ? dBulk.components[component].concentration_kg_m3 : blockedConcentration;
    const C_c_equilibrium = concentrationsAvailable ? cEq.components[component].concentration_kg_m3 : blockedConcentration;
    const C_d_equilibrium = concentrationsAvailable ? dEq.components[component].concentration_kg_m3 : blockedConcentration;

    const Kd = typeof C_c_equilibrium === 'number' && typeof C_d_equilibrium === 'number' &&
      C_c_equilibrium > 0
      ? C_d_equilibrium / C_c_equilibrium
      : unavailable(
          'blocked_by_Kd_partition',
          `K_d (${component}) requires positive equilibrium C_c,i* and C_d,i* on the physical mass-concentration basis.`,
        );
    const drivingForce = typeof C_d_bulk === 'number' && typeof C_c_bulk === 'number' && typeof Kd === 'number'
      ? C_d_bulk - Kd * C_c_bulk
      : unavailable(
          'blocked_by_Kd_partition',
          `ΔC_d (${component}) requires C_d,i, C_c,i, and concentration-based K_d,i.`,
        );

    return [component, {
      component,
      Sc_c: schmidt.Sc_c,
      Sc_d: schmidt.Sc_d,
      C_c_bulk_kg_m3: C_c_bulk,
      C_d_bulk_kg_m3: C_d_bulk,
      C_c_equilibrium_kg_m3: C_c_equilibrium,
      C_d_equilibrium_kg_m3: C_d_equilibrium,
      K_d_partition: Kd,
      drivingForce_dispersed_kg_m3: drivingForce,
      Sh_c: unavailableSherwood(component, 'Sh_c'),
      Sh_d: unavailableSherwood(component, 'Sh_d'),
      k_c_m_s: unavailableSherwood(component, 'k_c'),
      k_d_m_s: unavailableSherwood(component, 'k_d'),
      K_od_m_s: unavailableSherwood(component, 'K_od'),
      K_overall_m_s: unavailableSherwood(component, 'K_overall'),
      K_oa_per_s: unavailableSherwood(component, 'K_oa'),
      transferRate_kg_m3_s: unavailableSherwood(component, 'Transfer rate'),
      outputStatus: inactiveOutputStatuses(),
    }];
  })) as Record<TransferComponent, ECR2KH1999ComponentResult>;

  const reApplicability = reynoldsApplicability(params.dimensionless);
  return {
    status: 'MASS_TRANSFER_PRELIMINARY',
    engineeringBasis: 'Published Correlation — Preliminary Engineering',
    phaseConvention: {
      continuous: 'NMP-rich',
      dispersed: 'RRBO-rich',
      positiveTransfer: 'RRBO/dispersed → NMP/continuous',
    },
    parameters: ECR2_KH1999_PRELIMINARY_PARAMETERS,
    dimensionless: params.dimensionless,
    schmidt: params.schmidt,
    ReynoldsApplicability: reApplicability,
    d32_m: params.d32_m,
    localDensityBasis: {
      rho_c_bulk_kg_m3: params.rho_c_bulk_kg_m3,
      rho_d_bulk_kg_m3: params.rho_d_bulk_kg_m3,
      rho_c_equilibrium_kg_m3: params.rho_c_equilibrium_kg_m3,
      rho_d_equilibrium_kg_m3: params.rho_d_equilibrium_kg_m3,
    },
    interfacialArea_m2_m3: params.interfacialArea_m2_m3,
    components,
    governance: {
      ...PRELIMINARY_GOVERNANCE,
      engineerInputs: { diffusivity: null, d32: null, localProperties: null },
    },
    unresolvedItems: UNRESOLVED_SHERWOOD_ITEMS,
    diagnostics: [
      'K_d,i is calculated as C_d,i* / C_c,i* from equilibrium physical mass concentrations; it is not taken directly from mole-fraction ratios.',
      'K_od,i = k_c,i·k_d,i / (K_d,i·k_d,i + k_c,i) and K_oa,i = K_od,i·a are defined but intentionally unavailable until both phase Sherwood chains and the overall-basis gate are authorised.',
      reApplicability === 'below_rigid_sphere_validity'
        ? 'Re_d is below the reported rigid-sphere validity floor (10); no low-Re policy has been verified.'
        : `Re_d applicability advisory: ${reApplicability}.`,
    ],
  };
}

/**
 * Numerically activates the governed K&H 1999 preliminary local calculation
 * chain for one supplied compartment state. It deliberately has no axial
 * coupling: callers must supply all local compositions, properties, d32,
 * holdup, hydrodynamics, and diffusivity provenance.
 */
export function activateKH1999PreliminaryLocalMassTransfer(
  base: ECR2KH1999LocalMassTransferResult,
  activation: ECR2KH1999PreliminaryActivation,
): ECR2KH1999LocalMassTransferResult {
  const d32_m = activation.d32.value_m;
  const d32Issue = d32ProvenanceIssue(activation.d32);
  const d32Invalid = d32Issue !== null;
  const h = activation.hydrodynamics;
  const hydroIssue = validHydrodynamics(h);
  const densityBasis = base.localDensityBasis;
  const densityMismatch = !densityBasis ||
    h.rho_c_kg_m3 !== densityBasis.rho_c_bulk_kg_m3 ||
    h.rho_d_kg_m3 !== densityBasis.rho_d_bulk_kg_m3;
  const localStateIssue = densityMismatch
    ? 'Activated hydrodynamic densities must exactly match the base local concentration density basis; rebuild the base concentration state when densities change.'
    : null;
  /** Derive Re and κ from this exact activation state; never borrow another compartment's values. */
  const re = h.rho_c_kg_m3 * h.U_slip_m_s * d32_m / h.mu_c.value;
  const kappa = h.mu_d.value / h.mu_c.value;
  /** The activated local area is always a = 6φ/d₃₂; no base-snapshot area can override it. */
  const interfacialArea_m2_m3 = 6 * h.phi_d / d32_m;
  const areaInvalid = !numeric(interfacialArea_m2_m3) || interfacialArea_m2_m3 <= 0;
  const groupsInvalid = !numeric(re) || re <= 0 || !numeric(kappa) || kappa <= 0;
  const C1 = resolveKuhniC1(activation);
  const partitionApproved = activation.partitionBasis?.basis === 'K_d_concentration' &&
    activation.partitionBasis.approvalStatus === 'engineer_approved_governed' &&
    activation.partitionBasis.sourceReference.trim().length > 0 &&
    typeof activation.partitionBasis.approvedBy === 'string' &&
    activation.partitionBasis.approvedBy.trim().length > 0 &&
    typeof activation.partitionBasis.approvedAt === 'string' &&
    !Number.isNaN(Date.parse(activation.partitionBasis.approvedAt));

  const components = Object.fromEntries(TRANSFER_COMPONENTS.map((component) => {
    const prior = base.components[component];
    const { De_c, De_d } = componentDiffusivities(activation, component);
    /** Sc is recomputed from this exact activated local property/diffusivity state. */
    const Sc_c = De_c && isFinitePositive(De_c.value_m2_s)
      ? h.mu_c.value / (h.rho_c_kg_m3 * De_c.value_m2_s)
      : null;
    const Sc_d = De_d && isFinitePositive(De_d.value_m2_s)
      ? h.mu_d.value / (h.rho_d_kg_m3 * De_d.value_m2_s)
      : null;
    const commonInputMessage = localStateIssue ?? hydroIssue ??
      (groupsInvalid ? 'Re_d and κ must be positive finite local dimensionless inputs.' : null);

    let Sh_c: number | ECR2NullField;
    let Sh_d: number | ECR2NullField;
    let k_c_m_s: number | ECR2NullField;
    let k_d_m_s: number | ECR2NullField;
    let shcStatus: ECR2KH1999OutputState;
    let shdStatus: ECR2KH1999OutputState;
    let kcStatus: ECR2KH1999OutputState;
    let kdStatus: ECR2KH1999OutputState;

    if (d32Invalid) {
      const blocked = unavailable('blocked_by_d32', d32Issue ?? 'd₃₂ must be supplied by a governed calculated, engineer-entered, or measured route; no default is used.');
      Sh_c = blocked;
      Sh_d = blocked;
      k_c_m_s = blocked;
      k_d_m_s = blocked;
      shcStatus = outputState('blocked_by_missing_d32', blocked.message);
      shdStatus = outputState('blocked_by_missing_d32', blocked.message);
      kcStatus = outputState('blocked_by_missing_d32', blocked.message);
      kdStatus = outputState('blocked_by_missing_d32', blocked.message);
    } else if (hydroIssue?.startsWith('Usable holdup')) {
      const blocked = unavailable('blocked_by_holdup', hydroIssue);
      Sh_c = blocked;
      Sh_d = blocked;
      k_c_m_s = blocked;
      k_d_m_s = blocked;
      shcStatus = outputState('blocked_by_invalid_holdup', hydroIssue);
      shdStatus = outputState('blocked_by_invalid_holdup', hydroIssue);
      kcStatus = outputState('blocked_by_invalid_holdup', hydroIssue);
      kdStatus = outputState('blocked_by_invalid_holdup', hydroIssue);
    } else if (commonInputMessage) {
      const blocked = unavailable('blocked_by_local_properties', commonInputMessage);
      Sh_c = blocked;
      Sh_d = blocked;
      k_c_m_s = blocked;
      k_d_m_s = blocked;
      shcStatus = outputState('not_calculable', commonInputMessage);
      shdStatus = outputState('not_calculable', commonInputMessage);
      kcStatus = outputState('not_calculable', commonInputMessage);
      kdStatus = outputState('not_calculable', commonInputMessage);
    } else {
      const De_cIssue = diffusivityProvenanceIssue(De_c);
      if (De_cIssue || !isFinitePositive(Sc_c)) {
        Sh_c = unavailable('blocked_by_De', `Sh_c (${component}) requires provenance-tagged continuous-phase diffusivity and Sc_c.`);
        k_c_m_s = unavailable('blocked_by_De', `k_c (${component}) requires provenance-tagged continuous-phase diffusivity.`);
        shcStatus = outputState('blocked_by_missing_diffusivity', Sh_c.message);
        kcStatus = outputState('blocked_by_missing_diffusivity', k_c_m_s.message);
      } else if (isNullField(C1)) {
        Sh_c = C1;
        k_c_m_s = unavailable('blocked_by_kc', `k_c (${component}) is blocked because scoped Kühni C1 is invalid.`);
        shcStatus = outputState('blocked_by_invalid_c1_scope', C1.message);
        kcStatus = outputState('blocked_by_invalid_c1_scope', k_c_m_s.message);
      } else {
        const calculated = calculateShc({
          Re: re,
          Sc_c,
          De_c: De_c!.value_m2_s,
          d32_m,
          kappa,
          h,
          C1,
        });
        if (!calculated) {
          Sh_c = unavailable('correlation_unresolved', `Sh_c (${component}) produced a non-physical numerical result; no clamp was applied.`);
          k_c_m_s = unavailable('blocked_by_kc', `k_c (${component}) is blocked because Sh_c is non-physical.`);
          shcStatus = outputState('not_calculable', Sh_c.message);
          kcStatus = outputState('not_calculable', k_c_m_s.message);
        } else {
          Sh_c = calculated.Sh_c;
          k_c_m_s = calculated.Sh_c * De_c!.value_m2_s / d32_m;
          shcStatus = outputState('calculated_preliminary', 'Sh_c calculated with the registered continuous-side K&H equation and scoped Kühni C1 = 7.5.');
          kcStatus = outputState('calculated_preliminary', 'k_c = Sh_c·D_c/d₃₂ (m/s).');
        }
      }

      const De_dIssue = diffusivityProvenanceIssue(De_d);
      if (De_dIssue || !isFinitePositive(Sc_d)) {
        Sh_d = unavailable('blocked_by_De', `Sh_d (${component}) requires provenance-tagged dispersed-phase diffusivity and Sc_d.`);
        k_d_m_s = unavailable('blocked_by_De', `k_d (${component}) requires provenance-tagged dispersed-phase diffusivity.`);
        shdStatus = outputState('blocked_by_missing_diffusivity', Sh_d.message);
        kdStatus = outputState('blocked_by_missing_diffusivity', k_d_m_s.message);
      } else {
        const calculated = calculateShd({
          Re: re,
          Sc_d,
          kappa,
          h,
        });
        if (!calculated) {
          Sh_d = unavailable('correlation_unresolved', `Sh_d (${component}) produced a non-physical numerical result; no clamp was applied.`);
          k_d_m_s = unavailable('blocked_by_kd', `k_d (${component}) is blocked because Sh_d is non-physical.`);
          shdStatus = outputState('not_calculable', Sh_d.message);
          kdStatus = outputState('not_calculable', k_d_m_s.message);
        } else {
          Sh_d = calculated;
          k_d_m_s = calculated * De_d!.value_m2_s / d32_m;
          shdStatus = outputState('calculated_preliminary', 'Sh_d calculated with the registered dispersed-side K&H single-drop correlation.');
          kdStatus = outputState('calculated_preliminary', 'k_d = Sh_d·D_d/d₃₂ (m/s).');
        }
      }
    }

    let K_overall_m_s: number | ECR2NullField;
    let K_oa_per_s: number | ECR2NullField;
    let drivingForce_dispersed_kg_m3: number | ECR2NullField;
    let transferRate_kg_m3_s: number | ECR2NullField;
    let KoverallStatus: ECR2KH1999OutputState;
    let KoaStatus: ECR2KH1999OutputState;
    let drivingForceStatus: ECR2KH1999OutputState;
    let transferRateStatus: ECR2KH1999OutputState;

    if (!partitionApproved) {
      const blocked = unavailable(
        'blocked_by_Kd_partition',
        'ENGINEER_PARTITION_BASIS_REQUIRED: K_d is not assumed to equal m, K_x, or K_C. Supply an engineer-approved governed K_d concentration basis.',
      );
      K_overall_m_s = blocked;
      K_oa_per_s = unavailable('blocked_by_K_overall', 'Koa is blocked until K_overall has an approved partition basis.');
      drivingForce_dispersed_kg_m3 = blocked;
      transferRate_kg_m3_s = unavailable('blocked_by_K_overall', 'Transfer rate is blocked until Koa and the approved driving-force convention are available.');
      KoverallStatus = outputState('engineer_partition_basis_required', blocked.message);
      KoaStatus = outputState('blocked_by_K_overall', K_oa_per_s.message);
      drivingForceStatus = outputState('engineer_partition_basis_required', blocked.message);
      transferRateStatus = outputState('blocked_by_K_overall', transferRate_kg_m3_s.message);
    } else if (typeof k_c_m_s !== 'number' || typeof k_d_m_s !== 'number' || typeof prior.K_d_partition !== 'number') {
      K_overall_m_s = unavailable('blocked_by_kc', 'K_overall requires calculated k_c, k_d, and concentration-basis K_d.');
      K_oa_per_s = unavailable('blocked_by_K_overall', 'Koa is blocked because K_overall is unavailable.');
      drivingForce_dispersed_kg_m3 = unavailable('blocked_by_K_overall', 'Driving force is retained only when its approved partition basis and K_overall are both available.');
      transferRate_kg_m3_s = unavailable('blocked_by_K_overall', 'Transfer rate is blocked because Koa is unavailable.');
      KoverallStatus = outputState('not_calculable', K_overall_m_s.message);
      KoaStatus = outputState('blocked_by_K_overall', K_oa_per_s.message);
      drivingForceStatus = outputState('blocked_by_K_overall', drivingForce_dispersed_kg_m3.message);
      transferRateStatus = outputState('blocked_by_K_overall', transferRate_kg_m3_s.message);
    } else {
      const denominator = prior.K_d_partition * k_d_m_s + k_c_m_s;
      const calculatedOverall = denominator > 0
        ? (k_c_m_s * k_d_m_s) / denominator
        : null;
      if (!numeric(calculatedOverall) || calculatedOverall <= 0) {
        K_overall_m_s = unavailable('correlation_unresolved', 'K_overall two-film equation produced a non-physical result; no clamp was applied.');
        K_oa_per_s = unavailable('blocked_by_K_overall', 'Koa is blocked because K_overall is non-physical.');
        drivingForce_dispersed_kg_m3 = unavailable('blocked_by_K_overall', 'Driving force is blocked because K_overall is non-physical.');
        transferRate_kg_m3_s = unavailable('blocked_by_K_overall', 'Transfer rate is blocked because Koa is unavailable.');
        KoverallStatus = outputState('not_calculable', K_overall_m_s.message);
        KoaStatus = outputState('blocked_by_K_overall', K_oa_per_s.message);
        drivingForceStatus = outputState('blocked_by_K_overall', drivingForce_dispersed_kg_m3.message);
        transferRateStatus = outputState('blocked_by_K_overall', transferRate_kg_m3_s.message);
      } else {
        K_overall_m_s = calculatedOverall;
        KoverallStatus = outputState('calculated_preliminary', 'K_overall = k_c·k_d / (K_d·k_d + k_c) (m/s) using the explicit approved K_d concentration basis.');
        if (areaInvalid) {
          K_oa_per_s = unavailable('blocked_by_interfacial_area', 'Koa requires positive usable interfacial area a = 6φ/d₃₂.');
          KoaStatus = outputState('not_calculable', K_oa_per_s.message);
        } else {
          K_oa_per_s = calculatedOverall * interfacialArea_m2_m3;
          KoaStatus = outputState('calculated_preliminary', 'Koa = K_overall·a (1/s).');
        }
        if (typeof prior.drivingForce_dispersed_kg_m3 === 'number') {
          drivingForce_dispersed_kg_m3 = prior.drivingForce_dispersed_kg_m3;
          drivingForceStatus = outputState('calculated_preliminary', 'ΔC_d = C_d − K_d·C_c on the approved dispersed mass-concentration basis.');
        } else {
          drivingForce_dispersed_kg_m3 = unavailable('blocked_by_composition', 'Driving force requires valid local bulk and equilibrium mass concentrations.');
          drivingForceStatus = outputState('not_calculable', drivingForce_dispersed_kg_m3.message);
        }
        if (typeof K_oa_per_s === 'number' && typeof drivingForce_dispersed_kg_m3 === 'number') {
          transferRate_kg_m3_s = K_oa_per_s * drivingForce_dispersed_kg_m3;
          transferRateStatus = outputState('calculated_preliminary', 'Local transfer rate = Koa·ΔC_d (kg/m³/s); positive direction is dispersed → continuous.');
        } else {
          transferRate_kg_m3_s = unavailable('blocked_by_K_overall', 'Transfer rate requires calculated Koa and the approved concentration driving force.');
          transferRateStatus = outputState('blocked_by_K_overall', transferRate_kg_m3_s.message);
        }
      }
    }

    return [component, {
      ...prior,
      Sc_c: isFinitePositive(Sc_c) ? Sc_c : prior.Sc_c,
      Sc_d: isFinitePositive(Sc_d) ? Sc_d : prior.Sc_d,
      Sh_c,
      Sh_d,
      k_c_m_s,
      k_d_m_s,
      K_od_m_s: K_overall_m_s,
      K_overall_m_s,
      K_oa_per_s,
      drivingForce_dispersed_kg_m3,
      transferRate_kg_m3_s,
      outputStatus: {
        Sh_c: shcStatus,
        Sh_d: shdStatus,
        k_c: kcStatus,
        k_d: kdStatus,
        K_overall: KoverallStatus,
        Koa: KoaStatus,
        drivingForce: drivingForceStatus,
        transferRate: transferRateStatus,
      },
    }];
  })) as Record<TransferComponent, ECR2KH1999ComponentResult>;

  return {
    ...base,
    components,
    d32_m: d32Invalid ? null : d32_m,
    interfacialArea_m2_m3: areaInvalid ? null : interfacialArea_m2_m3,
    governance: {
      ...PRELIMINARY_GOVERNANCE,
      engineerInputs: {
        diffusivity: activation.diffusivity,
        d32: activation.d32,
        localProperties: { mu_c: activation.hydrodynamics.mu_c, mu_d: activation.hydrodynamics.mu_d, sigma: activation.hydrodynamics.sigma },
      },
    },
    diagnostics: [
      ...base.diagnostics,
      'Local numerical activation only: no axial propagation, BVP, column outlet prediction, flooding optimization, optimizer, or UI was invoked.',
      'ψ basis: Thermopac preliminary interpretation of K&H power dissipated per unit mass, ψ = (P/V)/ρ_mix_phase1; it is not primary-source verified.',
    ],
  };
}

/**
 * Phase-1 compartments have no local compositions/properties. This helper
 * gives every component an explicit, typed preliminary outcome rather than a
 * false numeric mass-transfer value.
 */
export function createUnavailableKH1999PreliminaryLocalMassTransfer(
  message = 'Phase-1 scaffold has no local NRTL phase compositions, local physical properties, or engineer-supplied diffusivity contract.',
): ECR2KH1999LocalMassTransferResult {
  const blocked = unavailable('phase_2_not_implemented', message);
  const components = Object.fromEntries(TRANSFER_COMPONENTS.map((component) => [
    component,
    {
      component,
      Sc_c: blocked,
      Sc_d: blocked,
      C_c_bulk_kg_m3: blocked,
      C_d_bulk_kg_m3: blocked,
      C_c_equilibrium_kg_m3: blocked,
      C_d_equilibrium_kg_m3: blocked,
      K_d_partition: blocked,
      drivingForce_dispersed_kg_m3: blocked,
      Sh_c: unavailableSherwood(component, 'Sh_c'),
      Sh_d: unavailableSherwood(component, 'Sh_d'),
      k_c_m_s: unavailableSherwood(component, 'k_c'),
      k_d_m_s: unavailableSherwood(component, 'k_d'),
      K_od_m_s: unavailableSherwood(component, 'K_od'),
      K_overall_m_s: unavailableSherwood(component, 'K_overall'),
      K_oa_per_s: unavailableSherwood(component, 'K_oa'),
      transferRate_kg_m3_s: unavailableSherwood(component, 'Transfer rate'),
      outputStatus: inactiveOutputStatuses(),
    },
  ])) as Record<TransferComponent, ECR2KH1999ComponentResult>;

  return {
    status: 'MASS_TRANSFER_PRELIMINARY',
    engineeringBasis: 'Published Correlation — Preliminary Engineering',
    phaseConvention: {
      continuous: 'NMP-rich',
      dispersed: 'RRBO-rich',
      positiveTransfer: 'RRBO/dispersed → NMP/continuous',
    },
    parameters: ECR2_KH1999_PRELIMINARY_PARAMETERS,
    dimensionless: null,
    schmidt: null,
    ReynoldsApplicability: 'not_available',
    d32_m: null,
    localDensityBasis: null,
    interfacialArea_m2_m3: null,
    components,
    governance: {
      ...PRELIMINARY_GOVERNANCE,
      engineerInputs: { diffusivity: null, d32: null, localProperties: null },
    },
    unresolvedItems: UNRESOLVED_SHERWOOD_ITEMS,
    diagnostics: [
      message,
      'The preliminary kernel is present but no Phase-1 scaffold field is treated as a local composition or local property substitute.',
    ],
  };
}