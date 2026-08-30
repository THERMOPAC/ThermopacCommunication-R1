---
name: NMP LLE residual qualification boundary
description: Governance boundary between a numerically accepted Stage 1 split and qualification of the amended six-component equilibrium model.
---

An evidence-fitted residual excess-Gibbs correction may produce a genuine, stable, material-balanced Stage 1 two-liquid split while the full model remains `NOT_QUALIFIED`. Never treat split-derived compositions, K values, recovery, carryover, or extraction as validated process design unless the frozen blind LLE composition criterion also passes.

**Why:** The amended COSMO-SAC route passed TPD, Gibbs reduction, isoactivity, post-split stability, and balance checks at the design point, but both complete-temperature and complete-molecular-system holdouts exceeded the frozen 0.03 composition RMSD ceiling. Numerical validity at one design charge is not predictive qualification.

**How to apply:** Keep the model identity separate from unmodified COSMO-SAC, retain `CALIBRATION_REQUIRED`, PA-provisional, sulfur-`NOT_CALCULABLE`, and non-release labels, and require direct full-mixture evidence before using the result in a counter-current stage design.

A full tangent-space analysis resolved the apparent local-curvature conflict. A raw phase-Gibbs Hessian in nonlinear log-ratio coordinates contains coordinate-gradient terms and is not a stability Hessian; use the local TPD surface after subtracting the reference tangent plane. The original single-stage pair is locally and globally stable under converged independent Hessians and locally/globally seeded TPD. Counter-current stationary pairs can still be globally unstable even when every local eigenvalue is positive.

**Why:** Independent reduced-Gibbs-difference and projected chemical-potential-Jacobian spectra removed the spurious transformed-coordinate curvature, while complete post-split TPD searches found lower remote basins for many cascade phases. Local convexity therefore does not prove global phase stability.

**How to apply:** Gate every returned phase on a full tangent spectrum, step-size convergence, independent derivative agreement, and optimized TPD seeds from both global-simplex and phase-local families. Keep blind predictive qualification separate.

For the 25 °C fixed-seven-stage feed sensitivities, the remote MONO-rich negative-TPD basin is created by the project residual amendment, not by the pinned base COSMO-SAC surface at the same compositions. The helper's objective agrees algebraically with a separately assembled direct expression, but its search does not reach the deepest constrained minimum. Lower-Gibbs stationary splits prove the isolated Stage 1 extract phases are metastable; they do not prove a closed alternate cascade branch. The deterministic secondary cascade starts remain unclosed with balance residuals dominating, so their relationship to phase instability is unresolved.

**Why:** Identical-composition decomposition leaves base-plus-ideal TPD strongly positive while the amendment contribution drives the total negative. Independent constrained searches, tangent identities, KKT checks, and split balances confirm the remote basin, but extended cascade continuations still do not satisfy closure.

**How to apply:** Treat residual-amendment refitting/stability constraints and cascade multistart convergence as separate workstreams. Do not label the TPD formula mismatched, do not infer a full cascade branch from an isolated-phase split, and do not assume fixing either workstream fixes the other without direct evidence.