# Production Nix runtime validation — 2026-09-25

## Final inactive candidate verification

The final seven-root candidate and checked-in Python-only wrapper passed:
portable Chromium discovery, absence of a global LD_LIBRARY_PATH, pinned numerical
imports, 7C-1.6 preflight, and all 27 document/report/evidence tests. The prior
`which: not found` warning is gone. Explicit `which` adds no closure bytes.
Final closure: 368 paths / 1,987,457,160 NAR bytes (1.850964 GiB).

The earlier failures below are retained as diagnostic history, not outstanding
offline failures. Full application and publishing validation are explicitly
deferred by the user to the separate isolated test project. Nothing was started
against live services and the active configuration remains unchanged.

**Verdict: partial component validation only. Full production acceptance has NOT
passed. Do not publish or replace the active Nix configuration.**

## Isolation and scope

Tests ran from the external `/tmp/thermopac-clean-release-candidate`, in a new
Linux user/network namespace with loopback only and no external routes. Child
environment variables were allowlisted; no inherited database, cloud, SAP, email
or API credentials were supplied. Database access in the selected tests was mocked;
document outputs used temporary local files and were cleaned up.

No production service was contacted. No database/storage was provisioned, no
schema migration ran, and the full ERP and its background workers were not started.
`replit.nix` and `.replit` remain unchanged. Only the inactive candidate adds `which`.

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

1. Resolved for the candidate: global LD_LIBRARY_PATH is unsafe. It causes Node/ICU to fail on missing
   CXXABI_1.3.15. Scope the older candidate GCC/zlib libraries to Python only.
   No active launcher has been changed.
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
python3 scripts/validate-production-nix-offline.py \
  /tmp/thermopac-clean-release-candidate
```

Requires an existing clean release candidate; does not rebuild it. The harness
evaluates existing Nix paths, creates only a temporary Python wrapper and copies
the document smoke test into the temporary candidate. It does not start ERP.

## Remaining acceptance gates

- Provision isolated Neon-compatible DB plus TCP access and a separately
  authorized schema/fixture bootstrap; never copy production credentials.
- Establish restricted disposable storage and explicitly controlled startup
  workers/integrations before full ERP launch.
- Validate authentication, representative ERP flows, storage round trips,
  report fonts/locales, actual drawing extraction and governed scientific runs.
- Repeat in a candidate-only publishing environment to detect accidental store
  dependencies; fix executable discovery and deploy the scoped Python launcher.
- Measure actual combined publishing-image layers. The 1.851 GiB candidate NAR
  closure is not a measured image size.