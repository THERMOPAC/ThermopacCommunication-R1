---
name: ECR Pre-Pilot water admission boundary
description: Governs whether Stage-1 solvent water may enter predictive COSMO-SAC as a seventh component.
---

Stage-1 water must remain a declared NMP impurity/specification scalar and excluded from predictive flash and cascade compositions. A seven-component implementation is technically possible but is not scientifically admitted.

**Why:** The project has no governed H₂O COSMO profile bound to the predictive basis and no direct water–NMP, water–hydrocarbon, or water-bearing multicomponent LLE evidence qualifying partition, selectivity, phase topology, temperature dependence, and global stability. Hydraulic water properties and profile-tool references are not equilibrium evidence.

**How to apply:** Admit H₂O only after a versioned seven-component basis includes a provenance-hashed water profile, direct or explicitly qualified water-bearing equilibrium evidence, blind validation, mass/mole closure, local stability, global TPD, and self-consistent cascade qualification. Identity or profile generation alone is insufficient.

For the seven-component qualification path, S/O is governed as total wet-solvent mass divided by RRBO feed mass:

\[
S/O=\frac{m_{\mathrm{NMP}}+m_{\mathrm{H_2O}}}{m_{\mathrm{RRBO}}}
\]

The Stage-1 water wt% splits the fixed total wet-solvent flow between dry NMP and water. Water is never added on top of the S/O-derived solvent flow.

**Why:** This preserves the selected solvent loading and prevents double-counting water when moving from the six-component dry-solvent representation to an explicit seven-component wet-solvent representation.

**How to apply:** Calculate total wet solvent first, then derive dry NMP and water from the selected water mass fraction. Persist and report total wet-solvent mass flow, dry NMP mass flow, and water mass flow separately.