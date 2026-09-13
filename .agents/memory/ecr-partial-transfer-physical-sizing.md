---
name: Partial-transfer nonlinear sizing boundary
description: Separate pre-pilot candidate solves do not confer full-transfer engineering acceptance.
---

## Current engineering direction

The user chose theoretical-stage-based pre-pilot sizing: COSMO-SAC separation duty plus Stage-3 hydraulics plus a supported Kühni transfer/mixing model for calculated overall efficiency. Job C and full-transfer convergence are later validation/refinement, not prerequisites for this estimate.

**Why:** Requiring a 189-equation solve per geometry candidate complicated Stage 4 without delivering a practical preliminary sizing method.

**How to apply:** Establish the supported transfer/mixing closure first and identify exact missing physical parameters for engineering review before numerical implementation. The user rejected delivering a placeholder-only framework. Never equate a theoretical-stage default or seven FV cells with physical compartments. Keep predictive estimates explicitly non-final.

The refined physical-stage calculation consumes the selected Stage-3 diameter rather than reselecting hydraulics. The user explicitly permits compartment pitch \(h/D=0.5\) as a labelled pre-pilot geometry assumption, pending mechanical verification. Efficiency must be computed from a supported transfer/mixing model, not supplied as an assumed efficiency or HETS value.

**Why:** Separating hydraulic selection from stage conversion avoids repeatedly re-solving geometry and makes the actual missing efficiency closure visible.

**How to apply:** Keep the pitch assumption explicit and show all transfer/mixing intermediates. Distinguish local component/Murphree efficiencies from the overall equivalent-stage efficiency needed by \(N_\mathrm{physical}=\lceil N_T/E_o\rceil\).

Published Kühni axial-dispersion balance models are not themselves predictive mixing closures. Laitinen 2019 (doi:10.1016/j.cherd.2019.04.018) needs axial-mixing inputs; the 2017 study's cited Kumar–Hartland dispersion source is for RDC/ARDC, not inherently Kühni.

**Why:** Treating fitted dispersion coefficients or another column's correlation as a supported Kühni predictor would merely hide an assumed efficiency inside the model.

**How to apply:** Verify primary equations, units, geometry and applicability before adopting a mixing correlation; obtain phase-specific mixing evidence where prediction remains unsupported.

## Historical nonlinear diagnostic route

The user chose direct nonlinear partial-transfer sizing rather than frozen-secant extrapolation. The accepted partial anchor is a warm start, not accepted candidate geometry.

**Why:** Frozen local scalar coefficients failed the real anchor's applicability check; repeating its diameter and trial height was not sizing.

**How to apply:** Recompute candidate transport and hydraulics through an explicitly user-triggered isolated partial solve. Never enqueue or resume Job C automatically. Keep the full-transfer route unchanged.

Minimum-height claims are bounded by the explored domain, resolved brackets, and evaluated separation targets. Timeouts, unknown solves, and incomplete envelope searches remain indeterminate.

**Why:** Recovery and quality impose different constraints; their conjunction is not a generally monotone height predicate. An endpoint failure cannot exclude an interior feasible interval.

**How to apply:** Preserve per-target evidence and search limits. Do not weaken gates to obtain a result. Physical-stage efficiency still requires a supported physical-compartment model; numerical cells or a bare theoretical-to-physical count ratio do not supply it.

Saved assessment identity, not the long-running HTTP response or displayed previous status, determines whether a new outcome is available.

**Why:** A completed search saved an indeterminate result while the browser retained the older invalid-model assessment after a request failure.

**How to apply:** Establish a server-read baseline before explicit evaluation; reconcile newer saved outcomes through read-only requests. Separate transport uncertainty from running-state evidence, and never trigger another solve to refresh results.