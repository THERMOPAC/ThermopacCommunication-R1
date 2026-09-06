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

// 7C-1.4.0 layers the immutable Task-238 native-plus-RK model and worker while
// retaining every historical runtime byte-for-byte.
const sevenFourteenBundleRoot = path.join(root, 'dist', 'predictive-nt-runtime-7c-1-4');
await rm(sevenFourteenBundleRoot, { recursive: true, force: true });
await cp(sevenThirteenBundleRoot, sevenFourteenBundleRoot, { recursive: true });
for (const relativePath of [
  'server/ecr-pre-pilot/predictive-nt-seven-component-v1-4',
  'server/research/ecr-pre-pilot-seven-component-rk-cascade',
  'server/research/task-238-nmp-oil-interaction-model/model.py',
  'server/research/task-238-nmp-oil-interaction-model/protocol.json',
]) {
  const source = path.join(root, relativePath);
  const destination = path.join(sevenFourteenBundleRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}
const sevenFourteenPackagedFiles = (await bundledFiles(sevenFourteenBundleRoot)).sort();
const sevenFourteenRecords = [];
for (const absolute of sevenFourteenPackagedFiles) {
  const content = await readFile(absolute);
  const metadata = await stat(absolute);
  sevenFourteenRecords.push({
    path: path.relative(sevenFourteenBundleRoot, absolute).split(path.sep).join('/'),
    bytes: metadata.size,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
}
await writeFile(
  path.join(sevenFourteenBundleRoot, 'predictive-nt-runtime-manifest.json'),
  `${JSON.stringify({
    schemaVersion: 'PREDICTIVE_NT_RUNTIME_MANIFEST_V1',
    hashAlgorithm: 'sha256',
    fileCount: sevenFourteenRecords.length,
    aggregateSha256: createHash('sha256').update(
      sevenFourteenRecords.map((record) =>
        `${record.path}:${record.bytes}:${record.sha256}`).join('\n'),
    ).digest('hex'),
    files: sevenFourteenRecords,
  }, null, 2)}\n`,
);
console.log(
  `Packaged Predictive N_T 7C-1.4 runtime (${sevenFourteenRecords.length} hashed files)`,
);

// 7C-1.5.0 preserves the complete 7C-1.4 closure and adds only the versioned
// worker that extends the governed wet-solvent range through 5.0 wt% H2O.
const sevenFifteenBundleRoot = path.join(root, 'dist', 'predictive-nt-runtime-7c-1-5');
await rm(sevenFifteenBundleRoot, { recursive: true, force: true });
await cp(sevenFourteenBundleRoot, sevenFifteenBundleRoot, { recursive: true });
for (const relativePath of [
  'server/ecr-pre-pilot/predictive-nt-seven-component-v1-5',
]) {
  const source = path.join(root, relativePath);
  const destination = path.join(sevenFifteenBundleRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}
const sevenFifteenPackagedFiles = (await bundledFiles(sevenFifteenBundleRoot)).sort();
const sevenFifteenRecords = [];
for (const absolute of sevenFifteenPackagedFiles) {
  const content = await readFile(absolute);
  const metadata = await stat(absolute);
  sevenFifteenRecords.push({
    path: path.relative(sevenFifteenBundleRoot, absolute).split(path.sep).join('/'),
    bytes: metadata.size,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
}
await writeFile(
  path.join(sevenFifteenBundleRoot, 'predictive-nt-runtime-manifest.json'),
  `${JSON.stringify({
    schemaVersion: 'PREDICTIVE_NT_RUNTIME_MANIFEST_V1',
    hashAlgorithm: 'sha256',
    fileCount: sevenFifteenRecords.length,
    aggregateSha256: createHash('sha256').update(
      sevenFifteenRecords.map((record) =>
        `${record.path}:${record.bytes}:${record.sha256}`).join('\n'),
    ).digest('hex'),
    files: sevenFifteenRecords,
  }, null, 2)}\n`,
);
// Operational progress observation is deliberately outside the immutable
// scientific manifest consumed by Job B. It delegates preflight and all
// calculations to the frozen 7C-1.5 worker.
await cp(
  path.join(root, 'server/ecr-pre-pilot/predictive-nt-seven-component-v1-5-progress'),
  path.join(
    sevenFifteenBundleRoot,
    'server/ecr-pre-pilot/predictive-nt-seven-component-v1-5-progress',
  ),
  { recursive: true },
);
console.log(
  `Packaged Predictive N_T 7C-1.5 runtime (${sevenFifteenRecords.length} hashed files)`,
);

// Stage 4 consumes a server-owned adapter artifact.  It is derived from, but
// never added to, the immutable historical/predictive runtime closures.
const stage4AdapterRoot = path.join(root, 'dist', 'stage4-seven-component-adapter-runtime');
await rm(stage4AdapterRoot, { recursive: true, force: true });
for (const relativePath of [
  'server/ecr-pre-pilot/stage4-seven-component-adapter',
]) {
  const source = path.join(root, relativePath);
  const destination = path.join(stage4AdapterRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (candidate) => !candidate.split(path.sep).includes('__pycache__')
      && !candidate.endsWith('.pyc') && !candidate.endsWith('.pyo'),
  });
}
const adapterFiles = (await bundledFiles(stage4AdapterRoot)).sort();
const adapterRecords = [];
for (const absolute of adapterFiles) {
  const content = await readFile(absolute);
  const metadata = await stat(absolute);
  adapterRecords.push({
    path: path.relative(stage4AdapterRoot, absolute).split(path.sep).join('/'),
    bytes: metadata.size,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
}
const baseManifestPath = path.join(
  sevenFifteenBundleRoot, 'predictive-nt-runtime-manifest.json',
);
const baseManifestBytes = await readFile(baseManifestPath);
const baseManifest = JSON.parse(baseManifestBytes);
const baseRecords = new Map(baseManifest.files.map(record => [record.path, record]));
const activeWorkerPath =
  'server/ecr-pre-pilot/predictive-nt-seven-component-v1-5/worker.py';
const scientificEnginePath =
  'server/research/ecr-pre-pilot-seven-component-rk-cascade/engine.py';
const activeWorkerRecord = baseRecords.get(activeWorkerPath);
const scientificEngineRecord = baseRecords.get(scientificEnginePath);
const trustedStage4Binding = {
  baseManifestSha256: 'f4e6e0156e6dc82dfaa3bf012a67ff143eb8cb45dd7c8208d9f924cec0d023fc',
  baseAggregateSha256: '4ebbf36fde2c44be3920839ad189f349b93aae6bb905fbed2fa71bf257c3dbed',
  baseFileCount: 2346,
  activeWorkerSha256: 'aff19f8c42e846245aefa3ab86ba931a09b7cdbdff76d729c9cd7a18447f5156',
  scientificEngineSha256: '0ce9e61f7bdb87a2ccaa1a70edc547343e6cf03585b557855eaeaced1ad0f2d6',
  adapterWorkerSha256: '2ae60e5349e714fd3596c46f86554f02dd35204bc57e86cab5a54d046314c1d8',
  adapterArtifactSha256: '5dcb38f4a73e712d2a503840c263385b89a87dbd69fb3fab73e5eafa6fa56012',
};
const generatedBaseManifestSha256 =
  createHash('sha256').update(baseManifestBytes).digest('hex');
if (
  baseManifest.schemaVersion !== 'PREDICTIVE_NT_RUNTIME_MANIFEST_V1'
  || baseManifest.hashAlgorithm !== 'sha256'
  || baseManifest.fileCount !== baseManifest.files.length
  || !activeWorkerRecord || !scientificEngineRecord
  || generatedBaseManifestSha256 !== trustedStage4Binding.baseManifestSha256
  || baseManifest.aggregateSha256 !== trustedStage4Binding.baseAggregateSha256
  || baseManifest.fileCount !== trustedStage4Binding.baseFileCount
  || activeWorkerRecord.sha256 !== trustedStage4Binding.activeWorkerSha256
  || scientificEngineRecord.sha256 !== trustedStage4Binding.scientificEngineSha256
  || adapterRecords.length !== 1
  || adapterRecords[0].sha256 !== trustedStage4Binding.adapterWorkerSha256
) throw new Error('Stage 4 pinned base runtime manifest invalid');
const adapterManifestWithoutArtifact = {
  schemaVersion: 'ECR_STAGE4_ADAPTER_RUNTIME_MANIFEST_V1',
  protocol: 'ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1',
  adapterVersion: '1.0.0',
  engineId: 'ECR2_PRE_PILOT_SEVEN_COMPONENT_0P5_5P0_H2O',
  engineVersion: '7C-1.5.0',
  engineHash: '4f0b57dd41a2d768e1964e49ecee23e87de358ad7de697a2b315ab94a79091ac',
  componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
  baseRuntime: {
    artifact: 'predictive-nt-runtime-7c-1-5',
    defaultRelativePath: '../predictive-nt-runtime-7c-1-5',
    manifestPath: 'predictive-nt-runtime-manifest.json',
    manifestSha256: generatedBaseManifestSha256,
    aggregateSha256: baseManifest.aggregateSha256,
    fileCount: baseManifest.fileCount,
    activeWorkerPath,
    activeWorkerSha256: activeWorkerRecord.sha256,
    scientificEnginePath,
    scientificEngineSha256: scientificEngineRecord.sha256,
  },
  hashAlgorithm: 'sha256',
  fileCount: adapterRecords.length,
  aggregateSha256: createHash('sha256').update(
    adapterRecords.map(record =>
      `${record.path}:${record.bytes}:${record.sha256}`).join('\n'),
  ).digest('hex'),
  files: adapterRecords,
};
const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
    : JSON.stringify(value);
const adapterManifest = {
  ...adapterManifestWithoutArtifact,
  artifactSha256: createHash('sha256')
    .update(canonical(adapterManifestWithoutArtifact)).digest('hex'),
};
if (adapterManifest.artifactSha256 !== trustedStage4Binding.adapterArtifactSha256) {
  throw new Error(
    'Stage 4 adapter trust anchor update required: generated artifact digest changed',
  );
}
await writeFile(
  path.join(stage4AdapterRoot, 'stage4-seven-component-adapter-manifest.json'),
  `${JSON.stringify(adapterManifest, null, 2)}\n`,
);
console.log(
  `Packaged Stage 4 seven-component adapter (${adapterRecords.length} hashed files)`,
);