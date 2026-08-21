// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — K&H 1999 Preliminary Local Mass-Transfer Kernel
//
// This module deliberately stops before Sherwood-number evaluation. The current
// registry records secondary-source Sh_c / Sh_d structures and a scoped Kühni
// continuous-side C1. It does not supply a governed Kühni psi definition,
// Kühni dispersed-side C2, drop-regime selector, or overall-resistance basis.
// Applying a numerical correlation before those gates clear would invent one.
//
// Source-backed work implemented here:
//   · physical mole-fraction → component mass-concentration conversion
//   · K_d,i = C_d,i* / C_c,i* on an equilibrium mass-concentration basis
//   · ΔC_d,i = C_d,i − K_d,i C_c,i (positive: RRBO/d → NMP/c)
//   · preservation of dimensionless / Schmidt inputs and applicability labels
//
// Not implemented by design:
//   Sh_c, Sh_d, k_c, k_d, K_od, K_oa, or r_i.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ECR2AllSchmidtNumbers,
} from './llx-ecr2-diffusivity';
import type {
  ECR2DimensionlessResult,
} from './llx-ecr2-dimensionless';
import {
  nullField,
  type ECR2NullField,
} from './llx-ecr2-compartment-state';
import {
  ECR2_KH1999_PRELIMINARY_PARAMETERS,
  type ECR2KH1999PreliminaryParameter,
} from './llx-ecr2-correlation-registry';

export const TRANSFER_COMPONENTS = ['Sat', 'Mono', 'Di', 'Poly'] as const;
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
  Sh_c: ECR2NullField;
  Sh_d: ECR2NullField;
  k_c_m_s: ECR2NullField;
  k_d_m_s: ECR2NullField;
  K_od_m_s: ECR2NullField;
  K_oa_per_s: ECR2NullField;
  transferRate_kg_m3_s: ECR2NullField;
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
  interfacialArea_m2_m3: number | null;
  components: Record<TransferComponent, ECR2KH1999ComponentResult>;
  unresolvedItems: readonly string[];
  diagnostics: string[];
}

const MW_KEYS: Record<TransferComponent, keyof ECR2PhysicalMolecularWeightVector> = {
  Sat: 'Sat_g_mol',
  Mono: 'Mono_g_mol',
  Di: 'Di_g_mol',
  Poly: 'Poly_g_mol',
};

const COMPONENT_INDEX: Record<TransferComponent, 0 | 1 | 2 | 3> = {
  Sat: 0,
  Mono: 1,
  Di: 2,
  Poly: 3,
};

const UNRESOLVED_SHERWOOD_ITEMS = [
  'Governed Kühni ψ definition for the secondary-recorded power correction.',
  'Kühni-specific dispersed-side C2.',
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
  reason: 'blocked_by_composition' | 'blocked_by_Kd_partition' | 'correlation_unresolved' | 'phase_2_not_implemented',
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
      `Kühni ψ, dispersed-side C2, regime selection, and overall-resistance basis remain unresolved. No numerical reconstruction was invented.`,
  );
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
      K_oa_per_s: unavailableSherwood(component, 'K_oa'),
      transferRate_kg_m3_s: unavailableSherwood(component, 'Transfer rate'),
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
    interfacialArea_m2_m3: params.interfacialArea_m2_m3,
    components,
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
      K_oa_per_s: unavailableSherwood(component, 'K_oa'),
      transferRate_kg_m3_s: unavailableSherwood(component, 'Transfer rate'),
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
    interfacialArea_m2_m3: null,
    components,
    unresolvedItems: UNRESOLVED_SHERWOOD_ITEMS,
    diagnostics: [
      message,
      'The preliminary kernel is present but no Phase-1 scaffold field is treated as a local composition or local property substitute.',
    ],
  };
}