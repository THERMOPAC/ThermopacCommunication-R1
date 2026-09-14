import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  compareStage4FrozenCoarseReproductionEndpoints,
  prepareStage4FrozenCoarseIndependentDonorSeed,
  runStage4FrozenCoarseDiagnostic,
  runStage4FrozenResidualControlledDiagnostic,
  type Stage4PhysicalSizingInput,
} from '../server/ecr-pre-pilot/stage4-predictive-physical-sizing';

const h = 'a'.repeat(64);
const input: Stage4PhysicalSizingInput = {
  calculatedNt: 5, stage1SnapshotHash: h, stage2JobId: 'stage2', stage2ResultHash: h,
  stage2EngineHash: h, stage3RunId: 'stage3', stage3ImmutableHash: h,
  stage3ImplementationHash: h, selectedTrialId: 'persisted-rpm-30', selectedTrialOrdinal: 0,
  maximumCompartments: 5,
  processBasis: {
    temperatureK: 298.15, phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
    rrboFeed: { flowM3S: 1e-5, densityKgM3: 850, dynamicViscosityPaS: .003 },
    wetSolventPhase: { flowM3S: 1e-5, densityKgM3: 997, dynamicViscosityPaS: .001083 },
    interfacialTensionNM: .01,
    composition: {
      rrboFeedWt: { saturates: 70, monoAromatics: 10, diAromatics: 8, polyAromatics: 5,
        polarAromatics: 4, nmp: 3 },
      wetSolventWt: { nmp: 99, water: 1 },
    },
  },
  hydraulics: {
    diameterM: .9742129194448474, rotorDiameterM: .4871064597224237, rpm: 30,
    d32M: .1, operatingHoldup: .0816427744236363,
    continuousSuperficialVelocityMS: .0009598419119466572,
    dispersedSuperficialVelocityMS: .0014905956171508057,
  },
  stage1Targets: {
    minimumRecoveryPct: 0, minimumRaffinateSaturatesWt: 0, targetRaffinateTotalAromaticsWt: 100,
    targetRaffinatePolarAromaticsWt: 100, maximumNmpRaffinateWt: 100, feedSulfurPpm: 0,
    targetRaffinateSulfurPpm: 1, sulfurAllocationSatPct: 20, sulfurAllocationMonoPct: 20,
    sulfurAllocationDiPct: 20, sulfurAllocationPolyPct: 20, sulfurAllocationPaPct: 20,
  },
};

const flashEvaluator = async () => ({
  status: 'CALCULATED',
  phaseOrientation: 'NMP_RICH_EXTRACT',
  resultHash: h,
  raffinateComposition: [.65, .12, .09, .05, .03, .05, .01],
  extractComposition: [.03, .02, .02, .01, .01, .85, .06],
});
const interfaceEvaluator = async () => ({
  status: 'CALCULATED_PRELIMINARY_INTERFACE',
  resultHash: h,
  interface: {
    continuousComponentFluxMolM2S: Array(7).fill(0),
    continuousDiffusiveFluxMolM2S: Array(7).fill(0),
    dispersedDiffusiveFluxMolM2S: Array(7).fill(0),
    dispersedComponentFluxMolM2S: Array(7).fill(0),
    continuousMoleFractions: Array(7).fill(1 / 7),
    dispersedMoleFractions: Array(7).fill(1 / 7),
    totalMolarFluxMolM2S: 0,
    fluxEqualityResidualMolM2S: Array(7).fill(0),
  },
} as any);

describe('frozen Stage-4 coarse convergence diagnostic', () => {
  it('runs only c=0.0126 on five physical compartments and ten coarse cells', async () => {
    const phases: string[] = [];
    const trace: any[] = [];
    const result = await runStage4FrozenCoarseDiagnostic(input, {
      flashEvaluator, interfaceEvaluator, onIteration: row => trace.push(row),
      onProgress: event => phases.push(event.phase),
    });

    expect(phases).toEqual(['PRIMARY_RUNNING', 'PRIMARY_COMPLETE']);
    expect(result).toMatchObject({
      caseCoefficient: .0126, physicalCompartments: 5,
      finiteVolumeCellsPerPhysicalCompartment: 2,
      initialization: { method: 'EXISTING_ZERO_TRANSFER_DEFAULT' },
    });
    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({
      iteration: 1,
      localInterfaceQualification: {
        status: 'QUALIFIED_BY_EXISTING_JOB_B_RESPONSE_GATE',
        completedCells: 10, requiredCells: 10,
      },
      localFlashQualification: {
        status: 'NOT_EVALUATED_INTERIM_EXISTING_SOLVER_FINAL_ONLY',
      },
      transferMolS: expect.any(Array),
      continuousFaceComponentFlowsMolS: expect.any(Array),
      continuousCellMoleFractions: expect.any(Array),
      dispersedCellInComponentFlowsMolS: expect.any(Array),
      dispersedCellOutComponentFlowsMolS: expect.any(Array),
      dispersedCellMoleFractions: expect.any(Array),
      physicalAdmissibility: {
        continuousFacesNonnegative: true,
        continuousTotalFaceFlowsPositive: true,
        localPhaseStatesNonnegative: true,
      },
    });
    expect(trace[0].continuousFaceComponentFlowsMolS).toHaveLength(11);
    // The coarse pass cannot be called converged without both the existing
    // actual Job-B constitutive residual and the independent next-state flow
    // reconstruction gate.
    expect(result.solver.maxScaledConstitutiveResidual).toBeLessThanOrEqual(1e-5);
    expect(result.solver.maxPostUpdateScaledComponentBalanceResidual).toBeLessThanOrEqual(1e-10);
    expect(Math.abs(result.solver.postUpdateTotalMassBalanceResidualKgS ?? Infinity)).toBeLessThanOrEqual(1e-12);
    expect(result.solver.maxPostUpdateContinuousAxialEquationResidualMolS).toBeLessThanOrEqual(1e-10);
    expect(result.solver.postUpdatePhysicalAdmissibilityPassed).toBe(true);
    // Regression: the named original diagnostic remains on the historical
    // Picard route. Residual control is a separately opted-in qualification.
    expect(result.solver.residualControlled).toBeUndefined();
  });

  it('preserves the explicit diagnostic budget stop without starting another mesh', async () => {
    await expect(runStage4FrozenCoarseDiagnostic(input, {
      wallClockBudgetMs: 20,
      flashEvaluator: () => new Promise(() => undefined),
      interfaceEvaluator,
    })).rejects.toThrow('GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED');
  });

  it('makes the opt-in residual route record a fresh complete whole-column state', async () => {
    const candidates: any[] = [];
    const result = await runStage4FrozenResidualControlledDiagnostic(input, {
      flashEvaluator, interfaceEvaluator, onCandidate: candidate => candidates.push(candidate),
    });
    expect(result.schema).toBe('ECR_STAGE4_FROZEN_RESIDUAL_CONTROLLED_WHOLE_COLUMN_DIAGNOSTIC_V1');
    expect(result.solver.residualControlled).toMatchObject({
      strategy: 'SAFEGUARDED_GOOD_BROYDEN_ACTUAL_WHOLE_COLUMN_RESIDUAL_V1',
      finalActualScaledResidual: expect.any(Number),
    });
    // Zero is a same-state final qualification: it still requires fresh Job-B
    // residual evidence and every final holdup-inventory local-LLE gate.
    expect(result.solver.localFlashCalls).toBe(10);
    expect(result.solver.maxScaledConstitutiveResidual).toBe(0);
    expect(result.solver.maxScaledUpdateResidual).toBe(0);
    expect(result.solver.postUpdatePhysicalAdmissibilityPassed).toBe(true);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      disposition: 'INITIAL',
      actualResidualStatus: 'COMPLETE_FRESH_WHOLE_COLUMN_EVALUATION',
      actualMaximumScaledResidual: 0,
      localInterfaceQualification: {
        status: 'QUALIFIED_BY_EXISTING_JOB_B_RESPONSE_GATE',
        completedCells: 10,
      },
    });
    expect(candidates[0].localInterfaceQualification.requests).toHaveLength(10);
    expect(candidates[0].localInterfaceQualification.requests[0]).toMatchObject({
      requestHash: expect.any(String), request: expect.any(Object), response: expect.any(Object),
    });
  });

  it('accepts nonzero transfer only after fresh actual residual merit reduction and retains a rejected state', async () => {
    let calls = 0;
    const candidates: any[] = [];
    const actualInterface = async () => {
      calls += 1;
      // First complete state is the fixed point target; the second intentionally
      // worsens the actual candidate residual. This tests real evaluation, not
      // the inverse-Broyden prediction.
      const sign = calls <= 10 || calls > 20 ? 1 : -1;
      const flux = Array(7).fill(0);
      flux[5] = sign * 1e-4;
      return {
        ...(await interfaceEvaluator()),
        interface: {
          ...(await interfaceEvaluator()).interface,
          continuousComponentFluxMolM2S: flux,
          totalMolarFluxMolM2S: flux[5],
        },
      } as any;
    };
    const result = await runStage4FrozenResidualControlledDiagnostic(input, {
      flashEvaluator, interfaceEvaluator: actualInterface, onCandidate: row => candidates.push(row),
    });
    expect(result.solver.converged).toBe(true);
    expect(result.solver.maxScaledConstitutiveResidual).toBeLessThanOrEqual(1e-5);
    expect(result.solver.maxScaledUpdateResidual).toBeLessThanOrEqual(2e-6);
    const rejected = candidates.find(row => row.disposition === 'REJECTED');
    const accepted = candidates.find(row => row.disposition === 'ACCEPTED');
    expect(rejected).toMatchObject({
      rejectionReason: 'ACTUAL_WHOLE_COLUMN_RESIDUAL_NOT_REDUCED',
      actualResidualStatus: 'COMPLETE_FRESH_WHOLE_COLUMN_EVALUATION',
    });
    expect(rejected.transferMolS).toHaveLength(10);
    expect(rejected.actualRawResidualMolS).toHaveLength(10);
    expect(rejected.localInterfaceQualification.requests).toHaveLength(10);
    expect(accepted).toMatchObject({
      actualResidualStatus: 'COMPLETE_FRESH_WHOLE_COLUMN_EVALUATION',
      localInterfaceQualification: { completedCells: 10 },
    });
  });

  it('records a terminal worker failure and does not issue another interface request', async () => {
    let calls = 0;
    const candidates: any[] = [];
    const terminalAfterInitialState = async () => {
      calls += 1;
      if (calls === 11) throw new Error('STAGE4_JOB_B_INTERFACE_TIMEOUT');
      const flux = Array(7).fill(0); flux[5] = 1e-4;
      return {
        ...(await interfaceEvaluator()),
        interface: { ...(await interfaceEvaluator()).interface,
          continuousComponentFluxMolM2S: flux, totalMolarFluxMolM2S: flux[5] },
      } as any;
    };
    const result = await runStage4FrozenResidualControlledDiagnostic(input, {
      flashEvaluator, interfaceEvaluator: terminalAfterInitialState, onCandidate: row => candidates.push(row),
    });
    expect(result.solver.converged).toBe(false);
    expect(result.solver.reason).toContain('STAGE4_JOB_B_INTERFACE_TIMEOUT');
    expect(calls).toBe(11);
    expect(candidates.at(-1)).toMatchObject({
      disposition: 'REJECTED',
      rejectionReason: 'STAGE4_JOB_B_INTERFACE_TIMEOUT',
      actualResidualStatus: 'NOT_COMPLETED_PHYSICAL_OR_LOCAL_GATE_FAILED',
      localInterfaceQualification: { completedCells: 0, requiredCells: 10 },
    });
    expect(candidates.at(-1).localInterfaceQualification.requests[0].failure)
      .toContain('STAGE4_JOB_B_INTERFACE_TIMEOUT');
  });

  it('records a returned interface response-gate failure rather than labeling it successful', async () => {
    const candidates: any[] = [];
    const result = await runStage4FrozenResidualControlledDiagnostic(input, {
      flashEvaluator,
      interfaceEvaluator: async () => ({ status: 'NUMERICAL_FAILURE', interface: null } as any),
      onCandidate: row => candidates.push(row),
    });
    expect(result.solver.converged).toBe(false);
    expect(result.solver.reason).toContain('STAGE4_JOB_B_INTERFACE_UNAVAILABLE:NUMERICAL_FAILURE');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].localInterfaceQualification.requests[0]).toMatchObject({
      response: { status: 'NUMERICAL_FAILURE' },
      failure: 'STAGE4_JOB_B_INTERFACE_UNAVAILABLE:NUMERICAL_FAILURE',
    });
  });

  it('preserves nonzero legacy Picard semantics separately from the opt-in solver', async () => {
    const nonzeroInterface = async () => {
      const flux = Array(7).fill(0); flux[5] = 1e-4;
      return {
        ...(await interfaceEvaluator()),
        interface: { ...(await interfaceEvaluator()).interface,
          continuousComponentFluxMolM2S: flux, totalMolarFluxMolM2S: flux[5] },
      } as any;
    };
    const result = await runStage4FrozenCoarseDiagnostic(input, {
      flashEvaluator, interfaceEvaluator: nonzeroInterface,
    });
    expect(result.solver.converged).toBe(true);
    expect(result.solver.residualControlled).toBeUndefined();
    expect(result.solver.transfer.flat().some(value => Math.abs(value) > 0)).toBe(true);
    expect(result.solver.maxScaledUpdateResidual).toBeLessThanOrEqual(2e-6);
  });

  it('rejects an otherwise finite interface result over the governing 1e-9 diagnostics gates', async () => {
    const overThresholdInterface = async () => ({
      ...(await interfaceEvaluator()),
      interface: {
        ...(await interfaceEvaluator()).interface,
        fluxEqualityResidualMolM2S: Array(7).fill(1),
      },
    });
    const result = await runStage4FrozenCoarseDiagnostic(input, {
      flashEvaluator, interfaceEvaluator: overThresholdInterface,
    });
    expect(result.solver.converged).toBe(false);
    expect(result.solver.maxFilmEqualityResidualMolS).toBeGreaterThan(1e-9);
    // A false convergence result is the explicit harness gate that prevents
    // conditional construction/launch of a second reproduction attempt.
    expect(result.solver.reason).toContain('FINAL_SCALED_RESIDUAL_GATE_FAILED');
  });

  it('accepts only a physically admissible true prior solve state as the alternate start', async () => {
    const priorSolveState = Array.from({ length: 10 }, () => Array(7).fill(0));
    priorSolveState[0][5] = 1e-8;
    const trace: any[] = [];
    const result = await runStage4FrozenCoarseDiagnostic(input, {
      flashEvaluator, interfaceEvaluator, initialTransfer: priorSolveState,
      onIteration: row => trace.push(row),
    });
    expect(result.initialization).toEqual({
      method: 'EXACT_PRIOR_SOLVE_MESH_TRANSFER_STATE',
      suppliedTransferState: true,
    });
    expect(trace[0].outletPhaseFlows.continuousMolS[5]).toBeLessThan(1);
    await expect(runStage4FrozenCoarseDiagnostic(input, {
      flashEvaluator, interfaceEvaluator, initialTransfer: [[0]],
    })).rejects.toThrow('STAGE4_DIAGNOSTIC_INITIAL_TRANSFER_SHAPE_OR_FINITE_GATE_FAILED');
  });

  it('prepares a material, donor-limited independent alternate before any solve endpoint exists', () => {
    const seed = prepareStage4FrozenCoarseIndependentDonorSeed(input);
    expect(seed).toMatchObject({
      method: 'PRELAUNCH_FROZEN_FEED_GEOMETRY_UNIFORM_TWO_PERCENT_CONTINUOUS_DONOR_DRAW',
      donorFraction: .02,
    });
    expect(seed.transfer).toHaveLength(10);
    expect(seed.transfer.flat().some(value => value > 0)).toBe(true);
    expect(seed.reconstruction.continuousOutletComponentFlowsMolS.every(value => value >= 0)).toBe(true);
    expect(seed.reconstruction.dispersedOutletComponentFlowsMolS.every(value => value >= 0)).toBe(true);
  });

  it('keeps residual-controlled independent starts a-priori and compares their qualified endpoints', async () => {
    const seed = prepareStage4FrozenCoarseIndependentDonorSeed(input);
    const first = await runStage4FrozenResidualControlledDiagnostic(input, {
      flashEvaluator, interfaceEvaluator,
    });
    const second = await runStage4FrozenResidualControlledDiagnostic(input, {
      flashEvaluator, interfaceEvaluator, initialTransfer: seed.transfer,
      initialTransferMethod: seed.method,
    });
    expect(first.solver.converged).toBe(true);
    expect(second.solver.converged).toBe(true);
    expect(compareStage4FrozenCoarseReproductionEndpoints(input, first.solver, second.solver))
      .toMatchObject({ endpointShapesValid: true, endpointsAgree: true });
  });

  it('compares equal/near accepted candidate endpoints separately from materially different branches', async () => {
    const result = await runStage4FrozenCoarseDiagnostic(input, {
      flashEvaluator, interfaceEvaluator,
    });
    const equal = structuredClone(result.solver);
    const near = structuredClone(result.solver);
    // Fixed frozen-feed scaling: this remains below the 2e-6 comparator gate.
    near.transfer[0][0] += 1e-7 * 1e-3;
    near.continuousOutlet[0] += 1e-7 * 1e-3;
    near.dispersedOutlet[0] -= 1e-7 * 1e-3;
    const different = structuredClone(result.solver);
    different.transfer[0][0] += 1e-3 * 1e-3;
    different.continuousOutlet[0] += 1e-3 * 1e-3;
    different.dispersedOutlet[0] -= 1e-3 * 1e-3;

    expect(compareStage4FrozenCoarseReproductionEndpoints(input, result.solver, equal))
      .toMatchObject({ endpointShapesValid: true, endpointsAgree: true });
    const nearComparison = compareStage4FrozenCoarseReproductionEndpoints(input, result.solver, near);
    expect(nearComparison.endpointsAgree).toBe(true);
    expect(nearComparison.perComponent).toHaveLength(7);
    expect(compareStage4FrozenCoarseReproductionEndpoints(input, result.solver, different))
      .toMatchObject({ endpointShapesValid: true, endpointsAgree: false });
  });

  it('keeps the harness source-bound and architect-gated before a managed launch', () => {
    const harness = fs.readFileSync(
      'research/design269-stage4-five-compartment-actual-profile.ts', 'utf8',
    );
    expect(harness).toContain('snapshotSourceAndWorkerIdentity');
    expect(harness).toContain('PRELAUNCH_EVIDENCE_FROZEN_REVIEW_REQUIRED');
    expect(harness).toContain('FROZEN_COARSE_DIAGNOSTIC_ARCHITECT_APPROVED');
    expect(harness).toContain('AWAITING_ARCHITECT_REVIEW_NO_HEAVY_SOLVE_LAUNCHED');
    expect(harness).toContain('runStage4FrozenCoarseDiagnostic');
    expect(harness).toContain('prepareStage4FrozenCoarseIndependentDonorSeed');
    expect(harness).not.toContain('first.result.solver.transfer');
    expect(harness).toContain('attempts.first = firstAttempt;');
    expect(harness.indexOf('attempts.first = firstAttempt;'))
      .toBeLessThan(harness.indexOf('await runAttempt(firstAttempt);'));
    expect(harness).toContain('FROZEN_DIAGNOSTIC_INPUT_HASH_CHANGED_BEFORE_START');
    expect(harness).toContain('FROZEN_DIAGNOSTIC_SOURCE_OR_WORKER_IDENTITY_CHANGED_DURING_RUN');
    expect(harness).toContain('solver.maxDiffusiveFrameResidualMolS <= 1e-9');
    expect(harness).toContain('solver.maxFilmEqualityResidualMolS <= 1e-9');
    expect(harness).toContain('solver.maxStefanIdentityResidualMolS <= 1e-9');
    expect(harness).toContain('if (firstPassQualification) {');
    expect(harness).toContain('predeclaredReproductionComparison');
    expect(harness).toContain('BOTH_QUALIFIED_ENDPOINTS_DIFFER');
    expect(harness).not.toContain('runStage4PredictivePhysicalSizing');
    expect(harness).toContain('SOLVER_CAP_MS = 3_600_000');
    const manifest = JSON.parse(fs.readFileSync(
      'server/ecr-pre-pilot/stage4-finite-rate-source-manifest.json', 'utf8',
    ));
    const engineHash = createHash('sha256').update(fs.readFileSync(
      'server/ecr-pre-pilot/stage4-predictive-physical-sizing.ts',
    )).digest('hex');
    expect(manifest.files['server/ecr-pre-pilot/stage4-predictive-physical-sizing.ts'])
      .toBe(engineHash);
    const residualHarness = fs.readFileSync(
      'research/design269-stage4-five-compartment-residual-controlled-profile.ts', 'utf8',
    );
    expect(residualHarness).toContain('snapshotSourceAndWorkerIdentity');
    expect(residualHarness).toContain('sameFrozenDiagnosticIdentity');
    expect(residualHarness).toContain('prelaunchIdentity');
    expect(residualHarness).toContain('postrunIdentity');
    expect(residualHarness).toContain('FROZEN_RESIDUAL_CONTROLLED_DIAGNOSTIC_ARCHITECT_APPROVED');
    expect(residualHarness).toContain('independentSecondStart = deepFreeze');
    expect(residualHarness).toContain('RESIDUAL_CONTROLLED_SOURCE_OR_WORKER_IDENTITY_CHANGED_DURING_RUN');
    expect(residualHarness).toContain('SOLVER_CAP_MS = 3_600_000');
  });
});