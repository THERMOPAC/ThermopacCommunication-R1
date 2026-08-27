---
name: ECR Pre-Pilot Stage 1 property authority
description: Stage 1 owns temperature-dependent RRBO and NMP physical properties for every downstream calculation
---

## Rule
Stage 1 is the single source of truth for supported temperature-dependent RRBO and NMP physical properties and supplies the explicit six-component process feed, including Polar Aromatics in wt%. Downstream thermodynamic, hydrodynamic, simulator, and optimizer calculations must consume the Stage 1 property set and preserve the six-component process basis for their trial temperature; they must not duplicate, independently recalculate, overwrite, discard, or reclassify those values.

**Why:** duplicate property closures can produce inconsistent density, viscosity, and interfacial-tension inputs across thermodynamics, hydraulics, simulation, and optimization, making a temperature trial internally incoherent.

**How to apply:** when the optimizer evaluates a temperature, retrieve the corresponding Stage 1 property set. The initial five-component LLE benchmark may carry Polar Aromatics as an explicit unresolved thermodynamic component, but must not turn it into a generic quality parameter. If a supported property set cannot be resolved for that temperature, expose the dependency failure rather than creating a later-stage fallback model.