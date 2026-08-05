# Stage C7 — Common Utilities & Consumption Engine (PLAN — awaiting approval)

**Engine:** `util-consumption` v1.0.0 — `server/engines/common/utilities-engine.ts`
**Registration:** `server/engines/common/index.ts` (already imported by `server/design-software-routes.ts` — verified live registration pattern from Stage C6).
**Workspace step served:** Step 10 — Utilities (follows Mechanical Design, Step 9 / Stage C6, in the approved 14-step workflow).

## 1. Position in the architecture

A **common downstream engine** — NOT ECP-specific, NOT ECR-specific. It consumes:

- a `UtilityBasisInput` snapshot referencing the selected technology run (C4 ECP or C5 ECR): column geometry (D, T/T), operating holdups where calculated, phase flow rates and densities;
- the C6 mechanical outputs where relevant (vessel volume for inventory/blanketing);
- engineer-entered utility conditions (all Tagged: `{value, unit, sourceType, sourceReference}`).

Vendor-neutral. No equipment selection, no vendor recommendations. Same governance as C1–C6:
- Any `sourceType==='Assumed'` ⇒ `pending_validation` + assumption register — via a **single complete tagged-input pre-pass before any result item is built** (C6 review lesson, now standing rule).
- Missing data ⇒ `Not Calculable` with a named reason code — never invented, never NaN.
- Classifications: `Calculated Screening Result` / `Pending Validation` / `Not Calculable`; run statuses `screening_complete` / `pending_validation` / `calculation_blocked`; `calculate()` self-gates on `validate()`; rich ResultItems throughout.

## 2. Scope — UTL-001 … UTL-007

| ID | Item | Method (screening only) |
|---|---|---|
| UTL-001 | Solvent inventory | Column inventory from adopted geometry × entered/adopted holdup fractions (continuous + dispersed); plus entered line/auxiliary-vessel inventories; total first-fill quantity (m³ and kg via entered density). |
| UTL-002 | Solvent makeup rate | Entered loss basis only (solubility loss in raffinate from C2 stream data where present, plus entered mechanical-loss allowance %/yr). No solubility correlations invented — entered or from project fluid data with citation. |
| UTL-003 | Thermal duties | Q = ṁ·cp·ΔT per entered heat/cool service (feed preheat, solvent trim, etc.). Streams from technology-run snapshot or entered; cp Tagged from fluid property system (exact-citation rule applies). Duty list + total heating and total cooling loads. |
| UTL-004 | Pumping power screening | Per entered pump service: hydraulic power P_h = ρ·g·Q·H/3.6e6 kW with **entered** differential head and **entered** efficiency; absorbed = P_h/η; motor rating = next value in an **entered motor rating series** (no IEC frame table hard-coded). ECR agitator motor rating adopted from the C5 run (never recomputed). |
| UTL-005 | Nitrogen / blanketing & instrument air | Blanketing demand from entered specific-consumption basis (e.g. Nm³/h per m³ vapor space, engineer-entered with source) × vapor space from C6 vessel volume − operating liquid volume; instrument air from entered per-consumer basis × entered consumer count. |
| UTL-006 | Electrical load summary | Σ motor ratings (pumps + agitator) with entered diversity/margin factors; connected vs. operating load. |
| UTL-007 | Utility summary table + checklist | Structured utility summary (per-utility rows: service, basis, normal, design, source) + 5-point checklist: inventory basis complete, thermal services defined, pump list complete, blanketing basis entered, assumptions acknowledged. |

## 3. Explicitly out of scope (architecture hooks reserved)
- Heat-exchanger sizing/rating (area, U, LMTD equipment design)
- Pump hydraulic/NPSH calculations and pump selection
- Steam/condensate system design; cooling-water network design
- Flare/vent sizing and relief load calculation (reserved placeholder like C6 `futureAnalyses`)
- Energy optimization / pinch analysis

## 4. Inputs (all Tagged unless structural)
Technology-run snapshot (source engine id/version/run ref — ECP and ECR equally accepted); holdup fractions (adopted or entered); line/vessel inventories; solvent density; loss allowances; per-service thermal streams (ṁ, cp, T_in, T_out); pump service list (Q, H, η per service); motor rating series (entered, strictly increasing); blanketing + instrument air bases; diversity/margin factors.

## 5. Test suite — `server/engine-framework/tests/c7-utilities.ts`
Groups: hand-calc benchmark (worked numbers asserted for every UTL item); blocked-input matrix; Assumed→pending propagation for every tagged input incl. nested series and per-service entries; Not Calculable paths (no motor series, no blanketing basis, missing cp); ECP vs ECR snapshot neutrality; agitator adoption (ECR) vs absent (ECP); strictly-increasing series enforcement; checklist true/false paths; concurrency isolation; no-NaN sweep. Regression: C2–C6 + Level 1 suites re-run.

## 6. Deliverables
Engine + registration, test suite, CORRELATION-REGISTER.md §12 (UTL-001…UTL-007), workflow restart verification, architect review round, closeout report with worked benchmark and remaining validation-input list.
