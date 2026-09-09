---
name: Job C conservative bootstrap result
description: Records the scientific boundary reached by the direct bounded 189-equation continuation from a globally conservative positive seed.
---

The globally conservative, strictly positive feed-derived initialization did not produce an accepted first continuation point. The direct bounded 189-equation solve stopped at bootstrap λ=1e-8 because raw FV residual was 5.464187506395162e-7 mol/s, above the unchanged 1e-7 gate. Scaled FV residual (5.723756942465699e-8) and the original Job B gate residual (1.7735319959772188e-9) passed, and minimum flow remained positive (4.900298703465986e-10 mol/s). No λ was accepted.

**Why:** This distinguishes the latest monolithic conservative-seed result from the older initialization architecture. It shows that positivity and the scaled/interface gates are not the blocker; raw finite-volume closure remains unresolved at the very first homotopy point.

**How to apply:** Treat the outcome as numerical nonconvergence, not process infeasibility. Do not claim λ=1 reachability, active height, compartments, efficiency, RPM, diameter, Job D, or release eligibility from this run.