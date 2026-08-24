// ─────────────────────────────────────────────────────────────────────────────
// ECR-2 — Effective Transfer Volume Governance Tests
//
// Uses the existing ECR-2 simulator test geometry: D = 0.6 m and h_comp = 0.5 m.
// Koverall = 1 m/s and ΔC = 1 kg/m³ below are dimensional unit probes, not
// operating data or a new mass-transfer correlation.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';

import {
  computeECR2CompartmentActiveLiquidVolume,
  computeECR2TransferVolumeEquivalence,
  ECR2_EFFECTIVE_TRANSFER_VOLUME_GOVERNANCE,
} from '../server/engines/llx/llx-ecr2-transfer-volume-governance';

const EXISTING_ECR2_TEST_GEOMETRY = {
  columnDiameter_m: 0.6,
  columnDiameterTrials_m: [0.6],
  columnCrossSectionArea_m2: Math.PI * 0.6 ** 2 / 4,
  compartmentHeight_m: 0.5,
};

const DIMENSIONAL_PROBE = {
  ...EXISTING_ECR2_TEST_GEOMETRY,
  phi_d: 0.2,
  d32_m: 0.0005,
  Koverall_m_s: 1,
  drivingForce_kg_m3: 1,
};

function calculatedEquivalence() {
  const result = computeECR2TransferVolumeEquivalence(DIMENSIONAL_PROBE);
  expect(result.status).toBe('calculated');
  if (result.status !== 'calculated') throw new Error('Expected calculated transfer-volume equivalence.');
  return result;
}

describe('ECR-2 effective transfer-volume governance', () => {
  it('freezes total active liquid compartment volume as the volume basis', () => {
    expect(ECR2_EFFECTIVE_TRANSFER_VOLUME_GOVERNANCE).toMatchObject({
      volumeBasis: 'total_active_liquid_compartment_volume',
      interfacialAreaBasis: 'interfacial_area_per_total_active_liquid_volume',
      transferRateVolumeBasis: 'total_active_liquid_compartment_volume',
      noSecondHoldupMultiplier: true,
    });
  });

  it('calculates activeLiquidVolume_m3 = A_column × h_comp with m³ basis', () => {
    const result = computeECR2CompartmentActiveLiquidVolume(EXISTING_ECR2_TEST_GEOMETRY);
    expect(result.status).toBe('calculated');
    if (result.status !== 'calculated') throw new Error('Expected calculated compartment volume.');
    expect(result.activeLiquidVolume_m3).toBeCloseTo(
      EXISTING_ECR2_TEST_GEOMETRY.columnCrossSectionArea_m2 *
        EXISTING_ECR2_TEST_GEOMETRY.compartmentHeight_m,
      15,
    );
  });

  it('derives a = 6φd/d32 with units m²/m³ = 1/m', () => {
    const result = calculatedEquivalence();
    expect(result.specificInterfacialArea_m2_m3).toBeCloseTo(
      (6 * DIMENSIONAL_PROBE.phi_d) / DIMENSIONAL_PROBE.d32_m,
      15,
    );
    expect(result.specificInterfacialArea_m2_m3).toBeGreaterThan(0);
  });

  it('proves a × V_active = A_interface in m²', () => {
    const result = calculatedEquivalence();
    expect(result.interfacialArea_m2).toBeCloseTo(
      result.specificInterfacialArea_m2_m3 * result.activeLiquidVolume_m3,
      15,
    );
  });

  it('gives kg/s from Koverall × A_interface × ΔC', () => {
    const result = calculatedEquivalence();
    expect(result.directTransferRate_kg_s).toBeCloseTo(
      DIMENSIONAL_PROBE.Koverall_m_s *
        result.interfacialArea_m2 *
        DIMENSIONAL_PROBE.drivingForce_kg_m3,
      15,
    );
  });

  it('gives kg/s from Koa × V_active × ΔC', () => {
    const result = calculatedEquivalence();
    expect(result.volumetricTransferRate_kg_s).toBeCloseTo(
      result.Koa_per_s *
        result.activeLiquidVolume_m3 *
        DIMENSIONAL_PROBE.drivingForce_kg_m3,
      15,
    );
  });

  it('proves direct-area and volumetric transfer formulations are identical', () => {
    const result = calculatedEquivalence();
    expect(result.directTransferRate_kg_s).toBeCloseTo(
      result.volumetricTransferRate_kg_s,
      15,
    );
  });

  it('applies phi_d exactly once: phi_d changes a and A_interface proportionally', () => {
    const base = calculatedEquivalence();
    const doubledPhi = computeECR2TransferVolumeEquivalence({
      ...DIMENSIONAL_PROBE,
      phi_d: DIMENSIONAL_PROBE.phi_d * 2,
    });
    expect(doubledPhi.status).toBe('calculated');
    if (doubledPhi.status !== 'calculated') throw new Error('Expected calculated doubled-holdup probe.');

    expect(doubledPhi.specificInterfacialArea_m2_m3).toBeCloseTo(
      2 * base.specificInterfacialArea_m2_m3,
      15,
    );
    expect(doubledPhi.interfacialArea_m2).toBeCloseTo(2 * base.interfacialArea_m2, 15);
    expect(doubledPhi.directTransferRate_kg_s).toBeCloseTo(2 * base.directTransferRate_kg_s, 15);
  });

  it('does not silently change active liquid volume with phi_d', () => {
    const base = calculatedEquivalence();
    const changedPhi = computeECR2TransferVolumeEquivalence({
      ...DIMENSIONAL_PROBE,
      phi_d: 0.3,
    });
    expect(changedPhi.status).toBe('calculated');
    if (changedPhi.status !== 'calculated') throw new Error('Expected calculated changed-holdup probe.');

    expect(changedPhi.activeLiquidVolume_m3).toBeCloseTo(base.activeLiquidVolume_m3, 15);
  });

  it('uses no invented rotor, stator, shaft, vapor, or liquid-fraction deduction', () => {
    const result = computeECR2CompartmentActiveLiquidVolume(EXISTING_ECR2_TEST_GEOMETRY);
    expect(result.governance.internalsDisplacementTreatment).toBe('not_modelled_no_subtraction');
    expect(result.governance.activeLiquidVolumeDefinition)
      .toBe('column_cross_section_area_times_compartment_height');
  });

  it('fails closed for invalid geometry with no hidden fallback volume', () => {
    const result = computeECR2CompartmentActiveLiquidVolume({
      columnCrossSectionArea_m2: 0,
      compartmentHeight_m: Number.NaN,
    });
    expect(result).toMatchObject({
      status: 'input_invalid',
      activeLiquidVolume_m3: null,
    });
    if (result.status === 'input_invalid') {
      expect(result.reasons).toHaveLength(2);
    }
  });
});