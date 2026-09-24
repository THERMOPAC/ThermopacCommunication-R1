# Clean release candidate — isolated verification

## Status

The candidate's offline build, static-asset and historical local-download inclusion
gates are complete; **not approved or ready for publishing**. Production-replica
and separate development database SELECTs were used only for download metadata.
No application server/worker, database write, schema migration, scientific solver,
domain change, dependency removal or publishing operation was performed.
A temporary credential-free Vite static preview was started and stopped.

The candidate and full machine-readable reports are temporary local artifacts:

- Candidate: `/tmp/thermopac-clean-release-candidate`
- Reports: `/tmp/thermopac-clean-release-candidate-reports`
- Reports include `file-inventory.json` (per-file SHA-256, bytes and inclusion reason),
  `omissions.json`, `frontend-build.json`, `inclusion-summary.json`, and
  `verification-report.json`.
- Durable, sanitized evidence: [verified inclusion summary](clean-release-inclusion-summary.json),
  [database audit](clean-release-database-path-audit.md), and
  [aggregate database evidence](clean-release-database-path-audit.json).

These `/tmp` artifacts are not durable storage. The preparation script is retained
at `scripts/prepare-clean-release-candidate.mjs`. The prior temporary candidate
was absent and was recreated. The script refuses an existing destination unless
explicitly resumed and only permits external temporary destinations.

Recreate with `node scripts/prepare-clean-release-candidate.mjs`; use `--resume`
only for an existing candidate, or `--verify-only` to hash-check without building.
Verification requires the frontend build receipt beside the candidate. The script
does not repeat database queries, launch the ERP, run npm build, or repackage science.
The database audit is snapshot evidence and must be refreshed if records change.

## Measured assembly snapshot

- 2,415,435,731 regular-file bytes, approximately 2.25 GiB, excluding Nix.
- 91,240 files; 72 symlinks checked to stay within the candidate.
- All installed Node dependencies retained; no installation, pruning or upgrades.
- Server and optimizer freshly bundled **from candidate source**, not workspace
  source with an external output directory.
- Frontend freshly built with production Vite inside the candidate (39.19 seconds).
  Both bundlers receive only PATH and NODE_ENV; no database credentials or REPL_ID.
  Frontend output hashes are captured and checked by subsequent verification.
- All 2,349 frozen scientific payload files verified against the existing manifest.
- Scientific manifest SHA-256:
  `2482213baab825170ffd9af67b66319674095f5864a9ceccb897b25a5b72e017`.
- `replit.nix` retained unchanged. A candidate-only configuration extract contains
  only modules and the Nix section, not secrets, workflows or publishing settings.

The inventory is a post-test verification snapshot. Filesystem
size is not a measurement of the eventual publishing image or its Nix layer.

## Conservative inclusion boundary

Retained complete server/client/shared source, scientific source inputs, scripts,
tests, migrations, the frozen package, full Node dependencies, and runtime document
directories. This is deliberately not a minimal production-dependency build.

Runtime assets include client/public and server/public where present, both local
agent source/release trees, the ERP workbook, uploads and WPQR legacy documents.
Manifest-listed scientific evidence under `.agents/outputs` is retained, but not
the full historical output collection.

### Verified whole-ERP static/download inclusion

Each retained file below was SHA-256 matched against source. Every client/public
file was also matched against the fresh dist/public copy.

| Included root/file | Files checked | Consumers |
|---|---:|---|
| client/public | 122 | Frontend public assets, logos, SolidWorks extractor, static downloads |
| server/public | 3 | /dl and /test-static |
| local-agent | 67 | Agent/structurer/tools/installer archives and main.py download |
| local-document-agent | 54 | Document-agent source, release binaries, installer tools and workflow |
| uploads | 17 | Local/mirrored offer templates and runtime uploads |
| wpqr_documents | 5 | Historical local WPQR fallback |
| workflow-backup/build-windows-agent.yml | 1 | Archived workflow download API |
| UOR-PLC-Price-Review.xlsx | 1 | ERP report download/stream |
| Google_Ads_API_Design_Document.doc | 1 | Google Ads design-document download |
| deliverables/ecr-assembly-reconciliation/approved-component-manifest.json | 1 | Shared Stage-5 source import |

The Windows workflow backup matches the last tracked original, SHA-256
`e0584598cab0e37d6cb32ae29b27c69555aaae979d1c077a5758e9c3d2403f45`.
The API now serves this existing archive, and the public link explicitly labels it
archived. No workflow content was fabricated and no GitHub Actions installation
was restored. The older client/public workflow copy remains untouched.

An initial candidate-only server build correctly failed on the omitted Stage-5
manifest. Only that required file was excepted from the deliverables exclusion;
both isolated bundles and the frontend then built successfully.

Omitted from the candidate, without deleting source files: Git/LFS
history, workspace caches/state, general attached assets, generated deliverables,
research-results and credentials/session/environment files. The source-imported
component manifest above is the sole deliverables exception. Filename/private-key
marker checks passed; this is not a comprehensive security certification.

## Offline tests

Run from the candidate's working directory, using its copied dependencies:

```sh
env -i PATH="$PATH" NODE_ENV=test PYTHONDONTWRITEBYTECODE=1 ./node_modules/.bin/vitest run \
  --maxWorkers=1 --no-file-parallelism --testTimeout=30000 \
  tests/predictive-nt-production-evidence-paths.test.ts \
  tests/predictive-nt-report-evidence.test.ts \
  tests/windows-agent-workflow-download.test.ts
```

Result: 15/15 passed, including production-mode input validation, a mocked
database enqueue boundary, source-absent frozen-evidence resolution, generated
PDF molecular evidence, missing/corrupt evidence handling, and archived workflow
identity/link routing. The workflow test is offline source/identity verification,
not an authenticated full-server HTTP integration test.

The isolated static preview rendered downloads.html with the archive label and
correct API link; a browser resource returned 404 in this static-only preview.
API downloads are not implemented by Vite preview and were not claimed as live
ERP tests. The temporary preview was stopped. Build warnings (large chunks, old
Browserslist data, PostCSS `from`) did not fail the build; no dependencies changed.

No scientific tolerance or model parameter changed. Final post-test verification
again matched all 2,349 frozen files, Nix configuration, assets and frontend hashes.

In the prior audit, an additional profile/authority test group passed 64 tests and failed one legacy
Job-C test because `dist/job-c-runtime` is intentionally absent in both the original
workspace and the candidate. Retired runtimes must not be restored to satisfy it.

## Outstanding release gates

1. **Historical local-file inclusion resolved at this snapshot:** production's
   122 examined columns contain 2,383 nonempty field occurrences. No historical
   local download established an existing source file missing from the candidate.
   Both databases have zero populated local offer-template paths. All 3 existing
   ID-derived WPQR fallback hits are retained; the other 18 of 21 cloud-first records
   require cloud availability checks, not invented local files.
2. **Workflow and frontend gates resolved:** exact historical workflow archive
   served explicitly; fresh isolated frontend built and verified.
3. **Storage and schema compatibility remain unverified:** no GCS object existence
   or signed-URL test was performed. The production replica lacks development-only
   WPS combined/checklist evidence-file columns; `pqr_document_file_path` is absent
   in both schemas despite a route reference. Investigate safely before a full
   ERP publishing test; no migration is authorized or performed here.
4. **Not exercised:** full ERP startup, real database/storage integration, or a
   scientific solve. Offline success does not establish full production readiness.
5. **Image size and publishing configuration:** combined image-layer size remains
   unmeasured; no publish was attempted. The sanitized `.replit.release-candidate`
   is evidence of modules/Nix settings, not a configured publishing target.
   Any future test needs separate authorization and isolated services; do not launch
   workers against the live database merely to smoke-test the candidate.

The retired Job-B/Job-C/dogbox/adapter roots are intentionally absent, not release
blockers to repair.