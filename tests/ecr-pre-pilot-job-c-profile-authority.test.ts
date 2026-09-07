import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  jobCResultHash,
  runJobCWorker,
  type JobCWorkerRequest,
} from '../server/ecr-pre-pilot/job-c';

describe('Job-C axial profile authority', () => {
  it('rejects a hash-valid profile with a non-governed unequal bin allocation', async () => {
    const fixture = JSON.parse(fs.readFileSync(
      'tests/fixtures/design269-job-c-worker-request.json', 'utf8',
    )) as JobCWorkerRequest;
    const branch = fixture.boundaryBranchQualificationRequest;
    branch.sourceStateSha256 = jobCResultHash(branch);
    const unequalBins = [[10], [9], [8], [7], [6], [5], [1, 2, 3, 4]];
    fixture.axialLocalContactProfile.forEach((contact, index) => {
      contact.provenance.sourceStageFromFeedEnd = unequalBins[index];
    });
    fixture.axialLocalContactProfileSha256 = jobCResultHash({
      authority: fixture.axialLocalContactProfileAuthority,
      profile: fixture.axialLocalContactProfile,
    });
    process.env.JOB_C_RUNTIME_ROOT = path.resolve('dist/job-c-runtime');
    process.env.JOB_B_INTERFACE_RUNTIME_ROOT = path.resolve('dist/job-b-interface-runtime');

    const result = await runJobCWorker(fixture, { timeoutMs: 30_000 });

    expect(result.status).toBe('FAILURE_INVALID_REQUEST');
    expect(result.error).toBe('JOB_C_AXIAL_LOCAL_CONTACT_PROFILE_AUTHORITY_INVALID');
  }, 30_000);
});