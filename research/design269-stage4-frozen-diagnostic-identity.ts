import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { verifyStage4DogboxRuntime } from '../server/ecr-pre-pilot/stage4-dogbox-interface';
import { stage4SevenComponentAdapterArtifactHash } from '../server/ecr-pre-pilot/stage4-seven-component-adapter';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fileHash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** Shared before/after identity snapshot for both frozen offline harnesses. */
export function snapshotSourceAndWorkerIdentity(harnessPath: string) {
  const sourceManifestPath = 'server/ecr-pre-pilot/stage4-finite-rate-source-manifest.json';
  const sourceManifestBytes = readFileSync(sourceManifestPath);
  const sourceManifest = JSON.parse(sourceManifestBytes.toString('utf8')) as {
    files: Record<string, string>;
  };
  const sourceFiles = Object.entries(sourceManifest.files).map(([file, expectedSha256]) => {
    const actualSha256 = fileHash(file);
    if (actualSha256 !== expectedSha256) {
      throw new Error(`FROZEN_DIAGNOSTIC_SOURCE_MANIFEST_MISMATCH:${file}`);
    }
    return { file, sha256: actualSha256 };
  });
  const dogbox = verifyStage4DogboxRuntime();
  const adapterRoot = path.resolve(process.env.STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT
    ?? 'dist/stage4-seven-component-adapter-runtime');
  const adapterManifestPath = path.join(adapterRoot, 'stage4-seven-component-adapter-manifest.json');
  const adapterManifestBytes = readFileSync(adapterManifestPath);
  const adapterManifest = JSON.parse(adapterManifestBytes.toString('utf8'));
  const baseRoot = path.resolve(process.env.STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT
    ?? path.join(adapterRoot, adapterManifest.baseRuntime.defaultRelativePath));
  const baseManifestPath = path.join(baseRoot, adapterManifest.baseRuntime.manifestPath);
  const baseManifestBytes = readFileSync(baseManifestPath);
  const legacyManifestPath = path.join(dogbox.legacyRoot, 'job-b-interface-manifest.json');
  const legacyManifestBytes = readFileSync(legacyManifestPath);
  return {
    diagnosticHarness: { path: harnessPath, sha256: fileHash(harnessPath) },
    identityHelper: {
      path: 'research/design269-stage4-frozen-diagnostic-identity.ts',
      sha256: fileHash('research/design269-stage4-frozen-diagnostic-identity.ts'),
    },
    sourceManifest: { path: sourceManifestPath, sha256: hash(sourceManifestBytes.toString('utf8')), files: sourceFiles },
    dogboxRuntime: {
      root: dogbox.root, legacyRoot: dogbox.legacyRoot,
      manifestSha256: fileHash(path.join(dogbox.root, 'stage4-job-b-dogbox-manifest.json')),
      artifactSha256: dogbox.manifest.artifactSha256, files: dogbox.manifest.files,
      legacyManifestSha256: hash(legacyManifestBytes.toString('utf8')),
      legacyRuntimeFiles: JSON.parse(legacyManifestBytes.toString('utf8')).files,
    },
    equilibriumAdapterRuntime: {
      root: adapterRoot, manifestSha256: hash(adapterManifestBytes.toString('utf8')),
      artifactSha256: stage4SevenComponentAdapterArtifactHash(), files: adapterManifest.files,
      baseRoot, baseManifestSha256: hash(baseManifestBytes.toString('utf8')),
      baseRuntimeFiles: JSON.parse(baseManifestBytes.toString('utf8')).files,
      baseRuntime: adapterManifest.baseRuntime,
    },
  };
}

export const sameFrozenDiagnosticIdentity = (left: unknown, right: unknown) => hash(left) === hash(right);