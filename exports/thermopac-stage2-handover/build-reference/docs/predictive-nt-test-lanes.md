# Predictive N_T regression lanes

## Known clean-build limitation

The existing pinned deployment manifest includes five ignored Python bytecode
files. Later runtime-layer copies do not consistently exclude these caches, so
a build from a clean checkout can differ from that pinned artifact. Passing this
lane against the existing bundle does not establish clean-build reproducibility.
Resolving this requires a separately authorized packaging correction and
canonical manifest update; this test separation preserves the existing hashes.
The release driver disables bytecode writes for all child checks, including
Vitest-spawned preflights, so validation itself does not create new caches.

## Production release

After building the **current-only** deployment bundle, run:

```sh
npm run validate:predictive-nt-release
```

The explicit selection in `vitest.predictive-nt-release.config.ts` covers the
current queue/lifecycle contract, retirement refusal, current packaged runtime
integrity, and historical snapshot/PDF/display compatibility. The command also
runs the native-free 7C-1.6 worker tests and bounded, one-stage deployed scientific
parity check. Tests run serially to avoid simultaneous runtime loads.

The queue integration suite requires the development database schema and an
existing test user. It creates test designs/jobs; interruption cleanup is limited
to jobs created by that suite invocation. Do not point these tests at production.
Queue protocol tests use a new, explicitly synthetic ACK_V3 worker; scientific
parity is checked independently against the unmodified deployed 7C-1.6 worker.

Release validation is read-only. It requires the already-built 7C-1.6 runtime,
verifies its complete manifest before starting the checks, and verifies the
whole `dist` tree is byte-for-byte unchanged afterward. Missing or corrupt
prebuilt artifacts fail validation; this command never packages, repairs, or
restores them.

Historical result reading is still a production requirement. Historical model
validation and checkpoint *inspection* do not authorize historical execution.
Retired requests must fail before inserting a job or accessing the database.
Only 7C-1.6 may be enqueued or claimed, including restart/reclaim.

No fixture, scientific digest, acceptance threshold, or numerical tolerance is
relaxed in this selection. The full-file runtime integrity test has a 60-second
I/O budget; it still verifies every frozen byte against the same manifest.
The release command fails if the built current runtime is absent or altered;
it does not silently build, repair, or restore any runtime.

## Archival research (not a release prerequisite)

```sh
npm run test:predictive-nt-archive
```

This opt-in lane selects the preserved six-component scientific preflight,
historical Stage-4 seven-component adapter replay, and `*.archive.test.ts`
suites. They are excluded from default Vitest discovery and the explicit
release selection. They may require historical research dependencies; their
availability must never cause retired bundles to be restored to production.
Their assertions and source evidence remain intact.
The historical Stage-4 adapter suite explicitly skips when its retired artifacts
are unavailable; an archive command pass with these skips does not certify that
adapter's replay. The source-only 6C and progress-wrapper replay remain runnable.

Other historical research Python suites are not discovered by Vitest and must
be invoked explicitly for research. This focused release command is not a claim
that every unrelated project test or historical scientific replay passes.

When adding tests, classify them by what they **execute**, not by old version
names inside the current runtime's immutable transitive closure. Keep
historical read-only coverage in the release lane. Put retired executable replay
in the archive lane, and test production attempts as explicit refusals instead.