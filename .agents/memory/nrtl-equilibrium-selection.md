---
name: NRTL equilibrium selection evidence
description: Scientific boundary for claiming reproducible equilibrium selection from non-convex NRTL flash multistarts.
---

Treat the selected equilibrium as the lowest admissible reduced-Gibbs candidate found by the declared deterministic multistart procedure, not as a mathematically certified global minimum over the continuous composition domain.

**Why:** Non-convex NRTL flashes can converge to materially different stationary points. Reordering one candidate pool is a vacuous reproducibility check, an audit with zero eligible candidates cannot pass, and exact phase-swapped seeds are one physical start rather than independent evidence. Independent starts must be polished against the chemical-potential equality equations and at least two phase-swap-invariant, physically separated seed states must reproduce the same canonical equilibrium within frozen tolerances.

**How to apply:** Preserve all competing candidates and explicit rejection reasons. Require component closure, interiority, isoactivity/KKT closure, and Gibbs decrease before objective ranking. Keep the finite-candidate qualification and “not formal proof” disclaimer in audit language unless a separate certified global optimizer is introduced.

## Confirmed frozen-solver outcome

The isolated frozen-parameter solver passes the declared finite-candidate selection audit, but the fitted NRTL model still fails held-out topology and composition gates after the stricter selection.

**Why:** no refit occurred; the frozen hash was verified, independent synthetic/final-phase checks passed, and holdout execution followed prequalification. The stricter solver reduced topology recall and did not materially improve the largest tie-line error.

**How to apply:** treat flash-selection implementation as excluded within the tested procedure and tolerances, not formally globally certified. Retain the model-specific `REJECT` and six-family `NOT_CALCULABLE`; do not restore the earlier, less conservative holdout metrics.