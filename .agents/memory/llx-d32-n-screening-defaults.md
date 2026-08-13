---
name: LLX d32 / n screening defaults
description: d32 = 3 mm and n = 1 are pre-populated in the UI at first load — no mapper fallbacks.
---

## Rule
d32 = 3 mm (Assumed) and n = 1 (Assumed) are seeded into the `hydraulic_design` section at
hydration time by a `useEffect` in `design-software-workspace-page.tsx`. Values are stored
explicitly in the workspace and tagged with the reference string
`"Thermopac Preliminary Screening Default — d₃₂ = 3 mm (Assumed / Preliminary / Pending Validation)"`
and `"Thermopac Preliminary Screening Default — n = 1 (Assumed / Preliminary / Pending Validation)"`.

## Scope
- d32: seeded whenever the field is blank (applies in d32_terminal mode; stored but ignored in characteristic_velocity mode).
- n: seeded **only** when `hydraulic_model` is `"d32_terminal"` or unset. In `characteristic_velocity` mode n has no screening default — engineer must supply a measured/literature value.

## Mapper
`llx-process-design-input-mapper.ts` has **no fallback** for either d32 or n.
If the workspace field is absent, the engine blocks (fail-closed) for both parameters and both modes.
The old `blank n → n = 1` fallback block was removed entirely.

## Status label detection
The UI status line distinguishes "screening default" from "engineer-entered" by comparing the stored
`source_ref` string against the exact sentinel value above (not by checking whether the numeric value equals 3 or 1).

**Why:** The n ≈ 2–5 literature-range statement was removed as unverified for the NMP/RRBO system.
Defaults must be visible and engineer-overridable; hidden mapper fallbacks were a governance risk.
