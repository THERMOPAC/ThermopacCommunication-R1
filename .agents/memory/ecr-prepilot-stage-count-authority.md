---
name: ECR Pre-Pilot stage-count authority
description: Governs how the exact theoretical-stage count is selected for current predictive runs.
---

The saved Stage 1 theoretical-stage count is the sole authority for current predictive execution. It means “solve exactly this N_T,” not “search all counts up to this maximum”; the run panel must not provide a second selector.

**Why:** Two independently editable stage-count controls created conflicting authority and implied a sequential search that the current engine does not perform.

**How to apply:** New runs copy the saved Stage 1 value into the immutable job `ntTest`. Preserve legacy maximum-stage fields and historical sequence behavior only for compatibility with older engines and reports.