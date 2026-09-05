---
name: Project 236 deformed-drop gate
description: Governance boundary for RRBO/NMP shape, drag closure, and hydraulic resizing release.
---

Project 236 may use the Myint 2006 liquid-drop drag relation with Myint 2007
clean-drop and Wellek contaminated-drop shape diagnostics as a controlled
pre-pilot closure only. At the frozen 50 °C basis, the unsupported Re=50 cutoff
is replaced by the published Myint drag gates, especially Re<200; the terminal
diameter boundary is about 2.98 mm. Preserve Garthe's square-root Eq. 8.3.

For the approved pre-pilot resolver, source-range exceedances at terminal,
characteristic, or swarm state remain explicit extrapolation metadata and do
not by themselves block numerical hydraulic calculation. They still prevent
claiming source-range support or release/vendor qualification.

Only trials classified `CALCULATED_IN_RANGE` may appear in the Stage-3 result
envelope or determine its displayed hydraulic diagnostic diameter. Calculated
extrapolated trials remain in the immutable audit payload but are excluded from
engineering result display and selection.

Column resizing and release sizing still fail closed unless the exact
process-property basis has qualified the nonterminal characteristic and
swarm-slip use of the drag curve, demonstrated a consistent interface branch,
and received explicit optimizer approval. A finite terminal or hydraulic root
does not satisfy these release gates.

**Why:** Myint 2006 directly covers liquid drops up to viscosity ratio 100 and
provides Cd(Re,kappa,interface) through Re<200; Myint 2007 covers the Project
Morton number and viscosity ratio for clean-drop shape. In Garthe Eq. 8.3 the
Myint viscosity/interface prefactor cancels if one interface branch is
unchanged. However, both Myint studies validate isolated terminal drops, not
forced characteristic or swarm-slip states in an agitated Kühni compartment.

**How to apply:** Evaluate and persist every published Myint drag and shape gate
at the appropriate local state; bracket interface sensitivity, never invent a
shape multiplier, and label every out-of-range state extrapolated. Keep
extrapolated numerics audit-only: exclude them from the visible envelope and
diagnostic selection. Fail closed for nonphysical or missing dependencies.
Bind all values to the active property snapshot and never transfer the 50 °C
boundary unchanged.