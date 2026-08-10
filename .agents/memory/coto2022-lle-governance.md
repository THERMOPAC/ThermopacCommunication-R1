---
name: Coto 2022 LLE dataset governance
description: Rules for using Coto et al. 2022 tie-lines in LLX C2 N_T derivation
---
Governed transcription + analysis: `.agents/outputs/coto2022-governed-tielines.md`.

**Rules:**
- Table 3 tie-lines are valid equilibrium data. Full re-verification (2026-08-10): r
  (mol/mol) is itself internally consistent — the Section 2.2 g/g series (0.25–3.0)
  converts to exactly the printed r values. The inconsistency is between Table 2 feeds
  (mass %) and Table 3 phases: aromatic bracket test fails for 12/17 rows; closure
  residuals up to 52×u(x); no basis reinterpretation (mol%, g/g) closes. Never use r or
  feed-family assignments quantitatively; interpolate on x1R (intrinsic coordinate).
- Table 3 has exactly 17 rows (13 xylene + 4 toluene); nominal r per row verified
  verbatim (no r=3.4 exists; x1R=0.857→2.2, 0.877→3.0). Earlier notes had wrong r
  labels and one phantom xylene r=4.2 row — corrected in the governed dataset file.
- User approved Option (a): auto-calc N_T inside envelope, fail closed outside naming
  the exact limit; N_T=6 only as explicit "Engineer Override — Assumed/Pending
  Validation", never auto-calculated.
- Constant Ki and constant F/S both disproved by the data (Ki spans up to 4.2×;
  mutual solubility: NMP in raffinate 5–16 mol%, oil in extract 27–65 mol%).
  Stage calc must use variable-flow envelope balances.
- Composition envelope is narrow: raffinate aromatics 0.062–0.226 mole fraction;
  within it only ~1–2 theoretical stages are computable; deeper separations and the
  actual RRBO design case require extrapolation → fail-closed
  ("Outside Experimental Composition Range — Pending Validation").
- Temperature governance (revised by engineering direction 2026-08-10): off-298.15 K design does NOT fail closed — tie-lines used AS-IS (never T-corrected/extrapolated) and result downgraded to "Preliminary / Outside Experimental Temperature Range / Pending RRBO-NMP Validation" with exact user-facing statement. Composition violations and missing inputs still fail closed.
- Stage efficiency is informational-only and never defaulted (the old 60 % seed and ceil(NT/eff) "physical stages" are removed); governing packed height is H_active = N_T × HETS only.
- Total Aromatics wt % is an editable engineer field (UI blank-only default 2.7, never hard-coded server-side); engine cross-checks it vs mono+di+poly within ±0.5 wt % and fails closed on mismatch.
  Mod. UNIFAC Dortmund extrapolation rejected (σ_K,par ≈ 31% at calibration T).
**Why:** governance forbids invented data/extrapolation; N_T = 6 stays
"Assumed — Pending Validation" unless in-range data (T AND composition) is sourced.

## Implementation governance (final, in production code)
- Governed dataset + N_T cascade live in the CEL as Controlled Literature (Duss-2013 pattern); C2 engine consumes it.
- Residuals are a GATE, not a footnote: every non-closing component ≤ 3·u(x) = 0.009 mole fraction and total-flow ≤ 1 % of implied feed, else fail closed ("Multicomponent Balance Closure Outside Tolerance — Pending Validation"). Envelope supports ~1–2 computable stages only — most real cases fail closed by design.
- N_T = 6 is NEVER seeded or defaulted anywhere; the workspace theoretical-stages field is the Engineer Override, applied only when auto-calc fails closed, always labelled "Engineer Override — Assumed / Pending Validation".
- ECP/ECR adopt an auto-calculated N_T from the accepted C2 result only if the result is fresher than the C2 inputs; stale → hard error demanding a C2 re-run (no silent fallback to the override).
- Temperature limit wording is exact and reported even when other governed inputs are missing (design T is always known).
