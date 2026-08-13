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
