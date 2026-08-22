---
name: ECR-2 transfer result status
description: Governing rule for presenting numerical local transfer physics without promoting it to design performance.
---

ECR-2 has one transfer-status record shared by BVP snapshots, dependency registers, summaries, report payloads, and UI. It must always separate `LOCAL_PRELIMINARY_CALCULATED` from governed values (`UNAVAILABLE`) and release eligibility (`NOT_RELEASE_ELIGIBLE`). Any failed dependency, convergence failure, failed mass balance, unsupported phase, or inadmissible d32 makes the transfer status blocked, even if diagnostic local arrays exist.

**Why:** A BVP can numerically evaluate local Sherwood, Koa, rate, profile, and outlet values before its full calculation is acceptable. Treating those arrays as available performance claims contradicts the dependency state and can make failed or physically invalid work look design-valid.

**How to apply:** Derive every transfer availability surface from the shared status record. Render ordinary outlet/profile/compartment performance only when the BVP converged, passed mass balance, and status is `LOCAL_PRELIMINARY_CALCULATED`; otherwise retain numeric arrays only as unaccepted diagnostics.