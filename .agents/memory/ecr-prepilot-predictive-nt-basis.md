---
name: ECR Pre-Pilot Predictive N_T molecular basis
description: Scientific input-boundary rules for predictive SAT/MONO/NMP cascade jobs.
---

**Rule:** Predictive N_T jobs must carry the complete source mass basis and the derived molecular basis. The server independently recomputes SAT/MONO feed fractions, solvent molar ratio, and product mole targets from admitted registry molecular weights.

**Why:** A browser-only conversion can be bypassed, and treating wt% targets or solvent/oil mass ratio as mole fractions changes the scientific question. Silently dropping DI, POLY, polar aromatics, or feed NMP also violates the frozen model's admitted scope.

**How to apply:** Reject any nonzero unsupported source component and any mismatch between source mass values and derived molecular inputs. Do not use the solver's molar hydrocarbon recovery diagnostic as a gate for a mass-basis recovery specification.

**Rule:** A successful one-stage flash does not establish that a saved basis is admissible for a progressive stage search; every requested stage count must stay inside the frozen model's two-phase flash envelope.

**Why:** Progressive acceptance attempts can pass N=1 and then fail closed at N=2 with a stable-single-phase or nonconverged/boundary verdict. Such a run is thermodynamic failure evidence, not an accepted lower stage count.

**How to apply:** Preserve the failed run and its completed-trial progress. Never select an earlier accepted-looking trial after a later requested trial aborts; use another independently valid saved Stage 1 case without changing the frozen model.