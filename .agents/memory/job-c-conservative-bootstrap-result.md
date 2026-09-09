---
name: Job C conservative bootstrap result
description: Records the scientific boundary reached by the direct bounded 189-equation continuation from a globally conservative positive seed.
---

The globally conservative, strictly positive feed-derived initialization produces an exactly reproducible accepted zero-transfer anchor at λ=0 using the full bounded 189-equation system. Its raw FV residual is 7.061318125885234e-8 mol/s, scaled FV residual is 2.7674847962424294e-8, original Job B residual is 5.985584983613899e-10, and minimum flow is 2.5360878152434716e-10 mol/s.

The first positive point, λ=1e-8, remains rejected after the full 240 optimizer evaluations and 25,920 actual residual evaluations. Its terminal raw FV residual is 2.5164724168260183e-7 mol/s, above the unchanged 1e-7 gate. Scaled FV residual (2.636014311272009e-8) and the original Job B gate residual (1.0337816871981654e-9) pass, and minimum flow remains positive (4.690188972715594e-10 mol/s). The terminal NMP combined FV imbalance is 1.307444680825425e-6 mol/s.

The terminal 189×189 Jacobian is numerically rank 184 with condition number 1.5105028367259292e25. No coordinate is active or near a bound, so bound contact is not the explanation. The diagnostic Gauss-Newton correction norm is 2.8077016844749225e-6 with predicted residual L2 6.517657958344117e-8; this is diagnostic only and is not an accepted corrected state. The accepted/rejected bracket remains [0, 1e-8].

**Why:** This distinguishes a valid zero-transfer state from a usable positive-transfer branch. Positivity, scaled FV, interface closure, and bound distance are not the blocker; raw NMP finite-volume closure plus severe rank deficiency/conditioning prevents admission of even the smallest configured positive λ.

**How to apply:** Treat λ=0 as an accepted numerical anchor only and λ=1e-8 as numerical nonconvergence, not process infeasibility. A predicted linear correction is not a qualifying candidate until a corrected state passes two fresh full evaluations and every unchanged gate. Do not claim a positive branch, λ=1 reachability, active height, compartments, efficiency, RPM, diameter, Job D, or release eligibility.