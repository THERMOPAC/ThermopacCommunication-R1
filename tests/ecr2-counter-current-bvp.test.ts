import { describe, expect, it } from 'vitest';

import { buildECR2ThermodynamicBasis } from '../server/engines/llx/llx-ecr-simulator-engine';
import {
  solveECR2CounterCurrentBVP,
  thermodynamicMoleFractionsFromPhysicalMassFractions,
  type ECR2CounterCurrentBVPInput,
} from '../server/engines/llx/llx-ecr2-counter-current-bvp';
import { buildDependencyGraph } from '../server/engines/llx/llx-ecr2-compartment-state';
import { SURROGATE_MW } from '../server/engine-framework/cel/coto2022-nmp-lle';
import type { DiffusivityInput, ECR2DiffusivityContract } from '../server/engines/llx/llx-ecr2-diffusivity';

const T_C = 70;

function de(value_m2_s: number): DiffusivityInput {
  return {
    value_m2_s,
    sourceType: 'Assumed',
    sourceReference: 'BVP test preliminary diffusivity',
    referenceTemperature_C: T_C,
    method: 'Test fixture',
    status: 'engineer_supplied',
  };
}

function diffusivity(): ECR2DiffusivityContract {
  return {
    Sat: { De_c: de(2.5e-9), De_d: de(2.2e-9) },
    Mono: { De_c: de(2.0e-9), De_d: de(1.8e-9) },
    Di: { De_c: de(1.6e-9), De_d: de(1.4e-9) },
    Poly: { De_c: de(1.2e-9), De_d: de(1.0e-9) },
    NMP: { De_c: de(2.4e-9), De_d: de(1.9e-9) },
  };
}

function input(n = 1): ECR2CounterCurrentBVPInput {
  const rrbo = [50, 30, 15, 5, 0] as const;
  const nmp = [0, 0, 0, 0, 200] as const;
  return {
    numberOfCompartments: n,
    activeHeight_m: 0.01,
    columnCrossSectionArea_m2: 0.05,
    psi_W_kg: 0.1,
    statorOpenAreaFraction: 0.5,
    operatingTemperature_C: T_C,
    physicalMolecularWeights: {
      Sat_g_mol: 330,
      Mono_g_mol: 300,
      Di_g_mol: 350,
      Poly_g_mol: 430,
      NMP_g_mol: 99.13,
    },
    c2ThermodynamicBasis: buildECR2ThermodynamicBasis({
      operatingTemperatureC: T_C,
      rrboMassFlow_kg_h: 100,
      nmpMassFlow_kg_h: 200,
      rrboMassFractions: [0.5, 0.3, 0.15, 0.05, 0],
    }),
    rrboFeedComponentFlows_kg_h: rrbo,
    nmpFeedComponentFlows_kg_h: nmp,
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
    solverOptions: { maxIterations: 60, maxFunctionEvaluations: 2000 },
  };
}

function expectVectorsClose(
  left: readonly number[] | null,
  right: readonly number[] | null,
  tolerance = 1e-12,
) {
  expect(left).not.toBeNull();
  expect(right).not.toBeNull();
  expect(left).toHaveLength(right!.length);
  left!.forEach((value, index) => {
    expect(Math.abs(value - right![index])).toBeLessThan(tolerance);
  });
}

function expectPhysicalBalancesClose(
  result: ReturnType<typeof solveECR2CounterCurrentBVP>,
) {
  expect(result.componentBalances_kg_h).not.toBeNull();
  expect(result.componentBalances_kg_h!.every((value) => Math.abs(value) < 1e-6)).toBe(true);
  expect(result.totalMassBalance_kg_h).not.toBeNull();
  expect(Math.abs(result.totalMassBalance_kg_h!)).toBeLessThan(5e-6);
}

describe('ECR-2 counter-current BVP', () => {
  it('solves N=1 with non-negative faces, orientation, and component conservation', () => {
    const result = solveECR2CounterCurrentBVP(input(1));
    expect(result.status).toBe('converged');
    expect(result.transferStatus).toMatchObject({
      status: 'LOCAL_PRELIMINARY_CALCULATED',
      localPhysicsStatus: 'CALCULATED_PRELIMINARY',
      governedValues: 'UNAVAILABLE',
      releaseStatus: 'NOT_RELEASE_ELIGIBLE',
      calculatedCompartmentCount: 1,
      provenance: {
        engineeringBasis: 'Published Correlation — Preliminary Engineering',
        primarySourceVerified: false,
        validatedForRRBONMP: false,
        pilotCalibrationStatus: 'NOT_YET_VALIDATED',
      },
    });
    expect(result.compartments).toHaveLength(1);
    expect(result.compartments[0].dispersedIncoming_kg_h).toEqual(input(1).rrboFeedComponentFlows_kg_h);
    expect(result.compartments[0].continuousIncoming_kg_h).toEqual(input(1).nmpFeedComponentFlows_kg_h);
    expect(result.stateVector!.every((value) => value >= 0)).toBe(true);
    expectPhysicalBalancesClose(result);
  });

  it('retains the zero-transfer invariant at lambda=0', () => {
    const zeroTransfer = input(2);
    zeroTransfer.solverOptions = { ...zeroTransfer.solverOptions, transferStrength: 0 };
    const result = solveECR2CounterCurrentBVP(zeroTransfer);
    expect(result.status).toBe('converged');
    expect(result.maximumNormalizedResidual).toBe(0);
    expect(result.outlets.raffinate!.componentFlows_kg_h).toEqual(zeroTransfer.rrboFeedComponentFlows_kg_h);
    expect(result.outlets.extract!.componentFlows_kg_h).toEqual(zeroTransfer.nmpFeedComponentFlows_kg_h);
  });

  it('solves N=2 deterministically and returns an axial profile', () => {
    const first = solveECR2CounterCurrentBVP(input(2));
    const second = solveECR2CounterCurrentBVP(input(2));
    expect(first.status).toBe('converged');
    expect(second.status).toBe('converged');
    expect(first.stateVector).toEqual(second.stateVector);
    expect(first.axialProfile).toHaveLength(2);
    expect(first.axialProfile.map((point) => point.z_m)).toEqual([0.0025, 0.0075]);
    expectPhysicalBalancesClose(first);
    expectPhysicalBalancesClose(second);
  });

  it('keeps local NRTL coordinates and equilibrium isolated from physical molecular weights', () => {
    const baseInput = input(1);
    baseInput.solverOptions = { ...baseInput.solverOptions, transferStrength: 0 };
    const alteredMwInput = input(1);
    alteredMwInput.solverOptions = { ...alteredMwInput.solverOptions, transferStrength: 0 };
    alteredMwInput.physicalMolecularWeights = {
      Sat_g_mol: 720,
      Mono_g_mol: 410,
      Di_g_mol: 510,
      Poly_g_mol: 650,
      NMP_g_mol: 99.13,
    };

    const base = solveECR2CounterCurrentBVP(baseInput);
    const altered = solveECR2CounterCurrentBVP(alteredMwInput);
    expect(base.status).toBe('converged');
    expect(altered.status).toBe('converged');

    const baseNrtl = base.compartments[0].localNRTL;
    const alteredNrtl = altered.compartments[0].localNRTL;
    expectVectorsClose(baseNrtl.x_j, alteredNrtl.x_j);
    expectVectorsClose(baseNrtl.y_j, alteredNrtl.y_j);
    expectVectorsClose(baseNrtl.z_feed, alteredNrtl.z_feed);
    expectVectorsClose(baseNrtl.x_eq, alteredNrtl.x_eq);
    expectVectorsClose(baseNrtl.y_eq, alteredNrtl.y_eq);
  });

  it('updates local NRTL coordinates and equilibrium when physical mass composition changes', () => {
    const baseInput = input(1);
    baseInput.solverOptions = { ...baseInput.solverOptions, transferStrength: 0 };
    const changedCompositionInput = input(1);
    changedCompositionInput.solverOptions = {
      ...changedCompositionInput.solverOptions,
      transferStrength: 0,
    };
    changedCompositionInput.rrboFeedComponentFlows_kg_h = [40, 35, 15, 10, 0];

    const base = solveECR2CounterCurrentBVP(baseInput);
    const changed = solveECR2CounterCurrentBVP(changedCompositionInput);
    expect(base.status).toBe('converged');
    expect(changed.status).toBe('converged');

    const baseNrtl = base.compartments[0].localNRTL;
    const changedNrtl = changed.compartments[0].localNRTL;
    expect(changedNrtl.x_j).not.toEqual(baseNrtl.x_j);
    expect(changedNrtl.z_feed).not.toEqual(baseNrtl.z_feed);
    expect(changedNrtl.x_eq).not.toEqual(baseNrtl.x_eq);
    expect(changedNrtl.y_eq).not.toEqual(baseNrtl.y_eq);
  });

  it('matches the C2 thermodynamic coordinate at the initial BVP boundary', () => {
    const baseInput = input(1);
    baseInput.solverOptions = { ...baseInput.solverOptions, transferStrength: 0 };
    const result = solveECR2CounterCurrentBVP(baseInput);
    expect(result.status).toBe('converged');

    const basis = baseInput.c2ThermodynamicBasis!;
    const c2MixedFeed = [
      ...basis.feedMoleFractions.map((fraction) => fraction / (1 + basis.solventMolarRatio)),
    ];
    c2MixedFeed[4] += basis.solventMolarRatio / (1 + basis.solventMolarRatio);

    const bvpInitialMassFractions = [
      50 / 300,
      30 / 300,
      15 / 300,
      5 / 300,
      200 / 300,
    ];
    const bvpInitialThermo = thermodynamicMoleFractionsFromPhysicalMassFractions(
      bvpInitialMassFractions,
    );
    expectVectorsClose(
      bvpInitialThermo,
      c2MixedFeed,
    );
    expectVectorsClose(result.compartments[0].localNRTL.z_feed, c2MixedFeed);
    expect(SURROGATE_MW.nmp).toBe(99.13);
  });

  it('accepts a prior converged face state as its initial profile', () => {
    const first = solveECR2CounterCurrentBVP(input(1));
    const next = input(1);
    next.previousSolution = first.stateVector;
    const second = solveECR2CounterCurrentBVP(next);
    expect(second.status).toBe('converged');
    expect(second.diagnostics.join(' ')).toContain('previous converged solution');
  });

  it('keeps the five frozen components isolated and conserves NMP in an increasing grid', () => {
    const result = solveECR2CounterCurrentBVP(input(3));
    expect(result.status).toBe('converged');
    expect(result.compartments).toHaveLength(3);
    expectPhysicalBalancesClose(result);
    for (const compartment of result.compartments) {
      expect(compartment.transferAmount_kg_h).toHaveLength(5);
      for (let component = 0; component < 5; component++) {
        const localD = compartment.dispersedIncoming_kg_h[component] -
          compartment.dispersedOutgoing_kg_h[component] - compartment.transferAmount_kg_h[component];
        const localC = compartment.continuousIncoming_kg_h[component] -
          compartment.continuousOutgoing_kg_h[component] + compartment.transferAmount_kg_h[component];
        expect(Math.abs(localD)).toBeLessThan(1e-5);
        expect(Math.abs(localC)).toBeLessThan(1e-5);
      }
    }
  });

  it('retains raw and normalized residuals consistently', () => {
    const result = solveECR2CounterCurrentBVP(input(1));
    expect(result.status).toBe('converged');
    const record = result.residuals[0];
    const inputScale = Math.max(input(1).rrboFeedComponentFlows_kg_h[0], input(1).nmpFeedComponentFlows_kg_h[0]);
    expect(record.dispersedNormalized).toBeCloseTo(record.dispersedRaw_kg_h / inputScale, 12);
    expect(record.continuousNormalized).toBeCloseTo(record.continuousRaw_kg_h / inputScale, 12);
  });

  it('fails closed for missing C2, d32, diffusivity, and partition approval', () => {
    const noC2 = input();
    noC2.c2ThermodynamicBasis = null;
    expect(solveECR2CounterCurrentBVP(noC2).failure?.dependency).toBe('c2_thermodynamic_basis');

    const noD32 = input();
    noD32.d32Config = null;
    expect(solveECR2CounterCurrentBVP(noD32).failure?.dependency).toBe('d32');

    const noDiffusivity = input();
    noDiffusivity.governedProperties.diffusivity.Di.De_d = null;
    expect(solveECR2CounterCurrentBVP(noDiffusivity).failure?.dependency).toBe('local_property_closure');

    const noPartition = input();
    noPartition.partitionBasis = null;
    expect(solveECR2CounterCurrentBVP(noPartition).failure?.dependency).toBe('partition_basis');
  });

  it('rejects an infeasible donor-inventory trial at a deliberately excessive transfer volume', () => {
    const excessive = input(1);
    excessive.activeHeight_m = 1;
    const result = solveECR2CounterCurrentBVP(excessive);
    expect(result.status).toBe('blocked');
    expect(result.failure?.dependency).toBe('donor_inventory');
  });

  it('blocks transfer availability when a locally evaluable BVP is not accepted', () => {
    const nonConverged = input(1);
    nonConverged.solverOptions = {
      transferStrength: 0,
      maxIterations: 1,
      maxFunctionEvaluations: 1,
    };

    const result = solveECR2CounterCurrentBVP(nonConverged);
    expect(result.status).toBe('non_converged');
    expect(result.compartments.length).toBeGreaterThan(0);
    expect(result.transferStatus).toMatchObject({
      status: 'LOCAL_PRELIMINARY_BLOCKED',
      localPhysicsStatus: 'BLOCKED',
      blocker: { dependency: 'convergence' },
    });
  });

  it('fails closed for a missing required local physical property and preserves preliminary provenance', () => {
    const noMuD = input();
    noMuD.governedProperties.mu_d_engineer = null;
    const blocked = solveECR2CounterCurrentBVP(noMuD);
    expect(blocked.status).toBe('blocked');
    expect(blocked.failure?.dependency).toBe('local_property_closure');
    expect(blocked.transferStatus).toMatchObject({
      status: 'LOCAL_PRELIMINARY_BLOCKED',
      localPhysicsStatus: 'BLOCKED',
      governedValues: 'UNAVAILABLE',
      releaseStatus: 'NOT_RELEASE_ELIGIBLE',
      blocker: { dependency: 'local_property_closure' },
    });

    const valid = solveECR2CounterCurrentBVP(input());
    expect(valid.engineeringBasis).toBe('Published Correlation — Preliminary Engineering');
    expect(valid.primarySourceVerified).toBe(false);
    expect(valid.validatedForRRBONMP).toBe(false);
    expect(valid.pilotCalibrationStatus).toBe('NOT_YET_VALIDATED');
  });

  it('does not turn a physically inadmissible d32 into transfer performance', () => {
    const invalidD32 = input();
    invalidD32.d32Config = {
      mode: 'engineer_supplied',
      value_m: 0,
      sourceType: 'Assumed',
      sourceReference: 'Invalid zero d32 regression fixture',
    };

    const result = solveECR2CounterCurrentBVP(invalidD32);
    expect(result.status).toBe('blocked');
    expect(result.failure?.dependency).toBe('d32');
    expect(result.transferStatus).toMatchObject({
      status: 'LOCAL_PRELIMINARY_BLOCKED',
      governedValues: 'UNAVAILABLE',
      releaseStatus: 'NOT_RELEASE_ELIGIBLE',
      blocker: { dependency: 'd32' },
    });
    expect(result.axialProfile).toEqual([]);
    expect(result.outlets).toEqual({ raffinate: null, extract: null });
  });

  it('does not label an inadmissible engineer d32 as supplied in the dependency graph', () => {
    const graph = buildDependencyGraph({
      psiAvailable: true,
      holdupUsable: true,
      d32Available: false,
      d32EngineerSupplied: true,
      d32CorrelationUnresolved: false,
      propertiesAvailable: true,
    });
    const d32 = graph.nodes.find((node) => node.quantity === 'd32');
    expect(d32).toMatchObject({
      level: 'missing_dependency',
      blockedBy: 'blocked_by_d32',
    });
  });

  it('reports a structured non-convergence outcome under a zero evaluation budget', () => {
    const constrained = input();
    constrained.solverOptions = { maxIterations: 1, maxFunctionEvaluations: 1 };
    const result = solveECR2CounterCurrentBVP(constrained);
    expect(result.status).toBe('non_converged');
    expect(result.failure?.dependency).toBe('convergence');
    expect(result.maximumNormalizedResidual).not.toBeNull();
  });
});