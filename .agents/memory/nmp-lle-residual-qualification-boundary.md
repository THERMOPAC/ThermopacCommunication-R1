---
name: NMP LLE residual qualification boundary
description: Governance boundary between a numerically accepted Stage 1 split and qualification of the amended six-component equilibrium model.
---

An evidence-fitted residual excess-Gibbs correction may produce a genuine, stable, material-balanced Stage 1 two-liquid split while the full model remains `NOT_QUALIFIED`. Never treat split-derived compositions, K values, recovery, carryover, or extraction as validated process design unless the frozen blind LLE composition criterion also passes.

**Why:** The amended COSMO-SAC route passed TPD, Gibbs reduction, isoactivity, post-split stability, and balance checks at the design point, but both complete-temperature and complete-molecular-system holdouts exceeded the frozen 0.03 composition RMSD ceiling. Numerical validity at one design charge is not predictive qualification.

**How to apply:** Keep the model identity separate from unmodified COSMO-SAC, retain `CALIBRATION_REQUIRED`, PA-provisional, sulfur-`NOT_CALCULABLE`, and non-release labels, and require direct full-mixture evidence before using the result in a counter-current stage design.