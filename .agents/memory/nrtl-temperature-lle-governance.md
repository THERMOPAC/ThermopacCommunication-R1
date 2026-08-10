---
name: NRTL temperature-dependent LLE model governance
description: Governed NRTL τ(T) model for LLX N_T at off-298.15 K temperatures — validation gate, DEVELOPMENT GAP status, regression provenance rules
---

## Rule
The temperature-dependent LLE model (NRTL, τij = aij + bij/T, α = 0.2 fixed) may govern N_T ONLY when its regression artifact (`cel/data/nrtl-params-v1.json`) has `validation.admitted = true`. The artifact is produced solely by the offline script `cel/regression/regress-nrtl-nmp.ts` — never hand-edited, never regenerated at runtime.

**Current status (2026-08-10): NOT admitted.** Best hierarchical fit reproduces the Coto 2022 anchor at flash RMSD ≈ 0.017–0.019 vs the governed gate 3·u(x) = 0.009 — a genuine representability limit of the 5-pseudo-component lumping against Coto's replicate scatter, not under-convergence (extended optimization budget moved RMSD only 0.0186 → 0.0175). Exact gap label: **"Temperature-Dependent LLE Model — DEVELOPMENT GAP"**. This failure is the approved honest outcome; do NOT widen the gate, smooth the data, or present the model as admitted.

## Validation gate (all three required)
1. Flash-reproduce all 17 Coto tie-lines at 298.15 K, RMSD ≤ 0.009, no single-phase collapse.
2. Leave-one-temperature-out on the multi-T literature sets (Fahim 2005 / Fandary 2006 / Aljimaz 2006, 289–328 K, 219 tie-lines in `cel/data/multi-t-nmp-lle.json`), RMSD ≤ 3·max u per left-out group.
3. K_MONO temperature-trend sign must match experiment per dataset.

## Regression architecture (approved, hierarchical Coto-anchored)
- Stage A: τ(298.15 K) fitted on Coto alone (isoactivity pre-fit + direct flash-composition polish) so the anchor is never distorted by species lumping.
- Stage B: shared slopes b for SAT/MONO/NMP pairs from the multi-T literature with per-dataset nuisance offsets (offsets are NOT part of the governed model). DI/POLY slopes bij ≡ 0 (bounded assumption — no multi-T polyaromatic data).
- A single simultaneous fit across all datasets was tried first and is much worse (Coto RMSD 0.11) — the class-lumping conflict between datasets dominates; keep the hierarchical form.

## Engine behavior (llx-process-design-engine)
- 298.15 K (±0.5 K): Coto tie-lines govern (unchanged path).
- Off-anchor T with admitted model in envelope: NRTL flash generates the tie-line table AT T (never tie-line scaling), same variable-flow cascade via `computeGovernedTheoreticalStages(input, injected)` (injectable tie-line set; Coto is default). Result classified Pending Validation (polyaromatic bounded assumption).
- Off-anchor T otherwise: NrtlModelError → `temperatureModelGap` recorded + NT_TEMPERATURE_MODEL_GAP warning, and existing Coto-as-is "Preliminary — Pending RRBO/NMP Validation" behavior applies. Fail-closed only for envelope/input violations, never for temperature alone.

**Why:** user-approved governance requires interpolation-only, no extrapolation, no efficiency defaults; an unadmitted model must surface as a DEVELOPMENT GAP, never silently fall back without trace.
**How to apply:** any future model rework must re-run the regression script and pass the unchanged gate; to admit a model, add real multi-temperature RRBO/NMP (or polyaromatic) tie-line data to the calibration set — do not tune tolerances.
