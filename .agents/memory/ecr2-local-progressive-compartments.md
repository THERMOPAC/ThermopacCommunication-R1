---
name: ECR-2 local progressive compartments
description: Governing rule for the independent 30% local-equilibrium physical-compartment calculation.
---

The ECR-2 local progressive physical-compartment calculation is independent from
the existing rate-based BVP. It starts at one 0.25 m physical compartment and
increments only by complete 0.25 m compartments. Each compartment must freshly
recompute its local NRTL equilibrium and apply 30% of the resulting equilibrium
component-flow change while conserving every component across both phases.

An upstream C2 theoretical-stage result is reference-only for ECR-2 unless its
counter-current ideal-stage cascade demonstrably minimizes against the same
hydrocarbon-only physical raffinate product specification. It must not be
reported as established ECR-2 `N_T` merely because it is auto-calculated in C2.

**Why:** A global `0.70^n` shortcut, `Ncomp = N_T / 0.30`, or a fixed
minimum-height rule would misrepresent the changing local counter-current
equilibrium and could hide recovery losses. The rigorous C2 theoretical-stage
value is a separate traceable result, not a compartment-count conversion.

**How to apply:** Solve both RRBO and fresh-NMP boundary conditions by
counter-current sweeps; require local convergence, component/global mass
balance, product quality, and at least 95% NMP-free RRBO recovery at the same
point. Stop as soon as recovery fails before acceptance and retain the
diagnostics without selecting a height. Keep `H_progressive,30%` and `H_BVP`
separate; a D/H candidate is feasible only when both independent paths pass.
Keep ECR-2 `N_T` as `NOT_ESTABLISHED` pending a same-specification ideal-stage
cascade, while retaining any C2 number only as labeled provenance.