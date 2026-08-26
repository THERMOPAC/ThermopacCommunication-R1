import { describe, expect, it } from 'vitest';
import { buildECR2ThermodynamicBasis } from '../server/engines/llx/llx-ecr-simulator-engine';
import {
  solveECR2CounterCurrentBVP,
  type ECR2CounterCurrentBVPInput,
} from '../server/engines/llx/llx-ecr2-counter-current-bvp';

const T_C = 70;

const de = (value_m2_s: number) => ({
  value_m2_s,
  sourceType: 'Assumed',
  sourceReference: 'BVP test diffusivity',
  referenceTemperature_C: T_C,
  method: 'test fixture',
  status: 'engineer_supplied',
});
const diffusivity = () => ({
  Sat: { De_c: de(2.5e-9), De_d: de(2.2e-9) },
  Mono: { De_c: de(2.0e-9), De_d: de(1.8e-9) },
  Di: { De_c: de(1.6e-9), De_d: de(1.4e-9) },
  Poly: { De_c: de(1.2e-9), De_d: de(1.0e-9) },
  NMP: { De_c: de(2.4e-9), De_d: de(1.9e-9) },
} as any);

function input(): ECR2CounterCurrentBVPInput {
  return {
    numberOfCompartments: 1,
    activeHeight_m: 0.06,
    columnCrossSectionArea_m2: 0.05,
    psi_W_kg: 0.1,
    powerPerAgitator_W: 0.05,
    columnDiameter_m: 0.30,
    rotorDiameter_m: 0.15,
    physicalCompartmentHeight_m: 0.06,
    holdupSystemIdentity: 'rrbo_nmp',
    holdupMassTransferDirection: 'bidirectional_multicomponent',
    statorOpenAreaFraction: 0.5,
    operatingTemperature_C: T_C,
    physicalMolecularWeights: {
      Sat_g_mol: 330, Mono_g_mol: 300, Di_g_mol: 350, Poly_g_mol: 430, NMP_g_mol: 99.13,
    },
    c2ThermodynamicBasis: buildECR2ThermodynamicBasis({
      operatingTemperatureC: T_C,
      rrboMassFlow_kg_h: 100,
      nmpMassFlow_kg_h: 200,
      rrboMassFractions: [0.5, 0.3, 0.15, 0.05, 0],
    }),
    rrboFeedComponentFlows_kg_h: [50, 30, 15, 5, 0],
    nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, 200],
    governedProperties: {
      rrboGradeId: 'rrbo-sn300',
      mu_d_engineer: {
        value: 0.008, unit: 'Pa.s', sourceType: 'Assumed',
        sourceReference: 'BVP RRBO viscosity', referenceTemperature_C: T_C,
      },
      sigma_engineer: {
        value: 0.012, unit: 'N/m', sourceType: 'Assumed',
        sourceReference: 'BVP interfacial tension', referenceTemperature_C: T_C,
      },
      diffusivity: diffusivity(),
    },
    d32Config: {
      mode: 'engineer_supplied',
      value_m: 0.0005,
      sourceType: 'Assumed',
      sourceReference: 'BVP engineer-supplied d32',
    },
    partitionBasis: {
      basis: 'K_d_concentration',
      approvalStatus: 'engineer_approved_governed',
      sourceReference: 'BVP approved concentration Kd basis',
      approvedBy: 'Test Engineer',
      approvedAt: '2026-08-22T10:00:00Z',
    },
  };
}

describe('ECR-2 counter-current BVP K&H 1995 dependency gating', () => {
  it('blocks the RRBO/NMP BVP before d32, transfer, or numerical height results', () => {
    const result = solveECR2CounterCurrentBVP(input());
    expect(result).toMatchObject({
      status: 'blocked',
      convergenceStatus: 'dependency_blocked',
      massBalanceStatus: 'not_evaluated',
      compartments: [],
      outlets: { raffinate: null, extract: null },
      failure: { dependency: 'holdup' },
    });
    expect(result.failure?.provenance.join('|')).toContain('kh1995_cpsi_bidirectional_multicomponent_unresolved');
    expect(result.failure?.provenance.join('|')).toContain('kh1995_rrbo_nmp_not_validated');
    expect(result.failure?.message).not.toMatch(/flood/i);
  });

  it('makes primary geometry a required BVP dependency', () => {
    const invalid = { ...input(), rotorDiameter_m: Number.NaN };
    const result = solveECR2CounterCurrentBVP(invalid);
    expect(result.status).toBe('blocked');
    expect(result.failure?.dependency).toBe('geometry_or_hydrodynamics');
    expect(result.failure?.message).toContain('rotorDiameter_m');
  });

  it('does not translate an evidence/dependency block into process infeasibility', () => {
    const result = solveECR2CounterCurrentBVP(input());
    expect(result.transferStatus.status).toBe('LOCAL_PRELIMINARY_BLOCKED');
    expect(result.transferStatus.message).toContain('holdup');
    expect(result.transferStatus.message).not.toMatch(/infeasible|flood/i);
  });

  it('uses the reviewed pre-pilot holdup closure inside the same BVP core without claiming pilot validation', () => {
    const predictive = input();
    predictive.prePilotHydrodynamics = {
      modelId: 'pilot_calibrated_hindrance_closure',
      modelVersion: '1.0.0',
      characteristicSlipVelocity_m_s: 0.013,
      hindranceExponent: 1.1,
      characteristicSlipEvidence: {
        sourceReference: 'Controlled pre-pilot sensitivity basis',
      },
      hindranceEvidence: {
        sourceReference: 'Controlled pre-pilot sensitivity basis',
      },
    };
    predictive.solverOptions = { transferStrength: 0 };

    const result = solveECR2CounterCurrentBVP(predictive);

    expect(result.failure?.dependency).not.toBe('holdup');
    expect(result.compartments[0]?.holdup).toMatchObject({
      status: 'calculated_pre_pilot',
      sourceModel: 'pilot_calibrated_hindrance_closure',
      pilotValidated: false,
    });
  });

  it('fails closed instead of falling back to K&H when an explicit pre-pilot package is invalid', () => {
    const predictive = input();
    predictive.prePilotHydrodynamics = {
      modelId: 'pilot_calibrated_hindrance_closure',
      modelVersion: '1.0.0',
      characteristicSlipVelocity_m_s: Number.NaN,
      hindranceExponent: 1.1,
      characteristicSlipEvidence: {
        sourceReference: 'Controlled pre-pilot sensitivity basis',
      },
      hindranceEvidence: {
        sourceReference: 'Controlled pre-pilot sensitivity basis',
      },
    };

    const result = solveECR2CounterCurrentBVP(predictive);

    expect(result).toMatchObject({
      status: 'blocked',
      convergenceStatus: 'dependency_blocked',
      failure: {
        dependency: 'holdup',
        message: expect.stringContaining('Pre-pilot hindrance package is invalid'),
      },
    });
    expect(result.failure?.message).not.toContain('K&H 1995');
  });
});