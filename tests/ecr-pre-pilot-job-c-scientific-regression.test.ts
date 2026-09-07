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
  it('uses corrected axial orientation and fails closed on local-flux Picard nonconvergence', async () => {
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
    expect(result.error).toBe('JOB_C_LOCAL_FLUX_PICARD_NONCONVERGENCE');
    const diagnostics = result.diagnostics;
    expect(diagnostics.heightM).toBe(2);
    expect(diagnostics.lambda).toBeGreaterThan(0);
    expect(diagnostics.lambda).toBeLessThanOrEqual(1);
    expect(typeof diagnostics.reason).toBe('string');
    expect(diagnostics.reason.length).toBeGreaterThan(0);
    expect(diagnostics.maximumOuterIterations).toBe(24);
    expect(Array.isArray(diagnostics.outerIterations)).toBe(true);
    expect(diagnostics.globalInletFluxAudit).toMatchObject({
      continuousToDispersedSignConvention:
        'POSITIVE_NC_REMOVES_FROM_CONTINUOUS_AND_ADDS_TO_DISPERSED',
      signAndBoundaryOrientationConclusion:
        'B_TO_C_SOURCE_SIGNS_AND_COUNTERCURRENT_BOUNDARIES_ANALYTICALLY_CONSERVATIVE',
    });
    if (diagnostics.unconstrainedTerminalDiagnostic) {
      expect(diagnostics.unconstrainedTerminalDiagnostic.qualification).toBe(
        'UNBOUNDED_TERMINAL_DIAGNOSTIC_ONLY_NOT_ACCEPTANCE',
      );
    }
    expect(result).not.toHaveProperty('sensitivityCases');
    const manifest = JSON.parse(fs.readFileSync(
      'dist/job-c-runtime/job-c-runtime-manifest.json', 'utf8',
    ));
    expect(currentJobCArtifactHashes().boundaryQualifierHash)
      .toBe(manifest.boundaryInterfaceQualifier.sha256);
  }, 900_000);
});