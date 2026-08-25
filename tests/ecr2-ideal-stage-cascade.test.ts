import { describe, expect, it } from 'vitest';
import { solveECR2IdealStageCascade } from '../server/engines/llx/llx-ecr2-ideal-stage-cascade';

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