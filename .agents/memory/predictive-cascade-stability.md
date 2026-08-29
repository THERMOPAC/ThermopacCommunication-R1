---
name: Predictive cascade stability
description: Numerical and persistence rules that keep progressive predictive cascade runs stable and recoverable.
---

Use bounded three-component molar-flow vectors as the outer cascade state, updated by reverse directional sweeps with fixed damping and continuation from the converged lower-stage profile. Do not damp phase flow and normalized composition independently.

**Why:** Independent flow/composition damping creates materially inconsistent intermediate states. The simpler component-flow formulation was stable through both original ten-stage frozen-flash benchmarks; higher stages needed a larger fail-closed sweep budget rather than acceleration or looser tolerances.

**How to apply:** Keep thermodynamic artifacts, convergence and balance tolerances, and saved inputs frozen. Persist each completed stage plus its converged component-flow continuation state with exact canonical payload/trial hashes, and require a database-commit ACK before beginning the next stage. On reclaim, verify the full prefix and immutable input/model/composite-engine identity before resuming at N+1; a final-stage checkpoint must finalize without rerunning. Duplicate replay must hash-match the stored checkpoint, and a final result must match the acknowledged sequence.