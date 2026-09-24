import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { scanTree, runDiagnostics, retiredRoots } from '../scripts/publish-size-diagnostics.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-diagnostics-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, name, content) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}
function events(root, temporaryRoot) {
  const output = [];
  runDiagnostics({ root, temporaryRoot, emit: line => output.push(line) });
  const parsed = new Map(output.map(line => {
    const [, event, json] = line.match(/^\[publish-diagnostics\] (\S+) (.*)$/);
    return [event, JSON.parse(json)];
  }));
  return { output, parsed };
}
test('counts hardlinks per path, unique totals once, and never follows symlinks', t => {
  const root = fixture(t);
  const file = write(root, 'a/content', 'abcd');
  fs.linkSync(file, path.join(root, 'a/copy'));
  fs.symlinkSync(root, path.join(root, 'loop'));
  fs.symlinkSync('/nonexistent', path.join(root, 'broken'));
  const result = scanTree(root);
  assert.equal(result.total.apparentBytes, 8);
  assert.equal(result.uniqueApparentBytes, 4);
  assert.equal(result.total.regularFiles, 2);
  assert.equal(result.total.symlinks, 2);
  assert.equal(result.scanErrors, 0);
});
test('reports final output, fingerprints and clean staging without exposing contents', t => {
  const root = fixture(t);
  const temp = fixture(t);
  const digest = createHash('sha256').update('').digest('hex');
  const manifest = JSON.stringify({ fileCount: 0, aggregateSha256: digest, files: [] });
  const file = write(root, 'dist/predictive-nt-runtime-7c-1-6/predictive-nt-runtime-manifest.json', manifest);
  write(root, 'package.json', '{"type":"module"}');
  write(root, 'scripts/package-predictive-nt-runtime.mjs', '// fixture');
  write(root, 'scripts/publish-size-diagnostics.mjs', '// fixture');
  write(root, '.env', 'SECRET_SENTINEL_DO_NOT_LOG');
  const before = fs.readFileSync(file);
  const { output, parsed } = events(root, temp);
  assert.equal(parsed.get('END').status, 'COMPLETED');
  assert.equal(parsed.get('RETIRED_RUNTIME_CHECK').paths.length, 10);
  assert.equal(parsed.get('RETIRED_RUNTIME_CHECK').allAbsent, true);
  assert.equal(parsed.get('CURRENT_SCIENTIFIC_MANIFEST').recordedAggregateMatches, true);
  assert.equal(parsed.get('TEMPORARY_SCIENTIFIC_STAGING').status, 'NONE_PRESENT');
  assert.deepEqual(parsed.get('FINAL_DIST_TOP_LEVEL').directories, ['predictive-nt-runtime-7c-1-6']);
  assert.ok(!output.join('\n').includes('SECRET_SENTINEL_DO_NOT_LOG'));
  assert.deepEqual(fs.readFileSync(file), before);
});
test('reports retired symlinks, missing manifest and residual staging without deleting anything', t => {
  const root = fixture(t);
  const temp = fixture(t);
  write(root, 'dist/index.js', '// fixture');
  fs.symlinkSync('/nonexistent', path.join(root, 'dist', retiredRoots[0]));
  const residual = path.join(temp, 'predictive-nt-runtime-example');
  fs.mkdirSync(residual);
  const { parsed } = events(root, temp);
  assert.equal(parsed.get('RETIRED_RUNTIME_CHECK').allAbsent, false);
  assert.equal(parsed.get('CURRENT_SCIENTIFIC_MANIFEST').status, 'UNAVAILABLE_OR_INVALID');
  assert.equal(parsed.get('TEMPORARY_SCIENTIFIC_STAGING').matchingEntries, 1);
  assert.equal(parsed.get('END').status, 'COMPLETED_WITH_WARNINGS');
  assert.ok(fs.existsSync(residual));
  assert.ok(fs.lstatSync(path.join(root, 'dist', retiredRoots[0])).isSymbolicLink());
});