# Production Nix runtime validation — 2026-09-25

## Active runtime reduction (offline validation)

The active six-root `replit.nix` and empty `.replit` Nix packages were checked
without application startup. `node scripts/prepare-production-runtime.mjs`
evaluated Python 3.12 and GCC/zlib library paths from the current stable-24_05
channel, confirmed the GCC runtime and zlib are present in the six-root closure,
and generated `dist/production-bin/python3.12` (977 bytes) plus a manifest
(777 bytes). The build command now runs this preparation after scientific
packaging and before publishing-size diagnostics. At runtime the production
command verifies its manifest without requiring Nix commands, prepends the shim
and then performs the existing schema-then-Node sequence. Neither Node nor
Chromium receives the Python library override.

**Measured active explicit-root closure:** 368 paths / 1,987,457,160 NAR bytes
(1.851 GiB), plus 1,754 bytes of generated launcher/manifest outside the Nix
closure. This is 2,327,698,832 fewer NAR bytes than the historical 4,315,155,992
explicit-root measurement, not a measured deployment-image reduction. Module and
platform roots, workspace source/history and published layers remain unmeasured.

The isolated, credential-free network-namespace harness passed Python exact
binary and GCC/zlib scope, normal/failing production command order, final exec
signal propagation, Node environment isolation, vendored native imports,
frozen 7C-1.6 preflight and **28/28 tests** (27 prior report/document/evidence
tests plus one active configuration test). Schema and ERP were replaced by a
fake Node command; migrations, workers and services were not run. The immutable
scientific manifest SHA-256 remains
`2482213baab825170ffd9af67b66319674095f5864a9ceccb897b25a5b72e017`.
The isolated candidate was reconstructed for the harness; its broader clean
candidate audit had not completed before the reconstruction command timed out.
This harness validates components, not a candidate-only publish or full ERP.
The deployment run command is now `sh scripts/production-run.sh`, configured
through the supported publishing control. It takes effect on the next publish;
the already-published deployment remains unchanged.

## Historical inactive candidate verification

The final seven-root candidate and checked-in Python-only wrapper passed:
portable Chromium discovery, absence of a global LD_LIBRARY_PATH, pinned numerical
imports, 7C-1.6 preflight, and all 27 document/report/evidence tests. The prior
`which: not found` warning is gone. Explicit `which` adds no closure bytes.
Final closure: 368 paths / 1,987,457,160 NAR bytes (1.850964 GiB).

The earlier failures below are retained as diagnostic history, not outstanding
offline failures. This section predates authorization to activate the Nix
reduction; full application and publishing validation remain outstanding.

**Verdict: partial component validation only. Full production acceptance has NOT
passed; do not publish based on these component tests alone.**

## Isolation and scope

Tests ran from the external `/tmp/thermopac-clean-release-candidate`, in a new
Linux user/network namespace with loopback only and no external routes. Child
environment variables were allowlisted; no inherited database, cloud, SAP, email
or API credentials were supplied. Database access in the selected tests was mocked;
document outputs used temporary local files and were cleaned up.

No production service was contacted. No database/storage was provisioned, no
schema migration ran, and the full ERP and its background workers were not started.
At the time of these historical checks, `replit.nix` and `.replit` were
unchanged. The subsequently authorized runtime activation is separate.

This is network/environment isolation, NOT a candidate-only filesystem or Nix
store: the full workspace store remains visible. Node comes from the existing
Node module (20.20.0); Python is the candidate's 3.12.3. `/bin/sh` remains a
platform dependency. These limitations prevent claiming complete image validation.

## Results

- Frozen 7C-1.6 worker `--preflight`: PASS; packaged manifest verified and 135
  native dependencies verified. No full scientific sweep was executed.
- Four selected test files: 27/27 passed with the scoped Python environment.
- Real DDS service and HTML template generated a PDF using system Chromium.
  Only its DB query was mocked with a synthetic sheet.
- Poppler `pdftoppm` rasterized that PDF using the same options as drawing AI
  extraction; output PNG signature checked. The complete AI/storage/HTTP path
  was NOT exercised.
- Predictive report tests generated real PDFs and checked frozen scientific
  evidence and reporting semantics. This is not coverage of every ERP report.
- Production evidence tests verified packaged authorities and a mocked enqueue
  boundary without inserting a database job.

## Problems exposed

1. Resolved by the Python-scoped launcher: global LD_LIBRARY_PATH is unsafe. It causes Node/ICU to fail on missing
   CXXABI_1.3.15. Scope the older candidate GCC/zlib libraries to Python only.
   The original test used an inactive launcher; activation uses a generated one.
2. Resolved by explicit `which`: initially DDS invoked `which chromium`, but `which` was absent from the restricted
   candidate PATH. The service logged this failure and used its hard-coded
   current Chromium store path, which exists in the candidate closure. PDF output
   passed, but portable executable discovery is NOT verified. Before adoption,
   explicitly provide `which` or replace the discovery logic and rerun checks.
3. Unmodified ERP uses Neon WebSocket connections (`server/db.ts`) as well as
   direct pg/TCP clients. A disposable local PostgreSQL alone does not satisfy both.
4. Production GCS uses ADC and has live-bucket defaults. No isolated test bucket
   with restricted access or compatible storage environment has been established.
5. Startup initializes SAP, seeds DB records and starts attendance, document
   recovery, OI/CAPA and agent schedulers without comprehensive test controls.
   Full startup is intentionally withheld rather than testing against live services.

## Repeatable offline checks

```sh
node scripts/prepare-production-runtime.mjs
python3 scripts/validate-production-nix-offline.py \
  /tmp/thermopac-clean-release-candidate
```

Requires an existing clean release candidate; does not rebuild it. The harness
evaluates the **active** `replit.nix`, copies the build-generated Python shim,
manifest, production command and isolated tests into the temporary candidate.
It checks the original frozen preflight, report/document tests, Python libraries
and exact production command with stubbed Node (never executes schema or ERP).
The six active Nix roots retain GCC runtime through Chromium's closure, not as
an explicit root. `scripts/prepare-production-runtime.mjs` verifies this at
build time; the production wrapper validates its generated manifest without
invoking Nix at runtime. Deployment run is set to
`sh scripts/production-run.sh` using the supported deployment configuration
operation. Workspace-history exclusion is **not** activated by Nix reduction.

## Remaining acceptance gates

- Provision isolated Neon-compatible DB plus TCP access and a separately
  authorized schema/fixture bootstrap; never copy production credentials.
- Establish restricted disposable storage and explicitly controlled startup
  workers/integrations before full ERP launch.
- Validate authentication, representative ERP flows, storage round trips,
  report fonts/locales, actual drawing extraction and governed scientific runs.
- Repeat in a candidate-only publishing environment to detect accidental store
  dependencies and verify executable discovery and the generated scoped launcher.
- Measure actual combined publishing-image layers. The 1.851 GiB candidate NAR
  closure is not a measured image size.