# Stage-4 regression baseline — 2026-09-19

## Scope and baseline

The pre-reporting baseline is repository HEAD `199c17fe388307c891f856975b6d32b9d5129917`.
The Stage-3 geometry report was still uncommitted: its component, shared helper and
tests were untracked, and its panel import/render was a working-tree change.
Those reporting changes were preserved.

Before reproducing the failures, the affected Stage-4 tests and services were
verified byte-for-byte against HEAD. Thus the isolated failures below reproduce
the pre-reporting code, not just an assumption about when they arose. Database
state is a separate input and is not frozen by checking out a commit.

## Persisted authority

The unmodified test initially had two cold-query timeouts under Vitest's 5-second
default. With a 30-second timeout it reproduced the substantive failure: 9 passed,
1 failed. The supposed historical-only design now had a valid current optimizer,
so the service correctly resolved rather than raising
`STAGE4_CURRENT_STAGE3_OPTIMIZER_REQUIRED`.

The expectation originated in `30604af5`, when the fixture lacked that optimizer.
The fix tests both outcomes: the current optimizer is admitted, and isolating the
optimizer query to return no rows still rejects historical fallback. It preserves
fixed HETS design N_T=7, actual Stage-2 N_T=4 as reference only, and persisted
geometry without Stage-4 reselection. DB-dependent cases have explicit 30-second
limits. The service itself is unchanged. Focused result: **11 passed**.

## Finite-rate manifest and partial-transfer lineage

The two isolated files initially produced **2 failures / 11 passes**.

- The manifest's old sizing-service digest matched `30604af5`. Approved service
  changes subsequently landed in `f18a0898`, `7ff52c42`, and `88ecaeb0`, but the
  digest was not refreshed. Only that digest was updated to the current source.
- `f18a0898` deliberately added the fourth `historicalOnly=true` argument to
  `getKuhniGeometryResolverRuns`, preventing current optimizer results from being
  mistaken for historical resolver authority. The test's three-argument source
  assertion was stale; it now asserts the historical-only call.

Focused result: **13 passed**. Related frozen coarse diagnostic: **13 passed**.
All manifest entries independently rehashed correctly.

## Unchanged operational behavior

The Stage-3 geometry-report regression, exact Stage-3/4 optimizer replay, and HETS
screening suites passed: **13 tests across 3 files**. The reporting browser suite
passed **2 tests**, including the integrated panel. No diameter calculation,
optimizer search, thermodynamics, acceptance threshold, or sizing service was
changed. The running application also rendered its login page after startup.

Commands:

```sh
npx vitest run tests/ecr-pre-pilot-stage4-persisted-authority.test.ts --reporter=verbose
npx vitest run tests/stage4-finite-rate-source-manifest.test.ts tests/stage4-partial-transfer-sizing.test.ts --maxWorkers=1 --no-file-parallelism
npx vitest run tests/stage4-frozen-coarse-diagnostic.test.ts
npx vitest run tests/ecr-stage3-geometry-report-regression.test.ts tests/ecr-pre-pilot-stage3-stage4-optimizer.test.ts tests/ecr-pre-pilot-stage4-hets-screening.test.ts --maxWorkers=1 --no-file-parallelism
npx vitest run tests/ecr-stage3-geometry-report-browser.test.ts --maxWorkers=1 --no-file-parallelism
```

## Seven-component adapter runtime bound

The adapter integration file was isolated under a 270-second process bound. The
unmodified file completed preflight in **17.052 s**, the two actual physical flash
solves in **141.961 s**, and malformed-input rejection in **2.544 s**, then reached
the process bound while running the fallback cascade. Running only the fallback
cascade also reached **270 s** without completing. This establishes the frozen
seven-component `solve_cascade(7, ...)` call—not Vitest, manifest copying, or the
adapter's local-flash path—as the greater-than-five-minute bottleneck.

The bounded regression lane still starts the authentic pinned engine, verifies
its package and trust anchors, performs and deterministically replays the physical
flash, checks all existing thermodynamic gates and balances, and exercises
invalid reference-duty handling. The intrinsically long N_T=7 cascade is now an
explicit extended scientific-acceptance lane. Its real-engine invocation,
1,300-second timeout, and all scientific assertions are unchanged; no result is
mocked or accepted from a fixture. Validation completed with **7 passed / 1
explicitly reported extended test skipped** in **176.51 s Vitest time** (**185.382
s wall time**). The authentic flash replay took **138.667 s** in that run.

Commands:

```sh
# Bounded integration regression (target: less than five minutes)
npx vitest run tests/stage4-seven-component-adapter.integration.test.ts --reporter=verbose

# Extended real-cascade scientific acceptance
STAGE4_RUN_EXTENDED_SCIENTIFIC_ACCEPTANCE=1 npx vitest run tests/stage4-seven-component-adapter.integration.test.ts --reporter=verbose -t 'extended scientific acceptance'
```