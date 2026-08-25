---
name: ECR-2 sulfur objective boundary
description: The physical Stage 8 model must treat sulfur removal as the primary product objective, independently of aromatic reduction.
---

The future physics-based pre-pilot ECR-2 thermodynamic cascade must explicitly conserve valuable hydrocarbons and sulfur-bearing polar/heteroaromatic components. It must predict selective transfer in every equilibrium stage and physical ECR compartment, with raffinate sulfur as the primary quality specification; hydrocarbon-only aromatics may remain a separate secondary constraint, and RRBO recovery remains independently required. The eventual Stage 8 architecture must couple this result to existing mass-transfer/hydrodynamic calculations for \(N_T\), diameter, height, and operating-envelope studies, while preserving future pilot calibration without rebuilding the architecture.

**Why:** The current Coto slate contains only hydrocarbon aromatic classes plus NMP. It has no sulfur, polar, or heteroaromatic component identity, so aromatic transfer cannot support a sulfur-removal claim.

**How to apply:** Keep COTO_NRTL as an aromatic-selectivity benchmark only. Do not infer sulfur or DBT removal from aromatic removal. Before implementing a sulfur-capable physical cascade, require approved RRBO sulfur/polar pseudo-component definitions, feed speciation evidence, and a governed physical phase-split model. The sulfur balance must use predicted sulfur component phase flows and component sulfur mass fractions. Preserve explicit assumptions, uncertainty, and pilot-calibration hooks.