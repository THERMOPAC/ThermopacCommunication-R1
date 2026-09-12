---
name: Job C flux cancellation
description: Interpretation of tiny flux-column discrepancies and diagnostic correction evidence.
---

Do not treat an analytic replacement for saturated flux columns as sufficient to repair a Ruiz correction. Bound-aware linear proposals still need true unchanged nonlinear residual checks.

**Why:** Saved-state experiments reproduced the captured finite differences exactly, including cached/uncached and colored/individual equality. Nearly equal two-film fluxes rounded differently; Ruiz amplified those tiny discrepancies. Analytic replacement alone increased unconstrained corrections. A bounded proposal closed local residual thresholds at one captured state but failed at later states despite excellent linear predictions.

**How to apply:** Separate derivative correctness, conditioning, nonlinear globalization, and scientific qualification. A single offline threshold-passing point is neither independent-start reproduction nor design acceptance. Require user approval before transferring diagnostic changes to production.

For exact bounded finite-difference replay, use the realized floating-point displacement in the one-sided three-point denominator, not algebraic `2*h`. Require exact full-matrix replay at every captured state before interpreting nonlinear correction comparisons.

**Why:** Algebraically equivalent denominators differed in floating-point arithmetic at a captured bound-adjacent coordinate. Synthetic approximate equality and replay at only the first state missed this discrepancy.

**How to apply:** Compare against the pinned sparse/grouped numerical implementation, including mixed central/one-sided colors. Keep true-residual step decrease separate from four-threshold candidate classification; successful sequential correction at saved states does not prove seed-independent reproduction.