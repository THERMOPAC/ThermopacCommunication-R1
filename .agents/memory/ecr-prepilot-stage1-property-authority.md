---
name: ECR Pre-Pilot Stage 1 property authority
description: Stage 1 owns temperature-dependent RRBO and NMP physical properties for every downstream calculation
---

## Rule
Stage 1 is the single source of truth for supported temperature-dependent RRBO and NMP physical properties. Downstream thermodynamic, hydrodynamic, simulator, and optimizer calculations must consume the Stage 1 property set for their trial temperature and must not duplicate, independently recalculate, or overwrite those values.

**Why:** duplicate property closures can produce inconsistent density, viscosity, and interfacial-tension inputs across thermodynamics, hydraulics, simulation, and optimization, making a temperature trial internally incoherent.

**How to apply:** when the optimizer evaluates a temperature, retrieve the corresponding Stage 1 property set. If a supported property set cannot be resolved for that temperature, expose the dependency failure rather than creating a later-stage fallback model.