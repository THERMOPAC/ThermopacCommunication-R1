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

The requested user-facing behavior is an ordered N_T=1–10 sweep with each trial
durably saved before advancing, not a single selected-N_T solve disguised with
ten progress rows. Preserve historical exact-N_T jobs under their own contracts.

**Why:** The user needs progressive numerical trial results, not only audit
counters after one expensive coupled calculation.

**How to apply:** Treat scheduling separately from frozen scientific equations
and gates. Do not automatically launch a sweep after changing its implementation.

The user explicitly approved completed-trial-only collapsible results, with
PASS/FAIL visible while collapsed, rather than a table of unfinished stage rows.

**Why:** The latter confused stages within a trial with progress across the
ten-trial sweep. Approval confirmed on 2026-09-13.

**How to apply:** Preserve this presentation when improving progress reporting;
keep unfinished work in the progress indicator, not placeholder result rows.

Checkpoint completion and continuation eligibility are independent. A fully
saved sweep can retain a continuation seed from an earlier eligible trial.

**Why:** Diagnostic later trials may not supply a valid new seed. Requiring the
seed count to equal the final checkpoint count makes valid final-ACK recovery fail.

**How to apply:** Validate retained seeds at their own stage count; finalize a
fully acknowledged prefix without solving it again.

**Why:** A reporting correction should not invalidate previously bound scientific
snapshots or discard a long calculation already in progress.

**How to apply:** Distinguish client display activation from the already-loaded
worker's instrumentation. Test observation with native-free inherited-method
fixtures and retain the scientific inputs, equations, hashes, and acceptance
thresholds.