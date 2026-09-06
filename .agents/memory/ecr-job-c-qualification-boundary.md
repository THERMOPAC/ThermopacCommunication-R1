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