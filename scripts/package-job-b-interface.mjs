import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const bundleRoot = path.join(root, 'dist', 'job-b-interface-runtime');
const workerRelative = 'server/ecr-pre-pilot/job-b-interface/worker.py';
const adapterRoot = path.join(root, 'dist', 'stage4-seven-component-adapter-runtime');
const adapterManifestPath = path.join(
  adapterRoot, 'stage4-seven-component-adapter-manifest.json',
);
const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
    : JSON.stringify(value);
const sha256 = value => createHash('sha256').update(value).digest('hex');

await rm(bundleRoot, { recursive: true, force: true });
await mkdir(path.dirname(path.join(bundleRoot, workerRelative)), { recursive: true });
await cp(path.join(root, workerRelative), path.join(bundleRoot, workerRelative));

const workerBytes = await readFile(path.join(bundleRoot, workerRelative));
const workerStat = await stat(path.join(bundleRoot, workerRelative));
const files = [{
  path: workerRelative,
  bytes: workerStat.size,
  sha256: sha256(workerBytes),
}];
const adapterManifestBytes = await readFile(adapterManifestPath);
const adapterManifest = JSON.parse(adapterManifestBytes);
if (
  adapterManifest.schemaVersion !== 'ECR_STAGE4_ADAPTER_RUNTIME_MANIFEST_V1'
  || adapterManifest.protocol !== 'ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1'
  || adapterManifest.engineVersion !== '7C-1.5.0'
) throw new Error('Job B interface requires the verified Stage-4 7C-1.5 adapter');

const withoutArtifact = {
  schemaVersion: 'ECR_JOB_B_INTERFACE_RUNTIME_MANIFEST_V1',
  protocol: 'ECR_JOB_B_INTERFACE_V1',
  version: '1.0.0',
  componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
  hashAlgorithm: 'sha256',
  fileCount: files.length,
  aggregateSha256: sha256(
    files.map(record => `${record.path}:${record.bytes}:${record.sha256}`).join('\n'),
  ),
  files,
  stage4Adapter: {
    defaultRelativePath: '../stage4-seven-component-adapter-runtime',
    manifestSha256: sha256(adapterManifestBytes),
    artifactSha256: adapterManifest.artifactSha256,
  },
};
const manifest = {
  ...withoutArtifact,
  artifactSha256: sha256(canonical(withoutArtifact)),
};
await writeFile(
  path.join(bundleRoot, 'job-b-interface-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(JSON.stringify({
  status: 'PACKAGED_JOB_B_INTERFACE',
  artifactSha256: manifest.artifactSha256,
  workerSha256: files[0].sha256,
  stage4AdapterArtifactSha256: adapterManifest.artifactSha256,
}));