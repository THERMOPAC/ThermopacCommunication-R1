import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const bundleRoot = path.join(root, 'dist', 'stage4-job-b-dogbox-runtime');
const workerRelative = 'server/ecr-pre-pilot/job-b-interface-stage4-dogbox/worker.py';
const legacyManifestPath = path.join(root, 'dist/job-b-interface-runtime/job-b-interface-manifest.json');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}` : JSON.stringify(value);
const digest = value => createHash('sha256').update(value).digest('hex');

await rm(bundleRoot, { recursive: true, force: true });
await mkdir(path.dirname(path.join(bundleRoot, workerRelative)), { recursive: true });
await cp(path.join(root, workerRelative), path.join(bundleRoot, workerRelative));
const content = await readFile(path.join(bundleRoot, workerRelative));
const metadata = await stat(path.join(bundleRoot, workerRelative));
const files = [{ path: workerRelative, bytes: metadata.size, sha256: digest(content) }];
const legacyBytes = await readFile(legacyManifestPath);
const legacy = JSON.parse(legacyBytes);
if (legacy.artifactSha256 !== '71c21d480c81e5971754fa664f42259ab9dd117f77ff37a8361a0e2d89de12db'
  || legacy.files?.[0]?.sha256 !== '70229d3eacfde61d906f39bc3dec8a29387cabfc96944493ffb5318653e02f2d') {
  throw new Error('STAGE4_DOGBOX_LEGACY_JOB_B_PIN_INVALID');
}
const unsigned = {
  schemaVersion: 'ECR_STAGE4_JOB_B_DOGBOX_RUNTIME_MANIFEST_V1',
  protocol: 'ECR_JOB_B_INTERFACE_V1', version: '1.0.0', hashAlgorithm: 'sha256',
  numericalStrategy: { id: 'STAGE4_DOGBOX_JAC_SCALED_V1', leastSquaresMethod: 'dogbox', xScale: 'jac' },
  legacyRuntime: { defaultRelativePath: '../job-b-interface-runtime', manifestSha256: digest(legacyBytes), artifactSha256: legacy.artifactSha256 },
  legacyWorkerSha256: legacy.files[0].sha256, fileCount: files.length,
  aggregateSha256: digest(files.map(x => `${x.path}:${x.bytes}:${x.sha256}`).join('\n')), files,
};
const manifest = { ...unsigned, artifactSha256: digest(canonical(unsigned)) };
await writeFile(path.join(bundleRoot, 'stage4-job-b-dogbox-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PACKAGED_STAGE4_JOB_B_DOGBOX', artifactSha256: manifest.artifactSha256, workerSha256: files[0].sha256 }));