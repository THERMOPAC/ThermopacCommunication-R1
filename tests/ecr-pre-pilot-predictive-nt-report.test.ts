import { describe, expect, it } from 'vitest';
import {
  generatePredictiveNtReport,
  type PredictiveNtReportSnapshot,
} from '../server/ecr-pre-pilot/predictive-nt-report';

describe('Predictive N_T completed-snapshot report', () => {
  it('renders bounded Task 216 negative evidence from the persisted snapshot only', async () => {
    const snapshot: PredictiveNtReportSnapshot = {
      id: 'frozen-task216-snapshot',
      projectNumber: 170,
      modelHash: 'a'.repeat(64),
      engineHash: 'b'.repeat(64),
      completedAt: '2026-08-31T00:00:00.000Z',
      input: {
        stage1Authority: {
          snapshotHash: 'c'.repeat(64),
          source: { stage1: {} },
        },
      },
      result: {
        status: 'RESEARCH_DIAGNOSTIC_NOT_ACCEPTED',
        releaseEligible: false,
        calibrationRequired: true,
        predictiveNt: null,
        sulfurPrediction: { status: 'NOT_CALCULABLE' },
        componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'],
        trials: [],
        globalStabilityQualification: {
          evidenceId: 'TASK_216_MONO_RICH_GLOBAL_STABILITY_V1',
          status: 'BLOCKED_FAIL_CLOSED',
          qualified: false,
          postSplitTpdThreshold: -1e-8,
          worstMinimum: -0.7811787403452582,
          coverage: {
            expectedPhaseEndpoints: 110,
            returnedPhaseEndpoints: 110,
            failingPhaseCount: 57,
            negativeOrUnresolvedPhaseCount: 96,
            optimizerRefinementFailureCount: 39,
          },
          classificationCounts: {
            GENUINE_LOWER_GIBBS_BASIN: 57,
            OPTIMIZER_REFINEMENT_FAILURE: 39,
            LOCAL_HESSIAN_ONLY_ARTIFACT: 14,
          },
          comparisonCandidate: {
            disposition: 'REJECTED_FROZEN_VALIDATION_AND_GLOBAL_INSTABILITY',
          },
          evidenceArtifacts: {
            resultsSha256: 'd'.repeat(64),
            protocolSha256: 'e'.repeat(64),
          },
          blockers: [
            'FROZEN_COMPOSITION_VALIDATION_FAILED',
            'POST_SPLIT_TPD_STABILITY_FAILED',
            'DIRECT_MATCHING_SIX_COMPONENT_LLE_EVIDENCE_MISSING',
          ],
        },
      },
    };

    const pdf = await generatePredictiveNtReport(snapshot);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5_000);
    expect(pdf.length).toBeLessThan(500_000);
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length)
      .toBeGreaterThanOrEqual(5);
  });
});