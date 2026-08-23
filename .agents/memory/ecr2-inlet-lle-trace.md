---
name: ECR-2 inlet LLE trace
description: Governs the saved run-level NRTL flash at the selected ECR-2 operating condition.
---

Run one inlet-material-basis NRTL LLE flash for every ECR-2 calculation at exactly Stage 4 Extraction Temperature (`T_K = T_C + 273.15`). Persist the overall feed, initial guesses, phase result, convergence/triviality status, model identity, temperature validity, and diagnostic even when it is not a usable two-phase split.

**Why:** This gives an auditable, temperature-specific thermodynamic trace without incorrectly treating a whole-column inlet flash as a substitute for the BVP's composition-dependent compartment-local equilibrium calculations.

**How to apply:** A C2 handoff may provide the canonical feed composition and provenance but must not override Stage 4 temperature. Classify flash failure, non-convergence, or trivial/single-phase results explicitly; preserve them as diagnostics and do not convert them into performance or release claims.