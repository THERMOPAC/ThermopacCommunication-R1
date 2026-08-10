---
name: LLX temperature-dependent LLE (TLLE) governance
description: How the C2 extraction-temperature LLE model works — interpolation vs labelled extrapolation, calibration registry, reproduction-gate outcome.
---

## Rules
- User-selected Extraction Temperature is the governing LLE input; the engine NEVER fails closed solely on temperature (explicit user directive, 2026-08-10, superseding the original fail-closed plan).
- Within the calibrated range (computed from `TLLE_CALIBRATION_REGISTRY`, currently 298.15 K ± 0.5 K): governed EXPERIMENTAL Coto tie-lines used directly — the model never substitutes for data.
- Outside: NRTL τ(T)=b/T (α=0.2) generates a model tie-line family at user T (anchored ONLY on governed tie-line midpoints), fed to the unchanged cascade via `equilibriumBasis`; always classified "Temperature Extrapolation — Preliminary / Pending Validation" — never "temperature-corrected", never silent.
- Reproduction gate 3·u(x)=0.009 NOT met by the model (2/13 tie-lines, max |Δx|=0.092) — recorded honestly in `TLLE_REPRODUCTION_RECORD`, V&V rows PD-012-*, and `.agents/outputs/tlle-nrtl-regression.md`. Do not soften or hide this.
- <4 usable model tie-lines at T → fail closed with "Temperature-Dependent LLE Model — DEVELOPMENT GAP".
- Calibrated range auto-extends only by admitting controlled experimental datasets to the registry + re-regression. Multi-T papers (Fahim/Fandary/Aljimaz) were NOT available and NOT admitted.

**Why:** gate failure means extrapolated N_T is screening-grade only; mislabelling it validated would violate the V&V framework.

**How to apply:** any change to the C2 N_T path must preserve the interpolation/extrapolation labelling, the honest gate record, and the composition interpolation-only rule (non-finite/trivial flashes dropped with exact reasons; NaN guards in the cascade `g()`).
