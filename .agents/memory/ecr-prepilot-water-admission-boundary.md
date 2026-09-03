---
name: ECR Pre-Pilot water admission boundary
description: Governs whether Stage-1 solvent water may enter predictive COSMO-SAC as a seventh component.
---

Stage-1 water is a deliberate controlled addition to the NMP/H₂O extraction-solvent formulation, not an impurity. Until the seven-component model is qualified, preserve it as a governed formulation input while excluding it from admitted predictive flash and cascade results.

**Why:** A traceable, independently verified H₂O sigma3 profile and isolated seven-component cCOSMO runtime compatibility are now established for research use. However, no direct water–NMP, water–hydrocarbon, or water-bearing multicomponent LLE evidence yet qualifies partition, selectivity, phase topology, temperature dependence, or global stability. A valid molecular profile is not equilibrium evidence.

**How to apply:** Use “controlled water addition,” “water content of extraction solvent,” or “NMP/H₂O solvent formulation,” never “water impurity.” The established profile may be used in the parallel native seven-component research basis. Admit H₂O predictions only after direct or explicitly qualified water-bearing equilibrium evidence, blind validation, mass/mole closure, local stability, global TPD, and self-consistent cascade qualification.

For the seven-component qualification path, S/O is governed as total wet-solvent mass divided by RRBO feed mass:

\[
S/O=\frac{m_{\mathrm{NMP}}+m_{\mathrm{H_2O}}}{m_{\mathrm{RRBO}}}
\]

The Stage-1 water wt% splits the fixed total wet-solvent flow between dry NMP and water. Water is never added on top of the S/O-derived solvent flow.

**Why:** This preserves the selected solvent loading and prevents double-counting water when moving from the six-component dry-solvent representation to an explicit seven-component wet-solvent representation.

**How to apply:** Calculate total wet solvent first, then derive dry NMP and water from the selected water mass fraction. Persist and report total wet-solvent mass flow, dry NMP mass flow, and water mass flow separately.

The 0.5–3.0 wt% formulation range is a sensitivity variable. The model must determine whether water improves or worsens selectivity, aromatic and polar-aromatic removal, recovery, NMP carryover, phase topology, global stability, and stage performance; no beneficial effect or optimum may be encoded in advance.

The available direct water–NMP–hydrocarbon source measures VLE and infinite-dilution activity for light C5/C6 hydrocarbons at 90–140 °C. It is training-context evidence only, not water-bearing LLE validation. Dry NMP ternary tie lines also cannot validate the wet-solvent model.

**Why:** Neither source provides governed coexisting-liquid compositions for controlled-water extraction. Without closed water-bearing tie lines, water partition and selectivity are not testable, phase topology and temperature transfer are not qualified, and numerical TPD searches remain research diagnostics rather than experimental validation.

**How to apply:** Count bibliography sources separately from governed numeric records. Keep the blind partition reserved and empty until independently held-out water-bearing tie lines are acquired; do not interpret an empty blind set as a passed blind validation.