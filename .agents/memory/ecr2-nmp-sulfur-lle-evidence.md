---
name: ECR-2 NMP sulfur LLE evidence
description: Source-quality boundary for the sulfur-selective RRBO/NMP pre-pilot thermodynamic model.
---

Published direct NMP sulfur evidence presently has unequal coverage by family. The 2024 Mguni et al. study reports ternary T-x-x LLE for NMP + thiophene + n-octane and NMP + thiophene + n-hexadecane at 308.15 K; it is the principal direct light-thiophenic calibration candidate once raw tie-line values and metadata pass admission checks. A 2024 heptane + thiophene + NMP study is another direct candidate at 298.2 K, pending raw-data retrieval and audit.

The Coto et al. 2022 six-component NMP/hydrocarbon dataset is high-value direct LLE evidence for the non-sulfur hydrocarbon backbone at 298.15 K, but it cannot support sulfur-component parameters. Murata et al. 2024 provides direct NMP extraction and partition-behavior evidence for DBT and benzothiophene derivatives, but batch-extraction performance without fully published two-phase compositions is not a parameter-fitting tie-line dataset. Kumar et al. 2015 provides real gas-oil NMP process-performance evidence only.

Krolikowski and Lipinska 2019 supplies machine-readable ternary thiophene/benzothiophene + heptane + glycol data at 308.15 K (NIST ThermoML), including 19- and 21-point sets and reported NRTL tie-line correlation. It is chemically useful analogue evidence, but cannot fit NMP interaction parameters.

**Why:** Direct, composition-resolved LLE data are required for physical sulfur-family parameter fitting. Whole-oil sulfur removal, a fitted model from another solvent, or a predictive model can check directionality or set a bounded prior but cannot establish NMP/RRBO phase-split parameters.

**How to apply:** Admit source data only after recording raw compositions, temperature, pressure, phase identity, analytical method/uncertainty, component and overall closure, and whether the experiment was demonstrably at equilibrium. Keep temperature coverage explicit: present direct sulfur evidence is near 298–308 K, so it does not justify unqualified operation at other temperatures. Do not replace missing DBT/heavy-sulfur tie-lines with a sulfur-removal factor.