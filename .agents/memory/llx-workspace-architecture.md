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

## Master-data auto-population pattern (Aug 2026)
- Defaults live in `shared/` master modules (product-requirement-master.ts, fluid-properties-master.ts) — never hardcoded in the React component.
- Seeding is blank-only + guarded (seeded flags for Product Requirement rows; skip while a save is in flight) so deliberate removal / concurrent edits aren't overwritten.
- NMP density/viscosity come from the server EPD endpoint (`/api/design-software/epd/nmp?tc=`) at Operating Temperature; provisional (Assumed-point) results are source-tagged "Assumed", exact literature "Literature".
- Governance: never invent values — asphaltenes, RRBO dynamic viscosity, interfacial tension, mutual solubility stay manual with "Pending Validation" markers.

## Known pre-existing risks (flagged by review, NOT fixed — user decision pending)
- Section saves POST whole objects with no lock-version; concurrent editors can silently overwrite each other.
- Revision input routes check authentication only — no per-design authorization.

## Stage 4 (Process Design) — workspace → C2 engine adapter
- The C2 engine takes structured camelCase inputs; the workspace stores flat snake_case strings. The adapter lives in the service layer (`llx-process-design-input-mapper.ts`, hooked in runCalculation for llx/process_design only) and does ONLY structure + unit conversion (LPH→m³/h, vol-basis S/O ratio→mass basis via ρNMP(OT)/ρRRBO from EPD, margin%→maxCirculationFactor, efficiency%→fraction). Per-key pass-through: engine-ready keys always win.
- **Governance:** feedDensity is always mapped from the Fluid Properties RRBO density: an engineer-selected controlled source type passes verbatim; if no source type is selected, the mapper tags the auto-populated Thermopac Feed Master value as sourceType 'Assumed' with a sourceReference naming the master — the engine never receives an untagged or invented density.
- **UI rule:** when the latest process_design run is `error`, suppress the previous accepted result (results table keeps last success; showing it would present stale values as current).
- S/O ratio in the workspace is VOLUME basis (NMP vol / RRBO vol), default 1.5:1; engine ratio is mass basis — never conflate.

## Thermopac preliminary screening defaults (Stage 7)
- Rule: preliminary defaults live OUTSIDE the engines (dedicated defaults module + apply/clear route + assumptions-register sync); engines keep full validation and classify everything Pending Validation.
- **Why:** governance requires visible/editable/Assumed-tagged defaults, never hidden engine fallbacks.
- Rotor diameter must NOT be default-populated alongside rotor ratio — C5 enforces ±1 % consistency per swept diameter; supply ratio only and the engine derives the diameter.
- The input mapper spreads raw workspace inputs into `out`; any flat workspace key that collides with an engine record key (e.g. `hets`) must be rebuilt when the value is not an object.
- Workspace efficiency fields display % — defaults must be percent values (40/90), the mapper's pctToFraction converts.

## Packing designation vs physical size (Prasad review, 2026-08-06)
- "250" in Sulzer SMV/SMVP 250 is the nominal specific-surface-area grade (250 m²/m³), NOT a physical element size. Never store "250 mm".
- PackingRecord.size is now OPTIONAL in the registry — leave blank unless a vendor specifies an actual element dimension; never populate with a placeholder.
- Controlled citation: "Johannes Rauber, Sulzer Chemtech Ltd., Design Practice for Packed Liquid-Liquid Extraction Columns, AIChE 2006".

## PDF glyph safety (report framework)
- Helvetica base-14 fonts are WinAnsi-only: π, Greek letters, ≤, √, − render as garbage. renderReportPdf() deep-sanitizes the payload via NON_WINANSI_MAP transliteration (π→pi, ρ→rho, ≤→<=, …). Any new report content with math symbols outside WinAnsi must go through this renderer, not raw pdfkit text.

**Equipment Datasheet (EDS, 2026-08-07):** builder at server/design-reports/equipment-datasheet-report.ts renders ONLY the frozen mechanical_vessel result snapshot (`mechanicalDatasheet` object) + design inputs + active DS-SEL record. Blocking (error) gates: design code NOT_ASSIGNED, missing selected shell/head thickness, incomplete nozzle size/rating, mech inside diameter absent or ≠ effective DS-SEL diameter. Any accepted mechanical re-run that changes governing geometry auto-reconciles reports (same stale/regenerate path as DS-SEL-006) — detection compares prev vs new mechanicalDatasheet.geometry in runCalculation.
