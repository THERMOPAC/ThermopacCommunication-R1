---
name: Job C conservative bootstrap result
description: Records the scientific boundary reached by the direct bounded 189-equation continuation from a globally conservative positive seed.
---

The globally conservative, strictly positive feed-derived initialization produces an exactly reproducible accepted zero-transfer anchor at λ=0 using the full bounded 189-equation system. Its raw FV residual is 7.061318125885234e-8 mol/s, scaled FV residual is 2.7674847962424294e-8, original Job B residual is 5.985584983613899e-10, and minimum flow is 2.5360878152434716e-10 mol/s.

The positive branch is now independently accepted at λ=1e-10, 3e-10, 1e-9, 3e-9, and 1e-8. Every point passed two fresh full evaluations of the unchanged equations and all raw FV, scaled FV, original Job B/interface, and strict-positivity gates.

At λ=1e-8, the accepted raw FV residual is 8.944099492951955e-8 mol/s, scaled FV residual is 9.368977822772655e-9, original Job B/interface residual is 3.6525498181561034e-9, and minimum flow is 2.492298138377343e-11 mol/s. A later search above λ=1e-8 produced no additional accepted checkpoint before the user stopped the run. Because the run was cancelled rather than scientifically completed, it establishes no rejected upper bracket and no physical-infeasibility conclusion.

**Why:** The prior conclusion that λ=1e-8 failed is stale. Solver-only correction plus smaller accepted continuation steps proved a reproducible positive branch without changing equations, tolerances, or gates. The unbounded midpoint policy above that point consumed repeated full solves without persisting a higher accepted result.

**How to apply:** Treat λ=1e-8 as the highest currently accepted continuation anchor, not as λ=1 reachability or a physical-height result. Resume only from hash-validated accepted anchors and independently re-evaluate them. Bound future expansion with an explicit finite λ trial plan and persist the active λ and rejected bracket evidence. Do not claim active height, compartments, efficiency, RPM, diameter, Job D, physical infeasibility, or release eligibility.