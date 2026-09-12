---
name: Job C performance optimization
description: Governing sequence and invariants for future Job C runtime optimization.
---

Profile before optimizing. Report wall-clock fractions for residual assembly, local-interface thermodynamics, Jacobian probes, sparse solve/factorization, and exact gate reevaluations. Optimize only the measured dominant cost.

**Why:** Evaluation counts alone do not identify elapsed-time bottlenecks, and speculative optimization could add complexity without improving governed runtime.

**How to apply:** Prioritize analytic FV derivatives, safe parallel execution of the 53 independent finite-difference color groups, and reuse of sparse factorizations or preconditioners where the solver permits. Preserve equations, tolerances, gates, bounds, and λ targets exactly. Never alter the active run while profiling or preparing a later revision.

Use staged evaluation only with an explicit authority boundary:

- Far from target, low-cost directional calculations may propose, rank, or reject a trial only when the rejection is provably incapable of discarding an exactly acceptable step. Suppress exact reevaluations only when they are hash-identical/cacheable or mathematically unable to affect acceptance.
- Near target, restore the full governed Jacobian accuracy, exact local thermodynamics, globalization, and unchanged acceptance machinery.
- Before any result is admitted, always rerun the existing exact confirmations and every scientific gate unchanged.

**Why:** A cheaper surrogate that participates directly in step acceptance can silently change the numerical problem even if final gates are retained.

Runtime timing diagnostics are non-governing evidence. Keep them in one explicitly named top-level result field and exclude only that field from the scientific result hash; never place timings in attempts, completed results, or checkpoint evidence.

**Why:** Wall-clock values are nondeterministic. Hashing them changes scientific identity between identical runs, while recursive key-based exclusions could accidentally hide future scientific data.

**How to apply:** Use a dedicated scientific-result hash that removes only the top-level runtime-diagnostics field and the self-hash. Checkpoint and resume hashes remain fully deterministic and timing-free.

Optimization caches may serve byte-identical local equation evaluations during optimizer and finite-difference work, but every admission confirmation and the authoritative λ=1 replay must bypass them and perform fresh thermodynamic evaluations.

**Why:** Colored Jacobian probes repeatedly leave some cells unchanged, so exact local reuse saves substantial work; admission freshness remains an independent scientific safeguard.

**How to apply:** Key reuse on the complete local interface state plus both bulk compositions with no rounding. Treat cached arrays as immutable and keep the cache bounded. Never cache approximate matches.

Ruiz/SVD remains useful diagnostic evidence for ill-conditioned Jacobians, but bound-aware recovery proposals must not rely on an unconstrained minimum-norm correction through saturated coordinates.

**Why:** Saved-state qualification showed bounded corrections could close the unchanged residual gates where unconstrained corrections became enormous. An intermediate objective improvement alone is never scientific admission.

**How to apply:** Keep recovery finite and strictly inside unchanged bounds, with a fresh Jacobian after each retained move. True residual L2 decrease controls intermediate retention only. Final admission requires all unchanged gates and exactly repeatable two-uncached-evaluation confirmation, independently of L2. Compare candidates by admission class first, gate score second, and bind selected diagnostic records to the selected state.

Scientific admission must outrank lower-scoring non-repeatable candidates.

**Why:** Review exposed a tracker edge case that reported success but returned an earlier unadmitted candidate with a lower numerical gate score.

**How to apply:** Preserve admission-first selection and tests covering an admitted candidate following a better-scoring non-repeatable one. Keep returned confirmation, record, and state hashes aligned.

Left-null-space diagnostics must decompose the same-state residual and Jacobian into column-space-removable and unresolved components using the same dimension-scaled SVD cutoff. Report original Euclidean and Ruiz-weighted projections separately; map weighted rows back through the inverse row scale before restoring FV units.

**Why:** Rank deficiency alone cannot distinguish a removable numerical residual from an incompatible local linearization. Weighted projections are not Euclidean-orthogonal after mapping back, and mixing FV and interface rows would compare incompatible units.

**How to apply:** Label only the 98 FV rows by cell, phase, and component when ranking raw balance errors. Keep projection failures strictly diagnostic: an unavailable SVD vector projection must never suppress a valid correction, alter evaluation counts, or change any scientific decision.

An exact rejected-state replay requires the full hash-matching state vector, not merely its digest and residual projections. Never substitute a nearby accepted state or regenerate a continuation trajectory under an offline-replay authorization.

**Why:** A hash verifies a supplied state but cannot reconstruct it; derivative accuracy and bound-limiting coordinates are state-specific. An almost fully column-space residual does not establish that the numerical Jacobian is accurate.

**How to apply:** Check replay evidence availability before promising derivative tests. If rejected vectors are absent, report the evidence gap and separate recorded constrained-step difficulty from untested Jacobian accuracy.

Weak-direction derivative checks must include the saturated total-flux transform, not only random directions with large responses.

**Why:** Offline replay found almost saturated tanh flux coordinates whose analytic residual derivatives were far smaller than captured finite-difference columns. Good global directional agreement can hide these discrepancies, and Ruiz scaling can amplify them.

**How to apply:** Compare analytic and multi-step finite-difference columns at the exact captured state. Treat near-zero responses using absolute errors; do not call them accurate based on global relative error, or declare numerical noise the proven cause.