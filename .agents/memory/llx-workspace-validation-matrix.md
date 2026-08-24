---
name: LLX workspace validation matrix
description: Stages 5–11 blocking/warning validation rules, UI banner architecture, and mapper source-type pass-through.
---

## Architecture

- `validateStage(key)` in the workspace page returns `{errors, warnings}` per stage key.
- Stages 1–4 were already handled; Stages 5–11 were added in this session.
- `stageBanner(key, label?)` is a shared helper function (declared after `stageStatus`) that reads `stageValidationErrors[key]` / `stageValidationWarnings[key]` and renders the red/amber banner pattern. Call it at the top of each stage's JSX return.
- Stage 12 (`validationChecks` array) calls `validateStage()` inline to aggregate blocking counts for the design-validation checklist.

## Stage 5 (hydraulic_design) — blocking rules
- SSA (`packing_specific_surface_value`): required; if entered → source type (`packing_specific_surface_source_type`) + source ref (`packing_specific_surface_source_ref`) both required.
- Corrugation angle (`packing_corrugation_angle_value`): required; if entered → source ref (`packing_corrugation_angle_source_ref`) required.
- d32_terminal model: `sauter_mean_d32` > 0 required; if entered → `sauter_mean_d32_source` + `sauter_mean_d32_source_ref` required.
- characteristic_velocity model: `characteristic_velocity` > 0 required; `hindrance_exponent` > 0 required; if entered → `hindrance_exponent_source` + `hindrance_exponent_source_ref` required.
- Advisory warning: SSA 300/350/400/450 with no `vendor_dp_value` → "no governed cf dataset" warning.
- New UI fields added: d32 source type select + source ref FieldRow; hindrance exponent source type select + source ref FieldRow.

## Stage 6 (technology_selection) — blocking
- `technology` required; `technology_selection_rationale` required (non-blank, new textarea field added to UI).

## Stage 7 (equipment_design) — blocking
- ECP: `packing_id` (ecp_design), HETS > 0 + source type + source ref, all 8 height allowances.
- ECR: rotor_diameter OR rotor_ratio; rotor_speed XOR rotor_speed_range; power_number, compartment_height; compartment_efficiency > 0 + source type + source ref; shaft_efficiency, mechanical_design_margin, drive_seal_bearing_allowance; 6 height allowances.
- If Stage 4 owns an auto-calculated Nₜ and its Process Design inputs are newer than the accepted result, disable Calculate ECR and show the direct Stage 4 Material Balance refresh action. The server must keep the same stale-Nₜ guard.

**Why:** Equipment Design must never reuse a stale governed theoretical-stage count, but a generic calculation error hides the prerequisite and makes the correct recovery path unclear.

## Stage 8 (technology_comparison) — blocking only when techSelection === "both"
- Technology selected; ECP run executed (if ECP); ECR run executed (if ECR).

## Stage 9 (mechanical_design) — blocking
- `design_code` required (non-blank).

## Stage 10 (utilities) — advisory warnings only
- Missing utility fields (thermal_oil_duty, cw_duty, cw_flow, steam_requirement, electrical_load, nitrogen_requirement) → warning message.

## Stage 11 (cost_estimation) — blocking
- `base_year` integer ≥ 2000; `escalation_factor` > 0; `contingency_percent` 0–100.
- Advisory: base year > 2 years from current + factor ≈ 1.0 → escalation warning.

## Mapper (server/llx-process-design-input-mapper.ts) source pass-through
- `sauter_mean_d32_source` / `sauter_mean_d32_source_ref` → `sauterMeanDiameter.sourceType/sourceReference` (previously hardcoded 'Assumed').
- `hindrance_exponent_source` / `hindrance_exponent_source_ref` → `hindranceExponent.sourceType/sourceReference` on characteristic-velocity path.
- Both fall back to 'Assumed' / screening ref if blank.

**Why:** Source traceability is a governed requirement (A-5); hardcoding 'Assumed' prevented engineers from promoting d32 to 'Measured' or 'Vendor' when laboratory/vendor data became available.

## ECR-2 Stage 8 — actual dependency graph

- Never use the legacy `molecularWeights`, `d32Config`, or `bvp` JSON blobs as Stage 8 blockers. They are compatibility/audit input only; Stage 8 is expressed as independent, source-tagged engineering fields.
- Four physical RRBO MWs (Sat, Mono, Di, Poly) remain blocking inputs, but only for downstream physical concentration, equilibrium concentration, concentration-based Kd, driving-force, and transfer-rate calculations. They must never affect local NRTL x/y/z or equilibrium coordinates, which use canonical Coto surrogate MWs.
- Blank d32 selection means the governed ECR-2 published-correlation route, not a missing numeric default. An engineer-supplied route requires numeric d32 plus source class/reference.
- The ten Dc/Dd diffusivities require individual value, source class/reference, reference temperature, and method; there is no approved correlation/default. Kühni Shd C2 remains an individual source-tagged engineer input. Partition approval concerns the concentration-basis relation only; numerical Kd stays locally calculated.

**Why:** The raw BVP JSON contract predated the thermodynamic MW boundary and conflated independent numerical/governance decisions, which hid exactly what prevented a simulator run.

**How to apply:** Keep the Run control gated only by accepted Stage 7 geometry plus the unresolved individual dependencies above. Preserve legacy JSON parsing in the adapter for older revisions, but always prefer structured fields and governed calculated routes.
