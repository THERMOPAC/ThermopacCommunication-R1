---
name: Post-split TPD qualification
description: Durable qualification rules and scientific disposition for six-component post-split phase stability.
---

Treat a boundary optimizer endpoint as a valid competing minimum only when it satisfies the active-set simplex KKT conditions. Being on the simplex boundary is never, by itself, evidence of stationarity. Require independent constrained-route agreement and a feasibility-safe infinitesimal Gibbs split witness before classifying a negative TPD basin as reproduced.

**Why:** A boundary BFGS vertex can be strongly nonstationary while constrained interior routes tightly agree. Accepting that vertex as comparable misclassifies genuine lower-Gibbs basins as refinement failures. A complete independent audit of the current six-component model reproduced genuine lower-Gibbs basins, so it cannot establish Predictive N_T.

**How to apply:** For every post-split phase, retain global search, local refinement, active-set simplex KKT, log-ratio KKT, independent optimizer agreement, and a split fraction small enough to preserve feasibility. Keep negative-or-unresolved phases separate from fully reproduced basins, but fail the stability gate for either. Do not expose Predictive N_T until a replacement model passes the same complete audit without weakening evidence, calibration, sulfur, or release gates.

A candidate with zero negative or unresolved global-TPD endpoints is still a controlled negative when frozen composition, tie-line, direct-evidence, or unchanged local-stability acceptance fails. Admit such evidence only as a cryptographically fixed research diagnostic, never as a qualified model.

**Why:** Global TPD success alone did not overcome independent validation failures or local-stability rejection at higher stage counts. Treating that partial success as qualification would silently enable unsupported stage, sulfur, pilot, or release claims.

**How to apply:** Bind the approved verdict and all lineage hashes to immutable expected facts. Every terminal outcome, including runtime and report failures, must retain the server-owned evidence envelope; intermediate checkpoint omission must never be accepted as terminal output.