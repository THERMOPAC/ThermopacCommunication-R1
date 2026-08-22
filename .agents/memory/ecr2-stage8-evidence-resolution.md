---
name: ECR-2 Stage 8 evidence resolution
description: Evidence boundary for physical molecular weights, diffusivity estimates, and Kühni Shd C2 in the ECR-2 simulator.
---

Stage 8 may never use Coto thermodynamic surrogate molecular weights, fixture values, project provisional C2 values, or pulsed-column C2 values as a shortcut to an executable mass-transfer simulation.

RRBO SN300 has four acceptance-gated, engineer-approved preliminary physical-MW candidates based on explicit petroleum-fraction screening anchors; they are not release-grade governed properties and do not unlock diffusivity calculation. They may be selected only from the validated workspace Feed Service grade, never a client-carried fluid identifier, and never for another or unknown RRBO grade. Every physical-basis provenance field (including version, inputs/gaps, uncertainty, decision, and warnings) is part of the signed resolver fingerprint.

Wilke–Chang (1955, doi:10.1002/aic.690010222) is an equation-bearing infinite-dilution estimate, not an RRBO/NMP-validated default. It can resolve only when the actual operating temperature, solvent viscosity, solvent MW/association factor, and physical solute MW and density/molar volume are all evidenced. Its result must retain `RRBO_NMP_VALIDATION_PENDING` and await engineer acceptance. `Dc_NMP` is NMP self-diffusion and is not interchangeable with `Dd_NMP`, which is NMP in the RRBO-rich dispersed phase.

**Why:** Filling evidence gaps would create a plausible but untraceable simulator result.

**How to apply:** The normal workflow is system resolution from an approved basis, not repeated manual entry of final numerical values. Every resolver scalar must be positive, finite, source-tagged, and applicable; partial bases must return a named root gap, never throw or infer a value. Auto-resolution status and provenance must be server-derived; client claims and plain fingerprints are insufficient. Bind dynamic resolver records to a server HMAC before accepting them, then preserve the signed record, inputs, and provenance in the run snapshot. When a characterization package or scoped C2 evidence arrives, validate its applicability before using it; do not relax the fail-closed gate.