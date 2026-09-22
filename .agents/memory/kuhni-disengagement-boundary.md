---
name: Kühni disengagement sizing boundary
description: End-section continuation must preserve active hydraulics and distinguish physical carryover from equilibrium composition.
---

End-section sizing must not re-optimize the frozen active column or treat proportional Stage-5 end-zone geometry as hydraulically qualified. Evaluate top and bottom independently; NMP compartment d32 cannot establish entrained RRBO droplet size after phase inversion.

**Why:** The user requires slip-versus-opposing-flow sizing, not arbitrary residence-time sizing, while preserving existing scientific authority. Thermodynamic dissolved solvent is not settleable droplet carryover, and a mean drop size does not establish capture efficiency.

**How to apply:** Trace the outlet-trial binding explicitly rather than equating adopted physical-design stage count with a thermodynamic trial. Without a measured droplet/carryover criterion, report inverse required capture size and conditional sensitivities. An explicitly requested preliminary proposal may select a capture duty and spatial allowances, but must distinguish those engineering selections from validated requirements and retain hydraulic/fabrication HOLD. Label phase-property proxies and velocity margins assumed.

An enlarged top's local settling-area PASS does not establish an integrated NMP return path through the narrower active-column throat.

**Why:** Fine drops can settle in the enlarged section but be swept upward again where the opposing continuous-phase velocity increases. A capture size selected for reliable small-deformation modeling is not evidence that the actual carryover distribution is bounded by that size.

**How to apply:** Check the full return path, including transitions and the unchanged throat. Do not credit coalescence, a collected-liquid downcomer or an external guard separator without qualifying its collection and return duties. Keep spatial-layout PASS separate from capture/entrainment HOLD, and include any additional separator equipment outside the vessel envelope explicitly.

Do not select top capture duty or separation equipment from an arbitrary fine-drop screening failure. Establish the relevance of that size to the dispersed-volume tail and physical entrainment first.

**Why:** The user explicitly rejected promoting the 500-µm sensitivity into a design duty. Published local Kühni number distributions, even at the last active stage, are not outlet flux distributions; rescaling a donor width to the calculated mean does not validate the RRBO/NMP tail.

**How to apply:** Report transferred distribution widths as conditional sensitivities, not expected fractions or confidence bands. Separate number, local-volume and one-way exit-flux weighting. Apply same-population moment bounds only to the population whose mean they describe; never use them as bounds on preferentially transported outlet fines. Retain the top as a layout reservation until this evidence supports a separation duty.

A full-bore positive-mean-slip flux is a surrogate, not the actual terminal-stator crossing population. Its no-interaction outlet baseline transmits all selected positive-velocity material eventually; finite-time delay is not removal.

**Why:** Stator jets and turbulent recrossings can export larger drops that subsequently return, while the full-bore kernel excludes them by construction. Assuming this kernel describes actual stator escape would omit a potentially important return mechanism.

**How to apply:** State the crossing plane, conserved solvent-volume/mass denominator, outlet and return boundaries. Keep fresh-distributor input separate from the terminal-origin cohort; track coalescence as conserved material redistribution, not disappearance.

Model the top as terminal crossings → jet/return exchange → quiet-zone evolution → lateral withdrawal. A droplet that becomes settling-eligible after jet decay has not necessarily returned.

**Why:** In a monotone one-dimensional decaying jet, the point where carrier speed equals settling speed is a stable trapping point for an overdamped drop. Genuine return needs cross-stream transport into a return path; reducing a full-section mean velocity at fixed area and flow also violates continuity.

**How to apply:** Separate return eligibility, actual external return and accumulated inventory. Use continuity-respecting spatial velocity fields and conservative inter-zone exchanges; never divide independently prescribed opening and bulk fluxes to infer a removal efficiency.

Spatial droplet benchmarks require direct velocity-boundary checks on the interpolated field used by the tracker, not only solver residuals and volume conservation.

**Why:** An unconstrained spline of a discretely clamped streamfunction can preserve divergence and section flux while introducing significant plate/wall slip. Return and contact probabilities are especially sensitive to this near-boundary error.

**How to apply:** Verify no-slip and prescribed inlet derivatives after reconstruction; localize the earliest contact/exit event. Preserve unresolved plate-contact volume separately from return. Refinement differences are sensitivity observations, not certified probability error bounds.

Quiet-zone coalescence needs physical local loading and an independently qualified merger efficiency. Surface interception cannot establish a draining NMP film.

**Why:** Normalized trajectory weights supply no collision clock. Gravity has no tangential component on the horizontal stator; contact can retain an intervening RRBO film. Pair-film drainage uses continuous-oil viscosity, whereas established NMP-film flow uses dispersed-phase viscosity.

**How to apply:** Preserve size- and source-resolved contact inventory until wetting, mobility, pressure/traction and lower-face passage are qualified. Never replace sparse polydisperse surface populations by mean-volume drops and call that merger; use explicit volume-additive events. Refine the genuinely interacting PBM case, not only a noninteracting inlet test.

The end-design objective is a calculated top-settler diameter, effective calm-zone height, residence time and anti-swirl arrangement meeting <5 wt% NMP while preserving the established Ø700, 20-stage extraction section.

**Why:** The user clarified that population/return studies must lead to an integrated sizing result, not remain isolated mechanism studies. The prior Ø700 ×1600 top reservation is not the final required top size.

**How to apply:** Keep extraction internals unchanged; evaluate top geometry as a separate design variable. The user explicitly scopes this exercise to physical separation after Stage 20, using <5 wt% NMP as the design acceptance target. Do not reopen Stage 2 or make dissolved-NMP analysis a prerequisite. Label predicted performance as physical dispersed-NMP performance, not newly established total-composition compliance. Define its mass denominator explicitly.

The coupled sizing sequence is Stage-20 outlet DSD → terminal flow → anti-swirl/calming → residence time → coalescence → settling → NMP return → raffinate outlet.

**Why:** The user permits Ø900, Ø1000 or another calculated top diameter; Ø700 ×1600 is only a reference case. Required outputs include return hydraulics as well as diameter, effective calm height, residence time, anti-swirl arrangement and predicted physical separation.

**How to apply:** Use this coupled sequence to compare top candidates without changing the established Ø700, 20-stage extraction section. Keep assumed Stage-20 DSD/loading explicit rather than treating inherited compartment means or donor widths as measured outlet inputs.

Use one frozen Stage-20 boundary contract across all candidate tops, retaining loading, DSD and spatial one-way flux uncertainties as a controlled envelope. Establish that contract and the terminal/return domain before enlarged-top sizing.

**Why:** The user explicitly approved this methodology and requires steady operation with bounded NMP inventory; a low outlet obtained through indefinite accumulation is a failed design.

**How to apply:** The terminal domain must include the final rotor compartment, actual plate openings/thickness and both faces. Export axial/radial/tangential velocity and pressure with source-labelled bidirectional droplet flux, recrossings and unresolved contact inventory. Preserve top-flow feedback when transferring boundaries; compare candidate outlet and physically closed return at the same duty, never replace lower-face return with upper-face crossing.

The user clarified that “both sections” means top raffinate and bottom extract disengagement sections, including their nozzles—not resizing the active extraction column.

**Why:** The wording “extraction section” was ambiguous; the user explicitly selected the two disengagement ends with Ø700/20 stages preserved.

**How to apply:** Include independent bottom phase-inverted separation and process-nozzle calculations. Do not invent a bottom carryunder specification or promote illustrative end diameters/heights to selected dimensions before coupled separation and return qualification.

The user replaces arbitrary end-zone heights with 10 minutes at normal product flow and 0.90 usable straight-shell volume. Independent end-design S/O is always 1.5 by mass; saved Stage 1/2 remain unchanged.

**Why:** The approved framed rule requires separate end assemblies and an independent end-section material balance, not reuse of product flows from the previous S/O=0.6 case. The 120% flow remains a hydraulic/nozzle check only.

**How to apply:** Add dedicated Ø700 feed/distribution lengths outside frozen Stage 5. Credit only straight liquid volume between interface and product outlet; exclude cone, 150-mm interface allowance, post-nozzle extension and torispherical dishes. Transition minimum and post-nozzle extension each are max(200 mm,0.40D). Cone has a 30° conical portion with knuckled/formed junctions; ASME mechanical design must determine radii, thickness, forming and reinforcement. A mass balance alone does not establish the new equilibrium product split.