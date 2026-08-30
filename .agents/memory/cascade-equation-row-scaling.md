---
name: Cascade equation row scaling
description: Numerical rule for mixed component-balance and isoactivity cascade systems.
---

For square counter-current cascade systems that combine scaled component balances with log-isoactivity equations, diagnose Jacobian row norms before treating slow multistart closure as branch evidence. A row-equilibrated damped Newton step may be used as solver preconditioning, but closure and branch agreement must always be evaluated with the original, unweighted equations.

**Why:** A full-rank, bound-inactive cascade lineage can stall under sparse and dense trust-region budgets when equation-row norms differ by several orders of magnitude. Row equilibration can recover the already-established branch without changing equations, thermodynamics, or acceptance limits.

**How to apply:** Persist rank, conditioning, row/column norm ranges, active bounds, raw residuals, and boundary-product differences. Preserve exhausted solver metadata as exhausted rather than relabeling those iterates successful. Never infer a phase-stability cause from this numerical behavior.