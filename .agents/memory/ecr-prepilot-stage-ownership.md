---
name: ECR Pre-Pilot stage ownership
description: One-way ownership boundaries for the production ECR Pre-Pilot workflow and its future mass-transfer stage.
---

The production workflow is Stage 1 Inputs → Stage 2 Thermodynamics → Stage 3 Hydrodynamics → future Stage 4 Mass Transfer / ECR Sizing.

- Stage 1 is the sole owner of feed basis, temperature, physical properties, phase designation, and flow basis.
- Stage 2 consumes Stage 1 and owns the multistage seven-component thermodynamic calculation and theoretical-stage result.
- Stage 3 consumes Stage 1 and Stage 2 and owns Kühni/ECR geometry, RPM, drop size, drag/shape regime, holdup, flooding, and hydraulic diameter. It must not duplicate upstream inputs or results as independently editable authority.
- Future Stage 4 consumes the preceding stages and owns conversion of theoretical stages into physical ECR compartments, mass transfer, and active column height.

**Why:** Separating page and calculation ownership prevents downstream calculations from silently becoming competing sources of governed engineering inputs or results.

**How to apply:** Keep dependencies read-only and traceable across stage boundaries. Extend the chain with Stage 4 rather than placing mass transfer back inside thermodynamics.