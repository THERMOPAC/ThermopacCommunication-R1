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