---
name: ECR-2 sigma temperature route
description: Governs use of an NMP/RRBO interfacial-tension anchor away from its measurement temperature.
---

A NMP/RRBO sigma anchor may resolve at the selected Stage 4 temperature through a controlled linear relation `sigma(T) = sigma_anchor + (d_sigma/dT) * (T - T_anchor)` when independently source-tagged coefficient evidence exists. Otherwise, the explicitly governed preliminary constant-over-range basis may carry the unchanged anchor value only within 25–100 °C. The constant basis is never a sigma(T) correlation and must emit `INTERFACIAL_TENSION_TEMPERATURE_DEPENDENCE_NOT_MODELLED`.

**Why:** RRBO composition and re-refining history can materially change both pair interfacial tension and its temperature dependence. The bounded preliminary basis supports auditable candidate-temperature simulation without silently retagging the source datum or inventing a slope, while preserving the distinction between numerical availability and evidence-backed temperature dependence.

**How to apply:** Prefer the complete governed linear route when available; otherwise use only the explicit bounded constant basis when the workspace mapper carries its approved private basis ID. Retain the original anchor, target temperature, method, applicability range, and warnings in the Stage 8 snapshot. Stage 5 overrides and ordinary vendor/measured anchors are not range-qualified merely by source metadata. Outside the controlled range, leave sigma unresolved and dependency-block holdup and sigma-dependent d32 work with a sigma-specific explanation.