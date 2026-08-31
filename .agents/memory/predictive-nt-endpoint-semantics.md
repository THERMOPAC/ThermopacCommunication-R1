---
name: Predictive N_T endpoint semantics
description: Governs how optimizer termination, residual closure, and multistart branch comparison must remain separate.
---

Treat optimizer termination and numerical endpoint closure as separate evidence. An endpoint is closed only when its finite maximum original scaled-equation residual is at or below the governed limit, regardless of the optimizer success flag. A branch comparison is evaluable only when both independently continued endpoints are closed; an unclosed endpoint is not evidence of a distinct branch.

**Why:** A secondary endpoint once stopped at its function-evaluation limit with a residual already below the closure tolerance, yet was incorrectly classified as unclosed. Conversely, optimizer success alone cannot prove equation closure. Conflating either state creates false branch blockers.

**How to apply:** Preserve the raw termination status/message and evaluation count, calculate residual closure independently on unchanged equations, return a null/not-evaluable branch difference if either endpoint is unclosed, and emit a branch-reproduction blocker only for two closed endpoints outside the governed product tolerance.