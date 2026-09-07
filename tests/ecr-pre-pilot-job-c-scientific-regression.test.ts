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
  it('qualifies every mapped contact and blocks the inadmissible axial profile', async () => {
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
    const result = await runJobCWorker(fixture, { timeoutMs: 900_000 });
    expect(result.status).toBe('BLOCKED_PRELIMINARY_JOB_C');
    expect(result.error).toBe('JOB_C_AXIAL_PROFILE_NO_POSITIVE_CONTINUATION_INTERVAL');
    const diagnostics = result.diagnostics;
    expect(diagnostics.status).toBe('BLOCKED_NO_STRICTLY_POSITIVE_CONTINUATION_INTERVAL');
    expect(diagnostics.profileHeightClaimed).toBe(false);
    expect(diagnostics.numericalTraceAdded).toBe(false);
    expect(diagnostics.literalPhysicalFeedFacesPreserved).toBe(true);
    expect(diagnostics.allHydrocarbonPrefixesAndSolventSuffixesAdmitted).toBe(false);
    expect(diagnostics.governedInletInventory.dispersedFeedMolS)
      .toEqual(fixture.dispersedFeedMolS);
    expect(diagnostics.qualifiedLocalContacts).toHaveLength(7);
    for (const contact of diagnostics.qualifiedLocalContacts) {
      const qualifier = contact.qualifier;
      expect(qualifier.status).toBe('QUALIFIED_JOB_C_BOUNDARY_BRANCH');
      expect(qualifier.version).toBe('ECR_JOB_C_BOUNDARY_INTERFACE_QUALIFIER_V1');
      expect(qualifier.resultHash).toMatch(/^[a-f0-9]{64}$/);
      const reproducedStable = qualifier.rootClasses.find((value: any) =>
        value.independentlyReproduced && value.fullyStable);
      expect(reproducedStable).toBeTruthy();
      for (const phase of ['continuous', 'dispersed']) {
        expect(reproducedStable.localStability[phase].minimumEigenvalue).toBeGreaterThan(0);
        expect(reproducedStable.routineTpd[phase].allRefinementsAccepted).toBe(true);
        expect(reproducedStable.routineTpd[phase]
          .explicitMonoRichBasinSearch.allRequiredSearchesAccepted).toBe(true);
      }
    }
    const nmpViolations = diagnostics.violations.filter((row: any) =>
      row.phase === 'dispersed' && row.component === 'NMP');
    expect(nmpViolations.length).toBeGreaterThan(0);
    expect(nmpViolations.some((row: any) =>
      row.lambdaCoefficientMolS < 0)).toBe(true);
    expect(diagnostics).not.toHaveProperty('heightM');
    expect(result).not.toHaveProperty('sensitivityCases');
    const manifest = JSON.parse(fs.readFileSync(
      'dist/job-c-runtime/job-c-runtime-manifest.json', 'utf8',
    ));
    expect(currentJobCArtifactHashes().boundaryQualifierHash)
      .toBe(manifest.boundaryInterfaceQualifier.sha256);
  }, 900_000);
});