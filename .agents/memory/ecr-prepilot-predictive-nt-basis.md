---
name: ECR Pre-Pilot Predictive N_T molecular basis
description: Scientific input-boundary rules for predictive SAT/MONO/NMP cascade jobs.
---

**Rule:** Predictive N_T jobs must carry the complete source mass basis and the derived molecular basis. The server independently recomputes SAT/MONO feed fractions, solvent molar ratio, and product mole targets from admitted registry molecular weights.

**Why:** A browser-only conversion can be bypassed, and treating wt% targets or solvent/oil mass ratio as mole fractions changes the scientific question. Silently dropping DI, POLY, polar aromatics, or feed NMP also violates the frozen model's admitted scope.

**How to apply:** Reject any nonzero unsupported source component and any mismatch between source mass values and derived molecular inputs. Do not use the solver's molar hydrocarbon recovery diagnostic as a gate for a mass-basis recovery specification.