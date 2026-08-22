---
name: ECR-2 live dependency state
description: Governing rule for keeping Stage 8 readiness and dependency displays synchronized with current resolver evidence.
---

All Stage 8 visible readiness surfaces must consume one live dependency model built from the current resolver records, the bulk system-value acceptance state, and the explicit Kd approval state. Resolver-supplied method and reference-temperature metadata are authoritative for auto-resolved diffusivities; they must not be re-read only from legacy or manually saved fields.

**Why:** A resolver can legitimately supply all ten diffusivities while prior local inputs remain blank. Independent UI checks then falsely show the same dependencies as both resolved and missing, obscuring the true C2 and Kd blockers.

**How to apply:** When adding a Stage 8 dependency or display, derive its row state, readiness count, unresolved checklist, and run-button gate from the shared model. Preserve the section-level acceptance rule; a current candidate is usable only after that acceptance (or a complete governed override).