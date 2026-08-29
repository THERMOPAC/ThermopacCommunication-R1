---
name: NMP LLE residual qualification boundary
description: Governance boundary between a numerically accepted Stage 1 split and qualification of the amended six-component equilibrium model.
---

An evidence-fitted residual excess-Gibbs correction may produce a genuine, stable, material-balanced Stage 1 two-liquid split while the full model remains `NOT_QUALIFIED`. Never treat split-derived compositions, K values, recovery, carryover, or extraction as validated process design unless the frozen blind LLE composition criterion also passes.

**Why:** The amended COSMO-SAC route passed TPD, Gibbs reduction, isoactivity, post-split stability, and balance checks at the design point, but both complete-temperature and complete-molecular-system holdouts exceeded the frozen 0.03 composition RMSD ceiling. Numerical validity at one design charge is not predictive qualification.

**How to apply:** Keep the model identity separate from unmodified COSMO-SAC, retain `CALIBRATION_REQUIRED`, PA-provisional, sulfur-`NOT_CALCULABLE`, and non-release labels, and require direct full-mixture evidence before using the result in a counter-current stage design.

A later coupled counter-current calculation exposed negative directional curvature around the amended model's stationary phase compositions at both 25°C and 50°C. Treat the earlier flash as an activity-equality stationary split, not a locally stable accepted phase pair, until a full tangent-space Hessian or independently seeded post-split TPD analysis resolves this conflict.

**Why:** The original coarse-simplex TPD search and its remote refinement seeds did not test sufficiently small perturbations around each returned phase. The counter-current study's deterministic local screen found materially negative curvature despite excellent activity and balance closure.

**How to apply:** Do not infer thermodynamic stability from chemical-potential equality, material balance, or Gibbs reduction alone. Include local perturbation or Hessian directions around each returned phase in every future acceptance gate.