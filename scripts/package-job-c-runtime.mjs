import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const relative = 'server/ecr-pre-pilot/job-c/worker.py';
const candidateRelative = 'server/ecr-pre-pilot/job-c/candidate_interface.py';
const qualifierRelative = 'server/ecr-pre-pilot/job-c/boundary_interface_qualifier.py';
const output = path.join(root, 'dist/job-c-runtime');
const sha256 = value => createHash('sha256').update(value).digest('hex');
await rm(output, { recursive: true, force: true });
await mkdir(path.dirname(path.join(output, relative)), { recursive: true });
await cp(path.join(root, relative), path.join(output, relative));
await cp(path.join(root, candidateRelative), path.join(output, candidateRelative));
await cp(path.join(root, qualifierRelative), path.join(output, qualifierRelative));
const bytes = await readFile(path.join(output, relative));
const candidateBytes = await readFile(path.join(output, candidateRelative));
const qualifierBytes = await readFile(path.join(output, qualifierRelative));
const manifest = {
  schemaVersion: 'ECR_PRE_PILOT_JOB_C_RUNTIME_MANIFEST_V1',
  protocol: 'ECR_PRE_PILOT_JOB_C_V1',
  componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
  worker: { path: relative, bytes: bytes.length, sha256: sha256(bytes) },
  candidateInterface: {
    version: 'ECR_JOB_C_CANDIDATE_INTERFACE_V1',
    path: candidateRelative,
    bytes: candidateBytes.length,
    sha256: sha256(candidateBytes),
  },
  boundaryInterfaceQualifier: {
    version: 'ECR_JOB_C_BOUNDARY_INTERFACE_QUALIFIER_V1',
    path: qualifierRelative,
    bytes: qualifierBytes.length,
    sha256: sha256(qualifierBytes),
  },
  jobBInterfaceRuntime: '../job-b-interface-runtime',
  qualification: 'PRELIMINARY_NOT_RELEASE_ELIGIBLE',
};
await writeFile(path.join(output, 'job-c-runtime-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  status: 'PACKAGED_JOB_C_RUNTIME', workerSha256: manifest.worker.sha256,
}));