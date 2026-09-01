import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import {
  calculatePrePilotSulfurEstimate,
  generatePredictiveNtReport,
  type PredictiveNtReportSnapshot,
} from '../server/ecr-pre-pilot/predictive-nt-report';

async function pdfText(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdf });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

function trial(stageCount: number, closed = true) {
  const stream = {
    componentMoles: [80, 8, 6, 4, 2, 0],
    moleFractions: [0.8, 0.08, 0.06, 0.04, 0.02, 0],
  };
  return {
    stageCount,
    solverSuccess: closed,
    solverTerminationStatus: closed ? 'RESIDUAL_CLOSURE' : 'MAXIMUM_ITERATIONS',
    residualClosureStatus: closed ? 'CLOSED' : 'UNCLOSED',
    maximumScaledEquationResidual: closed ? 1e-10 : 1e-3,
    maximumOverallComponentBalanceResidualMol: closed ? 1e-10 : 1e-3,
    numericalAcceptancePassed: closed,
    allCalculableTargetsPass: closed,
    accepted: false,
    acceptanceBlockers: [{ code: closed ? 'POST_SPLIT_TPD_STABILITY_FAILED' : 'PRIMARY_ENDPOINT_RESIDUAL_UNCLOSED' }],
    productMetrics: {
      raffinateSaturatesWtNmpFree: 80,
      raffinateTotalAromaticsWtNmpFree: 18,
      raffinatePolarAromaticsWtNmpFree: 2,
      nmpFreeHydrocarbonRecoveryPct: 95,
      nmpInTotalRaffinateWt: 5,
      satLossPct: 5,
      componentExtractionPct: { MONO: 50, DI: 60, POLY: 70, PA: 80 },
    },
    targetCompliance: {},
    boundaryStreams: {
      oilFeed: stream, freshNmp: stream, finalRaffinate: stream, finalExtract: stream,
    },
    overallComponentBalanceResidualMol: [0, 0, 0, 0, 0, 0],
    multistartProductRelativeDifference: closed ? 1e-9 : null,
    branchComparisonStatus: closed ? 'EVALUATED' : 'NOT_EVALUABLE_ENDPOINT_UNCLOSED',
    multistartEvidence: {
      bothStartsClosed: closed,
      primary: {
        solverSuccess: closed,
        terminationStatus: closed ? 'RESIDUAL_CLOSURE' : 'MAXIMUM_ITERATIONS',
        residualClosureStatus: closed ? 'CLOSED' : 'UNCLOSED',
        maximumScaledEquationResidual: closed ? 1e-10 : 1e-3,
      },
      secondary: {
        solverSuccess: closed,
        terminationStatus: closed ? 'RESIDUAL_CLOSURE' : 'MAXIMUM_ITERATIONS',
        residualClosureStatus: closed ? 'CLOSED' : 'UNCLOSED',
        maximumScaledEquationResidual: closed ? 1e-10 : 1e-3,
      },
    },
    stages: [{
      stageFromFeedEnd: 1,
      maximumComponentBalanceResidualMol: 1e-10,
      accepted: closed,
      isoactivityLogResidual: 1e-10,
      localPostSplitStability: {
        raffinate: { minimumEigenvalue: 0.1 },
        extract: { minimumEigenvalue: 0.1 },
      },
      postSplitTpdSearch: {
        raffinate: { minimum: -0.1 },
        extract: { minimum: -0.1 },
      },
      raffinateLeaving: stream,
      extractLeaving: stream,
    }],
  };
}

function completedSnapshot(): PredictiveNtReportSnapshot {
  return {
    id: 'completed-report-snapshot',
    projectNumber: 170,
    modelHash: 'a'.repeat(64),
    engineHash: 'b'.repeat(64),
    completedAt: '2026-08-31T00:00:00.000Z',
    input: {
      maximumStages: 2,
      stage1Authority: {
        snapshotHash: 'c'.repeat(64),
        source: {
          stage1: {
            projectReference: '170',
            rrboGrade: 'SN300',
            operatingTemperatureC: 60,
            operatingPressure: 1,
            phaseConfiguration: 'NMP_CONTINUOUS',
            solventOilRatio: 1.5,
            maximumStages: 2,
            saturatesWt: 80,
            monoAromaticsWt: 8,
            diAromaticsWt: 6,
            polyAromaticsWt: 4,
            polarAromaticsWt: 2,
            nmpInFeedWt: 0,
            feedSulfurPpm: 3500,
            targetRaffinateSulfurPpm: 1500,
            sulfurAllocationSatPct: 0,
            sulfurAllocationMonoPct: 5,
            sulfurAllocationDiPct: 25,
            sulfurAllocationPolyPct: 35,
            sulfurAllocationPaPct: 35,
          },
        },
      },
    },
    result: {
      status: 'RESEARCH_DIAGNOSTIC_NOT_ACCEPTED',
      releaseEligible: false,
      pilotValidated: false,
      calibrationRequired: true,
      predictiveNt: null,
      establishedTheoreticalStages: null,
      sulfurPrediction: { status: 'NOT_CALCULABLE' },
      componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'],
      trials: [trial(1), trial(2, false)],
    },
  };
}

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

  it('uses the persisted project reference and never renders PROJECT NaN', async () => {
    const snapshot = completedSnapshot();
    snapshot.projectNumber = Number.NaN;
    const text = await pdfText(await generatePredictiveNtReport(snapshot));
    expect(text).toContain('PROJECT 170');
    expect(text).not.toContain('PROJECT NaN');
  });

  it('fails closed when no valid persisted project reference exists', async () => {
    const snapshot = completedSnapshot();
    snapshot.projectNumber = Number.NaN;
    delete snapshot.input.stage1Authority.source.stage1.projectReference;
    await expect(generatePredictiveNtReport(snapshot))
      .rejects.toThrow('PREDICTIVE_NT_REPORT_PROJECT_REFERENCE_MISSING');
  });

  it('renders continuous main sections, appendices, exact blockers, and stage orientation', async () => {
    const text = await pdfText(await generatePredictiveNtReport(completedSnapshot()));
    for (const heading of [
      '1. Frozen Design Basis',
      '2. Overall N_T Engineering Comparison',
      '3. Component Extraction Performance',
      '4. Pre-Pilot Sulfur Allocation Estimate',
      '5. Engineering Stage Selection',
      '6. Scientific Qualification Summary',
      '7. Governance / Report Status',
      'Appendix A',
      'Appendix B',
      'Appendix C',
      'Appendix D',
      'Appendix E',
      'Appendix F',
    ]) expect(text).toContain(heading);
    expect(text).toContain('Stage numbering is from bottom to top: Stage 1 = RRBO-feed/bottom end; final stage = fresh-NMP/top end.');
    expect(text).toContain('PRIMARY_ENDPOINT_RESIDUAL_UNCLOSED');
    expect(text).toContain('RESIDUAL_CLOSURE');
  });

  it('keeps preferred candidate, accepted Predictive N_T, and COSMO sulfur separate', async () => {
    const text = await pdfText(await generatePredictiveNtReport(completedSnapshot()));
    expect(text).toContain('Preferred engineering candidate: NOT ASSIGNED');
    expect(text).toContain('Accepted Predictive N_T');
    expect(text).toContain('COSMO-SAC sulfur prediction: NOT CALCULABLE');
    expect(text).toContain('DIAGNOSTIC_ONLY — UNCONVERGED');
    expect(text).toContain('UNCONVERGED DIAGNOSTIC — DO NOT USE FOR DESIGN SELECTION');
  });

  it('does not infer numerical PASS from empty or missing closure evidence', async () => {
    const snapshot = completedSnapshot();
    snapshot.result.trials = [];
    let text = await pdfText(await generatePredictiveNtReport(snapshot));
    expect(text).toContain('Primary solver closure');
    expect(text).toContain('NOT_CALCULABLE / MISSING_EVIDENCE');

    snapshot.result.trials = [trial(1)];
    delete snapshot.result.trials[0].residualClosureStatus;
    delete snapshot.result.trials[0].multistartEvidence.bothStartsClosed;
    text = await pdfText(await generatePredictiveNtReport(snapshot));
    expect((text.match(/NOT_CALCULABLE \/ MISSING_EVIDENCE/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('MISSING SOLVER QUALIFICATION — DO NOT USE FOR DESIGN SELECTION');
    expect(text).not.toContain('ESTIMATED_PASS');
    expect(text).not.toContain('ESTIMATED_FAIL');
  });

  it('renders classification controls from persisted qualification state', async () => {
    const snapshot = completedSnapshot();
    snapshot.result.status = 'QUALIFIED';
    snapshot.result.releaseEligible = true;
    snapshot.result.calibrationRequired = false;
    snapshot.result.predictiveNt = 2;
    const text = await pdfText(await generatePredictiveNtReport(snapshot));
    expect(text).toContain('PERSISTED QUALIFICATION STATUS — QUALIFIED');
    expect(text).toContain('PERSISTED REPORT STATUS — CALIBRATION NOT REQUIRED');
    expect(text).not.toContain('RESEARCH DIAGNOSTIC — NOT ACCEPTED — NOT RELEASE ELIGIBLE');
    expect(text).not.toContain('PROJECT 170  •  RESEARCH DIAGNOSTIC');
    expect(text).not.toContain('This persisted snapshot is not release eligible.');
    expect(text).not.toContain('Calibration remains required for this persisted snapshot.');
  });

  it('renders the maximum configured ten-trial comparison without losing rows', async () => {
    const snapshot = completedSnapshot();
    snapshot.input.maximumStages = 10;
    snapshot.input.stage1Authority.source.stage1.maximumStages = 10;
    snapshot.result.trials = Array.from({ length: 10 }, (_, index) => trial(index + 1, index < 6));
    const text = await pdfText(await generatePredictiveNtReport(snapshot));
    expect(text).toContain('10 / 10');
    expect(text).toContain('2. Overall N_T Engineering Comparison');
    expect(text).toContain('Recovery = NMP-free RRBO recovery.');
    expect((text.match(/UNCONVERGED/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('calculates the saved pre-pilot sulfur allocation with recovery normalization', () => {
    const snapshot = completedSnapshot();
    const estimate = calculatePrePilotSulfurEstimate(
      snapshot.input.stage1Authority.source.stage1,
      snapshot.result.trials[0],
    );
    expect(estimate.status).toBe('CALCULABLE');
    expect(estimate.contributionsPpm.MONO).toBeCloseTo(3500 * 0.05 * 0.5 / 0.95, 10);
    expect(estimate.contributionsPpm.DI).toBeCloseTo(3500 * 0.25 * 0.4 / 0.95, 10);
    expect(estimate.targetStatus).toBe('ESTIMATED_PASS');
  });

  it('never gives an unconverged sulfur estimate an estimated PASS or FAIL', () => {
    const snapshot = completedSnapshot();
    const estimate = calculatePrePilotSulfurEstimate(
      snapshot.input.stage1Authority.source.stage1,
      snapshot.result.trials[1],
    );
    expect(estimate.status).toBe('CALCULABLE');
    expect(estimate.targetStatus).toBe('DIAGNOSTIC_ONLY — UNCONVERGED');
  });

  it('fails the pre-pilot estimate closed for invalid allocations and missing inputs', () => {
    const snapshot = completedSnapshot();
    const stage1 = snapshot.input.stage1Authority.source.stage1;
    expect(calculatePrePilotSulfurEstimate(
      { ...stage1, sulfurAllocationPaPct: 34 },
      snapshot.result.trials[0],
    )).toMatchObject({
      status: 'NOT_CALCULABLE',
      reason: 'SULFUR_ALLOCATION_TOTAL_NOT_100_PERCENT',
    });
    expect(calculatePrePilotSulfurEstimate(
      { ...stage1, feedSulfurPpm: undefined },
      snapshot.result.trials[0],
    )).toMatchObject({
      status: 'NOT_CALCULABLE',
      reason: 'MISSING_PERSISTED_SULFUR_INPUT',
    });
  });

  it('replays identical completed snapshots deterministically', async () => {
    const first = await generatePredictiveNtReport(completedSnapshot());
    const second = await generatePredictiveNtReport(completedSnapshot());
    expect(createHash('sha256').update(first).digest('hex'))
      .toBe(createHash('sha256').update(second).digest('hex'));
  });
});