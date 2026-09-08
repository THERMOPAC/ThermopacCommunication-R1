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

A terminal frozen-source Picard boundary must be probed with the original
bounded coupled FV/interface equations before it is persisted. Failure of that
probe remains numerical positive-feasibility uncertainty, not process
infeasibility.

**Why:** A frozen source field can require negative solvent flow even though a
joint solution is free to move all bulk states and local interface fluxes
together. Treating the frozen root as decisive would overstate the evidence.

**How to apply:** Preserve the last accepted and first rejected continuation
values, source-refresh mismatch, bounded coupled residual blocks, and the
unconstrained frozen-flow diagnostic. Keep every original acceptance gate and
emit no design or release claim when coupled positive feasibility is unresolved.

The signed counter-current balances use positive flux for
continuous-to-dispersed transfer. Their integrated outlets are continuous feed
minus total transfer and dispersed feed plus total transfer. The recorded
Stage-2 feed-end local contact and the two opposite global column inlets are
different states and must never be treated as one interchangeable interface
boundary.

**Why:** The Stage-2 local contact has an independently reproduced, stable branch
with positive NMP and H₂O transfer into fresh zero-solvent RRBO. Continuing that
branch to the current zero-transfer initialization—which artificially pairs
fresh wet NMP with fresh RRBO as one repeated local contact—converges to negative
NMP and H₂O transfer. The global feeds enter opposite ends of the column, so this
is a homotopy incompatibility, not a physical infeasibility verdict.

**How to apply:** Qualify the Stage-2 local-contact branch with the separately
versioned Job-C qualifier. Keep the frozen Job-B worker and artifact as pinned
engine lineage only; never call its solver or consume its flux in Job C. Consume
the governed NMP/H₂O inlet inventory literally: exact zeros remain exact zeros,
while approved traces must not be rejected or replaced. Any continuation must
avoid pairing opposite global inlets as a physical local interface and must
retain unchanged raw/scaled, stability, TPD, and exact-zero tangent-cone gates
for components that are literally absent.

A seven-cell profile rebinned from Stage-2 feed-end coordinates must be reversed
at the bin level before assignment to Job-C numerical cells. Stage-2 position 1
is the dispersed RRBO inlet, while Job-C cell 1 is the continuous NMP inlet
because its finite-volume faces are anchored by \(f_c[0]\) and \(f_d[m]\).

**Why:** Assigning ascending Stage-2 positions directly to ascending Job-C cells
put every qualified contact at the opposite end of the column. That mapping
falsely produced a no-positive-continuation result. With the corrected axial
orientation, the same design passes the positivity interval gate and proceeds
to a later fail-closed local-flux Picard nonconvergence at the 2 m candidate.

**How to apply:** Form deterministic equal contiguous bins in ascending
Stage-2 feed-end order, then reverse only the bin sequence for worker cells.
For ten source positions and seven numerical cells, require exactly
\([9,10],[8],[6,7],[5],[3,4],[2],[1]\). Bind this orientation rule, the exact
partition, the profile, and the source snapshot to the immutable hash. Never
reuse an earlier no-positive-interval result produced from ascending cell
assignment as scientific evidence.

Job C uses exactly seven numerical FV cells. A pinned Stage-2 axial record may be
rebinned only when it has at least seven complete ordered contacts; each source
contact must appear exactly once in the governed equal contiguous bins. Never
repeat sparse contacts or alter bin widths to manufacture a seven-cell profile.

**Why:** The one-stage Stage-2 fallback is a valid thermodynamic boundary source,
but it contains no governed axial information. Repeating it seven times would
invent a spatial profile and could create a false continuation or height claim.

**How to apply:** Bind the complete mapped profile and its authority metadata to
one canonical hash. Validate phase/component identity, source ordinal coverage,
mapping rule, and hash before any expensive qualification. If fewer than seven
contacts exist, dependency-block profile preparation with no height claim.

Boundary compatibility must be qualified at the last positive local
continuation state, not inferred solely from a global inlet root or frozen-flux
outlet audit.

**Why:** A finite frozen-flux diagnostic can establish incompatibility of one
root/boundary pairing, but cannot prove that all local-state transport branches
are physically infeasible.

**How to apply:** Replay accepted roots and inlet-derived exploratory basins at
every local cell with unchanged rank, stability, TPD, reproduction, and residual
gates. If none yields a distinct credible branch, keep Job C blocked until
evidence changes the phase-resolved inlet representation and its immutable
Stage-2 boundary hash.

Job-C response hashing is shared between Python and TypeScript and therefore
uses bytewise lexicographic key ordering, not locale-aware comparison.

**Why:** Locale-aware ordering diverged from Python when diagnostic keys shared
the same lowercase prefix but differed by an uppercase character, invalidating
an otherwise correct worker response.

**How to apply:** Any new cross-runtime canonical hashing must use the same
ASCII/Unicode code-point ordering on both sides and include a mixed-case key
regression vector.

Deadline regression evidence is separate from thermodynamic qualification.
Fast fault injection may isolate optimizer routing and terminal serialization,
but must never be treated as evidence that a physical branch converges.

**Why:** A real scientific replay may stop at an earlier governed boundary and
never exercise a later timeout path, regardless of how long the replay runs.

**How to apply:** Use controlled test-process clocks and optimizer doubles for
deadline coverage, retaining the real worker routing, exception handling, and
cross-language response hash. Keep scientific replay as separate evidence and
do not add request-controlled fault switches to governed job inputs.