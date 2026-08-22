---
name: ECR-2 sigma temperature route
description: Governs use of an NMP/RRBO interfacial-tension anchor away from its measurement temperature.
---

A NMP/RRBO sigma anchor may be corrected only through the controlled linear relation `sigma(T) = sigma_anchor + (d_sigma/dT) * (T - T_anchor)`. The temperature coefficient must be source-tagged independently; it is never assumed from RRBO grade, NMP properties, or a generic solvent analogy. The current preliminary route applies only from 25 to 100 °C.

**Why:** RRBO composition and re-refining history can materially change both pair interfacial tension and its temperature dependence. Reusing a datum at another temperature, or silently choosing a slope, would make holdup and sigma-dependent d32 work appear condition-resolved without supporting evidence.

**How to apply:** Preserve the original anchor alongside the resolved target-temperature value, method, source warnings, and requested Stage 4 temperature in the Stage 8 snapshot. Outside the route range or without complete coefficient provenance, leave sigma unresolved and dependency-block holdup and sigma-dependent d32 work with a sigma-specific explanation.