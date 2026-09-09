---
name: Job C conservative bootstrap result
description: Records the scientific boundary reached by the direct bounded 189-equation continuation from a globally conservative positive seed.
---

The globally conservative, strictly positive feed-derived initialization produces an exactly reproducible accepted zero-transfer anchor at λ=0 using the full bounded 189-equation system. Its raw FV residual is 7.061318125885234e-8 mol/s, scaled FV residual is 2.7674847962424294e-8, original Job B residual is 5.985584983613899e-10, and minimum flow is 2.5360878152434716e-10 mol/s.

The positive branch is now independently accepted at λ=1e-10, 3e-10, 1e-9, 3e-9, and 1e-8. Every point passed two fresh full evaluations of the unchanged equations and all raw FV, scaled FV, original Job B/interface, and strict-positivity gates.

At λ=1e-8, the fresh bounded replay accepted raw FV residual 8.944099492917184e-8 mol/s, scaled FV residual 9.368977822736233e-9, original Job B/interface residual 3.739961229598521e-9, and minimum flow 2.492298138377343e-11 mol/s.

The finite search then independently rejected λ=3e-8, 2e-8, 1.5e-8, and 1.25e-8 after two exactly repeatable full evaluations at each point. The final λ=1.25e-8 trial failed only the raw FV gate (1.430890869661323e-7 mol/s); scaled FV (1.498863561975006e-8), Job B/interface (1.748135560554776e-9), and strict positivity (minimum flow 1.0155031268110552e-10 mol/s) passed. The governed numerical bracket is therefore λ=1e-8 accepted / λ=1.25e-8 rejected.

**Why:** The prior conclusion that λ=1e-8 failed is stale. Solver-only correction plus smaller accepted continuation steps proved a reproducible positive branch without changing equations, tolerances, or gates. The bounded replay then established a reproducible upper rejection rather than consuming unlimited midpoint solves.

**How to apply:** Treat λ=1e-8 as the highest accepted continuation anchor and λ=1.25e-8 as the rejected upper numerical bound. This is not λ=1 reachability, physical-height acceptance, or physical infeasibility. Do not claim compartments, efficiency, RPM, diameter, Job D, or release eligibility.