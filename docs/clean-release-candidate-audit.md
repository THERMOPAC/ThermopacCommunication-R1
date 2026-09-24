# Clean release candidate — offline preparation

## Status

Offline candidate assembled; **not approved or ready for publishing**. No database,
live server, schema migration, scientific solver, domain change, or publishing
operation was performed.

The candidate and full machine-readable reports are temporary local artifacts:

- Candidate: `/tmp/thermopac-clean-release-candidate`
- Reports: `/tmp/thermopac-clean-release-candidate-reports`
- Reports include `file-inventory.json` (per-file SHA-256, bytes and inclusion reason),
  `omissions.json`, and `verification-report.json`.

These `/tmp` artifacts are not durable storage. The preparation script is retained
at `scripts/prepare-clean-release-candidate.mjs`. It refuses an existing destination
unless explicitly resumed and only permits external temporary destinations.

## Measured assembly snapshot

- 2,415,389,287 regular-file bytes, approximately 2.25 GiB, excluding Nix.
- 91,236 files; 72 symlinks checked to stay within the candidate.
- All installed Node dependencies retained; no installation, pruning or upgrades.
- Server and optimizer freshly bundled with esbuild outside the workspace.
- Frontend copied from existing `dist/public`; freshness against current source
  is not asserted.
- All 2,349 frozen scientific payload files verified against the existing manifest.
- Scientific manifest SHA-256:
  `2482213baab825170ffd9af67b66319674095f5864a9ceccb897b25a5b72e017`.
- `replit.nix` retained unchanged. A candidate-only configuration extract contains
  only modules and the Nix section, not secrets, workflows or publishing settings.

The inventory is an assembly snapshot, before subsequent test caches. Filesystem
size is not a measurement of the eventual publishing image or its Nix layer.

## Conservative inclusion boundary

Retained complete server/client/shared source, scientific source inputs, scripts,
tests, migrations, the frozen package, full Node dependencies, and runtime document
directories. This is deliberately not a minimal production-dependency build.

Runtime assets include client/public and server/public where present, both local
agent source/release trees, the ERP workbook, uploads and WPQR legacy documents.
Manifest-listed scientific evidence under `.agents/outputs` is retained, but not
the full historical output collection.

Omitted from the candidate, without changing the source workspace: Git/LFS
history, workspace caches/state, general attached assets, generated deliverables,
research-results and credentials/session/environment files. Filename/private-key
marker checks passed; this is not a comprehensive security certification.

## Offline tests

Run from the candidate's working directory, using its copied dependencies:

```sh
PYTHONDONTWRITEBYTECODE=1 ./node_modules/.bin/vitest run \
  --maxWorkers=1 --no-file-parallelism --testTimeout=30000 \
  tests/predictive-nt-production-evidence-paths.test.ts \
  tests/predictive-nt-report-evidence.test.ts
```

Result: 13/13 passed, including production-mode input validation, a mocked
database enqueue boundary, source-absent frozen-evidence resolution, generated
PDF molecular evidence, and missing/corrupt evidence handling.

The initial run with Vitest's default five-second timeout had one enqueue-test
timeout; rerunning with a 30-second test timeout passed. No scientific tolerance
or model parameter changed.

An additional profile/authority test group passed 64 tests and failed one legacy
Job-C test because `dist/job-c-runtime` is intentionally absent in both the original
workspace and the candidate. Retired runtimes must not be restored to satisfy it.

## Outstanding release gates

1. Historical database-backed local file paths remain unverified. Some download
   records may name paths outside conventional uploads/WPQR directories.
2. `.github/workflows/build-windows-agent.yml` is referenced by an existing
   download route but already absent from the source workspace.
3. Frontend output needs a fresh isolated build or an independently verified
   source/output match before release.
4. No full ERP startup, real database/storage integration, or scientific solve
   was exercised. Offline success does not establish full production readiness.
5. Combined image-layer size remains unmeasured; no publish was attempted.

The retired Job-B/Job-C/dogbox/adapter roots are intentionally absent, not release
blockers to repair.