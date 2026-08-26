import { describe, expect, it } from 'vitest';
import {
  reconcileECR2IdealStageHydrocarbonRecovery,
  solveECR2IdealStageCascade,
} from '../server/engines/llx/llx-ecr2-ideal-stage-cascade';

describe('ECR-2 same-specification ideal-stage cascade', () => {
  it('fails closed until the Coto surrogate-to-physical pseudo-component mapping is governed', () => {
    const result = solveECR2IdealStageCascade({
      operatingTemperature_C: 70,
      target: {
        value: 0.4379949896594715,
        sourceType: 'Assumed',
        sourceReference: 'ECR-2 ideal-stage regression fixture',
      },
      rrboFeedComponentFlows_kg_h: [50, 30, 15, 5, 0],
      nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, 172],
      physicalMolecularWeights_g_mol: [330, 300, 350, 430, 99.13],
      maxIdealStages: 4,
    });

    expect(result.status).toBe('thermodynamic_surrogate_to_physical_mapping_not_closed');
    expect(result.statusLabel).toBe('THERMODYNAMIC SURROGATE-TO-PHYSICAL MAPPING NOT CLOSED');
    expect(result.establishedTheoreticalStages).toBeNull();
    expect(result.trials).toHaveLength(0);
    expect(result.rrboRecoveryMassFraction).toBeNull();
    expect(result.diagnostics.at(-1)).toContain('unvalidated historical sensitivity');
  });

  it('records both conflicting NRTL feed coordinates without calculating a physical recovery', () => {
    const result = solveECR2IdealStageCascade({
      operatingTemperature_C: 50,
      target: { value: 0.1, sourceType: 'Assumed', sourceReference: 'Valid ECR-2 cascade fixture' },
      rrboFeedComponentFlows_kg_h: [2930.8, 172.4, 172.4, 172.4, 0],
      nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, 4003.88],
      physicalMolecularWeights_g_mol: [269.93, 320, 377.57, 459.45, 99.13],
      maxIdealStages: 2,
    });

    expect(result.status).toBe('thermodynamic_surrogate_to_physical_mapping_not_closed');
    expect(result.statusLabel).toBe('THERMODYNAMIC SURROGATE-TO-PHYSICAL MAPPING NOT CLOSED');
    expect(result.establishedTheoreticalStages).toBeNull();
    expect(result.trials).toHaveLength(0);
    expect(result.rrboRecoveryMassFraction).toBeNull();
    expect(result.molecularWeightBasis).toMatchObject({
      componentOrder: ['Sat', 'Mono', 'Di', 'Poly', 'NMP'],
      physicalMolecularWeights_g_mol: [269.93, 320, 377.57, 459.45, 99.13],
      surrogateMolecularWeights_g_mol: [170.34, 106.17, 142.2, 202.25, 99.13],
    });
    const audit = result.thermodynamicSurrogatePhysicalMapping.feedCoordinateAudit;
    expect(audit?.nrtlZFromSurrogateMW).toEqual([
      expect.closeTo(0.2807499781, 9),
      expect.closeTo(0.0264963246, 9),
      expect.closeTo(0.0197828044, 9),
      expect.closeTo(0.0139090966, 9),
      expect.closeTo(0.6590617964, 9),
    ]);
    expect(audit?.nrtlZFromPhysicalPseudoComponentMW).toEqual([
      expect.closeTo(0.2063465962, 9),
      expect.closeTo(0.0102388119, 9),
      expect.closeTo(0.0086776487, 9),
      expect.closeTo(0.0071311782, 9),
      expect.closeTo(0.7676057651, 9),
    ]);
    expect(audit?.nrtlZFromSurrogateMW).not.toEqual(audit?.nrtlZFromPhysicalPseudoComponentMW);
    expect(result.thermodynamicSurrogatePhysicalMapping.componentMappings[0])
      .toMatchObject({ physicalPseudoComponent: 'Sat', cotoSurrogate: 'n-dodecane' });
  });
});

describe('ECR-2 ideal-stage independent hydrocarbon recovery reconciliation', () => {
  const run924StyleN1 = {
    rrboFeedComponentFlows_kg_h: [50, 30, 15, 5, 0] as const,
    nmpFeedComponentFlows_kg_h: [0, 0, 0, 0, 172] as const,
    raffinateComponentFlows_kg_h: [48, 20, 10, 3, 2] as const,
    extractComponentFlows_kg_h: [2, 10, 5, 2, 170] as const,
  };

  it('makes the Run #924-style N=1 RRBO recovery independently reproducible', () => {
    const reconciliation = reconcileECR2IdealStageHydrocarbonRecovery(run924StyleN1);

    expect(reconciliation.status).toBe('passed');
    expect(reconciliation.feedBoundary).toBe('rrbo_feed_inlet');
    expect(reconciliation.raffinateBoundary).toBe('rrbo_face_at_ideal_stage_count');
    expect(reconciliation.extractBoundary).toBe('nmp_face_at_zero');
    expect(reconciliation.feedHydrocarbonComponentMassFlows_kg_h).toEqual([50, 30, 15, 5]);
    expect(reconciliation.raffinateHydrocarbonComponentMassFlows_kg_h).toEqual([48, 20, 10, 3]);
    expect(reconciliation.extractHydrocarbonComponentMassFlows_kg_h).toEqual([2, 10, 5, 2]);
    expect(reconciliation.hydrocarbonComponentBalanceResidual_kg_h).toEqual([0, 0, 0, 0]);
    expect(reconciliation.feedHydrocarbonMassFlow_kg_h).toBe(100);
    expect(reconciliation.raffinateHydrocarbonMassFlow_kg_h).toBe(81);
    expect(reconciliation.extractHydrocarbonMassFlow_kg_h).toBe(19);
    expect(reconciliation.hydrocarbonBalanceResidual_kg_h).toBe(0);
    expect(reconciliation.rrboRecoveryMassFraction).toBeCloseTo(0.81, 12);
  });

  it('excludes NMP from the recovery denominator and numerator', () => {
    const reconciliation = reconcileECR2IdealStageHydrocarbonRecovery({
      ...run924StyleN1,
      raffinateComponentFlows_kg_h: [48, 20, 10, 3, 999] as const,
      extractComponentFlows_kg_h: [2, 10, 5, 2, 1] as const,
    });

    expect(reconciliation.status).toBe('passed');
    expect(reconciliation.rrboRecoveryMassFraction).toBeCloseTo(0.81, 12);
  });

  it('rejects an inconsistent solvent-side hydrocarbon boundary as not calculable', () => {
    const reconciliation = reconcileECR2IdealStageHydrocarbonRecovery({
      ...run924StyleN1,
      nmpFeedComponentFlows_kg_h: [0.01, 0, 0, 0, 172] as const,
    });

    expect(reconciliation.status).toBe('not_calculable');
    expect(reconciliation.rrboRecoveryMassFraction).toBeNull();
    expect(reconciliation.failure).toContain('NMP feed contains hydrocarbon flow');
  });

  it('rejects summed-stage or wrong-phase outlet flows instead of calling recovery infeasible', () => {
    const reconciliation = reconcileECR2IdealStageHydrocarbonRecovery({
      ...run924StyleN1,
      // These are deliberately non-boundary values that double-count the
      // N=1 outlets, reproducing a summed-stage-flow accounting regression.
      raffinateComponentFlows_kg_h: [96, 40, 20, 6, 2] as const,
      extractComponentFlows_kg_h: [4, 20, 10, 4, 170] as const,
    });

    expect(reconciliation.status).toBe('not_calculable');
    expect(reconciliation.rrboRecoveryMassFraction).toBeNull();
    expect(reconciliation.failure).toContain('Hydrocarbon component split does not close');
  });
});