---
name: LLX Workspace Architecture
description: How the 14-step LLX engineering design workspace is structured — step keys, data persistence, technology-selection gating, validation logic.
---

# LLX Workspace Architecture

## Step keys (StepKey union)
design_identity | design_basis | fluid_properties | process_design | hydraulic_design | technology_selection | equipment_design | technology_comparison | mechanical_design | utilities | cost_estimation | design_validation | reports | revision_control

## Input persistence
- All form data lives in `localInputs[sectionKey]` (Record<string, string>)
- Populated from `GET /api/design-software/revisions/:id/inputs` on mount via useEffect
- Auto-saved on field blur via `upsertMutation` → `POST /api/design-software/revisions/:id/inputs` with `{ section, data }`
- `savingSection` state shows "Saving…" indicator in the section header

## Technology selection gating
- `techSelection = localData["technology_selection"]?.technology` → "ecp" | "ecr" | "both"
- `showECP = techSelection === "ecp" || techSelection === "both"`
- `showECR = techSelection === "ecr" || techSelection === "both"`
- Equipment Design (step 7) and Technology Comparison (step 8) are conditionally rendered

## Validation checklist (Step 12)
- Client-side checks against `localData` + `runsQ.data`
- `canSubmit` = no "fail" checks → gates "Submit for Review" button in Step 14
- Mandatory: design basis fields, technology selection, hydraulics run, flooding margin < 80%

## Lifecycle statuses (in order)
draft → under_review → checked → approved → issued_for_enquiry → issued_for_construction → superseded / archived

**Why:** `issued_for_construction` added per spec — sits between IFE and Superseded.
Server-side: `LIFECYCLE_TRANSITIONS` in `server/design-software-service.ts`

## Fluid property rows
PropertyRow component: value + unit + ref_temp + source (Measured/Vendor/Literature/Assumed)
Keys stored as `{propKey}_value`, `{propKey}_unit`, `{propKey}_ref_temp`, `{propKey}_source`
Amber highlight when source = "Assumed"

## Calculation types (engine keys)
process_design | hydraulics_common | ecp | ecr
Triggered via `POST /api/design-software/revisions/:id/calculate` with `{ calculationType }`
Results read from `GET /api/design-software/revisions/:id/runs`

## Section data keys → API section names
design_identity, design_basis, fluid_properties, process_design, hydraulic_design,
technology_selection, ecp_design, ecr_design, technology_comparison,
mechanical_design, utilities, cost_estimation
