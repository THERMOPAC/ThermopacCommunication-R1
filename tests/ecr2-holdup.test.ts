import { describe, expect, it } from 'vitest';
import {
  computeKH1995Holdup,
  isHoldupUsable,
  type HoldupCalculated,
  type HoldupInputs,
} from '../server/engines/llx/llx-ecr2-holdup';

/**
 * Synthetic reference-system formula fixture within the K&H Table 1 envelope,
 * not a measured published data point or RRBO/NMP validation evidence.
 * Production ECR-2 must identify itself as rrbo_nmp and remains dependency-blocked.
 */
const REFERENCE_DIAMETER_M = 0.10;
const REFERENCE_AREA_M2 = Math.PI * REFERENCE_DIAMETER_M ** 2 / 4;
const REFERENCE_HEIGHT_M = 0.06;
const REFERENCE_RHO_C_KG_M3 = 1000;
const REFERENCE_EPSILON_W_KG = 0.1;

const REFERENCE: HoldupInputs = {
  Ud_m_s: 0.001,
  Uc_m_s: 0.0008,
  rho_c_kg_m3: REFERENCE_RHO_C_KG_M3,
  rho_d_kg_m3: 860,
  mu_c_Pa_s: 0.0012,
  mu_d_Pa_s: 0.001,
  gamma_N_m: 0.0035,
  xf: 0.30,
  // ε = P/(Ac·H·ρc) = 0.1 W/kg
  powerPerAgitator_W: REFERENCE_EPSILON_W_KG * REFERENCE_AREA_M2 * REFERENCE_HEIGHT_M * REFERENCE_RHO_C_KG_M3,
  columnCrossSectionArea_m2: REFERENCE_AREA_M2,
  compartmentHeight_m: REFERENCE_HEIGHT_M,
  columnDiameter_m: REFERENCE_DIAMETER_M,
  rotorDiameter_m: 0.06,
  massTransferDirection: 'no_mass_transfer',
  systemIdentity: 'published_reference_system',
};

const refWith = (overrides: Partial<HoldupInputs>): HoldupInputs => ({ ...REFERENCE, ...overrides });

describe('K&H 1995 primary holdup dependency contract', () => {
  it('keeps synthetic reference geometry and one-agitator power consistent', () => {
    expect(REFERENCE.systemIdentity).toBe('published_reference_system');
    expect(REFERENCE.columnCrossSectionArea_m2).toBeCloseTo(
      Math.PI * REFERENCE.columnDiameter_m ** 2 / 4, 14,
    );
    expect(REFERENCE.powerPerAgitator_W / (
      REFERENCE.columnCrossSectionArea_m2 * REFERENCE.compartmentHeight_m * REFERENCE.rho_c_kg_m3
    )).toBeCloseTo(0.1, 12);
    const result = computeKH1995Holdup(REFERENCE) as HoldupCalculated;
    expect(result.status).toBe('calculated');
    expect(result.governance.validatedForRRBONMP).toBe(false);
  });

  it('uses the primary ε = P/(Ac·H·ρc) power basis', () => {
    const result = computeKH1995Holdup(REFERENCE) as HoldupCalculated;
    expect(result.status).toBe('calculated');
    expect(result.intermediates.epsilon_W_kg).toBeCloseTo(0.1, 12);
    expect(result.governance.powerDissipationBasis).toContain('P/(Ac·H·ρc)');
  });

  it('uses exp(20.7·Uc·θ) without the secondary outer 0.90 exponent', () => {
    const result = computeKH1995Holdup(REFERENCE) as HoldupCalculated;
    const expected = Math.exp(20.7 * result.intermediates.Uc_theta);
    expect(result.status).toBe('calculated');
    expect(result.intermediates.termC).toBeCloseTo(expected, 12);
    expect(result.intermediates.termC).not.toBeCloseTo(Math.pow(expected, 0.90), 8);
  });

  it('applies the primary CΨ factor by published one-way direction', () => {
    const noTransfer = computeKH1995Holdup(REFERENCE) as HoldupCalculated;
    const dToC = computeKH1995Holdup(refWith({
      massTransferDirection: 'dispersed_to_continuous',
    })) as HoldupCalculated;
    expect(noTransfer.intermediates.C_psi).toBe(1);
    expect(dToC.intermediates.C_psi).toBe(0.56);
    expect(dToC.phi / noTransfer.phi).toBeCloseTo(0.56, 12);
  });

  it('does not choose a single CΨ for bidirectional multicomponent transfer', () => {
    const result = computeKH1995Holdup(refWith({
      massTransferDirection: 'bidirectional_multicomponent',
    }));
    expect(result.status).toBe('dependency_blocked');
    if (result.status === 'dependency_blocked') {
      expect(result.phi).toBeNull();
      expect(result.blockedBy).toContain('kh1995_cpsi_bidirectional_multicomponent_unresolved');
    }
    expect(isHoldupUsable(result)).toBe(false);
  });

  it('turns a primary applicability exceedance into a dependency block, never extrapolation', () => {
    const result = computeKH1995Holdup(refWith({ columnDiameter_m: 0.30 }));
    expect(result.status).toBe('dependency_blocked');
    if (result.status === 'dependency_blocked') {
      expect(result.blockedBy.join('|')).toContain('columnDiameter_m');
      expect(result.applicabilityDiagnostics.columnDiameter_m.withinRange).toBe(false);
    }
    expect(isHoldupUsable(result)).toBe(false);
  });

  it('keeps RRBO/NMP dependency-blocked even when numeric inputs are finite', () => {
    const result = computeKH1995Holdup(refWith({
      systemIdentity: 'rrbo_nmp',
      massTransferDirection: 'continuous_to_dispersed',
    }));
    expect(result.status).toBe('dependency_blocked');
    if (result.status === 'dependency_blocked') {
      expect(result.blockedBy).toContain('kh1995_rrbo_nmp_not_validated');
    }
  });

  it('does not clip physically inadmissible raw holdup or call it flooding', () => {
    const result = computeKH1995Holdup(refWith({ powerPerAgitator_W: 6 }));
    expect(result.status).toBe('physically_invalid');
    if (result.status === 'physically_invalid') {
      expect(result.phi).toBeNull();
      expect(result.phi_raw).toBeGreaterThanOrEqual(1);
    }
  });

  it('requires all geometry and viscosity dependencies', () => {
    const result = computeKH1995Holdup(refWith({ rotorDiameter_m: Number.NaN }));
    expect(result.status).toBe('input_missing');
    if (result.status === 'input_missing') {
      expect(result.missing).toContain('rotorDiameter_m');
    }
  });
});