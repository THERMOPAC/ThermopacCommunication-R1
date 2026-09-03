---
name: Predictive N_T diagnostic continuation
description: Separates full-sequence diagnostic propagation from governed trial acceptance.
---

Attempt every configured cascade trial when a reproducible, chemically polished stationary split exists. A post-split TPD failure makes that trial and its propagated continuation diagnostic, not absent.

**Why:** Stopping at the first metastable stationary split prevented screening across the requested stage range, while propagating it as governed would overstate the thermodynamic evidence.

**How to apply:** Mark stationary-split continuations `NON_GOVERNED`, `METASTABLE_OR_UNRESOLVED`, and `NOT_RELEASE_ELIGIBLE`; report attempted and governed-accepted counts separately. Never derive Predictive N_T from a non-governed trial. Stop only when no reproducible stationary split exists to propagate.

Checkpoint envelopes validate each trial's governance classification, but sequence-wide attempted/accepted/diagnostic totals are terminal-result fields only. Requiring terminal totals during checkpoint validation prevents ACK and loses otherwise completed progress.