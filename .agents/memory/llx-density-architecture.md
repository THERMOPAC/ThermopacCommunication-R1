---
name: LLX density architecture — EPD library, no user input
description: How NMP and RRBO SN300 densities are calculated in LLX; what changed and why; how to add other RRBO grades.
---

## Rule
NMP density and RRBO SN300 density are APPLICATION-CALCULATED from the EPD library.
No user-entered density fields exist in the LLX Fluid Properties workspace for these two fluids.
The **only** user input for the density-difference calculation is Extraction Temperature.

## How it works
1. `GET /api/design-software/epd/density-pair?tc=<T>&grade=<feedService>` — returns ρNMP(T), ρRRBO_grade(T), Δρ(T), densityTrace.
2. `server/engine-framework/epd/fluids/nmp.ts` — 6-point tabular-C density (25–70 °C), all Assumed.
3. `server/engine-framework/epd/fluids/rrbo-sn300.ts` — new library fluid; same 6-point tabular-C density.
4. `server/engine-framework/epd/database.ts` — registers rrboSn300 as a library fluid.
5. C2 engine (`llx-process-design-engine.ts` v1.2.0) calls `getProperty('rrbo-sn300', 'density', T)` and `getProperty('nmp', 'density', T)` directly — no project-fluid context, no feedDensity input.
6. Mapper (`llx-process-design-input-mapper.ts`) uses `getProperty('rrbo-sn300', 'density', ot)` for S/O mass-basis conversion and equipment mass-flow estimation.
7. UI displays ρNMP, ρRRBO SN300, Δρ as read-only in a "Phase Separation Density — Application Calculated" SectionCard in Fluid Properties (Step 3), driven by `densityPairQ` at operating temperature.

## Governed density dataset (Assumed, provisional) — all 4 RRBO grades + NMP

| T (°C) | NMP  | SN150 | SN200 | SN300 | SN500 |
|--------|------|-------|-------|-------|-------|
| 25     | 1028 | 864   | 875   | 878   | 885   |
| 30     | 1023 | 861   | 871   | 875   | 882   |
| 40     | 1015 | 854   | 865   | 869   | 875   |
| 50     | 1006 | 848   | 859   | 862   | 869   |
| 60     | 997  | 841   | 852   | 856   | 862   |
| 70     | 988  | 835   | 846   | 849   | 856   |

Δρ at 70°C: SN150=153, SN200=142, SN300=139, SN500=132 kg/m³.

## What was removed
- `feedDensity` input (user-entered RRBO density) from the mapper and C2 engine.
- `createPropertyContext` and project-fluid density registration in C2 engine.
- `rrbo_density` PropertyRow from RRBO SectionCard.
- `nmp_density` PropertyRow from NMP SectionCard.
- `RRBO_FEED_DENSITY_MASTER` and `RRBO_FEED_DENSITY_REF_TEMP` auto-seeding in the useEffect.
- Kinematic viscosity derived calc from `rrbo_density_value` (no longer available).

## Adding future RRBO grades
Create `server/engine-framework/epd/fluids/rrbo-<grade>.ts` with a governed tabular-C density dataset.
Register it in `database.ts`. Add to `RRBO_GRADE_FLUID_MAP`. The C2 engine uses the grade ID for `getProperty()`.
Grades without a library entry throw `EngineeringInputError` — the run blocks with "Not Calculable".

## Grade → fluid ID mapping (RRBO_GRADE_FLUID_MAP in database.ts)
Feed Service string (workspace) → EPD fluid ID:
- "Re-Refined Base Oil SN150" → "rrbo-sn150"
- "Re-Refined Base Oil SN200" → "rrbo-sn200"
- "Re-Refined Base Oil SN300" → "rrbo-sn300"
- "Re-Refined Base Oil SN500" → "rrbo-sn500"

Mapper reads `inputs.feed_service`, resolves to `rrboFluidId`, passes to engine as `inputs.rrboFluidId`.
Engine falls back to `rrbo-sn300` only for pre-existing runs where mapper hasn't run.

**Why:** Prevents silent cross-grade density substitution. Each grade must have its own governed data reviewed and admitted before use.

## Governance status
All 12 tabular points (6 NMP + 6 RRBO SN300) carry sourceType Assumed, source "Virgin Base oil – SN300".
EPD_ASSUMED_VALUE fires on every evaluation. Replace with controlled Literature/Vendor data before release-grade use.
