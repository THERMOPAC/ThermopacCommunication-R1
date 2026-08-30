---
name: ECR Pre-Pilot Predictive N_T molecular basis
description: Scientific input-boundary rules for predictive SAT/MONO/NMP cascade jobs.
---

**Rule:** Predictive N_T jobs must carry the complete source mass basis and the derived molecular basis. The server independently recomputes admitted feed fractions, solvent molar ratio, and product mole targets from admitted registry molecular weights.

**Why:** A browser-only conversion can be bypassed, and treating wt% targets or solvent/oil mass ratio as mole fractions changes the scientific question. Silently dropping DI, POLY, polar aromatics, or feed NMP also violates the frozen model's admitted scope.

**How to apply:** Reject any nonzero unsupported source component and any mismatch between source mass values and derived molecular inputs. Do not use the solver's molar hydrocarbon recovery diagnostic as a gate for a mass-basis recovery specification.

**Rule:** Stage 1 mass recovery is meaningful only after the predictive cascade propagates every governed hydrocarbon family present in the real Stage 1 feed. A SAT/MONO-only cascade cannot establish recovery for a SAT/MONO/DI/POLY/Polar Aromatics feed.

**Why:** Computing a formally correct ratio from an incomplete component model silently excludes real feed mass and overstates the governing scope. DI/POLY have the closest thermodynamic basis and should be admitted first; Polar Aromatics should then be admitted as a distinct partitioning family. Polar Aromatics admission does not require sulfur prediction.

**How to apply:** Keep governed Stage 1 recovery fail-closed until DI/POLY and Polar Aromatics are represented and conserved through the cascade. Develop in this order: DI/POLY cascade extension, Polar Aromatics NMP partitioning and counter-current N_T, then recovery admission. Keep sulfur as an independent unresolved objective.

**Rule:** A successful one-stage flash does not establish that a saved basis is admissible for a progressive stage search; every requested stage count must stay inside the frozen model's two-phase flash envelope.

**Why:** Progressive acceptance attempts can pass N=1 and then fail closed at N=2 with a stable-single-phase or nonconverged/boundary verdict. Such a run is thermodynamic failure evidence, not an accepted lower stage count.

**How to apply:** Preserve the failed run and its completed-trial progress. Never select an earlier accepted-looking trial after a later requested trial aborts; use another independently valid saved Stage 1 case without changing the frozen model.

**Rule:** The immutable saved Stage 1 snapshot is the sole authority for every queued execution field. Reconstruct the full request from that snapshot at enqueue and worker execution, and reject any canonical mismatch.

**Why:** Checking only the snapshot hash and molecular identities still permits a self-consistent substituted feed, solvent ratio, temperature, target, or stage limit to run under the original authority label.

**How to apply:** Bind the exact six-family profile order and hashes to Stage 1, preserve unsupported selected identities as blocked rather than substituting them, and keep five-component UNIQUAC/NRTL results explicitly separate from six-component COSMO-SAC claims.