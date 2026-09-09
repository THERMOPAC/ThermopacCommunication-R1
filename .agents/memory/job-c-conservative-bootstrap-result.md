---
name: Job C conservative bootstrap result
description: Records the scientific boundary reached by the direct bounded 189-equation continuation from a globally conservative positive seed.
---

The globally conservative, strictly positive feed-derived initialization now produces an accepted zero-transfer anchor at λ=0 using the full bounded 189-equation system. The first positive point, λ=1e-8, remains rejected after the full 240 optimizer evaluations and 25,680 actual residual evaluations. Its raw FV residual is 2.5620962132804214e-7 mol/s, above the unchanged 1e-7 gate. Scaled FV residual (2.683805409471311e-8) and the original Job B gate residual (7.817780704362128e-10) pass, and minimum flow remains positive (9.001874099922393e-11 mol/s). The dominant failure is dispersed-phase NMP FV closure across cells 1–7, led by cell 4. The accepted/rejected bracket is [0, 1e-8].

**Why:** This distinguishes a valid zero-transfer state from a usable positive-transfer branch. Positivity, scaled FV, and interface closure are not the blocker; raw dispersed-phase NMP finite-volume closure prevents admission of even the smallest configured positive λ.

**How to apply:** Treat λ=0 as an accepted numerical anchor only and the λ=1e-8 result as numerical nonconvergence, not process infeasibility. Do not claim a positive branch, λ=1 reachability, active height, compartments, efficiency, RPM, diameter, Job D, or release eligibility.