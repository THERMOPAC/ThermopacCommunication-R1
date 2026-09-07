import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  currentJobCArtifactHashes,
  jobCResultHash,
  runJobCWorker,
  type JobCWorkerRequest,
} from '../server/ecr-pre-pilot/job-c';

describe('Job-C packaged design269 scientific regression', () => {
  it('uses corrected orientation and distinguishes unresolved coupled feasibility', async () => {
    const fixture = JSON.parse(fs.readFileSync(
      'tests/fixtures/design269-job-c-worker-request.json', 'utf8',
    )) as JobCWorkerRequest;
    const branch = fixture.boundaryBranchQualificationRequest;
    branch.sourceStateSha256 = jobCResultHash(branch);
    fixture.axialLocalContactProfileSha256 = jobCResultHash({
      authority: fixture.axialLocalContactProfileAuthority,
      profile: fixture.axialLocalContactProfile,
    });
    process.env.JOB_C_RUNTIME_ROOT = path.resolve('dist/job-c-runtime');
    process.env.JOB_B_INTERFACE_RUNTIME_ROOT = path.resolve('dist/job-b-interface-runtime');
    const source = fs.readFileSync('server/ecr-pre-pilot/job-c/worker.py');
    const packaged = fs.readFileSync('dist/job-c-runtime/server/ecr-pre-pilot/job-c/worker.py');
    expect(packaged.equals(source)).toBe(true);
    expect(fixture.dispersedFeedMolS[5]).toBe(0);
    expect(fixture.dispersedFeedMolS[6]).toBe(0);
    expect(fixture.axialLocalContactProfileAuthority.mapping).toBe(
      'STAGE2_FEED_END_ASCENDING_EQUAL_BINS_REVERSED_TO_CONTINUOUS_INLET_FV_ORDER_V1',
    );
    expect(fixture.axialLocalContactProfile.map(contact =>
      contact.provenance.sourceStageFromFeedEnd)).toEqual([
      [9, 10], [8], [6, 7], [5], [3, 4], [2], [1],
    ]);
    const result = await runJobCWorker(fixture, { timeoutMs: 900_000 });
    expect(result.status).toBe('BLOCKED_PRELIMINARY_JOB_C');
    expect(result.error).toBe('JOB_C_COUPLED_POSITIVE_FEASIBILITY_UNRESOLVED');
    const diagnostics = result.diagnostics;
    expect(diagnostics.heightM).toBe(2);
    expect(diagnostics.lambda).toBeCloseTo(6.923828125e-5, 12);
    expect(diagnostics.reason).toBe('BOUNDED_FROZEN_FV_NONCONVERGENCE');
    expect(diagnostics.classification)
      .toBe('NUMERICAL_NONCONVERGENCE_NOT_PROCESS_INFEASIBILITY');
    expect(diagnostics.physicalInfeasibilityClaimed).toBe(false);
    expect(diagnostics.maximumOuterIterations).toBe(24);
    expect(diagnostics.outerIterations.length).toBeGreaterThan(0);
    const terminalPicard = diagnostics.outerIterations.at(-1);
    expect(terminalPicard.frozenFvAcceptance.accepted).toBe(false);
    expect(terminalPicard.dominantFrozenFvResidualRows.length).toBeGreaterThan(0);
    expect(diagnostics.adaptiveLambdaBracket).toMatchObject({
      upperRejected: diagnostics.lambda,
      minimumInterval: 1e-8,
    });
    expect(diagnostics.adaptiveLambdaBracket.lowerAccepted)
      .toBeLessThan(diagnostics.lambda);
    expect(diagnostics.adaptiveLambdaBracket.width).toBeLessThanOrEqual(1e-8);
    expect(diagnostics.lastAcceptedContinuation.sourceRefreshMismatch.status)
      .toBe('MEASURED');
    expect(diagnostics.lastAcceptedContinuation.sourceRefreshMismatch.rawMolS)
      .toBeLessThanOrEqual(1e-7);
    expect(diagnostics.lastAcceptedContinuation.sourceRefreshMismatch.scaled)
      .toBeLessThanOrEqual(1e-7);
    expect(diagnostics.rejectedStepSourceRefreshMismatch).toEqual({
      status: 'NOT_COMPUTED_FROZEN_FV_DID_NOT_CLOSE',
    });
    expect(diagnostics.coupledContinuation).toMatchObject({
      solver: 'COUPLED_BOUNDED_SPARSE_189_CONTINUATION',
      maximumFunctionEvaluations: 24,
      classification: 'COUPLED_POSITIVE_FEASIBILITY_UNRESOLVED',
      physicalInfeasibilityClaimed: false,
      runtimeBudgetExhausted: false,
    });
    expect(diagnostics.coupledContinuation.attempts.length).toBeGreaterThan(0);
    expect(diagnostics.coupledContinuation.attempts.every(
      (attempt: any) => attempt.accepted === false,
    )).toBe(true);
    expect(diagnostics.coupledContinuation.dominantResidualRows.length)
      .toBeGreaterThan(0);
    expect(diagnostics.unconstrainedTerminalDiagnostic).toMatchObject({
      qualification: 'UNBOUNDED_TERMINAL_DIAGNOSTIC_ONLY_NOT_ACCEPTANCE',
      optimizerSuccess: true,
      nonpositiveFlowCount: 14,
    });
    expect(diagnostics.unconstrainedTerminalDiagnostic.rawFvResidualMolS)
      .toBeLessThanOrEqual(1e-7);
    expect(diagnostics.unconstrainedTerminalDiagnostic.scaledFvResidual)
      .toBeLessThanOrEqual(1e-7);
    expect(new Set(diagnostics.unconstrainedTerminalDiagnostic.nonpositiveFlows.map(
      (row: any) => row.component,
    ))).toEqual(new Set(['NMP', 'H2O']));
    expect(diagnostics.claimsEmitted).toEqual({
      height: false,
      efficiency: false,
      finalRpm: false,
      jobD: false,
      release: false,
    });
    expect(diagnostics.globalInletFluxAudit).toMatchObject({
      continuousToDispersedSignConvention:
        'POSITIVE_NC_REMOVES_FROM_CONTINUOUS_AND_ADDS_TO_DISPERSED',
      signAndBoundaryOrientationConclusion:
        'B_TO_C_SOURCE_SIGNS_AND_COUNTERCURRENT_BOUNDARIES_ANALYTICALLY_CONSERVATIVE',
    });
    expect(diagnostics.runtimeBudgets).toMatchObject({
      qualification: {
        budgetSeconds: 600,
        cacheStatus: expect.stringMatching(/^(HIT_FULL_HASH_MATCH|MISS_QUALIFIED_AND_STORED)$/),
      },
      nonlinearSolver: { budgetSeconds: 720 },
    });
    expect(result).not.toHaveProperty('sensitivityCases');
    const manifest = JSON.parse(fs.readFileSync(
      'dist/job-c-runtime/job-c-runtime-manifest.json', 'utf8',
    ));
    expect(currentJobCArtifactHashes().boundaryQualifierHash)
      .toBe(manifest.boundaryInterfaceQualifier.sha256);
  }, 900_000);
});