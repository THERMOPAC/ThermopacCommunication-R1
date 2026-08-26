---
name: ECR-2 blocked run outcomes
description: Distinguishes governed dependency holds from runtime failures in calculation-run reporting.
---

An ECR-2 snapshot whose BVP convergence state is `dependency_blocked` must be presented as a blocked, non-accepted outcome rather than a runtime error or process-infeasibility result. Historical persistence may retain the legacy generic error status, so API/UI outcome classification must use the structured snapshot.

**Why:** The calculation-run status constraint historically offered only success, warning, and error. Treating a deliberate fail-closed evidence hold as an error confused users and obscured that no mass balance or feasibility verdict had been evaluated.

**How to apply:** Keep blocked snapshots out of accepted results, preserve their diagnostics as the current safety record, and derive the user-facing outcome from the structured BVP convergence status. Invalid inputs and genuine numerical/runtime failures remain errors.