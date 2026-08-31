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