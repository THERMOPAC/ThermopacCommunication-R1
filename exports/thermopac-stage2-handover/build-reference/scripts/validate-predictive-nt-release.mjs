import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distRoot = path.join(root, 'dist');
const runtimeRoot = path.join(distRoot, 'predictive-nt-runtime-7c-1-6');
const manifestName = 'predictive-nt-runtime-manifest.json';

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  }));
  return nested.flat();
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function validateRuntime() {
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(path.join(runtimeRoot, manifestName), 'utf8'),
    );
  } catch (error) {
    throw new Error(`PREDICTIVE_NT_RELEASE_RUNTIME_MISSING: ${error.message}`);
  }

  if (
    manifest.schemaVersion !== 'PREDICTIVE_NT_RUNTIME_MANIFEST_V1'
    || manifest.hashAlgorithm !== 'sha256'
    || !Array.isArray(manifest.files)
    || manifest.fileCount !== manifest.files.length
  ) {
    throw new Error('PREDICTIVE_NT_RELEASE_RUNTIME_MANIFEST_INVALID');
  }

  const diskFiles = (await filesUnder(runtimeRoot))
    .filter((file) => path.basename(file) !== manifestName)
    .sort();
  const diskPaths = diskFiles.map((file) =>
    path.relative(runtimeRoot, file).split(path.sep).join('/'));
  if (
    diskPaths.length !== manifest.files.length
    || diskPaths.some((file, index) => file !== manifest.files[index]?.path)
  ) {
    throw new Error('PREDICTIVE_NT_RELEASE_RUNTIME_MANIFEST_MISMATCH');
  }

  for (const [index, absolute] of diskFiles.entries()) {
    const record = manifest.files[index];
    if (
      record.bytes !== (await stat(absolute)).size
      || record.sha256 !== await sha256File(absolute)
    ) {
      throw new Error(
        `PREDICTIVE_NT_RELEASE_RUNTIME_MANIFEST_MISMATCH: ${record.path}`,
      );
    }
  }

  const recordText = manifest.files
    .map((record) => `${record.path}:${record.bytes}:${record.sha256}`)
    .join('\n');
  if (
    manifest.aggregateSha256
    !== createHash('sha256').update(recordText).digest('hex')
  ) {
    throw new Error('PREDICTIVE_NT_RELEASE_RUNTIME_MANIFEST_MISMATCH: aggregate');
  }
}

async function distFingerprint() {
  const files = (await filesUnder(distRoot)).sort();
  const records = [];
  for (const absolute of files) {
    records.push([
      path.relative(distRoot, absolute).split(path.sep).join('/'),
      (await stat(absolute)).size,
      await sha256File(absolute),
    ].join(':'));
  }
  return createHash('sha256').update(records.join('\n')).digest('hex');
}

await validateRuntime();
const before = await distFingerprint();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'validate:predictive-nt-release:checks'], {
  cwd: root,
  // Applies to Vitest's Python preflights as well as the direct Python checks.
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  stdio: 'inherit',
});
const after = await distFingerprint();

if (after !== before) {
  throw new Error('PREDICTIVE_NT_RELEASE_VALIDATION_MODIFIED_DIST');
}
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);