---
name: ECR Pre-Pilot stage-count authority
description: Separates predictive execution stage-count authority from the downstream geometry resolver fallback.
---

The saved Stage 1 theoretical-stage count is the sole authority for current predictive execution. It means “solve exactly this N_T,” not “search all counts up to this maximum”; the run panel must not provide a second selector.

By explicit project-owner decision, Stage 3 Automatic Kühni Geometry always uses the named `STAGE3_GEOMETRY_DESIGN_NT=7` fixed pre-pilot geometry design basis, regardless of whether Stage 2 accepted Predictive \(N_T\) is 4, 7, 10, or unavailable. The actual accepted Stage-2 value remains separately persisted/reported as `STAGE2_ACCEPTED_PREDICTIVE_NT`; it is never relabelled as 7 and remains the scientific authority for Stage-2/Stage-4 work.

**Why:** Predictive execution still needs one exact Stage-1 trial authority, while pre-pilot geometry is a fixed design-basis screening calculation rather than a thermodynamically solved stage-count selection. Explicit dual provenance prevents the geometry basis from being misrepresented as the accepted scientific \(N_T\).

**How to apply:** Predictive jobs copy the saved Stage-1 value into immutable `ntTest`. New resolver records and reports hash `STAGE3_GEOMETRY_DESIGN_NT=7`, its fixed-basis label, and the separate accepted Stage-2 value/lineage when available; historical resolver versions replay unchanged. Stage 4 continues to consume the separate accepted Stage-2 authority and never the fixed geometry basis.