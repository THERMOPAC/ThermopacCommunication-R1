import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const bundleRoot = path.join(root, 'dist', 'predictive-nt-runtime');
const files = new Set([
  'server/research/ecr-pre-pilot-model-freeze/predictive_nt_six_component.py',
  'server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/run.py',
  'server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/protocol.json',
  'server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py',
  'server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json',
  'server/research/ecr-pre-pilot-cosmosac/run.py',
  'server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json',
  'server/research/ecr-pre-pilot-cosmosac/vendor/python',
  'server/research/ecr-pre-pilot-six-component-thermodynamics/provenance-manifest.json',
  'server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profile-verification.json',
  'server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles',
  'server/engine-framework/cel/data/multi-t-nmp-lle.json',
  'server/research/task-213-mono-rich-qualification/protocol.json',
  'server/research/task-213-mono-rich-qualification/run.py',
  '.agents/outputs/task-213-mono-rich-qualification/results.json',
  '.agents/outputs/task-213-mono-rich-qualification/report.md',
  '.agents/outputs/task-213-mono-rich-qualification/provenance-manifest.json',
  'server/research/task-215-multistart-resolution/protocol.json',
  'server/research/task-215-multistart-resolution/run.py',
  '.agents/outputs/task-215-multistart-resolution/results.json',
  '.agents/outputs/task-215-multistart-resolution/report.md',
  '.agents/outputs/task-215-multistart-resolution/provenance-manifest.json',
  'server/research/task-216-mono-rich-global-stability/protocol.json',
  'server/research/task-216-mono-rich-global-stability/run.py',
  'server/research/task-216-mono-rich-global-stability/verify.py',
  '.agents/outputs/task-216-mono-rich-global-stability/results.json',
  '.agents/outputs/task-216-mono-rich-global-stability/report.md',
  '.agents/outputs/task-216-mono-rich-global-stability/provenance-manifest.json',
  'server/research/task-218-candidate-generated-stability/protocol.json',
  'server/research/task-218-candidate-generated-stability/run.py',
  'server/research/task-218-candidate-generated-stability/verify.py',
  '.agents/outputs/task-218-candidate-generated-stability/results.json',
  '.agents/outputs/task-218-candidate-generated-stability/report.md',
  '.agents/outputs/task-218-candidate-generated-stability/provenance-manifest.json',
  'server/research/task-218-root-cause-candidate/protocol.json',
  '.agents/outputs/task-218-root-cause-candidate/results.json',
  '.agents/outputs/task-218-root-cause-candidate/provenance-manifest.json',
  'server/research/task-218-task216-root-cause/protocol.json',
  'server/research/task-218-task216-root-cause/run.py',
  '.agents/outputs/task-218-task216-root-cause/results.json',
  '.agents/outputs/task-218-task216-root-cause/provenance-manifest.json',
  'server/research/task-206-stability-constrained-amendment/protocol.json',
  'server/research/task-206-stability-constrained-amendment/run.py',
  '.agents/outputs/task-206-stability-constrained-amendment/results.json',
  '.agents/outputs/task-206-stability-constrained-amendment/provenance-manifest.json',
  '.agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json',
  '.agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/fixed-nt7-feed-sensitivity-results.json',
  '.agents/outputs/task-205-negative-tpd-diagnostic/results.json',
  '.agents/outputs/task-206-stability-constrained-amendment/results.json',
  '.agents/outputs/task-207-seven-stage-multistart-closure/results.json',
]);

await rm(bundleRoot, { recursive: true, force: true });
for (const relativePath of [...files].sort()) {
  const source = path.join(root, relativePath);
  const destination = path.join(bundleRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (candidate) => (
      !candidate.split(path.sep).includes('__pycache__')
      && !candidate.endsWith('.pyc')
      && !candidate.endsWith('.pyo')
    ),
  });
}

async function bundledFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await bundledFiles(absolute));
    else if (entry.isFile() && entry.name !== 'predictive-nt-runtime-manifest.json') found.push(absolute);
  }
  return found;
}

const packagedFiles = (await bundledFiles(bundleRoot)).sort();
const records = [];
for (const absolute of packagedFiles) {
  const content = await readFile(absolute);
  const metadata = await stat(absolute);
  records.push({
    path: path.relative(bundleRoot, absolute).split(path.sep).join('/'),
    bytes: metadata.size,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
}
const recordText = records.map((record) => `${record.path}:${record.bytes}:${record.sha256}`).join('\n');
const manifest = {
  schemaVersion: 'PREDICTIVE_NT_RUNTIME_MANIFEST_V1',
  hashAlgorithm: 'sha256',
  fileCount: records.length,
  aggregateSha256: createHash('sha256').update(recordText).digest('hex'),
  files: records,
};
await writeFile(
  path.join(bundleRoot, 'predictive-nt-runtime-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(`Packaged Predictive N_T runtime (${records.length} hashed files)`);

// The frozen 6C worker validates an exact manifest and must not see 7C files.
// Build a separately versioned 7C closure from that immutable 6C base.
const sevenBundleRoot = path.join(root, 'dist', 'predictive-nt-runtime-7c');
const sevenFiles = [
  'server/ecr-pre-pilot/predictive-nt-seven-component',
  'server/research/ecr-pre-pilot-seven-component-dry-limit/run.py',
  '.agents/outputs/ecr-pre-pilot-seven-component-dry-limit/evidence.json',
  'server/research/ecr-pre-pilot-seven-component-h2o-profile/run_qualification.py',
  'server/research/ecr-pre-pilot-seven-component-h2o-profile/evidence-registry.json',
  'server/research/ecr-pre-pilot-seven-component-h2o-profile/generated',
  'server/research/ecr-pre-pilot-six-component-thermodynamics/generated/generation-manifest.json',
];
await rm(sevenBundleRoot, { recursive: true, force: true });
await cp(bundleRoot, sevenBundleRoot, { recursive: true });
for (const relativePath of sevenFiles) {
  const source = path.join(root, relativePath);
  const destination = path.join(sevenBundleRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (candidate) => !candidate.split(path.sep).includes('__pycache__')
      && !candidate.endsWith('.pyc') && !candidate.endsWith('.pyo'),
  });
}
const sevenPackagedFiles = (await bundledFiles(sevenBundleRoot)).sort();
const sevenRecords = [];
for (const absolute of sevenPackagedFiles) {
  const content = await readFile(absolute);
  const metadata = await stat(absolute);
  sevenRecords.push({
    path: path.relative(sevenBundleRoot, absolute).split(path.sep).join('/'),
    bytes: metadata.size,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
}
const sevenRecordText = sevenRecords.map((record) => `${record.path}:${record.bytes}:${record.sha256}`).join('\n');
await writeFile(path.join(sevenBundleRoot, 'predictive-nt-runtime-manifest.json'), `${JSON.stringify({
  schemaVersion: 'PREDICTIVE_NT_RUNTIME_MANIFEST_V1',
  hashAlgorithm: 'sha256', fileCount: sevenRecords.length,
  aggregateSha256: createHash('sha256').update(sevenRecordText).digest('hex'),
  files: sevenRecords,
}, null, 2)}\n`);
console.log(`Packaged Predictive N_T 7C runtime (${sevenRecords.length} hashed files)`);

// 7C-1.2.0 is a new immutable closure. Keep the historical 7C-1.1.0 bundle
// available for exact-contract replay/resume and layer the simultaneous engine
// and its versioned worker into a separate runtime root.
const sevenTwelveBundleRoot = path.join(root, 'dist', 'predictive-nt-runtime-7c-1-2');
await rm(sevenTwelveBundleRoot, { recursive: true, force: true });
await cp(sevenBundleRoot, sevenTwelveBundleRoot, { recursive: true });
for (const relativePath of [
  'server/ecr-pre-pilot/predictive-nt-seven-component-v1-2',
  'server/research/ecr-pre-pilot-seven-component-simultaneous-cascade',
]) {
  const source = path.join(root, relativePath);
  const destination = path.join(sevenTwelveBundleRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (candidate) => !candidate.split(path.sep).includes('__pycache__')
      && !candidate.endsWith('.pyc') && !candidate.endsWith('.pyo'),
  });
}
const sevenTwelvePackagedFiles = (await bundledFiles(sevenTwelveBundleRoot)).sort();
const sevenTwelveRecords = [];
for (const absolute of sevenTwelvePackagedFiles) {
  const content = await readFile(absolute);
  const metadata = await stat(absolute);
  sevenTwelveRecords.push({
    path: path.relative(sevenTwelveBundleRoot, absolute).split(path.sep).join('/'),
    bytes: metadata.size,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
}
const sevenTwelveRecordText = sevenTwelveRecords
  .map((record) => `${record.path}:${record.bytes}:${record.sha256}`).join('\n');
await writeFile(
  path.join(sevenTwelveBundleRoot, 'predictive-nt-runtime-manifest.json'),
  `${JSON.stringify({
    schemaVersion: 'PREDICTIVE_NT_RUNTIME_MANIFEST_V1',
    hashAlgorithm: 'sha256',
    fileCount: sevenTwelveRecords.length,
    aggregateSha256: createHash('sha256').update(sevenTwelveRecordText).digest('hex'),
    files: sevenTwelveRecords,
  }, null, 2)}\n`,
);
console.log(
  `Packaged Predictive N_T 7C-1.2 runtime (${sevenTwelveRecords.length} hashed files)`,
);

// 7C-1.3.0 keeps both historical bundles immutable and layers only the native
// thermodynamic wrapper, unchanged 1.2 cascade contract, and versioned worker.
const sevenThirteenBundleRoot = path.join(root, 'dist', 'predictive-nt-runtime-7c-1-3');
await rm(sevenThirteenBundleRoot, { recursive: true, force: true });
await cp(sevenTwelveBundleRoot, sevenThirteenBundleRoot, { recursive: true });
for (const relativePath of [
  'server/ecr-pre-pilot/predictive-nt-seven-component-v1-3',
  'server/research/ecr-pre-pilot-seven-component-native',
  'server/research/ecr-pre-pilot-seven-component-native-cascade',
]) {
  const source = path.join(root, relativePath);
  const destination = path.join(sevenThirteenBundleRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (candidate) => !candidate.split(path.sep).includes('__pycache__')
      && !candidate.endsWith('.pyc') && !candidate.endsWith('.pyo'),
  });
}
const sevenThirteenPackagedFiles = (await bundledFiles(sevenThirteenBundleRoot)).sort();
const sevenThirteenRecords = [];
for (const absolute of sevenThirteenPackagedFiles) {
  const content = await readFile(absolute);
  const metadata = await stat(absolute);
  sevenThirteenRecords.push({
    path: path.relative(sevenThirteenBundleRoot, absolute).split(path.sep).join('/'),
    bytes: metadata.size,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
}
const sevenThirteenRecordText = sevenThirteenRecords
  .map((record) => `${record.path}:${record.bytes}:${record.sha256}`).join('\n');
await writeFile(
  path.join(sevenThirteenBundleRoot, 'predictive-nt-runtime-manifest.json'),
  `${JSON.stringify({
    schemaVersion: 'PREDICTIVE_NT_RUNTIME_MANIFEST_V1',
    hashAlgorithm: 'sha256',
    fileCount: sevenThirteenRecords.length,
    aggregateSha256: createHash('sha256').update(sevenThirteenRecordText).digest('hex'),
    files: sevenThirteenRecords,
  }, null, 2)}\n`,
);
console.log(
  `Packaged Predictive N_T 7C-1.3 runtime (${sevenThirteenRecords.length} hashed files)`,
);