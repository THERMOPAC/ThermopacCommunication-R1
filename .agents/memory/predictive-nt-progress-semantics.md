---
name: Predictive N_T progress semantics
description: Honest operational progress without changing scientific evidence or interrupting active calculations.
---

Report observed work units, not an estimated percentage of a coupled solve. A
simultaneous multi-stage calculation has no sequential stage-completion fraction
during its nonlinear solve. Stage-audit counts, calculation completion, product
acceptance, and design eligibility are different claims.

**Why:** An empty progress bar can look stalled while the expensive coupled solve
is active. Conversely, all stage audits can be recorded before final checks and
result persistence finish. Neither observation warrants a made-up percentage or
a scientific acceptance verdict.

**How to apply:** Use an indeterminate activity indicator while solve progress is
unmeasured, measured counts for observed audits, and explicit finalization and
terminal states. Reconcile old stale counters only from the matching result's
actual stage records, not from terminal status alone.

Keep observational fixes outside frozen scientific evidence and preserve active
workers rather than restarting them just to activate better telemetry.

A single trial can solve a ten-stage column: trial count is not theoretical
stage count. Audit progress also does not imply that per-stage numeric payloads
have been persisted.

**Why:** Reading a one-trial counter as N_T=1 incorrectly suggested stopping a
correctly configured ten-stage run. Reporting existing table code as live
results also hid the distinction between audit counters and saved values.

**How to apply:** Inspect frozen requested stage count and actual saved stage
records before answering progress questions. Show pending states honestly;
never promise live numeric rows based only on audit counters.

**Why:** A reporting correction should not invalidate previously bound scientific
snapshots or discard a long calculation already in progress.

**How to apply:** Distinguish client display activation from the already-loaded
worker's instrumentation. Test observation with native-free inherited-method
fixtures and retain the scientific inputs, equations, hashes, and acceptance
thresholds.