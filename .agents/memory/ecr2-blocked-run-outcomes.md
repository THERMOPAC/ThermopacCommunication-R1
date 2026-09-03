---
name: ECR-2 blocked run outcomes
description: Distinguishes governed dependency holds from runtime failures in calculation-run reporting.
---

An ECR-2 snapshot whose BVP convergence state is `dependency_blocked` must be presented as a blocked, non-accepted outcome rather than a runtime error or process-infeasibility result. Historical persistence may retain the legacy generic error status, so API/UI outcome classification must use the structured snapshot.

**Why:** The calculation-run status constraint historically offered only success, warning, and error. Treating a deliberate fail-closed evidence hold as an error confused users and obscured that no mass balance or feasibility verdict had been evaluated.

**How to apply:** Keep blocked snapshots out of accepted results, preserve their diagnostics as the current safety record, and derive the user-facing outcome from the structured BVP convergence status. Invalid inputs and genuine numerical/runtime failures remain errors.

Predictive 7C phase holds must distinguish a proven dense-search no-liquid-split result from unresolved phase topology. Both are completed, non-accepted scientific holds, but they must never share a blocking code or user-facing claim.

**Why:** A flash can return no phase fraction either because the search supports a homogeneous state or because topology resolution failed. Calling the latter “no liquid split” overstates the evidence and causes the fail-closed result validator to reject the mislabeled envelope.

**How to apply:** Pair each execution status, blocking code, and flash phase-behavior value exactly. Preserve completed trial checkpoints, report no Predictive N_T, and never fabricate raffinate/extract phases.