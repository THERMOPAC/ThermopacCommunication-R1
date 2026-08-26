import { describe, expect, it, vi } from 'vitest';

import {
  projectECR2BVPFaceState,
  solveECR2ProgressiveHeight,
} from '../server/engines/llx/llx-ecr2-progressive-height-solver';
import type {
  ECR2CounterCurrentBVPInput,
  ECR2CounterCurrentBVPResult,
} from '../server/engines/llx/llx-ecr2-counter-current-bvp';
import { createECR2BVPBlockedResult } from '../server/engines/llx/llx-ecr2-counter-current-bvp';

const baseInput = {
  columnCrossSectionArea_m2: 1,
  psi_W_kg: 1,
  powerPerAgitator_W: 1,
  columnDiameter_m: 0.1,
  rotorDiameter_m: 0.06,
  physicalCompartmentHeight_m: 0.06,
  holdupSystemIdentity: 'published_reference_system',
  holdupMassTransferDirection: 'no_mass_transfer',
  statorOpenAreaFraction: 0.5,
  operatingTemperature_C: 70,
  physicalMolecularWeights: {
    Sat_g_mol: 100, Mono_g_mol: 100, Di_g_mol: 100, Poly_g_mol: 100, NMP_g_mol: 100,
  },
  c2ThermodynamicBasis: {} as any,
  rrboFeedComponentFlows_kg_h: [70, 20, 5, 5, 0],
  nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, 200],
  governedProperties: {} as any,
  d32Config: null,
  partitionBasis: null,
  solverOptions: undefined,
} satisfies Omit<ECR2CounterCurrentBVPInput, 'numberOfCompartments' | 'activeHeight_m' | 'previousSolution'>;

function acceptedBvp(input: ECR2CounterCurrentBVPInput, massBalanceStatus: 'passed' | 'failed' = 'passed') {
  // NMP is deliberately enormous; the expected aromatic product fraction must
  // remain based on the four hydrocarbon components only.
  const aromaticFlow = Math.max(0, 30 - input.activeHeight_m * 100);
  return {
    status: 'converged',
    massBalanceStatus,
    stateVector: Array.from({ length: input.numberOfCompartments * 10 }, (_, i) => i + 1),
    failure: null,
    outlets: {
      raffinate: {
        componentFlows_kg_h: [70, aromaticFlow, 0, 0, 10000],
      },
      extract: null,
    },
  } as unknown as ECR2CounterCurrentBVPResult;
}

describe('ECR-2 progressive BVP physical-height solver', () => {
  it('creates a NOT_CALCULATED blocked snapshot without inventing a height or running a BVP', () => {
    const blocked = createECR2BVPBlockedResult(
      'physical_product_target',
      'Required Active Extraction Height = NOT_CALCULATED because no governed target is available.',
    );

    expect(blocked).toMatchObject({
      status: 'blocked',
      convergenceStatus: 'dependency_blocked',
      massBalanceStatus: 'not_evaluated',
      functionEvaluations: 0,
      outlets: { raffinate: null, extract: null },
      failure: { dependency: 'physical_product_target' },
    });
  });

  it('projects face-flow state between numerical meshes without copying local transfer fields', () => {
    const projected = projectECR2BVPFaceState({
      previousState: Array.from({ length: 20 }, (_, index) => index + 1),
      previousCells: 2,
      nextCells: 3,
      rrboFeedComponentFlows_kg_h: [10, 20, 30, 40, 0],
      nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, 99],
    });

    expect(projected).toHaveLength(30);
    // The known RRBO bottom boundary and fresh-NMP top boundary are preserved.
    expect(projected!.slice(0, 5)).not.toEqual([10, 20, 30, 40, 0]);
    expect(projected!.slice(-5)).not.toEqual([0, 0, 0, 0, 99]);
    expect(projected!.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });

  it('reruns the BVP over physical heights and selects a conservative unrounded height on the hydrocarbon-only product basis', () => {
    const solveBvp = vi.fn((input: ECR2CounterCurrentBVPInput) => acceptedBvp(input));
    const result = solveECR2ProgressiveHeight({
      target: {
        value: 0.28,
        sourceType: 'Measured',
        sourceReference: 'Physical hydrocarbon-only product specification',
      },
      maximumCellHeight_m: 0.05,
      physicalMolecularWeights_g_mol: [100, 100, 100, 100, 100],
      bvpBaseInput: baseInput,
      maximumPhysicalHeight_m: 1,
      heightTolerance_m: 0.002,
      solveBvp,
    });

    expect(result.status).toBe('target_met');
    expect(solveBvp.mock.calls.length).toBeGreaterThan(5);
    expect(new Set(solveBvp.mock.calls.map(([input]) => input.activeHeight_m)).size).toBeGreaterThan(3);
    expect(result.achievedProductAromaticsMoleFraction).toBeLessThanOrEqual(0.28);
    // If NMP were included, this would be close to zero instead of 0.20.
    expect(result.achievedProductAromaticsMoleFraction).toBeGreaterThan(0.27);
    expect(result.requiredActiveHeight_m).not.toBeNull();
    expect(result.selectedDeltaZ_m! * result.selectedNumberOfCells!).toBeCloseTo(result.requiredActiveHeight_m!, 12);
    expect(result.requiredActiveHeight_m! / result.maximumCellHeight_m)
      .not.toBeCloseTo(Math.round(result.requiredActiveHeight_m! / result.maximumCellHeight_m), 8);
  });

  it('keeps governed ψ invariant across physical-height trials and independent of the Δz maximum', () => {
    const runWithMesh = (maximumCellHeight_m: number) => {
      const seen: ECR2CounterCurrentBVPInput[] = [];
      const result = solveECR2ProgressiveHeight({
        target: { value: 0.28, sourceType: 'Measured', sourceReference: 'physical product specification' },
        maximumCellHeight_m,
        maximumPhysicalHeight_m: 1,
        heightTolerance_m: 0.002,
        physicalMolecularWeights_g_mol: [100, 100, 100, 100, 100],
        bvpBaseInput: baseInput,
        buildTrialBvpInput: ({ physicalHeight_m, numberOfCells, previousSolution }) => ({
          ...baseInput,
          numberOfCompartments: numberOfCells,
          activeHeight_m: physicalHeight_m,
          // ψ is the governed process condition, not a whole-column rotor
          // power divided by trial height or a numerical cell volume.
          psi_W_kg: 12,
          previousSolution,
        }),
        solveBvp: (input) => {
          seen.push(input);
          return acceptedBvp(input);
        },
      });
      return { result, seen };
    };

    const coarse = runWithMesh(0.05);
    const fine = runWithMesh(0.025);
    expect(coarse.result.status).toBe('target_met');
    expect(fine.result.status).toBe('target_met');
    expect(fine.result.requiredActiveHeight_m).toBeCloseTo(coarse.result.requiredActiveHeight_m!, 12);
    expect(fine.seen.some((input) => input.numberOfCompartments > 1)).toBe(true);
    for (const input of [...coarse.seen, ...fine.seen]) {
      expect(input.psi_W_kg).toBe(12);
      expect(input.directTurbulenceRotor).toBeUndefined();
    }
  });

  it('fails closed instead of changing governed ψ to recover an unphysical starter trial', () => {
    const solveBvp = vi.fn((input: ECR2CounterCurrentBVPInput) => {
      if (input.activeHeight_m < 0.04) {
        return {
          status: 'blocked',
          massBalanceStatus: 'not_evaluated',
          stateVector: null,
          failure: {
            message: 'K&H 1995 holdup is unusable: physically_invalid.',
          },
        } as unknown as ECR2CounterCurrentBVPResult;
      }
      return acceptedBvp(input);
    });
    const result = solveECR2ProgressiveHeight({
      target: { value: 0.25, sourceType: 'Assumed', sourceReference: 'physical product target' },
      maximumCellHeight_m: 0.05,
      maximumPhysicalHeight_m: 1,
      heightTolerance_m: 0.002,
      physicalMolecularWeights_g_mol: [100, 100, 100, 100, 100],
      bvpBaseInput: baseInput,
      solveBvp,
    });

    expect(result.status).toBe('not_calculable');
    expect(result.requiredActiveHeight_m).toBeNull();
    expect(result.trials).toHaveLength(1);
    expect(result.diagnostics.at(-1)).toContain('initial 0.0100 m physical-height BVP is not accepted');
    expect(solveBvp).toHaveBeenCalledOnce();
  });

  it('refuses to use a converged-but-globally-unbalanced BVP point in the height search', () => {
    const result = solveECR2ProgressiveHeight({
      target: { value: 0.2, sourceType: 'Assumed', sourceReference: 'test target' },
      maximumCellHeight_m: 0.05,
      physicalMolecularWeights_g_mol: [100, 100, 100, 100, 100],
      bvpBaseInput: baseInput,
      solveBvp: (input) => acceptedBvp(input, 'failed'),
    });

    expect(result.status).toBe('not_calculable');
    expect(result.requiredActiveHeight_m).toBeNull();
    expect(result.trials[0].accepted).toBe(false);
  });

  it('fails closed when a bisection point rises above an already-evaluated higher-height residual', () => {
    const solveBvp = (input: ECR2CounterCurrentBVPInput) => {
      const aromaticFlow = input.activeHeight_m >= 0.15
        ? 27.3
        : input.activeHeight_m >= 0.10
          ? 27
          : 30;
      return {
        status: 'converged',
        massBalanceStatus: 'passed',
        stateVector: Array.from({ length: input.numberOfCompartments * 10 }, () => 1),
        failure: null,
        outlets: {
          raffinate: { componentFlows_kg_h: [70, aromaticFlow, 0, 0, 10000] },
          extract: null,
        },
      } as unknown as ECR2CounterCurrentBVPResult;
    };
    const result = solveECR2ProgressiveHeight({
      target: { value: 0.281, sourceType: 'Assumed', sourceReference: 'test target' },
      maximumCellHeight_m: 0.05,
      physicalMolecularWeights_g_mol: [100, 100, 100, 100, 100],
      bvpBaseInput: baseInput,
      heightTolerance_m: 0.002,
      solveBvp,
    });

    expect(result.status).toBe('not_calculable');
    expect(result.diagnostics.at(-1)).toContain('residual increased');
  });

  it('reports no feasible height when the recovery boundary is reached before the aromatic target', () => {
    const result = solveECR2ProgressiveHeight({
      target: { value: 0.2, sourceType: 'Assumed', sourceReference: 'recovery boundary regression' },
      maximumCellHeight_m: 0.05,
      maximumPhysicalHeight_m: 1,
      heightTolerance_m: 0.002,
      physicalMolecularWeights_g_mol: [100, 100, 100, 100, 100],
      bvpBaseInput: baseInput,
      solveBvp: acceptedBvp,
    });

    expect(result.status).toBe('no_feasible_recovery');
    expect(result.requiredActiveHeight_m).toBeNull();
    expect(result.selectedBvp).toBeNull();
    expect(result.bestAromaticsAtRequiredRecovery).toMatchObject({
      rrboRecoveryMassFraction: expect.any(Number),
      recoveryResidual: expect.any(Number),
    });
  });

  it('keeps a feasible height when quality and recovery cross inside the same expansion interval', () => {
    const result = solveECR2ProgressiveHeight({
      target: { value: 0.27, sourceType: 'Assumed', sourceReference: 'recovery/quality crossing regression' },
      maximumCellHeight_m: 0.05,
      maximumPhysicalHeight_m: 1,
      heightTolerance_m: 0.002,
      physicalMolecularWeights_g_mol: [100, 100, 100, 100, 100],
      bvpBaseInput: baseInput,
      solveBvp: (input) => {
        const aromaticFlow = Math.max(0, 30 - input.activeHeight_m * 40);
        return {
          status: 'converged',
          massBalanceStatus: 'passed',
          stateVector: Array.from({ length: input.numberOfCompartments * 10 }, (_, index) => index + 1),
          failure: null,
          outlets: {
            raffinate: { componentFlows_kg_h: [70, aromaticFlow, 0, 0, 10000] },
            extract: null,
          },
        } as unknown as ECR2CounterCurrentBVPResult;
      },
    });

    expect(result.status).toBe('target_met');
    expect(result.requiredActiveHeight_m).not.toBeNull();
    expect(result.achievedProductAromaticsMoleFraction).toBeLessThanOrEqual(0.27);
    expect(result.rrboRecoveryMassFraction).toBeGreaterThanOrEqual(0.95);
  });

});