---
name: ECR-2 calculated evidence acceptance
description: Current acceptance rule for system-resolved preliminary Stage 8 numerical evidence.
---

Stage 8 system-resolved preliminary values use one current section-level acceptance state. The bulk action accepts every currently resolved value at once; it never accepts unresolved dependencies. Resolved rows retain value, unit, source/reference, method/correlation, warnings, and preliminary/validated status only. No per-value fingerprints, server signatures, acceptance users/times, or acceptance history are stored.

**Why:** The governed resolver is the source of numerical truth, while the workspace requires a simple operational approval of the current resolved set rather than a separate audit trail for every value.

**How to apply:** Preserve the single acceptance field for every automatic Stage 8 basis. Ordinary section saves must not fabricate the acceptance state; only the bulk resolver endpoint may set it. Unresolved dependencies stay blocked, and the underlying resolver equations and governed numerical values must not change as part of acceptance work.