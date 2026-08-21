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
  ECR2_CORRELATION_REGISTRY,
  ECR2_KH1999_FUTURE_PRELIMINARY_INPUTS,
  ECR2_KH1999_MASS_TRANSFER_DEPENDENCY_MAP,
  ECR2_KH1999_PRELIMINARY_PARAMETERS,
  ECR2_KH1999_SECONDARY_SCOPED_CONSTANTS,
  validateKH1999MassTransferDependencyMap,
  validateKH1999PreliminaryParameterRegistry,
  validateKH1999SecondaryEvidenceRegistry,
} from '../server/engines/llx/llx-ecr2-correlation-registry';
import {
  computePhysicalComponentMassConcentrations,
  createUnavailableKH1999PreliminaryLocalMassTransfer,
  evaluateKH1999PreliminaryLocalMassTransfer,
  activateKH1999PreliminaryLocalMassTransfer,
  type ECR2KH1999EngineerC2Input,
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
  NMP: { De_c: { ...DIFFUSIVITY, value_m2_s: 2.5e-9 }, De_d: { ...DIFFUSIVITY, value_m2_s: 1.8e-9 } },
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
  return { properties, rho_c, rho_d, dimensionless, schmidt };
}

const KUHNI_C2: ECR2KH1999EngineerC2Input = {
  value: 1.25,
  sourceType: 'Assumed',
  sourceReference: 'Unit-test scoped preliminary Kühni Sh_d C2',
  scope: 'kuhni_shd_preliminary',
};

const D32_PROVENANCE = {
  value_m: 0.0005,
  source: 'governed_calculated' as const,
  sourceReference: 'Unit-test governed preliminary d32',
};

function localNrtlEquilibrium() {
  const nrtl = computeLocalNRTL({
    x_j: [0.42, 0.28, 0.14, 0.10, 0.06],
    y_j: [0.04, 0.03, 0.02, 0.01, 0.90],
    z_feed: [0.20, 0.14, 0.08, 0.06, 0.52],
    T_K: 343.15,
  });
  if (!nrtl.x_eq || !nrtl.y_eq) throw new Error('expected local NRTL equilibrium');
  return {
    continuous: nrtl.y_eq as FiveComponentVector,
    dispersed: nrtl.x_eq as FiveComponentVector,
  };
}

function shiftSatAgainstNmp(
  composition: FiveComponentVector,
  satDelta: number,
): FiveComponentVector {
  return [
    composition[0] + satDelta,
    composition[1],
    composition[2],
    composition[3],
    composition[4] - satDelta,
  ];
}

function activatedKernel(options: {
  c2?: ECR2KH1999EngineerC2Input | null;
  partitionApproved?: boolean;
  d32_m?: number | null;
  phi_d?: number;
  diffusivity?: ECR2DiffusivityContract;
  baseArea_m2_m3?: number | null;
  activationD32?: typeof D32_PROVENANCE;
  invalidMuDProvenance?: boolean;
  invalidD32Source?: boolean;
  continuousBulk?: FiveComponentVector;
  dispersedBulk?: FiveComponentVector;
  continuousEquilibrium?: FiveComponentVector;
  dispersedEquilibrium?: FiveComponentVector;
} = {}) {
  const support = validKernelSupport(options.diffusivity ?? DIFFUSIVITIES);
  const valueOf = (field: unknown) => {
    if (!isPropertyAvailable(field as ReturnType<typeof computeLocalProperties>['rho_c'])) {
      throw new Error('expected available test property');
    }
    return field.value;
  };
  const recordOf = (field: ReturnType<typeof computeLocalProperties>['rho_c']) => {
    if (!isPropertyAvailable(field)) throw new Error('expected available test property');
    return field;
  };
  const d32_m = options.d32_m === undefined ? 0.0005 : options.d32_m;
  const continuousBulk: FiveComponentVector =
    options.continuousBulk ?? [0.04, 0.03, 0.02, 0.01, 0.90];
  const dispersedBulk: FiveComponentVector =
    options.dispersedBulk ?? [0.42, 0.28, 0.14, 0.10, 0.06];
  const continuousEquilibrium: FiveComponentVector =
    options.continuousEquilibrium ?? [0.04, 0.03, 0.02, 0.01, 0.90];
  const dispersedEquilibrium: FiveComponentVector =
    options.dispersedEquilibrium ?? [0.42, 0.28, 0.14, 0.10, 0.06];
  const base = evaluateKH1999PreliminaryLocalMassTransfer({
    continuous_bulk: continuousBulk,
    dispersed_bulk: dispersedBulk,
    continuous_equilibrium: continuousEquilibrium,
    dispersed_equilibrium: dispersedEquilibrium,
    rho_c_bulk_kg_m3: support.rho_c,
    rho_d_bulk_kg_m3: support.rho_d,
    rho_c_equilibrium_kg_m3: support.rho_c,
    rho_d_equilibrium_kg_m3: support.rho_d,
    molecularWeights: MW,
    dimensionless: support.dimensionless,
    schmidt: support.schmidt,
    d32_m,
    interfacialArea_m2_m3: options.baseArea_m2_m3 === undefined
      ? (d32_m ? 6 * (options.phi_d ?? 0.2) / d32_m : null)
      : options.baseArea_m2_m3,
  });
  const result = activateKH1999PreliminaryLocalMassTransfer(base, {
    hydrodynamics: {
      phi_d: options.phi_d ?? 0.2,
      psi_W_kg: 0.10,
      U_slip_m_s: 0.001,
      rho_c_kg_m3: support.rho_c,
      rho_d_kg_m3: support.rho_d,
      mu_c: recordOf(support.properties.mu_c),
      mu_d: options.invalidMuDProvenance
        ? { ...recordOf(support.properties.mu_d), sourceReference: '' }
        : recordOf(support.properties.mu_d),
      sigma: recordOf(support.properties.sigma),
    },
    diffusivity: options.diffusivity ?? DIFFUSIVITIES,
    d32: options.activationD32 ?? (options.invalidD32Source
      ? { ...D32_PROVENANCE, source: 'unregistered' as unknown as 'governed_calculated' }
      : { ...D32_PROVENANCE, value_m: d32_m ?? Number.NaN }),
    kuhniShdC2: options.c2 === undefined ? KUHNI_C2 : options.c2,
    partitionBasis: options.partitionApproved
      ? {
          basis: 'K_d_concentration',
          approvalStatus: 'engineer_approved_governed',
          sourceReference: 'Unit-test governed K_d concentration basis',
        }
      : null,
  });
  return { result, support, base };
}

describe('ECR-2 K&H 1999 preliminary mass-transfer kernel', () => {
  it('stores the supplied constants with their roles and prevents symbol-role collisions', () => {
    expect(validateKH1999PreliminaryParameterRegistry()).toEqual([]);
    expect(ECR2_KH1999_PRELIMINARY_PARAMETERS).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'kh1999_provisional_C1', symbol: 'C1', value: 0.90, phaseRole: 'continuous' }),
      expect.objectContaining({ id: 'kh1999_provisional_C2', symbol: 'C2', value: 0.45, phaseRole: 'dispersed' }),
      expect.objectContaining({ id: 'kh1999_provisional_Fc', symbol: 'Fc', value: 0.76, phaseRole: 'continuous' }),
      expect.objectContaining({ id: 'kh1999_provisional_Fd', symbol: 'Fd', value: 0.58, phaseRole: 'dispersed' }),
    ]));
    expect(ECR2_KH1999_PRELIMINARY_PARAMETERS.every(
      (parameter) => parameter.equationPlacement === 'unresolved_do_not_apply_numerically',
    )).toBe(true);
  });

  it('records secondary equations and constants without equating same-named symbols', () => {
    expect(validateKH1999SecondaryEvidenceRegistry()).toEqual([]);
    expect(ECR2_KH1999_SECONDARY_SCOPED_CONSTANTS).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'kh1999_shc_agitation_C1_kuhni',
        symbol: 'C1',
        value: 7.5,
        correlationId: 'ecr2_kh1999_shc_secondary',
        deviceType: 'kuhni',
      }),
      expect.objectContaining({
        id: 'kh1999_shd_agitation_C2_pulsed',
        symbol: 'C2',
        value: 4.33,
        deviceType: 'pulsed',
      }),
    ]));
    expect(ECR2_KH1999_SECONDARY_SCOPED_CONSTANTS.some(
      (constant) => constant.deviceType === 'kuhni' && constant.symbol === 'C2',
    )).toBe(false);

    for (const id of [
      'ecr2_kh1999_shc_secondary',
      'ecr2_kh1999_shd_secondary',
      'ecr2_kh1999_shc_rigid_secondary',
      'ecr2_kh1999_shc_infinity_secondary',
      'ecr2_kh1999_two_film_secondary',
      'ecr2_kh1999_interfacial_area_secondary',
    ]) {
      expect(ECR2_CORRELATION_REGISTRY.find((entry) => entry.id === id)).toEqual(expect.objectContaining({
        correlationStatus: 'secondary_equation_verified',
        primarySourceVerified: false,
      }));
    }
  });

  it('rejects a secondary constant whose device or phase scope is mutated', () => {
    const corrupted = ECR2_KH1999_SECONDARY_SCOPED_CONSTANTS.map((constant) =>
      constant.id === 'kh1999_shc_agitation_C1_kuhni'
        ? { ...constant, deviceType: 'pulsed' as const }
        : constant,
    );
    expect(validateKH1999SecondaryEvidenceRegistry(corrupted)).toEqual(expect.arrayContaining([
      expect.stringMatching(/invalid deviceType scope/),
    ]));
  });

  it('maps independently governed preliminary authorization and retains the partition gate', () => {
    expect(validateKH1999MassTransferDependencyMap()).toEqual([]);
    const byOutput = Object.fromEntries(ECR2_KH1999_MASS_TRANSFER_DEPENDENCY_MAP.map(
      (entry) => [entry.output, entry],
    ));
    expect(byOutput.Sh_c.runtimeStatus).toBe('preliminary_authorized');
    expect(byOutput.Sh_c.exactBlockers).toEqual([]);
    expect(byOutput.Sh_d.requiredConstants).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'kh1999_shd_C2_kuhni', availability: 'unavailable' }),
    ]));
    expect(byOutput.Sh_d.blockerIds).toEqual(expect.arrayContaining([
      'kuhni_shd_C2',
    ]));
    expect(byOutput.K_overall.exactBlockers.join(' ')).toMatch(/partition|slope m/i);
    expect(byOutput.Koa.runtimeStatus).toBe('not_activated');
    expect(byOutput.transfer_rate.runtimeStatus).toBe('not_activated');
    expect(byOutput.a.runtimeStatus).toBe('independently_available');
    expect(byOutput.a.d32Provenance).toEqual(expect.arrayContaining([
      'governed_calculated_future',
      'engineer_entered_or_measured_future',
    ]));
    expect(ECR2_KH1999_FUTURE_PRELIMINARY_INPUTS.every(
      (input) => input.activation === 'preliminary_runtime_required' &&
        input.requiredFields.join(',') === 'value,unit,sourceType,sourceReference,engineeringStatus',
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

  it('calculates the exact registered Sh_c equation with scoped Kühni C1 = 7.5', () => {
    const { result, support, base } = activatedKernel({ c2: null });
    const shc = result.components.Sat.Sh_c;
    const sc = base.components.Sat.Sc_c;
    expect(typeof shc).toBe('number');
    expect(typeof sc).toBe('number');
    if (typeof shc !== 'number' || typeof sc !== 'number' || typeof support.dimensionless.Re_d !== 'number' ||
      typeof support.dimensionless.kappa !== 'number') throw new Error('expected numeric local support');

    const mu_c = isPropertyAvailable(support.properties.mu_c) ? support.properties.mu_c.value : 0;
    const sigma = isPropertyAvailable(support.properties.sigma) ? support.properties.sigma.value : 0;
    const de = DIFFUSIVITIES.Sat.De_c!.value_m2_s;
    const re = support.dimensionless.Re_d;
    const shRigid = 2.43 + 0.775 * Math.sqrt(re) * Math.cbrt(sc) + 0.0103 * re * Math.cbrt(sc);
    const shInfinity = 50 + (2 / Math.sqrt(Math.PI)) * Math.sqrt((0.0005 * 0.001) / de);
    const agitation = (0.10 / 9.80665) * Math.pow(support.rho_c / (9.80665 * sigma), 0.25);
    const rhs = 5.26e-2 *
      Math.pow(re, 1 / 3 + 6.59e-2 * Math.pow(re, 0.25)) *
      Math.cbrt(sc) *
      Math.cbrt((0.001 * mu_c) / sigma) *
      (1 / (1 + Math.pow(support.dimensionless.kappa, 1.1))) *
      (1 + 7.5 * Math.cbrt(agitation));
    expect(shc).toBeCloseTo((1 - 0.2) * ((shRigid + rhs * shInfinity) / (1 + rhs)), 12);
    expect(result.components.Sat.outputStatus.Sh_c.status).toBe('calculated_preliminary');
    expect(result.governance.primarySourceVerified).toBe(false);
    expect(result.governance.validatedForRRBONMP).toBe(false);
  });

  it('derives Re and κ from the activated local state instead of accepting stale base dimensionless values', () => {
    const { result, base, support } = activatedKernel({ c2: null });
    const numericProperty = (field: ReturnType<typeof computeLocalProperties>['rho_c']) => {
      if (!isPropertyAvailable(field)) throw new Error('expected property');
      return field.value;
    };
    const staleBase = {
      ...base,
      dimensionless: {
        ...base.dimensionless!,
        Re_d: 999,
        kappa: 99,
      },
    };
    const recalculated = activateKH1999PreliminaryLocalMassTransfer(staleBase, {
      hydrodynamics: {
        phi_d: 0.2, psi_W_kg: 0.10, U_slip_m_s: 0.001,
        rho_c_kg_m3: support.rho_c, rho_d_kg_m3: support.rho_d,
        mu_c: (() => { if (!isPropertyAvailable(support.properties.mu_c)) throw new Error('expected property'); return support.properties.mu_c; })(),
        mu_d: (() => { if (!isPropertyAvailable(support.properties.mu_d)) throw new Error('expected property'); return support.properties.mu_d; })(),
        sigma: (() => { if (!isPropertyAvailable(support.properties.sigma)) throw new Error('expected property'); return support.properties.sigma; })(),
      },
      diffusivity: DIFFUSIVITIES,
      d32: D32_PROVENANCE,
      kuhniShdC2: null,
    });
    expect(recalculated.components.Sat.Sh_c).toEqual(result.components.Sat.Sh_c);
  });

  it('recomputes Schmidt numbers and interfacial area from activated inputs rather than stale base snapshots', () => {
    const { base, support } = activatedKernel({ c2: null });
    const numericProperty = (field: ReturnType<typeof computeLocalProperties>['rho_c']) => {
      if (!isPropertyAvailable(field)) throw new Error('expected property');
      return field.value;
    };
    const activationDiffusivity: ECR2DiffusivityContract = {
      ...DIFFUSIVITIES,
      Sat: {
        De_c: { ...DIFFUSIVITIES.Sat.De_c!, value_m2_s: 1.05e-9 },
        De_d: DIFFUSIVITIES.Sat.De_d,
      },
    };
    const changed = activateKH1999PreliminaryLocalMassTransfer(base, {
      hydrodynamics: {
        phi_d: 0.2, psi_W_kg: 0.10, U_slip_m_s: 0.001,
        rho_c_kg_m3: support.rho_c, rho_d_kg_m3: support.rho_d,
        mu_c: (() => { if (!isPropertyAvailable(support.properties.mu_c)) throw new Error('expected property'); return { ...support.properties.mu_c, value: numericProperty(support.properties.mu_c) * 1.5 }; })(),
        mu_d: (() => { if (!isPropertyAvailable(support.properties.mu_d)) throw new Error('expected property'); return support.properties.mu_d; })(),
        sigma: (() => { if (!isPropertyAvailable(support.properties.sigma)) throw new Error('expected property'); return support.properties.sigma; })(),
      },
      diffusivity: activationDiffusivity,
      d32: D32_PROVENANCE,
      kuhniShdC2: null,
    });
    const changedSc = changed.components.Sat.Sc_c;
    expect(typeof changedSc).toBe('number');
    if (typeof changedSc !== 'number') throw new Error('expected activated Sc');
    expect(changedSc).toBeCloseTo(
      (numericProperty(support.properties.mu_c) * 1.5) / (support.rho_c * 1.05e-9),
      12,
    );
    expect(changedSc).not.toEqual(base.components.Sat.Sc_c);

    const areaResult = activatedKernel({
      partitionApproved: true,
      baseArea_m2_m3: 1,
    }).result.components.Sat;
    expect(typeof areaResult.K_overall_m_s).toBe('number');
    expect(typeof areaResult.K_oa_per_s).toBe('number');
    if (typeof areaResult.K_overall_m_s !== 'number' || typeof areaResult.K_oa_per_s !== 'number') {
      throw new Error('expected calculated Koa');
    }
    expect(areaResult.K_oa_per_s).toBeCloseTo(areaResult.K_overall_m_s * (6 * 0.2 / 0.0005), 15);
  });

  it('rejects an activation density state that differs from the concentration/Kd basis', () => {
    const { base, support } = activatedKernel({ c2: null });
    const numericProperty = (field: ReturnType<typeof computeLocalProperties>['rho_c']) => {
      if (!isPropertyAvailable(field)) throw new Error('expected property');
      return field.value;
    };
    const mismatch = activateKH1999PreliminaryLocalMassTransfer(base, {
      hydrodynamics: {
        phi_d: 0.2, psi_W_kg: 0.10, U_slip_m_s: 0.001,
        rho_c_kg_m3: support.rho_c + 1, rho_d_kg_m3: support.rho_d,
        mu_c: (() => { if (!isPropertyAvailable(support.properties.mu_c)) throw new Error('expected property'); return support.properties.mu_c; })(),
        mu_d: (() => { if (!isPropertyAvailable(support.properties.mu_d)) throw new Error('expected property'); return support.properties.mu_d; })(),
        sigma: (() => { if (!isPropertyAvailable(support.properties.sigma)) throw new Error('expected property'); return support.properties.sigma; })(),
      },
      diffusivity: DIFFUSIVITIES,
      d32: D32_PROVENANCE,
      kuhniShdC2: null,
    });
    expect(mismatch.components.Sat.outputStatus.Sh_c.status).toBe('not_calculable');
    expect(mismatch.components.Sat.outputStatus.K_overall.status).toBe('engineer_partition_basis_required');
    expect(mismatch.components.Sat.Sh_c).toEqual(expect.objectContaining({
      reason: 'blocked_by_local_properties',
    }));
  });

  it('rejects wrong C1 constants, leaves Sh_c independent of missing C2, and rejects borrowed C2 constants', () => {
    const { base, support } = activatedKernel({ c2: null });
    const properties = support.properties;
    const numericProperty = (field: ReturnType<typeof computeLocalProperties>['rho_c']) => {
      if (!isPropertyAvailable(field)) throw new Error('expected property');
      return field.value;
    };
    const wrongC1 = activateKH1999PreliminaryLocalMassTransfer(base, {
      hydrodynamics: {
        phi_d: 0.2, psi_W_kg: 0.1, U_slip_m_s: 0.001,
        rho_c_kg_m3: support.rho_c, rho_d_kg_m3: support.rho_d,
        mu_c: (() => { if (!isPropertyAvailable(properties.mu_c)) throw new Error('expected property'); return properties.mu_c; })(),
        mu_d: (() => { if (!isPropertyAvailable(properties.mu_d)) throw new Error('expected property'); return properties.mu_d; })(),
        sigma: (() => { if (!isPropertyAvailable(properties.sigma)) throw new Error('expected property'); return properties.sigma; })(),
      },
      diffusivity: DIFFUSIVITIES,
      d32: D32_PROVENANCE,
      c1Override: 0.90,
      kuhniShdC2: { ...KUHNI_C2, value: 4.33 },
    });
    expect(wrongC1.components.Sat.outputStatus.Sh_c.status).toBe('blocked_by_invalid_c1_scope');
    expect(wrongC1.components.Sat.outputStatus.Sh_d.status).toBe('blocked_by_invalid_c2_scope');

    const missingC2 = activatedKernel({ c2: null }).result.components.Sat;
    expect(missingC2.outputStatus.Sh_c.status).toBe('calculated_preliminary');
    expect(missingC2.outputStatus.k_c.status).toBe('calculated_preliminary');
    expect(missingC2.outputStatus.Sh_d.status).toBe('engineer_input_required_for_preliminary_shd');
    expect(missingC2.outputStatus.k_d.status).toBe('engineer_input_required_for_preliminary_shd');
  });

  it('calculates Sc, k_c, k_d, a, Koa, and a zero equilibrium transfer rate with explicit basis approval', () => {
    const { result, support, base } = activatedKernel({ partitionApproved: true });
    const sat = result.components.Sat;
    expect(typeof sat.Sc_c).toBe('number');
    expect(typeof sat.Sc_d).toBe('number');
    expect(typeof sat.Sh_c).toBe('number');
    expect(typeof sat.Sh_d).toBe('number');
    expect(typeof sat.k_c_m_s).toBe('number');
    expect(typeof sat.k_d_m_s).toBe('number');
    expect(typeof sat.K_overall_m_s).toBe('number');
    expect(typeof sat.K_oa_per_s).toBe('number');
    if (typeof sat.Sc_c !== 'number' || typeof sat.Sc_d !== 'number' || typeof sat.Sh_c !== 'number' ||
      typeof sat.Sh_d !== 'number' || typeof sat.k_c_m_s !== 'number' || typeof sat.k_d_m_s !== 'number' ||
      typeof sat.K_overall_m_s !== 'number' || typeof sat.K_oa_per_s !== 'number') throw new Error('expected calculated values');
    const mu_c = isPropertyAvailable(support.properties.mu_c) ? support.properties.mu_c.value : 0;
    const mu_d = isPropertyAvailable(support.properties.mu_d) ? support.properties.mu_d.value : 0;
    expect(sat.Sc_c).toBeCloseTo(mu_c / (support.rho_c * DIFFUSIVITIES.Sat.De_c!.value_m2_s), 12);
    expect(sat.Sc_d).toBeCloseTo(mu_d / (support.rho_d * DIFFUSIVITIES.Sat.De_d!.value_m2_s), 12);
    expect(sat.k_c_m_s).toBeCloseTo(sat.Sh_c * DIFFUSIVITIES.Sat.De_c!.value_m2_s / 0.0005, 15);
    expect(sat.k_d_m_s).toBeCloseTo(sat.Sh_d * DIFFUSIVITIES.Sat.De_d!.value_m2_s / 0.0005, 15);
    expect(base.interfacialArea_m2_m3).toBeCloseTo(6 * 0.2 / 0.0005, 12);
    expect(sat.K_oa_per_s).toBeCloseTo(sat.K_overall_m_s * base.interfacialArea_m2_m3!, 15);
    expect(sat.drivingForce_dispersed_kg_m3).toBeCloseTo(0, 12);
    expect(sat.transferRate_kg_m3_s).toBeCloseTo(0, 12);
    expect(result.governance.engineerInputs.kuhniShdC2).toEqual(KUHNI_C2);
  });

  it('propagates missing d32, diffusivity, invalid holdup, and partition status independently', () => {
    const missingD32 = activatedKernel({ d32_m: null, c2: null }).result.components.Sat;
    expect(missingD32.outputStatus.Sh_c.status).toBe('blocked_by_missing_d32');
    expect(missingD32.outputStatus.Sh_d.status).toBe('blocked_by_missing_d32');

    const missingDe = activatedKernel({ diffusivity: emptyDiffusivityContract(), c2: KUHNI_C2 }).result.components.Sat;
    expect(missingDe.outputStatus.Sh_c.status).toBe('blocked_by_missing_diffusivity');
    expect(missingDe.outputStatus.Sh_d.status).toBe('blocked_by_missing_diffusivity');

    const invalidHoldup = activatedKernel({ phi_d: 1.1, c2: KUHNI_C2 }).result.components.Sat;
    expect(invalidHoldup.outputStatus.Sh_c.status).toBe('blocked_by_invalid_holdup');

    const partitionBlocked = activatedKernel({ c2: KUHNI_C2 }).result.components.Sat;
    expect(partitionBlocked.outputStatus.k_c.status).toBe('calculated_preliminary');
    expect(partitionBlocked.outputStatus.k_d.status).toBe('calculated_preliminary');
    expect(partitionBlocked.outputStatus.K_overall.status).toBe('engineer_partition_basis_required');
    expect(partitionBlocked.outputStatus.Koa.status).toBe('blocked_by_K_overall');
  });

  it('rejects unprovenanced local properties, d32 source, and diffusivity metadata', () => {
    const badProperty = activatedKernel({ invalidMuDProvenance: true, c2: null }).result.components.Sat;
    expect(badProperty.outputStatus.Sh_c.status).toBe('not_calculable');

    const badD32 = activatedKernel({ invalidD32Source: true, c2: null }).result.components.Sat;
    expect(badD32.outputStatus.Sh_c.status).toBe('blocked_by_missing_d32');

    const badDiffusivity: ECR2DiffusivityContract = {
      ...DIFFUSIVITIES,
      Sat: {
        De_c: { ...DIFFUSIVITIES.Sat.De_c!, sourceReference: '' },
        De_d: DIFFUSIVITIES.Sat.De_d,
      },
    };
    const badDiff = activatedKernel({ diffusivity: badDiffusivity, c2: null }).result.components.Sat;
    expect(badDiff.outputStatus.Sh_c.status).toBe('blocked_by_missing_diffusivity');
  });

  it('verifies positive and reverse non-equilibrium transfer for all five components through the real kernel', () => {
    const equilibrium = localNrtlEquilibrium();
    const positiveDispersed = shiftSatAgainstNmp(equilibrium.dispersed, 0.04);
    const negativeDispersed = shiftSatAgainstNmp(equilibrium.dispersed, -0.04);
    const componentOrder = ['Sat', 'Mono', 'Di', 'Poly', 'NMP'] as const;

    const positive = activatedKernel({
      partitionApproved: true,
      continuousBulk: equilibrium.continuous,
      dispersedBulk: positiveDispersed,
      continuousEquilibrium: equilibrium.continuous,
      dispersedEquilibrium: equilibrium.dispersed,
    }).result;
    const negative = activatedKernel({
      partitionApproved: true,
      continuousBulk: equilibrium.continuous,
      dispersedBulk: negativeDispersed,
      continuousEquilibrium: equilibrium.continuous,
      dispersedEquilibrium: equilibrium.dispersed,
    }).result;

    expect(Object.keys(positive.components)).toEqual(componentOrder);
    expect(Object.keys(negative.components)).toEqual(componentOrder);
    for (const component of componentOrder) {
      expect(positive.components[component].component).toBe(component);
      expect(negative.components[component].component).toBe(component);
      expect(typeof positive.components[component].drivingForce_dispersed_kg_m3).toBe('number');
      expect(typeof positive.components[component].transferRate_kg_m3_s).toBe('number');
      expect(typeof negative.components[component].drivingForce_dispersed_kg_m3).toBe('number');
      expect(typeof negative.components[component].transferRate_kg_m3_s).toBe('number');
    }

    expect(positive.components.Sat.drivingForce_dispersed_kg_m3).toBeGreaterThan(0);
    expect(positive.components.Sat.transferRate_kg_m3_s).toBeGreaterThan(0);
    expect(negative.components.Sat.drivingForce_dispersed_kg_m3).toBeLessThan(0);
    expect(negative.components.Sat.transferRate_kg_m3_s).toBeLessThan(0);
    expect(positive.components.NMP.drivingForce_dispersed_kg_m3).toBeLessThan(0);
    expect(negative.components.NMP.drivingForce_dispersed_kg_m3).toBeGreaterThan(0);

    for (const result of [positive, negative]) {
      for (const component of componentOrder) {
        const item = result.components[component];
        if (typeof item.K_oa_per_s !== 'number' ||
            typeof item.drivingForce_dispersed_kg_m3 !== 'number' ||
            typeof item.transferRate_kg_m3_s !== 'number') {
          throw new Error(`expected calculated rate for ${component}`);
        }
        expect(item.transferRate_kg_m3_s).toBeCloseTo(
          item.K_oa_per_s * item.drivingForce_dispersed_kg_m3,
          12,
        );
        expect(Math.sign(item.transferRate_kg_m3_s))
          .toBe(Math.sign(item.drivingForce_dispersed_kg_m3));
      }
    }
  });

  it('verifies equilibrium zero transfer and five-component local conservation', () => {
    const equilibrium = localNrtlEquilibrium();
    const { result } = activatedKernel({
      partitionApproved: true,
      continuousBulk: equilibrium.continuous,
      dispersedBulk: equilibrium.dispersed,
      continuousEquilibrium: equilibrium.continuous,
      dispersedEquilibrium: equilibrium.dispersed,
    });
    const componentOrder = ['Sat', 'Mono', 'Di', 'Poly', 'NMP'] as const;
    const volume_m3 = 0.003;
    const interval_s = 2.5;

    let dispersedTotal = 0;
    let continuousTotal = 0;
    for (const component of componentOrder) {
      const item = result.components[component];
      expect(item.drivingForce_dispersed_kg_m3).toBeCloseTo(0, 12);
      expect(item.transferRate_kg_m3_s).toBeCloseTo(0, 12);
      if (typeof item.transferRate_kg_m3_s !== 'number') {
        throw new Error(`expected equilibrium rate for ${component}`);
      }

      const transferred_kg = item.transferRate_kg_m3_s * volume_m3 * interval_s;
      const dispersedDelta_kg = -transferred_kg;
      const continuousDelta_kg = transferred_kg;
      expect(dispersedDelta_kg + continuousDelta_kg).toBeCloseTo(0, 12);
      dispersedTotal += dispersedDelta_kg;
      continuousTotal += continuousDelta_kg;
    }
    expect(dispersedTotal + continuousTotal).toBeCloseTo(0, 12);
  });

  it('verifies positive and reverse transfer conservation without adding time to production equations', () => {
    const equilibrium = localNrtlEquilibrium();
    const cases = [
      {
        dispersedBulk: shiftSatAgainstNmp(equilibrium.dispersed, 0.04),
        direction: 'positive',
      },
      {
        dispersedBulk: shiftSatAgainstNmp(equilibrium.dispersed, -0.04),
        direction: 'negative',
      },
    ];
    const volume_m3 = 0.001;
    const interval_s = 0.1;
    const incomingPhaseInventory_kg = 1;
    let dispersedTotal = 0;
    let continuousTotal = 0;

    for (const testCase of cases) {
      const result = activatedKernel({
        partitionApproved: true,
        continuousBulk: equilibrium.continuous,
        dispersedBulk: testCase.dispersedBulk,
        continuousEquilibrium: equilibrium.continuous,
        dispersedEquilibrium: equilibrium.dispersed,
      }).result;
      for (const component of ['Sat', 'Mono', 'Di', 'Poly', 'NMP'] as const) {
        const item = result.components[component];
        if (typeof item.transferRate_kg_m3_s !== 'number') {
          throw new Error(`expected ${testCase.direction} rate for ${component}`);
        }
        const transferred_kg = item.transferRate_kg_m3_s * volume_m3 * interval_s;
        const dispersedDelta_kg = -transferred_kg;
        const continuousDelta_kg = transferred_kg;
        expect(dispersedDelta_kg + continuousDelta_kg).toBeCloseTo(0, 12);
        if (testCase.direction === 'positive') {
          expect(Math.max(0, transferred_kg)).toBeLessThanOrEqual(incomingPhaseInventory_kg);
        } else {
          expect(Math.max(0, -transferred_kg)).toBeLessThanOrEqual(incomingPhaseInventory_kg);
        }
        dispersedTotal += dispersedDelta_kg;
        continuousTotal += continuousDelta_kg;
      }
    }
    expect(dispersedTotal + continuousTotal).toBeCloseTo(0, 12);
  });

  it('isolates a one-component bulk perturbation while retaining the frozen component order', () => {
    const equilibrium = localNrtlEquilibrium();
    const baseline = activatedKernel({
      partitionApproved: true,
      continuousBulk: equilibrium.continuous,
      dispersedBulk: equilibrium.dispersed,
      continuousEquilibrium: equilibrium.continuous,
      dispersedEquilibrium: equilibrium.dispersed,
    }).result;
    const perturbed = activatedKernel({
      partitionApproved: true,
      continuousBulk: equilibrium.continuous,
      dispersedBulk: shiftSatAgainstNmp(equilibrium.dispersed, 0.04),
      continuousEquilibrium: equilibrium.continuous,
      dispersedEquilibrium: equilibrium.dispersed,
    }).result;
    const componentOrder = ['Sat', 'Mono', 'Di', 'Poly', 'NMP'] as const;

    expect(perturbed.components.Sat.drivingForce_dispersed_kg_m3)
      .not.toEqual(baseline.components.Sat.drivingForce_dispersed_kg_m3);
    expect(perturbed.components.Sat.transferRate_kg_m3_s)
      .not.toEqual(baseline.components.Sat.transferRate_kg_m3_s);
    expect(componentOrder.map((component) => perturbed.components[component].component))
      .toEqual(componentOrder);
    for (const component of componentOrder) {
      expect(perturbed.components[component].component).toBe(component);
      expect(typeof perturbed.components[component].K_d_partition).toBe('number');
    }
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