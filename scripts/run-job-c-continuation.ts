/** Replays Job C only from the frozen scientific fixture; no A/B or DB writes. */
import fs from 'node:fs';
import path from 'node:path';
import { currentJobCArtifactHashes, jobCResultHash, runJobCWorker } from '../server/ecr-pre-pilot/job-c';

const fixturePath = 'tests/fixtures/design269-job-c-worker-request.json';
const request = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
request.boundaryBranchQualificationRequest.sourceStateSha256 =
  jobCResultHash(request.boundaryBranchQualificationRequest);
request.axialLocalContactProfileSha256 = jobCResultHash({
  authority: request.axialLocalContactProfileAuthority,
  profile: request.axialLocalContactProfile,
});
const output = process.argv[2] ?? 'research-results/job-c-continuation.json';
process.env.JOB_C_RUNTIME_ROOT = path.resolve('.');
process.env.JOB_B_INTERFACE_RUNTIME_ROOT = path.resolve('dist/job-b-interface-runtime');
const hashes = currentJobCArtifactHashes();
fs.mkdirSync(path.dirname(output), { recursive: true });
const sourceDir = `${output}.sources`;
fs.mkdirSync(sourceDir, { recursive: true });
for (const name of ['worker.py', 'branch_continuation.py', 'candidate_interface.py', 'boundary_interface_qualifier.py']) {
  fs.copyFileSync(`server/ecr-pre-pilot/job-c/${name}`, path.join(sourceDir, name));
}
fs.writeFileSync(`${output}.input.json`, JSON.stringify({ input: request, implementation: hashes }, null, 2));
const start = Date.now();
console.log(JSON.stringify({ event: 'JOB_C_ONLY_START', fixturePath, hashes }));
const result = await runJobCWorker(request, {
  timeoutMs: 1_400_000,
  onProgress: phase => console.log(JSON.stringify({ phase, elapsedSeconds: (Date.now() - start) / 1000 })),
  onRawResponse: raw => fs.writeFileSync(`${output}.unverified-response.json`, raw + '\n'),
});
const envelope = {
  input: request, inputSha256: jobCResultHash(request),
  implementation: hashes, result, elapsedSeconds: (Date.now() - start) / 1000,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(envelope, null, 2) + '\n');
console.log(JSON.stringify({ output, status: result.status, error: result.error,
  continuation: result.diagnostics?.branchContinuation }));