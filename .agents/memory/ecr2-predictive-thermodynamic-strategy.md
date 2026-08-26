---
name: ECR-2 predictive thermodynamic strategy
description: Governs the pre-pilot LLE architecture for missing sulfur/polar families and temperature coverage.
---

Use a calibrated hybrid rather than one universal correlation. Regress NRTL or UNIQUAC only against direct, composition-resolved NMP data; use COSMO-RS/COSMO-SAC as the primary predictive source for missing BT, DBT/heavy sulfur, N-heteroaromatic, and O-polar interactions; retain Modified UNIFAC Dortmund as an independent group-contribution benchmark and uncertainty member. A constrained local NRTL/UNIQUAC surrogate may emulate the accepted predictive surfaces for repeated cascade solves, but it must not add unconstrained fitting freedom or be mistaken for new experimental evidence.

Never transfer NRTL parameters from glycol or ionic-liquid systems into NMP. Temperature coefficients require independently informative temperatures; a single-temperature fit cannot identify a temperature law. Direct NMP evidence near 298–308 K supports validation in that band only; outside it, status and uncertainty must widen explicitly.

**Why:** Direct NMP LLE gives the strongest local calibration but cannot predict absent families. COSMO methods provide molecularly informed coverage without invented binary parameters, while Modified UNIFAC provides an independent chemistry-based baseline. Agreement/disagreement across these routes is more informative for pre-pilot uncertainty than selecting the method with the best fit to one dataset.

**How to apply:** Benchmark every candidate on held-out direct NMP tie-lines, including Coto hydrocarbon LLE and thiophene/NMP datasets, using phase composition, distribution ratio, selectivity, phase topology, and closure metrics. Propagate parameter, method-form, temperature, representative-compound, and `PRE_PILOT_INFERRED_SPECIATION` uncertainty through flash, cascade, BVP, recovery, N_T, and effective-height results. Preserve nonconvergence and out-of-domain status; never replace them with imputed values.