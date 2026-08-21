---
name: ECR-2 preliminary property closure
description: Governs the first-BVP physical-property approximation and its provenance, locality warnings, and fail-closed behavior.
---

For the first preliminary ECR-2 BVP, local physical-property resolution is deliberately composition-independent: use pure-NMP EPD density/viscosity at operating temperature; selected RRBO-grade density at temperature (or an explicit provenance-tagged engineer fallback); and explicit operating-temperature engineer inputs for RRBO viscosity, NMP/RRBO interfacial tension, and both-phase diffusivities for Sat/Mono/Di/Poly/NMP.

No density, viscosity, interfacial-tension, or diffusivity mixing/blending correlation may be inferred merely because local phase compositions change.

**Why:** a transparent frozen preliminary basis is more honest than unsupported pseudo-local thermophysical models, while local composition, equilibrium, hydrodynamics, and mass-transfer calculations can still be recalculated compartment by compartment.

**How to apply:** obtain every future BVP compartment's properties through the deterministic closure contract. Preserve the composition-dependence warnings in results, reject missing/non-positive/provenance-free inputs without fallbacks, retain the five-component order, and reassess any new local property model as a separately governed change.