import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const retiredRoots = [
  'predictive-nt-runtime',
  'predictive-nt-runtime-7c',
  'predictive-nt-runtime-7c-1-2',
  'predictive-nt-runtime-7c-1-3',
  'predictive-nt-runtime-7c-1-4',
  'predictive-nt-runtime-7c-1-5',
  'job-b-interface-runtime',
  'stage4-job-b-dogbox-runtime',
  'job-c-runtime',
  'stage4-seven-component-adapter-runtime',
];
const currentRoot = 'predictive-nt-runtime-7c-1-6';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Metadata only: no symlink traversal, file contents, subprocesses or writes.
// Directory totals count each regular-file path; allocated bytes count each
// inode once across the entire scan. Nested directory totals overlap.
export function scanTree(root) {
  const directories = [];
  const topLevelFiles = { apparentBytes: 0, regularFiles: 0, symlinks: 0 };
  const seen = new Set();
  let uniqueApparentBytes = 0;
  let uniqueAllocatedBytes = 0;
  let scanErrors = 0;
  function visit(directory, relative) {
    const row = { path: relative || '.', apparentBytes: 0, regularFiles: 0, symlinks: 0 };
    let entries;
    try { entries = fs.readdirSync(directory); }
    catch { scanErrors++; return row; }
    for (const name of entries) {
      const absolute = path.join(directory, name);
      let stat;
      try { stat = fs.lstatSync(absolute); }
      catch { scanErrors++; continue; }
      if (stat.isSymbolicLink()) {
        row.symlinks++;
        if (!relative) topLevelFiles.symlinks++;
      } else if (stat.isDirectory()) {
        const child = visit(absolute, relative ? `${relative}/${name}` : name);
        row.apparentBytes += child.apparentBytes;
        row.regularFiles += child.regularFiles;
        row.symlinks += child.symlinks;
      } else if (stat.isFile()) {
        row.apparentBytes += stat.size;
        row.regularFiles++;
        if (!relative) {
          topLevelFiles.apparentBytes += stat.size;
          topLevelFiles.regularFiles++;
        }
        const key = `${stat.dev}:${stat.ino}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueApparentBytes += stat.size;
          uniqueAllocatedBytes += stat.blocks * 512;
        }
      }
    }
    directories.push(row);
    return row;
  }
  const total = visit(root, '');
  return { total, topLevelFiles, directories, uniqueApparentBytes, uniqueAllocatedBytes, scanErrors };
}

function presence(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isDirectory() ? 'DIRECTORY' : stat.isSymbolicLink() ? 'SYMLINK' : 'FILE';
  } catch (error) {
    return error.code === 'ENOENT' ? 'ABSENT' : 'UNREADABLE';
  }
}

function fingerprint(file) {
  try {
    const bytes = fs.readFileSync(file);
    return { status: 'READ', bytes: bytes.length, sha256: sha256(bytes) };
  } catch (error) {
    return { status: 'UNAVAILABLE', errorCode: error.code || 'UNKNOWN' };
  }
}

export function runDiagnostics({
  root = process.cwd(), temporaryRoot = tmpdir(), emit = console.log,
} = {}) {
  const report = (event, data) => emit(`[publish-diagnostics] ${event} ${JSON.stringify(data)}`);
  const warnings = [];
  report('BEGIN', {
    version: 1, timestamp: new Date().toISOString(),
    scope: 'Post-build filesystem metadata; NOT image-layer sizes or proof of deployment inclusion',
    units: 'bytes; GiB = bytes / 1073741824',
  });
  for (const file of ['package.json', 'scripts/package-predictive-nt-runtime.mjs', 'scripts/publish-size-diagnostics.mjs']) {
    const result = fingerprint(path.join(root, file));
    report('FILE_FINGERPRINT', { path: file, ...result });
    if (result.status !== 'READ') warnings.push(`Fingerprint unavailable: ${file}`);
  }

  const inventory = scanTree(root);
  report('WORKSPACE_TOTAL', {
    ...inventory.total, uniqueApparentBytes: inventory.uniqueApparentBytes,
    uniqueAllocatedBytes: inventory.uniqueAllocatedBytes, scanErrors: inventory.scanErrors,
    note: 'Live scan, not an atomic snapshot; hardlinks counted per path except unique totals',
  });
  if (inventory.scanErrors) warnings.push('Filesystem scan incomplete');
  report('ROOT_FILES_TOTAL', inventory.topLevelFiles);
  const descending = (a, b) => b.apparentBytes - a.apparentBytes || a.path.localeCompare(b.path);
  const topLevel = inventory.directories.filter(row => row.path !== '.' && !row.path.includes('/')).sort(descending);
  for (const row of topLevel) report('TOP_LEVEL_DIRECTORY', row);
  // Limit logged paths to shallow directories; do not expose individual user filenames.
  for (const row of inventory.directories.filter(row => row.path !== '.' && row.path.split('/').length <= 3).sort(descending).slice(0, 30)) {
    report('LARGEST_DIRECTORY', { ...row, note: 'Nested totals overlap; do not sum' });
  }
  const dist = inventory.directories.find(row => row.path === 'dist');
  report('FINAL_DIST', dist || { status: 'ABSENT_OR_UNREADABLE' });
  if (!dist) warnings.push('dist absent or unreadable');
  try {
    const entries = fs.readdirSync(path.join(root, 'dist')).sort();
    const directories = entries.filter(name => presence(path.join(root, 'dist', name)) === 'DIRECTORY');
    report('FINAL_DIST_TOP_LEVEL', { entries, directories });
  } catch { warnings.push('Cannot list dist'); }

  const retired = retiredRoots.map(name => ({ path: `dist/${name}`, status: presence(path.join(root, 'dist', name)) }));
  report('RETIRED_RUNTIME_CHECK', { allAbsent: retired.every(row => row.status === 'ABSENT'), paths: retired });
  if (retired.some(row => row.status !== 'ABSENT')) warnings.push('Retired runtime absent-check failed');

  const manifestPath = `dist/${currentRoot}/predictive-nt-runtime-manifest.json`;
  try {
    const raw = fs.readFileSync(path.join(root, manifestPath));
    const manifest = JSON.parse(raw);
    const records = manifest.files;
    if (!Array.isArray(records) || records.some(record =>
      typeof record.path !== 'string' || !Number.isSafeInteger(record.bytes) ||
      record.bytes < 0 || !/^[a-f0-9]{64}$/.test(record.sha256))) {
      throw new Error('Invalid manifest records');
    }
    const aggregate = sha256(records.map(record => `${record.path}:${record.bytes}:${record.sha256}`).join('\n'));
    const matches = aggregate === manifest.aggregateSha256 && records.length === manifest.fileCount;
    const actual = inventory.directories.find(row => row.path === `dist/${currentRoot}`);
    report('CURRENT_SCIENTIFIC_MANIFEST', {
      path: manifestPath, sha256: sha256(raw), bytes: raw.length,
      declaredFileCount: manifest.fileCount, recordCount: records.length,
      computedAggregateSha256: aggregate, recordedAggregateMatches: matches,
      payloadBytes: records.reduce((sum, record) => sum + record.bytes, 0),
      runtimeInventory: actual || null,
      note: 'Manifest and record digest only; individual payload hashes are not revalidated here',
    });
    if (!matches) warnings.push('Manifest record digest/count mismatch');
  } catch {
    report('CURRENT_SCIENTIFIC_MANIFEST', { path: manifestPath, status: 'UNAVAILABLE_OR_INVALID' });
    warnings.push('Current scientific manifest unavailable or invalid');
  }

  try {
    const candidates = fs.readdirSync(temporaryRoot).filter(name => name.startsWith('predictive-nt-runtime-'));
    report('TEMPORARY_SCIENTIFIC_STAGING', {
      matchingEntries: candidates.length,
      status: candidates.length ? 'RESIDUAL_ENTRIES_PRESENT' : 'NONE_PRESENT',
      note: 'Checks tmpdir() staging prefix; residual entries cannot be attributed to this build alone',
    });
    if (candidates.length) warnings.push('Temporary scientific staging entries remain');
  } catch {
    report('TEMPORARY_SCIENTIFIC_STAGING', { status: 'UNREADABLE' });
    warnings.push('Temporary staging check incomplete');
  }
  report('END', {
    status: warnings.length ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED',
    warnings, note: 'Diagnostic only: no cleanup, environment values, scientific execution or image-size assertions',
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runDiagnostics(); }
  catch (error) {
    // Diagnostics must not mask a successful application build or dump sensitive
    // exception messages. Explicitly report failure without adding a new gate.
    console.log(`[publish-diagnostics] END ${JSON.stringify({
      status: 'DIAGNOSTICS_FAILED', errorCode: error.code || 'UNKNOWN',
    })}`);
  }
}