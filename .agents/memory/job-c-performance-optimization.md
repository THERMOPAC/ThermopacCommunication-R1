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