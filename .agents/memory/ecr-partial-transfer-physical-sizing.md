---
name: Partial-transfer nonlinear sizing boundary
description: Separate pre-pilot candidate solves do not confer full-transfer engineering acceptance.
---

The user chose direct nonlinear partial-transfer sizing rather than frozen-secant extrapolation. The accepted partial anchor is a warm start, not accepted candidate geometry.

**Why:** Frozen local scalar coefficients failed the real anchor's applicability check; repeating its diameter and trial height was not sizing.

**How to apply:** Recompute candidate transport and hydraulics through an explicitly user-triggered isolated partial solve. Never enqueue or resume Job C automatically. Keep the full-transfer route unchanged.

Minimum-height claims are bounded by the explored domain, resolved brackets, and evaluated separation targets. Timeouts, unknown solves, and incomplete envelope searches remain indeterminate.

**Why:** Recovery and quality impose different constraints; their conjunction is not a generally monotone height predicate. An endpoint failure cannot exclude an interior feasible interval.

**How to apply:** Preserve per-target evidence and search limits. Do not weaken gates to obtain a result. Physical-stage efficiency still requires a supported physical-compartment model; numerical cells or a bare theoretical-to-physical count ratio do not supply it.

Saved assessment identity, not the long-running HTTP response or displayed previous status, determines whether a new outcome is available.

**Why:** A completed search saved an indeterminate result while the browser retained the older invalid-model assessment after a request failure.

**How to apply:** Establish a server-read baseline before explicit evaluation; reconcile newer saved outcomes through read-only requests. Separate transport uncertainty from running-state evidence, and never trigger another solve to refresh results.