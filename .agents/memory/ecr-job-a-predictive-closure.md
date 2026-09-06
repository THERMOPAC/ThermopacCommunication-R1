---
name: ECR Job-A predictive closure
description: Frozen evidence boundary for the seven-component pre-pilot diffusivity and K&H film-coefficient route.
---

Use the Laitinen 2019 equation-level K&H base/single-drop route for pre-pilot
Stage 4. It contains neither the column holdup correction nor the unresolved
\(C_1\psi/C_2\psi\) enhancement. Never encode a synthetic Kühni \(C_2\).

DI and PA normal-boiling molar volumes may use exact-identity Joback critical
volumes followed by the unit-bound Tyn-Calus relation. These are estimated
properties and must not be represented as measured boiling behavior.

The executable fallback is componentwise Wilke-Chang using each local phase's
viscosity and composition-average molecular weight, the documented
other/unassociated factor of one, and the water-solute correction. Evaluate
all seven components in both phases and retain predictive, extrapolation,
pilot-validation, and release-eligibility flags.

**Why:** The actual-Kühni accepted manuscript resolves the base equation
typography, and exact Joback group accounting closes the two missing molecular
volumes without fabricating a \(C_2\) or substituting representative identities.

**How to apply:** Keep the production implementation separate from the legacy
five-component BVP. Consume frozen Stage-3 hydrodynamics rather than
recalculating power, drop size, holdup, or slip velocity in Stage 4.

Job B must not start immediately after implementation. First produce and pass a
Job-A implementation verification report covering numerical replay for all
seven components in both phases, dimensional closure, deterministic
hashes/provenance, and affirmative proof that no legacy five-component
calculation path was invoked.