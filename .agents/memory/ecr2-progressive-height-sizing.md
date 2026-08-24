---
name: ECR-2 progressive height sizing
description: Fail-closed physical-height search requirements for the ECR-2 counter-current BVP.
---

Physical ECR-2 height is determined only by a bracketed search of complete, accepted BVP evaluations against the explicitly sourced `hydrocarbon_only_physical_outlet` raffinate target. The search must reject a missing target provenance, an unaccepted BVP/global balance, an unattained target, or any increase in residual across the full ordered set of accepted trial heights.

**Why:** A local root or a target copied from a surrogate/LLE basis cannot establish a defensible equipment height; an apparent minimum can also be invalidated by a later non-monotone trial.

**How to apply:** Treat `Δz_max` only as a numerical mesh cap. For every physical H trial, rebuild all H-dependent agitation and direct-turbulence inputs from the physical geometry, while local BVP volume continues to use the numerical axial cell. Installed power and physical rotor count must also remain independent of cell count. When the governed target is absent or ambiguous, persist `NOT_CALCULATED` and do not run a sizing BVP; a manual height is permitted only under a clearly separate Performance Simulation label. Never feed a Stage 7 height or its numerical cell size back as the physical sizing basis.