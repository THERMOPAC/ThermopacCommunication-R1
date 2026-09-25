import { describe, expect, it } from 'vitest';
import { reportTrials, frozenMolecularBasis } from '../server/ecr-pre-pilot/predictive-nt-report-evidence';

describe('read-only frozen report adapter', () => {
  const native = () => ({
    engineContractVersion: '7C-1.6.0',
    componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
    predictiveNt: 4,
    trials: [{
      stageCount: 4, accepted: true, branchReproduced: true,
      residualClosureStatus: 'CLOSED', solverTerminationStatus: 'CONVERGED',
      maximumScaledEquationResidual: 3.197442310920451e-14,
      secondaryMaximumScaledEquationResidual: 7.815970093361102e-14,
      branchProductRelativeDifference: 2.184536171954701e-15,
      targetCompliance: { minimumRecoveryPct: { target: 80, calculated: 86.9991337879812, status: 'PASS' } },
      productMetrics: { nmpFreeHydrocarbonRecoveryPct: 86.9991337879812 },
      boundaryStreams: {
        oilFeed: { componentMoles: [10, 10, 10, 10, 10, 0, 0] },
        finalRaffinate: { componentMoles: [9, 5, 4, 3, 2, 1, 1] },
      },
    }],
  });
  it('maps the native 7C field names without altering saved evidence or selection', () => {
    const result = native(), before = JSON.stringify(result);
    const [trial] = reportTrials(result);
    expect(trial.multistartEvidence.bothStartsClosed).toBe(true);
    expect(trial.multistartProductRelativeDifference).toBe(result.trials[0].branchProductRelativeDifference);
    expect(trial.multistartEvidence.secondary.terminationStatus).toBe('Not separately recorded');
    expect(trial.multistartEvidence.primary.terminationStatus).toBe('Not separately recorded');
    expect(trial.multistartEvidence.combinedTerminationStatus).toBe('CONVERGED');
    expect(trial.targetCompliance.minimumNmpFreeRecoveryPct).toEqual(result.trials[0].targetCompliance.minimumRecoveryPct);
    expect(trial.productMetrics.satLossPct).toBe(10);
    expect(trial.productMetrics.componentExtractionPct).toEqual({ MONO: 50, DI: 60, POLY: 70, PA: 80 });
    expect(JSON.stringify(result)).toBe(before);
    expect(result.predictiveNt).toBe(4);
  });
  it('keeps native combined UNCLOSED separate from unknown individual endpoint states', () => {
    const result: any = native();
    result.trials[0].residualClosureStatus = 'UNCLOSED';
    result.trials[0].solverTerminationStatus = 'UNCLOSED';
    const [trial] = reportTrials(result);
    expect(trial.multistartEvidence.bothStartsClosed).toBe(false);
    expect(trial.multistartEvidence.combinedClosureStatus).toBe('UNCLOSED');
    expect(trial.multistartEvidence.primary.residualClosureStatus).toBe('Not separately recorded');
    expect(trial.multistartEvidence.secondary.residualClosureStatus).toBe('Not separately recorded');
    expect(trial.multistartEvidence.primary.terminationStatus).toBe('Not separately recorded');
  });
  it('preserves actual legacy endpoint-specific optimizer and closure evidence', () => {
    const result: any = native();
    result.engineContractVersion = 'legacy';
    result.trials[0].multistartEvidence = { bothStartsClosed: false,
      primary: { terminationStatus: 'MAXIMUM_ITERATIONS', residualClosureStatus: 'UNCLOSED' },
      secondary: { terminationStatus: 'RESIDUAL_CLOSURE', residualClosureStatus: 'CLOSED' } };
    const [trial] = reportTrials(result);
    expect(trial.multistartEvidence).toEqual(result.trials[0].multistartEvidence);
    expect(trial.multistartEvidence.combinedTerminationStatus).toBeUndefined();
  });
  it('does not infer closure from absent evidence or apply matrix semantics to other contracts', () => {
    const result: any = native();
    result.engineContractVersion = 'unknown';
    expect(reportTrials(result)[0].multistartEvidence).toBeUndefined();
    result.engineContractVersion = '7C-1.6.0';
    delete result.trials[0].secondaryMaximumScaledEquationResidual;
    expect(reportTrials(result)[0].multistartEvidence).toBeUndefined();
    result.trials[0].boundaryStreams.oilFeed.componentMoles[1] = 0;
    expect(reportTrials(result)[0].productMetrics.componentExtractionPct.MONO).toBeNull();
  });
  it('does not replace persisted extraction numbers or manufacture blockers', () => {
    const result: any = native();
    result.trials[0].productMetrics.satLossPct = 12.3;
    result.trials[0].accepted = false;
    result.trials[0].stages = [{ stageFromFeedEnd: 8, accepted: false,
      postSplitTpdSearch: { raffinate: { allRefinementsAccepted: false, classification: 'ROUTINE_REFINEMENT_AMBIGUOUS' } } }];
    const [trial] = reportTrials(result);
    expect(trial.productMetrics.satLossPct).toBe(12.3);
    expect(trial.acceptanceBlockers).toBeUndefined();
    expect(trial.reportingDisposition).toContain('ROUTINE_REFINEMENT_AMBIGUOUS');
    expect(trial.accepted).toBe(false);
  });
  it('never substitutes current molecular provenance when frozen hashes are absent or mismatch', async () => {
    const absent = await frozenMolecularBasis({}, { componentOrder: ['DI'] });
    expect(absent.components[0].name).toContain('not recorded');
    const mismatch = await frozenMolecularBasis({}, { componentOrder: ['DI'], scientificIntegrity: { sixGenerationManifestSha256: '0'.repeat(64) } });
    expect(mismatch.provenance.some(([, v]) => v.includes('HASH MISMATCH'))).toBe(true);
    expect(mismatch.components[0].name).toContain('not recorded');
  });
});