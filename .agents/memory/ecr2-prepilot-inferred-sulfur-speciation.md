---
name: ECR-2 pre-pilot inferred sulfur speciation
description: Governs how ECR-2 may run scientifically bounded sulfur-family scenarios before pilot-quality feed speciation exists.
---

Measured total sulfur without family-level speciation must not automatically block the pre-pilot simulator. The simulator may construct closure-constrained sulfur-family scenarios or distributions from published RRBO, used-oil, and petroleum evidence, boiling range, and available feed measurements. Every such input must be labelled `PRE_PILOT_INFERRED_SPECIATION`, with its source basis and uncertainty preserved.

`S_UNASSIGNED` remains visible as an accounting quantity. It is not silently assigned to a hydrocarbon class, given a DBT-like partition coefficient, or converted into an empirical sulfur-removal factor.

**Why:** A high-fidelity pre-pilot model needs to propagate the uncertainty caused by unavailable pilot-quality speciation through phase split, sulfur target attainment, recovery, theoretical stages, effective height, and pilot-test design. Treating uncertainty as a calculation stop would discard useful physical scenario analysis; treating it as measured data would overstate confidence.

**How to apply:** Constrain every inferred scenario to exact total-mass and total-sulfur closure. Keep inferred family fractions, representative properties, source class, and uncertainty distinct from project measurements. Report results as a scenario/distribution envelope, never as one measured feed composition. Upgrade to `PROJECT_MEASURED` only when validated analytical results support the family allocation.