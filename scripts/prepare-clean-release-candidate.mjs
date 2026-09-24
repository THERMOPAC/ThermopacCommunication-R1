#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp, lstat, mkdir, readFile, readdir, readlink, realpath, rm, stat, writeFile,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

const EXPECTED_RUNTIME_MANIFEST_SHA256 =
  '2482213baab825170ffd9af67b66319674095f5864a9ceccb897b25a5b72e017';
const EXPECTED_RUNTIME_FILE_COUNT = 2349;
const RUNTIME_RELATIVE =
  'dist/predictive-nt-runtime-7c-1-6';

const sourceRoot = await realpath(path.resolve(
  process.env.RELEASE_SOURCE_ROOT || process.cwd(),
));
const requestedTarget = process.argv.slice(2)
  .find((argument) => !argument.startsWith('--'))
  || '/tmp/thermopac-clean-release-candidate';
const targetRoot = path.resolve(requestedTarget);
const reportsRoot = `${targetRoot}-reports`;
const verifyOnly = process.argv.includes('--verify-only');
const resume = process.argv.includes('--resume');
const assetRoots = [
  'client/public', 'server/public', 'local-agent', 'local-document-agent',
  'uploads', 'wpqr_documents', 'workflow-backup/build-windows-agent.yml',
  'UOR-PLC-Price-Review.xlsx', 'Google_Ads_API_Design_Document.doc',
  'deliverables/ecr-assembly-reconciliation/approved-component-manifest.json',
];

function portable(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

if (isWithin(sourceRoot, targetRoot) || isWithin(sourceRoot, reportsRoot)) {
  throw new Error('Candidate and reports must be assembled outside the source workspace');
}
if (targetRoot === '/tmp' || targetRoot === '/') {
  throw new Error('Refusing to replace an unsafe candidate path');
}
const temporaryRoot = await realpath('/tmp');
const targetParent = await realpath(path.dirname(targetRoot));
if (!isWithin(temporaryRoot, targetParent)) {
  throw new Error('Release candidates must be created under /tmp');
}
for (const destination of [targetRoot, reportsRoot]) {
  try {
    const entry = await lstat(destination);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error('Candidate/report destination must be a real directory');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const omissionRules = [
  { path: '.git', reason: 'repository metadata is not a runtime dependency' },
  { path: '.local', reason: 'workspace-local state and audit material excluded by approval' },
  { path: '.cache', reason: 'workspace cache excluded' },
  { path: '.config', reason: 'workspace-local configuration may contain credentials' },
  { path: '.upm', reason: 'package-manager workspace state excluded' },
  { path: '.pythonlibs', reason: 'workspace Python environment excluded' },
  { path: 'attached_assets', reason: 'explicitly excluded source/audit attachments' },
  { path: 'deliverables', reason: 'generated deliverables excluded except the explicitly listed imported component manifest' },
  { path: 'research-results', reason: 'explicitly excluded generated research results' },
  { path: '.replit', reason: 'never copied; only modules and nix sections are extracted' },
  { path: '.env*', reason: 'environment and secret files are forbidden' },
  { path: '*session* / *cookie* / *credential* at workspace root',
    reason: 'existing authentication material is forbidden' },
];

const copiedReasons = new Map();
const missingSource = [];
const omittedEncountered = [];

function forbiddenRelative(relativePath) {
  const normalized = portable(relativePath);
  const segments = normalized.split('/');
  const base = segments.at(-1).toLowerCase();
  if (segments.includes('__pycache__') || base.endsWith('.pyc') || base.endsWith('.pyo')) {
    return 'generated Python cache';
  }
  if (base === '.env' || base.startsWith('.env.')) return 'environment file';
  if (segments[0] === 'local-agent' || segments[0] === 'local-document-agent') {
    if (/^(?:session|cookie|credentials?|secrets?)(?:[._-]|$)/i.test(base)) {
      return 'agent authentication material';
    }
  }
  return null;
}

async function exists(absolute) {
  try {
    await lstat(absolute);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function copySelected(relativePath, reason, required = true) {
  const source = path.join(sourceRoot, relativePath);
  if (!await exists(source)) {
    (required ? missingSource : omittedEncountered).push({
      path: portable(relativePath),
      reason: required ? 'required source path is absent' : 'optional source path is absent',
      classification: 'absent-in-source',
    });
    return;
  }
  const destination = path.join(targetRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  if (relativePath === 'node_modules') {
    await mkdir(destination, { recursive: true });
    const result = spawnSync('cp', ['-au', `${source}${path.sep}.`, destination], {
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Dependency copy failed with status ${result.status}`);
    }
    copiedReasons.set('node_modules', reason);
    return;
  }
  await cp(source, destination, {
    recursive: true,
    force: true,
    dereference: false,
    verbatimSymlinks: true,
    preserveTimestamps: true,
    filter(candidate) {
      const relative = path.relative(sourceRoot, candidate);
      const forbidden = relativePath === RUNTIME_RELATIVE
        ? null
        : forbiddenRelative(relative);
      if (forbidden) {
        omittedEncountered.push({
          path: portable(relative),
          reason: forbidden,
          classification: 'intentionally-omitted',
        });
        return false;
      }
      copiedReasons.set(portable(relative), reason);
      return true;
    },
  });
}

async function sha256File(absolute) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolute)) hash.update(chunk);
  return hash.digest('hex');
}

async function walkFiles(root) {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else found.push(absolute);
    }
  }
  await visit(root);
  return found.sort();
}

async function extractSafeReplitConfig() {
  const source = await readFile(path.join(sourceRoot, '.replit'), 'utf8');
  const lines = source.split(/\r?\n/);
  const safe = [];
  let section = 'top';
  for (const line of lines) {
    const match = line.match(/^\s*(\[[^\]]+\])/);
    if (match) section = match[1];
    if (
      (section === 'top' && /^\s*modules\s*=/.test(line))
      || section === '[nix]'
    ) safe.push(line);
  }
  if (!safe.some((line) => /^\s*modules\s*=/.test(line))
    || !safe.includes('[nix]')) {
    throw new Error('Unable to extract both modules and [nix] from .replit');
  }
  await writeFile(
    path.join(targetRoot, '.replit.release-candidate'),
    `${safe.join('\n').trim()}\n`,
    { mode: 0o644 },
  );
  copiedReasons.set(
    '.replit.release-candidate',
    'sanitized candidate-only extraction of .replit modules and nix sections',
  );
}

async function verifyFrozenRuntime(root) {
  const runtimeRoot = path.join(root, RUNTIME_RELATIVE);
  const manifestPath = path.join(runtimeRoot, 'predictive-nt-runtime-manifest.json');
  const manifestSha256 = await sha256File(manifestPath);
  if (manifestSha256 !== EXPECTED_RUNTIME_MANIFEST_SHA256) {
    throw new Error(`Frozen runtime manifest changed: ${manifestSha256}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (
    manifest.fileCount !== EXPECTED_RUNTIME_FILE_COUNT
    || manifest.files.length !== EXPECTED_RUNTIME_FILE_COUNT
  ) throw new Error('Frozen runtime does not contain the expected 2349 payload records');

  const payload = (await walkFiles(runtimeRoot))
    .filter((absolute) => path.basename(absolute) !== 'predictive-nt-runtime-manifest.json');
  const diskPaths = payload.map((absolute) =>
    portable(path.relative(runtimeRoot, absolute)));
  if (
    diskPaths.length !== manifest.files.length
    || diskPaths.some((value, index) => value !== manifest.files[index].path)
  ) throw new Error('Frozen runtime payload paths do not exactly match its manifest');

  for (let index = 0; index < payload.length; index += 1) {
    const metadata = await stat(payload[index]);
    const record = manifest.files[index];
    if (
      metadata.size !== record.bytes
      || await sha256File(payload[index]) !== record.sha256
    ) throw new Error(`Frozen runtime payload mismatch: ${record.path}`);
  }
  const aggregate = createHash('sha256').update(
    manifest.files.map((record) =>
      `${record.path}:${record.bytes}:${record.sha256}`).join('\n'),
  ).digest('hex');
  if (aggregate !== manifest.aggregateSha256) {
    throw new Error('Frozen runtime aggregate hash does not match');
  }
  return {
    manifestSha256,
    aggregateSha256: aggregate,
    payloadFilesValidated: payload.length,
  };
}

async function scanLinks() {
  const links = [];
  for (const absolute of await walkFiles(targetRoot)) {
    const metadata = await lstat(absolute);
    if (!metadata.isSymbolicLink()) continue;
    const rawTarget = await readlink(absolute);
    const resolved = path.resolve(path.dirname(absolute), rawTarget);
    const safe = isWithin(targetRoot, resolved);
    links.push({
      path: portable(path.relative(targetRoot, absolute)),
      target: rawTarget,
      resolvedInsideCandidate: safe,
    });
    if (!safe) throw new Error(
      `Candidate symlink escapes candidate root: ${path.relative(targetRoot, absolute)}`,
    );
  }
  return links;
}

async function scanForbiddenMaterial() {
  const findings = [];
  const textExtensions = new Set([
    '.env', '.ini', '.json', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.md',
    '.txt', '.toml', '.yaml', '.yml', '.sh', '.py', '.sql', '.xml',
  ]);
  for (const absolute of await walkFiles(targetRoot)) {
    const relative = portable(path.relative(targetRoot, absolute));
    const metadata = await lstat(absolute);
    if (!metadata.isFile()) continue;
    const base = path.basename(relative).toLowerCase();
    const sensitiveDataScope = !relative.includes('/')
      || relative.startsWith('local-agent/')
      || relative.startsWith('local-document-agent/');
    if (base === '.env' || base.startsWith('.env.')
      || (/^(?:session|cookie|credentials?|secrets?)(?:[._-]|$)/i.test(base)
        && sensitiveDataScope)) {
      findings.push({ path: relative, reason: 'forbidden sensitive filename' });
      continue;
    }
    if (
      relative.startsWith('node_modules/')
      || metadata.size > 2_000_000
      || !textExtensions.has(path.extname(base))
    ) continue;
    const text = await readFile(absolute, 'utf8');
    if (
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/]{32}/
        .test(text)
    ) {
      findings.push({ path: relative, reason: 'private key material' });
    }
  }
  if (findings.length) {
    throw new Error(`Forbidden material scan failed: ${JSON.stringify(findings.slice(0, 10))}`);
  }
  return { filesFlagged: 0, checks: ['sensitive filenames', 'private-key PEM markers'] };
}

async function buildExternalArtifacts() {
  const esbuild = path.join(targetRoot, 'node_modules', 'esbuild', 'bin', 'esbuild');
  const commands = [
    [
      'server/index.ts', '--platform=node', '--packages=external', '--bundle',
      '--format=esm', `--outfile=${path.join(targetRoot, 'dist', 'index.js')}`,
    ],
    [
      'server/ecr-pre-pilot/stage3-stage4-optimizer.ts', '--platform=node',
      '--bundle', '--format=cjs',
      `--outfile=${path.join(targetRoot, 'dist', 'p1-optimizer.cjs')}`,
    ],
  ];
  for (const args of commands) {
    const result = spawnSync(esbuild, args, {
      cwd: targetRoot,
      env: { PATH: process.env.PATH, NODE_ENV: 'production' },
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`esbuild failed with status ${result.status}`);
  }
  copiedReasons.set('dist/index.js', 'fresh external esbuild server bundle');
  copiedReasons.set('dist/p1-optimizer.cjs', 'fresh external esbuild optimizer bundle');
  // Invoke Vite only: npm build also repackages the immutable scientific closure.
  const result = spawnSync(process.execPath, [
    '--max-old-space-size=4096',
    path.join(targetRoot, 'node_modules/vite/bin/vite.js'), 'build',
  ], {
    cwd: targetRoot,
    env: { PATH: process.env.PATH, NODE_ENV: 'production' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Isolated frontend build failed: ${result.status}`);
  copiedReasons.set('dist/public', 'fresh isolated production Vite build; no app startup');
  await mkdir(reportsRoot, { recursive: true });
  const files = [];
  for (const absolute of await walkFiles(path.join(targetRoot, 'dist/public'))) {
    files.push({ path: portable(path.relative(targetRoot, absolute)), sha256: await sha256File(absolute) });
  }
  await writeFile(path.join(reportsRoot, 'frontend-build.json'), JSON.stringify({
    status: 'FRESH_ISOLATED_BUILD', generatedAtUtc: new Date().toISOString(), files,
  }, null, 2));
}

async function writeReports(runtimeVerification, links, securityScan) {
  await mkdir(reportsRoot, { recursive: true });
  const staticAssets = [];
  for (const relative of assetRoots) {
    const source = path.join(sourceRoot, relative);
    const metadata = await lstat(source);
    const files = metadata.isDirectory() ? await walkFiles(source) : [source];
    let checked = 0;
    for (const absolute of files) {
      const file = portable(path.relative(sourceRoot, absolute));
      if (forbiddenRelative(file)) continue;
      const candidate = path.join(targetRoot, file);
      if (await sha256File(absolute) !== await sha256File(candidate)) {
        throw new Error(`Runtime asset mismatch under ${relative}`);
      }
      if (file.startsWith('client/public/')) {
        const built = path.join(targetRoot, 'dist/public', file.slice('client/public/'.length));
        if (await sha256File(absolute) !== await sha256File(built)) {
          throw new Error('Frontend static asset differs from source');
        }
      }
      checked++;
    }
    staticAssets.push({ root: relative, filesHashMatched: checked });
  }
  const frontend = JSON.parse(await readFile(path.join(reportsRoot, 'frontend-build.json'), 'utf8'));
  for (const file of frontend.files) {
    if (await sha256File(path.join(targetRoot, file.path)) !== file.sha256) {
      throw new Error('Frontend output no longer matches isolated build evidence');
    }
  }
  if (await sha256File(path.join(sourceRoot, 'replit.nix'))
    !== await sha256File(path.join(targetRoot, 'replit.nix'))) {
    throw new Error('Candidate Nix configuration differs from source');
  }
  const inventory = [];
  let totalBytes = 0;
  for (const absolute of await walkFiles(targetRoot)) {
    const metadata = await lstat(absolute);
    const relative = portable(path.relative(targetRoot, absolute));
    if (metadata.isSymbolicLink()) {
      inventory.push({
        path: relative,
        type: 'symlink',
        bytes: metadata.size,
        sha256: null,
        reason: copiedReasons.get(relative) || 'dependency symlink',
      });
      continue;
    }
    if (!metadata.isFile()) continue;
    totalBytes += metadata.size;
    inventory.push({
      path: relative,
      type: 'file',
      bytes: metadata.size,
      sha256: await sha256File(absolute),
      reason: copiedReasons.get(relative)
        || copiedReasons.get(relative.split('/')[0])
        || 'file inherited from an approved copied root',
    });
  }
  const inventoryDocument = {
    schemaVersion: 'CLEAN_RELEASE_FILE_INVENTORY_V1',
    candidatePath: targetRoot,
    generatedAtUtc: new Date().toISOString(),
    fileCount: inventory.filter((record) => record.type === 'file').length,
    symlinkCount: inventory.filter((record) => record.type === 'symlink').length,
    totalBytes,
    aggregateSha256: createHash('sha256').update(
      inventory.map((record) =>
        `${record.path}:${record.bytes}:${record.sha256 || `link:${record.type}`}`).join('\n'),
    ).digest('hex'),
    files: inventory,
  };
  await writeFile(
    path.join(reportsRoot, 'file-inventory.json'),
    `${JSON.stringify(inventoryDocument, null, 2)}\n`,
  );
  await writeFile(
    path.join(reportsRoot, 'omissions.json'),
    `${JSON.stringify({
      schemaVersion: 'CLEAN_RELEASE_OMISSIONS_V1',
      rules: omissionRules,
      encountered: omittedEncountered,
    }, null, 2)}\n`,
  );
  const nrtlEvidence = [
    'server/engine-framework/cel/data/multi-t-nmp-lle.json',
    'server/engine-framework/cel/data/nrtl-params-v1.json',
  ].map((relative) => ({
    path: relative,
    present: inventory.some((record) => record.path === relative),
  }));
  const referencedRuntimeRoots = [
    'dist/job-b-interface-runtime',
    'dist/job-c-runtime',
    'dist/stage4-job-b-dogbox-runtime',
    'dist/stage4-seven-component-adapter-runtime',
  ];
  const runtimeFileComparison = [];
  for (const relative of referencedRuntimeRoots) {
    const sourcePresent = await exists(path.join(sourceRoot, relative));
    const candidatePresent = await exists(path.join(targetRoot, relative));
    if (candidatePresent) throw new Error(`Retired runtime must be absent: ${relative}`);
    runtimeFileComparison.push({
      path: relative,
      sourcePresent,
      candidatePresent,
      classification: !sourcePresent
        ? 'already-absent-in-source'
        : candidatePresent ? 'present' : 'accidentally-missing-from-candidate',
    });
  }
  const report = {
    schemaVersion: 'CLEAN_RELEASE_VERIFICATION_V1',
    candidatePath: targetRoot,
    status: missingSource.length ? 'BLOCKED_MISSING_SOURCE' : 'OFFLINE_VERIFIED_NOT_READY_TO_PUBLISH',
    readyToPublish: false,
    blockers: [
      {
        code: 'EXTERNAL_INTEGRATION_GATES_NOT_RUN',
        detail: 'Full ERP startup, live storage/schema compatibility and combined publishing image size remain unverified. See the separate read-only database-path audit; this preparer never accesses a database.',
      },
    ],
    databasePathAudit: {
      sourceReport: 'docs/clean-release-database-path-audit.json',
      available: await exists(path.join(sourceRoot, 'docs/clean-release-database-path-audit.json')),
      scope: 'Independent read-only snapshot evidence; not rerun by preparation or verification',
    },
    sourceMissing: missingSource,
    candidateMissing: runtimeFileComparison
      .filter((record) => record.classification === 'accidentally-missing-from-candidate'),
    runtimeFileComparison,
    runtimeVerification,
    staticAssets,
    nixConfiguration: { status: 'SOURCE_HASH_MATCHED' },
    nrtlDefaultFilesystemEvidence: nrtlEvidence,
    frontend: {
      status: frontend.status,
      path: 'dist/public',
      reason: 'Vite built inside candidate with only PATH and NODE_ENV; output hashes verified',
    },
    dependencies: {
      status: 'SAME_FULL_DEPENDENCY_SET',
      path: 'node_modules',
      installOrPrunePerformed: false,
      linksChecked: links.length,
    },
    builds: {
      serverIndex: 'fresh external esbuild output',
      optimizer: 'fresh external esbuild output',
      scientificPackagerRun: false,
    },
    securityScan,
    networkDatabaseServerActions: {
      networkAccess: false,
      databaseAccess: false,
      serverStarted: false,
      publishAction: false,
    },
    measured: {
      bytesExcludingNixStore: totalBytes,
      gibibytesExcludingNixStore: Number((totalBytes / 1024 ** 3).toFixed(3)),
      nixStoreIncluded: false,
    },
  };
  await writeFile(
    path.join(reportsRoot, 'verification-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  const inclusionRoots = new Map();
  for (const file of inventory) {
    const root = file.path.startsWith('dist/')
      ? file.path.split('/').slice(0, 2).join('/')
      : file.path.split('/')[0];
    const group = inclusionRoots.get(root) || { root, files: 0, symlinks: 0, bytes: 0 };
    if (file.type === 'file') { group.files++; group.bytes += file.bytes; }
    else group.symlinks++;
    inclusionRoots.set(root, group);
  }
  await writeFile(path.join(reportsRoot, 'inclusion-summary.json'), `${JSON.stringify({
    schemaVersion: 'CLEAN_RELEASE_INCLUSION_SUMMARY_V1',
    generatedAtUtc: inventoryDocument.generatedAtUtc,
    inventorySha256: inventoryDocument.aggregateSha256,
    fileCount: inventoryDocument.fileCount,
    symlinkCount: inventoryDocument.symlinkCount,
    totalBytes: inventoryDocument.totalBytes,
    roots: [...inclusionRoots.values()],
    staticAssets,
    runtimeVerification,
    frontend: report.frontend,
    nixConfiguration: report.nixConfiguration,
    retiredRuntimeRootsAbsent: referencedRuntimeRoots,
    readyToPublish: false,
  }, null, 2)}\n`);
  return { inventoryDocument, report };
}

async function assemble() {
  if (!resume && await exists(targetRoot)) {
    throw new Error('Candidate already exists; choose a new path or explicitly resume');
  }
  await mkdir(targetRoot, { recursive: true });

  const roots = [
    ['server', 'complete server source, including server/research and filesystem evidence'],
    ['client', 'complete client source and client/public runtime dependencies'],
    ['shared', 'complete shared source'],
    ['scripts', 'release and operational source scripts'],
    ['tests', 'offline verification and regression tests'],
    ['migrations', 'database schema source retained without applying it'],
    ['local-agent', 'complete local agent, excluding authentication material'],
    ['local-document-agent', 'complete local document agent, excluding authentication material'],
    ['uploads', 'complete approved runtime uploads'],
    ['wpqr_documents', 'complete approved WPQR runtime documents'],
    ['node_modules', 'same full installed dependency set; no install or prune'],
    [RUNTIME_RELATIVE, 'frozen Predictive N_T 7C-1.6 scientific closure'],
    ['workflow-backup/build-windows-agent.yml', 'exact archived Windows agent workflow served by download route'],
    ['UOR-PLC-Price-Review.xlsx', 'required ERP workbook runtime dependency'],
    ['Google_Ads_API_Design_Document.doc', 'Google Ads design document download'],
    ['deliverables/ecr-assembly-reconciliation/approved-component-manifest.json',
      'shared Stage-5 source imports this exact approved component manifest'],
  ];
  for (const [relative, reason] of roots) {
    console.log(`Copying approved root: ${relative}`);
    await copySelected(relative, reason, relative !== 'shared');
  }

  const rootFiles = [
    'package.json', 'package-lock.json', 'replit.nix', 'drizzle.config.ts',
    'postcss.config.js', 'tailwind.config.ts', 'theme.json', 'tsconfig.json',
    'vite.config.ts', 'vitest.config.ts', 'vitest.predictive-nt-archive.config.ts',
    'vitest.predictive-nt-release.config.ts', 'pyproject.toml', 'uv.lock',
    '.gitignore', '.gitattributes',
  ];
  for (const relative of rootFiles) {
    await copySelected(relative, 'normal root package, build, test, or platform configuration');
  }
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.sql')) {
      await copySelected(entry.name, 'conservatively retained root schema source');
    }
  }

  const sourceManifest = JSON.parse(await readFile(
    path.join(sourceRoot, RUNTIME_RELATIVE, 'predictive-nt-runtime-manifest.json'),
    'utf8',
  ));
  const agentOutputs = sourceManifest.files
    .map((record) => record.path)
    .filter((relative) => relative.startsWith('.agents/'));
  for (const relative of agentOutputs) {
    await copySelected(relative, 'scientific .agents output listed by frozen runtime manifest');
  }

  await extractSafeReplitConfig();
  await mkdir(path.join(targetRoot, 'dist'), { recursive: true });
  await buildExternalArtifacts();
}

if (!verifyOnly) await assemble();
if (!await exists(targetRoot)) throw new Error(`Candidate does not exist: ${targetRoot}`);

const runtimeVerification = await verifyFrozenRuntime(targetRoot);
const links = await scanLinks();
const securityScan = await scanForbiddenMaterial();
const { inventoryDocument, report } =
  await writeReports(runtimeVerification, links, securityScan);

console.log(JSON.stringify({
  candidatePath: targetRoot,
  reportsPath: reportsRoot,
  status: report.status,
  readyToPublish: false,
  files: inventoryDocument.fileCount,
  symlinks: inventoryDocument.symlinkCount,
  bytesExcludingNixStore: inventoryDocument.totalBytes,
  gibibytesExcludingNixStore: report.measured.gibibytesExcludingNixStore,
  scientificPayloadFilesValidated: runtimeVerification.payloadFilesValidated,
}, null, 2));