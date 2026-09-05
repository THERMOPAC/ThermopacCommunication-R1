---
name: Pre-pilot Kühni hydraulic chain
description: Governance boundary for a separately versioned predictive d32-to-diameter screening model.
---

A pre-pilot Kühni hydraulic screening diameter may be calculated without new
experimental data by chaining an explicit-viscosity breakup model, closed
fluid-sphere drag, Kühni characteristic velocity, swarm/holdup, and a
turning-point capacity solve. Every result remains `CALCULATED_EXTRAPOLATED`
unless the complete chain is independently qualified.

Geometrically similar diameter iteration must use a declared scale-up law.
Constant compartment `P/V` is admissible and requires `N ∝ D^(-2/3)`. Holding
RPM constant while scaling rotor diameter is physically invalid because
specific power grows as `D²` and creates artificial micron-scale breakup.

Stator free area belongs in the characteristic-velocity/internal-geometry
model. Do not also divide shell area by that fraction when computing shell
superficial velocity, or the restriction is counted twice.

Garthe Eq. 8.3 has a square root over the complete
`[Cd(Re_char)/Cd(Re_swarm)](1-h)^4.65` product. Plain-text extraction can omit
the radical; use the rendered equation page and its iteration flowchart as the
authority.

Calabrese's `0.97 N³L²` is the source Rushton correlation's mean dissipation
estimate, not the saved Kühni compartment value `P/(ρV)`. Both scale as
`N³D²` under geometric similarity but differ by a constant geometry/power
factor. Preserve and label both quantities separately; never relabel the
Calabrese value as the Kühni engineering `P/(ρV)`.

**Why:** The equation chain closes with finite roots using exact Stage-1
properties, but naive fixed-RPM scaling produced enormous artifact diameters.
Two independent swarm formulations agreed closely once the physically coherent
constant-P/V scale-up was applied. OCR of the swarm equation also created a
false missing-radical diagnosis until checked against the rendered source.

**How to apply:** Implement only in a new immutable pre-pilot kernel. Preserve
`KUHNI_PHASE1_V1.0.3` byte-for-byte, expose scale-up and flood-fraction
scenarios, and keep validation status separate from calculability.