---
name: LLX thermodynamic temperature validity
description: Governs temperature-specific RRBO/NMP thermodynamic evidence classifications and their separation from numerical model output.
---

Resolve thermodynamic validity at the exact selected operating temperature, not at a fixed reference point. Record direct experimental support, bracketed interpolation, extrapolation, or insufficient evidence separately from the numerical NRTL/LLE result. Keep the experimental evidence, calibration reproduction verdict, multi-temperature validation verdict, parameter identifiability, warnings, and optimizer-forward readiness in the runtime snapshot.

**Why:** A numerical NRTL flash or cascade can return finite values even where the active temperature dependence is unsupported. Treating numerical availability as validation would silently promote the unadmitted multi-temperature diagnostic parameterization and bypass the failed Coto calibration-reproduction gate.

**How to apply:** The current single admitted Coto tie-line family is direct preliminary evidence only near its own recorded temperature; all other valid temperatures are preliminary extrapolation unless future admitted endpoint families support interpolation. Multiple registry temperatures do not by themselves validate a temperature model: a governed independent validation gate is required before optimizer-forward readiness can change from NOT_READY. Carry the resolver output through C2, local NRTL, ECR-2, and persisted snapshots without changing numerical thermodynamics.