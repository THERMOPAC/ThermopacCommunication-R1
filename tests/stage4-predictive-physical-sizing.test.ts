import { describe, expect, it } from 'vitest';
import {
  calculateKumarHartlandScreeningDispersion,
  calculateTwoFilmContinuousFlux,
  evaluateStage4ProductTargets,
  runStage4PredictivePhysicalSizing,
} from '../server/ecr-pre-pilot/stage4-predictive-physical-sizing';

const h = 'a'.repeat(64);

describe('Stage-4 predictive physical sizing', () => {
  it('enforces the global deadline even while an evaluator is awaiting an unresolved operation', async () => {
    const input = {
      calculatedNt: 5,
      processBasis: {
        temperatureK: 298.15, phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
        rrboFeed: { flowM3S: 1e-5, densityKgM3: 850, dynamicViscosityPaS: .003 },
        wetSolventPhase: { flowM3S: 1e-5, densityKgM3: 997, dynamicViscosityPaS: .001083 },
        composition: {
          rrboFeedWt: { saturates: 70, monoAromatics: 10, diAromatics: 8, polyAromatics: 5, polarAromatics: 4, nmp: 3 },
          wetSolventWt: { nmp: 99, water: 1 },
        },
      },
      hydraulics: {
        diameterM: .9742129194448474, rotorDiameterM: .4871064597224237, rpm: 30,
        continuousSuperficialVelocityMS: .0009598419119466572,
        dispersedSuperficialVelocityMS: .0014905956171508057,
      },
    } as any;
    await expect(runStage4PredictivePhysicalSizing(input, {
      wallClockBudgetMs: 30,
      flashEvaluator: () => new Promise(() => undefined),
      interfaceEvaluator: () => new Promise(() => undefined),
    })).rejects.toThrow('GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED');
  });

  it('replays the authorized K&H screening Ec values for design 269', () => {
    const common = {
      diameterM: .9742129194448474, rotorDiameterM: .4871064597224237, rpm: 30,
      continuousSuperficialVelocityMS: .0009598419119466572,
      dispersedSuperficialVelocityMS: .0014905956171508057,
      continuousDensityKgM3: 997, continuousViscosityPaS: .001083,
    };
    const primary = calculateKumarHartlandScreeningDispersion({ ...common, c: .0126 });
    const sensitivity = calculateKumarHartlandScreeningDispersion({ ...common, c: .0105 });
    expect(primary.valueM2S)
      .toBeCloseTo(.0015267874278949382, 14);
    expect(sensitivity.valueM2S)
      .toBeCloseTo(.0013431362780342957, 14);
    expect(common.continuousSuperficialVelocityMS * primary.compartmentPitchM / primary.valueM2S)
      .toBeCloseTo(.3062280885, 9);
    expect(common.continuousSuperficialVelocityMS * sensitivity.compartmentPitchM / sensitivity.valueM2S)
      .toBeCloseTo(.3480995959, 9);
  });

  it('searches real integer physical compartments before deriving efficiency', async () => {
    let flashes = 0;
    const input: Parameters<typeof runStage4PredictivePhysicalSizing>[0] = {
      calculatedNt: 2, stage1SnapshotHash: h, stage2JobId: 'stage2',
      stage2ResultHash: h, stage2EngineHash: h, stage3RunId: 1,
      stage3ImmutableHash: h, stage3ImplementationHash: h, selectedTrialId: 'point',
      selectedTrialOrdinal: 0, maximumCompartments: 2,
      processBasis: {
        temperatureK: 298.15, phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
        rrboFeed: { flowM3S: 1e-5, densityKgM3: 850, dynamicViscosityPaS: .003 },
        wetSolventPhase: { flowM3S: 1e-5, densityKgM3: 997, dynamicViscosityPaS: .001083 },
        interfacialTensionNM: .01,
        composition: {
          rrboFeedWt: { saturates: 70, monoAromatics: 10, diAromatics: 8, polyAromatics: 5, polarAromatics: 4, nmp: 3 },
          wetSolventWt: { nmp: 99, water: 1 },
        },
      },
      hydraulics: {
        diameterM: .9742129194448474, rotorDiameterM: .4871064597224237, rpm: 30,
        // Deliberately weak area gives this deterministic adapter stub a
        // non-boundary finite-rate fixed point; production uses persisted d32.
        d32M: .1, operatingHoldup: .0816427744236363,
        continuousSuperficialVelocityMS: .0009598419119466572,
        dispersedSuperficialVelocityMS: .0014905956171508057,
      },
      stage1Targets: {
        minimumRecoveryPct: 0, minimumRaffinateSaturatesWt: 0,
        targetRaffinateTotalAromaticsWt: 100, targetRaffinatePolarAromaticsWt: 100,
        maximumNmpRaffinateWt: 100, feedSulfurPpm: 0, targetRaffinateSulfurPpm: 1,
        sulfurAllocationSatPct: 20, sulfurAllocationMonoPct: 20, sulfurAllocationDiPct: 20,
        sulfurAllocationPolyPct: 20, sulfurAllocationPaPct: 20,
      },
    };
    const evaluators: NonNullable<Parameters<typeof runStage4PredictivePhysicalSizing>[1]> = {
      flashEvaluator: async (request) => {
        flashes += 1;
        return {
          status: 'CALCULATED', phaseOrientation: 'NMP_RICH_EXTRACT', resultHash: h,
          raffinateComposition: [.65, .12, .09, .05, .03, .05, .01],
          extractComposition: [.03, .02, .02, .01, .01, .85, .06],
        };
      },
      interfaceEvaluator: async () => {
        return ({
        status: 'CALCULATED_PRELIMINARY_INTERFACE',
        interface: {
          // Total component flux deliberately has a nonzero Stefan sum. The
          // solver must retain it rather than replacing it with a zero-sum
          // diffusive vector.
          continuousComponentFluxMolM2S: [-1e-7, -1e-7, -1e-7, -1e-7, -1e-7, 1e-7, 1e-7],
          continuousDiffusiveFluxMolM2S: Array(7).fill(0),
          dispersedDiffusiveFluxMolM2S: Array(7).fill(0),
          dispersedComponentFluxMolM2S: [-1e-7, -1e-7, -1e-7, -1e-7, -1e-7, 1e-7, 1e-7],
          continuousMoleFractions: Array(7).fill(1 / 7),
          dispersedMoleFractions: Array(7).fill(1 / 7),
          totalMolarFluxMolM2S: -3e-7,
          fluxEqualityResidualMolM2S: Array(7).fill(0),
        },
        } as any);
      },
    };
    const progress: any[] = [];
    const result = await runStage4PredictivePhysicalSizing(input, {
      ...evaluators,
      onNumericalProgress: event => { progress.push(event); },
    });
    // One inlet binding flash plus the evolving local cell states. A single
    // frozen inlet flash is not an accepted physical-column closure.
    expect(flashes).toBeGreaterThan(1);
    expect(result.primary.selected).not.toBeNull();
    expect(result.primary.selected.overallEfficiency).toBe(
      2 / result.primary.selected.physicalCompartments,
    );
    expect(result.primary.selected.physicalCompartments).toBeGreaterThanOrEqual(2);
    expect(result.primary.selected.maximumScaledGlobalComponentBalanceResidual).toBeLessThan(1e-10);
    expect(result.primary.searchTermination)
      .toBe('FIRST_CERTIFIABLE_TARGET_COMPLIANT_CONSERVED_PHYSICAL_COUNT');
    expect(result.status).toBe('CALCULATED_FINITE_RATE_SCREENING');
    expect(result.primary.selected.continuousPhaseTotalMolarFlowChangeMolS)
      .not.toBeCloseTo(0, 14);
    expect(result.screeningNotice).toContain('REQUIRES PILOT VALIDATION');
    const primaryStarts = progress.filter(event =>
      event.caseCoefficient === .0126 && event.state === 'STARTED');
    expect(primaryStarts[0]).toMatchObject({
      completedPhysicalTrials: 0,
      resolvedPhysicalTrials: 0,
      unresolvedPhysicalTrials: 0,
      lastCompletedPhysicalCount: null,
      minimumPhysicalCount: 2,
      maximumPhysicalCount: 2,
      totalPhysicalTrials: 1,
      partialPhysicalCountOutcomes: [],
    });
    const primaryCompletion = progress.find(event =>
      event.caseCoefficient === .0126 && event.completedPhysicalTrials === 1);
    expect(primaryCompletion).toMatchObject({
      resolvedPhysicalTrials: 1,
      unresolvedPhysicalTrials: 0,
      lastCompletedPhysicalCount: result.primary.physicalCountOutcomes[0].physicalCompartments,
      partialPhysicalCountOutcomes: [result.primary.physicalCountOutcomes[0]],
    });
    const blockedResponse = {
      status: 'BLOCKED_NO_ACCEPTED_PHYSICAL_INTERFACE_ROOT',
      interface: null,
      startDiagnostics: [{ startClass: 'bulk', jacobianRank: 12, requiredJacobianRank: 13 }],
      endpointAssessments: [{ numericalAccepted: false }],
      acceptanceThresholds: { scaledFluxEquality: 1e-8 },
    };
    const blockedProgress: any[] = [];
    const blocked = await runStage4PredictivePhysicalSizing(input, {
      ...evaluators, interfaceEvaluator: async () => blockedResponse as any,
      onNumericalProgress: event => { blockedProgress.push(event); },
    });
    expect(blocked.status).toBe('NUMERICAL_FAILURE_UNRESOLVED_PHYSICAL_COUNTS_REMAIN');
    for (const coefficientCase of [blocked.primary, blocked.sensitivity]) {
      for (const mesh of ['coarse', 'refined']) {
        const evidence = coefficientCase.lastConservedPhysicalTrial[mesh].interfaceFailure;
        expect(evidence.response).toEqual(blockedResponse);
        expect(evidence.requestHash).toMatch(/^[a-f0-9]{64}$/);
        expect(evidence.request.componentOrder).toHaveLength(7);
        expect(evidence.request.kc).toHaveLength(7);
        expect(evidence.iteration).toBe(1);
        expect(evidence.cellIndex).toBe(0);
      }
    }
    const blockedCompletion = blockedProgress.find(event =>
      event.completedPhysicalTrials === 1);
    expect(blockedCompletion).toMatchObject({
      resolvedPhysicalTrials: 0,
      unresolvedPhysicalTrials: 1,
      partialPhysicalCountOutcomes: [{
        status: 'NUMERICAL_UNRESOLVED',
      }],
    });
  });

  it('uses a consistent two-film partition orientation and rejects nonphysical phase inputs', () => {
    const atEquilibrium = calculateTwoFilmContinuousFlux({
      kcMPerS: 1e-5, kdMPerS: 2e-5, continuousTotalConcentrationMolM3: 8_000,
      dispersedTotalConcentrationMolM3: 6_000, partitionXCOverXD: 2,
      continuousMoleFraction: .4, dispersedMoleFraction: .2,
    });
    expect(atEquilibrium.drivingForce).toBeCloseTo(0, 14);
    expect(atEquilibrium.fluxMolM2S).toBeCloseTo(0, 14);
    expect(() => calculateTwoFilmContinuousFlux({
      kcMPerS: 1e-5, kdMPerS: 2e-5, continuousTotalConcentrationMolM3: -1,
      dispersedTotalConcentrationMolM3: 6_000, partitionXCOverXD: 2,
      continuousMoleFraction: .4, dispersedMoleFraction: .2,
    })).toThrow('STAGE4_TWO_FILM_INPUT_NONPHYSICAL');
  });

  it('requires every governed Stage-1 target rather than passing omitted metrics by infinity defaults', () => {
    const feed = [1, 1, 1, 1, 1, .1, .01];
    expect(() => evaluateStage4ProductTargets(feed, feed, {
      minimumRecoveryPct: 0, minimumRaffinateSaturatesWt: 0,
      targetRaffinateTotalAromaticsWt: 100, targetRaffinatePolarAromaticsWt: 100,
      // maximumNmpRaffinateWt deliberately omitted
      feedSulfurPpm: 0, targetRaffinateSulfurPpm: 1,
      sulfurAllocationSatPct: 0, sulfurAllocationMonoPct: 0, sulfurAllocationDiPct: 0,
      sulfurAllocationPolyPct: 0, sulfurAllocationPaPct: 0,
    })).toThrow('STAGE4_STAGE1_TARGET_REQUIRED:maximumNmpRaffinateWt');
    expect(() => evaluateStage4ProductTargets([-1, 1, 1, 1, 1, .1, .01], feed, {
      minimumRecoveryPct: 0, minimumRaffinateSaturatesWt: 0,
      targetRaffinateTotalAromaticsWt: 100, targetRaffinatePolarAromaticsWt: 100,
      maximumNmpRaffinateWt: 100, feedSulfurPpm: 0, targetRaffinateSulfurPpm: 1,
      sulfurAllocationSatPct: 0, sulfurAllocationMonoPct: 0, sulfurAllocationDiPct: 0,
      sulfurAllocationPolyPct: 0, sulfurAllocationPaPct: 0,
    })).toThrow('STAGE4_PHYSICAL_SOLVER_NEGATIVE_OR_INVALID_PRODUCT_OUTLET');
  });
});