---
name: ECR Pre-Pilot stage-count authority
description: Separates predictive execution stage-count authority from the downstream geometry resolver fallback.
---

The saved Stage 1 theoretical-stage count is the sole authority for current predictive execution. It means “solve exactly this N_T,” not “search all counts up to this maximum”; the run panel must not provide a second selector.

By explicit project-owner decision, Stage 3 Automatic Kühni Geometry always uses the named `STAGE3_GEOMETRY_DESIGN_NT=7` fixed pre-pilot geometry design basis, regardless of whether Stage 2 accepted Predictive \(N_T\) is 4, 7, 10, or unavailable. The actual accepted Stage-2 value remains separately persisted/reported as `STAGE2_ACCEPTED_PREDICTIVE_NT`; it is never relabelled as 7 and remains the scientific authority for Stage-2 work.

**Why:** Predictive execution still needs one exact Stage-1 trial authority, while pre-pilot geometry and the downstream Stage-4 physical HETS screening are fixed design-basis calculations rather than thermodynamically solved stage-count selections. The project owner explicitly extended the fixed `N_T=7` basis to Stage 4 for both NMP-continuous/RRBO-dispersed and RRBO-continuous/NMP-dispersed orientations. Explicit dual provenance prevents that physical-sizing basis from being misrepresented as the accepted scientific Stage-2 \(N_T\).

**How to apply:** Predictive jobs copy the saved Stage-1 value into immutable `ntTest`. New resolver records and reports hash `STAGE3_GEOMETRY_DESIGN_NT=7`, its fixed-basis label, and the separate accepted Stage-2 value/lineage when available; historical resolver versions replay unchanged. Stage 4 hashes and labels its own fixed `Ndesign=7` HETS physical-sizing basis, while exposing actual accepted Stage-2 \(N_T\) only as a nullable reference. Absence of that reference does not block the assumption-based Stage-4 HETS calculation; it does not weaken Stage-2 acceptance when Stage-2 evidence is present.