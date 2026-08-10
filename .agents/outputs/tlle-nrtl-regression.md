# TLLE NRTL τ(T) Regression Record — 2026-08-10

## Scope
Regression of the governed temperature-dependent LLE model (`TLLE-NRTL-XYLENE-2026`, v1.0)
for the 5-pseudo-component NMP/RRBO surrogate system
(n-dodecane, 1,4-xylene, 1-methylnaphtalene, pyrene, NMP).

- Model form: NRTL (Renon & Prausnitz 1968), α = 0.2, τij(T) = bij/T (canonical form; bij = Δgij/R, K).
- Data: the 13 governed xylene-family tie-lines, Coto et al., Fluid Phase Equilibria 554 (2022) 113293, Table 3, 298.15 K. **No other data admitted; nothing invented.**
- Multi-temperature datasets (Fahim 2005, Fandary 2006, Aljimaz 2006) were NOT available in the workspace and were NOT admitted. The temperature dependence beyond 298.15 K is the τ(T)=b/T model form itself — honestly labelled uncalibrated.

## Method
1. Stage 1 — isoactivity fit (Nelder–Mead, multi-restart) on ln(γx·x) = ln(γy·y) across all 13 tie-lines (script `scripts/regress-tlle-nrtl.mjs`).
2. Stage 2 — flash-based composition refinement (script `scripts/refine-tlle-stage2.mjs`): two-phase LLE flash (successive substitution + Rachford–Rice) at each tie-line midpoint; objective = Σ(x̂−x)² + Σ(ŷ−y)²; Nelder–Mead steps 0.25 → 0.08. Final objective 4.635e-2 (from seed 8.22e-2 equivalent scale).

Final b-matrix (K) is recorded in `server/engine-framework/cel/llx-temperature-lle-model.ts` (`NRTL_B_K`).

## Reproduction gate result (298.15 K, gate 3·u(x) = 0.009)
| Tie-line | max \|Δx\| | within gate |
|---|---|---|
| 1 | 0.0920 | no |
| 2 | 0.0474 | no |
| 3 | 0.0660 | no |
| 4 | 0.0194 | no |
| 5 | 0.0133 | no |
| 6 | 0.0121 | no |
| 7 | 0.0205 | no |
| 8 | 0.0146 | no |
| 9 | 0.0165 | no |
| 10 | 0.0253 | no |
| 11 | 0.0079 | yes |
| 12 | 0.0283 | no |
| 13 | 0.0070 | yes |

**Verdict: gate NOT met** (2/13 within gate; max |Δx| = 0.092). Consistent with the source
paper's own model errors (Mod. UNIFAC-Do σ_K,paraffins ≈ 31 %). Consequence (governance):

- Within the calibrated range ([298.15, 298.15] K ± 0.5 K) the governed EXPERIMENTAL
  tie-lines are used directly — the model is never substituted for data.
- Outside the calibrated range the model generates a tie-line family at the user
  temperature, always classified **"Temperature Extrapolation — Preliminary / Pending
  Validation"** — never "temperature-corrected", never silent.
- Non-converged / trivial / non-finite flashes are dropped with the exact reason; <4
  usable tie-lines → fail closed ("Temperature-Dependent LLE Model — DEVELOPMENT GAP").

## Temperature-trend sanity check (physical plausibility only, NOT validation)
Model two-phase region shrinks monotonically with temperature (raffinate x1R at
representative anchors decreases; tie-line 1 goes single-phase by 358 K) — the correct
qualitative direction for NMP/hydrocarbon systems. This is a plausibility observation,
not evidence of quantitative accuracy.

## Path to Verified
Admit controlled multi-temperature experimental data (literature PDFs, vendor data, or
Thermopac measurements) to `TLLE_CALIBRATION_REGISTRY`, re-regress simultaneously, and
re-evaluate the reproduction gate + leave-one-temperature-out check. The calibrated
range auto-extends from the registry.
