---
name: ECR Job-C qualification boundary
description: Governance for preliminary axial transport, height claims, and terminal blocked outcomes.
---

Job C uses fallback \(N_T=7\) only as numerical control-volume resolution when
no valid calculated Stage-2 count is available. It is not an assumed efficiency
or an independently demonstrated physical stage count.

**Why:** The axial model was authorized before Stage-2 acceptance, but not as a
shortcut around thermodynamic or hydraulic evidence.

**How to apply:** Build global inlet component molar flow rates from the frozen
Stage-3 flow-time basis and validate their compositions against the pinned
Stage-2 global boundary streams. Keep Stage-3 holdup limited to phase volume and
interfacial area.

Candidate local interface solves may generate a conservative transport
candidate, but they make no stability claim. A height becomes calculated only
after every final compartment passes unchanged full Job-B multistart, rank,
orientation, stability, and TPD gates; exact fluxes must then close the original
raw/scaled cell and global balances at the same reported height and state.

**Why:** Repeated exact Job-B calls are too expensive inside tentative nonlinear
iterations, but using candidate fluxes as final evidence would silently weaken
the admitted thermodynamic standard.

**How to apply:** Run Job C as a persisted, cancellable, lease-reclaimable
background calculation with immutable dependency evidence. A closed
zero-transfer baseline does not establish nonzero-transfer viability. If
continuation, exact local replay, positivity, recovery, or balance gates fail,
persist a scientific `blocked` outcome with diagnostics and emit no height,
efficiency, final RPM, Job D, sulfur-removal claim, or release eligibility.

The current nominal formulation is a square monolithic system over the FV mesh:
two phases × seven components × seven cells for local flows, plus thirteen
unchanged interface unknowns per cell. The equation set is the corresponding
original conservative FV balances plus frozen Job-B interface equations.

**Why:** Nested interface/transport iteration hid the coupled residual structure.
The monolithic benchmark showed that log-flow coordinates also lock components
that start absent from one phase because their transformed sensitivity vanishes
near zero.

**How to apply:** Use directly bounded positive molar-flow coordinates for
components that may enter an initially absent phase; retain simplex-safe
interface coordinates. Numerical predictors, scaling, damping, sparsity, and
continuation are initialization/solution aids only. Judge acceptance on the
unmodified equations, and report ranked equation blocks if the bounded solve
does not converge.

Before coupling the interface equations, require the positive bounded
frozen-flux FV subsystem to close. An unconstrained root may be calculated only
to identify which phase/component flows violate positivity; it must never seed
or qualify the coupled solve even when its residual closes.

**Why:** A nominal inlet-flux benchmark closed the frozen FV equations only by
making components absent from the dispersed inlet negative. Promoting that root
would hide a boundary/source-direction problem behind excellent residuals.

**How to apply:** Persist the bounded attempts, finite-difference sparsity audit,
and unconstrained negative-flow list as diagnostic evidence, then stop before
interface refresh. Do not call this physical infeasibility until the Job-B flux
orientation and counter-current boundary ownership are independently resolved.

Job-C response hashing is shared between Python and TypeScript and therefore
uses bytewise lexicographic key ordering, not locale-aware comparison.

**Why:** Locale-aware ordering diverged from Python when diagnostic keys shared
the same lowercase prefix but differed by an uppercase character, invalidating
an otherwise correct worker response.

**How to apply:** Any new cross-runtime canonical hashing must use the same
ASCII/Unicode code-point ordering on both sides and include a mixed-case key
regression vector.