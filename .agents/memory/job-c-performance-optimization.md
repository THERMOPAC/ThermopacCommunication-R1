---
name: Job C performance optimization
description: Governing sequence and invariants for future Job C runtime optimization.
---

Profile before optimizing. Report wall-clock fractions for residual assembly, local-interface thermodynamics, Jacobian probes, sparse solve/factorization, and exact gate reevaluations. Optimize only the measured dominant cost.

**Why:** Evaluation counts alone do not identify elapsed-time bottlenecks, and speculative optimization could add complexity without improving governed runtime.

**How to apply:** Prioritize analytic FV derivatives, safe parallel execution of the 53 independent finite-difference color groups, and reuse of sparse factorizations or preconditioners where the solver permits. Preserve equations, tolerances, gates, bounds, and λ targets exactly. Never alter the active run while profiling or preparing a later revision.