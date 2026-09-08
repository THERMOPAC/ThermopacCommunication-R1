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
  it('quantifies signed NMP roots without claiming an established terminal boundary', async () => {
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
    const result = await runJobCWorker(fixture, { timeoutMs: 1_400_000 });
    expect(result.status).toBe('BLOCKED_PRELIMINARY_JOB_C');
    expect(result.error)
      .toBe('JOB_C_BRANCH_CONTINUATION_TERMINATED');
    const diagnostics = result.diagnostics;
    expect(diagnostics.heightM).toBe(2);
    expect(diagnostics.lambda)
      .toBeGreaterThan(diagnostics.adaptiveLambdaBracket.upperRejected);
    expect(diagnostics.classification)
      .toBe('LOCAL_SIGNED_MULTI_INVENTORY_ROOT_NEAR_ZERO_COUPLING');
    const continuation = diagnostics.branchContinuation;
    expect(continuation.fullCouplingAccepted).toBe(false);
    expect(continuation.positiveIntervalExistenceClaimed).toBe(false);
    expect(continuation.terminalBracket.resolved).toBe(false);
    expect(continuation.signedStartingRootDiagnostic.independentlyConfirmed).toBe(true);
    expect(continuation.signedStartingRootDiagnostic.accepted).toBe(false);
    for (const attempt of continuation.signedStartingRootDiagnostic.attempts) {
      expect(attempt.tightDiagnosticClosure).toBe(true);
      expect(attempt.cell1NmpBalance.flowMolS).toBeLessThan(0);
      expect(attempt.operatingStateEligible).toBe(false);
    }
    expect(continuation.physicalBoundary.uniquePhysicalLimiterResolved).toBe(false);
    expect(diagnostics.physicalInfeasibilityClaimed).toBe(false);
    expect(diagnostics.adaptiveLambdaBracket).toMatchObject({
      minimumInterval: 1e-8,
    });
    expect(diagnostics.adaptiveLambdaBracket.lowerAccepted)
      .toBeLessThan(diagnostics.adaptiveLambdaBracket.upperRejected);
    expect(diagnostics.adaptiveLambdaBracket.width).toBeLessThanOrEqual(1e-8);
    expect(diagnostics.pseudoArclengthQualification).toMatchObject({
      method: 'SCALED_PSEUDO_ARCLENGTH_ORIGINAL_189_EQUATIONS',
      classification: 'ACCEPTED_POSITIVE_BRANCH_BEYOND_BRACKET',
      strictPositiveFlowConstraintPreserved: true,
      acceptanceGatesUnchanged: true,
      physicalInfeasibilityClaimed: false,
    });
    expect(diagnostics.pseudoArclengthQualification.finiteDifferenceQualifications)
      .toHaveLength(2);
    expect(diagnostics.pseudoArclengthQualification.finiteDifferenceQualifications.every(
      (row: any) => row.rank === row.requiredRank
        && row.fixedLambdaJacobianRank === row.requiredFixedLambdaJacobianRank
        && row.undeclaredJacobianDependencyCount === 0
        && row.maximumTangentEquationResidual <= 1e-7,
    )).toBe(true);
    expect(diagnostics.pseudoArclengthQualification.tangentAlignmentAcrossStepSizes)
      .toBeGreaterThanOrEqual(0.999);
    expect(diagnostics.pseudoArclengthQualification
      .fixedLambdaDerivativeAlignmentAcrossStepSizes).toBeGreaterThanOrEqual(0.999);
    expect(diagnostics.pseudoArclengthQualification.limitingPositiveFlow)
      .toMatchObject({
        component: expect.stringMatching(/^(NMP|H2O)$/),
      });
    expect(diagnostics.pseudoArclengthQualification
      .complementarityQualification).toMatchObject({
        solver: 'TWO_DISTINCT_START_DENSE_FROZEN_JACOBIAN_NEWTON_PLUS_'
          + 'DENSE_POLISH_'
          + '189_FIXED_LAMBDA',
        strictPositiveFinalAcceptanceRequired: true,
        optimizerSuccessIsAcceptanceGate: false,
        mathematicalFlowLowerBoundMolS: 0,
        scaledStateAgreementTolerance: 1e-3,
      });
    expect(diagnostics.pseudoArclengthQualification
      .complementarityQualification.maximumScaledStateDifferenceAcrossStarts)
      .toBeLessThanOrEqual(1e-3);
    expect(diagnostics.pseudoArclengthQualification
      .complementarityQualification.lambda)
      .toBeGreaterThan(diagnostics.adaptiveLambdaBracket.upperRejected);
    expect(diagnostics.pseudoArclengthQualification
      .complementarityQualification.beyondRejectedBoundaryMargin)
      .toBeGreaterThanOrEqual(diagnostics.adaptiveLambdaBracket.width);
    expect(diagnostics.pseudoArclengthQualification
      .complementarityQualification.lambda
      - diagnostics.adaptiveLambdaBracket.upperRejected)
      .toBeGreaterThanOrEqual(diagnostics.adaptiveLambdaBracket.width);
    expect(diagnostics.pseudoArclengthQualification
      .complementarityQualification.initializations).toEqual([
        'PSEUDO_ARCLENGTH_CORRECTED_STATE',
        'DETERMINISTIC_PERTURBED_REJECTED_PICARD_RESTART',
      ]);
    expect(new Set(diagnostics.pseudoArclengthQualification
      .complementarityQualification.confirmationStartStateSha256).size).toBe(2);
    expect(diagnostics.pseudoArclengthQualification
      .complementarityQualification.confirmationStartScaledStateSeparation)
      .toBeGreaterThanOrEqual(diagnostics.pseudoArclengthQualification
        .complementarityQualification.independentStartMinimumScaledSeparation);
    expect(diagnostics.pseudoArclengthQualification
      .complementarityQualification.attempts).toHaveLength(2);
    expect(diagnostics.pseudoArclengthQualification
      .complementarityQualification.attempts.every(
        (attempt: any) => attempt.accepted
          && attempt.frozenJacobianConfirmationSuccess
          && diagnostics.pseudoArclengthQualification
            .complementarityQualification.confirmationStartStateSha256
            .includes(attempt.confirmationStartSha256)
          && attempt.minimumFlowMolS > 0
          && attempt.rawFvResidualMolS <= 1e-7
          && attempt.scaledFvResidual <= 1e-7
          && attempt.maximumOriginalJobBGateResidual <= 1e-7,
      )).toBe(true);
    expect(diagnostics.acceptedBranch).toMatchObject({
      accepted: true,
    });
    expect(diagnostics.acceptedBranch.minimumFlowMolS).toBeGreaterThan(0);
    expect(diagnostics.acceptedBranch.rawFvResidualMolS)
      .toBeLessThanOrEqual(1e-7);
    expect(diagnostics.acceptedBranch.scaledFvResidual)
      .toBeLessThanOrEqual(1e-7);
    expect(diagnostics.acceptedBranch.maximumOriginalJobBGateResidual)
      .toBeLessThanOrEqual(1e-7);
    expect(diagnostics).toMatchObject({
      strictPositiveFlowsAccepted: true,
      incomingPhysicalFeedsUnchanged: true,
      numericalTraceAdded: false,
      sourceSignReversed: false,
      governingInputsChanged: false,
    });
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
    expect(currentJobCArtifactHashes().branchContinuationHash)
      .toBe(manifest.branchContinuation.sha256);
  }, 1_420_000);
});