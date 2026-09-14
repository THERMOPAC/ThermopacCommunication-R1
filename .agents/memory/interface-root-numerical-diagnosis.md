---
name: Interface-root numerical diagnosis
description: Distinguish an optimizer's nonzero-residual minimum from a physically inadmissible interface.
---

Do not infer incompatible feeds or physical infeasibility from optimizer success followed by interface-equation residual rejection.

**Why:** The trust-region reflective method reported success on all inlet starts while missing the interface equations substantially. A bounded dogbox/Jacobian-scaled strategy found independently reproduced, stable roots under the same inputs, bounds, equations and acceptance gates.

**How to apply:** Inspect per-start original residuals, rank and phase checks before interpreting stability. Stability that was never evaluated is NOT EVALUATED, not failed. Qualify numerical-strategy changes against every original reproduction and stability gate, not a weaker research aggregate.

Replay actual assembler-produced requests, not only hand-reconstructed mathematically equivalent inputs.

**Why:** Uniform zero-transfer states are analytically mesh-independent, but finite-volume assembly produced distinct coarse/refined floating-point requests. An approximate reconstruction cannot establish bitwise production qualification.

**How to apply:** Capture full request/response pairs with immutable hashes and compare measured differences. Preserve baseline executed evidence; record corrected interpretations separately. An accepted local root permits a bounded column trial, not an accepted column size.

Qualify runtime optimizations by separating scientific-payload equivalence from implementation identity.

**Why:** A response digest includes the worker's provenance. Changing a worker intentionally changes that digest even when every scientific output and acceptance diagnostic is identical; requiring the historical digest would reject legitimate optimizations or encourage false identity claims.

**How to apply:** Preserve and validate both authentic raw responses. Match their exact request identities, then compare scientific payloads after excluding only explicitly justified changed implementation-identity fields. Never discard acceptance diagnostics, substitute an old worker hash, or interpret a local speedup as a full-column speedup.

Establish frozen coarse-mesh whole-column convergence before further runtime optimization.

**Why:** The user explicitly prioritized global convergence after qualified, faster local roots still failed to establish a converged column. Successful cell solves and small local residuals do not demonstrate coupled-column closure.

**How to apply:** Freeze one geometry, coefficient, model and all existing gates; retain whole-iteration states and residuals. Reproduction must start from an a priori admissible alternative, never the first converged endpoint. Distinguish conservation enforced by construction from independently evaluated closure. Refinement, sensitivity, sizing acceptance and subsequent performance optimization remain separate.

When replacing the outer column iteration, preserve the original update-gate meaning separately from the new algorithm's accepted step size.

**Why:** A trust radius or backtracking can make a step arbitrarily small without closing the column equations. Keeping the original damped-map check at the freshly evaluated state prevents a numerical-method change from silently weakening acceptance.

**How to apply:** Require actual constitutive closure and the original update check at the same qualified state. Use actual residual merit for step acceptance; never interpret a small safeguarded step or an incomplete local evaluation as convergence. Keep the new route isolated until independent-start frozen coarse qualification succeeds.