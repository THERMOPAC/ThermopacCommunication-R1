---
name: K&H 1999 preliminary local kernel boundary
description: Rules for using governed K&H 1999 secondary equations as local preliminary engineering calculations without design-prediction claims.
---

The governed secondary K&H 1999 equation structures are authorized only for
**Published Correlation — Preliminary Engineering** local-compartment physics.
Every K&H-dependent numerical result must retain `primarySourceVerified=false`,
`validatedForRRBONMP=false`, and `pilotCalibrationStatus=NOT_YET_VALIDATED`.

Use the registry-scoped Kühni continuous-side \(C_1=7.5\) only. Never use the
project provisional \(C_1=0.90\), \(C_2=0.45\), or pulsed-column \(C_2=4.33\).
The dispersed-side equation may run only with a provenance-tagged,
engineer-entered Kühni \(C_2\). Treat
\(\psi=(P/V)/\rho_{\text{mix,phase1}}\) as the Thermopac preliminary
interpretation, not primary-source verification.

Each local evaluation must derive Re, Sc, \(\kappa\), film coefficients, and
\(a=6\phi/d_{32}\) from one coherent local input set; do not reuse a stale
snapshot value. An explicitly engineer-approved governed concentration
partition basis is still required for the two-film overall coefficient, Koa,
driving force, and transfer rate. No BVP, axial propagation, outlet
prediction, optimizer, or UI is implied by this local capability.

**Why:** The engineering decision accepts the governed secondary evidence for
transparent preliminary local calculations, while retaining hard boundaries
against symbol collisions, unsupported design claims, and implicit
partition/rate assumptions.

**How to apply:** Preserve independent output statuses: missing C2 blocks only
Sh_d and its descendants; missing partition approval blocks only the overall,
Koa, driving-force, and rate layer. Never substitute missing inputs or broaden
these scopes silently.