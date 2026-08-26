---
name: ECR Pre-Pilot thermodynamic model selection
description: Select the LLE model by demonstrated reproduction of relevant evidence, not by making NRTL mandatory
---

## Rule
Do not currently develop NRTL as the governing thermodynamic model for the ECR Pre-Pilot simulator. NRTL remains an evaluated candidate, but the next governing-model work must compare or develop alternatives and select the method that reproduces relevant LLE evidence reliably over the intended temperature, composition, and component domain. This work is isolated from legacy LLX routes, code, assumptions, and governance.

**Why:** the existing NRTL regression exposed a representability and validation gap before the simulator was built around it; hard-coding NRTL would convert a useful finding into a weak foundation.

**How to apply:** use only the ECR Pre-Pilot six-component basis, Stage 1 inputs, and explicitly admitted external evidence. Compare candidate models using direct and analogue LLE evidence, held-out temperatures/feed compositions, phase-topology and tie-line behavior, distribution/selectivity trends, and physical admissibility. If no candidate passes the evidence gate, return `NOT_CALCULABLE` rather than silently falling back or widening tolerances. Keep the polar-aromatic component definition and six-component basis as independent prerequisites.