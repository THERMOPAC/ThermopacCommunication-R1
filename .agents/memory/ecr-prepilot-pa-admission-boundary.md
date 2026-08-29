---
name: ECR Pre-Pilot PA admission boundary
description: Governing boundary for the selected polar-aromatics pseudocomponent and predictive cascade outputs.
---

The admitted PA anchor is 4,4′-bis(alpha,alpha-dimethylbenzyl)diphenylamine (CAS 10081-67-1), a non-sulfur alkylated-diphenylamine antioxidant. Identity admission does not admit thermodynamic behavior.

**Why:** No reproducible PA/NMP/heavy-hydrocarbon closure is available from the reviewed UNIQUAC, Dortmund, COSMO, or direct LLE routes. Borrowing DI/POLY parameters, unsubstituted diphenylamine, sulfur compounds, or zero-filled interactions would create unsupported predictions.

**How to apply:** Positive-PA feeds must return `POLAR_AROMATICS_THERMODYNAMIC_CLOSURE_UNAVAILABLE`. Six-component predictive stage count and full-basis recovery remain `NOT_CALCULABLE`; PA partitioning must never imply sulfur removal. Zero-PA SAT/MONO/DI/POLY/NMP calculations may continue.