---
name: ECR Pre-Pilot thermodynamic model selection
description: Select the LLE model by demonstrated reproduction of relevant evidence, not by making NRTL mandatory
---

## Rule
Do not currently develop NRTL as the governing thermodynamic model for the ECR Pre-Pilot simulator. NRTL remains an evaluated candidate, but the next governing-model work must compare or develop alternatives and select the method that reproduces relevant LLE evidence reliably over the intended temperature, composition, and component domain. This work is isolated from legacy LLX routes, code, assumptions, and governance. Polar Aromatics remains an explicit Stage 1 feed component in the six-component process basis; a first five-component Dortmund benchmark may exclude it only as a temporary thermodynamic-coverage limitation, never as a generic external quality parameter.

**Why:** the existing NRTL regression exposed a representability and validation gap before the simulator was built around it; hard-coding NRTL would convert a useful finding into a weak foundation.

**How to apply:** use only the ECR Pre-Pilot six-component process basis, Stage 1 inputs, and explicitly admitted external evidence. Preserve Polar Aromatics in feed, mass-balance, quality, and optimization vectors even when the initial thermodynamic benchmark cannot yet calculate its LLE partitioning. Compare candidate models using direct and analogue LLE evidence, held-out temperatures/feed compositions, phase-topology and tie-line behavior, distribution/selectivity trends, and physical admissibility. If no candidate passes the evidence gate, return `NOT_CALCULABLE` rather than silently falling back or widening tolerances. Keep the Polar Aromatics thermodynamic representation as a separately tracked coverage gap.