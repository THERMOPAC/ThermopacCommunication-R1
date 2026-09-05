---
name: ECR mass-transfer admission
description: Fail-closed prerequisites for calculating physical Kühni compartments and active height.
---

Never derive physical compartments by dividing theoretical stages by an
assumed efficiency. A rate-based compartment solve determines the integer
physical count, and local/overall efficiencies are reported only afterward.

Use a valid calculated Stage-2 theoretical stage count whenever available.
Only when it is unavailable, use exactly \(N_T=7\) with
`PRE_PILOT_DESIGN_DEFAULT` provenance and generate the corresponding ideal
seven-stage duty with the pinned Stage-2 thermodynamic engine.

Physical-height calculation requires all of the following:

- a matching local interfacial-equilibrium contract; theoretical-stage
  authority may be calculated Stage 2 or the explicit fallback above;
- operating-point hydrodynamics, including operating holdup and contact-time
  information, distinct from flood-point capacity quantities;
- a documented multicomponent diffusion/reference-frame contract and
  conserved component mapping;
- governed ECR hardware compartment pitch and bounded height limits;
- independently identified axial mixing/backflow.

Solver qualification must re-evaluate every closure on the final state. Require
independent constitutive residuals, both-phase mixing conservation, normalized
equilibrium, and an enforced zero-sum diffusive molar-flux frame. A balance
residual reconstructed from the solver's own transfer vector is tautological
and cannot prove closure.

The immutable result basis includes the complete duty-acceptance contract,
closure and parent hashes, and the exact Stage-3 trial identity. Changing the
duty target or tolerance must change the result hash even if the same design is
selected.

Documented correlation extrapolation and lack of pilot validation do not block
pre-pilot predictive calculation. They must be visible as applicability,
validation-state, provenance, and uncertainty flags. They still block release
qualification where the release standard requires validation.

Sulfur may calculate from a species-resolved predictive route even when
extrapolated or unvalidated. Aromatic transfer cannot proxy sulfur duty.

The final RPM is selected without user discretion from the feasible grid using
the frozen governed ordering: minimum active volume, then shaft power, then
lower RPM, then trial ordinal. That trial fixes physical compartments and
active height.

**Why:** Flood-point holdup cannot define operating interfacial area, assumed
efficiency hides the rate physics, and pilot-validation status must not be
confused with whether a documented predictive model can execute. Reconstructed
balances can appear exact while the final constitutive state remains stale or
unclosed, and an unhashed duty contract makes replay ambiguous.

**How to apply:** Block only missing equations, required variables, or model
closure. Otherwise calculate with flags and propagated uncertainty. Stage 3
calculates operating holdup at every RPM/local load. Search integer
compartments with hydraulic revalidation, then apply the governed final-RPM
selection.

The approved operating-holdup basis is the frozen Stage‑3 residual
\(F(\phi_d)=v_{\mathrm{char}}(\phi_d)-[j_D/\phi_d+j_C/(1-\phi_d)]=0\).
Use the stable low-holdup root below flooding; never substitute flood holdup.