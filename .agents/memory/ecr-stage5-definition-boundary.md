---
name: Stage 5 geometry definition boundary
description: Approved distinction between inherited hydraulic sizing, engineer-defined internals and preliminary drawing completeness.
---

Stage 5 defines preliminary Kühni geometry from current saved Stage-3 hydraulics and Stage-4 HETS sizing. It must not reselect upstream dimensions or reopen retired Job A/B/C research.

**Why:** The user approved an engineering-definition and drawing stage, not new hydraulic, mass-transfer or mechanical design calculations.

**How to apply:** Keep upstream values read-only. The user has superseded the manual-definition workflow: normal users must use Generate → Review → Save Revision → Export, with no geometry or construction inputs. Automatic generation must use a version-controlled ECR Pre-Pilot Geometry Rule Set. Before implementing defaults, classify every existing input as inherited, system-calculable, or requiring an approved default and expose available equations/data. Do not invent defaults or mistake a dimensional constraint for a unique sizing equation.

A dimensionally complete preliminary geometry is not proof that its construction reproduces the hydraulic correlation basis, and never establishes pressure-vessel, shaft, bearing/seal, drive or structural adequacy.

The initial controlled rule set is named `ECR_KUHNI_PREPILOT_GEOMETRY_RULESET_R1`. Establish rotor/stator/compartment construction evidence before coding automatic defaults. Missing or inapplicable rules must produce a SYSTEM RULE-SET DEFICIENCY, not a normal-user geometry prompt.

**Why:** The user explicitly confirmed this engineering-first sequence and zero-input generation boundary in the subsequent specification.

**How to apply:** Reconcile the upstream free-area definition with the generated opening geometry, and explicitly justify the terminal-stator convention. Do not promote a single experimental apparatus dimension or an optimizer search-grid option into a general construction standard.

Frozen revisions must remain readable/exportable when current upstream authority becomes unavailable. Preserve original geometry and drawings, and flag outdated lineage instead of silently regenerating old revisions.

**Why:** The user explicitly requires retained source results, assumptions, unresolved items and revision history.

**How to apply:** Build views and exports from a single geometry dataset; use stored drawings for historical revisions. Keep geometry-definition completeness separate from mechanical calculations intentionally outside Stage 5, with the NOT FOR FABRICATION warning on all outputs.

Drawing-only improvements may expose an explicitly versioned new presentation of saved geometry, without replacing the original historical SVGs or altering the geometry snapshot.

**Why:** The user requested dimensioned downloadable sheets while explicitly forbidding changes to the immutable R1 dataset. Presentation revision and scientific revision must remain distinct.

**How to apply:** Preserve original export access, hash-check saved geometry before and after rendering, and distinguish fixture verification downloads from actual user-design exports.

The approved double-entry shrouded turbine and perforated stator must be integrated into newly generated Stage-5 assemblies. Existing R1/R2 single-opening geometry remains historical authority for its saved revisions.

**Why:** On 2026-09-20 the user approved the component basis and later identified its absence from the software exports as an integration defect. Updating only Stage-4 count/height left the old internals in new drawings. Integration must produce a new revision, not overwrite historical artifacts or imply fabrication qualification.

**How to apply:** The user accepted the completed Stage-3 audit; keep it frozen unless a direct calculation inconsistency is found. Do not substitute discussion values for persisted RPM/flow. Retain gross centre-plus-hole free area separately from shaft/support-corrected diagnostics. Distinguish upper/lower eye-face open areas, internal geometric section areas and unproven hydraulic controlling throats. An area minimum in a radial-turn region is not automatically a series-flow restriction.

The approved component basis retains the nominal 130-mm eye and defines the 112-mm stator centre from a 9-mm radial overlap. The previous 95%-of-turning-area sizing screen is rejected, not an optional successor sizing rule.

**Why:** The user explicitly selected geometric overlap as the preliminary design basis, accepted the shrouded six-blade architecture, excluded external mixing-section geometry, and subsequently approved the final component dimensions.

**How to apply:** Freeze the approved component dimensions; change them only if actual assembly interference is demonstrated. New assemblies inherit the current Stage-4 calculated count and active height, never a component-template count. The original reconciliation remains historical. Verify every drawing and CAD data export includes holes and shrouds, while retaining assembly-interface and mechanical qualification holds.