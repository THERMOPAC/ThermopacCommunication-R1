---
name: Stage 5 geometry definition boundary
description: Approved distinction between inherited hydraulic sizing, engineer-defined internals and preliminary drawing completeness.
---

Stage 5 defines preliminary Kühni geometry from current saved Stage-3 hydraulics and Stage-4 HETS sizing. It must not reselect upstream dimensions or reopen retired Job A/B/C research.

**Why:** The user approved an engineering-definition and drawing stage, not new hydraulic, mass-transfer or mechanical design calculations.

**How to apply:** Keep upstream values read-only. The user has superseded the manual-definition workflow: normal users must use Generate → Review → Save Revision → Export, with no geometry or construction inputs. Automatic generation must use a version-controlled ECR Pre-Pilot Geometry Rule Set. Before implementing defaults, classify every existing input as inherited, system-calculable, or requiring an approved default and expose available equations/data. Do not invent defaults or mistake a dimensional constraint for a unique sizing equation.

A dimensionally complete preliminary geometry is not proof that its construction reproduces the hydraulic correlation basis, and never establishes pressure-vessel, shaft, bearing/seal, drive or structural adequacy.

Frozen revisions must remain readable/exportable when current upstream authority becomes unavailable. Preserve original geometry and drawings, and flag outdated lineage instead of silently regenerating old revisions.

**Why:** The user explicitly requires retained source results, assumptions, unresolved items and revision history.

**How to apply:** Build views and exports from a single geometry dataset; use stored drawings for historical revisions. Keep geometry-definition completeness separate from mechanical calculations intentionally outside Stage 5, with the NOT FOR FABRICATION warning on all outputs.