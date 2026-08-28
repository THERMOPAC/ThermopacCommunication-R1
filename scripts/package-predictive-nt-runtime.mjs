import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const bundleRoot = path.join(root, 'dist', 'predictive-nt-runtime');
const manifestPath = path.join(
  root,
  'server/research/ecr-pre-pilot-model-freeze/model-manifest.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const files = new Set([
  'server/research/ecr-pre-pilot-model-freeze/model-manifest.json',
  'server/research/ecr-pre-pilot-model-freeze/predictive_nt_cascade.py',
  'server/research/ecr-pre-pilot-uniquac/model.py',
  'server/research/ecr-pre-pilot-uniquac/structural-provenance.json',
  manifest.qualificationEvidence.path,
  ...Object.values(manifest.artifacts).map((artifact) => artifact.path),
]);

await rm(bundleRoot, { recursive: true, force: true });
for (const relativePath of [...files].sort()) {
  const source = path.join(root, relativePath);
  const destination = path.join(bundleRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

console.log(`Packaged Predictive N_T runtime (${files.size} files)`);