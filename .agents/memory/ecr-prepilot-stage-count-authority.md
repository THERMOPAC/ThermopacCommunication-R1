---
name: ECR Pre-Pilot stage-count authority
description: Separates predictive execution stage-count authority from the downstream geometry resolver fallback.
---

The saved Stage 1 theoretical-stage count is the sole authority for current predictive execution. It means “solve exactly this N_T,” not “search all counts up to this maximum”; the run panel must not provide a second selector.

For the immutable Kühni geometry resolver only, use a valid Stage-2 calculated theoretical-stage result when one exists for the current Stage-1 snapshot. Otherwise use system-owned \(N_T=7\) with provenance `PRE_PILOT_DESIGN_DEFAULT` and explicit wording that Stage-2 calculated \(N_T\) was unavailable. A later valid Stage-2 result creates a new resolver run; it never mutates the fallback run.

**Why:** Predictive execution still needs one exact Stage-1 trial authority, while pre-pilot geometry work must remain calculable before Stage 2 establishes a valid \(N_T\). Explicit fallback provenance prevents the default from being misrepresented as thermodynamically solved.

**How to apply:** Predictive jobs copy the saved Stage-1 value into immutable `ntTest`. Resolver records and reports hash the actual \(N_T\), provenance, and Stage-2 lineage; never offer a second editable selector.