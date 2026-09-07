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
  it('qualifies the local branch then blocks before internal FV seeding', async () => {
    const fixture = JSON.parse(fs.readFileSync(
      'tests/fixtures/design269-job-c-worker-request.json', 'utf8',
    )) as JobCWorkerRequest;
    const branch = fixture.boundaryBranchQualificationRequest;
    branch.sourceStateSha256 = jobCResultHash(branch);
    process.env.JOB_C_RUNTIME_ROOT = path.resolve('dist/job-c-runtime');
    process.env.JOB_B_INTERFACE_RUNTIME_ROOT = path.resolve('dist/job-b-interface-runtime');
    const source = fs.readFileSync('server/ecr-pre-pilot/job-c/worker.py');
    const packaged = fs.readFileSync('dist/job-c-runtime/server/ecr-pre-pilot/job-c/worker.py');
    expect(packaged.equals(source)).toBe(true);
    expect(fixture.dispersedFeedMolS[5]).toBe(0);
    expect(fixture.dispersedFeedMolS[6]).toBe(0);
    const result = await runJobCWorker(fixture, { timeoutMs: 600_000 });
    expect(result.status).toBe('BLOCKED_PRELIMINARY_JOB_C');
    expect(result.error).toBe('JOB_C_BOUNDARY_BRANCH_CANNOT_CONTINUE_TO_LAMBDA_ZERO_GLOBAL_PAIR');
    const diagnostics = result.diagnostics;
    const qualifier = diagnostics.qualifiedStage2LocalContact.qualifier;
    expect(qualifier.status).toBe('QUALIFIED_JOB_C_BOUNDARY_BRANCH');
    expect(qualifier.version).toBe('ECR_JOB_C_BOUNDARY_INTERFACE_QUALIFIER_V1');
    expect(qualifier.resultHash).toMatch(/^[a-f0-9]{64}$/);
    const root = qualifier.rootClasses.find((value: any) => value.rootClass === 'ROOT_1');
    expect(root).toMatchObject({ independentlyReproduced: true, fullyStable: true });
    expect(root.members).toEqual([
      'ORIENTED_PHASE_TEMPLATE', 'ORIENTED_BULK_D_TEMPLATE',
      'ORIENTED_PHASE_TEMPLATE_PERTURB_PLUS',
      'ORIENTED_PHASE_TEMPLATE_PERTURB_MINUS',
    ]);
    expect(qualifier.selectedStartClass).toBe('ORIENTED_PHASE_TEMPLATE');
    expect(qualifier.independentReproductionStartClass).toBe('ORIENTED_BULK_D_TEMPLATE');
    expect(qualifier.interface.continuousComponentFluxMolM2S[5])
      .toBeCloseTo(6.145286375122846e-4, 12);
    expect(qualifier.interface.continuousComponentFluxMolM2S[6])
      .toBeCloseTo(4.4446611532866014e-5, 12);
    expect(root.localStability.continuous.minimumEigenvalue).toBeGreaterThan(0);
    expect(root.localStability.dispersed.minimumEigenvalue).toBeGreaterThan(0);
    for (const phase of ['continuous', 'dispersed']) {
      expect(root.routineTpd[phase].allRefinementsAccepted).toBe(true);
      expect(root.routineTpd[phase].explicitMonoRichBasinSearch.allRequiredSearchesAccepted)
        .toBe(true);
    }
    const candidate = diagnostics.artificialGlobalPairCandidate.candidate;
    expect(candidate.continuousComponentFluxMolM2S[5])
      .toBeCloseTo(-5.0633159008808305e-5, 12);
    expect(candidate.continuousComponentFluxMolM2S[6])
      .toBeCloseTo(-1.4160839270740104e-5, 12);
    expect(diagnostics.incomingPhysicalFlowsRegularized).toBe(false);
    expect(diagnostics.globalDispersedInletExactZeros).toEqual({ NMP: 0, H2O: 0 });
    expect(diagnostics.physicalInfeasibilityClaimed).toBe(false);
    const manifest = JSON.parse(fs.readFileSync(
      'dist/job-c-runtime/job-c-runtime-manifest.json', 'utf8',
    ));
    expect(currentJobCArtifactHashes().boundaryQualifierHash)
      .toBe(manifest.boundaryInterfaceQualifier.sha256);
  }, 600_000);
});