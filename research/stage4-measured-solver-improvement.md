# Stage-4 measured interface-solver improvement

## Scope

This report concerns only the isolated Stage-4 Job-B dogbox interface-root
worker.  It does not establish a physical-column sizing result, alter Stage 2
or Stage 3, or alter the legacy Job-B equations, bounds, starts, acceptance
gates, or solver limits.

The baseline request was assembled through the production Stage-4 sizing
assembler from owner-scoped design 269 authority.  Its coarse request hash is
`b595ab74f3c6c14e288fa22258fe2d9a55714735c5d8114010536f702a3b83cc`.
The distinct refined request hash is
`57f466d9540ad09bdb71372204f94bf78ec3d3532391df19acd1414a7c3dba8d`.
No profiling harness writes a production calculation or result row.

## Measured bottleneck and candidate timing

The baseline cProfile replay completed with the coarse request in **76,495 ms**
of worker operation time (78,932 ms total harness time).  `wet_lngamma` was
the dominant measured kernel: 20,585 calls, 73.219 seconds cumulative and
69.842 seconds self time—about 94.4% of profiled solve time.

The candidate uses a per-engine cache only within one dogbox
`least_squares` invocation:

- exact key: temperature IEEE hexadecimal representation plus contiguous
  composition IEEE bytes, dtype, and shape;
- fixed bound: 4,096 entries, cleared before and after each root solve;
- values are copied on storage and return;
- it is disabled for final residual/rank/reproduction, endpoint stability,
  TPD/admission, and response construction.

The comparable cProfile candidate took **43,996 ms**.  Against the 76,495-ms
cProfile baseline, that is **1.739× speedup / 42.49% reduction**.  It recorded
13,810 scoped thermodynamic calls: 9,520 hits, 4,290 misses, no evictions
(68.94% hit rate).  The separate exact-duplicate observation measured 9,494
repeat calls among 13,810 least-squares-scope calls before enabling the cache.

The unprofiled first-interface baseline was 82,414 ms and is context only; it
is not used for the cProfile-to-cProfile speed calculation.

## Qualification and provenance boundary

The legacy raw response digest is intentionally not expected to remain the
same after a wrapper implementation change.  Both old and new raw response
digests were independently verified against their own declared identities:

| Mesh | Baseline raw result hash | Candidate raw result hash |
| --- | --- | --- |
| coarse | `19cc0063b4c6c1e75f54bb23370a101119402c901950118cfafbab7cab31d600` | `8dcb80f94dc5eaa65168450e37d019e450232404837ae287b5db7e95fbb65ea5` |
| refined | `4f22c0da44282d5d376efe02f13fea95e358f072aaaadd584504daecfe5bc806` | `4c131407227921cb02ace39bee4017a390b0e664084f4938a72d7c9348c6236a` |

The changed wrapper identities are retained, not hidden:

- previous worker/artifact:
  `bd87f14e95ca7bdf4690a3e9fcf7a8e51e4fe4498ee3bd87b699ba1c7bef0265` /
  `b95b9a7b42bf286e4ebc54a9dcc4a9150be29285b3e988f9fcbbcc245c17bc4b`;
- candidate worker/artifact:
  `bc549bd13fb2caee0f94ae4281bc69cdd9c84cfb8414fff47a295ec6a93996e5` /
  `ab4d9ffa71953743171d821b823907683c77dec5a48e900bba3a31898514978b`.

For both exact requests, the full payloads match under JSON-number semantics
after excluding only the derived `resultHash` and changed wrapper identity
paths (`workerSha256`, `jobBInterfaceArtifactSha256`, and
`numericalStrategy.wrapperWorkerSha256`).  The unchanged
`stage4AdapterArtifactSha256` remains part of the comparison.  The
protocol-normalized scientific-payload digests match for each mesh, both
responses remain `CALCULATED_PRELIMINARY_INTERFACE`, and the prior original
selection-gate conjunction remains passed.  This is interface-root
equivalence evidence, not a full sized-column acceptance.

## Progress instrumentation and actual five-compartment probe

Stage-4 instrumentation records saved observations (operation, one-based
iteration, zero-based cell, total cells, attempted/completed interface calls,
monotonic elapsed/operation timing, bounded residual history, and checkpoint
timestamp).  Telemetry is advisory and persistence is coalesced so telemetry
database latency does not become a numerical solver budget charge.  It is
progress evidence only; it is not a numerical resume checkpoint.

The first actual-worker, five-physical-compartment, 180-second offline probe
was launched after the instrumentation work. It was configured to use the real
owner-scoped authority, real inlet local-equilibrium worker, and real dogbox
worker with no injected state/evaluator and no production persistence.
Its artifact was **zero bytes** after the managed cutoff. The original empty
file is retained unchanged as
`research/design269-stage4-five-compartment-actual-profile.empty-first-attempt.json`;
this is a failed harness-attempt boundary, not a scientific observation.
No valid current iteration/cell, interface attempted/completed counts,
operation timing, or residual history can be reported from that first probe.
It is not evidence of completion, failure mode, or sizing acceptance.

Before a single rerun, the research-only checkpoint path was changed to write
a complete synchronous JSON sibling and atomically rename it over the prior
checkpoint.  An initial checkpoint now precedes authority loading, and
stdout emits checkpoint events for initial, authority-ready, solver-start,
telemetry operation, managed-SIGTERM, and final states.  The earlier
zero-byte observation does not establish the interruption mechanism; the
atomic protocol simply prevents replacement of a complete prior checkpoint
by a partially written target.

One repaired-harness retry completed its retained offline checkpoint. This
was an explicit **180-second diagnostic solver cap**, not the normal
nine-minute Stage-4 lifecycle runtime budget. The harness's final elapsed
time was 182,523 ms (including authority/bootstrap/final checkpoint work);
the returned offline status was
`ACTUAL_SOLVER_ERROR_RETAINING_LATEST_TELEMETRY` with
`GLOBAL_STAGE4_WALL_CLOCK_BUDGET_EXHAUSTED`.

The genuine saved progression before that diagnostic cap was:

- actual inlet local-equilibrium binding started at solver elapsed 679 ms and
  completed at 89,652 ms (88,973 ms operation time);
- primary K&H coefficient 0.0126, five physical compartments, coarse mesh
  (10 FV cells), countercurrent iteration 1:
  - cell 0 interface root completed in 42,433 ms;
  - cell 1 interface root completed in 42,384 ms;
  - cell 2 interface root was attempted (attempted 3, completed 2) when the
    whole diagnostic solver budget expired.

No `COUNTERCURRENT_ITERATION_COMPLETE` event occurred, so the retained
residual history is genuinely empty; no changing residual sequence is
available to infer. The coarse and then immediately budget-exhausted refined
mesh were recorded as `NUMERICAL_UNRESOLVED`; the only counted physical trial
was five, with zero resolved trials. This is a cap-limited operational
observation, not target, convergence, mesh, or physical-sizing acceptance.

## Limitations

- The 42.49% figure applies to one coarse interface replay under cProfile, not
  an entire finite-volume column or a production lifecycle duration.
- The cache has no cross-root, cross-engine, cross-request, or numerical
  resume behavior.
- The Stage-4 whole-solve budget and all child numerical limits remain
  unchanged.
- The actual five-compartment probe produced no usable retained telemetry, so
  the first attempt must not be used to characterize the current timeout.
- The repaired five-compartment retry is intentionally limited to 180 seconds,
  not the normal nine-minute runtime budget, and did not complete a
  countercurrent iteration.
- No full-column calculation, physical-compartment selection, or release
  qualification is claimed.

## Evidence

- `research/design269-stage4-interface-profile.json`
- `research/design269-stage4-interface-cprofile.json`
- `research/design269-stage4-interface-cprofile.txt`
- `research/design269-stage4-interface-exact-duplicate-observer.json`
- `research/design269-stage4-interface-exact-cache-candidate.json`
- `research/design269-stage4-interface-exact-cache-candidate.txt`
- `research/design269-stage4-interface-exact-cache-qualification.json`
- `research/design269-stage4-dogbox-exact-request-qualification.json`
- `research/design269-stage4-five-compartment-actual-profile.empty-first-attempt.json`
- `research/design269-stage4-five-compartment-actual-profile.json`
- `tests/stage4-dogbox-exact-cache.test.py`