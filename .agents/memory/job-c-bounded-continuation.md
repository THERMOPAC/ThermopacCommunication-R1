---
name: Job C bounded continuation
description: Finite positive-lambda continuation, rejection evidence, and restart authority for Job C.
---

Job C uses a finite logarithmic target sequence above each accepted positive-lambda anchor. The first rejected target establishes an accepted-lower/rejected-upper bracket. At most three midpoint refinements may then run, and the unchanged rejected upper endpoint is never retried.

Every rejected trial must be evaluated twice from the same candidate and persist exact-repeat confirmation, unchanged gate metrics, dominant residual and component-balance diagnostics, Jacobian/correction diagnostics, and a state hash. Exhausting the finite bracket ends with `JOB_C_POSITIVE_BRANCH_LIMIT_REACHED`, never a physical-infeasibility claim.

Restart authority is fail-closed: only current-request, structurally valid, internally consistent accepted and rejected checkpoint evidence may reconstruct a bracket or its consumed refinement count. Conflicting roots or malformed evidence grant no bracket authority.

**Why:** An effectively unbounded midpoint policy consumed roughly 131,000 continuation evaluations without accepting a point above λ=1e-8. A finite auditable plan is required to bound computational work without weakening any scientific gate.

**How to apply:** Preserve the 189 equations, raw/scaled FV gates, Job B/interface closure, positivity, conservation, rank, stability, TPD, phase, and two-fresh-evaluation acceptance. Expose active λ, trial, accepted lower λ, and rejected upper λ as live progress telemetry.

Offline rejection diagnostics must use captured selected and linearization states, not regenerated historical candidates. Keep this evidence separate from continuation/acceptance authority and require the matching archived worker bytes and immutable request.

**Why:** Historical hashes and residual projections cannot recover the original rejected vector. Re-solving could select a different endpoint and falsely label it an exact replay.

**How to apply:** Refuse missing or mismatched evidence. Diagnostic algebra on a captured Jacobian is not a fresh thermodynamic derivative qualification, a reproduced branch, or a design result. Any new scientific calculation remains explicitly user-started.