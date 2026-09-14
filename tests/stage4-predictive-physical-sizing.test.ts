import { describe, expect, it } from 'vitest';
import {
  calculateKumarHartlandScreeningDispersion,
  calculateTwoFilmContinuousFlux,
  evaluateStage4ProductTargets,
  runStage4PredictivePhysicalSizing,
} from '../server/ecr-pre-pilot/stage4-predictive-physical-sizing';

const h = 'a'.repeat(64);

describe('Stage-4 predictive physical sizing', () => {
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
    const result = await runStage4PredictivePhysicalSizing({
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
        d32M: .0025707441992382585, operatingHoldup: .0816427744236363,
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
    }, {
      diagnosticFrozenInletEquilibrium: true,
      flashEvaluator: async () => {
        flashes += 1;
        return {
          status: 'CALCULATED', phaseOrientation: 'NMP_RICH_EXTRACT', resultHash: h,
          raffinateComposition: [.65, .12, .09, .05, .03, .05, .01],
          extractComposition: [.03, .02, .02, .01, .01, .85, .06],
        };
      },
    });
    expect(flashes).toBe(1);
    expect(result.primary.selected).not.toBeNull();
    expect(result.primary.selected.overallEfficiency).toBe(
      2 / result.primary.selected.physicalCompartments,
    );
    expect(result.primary.selected.physicalCompartments).toBeGreaterThanOrEqual(2);
    expect(result.primary.selected.maximumGlobalComponentBalanceResidualMolS).toBeLessThan(1e-8);
    expect(result.status).toBe('DIAGNOSTIC_FROZEN_INLET_EQUILIBRIUM_NOT_PHYSICAL_SIZING');
    expect(result.screeningNotice).toContain('REQUIRES PILOT VALIDATION');
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