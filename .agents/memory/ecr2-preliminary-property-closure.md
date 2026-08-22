---
name: ECR-2 preliminary property closure
description: Governs the first-BVP physical-property approximation and its provenance, locality warnings, and fail-closed behavior.
---

For the first preliminary ECR-2 BVP, local physical-property resolution is deliberately composition-independent: use pure-NMP EPD density/viscosity at operating temperature; selected RRBO-grade density at temperature (or an explicit provenance-tagged engineer fallback); the governed RRBO SN300 ASTM D341/Walther route for a 40°C viscosity anchor resolved at the actual operating temperature; and explicit operating-temperature engineer inputs for RRBO viscosity, NMP/RRBO interfacial tension, and both-phase diffusivities for Sat/Mono/Di/Poly/NMP. An explicit provenance-tagged engineer viscosity at operating temperature takes precedence over the governed route.

No density, viscosity, interfacial-tension, or diffusivity mixing/blending correlation may be inferred merely because local phase compositions change.

**Why:** a transparent frozen preliminary basis is more honest than unsupported pseudo-local thermophysical models, while local composition, equilibrium, hydrodynamics, and mass-transfer calculations can still be recalculated compartment by compartment.

**How to apply:** obtain every future BVP compartment's properties through the deterministic closure contract. Preserve the composition-dependence warnings in results, retain the temperature route's source/method/basis/warnings in the frozen snapshot, reject a grade without an eligible operating-temperature viscosity route rather than reusing a reference-temperature value, retain the five-component order, and reassess any new local property model as a separately governed change.