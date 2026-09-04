---
name: ECR Pre-Pilot Stage 1 property authority
description: Stage 1 owns temperature-dependent RRBO and NMP physical properties for every downstream calculation
---

## Rule
Stage 1 is the single source of truth for supported temperature-dependent RRBO and NMP physical properties and supplies the explicit process feed, including Polar Aromatics in wt%. Operating temperature in Celsius is the only editable temperature; Kelvin is derived as °C + 273.15 and both are frozen in the saved snapshot. NMP temperature and all temperature-derived Stage 1 properties must follow that condition rather than becoming separate user inputs. Downstream thermodynamic, hydrodynamic, simulator, and optimizer calculations must consume the frozen Stage 1 condition and property set; they must not independently derive a different temperature, duplicate the property closure, or overwrite, discard, or reclassify those values.

**Why:** duplicate property closures can produce inconsistent density, viscosity, and interfacial-tension inputs across thermodynamics, hydraulics, simulation, and optimization, making a temperature trial internally incoherent.

**How to apply:** derive and validate Kelvin while canonicalizing a new Stage 1 snapshot, then pass that persisted Kelvin value unchanged to predictive workers. Historical snapshots without Kelvin remain historical evidence but must be resaved under the current contract before a new predictive run. If a supported property set cannot be resolved for the selected condition, expose the dependency failure rather than creating a later-stage fallback model.