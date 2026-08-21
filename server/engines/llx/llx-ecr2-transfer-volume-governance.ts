// ═══════════════════════════════════════════════════════════════════════════
// ECR-2 — Effective Transfer Volume Governance
//
// This module freezes the compartment-volume basis for a future rate-based
// counter-current BVP. It does not perform axial propagation, solve a BVP, or
// modify the local K&H 1999 mass-transfer kernel.
//
// Existing ECR-2 geometry defines the modeled compartment volume as A_col·h.
// Rotor area and stator open-area fraction are used in existing mechanical and
// hydraulic calculations only; the current model contains no governed solid
// displacement, vapor-volume, or liquid-fraction subtraction.
// ═══════════════════════════════════════════════════════════════════════════

export interface ECR2EffectiveTransferVolumeGovernance {
  volumeBasis: 'total_active_liquid_compartment_volume';
  interfacialAreaBasis: 'interfacial_area_per_total_active_liquid_volume';
  transferRateVolumeBasis: 'total_active_liquid_compartment_volume';
  /**
   * The modeled active liquid volume is the existing compartment geometry
   * A_column × Δz. No separate liquid-fraction parameter exists in ECR-2.
   */
  activeLiquidVolumeDefinition: 'column_cross_section_area_times_compartment_height';
  /**
   * No rotor, stator, shaft, internals, vapor, or free-volume deduction is
   * present in the existing model. This is an explicit "no invented factor"
   * rule, not an assertion that physical hardware has zero displacement.
   */
  internalsDisplacementTreatment: 'not_modelled_no_subtraction';
  /**
   * Specific area a = 6φd/d32 already includes dispersed-phase holdup.
   * Downstream transfer-volume conversion must not multiply by φd, (1−φd), or
   * a again.
   */
  holdupApplication: 'incorporated_once_in_specific_interfacial_area';
  noSecondHoldupMultiplier: true;
}

export const ECR2_EFFECTIVE_TRANSFER_VOLUME_GOVERNANCE: ECR2EffectiveTransferVolumeGovernance = {
  volumeBasis: 'total_active_liquid_compartment_volume',
  interfacialAreaBasis: 'interfacial_area_per_total_active_liquid_volume',
  transferRateVolumeBasis: 'total_active_liquid_compartment_volume',
  activeLiquidVolumeDefinition: 'column_cross_section_area_times_compartment_height',
  internalsDisplacementTreatment: 'not_modelled_no_subtraction',
  holdupApplication: 'incorporated_once_in_specific_interfacial_area',
  noSecondHoldupMultiplier: true,
} as const;

export interface ECR2CompartmentActiveLiquidVolumeInputs {
  /** Existing ECR-2 active column cross-sectional area A_column (m²). */
  columnCrossSectionArea_m2: number;
  /** Existing ECR-2 compartment height Δz = h_comp (m). */
  compartmentHeight_m: number;
}

export interface ECR2CompartmentActiveLiquidVolumeCalculated {
  status: 'calculated';
  /** V_effective = A_column × Δz (m³). */
  activeLiquidVolume_m3: number;
  governance: ECR2EffectiveTransferVolumeGovernance;
  provenance: string;
}

export interface ECR2CompartmentActiveLiquidVolumeInvalid {
  status: 'input_invalid';
  activeLiquidVolume_m3: null;
  governance: ECR2EffectiveTransferVolumeGovernance;
  reasons: string[];
}

export type ECR2CompartmentActiveLiquidVolumeResult =
  | ECR2CompartmentActiveLiquidVolumeCalculated
  | ECR2CompartmentActiveLiquidVolumeInvalid;

/**
 * Resolves the only active-liquid volume definition supported by current ECR-2
 * geometry. There is deliberately no fallback volume and no inferred internals
 * displacement factor.
 */
export function computeECR2CompartmentActiveLiquidVolume(
  inputs: ECR2CompartmentActiveLiquidVolumeInputs,
): ECR2CompartmentActiveLiquidVolumeResult {
  const reasons: string[] = [];
  if (!Number.isFinite(inputs.columnCrossSectionArea_m2) || inputs.columnCrossSectionArea_m2 <= 0) {
    reasons.push('columnCrossSectionArea_m2 must be a finite number > 0.');
  }
  if (!Number.isFinite(inputs.compartmentHeight_m) || inputs.compartmentHeight_m <= 0) {
    reasons.push('compartmentHeight_m must be a finite number > 0.');
  }

  if (reasons.length > 0) {
    return {
      status: 'input_invalid',
      activeLiquidVolume_m3: null,
      governance: ECR2_EFFECTIVE_TRANSFER_VOLUME_GOVERNANCE,
      reasons,
    };
  }

  const activeLiquidVolume_m3 =
    inputs.columnCrossSectionArea_m2 * inputs.compartmentHeight_m;

  return {
    status: 'calculated',
    activeLiquidVolume_m3,
    governance: ECR2_EFFECTIVE_TRANSFER_VOLUME_GOVERNANCE,
    provenance:
      'V_effective = A_column × Δz. This is the total modeled active liquid ' +
      'compartment volume; no rotor/stator/shaft displacement, liquid fraction, ' +
      'or dispersed-holdup multiplier is applied.',
  };
}

export interface ECR2TransferVolumeEquivalenceInputs
  extends ECR2CompartmentActiveLiquidVolumeInputs {
  /** Usable dispersed-phase holdup φd (—). */
  phi_d: number;
  /** Sauter mean droplet diameter d32 (m). */
  d32_m: number;
  /** Overall mass-transfer coefficient Koverall (m/s). */
  Koverall_m_s: number;
  /** Dispersed-basis concentration driving force ΔC (kg/m³). May be signed. */
  drivingForce_kg_m3: number;
}

export interface ECR2TransferVolumeEquivalenceCalculated {
  status: 'calculated';
  activeLiquidVolume_m3: number;
  specificInterfacialArea_m2_m3: number;
  interfacialArea_m2: number;
  Koa_per_s: number;
  directTransferRate_kg_s: number;
  volumetricTransferRate_kg_s: number;
  governance: ECR2EffectiveTransferVolumeGovernance;
  provenance: string;
}

export interface ECR2TransferVolumeEquivalenceInvalid {
  status: 'input_invalid';
  governance: ECR2EffectiveTransferVolumeGovernance;
  reasons: string[];
}

export type ECR2TransferVolumeEquivalenceResult =
  | ECR2TransferVolumeEquivalenceCalculated
  | ECR2TransferVolumeEquivalenceInvalid;

/**
 * Dimensional/audit helper for the two algebraically identical forms:
 *
 *   Koverall × A_interface × ΔC
 *   (Koverall × a) × ΔC × V_active
 *
 * It is deliberately not connected to any BVP or local mass-transfer result.
 */
export function computeECR2TransferVolumeEquivalence(
  inputs: ECR2TransferVolumeEquivalenceInputs,
): ECR2TransferVolumeEquivalenceResult {
  const volume = computeECR2CompartmentActiveLiquidVolume(inputs);
  const reasons = volume.status === 'input_invalid' ? [...volume.reasons] : [];

  if (!Number.isFinite(inputs.phi_d) || inputs.phi_d <= 0 || inputs.phi_d >= 1) {
    reasons.push('phi_d must be a finite volume fraction strictly between 0 and 1.');
  }
  if (!Number.isFinite(inputs.d32_m) || inputs.d32_m <= 0) {
    reasons.push('d32_m must be a finite number > 0.');
  }
  if (!Number.isFinite(inputs.Koverall_m_s) || inputs.Koverall_m_s <= 0) {
    reasons.push('Koverall_m_s must be a finite number > 0.');
  }
  if (!Number.isFinite(inputs.drivingForce_kg_m3)) {
    reasons.push('drivingForce_kg_m3 must be finite.');
  }

  if (reasons.length > 0 || volume.status !== 'calculated') {
    return {
      status: 'input_invalid',
      governance: ECR2_EFFECTIVE_TRANSFER_VOLUME_GOVERNANCE,
      reasons,
    };
  }

  // φd appears only here, in a = 6φd/d32. V_active is independent of φd.
  const specificInterfacialArea_m2_m3 = (6 * inputs.phi_d) / inputs.d32_m;
  const interfacialArea_m2 =
    specificInterfacialArea_m2_m3 * volume.activeLiquidVolume_m3;
  const Koa_per_s = inputs.Koverall_m_s * specificInterfacialArea_m2_m3;
  const directTransferRate_kg_s =
    inputs.Koverall_m_s * interfacialArea_m2 * inputs.drivingForce_kg_m3;
  const volumetricTransferRate_kg_s =
    Koa_per_s * inputs.drivingForce_kg_m3 * volume.activeLiquidVolume_m3;

  return {
    status: 'calculated',
    activeLiquidVolume_m3: volume.activeLiquidVolume_m3,
    specificInterfacialArea_m2_m3,
    interfacialArea_m2,
    Koa_per_s,
    directTransferRate_kg_s,
    volumetricTransferRate_kg_s,
    governance: ECR2_EFFECTIVE_TRANSFER_VOLUME_GOVERNANCE,
    provenance:
      'a = 6φd/d32 = A_interface/V_active. Therefore Koverall·A_interface·ΔC ' +
      '= (Koverall·a)·ΔC·V_active. φd is included once in a and is not applied ' +
      'to activeLiquidVolume_m3.',
  };
}