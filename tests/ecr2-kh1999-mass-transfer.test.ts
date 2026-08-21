import { describe, expect, it } from 'vitest';

import {
  computeAllSchmidtNumbers,
  emptyDiffusivityContract,
  type DiffusivityInput,
  type ECR2DiffusivityContract,
} from '../server/engines/llx/llx-ecr2-diffusivity';
import { computeDimensionlessNumbers } from '../server/engines/llx/llx-ecr2-dimensionless';
import {
  computeLocalProperties,
  isPropertyAvailable,
  type ECR2EngineerPropertyInput,
} from '../server/engines/llx/llx-ecr2-local-properties';
import { computeLocalNRTL } from '../server/engines/llx/llx-ecr2-local-nrtl';
import {
  ECR2_KH1999_PRELIMINARY_PARAMETERS,
  validateKH1999PreliminaryParameterRegistry,
} from '../server/engines/llx/llx-ecr2-correlation-registry';
import {
  computePhysicalComponentMassConcentrations,
  createUnavailableKH1999PreliminaryLocalMassTransfer,
  evaluateKH1999PreliminaryLocalMassTransfer,
  type ECR2PhysicalMolecularWeightVector,
  type FiveComponentVector,
} from '../server/engines/llx/llx-ecr2-kh1999-mass-transfer';

const MW: ECR2PhysicalMolecularWeightVector = {
  Sat_g_mol: 330,
  Mono_g_mol: 300,
  Di_g_mol: 350,
  Poly_g_mol: 430,
  NMP_g_mol: 99.13,
};

const MU_D: ECR2EngineerPropertyInput = {
  value: 0.008,
  unit: 'Pa.s',
  sourceType: 'Assumed',
  sourceReference: 'Unit-test RRBO viscosity',
};

const SIGMA: ECR2EngineerPropertyInput = {
  value: 0.012,
  unit: 'N/m',
  sourceType: 'Assumed',
  sourceReference: 'Unit-test NMP/RRBO interfacial tension',
};

const DIFFUSIVITY: DiffusivityInput = {
  value_m2_s: 2.1e-9,
  sourceType: 'Assumed',
  sourceReference: 'Unit-test diffusivity',
  referenceTemperature_C: 70,
  method: 'Test fixture',
  status: 'engineer_supplied',
};

const DIFFUSIVITIES: ECR2DiffusivityContract = {
  Sat: { De_c: DIFFUSIVITY, De_d: { ...DIFFUSIVITY, value_m2_s: 1.4e-9 } },
  Mono: { De_c: DIFFUSIVITY, De_d: { ...DIFFUSIVITY, value_m2_s: 1.2e-9 } },
  Di: { De_c: DIFFUSIVITY, De_d: { ...DIFFUSIVITY, value_m2_s: 1.0e-9 } },
  Poly: { De_c: DIFFUSIVITY, De_d: { ...DIFFUSIVITY, value_m2_s: 0.8e-9 } },
};

function validKernelSupport(diffusivity = DIFFUSIVITIES) {
  const properties = computeLocalProperties({
    T_C: 70,
    mu_d_engineer: MU_D,
    sigma_engineer: SIGMA,
  });
  expect(isPropertyAvailable(properties.rho_c)).toBe(true);
  expect(isPropertyAvailable(properties.rho_d)).toBe(true);
  const rho_c = isPropertyAvailable(properties.rho_c) ? properties.rho_c.value : 0;
  const rho_d = isPropertyAvailable(properties.rho_d) ? properties.rho_d.value : 0;
  const dimensionless = computeDimensionlessNumbers({
    U_slip_m_s: 0.001,
    d32_m: 0.0005,
    rho_c: properties.rho_c,
    mu_c: properties.mu_c,
    mu_d: properties.mu_d,
    sigma: properties.sigma,
  });
  const schmidt = computeAllSchmidtNumbers({
    diffusivity,
    rho_c: properties.rho_c,
    rho_d: properties.rho_d,
    mu_c: properties.mu_c,
    mu_d: properties.mu_d,
  });
  return { rho_c, rho_d, dimensionless, schmidt };
}

describe('ECR-2 K&H 1999 preliminary mass-transfer kernel', () => {
  it('stores the supplied constants with their roles and prevents symbol-role collisions', () => {
    expect(validateKH1999PreliminaryParameterRegistry()).toEqual([]);
    expect(ECR2_KH1999_PRELIMINARY_PARAMETERS).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'C1', value: 0.90, phaseRole: 'continuous' }),
      expect.objectContaining({ id: 'C2', value: 0.45, phaseRole: 'dispersed' }),
      expect.objectContaining({ id: 'Fc', value: 0.76, phaseRole: 'continuous' }),
      expect.objectContaining({ id: 'Fd', value: 0.58, phaseRole: 'dispersed' }),
    ]));
    expect(ECR2_KH1999_PRELIMINARY_PARAMETERS.every(
      (parameter) => parameter.equationPlacement === 'unresolved_do_not_apply_numerically',
    )).toBe(true);
  });

  it('converts NRTL coordinates to physical concentrations without changing the coordinate vector', () => {
    const coordinate: FiveComponentVector = [0.04, 0.03, 0.02, 0.01, 0.90];
    const original = [...coordinate];
    const result = computePhysicalComponentMassConcentrations({
      phase: 'continuous_nmp_rich',
      phaseMoleFractions: coordinate,
      phaseDensity_kg_m3: 900,
      molecularWeights: MW,
    });
    expect('components' in result).toBe(true);
    if (!('components' in result)) throw new Error('expected physical concentration basis');
    expect(coordinate).toEqual(original);
    expect(result.components.Sat.concentration_kg_m3).toBeGreaterThan(0);
    expect(result.components.Sat.physicalMassFraction).not.toBe(coordinate[0]);
  });

  it('uses equilibrium mass concentrations for Kd and gives zero driving force at equilibrium', () => {
    const { rho_c, rho_d, dimensionless, schmidt } = validKernelSupport();
    const continuous: FiveComponentVector = [0.04, 0.03, 0.02, 0.01, 0.90];
    const dispersed: FiveComponentVector = [0.42, 0.28, 0.14, 0.10, 0.06];
    const result = evaluateKH1999PreliminaryLocalMassTransfer({
      continuous_bulk: continuous,
      dispersed_bulk: dispersed,
      continuous_equilibrium: continuous,
      dispersed_equilibrium: dispersed,
      rho_c_bulk_kg_m3: rho_c,
      rho_d_bulk_kg_m3: rho_d,
      rho_c_equilibrium_kg_m3: rho_c,
      rho_d_equilibrium_kg_m3: rho_d,
      molecularWeights: MW,
      dimensionless,
      schmidt,
      d32_m: 0.0005,
      interfacialArea_m2_m3: 120,
    });

    expect(result.status).toBe('MASS_TRANSFER_PRELIMINARY');
    expect(result.phaseConvention).toEqual(expect.objectContaining({
      continuous: 'NMP-rich',
      dispersed: 'RRBO-rich',
    }));
    expect(result.components.Sat.K_d_partition).toEqual(expect.any(Number));
    expect(result.components.Sat.drivingForce_dispersed_kg_m3).toBeCloseTo(0, 12);
    expect(result.components.Sat.Sh_c.reason).toBe('correlation_unresolved');
    expect(result.components.Sat.k_c_m_s.reason).toBe('correlation_unresolved');
    expect(result.components.Sat.K_oa_per_s.reason).toBe('correlation_unresolved');
  });

  it('keeps physical MW effects out of NRTL coordinates while exposing their physical transport effect', () => {
    const { rho_c, rho_d, dimensionless, schmidt } = validKernelSupport();
    const continuous: FiveComponentVector = [0.04, 0.03, 0.02, 0.01, 0.90];
    const dispersed: FiveComponentVector = [0.42, 0.28, 0.14, 0.10, 0.06];
    const alteredMw = { ...MW, Sat_g_mol: 500 };
    const base = evaluateKH1999PreliminaryLocalMassTransfer({
      continuous_bulk: continuous, dispersed_bulk: dispersed,
      continuous_equilibrium: continuous, dispersed_equilibrium: dispersed,
      rho_c_bulk_kg_m3: rho_c, rho_d_bulk_kg_m3: rho_d,
      rho_c_equilibrium_kg_m3: rho_c, rho_d_equilibrium_kg_m3: rho_d, molecularWeights: MW,
      dimensionless, schmidt, d32_m: 0.0005, interfacialArea_m2_m3: 120,
    });
    const changed = evaluateKH1999PreliminaryLocalMassTransfer({
      continuous_bulk: continuous, dispersed_bulk: dispersed,
      continuous_equilibrium: continuous, dispersed_equilibrium: dispersed,
      rho_c_bulk_kg_m3: rho_c, rho_d_bulk_kg_m3: rho_d,
      rho_c_equilibrium_kg_m3: rho_c, rho_d_equilibrium_kg_m3: rho_d, molecularWeights: alteredMw,
      dimensionless, schmidt, d32_m: 0.0005, interfacialArea_m2_m3: 120,
    });
    expect(continuous).toEqual([0.04, 0.03, 0.02, 0.01, 0.90]);
    expect(dispersed).toEqual([0.42, 0.28, 0.14, 0.10, 0.06]);
    expect(changed.components.Sat.K_d_partition).not.toEqual(base.components.Sat.K_d_partition);
  });

  it('propagates missing diffusivity without inserting a fallback diffusivity', () => {
    const { rho_c, rho_d, dimensionless, schmidt } = validKernelSupport(emptyDiffusivityContract());
    const result = evaluateKH1999PreliminaryLocalMassTransfer({
      continuous_bulk: [0.04, 0.03, 0.02, 0.01, 0.90],
      dispersed_bulk: [0.42, 0.28, 0.14, 0.10, 0.06],
      continuous_equilibrium: [0.04, 0.03, 0.02, 0.01, 0.90],
      dispersed_equilibrium: [0.42, 0.28, 0.14, 0.10, 0.06],
      rho_c_bulk_kg_m3: rho_c, rho_d_bulk_kg_m3: rho_d,
      rho_c_equilibrium_kg_m3: rho_c, rho_d_equilibrium_kg_m3: rho_d, molecularWeights: MW,
      dimensionless, schmidt, d32_m: 0.0005, interfacialArea_m2_m3: 120,
    });
    expect(typeof result.components.Sat.Sc_c).toBe('object');
    expect(result.components.Sat.K_d_partition).toEqual(expect.any(Number));
    expect(result.components.Sat.Sh_c.reason).toBe('correlation_unresolved');
  });

  it('does not use Phase-1 uniform values as a fake local mass-transfer state', () => {
    const result = createUnavailableKH1999PreliminaryLocalMassTransfer();
    expect(result.status).toBe('MASS_TRANSFER_PRELIMINARY');
    expect(result.components.Sat.K_d_partition.reason).toBe('phase_2_not_implemented');
    expect(result.components.Sat.transferRate_kg_m3_s.reason).toBe('correlation_unresolved');
  });

  it('maps the frozen local-NRTL convention y→continuous and x→dispersed', () => {
    const { rho_c, rho_d, dimensionless, schmidt } = validKernelSupport();
    const nrtl = computeLocalNRTL({
      x_j: [0.42, 0.28, 0.14, 0.10, 0.06],
      y_j: [0.04, 0.03, 0.02, 0.01, 0.90],
      z_feed: [0.20, 0.14, 0.08, 0.06, 0.52],
      T_K: 343.15,
    });
    expect(nrtl.x_eq).not.toBeNull();
    expect(nrtl.y_eq).not.toBeNull();
    const result = evaluateKH1999PreliminaryLocalMassTransfer({
      continuous_bulk: nrtl.y_j as FiveComponentVector,
      dispersed_bulk: nrtl.x_j as FiveComponentVector,
      continuous_equilibrium: nrtl.y_eq! as FiveComponentVector,
      dispersed_equilibrium: nrtl.x_eq! as FiveComponentVector,
      rho_c_bulk_kg_m3: rho_c, rho_d_bulk_kg_m3: rho_d,
      rho_c_equilibrium_kg_m3: rho_c, rho_d_equilibrium_kg_m3: rho_d,
      molecularWeights: MW, dimensionless, schmidt, d32_m: 0.0005, interfacialArea_m2_m3: 120,
    });
    const expectedDispersedEquilibrium = computePhysicalComponentMassConcentrations({
      phase: 'dispersed_rrbo_rich',
      phaseMoleFractions: nrtl.x_eq! as FiveComponentVector,
      phaseDensity_kg_m3: rho_d,
      molecularWeights: MW,
    });
    expect('components' in expectedDispersedEquilibrium).toBe(true);
    if (!('components' in expectedDispersedEquilibrium)) throw new Error('expected concentration basis');
    expect(result.components.Sat.C_d_equilibrium_kg_m3)
      .toBeCloseTo(expectedDispersedEquilibrium.components.Sat.concentration_kg_m3, 12);
  });
});